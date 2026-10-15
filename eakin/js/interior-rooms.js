// interior-rooms.js — bedrooms 1-4 and the living/dining room (V2 luxury staging).
// Layout positions are the validated V1 ones (door swings, stair, windows); pieces are restyled and drapes added.
import { THREE, PI, Batch, shaker, hinged, drawer, plant, rng } from './interior-lib.js';
import { mug } from './interior-kitchen.js';
import {
  C as LX, soft, tube, bpull, bknob, bcup, fluted, tableLampLux, lampMats, pendant, curtains, artLux, rugLux,
  vase, branches, bookStack, candle, oliveTree, curvedSofa, loungeChair, mirrorDisc, lemons,
} from './interior-lux.js';

const BRASS = LX.brass, OAK = LX.oak, WHITE = 0xf3f0e9;

// room sub-group (userData.room for reflection probes)
function roomGroup(G, room) { const g = new THREE.Group(); g.name = 'room-' + room; g.userData.room = room; g.userData.roomFixed = true; G.add(g); return g; }

// ------------------------------------------------------------------ furniture builders (frame: back-center at floor, facing +z)
/** upholstered bed with channel headboard and layered linen bedding */
export function bed(E, f, o) {
  const w = o.w, l = o.l, hh = o.headH || 1.35, hc = o.headC || 0xb9b0a2, hk = o.headKey || 'velvet';
  const z0 = 0.1;
  // upholstered platform + low brass feet
  soft(f, hk, [w + 0.06, 0.3, l + 0.04], [0, 0.2, z0 + l / 2], hc, { e1: 0.22, e2: 0.06, noise: 0.003, nu: 40, nv: 10, seed: 2 });
  for (const sx of [-1, 1]) for (const sz of [0, 1]) f.cyl('brass', 0.018, 0.014, 0.05, [sx * (w / 2 - 0.02), 0.025, z0 + 0.06 + sz * (l - 0.12)], BRASS, { seg: 12 });
  // channel-tufted headboard (soft vertical channels on a panel)
  const W = w + 0.04, n = Math.max(5, Math.round(W / 0.2)), pw = W / n;
  f.box(hk, [W + 0.02, hh - 0.04, 0.05], [0, 0.04 + (hh - 0.04) / 2, 0.025], hc, { r: 0.02 });
  for (let i = 0; i < n; i++) soft(f, hk, [pw + 0.004, hh - 0.08, 0.09], [-W / 2 + pw * (i + 0.5), 0.06 + (hh - 0.08) / 2, 0.07], hc, { e1: 0.35, e2: 0.22, noise: 0.003, nu: 16, nv: 16, seed: i + 5 });
  // mattress (hidden mostly) + duvet + drops + sheet fold + knit throw
  soft(f, 'linen', [w, 0.24, l - 0.02], [0, 0.46, z0 + l / 2], 0xf6f4ef, { e1: 0.3, e2: 0.08, noise: 0.002, nu: 28, nv: 10, seed: 3 });
  const dz0 = z0 + l * 0.26, dl = l - l * 0.26 + 0.06;
  soft(f, 'linen', [w + 0.14, 0.11, dl], [0, 0.6, dz0 + dl / 2], o.duvetC || LX.ivory, { e1: 0.3, e2: 0.06, sagTop: 0.015, noise: 0.012, freq: 5, nu: 44, nv: 14, seed: 4 });
  for (const sx of [-1, 1]) soft(f, 'linen', [0.035, 0.3, dl - 0.02], [sx * (w / 2 + 0.075), 0.47, dz0 + dl / 2], o.duvetC || LX.ivory, { e1: 0.3, e2: 0.08, noise: 0.008, freq: 6, nu: 30, nv: 12, seed: 6 + sx });
  soft(f, 'linen', [w + 0.14, 0.3, 0.035], [0, 0.47, dz0 + dl + 0.005], o.duvetC || LX.ivory, { e1: 0.3, e2: 0.08, noise: 0.008, freq: 6, nu: 30, nv: 12, seed: 9 });
  soft(f, 'linen', [w + 0.15, 0.06, 0.24], [0, 0.645, dz0 + 0.08], 0xfbfaf7, { e1: 0.5, e2: 0.1, noise: 0.004, nu: 36, nv: 10, seed: 10 });
  const tz = z0 + l - 0.3;
  soft(f, 'knit', [w + 0.18, 0.04, 0.5], [0, 0.665, tz], o.throwC || LX.oat, { e1: 0.35, e2: 0.08, noise: 0.008, nu: 30, nv: 10, seed: 11 });
  for (const sx of [-1, 1]) soft(f, 'knit', [0.04, 0.3, 0.5], [sx * (w / 2 + 0.1), 0.52, tz], o.throwC || LX.oat, { e1: 0.35, e2: 0.1, noise: 0.008, nu: 14, nv: 12, seed: 12 + sx });
  // pillows: euro shams, sleeping pillows, lumbar
  const np = w > 1.2 ? 2 : 1, pw2 = Math.min(0.68, (w - 0.04) / np);
  for (let i = 0; i < np; i++) {
    const x = -((np - 1) * pw2) / 2 + i * pw2;
    if (o.euro !== false && w > 1.2) soft(f, 'linen', [pw2 - 0.04, 0.62, 0.2], [x, 0.92, z0 + 0.14], o.euroC || LX.oat, { e1: 0.6, e2: 0.22, pinch: 0.55, rx: -0.14, noise: 0.006, seed: 20 + i });
    soft(f, 'linen', [pw2 - 0.05, 0.42, 0.17], [x, 0.8, z0 + 0.3], 0xfdfcfa, { e1: 0.62, e2: 0.25, pinch: 0.6, rx: -0.5, noise: 0.006, seed: 24 + i });
  }
  soft(f, o.accentKey || 'velvet', [Math.min(0.56, w * 0.45), 0.3, 0.14], [0, 0.76, z0 + 0.46], o.accentC || LX.rust, { e1: 0.6, e2: 0.25, pinch: 0.5, rx: -0.35, noise: 0.005, seed: 28 });
  f.solid(E, [w + 0.1, 0.66, l + 0.1], [0, 0.33, z0 + l / 2]);
}

