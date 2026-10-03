// VILNYI Lifestyle yacht — the party crowd of the pool deck and the disco: a mix-and-match figure painter.
// Every guest is assembled from pose × build × skin × hair × swimwear cut × fabric × accessories and painted into one
// atlas per zone (stylised-realistic fashion illustration, the manner of the concierge in commons.js). Loaded on demand
// by yacht-people.js when such a zone is built; the atlas is painted a figure at a time between frames.
// Everyone is an adult: adult proportions (a head is 1/8 of the height), adult faces, full swimwear coverage.
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

// ------------------------------------------------------------------ canvas helpers (metres, y up)
function curve(g, pts, closed = true, move = true) {
  const n = pts.length, P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  if (move) g.moveTo(pts[0][0], pts[0][1]);
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) g.closePath();
}
function sample(pts, t) {
  const n = pts.length - 1, f = Math.min(n - 1e-6, Math.max(0, t * n)), i = Math.floor(f), u = f - i;
  const P = k => pts[Math.max(0, Math.min(n, k))], p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
  const c = k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u);
  return [c(0), c(1)];
}
// blurred fill without ctx.filter (Safari): the shape is drawn far off-canvas and only its shadow lands
function soft(g, S, path, color, blur) {
  g.save(); const t = g.getTransform(); g.setTransform(t.a, t.b, t.c, t.d, t.e - OFF, t.f);
  g.shadowColor = color; g.shadowBlur = blur * S; g.shadowOffsetX = OFF; g.shadowOffsetY = 0;
  g.fillStyle = '#000'; g.beginPath(); path(); g.fill(); g.restore();
}
const OFF = 9000;
// skin of one body part: flat light base, the form shaded in from the outline (light from the upper left)
function skinPart(g, S, PX, path, r, k = 1) {
  g.fillStyle = S.lt; g.fill(path);
  g.save(); g.clip(path);
  for (const [dx, dy, a, w] of [[0, 0, 0.5 * k, 1], [0.35, -0.2, 0.55 * k, 1.5]]) {
    g.save(); const t = g.getTransform(); g.setTransform(t.a, t.b, t.c, t.d, t.e - OFF, t.f); g.translate(dx * r, dy * r);
    g.shadowColor = S.sh + a + ')'; g.shadowBlur = r * 0.8 * PX; g.shadowOffsetX = OFF; g.shadowOffsetY = 0; g.lineWidth = r * w; g.strokeStyle = '#000'; g.stroke(path); g.restore();
  }
  g.restore();
}
const lg = (g, x0, y0, x1, y1, st) => { const r = g.createLinearGradient(x0, y0, x1, y1); st.forEach(([t, c]) => r.addColorStop(t, c)); return r; };
const rgd = (g, x, y, r0, r1, st) => { const r = g.createRadialGradient(x, y, r0, x, y, r1); st.forEach(([t, c]) => r.addColorStop(t, c)); return r; };
const ell = (g, x, y, rx, ry, rot = 0) => g.ellipse(x, y, rx, ry, rot, 0, TAU);
const line = (g, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
function capsule(g, ax, ay, ra, bx, by, rb) {
  const a = Math.atan2(by - ay, bx - ax), nx = -Math.sin(a), ny = Math.cos(a);
  g.moveTo(ax + nx * ra, ay + ny * ra); g.lineTo(bx + nx * rb, by + ny * rb);
  g.arc(bx, by, rb, a + Math.PI / 2, a - Math.PI / 2, true); g.lineTo(ax - nx * ra, ay - ny * ra);
  g.arc(ax, ay, ra, a - Math.PI / 2, a + Math.PI / 2, true); g.closePath();
}
// organic limb: a smooth outline round centres [x, y, r(+normal side), r(−normal side)?]
function tube(g, P) {
  const n = P.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    L.push([P[i][0] + nx * P[i][2], P[i][1] + ny * P[i][2]]); R.push([P[i][0] - nx * (P[i][3] ?? P[i][2]), P[i][1] - ny * (P[i][3] ?? P[i][2])]);
  }
  const cap = (i, j) => { const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], l = Math.hypot(dx, dy) || 1, r = Math.min(P[i][2], P[i][3] ?? P[i][2]); return [P[i][0] + dx / l * r * 0.85, P[i][1] + dy / l * r * 0.85]; };
  curve(g, [...L, cap(n - 1, n - 2), ...R.reverse(), cap(0, 1)]);
}
const hex2 = (hex) => { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const toHex = (c) => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const shade = (hex, k) => toHex(hex2(hex).map(v => v * k));
const mix = (a, b, t) => { const A = hex2(a), B = hex2(b); return toHex(A.map((v, i) => lerp(v, B[i], t))); };
const rgba = (hex, a) => { const c = hex2(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

// ------------------------------------------------------------------ palettes
const SKIN = [
  { hi: '#fde9da', lt: '#f6d3bc', mid: '#e7b99b', lo: '#cc9878', sh: 'rgba(168,102,74,', deep: 'rgba(118,62,44,', gl: 'rgba(255,244,234,', lip: '#c9596a', blush: 'rgba(230,112,110,0.26)' },
  { hi: '#fbdfc4', lt: '#f0c6a2', mid: '#dba77e', lo: '#bd8860', sh: 'rgba(150,88,54,', deep: 'rgba(104,54,32,', gl: 'rgba(255,240,222,', lip: '#c4525c', blush: 'rgba(226,108,96,0.26)' },
  { hi: '#f2caa0', lt: '#e0ac7c', mid: '#c78e5e', lo: '#a66e44', sh: 'rgba(126,72,38,', deep: 'rgba(86,44,22,', gl: 'rgba(255,232,204,', lip: '#b84c52', blush: 'rgba(214,96,80,0.25)' },
  { hi: '#dba678', lt: '#c1885a', mid: '#a46c42', lo: '#84522e', sh: 'rgba(92,50,24,', deep: 'rgba(58,28,12,', gl: 'rgba(255,222,184,', lip: '#a8444c', blush: 'rgba(190,84,66,0.24)' },
  { hi: '#b47e58', lt: '#93603e', mid: '#774a2c', lo: '#5a361e', sh: 'rgba(52,26,12,', deep: 'rgba(28,12,6,', gl: 'rgba(255,214,170,', lip: '#8f3a44', blush: 'rgba(160,70,56,0.22)' },
];
const HAIR = {
  blonde: { base: '#d9b672', dark: '#a17c3e', light: '#f1dca0', hi: '#fff3cc', brow: '#8a6a44' },
  platinum: { base: '#e9dcc0', dark: '#b7a580', light: '#f8f0dc', hi: '#ffffff', brow: '#8f7a5c' },
  honey: { base: '#b8843e', dark: '#7c5424', light: '#dcae68', hi: '#f6dca0', brow: '#6e4a26' },
  brunette: { base: '#553422', dark: '#2e1c12', light: '#8a5e3e', hi: '#c69a70', brow: '#3a2416' },
  dark: { base: '#33221a', dark: '#18100c', light: '#5c4030', hi: '#9a7458', brow: '#231610' },
  black: { base: '#1c1716', dark: '#090707', light: '#3c3430', hi: '#7c7470', brow: '#120e0c' },
  auburn: { base: '#8a3e22', dark: '#562012', light: '#b8643a', hi: '#e8a070', brow: '#5a2c18' },
  copper: { base: '#b45a28', dark: '#783416', light: '#dc8a4c', hi: '#f8c08a', brow: '#70381c' },
  grey: { base: '#a8a49e', dark: '#74706a', light: '#d0ccc6', hi: '#f4f2ee', brow: '#6a6660' },
};
const IRIS = [['#a9cfe6', '#4f86ac', '#223f57'], ['#c29a68', '#7a5230', '#2e1c10'], ['#9cc49a', '#4e7e52', '#24402a'], ['#8a6a4a', '#4a3020', '#1c100a'], ['#b8b8a0', '#6c7460', '#30382c']];
// fabrics: [kind, base, second colour, third colour]
const FABRICS = [
  ['solid', '#e8323c'], ['solid', '#ffffff'], ['solid', '#111216'], ['solid', '#ff5a9c'], ['solid', '#12a6a0'], ['solid', '#f2c230'], ['solid', '#2a56c8'], ['solid', '#ff7a2a'],
  ['solid', '#7c3cc8'], ['solid', '#1e8a4c'], ['solid', '#f6e6c8'], ['solid', '#c81e6e'], ['solid', '#58c8f0'],
  ['metal', '#d8b060', '#fff2c0', '#8a6424'], ['metal', '#c8ccd4', '#ffffff', '#6c7078'], ['metal', '#e0a090', '#ffe4d8', '#9a5a4c'], ['metal', '#3cc0a8', '#d0fff4', '#14685a'], ['metal', '#b070e0', '#f0d8ff', '#5c2c8a'], ['metal', '#e84880', '#ffd0e0', '#8a1c44'],
  ['stripe', '#ffffff', '#1c2c5c'], ['stripe', '#ffd8e4', '#e8326c'], ['stripe', '#111216', '#d8b060'],
  ['dot', '#e8323c', '#ffffff'], ['dot', '#111216', '#ffffff'], ['dot', '#1c2c5c', '#f6e6c8'],
  ['leo', '#dcae6c', '#3a2414', '#8a5a2c'], ['leo', '#f0e4d0', '#22201e', '#a89880'],
  ['leaf', '#0e5c4c', '#58c890', '#f2c230'], ['leaf', '#ffffff', '#ff5a9c', '#1e8a4c'], ['leaf', '#1c2c5c', '#ff7a2a', '#58c8f0'],
  ['zig', '#12a6a0', '#ffffff', '#f2c230'], ['zig', '#ff7a2a', '#c81e6e', '#f2c230'],
  ['block', '#ff5a9c', '#ff7a2a'], ['block', '#111216', '#ffffff'], ['block', '#2a56c8', '#58c8f0'],
];
const TOPS = ['triangle', 'bandeau', 'halter', 'sporty', 'balconette', 'oneshoulder', 'wrap'];
const BOTTOMS = ['classic', 'highleg', 'highwaist', 'sidetie', 'boyshort'];
const W_HAIR = ['waves', 'straight', 'lob', 'pony', 'bun', 'curls', 'bob', 'braid'];
const W_TONES = ['blonde', 'brunette', 'black', 'honey', 'auburn', 'dark', 'platinum', 'copper'];
const M_HAIR = ['crop', 'quiff', 'buzz', 'curly'];
const M_TONES = ['dark', 'black', 'brunette', 'honey', 'grey'];
const TRUNKS = [['solid', '#1c2c5c'], ['stripe', '#ffffff', '#12a6a0'], ['leaf', '#0e5c4c', '#f2c230', '#ff7a2a'], ['solid', '#e8323c'], ['block', '#111216', '#f2c230'], ['dot', '#58c8f0', '#ffffff'], ['solid', '#f6e6c8'], ['leaf', '#ff7a2a', '#ffffff', '#1c2c5c']];
const SARONGS = [['leaf', '#f6e6c8', '#ff7a2a', '#1e8a4c'], ['solid', '#ffffff'], ['stripe', '#f2c230', '#ffffff'], ['leaf', '#c81e6e', '#f2c230', '#ffffff'], ['solid', '#12a6a0'], ['zig', '#1c2c5c', '#ffffff', '#58c8f0'], ['solid', '#111216']];

// ------------------------------------------------------------------ fabric
function fabric(g, S, path, F, box, seed = 1) {   // path: Path2D ; box: [x0, y0, x1, y1]
  const [kind, c1, c2 = '#ffffff', c3 = c2] = F, [x0, y0, x1, y1] = box, r = rng(seed * 7919 + 13);
  g.save(); g.clip(path);
  if (kind === 'metal') {
    g.fillStyle = lg(g, x0, y1, x1, y0, [[0, c3], [0.16, c1], [0.3, c2], [0.42, c1], [0.58, c3], [0.72, c1], [0.84, c2], [1, c3]]); g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 26; i++) { const x = lerp(x0, x1, r()), y = lerp(y0, y1, r()), s = 0.0012 + r() * 0.0016; g.fillRect(x - s, y - s * 0.3, s * 2, s * 0.6); g.fillRect(x - s * 0.3, y - s, s * 0.6, s * 2); }
  } else {
    g.fillStyle = lg(g, x0, 0, x1, 0, [[0, shade(c1, 0.66)], [0.22, shade(c1, 0.92)], [0.46, c1], [0.7, shade(c1, 0.9)], [1, shade(c1, 0.6)]]); g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const w = x1 - x0, h = y1 - y0;
    if (kind === 'stripe') { g.strokeStyle = c2; g.lineWidth = 0.0095; for (let k = -h; k < w + h; k += 0.024) { g.beginPath(); g.moveTo(x0 + k, y0); g.lineTo(x0 + k + h * 0.7, y1); g.stroke(); } }
    if (kind === 'dot') { g.fillStyle = c2; let j = 0; for (let y = y0; y < y1 + 0.02; y += 0.021, j++) for (let x = x0 + (j % 2) * 0.012; x < x1 + 0.02; x += 0.024) { g.beginPath(); ell(g, x, y, 0.0056, 0.0056); g.fill(); } }
    if (kind === 'leo') { const n = Math.round(w * h * 1500); for (let i = 0; i < n; i++) { const x = lerp(x0, x1, r()), y = lerp(y0, y1, r()), s = 0.006 + r() * 0.006, a = r() * TAU; g.beginPath(); ell(g, x, y, s, s * 0.7, a); g.fillStyle = c3; g.fill(); g.beginPath(); g.ellipse(x, y, s * 1.25, s * 0.95, a, r() * 2, r() * 2 + 4.2); line(g, c2, 0.0034); } }
    if (kind === 'leaf') { const n = Math.round(w * h * 700); for (let i = 0; i < n; i++) { const x = lerp(x0, x1, r()), y = lerp(y0, y1, r()), s = 0.016 + r() * 0.016, a = r() * TAU; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, s * 0.55, s, 0); g.quadraticCurveTo(0, -s * 0.55, -s, 0); g.fillStyle = i % 3 ? c2 : c3; g.fill(); g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); line(g, rgba(c1, 0.5), 0.0016); g.restore(); } }
    if (kind === 'zig') { g.lineWidth = 0.0075; let j = 0; for (let y = y0 - 0.02; y < y1 + 0.02; y += 0.026, j++) { g.beginPath(); for (let x = x0, i = 0; x < x1 + 0.03; x += 0.022, i++) { const yy = y + (i % 2) * 0.016; i ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.strokeStyle = j % 2 ? c2 : c3; g.lineJoin = 'miter'; g.stroke(); } }
    if (kind === 'block') { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1, y0); g.closePath(); g.fillStyle = lg(g, x0, 0, x1, 0, [[0, shade(c2, 0.7)], [0.5, c2], [1, shade(c2, 0.66)]]); g.fill(); }
  }
  g.restore();
}

