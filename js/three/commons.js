// VILNYI RIVER CITY — shared building spaces (Agent D): corridors (floors 1–10), ground-floor lobbies (0),
// underground parking (-1) and the Lift class. Everything is procedural; static geometry is merged per material,
// collisions use invisible, chunked collider meshes (userData.solid / userData.floor).
//
// Frames: the returned `group` sits at the building origin (y = 0) and holds a child at y = floorY(floor);
// all coordinates are building-local. Lift groups are building-local with absolute y (they are children of `group`).
// Mirrored blocks (data.js: C3 is C4 reflected z → −z): floors are built in the CANONICAL frame (data.js CORES /
// CORRIDORS / unit.cframe) and reflected on output — merged geometry is reflected with flipped winding (no negative
// scales anywhere), text quads are pre-flipped in their own x so they still read correctly, and individually placed
// objects (door leaves, call plates, art, sliding doors) get z → −z, yaw → π − yaw. Lifts use the true cores directly.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createCarInstances, carSpec, pickCar, carRng } from './cars.js';
import {
  CORRIDORS, CORES, BUILDINGS, LEVELS, TOP_FLOOR, BASEMENT, RAMP as RAMP_D, floorY, unitsOn, blocksOn, unitToLocal, unitYaw,
  coresOf, isMirrored,
} from '../data.js';

const TAU = Math.PI * 2;
const DOOR_W = 0.95, DOOR_H = 2.2;          // apartment entrance opening
const LIFT_W = 1.0, LIFT_H = 2.2, POCKET = 1.06; // landing opening, half-width of the door pocket in the wall
const CAR_DEPTH = 1.05;                     // car centre behind the landing door line (walk.js relies on this)
const WALL_T = 0.14, FACE = 0.02, SKIN = 0.018;

// ============================================================ small utils
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function hash2(i, j, seed) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// periodic value noise (period px, py lattice cells) → tileable textures
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const mx = a => ((a % px) + px) % px, my = a => ((a % py) + py) % py;
  const a = hash2(mx(xi), my(yi), seed), b = hash2(mx(xi + 1), my(yi), seed);
  const c = hash2(mx(xi), my(yi + 1), seed), d = hash2(mx(xi + 1), my(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(u, v, px, py, seed, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(u * px * f, v * py * f, px * f, py * f, seed + o * 31); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texOf(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; return t;
}
function pixelCanvas(w, h, fn) {
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const col = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    fn(x / w, y / h, col); const i = (y * w + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}
const SERIF = '"Cormorant Garamond", "Bodoni Moda", Didot, Georgia, "Times New Roman", serif';
const SANS = '"Manrope", "Inter Tight", "Helvetica Neue", Arial, sans-serif';

// ============================================================ textures (cached for the session)
const TEX = {};
function cached(key, make) { return TEX[key] || (TEX[key] = make()); }

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const texMarble = (dark = false) => cached(dark ? 'nero' : 'marble', () => texOf(pixelCanvas(768, 768, (u, v, c) => {
  const sd = dark ? 71 : 11;
  const w = fbm(u, v, 2, 2, sd, 5), w2 = fbm(u, v, 6, 6, sd + 2, 4);
  const a = 1 - Math.abs(Math.sin(TAU * (u + v) + w * 7 + w2 * 0.9));
  const core = sstep(0.972, 1, a), soft = sstep(0.8, 1, a);
  const a2 = 1 - Math.abs(Math.sin(TAU * (2 * u - v) + w * 4 + w2 * 2.2));
  const thin = sstep(0.988, 1, a2) * (0.35 + w2 * 0.8);
  const cloud = fbm(u, v, 4, 4, sd + 6, 5) - 0.5;
  if (dark) {
    const b = 16 + cloud * 14 + soft * 7; const k = clamp(core * 0.75 + thin * 0.6);
    c[0] = mix(b, 200, k); c[1] = mix(b, 196, k); c[2] = mix(b + 2, 188, k);
  } else {
    let r = 240 + cloud * 10, g = 237 + cloud * 10, bl = 231 + cloud * 11;
    const h = soft * 0.22; r = mix(r, 206, h); g = mix(g, 196, h); bl = mix(bl, 178, h);           // warm halo
    const k = clamp(core * 0.62 + thin * 0.5); r = mix(r, 138, k); g = mix(g, 136, k); bl = mix(bl, 134, k);   // grey vein
    c[0] = r; c[1] = g; c[2] = bl;
  }
})));
const texStone = () => cached('stone', () => {   // large-format porcelain, 2 × 2 tiles of 1.2 m (texture = 2.4 m)
  const c = pixelCanvas(512, 512, (u, v, c) => {
    const n = fbm(u, v, 5, 5, 5, 5) - 0.5, s = hash2((u * 512) | 0, (v * 512) | 0, 9) - 0.5;
    const t = Math.sin(TAU * (2 * u + v) + fbm(u, v, 6, 6, 21, 4) * 9); const vein = Math.pow(1 - Math.abs(t), 30) * 0.35;
    const b = 196 + n * 16 + s * 5 - vein * 34; c[0] = b; c[1] = b - 6; c[2] = b - 15;
  });
  const g = c.getContext('2d'); g.fillStyle = 'rgba(96,86,74,0.9)';
  for (const p of [0, 256]) { g.fillRect(p, 0, 1.5, 512); g.fillRect(0, p, 512, 1.5); }
  return texOf(c);
});
const texWalnut = () => cached('walnut', () => texOf(pixelCanvas(512, 512, (u, v, c) => {
  const w = fbm(u, v, 4, 1, 3, 4), w2 = fbm(u, v, 32, 2, 7, 3);
  const r = 0.5 + 0.5 * Math.sin(TAU * 41 * u + w * 5 + w2 * 1.5);
  const fleck = hash2((u * 512) | 0, (v * 48) | 0, 4) - 0.5;
  const k = clamp(Math.pow(r, 1.6) * 0.5 + w * 0.35 + fleck * 0.08);
  c[0] = mix(64, 112, k); c[1] = mix(41, 74, k); c[2] = mix(27, 48, k);
  if (Math.abs(u * 2 - Math.round(u * 2)) < 0.003) { c[0] *= 0.4; c[1] *= 0.4; c[2] *= 0.4; }
})));
const texFabric = () => cached('fabric', () => texOf(pixelCanvas(256, 256, (u, v, c) => {
  const x = (u * 256) | 0, y = (v * 256) | 0;
  const row = hash2(0, y, 3) - 0.5, col = hash2(x, 0, 5) - 0.5, p = hash2(x, y, 7) - 0.5;
  const n = fbm(u, v, 4, 4, 9, 3) - 0.5;
  const b = 172 + row * 9 + col * 5 + p * 7 + n * 12;
  c[0] = b; c[1] = b - 9; c[2] = b - 22;
})));
const texConcrete = () => cached('concrete', () => texOf(pixelCanvas(512, 512, (u, v, c) => {
  const n = fbm(u, v, 6, 6, 41, 5) - 0.5, s = hash2((u * 512) | 0, (v * 512) | 0, 43);
  const b = 168 + n * 18 + (s > 0.99 ? -30 : (s - 0.5) * 6); c[0] = b; c[1] = b - 1; c[2] = b - 4;
})));
const texEpoxy = () => cached('epoxy', () => texOf(pixelCanvas(512, 512, (u, v, c) => {
  const n = fbm(u, v, 4, 4, 51, 5) - 0.5, s = hash2((u * 512) | 0, (v * 512) | 0, 53) - 0.5;
  const b = 104 + n * 20 + s * 5; c[0] = b - 4; c[1] = b + 4; c[2] = b + 3;
})));
const texCarpet = () => cached('carpet', () => {        // runner: u along the length (2.6 m), v across (0..1)
  const c = pixelCanvas(512, 256, (u, v, c) => {
    const x = (u * 512) | 0, y = (v * 256) | 0, p = hash2(x, y, 61) - 0.5, n = fbm(u, v, 8, 4, 63, 3) - 0.5;
    // subtle lattice pattern
    const du = Math.abs(((u * 8 + v * 4) % 1) - 0.5), dv = Math.abs(((u * 8 - v * 4 + 10) % 1) - 0.5);
    const lat = (Math.min(du, dv) < 0.03) ? 9 : 0;
    const b = 34 + p * 10 + n * 8 + lat; c[0] = b + 2; c[1] = b + 4; c[2] = b + 8;
  });
  const g = c.getContext('2d');
  for (const [y, h, col] of [[10, 5, '#a8854a'], [20, 2, '#8c6c3a'], [241, 5, '#a8854a'], [234, 2, '#8c6c3a']]) { g.fillStyle = col; g.fillRect(0, y, 512, h); }
  return texOf(c);
});
const texGlow = () => cached('glow', () => {            // cove gradient across the tray (bright at both edges)
  const c = canvas(8, 256), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, '#8a7a66'); gr.addColorStop(0.5, '#3a342c'); gr.addColorStop(0.82, '#8a7a66'); gr.addColorStop(1, '#ffffff');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 256); return texOf(c, { repeat: false });
});
const texScallop = () => cached('scallop', () => {      // wall-wash from a downlight (additive decal)
  const c = canvas(128, 256), g = c.getContext('2d');
  const img = g.createImageData(128, 256), d = img.data;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) {
    const u = (x - 63.5) / 64, v = y / 256;               // v=0 top (at the light)
    const top = Math.pow(clamp(1 - Math.abs(u) / (0.22 + v * 0.9)), 1.6);
    const fall = Math.pow(1 - v, 1.4) * clamp(v * 9);
    const a = clamp(top * fall * 1.1); const i = (y * 128 + x) * 4;
    d[i] = 255 * a; d[i + 1] = 214 * a; d[i + 2] = 160 * a; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return texOf(c, { repeat: false });
});
const texPool = () => cached('pool', () => {
  const c = canvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,214,160,1)'); gr.addColorStop(0.45, 'rgba(160,120,80,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return texOf(c, { repeat: false });
});
// Ambient-occlusion ramp (alpha): dark at v = 0 (the corner), gone by v = 1 — for wall/floor and wall/ceiling junctions.
const texAO = () => cached('ao', () => {
  const c = canvas(4, 128), g = c.getContext('2d'), img = g.createImageData(4, 128);
  for (let y = 0; y < 128; y++) { const t = y / 127, a = Math.pow(1 - t, 2.2) * (0.55 + 0.45 * (1 - t)); for (let x = 0; x < 4; x++) { const i = (y * 4 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255); img.data[i + 3] = 255; } }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.anisotropy = 8; return t;
});
const texBrushed = () => cached('brushed', () => texOf(pixelCanvas(64, 512, (u, v, c) => {
  const y = (v * 512) | 0, s = hash2(3, y, 91) * 0.55 + hash2((u * 4) | 0, y, 93) * 0.25 + fbm(u, v, 1, 16, 95, 3) * 0.2;
  const b = 236 + (s - 0.5) * 18; c[0] = b; c[1] = b; c[2] = b;
})));
function gold(g, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#8a6a33'); gr.addColorStop(0.3, '#e9cf8e'); gr.addColorStop(0.5, '#b8924f'); gr.addColorStop(0.75, '#f3dca0'); gr.addColorStop(1, '#8f6d34');
  return gr;
}
function drawBird(g, cx, cy, s, fill) {   // stylised origami bird (the brand mark), drawn from facets
  const P = (pts, a) => { g.globalAlpha = a; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, cx + x * s, cy + y * s)); g.closePath(); g.fill(); };
  g.fillStyle = fill;
  P([[-1, 0.15], [0.05, -0.05], [-0.2, 0.45]], 0.95);
  P([[0.05, -0.05], [0.95, -0.75], [0.35, 0.2]], 0.8);
  P([[-0.2, 0.45], [0.05, -0.05], [0.35, 0.2]], 0.65);
  P([[0.35, 0.2], [0.95, -0.75], [0.7, 0.05]], 1);
  P([[-1, 0.15], [-0.55, -0.35], [-0.35, 0.05]], 0.7);
  g.globalAlpha = 1;
}
const texWordmark = () => cached('wordmark', () => {
  const c = canvas(2048, 512);
  const draw = () => {
    const g = c.getContext('2d'); g.clearRect(0, 0, 2048, 512);
    drawBird(g, 1024, 120, 92, gold(g, 900, 30, 1150, 220));
    g.fillStyle = gold(g, 0, 220, 2048, 420); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `500 210px ${SERIF}`;
    if ('letterSpacing' in g) g.letterSpacing = '34px';
    g.fillText('VILNYI', 1024, 318);
    g.font = `500 78px ${SERIF}`; if ('letterSpacing' in g) g.letterSpacing = '36px';
    g.fillText('RIVER  CITY', 1024, 460);
    g.fillRect(430, 458, 210, 4); g.fillRect(1408, 458, 210, 4);
  };
  draw();
  const t = texOf(c, { repeat: false });
  try { if (document.fonts && document.fonts.load) document.fonts.load(`500 150px "Cormorant Garamond"`).then(f => { if (f && f.length) { draw(); t.needsUpdate = true; } }).catch(() => {}); } catch { /* optional */ }
  return t;
});
const texArt = (k) => cached('art' + k, () => {   // abstract canvases: black / gold / warm stone
  const c = canvas(512, 640), g = c.getContext('2d'), r = rng(101 + k * 7);
  const bgs = [['#1b1a18', '#2e2a25'], ['#d8cfc0', '#b9ab95'], ['#23282a', '#3c4441']][k % 3];
  const gr = g.createLinearGradient(0, 0, 512, 640); gr.addColorStop(0, bgs[0]); gr.addColorStop(1, bgs[1]); g.fillStyle = gr; g.fillRect(0, 0, 512, 640);
  for (let i = 0; i < 9; i++) {
    g.globalAlpha = 0.25 + r() * 0.55;
    g.fillStyle = [gold(g, 0, 0, 512, 640), '#f1e8d6', '#0e0d0c', '#8a6a3c', '#c8b28a'][(i + k) % 5];
    g.beginPath();
    const x = r() * 512, y = r() * 640, rad = 40 + r() * 200;
    if (i % 3 === 0) g.arc(x, y, rad, r() * TAU, r() * TAU + 2 + r() * 3);
    else { g.moveTo(x, y); g.bezierCurveTo(r() * 512, r() * 640, r() * 512, r() * 640, r() * 512, r() * 640); g.lineWidth = 6 + r() * 30; g.strokeStyle = g.fillStyle; g.stroke(); continue; }
    g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * 512, r() * 640, 2, 2); }
  return texOf(c, { repeat: false });
});
const texMailbox = () => cached('mailbox', () => {    // bronze mailbox wall: 8 × 6 doors
  const c = canvas(1024, 640), g = c.getContext('2d');
  g.fillStyle = '#2a2018'; g.fillRect(0, 0, 1024, 640);
  const cw = 1024 / 8, ch = 640 / 6;
  for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) {
    const x = i * cw + 5, y = j * ch + 5;
    const gr = g.createLinearGradient(x, y, x + cw, y + ch); gr.addColorStop(0, '#9c7a4c'); gr.addColorStop(0.5, '#c8a468'); gr.addColorStop(1, '#8a6a40');
    g.fillStyle = gr; g.fillRect(x, y, cw - 10, ch - 10);
    g.fillStyle = '#3a2c1d'; g.fillRect(x + 14, y + 16, cw - 38, 8);          // slot
    g.fillStyle = '#2d2318'; g.beginPath(); g.arc(x + cw - 28, y + ch - 30, 7, 0, TAU); g.fill();   // lock
    g.fillStyle = '#3a2c1d'; g.font = `600 20px ${SANS}`; g.fillText(String(j * 8 + i + 1), x + 14, y + ch - 24);
  }
  return texOf(c, { repeat: false });
});
// language-neutral pictograms: 0 stairs, 1 lift, 2 P, 3 arrow →, 4 EV bolt, 5 child (kindergarten), 6 lounge (amenity), 7 exit arrow up
const texSigns = () => cached('signs', () => {
  const c = canvas(1024, 128), g = c.getContext('2d');
  g.fillStyle = '#141312'; g.fillRect(0, 0, 1024, 128);
  const W = '#efe3c8', G = '#d8b46a';
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 8; i++) {
    const x = i * 128; g.save(); g.translate(x, 0);
    g.strokeStyle = 'rgba(216,180,106,0.6)'; g.lineWidth = 2; g.strokeRect(6, 6, 116, 116);
    g.strokeStyle = W; g.fillStyle = W; g.lineWidth = 7;
    if (i === 0) { g.beginPath(); g.moveTo(22, 102); for (let s = 0; s < 4; s++) { g.lineTo(22 + s * 21, 102 - (s + 1) * 19); g.lineTo(43 + s * 21, 102 - (s + 1) * 19); } g.stroke(); g.beginPath(); g.arc(88, 30, 8, 0, TAU); g.fill(); }
    if (i === 1) { g.strokeRect(34, 20, 60, 88); g.beginPath(); g.moveTo(64, 20); g.lineTo(64, 108); g.stroke(); g.fillStyle = G; g.beginPath(); g.moveTo(46, 52); g.lineTo(55, 38); g.lineTo(55, 52); g.fill(); g.beginPath(); g.moveTo(73, 76); g.lineTo(82, 76); g.lineTo(73, 90); g.fill(); g.beginPath(); g.moveTo(46, 44); g.lineTo(55, 32); g.lineTo(55, 44); g.closePath(); g.fill(); }
    if (i === 2) { g.fillStyle = '#1f4f8a'; g.fillRect(14, 14, 100, 100); g.fillStyle = W; g.font = `700 88px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', 64, 68); }
    if (i === 3) { g.beginPath(); g.moveTo(20, 64); g.lineTo(104, 64); g.moveTo(76, 36); g.lineTo(104, 64); g.lineTo(76, 92); g.stroke(); }
    if (i === 4) { g.fillStyle = '#58c27d'; g.beginPath(); g.moveTo(72, 14); g.lineTo(36, 70); g.lineTo(62, 70); g.lineTo(54, 114); g.lineTo(92, 54); g.lineTo(66, 54); g.closePath(); g.fill(); }
    if (i === 5) { g.beginPath(); g.arc(64, 34, 13, 0, TAU); g.fill(); g.beginPath(); g.moveTo(64, 50); g.lineTo(64, 84); g.moveTo(40, 58); g.lineTo(88, 58); g.moveTo(64, 84); g.lineTo(48, 110); g.moveTo(64, 84); g.lineTo(80, 110); g.stroke(); g.fillStyle = G; g.beginPath(); g.arc(100, 32, 12, 0, TAU); g.fill(); }
    if (i === 6) { g.beginPath(); g.moveTo(22, 94); g.lineTo(34, 60); g.lineTo(80, 60); g.lineTo(96, 40); g.moveTo(34, 60); g.lineTo(34, 104); g.moveTo(80, 60); g.lineTo(88, 104); g.stroke(); g.beginPath(); g.arc(58, 34, 10, 0, TAU); g.fill(); }
    if (i === 7) { g.fillStyle = '#2f8a4c'; g.fillRect(14, 14, 100, 100); g.strokeStyle = W; g.beginPath(); g.moveTo(64, 100); g.lineTo(64, 30); g.moveTo(40, 54); g.lineTo(64, 30); g.lineTo(88, 54); g.stroke(); }
    g.restore();
  }
  return texOf(c, { repeat: false });
});
// Car operating panel (COP) key faces: brushed stainless discs with engraved labels, one 4 × 4 atlas of 128 px cells.
// Keys: floors -1, P, 1..10, then door-open, door-close and the alarm bell.
const floorLabel = f => (f === -1 ? '-1' : f === 0 ? 'P' : String(f));
const KEY_LIST = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'open', 'close', 'bell'];
const keyCell = k => KEY_LIST.indexOf(k);
const texKeys = () => cached('keys', () => {
  const c = canvas(512, 512), g = c.getContext('2d');
  KEY_LIST.forEach((k, i) => {
    const cx = (i % 4) * 128 + 64, cy = ((i / 4) | 0) * 128 + 64;
    const gr = g.createRadialGradient(cx - 22, cy - 26, 6, cx, cy, 70);
    gr.addColorStop(0, '#f1eee8'); gr.addColorStop(0.55, '#c9c5bd'); gr.addColorStop(1, '#8f8b84');
    g.fillStyle = gr; g.fillRect(cx - 64, cy - 64, 128, 128);
    for (let j = 0; j < 90; j++) { g.fillStyle = `rgba(255,255,255,${0.04 + (j % 5) * 0.012})`; g.fillRect(cx - 64, cy - 64 + j * 1.43, 128, 0.6); }   // brushed lines
    // engraving = dark glyph with a light lower-right lip
    const glyph = (col, dx, dy) => {
      g.save(); g.translate(cx + dx, cy + dy); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      if (typeof k === 'number') {
        const t = floorLabel(k).replace('-', '\u2212');
        g.font = `600 ${t.length > 1 ? 58 : 66}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 0, 4);
      } else if (k === 'open' || k === 'close') {
        const s = k === 'open' ? 1 : -1; g.lineWidth = 5;
        g.beginPath(); g.moveTo(0, -30); g.lineTo(0, 30); g.stroke();
        for (const side of [-1, 1]) { g.beginPath(); const tip = side * (s > 0 ? 40 : 8), base = side * (s > 0 ? 12 : 36); g.moveTo(tip, 0); g.lineTo(base, -17); g.lineTo(base, 17); g.closePath(); g.fill(); }
      } else {   // bell
        g.beginPath(); g.moveTo(-28, 20); g.quadraticCurveTo(-24, 14, -22, -4); g.quadraticCurveTo(-20, -30, 0, -32); g.quadraticCurveTo(20, -30, 22, -4); g.quadraticCurveTo(24, 14, 28, 20); g.closePath(); g.fill();
        g.beginPath(); g.arc(0, 27, 7, 0, TAU); g.fill(); g.beginPath(); g.arc(0, -35, 4, 0, TAU); g.fill();
      }
      g.restore();
    };
    glyph('rgba(255,255,255,0.75)', 1.6, 1.8); glyph(k === 'bell' ? '#7a2a1c' : '#23201c', 0, 0);
  });
  return texOf(c, { repeat: false });
});
// 3 columns × 4 rows (top row = highest floors), then a row with door-open / door-close / alarm
const PANEL_ROWS = [[8, 9, 10], [5, 6, 7], [2, 3, 4], [-1, 0, 1], ['open', 'close', 'bell']];
const KEY_R = 0.019, KEY_PITCH = 0.062;   // 3.8 cm keys on a 6.2 cm grid

