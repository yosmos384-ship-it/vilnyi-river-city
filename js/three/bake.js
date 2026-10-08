// VILNYI RIVER CITY — baked global illumination for the walkable apartments ("Realistic lighting").
//
// Offline (bake-work/: export.py → bake.py in Blender Cycles → pack.py) every apartment CLASS (type × width — the plan
// depends on nothing else) is path-traced once as neutral clay, in two light layers:
//   sky  — overcast sky + ground through the glazing (no sun → the same bake serves every orientation), and
//   lamp — all the lamps of the apartment.
// Stored per class (site/assets/bake/<key>.json + two grayscale JPEGs, ~100–200 KB together):
//   · a little irradiance VOLUME per room (20 cm voxels, 6 directions) → walls, ceilings, furniture, movers, and
//   · a top-down FLOOR map (2.5 cm texels) → contact shadows under furniture, light pools at the windows.
// At runtime the two layers are mixed on the CPU for the day / dusk / night setting into three small textures, and the
// apartment materials multiply their diffuse light by the baked factor (1 = unchanged), looked up by POSITION + NORMAL in
// unit-local space. Nothing depends on mesh names, vertex order or UVs, so the bake survives any change of the
// procedural build that keeps the plan; styles only change the albedo it multiplies. Every room samples its own
// volume (picked from a room-id map), so light cannot leak through walls.
//
// Integration: apartment.js calls attachBake(root, unit, m) once per built apartment. Everything else is in here.
//   window.VRC.bakedLighting = { enabled, active, strength, setEnabled(on), setTime('day'|'dusk'|'night'), onChange(fn) }
//   — `active` is true while the apartment on screen is lit by a bake (its contact shadows / corner darkening are then
//   already in the picture: screen-space AO should be faded out or kept very light — see `aoHint`).
// No bake for a class, WebGL1, or the toggle off → the materials return the factor 1 and the look is the previous one.
import * as THREE from 'three';

const LS_KEY = 'vrc.bakedLight';
const MAX_ROOMS = 16;
const BASE = new URL('../../assets/bake/', import.meta.url);
// layer weights per time of day (x = sky·a + lamp·b, 1 = the reference level of the layer), response curve and limits
const MIX = { day: [0.55, 0.55], dusk: [0.3, 0.85], night: [0.04, 1.15] };
const TUNE = { gamma: 1.1, min: 0.15, max: 1.45, strength: 1.0 };
// fake-light decals that the bake replaces (hidden while a bake is on; the lamp scallops / glows stay)
const REPLACED = /\.(ao|aoSoft|shade)$/;

function lsGet() { try { return localStorage.getItem(LS_KEY); } catch { return null; } }
function lsSet(v) { try { localStorage.setItem(LS_KEY, v); } catch { /* private mode */ } }

const U = {
  uBakeOn: { value: 0 },
  uBakeInv: { value: new THREE.Matrix4() },
  uBakeVolP: { value: null }, uBakeVolN: { value: null }, uBakeFloor: { value: null }, uBakeId: { value: null },
  uBakeRoomO: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector4()) },   // x0, z0 (m), atlas x, z (voxels)
  uBakeRoomN: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector4()) },   // nx, nz (voxels), y0 (m), outdoor
  uBakeA: { value: new THREE.Vector4(1, 1, 3, 1) },     // 1/W, 1/DT, storey height, levels
  uBakeB: { value: new THREE.Vector4(5, 4, 12, 0.1) },  // 1/h, 1/hy, slices per level, normal bias (m)
  uBakeS: { value: new THREE.Vector3(1, 1, 1) },        // 1 / atlas size (x, y, z)
};

