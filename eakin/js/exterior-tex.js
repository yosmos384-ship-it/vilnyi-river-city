// exterior-tex.js — procedural CanvasTextures + materials for the exterior.
import * as THREE from 'three';
import { makeCanvas, canvasTex, wrapDraw, noisePixels, rgb, mulberry32, clamp, ctx2dOf, normalFromHeight, fbm } from './exterior-util.js';

// every exterior canvas may be read back (noise passes, Sobel normal maps) → ask for a readback-friendly context
function ctx2d(c) { return ctx2dOf(c, true); }
// absolute-value noise layer computed at low resolution and upscaled (smooth) onto g — ~16× cheaper than per-pixel fbm
function noiseUp(g, size, low, seed, scale, cb) {
  if (!g) return;
  const lo = makeCanvas(low, low), lg = ctx2d(lo);
  if (!lg) { noisePixels(g, size, seed, scale, cb); return; }
  noisePixels(lg, low, seed, scale, cb);
  try { g.imageSmoothingEnabled = true; g.drawImage(lo, 0, 0, size, size); } catch (e) { /* ignore */ }
}

// ---------- grass (tile 2.5 m): low-res noise base upscaled + thousands of multi-tone blade strokes ----------
function paintGrass(size = 512) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(11);
  g.fillStyle = '#4a7230'; g.fillRect(0, 0, size, size);
  // mottled base computed at 128 px, upscaled (cheap, smooth macro variation)
  const lo = makeCanvas(128, 128), lg = ctx2d(lo);
  if (lg) {
    noisePixels(lg, 128, 3, 4, (n, i, d, x, y) => {
      const m = fbm((x / 128) * 12, (y / 128) * 12, 8, 2, 12);
      const k = 0.72 + n * 0.5, dry = clamp((m - 0.55) * 3, 0, 1);
      d[i] = clamp(64 * k + dry * 40, 0, 255); d[i + 1] = clamp(108 * k + dry * 14, 0, 255); d[i + 2] = clamp(40 * k, 0, 255); d[i + 3] = 255;
    });
    try { g.imageSmoothingEnabled = true; g.drawImage(lo, 0, 0, size, size); } catch (e) { /* ignore */ }
  }
  // dark soil/thatch speckles at the bottom layer
  for (let k = 0; k < size * 6; k++) { g.fillStyle = rgb(38 + r() * 20, 44 + r() * 22, 22, 0.55); g.fillRect(r() * size, r() * size, 1.5, 1.5); }
  const pal = [[52, 88, 30], [76, 120, 42], [96, 140, 52], [66, 106, 36], [118, 152, 66], [44, 76, 28], [134, 160, 80], [88, 128, 40]];
  const n = Math.round(size * size * 0.075);
  for (let k = 0; k < n; k++) {
    const x = r() * size, y = r() * size, L = (3 + r() * 9) * size / 512, a = -Math.PI / 2 + (r() - 0.5) * 1.9;
    const p = pal[(r() * pal.length) | 0], v = 0.85 + r() * 0.3;
    g.strokeStyle = rgb(p[0] * v, p[1] * v, p[2] * v, 0.55 + r() * 0.45); g.lineWidth = (0.7 + r() * 1.3) * size / 512;
    wrapDraw(size, x, y, L, (px, py) => { g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(a) * L * 0.5 + (r() - 0.5) * 2, py + Math.sin(a) * L * 0.5, px + Math.cos(a) * L, py + Math.sin(a) * L); g.stroke(); });
  }
  // sun-catching tips
  for (let k = 0; k < n * 0.12; k++) {
    const x = r() * size, y = r() * size, L = (2 + r() * 4) * size / 512, a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    g.strokeStyle = rgb(160 + r() * 40, 185 + r() * 30, 100, 0.35); g.lineWidth = 0.8 * size / 512;
    wrapDraw(size, x, y, L, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); g.stroke(); });
  }
  // a few clover clusters
  for (let k = 0; k < 90; k++) {
    const x = r() * size, y = r() * size, s = (2 + r() * 2.5) * size / 512;
    g.fillStyle = rgb(58 + r() * 20, 104 + r() * 26, 44, 0.75);
    wrapDraw(size, x, y, s * 2, (px, py) => { for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(px + Math.cos(j * 2.1) * s, py + Math.sin(j * 2.1) * s, s, 0, Math.PI * 2); g.fill(); } });
  }
  return c;
}

// ---------- gravel (tile 2 m) ----------
function paintGravel(size = 512, seed = 21) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(seed);
  g.fillStyle = '#7d756a'; g.fillRect(0, 0, size, size);
  noiseUp(g, size, 128, 5, 8, (n, i, d) => { const v = 95 + n * 60; d[i] = v + 8; d[i + 1] = v + 2; d[i + 2] = v - 8; d[i + 3] = 255; });
  for (let k = 0; k < 9000; k++) {
    const x = r() * size, y = r() * size, rx = 1.5 + r() * 4.5, ry = rx * (0.6 + r() * 0.4), a = r() * Math.PI;
    const t = r(); const base = 95 + r() * 110;
    const col = t < 0.5 ? [base, base * 0.97, base * 0.92] : t < 0.8 ? [base * 1.05, base * 0.95, base * 0.82] : [base * 0.85, base * 0.86, base * 0.9];
    wrapDraw(size, x, y, rx + 2, (px, py) => {
      g.fillStyle = 'rgba(30,26,22,0.45)'; g.beginPath(); g.ellipse(px + 1, py + 1.2, rx, ry, a, 0, Math.PI * 2); g.fill();
      g.fillStyle = rgb(col[0], col[1], col[2]); g.beginPath(); g.ellipse(px, py, rx, ry, a, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,250,0.18)'; g.beginPath(); g.ellipse(px - rx * 0.25, py - ry * 0.3, rx * 0.45, ry * 0.35, a, 0, Math.PI * 2); g.fill();
    });
  }
  return c;
}