function plateAtlas(entries) {   // brass number plates; returns {tex, uv(i)} with 8 × 8 cells of 128 × 64
  const c = canvas(1024, 512), g = c.getContext('2d');
  entries.forEach((txt, i) => {
    const x = (i % 8) * 128, y = ((i / 8) | 0) * 64;
    g.fillStyle = gold(g, x, y, x + 128, y + 64); g.fillRect(x, y, 128, 64);
    g.strokeStyle = 'rgba(60,40,15,0.55)'; g.lineWidth = 2; g.strokeRect(x + 5, y + 5, 118, 54);
    g.fillStyle = '#2a1d0f'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 36px ${SERIF}`;
    g.fillText(txt, x + 64, y + 34);
  });
  const tex = texOf(c, { repeat: false });
  return { tex, uv: i => [(i % 8) / 8, 1 - (((i / 8) | 0) + 1) / 8, 1 / 8, 1 / 8] };
}

// ============================================================ materials (shared)
const MAT = {};
function M(key) {
  if (MAT[key]) return MAT[key];
  const S = (o, uv) => { const m = new THREE.MeshStandardMaterial(o); if (uv) m.userData.uv = uv; return m; };
  const mk = {
    stone: () => S({ map: texStone(), roughness: 0.2, metalness: 0, envMapIntensity: 0.9 }, 2.4),
    marble: () => S({ map: texMarble(), roughness: 0.1, envMapIntensity: 1.0 }, 2.8),
    marbleFloor: () => S({ map: texMarble(), roughness: 0.14, envMapIntensity: 0.9 }, 2.4),
    nero: () => S({ map: texMarble(true), roughness: 0.12, envMapIntensity: 1.0 }, 1.8),
    walnut: () => S({ map: texWalnut(), roughness: 0.42, envMapIntensity: 0.8 }, 1.0),
    walnutDoor: () => S({ map: texWalnut(), roughness: 0.36, envMapIntensity: 0.9 }),
    fabric: () => S({ map: texFabric(), roughness: 0.92, envMapIntensity: 0.7 }, 0.6),
    plaster: () => S({ color: 0xece6dc, roughness: 0.95, envMapIntensity: 0.8 }),
    plasterW: () => S({ color: 0xe3ddd2, roughness: 0.9, envMapIntensity: 0.8 }),
    tray: () => S({ color: 0xe9e2d6, roughness: 0.95, emissive: 0xffd49a, emissiveIntensity: 0.95, emissiveMap: texGlow() }),
    bronze: () => S({ color: 0xb48e5e, metalness: 1, roughness: 0.26, map: texBrushed() }, 0.9),
    bronzeDark: () => S({ color: 0x4a3626, metalness: 0.9, roughness: 0.38 }),
    brass: () => S({ color: 0xd2ac66, metalness: 1, roughness: 0.22 }),
    carpet: () => S({ map: texCarpet(), roughness: 1, envMapIntensity: 0.5 }),
    glass: () => S({ color: 0xc9d6d4, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.3 }),
    frosted: () => S({ color: 0xefe6d6, roughness: 0.5, emissive: 0xffdcb0, emissiveIntensity: 0.45, emissiveMap: texGlow() }),
    blackGlass: () => S({ color: 0x0b0a09, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.2 }),
    mirror: () => S({ color: 0x5e554a, metalness: 1, roughness: 0.04, envMapIntensity: 1.0 }),
    bronzeCar: () => S({ color: 0x8e6a47, metalness: 1, roughness: 0.22, map: texBrushed() }, 0.9),
    velvet: () => S({ color: 0x2f3c3a, roughness: 0.85, envMapIntensity: 0.6 }),
    velvetSand: () => S({ color: 0xb49a78, roughness: 0.9, envMapIntensity: 0.6 }),
    rug: () => S({ color: 0x8e7f6c, roughness: 1, envMapIntensity: 0.5 }),
    leaf: () => S({ color: 0x46613a, roughness: 0.7, side: THREE.DoubleSide }),
    leaf2: () => S({ color: 0x7d8f62, roughness: 0.7, side: THREE.DoubleSide }),
    pot: () => S({ color: 0x2a2724, roughness: 0.55 }),
    led: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.85, 1.35) }),
    ledSoft: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.35, 1.1, 0.78) }),
    ledCool: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 2.3, 2.2) }),
    ledDim: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.05, 0.75) }),
    bulb: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.4, 1.6) }),
    wordmark: () => { const m = new THREE.MeshStandardMaterial({ map: texWordmark(), transparent: true, metalness: 0.85, roughness: 0.28, alphaTest: 0.02, emissive: 0x8a6528, emissiveMap: texWordmark(), emissiveIntensity: 0.8 }); return m; },
    signs: () => new THREE.MeshBasicMaterial({ map: texSigns(), color: new THREE.Color(1.15, 1.15, 1.15) }),
    keyFace: () => new THREE.MeshStandardMaterial({ map: texKeys(), metalness: 0.75, roughness: 0.3, envMapIntensity: 1.1 }),
    keyFaceLit: () => new THREE.MeshStandardMaterial({ map: texKeys(), metalness: 0.6, roughness: 0.3, emissive: 0xffc46a, emissiveMap: texKeys(), emissiveIntensity: 0.32 }),
    keyRing: () => S({ color: 0x2a2119, metalness: 0.8, roughness: 0.4 }),
    keyRingLit: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 0.95) }),
    keyRingRed: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.5, 0.3) }),
    btn: () => S({ color: 0xcaa566, metalness: 1, roughness: 0.25 }),
    btnLit: () => S({ color: 0xffe2a0, metalness: 0.5, roughness: 0.3, emissive: 0xffc062, emissiveIntensity: 2.2 }),
    mailbox: () => S({ map: texMailbox(), metalness: 0.7, roughness: 0.35 }),
    art0: () => S({ map: texArt(0), roughness: 0.8 }), art1: () => S({ map: texArt(1), roughness: 0.8 }), art2: () => S({ map: texArt(2), roughness: 0.8 }),
    concrete: () => S({ map: texConcrete(), roughness: 0.92 }, 2.0),
    ceilingP: () => S({ color: 0x9d9b96, roughness: 0.95 }),
    concreteLight: () => S({ map: texConcrete(), color: 0xd8d4cc, roughness: 0.9 }, 2.0),
    epoxy: () => S({ map: texEpoxy(), roughness: 0.32, envMapIntensity: 0.7 }, 4.0),
    paint: () => S({ color: 0xf2efe6, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    paintYellow: () => S({ color: 0xe0b12a, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    paintGreen: () => S({ color: 0x2d6a4a, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    hazard: () => S({ color: 0x1b1b1b, roughness: 0.7 }),
    tyre: () => S({ color: 0x151515, roughness: 0.8 }),
    pipeRed: () => S({ color: 0x7c2620, roughness: 0.55 }),
    steel: () => S({ color: 0xa6a8aa, metalness: 1, roughness: 0.35 }),
    white: () => S({ color: 0xf4f2ee, roughness: 0.4 }),
    daylight: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.5, 2.6) }),
    decal: () => new THREE.MeshBasicMaterial({ map: texScallop(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }),
    pool: () => new THREE.MeshBasicMaterial({ map: texPool(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.22 }),
    poolCool: () => new THREE.MeshBasicMaterial({ map: texPool(), color: 0xbcd0ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.3 }),
    hidden: () => new THREE.MeshBasicMaterial({ visible: false }),
    // cheap baked "SSAO": translucent black ramps hugging the room's corners (no post-processing)
    aoFloor: () => new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: texAO(), transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    aoCeil: () => new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: texAO(), transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    aoWall: () => new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: texAO(), transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  };
  const m = mk[key](); m.name = 'vrc-' + key; MAT[key] = m; return m;
}

// ============================================================ geometry batching
function boxGeo(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g;
}
// UVs in metres from the dominant normal axis (box-projection), scaled by the material's tile size.
function worldUV(g, s) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / s; uv[i * 2 + 1] = v / s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function clean(g) {
  let n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.morphAttributes = {};
  return n;
}
function flipWinding(g) {   // non-indexed: swap the 2nd/3rd vertex of every triangle (after a mirroring scale)
  for (const att of Object.values(g.attributes)) {
    const n = att.itemSize, arr = att.array;
    for (let t = 0; t < att.count; t += 3) for (let k = 0; k < n; k++) { const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k; const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; }
    att.needsUpdate = true;
  }
}
// ---- reflection of a mirrored block (see the header). MZ = mirror plane z of the build in progress (null: none).
let MZ = null;
const BAKED = new WeakSet(), NOMIRROR = new WeakSet();
const TEXT_MATS = new Set(['wordmark', 'mailbox', 'signs']);
const _flipX = new THREE.Matrix4().makeScale(-1, 1, 1);
function mirrorMatrix(z0) { return new THREE.Matrix4().makeTranslation(0, 0, z0).multiply(new THREE.Matrix4().makeScale(1, 1, -1)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -z0)); }
function mirrorGeo(g, z0) { g.applyMatrix4(mirrorMatrix(z0)); flipWinding(g); return g; }
function mirrorObj(o, z0) { o.position.z = 2 * z0 - o.position.z; o.rotation.y = Math.PI - o.rotation.y; }
class Batch {
  // mz: mirror plane (z) applied at flush, default = the build in progress; text: every quad carries text / numerals
  constructor(mz = MZ, text = false) { this.parts = new Map(); this.mz = mz; this.text = text; }
  add(mat, geo, matrix) {
    const key = typeof mat === 'string' ? mat : null;
    if (typeof mat === 'string') mat = M(mat);
    let g = clean(geo);
    if (this.mz != null && (this.text || TEXT_MATS.has(key))) { g.applyMatrix4(_flipX); flipWinding(g); }   // reads correctly once reflected
    if (matrix) g.applyMatrix4(matrix);
    if (mat.userData.uv) worldUV(g, mat.userData.uv);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }
  box(mat, x0, x1, y0, y1, z0, z1) { return this.add(mat, boxGeo(Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1), Math.min(z0, z1), Math.max(z0, z1))); }
  flush(parent, ud = {}) {
    const out = [];
    for (const [mat, list] of this.parts) {
      if (this.mz != null) for (const g of list) mirrorGeo(g, this.mz);
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) list.forEach(g => g.dispose());
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat); Object.assign(mesh.userData, ud); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (mat.transparent) mesh.renderOrder = 2;
      BAKED.add(mesh); parent.add(mesh); out.push(mesh);
    }
    this.parts.clear(); return out;
  }
}
// Invisible colliders, chunked spatially so walk.js's proximity filter stays cheap.
class Colliders {
  constructor(cell = 14, mz = MZ) { this.cell = cell; this.mz = mz; this.solid = new Map(); this.floor = new Map(); }
  _k(x, z) { return Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); }
  _put(map, k, g) { if (!map.has(k)) map.set(k, []); map.get(k).push(g); }
  box(x0, x1, y0, y1, z0, z1) {
    const [a0, a1] = [Math.min(x0, x1), Math.max(x0, x1)], [b0, b1] = [Math.min(z0, z1), Math.max(z0, z1)];
    // split long walls across cells
    const n = Math.max(1, Math.ceil(Math.max(a1 - a0, b1 - b0) / this.cell));
    for (let i = 0; i < n; i++) {
      const s0 = i / n, s1 = (i + 1) / n;
      const cx0 = a1 - a0 >= b1 - b0 ? mix(a0, a1, s0) : a0, cx1 = a1 - a0 >= b1 - b0 ? mix(a0, a1, s1) : a1;
      const cz0 = a1 - a0 >= b1 - b0 ? b0 : mix(b0, b1, s0), cz1 = a1 - a0 >= b1 - b0 ? b1 : mix(b0, b1, s1);
      this._put(this.solid, this._k((cx0 + cx1) / 2, (cz0 + cz1) / 2), clean(boxGeo(cx0, cx1, Math.min(y0, y1), Math.max(y0, y1), cz0, cz1)));
    }
  }
  rect(x0, x1, z0, z1, y = 0) {
    const [a0, a1] = [Math.min(x0, x1), Math.max(x0, x1)], [b0, b1] = [Math.min(z0, z1), Math.max(z0, z1)];
    const nx = Math.max(1, Math.ceil((a1 - a0) / this.cell)), nz = Math.max(1, Math.ceil((b1 - b0) / this.cell));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x_0 = mix(a0, a1, i / nx), x_1 = mix(a0, a1, (i + 1) / nx), z_0 = mix(b0, b1, j / nz), z_1 = mix(b0, b1, (j + 1) / nz);
      const g = new THREE.PlaneGeometry(x_1 - x_0, z_1 - z_0); g.rotateX(-Math.PI / 2); g.translate((x_0 + x_1) / 2, y, (z_0 + z_1) / 2);
      this._put(this.floor, this._k((x_0 + x_1) / 2, (z_0 + z_1) / 2), clean(g));
    }
  }
  geoFloor(g) { g = clean(g); g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); this._put(this.floor, this._k(c.x, c.z), g); }
  flush(parent) {
    for (const [map, flag] of [[this.solid, 'solid'], [this.floor, 'floor']]) for (const list of map.values()) {
      if (this.mz != null) for (const g of list) mirrorGeo(g, this.mz);
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false); if (list.length > 1) list.forEach(g => g.dispose());
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, M('hidden')); m.userData[flag] = true; m.userData.collider = true; m.name = 'vrc-' + flag;
      m.matrixAutoUpdate = false; BAKED.add(m); parent.add(m);
    }
    this.solid.clear(); this.floor.clear();
  }
}

// Build a Batch of instanced copies: one InstancedMesh per material.
function instanced(parent, geo, mat, matrices, colors) {
  if (!matrices.length) return null;
  if (typeof mat === 'string') mat = M(mat);
  if (MZ != null) { const S = mirrorMatrix(MZ); matrices = matrices.map(m => S.clone().multiply(m).multiply(S)); }   // reflected placement, object not mirrored
  const im = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  if (colors) { colors.forEach((c, i) => im.setColorAt(i, c)); im.instanceColor.needsUpdate = true; }
  im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); if (im.computeBoundingBox) im.computeBoundingBox();
  BAKED.add(im); parent.add(im); return im;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function mat4(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0) { return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0)), _s.set(sx, sy, sz)); }

// A flat ramp quad: corner edge p0→p1, extending by vector w (the ramp fades along w). uv.y = 0 on the edge.
function aoQuad(B, mat, p0, p1, w) {
  const q = [p0, p1, [p1[0] + w[0], p1[1] + w[1], p1[2] + w[2]], [p0[0] + w[0], p0[1] + w[1], p0[2] + w[2]]];
  const pos = [], uv = [], U = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...q[i]); uv.push(...U[i]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  B.add(mat, g);
}

// ============================================================ lights (one shared rig → constant light count)
const RIG = { group: null, pts: [], hemi: null, car: null, carOwner: null };
function lightRig() {
  if (RIG.group) return RIG;
  RIG.group = new THREE.Group(); RIG.group.name = 'vrc-commons-lights';
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffd4a0, 0, 11, 2); RIG.pts.push(l); RIG.group.add(l); }
  RIG.hemi = new THREE.HemisphereLight(0xfff1dc, 0x3b342c, 0); RIG.group.add(RIG.hemi);
  RIG.car = new THREE.PointLight(0xffe6c8, 0, 3.2, 2); RIG.group.add(RIG.car);
  return RIG;
}
function claimRig(root, spots, hemi = 0.12) {
  const R = lightRig(); root.add(R.group);
  R.pts.forEach((l, i) => { const s = spots[i]; if (s) { l.position.set(s[0], s[1], MZ != null ? 2 * MZ - s[2] : s[2]); l.intensity = s[3] ?? 7; l.color.setHex(s[4] ?? 0xffd4a0); l.distance = s[5] ?? 11; } else l.intensity = 0; });
  R.hemi.intensity = hemi; R.car.intensity = 0; R.carOwner = null;
}

// ============================================================ walls
// A wall run along axis 'x' (constant z = c) or 'z' (constant x = c). `side` (+1/-1) points from the wall line into
// the room being finished; d = distance from the line toward the room. Body d ∈ [-WALL_T, FACE].
function wallRun(ctx, s) {
  const { B, C } = ctx;
  const H = s.H ?? ctx.H;
  const P = (a, d) => s.axis === 'x' ? [a, s.c + s.side * d] : [s.c + s.side * d, a];
  const box = (mat, a0, a1, y0, y1, d0, d1) => { const [x0, z0] = P(a0, d0), [x1, z1] = P(a1, d1); B.box(mat, x0, x1, y0, y1, z0, z1); };
  const col = (a0, a1, y0, y1, d0, d1) => { const [x0, z0] = P(a0, d0), [x1, z1] = P(a1, d1); C.box(x0, x1, y0, y1, z0, z1); };
  const ops = (s.openings || []).map(o => ({ ...o, a0: o.c - o.w / 2, a1: o.c + o.w / 2 })).filter(o => o.a1 > s.a0 && o.a0 < s.a1).sort((p, q) => p.a0 - q.a0);
  // body gaps: lifts also leave a door pocket
  const gaps = ops.map(o => o.kind === 'lift' ? [o.c - POCKET, o.c + POCKET, LIFT_H + 0.1] : [o.a0, o.a1, o.h]);
  let a = s.a0;
  const solidSeg = (a0, a1) => { if (a1 - a0 < 0.005) return; if (!s.noBody) box(s.body || 'plaster', a0, a1, 0, H, -WALL_T, FACE); col(a0, a1, 0, H, -WALL_T, FACE + 0.03); };
  for (const [g0, g1, h] of gaps) {
    solidSeg(a, Math.max(a, g0));
    if (h < H && !s.noBody) box(s.body || 'plaster', g0, g1, h, H, -WALL_T, FACE);
    if (h < H) col(g0, g1, h, H, -WALL_T, FACE);
    a = Math.max(a, g1);
  }
  solidSeg(a, s.a1);
  // contact darkening where the wall meets the floor (and the ceiling on typical floors); faded across openings
  if (!s.noAO) {
    const d0 = FACE + SKIN + 0.001, P3 = (a, d, y) => { const [x, z] = P(a, d); return [x, y, z]; };
    const inw = s.axis === 'x' ? [0, 0, s.side] : [s.side, 0, 0];
    const floorW = 0.34, ceilW = 0.3, ceil = ctx.floor >= 1 && s.H == null;
    let aa = s.a0;
    const run = (a0, a1) => {
      if (a1 - a0 < 0.05) return;
      aoQuad(B, 'aoFloor', P3(a0, d0, 0.003), P3(a1, d0, 0.003), inw.map(v => v * floorW));
      if (ceil) aoQuad(B, 'aoCeil', P3(a1, d0, H - 0.003), P3(a0, d0, H - 0.003), inw.map(v => v * ceilW));
      if (ceil) aoQuad(B, 'aoWall', P3(a0, d0 + 0.001, H - 0.004), P3(a1, d0 + 0.001, H - 0.004), [0, -0.22, 0]);
    };
    for (const o of ops) { run(aa, Math.min(o.a0, s.a1)); if (o.kind !== 'lift' && ceil) aoQuad(B, 'aoCeil', P3(o.a1, d0, H - 0.003), P3(o.a0, d0, H - 0.003), inw.map(v => v * ceilW)); aa = Math.max(aa, o.a1); }
    run(aa, s.a1);
  }
  // finish overlays by zone (painter's algorithm over [a0,a1])
  const zones = [{ a0: s.a0, a1: s.a1, mat: s.finish || 'fabric' }, ...(s.zones || [])];
  const cuts = new Set([s.a0, s.a1]); zones.forEach(z => { cuts.add(clamp(z.a0, s.a0, s.a1)); cuts.add(clamp(z.a1, s.a0, s.a1)); });
  ops.forEach(o => { cuts.add(clamp(o.a0, s.a0, s.a1)); cuts.add(clamp(o.a1, s.a0, s.a1)); });
  const pts = [...cuts].sort((p, q) => p - q);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1]; if (p1 - p0 < 0.004) continue;
    const mid = (p0 + p1) / 2;
    let zone = zones[0]; for (const z of zones) if (mid > z.a0 && mid < z.a1) zone = z;
    const op = ops.find(o => mid > o.a0 && mid < o.a1);
    const skirt = zone.skirt ?? (zone.mat !== 'marble' && zone.mat !== 'nero');
    const y0 = op ? op.h : (skirt ? 0.1 : 0);
    if (y0 < H) box(zone.mat, p0, p1, y0, H - 0.005, FACE, FACE + SKIN);
    if (!op && skirt) box('bronzeDark', p0, p1, 0, 0.1, FACE, FACE + 0.026);
    if (!op && zone.mat === 'fabric') box('bronze', p0, p1, 0.93, 0.945, FACE, FACE + SKIN + 0.004);
  }
  // opening trims
  for (const o of ops) {
    if (o.kind === 'pass' || o.noTrim) {
      for (const e of [o.a0, o.a1]) box('bronzeDark', e - 0.012, e + 0.012, 0, o.h, -WALL_T, FACE + 0.02);
      if (o.h < H) box('bronzeDark', o.a0, o.a1, o.h - 0.012, o.h + 0.012, -WALL_T, FACE + 0.02);
      continue;
    }
    const t = o.kind === 'lift' ? 0.07 : 0.045, p = o.kind === 'lift' ? 0.05 : 0.032;
    const mat = o.kind === 'lift' ? 'bronze' : 'bronze';
    box(mat, o.a0 - t, o.a0, 0, o.h + t, FACE, FACE + p); box(mat, o.a1, o.a1 + t, 0, o.h + t, FACE, FACE + p);
    box(mat, o.a0 - t, o.a1 + t, o.h, o.h + t, FACE, FACE + p);
    if (o.kind === 'door' || o.kind === 'service') {   // jamb reveals + threshold
      box('bronzeDark', o.a0, o.a0 + 0.012, 0, o.h, -WALL_T, FACE); box('bronzeDark', o.a1 - 0.012, o.a1, 0, o.h, -WALL_T, FACE);
      box('bronzeDark', o.a0, o.a1, o.h - 0.012, o.h, -WALL_T, FACE);
      box('nero', o.a0, o.a1, 0, 0.008, -WALL_T, FACE + 0.01);
    }
    if (o.kind === 'lift') box('bronze', o.a0, o.a1, 0, 0.012, -0.12, FACE + 0.04);   // landing sill
  }
  // scallop decals on solid wall stretches
  if (s.scallops) {
    for (const a of s.scallops) {
      if (ops.some(o => a > o.a0 - 0.35 && a < o.a1 + 0.35)) continue;
      const [x, z] = P(a, FACE + SKIN + 0.004);
      const g = new THREE.PlaneGeometry(0.9, 1.7); g.translate(0, H - 0.02 - 0.85, 0);
      const yaw = s.axis === 'x' ? (s.side > 0 ? 0 : Math.PI) : (s.side > 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.B.add('decal', g, mat4(x, 0, z, yaw));
    }
  }
  return { P, box, col };
}

// door leaf (individual mesh, closed); handle as child
const _leafGeo = {};
function doorLeaf(unitId, x, z, alongX, yaw, handleSide) {
  const w = DOOR_W - 0.01;
  const g = _leafGeo.leaf || (_leafGeo.leaf = (() => { const b = new THREE.BoxGeometry(w, DOOR_H - 0.01, 0.05); worldUV(b, 1.0); return b; })());
  const leaf = new THREE.Mesh(g, M('walnutDoor'));
  leaf.position.set(x, (DOOR_H - 0.01) / 2, z); leaf.rotation.y = yaw;
  leaf.userData = { action: { type: 'aptDoor', unitId }, doorLeaf: true, unitId, solid: true };
  leaf.name = 'vrc-door-' + unitId;
  const hg = _leafGeo.handle || (_leafGeo.handle = (() => {
    const parts = [boxGeo(-0.012, 0.012, -0.03, 0.03, 0.025, 0.06), boxGeo(-0.14, 0.012, -0.011, 0.011, 0.05, 0.072),
      boxGeo(-0.012, 0.012, -0.03, 0.03, -0.06, -0.025), boxGeo(-0.14, 0.012, -0.011, 0.011, -0.072, -0.05),
      boxGeo(-0.02, 0.02, 0.35, 0.39, 0.025, 0.03)].map(clean);    // + peephole ring
    return mergeGeometries(parts, false);
  })());
  // lever + peephole + brass inlay lines as one child mesh; mirrored per handle side
  const key = 'trim' + handleSide;
  const tg = _leafGeo[key] || (_leafGeo[key] = (() => {
    const hgC = hg.clone(); hgC.applyMatrix4(new THREE.Matrix4().makeScale(handleSide, 1, 1)); hgC.translate(handleSide * (w / 2 - 0.08), 1.02 - (DOOR_H - 0.01) / 2, 0);
    const inl = [0.55, 0.0, -0.55].flatMap(y => [clean(boxGeo(-w / 2 + 0.1, w / 2 - 0.1, y - 0.004, y + 0.004, 0.024, 0.029)), clean(boxGeo(-w / 2 + 0.1, w / 2 - 0.1, y - 0.004, y + 0.004, -0.029, -0.024))]);
    if (handleSide < 0) flipWinding(hgC);
    return mergeGeometries([hgC, ...inl], false);
  })());
  leaf.add(new THREE.Mesh(tg, M('brass')));
  return leaf;
}

// ============================================================ Lift
const LIFT_REGISTRY = new Set();
let _audio = null;
function chime() {
  try {
    const ua = navigator.userActivation;
    if (!ua || !ua.hasBeenActive) return;            // only after a user gesture
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    _audio = _audio || new AC();
    if (_audio.state === 'suspended') _audio.resume().catch(() => {});
    const t0 = _audio.currentTime + 0.02;
    [[1318.5, 0], [987.8, 0.28]].forEach(([f, dt]) => {
      const o = _audio.createOscillator(), g = _audio.createGain(), o2 = _audio.createOscillator(), g2 = _audio.createGain();
      o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
      g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(0.09, t0 + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dt + 1.3);
      g2.gain.setValueAtTime(0, t0 + dt); g2.gain.linearRampToValueAtTime(0.02, t0 + dt + 0.01); g2.gain.exponentialRampToValueAtTime(0.0003, t0 + dt + 0.6);
      o.connect(g).connect(_audio.destination); o2.connect(g2).connect(_audio.destination);
      o.start(t0 + dt); o2.start(t0 + dt); o.stop(t0 + dt + 1.4); o2.stop(t0 + dt + 0.7);
    });
  } catch { /* audio is optional */ }
}
const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function tween(ms, fn) {
  return new Promise(res => {
    const t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); fn(k); if (k < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
}
// Car interior (lift-local frame: +z = liftNormal, z = 0 on the landing wall line, x across the door):
const CAR = { x: 0.8, zf: -0.18, zb: -1.9, h: 2.45 };

export class Lift {
  // core: CORES index (or the core object); doorIndex: 0/1; floor: landing floor of this instance (the car starts here);
  // opts.rear: also build a rear landing (ground floor lobbies); opts.decor: static, not registered.
  constructor(bId, core, doorIndex, floor = 0, opts = {}) {
    this.bId = bId; this.core = typeof core === 'number' ? core : CORES.indexOf(core);
    const C = coresOf(bId)[this.core];   // true (reflected for C3) core: the lift is placed directly, never reflected
    this.stair = C.stair; this.doorIndex = doorIndex; this.floor = floor; this.homeFloor = floor;
    this.doorsOpen = false; this.moving = false; this.rear = !!opts.rear; this.target = null;
    this.occupied = false;          // set by the walker while someone stands in the car (keeps it visible with doors shut)
    this.carDepth = CAR_DEPTH;
    const [dx, dz] = C.liftDoors[doorIndex], [nx, nz] = C.liftNormal;
    this.group = new THREE.Group(); this.group.name = `vrc-lift-${bId}-${C.stair}-${doorIndex}`;
    const frame = new THREE.Group(); frame.position.set(dx, 0, dz); frame.rotation.y = Math.atan2(nx, nz); this.group.add(frame);
    this.frame = frame;
    this.landing = new THREE.Group(); this.landing.position.y = floorY(floor); frame.add(this.landing);
    this.car = new THREE.Group(); this.car.position.y = floorY(floor); frame.add(this.car); this.car.visible = false;
    // indicator (shared by landing + car)
    this.ind = canvas(256, 96); this.indTex = texOf(this.ind, { repeat: false });
    this.indMat = new THREE.MeshBasicMaterial({ map: this.indTex, color: new THREE.Color(1.4, 1.4, 1.4) });
    this._drawInd(floor, 0);
    this._buildLanding(opts);
    this._buildCar();
    if (!opts.decor) LIFT_REGISTRY.add(this);
    this._openP = null; this._closeP = null;
  }
  get y() { return this.car.position.y; }
  _drawInd(f, dir) {
    const g = this.ind.getContext('2d');
    g.fillStyle = '#070605'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#f3c978'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 64px ${SANS}`;
    g.shadowColor = 'rgba(255,190,90,0.8)'; g.shadowBlur = 12;
    g.fillText(floorLabel(f), 150, 52);
    if (dir) { g.beginPath(); if (dir > 0) { g.moveTo(58, 26); g.lineTo(82, 58); g.lineTo(34, 58); } else { g.moveTo(58, 72); g.lineTo(82, 40); g.lineTo(34, 40); } g.closePath(); g.fill(); }
    g.shadowBlur = 0; this.indTex.needsUpdate = true; this._indF = f; this._indD = dir;
  }
  _panelPair(parent, z, dir) {   // two door panels (left/right) at depth z; dir: +1 faces +z
    const g = new THREE.BoxGeometry(0.53, LIFT_H - 0.01, 0.035); g.translate(0, (LIFT_H - 0.01) / 2, 0);
    worldUV(g, 1);
    const L = new THREE.Mesh(g, M('bronze')), R = new THREE.Mesh(g, M('bronze'));
    L.position.set(-0.26, 0.002, z); R.position.set(0.26, 0.002, z);
    for (const p of [L, R]) { p.userData.solid = true; p.userData.dynamic = true; parent.add(p); }
    // vertical reveal line where panels meet
    return [L, R, g];
  }
  _buildLanding(opts) {
    const b = new Batch();
    // shaft side walls + back (only near this landing; the shaft above/below is never seen)
    b.box('plasterW', -POCKET - 0.1, -POCKET, -0.3, 2.95, 0.02, -2.42);
    b.box('plasterW', POCKET, POCKET + 0.1, -0.3, 2.95, 0.02, -2.42);
    if (!this.rear) b.box('plasterW', -POCKET, POCKET, -0.3, 2.95, -2.32, -2.42);
    b.box('nero', -0.5, 0.5, -0.02, 0.012, -0.1, 0.02);           // threshold into the car
    if (this.rear) b.box('nero', -0.5, 0.5, -0.02, 0.012, -2.42, -1.96);
    // indicator housing above the opening (corridor side)
    b.box('blackGlass', -0.2, 0.2, LIFT_H + 0.11, LIFT_H + 0.27, FACE + SKIN, FACE + SKIN + 0.01);
    if (this.rear) b.box('blackGlass', -0.2, 0.2, LIFT_H + 0.11, LIFT_H + 0.27, -2.4 - FACE - SKIN, -2.4 - FACE - SKIN - 0.01);
    b.flush(this.landing);
    this._geos = [];
    const ig = new THREE.PlaneGeometry(0.34, 0.13); this._geos.push(ig);
    const ind = new THREE.Mesh(ig, this.indMat); ind.position.set(0, LIFT_H + 0.19, FACE + SKIN + 0.012); this.landing.add(ind);
    if (this.rear) { const i2 = new THREE.Mesh(ig, this.indMat); i2.position.set(0, LIFT_H + 0.19, -2.4 - FACE - SKIN - 0.012); i2.rotation.y = Math.PI; this.landing.add(i2); }
    const [L, R, g] = this._panelPair(this.landing, -0.055); this._geos.push(g);
    this.landDoors = [L, R];
    if (this.rear) { const [L2, R2] = this._panelPair(this.landing, -2.345); this.landDoors.push(L2, R2); }
  }
  _buildCar() {
    const b = new Batch(), s = new Batch(), fl = new Batch();
    const { x, zf, zb, h } = CAR;
    // floor & ceiling
    b.box('nero', -x, x, -0.06, 0, zb - 0.1, zf + 0.08);
    b.box('bronzeDark', -x - 0.04, x + 0.04, h, h + 0.05, zb - 0.06, zf + 0.02);
    // soft contact darkening along the car walls (floor) and around the LED ceiling
    const xi = x - 0.012, fy = 0.003;
    aoQuad(b, 'aoFloor', [-xi, fy, zb], [-xi, fy, zf], [0.22, 0, 0]); aoQuad(b, 'aoFloor', [xi, fy, zb], [xi, fy, zf], [-0.22, 0, 0]);
    aoQuad(b, 'aoFloor', [-xi, fy, zb + 0.012], [xi, fy, zb + 0.012], [0, 0, 0.22]);
    aoQuad(b, 'aoCeil', [-xi, h - 0.053, zb], [-xi, h - 0.053, zf], [0.12, 0, 0]); aoQuad(b, 'aoCeil', [xi, h - 0.053, zb], [xi, h - 0.053, zf], [-0.12, 0, 0]);
    // LED ceiling: glowing panel framed in bronze with dot grid
    b.box('bronze', -x + 0.02, x - 0.02, h - 0.05, h, zb + 0.02, zf - 0.02);
    b.box('ledSoft', -x + 0.14, x - 0.14, h - 0.052, h - 0.05, zb + 0.14, zf - 0.14);
    for (let i = 1; i < 4; i++) { const xx = -x + 0.14 + (i / 4) * (2 * x - 0.28); b.box('brass', xx - 0.01, xx + 0.01, h - 0.09, h - 0.052, zb + 0.14, zf - 0.14); }
    for (let i = 1; i < 4; i++) { const zz = zb + 0.14 + (i / 4) * (zf - zb - 0.28); b.box('brass', -x + 0.14, x - 0.14, h - 0.09, h - 0.052, zz - 0.01, zz + 0.01); }
    b.box('brass', -x + 0.13, x - 0.13, h - 0.09, h - 0.052, zb + 0.13, zb + 0.15); b.box('brass', -x + 0.13, x - 0.13, h - 0.09, h - 0.052, zf - 0.15, zf - 0.13);
    b.box('brass', -x + 0.13, -x + 0.15, h - 0.09, h - 0.052, zb + 0.13, zf - 0.13); b.box('brass', x - 0.15, x - 0.13, h - 0.09, h - 0.052, zb + 0.13, zf - 0.13);
    // side walls: brushed bronze panels with dark reveals
    for (const sx of [-1, 1]) {
      const xi = sx * x, xo = sx * (x + 0.04);
      s.box('bronzeDark', xi, xo, 0, h, zb - 0.04, zf);
      for (const [z0, z1] of [[zb, zb + 0.56], [zb + 0.58, zb + 1.14], [zb + 1.16, zf]]) b.box('bronzeCar', xi, xi - sx * 0.012, 0.12, h - 0.06, z0 + 0.005, z1 - 0.005);
      b.box('bronzeDark', xi, xi - sx * 0.02, 0, 0.12, zb, zf);   // kick
    }
    // mirror on the left (+x) wall, framed
    b.box('mirror', x - 0.014, x - 0.018, 0.95, h - 0.14, zb + 0.12, zf - 0.12);
    b.box('bronze', x - 0.012, x - 0.03, 0.92, 0.95, zb + 0.1, zf - 0.1);
    // handrails (+x wall and back)
    const rail = (x0, x1, z0, z1) => { b.box('brass', x0, x1, 0.9, 0.94, z0, z1); };
    rail(x - 0.09, x - 0.05, zb + 0.15, zf - 0.15);
    for (const zz of [zb + 0.2, zf - 0.2]) b.box('brass', x - 0.09, x - 0.012, 0.905, 0.935, zz - 0.015, zz + 0.015);
    rail(-x + 0.15, x - 0.15, zb + 0.05, zb + 0.09);
    // front return walls + header (doors between)
    for (const sx of [-1, 1]) { s.box('bronzeDark', sx * 0.5, sx * x, 0, h, zf, zf + 0.04); b.box('bronzeCar', sx * 0.505, sx * (x - 0.005), 0.12, h - 0.06, zf - 0.012, zf); }
    s.box('bronzeDark', -0.5, 0.5, LIFT_H, h, zf, zf + 0.04);
    // back: rear doors opening in a bronze wall (through-car; rear doors only open at the ground-floor lobbies)
    for (const sx of [-1, 1]) { s.box('bronzeDark', sx * 0.5, sx * x, 0, h, zb - 0.04, zb); b.box('bronzeCar', sx * 0.505, sx * (x - 0.005), 0.12, h - 0.06, zb, zb + 0.012); }
    s.box('bronzeDark', -0.5, 0.5, LIFT_H, h, zb - 0.04, zb);
    // operating panel (COP) on the right (-x) wall, next to the door: black glass plate in a brass frame
    const P = this.panel = { xs: -x + 0.026, zc: zf - 0.25, y0: 1.03, y1: 1.565 };
    const pw = 0.145;
    b.box('blackGlass', -x + 0.012, P.xs, P.y0, P.y1, P.zc - pw, P.zc + pw);
    for (const [y0, y1, z0, z1] of [[P.y0 - 0.008, P.y0, P.zc - pw - 0.008, P.zc + pw + 0.008], [P.y1, P.y1 + 0.008, P.zc - pw - 0.008, P.zc + pw + 0.008],
      [P.y0, P.y1, P.zc - pw - 0.008, P.zc - pw], [P.y0, P.y1, P.zc + pw, P.zc + pw + 0.008]]) b.box('brass', -x + 0.012, P.xs + 0.003, y0, y1, z0, z1);
    // screen bezel + hairline under the floor keys
    b.box('bronzeDark', P.xs, P.xs + 0.002, 1.462, 1.532, P.zc - 0.085, P.zc + 0.085);
    b.box('brass', P.xs, P.xs + 0.002, 1.1495, 1.1525, P.zc - 0.1, P.zc + 0.1);
    // interior indicator above the door
    b.box('blackGlass', -0.22, 0.22, LIFT_H + 0.06, LIFT_H + 0.22, zf - 0.012, zf - 0.02);
    const shell = b.flush(this.car);
    const walls = s.flush(this.car, { solid: true });
    fl.add('hidden', (() => { const g = new THREE.PlaneGeometry(2 * x, zf - zb + 0.3); g.rotateX(-Math.PI / 2); g.translate(0, 0, (zf + zb) / 2 + 0.08); return g; })());
    fl.flush(this.car, { floor: true });
    const ci = new THREE.Mesh(this._geos[0], this.indMat); ci.rotation.y = Math.PI; ci.position.set(0, LIFT_H + 0.14, zf - 0.022); this.car.add(ci);
    // small floor screen on the panel (same live indicator texture)
    const sg = new THREE.PlaneGeometry(0.15, 0.056); sg.rotateY(Math.PI / 2); this._geos.push(sg);
    const scr = new THREE.Mesh(sg, this.indMat); scr.position.set(P.xs + 0.0025, 1.497, P.zc); this.car.add(scr);
    // keys: stainless face (engraved label from the atlas), brass rim, halo ring that lights up, generous invisible hit pad
    const rimG = new THREE.CylinderGeometry(KEY_R + 0.0015, KEY_R + 0.0025, 0.006, 32); rimG.rotateZ(Math.PI / 2);
    const ringG = new THREE.TorusGeometry(KEY_R + 0.0035, 0.0021, 8, 40); ringG.rotateY(Math.PI / 2);
    const hitG = new THREE.BoxGeometry(0.03, KEY_PITCH - 0.004, KEY_PITCH - 0.004);
    this._geos.push(rimG, ringG, hitG);
    this.buttons = new Map();
    const ids = { building: this.bId, stair: this.stair, core: this.core, doorIndex: this.doorIndex };
    PANEL_ROWS.forEach((row, ri) => row.forEach((k, colI) => {
      const y = ri < 4 ? 1.395 - ri * KEY_PITCH : 1.1;
      const z = P.zc + (1 - colI) * KEY_PITCH;          // facing the panel (-x), ascending numbers run left → right (= -z)
      const g = new THREE.Group(); g.position.set(P.xs, y, z);
      const fg = new THREE.CircleGeometry(KEY_R, 32); fg.rotateY(Math.PI / 2);
      const cell = keyCell(k), uv = fg.attributes.uv, cu = (cell % 4) / 4, cv = 1 - (((cell / 4) | 0) + 1) / 4;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) / 4, cv + uv.getY(i) / 4);
      this._geos.push(fg);
      const rim = new THREE.Mesh(rimG, M('brass')); rim.position.x = 0.003;
      const face = new THREE.Mesh(fg, M('keyFace')); face.position.x = 0.0062;
      const ring = new THREE.Mesh(ringG, M('keyRing')); ring.position.x = 0.0012;
      const hit = new THREE.Mesh(hitG, M('hidden')); hit.position.x = 0.01;
      g.add(rim, face, ring, hit);
      g.userData.action = typeof k === 'number' ? { type: 'liftButton', floor: k, ...ids }
        : k === 'bell' ? { type: 'liftAlarm', ...ids } : { type: 'liftDoor', open: k === 'open', ...ids };
      g.name = 'vrc-lift-key-' + (typeof k === 'number' ? floorLabel(k) : k);
      this.car.add(g); this.buttons.set(k, { g, face, ring, x0: P.xs });
    }));
    // doors
    const [L, R] = this._panelPair(this.car, zf + 0.06);
    const [L2, R2] = this._panelPair(this.car, zb - 0.06);
    this.carDoors = [L, R]; this.rearDoors = [L2, R2];
    this._shell = [...shell, ...walls];
  }
  _setDoors(k, rearToo) {
    const off = 0.26 + 0.505 * k;
    const sets = [this.carDoors];
    if (this.floor === this.homeFloor) sets.push(this.landDoors.slice(0, 2));
    if (rearToo) { sets.push(this.rearDoors); if (this.floor === this.homeFloor && this.landDoors.length > 2) sets.push(this.landDoors.slice(2)); }
    for (const [L, R] of sets) { L.position.x = -off; R.position.x = off; }
  }
  _solid(on) {
    const all = [...this.carDoors, ...this.rearDoors, ...this.landDoors];
    for (const p of all) p.userData.solid = true;
    if (!on) {
      for (const p of this.carDoors) p.userData.solid = false;
      if (this.floor === this.homeFloor) for (const p of this.landDoors.slice(0, 2)) p.userData.solid = false;
      if (this._rearNow()) { for (const p of this.rearDoors) p.userData.solid = false; if (this.floor === this.homeFloor) for (const p of this.landDoors.slice(2)) p.userData.solid = false; }
    }
  }
  _rearNow() { return this.rear && this.floor === this.homeFloor; }
  _carLight(on) {
    const R = lightRig();
    if (on) R.carOwner = this; else if (R.carOwner !== this) return;
    if (!R.group.parent) return;
    if (!on) { R.car.intensity = 0; R.carOwner = null; return; }
    this.car.updateMatrixWorld(true); R.group.parent.updateMatrixWorld(true);
    const v = this.car.localToWorld(new THREE.Vector3(0, CAR.h - 0.35, (CAR.zf + CAR.zb) / 2));
    R.group.worldToLocal(v); R.car.position.copy(v); R.car.intensity = 0.3;
  }
  async open() {
    if (this.doorsOpen) return;
    if (this._openP) return this._openP;
    if (this._closeP) await this._closeP;
    this.car.visible = true; this._carLight(true);
    const rear = this._rearNow();
    this._openP = tween(1100, k => this._setDoors(ease(k), rear)).then(() => { this.doorsOpen = true; this._solid(false); this._openP = null; });
    return this._openP;
  }
  async close() {
    if (this._openP) await this._openP;
    if (!this.doorsOpen) return;
    if (this._closeP) return this._closeP;
    this._solid(true);
    const rear = this._rearNow();
    this._closeP = tween(1000, k => this._setDoors(1 - ease(k), rear)).then(() => {
      this.doorsOpen = false; this._closeP = null;
      if (!this.moving && !this.occupied) { this.car.visible = false; this._carLight(false); }
    });
    return this._closeP;
  }
  _twin(floor) {
    for (const L of LIFT_REGISTRY) if (L !== this && L.bId === this.bId && L.core === this.core && L.doorIndex === this.doorIndex && L.homeFloor === floor && L.group.parent) return L;
    return null;
  }
  // Ride to `floor`. onTick(y) receives the car floor's absolute building-local y every frame.
  // If the destination floor's commons (a twin Lift) already exists, its doors are left for the caller to open
  // (walk.js does that after swapping commons); otherwise this car's doors open on arrival.
  async travelTo(floor, onTick) {
    floor = Math.max(-1, Math.min(TOP_FLOOR, floor | 0));
    if (this.moving) return;
    if (floor === this.floor) { await this.open(); return; }
    this.moving = true; this.target = floor; this._lightButton(floor, true);
    this.car.visible = true;
    await this.close();
    this.car.visible = true;
    const y0 = floorY(this.floor), y1 = floorY(floor), n = Math.abs(floor - this.floor);
    const dur = Math.min(6000, Math.max(1800, 1200 * n)), dir = Math.sign(y1 - y0);
    const acc = Math.min(0.3, 1100 / dur);   // trapezoidal velocity: accelerate / cruise / decelerate
    const prof = k => { const vmax = 1 / (1 - acc); if (k < acc) return 0.5 * vmax * k * k / acc; if (k > 1 - acc) { const r = 1 - k; return 1 - 0.5 * vmax * r * r / acc; } return vmax * (k - acc / 2); };
    this._drawInd(this.floor, dir);
    await new Promise(r => setTimeout(r, 250));
    await tween(dur, k => {
      const y = y0 + (y1 - y0) * prof(k);
      this.car.position.y = y; this._carLight(true);
      let near = this.floor, bd = 1e9; for (let f = -1; f <= TOP_FLOOR; f++) { const d = Math.abs(floorY(f) - y); if (d < bd) { bd = d; near = f; } }
      if (near !== this._indF) this._drawInd(near, dir);
      if (onTick) try { onTick(y); } catch (e) { console.warn(e); }
    });
    this.car.position.y = y1; if (onTick) try { onTick(y1); } catch (e) { console.warn(e); }
    this.floor = floor; this.moving = false; this.target = null;
    this._drawInd(floor, 0); this._lightButton(floor, false);
    chime();
    await new Promise(r => setTimeout(r, 350));
    if (!this._twin(floor)) await this.open();
  }
  // Key feedback: the halo ring glows (red for the alarm) and the stainless face picks up a warm tint.
  _lightButton(k, on) {
    const b = this.buttons && this.buttons.get(k); if (!b) return;
    b.ring.material = on ? M(k === 'bell' ? 'keyRingRed' : 'keyRingLit') : M('keyRing');
    b.face.material = on ? M('keyFaceLit') : M('keyFace');
    b.lit = !!on;
  }
  /** Press a key: short push-in travel + light. Floor keys stay lit until the car arrives; door/alarm keys flash. */
  press(k, holdMs = 0) {
    const b = this.buttons && this.buttons.get(k); if (!b) return;
    this._lightButton(k, true);
    const x0 = b.x0;
    tween(170, t => { b.g.position.x = x0 - 0.0035 * Math.sin(Math.PI * t); b.g.updateMatrixWorld(true); });
    if (holdMs) { clearTimeout(b._t); b._t = setTimeout(() => { if (this.target !== k) this._lightButton(k, false); }, holdMs); }
  }
  dispose() {
    LIFT_REGISTRY.delete(this);
    if (RIG.carOwner === this) { RIG.car.intensity = 0; RIG.carOwner = null; }
    this.group.traverse(o => { if (o.isMesh && o.geometry && !this._geos.includes(o.geometry)) o.geometry.dispose(); });
    this._geos.forEach(g => g.dispose());
    this.indTex.dispose(); this.indMat.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

// ============================================================ shared pieces
function callPlate(ctx, x, y, z, yaw, act) {   // brass hall-call plate with up/down keys (one action mesh); keys light when pressed
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const plate = new THREE.Mesh(ctx.geo('callPlate', () => new THREE.BoxGeometry(0.13, 0.28, 0.012)), M('brass'));
  plate.userData.action = act; plate.name = 'vrc-lift-call';
  const bg = ctx.geo('callBtn', () => { const c = new THREE.CylinderGeometry(0.027, 0.027, 0.01, 32); c.rotateX(Math.PI / 2); return c; });
  const rg = ctx.geo('callRing', () => new THREE.TorusGeometry(0.031, 0.0026, 8, 40));
  const keys = [];
  for (const dy of [0.052, -0.052]) {
    const b = new THREE.Mesh(bg, M('keyFace')); b.position.set(0, dy, 0.009); b.userData.dir = dy > 0 ? 1 : -1;
    const r = new THREE.Mesh(rg, M('keyRing')); r.position.set(0, dy, 0.0065);
    plate.add(b, r); keys.push([b, r]);
  }
  // engraved-look arrows (tiny dark triangles on the key faces)
  const tri = ctx.geo('callTri', () => { const s = new THREE.Shape(); s.moveTo(0, 0.011); s.lineTo(0.011, -0.008); s.lineTo(-0.011, -0.008); s.closePath(); return new THREE.ShapeGeometry(s); });
  for (const [b] of keys) { const t = new THREE.Mesh(tri, M('bronzeDark')); t.position.set(0, 0, 0.0052); if (b.userData.dir < 0) t.rotation.z = Math.PI; b.add(t); }
  plate.userData.light = (on, which) => {
    for (const [b, r] of keys) {
      const lit = on && (!which || which === b || which.parent === b || which === r);
      b.material = M(lit ? 'keyFaceLit' : 'keyFace'); r.material = M(lit ? 'keyRingLit' : 'keyRing');
    }
  };
  g.add(plate); ctx.root.add(g); return g;
}
function framedArt(ctx, x, y, z, yaw, w, h, k) {   // canvas in a slim bronze frame + picture light
  const b = new Batch(null);
  b.box('bronze', -w / 2 - 0.035, w / 2 + 0.035, -h / 2 - 0.035, h / 2 + 0.035, 0, 0.03);
  b.add('art' + (k % 3), new THREE.PlaneGeometry(w, h).translate(0, 0, 0.032));
  b.box('brass', -w * 0.3, w * 0.3, h / 2 + 0.07, h / 2 + 0.1, 0.02, 0.12);
  b.add('pool', new THREE.PlaneGeometry(w * 1.4, h * 0.9).translate(0, h * 0.22, 0.034));
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; b.flush(g); ctx.root.add(g); return g;
}
function consoleTable(B, x, z, yaw, len = 1.4) {   // walnut console on bronze legs with a sculptural vase
  const m = mat4(x, 0, z, yaw);
  const add = (mat, g) => B.add(mat, g, m);
  add('walnut', boxGeo(-len / 2, len / 2, 0.76, 0.8, -0.18, 0.18));
  for (const sx of [-1, 1]) add('bronze', boxGeo(sx * (len / 2 - 0.06) - 0.015, sx * (len / 2 - 0.06) + 0.015, 0, 0.76, -0.15, 0.15));
  add('bronze', boxGeo(-len / 2 + 0.06, len / 2 - 0.06, 0.1, 0.12, -0.02, 0.02));
  const vase = new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.12, 0.08], [0.1, 0.25], [0.05, 0.34], [0.045, 0.42], [0.06, 0.45]].map(([a, b]) => new THREE.Vector2(a, b)), 28);
  vase.translate(-len * 0.22, 0.8, 0); add('nero', vase);
  const bowl = new THREE.SphereGeometry(0.12, 24, 12, 0, TAU, Math.PI / 2, Math.PI / 2); bowl.scale(1, 0.45, 1); bowl.rotateX(Math.PI); bowl.translate(len * 0.22, 0.86, 0); add('brass', bowl);
}
function plant(B, x, z, s = 1) {   // tall planter with a sculpted olive-like crown
  const m = mat4(x, 0, z, 0, s, s, s);
  const pot = new THREE.CylinderGeometry(0.25, 0.19, 0.64, 32); pot.translate(0, 0.32, 0); B.add('pot', pot, m);
  B.add('brass', new THREE.TorusGeometry(0.25, 0.008, 6, 40).rotateX(Math.PI / 2).translate(0, 0.64, 0), m);
  const r = rng((x * 100 + z * 7) | 0);
  const trunk = new THREE.CylinderGeometry(0.018, 0.035, 1.25, 7); trunk.translate(0, 1.15, 0); B.add('bronzeDark', trunk, m);
  for (let b = 0; b < 6; b++) {
    const a = r() * TAU, cx = Math.cos(a) * (0.12 + r() * 0.2), cz = Math.sin(a) * (0.12 + r() * 0.2), cy = 1.45 + r() * 0.55;
    const br = new THREE.CylinderGeometry(0.006, 0.012, Math.hypot(cx, cy - 1.3, cz), 5); br.translate(0, Math.hypot(cx, cy - 1.3, cz) / 2, 0);
    br.rotateX(Math.PI / 2); br.lookAt(new THREE.Vector3(cx, cy - 1.3, cz)); B.add('bronzeDark', br.translate(0, 1.3, 0), m);
    for (let i = 0; i < 26; i++) {
      const lg = new THREE.PlaneGeometry(0.075, 0.022); lg.rotateY(r() * TAU); lg.rotateX((r() - 0.5) * 1.2);
      lg.translate(cx + (r() - 0.5) * 0.3, cy + (r() - 0.5) * 0.22, cz + (r() - 0.5) * 0.3); B.add(i % 3 ? 'leaf' : 'leaf2', lg, m);
    }
  }
}
function rbox(x0, x1, y0, y1, z0, z1, r = 0.05) { const g = new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 3, Math.min(r, (x1 - x0) / 2.1, (y1 - y0) / 2.1, (z1 - z0) / 2.1)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
function armchair(B, x, z, yaw, mat = 'velvet') {   // tub lounge chair: rounded shell, loose seat cushion, bronze sled base
  const m = mat4(x, 0, z, yaw);
  B.add(mat, rbox(-0.4, 0.4, 0.14, 0.44, -0.37, 0.37, 0.08), m);
  B.add(mat, rbox(-0.41, 0.41, 0.36, 0.8, -0.42, -0.24, 0.08), m);
  B.add(mat, rbox(-0.43, -0.29, 0.3, 0.64, -0.42, 0.36, 0.06), m); B.add(mat, rbox(0.29, 0.43, 0.3, 0.64, -0.42, 0.36, 0.06), m);
  B.add('velvetSand', rbox(-0.29, 0.29, 0.42, 0.53, -0.24, 0.34, 0.05), m);
  B.add('velvetSand', rbox(-0.26, 0.26, 0.5, 0.78, -0.25, -0.13, 0.06), m);
  for (const sx of [-1, 1]) { B.add('bronze', boxGeo(sx * 0.33 - 0.012, sx * 0.33 + 0.012, 0.0, 0.14, -0.34, 0.34), m); B.add('bronze', boxGeo(sx * 0.33 - 0.012, sx * 0.33 + 0.012, 0.0, 0.02, -0.36, 0.36), m); }
}
function roundTable(B, x, z, r = 0.42, h = 0.42) {
  const top = new THREE.CylinderGeometry(r, r, 0.04, 40); top.translate(x, h, z); B.add('nero', top);
  const base = new THREE.CylinderGeometry(0.05, r * 0.6, h - 0.02, 24); base.translate(x, (h - 0.02) / 2, z); B.add('bronze', base);
}
function chandelier(ctx, x, y, z, R = 0.9) {   // three bronze rings with glowing glass drops (instanced)
  const b = new Batch();
  const mats = [];
  [[R, y], [R * 0.72, y - 0.22], [R * 0.44, y - 0.42]].forEach(([r, yy], i) => {
    const t = new THREE.TorusGeometry(r, 0.012, 8, 72); t.rotateX(Math.PI / 2); t.translate(x, yy, z); b.add('brass', t);
    const n = Math.round(r * 44);
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU + i * 0.3; mats.push(mat4(x + Math.cos(a) * r, yy - 0.08 - (k % 3) * 0.06, z + Math.sin(a) * r, 0, 0.45, 0.8, 0.45)); }
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; b.add('brass', boxGeo(-0.004, 0.004, yy, y + 0.6, -0.004, 0.004).translate(x + Math.cos(a) * r, 0, z + Math.sin(a) * r)); }
  });
  b.add('bronze', new THREE.CylinderGeometry(0.12, 0.12, 0.04, 32).translate(x, ctx.H - 0.02, z));
  b.flush(ctx.root);
  instanced(ctx.root, ctx.geo('drop', () => new THREE.SphereGeometry(0.03, 10, 8)), 'bulb', mats);
}

