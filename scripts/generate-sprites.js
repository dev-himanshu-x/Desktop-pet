// Generates original pixel-art cat sprite sheets (one PNG per color variant)
// using a tiny hand-authored pixel grid per pose, upscaled with hard
// (nearest-neighbor) edges for a classic chunky pixel-art look. Pure Node +
// zlib, no GUI/Electron involved — reuses the PNG encoder from
// generate-icons.js.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'sprites');

const GRID_W = 24;
const GRID_H = 22;
const UPSCALE = 3;
// Headroom added at the top of the grid so extreme poses (e.g. jump's
// upward body bob) don't push ear/tail pixels to a negative y and get
// silently dropped by px()/rect() — the actual clipping bug reported.
const Y_OFFSET = 4;
const FRAME_W = GRID_W * UPSCALE; // 72
const FRAME_H = GRID_H * UPSCALE; // 54

const STATE_ORDER = ['idle', 'walk', 'run', 'jump', 'sit', 'sleep'];
const FRAMES_PER_STATE = { idle: 2, walk: 4, run: 4, jump: 2, sit: 2, sleep: 2 };
const MAX_FRAMES = Math.max(...Object.values(FRAMES_PER_STATE));

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function createGrid() {
  // null = transparent, otherwise a palette key string
  return Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(null));
}

function rect(grid, x, y, w, h, key) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx >= 0 && xx < GRID_W && yy >= 0 && yy < GRID_H) grid[yy][xx] = key;
    }
  }
}

function px(grid, x, y, key) {
  if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) grid[y][x] = key;
}

// Leg phases for the walk/run cycle: [frontLeg, backLeg], each 'down' (planted) or 'up' (lifted/tucked).
const LEG_PHASES = {
  A: { front: 'down', back: 'up' },
  B: { front: 'mid', back: 'mid' },
  C: { front: 'up', back: 'down' },
  D: { front: 'mid', back: 'mid' },
};

function drawLeg(grid, x, phase, key) {
  const legY = 14 + Y_OFFSET;
  if (phase === 'down') rect(grid, x, legY, 3, 3, key);
  else if (phase === 'up') rect(grid, x, legY, 3, 1, key);
  else rect(grid, x, legY, 3, 2, key); // mid
}

function drawPose(grid, { legPhase = 'B', tailPhase = 0, bodyBob = 0, crouch = false, eyesClosed = false }) {
  const bodyY = (crouch ? 10 : 8) + Y_OFFSET + bodyBob;
  const bodyH = crouch ? 5 : 6;

  // tail — a connected diagonal stroke touching the body's back edge
  const tailPixels = tailPhase === 0
    ? [[5, bodyY + 2], [4, bodyY + 1], [3, bodyY], [2, bodyY - 1], [2, bodyY - 2]]
    : [[5, bodyY + 2], [4, bodyY + 2], [3, bodyY + 1], [2, bodyY], [2, bodyY - 1]];
  for (const [x, y] of tailPixels) px(grid, x, y, 'fur');

  // legs (hidden while crouched — tucked under the body)
  if (!crouch) {
    const { front, back } = LEG_PHASES[legPhase] || LEG_PHASES.B;
    drawLeg(grid, 14, front, 'furDark');
    drawLeg(grid, 6, back, 'furDark');
  } else {
    rect(grid, 6, bodyY + bodyH - 1, 3, 2, 'furDark');
    rect(grid, 14, bodyY + bodyH - 1, 3, 2, 'furDark');
  }

  // body + belly
  rect(grid, 5, bodyY, 13, bodyH, 'fur');
  px(grid, 5, bodyY, null); // round the front-bottom corner slightly
  px(grid, 5, bodyY + bodyH - 1, null);
  px(grid, 17, bodyY, null);
  rect(grid, 8, bodyY + bodyH - 3, 6, 2, 'belly');

  // head + ears
  const headY = bodyY - 6;
  rect(grid, 13, headY, 8, 6, 'fur');
  px(grid, 13, headY, null);
  px(grid, 13, headY + 5, null);
  px(grid, 20, headY, null);
  rect(grid, 13, headY - 1, 3, 1, 'fur'); // left ear base
  px(grid, 14, headY - 2, 'fur'); // left ear tip
  rect(grid, 18, headY - 1, 3, 1, 'fur'); // right ear base
  px(grid, 19, headY - 2, 'fur'); // right ear tip

  // face — each eye is an iris pixel over a pupil pixel (not a flat color
  // block) so they read as actual eyes rather than dots; closed eyes are a
  // simple dark lash line.
  if (eyesClosed) {
    rect(grid, 16, headY + 2, 4, 1, 'pupil');
  } else {
    px(grid, 17, headY + 1, 'iris');
    px(grid, 17, headY + 2, 'pupil');
    px(grid, 19, headY + 1, 'iris');
    px(grid, 19, headY + 2, 'pupil');
  }
  px(grid, 18, headY + 3, 'accent'); // nose, centered between the eyes
}

