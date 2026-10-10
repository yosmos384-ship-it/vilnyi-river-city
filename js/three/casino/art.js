// VILNYI Lifestyle casino — generated artwork (canvas → textures): playing cards, chips, table layouts, the roulette
// wheel, slot symbols, carpet, dice, signs. Everything is original and drawn in code; no external images, no brands.
import * as THREE from 'three';
import { WHEEL, colorOf } from './roulette.js?v=3.8';
import { RL, rlCell } from './roulette-layout.js?v=3.8';
import { RANKS } from './rng.js?v=3.8';

const TAU = Math.PI * 2;
const GOLD = '#d2a95a', GOLD2 = '#f0d79a', FELT = '#0d5c3f', FELT2 = '#0a4a33', INK = '#14161a', REDC = '#c8102e';
export function tex(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = o.aniso ?? 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  return t;
}
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const SERIF = '"Cormorant Garamond","Bodoni Moda",Georgia,"Times New Roman",serif';
const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

// ------------------------------------------------------------------ suits (unit shapes centred on 0,0, size ≈ 1)
export function suitPath(g, s, x, y, k) {
  g.save(); g.translate(x, y); g.scale(k, k); g.beginPath();
  if (s === 1) { g.moveTo(0, 0.46); g.bezierCurveTo(-0.62, 0.02, -0.5, -0.5, -0.22, -0.46); g.bezierCurveTo(-0.08, -0.44, 0, -0.32, 0, -0.22); g.bezierCurveTo(0, -0.32, 0.08, -0.44, 0.22, -0.46); g.bezierCurveTo(0.5, -0.5, 0.62, 0.02, 0, 0.46); }
  else if (s === 2) { g.moveTo(0, -0.5); g.lineTo(0.36, 0); g.lineTo(0, 0.5); g.lineTo(-0.36, 0); }
  else if (s === 0) { g.moveTo(0, -0.5); g.bezierCurveTo(0.62, -0.02, 0.5, 0.42, 0.2, 0.32); g.bezierCurveTo(0.1, 0.29, 0.05, 0.22, 0.03, 0.16); g.lineTo(0.14, 0.5); g.lineTo(-0.14, 0.5); g.lineTo(-0.03, 0.16); g.bezierCurveTo(-0.05, 0.22, -0.1, 0.29, -0.2, 0.32); g.bezierCurveTo(-0.5, 0.42, -0.62, -0.02, 0, -0.5); }
  else { g.arc(0, -0.25, 0.22, 0, TAU); g.moveTo(0.02, 0.06); g.arc(-0.22, 0.08, 0.22, 0, TAU); g.moveTo(0.44, 0.08); g.arc(0.22, 0.08, 0.22, 0, TAU); g.moveTo(-0.03, 0.1); g.lineTo(0.03, 0.1); g.lineTo(0.14, 0.5); g.lineTo(-0.14, 0.5); }
  g.closePath(); g.fill(); g.restore();
}
// the VILNYI bird as a folded-paper silhouette (original drawing)
export function birdPath(g, x, y, k, col = GOLD) {
  g.save(); g.translate(x, y); g.scale(k, k);
  const P = (pts, c) => { g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); g.fillStyle = c; g.fill(); };
  P([[-0.5, 0.1], [-0.05, -0.08], [0.1, 0.12], [-0.12, 0.2]], col); P([[-0.05, -0.08], [0.3, -0.46], [0.22, -0.02], [0.1, 0.12]], GOLD2);
  P([[0.1, 0.12], [0.22, -0.02], [0.5, 0.02], [0.36, 0.12]], col); P([[-0.12, 0.2], [0.1, 0.12], [0.02, 0.4]], '#a37a34');
  g.restore();
}