// ------------------------------------------------------------------ proportions (canonical: woman 1.72 m, man 1.82 m)
const DIM = {
  w: { H: 1.72, hc: 1.612, hk: 0.955, yS: 1.405, sh: 0.18, yHip: 0.905, yCr: 0.795, neck: 0.03,
    sec: [[1.456, 0.037], [1.438, 0.084], [1.416, 0.15], [1.388, 0.18], [1.352, 0.168], [1.318, 0.149], [1.26, 0.151, 'b'], [1.19, 0.13], [1.08, 0.111, 'w'], [0.99, 0.151, 'h'], [0.905, 0.176, 'h'], [0.835, 0.17, 'h']],
    jx: 0.088, jy: 0.865, thigh: [0.09, 0.079, 0.05, 0.055, 0.037, 0.027], yK: 0.47, yA: 0.075, arm: [0.043, 0.039, 0.033, 0.032, 0.022], ua: 0.27, fa: 0.235 },
  m: { H: 1.82, hc: 1.706, hk: 1.02, yS: 1.49, sh: 0.228, yHip: 0.95, yCr: 0.845, neck: 0.044,
    sec: [[1.548, 0.052], [1.528, 0.108], [1.502, 0.192], [1.47, 0.23], [1.43, 0.216], [1.392, 0.197], [1.33, 0.2, 'b'], [1.24, 0.178], [1.13, 0.16, 'w'], [1.04, 0.162], [0.95, 0.168], [0.885, 0.164]],
    jx: 0.09, jy: 0.915, thigh: [0.09, 0.082, 0.057, 0.062, 0.043, 0.034], yK: 0.5, yA: 0.08, arm: [0.054, 0.05, 0.042, 0.042, 0.03], ua: 0.3, fa: 0.26 },
};
// poses: hs hip shift, ht hip tilt, st shoulder tilt, ss shoulder shift, hd head tilt, legs [viewer-left, viewer-right] = [kneeX, kneeY, ankleX, ankleY], arm of the viewer's right side
const POSES = {
  stand: { hs: 0.02, ht: 0.05, st: -0.035, ss: -0.006, hd: 0.03, legs: [[-0.105, 0.475, -0.14, 0.075], [0.082, 0.47, 0.058, 0.075]], arm: 'hang' },
  hip: { hs: 0.036, ht: 0.09, st: -0.065, ss: -0.016, hd: -0.05, legs: [[-0.09, 0.48, -0.165, 0.075], [0.096, 0.47, 0.052, 0.075]], arm: 'hip' },
  close: { hs: -0.012, ht: -0.035, st: 0.02, ss: 0.004, hd: 0.04, legs: [[-0.062, 0.47, -0.045, 0.075], [0.07, 0.475, 0.07, 0.075]], arm: 'hang' },
  sway: { hs: -0.03, ht: -0.075, st: 0.05, ss: 0.014, hd: -0.04, legs: [[-0.09, 0.47, -0.05, 0.075], [0.1, 0.48, 0.16, 0.075]], arm: 'hip' },
  dance1: { hs: 0.046, ht: 0.11, st: -0.085, ss: -0.03, hd: -0.07, legs: [[-0.125, 0.495, -0.2, 0.075], [0.105, 0.47, 0.068, 0.075]], arm: 'out' },
  dance2: { hs: -0.04, ht: -0.1, st: 0.075, ss: 0.024, hd: 0.07, legs: [[-0.1, 0.47, -0.066, 0.075], [0.135, 0.49, 0.2, 0.075]], arm: 'up' },
  dance3: { hs: 0.03, ht: 0.07, st: -0.1, ss: -0.02, hd: 0.06, legs: [[-0.11, 0.485, -0.13, 0.075], [0.095, 0.47, 0.085, 0.075]], arm: 'head' },
  dance4: { hs: -0.02, ht: -0.05, st: 0.09, ss: 0.03, hd: -0.05, legs: [[-0.085, 0.47, -0.1, 0.075], [0.12, 0.5, 0.15, 0.075]], arm: 'out' },
  lounge1: { hs: 0, ht: 0.03, st: -0.02, ss: 0, hd: 0.06, legs: [[-0.075, 0.47, -0.062, 0.075], [0.2, 0.56, 0.05, 0.3]], arm: 'head', arm2: 'hang' },
  lounge2: { hs: 0, ht: -0.02, st: 0.02, ss: 0, hd: -0.05, legs: [[-0.07, 0.47, -0.02, 0.075], [0.07, 0.47, 0.035, 0.085]], arm: 'hip', arm2: 'head' },
  lounge3: { hs: 0, ht: 0.02, st: 0, ss: 0, hd: 0.02, legs: [[-0.08, 0.47, -0.085, 0.075], [0.085, 0.47, 0.09, 0.075]], arm: 'hang', arm2: 'hang' },
  swim1: { hs: 0, ht: 0.02, st: -0.02, ss: 0, hd: 0.04, legs: [[-0.08, 0.47, -0.08, 0.075], [0.08, 0.47, 0.08, 0.075]], arm: 'float', arm2: 'float' },
  swim2: { hs: 0, ht: -0.02, st: 0.05, ss: 0.01, hd: -0.05, legs: [[-0.08, 0.47, -0.08, 0.075], [0.08, 0.47, 0.08, 0.075]], arm: 'head', arm2: 'float' },
  swim3: { hs: 0, ht: 0.02, st: -0.03, ss: 0, hd: 0.03, legs: [[-0.08, 0.47, -0.08, 0.075], [0.08, 0.47, 0.08, 0.075]], arm: 'float', arm2: 'glass' },
};
const POSE_SETS = { stand: ['stand', 'hip', 'close', 'sway'], dance: ['dance1', 'dance2', 'dance3', 'dance4', 'hip', 'sway'], lounge: ['lounge1', 'lounge2', 'lounge3'], swim: ['swim1', 'swim2', 'swim3'] };

function skeleton(V) {
  const D = DIM[V.sex], P = POSES[V.pose], m = V.sex === 'm', q = m ? 0.55 : 1;   // men stand squarer
  const hs = P.hs * q, ht = P.ht * q, st = P.st * q, sx = P.ss * q;
  const tt = (y) => sst(D.yHip, D.yS, y), xs = (y) => lerp(hs, sx, tt(y)), tl = (y) => lerp(ht, st, tt(y));
  const at = (xl, y) => { const a = tl(y); return [xs(y) + xl * Math.cos(a), y + xl * Math.sin(a)]; };
  const f = { b: V.bust ?? 1, w: V.waist ?? 1, h: V.hipF ?? 1 };
  const sec = D.sec.map(([y, hw, k]) => [y, hw * (k ? f[k] : 1)]);
  const hwAt = (y) => { for (let i = 0; i < sec.length - 1; i++) if (y <= sec[i][0] && y >= sec[i + 1][0]) return lerp(sec[i][1], sec[i + 1][1], (sec[i][0] - y) / (sec[i][0] - sec[i + 1][0])); return y > sec[0][0] ? sec[0][1] : sec[sec.length - 1][1]; };
  const torso = new Path2D();
  { const R = sec.map(([y, hw]) => at(hw, y)), L = sec.map(([y, hw]) => at(-hw, y)).reverse(); curve(torso, [...R, [hs + 0.05, D.yCr + 0.012], [hs, D.yCr], [hs - 0.05, D.yCr + 0.012], ...L]); }
  const legs = [-1, 1].map((d, i) => {
    const [kx, ky, ax, ay] = P.legs[i], J = at(d * D.jx * f.h, D.jy), K = [kx * (m ? 1.05 : 1), ky + (m ? 0.03 : 0)], A = [ax * (m ? 1.05 : 1), ay + (m ? 0.005 : 0)], T = D.thigh;
    const pts = [[...J, T[0] * f.h], [lerp(J[0], K[0], 0.45), lerp(J[1], K[1], 0.45), T[1] * (0.5 + 0.5 * f.h)], [...K, T[2]], [lerp(K[0], A[0], 0.27), lerp(K[1], A[1], 0.27), T[3], T[3] * 0.92], [lerp(K[0], A[0], 0.7), lerp(K[1], A[1], 0.7), T[4]], [...A, T[5]]];
    if (d > 0) for (const p of pts) if (p.length > 3) { const t = p[2]; p[2] = p[3]; p[3] = t; }
    const path = new Path2D(); tube(path, pts.slice().reverse());   // drawn from the ankle up so +normal is the viewer's left
    return { d, J, K, A, path, pts };
  });
  const C = [xs(D.yS), D.yS], neckTop = [sx + P.hd * 0.05, D.hc - 0.108 * D.hk + 0.012];
  const sj = (d) => at(d * (D.sh - 0.024), D.yS - 0.022);
  return { D, P, m, xs, tl, at, hwAt, torso, legs, C, neckTop, sj, f, hs, ht, st };
}
// arm joints by pose (d = ±1); returns { S, E, W, hand angle }
function armJoints(B, d, kind) {
  const D = B.D, S = B.sj(d), u = D.ua, f = D.fa;
  switch (kind) {
    case 'hip': { const W = B.at(d * (B.hwAt(0.97) + 0.012), 0.975); return { S, E: [S[0] + d * 0.135, lerp(S[1], W[1], 0.56)], W, ha: d * 2.2, kind }; }
    case 'up': return { S, E: [S[0] + d * 0.13, S[1] + 0.13], W: [S[0] + d * 0.1, S[1] + 0.13 + f * 0.86], ha: 0, kind };
    case 'out': return { S, E: [S[0] + d * u * 0.6, S[1] - 0.05], W: [S[0] + d * (u * 0.6 + 0.02), S[1] - 0.05 + f * 0.9], ha: 0, kind };
    case 'head': return { S, E: [S[0] + d * 0.15, S[1] + 0.17], W: [B.neckTop[0] + d * 0.085, D.hc + 0.035], ha: d * 1.2, kind };
    case 'belly': return { S, E: [S[0] + d * 0.05, S[1] - u], W: [B.xs(1.06) + d * 0.02, 1.06 + (B.m ? 0.06 : 0)], ha: d * 1.9, kind };
    case 'float': return { S, E: [S[0] + d * 0.03, S[1] - u * 0.98], W: [S[0] + d * 0.05, S[1] - u * 0.98 - f * 0.9], ha: d * -0.4, kind };
    case 'glass': return { S, E: [S[0] + d * 0.05, S[1] - u * 0.92], W: [S[0] + d * 0.1, S[1] - u * 0.92 + f * 0.8], ha: 0, kind };
    default: return { S, E: [S[0] + d * 0.032, S[1] - u], W: [S[0] + d * 0.04, S[1] - u - f], ha: Math.PI, kind: 'hang' };
  }
}

