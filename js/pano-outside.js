// VILNYI RIVER CITY — the real surroundings for the photoreal 360° tour (v2.9).
// The photoreal panoramas are rendered once per apartment TYPE (from one reference unit on a high floor), so what they
// show through the windows and from the balcony belongs to that reference unit. This module replaces that part with
// the view from the visitor's own unit: it builds the same procedural site as the live 3D (environment.js + exterior.js,
// daylight) inside the tour's own WebGL context and captures a cube of it at the real position of the current standing
// point (building, floor height, facade, C3's mirrored plan), already rotated into the unit-local frame of the panorama.
// pano-tour.js composites it through the per-panorama "outside" mask (assets/tour/<type>/<style>/<id>-m.png).
// Nothing is downloaded for this: the cube is rendered on the visitor's device, one capture per standing point.
//
//   const out = await createOutside(renderer, { face })      // throws when the 3D site cannot be built
//   out.capture(unit, u, v, y, slot)  → THREE.Texture        // slot 0 | 1 (two atlases: current + next panorama)
//   out.dispose()
// Atlas: 3 × 2 cells (+X −X +Y −Y +Z −Z in unit-local axes x = u, y up, z = v), each rendered with a small overscan
// (OVERSCAN) so bilinear taps never cross into a neighbouring cell; values are display-referred sRGB (ACES filmic).
import * as THREE from 'three';
import { BUILDINGS, TYPES, floorY, unitToWorld, unitYaw } from './data.js?v=3.13';

export const OVERSCAN = 1.03;

// GLSL: direction (unit-local) → atlas sample. Shared with pano-tour.js.
export const ENV_GLSL = `
vec3 envAt(sampler2D t, vec3 d){
  vec3 a = abs(d); vec3 f; vec3 up; float idx;
  if (a.x >= a.y && a.x >= a.z) { f = vec3(d.x > 0.0 ? 1.0 : -1.0, 0.0, 0.0); up = vec3(0.0, 1.0, 0.0); idx = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { float s = d.y > 0.0 ? 1.0 : -1.0; f = vec3(0.0, s, 0.0); up = vec3(0.0, 0.0, -s); idx = d.y > 0.0 ? 2.0 : 3.0; }
  else { f = vec3(0.0, 0.0, d.z > 0.0 ? 1.0 : -1.0); up = vec3(0.0, 1.0, 0.0); idx = d.z > 0.0 ? 4.0 : 5.0; }
  vec3 r = cross(f, up);
  vec2 st = vec2(dot(d, r), dot(d, up)) / (dot(d, f) * ${OVERSCAN.toFixed(4)});
  vec2 cell = vec2(mod(idx, 3.0), floor(idx / 3.0));
  return textureLod(t, (cell + 0.5 + 0.5 * st) / vec2(3.0, 2.0), 0.0).rgb;
}`;

const FACES = [   // forward, up (unit-local); right = forward × up — must match envAt()
  [[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, -1]], [[0, -1, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]],
];

