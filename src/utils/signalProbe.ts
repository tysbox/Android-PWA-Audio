/**
 * SIGNAL-FIRST probe for the PWA: parse an audio File's header to extract the
 * decoder-measured signal truth (format / sample rate / bit depth).
 *
 * Mirrors the Android native TrackMetadata: what the file actually IS, not
 * what the playback session renders. WikiModal's Signal tab reads these via
 * onMetadataUpdate({ format, srcRate, srcBits }).
 *
 * Supported: FLAC (STREAMINFO), WAV/AIFF (fmt/COMM chunk), MP3/AAC (frame
 * header), DSF/DFF (DSD header), M4A (mp4a/esds box), OGG/OPUS (id page).
 * Never throws — returns nulls on any parse failure.
 */

export interface SignalTruth {
  format: string;      // 'FLAC' | 'PCM WAV' | 'PCM AIFF' | 'MP3' | 'AAC' | 'ALAC' | 'DSD' | 'OGG' | 'OPUS' | ...
  sampleRate: number;  // Hz (DSD: e.g. 2822400 for 2.8224 MHz)
  bitDepth: number;    // 16/24/32 for PCM, 1 for DSD, 0 = unknown
}

const MPEG1_SR: Record<number, number> = { 0b00: 44100, 0b01: 48000, 0b10: 32000 };
const MPEG2_SR: Record<number, number> = { 0b00: 22050, 0b01: 24000, 0b10: 16000 };

async function readHead(file: File, len: number): Promise<Uint8Array> {
  const buf = await file.slice(0, Math.min(file.size, len)).arrayBuffer();
  return new Uint8Array(buf);
}

/** FLAC STREAMINFO: block type 0, fixed 34-byte body at offset 8. */
function parseFlac(u: Uint8Array, dv: DataView): SignalTruth | null {
  let p = 4;
  while (p + 4 <= u.length) {
    const last = (u[p] & 0x80) !== 0;
    const type = u[p] & 0x7f;
    const len = (u[p + 1] << 16) | (u[p + 2] << 8) | u[p + 3];
    if (type === 0 && p + 4 + 18 <= u.length) {
      // STREAMINFO body: minBlock(2) maxBlock(2) minFrame(3) maxFrame(3) then packed 8 bytes
      const b = p + 4 + 10; // skip block/frame sizes
      // 20 bits sampleRate | 3 bits channels-1 | 5 bits bitsPerSample-1 | 36 bits totalSamples
      const w0 = dv.getUint32(b);
      const sampleRate = w0 >>> 12;
      const channels = ((w0 >>> 9) & 0x7) + 1;
      const bits = ((w0 >>> 4) & 0x1f) + 1;
      if (sampleRate >= 8000 && sampleRate <= 384000 && bits >= 4) {
        return { format: 'FLAC', sampleRate, bitDepth: bits };
      }
      void channels;
    }
    p += 4 + len;
    if (last) break;
  }
  return null;
}

/** RIFF WAV: locate 'fmt ' chunk. */
function parseWav(u: Uint8Array, dv: DataView): SignalTruth | null {
  if (u.length < 44) return null;
  let p = 12; // after 'RIFF' size 'WAVE'
  while (p + 8 <= u.length) {
    const id = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]);
    const size = dv.getUint32(p + 4, true);
    if (id === 'fmt ' && p + 8 + 16 <= u.length) {
      const audioFmt = dv.getUint16(p + 8, true);
      const channels = dv.getUint16(p + 10, true);
      const sampleRate = dv.getUint32(p + 12, true);
      const bits = dv.getUint16(p + 22, true);
      void channels;
      if (sampleRate > 0 && bits > 0) {
        // 0xFFFE = WAVE_FORMAT_EXTENSIBLE (24/32-bit float etc.)
        const fmt = audioFmt === 3 ? 'PCM WAV (Float)' : audioFmt === 1 ? 'PCM WAV' : 'PCM WAV';
        return { format: fmt, sampleRate, bitDepth: bits };
      }
    }
    p += 8 + size + (size & 1);
  }
  return null;
}

