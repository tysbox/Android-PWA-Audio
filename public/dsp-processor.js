/**
 * Biscene DSP Processor (PWA port of native V6.5 G1/G2 chain)
 *
 * Single-file AudioWorkletProcessor — all DSP stages inlined (no ES imports
 * inside AudioWorklet). Chain order matches NativeAudioEngine.cpp:
 *
 *   1. preamp (calib preampDb + loudnessDb)
 *   2. hum removal: HP 20Hz Q0.7 -> Notch(50/60Hz, Q4)
 *   3. 3-stage EQ: [0]=SOURCE, [1]=OUTPUT, [2]=CALIB
 *   4. loudness makeup exp(-(ln preamp + sum stageNetLog)) cap +12dB floor 1.0
 *      x V6.5 G1 headroom guard (192-pt log grid, ceiling +6dB) — single multiply
 *   5. restoration -> tube -> spatial -> ambience
 *   6. NIGHT compressor (RMS, 2:1, -24dB, 20/300ms, max -9dB)
 *   7. TruePeakLimiter (0.98, 4xOS FIR, soft clamp ±2.0 -> 2.5)
 *   8. master volume x tanh soft clip (knee 0.98)
 *   9. phase inversion (1ms equal-gain ramp)
 *
 * Heavy coefficient math (biquad design, makeup, guard) runs on params
 * receipt (message thread); the audio thread only multiplies.
 *
 * Message API (from WebAudioEngine.ts):
 *   {type:'params', payload}       -> full DSP state update
 *   {type:'volume', volume}       -> master volume linear (already vol^2)
 *   {type:'ir', name, left, right} -> ambience IR transfer
 *   {type:'pause'|'resume'|'stop'|'flush'}
 */

'use strict';

const GUARD_CEILING_DB = 6.0;
const GUARD_EVAL_PTS = 192;
const STAGE_NET_PTS = 24;
const MAKEUP_CAP = 3.981;              // +12dB
const LN_TO_DB = 8.68588963806504;      // 20/ln(10)
const MAX_BANDS = 16;

// ============================================================================
// Biquad (Direct Form II Transposed, RBJ cookbook) — inlined
// ============================================================================

