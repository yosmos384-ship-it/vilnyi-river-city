// Free (CC0) photographic assets for Medium / High graphics — nothing here is loaded on Low:
//   · image-based lighting from Poly Haven HDRIs (assets/pbr/env/*.jpg — small equirect JPEGs holding
//     (radiance / max)^(1/2.2), turned back into HDR and prefiltered with PMREM at runtime), and
//   · detail maps packed from ambientCG / Poly Haven sets (assets/pbr/detail/*.jpg — R,G = tangent-space normal,
//     B = roughness variation), layered on the procedural materials: the style keeps its own colours and patterns, the
//     photograph adds the fine relief and the uneven sheen.
// Sources and licences: assets/pbr/LICENSES.md.
//
//   const pbr = new PbrAssets(renderer, { touch });
//   pbr.setTier('low' | 'medium' | 'high');
//   scene.environment = pbr.pick(defaultEnv, outside, 'day' | 'dusk' | 'night', sunLight);   // HDRI once ready, else defaultEnv
//   pbr.owns(texture)                 // is this one of the HDRI environments?
//   pbr.watch(materialsModule)        // detail maps on every getMaterials() set (materials.js: onMaterials)
//   pbr.decorate(object3d)            // detail maps on commons materials, by material name
import * as THREE from 'three';

const BASE = new URL('../../assets/pbr/', import.meta.url);
// (assets/pbr/env/manifest.json — inlined so no extra request is needed)
const ENVS = {
  interior: { file: 'env/interior.jpg', max: 12, rgb: [0.8126, 0.7022, 0.6253], sunU: 0.5813 },
  day: { file: 'env/day.jpg', max: 24, rgb: [0.2613, 0.279, 0.3536], sunU: 0.599, sun: true },
  dusk: { file: 'env/dusk.jpg', max: 16, rgb: [0.637, 0.6168, 0.5914], sunU: 0.0527, sun: true },
  night: { file: 'env/night.jpg', max: 6, rgb: [0.1154, 0.0973, 0.0851], sunU: 0.212 },
};
// detail kinds: file stem, aspect (u : v) of the tile
const KINDS = { marble: 1, mineral: 1, fabric: 1, wood: 2, plaster: 1 };
// getMaterials() keys → [kind, tile width in metres, normal strength, roughness variation, albedo variation]
const RULES = {
  marble: ['marble', 1.3, 0.5, 0.9, 0.05], marbleDark: ['marble', 1.3, 0.5, 0.9, 0.06], counter: ['marble', 1.1, 0.5, 0.8, 0.05], stone: ['marble', 1.2, 0.5, 0.8, 0.05],
  floorHall: ['marble', 1.4, 0.4, 0.7, 0.04],
  wall: ['plaster', 0.9, 0.22, 0.5, 0.025], ceiling: ['plaster', 1.1, 0.14, 0.3, 0.02],
  fabric: ['fabric', 0.16, 0.5, 0.5, 0.06], fabricAccent: ['fabric', 0.16, 0.45, 0.5, 0.05], cushionA: ['fabric', 0.14, 0.5, 0.5, 0.06], cushionB: ['fabric', 0.14, 0.5, 0.5, 0.06], cushionC: ['fabric', 0.14, 0.5, 0.5, 0.06],
  linen: ['fabric', 0.13, 0.4, 0.4, 0.05], duvet: ['fabric', 0.13, 0.45, 0.4, 0.05], curtain: ['fabric', 0.15, 0.45, 0.4, 0.05], headboard: ['fabric', 0.16, 0.45, 0.5, 0.05], outdoorFabric: ['fabric', 0.16, 0.5, 0.5, 0.06],
  floorOut: ['mineral', 1.6, 0.22, 0.6, 0.05],
};
const PLANK_STYLES = new Set(['nordic', 'riviera']);            // floors laid as straight planks along u (materials.js widePlanks)
const WOOD_RULE = ['wood', 1.6, 0.35, 0.55, 0.04];
// commons.js material names (`vrc-<key>`): object-space projection — their UVs are not in metres
const COMMONS = {
  'vrc-marble': ['marble', 1.6, 0.4, 0.9, 0.04], 'vrc-marbleFloor': ['marble', 1.6, 0.4, 0.9, 0.04], 'vrc-nero': ['marble', 1.4, 0.4, 0.9, 0.05], 'vrc-stone': ['marble', 1.5, 0.4, 0.8, 0.04],
  'vrc-plaster': ['plaster', 1.0, 0.22, 0.5, 0.025], 'vrc-plasterW': ['plaster', 1.0, 0.22, 0.5, 0.025], 'vrc-ceilingP': ['plaster', 1.2, 0.14, 0.3, 0.02],
  'vrc-concrete': ['mineral', 2.2, 0.35, 0.7, 0.07], 'vrc-concreteLight': ['mineral', 2.2, 0.3, 0.6, 0.06], 'vrc-epoxy': ['mineral', 3.0, 0.05, 0.25, 0.03],
};