function buildFrames() {
  const frames = [];
  for (const state of STATE_ORDER) {
    const count = FRAMES_PER_STATE[state];
    for (let i = 0; i < count; i++) {
      const grid = createGrid();
      if (state === 'idle') {
        drawPose(grid, { tailPhase: i % 2, bodyBob: i % 2 === 0 ? 0 : -1 });
      } else if (state === 'walk' || state === 'run') {
        const phase = ['A', 'B', 'C', 'D'][i % 4];
        drawPose(grid, { legPhase: phase, tailPhase: i % 2, bodyBob: phase === 'B' || phase === 'D' ? -1 : 0 });
      } else if (state === 'jump') {
        const phase = i === 0 ? 'A' : 'C'; // legs fully spread, alternating — a leaping stride
        drawPose(grid, { legPhase: phase, tailPhase: i % 2, bodyBob: -2 });
      } else if (state === 'sit') {
        drawPose(grid, { crouch: true, tailPhase: i % 2 });
      } else if (state === 'sleep') {
        drawPose(grid, { crouch: true, tailPhase: i % 2, eyesClosed: true, bodyBob: 1 });
      }
      frames.push({ state, grid });
    }
    for (let i = count; i < MAX_FRAMES; i++) frames.push({ state, grid: null }); // pad row
  }
  return frames;
}

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
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

function encodePng(rgba, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const ihdr = chunk('IHDR', ihdrData);

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
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

function renderSheet(colors, outline) {
  const cols = MAX_FRAMES;
  const rows = STATE_ORDER.length;
  const sheetW = cols * FRAME_W;
  const sheetH = rows * FRAME_H;
  const rgba = new Uint8ClampedArray(sheetW * sheetH * 4); // all transparent by default

  const palette = {
    fur: hexToRgb(colors.fur),
    furDark: hexToRgb(colors.furDark),
    belly: hexToRgb(colors.belly),
    accent: hexToRgb(colors.accent),
    iris: hexToRgb(colors.iris),
    pupil: hexToRgb(colors.pupil || '#140f0c'),
  };

  const frames = buildFrames();
  frames.forEach((frame, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    if (!frame.grid) return;
    const originX = col * FRAME_W;
    const originY = row * FRAME_H;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const key = frame.grid[gy][gx];
        if (!key) continue;
        const [r, g, b] = palette[key];
        for (let uy = 0; uy < UPSCALE; uy++) {
          for (let ux = 0; ux < UPSCALE; ux++) {
            const px_ = originX + gx * UPSCALE + ux;
            const py_ = originY + gy * UPSCALE + uy;
            const i = (py_ * sheetW + px_) * 4;
            rgba[i + 0] = r;
            rgba[i + 1] = g;
            rgba[i + 2] = b;
            rgba[i + 3] = 255;
          }
        }
      }
    }
  });

  return { rgba, sheetW, sheetH };
}

const CATALOG = [
  { id: 'orange-tabby', name: 'Orange Tabby', colors: { fur: '#e8a33d', furDark: '#c97f24', belly: '#fdf1dd', accent: '#c75a5a', iris: '#5a8f3c' } },
  { id: 'black-cat', name: 'Black Cat', colors: { fur: '#2b2b2b', furDark: '#161616', belly: '#4a4a4a', accent: '#c75a5a', iris: '#e8c84b' } },
  { id: 'gray-cat', name: 'Gray Cat', colors: { fur: '#9aa0a6', furDark: '#767b81', belly: '#e7e9eb', accent: '#c75a5a', iris: '#7fa8c9' } },
  { id: 'siamese-cat', name: 'Siamese Cat', colors: { fur: '#f2e4d0', furDark: '#c9b48f', belly: '#fbf6ec', accent: '#c75a5a', iris: '#5b9bd5' } },
  { id: 'white-cat', name: 'White Cat', colors: { fur: '#f7f7f7', furDark: '#d8d8d8', belly: '#ffffff', accent: '#c75a93', iris: '#6fb8d1' } },
  { id: 'chocolate-cat', name: 'Chocolate Cat', colors: { fur: '#6b4328', furDark: '#4a2d1a', belly: '#9c7350', accent: '#c75a5a', iris: '#b8863e' } },
  { id: 'ginger-cat', name: 'Ginger Cat', colors: { fur: '#d9631f', furDark: '#b04d14', belly: '#ffe3c2', accent: '#8a3a2a', iris: '#4a7a3c' } },
  { id: 'charcoal-cat', name: 'Charcoal Cat', colors: { fur: '#4a4e55', furDark: '#32353a', belly: '#6e737a', accent: '#c75a5a', iris: '#9fd1e0' } },
  { id: 'tuxedo-cat', name: 'Tuxedo Cat', colors: { fur: '#1c1c1e', furDark: '#0c0c0d', belly: '#f7f7f7', accent: '#c75a93', iris: '#5a8f3c' } },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const pet of CATALOG) {
  const { rgba, sheetW, sheetH } = renderSheet(pet.colors);
  const outPath = path.join(OUT_DIR, `${pet.id}.png`);
  fs.writeFileSync(outPath, encodePng(rgba, sheetW, sheetH));
  console.log('wrote', outPath, `${sheetW}x${sheetH}`);
}

fs.writeFileSync(
  path.join(OUT_DIR, 'manifest.json'),
  JSON.stringify({ frameWidth: FRAME_W, frameHeight: FRAME_H, states: STATE_ORDER, framesPerState: FRAMES_PER_STATE, columns: MAX_FRAMES }, null, 2)
);
console.log('Done.');
