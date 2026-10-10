// VILNYI Lifestyle yacht — people: crew and guests as painted figure cards (the concierge technique of commons.js:
// canvas-painted figures on alpha-tested cards, lit as drawn), batched per zone into two draw calls (bodies + arms).
// Everyone is an adult in resort wear, evening wear, uniform or swimwear; the party crowd of the pool deck and the disco
// is painted by yacht-crowd.js (mix-and-match, its own atlas per zone, loaded with the zone). Interactions are social only:
// greeting, a toast, dancing together, a cheek-kiss hello, a high five / handshake.
import * as THREE from 'three';
import { discoFigureMat } from './yacht-disco.js?v=3.8';
import { UBOX, colMat } from './yacht-kit.js?v=3.8';

const TAU = Math.PI * 2, PXM = 284;                 // atlas pixels per metre
const CW = 256, CH = 512, COLS = 8;                 // body cell (0.9 m × 1.8 m)
const AW = 128, AH = 256, ACOLS = 16;               // arm cell (0.45 m × 0.9 m), shoulder pivot at (0.36, 0.86)
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ looks
const SKIN = [['#f6d9c2', '#e9bfa0', '#c98f6c'], ['#eec9a6', '#dba97f', '#b57f56'], ['#d9a679', '#c0875a', '#946038'], ['#a8744e', '#8a5a39', '#5f3a22']];
const HAIR = { blonde: ['#e6c98a', '#b8924a'], brown: ['#6b4630', '#3d2618'], black: ['#2a2220', '#0f0c0b'], auburn: ['#9a4a2a', '#5e2814'], grey: ['#c9c6c0', '#8d8a85'], dark: ['#3a2a22', '#1c1410'] };
// sex, skin, hair [style, colour], outfit [kind, colour 1, colour 2], extras
const LOOKS = {
  captain: { sex: 'm', skin: 1, hair: ['short', 'grey'], out: ['uniform', '#f7f5f0', '#f7f5f0'], cap: 'captain', beard: true },
  steward_w: { sex: 'w', skin: 0, hair: ['bun', 'brown'], out: ['crew', '#f7f5f0', '#1b2742'] },
  steward_m: { sex: 'm', skin: 2, hair: ['short', 'black'], out: ['crew', '#f7f5f0', '#1b2742'] },
  chef: { sex: 'm', skin: 1, hair: ['short', 'dark'], out: ['chef', '#fbfaf6', '#2a2c30'], cap: 'toque' },
  barman: { sex: 'm', skin: 2, hair: ['short', 'black'], out: ['vest', '#f4f1ea', '#14161a'] },
  barwoman: { sex: 'w', skin: 1, hair: ['pony', 'black'], out: ['vest', '#f4f1ea', '#14161a'] },
  therapist: { sex: 'w', skin: 1, hair: ['bun', 'dark'], out: ['tunic', '#9fb5a0', '#f3efe6'] },
  therapist2: { sex: 'w', skin: 0, hair: ['bun', 'blonde'], out: ['tunic', '#9fb5a0', '#f3efe6'] },
  dj: { sex: 'm', skin: 3, hair: ['short', 'black'], out: ['tee', '#16181c', '#2a2d33'], phones: true },
  singer: { sex: 'w', skin: 2, hair: ['long', 'black'], out: ['gown', '#c9a45c', '#8a6a2c'], mic: true },
  guitarist: { sex: 'm', skin: 1, hair: ['short', 'brown'], out: ['shirt', '#1c1e24', '#101114'], guitar: true },
  keys: { sex: 'm', skin: 3, hair: ['short', 'black'], out: ['shirt', '#efe9dc', '#22252b'] },
  w_swim_a: { sex: 'w', skin: 1, hair: ['long', 'blonde'], out: ['swim', '#0f6a6e', '#e9d9b0'], shades: true },
  w_swim_b: { sex: 'w', skin: 2, hair: ['bun', 'black'], out: ['swim', '#b3263a', '#f2e8d8'] },
  w_swim_c: { sex: 'w', skin: 0, hair: ['pony', 'auburn'], out: ['swim', '#1b2742', '#f2e8d8'], shades: true },
  m_swim_a: { sex: 'm', skin: 1, hair: ['short', 'brown'], out: ['trunks', '#f2efe8', '#1f4f7a'], shades: true },
  m_swim_b: { sex: 'm', skin: 3, hair: ['short', 'black'], out: ['trunks', '#e9e2cf', '#c2572e'] },
  w_resort_a: { sex: 'w', skin: 0, hair: ['long', 'brown'], out: ['sundress', '#f3ede0', '#c9a45c'], hat: true },
  w_resort_b: { sex: 'w', skin: 2, hair: ['long', 'black'], out: ['kaftan', '#d9693a', '#f0d39a'], shades: true },
  w_resort_c: { sex: 'w', skin: 1, hair: ['bob', 'blonde'], out: ['sundress', '#1f6b5c', '#e6d7b0'] },
  m_resort_a: { sex: 'm', skin: 1, hair: ['short', 'dark'], out: ['linen', '#f1ece0', '#b9a888'], shades: true },
  m_resort_b: { sex: 'm', skin: 2, hair: ['short', 'grey'], out: ['linen', '#cfdbe6', '#f1ece0'] },
  m_resort_c: { sex: 'm', skin: 0, hair: ['short', 'blonde'], out: ['linen', '#f1ece0', '#2c3a55'] },
  w_party_a: { sex: 'w', skin: 1, hair: ['long', 'auburn'], out: ['cocktail', '#7a1f3a', '#c9a45c'] },
  w_party_b: { sex: 'w', skin: 3, hair: ['bun', 'black'], out: ['cocktail', '#c9a45c', '#f6e7b8'] },
  w_party_c: { sex: 'w', skin: 0, hair: ['bob', 'black'], out: ['cocktail', '#1d2f5e', '#cfd8ee'] },
  m_party_a: { sex: 'm', skin: 2, hair: ['short', 'black'], out: ['blazer', '#1b1d24', '#f1ece0'] },
  m_party_b: { sex: 'm', skin: 0, hair: ['short', 'brown'], out: ['blazer', '#e9e3d4', '#1d2f5e'] },
  w_robe: { sex: 'w', skin: 1, hair: ['bun', 'brown'], out: ['robe', '#f6f3ec', '#ded8ca'] },
  m_towel: { sex: 'm', skin: 2, hair: ['short', 'dark'], out: ['robe', '#f6f3ec', '#ded8ca'] },
};
const LOOK_IDS = Object.keys(LOOKS);

// ------------------------------------------------------------------ painter (metres, y up, feet at the origin)
const lg = (g, x0, y0, x1, y1, st) => { const r = g.createLinearGradient(x0, y0, x1, y1); st.forEach(([t, c]) => r.addColorStop(t, c)); return r; };
function limb(g, x0, y0, r0, x1, y1, r1) {
  const a = Math.atan2(y1 - y0, x1 - x0), b = Math.asin(clamp((r0 - r1) / (Math.hypot(x1 - x0, y1 - y0) || 1), -1, 1));
  g.beginPath(); g.arc(x0, y0, r0, a + Math.PI / 2 - b, a - Math.PI / 2 + b + TAU); g.arc(x1, y1, r1, a - Math.PI / 2 + b, a + Math.PI / 2 - b); g.closePath();
}
function poly(g, pts, close = true) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); if (close) g.closePath(); }
function smooth(g, pts) {   // closed smooth outline through the points
  g.beginPath(); const n = pts.length;
  for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]; if (!i) g.moveTo(p1[0], p1[1]); g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); }
  g.closePath();
}
const sym = (half) => [...half, ...half.slice().reverse().map(([x, y]) => [-x, y])];
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
const skinFill = (g, S, x, w) => lg(g, x - w, 0, x + w, 0, [[0, S[2]], [0.3, S[1]], [0.55, S[0]], [0.8, S[1]], [1, S[2]]]);
const clothFill = (g, hex, w) => lg(g, -w, 0, w, 0, [[0, shade(hex, 0.62)], [0.25, shade(hex, 0.9)], [0.5, hex], [0.75, shade(hex, 0.9)], [1, shade(hex, 0.62)]]);