/** nightstand: walnut (or painted) with brass cup pull; returns top height */
export function nightstand(E, G, f, o = {}) {
  const w = o.w || 0.5, h = o.h || 0.6, d = o.d || 0.4, key = o.key || 'walnut', c = o.c !== undefined ? o.c : 0xffffff;
  f.box(key, [w, 0.03, d], [0, h - 0.015, d / 2], c, { r: 0.008, grain: 'h' });
  f.box(key, [0.022, h - 0.1, d - 0.02], [-w / 2 + 0.011, 0.07 + (h - 0.1) / 2 - 0.015, d / 2 - 0.01], c, { r: 0.004 });
  f.box(key, [0.022, h - 0.1, d - 0.02], [w / 2 - 0.011, 0.07 + (h - 0.1) / 2 - 0.015, d / 2 - 0.01], c, { r: 0.004 });
  f.box(key, [w - 0.044, 0.02, d - 0.02], [0, 0.08, d / 2 - 0.01], c, { r: 0.002 });
  f.box(key, [w - 0.044, h - 0.12, 0.012], [0, 0.06 + (h - 0.12) / 2, 0.006], c, { r: 0 });
  for (const sx of [-1, 1]) for (const sz of [0, 1]) f.cyl('brass', 0.013, 0.01, 0.07, [sx * (w / 2 - 0.035), 0.035, 0.04 + sz * (d - 0.08)], BRASS, { seg: 12 });
  const r = rng(o.seed || 3);
  bookStack(f, -0.05, 0.09, d / 2, 2, r, { w: 0.24, d: 0.18 });
  vase(f, 0.14, 0.09, d / 2, 'globe', 0xd9cdb8, 0.6);
  drawer(E, G, f, { pos: [0, h - 0.11, d], w: w - 0.048, h: 0.15, depth: d - 0.06, key, color: c, boxKey: 'duo', boxColor: 0xe6dccb, boxH: 0.09,
    draw: (p) => { p.box(key, [w - 0.048, 0.15, 0.02], [0, 0, -0.01], c, { r: 0.005, grain: 'h' }); bcup(p, 0, 0.02, 0, 0.1); },
    contents: (cf) => { cf.box('duo', [0.13, 0.018, 0.18], [-0.08, 0.01, 0], LX.ink, { r: 0.003, slot: 3 }); cf.box('duo', [0.06, 0.012, 0.13], [0.1, 0.006, 0], 0x2a2a2a, { r: 0.004, slot: 5 }); } });
  f.solid(E, [w, h, d], [0, h / 2, d / 2]);
  return h;
}

export function dresser(E, G, f, o = {}) {
  const w = o.w || 1.0, h = o.h || 0.82, d = o.d || 0.48, c = o.c || WHITE, key = 'duo';
  const cols = o.cols || 2, rows = o.rows || 3;
  f.box(o.topKey || 'wood', [w + 0.01, 0.03, d + 0.01], [0, h - 0.015, d / 2], o.topC || OAK, { r: 0.008, grain: 'h' });
  f.box(key, [0.02, h - 0.1, d - 0.02], [-w / 2 + 0.01, 0.07 + (h - 0.1) / 2, d / 2 - 0.01], c, { r: 0.003 });
  f.box(key, [0.02, h - 0.1, d - 0.02], [w / 2 - 0.01, 0.07 + (h - 0.1) / 2, d / 2 - 0.01], c, { r: 0.003 });
  f.box(key, [w - 0.04, 0.02, d - 0.02], [0, 0.08, d / 2 - 0.01], c, { r: 0.002 });
  f.box(key, [w - 0.04, h - 0.1, 0.01], [0, 0.07 + (h - 0.1) / 2, 0.005], c, { r: 0 });
  if (cols > 1) f.box(key, [0.018, h - 0.13, d - 0.03], [0, 0.085 + (h - 0.13) / 2, d / 2 - 0.01], c, { r: 0 });
  f.box(key, [w - 0.02, 0.06, 0.02], [0, 0.04, d - 0.03], c, { r: 0.003 });
  for (const sx of [-1, 1]) for (const sz of [0, 1]) f.cyl('duo', 0.016, 0.012, 0.07, [sx * (w / 2 - 0.04), 0.035, 0.04 + sz * (d - 0.08)], BRASS, { seg: 12, slot: 1 });
  const ih = h - 0.1 - 0.03, gap = 0.004, dw = (w - 0.02) / cols - gap, dh = ih / rows - gap;
  for (let cx = 0; cx < cols; cx++) for (let ry = 0; ry < rows; ry++) {
    const x = -w / 2 + 0.01 + (cx + 0.5) * (w - 0.02) / cols;
    const y = 0.07 + (ry + 0.5) * ih / rows + 0.003;
    const first = ry === rows - 1;
    drawer(E, G, f, {
      pos: [x, y, d], w: dw, h: dh, depth: d - 0.06, key, color: c, boxKey: 'duo', boxColor: 0xe6dccb, boxH: Math.min(dh - 0.04, 0.16),
      draw: (p) => { shaker(p, key, -dw / 2, -dh / 2, dw, dh, 0.02, c, { slab: o.slab }); bpull(p, 0, 0, 0, Math.min(0.16, dw * 0.4), false); },
      contents: !first ? null : (cf, bw) => {
        const n = Math.floor(bw / 0.22);
        for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) cf.box('duo', [0.2, 0.035, 0.26], [-bw / 2 + 0.12 + i * 0.22, 0.02 + k * 0.036, 0], [0xe7e2d8, 0x5d6f7e, 0x2f3a45, 0xb7884a, 0x8c8c86, 0xc7835c][(i * 2 + k) % 6], { r: 0.012, slot: 3 });
      },
    });
  }
  f.solid(E, [w, h, d], [0, h / 2, d / 2]);
  return h;
}