// ------------------------------------------------------------------ skin
const skinH = (g, S, x0, x1) => lg(g, x0, 0, x1, 0, [[0, S.lo], [0.15, S.mid], [0.4, S.lt], [0.54, S.hi], [0.76, S.lt], [0.92, S.mid], [1, S.lo]]);
function skinAlong(g, S, a, b, r) {   // gradient across a limb from a to b
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, s = nx < 0 ? -1 : 1;
  return lg(g, mx - nx * r * s, my - ny * r * s, mx + nx * r * s, my + ny * r * s, [[0, S.lo], [0.18, S.mid], [0.42, S.lt], [0.56, S.hi], [0.78, S.lt], [1, S.mid]]);
}
function hand(g, S, x, y, a, k = 1, open = false) {   // a: direction of the fingers (0 = up)
  g.save(); g.translate(x, y); g.rotate(-a); g.scale(k, k);
  g.beginPath(); curve(g, [[-0.021, -0.004], [-0.025, 0.03], [-0.02, 0.062], [-0.008, 0.084], [0.008, 0.086], [0.02, 0.066], [0.025, 0.03], [0.02, -0.004]]); g.fillStyle = lg(g, -0.025, 0, 0.025, 0, [[0, S.mid], [0.45, S.lt], [1, S.mid]]); g.fill();
  g.beginPath(); capsule(g, 0.02, 0.012, 0.009, 0.036, 0.04, 0.0065); g.fillStyle = S.lt; g.fill();
  for (const k2 of [-0.009, 0.0005, 0.01]) { g.beginPath(); g.moveTo(k2, 0.046); g.lineTo(k2 * 1.2, 0.08); line(g, S.sh + '0.4)', 0.0013); }
  if (open) { g.beginPath(); g.moveTo(-0.012, 0.012); g.quadraticCurveTo(0, 0.004, 0.014, 0.016); line(g, S.sh + '0.3)', 0.0012); }
  g.restore();
}
function paintArm(g, PX, V, B, J, o = {}) {
  const S = SKIN[V.skin], A = B.D.arm, { S: s, E: e, W: w } = J, k = B.m ? 1.12 : 1;
  const d = Math.sign(e[0] - s[0] + (w[0] - s[0]) * 0.01) || 1;
  const pts = [[s[0], s[1], A[0]], [lerp(s[0], e[0], 0.5), lerp(s[1], e[1], 0.5), A[1]], [e[0], e[1], A[2]], [lerp(e[0], w[0], 0.35), lerp(e[1], w[1], 0.35), A[3]], [w[0], w[1], A[4]]];
  if (J.kind !== 'head') { const dx = w[0] - e[0], dy = w[1] - e[1], l = Math.hypot(dx, dy) || 1; hand(g, S, w[0] - dx / l * 0.006, w[1] - dy / l * 0.006, Math.atan2(dx, dy) + (J.kind === 'hip' ? -d * 0.5 : 0), k, J.kind === 'up' || J.kind === 'out'); }
  const p = new Path2D(); tube(p, pts);
  skinPart(g, S, PX, p, 0.02);
  g.save(); g.clip(p);
  soft(g, PX, () => ell(g, e[0], e[1], 0.02, 0.012), S.sh + '0.26)', 0.01);                                  // elbow
  soft(g, PX, () => capsule(g, lerp(s[0], e[0], 0.15) - 0.012, lerp(s[1], e[1], 0.15) + 0.004, 0.008, lerp(s[0], e[0], 0.8) - 0.01, lerp(s[1], e[1], 0.8), 0.006), S.gl + '0.5)', 0.008);
  soft(g, PX, () => capsule(g, lerp(e[0], w[0], 0.15) - 0.008, lerp(e[1], w[1], 0.15), 0.006, lerp(e[0], w[0], 0.8) - 0.006, lerp(e[1], w[1], 0.8), 0.004), S.gl + '0.4)', 0.007);
  if (B.m) soft(g, PX, () => ell(g, lerp(s[0], e[0], 0.4) + 0.02, lerp(s[1], e[1], 0.4), 0.012, 0.06), S.sh + '0.3)', 0.012);
  g.restore();
  if (o.bangle) { const t = 0.88, x = lerp(e[0], w[0], t), y = lerp(e[1], w[1], t), a = Math.atan2(w[1] - e[1], w[0] - e[0]); g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); for (const dy of o.bangle === 2 ? [-0.006, 0.006] : [0]) { g.beginPath(); g.ellipse(0, dy, A[4] + 0.004, 0.0045, 0, 0, TAU); line(g, o.gold || '#e6c476', 0.0042); g.beginPath(); g.ellipse(-0.004, dy + 0.001, A[4] * 0.5, 0.002, 0, 0, TAU); line(g, 'rgba(255,250,225,0.85)', 0.0014); } g.restore(); }
  if (o.watch) { const t = 0.9, x = lerp(e[0], w[0], t), y = lerp(e[1], w[1], t), a = Math.atan2(w[1] - e[1], w[0] - e[0]); g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.fillStyle = '#22242a'; g.fillRect(-A[4] - 0.004, -0.011, (A[4] + 0.004) * 2, 0.022); g.beginPath(); ell(g, 0, 0, 0.016, 0.016); g.fillStyle = '#c8ccd4'; g.fill(); g.beginPath(); ell(g, 0, 0, 0.011, 0.011); g.fillStyle = '#10182c'; g.fill(); g.restore(); }
}
function glass(g, x, y, k = 1) {   // a coupe with something golden, stem at (x, y)
  g.save(); g.translate(x, y); g.scale(k, k);
  g.beginPath(); g.moveTo(0, -0.06); g.lineTo(0, 0.03); line(g, 'rgba(235,245,250,0.95)', 0.005);
  g.beginPath(); ell(g, 0, -0.062, 0.028, 0.006); g.fillStyle = 'rgba(235,245,250,0.95)'; g.fill();
  g.beginPath(); g.moveTo(-0.046, 0.1); g.quadraticCurveTo(-0.042, 0.032, 0, 0.028); g.quadraticCurveTo(0.042, 0.032, 0.046, 0.1); g.closePath(); g.fillStyle = lg(g, -0.046, 0, 0.046, 0, [[0, '#e8b860'], [0.4, '#ffe6a0'], [1, '#d8a040']]); g.fill(); line(g, 'rgba(255,255,255,0.95)', 0.0036);
  g.beginPath(); ell(g, 0, 0.1, 0.046, 0.007); g.fillStyle = 'rgba(255,246,214,0.95)'; g.fill();
  g.restore();
}