const VERT_DECL = `
uniform mat4 uBakeInv;
varying vec3 vBakeP;
`;
const VERT_MAIN = `
{
  vec4 bakeP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    bakeP = instanceMatrix * bakeP;
  #endif
  vBakeP = ( uBakeInv * ( modelMatrix * bakeP ) ).xyz;
}
`;
const FRAG_DECL = `
precision highp sampler3D;
uniform float uBakeOn;
uniform mat4 uBakeInv;
uniform sampler3D uBakeVolP;
uniform sampler3D uBakeVolN;
uniform sampler2D uBakeFloor;
uniform sampler2D uBakeId;
uniform vec4 uBakeRoomO[ ${MAX_ROOMS} ];
uniform vec4 uBakeRoomN[ ${MAX_ROOMS} ];
uniform vec4 uBakeA;
uniform vec4 uBakeB;
uniform vec3 uBakeS;
varying vec3 vBakeP;
float vrcBakedLight( vec3 nView ) {
  if ( uBakeOn <= 0.0 ) return 1.0;
  vec3 p = vBakeP;
  float W = 1.0 / uBakeA.x, DT = 1.0 / uBakeA.y;
  if ( p.x < -0.25 || p.x > W + 0.25 || p.z < -0.3 || p.z > DT + 0.3 || p.y < -0.45 || p.y > uBakeA.z * uBakeA.w + 0.1 ) return 1.0;
  vec3 n = normalize( mat3( uBakeInv ) * inverseTransformDirection( nView, viewMatrix ) );
  float lv = clamp( floor( ( p.y + n.y * 0.05 + 0.15 ) / uBakeA.z ), 0.0, uBakeA.w - 1.0 );
  float ly = p.y - lv * uBakeA.z;
  float f;
  if ( n.y > 0.7 && ly > -0.06 && ly < 0.075 ) {
    vec2 uv = clamp( p.xz * uBakeA.xy, 0.0, 1.0 );
    f = texture2D( uBakeFloor, vec2( uv.x, ( uv.y + lv ) / uBakeA.w ) ).r;
  } else {
    vec2 uv = clamp( ( p.xz + n.xz * 0.04 ) * uBakeA.xy, 0.001, 0.999 );
    float id = floor( texture2D( uBakeId, vec2( uv.x, ( uv.y + lv ) / uBakeA.w ) ).r * 255.0 + 0.5 );
    int ri = int( min( id, ${MAX_ROOMS - 1}.0 ) );
    vec4 ro = uBakeRoomO[ ri ], rn = uBakeRoomN[ ri ];
    vec3 q = p + n * uBakeB.w;
    vec3 c = vec3( ( q.x - ro.x ) * uBakeB.x, ( q.y - rn.z ) * uBakeB.y, ( q.z - ro.y ) * uBakeB.x );
    c = clamp( c, vec3( 0.5 ), vec3( rn.x, uBakeB.z, rn.y ) - 0.5 );
    vec3 tc = vec3( ro.z + c.x, c.y, ro.w + c.z ) * uBakeS;
    vec3 a = texture( uBakeVolP, tc ).rgb, b = texture( uBakeVolN, tc ).rgb;
    f = dot( n * n, mix( b, a, step( 0.0, n ) ) );
  }
  return mix( 1.0, f * 2.0, uBakeOn );
}
`;
const FRAG_MAIN = `
{
  float bakeF = vrcBakedLight( nonPerturbedNormal );
  reflectedLight.directDiffuse *= bakeF;
  reflectedLight.indirectDiffuse *= bakeF;
  float bakeS = min( 1.0, mix( 1.0, bakeF, 0.75 ) );
  reflectedLight.directSpecular *= bakeS;
  reflectedLight.indirectSpecular *= bakeS;
  #ifdef VRC_BAKE_DEBUG
    reflectedLight.directDiffuse = vec3( bakeF * 0.22 ); reflectedLight.indirectDiffuse = vec3( 0.0 );
    reflectedLight.directSpecular = reflectedLight.indirectSpecular = vec3( 0.0 );
  #endif
}
`;

