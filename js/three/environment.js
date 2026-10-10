// VILNYI RIVER CITY — site environment (Agent B).
// Sky dome + IBL + fog + lights per mode; the plot with its landscaping, open-air parking and the P deck with the spiral
// ramp; the delivered Faza I and the Faza III blocks; the real street network around Str. Murelor (traced from the
// satellite view, true orientation via data.js COMPASS/GEO); a dense belt of single-family houses on their lots; the
// industrial halls, mid-rise blocks and Lacul Morii with its promenade, island park and fountain jet to the south-west;
// and a distant Bucharest skyline ring. Everything is procedural; repeats are instanced or merged (~70 draw calls).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, CONTEXT_BLOCKS, LAKE, LEVELS, PLOT, COMPASS, SPIRAL as SPIRAL_D, RAMP, localToWorld, geoToWorld, footprintOf, coresOf } from '../data.js?v=3.9';

// Uniforms shared with exterior.js (window glow etc. follow the environment mode).
export const SHARED = {
  uTime: { value: 0 }, uGlow: { value: 1 }, uLit: { value: 0.6 }, uNight: { value: 1 },
  envMap: null, envIntensity: 1, mats: new Set(), mode: 'dusk',
};
// Materials registered here get the sky IBL as their own envMap, so they keep outdoor reflections even while the
// walkthrough swaps scene.environment to an interior RoomEnvironment.
export function registerMaterial(m) {
  SHARED.mats.add(m);
  if (SHARED.envMap) applyEnv(m);
  return m;
}
function applyEnv(m) {
  const had = !!m.envMap;
  m.envMap = SHARED.envMap;
  m.envMapIntensity = (m.userData.envBase ?? 1) * SHARED.envIntensity;
  if (!had) m.needsUpdate = true;
}

export const SITE_CENTER = [42, -47];
const TAU = Math.PI * 2;
const LOW = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// Optional sibling modules: context.js (Faza I/III, open-air parking, spiral ramp) and lake.js (Lacul Morii, promenade,
// fountain, island, far skyline). They are fetched as soon as this module evaluates (not awaited at top level: they may
// import SHARED from here, and a top-level await would deadlock that cycle). Until they resolve — or if they are missing
// or throw — the inline versions below are used.
let MODS = null;
const MODS_P = (() => {
  const load = (p, fn) => import(p).then(m => (typeof m[fn] === 'function' ? m : null)).catch(e => { console.info(`[env] ${p} not used:`, e && e.message); return null; });
  return Promise.all([load('./context.js?v=3.9', 'createContext'), load('./lake.js?v=3.9', 'createLake')])
    .then(([context, lake]) => (MODS = { context, lake }));
})();

// ------------------------------------------------------------------ modes
// band = the thin warm glow hugging the whole horizon (blue hour), haze = how much the lowest sky melts into the fog.
// Exposure is expressed through the light/sky intensities (the renderer's exposure belongs to the host page).
const MODES = {
  day: {
    sunEl: 44, sunAz: 205, sunCol: '#fff1dc', sunI: 3.1, disc: 0.99985,
    hemiSky: '#d3e2f4', hemiGnd: '#6e6752', hemiI: 0.62, env: 0.95,
    zenith: '#3f78c0', horizon: '#cfdce6', horizonSun: '#f3efe6', band: '#000000', ground: '#8c9096', city: '#000000', sunGlow: 0.35,
    clouds: 0.3, cloudLit: '#ffffff', cloudShade: '#c3ccd8', stars: 0, haze: 1, streaks: 0.45, streakLit: '#f4f1ea', streakShade: '#b9c4d0',
    fog: '#c6d1da', fogD: 0.00046, glow: 0, lit: 0, night: 0, lights: 0,
    deep: '#1b3440', shore: '#56604c', fcol: [0.95, 0.97, 1.0], fAlpha: 0.9,
  },
  dusk: {  // blue hour, as the developer's night render: deep blue sky, pink/orange band on the horizon
    sunEl: -4, sunAz: 292, sunCol: '#ffc49a', sunI: 0.3, disc: 0.99975,
    hemiSky: '#8898cc', hemiGnd: '#3a3028', hemiI: 0.82, env: 0.8,
    zenith: '#0a1a44', horizon: '#3a5698', horizonSun: '#f39a62', band: '#f28a5e', ground: '#101218', city: '#3a2418', sunGlow: 1.0,
    clouds: 0.22, cloudLit: '#e88a70', cloudShade: '#243062', stars: 0.2, haze: 1, streaks: 0.8, streakLit: '#ff9a70', streakShade: '#2c3564',
    fog: '#5a5478', fogD: 0.00032, glow: 1, lit: 0.55, night: 0.85, lights: 1,
    deep: '#0a1426', shore: '#10131f', fcol: [1.1, 1.0, 0.92], fAlpha: 0.95,
  },
  night: {
    sunEl: 36, sunAz: 145, sunCol: '#b8c8ff', sunI: 0.26, disc: 0.99993,
    hemiSky: '#2a3864', hemiGnd: '#14120f', hemiI: 0.42, env: 0.8,
    zenith: '#02050f', horizon: '#16203e', horizonSun: '#1c2442', band: '#4a2c1c', ground: '#050508', city: '#4a2c18', sunGlow: 0.15,
    clouds: 0.16, cloudLit: '#2a3150', cloudShade: '#07080f', stars: 1.0, haze: 1, streaks: 0.35, streakLit: '#3a3446', streakShade: '#0a0c16',
    fog: '#24253a', fogD: 0.0003, glow: 1, lit: 0.5, night: 1, lights: 1.1,
    deep: '#03060d', shore: '#06070b', fcol: [0.9, 0.95, 1.15], fAlpha: 0.95,
  },
};

// ------------------------------------------------------------------ GLSL
const GLSL_NOISE = /* glsl */`
float vr_h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vr_h13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vr_noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(vr_h12(i), vr_h12(i + vec2(1., 0.)), u.x), mix(vr_h12(i + vec2(0., 1.)), vr_h12(i + vec2(1., 1.)), u.x), u.y); }
float vr_fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vr_noise(p); p = p * 2.03 + 19.7; a *= .5; } return s; }
`;
const GLSL_SKY = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHorizonSun; uniform vec3 uGroundCol;
uniform vec3 uSunCol; uniform float uSunGlow; uniform float uSunDisc; uniform vec3 uCityGlow;
uniform vec3 uBand; uniform vec3 uFogCol; uniform float uHaze;
vec3 vr_sky(vec3 d){
  float y = d.y;
  vec2 dh = normalize(d.xz + vec2(1e-5)); vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(dh, sh) * .5 + .5;
  float yy = max(y, 0.);
  vec3 hor = mix(uHorizon, uHorizonSun, pow(az, 6.) * .75);
  // zenith → horizon: slow at the top, fast in the last 15° (optical depth), like a real clear sky
  vec3 c = mix(hor, uZenith, pow(smoothstep(0., .62, yy), .55));
  c += uHorizonSun * uSunGlow * pow(az, 7.) * exp(-yy * 6.) * .55;
  // blue-hour band: a warm glow around the whole horizon, strongest towards the sun
  c += uBand * (.28 + .72 * pow(az, 2.)) * exp(-yy * 15.) * .55;
  c += uCityGlow * exp(-yy * 14.);
  // aerial haze: the sky meets the fogged far ground in exactly the fog colour — no seam, no dark stripe on the horizon
  c = mix(c, uFogCol, uHaze * exp(-yy * 110.));
  float cs = max(dot(d, uSunDir), 0.);
  c += uSunCol * (smoothstep(uSunDisc, uSunDisc + .00008, cs) * 14. + pow(cs, 90.) * .6 * uSunGlow + pow(cs, 7.) * .12 * uSunGlow);
  if (y < 0.) c = uFogCol + uCityGlow * .5 * exp(y * 40.);   // below the horizon: the fogged far ground
  return c;
}
`;
const GLSL_SKY_MAIN = /* glsl */`
uniform float uClouds; uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uStars; uniform float uTime;
uniform float uStreaks; uniform vec3 uStreakLit; uniform vec3 uStreakShade;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 c = vr_sky(d);
#ifdef DETAIL
  if (d.y > 0.) {
    vec2 p = d.xz / (d.y + .1) * 1.35 + vec2(uTime * .003, uTime * .001);
    float n = vr_fbm(p * vec2(.8, 2.4));
    float cov = smoothstep(1. - uClouds, 1. - uClouds + .3, n) * smoothstep(.04, .3, d.y);
    float cs = max(dot(d, uSunDir), 0.);
    vec3 cc = mix(uCloudShade, uCloudLit, clamp(pow(cs, 2.5) * 1.2 + (n - .5) * .8 + .25, 0., 1.));
    c = mix(c, cc, cov * .88);
    // low stratus streaks hugging the horizon (lit from below by the set sun at dusk), fading into the haze
    vec2 dh2 = normalize(d.xz + vec2(1e-5));
    float sn = vr_fbm(dh2 * 2.6 + vec2(d.y * 58., -d.y * 41.) + uTime * .0015);
    float sb = smoothstep(.01, .035, d.y) * smoothstep(.2, .07, d.y);
    float sk = smoothstep(.52, .78, sn) * sb * uStreaks;
    float sAz = pow(max(dot(dh2, normalize(uSunDir.xz + vec2(1e-5))) * .5 + .5, 0.), 3.);
    c = mix(c, mix(uStreakShade, uStreakLit, clamp(sAz * 1.2 + (sn - .6) * 1.5, 0., 1.)), sk * .75);
    if (uStars > 0.) {
      vec3 sp = d * 380.; vec3 sc = floor(sp); float h = vr_h13(sc);
      float st = step(.9983, h) * smoothstep(.42, .05, length(fract(sp) - .5));
      st *= (.55 + .45 * sin(uTime * (1.5 + h * 3.) + h * 90.)) * (.4 + 2.2 * fract(h * 71.3));
      c += vec3(.9, .93, 1.) * st * uStars * smoothstep(.03, .3, d.y) * (1. - cov);
    }
  }
#endif
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); p.z = p.w * .99999; gl_Position = p; }
`;

const WATER_VS = /* glsl */`
        varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`;
const WATER_FS = GLSL_NOISE + GLSL_SKY + /* glsl */`
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uShore; uniform float uNight; uniform float uScale;
        varying vec3 vW;
        #include <fog_pars_fragment>
        vec2 wv(vec2 p, vec2 d, float f, float a, float s){ return d * cos(dot(p, d) * f + uTime * s) * f * a; }
        void main(){
          vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = toC / dist;
          vec2 p = vW.xz * uScale;
          vec2 g = wv(p, vec2(.8, .6), .11, .8, 1.2) + wv(p, vec2(-.53, .85), .19, .45, 1.5) + wv(p, vec2(.96, -.28), .37, .2, 2.2) + wv(p, vec2(-.2, -.98), .71, .09, 3.1);
          vec2 q = p * .8 + vec2(uTime * .35, uTime * .21); float n0 = vr_noise(q);
          g += vec2(vr_noise(q + vec2(.3, 0.)) - n0, vr_noise(q + vec2(0., .3)) - n0) * 1.1;
          float fade = 1. / (1. + dist * .012);
          vec3 N = normalize(vec3(-g.x * .3 * fade, 1., -g.y * .3 * fade));
          vec3 R = reflect(-V, N); R.y = abs(R.y) + .012; R = normalize(R);
          vec3 sky = vr_sky(R);
          sky = mix(uShore, sky, smoothstep(.004, .03, R.y));
          float lt = smoothstep(.8, .98, vr_noise(vec2(atan(R.z, R.x) * 120., R.y * 300. - uTime * 1.5))) * smoothstep(.02, .0, R.y) * smoothstep(900., 250., dist) * uNight;
          sky += vec3(1., .7, .38) * lt * .5;
          float fres = .02 + .98 * pow(1. - max(dot(N, V), 0.), 5.);
          vec3 c = mix(uDeep, sky, fres);
          c += uSunCol * pow(max(dot(R, uSunDir), 0.), 320.) * 7. * smoothstep(-.02, .05, uSunDir.y);
          gl_FragColor = vec4(c, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`;

// ------------------------------------------------------------------ helpers
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const C = h => new THREE.Color(h);
function canvasTex(w, h, draw, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
// Soft radial falloff (white, alpha = profile) as plain bytes. Not a canvas gradient: a 2D canvas stores premultiplied
// alpha and some browsers dither gradients, which on phones came back as coloured speckles in the lamps' light pools.
function radialTex(inner = 0.0) {
  const n = 128, d = new Uint8Array(n * n * 4), i0 = Math.max(0.01, inner);
  const prof = r => (r < i0 ? 1 - 0.15 * r / i0 : r < 0.45 ? 0.85 - 0.57 * (r - i0) / (0.45 - i0) : r < 1 ? 0.28 * (1 - (r - 0.45) / 0.55) : 0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = (j * n + i) * 4; d[o] = d[o + 1] = d[o + 2] = 255;
    d[o + 3] = Math.round(255 * prof(Math.hypot((i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1)));
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
// flat geometry from a 2D shape given in world (x,z); lies at height y, faces up
function flatShapeGeo(shape, y = 0, uvScale = 1) {
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / uvScale, -p.getZ(i) / uvScale);
  return g;
}
const shapeFromXZ = pts => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
const pathFromXZ = pts => new THREE.Path(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
function ellipsePts(cx, cz, rx, rz, n, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, x = Math.cos(a) * rx, z = Math.sin(a) * rz; out.push([cx + x * Math.cos(rot) - z * Math.sin(rot), cz + x * Math.sin(rot) + z * Math.cos(rot)]); }
  return out;
}
// ------------------------------------------------------------------ materials with shader patches
// Buildings with procedural windows (context blocks, houses, city). Works for plain and instanced meshes.
function windowMaterial(o) {
  const m = new THREE.MeshStandardMaterial({ color: o.color || '#ffffff', roughness: o.rough ?? 0.85, metalness: 0 });
  const U = {
    uWinP: { value: new THREE.Vector4(o.colW, o.floorH, o.winW, o.winH) },
    uWinO: { value: new THREE.Vector4(o.base || 0, o.slab || 0, o.fin || 0, o.boost ?? 1) },
    uAcc: { value: new THREE.Vector4(...C(o.accent || '#000000').toArray(), o.accentAmt || 0) },
    uGlassC: { value: C(o.glass || '#262d36') }, uRoofC: { value: C(o.roof || '#4e4d50') }, uSlabC: { value: C(o.slabCol || '#f4efe6') },
    uLitK: { value: o.litK ?? 1 },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uGlow: SHARED.uGlow, uLit: SHARED.uLit });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSeed; varying vec3 vWP; varying vec3 vWN; varying float vSeed;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        mat4 vrM = modelMatrix;
        #ifdef USE_INSTANCING
        vrM = modelMatrix * instanceMatrix;
        #endif
        vWP = (vrM * vec4(position, 1.)).xyz; vWN = normalize(mat3(vrM) * normal); vSeed = aSeed;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_NOISE + `
        uniform vec4 uWinP; uniform vec4 uWinO; uniform vec4 uAcc; uniform vec3 uGlassC; uniform vec3 uRoofC; uniform vec3 uSlabC; uniform float uGlow; uniform float uLit; uniform float uLitK;
        varying vec3 vWP; varying vec3 vWN; varying float vSeed;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 vrN = normalize(vWN);
        float vrRoof = step(.6, vrN.y);
        vec2 vrF = vec2(dot(vWP.xz, vec2(-vrN.z, vrN.x)), vWP.y - uWinO.x);
        vec2 vrC = vrF / uWinP.xy;
        vec2 vrId = floor(vrC); vec2 vrG = fract(vrC);
        vec2 vrHalf = uWinP.zw / uWinP.xy * .5;
        vec2 vrW = max(fwidth(vrC), vec2(1e-4));
        float vrWin = smoothstep(vrHalf.x + vrW.x, vrHalf.x - vrW.x, abs(vrG.x - .5)) * smoothstep(vrHalf.y + vrW.y, vrHalf.y - vrW.y, abs(vrG.y - .5));
        vrWin *= (1. - vrRoof) * step(0., vrF.y);
        float vrFar = clamp(max(vrW.x, vrW.y) * 1.6 - .25, 0., 1.);
        float vrCov = (uWinP.z * uWinP.w) / (uWinP.x * uWinP.y) * (1. - vrRoof) * step(0., vrF.y);
        vrWin = mix(vrWin, vrCov, vrFar);
        float vrS = floor(vSeed + .5);                       // integer seed (varyings are not exact)
        float vrR = vr_h12(vrId + vec2(vrS * 7., vrS * 3.));
        float vrLit = mix(step(1. - uLit * uLitK, vrR), uLit * uLitK, vrFar);
        float vrSlab = uWinO.y * smoothstep(.07 + vrW.y, .07 - vrW.y, vrG.y) * (1. - vrRoof) * (1. - vrFar * .6);
        float vrFin = uWinO.z * smoothstep(.04 + vrW.x, .04 - vrW.x, abs(fract(vrC.x / 2.) - .5) - .46) * (1. - vrRoof) * (1. - vrFar);
        // accent columns (coloured cladding strips framing some window columns, full height)
        float vrAc = step(vr_h12(vec2(vrId.x * 1.3 + vrS, vrS * .7 + 5.)), uAcc.w) * step(abs(vrG.x - .5), vrHalf.x + .09) * (1. - vrRoof) * step(0., vrF.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, uAcc.rgb, vrAc * (1. - vrFar * .5));
        diffuseColor.rgb = mix(diffuseColor.rgb, uGlassC, vrWin);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSlabC, clamp(vrSlab + vrFin, 0., 1.) * (1. - vrWin));
        diffuseColor.rgb = mix(diffuseColor.rgb, uRoofC, vrRoof);
        vec3 vrWarm = mix(vec3(1., .58, .28), vec3(1., .82, .6), vr_h12(vrId * 1.7 + vrS));
        vec3 vrEm = vrWarm * vrWin * vrLit * uGlow * uWinO.w * (.5 + .9 * fract(vrR * 13.1));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .12, vrWin * (1. - vrFar * .6));')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, .8, vrWin * (1. - vrFar));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vrEm + diffuseColor.rgb * vec3(1., .8, .6) * uGlow * .05 * (1. - vrWin);');
  };
  m.customProgramCacheKey = () => 'vr-win';
  m.userData.envBase = 0.6;
  return m;
}

// Ground: world-space noise colouring (grass / dry grass / soil) so the huge plane never tiles visibly
// Beyond the modelled belt (r0) the ground paints the suburbs on to the horizon: the continued street grid, lots with
// roofs seen from above, dark tree masses and woodland; at night the streets and windows glow. Details fade to their
// average colour as they shrink below a pixel, so the far field never shimmers.
function groundMaterial(r0, r1) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uGlow = SHARED.uGlow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGW = (modelMatrix * vec4(position, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; uniform float uGlow;\n' + GLSL_NOISE + GLSL_GRID)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = vGW.xz;
        float gn = vr_fbm(p * .011); float gn2 = vr_fbm(p * .09 + 7.); float gn3 = vr_noise(p * .6);
        vec3 gc = mix(vec3(.085, .125, .05), vec3(.16, .17, .085), smoothstep(.35, .7, gn));
        gc = mix(gc, vec3(.17, .145, .1), smoothstep(.62, .85, gn2) * .5);
        gc *= .85 + .3 * gn3;
        float dC = length(p - vec2(${SITE_CENTER[0]}., ${SITE_CENTER[1]}.));
        float far = smoothstep(${r0.toFixed(1)}, ${(r0 + 80).toFixed(1)}, dC);
        float far2 = smoothstep(${r1.toFixed(1)}, ${(r1 + 120).toFixed(1)}, dC);    // beyond the instanced far houses
        vec3 vrEmG = vec3(0.);
        if (far > 0.) {
          float px = max(length(fwidth(p)), 1e-3);                 // metres per pixel
          vec2 st = vr_street(p);
          float road = 1. - smoothstep(3.2 - px * .5, 3.2 + px * .5, st.x);
          float walk = 1. - smoothstep(5.8 - px * .5, 5.8 + px * .5, st.x);
          // lots: 13 × 19 m cells, a roof in most of them
          vec2 lc = vec2(floor(p.x / 13.), floor(p.y / 19.));
          float h = vr_h12(lc), h2 = vr_h12(lc + 17.3);
          vec2 lf = fract(vec2(p.x / 13., p.y / 19.)) - .5;
          vec2 hs = vec2(.26 + .12 * h2, .2 + .1 * h);
          float roof = step(abs(lf.x - (h - .5) * .2), hs.x) * step(abs(lf.y - (h2 - .5) * .3), hs.y) * step(.18, h) * (1. - walk) * far2;
          vec3 rc = h2 < .55 ? mix(vec3(.3, .09, .05), vec3(.38, .15, .08), h) : h2 < .85 ? mix(vec3(.1, .1, .11), vec3(.2, .2, .2), h) : vec3(.55, .52, .46);
          float wd = vr_fbm(p * .004 + 3.) * .7 + vr_noise(p * .011) * .3;
          float forest = smoothstep(.56, .6, wd);
          float tree = smoothstep(.5, .56, vr_fbm(p * .045 + 11.) * .6 + wd * .55) * (1. - road) * far2;
          forest *= far2;
          vec3 yard = mix(gc, vec3(.1, .11, .06), .4);
          vec3 det = mix(yard, rc, roof * (1. - forest));
          det = mix(det, vec3(.03, .055, .02) * (.8 + .5 * vr_noise(p * .3)), max(tree, forest * (1. - road)));
          det = mix(det, vec3(.3, .29, .27), walk - road);
          det = mix(det, vec3(.05, .05, .055), road);
          // average colour of the pattern, used when a lot is only a few pixels
          vec3 avg = mix(mix(yard, vec3(.22, .12, .08), .22), vec3(.035, .055, .025), .45 + forest * .5);
          avg = mix(avg, vec3(.06, .06, .065), .08);
          det = mix(det, avg, smoothstep(1.2, 5., px));
          gc = mix(gc, det, far);
          // night: street lighting + lit windows, averaged far away
          float lamp = exp(-pow(mod(st.y, 34.) - 17., 2.) * .02) * (1. - smoothstep(0., 9., st.x));
          float win = roof * step(.62, fract(h * 13.7 + h2 * 3.1));
          float nearE = lamp * .1 + win * .2 + walk * .02;
          float farE = (.04 * (1. - forest) + .008) * far2 + .01;
          vrEmG = vec3(1., .62, .3) * uGlow * far * mix(nearE, farE, smoothstep(1.5, 6., px));
        }
        diffuseColor.rgb = gc;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vrEmG;');
  };
  m.customProgramCacheKey = () => 'vr-ground2';
  m.userData.envBase = 0.3;
  return m;
}

// Standard material whose map is sampled in world XZ (used for tiling paving / lawns on arbitrary geometry)
function stdMat(o) { const { envBase = 0.6, ...rest } = o; const m = new THREE.MeshStandardMaterial(rest); m.userData.envBase = envBase; return m; }

