// interior-lib.js — shared helpers for the INTERIOR module (materials, batching, animation, sound, interactive parts)
// three.js r160. All geometry is authored in WORLD coordinates through "Frames" (local furniture frames → world matrix).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE };
export const PI = Math.PI;
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// facing → rotation about y so that local +z points that way
export const FACE = { '+z': 0, '-z': PI, '+x': PI / 2, '-x': -PI / 2 };

// ------------------------------------------------------------------ textures
function mkCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
export function canvasTex(w, h, draw, { srgb = true, wrap = true, aniso = 4 } = {}) {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d');
  try { draw(g, w, h, c); } catch (e) { console.warn('[interior] texture draw failed', e); }
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function woodDraw(g, w, h) {
  const r = rng(7);
  g.fillStyle = '#e9d5b8'; g.fillRect(0, 0, w, h);
  // broad tone bands
  for (let i = 0; i < 18; i++) {
    const x = r() * w, bw = 10 + r() * 40;
    g.fillStyle = `rgba(${150 + r() * 40 | 0},${105 + r() * 30 | 0},${60 + r() * 20 | 0},${0.05 + r() * 0.08})`;
    g.fillRect(x, 0, bw, h);
  }
  // grain lines
  for (let i = 0; i < 170; i++) {
    let x = r() * w; const amp = 1 + r() * 5, fr = 0.004 + r() * 0.02, ph = r() * 6.28;
    g.strokeStyle = `rgba(${95 + r() * 40 | 0},${60 + r() * 25 | 0},${30 + r() * 15 | 0},${0.05 + r() * 0.17})`;
    g.lineWidth = 0.5 + r() * 2.2;
    g.beginPath();
    for (let y = 0; y <= h; y += 8) {
      const xx = x + Math.sin(y * fr + ph) * amp + Math.sin(y * 0.05 + ph * 2) * 0.6;
      if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y);
    }
    g.stroke();
  }
  // tiny pores
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(80,50,25,${0.05 + r() * 0.1})`;
    g.fillRect(r() * w, r() * h, 1, 2 + r() * 4);
  }
}

function fabricDraw(g, w, h) {
  const img = g.createImageData(w, h); const d = img.data; const r = rng(3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const weave = ((x >> 1) + (y >> 1)) % 2 ? 7 : -7;
    const v = clamp(226 + weave + (r() - 0.5) * 22, 0, 255);
    const i = (y * w + x) * 4; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

function quartzDraw(g, w, h) {
  const r = rng(11);
  g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4200; i++) {
    const s = r() < 0.9 ? 1 : 2;
    g.fillStyle = `rgba(${120 + r() * 60 | 0},${120 + r() * 60 | 0},${125 + r() * 60 | 0},${0.15 + r() * 0.35})`;
    g.fillRect(r() * w, r() * h, s, s);
  }
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = `rgba(150,150,155,${0.08 + r() * 0.1})`; g.lineWidth = 1 + r() * 2;
    g.beginPath(); g.moveTo(r() * w, 0);
    g.bezierCurveTo(r() * w, h * 0.3, r() * w, h * 0.6, r() * w, h); g.stroke();
  }
}

function tileDraw(g, w, h) {
  // 512px = 0.6 m. subway 0.15 x 0.075 m => 128 x 64 px running bond
  g.fillStyle = '#c9c7c2'; g.fillRect(0, 0, w, h);
  const r = rng(5);
  const tw = 128, th = 64, gr = 3;
  for (let row = 0; row < h / th; row++) {
    const off = (row % 2) * tw / 2;
    for (let col = -1; col < w / tw + 1; col++) {
      const x = col * tw + off, y = row * th;
      const v = 244 + (r() * 8 | 0);
      const grd = g.createLinearGradient(x, y, x, y + th);
      grd.addColorStop(0, `rgb(${v},${v},${v - 2})`);
      grd.addColorStop(0.5, `rgb(${v - 4},${v - 4},${v - 6})`);
      grd.addColorStop(1, `rgb(${v - 10},${v - 10},${v - 12})`);
      g.fillStyle = grd;
      g.fillRect(x + gr / 2, y + gr / 2, tw - gr, th - gr);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x + gr / 2 + 2, y + gr / 2 + 1, tw - gr - 4, 2);
    }
  }
}

function brushedDraw(g, w, h) {
  const r = rng(9);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const y = r() * h, v = 190 + r() * 60 | 0;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.fillRect(0, y, w, 1);
  }
}

function artDraw(g, w, h) {
  // 4x2 atlas of abstract canvases, 256 each
  const pals = [
    ['#e9e2d4', '#c96f4a', '#2f4858', '#d9a441', '#86a39a'],
    ['#f1ece4', '#1f3a5f', '#4f7ca8', '#c8d6e5', '#e3b448'],
    ['#efe9df', '#7b8f6a', '#3e4a3d', '#c7b199', '#a45a3c'],
    ['#ebe5dc', '#b8857a', '#5c4a72', '#e2c2b3', '#2d2a32'],
    ['#f3efe6', '#253237', '#5c6b73', '#9db4c0', '#c2dfe3'],
    ['#efe6d8', '#d1495b', '#edae49', '#00798c', '#30638e'],
    ['#ece7df', '#a3b18a', '#588157', '#3a5a40', '#dad7cd'],
    ['#f2ede6', '#8d5a44', '#cfa078', '#3b3a36', '#e8d8c3'],
  ];
  const r = rng(21);
  for (let k = 0; k < 8; k++) {
    const ox = (k % 4) * 256, oy = (k >> 2) * 256, p = pals[k];
    g.save(); g.beginPath(); g.rect(ox, oy, 256, 256); g.clip();
    g.fillStyle = p[0]; g.fillRect(ox, oy, 256, 256);
    const style = k % 3;
    for (let i = 0; i < 9; i++) {
      g.globalAlpha = 0.55 + r() * 0.4;
      g.fillStyle = p[1 + (i % 4)];
      if (style === 0) { g.beginPath(); g.arc(ox + r() * 256, oy + r() * 256, 20 + r() * 80, 0, PI * 2); g.fill(); }
      else if (style === 1) { g.fillRect(ox + r() * 200, oy + r() * 200, 30 + r() * 120, 12 + r() * 90); }
      else {
        g.beginPath(); g.moveTo(ox + r() * 256, oy + r() * 256);
        g.bezierCurveTo(ox + r() * 256, oy + r() * 256, ox + r() * 256, oy + r() * 256, ox + r() * 256, oy + r() * 256);
        g.lineWidth = 8 + r() * 30; g.strokeStyle = p[1 + (i % 4)]; g.lineCap = 'round'; g.stroke();
      }
    }
    g.globalAlpha = 0.08; // canvas texture
    for (let i = 0; i < 400; i++) { g.fillStyle = r() < 0.5 ? '#000' : '#fff'; g.fillRect(ox + r() * 256, oy + r() * 256, 2, 2); }
    g.globalAlpha = 1; g.restore();
  }
}

function swirlDraw(g, w, h) {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  for (let a = 0; a < 6; a++) {
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3;
    g.beginPath();
    for (let t = 0; t < 1; t += 0.02) {
      const ang = a * PI / 3 + t * 4.5, rad = 6 + t * (w / 2 - 10);
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
      if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
}

function grilleDraw(g, w, h) {
  g.fillStyle = '#b89a6a'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 2) { g.fillStyle = x % 4 ? 'rgba(90,60,30,0.35)' : 'rgba(255,230,180,0.25)'; g.fillRect(x, 0, 1, h); }
  for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? 'rgba(90,60,30,0.3)' : 'rgba(255,230,180,0.2)'; g.fillRect(0, y, w, 1); }
  for (let x = 6; x < w; x += 16) { g.fillStyle = 'rgba(214,180,90,0.55)'; g.fillRect(x, 0, 2, h); }
}

// ------------------------------------------------------------------ materials
export function makeMaterials(quality) {
  const small = quality === 'low';
  const T = {
    wood: canvasTex(small ? 256 : 512, small ? 256 : 512, woodDraw),
    fabric: canvasTex(256, 256, fabricDraw),
    quartz: canvasTex(small ? 256 : 512, small ? 256 : 512, quartzDraw),
    tile: canvasTex(512, 512, tileDraw),
    brushed: canvasTex(256, 256, brushedDraw),
    art: canvasTex(1024, 512, artDraw, { wrap: false }),
    swirl: canvasTex(128, 128, swirlDraw, { wrap: false }),
    grille: canvasTex(128, 128, grilleDraw),
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    paint: std({ vertexColors: true, roughness: 0.42, metalness: 0 }),
    matte: std({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    gloss: std({ vertexColors: true, roughness: 0.1, metalness: 0, side: THREE.DoubleSide }),
    plastic: std({ vertexColors: true, roughness: 0.38, metalness: 0 }),
    metal: std({ vertexColors: true, roughness: 0.2, metalness: 1, side: THREE.DoubleSide }),
    steel: std({ vertexColors: true, roughness: 0.32, metalness: 1, map: T.brushed }),
    satin: std({ vertexColors: true, roughness: 0.48, metalness: 0.45 }),
    wood: std({ vertexColors: true, roughness: 0.6, metalness: 0, map: T.wood }),
    woodGloss: std({ vertexColors: true, roughness: 0.25, metalness: 0, map: T.wood }),
    fabric: std({ vertexColors: true, roughness: 0.96, metalness: 0, map: T.fabric }),
    felt: std({ vertexColors: true, roughness: 1, metalness: 0, map: T.fabric }),
    quartz: std({ vertexColors: true, roughness: 0.14, metalness: 0, map: T.quartz }),
    tile: std({ vertexColors: true, roughness: 0.22, metalness: 0, map: T.tile }),
    leaf: std({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
    food: std({ vertexColors: true, roughness: 0.45, metalness: 0 }),
    art: std({ map: T.art, roughness: 0.85, metalness: 0 }),
    grille: std({ map: T.grille, roughness: 0.95, metalness: 0 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xeaf6f6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    glassC: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false }),
    water: new THREE.MeshPhysicalMaterial({ color: 0xa9cfdc, roughness: 0.03, metalness: 0.05, transparent: true, opacity: 0.5, depthWrite: false }),
    mirror: std({ color: 0xffffff, roughness: 0.02, metalness: 1 }),
    led: std({ vertexColors: true, color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 1.2, roughness: 0.5 }),
    rubber: std({ vertexColors: true, roughness: 0.8, metalness: 0 }),
    screenOff: std({ color: 0x050607, roughness: 0.08, metalness: 0.2 }),
  };
  M.art.map.wrapS = M.art.map.wrapT = THREE.ClampToEdgeWrapping;
  M._T = T;
  return M;
}

// V2: flat-colour keys that render through the 'duo' slot atlas (fewer draw calls) — enabled once upgradeMaterials created M.duo
export const KEY_ALIAS = {};
// UV scale per material key (box projection, meters → uv)
export const UVS = { wood: 1.6, woodGloss: 1.6, fabric: 4, felt: 3, quartz: 0.9, tile: 1 / 0.6, steel: 2 };

// ------------------------------------------------------------------ batching
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _c = new THREE.Color();
export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

function boxUV(g, s, grain) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) { u = p.getZ(i); v = p.getY(i); }
    else if (ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    if (grain === 'h') { const t = u; u = v; v = t; }
    uv.setXY(i, u * s, v * s);
  }
  uv.needsUpdate = true;
}

function prepGeo(geo, key, color, o) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  _c.set(color === undefined || color === null ? 0xffffff : color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.morphAttributes = {};
  g.clearGroups();
  geo.dispose && geo.dispose();
  return g;
}

export class Batch {
  constructor() { this.parts = new Map(); this.root = new Frame(this, new THREE.Matrix4()); }
  push(key, g) { if (!this.parts.has(key)) this.parts.set(key, []); this.parts.get(key).push(g); }
  build(parent, M, { shadow = true, receive = true, name = '' } = {}) {
    const out = [];
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      let geo = null;
      try { geo = list.length === 1 ? list[0] : mergeGeometries(list, false); } catch (e) { geo = null; }
      if (!geo) { console.warn('[interior] merge failed', name, key); continue; }
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mat = (typeof key === 'string') ? (M[key] || M.paint) : key;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name + ':' + (typeof key === 'string' ? key : (mat.name || 'mat'));
      mesh.castShadow = shadow && !mat.transparent;
      mesh.receiveShadow = receive;
      parent.add(mesh); out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

export class Frame {
  constructor(batch, m) { this.b = batch; this.m = m || new THREE.Matrix4(); }
  sub(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { return new Frame(this.b, this.m.clone().multiply(mat4(x, y, z, rx, ry, rz))); }
  withBatch(b) { return new Frame(b, this.m.clone()); }
  local(pos = [0, 0, 0], o = {}) {
    return this.m.clone().multiply(mat4(pos[0], pos[1], pos[2], o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1));
  }
  add(key, geo, pos = [0, 0, 0], color, o = {}) {
    if (typeof key === 'string' && KEY_ALIAS[key] !== undefined && this.b.alias !== false) { // V2: fold flat-colour keys into the slot atlas
      const al = KEY_ALIAS[key];
      if (typeof al === 'number') { o = o.slot === undefined ? { ...o, slot: al } : o; key = 'duo'; } else key = al;
    }
    const g = prepGeo(geo, key, color, o);
    g.applyMatrix4(this.local(pos, o));
    if (o.slot !== undefined || key === 'duo') { // material-slot atlas (metalness/roughness per part, one draw call)
      const uv = g.attributes.uv, su = ((o.slot || 0) + 0.5) / 8;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, su, 0.5);
      uv.needsUpdate = true;
    } else {
      const sc = o.uvScale !== undefined ? o.uvScale : (typeof key === 'string' ? UVS[key] : undefined);
      if (sc && o.uv !== 'keep') boxUV(g, sc, o.grain);
    }
    this.b.push(key, g);
    return g;
  }
  box(key, size, pos, color, o = {}) {
    const [w, h, d] = size;
    const mn = Math.min(w, h, d);
    let r = o.r !== undefined ? o.r : Math.min(0.005, mn * 0.25);
    r = Math.min(r, mn / 2 - 0.0004);
    const geo = r > 0.0006 ? new RoundedBoxGeometry(w, h, d, o.seg || 2, r) : new THREE.BoxGeometry(w, h, d);
    return this.add(key, geo, pos, color, o);
  }
  cyl(key, rt, rb, h, pos, color, o = {}) {
    return this.add(key, new THREE.CylinderGeometry(rt, rb, h, o.seg || 24, o.hseg || 1, !!o.open, o.ts || 0, o.tl || PI * 2), pos, color, o);
  }
  sph(key, r, pos, color, o = {}) {
    return this.add(key, new THREE.SphereGeometry(r, o.ws || 20, o.hs || 14, 0, PI * 2, o.t0 || 0, o.tl || PI), pos, color, o);
  }
  lathe(key, pts, pos, color, o = {}) {
    return this.add(key, new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), o.seg || 32), pos, color, o);
  }
  torus(key, R, r, pos, color, o = {}) {
    return this.add(key, new THREE.TorusGeometry(R, r, o.rs || 8, o.ts || 32, o.arc || PI * 2), pos, color, o);
  }
  // horizontal slab from a 2D outline in (x, z) with optional holes. Top at y = top, thickness t.
  slab(key, outline, holes, top, t, color, o = {}) {
    const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const h of holes || []) sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevel || 0, bevelSegments: 2, curveSegments: o.curve || 16 });
    geo.rotateX(-PI / 2); // shape y → -z, extrude +z → +y
    geo.translate(0, top - t, 0);
    return this.add(key, geo, [0, 0, 0], color, o);
  }
  // vertical plate from a 2D outline in (u = local x, v = local y) at local z = z0, thickness t (toward -z)
  plate(key, outline, holes, z0, t, color, o = {}) {
    const sh = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
    for (const h of holes || []) {
      const p = new THREE.Path();
      if (h.circle) p.absarc(h.circle[0], h.circle[1], h.circle[2], 0, PI * 2, false);
      else h.forEach(([u, v], i) => (i ? p.lineTo(u, v) : p.moveTo(u, v)));
      sh.holes.push(p);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: o.curve || 24 });
    geo.translate(0, 0, z0 - t);
    return this.add(key, geo, [0, 0, 0], color, o);
  }
  pt(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.m); }
  dir(x, y, z) { return new THREE.Vector3(x, y, z).transformDirection(this.m); }
  place(obj, pos = [0, 0, 0], o = {}) { this.local(pos, o).decompose(obj.position, obj.quaternion, obj.scale); return obj; }
  solid(E, size, pos) {
    const [w, h, d] = size, [x, y, z] = pos, b = new THREE.Box3();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
      b.expandByPoint(new THREE.Vector3(x + sx * w / 2, y + sy * h / 2, z + sz * d / 2).applyMatrix4(this.m));
    E.collider(b);
    return b;
  }
}

// quick standalone mesh from a mini-batch
export function meshOf(M, parent, fn, opts) {
  const b = new Batch(); fn(b.root); return b.build(parent, M, opts);
}

// ------------------------------------------------------------------ animation
const EASE = {
  lin: (t) => t,
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  soft: (t) => 1 - Math.pow(1 - t, 4),
};
export class Anim {
  constructor() { this.tw = []; this.ticks = []; this.t = 0; }
  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1); this.t += dt;
    for (let i = this.tw.length - 1; i >= 0; i--) {
      const w = this.tw[i];
      w.e += dt; const k = Math.min(1, w.e / w.d);
      w.o[w.p] = w.a + (w.b - w.a) * (EASE[w.ease] || EASE.io)(k);
      if (k >= 1) { this.tw.splice(i, 1); w.res(); }
    }
    for (let i = this.ticks.length - 1; i >= 0; i--) {
      try { if (this.ticks[i](dt, this.t) === false) this.ticks.splice(i, 1); }
      catch (e) { console.warn('[interior] tick error', e); this.ticks.splice(i, 1); }
    }
  }
  to(o, p, b, d = 0.4, ease = 'io') {
    for (let i = this.tw.length - 1; i >= 0; i--) if (this.tw[i].o === o && this.tw[i].p === p) { const w = this.tw[i]; this.tw.splice(i, 1); w.res(); }
    return new Promise((res) => {
      if (d <= 0) { o[p] = b; res(); return; }
      this.tw.push({ o, p, a: o[p], b, d, e: 0, ease, res });
    });
  }
  tick(fn) { this.ticks.push(fn); return () => { const i = this.ticks.indexOf(fn); if (i >= 0) this.ticks.splice(i, 1); }; }
  wait(s) { return new Promise((res) => { let e = 0; this.tick((dt) => { e += dt; if (e >= s) { res(); return false; } }); }); }
}

// ------------------------------------------------------------------ sound (procedural WebAudio)
export class Snd {
  constructor(ctx) { this.A = ctx.audio || null; this.camera = ctx.camera; this.loops = new Set(); this._buf = null; this._cam = new THREE.Vector3(); this._p = new THREE.Vector3(); }
  get ac() { try { return (this.A && this.A.ctx) || null; } catch (e) { return null; } }
  get out() { let m = null; try { m = this.A && this.A.master; } catch (e) { m = null; } const ac = this.ac; return m || (ac ? ac.destination : null); }
  listener() { try { this.camera.getWorldPosition(this._cam); } catch (e) { } return this._cam; }
  att(pos, ref = 2.2) { if (!pos) return 1; const d = pos.distanceTo(this.listener()); return 1 / (1 + (d * d) / (ref * ref)); }
  posOf(obj) {
    if (!obj) return null; if (obj.isVector3) return obj;
    if (obj.userData && obj.userData._sndPos) return obj.userData._sndPos;
    obj.getWorldPosition(this._p);
    if (this._p.lengthSq() < 1e-4) { // world-space group at origin: use bounds centre (cached; static objects)
      try { const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()); obj.userData._sndPos = c; return c; } catch (e) { }
    }
    return this._p.clone();
  }
  noise(ac) {
    if (this._buf && this._bufCtx === ac) return this._buf;
    const len = ac.sampleRate * 2, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._buf = b; this._bufCtx = ac; return b;
  }
  // one-shot noise burst
  burst(src, { dur = 0.08, type = 'bandpass', freq = 1500, freqEnd, q = 1, vol = 0.3, attack = 0.002, delay = 0 } = {}) {
    const ac = this.ac; if (!ac) return;
    try {
      const t = ac.currentTime + delay, g = ac.createGain(), f = ac.createBiquadFilter(), s = ac.createBufferSource();
      s.buffer = this.noise(ac); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
      const v = vol * this.att(this.posOf(src));
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.out || ac.destination);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    } catch (e) { }
  }
  tone(src, { freq = 440, freqEnd, dur = 0.15, type = 'sine', vol = 0.2, attack = 0.004, delay = 0 } = {}) {
    const ac = this.ac; if (!ac) return;
    try {
      const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
      const v = vol * this.att(this.posOf(src));
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.out || ac.destination); o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { }
  }
  click(s, v = 1) { this.burst(s, { dur: 0.025, type: 'highpass', freq: 2500, vol: 0.25 * v }); this.tone(s, { freq: 900, freqEnd: 400, dur: 0.03, vol: 0.06 * v }); }
  thud(s, v = 1) { this.burst(s, { dur: 0.09, type: 'lowpass', freq: 600, vol: 0.35 * v }); this.tone(s, { freq: 140, freqEnd: 70, dur: 0.12, vol: 0.18 * v }); }
  softClose(s) { this.burst(s, { dur: 0.12, type: 'lowpass', freq: 500, vol: 0.22, attack: 0.03 }); this.tone(s, { freq: 110, freqEnd: 70, dur: 0.14, vol: 0.12, attack: 0.02 }); }
  slide(s, dur = 0.35, v = 1) { this.burst(s, { dur, type: 'bandpass', freq: 900, freqEnd: 600, q: 0.8, vol: 0.12 * v, attack: 0.05 }); }
  hinge(s) { this.burst(s, { dur: 0.25, type: 'bandpass', freq: 1800, freqEnd: 2600, q: 6, vol: 0.05, attack: 0.05 }); }
  chop(s) { this.burst(s, { dur: 0.05, type: 'bandpass', freq: 2200, q: 0.7, vol: 0.35 }); this.tone(s, { freq: 180, freqEnd: 80, dur: 0.07, vol: 0.25 }); }
  beep(s, n = 1) { for (let i = 0; i < n; i++) this.tone(s, { freq: 2000, dur: 0.12, type: 'square', vol: 0.05, delay: i * 0.22 }); }
  switchClick(s) { this.burst(s, { dur: 0.018, type: 'highpass', freq: 3000, vol: 0.3 }); this.tone(s, { freq: 1400, freqEnd: 600, dur: 0.02, vol: 0.08 }); }
  clack(s, v = 1) { this.tone(s, { freq: 2600 + Math.random() * 600, freqEnd: 1800, dur: 0.035, vol: 0.22 * v, attack: 0.001 }); this.burst(s, { dur: 0.015, type: 'highpass', freq: 4000, vol: 0.2 * v }); }

  // continuous sources. build(ac, dest) must return { stop(t) } and connect into dest.
  loop(src, build, vol = 0.4, ref = 2.5) {
    const self = this;
    const h = {
      playing: false, node: null, gain: null, vol, ref,
      start() {
        const ac = self.ac; if (!ac || h.playing) return;
        try {
          const g = ac.createGain(); g.gain.value = 0.0001; g.connect(self.out || ac.destination);
          h.gain = g; h.node = build(ac, g, self) || null; h.playing = true; self.loops.add(h);
          h.update(true);
        } catch (e) { console.warn('[interior] loop start', e); }
      },
      stop(fade = 0.25) {
        if (!h.playing) return; h.playing = false; self.loops.delete(h);
        const ac = self.ac, g = h.gain, n = h.node;
        try {
          const t = ac.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0.0001, t + fade);
          setTimeout(() => { try { n && n.stop && n.stop(); g.disconnect(); } catch (e) { } }, fade * 1000 + 120);
        } catch (e) { }
      },
      update(now) {
        const ac = self.ac; if (!ac || !h.gain) return;
        const v = h.vol * self.att(self.posOf(src), h.ref);
        try { h.gain.gain.setTargetAtTime(Math.max(0.0001, v), ac.currentTime, now ? 0.03 : 0.08); } catch (e) { }
      },
    };
    return h;
  }
  update() { for (const h of this.loops) h.update(); }
  // stock loop builders
  static noiseSrc(ac, snd) { const s = ac.createBufferSource(); s.buffer = snd.noise(ac); s.loop = true; s.start(0, Math.random()); return s; }
  water(src, kind = 'faucet') {
    return this.loop(src, (ac, dest, snd) => {
      const s = Snd.noiseSrc(ac, snd), f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(), g2 = ac.createGain();
      f1.type = 'bandpass'; f1.frequency.value = kind === 'shower' ? 2400 : 1200; f1.Q.value = 0.5;
      f2.type = 'lowpass'; f2.frequency.value = kind === 'shower' ? 7000 : 3800;
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 7.3; lg.gain.value = 0.15; lfo.connect(lg); lg.connect(g2.gain);
      g2.gain.value = 0.85; s.connect(f1); f1.connect(f2); f2.connect(g2); g2.connect(dest); lfo.start();
      return { stop() { try { s.stop(); lfo.stop(); } catch (e) { } } };
    }, kind === 'shower' ? 0.5 : 0.35);
  }
  hum(src, { freq = 60, noiseF = 400, vol = 0.2, wobble = 0 } = {}) {
    return this.loop(src, (ac, dest, snd) => {
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = freq;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq * 4; og.gain.value = 0.25;
      const s = Snd.noiseSrc(ac, snd), nf = ac.createBiquadFilter(), ng = ac.createGain(); nf.type = 'lowpass'; nf.frequency.value = noiseF; ng.gain.value = 0.6;
      o.connect(lp); lp.connect(og); og.connect(dest); s.connect(nf); nf.connect(ng); ng.connect(dest);
      let lfo = null;
      if (wobble) { lfo = ac.createOscillator(); const lg = ac.createGain(); lfo.frequency.value = wobble; lg.gain.value = 0.45; lfo.connect(lg); lg.connect(ng.gain); lfo.start(); }
      o.start();
      return { stop() { try { o.stop(); s.stop(); lfo && lfo.stop(); } catch (e) { } } };
    }, vol);
  }
}

// ------------------------------------------------------------------ interactive building blocks
// Shaker panel: occupies x∈[x0,x0+w], y∈[y0,y0+h], z∈[z0-t, z0]
export function shaker(f, key, x0, y0, w, h, t, color, o = {}) {
  const fw = o.frame || Math.min(0.068, w * 0.22, h * 0.22);
  const z = (o.z0 || 0);
  if (o.slab || h < 0.17 || w < 0.17) { f.box(key, [w, h, t], [x0 + w / 2, y0 + h / 2, z - t / 2], color, { r: 0.003 }); return; }
  f.box(key, [fw, h, t], [x0 + fw / 2, y0 + h / 2, z - t / 2], color, { r: 0.003 });
  f.box(key, [fw, h, t], [x0 + w - fw / 2, y0 + h / 2, z - t / 2], color, { r: 0.003 });
  f.box(key, [w - 2 * fw + 0.002, fw, t], [x0 + w / 2, y0 + fw / 2, z - t / 2], color, { r: 0.003 });
  f.box(key, [w - 2 * fw + 0.002, fw, t], [x0 + w / 2, y0 + h - fw / 2, z - t / 2], color, { r: 0.003 });
  if (o.glass) {
    f.withBatch(o.glassBatch || f.b).box('glass', [w - 2 * fw + 0.004, h - 2 * fw + 0.004, 0.004], [x0 + w / 2, y0 + h / 2, z - t * 0.6], 0xffffff, { r: 0 });
  } else {
    f.box(key, [w - 2 * fw + 0.004, h - 2 * fw + 0.004, t * 0.45], [x0 + w / 2, y0 + h / 2, z - t + t * 0.225], color, { r: 0.002 });
  }
}
// bar pull centered at (x,y) on front face at z0 (protrudes +z)
export function pull(f, key, x, y, z0, len, vertical, color = 0x1c1c1c, opt = {}) {
  const r = 0.0055, so = 0.03;
  if (vertical) {
    f.cyl(key, r, r, len, [x, y, z0 + so], color, { seg: 12, ...opt });
    f.cyl(key, 0.0045, 0.0045, so, [x, y - len / 2 + 0.012, z0 + so / 2], color, { seg: 8, rx: PI / 2, ...opt });
    f.cyl(key, 0.0045, 0.0045, so, [x, y + len / 2 - 0.012, z0 + so / 2], color, { seg: 8, rx: PI / 2, ...opt });
  } else {
    f.cyl(key, r, r, len, [x, y, z0 + so], color, { seg: 12, rz: PI / 2, ...opt });
    f.cyl(key, 0.0045, 0.0045, so, [x - len / 2 + 0.012, y, z0 + so / 2], color, { seg: 8, rx: PI / 2, ...opt });
    f.cyl(key, 0.0045, 0.0045, so, [x + len / 2 - 0.012, y, z0 + so / 2], color, { seg: 8, rx: PI / 2, ...opt });
  }
}
export function knob(f, key, x, y, z0, color = 0x1c1c1c, r = 0.014, opt = {}) {
  f.cyl(key, 0.006, 0.008, 0.022, [x, y, z0 + 0.011], color, { seg: 12, rx: PI / 2, ...opt });
  f.sph(key, r, [x, y, z0 + 0.026], color, { ws: 14, hs: 10, sz: 0.7, ...opt });
}

/** Hinged part. F = furniture frame. o:
 *  pos: hinge point in F-local coords (on the hinge axis, at bottom for L/R, at the hinge line for B/T)
 *  hinge: 'L' (panel extends +x from hinge, opens toward +z), 'R' (extends -x), 'B' (drop-down, panel extends +y), 'T' (lift-up)
 *  angle, dur, draw(f, pivot) → draws panel in pivot coords, labels [open, close], snd: 'cab'|'heavy'|'glass'|'none'
 */
export function hinged(E, parent, F, o) {
  const mount = new THREE.Group(); F.place(mount, o.pos || [0, 0, 0], { ry: o.ry || 0 }); parent.add(mount);
  const pivot = new THREE.Group(); mount.add(pivot);
  const b = new Batch(); o.draw(b.root, pivot); b.build(pivot, E.M, { shadow: o.shadow !== false });
  const h = o.hinge || 'L';
  const prop = (h === 'B' || h === 'T') ? 'x' : 'y';
  const ang = o.angle !== undefined ? o.angle : 1.75;
  const target = h === 'L' ? -ang : h === 'R' ? ang : h === 'B' ? ang : -ang;
  const st = { open: false, busy: false, pivot, mount, locked: null };
  const labels = o.labels || ['פתח ארון', 'סגור ארון'];
  st.set = async (open, quiet) => {
    if (st.open === open) return;
    st.open = open;
    if (o.onBefore) o.onBefore(open);
    const snd = o.snd || 'cab';
    if (!quiet && snd !== 'none') { if (open) { E.snd.click(pivot, 0.6); if (snd === 'heavy') E.snd.hinge(pivot); } }
    await E.anim.to(pivot.rotation, prop, open ? target : 0, o.dur || (snd === 'heavy' ? 0.7 : 0.45), open ? 'out' : 'io');
    if (!open && !quiet && snd !== 'none') { if (snd === 'heavy') E.snd.thud(pivot, 0.8); else E.snd.softClose(pivot); }
    if (o.onChange) o.onChange(open);
  };
  st.toggle = () => {
    if (st.locked && st.locked()) { E.snd.click(pivot, 0.4); return; }
    st.set(!st.open);
  };
  if (o.interactive !== false) E.interact(o.target || pivot, () => (st.locked && st.locked()) ? (st.lockedLabel || o.lockedLabel || 'נעול') : (st.open ? labels[1] : labels[0]), () => st.toggle());
  return st;
}

/** Sliding drawer. F frame; o.pos = front-face center (F-local, z = front face), w,h front size, t thickness,
 *  depth (box depth), draw(f) for the front (optional; default shaker), contents(f) inside (y from box bottom), slide */
export function drawer(E, parent, F, o) {
  const mount = new THREE.Group(); F.place(mount, o.pos, { ry: o.ry || 0 }); parent.add(mount);
  const slider = new THREE.Group(); mount.add(slider);
  const b = new Batch(); const f = b.root;
  const w = o.w, h = o.h, t = o.t || 0.02, key = o.key || 'paint', col = o.color !== undefined ? o.color : 0xf3f2ee;
  if (o.draw) o.draw(f); else {
    shaker(f, key, -w / 2, -h / 2, w, h, t, col, { slab: o.slab });
    if (o.handle !== false) pull(f, o.hkey || key, 0, o.handleY || 0, 0, Math.min(0.2, w * 0.45), false, o.hcol || 0x1c1c1c, o.hopt || {});
  }
  // drawer box
  const bw = w - (o.boxInset || 0.07), bh = Math.min(o.boxH || h * 0.75, h - 0.02), d = o.depth || 0.45;
  const bk = o.boxKey || key, bc = o.boxColor !== undefined ? o.boxColor : 0xd9c4a5;
  const y0 = -h / 2 + 0.012, zb = -t;
  f.box(bk, [0.012, bh, d], [-bw / 2 + 0.006, y0 + bh / 2, zb - d / 2], bc, { r: 0.002 });
  f.box(bk, [0.012, bh, d], [bw / 2 - 0.006, y0 + bh / 2, zb - d / 2], bc, { r: 0.002 });
  f.box(bk, [bw, bh, 0.012], [0, y0 + bh / 2, zb - d + 0.006], bc, { r: 0.002 });
  f.box(bk, [bw - 0.01, 0.008, d - 0.01], [0, y0 + 0.004, zb - d / 2], bc, { r: 0 });
  // contents live in their own child group that is hidden while the drawer is shut (saves draw calls)
  const cb = new Batch();
  if (o.contents) { try { o.contents(new Frame(cb, f.m.clone()).sub(0, y0 + 0.008, zb - d / 2), bw - 0.03, d - 0.03, bh); } catch (e) { console.warn('[interior] drawer contents', e); } }
  b.build(slider, E.M, { shadow: o.shadow !== false });
  let cg = null;
  if (cb.parts.size) { cg = new THREE.Group(); cg.name = 'drawer-contents'; slider.add(cg); cb.build(cg, E.M, { shadow: false }); cg.visible = false; }
  const st = { open: false, slider, mount };
  const dist = o.slide || d * 0.8;
  st.set = async (open, quiet) => {
    if (st.open === open) return; st.open = open;
    if (open && cg) cg.visible = true;
    if (!quiet) E.snd.slide(slider, 0.3);
    await E.anim.to(slider.position, 'z', open ? dist : 0, o.dur || 0.45, open ? 'out' : 'io');
    if (!open && !quiet) E.snd.softClose(slider);
    if (!st.open && cg) cg.visible = false;
  };
  st.toggle = () => st.set(!st.open);
  const labels = o.labels || ['פתח מגירה', 'סגור מגירה'];
  if (o.interactive !== false) E.interact(slider, () => (st.open ? labels[1] : labels[0]), () => st.toggle());
  return st;
}

/** Water fixture: faucet / shower. o: target(Object3D for interaction), lever{obj, prop, on, off}, from (world V3), dir (world V3),
 *  streamLen, stream:true|false, basin {mesh, bottom(world y), max}, kind 'faucet'|'shower', labels */
export function waterFixture(E, group, o) {
  const st = { on: false, level: 0, h: null };
  const from = o.from.clone(), dir = (o.dir || V3(0, -1, 0)).clone().normalize();
  let stream = null;
  if (o.stream !== false) {
    const r = o.streamR || 0.0055;
    const geo = new THREE.CylinderGeometry(r * 0.8, r, 1, 10, 1, true); geo.translate(0, -0.5, 0);
    stream = new THREE.Mesh(geo, E.M.water); stream.position.copy(from); stream.visible = false; stream.scale.y = 0.001;
    stream.renderOrder = 2;
    group.add(stream);
  }
  let spray = null;
  if (o.kind === 'shower') {
    const geo = new THREE.CylinderGeometry(0.06, o.sprayR || 0.22, 1, 18, 1, true); geo.translate(0, -0.5, 0);
    const m = E.M.water.clone(); m.opacity = 0.09; m.side = THREE.DoubleSide;
    spray = new THREE.Mesh(geo, m); spray.position.copy(from); spray.visible = false;
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, -1, 0), dir); spray.quaternion.copy(q);
    spray.scale.y = o.streamLen || 1.6; group.add(spray);
  }
  const loop = E.snd.water(o.target, o.kind === 'shower' ? 'shower' : 'faucet');
  const labels = o.labels || ['פתח ברז', 'סגור ברז'];
  const ensureParticles = () => {
    if (st.h || !E.ctx.particles || !E.ctx.particles.water) return;
    const popt = { rate: o.rate || (o.kind === 'shower' ? 260 : 90), spread: o.spread || (o.kind === 'shower' ? 0.35 : 0.03), speed: o.speed || (o.kind === 'shower' ? 2.0 : 1.0) };
    const fy = o.floorY !== undefined ? o.floorY : (o.basin ? o.basin.bottom : undefined);
    if (fy !== undefined) popt.floorY = fy;
    try { st.h = E.ctx.particles.water(from.clone(), dir.clone(), popt); } catch (e) { st.h = null; }
  };
  st.set = (on) => {
    st.on = on;
    if (on) ensureParticles();
    try { if (st.h) st.h.on = on; } catch (e) { }
    if (o.lever) E.anim.to(o.lever.obj.rotation, o.lever.prop, on ? o.lever.on : o.lever.off, 0.3);
    E.snd.click(o.target, 0.5);
    if (on) loop.start(); else loop.stop(0.4);
    if (stream) stream.visible = on;
    if (spray) spray.visible = on;
    if (o.onChange) o.onChange(on);
  };
  E.interact(o.target, () => (st.on ? labels[1] : labels[0]), () => st.set(!st.on));
  const B = o.basin;
  E.anim.tick((dt, t) => {
    if (B) {
      if (st.on) st.level = Math.min(B.max, st.level + dt * (B.rate || 0.012));
      else st.level = Math.max(0, st.level - dt * (B.drain || 0.02));
      const lv = st.level;
      B.mesh.visible = lv > 0.002;
      B.mesh.scale.y = Math.max(0.001, lv);
      if (st.h && st.h.opts) st.h.opts.floorY = B.bottom + lv;
    }
    if (stream && st.on) {
      const endY = B ? B.bottom + st.level : (o.endY !== undefined ? o.endY : from.y - (o.streamLen || 0.3));
      const L = Math.max(0.01, from.y - endY);
      stream.scale.y = L;
      stream.scale.x = stream.scale.z = 1 + Math.sin(t * 40) * 0.08;
    }
    if (spray && st.on) spray.material.opacity = 0.07 + Math.sin(t * 23) * 0.02;
  });
  return st;
}

// basin water body: box with bottom at y = bottom (world), unit height scaled by level
export function basinWater(E, group, cx, cz, w, d, bottom, rot = 0) {
  const geo = new THREE.BoxGeometry(w, 1, d); geo.translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo, E.M.water); m.position.set(cx, bottom, cz); m.rotation.y = rot;
  m.visible = false; m.scale.y = 0.001; m.renderOrder = 1; group.add(m);
  return m;
}

// ------------------------------------------------------------------ decor helpers
export function plant(f, kind, pos, r, scale = 1) {
  const [x, y, z] = pos; const s = scale;
  const potC = [0xe8e4dc, 0x2b2b2b, 0xc77b4f, 0x6f7c84][Math.floor(r() * 4)];
  const ph = 0.22 * s, pr = 0.12 * s;
  f.lathe('gloss', [[0, 0], [pr * 0.78, 0], [pr * 0.86, 0.02 * s], [pr, ph * 0.95], [pr * 1.04, ph], [pr * 0.94, ph], [pr * 0.9, ph * 0.9], [0, ph * 0.9]], [x, y, z], potC, { seg: 24 });
  f.cyl('matte', pr * 0.9, pr * 0.9, 0.01, [x, y + ph * 0.88, z], 0x3a2a1e, { seg: 16 });
  const top = y + ph * 0.9;
  if (kind === 'fiddle') {
    for (let i = 0; i < 3; i++) {
      const sx = x + (r() - 0.5) * 0.06 * s, sz = z + (r() - 0.5) * 0.06 * s, sh = (0.7 + r() * 0.5) * s;
      f.cyl('wood', 0.008 * s, 0.011 * s, sh, [sx, top + sh / 2, sz], 0x6b4a32, { seg: 6 });
      const n = 7 + (r() * 4 | 0);
      for (let k = 0; k < n; k++) {
        const ly = top + sh * (0.35 + 0.65 * k / n), a = r() * PI * 2, ll = (0.09 + r() * 0.05) * s;
        f.sph('leaf', 1, [sx + Math.cos(a) * ll * 0.8, ly, sz + Math.sin(a) * ll * 0.8], [0x2f5d2a, 0x3b6e31, 0x284f24][k % 3],
          { ws: 8, hs: 6, sx: ll * 0.55, sy: 0.006, sz: ll, ry: -a + PI / 2, rx: -0.5 - r() * 0.4 });
      }
    }
  } else if (kind === 'snake') {
    for (let i = 0; i < 11; i++) {
      const a = r() * PI * 2, rr = r() * pr * 0.6, hh = (0.3 + r() * 0.3) * s;
      f.cyl('leaf', 0.002, 0.022 * s, hh, [x + Math.cos(a) * rr, top + hh / 2, z + Math.sin(a) * rr], [0x3f6b35, 0x52803f, 0x2d4f2a][i % 3],
        { seg: 4, sx: 1, sz: 0.25, ry: a, rx: (r() - 0.5) * 0.25, rz: (r() - 0.5) * 0.25 });
    }
  } else { // bushy (pothos / fern)
    for (let i = 0; i < 26; i++) {
      const a = r() * PI * 2, rr = r() * pr * 1.3, hh = top + r() * 0.16 * s;
      f.sph('leaf', 1, [x + Math.cos(a) * rr, hh, z + Math.sin(a) * rr], [0x3b7a35, 0x4c8c3f, 0x2f6a2c][i % 3],
        { ws: 7, hs: 5, sx: 0.035 * s, sy: 0.005, sz: 0.05 * s, ry: -a, rx: -0.3 - r() * 0.6 });
    }
  }
}

export function books(f, x0, x1, y, z, r, o = {}) {
  const cols = o.colors || [0x7a2e2a, 0x2e4a62, 0xd8cbb0, 0x3f5e45, 0x1f1f1f, 0xb7884a, 0x8c8c86, 0xe6e1d6, 0x4a3b5c, 0xa65e3a];
  let x = x0;
  while (x < x1 - 0.03) {
    const w = 0.018 + r() * 0.032, h = (o.hmin || 0.17) + r() * (o.hvar || 0.09), d = (o.d || 0.17) + r() * 0.04;
    if (x + w > x1) break;
    const lean = (r() < 0.06 && x > x0 + 0.1) ? 0.25 : 0;
    f.box('paint', [w, h, d], [x + w / 2, y + h / 2, z], cols[(r() * cols.length) | 0], { r: 0.002, rz: lean });
    x += w + 0.002 + (lean ? 0.04 : 0);
    if (r() < 0.08) x += 0.05 + r() * 0.08;
  }
}

// abstract art canvas with frame; cell 0..7 of atlas. Plane facing local +z at z (wall face)
export function art(f, cell, cx, cy, z, w, h, frameC = 0x1d1d1d) {
  const fw = 0.025, fd = 0.03;
  f.box('paint', [w + fw * 2, fw, fd], [cx, cy + h / 2 + fw / 2, z + fd / 2], frameC, { r: 0.003 });
  f.box('paint', [w + fw * 2, fw, fd], [cx, cy - h / 2 - fw / 2, z + fd / 2], frameC, { r: 0.003 });
  f.box('paint', [fw, h, fd], [cx - w / 2 - fw / 2, cy, z + fd / 2], frameC, { r: 0.003 });
  f.box('paint', [fw, h, fd], [cx + w / 2 + fw / 2, cy, z + fd / 2], frameC, { r: 0.003 });
  const g = new THREE.PlaneGeometry(w, h);
  const u0 = (cell % 4) / 4, v0 = 1 - ((cell >> 2) + 1) / 2;
  const uv = g.attributes.uv;
  // keep aspect: crop cell
  const ar = w / h; let du = 0.25, dv = 0.5;
  if (ar > 1) dv = 0.5 / ar; else du = 0.25 * ar;
  const cu = u0 + 0.125, cv = v0 + 0.25;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + (uv.getX(i) - 0.5) * du * 0.96, cv + (uv.getY(i) - 0.5) * dv * 0.96);
  f.add('art', g, [cx, cy, z + 0.012], 0xffffff, { uv: 'keep' });
}

// light switch plate (decora). Frame f: wall face at z=0 facing +z. Returns rocker object.
export function switchPlate(E, parent, F, pos) {
  const mount = new THREE.Group(); F.place(mount, [pos[0], pos[1], pos[2] + 0.009]); parent.add(mount);
  // V2: the static plate merges into the caller's room batch (F.b); an invisible hit plate keeps the click target size
  F.box('plastic', [0.07, 0.115, 0.008], [pos[0], pos[1], pos[2] + 0.004], 0xf6f5f1, { r: 0.003 });
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.115, 0.012), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.z = -0.003; mount.add(hit);
  const rocker = new THREE.Group(); mount.add(rocker);
  const rb = new Batch(); rb.root.box('plastic', [0.034, 0.066, 0.008], [0, 0, 0.003], 0xffffff, { r: 0.002 });
  rb.build(rocker, E.M, { shadow: false });
  return rocker; // rotate rocker.rotation.x (local); interact with rocker.parent
}

// ellipse helper for shapes
export function ellipsePts(cx, cy, rx, ry, n = 40, rev = false) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (rev ? -1 : 1) * i / n * PI * 2; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return p;
}
export function roundRectPts(x0, y0, x1, y1, r, n = 6) {
  const p = [];
  const arc = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + i / n * PI / 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(x1 - r, y0 + r, -PI / 2); arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, PI / 2); arc(x0 + r, y0 + r, PI);
  return p;
}