const patched = new WeakSet();
function patch(mat) {
  if (!mat || patched.has(mat) || !(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) return;
  patched.add(mat);
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (sh, renderer) {
    if (prev) prev.call(this, sh, renderer);
    if (!renderer.capabilities.isWebGL2) return;
    const C = '#include <common>', PV = '#include <project_vertex>', LE = '#include <lights_fragment_end>';
    if (![C, PV].every(k => sh.vertexShader.includes(k)) || ![C, LE].every(k => sh.fragmentShader.includes(k))) return;
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace(C, C + VERT_DECL).replace(PV, PV + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader.replace(C, C + FRAG_DECL).replace(LE, LE + FRAG_MAIN);
  };
  mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|vrc-bake1'; };
}
function patchAll(m) {
  for (const v of Object.values(m)) {
    if (!v) continue;
    if (v.isMaterial) patch(v);
    else if (Array.isArray(v)) v.forEach(x => x && x.isMaterial && patch(x));
  }
}

// ------------------------------------------------------------------ data
let indexP = null;
function loadIndex() {
  if (!indexP) {
    indexP = fetch(new URL('index.json', BASE)).then(r => (r.ok ? r.json() : { classes: {} })).catch(() => ({ classes: {} }));
  }
  return indexP;
}
export function bakeKey(unit) { return unit.type + '-' + Math.round(unit.width * 1000); }

function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('bake image ' + url)); im.src = url; });
}
function grayOf(im) {
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = d[i * 4];
  c.width = c.height = 0;
  return out;
}
function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distPoly(x, z, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], az = poly[j][1], dx = poly[i][0] - ax, dz = poly[i][1] - az, L = dx * dx + dz * dz;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return d;
}
const OUTDOOR = new Set(['balcony', 'loggia', 'terrace']);
// which room a point belongs to (per level): inside a room outline, else the nearest outline
function roomIdMap(J) {
  const cell = 0.04, w = Math.ceil(J.W / cell), h = Math.ceil(J.DT / cell), L = J.levels, data = new Uint8Array(w * h * L);
  for (let lv = 0; lv < L; lv++) {
    const rs = J.rooms.map((r, i) => ({ r, i })).filter(e => e.r.level === lv);
    for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) {
      const x = (i + 0.5) * cell * (J.W / (w * cell)), z = (k + 0.5) * cell * (J.DT / (h * cell));
      let id = 255, best = Infinity;
      for (const e of rs) if (inPoly(x, z, e.r.poly)) { id = e.i; break; }
      if (id === 255) for (const e of rs) { const d = distPoly(x, z, e.r.poly); if (d < best) { best = d; id = e.i; } }
      data[(lv * h + k) * w + i] = id === 255 ? 0 : id;
    }
  }
  const t = new THREE.DataTexture(data, w, h * L, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

const classes = new Map();    // key → { state: 'loading' | 'ready' | 'none', J, vol, floor, tex…, time }
async function loadClass(key) {
  let C = classes.get(key);
  if (C) return C.promise;
  C = { key, state: 'loading', users: 0 };
  classes.set(key, C);
  C.promise = (async () => {
    const t0 = performance.now();
    const idx = await loadIndex(), e = idx.classes && idx.classes[key];
    if (!e) { C.state = 'none'; return C; }
    const q = e.rev ? '?r=' + e.rev : '';
    const J = await fetch(new URL(key + '.json' + q, BASE)).then(r => { if (!r.ok) throw new Error('bake json ' + r.status); return r.json(); });
    if (J.rooms.length > MAX_ROOMS) throw new Error('bake: too many rooms');
    const [iv, ifl] = await Promise.all([loadImage(new URL(J.vol.file + q, BASE).href), loadImage(new URL(J.floor.file + q, BASE).href)]);
    const t1 = performance.now();
    C.J = J; C.vol = grayOf(iv); C.volW = iv.naturalWidth; C.floor = grayOf(ifl); C.floorW = ifl.naturalWidth;
    const { sx, sy, sz } = J.vol, n = sx * sy * sz;
    if (C.volW !== 12 * sx || iv.naturalHeight !== sy * sz || C.floorW !== J.floor.w || ifl.naturalHeight !== 2 * J.levels * J.floor.h) throw new Error('bake: atlas size mismatch');
    const mk3 = () => {
      const t = new THREE.Data3DTexture(new Uint8Array(n * 4), sx, sy, sz);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.unpackAlignment = 1;
      return t;
    };
    C.texP = mk3(); C.texN = mk3();
    C.texF = new THREE.DataTexture(new Uint8Array(J.floor.w * J.floor.h * J.levels), J.floor.w, J.floor.h * J.levels, THREE.RedFormat, THREE.UnsignedByteType);
    C.texF.minFilter = C.texF.magFilter = THREE.LinearFilter; C.texF.generateMipmaps = false; C.texF.unpackAlignment = 1;
    C.texF.wrapS = C.texF.wrapT = THREE.ClampToEdgeWrapping;
    const t2 = performance.now();
    C.texId = roomIdMap(J);
    C.cpu = { decode: Math.round(t2 - t1), idMap: Math.round(performance.now() - t2) };
    C.mixed = null;
    C.state = 'ready'; C.ms = Math.round(performance.now() - t0); C.bytes = (J.vol.bytes || 0) + (J.floor.bytes || 0);
    return C;
  })().catch(err => { console.warn('[bake]', key, err && err.message); C.state = 'none'; return C; });
  return C.promise;
}
function disposeClass(C) {
  for (const k of ['texP', 'texN', 'texF', 'texId']) if (C[k]) { C[k].dispose(); C[k] = null; }
  C.vol = C.floor = null;
  classes.delete(C.key);
}
// stored byte s → x = range·(s/255)²; the factor written to the GPU is clamp(x^γ)/2
function mixClass(C, time) {
  if (C.mixed === time) return;
  const tm = performance.now();
  const J = C.J, [a, b] = MIX[time] || MIX.dusk, R = J.range / (255 * 255);
  const lut = new Uint8Array(65536);
  for (let s = 0; s < 256; s++) for (let l = 0; l < 256; l++) {
    const x = (a * s * s + b * l * l) * R;
    lut[s << 8 | l] = Math.round(Math.max(TUNE.min, Math.min(TUNE.max, Math.pow(x, TUNE.gamma))) * 127.5);
  }
  const { sx, sy, sz } = J.vol, W = C.volW, V = C.vol, P = C.texP.image.data, N = C.texN.image.data;
  // file: tile (layer·6 + dir) across, slice y down; inside a tile x across, z down.  GPU: index = x + y·sx + z·sx·sy
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
    const row = (y * sz + z) * W, o = (z * sy + y) * sx;
    for (let x = 0; x < sx; x++) {
      const i = row + x, k = (o + x) * 4;
      P[k] = lut[V[i] << 8 | V[i + 6 * sx]]; P[k + 1] = lut[V[i + sx] << 8 | V[i + 7 * sx]]; P[k + 2] = lut[V[i + 2 * sx] << 8 | V[i + 8 * sx]]; P[k + 3] = 255;
      N[k] = lut[V[i + 3 * sx] << 8 | V[i + 9 * sx]]; N[k + 1] = lut[V[i + 4 * sx] << 8 | V[i + 10 * sx]]; N[k + 2] = lut[V[i + 5 * sx] << 8 | V[i + 11 * sx]]; N[k + 3] = 255;
    }
  }
  const fw = J.floor.w, fh = J.floor.h * J.levels, F = C.floor, T = C.texF.image.data;
  for (let i = 0, n = fw * fh; i < n; i++) T[i] = lut[F[i] << 8 | F[i + n]];
  C.texP.needsUpdate = C.texN.needsUpdate = C.texF.needsUpdate = true;
  C.mixed = time; if (C.cpu) C.cpu.mix = Math.round(performance.now() - tm);
}

