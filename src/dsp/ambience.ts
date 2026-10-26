/**
 * Biscene V4 Ambience / Reverb (TypeScript Port).
 * Stereo IR Convolution (1024 taps, onset detection, energy normalization)
 * + Diffuse Tail (4 comb filters + 2 allpass, Schroeder-style).
 * Ported from android/app/src/main/cpp/NativeAudioEngine.cpp (ambience section)
 */

// (No biquad usage: ambience uses raw IR convolution + Schroeder tail.)

export interface AmbienceConfig {
  enabled: boolean;
  irLeft: Float32Array | null;
  irRight: Float32Array | null;
  intensity: number;   // 0-1 (wet/dry mix)
  decaySec: number;    // RT60 in seconds (0.2-5.0)
}

const TAIL_COMBS = 4;
const TAIL_APS = 2;
const MAX_TAPS = 1024;

/**
 * Diffuse tail network (Schroeder-style reverb tail)
 * 4 comb filters + 2 allpass filters
 */
class DiffuseTail {
  private sampleRate: number;
  private active: boolean = false;

  // Comb filters
  private combL: Float32Array[] = [];
  private combR: Float32Array[] = [];
  private combLen: number[] = [0, 0, 0, 0];
  private combPos: number[] = [0, 0, 0, 0];
  private combLpL: number[] = [0, 0, 0, 0];
  private combLpR: number[] = [0, 0, 0, 0];
  private combFb: number[] = [0.8, 0.8, 0.8, 0.8];

  // Allpass filters
  private apL: Float32Array[] = [];
  private apR: Float32Array[] = [];
  private apLen: number[] = [0, 0];
  private apPos: number[] = [0, 0];

  private damp: number = 0.35;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /** Build tail buffers for given RT60 */
  build(rt60: number): void {
    const clampedRt60 = Math.max(0.2, Math.min(5.0, rt60));

    // Comb delays in ms (prime-ish for diffusion)
    const combMs = [25.3, 29.7, 33.9, 37.7];
    for (let c = 0; c < TAIL_COMBS; c++) {
      const len = Math.max(96, Math.floor(this.sampleRate * combMs[c] / 1000));
      this.combLen[c] = len;
      this.combL[c] = new Float32Array(len);
      this.combR[c] = new Float32Array(len);
      this.combPos[c] = 0;
      this.combLpL[c] = 0;
      this.combLpR[c] = 0;

      const dt = len / this.sampleRate;
      this.combFb[c] = Math.pow(10, -3 * dt / clampedRt60); // RT60-matched decay
    }

    // Allpass delays
    const apMs = [5.2, 1.9];
    for (let a = 0; a < TAIL_APS; a++) {
      const len = Math.max(32, Math.floor(this.sampleRate * apMs[a] / 1000));
      this.apLen[a] = len;
      this.apL[a] = new Float32Array(len);
      this.apR[a] = new Float32Array(len);
      this.apPos[a] = 0;
    }

    this.active = true;
  }

  /** Retune decay without reallocation */
  retune(rt60: number): void {
    const clampedRt60 = Math.max(0.2, Math.min(5.0, rt60));
    for (let c = 0; c < TAIL_COMBS; c++) {
      const dt = this.combLen[c] / this.sampleRate;
      this.combFb[c] = Math.pow(10, -3 * dt / clampedRt60);
    }
  }

