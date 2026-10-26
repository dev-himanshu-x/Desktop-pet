// One-off dev script — draws a simple cat-face icon directly into an RGBA
// pixel buffer and hand-encodes a PNG (via zlib only). No GUI/Electron
// involved, since headless Electron rendering isn't available in this
// sandboxed environment. Run with: node scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const SUPERSAMPLE = 4; // render at 4x then box-downsample for cheap anti-aliasing

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function createCanvas(size) {
  return new Float64Array(size * size * 4); // accumulate as 0..255 floats, alpha-aware
}

function blendPixel(buf, size, x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return;
  const i = (y * size + x) * 4;
  const srcA = alpha;
  const dstA = buf[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  buf[i + 0] = (rgb[0] * srcA + buf[i + 0] * dstA * (1 - srcA)) / outA;
  buf[i + 1] = (rgb[1] * srcA + buf[i + 1] * dstA * (1 - srcA)) / outA;
  buf[i + 2] = (rgb[2] * srcA + buf[i + 2] * dstA * (1 - srcA)) / outA;
  buf[i + 3] = outA * 255;
}

function fillCircle(buf, size, cx, cy, r, rgb) {
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(size - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(size - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) blendPixel(buf, size, x, y, rgb, 1);
    }
  }
}

function sign(p1, p2, p3) {
  return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
}

function fillTriangle(buf, size, a, b, c, rgb) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = [x + 0.5, y + 0.5];
      const d1 = sign(p, a, b);
      const d2 = sign(p, b, c);
      const d3 = sign(p, c, a);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(hasNeg && hasPos)) blendPixel(buf, size, x, y, rgb, 1);
    }
  }
}

function downsample(buf, bigSize, factor) {
  const size = bigSize / factor;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const count = factor * factor;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const sx = x * factor + dx;
          const sy = y * factor + dy;
          const i = (sy * bigSize + sx) * 4;
          r += buf[i + 0];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o + 0] = r / count;
      out[o + 1] = g / count;
      out[o + 2] = b / count;
      out[o + 3] = a / count;
    }
  }
  return out;
}

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(rgba, size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = rowStart + 1 + x * 4;
      raw[o + 0] = rgba[i + 0];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
      raw[o + 3] = rgba[i + 3];
    }
  }
  const idat = chunk('IDAT', zlib.deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function drawCatFace(size, furHex, isTemplate) {
  const big = size * SUPERSAMPLE;
  const buf = createCanvas(big);
  const s = big / 32; // scale factor from our 32x32 design grid

  const fur = hexToRgb(furHex);
  const dark = isTemplate ? [0, 0, 0] : [0, 0, 0];

  fillTriangle(buf, big, [4 * s, 13 * s], [9 * s, 3 * s], [12 * s, 12 * s], fur);
  fillTriangle(buf, big, [28 * s, 13 * s], [23 * s, 3 * s], [20 * s, 12 * s], fur);
  fillCircle(buf, big, 16 * s, 18 * s, 11 * s, fur);

  const eyeColor = isTemplate ? [255, 255, 255] : [0, 0, 0];
  fillCircle(buf, big, 11.5 * s, 17 * s, 1.6 * s, eyeColor);
  fillCircle(buf, big, 20.5 * s, 17 * s, 1.6 * s, eyeColor);
  fillTriangle(buf, big, [14.5 * s, 21 * s], [17.5 * s, 21 * s], [16 * s, 23 * s], eyeColor);

  return downsample(buf, big, SUPERSAMPLE);
}

function writeIcon(filePath, size, furHex, isTemplate) {
  const rgba = drawCatFace(size, furHex, isTemplate);
  fs.writeFileSync(filePath, encodePng(rgba, size));
  console.log('wrote', filePath);
}

fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.mkdirSync(path.join(BUILD_DIR, 'icons'), { recursive: true });

// macOS template tray icon: monochrome black-on-transparent, OS re-tints it.
writeIcon(path.join(BUILD_DIR, 'trayTemplate.png'), 44, '#000000', true);
writeIcon(path.join(BUILD_DIR, 'trayTemplate@2x.png'), 88, '#000000', true);

// Windows/Linux tray icon: a colored silhouette reads better on both themes.
writeIcon(path.join(BUILD_DIR, 'tray.png'), 32, '#e8a33d', false);

// App icon source + linux icon set (used later for icns/ico/.deb packaging).
writeIcon(path.join(BUILD_DIR, 'icon-source.png'), 1024, '#e8a33d', false);
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  writeIcon(path.join(BUILD_DIR, 'icons', `${size}x${size}.png`), size, '#e8a33d', false);
}

console.log('Done.');
