/**
 * Biscene V5 Phase Inverter (TypeScript Port).
 * Absolute phase control (0°/180°) with click-free transition.
 * Ported from android/app/src/main/cpp/gapless/PhaseInverter.h
 */

export interface PhaseInverterConfig {
  enabled: boolean;
  inverted: boolean;
}

/**
 * Click-free polarity inversion.
 * - Equal-gain linear ramp (NOT equal-power!)
 * - 1ms ramp at current sample rate
 * - Settles at target polarity
 * - First block adopts polarity outright (no fade-in on start)
 */
export class PhaseInverter {
  private static readonly kRampMs = 1;
  private static readonly kMaxRampFrames = 256;

  private rampTotal: number;
  private rampPos: number;
  private current: boolean = false;
  private ramping: boolean = false;
  private primed: boolean = false;  // First block flag

  private target: boolean = false;

  constructor(_sampleRate: number) {
    this.rampTotal = PhaseInverter.computeRampFrames(_sampleRate);
    this.rampPos = this.rampTotal; // Start settled at 0°
  }

  private static computeRampFrames(hz: number): number {
    let frames = Math.round((PhaseInverter.kRampMs / 1000) * hz);
    if (frames < 8) frames = 8;
    if (frames > PhaseInverter.kMaxRampFrames) frames = PhaseInverter.kMaxRampFrames;
    return frames;
  }

  setSampleRate(hz: number): void {
    if (hz <= 0) return;
    const frames = PhaseInverter.computeRampFrames(hz);
    // Preserve settled/ramping state across rate change
    if (!this.ramping && this.rampPos >= this.rampTotal) {
      this.rampPos = frames; // Settled stays settled
    } else {
      this.rampPos = Math.min(this.rampPos, frames); // Mid-ramp stays mid-ramp
    }
    this.rampTotal = frames;
  }

  setInverted(inverted: boolean): void {
    this.target = inverted;
  }

  isInverted(): boolean {
    return this.target;
  }

  isSettled(): boolean {
    return !this.ramping && this.rampPos >= this.rampTotal;
  }

  reset(): void {
    this.current = false;
    this.ramping = false;
    this.primed = false;
    this.rampPos = this.rampTotal;
    this.target = false;
  }

  /** Process stereo block in-place */
  process(buffer: Float32Array, frames: number): void {
    if (frames <= 0) return;

    const targetInv = this.target;
    const wantRamp = targetInv !== this.current;

    if (!this.primed) {
      // First block: adopt target immediately, no crossfade
      this.current = targetInv;
      this.primed = true;
      this.ramping = false;
      this.rampPos = this.rampTotal;
    }

    if (wantRamp && !this.ramping) {
      // Start new ramp
      this.ramping = true;
      this.rampPos = 0;
    }

    if (this.ramping) {
      this.applyRamp(buffer, frames, this.current ? 1 : 0, targetInv ? 1 : 0);
      this.rampPos += frames;
      if (this.rampPos >= this.rampTotal) {
        this.ramping = false;
        this.current = targetInv;
        this.rampPos = this.rampTotal;
      }
    } else if (this.current) {
      // Settled inverted: just negate
      this.applyNegated(buffer, frames * 2);
    }
    // Settled non-inverted: passthrough (do nothing)
  }

  /** Apply y = -x to all samples */
  private applyNegated(buffer: Float32Array, count: number): void {
    for (let i = 0; i < count; i++) {
      buffer[i] = -buffer[i];
    }
  }

  /** Crossfade from invFrom to invTo (0 or 1) over this block */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private applyRamp(buffer: Float32Array, frames: number, invFrom: number, _invTo: number): void {
    // Linear ramp: t goes from rampPos/rampTotal to (rampPos+frames)/rampTotal
    // y = x * (1 - 2*t) where t in [0, 1]
    // At t=0: y = x (invFrom=0) or y = -x (invFrom=1)
    // At t=1: y = -x (invTo=1) or y = x (invTo=0)

    const startT = this.rampPos / this.rampTotal;
    const step = frames / this.rampTotal;

    for (let i = 0; i < frames; i++) {
      const idx = i * 2;
      const t = startT + i * step;
      // Gain for left channel = gain for right = 1 - 2*t (when crossing 0°<->180°)
      // But we need to handle direction: from 0->1 or 1->0
      // The formula y = x * (1 - 2*t) works for 0->1 transition
      // For 1->0, it's y = x * (2*t - 1) = -x * (1 - 2*t)
      const gain = invFrom === 0 ? (1 - 2 * t) : (2 * t - 1);

      buffer[idx] *= gain;
      buffer[idx + 1] *= gain;
    }
  }
}