  /** Process one stereo frame through tail, return wet output */
  process(convL: number, convR: number): { wetL: number; wetR: number } {
    if (!this.active) return { wetL: 0, wetR: 0 };

    let tL = 0;
    let tR = 0;

    // 4 comb filters
    for (let c = 0; c < TAIL_COMBS; c++) {
      const idx = this.combPos[c];
      const dL = this.combL[c][idx];
      const dR = this.combR[c][idx];

      tL += dL;
      tR += dR;

      // Lowpass feedback for damping
      this.combLpL[c] = dL + this.damp * (this.combLpL[c] - dL);
      this.combLpR[c] = dR + this.damp * (this.combLpR[c] - dR);

      // V4.6.1: runaway-tail fix - feed at 30% and hard-clamp
      let tailInL = convL * 0.3 + this.combLpL[c] * this.combFb[c];
      let tailInR = convR * 0.3 + this.combLpR[c] * this.combFb[c];

      if (tailInL > 1.5) tailInL = 1.5;
      else if (tailInL < -1.5) tailInL = -1.5;
      if (tailInR > 1.5) tailInR = 1.5;
      else if (tailInR < -1.5) tailInR = -1.5;

      this.combL[c][idx] = tailInL;
      this.combR[c][idx] = tailInR;

      this.combPos[c]++;
      if (this.combPos[c] >= this.combLen[c]) this.combPos[c] = 0;
    }

    tL *= 0.25;
    tR *= 0.25;

    // 2 allpass filters
    for (let a = 0; a < TAIL_APS; a++) {
      const idx = this.apPos[a];
      const dLa = this.apL[a][idx];
      const dRa = this.apR[a][idx];

      const oL = dLa - tL;
      const oR = dRa - tR;

      this.apL[a][idx] = tL + dLa * 0.5;
      this.apR[a][idx] = tR + dRa * 0.5;

      tL = oL;
      tR = oR;

      this.apPos[a]++;
      if (this.apPos[a] >= this.apLen[a]) this.apPos[a] = 0;
    }

    // Final wet mix: early*0.7 + tail*0.85 (matches C++)
    return { wetL: tL * 0.85, wetR: tR * 0.85 };
  }

  clear(): void {
    for (let c = 0; c < TAIL_COMBS; c++) {
      this.combL[c].fill(0);
      this.combR[c].fill(0);
      this.combPos[c] = 0;
      this.combLpL[c] = 0;
      this.combLpR[c] = 0;
    }
    for (let a = 0; a < TAIL_APS; a++) {
      this.apL[a].fill(0);
      this.apR[a].fill(0);
      this.apPos[a] = 0;
    }
    this.active = false;
  }
}

/**
 * Main Ambience Processor
 * - Early reflections: stereo IR convolution (1024 taps max)
 * - Late reverb: DiffuseTail
 * - Onset detection + energy normalization for IR
 */
export class AmbienceEngine {
  private sampleRate: number;
  private config: AmbienceConfig = {
    enabled: false,
    irLeft: null,
    irRight: null,
    intensity: 0,
    decaySec: 1.6,
  };

  // IR convolution state
  private irL: Float32Array = new Float32Array(0); // trimmed IR (inspection/tests)
  private irR: Float32Array = new Float32Array(0);
  private irRevL: Float32Array = new Float32Array(0); // Pre-flipped for convolution
  private irRevR: Float32Array = new Float32Array(0);
  private historyL: Float32Array = new Float32Array(0);
  private historyR: Float32Array = new Float32Array(0);
  private irSize: number = 0;
  private histIdx: number = 0;