// ------------------------------------------------------------------ playing cards: 13 × 5 cells (row = suit; row 4: back, cut card)
export const CARD = { cw: 144, ch: 200, cols: 13, rows: 5 };
let CARD_TEX = null;
export function cardAtlas() {
  if (CARD_TEX) return CARD_TEX;
  const { cw, ch, cols, rows } = CARD;
  return CARD_TEX = tex(cw * cols, ch * rows, (g) => {
    for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) {
      const x = r * cw, y = s * ch, col = s === 1 || s === 2 ? REDC : INK, name = RANKS[r];
      g.fillStyle = '#b9b4a8'; g.fillRect(x, y, cw, ch);
      rr(g, x + 2, y + 2, cw - 4, ch - 4, 12); g.fillStyle = '#fbfaf5'; g.fill();
      g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      // jumbo index top-left and (turned) bottom-right
      const idx = (px, py, rot) => { g.save(); g.translate(px, py); g.rotate(rot); g.font = `700 ${name === '10' ? 54 : 62}px ${SERIF}`; g.fillText(name, 0, 22); suitPath(g, s, 0, 52, 36); g.restore(); };
      idx(x + 34, y + 36, 0); idx(x + cw - 34, y + ch - 36, Math.PI);
      // centre: a big pip; courts get a framed monogram
      if (r >= 10) {
        rr(g, x + 58, y + 44, cw - 72, ch - 88, 8); g.strokeStyle = GOLD; g.lineWidth = 3; g.stroke(); g.fillStyle = s === 1 || s === 2 ? '#fbeef0' : '#eef0f4'; g.fill();
        g.fillStyle = col; g.font = `700 78px ${SERIF}`; g.fillText(name, x + 58 + (cw - 72) / 2, y + ch / 2 + 16);
        suitPath(g, s, x + 58 + (cw - 72) / 2, y + ch / 2 + 44, 26);
        g.fillStyle = GOLD; g.beginPath(); const cx = x + 58 + (cw - 72) / 2, cy = y + 66; g.moveTo(cx - 20, cy + 8); g.lineTo(cx - 20, cy - 8); g.lineTo(cx - 10, cy); g.lineTo(cx, cy - 12); g.lineTo(cx + 10, cy); g.lineTo(cx + 20, cy - 8); g.lineTo(cx + 20, cy + 8); g.closePath(); g.fill();
      } else { g.fillStyle = col; suitPath(g, s, x + cw / 2 + 16, y + ch / 2 + 6, r === 0 ? 88 : 68); }
    }
    // back: navy with a gold lattice and the bird
    const bx = 0, by = 4 * ch;
    g.fillStyle = '#b9b4a8'; g.fillRect(bx, by, cw, ch); rr(g, bx + 2, by + 2, cw - 4, ch - 4, 12); g.fillStyle = '#fbfaf5'; g.fill();
    rr(g, bx + 9, by + 9, cw - 18, ch - 18, 8); g.fillStyle = '#13233f'; g.fill(); g.save(); g.clip();
    g.strokeStyle = 'rgba(210,169,90,0.55)'; g.lineWidth = 1.5; for (let i = -ch; i < cw + ch; i += 14) { g.beginPath(); g.moveTo(bx + i, by); g.lineTo(bx + i + ch, by + ch); g.stroke(); g.beginPath(); g.moveTo(bx + i + ch, by); g.lineTo(bx + i, by + ch); g.stroke(); }
    g.restore(); g.beginPath(); g.ellipse(bx + cw / 2, by + ch / 2, 40, 40, 0, 0, TAU); g.fillStyle = '#13233f'; g.fill(); g.strokeStyle = GOLD; g.lineWidth = 2.5; g.stroke();
    birdPath(g, bx + cw / 2, by + ch / 2, 58);
    // cut card
    rr(g, cw + 2, by + 2, cw - 4, ch - 4, 12); g.fillStyle = '#e8b93a'; g.fill();
  }, { aniso: 16 });
}
/** UV rect [u0, v0, u1, v1] of a card face (c = 0…51), the back (−1) or the cut card (−2). */
export function cardUV(c) {
  const { cols, rows } = CARD, col = c >= 0 ? c % 13 : c === -1 ? 0 : 1, row = c >= 0 ? (c / 13 | 0) : 4, e = 0.0012;
  return [col / cols + e, 1 - (row + 1) / rows + e, (col + 1) / cols - e, 1 - row / rows - e];
}

// ------------------------------------------------------------------ chips: 5 designs in a row (top face), stripes below (edge)
export const CHIP_COL = { 100: ['#e9e6dd', '#3d4f7a'], 500: ['#b3202c', '#f4efe2'], 2500: ['#1d7a46', '#f4efe2'], 10000: ['#17181c', '#d2a95a'], 50000: ['#5a2a82', '#f0d79a'] };
export const CHIP_VALUES = [100, 500, 2500, 10000, 50000];
let CHIP_TEX = null;
export function chipAtlas() {
  if (CHIP_TEX) return CHIP_TEX;
  return CHIP_TEX = tex(640, 160, (g) => {
    CHIP_VALUES.forEach((v, i) => {
      const [a, b] = CHIP_COL[v], cx = i * 128 + 64, cy = 64;
      g.fillStyle = a; g.fillRect(i * 128, 0, 128, 128);
      g.fillStyle = b; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 64, k / 8 * TAU - 0.16, k / 8 * TAU + 0.16); g.closePath(); g.fill(); }
      g.beginPath(); g.arc(cx, cy, 47, 0, TAU); g.fillStyle = a; g.fill(); g.lineWidth = 3; g.strokeStyle = b; g.stroke();
      g.beginPath(); g.arc(cx, cy, 36, 0, TAU); g.fillStyle = b; g.fill();
      g.fillStyle = a; g.font = `700 ${v >= 10000 ? 30 : 36}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v / 100), cx, cy + 2);
      // edge stripes
      g.fillStyle = a; g.fillRect(i * 128, 128, 128, 32); g.fillStyle = b; for (let k = 0; k < 4; k++) g.fillRect(i * 128 + k * 32 + 6, 128, 12, 32);
    });
  }, { aniso: 8 });
}
/** Small canvas of one chip for the HUD rack (data URL). */
export function chipIcon(v, size = 96) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), [a, b] = CHIP_COL[v], m = size / 2;
  g.beginPath(); g.arc(m, m, m - 1, 0, TAU); g.fillStyle = a; g.fill();
  g.fillStyle = b; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(m, m); g.arc(m, m, m - 1, k / 8 * TAU - 0.16, k / 8 * TAU + 0.16); g.closePath(); g.fill(); }
  g.beginPath(); g.arc(m, m, m * 0.72, 0, TAU); g.fillStyle = a; g.fill(); g.lineWidth = size * 0.03; g.strokeStyle = b; g.stroke();
  g.beginPath(); g.arc(m, m, m * 0.56, 0, TAU); g.fillStyle = b; g.fill();
  g.fillStyle = a; g.font = `700 ${size * (v >= 10000 ? 0.27 : 0.33)}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v / 100), m, m + size * 0.02);
  return c.toDataURL('image/png');
}

