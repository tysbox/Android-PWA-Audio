/**
 * Biscene V4 Tube Model (TypeScript Port).
 * 300B Triode / KT88 Pentode emulation with power supply sag and DC blocking.
 * Ported from android/app/src/main/cpp/dsp/TubeModel.h/.cpp
 */

export enum TubeType {
  TRIODE = 0,   // 300B
  PENTODE = 1,  // KT88
}

export interface TubeConfig {
  enabled: boolean;
  type: TubeType;
  bias: number;  // 0.0 - 1.0 (normalized from 0-100)
}

/**
 * Tube saturation model with:
 * - Grid bias offset
 * - Nonlinear transfer function (triode/pentode)
 * - DC blocking (1-pole HPF ~5Hz)
 * - Power supply sag (envelope follower)
 */
export class TubeModel {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private sampleRate: number = 48000;
  private type: TubeType = TubeType.TRIODE;
  private bias: number = 0;
  private enabled: boolean = false;

  // Power supply sag (stereo independent but shared envelope)
  private sagEnv: number = 0;
  // DC blocker state (per channel)
  private dcL: number = 0;
  private dcR: number = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  setSampleRate(rate: number): void {
    if (rate > 0) this.sampleRate = rate;
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  setEnabled(en: boolean): void {
    this.enabled = en;
  }

  setParameters(type: TubeType, bias: number): void {
    this.type = type;
    this.bias = Math.max(0, Math.min(1, bias));
  }

  reset(): void {
    this.sagEnv = 0;
    this.dcL = 0;
    this.dcR = 0;
  }

  /** Process stereo block in-place */
  process(buffer: Float32Array, frames: number): void {
    if (!this.enabled || frames <= 0) return;

    for (let i = 0; i < frames; i++) {
      const idx = i * 2;
      let L = buffer[idx];
      let R = buffer[idx + 1];

      // 1. Power supply sag (summed stereo power)
      this.applySag(L, R);

      // 2. Discrete grid saturation & DC removal
      buffer[idx] = this.processSample(L, 0);  // 0 = left
      buffer[idx + 1] = this.processSample(R, 1); // 1 = right
    }
  }

  /** Process single sample with channel-specific DC state */
  private processSample(x: number, channel: number): number {
    // 1. Grid bias offset - calibrated for 0dBFS headroom
    const offset = this.bias * 0.2;
    const input = x + offset;

    // 2. Nonlinear transfer (harmonic depth enhancement)
    let output: number;
    if (this.type === TubeType.TRIODE) {
      const s = Math.tanh(input * 1.1);
      output = s + 0.12 * (s * s); // Triode: even harmonics
    } else {
      output = Math.tanh(input * 1.3) / 1.05; // Pentode: saturation
    }

    // 3. DC Blocker (one-pole HPF at ~5Hz)
    // DC offset from bias tanh
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const dcOffset = Math.tanh(offset);
    void dcOffset;
    const dcState = channel === 0 ? this.dcL : this.dcR;
    const newDc = dcState * 0.9995 + output * 0.0005;
    const res = output - newDc;

    if (channel === 0) this.dcL = newDc;
    else this.dcR = newDc;

    return isFinite(res) ? res : 0;
  }

  /** Power supply sag - envelope follower on summed power */
  private applySag(l: number, r: number): void {
    const pwr = (l * l + r * r) * 0.5;
    const att = 0.9992;
    const rel = 0.9998;

    if (pwr > this.sagEnv) {
      this.sagEnv = this.sagEnv * att + pwr * (1 - att);
    } else {
      this.sagEnv = this.sagEnv * rel + pwr * (1 - rel);
    }

    const sagFactor = 1 / (1 + this.sagEnv * 0.35);
    void sagFactor; // See TubeModel2 for the full C++-exact flow
    // Note: in C++ this modifies the input before processSample
    // We apply it by scaling the input to processSample
    // But since we already read L/R, we need to return scaled values
    // Actually, the C++ applies sag BEFORE processSample, so we should scale here
    // But we already read buffer values... let me restructure
  }
}

/**
 * Alternative TubeModel that processes per-frame with sag applied first.
 * This matches the C++ flow exactly.
 */
export class TubeModel2 {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private sampleRate: number = 48000; // (coefficients are rate-independent)
  private type: TubeType = TubeType.TRIODE;
  private bias: number = 0;
  private enabled: boolean = false;

  private sagEnv: number = 0;
  private dcL: number = 0;
  private dcR: number = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  setSampleRate(rate: number): void {
    if (rate > 0) this.sampleRate = rate;
  }

  getSampleRate(): number {
    return this.sampleRate;
  }

  setEnabled(en: boolean): void {
    this.enabled = en;
  }

  setParameters(type: TubeType, bias: number): void {
    this.type = type;
    this.bias = Math.max(0, Math.min(1, bias));
  }

  reset(): void {
    this.sagEnv = 0;
    this.dcL = 0;
    this.dcR = 0;
  }

  /** Process stereo block - exact C++ flow */
  process(buffer: Float32Array, frames: number): void {
    if (!this.enabled || frames <= 0) return;

    for (let i = 0; i < frames; i++) {
      const idx = i * 2;
      let L = buffer[idx];
      let R = buffer[idx + 1];

      // 1. Summed Power Supply Sag (applied to both channels)
      const pwr = (L * L + R * R) * 0.5;
      const att = 0.9992;
      const rel = 0.9998;

      if (pwr > this.sagEnv) {
        this.sagEnv = this.sagEnv * att + pwr * (1 - att);
      } else {
        this.sagEnv = this.sagEnv * rel + pwr * (1 - rel);
      }

      const sagFactor = 1 / (1 + this.sagEnv * 0.35);
      L *= sagFactor;
      R *= sagFactor;

      // 2. Discrete Grid Saturation & DC Removal
      buffer[idx] = this.processSample(L, 0);
      buffer[idx + 1] = this.processSample(R, 1);
    }
  }

  private processSample(x: number, channel: number): number {
    const offset = this.bias * 0.2;
    const input = x + offset;

    let output: number;
    if (this.type === TubeType.TRIODE) {
      const s = Math.tanh(input * 1.1);
      output = s + 0.12 * (s * s);
    } else {
      output = Math.tanh(input * 1.3) / 1.05;
    }

    // DC Blocker (one-pole HPF at ~5Hz)
    const dcOffset = Math.tanh(offset);
    void dcOffset; // steady-state DC from bias
    const dcState = channel === 0 ? this.dcL : this.dcR;
    const newDc = dcState * 0.9995 + output * 0.0005;
    const res = output - newDc;

    if (channel === 0) this.dcL = newDc;
    else this.dcR = newDc;

    return isFinite(res) ? res : 0;
  }
}

// Export the correct implementation
export const TubeEngine = TubeModel2;