// VILNYI Lifestyle casino — the room: a grand salon in the bow section of the lower deck (forward of the guest cabins,
// entered from the end of the cabin corridor). Patterned carpet, walnut and brass, coffered ceiling with chandeliers
// (emissive only — no lights are added to the scene), a cashier cage, a bar corner, and the tables: three blackjack,
// two roulette, baccarat, Casino Hold'em, craps, six slot machines and four video-poker terminals — each with its dealer.
// Loaded lazily by the 'casino' zone of yacht-rooms.js. Coordinates are yacht-local; y is relative to the deck in ctx
// helpers and absolute in the GeoB builders (c.y added).
import * as THREE from 'three';
import { GeoB, UBOX } from '../yacht-kit.js?v=3.11';
import { YACHT_I18N } from '../yacht-i18n.js?v=3.11';
import * as ART from './art.js?v=3.11';
import { chipMaterial, chipMesh, CHIP_T } from './batches.js?v=3.11';
import { CT, LANGS } from './i18n.js?v=3.11';
import { attachPlay } from './play.js?v=3.11';

import { X0, X1, H, TOP, hw, WALL_A, STATIONS, CASHIER, D_OUT, BJ_BOX, BAC_AREA, HLD, RL_TABLE, CR_TABLE, MACHINE } from './layout.js?v=3.11';      // (the felts are drawn from these positions)
const HALF = Math.PI / 2;

// yacht.t() (YT) strings the shared code asks for: roles and greetings of the casino's people
for (const l of LANGS) if (YACHT_I18N[l]) Object.assign(YACHT_I18N[l], { dealer: CT(l, 'dealer'), cashierRole: CT(l, 'cashier'), sayDealer: CT(l, 'sayDealer'), sayCashier: CT(l, 'sayCashier') });