// ---------- asphalt with patches & cracks (tile 8 m) ----------
function paintAsphalt(size = 1024) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(31);
  g.fillStyle = '#4a4a4a'; g.fillRect(0, 0, size, size);
  noiseUp(g, size, 256, 7, 10, (n, i, d) => {
    const s = (Math.random() - 0.5) * 20; const v = 62 + n * 34 + s;
    d[i] = v; d[i + 1] = v; d[i + 2] = v + 2; d[i + 3] = 255;
  });
  // fine grain (replaces the old per-pixel random term at full resolution)
  for (let k = 0; k < size * size / 14; k++) { const v = 40 + r() * 60; g.fillStyle = rgb(v, v, v, 0.35); g.fillRect(r() * size, r() * size, 1, 1); }
  // aggregate speckles
  for (let k = 0; k < 16000; k++) {
    const x = r() * size, y = r() * size, v = r() < 0.5 ? 120 + r() * 60 : 30 + r() * 20;
    g.fillStyle = rgb(v, v, v * 0.98, 0.6); g.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  // patches (darker, rectangular, slightly glossy look)
  for (let k = 0; k < 5; k++) {
    const w = 60 + r() * 220, h = 40 + r() * 160, x = r() * size, y = r() * size, dark = 38 + r() * 14;
    wrapDraw(size, x + w / 2, y + h / 2, Math.max(w, h), (px, py) => {
      g.fillStyle = rgb(dark, dark, dark + 2, 0.9); g.fillRect(px - w / 2, py - h / 2, w, h);
      g.strokeStyle = 'rgba(20,20,20,0.9)'; g.lineWidth = 2.5; g.strokeRect(px - w / 2, py - h / 2, w, h);
    });
  }
  // cracks (random walks) + sealed crack lines (tar snakes)
  const crack = (x, y, a, n, tar) => {
    g.strokeStyle = tar ? 'rgba(18,18,18,0.85)' : 'rgba(25,25,25,0.9)';
    g.lineWidth = tar ? 4 + r() * 3 : 1 + r() * 1.3;
    g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < n; i++) {
      a += (r() - 0.5) * 0.9; x += Math.cos(a) * 8; y += Math.sin(a) * 8;
      if (x < 0 || y < 0 || x > size || y > size) break;
      g.lineTo(x, y);
      if (!tar && r() < 0.08) { const sx = x, sy = y; g.stroke(); crack(sx, sy, a + (r() - 0.5) * 2.5, (n - i) * 0.4 | 0, false); g.strokeStyle = 'rgba(25,25,25,0.9)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); }
    }
    g.stroke();
  };
  for (let k = 0; k < 7; k++) crack(r() * size, r() * size, r() * Math.PI * 2, 30 + r() * 50, false);
  for (let k = 0; k < 4; k++) crack(r() * size, r() * size, r() * Math.PI * 2, 30 + r() * 60, true);
  // oil stains
  for (let k = 0; k < 6; k++) {
    const x = r() * size, y = r() * size, rad = 20 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(15,15,18,0.35)'); gr.addColorStop(1, 'rgba(15,15,18,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

// ---------- concrete with control joints every 1 m (tile 2 m) ----------
function paintConcrete(size = 512) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(41);
  noiseUp(g, size, 128, 9, 6, (n, i, d) => { const v = 170 + n * 40 + (Math.random() - 0.5) * 10; d[i] = v; d[i + 1] = v - 1; d[i + 2] = v - 4; d[i + 3] = 255; });
  for (let k = 0; k < 4000; k++) { const v = 110 + r() * 90; g.fillStyle = rgb(v, v, v, 0.35); g.fillRect(r() * size, r() * size, 1.3, 1.3); }
  for (let k = 0; k < 10; k++) {
    const x = r() * size, y = r() * size, rad = 25 + r() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(110,105,95,0.18)'); gr.addColorStop(1, 'rgba(110,105,95,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.fillStyle = 'rgba(70,68,64,0.75)';
  for (const p of [0, size / 2]) { g.fillRect(p, 0, 3, size); g.fillRect(0, p, size, 3); }
  return c;
}

function paintMulch(size = 256) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(51);
  g.fillStyle = '#3d2a1c'; g.fillRect(0, 0, size, size);
  for (let k = 0; k < 2600; k++) {
    const x = r() * size, y = r() * size, L = 3 + r() * 9, a = r() * Math.PI, v = r();
    g.strokeStyle = rgb(70 + v * 70, 44 + v * 40, 26 + v * 22, 0.9); g.lineWidth = 1 + r() * 2.2;
    wrapDraw(size, x, y, L, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); g.stroke(); });
  }
  return c;
}

function paintBark(size = 256, seed = 61) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(seed);
  // vertical furrows: ridged noise stretched along v (texture y = along the branch)
  const low = Math.min(256, size);
  noiseUp(g, size, low, 13 + seed, 4, (n, i, d, x, y) => {
    const u = x / low, v = y / low;
    const warp = fbm(u * 4, v * 4, 77 + seed, 3, 4) * 1.6;
    const ridge = 1 - Math.abs(Math.sin((u * 9 + warp) * Math.PI));
    const plates = fbm(u * 8, v * 8, 91 + seed, 3, 8);
    const h = clamp(0.25 + ridge * 0.55 + (plates - 0.5) * 0.5 + (n - 0.5) * 0.3, 0, 1);
    const k = 40 + h * 78;
    d[i] = k + 10; d[i + 1] = k + 2; d[i + 2] = k - 6; d[i + 3] = 255;
  });
  // deep cracks
  for (let k = 0; k < size * 0.9; k++) {
    const x = r() * size, y = r() * size, L = (10 + r() * 34) * size / 256;
    g.strokeStyle = 'rgba(22,17,13,0.65)'; g.lineWidth = (0.8 + r() * 1.6) * size / 256;
    wrapDraw(size, x, y, L, (px, py) => { g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + (r() - 0.5) * 6, py + L / 2, px + (r() - 0.5) * 4, py + L); g.stroke(); });
  }
  // lichen / moss patches
  for (let k = 0; k < 40; k++) { g.fillStyle = r() < 0.6 ? rgb(118, 128, 98, 0.22) : rgb(80, 98, 52, 0.25); g.beginPath(); g.arc(r() * size, r() * size, (2 + r() * 6) * size / 256, 0, 7); g.fill(); }
  return c;
}