// ------------------------------------------------------------------ geometry builders
function crownGeometry(detail, lobes, seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < lobes; i++) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    let r, x = 0, y, z = 0;
    if (i === 0) { r = lobes > 2 ? 0.62 : 0.9; y = 0; }
    else { r = 0.36 + rnd() * 0.16; const a = rnd() * TAU, d = 0.34 + rnd() * 0.22; x = Math.cos(a) * d; z = Math.sin(a) * d; y = (rnd() - 0.35) * 0.7; }
    g.scale(r, r * 0.9, r); g.translate(x, y, z);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    parts.push(g);
  }
  const g = mergeVertices(mergeGeometries(parts), 1e-3);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 7.1 + v.y * 4.3) * Math.cos(v.z * 6.7 - v.y * 3.1) * 0.07 + Math.sin(v.x * 17.3 + v.z * 13.7 + v.y * 5.) * 0.035;
    const len = v.length(); v.multiplyScalar((len + n) / Math.max(len, 1e-3));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingBox();
  const bb = g.boundingBox; const h = bb.max.y - bb.min.y, w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); g.scale(2 / w, 1 / h, 2 / w);   // unit crown: radius 1, height 1, base at y=0
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), rr = Math.hypot(p.getX(i), p.getZ(i));
    const k = (0.55 + 0.45 * Math.pow(Math.min(1, Math.max(0, y)), 0.7)) * (0.78 + 0.22 * Math.min(1, rr));
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.95;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// Close-range crown: ~40 alpha-tested leaf cards spread through an ellipsoid (normals point away from the crown centre
// so the lighting stays soft and round) around a dark inner core that hides the see-through gaps.
function leafCrownGeometry(seed, cards = 40) {
  const rnd = mulberry32(seed), parts = [];
  const core = new THREE.IcosahedronGeometry(0.72, 0); core.deleteAttribute('uv'); core.scale(1, 0.62, 1); core.translate(0, 0.5, 0);
  { const n = core.attributes.position.count, uv = new Float32Array(n * 2).fill(0.5); core.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const col = new Float32Array(n * 3).fill(0.5); core.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  { // round (radial) normals so the inner core never shows as flat facets between the leaf cards
    const p = core.attributes.position, n = core.attributes.normal, r = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { r.set(p.getX(i), (p.getY(i) - 0.5) * 1.3, p.getZ(i)).normalize(); n.setXYZ(i, r.x, r.y, r.z); }
    core.getAttribute('color').array.fill(0.62);
  }
  parts.push(core.index ? core.toNonIndexed() : core);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < cards; i++) {
    // random point in the upper-weighted ellipsoid
    let x, y, z; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const r = 0.55 + 0.45 * Math.cbrt(rnd());
    c.set(x, y, z).normalize().multiplyScalar(r * 0.78); c.y = 0.5 + c.y * 0.55;
    const g = new THREE.PlaneGeometry(0.62, 0.62);
    e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI); q.setFromEuler(e); g.applyQuaternion(q); g.translate(c.x, c.y, c.z);
    const n = new THREE.Vector3(c.x, (c.y - 0.45) * 1.4, c.z).normalize(), p = g.attributes.position, nn = g.attributes.normal;
    const col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k); nn.setXYZ(k, n.x, n.y, n.z);
      const sh = 0.72 + 0.4 * Math.min(1, Math.max(0, v.y)) * (0.7 + 0.3 * Math.hypot(v.x, v.z) / 0.8);
      col.set([sh, sh, sh * 0.96], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const g = mergeGeometries(parts);
  return g;
}
let LEAF_TEX = null;
function leafTexture() {
  if (LEAF_TEX) return LEAF_TEX;
  LEAF_TEX = canvasTex(256, 256, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.fillStyle = '#2c3a1c'; g.beginPath(); g.arc(w / 2, w / 2, 7, 0, TAU); g.fill();   // opaque centre (the core samples it)
    const rr = mulberry32(31);
    for (let i = 0; i < 520; i++) {
      const a = rr() * TAU, d = Math.sqrt(rr()) * w * 0.44, x = w / 2 + Math.cos(a) * d, y = w / 2 + Math.sin(a) * d;
      const l = 36 + rr() * 36, sat = 32 + rr() * 26;
      g.fillStyle = `hsl(${80 + rr() * 30},${sat}%,${l}%)`;
      g.save(); g.translate(x, y); g.rotate(rr() * TAU); g.beginPath(); g.ellipse(0, 0, 4 + rr() * 6, 2 + rr() * 3, 0, 0, TAU); g.fill(); g.restore();
    }
  }, { srgb: true });
  LEAF_TEX.anisotropy = 4;
  return LEAF_TEX;
}
// 8-triangle crown for the far belt: a squashed octahedron with spherical normals (reads as a soft blob at 1–2 km)
function blobGeometry() {
  const g = new THREE.OctahedronGeometry(1, 0); g.deleteAttribute('uv');
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); n.setXYZ(i, ...v.clone().normalize().toArray());
    const y = v.y * 0.5 + 0.5; p.setXYZ(i, v.x, y, v.z);
    const k = 0.55 + 0.45 * y; col.set([k, k, k * 0.95], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function carGeometry() {
  const body = new THREE.BoxGeometry(4.3, 0.75, 1.8); body.translate(0, 0.62, 0);
  const cab = new THREE.BoxGeometry(2.3, 0.6, 1.62); cab.translate(-0.25, 1.28, 0);
  const cp = cab.attributes.position; for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 1.4) { cp.setX(i, cp.getX(i) * 0.82 - 0.1); cp.setZ(i, cp.getZ(i) * 0.9); }
  cab.computeVertexNormals();
  const paint = (g, k) => { const n = g.attributes.position.count; const c = new Float32Array(n * 3).fill(k); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
  const g = mergeGeometries([paint(body.toNonIndexed(), 1), paint(cab.toNonIndexed(), 0.13)]);
  g.deleteAttribute('uv');
  return g;
}

// ------------------------------------------------------------------ geography (true orientation)
// The world frame is the building frame (rotY = 0); true north is given by data.js COMPASS. Everything around the plot
// is traced from the Google Maps satellite view (map north up) in screenshot pixels and converted with the same geo
// frame as data.js (GEO: metres east/south of the site sketch's X), so streets, the lake and the neighbourhood sit at
// their real bearings: Str. Murelor runs N–S on the west, Intrarea Guliver / Str. Grigore H. Grandea on the south,
// Lacul Morii to the south-west.
const MPX = { ox: 554, oy: 960, s: 0.45 };                                  // screenshot px → GEO metres
const mp = ([px, py]) => geoToWorld((px - MPX.ox) * MPX.s, (py - MPX.oy) * MPX.s);
const mpl = pts => pts.map(mp);
const WAZ = b => b - COMPASS.negZ;                                           // true bearing → world bearing (from −z, clockwise)
const wDir = b => { const a = WAZ(b) * Math.PI / 180; return [Math.sin(a), -Math.cos(a)]; };

// Traced streets (px polylines). w = carriageway width (m); main = through traffic.
const T_ROADS = [
  // Str. Murelor bends west round the plot's west corner here (the traced line ran ≈ 40 m further east, through the site of
  // Faza III as the developer renders draw it): Faza III's outer bar C6 keeps ≈ 15 m to the kerb.
  { id: 'murelor', w: 8, main: true, px: [[205, 1500], [213, 1450], [226, 1400], [230, 1300], [232, 1200], [206, 1114], [162, 1048], [134, 988], [148, 903], [187, 776], [231, 662], [262, 590]] },
  { id: 'agnita', w: 8, main: true, px: [[262, 590], [300, 445], [340, 330], [378, 225], [412, 120], [445, 0], [490, -160], [540, -330]] },
  { id: 'murelor-w', w: 6, px: [[222, 682], [120, 645], [0, 605], [-160, 550]] },
  { id: 'guliver', w: 6, px: [[145, 1019], [190, 1034], [236, 1048], [330, 1075], [450, 1112], [560, 1138], [680, 1163], [760, 1180]] },
  { id: 'grandea', w: 7, px: [[-200, 975], [0, 1050], [80, 1090], [150, 1125], [233, 1165], [330, 1190], [430, 1212], [530, 1232], [630, 1245], [740, 1246], [830, 1246]] },
  { id: 'east', w: 8, main: true, px: [[830, 1246], [860, 1200], [890, 1150], [925, 1085], [960, 1015], [995, 950], [1015, 900], [1050, 810], [1090, 720], [1130, 630], [1170, 540], [1230, 420], [1320, 240]] },
  { id: 'north', w: 6, px: [[470, 690], [640, 762], [800, 825], [940, 885], [1015, 900]] },
  { id: 'tram', w: 13, main: true, px: [[-420, -110], [-200, 0], [0, 95], [250, 210], [520, 340], [820, 490], [1000, 570], [1185, 650], [1500, 790]] },
  { id: 'grandea-s', w: 5, px: [[232, 1272], [420, 1290], [620, 1328], [650, 1340]] },
  { id: 'lane-w', w: 5, px: [[140, 1118], [118, 1250], [98, 1360], [92, 1440]] },
  { id: 'agnita-w', w: 6, px: [[20, 640], [55, 800], [60, 950], [48, 1100], [30, 1250], [15, 1440]] },
  { id: 'strada-co', w: 6, px: [[20, 640], [80, 520], [130, 410], [170, 330], [215, 220], [260, 100]] },
  { id: 'lane-g', w: 5, px: [[345, 1082], [335, 1135], [330, 1190]] },
  { id: 'lane-g2', w: 5, px: [[520, 1132], [515, 1180], [510, 1228]] },
  { id: 'lake', w: 8, main: true, px: [[-700, 1420], [-300, 1430], [0, 1440], [200, 1446], [400, 1452], [600, 1462], [720, 1470], [830, 1478], [900, 1470], [1000, 1440], [1100, 1405], [1185, 1380], [1400, 1320]] },
  { id: 'ind-w', w: 6, px: [[700, 1470], [700, 1530], [708, 1620], [716, 1760], [726, 1900], [740, 2050], [760, 2260]] },
  { id: 'ind-s', w: 6, px: [[726, 1925], [900, 1905], [1060, 1880], [1250, 1850]] },
  { id: 'ind-n', w: 6, px: [[835, 1478], [860, 1540], [1000, 1520], [1100, 1500], [1250, 1480]] },
  { id: 'murelor-link', w: 5, px: [[213, 1450], [150, 1445]] },
].map(r => ({ ...r, pts: mpl(r.px) }));

/** The traced streets (world polylines): { id, w (carriageway width, m), main, pts }. */
export const ROADS = T_ROADS.map(r => ({ id: r.id, w: r.w, main: !!r.main, pts: r.pts }));
// Centre line of the street on the plot's NNE side ('north') as x(z)
const northX = z => { const P = T_ROADS.find(r => r.id === 'north').pts; let i = 0; while (i < P.length - 2 && P[i + 1][1] < z) i++; return P[i][0] + (P[i + 1][0] - P[i][0]) * (z - P[i][1]) / (P[i + 1][1] - P[i][1]); };
// Drop-off courts of the concierge lobbies (staircase 2 of C3 and C4): a sett-paved loop round a planted island between
// the wing's gable and the neighbouring phase, opening onto the 'north' street. The limousine (limo.js) waits at the
// kerb with its rear right door on the entrance axis: C3's stands facing into the court (it leaves round the island),
// C4's faces the street.
function forecourt(bId, islandW) {
  const c = coresOf(bId).find(q => q.stair === 2), [dx, dz] = localToWorld(bId, c.entrance[0], c.entrance[1]), s = Math.sign(c.zOut) || 1;
  const Z = k => +(dz + s * k).toFixed(2), KERB = 5.1, LANE = 4.6, span = (a, b) => [Math.min(a, b), Math.max(a, b)];
  const near = span(Z(KERB), Z(KERB + LANE)), isl = span(Z(KERB + LANE), Z(KERB + LANE + islandW)), far = span(Z(KERB + LANE + islandW), Z(KERB + 2 * LANE + islandW));
  return {
    id: bId, door: [dx, dz], s, kerb: Z(KERB), x0: 84.8, near, far, z0: Math.min(near[0], far[0]), z1: Math.max(near[1], far[1]),
    island: { x0: 96.5, x1: +(northX((isl[0] + isl[1]) / 2) - 6.6).toFixed(2), z0: isl[0], z1: isl[1] },
    zNear: Z(KERB + LANE / 2), zFar: Z(KERB + LANE + islandW + LANE / 2 + 0.2), xEdge: z => northX(z) - 3,
    // (the long car swings its nose out as it turns: it stands 1.3 m off the flush kerb)
    park: { x: +(dx - s * 2.74).toFixed(2), z: Z(KERB + 2.3), yaw: -s * Math.PI / 2 },
    // splay of the driveway where the limousine turns right into the street (towards +z): [[x, z] × 3]
    flare: (z1 => [[northX(z1) - 10.5, z1], [northX(z1) - 2.8, z1], [northX(z1 + 9) - 2.8, z1 + 9]])(Math.max(near[1], far[1])),
  };
}
export const FORECOURTS = { C3: forecourt('C3', 5.6), C4: forecourt('C4', 3.4) };
/** Every lobby entrance: { bId, stair, door: [x, z], s (outward along z) } — a pair of planters flanks each. */
export const ENTRANCES = Object.keys(BUILDINGS).flatMap(bId => coresOf(bId).filter(c => c.entrance && c.zOut != null).map(c => ({ bId, stair: c.stair, door: localToWorld(bId, c.entrance[0], c.entrance[1]), s: Math.sign(c.zOut) || 1 })));
// the paved apron between a concierge lobby's doors and its court (kept clear of planting)
const onApron = (x, z) => Object.values(FORECOURTS).some(F => Math.abs(x - F.door[0]) < 11 && (z - F.door[1]) * F.s > -0.5 && (z - F.kerb) * F.s < 1);
// (no street trees / lamp posts where the courts' driveways cross the verge)
const inApron = (x, z) => x > 115 && ((z > 17 && z < 47) || (z > -102 && z < -73));
// Planting and lighting of the courts and the quay stop: [x, z(, size, tone)]
const COURT = { trees: [], shrubs: [], bollards: [], posts: [] };
for (const F of Object.values(FORECOURTS)) {
  const I = F.island, zc = (I.z0 + I.z1) / 2, zb = F.kerb - F.s * 0.5;
  for (let x = I.x0 + 3.5; x < I.x1 - 2; x += 7) COURT.trees.push([x, zc, 0.8]);
  for (let x = I.x0 + 1.1; x < I.x1 - 0.8; x += 1.25) for (const z of (I.z1 - I.z0 > 4.5 ? [I.z0 + 0.85, I.z1 - 0.85] : [zc])) COURT.shrubs.push([x, z, 0.5, 0.3]);
  for (let x = F.x0 + 7; x < 116; x += 3) if (Math.abs(x - F.door[0]) > 2.6) COURT.bollards.push([x, zb]);
  COURT.posts.push([I.x0 + 0.9, zc], [I.x1 - 0.9, zc]);
}
// The quay stop on the lake road and the pier (see /YACHT-CONTRACT.md): S on the coping, W lakeward, T along the shore.
export const QUAY = (() => {
  const S = [-228.8, -45.9], W = [-0.965, 0.261], T = [0.261, 0.965];
  const at = (k, t = 0) => [+(S[0] + W[0] * k + T[0] * t).toFixed(2), +(S[1] + W[1] * k + T[1] * t).toFixed(2)];
  return { S, W, T, at, stop: at(-17.2, 2.5), Q: at(-4), G: at(24), kerbK: -15.7 };
})();
for (const t of [-6.5, -3.5, 4.5, 7.5, 10.5]) COURT.bollards.push(QUAY.at(-15.1, t));
COURT.posts.push(QUAY.at(-13.2, -6.2), QUAY.at(-13.2, 10.2));

// Areas (px polygons): no generic street grid inside them (their streets are traced) / no houses at all.
const Z_TRACED = mpl([[-300, 975], [236, 985], [236, 1045], [760, 1180], [835, 1245], [840, 1482], [-300, 1440]]);
const Z_IND = mpl([[585, 1255], [840, 1248], [905, 1262], [1400, 1300], [1450, 2600], [700, 2600], [652, 1700], [622, 1485], [585, 1470]]);
const Z_MID = mpl([[872, 1170], [930, 1060], [1000, 990], [1400, 950], [1420, 1300], [905, 1262], [872, 1250]]);
const Z_GREEN = mpl([[96, 1356], [240, 1338], [630, 1345], [640, 1446], [96, 1440]]);
// Industrial halls, the equestrian centre hall, the brewery and the solar-roofed building NE of the plot (px, height m)
const HALLS = [
  { px: [[720, 1630], [935, 1582], [1045, 1890], [800, 1935]], h: 11, roof: '#9ea4a8' },
  { px: [[900, 1545], [995, 1528], [1003, 1575], [908, 1592]], h: 12.5, roof: '#b8463c', band: true },
  { px: [[1040, 1680], [1185, 1650], [1200, 1760], [1060, 1790]], h: 8, roof: '#aeb2b3' },
  { px: [[1060, 1795], [1160, 1775], [1180, 1900], [1080, 1920]], h: 7, roof: '#8f9496' },
  { px: [[830, 1950], [990, 1922], [1010, 2040], [850, 2080]], h: 9, roof: '#8a8d90' },
  { px: [[860, 2092], [1010, 2062], [1020, 2140], [870, 2170]], h: 6, roof: '#b3aea4' },
  { px: [[755, 1345], [790, 1338], [852, 1470], [818, 1478]], h: 7, roof: '#e2e0da' },
  { px: [[870, 690], [990, 760], [955, 850], [835, 780]], h: 9, roof: '#5d6b7c', solar: true },
  { px: [[1045, 1440], [1120, 1425], [1130, 1470], [1055, 1485]], h: 6, roof: '#9a9ea2' },
].map(h => ({ ...h, poly: mpl(h.px) }));
// Mid-rise blocks east of the plot (px centre, length × width m, true bearing of the long axis, floors, pitched roof colour)
const MIDRISE = [
  { c: [932, 1212], L: 55, W: 16, b: 160, fl: 5, roof: '#9a4a36' }, { c: [1075, 1250], L: 50, W: 15, b: 160, fl: 5, roof: '#a3523b' },
  { c: [1070, 1120], L: 48, W: 14, b: 165, fl: 4, roof: null }, { c: [985, 1100], L: 32, W: 13, b: 70, fl: 4, roof: null },
  { c: [925, 1335], L: 40, W: 13, b: 155, fl: 4, roof: null }, { c: [1035, 1345], L: 46, W: 13, b: 75, fl: 5, roof: null },
  { c: [1160, 1200], L: 50, W: 14, b: 160, fl: 6, roof: null }, { c: [1150, 1060], L: 40, W: 14, b: 70, fl: 5, roof: '#8f4633' },
  { c: [1250, 1150], L: 60, W: 14, b: 160, fl: 8, roof: null }, { c: [1290, 1300], L: 50, W: 14, b: 70, fl: 6, roof: null },
].map(m => ({ ...m, w: mp(m.c) }));

// Lacul Morii shore: data.js polygon, smoothed (closed Catmull-Rom) and oriented counter-clockwise in (x, z)
const SHORE = (() => {
  const P = LAKE.shore, n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), k = Math.max(2, Math.round(L / 14));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  let a = 0; for (let i = 0; i < out.length; i++) { const [x0, z0] = out[i], [x1, z1] = out[(i + 1) % out.length]; a += x0 * z1 - x1 * z0; }
  return a < 0 ? out.reverse() : out;
})();
const SHORE_BB = SHORE.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [1e9, -1e9, 1e9, -1e9]);
// Outward-offset copy of the shore (for the quay top, promenade, lamps)
function offsetShore(d) {
  const n = SHORE.length, out = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = SHORE[(i - 1 + n) % n], [bx, bz] = SHORE[(i + 1) % n];
    const tx = bx - ax, tz = bz - az, L = Math.hypot(tx, tz) || 1;
    // CCW in (x,z) → outward normal is (tz, -tx)
    out.push([SHORE[i][0] + tz / L * d, SHORE[i][1] - tx / L * d]);
  }
  return out;
}
function inPoly(poly, x, z) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function distSeg(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}
function distPoly(poly, x, z, closed = true) {
  let d = Infinity; const n = poly.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) { const a = poly[i], b = poly[(i + 1) % n]; d = Math.min(d, distSeg(x, z, a[0], a[1], b[0], b[1])); }
  return d;
}
function inLake(x, z, m = 0) {
  if (x < SHORE_BB[0] - m || x > SHORE_BB[1] + m || z < SHORE_BB[2] - m || z > SHORE_BB[3] + m) return false;
  if (inPoly(SHORE, x, z)) return true;
  return m > 0 && distPoly(SHORE, x, z) < m;
}
const nearPoly = (poly, x, z, m) => inPoly(poly, x, z) || (m > 0 && distPoly(poly, x, z) < m);

// The plot as landscaped here: data.js PLOT with its west corner pushed out to the bent Str. Murelor so the full-width
// Faza III comb (CONTEXT_BLOCKS F3-*) stands on site ground (paving, lawns, no houses).
const SITE_PLOT = (() => {
  const f3 = CONTEXT_BLOCKS.filter(b => b.phase === 'III');
  if (!f3.length) return PLOT;
  const zMin = Math.min(...f3.map(b => b.z0)) - 6, xMax = Math.max(...f3.map(b => b.x1));
  const keep = PLOT.filter(([x, z]) => !(z < -130 && x < xMax + 20));
  const i = keep.findIndex(([x, z]) => x < -40 && z < -100);   // the plot's SW corner on Intrarea Guliver
  if (i < 0) return PLOT;
  return [...keep.slice(0, i + 1), [-41.5, zMin], [xMax + 17, zMin], ...keep.slice(i + 1)];
})();

// Project massing (world): our buildings, the context blocks, the P deck + spiral ramp
const BLD_POLYS = Object.keys(BUILDINGS).map(id => footprintOf(id).map(([x, z]) => localToWorld(id, x, z)));
const P_DECK = CONTEXT_BLOCKS.find(b => b.parking);
const SPIRAL = { x: SPIRAL_D.x, z: SPIRAL_D.z, r: SPIRAL_D.r, h: 7.2 };   // street side of the P deck, in front of the C3–C4 courtyard mouth
function nearBuilding(x, z, m) {
  for (const p of BLD_POLYS) if (nearPoly(p, x, z, m)) return true;
  for (const b of CONTEXT_BLOCKS) if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return true;
  return Math.hypot(x - SPIRAL.x, z - SPIRAL.z) < SPIRAL.r + m;
}

// ------------------------------------------------------------------ neighbourhood layout (computed once, deterministic)
// Occupancy raster (3 m cells) keeps roads, lots, houses, the plot and the lake from overlapping. Values:
// 0 free · 1 house · 2 yard · 3 asphalt · 4 sidewalk · 5 blocked (plot, lake, halls, blocks)
const OCC_CS = 3;
function makeOcc(cx, cz, R) {
  const n = Math.ceil(2 * R / OCC_CS), a = new Uint8Array(n * n), x0 = cx - R, z0 = cz - R;
  const idx = (x, z) => { const i = Math.floor((x - x0) / OCC_CS), j = Math.floor((z - z0) / OCC_CS); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
  const at = (x, z) => { const k = idx(x, z); return k < 0 ? 255 : a[k]; };
  const set = (x, z, v, soft) => { const k = idx(x, z); if (k >= 0 && (!soft || a[k] === 0)) a[k] = v; };
  // oriented rect: centre, unit axis u (half length hu), normal axis n = (-uz, ux) (half length hn)
  const rect = (cx, cz, ux, uz, hu, hn, fn) => {
    for (let s = -hu; s <= hu + 1e-6; s += Math.min(1.5, hu || 1.5)) for (let t = -hn; t <= hn + 1e-6; t += Math.min(1.5, hn || 1.5)) {
      if (fn(cx + ux * s - uz * t, cz + uz * s + ux * t) === false) return false;
    }
    return true;
  };
  const free = (cx, cz, ux, uz, hu, hn, yardOK = false) => rect(cx, cz, ux, uz, hu, hn, (x, z) => { const v = at(x, z); return v === 0 || (yardOK && v === 2); });
  const mark = (cx, cz, ux, uz, hu, hn, v, soft = false) => rect(cx, cz, ux, uz, hu, hn, (x, z) => { set(x, z, v, soft); });
  const fillPoly = (poly, v) => {  // scanline over cell rows
    let zmin = Infinity, zmax = -Infinity; for (const [, z] of poly) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
    for (let z = Math.floor((zmin - z0) / OCC_CS) * OCC_CS + z0 + OCC_CS / 2; z < zmax; z += OCC_CS) {
      const xs = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i], [xj, zj] = poly[j];
        if ((zi > z) !== (zj > z)) xs.push(xi + (z - zi) * (xj - xi) / (zj - zi));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = xs[k]; x < xs[k + 1]; x += OCC_CS) set(x, z, v);
    }
  };
  return { at, set, free, mark, fillPoly };
}

