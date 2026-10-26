/**
 * Biscene V4 High-Resolution Biquad Filter (TypeScript Port).
 * Direct Form II Transposed with RBJ Cookbook support and NaN protection.
 * Ported from android/app/src/main/cpp/dsp/Biquad.h
 */

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export type FilterType = 'peaking' | 'lowshelf' | 'highshelf' | 'highpass' | 'notch';

export interface FilterConfig {
  type: FilterType;
  freq: number;
  gain: number;
  q: number;
}

/**
 * High-resolution biquad filter with RBJ Audio EQ Cookbook coefficient calculation.
 * Direct Form II Transposed topology for numerical stability.
 */
export class Biquad {
  private b0 = 1.0;
  private b1 = 0.0;
  private b2 = 0.0;
  private a1 = 0.0;
  private a2 = 0.0;
  private z1 = 0.0;
  private z2 = 0.0;

  constructor() {
    this.reset();
  }

  /** Reset to passthrough (identity) */
  reset(): void {
    this.b0 = 1.0;
    this.b1 = 0.0;
    this.b2 = 0.0;
    this.a1 = 0.0;
    this.a2 = 0.0;
    this.z1 = 0.0;
    this.z2 = 0.0;
  }

  /** Set raw coefficients (normalized, a0 = 1) */
  setCoefficients(b0: number, b1: number, b2: number, a1: number, a2: number): void {
    this.b0 = b0;
    this.b1 = b1;
    this.b2 = b2;
    this.a1 = a1;
    this.a2 = a2;
  }

  /** Get current coefficients for inspection/serialization */
  getCoefficients(): BiquadCoefficients {
    return { b0: this.b0, b1: this.b1, b2: this.b2, a1: this.a1, a2: this.a2 };
  }

  // --- RBJ AUDIO EQ COOKBOOK ---

  /** Peaking EQ band */
  setPeaking(sampleRate: number, freq: number, gainDb: number, q: number): void {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);

    const b0 = 1 + alpha * A;
    const b1 = -2 * cw;
    const b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A;
    const a1 = -2 * cw;
    const a2 = 1 - alpha / A;

    this.setCoefficients(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
  }