// canopy leaves (opaque)
function paintLeaves(size = 512, seed = 71) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(seed);
  g.fillStyle = '#2f4d22'; g.fillRect(0, 0, size, size);
  for (let k = 0; k < 7000; k++) {
    const x = r() * size, y = r() * size, L = 4 + r() * 8, a = r() * Math.PI * 2, t = r();
    const v = 0.6 + r() * 0.6;
    const col = t < 0.7 ? [52 * v, 90 * v, 36 * v] : t < 0.9 ? [78 * v, 116 * v, 44 * v] : [30 * v, 58 * v, 26 * v];
    wrapDraw(size, x, y, L, (px, py) => {
      g.fillStyle = rgb(col[0], col[1], col[2]); g.beginPath(); g.ellipse(px, py, L, L * 0.45, a, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,220,0.08)'; g.beginPath(); g.ellipse(px - 1, py - 1, L * 0.5, L * 0.2, a, 0, Math.PI * 2); g.fill();
    });
  }
  return c;
}
// alpha leaf-cluster card: a forked twig carrying ~60 individually drawn leaves (ovate, pointed tip, petiole, midrib,
// veins, per-leaf tone + light/dark half). Transparent background → alphaTest cards.
function leafPath(g, L, W) {
  // leaf drawn along +x from the petiole end (0,0) to the tip (L,0)
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(L * 0.18, -W * 0.95, L * 0.62, -W * 1.05, L, 0);
  g.bezierCurveTo(L * 0.62, W * 1.05, L * 0.18, W * 0.95, 0, 0);
  g.closePath();
}
function paintLeafCard(size = 512, seed = 81) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(seed);
  g.clearRect(0, 0, size, size);
  const S = size / 512;
  // twig skeleton: 3 stems fanning up from the bottom centre, each with 4–5 alternating side twigs → dense cluster
  const twigs = [], stems = [];
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k - 1) * 0.62 + (r() - 0.5) * 0.2;
    const len = size * (k === 1 ? 0.86 : 0.66);
    const st = { x0: size * 0.5, y0: size * 0.99, x1: size * 0.5 + Math.cos(a) * len, y1: size * 0.99 + Math.sin(a) * len, main: true };
    stems.push(st); twigs.push(st);
  }
  for (const st of stems) {
    const n = 5;
    for (let k = 0; k < n; k++) {
      const t = 0.22 + (k / n) * 0.72, side = k % 2 ? 1 : -1;
      const bx = st.x0 + (st.x1 - st.x0) * t, by = st.y0 + (st.y1 - st.y0) * t;
      const len = size * (0.16 + r() * 0.1) * (1 - t * 0.3);
      const a0 = Math.atan2(st.y1 - st.y0, st.x1 - st.x0);
      const a = a0 + side * (0.7 + r() * 0.4);
      twigs.push({ x0: bx, y0: by, x1: bx + Math.cos(a) * len, y1: by + Math.sin(a) * len });
    }
  }
  g.lineCap = 'round';
  for (const t of twigs) {
    g.strokeStyle = 'rgba(72,56,40,1)'; g.lineWidth = (t.main ? 3.6 : 2.0) * S;
    g.beginPath(); g.moveTo(t.x0, t.y0); g.quadraticCurveTo((t.x0 + t.x1) / 2 + (r() - 0.5) * 12 * S, (t.y0 + t.y1) / 2, t.x1, t.y1); g.stroke();
  }
  // leaves along every twig, alternating, larger toward the tips; drawn back-to-front (darker first)
  const leaves = [];
  for (const t of twigs) {
    const n = t.main ? 9 : 7;
    const ang = Math.atan2(t.y1 - t.y0, t.x1 - t.x0);
    for (let k = 0; k < n; k++) {
      const f = 0.15 + 0.85 * (k / (n - 1));
      const px = t.x0 + (t.x1 - t.x0) * f, py = t.y0 + (t.y1 - t.y0) * f;
      const side = k % 2 ? 1 : -1;
      const a = ang + side * (0.55 + r() * 0.65) + (r() - 0.5) * 0.3;
      const L = (40 + r() * 22) * S * (0.8 + f * 0.3);
      leaves.push({ px, py, a, L, W: L * (0.38 + r() * 0.12), tone: r(), depth: r() });
    }
    for (let k = 0; k < 3; k++) leaves.push({ px: t.x1, py: t.y1, a: ang + (k - 1) * 0.6, L: (42 + r() * 18) * S, W: 17 * S, tone: r(), depth: r() });
  }
  // fill leaves inside the cluster ellipse so the card reads as a dense mass of foliage
  for (let k = 0; k < 70; k++) {
    const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.42;
    const px = size * (0.5 + Math.cos(ang) * rad), py = size * (0.47 + Math.sin(ang) * rad * 1.05);
    const L = (36 + r() * 22) * S;
    leaves.push({ px, py, a: r() * Math.PI * 2, L, W: L * 0.4, tone: r(), depth: r() * 0.7 });
  }
  leaves.sort((p, q) => p.depth - q.depth);
  for (const lf of leaves) {
    const v = 0.62 + lf.depth * 0.5;
    const base = lf.tone < 0.6 ? [66, 110, 40] : lf.tone < 0.85 ? [92, 132, 48] : [54, 88, 34];
    const col = base.map((ch) => ch * v);
    g.save(); g.translate(lf.px, lf.py); g.rotate(lf.a);
    // petiole
    g.strokeStyle = rgb(80, 92, 44); g.lineWidth = 1.4 * S; g.beginPath(); g.moveTo(0, 0); g.lineTo(lf.L * 0.12, 0); g.stroke();
    g.translate(lf.L * 0.1, 0);
    leafPath(g, lf.L, lf.W);
    g.fillStyle = rgb(col[0], col[1], col[2]); g.fill();
    // lit half / shaded half (leaf fold)
    g.save(); g.clip();
    g.fillStyle = 'rgba(255,255,210,0.10)'; g.fillRect(0, -lf.W * 1.1, lf.L, lf.W * 1.1);
    g.fillStyle = 'rgba(10,25,5,0.14)'; g.fillRect(0, 0, lf.L, lf.W * 1.1);
    // midrib + side veins
    g.strokeStyle = 'rgba(190,210,140,0.45)'; g.lineWidth = 1.0 * S;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(lf.L * 0.95, 0); g.stroke();
    g.lineWidth = 0.6 * S; g.strokeStyle = 'rgba(170,200,120,0.25)';
    for (let k = 1; k < 6; k++) { const x = lf.L * k / 6.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + lf.L * 0.12, -lf.W * 0.7); g.moveTo(x, 0); g.lineTo(x + lf.L * 0.12, lf.W * 0.7); g.stroke(); }
    g.restore();
    // edge darkening
    g.strokeStyle = 'rgba(25,40,15,0.35)'; g.lineWidth = 0.9 * S; leafPath(g, lf.L, lf.W); g.stroke();
    g.restore();
  }
  return c;
}