/** reach-in closet with shaker doors, brass knobs and an LED strip that lights when opened. f: back center at floor facing +z */
export function closet(E, G, f, o = {}) {
  const w = o.w || 1.2, h = o.h || 2.1, d = o.d || 0.62, c = o.c || 0xeee8dd;
  const t = 0.02, ft = 0.025;
  f.box('duo', [t, h, d], [-w / 2 + t / 2, h / 2, d / 2], c, { r: 0.002 });
  f.box('duo', [t, h, d], [w / 2 - t / 2, h / 2, d / 2], c, { r: 0.002 });
  f.box('duo', [w, t, d], [0, h - t / 2, d / 2], c, { r: 0.002 });
  f.box('duo', [w - 2 * t, h - t, 0.01], [0, (h - t) / 2, 0.005], 0xe9e2d6, { r: 0 });
  f.box('duo', [w, 0.08, 0.02], [0, h, d + 0.01], c, { r: 0.004 });
  // interior: oak shelf + brass rod + clothes on wood hangers
  const sy = Math.min(h - 0.28, 1.78), ry = sy - 0.08;
  f.box('wood', [w - 2 * t, 0.025, 0.36], [0, sy, 0.18], OAK, { r: 0.003, grain: 'h' });
  f.cyl('brass', 0.014, 0.014, w - 2 * t, [0, ry, d * 0.5], BRASS, { rz: PI / 2, seg: 14 });
  // LED strip under the shelf front (dark until a door opens)
  const led = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xfff0d6, emissiveIntensity: 0, roughness: 0.4 });
  f.withBatch(f.b).box(led, [w - 2 * t - 0.04, 0.006, 0.014], [0, sy - 0.016, 0.33], 0xffffff, { r: 0 });
  const r = rng(o.seed || 9);
  const cols = [0xf1efe9, 0x2f3a45, 0x8ea7b5, 0x5d4a3a, 0xb6a58c, 0x7a2e2a, 0xdedad0, 0x3f5e45, 0x1f1f1f, 0xc9a0a0];
  let x = -w / 2 + 0.07;
  while (x < w / 2 - 0.07) {
    const len = Math.min(ry - 0.15, 0.55 + r() * 0.5), col = cols[(r() * cols.length) | 0], th = 0.03 + r() * 0.03;
    f.torus('brass', 0.016, 0.003, [x, ry + 0.01, d * 0.5], BRASS, { ts: 10, rs: 4, arc: PI * 1.3, ry: PI / 2 });
    f.box('wood', [0.012, 0.02, 0.42], [x, ry - 0.06, d * 0.5], OAK, { r: 0.004 });
    soft(f, 'linen', [th, len, 0.44], [x, ry - 0.07 - len / 2, d * 0.5], col, { e1: 0.4, e2: 0.2, noise: 0.004, nu: 12, nv: 10, seed: (x * 100) | 0 });
    x += th + 0.014 + r() * 0.02;
  }
  for (let i = 0, nb = Math.floor((w - 0.06) / 0.36); i < nb; i++) f.box('linen', [0.32, 0.2, 0.3], [-w / 2 + 0.2 + i * 0.36, sy + 0.112, 0.18], [0xd8cbb0, 0xe9e6df, 0xb9ae9d][i % 3], { r: 0.01 });
  for (let i = 0; i < Math.floor((w - 0.1) / 0.14); i++) f.box('duo', [0.1, 0.09, 0.27], [-w / 2 + 0.1 + i * 0.14, 0.045, d * 0.55], [0x2b2b2b, 0x8a4a22, 0xe6e1d6, 0x2f3a45][i % 4], { r: 0.03, slot: 4 });
  const dw = (w - 2 * t) / 2 - 0.003, dh = h - t - 0.012;
  const doors = [];
  for (const left of [true, false]) doors.push(hinged(E, G, f, {
    pos: [left ? -w / 2 + t : w / 2 - t, 0.012, d + ft], hinge: left ? 'L' : 'R', angle: 1.75, labels: ['פתח ארון בגדים', 'סגור ארון בגדים'],
    draw: (p) => {
      const x0 = left ? 0 : -dw;
      shaker(p, 'duo', x0, 0, dw, dh, ft, c, { frame: 0.09 });
      if (dh > 1.7) p.box('duo', [dw - 0.18, 0.06, ft], [x0 + dw / 2, dh * 0.52, -ft / 2], c, { r: 0.003 });
      const kx = left ? dw - 0.05 : -dw + 0.05;
      bknob(p, kx, Math.min(1.0, dh * 0.55), 0, 0.017);
    },
  }));
  let gl = 0;
  E.anim.tick((dt) => { const tgt = doors.some((s) => s.open) ? 2.2 : 0; gl += (tgt - gl) * Math.min(1, dt * 5); led.emissiveIntensity = gl < 0.01 ? 0 : gl; });
  f.solid(E, [w, h, d + ft], [0, h / 2, (d + ft) / 2]);
}

function bench(E, f, w = 1.2, d = 0.42) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl('walnut', 0.02, 0.014, 0.34, [sx * (w / 2 - 0.06), 0.17, sz * (d / 2 - 0.06)], 0xffffff, { seg: 12 });
  f.box('walnut', [w - 0.02, 0.04, d - 0.04], [0, 0.34, 0], 0xffffff, { r: 0.012, grain: 'h' });
  soft(f, 'boucle', [w, 0.13, d], [0, 0.42, 0], LX.cream, { e1: 0.35, e2: 0.12, flat: 0.5, sagTop: 0.01, noise: 0.004, nu: 30, nv: 10, seed: 41 });
  f.solid(E, [w, 0.48, d], [0, 0.24, 0]);
}

/** arched full-length mirror leaning on a wall (frame: wall face z=0, facing +z) */
function archMirror(E, G, f, x, w, h) {
  const r = w / 2, pts = [];
  for (let i = 0; i <= 20; i++) { const a = PI * i / 20; pts.push([x + r * Math.cos(a), h - r + r * Math.sin(a), 0]); }
  const outline = [[x + r, 0.04, 0], ...pts, [x - r, 0.04, 0]];
  const lean = 0.08;
  const L = f.sub(0, 0, lean, 0, -Math.atan2(lean, h)); // tilt top back toward the wall
  tube(L, 'brass', outline.map(([a, b]) => [a, b, 0.035]), 0.012, BRASS, { tseg: 48, rs: 8 });
  L.plate('mirror', [[x - r + 0.01, 0.05], [x + r - 0.01, 0.05], ...pts.slice(1, -1).map(([a, b]) => [x + (a - x) * 0.97, 0.05 + (b - 0.05) * 0.995])], [], 0.04, 0.006, 0xffffff, { curve: 24 });
  L.box('wood', [w, 0.02, 0.05], [x, 0.03, 0.02], OAK, { r: 0.006 });
}

