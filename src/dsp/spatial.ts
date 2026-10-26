/**
 * Biscene V4 Spatial Matrix / Crossfeed (TypeScript Port).
 * ILD (Inter-aural Level Difference) + ITD (Inter-aural Time Difference)
 * + Distance modeling (proximity/air absorption).
 * Ported from android/app/src/main/cpp/dsp/SpatialMatrix.h/.cpp
 */

import { Biquad } from './biquad';

export interface SpatialConfig {
  angle: number;       // 0-90 degrees (0 = off)
  depth: number;       // 0.1-5.0 (1.0 = normal)
  enabled: boolean;
}

/**
 * Spatial crossfeed processor:
 * - ITD: fractional delay line (max 5ms)
 * - ILD: frequency-dependent head shadowing (high-shelf at ~4.5kHz)
 * - Crossfeed gain: 0.26 (unity-gain direct path)
 * - Distance: proximity boost (low-shelf) or air absorption (high-shelf)
 */
export class SpatialMatrix {
  private sampleRate: number;
  private angle: number = 0;
  private depth: number = 1;
  private enabled: boolean = false;

  // ITD delay line
  private bufferSize: number = 0;
  private delayBufferL: Float32Array = new Float32Array(0);
  private delayBufferR: Float32Array = new Float32Array(0);
  private writeIndex: number = 0;

  // ILD filter (high-shelf for head shadowing)
  private shadowL: Biquad;
  private shadowR: Biquad;