// ------------------------------------------------------------------ materials (the casino's own, style independent)
let MATS = null, MATS_LANG = null;
function mats(lang, dir) {
  if (MATS && MATS_LANG === lang) return MATS;
  if (MATS) { MATS.signs.map.dispose(); }
  const wood = ART.tex(256, 512, (g, w, h) => {
    g.fillStyle = '#3d2413'; g.fillRect(0, 0, w, h); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 260; i++) { const x = r() * w; g.strokeStyle = `rgba(${r() < 0.5 ? '90,56,30' : '24,12,6'},${0.12 + r() * 0.22})`; g.lineWidth = 0.6 + r() * 1.6; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 22, h * 0.33, x + (r() - 0.5) * 22, h * 0.66, x + (r() - 0.5) * 14, h); g.stroke(); }
  }, { repeat: [1.4, 0.7] });
  const silk = ART.tex(256, 256, (g, w) => {
    g.fillStyle = '#4a0f1c'; g.fillRect(0, 0, w, w); g.strokeStyle = 'rgba(210,169,90,0.34)'; g.lineWidth = 1.5;
    for (const [cx, cy] of [[64, 64], [192, 192], [192, -64], [64, 320], [-64, 192], [320, 64]]) { g.beginPath(); g.moveTo(cx, cy - 56); g.bezierCurveTo(cx + 44, cy - 30, cx + 44, cy + 30, cx, cy + 56); g.bezierCurveTo(cx - 44, cy + 30, cx - 44, cy - 30, cx, cy - 56); g.stroke(); g.beginPath(); g.arc(cx, cy, 10, 0, 6.283); g.stroke(); }
  }, { repeat: [1.6, 1.6] });
  const coffer = ART.tex(512, 512, (g, w) => {
    g.fillStyle = '#3d2413'; g.fillRect(0, 0, w, w);
    const gr = g.createRadialGradient(256, 256, 20, 256, 256, 300); gr.addColorStop(0, '#ffe7b0'); gr.addColorStop(0.35, '#d9b46a'); gr.addColorStop(0.8, '#8f6a2e'); gr.addColorStop(1, '#5e431c'); g.fillStyle = gr; g.fillRect(34, 34, 444, 444);
    g.strokeStyle = '#f0d79a'; g.lineWidth = 5; g.strokeRect(34, 34, 444, 444); g.strokeStyle = 'rgba(60,36,14,0.8)'; g.lineWidth = 8; g.strokeRect(62, 62, 388, 388); g.strokeStyle = '#f0d79a'; g.lineWidth = 2.5; g.strokeRect(74, 74, 364, 364);
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; g.strokeStyle = 'rgba(255,240,200,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(256 + Math.cos(a) * 46, 256 + Math.sin(a) * 46); g.lineTo(256 + Math.cos(a) * 150, 256 + Math.sin(a) * 150); g.stroke(); }
    g.beginPath(); g.arc(256, 256, 150, 0, 6.283); g.strokeStyle = '#f0d79a'; g.lineWidth = 4; g.stroke(); g.beginPath(); g.arc(256, 256, 44, 0, 6.283); g.fillStyle = '#fff2cf'; g.fill();
  }, { repeat: [1 / 2.4, 1 / 2.4] });
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    carpet: std({ map: ART.carpetTex(), roughness: 0.95, metalness: 0 }),
    walnut: std({ map: wood, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide }),
    silk: std({ map: silk, roughness: 0.8, side: THREE.DoubleSide, emissive: '#3a0c16', emissiveIntensity: 0.25 }),
    brass: std({ color: '#d2a95a', roughness: 0.25, metalness: 1, envMapIntensity: 1.3, side: THREE.DoubleSide }),
    cream: std({ color: '#efe7d6', roughness: 0.9, emissive: '#ffe6bd', emissiveIntensity: 0.22, side: THREE.DoubleSide }),
    coffer: std({ map: coffer, emissiveMap: coffer, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
    crystal: new THREE.MeshBasicMaterial({ color: '#fff0cc' }),
    cove: new THREE.MeshBasicMaterial({ color: '#ffd9a0' }),
    leather: std({ color: '#4a1218', roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide }),
    black: std({ color: '#0e0f13', roughness: 0.25, metalness: 0.3, envMapIntensity: 1.1, side: THREE.DoubleSide }),
    marble: std({ color: '#e9e4d8', roughness: 0.18, metalness: 0.05, envMapIntensity: 1.0 }),
    felt: std({ color: '#0d5c3f', roughness: 0.95 }),
    feltBJ: std({ map: ART.feltBlackjack(BJ_BOX), roughness: 0.95 }),
    feltBac: std({ map: ART.feltBaccarat(BAC_AREA), roughness: 0.95 }),
    feltHld: std({ map: ART.feltHoldem(HLD, HLD.boardV, HLD.dealerV, HLD.playerV), roughness: 0.95 }),
    feltRl: std({ map: ART.feltRoulette(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    feltCr: std({ map: ART.feltCraps(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    chips: chipMaterial(ART.chipAtlas()),
    bottleA: std({ color: '#7a4a1e', roughness: 0.15, metalness: 0.2, emissive: '#3a1c06', emissiveIntensity: 0.5 }),
    bottleB: std({ color: '#2d5a3a', roughness: 0.15, metalness: 0.2, emissive: '#0c2a16', emissiveIntensity: 0.5 }),
    mirror: std({ color: '#b9c2c8', roughness: 0.04, metalness: 1, envMapIntensity: 1.4 }),
  };
  // tone-mapped false keeps the lights warm white instead of grey
  M.crystal.toneMapped = false; M.cove.toneMapped = false;
  // signs (the notice is in the site's language)
  const sg = ART.signAtlas([
    { key: 'casino', text: 'CASINO', w: 600, h: 130, fs: 88, sp: 20 },
    { key: 'cashier', text: CT(lang, 'cashier').toUpperCase(), w: 600, h: 110, fs: 66 },
    { key: 'notice', lines: [CT(lang, 'cashier'), ...ART.wrap(CT(lang, 'notice'), 26)], head: true, w: 600, h: 270, fs: 38, style: 'light' },
    { key: 'bj', text: 'BLACKJACK', w: 420, h: 76, fs: 46 }, { key: 'roulette', text: 'ROULETTE', w: 420, h: 76, fs: 46 }, { key: 'baccarat', text: 'BACCARAT', w: 420, h: 76, fs: 46 },
    { key: 'holdem', text: "CASINO HOLD'EM", w: 420, h: 76, fs: 40 }, { key: 'craps', text: 'CRAPS', w: 420, h: 76, fs: 46 },
    { key: 'slots', text: 'VILNYI RIVIERA', w: 420, h: 76, fs: 42 }, { key: 'vpoker', text: 'JACKS OR BETTER', w: 420, h: 76, fs: 38 },
  ], dir);
  M.signs = new THREE.MeshBasicMaterial({ map: sg.tex }); M.signs.toneMapped = false; M.signUV = sg.uv;
  // machine screens when nobody plays: an attract picture each
  const sy = ART.slotSymbols();
  M.scrSlots = new THREE.MeshBasicMaterial({ map: ART.tex(512, 512, (g) => { g.fillStyle = '#0a1226'; g.fillRect(0, 0, 512, 512); const rows = ['YKDWB', 'BYYYS', 'GHOAD']; rows.forEach((row, r) => [...row].forEach((k, i) => { g.fillStyle = (i + r) % 2 ? '#101c3a' : '#0c1630'; g.fillRect(6 + i * 100, 66 + r * 128, 98, 126); g.drawImage(sy[k], 6 + i * 100 + 1, 66 + r * 128 + 15, 96, 96); })); g.fillStyle = '#f0d79a'; g.font = '700 34px Georgia,serif'; g.textAlign = 'center'; g.fillText('VILNYI RIVIERA', 256, 44); g.font = '600 20px system-ui,sans-serif'; g.fillText('PLAY CHIPS ONLY  ·  20 LINES', 256, 488); }) });
  M.scrVP = new THREE.MeshBasicMaterial({ map: ART.tex(512, 410, (g) => { g.fillStyle = '#0b1f4a'; g.fillRect(0, 0, 512, 410); g.fillStyle = '#f0d79a'; g.font = '700 30px Georgia,serif'; g.textAlign = 'center'; g.fillText('JACKS OR BETTER  9 / 6', 256, 44); const ca = ART.cardAtlas().image, c = ART.CARD; [9, 10, 11, 12, 0].forEach((r, i) => g.drawImage(ca, r * c.cw, 0, c.cw, c.ch, 16 + i * 98, 210, 90, 125)); g.font = '600 20px system-ui,sans-serif'; g.fillStyle = '#ffe9a6'; g.fillText('ROYAL FLUSH  4000', 256, 110); g.fillStyle = '#cfe0ff'; g.fillText('PLAY CHIPS ONLY', 256, 384); }) });
  M.scrSlots.toneMapped = false; M.scrVP.toneMapped = false;
  for (const [k, m] of Object.entries(M)) if (m && m.isMaterial) m.name = (['feltBJ', 'feltBac', 'feltHld', 'feltRl', 'feltCr', 'signs', 'scrSlots', 'scrVP'].includes(k) ? 'y-keep-casino-' : 'casino.') + k;
  M.chips.name = 'y-keep-chips';
  MATS = M; MATS_LANG = lang; return M;
}

// ------------------------------------------------------------------ builders
/** D-shaped card table for station s with the felt material key. */
function dTable(b, s, y, feltKey) {
  const T = y + TOP, W = (u, v, h = 0) => { const [x, z] = s.P(u, v); return [x, T + h, z]; };
  const n = D_OUT.length, c = [0, 0.5];
  // felt (own UVs): fan round the middle
  for (let i = 0; i < n; i++) {
    const a = D_OUT[i], d = D_OUT[(i + 1) % n], uv = (p) => [(p[0] + 1.15) / 2.3, 1 - p[1] / 1.25];
    b.tri(feltKey, W(c[0], c[1]), W(d[0], d[1]), W(a[0], a[1]), uv(c), uv(d), uv(a));
  }
  // padded rail round the arc, skirt below it, the dealer's straight edge
  const out = (p, k) => [p[0] * k, 0.1 + (p[1] - 0.1) * k];
  for (let i = 2; i < n - 1; i++) {
    const a = D_OUT[i], d = D_OUT[i + 1], ao = out(a, 1.075), dn = out(d, 1.075), ai = out(a, 0.985), di = out(d, 0.985);
    b.quad('leather', W(ai[0], ai[1], 0.034), W(di[0], di[1], 0.034), W(dn[0], dn[1], 0.03), W(ao[0], ao[1], 0.03));
    b.quad('leather', W(ai[0], ai[1], 0), W(di[0], di[1], 0), W(di[0], di[1], 0.034), W(ai[0], ai[1], 0.034));
    b.quad('leather', W(ao[0], ao[1], 0.03), W(dn[0], dn[1], 0.03), W(dn[0], dn[1], -0.07), W(ao[0], ao[1], -0.07));
    b.quad('walnut', W(ao[0], ao[1], -0.07), W(dn[0], dn[1], -0.07), W(d[0] * 0.98, 0.1 + (d[1] - 0.1) * 0.98, -0.2), W(a[0] * 0.98, 0.1 + (a[1] - 0.1) * 0.98, -0.2));
  }
  b.quad('walnut', W(-1.236, 0.1, 0.03), W(-1.236, 0, 0.03), W(-1.236, 0, -0.2), W(-1.236, 0.1, -0.2)); b.quad('walnut', W(1.236, 0, 0.03), W(1.236, 0.1, 0.03), W(1.236, 0.1, -0.2), W(1.236, 0, -0.2));
  b.quad('walnut', W(-1.236, 0, 0.03), W(1.236, 0, 0.03), W(1.236, 0, -0.2), W(-1.236, 0, -0.2));
  b.quad('brass', W(-1.236, -0.012, 0.03), W(1.236, -0.012, 0.03), W(1.236, 0.012, 0.032), W(-1.236, 0.012, 0.032));
  // pedestals with brass feet
  const yaw = Math.atan2(s.U[1], s.U[0]) * -1;
  for (const u of [-0.62, 0.62]) { const [x, z] = s.P(u, 0.48); b.box('walnut', x, y + (TOP - 0.2) / 2, z, 0.5, TOP - 0.2, 0.42, yaw); b.box('brass', x, y + 0.03, z, 0.62, 0.06, 0.54, yaw); }
  // dealer's side: chip float, shoe, discard holder
  { const [x, z] = s.P(0, 0.085); b.box('black', x, T + 0.008, z, 0.74, 0.016, 0.13, yaw); }
  { const [x, z] = s.P(0.78, 0.2); b.box('black', x, T + 0.045, z, 0.13, 0.09, 0.24, yaw); const [x2, z2] = s.P(0.78, 0.33); b.box('brass', x2, T + 0.02, z2, 0.1, 0.04, 0.03, yaw); }
  { const [x, z] = s.P(-0.8, 0.2); b.box('black', x, T + 0.03, z, 0.12, 0.06, 0.16, yaw); }
}
/** Stool: leather seat on a brass column. */
function stool(b, x, y, z, h = 0.56) {
  const cyl = new THREE.CylinderGeometry(0.19, 0.19, 0.07, 18); b.geo('leather', cyl, new THREE.Matrix4().makeTranslation(x, y + h, z)); cyl.dispose();
  const col = new THREE.CylinderGeometry(0.03, 0.03, h - 0.04, 10); b.geo('brass', col, new THREE.Matrix4().makeTranslation(x, y + h / 2, z)); col.dispose();
  const base = new THREE.CylinderGeometry(0.2, 0.22, 0.03, 18); b.geo('brass', base, new THREE.Matrix4().makeTranslation(x, y + 0.015, z)); base.dispose();
}
function chandelier(b, x, yTop, z, R = 0.62) {
  const ring = (r, yy, t = 0.022) => { const g = new THREE.TorusGeometry(r, t, 8, 36); g.rotateX(HALF); b.geo('brass', g, new THREE.Matrix4().makeTranslation(x, yy, z)); g.dispose(); };
  b.box('brass', x, yTop - 0.02, z, 0.24, 0.04, 0.24); b.box('brass', x, yTop - 0.15, z, 0.03, 0.28, 0.03);
  ring(R, yTop - 0.28); ring(R * 0.62, yTop - 0.36); ring(R * 0.3, yTop - 0.44, 0.018);
  const drop = new THREE.CylinderGeometry(0.012, 0.004, 0.16, 5), cand = new THREE.CylinderGeometry(0.014, 0.014, 0.08, 6), bulb = new THREE.SphereGeometry(0.024, 8, 6);
  const N1 = Math.round(R * 30), N2 = Math.round(R * 18);
  for (let i = 0; i < N1; i++) { const a = i / N1 * 6.283; b.geo('crystal', drop, new THREE.Matrix4().makeTranslation(x + Math.cos(a) * R, yTop - 0.37, z + Math.sin(a) * R)); }
  for (let i = 0; i < N2; i++) { const a = i / N2 * 6.283 + 0.2; b.geo('crystal', drop, new THREE.Matrix4().makeTranslation(x + Math.cos(a) * R * 0.62, yTop - 0.45, z + Math.sin(a) * R * 0.62)); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; b.geo('crystal', drop, new THREE.Matrix4().makeTranslation(x + Math.cos(a) * R * 0.3, yTop - 0.53, z + Math.sin(a) * R * 0.3)); }
  const NC = Math.round(R * 16);
  for (let i = 0; i < NC; i++) { const a = i / NC * 6.283 + 0.1, px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R; b.geo('cream', cand, new THREE.Matrix4().makeTranslation(px, yTop - 0.225, pz)); b.geo('crystal', bulb, new THREE.Matrix4().makeTranslation(px, yTop - 0.165, pz)); }
  const core = new THREE.SphereGeometry(0.06, 10, 8); b.geo('crystal', core, new THREE.Matrix4().makeTranslation(x, yTop - 0.5, z)); core.dispose();
  drop.dispose(); cand.dispose(); bulb.dispose();
}
// a sign plane from the atlas: centre, width, facing yaw (0 = +z)
function sign(group, M, key, x, y, z, w, yaw) {
  const uv = M.signUV[key], asp = (uv[3] - uv[1]) / (uv[2] - uv[0]), g = new THREE.PlaneGeometry(w, w * asp), a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  const m = new THREE.Mesh(g, M.signs); m.position.set(x, y, z); m.rotation.y = yaw; group.add(m); return m;
}
// a table's name board hanging from the ceiling on two brass rods (readable from both sides)
function hangSign(c, b, M, key, x, y, z, w, yaw) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  sign(c.sg, M, key, x + sn * 0.012, y, z + cs * 0.012, w, yaw); sign(c.sg, M, key, x - sn * 0.012, y, z - cs * 0.012, w, yaw + Math.PI);
  b.box('black', x, y, z, w + 0.02, w * 0.19, 0.02, yaw);
  for (const k of [-1, 1]) b.box('brass', x + cs * k * w * 0.36, (y + w * 0.09 + c.y + H) / 2, z - sn * k * w * 0.36, 0.012, c.y + H - y - w * 0.09, 0.012);
}

/** The zone's build function (called by yacht.buildZone with a makeCtx context). */
export function buildCasino(c) {
  const { y, world, zone } = c, tag = zone.id, lang = c.yt.lang, M = mats(lang, c.yt.walk.dir === 'rtl' ? 'rtl' : 'ltr');
  const bs = new GeoB(), b = new GeoB();               // structure / contents
  const zl = (x) => -hw(x), zh = (x) => hw(x);
  // ---------------- shell: carpet, coffered ceiling, walls
  c.floor(M.carpet, X0, X1, zl, zh, 0.014);
  c.slab(M.coffer, X0, X1, zl, zh, H, -1);
  for (let x = 21.6; x <= X1; x += 2.4) bs.box('walnut', x, y + H - 0.07, 0, 0.16, 0.14, 2 * hw(x) - 0.04);      // on the coffer tile joints
  for (const z of [-4.8, -2.4, 0, 2.4, 4.8]) bs.box('walnut', (X0 + X1) / 2, y + H - 0.07, z, X1 - X0, 0.14, 0.16);
  for (const sd of [-1, 1]) {
    const a = [X0, sd * hw(X0)], e = [X1, sd * hw(X1)];
    bs.wall('walnut', a[0], a[1], e[0], e[1], y, y + 1.05); bs.wall('silk', a[0], a[1], e[0], e[1], y + 1.05, y + H - 0.16); bs.wall('walnut', a[0], a[1], e[0], e[1], y + H - 0.16, y + H);
    const L = Math.hypot(e[0] - a[0], e[1] - a[1]), ry = -sd * WALL_A * -1;
    bs.box('brass', (a[0] + e[0]) / 2, y + 1.07, (a[1] + e[1]) / 2 - sd * 0.012, L, 0.035, 0.03, sd * WALL_A); bs.box('cove', (a[0] + e[0]) / 2, y + H - 0.2, (a[1] + e[1]) / 2 - sd * 0.02, L, 0.02, 0.03, sd * WALL_A);
    void ry;
    for (let x = X0 + 1.2; x < X1 - 0.5; x += 2.4) {       // pilasters with a brass sconce each
      const z = sd * (hw(x) - 0.03);
      bs.box('walnut', x, y + H / 2, z, 0.3, H, 0.07, sd * WALL_A); bs.box('brass', x, y + 1.72, z - sd * 0.06, 0.07, 0.22, 0.05, sd * WALL_A); bs.box('crystal', x, y + 1.9, z - sd * 0.075, 0.06, 0.13, 0.06, sd * WALL_A);
    }
    world.seg(a[0], a[1], e[0], e[1], y, y + H, { tag });
  }
  // forward wall with a mirrored centre panel; aft wall with the entrance
  { const h1 = hw(X1); bs.wall('walnut', X1, -h1, X1, h1, y, y + 1.05); bs.wall('silk', X1, -h1, X1, h1, y + 1.05, y + H - 0.16); bs.wall('walnut', X1, -h1, X1, h1, y + H - 0.16, y + H);
    bs.box('brass', X1 - 0.012, y + 1.07, 0, 0.03, 0.035, 2 * h1); bs.box('mirror', X1 - 0.02, y + 1.75, 0, 0.012, 1.1, 3.2); bs.box('brass', X1 - 0.022, y + 1.75, 0, 0.01, 1.18, 3.28);
    world.seg(X1, -h1, X1, h1, y, y + H, { tag }); }
  { const h0 = hw(X0), dw = 0.9;
    for (const [za, zb] of [[-h0, -dw], [dw, h0]]) { bs.wall('walnut', X0, za, X0, zb, y, y + 1.05); bs.wall('silk', X0, za, X0, zb, y + 1.05, y + H - 0.16); bs.wall('walnut', X0, za, X0, zb, y + H - 0.16, y + H); world.seg(X0, za, X0, zb, y, y + H, { tag }); }
    bs.wall('walnut', X0, -dw, X0, dw, y + 2.2, y + H);
    for (const sd of [-1, 1]) bs.box('brass', X0 + 0.02, y + 1.1, sd * (dw + 0.04), 0.06, 2.2, 0.08);
    bs.box('brass', X0 + 0.02, y + 2.24, 0, 0.06, 0.08, 2 * dw + 0.16);
    // the short passage through the bulkhead between the corridor's end wall (x = 20) and the room
    for (const sd of [-1, 1]) { bs.wall('walnut', 20.14, sd * dw, X0, sd * dw, y, y + 2.2); world.seg(20.0, sd * (dw + 0.02), X0, sd * (dw + 0.02), y, y + H, { tag }); }
    bs.quad('walnut', [20.14, y + 2.2, -dw], [X0, y + 2.2, -dw], [X0, y + 2.2, dw], [20.14, y + 2.2, dw]);
  }
  // chandeliers along the middle, smaller ones over the wings
  for (const x of [24.0, 28.8, 33.6]) chandelier(bs, x, y + H - 0.14, 0, 0.66);                                        // under the beam crossings
  for (const x of [22.8, 27.6, 32.4, 37.2]) for (const z of [-3.6, 3.6]) chandelier(bs, x, y + H, z, 0.4);                // in the coffers over the wings
  chandelier(bs, 39.6, y + H, 1.2, 0.4); chandelier(bs, 39.6, y + H, -1.2, 0.4);

  // ---------------- tables
  const proxies = new Map();
  const tableProxy = (s, x0, x1, z0, z1, h = 0.5, y0 = 0.6) => proxies.set(s.id, c.proxy((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, Math.abs(x1 - x0), h, Math.abs(z1 - z0), () => c.yt.casino && c.yt.casino.sit(s.id), 'casino-' + s.id));
  const bbox = (s, pts) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [u, v] of pts) { const [x, z] = s.P(u, v); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, x1, z0, z1]; };
  const chipsStatic = [];
  const tray = (s) => { for (let i = 0; i < 10; i++) { const [x, z] = s.P(-0.3 + i * 0.066, 0.085); chipsStatic.push({ x, y: y + TOP + 0.016, z, chips: new Array(10 + (i * 7) % 5).fill(ART.CHIP_VALUES[i % 5]), seed: i }); } };
  for (const s of STATIONS) {
    if (s.game === 'bj' || s.game === 'baccarat' || s.game === 'holdem') {
      dTable(b, s, y, s.game === 'bj' ? 'feltBJ' : s.game === 'baccarat' ? 'feltBac' : 'feltHld');
      tray(s);
      const [x0, x1, z0, z1] = bbox(s, [[-1.24, 0], [1.24, 0], [-1.24, 1.34], [1.24, 1.34]]);
      c.solid(x0, x1, z0, z1, 1.0); tableProxy(s, x0, x1, z0, z1);
      // stools: the visitor's (middle) stays free; neighbours either side
      for (const u of [-0.8, 0, 0.8]) { const [sx, sz] = s.P(u, u ? 1.42 : 1.56); stool(b, sx, y, sz); }
      const [dx, dz] = s.P(0, -0.42);
      c.person({ id: 'dealer-' + s.id, role: 'dealer', look: s.dealer, x: dx, z: dz, yaw: 0, anim: 'bar', say: 'sayDealer' });
      const [gx, gz] = s.P(0, -0.12); hangSign(c, b, M, s.game, gx, y + 2.3, gz, 1.1, Math.atan2(-s.look[0], -s.look[1]));
      { const [lx, lz] = s.P(0, 0.5); c.light(lx, 2.2, lz, 0.9, '#ffe2b8', 6); }
    } else if (s.game === 'roulette') {
      const R = RL_TABLE, T = y + TOP, W = (u, v, h = 0) => { const [x, z] = s.P(u, v); return [x, T + h, z]; };
      b.quad('felt', W(R.u0, R.v0), W(R.u1, R.v0), W(R.u1, R.v1), W(R.u0, R.v1));
      // the betting layout (own UVs)
      { const uL = ART.RL.u0 - ART.RL.dozW - ART.RL.evW, vB = ART.RL.v0 - ART.RL.colH; b.quad('feltRl', W(uL, vB, 0.001), W(uL + ART.RL.w, vB, 0.001), W(uL + ART.RL.w, vB + ART.RL.h, 0.001), W(uL, vB + ART.RL.h, 0.001), [[0, 0], [1, 0], [1, 1], [0, 1]]); }
      // rail and body
      const edge = [[R.u0, R.v0], [R.u1, R.v0], [R.u1, R.v1], [R.u0, R.v1]];
      for (let i = 0; i < 4; i++) { const a = edge[i], d = edge[(i + 1) % 4], k = 0.07, ax = a[0] + Math.sign(a[0]) * k, av = a[1] + (a[1] > 1 ? k : -k), dx2 = d[0] + Math.sign(d[0]) * k, dv = d[1] + (d[1] > 1 ? k : -k);
        b.quad('leather', W(a[0], a[1], 0.03), W(d[0], d[1], 0.03), W(dx2, dv, 0.03), W(ax, av, 0.03)); b.quad('leather', W(a[0], a[1], 0), W(d[0], d[1], 0), W(d[0], d[1], 0.03), W(a[0], a[1], 0.03)); b.quad('walnut', W(ax, av, 0.03), W(dx2, dv, 0.03), W(dx2, dv, -0.24), W(ax, av, -0.24)); }
      const yawT = -Math.atan2(s.U[1], s.U[0]);
      for (const v of [0.5, 2.2]) { const [x, z] = s.P(0, v); b.box('walnut', x, y + (TOP - 0.24) / 2, z, 0.8, TOP - 0.24, 0.5, yawT); b.box('brass', x, y + 0.03, z, 0.92, 0.06, 0.62, yawT); }
      // wheel bowl (the rotor and the ball are live objects added by play.js)
      { const [wx, wz] = s.P(R.wheel[0], R.wheel[1]); const bowl = new THREE.CylinderGeometry(R.wheelR + 0.1, R.wheelR + 0.06, 0.1, 40, 1, true); b.geo('walnut', bowl, new THREE.Matrix4().makeTranslation(wx, T + 0.05, wz)); bowl.dispose();
        const rim = new THREE.TorusGeometry(R.wheelR + 0.09, 0.02, 8, 40); rim.rotateX(HALF); b.geo('brass', rim, new THREE.Matrix4().makeTranslation(wx, T + 0.1, wz)); rim.dispose();
        const track = new THREE.RingGeometry(R.wheelR - 0.005, R.wheelR + 0.09, 40); track.rotateX(-HALF); b.geo('walnut', track, new THREE.Matrix4().makeTranslation(wx, T + 0.062, wz)); track.dispose(); }
      const [x0, x1, z0, z1] = bbox(s, [[R.u0 - 0.07, R.v0 - 0.07], [R.u1 + 0.07, R.v1 + 0.07]]);
      c.solid(x0, x1, z0, z1, 1.0); tableProxy(s, x0, x1, z0, z1);
      for (const v of [0.45, 1.15]) { const [sx, sz] = s.P(R.u0 - 0.36, v); stool(b, sx, y, sz); }
      const [dx, dz] = s.P(R.u1 + 0.45, 1.75); c.person({ id: 'dealer-' + s.id, role: 'dealer', look: s.dealer, x: dx, z: dz, yaw: 0, anim: 'bar', say: 'sayDealer' });
      const [gx, gz] = s.P(R.u1 + 0.2, 1.3); hangSign(c, b, M, 'roulette', gx, y + 2.3, gz, 1.1, Math.PI);
      { const [lx, lz] = s.P(0, 1.2); c.light(lx, 2.2, lz, 0.9, '#ffe2b8', 6); }
      for (let i = 0; i < 6; i++) { const [x, z] = s.P(R.u1 - 0.1, 1.0 + i * 0.07); chipsStatic.push({ x, y: T, z, chips: new Array(12).fill(ART.CHIP_VALUES[i % 5]), seed: i }); }
    } else if (s.game === 'craps') {
      const R = CR_TABLE, T = y + TOP, W = (u, v, h = 0) => { const [x, z] = s.P(u, v); return [x, T + h, z]; };
      b.quad('felt', W(R.u0, R.v0), W(R.u1, R.v0), W(R.u1, R.v1), W(R.u0, R.v1));
      b.quad('feltCr', W(-ART.CR.w / 2, ART.CR.v0, 0.001), W(ART.CR.w / 2, ART.CR.v0, 0.001), W(ART.CR.w / 2, ART.CR.v0 + ART.CR.d, 0.001), W(-ART.CR.w / 2, ART.CR.v0 + ART.CR.d, 0.001), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      // the tub: padded walls all round, lower on the player's side
      const wallQ = (a, d, h) => { const k = 0.1, o = (p) => [p[0] + Math.sign(p[0]) * k, p[1] + (p[1] > 0.5 ? k : -k)], ao = o(a), dn = o(d);
        b.quad('leather', W(a[0], a[1], 0), W(d[0], d[1], 0), W(d[0], d[1], h), W(a[0], a[1], h)); b.quad('leather', W(a[0], a[1], h), W(d[0], d[1], h), W(dn[0], dn[1], h), W(ao[0], ao[1], h)); b.quad('walnut', W(ao[0], ao[1], h), W(dn[0], dn[1], h), W(dn[0], dn[1], -0.26), W(ao[0], ao[1], -0.26)); };
      const E = [[R.u0, R.v0], [R.u1, R.v0], [R.u1, R.v1], [R.u0, R.v1]];
      wallQ(E[0], E[1], 0.1); wallQ(E[1], E[2], 0.22); wallQ(E[2], E[3], 0.22); wallQ(E[3], E[0], 0.22);
      const yawT = -Math.atan2(s.U[1], s.U[0]);
      for (const u of [-0.8, 0.8]) { const [x, z] = s.P(u, 0.62); b.box('walnut', x, y + (TOP - 0.26) / 2, z, 0.5, TOP - 0.26, 0.8, yawT); b.box('brass', x, y + 0.03, z, 0.62, 0.06, 0.92, yawT); }
      const [x0, x1, z0, z1] = bbox(s, [[R.u0 - 0.1, R.v0 - 0.1], [R.u1 + 0.1, R.v1 + 0.1]]);
      c.solid(x0, x1, z0, z1, 1.1); tableProxy(s, x0, x1, z0, z1, 0.6);
      const [dx, dz] = s.P(0, R.v1 + 0.5); c.person({ id: 'dealer-' + s.id, role: 'dealer', look: s.dealer, x: dx, z: dz, yaw: 0, anim: 'bar', say: 'sayDealer' });
      sign(c.sg, M, 'craps', X1 - 0.03, y + 2.42, 0, 1.1, -HALF);
      { const [lx, lz] = s.P(0, 0.6); c.light(lx, 2.2, lz, 0.9, '#ffe2b8', 6); }
      for (let i = 0; i < 5; i++) { const [x, z] = s.P(-0.5 + i * 0.07, R.v1 - 0.12); chipsStatic.push({ x, y: T, z, chips: new Array(10).fill(ART.CHIP_VALUES[i]), seed: i }); }
    } else {
      // slot machine / video-poker terminal: cabinet, screen, belly panel, topper
      const K = MACHINE[s.game], g = new THREE.Group(); g.position.set(s.O[0], y, s.O[1]); g.rotation.y = s.yaw; c.sg.add(g);
      const bx = (mat, w, h, d, px, py, pz) => { const o = new THREE.Mesh(UBOX, mat); o.scale.set(w, h, d); o.position.set(px, py, pz); g.add(o); return o; };
      bx(M.black, K.w, K.h, K.d, 0, K.h / 2, 0); bx(M.brass, K.w + 0.02, 0.05, K.d + 0.02, 0, 0.025, 0); bx(M.brass, K.w + 0.02, 0.03, K.d + 0.02, 0, K.h + 0.015, 0);
      for (const sx of [-1, 1]) bx(M.brass, 0.025, K.h - 0.1, 0.03, sx * (K.w / 2 - 0.012), K.h / 2, K.d / 2 + 0.004);
      bx(M.walnut, K.w - 0.06, 0.05, 0.2, 0, K.sy - K.sh / 2 - 0.1, K.d / 2 + 0.09); bx(M.brass, K.w - 0.1, 0.012, 0.16, 0, K.sy - K.sh / 2 - 0.07, K.d / 2 + 0.09);
      for (const dxb of [-0.16, -0.05, 0.06]) bx(M.cove, 0.07, 0.014, 0.05, dxb, K.sy - K.sh / 2 - 0.058, K.d / 2 + 0.1);
      bx(M.crystal, 0.1, 0.016, 0.06, 0.19, K.sy - K.sh / 2 - 0.057, K.d / 2 + 0.1);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(K.sw, K.sh), s.game === 'slots' ? M.scrSlots : M.scrVP); scr.position.set(0, K.sy, K.d / 2 + 0.006); g.add(scr);
      bx(M.brass, K.sw + 0.04, K.sh + 0.04, 0.008, 0, K.sy, K.d / 2 + 0.001);
      sign(g, M, s.game, 0, K.h - 0.14, K.d / 2 + 0.007, K.w - 0.08, 0);
      bx(M.cove, K.w - 0.1, 0.02, 0.01, 0, K.sy - K.sh / 2 - 0.3, K.d / 2 + 0.006);
      const fx = s.O[0] - s.look[0] * 0.75, fz = s.O[1] - s.look[1] * 0.75; stool(b, fx, y, fz, 0.6);
      c.solid(s.O[0] - 0.36, s.O[0] + 0.36, s.O[1] - 0.36, s.O[1] + 0.36, 1.9);
      if (!s.taken) proxies.set(s.id, c.proxy(s.O[0], 0.95, s.O[1], 0.7, 1.7, 0.75, () => c.yt.casino && c.yt.casino.sit(s.id), 'casino-' + s.id));
    }
  }
  { const [lx, lz] = [36.8, 4.2]; c.light(lx, 2.2, lz, 0.7, '#ffd9a0', 6); c.light(38.2, 2.2, -4.2, 0.7, '#cfe0ff', 6); }

  // ---------------- cashier cage (starboard aft): counter, brass grille, sign and the play-money notice
  { const K = CASHIER, cx = K.counterX;
    b.box('walnut', cx, y + 0.52, (K.z0 + K.z1) / 2, 0.5, 1.04, K.z1 - K.z0); b.box('marble', cx + 0.03, y + 1.06, (K.z0 + K.z1) / 2, 0.62, 0.04, K.z1 - K.z0 + 0.06);
    for (let z = K.z0 + 0.1; z <= K.z1 - 0.05; z += 0.14) if (Math.abs(z - K.z) > 0.42) b.box('brass', cx, y + 1.62, z, 0.018, 1.08, 0.018);
    b.box('brass', cx, y + 2.17, (K.z0 + K.z1) / 2, 0.06, 0.05, K.z1 - K.z0); b.box('brass', cx, y + 1.5, K.z, 0.03, 0.03, 0.86); for (const sd of [-1, 1]) b.box('brass', cx, y + 1.3, K.z + sd * 0.42, 0.03, 0.44, 0.03);
    b.wall('walnut', X0, K.z0 - 0.05, cx + 0.25, K.z0 - 0.05, y, y + H); world.seg(X0, K.z0 - 0.05, cx + 0.25, K.z0 - 0.05, y, y + H, { tag });
    b.box('walnut', cx, y + 2.45, (K.z0 + K.z1) / 2, 0.5, 0.5, K.z1 - K.z0); b.wall('walnut', cx + 0.25, K.z1, cx + 0.25, hw(cx), y, y + H);
    sign(c.sg, M, 'cashier', cx + 0.262, y + 2.44, (K.z0 + K.z1) / 2, 1.9, HALF);
    sign(c.sg, M, 'notice', cx + 0.262, y + 0.56, K.z, 2.1, HALF);
    c.solid(cx - 0.25, cx + 0.34, K.z0 - 0.05, hw(cx), 2.4);
    for (let i = 0; i < 8; i++) chipsStatic.push({ x: cx - 0.08, y: y + 1.08, z: K.z - 1.2 + i * 0.07 + (i > 3 ? 1.9 : 0), chips: new Array(14 - (i % 3) * 3).fill(ART.CHIP_VALUES[i % 5]), seed: i });
    c.person({ id: 'cashier', role: 'cashierRole', look: 'steward_w', x: K.x, z: K.z, yaw: 0, anim: 'bar', say: 'sayCashier' });
    proxies.set('cashier', c.proxy(cx + 0.1, 1.2, K.z, 0.7, 1.5, 1.4, () => c.yt.casino && c.yt.casino.cashier(), 'casino-cashier'));
    c.light(cx + 0.9, 2.2, K.z, 0.8, '#ffe2b8', 5);
  }
  // ---------------- bar corner (port aft)
  { const z0 = -6.9, z1 = -3.1, cx = 22.3;
    b.box('walnut', cx, y + 0.53, (z0 + z1) / 2, 0.55, 1.06, z1 - z0); b.box('marble', cx, y + 1.08, (z0 + z1) / 2, 0.7, 0.04, z1 - z0 + 0.1); b.box('brass', cx + 0.33, y + 0.2, (z0 + z1) / 2, 0.03, 0.03, z1 - z0 - 0.2); b.box('cove', cx + 0.285, y + 1.02, (z0 + z1) / 2, 0.012, 0.015, z1 - z0 - 0.1);
    b.box('walnut', X0 + 0.24, y + 0.48, (z0 + z1) / 2, 0.44, 0.96, z1 - z0); b.box('marble', X0 + 0.24, y + 0.98, (z0 + z1) / 2, 0.46, 0.03, z1 - z0); b.box('mirror', X0 + 0.03, y + 1.7, (z0 + z1) / 2, 0.012, 1.3, z1 - z0 - 0.1);
    const bot = new THREE.CylinderGeometry(0.018, 0.036, 0.28, 8);
    for (const sy of [1.3, 1.68, 2.06]) { b.box('brass', X0 + 0.14, y + sy, (z0 + z1) / 2, 0.2, 0.014, z1 - z0 - 0.2); b.box('cove', X0 + 0.05, y + sy + 0.012, (z0 + z1) / 2, 0.012, 0.012, z1 - z0 - 0.2); let i = 0; for (let z = z0 + 0.25; z < z1 - 0.2; z += 0.13, i++) if (i % 7 !== 5) b.geo(i % 2 ? 'bottleA' : 'bottleB', bot, new THREE.Matrix4().makeTranslation(X0 + 0.14, y + sy + 0.147, z)); }
    bot.dispose();
    for (let z = z0 + 0.5; z < z1 - 0.2; z += 0.85) stool(b, cx + 0.72, y, z, 0.74);
    c.solid(cx - 0.3, cx + 0.38, z0 - 0.3, z1 + 0.05, 1.2); c.solid(X0, X0 + 0.48, z0 - 0.3, z1, 2.3);
    c.person({ id: 'casino-bar', role: 'bartender', look: 'barwoman', x: 21.25, z: -5.0, yaw: 0, anim: 'bar', say: 'sayBar' });
    c.light(cx + 0.6, 2.2, -5, 0.8, '#ffd0a0', 5);
  }
  // brass posts with a rope either side of the entrance, two tall vases
  for (const sd of [-1, 1]) { for (const x of [21.0, 22.4]) { b.box('brass', x, y + 0.5, sd * 1.5, 0.05, 1.0, 0.05); b.box('brass', x, y + 0.02, sd * 1.5, 0.26, 0.04, 0.26); } b.box('leather', 21.7, y + 0.86, sd * 1.5, 1.4, 0.035, 0.035); c.solid(20.9, 22.5, sd * 1.5 - 0.06, sd * 1.5 + 0.06, 1.0); }
  sign(c.sg, M, 'casino', X0 + 0.012, y + 2.45, 0, 1.7, HALF);
  c.light(24.0, 2.3, 0, 1.0, '#ffe2b8', 7); c.light(28.8, 2.3, 0, 1.0, '#ffe2b8', 7); c.light(33.6, 2.3, 0, 0.9, '#ffe2b8', 7);

  // ---------------- guests in evening wear (adults; seated ones are drawn lower behind their table)
  const G = (look, x, z, o = {}) => c.person({ role: 'guest', look, x, z, yaw: 0, anim: o.seat ? 'bar' : 'chat', glass: !!o.glass, dy: o.seat ? -0.34 : 0, noTalk: !!o.seat });
  { const s = STATIONS[1]; G('w_party_a', ...s.P(-0.8, 1.44), { seat: true }); G('m_party_a', ...s.P(0.8, 1.44), { seat: true }); }
  { const s = STATIONS[4]; G('w_party_c', ...s.P(RL_TABLE.u0 - 0.38, 0.45), { seat: true }); G('m_party_b', ...s.P(RL_TABLE.u0 - 0.38, 1.15), { seat: true }); G('w_party_b', ...s.P(RL_TABLE.u0 - 0.75, 1.9), { glass: true }); }
  { const s = STATIONS[5]; G('singer', ...s.P(0.8, 1.44), { seat: true }); }
  { const s = STATIONS[7]; G('m_party_a', ...s.P(-1.7, 0.5), { glass: true }); G('w_party_a', ...s.P(1.75, 0.35)); }
  G('m_party_b', 23.35, -4.1, { glass: true }); G('w_party_b', 23.5, -5.0, { glass: true });
  G('w_party_c', ...((s) => [s.O[0] - s.look[0] * 0.76, s.O[1] - s.look[1] * 0.76])(STATIONS.find(q => q.id === 'slot2')), { seat: true });

  // ---------------- finish: static geometry into the staging groups (baked per material by the zone)
  const all = { ...M };
  for (const m of bs.build(all, 'casino-shell')) { m.matrixAutoUpdate = true; (c.sh || c.sg).add(m); }
  for (const m of b.build(all, 'casino')) { m.matrixAutoUpdate = true; c.sg.add(m); }
  const cs = chipMesh(chipsStatic, M.chips); cs.userData.keep = true; c.sg.add(cs);
  // the live part: cards, chips, wheels, dice, machine screens, HUD — and the tap targets' actions
  attachPlay(c, { M, STATIONS, proxies });
}
