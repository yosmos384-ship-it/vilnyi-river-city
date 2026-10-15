// interior-lux.js — V2 "luxury" layer for the INTERIOR module:
//  - upgradeMaterials(M): procedural PBR materials (Calacatta marble, brushed brass, walnut, oak, travertine, bouclé, linen,
//    cognac leather, velvet, ceramic, terracotta, terry, knit, wool rug, transmission glass, frosted glass, slot-atlas "duo")
//  - soft geometry (parametric superellipsoids with noise, bendable), brass tubes, curtains / roman shades (interactive),
//    pendants, sconces, round mirrors (ctx.makeMirror when available), art, olive tree, styling props.
import { THREE, PI, V3, Batch, UVS, KEY_ALIAS, hinged, clamp, rng } from './interior-lib.js';
import * as TX from './interior-tex.js';

const TAU = PI * 2;
export const C = {
  brass: 0xd2ab62, brassDeep: 0xb48a45, green: 0x34483c, greenDark: 0x283a30, greige: 0xbdb2a1, cream: 0xf3eee5, ivory: 0xfaf7f0,
  oak: 0xead0a8, walnut: 0xffffff, linen: 0xeee7da, oat: 0xd9cdb8, cognac: 0xa0582a, charcoal: 0x2c2c2c, black: 0x161616,
  terracotta: 0xc7714a, sage: 0x8d9a83, rust: 0xa0522d, ink: 0x2b3640, blush: 0xd8b4a0,
};
const NZ = TX.makeNoise(23);
const sp = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);