  // Distance/environment filter
  private envL: Biquad;
  private envR: Biquad;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.shadowL = new Biquad();
    this.shadowR = new Biquad();
    this.envL = new Biquad();
    this.envR = new Biquad();
    this.initBuffers();
    this.updateCoefficients();
  }

  private initBuffers(): void {
    // 5ms max delay + 32 safety margin
    this.bufferSize = Math.floor(this.sampleRate * 0.005) + 32;
    this.delayBufferL = new Float32Array(this.bufferSize);
    this.delayBufferR = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
  }

  setSampleRate(rate: number): void {
    if (rate <= 0 || rate === this.sampleRate) return;
    this.sampleRate = rate;
    this.initBuffers();
    this.updateCoefficients();
  }

  reset(): void {
    this.delayBufferL.fill(0);
    this.delayBufferR.fill(0);
    this.writeIndex = 0;
    this.shadowL.reset();
    this.shadowR.reset();
    this.envL.reset();
    this.envR.reset();
  }

  setParameters(angleDeg: number, depthFactor: number): void {
    this.angle = Math.max(0, Math.min(90, angleDeg));
    this.depth = Math.max(0.1, Math.min(5, depthFactor));
    this.updateCoefficients();
  }

  setEnabled(en: boolean): void {
    this.enabled = en;
  }

  private updateCoefficients(): void {
    if (this.sampleRate <= 0) return;

    // --- ILD (Inter-aural Level Difference) ---
    // Frequency dependent shadowing (High-shelf)
    // Approx head diffraction loss: -3.5dB * sin(theta)
    const thetaRad = this.angle * Math.PI / 180;
    const gainDb = -3.5 * Math.sin(thetaRad);

    const f0 = 4500;
    const Q = 0.707;
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * f0 / this.sampleRate;
    const alpha = Math.sin(w0) / (2 * Q);
    const cw0 = Math.cos(w0);

    let a0 = (A + 1) - (A - 1) * cw0 + 2 * Math.sqrt(A) * alpha;
    if (Math.abs(a0) < 1e-9) a0 = 1;

    const b0 = A * ((A + 1) + (A - 1) * cw0 + 2 * Math.sqrt(A) * alpha) / a0;
    const b1 = -2 * A * ((A - 1) + (A + 1) * cw0) / a0;
    const b2 = A * ((A + 1) + (A - 1) * cw0 - 2 * Math.sqrt(A) * alpha) / a0;
    const a1 = 2 * ((A - 1) - (A + 1) * cw0) / a0;
    const a2 = ((A + 1) - (A - 1) * cw0 - 2 * Math.sqrt(A) * alpha) / a0;

    this.shadowL.setCoefficients(b0, b1, b2, a1, a2);
    this.shadowR.setCoefficients(b0, b1, b2, a1, a2);

    // --- Distance Modeling (Proximity & Air Absorption) ---
    let envGainDb = 0;
    let envF0 = 1000;
    let mode = 0; // 0: off, 1: low-shelf (proximity), 2: high-shelf (air absorption)

    if (this.depth < 0.95) {
      // Proximity effect: bass boost
      envGainDb = 2.2 * (1 - this.depth);
      envF0 = 55;
      mode = 1;
    } else if (this.depth > 1.05) {
      // Air absorption: treble cut
      envGainDb = -1.8 * (this.depth - 1);
      envF0 = 11500;
      mode = 2;
    }

    if (mode > 0) {
      const Ae = Math.pow(10, envGainDb / 40);
      const w0e = 2 * Math.PI * envF0 / this.sampleRate;
      const sw0e = Math.sin(w0e);
      const cw0e = Math.cos(w0e);
      const alphae = sw0e / (2 * Q);
      let a0e = 1;

      if (mode === 1) {
        // Low-shelf (proximity)
        a0e = (Ae + 1) + (Ae - 1) * cw0e + 2 * Math.sqrt(Ae) * alphae;
        if (Math.abs(a0e) < 1e-9) a0e = 1;

        const b0e = Ae * ((Ae + 1) - (Ae - 1) * cw0e + 2 * Math.sqrt(Ae) * alphae) / a0e;
        const b1e = 2 * Ae * ((Ae - 1) - (Ae + 1) * cw0e) / a0e;
        const b2e = Ae * ((Ae + 1) - (Ae - 1) * cw0e - 2 * Math.sqrt(Ae) * alphae) / a0e;
        const a1e = -2 * ((Ae - 1) + (Ae + 1) * cw0e) / a0e;
        const a2e = ((Ae + 1) + (Ae - 1) * cw0e - 2 * Math.sqrt(Ae) * alphae) / a0e;

        this.envL.setCoefficients(b0e, b1e, b2e, a1e, a2e);
      } else {
        // High-shelf (air absorption)
        a0e = (Ae + 1) - (Ae - 1) * cw0e + 2 * Math.sqrt(Ae) * alphae;
        if (Math.abs(a0e) < 1e-9) a0e = 1;

        const b0e = Ae * ((Ae + 1) + (Ae - 1) * cw0e + 2 * Math.sqrt(Ae) * alphae) / a0e;
        const b1e = -2 * Ae * ((Ae - 1) + (Ae + 1) * cw0e) / a0e;
        const b2e = Ae * ((Ae + 1) - (Ae - 1) * cw0e - 2 * Math.sqrt(Ae) * alphae) / a0e;
        const a1e = 2 * ((Ae - 1) - (Ae + 1) * cw0e) / a0e;
        const a2e = ((Ae + 1) - (Ae - 1) * cw0e - 2 * Math.sqrt(Ae) * alphae) / a0e;

        this.envL.setCoefficients(b0e, b1e, b2e, a1e, a2e);
      }
      this.envR.setCoefficients(
        this.envL.getCoefficients().b0,
        this.envL.getCoefficients().b1,
        this.envL.getCoefficients().b2,
        this.envL.getCoefficients().a1,
        this.envL.getCoefficients().a2
      );
    } else {
      this.envL.reset();
      this.envR.reset();
    }
  }

  /**
   * Calculate ITD in samples using Woodworth spherical head model
   */
  private getItdSamples(thetaDeg: number): number {
    const thetaRad = thetaDeg * Math.PI / 180;
    const a = 0.0875;  // Head radius (meters)
    const c = 343;     // Speed of sound (m/s)
    // Woodworth model: ITD = (a/c) * (theta + sin(theta))
    const itdSec = (a / c) * (thetaRad + Math.sin(thetaRad));
    return itdSec * this.sampleRate;
  }

  /** Process stereo block in-place */
  process(buffer: Float32Array, frames: number): void {
    if (!this.enabled || frames <= 0 || this.bufferSize <= 0) return;

    const xfActive = this.angle > 0.01;
    let itd = xfActive ? this.getItdSamples(this.angle) : 0;
    const itdInt = Math.floor(itd);
    const itdFrac = itd - itdInt;

    for (let i = 0; i < frames; i++) {
      const idx = i * 2;
      const L = buffer[idx];
      const R = buffer[idx + 1];

      let outL = L;
      let outR = R;

      if (xfActive) {
        // Write to delay line
        this.delayBufferL[this.writeIndex] = L;
        this.delayBufferR[this.writeIndex] = R;

        // Linear interpolation for fractional ITD
        const rIdx0 = (this.writeIndex - itdInt + this.bufferSize) % this.bufferSize;
        const rIdx1 = (rIdx0 - 1 + this.bufferSize) % this.bufferSize;

        let dR = this.delayBufferR[rIdx0] * (1 - itdFrac) + this.delayBufferR[rIdx1] * itdFrac;
        let dL = this.delayBufferL[rIdx0] * (1 - itdFrac) + this.delayBufferL[rIdx1] * itdFrac;

        // Apply ILD (head shadowing) to crosstalk component
        dR = this.shadowR.process(dR);
        dL = this.shadowL.process(dL);

        // V4.5.6: Unity-gain crossfeed — direct path stays at 1.0
        // Only cross component is attenuated (0.26 = approx -11.7dB)
        outL = L + dR * 0.26;
        outR = R + dL * 0.26;
      }

      // Apply environment correction (distance)
      outL = this.envL.process(outL);
      outR = this.envR.process(outR);

      buffer[idx] = outL;
      buffer[idx + 1] = outR;

      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
    }
  }
}