// chain-link diamond mesh (alpha). Tile = 0.3 m → 6 diamonds of 5 cm
function paintChainLink(size = 128) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  g.clearRect(0, 0, size, size);
  const n = 6, s = size / n;
  g.strokeStyle = 'rgba(205,208,210,1)'; g.lineWidth = 2.6; g.lineCap = 'round';
  for (let i = -n; i <= 2 * n; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s + size, size); g.stroke();
    g.beginPath(); g.moveTo(i * s, size); g.lineTo(i * s + size, 0); g.stroke();
  }
  return c;
}
// lap siding (near white, tinted by vertex colors). Tile 1.2 m vertical = 6 boards
function paintSiding(size = 256) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  noisePixels(g, size, 17, 4, (n, i, d) => { const v = 232 + n * 18; d[i] = v; d[i + 1] = v; d[i + 2] = v - 2; d[i + 3] = 255; });
  const b = size / 6;
  for (let k = 0; k < 6; k++) {
    const y = k * b;
    const gr = g.createLinearGradient(0, y, 0, y + b);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.82, 'rgba(0,0,0,0.04)'); gr.addColorStop(0.93, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = gr; g.fillRect(0, y, size, b);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y, size, 1.5);
  }
  return c;
}
// brick running bond (tile 1.6 m wide x 1.6 m)
function paintBrick(size = 512) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(91);
  g.fillStyle = '#b8b2a6'; g.fillRect(0, 0, size, size);
  const rows = 24, cols = 8, bh = size / rows, bw = size / cols;
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * bw / 2;
    for (let x = -1; x < cols + 1; x++) {
      const v = 0.78 + r() * 0.3, t = r();
      const col = t < 0.1 ? [150, 110, 90] : [205, 160, 125];
      g.fillStyle = rgb(col[0] * v, col[1] * v, col[2] * v);
      g.fillRect(x * bw + off + 1.5, y * bh + 1.5, bw - 3, bh - 3);
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x * bw + off + 1.5, y * bh + bh - 4, bw - 3, 2.5);
    }
  }
  noisePixels(g, size, 19, 16, (n, i, d) => { const k = 0.9 + n * 0.2; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; });
  return c;
}
// asphalt 3-tab shingles (tile 2 m; 14 courses) — light gray, tinted by vertex colors
function paintShingles(size = 512) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(101);
  noisePixels(g, size, 23, 32, (n, i, d) => { const v = 150 + n * 60 + (Math.random() - 0.5) * 40; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; });
  const rows = 14, h = size / rows, tab = size / 6;
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * tab / 2;
    for (let x = -1; x < 7; x++) {
      const vv = 0.88 + r() * 0.22;
      g.fillStyle = `rgba(${vv > 1 ? 255 : 0},${vv > 1 ? 255 : 0},${vv > 1 ? 255 : 0},${Math.abs(1 - vv) * 0.9})`;
      g.fillRect(x * tab + off, y * h, tab, h);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x * tab + off - 1, y * h + h * 0.35, 2.2, h * 0.65);
    }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y * h + h - 3, size, 3);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y * h, size, 2);
  }
  return c;
}
// atlas: street blades, STOP, house number
export const ATLAS = {
  eakin: [0, 0, 512, 100], harris: [0, 100, 512, 100], clime: [0, 200, 512, 100], stop: [0, 300, 212, 212], num: [256, 300, 256, 80], recycle: [256, 390, 256, 64],
};
function paintAtlas() {
  const W = 512; const c = makeCanvas(W, W); const g = ctx2d(c); if (!g) return null;
  g.fillStyle = '#777'; g.fillRect(0, 0, W, W);
  const blade = (rect, text) => {
    const [x, y, w, h] = rect;
    g.fillStyle = '#0d6b3a'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 5; g.strokeRect(x + 7, y + 7, w - 14, h - 14);
    g.fillStyle = '#f7f7f7'; g.font = 'bold 62px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + h / 2 + 4);
  };
  blade(ATLAS.eakin, 'Eakin Rd'); blade(ATLAS.harris, 'Harris Ave'); blade(ATLAS.clime, 'Clime Rd');
  { const [x, y, w, h] = ATLAS.stop, cx = x + w / 2, cy = y + h / 2;
    g.fillStyle = '#b3121b'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath();
    for (let i = 0; i <= 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4, rr = w * 0.44; const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 66px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', cx, cy + 3); }
  { const [x, y, w, h] = ATLAS.num; g.fillStyle = '#111111'; g.fillRect(x, y, w, h);
    const br = g.createLinearGradient(0, y + 10, 0, y + h - 10);
    br.addColorStop(0, '#f3dc96'); br.addColorStop(0.45, '#c9a24a'); br.addColorStop(0.55, '#a87f2c'); br.addColorStop(1, '#e2c070');
    g.fillStyle = br; g.font = 'bold 62px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('3351', x + w / 2, y + h / 2 + 3); }
  { const [x, y, w, h] = ATLAS.recycle; g.fillStyle = '#1f55a8'; g.fillRect(x, y, w, h); g.fillStyle = '#fff';
    g.font = 'bold 34px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RECYCLE', x + w / 2, y + h / 2 + 2); }
  return c;
}
export function atlasUV(rect, u, v) { // u,v in 0..1 of the region → atlas uv
  const [x, y, w, h] = rect;
  return [(x + u * w) / 512, 1 - (y + (1 - v) * h) / 512];
}
function paintLouver(size = 256) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  g.fillStyle = '#c9cbc8'; g.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 8) { g.fillStyle = '#6c706e'; g.fillRect(0, y, size, 3); g.fillStyle = '#e6e7e4'; g.fillRect(0, y + 3, size, 1); }
  return c;
}
function paintGrille(size = 256) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  g.fillStyle = '#1b1c1c'; g.fillRect(0, 0, size, size);
  g.strokeStyle = '#555'; g.lineWidth = 2;
  for (let rr = 12; rr < size / 2; rr += 12) { g.beginPath(); g.arc(size / 2, size / 2, rr, 0, Math.PI * 2); g.stroke(); }
  for (let a = 0; a < 8; a++) { g.beginPath(); g.moveTo(size / 2, size / 2); g.lineTo(size / 2 + Math.cos(a * Math.PI / 4) * size / 2, size / 2 + Math.sin(a * Math.PI / 4) * size / 2); g.stroke(); }
  return c;
}