// ============================================================ floor geometry helpers
// canonical unit-local → canonical building-local (commons works in the canonical frame, see the header)
function cLocal(u, uu, vv) { const f = u.cframe || u.frame; return [f.o[0] + f.U[0] * uu + f.V[0] * vv, f.o[1] + f.U[1] * uu + f.V[1] * vv]; }
const WING = () => CORRIDORS.find(c => c.id === 'wing');
function coreGap(bId, floor, ci) {   // free interval along x on the core side of the bar (between S2 units/blocks)
  const c = CORES[ci];
  const ivs = [];
  for (const u of unitsOn(bId, floor)) if (u.seg === 'S2') { const [a] = cLocal(u, 0, 0), [b] = cLocal(u, u.width, 0); ivs.push([Math.min(a, b), Math.max(a, b)]); }
  for (const bl of blocksOn(bId, floor)) if (bl.seg === 'S2') { const a = (bl.cframe || bl.frame).o[0], b = a - bl.width; ivs.push([Math.min(a, b), Math.max(a, b)]); }
  const mid = (c.liftDoors[0][0] + c.liftDoors[1][0]) / 2;
  let g0 = -1e9, g1 = 1e9;
  for (const [a, b] of ivs) { if (b <= mid + 0.01 && b > g0) g0 = b; if (a >= mid - 0.01 && a < g1) g1 = a; }
  if (g0 < -1e8) g0 = c.x0; if (g1 > 1e8) g1 = c.x1;
  g1 = Math.min(g1, WING().x0);
  return [Math.max(g0, c.x0 - 2.5), Math.min(g1, c.x1 + 2.5)];
}
function doorInfo(u) {   // canonical
  const f = u.cframe || u.frame, [x, z] = cLocal(u, (u.cdoor || u.door).u, 0);
  return { unitId: u.id, apNo: u.apNo, seg: u.seg, x, z, a: (u.seg === 'S1' || u.seg === 'S2') ? x : z, yaw: Math.atan2(f.V[0], f.V[1]), U: f.U, V: f.V };
}
// the doors as walk.js sees them: true building-local positions
const trueDoors = units => units.map(u => { const [x, z] = unitToLocal(u, u.door.u, 0); return { unitId: u.id, x, z, yaw: unitYaw(u) }; });
// Place a door leaf + number plate for a door on a wall run
function placeDoor(ctx, d, run, plateIdx) {
  const alongX = run.axis === 'x';
  const dd = -0.045;   // leaf centre depth (recessed in the reveal)
  const [x, z] = alongX ? [d.a, run.c + run.side * dd] : [run.c + run.side * dd, d.a];
  const yaw = alongX ? (run.side > 0 ? 0 : Math.PI) : (run.side > 0 ? Math.PI / 2 : -Math.PI / 2);
  // handle on the side toward increasing u (hinge at u-side lower); plate on the handle side
  const Ux = d.U[0], Uz = d.U[1];
  // local +x of the leaf in building frame:
  const lx = Math.cos(yaw), lz = -Math.sin(yaw);
  const hs = Math.sign(lx * Ux + lz * Uz) || 1;
  const leaf = doorLeaf(d.unitId, x, z, alongX, yaw, hs);
  ctx.root.add(leaf); ctx.leaves.push(leaf);
  // brass plate beside the door (handle side), 1.5 m high
  const pa = d.a + hs * (alongX ? lx : lz) * (DOOR_W / 2 + 0.2);
  const [px, pz] = alongX ? [pa, run.c + run.side * (FACE + SKIN + 0.004)] : [run.c + run.side * (FACE + SKIN + 0.004), pa];
  const g = new THREE.PlaneGeometry(0.17, 0.085);
  const [u0, v0, du, dv] = ctx.plates.uv(plateIdx); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  ctx.plateB.add(ctx.plateMat, g, mat4(px, 1.52, pz, yaw));
  ctx.B.add('brass', boxGeo(-0.093, 0.093, -0.05, 0.05, -0.006, 0), mat4(px, 1.52, pz, yaw));
  // door bell
  ctx.B.add('brass', new THREE.CylinderGeometry(0.018, 0.018, 0.01, 20).rotateX(Math.PI / 2), mat4(px, 1.3, pz, yaw));
}