  /** Low shelf filter */
  setLowShelf(sampleRate: number, freq: number, gainDb: number, q: number): void {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const sqrtA = Math.sqrt(A);

    const b0 = A * ((A + 1) - (A - 1) * cw + 2 * sqrtA * alpha);
    const b1 = 2 * A * ((A - 1) - (A + 1) * cw);
    const b2 = A * ((A + 1) - (A - 1) * cw - 2 * sqrtA * alpha);
    const a0 = (A + 1) + (A - 1) * cw + 2 * sqrtA * alpha;
    const a1 = -2 * ((A - 1) + (A + 1) * cw);
    const a2 = (A + 1) + (A - 1) * cw - 2 * sqrtA * alpha;

    this.setCoefficients(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
  }

  /** High shelf filter */
  setHighShelf(sampleRate: number, freq: number, gainDb: number, q: number): void {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const sqrtA = Math.sqrt(A);

    const b0 = A * ((A + 1) + (A - 1) * cw + 2 * sqrtA * alpha);
    const b1 = -2 * A * ((A - 1) + (A + 1) * cw);
    const b2 = A * ((A + 1) + (A - 1) * cw - 2 * sqrtA * alpha);
    const a0 = (A + 1) - (A - 1) * cw + 2 * sqrtA * alpha;
    const a1 = 2 * ((A - 1) - (A + 1) * cw);
    const a2 = (A + 1) - (A - 1) * cw - 2 * sqrtA * alpha;

    this.setCoefficients(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
  }

  /** High pass filter (gainDb ignored, unity gain at Nyquist) */
  setHighPass(sampleRate: number, freq: number, q: number): void {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);

    const b0 = (1 + cw) / 2;
    const b1 = -(1 + cw);
    const b2 = (1 + cw) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cw;
    const a2 = 1 - alpha;

    this.setCoefficients(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
  }

  /** Notch filter */
  setNotch(sampleRate: number, freq: number, q: number): void {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);

    const b0 = 1;
    const b1 = -2 * cw;
    const b2 = 1;
    const a0 = 1 + alpha;
    const a1 = -2 * cw;
    const a2 = 1 - alpha;

    this.setCoefficients(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
  }

  /** Configure from generic filter config */
  setFromConfig(sampleRate: number, config: FilterConfig): void {
    switch (config.type) {
      case 'peaking':
        this.setPeaking(sampleRate, config.freq, config.gain, config.q);
        break;
      case 'lowshelf':
        this.setLowShelf(sampleRate, config.freq, config.gain, config.q);
        break;
      case 'highshelf':
        this.setHighShelf(sampleRate, config.freq, config.gain, config.q);
        break;
      case 'highpass':
        this.setHighPass(sampleRate, config.freq, config.q);
        break;
      case 'notch':
        this.setNotch(sampleRate, config.freq, config.q);
        break;
    }
  }

  /** Process a single sample (Direct Form II Transposed) */
  process(x: number): number {
    const out = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * out + this.z2;
    this.z2 = this.b2 * x - this.a2 * out;

    // NaN/Inf protection and state safety clamping (matches C++ implementation)
    if (!isFinite(out) || Math.abs(out) > 1e6) {
      this.z1 = 0;
      this.z2 = 0;
      return x;
    }
    if (Math.abs(this.z1) > 1e6) this.z1 = 0;
    if (Math.abs(this.z2) > 1e6) this.z2 = 0;

    // Denormal prevention
    if (Math.abs(this.z1) < 1e-18) this.z1 = 0;
    if (Math.abs(this.z2) < 1e-18) this.z2 = 0;

    return out;
  }

  /** Process stereo pair (two independent channels with same coefficients) */
  processStereo(left: number, right: number, stateL: { z1: number; z2: number }, stateR: { z1: number; z2: number }): { left: number; right: number; stateL: typeof stateL; stateR: typeof stateR } {
    // Left channel
    let outL = this.b0 * left + stateL.z1;
    stateL.z1 = this.b1 * left - this.a1 * outL + stateL.z2;
    stateL.z2 = this.b2 * left - this.a2 * outL;

    // Right channel
    let outR = this.b0 * right + stateR.z1;
    stateR.z1 = this.b1 * right - this.a1 * outR + stateR.z2;
    stateR.z2 = this.b2 * right - this.a2 * outR;

    // NaN/Inf protection
    if (!isFinite(outL) || Math.abs(outL) > 1e6) {
      stateL.z1 = stateL.z2 = 0;
      outL = left;
    }
    if (!isFinite(outR) || Math.abs(outR) > 1e6) {
      stateR.z1 = stateR.z2 = 0;
      outR = right;
    }
    if (Math.abs(stateL.z1) > 1e6) stateL.z1 = 0;
    if (Math.abs(stateL.z2) > 1e6) stateL.z2 = 0;
    if (Math.abs(stateR.z1) > 1e6) stateR.z1 = 0;
    if (Math.abs(stateR.z2) > 1e6) stateR.z2 = 0;
    if (Math.abs(stateL.z1) < 1e-18) stateL.z1 = 0;
    if (Math.abs(stateL.z2) < 1e-18) stateL.z2 = 0;
    if (Math.abs(stateR.z1) < 1e-18) stateR.z1 = 0;
    if (Math.abs(stateR.z2) < 1e-18) stateR.z2 = 0;

    return { left: outL, right: outR, stateL, stateR };
  }

  /**
   * Compute log magnitude response at a specific frequency (for headroom guard evaluation).
   * Matches C++ biquadLogMag() exactly.
   */
  logMagnitude(freq: number, sampleRate: number): number {
    const w = 2 * Math.PI * freq / sampleRate;
    const zr = Math.cos(w);
    const zi = -Math.sin(w);
    const z2r = Math.cos(2 * w);
    const z2i = -Math.sin(2 * w);

    // H = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2)
    const nr = this.b0 + this.b1 * zr + this.b2 * z2r;
    const ni = -(this.b1 * zi + this.b2 * z2i);
    const dr = 1 + this.a1 * zr + this.a2 * z2r;
    const di = -(this.a1 * zi + this.a2 * z2i);

    const den = dr * dr + di * di;
    if (den < 1e-12) return Math.log(1e-9);

    const hr = (nr * dr + ni * di) / den;
    const hi = (ni * dr - nr * di) / den;

    return Math.log(Math.sqrt(hr * hr + hi * hi) + 1e-9);
  }
}

/**
 * Stereo biquad pair - two independent channels sharing coefficients.
 * Used for EQ banks where L/R share the same filter settings.
 */
export class StereoBiquad {
  private left = new Biquad();
  private right = new Biquad();

  reset(): void {
    this.left.reset();
    this.right.reset();
  }

  setCoefficients(b0: number, b1: number, b2: number, a1: number, a2: number): void {
    this.left.setCoefficients(b0, b1, b2, a1, a2);
    this.right.setCoefficients(b0, b1, b2, a1, a2);
  }

  setFromConfig(sampleRate: number, config: FilterConfig): void {
    this.left.setFromConfig(sampleRate, config);
    this.right.setFromConfig(sampleRate, config);
  }

  process(left: number, right: number): { left: number; right: number } {
    return {
      left: this.left.process(left),
      right: this.right.process(right),
    };
  }

  /** Get log magnitude for headroom guard (channels are identical) */
  logMagnitude(freq: number, sampleRate: number): number {
    return this.left.logMagnitude(freq, sampleRate);
  }
}