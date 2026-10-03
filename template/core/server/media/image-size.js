import fs from 'node:fs/promises';

// Reads width/height from the first bytes of PNG, JPEG, GIF and WebP files.
// Dimensions go on every <img> so pages don't shift as images load; this
// avoids pulling in an image library just to read a header.
export async function imageSize(file) {
  const fh = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(256 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return parse(buf.subarray(0, bytesRead));
  } finally { await fh.close(); }
}

export function parse(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), mime: 'image/png' };
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), mime: 'image/gif' };
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), mime: 'image/webp' };
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, mime: 'image/webp' };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), mime: 'image/webp' };
    }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7), mime: 'image/jpeg' };
      }
      i += 2 + len;
    }
    return { width: null, height: null, mime: 'image/jpeg' };
  }
  if (b.toString('utf8', 0, 512).includes('<svg')) return { width: null, height: null, mime: 'image/svg+xml' };
  return null;
}