// ------------------------------------------------------------------ state
const S = {
  enabled: lsGet() !== '0', time: 'dusk', active: null, level: 0, frame: -1, best: null, bestD: Infinity, last: 0,
  listeners: new Set(), recs: new Set(),
};
function emit() { for (const fn of S.listeners) { try { fn(api); } catch (e) { console.warn(e); } } }
function setFakes(rec, hide) {
  if (rec.fakesHidden === hide) return;
  rec.fakesHidden = hide;
  for (const o of rec.fakes) o.visible = !hide;
}
function bind(rec) {
  const C = rec.cls, J = C.J;
  mixClass(C, S.time);
  U.uBakeVolP.value = C.texP; U.uBakeVolN.value = C.texN; U.uBakeFloor.value = C.texF; U.uBakeId.value = C.texId;
  U.uBakeA.value.set(1 / J.W, 1 / J.DT, J.LH, J.levels);
  U.uBakeB.value.set(1 / J.h, 1 / J.hy, J.vol.sy, J.h * 0.5);
  U.uBakeS.value.set(1 / J.vol.sx, 1 / J.vol.sy, 1 / J.vol.sz);
  J.rooms.forEach((r, i) => {
    U.uBakeRoomO.value[i].set(r.o[0], r.o[1], r.a[0], r.a[1]);
    U.uBakeRoomN.value[i].set(r.n[0], r.n[1], r.level * J.LH, OUTDOOR.has(r.kind) ? 1 : 0);
  });
}
function activate(rec) {
  if (S.active === rec) return;
  const was = !!S.active;
  if (S.active) setFakes(S.active, false);
  S.active = rec; S.level = 0; U.uBakeOn.value = 0;
  if (rec) bind(rec);
  if (was !== !!rec) emit();
}
const _cam = new THREE.Vector3();
// called from the render of every attached apartment (one mesh each): picks the apartment the camera is in / nearest to,
// starts its download, fades the baked light in
function onRender(rec, renderer, camera) {
  const now = performance.now(), frame = renderer.info.render.frame;
  if (frame !== S.frame) {
    // close the previous frame: the best candidate becomes the active apartment
    const want = S.enabled && S.best && S.best.cls && S.best.cls.state === 'ready' ? S.best : null;
    if (want !== S.active && !(want === null && S.active && S.best === null)) activate(want);
    else if (!S.enabled && S.active) activate(null);
    const dt = Math.min(0.1, (now - (S.last || now)) / 1000); S.last = now;
    if (S.active) {
      if (S.level < 1) { S.level = Math.min(1, S.level + dt / 0.45); U.uBakeOn.value = TUNE.strength * S.level * S.level * (3 - 2 * S.level); }
      setFakes(S.active, S.level > 0.5);
      S.active.root.updateWorldMatrix(true, false);
      U.uBakeInv.value.copy(S.active.root.matrixWorld).invert();
    }
    S.frame = frame; S.best = null; S.bestD = Infinity;
  }
  if (!renderer.capabilities.isWebGL2) return;
  rec.root.updateWorldMatrix(true, false);
  _cam.setFromMatrixPosition(camera.matrixWorld); rec.root.worldToLocal(_cam);
  const d = Math.hypot(Math.max(0, -_cam.x, _cam.x - rec.W), Math.max(0, -_cam.z, _cam.z - rec.DT), Math.max(0, -_cam.y, _cam.y - rec.H));
  if (d < S.bestD) { S.bestD = d; S.best = rec; }
  if (S.enabled && !rec.cls && !rec.loading && d < 12) {
    rec.loading = true;
    loadClass(rec.key).then(C => { C.users++; rec.cls = C; rec.loading = false; if (rec.gone) release(rec); });
  }
}
function release(rec) {
  const C = rec.cls; rec.cls = null;
  if (C && --C.users <= 0 && C.state === 'ready') {
    if (U.uBakeVolP.value === C.texP) { U.uBakeOn.value = 0; U.uBakeVolP.value = U.uBakeVolN.value = U.uBakeFloor.value = U.uBakeId.value = null; }
    disposeClass(C);
  } else if (C && C.state === 'none' && C.users <= 0) { /* keep the negative result: no second request */ }
}

