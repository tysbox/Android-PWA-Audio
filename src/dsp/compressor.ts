/**
 * Biscene V6.2 Night Mode Compressor (TypeScript Port).
 * Gentle feed-forward RMS compressor for night listening.
 * Ported from android/app/src/main/cpp/dsp/DynamicsCompressor.h
 */

export interface CompressorConfig {
  enabled: boolean;
  // Fixed parameters (matching C++):
  // threshold: -24dB (0.0631 linear)
  // ratio: 2:1
  // attack: 20ms
  // release: 300ms
  // max attenuation: -9dB (0.3548)
  // RMS window: ~5ms
  // toggle ramp: ~10ms
}

/**
 * RMS-based compressor (NOT peak detector!)
 * - Tracks program level, not waveform
 * - 2:1 ratio above -24dB
 * - Max 9dB attenuation
 * - Toggle ramp prevents pops
 */
export class DynamicsCompressor {
  private sampleRate: number;

  // Time constants (derived from ms at current sample rate)
  // NOTE: these mirror the C++ one-pole coefficients; assigned in recalculateCoefficients().
  private attackCoef: number = 0;
  private releaseCoef: number = 0;
  private rmsCoef: number = 0;

  // Audio-thread state
  private rmsState: number = 0;      // Smoothed mean-square
  private gain: number = 1;          // Smoothed reduction gain
  private mix: number = 0;           // Toggle ramp 0..1

  // Fixed parameters
  private static readonly kThresholdLin = 0.0631;  // -24dB
  private static readonly kMinGain = 0.3548;       // -9dB floor
  private static readonly kAttackMs = 20;
  private static readonly kReleaseMs = 300;
  private static readonly kRmsWindowMs = 5;
  private static readonly kRampFrames = 960;       // ~10ms @ 96kHz

  private enabled: boolean = false;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate > 0 ? sampleRate : 48000;
    this.recalculateCoefficients();
  }

  setSampleRate(sr: number): void {
    if (sr <= 0 || sr === this.sampleRate) return;
    this.sampleRate = sr;
    this.recalculateCoefficients();
  }

  private recalculateCoefficients(): void {
    this.attackCoef = this.msToCoef(DynamicsCompressor.kAttackMs);
    this.releaseCoef = this.msToCoef(DynamicsCompressor.kReleaseMs);
    this.rmsCoef = this.msToCoef(DynamicsCompressor.kRmsWindowMs);
  }

  private msToCoef(ms: number): number {
    const samples = (ms * 0.001) * this.sampleRate;
    return Math.exp(-1 / samples);
  }

  setEnabled(en: boolean): void {
    this.enabled = en;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  reset(): void {
    this.rmsState = 0;
    this.gain = 1;
    this.mix = 0;
  }

  /** Process stereo block in-place */
  process(buffer: Float32Array, frames: number): void {
    if (!this.enabled && this.mix <= 0) return;

    const want = this.enabled;

    // Ramp the compressor mix 0..1 over ~10ms (toggle safety)
    const target = want ? 1 : 0;
    if (this.mix !== target) {
      const step = 1 / DynamicsCompressor.kRampFrames;
      this.mix += (target > this.mix) ? step : -step;
      if (this.mix < 0) this.mix = 0;
      if (this.mix > 1) this.mix = 1;
    }

    if (this.mix <= 0) return; // Fully bypassed: pure passthrough

    for (let i = 0; i < frames; i++) {
      const idx = i * 2;
      const L = buffer[idx];
      const R = buffer[idx + 1];

      // --- Level detection: RMS over ~5ms mean-square smoother ---
      // NOT a per-sample peak! Peak detector with 20ms attack rides
      // gain within each low-mid cycle -> audible THD.
      // RMS tracks program level -> gain constant within cycle.
      const meanSq = 0.5 * (L * L + R * R);
      this.rmsState += (meanSq - this.rmsState) * (1 - this.rmsCoef);
      const level = Math.sqrt(this.rmsState);

      // --- Gain computer: soft-knee 2:1 above -24dB ---
      let reduction = 1;
      if (level > DynamicsCompressor.kThresholdLin) {
        // 2:1 ratio in log domain: out_dB = in_dB * 0.5 above knee
        // Linear approximation: g = (T + (e - T) * 0.5) / e for e > T
        reduction = (DynamicsCompressor.kThresholdLin + (level - DynamicsCompressor.kThresholdLin) * 0.5) / level;
      }

      // --- Smooth the gain itself ---
      const gCoef = reduction < this.gain ? this.attackCoef : this.releaseCoef;
      this.gain += (reduction - this.gain) * gCoef;

      // Max attenuation floor: never pull down more than 9dB
      let g = this.gain;
      if (g < DynamicsCompressor.kMinGain) g = DynamicsCompressor.kMinGain;

      // --- Apply with toggle mix: crossfade between compressed and original ---
      const cL = L * g;
      const cR = R * g;
      buffer[idx] = L + (cL - L) * this.mix;
      buffer[idx + 1] = R + (cR - R) * this.mix;
    }
  }
}