/** AIFF 'COMM' chunk: 80-bit extended float sample rate. */
function parseAiff(u: Uint8Array, dv: DataView): SignalTruth | null {
  let p = 12;
  while (p + 8 <= u.length) {
    const id = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]);
    const size = dv.getUint32(p + 4);
    if (id === 'COMM' && p + 8 + 18 <= u.length) {
      const channels = dv.getUint16(p + 8);
      const bits = dv.getUint16(p + 14);
      // 80-bit extended float: exponent(16) + mantissa(64); value = mant * 2^(exp-16383)
      const exp = dv.getUint16(p + 18);
      const hi = dv.getUint32(p + 20);
      const sampleRate = hi * Math.pow(2, exp - 16383 - 32);
      void channels;
      if (sampleRate > 0 && bits > 0) {
        return { format: 'PCM AIFF', sampleRate: Math.round(sampleRate), bitDepth: bits };
      }
    }
    p += 8 + size + (size & 1);
  }
  return null;
}

/** MPEG audio frame header (MP3 / AAC-in-ADTS heuristics by extension). */
function parseMpeg(u: Uint8Array, ext: string): SignalTruth | null {
  for (let i = 0; i < Math.min(u.length - 4, 65536); i++) {
    if (u[i] === 0xff && (u[i + 1] & 0xe0) === 0xe0) {
      const versionBits = (u[i + 1] >>> 3) & 0x3;  // 3=MPEG1, 2=MPEG2/2.5
      const layerBits = (u[i + 1] >>> 1) & 0x3;    // 1=Layer III
      const srBits = (u[i + 2] >>> 2) & 0x3;
      if (srBits === 0b11) continue; // reserved
      const sr = versionBits === 3 ? MPEG1_SR[srBits] : MPEG2_SR[srBits];
      if (!sr) continue;
      if (layerBits === 0b01) {
        if (ext === 'aac' || ext === 'm4a') return { format: 'AAC', sampleRate: sr, bitDepth: 16 };
        return { format: 'MP3', sampleRate: sr, bitDepth: 16 };
      }
      return { format: 'MP3', sampleRate: sr, bitDepth: 16 };
    }
  }
  return null;
}

/** DSF: 'DSD ' chunk + 'fmt ' with samplingFrequency (1-bit DSD). */
function parseDsf(u: Uint8Array, dv: DataView): SignalTruth | null {
  // DSF: offset 28 = fmt chunk start; offset 40 = samplingFrequency (LE32)
  if (u.length < 52) return null;
  const sr = dv.getUint32(40, true);
  if (sr >= 2822400 || sr === 44100 * 64 || sr === 48000 * 64) {
    return { format: 'DSD', sampleRate: sr, bitDepth: 1 };
  }
  return null;
}

/** DFF (DSDIFF): 'FRM8' ... 'FS  ' chunk holds big-endian sample rate. */
function parseDff(u: Uint8Array, dv: DataView): SignalTruth | null {
  // Find 'FS  ' chunk in the first 4KB
  for (let p = 0; p + 8 <= u.length; p++) {
    if (u[p] === 0x46 && u[p + 1] === 0x53 && u[p + 2] === 0x20 && u[p + 3] === 0x20) {
      const sr = dv.getUint32(p + 8); // big-endian
      if (sr >= 2822400) return { format: 'DSD', sampleRate: sr, bitDepth: 1 };
    }
  }
  return null;
}

/** M4A/MP4: walk to 'mp4a' sample entry — sampleRate is 16.16 fixed. */
function parseMp4(u: Uint8Array, dv: DataView): SignalTruth | null {
  for (let p = 0; p + 8 <= Math.min(u.length, 262144); p++) {
    if (u[p] === 0x6d && u[p + 1] === 0x70 && u[p + 2] === 0x34 && u[p + 3] === 0x61) { // 'mp4a'
      // AudioSampleEntry: reserved(6) dataRefIndex(2) ver(2) rev(2) vendor(4)
      // channels(2) sampleSize(2) compressionID(2) packetSize(2) sampleRate(4, 16.16 fixed)
      const base = p + 4;
      if (base + 28 > u.length) break;
      const channels = dv.getUint16(base + 16);
      const sampleSize = dv.getUint16(base + 18);
      const srFixed = dv.getUint32(base + 24);
      const sr = srFixed >>> 16;
      if (sr > 0) {
        const isAlac = u[p - 4] === 0x61 && u[p - 3] === 0x6c && u[p - 2] === 0x61 && u[p - 1] === 0x63;
        return {
          format: isAlac ? 'ALAC' : 'AAC (M4A)',
          sampleRate: sr,
          bitDepth: sampleSize || 16,
        };
      }
      void channels;
    }
  }
  return null;
}

