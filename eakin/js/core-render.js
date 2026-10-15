// core-render.js — rendering: post-processing (GTAO → bloom → OutputPass → grade → SMAA), window RectAreaLights,
// sun-shadow tuning, exposure, environment lighting (sky env outdoors, room fill + per-room reflection probes indoors),
// material sanity pass, bathroom mirrors (Reflector, max 2). Owner: RENDER / LOOK bot. No side effects on import;
// core calls createRender(env).
//
// All three/addons modules are loaded with dynamic import() so a missing / failing addon only disables that feature:
// the tour always falls back to a plain renderer.render(scene, camera).
//
// V3 LOOK — one exposure / tone-mapping pipeline:
//   * Tone mapping happens exactly once per path.
//     - high (composer): RenderPass/GTAO/bloom work in linear HDR (HalfFloat targets: r160 skips tone mapping for render
//       targets) → OutputPass applies renderer.toneMapping (ACESFilmic) + toneMappingExposure + sRGB → GradePass (contrast
//       S-curve, saturation 1.05, vignette, in sRGB in/out) → SMAA.
//     - low / plain renderer.render(): renderer.toneMapping = CustomToneMapping whose GLSL (patched into
//       ShaderChunk.tonemapping_pars_fragment) is the exact r160 ACES fit + the same grade (no vignette): zero extra cost
//       on phones. If the chunk cannot be patched, plain ACESFilmic is used (still exactly once).
//   * ACESFilmic (not AgX): AgXToneMapping exists in r160, but its base look is flat/desaturated (it reads "washed out",
//     the exact complaint); ACES + a gentle grade gives the contrast of a listing photo. The pano export and path-tracer
//     fallbacks also use ACES with the same exposure, so stills match the live view.
//   * Exposure = one value per time of day (core TOD.exp: day 1.0, evening 0.85, night 0.75) × a small indoor lift
//     (≤ 1.06), eased, clamped to [0.6, 1.1]. No other multipliers.
//   * Environment: scene.environment = a PMREM of a tod-tinted sky dome (day / evening / night; no sun disc: the sun is
//     the DirectionalLight). Interior materials use the neutral RoomEnvironment as a low "fill" (day 0.38 → night 0.12)
//     until their room's probe is captured, then the probe (×0.9). r160 has no scene.environmentIntensity, so all of this
//     is done through material.envMapIntensity (base value remembered in userData.__envBase).
//   * Probes are captured WITHOUT feedback: during a capture every probe material samples the room fill instead of a
//     probe, emissive fixtures are switched off (their PointLights already light the room), the sun-disc Sky is
//     replaced by the sky dome, and mirrors are hidden. All env textures are 256 cubeUV so swapping them never
//     recompiles shaders.
import * as THREE from 'three';

const ADDON = 'three/addons/';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
// value by night factor: 0 = day, 0.55 = evening, 1 = night
const byNight = (n, d, e, nt) => (n < 0.55 ? lerp(d, e, n / 0.55) : lerp(e, nt, (n - 0.55) / 0.45));

/* ------------------------------------------------------------------ look constants (documented in CHANGELOG V3 LOOK) */
export const LOOK = {
  expMin: 0.6, expMax: 1.1,
  indoorLift: [1.06, 1.03, 1.0],          // day / evening / night multiplier on TOD.exp while the camera is inside
  fill: [0.38, 0.24, 0.12],               // interior RoomEnvironment fill (envMapIntensity scale) day / evening / night
  fillLowBoost: 1.2,                      // phones: no window RectAreaLights → a little more fill
  probeK: 0.9,                            // probe materials (the probe already holds the room's real light level)
  outK: 1.0,                              // exterior: the sky env itself carries the time of day
  hemiIndoor: 0.45,                       // HemisphereLight is unoccluded: scale it down while the camera is inside
  window: [2.4, 0.8, 0.03],               // window RectAreaLight radiance day / evening / night
  bloom: { strength: 0.14, radius: 0.3, threshold: 1.7 }, // threshold on linear HDR luminance (lamp lenses / bulbs only)
  saturation: 1.05, contrast: 0.14, white: 0.965, black: 0.006, vignette: 0.16,
  albedoMax: 0.80, albedoWall: 0.68, emissiveMax: 3.0,
  probeSize: 256, captureSkyGain: 2.2,
};