// ------------------------------------------------------------------ head
const FACE = [[0, 0.113], [0.038, 0.108], [0.0605, 0.08], [0.0685, 0.033], [0.068, -0.011], [0.0635, -0.048], [0.054, -0.077], [0.039, -0.099], [0.02, -0.1105], [0, -0.113]];
const FACE_M = [[0, 0.113], [0.04, 0.108], [0.064, 0.08], [0.0705, 0.033], [0.07, -0.014], [0.068, -0.054], [0.061, -0.084], [0.046, -0.104], [0.024, -0.1135], [0, -0.115]];
const symh = (h) => [...h, ...h.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
function lock(g, outer, inner, H, seed, n, wave = 0.004, freq = 0) {
  const N = 26, poly = []; for (let i = 0; i <= N; i++) poly.push(sample(outer, i / N)); for (let i = N; i >= 0; i--) poly.push(sample(inner, i / N));
  const ys = poly.map(p => p[1]), y1 = Math.max(...ys), y0 = Math.min(...ys);
  g.beginPath(); poly.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
  g.fillStyle = lg(g, 0, y1, 0, y0, [[0, H.base], [0.12, H.hi], [0.24, H.light], [0.42, H.base], [0.6, H.dark], [0.76, H.light], [1, H.base]]); g.fill();
  g.save(); g.clip(); const r = rng(seed);
  for (let k = 0; k < n; k++) {
    const u = r(), ph = r() * TAU, amp = wave * (0.4 + r()), fr = freq || 5 + r() * 4, tone = r();
    g.beginPath(); for (let i = 0; i <= 22; i++) { const t = i / 22, a = sample(outer, t), b = sample(inner, t), w = Math.sin(t * fr + ph) * amp * Math.min(1, t * 2.2); const x = lerp(a[0], b[0], u) + w, y = lerp(a[1], b[1], u); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.globalAlpha = tone < 0.3 ? 0.42 : 0.5; line(g, tone < 0.3 ? H.dark : tone < 0.55 ? H.base : tone < 0.86 ? H.light : H.hi, 0.0012 + r() * 0.0024);
  }
  g.globalAlpha = 1; g.restore();
}
function strands(g, path, H, seed, n, dir = 0, len = 0.1, box = [-0.2, -0.5, 0.2, 0.2]) {   // loose strand texture inside a path
  g.save(); g.clip(path); const r = rng(seed);
  for (let k = 0; k < n; k++) { const x = lerp(box[0], box[2], r()), y = lerp(box[1], box[3], r()), tone = r(), a = dir + (r() - 0.5) * 0.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.sin(a) * len * 0.5 + (r() - 0.5) * 0.02, y - Math.cos(a) * len * 0.5, x + Math.sin(a) * len, y - Math.cos(a) * len); g.globalAlpha = 0.45; line(g, tone < 0.35 ? H.dark : tone < 0.7 ? H.light : H.hi, 0.0014 + r() * 0.002); }
  g.globalAlpha = 1; g.restore();
}
const HAIR_BACK = {
  waves: [[0, 0.126], [0.06, 0.119], [0.1, 0.082], [0.114, 0.02], [0.12, -0.06], [0.137, -0.15], [0.158, -0.24], [0.163, -0.33], [0.14, -0.4], [0.09, -0.415], [0.04, -0.37], [0, -0.33]],
  straight: [[0, 0.124], [0.056, 0.118], [0.092, 0.086], [0.103, 0.02], [0.107, -0.1], [0.114, -0.25], [0.118, -0.4], [0.1, -0.468], [0.05, -0.475], [0, -0.45]],
  lob: [[0, 0.126], [0.06, 0.12], [0.102, 0.082], [0.117, 0.01], [0.128, -0.08], [0.134, -0.16], [0.11, -0.205], [0.055, -0.185], [0, -0.16]],
  bob: [[0, 0.126], [0.06, 0.12], [0.1, 0.084], [0.113, 0.012], [0.112, -0.066], [0.09, -0.112], [0.045, -0.1], [0, -0.08]],
  curls: [[0, 0.15], [0.08, 0.142], [0.135, 0.092], [0.156, 0.012], [0.162, -0.09], [0.168, -0.19], [0.142, -0.268], [0.08, -0.282], [0.03, -0.23], [0, -0.2]],
  wet: [[0, 0.118], [0.05, 0.112], [0.078, 0.07], [0.082, 0], [0.088, -0.1], [0.1, -0.2], [0.08, -0.265], [0.03, -0.25], [0, -0.22]],
  braid: [[0, 0.122], [0.055, 0.116], [0.086, 0.08], [0.09, 0.01], [0.08, -0.06], [0.04, -0.09], [0, -0.09]],
};
function hairBack(g, PX, V, H) {
  const st = V.hair, pts = HAIR_BACK[st];
  if (pts) {
    const p = new Path2D(); const full = symh(pts).map(([x, y]) => [x * (x < 0 ? 1.04 : 1), y]); curve(p, full);
    const y0 = Math.min(...pts.map(q => q[1]));
    g.fillStyle = lg(g, 0, 0.13, 0, y0, [[0, H.base], [0.3, H.dark], [0.7, H.base], [1, H.dark]]); g.fill(p);
    if (st === 'curls') { g.save(); g.clip(p); const r = rng(V.seed + 5); for (let i = 0; i < 90; i++) { const x0 = (r() - 0.5) * 0.36, ph = r() * TAU, fr = 34 + r() * 14, tone = r(); g.beginPath(); for (let k = 0; k <= 30; k++) { const t = k / 30, y = lerp(0.15, y0, t), x = x0 * (0.7 + t * 0.5) + Math.sin(t * fr + ph) * 0.007; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.globalAlpha = 0.55; line(g, tone < 0.4 ? H.dark : tone < 0.8 ? H.light : H.hi, 0.003 + r() * 0.003); } g.globalAlpha = 1; g.restore(); }
    else strands(g, p, H, V.seed + 3, st === 'bob' || st === 'braid' ? 40 : 110, 0, st === 'waves' ? 0.12 : 0.2, [-0.17, y0, 0.17, 0.12]);
  }
  if (st === 'pony') { const p = new Path2D(); tube(p, [[0.02, 0.118, 0.03], [0.085, 0.07, 0.036], [0.118, -0.05, 0.036], [0.128, -0.17, 0.032], [0.11, -0.28, 0.022], [0.09, -0.33, 0.01]]); g.fillStyle = lg(g, 0, 0.12, 0, -0.33, [[0, H.base], [0.3, H.light], [0.6, H.dark], [1, H.base]]); g.fill(p); strands(g, p, H, V.seed + 4, 60, -0.15, 0.14, [0, -0.34, 0.17, 0.13]); }
  if (st === 'bun') { g.beginPath(); ell(g, 0.004, 0.142, 0.05, 0.042); g.fillStyle = rgd(g, -0.012, 0.155, 0.004, 0.055, [[0, H.light], [0.5, H.base], [1, H.dark]]); g.fill(); g.beginPath(); g.arc(0.004, 0.142, 0.03, 0.4, 3.6); line(g, rgba(H.dark, 0.6), 0.004); }
}
function hairFront(g, PX, V, H, m) {
  const st = V.hair;
  if (m) {
    if (st === 'buzz') { const p = new Path2D(); curve(p, [[-0.07, 0.025], [-0.066, 0.075], [-0.04, 0.108], [0, 0.118], [0.04, 0.108], [0.066, 0.075], [0.07, 0.025], [0.058, 0.058], [0.03, 0.078], [0, 0.082], [-0.03, 0.078], [-0.058, 0.058]]); g.fillStyle = rgba(H.dark, 0.82); g.fill(p); return; }
    const top = st === 'quiff' ? 0.142 : st === 'curly' ? 0.14 : 0.126, p = new Path2D();
    curve(p, [[-0.073, 0.0], [-0.076, 0.06], [-0.052, 0.112], [-0.01, top], [0.04, top - 0.008], [0.07, 0.095], [0.077, 0.05], [0.072, 0.0], [0.066, 0.045], [0.048, 0.07], [0.012, 0.076], [-0.03, 0.068], [-0.058, 0.05], [-0.066, 0.03]]);
    g.fillStyle = lg(g, -0.07, 0.14, 0.07, 0.02, [[0, H.light], [0.4, H.base], [1, H.dark]]); g.fill(p);
    if (st === 'curly') { g.save(); g.clip(p); const r = rng(V.seed + 9); for (let i = 0; i < 70; i++) { g.beginPath(); g.arc((r() - 0.5) * 0.15, 0.03 + r() * 0.11, 0.008 + r() * 0.006, r() * TAU, r() * TAU + 3.4); g.globalAlpha = 0.6; line(g, r() < 0.5 ? H.dark : H.light, 0.0026); } g.globalAlpha = 1; g.restore(); }
    else strands(g, p, H, V.seed + 9, 50, st === 'quiff' ? 2.4 : 2.8, 0.05, [-0.08, 0.0, 0.08, 0.15]);
    return;
  }
  const pulled = st === 'pony' || st === 'bun' || st === 'wet' || st === 'braid';
  if (pulled) {
    const p = new Path2D(); curve(p, [[-0.07, -0.012], [-0.073, 0.05], [-0.05, 0.105], [0, 0.123], [0.05, 0.105], [0.073, 0.05], [0.07, -0.012], [0.062, 0.03], [0.046, 0.062], [0.02, 0.079], [0, 0.082], [-0.02, 0.079], [-0.046, 0.062], [-0.062, 0.03]]);
    g.fillStyle = lg(g, 0, 0.125, 0, 0.0, [[0, H.base], [0.35, st === 'wet' ? H.hi : H.light], [0.7, H.base], [1, H.dark]]); g.fill(p);
    g.save(); g.clip(p); const r = rng(V.seed + 6); for (let k = 0; k < 46; k++) { const a = (k / 45 - 0.5) * 2.5; g.beginPath(); g.moveTo(Math.sin(a) * 0.066, 0.01 + Math.cos(a) * 0.07); g.quadraticCurveTo(Math.sin(a) * 0.05, 0.06 + Math.cos(a) * 0.05, 0.01, 0.125); g.globalAlpha = 0.5; line(g, r() < 0.4 ? H.dark : r() < 0.8 ? H.light : H.hi, 0.0014 + r() * 0.0014); } g.globalAlpha = 1; g.restore();
    if (st === 'braid') { for (let i = 0; i < 9; i++) { const t = i / 8, x = lerp(0.082, 0.1, t) + (i % 2 ? 0.006 : -0.006), y = lerp(-0.07, -0.37, t), s = lerp(0.026, 0.016, t); g.beginPath(); ell(g, x, y, s, s * 0.8, i % 2 ? 0.6 : -0.6); g.fillStyle = lg(g, x - s, y + s, x + s, y - s, [[0, H.light], [0.5, H.base], [1, H.dark]]); g.fill(); line(g, rgba(H.dark, 0.7), 0.0016); } g.beginPath(); ell(g, 0.1, -0.385, 0.01, 0.022); g.fillStyle = H.base; g.fill(); }
    return;
  }
  // parted styles: two sweeps from a side part framing the face
  const px = V.part || -0.02, long = st === 'waves' || st === 'straight', tip = st === 'bob' ? -0.105 : st === 'lob' ? -0.19 : st === 'curls' ? -0.24 : st === 'straight' ? -0.42 : -0.36, wv = st === 'waves' ? 0.007 : st === 'curls' ? 0.012 : 0.002;
  const k = st === 'curls' ? 1.16 : 1;
  const Ro = [[px, 0.127 * k], [0.05, 0.122 * k], [0.094 * k, 0.086], [0.11 * k, 0.02], [0.113 * k, -0.06], [0.118 * k, lerp(-0.06, tip, 0.5)], [0.122 * k, lerp(-0.06, tip, 0.8)], [0.108, tip]];
  const Ri = [[px, 0.07], [0.02, 0.066], [0.048, 0.046], [0.064, 0.008], [0.0705, -0.05], [0.074, lerp(-0.05, tip, 0.45)], [0.086, lerp(-0.05, tip, 0.8)], [0.1, tip]];
  const Lo = [[px, 0.128 * k], [-0.066, 0.118 * k], [-0.104 * k, 0.082], [-0.118 * k, 0.015], [-0.124 * k, -0.07], [-0.136 * k, lerp(-0.07, tip, 0.5)], [-0.15 * k, lerp(-0.07, tip, 0.82)], [-0.13, tip - (long ? 0.03 : 0)]];
  const Li = [[px, 0.072], [-0.036, 0.064], [-0.054, 0.04], [-0.066, 0.0], [-0.072, -0.06], [-0.078, lerp(-0.06, tip, 0.45)], [-0.094, lerp(-0.06, tip, 0.8)], [-0.118, tip - (long ? 0.03 : 0)]];
  const n = st === 'curls' ? 46 : 70;
  lock(g, Ro, Ri, H, V.seed + 11, n, wv, st === 'curls' ? 26 : 0); lock(g, Lo, Li, H, V.seed + 29, n + 20, wv, st === 'curls' ? 26 : 0);
  soft(g, PX, () => { g.moveTo(0.0, 0.108); g.quadraticCurveTo(0.05, 0.104, 0.086, 0.06); g.quadraticCurveTo(0.046, 0.09, 0.0, 0.108); }, rgba(H.hi, 0.5), 0.006);
}
function eyeW(g, PX, d, S, V) {   // woman's eye with make-up, origin on the pupil line, +x to the temple
  const iris = IRIS[V.iris % IRIS.length];
  g.save(); g.scale(d * 1.08, 1.08);
  const I = [-0.0168, -0.0016], O = [0.0176, 0.0036], U1 = [-0.0105, 0.0088], U2 = [0.0075, 0.0108], L1 = [0.0105, -0.0058], L2 = [-0.006, -0.0066];
  const shape = () => { g.moveTo(I[0], I[1]); g.bezierCurveTo(U1[0], U1[1], U2[0], U2[1], O[0], O[1]); g.bezierCurveTo(L1[0], L1[1], L2[0], L2[1], I[0], I[1]); g.closePath(); };
  soft(g, PX, () => ell(g, 0.001, 0.0066, 0.021, 0.0105), S.sh + '0.3)', 0.007);
  soft(g, PX, () => ell(g, 0.002, 0.0088, 0.018, 0.0056, 0.12), V.lid || 'rgba(110,70,58,0.5)', 0.004);
  soft(g, PX, () => ell(g, 0.0138, 0.0078, 0.008, 0.0046, 0.5), 'rgba(48,28,24,0.5)', 0.0036);
  g.beginPath(); shape(); g.fillStyle = '#f4eee8'; g.fill();
  g.save(); g.beginPath(); shape(); g.clip();
  g.beginPath(); ell(g, 0.0004, 0.0017, 0.0078, 0.0078); g.fillStyle = rgd(g, 0.0004, -0.0004, 0.0008, 0.0078, [[0, iris[0]], [0.62, iris[1]], [1, iris[2]]]); g.fill();
  g.beginPath(); ell(g, 0.0004, 0.0017, 0.0032, 0.0032); g.fillStyle = '#0d0907'; g.fill();
  soft(g, PX, () => g.rect(-0.02, 0.0058, 0.04, 0.01), 'rgba(36,22,14,0.65)', 0.003);
  g.beginPath(); ell(g, 0.0004 - d * 0.0027, 0.0044, 0.0019, 0.0016); g.fillStyle = 'rgba(255,255,255,0.96)'; g.fill();
  g.restore();
  g.beginPath(); g.moveTo(I[0], I[1]); g.bezierCurveTo(-0.0105, 0.0102, 0.0075, 0.0132, O[0] + 0.005, O[1] + 0.004); g.lineTo(O[0], O[1]); g.bezierCurveTo(U2[0], U2[1], U1[0], U1[1], I[0], I[1]); g.closePath(); g.fillStyle = '#1b100b'; g.fill();
  for (let k = 0; k < 6; k++) { const t = 0.42 + k * 0.11, u = 1 - t, px = u * u * u * I[0] + 3 * u * u * t * U1[0] + 3 * u * t * t * U2[0] + t * t * t * O[0], py = u * u * u * I[1] + 3 * u * u * t * U1[1] + 3 * u * t * t * U2[1] + t * t * t * O[1], a = lerp(0.2, 1.1, k / 5), L = 0.0044; g.beginPath(); g.moveTo(px, py + 0.001); g.lineTo(px + Math.sin(a) * L, py + 0.001 + Math.cos(a) * L); line(g, 'rgba(24,14,10,0.8)', 0.0009); }
  g.beginPath(); g.moveTo(O[0], O[1]); g.bezierCurveTo(L1[0], L1[1] - 0.0003, L2[0], L2[1] - 0.0003, I[0] + 0.003, I[1] - 0.0012); line(g, 'rgba(70,40,30,0.5)', 0.0008);
  g.restore();
}
function eyeM(g, PX, d, S, V) {
  const iris = IRIS[V.iris % IRIS.length];
  g.save(); g.scale(d, 1);
  soft(g, PX, () => ell(g, 0.001, 0.006, 0.021, 0.011), S.sh + '0.42)', 0.007);
  const shape = () => { g.moveTo(-0.016, -0.001); g.bezierCurveTo(-0.009, 0.0068, 0.008, 0.0078, 0.0165, 0.002); g.bezierCurveTo(0.009, -0.0052, -0.006, -0.0056, -0.016, -0.001); g.closePath(); };
  g.beginPath(); shape(); g.fillStyle = '#eee6de'; g.fill();
  g.save(); g.beginPath(); shape(); g.clip(); g.beginPath(); ell(g, 0.0004, 0.0012, 0.0068, 0.0068); g.fillStyle = iris[1]; g.fill(); g.beginPath(); ell(g, 0.0004, 0.0012, 0.003, 0.003); g.fillStyle = '#0d0907'; g.fill(); g.beginPath(); ell(g, -d * 0.002, 0.0032, 0.0015, 0.0013); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill(); g.restore();
  g.beginPath(); g.moveTo(-0.016, -0.001); g.bezierCurveTo(-0.009, 0.0074, 0.008, 0.0084, 0.0168, 0.0024); line(g, 'rgba(30,18,12,0.85)', 0.0016);
  g.restore();
}
function shadesOn(g, kind, ey, m) {
  const ex = 0.0325, k = m ? 1.06 : 1, frame = kind === 1 ? '#c9a45c' : kind === 3 ? '#f4f0ea' : '#141416';
  const lens = (d) => { const x = d * ex * k; if (kind === 0) { g.moveTo(x - d * 0.027, ey + 0.012); g.quadraticCurveTo(x, ey + 0.017, x + d * 0.03, ey + 0.014); g.quadraticCurveTo(x + d * 0.03, ey - 0.012, x + d * 0.006, ey - 0.02); g.quadraticCurveTo(x - d * 0.024, ey - 0.018, x - d * 0.027, ey + 0.012); }   // aviator
    else if (kind === 1) ell(g, x, ey, 0.0225, 0.021);                                                         // round
    else if (kind === 2) { g.moveTo(x - d * 0.026, ey + 0.008); g.quadraticCurveTo(x + d * 0.004, ey + 0.014, x + d * 0.037, ey + 0.022); g.quadraticCurveTo(x + d * 0.03, ey - 0.012, x + d * 0.004, ey - 0.016); g.quadraticCurveTo(x - d * 0.024, ey - 0.014, x - d * 0.026, ey + 0.008); }   // cat-eye
    else { g.moveTo(x - d * 0.027, ey + 0.017); g.lineTo(x + d * 0.031, ey + 0.019); g.quadraticCurveTo(x + d * 0.034, ey - 0.006, x + d * 0.026, ey - 0.02); g.lineTo(x - d * 0.022, ey - 0.02); g.quadraticCurveTo(x - d * 0.03, ey - 0.004, x - d * 0.027, ey + 0.017); } };   // oversized square
  for (const d of [-1, 1]) { g.beginPath(); lens(d); g.closePath(); g.fillStyle = lg(g, 0, ey + 0.02, 0, ey - 0.02, kind === 1 ? [[0, '#3a2c20'], [1, '#8a6a40']] : [[0, '#101014'], [0.6, '#2c2c36'], [1, '#55556a']]); g.fill(); line(g, frame, kind === 3 ? 0.0042 : 0.003);
    g.beginPath(); ell(g, d * ex * k - 0.008, ey + 0.007, 0.008, 0.004, 0.5); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill();
    g.beginPath(); g.moveTo(d * (ex * k + 0.028), ey + 0.01); g.lineTo(d * 0.071 * k, ey + 0.014); line(g, frame, 0.003); }
  g.beginPath(); g.moveTo(-0.008, ey + 0.008); g.quadraticCurveTo(0, ey + 0.012, 0.008, ey + 0.008); line(g, frame, 0.003);
}
function head(g, PX, V, B) {
  const D = B.D, S = SKIN[V.skin], m = B.m, H = HAIR[V.tone] || HAIR.brunette, F = m ? FACE_M : FACE;
  const outline = () => curve(g, symh(F));
  g.beginPath(); outline(); g.fillStyle = lg(g, -0.07, 0.05, 0.07, -0.06, [[0, S.lt], [0.4, S.hi], [0.75, S.lt], [1, S.mid]]); g.fill();
  for (const d of [-1, 1]) { g.beginPath(); ell(g, d * 0.0695, -0.018, 0.009, 0.02, d * 0.12); g.fillStyle = S.mid; g.fill(); }   // ears
  g.save(); g.beginPath(); outline(); g.clip();
  for (const d of [-1, 1]) soft(g, PX, () => ell(g, d * 0.09, -0.04, 0.03, 0.11), S.sh + (d > 0 ? '0.5)' : '0.36)'), 0.02);
  soft(g, PX, () => ell(g, 0, -0.121, 0.05, 0.012), S.sh + '0.42)', 0.01);
  soft(g, PX, () => ell(g, -0.006, 0.05, 0.032, 0.02), S.gl + '0.5)', 0.02);
  for (const d of [-1, 1]) {
    soft(g, PX, () => ell(g, d * 0.05, -0.062, 0.02, 0.0065, d * 0.62), S.sh + (m ? '0.42)' : '0.32)'), 0.01);       // hollow under the cheekbone
    if (!m) soft(g, PX, () => ell(g, d * 0.045, -0.043, 0.019, 0.01, d * 0.35), S.blush, 0.013);
    soft(g, PX, () => ell(g, d * 0.04, -0.0325, 0.013, 0.0052, d * 0.3), S.gl + '0.5)', 0.007);
  }
  soft(g, PX, () => ell(g, 0, -0.1, 0.013, 0.006), S.gl + '0.4)', 0.007);
  // nose
  soft(g, PX, () => { g.moveTo(0.0105, -0.001); g.quadraticCurveTo(0.0065, -0.033, 0.0125, -0.055); g.lineTo(0.017, -0.055); g.quadraticCurveTo(0.012, -0.033, 0.0165, -0.001); }, S.sh + '0.42)', 0.005);
  soft(g, PX, () => ell(g, -0.0008, -0.03, 0.0026, 0.02), S.gl + '0.6)', 0.0035);
  soft(g, PX, () => ell(g, -0.0006, -0.0525, 0.005, 0.004), S.gl + '0.7)', 0.0035);
  soft(g, PX, () => ell(g, 0.001, -0.0642, m ? 0.015 : 0.0125, 0.0028), S.sh + '0.55)', 0.0035);
  for (const d of [-1, 1]) { g.beginPath(); ell(g, d * (m ? 0.0076 : 0.0064), -0.0608, 0.0033, 0.0017, d * 0.4); g.fillStyle = S.deep + '0.7)'; g.fill(); g.beginPath(); g.moveTo(d * 0.0128, -0.0525); g.bezierCurveTo(d * 0.0154, -0.055, d * 0.0146, -0.0605, d * 0.0106, -0.0616); line(g, S.deep + '0.3)', 0.001); }
  // eyes and brows
  const ey = -0.021;
  if (V.shades == null) for (const d of [-1, 1]) { g.save(); g.translate(d * 0.0318, ey); (m ? eyeM : eyeW)(g, PX, d, S, V); g.restore(); }
  for (const d of [-1, 1]) {
    const by = m ? -0.003 : 0, th = m ? 1.5 : 1;
    const brow = () => { g.moveTo(d * 0.0122, 0.0038 + by); g.bezierCurveTo(d * 0.027, 0.0125 + by * 0.6, d * 0.044, 0.0168 + by * 0.6, d * 0.0665, 0.0068 + by); g.bezierCurveTo(d * 0.046, 0.0128 + by * 0.6 - 0.003 * th, d * 0.029, 0.0078 + by * 0.6 - 0.003 * th, d * 0.0126, -0.0008 + by - 0.002 * th); g.closePath(); };
    g.beginPath(); brow(); g.fillStyle = rgba(H.brow, V.shades != null ? 0.5 : 0.92); g.fill();
  }
  // mouth
  const my = -0.0835, mw = m ? 0.0255 : 0.0265, lip = V.lip || S.lip, cy2 = my + 0.0032 + (V.smile ? 0.002 : 0);
  if (m) {
    g.beginPath(); g.moveTo(-mw, cy2); g.quadraticCurveTo(0, my - 0.003, mw, cy2); line(g, S.deep + '0.75)', 0.0022);
    g.beginPath(); g.moveTo(-mw + 0.004, cy2 - 0.002); g.bezierCurveTo(-0.012, my - 0.011, 0.012, my - 0.011, mw - 0.004, cy2 - 0.002); g.bezierCurveTo(0.012, my - 0.003, -0.012, my - 0.003, -mw + 0.004, cy2 - 0.002); g.fillStyle = mix(S.lip, S.mid, 0.45); g.fill();
    soft(g, PX, () => ell(g, 0, my - 0.016, 0.014, 0.003), S.sh + '0.4)', 0.004);
    if (V.beard) { soft(g, PX, () => { g.moveTo(-0.066, -0.03); g.quadraticCurveTo(-0.06, -0.1, 0, -0.118); g.quadraticCurveTo(0.06, -0.1, 0.066, -0.03); g.quadraticCurveTo(0.04, -0.07, 0.026, -0.071); g.quadraticCurveTo(0, -0.066, -0.026, -0.071); g.quadraticCurveTo(-0.04, -0.07, -0.066, -0.03); }, rgba(H.dark, V.beard === 2 ? 0.62 : 0.36), 0.005);
      soft(g, PX, () => { g.moveTo(-0.024, -0.07); g.quadraticCurveTo(0, -0.064, 0.024, -0.07); g.lineTo(0.02, -0.078); g.quadraticCurveTo(0, -0.073, -0.02, -0.078); }, rgba(H.dark, V.beard === 2 ? 0.6 : 0.34), 0.003); }
  } else {
    const upper = () => { g.moveTo(-mw, cy2); g.bezierCurveTo(-0.017, my + 0.0068, -0.0085, my + 0.0104, -0.0036, my + 0.009); g.quadraticCurveTo(0, my + 0.0066, 0.0036, my + 0.009); g.bezierCurveTo(0.0085, my + 0.0104, 0.017, my + 0.0068, mw, cy2); g.bezierCurveTo(0.013, my - 0.0012, 0.005, my + 0.0008, 0, my - 0.0002); g.bezierCurveTo(-0.005, my + 0.0008, -0.013, my - 0.0012, -mw, cy2); g.closePath(); };
    const open = V.smile ? 0.0052 : 0, yo = my - open;
    const lower = () => { g.moveTo(-mw + 0.0008, cy2 - open * 0.1); g.bezierCurveTo(-0.014, yo - 0.0012, 0.014, yo - 0.0012, mw - 0.0008, cy2 - open * 0.1); g.bezierCurveTo(0.019, yo - 0.0142, -0.019, yo - 0.0142, -mw + 0.0008, cy2 - open * 0.1); g.closePath(); };
    soft(g, PX, () => ell(g, 0, yo - 0.0128, 0.015, 0.0028), S.sh + '0.4)', 0.004);
    if (open) { g.beginPath(); g.moveTo(-mw + 0.003, cy2 - 0.0006); g.bezierCurveTo(-0.012, my, 0.012, my, mw - 0.003, cy2 - 0.0006); g.bezierCurveTo(0.016, yo - 0.004, -0.016, yo - 0.004, -mw + 0.003, cy2 - 0.0006); g.closePath(); g.fillStyle = '#f6f1ea'; g.fill(); line(g, 'rgba(60,20,24,0.6)', 0.0008); }
    g.beginPath(); lower(); g.fillStyle = lg(g, 0, yo, 0, yo - 0.0115, [[0, shade(lip, 0.86)], [0.45, lip], [1, shade(lip, 0.84)]]); g.fill();
    soft(g, PX, () => ell(g, -0.0025, yo - 0.0052, 0.009, 0.002), 'rgba(255,232,230,0.75)', 0.0024);
    g.beginPath(); upper(); g.fillStyle = lg(g, 0, my + 0.0102, 0, my - 0.001, [[0, lip], [0.4, shade(lip, 0.86)], [1, shade(lip, 0.66)]]); g.fill();
    if (!open) { g.beginPath(); g.moveTo(-mw - 0.001, cy2 + 0.0004); g.bezierCurveTo(-0.013, my - 0.001, -0.005, my + 0.0008, 0, my - 0.0002); g.bezierCurveTo(0.005, my + 0.0008, 0.013, my - 0.001, mw + 0.001, cy2 + 0.0004); line(g, 'rgba(84,22,32,0.8)', 0.001); }
    for (const d of [-1, 1]) soft(g, PX, () => ell(g, d * (mw + 0.003), cy2 + 0.0006, 0.0028, 0.003), S.sh + '0.4)', 0.003);
  }
  g.restore();
  if (V.shades != null) shadesOn(g, V.shades, ey, m);
  hairFront(g, PX, V, H, m);
  if (!m && V.ear) for (const d of [-1, 1]) {   // earrings: hoop / drop / stud
    if (V.ear === 1) { g.beginPath(); ell(g, d * 0.0735, -0.058, 0.012, 0.016); line(g, '#e6c476', 0.0028); }
    else if (V.ear === 2) { g.beginPath(); g.moveTo(d * 0.072, -0.04); g.lineTo(d * 0.0726, -0.058); line(g, '#e6c476', 0.0014); g.beginPath(); ell(g, d * 0.0728, -0.066, 0.0046, 0.009); g.fillStyle = rgd(g, d * 0.072, -0.062, 0.0005, 0.009, [[0, '#fff6d8'], [0.5, '#e6c476'], [1, '#9a7732']]); g.fill(); }
    else { g.beginPath(); ell(g, d * 0.0715, -0.042, 0.0042, 0.0042); g.fillStyle = '#f4f8ff'; g.fill(); }
  }
  if (V.hat === 1) {   // wide-brimmed straw hat with a ribbon
    const c = V.hatCol || '#e8d8b0';
    g.beginPath(); ell(g, 0, 0.062, 0.2, 0.034); g.fillStyle = lg(g, -0.2, 0, 0.2, 0, [[0, shade(c, 0.74)], [0.4, c], [0.6, shade(c, 1.04)], [1, shade(c, 0.7)]]); g.fill();
    g.beginPath(); curve(g, [[-0.078, 0.062], [-0.07, 0.125], [-0.03, 0.148], [0.03, 0.148], [0.07, 0.125], [0.078, 0.062], [0, 0.05]]); g.fillStyle = lg(g, -0.08, 0, 0.08, 0, [[0, shade(c, 0.8)], [0.45, shade(c, 1.05)], [1, shade(c, 0.74)]]); g.fill();
    g.beginPath(); g.moveTo(-0.078, 0.066); g.quadraticCurveTo(0, 0.05, 0.078, 0.066); g.lineTo(0.076, 0.084); g.quadraticCurveTo(0, 0.068, -0.076, 0.084); g.closePath(); g.fillStyle = V.ribbon || '#1c2c5c'; g.fill();
    soft(g, PX, () => ell(g, 0, 0.04, 0.07, 0.008), 'rgba(40,24,10,0.4)', 0.008);
  } else if (V.hat === 2) {   // panama / fedora
    const c = V.hatCol || '#f2ecdc';
    g.beginPath(); ell(g, 0, 0.066, 0.125, 0.02); g.fillStyle = lg(g, -0.125, 0, 0.125, 0, [[0, shade(c, 0.74)], [0.45, c], [1, shade(c, 0.7)]]); g.fill();
    g.beginPath(); curve(g, [[-0.076, 0.068], [-0.066, 0.132], [-0.024, 0.142], [0, 0.132], [0.024, 0.142], [0.066, 0.132], [0.076, 0.068], [0, 0.058]]); g.fillStyle = lg(g, -0.08, 0, 0.08, 0, [[0, shade(c, 0.8)], [0.45, shade(c, 1.04)], [1, shade(c, 0.72)]]); g.fill();
    g.beginPath(); g.moveTo(-0.076, 0.07); g.quadraticCurveTo(0, 0.058, 0.076, 0.07); g.lineTo(0.074, 0.088); g.quadraticCurveTo(0, 0.076, -0.074, 0.088); g.closePath(); g.fillStyle = V.ribbon || '#22201e'; g.fill();
  } else if (V.hat === 3) {   // cap
    const c = V.hatCol || '#f4f0ea';
    g.beginPath(); curve(g, [[-0.076, 0.045], [-0.07, 0.11], [-0.03, 0.134], [0.03, 0.134], [0.07, 0.11], [0.076, 0.045], [0, 0.06]]); g.fillStyle = lg(g, -0.08, 0, 0.08, 0, [[0, shade(c, 0.78)], [0.45, c], [1, shade(c, 0.72)]]); g.fill();
    g.beginPath(); curve(g, [[-0.078, 0.05], [0, 0.066], [0.078, 0.05], [0.06, 0.03], [0, 0.036], [-0.06, 0.03]]); g.fillStyle = shade(c, 0.7); g.fill();
  }
}

// ------------------------------------------------------------------ swimwear
const TOP_SHAPES = {
  triangle: (p, d) => curve(p, [[d * 0.086, 0.098], [d * 0.118, 0.04], [d * 0.151, -0.04], [d * 0.14, -0.058], [d * 0.075, -0.068], [d * 0.014, -0.05], [d * 0.03, 0.0]]),
  balconette: (p, d) => curve(p, [[d * 0.01, -0.012], [d * 0.014, -0.055], [d * 0.078, -0.074], [d * 0.148, -0.056], [d * 0.153, 0.0], [d * 0.136, 0.05], [d * 0.074, 0.044], [d * 0.034, 0.016]]),
};
function paintTop(g, PX, V, B) {
  const cut = V.top, y0 = 1.262, a = B.tl(y0), c = B.at(0, y0), bw = (V.bust ?? 1);
  g.save(); g.clip(B.torso); g.translate(c[0], c[1]); g.rotate(a); g.scale(bw, 1);
  const p = new Path2D(), box = [-0.19, -0.11, 0.19, 0.22], cc = V.fabTop[1], st = shade(cc, 0.8);
  const strap = (pts, w = 0.0075) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); line(g, V.fabTop[0] === 'metal' ? V.fabTop[1] : st, w); };
  if (cut === 'triangle' || cut === 'wrap') {
    for (const d of [-1, 1]) { TOP_SHAPES.triangle(p, d); strap([[d * 0.088, 0.094], [d * 0.046, 0.185]], 0.006); }
    strap([[-0.19, -0.058], [0.19, -0.058]], 0.007);
    if (cut === 'wrap') { strap([[-0.14, -0.06], [0.08, -0.16]], 0.006); strap([[0.14, -0.06], [-0.08, -0.16]], 0.006); strap([[-0.19, -0.165], [0.19, -0.165]], 0.006); }
  } else if (cut === 'balconette') {
    for (const d of [-1, 1]) { TOP_SHAPES.balconette(p, d); strap([[d * 0.124, 0.046], [d * 0.118, 0.16]], 0.008); }
    strap([[-0.19, -0.05], [0.19, -0.05]], 0.012);
  } else if (cut === 'bandeau') {
    curve(p, [[-0.2, -0.078], [0.2, -0.078], [0.2, 0.05], [0.09, 0.064], [0.02, 0.044], [0, 0.03], [-0.02, 0.044], [-0.09, 0.064], [-0.2, 0.05]]);
  } else if (cut === 'halter') {
    curve(p, [[0, 0.04], [0.03, 0.1], [0.024, 0.2], [0.05, 0.2], [0.11, 0.09], [0.158, 0.02], [0.2, -0.02], [0.2, -0.082], [-0.2, -0.082], [-0.2, -0.02], [-0.158, 0.02], [-0.11, 0.09], [-0.05, 0.2], [-0.024, 0.2], [-0.03, 0.1]]);
  } else if (cut === 'sporty') {
    curve(p, [[0, 0.075], [0.05, 0.1], [0.072, 0.158], [0.118, 0.158], [0.128, 0.08], [0.165, 0.03], [0.2, 0.0], [0.2, -0.1], [-0.2, -0.1], [-0.2, 0.0], [-0.165, 0.03], [-0.128, 0.08], [-0.118, 0.158], [-0.072, 0.158], [-0.05, 0.1]]);
  } else {   // one-shoulder
    curve(p, [[-0.2, -0.085], [0.2, -0.085], [0.2, 0.02], [0.14, 0.085], [0.125, 0.158], [0.075, 0.158], [0.03, 0.07], [-0.09, 0.04], [-0.2, 0.035]]);
  }
  soft(g, PX, () => { for (const d of [-1, 1]) ell(g, d * 0.076, -0.07, 0.062, 0.014); }, SKIN[V.skin].sh + '0.4)', 0.01);   // shade under the bust
  fabric(g, PX, p, V.fabTop, box, V.seed);
  g.save(); g.clip(p);
  for (const d of [-1, 1]) {   // form: a light on each cup, shade below and between
    soft(g, PX, () => ell(g, d * 0.07 - 0.022, 0.03, 0.036, 0.02, -0.5), 'rgba(255,255,255,0.26)', 0.024);
    soft(g, PX, () => { g.moveTo(d * 0.018, -0.045); g.quadraticCurveTo(d * 0.08, -0.085, d * 0.15, -0.035); g.quadraticCurveTo(d * 0.08, -0.06, d * 0.018, -0.045); }, 'rgba(0,0,0,0.38)', 0.01);
    soft(g, PX, () => ell(g, d * 0.158, -0.01, 0.01, 0.05), 'rgba(0,0,0,0.3)', 0.012);
  }
  soft(g, PX, () => ell(g, 0, -0.012, 0.007, 0.04), 'rgba(0,0,0,0.3)', 0.009);
  if (cut === 'sporty') { g.fillStyle = rgba(V.fabBot[1], 0.95); g.fillRect(-0.2, -0.1, 0.4, 0.022); }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 0.0016; g.stroke(p);
  if (cut === 'bandeau' || cut === 'triangle' || cut === 'balconette') { g.beginPath(); ell(g, 0, cut === 'bandeau' ? 0.0 : -0.04, 0.011, 0.011); line(g, '#e6c476', 0.0045); }
  g.restore();
}
function paintBottom(g, PX, V, B) {
  const cut = V.bottom, D = B.D, P = B.at(0, D.yHip), Hh = B.hwAt(D.yHip), clip = new Path2D();
  clip.addPath(B.torso); for (const l of B.legs) clip.addPath(l.path);
  g.save(); g.clip(clip); g.translate(P[0], P[1]); g.rotate(B.ht);
  const p = new Path2D(), W = Hh + 0.03;
  if (cut === 'boyshort') curve(p, [[-W, 0.06], [0, 0.04], [W, 0.06], [W + 0.02, -0.12], [0.03, -0.128], [0, -0.108], [-0.03, -0.128], [-W - 0.02, -0.12]]);
  else {
    const top = cut === 'highwaist' ? 0.158 : cut === 'highleg' ? 0.088 : 0.05, dip = cut === 'highwaist' ? 0.15 : cut === 'highleg' ? 0.034 : 0.034, side = cut === 'highwaist' ? 0.0 : cut === 'highleg' ? 0.056 : cut === 'sidetie' ? 0.03 : 0.008;
    const hl = cut === 'highleg', leg = (d) => [[d * W, side], [d * (Hh - (hl ? 0.008 : 0.03)), side - (hl ? 0.04 : 0.03)], [d * (hl ? 0.122 : 0.105), hl ? -0.036 : -0.052], [d * 0.052, -0.095], [d * 0.03, -0.112]];
    const R = leg(1), L = leg(-1).reverse();
    p.moveTo(-W, top); p.quadraticCurveTo(0, dip - (top - dip), W, top); p.lineTo(R[0][0], R[0][1]); curve(p, R, false, false); p.lineTo(0, -0.116); p.lineTo(L[0][0], L[0][1]); curve(p, L, false, false); p.closePath();
  }
  fabric(g, PX, p, V.fabBot, [-0.24, -0.16, 0.24, 0.2], V.seed + 2);
  g.save(); g.clip(p);
  for (const d of [-1, 1]) { if (cut !== 'boyshort') soft(g, PX, () => ell(g, d * 0.07, -0.085, 0.05, 0.012, d * 0.7), 'rgba(0,0,0,0.16)', 0.014); soft(g, PX, () => ell(g, d * (Hh - 0.01), 0.03, 0.02, 0.08), 'rgba(0,0,0,0.24)', 0.014); }
  soft(g, PX, () => ell(g, -0.02, 0.0, 0.05, 0.03), 'rgba(255,255,255,0.2)', 0.03);
  if (cut === 'highwaist') { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(-0.3, 0.128, 0.6, 0.008); for (const x of [-0.03, 0.03]) for (const y of [0.1, 0.06]) { g.beginPath(); ell(g, x, y, 0.006, 0.006); g.fillStyle = '#e6c476'; g.fill(); } }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 0.0016; g.stroke(p);
  g.restore();
  if (cut === 'sidetie') for (const d of [-1, 1]) {   // bows at the hips
    const q = B.at(d * (Hh - 0.004), D.yHip + 0.036), c = V.fabBot[0] === 'metal' ? V.fabBot[1] : shade(V.fabBot[1], 0.9);
    for (const a of [0.5, -0.4]) { g.beginPath(); ell(g, q[0] + d * 0.014, q[1] + a * 0.03, 0.016, 0.008, d * a); line(g, c, 0.0052); }
    for (const a of [0.2, 0.5]) { g.beginPath(); g.moveTo(q[0], q[1]); g.quadraticCurveTo(q[0] + d * 0.02, q[1] - 0.03, q[0] + d * (0.01 + a * 0.03), q[1] - 0.075); line(g, c, 0.0046); }
  }
}
function paintTrunks(g, PX, V, B) {
  const D = B.D, p = new Path2D(), top = 1.085, Hh = B.hwAt(D.yHip) + 0.016;
  const R = B.at(Hh, top), L = B.at(-Hh, top);
  curve(p, [L, B.at(0, top - 0.012), R, B.at(Hh + 0.012, D.yHip), B.at(Hh + 0.008, D.yCr + 0.02), [B.hs, D.yCr - 0.04], B.at(-Hh - 0.008, D.yCr + 0.02), B.at(-Hh - 0.012, D.yHip)]);
  for (const l of B.legs) { const t = V.short ? 0.42 : 0.62, e = [lerp(l.J[0], l.K[0], t), lerp(l.J[1], l.K[1], t)], q = new Path2D(); tube(q, [[l.J[0], l.J[1] + 0.05, 0.105], [lerp(l.J[0], e[0], 0.5), lerp(l.J[1], e[1], 0.5), 0.104], [e[0], e[1], 0.1]]); p.addPath(q); }
  fabric(g, PX, p, V.fabBot, [-0.3, 0.5, 0.3, 1.12], V.seed + 2);
  g.save(); g.clip(p);
  soft(g, PX, () => ell(g, B.hs, D.yCr - 0.06, 0.012, 0.12), 'rgba(0,0,0,0.42)', 0.014);
  for (const d of [-1, 1]) soft(g, PX, () => ell(g, B.hs + d * 0.2, 0.84, 0.02, 0.16), 'rgba(0,0,0,0.3)', 0.016);
  g.restore();
  const wa = B.at(-Hh, top - 0.012), wb = B.at(Hh, top - 0.012); g.beginPath(); g.moveTo(wa[0], wa[1]); g.quadraticCurveTo(B.hs, top - 0.028, wb[0], wb[1]); line(g, 'rgba(0,0,0,0.28)', 0.012);
  for (const d of [-1, 1]) { g.beginPath(); g.moveTo(B.hs + d * 0.008, top - 0.02); g.quadraticCurveTo(B.hs + d * 0.03, top - 0.07, B.hs + d * 0.018, top - 0.11); line(g, '#f4f0ea', 0.004); }
}
function paintSarong(g, PX, V, B) {
  const D = B.D, yT = 0.958, L = V.sarong, len = L === 1 ? 0.3 : L === 2 ? 0.52 : 0.8, hw = B.hwAt(yT) + 0.012, a = B.at(-hw, yT), b = B.at(hw, yT - 0.012), p = new Path2D();
  const wide = Math.max(hw + 0.03, Math.abs(B.legs[1].K[0]) + 0.08, Math.abs(B.legs[0].K[0]) + 0.08);
  curve(p, [a, B.at(0, yT - 0.02), b, [b[0] + 0.012, yT - 0.12], [B.hs + wide + 0.03, yT - len * 0.75], [B.hs + wide + 0.02, yT - len], [B.hs + 0.02, yT - len * 0.86], [B.hs - wide * 0.7, yT - len * 0.5], [a[0] - 0.012, yT - 0.16]]);
  fabric(g, PX, p, V.fabSar, [B.hs - 0.36, yT - len - 0.05, B.hs + 0.36, yT + 0.03], V.seed + 4);
  g.save(); g.clip(p);
  for (const k of [0.15, 0.4, 0.62, 0.85]) soft(g, PX, () => { g.moveTo(a[0] + 0.02, a[1] - 0.01); g.quadraticCurveTo(lerp(a[0], b[0] + 0.05, k), yT - len * 0.4, lerp(a[0], B.hs + wide, k) + 0.02, yT - len); g.lineTo(lerp(a[0], B.hs + wide, k) + 0.034, yT - len); g.quadraticCurveTo(lerp(a[0], b[0] + 0.05, k) + 0.01, yT - len * 0.4, a[0] + 0.026, a[1] - 0.01); }, 'rgba(0,0,0,0.3)', 0.006);
  soft(g, PX, () => ell(g, B.hs + 0.07, yT - len * 0.4, 0.03, len * 0.3), 'rgba(255,255,255,0.22)', 0.03);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 0.0016; g.stroke(p);
  const c = V.fabSar[0] === 'metal' ? V.fabSar[1] : shade(V.fabSar[1], 0.9);   // the knot and its tails at the hip
  for (const t of [0, 1]) { const p2 = new Path2D(); tube(p2, [[a[0] + 0.02, a[1] - 0.016, 0.012], [a[0] + 0.004 - t * 0.016, a[1] - 0.07, 0.016], [a[0] + 0.006 - t * 0.024, a[1] - 0.13 - t * 0.02, 0.008]]); g.fillStyle = shade(c, t ? 0.82 : 0.94); g.fill(p2); g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 0.0014; g.stroke(p2); }
  g.beginPath(); ell(g, a[0] + 0.022, a[1] - 0.012, 0.017, 0.013, 0.5); g.fillStyle = c; g.fill(); line(g, 'rgba(0,0,0,0.25)', 0.0014);
}