// ------------------------------------------------------------------ materials
export function upgradeMaterials(M, quality) {
  const lo = quality === 'low', S = (n) => (lo ? n >> 1 : n);
  let T;
  try {
    const neutralOak = (u, v, o) => { TX.oakFn(u, v, o); const l = o.r * 0.3 + o.g * 0.59 + o.b * 0.11, k = 0.5 + 0.62 * l; o.r = k * 1.02; o.g = k * 0.94; o.b = k * 0.8; };
    T = {
      marble: TX.synth(S(512), S(512), TX.marbleFn, { ns: 1.2 }),
      brass: TX.synth(S(256), S(256), TX.brushedFn, { ns: 0.5 }),
      oak: TX.synth(S(512), S(512), neutralOak, { ns: 2.2 }),
      walnut: TX.synth(S(512), S(512), TX.walnutFn, { ns: 2.2 }),
      trav: TX.synth(S(512), S(512), TX.travertineFn, { ns: 3 }),
      boucle: TX.synth(S(256), S(256), TX.boucleFn, { ns: 4 }),
      linen: TX.synth(S(256), S(256), TX.linenFn, { ns: 3 }),
      leather: TX.synth(S(256), S(256), TX.leatherFn, { ns: 2.5 }),
      velvet: TX.synth(128, 128, TX.velvetFn, { ns: 1.5 }),
      ceramic: TX.synth(S(256), S(256), TX.ceramicFn, { ns: 1 }),
      clay: TX.synth(128, 128, TX.clayFn, { ns: 2 }),
      terry: TX.synth(128, 128, TX.terryFn, { ns: 3 }),
      knit: TX.synth(S(256), S(256), TX.knitFn, { ns: 4 }),
      rug: TX.synth(S(512), S(512), TX.rugFn, { ns: 2, wrap: false }),
      felt: TX.synth(128, 128, TX.feltFn, { ns: 1 }),
      plaster: TX.synth(128, 128, TX.plasterFn, { ns: 1.5 }),
    };
  } catch (e) { console.warn('[interior] lux textures failed', e); return M; }
  const V2 = (a) => new THREE.Vector2(a, a);
  const set = (t, ns) => ({ map: t.map, normalMap: t.normal, normalScale: V2(ns), roughnessMap: t.rough });
  const std = (o) => new THREE.MeshStandardMaterial(o), phy = (o) => new THREE.MeshPhysicalMaterial(o);
  const vc = { vertexColors: true };
  M.marble = phy({ ...vc, ...set(T.marble, 0.3), roughness: 1, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.05 });
  M.brass = std({ ...vc, ...set(T.brass, 0.25), roughness: 1, metalness: 1 });
  M.walnut = std({ ...vc, ...set(T.walnut, 0.6), roughness: 1, metalness: 0 });
  M.travertine = std({ ...vc, ...set(T.trav, 0.9), roughness: 1, metalness: 0 });
  M.boucle = phy({ ...vc, ...set(T.boucle, 1.25), roughness: 1, metalness: 0, sheen: 0.6, sheenRoughness: 0.85, sheenColor: 0xffffff });
  M.linen = phy({ ...vc, ...set(T.linen, 0.9), roughness: 1, metalness: 0, sheen: 0.35, sheenRoughness: 0.7, sheenColor: 0xffffff, side: THREE.DoubleSide });
  M.leather = phy({ ...vc, ...set(T.leather, 0.45), roughness: 1, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45 });
  M.velvet = phy({ ...vc, ...set(T.velvet, 0.4), roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.42, sheenColor: 0xa89e92 });
  M.ceramic = phy({ ...vc, ...set(T.ceramic, 0.3), roughness: 1, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  M.clay = std({ ...vc, ...set(T.clay, 0.8), roughness: 1, metalness: 0 });
  M.terry = std({ ...vc, ...set(T.terry, 1), roughness: 1, metalness: 0 });
  M.knit = std({ ...vc, ...set(T.knit, 1.3), roughness: 1, metalness: 0 });
  M.rug = std({ ...vc, ...set(T.rug, 0.8), roughness: 1, metalness: 0 });
  M.plaster = std({ ...vc, ...set(T.plaster, 0.6), roughness: 1, metalness: 0 });
  M.duo = std({ ...vc, roughness: 1, metalness: 1, roughnessMap: TX.slotAtlas(), metalnessMap: null });
  M.duo.metalnessMap = M.duo.roughnessMap;
  // existing keys upgraded in place (keeps every older builder looking better)
  const up = (m, t, ns, extra = {}) => { if (!m) return; m.map = t.map; m.normalMap = t.normal; m.normalScale = V2(ns); m.roughnessMap = t.rough; Object.assign(m, extra); m.needsUpdate = true; };
  up(M.wood, T.oak, 0.55, { roughness: 1 });
  up(M.woodGloss, T.oak, 0.35, { roughness: 0.55 });
  up(M.steel, T.brass, 0.2, { roughness: 1 });
  up(M.felt, T.felt, 0.6, { roughness: 1 });
  if (M.fabric) { M.fabric.normalMap = T.linen.normal; M.fabric.normalScale = V2(0.6); M.fabric.needsUpdate = true; }
  // glass: physical transmission on desktop; cheap transparent on phones
  M.glassClear = lo ? M.glass : phy({ color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 1, thickness: 0.008, ior: 1.5, specularIntensity: 1, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  M.frosted = lo
    ? new THREE.MeshPhysicalMaterial({ color: 0xf2f5f4, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
    : phy({ color: 0xffffff, roughness: 0.45, metalness: 0, transmission: 1, thickness: 0.01, ior: 1.5, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  M.amber = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false });
  M.opal = std({ ...vc, color: 0xffffff, roughness: 0.3, metalness: 0, emissive: 0xffe2bf, emissiveIntensity: 0.0 });
  try {
    const art = TX.paintingAtlas(lo);
    if (M.art) { M.art.map = art.map; if (art.normal) { M.art.normalMap = art.normal; M.art.normalScale = V2(0.6); } M.art.needsUpdate = true; }
  } catch (e) { console.warn('[interior] art atlas', e); }
  Object.assign(KEY_ALIAS, { paint: 0, plastic: 0, matte: 3, satin: 5, rubber: 6, amber: 'glassC' });
  Object.assign(UVS, { marble: 0.75, brass: 5, walnut: 1.6, travertine: 1.1, boucle: 5, linen: 4, leather: 3, velvet: 3, ceramic: 3, clay: 3, terry: 5, knit: 4, plaster: 2 });
  M._TL = T;
  return M;
}

// ------------------------------------------------------------------ parametric geometry
/** grid surface fn(u, v, outVector3) on [0,1]^2 → non-indexed BufferGeometry with finite-difference normals (outward-oriented) */
export function paramGeo(nu, nv, fn) {
  const n = (nu + 1) * (nv + 1), P = new Float32Array(n * 3), Nn = new Float32Array(n * 3);
  const t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
  const ev = (u, v, o) => { fn(clamp(u, 0, 1), clamp(v, 0, 1), o); return o; };
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * (nu + 1) + i; ev(i / nu, j / nv, t); P[k * 3] = t.x; P[k * 3 + 1] = t.y; P[k * 3 + 2] = t.z; cx += t.x; cy += t.y; cz += t.z;
  }
  cx /= n; cy /= n; cz /= n;
  const e = 1e-3; let dotSum = 0;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * (nu + 1) + i, u = i / nu;
    let v = j / nv; v = clamp(v, 0.004, 0.996);
    ev(u + e, v, a); ev(u - e, v, q); a.sub(q);
    ev(u, v + e, b); ev(u, v - e, q); b.sub(q);
    let nx = a.y * b.z - a.z * b.y, ny = a.z * b.x - a.x * b.z, nz = a.x * b.y - a.y * b.x;
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-12) { nx = P[k * 3] - cx; ny = P[k * 3 + 1] - cy; nz = P[k * 3 + 2] - cz; } // degenerate: radial
    const L2 = Math.hypot(nx, ny, nz) || 1; nx /= L2; ny /= L2; nz /= L2;
    Nn[k * 3] = nx; Nn[k * 3 + 1] = ny; Nn[k * 3 + 2] = nz;
    dotSum += nx * (P[k * 3] - cx) + ny * (P[k * 3 + 1] - cy) + nz * (P[k * 3 + 2] - cz);
  }
  const flip = dotSum < 0;
  if (flip) for (let i = 0; i < Nn.length; i++) Nn[i] = -Nn[i];
  const tri = nu * nv * 6, pos = new Float32Array(tri * 3), nor = new Float32Array(tri * 3), uv = new Float32Array(tri * 2);
  let w = 0;
  const put = (i, j) => {
    const k = (j * (nu + 1) + i) * 3, o3 = w * 3;
    pos[o3] = P[k]; pos[o3 + 1] = P[k + 1]; pos[o3 + 2] = P[k + 2]; nor[o3] = Nn[k]; nor[o3 + 1] = Nn[k + 1]; nor[o3 + 2] = Nn[k + 2];
    uv[w * 2] = i / nu; uv[w * 2 + 1] = j / nv; w++;
  };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    if (!flip) { put(i, j); put(i + 1, j); put(i + 1, j + 1); put(i, j); put(i + 1, j + 1); put(i, j + 1); }
    else { put(i, j); put(i + 1, j + 1); put(i + 1, j); put(i, j); put(i, j + 1); put(i + 1, j + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** soft upholstered / pillow shape: superellipsoid of size w×h×d (centered), optional pinch (thin rim), flat bottom, noise, bend about +z centre.
 *  o: e1 (profile roundness, 0.1 boxy … 1 round), e2 (plan squareness), pinch, flat (bottom squash 0..1), noise (m), freq, seed, bend (R), sagTop (m) */
export function softGeo(w, h, d, o = {}) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const e1 = o.e1 !== undefined ? o.e1 : 0.35, e2 = o.e2 !== undefined ? o.e2 : 0.2;
  const amp = o.noise !== undefined ? o.noise : Math.min(0.006, Math.min(w, h, d) * 0.04), fq = o.freq || 9, sd = (o.seed || 1) * 13.37;
  const fn = (u, v, out) => {
    const ph = u * TAU - PI, th = v * PI - PI / 2;
    const eb = (o.flat !== undefined && th < 0) ? e1 * o.flat : e1; // flatter (boxier) underside, same extents
    const cr = sp(Math.cos(th), eb), sr = sp(Math.sin(th), eb);
    let x = hw * cr * sp(Math.cos(ph), e2), z = hd * cr * sp(Math.sin(ph), e2), y = hh * sr;
    if (o.pinch) { const ex = Math.max(Math.abs(x) / hw, Math.abs(z) / hd); y *= 1 - o.pinch * Math.pow(ex, 3); }
    if (o.sagTop && y > 0) { const cx2 = 1 - Math.pow(Math.abs(x) / hw, 2), cz2 = 1 - Math.pow(Math.abs(z) / hd, 2); y -= o.sagTop * Math.max(0, cx2) * Math.max(0, cz2) * (y / hh); }
    if (o.lean) x += o.lean * (y / hh); // shear (back cushions)
    if (amp) {
      const nn = NZ.f3(x * fq + sd, y * fq, z * fq) - 0.5;
      let gx = x / (hw * hw), gy = y / (hh * hh), gz = z / (hd * hd); const L = Math.hypot(gx, gy, gz) || 1; gx /= L; gy /= L; gz /= L;
      x += gx * nn * amp * 2; y += gy * nn * amp * 2; z += gz * nn * amp * 2;
    }
    if (o.bend) { const R = o.bend, an = x / R, r = R - z; x = r * Math.sin(an); z = R - r * Math.cos(an); }
    out.set(x, y, z);
  };
  return paramGeo(o.nu || 32, o.nv || 18, fn);
}
export function soft(f, key, size, pos, color, o = {}) { return f.add(key, softGeo(size[0], size[1], size[2], o), pos, color, o); }

/** brass/metal tube along points (local frame coords) */
export function tube(f, key, pts, r, color, o = {}) {
  try {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!o.closed, 'catmullrom', o.tension !== undefined ? o.tension : 0.5);
    const geo = new THREE.TubeGeometry(curve, o.tseg || Math.max(6, pts.length * 6), r, o.rs || 10, !!o.closed);
    f.add(key, geo, [0, 0, 0], color, o);
    if (o.caps) for (const p of [pts[0], pts[pts.length - 1]]) f.sph(key, r, p, color, { ws: 10, hs: 8, ...o });
  } catch (e) { console.warn('[interior] tube', e); }
}

// ------------------------------------------------------------------ hardware (slot-atlas: no extra draw calls)
export const BR = { slot: 1 };
export function bpull(f, x, y, z0, len, vertical) {
  const r = 0.0065, so = 0.032, c = C.brass, o = { slot: 1 };
  if (vertical) {
    f.cyl('duo', r, r, len, [x, y, z0 + so], c, { seg: 14, ...o });
    for (const s of [-1, 1]) { f.cyl('duo', 0.005, 0.0055, so, [x, y + s * (len / 2 - 0.015), z0 + so / 2], c, { seg: 10, rx: PI / 2, ...o }); f.sph('duo', r, [x, y + s * len / 2, z0 + so], c, { ws: 10, hs: 6, ...o }); }
  } else {
    f.cyl('duo', r, r, len, [x, y, z0 + so], c, { seg: 14, rz: PI / 2, ...o });
    for (const s of [-1, 1]) { f.cyl('duo', 0.005, 0.0055, so, [x + s * (len / 2 - 0.015), y, z0 + so / 2], c, { seg: 10, rx: PI / 2, ...o }); f.sph('duo', r, [x + s * len / 2, y, z0 + so], c, { ws: 10, hs: 6, ...o }); }
  }
}
export function bknob(f, x, y, z0, r = 0.015) {
  f.cyl('duo', 0.006, 0.009, 0.022, [x, y, z0 + 0.011], C.brass, { seg: 12, rx: PI / 2, slot: 1 });
  f.sph('duo', r, [x, y, z0 + 0.027], C.brass, { ws: 14, hs: 10, sz: 0.75, slot: 1 });
}
/** cup pull (drawers) */
export function bcup(f, x, y, z0, w = 0.09) {
  f.box('duo', [w, 0.012, 0.022], [x, y + 0.012, z0 + 0.011], C.brass, { r: 0.004, slot: 1 });
  f.cyl('duo', 0.022, 0.022, w - 0.01, [x, y, z0 + 0.012], C.brass, { rz: PI / 2, seg: 16, ts: PI / 2, tl: PI, open: true, slot: 1 });
}

// ------------------------------------------------------------------ fluted fronts (vertical half-round reeds)
export function fluted(f, key, x0, y0, w, h, z, color, o = {}) {
  const pitch = o.pitch || 0.028, n = Math.max(2, Math.round(w / pitch)), r = (w / n) / 2;
  for (let i = 0; i < n; i++) f.cyl(key, r, r, h, [x0 + r + i * 2 * r, y0 + h / 2, z], color, { seg: 10, ts: -PI / 2, tl: PI, open: true, sz: o.depth || 0.55, grain: 'v' });
  f.box(key, [w, h, 0.006], [x0 + w / 2, y0 + h / 2, z - 0.003], color, { r: 0 });
}

// ------------------------------------------------------------------ lamps & light fixtures
/** emissive opal material controlled by a lamp handle */
export function lampMats(o = {}) {
  const shade = new THREE.MeshStandardMaterial({ color: o.color || 0xfbf7ef, emissive: o.emissive || 0xffdcb0, emissiveIntensity: 0, roughness: o.rough || 0.32, metalness: 0, side: o.side || THREE.FrontSide, map: o.map || null, normalMap: o.normalMap || null });
  const bulb = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d6, emissiveIntensity: 0, roughness: 0.2 });
  return [shade, bulb];
}

/** ceiling pendant (group under `top`, tagged ceiling). style: 'globe' | 'dome' | 'tiered' | 'cone'. Returns lamp handle. */
export function pendant(E, top, o) {
  const { x, z, floor, room } = o, ceilY = o.ceilY, py = o.y; // py = bottom of the shade
  const g = new THREE.Group(); g.name = 'pendant-' + room; g.userData.floor = floor; g.userData.ceiling = true; g.userData.room = room; top.add(g);
  const b = new Batch(), f = b.root.sub(x, 0, z, 0);
  const [shadeM, bulbM] = lampMats({ side: o.style === 'dome' ? THREE.DoubleSide : THREE.FrontSide });
  const lb = new Batch(), lf = lb.root.sub(x, 0, z, 0);
  f.cyl('brass', 0.065, 0.065, 0.022, [0, ceilY - 0.011, 0], C.brass, { seg: 28 });
  const style = o.style || 'globe';
  let hang = 0;
  if (style === 'globe') {
    const R = o.r || 0.15; hang = py + 2 * R + 0.03;
    lf.sph(shadeM, R, [0, py + R, 0], 0xffffff, { ws: 32, hs: 20, sy: 0.92 });
    f.cyl('brass', 0.03, 0.022, 0.05, [0, py + 2 * R * 0.92 + 0.015, 0], C.brass, { seg: 20 });
    f.torus('brass', 0.032, 0.005, [0, py + 2 * R * 0.92 - 0.004, 0], C.brass, { rx: PI / 2, ts: 28, rs: 8 });
  } else if (style === 'dome') {
    const R = o.r || 0.22; hang = py + 0.24;
    f.lathe('brass', [[R, 0], [R * 0.98, 0.012], [R * 0.82, 0.1], [R * 0.48, 0.19], [0.05, 0.23], [0.025, 0.24]], [0, py, 0], C.brass, { seg: 48 });
    lf.lathe(shadeM, [[0.03, 0.225], [R * 0.46, 0.18], [R * 0.8, 0.095], [R * 0.96, 0.012], [R * 0.99, 0.002]], [0, py, 0], 0xffffff, { seg: 48 });
    lf.sph(bulbM, 0.045, [0, py + 0.07, 0], 0xffffff, { ws: 14, hs: 10 });
  } else if (style === 'tiered') { // sculptural stacked opal discs on a brass spine
    hang = py + 0.5;
    f.cyl('brass', 0.008, 0.008, 0.52, [0, py + 0.26, 0], C.brass, { seg: 10 });
    const tiers = [[0.26, 0.0], [0.2, 0.16], [0.14, 0.3], [0.09, 0.42]];
    for (const [r, y] of tiers) {
      lf.lathe(shadeM, [[0.01, 0], [r * 0.9, 0.004], [r, 0.022], [r * 0.92, 0.04], [0.01, 0.05]], [0, py + y, 0], 0xffffff, { seg: 48 });
      f.torus('brass', r * 0.97, 0.004, [0, py + y + 0.022, 0], C.brass, { rx: PI / 2, ts: 48, rs: 6 });
    }
  } else { // fluted plaster cone
    hang = py + 0.32;
    f.lathe('plaster', [[0.2, 0], [0.19, 0.02], [0.08, 0.3], [0.03, 0.32]], [0, py, 0], C.ivory, { seg: 40 });
    lf.sph(bulbM, 0.05, [0, py + 0.06, 0], 0xffffff, { ws: 14, hs: 10 });
    lf.cyl(shadeM, 0.17, 0.17, 0.004, [0, py + 0.01, 0], 0xffffff, { seg: 40 });
  }
  f.cyl('matte', 0.0025, 0.0025, Math.max(0.05, ceilY - hang), [0, (ceilY + hang) / 2, 0], 0x1a1a1a, { seg: 6 });
  b.build(g, E.M, { shadow: false }); lb.build(g, E.M, { shadow: false });
  const lamp = E.lamp({ room, floor, group: g, pos: V3(x, py + 0.08, z), mats: [shadeM, bulbM], point: !!o.point, intensity: o.intensity || 20, emissive: o.emissive || [1.6, 3] });
  if (o.interact !== false) E.interact(g, () => (lamp.on ? (o.labels || ['הדלק מנורה', 'כבה מנורה'])[1] : (o.labels || ['הדלק מנורה', 'כבה מנורה'])[0]), () => { lamp.set(!lamp.on); E.snd.switchClick(g); });
  return lamp;
}

/** wall sconce in a static batch; glow = room-glow material (shared per room → one draw call). Frame: wall face at z=0, facing +z */
export function sconce(f, glow, x, y, o = {}) {
  f.cyl('brass', 0.055, 0.055, 0.014, [x, y, 0.007], C.brass, { rx: PI / 2, seg: 28 });
  tube(f, 'brass', [[x, y, 0.012], [x, y + 0.02, 0.08], [x, y + 0.06, 0.12]], 0.007, C.brass, {});
  f.cyl('brass', 0.03, 0.025, 0.03, [x, y + 0.075, 0.12], C.brass, { seg: 18 });
  if (o.shade === 'cyl') f.cyl(glow, 0.06, 0.06, 0.16, [x, y + 0.17, 0.12], 0xffffff, { seg: 28, open: false });
  else f.sph(glow, 0.065, [x, y + 0.15, 0.12], 0xffffff, { ws: 24, hs: 16 });
}

/** table lamp with ceramic base + linen drum shade; returns lamp handle (interactive) */
export function tableLampLux(E, G, f, o = {}) {
  const h = o.h || 0.55, sr = o.sr || 0.17, kind = o.kind || 'gourd';
  if (kind === 'gourd') f.lathe('ceramic', [[0, 0], [0.06, 0], [0.065, 0.01], [0.1, 0.07], [0.115, 0.15], [0.1, 0.24], [0.05, 0.3], [0.03, 0.33], [0.035, 0.345], [0, 0.345]], [0, 0, 0], o.baseC || 0xe9e3d8, { seg: 36 });
  else if (kind === 'column') { f.cyl('travertine', 0.075, 0.085, 0.3, [0, 0.15, 0], o.baseC || 0xffffff, { seg: 32 }); f.cyl('brass', 0.03, 0.03, 0.04, [0, 0.32, 0], C.brass, { seg: 16 }); }
  else { f.cyl('brass', 0.08, 0.085, 0.02, [0, 0.01, 0], C.brass, { seg: 28 }); f.sph('ceramic', 0.11, [0, 0.13, 0], o.baseC || 0x2b3640, { ws: 28, hs: 18 }); }
  f.cyl('brass', 0.0055, 0.0055, h - 0.33, [0, 0.33 + (h - 0.33) / 2, 0], C.brass, { seg: 8 });
  const [shadeM, bulbM] = lampMats({ color: o.shadeC || 0xf4efe6, map: E.M._TL ? E.M._TL.linen.map : null, side: THREE.DoubleSide, rough: 0.95, emissive: 0xffd6a6 });
  const g = new THREE.Group(); f.place(g, [0, h - 0.06, 0]); G.add(g);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(sr * 0.82, sr, 0.25, 40, 1, true), shadeM); shade.castShadow = false; g.add(shade);
  if (o.point) { const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), bulbM); bulb.position.y = -0.04; g.add(bulb); }
  const lamp = E.lamp({ room: o.room, floor: o.floor, group: g, pos: f.pt(0, h - 0.08, 0), mats: [shadeM, bulbM], point: o.point, intensity: o.intensity || 10, emissive: [0.9, 2.6] });
  E.interact(g, () => (lamp.on ? 'כבה מנורה' : 'הדלק מנורה'), () => { lamp.set(!lamp.on); E.snd.switchClick(g); });
  return lamp;
}