// ------------------------------------------------------------------ TV
function tvTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 288;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const slides = [
    { t: '3351 Eakin Rd — אחרי שיפוץ', s: 'Columbus, Ohio 43204', c: ['#1f3a5f', '#3b6e8f'] },
    { t: '4 חדרי שינה · 2 חדרי רחצה', s: 'Cape Cod 1956 — שיפוץ יוקרה מלא', c: ['#34483c', '#7b8f6a'] },
    { t: 'מטבח ירוק עמוק ושיש קלקטה', s: 'פליז מוברש · מקרר משולב · כיריים מקצועיות', c: ['#283a30', '#a08a5a'] },
    { t: 'מרתף בילוי', s: 'ביליארד · בר · כביסה', c: ['#4a3324', '#a45a3c'] },
  ];
  let last = -1;
  const draw = (time) => {
    const g = c.getContext('2d'), i = Math.floor(time / 6) % slides.length, sl = slides[i];
    const sec = Math.floor(time);
    if (sec === last) return false; last = sec;
    const grd = g.createLinearGradient(0, 0, 512, 288); grd.addColorStop(0, sl.c[0]); grd.addColorStop(1, sl.c[1]);
    g.fillStyle = grd; g.fillRect(0, 0, 512, 288);
    g.globalAlpha = 0.12; g.fillStyle = '#ffffff';
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc((k * 130 + time * 12) % 600 - 40, 60 + k * 45, 30 + k * 8, 0, PI * 2); g.fill(); }
    g.globalAlpha = 1;
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.moveTo(256 - 38, 92); g.lineTo(256, 58); g.lineTo(256 + 38, 92); g.stroke();
    g.strokeRect(256 - 28, 92, 56, 40); g.fillStyle = '#ffffff'; g.fillRect(250, 112, 12, 20);
    g.direction = 'rtl'; g.textAlign = 'center'; g.fillStyle = '#ffffff';
    g.font = 'bold 30px "Segoe UI", Arial, sans-serif'; g.fillText(sl.t, 256, 180);
    g.font = '19px "Segoe UI", Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(sl.s, 256, 212);
    const d = new Date(); const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0'), ss = String(d.getSeconds()).padStart(2, '0');
    g.direction = 'ltr'; g.textAlign = 'left'; g.font = 'bold 18px monospace'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillText(`${hh}:${mm}:${ss}`, 16, 30);
    g.textAlign = 'right'; g.font = '14px sans-serif'; g.fillText('LIVE TOUR', 496, 30);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(16, 262, 480, 4); g.fillStyle = '#ffffff'; g.fillRect(16, 262, 480 * ((time % 6) / 6), 4);
    for (let k = 0; k < slides.length; k++) { g.beginPath(); g.arc(256 - 30 + k * 20, 245, 4, 0, PI * 2); g.fillStyle = k === i ? '#fff' : 'rgba(255,255,255,0.4)'; g.fill(); }
    return true;
  };
  return { tex, draw };
}

function buildTV(E, G, f) {
  const W = 1.12, Hh = 0.65;
  f.box('matte', [W, Hh, 0.026], [0, 1.25, 0.045], 0x101112, { r: 0.004 });
  f.box('brass', [W, 0.006, 0.02], [0, 1.25 - Hh / 2 - 0.003, 0.05], BRASS, { r: 0.002 });
  f.box('matte', [0.3, 0.3, 0.03], [0, 1.25, 0.015], 0x222222, { r: 0.004 });
  const { tex, draw } = tvTexture();
  const onM = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.016, Hh - 0.016), E.M.screenOff);
  f.place(screen, [0, 1.25, 0.0585]); G.add(screen);
  const st = { on: false, t: 0 };
  E.interact(screen, () => (st.on ? 'כבה טלוויזיה' : 'הדלק טלוויזיה'), () => {
    st.on = !st.on; E.snd.click(screen, 0.6);
    if (st.on) { st.t = 0; draw(0); tex.needsUpdate = true; screen.material = onM; E.snd.tone(screen, { freq: 15600, dur: 0.4, vol: 0.01 }); E.snd.tone(screen, { freq: 523, dur: 0.25, vol: 0.06, delay: 0.1 }); E.snd.tone(screen, { freq: 784, dur: 0.35, vol: 0.06, delay: 0.3 }); }
    else screen.material = E.M.screenOff;
  });
  E.anim.tick((dt) => { if (!st.on) return; st.t += dt; if (draw(st.t)) tex.needsUpdate = true; });
}

