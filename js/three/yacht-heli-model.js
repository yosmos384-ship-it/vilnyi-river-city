// VILNYI Lifestyle (concept experience) — the yacht's helicopter: an original executive design (no real type, maker or
// marking), gloss black with a gold cheat line and the VILNYI bird. Fuselage with a bubble nose and deep cabin windows,
// engine cowling, five-blade main rotor, shrouded tail rotor, skids, a sliding cabin door on the starboard side, a
// cabin with four cream leather seats, a cockpit with an instrument panel, and a painted pilot.
// Helicopter-local frame (the yacht's convention): +x = nose, +y = up (0 = under the skids), +z = starboard.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const sat = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;
export const HELI = {
  seat: [-0.62, 1.80, 0.50],         // the passenger's eye: rear starboard seat, by the door's deep window
  mast: [-0.35, 3.02, 0], rotorR: 5.3, tail: [-7.35, 2.32, 0], tailR: 0.44,
  door: { x0: -1.3, x1: 0.5, slide: 1.2 },
  bbox: { x0: -2.7, x1: 3.3, hw: 1.22 },
};

// ---- the fuselage as a loft: section at x → half width, bottom, top; a superellipse round it
function sect(x) {
  let w, yb, yt;
  if (x > 1.4) w = Math.pow(Math.max(0, 1 - Math.pow((x - 1.4) / 1.96, 2)), 0.46); else if (x < -1.5) w = 0.27 + 0.73 * (1 - sstep(-1.5, -2.7, x)); else w = 1;
  if (x > 0.9) yt = 1.18 + 1.02 * Math.pow(Math.max(0, 1 - Math.pow((x - 0.9) / 2.46, 2)), 0.6); else yt = 2.2 + 0.03 * sstep(-1.6, -2.7, x);
  if (x > 1.7) yb = 0.55 + 0.63 * (1 - Math.sqrt(Math.max(0, 1 - Math.pow((x - 1.7) / 1.66, 2)))); else if (x < -1.2) yb = 0.55 + 1.2 * sstep(-1.2, -2.7, x); else yb = 0.55;
  return { w: w * 1.0, yb, yt };
}
const EXP = 2 / 2.6;
function P(x, th, inset = 0) {
  const s = sect(x), yc = (s.yb + s.yt) / 2, hh = Math.max(0.01, (s.yt - s.yb) / 2 - inset), w = Math.max(0.01, s.w - inset), c = Math.cos(th), n = Math.sin(th);
  return [x, yc + hh * Math.sign(n) * Math.pow(Math.abs(n), EXP), w * Math.sign(c) * Math.pow(Math.abs(c), EXP)];
}
// which part of the skin is what (th in degrees: 0 = starboard waist, 90 = crown, 180 = port waist, 270 = keel)
const W0 = -30, W1 = 62;                                   // the deep side windows run from below the waist to the cantrail
function region(x, deg) {
  const starboard = deg < 90 || deg > 270, side = starboard ? (deg > 270 ? deg - 360 : deg) : 180 - deg;      // angle above the waist on either side
  if (x > 1.62 && x < 3.12 && side > -14) return 'glass';                             // bubble canopy over the nose
  if (side > W0 && side < W1) {
    if (x > HELI.door.x0 && x < HELI.door.x1) return starboard ? null : 'glass';      // (starboard: the sliding door's opening)
    if ((x > 0.62 && x < 1.5) || (x > -1.74 && x < -1.42)) return 'glass';
  }
  if (starboard && x > HELI.door.x0 && x < HELI.door.x1 && side > -58 && side <= W0) return null;                  // the door's lower panel
  if (side > -37 && side < -31 && x > -2.5 && x < 2.9) return 'gold';                 // cheat line
  return 'body';
}
function doorRegion(deg) { const side = deg > 270 ? deg - 360 : deg; return side > W0 && side < W1 ? 'glass' : side > -37 && side < -31 ? 'gold' : 'body'; }