// ------------------------------------------------------------------ curtains (interactive) & roman shade
/** Pleated linen drapes on a brass rod. F: frame at window centre on the wall face (z=0 = wall face, +z into room), y = floor.
 *  o: w (window width), top (rod y), drop (hem y), ext (rod overhang), sides: ['L','R'] subset, z (curtain plane), stack (gathered width),
 *     color, batch frame `sf` (static batch for rod), room, open (initial) */
export function curtains(E, G, F, sf, o) {
  const w = o.w, ext = o.ext !== undefined ? o.ext : 0.2, top = o.top, drop = o.drop !== undefined ? o.drop : 0.012, z = o.z || 0.1;
  const sides = o.sides || ['L', 'R'], col = o.color || C.linen, stack = o.stack || 0.2;
  const half = w / 2 + ext, rodL = 2 * half + 0.12;
  // rod (static)
  const pad = o.endPad !== undefined ? o.endPad : 0.08;
  const rodX0 = sides.includes('L') ? -half - 0.06 : -w / 2 - pad, rodX1 = sides.includes('R') ? half + 0.06 : w / 2 + pad;
  void rodL;
  sf.cyl('brass', 0.011, 0.011, rodX1 - rodX0, [(rodX0 + rodX1) / 2, top, z], C.brass, { rz: PI / 2, seg: 14 });
  for (const xx of [rodX0, rodX1]) sf.sph('brass', 0.02, [xx + (xx < 0 ? -0.012 : 0.012), top, z], C.brass, { ws: 14, hs: 10 });
  for (const xx of [rodX0 + 0.06, rodX1 - 0.06]) { sf.cyl('brass', 0.006, 0.006, z, [xx, top, z / 2], C.brass, { rx: PI / 2, seg: 8 }); sf.cyl('brass', 0.022, 0.022, 0.008, [xx, top, 0.004], C.brass, { rx: PI / 2, seg: 16 }); }
  const H = top - 0.03 - drop, panels = [];
  const all = new THREE.Group(); all.name = 'drapes'; G.add(all);
  const reg = E.drapes || (E.drapes = { list: [], until: -1 });
  const hitM = new THREE.MeshBasicMaterial({ visible: false });
  for (const s of sides) {
    const sg = s === 'L' ? -1 : 1;
    const outerX = sg > 0 ? (sides.includes('R') ? half : rodX1 - 0.06) : (sides.includes('L') ? -half : rodX0 + 0.06);
    const Wc = sides.length === 2 ? half + 0.05 : (rodX1 - rodX0) - 0.1;
    const pivot = new THREE.Group(); F.place(pivot, [outerX, drop, z]); all.add(pivot);
    // invisible hit volume that follows the gathered panel (pivot scale)
    const hg = new THREE.BoxGeometry(Wc, H, 0.09); hg.translate(-sg * Wc / 2, H / 2, 0);
    const hit = new THREE.Mesh(hg, hitM); pivot.add(hit);
    const p = { pivot, Wc, H, sg, color: col, floor: o.floor || 'main', room: o.room || null };
    reg.list.push(p); panels.push(p);
  }
  const st = { open: o.open !== false };
  const apply = (open, dur) => {
    reg.until = Math.max(reg.until, E.anim.t + dur + 0.15);
    return Promise.all(panels.map((p) => {
      const sx = open ? Math.max(0.1, stack / p.Wc) : 1, sz = open ? (o.openZ || 1.5) : 1;
      return Promise.all([E.anim.to(p.pivot.scale, 'x', sx, dur, 'io'), E.anim.to(p.pivot.scale, 'z', sz, dur, 'io')]);
    }));
  };
  apply(st.open, 0);
  E.interact(all, () => (st.open ? 'סגור וילון' : 'פתח וילון'), () => { st.open = !st.open; E.snd.slide(all, 0.9, 0.8); apply(st.open, 1.2); });
  return st;
}