const VERT_DECL = /* glsl */`
uniform vec2 vrcDetailScale;
varying vec2 vVrcUv;
#ifdef VRC_DETAIL_OBJ
  varying vec3 vVrcP; varying vec3 vVrcN;
#endif
`;
const VERT_MAIN = /* glsl */`
#ifdef VRC_DETAIL_OBJ
  { vec3 p = transformed, n = objectNormal;
    #ifdef USE_INSTANCING
      p = (instanceMatrix * vec4(p, 1.0)).xyz; n = mat3(instanceMatrix) * n;
    #endif
    vVrcP = p; vVrcN = n; vVrcUv = vec2(0.0); }
#else
  vVrcUv = uv * vrcDetailScale;
#endif
`;
const FRAG_DECL = /* glsl */`
uniform sampler2D vrcDetailMap; uniform vec4 vrcDetail; uniform vec2 vrcDetailScale;
varying vec2 vVrcUv;
#ifdef VRC_DETAIL_OBJ
  varying vec3 vVrcP; varying vec3 vVrcN;
#endif
vec3 vrcD; vec2 vrcUv;
mat3 vrcFrame(vec3 eye, vec3 N, vec2 uv) {
  vec3 q0 = dFdx(eye), q1 = dFdy(eye); vec2 s0 = dFdx(uv), s1 = dFdy(uv);
  vec3 q1p = cross(q1, N), q0p = cross(N, q0), T = q1p * s0.x + q0p * s1.x, B = q1p * s0.y + q0p * s1.y;
  float d = max(dot(T, T), dot(B, B)); float k = d == 0.0 ? 0.0 : inversesqrt(d);
  return mat3(T * k, B * k, N);
}
`;
const FRAG_MAP = /* glsl */`
#ifdef VRC_DETAIL_OBJ
  { vec3 a = abs(vVrcN); vrcUv = (a.y >= a.x && a.y >= a.z ? vVrcP.xz : a.x >= a.z ? vVrcP.zy : vVrcP.xy) * vrcDetailScale; }
#else
  vrcUv = vVrcUv;
#endif
vrcD = texture2D(vrcDetailMap, vrcUv).xyz;
diffuseColor.rgb *= 1.0 + (vrcD.z - 0.5) * vrcDetail.z;
`;
const FRAG_ROUGH = /* glsl */`
roughnessFactor = clamp(roughnessFactor * (1.0 + (vrcD.z - 0.5) * vrcDetail.y), 0.045, 1.0);
`;
const FRAG_NORMAL = /* glsl */`
{ vec2 dn = (vrcD.xy * 2.0 - 1.0) * vrcDetail.x; mat3 f = vrcFrame(-vViewPosition, normal, vrcUv);
  normal = normalize(normal + f[0] * dn.x + f[1] * dn.y); }
`;

const VERT_FS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DECODE_FS = /* glsl */`precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform vec3 kUp; uniform vec3 kDown; uniform float shift;
  void main() { vec3 c = texture2D(tMap, vec2(fract(vUv.x + shift), vUv.y)).rgb; gl_FragColor = vec4(pow(c, vec3(2.2)) * mix(kDown, kUp, smoothstep(0.38, 0.62, vUv.y)), 1.0); }`;