// proportions per sex
function dims(sex) {
  return sex === 'w'
    ? { H: 1.70, sh: 0.185, bust: 0.15, waist: 0.112, hip: 0.165, yS: 1.395, yB: 1.24, yW: 1.05, yH: 0.9, yC: 0.8, knee: 0.47, leg: 0.085, thigh: 0.074, calf: 0.046, ankle: 0.03, neck: 0.036, hx: 0.073, hy: 0.103, arm: 0.036 }
    : { H: 1.82, sh: 0.23, bust: 0.19, waist: 0.158, hip: 0.168, yS: 1.5, yB: 1.32, yW: 1.1, yH: 0.95, yC: 0.84, knee: 0.5, leg: 0.092, thigh: 0.082, calf: 0.054, ankle: 0.036, neck: 0.046, hx: 0.078, hy: 0.108, arm: 0.046 };
}
function paintLegs(g, D, S, o = {}) {
  for (const d of [-1, 1]) {
    const x = d * D.leg;
    if (o.trousers) {
      g.fillStyle = lg(g, x - 0.09, 0, x + 0.09, 0, [[0, shade(o.trousers, 0.6)], [0.5, o.trousers], [1, shade(o.trousers, 0.65)]]);
      limb(g, x, D.yC + 0.04, D.thigh + 0.012, d * (D.leg - 0.004), D.knee, D.calf + 0.022); g.fill(); limb(g, d * (D.leg - 0.004), D.knee, D.calf + 0.022, d * (D.leg - 0.006), 0.07, D.ankle + 0.03); g.fill();
    } else {
      g.fillStyle = skinFill(g, S, x, D.thigh);
      limb(g, x, D.yC + 0.03, D.thigh, d * (D.leg - 0.008), D.knee, D.calf + 0.004); g.fill(); limb(g, d * (D.leg - 0.008), D.knee, D.calf + 0.006, d * (D.leg - 0.012), 0.08, D.ankle); g.fill();
    }
    // shoes / sandals / bare feet
    g.beginPath(); g.ellipse(d * (D.leg - 0.004), 0.035, 0.05, 0.034, 0, 0, TAU); g.fillStyle = o.shoe || S[1]; g.fill();
    if (o.sandal) { g.fillStyle = o.sandal; g.fillRect(d * (D.leg - 0.004) - 0.05, 0.04, 0.1, 0.014); g.fillRect(d * (D.leg - 0.004) - 0.05, 0, 0.1, 0.012); }
  }
}
function paintArm(g, D, S, d, sleeve) {   // hanging arm at the figure's side (d = ±1)
  const sx = d * (D.sh - 0.012), ex = d * (D.sh + 0.03), wx = d * (D.sh + 0.035), ey = D.yS - 0.3, wy = D.yS - 0.58;
  g.fillStyle = skinFill(g, S, ex, D.arm + 0.01); limb(g, sx, D.yS - 0.03, D.arm + 0.008, ex, ey, D.arm); g.fill(); limb(g, ex, ey, D.arm - 0.002, wx, wy, D.arm - 0.012); g.fill();
  g.beginPath(); g.ellipse(wx, wy - 0.05, 0.03, 0.05, 0, 0, TAU); g.fill();
  if (sleeve) { g.fillStyle = lg(g, sx - 0.06, 0, sx + 0.06, 0, [[0, shade(sleeve[0], 0.6)], [0.5, sleeve[0]], [1, shade(sleeve[0], 0.65)]]); if (sleeve[1] === 'long') { limb(g, sx, D.yS - 0.03, D.arm + 0.02, ex, ey, D.arm + 0.014); g.fill(); limb(g, ex, ey, D.arm + 0.012, wx, wy + 0.02, D.arm); g.fill(); } else { limb(g, sx, D.yS - 0.03, D.arm + 0.02, lerp(sx, ex, 0.55), lerp(D.yS, ey, 0.6), D.arm + 0.016); g.fill(); } }
}
function paintHead(g, D, S, L) {
  const cy = D.H - D.hy - 0.005, hc = HAIR[L.hair[1]] || HAIR.brown, style = L.hair[0];
  // hair behind
  if (style === 'long') { smooth(g, sym([[0, D.H + 0.012], [0.07, D.H - 0.01], [0.105, cy], [0.12, cy - 0.14], [0.135, cy - 0.27], [0.11, cy - 0.36], [0.05, cy - 0.33]])); g.fillStyle = lg(g, 0, D.H, 0, cy - 0.36, [[0, hc[0]], [0.5, hc[1]], [1, hc[0]]]); g.fill(); }
  if (style === 'bob') { smooth(g, sym([[0, D.H + 0.012], [0.07, D.H - 0.008], [0.1, cy], [0.108, cy - 0.1], [0.085, cy - 0.15], [0.04, cy - 0.13]])); g.fillStyle = lg(g, 0, D.H, 0, cy - 0.15, [[0, hc[0]], [1, hc[1]]]); g.fill(); }
  if (style === 'pony') { g.fillStyle = hc[1]; limb(g, 0.05, cy + 0.03, 0.035, 0.1, cy - 0.2, 0.02); g.fill(); }
  // neck
  g.fillStyle = lg(g, 0, cy - D.hy, 0, D.yS, [[0, S[2]], [1, S[1]]]); g.fillRect(-D.neck, D.yS - 0.02, D.neck * 2, cy - D.hy - D.yS + 0.06);
  // face
  g.beginPath(); g.ellipse(0, cy, D.hx, D.hy, 0, 0, TAU); g.fillStyle = lg(g, -D.hx, 0, D.hx, 0, [[0, S[2]], [0.25, S[1]], [0.5, S[0]], [0.78, S[1]], [1, S[2]]]); g.fill();
  for (const d of [-1, 1]) { g.beginPath(); g.ellipse(d * (D.hx - 0.002), cy - 0.005, 0.01, 0.02, 0, 0, TAU); g.fillStyle = S[1]; g.fill(); }
  const ey = cy + 0.012, ex = D.hx * 0.42;
  if (L.shades) {
    g.fillStyle = '#17181c'; for (const d of [-1, 1]) { g.beginPath(); g.ellipse(d * ex, ey, 0.027, 0.02, 0, 0, TAU); g.fill(); } g.fillRect(-ex, ey + 0.002, ex * 2, 0.005);
    g.fillStyle = 'rgba(255,255,255,0.28)'; for (const d of [-1, 1]) { g.beginPath(); g.ellipse(d * ex - 0.008, ey + 0.007, 0.008, 0.005, 0.5, 0, TAU); g.fill(); }
    g.strokeStyle = '#c9a45c'; g.lineWidth = 0.003; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * (ex + 0.026), ey + 0.004); g.lineTo(d * (D.hx + 0.004), ey + 0.012); g.stroke(); }
  } else {
    for (const d of [-1, 1]) {
      g.beginPath(); g.ellipse(d * ex, ey, 0.014, 0.0075, 0, 0, TAU); g.fillStyle = '#fbf8f3'; g.fill();
      g.beginPath(); g.ellipse(d * ex, ey, 0.0068, 0.0072, 0, 0, TAU); g.fillStyle = L.sex === 'w' ? '#4a3524' : '#3a2a20'; g.fill();
      g.beginPath(); g.ellipse(d * ex - 0.002, ey + 0.0025, 0.002, 0.002, 0, 0, TAU); g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = '#2a1c14'; g.lineWidth = L.sex === 'w' ? 0.0042 : 0.003; g.lineCap = 'round'; g.beginPath(); g.moveTo(d * (ex - 0.015), ey + 0.004); g.quadraticCurveTo(d * ex, ey + 0.012, d * (ex + 0.017), ey + 0.005); g.stroke();
      g.strokeStyle = hc[1]; g.lineWidth = L.sex === 'w' ? 0.004 : 0.006; g.beginPath(); g.moveTo(d * (ex - 0.017), ey + 0.021); g.quadraticCurveTo(d * ex, ey + 0.03, d * (ex + 0.02), ey + 0.022); g.stroke();
    }
  }
  // nose, cheeks, smile
  g.strokeStyle = S[2]; g.lineWidth = 0.0035; g.beginPath(); g.moveTo(0.004, cy + 0.004); g.quadraticCurveTo(0.011, cy - 0.022, 0, cy - 0.027); g.stroke();
  if (L.sex === 'w') { g.fillStyle = 'rgba(226,110,100,0.22)'; for (const d of [-1, 1]) { g.beginPath(); g.ellipse(d * 0.04, cy - 0.024, 0.018, 0.012, 0, 0, TAU); g.fill(); } }
  const my = cy - 0.05;
  if (L.beard) { g.beginPath(); g.ellipse(0, cy - 0.052, D.hx - 0.006, 0.056, 0, Math.PI, TAU); g.fillStyle = hc[0]; g.fill(); g.fillRect(-D.hx + 0.002, cy - 0.055, 0.016, 0.05); g.fillRect(D.hx - 0.018, cy - 0.055, 0.016, 0.05); }
  g.beginPath(); g.moveTo(-0.024, my + 0.004); g.quadraticCurveTo(0, my - 0.014, 0.024, my + 0.004); g.quadraticCurveTo(0, my - 0.002, -0.024, my + 0.004); g.fillStyle = L.sex === 'w' ? '#c2475a' : '#a8685a'; g.fill();
  g.beginPath(); g.moveTo(-0.017, my + 0.001); g.quadraticCurveTo(0, my - 0.007, 0.017, my + 0.001); g.quadraticCurveTo(0, my - 0.003, -0.017, my + 0.001); g.fillStyle = '#fff'; g.fill();
  // hair in front
  const top = (pts) => { smooth(g, pts); g.fillStyle = lg(g, 0, D.H + 0.02, 0, cy, [[0, hc[0]], [0.55, hc[1]], [1, hc[0]]]); g.fill(); };
  if (style === 'short') top([[-D.hx - 0.004, cy + 0.02], [-D.hx + 0.005, cy + 0.075], [-0.03, D.H + 0.008], [0.03, D.H + 0.008], [D.hx - 0.005, cy + 0.075], [D.hx + 0.004, cy + 0.02], [D.hx - 0.012, cy + 0.055], [0.02, cy + 0.068], [-0.03, cy + 0.066], [-D.hx + 0.012, cy + 0.05]]);
  else {
    top([[-D.hx - 0.01, cy - 0.01], [-D.hx - 0.002, cy + 0.07], [-0.035, D.H + 0.012], [0.035, D.H + 0.012], [D.hx + 0.002, cy + 0.07], [D.hx + 0.01, cy - 0.01], [D.hx - 0.012, cy + 0.045], [0.035, cy + 0.078], [-0.012, cy + 0.085], [-D.hx + 0.014, cy + 0.045]]);
    if (style === 'long') for (const d of [-1, 1]) { smooth(g, [[d * (D.hx - 0.008), cy + 0.05], [d * (D.hx + 0.022), cy - 0.02], [d * (D.hx + 0.035), cy - 0.16], [d * (D.hx + 0.03), cy - 0.3], [d * (D.hx - 0.004), cy - 0.31], [d * (D.hx + 0.004), cy - 0.14], [d * (D.hx - 0.008), cy - 0.04]]); g.fillStyle = lg(g, 0, cy + 0.05, 0, cy - 0.31, [[0, hc[1]], [0.4, hc[0]], [1, hc[1]]]); g.fill(); }
    if (style === 'bun') { g.beginPath(); g.ellipse(0, D.H + 0.022, 0.04, 0.032, 0, 0, TAU); g.fillStyle = hc[1]; g.fill(); }
  }
  // headwear
  if (L.cap === 'captain') { g.fillStyle = '#f7f5f0'; smooth(g, [[-D.hx - 0.03, cy + 0.075], [-D.hx - 0.012, D.H + 0.035], [0, D.H + 0.05], [D.hx + 0.012, D.H + 0.035], [D.hx + 0.03, cy + 0.075], [0, cy + 0.085]]); g.fill(); g.fillStyle = '#14161a'; g.beginPath(); g.ellipse(0, cy + 0.066, D.hx + 0.018, 0.016, 0, 0, TAU); g.fill(); g.fillStyle = '#c9a45c'; g.beginPath(); g.ellipse(0, cy + 0.095, 0.018, 0.014, 0, 0, TAU); g.fill(); g.fillRect(-D.hx - 0.01, cy + 0.076, (D.hx + 0.01) * 2, 0.006); }
  if (L.cap === 'toque') { g.fillStyle = '#fbfaf6'; g.fillRect(-D.hx - 0.002, cy + 0.06, (D.hx + 0.002) * 2, 0.045); smooth(g, [[-D.hx - 0.02, cy + 0.1], [-D.hx - 0.03, D.H + 0.09], [0, D.H + 0.12], [D.hx + 0.03, D.H + 0.09], [D.hx + 0.02, cy + 0.1]]); g.fill(); }
  if (L.hat) { g.fillStyle = '#e9dcc0'; g.beginPath(); g.ellipse(0, cy + 0.062, 0.2, 0.03, 0, 0, TAU); g.fill(); smooth(g, [[-D.hx - 0.008, cy + 0.06], [-D.hx + 0.004, D.H + 0.03], [0, D.H + 0.045], [D.hx - 0.004, D.H + 0.03], [D.hx + 0.008, cy + 0.06]]); g.fill(); g.fillStyle = '#1b2742'; g.fillRect(-D.hx - 0.006, cy + 0.066, (D.hx + 0.006) * 2, 0.014); }
  if (L.phones) { g.strokeStyle = '#111'; g.lineWidth = 0.014; g.beginPath(); g.arc(0, cy + 0.01, D.hx + 0.012, 0.15, Math.PI - 0.15); g.stroke(); g.fillStyle = '#1c1d22'; for (const d of [-1, 1]) { g.beginPath(); g.ellipse(d * (D.hx + 0.01), cy - 0.002, 0.02, 0.032, 0, 0, TAU); g.fill(); } }
}
// the figure (without its right arm unless L.bothArms: that arm is a separate hinged sprite)
function paintFigure(g, L) {
  const D = dims(L.sex), S = SKIN[L.skin], [kind, c1, c2] = L.out;
  const sides = L.bothArms ? [-1, 1] : [1];   // +1 = the viewer's right (the figure's left arm)
  const torso = (hex, o = {}) => {   // fitted top from the shoulders to o.end
    const yE = o.end ?? D.yH, neckY = D.yS + 0.015, w = o.loose || 0;
    smooth(g, sym([[0.03, neckY - (o.v || 0.02)], [D.neck + 0.03, D.yS + 0.03], [D.sh, D.yS - 0.005], [D.sh + 0.004, D.yS - 0.07], [D.bust + 0.012 + w, D.yB], [D.waist + 0.012 + w, D.yW], [D.hip + 0.006 + w, yE + 0.04], [D.hip + w, yE], [0, yE - 0.005]]));
    g.fillStyle = clothFill(g, hex, D.sh); g.fill();
  };
  const skirt = (hex, y0, y1, w1, o = {}) => { smooth(g, sym([[D.waist + 0.012, y0], [D.hip + 0.012, y0 - 0.14], [w1, y1 + 0.05], [w1 - 0.01, y1], [0, y1 - 0.004]])); g.fillStyle = clothFill(g, hex, w1); g.fill(); if (o.folds) { g.strokeStyle = shade(hex, 0.7); g.lineWidth = 0.004; for (const k of [-0.6, -0.2, 0.25, 0.62]) { g.beginPath(); g.moveTo(k * D.hip, y0 - 0.16); g.lineTo(k * w1, y1 + 0.01); g.stroke(); } } };
  const skinTorso = () => { smooth(g, sym([[D.neck, D.yS + 0.02], [D.sh - 0.01, D.yS], [D.sh - 0.004, D.yS - 0.08], [D.bust, D.yB], [D.waist, D.yW], [D.hip, D.yH], [0, D.yC]])); g.fillStyle = skinFill(g, S, 0, D.sh); g.fill(); };
  const belt = (hex, y) => { g.fillStyle = hex; g.fillRect(-D.waist - 0.016, y - 0.012, (D.waist + 0.016) * 2, 0.024); };
  const buttons = (hex, y0, y1, n = 5) => { g.fillStyle = hex; for (let i = 0; i < n; i++) { g.beginPath(); g.ellipse(0, n > 1 ? lerp(y0, y1, i / (n - 1)) : y0, 0.006, 0.006, 0, 0, TAU); g.fill(); } };
  const collar = (hex) => { g.fillStyle = hex; for (const d of [-1, 1]) { poly(g, [[d * 0.006, D.yS - 0.05], [d * (D.neck + 0.032), D.yS + 0.035], [d * (D.neck + 0.004), D.yS + 0.045], [d * 0.002, D.yS + 0.0]]); g.fill(); } };
  let sleeve = null;
  const arms = () => { for (const d of sides) paintArm(g, D, S, d, sleeve); };
  if (L.seated) { g.save(); g.translate(0, -0.36); paintLegs(g, { ...D, yC: 0.5, knee: 0.44 }, S, {}); g.restore(); }
  switch (kind) {
    case 'swim':   // one-piece swimsuit with a sarong tied at the hip
      paintLegs(g, D, S, { sandal: c2 }); skinTorso(); arms();
      smooth(g, sym([[0.035, D.yS - 0.075], [D.neck + 0.045, D.yS - 0.005], [D.sh - 0.035, D.yS - 0.02], [D.bust + 0.004, D.yB + 0.02], [D.waist + 0.004, D.yW], [D.hip + 0.004, D.yH], [0.05, D.yC - 0.005], [0, D.yC - 0.02]])); g.fillStyle = clothFill(g, c1, D.sh); g.fill();
      for (const d of [-1, 1]) { g.fillStyle = shade(c1, 0.9); poly(g, [[d * (D.neck + 0.04), D.yS + 0.02], [d * (D.neck + 0.062), D.yS + 0.015], [d * (D.sh - 0.05), D.yS - 0.05], [d * (D.sh - 0.075), D.yS - 0.05]]); g.fill(); }
      skirt(c2, D.yW - 0.05, D.knee + 0.06, D.hip + 0.05, { folds: true }); g.fillStyle = shade(c2, 0.85); g.beginPath(); g.ellipse(D.hip - 0.02, D.yW - 0.07, 0.03, 0.022, 0.4, 0, TAU); g.fill();
      break;
    case 'trunks': // swim shorts with a light short-sleeved shirt
      paintLegs(g, D, S, { sandal: '#3a3024' }); sleeve = [c1, 'short']; arms(); torso(c1, { end: D.yH - 0.02, loose: 0.012 }); collar(shade(c1, 0.92)); buttons(shade(c1, 0.75), D.yS - 0.08, D.yH + 0.02);
      smooth(g, sym([[D.waist + 0.02, D.yH + 0.02], [D.hip + 0.03, D.yC + 0.02], [D.hip + 0.03, D.yC - 0.24], [0.012, D.yC - 0.24], [0, D.yC - 0.06]])); g.fillStyle = clothFill(g, c2, D.hip + 0.03); g.fill();
      break;
    case 'sundress':
      paintLegs(g, D, S, { sandal: c2 }); arms(); torso(c1, { end: D.yW, v: 0.07 }); skirt(c1, D.yW + 0.01, D.knee - 0.1, D.hip + 0.11, { folds: true }); belt(c2, D.yW);
      break;
    case 'kaftan': // long flowing kaftan with a gold border
      paintLegs(g, D, S, { sandal: c2 }); sleeve = [c1, 'short']; arms();
      smooth(g, sym([[0.03, D.yS - 0.07], [D.neck + 0.03, D.yS + 0.03], [D.sh + 0.012, D.yS - 0.015], [D.bust + 0.03, D.yB - 0.02], [D.waist + 0.03, D.yW], [D.hip + 0.035, D.yH], [D.hip + 0.07, 0.45], [D.hip + 0.11, 0.2], [D.hip + 0.09, 0.14], [0, 0.13]])); g.fillStyle = clothFill(g, c1, D.sh + 0.1); g.fill();
      g.strokeStyle = c2; g.lineWidth = 0.012; g.beginPath(); g.moveTo(-D.hip - 0.095, 0.17); g.lineTo(D.hip + 0.095, 0.17); g.stroke(); g.lineWidth = 0.01; g.beginPath(); g.moveTo(-D.waist - 0.03, D.yW); g.lineTo(D.waist + 0.03, D.yW); g.stroke(); g.beginPath(); g.moveTo(-0.03, D.yS - 0.07); g.lineTo(0, D.yB - 0.06); g.lineTo(0.03, D.yS - 0.07); g.stroke();
      break;
    case 'cocktail': // knee-length dress with short sleeves
      paintLegs(g, D, S, { shoe: c2 }); sleeve = [c1, 'short']; arms(); torso(c1, { end: D.yW, v: 0.04 }); skirt(c1, D.yW + 0.01, D.knee + 0.04, D.hip + 0.05); belt(c2, D.yW + 0.004);
      g.strokeStyle = c2; g.lineWidth = 0.004; g.beginPath(); g.arc(0, D.yS + 0.03, D.neck + 0.02, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      break;
    case 'gown':   // long evening gown
      paintLegs(g, D, S, { shoe: c2 }); arms(); torso(c1, { end: D.yW, v: 0.05 }); smooth(g, sym([[D.waist + 0.012, D.yW + 0.01], [D.hip + 0.016, D.yH], [D.hip + 0.03, 0.5], [D.hip + 0.1, 0.03], [0, 0.02]])); g.fillStyle = clothFill(g, c1, D.hip + 0.1); g.fill();
      g.strokeStyle = shade(c1, 1.25); g.lineWidth = 0.006; for (const k of [-0.5, 0.2, 0.6]) { g.beginPath(); g.moveTo(k * D.hip, D.yH); g.lineTo(k * (D.hip + 0.09), 0.05); g.stroke(); }
      break;
    case 'robe':   // spa robe, crossed and belted
      if (!L.seated) paintLegs(g, D, S, { sandal: '#efe9dc' });
      sleeve = [c1, 'long']; arms();
      { const hem = L.seated ? D.yC - 0.22 : D.knee - 0.12;
        smooth(g, sym([[0.04, D.yS - 0.06], [D.neck + 0.035, D.yS + 0.035], [D.sh + 0.012, D.yS - 0.005], [D.bust + 0.03, D.yB], [D.waist + 0.035, D.yW], [D.hip + 0.03, D.yH], [D.hip + 0.045, hem], [0, hem - 0.004]])); g.fillStyle = clothFill(g, c1, D.sh + 0.03); g.fill();
        g.strokeStyle = c2; g.lineWidth = 0.014; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-D.neck - 0.03, D.yS + 0.03); g.lineTo(0.03, D.yW + 0.02); g.lineTo(0.035, hem + 0.02); g.stroke(); g.beginPath(); g.moveTo(D.neck + 0.03, D.yS + 0.03); g.lineTo(-0.01, D.yB - 0.04); g.stroke(); }
      belt(c2, D.yW); g.fillStyle = c2; limb(g, 0.05, D.yW, 0.012, 0.07, D.yW - 0.16, 0.01); g.fill();
      break;
    default: {     // linen | shirt | tee | crew | vest | blazer | uniform | chef | tunic
      const skirtCrew = kind === 'crew' && L.sex === 'w';
      if (skirtCrew) paintLegs(g, D, S, { shoe: '#1b2742' }); else paintLegs(g, D, S, { trousers: kind === 'blazer' ? shade(c1, 0.92) : c2, shoe: kind === 'linen' ? '#e9dfc8' : '#17181c' });
      const long = kind === 'blazer' || kind === 'uniform' || kind === 'chef' || kind === 'vest';
      sleeve = [c1, long ? 'long' : 'short']; arms();
      if (skirtCrew) skirt(c2, D.yW, D.knee + 0.03, D.hip + 0.02);
      torso(c1, { end: kind === 'tunic' ? D.yC - 0.06 : D.yH - 0.01, loose: L.sex === 'm' ? 0.014 : 0.006, v: kind === 'tee' ? 0.01 : 0.05 });
      if (['linen', 'shirt', 'crew', 'uniform', 'chef'].includes(kind)) { collar(shade(c1, 0.93)); buttons(kind === 'uniform' ? '#c9a45c' : kind === 'chef' ? '#2a2c30' : shade(c1, 0.72), D.yS - 0.08, D.yH + 0.03, kind === 'chef' ? 4 : 5); }
      if (kind === 'crew' || kind === 'uniform') {
        const ep = kind === 'uniform' ? '#14161a' : '#1b2742';
        for (const d of [-1, 1]) { g.fillStyle = ep; g.fillRect(d * (D.sh - 0.035) - 0.03, D.yS - 0.012, 0.06, 0.022); g.fillStyle = '#c9a45c'; g.fillRect(d * (D.sh - 0.035) - 0.03, D.yS - 0.004, 0.06, 0.005); }
        g.fillStyle = '#c9a45c'; poly(g, [[D.bust - 0.07, D.yB + 0.045], [D.bust - 0.035, D.yB + 0.06], [D.bust - 0.05, D.yB + 0.04], [D.bust - 0.03, D.yB + 0.03]]); g.fill(); belt(kind === 'uniform' ? '#e9e4d8' : '#1b2742', D.yH + 0.02);
      }
      if (kind === 'vest') { smooth(g, sym([[0.012, D.yB + 0.02], [D.neck + 0.05, D.yS + 0.012], [D.sh - 0.03, D.yS - 0.02], [D.bust + 0.014, D.yB], [D.waist + 0.016, D.yW], [D.hip + 0.004, D.yH + 0.03], [0.02, D.yH - 0.03]])); g.fillStyle = clothFill(g, c2, D.sh); g.fill(); collar('#f4f1ea'); g.fillStyle = '#14161a'; poly(g, [[-0.03, D.yS - 0.015], [0.03, D.yS - 0.015], [0.012, D.yS - 0.04], [0.03, D.yS - 0.065], [-0.03, D.yS - 0.065], [-0.012, D.yS - 0.04]]); g.fill(); }
      if (kind === 'blazer') { g.fillStyle = c2; poly(g, [[-0.045, D.yS + 0.02], [0.045, D.yS + 0.02], [0, D.yB - 0.07]]); g.fill(); g.strokeStyle = shade(c1, 0.6); g.lineWidth = 0.005; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 0.05, D.yS + 0.025); g.lineTo(0, D.yB - 0.075); g.stroke(); } buttons(shade(c1, 0.55), D.yW + 0.03, D.yW + 0.03, 1); }
      if (kind === 'tunic') { g.strokeStyle = c2; g.lineWidth = 0.006; g.beginPath(); g.moveTo(-0.03, D.yS + 0.02); g.lineTo(0.05, D.yW); g.lineTo(0.05, D.yC - 0.05); g.stroke(); }
    }
  }
  paintHead(g, D, S, L);
  // props
  if (L.mic) { g.fillStyle = '#17181c'; limb(g, -0.02, D.yS - 0.02, 0.012, 0.0, D.yS + 0.045, 0.012); g.fill(); g.beginPath(); g.ellipse(0.004, D.yS + 0.062, 0.022, 0.024, 0, 0, TAU); g.fillStyle = '#9a9ca0'; g.fill(); g.beginPath(); g.ellipse(-0.012, D.yS - 0.005, 0.03, 0.034, 0, 0, TAU); g.fillStyle = S[1]; g.fill(); }
  if (L.guitar) { g.save(); g.translate(0.02, D.yW - 0.02); g.rotate(0.5); g.fillStyle = '#7a3b1c'; g.beginPath(); g.ellipse(-0.08, 0, 0.13, 0.1, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(0.05, 0, 0.1, 0.085, 0, 0, TAU); g.fill(); g.fillStyle = '#1a120c'; g.beginPath(); g.ellipse(0.0, 0, 0.035, 0.035, 0, 0, TAU); g.fill(); g.fillStyle = '#3a2416'; g.fillRect(0.1, -0.016, 0.36, 0.032); g.fillStyle = '#d9c8a0'; g.fillRect(0.44, -0.024, 0.07, 0.048); g.restore(); g.beginPath(); g.ellipse(-0.05, D.yW - 0.06, 0.03, 0.036, 0, 0, TAU); g.fillStyle = S[1]; g.fill(); }
}
// the hinged right arm, drawn hanging from the pivot at the origin; with a glass it is bent up at the elbow
function paintArmSprite(g, L, glass) {
  const D = dims(L.sex), S = SKIN[L.skin], [kind, c1] = L.out, long = ['blazer', 'uniform', 'chef', 'vest', 'robe'].includes(kind), sl = ['swim', 'sundress', 'gown'].includes(kind) ? null : (kind === 'vest' ? '#f4f1ea' : c1);
  const cloth = (x0, y0, r0, x1, y1, r1) => { g.fillStyle = lg(g, x0 - 0.06, 0, x0 + 0.06, 0, [[0, shade(sl, 0.6)], [0.5, sl], [1, shade(sl, 0.65)]]); limb(g, x0, y0, r0, x1, y1, r1); g.fill(); };
  if (!glass) {
    g.fillStyle = skinFill(g, S, 0, D.arm + 0.01); limb(g, 0, 0, D.arm + 0.008, 0.012, -0.29, D.arm); g.fill(); limb(g, 0.012, -0.29, D.arm - 0.002, 0.016, -0.56, D.arm - 0.012); g.fill();
    g.beginPath(); g.ellipse(0.016, -0.615, 0.032, 0.052, 0, 0, TAU); g.fill();
    g.strokeStyle = S[2]; g.lineWidth = 0.003; for (const k of [-0.012, 0, 0.012]) { g.beginPath(); g.moveTo(0.016 + k, -0.61); g.lineTo(0.016 + k * 1.3, -0.66); g.stroke(); }
    if (sl) { if (long) { cloth(0, 0, D.arm + 0.02, 0.012, -0.29, D.arm + 0.014); cloth(0.012, -0.29, D.arm + 0.012, 0.016, -0.54, D.arm); } else cloth(0, 0, D.arm + 0.02, 0.007, -0.17, D.arm + 0.016); }
  } else {
    g.fillStyle = skinFill(g, S, 0, D.arm + 0.01); limb(g, 0, 0, D.arm + 0.008, -0.02, -0.27, D.arm); g.fill(); limb(g, -0.02, -0.27, D.arm - 0.002, 0.11, -0.12, D.arm - 0.01); g.fill();
    if (sl) { if (long) { cloth(0, 0, D.arm + 0.02, -0.02, -0.27, D.arm + 0.014); cloth(-0.02, -0.27, D.arm + 0.012, 0.09, -0.14, D.arm); } else cloth(0, 0, D.arm + 0.02, -0.012, -0.17, D.arm + 0.016); }
    // glass (a coupe of something golden) and the hand round its stem
    g.strokeStyle = 'rgba(235,245,250,0.95)'; g.lineWidth = 0.005; g.beginPath(); g.moveTo(0.13, -0.11); g.lineTo(0.13, 0.0); g.stroke();
    g.beginPath(); g.moveTo(0.085, 0.07); g.quadraticCurveTo(0.09, 0.0, 0.13, -0.005); g.quadraticCurveTo(0.17, 0.0, 0.175, 0.07); g.closePath(); g.fillStyle = 'rgba(240,200,120,0.92)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 0.004; g.stroke();
    g.beginPath(); g.ellipse(0.13, -0.115, 0.03, 0.007, 0, 0, TAU); g.fillStyle = 'rgba(235,245,250,0.95)'; g.fill();
    g.beginPath(); g.ellipse(0.125, -0.085, 0.03, 0.036, 0.3, 0, TAU); g.fillStyle = S[1]; g.fill();
  }
}