// ------------------------------------------------------------------ the whole figure
function paintLeg(g, PX, V, B, l) {
  const S = SKIN[V.skin], { J, K, A, d } = l, m = B.m;
  // foot first (under the ankle)
  const heel = V.shoes === 'heel', fy = A[1], fx = A[0];
  if (heel) {
    g.beginPath(); curve(g, [[fx - 0.028, fy + 0.012], [fx - 0.034, fy - 0.06], [fx - 0.03, fy - 0.1], [fx, fy - 0.11], [fx + 0.03, fy - 0.1], [fx + 0.034, fy - 0.06], [fx + 0.028, fy + 0.012]]); g.fillStyle = lg(g, fx - 0.04, 0, fx + 0.04, 0, [[0, S.mid], [0.4, S.lt], [1, S.mid]]); g.fill();
    const c = V.shoeCol || '#141416'; g.beginPath(); curve(g, [[fx - 0.036, fy - 0.058], [fx - 0.034, fy - 0.105], [fx - 0.014, fy - 0.136], [fx, fy - 0.144], [fx + 0.014, fy - 0.136], [fx + 0.034, fy - 0.105], [fx + 0.036, fy - 0.058], [fx, fy - 0.072]]); g.fillStyle = lg(g, fx - 0.036, 0, fx + 0.036, 0, [[0, shade(c, 0.66)], [0.35, c], [0.5, mix(c, '#ffffff', 0.35)], [0.7, c], [1, shade(c, 0.6)]]); g.fill();
    g.beginPath(); g.moveTo(fx - 0.027, fy - 0.004); g.quadraticCurveTo(fx, fy - 0.022, fx + 0.027, fy - 0.004); line(g, c, 0.0065);
  } else {
    g.beginPath(); curve(g, [[fx - 0.028, fy + 0.012], [fx - 0.04 - (d < 0 ? 0.006 : 0), fy - 0.036], [fx - 0.036, fy - 0.066], [fx, fy - 0.075], [fx + 0.036, fy - 0.066], [fx + 0.04 + (d > 0 ? 0.006 : 0), fy - 0.036], [fx + 0.028, fy + 0.012]]); g.fillStyle = lg(g, fx - 0.045, 0, fx + 0.045, 0, [[0, S.mid], [0.4, S.lt], [1, S.mid]]); g.fill();
    for (let k = 0; k < 4; k++) { const x = fx + (k - 1.5) * 0.016; g.beginPath(); g.moveTo(x, fy - 0.058); g.lineTo(x, fy - 0.072); line(g, S.sh + '0.4)', 0.0012); }
    if (V.shoes === 'sandal') { const c = V.shoeCol || '#c9a45c'; g.beginPath(); g.moveTo(fx - 0.04, fy - 0.04); g.quadraticCurveTo(fx, fy - 0.028, fx + 0.04, fy - 0.04); line(g, c, 0.008); g.beginPath(); g.moveTo(fx - 0.034, fy - 0.07); g.quadraticCurveTo(fx, fy - 0.082, fx + 0.034, fy - 0.07); line(g, shade(c, 0.6), 0.006); }
  }
  skinPart(g, S, PX, l.path, 0.032);
  g.save(); g.clip(l.path);
  const mt = (t, a, b) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  { const a = mt(0.2, J, K), b = mt(0.85, J, K); soft(g, PX, () => capsule(g, a[0] - 0.014, a[1], 0.014, b[0] - 0.008, b[1], 0.008), S.gl + '0.42)', 0.016); }                   // thigh light
  { const a = mt(0.12, K, A), b = mt(0.85, K, A); soft(g, PX, () => capsule(g, a[0] - 0.006, a[1], 0.007, b[0] - 0.004, b[1], 0.004), S.gl + '0.5)', 0.008); }                      // shin light
  soft(g, PX, () => ell(g, K[0], K[1] + 0.032, 0.024, 0.005), S.sh + '0.16)', 0.01); soft(g, PX, () => ell(g, K[0] + 0.004, K[1] - 0.03, 0.018, 0.005), S.sh + '0.2)', 0.01);        // knee
  soft(g, PX, () => ell(g, K[0] - 0.006, K[1] + 0.002, 0.012, 0.014), S.gl + '0.3)', 0.01);
  { const a = mt(0.1, J, K), b = mt(0.8, J, K); soft(g, PX, () => capsule(g, a[0] - d * 0.075, a[1], 0.014, b[0] - d * 0.045, b[1], 0.008), S.sh + '0.3)', 0.014); }                  // inner thigh shade
  if (m) { const a = mt(0.2, K, A); soft(g, PX, () => ell(g, a[0] + d * 0.03, a[1], 0.012, 0.07), S.sh + '0.3)', 0.012); }
  g.restore();
  if (V.anklet && d > 0 && !heel) { g.beginPath(); g.ellipse(A[0], A[1] + 0.02, 0.03, 0.006, 0, 0, TAU); line(g, '#e6c476', 0.003); }
}
function paintTorso(g, PX, V, B) {
  const S = SKIN[V.skin], D = B.D, m = B.m, cx = (B.hs + B.C[0]) / 2;
  skinPart(g, S, PX, B.torso, 0.045, 0.85);
  g.save(); g.clip(B.torso);
  const T = (x, y) => B.at(x, y), e = (x, y, rx, ry, col, bl, rot = 0) => { const p = T(x, y); soft(g, PX, () => ell(g, p[0], p[1], rx, ry, rot + B.tl(y)), col, bl); };
  if (m) {
    for (const d of [-1, 1]) {
      { const a = T(d * 0.02, 1.325), b = T(d * 0.1, 1.3), c = T(d * 0.185, 1.345); soft(g, PX, () => { g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1] - 0.03, c[0], c[1]); g.quadraticCurveTo(b[0], b[1] - 0.008, a[0], a[1]); }, S.sh + '0.5)', 0.009); }   // under the pec
      e(d * 0.095, 1.385, 0.05, 0.03, S.gl + '0.36)', 0.03); e(d * 0.2, 1.44, 0.03, 0.03, S.gl + '0.3)', 0.02);
      e(d * 0.045, 1.2, 0.028, 0.02, S.gl + '0.22)', 0.012); e(d * 0.045, 1.14, 0.028, 0.02, S.gl + '0.2)', 0.012); e(d * 0.045, 1.08, 0.026, 0.02, S.gl + '0.16)', 0.012);
      e(d * 0.094, 1.17, 0.005, 0.1, S.sh + '0.26)', 0.008); e(d * 0.15, 1.2, 0.016, 0.1, S.sh + '0.3)', 0.014);
      e(d * 0.016, 1.47, 0.05, 0.004, S.sh + '0.3)', 0.005, d * 0.12);
    }
    e(0, 1.36, 0.004, 0.05, S.sh + '0.4)', 0.006); e(0, 1.16, 0.0035, 0.09, S.sh + '0.36)', 0.005);
    for (const y of [1.235, 1.17, 1.11]) e(0, y, 0.06, 0.0025, S.sh + '0.2)', 0.005);
    { const p = T(0, 1.075); g.beginPath(); ell(g, p[0], p[1], 0.004, 0.007); g.fillStyle = S.deep + '0.6)'; g.fill(); }
  } else {
    for (const d of [-1, 1]) {
      { const a = T(d * 0.016, 1.431), b = T(d * 0.072, 1.447), c = T(d * 0.136, 1.43); soft(g, PX, () => { g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1], c[0], c[1]); g.quadraticCurveTo(b[0], b[1] - 0.008, a[0], a[1] - 0.005); }, S.gl + '0.5)', 0.004);
        soft(g, PX, () => { g.moveTo(a[0], a[1] - 0.009); g.quadraticCurveTo(b[0], b[1] - 0.012, c[0], c[1] - 0.008); g.quadraticCurveTo(b[0], b[1] - 0.02, a[0], a[1] - 0.016); }, S.sh + '0.3)', 0.005); }   // collarbone
      e(d * 0.16, 1.4, 0.02, 0.016, S.gl + '0.42)', 0.012);
      e(d * 0.05, 1.32, 0.03, 0.022, S.gl + '0.42)', 0.016);                                   // upper bust
      e(d * 0.122, 1.12, 0.016, 0.085, S.sh + '0.3)', 0.016);                                  // waist sides
      e(d * 0.034, 1.11, 0.016, 0.06, S.gl + '0.24)', 0.014);
      e(d * 0.105, 0.972, 0.022, 0.014, S.gl + '0.3)', 0.014, -d * 0.5);                       // hip bone
    }
    e(0, 1.437, 0.008, 0.006, S.sh + '0.36)', 0.004);
    e(0, 1.3, 0.0034, 0.03, S.deep + '0.3)', 0.005);                                           // between the bust, above the top
    e(0, 1.105, 0.0034, 0.07, S.sh + '0.34)', 0.006);                                          // midline
    e(0, 0.965, 0.05, 0.028, S.gl + '0.22)', 0.03);
    { const p = T(0, 1.022); g.beginPath(); ell(g, p[0], p[1], 0.0036, 0.008); g.fillStyle = S.deep + '0.62)'; g.fill(); soft(g, PX, () => ell(g, p[0], p[1] - 0.012, 0.008, 0.004), S.gl + '0.5)', 0.004); }
  }
  g.restore();
}
function paintNeck(g, PX, V, B) {
  const S = SKIN[V.skin], D = B.D, a = [B.C[0], D.yS + 0.03], b = B.neckTop, r = D.neck, p = new Path2D();
  tube(p, [[a[0], a[1], r * 1.22], [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5), r * 1.02], [b[0], b[1] + 0.02, r]]);
  skinPart(g, S, PX, p, 0.016);
  g.save(); g.clip(p); soft(g, PX, () => ell(g, b[0] + 0.004, b[1] + 0.006, 0.05, 0.03), S.sh + '0.62)', 0.014); g.restore();
}
export function paintFigure(g, PX, V) {
  const B = skeleton(V), D = B.D, S = SKIN[V.skin], m = B.m, P = B.P, H = HAIR[V.tone] || HAIR.brunette;
  const lift = V.shoes === 'heel' ? 0.068 : 0;
  g.save(); g.scale(V.k, V.k); g.translate(0, lift);
  const headXf = () => { g.translate(B.neckTop[0], D.hc); g.rotate(P.hd * (m ? 0.5 : 1)); g.scale(D.hk, D.hk); };
  // hair behind the body
  if (!m) { g.save(); headXf(); hairBack(g, PX, V, H); g.restore(); }
  paintNeck(g, PX, V, B);
  paintTorso(g, PX, V, B);
  { // the legs join the pelvis along the groin line (hip → crotch → hip); above it the body is torso
    const yh = D.yHip + 0.085, a = B.at(-B.hwAt(yh) - 0.03, yh), b = B.at(B.hwAt(yh) + 0.03, yh), v = new Path2D();
    v.moveTo(a[0] - 0.3, a[1]); v.lineTo(a[0], a[1]); v.quadraticCurveTo(B.hs - 0.07, D.yCr + 0.05, B.hs, D.yCr + 0.012); v.quadraticCurveTo(B.hs + 0.07, D.yCr + 0.05, b[0], b[1]); v.lineTo(b[0] + 0.3, b[1]); v.lineTo(b[0] + 0.3, -0.2); v.lineTo(a[0] - 0.3, -0.2); v.closePath();
    g.save(); g.clip(v); for (const l of B.legs) paintLeg(g, PX, V, B, l); g.restore(); }
  if (m) paintTrunks(g, PX, V, B); else { paintBottom(g, PX, V, B); paintTop(g, PX, V, B); if (V.sarong) paintSarong(g, PX, V, B); }
  // jewellery on the body
  if (!m && V.belly) { const a = B.at(-B.hwAt(1.0), 1.0), b = B.at(B.hwAt(1.0), 1.0), c = B.at(0, 0.975); g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1] - 0.012, b[0], b[1]); g.setLineDash([0.004, 0.003]); line(g, '#f0d79a', 0.003); g.setLineDash([]); g.beginPath(); ell(g, c[0], c[1] - 0.022, 0.004, 0.006); g.fillStyle = '#f0d79a'; g.fill(); }
  if (V.neckl) { const a = B.at(-0.045, D.yS + 0.045), b = B.at(0.045, D.yS + 0.045), c = B.at(0, D.yS - (V.neckl === 2 ? 0.1 : 0.045)); g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1] - 0.03, b[0], b[1]); line(g, m ? 'rgba(200,204,212,0.95)' : 'rgba(226,190,112,0.98)', 0.0022); g.beginPath(); ell(g, c[0], c[1] - 0.002, 0.005, 0.007); g.fillStyle = m ? '#c8ccd4' : rgd(g, c[0], c[1], 0.0005, 0.007, [[0, '#fff6d8'], [0.5, '#e6c476'], [1, '#9a7732']]); g.fill(); }
  // arms: the viewer's right arm by pose; the left one too when the figure has no hinged arm
  const arms = [[1, P.arm]]; if (V.both) arms.push([-1, P.arm2 || 'hang']);
  for (const [d, kind] of arms) { const J = armJoints(B, d, kind); paintArm(g, PX, V, B, J, { bangle: !m && d > 0 ? V.bangle : 0, watch: m && d > 0 && V.watch });
    if (kind === 'glass') { const w = J.W; glass(g, w[0], w[1] + 0.07, 1); hand(g, S, w[0], w[1] + 0.005, 0, m ? 1.1 : 0.95); } }
  g.save(); headXf(); head(g, PX, V, B); g.restore();
  if (V.wet) {   // wet skin: small bright highlights and drops on the shoulders and chest
    g.save(); g.clip(B.torso); const r = rng(V.seed + 77);
    for (const d of [-1, 1]) { const p = B.at(d * (D.sh - 0.035), D.yS - 0.012); soft(g, PX, () => ell(g, p[0], p[1], 0.022, 0.007, -d * 0.4), 'rgba(255,255,255,0.75)', 0.005); }
    for (let i = 0; i < 26; i++) { const p = B.at((r() - 0.5) * 0.3, lerp(D.yS - 0.2, D.yS + 0.02, r())); g.beginPath(); ell(g, p[0], p[1], 0.0022, 0.0034); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fill(); }
    g.restore();
  }
  g.restore();
  return B;
}
// the hinged arm of the viewer's left side, drawn from the pivot at the origin. mode 0: hanging; 1: bent up with a glass;
// 2: bent for dancing (the forearm out to the side — raised, it is a hand in the air)
export function paintArmSprite(g, PX, sex, skin, mode, k = 1) {
  const D = DIM[sex], S = SKIN[skin], V = { skin, sex }, B = { D, m: sex === 'm' }, o = { bangle: sex === 'w' ? 1 : 0, watch: sex === 'm' };
  g.save(); g.scale(k, k);
  if (mode === 0) paintArm(g, PX, V, B, { S: [0, 0], E: [-0.03, -D.ua], W: [-0.036, -D.ua - D.fa], kind: 'hang' }, o);
  else if (mode === 2) paintArm(g, PX, V, B, { S: [0, 0], E: [-0.02, -D.ua * 0.96], W: [-0.02 - D.fa * 0.8, -D.ua * 0.96 + 0.055], kind: 'out' }, o);
  else { const J = { S: [0, 0], E: [-0.035, -D.ua * 0.96], W: [0.085, -D.ua * 0.96 + D.fa * 0.74], kind: 'glass' }; paintArm(g, PX, V, B, J, { bangle: o.bangle }); glass(g, J.W[0] + 0.03, J.W[1] + 0.075, 1); hand(g, S, J.W[0] + 0.022, J.W[1] + 0.012, 0.5, sex === 'm' ? 1.1 : 0.95); }
  g.restore();
}