/** builds the drape panels registered by curtains() as one InstancedMesh per (floor, pleat class): 13 panels → 3 draw calls.
 *  mkGroup(floor) → top-level group tagged with that floor. Instances follow each panel pivot (gather animation). */
export function finalizeDrapes(E, mkGroup) {
  const reg = E.drapes; if (!reg || !reg.list.length) return;
  const geoFor = (nP) => paramGeo(nP * 6, 10, (u, v, out) => {
    const flare = 1 + 0.25 * (1 - v);
    out.set(-u, v, 0.032 * Math.sin(u * nP * TAU) * flare + 0.004 * Math.sin(u * 7.1 + v * 3.0));
  });
  const prep = (g) => { // vertex colour attribute expected by the linen material
    const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  };
  const groups = {};
  for (const p of reg.list) { const cls = p.Wc < 0.95 ? 7 : 12; const k = p.floor + ':' + cls; (groups[k] = groups[k] || { floor: p.floor, cls, list: [] }).list.push(p); }
  const meshes = [];
  const S = new THREE.Matrix4(), M4 = new THREE.Matrix4(), col = new THREE.Color(), _o = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  for (const k of Object.keys(groups)) {
    const gr = groups[k];
    const mesh = new THREE.InstancedMesh(prep(geoFor(gr.cls)), E.M.linen, gr.list.length);
    mesh.name = 'drapes-' + k; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    gr.list.forEach((p, i) => { try { mesh.setColorAt && mesh.setColorAt(i, col.set(p.color)); } catch (e) { } });
    const parent = mkGroup(gr.floor); parent.add(mesh);
    meshes.push({ mesh, list: gr.list });
  }
  const update = () => {
    for (const { mesh, list } of meshes) {
      list.forEach((p, i) => {
        p.pivot.updateWorldMatrix(true, false);
        S.compose(_o, _q, _s.set(p.sg * p.Wc, p.H, 1));
        M4.multiplyMatrices(p.pivot.matrixWorld, S);
        mesh.setMatrixAt(i, M4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update();
  E.anim.tick(() => { if (E.anim.t <= reg.until) update(); });
}

/** Roman shade (raises with folds). F: frame at window centre, wall face z=0. o: w, top, bottom (lowered hem y), z, color */
export function romanShade(E, G, F, sf, o) {
  const w = o.w + 0.1, top = o.top, bot = o.bottom, z = o.z || 0.08, H = top - bot;
  sf.box('brass', [w + 0.04, 0.03, 0.04], [0, top + 0.015, z], C.brass, { r: 0.008 });
  const pivot = new THREE.Group(); F.place(pivot, [0, top, z]); G.add(pivot);
  const nf = 5;
  const geo = paramGeo(12, nf * 8, (u, v, out) => {
    const yy = -v * H, k = v * nf; const ph = k - Math.floor(k);
    out.set((u - 0.5) * w, yy, 0.018 * Math.sin(ph * PI) * (0.6 + 0.4 * v));
  });
  const b = new Batch(); b.root.add('linen', geo, [0, 0, 0], o.color || C.linen, {});
  b.root.cyl('linen', 0.012, 0.012, w, [0, -H, 0.006], o.color || C.linen, { rz: PI / 2, seg: 10 });
  b.build(pivot, E.M, { shadow: true });
  const st = { up: o.up !== false };
  const apply = (up, d) => Promise.all([E.anim.to(pivot.scale, 'y', up ? 0.22 : 1, d), E.anim.to(pivot.scale, 'z', up ? 2.6 : 1, d)]);
  apply(st.up, 0);
  E.interact(pivot, () => (st.up ? 'הורד וילון' : 'הרם וילון'), () => { st.up = !st.up; E.snd.slide(pivot, 0.8, 0.6); apply(st.up, 1.0); });
  return st;
}

// ------------------------------------------------------------------ mirrors
/** round mirror surface: ctx.makeMirror (Reflector, RENDER bot) when present, else metal mirror. parent-local placement via F.place */
export function mirrorDisc(E, parent, F, pos, r, o = {}) {
  let m = null;
  try {
    if (E.ctx && typeof E.ctx.makeMirror === 'function' && !o.noReflector) {
      m = E.ctx.makeMirror(2 * r, 2 * r, { shape: 'circle', radius: r });
      if (!(m && m.isObject3D)) m = null;
    }
  } catch (e) { m = null; }
  if (m) {
    // core returns a group (chrome plane now, Reflector plane possibly later, async): make every surface a disc
    const done = new WeakSet();
    const fix = () => {
      m.traverse((c) => {
        if (!c.isMesh || !c.geometry || done.has(c.geometry)) return;
        try { c.geometry.dispose(); } catch (e) { }
        c.geometry = new THREE.CircleGeometry(r, 64); done.add(c.geometry);
      });
    };
    fix();
    let t = 0; E.anim.tick((dt) => { t += dt; if (((t * 4) | 0) !== (((t - dt) * 4) | 0)) fix(); return t < 90 ? undefined : false; });
  } else m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), E.M.mirror);
  F.place(m, pos, o.rot || {}); parent.add(m);
  return m;
}

// ------------------------------------------------------------------ art
export function artLux(f, cell, cx, cy, z, w, h, o = {}) {
  const fw = o.fw || 0.03, fd = o.fd || 0.045, key = o.key || 'wood', fc = o.fc !== undefined ? o.fc : C.oak, gap = 0.012;
  // float frame: thin profile around a deep canvas
  f.box(key, [w + 2 * (fw + gap), fw, fd], [cx, cy + h / 2 + gap + fw / 2, z + fd / 2], fc, { r: 0.004, grain: 'h' });
  f.box(key, [w + 2 * (fw + gap), fw, fd], [cx, cy - h / 2 - gap - fw / 2, z + fd / 2], fc, { r: 0.004, grain: 'h' });
  f.box(key, [fw, h + 2 * gap, fd], [cx - w / 2 - gap - fw / 2, cy, z + fd / 2], fc, { r: 0.004 });
  f.box(key, [fw, h + 2 * gap, fd], [cx + w / 2 + gap + fw / 2, cy, z + fd / 2], fc, { r: 0.004 });
  f.box('duo', [w + 2 * gap, h + 2 * gap, 0.006], [cx, cy, z + 0.003], 0x1c1c1c, { r: 0, slot: 3 });
  f.box('linen', [w, h, 0.03], [cx, cy, z + 0.006 + 0.015], 0xf2ede4, { r: 0.002 });
  const g = new THREE.PlaneGeometry(w, h);
  const u0 = (cell % 4) / 4, v0 = 1 - ((cell >> 2) + 1) / 2;
  const uv = g.attributes.uv, ar = w / h; let du = 0.25, dv = 0.5;
  if (ar >= 1) dv = 0.5 / ar; else du = 0.25 * ar;
  const cu = u0 + 0.125, cv = v0 + 0.25;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + (uv.getX(i) - 0.5) * du * 0.96, cv + (uv.getY(i) - 0.5) * dv * 0.96);
  f.add('art', g, [cx, cy, z + 0.0365], 0xffffff, { uv: 'keep' });
}

// ------------------------------------------------------------------ rugs
export function rugLux(f, w, l, pos, color, o = {}) {
  f.box('rug', [w, 0.012, l], [pos[0], pos[1] + 0.006, pos[2]], color, { r: 0, uv: 'keep', ry: o.ry || 0 });
}

// ------------------------------------------------------------------ styling props
export function vase(f, x, y, z, kind, color, s = 1, key = 'ceramic') {
  const P = {
    amphora: [[0, 0], [0.04, 0], [0.05, 0.01], [0.075, 0.08], [0.08, 0.14], [0.06, 0.22], [0.032, 0.27], [0.03, 0.3], [0.04, 0.315], [0.034, 0.32], [0.026, 0.305], [0.026, 0.27], [0, 0.27]],
    bottle: [[0, 0], [0.05, 0], [0.058, 0.02], [0.06, 0.12], [0.045, 0.17], [0.016, 0.2], [0.014, 0.28], [0.02, 0.29], [0.011, 0.29], [0, 0.29]],
    globe: [[0, 0], [0.03, 0], [0.07, 0.03], [0.09, 0.1], [0.075, 0.17], [0.035, 0.2], [0.03, 0.215], [0.026, 0.215], [0, 0.2]],
    bowl: [[0, 0], [0.05, 0], [0.11, 0.035], [0.14, 0.075], [0.135, 0.08], [0.105, 0.042], [0.045, 0.012], [0, 0.012]],
    cylinder: [[0, 0], [0.055, 0], [0.058, 0.01], [0.058, 0.24], [0.052, 0.245], [0.052, 0.02], [0, 0.02]],
  }[kind] || [[0, 0], [0.05, 0], [0.05, 0.2], [0, 0.2]];
  f.lathe(key, P.map(([r, h]) => [r * s, h * s]), [x, y, z], color, { seg: 36 });
}
export function branches(f, x, y, z, h, r, n = 5, leaf = 0x6f7d5c) {
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + r() * 0.5, lean = 0.12 + r() * 0.18;
    const p0 = [x, y, z], p1 = [x + Math.cos(a) * h * lean * 0.4, y + h * 0.55, z + Math.sin(a) * h * lean * 0.4], p2 = [x + Math.cos(a) * h * lean, y + h * (0.9 + r() * 0.2), z + Math.sin(a) * h * lean];
    tube(f, 'wood', [p0, p1, p2], 0.003, 0x4a3a2c, { tseg: 8, rs: 5 });
    for (let k = 0; k < 7; k++) {
      const t = 0.45 + k * 0.08, q = [p0[0] + (p2[0] - p0[0]) * t, p0[1] + (p2[1] - p0[1]) * t, p0[2] + (p2[2] - p0[2]) * t];
      f.sph('leaf', 1, q, leaf, { ws: 5, hs: 3, sx: 0.022, sy: 0.003, sz: 0.008, ry: r() * TAU, rz: (r() - 0.5) * 1.2 });
    }
  }
}
export function bookStack(f, x, y, z, n, r, o = {}) {
  const cols = o.colors || [0xe8e1d4, 0x2b3640, 0xc9b79c, 0x6e5a48, 0xf3efe7, 0x8a8f86, 0x1f1f1f];
  let yy = y;
  for (let i = 0; i < n; i++) {
    const w = (o.w || 0.26) - r() * 0.05, d = (o.d || 0.2) - r() * 0.04, t = 0.022 + r() * 0.02;
    f.box(o.key || 'duo', [w, t, d], [x + (r() - 0.5) * 0.02, yy + t / 2, z + (r() - 0.5) * 0.02], cols[(r() * cols.length) | 0], { r: 0.003, ry: (r() - 0.5) * 0.2 + (o.ry || 0), slot: 3 });
    yy += t;
  }
  return yy;
}
export function candle(f, x, y, z, h = 0.1, r = 0.035) {
  f.lathe('brass', [[0, 0], [r * 1.3, 0], [r * 1.35, 0.01], [r * 1.1, 0.016], [0, 0.016]], [x, y, z], C.brass, { seg: 20 });
  f.cyl('duo', r, r, h, [x, y + 0.016 + h / 2, z], 0xf1ebe0, { seg: 20, slot: 3 });
  f.cyl('duo', 0.0015, 0.0015, 0.012, [x, y + 0.016 + h + 0.006, z], 0x222222, { seg: 4, slot: 3 });
}
export function diffuser(f, x, y, z, r) {
  f.lathe('amber', [[0, 0], [0.04, 0], [0.042, 0.01], [0.042, 0.08], [0.02, 0.1], [0.012, 0.105], [0.012, 0.115], [0, 0.115]], [x, y, z], 0x9a5a1c, { seg: 20 });
  for (let i = 0; i < 7; i++) { const a = i * 0.9, t = 0.12 + r() * 0.06; tube(f, 'wood', [[x, y + 0.1, z], [x + Math.cos(a) * 0.05, y + 0.1 + t * 0.6, z + Math.sin(a) * 0.05], [x + Math.cos(a) * 0.09, y + 0.1 + t, z + Math.sin(a) * 0.09]], 0.0018, 0x3b2d22, { tseg: 6, rs: 4 }); }
}
export function towelStack(f, x, y, z, w, d, n, cols) {
  let yy = y;
  for (let i = 0; i < n; i++) { const t = 0.045; soft(f, 'terry', [w, t, d], [x, yy + t / 2, z], cols[i % cols.length], { e1: 0.45, e2: 0.12, noise: 0.003, nu: 20, nv: 10, seed: i + 3 }); yy += t * 0.92; }
  return yy;
}
/** heated towel ladder. frame: wall face z=0 facing +z, x center, y0 bottom */
export function heatedRail(f, x, y0, w, h, n = 7) {
  for (const s of [-1, 1]) {
    f.cyl('brass', 0.013, 0.013, h, [x + s * w / 2, y0 + h / 2, 0.06], C.brass, { seg: 16 });
    for (const yy of [y0 + 0.08, y0 + h - 0.08]) { f.cyl('brass', 0.009, 0.009, 0.06, [x + s * w / 2, yy, 0.03], C.brass, { rx: PI / 2, seg: 10 }); f.cyl('brass', 0.022, 0.022, 0.008, [x + s * w / 2, yy, 0.004], C.brass, { rx: PI / 2, seg: 16 }); }
    f.sph('brass', 0.013, [x + s * w / 2, y0 + h, 0.06], C.brass, { ws: 12, hs: 8 });
    f.sph('brass', 0.013, [x + s * w / 2, y0, 0.06], C.brass, { ws: 12, hs: 8 });
  }
  for (let i = 0; i < n; i++) f.cyl('brass', 0.009, 0.009, w, [x, y0 + 0.06 + i * (h - 0.12) / (n - 1), 0.06], C.brass, { rz: PI / 2, seg: 12 });
}
/** towel draped over a bar at (x, y, z) in frame (bar along x) */
export function hangingTowel(f, x, y, z, w, h, col) {
  soft(f, 'terry', [w, h, 0.03], [x, y - h / 2 + 0.01, z + 0.022], col, { e1: 0.25, e2: 0.1, noise: 0.004, nu: 16, nv: 14 });
  soft(f, 'terry', [w, h * 0.72, 0.03], [x, y - h * 0.36 + 0.01, z - 0.022], col, { e1: 0.25, e2: 0.1, noise: 0.004, nu: 16, nv: 14, seed: 4 });
  f.cyl('terry', 0.022, 0.022, w * 0.98, [x, y + 0.006, z], col, { rz: PI / 2, seg: 14 });
}
export function lemons(f, x, y, z, r, n = 7) {
  f.lathe('ceramic', [[0, 0], [0.06, 0], [0.13, 0.04], [0.16, 0.085], [0.155, 0.09], [0.125, 0.048], [0.055, 0.012], [0, 0.012]], [x, y, z], 0xf1ece2, { seg: 40 });
  for (let i = 0; i < n; i++) {
    const a = i * 2.2 + r(), rr = i < 5 ? 0.07 : 0.02, py = y + 0.05 + (i < 5 ? 0 : 0.045);
    const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    f.sph('food', 0.036, [px, py, pz], 0xe8c13a, { ws: 14, hs: 10, sx: 1.28, ry: a, rz: (r() - 0.5) * 0.4 });
    f.sph('food', 0.008, [px + Math.cos(a) * 0.045, py, pz - Math.sin(a) * 0.045], 0xd9b02d, { ws: 6, hs: 4, sx: 1.5, ry: a });
  }
  for (let k = 0; k < 3; k++) f.sph('leaf', 1, [x + 0.03 * k - 0.03, y + 0.11, z + 0.02], 0x3f6b35, { ws: 6, hs: 4, sx: 0.035, sy: 0.003, sz: 0.014, ry: k * 1.1, rx: 0.3 });
}

/** olive tree in a terracotta pot. f: frame at pot centre on the floor */
export function oliveTree(f, r, o = {}) {
  const s = o.s || 1, ph = 0.42 * s, pr = 0.2 * s;
  f.lathe('clay', [[0, 0], [pr * 0.72, 0], [pr * 0.76, 0.02], [pr * 0.98, ph * 0.9], [pr * 1.06, ph * 0.92], [pr * 1.06, ph], [pr * 0.96, ph], [pr * 0.93, ph * 0.94], [0, ph * 0.94]], [0, 0, 0], C.terracotta, { seg: 40 });
  f.cyl('duo', pr * 0.9, pr * 0.9, 0.012, [0, ph * 0.93, 0], 0x3a2b20, { seg: 24, slot: 3 });
  for (let i = 0; i < 9; i++) f.sph('duo', 0.018, [(r() - 0.5) * pr, ph * 0.94 + 0.004, (r() - 0.5) * pr], 0xd9d2c4, { ws: 6, hs: 4, sy: 0.6, slot: 4 }); // pebbles
  const top = ph * 0.93, H = (o.h || 1.75) * s;
  const bark = 0x6d6253;
  // twisted trunk (two stems)
  const stems = [[0, 0], [0.04, -0.03]];
  const tips = [];
  stems.forEach(([ox, oz], si) => {
    const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6, a = t * 3 + si * 2; pts.push([ox + Math.cos(a) * 0.035 * (1 - t * 0.3), top + t * H * (0.55 + si * 0.05), oz + Math.sin(a) * 0.035 * (1 - t * 0.3)]); }
    tube(f, 'wood', pts, (0.03 - si * 0.008) * s, bark, { tseg: 24, rs: 9 });
    const end = pts[pts.length - 1];
    for (let b = 0; b < 4; b++) {
      const a = b * TAU / 4 + si + r() * 0.6, L = (0.25 + r() * 0.2) * s * (o.spread || 1);
      const p1 = [end[0] + Math.cos(a) * L * 0.5, end[1] + L * 0.45, end[2] + Math.sin(a) * L * 0.5], p2 = [end[0] + Math.cos(a) * L, end[1] + L * (0.7 + r() * 0.4), end[2] + Math.sin(a) * L];
      tube(f, 'wood', [end, p1, p2], 0.011 * s, bark, { tseg: 10, rs: 7 });
      tips.push(p1, p2);
    }
  });
  // foliage: silver-green narrow leaves clustered around branch tips
  const cols = [0x7d8a6a, 0x8f9b7c, 0x6a7859, 0xa3ad92];
  const nL = o.leaves || 340;
  for (let i = 0; i < nL; i++) {
    const t = tips[(r() * tips.length) | 0], rr = (0.06 + r() * 0.16) * s * (o.spread || 1), a = r() * TAU, e = (r() - 0.3) * PI * 0.6;
    const p = [t[0] + Math.cos(a) * Math.cos(e) * rr, t[1] + Math.sin(e) * rr * 0.8, t[2] + Math.sin(a) * Math.cos(e) * rr];
    f.sph('leaf', 1, p, cols[i % 4], { ws: 5, hs: 3, sx: 0.034 * s, sy: 0.003, sz: 0.0075 * s, ry: r() * TAU, rz: (r() - 0.5) * 1.4, rx: (r() - 0.5) * 0.8 });
  }
  return { radius: 0.42 * s, height: top + H + 0.3 * s };
}