// ---------------------------------------------------------------- V2 luxury landscape textures
// charcoal large-format pavers 60×30 running bond (tile 1.2 m = 2 × 4 units). Returns {col, hgt}
function paintPavers(size = 512) {
  const c = makeCanvas(size, size), h = makeCanvas(size, size); const g = ctx2d(c), gh = ctx2d(h); if (!g || !gh) return { col: c, hgt: null };
  const r = mulberry32(131);
  g.fillStyle = '#5c5a56'; g.fillRect(0, 0, size, size);    // joint sand
  gh.fillStyle = '#000'; gh.fillRect(0, 0, size, size);
  const cols = 2, rows = 4, uw = size / cols, uh = size / rows, j = Math.max(2, size / 220);
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * uw / 2;
    for (let x = -1; x < cols + 1; x++) {
      const px = x * uw + off + j / 2, py = y * uh + j / 2, w = uw - j, hh = uh - j;
      const v = 0.86 + r() * 0.22, base = 74 * v;
      g.fillStyle = rgb(base, base * 0.99, base * 0.97); g.fillRect(px, py, w, hh);
      // bevel in height: 3 nested rects
      for (let b = 0; b < 3; b++) { const k = 120 + b * 60; gh.fillStyle = rgb(k, k, k); gh.fillRect(px + b, py + b, w - 2 * b, hh - 2 * b); }
    }
  }
  noisePixels(g, size, 133, 16, (n, i, d) => { const k = 0.88 + n * 0.24; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; });
  for (let k = 0; k < size * 10; k++) { const v = 40 + r() * 90; g.fillStyle = rgb(v, v, v, 0.35); g.fillRect(r() * size, r() * size, 1.2, 1.2); }
  return { col: c, hgt: h };
}
// cleft bluestone surface (tile 1 m): blue-gray with ochre/lilac drift + fine cleft relief. Returns {col, hgt}
function paintBluestone(size = 512) {
  const c = makeCanvas(size, size), h = makeCanvas(size, size); const g = ctx2d(c), gh = ctx2d(h); if (!g || !gh) return { col: c, hgt: null };
  const low = Math.min(256, size);
  noiseUp(g, size, low, 141, 4, (n, i, d, x, y) => {
    const m = fbm((x / low) * 8, (y / low) * 8, 143, 3, 8), drift = fbm((x / low) * 2, (y / low) * 2, 147, 2, 2);
    const k = 0.78 + n * 0.32 + (m - 0.5) * 0.18;
    let R = 104 * k, G = 114 * k, B = 124 * k;
    if (drift > 0.6) { const t = (drift - 0.6) * 2.5; R += 22 * t; G += 10 * t; B -= 8 * t; }
    d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255;
  });
  noiseUp(gh, size, low, 149, 8, (n, i, d, x, y) => { const m = fbm((x / low) * 16, (y / low) * 16, 151, 2, 16); const v = 70 + n * 120 + m * 50; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; });
  const r = mulberry32(153);
  for (let k = 0; k < size * 4; k++) { const v = r() < 0.5 ? 150 : 70; g.fillStyle = rgb(v, v + 4, v + 10, 0.18); g.fillRect(r() * size, r() * size, 1.3, 1.3); }
  return { col: c, hgt: h };
}
// horizontal cedar slats (tile 1 m × 1 m, 8 slats 11 cm + 1.5 cm shadow gap). Returns {col, hgt}
function paintCedar(size = 512) {
  const c = makeCanvas(size, size), h = makeCanvas(size, size); const g = ctx2d(c), gh = ctx2d(h); if (!g || !gh) return { col: c, hgt: null };
  const r = mulberry32(171);
  g.fillStyle = '#1f1611'; g.fillRect(0, 0, size, size); gh.fillStyle = '#000'; gh.fillRect(0, 0, size, size);
  const n = 8, pitch = size / n, gap = pitch * 0.12;
  const tones = [[168, 104, 64], [182, 118, 76], [150, 92, 58], [190, 128, 84], [160, 98, 62]];
  for (let k = 0; k < n; k++) {
    const y0 = k * pitch + gap / 2, hh = pitch - gap;
    const t = tones[(r() * tones.length) | 0], v = 0.9 + r() * 0.16;
    g.fillStyle = rgb(t[0] * v, t[1] * v, t[2] * v); g.fillRect(0, y0, size, hh);
    // grain streaks
    for (let s = 0; s < 46; s++) {
      const yy = y0 + r() * hh, a = 0.12 + r() * 0.22, dark = r() < 0.6;
      g.strokeStyle = dark ? rgb(96, 56, 32, a) : rgb(214, 158, 110, a * 0.8); g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath(); g.moveTo(0, yy);
      for (let x = 0; x <= size; x += size / 8) g.lineTo(x, yy + Math.sin(x * 0.02 + s) * (0.6 + r()));
      g.stroke();
    }
    // a knot or two
    for (let q = 0; q < (r() < 0.5 ? 1 : 0); q++) { const kx = r() * size, ky = y0 + hh * (0.3 + r() * 0.4); g.fillStyle = 'rgba(80,44,24,0.7)'; g.beginPath(); g.ellipse(kx, ky, 4 + r() * 4, 2 + r() * 2, 0, 0, Math.PI * 2); g.fill(); }
    // slat edge shading + height bevel
    g.fillStyle = 'rgba(255,230,200,0.10)'; g.fillRect(0, y0, size, 2);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y0 + hh - 3, size, 3);
    for (let b = 0; b < 3; b++) { const v2 = 130 + b * 55; gh.fillStyle = rgb(v2, v2, v2); gh.fillRect(0, y0 + b, size, hh - 2 * b); }
  }
  return { col: c, hgt: h };
}
// dense clipped boxwood (tile 0.5 m)
function paintBoxwood(size = 256) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(181);
  g.fillStyle = '#1d3418'; g.fillRect(0, 0, size, size);
  const n = Math.round(size * size / 9);
  for (let k = 0; k < n; k++) {
    const x = r() * size, y = r() * size, L = (2.5 + r() * 3) * size / 256, a = r() * Math.PI, v = 0.55 + r() * 0.75, t = r();
    const col = t < 0.65 ? [52 * v, 92 * v, 34 * v] : t < 0.9 ? [74 * v, 112 * v, 40 * v] : [100 * v, 128 * v, 52 * v];
    wrapDraw(size, x, y, L + 1, (px, py) => {
      g.fillStyle = rgb(col[0], col[1], col[2]); g.beginPath(); g.ellipse(px, py, L, L * 0.62, a, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,220,0.12)'; g.beginPath(); g.ellipse(px - L * 0.2, py - L * 0.2, L * 0.45, L * 0.25, a, 0, Math.PI * 2); g.fill();
    });
  }
  return c;
}
// hydrangea mophead florets (near-white; instance colour tints white/blush/blue)
function paintFlorets(size = 256) {
  const c = makeCanvas(size, size); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(191);
  g.fillStyle = '#b9bfae'; g.fillRect(0, 0, size, size);
  const n = Math.round(size * size / 60);
  for (let k = 0; k < n; k++) {
    const x = r() * size, y = r() * size, s = (3.5 + r() * 3) * size / 256, a = r() * Math.PI, v = 0.78 + r() * 0.24;
    wrapDraw(size, x, y, s * 2, (px, py) => {
      g.fillStyle = 'rgba(60,70,50,0.35)'; g.beginPath(); g.arc(px + 1, py + 1, s * 1.15, 0, Math.PI * 2); g.fill();
      for (let p = 0; p < 4; p++) {
        const pa = a + p * Math.PI / 2;
        g.fillStyle = rgb(246 * v, 246 * v, 236 * v); g.beginPath(); g.ellipse(px + Math.cos(pa) * s * 0.55, py + Math.sin(pa) * s * 0.55, s * 0.62, s * 0.42, pa, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(170,190,120,0.9)'; g.beginPath(); g.arc(px, py, s * 0.16, 0, Math.PI * 2); g.fill();
    });
  }
  return c;
}
// distant tree-line silhouette band (alpha), tiles horizontally. 1024 × 256, trees reach 25–100 % of the height
function paintTreeline(w = 1024, h = 256) {
  const c = makeCanvas(w, h); const g = ctx2d(c); if (!g) return null;
  const r = mulberry32(211);
  g.clearRect(0, 0, w, h);
  const crowns = [];
  let x = 0;
  while (x < w) {
    const big = r() < 0.25, conifer = r() < 0.14;
    const top = h * (big ? 0.08 + r() * 0.2 : 0.28 + r() * 0.3);
    const rad = (big ? 24 + r() * 22 : 14 + r() * 16) * (w / 1024);
    crowns.push({ x, top, rad, conifer, tone: r() });
    x += rad * (0.6 + r() * 0.6);
  }
  const fillCrown = (cx, cr) => {
    const v = 0.85 + cr.tone * 0.3;
    g.fillStyle = rgb(58 * v, 70 * v, 56 * v);
    if (cr.conifer) {
      g.beginPath(); g.moveTo(cx, cr.top - cr.rad * 0.6); g.lineTo(cx + cr.rad * 0.55, h); g.lineTo(cx - cr.rad * 0.55, h); g.closePath(); g.fill();
    } else {
      for (let k = 0; k < 9; k++) {
        const ox = (r() - 0.5) * cr.rad * 1.6, oy = r() * cr.rad * 1.4, rr = cr.rad * (0.5 + r() * 0.45);
        g.beginPath(); g.arc(cx + ox, cr.top + rr + oy, rr, 0, Math.PI * 2); g.fill();
      }
      g.beginPath(); g.ellipse(cx, cr.top + cr.rad * 2.2, cr.rad * 1.25, cr.rad * 1.6, 0, 0, Math.PI * 2); g.fill();
    }
  };
  // continuous understory band (no sky gaps between trunks), then the crowns
  g.fillStyle = rgb(52, 62, 50); g.fillRect(0, h * 0.62, w, h);
  for (let x2 = 0; x2 < w; x2 += 10) { g.beginPath(); g.arc(x2, h * 0.62, 8 + r() * 10, 0, Math.PI * 2); g.fill(); }
  for (const cr of crowns) { fillCrown(cr.x, cr); if (cr.x - cr.rad * 1.5 < 0) fillCrown(cr.x + w, cr); if (cr.x + cr.rad * 1.5 > w) fillCrown(cr.x - w, cr); }
  // haze: lighten upward (canopy tops catch the sky), keep alpha
  try {
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(170,182,176,0.45)'); gr.addColorStop(0.6, 'rgba(120,132,118,0.12)'); gr.addColorStop(1, 'rgba(40,46,38,0.2)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  } catch (e) { /* ignore */ }
  return c;
}

// ---------------------------------------------------------------- materials
export function makeMaterials(W) {
  const hi = W.hi;
  const T = (c, rep, srgb = true) => { const t = canvasTex(c, { srgb }); if (t && rep) t.repeat.set(rep, rep); return t; };
  const TN = (c, rep, strength) => T(normalFromHeight(c, strength), rep, false);  // normal map from a height canvas
  const N2 = (x, y) => new THREE.Vector2(x, y);
  const S = (o) => { for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null && /Map$|^map$/.test(k)) delete o[k]; return new THREE.MeshStandardMaterial(o); };
  const m = {};
  // lawn: hi-res grass texture + Sobel normal map (tile 2.5 m)
  const grassC = paintGrass(hi ? 1024 : 512);
  m.ground = S({ map: T(grassC, 1 / 2.5), normalMap: TN(grassC, 1 / 2.5, 2.2), normalScale: N2(0.9, 0.9), vertexColors: true, roughness: 0.97, metalness: 0 });
  const gravC = paintGravel(512);
  m.gravel = S({ map: T(gravC, 1 / 2), normalMap: TN(gravC, 1 / 2, 3), vertexColors: true, roughness: 0.93 });
  const asC = paintAsphalt(hi ? 1024 : 512);
  m.asphalt = S({ map: T(asC, 1 / 8), normalMap: TN(asC, 1 / 8, 1.6), normalScale: N2(0.7, 0.7), roughness: 0.86, vertexColors: true });
  const coC = paintConcrete(512);
  m.concrete = S({ map: T(coC, 1 / 2), normalMap: TN(coC, 1 / 2, 1.2), normalScale: N2(0.5, 0.5), roughness: 0.82, vertexColors: true });
  const muC = paintMulch(256);
  m.mulch = S({ map: T(muC, 1 / 1.5), normalMap: TN(muC, 1 / 1.5, 2.5), vertexColors: true, roughness: 0.97 });
  // bark: furrowed texture + strong normal map (hero trees and instanced mid trees)
  const barkC = paintBark(hi ? 512 : 256, 61);
  m.bark = S({ map: T(barkC, 1), normalMap: TN(barkC, 1, 4.5), normalScale: N2(1.2, 1.2), roughness: 0.96, vertexColors: true });
  m.leafTex = T(paintLeaves(512), 1);
  m.foliage = S({ map: m.leafTex, vertexColors: true, roughness: 0.85 });
  m.canopy = S({ map: T(paintLeaves(256, 77), 1), vertexColors: true, roughness: 0.9 });
  m.evergreen = S({ map: T(paintLeaves(256, 79), 1), vertexColors: true, roughness: 0.9, color: 0x9fb39a });
  // alpha leaf-cluster cards (individual leaves) — shared by hero trees and the instanced mid trees
  const lc = canvasTex(paintLeafCard(hi ? 512 : 256), { repeat: false });
  m.leafCard = S({ map: lc, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.72, metalness: 0, vertexColors: true });
  m.leafCardDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: lc, alphaTest: 0.45 });
  m.trunk = S({ map: T(paintBark(128, 63), 1), vertexColors: false, roughness: 0.95, color: 0x8a8079 });
  const ch = canvasTex(paintChainLink(128));
  if (ch) { ch.repeat.set(1 / 0.3, 1 / 0.3); }
  m.chain = S({ map: ch, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.45, color: 0xd8dadc });
  m.galv = S({ color: 0xb4b8bb, metalness: 0.75, roughness: 0.38, vertexColors: true });
  m.galvPlain = S({ color: 0xb4b8bb, metalness: 0.75, roughness: 0.38 });
  m.mailDoor = S({ color: 0x141414, metalness: 0.5, roughness: 0.38 });
  m.fan = S({ color: 0x222222, metalness: 0.4, roughness: 0.5 });
  m.grass = S({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.88 });
  // houses
  m.siding = S({ map: T(paintSiding(256), 1 / 1.2), vertexColors: true, roughness: 0.75 });
  const brC = paintBrick(hi ? 512 : 256);
  m.brick = S({ map: T(brC, 1 / 1.6), normalMap: TN(brC, 1 / 1.6, 2.5), normalScale: N2(0.8, 0.8), vertexColors: true, roughness: 0.92 });
  const shC = paintShingles(512);
  m.roof = S({ map: T(shC, 1 / 2), normalMap: TN(shC, 1 / 2, 3.5), normalScale: N2(1, 1), vertexColors: true, roughness: 0.9 });
  m.paint = S({ vertexColors: true, roughness: 0.55, metalness: 0 });
  m.glassDark = S({ color: 0x1d2328, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.2, emissive: 0xffc27a, emissiveIntensity: 0 });
  m.glassLit = S({ color: 0x232a30, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.2, emissive: 0xffb866, emissiveIntensity: 0 });
  m.wood = S({ map: T(paintBark(128, 65), 1), color: 0x8a7462, roughness: 0.9, vertexColors: true });
  m.darkMetal = S({ color: 0xffffff, metalness: 0.55, roughness: 0.45, vertexColors: true });
  m.lens = S({ color: 0xdedcd0, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.3 });
  m.wire = S({ color: 0x1a1a1a, roughness: 0.6 });
  m.signs = S({ map: canvasTex(paintAtlas(), { repeat: false }), roughness: 0.4, metalness: 0.25, side: THREE.FrontSide });
  // vehicles
  m.carPaint = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
  m.carGlass = new THREE.MeshPhysicalMaterial({ color: 0x141b20, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 });
  m.tire = S({ color: 0x1b1b1b, roughness: 0.85 });
  m.chrome = S({ color: 0xd0d3d6, metalness: 1, roughness: 0.22, vertexColors: true });
  m.carLights = S({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0x000000 });
  m.plastic = S({ vertexColors: true, roughness: 0.55 });
  m.ac = S({ map: T(paintLouver(256), 1 / 0.4), roughness: 0.5, metalness: 0.3 });
  m.grille = S({ map: canvasTex(paintGrille(256), { repeat: false }), roughness: 0.6, metalness: 0.4 });
  // ---- V2 luxury landscape
  const pv = paintPavers(512);
  m.pavers = S({ map: T(pv.col, 1 / 1.2), normalMap: TN(pv.hgt, 1 / 1.2, 3), normalScale: N2(1, 1), roughness: 0.78, vertexColors: true });
  const bs = paintBluestone(hi ? 512 : 256);
  m.stone = S({ map: T(bs.col, 1), normalMap: TN(bs.hgt, 1, 2.2), normalScale: N2(0.8, 0.8), roughness: 0.74, vertexColors: true });
  const ce = paintCedar(512);
  m.cedar = S({ map: T(ce.col, 1), normalMap: TN(ce.hgt, 1, 3), normalScale: N2(1, 1), roughness: 0.82, vertexColors: true });
  const bxC = paintBoxwood(256);
  m.hedge = S({ map: T(bxC, 1 / 0.5), normalMap: TN(bxC, 1 / 0.5, 3.5), normalScale: N2(1.2, 1.2), roughness: 0.86, vertexColors: true });
  m.florets = S({ map: T(paintFlorets(256), 1), roughness: 0.75, vertexColors: true });
  m.ornGrass = S({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  m.treeline = new THREE.MeshBasicMaterial({ map: canvasTex(paintTreeline(1024, 256), { repeat: true }), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, fog: true });
  m.horizonGround = S({ color: 0x5f7046, roughness: 1, metalness: 0, vertexColors: true });
  return m;
}