// ------------------------------------------------------------------ felt
function feltBase(g, w, h, col = FELT, col2 = FELT2) {
  const gr = g.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, Math.max(w, h) * 0.75); gr.addColorStop(0, col); gr.addColorStop(1, col2); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r() * 0.03})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
}
function arcText(g, text, cx, cy, R, a0, a1, font, col, flip = false) {
  g.save(); g.font = font; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = text.length; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)); g.save(); g.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.rotate(a + (flip ? -Math.PI / 2 : Math.PI / 2)); g.fillText(text[i], 0, 0); g.restore(); }
  g.restore();
}
// Card table tops share one D shape: 2.3 m wide (u ∈ ±1.15), 1.25 m deep (v from 0 at the dealer's edge to 1.25 at the
// player's). Texture: u → x, v → y (y down = towards the player), px per metre below.
export const DTABLE = { w: 2.3, d: 1.25, ppm: 440 };
const dx = (u) => (u + DTABLE.w / 2) * DTABLE.ppm, dy = (v) => v * DTABLE.ppm;
/** Blackjack layout. boxes: [[u, v]…] bet circles. */
export function feltBlackjack(boxes) {
  const W = Math.round(DTABLE.w * DTABLE.ppm), H = Math.round(DTABLE.d * DTABLE.ppm);
  return tex(W, H, (g) => {
    feltBase(g, W, H);
    const cx = W / 2;
    arcText(g, 'BLACKJACK PAYS 3 TO 2', cx, dy(-0.42), dy(0.86), Math.PI * 0.66, Math.PI * 0.34, `600 34px ${SERIF}`, GOLD2, true);
    arcText(g, 'DEALER STANDS ON ALL 17s', cx, dy(-0.42), dy(0.96), Math.PI * 0.64, Math.PI * 0.36, `500 22px ${SERIF}`, '#e9e2cf', true);
    // insurance band
    g.strokeStyle = GOLD; g.lineWidth = 3; g.beginPath(); g.arc(cx, dy(-0.42), dy(1.04), Math.PI * 0.30, Math.PI * 0.70); g.stroke(); g.beginPath(); g.arc(cx, dy(-0.42), dy(1.115), Math.PI * 0.30, Math.PI * 0.70); g.stroke();
    arcText(g, 'INSURANCE PAYS 2 TO 1', cx, dy(-0.42), dy(1.078), Math.PI * 0.62, Math.PI * 0.38, `600 20px ${SANS}`, GOLD2, true);
    for (const [u, v] of boxes) { g.beginPath(); g.arc(dx(u), dy(v), 0.062 * DTABLE.ppm, 0, TAU); g.strokeStyle = GOLD2; g.lineWidth = 4; g.stroke(); g.beginPath(); g.arc(dx(u), dy(v), 0.052 * DTABLE.ppm, 0, TAU); g.strokeStyle = 'rgba(240,215,154,0.35)'; g.lineWidth = 1.5; g.stroke(); }
    // dealer's card place, shoe corner, emblem
    rr(g, dx(-0.045), dy(0.12), 0.09 * DTABLE.ppm, 0.126 * DTABLE.ppm, 6); g.strokeStyle = 'rgba(240,215,154,0.4)'; g.lineWidth = 2; g.stroke();
    birdPath(g, cx, dy(0.36), 70, 'rgba(210,169,90,0.5)');
    g.font = `500 17px ${SANS}`; g.fillStyle = 'rgba(233,226,207,0.75)'; g.textAlign = 'center'; g.fillText('€5 – €500  ·  PLAY CHIPS', cx, dy(0.47));
  });
}
/** Baccarat layout: areas { player, tie, banker } → [u0, v0, u1, v1]. */
export function feltBaccarat(areas) {
  const W = Math.round(DTABLE.w * DTABLE.ppm), H = Math.round(DTABLE.d * DTABLE.ppm);
  return tex(W, H, (g) => {
    feltBase(g, W, H, '#0e4f5c', '#0a3a45');
    const lab = { player: ['PLAYER', '1 : 1', '#9fd0ff'], tie: ['TIE', '8 : 1', GOLD2], banker: ['BANKER', '0.95 : 1', '#ff9f9f'] };
    for (const k of Object.keys(areas)) {
      const [u0, v0, u1, v1] = areas[k]; rr(g, dx(u0), dy(v0), dx(u1) - dx(u0), dy(v1) - dy(v0), 16); g.strokeStyle = lab[k][2]; g.lineWidth = 4; g.stroke(); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
      g.fillStyle = lab[k][2]; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${k === 'tie' ? 22 : 24}px ${SERIF}`; g.fillText(lab[k][0], (dx(u0) + dx(u1)) / 2, dy(v0) + 18);
      g.font = `500 14px ${SANS}`; g.fillText(lab[k][1], (dx(u0) + dx(u1)) / 2, dy(v1) - 13);
    }
    g.strokeStyle = 'rgba(240,215,154,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(dx(0), dy(0.24)); g.lineTo(dx(0), dy(0.7)); g.stroke();
    g.textAlign = 'center'; g.font = `600 24px ${SERIF}`; g.fillStyle = GOLD2; g.fillText('PUNTO BANCO', dx(0), dy(0.2));
    g.font = `500 15px ${SANS}`; g.fillStyle = 'rgba(233,226,207,0.75)'; g.fillText('€5 – €1,000  ·  PLAY CHIPS', dx(0), dy(1.14));
  });
}
/** Casino Hold'em layout. spots: { ante, call } → [u, v]; board at v = boardV. */
export function feltHoldem(spots, boardV, dealerV, playerV) {
  const W = Math.round(DTABLE.w * DTABLE.ppm), H = Math.round(DTABLE.d * DTABLE.ppm), P = DTABLE.ppm;
  return tex(W, H, (g) => {
    feltBase(g, W, H, '#5c1420', '#44101a');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const k = spots.s || 1, slot = (u, v) => { rr(g, dx(u - 0.042 * k), dy(v - 0.0585 * k), 0.084 * k * P, 0.117 * k * P, 6); g.strokeStyle = 'rgba(240,215,154,0.4)'; g.lineWidth = 2; g.stroke(); };
    for (let i = 0; i < 5; i++) slot((i - 2) * 0.095 * k, boardV); for (const u of [-0.048 * k, 0.048 * k]) { slot(u, dealerV); slot(u, playerV); }
    for (const [k, name] of [['ante', 'ANTE'], ['call', 'CALL']]) { const [u, v] = spots[k]; g.beginPath(); g.arc(dx(u), dy(v), 0.06 * P, 0, TAU); g.strokeStyle = GOLD2; g.lineWidth = 4; g.stroke(); g.fillStyle = GOLD2; g.font = `600 15px ${SANS}`; g.fillText(name, dx(u), dy(v) + 0.085 * P); }
    g.font = `600 26px ${SERIF}`; g.fillStyle = GOLD2; g.fillText("CASINO HOLD'EM", dx(0), dy(0.055));
    g.font = `500 14px ${SANS}`; g.fillStyle = 'rgba(233,226,207,0.8)';
    ['ANTE PAYS', 'Royal flush 100:1', 'Straight flush 20:1', 'Four of a kind 10:1', 'Full house 3:1', 'Flush 2:1', 'Straight or less 1:1'].forEach((s, i) => g.fillText(s, dx(-0.72), dy(0.2) + i * 19));
    ['DEALER QUALIFIES', 'with a pair of 4s or better', 'CALL = 2 × ANTE, pays 1:1'].forEach((s, i) => g.fillText(s, dx(0.72), dy(0.24) + i * 19));
  });
}
// Roulette layout: geometry in roulette-layout.js (shared with the taps).
export { RL, rlCell };
export function feltRoulette() {
  const P = RL.ppm, W = Math.round(RL.w * P), H = Math.round(RL.h * P), uL = RL.uL, vB = RL.vB;
  const X = (u) => (u - uL) * P, Y = (v) => H - (v - vB) * P;            // v grows away from the player → up on the texture
  return tex(W, H, (g) => {
    feltBase(g, W, H);
    g.lineWidth = 3; g.strokeStyle = GOLD2; g.textAlign = 'center'; g.textBaseline = 'middle';
    const cell = (u0, v0, u1, v1, fill, label, font, col = '#fff', rot = 0) => {
      if (fill) { g.fillStyle = fill; g.fillRect(X(u0), Y(v1), (u1 - u0) * P, (v1 - v0) * P); }
      g.strokeRect(X(u0), Y(v1), (u1 - u0) * P, (v1 - v0) * P);
      if (label) { g.save(); g.translate(X((u0 + u1) / 2), Y((v0 + v1) / 2)); g.rotate(rot); g.fillStyle = col; g.font = font; g.fillText(label, 0, 2); g.restore(); }
    };
    for (let n = 1; n <= 36; n++) { const [u, v] = rlCell(n), c = colorOf(n); cell(u - RL.cell[0] / 2, v - RL.cell[1] / 2, u + RL.cell[0] / 2, v + RL.cell[1] / 2, c === 'red' ? '#b3202c' : '#17181c', String(n), `700 40px ${SERIF}`); }
    cell(RL.u0, RL.v0 + 12 * RL.cell[1], RL.u0 + 3 * RL.cell[0], RL.v0 + 12 * RL.cell[1] + RL.zeroH, '#1d8a4c', '0', `700 46px ${SERIF}`);
    for (let c = 0; c < 3; c++) cell(RL.u0 + c * RL.cell[0], vB, RL.u0 + (c + 1) * RL.cell[0], RL.v0, null, '2 : 1', `600 26px ${SERIF}`, GOLD2);
    for (let d = 0; d < 3; d++) cell(RL.u0 - RL.dozW, RL.v0 + (2 - d) * 4 * RL.cell[1], RL.u0, RL.v0 + (3 - d) * 4 * RL.cell[1], null, ['1st 12', '2nd 12', '3rd 12'][d], `600 28px ${SERIF}`, GOLD2, -Math.PI / 2);
    const ev = [['19 – 36', null], ['ODD', null], ['', '#17181c'], ['', '#b3202c'], ['EVEN', null], ['1 – 18', null]];      // from the player's end
    ev.forEach(([label, fill], i) => {
      const v0 = RL.v0 + i * 2 * RL.cell[1], v1 = v0 + 2 * RL.cell[1];
      cell(uL, v0, RL.u0 - RL.dozW, v1, null, label, `600 24px ${SERIF}`, GOLD2, -Math.PI / 2);
      if (fill) { g.save(); g.translate(X((uL + RL.u0 - RL.dozW) / 2), Y((v0 + v1) / 2)); g.beginPath(); g.moveTo(0, -40); g.lineTo(22, 0); g.lineTo(0, 40); g.lineTo(-22, 0); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = GOLD2; g.lineWidth = 2; g.stroke(); g.restore(); g.lineWidth = 3; }
    });
  }, { aniso: 16 });
}
/** Roulette rotor seen from above: pockets in wheel order (clockwise), numbers facing the centre. */
export function wheelTex() {
  return tex(1024, 1024, (g, w) => {
    const c = w / 2; g.clearRect(0, 0, w, w);
    g.beginPath(); g.arc(c, c, 500, 0, TAU); g.fillStyle = '#3a2414'; g.fill();
    const step = TAU / 37;
    WHEEL.forEach((n, i) => {
      const a0 = -Math.PI / 2 + (i - 0.5) * step, a1 = a0 + step, col = colorOf(n);
      g.beginPath(); g.arc(c, c, 470, a0, a1); g.arc(c, c, 300, a1, a0, true); g.closePath(); g.fillStyle = col === 'red' ? '#b3202c' : col === 'black' ? '#141518' : '#1d8a4c'; g.fill(); g.strokeStyle = GOLD; g.lineWidth = 3; g.stroke();
      g.save(); g.translate(c + Math.cos((a0 + a1) / 2) * 428, c + Math.sin((a0 + a1) / 2) * 428); g.rotate((a0 + a1) / 2 + Math.PI / 2); g.fillStyle = '#fff'; g.font = `700 38px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 0, 0); g.restore();
    });
    g.beginPath(); g.arc(c, c, 384, 0, TAU); g.strokeStyle = GOLD; g.lineWidth = 4; g.stroke();
    const gr = g.createRadialGradient(c, c, 20, c, c, 300); gr.addColorStop(0, '#e9c98a'); gr.addColorStop(0.25, '#8a5a2c'); gr.addColorStop(1, '#4a2c16'); g.beginPath(); g.arc(c, c, 300, 0, TAU); g.fillStyle = gr; g.fill(); g.strokeStyle = GOLD; g.lineWidth = 5; g.stroke();
    for (let k = 0; k < 4; k++) { g.save(); g.translate(c, c); g.rotate(k * Math.PI / 2); g.fillStyle = GOLD; g.fillRect(-7, -210, 14, 420); g.restore(); }
    g.beginPath(); g.arc(c, c, 62, 0, TAU); g.fillStyle = GOLD2; g.fill(); g.strokeStyle = '#8a6a2c'; g.lineWidth = 4; g.stroke();
  }, { aniso: 16 });
}
/** Craps layout: w × d metres (u ∈ ±w/2, v ∈ 0…d); pass-line band nearest the player, odds strip behind it, point boxes beyond. */
export const CR = { w: 0.98, d: 0.84, v0: 0.1, ppm: 700, passV: [0.04, 0.17], oddsV: [0.19, 0.28], textV: 0.325, pointV: [0.6, 0.8], boxW: 0.15, points: [4, 5, 6, 8, 9, 10] };
export function feltCraps() {
  const P = CR.ppm, W = Math.round(CR.w * P), H = Math.round(CR.d * P), X = (u) => (u + CR.w / 2) * P, Y = (v) => H - v * P;
  return tex(W, H, (g) => {
    feltBase(g, W, H, '#0d5c3f', '#0a4631');
    g.strokeStyle = GOLD2; g.lineWidth = 4; g.textAlign = 'center'; g.textBaseline = 'middle';
    const hw2 = 3 * CR.boxW;
    g.strokeRect(X(-hw2), Y(CR.passV[1]), 2 * hw2 * P, (CR.passV[1] - CR.passV[0]) * P); g.fillStyle = '#fff'; g.font = `700 56px ${SERIF}`; g.fillText('PASS  LINE', X(0), Y((CR.passV[0] + CR.passV[1]) / 2));
    g.setLineDash([10, 8]); g.lineWidth = 2; g.strokeRect(X(-hw2), Y(CR.oddsV[1]), 2 * hw2 * P, (CR.oddsV[1] - CR.oddsV[0]) * P); g.setLineDash([]); g.fillStyle = GOLD2; g.font = `600 24px ${SANS}`; g.fillText('ODDS  ·  2:1 on 4/10   3:2 on 5/9   6:5 on 6/8', X(0), Y((CR.oddsV[0] + CR.oddsV[1]) / 2));
    g.lineWidth = 4; CR.points.forEach((p, i) => { const u0 = -hw2 + i * CR.boxW; g.strokeRect(X(u0), Y(CR.pointV[1]), CR.boxW * P, (CR.pointV[1] - CR.pointV[0]) * P); g.fillStyle = GOLD2; g.font = `700 ${p === 9 ? 40 : 56}px ${SERIF}`; g.fillText(p === 6 ? 'SIX' : p === 9 ? 'NINE' : String(p), X(u0 + CR.boxW / 2), Y((CR.pointV[0] + CR.pointV[1]) / 2)); });
    g.fillStyle = 'rgba(233,226,207,0.8)'; g.font = `500 22px ${SANS}`; g.fillText('COME-OUT: 7 · 11 WIN — 2 · 3 · 12 LOSE', X(0), Y(CR.textV));
  });
}
/** Dice faces 1…6 in a strip. */
export function diceTex() {
  return tex(384, 64, (g) => {
    const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    for (let f = 1; f <= 6; f++) { const x = (f - 1) * 64; g.fillStyle = '#b3202c'; g.fillRect(x, 0, 64, 64); g.fillStyle = '#fff'; for (const [a, b] of pips[f]) { g.beginPath(); g.arc(x + 32 + a * 17, 32 + b * 17, 6.5, 0, TAU); g.fill(); } }
  });
}