// shared grade (input/output: linear display-referred 0..1). Names are prefixed so they never clash with user shaders
// that also receive tonemapping_pars_fragment (Sky, scanner, …).
const GRADE_GLSL = `
vec3 lookV3Grade( vec3 c ) {
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = max( mix( vec3( l ), c, ${LOOK.saturation.toFixed(3)} ), 0.0 );
	vec3 p = pow( clamp( c, 0.0, 1.0 ), vec3( 1.0 / 2.2 ) );
	vec3 s = p * p * ( 3.0 - 2.0 * p );
	p = mix( p, s, ${LOOK.contrast.toFixed(3)} );
	p = p * ${(LOOK.white - LOOK.black).toFixed(4)} + ${LOOK.black.toFixed(4)};
	return pow( p, vec3( 2.2 ) );
}`;
// exact copy of r160 ACESFilmicToneMapping (incl. the /0.6 exposure convention used across this app), renamed
export const TONE_GLSL = `
vec3 lookV3RRT( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 lookV3ACES( vec3 color ) {
	const mat3 inM = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
	const mat3 outM = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
	color *= toneMappingExposure / 0.6;
	color = inM * color;
	color = lookV3RRT( color );
	color = outM * color;
	return clamp( color, 0.0, 1.0 );
}${GRADE_GLSL}
vec3 CustomToneMapping( vec3 color ) { return lookV3Grade( lookV3ACES( color ) ); }`;
const GRADE_PASS = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: LOOK.vignette } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; varying vec2 vUv;
${GRADE_GLSL}
vec3 lookV3ToLin( vec3 c ) { return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( vec3( 0.04045 ), c ) ); }
vec3 lookV3ToSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) ); }
void main() {
	vec4 t = texture2D( tDiffuse, vUv );
	vec3 c = lookV3Grade( lookV3ToLin( clamp( t.rgb, 0.0, 1.0 ) ) );
	vec2 d = vUv - 0.5;
	float v = 1.0 - uVignette * smoothstep( 0.3, 1.0, dot( d, d ) * 2.0 );
	gl_FragColor = vec4( lookV3ToSRGB( clamp( c * v, 0.0, 1.0 ) ), t.a );
}`,
};

export function createRender(env) {
  // env: { renderer, scene, camera, plan, sun, hemi, sky, roomEnv, getQuality(), getMode(),
  //        getTod() → {name, exp, night, hemiI, animating}, isTouch, reportError(where, e), toast(msg, ms),
  //        isInteractive(obj) → bool, isViewFiltered() → bool (dollhouse fade clones active) }
  const { renderer, scene, camera, plan } = env;
  const report = (w, e) => { try { env.reportError ? env.reportError(w, e) : console.error(w, e); } catch (_) {} };
  const quality = () => (env.getQuality ? env.getQuality() : 'high');
  const mode = () => (env.getMode ? env.getMode() : 'walk');
  const tod = () => (env.getTod ? env.getTod() : { name: 'day', exp: 1, night: 0, animating: false });
  const nightNow = () => clamp(+tod().night || 0, 0, 1);

  const A = {}; // loaded addon exports
  const mirrorWaiters = []; // makeMirror() calls made before Reflector.js finished loading
  const mirrors = [];
  let override = null;
  const fx = { ok: false, failed: false, composer: null, renderPass: null, ao: null, aoKind: '', bloom: null, output: null, grade: null, smaa: null, w: 0, h: 0, pr: 0, panoHQ: null };
  const look = { exposure: 1, toneMapping: 'ACESFilmic', customTone: false, path: 'plain', clamp: null, envSet: 0, sky: 'none', fill: 0, inside: 0 };

  /* ---------------------------------------------------------------- tone mapping (exactly once per path) */
  try {
    const SC = THREE.ShaderChunk;
    const src = SC && SC.tonemapping_pars_fragment;
    const re = /vec3\s+CustomToneMapping\s*\(\s*vec3\s+color\s*\)\s*\{\s*return\s+color\s*;\s*\}/;
    if (typeof src === 'string' && src.includes('lookV3ACES')) look.customTone = true;
    else if (typeof src === 'string' && re.test(src) && THREE.CustomToneMapping !== undefined) {
      SC.tonemapping_pars_fragment = src.replace(re, TONE_GLSL);
      look.customTone = SC.tonemapping_pars_fragment.includes('lookV3ACES');
    }
  } catch (e) { look.customTone = false; }
  const TM_PLAIN = look.customTone ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
  function setToneMapping(path) {
    const tm = path === 'composer' ? THREE.ACESFilmicToneMapping : TM_PLAIN;
    if (renderer.toneMapping !== tm) renderer.toneMapping = tm;
    if (renderer.outputColorSpace !== THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    look.path = path;
    look.toneMapping = tm === THREE.CustomToneMapping ? 'Custom(ACES+grade)' : 'ACESFilmic' + (path === 'composer' ? '+GradePass' : '');
  }
  setToneMapping(quality() === 'high' ? 'composer' : 'plain');

  /* ---------------------------------------------------------------- sun shadow tuning (map size: core shadowSize()) */
  try {
    if (env.sun && env.sun.shadow) {
      env.sun.shadow.bias = -0.0002;
      env.sun.shadow.normalBias = 0.02;
      env.sun.shadow.radius = 2;
    }
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch (_) {}

  /* ---------------------------------------------------------------- addon loading */
  const imp = (p) => import(ADDON + p).catch((e) => { console.warn('[render] addon unavailable', p, e && e.message); return null; });
  const ready = (async () => {
    const [ec, rp, op, gt, ub, sm, ral, refl, sp] = await Promise.all([
      imp('postprocessing/EffectComposer.js'), imp('postprocessing/RenderPass.js'), imp('postprocessing/OutputPass.js'),
      imp('postprocessing/GTAOPass.js'), imp('postprocessing/UnrealBloomPass.js'), imp('postprocessing/SMAAPass.js'),
      imp('lights/RectAreaLightUniformsLib.js'), imp('objects/Reflector.js'), imp('postprocessing/ShaderPass.js'),
    ]);
    if (ec && ec.EffectComposer) A.EffectComposer = ec.EffectComposer;
    if (rp && rp.RenderPass) A.RenderPass = rp.RenderPass;
    if (op && op.OutputPass) A.OutputPass = op.OutputPass;
    if (gt && gt.GTAOPass) A.GTAOPass = gt.GTAOPass;
    if (ub && ub.UnrealBloomPass) A.UnrealBloomPass = ub.UnrealBloomPass;
    if (sm && sm.SMAAPass) A.SMAAPass = sm.SMAAPass;
    if (sp && sp.ShaderPass) A.ShaderPass = sp.ShaderPass;
    if (refl && refl.Reflector) A.Reflector = refl.Reflector;
    if (!A.GTAOPass) { const sao = await imp('postprocessing/SAOPass.js'); if (sao && sao.SAOPass) A.SAOPass = sao.SAOPass; }
    if (ral && ral.RectAreaLightUniformsLib) {
      try { ral.RectAreaLightUniformsLib.init(); A.rectArea = true; } catch (e) { console.warn('[render] RectAreaLightUniformsLib.init failed', e); }
    }
    for (const fn of mirrorWaiters.splice(0)) { try { fn(); } catch (_) {} }
    return A;
  })().catch((e) => { report('טעינת אפקטים', e); return A; });

  /* ---------------------------------------------------------------- composer */
  const _sz = new THREE.Vector2();
  function wantedPR() {
    const pr = renderer.getPixelRatio();
    if (mode() === 'pano') return Math.min(2, Math.max(pr, (window.devicePixelRatio || 1) * 1.5)); // 360: supersample
    return Math.min(pr, 2);
  }
  function buildComposer() {
    if (fx.composer || fx.failed) return !!fx.composer;
    if (!A.EffectComposer || !A.RenderPass || !A.OutputPass) return false;
    try {
      renderer.getSize(_sz);
      const w = Math.max(1, _sz.x), h = Math.max(1, _sz.y), pr = wantedPR();
      const composer = new A.EffectComposer(renderer);
      composer.setPixelRatio(pr); composer.setSize(w, h);
      const rp = new A.RenderPass(scene, camera);
      composer.addPass(rp);
      fx.renderPass = rp;
      if (A.GTAOPass) {
        const ao = new A.GTAOPass(scene, camera, Math.floor(w * pr), Math.floor(h * pr));
        try { ao.blendIntensity = 1.0; } catch (_) {}
        try { if (ao.updateGtaoMaterial) ao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false }); } catch (_) {}
        try { if (ao.updatePdMaterial) ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 }); } catch (_) {}
        composer.addPass(ao); fx.ao = ao; fx.aoKind = 'gtao';
      } else if (A.SAOPass) {
        const ao = new A.SAOPass(scene, camera, new THREE.Vector2(Math.floor(w * pr), Math.floor(h * pr)));
        try { Object.assign(ao.params, { saoBias: 0.5, saoIntensity: 0.012, saoScale: 6, saoKernelRadius: 24, saoMinResolution: 0, saoBlur: true, saoBlurRadius: 6, saoBlurStdDev: 3, saoBlurDepthCutoff: 0.01 }); } catch (_) {}
        composer.addPass(ao); fx.ao = ao; fx.aoKind = 'sao';
      }
      if (A.UnrealBloomPass) {
        const B = LOOK.bloom;
        const bloom = new A.UnrealBloomPass(new THREE.Vector2(Math.floor(w * pr), Math.floor(h * pr)), B.strength, B.radius, B.threshold);
        composer.addPass(bloom); fx.bloom = bloom;
      }
      const out = new A.OutputPass(); // ACES + exposure + sRGB — the only tone mapping on this path
      composer.addPass(out); fx.output = out;
      if (A.ShaderPass) {
        try { const g = new A.ShaderPass(GRADE_PASS); g.name = 'GradePass'; composer.addPass(g); fx.grade = g; } catch (e) { console.warn('[render] grade pass', e); }
      }
      if (A.SMAAPass) {
        const smaa = new A.SMAAPass(Math.floor(w * pr), Math.floor(h * pr));
        composer.addPass(smaa); fx.smaa = smaa;
      }
      fx.composer = composer; fx.w = w; fx.h = h; fx.pr = pr; fx.ok = true;
      return true;
    } catch (e) {
      fx.failed = true; fx.ok = false; fx.composer = null;
      report('אפקטים (post-processing)', e);
      return false;
    }
  }
  function syncComposer() {
    renderer.getSize(_sz);
    const w = Math.max(1, _sz.x), h = Math.max(1, _sz.y), pr = wantedPR();
    if (w !== fx.w || h !== fx.h || Math.abs(pr - fx.pr) > 1e-3) {
      fx.w = w; fx.h = h; fx.pr = pr;
      fx.composer.setPixelRatio(pr);
      fx.composer.setSize(w, h);
    }
    const hq = mode() === 'pano';
    if (fx.ao && fx.aoKind === 'gtao' && fx.panoHQ !== hq) {
      fx.panoHQ = hq;
      try { fx.ao.updateGtaoMaterial && fx.ao.updateGtaoMaterial({ samples: hq ? 24 : 16 }); } catch (_) {}
      try { fx.ao.updatePdMaterial && fx.ao.updatePdMaterial({ samples: hq ? 24 : 16, rings: hq ? 3 : 2 }); } catch (_) {}
    }
    if (fx.bloom) fx.bloom.threshold = LOOK.bloom.threshold; // fixed radiance threshold: only real light sources glow
  }
  function disposeComposer() {
    if (!fx.composer) return;
    try { for (const p of fx.composer.passes || []) p.dispose && p.dispose(); fx.composer.dispose && fx.composer.dispose(); } catch (_) {}
    fx.composer = null; fx.ok = false; fx.renderPass = fx.ao = fx.bloom = fx.output = fx.grade = fx.smaa = null; fx.w = fx.h = fx.pr = 0; fx.panoHQ = null;
  }

  /* ---------------------------------------------------------------- exposure: one value per tod, gentle indoor lift */
  const W = plan.W, D = plan.D;
  let insideK = 0; // eased 0..1
  let expInit = false;
  const _cp = new THREE.Vector3();
  function indoor(cam) {
    const m = mode();
    if (m !== 'walk' && m !== 'pano' && m !== 'transition') return false;
    cam.getWorldPosition(_cp);
    return _cp.x > 0.05 && _cp.x < W - 0.05 && _cp.z > 0.05 && _cp.z < D - 0.05 && _cp.y < plan.upperFloor + 2.7 && _cp.y > plan.basementFloor;
  }
  function updateExposure(cam, dt) {
    const t = tod();
    const n = clamp(+t.night || 0, 0, 1);
    const ins = cam && cam.isPerspectiveCamera && indoor(cam) ? 1 : 0;
    const a = 1 - Math.exp(-3.0 * Math.min(0.1, dt || 0.016));
    insideK = expInit ? insideK + (ins - insideK) * a : ins;
    const base = typeof t.exp === 'number' && isFinite(t.exp) ? t.exp : byNight(n, 1.0, 0.85, 0.75);
    const lift = lerp(1, byNight(n, ...LOOK.indoorLift), insideK);
    const target = clamp(base * lift, LOOK.expMin, LOOK.expMax);
    look.exposure = expInit ? look.exposure + (target - look.exposure) * a : target;
    expInit = true;
    renderer.toneMappingExposure = clamp(look.exposure, LOOK.expMin, LOOK.expMax);
    look.inside = insideK;
    // the HemisphereLight is not occluded by the house: inside it would flatten every room
    if (env.hemi && typeof t.hemiI === 'number' && isFinite(t.hemiI)) env.hemi.intensity = t.hemiI * lerp(1, LOOK.hemiIndoor, insideK);
  }

  /* ---------------------------------------------------------------- environment: sky env (outdoor) + room fill (indoor) */
  const roomEnv = env.roomEnv || null;
  const SKY = {
    day: { zen: [0.16, 0.26, 0.52], hor: [0.50, 0.55, 0.60], gnd: [0.11, 0.10, 0.085] },
    evening: { zen: [0.10, 0.10, 0.20], hor: [0.55, 0.33, 0.18], gnd: [0.06, 0.045, 0.035] },
    night: { zen: [0.004, 0.006, 0.014], hor: [0.012, 0.016, 0.03], gnd: [0.003, 0.003, 0.004] },
  };
  const domeGeo = {};
  function makeDomeGeo(c) {
    const g = new THREE.SphereGeometry(1, 32, 16);
    const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      let r, gg, b;
      if (y >= 0) { const k = Math.pow(y, 0.55); r = lerp(c.hor[0], c.zen[0], k); gg = lerp(c.hor[1], c.zen[1], k); b = lerp(c.hor[2], c.zen[2], k); }
      else { const k = Math.min(1, -y * 4); r = lerp(c.hor[0], c.gnd[0], k); gg = lerp(c.hor[1], c.gnd[1], k); b = lerp(c.hor[2], c.gnd[2], k); }
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  const domeMat = (gain) => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }); m.color.setScalar(gain); return m; };
  const skyEnv = {}; // name → PMREM render target
  let skyEnvName = null;
  let captureDome = null;
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    for (const k of Object.keys(SKY)) {
      domeGeo[k] = makeDomeGeo(SKY[k]);
      const s = new THREE.Scene();
      const d = new THREE.Mesh(domeGeo[k], domeMat(1)); d.scale.setScalar(50); d.frustumCulled = false; s.add(d);
      skyEnv[k] = pm.fromScene(s, 0.02);
      d.material.dispose();
    }
    pm.dispose();
    captureDome = new THREE.Mesh(domeGeo.day, domeMat(LOOK.captureSkyGain));
    captureDome.name = 'look:captureDome'; captureDome.frustumCulled = false; captureDome.userData.__core = true; captureDome.userData.noProbe = true;
    captureDome.scale.setScalar(100);
  } catch (e) { console.warn('[render] sky env failed (keeping RoomEnvironment)', e); }
  const skyNameFor = (n) => (n < 0.3 ? 'day' : n < 0.8 ? 'evening' : 'night');
  function syncSkyEnv() {
    const nm = skyNameFor(nightNow());
    if (nm === skyEnvName || !skyEnv[nm]) return;
    skyEnvName = nm; look.sky = nm;
    scene.environment = skyEnv[nm].texture;
  }
  syncSkyEnv();

  // material env zones: 'probe' (room probe), 'in' (inside the house, no probe → room fill), 'out' (sky env)
  const isPBR = (m) => m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !m.isShaderMaterial;
  function envBase(m) {
    const ud = m.userData;
    if (ud.__envBase === undefined || (ud.__envSet !== undefined && Math.abs(m.envMapIntensity - ud.__envSet) > 1e-4)) ud.__envBase = m.envMapIntensity;
    return ud.__envBase;
  }
  function setEnvI(m, v) { if (!isFinite(v)) return; m.envMapIntensity = v; m.userData.__envSet = v; }
  const fillK = (n) => byNight(n, ...LOOK.fill) * (quality() === 'high' ? 1 : LOOK.fillLowBoost);
  function envIntensityFor(m, n) {
    const ud = m.userData, z = ud.__envZone;
    if (z === 'probe') {
      const p = probeByKey.get(ud.__probe);
      // until the probe is re-captured for the new time of day: scale down freely (day probe at night), but never blow
      // a night probe (lamp-lit) up toward daylight levels
      if (p && p.tex && m.envMap === p.tex) return envBase(m) * LOOK.probeK * clamp(fillK(n) / Math.max(1e-3, fillK(p.capNight || 0)), 0.2, 1.25);
      return envBase(m) * fillK(n);
    }
    if (z === 'in') return envBase(m) * fillK(n);
    return envBase(m) * LOOK.outK;
  }
  function applyEnv() {
    const n = nightNow();
    let cnt = 0;
    const seen = new Set();
    scene.traverse((o) => {
      if (!o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!isPBR(m) || seen.has(m)) continue;
        seen.add(m);
        setEnvI(m, envIntensityFor(m, n)); cnt++;
      }
    });
    look.envSet = cnt; look.fill = +fillK(n).toFixed(3);
    return cnt;
  }
  function applyEnvTo(mats) { const n = nightNow(); for (const m of mats) if (isPBR(m)) setEnvI(m, envIntensityFor(m, n)); }

  /* ---------------------------------------------------------------- window RectAreaLights */
  const rects = [];
  const WIN_ORDER = ['liv_pic', 'kit_n', 'liv_e', 'bed1_f', 'bed3_w', 'bed4_e', 'bed2_n', 'bed1_w', 'bed2_w'];
  const C_DAY = new THREE.Color(0xeef3ff), C_EVE = new THREE.Color(0xffb27c), C_NIGHT = new THREE.Color(0x3b4c80);
  const _sd = new THREE.Vector3();
  function addWindowLights() {
    if (!A.rectArea || rects.length) return;
    const wins = (plan.windows || []).filter((w) => (w.floor === 'main' || w.floor === 'upper') && w.type !== 'vent' && !w.obscure);
    wins.sort((a, b) => { const ia = WIN_ORDER.indexOf(a.id), ib = WIN_ORDER.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.w * (b.head - b.sill) - a.w * (a.head - a.sill); });
    const inset = (plan.extWall || 0.25) / 2 + 0.015;
    for (const w of wins.slice(0, 6)) {
      try {
        const fy = w.floor === 'main' ? plan.mainFloor : plan.upperFloor;
        const y = fy + (w.sill + w.head) / 2, h = Math.max(0.2, w.head - w.sill), ww = Math.max(0.2, w.w);
        let p, n;
        if (w.wall === 'ext_S') { p = new THREE.Vector3(w.along, y, D - inset); n = new THREE.Vector3(0, 0, -1); }
        else if (w.wall === 'ext_N') { p = new THREE.Vector3(w.along, y, inset); n = new THREE.Vector3(0, 0, 1); }
        else if (w.wall === 'ext_E') { p = new THREE.Vector3(W - inset, y, w.along); n = new THREE.Vector3(-1, 0, 0); }
        else if (w.wall === 'ext_W') { p = new THREE.Vector3(inset, y, w.along); n = new THREE.Vector3(1, 0, 0); }
        else continue;
        const L = new THREE.RectAreaLight(0xffffff, 0, ww * 0.94, h * 0.94);
        L.position.copy(p);
        L.lookAt(p.x + n.x, p.y, p.z + n.z); // lights emit toward their look-at target
        L.userData.__core = true; L.userData.floor = w.floor; L.name = 'winlight_' + w.id;
        L.visible = quality() === 'high';
        scene.add(L);
        rects.push({ L, n, area: ww * h, id: w.id });
      } catch (e) { console.warn('[render] window light', w && w.id, e); }
    }
  }
  const _wc = new THREE.Color();
  function updateWindowLights() {
    if (!rects.length) return;
    const n = nightNow();
    const lum = byNight(n, ...LOOK.window);
    if (n < 0.55) _wc.copy(C_DAY).lerp(C_EVE, n / 0.55); else _wc.copy(C_EVE).lerp(C_NIGHT, (n - 0.55) / 0.45);
    // windows facing the sun get more light (sun direction from the directional light)
    let sx = 0, sz = 0;
    if (env.sun) { _sd.copy(env.sun.position).sub(env.sun.target.position); _sd.y = 0; if (_sd.lengthSq() > 1e-6) { _sd.normalize(); sx = _sd.x; sz = _sd.z; } }
    const on = quality() === 'high';
    for (const r of rects) {
      if (r.L.visible !== on) r.L.visible = on;
      const facing = Math.max(0, -(r.n.x * sx + r.n.z * sz)); // outward normal = -n
      r.L.intensity = on ? lum * (1 + 0.45 * facing * (1 - n)) : 0;
      r.L.color.copy(_wc);
    }
  }

  /* ---------------------------------------------------------------- reflection probes */
  const YR = { basement: [plan.basementFloor - 0.2, plan.mainFloor - 0.15], main: [plan.mainFloor - 0.15, plan.upperFloor - 0.1], upper: [plan.upperFloor - 0.1, plan.upperFloor + 3.2] };
  const FLY = { basement: plan.basementFloor, main: plan.mainFloor, upper: plan.upperFloor };
  const probes = [];
  for (const fl of ['main', 'upper', 'basement']) {
    for (const [key, rm] of Object.entries((plan.rooms && plan.rooms[fl]) || {})) {
      const [x0, z0, x1, z1] = rm.r;
      const box = new THREE.Box3(new THREE.Vector3(x0, YR[fl][0], z0), new THREE.Vector3(x1, YR[fl][1], z1));
      let eye = FLY[fl] + 1.5;
      if (fl === 'upper' && plan.upperCeilAt) eye = FLY[fl] + Math.min(1.5, Math.max(0.9, plan.upperCeilAt((z0 + z1) / 2) - 0.35));
      if (fl === 'basement') eye = Math.min(eye, (plan.basementCeil || 0.35) - 0.35);
      probes.push({ key, he: rm.he, floor: fl, box, vol: (x1 - x0) * (z1 - z0), center: new THREE.Vector3((x0 + x1) / 2, eye, (z0 + z1) / 2), rt: null, tex: null, mats: new Set(), dirty: true, capNight: 0 });
    }
  }
  const probesBySize = probes.slice().sort((a, b) => a.vol - b.vol);
  const probeByKey = new Map(probes.map((p) => [p.key, p]));
  const probeByHe = new Map(probes.map((p) => [p.he, p]));
  let cube = null, pmrem = null, probeQueue = [], probesAssigned = false, built = false;
  const probeStats = { captures: 0, mats: 0, clones: 0, meshes: 0, inMats: 0, skippedFiltered: 0 };
  const allProbeMats = () => { const s = new Set(); for (const p of probes) for (const m of p.mats) s.add(m); return s; };

  function hideHelpers(extra) {
    const hidden = [];
    for (const o of scene.children) {
      if (!o.visible || !o.userData || !o.userData.__core) continue;
      if (o.isGroup || o.isPoints || o.isLine || o.isSprite || o.userData.__helper || (extra && extra.includes(o))) { o.visible = false; hidden.push(o); }
    }
    for (const o of (extra || [])) if (o && o.visible && !hidden.includes(o)) { o.visible = false; hidden.push(o); }
    return () => { for (const o of hidden) o.visible = true; };
  }

  // capture without feedback: probe materials sample the room fill (never a probe), emissive fixtures are off, the
  // sun-disc Sky is replaced by the sky dome (bounded radiance), mirrors hidden. Restored in `finally`.
  function capture(p) {
    const size = LOOK.probeSize; // 256 = same cubeUV size as every other env → env swaps never recompile shaders
    if (!cube || cube.size !== size) {
      if (cube) cube.rt.dispose();
      const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      const cam = new THREE.CubeCamera(0.05, 120, rt);
      cam.layers.enableAll(); // capture objects hidden on layer 31 by dollhouse/plan views (ceilings, roof)
      cam.userData.__core = true;
      cube = { size, rt, cam };
    }
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    cube.cam.position.copy(p.center);
    cube.cam.updateMatrixWorld(true);
    const n = nightNow();
    const savedMats = [], savedEm = [];
    const extra = [];
    for (const M of mirrors) if (M.refl && M.refl.visible) extra.push(M.refl);
    const restore = hideHelpers(extra);
    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.shadowMap.autoUpdate, prevNeeds = renderer.shadowMap.needsUpdate;
    const prevTM = renderer.toneMapping;
    const sky = env.sky, skyVis = sky ? sky.visible : false;
    try {
      const fk = fillK(n);
      for (const m of allProbeMats()) { savedMats.push([m, m.envMap, m.envMapIntensity]); m.envMap = roomEnv; m.envMapIntensity = envBase(m) * fk; }
      scene.traverse((o) => {
        if (!o.material || (o.userData && o.userData.__core)) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m && m.emissive && m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.001) { savedEm.push([m, m.emissiveIntensity]); m.emissiveIntensity = 0; }
      });
      if (captureDome) {
        captureDome.geometry = domeGeo[skyNameFor(n)] || captureDome.geometry;
        captureDome.position.copy(p.center); captureDome.updateMatrixWorld(true);
        scene.add(captureDome);
        if (sky) sky.visible = false;
      }
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
      cube.cam.update(renderer, scene);
    } finally {
      renderer.setRenderTarget(prevRT);
      renderer.toneMapping = prevTM;
      renderer.shadowMap.autoUpdate = prevAuto; renderer.shadowMap.needsUpdate = prevNeeds;
      if (captureDome && captureDome.parent) captureDome.parent.remove(captureDome);
      if (sky) sky.visible = skyVis;
      for (const [m, em, ei] of savedMats) { m.envMap = em; m.envMapIntensity = ei; }
      for (const [m, ei] of savedEm) m.emissiveIntensity = ei;
      restore();
    }
    const out = pmrem.fromCubemap(cube.rt.texture, p.rt && p.rtSize === size ? p.rt : null);
    if (p.rt && out !== p.rt) { try { p.rt.dispose(); } catch (_) {} }
    p.rt = out; p.rtSize = size;
    p.tex = out.texture;
    p.capNight = n;
    for (const m of p.mats) { if (m.envMap !== p.tex) { m.envMap = p.tex; m.needsUpdate = true; } }
    applyEnvTo(p.mats);
    p.dirty = false;
    probeStats.captures++;
  }

  // which probe a mesh belongs to: userData.room on an ancestor (plan key or Hebrew name), else its world centre
  const _bb = new THREE.Box3(), _c = new THREE.Vector3();
  function meshCentre(o) {
    const g = o.geometry; if (!g || o.isInstancedMesh) return null;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox || g.boundingBox.isEmpty()) return null;
    _bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    return _bb.getCenter(_c);
  }
  function probeFor(o) {
    for (let a = o; a; a = a.parent) {
      const r = a.userData && a.userData.room;
      if (r) { const p = probeByKey.get(r) || probeByHe.get(r); if (p) return p; if (r === 'outside') return null; }
      if (a.userData && a.userData.floor === 'outside') return null;
    }
    const c = meshCentre(o); if (!c) return null;
    for (const p of probesBySize) if (p.box.containsPoint(c)) return p;
    // inside the footprint (e.g. a merged wall mesh centred inside a partition): nearest room on that level
    if (c.x > -0.3 && c.x < W + 0.3 && c.z > -0.3 && c.z < D + 0.3 && c.y > YR.basement[0] && c.y < YR.upper[1]) {
      let best = null, bd = Infinity;
      for (const p of probes) { if (c.y < p.box.min.y || c.y > p.box.max.y) continue; const d = p.box.distanceToPoint(c); if (d < bd) { bd = d; best = p; } }
      return bd < 0.6 ? best : null;
    }
    return null;
  }
  function insideHouse(o) {
    for (let a = o; a; a = a.parent) {
      const fl = a.userData && a.userData.floor;
      if (fl === 'outside' || fl === 'roof') return false;
      if (fl === 'main' || fl === 'upper' || fl === 'basement') break;
    }
    const c = meshCentre(o); if (!c) return false;
    return c.x > 0.1 && c.x < W - 0.1 && c.z > 0.1 && c.z < D - 0.1 && c.y > YR.basement[0] && c.y < plan.upperFloor + 3.0;
  }
  function inInteractive(o) {
    if (!env.isInteractive) return false;
    for (let a = o; a; a = a.parent) if (env.isInteractive(a)) return true;
    return false;
  }
  const glossy = (m) => (m.roughness !== undefined && m.roughness < 0.6) || m.metalness > 0.3 || m.transmission > 0 || m.clearcoat > 0;
  const emissiveOn = (m) => m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.001 && m.emissiveIntensity > 0;
  function markProbe(m, p) {
    envBase(m);
    m.userData.__probe = p.key; m.userData.__envZone = 'probe';
    p.mats.add(m);
    const want = p.tex || roomEnv; // until the probe is captured: neutral room fill (same 256 cubeUV size)
    if (m.envMap !== want) { m.envMap = want; m.needsUpdate = true; }
  }
  function markIn(m) {
    envBase(m);
    m.userData.__envZone = 'in';
    if (roomEnv && m.envMap !== roomEnv) { m.envMap = roomEnv; m.needsUpdate = true; }
  }

  function assignProbes() {
    // gather material → [{mesh, slot, probe|null, inside}]
    const uses = new Map();
    scene.updateMatrixWorld(true);
    probeStats.meshes = 0;
    const rec = (o) => {
      if (o.userData && (o.userData.__core || o.userData.noProbe)) return;
      if (o.isMesh && o.material && !o.isSkinnedMesh) {
        const arr = Array.isArray(o.material) ? o.material : [o.material];
        let pr, ins; let got = false;
        for (let i = 0; i < arr.length; i++) {
          const m = arr[i];
          if (!isPBR(m)) continue;
          if (m.envMap && !m.userData.__envZone) continue; // module set its own envMap: respect it
          if (!got) { pr = probeFor(o); ins = pr ? true : insideHouse(o); got = true; }
          let u = uses.get(m); if (!u) { u = []; uses.set(m, u); }
          u.push({ mesh: o, slot: Array.isArray(o.material) ? i : -1, probe: pr, inside: ins });
        }
        probeStats.meshes++;
      }
      for (const c of o.children) rec(c);
    };
    for (const c of scene.children) rec(c);
    const cloneCache = new Map();
    for (const [m, list] of uses) {
      const groups = new Map();
      for (const u of list) { const k = u.probe ? u.probe.key : (u.inside ? '_in' : '_out'); let g = groups.get(k); if (!g) { g = []; groups.set(k, g); } g.push(u); }
      const only = groups.size === 1 ? [...groups.keys()][0] : null;
      if (only !== null) {
        if (only === '_in') { markIn(m); probeStats.inMats++; }
        else if (only !== '_out') { markProbe(m, list[0].probe); probeStats.mats++; }
        continue;
      }
      // shared across rooms: clone per room only for glossy, non-emissive, non-interactive materials (other modules
      // may hold references to interactive / emissive materials and mutate them later)
      const safe = glossy(m) && !emissiveOn(m) && !list.some((u) => inInteractive(u.mesh)) && !m.userData.noProbeClone && !m.userData.__probeClone;
      if (safe) {
        for (const [k, g] of groups) {
          if (k === '_out' || k === '_in') continue;
          const p = g[0].probe, ck = m.uuid + '|' + k;
          let c = cloneCache.get(ck);
          if (!c) { c = m.clone(); c.name = (m.name || 'mat') + '@' + k; c.userData.__probeClone = true; cloneCache.set(ck, c); markProbe(c, p); probeStats.clones++; }
          for (const u of g) {
            if (u.slot < 0) { if (u.mesh.material === m) u.mesh.material = c; }
            else if (Array.isArray(u.mesh.material) && u.mesh.material[u.slot] === m) { const a = u.mesh.material.slice(); a[u.slot] = c; u.mesh.material = a; }
          }
        }
        if (groups.has('_in')) markIn(m);
      } else {
        // majority room (by mesh count); exterior-dominated materials keep scene.environment (sky)
        let best = null, bn = 0;
        for (const [k, g] of groups) if (g.length > bn) { bn = g.length; best = k; }
        if (best === '_in') markIn(m);
        else if (best !== '_out') { markProbe(m, groups.get(best)[0].probe); probeStats.mats++; }
      }
    }
    probesAssigned = true;
  }
  function requestProbes(delayMs = 0) {
    if (!built) return;
    clearTimeout(requestProbes._t);
    requestProbes._t = setTimeout(() => { for (const p of probes) p.dirty = true; probeQueue = probes.filter((p) => p.mats.size); }, delayMs);
  }
  function tickProbes() {
    if (!probeQueue.length) return;
    // dollhouse "fade front" swaps exterior skins for 22 % opacity clones: a capture then would see the sky through
    // the walls → wait until the view filter is gone
    if (env.isViewFiltered && env.isViewFiltered()) { probeStats.skippedFiltered++; return; }
    const p = probeQueue.shift();
    try { capture(p); } catch (e) { probeQueue.length = 0; report('השתקפויות חדרים', e); }
  }
  // re-capture after time-of-day changes settle (debounced)
  let lastTodName = null, todWasAnim = false;
  function watchTod() {
    const t = tod();
    if (lastTodName === null) { lastTodName = t.name; todWasAnim = !!t.animating; return; }
    if (t.name !== lastTodName) { lastTodName = t.name; todWasAnim = true; }
    if (todWasAnim && !t.animating) { todWasAnim = false; requestProbes(450); applyEnv(); }
  }

  /* ---------------------------------------------------------------- material sanity pass */
  // Effective albedo = colour × average of the colour map. Non-emissive, non-glass, non-metal materials are scaled so
  // their linear luminance is ≤ 0.80 (walls / ceilings / plaster ≤ 0.68): real paint & plaster sit at 0.6–0.8, and
  // anything brighter turns into a blown white wall under any light. Static emissives above 3 are capped.
  const _mapAvg = new WeakMap();
  const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  let scratch = null;
  function mapAverage(t) {
    if (!t) return 1;
    if (_mapAvg.has(t)) return _mapAvg.get(t);
    let avg = null;
    try {
      const img = t.image;
      const srgb = t.colorSpace === THREE.SRGBColorSpace;
      let data = null, cnt = 0;
      if (img && img.data && img.width && img.height && (img.data.length >= img.width * img.height * 4)) {
        data = img.data; cnt = img.width * img.height;
      } else if (img && img.width && img.height && typeof document !== 'undefined') {
        if (!scratch) { scratch = document.createElement('canvas'); scratch.width = scratch.height = 16; }
        const g = scratch.getContext('2d', { willReadFrequently: true });
        if (g) { g.clearRect(0, 0, 16, 16); g.drawImage(img, 0, 0, 16, 16); data = g.getImageData(0, 0, 16, 16).data; cnt = 256; }
      }
      if (data && cnt) {
        const step = Math.max(1, Math.floor(cnt / 1024));
        let s = 0, k = 0;
        for (let i = 0; i < cnt; i += step) {
          const r = data[i * 4] / 255, gg = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
          const lr = srgb ? s2l(r) : r, lg = srgb ? s2l(gg) : gg, lb = srgb ? s2l(b) : b;
          s += 0.2126 * lr + 0.7152 * lg + 0.0722 * lb; k++;
        }
        if (k) avg = s / k;
      }
    } catch (_) { avg = null; }
    if (avg === null || !isFinite(avg)) avg = 0.8; // unknown (cross-origin / not yet drawn): assume a light texture
    _mapAvg.set(t, avg);
    return avg;
  }
  // average linear luminance of a mesh's vertex colours (three treats the colour attribute as linear), cached per
  // attribute version (styles re-write vertex colours on a style switch)
  const _vcAvg = new WeakMap();
  function vertexColorAverage(o) {
    try {
      const a = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
      if (!a || !a.array || !a.count) return 1;
      const c = _vcAvg.get(a);
      if (c && c.v === a.version) return c.avg;
      const is = a.itemSize || 3, n = a.count, step = Math.max(1, Math.floor(n / 2000));
      const norm = a.normalized && a.array.BYTES_PER_ELEMENT === 1 ? 1 / 255 : a.normalized && a.array.BYTES_PER_ELEMENT === 2 ? 1 / 65535 : 1;
      let s = 0, k = 0;
      for (let i = 0; i < n; i += step) { const j = i * is; s += (0.2126 * a.array[j] + 0.7152 * a.array[j + 1] + 0.0722 * a.array[j + 2]) * norm; k++; }
      const avg = k ? Math.max(0.02, s / k) : 1;
      _vcAvg.set(a, { v: a.version, avg });
      return avg;
    } catch (_) { return 1; }
  }
  const WALLISH = /plaster|wall|ceiling|drywall|ceil/i;
  const GLASSY = /glass|mirror|chrome|water|screen/i;
  function normalizeMaterials(opts = {}) {
    const res = { materials: 0, albedoClamped: 0, emissiveCapped: 0, skipped: 0, examples: [] };
    // pass 1: materials + (for vertex-coloured ones) the brightest per-mesh vertex-colour average they are used with
    const mats = new Map();
    try {
      scene.traverse((o) => {
        if (!o.material || (o.userData && o.userData.__core)) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if (!isPBR(m)) continue;
          let vc = mats.has(m) ? mats.get(m) : 0;
          if (m.vertexColors) vc = Math.max(vc, vertexColorAverage(o));
          mats.set(m, vc);
        }
      });
    } catch (e) { report('נרמול חומרים', e); }
    try {
      for (const [m, vcAvg] of mats) {
        {
          res.materials++;
          const ud = m.userData || (m.userData = {});
          if (m.emissive && m.emissiveIntensity > LOOK.emissiveMax) { m.emissiveIntensity = LOOK.emissiveMax; res.emissiveCapped++; }
          if (ud.noAlbedoClamp || m.metalness > 0.5 || m.transmission > 0 || (m.transparent && m.opacity < 0.5) || GLASSY.test(m.name || '') || emissiveOn(m) || !m.color) { res.skipped++; continue; }
          // original colour: re-derive unless the colour is still exactly what this pass set (styles may recolour)
          const c = m.color;
          let o0 = ud.__albedo0;
          const set = ud.__albedoSet;
          if (!o0 || !set || Math.abs(c.r - set[0]) > 1e-5 || Math.abs(c.g - set[1]) > 1e-5 || Math.abs(c.b - set[2]) > 1e-5) { o0 = [c.r, c.g, c.b]; ud.__albedo0 = o0; }
          const lum = 0.2126 * o0[0] + 0.7152 * o0[1] + 0.0722 * o0[2];
          const eff = lum * mapAverage(m.map) * (m.vertexColors ? (vcAvg > 0 ? vcAvg : 1) : 1);
          const cap = WALLISH.test(m.name || '') ? LOOK.albedoWall : LOOK.albedoMax;
          const k = eff > cap ? cap / eff : 1;
          c.setRGB(o0[0] * k, o0[1] * k, o0[2] * k);
          ud.__albedoSet = [c.r, c.g, c.b];
          if (k < 1) {
            res.albedoClamped++;
            const nm = (m.name || m.type).replace(/@.*/, '');
            if (res.examples.length < 14 && !res.examples.some((x) => x.startsWith(nm + ' '))) res.examples.push(`${nm} ${eff.toFixed(2)}→${cap}`);
          }
        }
      }
    } catch (e) { report('נרמול חומרים', e); }
    look.clamp = res;
    if (opts.reassign !== false && built) {
      try { assignProbes(); } catch (e) { report('השתקפויות חדרים', e); }
      applyEnv();
      if (opts.reprobe !== false) requestProbes(300);
    }
    try { console.info(`[look] materials ${res.materials}: albedo clamped ${res.albedoClamped}, emissive capped ${res.emissiveCapped}, skipped ${res.skipped}` + (res.examples.length ? ' e.g. ' + res.examples.join('; ') : '')); } catch (_) {}
    return res;
  }

  /* ---------------------------------------------------------------- mirrors */
  // Per-frame cost gate: Reflector mirrors only render when the viewer is near them (same room), and the interior
  // furniture/decor is hidden while the viewer is far outside the house in walk/360 (big draw-call saving outdoors).
  const _gp = new THREE.Vector3();
  let interiorGroups = null, interiorHidden = false;
  function gateExpensive(cam) {
    for (const M of mirrors) {
      if (!M.refl) continue;
      M.refl.getWorldPosition(_gp);
      const near = cam.position.distanceTo(_gp) < 3.6 && Math.abs(cam.position.y - _gp.y) < 1.8;
      M.refl.visible = near;
    }
    if (!built) return;
    if (!interiorGroups) interiorGroups = scene.children.filter((o) => /^interior-/.test(o.name || '') && !/^interior-lights-/.test(o.name));
    const m = mode();
    const p = cam.position, pad = 6;
    const far = p.x < -pad || p.x > plan.W + pad || p.z < -pad || p.z > plan.D + pad;
    const hide = far && (m === 'walk' || m === 'pano' || m === '360') && !probeQueue.length;
    if (hide !== interiorHidden) {
      interiorHidden = hide;
      for (const g of interiorGroups) g.visible = !hide;
    }
  }
  function makeMirror(width = 0.6, height = 0.8, opts = {}) {
    const g = new THREE.Group();
    g.name = 'mirror';
    g.userData.mirror = true;
    const w = Math.max(0.05, +width || 0.6), h = Math.max(0.05, +height || 0.8);
    // fallback / path-tracer surface: polished silver plane (reflects the room probe); the plane faces +Z (local)
    const chrome = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 1, roughness: 0.035, envMapIntensity: 1.0 }));
    chrome.name = 'mirror_chrome';
    chrome.material.name = 'mirror';
    chrome.userData.ptInclude = true; // path tracer keeps it even while hidden behind the Reflector
    g.add(chrome);
    const M = { g, chrome, refl: null, w, h };
    mirrors.push(M);
    const upgrade = () => {
      if (M.refl || !A.Reflector || quality() !== 'high' || opts.reflector === false) return;
      if (mirrors.filter((x) => x.refl).length >= 2) return;
      try {
        const pr = Math.min(window.devicePixelRatio || 1, 2);
        const tw = Math.min(1024, Math.round(512 * pr * Math.max(1, w / h))), th = Math.min(1024, Math.round(512 * pr * Math.max(1, h / w)));
        const r = new A.Reflector(new THREE.PlaneGeometry(w, h), { color: 0xc9ccd0, textureWidth: tw, textureHeight: th, clipBias: 0.003 });
        r.name = 'mirror_reflector';
        r.userData.noProbe = true;
        r.position.z = 0.001;
        g.add(r);
        chrome.visible = false;
        M.refl = r;
      } catch (e) { console.warn('[render] Reflector failed, using chrome mirror', e); }
    };
    if (A.Reflector) upgrade(); else mirrorWaiters.push(upgrade);
    return g;
  }
  function syncMirrors() {
    const hi = quality() === 'high';
    for (const M of mirrors) if (M.refl) { M.refl.visible = hi; M.chrome.visible = !hi; }
  }

  /* ---------------------------------------------------------------- main hooks */
  async function afterBuild() {
    await Promise.race([ready, new Promise((r) => setTimeout(r, 6000))]);
    try { addWindowLights(); updateWindowLights(); } catch (e) { report('תאורת חלונות', e); }
    try { normalizeMaterials({ reassign: false }); } catch (e) { report('נרמול חומרים', e); }
    try { assignProbes(); } catch (e) { report('השתקפויות חדרים', e); }
    built = true;
    try { applyEnv(); } catch (e) { report('סביבת תאורה', e); }
    probeQueue = probes.filter((p) => p.mats.size);
    if (quality() === 'high') buildComposer();
    return stats();
  }
  function setQuality(q) {
    if (q !== 'high') disposeComposer();
    else if (built && !fx.failed) buildComposer();
    syncMirrors();
    updateWindowLights();
    if (built) { applyEnv(); requestProbes(100); }
  }
  let warnedFx = false;
  function renderFrame(cam, dt) {
    try { watchTod(); syncSkyEnv(); tickProbes(); updateWindowLights(); gateExpensive(cam); } catch (e) { /* never block the frame */ }
    updateExposure(cam, dt);
    if (override) {
      try { if (override(cam, dt) === true) return; } catch (e) { override = null; report('תצוגת הדמיה', e); }
    }
    if (quality() === 'high' && cam === camera && built && !fx.failed && (fx.composer || buildComposer())) {
      try {
        syncComposer();
        setToneMapping('composer');
        if (fx.renderPass) fx.renderPass.camera = cam;
        fx.composer.render(dt);
        return;
      } catch (e) {
        fx.failed = true; disposeComposer();
        if (!warnedFx) { warnedFx = true; report('אפקטים (post-processing)', e); env.toast && env.toast('האפקטים הגרפיים כובו — ממשיכים ברינדור רגיל', 3200); }
      }
    }
    setToneMapping('plain');
    renderer.render(scene, cam);
  }
  // High-resolution raster still of the current view (used as the photoreal fallback): supersampled render through the
  // AO composer, copied synchronously into a 2D canvas.
  function captureView(cam, scale = 2) {
    const pr0 = renderer.getPixelRatio();
    renderer.getSize(_sz);
    const maxT = (renderer.capabilities && renderer.capabilities.maxTextureSize) || 4096;
    const pr = Math.max(pr0, Math.min(pr0 * scale, 4, (maxT * 0.9) / Math.max(_sz.x, _sz.y)));
    const prevOv = override; override = null;
    const out = document.createElement('canvas');
    try {
      renderer.setPixelRatio(pr);
      if (fx.composer) { fx.w = 0; }
      renderFrame(cam, 0.016);
      out.width = renderer.domElement.width; out.height = renderer.domElement.height;
      out.getContext('2d').drawImage(renderer.domElement, 0, 0);
    } finally {
      renderer.setPixelRatio(pr0);
      if (fx.composer) fx.w = 0;
      override = prevOv;
    }
    return out;
  }
  function lookStats() {
    return {
      exposure: +renderer.toneMappingExposure.toFixed(3), toneMapping: look.toneMapping, path: look.path, customTone: look.customTone,
      sky: look.sky, fill: look.fill, inside: +look.inside.toFixed(2), envMaterials: look.envSet,
      hemi: env.hemi ? +env.hemi.intensity.toFixed(3) : null,
      clamp: look.clamp ? { materials: look.clamp.materials, albedoClamped: look.clamp.albedoClamped, emissiveCapped: look.clamp.emissiveCapped, examples: look.clamp.examples } : null,
      grade: !!fx.grade, bloom: fx.bloom ? { s: fx.bloom.strength, t: fx.bloom.threshold } : null,
    };
  }
  function stats() {
    return { composer: !!fx.composer, ao: fx.aoKind || 'none', bloom: !!fx.bloom, grade: !!fx.grade, smaa: !!fx.smaa, rectLights: rects.length, mirrors: mirrors.length, reflectors: mirrors.filter((m) => m.refl).length, probes: probes.filter((p) => p.mats.size).length, ...probeStats, addons: Object.keys(A), look: lookStats() };
  }

  return {
    ready, renderFrame, afterBuild, setQuality, makeMirror, captureView, requestProbes, hideHelpers,
    normalizeMaterials, applyEnv, lookStats, LOOK, toneGLSL: TONE_GLSL, gradeShader: GRADE_PASS,
    setOverride(fn) { override = typeof fn === 'function' ? fn : null; },
    get override() { return override; },
    get composer() { return fx.composer; },
    get exposureK() { const t = tod(); const b = typeof t.exp === 'number' && t.exp > 0 ? t.exp : 1; return renderer.toneMappingExposure / b; },
    get exposure() { return renderer.toneMappingExposure; },
    probes, rects, mirrors, stats,
  };
}