export async function createOutside(renderer, { face = 1024 } = {}) {
  const [envMod, extMod] = await Promise.all([import('./three/environment.js?v=3.13'), import('./three/exterior.js?v=3.13')]);
  // environment.js keeps module-level state shared by every instance on the page (hero, walkthrough): remember it and
  // put it back on dispose, so the paused live 3D underneath finds its own mode / sky map again.
  const SH = envMod.SHARED;
  const saved = SH ? { mode: SH.mode, envMap: SH.envMap, envIntensity: SH.envIntensity, glow: SH.uGlow.value, lit: SH.uLit.value, night: SH.uNight.value, mats: new Set(SH.mats) } : null;
  const scene = new THREE.Scene();
  let env = null, complex = null;
  const restoreShared = () => {
    if (!saved) return;
    SH.mode = saved.mode; SH.envMap = saved.envMap; SH.envIntensity = saved.envIntensity;
    SH.uGlow.value = saved.glow; SH.uLit.value = saved.lit; SH.uNight.value = saved.night;
    for (const m of saved.mats) {
      if (!SH.mats.has(m)) continue;
      if (m.envMap !== saved.envMap) { const had = !!m.envMap; m.envMap = saved.envMap; if (had !== !!saved.envMap) m.needsUpdate = true; }
      m.envMapIntensity = ((m.userData && m.userData.envBase) ?? 1) * saved.envIntensity;
    }
  };
  // While this scene renders, the shared state must be "day"; outside of a capture it is handed back (see capture()).
  let mine = null;
  try {
    env = envMod.createEnvironment(scene, renderer, { mode: 'day', shadows: false });
    if (env.group && !env.group.parent) scene.add(env.group);
    if (env.ready && typeof env.ready.then === 'function') await env.ready;
    complex = extMod.createComplex({});
    scene.add(complex.group);
    env.setMode('day');
    if (SH) mine = { mode: SH.mode, envMap: SH.envMap, envIntensity: SH.envIntensity, glow: SH.uGlow.value, lit: SH.uLit.value, night: SH.uNight.value };
  } catch (e) {
    try { complex && complex.dispose(); env && env.dispose(); } catch { /* best effort */ }
    restoreShared();
    throw e;
  }
  const ownMats = SH ? [...SH.mats].filter(m => !saved.mats.has(m)) : [];
  const takeShared = () => {
    if (!mine) return;
    SH.mode = mine.mode; SH.envMap = mine.envMap; SH.envIntensity = mine.envIntensity; SH.uGlow.value = mine.glow; SH.uLit.value = mine.lit; SH.uNight.value = mine.night;
    for (const m of ownMats) { m.envMap = mine.envMap; m.envMapIntensity = ((m.userData && m.userData.envBase) ?? 1) * mine.envIntensity; }
  };
  restoreShared();

  // each face is rendered at 2× and box-filtered by the tone-mapping pass (anti-aliasing without relying on float MSAA)
  const hdr = renderer.capabilities.isWebGL2 || renderer.extensions.has('EXT_color_buffer_half_float');
  const scratch = new THREE.WebGLRenderTarget(face * 2, face * 2, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  const mkAtlas = () => {
    const rt = new THREE.WebGLRenderTarget(face * 3, face * 2, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    rt.texture.colorSpace = THREE.NoColorSpace;
    return rt;
  };
  const atlas = [mkAtlas(), mkAtlas()];
  // scene-linear → ACES filmic (three's fit, exposure 1) → sRGB, written as plain bytes
  const quadMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: scratch.texture }, exposure: { value: 1.0 } }, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      precision highp float; varying vec2 vUv; uniform sampler2D t; uniform float exposure;
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 color){
        const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        color *= exposure / 0.6; color = I * color; color = RRTAndODTFit(color); color = O * color; return clamp(color, 0.0, 1.0);
      }
      void main(){
        vec3 c = aces(max(texture2D(t, vUv).rgb, 0.0));
        c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat); quad.frustumCulled = false; quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const cam = new THREE.PerspectiveCamera(2 * Math.atan(OVERSCAN) * 180 / Math.PI, 1, 0.08, 12000);
  cam.matrixAutoUpdate = false;
  scene.add(cam);
  const F = new THREE.Vector3(), Up = new THREE.Vector3(), R = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Matrix4(), Y = new THREE.Matrix4(), P = new THREE.Vector3();
  const vp = new THREE.Vector4();
  let disposed = false;

  function capture(unit, u, v, y, slot = 0) {
    if (disposed) return null;
    const rt = atlas[slot ? 1 : 0];
    const [wx, wz] = unitToWorld(unit, u, v);
    P.set(wx, floorY(unit.floor) + y, wz);
    Y.makeRotationY(unitYaw(unit));
    // hide the complex's own stand-in for this unit (the photoreal layer brings its shell, balcony and glazing), as the live 3D does
    const duplex = !!(TYPES[unit.type] && TYPES[unit.type].duplex);
    for (const id of Object.keys(BUILDINGS)) {
      if (id !== unit.building) complex.setHiddenFloor(id, null);
      else if (duplex && typeof complex.setHiddenFloors === 'function') complex.setHiddenFloors(id, [unit.floor, unit.floor + 1]);
      else complex.setHiddenFloor(id, unit.floor);
    }
    const prev = { rt: renderer.getRenderTarget(), auto: renderer.autoClear, tm: renderer.toneMapping, sh: renderer.shadowMap.enabled };
    renderer.getViewport(vp);
    takeShared();
    try {
      renderer.autoClear = true; renderer.toneMapping = THREE.NoToneMapping;
      for (let i = 0; i < 6; i++) {
        F.fromArray(FACES[i][0]); Up.fromArray(FACES[i][1]); R.crossVectors(F, Up); B.copy(F).negate();
        M.makeBasis(R, Up, B).premultiply(Y).setPosition(P);
        cam.matrix.copy(M); cam.matrixWorld.copy(M); cam.matrixWorldInverse.copy(M).invert();
        cam.position.copy(P);                         // exterior.js / environment.js read camera.position
        try { env.update(0, cam); } catch { /* optional */ }
        renderer.setRenderTarget(scratch); renderer.clear();
        renderer.render(scene, cam);
        renderer.setRenderTarget(rt);
        rt.viewport.set((i % 3) * face, Math.floor(i / 3) * face, face, face);
        rt.scissor.copy(rt.viewport); rt.scissorTest = true;
        renderer.setRenderTarget(rt);
        renderer.autoClear = false;
        renderer.render(quadScene, quadCam);
        renderer.autoClear = true;
      }
    } finally {
      renderer.setRenderTarget(prev.rt); renderer.setViewport(vp); renderer.autoClear = prev.auto; renderer.toneMapping = prev.tm;
      restoreShared();
    }
    return rt.texture;
  }

  function dispose() {
    if (disposed) return; disposed = true;
    takeShared();
    try { complex.dispose(); } catch (e) { console.warn('[pano] outside dispose', e); }
    try { env.dispose(); } catch (e) { console.warn('[pano] outside dispose', e); }
    // nothing of this instance may stay registered in the page-wide material set
    if (SH) for (const m of [...SH.mats]) if (!saved.mats.has(m) && (ownMats.includes(m) || (mine && mine.envMap && m.envMap === mine.envMap))) SH.mats.delete(m);
    restoreShared();
    scratch.dispose(); atlas[0].dispose(); atlas[1].dispose(); quadMat.dispose(); quad.geometry.dispose();
  }
  return { capture, dispose, scene, env, complex };
}