function ceilingRect(ctx, r, alongX, H, trayW = 1.05) {
  const { B } = ctx; const t = trayW / 2, rise = 0.14;
  if (alongX) {
    const zc = (r.z0 + r.z1) / 2;
    B.box('plaster', r.x0, r.x1, H, H + 0.04, r.z0, zc - t); B.box('plaster', r.x0, r.x1, H, H + 0.04, zc + t, r.z1);
    const g = new THREE.PlaneGeometry(r.x1 - r.x0 - 0.2, trayW); g.rotateX(Math.PI / 2); g.translate((r.x0 + r.x1) / 2, H + rise, zc);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 20, uv.getY(i));
    B.add('tray', g);
    B.box('plaster', r.x0, r.x1, H, H + rise, zc - t - 0.03, zc - t); B.box('plaster', r.x0, r.x1, H, H + rise, zc + t, zc + t + 0.03);
    B.box('plaster', r.x0, r.x0 + 0.1, H, H + rise, zc - t, zc + t); B.box('plaster', r.x1 - 0.1, r.x1, H, H + rise, zc - t, zc + t);
  } else {
    const xc = (r.x0 + r.x1) / 2;
    B.box('plaster', r.x0, xc - t, H, H + 0.04, r.z0, r.z1); B.box('plaster', xc + t, r.x1, H, H + 0.04, r.z0, r.z1);
    const g = new THREE.PlaneGeometry(trayW, r.z1 - r.z0 - 0.2); g.rotateX(Math.PI / 2); g.rotateY(0); g.translate(xc, H + rise, (r.z0 + r.z1) / 2);
    // gradient across x: swap uv axes
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const a = uv.getX(i), b2 = uv.getY(i); uv.setXY(i, b2 * 20, a); }
    B.add('tray', g);
    B.box('plaster', xc - t - 0.03, xc - t, H, H + rise, r.z0, r.z1); B.box('plaster', xc + t, xc + t + 0.03, H, H + rise, r.z0, r.z1);
    B.box('plaster', xc - t, xc + t, H, H + rise, r.z0, r.z0 + 0.1); B.box('plaster', xc - t, xc + t, H, H + rise, r.z1 - 0.1, r.z1);
  }
}
function runner(ctx, x0, x1, z0, z1, alongX) {
  const L = alongX ? x1 - x0 : z1 - z0, W = alongX ? z1 - z0 : x1 - x0;
  const g = new THREE.PlaneGeometry(alongX ? L : W, alongX ? W : L); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0.006, (z0 + z1) / 2);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const u = alongX ? (p.getX(i) - x0) / 2.6 : (p.getZ(i) - z0) / 2.6;
    const v = alongX ? (p.getZ(i) - z0) / W : (p.getX(i) - x0) / W;
    uv.setXY(i, u, v);
  }
  ctx.B.add('carpet', g);
  // bronze edge strips
  if (alongX) { ctx.B.box('bronzeDark', x0, x1, 0, 0.009, z0 - 0.02, z0); ctx.B.box('bronzeDark', x0, x1, 0, 0.009, z1, z1 + 0.02); }
  else { ctx.B.box('bronzeDark', x0 - 0.02, x0, 0, 0.009, z0, z1); ctx.B.box('bronzeDark', x1, x1 + 0.02, 0, 0.009, z0, z1); }
}
function downlights(ctx, pts) {
  const m = pts.map(([x, z]) => mat4(x, ctx.H - 0.001, z));
  instanced(ctx.root, ctx.geo('dl', () => new THREE.CylinderGeometry(0.035, 0.035, 0.004, 20)), 'bulb', m);
  instanced(ctx.root, ctx.geo('dlr', () => new THREE.TorusGeometry(0.045, 0.008, 6, 24).rotateX(Math.PI / 2)), 'bronze', m.map(q => q.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.004, 0))));
}
function floorPools(ctx, pts, s = 1.5, mat = 'pool') {
  const g = ctx.geo('poolG', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  instanced(ctx.root, g, mat, pts.map(([x, z, k]) => mat4(x, 0.012, z, 0, (k || 1) * s, 1, (k || 1) * s)));
}

// ============================================================ stairs (typical floors)
function stairHall(ctx, hx0, hx1, zFront, zBack, rise, riseBelow, eastOpen) {
  const { B, C } = ctx;
  const W = 1.2, gapW = 0.12;
  const xm = (hx0 + hx1) / 2;
  const rowA = [xm - gapW / 2 - W, xm - gapW / 2], rowB = [xm + gapW / 2, xm + gapW / 2 + W];
  const nR = 9, tread = 0.28, run = (nR - 1) * tread;
  const zs = zFront - 1.35, ze = zs - run;     // flights start 1.35 m behind the hall front
  const flight = (xr, yStart, yEnd, zA, zB) => {  // from zA (yStart) to zB (yEnd), inclusive landings not included
    const n = nR, dy = (yEnd - yStart) / n, dz = (zB - zA) / (n - 1);
    for (let i = 0; i < n; i++) {
      const y = yStart + dy * (i + 1), z0 = zA + dz * (i - 0.5), z1 = zA + dz * (i + 0.5);
      if (i === n - 1) continue;
      B.box('stone', xr[0], xr[1], y - 0.04, y, Math.min(z0, z1) - 0.01, Math.max(z0, z1) + 0.01);
      B.box('stone', xr[0], xr[1], Math.min(y, y - dy) - 0.04, Math.max(y, y - dy), Math.min(z0, z1) - 0.01, Math.min(z0, z1) + 0.01);
    }
    // sloped soffit (stringer slab)
    const len = Math.hypot(zB - zA, yEnd - yStart), ang = -Math.atan((yEnd - yStart) / (zB - zA));
    const g = new THREE.BoxGeometry(xr[1] - xr[0], 0.16, len); g.rotateX(ang); g.translate((xr[0] + xr[1]) / 2, (yStart + yEnd) / 2 - 0.16, (zA + zB) / 2);
    B.add('plaster', g);
    // bronze stringer on the open side
    const s2 = new THREE.BoxGeometry(0.03, 0.26, len); s2.rotateX(ang); s2.translate(xr[0] - 0.015, (yStart + yEnd) / 2 - 0.02, (zA + zB) / 2);
    B.add('bronzeDark', s2);
    // handrail
    const hr = new THREE.CylinderGeometry(0.022, 0.022, len, 12); hr.rotateX(Math.PI / 2 + ang); hr.translate(xr[1] - 0.06, (yStart + yEnd) / 2 + 0.9, (zA + zB) / 2);
    B.add('brass', hr);
  };
  // up flight (row A, front → back), upper flight (row B, back → front), lower flight (row B from below)
  flight(rowA, 0, rise / 2, zs, ze);
  flight(rowB, rise / 2, rise, ze, zs);
  flight(rowB, -riseBelow / 2, 0, ze, zs);
  flight(rowA, rise, rise * 1.5, zs, ze);
  // mid landings (back) + landing plates
  for (const y of [rise / 2, -riseBelow / 2, rise * 1.5]) B.box('stone', rowA[0], rowB[1], y - 0.2, y, ze - 0.02, zBack);
  B.box('stone', hx0, hx1, rise - 0.3, rise, zFront, zs + 0.01);                // next floor's landing (ceiling above ours)
  B.box('plaster', hx0, hx1, rise - 0.31, rise - 0.3, zFront, zs);
  // floor at this level: front strip only
  B.box('stone', hx0, hx1, -0.3, 0, zs, zFront);
  C.rect(hx0, hx1, zs, zFront, 0);
  // side floors beside the flights (+ the plates above them), guarded toward the stair well
  for (const [a, b2] of [[hx0, rowA[0]], [rowB[1], hx1]]) if (b2 - a > 0.05) {
    B.box('stone', a, b2, -0.3, 0, zBack, zs); C.rect(a, b2, zBack, zs, 0);
    B.box('stone', a, b2, rise - 0.3, rise, zBack, zs); B.box('plaster', a, b2, rise - 0.31, rise - 0.3, zBack, zs);
    const gx = a === hx0 ? b2 : a, sg = a === hx0 ? -1 : 1;
    B.box('glass', gx + sg * 0.03, gx + sg * 0.045, 0, 1.0, zBack, zs); B.box('brass', gx + sg * 0.02, gx + sg * 0.055, 1.0, 1.04, zBack, zs);
    C.box(gx + sg * 0.06, gx, 0, 1.1, zBack, zs);
  }
  // scissor wall between the rows
  B.box('plasterW', rowA[1], rowB[0], -1.7, rise * 1.5 + 0.9, ze, zs + 0.1);
  // glass guard where row B drops away from the landing, with brass rail
  B.box('glass', rowB[0], rowB[1], 0, 1.0, zs + 0.03, zs + 0.045); B.box('brass', rowB[0], rowB[1], 1.0, 1.04, zs + 0.02, zs + 0.055);
  C.box(rowB[0], rowB[1], 0, 1.1, zs, zs + 0.06);
  C.box(rowA[0], rowA[1], 0, 1.8, zs - 0.4, zs);   // don't climb (upper floors aren't loaded)
  // shaft enclosure (-1.7 … rise*1.5+0.9) and caps
  const yb = -1.7, yt = rise * 1.5 + 0.9;
  B.box('plasterW', hx0 - 0.12, hx0, yb, yt, zBack - 0.12, zFront);
  const eSegs = eastOpen ? [[zBack - 0.12, eastOpen[0]], [eastOpen[1], zFront]] : [[zBack - 0.12, zFront]];
  for (const [a, b2] of eSegs) { B.box('plasterW', hx1, hx1 + 0.12, yb, yt, a, b2); C.box(hx1, hx1 + 0.12, 0, 2.6, a, b2); }
  if (eastOpen) { B.box('plasterW', hx1, hx1 + 0.12, 2.35, yt, eastOpen[0], eastOpen[1]); B.box('plasterW', hx1, hx1 + 0.12, yb, 0, eastOpen[0], eastOpen[1]); }
  B.box('plasterW', hx0, hx1, yb, yt, zBack - 0.12, zBack);
  B.box('plasterW', hx0, hx1, yb - 0.05, yb, zBack, zFront); B.box('plasterW', hx0, hx1, yt, yt + 0.05, zBack, zFront);
  C.box(hx0 - 0.12, hx0, 0, 2.6, zBack, zFront); C.box(hx0, hx1, 0, 2.6, zBack - 0.12, zBack);
  // wall sconces
  for (const y of [1.9, rise + 1.9]) for (const x of [hx0 + 0.02, hx1 - 0.02]) B.box('ledDim', x - 0.012, x + 0.012, y, y + 0.3, zFront - 0.7, zFront - 0.62);
  // stair pictogram above the entrance
  return { rowA, rowB, zs, ze };
}
function signPlane(ctx, idx, x, y, z, yaw, w = 0.26, h = 0.26) {
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (idx + uv.getX(i)) / 8, uv.getY(i));
  ctx.signB.add('signs', g, mat4(x, y, z, yaw));
}

