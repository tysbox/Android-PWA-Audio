import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, r, g, b) {
  // CRC32 table
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crcVal = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crcVal, 8 + len);
    return buf;
  }

  // PNG Header
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 2; // Color type: Truecolor (RGB)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT
  // Uncompressed raw scanlines: height * (1 + width * 3)
  const lineLength = 1 + width * 3;
  const rawData = Buffer.alloc(height * lineLength);
  for (let y = 0; y < height; y++) {
    const offset = y * lineLength;
    rawData[offset] = 0; // Filter type None
    for (let x = 0; x < width; x++) {
      const p = offset + 1 + x * 3;
      // Draw a dark hardware gold accent circle/square pattern
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < width * 0.42 && dist > width * 0.36) {
        rawData[p] = 217;     // Amber Gold R
        rawData[p + 1] = 119; // G
        rawData[p + 2] = 6;   // B
      } else if (dist <= width * 0.36) {
        rawData[p] = 20;      // Dark metallic R
        rawData[p + 1] = 20;  // G
        rawData[p + 2] = 20;  // B
      } else {
        rawData[p] = r;       // Background R
        rawData[p + 1] = g;   // G
        rawData[p + 2] = b;   // B
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
const png192 = createPng(192, 192, 13, 13, 13);
const png512 = createPng(512, 512, 13, 13, 13);

fs.writeFileSync(path.join(publicDir, 'pwa-192.png'), png192);
fs.writeFileSync(path.join(publicDir, 'pwa-512.png'), png512);

console.log('Successfully generated pwa-192.png and pwa-512.png');