// ------------------------------------------------------------------ bedrooms (main floor)
export function buildBedroomsMain(E, G0) {
  const F0 = E.plan.mainFloor;
  // ---------- BED 1 (front-left): sage velvet headboard, walnut, linen drapes on both windows
  {
    const G = roomGroup(G0, 'bed1'), B = new Batch(), root = B.root;
    bed(E, root.sub(1.75, F0, 3.413, 0), { w: 1.52, l: 2.03, headH: 1.4, headC: LX.sage, duvetC: LX.ivory, throwC: LX.oat, accentC: LX.rust, euroC: 0xe4dccd });
    for (const [x, pt] of [[0.7, true], [2.8, false]]) {
      const ns = root.sub(x, F0, 3.413, 0);
      const h = nightstand(E, G, ns, { seed: x * 10 | 0 });
      tableLampLux(E, G, ns.sub(-0.04, h, 0.2), { room: 'bed1', floor: 'main', point: pt, intensity: 14, kind: 'gourd', baseC: 0xe9e3d8 });
    }
    dresser(E, G, root.sub(0.64, F0, 7.19, PI), { w: 1.0, h: 0.82, d: 0.48, c: LX.greige, topC: OAK, cols: 2, rows: 3 });
    const dtop = root.sub(0.64, F0 + 0.82, 7.19, PI);
    vase(dtop, 0.28, 0, 0.24, 'amphora', 0xe9e3d8, 1.0); branches(dtop, 0.28, 0.3, 0.24, 0.45, rng(31), 5);
    bookStack(dtop, -0.2, 0, 0.24, 3, rng(32), { w: 0.26, d: 0.2 }); candle(dtop, -0.2, 0.08, 0.24, 0.1, 0.03);
    artLux(root.sub(0.64, F0, 7.19, PI), 3, 0, 1.52, 0, 0.6, 0.75, { key: 'wood', fc: OAK });
    closet(E, G, root.sub(3.598, F0, 6.2, -PI / 2), { w: 1.6, h: 2.1, d: 0.62, seed: 13 });
    rugLux(root, 2.6, 2.3, [1.75, F0, 5.0], 0xcfc6b6);
    bench(E, root.sub(1.75, F0, 5.86, 0), 1.2, 0.4);
    plant(root, 'fiddle', [3.3, F0, 3.75], rng(33), 0.95);
    archMirror(E, G, root.sub(0.125, F0, 6.35, PI / 2), 0, 0.56, 1.75);
    // drapes: front (S) and side (W) windows
    curtains(E, G, root.sub(1.83, F0, 7.19, PI), root.sub(1.83, F0, 7.19, PI), { w: 1.1, top: 2.2, ext: 0.12, z: 0.11, color: LX.linen });
    curtains(E, G, root.sub(0.125, F0, 5.4, PI / 2), root.sub(0.125, F0, 5.4, PI / 2), { w: 0.9, top: 2.2, ext: 0.12, z: 0.11, color: LX.linen });
    E.switchAt(G, root.sub(3.598, F0, 4.1, -PI / 2), 'bed1', [0, 1.2, 0]);
    B.build(G, E.M, { name: 'bed1' });
  }
  // ---------- BED 2 (back-left): ink-blue headboard, painted greige, oak
  {
    const G = roomGroup(G0, 'bed2'), B = new Batch(), root = B.root;
    bed(E, root.sub(1.5, F0, 3.293, PI), { w: 1.37, l: 1.91, headH: 1.25, headC: LX.ink, duvetC: LX.ivory, throwC: 0xc28d5f, accentC: 0xd9b26a, euroC: 0xd9d2c4 });
    for (const x of [0.53, 2.47]) {
      const ns = root.sub(x, F0, 3.293, PI);
      const h = nightstand(E, G, ns, { w: 0.46, key: 'wood', c: OAK, seed: x * 10 | 0 });
      tableLampLux(E, G, ns.sub(0, h, 0.2), { room: 'bed2', floor: 'main', point: false, kind: 'sphere', baseC: 0x34483c });
    }
    closet(E, G, root.sub(3.024, F0, 0.125, 0), { w: 1.148, h: 2.1, d: 0.62, seed: 17 });
    dresser(E, G, root.sub(0.125, F0, 0.7, PI / 2), { w: 0.9, h: 0.82, d: 0.46, c: 0x8d9a8a, topC: OAK, cols: 2, rows: 3 });
    const d2 = root.sub(0.125, F0 + 0.82, 0.7, PI / 2);
    vase(d2, 0.25, 0, 0.22, 'bottle', 0x2f3a33, 0.9); bookStack(d2, -0.2, 0, 0.22, 3, rng(41), { w: 0.24, d: 0.18 });
    // round brass mirror above the dresser
    const MW = root.sub(0.125, F0, 0.7, PI / 2);
    MW.torus('brass', 0.34, 0.012, [0, 1.48, 0.025], BRASS, { ts: 64, rs: 10 });
    try { mirrorDisc(E, G, MW, [0, 1.48, 0.024], 0.335, { noReflector: true }); } catch (e) { }
    rugLux(root, 2.2, 2.0, [1.5, F0, 1.95], 0xb9ad99);
    bench(E, root.sub(1.5, F0, 0.95, PI), 1.1, 0.36);
    artLux(root.sub(1.5, F0, 3.293, PI), 5, 0, 1.75, 0, 0.9, 0.5, { key: 'brass', fc: BRASS, fw: 0.015, fd: 0.035 });
    plant(root, 'snake', [0.85, F0, 0.6], rng(43), 0.9);
    curtains(E, G, root.sub(1.83, F0, 0.125, 0), root.sub(1.83, F0, 0.125, 0), { w: 1.1, top: 2.2, ext: 0.12, z: 0.11, sides: ['L'], endPad: 0.02, color: LX.linen });
    curtains(E, G, root.sub(0.125, F0, 1.7, PI / 2), root.sub(0.125, F0, 1.7, PI / 2), { w: 0.9, top: 2.2, ext: 0.12, z: 0.11, sides: ['L'], endPad: 0.02, color: LX.linen });
    E.switchAt(G, root.sub(3.598, F0, 2.2, -PI / 2), 'bed2', [0, 1.2, 0]);
    B.build(G, E.M, { name: 'bed2' });
  }
}