// ---- a small builder: per material key, smooth where the surface is smooth
class MB {
  constructor() { this.b = new Map(); }
  g(k) { let b = this.b.get(k); if (!b) this.b.set(k, b = { p: [], n: [], c: [], u: [] }); return b; }
  vert(k, p, n, col, uv) { const b = this.g(k); b.p.push(p[0], p[1], p[2]); b.n.push(n[0], n[1], n[2]); if (col) b.c.push(col.r, col.g, col.b); else b.c.push(1, 1, 1); b.u.push(uv ? uv[0] : 0, uv ? uv[1] : 0); }
  geo(k, geo, m, col) {
    const s = geo.index ? geo.toNonIndexed() : geo, Pa = s.attributes.position, Na = s.attributes.normal, Ua = s.attributes.uv, v = new THREE.Vector3(), n = new THREE.Vector3(), nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    for (let i = 0; i < Pa.count; i++) { v.fromBufferAttribute(Pa, i); n.fromBufferAttribute(Na, i); if (m) { v.applyMatrix4(m); n.applyMatrix3(nm).normalize(); } this.vert(k, [v.x, v.y, v.z], [n.x, n.y, n.z], col, Ua ? [Ua.getX(i), Ua.getY(i)] : null); }
    if (s !== geo) s.dispose();
  }
  box(k, cx, cy, cz, sx, sy, sz, col, rx = 0, ry = 0, rz = 0, r = 0) {
    const g = r > 0 ? new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(r, sx / 2 - 1e-3, sy / 2 - 1e-3, sz / 2 - 1e-3)) : new THREE.BoxGeometry(sx, sy, sz);
    this.geo(k, g, new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1)), col); g.dispose();
  }
  cyl(k, a, b, r0, r1, col, seg = 12) {   // a tube from a to b
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B), g = new THREE.CylinderGeometry(r1, r0, L, seg);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    this.geo(k, g, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), col); g.dispose();
  }
  quad(k, a, b, c, d, col, uv) { const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a))).normalize().toArray();
    const U = uv || [[0, 0], [1, 0], [1, 1], [0, 1]]; for (const i of [0, 1, 2, 0, 2, 3]) this.vert(k, [a, b, c, d][i], n, col, U[i]); }
  build(mats, name) {
    const out = {};
    for (const [k, b] of this.b) {
      if (!b.p.length || !mats[k]) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      if (mats[k].vertexColors) g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, mats[k]); m.name = name + ':' + k; m.raycast = () => {}; if (mats[k].transparent) m.renderOrder = 3; out[k] = m;
    }
    return out;
  }
}
// loft a patch of the skin (x0 … x1, deg0 … deg1) with analytic smooth normals; keyOf(x, deg) → material key or null
function loft(mb, xs, d0, d1, dstep, keyOf, inset = 0, flip = false, col = null) {
  const N = (x, th) => { const e = 0.004, a = P(x - e, th, inset), b = P(x + e, th, inset), c = P(x, th - e, inset), d = P(x, th + e, inset);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map(q => q / l * (flip ? -1 : 1)); return n; };
  for (let i = 0; i < xs.length - 1; i++) for (let dg = d0; dg < d1 - 1e-6; dg += dstep) {
    const xa = xs[i], xb = xs[i + 1], da = dg, db = Math.min(d1, dg + dstep), key = keyOf((xa + xb) / 2, (((da + db) / 2) % 360 + 360) % 360); if (!key) continue;
    const ta = da * D2R, tb = db * D2R, q = [[xa, ta], [xb, ta], [xb, tb], [xa, tb]], idx = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const j of idx) mb.vert(key, P(q[j][0], q[j][1], inset), N(q[j][0], q[j][1]), col);
  }
}
const stations = (extra = []) => { const s = new Set([-2.7, 3.3, 3.33, 3.35, 3.36, ...extra]); for (let x = -2.6; x < 3.3; x += 0.2) s.add(+x.toFixed(2)); for (const x of [3.12, 3.22, 3.27, 1.62, 1.5, 0.62, 0.5, -1.3, -1.42, -1.74, 2.9, -2.5]) s.add(x); return [...s].sort((a, b) => a - b); };

