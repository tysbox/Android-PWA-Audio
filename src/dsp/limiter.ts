/**
 * Biscene V6.5 True Peak Limiter (TypeScript Port).
 * 4x Oversampling FIR + 1ms Lookahead + Soft Clamp.
 * Ported from android/app/src/main/cpp/dsp/TruePeakLimiter.h/.cpp
 */

export interface LimiterConfig {
  enabled: boolean;
  // Fixed parameters:
  // threshold: 0.98
  // knee: 0.02
  // lookahead: 1ms
  // attack: 0.1ms (fast for safety)
  // release: 200ms (musical)
  // FIR: 24 taps, Blackman-Harris windowed sinc
  // Soft clamp: ±2.0 linear, tanh saturation beyond (asymptote ±2.5)
}

const FIR_TAPS = 24;
const OVERSAMPLE = 4;

/**
 * 4x Oversampling True Peak Limiter
 * - FIR polyphase interpolation (24 taps, Blackman-Harris)
 * - 1ms lookahead delay line
 * - Soft clamp on detector input (V6.5 G2)
 * - Attack 0.1ms / Release 200ms
 */
export class TruePeakLimiter {
  private sampleRate: number;
  private lookaheadSamples: number = 0;
  private delayL: Float32Array = new Float32Array(0);
  private delayR: Float32Array = new Float32Array(0);
  private writeIdx: number = 0;

  // FIR polyphase coefficients [4][24]
  private fir: number[][] = [];
  private histL: number[] = new Array(FIR_TAPS).fill(0);
  private histR: number[] = new Array(FIR_TAPS).fill(0);

  private currentGain: number = 1;
  private attackStep: number = 0;
  private releaseStep: number = 0;

  private enabled: boolean = true;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.init();
  }

  setSampleRate(rate: number): void {
    if (rate === this.sampleRate) return;
    this.sampleRate = rate;
    this.init();
  }

  private init(): void {
    this.lookaheadSamples = Math.max(1, Math.floor(this.sampleRate * 0.001)); // 1ms
    this.delayL = new Float32Array(this.lookaheadSamples + 1);
    this.delayR = new Float32Array(this.lookaheadSamples + 1);
    this.writeIdx = 0;
    this.delayL.fill(0);
    this.delayR.fill(0);

    // Build FIR coefficients (4 phases x 24 taps)
    this.fir = [];
    for (let p = 0; p < OVERSAMPLE; p++) {
      this.fir[p] = new Array(FIR_TAPS);
      for (let i = 0; i < FIR_TAPS; i++) {
        const t = (i - (FIR_TAPS - 1) / 2) + p / OVERSAMPLE;
        if (Math.abs(t) < 1e-6) {
          this.fir[p][i] = 1;
        } else {
          const x = Math.PI * t;
          // Blackman-Harris window
          const win = 0.35875 - 0.48829 * Math.cos(2 * Math.PI * i / (FIR_TAPS - 1))
            + 0.14128 * Math.cos(4 * Math.PI * i / (FIR_TAPS - 1))
            - 0.01168 * Math.cos(6 * Math.PI * i / (FIR_TAPS - 1));
          this.fir[p][i] = (Math.sin(x) / x) * win;
        }
      }
    }

    this.histL.fill(0);
    this.histR.fill(0);
    this.currentGain = 1;

    // Attack 0.1ms, Release 200ms
    this.attackStep = 1 / (this.sampleRate * 0.0001);
    this.releaseStep = 1 / (this.sampleRate * 0.2);
  }

  reset(): void {
    this.delayL.fill(0);
    this.delayR.fill(0);
    this.histL.fill(0);
    this.histR.fill(0);
    this.writeIdx = 0;
    this.currentGain = 1;
  }

  setEnabled(en: boolean): void {
    this.enabled = en;
  }

  /** V6.5 G2: Soft clamp on detector input */
  private softClamp(x: number): number {
    if (x > 2.0) return 2.0 + 0.5 * Math.tanh((x - 2.0) * 2.0);
    if (x < -2.0) return -2.0 - 0.5 * Math.tanh((-x - 2.0) * 2.0);
    return x;
  }

  /** Detect true peak via 4x oversampling FIR */
  private detectTruePeak(sL: number, sR: number): number {
    // Shift history
    for (let i = FIR_TAPS - 1; i > 0; i--) {
      this.histL[i] = this.histL[i - 1];
      this.histR[i] = this.histR[i - 1];
    }
    this.histL[0] = sL;
    this.histR[0] = sR;

    let maxP = 0;
    for (let p = 0; p < OVERSAMPLE; p++) {
      let iL = 0, iR = 0;
      for (let i = 0; i < FIR_TAPS; i++) {
        iL += this.histL[i] * this.fir[p][i];
        iR += this.histR[i] * this.fir[p][i];
      }
      maxP = Math.max(maxP, Math.abs(iL), Math.abs(iR));
    }
    return maxP;
  }

  /** Process stereo block in-place */
  process(buffer: Float32Array, frames: number): void {
    if (!this.enabled) return;

    const threshold = 0.98;
    const knee = 0.02;

    for (let i = 0; i < frames; i++) {
      const idx = i * 2;

      // 0. Soft clamp input (bounds detector, prevents internal explosion)
      let inL = this.softClamp(buffer[idx]);
      let inR = this.softClamp(buffer[idx + 1]);
      if (!isFinite(inL)) inL = 0;
      if (!isFinite(inR)) inR = 0;

      // 1. True peak detection
      const tp = this.detectTruePeak(inL, inR);

      // 2. Compute target gain
      let targetGain = 1;
      if (tp > threshold - knee) {
        if (tp > threshold + knee) {
          targetGain = threshold / tp;
        } else {
          const x = (tp - (threshold - knee)) / (2 * knee);
          targetGain = 1 - (1 - threshold / (threshold + knee)) * x * x;
        }
      }

      // 3. Attack/Release smoothing
      if (this.currentGain > targetGain) {
        this.currentGain = Math.max(targetGain, this.currentGain - this.attackStep);
      } else {
        this.currentGain = Math.min(1, this.currentGain + this.releaseStep);
      }

      // 4. Circular delay line (lookahead)
      const readIdx = (this.writeIdx + 1) % (this.lookaheadSamples + 1);
      buffer[idx] = this.delayL[readIdx] * this.currentGain;
      buffer[idx + 1] = this.delayR[readIdx] * this.currentGain;

      this.delayL[this.writeIdx] = inL;
      this.delayR[this.writeIdx] = inR;
      this.writeIdx = (this.writeIdx + 1) % (this.lookaheadSamples + 1);

      // 5. Final sanity clamp
      if (!isFinite(buffer[idx])) buffer[idx] = 0;
      if (!isFinite(buffer[idx + 1])) buffer[idx + 1] = 0;
    }
  }
}