// The generic street grid of the suburbs (gently wobbling, never ruler-straight). The same formulas run in the ground
// shader (GLSL_GRID) so the painted far streets continue the modelled ones out to the horizon.
const GRID = { GZ: 76, GX: 172 };
const gridZ = (k, x) => SITE_CENTER[1] + 38 + k * GRID.GZ + 6 * Math.sin(k * 1.7) + 4 * Math.sin(x / 260 + k);
const gridX = (j, z) => SITE_CENTER[0] + 60 + j * GRID.GX + 15 * Math.sin(j * 2.3) + 5 * Math.sin(z / 310 + j * 1.3);
const GLSL_GRID = /* glsl */`
float vr_gz(float k, float x){ return ${SITE_CENTER[1] + 38}. + k * ${GRID.GZ}. + 6. * sin(k * 1.7) + 4. * sin(x / 260. + k); }
float vr_gx(float j, float z){ return ${SITE_CENTER[0] + 60}. + j * ${GRID.GX}. + 15. * sin(j * 2.3) + 5. * sin(z / 310. + j * 1.3); }
// distance to the nearest grid street (x = along-street coordinate of the nearest one, for lamp spacing)
vec2 vr_street(vec2 p){
  float k = floor((p.y - ${SITE_CENTER[1] + 38}.) / ${GRID.GZ}. + .5), j = floor((p.x - ${SITE_CENTER[0] + 60}.) / ${GRID.GX}. + .5);
  float dz = min(min(abs(p.y - vr_gz(k, p.x)), abs(p.y - vr_gz(k - 1., p.x))), abs(p.y - vr_gz(k + 1., p.x)));
  float dx = min(min(abs(p.x - vr_gx(j, p.y)), abs(p.x - vr_gx(j - 1., p.y))), abs(p.x - vr_gx(j + 1., p.y)));
  return dz < dx ? vec2(dz, p.x) : vec2(dx, p.y);
}
`;
// Smooth value noise (JS) for woods / parks: 0..1
function vnoise(x, z) {
  const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - ux) + h(i + 1, j) * ux) * (1 - uz) + (h(i, j + 1) * (1 - ux) + h(i + 1, j + 1) * ux) * uz;
}
const woods = (x, z) => vnoise(x / 260, z / 260) * 0.65 + vnoise(x / 90 + 17, z / 90 + 5) * 0.35;

let LAYOUT = null;
function computeLayout(low) {
  if (LAYOUT && LAYOUT.low === low) return LAYOUT;
  const rnd = mulberry32(4711);
  const [SX, SZ] = SITE_CENTER;
  // R_HOUSE: fully modelled houses (window shader, fences, garden trees); up to R_FAR: simple instanced houses
  const R_GRID = low ? 1350 : 1980, R_HOUSE = low ? 760 : 1180, R_FAR = R_GRID - 30;
  const occ = makeOcc(SX, SZ, R_GRID + 60);
  // blocked areas
  occ.fillPoly(offsetPolyXZ(SITE_PLOT, 4), 5);
  occ.fillPoly(offsetShore(18), 5);
  for (const h of HALLS) occ.fillPoly(offsetPolyXZ(h.poly, 5), 5);
  for (const z of [Z_IND, Z_MID]) occ.fillPoly(z, 5);
  occ.fillPoly(Z_GREEN, 5);

  // ---- roads: traced + generic grid aligned with the local street pattern (≈ 18° / 108° true = world x / z)
  const roads = T_ROADS.map(r => ({ id: r.id, w: r.w, main: !!r.main, pts: r.pts, traced: true }));
  const tracedSegs = [];
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) tracedSegs.push([r.pts[i], r.pts[i + 1], r.w]);
  const nearParallelTraced = (x, z, dx, dz) => {
    for (const [a, b] of tracedSegs) {
      if (distSeg(x, z, a[0], a[1], b[0], b[1]) > 17) continue;
      const ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1;
      if (Math.abs((ex * dx + ez * dz) / L) > 0.8) return true;
    }
    return false;
  };
  const gridOK = (x, z, dx, dz) => Math.hypot(x - SX, z - SZ) < R_GRID && !inLake(x, z, 26) && !nearPoly(SITE_PLOT, x, z, 9) &&
    !inPoly(Z_TRACED, x, z) && !inPoly(Z_IND, x, z) && !inPoly(Z_MID, x, z) && !inPoly(Z_GREEN, x, z) &&
    !HALLS.some(h => nearPoly(h.poly, x, z, 8)) && !nearParallelTraced(x, z, dx, dz);
  const STEP = 12, { GZ, GX } = GRID;
  const gridLines = [];
  for (let k = -Math.ceil(R_GRID / GZ); k <= Math.ceil(R_GRID / GZ); k++) gridLines.push({ axis: 'x', c: s => gridZ(k, s) });
  for (let k = -Math.ceil(R_GRID / GX); k <= Math.ceil(R_GRID / GX); k++) gridLines.push({ axis: 'z', c: s => gridX(k, s) });
  for (const gl of gridLines) {
    let run = null;
    const flush = () => { if (run && run.length >= 4) roads.push({ id: 'grid', w: 6, pts: run, axis: gl.axis }); run = null; };
    for (let s = -R_GRID; s <= R_GRID; s += STEP) {
      const [ax, az] = gl.axis === 'x' ? [SX + s, gl.c(SX + s)] : [gl.c(SZ + s), SZ + s];
      const [bx, bz] = gl.axis === 'x' ? [ax + STEP, gl.c(ax + STEP)] : [gl.c(az + STEP), az + STEP];
      const ok = gridOK((ax + bx) / 2, (az + bz) / 2, gl.axis === 'x' ? 1 : 0, gl.axis === 'x' ? 0 : 1);
      if (ok) { if (!run) run = [[ax, az]]; run.push([bx, bz]); } else flush();
    }
    flush();
  }
  // mark roads + sidewalks
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, mx = (ax + bx) / 2, mz = (az + bz) / 2;
    occ.mark(mx, mz, ux, uz, L / 2 + 1, r.w / 2 + 2.6, 4, true);
    occ.mark(mx, mz, ux, uz, L / 2 + 0.5, r.w / 2, 3);
  }

  // ---- lots + houses along the streets (walked by arc length, so lot widths never repeat with the road vertices)
  const lots = [], houses = [], gTrees = [], fences = [], farHouses = [], farTrees = [];
  const walls = ['#e6ddcc', '#ece4d4', '#dccfb8', '#efe9de', '#dcc7a3', '#d3cdc2', '#e8d7ba', '#e1dbd0', '#cfc1a6', '#eadcc3', '#d8cbb5', '#c9c3b8', '#e4d3b0', '#f0ebe2'];
  const roofsT = ['#8a4a37', '#7a4434', '#935640', '#6e3d30', '#9a5f48', '#85503e', '#5f3a2e', '#8f4a36', '#7c5040', '#6a4a3e'];
  const roofsG = ['#56585c', '#65676b', '#47494d', '#5d5550', '#4d5a66', '#3f4145', '#727477', '#6b5a4c', '#5a4a3e'];
  const yards = ['#4f5e33', '#56663a', '#5e6a3e', '#4a5a34', '#646a44', '#6e6c5a', '#7a776e', '#525e37', '#5a6440'];
  const houseOK = (x, z) => Math.hypot(x - SX, z - SZ) < R_FAR && !inLake(x, z, 32);
  const pick = (a, k) => a[k % a.length];
  const placeAlong = (r, minFront) => {
    const P = r.pts, cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = cum[cum.length - 1];
    const at = s => {
      let i = 0; while (i < P.length - 2 && cum[i + 1] < s) i++;
      const l = cum[i + 1] - cum[i] || 1, f = (s - cum[i]) / l, ux = (P[i + 1][0] - P[i][0]) / l, uz = (P[i + 1][1] - P[i][1]) / l;
      return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f, ux, uz];
    };
    for (const side of [1, -1]) {
      let s = 2 + rnd() * 8;
      while (s < total - 4) {
        const fw = minFront - 1 + rnd() * 7.5;
        const sc = s + fw / 2;
        if (sc > total - 2) break;
        s += fw;
        const [px, pz, ux, uz] = at(sc), nx = -uz, nz = ux;
        const hw = Math.min(fw - 2.6, 6.5 + rnd() * 6.5), hd = 7 + rnd() * 6, fy = 1.8 + rnd() * rnd() * 9;
        const off = r.w / 2 + 2.6 + fy + hd / 2;
        const hx = px + nx * side * off, hz = pz + nz * side * off;
        if (!houseOK(hx, hz) || rnd() < 0.06) continue;
        const dc = Math.hypot(hx - SX, hz - SZ);
        if (dc > 320 && woods(hx, hz) > 0.64) continue;                      // pockets of woodland between the streets
        if (!occ.free(hx, hz, ux, uz, hw / 2 + 1.2, hd / 2 + 1.2, true)) continue;
        const ld = 24 + rnd() * 14, l0 = r.w / 2 + 2.6;
        occ.mark(px + nx * side * (l0 + ld / 2), pz + nz * side * (l0 + ld / 2), ux, uz, fw / 2 - 0.4, ld / 2 - 0.4, 2, true);
        occ.mark(hx, hz, ux, uz, hw / 2, hd / 2, 1);
        const k = Math.floor(rnd() * 1e6), yaw0 = Math.atan2(-uz * side, ux * side);
        const r1 = rnd(), fl = r1 < 0.38 ? 1 : r1 < 0.9 ? 2 : 3, grey = rnd() < 0.34, rt = rnd();
        const back = (b, l) => [px + nx * side * b + ux * l, pz + nz * side * b + uz * l];
        if (dc > R_HOUSE) {   // far belt: simple instanced house + one or two back-yard trees
          farHouses.push({ x: hx, z: hz, yaw: yaw0 + (rnd() - 0.5) * 0.12, w: hw, d: hd, h: fl * 2.85 + 0.4, turn: rnd() < 0.3, wall: pick(walls, k), roofC: grey ? pick(roofsG, k) : pick(roofsT, k), lit: rnd() });
          const nT = rnd() < 0.3 ? 2 : 1;
          for (let t = 0; t < nT; t++) farTrees.push([...back(off + hd / 2 + 3 + rnd() * 12, (rnd() - 0.5) * fw * 0.8), 0.8 + rnd() * 0.6]);
          continue;
        }
        lots.push({ x: px + nx * side * (l0 + ld / 2), z: pz + nz * side * (l0 + ld / 2), ux, uz, fw, ld, yard: pick(yards, k), drive: rnd() < 0.55 ? (rnd() < 0.5 ? -1 : 1) : 0, px, pz, side, hw, off });
        houses.push({ x: hx, z: hz, yaw: yaw0 + (rnd() - 0.5) * (rnd() < 0.2 ? 0.2 : 0.06), w: hw, d: hd, h: fl * 2.85 + 0.45,
          roof: rt < 0.48 ? 'gable' : rt < 0.93 ? 'hip' : 'flat', turn: rnd() < 0.25, wall: pick(walls, k), roofC: grey ? pick(roofsG, k) : pick(roofsT, k) });
        // side wing (L-shaped plans, garages, porches)
        if (rnd() < 0.32) {
          const sd = rnd() < 0.5 ? -1 : 1, w3 = 3.2 + rnd() * 3.2, d3 = hd * (0.55 + rnd() * 0.5), l3 = sd * (hw / 2 + w3 / 2 - 0.2), b3 = off + (rnd() - 0.3) * 2.5;
          const [wx, wz] = back(b3, l3);
          if (occ.free(wx, wz, ux, uz, w3 / 2 - 0.3, d3 / 2, true)) {
            occ.mark(wx, wz, ux, uz, w3 / 2, d3 / 2, 1);
            houses.push({ x: wx, z: wz, yaw: yaw0, w: w3, d: d3, h: 2.85 + 0.35, roof: rnd() < 0.35 ? 'flat' : 'hip', turn: rnd() < 0.5, wall: pick(walls, k + 5), roofC: grey ? pick(roofsG, k) : pick(roofsT, k) });
          }
        }
        // front fence, garden trees (front, side, back yard — the lots are leafy, as on the satellite view)
        if (rnd() < 0.85) fences.push({ x: px + nx * side * (l0 + 0.15), z: pz + nz * side * (l0 + 0.15), ux, uz, L: fw - 0.8, h: 1.1 + rnd() * 0.8, c: rnd() });
        if (rnd() < 0.6) gTrees.push([...back(l0 + 1.5 + rnd() * 2, (rnd() < 0.5 ? -1 : 1) * (fw / 2 - 2)), 0.6 + rnd() * 0.45]);
        const nb = 2 + Math.floor(rnd() * 3.5);
        for (let t = 0; t < nb; t++) gTrees.push([...back(off + hd / 2 + 2.5 + rnd() * (ld - hd - fy - 4), (rnd() - 0.5) * fw * 0.8), 0.7 + rnd() * 0.65]);
        // back-yard house / annex (the lots are long and densely built)
        if (rnd() < 0.45) {
          const w2 = Math.min(fw - 3, 5 + rnd() * 5), d2 = 5 + rnd() * 4, b2 = off + hd / 2 + 2.5 + rnd() * 5 + d2 / 2, l2 = (rnd() - 0.5) * (fw - w2 - 2);
          const [ax2, az2] = back(b2, l2);
          if (houseOK(ax2, az2) && occ.free(ax2, az2, ux, uz, w2 / 2 + 0.6, d2 / 2 + 0.6, true)) {
            occ.mark(ax2, az2, ux, uz, w2 / 2, d2 / 2, 1);
            const g2 = rnd() < 0.4, rt2 = rnd();
            houses.push({ x: ax2, z: az2, yaw: yaw0 + (rnd() - 0.5) * 0.1, w: w2, d: d2, h: (rnd() < 0.7 ? 1 : 2) * 2.85 + 0.35,
              roof: rt2 < 0.55 ? 'gable' : rt2 < 0.85 ? 'hip' : 'flat', turn: rnd() < 0.4, wall: pick(walls, k + 3), roofC: g2 ? pick(roofsG, k + 1) : pick(roofsT, k + 2) });
          }
        }
      }
    }
  };
  for (const r of roads) if (r.traced && r.id !== 'tram') placeAlong(r, 10.5);
  for (const r of roads) if (r.axis === 'x') placeAlong(r, 11);
  placeAlong(roads.find(r => r.id === 'tram'), 13);
  for (const r of roads) if (r.axis === 'z') placeAlong(r, 11.5);

  // ---- woodland and leftover green: every free cell may carry a tree, far more likely inside the 'woods' field
  const wTrees = [];
  for (let x = SX - R_FAR; x < SX + R_FAR; x += 7.5) for (let z = SZ - R_FAR; z < SZ + R_FAR; z += 7.5) {
    const jx = x + (rnd() - 0.5) * 6, jz = z + (rnd() - 0.5) * 6, dc = Math.hypot(jx - SX, jz - SZ);
    if (dc > R_FAR || dc < 150) continue;
    const v = occ.at(jx, jz); if (v !== 0 && v !== 2) continue;
    const w = woods(jx, jz), p = v === 2 ? 0.05 : w > 0.64 ? 0.8 : w > 0.55 ? 0.3 : 0.05;
    if (rnd() > p || inLake(jx, jz, 12)) continue;
    (dc > R_HOUSE ? farTrees : wTrees).push([jx, jz, 0.8 + rnd() * 0.6]);
  }

  // ---- street trees, lamps, city lights, parked cars along the streets
  const sTrees = [], lamps = [], lights = [], kerbCars = [];
  for (const r of roads) {
    let acc = rnd() * 20, lampAcc = rnd() * 30, lightAcc = rnd() * 30, carAcc = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      for (let s = 0; s < L; s += 2) {
        const x = ax + ux * s, z = az + uz * s, dc = Math.hypot(x - SX, z - SZ);
        acc += 2; lampAcc += 2; lightAcc += 2; carAcc += 2;
        if ((r.traced ? dc < 520 : dc < R_HOUSE) && acc > 11) {
          acc = 0;
          for (const sd of [1, -1]) {
            const tx = x + nx * sd * (r.w / 2 + 1.5), tz = z + nz * sd * (r.w / 2 + 1.5), v = occ.at(tx, tz);
            if ((v === 4 || v === 0) && rnd() < (r.traced ? 0.72 : 0.3) && !nearPoly(SITE_PLOT, tx, tz, -0.1) && !nearBuilding(tx, tz, 3)) sTrees.push([tx, tz, 0.8 + rnd() * 0.35]);
          }
        }
        if (dc < (r.traced ? 460 : 240) && lampAcc > 30) {
          lampAcc = 0; const sd = (Math.floor(s / 30) + i) % 2 ? 1 : -1;
          const lx = x + nx * sd * (r.w / 2 + 1.1), lz = z + nz * sd * (r.w / 2 + 1.1);
          if (occ.at(lx, lz) !== 1 && !nearBuilding(lx, lz, 2)) lamps.push([lx, lz, Math.atan2(-nx * sd, -nz * sd)]);
        } else if (lightAcc > 33) {
          lightAcc = 0; const sd = rnd() < 0.5 ? 1 : -1;
          lights.push([x + nx * sd * (r.w / 2 + 1), z + nz * sd * (r.w / 2 + 1)]);
        }
        if (r.traced && !r.main && dc < 330 && carAcc > 6.2) {
          carAcc = 0;
          if (rnd() < 0.3) { const sd = rnd() < 0.5 ? 1 : -1; const cx = x + nx * sd * (r.w / 2 - 1.1), cz = z + nz * sd * (r.w / 2 - 1.1); if (!nearPoly(SITE_PLOT, cx, cz, 2)) kerbCars.push([cx, cz, Math.atan2(-uz, ux) + (rnd() < 0.5 ? 0 : Math.PI)]); }
        }
      }
    }
  }
  // ---- park trees: the band around Lacul Morii, the green strip north of the lake road, the island
  const pTrees = [], willows = [];
  const band = offsetShore(0);
  for (let i = 0; i < band.length; i++) {
    const [x, z] = band[i], [x2, z2] = band[(i + 1) % band.length], L = Math.hypot(x2 - x, z2 - z) || 1;
    const nx = (z2 - z) / L, nz = -(x2 - x) / L;          // outward
    const n = low ? 2 : 4;
    for (let k = 0; k < n; k++) {
      const d = 12 + Math.pow(rnd(), 1.3) * 110, t = rnd();
      const px = x + (x2 - x) * t + nx * d, pz = z + (z2 - z) * t + nz * d;
      if (Math.hypot(px - SX, pz - SZ) > R_GRID) continue;
      const v = occ.at(px, pz); if (v !== 0 && v !== 5) continue;
      if (inLake(px, pz, 9) || nearPoly(SITE_PLOT, px, pz, 4) || HALLS.some(h => nearPoly(h.poly, px, pz, 4)) || roadsNear(roads, px, pz, 6)) continue;
      (d < 30 && rnd() < 0.55 ? willows : pTrees).push([px, pz, 0.85 + rnd() * 0.45]);
    }
  }
  for (let i = 0; i < (low ? 90 : 220); i++) {
    const t = rnd(), s = rnd();
    const x = Z_GREEN[0][0] + (Z_GREEN[2][0] - Z_GREEN[0][0]) * t + (Z_GREEN[4][0] - Z_GREEN[0][0]) * s;
    const z = Z_GREEN[0][1] + (Z_GREEN[2][1] - Z_GREEN[0][1]) * t + (Z_GREEN[4][1] - Z_GREEN[0][1]) * s;
    if (inPoly(Z_GREEN, x, z) && !roadsNear(roads, x, z, 5)) pTrees.push([x, z, 0.8 + rnd() * 0.5]);
  }
  LAYOUT = { low, roads, lots, houses, gTrees, wTrees, fences, farHouses, farTrees, sTrees, lamps, lights, kerbCars, pTrees, willows, R_GRID, R_HOUSE, R_FAR, occ };
  return LAYOUT;
}
function roadsNear(roads, x, z, m) {
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    if (Math.abs(a[0] - x) > 200 && Math.abs(b[0] - x) > 200) continue;
    if (distSeg(x, z, a[0], a[1], b[0], b[1]) < r.w / 2 + m) return true;
  }
  return false;
}
// Offset a simple polygon outward by d (miter via averaged edge normals; fine for the gentle plot / hall outlines)
function offsetPolyXZ(poly, d) {
  let a = 0; for (let i = 0; i < poly.length; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length]; a += x0 * z1 - x1 * z0; }
  const sg = a > 0 ? 1 : -1, n = poly.length;
  return poly.map((p, i) => {
    const q0 = poly[(i - 1 + n) % n], q1 = poly[(i + 1) % n];
    const e0 = [p[0] - q0[0], p[1] - q0[1]], e1 = [q1[0] - p[0], q1[1] - p[1]];
    const l0 = Math.hypot(...e0) || 1, l1 = Math.hypot(...e1) || 1;
    const n0 = [sg * e0[1] / l0, -sg * e0[0] / l0], n1 = [sg * e1[1] / l1, -sg * e1[0] / l1];
    const mx = n0[0] + n1[0], mz = n0[1] + n1[1], ml = Math.hypot(mx, mz) || 1, cos = (mx * n1[0] + mz * n1[1]) / ml;
    const k = d / Math.max(0.35, cos);
    return [p[0] + mx / ml * k, p[1] + mz / ml * k];
  });
}

// Site plan canvas (world-axis rect around the plot and its four streets, painted at high resolution)
const SITE = { x0: -64, x1: 160, z0: -206, z1: 164 };
// Landscaping of the plot (world). C4 (x −13…115, z −75.8…−58.8) and C3 (z −8.5…8.5) enclose the courtyard (z −58.8…−8.5,
// open to the SSW, closed by the two wings at x 98…115); Faza I is the ring east of C3, Faza III the comb west of C4
// (C5 z −118…−101, C6 z −185…−168, spine at x 98…115; its courtyard z −168…−118 opens to the SSW like ours).
const YARD = { x: 58, z: -33.6 };                                    // courtyard garden centre (ring path, plaza, pool)
const PLAY = [14, 30, -53, -41];                                     // kindergarten playground (by C4's kindergarten)
// Lawns [x0, x1, z0, z1, corner radius] and footpaths [[x, z]…, width] of the plot (painted, and used to plant trees/shrubs)
const LAWNS = [
  [14, 30, -37.5, -13, 3],                                           // courtyard, in front of C3's amenity
  [34, 82, -52, -13, 6],                                             // courtyard garden
  [91, 96.5, -28, -13, 2],                                           // courtyard, by the wing tips
  [44, 83.6, 19, 35.5, 3],                                           // C3–Faza I promenade garden (west of the C3 drop-off court)
  [28, 83.6, -98.5, -87.5, 4],                                       // C4–Faza III garden (west of the C4 drop-off court)
  [8, 94, 59, 111, 5],                                               // Faza I courtyard
  [30, 92, -162, -124, 6],                                           // Faza III courtyard garden
];
const PATHS = [
  [[[-12, 16], [101.7, 16]], 2.6], [[[-12, -85], [101.7, -85]], 2.6],   // promenades along the lobby fronts (outer sides)
  [[[10, YARD.z], [YARD.x - 16, YARD.z]], 2.2], [[[YARD.x + 16, YARD.z], [84, YARD.z]], 2.2],
  [[[YARD.x, YARD.z - 12], [YARD.x, -52]], 2.2], [[[YARD.x, YARD.z + 12], [YARD.x, -13]], 2.2],
  [[[62, -86], [62, -99]], 2.4], [[[28, -93], [84, -93]], 2.2],
  [[[8, 85], [94, 85]], 2.4], [[[51, 59], [51, 111]], 2.4],
  [[[2, -143], [97, -143]], 2.2], [[[61, -121], [61, -165]], 2.2],
];
const PLAZAS = [[YARD.x, YARD.z, 8.6], [62, -93, 4.8], [61, -143, 6.4], [51, 85, 7.4], [(PLAY[0] + PLAY[1]) / 2, (PLAY[2] + PLAY[3]) / 2, 9]];   // incl. the kindergarten playground
function nearPath(x, z, m) {
  for (const [pts, w] of PATHS) for (let i = 0; i < pts.length - 1; i++) if (distSeg(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < w / 2 + m) return true;
  const e = Math.hypot((x - YARD.x) / 16, (z - YARD.z) / 12); if (Math.abs(e - 1) * 13 < 1.2 + m) return true;   // courtyard ring path
  return PLAZAS.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + m);
}
// Open-air car parks [x0, x1, z0, z1, rows [[xa, xb]…]] (perpendicular 2.5 m × 5 m bays, cars along x) — same list as context.js
const SITE_LOTS = [
  [-12, 10, -54, -13, [[-12, -7], [5, 10]]],                          // courtyard mouth
  [-12, 40, 19, 35, [[-12, -7], [-1, 4], [4, 9], [15, 20], [20, 25], [35, 40]]],   // between C3 and Faza I
  [-12, 24, -99, -87, [[-12, -7], [-1, 4], [4, 9], [19, 24]]],        // between C4 and Faza III
  [-12, 10, -164, -122, [[-12, -7], [5, 10]]],                        // Faza III courtyard mouth
  [-38, -17, 40, 120, [[-38, -33], [-22, -17]]],                      // in front of Faza I, along Intrarea Guliver
];