/** OGG: id header page carries Vorbis/Opus sample rate. */
function parseOgg(u: Uint8Array, dv: DataView, ext: string): SignalTruth | null {
  // '\x01vorbis' at ~28: version(4) channels(1) rate(4 LE)
  for (let p = 0; p + 32 <= u.length; p++) {
    if (u[p] === 0x01 && u[p + 1] === 0x76 && u[p + 2] === 0x6f && u[p + 3] === 0x72) {
      const channels = u[p + 11];
      const sr = dv.getUint32(p + 12, true);
      void channels;
      if (sr > 0) return { format: 'OGG Vorbis', sampleRate: sr, bitDepth: 0 };
    }
    if (u[p] === 0x4f && u[p + 1] === 0x70 && u[p + 2] === 0x75 && u[p + 3] === 0x73) { // 'Opus'
      return { format: 'OPUS', sampleRate: 48000, bitDepth: 0 }; // Opus decodes to 48k
    }
  }
  void ext;
  return null;
}

/**
 * Probe a File's header for its true signal format.
 * Returns null for unrecognized data (caller falls back to metadata-only).
 */
export async function probeSignalTruth(file: File): Promise<SignalTruth | null> {
  try {
    const head = await readHead(file, 1_048_576);
    if (head.length < 12) return null;
    const dv = new DataView(head.buffer as ArrayBuffer, head.byteOffset, head.byteLength);

    // Container magics
    if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) { // fLaC
      const r = parseFlac(head, dv); if (r) return r;
    }
    if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46
        && head[8] === 0x57 && head[9] === 0x41 && head[10] === 0x56 && head[11] === 0x45) { // RIFF/WAVE
      const r = parseWav(head, dv); if (r) return r;
    }
    if (head[0] === 0x46 && head[1] === 0x4f && head[2] === 0x52 && head[3] === 0x4d) { // FORM/AIFF
      const r = parseAiff(head, dv); if (r) return r;
    }
    if (head[0] === 0x44 && head[1] === 0x53 && head[2] === 0x44 && head[3] === 0x20) { // 'DSD '
      const r = parseDsf(head, dv); if (r) return r;
    }
    if (head[0] === 0x46 && head[1] === 0x52 && head[2] === 0x4d && head[3] === 0x38) { // FRM8/DFF
      const r = parseDff(head, dv); if (r) return r;
    }
    if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) { // 'ftyp'/MP4
      const r = parseMp4(head, dv); if (r) return r;
    }
    if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) { // 'OggS'
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const r = parseOgg(head, dv, ext); if (r) return r;
    }
    // MPEG frame scan (MP3/AAC) — also try for streams that don't start with a tag
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const r = parseMpeg(head, ext); if (r) return r;
    return null;
  } catch {
    return null;
  }
}

/** Format a probe result into WikiModal display strings. */
export function formatSignal(s: SignalTruth): { format: string; resolution: string } {
  const isDsd = s.format.startsWith('DSD') || s.bitDepth === 1;
  if (isDsd) {
    const mhz = (s.sampleRate / 1_000_000).toFixed(1);
    return { format: 'DSD', resolution: `${mhz}MHz 1-bit DSD Bitstream` };
  }
  const khz = (s.sampleRate / 1000).toFixed(1);
  const bits = s.bitDepth > 0 ? ` / ${s.bitDepth}-bit` : '';
  return { format: s.format, resolution: `${khz}kHz${bits}` };
}