  // Tail
  private tail: DiffuseTail;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.tail = new DiffuseTail(sampleRate);
  }

  setSampleRate(rate: number): void {
    if (rate <= 0 || rate === this.sampleRate) return;
    this.sampleRate = rate;
    this.tail = new DiffuseTail(rate);
    // Rebuild IR if present
    if (this.irSize > 0) {
      this.loadIR(this.config.irLeft!, this.config.irRight!, this.config.decaySec);
    }
  }

  /** Load and prepare IR (onset detection, trim, normalize, pre-flip) */
  loadIR(irLeft: Float32Array, irRight: Float32Array, decaySec: number): void {
    if (!irLeft || !irRight || irLeft.length < 10) {
      this.clear();
      return;
    }

    const size = irLeft.length;
    // Onset detection: find first sample above 0.02 (skip pre-delay silence)
    let onset = 0;
    while (onset < size - 64) {
      if (Math.abs(irLeft[onset]) > 0.02 || Math.abs(irRight[onset]) > 0.02) break;
      onset++;
    }
    if (onset >= size - 64) onset = 0;

    const avail = Math.min(size - onset, MAX_TAPS);
    const nIrL = new Float32Array(avail);
    const nIrR = new Float32Array(avail);

    for (let i = 0; i < avail; i++) {
      nIrL[i] = irLeft[onset + i];
      nIrR[i] = irRight[onset + i];
    }

    // Energy normalization to 0.9 RMS
    let eL = 0, eR = 0;
    for (let i = 0; i < avail; i++) {
      eL += nIrL[i] * nIrL[i];
      eR += nIrR[i] * nIrR[i];
    }
    const gL = eL > 1e-12 ? 0.9 / Math.sqrt(eL) : 1;
    const gR = eR > 1e-12 ? 0.9 / Math.sqrt(eR) : 1;

    for (let i = 0; i < avail; i++) {
      nIrL[i] *= gL;
      nIrR[i] *= gR;
    }

    // Pre-flipped kernel for efficient convolution:
    // conv = sum_m irRev[m] * history[(histIdx + 1 + m) % irSize]
    const nRevL = new Float32Array(avail);
    const nRevR = new Float32Array(avail);
    for (let i = 0; i < avail; i++) {
      nRevL[i] = nIrL[avail - 1 - i];
      nRevR[i] = nIrR[avail - 1 - i];
    }

    const nHistL = new Float32Array(avail);
    const nHistR = new Float32Array(avail);

    // Publish
    this.irL = nIrL;
    this.irR = nIrR;
    void this.irL; void this.irR; // kept for external inspection/tests
    this.irRevL = nRevL;
    this.irRevR = nRevR;
    this.historyL = nHistL;
    this.historyR = nHistR;
    this.irSize = avail;
    this.histIdx = 0;

    this.tail.build(decaySec);
    this.config.decaySec = decaySec;
  }

  /** Update only decay (RT60) - fast path */
  updateDecay(decaySec: number): void {
    this.config.decaySec = decaySec;
    this.tail.retune(decaySec);
  }

  /** Set intensity (wet/dry mix) */
  setIntensity(intensity: number): void {
    this.config.intensity = Math.max(0, Math.min(1, intensity));
  }

  /** Enable/disable */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) this.tail.clear();
  }

  clear(): void {
    this.irL = new Float32Array(0);
    this.irR = new Float32Array(0);
    this.irRevL = new Float32Array(0);
    this.irRevR = new Float32Array(0);
    this.historyL = new Float32Array(0);
    this.historyR = new Float32Array(0);
    this.irSize = 0;
    this.histIdx = 0;
    this.tail.clear();
  }

  /** Process stereo block in-place */
  process(buffer: Float32Array, frames: number): void {
    if (!this.config.enabled || this.irSize === 0) return;

    const amb = this.config.intensity;
    if (amb <= 1e-3) return;

    for (let i = 0; i < frames; i++) {
      const idx = i * 2;
      const sL = buffer[idx];
      const sR = buffer[idx + 1];

      // Write to history
      this.historyL[this.histIdx] = sL;
      this.historyR[this.histIdx] = sR;

      // Convolution: two contiguous segments (avoids modulo in inner loop)
      const n1 = this.irSize - 1 - this.histIdx;
      let convL = 0, convR = 0;

      // Segment A: history[histIdx+1 .. irSize-1] x irRev[0 .. n1-1]
      for (let m = 0; m < n1; m++) {
        convL += this.historyL[this.histIdx + 1 + m] * this.irRevL[m];
        convR += this.historyR[this.histIdx + 1 + m] * this.irRevR[m];
      }

      // Segment B: history[0 .. histIdx] x irRev[n1 .. irSize-1]
      for (let m = 0; m <= this.histIdx; m++) {
        convL += this.historyL[m] * this.irRevL[n1 + m];
        convR += this.historyR[m] * this.irRevR[n1 + m];
      }

      // Diffuse tail
      const tailOut = this.tail.process(convL, convR);

      // Wet mix: early*0.7 + tail*0.85 (matches C++)
      const wetL = convL * 0.7 + tailOut.wetL;
      const wetR = convR * 0.7 + tailOut.wetR;

      // Dry/wet mix
      buffer[idx] = sL * (1 - amb) + wetL * amb;
      buffer[idx + 1] = sR * (1 - amb) + wetR * amb;

      this.histIdx++;
      if (this.histIdx >= this.irSize) this.histIdx = 0;
    }
  }
}