class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }

  set(b0, b1, b2, a1, a2) {
    this.b0 = b0; this.b1 = b1; this.b2 = b2;
    this.a1 = a1; this.a2 = a2;
  }

  reset() {
    this.z1 = 0; this.z2 = 0;
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
  }

  setPeaking(sr, f, gainDb, q) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * f / sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const a0 = 1 + alpha / A;
    this.set(
      (1 + alpha * A) / a0,
      (-2 * cw) / a0,
      (1 - alpha * A) / a0,
      (-2 * cw) / a0,
      (1 - alpha / A) / a0
    );
  }

  setLowShelf(sr, f, gainDb, q) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * f / sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const sqA = Math.sqrt(A);
    const a0 = (A + 1) + (A - 1) * cw + 2 * sqA * alpha;
    this.set(
      (A * ((A + 1) - (A - 1) * cw + 2 * sqA * alpha)) / a0,
      (2 * A * ((A - 1) - (A + 1) * cw)) / a0,
      (A * ((A + 1) - (A - 1) * cw - 2 * sqA * alpha)) / a0,
      (-2 * ((A - 1) + (A + 1) * cw)) / a0,
      ((A + 1) + (A - 1) * cw - 2 * sqA * alpha) / a0
    );
  }

  setHighShelf(sr, f, gainDb, q) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * f / sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const sqA = Math.sqrt(A);
    const a0 = (A + 1) - (A - 1) * cw + 2 * sqA * alpha;
    this.set(
      (A * ((A + 1) + (A - 1) * cw + 2 * sqA * alpha)) / a0,
      (-2 * A * ((A - 1) + (A + 1) * cw)) / a0,
      (A * ((A + 1) + (A - 1) * cw - 2 * sqA * alpha)) / a0,
      (2 * ((A - 1) - (A + 1) * cw)) / a0,
      ((A + 1) - (A - 1) * cw - 2 * sqA * alpha) / a0
    );
  }

  setHighPass(sr, f, q) {
    const w0 = 2 * Math.PI * f / sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const a0 = 1 + alpha;
    this.set(
      ((1 + cw) / 2) / a0,
      (-(1 + cw)) / a0,
      ((1 + cw) / 2) / a0,
      (-2 * cw) / a0,
      (1 - alpha) / a0
    );
  }

  setNotch(sr, f, q) {
    const w0 = 2 * Math.PI * f / sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const a0 = 1 + alpha;
    this.set(1 / a0, (-2 * cw) / a0, 1 / a0, (-2 * cw) / a0, (1 - alpha) / a0);
  }

  setFromConfig(sr, cfg) {
    switch (cfg.type) {
      case 'peaking':   this.setPeaking(sr, cfg.freq, cfg.gain, cfg.q); break;
      case 'lowshelf':  this.setLowShelf(sr, cfg.freq, cfg.gain, cfg.q); break;
      case 'highshelf': this.setHighShelf(sr, cfg.freq, cfg.gain, cfg.q); break;
      case 'highpass':  this.setHighPass(sr, cfg.freq, cfg.q); break;
      case 'notch':     this.setNotch(sr, cfg.freq, cfg.q); break;
      default:          this.reset();
    }
  }

  process(x) {
    const out = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * out + this.z2;
    this.z2 = this.b2 * x - this.a2 * out;
    if (!isFinite(out) || Math.abs(out) > 1e6) { this.z1 = 0; this.z2 = 0; return x; }
    if (Math.abs(this.z1) > 1e6) this.z1 = 0;
    if (Math.abs(this.z2) > 1e6) this.z2 = 0;
    if (Math.abs(this.z1) < 1e-18) this.z1 = 0;
    if (Math.abs(this.z2) < 1e-18) this.z2 = 0;
    return out;
  }

  logMagnitude(f, sr) {
    const w = 2 * Math.PI * f / sr;
    const zr = Math.cos(w), zi = -Math.sin(w);
    const z2r = Math.cos(2 * w), z2i = -Math.sin(2 * w);
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

// ============================================================================
// StereoBiquad — L/R share coefficients, independent state
// ============================================================================

class StereoBiquad {
  constructor() {
    this.l = new Biquad();
    this.r = new Biquad();
  }

  setFromConfig(sr, cfg) {
    this.l.setFromConfig(sr, cfg);
    this.r.setFromConfig(sr, cfg);
  }

  process(lIn, rIn) {
    return { l: this.l.process(lIn), r: this.r.process(rIn) };
  }

  logMagnitude(f, sr) {
    return this.l.logMagnitude(f, sr);
  }
}

// ============================================================================
// Tube (TubeModel2 port — sag applied before saturation)
// ============================================================================

class TubeEngine {
  constructor(sr) {
    this.enabled = false;
    this.type = 0;          // 0 = TRIODE(300B), 1 = PENTODE(KT88)
    this.bias = 0;
    this.sagEnv = 0;
    this.dcL = 0;
    this.dcR = 0;
  }

  setParams(type, bias, enabled) {
    this.type = type;
    this.bias = Math.max(0, Math.min(1, bias));
    this.enabled = enabled;
  }

  reset() { this.sagEnv = 0; this.dcL = 0; this.dcR = 0; }

  _sample(x, ch) {
    const offset = this.bias * 0.2;
    const input = x + offset;
    let out;
    if (this.type === 0) {
      const s = Math.tanh(input * 1.1);
      out = s + 0.12 * (s * s);
    } else {
      out = Math.tanh(input * 1.3) / 1.05;
    }
    const prev = ch === 0 ? this.dcL : this.dcR;
    const dc = prev * 0.9995 + out * 0.0005;
    const res = out - dc;
    if (ch === 0) this.dcL = dc; else this.dcR = dc;
    return isFinite(res) ? res : 0;
  }

  processStereo(L, R) {
    const pwr = (L * L + R * R) * 0.5;
    const att = 0.9992, rel = 0.9998;
    if (pwr > this.sagEnv) this.sagEnv = this.sagEnv * att + pwr * (1 - att);
    else                   this.sagEnv = this.sagEnv * rel + pwr * (1 - rel);
    const sag = 1 / (1 + this.sagEnv * 0.35);
    return { l: this._sample(L * sag, 0), r: this._sample(R * sag, 1) };
  }
}

// ============================================================================
// SpatialMatrix (crossfeed ILD/ITD + distance)
// ============================================================================

class SpatialMatrix {
  constructor(sr) {
    this.sr = sr;
    this.angle = 0;
    this.depth = 1.0;
    this.enabled = false;

    this.bufSize = Math.floor(sr * 0.005) + 32;
    this.bufL = new Float32Array(this.bufSize);
    this.bufR = new Float32Array(this.bufSize);
    this.wIdx = 0;

    this.shadowL = new Biquad();
    this.shadowR = new Biquad();
    this.envL = new Biquad();
    this.envR = new Biquad();
    this._update();
  }

  setParams(angleDeg, depthFactor, enabled) {
    this.angle = Math.max(0, Math.min(90, angleDeg));
    this.depth = Math.max(0.1, Math.min(5, depthFactor));
    this.enabled = enabled;
    this._update();
  }

  itdSamples(thetaDeg) {
    const th = thetaDeg * Math.PI / 180;
    const a = 0.0875, c = 343;
    return ((a / c) * (th + Math.sin(th))) * this.sr;
  }

  _update() {
    if (this.sr <= 0) return;

    // ILD head shadow: high-shelf -3.5dB*sin(theta) @ 4.5kHz Q0.707
    const gainDb = -3.5 * Math.sin(this.angle * Math.PI / 180);
    const f0 = 4500, Q = 0.707;
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * f0 / this.sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const cw0 = Math.cos(w0);
    const sqA = Math.sqrt(A);
    let a0 = (A + 1) - (A - 1) * cw0 + 2 * sqA * alpha;
    if (Math.abs(a0) < 1e-9) a0 = 1;

    const shB0 = (A * ((A + 1) + (A - 1) * cw0 + 2 * sqA * alpha)) / a0;
    const shB1 = (-2 * A * ((A - 1) + (A + 1) * cw0)) / a0;
    const shB2 = (A * ((A + 1) + (A - 1) * cw0 - 2 * sqA * alpha)) / a0;
    const shA1 = (2 * ((A - 1) - (A + 1) * cw0)) / a0;
    const shA2 = ((A + 1) - (A - 1) * cw0 - 2 * sqA * alpha) / a0;
    this.shadowL.set(shB0, shB1, shB2, shA1, shA2);
    this.shadowR.set(shB0, shB1, shB2, shA1, shA2);

    // Distance modeling
    let envGainDb = 0, envF0 = 1000, mode = 0;
    if (this.depth < 0.95)      { envGainDb =  2.2 * (1 - this.depth); envF0 = 55;    mode = 1; }
    else if (this.depth > 1.05) { envGainDb = -1.8 * (this.depth - 1); envF0 = 11500; mode = 2; }

    if (mode > 0) {
      const Ae = Math.pow(10, envGainDb / 40);
      const w0e = 2 * Math.PI * envF0 / this.sr;
      const cw0e = Math.cos(w0e);
      const alphae = Math.sin(w0e) / (2 * Q);
      const sqAe = Math.sqrt(Ae);
      if (mode === 1) {
        let a0e = (Ae + 1) + (Ae - 1) * cw0e + 2 * sqAe * alphae;
        if (Math.abs(a0e) < 1e-9) a0e = 1;
        this.envL.set(
          (Ae * ((Ae + 1) - (Ae - 1) * cw0e + 2 * sqAe * alphae)) / a0e,
          (2 * Ae * ((Ae - 1) - (Ae + 1) * cw0e)) / a0e,
          (Ae * ((Ae + 1) - (Ae - 1) * cw0e - 2 * sqAe * alphae)) / a0e,
          (-2 * ((Ae - 1) + (Ae + 1) * cw0e)) / a0e,
          ((Ae + 1) + (Ae - 1) * cw0e - 2 * sqAe * alphae) / a0e
        );
      } else {
        let a0e = (Ae + 1) - (Ae - 1) * cw0e + 2 * sqAe * alphae;
        if (Math.abs(a0e) < 1e-9) a0e = 1;
        this.envL.set(
          (Ae * ((Ae + 1) + (Ae - 1) * cw0e + 2 * sqAe * alphae)) / a0e,
          (-2 * Ae * ((Ae - 1) + (Ae + 1) * cw0e)) / a0e,
          (Ae * ((Ae + 1) + (Ae - 1) * cw0e - 2 * sqAe * alphae)) / a0e,
          (2 * ((Ae - 1) - (Ae + 1) * cw0e)) / a0e,
          ((Ae + 1) - (Ae - 1) * cw0e - 2 * sqAe * alphae) / a0e
        );
      }
      this.envR.set(this.envL.b0, this.envL.b1, this.envL.b2, this.envL.a1, this.envL.a2);
    } else {
      this.envL.reset();
      this.envR.reset();
    }
  }

  processStereo(L, R) {
    let outL = L, outR = R;
    if (this.angle > 0.01) {
      const itd = this.itdSamples(this.angle);
      const itdInt = Math.floor(itd);
      const itdFrac = itd - itdInt;

      this.bufL[this.wIdx] = L;
      this.bufR[this.wIdx] = R;
      const r0 = (this.wIdx - itdInt + this.bufSize) % this.bufSize;
      const r1 = (r0 - 1 + this.bufSize) % this.bufSize;
      let dR = this.bufR[r0] * (1 - itdFrac) + this.bufR[r1] * itdFrac;
      let dL = this.bufL[r0] * (1 - itdFrac) + this.bufL[r1] * itdFrac;
      dR = this.shadowR.process(dR);
      dL = this.shadowL.process(dL);
      outL = L + dR * 0.26;
      outR = R + dL * 0.26;
    }
    outL = this.envL.process(outL);
    outR = this.envR.process(outR);
    this.wIdx = (this.wIdx + 1) % this.bufSize;
    return { l: outL, r: outR };
  }
}

// ============================================================================
// Ambience: IR convolution (1024 taps) + DiffuseTail (4 comb + 2 allpass)
// ============================================================================

const TAIL_COMBS = 4;
const TAIL_APS = 2;
const AMB_MAX_TAPS = 1024;

class DiffuseTail {
  constructor(sr) {
    this.sr = sr;
    this.damp = 0.35;
    this.active = false;
    this.combL = [null, null, null, null];
    this.combR = [null, null, null, null];
    this.combLen = [0, 0, 0, 0];
    this.combPos = [0, 0, 0, 0];
    this.combLpL = [0, 0, 0, 0];
    this.combLpR = [0, 0, 0, 0];
    this.combFb = [0.8, 0.8, 0.8, 0.8];
    this.apL = [null, null];
    this.apR = [null, null];
    this.apLen = [0, 0];
    this.apPos = [0, 0];
  }

  build(rt60) {
    const rt = Math.max(0.2, Math.min(5.0, rt60));
    const combMs = [25.3, 29.7, 33.9, 37.7];
    for (let c = 0; c < TAIL_COMBS; c++) {
      const len = Math.max(96, Math.floor(this.sr * combMs[c] / 1000));
      this.combLen[c] = len;
      this.combL[c] = new Float32Array(len);
      this.combR[c] = new Float32Array(len);
      this.combPos[c] = 0;
      this.combLpL[c] = 0;
      this.combLpR[c] = 0;
      const dt = len / this.sr;
      this.combFb[c] = Math.pow(10, -3 * dt / rt);
    }
    const apMs = [5.2, 1.9];
    for (let a = 0; a < TAIL_APS; a++) {
      const len = Math.max(32, Math.floor(this.sr * apMs[a] / 1000));
      this.apLen[a] = len;
      this.apL[a] = new Float32Array(len);
      this.apR[a] = new Float32Array(len);
      this.apPos[a] = 0;
    }
    this.active = true;
  }

  retune(rt60) {
    const rt = Math.max(0.2, Math.min(5.0, rt60));
    for (let c = 0; c < TAIL_COMBS; c++) {
      const dt = this.combLen[c] / this.sr;
      this.combFb[c] = Math.pow(10, -3 * dt / rt);
    }
  }

  clear() {
    for (let c = 0; c < TAIL_COMBS; c++) {
      if (this.combL[c]) this.combL[c].fill(0);
      if (this.combR[c]) this.combR[c].fill(0);
      this.combPos[c] = 0;
      this.combLpL[c] = 0;
      this.combLpR[c] = 0;
    }
    for (let a = 0; a < TAIL_APS; a++) {
      if (this.apL[a]) this.apL[a].fill(0);
      if (this.apR[a]) this.apR[a].fill(0);
      this.apPos[a] = 0;
    }
    this.active = false;
  }

  process(convL, convR) {
    if (!this.active) return { wetL: 0, wetR: 0 };
    let tL = 0, tR = 0;
    for (let c = 0; c < TAIL_COMBS; c++) {
      const idx = this.combPos[c];
      const dL = this.combL[c][idx];
      const dR = this.combR[c][idx];
      tL += dL;
      tR += dR;
      this.combLpL[c] = dL + this.damp * (this.combLpL[c] - dL);
      this.combLpR[c] = dR + this.damp * (this.combLpR[c] - dR);
      let inL = convL * 0.3 + this.combLpL[c] * this.combFb[c];
      let inR = convR * 0.3 + this.combLpR[c] * this.combFb[c];
      if (inL > 1.5) inL = 1.5; else if (inL < -1.5) inL = -1.5;
      if (inR > 1.5) inR = 1.5; else if (inR < -1.5) inR = -1.5;
      this.combL[c][idx] = inL;
      this.combR[c][idx] = inR;
      this.combPos[c]++;
      if (this.combPos[c] >= this.combLen[c]) this.combPos[c] = 0;
    }
    tL *= 0.25;
    tR *= 0.25;
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
    return { wetL: tL * 0.85, wetR: tR * 0.85 };
  }
}

class AmbienceEngine {
  constructor(sr) {
    this.sr = sr;
    this.enabled = false;
    this.intensity = 0;
    this.decaySec = 1.8;

    this.irRevL = new Float32Array(0);
    this.irRevR = new Float32Array(0);
    this.histL = new Float32Array(0);
    this.histR = new Float32Array(0);
    this.irSize = 0;
    this.histIdx = 0;

    this.tail = new DiffuseTail(sr);
  }

  loadIR(irLeft, irRight, decaySec) {
    if (!irLeft || !irRight || irLeft.length < 10) { this.clear(); return; }
    const size = irLeft.length;

    // Onset detection: first sample above 0.02
    let onset = 0;
    while (onset < size - 64) {
      if (Math.abs(irLeft[onset]) > 0.02 || Math.abs(irRight[onset]) > 0.02) break;
      onset++;
    }
    if (onset >= size - 64) onset = 0;

    const avail = Math.min(size - onset, AMB_MAX_TAPS);
    const nL = new Float32Array(avail);
    const nR = new Float32Array(avail);
    for (let i = 0; i < avail; i++) {
      nL[i] = irLeft[onset + i];
      nR[i] = irRight[onset + i];
    }

    // Energy normalization to 0.9 RMS
    let eL = 0, eR = 0;
    for (let i = 0; i < avail; i++) {
      eL += nL[i] * nL[i];
      eR += nR[i] * nR[i];
    }
    const gL = eL > 1e-12 ? 0.9 / Math.sqrt(eL) : 1;
    const gR = eR > 1e-12 ? 0.9 / Math.sqrt(eR) : 1;
    for (let i = 0; i < avail; i++) { nL[i] *= gL; nR[i] *= gR; }

    // Pre-flip kernel
    const revL = new Float32Array(avail);
    const revR = new Float32Array(avail);
    for (let i = 0; i < avail; i++) {
      revL[i] = nL[avail - 1 - i];
      revR[i] = nR[avail - 1 - i];
    }

    this.irRevL = revL;
    this.irRevR = revR;
    this.histL = new Float32Array(avail);
    this.histR = new Float32Array(avail);
    this.irSize = avail;
    this.histIdx = 0;

    this.tail.build(decaySec);
    this.decaySec = decaySec;
  }

  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }
  setEnabled(en) {
    this.enabled = en;
    if (!en) this.tail.clear();
  }
  updateDecay(sec) {
    this.decaySec = sec;
    this.tail.retune(sec);
  }

  clear() {
    this.irRevL = new Float32Array(0);
    this.irRevR = new Float32Array(0);
    this.histL = new Float32Array(0);
    this.histR = new Float32Array(0);
    this.irSize = 0;
    this.histIdx = 0;
    this.tail.clear();
  }

  processStereo(L, R) {
    if (!this.enabled || this.irSize === 0) return { l: L, r: R };
    const amb = this.intensity;
    if (amb <= 1e-3) return { l: L, r: R };

    this.histL[this.histIdx] = L;
    this.histR[this.histIdx] = R;

    const n1 = this.irSize - 1 - this.histIdx;
    let convL = 0, convR = 0;
    for (let m = 0; m < n1; m++) {
      convL += this.histL[this.histIdx + 1 + m] * this.irRevL[m];
      convR += this.histR[this.histIdx + 1 + m] * this.irRevR[m];
    }
    for (let m = 0; m <= this.histIdx; m++) {
      convL += this.histL[m] * this.irRevL[n1 + m];
      convR += this.histR[m] * this.irRevR[n1 + m];
    }

    const tailOut = this.tail.process(convL, convR);
    const wetL = convL * 0.7 + tailOut.wetL;
    const wetR = convR * 0.7 + tailOut.wetR;

    this.histIdx++;
    if (this.histIdx >= this.irSize) this.histIdx = 0;

    return {
      l: L * (1 - amb) + wetL * amb,
      r: R * (1 - amb) + wetR * amb,
    };
  }
}