// ============================================================ context
function makeCtx(bId, floor, H, mirrorable = true) {
  const group = new THREE.Group(); group.name = `vrc-commons-${bId}-${floor}`;
  const root = new THREE.Group(); root.position.y = floorY(floor); group.add(root);
  const geos = new Map();
  MZ = mirrorable && isMirrored(bId) ? 0 : null;   // reflect about the bar axis (building-local z = 0)
  return {
    bId, floor, H, group, root, mz: MZ, B: new Batch(), C: new Colliders(), signB: new Batch(MZ, true), leaves: [], lifts: [], doors: [], ownTex: [],
    geo(key, make) { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); },
    _geos: geos,
  };
}
function finish(ctx, spawn) {
  if (ctx.mz != null) {   // reflect the individually placed objects, the sliding doors and the spawn point
    for (const o of [...ctx.root.children]) if (!BAKED.has(o) && !NOMIRROR.has(o) && o !== RIG.group) mirrorObj(o, ctx.mz);
    for (const d of ctx.autoDoors || []) d.z = 2 * ctx.mz - d.z;
    if (spawn) spawn = { ...spawn, z: 2 * ctx.mz - spawn.z, yaw: Math.PI - (spawn.yaw || 0) };
  }
  ctx.B.flush(ctx.root); ctx.C.flush(ctx.root); ctx.signB.flush(ctx.root);
  if (ctx.plateB) ctx.plateB.flush(ctx.root);
  MZ = null;
  for (const L of ctx.lifts) ctx.group.add(L.group);
  ctx.group.updateMatrixWorld(true);
  const { group, lifts, doors } = ctx;
  let disposed = false;
  return {
    group, lifts, spawn, doors, bId: ctx.bId, floor: ctx.floor, autoDoors: ctx.autoDoors || [], parkedCars: ctx.parkedCars || [], carInstances: ctx.carInstances || null,
    dispose() {
      if (disposed) return; disposed = true;
      if (RIG.group && RIG.group.parent === ctx.root) { ctx.root.remove(RIG.group); }
      for (const L of lifts) L.dispose();
      for (const L of ctx.decor || []) L.dispose();
      if (ctx.carInstances) ctx.carInstances.dispose();   // shared car geometry stays cached in cars.js
      const keep = new Set(Object.values(_leafGeo));
      group.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.geometry && !keep.has(o.geometry)) o.geometry.dispose(); });
      for (const g of ctx._geos.values()) g.dispose();
      for (const t of ctx.ownTex) t.dispose();
      if (ctx.plateMat) ctx.plateMat.dispose();
      if (group.parent) group.parent.remove(group);
    },
  };
}
function setupPlates(ctx, labels) {
  ctx.plates = plateAtlas(labels); ctx.ownTex.push(ctx.plates.tex);
  ctx.plateMat = new THREE.MeshStandardMaterial({ map: ctx.plates.tex, metalness: 0.9, roughness: 0.3 });
  ctx.plateB = new Batch(ctx.mz, true);
}