let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const body = mk(2048, 2048), arms = mk(2048, 1024), gb = body.getContext('2d'), ga = arms.getContext('2d');
  LOOK_IDS.forEach((id, i) => {
    const L = LOOKS[id], cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
    gb.save(); gb.beginPath(); gb.rect(cx + 1, cy + 1, CW - 2, CH - 2); gb.clip(); { const k = L.sex === 'm' ? 0.95 : 1; gb.setTransform(PXM * k, 0, 0, -PXM * k, cx + CW / 2, cy + CH - 2); }   // men fit the 1.8 m cell with their caps
    try { paintFigure(gb, { ...L, bothArms: !!(L.mic || L.guitar || L.seated) }); } catch (e) { console.warn('[yacht] figure ' + id, e); }
    gb.restore();
    for (const gl of [0, 1]) {
      const ax = (i % ACOLS) * AW, ay = (Math.floor(i / ACOLS) + gl * 2) * AH;
      ga.save(); ga.beginPath(); ga.rect(ax + 1, ay + 1, AW - 2, AH - 2); ga.clip(); ga.setTransform(PXM, 0, 0, -PXM, ax + AW * 0.36, ay + AH * 0.14);
      try { paintArmSprite(ga, L, !!gl); } catch (e) { console.warn('[yacht] arm ' + id, e); }
      ga.restore();
    }
  });
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const tb = tex(body), ta = tex(arms);
  const mat = (t) => { const m = new THREE.MeshBasicMaterial({ map: t, color: 0xf4efe8, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true }); m.name = 'yacht-figure-card'; return m; };
  return (ATLAS = { tb, ta, mb: mat(tb), ma: mat(ta), body, arms });
}