// ============================================================================
// NIGHT compressor (RMS, 2:1, -24dB, 20/300ms, max -9dB)
// ============================================================================

class NightCompressor {
  constructor(sr) {
    this.sr = sr > 0 ? sr : 48000;
    this.enabled = false;
    this.thresholdLin = 0.0631;   // -24dB
    this.minGain = 0.3548;        // -9dB floor
    this.rampFrames = Math.max(8, Math.round(this.sr * 0.01)); // ~10ms
    this._recalc();
    this.rmsState = 0;
    this.gain = 1;
    this.mix = 0;
  }

  _recalc() {
    this.attackCoef = Math.exp(-1 / (0.020 * this.sr));  // 20ms
    this.releaseCoef = Math.exp(-1 / (0.300 * this.sr)); // 300ms
    this.rmsCoef = Math.exp(-1 / (0.005 * this.sr));      // 5ms
  }

  setEnabled(en) { this.enabled = en; }
  reset() { this.rmsState = 0; this.gain = 1; this.mix = 0; }

  processStereo(L, R) {
    const target = this.enabled ? 1 : 0;
    if (this.mix !== target) {
      const step = 1 / this.rampFrames;
      this.mix += (target > this.mix) ? step : -step;
      if (this.mix < 0) this.mix = 0;
      if (this.mix > 1) this.mix = 1;
    }
    if (this.mix <= 0) return { l: L, r: R };

    const meanSq = 0.5 * (L * L + R * R);
    this.rmsState += (meanSq - this.rmsState) * (1 - this.rmsCoef);
    const level = Math.sqrt(this.rmsState);

    let reduction = 1;
    if (level > this.thresholdLin) {
      reduction = (this.thresholdLin + (level - this.thresholdLin) * 0.5) / level;
    }

    const coef = reduction < this.gain ? this.attackCoef : this.releaseCoef;
    this.gain += (reduction - this.gain) * (1 - coef);

    let g = this.gain;
    if (g < this.minGain) g = this.minGain;

    const cL = L * g, cR = R * g;
    return {
      l: L + (cL - L) * this.mix,
      r: R + (cR - R) * this.mix,
    };
  }
}