// ============================================================ typical floor (1..10)
function buildTypical(bId, floor) {
  const H = 2.6;
  const ctx = makeCtx(bId, floor, H);
  const { B, C, root } = ctx;
  const units = unitsOn(bId, floor), doors = units.map(doorInfo);
  ctx.doors = trueDoors(units);
  setupPlates(ctx, [...doors.map(d => String(d.apNo)), String(floor)]);
  const bar = CORRIDORS.find(c => c.id === 'bar'), wing = CORRIDORS.find(c => c.id === 'wing'), WX0 = wing.x0;
  const s1 = doors.filter(d => d.seg === 'S1'), s2 = doors.filter(d => d.seg === 'S2'), s4 = doors.filter(d => d.seg === 'S4'), s5 = doors.filter(d => d.seg === 'S5'), s6 = doors.filter(d => d.seg === 'S6');
  // bar corridor (runs on to the wing's far wall), the wing stub beside core 2 (−z) and the wing arm (+z)
  const A = { x0: bar.x0, x1: wing.x1, z0: bar.z0, z1: bar.z1 };
  const Wn = { x0: wing.x0, x1: wing.x1, z0: wing.z0, z1: bar.z0 }, Wp = { x0: wing.x0, x1: wing.x1, z0: bar.z1, z1: wing.z1 };
  // floors
  for (const r of [A, Wn, Wp]) { B.box('stone', r.x0, r.x1, -0.3, 0, r.z0, r.z1); C.rect(r.x0, r.x1, r.z0, r.z1, 0); }
  runner(ctx, A.x0 + 0.5, A.x1 - 0.45, -0.6, 0.6, true);
  runner(ctx, Wn.x0 + 0.5, Wn.x1 - 0.5, Wn.z0 + 0.5, -0.6, false);
  runner(ctx, Wp.x0 + 0.5, Wp.x1 - 0.5, 0.6, Wp.z1 - 0.5, false);
  ceilingRect(ctx, A, true, H); ceilingRect(ctx, Wn, false, H); ceilingRect(ctx, Wp, false, H);
  const doorOp = ds => ds.map(d => ({ c: d.a, w: DOOR_W, h: DOOR_H, kind: 'door' }));
  const portals = ds => ds.map(d => ({ a0: d.a - 0.95, a1: d.a + 0.95, mat: 'walnut' }));
  // cores: lifts, marble lobby cladding, stair halls
  const nOps = [...doorOp(s2)], nZones = [...portals(s2)], wOps = [...doorOp(s6)], wZones = [...portals(s6)];
  const featureSpots = [];
  CORES.forEach((c, ci) => {
    const [L0, L1] = [c.liftDoors[0][0], c.liftDoors[1][0]];
    for (const L of [L0, L1]) nOps.push({ c: L, w: LIFT_W, h: LIFT_H, kind: 'lift' });
    const [g0, g1] = coreGap(bId, floor, ci);
    nZones.push({ a0: Math.max(g0, L0 - 1.7), a1: Math.min(g1, L1 + 1.7), mat: 'marble' });
    // hall-call plate + floor numeral between the lifts
    const xm = (L0 + L1) / 2;
    callPlate(ctx, xm, 1.12, -1.1 + FACE + SKIN + 0.006, 0, { type: 'liftCall', building: bId, stair: c.stair });
    const fg = new THREE.PlaneGeometry(0.26, 0.13); const uv = fg.attributes.uv; const cell = doors.length;   // numeral plate in the atlas
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ...(() => { const [u0, v0, du, dv] = ctx.plates.uv(cell); return [u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv]; })());
    ctx.plateB.add(ctx.plateMat, fg, mat4(xm, 1.75, -1.1 + FACE + SKIN + 0.004, 0));
    // lifts
    c.liftDoors.forEach((_, di) => ctx.lifts.push(new Lift(bId, ci, di, floor)));
    // stair hall behind the lifts
    const zFront = -3.62, zBack = -8.38, shaft0 = L0 - POCKET - 0.1, shaft1 = L1 + POCKET + 0.1;
    let hx0 = g0 + 0.14, hx1 = g1 - 0.14;
    if (c.stair === 2) { hx0 = Math.max(hx0, c.x0 + 0.14); hx1 = WX0 - 0.3; }
    const rise = floorY(floor + 1) - floorY(floor), below = floorY(floor) - floorY(floor - 1);
    stairHall(ctx, hx0, hx1, zFront, zBack, rise, below, c.stair === 2 ? [-6.625, -5.375] : null);
    if (c.stair === 2) { B.box('stone', hx1, WX0, -0.3, 0, -6.625, -5.375); C.rect(hx1, WX0, -6.625, -5.375, 0); B.box('plaster', hx1, WX0 - 0.1, 2.35, 2.4, -6.625, -5.375); }
    // closing walls between shafts and around the hall front
    B.box('plasterW', shaft0, shaft1, -0.3, H + 0.3, zFront, zFront + 0.12);   // hall front behind the lift shafts
    B.box('plasterW', L0 + POCKET + 0.1, L1 - POCKET - 0.1, 0, H, -1.1 - WALL_T, zFront);
    if (c.stair !== 2) {
      const left = shaft0 - hx0, right = hx1 - shaft1;
      const useLeft = left >= right, w = Math.min((useLeft ? left : right) - 0.05, 1.35);
      if (w >= 0.9) {
        const p0 = useLeft ? shaft0 - w : shaft1, p1 = p0 + w;
        nOps.push({ c: (p0 + p1) / 2, w: p1 - p0, h: 2.35, kind: 'pass' });
        // passage: floor, ceiling, side walls
        B.box('stone', p0, p1, -0.3, 0, zFront, -1.1); C.rect(p0, p1, zFront, -1.1, 0);
        B.box('plaster', p0, p1, 2.45, 2.5, zFront, -1.1);
        B.box('plasterW', p0 - 0.1, p0, 0, 2.5, zFront, -1.1); B.box('plasterW', p1, p1 + 0.1, 0, 2.5, zFront, -1.1);
        B.box('fabric', p0, p0 + SKIN, 0.1, 2.45, zFront, -1.25); B.box('fabric', p1 - SKIN, p1, 0.1, 2.45, zFront, -1.25);
        B.box('bronzeDark', p0, p0 + 0.026, 0, 0.1, zFront, -1.25); B.box('bronzeDark', p1 - 0.026, p1, 0, 0.1, zFront, -1.25);
        B.box('ledDim', (p0 + p1) / 2 - 0.3, (p0 + p1) / 2 + 0.3, 2.44, 2.45, (zFront - 1.1) / 2 - 0.3, (zFront - 1.1) / 2 + 0.3);
        C.box(p0 - 0.1, p0, 0, 2.5, zFront, -1.1); C.box(p1, p1 + 0.1, 0, 2.5, zFront, -1.1);
        // fill the hall-front wall except the passage
        signPlane(ctx, 0, (p0 + p1) / 2, 2.5, -1.1 + FACE + SKIN + 0.02, 0, 0.2, 0.2);
        const segs = [[hx0 - 0.1, p0], [p1, hx1 + 0.1]];
        for (const [a, b2] of segs) if (b2 - a > 0.01) { B.box('plasterW', a, b2, 0, rise, zFront, zFront + 0.12); C.box(a, b2, 0, 2.6, zFront, zFront + 0.12); }
        // side fill between the corridor wall and the hall (closed service zone)
        B.box('plasterW', hx0 - 0.1, useLeft ? p0 - 0.1 : shaft0, 0, H, -1.2, zFront + 0.12);
        B.box('plasterW', useLeft ? shaft1 : p1 + 0.1, hx1 + 0.1, 0, H, -1.2, zFront + 0.12);
      } else B.box('plasterW', hx0 - 0.1, hx1 + 0.1, 0, rise, zFront, zFront + 0.12);
    } else {
      B.box('plasterW', hx0 - 0.1, hx1 + 0.02, 0, rise, zFront, zFront + 0.12); C.box(hx0 - 0.1, hx1, 0, 2.6, zFront, zFront + 0.12);
      wOps.push({ c: -6.0, w: 1.25, h: 2.35, kind: 'pass' });
      signPlane(ctx, 0, WX0 + FACE + SKIN + 0.02, 2.5, -6.0, Math.PI / 2, 0.2, 0.2);
    }
    featureSpots.push({ a: xm, zone: [g0, g1] });
  });
  // wall runs
  const sOps = doorOp(s1), sZones = portals(s1);
  // art niches opposite each lift lobby (on the S1 wall) where no door is within reach
  for (const f of featureSpots) {
    if (f.a > WX0 - 1.5 || s1.some(d => Math.abs(d.a - f.a) < 1.55)) continue;
    sZones.push({ a0: f.a - 1.2, a1: f.a + 1.2, mat: 'walnut' });
    framedArt(ctx, f.a, 1.62, 1.1 - FACE - SKIN - 0.002, Math.PI, 0.8, 1.0, Math.round(f.a) % 3);
    consoleTable(B, f.a, 1.1 - 0.22, Math.PI, 1.3);
    C.box(f.a - 0.65, f.a + 0.65, 0, 0.8, 1.1 - 0.4, 1.1);
  }
  const sc = (a0, a1, step = 2.6) => { const out = []; for (let a = a0 + 1.4; a < a1 - 1; a += step) out.push(a); return out; };
  wallRun(ctx, { axis: 'x', c: 1.1, side: -1, a0: A.x0, a1: WX0, openings: sOps, zones: sZones, scallops: sc(A.x0, WX0) });
  wallRun(ctx, { axis: 'x', c: -1.1, side: 1, a0: A.x0, a1: WX0, openings: nOps, zones: nZones, scallops: sc(A.x0, WX0) });
  wallRun(ctx, { axis: 'z', c: WX0, side: 1, a0: wing.z0, a1: -1.1, openings: wOps, zones: wZones, scallops: sc(wing.z0, -1.1) });
  wallRun(ctx, { axis: 'z', c: WX0, side: 1, a0: 1.1, a1: wing.z1, openings: doorOp(s4), zones: portals(s4), scallops: sc(1.1, wing.z1) });
  wallRun(ctx, { axis: 'z', c: wing.x1, side: -1, a0: wing.z0, a1: wing.z1, openings: doorOp(s5), zones: portals(s5), scallops: sc(wing.z0, wing.z1) });
  // ends: SSW window + bench; the wing stub's street window; the wing arm ends at the other block (solid)
  endWindow(ctx, 'x', A.x0, 1, -1.1, 1.1);
  endWindow(ctx, 'z', wing.z0, 1, wing.x0, wing.x1);
  wallRun(ctx, { axis: 'x', c: wing.z1, side: -1, a0: wing.x0, a1: wing.x1, finish: 'walnut' });
  // doors + plates
  let pi = 0;
  const runs = { S1: { axis: 'x', c: 1.1, side: -1 }, S2: { axis: 'x', c: -1.1, side: 1 }, S4: { axis: 'z', c: WX0, side: 1 }, S5: { axis: 'z', c: wing.x1, side: -1 }, S6: { axis: 'z', c: WX0, side: 1 } };
  for (const d of doors) placeDoor(ctx, d, runs[d.seg], pi++);
  // downlights over every door + along the corridor, and soft pools on the floor
  const dl = [];
  for (const d of [...s1, ...s2]) dl.push([d.a, d.seg === 'S1' ? 0.78 : -0.78]);
  for (const d of [...s4, ...s5, ...s6]) dl.push([d.seg === 'S5' ? wing.x1 - 0.33 : wing.x0 + 0.33, d.a]);
  for (const c of CORES) for (const [x] of c.liftDoors) dl.push([x, -0.78]);
  downlights(ctx, dl);
  floorPools(ctx, dl.map(([x, z]) => [x, Math.abs(z) < 1.2 ? z * 0.7 : z]), 1.9);
  // light rig: the three lift lobbies + wing arm
  const Y = 2.3;
  claimRig(root, [[(CORES[0].liftDoors[0][0] + CORES[0].liftDoors[1][0]) / 2, Y, 0.2, 7], [(CORES[1].liftDoors[0][0] + CORES[1].liftDoors[1][0]) / 2, Y, 0.2, 7],
    [(CORES[2].liftDoors[0][0] + CORES[2].liftDoors[1][0]) / 2, Y, 0.2, 7], [(wing.x0 + wing.x1) / 2, Y, (1.1 + wing.z1) / 2, 6, 0xffd4a0, 16]], 0.18);
  const sp = CORES[0]; const sx = (sp.liftDoors[0][0] + sp.liftDoors[1][0]) / 2;
  return finish(ctx, { x: sx + 2.6, z: 0.35, yaw: Math.PI / 2 + 0.35 });
}
function endWindow(ctx, axis, c, side, a0, a1, H = ctx.H) {   // tall window with bronze frame at a corridor end
  const { B, C } = ctx;
  const P = (a, d) => axis === 'x' ? [c + side * d, a] : [a, c + side * d];
  const bx = (mat, aa0, aa1, y0, y1, d0, d1) => { const [x0, z0] = P(aa0, d0), [x1, z1] = P(aa1, d1); B.box(mat, x0, x1, y0, y1, z0, z1); };
  const m = (a0 + a1) / 2, hw = Math.min(0.75, (a1 - a0) / 2 - 0.2);
  bx('plaster', a0, m - hw, 0, H, -0.3, FACE); bx('plaster', m + hw, a1, 0, H, -0.3, FACE);
  bx('plaster', m - hw, m + hw, 0, 0.45, -0.3, FACE); bx('plaster', m - hw, m + hw, H - 0.1, H, -0.3, FACE);
  bx('walnut', a0, m - hw, 0.1, H, FACE, FACE + SKIN); bx('walnut', m + hw, a1, 0.1, H, FACE, FACE + SKIN);
  bx('glass', m - hw, m + hw, 0.45, H - 0.1, -0.2, -0.19);
  bx('bronze', m - hw - 0.05, m - hw, 0.4, H - 0.05, -0.25, FACE + 0.03); bx('bronze', m + hw, m + hw + 0.05, 0.4, H - 0.05, -0.25, FACE + 0.03);
  bx('bronze', m - hw, m + hw, 0.4, 0.45, -0.25, FACE + 0.06); bx('bronze', m - hw, m + hw, H - 0.1, H - 0.05, -0.25, FACE + 0.03);
  bx('bronze', m - 0.015, m + 0.015, 0.45, H - 0.1, -0.21, -0.17);
  const [x0, z0] = P(a0, -0.3), [x1, z1] = P(a1, FACE + 0.03); C.box(x0, x1, 0, H, z0, z1);
  // upholstered bench under the window
  const [bxa, bza] = P(m - 0.7, 0.2), [bxb, bzb] = P(m + 0.7, 0.62);
  B.box('velvetSand', bxa, bxb, 0.28, 0.46, bza, bzb); B.box('bronze', bxa, bxb, 0.08, 0.28, bza + (axis === 'x' ? 0 : 0.03 * side), bzb - (axis === 'x' ? 0 : 0.03 * side));
  C.box(bxa, bxb, 0, 0.5, bza, bzb);
}