// ------------------------------------------------------------------ bedrooms (upper floor, sloped ceilings)
export function buildBedroomsUpper(E, G0) {
  const P = E.plan, F2 = P.upperFloor;
  // ---------- BED 3 (west, queen) — head against the south knee wall
  {
    const G = roomGroup(G0, 'bed3'), B = new Batch(), root = B.root;
    bed(E, root.sub(1.4, F2, 5.77, PI), { w: 1.52, l: 2.03, headH: 1.1, headC: 0xc9b9a4, headKey: 'boucle', duvetC: LX.ivory, throwC: 0x7a2e2a, accentC: 0x7a8b6a, euroC: 0xd9d2c4 });
    for (const x of [0.38, 2.42]) {
      const ns = root.sub(x, F2, 5.77, PI);
      const h = nightstand(E, G, ns, { w: 0.45, h: 0.55, seed: x * 10 | 0 });
      tableLampLux(E, G, ns.sub(0, h, 0.2), { room: 'bed3', floor: 'upper', point: false, h: 0.46, sr: 0.15, kind: 'column' });
    }
    dresser(E, G, root.sub(0.125, F2, 2.5, PI / 2), { w: 0.9, h: 0.78, d: 0.45, c: LX.cream, topC: OAK, cols: 2, rows: 2 });
    const d3 = root.sub(0.125, F2 + 0.78, 2.5, PI / 2);
    vase(d3, 0.25, 0, 0.22, 'globe', 0xb48a5a, 0.8, 'clay'); bookStack(d3, -0.2, 0, 0.22, 2, rng(43), { w: 0.22, d: 0.17 });
    artLux(root.sub(0.125, F2, 2.5, PI / 2), 2, 0, 1.2, 0, 0.55, 0.36, { key: 'wood', fc: OAK, fw: 0.02 });
    closet(E, G, root.sub(3.902, F2, 4.85, -PI / 2), { w: 0.8, h: 1.5, d: 0.58, seed: 29 });
    rugLux(root, 2.4, 1.8, [1.4, F2, 4.4], 0xd6cdbb);
    bench(E, root.sub(1.4, F2, 3.37, 0), 0.95, 0.32);
    plant(root, 'fiddle', [0.42, F2, 4.78], rng(51), 0.8);
    curtains(E, G, root.sub(0.125, F2, 3.66, PI / 2), root.sub(0.125, F2, 3.66, PI / 2), { w: 0.95, top: 2.08, ext: 0.12, z: 0.11, color: LX.linen, floor: 'upper' });
    E.switchAt(G, root.sub(3.902, F2, 4.33, -PI / 2), 'bed3', [0, 1.2, 0]);
    B.build(G, E.M, { name: 'bed3' });
  }
  // ---------- BED 4 (east, twin + study)
  {
    const G = roomGroup(G0, 'bed4'), B = new Batch(), root = B.root;
    bed(E, root.sub(8.0, F2, 5.77, PI), { w: 0.99, l: 1.91, headH: 1.05, headC: 0x6f7d6a, duvetC: LX.ivory, throwC: 0xd8b26e, accentC: LX.rust, euro: false });
    { const ns = root.sub(8.75, F2, 5.77, PI); const h = nightstand(E, G, ns, { w: 0.45, h: 0.55, key: 'wood', c: OAK, seed: 87 });
      tableLampLux(E, G, ns.sub(0, h, 0.2), { room: 'bed4', floor: 'upper', point: false, h: 0.44, sr: 0.14, kind: 'gourd', baseC: 0x2f3a45 }); }
    // walnut writing desk under the north knee wall with brass details
    const D = root.sub(7.0, F2, 1.524, 0), dw = 1.4, dd = 0.6, dh = 0.75;
    D.box('walnut', [dw, 0.035, dd], [0, dh - 0.0175, dd / 2], 0xffffff, { r: 0.008, grain: 'h' });
    D.box('brass', [0.035, dh - 0.035, 0.035], [-dw / 2 + 0.04, (dh - 0.035) / 2, 0.05], BRASS, { r: 0.008 });
    D.box('brass', [0.035, dh - 0.035, 0.035], [-dw / 2 + 0.04, (dh - 0.035) / 2, dd - 0.05], BRASS, { r: 0.008 });
    D.box('walnut', [0.42, dh - 0.035, dd - 0.02], [dw / 2 - 0.22, (dh - 0.035) / 2, (dd - 0.02) / 2], 0xffffff, { r: 0.005 });
    drawer(E, G, D, { pos: [dw / 2 - 0.22, dh - 0.13, dd], w: 0.4, h: 0.16, depth: 0.5, key: 'walnut', color: 0xffffff, boxKey: 'duo', boxColor: 0xe6dccb, boxH: 0.1,
      draw: (p) => { p.box('walnut', [0.4, 0.16, 0.02], [0, 0, -0.01], 0xffffff, { r: 0.004, grain: 'h' }); bcup(p, 0, 0.02, 0, 0.1); },
      contents: (cf) => { for (let i = 0; i < 4; i++) cf.cyl('plastic', 0.005, 0.005, 0.15, [-0.1 + i * 0.03, 0.006, 0], [0x2a62c9, 0xd9443a, 0x1b1b1b, 0x27ae60][i], { rx: PI / 2, seg: 6 }); cf.box('paint', [0.21, 0.01, 0.3], [0.07, 0.006, 0], 0xf5f3ee, { r: 0 }); } });
    drawer(E, G, D, { pos: [dw / 2 - 0.22, (dh - 0.21) / 2 + 0.01, dd], w: 0.4, h: dh - 0.25, depth: 0.5, key: 'walnut', color: 0xffffff, boxKey: 'duo', boxColor: 0xe6dccb, boxH: 0.3,
      draw: (p) => { p.box('walnut', [0.4, dh - 0.25, 0.02], [0, 0, -0.01], 0xffffff, { r: 0.004 }); bcup(p, 0, (dh - 0.25) / 2 - 0.05, 0, 0.1); },
      contents: (cf) => { for (let i = 0; i < 3; i++) cf.box('paint', [0.3, 0.24, 0.03], [0, 0.12, -0.15 + i * 0.05], [0x2e4a62, 0xb7884a, 0x8c8c86][i], { r: 0.003 }); } });
    D.box('satin', [0.33, 0.012, 0.23], [-0.15, dh + 0.006, 0.33], 0x9da3a8, { r: 0.004 });
    D.box('satin', [0.33, 0.22, 0.01], [-0.15, dh + 0.11, 0.21], 0x9da3a8, { r: 0.004, rx: -0.25 });
    D.box('gloss', [0.31, 0.19, 0.002], [-0.15, dh + 0.11, 0.217], 0x101418, { r: 0, rx: -0.25 });
    bookStack(D, -0.52, dh, 0.14, 3, rng(61), { w: 0.22, d: 0.17 });
    mug(D, 0.1, dh, 0.42, 0xd9c3a3, 0.4);
    tableLampLux(E, G, D.sub(0.28, dh, 0.16), { room: 'bed4', floor: 'upper', point: false, h: 0.36, sr: 0.1, kind: 'sphere', baseC: 0x1b1b1b, shadeC: 0xe9e4da });
    // bouclé desk chair on brass legs
    const CH = root.sub(7.0, F2, 2.35, PI);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) CH.cyl('brass', 0.014, 0.011, 0.44, [sx * 0.2, 0.22, sz * 0.19], BRASS, { seg: 10, rz: sx * 0.06, rx: -sz * 0.06 });
    soft(CH, 'boucle', [0.5, 0.11, 0.48], [0, 0.48, 0], LX.cream, { e1: 0.4, e2: 0.18, flat: 0.5, noise: 0.004, seed: 51 });
    soft(CH, 'boucle', [0.52, 0.36, 0.13], [0, 0.75, -0.2], LX.cream, { e1: 0.5, e2: 0.3, bend: 0.32, rx: -0.12, noise: 0.004, seed: 52 });
    E.box(6.3, 7.7, 1.524, 2.124, F2, F2 + dh);
    closet(E, G, root.sub(5.546, F2, 4.65, PI / 2), { w: 1.0, h: 1.58, d: 0.6, seed: 37 });
    dresser(E, G, root.sub(9.019, F2, 2.45, -PI / 2), { w: 0.9, h: 0.78, d: 0.45, c: 0x5d6f7e, topC: OAK, cols: 2, rows: 2 });
    plant(root.sub(9.019, F2 + 0.78, 2.45, -PI / 2), 'bushy', [0.25, 0, 0.22], rng(63), 0.55);
    artLux(root.sub(9.019, F2, 2.45, -PI / 2), 6, 0, 1.15, 0, 0.5, 0.36, { key: 'brass', fc: BRASS, fw: 0.012, fd: 0.03 });
    rugLux(root, 2.0, 1.6, [7.4, F2, 3.7], 0x9aa48f);
    plant(root, 'fiddle', [6.62, F2, 5.4], rng(67), 0.7);
    curtains(E, G, root.sub(9.019, F2, 3.66, -PI / 2), root.sub(9.019, F2, 3.66, -PI / 2), { w: 0.95, top: 2.08, ext: 0.12, z: 0.11, color: LX.linen, floor: 'upper' });
    E.switchAt(G, root.sub(5.546, F2, 3.95, PI / 2), 'bed4', [0, 1.2, 0]);
    B.build(G, E.M, { name: 'bed4' });
  }
}