// ------------------------------------------------------------------ crowd per zone
const GX = 2, GY = 6, NV = (GX + 1) * (GY + 1);     // body card grid
// soft contact shadows and the rings round the bathers: one small texture (left half blob, right half ring)
let SHADOW = null;
function shadowMat() {
  if (SHADOW) return SHADOW;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  let r = g.createRadialGradient(32, 32, 2, 32, 32, 31); r.addColorStop(0, 'rgba(0,0,0,0.72)'); r.addColorStop(0.5, 'rgba(0,0,0,0.4)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  r = g.createRadialGradient(96, 32, 8, 96, 32, 31); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,0.1)'); r.addColorStop(0.74, 'rgba(255,255,255,0.75)'); r.addColorStop(0.86, 'rgba(255,255,255,0.2)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(64, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  SHADOW = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); SHADOW.name = 'yacht-crowd-shadow';
  return SHADOW;
}
let CROWD_MOD = null;
const crowdMod = () => CROWD_MOD || (CROWD_MOD = import('./yacht-crowd.js?v=3.8'));
const nextFrame = () => new Promise(r => { let d = false; const f = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });

export function createPeople(yacht) {
  const crowds = new Map();   // zone id → [batch]: { mesh, arm, figs, … } — the painted "looks" and the mix-and-match party crowd
  const cam = new THREE.Vector3();
  let engaged = null;         // the figure in an interaction with the visitor
  const batches = (id) => crowds.get(id) || [];
  const add = (z, b) => { if (!crowds.has(z.id)) crowds.set(z.id, []); crowds.get(z.id).push(b); };

  function build(z, group) {
    const looks = z.people.filter(sp => !sp.mix), mixed = z.people.filter(sp => sp.mix);
    if (looks.length) buildLooks(z, group, looks);
    if (mixed.length) buildMix(z, group, mixed);
  }
  const mkFig = (z, sp, i, L, D) => ({ sp, L, D, i, x: sp.x, y: sp.y, z: sp.z, hx: sp.x, hz: sp.z, t: Math.random() * 10, ph: Math.random() * TAU, anim: sp.anim || 'idle', glass: !!sp.glass, hasArm: true, arm: 0, armT: 0, lean: 0, reach: 0, act: null, greeted: false, zone: z, visible: true, hop: 0,
    cw: 0.9 * (1 - 3 / CW), ch: 1.8 * (1 - 3 / CH), axu: 0.5, y0: 0, km: 1, pivX: 0, pivY: 0 });
  const mkProxy = (f, group) => { const px = new THREE.Mesh(UBOX, colMat()); px.name = 'y-person'; px.userData.yact = () => talk(f); px.userData.reach = 6; f.proxy = px; group.add(px); placeProxy(f); };
  function buildLooks(z, group, people) {
    const A = atlas(), n = people.length;
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * NV * 3), uv = new Float32Array(n * NV * 2), idx = [];
    const ag = new THREE.BufferGeometry(), apos = new Float32Array(n * 4 * 3), auv = new Float32Array(n * 4 * 2), aidx = [];
    const batch = { z, pos, apos, auv, geo, ag, aq: [[-0.36 * 0.45, -0.86 * 0.9], [0.64 * 0.45, -0.86 * 0.9], [-0.36 * 0.45, 0.14 * 0.9], [0.64 * 0.45, 0.14 * 0.9]] };
    batch.setArm = (f) => { setArmUV(auv, f); ag.attributes.uv.needsUpdate = true; };
    batch.figs = people.map((sp, i) => {
      const li = Math.max(0, LOOK_IDS.indexOf(sp.look)), L = LOOKS[LOOK_IDS[li]], D = dims(L.sex);
      const u0 = (li % COLS) * CW / 2048, vTop = 1 - Math.floor(li / COLS) * CH / 2048, du = CW / 2048, dv = CH / 2048, e = 1.5 / 2048;
      for (let r = 0; r <= GY; r++) for (let c = 0; c <= GX; c++) { const k = i * NV + r * (GX + 1) + c; uv[k * 2] = u0 + e + (du - 2 * e) * c / GX; uv[k * 2 + 1] = vTop - dv + e + (dv - 2 * e) * r / GY; }
      for (let r = 0; r < GY; r++) for (let c = 0; c < GX; c++) { const a = i * NV + r * (GX + 1) + c, b = a + 1, d = a + GX + 1, q = d + 1; idx.push(a, b, q, a, q, d); }
      const f = mkFig(z, sp, i, L, D); f.li = li; f.batch = batch; f.hasArm = !(L.mic || L.guitar || L.seated);
      f.km = L.sex === 'm' ? 0.95 : 1; f.pivX = -(D.sh - 0.012) * f.km; f.pivY = (D.yS - 0.03) * f.km;
      aidx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
      setArmUV(auv, f); mkProxy(f, group);
      return f;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    ag.setAttribute('position', new THREE.BufferAttribute(apos, 3).setUsage(THREE.DynamicDrawUsage)); ag.setAttribute('uv', new THREE.BufferAttribute(auv, 2).setUsage(THREE.DynamicDrawUsage)); ag.setIndex(aidx);
    const disco = z.id === 'beach';   // in the disco the cards are lit by the room's colours (yacht-disco.js)
    const mesh = new THREE.Mesh(geo, disco ? discoFigureMat(A.mb) : A.mb), arm = new THREE.Mesh(ag, disco ? discoFigureMat(A.ma) : A.ma);
    for (const m of [mesh, arm]) { m.frustumCulled = false; m.raycast = () => {}; m.name = 'yacht-people'; m.userData.sharedGeo = true; group.add(m); }
    batch.mesh = mesh; batch.arm = arm; add(z, batch);
  }
  // The party crowd (sp.mix): bodies and hinged arms share one geometry and one atlas — a single draw call — plus one for
  // the contact shadows. The atlas is painted by yacht-crowd.js a figure per frame; the crowd appears when it is done.
  function buildMix(z, group, people) {
    const n = people.length;
    const geo = new THREE.BufferGeometry(), all = new Float32Array(n * (NV + 4) * 3), uvs = new Float32Array(n * (NV + 4) * 2), idx = [];
    const pos = all.subarray(0, n * NV * 3), apos = all.subarray(n * NV * 3), uv = uvs.subarray(0, n * NV * 2), auv = uvs.subarray(n * NV * 2);
    all.fill(-999);
    const sg = new THREE.BufferGeometry(), spos = new Float32Array(n * 12), suv = new Float32Array(n * 8), sidx = [];
    const batch = { z, mix: true, pos, apos, auv, uv, geo, ag: geo, sg, spos, ready: false, dead: false, aq: null, plan: null };
    batch.figs = people.map((sp, i) => {
      const sex = sp.mix.sex || 'w', f = mkFig(z, sp, i, { sex, mix: true }, { H: sex === 'm' ? 1.84 : 1.72, sh: 0.16, yS: 1.39 });
      f.batch = batch; f.hasArm = sp.mix.kind !== 'lounge' && sp.mix.kind !== 'swim'; f.dv = i % 3; f.sit = 0; f.nextSit = 6 + Math.random() * 20; f.sip = 0; f.nextSip = 4 + Math.random() * 10;
      if (f.anim === 'dance') f.ph = (i % 2) * Math.PI + (Math.random() - 0.5) * 0.5;
      if (f.anim === 'swim') { f.wl = sp.wl ?? 1.16; f.y = sp.y + (sp.water ?? 0.43) - f.wl; }
      for (let r = 0; r < GY; r++) for (let c = 0; c < GX; c++) { const a = i * NV + r * (GX + 1) + c, b = a + 1, d = a + GX + 1, q = d + 1; idx.push(a, b, q, a, q, d); }
      const k = i * 4; sidx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
      const ring = f.anim === 'swim', u0 = ring ? 0.5 : 0; [[u0, 0], [u0 + 0.5, 0], [u0, 1], [u0 + 0.5, 1]].forEach((q, j) => { suv[(k + j) * 2] = q[0]; suv[(k + j) * 2 + 1] = q[1]; });
      mkProxy(f, group);
      return f;
    });
    for (let i = 0; i < n; i++) { const a = n * NV + i * 4; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    geo.setAttribute('position', new THREE.BufferAttribute(all, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage)); geo.setIndex(idx);
    sg.setAttribute('position', new THREE.BufferAttribute(spos, 3).setUsage(THREE.DynamicDrawUsage)); sg.setAttribute('uv', new THREE.BufferAttribute(suv, 2)); sg.setIndex(sidx);
    const mat = z.id === 'beach' ? discoFigureMat(null) : new THREE.MeshBasicMaterial({ color: 0xf4efe8, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true }); mat.name = 'yacht-figure-card';
    const mesh = new THREE.Mesh(geo, mat), shadow = new THREE.Mesh(sg, shadowMat());
    mesh.name = 'yacht-crowd'; shadow.name = 'yacht-crowd-shadow'; shadow.renderOrder = 3;
    for (const m of [mesh, shadow]) { m.frustumCulled = false; m.raycast = () => {}; m.userData.sharedGeo = true; m.visible = false; group.add(m); }
    batch.mesh = mesh; batch.arm = mesh; batch.shadow = shadow; add(z, batch);
    // the arm sprite by what the arm is doing: 0 hanging, 1 holding a glass, 2 bent for dancing
    batch.setArm = (f, mode = f.glass ? 1 : 0) => { const P = batch.plan; if (!P) return; const C = P.arm(f.armKey, mode), rc = C.rect, S = P.size, e = 1.5; f.armMode = mode;
      const q = [[rc[0] + e, rc[1] + rc[3] - e], [rc[0] + rc[2] - e, rc[1] + rc[3] - e], [rc[0] + e, rc[1] + e], [rc[0] + rc[2] - e, rc[1] + e]];
      f.aq = [[-C.px, C.py - C.h], [C.w - C.px, C.py - C.h], [-C.px, C.py], [C.w - C.px, C.py]];
      for (let j = 0; j < 4; j++) { auv[(f.i * 4 + j) * 2] = q[j][0] / S; auv[(f.i * 4 + j) * 2 + 1] = 1 - q[j][1] / S; } geo.attributes.uv.needsUpdate = true; };
    const big = !matchMedia('(pointer: coarse)').matches && (navigator.deviceMemory || 0) >= 8 && yacht.walk.renderer.capabilities.maxTextureSize >= 4096;
    batch.done = crowdMod().then(mod => {
      if (batch.dead) return null;
      const P = batch.plan = mod.planCrowd(z.id, people.map(sp => sp.mix), { scale: big ? 2 : 1 }), S = P.size;
      batch.figs.forEach((f, i) => {
        const p = P.figs[i], e = 1.5, rc = p.rect, fl = p.flip ? -1 : 1; f.plan = p; f.flip = fl; f.D = { H: p.H, sh: p.sh, yS: p.yS }; f.armKey = p.armKey; f.hasArm = !p.both;
        f.cw = p.cw * (1 - 2 * e / rc[2]); f.ch = p.ch * (1 - 2 * e / rc[3]); f.axu = fl > 0 ? p.ax / p.cw : 1 - p.ax / p.cw; f.y0 = p.y0; f.pivX = -p.sh; f.pivY = p.yS; f.rc = [(rc[0] + e) / S, 1 - (rc[1] + rc[3] - e) / S, (rc[2] - 2 * e) / S, (rc[3] - 2 * e) / S];
        for (let r = 0; r <= GY; r++) for (let c = 0; c <= GX; c++) { const k = i * NV + r * (GX + 1) + c; uv[k * 2] = f.rc[0] + f.rc[2] * (fl > 0 ? c / GX : 1 - c / GX); uv[k * 2 + 1] = f.rc[1] + f.rc[3] * r / GY; }
        batch.setArm(f); placeProxy(f);
      });
      return paintMix(batch);
    }).catch(e => { console.warn('[yacht] crowd ' + z.id, e); return null; });
  }
  // paint (or repaint) a party crowd's atlas a figure per frame, then show the crowd. Only one such atlas is kept:
  // when this one is up, the atlas of any other crowd that is out of sight is released (it is repainted on return).
  function paintMix(batch) {
    const t0 = performance.now(), n = batch.figs.length; batch.painting = true; batch.released = false;
    return batch.plan.paint(window.VRC_CROWD_FAST ? () => Promise.resolve() : nextFrame, () => batch.dead).then(res => {   // (dev pages paint in one go)
      batch.painting = false;
      if (!res || batch.dead) return null;
      const t = new THREE.CanvasTexture(res.canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const mat = batch.mesh.material; mat.map = t; mat.needsUpdate = true; batch.tex = t; batch.ready = true; batch.mesh.visible = batch.shadow.visible = true;
      batch.stats = { figures: n, painted: batch.plan.painted, atlas: res.canvas.width, pxPerM: batch.plan.px, paintMs: Math.round(res.total), worstStepMs: Math.round(res.worst), readyMs: Math.round(performance.now() - t0) };
      for (const [id, list] of crowds) for (const c of list) if (c.mix && c !== batch && c.ready) { const z = yacht.zones.get(id); if (!z || !z.group || !z.group.visible) { c.ready = false; c.released = true; c.mesh.visible = c.shadow.visible = false; c.mesh.material.map = null; c.mesh.material.needsUpdate = true; c.tex.dispose(); c.tex = null; } }
      return batch.stats;
    });
  }
  function setArmUV(auv, f) {
    const k = f.li, gl = f.glass ? 2 : 0, u0 = (k % ACOLS) * AW / 2048, vTop = 1 - (Math.floor(k / ACOLS) + gl) * AH / 1024, du = AW / 2048, dv = AH / 1024, e = 1.5 / 1024;
    const q = [[u0 + e, vTop - dv + e], [u0 + du - e, vTop - dv + e], [u0 + e, vTop - e], [u0 + du - e, vTop - e]];
    for (let j = 0; j < 4; j++) { auv[(f.i * 4 + j) * 2] = q[j][0]; auv[(f.i * 4 + j) * 2 + 1] = q[j][1]; }
  }
  function placeProxy(f) {
    const lying = f.anim === 'sunbathe', px = f.proxy;
    if (lying) { const b = f.sp.bed, al = Math.abs(Math.cos(b[2])) > 0.5; px.position.set(f.x, f.y + 0.55, f.z); px.scale.set(al ? 0.7 : 1.9, 0.45, al ? 1.9 : 0.7); }
    else if (f.wl != null) px.position.set(f.x, f.y + f.wl + 0.3, f.z), px.scale.set(0.55, 0.6, 0.55);
    else { const h = f.anim === 'swim' ? 0.9 : f.L.seated ? 1.3 : f.D.H; px.position.set(f.x, f.y + (f.anim === 'swim' ? f.D.H - 0.45 : h / 2), f.z); px.scale.set(0.55, h, 0.55); }
    px.updateMatrixWorld(true);
  }
  function drop(z) {
    for (const c of batches(z.id)) { c.dead = true; c.geo.dispose(); if (c.ag !== c.geo) c.ag.dispose(); if (c.sg) c.sg.dispose(); if (c.tex) c.tex.dispose(); if (c.mix) c.mesh.material.dispose(); }
    crowds.delete(z.id); if (engaged && engaged.zone === z) engaged = null;
  }
  function targets() { const out = []; for (const [id, list] of crowds) { const z = yacht.zones.get(id); if (z && z.built && z.group.visible) for (const c of list) for (const f of c.figs) if (f.visible) out.push(f.proxy); } return out; }

  // ---- per frame: animate and write the cards
  function update(dt) {
    yacht.toLocal(yacht.walk.camera.position, false, cam);
    const mode = yacht.walk.envMode, beat = yacht.audio.beat || 0, bt = yacht.audio.beatTime || 0, showOn = yacht.audio.show === 'live';
    for (const [id, list] of crowds) {
      const z = yacht.zones.get(id); if (!z || !z.built || !z.group.visible) continue;
      for (const c of list) {
      if (c.mix && !c.ready) { if (c.released && !c.painting) c.done = paintMix(c).catch(e => { console.warn('[yacht] crowd ' + id, e); return null; }); continue; }
      const k = z.out ? (mode === 'day' ? 1 : mode === 'dusk' ? 0.72 : 0.5) : (id === 'beach' ? 1 : 0.92);   // (the disco's own material does its lighting)
      c.mesh.material.color.setRGB(0.957 * k, 0.937 * k, 0.91 * k);
      if (c.arm !== c.mesh) c.arm.material.color.copy(c.mesh.material.color);
      const { pos, apos } = c; let uvDirty = false;
      for (const f of c.figs) {
        f.t += dt; const t = f.t + f.ph;
        // stage performers appear with the live show only; the DJ plays otherwise
        if (f.sp.show) f.visible = showOn; if (f.sp.id === 'dj') f.visible = !showOn;
        if (!f.visible) { for (let k2 = 0; k2 < NV; k2++) pos[(f.i * NV + k2) * 3 + 1] = -999; for (let j = 0; j < 4; j++) apos[(f.i * 4 + j) * 3 + 1] = -999; continue; }
        action(f, dt);
        const cw = f.cw, ch = f.ch, mixf = !!c.mix;
        let rx, rz, fx, fz;                                  // right and forward (towards the viewer) unit vectors
        const lying = f.anim === 'sunbathe';
        if (lying) { const b = f.sp.bed, hx = Math.sin(b[2]), hz = Math.cos(b[2]); rx = hz; rz = -hx; fx = -hx; fz = -hz; if (mixf) { rx = -rx; rz = -rz; fx = -fx; fz = -fz; } }   // (the party crowd lies head to the backrest)
        else { let dx = cam.x - f.x, dz = cam.z - f.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; fx = dx; fz = dz; rx = dz; rz = -dx; }
        // motion parameters
        let bob = 0, sway = 0, hip = 0, tilt = 0, lean = f.lean, step = 0; const breath = Math.sin(t * 1.6) * 0.004;
        const dist = Math.hypot(cam.x - f.x, cam.z - f.z);
        if (f.anim === 'dance' || f.dancing) {
          const ph = bt * Math.PI + f.ph; bob = Math.abs(Math.sin(ph)) * 0.05 * (0.6 + 0.4 * beat); hip = Math.sin(ph) * 0.05; sway = Math.sin(ph * 0.5 + f.ph) * 0.035; tilt = Math.sin(ph * 0.5) * 0.05;
          if (mixf) { const dv = f.dv; hip *= dv === 2 ? 1.5 : 1; bob *= dv === 1 ? 1.25 : 0.9; step = dv === 1 ? Math.sin(ph * 0.5) * 0.09 : 0; if (f.hasArm && (!f.act || f.dancing)) f.armT = f.glass ? 0.3 + Math.sin(ph) * 0.2 : dv === 0 ? 1.45 + Math.sin(ph) * 0.3 : dv === 1 ? 1.0 + Math.sin(ph) * 0.45 : 0.45 + Math.sin(ph * 0.5) * 0.3; }
          else if (f.hasArm && !f.act) f.armT = f.glass ? 0.3 + Math.sin(ph) * 0.2 : 2.2 + Math.sin(ph) * 0.5;
        }
        else if (f.anim === 'dj') { const ph = bt * Math.PI; bob = Math.abs(Math.sin(ph)) * 0.03; tilt = Math.sin(ph) * 0.04; if (f.hasArm && !f.act) f.armT = 2.5 + Math.sin(ph * 2) * 0.35; }
        else if (f.anim === 'sing' || f.anim === 'band') { sway = Math.sin(t * 1.1) * 0.03; tilt = Math.sin(t * 0.8) * 0.04; bob = Math.abs(Math.sin(bt * Math.PI)) * 0.012; }
        else if (f.anim === 'swim') { const dr = f.sp.drift || [0.5, 0.35]; bob = Math.sin(t * 1.3) * (mixf ? 0.022 : 0.03) + (mixf ? Math.sin(t * 0.37) * 0.03 : 0); sway = Math.sin(t * 0.7) * 0.02; tilt = mixf ? Math.sin(t * 0.5) * 0.03 : 0; f.x = f.hx + Math.sin(t * 0.21) * dr[0]; f.z = f.hz + Math.cos(t * 0.17) * dr[1]; }
        else if (f.anim === 'chat') { sway = Math.sin(t * 0.6) * 0.012; tilt = Math.sin(t * 0.9) * 0.03 + Math.sin(t * 2.3) * 0.01; if (mixf) hip = Math.sin(t * 0.45) * 0.018; if (f.glass && !f.act) f.armT = 0.08 + Math.max(0, Math.sin(t * 0.33)) * 0.25; }
        else if (f.anim === 'massage') { const ph = t * 2.2; lean = 0.16 + Math.sin(ph) * 0.05; sway = Math.sin(ph * 0.5) * 0.03; if (f.hasArm) f.armT = 0.9 + Math.sin(ph) * 0.18; }
        else if (f.anim === 'bar') { sway = Math.sin(t * 0.5) * 0.01; tilt = Math.sin(t * 0.7) * 0.02; }
        else { sway = Math.sin(t * 0.45) * 0.008; tilt = Math.sin(t * 0.6) * 0.015; if (f.glass && !f.act) f.armT = 0.08; }
        if (mixf) {
          if (f.hasArm) { const am = f.glass ? 1 : (f.dancing || (f.anim === 'dance' && !f.act)) ? 2 : 0; if (am !== f.armMode) c.setArm(f, am); }
          // a sip now and then; on the sunbed, sitting up a little and settling back
          if (f.glass && f.hasArm && !f.act && f.anim !== 'dance') { f.nextSip -= dt; if (f.nextSip < 0) { f.sip = 1.6; f.nextSip = 9 + Math.random() * 12; } if (f.sip > 0) { f.sip -= dt; f.armT = 0.5 * Math.sin(Math.min(1, (1.6 - f.sip) / 0.5) * Math.PI / 2) * Math.min(1, Math.max(0, f.sip) / 0.4); tilt -= 0.02; } }
          if (lying) { f.nextSit -= dt; if (f.nextSit < 0) { f.sitT = 0; f.nextSit = 16 + Math.random() * 24; } if (f.sitT != null) { f.sitT += dt; const u = f.sitT / 5; f.sit = u >= 1 ? 0 : Math.sin(u * Math.PI) ** 2; if (u >= 1) f.sitT = null; } }
        }
        if (!lying && f.anim !== 'swim' && !f.act && dist < 3.2 && !f.greeted && f.sp.say && yacht.mode === 'walk') { f.greeted = true; f.hop = 0.6; yacht.say(f.sp.say); }
        if (f.hop > 0) { f.hop = Math.max(0, f.hop - dt); tilt += Math.sin((1 - f.hop / 0.6) * Math.PI) * 0.1; }
        f.arm += (f.armT - f.arm) * Math.min(1, dt * 7);
        // body card (the bathers' cards are cut at the waterline, wherever the bobbing puts it)
        const by = f.y + (lying ? (mixf ? 0.405 : 0.47) + (f.sp.lift || 0) : bob), base = f.i * NV * 3, top = f.y0 + ch;
        const yb = f.wl != null ? clamp(f.wl - bob, f.y0, top - 0.25) : f.y0;
        if (f.wl != null) { const u2 = f.i * NV * 2; for (let r = 0; r <= GY; r++) { const vv = f.rc[1] + f.rc[3] * (yb + (top - yb) * r / GY - f.y0) / ch; for (let cc = 0; cc <= GX; cc++) c.uv[u2 + (r * (GX + 1) + cc) * 2 + 1] = vv; } uvDirty = true; }
        for (let r = 0; r <= GY; r++) for (let cc = 0; cc <= GX; cc++) {
          const u = cc / GX - f.axu, hgt = yb + (top - yb) * r / GY, v = Math.min(1, hgt / 1.8), kk = base + (r * (GX + 1) + cc) * 3;
          const up = sstep(0.45, 1, v), mid = Math.sin(Math.PI * v);
          const ox = u * cw * (1 + breath * (v > 0.6 && v < 0.85 ? 1 : 0)) + hip * mid + sway * up + step + tilt * sstep(0.74, 1, v) * (hgt - 1.35), of = lean * up * up * 0.9;
          if (lying) { const raise = mixf ? (0.2 + 0.16 * f.sit) * sstep(0.6, 0.98, v) : (v > 0.62 ? 0.14 * sstep(0.62, 0.9, v) : 0); pos[kk] = f.x + rx * ox - fx * (hgt - 0.95); pos[kk + 1] = by + Math.sin(t * 1.5) * 0.004 * mid + raise; pos[kk + 2] = f.z + rz * ox - fz * (hgt - 0.95); }
          else { pos[kk] = f.x + rx * ox + fx * of; pos[kk + 1] = by + hgt - lean * up * 0.12; pos[kk + 2] = f.z + rz * ox + fz * of; }
        }
        // the hinged arm: pivot at the figure's right shoulder (viewer's left), rotating in the card plane, in front of the body
        const ab = f.i * 12;
        if (f.hasArm && !lying) {
          const fl = f.flip || 1, sx = sway + step + tilt * 0.05, sy = f.pivY + bob, a = -f.arm, ca = Math.cos(a), sa = Math.sin(a), quad = f.aq || c.aq;   // (a mirrored twin's arm hinges on the other shoulder)
          for (let j = 0; j < 4; j++) { const qx = quad[j][0], qy = quad[j][1], x2 = sx + fl * (f.pivX + qx * ca - qy * sa), y2 = sy + qx * sa + qy * ca, of = 0.015 + lean * 0.8 + f.reach * Math.max(0, -qy);
            apos[ab + j * 3] = f.x + rx * x2 + fx * of; apos[ab + j * 3 + 1] = f.y + y2 - (lean ? lean * 0.1 : 0); apos[ab + j * 3 + 2] = f.z + rz * x2 + fz * of; }
        } else for (let j = 0; j < 4; j++) apos[ab + j * 3 + 1] = -999;
        // contact shadow on the deck / the sunbed, or the ring where a bather breaks the water
        if (mixf) {
          const sp = c.spos, sb = f.i * 12; let hx2 = 0.36, hz2 = 0.36, sy = f.y + 0.012, cx = f.x, cz = f.z;
          if (lying) { const b = f.sp.bed, al = Math.abs(Math.cos(b[2])) > 0.5; hx2 = al ? 0.4 : 0.98; hz2 = al ? 0.98 : 0.4; sy = f.y + 0.362; cx = f.x - fx * 0.12; cz = f.z - fz * 0.12; }
          else if (f.wl != null) { const s = 0.36 + 0.05 * Math.sin(t * 1.3); hx2 = hz2 = s; sy = f.y + f.wl + 0.008; }
          else { sy = f.y + 0.012 + (f.sp.floor ? 0.022 : 0); cx = f.x + rx * step; cz = f.z + rz * step; }
          sp[sb] = cx - hx2; sp[sb + 1] = sy; sp[sb + 2] = cz + hz2; sp[sb + 3] = cx + hx2; sp[sb + 4] = sy; sp[sb + 5] = cz + hz2; sp[sb + 6] = cx - hx2; sp[sb + 7] = sy; sp[sb + 8] = cz - hz2; sp[sb + 9] = cx + hx2; sp[sb + 10] = sy; sp[sb + 11] = cz - hz2;
        }
      }
      c.geo.attributes.position.needsUpdate = true; if (c.ag !== c.geo) c.ag.attributes.position.needsUpdate = true;
      if (uvDirty) c.geo.attributes.uv.needsUpdate = true;
      if (c.sg) c.sg.attributes.position.needsUpdate = true;
      }
    }
  }

  // ---- interactions: the figure walks up to the visitor, does its part, walks back
  function action(f, dt) {
    const a = f.act; if (!a) return;
    a.t += dt;
    const tx = cam.x, tz = cam.z, dx = f.hx - tx, dz = f.hz - tz, l = Math.hypot(dx, dz) || 1;
    const near = { x: tx + dx / l * a.dist, z: tz + dz / l * a.dist };
    const mv = (to, sp) => { const ex = to.x - f.x, ez = to.z - f.z, d = Math.hypot(ex, ez); if (d < 0.02) return true; const s = Math.min(d, sp * dt); f.x += ex / d * s; f.z += ez / d * s; return false; };
    if (a.phase === 'come') { if (mv(near, 1.5) || a.t > 4) { a.phase = 'do'; a.t = 0; if (a.onDo) a.onDo(); } }
    else if (a.phase === 'do') { if (a.tick) a.tick(a.t); if (a.t > a.dur) { a.phase = 'back'; a.t = 0; f.lean = 0; f.reach = 0; f.armT = 0; f.dancing = false; if (a.onEnd) a.onEnd(); } }
    else if (mv({ x: f.hx, z: f.hz }, 1.4) || a.t > 5) { f.x = f.hx; f.z = f.hz; f.act = null; if (engaged === f) engaged = null; }
    placeProxy(f);
  }
  function start(f, a) { if (f.act || (engaged && engaged !== f)) return false; engaged = f; f.act = { phase: 'come', t: 0, dist: 0.9, dur: 1.5, ...a }; return true; }
  function talk(f) {
    if (f.act) return;
    const t = yacht.t, role = t(f.sp.role || 'guest'), items = [];
    const lying = f.anim === 'sunbathe', fixed = lying || f.anim === 'swim' || f.anim === 'dj' || f.anim === 'sing' || f.anim === 'band' || f.anim === 'bar' || f.anim === 'massage' || f.L.seated || f.sp.role === 'masseuse';
    items.push([t('hello'), () => { f.hop = 0.6; if (f.hasArm && !f.glass && !lying) { f.armT = 2.6; setTimeout(() => { f.armT = 2.2; setTimeout(() => { f.armT = 2.6; setTimeout(() => { if (!f.act) f.armT = 0; }, 350); }, 220); }, 260); } yacht.say(f.sp.say || (f.sp.role === 'guest' ? 'sayHi' : 'sayWelcome')); }]);
    if (f.sp.role === 'guest' && !fixed && !f.sp.noTalk) {
      items.push([t('toast'), () => { if (!yacht.held) return yacht.walk._toast(t('needDrink'), 2400);
        if (!f.glass) { f.glass = true; f.batch.setArm(f, 1); }
        start(f, { dist: 0.95, dur: 1.9, onDo: () => yacht.clink(), tick: (tt) => { f.armT = 0.55 * Math.sin(Math.min(1, tt / 0.5) * Math.PI / 2); f.reach = 0.25 * Math.sin(Math.min(1, tt / 0.6) * Math.PI); }, onEnd: () => yacht.say('sayCheers') }); }]);
      items.push([t('dance'), () => { if (!yacht.cur || yacht.cur.id !== 'beach') return yacht.walk._toast(t('needFloor'), 2400);
        start(f, { dist: 1.25, dur: 14, onDo: () => { f.dancing = true; yacht.say('sayDance'); yacht.danceWith(14); } }); }]);
      items.push([t('kiss'), () => start(f, { dist: 0.62, dur: 1.5, tick: (tt) => { f.lean = 0.2 * Math.sin(Math.min(1, tt / 1.3) * Math.PI); if (tt > 0.55 && !f.act.kissed) { f.act.kissed = true; yacht.audio.sfx('kiss'); } }, onEnd: () => yacht.say('sayNice') })]);
      items.push([t('five'), () => start(f, { dist: 0.85, dur: 1.2, tick: (tt) => { if (f.glass) { if (!f.act.hit) { f.act.hit = true; f.hop = 0.5; } return; } f.armT = 2.75; f.reach = tt > 0.45 ? 0.5 * Math.sin(Math.min(1, (tt - 0.45) / 0.35) * Math.PI) : 0; if (tt > 0.6 && !f.act.hit) { f.act.hit = true; yacht.audio.sfx('clap'); } } })]);
    } else if (f.sp.role !== 'guest' && !fixed) {
      items.push([t('shake'), () => start(f, { dist: 0.8, dur: 1.4, tick: (tt) => { f.armT = 1.0 + Math.sin(tt * 14) * 0.08; f.reach = 0.35; f.lean = 0.05; }, onEnd: () => yacht.say('sayWelcome') })]);
    }
    yacht.menu(role, items);
  }
  const each = (fn) => { for (const list of crowds.values()) for (const c of list) for (const f of c.figs) fn(f, c); };
  function setAnim(id, anim) { each(f => { if (f.sp.id === id) { f.anim = anim; f.armT = 0; f.lean = 0; } }); }
  function find(id) { let r = null; each(f => { if (!r && f.sp.id === id) r = f; }); return r; }
  function dispose() { for (const id of [...crowds.keys()]) drop({ id }); if (ATLAS) { ATLAS.tb.dispose(); ATLAS.ta.dispose(); ATLAS.mb.dispose(); ATLAS.ma.dispose(); ATLAS = null; } }
  // the party crowd of a zone: resolves when its atlas is painted (tests) / its numbers
  const mixOf = (id) => batches(id).find(c => c.mix);
  const ready = (id) => { const c = mixOf(id); return c ? c.done : Promise.resolve(null); };
  const stats = (id) => { const c = mixOf(id); return c ? c.stats || null : null; };
  return { build, drop, update, targets, setAnim, find, dispose, talk, atlas, ready, stats, mixOf, get count() { let n = 0; each(() => n++); return n; }, looks: LOOK_IDS };
}