function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
// the instrument panel's three screens: attitude, moving map, engine page (drawn once)
function panelTex() {
  return tex(512, 128, (g, w, h) => {
    g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
    // attitude
    g.save(); g.beginPath(); g.rect(8, 8, 150, 112); g.clip(); g.translate(83, 64); g.rotate(-0.06); g.fillStyle = '#2b6fb3'; g.fillRect(-120, -120, 240, 120); g.fillStyle = '#7a4f28'; g.fillRect(-120, 0, 240, 120);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-120, 0); g.lineTo(120, 0); g.stroke(); for (const y of [-30, -15, 15, 30]) { g.beginPath(); g.moveTo(-14, y); g.lineTo(14, y); g.stroke(); } g.restore();
    g.strokeStyle = '#ffd24a'; g.lineWidth = 3; g.beginPath(); g.moveTo(58, 64); g.lineTo(76, 64); g.moveTo(90, 64); g.lineTo(108, 64); g.stroke();
    g.fillStyle = '#0b0f14'; g.fillRect(8, 8, 22, 112); g.fillRect(136, 8, 22, 112); g.fillStyle = '#9fe3b0'; g.font = '10px sans-serif'; g.fillText('110', 10, 68); g.fillText('350', 138, 68);
    // map
    g.fillStyle = '#081622'; g.fillRect(180, 8, 150, 112); g.fillStyle = '#0d3550'; g.beginPath(); g.ellipse(232, 70, 46, 30, -0.5, 0, 6.283); g.fill();
    g.strokeStyle = '#c9a45c'; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.beginPath(); g.ellipse(282, 56, 30, 22, 0, 0, 6.283); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#f4f1ea'; g.fillRect(278, 52, 9, 5); g.fillRect(278, 60, 9, 5); g.fillStyle = '#c9a45c'; g.beginPath(); g.moveTo(246, 62); g.lineTo(252, 74); g.lineTo(240, 74); g.closePath(); g.fill();
    // engines
    g.fillStyle = '#0b0f14'; g.fillRect(352, 8, 152, 112);
    for (let i = 0; i < 4; i++) { const cx = 376 + i * 36; g.strokeStyle = '#2a3a48'; g.lineWidth = 5; g.beginPath(); g.arc(cx, 44, 13, 2.4, 7.0); g.stroke(); g.strokeStyle = i === 3 ? '#ffb347' : '#5fe08a'; g.beginPath(); g.arc(cx, 44, 13, 2.4, 2.4 + 3.4 * (0.62 + i * 0.07)); g.stroke(); }
    g.fillStyle = '#7fb4d6'; g.font = '9px sans-serif'; g.fillText('TQ      N1      N2     TOT', 364, 74); for (let i = 0; i < 5; i++) { g.fillStyle = '#16283a'; g.fillRect(362, 84 + i * 7, 132, 4); g.fillStyle = '#5fe08a'; g.fillRect(362, 84 + i * 7, 60 + ((i * 37) % 60), 4); }
  });
}
// rotor seen at speed: a faint smoked disc with a gold tip ring — the same all the way round, so that nothing flickers
// as it turns
function blurTex() {
  return tex(256, 256, (g, w) => {
    g.clearRect(0, 0, w, w); const c = w / 2;
    const gr = g.createRadialGradient(c, c, 6, c, c, c); gr.addColorStop(0, 'rgba(20,20,22,0.5)'); gr.addColorStop(0.12, 'rgba(24,24,28,0.26)'); gr.addColorStop(0.9, 'rgba(30,30,34,0.2)'); gr.addColorStop(0.955, 'rgba(210,170,90,0.42)'); gr.addColorStop(0.985, 'rgba(210,170,90,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, c, 0, 6.283); g.fill();
  });
}
// the pilot from behind (the passenger's view) and — over the people atlas' crew figure — from the front, with a headset
function pilotBackTex() {
  return tex(128, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f4f2ec'; g.beginPath(); g.moveTo(10, h); g.quadraticCurveTo(12, 96, 40, 90); g.lineTo(88, 90); g.quadraticCurveTo(116, 96, 118, h); g.closePath(); g.fill();      // shirt
    g.fillStyle = '#16233c'; g.fillRect(14, 96, 26, 7); g.fillRect(88, 96, 26, 7); g.fillStyle = '#c9a45c'; for (const x of [18, 24, 30, 92, 98, 104]) g.fillRect(x, 97, 3, 5);             // epaulettes
    g.fillStyle = '#c99872'; g.fillRect(52, 74, 24, 20);                                                                                    // neck
    g.fillStyle = '#2b2320'; g.beginPath(); g.ellipse(64, 48, 27, 31, 0, 0, 6.283); g.fill();                                              // hair
    g.fillStyle = '#c99872'; g.beginPath(); g.ellipse(36, 54, 5, 8, 0, 0, 6.283); g.ellipse(92, 54, 5, 8, 0, 0, 6.283); g.fill();
    g.strokeStyle = '#101216'; g.lineWidth = 7; g.beginPath(); g.arc(64, 46, 31, Math.PI * 1.02, Math.PI * 1.98); g.stroke();              // headset band and cups
    g.fillStyle = '#101216'; for (const x of [28, 100]) { g.beginPath(); g.ellipse(x, 54, 8, 13, 0, 0, 6.283); g.fill(); }
  });
}
function drawPilotFront(g, w, h, atlasCanvas, cell) {
  {
    g.clearRect(0, 0, w, h);
    if (atlasCanvas) { try { g.drawImage(atlasCanvas, cell[0] + 64, cell[1] + 10, 128, 160, 0, 0, 128, 160); } catch { /* */ } }
    else { g.fillStyle = '#f4f2ec'; g.fillRect(20, 92, 88, 70); g.fillStyle = '#c99872'; g.beginPath(); g.ellipse(64, 50, 22, 28, 0, 0, 6.283); g.fill(); }
    g.strokeStyle = '#101216'; g.lineWidth = 5; g.beginPath(); g.arc(64, 44, 25, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.fillStyle = '#101216'; for (const x of [39, 89]) { g.beginPath(); g.ellipse(x, 50, 6, 10, 0, 0, 6.283); g.fill(); }
    g.lineWidth = 2; g.beginPath(); g.moveTo(41, 58); g.quadraticCurveTo(44, 72, 58, 70); g.stroke();
  }
}

/**
 * Build the helicopter. shellM: the yacht's shell materials (hull black, gold, steel, dark, led, nav lights);
 * emblemMat: the bird decal's material. setPilot(canvas, [x, y]) paints the pilot's front view from a crew figure of the people atlas.
 * → { group, door, rotor, tailRotor, blades, disc, tailDisc, glass[], pilot, lights, proxy, setRpm(k), setDoor(k), setNight(n), dispose }
 */
export function buildHeli(shellM, emblemMat) {
  const group = new THREE.Group(); group.name = 'vrc-yacht-heli';
  const own = [];
  const C = (h) => new THREE.Color(h);
  const M = {
    body: shellM.hull, gold: shellM.gold, steel: shellM.steel, dark: shellM.dark,
    glass: new THREE.MeshPhysicalMaterial({ color: '#10181d', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.5, envMapIntensity: 1.5, side: THREE.DoubleSide, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, envMapIntensity: 0.55 }),
    screen: new THREE.MeshBasicMaterial({ map: panelTex(), toneMapped: false, side: THREE.DoubleSide }),
    blur: new THREE.MeshBasicMaterial({ map: blurTex(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    emblem: emblemMat,
    light: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  M.glass.name = 'heli.glass'; M.interior.name = 'heli.interior'; own.push(M.glass, M.interior, M.screen, M.blur, M.light);
  const LIN = C('#cfc4ae'), LEA = C('#efe6d3'), PIP = C('#b08d4c'), CARPET = C('#5b5046'), TRIM = C('#17181c'), WOOD = C('#5a3d28');
  const mb = new MB(), xs = stations();
  // ---- skin (outside) and lining (inside, 4 cm in), leaving out the starboard door's opening
  loft(mb, xs, -90, 270, 6, region);
  loft(mb, xs, -90, 270, 12, (x, d) => { const r = region(x, d); return r === 'glass' || r === null ? null : 'interior'; }, 0.045, true, LIN);
  // nose cap and the keel-to-boom fairing are closed by the loft itself; cabin floor, rear bulkhead, parcel shelf
  const FL = 0.66;
  mb.box('interior', 0.25, FL - 0.02, 0, 4.1, 0.04, 1.86, CARPET);
  mb.box('interior', -1.78, 1.42, 0, 0.05, 1.5, 1.8, LIN);
  // ---- engine cowling, mast, hub, exhausts, intakes
  { const g = new THREE.SphereGeometry(1, 28, 9, 0, Math.PI * 2, 0, Math.PI / 2); mb.geo('body', g, new THREE.Matrix4().compose(new THREE.Vector3(-0.95, 2.05, 0), new THREE.Quaternion(), new THREE.Vector3(2.15, 0.6, 0.66))); g.dispose(); }
  mb.cyl('steel', [HELI.mast[0], 2.5, 0], [HELI.mast[0], HELI.mast[1] - 0.06, 0], 0.085, 0.07);
  for (const sd of [-1, 1]) { mb.cyl('steel', [-2.35, 2.4, sd * 0.3], [-2.95, 2.5, sd * 0.36], 0.1, 0.085); mb.box('dark', -0.2, 2.44, sd * 0.42, 0.5, 0.16, 0.2, null, 0, 0, 0, 0.05); }
  // ---- tail boom, fin, shrouded tail rotor, stabiliser
  { const N = 12, st = [[-2.55, 1.98, 0.3], [-3.6, 2.06, 0.24], [-5.0, 2.16, 0.19], [-6.5, 2.27, 0.15], [-6.95, 2.3, 0.14]];
    for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < N; j++) { const a0 = j / N * 6.283, a1 = (j + 1) / N * 6.283, [xa, ya, ra] = st[i], [xb, yb, rb] = st[i + 1];
      const pt = (x, y, r, a) => [x, y + Math.sin(a) * r, Math.cos(a) * r * 0.86], nr = (a) => [0, Math.sin(a), Math.cos(a)];
      const q = [[xa, ya, ra, a0], [xb, yb, rb, a0], [xb, yb, rb, a1], [xa, ya, ra, a1]]; for (const k of [0, 1, 2, 0, 2, 3]) mb.vert(Math.abs(Math.sin((a0 + a1) / 2) + 0.2) < 0.14 ? 'gold' : 'body', pt(...q[k]), nr(q[k][3])); } }
  { const g = new THREE.TorusGeometry(HELI.tailR + 0.1, 0.11, 10, 28); mb.geo('body', g, new THREE.Matrix4().makeTranslation(...HELI.tail)); g.dispose(); }
  { // fin above the shroud (swept), a ventral fin below, gold cap
    const fin = (pts, th, key) => { const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false }); g.translate(0, 0, -th / 2); mb.geo(key, g); g.dispose(); };
    fin([[-6.75, 2.86], [-7.75, 2.86], [-8.25, 3.95], [-7.7, 3.95]], 0.09, 'body'); fin([[-7.7, 3.95], [-8.25, 3.95], [-8.3, 4.06], [-7.68, 4.06]], 0.095, 'gold');
    fin([[-6.9, 1.8], [-7.7, 1.8], [-7.95, 1.25], [-7.5, 1.25]], 0.08, 'body');
    mb.box('body', -5.85, 2.22, 0, 0.62, 0.05, 2.5, null, 0, 0, 0, 0.02); for (const sd of [-1, 1]) mb.box('body', -5.9, 2.3, sd * 1.25, 0.62, 0.42, 0.05, null, 0, 0, 0, 0.02);
  }
  // ---- skids
  for (const sd of [-1, 1]) {
    mb.cyl('dark', [-1.75, 0.045, sd * 1.12], [2.05, 0.045, sd * 1.12], 0.045, 0.045, null, 10); mb.cyl('dark', [2.05, 0.045, sd * 1.12], [2.5, 0.24, sd * 1.12], 0.045, 0.04, null, 10);
    for (const x of [-1.0, 1.35]) mb.cyl('dark', [x, 0.62, sd * 0.55], [x, 0.06, sd * 1.12], 0.045, 0.04, null, 10);
  }
  mb.box('dark', -0.1, 0.38, 1.16, 1.1, 0.035, 0.2, null, 0, 0, 0, 0.012);      // step under the cabin door
  for (const x of [-0.5, 0.38]) mb.cyl('dark', [x, 0.6, 0.9], [x, 0.38, 1.14], 0.018, 0.018, null, 8);
  // ---- emblem: the bird on both sides of the fin (its head towards the nose on either side)
  if (emblemMat) for (const sd of [-1, 1]) { const z = sd * 0.053; mb.quad('emblem', [-7.98, 3.0, z], [-7.08, 3.0, z], [-7.08, 3.78, z], [-7.98, 3.78, z], null, [[1, 0.1], [0, 0.1], [0, 0.9], [1, 0.9]]); }
  // ---- cabin: four seats in cream leather with gold piping, a console between the rear seats; cockpit: panel, console, sticks
  const seat = (x, z, k = 1) => {
    mb.box('interior', x, FL + 0.17, z, 0.2, 0.3, 0.3, TRIM);                                                   // pedestal
    mb.box('interior', x + 0.02, FL + 0.38, z, 0.5, 0.13, 0.5 * k, LEA, 0, 0, 0, 0.05);                         // cushion
    mb.box('interior', x - 0.26, FL + 0.74, z, 0.13, 0.66, 0.48 * k, LEA, 0, 0, 0.16, 0.05);                    // back
    mb.box('interior', x - 0.33, FL + 1.13, z, 0.1, 0.2, 0.27, LEA, 0, 0, 0.16, 0.04);                          // headrest
    mb.box('interior', x - 0.19, FL + 0.74, z, 0.012, 0.6, 0.5 * k + 0.004, PIP, 0, 0, 0.16);                   // piping
    for (const sd of [-1, 1]) mb.box('interior', x - 0.02, FL + 0.56, z + sd * 0.27 * k, 0.36, 0.05, 0.06, LEA, 0, 0, 0, 0.02);   // armrests
  };
  seat(1.12, -0.46); seat(1.12, 0.46); seat(-0.72, -0.5); seat(-0.72, 0.5);
  mb.box('interior', -0.72, FL + 0.26, 0, 0.5, 0.5, 0.26, WOOD, 0, 0, 0, 0.03); mb.box('interior', -0.64, FL + 0.53, 0, 0.3, 0.02, 0.2, PIP);
  // instrument panel on a pedestal, glare shield, centre console, overhead panel
  mb.box('interior', 2.0, FL + 0.68, 0, 0.16, 0.36, 1.26, TRIM, 0, 0, -0.3, 0.04); mb.box('interior', 1.92, FL + 0.9, 0, 0.36, 0.035, 1.34, TRIM, 0, 0, 0.06, 0.012);
  mb.box('interior', 1.86, FL + 0.3, 0, 0.5, 0.56, 0.3, TRIM, 0, 0, 0, 0.03); mb.box('interior', 1.5, FL + 0.22, 0, 0.44, 0.36, 0.26, TRIM, 0, 0, 0, 0.03);
  mb.box('interior', 0.6, 2.1, 0, 0.7, 0.05, 0.36, TRIM, 0, 0, 0, 0.02);
  { const a = [1.905, FL + 0.535, -0.6], b = [1.905, FL + 0.535, 0.6], c = [1.998, FL + 0.835, 0.6], d = [1.998, FL + 0.835, -0.6]; mb.quad('screen', a, b, c, d, null, [[0, 0], [1, 0], [1, 1], [0, 1]]); }
  for (const z of [-0.46, 0.46]) { mb.cyl('interior', [1.5, FL + 0.02, z], [1.58, FL + 0.5, z], 0.014, 0.014, TRIM, 8); mb.box('interior', 1.58, FL + 0.54, z, 0.04, 0.1, 0.04, TRIM, 0, 0, 0, 0.012);     // cyclic
    mb.cyl('interior', [1.0, FL + 0.12, z - 0.28], [1.32, FL + 0.36, z - 0.28], 0.016, 0.02, TRIM, 8); }                                                                                  // collective
  // ---- lights: nav (red port, green starboard, white tail), beacon, landing light
  const LR = C('#ff2a1a'), LG = C('#19ff5a'), LW = C('#fff4dc');
  mb.box('light', -5.9, 2.5, -1.28, 0.1, 0.06, 0.04, LR); mb.box('light', -5.9, 2.5, 1.28, 0.1, 0.06, 0.04, LG); mb.box('light', -8.3, 3.9, 0, 0.05, 0.07, 0.05, LW);
  const meshes = mb.build(M, 'heli'); for (const k in meshes) group.add(meshes[k]);
  // beacon and landing light: their own small meshes (they blink / switch)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false })); beacon.position.set(-1.6, 2.72, 0); beacon.raycast = () => {}; own.push(beacon.material);
  const landing = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff6e0', toneMapped: false })); landing.position.set(2.62, 0.74, 0); landing.raycast = () => {}; landing.visible = false; own.push(landing.material);
  group.add(beacon, landing);

  // ---- the sliding door: the cut-out patch of the skin, its window and its lining; slides aft on a rail, standing off the skin
  const door = new THREE.Group(); door.name = 'heli-door';
  { const db = new MB(), dx = [HELI.door.x0, -1.2, -1, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, HELI.door.x1].map(x => +x.toFixed(2));
    loft(db, dx, -60, 60, 6, (x, d) => doorRegion(d));
    loft(db, dx, -60, W0, 12, () => 'interior', 0.045, true, LIN);
    db.box('gold', 0.2, 0.98, 1.03, 0.2, 0.03, 0.035, null, 0, 0, 0, 0.012);     // handle
    const dm = db.build(M, 'heli-door'); for (const k in dm) door.add(dm[k]); door.userData.glass = dm.glass || null; }
  group.add(door);
  const setDoor = (k) => { const e = k * k * (3 - 2 * k); door.position.set(-HELI.door.slide * e, 0, 0.075 * Math.min(1, e * 6)); };

  // ---- rotors
  const rotor = new THREE.Group(); rotor.position.set(...HELI.mast); rotor.name = 'heli-rotor';
  const blades = new THREE.Group();
  { const rb = new MB();
    { const g = new THREE.CylinderGeometry(0.2, 0.24, 0.16, 16); rb.geo('steel', g, new THREE.Matrix4().makeTranslation(0, -0.02, 0)); g.dispose(); const cap = new THREE.SphereGeometry(0.2, 14, 8, 0, 6.283, 0, 1.4); rb.geo('steel', cap, new THREE.Matrix4().makeTranslation(0, 0.05, 0)); cap.dispose(); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, m = new THREE.Matrix4().makeRotationY(a);
      const bl = (x0, x1, w0, w1, key, droop = 0.012) => { const g = new THREE.BoxGeometry(x1 - x0, 0.022, 1); const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const u = (p.getX(k) + (x1 - x0) / 2) / (x1 - x0); p.setZ(k, p.getZ(k) * (w0 + (w1 - w0) * u) - 0.04 * u); p.setY(k, p.getY(k) - droop * Math.pow((x0 + u * (x1 - x0)) / HELI.rotorR, 2) * 12); }
        g.translate((x0 + x1) / 2, 0, 0); g.computeVertexNormals(); rb.geo(key, g, m); g.dispose(); };
      bl(0.18, 0.75, 0.12, 0.16, 'steel'); bl(0.75, HELI.rotorR - 0.3, 0.3, 0.26, 'dark'); bl(HELI.rotorR - 0.3, HELI.rotorR, 0.26, 0.16, 'gold'); }
    const rm = rb.build(M, 'heli-rotor'); for (const k in rm) blades.add(rm[k]); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(HELI.rotorR, 48), M.blur); disc.rotation.x = -Math.PI / 2; disc.raycast = () => {}; disc.renderOrder = 6; disc.visible = false; disc.name = 'heli-rotor-disc';
  rotor.add(blades, disc); group.add(rotor);
  const tailRotor = new THREE.Group(); tailRotor.position.set(...HELI.tail);
  const tailBlades = new THREE.Group();
  { const tb = new MB(); for (let i = 0; i < 8; i++) tb.box('dark', 0, 0, 0, 0.07, HELI.tailR * 2 - 0.04, 0.012, null, 0, 0, i / 8 * Math.PI); const g = new THREE.CylinderGeometry(0.07, 0.07, 0.16, 10); tb.geo('steel', g, new THREE.Matrix4().makeRotationX(Math.PI / 2)); g.dispose(); const tm = tb.build(M, 'heli-tail'); for (const k in tm) tailBlades.add(tm[k]); }
  const tailDisc = new THREE.Mesh(new THREE.CircleGeometry(HELI.tailR, 24), M.blur); tailDisc.raycast = () => {}; tailDisc.renderOrder = 6; tailDisc.visible = false;
  tailRotor.add(tailBlades, tailDisc); group.add(tailRotor);
  // rpm 0 … 1: the blades give way to the disc
  const setRpm = (k, inside = false) => { const d = sat((k - 0.22) / 0.35); M.blur.opacity = (inside ? 0.4 : 0.85) * d; disc.visible = tailDisc.visible = d > 0.01; blades.visible = tailBlades.visible = k < 0.5; };

  // ---- pilot: a painted figure card in the port front seat, turned to the viewer; back view from the cabin
  const pilot = new THREE.Group(); pilot.position.set(1.06, 0.66 + 0.72, -0.46);
  const pm = (t) => { const m = new THREE.MeshBasicMaterial({ map: t, color: 0xf4efe8, alphaTest: 0.5, side: THREE.DoubleSide }); own.push(m); return m; };
  const pg = new THREE.PlaneGeometry(0.54, 0.675); pg.translate(0, 0.3375, 0);
  const frontTex = tex(128, 160, (g, w, h) => drawPilotFront(g, w, h, null, [0, 0]));
  const pFront = new THREE.Mesh(pg, pm(frontTex)), pBack = new THREE.Mesh(pg, pm(pilotBackTex()));
  for (const o of [pFront, pBack]) { o.raycast = () => {}; pilot.add(o); } group.add(pilot);
  const _v = new THREE.Vector3();
  // camL: the camera in helicopter-local coordinates
  const facePilot = (camL) => { _v.copy(camL).sub(pilot.position); const front = _v.x > 0.15; pFront.visible = front; pBack.visible = !front; pilot.rotation.y = Math.atan2(_v.x, _v.z); };

  // ---- an invisible box to tap (and to keep the walker's ray from passing through)
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.6, 2.5), new THREE.MeshBasicMaterial({ visible: false })); proxy.position.set(0.3, 1.5, 0); proxy.name = 'y-heli'; own.push(proxy.material);
  group.add(proxy);

  const glass = [meshes.glass, door.userData.glass].filter(Boolean);
  return {
    group, door, rotor, tailRotor, blades, disc, tailDisc, glass, pilot, beacon, landing, proxy, setRpm, setDoor, facePilot, materials: M,
    setPilot(canvas, cell) { const c = frontTex.image; drawPilotFront(c.getContext('2d'), c.width, c.height, canvas, cell); frontTex.needsUpdate = true; },
    setNight(n) { M.screen.color.setScalar(0.55 + 0.45 * n); landing.material.color.set('#fff6e0').multiplyScalar(0.6 + 0.4 * n); },
    dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); for (const m of own) { if (m.map) m.map.dispose(); m.dispose(); } },
  };
}