// ------------------------------------------------------------------ living + dining
export function buildLiving(E, G, top, buildRadio) {
  const F0 = E.plan.mainFloor, B = new Batch(), root = B.root;
  // olive tree in terracotta (west wall, north of the TV console; replaces the V1 bookshelf)
  { const OT = root.sub(5.98, F0, 4.38, 0); oliveTree(OT, rng(71), { s: 0.8, h: 1.75, leaves: 300, spread: 0.68 }); E.box(5.78, 6.12, 4.21, 4.55, F0, F0 + 0.4); }
  // walnut media console (z 4.62..6.02) with fluted doors + brass
  const C = root.sub(5.546, F0, 5.32, PI / 2), cw = 1.4, cd = 0.42, ch = 0.55;
  C.box('walnut', [cw, 0.03, cd], [0, ch - 0.015, cd / 2], 0xffffff, { r: 0.008, grain: 'h' });
  C.box('walnut', [cw, 0.02, cd - 0.02], [0, 0.13, cd / 2 - 0.01], 0xffffff, { r: 0.002 });
  for (const x of [-cw / 2 + 0.01, -0.22, 0.22, cw / 2 - 0.01]) C.box('walnut', [0.02, ch - 0.15, cd - 0.02], [x, 0.14 + (ch - 0.15) / 2, cd / 2 - 0.01], 0xffffff, { r: 0.002 });
  C.box('walnut', [cw - 0.04, ch - 0.15, 0.01], [0, 0.14 + (ch - 0.15) / 2, 0.005], 0xffffff, { r: 0 });
  C.box('walnut', [0.42, 0.015, cd - 0.04], [0, 0.31, cd / 2], 0xffffff, { r: 0 });
  C.box('brass', [cw - 0.02, 0.012, 0.012], [0, 0.125, cd - 0.004], BRASS, { r: 0.004 });
  for (const sx of [-1, 1]) for (const sz of [0, 1]) C.cyl('brass', 0.016, 0.012, 0.12, [sx * (cw / 2 - 0.06), 0.06, 0.06 + sz * (cd - 0.12)], BRASS, { seg: 12 });
  C.box('satin', [0.36, 0.06, 0.24], [0, 0.17, 0.22], 0x1a1a1a, { r: 0.006 });
  C.box('led', [0.01, 0.006, 0.002], [0.14, 0.17, 0.341], 0x44ff88, { r: 0 });
  bookStack(C, -0.08, 0.3175, 0.2, 3, rng(73), { w: 0.26, d: 0.2 });
  C.box('satin', [0.9, 0.07, 0.08], [0, ch + 0.035, 0.1], 0x202122, { r: 0.02 });
  for (const left of [true, false]) {
    const dwid = 0.47;
    hinged(E, G, C, {
      pos: [left ? -cw / 2 + 0.02 : cw / 2 - 0.02, 0.145, cd], hinge: left ? 'L' : 'R', angle: 1.7, labels: ['פתח דלת מזנון', 'סגור דלת מזנון'],
      draw: (p) => {
        const x0 = left ? 0 : -dwid;
        p.box('walnut', [dwid - 0.004, ch - 0.18, 0.012], [x0 + dwid / 2, (ch - 0.18) / 2, -0.012], 0xffffff, { r: 0.003 });
        fluted(p, 'walnut', x0 + 0.004, 0.004, dwid - 0.012, ch - 0.188, -0.004, 0xffffff, { pitch: 0.024 });
        bknob(p, left ? dwid - 0.04 : -dwid + 0.04, (ch - 0.18) / 2, 0.006, 0.014);
      },
    });
  }
  for (let i = 0; i < 3; i++) C.box('duo', [0.3, 0.06, 0.3], [-0.45, 0.16 + i * 0.065, 0.2], [0x34483c, 0xb9a88f, 0x2b3640][i], { r: 0.004 });
  for (let i = 0; i < 4; i++) C.box('linen', [0.04, 0.3, 0.26], [0.32 + i * 0.05, 0.3, 0.2], [0x3f2a1f, 0xd9cdb8, 0x2e4a62, 0x8a6a48][i], { r: 0.004 });
  C.solid(E, [cw, ch, cd], [0, ch / 2, cd / 2]);
  { const r = rng(76); vase(C, -0.56, ch, 0.24, 'amphora', 0xe9e3d8, 0.9); branches(C, -0.56, ch + 0.26, 0.24, 0.4, r, 5); vase(C, 0.55, ch, 0.22, 'globe', 0x2f3a33, 0.7); candle(C, 0.42, ch, 0.28, 0.12, 0.03); }
  buildTV(E, G, root.sub(5.546, F0, 5.32, PI / 2));
  // curved bouclé sofa floated off the east wall (window drapes behind), facing west
  curvedSofa(E, root.sub(8.85, F0, 5.6, -PI / 2), { len: 1.8, d: 1.0, R: 2.5, c: 0xf0ebe1, throwC: LX.oat,
    pillows: [[-0.6, LX.rust, 'velvet', 0.15], [0.62, 0x6f7d6a, 'velvet', -0.15], [0.35, 0xe2d8c6, 'linen', -0.1]] });
  // cognac leather lounge chair
  loungeChair(E, root.sub(7.22, F0, 6.48, -2.72), { c: LX.cognac });
  // travertine stadium coffee table (z 4.87..5.97)
  {
    const CT = root.sub(7.15, F0, 5.42, PI / 2), tl = 1.1, tw = 0.62, th = 0.38;
    const stadium = (L, W2, n = 14) => { const pts = [], r = W2 / 2; for (let i = 0; i <= n; i++) { const a = -PI / 2 + PI * i / n; pts.push([L / 2 - r + Math.cos(a) * r, Math.sin(a) * r]); } for (let i = 0; i <= n; i++) { const a = PI / 2 + PI * i / n; pts.push([-L / 2 + r + Math.cos(a) * r, Math.sin(a) * r]); } return pts; };
    CT.slab('travertine', stadium(tl, tw), [], th, 0.06, 0xffffff, { bevel: 0.006 });
    CT.slab('travertine', stadium(tl * 0.62, tw * 0.62), [], th - 0.06, th - 0.07, 0xf2ece2, { bevel: 0.004 });
    const r = rng(75);
    bookStack(CT, 0.24, th, 0.02, 3, r, { w: 0.3, d: 0.24, colors: [0xe8e1d4, 0x34483c, 0xc9b79c] });
    vase(CT, -0.3, th, 0.0, 'bowl', BRASS, 1.0, 'brass');
    vase(CT, -0.08, th, -0.05, 'globe', 0xe9e3d8, 0.7); branches(CT, -0.08, th + 0.15, -0.05, 0.3, r, 4);
    candle(CT, 0.0, th, 0.12, 0.08, 0.035);
    CT.solid(E, [tl, th, tw], [0, th / 2, 0]);
  }
  rugLux(root, 2.6, 3.0, [7.35, F0, 5.5], 0xd9d1c2);
  // end table (travertine drum) + vintage radio
  const ET = root.sub(8.65, F0, 6.84, -PI / 2);
  ET.cyl('travertine', 0.185, 0.185, 0.56, [0, 0.28, 0], 0xffffff, { seg: 40 });
  ET.cyl('travertine', 0.19, 0.19, 0.02, [0, 0.57, 0], 0xf5efe5, { seg: 40 });
  E.box(8.46, 8.84, 6.65, 7.03, F0, F0 + 0.58);
  if (buildRadio) { try { buildRadio(E, G, root.sub(8.65, F0 + 0.58, 6.84, -PI / 2)); } catch (e) { console.warn('[interior] radio failed', e); } }
  // sculptural floor lamp: travertine base, brass stem, opal globe (real light)
  {
    const FL = root.sub(7.95, F0, 6.85, 0);
    FL.cyl('travertine', 0.15, 0.16, 0.05, [0, 0.025, 0], 0xffffff, { seg: 36 });
    FL.cyl('brass', 0.011, 0.011, 1.38, [0, 0.74, 0], BRASS, { seg: 12 });
    FL.torus('brass', 0.05, 0.006, [0, 1.42, 0], BRASS, { rx: PI / 2, ts: 24, rs: 6 });
    const [shadeM, bulbM] = lampMats({});
    const g = new THREE.Group(); FL.place(g, [0, 1.6, 0]); G.add(g);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 40, 24), shadeM); globe.castShadow = false; g.add(globe);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), bulbM); g.add(bulb);
    const lamp = E.lamp({ room: 'living', floor: 'main', group: g, pos: FL.pt(0, 1.6, 0), mats: [shadeM, bulbM], point: true, intensity: 26, emissive: [1.4, 3] });
    E.interact(g, () => (lamp.on ? 'כבה מנורת רצפה' : 'הדלק מנורת רצפה'), () => { lamp.set(!lamp.on); E.snd.switchClick(g); });
    E.box(7.8, 8.1, 6.7, 7.0, F0, F0 + 1.8);
  }
  // dining: Calacatta round top on an oak pedestal, upholstered barrel chairs
  const DT = root.sub(8.15, F0, 3.85, 0);
  DT.cyl('marble', 0.47, 0.47, 0.035, [0, 0.7425, 0], 0xffffff, { seg: 64 });
  DT.lathe('wood', [[0, 0], [0.3, 0], [0.3, 0.025], [0.2, 0.05], [0.11, 0.2], [0.09, 0.45], [0.13, 0.66], [0.22, 0.715], [0, 0.725]], [0, 0, 0], OAK, { seg: 40 });
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + i * PI / 2, g = DT.sub(Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52, -a - PI / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl('wood', 0.016, 0.012, 0.42, [sx * 0.17, 0.21, sz * 0.17], OAK, { seg: 10, rz: sx * 0.05, rx: -sz * 0.05 });
    soft(g, 'linen', [0.46, 0.1, 0.44], [0, 0.47, 0.01], 0xe2d8c6, { e1: 0.4, e2: 0.18, flat: 0.5, sagTop: 0.01, noise: 0.003, seed: 60 + i });
    soft(g, 'linen', [0.5, 0.34, 0.12], [0, 0.72, -0.19], 0xe2d8c6, { e1: 0.5, e2: 0.25, bend: 0.3, rx: -0.12, noise: 0.004, seed: 64 + i });
  }
  lemons(DT, 0, 0.76, 0, rng(78), 6);
  E.box(7.5, 8.8, 3.23, 4.47, F0, F0 + 0.8);
  if (top) {
    try { pendant(E, top, { x: 8.15, z: 3.85, floor: 'main', room: 'living', ceilY: E.plan.mainCeil, y: F0 + 1.55, style: 'tiered', point: true, intensity: 30, emissive: [1.3, 3], labels: ['הדלק מנורת אוכל', 'כבה מנורת אוכל'] }); }
    catch (e) { console.warn('[interior] dining pendant', e); }
  }
  // large abstract canvas above the dining table (north wall)
  artLux(root.sub(8.42, F0, 3.108, 0), 0, 0, 1.68, 0, 0.86, 1.12, { key: 'wood', fc: OAK, fw: 0.025 });
  // linen drapes: picture window (S) and side window (E, stacks south)
  curtains(E, G, root.sub(7.7, F0, 7.19, PI), root.sub(7.7, F0, 7.19, PI), { w: 2.1, top: 2.24, ext: 0.12, z: 0.085, color: LX.linen, stack: 0.22, openZ: 1.35 });
  curtains(E, G, root.sub(9.019, F0, 5.2, -PI / 2), root.sub(9.019, F0, 5.2, -PI / 2), { w: 1.2, top: 2.24, ext: 0.12, z: 0.085, sides: ['R'], endPad: 0.03, color: LX.linen });
  E.switchAt(G, root.sub(5.72, F0, 3.108, 0), 'living', [0, 1.2, 0]);
  B.build(G, E.M, { name: 'living' });
}