// ------------------------------------------------------------------ variants: mix and match
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
function shuffled(r, a) { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = o[i]; o[i] = o[j]; o[j] = t; } return o; }
// one guest: spec = { kind: 'stand' | 'dance' | 'lounge' | 'swim', sex, heels, … overrides }
function variant(spec, i, r, deck) {
  const sex = spec.sex || 'w', kind = spec.kind || 'stand', m = sex === 'm';
  const V = { sex, kind, seed: 101 + i * 37 + Math.floor(r() * 9999), pose: m && kind === 'dance' ? pick(r, ['hip', 'sway', 'stand', 'close']) : m && kind === 'lounge' ? 'lounge3' : deck.pose(kind), skin: m ? pick(r, [1, 2, 3]) : deck.skin(), both: kind === 'lounge' || kind === 'swim', wet: kind === 'swim' };
  V.k = (m ? lerp(1.78, 1.9, r()) : lerp(1.65, 1.78, r())) / DIM[sex].H;
  V.iris = Math.floor(r() * 5); V.neckl = r() < 0.55 ? 1 + (r() < 0.35 ? 1 : 0) : 0;
  if (m) {
    V.hair = pick(r, M_HAIR); V.tone = V.skin >= 3 ? pick(r, ['black', 'dark']) : pick(r, M_TONES); V.beard = pick(r, [0, 1, 1, 2]); V.fabBot = deck.trunks(); V.short = r() < 0.4; V.watch = r() < 0.6;
    V.shades = r() < 0.4 ? pick(r, [0, 3]) : null; V.hat = kind !== 'swim' && r() < 0.18 ? pick(r, [2, 3]) : 0; if (V.hat) V.hair = 'buzz'; V.shoes = 'bare'; V.neckl = r() < 0.3 ? 1 : 0;
    V.waist = lerp(0.96, 1.06, r());
  } else {
    V.hair = kind === 'swim' ? pick(r, ['wet', 'wet', 'pony', 'bun', 'braid']) : deck.hair(); V.tone = V.skin >= 4 ? pick(r, ['black', 'dark', 'black', 'honey']) : V.skin === 3 ? pick(r, ['black', 'dark', 'brunette', 'honey', 'auburn']) : deck.tone();
    V.part = r() < 0.5 ? -0.02 : 0.016;
    V.top = deck.top(); V.bottom = deck.bottom(); if (V.top === 'sporty' && r() < 0.6) V.bottom = 'boyshort';
    const fab = deck.fab(); V.fabTop = fab; V.fabBot = r() < 0.72 ? fab : (fab[0] === 'solid' ? deck.fab() : ['solid', fab[2] && fab[2] !== '#ffffff' ? fab[2] : fab[1]]);
    V.bust = lerp(0.98, 1.07, r()); V.hipF = lerp(0.97, 1.07, r()); V.waist = lerp(0.95, 1.04, r());
    V.sarong = (kind === 'stand' && r() < 0.34) || (kind === 'dance' && r() < 0.12) ? pick(r, [1, 2, 2, 3]) : 0; if (V.sarong) V.fabSar = deck.sarong();
    V.shades = kind !== 'swim' && r() < (deck.night ? 0.12 : 0.42) ? Math.floor(r() * 4) : (kind === 'swim' && r() < 0.2 ? 2 : null);
    V.hat = !deck.night && kind !== 'swim' && ['waves', 'straight', 'lob', 'bob', 'braid'].includes(V.hair) && r() < 0.22 ? pick(r, [1, 1, 2]) : 0; V.hatCol = pick(r, ['#e8d8b0', '#f4eee0', '#d8c090']); V.ribbon = pick(r, ['#1c2c5c', '#e8323c', '#111216', '#12a6a0']);
    V.ear = pick(r, [0, 1, 1, 2, 2, 3]); V.belly = r() < 0.3; V.bangle = pick(r, [0, 1, 1, 2]); V.anklet = r() < 0.3; V.smile = r() < 0.45;
    V.lip = pick(r, [null, null, '#c8323f', '#d2466a', '#b8303c', '#e0607a', '#a83a4a']); V.lid = pick(r, ['rgba(110,70,58,0.5)', 'rgba(90,60,90,0.45)', 'rgba(120,90,50,0.5)', 'rgba(60,70,90,0.42)']);
    V.shoes = spec.heels ? 'heel' : (kind === 'stand' && r() < 0.5 ? 'sandal' : 'bare'); V.shoeCol = spec.heels ? pick(r, ['#141416', '#d8b060', '#c8ccd4', '#e8323c', '#f4f0ea', '#ff5a9c']) : pick(r, ['#c9a45c', '#f4f0ea', '#3a2a1c']);
  }
  Object.assign(V, spec.over || {});
  { // the whole figure — hat, bun, heels and all — has to fit the 1.84 m cell
    const D = DIM[sex], top = D.hc + D.hk * (V.hat === 1 ? 0.152 : V.hat ? 0.146 : V.hair === 'bun' ? 0.188 : V.hair === 'curls' ? 0.156 : V.hair === 'quiff' || V.hair === 'curly' ? 0.146 : 0.13) + (V.shoes === 'heel' ? 0.068 : 0);
    V.k = Math.min(V.k, 1.822 / top); }
  // keep a raised hand inside the cell
  if (POSES[V.pose].arm === 'up' && V.k * (DIM[sex].yS + (V.shoes === 'heel' ? 0.068 : 0) + 0.13 + DIM[sex].fa * 0.86 + 0.09) > 1.83) V.pose = 'dance1';
  return V;
}
function makeDeck(r, night) {   // cycling shuffled decks so that cuts, fabrics, hair and poses never bunch up
  const cyc = (a) => { let q = []; return () => { if (!q.length) q = shuffled(r, a); return q.pop(); }; };
  const poses = {}; for (const k in POSE_SETS) poses[k] = cyc(POSE_SETS[k]);
  return { night, pose: (k) => poses[k](), skin: cyc([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4]), hair: cyc(W_HAIR), tone: cyc(W_TONES), top: cyc(TOPS), bottom: cyc(BOTTOMS.concat(['classic', 'highleg', 'sidetie'])), fab: cyc(night ? FABRICS.concat(FABRICS.filter(f => f[0] === 'metal')) : FABRICS), trunks: cyc(TRUNKS), sarong: cyc(SARONGS) };
}

