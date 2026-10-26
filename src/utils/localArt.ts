/**
 * Embedded / folder artwork extraction for LOCAL files — all common formats:
 *  - MP3/AAC/WAV(-ID3)      : ID3v2.2/2.3/2.4 APIC (head or inline scan)
 *  - DSF / DFF              : ID3v2 footer chunk near end-of-file
 *  - AIFF / AIF             : ID3 chunk (head or after SSND at tail)
 *  - FLAC                   : METADATA_BLOCK_PICTURE
 *  - M4A / M4B / MP4 (ALAC) : moov>udta>meta>ilst>covr>data atom
 *  - OGG / OPUS             : METADATA_BLOCK_PICTURE (base64) in Vorbis comments
 *  - Fallback               : folder image (cover.jpg / folder.png ...) via TrackFileSet.folderImage
 *  - **Online Fallback**     : Apple iTunes Search API (album art)
 * Returns a blob: URL, or null. Never throws.
 */

const JPEG_SIG = [0xff, 0xd8, 0xff];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];

/** Locate the first embedded JPEG/PNG image stream at/after `from`. */
function findImageSig(u: Uint8Array, from: number): { start: number; mime: string } | null {
  let jpeg = -1;
  let png = -1;
  for (let i = Math.max(0, from); i < u.length - 4; i++) {
    if (jpeg === -1 && u[i] === JPEG_SIG[0] && u[i + 1] === JPEG_SIG[1] && u[i + 2] === JPEG_SIG[2]) jpeg = i;
    if (png === -1 && u[i] === PNG_SIG[0] && u[i + 1] === PNG_SIG[1] && u[i + 2] === PNG_SIG[2] && u[i + 3] === PNG_SIG[3]) png = i;
    if (jpeg !== -1 && png !== -1) break;
  }
  if (jpeg !== -1 && (png === -1 || jpeg < png)) return { start: jpeg, mime: 'image/jpeg' };
  if (png !== -1) return { start: png, mime: 'image/png' };
  return null;
}