// ------------------------------------------------------------------ slot symbols (128 px canvases, original drawings)
function sym(draw) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.translate(64, 64); draw(g); return c; }
const poly = (g, pts, fill, stroke, lw = 3) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); } };
let SYMS = null;
export function slotSymbols() {
  if (SYMS) return SYMS;
  const grad = (g, a, b, y0 = -50, y1 = 50) => { const r = g.createLinearGradient(0, y0, 0, y1); r.addColorStop(0, a); r.addColorStop(1, b); return r; };
  SYMS = {
    B: sym(g => { g.beginPath(); g.arc(0, 0, 56, 0, TAU); g.fillStyle = grad(g, '#1b2f57', '#0c1730'); g.fill(); g.strokeStyle = GOLD2; g.lineWidth = 5; g.stroke(); birdPath(g, 0, -6, 92); g.fillStyle = GOLD2; g.font = `700 20px ${SANS}`; g.textAlign = 'center'; g.fillText('WILD', 0, 44); }),
    Y: sym(g => { poly(g, [[-52, 14], [50, 14], [34, 36], [-40, 36]], grad(g, '#f6f3ec', '#cfd3d8', 14, 36), '#1b2742'); poly(g, [[-26, 14], [-18, -8], [24, -8], [34, 14]], '#f6f3ec', '#1b2742'); poly(g, [[-8, -8], [-2, -26], [14, -26], [18, -8]], '#f6f3ec', '#1b2742'); g.fillStyle = '#1b2742'; g.fillRect(-14, -1, 34, 6); g.fillStyle = GOLD; g.fillRect(-46, 22, 88, 4); g.strokeStyle = '#3f8fc0'; g.lineWidth = 4; g.beginPath(); for (let x = -54; x <= 54; x += 18) { g.moveTo(x, 46); g.quadraticCurveTo(x + 4.5, 40, x + 9, 46); g.quadraticCurveTo(x + 13.5, 52, x + 18, 46); } g.stroke(); }),
    D: sym(g => { poly(g, [[-46, -12], [-24, -40], [24, -40], [46, -12], [0, 48]], grad(g, '#bfe9ff', '#3aa0e0'), '#eaf7ff', 4); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-46, -12); g.lineTo(46, -12); g.moveTo(-24, -40); g.lineTo(-14, -12); g.lineTo(0, 48); g.lineTo(14, -12); g.lineTo(24, -40); g.moveTo(-14, -12); g.lineTo(0, -40); g.lineTo(14, -12); g.stroke(); }),
    G: sym(g => { g.save(); g.rotate(-0.12); poly(g, [[-16, -46], [16, -46], [10, 4], [-10, 4]], 'rgba(255,240,190,0.35)', '#f6e9c4', 3); poly(g, [[-13, -28], [13, -28], [9, 2], [-9, 2]], grad(g, '#f6dd8a', '#e0a93a', -28, 2)); g.fillStyle = '#f6e9c4'; g.fillRect(-2.5, 4, 5, 34); g.fillRect(-16, 38, 32, 5); g.fillStyle = '#fff'; for (const [x, y, r] of [[-4, -20, 2.5], [5, -12, 2], [-2, -6, 1.8], [3, -36, 2.2], [-7, -52, 2.5], [8, -56, 2]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } g.restore(); }),
    A: sym(g => { g.strokeStyle = '#cfd6de'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -30); g.lineTo(0, 44); g.moveTo(-22, -12); g.lineTo(22, -12); g.stroke(); g.beginPath(); g.arc(0, 8, 38, 0.15, Math.PI - 0.15); g.stroke(); g.beginPath(); g.arc(0, -40, 10, 0, TAU); g.lineWidth = 7; g.stroke(); poly(g, [[-46, 12], [-30, 8], [-38, 26]], '#cfd6de'); poly(g, [[46, 12], [30, 8], [38, 26]], '#cfd6de'); }),
    O: sym(g => { g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fillStyle = grad(g, '#f5ecd6', '#d9c79c'); g.fill(); g.strokeStyle = GOLD; g.lineWidth = 7; g.stroke(); poly(g, [[0, -40], [10, 0], [0, 40], [-10, 0]], '#b3202c'); poly(g, [[0, 0], [10, 0], [0, 40], [-10, 0]], '#1b2742'); poly(g, [[-40, 0], [0, -8], [40, 0], [0, 8]], 'rgba(27,39,66,0.35)'); g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fillStyle = GOLD; g.fill(); }),
    W: sym(g => { g.beginPath(); g.arc(0, 0, 54, 0, TAU); g.fillStyle = grad(g, '#7fd0f0', '#1f6fa8'); g.fill(); g.save(); g.clip(); g.fillStyle = '#f6c65a'; g.beginPath(); g.arc(18, -22, 14, 0, TAU); g.fill(); for (const [y, c] of [[2, '#2f86b8'], [20, '#1d6a9a'], [38, '#134f78']]) { g.fillStyle = c; g.beginPath(); g.moveTo(-60, 60); g.lineTo(-60, y); for (let x = -60; x <= 60; x += 24) g.bezierCurveTo(x + 6, y - 10, x + 18, y + 10, x + 24, y); g.lineTo(60, 60); g.closePath(); g.fill(); } g.restore(); }),
    H: sym(g => { g.fillStyle = grad(g, '#ffd9c2', '#e89a78'); g.beginPath(); g.moveTo(0, 42); for (let i = 0; i <= 8; i++) { const a = Math.PI + i / 8 * Math.PI, r = 50; g.lineTo(Math.cos(a) * r, 30 + Math.sin(a) * r * 1.3 + (i % 2 ? 0 : 6)); } g.closePath(); g.fill(); g.strokeStyle = '#b8684a'; g.lineWidth = 3; for (let i = 1; i < 8; i++) { const a = Math.PI + i / 8 * Math.PI; g.beginPath(); g.moveTo(0, 40); g.lineTo(Math.cos(a) * 46, 30 + Math.sin(a) * 60); g.stroke(); } poly(g, [[-14, 40], [14, 40], [10, 52], [-10, 52]], '#e89a78', '#b8684a'); }),
    S: sym(g => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 52; p.push([Math.cos(a) * r, Math.sin(a) * r]); } poly(g, p, grad(g, '#ffe9a6', '#e0a93a'), '#fff3cf', 4); }),
    K: sym(g => { g.beginPath(); g.arc(0, 0, 56, 0, TAU); g.fillStyle = grad(g, '#5a1420', '#2e0a12'); g.fill(); g.strokeStyle = GOLD2; g.lineWidth = 5; g.stroke(); g.save(); g.rotate(-0.6); g.strokeStyle = grad(g, '#ffe9a6', '#d2a95a'); g.lineWidth = 9; g.beginPath(); g.arc(-22, 0, 15, 0, TAU); g.stroke(); g.fillStyle = grad(g, '#ffe9a6', '#d2a95a'); g.fillRect(-8, -5, 48, 10); g.fillRect(22, 2, 8, 16); g.fillRect(34, 2, 7, 12); g.restore(); }),
  };
  return SYMS;
}