// ------------------------------------------------------------------ atlas
// Layout: rows of full figures (1.84 m tall cells), a row of half cells for the bathers (hip to head), a row of arms.
// → { size, px, canvas, figs: [{ V, rect, cw, ch, ax, y0, H, sh, yS }], arm(sex, skin, glass) → rect, armCell: { w, h, px, py }, paint(step) }
export function planCrowd(zoneId, specs, o = {}) {
  const scale = o.scale || 1, SIZE = 2048 * scale, night = zoneId === 'beach';
  const own = specs.filter(s => !s.twin), nSwim = own.filter(s => s.kind === 'swim').length, nFull = own.length - nSwim;
  const ARM_H = 0.94, ARM_S = 0.16, ARM_B = 0.4, CELL_H = 1.84, SWIM_H = 1.0, SWIM_Y0 = 0.84;
  // choose the largest scale at which everything fits
  let px = 0, lay = null;
  for (let PX = 380; PX >= 200; PX -= 4) {
    const cw = Math.floor(0.69 * PX), perRow = Math.floor(2048 / cw), rows = Math.ceil(nFull / perRow), sw = Math.floor(0.62 * PX), sRows = Math.ceil(nSwim / Math.floor(2048 / sw));
    const aw = Math.ceil((ARM_S + ARM_B) * PX), h = rows * Math.ceil(CELL_H * PX) + sRows * Math.ceil(SWIM_H * PX) + Math.ceil(ARM_H * PX);
    if (h <= 2048 && Math.floor(2048 / aw) >= 8) { px = PX; lay = { cw, perRow, rows, sw, sRows, aw }; break; }
  }
  const r = rng(zoneId === 'beach' ? 9241 : 5113), deck = makeDeck(r, night);
  const PXS = px * scale, ch = Math.ceil(CELL_H * px), sh = Math.ceil(SWIM_H * px), ah = Math.ceil(ARM_H * px);
  let iF = 0, iS = 0; const pairs = new Map();
  const figs = specs.map((spec, i) => {
    if (spec.twin) return null;
    const V = variant(spec, i, r, deck), D = DIM[V.sex], swim = V.kind === 'swim', lift = V.shoes === 'heel' ? 0.068 : 0;
    const P = POSES[V.pose], wide = P.arm === 'out' || P.arm === 'up' || P.arm === 'head' || P.arm === 'hip';
    let rect, cwm, ax;
    if (swim) { const per = Math.floor(2048 / lay.sw), c = iS % per, rw = Math.floor(iS / per); iS++; rect = [c * lay.sw, lay.rows * ch + rw * sh, lay.sw, sh]; cwm = lay.sw / px; ax = cwm * (P.arm === 'head' ? 0.42 : 0.5); }
    else { const c = iF % lay.perRow, rw = Math.floor(iF / lay.perRow); iF++; rect = [c * lay.cw, rw * ch, lay.cw, ch]; cwm = lay.cw / px; ax = V.both ? cwm * (P.arm === 'head' ? 0.42 : P.arm2 === 'head' ? 0.58 : 0.5) : wide ? 0.25 : 0.3; }
    const key = V.sex + V.skin; if (!V.both && !pairs.has(key)) { if (pairs.size < Math.floor(2048 / lay.aw)) pairs.set(key, pairs.size); else { V.skin = +[...pairs.keys()].find(k => k[0] === V.sex)[1]; } }
    return { V, key: spec.key, rect: rect.map(v => v * scale), cw: cwm, ch: swim ? SWIM_H : CELL_H, ax, y0: swim ? SWIM_Y0 : 0, H: V.k * D.H + lift, sh: V.k * (D.sh - 0.024), yS: V.k * (D.yS - 0.022 + lift), sex: V.sex, armKey: V.sex + V.skin, both: V.both };
  });
  // twins: the same painted figure, mirrored
  specs.forEach((spec, i) => { if (spec.twin) { const b = figs.find(f => f && f.key === spec.twin); figs[i] = { ...b, flip: true, key: null }; } });
  const painted = figs.filter(f => !f.flip);
  const armY = lay.rows * ch + lay.sRows * sh, sW = Math.round(ARM_S * px), bW = lay.aw - sW, hh = Math.floor(ah / 2);
  // arm sprite cells of a (sex, skin) pair → { rect (atlas px), w, h (m), px, py (pivot from the left / top, m) }
  const arm = (key, mode) => { const x0 = (pairs.get(key) ?? 0) * lay.aw, rc = mode === 0 ? [x0, armY, sW, ah] : mode === 1 ? [x0 + sW, armY, bW, hh] : [x0 + sW, armY + hh, bW, hh];
    return { rect: rc.map(v => v * scale), w: rc[2] / px, h: rc[3] / px, px: mode === 0 ? 0.1 : mode === 1 ? 0.11 : bW / px - 0.065, py: mode === 0 ? 0.07 : mode === 1 ? 0.125 : 0.075 }; };
  let canvas = null;
  // paint in steps; `pause` resolves when the page has had a frame
  async function paint(pause, cancelled = () => false) {
    canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE; const g = canvas.getContext('2d');
    const cell = (rc, fn) => { g.save(); g.beginPath(); g.rect(rc[0] + 1, rc[1] + 1, rc[2] - 2, rc[3] - 2); g.clip(); try { fn(); } catch (e) { console.warn('[yacht] crowd figure', e); } g.restore(); };
    let t0 = performance.now(), worst = 0, total = 0;
    const tick = async () => { const dt = performance.now() - t0; worst = Math.max(worst, dt); total += dt; await pause(); t0 = performance.now(); return !cancelled(); };
    for (const f of painted) {
      cell(f.rect, () => { g.setTransform(PXS, 0, 0, -PXS, f.rect[0] + f.ax * PXS, f.rect[1] + f.rect[3] - 2 * scale + f.y0 * PXS); paintFigure(g, PXS, f.V); });
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (!(await tick())) return null;
    }
    for (const key of pairs.keys()) {
      const k = figs.find(f => f.armKey === key).V.k;
      for (const mode of [0, 1, 2]) { const c = arm(key, mode), rc = c.rect; cell(rc, () => { g.setTransform(PXS, 0, 0, -PXS, rc[0] + c.px * PXS, rc[1] + c.py * PXS); paintArmSprite(g, PXS, key[0], +key.slice(1), mode, Math.min(k, 1.03)); }); g.setTransform(1, 0, 0, 1, 0, 0); }
      if (!(await tick())) return null;
    }
    return { canvas, worst, total };
  }
  return { size: SIZE, px: PXS, figs, painted: painted.length, arm, paint, pairs };
}
