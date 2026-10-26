/**
 * PCM Stream Worker (R6.1 - persistent across tracks)
 *
 * Created ONCE per app run; reused for every streaming session.
 * Handles deferred start (start may arrive before init-io completes).
 */
let io = null;
let ctrl = null;
let leftover = null;
let creditQueue = [];
let pendingStart = null;

const CHUNK_BYTES = 131072;

self.onmessage = (e) => {
  const m = e.data;
  if (!m) return;
  switch (m.type) {
    case 'init-io':
      io = m.port;
      io.onmessage = (ev) => onIo(ev.data);
      self.postMessage({ type: 'ready' });
      if (pendingStart) {
        const p = pendingStart;
        pendingStart = null;
        doStart(p);
      }
      break;
    case 'start':
      if (ctrl) ctrl.abort(); // safety: single active session
      // Purge stale credit waiters from previous sessions: they would
      // otherwise swallow the primed credit and STARVE the new pump
      // (root cause of "worker session failed (no position reports)").
      creditQueue.length = 0;
      if (io) doStart(m);
      else pendingStart = m;
      break;
    case 'stop':
      pendingStart = null;
      creditQueue.length = 0;
      if (ctrl) ctrl.abort();
      break;
  }
};

function doStart(m) {
  pump(m.url, m.srcRate);
}

function onIo(d) {
  if (!d) return;
  if (d.type === 'credit') {
    const w = creditQueue.shift();
    if (w) w(true);
    return;
  }
  if (d.type === 'position') {
    self.postMessage(d); // relay TRUE clock to main, verbatim
  }
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function takeCredit() {
  return new Promise((resolve) => {
    const w = creditQueue.shift();
    if (w) resolve(true);
    else creditQueue.push(resolve);
  });
}

async function pump(url, srcRate) {
  ctrl = new AbortController();
  leftover = null;
  try {
    io.postMessage({ type: 'config', srcRate: srcRate });
    io.postMessage({ type: 'flush' }); // primes one credit

    const res = await fetch(url, { signal: ctrl.signal });
    const reader = res.body ? res.body.getReader() : null;
    if (!reader) {
      self.postMessage({ type: 'error', message: 'No readable body from native server' });
      return;
    }

    let sentFrames = 0;
    let lastDiag = Date.now();

    for (;;) {
      await takeCredit(); // resilient: waits through HW-audio suspends

      let buf = leftover;
      leftover = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        buf = buf ? concat(buf, value) : value;
        if (buf.length >= CHUNK_BYTES) break;
      }
      if (!buf || buf.length === 0) break;

      const validLength = Math.floor(buf.length / 8) * 8;
      if (validLength > 0) {
        const payload = buf.buffer.slice(buf.byteOffset, buf.byteOffset + validLength);
        io.postMessage({ type: 'pcm', data: payload }, [payload]);
        sentFrames += validLength / 8;
      }
      if (validLength < buf.length) leftover = buf.slice(validLength);

      if (Date.now() - lastDiag > 5000) {
        lastDiag = Date.now();
        self.postMessage({ type: 'diag', sent: sentFrames / srcRate });
      }
    }
    self.postMessage({ type: 'stream-ended', sent: sentFrames / srcRate });
  } catch (e) {
    if (e && e.name !== 'AbortError') {
      self.postMessage({ type: 'error', message: String((e && e.message) || e) });
    }
  }
}