/** bouclé-style curved sofa (frame: back-centre at floor, facing +z). L chord length, R bend radius */
export function curvedSofa(E, f, o) {
  const L = o.len || 2.4, R = o.R || 2.4, d = o.d || 1.0, col = o.c || 0xf0ebe1, key = o.key || 'boucle';
  // plinth (recessed), seat, back — all bent around the same centre in front of the sofa
  soft(f, key, [L - 0.05, 0.16, d - 0.12], [0, 0.11, d / 2 + 0.03], col, { e1: 0.3, e2: 0.08, flat: 0.4, bend: R - (d / 2 + 0.03), nu: 56, nv: 12, noise: 0.003, seed: 2 });
  soft(f, key, [L + 0.04, 0.26, d - 0.18], [0, 0.32, d / 2 + 0.07], col, { e1: 0.42, e2: 0.1, flat: 0.5, sagTop: 0.02, bend: R - (d / 2 + 0.07), nu: 64, nv: 16, noise: 0.006, seed: 3 });
  soft(f, key, [L + 0.1, 0.56, 0.3], [0, 0.6, 0.15], col, { e1: 0.5, e2: 0.14, bend: R - 0.15, nu: 64, nv: 18, noise: 0.007, seed: 4, lean: 0 });
  // ends rolled
  for (const sgn of [-1, 1]) {
    const a = (sgn * (L / 2 + 0.02)) / (R - 0.4), x = (R - 0.4) * Math.sin(a), z = R - (R - 0.4) * Math.cos(a);
    soft(f, key, [0.24, 0.5, d - 0.25], [x, 0.4, z], col, { e1: 0.55, e2: 0.3, ry: -a, noise: 0.006, seed: 7 + sgn });
  }
  (o.pillows || []).forEach(([x, c, k, ry], i) => {
    const a = x / (R - 0.3), px = (R - 0.3) * Math.sin(a), pz = R - (R - 0.3) * Math.cos(a);
    soft(f, k || 'velvet', [0.5, 0.48, 0.16], [px, 0.68, pz], c, { e1: 0.6, e2: 0.25, pinch: 0.55, rx: -0.28, ry: -a + (ry || 0), rz: 0.06 * (i % 2 ? 1 : -1), noise: 0.006, seed: 11 + i });
  });
  if (o.throwC) { // knit throw over one end
    const a = (L / 2 - 0.35) / (R - 0.5), px = (R - 0.5) * Math.sin(a), pz = R - (R - 0.5) * Math.cos(a);
    soft(f, 'knit', [0.5, 0.03, d - 0.3], [px, 0.47, pz + 0.05], o.throwC, { e1: 0.3, e2: 0.1, ry: -a, noise: 0.008, seed: 21 });
    soft(f, 'knit', [0.5, 0.36, 0.03], [px, 0.3, pz + d / 2 - 0.08], o.throwC, { e1: 0.3, e2: 0.1, ry: -a, rx: 0.08, noise: 0.008, seed: 22 });
  }
  f.solid(E, [L + 0.2, 0.86, d], [0, 0.43, d / 2]);
}