export class PbrAssets {
  constructor(renderer, { touch = false } = {}) {
    this.renderer = renderer; this.touch = !!touch; this.tier = 'low';
    this.exterior = true;                       // HDRI sky outdoors too (false → interiors only)
    this._env = new Map();                      // kind → { ref, tex, img, state }
    this._own = new Set();
    this._det = new Map();                      // kind → { tex (placeholder first), loaded }
    this._mats = new Set();                     // patched materials
    this._mirrors = new Set();                  // flat mirrors: keep the caller's own environment
    this._neutral = null; this._unsub = null; this._tmp = new THREE.Vector3();
    this.onLoad = null;                         // () => {} after an asset arrived (a still frame may want a redraw)
  }

  setTier(tier) {
    const was = this.tier; this.tier = tier === 'medium' || tier === 'high' ? tier : 'low';
    if (was === this.tier) return;
    const on = this.tier !== 'low';
    for (const m of this._mats) this._strength(m, on);
    if (on) { for (const k of this._det.keys()) this._loadDetail(k); if (this._pending) { const p = this._pending; this._pending = null; for (const f of p) f(); } }
  }
  get on() { return this.tier !== 'low'; }

  // ---------------------------------------------------------------- image-based lighting
  owns(tex) { return this._own.has(tex); }
  /** The environment to use: the HDRI for this place and time once it is ready, otherwise `want` (the caller's own). */
  pick(want, outside, time, sun) {
    if (!this.on || !want || (outside && !this.exterior)) return want;
    const kind = outside ? (ENVS[time] ? time : 'dusk') : 'interior';
    let e = this._env.get(kind);
    if (!e) { e = { ref: null, tex: null, img: null, state: 'idle' }; this._env.set(kind, e); }
    if (e.state === 'failed') return want;
    if (!outside) for (const m of this._mirrors) if (m.envMap !== want) { m.envMap = want; m.needsUpdate = true; }
    if (e.tex && e.ref === want) return e.tex;
    if (e.state === 'idle') {
      e.state = 'loading';
      new THREE.TextureLoader().load(new URL(ENVS[kind].file, BASE).href, t => { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; e.img = t; e.state = 'loaded'; if (this.onLoad) this.onLoad(); },
        undefined, () => { e.state = 'failed'; console.warn('[pbr] environment map missing:', kind); });
    }
    if (e.state === 'loaded' && e.img) {
      try { this._bake(kind, e, want, sun); } catch (err) { console.warn('[pbr] environment failed', err); e.state = 'failed'; return want; }
      return e.tex || want;
    }
    return want;
  }
  // JPEG → HDR equirect → PMREM. The HDRI takes over the level and colour of the environment it replaces, separately for
  // the light from above and from below (so exposure, the fill lights and the styles' palettes stay as tuned) and brings
  // its own light distribution and reflections; its sun is turned to the scene's sun. Two passes: the first is measured
  // with the same probe as the reference and corrected.
  _bake(kind, e, ref, sun) {
    const r = this.renderer, E = ENVS[kind], img = e.img.image, w = img.width, h = img.height;
    const R = this._hemi(ref), lit = c => c[0] + c[1] + c[2] > 1e-4;
    const kU = [0, 1, 2].map(i => lit(R.up) ? E.max * R.up[i] / E.rgb[i] : E.max), kD = [0, 1, 2].map(i => lit(R.down) ? E.max * R.down[i] / E.rgb[i] : E.max);
    let shift = 0;
    if (E.sun && sun && sun.isLight) {
      const d = this._tmp.copy(sun.position); if (sun.target) d.sub(sun.target.position);
      if (d.x * d.x + d.z * d.z > 1e-6) shift = E.sunU - (Math.atan2(d.z, d.x) / (2 * Math.PI) + 0.5);
    }
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT_FS, fragmentShader: DECODE_FS, uniforms: { tMap: { value: e.img }, kUp: { value: new THREE.Vector3() }, kDown: { value: new THREE.Vector3() }, shift: { value: shift } }, depthTest: false, depthWrite: false, toneMapped: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), prev = r.getRenderTarget(), auto = r.autoClear;
    const pm = new THREE.PMREMGenerator(r);
    const make = () => { mat.uniforms.kUp.value.fromArray(kU); mat.uniforms.kDown.value.fromArray(kD); r.autoClear = true; r.setRenderTarget(rt); r.render(quad, cam); r.setRenderTarget(prev); return pm.fromEquirectangular(rt.texture).texture; };
    let out = null;
    try {
      out = make();
      if (lit(R.up) || lit(R.down)) {
        const M = this._hemi(out), fix = (k, want, got) => { for (let i = 0; i < 3; i++) if (got[i] > 1e-5 && want[i] > 0) k[i] *= Math.min(4, Math.max(0.25, want[i] / got[i])); };
        fix(kU, R.up, M.up); fix(kD, R.down, M.down);
        out.dispose(); out = make();
      }
      if (e.tex) { this._own.delete(e.tex); e.tex.dispose(); }
      e.tex = out; e.ref = ref; e.k = [kU, kD]; this._own.add(out);
    } finally { r.setRenderTarget(prev); r.autoClear = auto; rt.dispose(); mat.dispose(); quad.geometry.dispose(); pm.dispose(); }
  }
  // Light a prefiltered environment sends from above (`up`: what a floor receives) and from below (`down`): a matte
  // white ball lit by it alone, seen from above and from below → mean [r, g, b] of each view (8-bit target, linear).
  _hemi(env) {
    const r = this.renderer;
    if (!this._probe) {
      const scene = new THREE.Scene(), mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mat); scene.add(ball);
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); cam.up.set(0, 0, 1);
      this._probe = { scene, mat, ball, cam, rt: new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true }), px: new Uint8Array(16 * 16 * 4) };
    }
    const P = this._probe, gl = r.getContext(), prev = r.getRenderTarget(), auto = r.autoClear, cc = new THREE.Color(), ca = r.getClearAlpha();
    r.getClearColor(cc);
    const res = { up: [0, 0, 0], down: [0, 0, 0] };
    try {
      P.scene.environment = env; r.autoClear = true; r.setClearColor(0x000000, 0);
      for (const [key, y] of [['up', 3], ['down', -3]]) {
        let gainK = 0.25;
        for (let tries = 0; tries < 4; tries++) {
          P.mat.envMapIntensity = gainK; let n = 0, peak = 0; const c = [0, 0, 0];
          P.cam.position.set(0, y, 0); P.cam.lookAt(0, 0, 0);
          r.setRenderTarget(P.rt); r.render(P.scene, P.cam);
          gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, P.px);
          for (let i = 0; i < P.px.length; i += 4) if (P.px[i + 3] > 250) { n++; c[0] += P.px[i]; c[1] += P.px[i + 1]; c[2] += P.px[i + 2]; peak = Math.max(peak, P.px[i], P.px[i + 1], P.px[i + 2]); }
          const mean = n ? (c[0] + c[1] + c[2]) / (3 * n * 255) : 0; res[key] = c.map(v => n ? v / n / 255 / gainK : 0);
          if (peak > 235 && gainK > 0.01) { gainK /= 4; continue; }                                                // clipped: measure again, darker
          if (mean < 0.12 && mean > 0 && gainK < 60) { gainK = Math.min(64, gainK * Math.min(8, 0.4 / mean)); continue; }   // too dark for 8 bits
          break;
        }
      }
    } finally { P.scene.environment = null; r.setRenderTarget(prev); r.autoClear = auto; r.setClearColor(cc, ca); }
    return res;
  }

  // ---------------------------------------------------------------- detail maps
  _placeholder() {
    if (!this._neutral) { const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); t.needsUpdate = true; this._neutral = t; }
    return this._neutral;
  }
  _detail(kind) {
    let d = this._det.get(kind);
    if (!d) { d = { uniform: { value: this._placeholder() }, state: 'idle' }; this._det.set(kind, d); if (this.on) this._loadDetail(kind); }
    return d;
  }
  _loadDetail(kind) {
    const d = this._det.get(kind); if (!d || d.state !== 'idle') return;
    d.state = 'loading';
    const size = this.tier === 'high' && !this.touch ? 1024 : 512;
    new THREE.TextureLoader().load(new URL(`detail/${kind}_${size}.jpg`, BASE).href, t => {
      t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      try { t.anisotropy = Math.min(this.touch ? 4 : 8, this.renderer.capabilities.getMaxAnisotropy()); } catch { /* */ }
      d.uniform.value = t; d.state = 'ready'; if (this.onLoad) this.onLoad();
    }, undefined, () => { d.state = 'failed'; console.warn('[pbr] detail map missing:', kind); });
  }
  _strength(mat, on) { const u = mat.userData.vrcDetail; if (u) u.k.value.copy(on ? u.full : ZERO); }

  /** Layer a detail map on a MeshStandard/Physical material. mode 'uv' (UVs in metres) or 'obj' (object-space projection). */
  apply(mat, rule, mode = 'uv') {
    if (!mat || !mat.isMeshStandardMaterial || mat.userData.vrcDetail || !rule) return false;
    const [kind, tile, kn, kr, ka] = rule, d = this._detail(kind), asp = KINDS[kind] || 1;
    const u = { full: new THREE.Vector4(kn, kr, ka, 0), k: { value: new THREE.Vector4() }, scale: { value: new THREE.Vector2(1 / tile, asp / tile) }, map: d.uniform };
    mat.userData.vrcDetail = u; this._strength(mat, this.on);
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey, obj = mode === 'obj';
    mat.onBeforeCompile = function (sh, renderer) {
      if (prev) prev.call(this, sh, renderer);
      sh.uniforms.vrcDetailMap = u.map; sh.uniforms.vrcDetail = u.k; sh.uniforms.vrcDetailScale = u.scale;
      const C = '#include <common>', def = obj ? '#define VRC_DETAIL_OBJ\n' : '';
      sh.vertexShader = sh.vertexShader.replace(C, C + '\n' + def + VERT_DECL).replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
      sh.fragmentShader = sh.fragmentShader.replace(C, C + '\n' + def + FRAG_DECL)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_MAP)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL);
    };
    mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + (obj ? '|vrc-detail-o' : '|vrc-detail-u'); };
    mat.needsUpdate = true;
    this._mats.add(mat);
    return true;
  }
  _set(m, id) {
    for (const k in RULES) { const mat = m[k], r = RULES[k]; if (mat && mat.isMeshStandardMaterial && !mat.transparent && (r[0] === 'fabric' || !(mat.sheen > 0))) this.apply(mat, r, 'uv'); }
    if (PLANK_STYLES.has(id) && m.floor) this.apply(m.floor, WOOD_RULE, 'uv');
    if (m.mirror && m.mirror.isMeshStandardMaterial) this._mirrors.add(m.mirror);
  }
  /** Decorate every getMaterials() set — now and from now on. Sets made while the tier is Low are decorated when it rises. */
  watch(materials) {
    if (this._unsub || !materials || typeof materials.onMaterials !== 'function') return;
    this._unsub = materials.onMaterials((m, id) => { if (this.on) this._set(m, id); else (this._pending ||= []).push(() => this._set(m, id)); });
  }
  /** Decorate commons materials below `root` (by material name). No-op on Low (call it again for the scene when the tier rises). */
  decorate(root) {
    if (!root || !this.on) return;
    root.traverse(o => { const ms = o.material; if (!ms) return; for (const m of Array.isArray(ms) ? ms : [ms]) { const rule = m && COMMONS[m.name]; if (rule) this.apply(m, rule, 'obj'); } });
  }

  dispose() {
    if (this._unsub) this._unsub();
    for (const e of this._env.values()) { if (e.tex) e.tex.dispose(); if (e.img) e.img.dispose(); }
    for (const d of this._det.values()) if (d.uniform.value !== this._neutral) d.uniform.value.dispose();
    if (this._neutral) this._neutral.dispose();
    if (this._probe) { this._probe.rt.dispose(); this._probe.mat.dispose(); this._probe.ball.geometry.dispose(); }
    this._env.clear(); this._det.clear(); this._own.clear(); this._mats.clear(); this._pending = null; this.onLoad = null;
  }
}
const ZERO = new THREE.Vector4(0, 0, 0, 0);