/** Hook for apartment.js: call once per built (walkable) apartment, before its first render. */
export function attachBake(root, unit, m, opts = {}) {
  try {
    if (m) patchAll(m);
    const fakes = []; let hook = null;
    const cut = !!(opts && opts.cutaway);
    root.traverse(o => {
      if (!o.isMesh) return;
      const mat = o.material;
      if (Array.isArray(mat)) mat.forEach(patch); else patch(mat);
      if (/^baked:/.test(o.name)) {
        if (REPLACED.test((mat && mat.name) || '')) fakes.push(o);
        else if (!hook && mat && !mat.transparent) hook = o;
      }
    });
    if (cut || !hook || typeof window === 'undefined') return null;      // dollhouse models: materials patched (one shader variant everywhere), no bake
    const levels = /^D/.test(unit.type) ? 2 : 1;
    const rec = { root, unit, key: bakeKey(unit), W: unit.width, DT: unit.depth + 1.6, H: levels * 3, fakes, cls: null, loading: false, gone: false, fakesHidden: false };
    const prev = hook.onBeforeRender;
    hook.onBeforeRender = function (renderer, scene, camera, ...rest) { if (!rec.gone) onRender(rec, renderer, camera); return prev.call(this, renderer, scene, camera, ...rest); };
    hook.frustumCulled = false;      // the hook mesh must reach the renderer every frame the apartment is in the scene
    S.recs.add(rec);
    const off = () => {
      if (rec.gone) return;
      rec.gone = true; S.recs.delete(rec);
      if (S.best === rec) S.best = null;
      if (S.active === rec) activate(null);
      release(rec);
    };
    root.addEventListener('removed', off);
    rec.dispose = off;
    return rec;
  } catch (e) { console.warn('[bake] attach', e); return null; }
}

