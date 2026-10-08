// Post-processing + adaptive quality for the walkthrough renderer (self-contained; lazily usable by other modules).
//
//   const fx = new PostFX(renderer, { touch });
//   fx.setContext('indoor' | 'outdoor' | 'drive' | 'yacht' | <custom>, 'day' | 'dusk' | 'night');   // cheap, every frame
//   fx.render(scene, camera, dt);            // instead of renderer.render(scene, camera)
//   fx.setTier('auto' | 'low' | 'medium' | 'high');   fx.getTier() → { mode, tier, scale, ao, bloom, msaa }
//   fx.setExposure(1.1);                     // multiplier on renderer.toneMappingExposure (Medium / High only)
//   fx.setOverrides('drive', { ao: 0.5, bloom: 1.2, vignette: 0.3 });   // per-mode look
//   fx.lockContext('casino' | 'heli' | 'city' | <custom> | null);       // a mode that owns the look until it lets go
//
// Tiers.  low: renderer.render() straight to the canvas — exactly the look before this module existed.
//         medium: scene → MSAA target, bloom, colour grade, vignette, dither.
//         high: + ground-truth ambient occlusion (three's GTAOShader, half resolution, depth-aware blur and upsample),
//               wider bloom, depth of field in photo mode.
// The scene target is flagged like an XR target, so three applies its own tone mapping (ACES filmic) and sRGB encoding
// in the material shaders exactly as it does for the canvas: the SAME shader programs serve every tier (no recompile
// when the tier changes, the idle-time pre-warm stays valid), `toneMapped: false` materials, fog, the lift's stencil
// mirror and transparent glass look the same, and an 8-bit target is enough (no float-buffer extension → iOS safe).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const LS_MODE = 'vrc.gfx', LS_AUTO = 'vrc.gfx.auto';
export const GFX_MODES = ['auto', 'low', 'medium', 'high'];
const ORDER = { low: 0, medium: 1, high: 2 };
const SCALES = [1, 0.85, 0.72];