// ============================================================ ground floor (0)
function buildGround(bId) {
  const floor = 0, H = 3.0;
  const ctx = makeCtx(bId, floor, H);
  const { B, C, root } = ctx;
  root.position.y += 0.01;   // stay clear of the site-plan ground plane (y = 0) that runs under the footprints
  const units = unitsOn(bId, floor), doors = units.map(doorInfo);
  ctx.doors = trueDoors(units);
  setupPlates(ctx, doors.map(d => String(d.apNo)));
  const bar = CORRIDORS.find(c => c.id === 'bar'), wing = CORRIDORS.find(c => c.id === 'wing'), WX0 = wing.x0;
  const s1 = doors.filter(d => d.seg === 'S1'), s4 = doors.filter(d => d.seg === 'S4'), s5 = doors.filter(d => d.seg === 'S5'), s6 = doors.filter(d => d.seg === 'S6');
  const A = { x0: bar.x0, x1: wing.x1, z0: bar.z0, z1: bar.z1 };
  const Wn = { x0: wing.x0, x1: wing.x1, z0: wing.z0, z1: bar.z0 }, Wp = { x0: wing.x0, x1: wing.x1, z0: bar.z1, z1: wing.z1 };
  for (const r of [A, Wn, Wp]) { B.box('marbleFloor', r.x0, r.x1, -0.3, 0, r.z0, r.z1); C.rect(r.x0, r.x1, r.z0, r.z1, 0); }
  // nero border inlay along the spine
  for (const z of [-0.62, 0.6]) B.box('nero', A.x0 + 0.4, A.x1 - 0.4, 0, 0.004, z, z + 0.02);
  ceilingRect(ctx, A, true, H, 1.2); ceilingRect(ctx, Wn, false, H, 1.0); ceilingRect(ctx, Wp, false, H, 1.0);
  const doorOp = ds => ds.map(d => ({ c: d.a, w: DOOR_W, h: DOOR_H, kind: 'door' }));
  const portals = ds => ds.map(d => ({ a0: d.a - 0.95, a1: d.a + 0.95, mat: 'walnut' }));
  const nOps = [], nZones = [];
  const blk = blocksOn(bId, 0), cf = b => b.cframe || b.frame;
  const amen = blk.find(b => b.seg === 'S1' && (b.kind === 'amenity' || b.kind === 'kindergarten'));
  // lobbies
  CORES.forEach((c, ci) => {
    const [L0, L1] = [c.liftDoors[0][0], c.liftDoors[1][0]];
    const sh0 = L0 - POCKET - 0.1, sh1 = L1 + POCKET + 0.1;
    for (const L of [L0, L1]) nOps.push({ c: L, w: LIFT_W, h: LIFT_H, kind: 'lift' });
    nZones.push({ a0: c.x0, a1: c.x1, mat: 'marble' });
    // side passages from the spine into the lobby
    const pL = [c.x0 + 0.02, sh0], pR = [sh1, Math.min(c.x1, WX0) >= WX0 - 0.01 ? WX0 - 0.18 : c.x1 - 0.02];
    for (const [p0, p1] of [pL, pR]) if (p1 - p0 > 0.7) nOps.push({ c: (p0 + p1) / 2, w: p1 - p0, h: 2.6, kind: 'pass' });
    callPlate(ctx, (L0 + L1) / 2, 1.12, -1.1 + FACE + SKIN + 0.006, 0, { type: 'liftCall', building: bId, stair: c.stair });
    c.liftDoors.forEach((_, di) => ctx.lifts.push(new Lift(bId, ci, di, 0, { rear: true })));
    buildLobby(ctx, c, ci, L0, L1, sh0, sh1, pL, pR);
  });
  // spine walls
  const sOps = doorOp(s1), sZones = portals(s1);
  if (amen) {
    const a0 = cf(amen).o[0], a1 = Math.min(a0 + amen.width, WX0);
    sOps.push({ c: (a0 + a1) / 2, w: a1 - a0 - 0.3, h: H, kind: 'pass', noTrim: true });
    storefront(ctx, a0 + 0.15, a1 - 0.15, amen.kind);
  }
  const sc = (a0, a1, step = 2.8) => { const out = []; for (let a = a0 + 1.4; a < a1 - 1; a += step) out.push(a); return out; };
  wallRun(ctx, { axis: 'x', c: 1.1, side: -1, a0: A.x0, a1: WX0, openings: sOps, zones: sZones, scallops: sc(amen ? cf(amen).o[0] + amen.width : A.x0, WX0) });
  // car-park / storage side of the spine: walnut rhythm and art between the lobbies (and on the S1 car-park stretch)
  for (const b of blk.filter(b => b.seg === 'S2')) {
    const x1 = cf(b).o[0], x0 = x1 - b.width;
    for (let x = x0 + 2.2; x < x1 - 2; x += 4.4) { nZones.push({ a0: x - 1.1, a1: x + 1.1, mat: 'walnut' }); framedArt(ctx, x, 1.6, -1.1 + FACE + SKIN + 0.002, 0, 0.9, 1.15, Math.round(x)); }
  }
  wallRun(ctx, { axis: 'x', c: -1.1, side: 1, a0: A.x0, a1: WX0, openings: nOps, zones: nZones, scallops: sc(A.x0, WX0) });
  wallRun(ctx, { axis: 'z', c: WX0, side: 1, a0: wing.z0, a1: -1.1, openings: doorOp(s6), zones: portals(s6), scallops: sc(wing.z0, -1.1) });
  wallRun(ctx, { axis: 'z', c: WX0, side: 1, a0: 1.1, a1: wing.z1, openings: doorOp(s4), zones: portals(s4), scallops: sc(1.1, wing.z1) });
  wallRun(ctx, { axis: 'z', c: wing.x1, side: -1, a0: wing.z0, a1: wing.z1, openings: doorOp(s5), zones: portals(s5), scallops: sc(wing.z0, wing.z1) });
  endWindow(ctx, 'x', A.x0, 1, -1.1, 1.1);
  endWindow(ctx, 'z', wing.z0, 1, wing.x0, wing.x1);
  wallRun(ctx, { axis: 'x', c: wing.z1, side: -1, a0: wing.x0, a1: wing.x1, finish: 'walnut' });
  // art on the closed stretch of the wing arm's west wall (the corner stair cell) where no door is near
  for (const z of [3.2, 6.4]) if (!s4.some(d => Math.abs(d.a - z) < 1.6)) framedArt(ctx, WX0 + FACE + SKIN + 0.002, 1.6, z, Math.PI / 2, 0.9, 1.15, Math.round(z * 3));
  let pi = 0;
  const runs = { S1: { axis: 'x', c: 1.1, side: -1 }, S4: { axis: 'z', c: WX0, side: 1 }, S5: { axis: 'z', c: wing.x1, side: -1 }, S6: { axis: 'z', c: WX0, side: 1 } };
  for (const d of doors) placeDoor(ctx, d, runs[d.seg], pi++);
  const dl = [];
  for (const d of s1) dl.push([d.a, 0.8]);
  for (const d of [...s4, ...s5, ...s6]) dl.push([d.seg === 'S5' ? wing.x1 - 0.33 : wing.x0 + 0.33, d.a]);
  for (let x = 3; x < A.x1 - 1; x += 3.2) dl.push([x, -0.8]);
  downlights(ctx, dl);
  floorPools(ctx, dl.map(([x, z]) => [x, Math.abs(z) < 1.2 ? z * 0.7 : z]), 2.0);
  const cx = c => (c.liftDoors[0][0] + c.liftDoors[1][0]) / 2;
  claimRig(root, [[cx(CORES[0]), 2.6, -6, 4.5], [cx(CORES[1]), 2.6, -6, 4.5], [cx(CORES[2]), 2.6, CORES[2].zOut + 5, 5], [cx(CORES[2]), 2.6, 0, 4]], 0.15);
  return finish(ctx, { x: cx(CORES[2]), z: CORES[2].zOut + 0.8, yaw: Math.PI });
}
function storefront(ctx, a0, a1, kind) {   // glazed amenity / kindergarten front along the spine (S1 side)
  const { B, C } = ctx; const z = 1.1, H = ctx.H;
  B.box('frosted', a0, a1, 0.1, H - 0.2, z + 0.02, z + 0.04);
  B.box('bronzeDark', a0, a1, 0, 0.1, z - 0.01, z + 0.06); B.box('bronzeDark', a0, a1, H - 0.2, H, z - 0.01, z + 0.06);
  for (let x = a0; x <= a1 + 0.01; x += (a1 - a0) / Math.round((a1 - a0) / 1.5)) B.box('bronze', x - 0.025, x + 0.025, 0.1, H - 0.2, z - 0.02, z + 0.07);
  C.box(a0, a1, 0, H, z - 0.02, z + 0.08);
  const dm = (a0 + a1) / 2;
  B.box('glass', dm - 0.9, dm + 0.9, 0.1, 2.5, z - 0.005, z + 0.005);
  for (const s of [-1, 1]) B.box('brass', dm + s * 0.08 - 0.012, dm + s * 0.08 + 0.012, 0.8, 1.6, z - 0.08, z - 0.05);
  B.box('bronze', dm - 0.95, dm + 0.95, 2.5, 2.58, z - 0.03, z + 0.07);
  signPlane(ctx, kind === 'kindergarten' ? 5 : 6, dm, 2.72, z - 0.03, Math.PI, 0.3, 0.3);
}
function buildLobby(ctx, c, ci, L0, L1, sh0, sh1, pL, pR) {
  const { B, C } = ctx; const H = ctx.H;
  const WX0 = WING().x0;
  const x0 = c.x0, x1 = Math.min(c.x1, WX0) >= WX0 - 0.01 ? WX0 - 0.16 : Math.min(c.x1, WX0), zF = (c.zOut ?? -8.5) + 0.12, zL = -3.5;   // facade glass line, lift wall line
  const xm = (L0 + L1) / 2;
  // floor: calacatta with nero border + passages
  B.box('marbleFloor', x0, x1, -0.3, 0, zF - 0.12, -1.1); C.rect(x0, x1, zF, -1.1, 0);
  B.box('nero', x0 + 0.35, x1 - 0.35, 0, 0.004, zF + 0.35, zF + 0.5); B.box('nero', x0 + 0.35, x1 - 0.35, 0, 0.004, zL - 0.5, zL - 0.35);
  B.box('nero', x0 + 0.35, x0 + 0.5, 0, 0.004, zF + 0.35, zL - 0.35); B.box('nero', x1 - 0.5, x1 - 0.35, 0, 0.004, zF + 0.35, zL - 0.35);
  // lift wall (rear landings) facing the lobby
  const rOps = [L0, L1].map(L => ({ c: L, w: LIFT_W, h: LIFT_H, kind: 'lift' }));
  wallRun(ctx, { axis: 'x', c: zL, side: -1, a0: sh0, a1: sh1, openings: rOps, finish: 'marble', H });
  callPlate(ctx, xm, 1.12, zL - FACE - SKIN - 0.006, Math.PI, { type: 'liftCall', building: ctx.bId, stair: c.stair });
  // gold numeral-free lobby mark: bronze band above the lift doors
  B.box('bronze', sh0 + 0.1, sh1 - 0.1, 2.62, 2.66, zL - FACE - SKIN - 0.02, zL - FACE - SKIN);
  // shaft block between spine wall and lift wall
  B.box('plasterW', sh0, sh1, 0, H, -1.1 - WALL_T, zL + WALL_T);
  // passage side walls (shaft sides) in walnut
  wallRun(ctx, { axis: 'z', c: sh0, side: -1, a0: zL - 0.02, a1: -1.1, finish: 'walnut', H });
  wallRun(ctx, { axis: 'z', c: sh1, side: 1, a0: zL - 0.02, a1: -1.1, finish: 'walnut', H });
  // side walls: west = feature (marble + wordmark), east = mailboxes / walnut
  const sOp = { c: -2.3, w: 1.0, h: 2.2, kind: 'service' };
  wallRun(ctx, { axis: 'z', c: x0, side: 1, a0: zF - 0.12, a1: -1.1, finish: 'marble', zones: [{ a0: zL, a1: -1.1, mat: 'walnut' }], openings: [sOp], H });
  wallRun(ctx, { axis: 'z', c: x1, side: -1, a0: zF - 0.12, a1: -1.1, finish: 'walnut', H });
  // stair service door (closed) with pictogram
  const sd = new THREE.Mesh(ctx.geo('svcDoor', () => { const g = new THREE.BoxGeometry(0.05, 2.19, 0.99); worldUV(g, 1); return g; }), M('walnutDoor'));
  sd.position.set(x0 - 0.045, 1.095, -2.3); sd.userData.solid = true; ctx.root.add(sd);
  B.box('brass', x0 + 0.0, x0 + 0.06, 1.0, 1.04, -2.72, -2.6);
  signPlane(ctx, 0, x0 + FACE + SKIN + 0.01, 2.45, -2.3, Math.PI / 2, 0.2, 0.2);
  // facade glazing with entrance doors; the courtyard lobbies (stairs 1 & 3) get automatic sliding doors (walk.js opens them)
  const em = c.entrance[0], auto = c.stair !== 2, DW = 0.95;
  const spans = auto ? [[x0, em - DW], [em + DW, x1]] : [[x0, x1]];
  for (const [a0, a1] of spans) { B.box('glass', a0, a1, 0.05, H - 0.05, zF - 0.06, zF - 0.05); C.box(a0, a1, 0, H, zF - 0.12, zF); }
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 5) if (!auto || Math.abs(x - em) > DW + 0.05) B.box('bronze', x - 0.03, x + 0.03, 0, H, zF - 0.1, zF);
  B.box('bronze', x0, x1, 2.55, 2.61, zF - 0.1, zF); B.box('bronze', x0, x1, H - 0.06, H, zF - 0.1, zF);
  for (const [a0, a1] of spans) B.box('bronze', a0, a1, 0, 0.06, zF - 0.1, zF);
  if (auto) {
    for (const x of [em - DW, em + DW]) B.box('bronze', x - 0.04, x + 0.04, 0, H, zF - 0.12, zF + 0.02);
    B.box('bronze', em - DW, em + DW, 2.5, 2.61, zF - 0.12, zF + 0.02);
    B.box('nero', em - DW, em + DW, 0, 0.004, zF - 0.6, zF + 0.6);   // threshold mat
    const leafGeo = ctx.geo('slideLeaf', () => {
      const parts = [clean(boxGeo(-DW / 2, DW / 2, 0.02, 2.48, -0.008, 0.008))];
      return mergeGeometries(parts, false);
    });
    const frameGeo = ctx.geo('slideFrame', () => mergeGeometries([
      clean(boxGeo(-DW / 2, DW / 2, 0.02, 0.08, -0.02, 0.02)), clean(boxGeo(-DW / 2, DW / 2, 2.42, 2.48, -0.02, 0.02)),
      clean(boxGeo(-DW / 2, -DW / 2 + 0.05, 0.02, 2.48, -0.02, 0.02)), clean(boxGeo(DW / 2 - 0.05, DW / 2, 0.02, 2.48, -0.02, 0.02)),
      clean(boxGeo(-0.014, 0.014, 0.6, 1.9, 0.02, 0.05)),
    ], false));
    const leaves = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.name = 'lobby-slide-door';
      const pane = new THREE.Mesh(leafGeo, M('glass')); pane.renderOrder = 2; g.add(pane);
      const fr = new THREE.Mesh(frameGeo, M('brass')); fr.position.x = s * -0.0; g.add(fr);
      g.position.set(em + s * DW / 2, 0, zF - 0.03); g.userData.baseX = g.position.x; g.userData.dir = s;
      ctx.root.add(g); leaves.push(g);
    }
    (ctx.autoDoors ||= []).push({ x: em, z: zF, leaves, open: 0, travel: DW - 0.06 });
  }
  // coffered ceiling with cove + chandelier
  const cz0 = zF + 0.9, cz1 = zL - 0.9, cx0 = x0 + 1.0, cx1 = x1 - 1.0;
  B.box('plaster', x0, x1, H, H + 0.05, zF - 0.12, cz0); B.box('plaster', x0, x1, H, H + 0.05, cz1, -1.1);
  B.box('plaster', x0, cx0, H, H + 0.05, cz0, cz1); B.box('plaster', cx1, x1, H, H + 0.05, cz0, cz1);
  const tg = new THREE.PlaneGeometry(cx1 - cx0, cz1 - cz0); tg.rotateX(Math.PI / 2); tg.translate((cx0 + cx1) / 2, H + 0.28, (cz0 + cz1) / 2);
  const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
  B.add('tray', tg);
  B.box('plaster', cx0 - 0.03, cx1 + 0.03, H, H + 0.28, cz0 - 0.03, cz0); B.box('plaster', cx0 - 0.03, cx1 + 0.03, H, H + 0.28, cz1, cz1 + 0.03);
  B.box('plaster', cx0 - 0.03, cx0, H, H + 0.28, cz0, cz1); B.box('plaster', cx1, cx1 + 0.03, H, H + 0.28, cz0, cz1);
  B.box('led', cx0, cx1, H + 0.005, H + 0.012, cz0 + 0.002, cz0 + 0.02); B.box('led', cx0, cx1, H + 0.005, H + 0.012, cz1 - 0.02, cz1 - 0.002);
  chandelier({ ...ctx, H: H + 0.28 }, (x0 + x1) / 2, H - 0.22, (zF + zL) / 2, 0.62);
  floorPools(ctx, [[(x0 + x1) / 2, (zF + zL) / 2, 2.2]], 1.3);
  {
    const mx = (x0 + x1) / 2, mz = (zF + zL) / 2;
    const ring = (r0, r1, mat, y) => { const g = new THREE.RingGeometry(r0, r1, 72); g.rotateX(-Math.PI / 2); g.translate(mx, y, mz); B.add(mat, g); };
    ring(1.28, 1.36, 'nero', 0.003); ring(1.2, 1.215, 'brass', 0.0035); ring(0.52, 0.535, 'brass', 0.0035);
    const c = new THREE.CircleGeometry(0.5, 64); c.rotateX(-Math.PI / 2); c.translate(mx, 0.003, mz); B.add('nero', c);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, g = new THREE.PlaneGeometry(0.012, 0.66); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.87); g.rotateY(a); g.translate(mx, 0.0035, mz); B.add('brass', g); }
  }
  // wordmark on the west feature wall (2.8 m wide)
  const wg = new THREE.PlaneGeometry(3.3, 0.825); const zc = (zF + zL) / 2;
  B.add('wordmark', wg, mat4(x0 + FACE + SKIN + 0.004, 2.12, zc, Math.PI / 2));
  B.add('decal', new THREE.PlaneGeometry(1.2, 2.2).translate(0, 0, 0), mat4(x0 + FACE + SKIN + 0.006, H - 1.12, zc - 1.9, Math.PI / 2));
  B.add('decal', new THREE.PlaneGeometry(1.2, 2.2).translate(0, 0, 0), mat4(x0 + FACE + SKIN + 0.006, H - 1.12, zc + 1.9, Math.PI / 2));
  B.box('led', x0 + FACE + SKIN, x0 + FACE + SKIN + 0.01, H - 0.02, H - 0.012, zc - 1.6, zc + 1.6);
  if (c.stair === 2) {
    // concierge desk in front of the feature wall (desk front faces +x)
    const dx = x0 + 1.55, z0 = zc - 1.25, z1 = zc + 1.25;
    B.box('marble', dx - 0.3, dx + 0.05, 0.08, 1.05, z0, z1);          // front panel
    B.box('walnut', dx - 0.75, dx - 0.3, 0.08, 0.74, z0, z1);          // back cabinet
    B.box('nero', dx - 0.8, dx + 0.1, 1.05, 1.1, z0 - 0.05, z1 + 0.05); // counter
    B.box('walnut', dx - 0.85, dx - 0.25, 0.74, 0.77, z0, z1);          // work top
    B.box('bronze', dx - 0.3, dx + 0.02, 0, 0.08, z0 + 0.02, z1 - 0.02);
    B.box('led', dx + 0.052, dx + 0.056, 0.1, 0.12, z0 + 0.05, z1 - 0.05);
    for (let k = 0; k < 5; k++) B.box('brass', dx + 0.05, dx + 0.058, 0.2, 0.98, z0 + 0.25 + k * 0.5, z0 + 0.27 + k * 0.5);
    C.box(dx - 0.85, dx + 0.1, 0, 1.1, z0 - 0.05, z1 + 0.05);
    // desk lamp + flowers
    B.add('brass', new THREE.CylinderGeometry(0.06, 0.08, 0.02, 24).translate(dx - 0.45, 1.11, z1 - 0.3));
    B.add('brass', new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8).translate(dx - 0.45, 1.29, z1 - 0.3));
    B.add('velvetSand', new THREE.CylinderGeometry(0.07, 0.12, 0.14, 24, 1, true).translate(dx - 0.45, 1.5, z1 - 0.3));
    B.add('bulb', new THREE.CircleGeometry(0.06, 16).rotateX(Math.PI / 2).translate(dx - 0.45, 1.44, z1 - 0.3));
    const vase = new THREE.CylinderGeometry(0.06, 0.05, 0.28, 20); vase.translate(dx - 0.5, 1.24, z0 + 0.35); B.add('glass', vase);
    // orchid spray: two arching stems with white blooms
    for (const [ox, dir] of [[0, 1], [0.03, -1]]) {
      const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(dx - 0.5 + ox + dir * t * t * 0.18, 1.2 + Math.sin(t * 1.7) * 0.34, z0 + 0.35 + t * 0.04)); }
      const curve = new THREE.CatmullRomCurve3(pts); B.add('leaf', new THREE.TubeGeometry(curve, 16, 0.0035, 5, false));
      for (let k = 3; k <= 8; k++) { const p = curve.getPoint(k / 8); const f = new THREE.SphereGeometry(0.03 - k * 0.0022, 10, 6); f.scale(1, 0.4, 1); f.rotateZ(dir * 0.9); f.translate(p.x + dir * 0.01, p.y - 0.01, p.z + 0.012); B.add('white', f); }
    }
    // concierge chair
    armchair(B, dx - 1.05, zc, Math.PI / 2, 'velvet');
    // seating by the facade (east side)
    armchair(B, x1 - 1.0, zF + 1.25, -Math.PI / 2 - 0.5); armchair(B, x1 - 2.25, zF + 1.0, -0.2);
    roundTable(B, x1 - 1.55, zF + 1.95, 0.32, 0.45);
    B.box('rug', x1 - 2.9, x1 - 0.4, 0.004, 0.012, zF + 0.4, zF + 2.9);
    C.box(x1 - 2.8, x1 - 0.5, 0, 0.8, zF + 0.4, zF + 2.4);
  } else {
    // bench under the wordmark, seating near the facade
    B.box('velvetSand', x0 + 0.22, x0 + 0.72, 0.3, 0.46, zc - 1.2, zc + 1.2); B.box('bronze', x0 + 0.26, x0 + 0.68, 0.06, 0.3, zc - 1.15, zc + 1.15);
    C.box(x0, x0 + 0.75, 0, 0.5, zc - 1.2, zc + 1.2);
    armchair(B, x1 - 1.2, zF + 1.2, -Math.PI / 2 - 0.5); roundTable(B, x1 - 1.9, zF + 1.2, 0.3, 0.45); armchair(B, x1 - 2.6, zF + 1.2, Math.PI / 2 + 0.5);
    B.box('rug', x1 - 3.3, x1 - 0.5, 0.004, 0.012, zF + 0.35, zF + 2.2);
    C.box(x1 - 3.1, x1 - 0.7, 0, 0.8, zF + 0.6, zF + 1.8);
  }
  // mailboxes on the east wall
  const mz = (zF + zL) / 2 + 0.6;
  const mg = new THREE.PlaneGeometry(1.9, 1.2);
  B.box('bronzeDark', x1 - FACE - SKIN - 0.06, x1 - FACE - SKIN, 0.55, 1.85, mz - 1.0, mz + 1.0);
  B.add('mailbox', mg, mat4(x1 - FACE - SKIN - 0.062, 1.2, mz, -Math.PI / 2));
  C.box(x1 - 0.12, x1, 0, 2, mz - 1.0, mz + 1.0);
  plant(B, x0 + 0.5, zF + 0.55, 1.05); plant(B, x1 - 0.5, zL - 0.55, 0.95);
  C.box(x0 + 0.2, x0 + 0.8, 0, 1, zF + 0.25, zF + 0.85); C.box(x1 - 0.8, x1 - 0.2, 0, 1, zL - 0.85, zL - 0.25);
  // passage ceilings
  for (const [p0, p1] of [pL, pR]) if (p1 - p0 > 0.3) B.box('plaster', p0, p1, H, H + 0.05, zL, -1.1);
}