function asciiIndex(u: Uint8Array, s: string, from = 0): number {
  for (let i = from; i <= u.length - s.length; i++) {
    let ok = true;
    for (let k = 0; k < s.length; k++) {
      if (u[i + k] !== s.charCodeAt(k)) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

/** Parse an ID3v2 tag starting at `off`, return APIC/PIC payload as Blob. */
function id3ApicBlob(u: Uint8Array, off: number): Blob | null {
  const ab = u.buffer as ArrayBuffer;
  if (off + 10 > u.length || u[off] !== 0x49 || u[off + 1] !== 0x44 || u[off + 2] !== 0x33) return null;
  const ver = u[off + 3];
  const size = ((u[off + 6] & 0x7f) << 21) | ((u[off + 7] & 0x7f) << 14) | ((u[off + 8] & 0x7f) << 7) | (u[off + 9] & 0x7f);
  const end = Math.min(u.length, off + 10 + size);
  const dv = new DataView(ab, u.byteOffset, u.byteLength);
  let p = off + 10;
  const idLen = ver === 2 ? 3 : 4;
  const hdrLen = ver === 2 ? 6 : 10;

  while (p + idLen + 4 <= end) {
    if (u[p] === 0x00) break; // padding
    const id =
      ver === 2
        ? String.fromCharCode(u[p], u[p + 1], u[p + 2])
        : String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]);
    const fsz =
      ver === 4
        ? ((u[p + 4] & 0x7f) << 21) | ((u[p + 5] & 0x7f) << 14) | ((u[p + 6] & 0x7f) << 7) | (u[p + 7] & 0x7f)
        : ver === 2
        ? (u[p + 3] << 16) | (u[p + 4] << 8) | u[p + 5]
        : dv.getUint32(p + 4);
    const dStart = p + hdrLen;
    if (fsz <= 0 || dStart + fsz > end) break;

    if (id.startsWith('APIC') || id.startsWith('PIC')) {
      const sig = findImageSig(u, dStart);
      if (!sig || sig.start >= dStart + fsz) return null;
      const img = u.slice(sig.start, dStart + fsz);
      return new Blob([img as unknown as BlobPart], { type: sig.mime });
    }
    p = dStart + fsz;
  }
  return null;
}

async function readSlice(file: File, start: number, len: number): Promise<Uint8Array> {
  const buf = await file.slice(start, Math.min(file.size, start + len)).arrayBuffer();
  return new Uint8Array(buf);
}

/** MP4/M4A: descend moov>udta>meta>ilst and extract the covr>data payload. */
async function mp4CovrBlob(file: File): Promise<Blob | null> {
  let covr: { off: number; len: number } | null = null;
  let budget = 512;

  const walk = async (start: number, end: number, depth: number): Promise<void> => {
    let p = start;
    while (p + 8 <= end && budget-- > 0) {
      const h = await readSlice(file, p, 16);
      const dv = new DataView(h.buffer as ArrayBuffer, h.byteOffset, h.byteLength);
      let size = dv.getUint32(0);
      const type = String.fromCharCode(h[4], h[5], h[6], h[7]);
      let hdr = 8;
      if (size === 1) {
        size = Number(dv.getBigUint64(8));
        hdr = 16;
      }
      if (size < hdr) return;
      const bodyStart = p + hdr;
      const bodyEnd = Math.min(end, p + size);

      if (type === 'covr') {
        covr = { off: bodyStart, len: bodyEnd - bodyStart };
        return;
      }
      if (depth < 5 && (type === 'moov' || type === 'udta' || type === 'meta' || type === 'ilst')) {
        const childStart = type === 'meta' ? bodyStart + 4 : bodyStart; // meta has version/flags
        await walk(childStart, bodyEnd, depth + 1);
        if (covr) return;
      }
      p += size;
    }
  };

  await walk(0, file.size, 0);
  // TS cannot track closure mutation of `covr` — assert through an explicit alias
  const hit = covr as { off: number; len: number } | null;
  if (!hit) return null;

  const raw = await readSlice(file, hit.off, hit.len);
  if (raw.length > 16 && raw[4] === 0x64 && raw[5] === 0x61 && raw[6] === 0x74 && raw[7] === 0x61) {
    // 'data' atom: type-indicator(4) + locale(4) + payload
    const dv = new DataView(raw.buffer as ArrayBuffer, raw.byteOffset, raw.byteLength);
    const kind = dv.getUint32(8);
    const payload = raw.subarray(16);
    const sig = findImageSig(payload, 0);
    const mime = kind === 14 ? 'image/png' : kind === 13 ? 'image/jpeg' : sig?.mime ?? 'image/jpeg';
    const img = payload.slice();
    return new Blob([img as unknown as BlobPart], { type: mime });
  }
  const sig = findImageSig(raw, 0);
  if (sig) {
    const img = raw.slice(sig.start);
    return new Blob([img as unknown as BlobPart], { type: sig.mime });
  }
  return null;
}

/** OGG / OPUS: METADATA_BLOCK_PICTURE (base64) inside Vorbis comments. */
async function oggPictureBlob(file: File): Promise<Blob | null> {
  const head = await readSlice(file, 0, 2_000_000);
  let pos = asciiIndex(head, 'OpusTags');
  if (pos >= 0) pos += 8;
  else {
    const v = asciiIndex(head, '\u0003vorbis');
    if (v >= 0) pos = v + 7;
  }
  if (pos < 0) return null;

  const dv = new DataView(head.buffer as ArrayBuffer, head.byteOffset, head.byteLength);
  const vendorLen = dv.getUint32(pos, true);
  pos += 4 + vendorLen;
  const count = dv.getUint32(pos, true);
  pos += 4;

  for (let i = 0; i < count && pos + 4 <= head.length; i++) {
    const l = dv.getUint32(pos, true);
    pos += 4;
    if (pos + l > head.length) break;
    const c = head.subarray(pos, pos + l);
    pos += l;
    const eq = asciiIndex(c, '=');
    if (eq < 0) continue;
    const key = new TextDecoder().decode(c.subarray(0, eq)).toUpperCase();
    if (key !== 'METADATA_BLOCK_PICTURE') continue;
    const b64 = new TextDecoder().decode(c.subarray(eq + 1)).trim();
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const sig = findImageSig(bytes, 0);
    if (!sig) return null;
    const img = bytes.slice(sig.start);
    return new Blob([img as unknown as BlobPart], { type: sig.mime });
  }
  return null;
}

/**
 * Apple iTunes Search API fallback for album art.
 * Returns high-res artwork URL (600x600) or null.
 */
async function fetchITunesArtwork(artist: string, album: string): Promise<string | null> {
  if (!artist.trim() && !album.trim()) return null;
  try {
    const query = encodeURIComponent(`${artist} ${album}`.trim());
    const url = `https://itunes.apple.com/search?term=${query}&media=music&entity=album&attribute=albumTerm&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results?.length) return null;

    // Pick best match (first result usually best)
    for (const r of data.results) {
      let artUrl = r.artworkUrl100 || r.artworkUrl60 || '';
      if (!artUrl) continue;
      // Upgrade to 600x600
      artUrl = artUrl.replace(/\d+x\d+/, '600x600');

      // Fetch and convert to blob URL
      const imgRes = await fetch(artUrl);
      if (!imgRes.ok) continue;
      const blob = await imgRes.blob();
      return URL.createObjectURL(blob);
    }
  } catch {
    // Silently fail
  }
  return null;
}

/** Extract artist/album from file using browser's MediaMetadata API (best effort) */
async function getFileMetadata(file: File): Promise<{ artist: string; album: string }> {
  // Try to read ID3 tags from the file head (quick scan)
  try {
    const head = await readSlice(file, 0, 786_432);
    let artist = '', album = '';

    // Quick ID3v2 TPE1/TALB scan
    const tpe1 = asciiIndex(head, 'TPE1');
    const talb = asciiIndex(head, 'TALB');
    const tpe2 = asciiIndex(head, 'TPE2'); // Album artist

    const readFrame = (idx: number) => {
      if (idx < 0 || idx + 10 > head.length) return '';
      const dv = new DataView(head.buffer as ArrayBuffer, head.byteOffset, head.byteLength);
      const size = dv.getUint32(idx + 4);
      if (size <= 0 || size > 512 || idx + 10 + size > head.length) return '';
      const enc = head[idx + 10];
      const text = new TextDecoder(enc === 0 ? 'iso-8859-1' : 'utf-16').decode(head.subarray(idx + 11, idx + 10 + size));
      return text.replace(/\0/g, '').trim();
    };

    if (tpe1 >= 0) artist = readFrame(tpe1);
    if (!artist && tpe2 >= 0) artist = readFrame(tpe2);
    if (talb >= 0) album = readFrame(talb);

    return { artist, album };
  } catch {
    return { artist: '', album: '' };
  }
}

export async function extractEmbeddedArtUrl(file: File): Promise<string | null> {
  try {
    const name = file.name.toLowerCase();
    let blob: Blob | null = null;

    if (name.endsWith('.flac')) {
      const head = await readSlice(file, 0, 1_048_576);
      if (!(head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43)) return null;
      const dv = new DataView(head.buffer as ArrayBuffer, head.byteOffset, head.byteLength);
      let p = 4;
      while (p + 4 <= head.length) {
        const last = (head[p] & 0x80) !== 0;
        const type = head[p] & 0x7f;
        const len = (head[p + 1] << 16) | (head[p + 2] << 8) | head[p + 3];
        if (type === 6 && p + 4 + len <= head.length) {
          const b = p + 4;
          let j = b + 4;
          const mL = dv.getUint32(j); j += 4;
          const mimeBytes = head.subarray(j, j + mL); j += mL;
          const mimeRaw = new TextDecoder().decode(mimeBytes).toLowerCase();
          const dL = dv.getUint32(j); j += 4 + dL;
          j += 16;
          const dataLen = dv.getUint32(j); j += 4;
          const mime = mimeRaw.includes('png') ? 'image/png' : 'image/jpeg';
          const pic = head.slice(j, j + dataLen);
          blob = new Blob([pic as unknown as BlobPart], { type: mime });
          break;
        }
        p += 4 + len;
        if (last) break;
      }
    } else if (name.endsWith('.m4a') || name.endsWith('.m4b') || name.endsWith('.mp4')) {
      blob = await mp4CovrBlob(file);
    } else if (name.endsWith('.ogg') || name.endsWith('.opus') || name.endsWith('.oga')) {
      blob = await oggPictureBlob(file);
    } else if (name.endsWith('.dsf') || name.endsWith('.dff')) {
      const tailStart = Math.max(0, file.size - 4_194_304);
      const tail = await readSlice(file, tailStart, file.size - tailStart);
      for (let i = tail.length - 3; i >= 0; i--) {
        if (tail[i] === 0x49 && tail[i + 1] === 0x44 && tail[i + 2] === 0x33) {
          blob = id3ApicBlob(tail.subarray(i), 0);
          break;
        }
      }
    } else {
      // MP3 / AAC / WAV / AIFF ...: ID3 at head, inline, or tail
      const head = await readSlice(file, 0, 786_432);
      let off = asciiIndex(head, 'ID3');
      if (off >= 0) blob = id3ApicBlob(head, off);
      if (!blob && (name.endsWith('.wav') || name.endsWith('.aiff') || name.endsWith('.aif'))) {
        const tailStart = Math.max(0, file.size - 2_097_152);
        const tail = await readSlice(file, tailStart, file.size - tailStart);
        const t = asciiIndex(tail, 'ID3');
        if (t >= 0) blob = id3ApicBlob(tail.subarray(t), 0);
      }
    }

    if (blob) return URL.createObjectURL(blob);

    // ===== ONLINE FALLBACK: Apple iTunes Search =====
    const { artist, album } = await getFileMetadata(file);
    if (artist || album) {
      const artUrl = await fetchITunesArtwork(artist, album);
      if (artUrl) return artUrl;
    }

    return null;
  } catch {
    return null;
  }
}