// NOTE on smoothing coefficients: the TS class used exp(-1/samples) as the
// one-pole coefficient and then applied (1 - coef) as the blend factor,
// which is the standard convention. Mirrored exactly above.

// ============================================================================
// TruePeakLimiter (4xOS FIR, 1ms lookahead, soft clamp)
// ============================================================================

const FIR_TAPS = 24;
const OVERSAMPLE = 4;

class TruePeakLimiter {
  constructor(sr) {
    this.enabled = true;
    this.sr = sr;
    this._init();
  }

  _init() {
    this.lookaheadSamples = Math.max(1, Math.floor(this.sr * 0.001)); // 1ms
    this.delayL = new Float32Array(this.lookaheadSamples + 1);
    this.delayR = new Float32Array(this.lookaheadSamples + 1);
    this.writeIdx = 0;

    this.fir = [];
    for (let p = 0; p < OVERSAMPLE; p++) {
      this.fir[p] = new Array(FIR_TAPS);
      for (let i = 0; i < FIR_TAPS; i++) {
        const t = (i - (FIR_TAPS - 1) / 2) + p / OVERSAMPLE;
        if (Math.abs(t) < 1e-6) {
          this.fir[p][i] = 1;
        } else {
          const x = Math.PI * t;
          const win = 0.35875 - 0.48829 * Math.cos(2 * Math.PI * i / (FIR_TAPS - 1))
            + 0.14128 * Math.cos(4 * Math.PI * i / (FIR_TAPS - 1))
            - 0.01168 * Math.cos(6 * Math.PI * i / (FIR_TAPS - 1));
          this.fir[p][i] = (Math.sin(x) / x) * win;
        }
      }
    }

    this.histL = new Array(FIR_TAPS).fill(0);
    this.histR = new Array(FIR_TAPS).fill(0);
    this.currentGain = 1;
    this.attackStep = 1 / (this.sr * 0.0001);  // 0.1ms
    this.releaseStep = 1 / (this.sr * 0.2);    // 200ms
  }

