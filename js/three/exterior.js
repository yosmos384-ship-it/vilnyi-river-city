// VILNYI RIVER CITY — exterior of blocks C3 & C4 (Agent B).
// Facades are generated from data.js (every unit's frame/width, the ground-floor blocks, the cores), merged into one
// mesh per material per building. Each vertex carries its floor band, unit index and a window seed, so hiding a floor
// (walkthrough), highlighting a floor or units, and lit windows at dusk are all shader uniforms — no rebuilds.
import * as THREE from 'three';
import {
  BUILDINGS, FOOTPRINT, UNITS, BLOCKS, CORES, TYPES, GEOM, LEVELS, TOP_FLOOR, ROOF_Y,
  floorY, localToWorld, unitsOn, blocksOn,
} from '../data.js';
import { SHARED, registerMaterial } from './environment.js';

const B_IDS = Object.keys(BUILDINGS);
const ROOF_BAND = 12;                                  // roof / crown: never hidden
const bandCode = (bId, band) => band + 100 * B_IDS.indexOf(bId);
const UNIT_INDEX = new Map(UNITS.map((u, i) => [u, i]));
const D = GEOM.unitDepth, BD = GEOM.balconyDepth;
const CORNICE = 1.75;
const RAIL_H = 1.05;

// Cinematic 3/4 view from the south-east: C3's main south facade in front, C4 behind, Lacul Morii and the sunset beyond.
export const DEFAULT_VIEW = { target: [60, 18, -24], position: [-250, 108, 84], fov: 36 };   // ≈ the developer aerial: from over Intrarea Guliver looking north (Faza I right, Faza III left)

// Floor band extents (world y) used by pick meshes, highlight and floorBandBox. Floor 10 includes the 10D upper level.
function bandY(floor) {
  if (floor === -1) return [floorY(-1), 0];
  if (floor === 0) return [0, LEVELS.groundH];
  if (floor >= TOP_FLOOR) return [floorY(TOP_FLOOR), ROOF_Y];
  return [floorY(floor), floorY(floor) + LEVELS.typicalH];
}

// Footprint offset outward by d (axis-aligned polygon → offset each edge along its outward normal, intersect neighbours)
function offsetPoly(poly, d) {
  let area = 0; for (let i = 0; i < poly.length; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length]; area += x0 * z1 - x1 * z0; }
  const s = area > 0 ? 1 : -1;       // area > 0 ⇔ clockwise in (x, z) seen from above → outward = (dz, -dx)
  const n = poly.length, lines = [];
  for (let i = 0; i < n; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0);
    const nx = s * (z1 - z0) / L, nz = -s * (x1 - x0) / L;
    lines.push({ p: [x0 + nx * d, z0 + nz * d], dir: [(x1 - x0) / L, (z1 - z0) / L], n: [nx, nz] });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const den = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0];
    if (Math.abs(den) < 1e-9) { out.push(b.p); continue; }
    const t = ((b.p[0] - a.p[0]) * b.dir[1] - (b.p[1] - a.p[1]) * b.dir[0]) / den;
    out.push([a.p[0] + a.dir[0] * t, a.p[1] + a.dir[1] * t]);
  }
  return { pts: out, outward: lines.map(l => l.n) };
}
const FP_OUT = offsetPoly(FOOTPRINT, 0).outward;          // outward normal per footprint edge
const FP_PICK = offsetPoly(FOOTPRINT, BD + 0.3).pts;

export function floorBandBox(bId, floor) {
  const [y0, y1] = bandY(floor);
  const box = new THREE.Box3();
  for (const [x, z] of FP_PICK) { const [wx, wz] = localToWorld(bId, x, z); box.expandByPoint(new THREE.Vector3(wx, y0, wz)); box.expandByPoint(new THREE.Vector3(wx, y1, wz)); }
  return box;
}