// ================================================================== createEnvironment
export function createEnvironment(scene, renderer, opts = {}) {
  const mode0 = opts.mode || 'dusk';
  const shadows = opts.shadows ?? !!(renderer && renderer.shadowMap && renderer.shadowMap.enabled);
  const group = new THREE.Group(); group.name = 'vrc-environment';
  const disposables = [];
  const rnd = mulberry32(20260929);
  const nightOnly = [];      // objects visible only at dusk/night
  const tickers = [];        // per-frame updaters
  const treeSets = [];
  const L = computeLayout(LOW);
  let parkedCars = [], pendingPool = null, poolU = null, nightU = null, trafficAvoid = null;
  let detU = null, paveTex = null;   // tiling detail textures (detailTextures)
  const _v2 = new THREE.Vector2();
  // Inline fallbacks for the sibling modules live in their own groups so they can be dropped when a module takes over.
  const ctxG = new THREE.Group(); ctxG.name = 'env-inline-context';
  const lakeG = new THREE.Group(); lakeG.name = 'env-inline-lake';
  group.add(ctxG, lakeG);
  let tgt = group;                                   // where the builders below add their meshes
  const within = (g, fn) => { const prev = tgt; tgt = g; try { return fn(); } finally { tgt = prev; } };
  const ext = { context: null, lake: null };
  let mode = null, disposed = false;
  const makeExt = (key, mod) => {
    if (!mod) return null;
    try {
      const inst = key === 'context' ? mod.createContext({ shadows, lowDetail: LOW }) : mod.createLake({ lowDetail: LOW, shadows });
      if (!inst || !inst.group) throw new Error('no group');
      group.add(inst.group);
      if (mode) inst.setMode && inst.setMode(mode);
      return inst;
    } catch (e) { console.warn(`[env] ${key}.js failed, using the inline version`, e); return null; }
  };
  const useMods = opts.modules !== false;           // opts.modules=false forces the inline versions (debugging)
  if (MODS && useMods) { ext.context = makeExt('context', MODS.context); ext.lake = makeExt('lake', MODS.lake); }

  // ---------------- lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5); group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.target.position.set(SITE_CENTER[0] - 10, 0, SITE_CENTER[1] + 20);
  group.add(sun, sun.target);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
    const sc = sun.shadow.camera; sc.left = -210; sc.right = 210; sc.top = 210; sc.bottom = -210; sc.near = 10; sc.far = 1400;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  }

  // ---------------- sky
  const SKYU = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: C('#000') }, uHorizon: { value: C('#000') },
    uHorizonSun: { value: C('#000') }, uGroundCol: { value: C('#000') }, uSunCol: { value: C('#fff') },
    uSunGlow: { value: 1 }, uSunDisc: { value: 0.9998 }, uCityGlow: { value: C('#000') },
    uBand: { value: C('#000') }, uFogCol: { value: C('#000') }, uHaze: { value: 0 },
  };
  const skyDetailU = { ...SKYU, uClouds: { value: 0.3 }, uCloudLit: { value: C('#fff') }, uCloudShade: { value: C('#888') }, uStars: { value: 0 }, uTime: SHARED.uTime,
    uStreaks: { value: 0 }, uStreakLit: { value: C('#fff') }, uStreakShade: { value: C('#888') } };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyDetailU, vertexShader: SKY_VS, fragmentShader: '#define DETAIL\n' + GLSL_NOISE + GLSL_SKY + GLSL_SKY_MAIN,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), skyMat);
  dome.frustumCulled = false; dome.renderOrder = -1e6; dome.name = 'sky';
  group.add(dome);
  const envScene = new THREE.Scene();
  const envSkyMat = new THREE.ShaderMaterial({
    uniforms: { ...SKYU, uClouds: { value: 0 }, uCloudLit: { value: C('#fff') }, uCloudShade: { value: C('#fff') }, uStars: { value: 0 }, uTime: SHARED.uTime, uStreaks: { value: 0 }, uStreakLit: { value: C('#fff') }, uStreakShade: { value: C('#fff') } },
    vertexShader: SKY_VS, fragmentShader: GLSL_NOISE + GLSL_SKY + GLSL_SKY_MAIN, side: THREE.BackSide, depthWrite: false,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envSkyMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCache = {};

  // ---------------- ground (hole for the lake), neighbourhood carpet, site plan
  {
    const R = 9000;
    const shape = new THREE.Shape(); shape.absarc(SITE_CENTER[0], -SITE_CENTER[1], R, 0, TAU, false);
    shape.holes.push(pathFromXZ(SHORE.slice().reverse()));
    // (nothing of the ground shows under the opaque site plan: leave it out there — less overdraw, and the few huge
    //  ground triangles can no longer win the depth test against the paving at walking height on low-precision rasterisers)
    shape.holes.push(pathFromXZ([[SITE.x0 + 0.6, SITE.z0 + 0.6], [SITE.x0 + 0.6, SITE.z1 - 0.6], [SITE.x1 - 0.6, SITE.z1 - 0.6], [SITE.x1 - 0.6, SITE.z0 + 0.6]]));
    const g = new THREE.ShapeGeometry(shape, 64); g.rotateX(-Math.PI / 2); g.translate(0, -0.1, 0);
    const ground = new THREE.Mesh(g, registerMaterial(groundMaterial(L.R_HOUSE + 60, L.R_FAR - 80)));
    ground.receiveShadow = shadows; ground.name = 'ground';
    group.add(ground);
  }
  buildCarpet();
  group.add(buildSitePlan());
  buildForecourts();
  buildRoadStrips();

  // ---------------- lake, shore promenade, island, fountain (inline fallback for lake.js)
  let lakeLamps = [];
  const water = ext.lake ? null : within(lakeG, buildLake);

  // ---------------- objects
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: C('#ffc88a'), emissiveIntensity: 0, roughness: 0.4 });
  const poolMat = new THREE.MeshBasicMaterial({ map: radialTex(0.05), color: C('#ffb467'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  disposables.push(poolMat.map);
  const poolsBy = new Map();   // group → [[x, z, radius]]
  const addPool = (x, z, r) => { if (!poolsBy.has(tgt)) poolsBy.set(tgt, []); poolsBy.get(tgt).push([x, z, r]); };
  buildSiteObjects();
  if (!ext.context) within(ctxG, buildContext);
  buildNeighbourhood();
  if (!ext.lake) within(lakeG, buildSkyline);
  buildTraffic();
  buildNightLights();
  buildDeferred();

  // Modules that arrive after this call replace their inline fallback.
  const dropGroup = g => {
    group.remove(g);
    g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  };
  const ready = MODS || !useMods ? Promise.resolve() : MODS_P.then(m => {
    if (disposed) return;
    if (!ext.context && (ext.context = makeExt('context', m.context))) dropGroup(ctxG);
    if (!ext.lake && (ext.lake = makeExt('lake', m.lake))) dropGroup(lakeG);
  });
  if (ext.context) group.remove(ctxG);
  if (ext.lake) group.remove(lakeG);

  // ---------------- mode
  function setMode(m) {
    m = MODES[m] ? m : 'dusk'; mode = m; SHARED.mode = m;
    const P = MODES[m];
    const el = THREE.MathUtils.degToRad(P.sunEl), az = THREE.MathUtils.degToRad(WAZ(P.sunAz));   // sunAz = true bearing
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    SKYU.uSunDir.value.copy(dir);
    SKYU.uZenith.value.set(P.zenith); SKYU.uHorizon.value.set(P.horizon); SKYU.uHorizonSun.value.set(P.horizonSun);
    SKYU.uGroundCol.value.set(P.ground); SKYU.uSunCol.value.set(P.sunCol); SKYU.uSunGlow.value = P.sunGlow; SKYU.uSunDisc.value = P.disc;
    SKYU.uCityGlow.value.set(P.city); SKYU.uBand.value.set(P.band); SKYU.uFogCol.value.set(P.fog); SKYU.uHaze.value = P.haze;
    skyDetailU.uClouds.value = P.clouds; skyDetailU.uCloudLit.value.set(P.cloudLit); skyDetailU.uCloudShade.value.set(P.cloudShade); skyDetailU.uStars.value = P.stars;
    skyDetailU.uStreaks.value = P.streaks || 0; skyDetailU.uStreakLit.value.set(P.streakLit || '#fff'); skyDetailU.uStreakShade.value.set(P.streakShade || '#888');
    const ld = dir.clone(); if (ld.y < 0.2) { ld.y = 0.2; ld.normalize(); }
    sun.position.copy(sun.target.position).addScaledVector(ld, 700);
    sun.color.set(P.sunCol); sun.intensity = P.sunI;
    hemi.color.set(P.hemiSky); hemi.groundColor.set(P.hemiGnd); hemi.intensity = P.hemiI;
    scene.fog = new THREE.FogExp2(C(P.fog), P.fogD);
    scene.background = C(P.fog);
    SHARED.uGlow.value = P.glow; SHARED.uLit.value = P.lit; SHARED.uNight.value = P.night;
    if (!envCache[m]) envCache[m] = pmrem.fromScene(envScene, 0.02).texture;
    scene.environment = envCache[m];
    SHARED.envMap = envCache[m]; SHARED.envIntensity = P.env;
    for (const mm of SHARED.mats) applyEnv(mm);
    for (const o of nightOnly) o.visible = P.night > 0;
    lampHeadMat.emissiveIntensity = P.night * 3.5;
    if (nightU) { nightU.uI.value = P.lights; nightU.uFogD.value = P.fogD; }
    poolMat.opacity = P.night > 0 ? 0.75 * P.night + 0.1 : 0;
    if (water) water.setMode(P);
    if (poolU) { poolU.uDeep.value.set(P.deep); poolU.uShore.value.set(P.shore); }
    for (const e of [ext.context, ext.lake]) if (e && e.setMode) { try { e.setMode(m); } catch (err) { console.warn(err); } }
  }
  setMode(mode0);
  scene.add(group);

  function update(dt, camera) {
    dt = Math.min(dt || 0, 0.1);
    SHARED.uTime.value += dt;
    if (camera) dome.position.copy(camera.position);
    if (nightU && renderer) nightU.uViewH.value = renderer.getDrawingBufferSize(_v2).y;
    for (const f of tickers) f(dt, camera);
    for (const e of [ext.context, ext.lake]) if (e && e.update) e.update(dt, camera);
  }

  function dispose() {
    disposed = true;
    for (const e of [ext.context, ext.lake]) if (e && e.dispose) { try { e.dispose(); } catch (err) { console.warn(err); } if (e.group) group.remove(e.group); }
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) { if (m.map) m.map.dispose(); SHARED.mats.delete(m); m.dispose(); }
    });
    for (const t of disposables) t.dispose && t.dispose();
    for (const k of Object.keys(envCache)) envCache[k].dispose();
    envSkyMat.dispose(); pmrem.dispose();
    if (Object.values(envCache).includes(scene.environment)) scene.environment = null;
    if (SHARED.envMap && Object.values(envCache).includes(SHARED.envMap)) SHARED.envMap = null;
    scene.fog = null; scene.background = null;
  }

  // ready: resolves once context.js / lake.js have been tried (stills wait for it); modules: the live instances
  // setTrafficAvoid({x, z, hx, hz, v} | null): the moving traffic keeps clear of that vehicle (limo.js)
  return { group, sun, hemi, setMode, update, dispose, ready, modules: ext, get mode() { return mode; }, setTrafficAvoid(a) { trafficAvoid = a || null; } };

  // ================================================================ painting helpers (world units on a canvas)
  function polyPath(g, pts, close = true) { g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); if (close) g.closePath(); }
  function noisePattern(g, base, dark, light, n = 900, size = 64) {
    const c = document.createElement('canvas'); c.width = c.height = size; const q = c.getContext('2d');
    q.fillStyle = base; q.fillRect(0, 0, size, size);
    const rr = mulberry32(size + n);
    for (let i = 0; i < n; i++) { q.fillStyle = rr() < 0.5 ? dark : light; q.fillRect(rr() * size, rr() * size, 1 + rr(), 1 + rr()); }
    return g.createPattern(c, 'repeat');
  }
  function paintLots(g, detail) {
    for (const l of L.lots) {
      const { x, z, ux, uz, fw, ld } = l, nx = -uz, nz = ux, hu = fw / 2, hn = ld / 2;
      const c = [[x - ux * hu - nx * hn, z - uz * hu - nz * hn], [x + ux * hu - nx * hn, z + uz * hu - nz * hn], [x + ux * hu + nx * hn, z + uz * hu + nz * hn], [x - ux * hu + nx * hn, z - uz * hu + nz * hn]];
      g.fillStyle = l.yard; polyPath(g, c); g.fill();
      if (detail) { g.strokeStyle = 'rgba(225,220,205,0.55)'; g.lineWidth = 0.25; g.stroke(); }
      if (l.drive) {   // paved driveway from the street to the house side
        const s = l.side;
        const bx = l.px + ux * l.drive * (l.hw / 2 + 1.6), bz = l.pz + uz * l.drive * (l.hw / 2 + 1.6);
        const e = l.off + 2, w = 1.4;
        g.fillStyle = '#a8a39a';
        polyPath(g, [[bx + nx * s * 3 - ux * w, bz + nz * s * 3 - uz * w], [bx + nx * s * 3 + ux * w, bz + nz * s * 3 + uz * w], [bx + nx * s * e + ux * w, bz + nz * s * e + uz * w], [bx + nx * s * e - ux * w, bz + nz * s * e - uz * w]]); g.fill();
      }
    }
    // tree shadows / shrubs in the back yards (cheap texture detail)
    if (detail) {
      const rr = mulberry32(99);
      for (const [x, z, s] of L.gTrees) { g.fillStyle = rr() < 0.5 ? 'rgba(30,45,15,0.35)' : 'rgba(45,60,20,0.3)'; g.beginPath(); g.arc(x + 1, z + 1, 2.6 * s, 0, TAU); g.fill(); }
    }
  }
  function paintRoads(g, markings, ppm) {
    const strokeAll = (w, col, filter = () => true) => {
      g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const r of L.roads) { if (!filter(r)) continue; g.lineWidth = w(r); polyPath(g, r.pts, false); g.stroke(); }
    };
    strokeAll(r => r.w + 5.6, '#b9b3a8');                       // sidewalks
    strokeAll(r => r.w + 0.9, '#8d887f');                       // kerbs
    g.save(); g.fillStyle = noisePattern(g, '#2e2f33', 'rgba(0,0,0,0.25)', 'rgba(255,255,255,0.06)', 500, 32);
    g.strokeStyle = g.fillStyle;
    for (const r of L.roads) { g.lineWidth = r.w; polyPath(g, r.pts, false); g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }
    g.restore();
    if (!markings) return;
    g.strokeStyle = 'rgba(238,238,232,0.85)'; g.lineWidth = Math.max(0.14, 1.2 / ppm); g.lineCap = 'butt';
    g.setLineDash([3, 6]);
    for (const r of L.roads) if (r.w >= 7) { polyPath(g, r.pts, false); g.stroke(); }
    g.setLineDash([]);
    for (const r of L.roads) if (r.main) {   // edge lines
      for (const sd of [1, -1]) {
        const pts = r.pts.map((p, i) => { const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * sd * (r.w / 2 - 0.45), p[1] + dx / l * sd * (r.w / 2 - 0.45)]; });
        polyPath(g, pts, false); g.stroke();
      }
    }
  }

  // ================================================================ carpet: lots, yards, streets of the neighbourhood (low-res decal)
  function buildCarpet() {
    const RC = L.R_HOUSE + 90, ppm = LOW ? 0.8 : 1.05;
    const x0 = SITE_CENTER[0] - RC, z0 = SITE_CENTER[1] - RC, W = 2 * RC;
    const n = Math.round(W * ppm);
    const tex = canvasTex(n, n, g => {
      g.setTransform(ppm, 0, 0, ppm, -x0 * ppm, -z0 * ppm);
      // park lawns around the lake and the green strip
      g.fillStyle = '#56692f'; g.strokeStyle = '#56692f'; g.lineJoin = 'round';
      g.lineWidth = 120; polyPath(g, SHORE); g.stroke();
      polyPath(g, Z_GREEN); g.fill();
      // industrial / equestrian yards (concrete, sand)
      g.fillStyle = '#9d988d'; polyPath(g, Z_IND); g.fill();
      g.fillStyle = '#6a7446'; polyPath(g, Z_MID); g.fill();
      g.fillStyle = '#c2ad86'; g.beginPath(); const eq = mp([742, 1322]); g.arc(eq[0], eq[1], 12, 0, TAU); g.fill();
      const sand = mpl([[600, 1265], [830, 1256], [835, 1300], [610, 1330]]); g.fillStyle = '#b9a47f'; polyPath(g, sand); g.fill();
      for (const h of HALLS) { g.fillStyle = '#7d7a73'; polyPath(g, offsetPolyXZ(h.poly, 6)); g.fill(); }
      paintLots(g, false);
      paintRoads(g, false, ppm);
      // cut the lake and the site-plan rect (both have their own surfaces)
      g.globalCompositeOperation = 'destination-out';
      polyPath(g, SHORE); g.fill();
      g.fillRect(SITE.x0 + 0.5, SITE.z0 + 0.5, SITE.x1 - SITE.x0 - 1, SITE.z1 - SITE.z0 - 1);
      g.globalCompositeOperation = 'source-over';
    }, { aniso: 8 });
    disposables.push(tex);
    const geo = new THREE.PlaneGeometry(W, W); geo.rotateX(-Math.PI / 2); geo.translate(SITE_CENTER[0], -0.06, SITE_CENTER[1]);
    const mat = stdMat({ map: tex, roughness: 0.95, alphaTest: 0.5, envBase: 0.3 });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvSW = (modelMatrix * vec4(position,1.)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW;\n' + GLSL_NOISE)
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= .84 + .3 * vr_noise(vSW * 1.7) * vr_noise(vSW * .23 + 3.);');
    };
    mat.customProgramCacheKey = () => 'vr-carpet';
    registerMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = shadows; mesh.name = 'carpet';
    group.add(mesh);
  }

  // ================================================================ site plan (the plot, its landscaping, the adjacent streets)
  function buildSitePlan() {
    const W = SITE.x1 - SITE.x0, H = SITE.z1 - SITE.z0;
    const ppm = LOW ? 4 : 6.5;
    const cw = Math.round(W * ppm), ch = Math.round(H * ppm);
    const bays = [];
    const tex = canvasTex(cw, ch, g => {
      g.setTransform(ppm, 0, 0, ppm, -SITE.x0 * ppm, -SITE.z0 * ppm);
      const R = (x0, x1, z0, z1, c) => { g.fillStyle = c; g.fillRect(x0, z0, x1 - x0, z1 - z0); };
      // neighbourhood yards + grass base
      g.fillStyle = noisePattern(g, '#4e5c35', 'rgba(20,35,10,0.22)', 'rgba(170,180,100,0.08)', 900, 48); g.fillRect(SITE.x0, SITE.z0, W, H);
      paintLots(g, true);
      // the plot: lawn base (as on the developer render), warm limestone paving around the buildings, plazas and drives
      g.save(); polyPath(g, SITE_PLOT); g.clip();
      g.fillStyle = noisePattern(g, '#4f6a2b', 'rgba(20,40,5,0.16)', 'rgba(170,190,90,0.08)', 600, 40); g.fillRect(SITE.x0, SITE.z0, W, H);
      const paved = new Path2D();
      const pRect = (x0, x1, z0, z1) => paved.rect(x0, z0, x1 - x0, z1 - z0);
      for (const p of BLD_POLYS) { const q = offsetPolyXZ(p, 5); q.forEach(([x, z], i) => i ? paved.lineTo(x, z) : paved.moveTo(x, z)); paved.closePath(); }
      for (const b of CONTEXT_BLOCKS) pRect(b.x0 - 5, b.x1 + 5, b.z0 - 5, b.z1 + 5);
      pRect(-13, 98, -58.8, -8.5); pRect(-13, 115, 8.5, 37.8); pRect(4, 98, 54.8, 115); pRect(-13, 115, -101, -75.8); pRect(-13, 98, -168, -118);
      g.fillStyle = '#c9bfae'; g.fill(paved);
      g.save(); g.clip(paved);
      g.strokeStyle = 'rgba(80,70,55,0.12)'; g.lineWidth = 0.05;
      for (let x = SITE.x0; x < SITE.x1; x += 1.2) { g.beginPath(); g.moveTo(x, SITE.z0); g.lineTo(x, SITE.z1); g.stroke(); }
      for (let z = SITE.z0; z < SITE.z1; z += 0.6) { g.beginPath(); g.moveTo(SITE.x0, z); g.lineTo(SITE.x1, z); g.stroke(); }
      g.restore();
      // courtyard service lane along C4 to the underground car-park ramp (deliveries, residents' cars)
      R(-13, RAMP.x1 + 0.3, -58.6, RAMP.z0, '#3a3b3e');
      g.restore();
      // plot kerb
      g.strokeStyle = '#8e897f'; g.lineWidth = 0.5; polyPath(g, SITE_PLOT); g.stroke();
      // soft contact shadow around the building footprints
      g.save(); g.filter = `blur(${Math.round(1.2 * ppm)}px)`; g.fillStyle = 'rgba(20,16,10,0.5)';
      for (const p of BLD_POLYS) { polyPath(g, p); g.fill(); }
      for (const b of CONTEXT_BLOCKS) g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      g.restore();
      // lawns with mowing stripes
      const lawn = (x0, x1, z0, z1, r) => {
        g.save(); g.beginPath(); g.roundRect(x0, z0, x1 - x0, z1 - z0, r); g.clip();
        R(x0, x1, z0, z1, '#4d6a2c');
        for (let x = x0; x < x1; x += 3) R(x, x + 1.5, z0, z1, 'rgba(120,150,70,0.10)');
        const rr = mulberry32(Math.round(x0 * 7 + z0));
        for (let i = 0; i < (x1 - x0) * (z1 - z0) * 0.8; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(20,40,5,0.10)' : 'rgba(170,190,90,0.07)'; g.fillRect(x0 + rr() * (x1 - x0), z0 + rr() * (z1 - z0), 0.5 + rr(), 0.5 + rr()); }
        g.restore();
        g.strokeStyle = 'rgba(210,205,190,0.9)'; g.lineWidth = 0.18; g.beginPath(); g.roundRect(x0, z0, x1 - x0, z1 - z0, r); g.stroke();
      };
      // C3–C4 courtyard (the mouth towards the street is parking), C3–F1 promenade, C4–F3 garden, F1 and F3 courtyards
      for (const l of LAWNS) lawn(...l);
      // paths
      const path = (pts, w, c = '#dcd3c2') => {
        g.strokeStyle = 'rgba(120,110,95,0.5)'; g.lineWidth = w + 0.35; g.lineCap = 'round'; g.lineJoin = 'round';
        polyPath(g, pts, false); g.stroke(); g.strokeStyle = c; g.lineWidth = w; g.stroke();
      };
      for (const [pts, w] of PATHS) path(pts, w);
      g.strokeStyle = 'rgba(120,110,95,0.5)'; g.lineWidth = 2.75; g.beginPath(); g.ellipse(YARD.x, YARD.z, 16, 12, 0, 0, TAU); g.stroke();
      g.strokeStyle = '#dcd3c2'; g.lineWidth = 2.4; g.stroke();
      // plazas
      const disc = (x, z, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, z, r, 0, TAU); g.fill(); };
      disc(YARD.x, YARD.z, 8.2, '#e3dccd'); disc(YARD.x, YARD.z, 5.2, '#bdb3a0');
      g.strokeStyle = 'rgba(120,105,85,0.35)'; g.lineWidth = 0.06;
      for (let r = 5.8; r < 8.2; r += 0.6) { g.beginPath(); g.arc(YARD.x, YARD.z, r, 0, TAU); g.stroke(); }
      disc(62, -93, 4.5, '#e3dccd'); disc(62, -93, 1.9, '#b9ae99');
      disc(61, -143, 6, '#e3dccd'); disc(61, -143, 2.8, '#9fb6a8');
      disc(51, 85, 7, '#e3dccd'); disc(51, 85, 3.2, '#9fb6a8');
      // kindergarten playground (by C4's kindergarten, at the courtyard mouth)
      { const [px0, px1, pz0, pz1] = PLAY, ox = px0 - 46, oz = pz0 + 50.5;
        g.fillStyle = '#b0563f'; g.beginPath(); g.roundRect(px0, pz0, px1 - px0, pz1 - pz0, 2.5); g.fill();
        disc(50 + ox, -46.5 + oz, 2.2, '#3f8686'); disc(57.5 + ox, -42 + oz, 2.6, '#d8a33c'); disc(58 + ox, -48 + oz, 1.6, '#4f7fb0');
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.1; g.beginPath(); g.roundRect(px0, pz0, px1 - px0, pz1 - pz0, 2.5); g.stroke(); }
      for (let x = 46; x <= 78; x += 8) { R(x - 0.9, x + 0.9, 17.4, 19.2, '#5b4a37'); g.strokeStyle = '#8b8577'; g.lineWidth = 0.1; g.strokeRect(x - 0.9, 17.4, 1.8, 1.8); }
      // open-air car parks: asphalt, bays (perpendicular, 2.5 m × 5 m) → parked cars
      const lot = (x0, x1, z0, z1, rows) => {
        g.fillStyle = noisePattern(g, '#3a3b3f', 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.05)', 300, 32); g.fillRect(x0, z0, x1 - x0, z1 - z0);
        g.strokeStyle = 'rgba(236,236,230,0.85)'; g.lineWidth = 0.12;
        for (const [a, b, yaw] of rows) {
          g.beginPath(); g.moveTo(a, z0 + 0.5); g.lineTo(a, z1 - 0.5); g.stroke();
          for (let z = z0 + 0.5; z < z1 - 0.5; z += 2.5) { g.beginPath(); g.moveTo(a, z); g.lineTo(b, z); g.stroke(); bays.push([(a + b) / 2, z + 1.25, yaw]); }
        }
      };
      for (const [x0, x1, z0, z1, rows] of SITE_LOTS) lot(x0, x1, z0, z1, rows.map(([a, b]) => [a, b, 0]));
      g.fillStyle = '#3a3b3f'; g.fillRect(P_DECK.x1, P_DECK.z0 - 2, -13 - P_DECK.x1, P_DECK.z1 - P_DECK.z0 + 4);   // drive lane between the P deck and the blocks
      g.fillRect(SPIRAL.x - SPIRAL.r - 1.5, SPIRAL.z - SPIRAL.r - 2, P_DECK.x0 - SPIRAL.x + SPIRAL.r + 1.5, 2 * SPIRAL.r + 4);   // round the spiral ramp
      // P deck + spiral footprint, underground car-park ramp
      g.fillStyle = '#6b665d'; g.fillRect(P_DECK.x0, P_DECK.z0, P_DECK.x1 - P_DECK.x0, P_DECK.z1 - P_DECK.z0);
      disc(SPIRAL.x, SPIRAL.z, SPIRAL.r + 0.5, '#6b665d');
      for (const p of BLD_POLYS) { g.fillStyle = '#6b665d'; polyPath(g, p); g.fill(); }
      const rg = g.createLinearGradient(0, RAMP.open, 0, RAMP.z0); rg.addColorStop(0, '#0e0e10'); rg.addColorStop(1, '#3a3a3d');
      g.fillStyle = rg; g.fillRect(RAMP.x0, RAMP.z0, RAMP.x1 - RAMP.x0, RAMP.open - RAMP.z0);
      // drop-off courts of the concierge lobbies (the crisp surfaces are 3D: buildForecourts)
      for (const F of Object.values(FORECOURTS)) {
        g.fillStyle = '#56575c'; g.beginPath(); g.roundRect(F.x0, F.z0, 124 - F.x0, F.z1 - F.z0, [5, 0, 0, 5]); g.fill();
        const I = F.island; g.fillStyle = '#4d6a2c'; g.beginPath(); g.roundRect(I.x0, I.z0, I.x1 - I.x0, I.z1 - I.z0, Math.min(2.6, (I.z1 - I.z0) / 2)); g.fill();
        g.strokeStyle = '#cfc8b8'; g.lineWidth = 0.3; g.stroke();
      }
      // streets on top
      paintRoads(g, true, ppm);
      for (const F of Object.values(FORECOURTS)) {   // driveways across the verge, the splay of the exit
        for (const [lo, hi] of [F.near, F.far]) { g.fillStyle = '#56575c'; g.fillRect(116, lo, F.xEdge((lo + hi) / 2) + 0.15 - 116, hi - lo); }
        g.fillStyle = '#56575c'; polyPath(g, F.flare); g.fill();
      }
      // zebra crossings at the plot entrances
      g.fillStyle = 'rgba(240,240,236,0.9)';
      for (const [rid, t] of [['guliver', 0.35], ['guliver', 0.75], ['grandea', 0.8], ['east', 0.3], ['north', 0.6], ['murelor', 0.62]]) {
        const r = L.roads.find(q => q.id === rid); if (!r) continue;
        const i = Math.min(r.pts.length - 2, Math.floor(t * (r.pts.length - 1))), f = t * (r.pts.length - 1) - i;
        const a = r.pts[i], b = r.pts[i + 1], x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
        for (let s = -r.w / 2 + 0.4; s < r.w / 2 - 0.2; s += 1) {
          const cx = x - uz * s, cz = z + ux * s;
          polyPath(g, [[cx - ux * 2 - uz * 0.25, cz - uz * 2 + ux * 0.25], [cx + ux * 2 - uz * 0.25, cz + uz * 2 + ux * 0.25], [cx + ux * 2 + uz * 0.25, cz + uz * 2 - ux * 0.25], [cx - ux * 2 + uz * 0.25, cz - uz * 2 - ux * 0.25]]); g.fill();
        }
      }
    }, { aniso: 8 });
    disposables.push(tex);
    parkedCars = bays.filter(() => rnd() < 0.78).map(([x, z, yaw]) => [x, z, yaw]);
    const geo = new THREE.BufferGeometry();
    const y = -0.03;   // just below interior floors (y=0) to avoid z-fighting with ground-floor units
    geo.setAttribute('position', new THREE.Float32BufferAttribute([SITE.x0, y, SITE.z0, SITE.x0, y, SITE.z1, SITE.x1, y, SITE.z1, SITE.x1, y, SITE.z0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mat = stdMat({ map: tex, roughness: 0.92, metalness: 0, envBase: 0.35 });
    // Close-up detail: the plan is painted at 4–6.5 px per metre, far too coarse at walking height, so two small tiling
    // textures are laid over it in world space — limestone flags on everything paved, a fine grain on asphalt and lawn.
    // Both are mip-mapped and anisotropic (crisp underfoot, calm in the distance; their mean is 1, so aerial views keep
    // the plan's colours). They replace the earlier procedural noise, which had no mips and sparkled on phones.
    const dU = detailTextures();
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, dU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvSW = (modelMatrix * vec4(position,1.)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW; uniform sampler2D uPave; uniform sampler2D uGrain; uniform vec2 uDetK;\n' + GLSL_NOISE)
        .replace('#include <map_fragment>', `#include <map_fragment>
          float vrL = dot(diffuseColor.rgb, vec3(.3, .59, .11));
          float vrGr = smoothstep(.01, .06, diffuseColor.g - diffuseColor.r);
          diffuseColor.rgb *= .9 + .2 * vr_noise(vSW * .7 + 3.);
          float vrPv = smoothstep(.1, .2, vrL) * (1. - smoothstep(.72, .8, vrL)) * (1. - vrGr);
          diffuseColor.rgb *= mix(vec3(1.), texture2D(uPave, vSW / 2.4).rgb * uDetK.x, vrPv);
          diffuseColor.rgb *= mix(vec3(1.), texture2D(uGrain, vSW / 1.3).rgb * uDetK.y, (1. - vrPv) * mix(.55, 1., vrGr));
          diffuseColor.g *= mix(1., .92 + .16 * vr_noise(vSW * 2.3 + 9.), vrGr);`);
    };
    mat.customProgramCacheKey = () => 'vr-site3';
    registerMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = shadows; mesh.name = 'site-plan';
    return mesh;
  }

  // ================================================================ tiling detail textures (opaque fills only)
  // mean of a canvas in linear light → the gain that makes the texture average to 1
  function meanGain(tex) {
    const c = tex.image, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let m = 0;
    for (let i = 0; i < d.length; i += 16) m += Math.pow(d[i + 1] / 255, 2.2);
    return 1 / Math.max(0.05, m / (d.length / 16));
  }
  function detailTextures() {
    if (detU) return detU;
    // limestone flags 0.6 × 0.3 m, stretcher bond, 2.4 m per tile
    paveTex = canvasTex(512, 512, (g, w, h) => {
      const rr = mulberry32(31), cw = w / 4, chh = h / 8;
      g.fillStyle = '#8f897e'; g.fillRect(0, 0, w, h);                                   // joints
      for (let j = 0; j < 8; j++) for (let i = -1; i < 4; i++) {
        const x = i * cw + (j % 2 ? cw / 2 : 0), y = j * chh, l = 196 + Math.floor(rr() * 26), t = Math.floor(rr() * 7) - 3;
        g.fillStyle = `rgb(${l + 3 + t},${l},${l - 5 - t})`; g.fillRect(x + 1.5, y + 1.5, cw - 3, chh - 3);
        for (const xx of [x, x + w]) if (xx < w) for (let k = 0; k < 22; k++) { g.fillStyle = k % 2 ? 'rgb(232,228,220)' : 'rgb(176,170,160)'; g.fillRect(xx + 3 + rr() * (cw - 7), y + 3 + rr() * (chh - 7), 1.5, 1.5); }
        if (x < 0) { g.fillStyle = `rgb(${l + 3 + t},${l},${l - 5 - t})`; g.fillRect(x + w + 1.5, y + 1.5, cw - 3, chh - 3); }
      }
    }, { repeat: true, aniso: 8 });
    // fine mineral grain for asphalt and turf, 1.3 m per tile
    const grain = canvasTex(256, 256, (g, w, h) => {
      const rr = mulberry32(57); g.fillStyle = 'rgb(190,190,190)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const v = 130 + Math.floor(rr() * 110); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rr() * w, rr() * h, 1 + rr() * 2, 1 + rr() * 2); }
    }, { repeat: true, aniso: 8 });
    disposables.push(paveTex, grain);
    detU = { uPave: { value: paveTex }, uGrain: { value: grain }, uDetK: { value: new THREE.Vector2(meanGain(paveTex), meanGain(grain)) } };
    return detU;
  }

  // ================================================================ concierge drop-off courts (C3, C4) and the quay stop
  // Real geometry where the limousine waits and where people stand at walking height: granite-sett lanes round a planted
  // island with a raised kerb, a dark stone runner from the lobby doors to the kerb, bronze planters with clipped box,
  // flush kerbs. Lamps, lit bollards, trees and shrubs for these places are listed in COURT (buildSiteObjects draws them).
  function buildForecourts() {
    detailTextures();
    const sett = canvasTex(512, 512, (g, w, h) => {   // granite setts 0.1 m, running bond, 1.6 m per tile
      const rr = mulberry32(83), n = 16, c = w / n;
      g.fillStyle = '#26272a'; g.fillRect(0, 0, w, h);
      for (let j = 0; j < n; j++) for (let i = -1; i < n; i++) {
        const x = i * c + (j % 2 ? c / 2 : 0), l = 74 + Math.floor(rr() * 34), b = Math.floor(rr() * 6);
        for (const xx of [x, x + w]) if (xx < w && xx > -c) { g.fillStyle = `rgb(${l},${l + 1},${l + 3 + b})`; g.fillRect(xx + 1.5, j * c + 1.5, c - 3, c - 3); g.fillStyle = `rgb(${l + 16},${l + 17},${l + 19})`; g.fillRect(xx + 3, j * c + 3, c - 12, 2); }
      }
    }, { repeat: true, aniso: 8 });
    disposables.push(sett);
    const settMat = registerMaterial(stdMat({ map: sett, roughness: 0.78, metalness: 0, envBase: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }));
    const stoneMat = registerMaterial(stdMat({ map: paveTex, vertexColors: true, roughness: 0.8, metalness: 0, envBase: 0.4, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -10 }));
    const lanes = [], stones = [], solids = [];
    const col = (g, hex, k = 1) => { const c = C(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r * k, c.g * k, c.b * k], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const flat = (pts, y, uvS, holes = []) => { const sh = shapeFromXZ(pts); for (const h of holes) sh.holes.push(pathFromXZ(h)); const g = flatShapeGeo(sh, y, uvS); return g.index ? g.toNonIndexed() : g; };
    const box = (x0, x1, y0, y1, z0, z1, hex, k = 1) => { const g = new THREE.BoxGeometry(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0)).toNonIndexed(); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.deleteAttribute('uv'); solids.push(col(g, hex, k)); };
    const rrect = (x0, x1, z0, z1, r, n = 6) => { const o = []; for (const [cx, cz, a0] of [[x1 - r, z0 + r, -Math.PI / 2], [x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI]]) for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; };
    for (const F of Object.values(FORECOURTS)) {
      const I = F.island, ri = Math.min(2.6, (I.z1 - I.z0) / 2), r = 5;
      // lanes: one sett surface from the turning head at the west end to the carriageway edge, the island cut out
      const out = [];
      for (let i = 0; i <= 6; i++) { const a = Math.PI + i / 6 * Math.PI / 2; out.push([F.x0 + r + Math.cos(a) * r, F.z0 + r + Math.sin(a) * r]); }
      out.push([F.xEdge(F.z0) + 0.2, F.z0], [F.xEdge(F.z1) + 0.2, F.z1]);
      for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 + i / 6 * Math.PI / 2; out.push([F.x0 + r + Math.cos(a) * r, F.z1 - r + Math.sin(a) * r]); }
      lanes.push(flat(out, 0.004, 1.6, [rrect(I.x0, I.x1, I.z0, I.z1, ri)]));
      lanes.push(flat(F.flare, 0.004, 1.6));
      // island: raised granite kerb, planted bed
      { const sh = shapeFromXZ(rrect(I.x0, I.x1, I.z0, I.z1, ri)); sh.holes.push(pathFromXZ(rrect(I.x0 + 0.24, I.x1 - 0.24, I.z0 + 0.24, I.z1 - 0.24, ri - 0.24)));
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.15, bevelEnabled: false, curveSegments: 6 }); g.rotateX(-Math.PI / 2); g.deleteAttribute('uv'); solids.push(col(g.index ? g.toNonIndexed() : g, '#cfc8ba'));
        const bed = flat(rrect(I.x0 + 0.24, I.x1 - 0.24, I.z0 + 0.24, I.z1 - 0.24, ri - 0.24), 0.11, 1); bed.deleteAttribute('uv'); solids.push(col(bed, '#33471f')); }
      // entrance side: flush kerb, a dark stone runner from the doors to the kerb, planters either side of the doors
      const [dx, dz] = F.door, s = F.s, zk = F.kerb, zq = (a, b) => [Math.min(a, b), Math.max(a, b)];
      { const [a, b] = zq(zk - s * 0.32, zk); stones.push(col(flat([[F.x0 + r, a], [F.xEdge(zk) + 0.2, a], [F.xEdge(zk) + 0.2, b], [F.x0 + r, b]], 0.008, 2.4), '#f4efe6')); }
      { const [a, b] = zq(dz + s * 0.02, zk - s * 0.32); stones.push(col(flat([[dx - 1.7, a], [dx + 1.7, a], [dx + 1.7, b], [dx - 1.7, b]], 0.006, 2.4), '#6f675c'));
        for (const sx of [-1, 1]) stones.push(col(flat([[dx + sx * 1.7, a], [dx + sx * 1.82, a], [dx + sx * 1.82, b], [dx + sx * 1.7, b]], 0.007, 2.4), '#c9a45c', 0.8)); }
    }
    // bronze planters with clipped box either side of every lobby entrance
    for (const En of ENTRANCES) {
      const [dx, dz] = En.door, s = En.s;
      for (const sx of [-1, 1]) {
        const px = dx + sx * 2.95, pz = dz + s * 0.85;
        const pot = new THREE.CylinderGeometry(0.46, 0.36, 0.78, 20).toNonIndexed(); pot.translate(px, 0.39, pz); pot.deleteAttribute('uv'); solids.push(col(pot, '#3a2f25'));
        const rim = new THREE.TorusGeometry(0.46, 0.035, 8, 24).toNonIndexed(); rim.rotateX(Math.PI / 2); rim.translate(px, 0.78, pz); rim.deleteAttribute('uv'); solids.push(col(rim, '#8a6a3c'));
        const ball = new THREE.IcosahedronGeometry(0.52, 2); ball.translate(px, 1.2, pz); ball.deleteAttribute('uv'); solids.push(col(ball.index ? ball.toNonIndexed() : ball, '#2f4a22'));
      }
    }
    // quay stop on the lake road: a sett lay-by, a flush kerb and a paved landing reaching the promenade
    { const q = QUAY.at;
      lanes.push(flat([q(-17.6, -13), q(-15.7, -8), q(-15.7, 13), q(-17.6, 18)], 0.012, 1.6));
      stones.push(col(flat([q(-15.7, -8), q(-15.4, -8), q(-15.4, 13), q(-15.7, 13)], 0.02, 2.4), '#f4efe6'));
      stones.push(col(flat([q(-15.4, -7), q(-11.6, -7), q(-11.6, 11), q(-15.4, 11)], 0.035, 2.4), '#e9e2d4'));
      // the promenade ribbon (lake.js) begins with a painted lawn edge: the landing carries on over it to the pavers
      stones.push(col(flat([q(-12.3, -7), q(-10.5, -7), q(-10.5, 11), q(-12.3, 11)], 0.092, 2.4), '#e9e2d4')); }
    const add = (list, mat, name) => { if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list), mat); m.name = name; m.receiveShadow = shadows; group.add(m); list.forEach(g => g.dispose()); };
    add(lanes.map(g => { g.deleteAttribute('color'); return g; }), settMat, 'forecourt-lanes');
    add(stones, stoneMat, 'forecourt-stone');
    add(solids.map(g => { g.deleteAttribute('uv'); if (!g.attributes.normal) g.computeVertexNormals(); return g; }), registerMaterial(stdMat({ color: '#ffffff', vertexColors: true, roughness: 0.72, envBase: 0.4 })), 'forecourt-solids');
  }

  // ================================================================ 3D road strips outside the site plan (crisp markings up close)
  function buildRoadStrips() {
    const roadTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2c2d30'; g.fillRect(0, 0, w, h);
      const rr = mulberry32(3);
      for (let i = 0; i < 5000; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)'; g.fillRect(rr() * w, rr() * h, 1.5, 1.5); }
      g.fillStyle = 'rgba(235,235,230,0.8)';
      g.fillRect(0, h * 0.5 - 2, w * 0.33, 4);
    }, { srgb: true, repeat: true });
    disposables.push(roadTex);
    const RMAX = LOW ? 420 : 720;
    const pos = [], uv = [], idx = [];
    const inSite = (x, z) => x > SITE.x0 && x < SITE.x1 && z > SITE.z0 && z < SITE.z1;
    for (const r of L.roads) for (let i = 0; i < r.pts.length - 1; i++) {
      let a = r.pts[i], b = r.pts[i + 1];
      const segs = clipOutRect(a, b);
      for (const [p, q] of segs) {
        const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz); if (len < 0.5) continue;
        if (Math.hypot((p[0] + q[0]) / 2 - SITE_CENTER[0], (p[1] + q[1]) / 2 - SITE_CENTER[1]) > RMAX) continue;
        const nx = -dz / len * r.w / 2, nz = dx / len * r.w / 2, k = pos.length / 3;
        pos.push(p[0] + nx, 0, p[1] + nz, p[0] - nx, 0, p[1] - nz, q[0] - nx, 0, q[1] - nz, q[0] + nx, 0, q[1] + nz);
        const u0 = 0, u1 = len / 9;
        uv.push(u0, 0, u0, 1, u1, 1, u1, 0);
        idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
      }
    }
    void inSite;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    const m = registerMaterial(stdMat({ map: roadTex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6, envBase: 0.3 }));
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = shadows; mesh.name = 'road-strips'; group.add(mesh);
  }
  function clipOutRect(a, b) {   // parts of segment a→b outside the SITE rect
    const ts = [0, 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    for (const [p, d, v] of [[a[0], dx, SITE.x0], [a[0], dx, SITE.x1], [a[1], dz, SITE.z0], [a[1], dz, SITE.z1]]) if (Math.abs(d) > 1e-9) { const t = (v - p) / d; if (t > 0 && t < 1) ts.push(t); }
    ts.sort((p, q) => p - q);
    const out = [];
    for (let i = 0; i < ts.length - 1; i++) {
      const tm = (ts[i] + ts[i + 1]) / 2, x = a[0] + dx * tm, z = a[1] + dz * tm;
      if (x > SITE.x0 && x < SITE.x1 && z > SITE.z0 && z < SITE.z1) continue;
      out.push([[a[0] + dx * ts[i], a[1] + dz * ts[i]], [a[0] + dx * ts[i + 1], a[1] + dz * ts[i + 1]]]);
    }
    return out;
  }

  // ================================================================ Lacul Morii
  function buildLake() {
    const waterU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), SKYU, {
      uTime: SHARED.uTime, uDeep: { value: C('#0a1426') }, uShore: { value: C('#101010') }, uNight: SHARED.uNight, uScale: { value: 1 },
    });
    const waterMat = new THREE.ShaderMaterial({ uniforms: waterU, fog: true, vertexShader: WATER_VS, fragmentShader: WATER_FS });
    const WY = -0.45;
    // water surface extends a little under the quay so no gap shows
    const wet = offsetShore(1.5);
    const lakeGeo = new THREE.ShapeGeometry(shapeFromXZ(wet), 1); lakeGeo.rotateX(-Math.PI / 2); lakeGeo.translate(0, WY, 0);
    const lake = new THREE.Mesh(lakeGeo, waterMat); lake.name = 'lacul-morii'; tgt.add(lake);

    // stone quay wall (shore line) + promenade band (pavers with the red running track, as on the north shore)
    const PW = 12;
    const outer = offsetShore(PW), N = SHORE.length;
    const qp = [], qi = [], pp = [], pu = [], pi = [];
    let arc = 0;
    for (let i = 0; i <= N; i++) {
      const k = i % N, [x, z] = SHORE[k], [xo, zo] = outer[k];
      if (i > 0) { const [px, pz] = SHORE[(i - 1) % N]; arc += Math.hypot(x - px, z - pz); }
      qp.push(x, WY - 0.6, z, x, 0.05, z);
      pp.push(x, 0.05, z, xo, 0.05, zo);
      pu.push(arc / 6, 0, arc / 6, 1);
      if (i < N) { const j = i * 2; qi.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); pi.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const qg = new THREE.BufferGeometry(); qg.setAttribute('position', new THREE.Float32BufferAttribute(qp, 3)); qg.setIndex(qi); qg.computeVertexNormals();
    const stone = registerMaterial(stdMat({ color: '#b9ae9a', roughness: 0.8, side: THREE.DoubleSide }));
    const quay = new THREE.Mesh(qg, stone); tgt.add(quay);
    const paveTex = canvasTex(256, 256, (g, w, h) => {
      // u along the shore (6 m per tile), v across 0 (water) → 1 (land, 12 m)
      g.fillStyle = '#b8b0a2'; g.fillRect(0, 0, w, h);
      const rr = mulberry32(11);
      for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -21 : 0; x < w; x += 42) { g.fillStyle = `hsl(35,${8 + rr() * 6}%,${64 + rr() * 8}%)`; g.fillRect(x + 1, y + 1, 40, 14); }
      g.fillStyle = '#d9d3c6'; g.fillRect(0, h * 0.9, w, h * 0.1);        // quay coping stone on the water side (v→0 is canvas bottom)
      g.fillStyle = '#a24a3c'; g.fillRect(0, h * 0.47, w, h * 0.16);      // running track
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, h * 0.545, w, 2);
      g.fillStyle = '#4f6a2e'; g.fillRect(0, 0, w, h * 0.12);             // lawn edge on the land side
    }, { repeat: true });
    disposables.push(paveTex);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2)); pg.setIndex(pi); pg.computeVertexNormals();
    const prom = new THREE.Mesh(pg, registerMaterial(stdMat({ map: paveTex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 })));
    prom.name = 'promenade'; prom.receiveShadow = shadows; tgt.add(prom);

    // island park
    const [ix, iz] = LAKE.island.center, ir = LAKE.island.r;
    const iPts = [];
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * TAU; const r = ir * (1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a + 2.2) + 0.03 * Math.sin(9 * a));
      iPts.push([ix + Math.cos(a) * r * 1.25, iz + Math.sin(a) * r * 0.8]);
    }
    const IY = 0.35;
    const iTex = canvasTex(1024, 1024, g => {
      const s = 1024 / (ir * 2.9); g.setTransform(s, 0, 0, s, -(ix - ir * 1.45) * s, -(iz - ir * 1.45) * s);
      g.fillStyle = '#4c6a2b'; g.fillRect(ix - ir * 2, iz - ir * 2, ir * 4, ir * 4);
      const rr = mulberry32(5);
      for (let i = 0; i < 9000; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(20,40,5,0.12)' : 'rgba(170,190,90,0.08)'; g.fillRect(ix - ir * 1.5 + rr() * ir * 3, iz - ir * 1.5 + rr() * ir * 3, 0.8, 0.8); }
      polyPath(g, iPts);
      g.strokeStyle = '#d7cdb9'; g.lineWidth = 7; g.stroke();
      g.strokeStyle = '#d7cdb9'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(ix, iz, ir * 0.72, ir * 0.45, 0.2, 0, TAU); g.stroke();
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.4; g.beginPath(); g.moveTo(ix, iz); g.lineTo(ix + Math.cos(a) * ir * 1.2, iz + Math.sin(a) * ir * 0.78); g.stroke(); }
      g.fillStyle = '#e1d8c6'; g.beginPath(); g.arc(ix, iz, 11, 0, TAU); g.fill();
      const beds = ['#b3485a', '#d49a3a', '#7c5aa6', '#c86a3e'];
      for (let k = 0; k < 14; k++) { const a = rr() * TAU, d = ir * (0.25 + rr() * 0.6); g.fillStyle = beds[k % 4]; g.globalAlpha = 0.75; g.beginPath(); g.ellipse(ix + Math.cos(a) * d * 1.2, iz + Math.sin(a) * d * 0.75, 3 + rr() * 4, 1.5 + rr() * 2, rr() * 3, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    });
    disposables.push(iTex);
    const iGeo = new THREE.ShapeGeometry(shapeFromXZ(iPts), 4); iGeo.rotateX(-Math.PI / 2); iGeo.translate(0, IY, 0);
    { const p = iGeo.attributes.position, uv = iGeo.attributes.uv, S = ir * 2.9;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - (ix - ir * 1.45)) / S, 1 - (p.getZ(i) - (iz - ir * 1.45)) / S); }
    const island = new THREE.Mesh(iGeo, registerMaterial(stdMat({ map: iTex, roughness: 0.95, envBase: 0.3 })));
    island.name = 'island'; tgt.add(island);
    const ep = [], ei = [];
    iPts.forEach(([x, z], i) => { ep.push(x, WY - 0.4, z, x, IY, z); const k = i * 2, n = ((i + 1) % iPts.length) * 2; ei.push(k, n, k + 1, k + 1, n, n + 1); });
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); eg.setIndex(ei); eg.computeVertexNormals();
    tgt.add(new THREE.Mesh(eg, stone));
    // narrow planted islets (as seen in the lake), placed relative to the island
    const isletMat = registerMaterial(stdMat({ color: '#50682e', roughness: 1 }));
    const islets = [];
    for (const [dx, dz, rx, rz, rot] of [[260, -90, 38, 3.5, 0.3], [-180, 90, 55, 4, -0.2], [320, 130, 30, 3, 0.9], [-260, -60, 45, 3.5, 0.1]]) {
      const x = ix + dx, z = iz + dz; if (!inLake(x, z) || inLake(x, z) && distPoly(SHORE, x, z) < 60) continue;
      islets.push(flatShapeGeo(shapeFromXZ(ellipsePts(x, z, rx, rz, 24, rot)), 0.1));
    }
    if (islets.length) tgt.add(new THREE.Mesh(mergeGeometries(islets), isletMat));
    // footbridge from the island to the nearest shore point
    let best = null;
    for (const [x, z] of SHORE) { const d = Math.hypot(x - ix, z - iz); if (!best || d < best.d) best = { x, z, d }; }
    const bdx = best.x - ix, bdz = best.z - iz, bl = Math.hypot(bdx, bdz);
    const bStart = [ix + bdx / bl * ir * 0.8, iz + bdz / bl * ir * 0.8];
    const bLen = Math.hypot(best.x - bStart[0], best.z - bStart[1]) + 6;
    const bridgeGeo = new THREE.BoxGeometry(bLen, 0.6, 5); bridgeGeo.translate(bLen / 2, 0.9, 0);
    const bridge = new THREE.Mesh(bridgeGeo, stone); bridge.position.set(bStart[0], 0, bStart[1]); bridge.rotation.y = Math.atan2(-bdz, bdx); tgt.add(bridge);

    // fountain jet (camera-facing quads: jet core, falling veil, base mist)
    const H = 72;
    const quad = (wb, wt, h, kind) => { const g = new THREE.PlaneGeometry(1, 1, 1, 12); g.translate(0, 0.5, 0); const n = g.attributes.position.count; const a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a.set([wb, wt, h, kind], i * 4); g.setAttribute('aP', new THREE.BufferAttribute(a, 4)); g.deleteAttribute('normal'); return g; };
    const fGeo = mergeGeometries([quad(4.2, 2.2, H, 0), quad(24, 6, H * 0.93, 1), quad(52, 34, 18, 2)]);
    const fU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uTime: SHARED.uTime, uFCol: { value: new THREE.Vector3(1, 1, 1) }, uFA: { value: 1 } });
    const fMat = new THREE.ShaderMaterial({
      uniforms: fU, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute vec4 aP; varying vec2 vUv; varying float vK;
        #include <fog_pars_vertex>
        void main(){
          vec3 base = (modelMatrix * vec4(0., 0., 0., 1.)).xyz; vec3 toC = cameraPosition - base; vec2 d = normalize(toC.xz + vec2(1e-4));
          vec3 right = vec3(-d.y, 0., d.x); float w = mix(aP.x, aP.y, position.y);
          vec3 wp = base + right * position.x * w + vec3(0., position.y * aP.z, 0.) + vec3(d.x, 0., d.y) * aP.w * .4;
          vUv = vec2(position.x * 2., position.y); vK = aP.w;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: GLSL_NOISE + /* glsl */`
        uniform float uTime; uniform vec3 uFCol; uniform float uFA; varying vec2 vUv; varying float vK;
        #include <fog_pars_fragment>
        void main(){
          float x = vUv.x, y = vUv.y, a;
          if (vK < .5) {
            float n = vr_noise(vec2(x * 5., y * 55. - uTime * 11.));
            a = exp(-x * x * 5.) * (.5 + .5 * n) * smoothstep(1., .8, y) * smoothstep(0., .03, y) * .95;
          } else if (vK < 1.5) {
            float n = vr_noise(vec2(x * 7., y * 16. + uTime * 4.)) * vr_noise(vec2(x * 13., y * 30. + uTime * 6.));
            a = exp(-x * x * 3.) * (smoothstep(.35, .92, y) * smoothstep(1., .9, y) * .8 + .12) * (.25 + 1.3 * n) * .45;
          } else {
            float n = vr_fbm(vec2(x * 2.5 + uTime * .15, y * 2. - uTime * .1));
            a = exp(-x * x * 2.2) * exp(-y * 2.6) * (.3 + .7 * n) * .5;
          }
          gl_FragColor = vec4(uFCol, clamp(a * uFA, 0., 1.));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const fountain = new THREE.Mesh(fGeo, fMat); fountain.position.set(LAKE.fountain[0], WY, LAKE.fountain[1]);
    fountain.frustumCulled = false; fountain.renderOrder = 5; fountain.name = 'fountain'; tgt.add(fountain);

    // reflection streaks of shore lights on the water (dusk/night) + promenade lamps every ~30 m
    const streaks = [];
    const addStreak = (x, z, r, g, b, w, L) => streaks.push([x, z, r, g, b, w, L]);
    const inner = offsetShore(-9), lampLine = offsetShore(PW - 1.2);
    let acc = 0;
    for (let i = 0; i < N; i++) {
      const [x, z] = SHORE[i], [x2, z2] = SHORE[(i + 1) % N]; acc += Math.hypot(x2 - x, z2 - z);
      if (acc < 30) continue; acc = 0;
      lakeLamps.push(lampLine[i]);
      addStreak(inner[i][0], inner[i][1], 1, 0.66, 0.34, 1.3, 16);
    }
    addStreak(LAKE.fountain[0], LAKE.fountain[1] + 4, 0.8, 0.85, 1, 5, 60);
    iPts.forEach(([x, z], i) => { if (i % 6 === 0) addStreak(ix + (x - ix) * 1.1, iz + (z - iz) * 1.1, 1, 0.7, 0.4, 1.2, 12); });
    const sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); sg.setIndex([0, 1, 2, 0, 2, 3]);
    const sd = new Float32Array(streaks.length * 7); streaks.forEach((s, i) => sd.set(s, i * 7));
    const ib = new THREE.InstancedInterleavedBuffer(sd, 7);
    sg.setAttribute('iPos', new THREE.InterleavedBufferAttribute(ib, 2, 0)); sg.setAttribute('iCol', new THREE.InterleavedBufferAttribute(ib, 3, 2)); sg.setAttribute('iSize', new THREE.InterleavedBufferAttribute(ib, 2, 5));
    sg.instanceCount = streaks.length;
    const stMat = new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uTime: SHARED.uTime, uNight: SHARED.uNight }),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      vertexShader: /* glsl */`
        attribute vec2 iPos; attribute vec3 iCol; attribute vec2 iSize; varying vec2 vUv; varying vec3 vCol; varying float vSeed;
        #include <fog_pars_vertex>
        void main(){
          vec2 toC = cameraPosition.xz - iPos; float dist = length(toC); vec2 d = toC / max(dist, 1.); vec2 pp = vec2(-d.y, d.x);
          float L = iSize.y * clamp(dist / max(cameraPosition.y, 2.) * .08, .5, 3.);
          vec2 p = iPos + pp * position.x * iSize.x * (1. + dist * .002) + d * position.y * L;
          vUv = position.xy; vCol = iCol; vSeed = iPos.x * .13 + iPos.y * .07;
          vec4 mvPosition = viewMatrix * vec4(p.x, ${(WY + 0.02).toFixed(2)}, p.y, 1.); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uNight; varying vec2 vUv; varying vec3 vCol; varying float vSeed;
        #include <fog_pars_fragment>
        void main(){
          float sh = .55 + .45 * sin(vUv.y * 23. + uTime * 3. + vSeed) * sin(vUv.y * 9. - uTime * 1.7);
          float a = (1. - vUv.y * vUv.y) * pow(1. - abs(vUv.x), 2.) * sh * uNight * .9;
          gl_FragColor = vec4(vCol * a, 1.);
          #include <fog_fragment>
        }`,
    });
    const streakMesh = new THREE.Mesh(sg, stMat); streakMesh.frustumCulled = false; streakMesh.renderOrder = 3; tgt.add(streakMesh);
    nightOnly.push(streakMesh);
    return {
      setMode(P) {
        waterU.uDeep.value.set(P.deep); waterU.uShore.value.set(P.shore);
        fU.uFCol.value.set(...P.fcol); fU.uFA.value = P.fAlpha;
      },
    };
  }

  // ================================================================ landscaping objects on and around the plot
  function inst(geo, mat, list, fn, cast = false) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); const o = new THREE.Object3D();
    list.forEach((p, i) => { fn(o, p, i); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.count = list.length; m.castShadow = cast; m.computeBoundingSphere(); tgt.add(m); return m;
  }
  function buildSiteObjects() {
    // ---- trees on the plot (courtyards, promenade, gardens) + street trees along the streets around it
    const site = [];
    const addSite = (x, z, s = 1) => { if (!nearBuilding(x, z, 3.2) && inPoly(SITE_PLOT, x, z)) site.push([x, z, s]); };
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + 0.26; addSite(YARD.x + Math.cos(a) * 21, YARD.z + Math.sin(a) * 16, 1.05); }
    for (const [x, z] of [[20, -17], [26, -30], [93, -17], [93, -25], [36, -50]]) addSite(x, z, 1.15);
    for (const [x, z] of [[34, -89], [46, -89], [78, -89], [34, -97], [46, -97], [78, -97], [30, -93]]) addSite(x, z, 1.1);
    for (const [x, z] of [[-10, 17], [30, 17], [42, 17], [12, 36.5]]) addSite(x, z, 1);
    for (let x = 46; x <= 78; x += 8) addSite(x, 18.3, 0.85);
    for (let z = 42; z <= 128; z += 11) addSite(-15.5, z, 1.05);
    for (const [x, z] of [[24, 64], [80, 64], [24, 106], [80, 106], [34, 75], [68, 96], [30, 96], [72, 74]]) addSite(x, z, 1.1);
    for (let x = 16; x <= 94; x += 10) { addSite(x, -121.6, 0.95); addSite(x, -164.4, 0.95); }   // Faza III courtyard edges
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + 0.3; addSite(61 + Math.cos(a) * 15, -143 + Math.sin(a) * 12, 1.05); }
    for (let z = -190; z <= 120; z += 10) addSite(-39.5, z, 0.95);
    for (let z = -100; z <= 12; z += 10) if (!inApron(119, z)) addSite(119, z, 0.9);
    site.push(...COURT.trees);
    treeSets.push({ pts: site.concat(L.sTrees.filter(([x, z]) => Math.hypot(x - SITE_CENTER[0], z - SITE_CENTER[1]) < 260 && !inApron(x, z))), leafy: true, h: [6, 9], r: [1.7, 2.7], trunk: [2.3, 3.1], cast: shadows, uplight: true, hue: 'site' });
    // young trees scattered over the lawns (off the paths), shrubs and flowering beds along the lawn edges
    const young = [], shrubs = [];
    const rr = mulberry32(77);
    for (const [x0, x1, z0, z1] of LAWNS) {
      for (let x = x0 + 2.5; x < x1 - 2; x += 5.5) for (let z = z0 + 2.5; z < z1 - 2; z += 5.5) {
        const px = x + (rr() - 0.5) * 3.5, pz = z + (rr() - 0.5) * 3.5;
        if (rr() < 0.42 && !nearPath(px, pz, 2.2) && !nearBuilding(px, pz, 3) && !site.some(([sx, sz]) => Math.hypot(sx - px, sz - pz) < 4)) young.push([px, pz, 0.55 + rr() * 0.3]);
      }
      const per = [];
      for (let x = x0 + 1; x < x1 - 1; x += 1.6) per.push([x, z0 + 0.9], [x, z1 - 0.9]);
      for (let z = z0 + 1; z < z1 - 1; z += 1.6) per.push([x0 + 0.9, z], [x1 - 0.9, z]);
      for (const [px, pz] of per) if (rr() < 0.55 && !nearPath(px, pz, 0.8) && !nearBuilding(px, pz, 1.2)) shrubs.push([px + (rr() - 0.5) * 0.6, pz + (rr() - 0.5) * 0.6, 0.45 + rr() * 0.6, rr()]);
    }
    for (const [pts, w] of PATHS) for (let i = 0; i < pts.length - 1; i++) {   // low planting along the footpaths
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l;
      for (let t = 1.5; t < l - 1; t += 1.3) for (const sd of [1, -1]) if (rr() < 0.5) {
        const px = ax + (bx - ax) * t / l + nx * sd * (w / 2 + 0.7), pz = az + (bz - az) * t / l + nz * sd * (w / 2 + 0.7);
        if (!nearBuilding(px, pz, 1) && !PLAZAS.some(([cx, cz, r]) => Math.hypot(px - cx, pz - cz) < r) && !onApron(px, pz)) shrubs.push([px, pz, 0.35 + rr() * 0.35, rr()]);
      }
    }
    shrubs.push(...COURT.shrubs);
    treeSets.push({ pts: young, leafy: true, h: [5.5, 8], r: [1.7, 2.5], trunk: [2.2, 2.8], cast: shadows, uplight: true, hue: 'young' });
    {
      const ico = new THREE.SphereGeometry(1, 9, 5); ico.deleteAttribute('uv'); ico.deleteAttribute('normal');   // a clipped dome (72 triangles), not a 20-sided die
      const sg = mergeVertices(ico); sg.computeVertexNormals(); sg.scale(1, 0.62, 1); sg.translate(0, 0.35, 0);
      const sm = registerMaterial(stdMat({ color: '#ffffff', roughness: 0.9, envBase: 0.25 }));
      const cols = ['#3f5a26', '#4a6a2c', '#35502a', '#5b6e30', '#3c5530', '#7a5a8e', '#c9c3d6', '#b25a6a', '#d8d2b0', '#4d6b35'];
      const c = new THREE.Color();
      const im = inst(sg, sm, shrubs, (o, [x, z, s, k]) => { o.position.set(x, 0, z); o.scale.set(s, s * (0.8 + k * 0.5), s); o.rotation.set(0, k * 9, 0); });
      shrubs.forEach(([, , , k], i) => im.setColorAt(i, c.set(cols[Math.floor(k * (k < 0.8 ? 6 : 10)) % cols.length])));
      im.name = 'shrubs';
    }

    // ---- lamps: street (9 m), courtyard posts (4.2 m), bollards (0.9 m)
    const street = L.lamps.filter(([x, z]) => !inApron(x, z)), posts = [...COURT.posts], bollards = [...COURT.bollards];
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.39; posts.push([YARD.x + Math.cos(a) * 17.6, YARD.z + Math.sin(a) * 13.4]); }
    for (const [x, z] of [[-2, 13], [27, 13], [67, 13], [YARD.x + 16, YARD.z], [YARD.x, -52.5], [12, -30], [-2, -80.5], [27, -80.5], [67, -80.5],
      [30, -93], [22, 60], [80, 60], [22, 108], [80, 108], [51, 64], [30, -143], [90, -143], [118, -60], [118, -10], [-17, -60], [-17, -8], [-17, 10], [-19, 60], [-19, 90]]) if (!nearBuilding(x, z, 1)) posts.push([x, z]);
    for (let x = -10; x <= 96; x += 6) if (Math.abs(x - 6.5) > 4 && Math.abs(x - 47) > 4) bollards.push([x, 13.6]);
    for (let x = -10; x <= 96; x += 6) if (Math.abs(x - 6.5) > 4 && Math.abs(x - 47) > 4) bollards.push([x, -80.4]);
    for (let x = 12; x <= 84; x += 6) bollards.push([x, -53.4]);
    for (let x = 34; x <= 82; x += 6) { if (Math.abs(x - 62) > 7) bollards.push([x, -94.8]); }
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; bollards.push([YARD.x + Math.cos(a) * 14.3, YARD.z + Math.sin(a) * 10.4]); }
    for (let z = 62; z <= 108; z += 8) { bollards.push([7.5, z]); bollards.push([94.5, z]); }
    const metal = registerMaterial(stdMat({ color: '#2b2b2d', roughness: 0.45, metalness: 0.7 }));
    const sPole = new THREE.CylinderGeometry(0.07, 0.11, 9, 8); sPole.translate(0, 4.5, 0);
    const sArm = new THREE.BoxGeometry(0.08, 0.08, 1.6); sArm.translate(0, 8.95, 0.75);
    const sHead = new THREE.BoxGeometry(0.34, 0.1, 0.8); sHead.translate(0, 8.9, 1.45);
    inst(mergeGeometries([sPole, sArm]), metal, street, (o, [x, z, yaw]) => { o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); }, shadows);
    inst(sHead, lampHeadMat, street, (o, [x, z, yaw]) => { o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); });
    for (const [x, z, yaw] of street) addPool(x + Math.sin(yaw) * 1.4, z + Math.cos(yaw) * 1.4, 12);
    const pPole = new THREE.CylinderGeometry(0.05, 0.06, 3.9, 8); pPole.translate(0, 1.95, 0);
    const pHead = new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12); pHead.translate(0, 4.1, 0);
    inst(pPole, metal, posts, (o, [x, z]) => o.position.set(x, 0, z));
    inst(pHead, lampHeadMat, posts, (o, [x, z]) => o.position.set(x, 0, z));
    for (const [x, z] of posts) addPool(x, z, 5.5);
    const lp = lakeLamps.filter(([x, z]) => Math.hypot(x - SITE_CENTER[0], z - SITE_CENTER[1]) < 1300);
    if (lp.length) within(lakeG, () => {
      inst(pPole, metal, lp, (o, [x, z]) => o.position.set(x, 0, z));
      inst(pHead, lampHeadMat, lp, (o, [x, z]) => o.position.set(x, 0, z));
      for (const [x, z] of lp) addPool(x, z, 5.5);
    });
    const bPole = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 10); bPole.translate(0, 0.4, 0);
    const bHead = new THREE.CylinderGeometry(0.085, 0.085, 0.12, 10); bHead.translate(0, 0.86, 0);
    inst(mergeGeometries([bPole, bHead]), lampHeadMat, bollards, (o, [x, z]) => o.position.set(x, 0, z));
    for (const [x, z] of bollards) addPool(x, z, 2.2);

    // ---- benches
    const benches = [];
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; benches.push([YARD.x + Math.cos(a) * 6.6, YARD.z + Math.sin(a) * 6.6, -a + Math.PI / 2]); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.78; benches.push([62 + Math.cos(a) * 3.6, -93 + Math.sin(a) * 3.6, -a + Math.PI / 2]); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; benches.push([51 + Math.cos(a) * 5.2, 85 + Math.sin(a) * 5.2, -a + Math.PI / 2]); }
    for (let x = 50; x <= 82; x += 8) benches.push([x, 17.9, 0]);
    const seat = new THREE.BoxGeometry(1.9, 0.08, 0.5); seat.translate(0, 0.45, 0);
    const back = new THREE.BoxGeometry(1.9, 0.45, 0.06); back.translate(0, 0.72, -0.24);
    const wood = registerMaterial(stdMat({ color: '#8a5a36', roughness: 0.6 }));
    inst(mergeGeometries([seat, back]), wood, benches, (o, [x, z, yaw]) => { o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); });

    // ---- hedges
    const hedges = [[14, 82, -12.2], [34, 82, -52.6], [28, 84, -87.2], [44, 84, 18.9]];
    const hBoxes = [];
    for (const [a, b, c] of hedges) for (let s = a + 1; s < b - 1; s += 4) { if ([YARD.x, 62, 47, 6.5, 22].some(v => Math.abs(s + 2 - v) < 2.5)) continue; hBoxes.push([s + 2, c]); }
    const hg = new THREE.BoxGeometry(4, 0.9, 0.8); hg.translate(0, 0.45, 0);
    inst(hg, registerMaterial(stdMat({ color: '#3d5a28', roughness: 0.95, envBase: 0.2 })), hBoxes, (o, [x, z]) => o.position.set(x, 0, z));

    // ---- kindergarten playground, courtyard reflecting pool, car-park ramp (one merged vertex-coloured mesh)
    const play = [];
    const colB = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y + h / 2, z); const n = g.attributes.position.count; const cc = new Float32Array(n * 3); const cl = C(c); for (let i = 0; i < n; i++) cc.set([cl.r, cl.g, cl.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.deleteAttribute('uv'); play.push(g); };
    { const ox = PLAY[0] - 46, oz = PLAY[2] + 50.5, cb = (w, h, d, x, y, z, c) => colB(w, h, d, x + ox, y, z + oz, c);
      cb(3, 0.15, 2, 50, 1.4, -46.5, '#e8e2d4'); cb(0.12, 1.4, 0.12, 48.6, 0, -47.4, '#d8a33c'); cb(0.12, 1.4, 0.12, 51.4, 0, -47.4, '#d8a33c');
      cb(0.12, 1.4, 0.12, 48.6, 0, -45.6, '#d8a33c'); cb(0.12, 1.4, 0.12, 51.4, 0, -45.6, '#d8a33c'); cb(1.8, 1.4, 0.1, 50, 1.55, -45.5, '#3f8686');
      cb(0.9, 0.08, 3.2, 52.5, 0.7, -46.5, '#c85a3a'); cb(0.1, 2.2, 0.1, 57.5, 0, -42, '#4f7fb0'); cb(3.2, 0.1, 0.1, 57.5, 2.2, -42, '#4f7fb0');
      cb(1.2, 0.5, 1.2, 58, 0, -48, '#d8a33c'); cb(2.2, 0.35, 1, 55, 0, -39.5, '#e8e2d4'); }
    colB(4.6, 1.1, 0.25, (RAMP.x0 + RAMP.x1) / 2, 0, RAMP.open + 0.2, '#d8d2c6');   // portal parapet (the ramp top at z0 is open to the courtyard lane)
    colB(5.2, 0.18, 7, (RAMP.x0 + RAMP.x1) / 2, 3.0, -45.5, '#d8d2c6');
    for (const z of [-42.5, -48.5]) for (const x of [84.4, 89]) colB(0.14, 3.1, 0.14, x, 0, z, '#d8d2c6');
    const rimG = new THREE.CylinderGeometry(4.75, 4.85, 0.45, 48, 1, true).toNonIndexed(); rimG.translate(YARD.x, 0.22, YARD.z);
    const rimTop = new THREE.RingGeometry(4.3, 4.8, 48).toNonIndexed(); rimTop.rotateX(-Math.PI / 2); rimTop.translate(YARD.x, 0.45, YARD.z);
    for (const g of [rimG, rimTop]) { g.deleteAttribute('uv'); const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.85), 3)); play.push(g); }
    group.add(new THREE.Mesh(mergeGeometries(play), registerMaterial(stdMat({ color: '#ffffff', vertexColors: true, roughness: 0.6 }))));
    addPool((RAMP.x0 + RAMP.x1) / 2, -46, 4);
    const poolG = flatShapeGeo(shapeFromXZ(ellipsePts(YARD.x, YARD.z, 4.3, 4.3, 48)), 0.28);
    const pu = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), SKYU, { uTime: SHARED.uTime, uDeep: { value: C('#0b1e24') }, uShore: { value: C('#0b0b0b') }, uNight: SHARED.uNight, uScale: { value: 3 } });
    pendingPool = { geo: poolG, uniforms: pu };
  }

  // ================================================================ project context: Faza I (beige), Faza III (dark), P deck + spiral ramp
  function buildContext() {
    const tones = {
      beige: { body: '#cdb996', glass: '#343a42', slab: '#ece3d2', rail: '#b9ccd2', fin: 0, accent: '#8a5a3e', accentAmt: 0.3 },
      dark: { body: '#5a524b', glass: '#262a30', slab: '#d9d0c1', rail: '#9fb1b8', fin: 0, accent: '#d6ccbb', accentAmt: 0.22 },
    };
    const byTone = { beige: { geos: [], slabs: [] }, dark: { geos: [], slabs: [] } };
    const rails = [], caps = [], roofCaps = [];
    const bx = (arr, x0, x1, y0, y1, z0, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.deleteAttribute('uv'); arr.push(g); };
    const seeded = (g, s) => { g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(s), 1)); return g; };
    for (const b of CONTEXT_BLOCKS) {
      if (b.parking) continue;
      const T = byTone[b.tone === 'dark' ? 'dark' : 'beige'];
      const h = LEVELS.groundH + (b.floors - 1) * LEVELS.typicalH;
      const g = new THREE.BoxGeometry(b.x1 - b.x0, h, b.z1 - b.z0); g.translate((b.x0 + b.x1) / 2, h / 2, (b.z0 + b.z1) / 2); g.deleteAttribute('uv');
      T.geos.push(seeded(g, Math.round(Math.abs(b.x0) + b.z0 * 3 + 500)));
      const t = new THREE.BoxGeometry(Math.min(12, b.x1 - b.x0 - 4), 3.2, Math.min(9, b.z1 - b.z0 - 4)); t.translate((b.x0 + b.x1) / 2, h + 1.6, (b.z0 + b.z1) / 2); t.deleteAttribute('uv');
      T.geos.push(seeded(t, 0));
      // balcony slabs + glass rails every floor on the long faces, returns on the short ones
      const o = 1.45;
      const longX = (b.x1 - b.x0) > (b.z1 - b.z0);
      for (let f = 1; f < b.floors; f++) {
        const y = LEVELS.groundH + (f - 1) * LEVELS.typicalH;
        if (longX) {
          bx(T.slabs, b.x0 - o, b.x1 + o, y - 0.22, y, b.z0 - o, b.z0); bx(T.slabs, b.x0 - o, b.x1 + o, y - 0.22, y, b.z1, b.z1 + o);
          bx(rails, b.x0 - o + 0.1, b.x1 + o - 0.1, y, y + 1.0, b.z0 - o + 0.08, b.z0 - o + 0.1); bx(rails, b.x0 - o + 0.1, b.x1 + o - 0.1, y, y + 1.0, b.z1 + o - 0.1, b.z1 + o - 0.08);
          bx(caps, b.x0 - o + 0.05, b.x1 + o - 0.05, y + 1.0, y + 1.05, b.z0 - o + 0.05, b.z0 - o + 0.13); bx(caps, b.x0 - o + 0.05, b.x1 + o - 0.05, y + 1.0, y + 1.05, b.z1 + o - 0.13, b.z1 + o - 0.05);
        } else {
          bx(T.slabs, b.x0 - o, b.x0, y - 0.22, y, b.z0 - o, b.z1 + o); bx(T.slabs, b.x1, b.x1 + o, y - 0.22, y, b.z0 - o, b.z1 + o);
          bx(rails, b.x0 - o + 0.08, b.x0 - o + 0.1, y, y + 1.0, b.z0 - o + 0.1, b.z1 + o - 0.1); bx(rails, b.x1 + o - 0.1, b.x1 + o - 0.08, y, y + 1.0, b.z0 - o + 0.1, b.z1 + o - 0.1);
          bx(caps, b.x0 - o + 0.05, b.x0 - o + 0.13, y + 1.0, y + 1.05, b.z0 - o + 0.05, b.z1 + o - 0.05); bx(caps, b.x1 + o - 0.13, b.x1 + o - 0.05, y + 1.0, y + 1.05, b.z0 - o + 0.05, b.z1 + o - 0.05);
        }
      }
      // privacy fins between balconies every ~7 m
      const top = h - 0.2;
      if (longX) for (let x = b.x0 + 7; x < b.x1 - 3; x += 7.2) { bx(T.slabs, x - 0.12, x + 0.12, LEVELS.groundH - 0.2, top, b.z0 - o, b.z0); bx(T.slabs, x - 0.12, x + 0.12, LEVELS.groundH - 0.2, top, b.z1, b.z1 + o); }
      else for (let z = b.z0 + 7; z < b.z1 - 3; z += 7.2) { bx(T.slabs, b.x0 - o, b.x0, LEVELS.groundH - 0.2, top, z - 0.12, z + 0.12); bx(T.slabs, b.x1, b.x1 + o, LEVELS.groundH - 0.2, top, z - 0.12, z + 0.12); }
      bx(roofCaps, b.x0 - 0.3, b.x1 + 0.3, h - 0.05, h + 0.9, b.z0 - 0.3, b.z1 + 0.3);
    }
    for (const [k, T] of Object.entries(byTone)) {
      if (!T.geos.length) continue;
      const P = tones[k];
      const m = registerMaterial(windowMaterial({ color: P.body, colW: 3.6, floorH: 3.0, winW: 1.7, winH: 2.25, base: 0.3, slab: 0.25, fin: P.fin, glass: P.glass, roof: '#6a6966', slabCol: P.slab, boost: 0.75, accent: P.accent, accentAmt: P.accentAmt }));
      const mesh = new THREE.Mesh(mergeGeometries(T.geos), m); mesh.castShadow = shadows; mesh.receiveShadow = shadows; mesh.name = 'context-' + k; tgt.add(mesh);
      const sm = new THREE.Mesh(mergeGeometries(T.slabs), registerMaterial(stdMat({ color: P.slab, roughness: 0.75 })));
      sm.castShadow = shadows; sm.receiveShadow = shadows; tgt.add(sm);
    }
    const rm = new THREE.Mesh(mergeGeometries(rails), registerMaterial(stdMat({ color: '#b9ccd2', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, depthWrite: false, envBase: 1 })));
    rm.renderOrder = 4; tgt.add(rm);
    tgt.add(new THREE.Mesh(mergeGeometries(caps), registerMaterial(stdMat({ color: '#3a342d', roughness: 0.4, metalness: 0.6 }))));
    const rc = new THREE.Mesh(mergeGeometries(roofCaps), registerMaterial(stdMat({ color: '#77756f', roughness: 0.95, envBase: 0.3 }))); rc.receiveShadow = shadows; tgt.add(rc);

    // P deck: two parking levels, open facades, cars on the roof; round spiral car ramp in front of it
    const p = P_DECK, PH = 6.6;
    const deck = [];
    const g = new THREE.BoxGeometry(p.x1 - p.x0, PH, p.z1 - p.z0); g.translate((p.x0 + p.x1) / 2, PH / 2, (p.z0 + p.z1) / 2); g.deleteAttribute('uv'); deck.push(seeded(g, 7));
    // spiral: stacked parapet rings around a drum
    const S = SPIRAL, ringPts = 40;
    for (let k = 0; k < 3; k++) {
      const y0 = 0.2 + k * 3.3;
      const ring = new THREE.CylinderGeometry(S.r, S.r, 1.15, ringPts, 1, true); ring.translate(S.x, y0 + 0.95, S.z); ring.deleteAttribute('uv'); deck.push(seeded(ring, 0));
    }
    const drum = new THREE.CylinderGeometry(S.r - 0.6, S.r - 0.6, S.h, ringPts); drum.translate(S.x, S.h / 2, S.z); drum.deleteAttribute('uv'); deck.push(seeded(drum, 3));
    const core = new THREE.CylinderGeometry(3.2, 3.2, S.h + 1.2, 20); core.translate(S.x, (S.h + 1.2) / 2, S.z); core.deleteAttribute('uv'); deck.push(seeded(core, 0));
    const pm = registerMaterial(windowMaterial({ color: '#b9b4ab', colW: 7.5, floorH: 3.3, winW: 6.6, winH: 1.35, base: 0.2, glass: '#18191b', roof: '#5b5a57', boost: 0.35 }));
    const pk = new THREE.Mesh(mergeGeometries(deck), pm); pk.castShadow = shadows; pk.receiveShadow = shadows; pk.name = 'p-deck'; tgt.add(pk);
    for (let x = p.x0 + 3; x < p.x1 - 2.5; x += 6.5) for (let z = p.z0 + 2; z < p.z1 - 1.5; z += 2.6) if (rnd() < 0.62 && Math.abs(x - (p.x0 + p.x1) / 2) > 2.5) parkedCars.push([x, z, Math.PI / 2 + (rnd() < 0.5 ? 0 : Math.PI), PH]);
    addPool(S.x, S.z, 12);
  }

  // ================================================================ neighbourhood: houses, fences, garden trees, halls, mid-rise blocks
  function buildNeighbourhood() {
    const { houses } = L;
    const o = new THREE.Object3D(), c = new THREE.Color();
    if (houses.length) {
      const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
      const hm = registerMaterial(windowMaterial({ color: '#c6c2bb', colW: 3.4, floorH: 2.85, winW: 1.25, winH: 1.35, base: 0.45, glass: '#343c46', roof: '#4d4a47', boost: 0.75, litK: 0.85 }));
      const body = new THREE.InstancedMesh(box, hm, houses.length);
      const seeds = new Float32Array(houses.length);
      // gable: eaves at y=0 (z = ±0.5), ridge at y=1 along x; hip: ridge x ∈ ±0.22
      const gable = new THREE.BufferGeometry();
      gable.setAttribute('position', new THREE.Float32BufferAttribute([
        -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
        0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
        -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
      ], 3)); gable.computeVertexNormals();
      const r = 0.22;
      const hip = new THREE.BufferGeometry();
      hip.setAttribute('position', new THREE.Float32BufferAttribute([
        -0.5, 0, 0.5, 0.5, 0, 0.5, r, 1, 0, -0.5, 0, 0.5, r, 1, 0, -r, 1, 0,
        0.5, 0, -0.5, -0.5, 0, -0.5, -r, 1, 0, 0.5, 0, -0.5, -r, 1, 0, r, 1, 0,
        -0.5, 0, -0.5, -0.5, 0, 0.5, -r, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, r, 1, 0,
      ], 3)); hip.computeVertexNormals();
      const rMat = registerMaterial(stdMat({ color: '#ffffff', roughness: 0.78 }));
      rMat.onBeforeCompile = sh => {   // roof tiles: horizontal courses + noise, darker towards the eaves
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRp = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRp;\n' + GLSL_NOISE)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float crs = smoothstep(.0, .25, fract(vRp.y * 9.)) * .12 + .88;
            diffuseColor.rgb *= crs * (.9 + .2 * vr_noise(vRp.xz * 13. + vRp.y * 5.)) * (.85 + .15 * vRp.y);`);
      };
      rMat.customProgramCacheKey = () => 'vr-roof';
      const gl = houses.filter(h => h.roof === 'gable'), hp = houses.filter(h => h.roof === 'hip');
      const extraRoofs = MIDRISE.filter(m => m.roof);
      const gm = new THREE.InstancedMesh(gable, rMat, gl.length), hm2 = new THREE.InstancedMesh(hip, rMat, hp.length + extraRoofs.length);
      houses.forEach((h, i) => {
        o.position.set(h.x, 0, h.z); o.rotation.set(0, h.yaw, 0); o.scale.set(h.w, h.h, h.d); o.updateMatrix(); body.setMatrixAt(i, o.matrix);
        body.setColorAt(i, c.set(h.wall)); seeds[i] = Math.floor(rnd() * 997);
      });
      const putRoof = (mesh, list, off = 0) => list.forEach((h, i) => {
        const w = h.turn ? h.d : h.w, d = h.turn ? h.w : h.d;
        o.position.set(h.x, h.h, h.z); o.rotation.set(0, h.yaw + (h.turn ? Math.PI / 2 : 0), 0);
        o.scale.set(w + 0.8, Math.min(w, d) * (h.pitch || 0.36), d + 0.8); o.updateMatrix(); mesh.setMatrixAt(i + off, o.matrix); mesh.setColorAt(i + off, c.set(h.roofC));
      });
      putRoof(gm, gl); putRoof(hm2, hp);
      putRoof(hm2, extraRoofs.map(m => ({ x: m.w[0], z: m.w[1], yaw: midYaw(m), w: m.L, d: m.W, h: m.fl * 2.85 + 1.2, roofC: m.roof, pitch: 0.28 })), hp.length);
      box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      for (const m of [body, gm, hm2]) { m.computeBoundingSphere(); m.castShadow = shadows && m !== body ? false : false; m.receiveShadow = false; group.add(m); }
      body.name = 'houses';
      // fences along the lot fronts
      const F = L.fences;
      if (F.length) {
        const fg = new THREE.BoxGeometry(1, 1, 0.12); fg.translate(0, 0.5, 0);
        const fm = new THREE.InstancedMesh(fg, registerMaterial(stdMat({ color: '#ffffff', roughness: 0.7, envBase: 0.3 })), F.length);
        const fc = ['#e8e4dc', '#9a9790', '#5b4f44', '#3b4a3c', '#c9c2b5', '#2e2f31'];
        F.forEach((f, i) => { o.position.set(f.x, 0, f.z); o.rotation.set(0, Math.atan2(-f.uz, f.ux), 0); o.scale.set(f.L, f.h, 1); o.updateMatrix(); fm.setMatrixAt(i, o.matrix); fm.setColorAt(i, c.set(fc[Math.floor(f.c * fc.length)])); });
        fm.computeBoundingSphere(); group.add(fm);
      }
    }
    // mid-rise blocks east of the site + a few estates of collective housing beyond the house belt (clusters, as on
    // the developer's render — not a uniform scatter)
    const blocks = MIDRISE.map(m => ({ x: m.w[0], z: m.w[1], w: m.L, d: m.W, h: m.fl * 2.85 + 1.2, rot: midYaw(m) }));
    {
      const [cx, cz] = SITE_CENTER;
      for (let e = 0; e < (LOW ? 7 : 14); e++) {
        const a = rnd() * TAU, rr = L.R_FAR + 80 + rnd() * 1300;
        const ex = cx + Math.cos(a) * rr, ez = cz + Math.sin(a) * rr;
        if (inLake(ex, ez, 150)) continue;
        const n = 3 + Math.floor(rnd() * 5), fl = rnd() < 0.4 ? 10 : 4 + Math.floor(rnd() * 5), rot = (rnd() - 0.5) * 0.3;
        for (let i = 0; i < n; i++) {
          const vertical = rnd() < 0.4, len = 28 + rnd() * 40;
          const x = ex + (i % 3) * 55 + (rnd() - 0.5) * 12, z = ez + Math.floor(i / 3) * 48 + (rnd() - 0.5) * 12;
          blocks.push({ x, z, w: vertical ? 13 : len, d: vertical ? len : 13, h: (fl + Math.floor(rnd() * 2)) * 2.8 + 1, rot });
        }
      }
    }
    if (blocks.length) {
      const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
      const bm = registerMaterial(windowMaterial({ color: '#dedbd5', colW: 3.0, floorH: 2.8, winW: 1.5, winH: 1.45, base: 0.6, slab: 0.5, glass: '#46525e', roof: '#4d4c4f', slabCol: '#e8e2d8', boost: 0.8, litK: 0.8 }));
      const mesh = new THREE.InstancedMesh(box, bm, blocks.length);
      const seeds = new Float32Array(blocks.length);
      const tones = ['#e4ddd0', '#d8cfc0', '#ece6db', '#cfc8bd', '#e0d2bd', '#d9d9d6', '#e8d8c4'];
      blocks.forEach((b, i) => { o.position.set(b.x, 0, b.z); o.rotation.set(0, b.rot, 0); o.scale.set(b.w, b.h, b.d); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, c.set(tones[i % tones.length])); seeds[i] = Math.floor(rnd() * 997); });
      box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      mesh.computeBoundingSphere(); mesh.name = 'blocks'; mesh.castShadow = shadows; group.add(mesh);
    }
    // industrial halls, brewery, equestrian hall, the solar-roofed building (extruded outlines, one mesh + roof tint)
    {
      const walls = [], roofs = [];
      for (const h of HALLS) {
        const shape = shapeFromXZ(h.poly);
        const g = new THREE.ExtrudeGeometry(shape, { depth: h.h, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
        g.deleteAttribute('uv'); g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(11), 1));
        walls.push(g.index ? g.toNonIndexed() : g);
        const rg = new THREE.ShapeGeometry(shape); rg.rotateX(-Math.PI / 2); rg.translate(0, h.h + 0.06, 0); rg.deleteAttribute('uv');
        const n = rg.attributes.position.count, cl = C(h.roof), col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.set([cl.r, cl.g, cl.b], i * 3);
        rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        roofs.push(rg.index ? rg.toNonIndexed() : rg);
      }
      const wm = registerMaterial(windowMaterial({ color: '#c9c6bf', colW: 7, floorH: 4.5, winW: 4.5, winH: 1.1, base: 1.2, glass: '#555c63', roof: '#9ea4a8', boost: 0.4 }));
      group.add(new THREE.Mesh(mergeGeometries(walls.map(g => { g.deleteAttribute('normal'); g.computeVertexNormals(); return g; })), wm));
      // roofs: corrugated look via stripes along the long side
      const rm = registerMaterial(stdMat({ color: '#ffffff', vertexColors: true, roughness: 0.5, metalness: 0.35 }));
      rm.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHw;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvHw = (modelMatrix * vec4(position,1.)).xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vHw;')
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= .9 + .1 * step(.5, fract(dot(vHw, vec2(.34, .94)) * .08)) + .06 * sin(dot(vHw, vec2(.94, -.34)) * 3.);');
      };
      rm.customProgramCacheKey = () => 'vr-hallroof';
      group.add(new THREE.Mesh(mergeGeometries(roofs), rm));
    }
    buildFarHouses();
    // garden + woodland trees: 3-lobe crowns near the site, single-lobe (20 triangles) further out, 8-triangle blobs in
    // the far belt. Counts are capped (random subsample) to keep the whole scene under ~1M triangles.
    const gClose = [], gNear = [], gMid = [], RN = LOW ? 220 : 320, RC = LOW ? 0 : 190;
    const streetFar = L.sTrees.filter(([x, z]) => Math.hypot(x - SITE_CENTER[0], z - SITE_CENTER[1]) >= 260);
    for (const p of L.gTrees.concat(L.wTrees, streetFar)) { const d = Math.hypot(p[0] - SITE_CENTER[0], p[1] - SITE_CENTER[1]); (d < RC ? gClose : d < RN ? gNear : gMid).push(p); }
    // the gardens right around the plot are seen from the street: leaf-card crowns there
    treeSets.push({ pts: gClose, leafy: true, h: [6, 11], r: [2.6, 4.2], trunk: [1.8, 2.6], cast: false, hue: 'garden' });
    const cap = (a, n) => { if (a.length <= n) return a; const k = n / a.length; return a.filter(() => rnd() < k); };
    treeSets.push({ pts: cap(gNear, LOW ? 1400 : 3200), detail: 0, lobes: 3, h: [6, 11.5], r: [2.8, 4.6], trunk: [1.7, 2.5], cast: false, hue: 'garden' });
    treeSets.push({ pts: cap(gMid, LOW ? 3500 : 7500), detail: 0, lobes: 1, noTrunk: true, h: [6, 11.5], r: [2.9, 4.6], trunk: [1.6, 2.4], cast: false, hue: 'garden' });
    treeSets.push({ pts: cap(L.farTrees, LOW ? 2500 : 8000), blob: true, h: [5, 9], r: [2.4, 3.8], trunk: [1.6, 2.2], cast: false, hue: 'garden' });
  }

  // Far belt (R_HOUSE … R_FAR): one instanced mesh, box + hip roof in a single geometry (aRoof marks the roof), wall and
  // roof colours per instance; at night a share of the houses glow warm (their windows, averaged at this distance).
  function buildFarHouses() {
    const F = L.farHouses; if (!F.length) return;
    const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); box.translate(0, 0.5, 0);
    { const p = box.attributes.position, keep = []; for (let i = 0; i < p.count; i += 3) { if (!(p.getY(i) < 0.01 && p.getY(i + 1) < 0.01 && p.getY(i + 2) < 0.01)) keep.push(i); }
      const pos = new Float32Array(keep.length * 9), nor = new Float32Array(keep.length * 9);
      keep.forEach((i, k) => { for (let j = 0; j < 3; j++) { pos.set([p.getX(i + j), p.getY(i + j), p.getZ(i + j)], (k * 3 + j) * 3); nor.set([box.attributes.normal.getX(i + j), box.attributes.normal.getY(i + j), box.attributes.normal.getZ(i + j)], (k * 3 + j) * 3); } });
      box.setAttribute('position', new THREE.BufferAttribute(pos, 3)); box.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); box.deleteAttribute('uv'); }
    const r = 0.2, H = 0.42, y = 1;
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.55, y, 0.55, 0.55, y, 0.55, r, y + H, 0, -0.55, y, 0.55, r, y + H, 0, -r, y + H, 0,
      0.55, y, -0.55, -0.55, y, -0.55, -r, y + H, 0, 0.55, y, -0.55, -r, y + H, 0, r, y + H, 0,
      -0.55, y, -0.55, -0.55, y, 0.55, -r, y + H, 0, 0.55, y, 0.55, 0.55, y, -0.55, r, y + H, 0,
    ], 3)); roof.computeVertexNormals();
    const flag = (g, v) => { g.setAttribute('aRoof', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; };
    const geo = mergeGeometries([flag(box, 0), flag(roof, 1)]);
    const roofC = new Float32Array(F.length * 3), lit = new Float32Array(F.length);
    const m = registerMaterial(stdMat({ color: '#d2cfc9', roughness: 0.85, envBase: 0.4 }));
    m.onBeforeCompile = sh => {
      sh.uniforms.uGlow = SHARED.uGlow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRoof; attribute vec3 aRoofC; attribute float aLit; varying float vLitF;')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, aRoofC * 1.25, aRoof); vLitF = step(.62, aLit) * (1. - aRoof) * (.6 + aLit);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLitF; uniform float uGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1., .6, .28) * vLitF * uGlow * .22;');
    };
    m.customProgramCacheKey = () => 'vr-farhouse';
    const mesh = new THREE.InstancedMesh(geo, m, F.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    F.forEach((h, i) => {
      o.position.set(h.x, 0, h.z); o.rotation.set(0, h.yaw + (h.turn ? Math.PI / 2 : 0), 0);
      o.scale.set(h.turn ? h.d : h.w, h.h, h.turn ? h.w : h.d); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(h.wall)); c.set(h.roofC); roofC.set([c.r, c.g, c.b], i * 3); lit[i] = h.lit;
    });
    geo.setAttribute('aRoofC', new THREE.InstancedBufferAttribute(roofC, 3)); geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 1));
    mesh.computeBoundingSphere(); mesh.name = 'far-houses'; group.add(mesh);
  }
  function midYaw(m) { const [dx, dz] = wDir(m.b); return Math.atan2(-dz, dx); }

  function buildSkyline() {
    // distant ring: collective housing + towers, denser towards the city centre (true bearing ≈ 60–160°, east)
    const towers = [];
    const [cx, cz] = SITE_CENTER;
    const N = LOW ? 300 : 650, R0 = L.R_FAR + 300;
    for (let i = 0; i < N; i++) {
      const east = rnd() < 0.45;
      const b = east ? 60 + rnd() * 100 : rnd() * 360;
      const r = R0 + Math.pow(rnd(), 0.8) * 2400;
      const [dx, dz] = wDir(b), x = cx + dx * r, z = cz + dz * r;
      if (inLake(x, z, 60)) continue;
      const tall = east && r < 3900 && rnd() < 0.16;
      const h = tall ? 45 + rnd() * 80 : 14 + rnd() * 22;
      const w = tall ? 18 + rnd() * 14 : 14 + rnd() * 50, d = tall ? 18 + rnd() * 12 : 12 + rnd() * 6;
      towers.push({ x, z, w, d, h, rot: rnd() < 0.8 ? 0 : 0.5, tall });
    }
    const at = (b, r) => { const [dx, dz] = wDir(b); return [cx + dx * r, cz + dz * r]; };
    for (const [b, r, w, d, h, rot] of [[98, 3300, 30, 30, 137, 0.3], [95, 3050, 26, 40, 96, 0.1], [101, 3500, 28, 28, 110, 0.7], [58, 3900, 34, 34, 125, 0.2]]) {
      const [x, z] = at(b, r); towers.push({ x, z, w, d, h, rot, tall: true, glass: true });
    }
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const m = registerMaterial(windowMaterial({ color: '#ffffff', colW: 3.2, floorH: 3.0, winW: 1.9, winH: 1.7, base: 0, slab: 0.3, glass: '#71849a', roof: '#48474a', slabCol: '#e7e2d9', boost: 1.3 }));
    const mesh = new THREE.InstancedMesh(box, m, towers.length);
    const seeds = new Float32Array(towers.length); const o = new THREE.Object3D(), c = new THREE.Color();
    towers.forEach((t, i) => {
      o.position.set(t.x, 0, t.z); o.rotation.set(0, t.rot, 0); o.scale.set(t.w, t.h, t.d); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(t.glass ? '#6d7f92' : t.tall ? ['#b9c3cc', '#d9d4ca', '#8e9aa6'][i % 3] : ['#ddd6ca', '#d2cabd', '#e6e1d8', '#c9c4bb'][i % 4]));
      seeds[i] = Math.floor(rnd() * 997);
    });
    box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.computeBoundingSphere(); mesh.name = 'skyline'; tgt.add(mesh);
    // TV mast + CHP chimney with aviation lights
    const [mx, mz] = at(75, 4200), [hx, hz] = at(230, 3300);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 4, 220, 6).translate(0, 110, 0), registerMaterial(stdMat({ color: '#a9a39a', roughness: 0.6 })));
    mast.position.set(mx, 0, mz); tgt.add(mast);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 150, 10).translate(0, 75, 0), registerMaterial(stdMat({ color: '#b8a898', roughness: 0.8 })));
    chim.position.set(hx, 0, hz); tgt.add(chim);
    const redMat = new THREE.MeshBasicMaterial({ color: C('#ff2a1a'), fog: false });
    const bpos = [[mx, 222, mz], [mx, 150, mz], [hx, 152, hz]];
    { const [x, z] = at(98, 3300); bpos.push([x, 139, z]); }
    const beacons = [];
    const bg = new THREE.SphereGeometry(2.2, 8, 6);
    for (const [x, y, z] of bpos) { const b = new THREE.Mesh(bg, redMat); b.position.set(x, y, z); tgt.add(b); beacons.push(b); }
    tickers.push(() => { const on = SHARED.uNight.value > 0 && (SHARED.uTime.value % 1.6) < 0.8; for (const b of beacons) b.visible = on; });
  }

  function buildTraffic() {
    const carGeo = carGeometry();
    const carMat = registerMaterial(stdMat({ color: '#ffffff', vertexColors: true, roughness: 0.28, metalness: 0.55, envBase: 1 }));
    const paints = ['#f2f2f2', '#1c1c1e', '#8a8d93', '#2b3a55', '#6d1d1d', '#c9c7c2', '#3c4a3a', '#101216', '#b8b3a8', '#44474d'];
    const c = new THREE.Color(), o = new THREE.Object3D();
    // open-air car parks + P deck belong to the context (dropped with it when context.js takes over); kerbside cars stay
    for (const [list, g] of [[ext.context ? [] : parkedCars, ctxG], [L.kerbCars, group]]) {
      if (!list.length) continue;
      const pm = new THREE.InstancedMesh(carGeo, carMat, list.length);
      list.forEach(([x, z, yaw, y = 0], i) => { o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.set(1, 1, 1); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); pm.setColorAt(i, c.set(paints[(i * 3 + (g === group ? 1 : 0)) % paints.length])); });
      pm.computeBoundingSphere(); pm.castShadow = shadows; g.add(pm);
    }
    // moving traffic on the through roads (polylines)
    const paths = L.roads.filter(r => r.main).map(r => {
      const cum = [0]; for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
      return { r, cum, L: cum[cum.length - 1] };
    });
    const cars = [];
    const nCars = LOW ? 40 : 90;
    for (let i = 0; i < nCars; i++) { const p = paths[i % paths.length]; cars.push({ p, s: rnd() * p.L, dir: rnd() < 0.5 ? 1 : -1, v: 8 + rnd() * 6 }); }
    const mm = new THREE.InstancedMesh(carGeo, carMat, cars.length);
    mm.frustumCulled = false; mm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cars.forEach((_, i) => mm.setColorAt(i, c.set(paints[(i * 7) % paints.length])));
    group.add(mm);
    const lp = new Float32Array(cars.length * 4 * 3), lc = new Float32Array(cars.length * 4 * 3);
    cars.forEach((_, i) => { lc.set([1, 0.92, 0.8, 1, 0.92, 0.8, 1, 0.08, 0.04, 1, 0.08, 0.04], i * 12); });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3).setUsage(THREE.DynamicDrawUsage)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    const glowTex = radialTex(0.12); disposables.push(glowTex);
    const lm = new THREE.PointsMaterial({ size: 1.6, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const lights = new THREE.Points(lg, lm); lights.frustumCulled = false; group.add(lights); nightOnly.push(lights);
    // where car k is now: [x, z, dx, dz] (lane centre, travel direction)
    const at = k => {
      const p = k.p, s = k.dir > 0 ? k.s : p.L - k.s;
      let j = 0; while (j < p.cum.length - 2 && p.cum[j + 1] < s) j++;
      const a = p.r.pts[j], b = p.r.pts[j + 1], seg = p.cum[j + 1] - p.cum[j] || 1, f = (s - p.cum[j]) / seg;
      let dx = (b[0] - a[0]) / seg, dz = (b[1] - a[1]) / seg; if (k.dir < 0) { dx = -dx; dz = -dz; }
      const lane = p.r.w / 4 + 0.2;
      return [a[0] + (b[0] - a[0]) * f - dz * lane, a[1] + (b[1] - a[1]) * f + dx * lane, dx, dz];
    };
    const step = (dt) => {
      const A = trafficAvoid;
      for (let i = 0; i < cars.length; i++) {
        const k = cars[i], { p } = k; k.s = (k.s + k.v * dt) % p.L;
        let [x, z, dx, dz] = at(k);
        // the limousine (limo.js) is not part of this traffic: cars ahead of it in its lane keep pulling away, cars
        // behind hang back; a car already crossing its path clears it briskly, one about to cross waits at the edge
        if (A && dt > 0) {
          const ox = x - A.x, oz = z - A.z, al = ox * A.hx + oz * A.hz, ls = ox * A.hz - oz * A.hx, lat = Math.abs(ls);
          if (lat < 7.5 && al > -17 && al < 30) {
            const same = dx * A.hx + dz * A.hz, vl = dx * A.hz - dz * A.hx;   // along / across the limousine's axis
            let ds = 0;
            if (same > 0.3) { if (lat < 3.1) ds = al > 0 ? Math.max(0, 16 + A.v * 0.9 - al) : -Math.max(0, al + 14); }
            else if (lat < 3.1) ds = al > -6 ? k.v * dt * 1.6 : 0;
            else if (al > -4 && vl * ls < -0.25) ds = -k.v * dt;
            if (ds) { k.s = ((k.s + Math.sign(ds) * Math.min(Math.abs(ds), 40 * dt)) % p.L + p.L) % p.L; [x, z, dx, dz] = at(k); }
          }
        }
        const rx = -dz, rz = dx;
        o.position.set(x, 0, z); o.rotation.set(0, Math.atan2(-dz, dx), 0); o.updateMatrix(); mm.setMatrixAt(i, o.matrix);
        const fx = x + dx * 2.2, fz = z + dz * 2.2, bx = x - dx * 2.2, bz = z - dz * 2.2;
        lp.set([fx + rx * 0.65, 0.7, fz + rz * 0.65, fx - rx * 0.65, 0.7, fz - rz * 0.65, bx + rx * 0.65, 0.8, bz + rz * 0.65, bx - rx * 0.65, 0.8, bz - rz * 0.65], i * 12);
      }
      mm.instanceMatrix.needsUpdate = true; lg.attributes.position.needsUpdate = true;
    };
    step(0);
    tickers.push(dt => { if (dt > 0) step(dt); });
  }

  // Night lights as one point cloud: street lamps (modelled + the continued grid to the horizon), porch / window lights
  // of the houses, district glows far away. Screen-size clamped with energy kept, twinkling with distance (air shimmer),
  // attenuated like the fog; woodland stays dark as on the developer's night render.
  function buildNightLights() {
    const r2 = mulberry32(515), P = [], [SX, SZ] = SITE_CENTER;
    const cols = [[1, 0.62, 0.3], [1, 0.62, 0.3], [1, 0.7, 0.4], [1, 0.82, 0.6], [0.9, 0.93, 1]];
    const add = (x, y, z, size, ci = Math.floor(r2() * cols.length), k = 1) => P.push(x, y, z, size, ...cols[ci].map(v => v * k), r2());
    for (const [x, z, yaw] of L.lamps) { const ci = r2() < 0.7 ? 0 : 3; if (!inApron(x, z)) add(x + Math.sin(yaw) * 1.45, 8.75, z + Math.cos(yaw) * 1.45, 1.1, ci, 1.6); }
    // lamps along the rest of the modelled streets
    for (const r of L.roads) {
      let acc = r2() * 30;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], l = Math.hypot(bx - ax, bz - az); if (l < 0.01) continue;
        const ux = (bx - ax) / l, uz = (bz - az) / l;
        for (let t = 0; t < l; t += 3) {
          acc += 3; if (acc < 31) continue; acc = r2() * 4; if (r2() < 0.35) continue;
          const x = ax + ux * t, z = az + uz * t, dc = Math.hypot(x - SX, z - SZ);
          if (dc < (r.traced ? 470 : 250)) continue;
          const sd = r2() < 0.5 ? 1 : -1; add(x - uz * sd * (r.w / 2 + 0.5), 7.5, z + ux * sd * (r.w / 2 + 0.5), 2.4, r2() < 0.8 ? 0 : 3, 0.6 + r2() * 0.5);
        }
      }
    }
    // porch / window lights
    for (const h of L.houses) if (r2() < 0.45) { const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw); add(h.x + fx * (h.d / 2 + 0.3), 2 + r2() * (h.h - 2.5), h.z + fz * (h.d / 2 + 0.3), 1.1, 2 + Math.floor(r2() * 2), 0.9); }
    for (const h of L.farHouses) if (h.lit > 0.45) add(h.x, 2.5, h.z, 1.6, 1 + Math.floor(r2() * 3), 0.9);
    // beyond the modelled belt: lamps along the continued grid + scattered house lights, to the horizon
    const RF = L.R_FAR, RH = LOW ? 7000 : 8500, step = LOW ? 48 : 34;
    const okFar = (x, z) => { const d = Math.hypot(x - SX, z - SZ); return d > RF && d < RH && !inLake(x, z, 25) && woods(x, z) < 0.62; };
    for (let k = -Math.ceil(RH / GRID.GZ); k <= Math.ceil(RH / GRID.GZ); k++) for (let x = SX - RH; x < SX + RH; x += step * (0.8 + r2() * 0.4)) {
      const z = gridZ(k, x); if (r2() < 0.5 && okFar(x, z)) add(x + (r2() - 0.5) * 12, 7, z + (r2() < 0.5 ? 4 : -4), 2.4, r2() < 0.85 ? 0 : 3, 0.35 + r2() * 0.5);
    }
    for (let j = -Math.ceil(RH / GRID.GX); j <= Math.ceil(RH / GRID.GX); j++) for (let z = SZ - RH; z < SZ + RH; z += step * (0.8 + r2() * 0.4)) {
      const x = gridX(j, z); if (r2() < 0.5 && okFar(x, z)) add(x + (r2() < 0.5 ? 4 : -4), 7, z + (r2() - 0.5) * 12, 2.4, r2() < 0.85 ? 0 : 3, 0.35 + r2() * 0.5);
    }
    for (let i = 0; i < (LOW ? 20000 : 50000); i++) {
      const a = r2() * TAU, rr = RF + Math.pow(r2(), 0.62) * (RH - RF), x = SX + Math.cos(a) * rr, z = SZ + Math.sin(a) * rr;
      if (okFar(x, z)) add(x, 3, z, 2.2, r2() < 0.88 ? Math.floor(r2() * 3) : 3 + Math.floor(r2() * 2), 0.6 + r2() * 0.4);
    }
    const n = P.length / 8, buf = new THREE.InterleavedBuffer(new Float32Array(P), 8);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(buf, 3, 0));
    g.setAttribute('aSize', new THREE.InterleavedBufferAttribute(buf, 1, 3));
    g.setAttribute('aCol', new THREE.InterleavedBufferAttribute(buf, 3, 4));
    g.setAttribute('aSeed', new THREE.InterleavedBufferAttribute(buf, 1, 7));
    const U = { uTime: SHARED.uTime, uI: { value: 1 }, uViewH: { value: 1080 }, uFogD: { value: 0.0003 } };
    nightU = U;
    const m = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSize; attribute vec3 aCol; attribute float aSeed;
        uniform float uTime; uniform float uI; uniform float uViewH; uniform float uFogD;
        varying vec3 vCol;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.); float dist = -mv.z;
          gl_Position = projectionMatrix * mv;
          float px = aSize * projectionMatrix[1][1] * uViewH * .5 / max(dist, 1.);
          float s = clamp(px, 2.2, 22.);
          float e = min(1., px / 2.2);                       // energy kept when clamped to the minimum size
          float tw = mix(1., .6 + .4 * sin(uTime * (1.1 + aSeed * 2.3) + aSeed * 60.), smoothstep(500., 1600., dist));
          float fog = exp(-pow(dist * uFogD * .42, 2.));
          vCol = aCol * uI * (.35 + .65 * e) * tw * fog;
          gl_PointSize = s;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main(){
          vec2 q = gl_PointCoord * 2. - 1.; float r2 = dot(q, q); if (r2 > 1.) discard;
          float a = exp(-r2 * 9.) * 1.2 + exp(-r2 * 2.5) * .22;
          gl_FragColor = vec4(vCol * a, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const pts = new THREE.Points(g, m); pts.name = 'night-lights'; pts.frustumCulled = false; pts.renderOrder = 6;
    group.add(pts); nightOnly.push(pts);
    void n;
  }

  function buildDeferred() {   // trees (all sets), the courtyard pool water, light pools, city lights
    // the park woodland around Lacul Morii stays ours; the waterside willows and the island belong to the lake module
    treeSets.push({ pts: L.pTrees, detail: 0, lobes: 3, h: [7, 12], r: [2.6, 4.2], trunk: [2.4, 3.4], cast: false, hue: 'park' });
    if (!ext.lake) {
    treeSets.push({ g: lakeG, pts: L.willows, detail: 0, lobes: 5, h: [7, 10], r: [3.2, 4.4], trunk: [1.5, 2.2], cast: false, hue: 'willow' });
      const [ix, iz] = LAKE.island.center, ir = LAKE.island.r, isl = [];
      for (let i = 0; i < 70; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.85, x = ix + Math.cos(a) * ir * 1.2 * d, z = iz + Math.sin(a) * ir * 0.75 * d;
        if (Math.hypot(x - ix, z - iz) > 16) isl.push([x, z, 0.8 + rnd() * 0.4, 0.35]);
      }
      treeSets.push({ g: lakeG, pts: isl, detail: 0, lobes: 5, h: [7, 10], r: [3, 4.2], trunk: [1.5, 2.2], cast: false, hue: 'willow' });
    }
    for (const set of treeSets) if (set.pts.length) addTrees(set);
    if (pendingPool) {
      const wm = new THREE.ShaderMaterial({ uniforms: pendingPool.uniforms, fog: true, vertexShader: WATER_VS, fragmentShader: WATER_FS });
      group.add(new THREE.Mesh(pendingPool.geo, wm));
      poolU = pendingPool.uniforms;
    }
    for (const [g, pools] of poolsBy) {
      if (!pools.length) continue;
      const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
      const m = new THREE.InstancedMesh(pg, poolMat, pools.length); const o = new THREE.Object3D();
      pools.forEach(([x, z, r], i) => { o.position.set(x, 0.03, z); o.scale.set(r * 2, 1, r * 2); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.computeBoundingSphere(); m.renderOrder = 2; g.add(m); nightOnly.push(m);
    }
  }

  function addTrees(set) {
    const { pts } = set;
    const crown = set.leafy ? leafCrownGeometry(91 + pts.length) : set.blob ? blobGeometry() : crownGeometry(set.detail, set.lobes, 17 + set.detail * 3 + set.lobes);
    const trunkG = set.detail > 0 || set.leafy ? new THREE.CylinderGeometry(0.1, 0.16, 1, 6) : new THREE.CylinderGeometry(0.1, 0.16, 1, 4, 1, true); trunkG.translate(0, 0.5, 0);
    const cm = registerMaterial(set.leafy
      ? stdMat({ color: '#ffffff', vertexColors: true, map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, envBase: 0.35 })
      : stdMat({ color: '#ffffff', vertexColors: true, roughness: 0.88, envBase: 0.3 }));
    const up = set.uplight ? 1 : set.blob ? 0 : 0.3;   // site trees are uplit; garden trees catch street / window light
    if (set.leafy) {
      cm.onBeforeCompile = sh => {
        sh.uniforms.uGlow = SHARED.uGlow;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vTy;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTy = position.y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTy; uniform float uGlow;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance += vec3(1., .62, .3) * uGlow * ${up.toFixed(2)} * .6 * pow(1. - clamp(vTy, 0., 1.), 2.2) * diffuseColor.rgb;`);
      };
      cm.customProgramCacheKey = () => 'vr-leaf-' + up;
    } else cm.onBeforeCompile = sh => {
      sh.uniforms.uGlow = SHARED.uGlow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTp = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTp; uniform float uGlow;\n' + GLSL_NOISE)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float lf = vr_noise(vTp.xy * 9. + vTp.z * 3.1) * vr_noise(vTp.zy * 8.3 - vTp.x * 2.7);
          diffuseColor.rgb *= .68 + .8 * lf;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1., .62, .3) * uGlow * ${up.toFixed(2)} * .5 * pow(1. - clamp(vTp.y, 0., 1.), 2.5) * diffuseColor.rgb;`);
    };
    if (!set.leafy) cm.customProgramCacheKey = () => 'vr-tree-' + up;
    const tm = registerMaterial(stdMat({ color: '#4a3b2e', roughness: 1, envBase: 0.2 }));
    const crowns = new THREE.InstancedMesh(crown, cm, pts.length), trunks = set.blob || set.noTrunk ? null : new THREE.InstancedMesh(trunkG, tm, pts.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    // lush, varied canopies: deep greens with olive, blue-green and a few yellowish / copper crowns (limes, birches, plums)
    const pal = set.hue === 'willow' ? ['#7d9038', '#8e9c42', '#6d8232', '#869a3e']
      : set.hue === 'young' ? ['#5a7a30', '#678a36', '#4f7030', '#739038', '#5f8038', '#80903a']
      : set.hue === 'site' ? ['#44652a', '#52702e', '#3b5a25', '#5f7534', '#4a6b31', '#6a7636', '#3e6030']
      : set.hue === 'garden' ? ['#3e5a26', '#4a642b', '#344f22', '#556c31', '#43602c', '#5e6a34', '#51692f', '#2f4a26', '#3a5a34', '#48602e']
      : ['#34501f', '#3d5823', '#2e481d', '#475a27', '#3a4e24', '#526030'];
    const rare = set.hue === 'garden' ? 0.975 : 2;   // a few copper-leaf plums / purple beeches in the gardens
    pts.forEach(([x, z, s = 1, y = 0], i) => {
      const h = (set.h[0] + rnd() * (set.h[1] - set.h[0])) * s, r = (set.r[0] + rnd() * (set.r[1] - set.r[0])) * s, th = (set.trunk[0] + rnd() * (set.trunk[1] - set.trunk[0])) * s;
      const ch = Math.max(1, h - th);
      o.position.set(x, y + th * 0.85, z); o.rotation.set(0, rnd() * TAU, 0); o.scale.set(r, set.hue === 'willow' ? ch * 1.1 : ch, r * (0.85 + rnd() * 0.3)); o.updateMatrix(); crowns.setMatrixAt(i, o.matrix);
      if (rnd() > rare) c.set(rnd() < 0.6 ? '#4a2c30' : '#5e5a2c'); else c.set(pal[Math.floor(rnd() * pal.length)]);
      c.offsetHSL((rnd() - 0.5) * 0.035, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.09); crowns.setColorAt(i, c);
      if (trunks) { o.position.set(x, y, z); o.scale.set(s * 1.1, th * 1.05, s * 1.1); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix); }
    });
    crowns.castShadow = set.cast; crowns.receiveShadow = set.cast;
    crowns.computeBoundingSphere(); (set.g || group).add(crowns);
    if (trunks) { trunks.castShadow = set.cast; trunks.computeBoundingSphere(); (set.g || group).add(trunks); }
  }
}