  setEnabled(en) { this.enabled = en; }
  reset() {
    this.delayL.fill(0);
    this.delayR.fill(0);
    this.histL.fill(0);
    this.histR.fill(0);
    this.writeIdx = 0;
    this.currentGain = 1;
  }

  _softClamp(x) {
    if (x > 2.0) return 2.0 + 0.5 * Math.tanh((x - 2.0) * 2.0);
    if (x < -2.0) return -2.0 - 0.5 * Math.tanh((-x - 2.0) * 2.0);
    return x;
  }

  _truePeak(sL, sR) {
    for (let i = FIR_TAPS - 1; i > 0; i--) {
      this.histL[i] = this.histL[i - 1];
      this.histR[i] = this.histR[i - 1];
    }
    this.histL[0] = sL;
    this.histR[0] = sR;

    let maxP = 0;
    for (let p = 0; p < OVERSAMPLE; p++) {
      let iL = 0, iR = 0;
      const fp = this.fir[p];
      for (let i = 0; i < FIR_TAPS; i++) {
        iL += this.histL[i] * fp[i];
        iR += this.histR[i] * fp[i];
      }
      const aL = Math.abs(iL), aR = Math.abs(iR);
      if (aL > maxP) maxP = aL;
      if (aR > maxP) maxP = aR;
    }
    return maxP;
  }