// ------------------------------------------------------------------ geometry buffer
class Buf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.a = []; this.i = []; }
  quad(q, n, uv, t) {
    let [a, b, c, d] = q;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) { [b, d] = [d, b]; uv = [uv[0], uv[3], uv[2], uv[1]]; }
    const k = this.p.length / 3;
    for (const v of [a, b, c, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.a.push(t.b, t.u, t.s); }
    for (const w of uv) this.uv.push(w[0], w[1]);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  geometry() {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aTag', new THREE.Float32BufferAttribute(this.a, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}
// point in a frame {o:[x,z], U:[x,z], V:[x,z]} at (u, y, v)
const P = (F, u, y, v) => [F.o[0] + F.U[0] * u + F.V[0] * v, y, F.o[1] + F.U[1] * u + F.V[1] * v];
// Axis box in a frame. faces: 'U' +u, 'u' -u, 'Y' +y, 'y' -y, 'V' +v, 'v' -v. UVs are metres from the box corner.
function box(buf, F, u0, u1, y0, y1, v0, v1, t, faces = 'uUyYvV') {
  const U3 = [F.U[0], 0, F.U[1]], V3 = [F.V[0], 0, F.V[1]], neg = a => [-a[0], -a[1], -a[2]];
  const du = u1 - u0, dy = y1 - y0, dv = v1 - v0;
  for (const f of faces) {
    if (f === 'U' || f === 'u') { const u = f === 'U' ? u1 : u0; buf.quad([P(F, u, y0, v0), P(F, u, y0, v1), P(F, u, y1, v1), P(F, u, y1, v0)], f === 'U' ? U3 : neg(U3), [[0, 0], [dv, 0], [dv, dy], [0, dy]], t); }
    if (f === 'V' || f === 'v') { const v = f === 'V' ? v1 : v0; buf.quad([P(F, u0, y0, v), P(F, u1, y0, v), P(F, u1, y1, v), P(F, u0, y1, v)], f === 'V' ? V3 : neg(V3), [[0, 0], [du, 0], [du, dy], [0, dy]], t); }
    if (f === 'Y' || f === 'y') { const y = f === 'Y' ? y1 : y0; buf.quad([P(F, u0, y, v0), P(F, u1, y, v0), P(F, u1, y, v1), P(F, u0, y, v1)], [0, f === 'Y' ? 1 : -1, 0], [[0, 0], [du, 0], [du, dv], [0, dv]], t); }
  }
}
// glass pane facing +v at plane v, uv 0..1
function pane(buf, F, u0, u1, y0, y1, v, t) {
  buf.quad([P(F, u0, y0, v), P(F, u1, y0, v), P(F, u1, y1, v), P(F, u0, y1, v)], [F.V[0], 0, F.V[1]], [[0, 0], [1, 0], [1, 1], [0, 1]], t);
}

// ------------------------------------------------------------------ materials
const GLSL_EXT_HEAD = /* glsl */`
uniform vec4 uHideB; uniform vec4 uHideU; uniform vec2 uHi; uniform sampler2D uUnitTex; uniform float uGlow; uniform float uLit; uniform float uTime; uniform vec3 uGold;
varying vec3 vTag; varying vec2 vUvE; varying vec3 vEW; varying vec3 vEN;
float ex_h(float n){ return fract(sin(mod(n, 4096.) * 12.9898 + floor(n / 4096.) * 1.618) * 43758.5453); }
bool ex_hidden(){
  vec4 db = abs(uHideB - vTag.x);
  if (db.x < .5 && (uHideU.x < -.5 || abs(vTag.y - uHideU.x) < .5)) return true;
  if (db.y < .5 && (uHideU.y < -.5 || abs(vTag.y - uHideU.y) < .5)) return true;
  if (db.z < .5 && (uHideU.z < -.5 || abs(vTag.y - uHideU.z) < .5)) return true;
  if (db.w < .5 && (uHideU.w < -.5 || abs(vTag.y - uHideU.w) < .5)) return true;
  return false;
}
`;
function extMaterial(kind, params, envBase, EXT_U) {
  const m = new (params.transmission ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)(params);
  m.userData.envBase = envBase;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, EXT_U, { uGlow: SHARED.uGlow, uLit: SHARED.uLit, uTime: SHARED.uTime });
    sh.defines = Object.assign(sh.defines || {}, { ['EXT_' + kind.toUpperCase()]: '' });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aTag; varying vec3 vTag; varying vec2 vUvE; varying vec3 vEW; varying vec3 vEN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTag = aTag; vUvE = uv; vEW = (modelMatrix * vec4(position, 1.)).xyz; vEN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_EXT_HEAD)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (ex_hidden()) discard;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        #if defined(EXT_WALL) || defined(EXT_STONE) || defined(EXT_ACCENT)
          float exN = fract(sin(dot(floor(vEW.xz * 2.2) + floor(vEW.y * 2.2), vec2(12.99, 78.23))) * 43758.55);
          diffuseColor.rgb *= .975 + .05 * exN;
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float hiF = (abs(vTag.x - uHi.x) < .5 || abs(vTag.x - uHi.y) < .5) ? 1. : 0.;
          float hiU = 0.;
          if (vTag.y > -.5) { float ui = floor(vTag.y + .5); hiU = texture2D(uUnitTex, vec2((mod(ui, 64.) + .5) / 64., (floor(ui / 64.) + .5) / 32.)).r; }
          float vert = 1. - abs(vEN.y);
          #if defined(EXT_WALL) || defined(EXT_STONE) || defined(EXT_ACCENT) || defined(EXT_CROWN)
            // warm grazing uplight at the plinth + a faint city-light wash after dark
            totalEmissiveRadiance += vec3(1., .64, .34) * uGlow * vert * .75 * exp(-max(vEW.y, 0.) * .32);
            totalEmissiveRadiance += diffuseColor.rgb * vec3(1., .82, .62) * uGlow * .07;
          #endif
          #ifdef EXT_GLASS
            float sd = floor(vTag.z + .5);   // integer seed; varyings are not exact, so round before hashing
            if (sd > 10000.) {             // special glazing: 1xxxx shop, 2xxxx lobby, 3xxxx stair
              vec3 wc = sd > 30000. ? vec3(1., .9, .78) : vec3(1., .74, .46);
              float k = sd > 30000. ? .5 : sd > 20000. ? 1.5 : 1.25;
              totalEmissiveRadiance += wc * k * mix(.55, 1., vUvE.y) * (uGlow * 1.5 + .05);
            } else {
              float r1 = ex_h(sd), r2 = ex_h(sd + 17.), r3 = ex_h(sd + 41.);
              float lit = step(1. - uLit, r1);
              vec3 wc = mix(vec3(1., .56, .26), vec3(1., .78, .52), r2);
              float ceilG = mix(.4, 1., smoothstep(.15, 1., vUvE.y));
              float side = min(vUvE.x, 1. - vUvE.x);
              float curtain = r3 > .55 ? .45 + .55 * smoothstep(.02, .2, side) : 1.;
              float sheer = r3 < .22 ? .55 : 1.;
              totalEmissiveRadiance += wc * lit * (.35 + .7 * r2) * ceilG * curtain * sheer * uGlow * 1.35;
              totalEmissiveRadiance += vec3(.9, .65, .4) * .02 * uGlow;
            }
          #endif
          #ifdef EXT_SOFFIT
            float on = step(.45, ex_h(floor(vTag.y + .5) + 3.7)) + step(vTag.y, -.5) * .6;
            vec2 sp = vec2((fract(vUvE.x / 2.2) - .5) * 2.2, vUvE.y - .8);
            float dd = length(sp);
            totalEmissiveRadiance += vec3(1., .7, .42) * uGlow * on * (smoothstep(.13, .05, dd) * 10. + smoothstep(1.5, 0., dd) * .55);
          #endif
          #ifdef EXT_LED
            totalEmissiveRadiance += vec3(1., .72, .42) * (uGlow * 5. + .02);
          #endif
          totalEmissiveRadiance += uGold * (hiF * .5 + hiU * (.6 + .3 * sin(uTime * 3.2)));
        }`);
  };
  m.customProgramCacheKey = () => 'vr-ext-' + kind;
  return registerMaterial(m);
}

// ================================================================== createComplex
export function createComplex(opts = {}) {
  const group = new THREE.Group(); group.name = 'vrc-complex';
  const unitTexData = new Uint8Array(64 * 32 * 4);
  const unitTex = new THREE.DataTexture(unitTexData, 64, 32, THREE.RGBAFormat);
  unitTex.magFilter = unitTex.minFilter = THREE.NearestFilter; unitTex.needsUpdate = true;
  // hide / highlight state of this complex, shared by all its materials
  const EXT_U = {
    uHideB: { value: new THREE.Vector4(-999, -999, -999, -999) },
    uHideU: { value: new THREE.Vector4(-1, -1, -1, -1) },
    uHi: { value: new THREE.Vector2(-999, -999) },
    uUnitTex: { value: unitTex },
    uGold: { value: new THREE.Color('#e0a84e') },
  };
  const mat = (kind, params, envBase = 0.9) => extMaterial(kind, params, envBase, EXT_U);

  const M = {
    wall: mat('wall', { color: '#ece6da', roughness: 0.78 }, 0.6),
    stone: mat('stone', { color: '#cbbfab', roughness: 0.62 }, 0.7),
    accent: mat('accent', { color: '#a19a8f', roughness: 0.7 }, 0.6),
    crown: mat('crown', { color: '#8c7a60', roughness: 0.38, metalness: 0.65 }, 1),
    frame: mat('frame', { color: '#35302a', roughness: 0.4, metalness: 0.6 }, 1),
    glass: mat('glass', { color: '#8397aa', roughness: 0.04, metalness: 0.92 }, 1.15),
    rail: mat('rail', { color: '#c4d6da', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }, 1),
    soffit: mat('soffit', { color: '#f2eee6', roughness: 0.85 }, 0.5),
    roof: mat('roof', { color: '#6f6d69', roughness: 0.95 }, 0.4),
    solar: mat('solar', { color: '#1a2438', roughness: 0.18, metalness: 0.5 }, 1.2),
    hedge: mat('hedge', { color: '#3c5a27', roughness: 0.95 }, 0.3),
    led: mat('led', { color: '#1a1814', roughness: 0.5 }, 0.2),
  };

  const buildings = {}, pickables = [], bufsBy = {};
  for (const bId of B_IDS) {
    const bufs = {}; for (const k of Object.keys(M)) bufs[k] = new Buf();
    buildBuilding(bId, bufs);
    bufsBy[bId] = bufs;
    const bg = new THREE.Group(); bg.name = 'bldg-' + bId;
    const b = BUILDINGS[bId]; bg.position.set(b.origin[0], 0, b.origin[1]); bg.rotation.y = b.rotY;
    for (const [k, buf] of Object.entries(bufs)) {
      const g = buf.geometry(); if (!g) continue;
      const mesh = new THREE.Mesh(g, M[k]); mesh.name = `${bId}-${k}`;
      mesh.castShadow = k !== 'rail' && k !== 'led'; mesh.receiveShadow = k !== 'rail';
      if (k === 'rail') mesh.renderOrder = 4;
      mesh.onBeforeRender = (r, s, cam) => refreshHide(cam);
      bg.add(mesh);
    }
    // invisible pick volumes, one per floor (floor 10 = 10 + 10D)
    for (let f = -1; f <= TOP_FLOOR; f++) {
      const [y0, y1] = bandY(f);
      const shape = new THREE.Shape(FP_PICK.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0 - 0.02, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, y0 + 0.01, 0);
      const pm = new THREE.Mesh(g, PICK_MAT); pm.visible = false; pm.name = `pick-${bId}-${f}`;
      pm.userData.action = { type: 'floor', building: bId, floor: f };
      bg.add(pm); pickables.push(pm);
    }
    group.add(bg); buildings[bId] = bg;
  }
  group.updateMatrixWorld(true);

  // ---------------- floor highlight outline (gold lines + translucent ribbon at the balcony edge)
  const outline = new THREE.Group(); outline.name = 'floor-outline'; outline.visible = false;
  {
    const poly = offsetPoly(FOOTPRINT, BD + 0.25).pts;
    const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd28a').multiplyScalar(1.6), toneMapped: false, fog: false });
    const ribMat = new THREE.MeshBasicMaterial({ color: '#e0a84e', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mkLoop = () => {
      const parts = [];
      for (let i = 0; i < poly.length; i++) {
        const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length]; const L = Math.hypot(x1 - x0, z1 - z0);
        const g = new THREE.BoxGeometry(L + 0.3, 0.3, 0.3); g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2); parts.push(g);
      }
      const g = mergeBoxes(parts); return new THREE.Mesh(g, lineMat);
    };
    const bot = mkLoop(), top = mkLoop();
    const rp = [], ri = [];
    poly.forEach(([x, z], i) => { rp.push(x, 0, z, x, 1, z); const k = i * 2, n = ((i + 1) % poly.length) * 2; ri.push(k, n, k + 1, k + 1, n, n + 1); });
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri);
    const rib = new THREE.Mesh(rg, ribMat);
    outline.add(bot, top, rib); outline.userData = { bot, top, rib };
    outline.traverse(o => { o.renderOrder = 6; });
    group.add(outline);
  }

  // ---------------- hide logic
  const hidden = {};                // bId -> [floors]
  let lastCam = null, lastKey = '';
  const camLocal = new THREE.Vector3();
  function refreshHide(cam, force) {
    if (!cam) return;
    const key = cam.position.x.toFixed(2) + ',' + cam.position.y.toFixed(2) + ',' + cam.position.z.toFixed(2);
    if (!force && key === lastKey && cam === lastCam) return;
    lastKey = key; lastCam = cam;
    const B = EXT_U.uHideB.value, U = EXT_U.uHideU.value;
    const codes = [], units = [];
    for (const [bId, floors] of Object.entries(hidden)) {
      if (!floors || !floors.length) continue;
      const b = BUILDINGS[bId], c = Math.cos(b.rotY), s = Math.sin(b.rotY);
      const dx = cam.position.x - b.origin[0], dz = cam.position.z - b.origin[1];
      camLocal.set(dx * c - dz * s, cam.position.y, dx * s + dz * c);
      for (const f of floors) {
        const uf = f >= TOP_FLOOR ? TOP_FLOOR : f;
        let found = -1;
        for (const u of unitsOn(bId, uf)) {
          const ox = camLocal.x - u.frame.o[0], oz = camLocal.z - u.frame.o[1];
          const uu = ox * u.frame.U[0] + oz * u.frame.U[1], vv = ox * u.frame.V[0] + oz * u.frame.V[1];
          if (uu > -0.05 && uu < u.width + 0.05 && vv > -0.2 && vv < u.depth + BD + 1.2) { found = UNIT_INDEX.get(u); break; }
        }
        codes.push(bandCode(bId, f)); units.push(found);
      }
    }
    B.set(codes[0] ?? -999, codes[1] ?? -999, codes[2] ?? -999, codes[3] ?? -999);
    U.set(units[0] ?? -1, units[1] ?? -1, units[2] ?? -1, units[3] ?? -1);
  }
  function setHiddenFloors(bId, floors) {
    if (!BUILDINGS[bId]) return;
    const list = (floors || []).filter(f => f != null && f >= 0);
    // a hidden floor 10 also hides the 10D band (the duplex upper level shares the unit)
    if (list.includes(TOP_FLOOR) && !list.includes(TOP_FLOOR + 1)) list.push(TOP_FLOOR + 1);
    hidden[bId] = list;
    refreshHide(lastCam, true);
    if (!lastCam) { // no render yet: hide whole bands until a camera is known
      const codes = []; for (const [id, fl] of Object.entries(hidden)) for (const f of fl || []) codes.push(bandCode(id, f));
      EXT_U.uHideB.value.set(codes[0] ?? -999, codes[1] ?? -999, codes[2] ?? -999, codes[3] ?? -999);
    }
  }
  function setHiddenFloor(bId, floor) { setHiddenFloors(bId, floor == null ? [] : [floor]); }

  function highlightFloor(bId, floor) {
    if (floor == null || !BUILDINGS[bId]) { EXT_U.uHi.value.set(-999, -999); outline.visible = false; return; }
    const top = floor >= TOP_FLOOR;
    EXT_U.uHi.value.set(bandCode(bId, floor), top ? bandCode(bId, TOP_FLOOR + 1) : -999);
    const [y0, y1] = bandY(floor);
    const b = BUILDINGS[bId];
    outline.position.set(b.origin[0], 0, b.origin[1]); outline.rotation.y = b.rotY;
    const { bot, top: tp, rib } = outline.userData;
    bot.position.y = y0 + 0.05; tp.position.y = y1 - 0.05; rib.position.y = y0; rib.scale.y = y1 - y0;
    outline.visible = true;
  }
  function setUnitHighlight(ids) {
    unitTexData.fill(0);
    if (ids && ids.length) for (const id of ids) {
      const u = UNITS.find(x => x.id === id); if (!u) continue;
      const i = UNIT_INDEX.get(u); if (i >= 64 * 32) continue;
      unitTexData[i * 4] = 255;
    }
    unitTex.needsUpdate = true;
  }

  function dispose() {
    group.removeFromParent();
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of Object.values(M)) { SHARED.mats.delete(m); m.dispose(); }
    outline.traverse(o => o.material && o.material.dispose());
    unitTex.dispose();
  }

  return { group, buildings, pickables, highlightFloor, setHiddenFloor, setHiddenFloors, setUnitHighlight, dispose };
}

const PICK_MAT = new THREE.MeshBasicMaterial({ visible: false });

function mergeBoxes(parts) {
  const pos = [], nor = [], idx = [];
  for (const g of parts) {
    const k = pos.length / 3; const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + k);
    g.dispose();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}

// ================================================================== building generator
function rand(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function buildBuilding(bId, bufs) {
  const rnd = rand(bId === 'C3' ? 3303 : 4404);
  const winSeed = () => 1 + Math.floor(rnd() * 9000);  // apartment windows; > 10000 = special glazing
  const edges = FOOTPRINT.map((p, i) => {
    const q = FOOTPRINT[(i + 1) % FOOTPRINT.length];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const U = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    return { o: p, U, V: FP_OUT[i], L };
  });
  // which footprint edge a facade line lies on → running interval along that edge
  const onEdge = (a, b) => {
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const da = (a[0] - e.o[0]) * e.V[0] + (a[1] - e.o[1]) * e.V[1], db = (b[0] - e.o[0]) * e.V[0] + (b[1] - e.o[1]) * e.V[1];
      if (Math.abs(da) > 0.05 || Math.abs(db) > 0.05) continue;
      const sa = (a[0] - e.o[0]) * e.U[0] + (a[1] - e.o[1]) * e.U[1], sb = (b[0] - e.o[0]) * e.U[0] + (b[1] - e.o[1]) * e.U[1];
      if (Math.min(sa, sb) < -0.05 || Math.max(sa, sb) > e.L + 0.05) continue;
      return { i, s0: Math.min(sa, sb), s1: Math.max(sa, sb) };
    }
    return null;
  };
  const finKeys = new Set();

  for (let band = 0; band <= TOP_FLOOR + 1; band++) {
    const floor = Math.min(band, TOP_FLOOR);
    const code = bandCode(bId, band);
    const y0 = band === 0 ? 0 : floorY(band);
    const yTop = band === 0 ? LEVELS.groundH - LEVELS.slab : y0 + LEVELS.ceiling;   // window head
    const crown = band >= TOP_FLOOR;
    const cover = edges.map(() => []);

    // ---------------- apartments
    for (const u of unitsOn(bId, floor)) {
      const F = u.frame, w = u.width, uid = UNIT_INDEX.get(u);
      const T = TYPES[u.type];
      const kind = band === TOP_FLOOR + 1 ? 'balcony' : T.outdoorKind;
      const tag = { b: code, u: uid, s: 0 };
      const ext = onEdge([P(F, 0, 0, D)[0], P(F, 0, 0, D)[2]], [P(F, w, 0, D)[0], P(F, w, 0, D)[2]]);
      if (ext) cover[ext.i].push([ext.s0, ext.s1]);
      const pierMat = band === 0 ? bufs.stone : crown ? bufs.crown : bufs.wall;
      // slab edge under this floor
      if (band > 0) box(crown ? bufs.crown : bufs.wall, F, 0, w, y0 - LEVELS.slab, y0, D - 0.25, D + 0.02, tag, 'V');
      // openings: piers + floor-to-ceiling glazing
      const e = 0.32, pier = 0.5;
      const n = Math.max(1, Math.round((w - 2 * e) / 3.3));
      const ww = (w - 2 * e - (n - 1) * pier) / n;
      let a = 0;
      for (let k = 0; k <= n; k++) {
        const b = k === 0 ? e : k === n ? w : a + pier;
        const pa = k === 0 ? 0 : a;
        box(pierMat, F, pa, b, y0, yTop, D - 0.3, D, tag, (k === 0 ? '' : 'u') + (k === n ? '' : 'U') + 'V');
        if (k === n) break;
        const g0 = b, g1 = b + ww;
        const t = { b: code, u: uid, s: winSeed() };
        pane(bufs.glass, F, g0, g1, y0, yTop, D - 0.18, t);
        box(pierMat, F, g0, g1, yTop - 0.001, yTop, D - 0.18, D, tag, 'y');             // head reveal
        // frame + mullions (sliding doors: frame, one mid transom low, vertical mullions ~1.2 m)
        const fr = 0.055;
        box(bufs.frame, F, g0, g1, y0, y0 + 0.06, D - 0.2, D - 0.13, tag, 'VY');
        box(bufs.frame, F, g0, g1, yTop - 0.06, yTop, D - 0.2, D - 0.13, tag, 'Vy');
        const nm = Math.max(1, Math.round(ww / 1.25));
        for (let m = 0; m <= nm; m++) { const x = g0 + (ww * m) / nm; box(bufs.frame, F, x - fr / 2, x + fr / 2, y0, yTop, D - 0.2, D - 0.13, tag, 'Vu' + 'U'); }
        a = g1;
      }
      if (band === 0) {
        // ground-floor garden terrace + hedge
        box(bufs.stone, F, 0.1, w - 0.1, 0, 0.14, D, D + 2.6, tag, 'YVuU');
        box(bufs.hedge, F, 0.15, w - 0.15, 0, 0.95, D + 2.6, D + 3.1, { b: code, u: -2, s: 0 }, 'YVuUv');
        continue;
      }
      // balcony / loggia / terrace slab (top flush with the floor), soffit with downlights under it
      const bm = crown ? bufs.crown : bufs.wall;
      box(bm, F, 0.12, w - 0.12, y0 - 0.2, y0, D, D + BD, tag, 'YVuU');
      box(bufs.soffit, F, 0.12, w - 0.12, y0 - 0.2, y0, D, D + BD, tag, 'y');
      if (kind === 'loggia') {
        box(bufs.accent, F, 0.25, w - 0.25, y0, y0 + 1.0, D + BD - 0.16, D + BD, tag, 'VvY');
        box(bufs.stone, F, 0.25, w - 0.25, y0 + 1.0, y0 + 1.06, D + BD - 0.2, D + BD + 0.03, tag, 'YVv');
      } else {
        box(bufs.rail, F, 0.25, w - 0.25, y0, y0 + RAIL_H, D + BD - 0.1, D + BD - 0.09, tag, 'V');
        box(bufs.frame, F, 0.25, w - 0.25, y0 + RAIL_H, y0 + RAIL_H + 0.04, D + BD - 0.13, D + BD - 0.06, tag, 'YVvy');
        box(bufs.frame, F, 0.25, w - 0.25, y0 - 0.02, y0 + 0.05, D + BD - 0.13, D + BD - 0.06, tag, 'V');
      }
      // privacy fins at both unit ends (shared between neighbours; never unit-hidden)
      const finMat = crown ? bufs.crown : kind === 'loggia' ? bufs.accent : bufs.wall;
      for (const uu of [0, w]) {
        const p = P(F, uu, 0, D + 0.8), key = `${band}:${p[0].toFixed(1)}:${p[2].toFixed(1)}`;
        if (finKeys.has(key)) continue; finKeys.add(key);
        box(finMat, F, uu - 0.12, uu + 0.12, y0 - 0.2, y0 + LEVELS.typicalH - 0.2, D, D + BD + 0.05, { b: code, u: -2, s: 0 }, 'uUV');
      }
    }

    // ---------------- ground-floor blocks (amenity / kindergarten / parking / storage)
    if (band === 0) for (const bl of blocksOn(bId, 0)) {
      const F = bl.frame, w = bl.width, tag = { b: code, u: -1, s: 0 };
      const ext = onEdge([P(F, 0, 0, D)[0], P(F, 0, 0, D)[2]], [P(F, w, 0, D)[0], P(F, w, 0, D)[2]]);
      if (ext) cover[ext.i].push([ext.s0, ext.s1]);
      if (bl.kind === 'amenity' || bl.kind === 'kindergarten') {
        const seed = bl.kind === 'kindergarten' ? 10002 : 10001;
        box(bufs.stone, F, 0, 0.6, 0, yTop, D - 0.3, D, tag, 'VU');
        box(bufs.stone, F, w - 0.6, w, 0, yTop, D - 0.3, D, tag, 'Vu');
        pane(bufs.glass, F, 0.6, w - 0.6, 0, yTop, D - 0.2, { b: code, u: -1, s: seed });
        for (let x = 0.6; x <= w - 0.59; x += (w - 1.2) / Math.round((w - 1.2) / 1.6)) box(bufs.frame, F, x - 0.04, x + 0.04, 0, yTop, D - 0.22, D - 0.14, tag, 'VuU');
        box(bufs.frame, F, 0.6, w - 0.6, 2.35, 2.42, D - 0.22, D - 0.14, tag, 'Vy');
        // canopy with downlights
        box(bufs.frame, F, 0, w, yTop - 0.02, yTop + 0.16, D, D + 1.5, tag, 'YVuU');
        box(bufs.soffit, F, 0, w, yTop - 0.02, yTop + 0.16, D, D + 1.5, { b: code, u: -2, s: 0 }, 'y');
      } else {
        box(bufs.accent, F, 0, w, 0, yTop, D - 0.3, D, tag, 'V');
        // vertical louvres
        for (let x = 0.4; x < w - 0.2; x += 0.45) box(bufs.frame, F, x - 0.04, x + 0.04, 0.35, yTop - 0.25, D, D + 0.14, tag, 'VuU');
        if (bl.kind === 'storage' && bl.seg === 'S4') { // stair-2 lobby entrance at the courtyard end of the wing
          box(bufs.stone, F, w - 6, w, 0, yTop, D, D + 0.05, tag, 'V');
          pane(bufs.glass, F, w - 5.2, w - 0.8, 0, yTop - 0.1, D + 0.06, { b: code, u: -1, s: 20001 });
          box(bufs.frame, F, w - 5.6, w - 0.4, yTop - 0.1, yTop + 0.18, D, D + 2.6, tag, 'YVuU');
          box(bufs.soffit, F, w - 5.6, w - 0.4, yTop - 0.1, yTop + 0.18, D, D + 2.6, { b: code, u: -2, s: 0 }, 'y');
        }
      }
    }

    // ---------------- gaps along each footprint edge: cores, end walls
    edges.forEach((e, i) => {
      const iv = cover[i].sort((p, q) => p[0] - q[0]);
      const gaps = []; let s = 0;
      for (const [a, b] of iv) { if (a - s > 0.3) gaps.push([s, a]); s = Math.max(s, b); }
      if (e.L - s > 0.3) gaps.push([s, e.L]);
      for (const [s0, s1] of gaps) {
        const tag = { b: code, u: -1, s: 0 }, L = s1 - s0, mid = (s0 + s1) / 2;
        const baseMat = band === 0 ? bufs.stone : crown ? bufs.crown : bufs.accent;
        if (band > 0) box(crown ? bufs.crown : bufs.wall, e, s0, s1, y0 - LEVELS.slab, y0, -0.25, 0.02, tag, 'V');
        // lobby entrance if a core entrance lies in this gap
        const entr = band === 0 && CORES.find(c => {
          const dx = c.entrance[0] - e.o[0], dz = c.entrance[1] - e.o[1];
          const ss = dx * e.U[0] + dz * e.U[1], dd = dx * e.V[0] + dz * e.V[1];
          return Math.abs(dd) < 0.1 && ss > s0 && ss < s1;
        });
        if (entr) {
          const ss = (entr.entrance[0] - e.o[0]) * e.U[0] + (entr.entrance[1] - e.o[1]) * e.U[1];
          box(bufs.stone, e, s0, ss - 2.3, 0, yTop, -0.3, 0, tag, 'V');
          box(bufs.stone, e, ss + 2.3, s1, 0, yTop, -0.3, 0, tag, 'V');
          pane(bufs.glass, e, ss - 2.3, ss + 2.3, 0, yTop, -0.22, { b: code, u: -1, s: 20001 });
          for (const x of [ss - 2.3, ss - 0.8, ss + 0.8, ss + 2.3]) box(bufs.frame, e, x - 0.05, x + 0.05, 0, yTop, -0.24, -0.12, tag, 'VuU');
          box(bufs.frame, e, ss - 3.2, ss + 3.2, yTop - 0.05, yTop + 0.2, 0, 3.0, tag, 'YVuU');
          box(bufs.soffit, e, ss - 3.2, ss + 3.2, yTop - 0.05, yTop + 0.2, 0, 3.0, { b: code, u: -2, s: 0 }, 'y');
          box(bufs.crown, e, ss - 2.6, ss + 2.6, yTop + 0.2, yTop + 0.55, -0.05, 0.12, tag, 'VY');
          continue;
        }
        if (L >= 5.5) {  // panel with a vertical glazed slot (stair / corridor end)
          const g0 = mid - 0.75, g1 = mid + 0.75;
          box(baseMat, e, s0, g0, y0, yTop, -0.3, 0, tag, 'VU');
          box(baseMat, e, g1, s1, y0, yTop, -0.3, 0, tag, 'Vu');
          pane(bufs.glass, e, g0, g1, y0, yTop, -0.16, { b: code, u: -1, s: band === 0 ? 20002 : 30001 });
          box(bufs.frame, e, g0, g1, y0, y0 + 0.08, -0.18, -0.1, tag, 'VY');
          // recessed vertical reveal lines for depth
          for (const x of [s0 + 0.12, s1 - 0.12]) box(bufs.wall, e, x - 0.12, x + 0.12, y0, yTop, -0.05, 0.03, tag, 'VuU');
        } else {
          box(band === 0 ? bufs.stone : crown ? bufs.crown : bufs.wall, e, s0, s1, y0, yTop, -0.3, 0, tag, 'V');
        }
      }
    });
  }

  // ---------------- roof: slab, cornice ring with LED line, parapet, lift overruns, solar arrays
  const rt = { b: bandCode(bId, ROOF_BAND), u: -2, s: 0 };
  const yR = ROOF_Y - LEVELS.slab;
  {
    const shape = new THREE.Shape(FOOTPRINT.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, idx = g.index;
    for (let i = 0; i < idx.count; i += 3) {
      const tri = [0, 1, 2].map(k => { const j = idx.getX(i + k); return [p.getX(j), ROOF_Y, p.getZ(j)]; });
      bufs.roof.quad([tri[0], tri[1], tri[2], tri[2]], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [1, 1]], rt);
    }
    g.dispose();
  }
  // corner i (between edge i-1 and edge i) is convex when the previous edge runs along this edge's outward normal
  const conv = edges.map((b, i) => { const a = edges[(i + edges.length - 1) % edges.length]; return a.U[0] * b.V[0] + a.U[1] * b.V[1] > 0; });
  edges.forEach((e, i) => {
    const ext0 = conv[i] ? CORNICE : 0, ext1 = conv[(i + 1) % edges.length] ? CORNICE : 0;
    box(bufs.crown, e, -ext0, e.L + ext1, yR, yR + 0.42, 0, CORNICE, rt, 'YVuU');
    box(bufs.soffit, e, -ext0, e.L + ext1, yR, yR + 0.42, 0, CORNICE, rt, 'y');
    box(bufs.led, e, -ext0, e.L + ext1, yR + 0.02, yR + 0.1, CORNICE, CORNICE + 0.01, rt, 'V');
    box(bufs.wall, e, 0, e.L, yR + 0.42, yR + 1.25, -0.25, 0.05, rt, 'VvY');
  });
  // lift overruns / stair heads over each core, and the wing core
  for (const c of CORES) box(bufs.accent, { o: [0, 0], U: [1, 0], V: [0, 1] }, c.x0 + 0.5, c.x1 - 0.5, ROOF_Y, ROOF_Y + 3.4, c.z0 + 0.5, c.z1 - 0.5, rt, 'uUvVY');
  // plant screens on the wing
  box(bufs.accent, { o: [0, 0], U: [1, 0], V: [0, 1] }, 70, 81, ROOF_Y, ROOF_Y + 2.2, -30, -20, rt, 'uUvVY');
  // solar arrays (tilted towards the south)
  const I = { o: [0, 0], U: [1, 0], V: [0, 1] };
  const solarRow = (x0, x1, z) => {
    const yl = ROOF_Y + 0.35, yh = ROOF_Y + 0.75;
    bufs.solar.quad([[x0, yl, z], [x1, yl, z], [x1, yh, z - 1.6], [x0, yh, z - 1.6]], [0, 0.97, 0.24], [[0, 0], [x1 - x0, 0], [x1 - x0, 1.6], [0, 1.6]], rt);
    box(bufs.frame, I, x0, x1, ROOF_Y, yl, z - 0.1, z, rt, 'V');
  };
  const coreHit = (x0, x1, z0, z1) => CORES.some(c => x1 > c.x0 && x0 < c.x1 && z1 > c.z0 && z0 < c.z1);
  for (let z = 6.8; z > -6.5; z -= 2.6) {
    for (let x = 2; x < 64; x += 8.2) { if (!coreHit(x - 0.3, x + 7.8, z - 1.9, z + 0.3)) solarRow(x, x + 7.6, z); }
  }
  for (let z = -11; z > -36; z -= 2.6) { if (z < -18 && z > -33) continue; solarRow(69.5, 81.5, z); }
  // hvac boxes
  for (const [x, z] of [[12, 4.5], [30, -3.5], [57, 4.5], [78, 3.5]]) box(bufs.accent, I, x, x + 2.2, ROOF_Y, ROOF_Y + 1.4, z - 1.2, z + 1.2, rt, 'uUvVY');
}