/** Settings-panel texts (the 8 site languages). */
export const GFX_I18N = {
  en: { title: 'Graphics', auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' },
  he: { title: 'גרפיקה', auto: 'אוטומטי', low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' },
  ro: { title: 'Grafică', auto: 'Auto', low: 'Scăzută', medium: 'Medie', high: 'Înaltă' },
  ru: { title: 'Графика', auto: 'Авто', low: 'Низкая', medium: 'Средняя', high: 'Высокая' },
  uk: { title: 'Графіка', auto: 'Авто', low: 'Низька', medium: 'Середня', high: 'Висока' },
  fr: { title: 'Graphismes', auto: 'Auto', low: 'Faible', medium: 'Moyen', high: 'Élevé' },
  it: { title: 'Grafica', auto: 'Auto', low: 'Bassa', medium: 'Media', high: 'Alta' },
  de: { title: 'Grafik', auto: 'Auto', low: 'Niedrig', medium: 'Mittel', high: 'Hoch' },
};
export function gfxText(lang, key) { const l = GFX_I18N[String(lang || 'en').slice(0, 2)] || GFX_I18N.en; return l[key] || GFX_I18N.en[key] || key; }

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
/** The stored choice ('auto' when nothing valid is stored). */
export function storedGfxMode() { const m = lsGet(LS_MODE); return GFX_MODES.includes(m) ? m : 'auto'; }
// last Auto result: a measured one is kept for a week, one forced by a slow session for a day (then measured again)
function autoGet() { const [t, ts, days] = String(lsGet(LS_AUTO) || '').split('|'); return ORDER[t] != null && Date.now() - (+ts || 0) < (+days || 7) * 864e5 ? t : null; }
function autoSet(t, days = 7) { lsSet(LS_AUTO, t + '|' + Date.now() + '|' + days); }

// Look per context; anything missing falls back to `base`. ao / bloom / vignette are strengths (0 = off).
const LOOKS = {
  base: { ao: 1, aoRadius: 0.5, bloom: 1, threshold: 0.9, vignette: 0.2, contrast: 1.045, saturation: 1.05, exposure: 1, dof: 0, dither: 1 },   // dof: opt-in (photo mode, High) — e.g. setOverrides('indoor', { dof: 1 })
  indoor: {},
  outdoor: { ao: 0.75, aoRadius: 1.1, bloom: 0.8, vignette: 0.16 },
  drive: { ao: 0.6, aoRadius: 0.9, bloom: 1.1, vignette: 0.26, dof: 0 },
  yacht: { ao: 0.65, aoRadius: 0.8, bloom: 1.15, vignette: 0.2 },
  heli: { ao: 0.5, aoRadius: 1.6, bloom: 1.1, vignette: 0.24, dof: 0 },
  casino: { ao: 0.8, bloom: 1.25, vignette: 0.26 },
  city: { ao: 0.6, aoRadius: 1.2, bloom: 1.1, vignette: 0.24, dof: 0 },
};
// Time of day: exposure trim, bloom gain and split toning (shadow tint, highlight tint — multipliers in display space).
const TIMES = {
  day: { exposure: 1.0, bloom: 0.85, shadow: [0.992, 0.998, 1.012], light: [1.006, 1.002, 0.992] },
  dusk: { exposure: 1.02, bloom: 1.0, shadow: [0.99, 0.996, 1.016], light: [1.012, 1.002, 0.986] },
  night: { exposure: 1.04, bloom: 1.2, shadow: [0.985, 0.994, 1.022], light: [1.01, 1.002, 0.988] },
  neutral: { exposure: 1, bloom: 1, shadow: [1, 1, 1], light: [1, 1, 1] },
};

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const COMMON = /* glsl */`
  vec3 toLin(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
  vec3 toDisp(vec3 l) { return max(1.055 * pow(max(l, vec3(0.0)), vec3(0.416666667)) - 0.055, vec3(0.0)); }
  float unpack16(vec2 v) { return v.x + v.y / 255.0; }
  vec2 pack16(float v) { v = clamp(v, 0.0, 1.0) * 255.0; float hi = floor(v); return vec2(hi / 255.0, v - hi); }
`;
// AO blur: 5 taps per axis = the period of GTAO's 5×5 magic-square noise, weighted by depth (kept in .gb of the AO target)
const BLUR_FRAG = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tAo; uniform vec2 dir; uniform float far;
  ${COMMON}
  void main() {
    vec4 c = texture2D(tAo, vUv); float s = unpack16(c.gb), z = s * s * far, tol = 0.06 * z + 0.03;
    float sum = c.r, w = 1.0;
    for (int i = -2; i <= 2; i++) { if (i == 0) continue;
      vec4 t = texture2D(tAo, vUv + dir * float(i)); float st = unpack16(t.gb), k = max(0.0, 1.0 - abs(st * st * far - z) / tol);
      sum += t.r * k; w += k; }
    gl_FragColor = vec4(sum / w, c.gb, 1.0);
  }`;
// Bloom: bright-pass + box downsample (4 bilinear taps = an exact 4×4 box), then dual-filter down / up. Values are
// stored square-rooted so 8-bit targets hold the faint tails without banding.
const BRIGHT_FRAG = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform vec2 texel; uniform float threshold;
  ${COMMON}
  vec3 pick(vec2 uv) { vec3 c = texture2D(tMap, uv).rgb; float b = max(c.r, max(c.g, c.b)); return toLin(c) * smoothstep(threshold, 1.0, b); }
  void main() { vec3 s = pick(vUv + texel * vec2(-1.0, -1.0)) + pick(vUv + texel * vec2(1.0, -1.0)) + pick(vUv + texel * vec2(-1.0, 1.0)) + pick(vUv + texel * vec2(1.0, 1.0));
    gl_FragColor = vec4(sqrt(s * 0.25), 1.0); }`;
const DOWN_FRAG = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform vec2 texel;
  vec3 g(vec2 uv) { vec3 c = texture2D(tMap, uv).rgb; return c * c; }
  void main() { vec3 s = g(vUv) * 4.0 + g(vUv + texel * vec2(-1.0, -1.0)) + g(vUv + texel * vec2(1.0, -1.0)) + g(vUv + texel * vec2(-1.0, 1.0)) + g(vUv + texel * vec2(1.0, 1.0));
    gl_FragColor = vec4(sqrt(s * 0.125), 1.0); }`;
const UP_FRAG = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform sampler2D tAdd; uniform vec2 texel; uniform float spread;
  vec3 g(vec2 uv) { vec3 c = texture2D(tMap, uv).rgb; return c * c; }
  void main() { vec2 t = texel;
    vec3 s = (g(vUv + t * vec2(-2.0, 0.0)) + g(vUv + t * vec2(2.0, 0.0)) + g(vUv + t * vec2(0.0, -2.0)) + g(vUv + t * vec2(0.0, 2.0))) / 12.0
           + (g(vUv + t * vec2(-1.0, -1.0)) + g(vUv + t * vec2(1.0, -1.0)) + g(vUv + t * vec2(-1.0, 1.0)) + g(vUv + t * vec2(1.0, 1.0))) / 6.0;
    vec3 a = texture2D(tAdd, vUv).rgb; gl_FragColor = vec4(sqrt(s * spread + a * a), 1.0); }`;
// Final composite: (AO, bloom in linear light) → contrast, saturation, split toning, vignette, dither.
const FINAL_FRAG = /* glsl */`
  precision highp float; varying vec2 vUv;
  uniform sampler2D tMap; uniform vec4 grade;   // contrast, saturation, vignette, dither
  uniform vec3 tintLo; uniform vec3 tintHi;
  #ifdef USE_BLOOM
    uniform sampler2D tBloom; uniform vec2 bloom;
  #endif
  #ifdef USE_AO
    uniform highp sampler2D tDepth; uniform sampler2D tAo; uniform vec2 aoSize; uniform vec3 aoP;   // strength, near, far
    uniform float aoFar;
  #endif
  ${COMMON}
  #ifdef USE_AO
  float viewZ(float d) { return aoP.y * aoP.z / (aoP.z - d * (aoP.z - aoP.y)); }
  float aoAt(vec2 uv) {
    float d = texture2D(tDepth, uv).x; if (d >= 1.0) return 1.0;
    float z = viewZ(d), tol = 0.05 * z + 0.02;
    vec2 p = uv * aoSize - 0.5, f = fract(p), b = (floor(p) + 0.5) / aoSize, o = 1.0 / aoSize;
    float sum = 0.0, w = 0.0;
    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
      vec4 t = texture2D(tAo, b + o * vec2(float(i), float(j))); float s = unpack16(t.gb);
      float k = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y) * max(0.0, 1.0 - abs(s * s * aoFar - z) / tol) + 1e-4;
      sum += t.r * k; w += k; }
    return sum / w;
  }
  #endif
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb;
    #if defined(USE_AO) || defined(USE_BLOOM)
      vec3 l = toLin(c);
      #ifdef USE_AO
        float ao = mix(1.0, aoAt(vUv), aoP.x);
        l *= mix(vec3(ao), vec3(1.0), 0.35 * c * c);   // bright (lit / emissive) surfaces keep more of their light
      #endif
      #ifdef USE_BLOOM
        vec3 b = texture2D(tBloom, vUv).rgb; b = b * b * bloom.x;
        l += max(b - l, vec3(0.0)) * bloom.y;        // glow only where the surroundings are darker: large bright areas keep their level
      #endif
      c = toDisp(l);
    #endif
    float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(y), c, grade.y);
    c = mix(c, c * c * (3.0 - 2.0 * c), grade.x - 1.0);                 // gentle S-curve
    c *= mix(tintLo, tintHi, smoothstep(0.0, 0.75, y));
    vec2 q = (vUv - 0.5) * 2.0; float r2 = dot(q, q) * 0.5;             // 0 centre · 0.5 edge centres · 1 corners
    c *= 1.0 - grade.z * smoothstep(0.22, 1.05, r2);
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    gl_FragColor = vec4(c + (n - 0.5) * grade.w, 1.0);
  }`;
const COPY_FRAG = /* glsl */`precision highp float; varying vec2 vUv; uniform sampler2D tMap; void main() { gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0); }`;
// GPU probe: a fixed fill-rate workload (texture taps), timed with a 1-pixel read-back.
const PROBE_FRAG = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform float k;
  void main() { vec3 s = vec3(0.0); for (int i = 0; i < 32; i++) { float a = float(i) * 0.61803 + k; s += texture2D(tMap, vUv * 3.0 + vec2(cos(a), sin(a)) * 0.07 * float(i)).rgb; } gl_FragColor = vec4(s / 32.0, 1.0); }`;

function softwareGL(gl) {
  try { const e = gl.getExtension('WEBGL_debug_renderer_info'); const s = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); return /swiftshader|llvmpipe|software|softpipe|basic render/i.test(s); } catch { return false; }
}

export class PostFX {
  constructor(renderer, { touch = false, adaptive = true } = {}) {
    this.renderer = renderer; this.touch = !!touch; this.adaptive = adaptive;
    this.supported = !!renderer.capabilities.isWebGL2;     // multisampled targets + depth textures without extensions
    this.mode = storedGfxMode();
    this.tier = 'low'; this.scale = 1; this.ceil = 'high';
    this.ctx = 'indoor'; this.time = 'dusk';
    this.looks = {}; for (const k in LOOKS) this.looks[k] = { ...LOOKS[k] };
    this.exposure = 1;
    this.onChange = null;                 // (state) => {} — tier / scale changed
    this.msaa = 4; this._fxaaOnly = false;
    this._bakeK = 1;
    this._rt = null; this._size = new THREE.Vector2(); this._c1 = new THREE.Color(); this._c2 = new THREE.Color(); this._c3 = new THREE.Color();
    this._last = 0; this._acc = 0; this._n = 0; this._bad = 0; this._good = 0; this._cool = 4; this._needGood = 4; this._trial = null; this._checked = 0;
    this._now = () => performance.now();
    this._mods = null; this._modsP = null;
    this._applyMode(false);
  }

  // ---------------------------------------------------------------- public API
  /** 'auto' | 'low' | 'medium' | 'high'. Stored (unless store === false). */
  setTier(mode, store = true) {
    if (!GFX_MODES.includes(mode)) return this.getTier();
    this.mode = mode; if (store) lsSet(LS_MODE, mode);
    this.ceil = 'high'; this._trial = null; this._applyMode(true);
    return this.getTier();
  }
  getTier() { const t = this._ok === false ? 'low' : this.tier; return { mode: this.mode, tier: t, scale: t === 'low' ? 1 : this.scale, ao: t === 'high', bloom: t !== 'low', msaa: t === 'low' ? null : (this._fxaaOnly ? 0 : this.msaa), supported: this.supported }; }
  /** Multiplier on renderer.toneMappingExposure while the scene is drawn (Medium / High). */
  setExposure(k) { this.exposure = k > 0 ? +k : 1; }
  /** Context ('indoor', 'outdoor', 'drive', 'yacht', or any name given to setOverrides) and time of day. */
  setContext(ctx, time) { if (ctx) this.ctx = this._lock || ctx; if (time) this.time = time; }
  /** A mode that owns the look for a while (a game, a cut-scene): its context wins over setContext() until lockContext(null). */
  lockContext(ctx) { this._lock = ctx || null; if (ctx) this.ctx = ctx; }
  /** Per-mode look: any of { ao, aoRadius, bloom, threshold, vignette, contrast, saturation, exposure, dof }. */
  setOverrides(ctx, o) { this.looks[ctx] = { ...(this.looks[ctx] || {}), ...(o || {}) }; }
  /** True when the scene goes through the off-screen target (so a caller's own canvas read-backs stay valid either way). */
  get active() { return this.tier !== 'low' && this._ok !== false; }

  /** Draw one frame. opts.photo: full-resolution still (no adaptive scale; depth of field on High). */
  render(scene, camera, dt, opts) {
    const r = this.renderer;
    if (this.adaptive && !(opts && opts.photo)) this._adapt();
    if (this.tier === 'low' || this._ok === false || !this._mods) {
      if (this.tier !== 'low' && this._ok !== false) this._load();
      else if (this._rt) this._freeTargets();          // back on Low: give the off-screen buffers back
      r.render(scene, camera); return;
    }
    try { this._compose(scene, camera, opts || null); }
    catch (e) {
      console.warn('[postfx] disabled', e); this._ok = false;
      try { r.setRenderTarget(null); r.autoClear = true; r.render(scene, camera); } catch { /* */ }
      this._emit();
    }
  }

  dispose() {
    this._freeTargets();
    if (this._q) { for (const k in this._q) { this._q[k].material.dispose(); } this._q = null; }
    if (this._noise) this._noise.dispose();
    clearTimeout(this._trialT); this.onChange = null;
  }

  // ---------------------------------------------------------------- tier selection
  _applyMode(emit) {
    let t = this.mode;
    if (t === 'auto') t = this._autoTier();
    if (!this.supported) t = 'low';
    const was = this.tier; this.tier = t; this.scale = 1; this._bad = this._good = 0; this._cool = 3; this._acc = this._n = 0;
    if (t !== 'low') this._load();
    if (emit || was !== t) this._emit();
  }
  _autoTier() {
    const gl = this.renderer.getContext();
    if (!this.supported || softwareGL(gl)) return 'low';
    const stored = autoGet();
    if (stored) { if (this.touch && stored === 'medium') this._trial = 'pending'; return stored; }
    let ms = 999; try { ms = this._probe(); } catch (e) { console.warn('[postfx] probe failed', e); }
    this.probeMs = ms;
    // (thresholds are estimates — see the report: not calibrated on real phones)
    let t = ms < 35 ? 'high' : ms < 110 ? 'medium' : 'low';
    if (this.touch && t === 'high') { t = 'medium'; this._trial = 'pending'; }   // phones start at Medium, High is tried once
    autoSet(t);
    return t;
  }
  // ~67 M texture taps into a 512² target; returns milliseconds (first run warms the program up)
  _probe() {
    const r = this.renderer, gl = r.getContext(), N = 512;
    const rt = new THREE.WebGLRenderTarget(N, N, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const d = new Uint8Array(64 * 64 * 4); for (let i = 0; i < d.length; i++) d[i] = (i * 2654435761 >>> 24) & 255;
    const tex = new THREE.DataTexture(d, 64, 64); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: PROBE_FRAG, uniforms: { tMap: { value: tex }, k: { value: 0 } }, depthTest: false, depthWrite: false });
    const q = new FullScreenQuad(mat), px = new Uint8Array(4), prev = r.getRenderTarget(), auto = r.autoClear;
    let ms = 999;
    try {
      r.autoClear = false; r.setRenderTarget(rt);
      const run = n => { for (let i = 0; i < n; i++) { mat.uniforms.k.value = i; q.render(r); } gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      run(1);
      let t0 = this._now(); run(2); ms = (this._now() - t0) * 4;
      if (ms < 240) { t0 = this._now(); run(8); ms = this._now() - t0; }      // (a slow GPU is not made to finish the full load)
    } finally { r.setRenderTarget(prev); r.autoClear = auto; rt.dispose(); tex.dispose(); mat.dispose(); }
    return ms;
  }
  _emit() { if (typeof this.onChange === 'function') { try { this.onChange(this.getTier()); } catch (e) { console.warn(e); } } }

  // Frame-rate watch: 2 s windows. Slow → render scale down (1 → 0.85 → 0.72), then effects off (High → Medium → Low,
  // Auto only). Fast for a while → scale back up; phones that start at Medium get one try at High.
  _adapt() {
    const now = this._now(), gap = (now - this._last) / 1000; this._last = now;
    if (!(gap > 0) || gap > 0.4 || (typeof document !== 'undefined' && document.hidden)) { this._acc = this._n = 0; return; }   // stalls (loading, tab switch) are not frame rate
    if (this._cool > 0) { this._cool -= gap; return; }
    this._acc += gap; this._n++;
    if (this._acc < 2) return;
    const fps = this._n / this._acc; this._acc = this._n = 0; this.fps = fps;
    if (this.tier === 'low') return;
    if (fps < 28) { this._good = 0; if (++this._bad >= 2) this._stepDown(); }
    else if (fps > 50) { this._bad = 0; if (++this._good >= this._needGood) this._stepUp(); }
    else { this._bad = 0; this._good = Math.max(0, this._good - 1); }
  }
  _stepDown() {
    this._bad = this._good = 0; this._cool = 2.5;
    if (this._trial === 'running') { this._trial = 'failed'; this.tier = 'medium'; this.ceil = 'medium'; this.scale = 1; autoSet('medium', 7); return this._emit(); }
    const i = SCALES.indexOf(this.scale);
    if (i < SCALES.length - 1) { this.scale = SCALES[i + 1]; this._needGood = Math.min(40, this._needGood * 2); return this._emit(); }
    if (this.mode !== 'auto') return;                       // a manual tier keeps its effects
    this.tier = this.tier === 'high' ? 'medium' : 'low'; this.ceil = this.tier; this.scale = this.tier === 'low' ? 1 : SCALES[1];
    autoSet(this.tier, 1);
    this._emit();
  }
  _stepUp() {
    this._good = 0; this._cool = 2.5;
    const i = SCALES.indexOf(this.scale);
    if (i > 0) { this.scale = SCALES[i - 1]; return this._emit(); }
    if (this.mode === 'auto' && this._trial === 'pending' && this.tier === 'medium' && ORDER[this.ceil] >= ORDER.high) {
      this._trial = 'running'; this.tier = 'high'; this._load();
      this._trialT = setTimeout(() => { if (this._trial === 'running') { this._trial = 'passed'; autoSet('high'); } }, 20000);
      this._emit();
    }
  }

  // ---------------------------------------------------------------- resources
  _load() {
    if (this._mods || this._modsP) return this._modsP;
    const need = [import('three/addons/shaders/GTAOShader.js'), import('three/addons/shaders/FXAAShader.js'), import('three/addons/shaders/BokehShader.js')];
    this._modsP = Promise.all(need).then(([g, f, b]) => { this._mods = { g, f, b }; this._build(); this._emit(); })
      .catch(e => { console.warn('[postfx] effects unavailable', e); this._ok = false; this._emit(); });
    return this._modsP;
  }
  /** Resolves when the effect shaders are loaded (immediately on Low). */
  ready() { return this.tier === 'low' ? Promise.resolve() : (this._load() || Promise.resolve()); }

  _build() {
    const M = this._mods, mk = (frag, uniforms, defines) => new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false }));
    const G = M.g.GTAOShader;
    this._noise = M.g.generateMagicSquareNoise(5);
    const aoFrag = G.fragmentShader
      .replace('#include <packing>', '#include <packing>\n' + COMMON)
      .split('discard;').join('gl_FragColor = vec4(1.0);');           // sky: unoccluded, far (no clear needed)
    const aoMat = n => { const q = new FullScreenQuad(new THREE.ShaderMaterial({
      defines: { ...G.defines, SAMPLES: n, NORMAL_VECTOR_TYPE: 0, FRAGMENT_OUTPUT: 'vec4(ao, pack16(sqrt(clamp(-viewPos.z / cameraFar, 0.0, 1.0))), 1.0)' },
      uniforms: THREE.UniformsUtils.clone(G.uniforms), vertexShader: G.vertexShader, fragmentShader: aoFrag, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false }));
      q.material.uniforms.tNoise.value = this._noise; return q; };
    const F = M.f.FXAAShader, B = M.b.BokehShader;
    const dofFrag = B.fragmentShader.replace('uniform float focus;', '').replace('float factor = ( focus + viewZ );', 'float factor = ( - getViewZ( getDepth( vec2( 0.5 ) ) ) + viewZ );');
    this._q = {
      ao: aoMat(this.touch ? 8 : 12),
      blur: mk(BLUR_FRAG, { tAo: { value: null }, dir: { value: new THREE.Vector2() }, far: { value: 1 } }),
      bright: mk(BRIGHT_FRAG, { tMap: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0.86 } }),
      down: mk(DOWN_FRAG, { tMap: { value: null }, texel: { value: new THREE.Vector2() } }),
      up: mk(UP_FRAG, { tMap: { value: null }, tAdd: { value: null }, texel: { value: new THREE.Vector2() }, spread: { value: 1 } }),
      fxaa: new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(F.uniforms), vertexShader: F.vertexShader, fragmentShader: F.fragmentShader, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false })),
      dof: new FullScreenQuad(new THREE.ShaderMaterial({ defines: { DEPTH_PACKING: 0, PERSPECTIVE_CAMERA: 1 }, uniforms: THREE.UniformsUtils.clone(B.uniforms), vertexShader: B.vertexShader, fragmentShader: dofFrag, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false })),
      copy: mk(COPY_FRAG, { tMap: { value: null } }),
    };
    const fu = () => ({ tMap: { value: null }, grade: { value: new THREE.Vector4(1, 1, 0, 1 / 255) }, tintLo: { value: new THREE.Vector3(1, 1, 1) }, tintHi: { value: new THREE.Vector3(1, 1, 1) },
      tBloom: { value: null }, bloom: { value: new THREE.Vector2() }, tDepth: { value: null }, tAo: { value: null }, aoSize: { value: new THREE.Vector2() }, aoP: { value: new THREE.Vector3() }, aoFar: { value: 1 } });
    this._q.final = mk(FINAL_FRAG, fu(), { USE_BLOOM: '' });
    this._q.finalAo = mk(FINAL_FRAG, fu(), { USE_BLOOM: '', USE_AO: '' });
  }

  _freeTargets() { const t = this._rt; if (!t) return; this._rt = null; for (const k of ['scene', 'aoA', 'aoB', 'auxA', 'auxB']) if (t[k]) { if (t[k].depthTexture) t[k].depthTexture.dispose(); t[k].dispose(); } for (const x of t.down || []) x.dispose(); for (const x of t.up || []) x.dispose(); }

  _targets(w, h, wantAo, samples, levels, first) {
    const t = this._rt;
    if (t && t.w === w && t.h === h && t.ao === wantAo && t.samples === samples && t.levels === levels && t.first === first) return t;
    this._freeTargets();
    const ldr = (W, H, o = {}) => new THREE.WebGLRenderTarget(Math.max(1, W), Math.max(1, H), { depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, ...o });
    const scene = ldr(w, h, { depthBuffer: true, stencilBuffer: true, samples, colorSpace: THREE.SRGBColorSpace });
    // Flagged as an XR target: materials then tone-map and encode sRGB in their own shaders, as they do for the canvas.
    scene.isXRRenderTarget = true; scene.texture.internalFormat = 'RGBA8';
    const dt = new THREE.DepthTexture(w, h); dt.format = THREE.DepthStencilFormat; dt.type = THREE.UnsignedInt248Type; dt.minFilter = dt.magFilter = THREE.NearestFilter;
    scene.depthTexture = dt;
    const n = { w, h, ao: wantAo, samples, levels, first, scene, down: [], up: [] };
    if (wantAo) { const aw = Math.ceil(w / 2), ah = Math.ceil(h / 2); n.aoA = ldr(aw, ah, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }); n.aoB = ldr(aw, ah, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }); }
    let bw = Math.ceil(w / first), bh = Math.ceil(h / first);
    for (let i = 0; i < levels; i++) { n.down.push(ldr(bw, bh)); if (i < levels - 1) n.up.push(ldr(bw, bh)); bw = Math.ceil(bw / 2); bh = Math.ceil(bh / 2); }
    this._rt = n; this._checked = 0;
    return n;
  }
  _aux(t, k) { return t[k] || (t[k] = new THREE.WebGLRenderTarget(t.w, t.h, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false })); }

  /** Approximate GPU memory of the off-screen targets, bytes (for diagnostics). */
  memory() {
    const t = this._rt; if (!t) return { targets: 0, bytes: 0 };
    let n = 1, b = t.w * t.h * 4 * (1 + t.samples) + t.w * t.h * 4 * (1 + t.samples);
    const add = x => { if (x) { n++; b += x.width * x.height * 4; } };
    add(t.aoA); add(t.aoB); add(t.auxA); add(t.auxB); t.down.forEach(add); t.up.forEach(add);
    return { targets: n, bytes: b };
  }

  // ---------------------------------------------------------------- the frame
  _look() { const b = this.looks.base, c = this.looks[this.ctx] || {}, o = {}; for (const k in b) o[k] = c[k] != null ? c[k] : b[k]; return o; }

  _compose(scene, camera, opts) {
    const r = this.renderer, Q = this._q, photo = !!(opts && opts.photo), high = this.tier === 'high';
    const L = this._look(), T = TIMES[this.time] || TIMES.dusk;
    r.getDrawingBufferSize(this._size);
    const sc = photo ? 1 : this.scale;
    const w = Math.max(2, Math.round(this._size.x * sc)), h = Math.max(2, Math.round(this._size.y * sc));
    const useDof = photo && high && L.dof > 0, useAo = high && L.ao > 0;
    let samples = this._fxaaOnly ? 0 : this.msaa; if (w * h > (photo ? 1.6e6 : 4.2e6)) samples = 0;   // large stills are supersampled already: FXAA instead of 4× buffers
    const t = this._targets(w, h, high, samples, high ? 5 : 4, high ? 2 : 4);
    const gl = r.getContext();
    if (this._checked < 2) for (let i = 0; i < 8 && gl.getError(); i++) { /* drain: only errors of this frame count below */ }

    // 1 — the scene, tone-mapped and sRGB-encoded by its own shaders (as on the canvas)
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear, e0 = r.toneMappingExposure;
    const bg = scene.background, fog = scene.fog, bgCol = bg && bg.isColor ? bg : null, a0 = r.getClearAlpha();
    // three converts the clear colour and the fog colour to the output space only when it draws to the canvas
    if (bgCol) { this._c1.copy(bgCol); bgCol.convertLinearToSRGB(); } else if (!bg) { r.getClearColor(this._c1); r.setClearColor(this._c3.copy(this._c1).convertLinearToSRGB(), a0); }
    if (fog) { this._c2.copy(fog.color); fog.color.convertLinearToSRGB(); }
    r.toneMappingExposure = e0 * this.exposure * L.exposure * T.exposure * (useAo ? 1.02 : 1);
    try { r.autoClear = true; r.setRenderTarget(t.scene); r.render(scene, camera); }
    finally {
      r.toneMappingExposure = e0;
      if (bgCol) bgCol.copy(this._c1); else if (!bg) r.setClearColor(this._c1, a0);
      if (fog) fog.color.copy(this._c2);
    }
    r.autoClear = false;
    let src = t.scene.texture;
    const pass = (q, target) => { r.setRenderTarget(target); q.render(r); };

    if (samples === 0) {          // no MSAA (unsupported, or a very large still): FXAA
      const u = Q.fxaa.material.uniforms; u.tDiffuse.value = src; u.resolution.value.set(1 / w, 1 / h);
      const a = this._aux(t, 'auxA'); pass(Q.fxaa, a); src = a.texture;
    }

    // 2 — ambient occlusion at half resolution (High)
    // baked apartments (bake.js) carry their own contact shadows: follow its aoHint (or fade to 30 % on a plain flag)
    const B = typeof window !== 'undefined' && window.VRC ? window.VRC.bakedLighting : null;
    const hint = !B ? 1 : typeof B.aoHint === 'number' ? Math.max(0, Math.min(1, B.aoHint)) : (B === true || B.active === true) ? 0.3 : 1;
    this._bakeK += (hint - this._bakeK) * 0.08;
    const aoK = useAo ? Math.min(1, L.ao * this._bakeK) : 0;
    if (useAo) {
      const u = Q.ao.material.uniforms, aw = t.aoA.width, ah = t.aoA.height;
      u.tDepth.value = t.scene.depthTexture; u.resolution.value.set(aw, ah);
      u.cameraNear.value = camera.near; u.cameraFar.value = camera.far;
      u.cameraProjectionMatrix.value.copy(camera.projectionMatrix); u.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
      u.radius.value = L.aoRadius; u.thickness.value = 0.9; u.distanceExponent.value = 1.5; u.distanceFallOff.value = 1; u.scale.value = 1.15;
      pass(Q.ao, t.aoA);
      const b = Q.blur.material.uniforms; b.far.value = camera.far;
      b.tAo.value = t.aoA.texture; b.dir.value.set(1 / aw, 0); pass(Q.blur, t.aoB);
      b.tAo.value = t.aoB.texture; b.dir.value.set(0, 1 / ah); pass(Q.blur, t.aoA);
    }

    // 3 — bloom
    const bloomK = Math.min(1, 0.5 * L.bloom * T.bloom);
    {
      const u = Q.bright.material.uniforms, D = t.down, U = t.up;
      u.tMap.value = src; u.threshold.value = L.threshold; u.texel.value.set((t.first / 4) / w, (t.first / 4) / h); pass(Q.bright, D[0]);
      const d = Q.down.material.uniforms;
      for (let i = 1; i < D.length; i++) { d.tMap.value = D[i - 1].texture; d.texel.value.set(1 / D[i - 1].width, 1 / D[i - 1].height); pass(Q.down, D[i]); }
      const p = Q.up.material.uniforms; let cur = D[D.length - 1];
      for (let i = D.length - 2; i >= 0; i--) { p.tMap.value = cur.texture; p.tAdd.value = D[i].texture; p.texel.value.set(0.5 / cur.width, 0.5 / cur.height); p.spread.value = 1; pass(Q.up, U[i]); cur = U[i]; }
      t.bloom = cur.texture;
    }

    // photo mode: depth of field focused on the centre of the picture (High)
    if (useDof) {
      const u = Q.dof.material.uniforms; u.tColor.value = src; u.tDepth.value = t.scene.depthTexture; u.aspect.value = w / h;
      u.aperture.value = 0.0007 * L.dof; u.maxblur.value = 0.0045; u.nearClip.value = camera.near; u.farClip.value = camera.far;
      const a = this._aux(t, 'auxB'); pass(Q.dof, a); src = a.texture;
    }

    // 4 — composite to the canvas (or to whatever target the caller had bound)
    const q = useAo ? Q.finalAo : Q.final, u = q.material.uniforms;
    u.tMap.value = src; u.tBloom.value = t.bloom; u.bloom.value.set(1 / t.levels, bloomK);
    u.grade.value.set(L.contrast, L.saturation, L.vignette, L.dither / 255); u.tintLo.value.fromArray(T.shadow); u.tintHi.value.fromArray(T.light);
    if (useAo) { u.tDepth.value = t.scene.depthTexture; u.tAo.value = t.aoA.texture; u.aoSize.value.set(t.aoA.width, t.aoA.height); u.aoP.value.set(aoK, camera.near, camera.far); u.aoFar.value = camera.far; }
    pass(q, prevRT);
    r.setRenderTarget(prevRT); r.autoClear = prevAuto;

    // first frames on new targets: a driver that rejects the multisampled depth-stencil resolve falls back to FXAA
    if (this._checked < 2) {
      this._checked++;
      const err = gl.getError();
      if (err && err !== gl.CONTEXT_LOST_WEBGL) {
        if (!this._fxaaOnly) { console.warn('[postfx] multisampled target rejected (0x' + err.toString(16) + ') → FXAA'); this._fxaaOnly = true; this._freeTargets(); }
        else throw new Error('GL error 0x' + err.toString(16));
      }
    }
  }
}