  processStereo(L, R) {
    if (!this.enabled) return { l: L, r: R };

    const threshold = 0.98;
    const knee = 0.02;

    let inL = this._softClamp(L);
    let inR = this._softClamp(R);
    if (!isFinite(inL)) inL = 0;
    if (!isFinite(inR)) inR = 0;

    const tp = this._truePeak(inL, inR);

    let targetGain = 1;
    if (tp > threshold - knee) {
      if (tp > threshold + knee) {
        targetGain = threshold / tp;
      } else {
        const x = (tp - (threshold - knee)) / (2 * knee);
        targetGain = 1 - (1 - threshold / (threshold + knee)) * x * x;
      }
    }

    if (this.currentGain > targetGain) {
      this.currentGain = Math.max(targetGain, this.currentGain - this.attackStep);
    } else {
      this.currentGain = Math.min(1, this.currentGain + this.releaseStep);
    }

    const readIdx = (this.writeIdx + 1) % (this.lookaheadSamples + 1);
    const outL = this.delayL[readIdx] * this.currentGain;
    const outR = this.delayR[readIdx] * this.currentGain;

    this.delayL[this.writeIdx] = inL;
    this.delayR[this.writeIdx] = inR;
    this.writeIdx = (this.writeIdx + 1) % (this.lookaheadSamples + 1);

    return { l: isFinite(outL) ? outL : 0, r: isFinite(outR) ? outR : 0 };
  }
}

// ============================================================================
// RestorationEngine (harmonic excitation + transient punch)
// ============================================================================

class RestorationEngine {
  constructor(sr) {
    this.enabled = false;
    this.envL = 0;
    this.envR = 0;
    this.prevL = 0;
    this.prevR = 0;
  }

  setEnabled(en) { this.enabled = en; }
  reset() { this.envL = 0; this.envR = 0; this.prevL = 0; this.prevR = 0; }

  processStereo(L, R) {
    if (!this.enabled) return { l: L, r: R };

    const punch = 0.65;
    const harmonicGain = 0.08;
    const release = 0.9996;

    // Left
    let diffL = Math.abs(L - this.prevL);
    this.prevL = L;
    if (diffL > this.envL) this.envL = diffL;
    else this.envL *= release;
    const wetL = Math.tanh(L * 1.05);
    const harmL = (wetL - L) * harmonicGain;
    const gainL = 1 + Math.min(0.5, this.envL * punch * 15);
    let outL = (L + harmL) * gainL;
    if (!isFinite(outL)) outL = 0;

    // Right
    let diffR = Math.abs(R - this.prevR);
    this.prevR = R;
    if (diffR > this.envR) this.envR = diffR;
    else this.envR *= release;
    const wetR = Math.tanh(R * 1.05);
    const harmR = (wetR - R) * harmonicGain;
    const gainR = 1 + Math.min(0.5, this.envR * punch * 15);
    let outR = (R + harmR) * gainR;
    if (!isFinite(outR)) outR = 0;

    return { l: outL, r: outR };
  }
}

// ============================================================================
// PhaseInverter (1ms equal-gain linear ramp)
// ============================================================================

class PhaseInverter {
  constructor(sr) {
    this.rampMs = 1;
    this.sr = sr;
    this.rampTotal = this._frames(sr);
    this.rampPos = this.rampTotal;
    this.current = false;
    this.ramping = false;
    this.primed = false;
    this.target = false;
  }

  _frames(hz) {
    let frames = Math.round((this.rampMs / 1000) * hz);
    if (frames < 8) frames = 8;
    if (frames > 256) frames = 256;
    return frames;
  }

  setInverted(inv) { this.target = inv; }
  isInverted() { return this.target; }
  reset() {
    this.current = false;
    this.ramping = false;
    this.primed = false;
    this.rampPos = this.rampTotal;
    this.target = false;
  }

  processStereo(L, R) {
    const wantRamp = this.target !== this.current;
    if (!this.primed) {
      this.current = this.target;
      this.primed = true;
      this.ramping = false;
      this.rampPos = this.rampTotal;
    }

    if (wantRamp && !this.ramping) {
      this.ramping = true;
      this.rampPos = 0;
    }

    if (this.ramping) {
      const startT = this.rampPos / this.rampTotal;
      const step = 1 / this.rampTotal;
      const t = startT + step * 0.5;
      const gain = this.current === this.target
        ? 1
        : (this.current ? (2 * t - 1) : (1 - 2 * t));
      this.rampPos++;
      if (this.rampPos >= this.rampTotal) {
        this.ramping = false;
        this.current = this.target;
        this.rampPos = this.rampTotal;
      }
      return { l: L * gain, r: R * gain };
    }

    if (this.current) return { l: -L, r: -R };
    return { l: L, r: R };
  }
}

// ============================================================================
// Main DSP Processor
// ============================================================================

class DspProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;

    // Hum filters (2 cascaded: HP -> Notch)
    this.humHp = new StereoBiquad();
    this.humNotch = new StereoBiquad();
    this.humOn = false;

    // EQ: 3 stages × MAX_BANDS
    this.eqBanks = [[], [], []];
    for (let s = 0; s < 3; s++) {
      for (let b = 0; b < MAX_BANDS; b++) this.eqBanks[s].push(new StereoBiquad());
    }
    this.stageCounts = [0, 0, 0];

    // Effect engines
    this.restoration = new RestorationEngine(this.sr);
    this.tube = new TubeEngine(this.sr);
    this.spatial = new SpatialMatrix(this.sr);
    this.ambience = new AmbienceEngine(this.sr);
    this.compressor = new NightCompressor(this.sr);
    this.limiter = new TruePeakLimiter(this.sr);
    this.phase = new PhaseInverter(this.sr);

    // Master state
    this.bypass = false;
    this.preampLin = 1;
    this.makeupGuardLin = 1;
    this.masterLin = 1;
    this.paused = false;
    this.humFilterId = 'OFF';

    // Eval grids
    this.evalFreq = new Array(GUARD_EVAL_PTS);
    for (let k = 0; k < GUARD_EVAL_PTS; k++) {
      this.evalFreq[k] = 20 * Math.pow(10, 3 * k / (GUARD_EVAL_PTS - 1));
    }
    this.netFreq = new Array(STAGE_NET_PTS);
    for (let k = 0; k < STAGE_NET_PTS; k++) {
      this.netFreq[k] = 20 * Math.pow(10, 3 * k / (STAGE_NET_PTS - 1));
    }
    this.eqEvalLog = new Array(GUARD_EVAL_PTS);

    // IR store
    this.irs = new Map();
    this.ambRt60 = 1.8;
    this.curIrName = null;

    this.port.onmessage = (e) => this._onMessage(e.data);
  }

  _onMessage(d) {
    if (!d) return;
    switch (d.type) {
      case 'params': this._applyParams(d.payload); break;
      case 'volume':
        this.masterLin = (isFinite(d.volume) && d.volume >= 0) ? d.volume : 1;
        break;
      case 'ir':     this._storeIr(d.name, d.left, d.right); break;
      case 'pause':  this.paused = true; break;
      case 'resume': this.paused = false; break;
      case 'stop':
      case 'flush':
        this.limiter.reset();
        this.phase.primed = false; // re-adopt polarity on next stream
        break;
      case 'seek':
        this.limiter.reset();
        this.ambience.tail.clear();
        break;
    }
  }

  _storeIr(name, left, right) {
    if (!name || !left || !right) return;
    this.irs.set(name, {
      left: new Float32Array(left),
      right: new Float32Array(right),
    });
    if (this.curIrName === name) this._loadIr(name);
  }

  _loadIr(name) {
    const entry = this.irs.get(name);
    if (entry) this.ambience.loadIR(entry.left, entry.right, this.ambRt60);
  }

  _applyParams(p) {
    if (!p) return;
    const sr = this.sr;
    this.bypass = !!p.bypass;

    // 1. Preamp
    const preampDb = (p.preampDb || 0) + (p.loudnessDb || 0);
    this.preampLin = Math.pow(10, Math.max(-12, Math.min(12, preampDb)) / 20);

    // 2. Hum
    this.humFilterId = p.humFilter || 'OFF';
    if (this.humFilterId === '50HZ' || this.humFilterId === '60HZ') {
      this.humHp.setFromConfig(sr, { type: 'highpass', freq: 20, gain: 0, q: 0.7 });
      const notchF = this.humFilterId === '50HZ' ? 50 : 60;
      this.humNotch.setFromConfig(sr, { type: 'notch', freq: notchF, gain: 0, q: 4 });
      this.humOn = true;
    } else {
      this.humOn = false;
    }

    // 3. EQ banks: [0]=SOURCE, [1]=OUTPUT, [2]=CALIB
    const stages = [
      p.srcEqBands || [],
      p.outEqBands || [],
      p.bands || [],
    ];
    for (let s = 0; s < 3; s++) {
      const list = stages[s];
      const count = Math.min(list.length, MAX_BANDS);
      this.stageCounts[s] = count;
      for (let b = 0; b < count; b++) {
        this.eqBanks[s][b].setFromConfig(sr, list[b]);
      }
    }

    // 4. stageNetLog (24-pt log grid geometric mean per stage)
    const stageNetLog = [0, 0, 0];
    for (let s = 0; s < 3; s++) {
      const count = this.stageCounts[s];
      if (count === 0) continue;
      let sum = 0;
      for (let k = 0; k < STAGE_NET_PTS; k++) {
        let netLog = 0;
        for (let b = 0; b < count; b++) {
          netLog += this.eqBanks[s][b].logMagnitude(this.netFreq[k], sr);
        }
        sum += netLog;
      }
      stageNetLog[s] = sum / STAGE_NET_PTS;
    }

    // 5. Makeup: exp(-(ln preamp + Σ stageNetLog)), cap +12dB, floor 1.0
    let g = Math.log(this.preampLin) + stageNetLog[0] + stageNetLog[1] + stageNetLog[2];
    let makeup = Math.exp(-g);
    if (!isFinite(makeup)) makeup = 1;
    if (makeup > MAKEUP_CAP) makeup = MAKEUP_CAP;
    if (makeup < 1) makeup = 1;

    // 6. V6.5 G1 headroom guard (192-pt grid, ceiling +6dB)
    for (let k = 0; k < GUARD_EVAL_PTS; k++) this.eqEvalLog[k] = 0;
    for (let s = 0; s < 3; s++) {
      const count = this.stageCounts[s];
      for (let b = 0; b < count; b++) {
        const bq = this.eqBanks[s][b];
        for (let k = 0; k < GUARD_EVAL_PTS; k++) {
          this.eqEvalLog[k] += bq.logMagnitude(this.evalFreq[k], sr);
        }
      }
    }
    let peakEqLn = -1e9;
    for (let k = 0; k < GUARD_EVAL_PTS; k++) {
      if (this.eqEvalLog[k] > peakEqLn) peakEqLn = this.eqEvalLog[k];
    }
    const peakPostDb =
      (Math.log(this.preampLin) + peakEqLn + Math.log(makeup)) * LN_TO_DB;
    let guard = 1;
    if (peakPostDb > GUARD_CEILING_DB) {
      guard = Math.exp((GUARD_CEILING_DB - peakPostDb) / LN_TO_DB);
      if (!isFinite(guard) || guard < 0) guard = 1;
    }

    this.makeupGuardLin = makeup * guard;

    // 7. NIGHT compressor
    this.compressor.setEnabled(!!p.night);

    // 8. Crossfeed / spatial
    const cf = p.crossfeed || null;
    const angle = cf ? (cf.angle || 0) : 0;
    const depthStr = cf ? (cf.depth || 'NORMAL') : 'NORMAL';
    const depthMap = {
      INTIMATE: 0.5, NEAR: 0.8, NORMAL: 1.0, FAR: 1.5, DEEP: 2.5,
    };
    const depth = depthMap[depthStr] !== undefined ? depthMap[depthStr] : 1.0;
    this.spatial.setParams(
      angle,
      depth,
      !!(cf && (angle > 0 || depthStr !== 'OFF'))
    );

    // 9. Ambience
    const amb = p.ambience || null;
    if (amb && amb.ir) {
      this.ambience.setEnabled(true);
      this.ambience.setIntensity(amb.intensity || 0);
      const rt60Map = {
        HALL: 1.8, 'JAZZ CLUB': 0.9, 'LARGE HALL': 2.6, CHURCH: 3.5,
      };
      const newRt60 = rt60Map[amb.ir] !== undefined ? rt60Map[amb.ir] : 1.8;
      if (amb.ir !== this.curIrName || newRt60 !== this.ambRt60) {
        this.curIrName = amb.ir;
        this.ambRt60 = newRt60;
        this._loadIr(amb.ir);
      } else {
        this.ambience.updateDecay(newRt60);
      }
    } else {
      this.ambience.setEnabled(false);
      this.curIrName = null;
    }

    // 10. Tube
    const tube = p.tube || null;
    if (tube && tube.enabled) {
      this.tube.setParams(tube.type === 'KT88' ? 1 : 0, tube.bias || 0, true);
    } else {
      this.tube.setParams(0, 0, false);
    }

    // 11. Restoration
    this.restoration.setEnabled(!!p.restoration);

    // 12. Phase inversion
    this.phase.setInverted(!!p.phaseInverted);
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const chL = out[0];
    const chR = out.length > 1 ? out[1] : out[0];
    const n = chL.length;

    const input = inputs[0];
    const inL = input && input.length > 0 ? input[0] : null;
    const inR = input && input.length > 1 ? input[1] : null;

    if (this.paused) {
      chL.fill(0);
      chR.fill(0);
      return true;
    }

    if (this.bypass) {
      for (let i = 0; i < n; i++) {
        chL[i] = inL ? inL[i] : 0;
        chR[i] = inR ? inR[i] : 0;
      }
      return true;
    }

    const preamp = this.preampLin;
    const mkGuard = this.makeupGuardLin;
    const master = this.masterLin;
    const humOn = this.humOn;
    const humHp = this.humHp;
    const humNotch = this.humNotch;
    const eq0 = this.eqBanks[0], c0 = this.stageCounts[0];
    const eq1 = this.eqBanks[1], c1 = this.stageCounts[1];
    const eq2 = this.eqBanks[2], c2 = this.stageCounts[2];
    const tube = this.tube, tubeOn = tube.enabled;
    const spatial = this.spatial, spatialOn = spatial.enabled;
    const restoration = this.restoration, restoreOn = restoration.enabled;
    const ambience = this.ambience, ambienceOn =
      ambience.enabled && ambience.irSize > 0 && ambience.intensity > 1e-3;
    const compressor = this.compressor;
    const nightOn = compressor.enabled || compressor.mix > 0;
    const limiter = this.limiter;
    const phase = this.phase;

    for (let i = 0; i < n; i++) {
      let L = inL ? inL[i] : 0;
      let R = inR ? inR[i] : 0;
      if (!isFinite(L)) L = 0;
      if (!isFinite(R)) R = 0;

      // 1. preamp
      L *= preamp;
      R *= preamp;

      // 2. hum removal
      if (humOn) {
        let f = humHp.process(L, R);
        f = humNotch.process(f.l, f.r);
        L = f.l; R = f.r;
      }

      // 3. EQ stages
      for (let b = 0; b < c0; b++) {
        const f = eq0[b].process(L, R);
        L = f.l; R = f.r;
      }
      for (let b = 0; b < c1; b++) {
        const f = eq1[b].process(L, R);
        L = f.l; R = f.r;
      }
      for (let b = 0; b < c2; b++) {
        const f = eq2[b].process(L, R);
        L = f.l; R = f.r;
      }

      // 4. makeup × headroom guard (single multiply)
      L *= mkGuard;
      R *= mkGuard;

      // 5. restoration → tube → spatial → ambience
      if (restoreOn) {
        const f = restoration.processStereo(L, R);
        L = f.l; R = f.r;
      }
      if (tubeOn) {
        const f = tube.processStereo(L, R);
        L = f.l; R = f.r;
      }
      if (spatialOn) {
        const f = spatial.processStereo(L, R);
        L = f.l; R = f.r;
      }
      if (ambienceOn) {
        const f = ambience.processStereo(L, R);
        L = f.l; R = f.r;
      }

      // 6. NIGHT compression
      if (nightOn) {
        const f = compressor.processStereo(L, R);
        L = f.l; R = f.r;
      }

      // 7. true-peak limiter
      {
        const f = limiter.processStereo(L, R);
        L = f.l; R = f.r;
      }

      // 8. master volume × tanh soft clip (knee 0.98)
      L = _softClipMaster(L * master);
      R = _softClipMaster(R * master);

      // 9. phase inversion
      {
        const f = phase.processStereo(L, R);
        L = f.l; R = f.r;
      }

      chL[i] = L;
      chR[i] = R;
    }

    return true;
  }
}

function _softClipMaster(v) {
  const knee = 0.98;
  if (v > knee) return knee + (1 - knee) * Math.tanh((v - knee) / (1 - knee));
  if (v < -knee) return -(knee + (1 - knee) * Math.tanh((-v - knee) / (1 - knee)));
  return v;
}

registerProcessor('dsp-processor', DspProcessor);