const api = {
  /** the visitor's setting ("Realistic lighting"), stored in localStorage; default on */
  get enabled() { return S.enabled; },
  /** true while the apartment on screen is lit by a bake (contact shadows + corner darkening are in the picture) */
  get active() { return !!S.active && S.level > 0; },
  /** 0…1 — how much of the baked light is applied right now (fades in when the bake arrives) */
  get strength() { return S.active ? U.uBakeOn.value : 0; },
  /** suggested multiplier for screen-space AO intensity while `active` (the bake already holds the occlusion) */
  get aoHint() { return S.active ? 1 - 0.8 * S.level : 1; },
  get time() { return S.time; },
  get key() { return S.active ? S.active.key : null; },
  setEnabled(on) {
    on = !!on; if (on === S.enabled) return;
    S.enabled = on; lsSet(on ? '1' : '0');
    if (!on) activate(null);
    emit();
  },
  setTime(t) {
    if (!MIX[t] || t === S.time) return;
    S.time = t;
    if (S.active) mixClass(S.active.cls, t);
  },
  onChange(fn) { S.listeners.add(fn); return () => S.listeners.delete(fn); },
  /** which classes have a bake: Promise<{ classes: { '2A-11100': {...} } }> */
  index: loadIndex,
  has(unit) { return loadIndex().then(i => !!(i.classes && i.classes[bakeKey(unit)])); },
  _debug: { S, U, classes, MIX, TUNE, remix() { if (S.active) { S.active.cls.mixed = null; mixClass(S.active.cls, S.time); } } },
};
if (typeof window !== 'undefined') { window.VRC = window.VRC || {}; window.VRC.bakedLighting = api; }
export const BakedLighting = api;