/** cognac leather lounge chair with walnut frame (frame: centre at floor, facing +z) */
export function loungeChair(E, f, o = {}) {
  const lc = o.c || C.cognac;
  // walnut side frames (rounded slabs) + rear stretcher
  for (const s of [-1, 1]) {
    f.box('walnut', [0.045, 0.06, 0.82], [s * 0.36, 0.5, 0.0], 0xffffff, { r: 0.02, grain: 'h' });          // arm
    f.box('walnut', [0.045, 0.5, 0.06], [s * 0.36, 0.25, 0.33], 0xffffff, { r: 0.02 });                    // front leg
    f.box('walnut', [0.045, 0.62, 0.06], [s * 0.36, 0.31, -0.34], 0xffffff, { r: 0.02, rx: -0.18 });       // back leg
    f.box('walnut', [0.045, 0.05, 0.7], [s * 0.36, 0.1, 0.0], 0xffffff, { r: 0.02 });                      // lower rail
  }
  f.box('walnut', [0.68, 0.05, 0.05], [0, 0.17, -0.33], 0xffffff, { r: 0.02 });
  // leather cushions
  soft(f, 'leather', [0.66, 0.16, 0.62], [0, 0.3, 0.04], lc, { e1: 0.35, e2: 0.1, flat: 0.5, sagTop: 0.02, noise: 0.004, seed: 31 });
  soft(f, 'leather', [0.64, 0.58, 0.16], [0, 0.66, -0.3], lc, { e1: 0.45, e2: 0.12, rx: -0.32, noise: 0.005, seed: 32 });
  soft(f, 'leather', [0.5, 0.16, 0.14], [0, 0.98, -0.42], lc, { e1: 0.6, e2: 0.3, rx: -0.32, noise: 0.004, seed: 33 });
  // leather straps under seat
  for (const z of [-0.15, 0.1]) f.box('leather', [0.68, 0.012, 0.05], [0, 0.215, z], 0x6b3a1c, { r: 0.004 });
  f.solid(E, [0.8, 0.9, 0.85], [0, 0.45, 0]);
}