// ------------------------------------------------------------------ carpet, panels, signs
export function carpetTex() {
  return tex(512, 512, (g, w) => {
    g.fillStyle = '#4a0f1c'; g.fillRect(0, 0, w, w);
    let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,40,50' : '20,4,8'},${0.05 + r() * 0.06})`; g.fillRect(r() * w, r() * w, 2, 2); }
    const motif = (cx, cy) => {
      g.save(); g.translate(cx, cy);
      g.strokeStyle = '#c9a45c'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, -112); g.lineTo(112, 0); g.lineTo(0, 112); g.lineTo(-112, 0); g.closePath(); g.stroke();
      g.strokeStyle = 'rgba(201,164,92,0.55)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -92); g.lineTo(92, 0); g.lineTo(0, 92); g.lineTo(-92, 0); g.closePath(); g.stroke();
      for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.fillStyle = '#7a1f30'; g.beginPath(); g.moveTo(0, -18); g.bezierCurveTo(30, -44, 30, -78, 0, -64); g.bezierCurveTo(-30, -78, -30, -44, 0, -18); g.fill(); g.strokeStyle = '#c9a45c'; g.lineWidth = 2; g.stroke(); }
      g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fillStyle = '#c9a45c'; g.fill();
      g.restore();
    };
    motif(128, 128); motif(384, 384); motif(384, 128 - 256); motif(128, 384 + 256); motif(-128, 384); motif(640, 128);
    g.fillStyle = '#1d3a5e'; for (const [x, y] of [[0, 0], [256, 256], [512, 0], [0, 512], [512, 512], [256, 0 - 0], [0, 256], [512, 256], [256, 512]]) { g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + 20, y); g.lineTo(x, y + 20); g.lineTo(x - 20, y); g.closePath(); g.fill(); g.strokeStyle = '#c9a45c'; g.lineWidth = 2; g.stroke(); }
  }, { repeat: [1 / 2.4, 1 / 2.4] });
}
/** One sign atlas. items: [{ key, text, sub?, w, h (px), style }] → { tex, uv: { key: [u0, v0, u1, v1] } } */
export function signAtlas(items, dir = 'ltr') {
  const W = 1024, H = 1024, uv = {}, ys = [0, 0], X1 = 604;      // wide boards in the left column, table names (≤ 420 px) in the right
  const t = tex(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    for (const it of items) {
      const w = it.w, h = it.h, col = w <= W - X1 ? 1 : 0, x = col ? X1 : 0, y = ys[col]; uv[it.key] = [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];
      if (y + h > H) console.warn('[casino] sign atlas is full', it.key);
      g.save(); g.translate(x, y);
      rr(g, 3, 3, w - 6, h - 6, 10); g.fillStyle = it.style === 'light' ? '#f4efe2' : '#0f1014'; g.fill(); g.strokeStyle = GOLD; g.lineWidth = 4; g.stroke();
      g.fillStyle = it.style === 'light' ? '#14161a' : GOLD2; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = dir;
      if (it.lines) { const fs = it.fs || 26; g.font = `${it.weight || 600} ${fs}px ${SANS}`; const lh = fs * 1.32, y0 = h / 2 - (it.lines.length - 1) * lh / 2; it.lines.forEach((ln, i) => { g.font = `${i === 0 && it.head ? 700 : 500} ${i === 0 && it.head ? fs * 1.25 : fs}px ${i === 0 && it.head ? SERIF : SANS}`; g.fillStyle = i === 0 && it.head ? (it.style === 'light' ? '#7a5a1c' : GOLD2) : (it.style === 'light' ? '#14161a' : '#efe5cf'); g.fillText(ln, w / 2, y0 + i * lh, w - 36); }); }
      else { g.font = `600 ${it.fs || Math.round(h * 0.5)}px ${SERIF}`; let x = 0; const sp = it.sp ?? 0; if (sp) { const ws = [...it.text].map(c => g.measureText(c).width), tot = ws.reduce((a, b) => a + b, 0) + sp * (it.text.length - 1); x = (w - tot) / 2; [...it.text].forEach((c, i) => { g.fillText(c, x + ws[i] / 2, h / 2 + 3); x += ws[i] + sp; }); } else g.fillText(it.text, w / 2, h / 2 + 3, w - 30); }
      g.restore(); ys[col] += h + 4;
    }
  }, { aniso: 16 });
  return { tex: t, uv };
}
/** Wrap text to lines of at most `max` characters (words kept whole). */
export function wrap(text, max) { const out = []; let cur = ''; for (const w of String(text).split(/\s+/)) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; }