// ============================================================ parking (-1)
function buildParking(bId) {
  const floor = -1, H = 3.1;
  const ctx = makeCtx(bId, floor, H, false);   // world-frame basement: only the lobbies of a mirrored block are reflected
  const { root } = ctx;
  const O = BUILDINGS[bId].origin;
  // Parking is one basement under both buildings and the courtyard; it is modelled in WORLD coordinates in a sub-group offset by -origin.
  const W = new THREE.Group(); W.position.set(-O[0], 0, -O[1]); root.add(W);
  const wctx = { ...ctx, root: W, B: new Batch(null), C: new Colliders(16, null), signB: new Batch(null, true) };
  const { B, C } = wctx;
  const X0 = BASEMENT.x0, X1 = BASEMENT.x1, Z0 = BASEMENT.z0, Z1 = BASEMENT.z1;
  // obstacles (world): cores + glass lobbies, ramp. A lobby is built in the canonical frame (`canon`, extending +z from the
  // lift wall) and reflected about the block's axis (z = oz) for a mirrored block; `x0…z1` / `front` / `dir` are the true rect.
  const obst = [];
  const lobbies = [];
  const WX0 = WING().x0;
  for (const [id, b] of Object.entries(BUILDINGS)) CORES.forEach((c, ci) => {
    const oz = b.origin[1], ox = b.origin[0], m = isMirrored(id) ? -1 : 1, tc = coresOf(id)[ci];
    obst.push([ox + tc.x0, ox + tc.x1, oz + tc.z0, oz + tc.z1]);
    const canon = { id, c, x0: ox + c.x0, x1: ox + Math.min(c.x1, WX0), z0: oz + c.z1, z1: oz + c.z1 + 2.0, ox, oz };
    const zA = oz + m * c.z1, zB = oz + m * (c.z1 + 2.0);
    const lob = { id, c, ci, canon, mirror: m < 0, x0: canon.x0, x1: canon.x1, z0: Math.min(zA, zB), z1: Math.max(zA, zB), front: zB, dir: m, ox, oz };
    lobbies.push(lob); obst.push([lob.x0 - 0.2, lob.x1 + 0.2, m > 0 ? lob.z0 : lob.z0 - 0.6, m > 0 ? lob.z1 + 0.6 : lob.z1]);
  });
  const RAMP = [RAMP_D.x0, RAMP_D.x1, RAMP_D.z0, RAMP_D.z1], RAMP_OPEN = RAMP_D.open;   // world; matches the open ramp drawn by environment.js
  obst.push([RAMP[0] - 0.4, RAMP[1], RAMP[2], RAMP[3] + 0.8]);
  const hit = (a0, a1, b0, b1) => obst.some(([x0, x1, z0, z1]) => a0 < x1 && a1 > x0 && b0 < z1 && b1 > z0);
  // floor, ceiling, perimeter walls
  B.box('epoxy', X0, X1, -0.3, 0, Z0, Z1); C.rect(X0, X1, Z0, Z1, 0);
  for (const [a0, a1, b0, b1] of [[X0, RAMP[0], Z0, Z1], [RAMP[1], X1, Z0, Z1], [RAMP[0], RAMP[1], Z0, RAMP[2]], [RAMP[0], RAMP[1], RAMP_OPEN, Z1]]) B.box('ceilingP', a0, a1, H, H + 0.3, b0, b1);
  for (const [a, b2, c2, d] of [[X0 - 0.3, X0, Z0, Z1], [X1, X1 + 0.3, Z0, Z1], [X0, X1, Z0 - 0.3, Z0], [X0, X1, Z1, Z1 + 0.3]]) { B.box('concreteLight', a, b2, 0, H, c2, d); C.box(a, b2, 0, H, c2, d); }
  // wall dado band
  B.box('paintGreen', X0, X0 + 0.01, 0, 1.1, Z0, Z1); B.box('paintGreen', X1 - 0.01, X1, 0, 1.1, Z0, Z1);
  B.box('paintGreen', X0, X1, 0, 1.1, Z0, Z0 + 0.01); B.box('paintGreen', X0, X1, 0, 1.1, Z1 - 0.01, Z1);
  const aisles = []; for (let k = 0; k < 9; k++) { const a = 3.9 - 16 * k; if (a > Z0 + 3 && a < Z1 - 3) aisles.push(a); }
  // columns
  const colM = [], colBand = [];
  const colXs = []; for (let x = X0 + 1.5; x < X1 - 1; x += 8.1) colXs.push(x);
  const backLines = [aisles[0] + 8, ...aisles.map(a => a - 8)];
  for (const z of backLines) for (const x of colXs) {
    if (z < Z0 + 0.5 || z > Z1 - 0.3) continue;
    if (hit(x - 0.35, x + 0.35, z - 0.35, z + 0.35)) continue;
    colM.push(mat4(x, H / 2, z, 0, 1, 1, 1)); colBand.push(mat4(x, 0.45, z));
    C.box(x - 0.3, x + 0.3, 0, H, z - 0.3, z + 0.3);
  }
  instanced(W, ctx.geo('col', () => { const g = new THREE.BoxGeometry(0.6, H, 0.6); worldUV(g, 2); return g; }), 'concreteLight', colM);
  instanced(W, ctx.geo('colBand', () => new THREE.BoxGeometry(0.62, 0.9, 0.62)), 'paintYellow', colBand);
  instanced(W, ctx.geo('colBand2', () => new THREE.BoxGeometry(0.625, 0.12, 0.625)), 'hazard', colBand.map(m => m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.25, 0))));
  // bays
  const bays = []; let no = 1;
  for (const ac of aisles) for (const dir of [-1, 1]) {
    const zA = ac + dir * 3, zB = ac + dir * 8;          // bay from aisle edge to back line
    const [b0, b1] = [Math.min(zA, zB), Math.max(zA, zB)];
    if (b0 < Z0 || b1 > Z1) continue;
    for (const xc of colXs) for (let j = 0; j < 3; j++) {
      const x0 = xc + 0.3 + j * 2.5, x1 = x0 + 2.5;
      if (x1 > X1 - 0.3) continue;
      if (hit(x0, x1, b0, b1)) continue;
      if (x0 < X0 + 9.4 || (x1 > RAMP[0] - 2.7 && x0 < RAMP[1] + 3.5 && b1 > RAMP[3] - 1.5)) continue;   // drive lanes (along the SSW wall; from the ramp foot)
      bays.push({ x0, x1, z0: b0, z1: b1, dir, no: no++, ac });
    }
  }
  // painted lines, EV bays, numbers
  const r = rng(bId === 'C3' ? 3 : 5);
  const numLabels = bays.map(b => String(b.no).padStart(3, '0'));
  const nAtlas = canvas(1024, 1024), ng = nAtlas.getContext('2d');
  ng.clearRect(0, 0, 1024, 1024); ng.fillStyle = '#f4f1ea'; ng.textAlign = 'center'; ng.textBaseline = 'middle'; ng.font = `700 30px ${SANS}`;
  numLabels.forEach((t, i) => ng.fillText(t, (i % 16) * 64 + 32, ((i / 16) | 0) * 32 + 17));
  const nTex = texOf(nAtlas, { repeat: false }); ctx.ownTex.push(nTex);
  const nMat = new THREE.MeshStandardMaterial({ map: nTex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  ctx.ownMat = [nMat];
  const nb = new Batch();
  const evM = [], evLight = [], carList = [];
  const rc = carRng(20260930);   // same parked cars whichever building's parking view is built
  for (const b of bays) {
    for (const x of [b.x0, b.x1]) B.box('paint', x - 0.05, x + 0.05, 0.001, 0.004, b.z0 + 0.1, b.z1 - 0.05);
    const ev = b.no % 9 === 4;
    if (ev) { B.box('paintGreen', b.x0 + 0.08, b.x1 - 0.08, 0.001, 0.003, b.z0 + 0.1, b.z1 - 0.05); }
    // number near the aisle end
    const g = new THREE.PlaneGeometry(0.62, 0.31); g.rotateX(-Math.PI / 2);
    const i = b.no - 1, uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, ((i % 16) + uv.getX(k)) / 16, 1 - (((i / 16) | 0) + 1 - uv.getY(k)) / 32);
    const zn = b.dir < 0 ? b.z1 - 0.6 : b.z0 + 0.6;
    nb.add(nMat, g, mat4((b.x0 + b.x1) / 2, 0.006, zn, b.dir < 0 ? 0 : Math.PI));
    if (ev) {   // charger on a pedestal at the back of the bay
      const zb = b.dir < 0 ? b.z0 + 0.25 : b.z1 - 0.25;
      evM.push(mat4((b.x0 + b.x1) / 2, 0, zb, b.dir < 0 ? 0 : Math.PI)); evLight.push(mat4((b.x0 + b.x1) / 2, 1.18, zb + (b.dir < 0 ? 0.09 : -0.09), b.dir < 0 ? 0 : Math.PI));
      C.box(b.x0 + 1.0, b.x1 - 1.0, 0, 1.4, zb - 0.15, zb + 0.15);
    }
    if (rc() < 0.72) {   // luxury car, rear (or nose, when reversed in) 12 cm off the back line; EV bays leave room for the charger
      const pick = pickCar(rc), S = carSpec(pick.kind), nose = rc() < 0.55;   // nose → facing the aisle
      const yaw = (b.dir < 0 ? 0 : Math.PI) + (nose ? 0 : Math.PI) + (rc() - 0.5) * 0.03;
      const facePlus = Math.cos(yaw) > 0, back = ev ? 0.55 : 0.12;
      const cz = b.dir < 0 ? b.z0 + back - (facePlus ? S.zR : -S.zF) : b.z1 - back - (facePlus ? S.zF : -S.zR);
      carList.push({ x: (b.x0 + b.x1) / 2 + (rc() - 0.5) * 0.12, y: 0, z: cz, yaw, ...pick });
    }
  }
  nb.flush(W);
  // parked luxury cars (instanced far models); walk.js adopts them into its drivable fleet (world coords)
  ctx.carInstances = createCarInstances(carList); ctx.carInstances.group.name = 'vrc-parked-cars'; W.add(ctx.carInstances.group);
  ctx.parkedCars = carList.map(c => ({ ...c, y: floorY(-1) }));
  // EV chargers
  instanced(W, ctx.geo('ev', () => mergeGeometries([clean(boxGeo(-0.14, 0.14, 0, 1.45, -0.09, 0.09)), clean(boxGeo(-0.18, 0.18, 1.45, 1.5, -0.12, 0.12))], false)), 'white', evM);
  instanced(W, ctx.geo('evL', () => new THREE.TorusGeometry(0.07, 0.012, 8, 24)), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 0.9) }), evLight);
  // drive lanes linking the aisles: dashed centre lines
  { const lx = X0 + 5.5; for (let z = Z0 + 2; z < Z1 - 2; z += 3) if (!hit(lx - 0.7, lx + 0.7, z, z + 1.6)) B.box('paintYellow', lx - 0.06, lx + 0.06, 0.001, 0.004, z, z + 1.6); }
  { const lx = (RAMP[0] + RAMP[1]) / 2 - 1.1; for (let z = RAMP[3] + 1; z < Z1 - 2; z += 3) if (!hit(lx - 0.6, lx + 0.8, z, z + 1.6)) B.box('paintYellow', lx - 0.06, lx + 0.06, 0.001, 0.004, z, z + 1.6); }
  // aisle markings: dashed centre line + arrows + zebra crossings at lobbies
  for (const ac of aisles) for (let x = X0 + 2; x < X1 - 3; x += 3) if (!hit(x, x + 1.6, ac - 0.1, ac + 0.1)) B.box('paintYellow', x, x + 1.6, 0.001, 0.004, ac - 0.06, ac + 0.06);
  for (const L of lobbies) {
    const xm = (L.x0 + L.x1) / 2;
    const ac = aisles.reduce((a, b) => Math.abs(b - L.front) < Math.abs(a - L.front) ? b : a);
    for (let k = -3; k <= 3; k++) B.box('paint', xm + k * 0.5 - 0.2, xm + k * 0.5 + 0.2, 0.001, 0.004, L.front + L.dir * 0.6, ac - L.dir * 3);
  }
  // LED battens over the aisles and bays, sprinkler mains
  const bat = [];
  for (const ac of aisles) for (let x = 2; x < X1 - 2; x += 4.05) for (const dz of [-5.5, 0, 5.5]) { const z = ac + dz; if (z > Z0 + 0.5 && z < Z1 - 0.5 && !hit(x - 0.8, x + 0.8, z - 0.1, z + 0.1)) bat.push(mat4(x, H - 0.05, z)); }
  instanced(W, ctx.geo('bat', () => new THREE.BoxGeometry(1.5, 0.05, 0.1)), 'ledCool', bat);
  floorPools(wctx, bat.filter((_, i) => i % 2 === 0).map(m => { const p = new THREE.Vector3().setFromMatrixPosition(m); return [p.x, p.z]; }), 3.6, 'poolCool');
  // level/zone plates on the columns facing the aisles (language-neutral: "-1" + zone letter)
  {
    const lab = canvas(512, 128), lg = lab.getContext('2d');
    for (let i = 0; i < 8; i++) { const x = i * 64; lg.fillStyle = '#1b1b1b'; lg.fillRect(x, 0, 64, 128); lg.fillStyle = '#e0b12a'; lg.fillRect(x, 0, 64, 10); lg.fillStyle = '#f4f1ea'; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.font = `700 30px ${SANS}`; lg.fillText('-1', x + 32, 44); lg.font = `700 34px ${SANS}`; lg.fillStyle = '#e0b12a'; lg.fillText('ABCDEFGH'[i], x + 32, 92); }
    const lt = texOf(lab, { repeat: false }); ctx.ownTex.push(lt);
    const lm = new THREE.MeshBasicMaterial({ map: lt, color: new THREE.Color(0.9, 0.9, 0.9) }); ctx.ownMat.push(lm);
    const lb = new Batch();
    colM.forEach((m, i) => {
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      const ai = aisles.findIndex(a => Math.abs(p.z - (a - 8)) < 0.5 || Math.abs(p.z - (a + 8)) < 0.5); const zone = Math.max(0, ai) % 8;
      for (const s2 of [-1, 1]) {
        const g = new THREE.PlaneGeometry(0.34, 0.68); const uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, (zone + uv.getX(k)) / 8, uv.getY(k));
        lb.add(lm, g, mat4(p.x, 1.75, p.z + s2 * 0.302, s2 > 0 ? 0 : Math.PI));
      }
    });
    lb.flush(W);
  }
  for (const ac of aisles) for (const dz of [2.2, -5.8]) { const g = new THREE.CylinderGeometry(0.022, 0.022, X1 - X0, 8); g.rotateZ(Math.PI / 2); g.translate((X0 + X1) / 2, H - 0.1, ac + dz); B.add('steel', g); }
  // ramp (world, rising to the north up to grade); tunnel roof until RAMP_OPEN, open air beyond
  const [rx0, rx1, rz0, rz1] = RAMP, rise = LEVELS.groundY - LEVELS.parkingY;
  const rlen = rz1 - rz0, ang = Math.atan2(rise, rlen), slope = rise / rlen, len = Math.hypot(rlen, rise);
  const rg = new THREE.BoxGeometry(rx1 - rx0, 0.3, len); rg.rotateX(ang); rg.translate((rx0 + rx1) / 2, rise / 2 - 0.15, (rz0 + rz1) / 2);
  B.add('concrete', rg);
  const rf = new THREE.PlaneGeometry(rx1 - rx0 - 0.2, len); rf.rotateX(-Math.PI / 2 + ang); rf.translate((rx0 + rx1) / 2, rise / 2 + 0.002, (rz0 + rz1) / 2);
  C.geoFloor(rf);
  for (let k = 0; k < 14; k++) { const t = (k + 0.5) / 14, z = rz1 - t * rlen, y = t * rise; B.box('paintYellow', rx0 + 0.5, rx1 - 0.5, y + 0.01, y + 0.02, z - 0.08, z + 0.08); }
  const yAt = z => (rz1 - z) * slope;
  for (const [a, b2] of [[rx0 - 0.3, rx0], [rx1, rx1 + 0.3]]) { B.box('concreteLight', a, b2, 0, rise + 0.02, rz0, rz1); C.box(a, b2, 0, rise + H, rz0, rz1 - 1.2); }
  // sloped tunnel roof from the parking ceiling line up to the opening
  const tl = RAMP_OPEN, tlen = rz1 - tl, tr = new THREE.BoxGeometry(rx1 - rx0 + 0.6, 0.3, Math.hypot(tlen, yAt(tl))); tr.rotateX(Math.atan2(yAt(tl), tlen));
  tr.translate((rx0 + rx1) / 2, H + yAt(tl) / 2 + 0.15, (rz1 + tl) / 2); B.add('ceilingP', tr);
  for (let k = 0; k < 4; k++) { const z = rz1 - 1.5 - k * 2.8; B.box('ledCool', (rx0 + rx1) / 2 - 0.75, (rx0 + rx1) / 2 + 0.75, H + yAt(z) - 0.05, H + yAt(z), z - 0.05, z + 0.05); }
  // (the ramp top is open: outdoor floors continue at grade — built by walk.js/cars.js)
  // barrier at the ramp foot
  B.box('white', rx1 - 0.6, rx1 - 0.3, 0, 1.05, rz1 - 0.3, rz1 - 0.1);
  for (let k = 0; k < 6; k++) B.box(k % 2 ? 'white' : 'pipeRed', rx1 - 0.49, rx1 - 0.41, 1.03 + k * 0.33, 1.03 + (k + 1) * 0.33, rz1 - 0.24, rz1 - 0.16);   // boom raised
  // lobbies (glass boxes) + core volumes; a mirrored block's lobbies are built canonically and reflected about its axis
  for (const L of lobbies) {
    if (!L.mirror) { parkingLobby(wctx, ctx, L.canon, L.id === bId); continue; }
    const before = new Set(W.children);
    const lw = { ...wctx, B: new Batch(L.oz), C: new Colliders(16, L.oz), signB: new Batch(L.oz, true) };
    parkingLobby(lw, ctx, L.canon, L.id === bId);
    lw.B.flush(W); lw.C.flush(W); lw.signB.flush(W);
    for (const o of [...W.children]) if (!before.has(o) && !BAKED.has(o) && !NOMIRROR.has(o)) mirrorObj(o, L.oz);
  }
  // hanging pictogram signs over the aisles (P, lift, exit)
  for (const ac of aisles) for (const x of [X0 + 13, (X0 + X1) / 2, X1 - 13]) {
    if (hit(x - 1, x + 1, ac - 1, ac + 1)) continue;
    B.box('bronzeDark', x - 0.02, x + 0.02, H - 0.35, H, ac - 0.02, ac + 0.02);
    B.box('blackGlass', x - 0.56, x + 0.56, H - 0.62, H - 0.34, ac - 0.03, ac + 0.03);
    [[2, -0.36], [1, 0], [7, 0.36]].forEach(([s, dx]) => { signPlane(wctx, s, x + dx, H - 0.48, ac + 0.035, 0, 0.24, 0.24); signPlane(wctx, s, x - dx, H - 0.48, ac - 0.035, Math.PI, 0.24, 0.24); });
  }
  // level marks on columns: "-1" painted via the number atlas? use P pictogram on column faces near lobbies
  wctx.B.flush(W); wctx.C.flush(W); wctx.signB.flush(W);
  // parking light rig: current building's lobbies + aisle
  const my = lobbies.filter(L => L.id === bId);
  const toLocal = (x, z) => [x - O[0], z - O[1]];
  const spots = my.map(L => { const [x, z] = toLocal((L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2); return [x, 2.5, z, 5, 0xffd9ae, 7]; });
  const aisleNear = aisles.reduce((a, b) => Math.abs(b - O[1]) < Math.abs(a - O[1]) ? b : a);
  const [ax, az] = toLocal((X0 + X1) / 2, aisleNear);
  spots.push([ax, 1.9, az, 4, 0xf2f4ff, 18]);
  claimRig(root, spots, 0.3);
  const lob2 = my.find(L => L.c.stair === 2) || my[0];
  const [spx, spz] = toLocal((lob2.x0 + lob2.x1) / 2 - 7.5, lob2.front + lob2.dir * 3.0);
  const res = finish(ctx, { x: spx, z: spz, yaw: lob2.dir > 0 ? Math.PI / 2 + 0.25 : Math.PI / 2 - 0.25 });
  const d0 = res.dispose;
  res.dispose = () => { d0(); for (const m of ctx.ownMat) m.dispose(); };
  return res;
}
function parkingLobby(w, ctx, L, own) {   // glass lift lobby in front of a core; functional lifts only for the own building
  const { B, C } = w; const H = 3.1, h = 2.7;
  const { x0, x1, z0, z1, c } = L;
  const [L0, L1] = c.liftDoors.map(d => L.ox + d[0]);
  // core volume (concrete) behind the lifts
  B.box('concreteLight', x0, x1, 0, H, L.oz + c.z0, z0 - WALL_T); C.box(x0, x1, 0, H, L.oz + c.z0, z0 - WALL_T);
  // lobby floor + ceiling
  B.box('stone', x0, x1, 0, 0.02, z0, z1); w.C.rect(x0, x1, z0, z1, 0.02);
  B.box('walnut', x0, x1, h, h + 0.04, z0, z1); B.box('bronzeDark', x0, x1, h + 0.04, H, z1 - 0.06, z1);
  B.box('led', x0 + 0.2, x1 - 0.2, h - 0.004, h, z1 - 0.3, z1 - 0.26);
  // lift wall (marble) with openings
  const ops = [L0, L1].map(Lx => ({ c: Lx, w: LIFT_W, h: LIFT_H, kind: 'lift' }));
  const sd = { c: x1 - 0.7, w: 0.95, h: 2.2, kind: 'service' };
  if (x1 - 0.7 - 0.5 < L1 + POCKET) sd.c = x0 + 0.7;
  wallRun(w, { axis: 'x', c: z0, side: 1, a0: x0, a1: x1, openings: [...ops, sd], finish: 'marble', H: h });
  B.box('concreteLight', x0, x1, h, H, z0 - WALL_T, z0 + 0.02);
  const sdoor = new THREE.Mesh(ctx.geo('svcDoorP', () => { const g = new THREE.BoxGeometry(0.94, 2.19, 0.05); worldUV(g, 1); return g; }), M('walnutDoor'));
  sdoor.position.set(sd.c, 1.095, z0 - 0.045); sdoor.userData.solid = true; w.root.add(sdoor);
  signPlane(w, 0, sd.c, 2.42, z0 + FACE + SKIN + 0.01, 0, 0.18, 0.18);
  callPlate(w, (L0 + L1) / 2, 1.12, z0 + FACE + SKIN + 0.006, 0, own ? { type: 'liftCall', building: L.id, stair: c.stair } : { type: 'none' });
  // glass enclosure with bronze frame; open sliding doors at the front centre
  const xm = (x0 + x1) / 2, dw = 0.85;
  const glassSide = (ax, a0, a1) => { B.box('glass', ax - 0.006, ax + 0.006, 0.03, h, a0, a1); B.box('bronze', ax - 0.03, ax + 0.03, 0, 0.06, a0, a1); B.box('bronze', ax - 0.03, ax + 0.03, h - 0.06, h, a0, a1); C.box(ax - 0.05, ax + 0.05, 0, H, a0, a1); for (let z = a0; z <= a1 + 0.01; z += (a1 - a0) / 2) B.box('bronze', ax - 0.03, ax + 0.03, 0, h, z - 0.025, z + 0.025); };
  glassSide(x0 + 0.03, z0, z1); glassSide(x1 - 0.03, z0, z1);
  for (const [a0, a1] of [[x0, xm - dw], [xm + dw, x1]]) {
    B.box('glass', a0, a1, 0.03, h, z1 - 0.006, z1 + 0.006); C.box(a0, a1, 0, H, z1 - 0.05, z1 + 0.05);
    B.box('bronze', a0, a1, 0, 0.06, z1 - 0.03, z1 + 0.03); B.box('bronze', a0, a1, h - 0.06, h, z1 - 0.03, z1 + 0.03);
    for (const x of [a0, a1]) B.box('bronze', x - 0.025, x + 0.025, 0, h, z1 - 0.03, z1 + 0.03);
  }
  // door leaves slid open behind the fixed panes
  for (const s of [-1, 1]) B.box('glass', xm + s * dw - 0.02 * s, xm + s * (2 * dw - 0.1), 0.03, h - 0.1, z1 - 0.05, z1 - 0.04);
  B.box('bronze', xm - dw, xm + dw, h - 0.1, h, z1 - 0.06, z1 + 0.03);
  // lifts
  const b = BUILDINGS[L.id];
  if (own) c.liftDoors.forEach((_, di) => ctx.lifts.push(new Lift(L.id, CORES.indexOf(c), di, -1)));
  else {
    // decorative lifts of the other building (closed), positioned via the world sub-group
    for (let di = 0; di < 2; di++) { const Lf = new Lift(L.id, CORES.indexOf(c), di, -1, { decor: true }); Lf.group.position.set(b.origin[0], floorY(-1) * 0 - floorY(-1), b.origin[1]); NOMIRROR.add(Lf.group); w.root.add(Lf.group); ctx.decor = ctx.decor || []; ctx.decor.push(Lf); }
  }
  // "P −1" level pictogram on the lobby glass above the doors
  signPlane(w, 2, xm, h - 0.35, z1 + 0.02, 0, 0.28, 0.28);
}

// ============================================================ public API
export function buildFloorCommons(bId, floor, styleId = 'lobby') {
  if (!BUILDINGS[bId]) bId = 'C3';
  floor = Math.max(-1, Math.min(TOP_FLOOR, floor | 0));
  let res;
  try {
    if (floor === -1) res = buildParking(bId);
    else if (floor === 0) res = buildGround(bId);
    else res = buildTypical(bId, floor);
  } finally { MZ = null; }
  res.styleId = styleId;
  return res;
}
export { CAR_DEPTH };
