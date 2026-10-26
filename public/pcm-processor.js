/**
 * PCM Stream Processor (R6.2)
 *
 * Transport-agnostic ring buffer (Chrome Audio Worklet design pattern).
 *
 * Rate strategy:
 *   - Context is rate-matched host-side for sources <= 96kHz => ratio == 1,
 *     integer passthrough, BIT-TRANSPARENT into the DSP graph.
 *   - Sources > 96kHz (e.g. 192k) are downsampled here with cubic Hermite
 *     interpolation to the context rate (audibly transparent for <=24k content).
 *
 * Quality guarantees:
 *   - NaN gate, cursor clamped to written window, no stale reads by construction.
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.CAPACITY_FRAMES = 524288; // power of 2 (~5.5s @96k stereo)
    this.MARGIN = 8192;
    this.MASK = this.CAPACITY_FRAMES - 1;
    this.ring = new Float32Array(this.CAPACITY_FRAMES * 2);

    this.LOW_WATER_FRAMES = Math.max(8192, Math.ceil(sampleRate * 1.5));
    this.INFLIGHT_MAX = 4;

    this.writeAbs = 0;     // total input frames ever written
    this.readAbs = 0.0;    // fractional read cursor (input-frame domain)
    this.framesPlayed = 0; // output frames delivered

    this.srcRate = sampleRate;
    this.paused = false;
    this.inflight = 0;
    this.io = null;

    this.lastReportedFrame = 0;
    this.reportInterval = Math.max(256, Math.ceil(sampleRate * 0.08));

    this.underrunBlocks = 0;
    this.overrunEvents = 0;
    this.winPeak = 0;
    this.winSumSq = 0;
    this.winCnt = 0;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  get out() { return this.io || this.port; }

  get ratio() { return this.srcRate / sampleRate; }

  handleMessage(d) {
    if (!d) return;
    switch (d.type) {
      case 'init-port':
        this.io = d.port;
        this.io.onmessage = (e) => this.handleMessage(e.data);
        break;
      case 'config':
        if (d.srcRate && d.srcRate > 0) this.srcRate = d.srcRate;
        break;
      case 'pcm':
        this.appendData(new Float32Array(d.data));
        this.inflight--;
        break;
      case 'flush':
        this.writeAbs = 0;
        this.readAbs = 0;
        this.framesPlayed = 0;
        this.lastReportedFrame = 0;
        this.paused = false;
        this.underrunBlocks = 0;
        this.overrunEvents = 0;
        this.inflight = 1;
        this.winPeak = 0;
        this.winSumSq = 0;
        this.winCnt = 0;
        this.out.postMessage({ type: 'credit' }); // prime the pump
        break;
      case 'pause':
        this.paused = true;
        break;
      case 'resume':
        this.paused = false;
        break;
      // Called by the host when the worker transport died: fall back to
      // delivering credits/positions on node.port so the R5 inline pump
      // can drive this processor.
      case 'detach':
        try { if (this.io) this.io.onmessage = null; } catch (e) { /* ignore */ }
        this.io = null;
        break;
    }
  }

  appendData(f) {
    let i = 0;
    while (i + 1 < f.length) { // whole stereo frames only
      const w = (this.writeAbs & this.MASK) << 1;
      this.ring[w] = f[i];
      this.ring[w + 1] = f[i + 1];
      this.writeAbs++;
      i += 2;
    }
    const maxLag = this.CAPACITY_FRAMES - this.MARGIN;
    if (this.writeAbs - this.readAbs > maxLag) {
      this.readAbs = this.writeAbs - maxLag;
      this.overrunEvents++;
    }
  }

  sampleAt(frame, ch) {
    return this.ring[((frame & this.MASK) << 1) + ch];
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const chL = out[0];
    const chR = out.length > 1 ? out[1] : out[0];
    const n = chL.length;

    if (this.paused) {
      chL.fill(0);
      chR.fill(0);
      return true;
    }

    // Defensive clamp: cursor must ALWAYS be inside the valid window
    const minValid = this.writeAbs - (this.CAPACITY_FRAMES - this.MARGIN);
    if (this.readAbs < minValid) this.readAbs = minValid;
    if (this.readAbs > this.writeAbs) this.readAbs = this.writeAbs;

    const ratio = this.ratio;
    const passthrough = Math.abs(ratio - 1) < 1e-6;
    let produced = 0;
    let badSamples = 0;

    for (let i = 0; i < n; i++) {
      const n1 = Math.floor(this.readAbs);

      let l, r, advance;
      if (passthrough) {
        if (n1 >= this.writeAbs) break;
        l = this.sampleAt(n1, 0);
        r = this.sampleAt(n1, 1);
        advance = 1;
      } else {
        const n0 = n1 - 1 < 0 ? n1 : n1 - 1;
        const n2 = n1 + 1;
        const n3 = n1 + 2;
        if (n2 >= this.writeAbs) break; // need n1 & n2 at minimum
        const n3c = Math.min(n3, this.writeAbs - 1);
        const t = this.readAbs - n1;
        // Catmull-Rom (cubic Hermite) per channel
        l = catmull(this.sampleAt(n0, 0), this.sampleAt(n1, 0),
                    this.sampleAt(n2, 0), this.sampleAt(n3c, 0), t);
        r = catmull(this.sampleAt(n0, 1), this.sampleAt(n1, 1),
                    this.sampleAt(n2, 1), this.sampleAt(n3c, 1), t);
        advance = ratio;
      }

      if (!isFinite(l)) { l = 0; badSamples++; }
      if (!isFinite(r)) { r = 0; badSamples++; }
      chL[i] = l;
      chR[i] = r;

      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      if (al > this.winPeak) this.winPeak = al;
      if (ar > this.winPeak) this.winPeak = ar;
      this.winSumSq += l * l + r * r;
      this.winCnt += 2;

      this.readAbs += advance;
      produced++;
      this.framesPlayed++;
    }

    for (let i = produced; i < n; i++) {
      chL[i] = 0;
      chR[i] = 0;
    }
    if (produced < n) this.underrunBlocks++;

    // Pull-model grant: request more data when below low watermark
    const avail = this.writeAbs - Math.floor(this.readAbs);
    if (avail < this.LOW_WATER_FRAMES && this.inflight < this.INFLIGHT_MAX) {
      this.inflight++;
      this.out.postMessage({ type: 'credit' });
    }

    if (
      produced > 0 &&
      this.framesPlayed - this.lastReportedFrame >= this.reportInterval
    ) {
      this.lastReportedFrame = this.framesPlayed;
      const rms = this.winCnt > 0 ? Math.sqrt(this.winSumSq / this.winCnt) : 0;
      this.out.postMessage({
        type: 'position',
        frames: this.framesPlayed,
        ctxRate: sampleRate,
        underrun: this.underrunBlocks,
        overrun: this.overrunEvents,
        bad: badSamples,
        avail: avail,
        peak: this.winPeak,
        rms: rms,
      });
      this.winPeak = 0;
      this.winSumSq = 0;
      this.winCnt = 0;
    }

    return true;
  }
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

registerProcessor('pcm-processor', PcmProcessor);
