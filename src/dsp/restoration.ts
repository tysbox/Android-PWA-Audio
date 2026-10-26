/**
 * Biscene V4.5.6 Restoration Engine (TypeScript Port).
 * Spectral harmonic reconstruction + adaptive transient sharpening.
 * Ported from android/app/src/main/cpp/dsp/RestorationEngine.cpp
 */

export interface RestorationConfig {
  enabled: boolean;
  // Fixed parameters (matching C++):
  // punch: 0.65
  // harmonicGain: 0.08
  // release: 0.9996
}

export class RestorationEngine {
  private enabled: boolean = false;

  // Per-channel state
  private derivEnvL: number = 0;
  private derivEnvR: number = 0;
  private punchPrevL: number = 0;
  private punchPrevR: number = 0;

  constructor(_sampleRate: number) {
    // Coefficients are rate-independent (fixed per-sample constants)
  }

  setSampleRate(_rate: number): void {
    // no-op: rate-independent
  }

  setEnabled(en: boolean): void {
    this.enabled = en;
  }

  reset(): void {
    this.derivEnvL = 0;
    this.derivEnvR = 0;
    this.punchPrevL = 0;
    this.punchPrevR = 0;
  }

  /** Process stereo block in-place */
  process(buffer: Float32Array, frames: number): void {
    if (!this.enabled || frames <= 0) return;

    // Noticeable recovery: calibrated for aggressive transients
    const punch = 0.65;
    const harmonicGain = 0.08;
    const release = 0.9996;

    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < 2; ch++) {
        const idx = i * 2 + ch;
        const x = buffer[idx];
        const p = ch === 0 ? this.punchPrevL : this.punchPrevR;
        const env = ch === 0 ? this.derivEnvL : this.derivEnvR;

        // 1. High-pass delta detection
        let diff = Math.abs(x - p);
        if (ch === 0) this.punchPrevL = x;
        else this.punchPrevR = x;

        // Envelope follower
        let newEnv = env;
        if (diff > newEnv) newEnv = diff;
        else newEnv *= release;

        if (ch === 0) this.derivEnvL = newEnv;
        else this.derivEnvR = newEnv;

        // 2. Harmonic excitation (high-frequency focus)
        const wet = Math.tanh(x * 1.05);
        const harmonics = (wet - x) * harmonicGain;

        // 3. Adaptive transient punch
        const gain = 1 + Math.min(0.5, newEnv * punch * 15);

        let out = (x + harmonics) * gain;
        if (!isFinite(out)) out = 0;

        buffer[idx] = out;
      }
    }
  }
}