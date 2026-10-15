// core-pathtrace.js — "הדמיה מציאותית": path-traced 360° panoramas and current-view stills inside 360 mode, using
// three-gpu-pathtracer (lazy dynamic import) in its own offscreen WebGL context. On ANY failure it falls back to a
// high-quality raster render (supersampled cube capture for 360, supersampled AO composer frame for the current view).
// Owner: RENDER bot. No side effects on import; core calls createPathTrace(env).
//
// Scene subset: proxies (new Mesh(sharedGeometry, sharedMaterial) with the world matrix copied — no geometry/material
// cloning) of every *effectively visible* mesh within ~26 m of the node; excludes core helpers, invisible colliders /
// ramps (visible=false anywhere up the chain), particles, Points/Lines/Sprites, ShaderMaterials (sky, scanner),
// glow cards, big instanced meshes (grass, leaves) and far neighbours. Sun = DirectionalLight, lamps = Point/Spot
// lights that are on; sky = generated equirect float gradient (scene.environment + background).
import * as THREE from 'three';

const TAU = Math.PI * 2;

export function createPathTrace(env) {
  // env: { renderer, scene, camera, plan, pano, render (core-render api), sun, getTod(), isPhone, isTouch, toast(m,ms),
  //        reportError(w,e), onUpdate(fn), getMode() }
  const { renderer, scene, camera } = env;
  const R = env.render;
  const $ = (id) => document.getElementById(id);
  const toast = (m, ms) => { try { env.toast && env.toast(m, ms); } catch (_) {} };
  const phone = !!env.isPhone;
  const ui = { b360: $('btnPT'), bView: $('btnPTView'), bStop: $('btnPTStop'), bDl: $('btnPTDl'), bBack: $('btnPTBack'), prog: $('ptProg'), txt: $('ptTxt'), bar: $('ptBar'), overlay: $('ptOverlay') };

  const CFG = phone
    ? { samples: 120, renderScale: 0.5, tiles: 3, bounces: 4, texSize: 512, eqW: 2048, eqH: 1024, viewScale: 1, rasterEqW: 2048, rasterCube: 1024, budget: 1 }
    : { samples: 300, renderScale: 1, tiles: 2, bounces: 7, texSize: 1024, eqW: 2048, eqH: 1024, viewScale: Math.min(window.devicePixelRatio || 1, 2), rasterEqW: 4096, rasterCube: 2048, budget: 3 };
  const RADIUS = 26;

  const st = { job: null, view: null, lib: undefined, libP: null, r2: null, pt: null, blit: null, cache: new Map(), lastErr: null };

  /* ================================================================ UI */
  function setRunning(on) { document.body.classList.toggle('pt-running', !!on); }
  function setViewing(on) { document.body.classList.toggle('pt-viewing', !!on); }
  function progress(text, frac) {
    if (ui.txt) ui.txt.textContent = text;
    if (ui.bar) ui.bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, frac || 0))})`;
  }
  ui.b360 && ui.b360.addEventListener('click', () => start360());
  ui.bView && ui.bView.addEventListener('click', () => startView());
  ui.bStop && ui.bStop.addEventListener('click', () => stop());
  ui.bBack && ui.bBack.addEventListener('click', () => exitView());
  ui.bDl && ui.bDl.addEventListener('click', () => download());

  /* ================================================================ library + offscreen context */
  function loadLib() {
    if (st.lib !== undefined) return Promise.resolve(st.lib);
    if (!st.libP) {
      st.libP = Promise.race([
        import('three-gpu-pathtracer'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout loading three-gpu-pathtracer')), 25000)),
      ]).then((m) => { st.lib = m; return m; }, (e) => { st.lib = null; st.lastErr = e; console.warn('[pathtrace] library unavailable', e); return null; });
    }
    return st.libP;
  }
  function ensureR2() {
    if (st.r2) return st.r2;
    const cv = document.createElement('canvas');
    const r2 = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r2.setPixelRatio(1);
    r2.outputColorSpace = THREE.SRGBColorSpace;
    r2.toneMapping = THREE.ACESFilmicToneMapping;
    r2.toneMappingExposure = 1;
    st.r2 = r2;
    return r2;
  }
  function makeTracer(lib, r2) {
    if (!lib || typeof lib.WebGLPathTracer !== 'function') throw new Error('three-gpu-pathtracer: WebGLPathTracer not exported');
    const pt = new lib.WebGLPathTracer(r2);
    const set = (k, v) => { try { if (k in pt) pt[k] = v; } catch (_) {} };
    set('rasterizeScene', false); set('renderDelay', 0); set('minSamples', 0); set('fadeDuration', 0); set('dynamicLowRes', false);
    set('synchronizeRenderSize', true); set('renderScale', CFG.renderScale); set('bounces', CFG.bounces); set('transmissiveBounces', 6);
    set('filterGlossyFactor', 0.5); set('multipleImportanceSampling', true); set('enablePathTracing', true); set('pausePathTracing', false);
    try { pt.tiles && pt.tiles.set && pt.tiles.set(CFG.tiles, CFG.tiles); } catch (_) {}
    try { pt.textureSize && pt.textureSize.set && pt.textureSize.set(CFG.texSize, CFG.texSize); } catch (_) {}
    return pt;
  }
  function ensureBlit(r2) {
    if (st.blit) return st.blit;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D map;\nvarying vec2 vUv;\nvoid main(){\n  vec4 c = texture2D(map, vUv);\n  gl_FragColor = vec4(max(c.rgb, vec3(0.0)), 1.0);\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}',
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(quad);
    st.blit = { mat, sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    void r2;
    return st.blit;
  }
  function blit(r2, pt) {
    const t = pt && pt.target;
    if (!t || !t.texture) return false;
    const b = ensureBlit(r2);
    b.mat.uniforms.map.value = t.texture;
    r2.setRenderTarget(null);
    r2.render(b.sc, b.cam);
    return true;
  }
  function dropTracer() {
    try { st.pt && st.pt.dispose && st.pt.dispose(); } catch (_) {}
    st.pt = null;
  }

  /* ================================================================ scene subset */
  const _m4 = new THREE.Matrix4(), _bb = new THREE.Box3(), _sp = new THREE.Sphere(), _v = new THREE.Vector3();
  const okMat = (m) => m && m.visible !== false && m.colorWrite !== false && !m.isShaderMaterial && !m.isRawShaderMaterial && !m.isPointsMaterial && !m.isLineBasicMaterial && !m.isSpriteMaterial
    && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)
    && !(m.transparent && m.opacity < 0.04)
    && !(m.transparent && m.depthWrite === false && m.opacity < 0.6 && !(m.transmission > 0)) // fake glow cards / light shafts
    && m.blending !== THREE.AdditiveBlending;
  // raster window glass is cheap (no transmission pass); mats.js names its physically based twin in userData.ptTwin
  // ('glassClear' / 'glassFrosted', transmission) — swap it in for the path tracer
  const twinCache = new Map();
  function twinOf(m) {
    const name = m && m.userData && m.userData.ptTwin;
    if (!name) return m;
    if (twinCache.has(m)) return twinCache.get(m);
    let t = null;
    try { const mats = env.getMaterials ? env.getMaterials() : null; t = mats && mats[name]; } catch (_) { t = null; }
    const r = t && t.isMaterial ? t : m;
    twinCache.set(m, r);
    return r;
  }
  function geomOk(g) {
    if (!g || !g.attributes || !g.attributes.position || !g.attributes.normal) return false;
    for (const k in g.attributes) if (g.attributes[k].isInterleavedBufferAttribute) return false;
    return g.attributes.position.count > 0;
  }
  function buildSubset(center) {
    const out = new THREE.Scene();
    scene.updateMatrixWorld(true);
    const counts = { meshes: 0, instances: 0, lights: 0, skipped: 0 };
    let instBudget = 2500;
    const camLayers = camera.layers;
    const visit = (o) => {
      const ud = o.userData || {};
      if (ud.__core || ud.noPathTrace === true || ud.noPathtrace === true) return; // exterior writes both spellings
      if (!o.visible && !ud.ptInclude) return; // invisible ramps / colliders / hidden subtrees
      if (o.isMesh && !o.isSkinnedMesh && (o.layers.test(camLayers) || ud.ptInclude) && !/^core_/.test(o.name || '')) {
        const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(twinOf);
        const pmat = Array.isArray(o.material) ? mats : mats[0];
        if (mats.every(okMat) && geomOk(o.geometry)) {
          const g = o.geometry;
          if (o.isInstancedMesh) {
            if (o.count <= 400 && !/grass|lawn|leaf|leaves|blade/i.test(o.name || '') && instBudget > 0) {
              if (!g.boundingSphere) g.computeBoundingSphere();
              for (let i = 0; i < o.count && instBudget > 0; i++) {
                o.getMatrixAt(i, _m4); _m4.premultiply(o.matrixWorld);
                _sp.copy(g.boundingSphere).applyMatrix4(_m4);
                if (_sp.center.distanceTo(center) - _sp.radius > RADIUS) continue;
                const p = new THREE.Mesh(g, pmat); p.matrixAutoUpdate = false; p.matrix.copy(_m4); out.add(p);
                counts.instances++; instBudget--;
              }
            } else counts.skipped++;
          } else {
            if (!g.boundingBox) g.computeBoundingBox();
            _bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
            if (_bb.distanceToPoint(center) <= RADIUS) {
              const p = new THREE.Mesh(g, pmat); p.matrixAutoUpdate = false; p.matrix.copy(o.matrixWorld); out.add(p);
              counts.meshes++;
            } else counts.skipped++;
          }
        } else if (o.isMesh) counts.skipped++;
      }
      for (const c of o.children) visit(c);
    };
    for (const c of scene.children) visit(c);
    // lights
    const sun = env.sun;
    if (sun && sun.intensity > 0) {
      const d = new THREE.DirectionalLight(sun.color.clone(), sun.intensity);
      sun.getWorldPosition(d.position); sun.target.getWorldPosition(d.target.position);
      out.add(d); out.add(d.target); counts.lights++;
    }
    const chainVisible = (o) => { for (let a = o.parent; a; a = a.parent) if (!a.visible) return false; return true; };
    scene.traverse((o) => {
      if (!(o.isPointLight || o.isSpotLight) || !(o.intensity > 0) || (o.userData && o.userData.__core) || !chainVisible(o)) return;
      o.getWorldPosition(_v);
      if (_v.distanceTo(center) > RADIUS) return;
      let l;
      if (o.isSpotLight) {
        l = new THREE.SpotLight(o.color.clone(), o.intensity, o.distance, o.angle, o.penumbra, o.decay);
        o.target.getWorldPosition(l.target.position); out.add(l.target);
      } else l = new THREE.PointLight(o.color.clone(), o.intensity, o.distance, o.decay);
      l.position.copy(_v); out.add(l); counts.lights++;
    });
    out.updateMatrixWorld(true);
    return { scene: out, counts };
  }

  // equirect sky (float, linear) — the sun itself is the DirectionalLight, so no disc here (only a soft halo)
  function skyTexture() {
    const W = 512, H = 256, data = new Float32Array(W * H * 4);
    const t = env.getTod ? env.getTod() : { night: 0 };
    const n = Math.max(0, Math.min(1, t.night || 0));
    const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const pal = (a, b, c) => (n < 0.55 ? lerp3(a, b, n / 0.55) : lerp3(b, c, (n - 0.55) / 0.45));
    const zen = pal([0.20, 0.36, 0.78], [0.10, 0.12, 0.26], [0.004, 0.007, 0.016]);
    const hor = pal([0.62, 0.70, 0.82], [0.62, 0.36, 0.22], [0.012, 0.014, 0.022]);
    const gnd = pal([0.16, 0.15, 0.13], [0.07, 0.05, 0.045], [0.003, 0.003, 0.004]);
    const sunC = env.sun ? env.sun.color : new THREE.Color(1, 1, 1);
    const sd = new THREE.Vector3(0, 1, 0);
    if (env.sun) { sd.copy(env.sun.position).sub(env.sun.target.position); if (sd.lengthSq() > 1e-8) sd.normalize(); }
    const halo = 0.35 * (1 - n * 0.9);
    for (let j = 0; j < H; j++) {
      const v = (j + 0.5) / H, ph = (v - 0.5) * Math.PI, cy = Math.sin(ph), cp = Math.cos(ph);
      for (let i = 0; i < W; i++) {
        const u = (i + 0.5) / W, th = (u - 0.5) * TAU;
        const dx = Math.cos(th) * cp, dz = Math.sin(th) * cp;
        let r, g, b;
        if (cy >= 0) { const k = Math.pow(cy, 0.45); r = hor[0] + (zen[0] - hor[0]) * k; g = hor[1] + (zen[1] - hor[1]) * k; b = hor[2] + (zen[2] - hor[2]) * k; }
        else { const k = Math.min(1, -cy * 6); r = hor[0] * 0.5 + (gnd[0] - hor[0] * 0.5) * k; g = hor[1] * 0.5 + (gnd[1] - hor[1] * 0.5) * k; b = hor[2] * 0.5 + (gnd[2] - hor[2] * 0.5) * k; }
        const c = Math.max(0, dx * sd.x + cy * sd.y + dz * sd.z);
        const hl = halo * Math.pow(c, 24) + halo * 0.25 * Math.pow(c, 4);
        const o = (j * W + i) * 4;
        data[o] = r + sunC.r * hl; data[o + 1] = g + sunC.g * hl; data[o + 2] = b + sunC.b * hl; data[o + 3] = 1;
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  /* ================================================================ raster fallback / reference (main context) */
  function rasterEquirect(pos, W, H, cubeSize, exposure) {
    const maxCube = (renderer.capabilities && renderer.capabilities.maxCubemapSize) || 2048;
    const maxT = (renderer.capabilities && renderer.capabilities.maxTextureSize) || 4096;
    cubeSize = Math.min(cubeSize, maxCube); W = Math.min(W, maxT); H = Math.min(H, maxT);
    const cubeRT = new THREE.WebGLCubeRenderTarget(cubeSize, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const cc = new THREE.CubeCamera(0.05, 2000, cubeRT);
    cc.position.copy(pos); cc.userData.__core = true;
    scene.add(cc); cc.updateMatrixWorld(true);
    const eqRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, generateMipmaps: false, depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tCube: { value: cubeRT.texture }, uExposure: { value: exposure }, uTexel: { value: new THREE.Vector2(1 / W, 1 / H) } },
      vertexShader: 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform samplerCube tCube; uniform float uExposure; uniform vec2 uTexel; varying vec2 vUv;
        vec3 ptDirAt(vec2 uv){ float th = (uv.x - 0.5) * 6.28318530718; float ph = (uv.y - 0.5) * 3.14159265359; return vec3(cos(th) * cos(ph), sin(ph), sin(th) * cos(ph)); }
        vec3 ptRRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 ptACES(vec3 color){
          const mat3 IM = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
          const mat3 OM = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
          color *= uExposure / 0.6; color = IM * color; color = ptRRT(color); color = OM * color; return clamp(color, 0.0, 1.0);
        }
        vec3 ptSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
        void main(){
          vec3 c = vec3(0.0);
          c += textureCube(tCube, ptDirAt(vUv + uTexel * vec2(-0.25, -0.25))).rgb;
          c += textureCube(tCube, ptDirAt(vUv + uTexel * vec2( 0.25, -0.25))).rgb;
          c += textureCube(tCube, ptDirAt(vUv + uTexel * vec2(-0.25,  0.25))).rgb;
          c += textureCube(tCube, ptDirAt(vUv + uTexel * vec2( 0.25,  0.25))).rgb;
          gl_FragColor = vec4(ptSRGB(ptACES(c * 0.25)), 1.0);
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    const qs = new THREE.Scene(); qs.add(quad);
    const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prev = renderer.getRenderTarget();
    const restore = R && R.hideHelpers ? R.hideHelpers() : () => {};
    const prevAuto = renderer.shadowMap.autoUpdate;
    let cv = null;
    try {
      renderer.shadowMap.autoUpdate = false;
      cc.update(renderer, scene);
      renderer.setRenderTarget(eqRT);
      renderer.render(qs, qc);
      const buf = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(eqRT, 0, 0, W, H, buf);
      cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'); const img = g.createImageData(W, H); const row = W * 4;
      for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * row, (H - y) * row), y * row);
      g.putImageData(img, 0, 0);
    } finally {
      renderer.setRenderTarget(prev);
      renderer.shadowMap.autoUpdate = prevAuto;
      restore();
      scene.remove(cc);
      cubeRT.dispose(); eqRT.dispose(); mat.dispose(); quad.geometry.dispose();
    }
    return cv;
  }

  /* ================================================================ orientation calibration (pt vs raster reference) */
  const IDENT = { flipU: 1, shiftU: 0, flipV: 0 };
  function lumGrid(canvas, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    return out;
  }
  function calibrate(ptCanvas, refCanvas) {
    const GW = 128, GH = 64, SW = 64, SH = 32;
    const P = lumGrid(ptCanvas, GW, GH), Q = lumGrid(refCanvas, GW, GH);
    let best = { ...IDENT, r: -2 }, identR = -2;
    for (const flipU of [1, -1]) for (let k = 0; k < 4; k++) for (const flipV of [0, 1]) {
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
      for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
        const u = (i + 0.5) / SW, v = 1 - (j + 0.5) / SH;
        let u2 = flipU * u + k / 4; u2 -= Math.floor(u2);
        const v2 = flipV ? 1 - v : v;
        const px = Math.min(GW - 1, Math.floor(u2 * GW)), py = Math.min(GH - 1, Math.floor((1 - v2) * GH));
        const a = P[py * GW + px], b = Q[Math.min(GH - 1, Math.floor((1 - v) * GH)) * GW + Math.min(GW - 1, Math.floor(u * GW))];
        sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b; n++;
      }
      const cov = sxy / n - (sx / n) * (sy / n), va = sxx / n - (sx / n) ** 2, vb = syy / n - (sy / n) ** 2;
      const r = va > 1e-6 && vb > 1e-6 ? cov / Math.sqrt(va * vb) : -1;
      if (flipU === 1 && k === 0 && !flipV) identR = r;
      if (r > best.r) best = { flipU, shiftU: k / 4, flipV, r };
    }
    // keep the documented convention unless another mapping is clearly better
    if (best.r - identR < 0.08) return { ...IDENT, r: identR };
    console.info('[pathtrace] equirect orientation calibrated', best, 'identity r=', identR.toFixed(3));
    return best;
  }

  /* ================================================================ viewers */
  const viewer = (() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, uCenter: { value: new THREE.Vector3() }, uFlipU: { value: 1 }, uShiftU: { value: 0 }, uFlipV: { value: 0 } },
      vertexShader: 'varying vec3 vW;\nvoid main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D map; uniform vec3 uCenter; uniform float uFlipU; uniform float uShiftU; uniform float uFlipV; varying vec3 vW;
        void main(){
          vec3 d = normalize(vW - uCenter);
          float u = atan(d.z, d.x) * 0.15915494309 + 0.5;
          float v = asin(clamp(d.y, -1.0, 1.0)) * 0.31830988618 + 0.5;
          u = fract(uFlipU * u + uShiftU);
          if (uFlipV > 0.5) v = 1.0 - v;
          gl_FragColor = vec4(texture2D(map, vec2(u, v)).rgb, 1.0);
        }`,
      side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(40, 96, 48), mat);
    mesh.frustumCulled = false; mesh.userData.__core = true;
    const sc = new THREE.Scene(); sc.add(mesh);
    return { mat, mesh, sc, tex: null };
  })();
  function setViewerCanvas(cv, T) {
    if (!viewer.tex || viewer.tex.image !== cv) {
      if (viewer.tex) viewer.tex.dispose();
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.NoColorSpace; // already tone-mapped sRGB pixels: shown as-is
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      viewer.tex = t; viewer.mat.uniforms.map.value = t;
    } else viewer.tex.needsUpdate = true;
    const U = viewer.mat.uniforms; T = T || IDENT;
    U.uFlipU.value = T.flipU; U.uShiftU.value = T.shiftU; U.uFlipV.value = T.flipV;
  }
  const freeze = () => true; // keep the last frame on the main canvas (GPU free for the path tracer)
  function show360(res) {
    setViewerCanvas(res.canvas, res.T);
    st.view = { ...res, camPos: camera.position.clone() };
    if (ui.overlay) { ui.overlay.innerHTML = ''; ui.overlay.classList.remove('show'); }
    R.setOverride((cam) => {
      viewer.mesh.position.copy(cam.position);
      viewer.mat.uniforms.uCenter.value.copy(cam.position);
      renderer.render(viewer.sc, cam);
      return true;
    });
    setViewing(true);
  }
  function showStill(res) {
    st.view = { ...res, camPos: camera.position.clone(), quat: camera.quaternion.clone() };
    if (ui.overlay) {
      ui.overlay.innerHTML = '';
      res.canvas.className = 'pt-still';
      ui.overlay.appendChild(res.canvas);
      ui.overlay.classList.add('show');
    }
    R.setOverride(freeze);
    setViewing(true);
  }
  function exitView() {
    if (st.job) { st.job.cancel = true; st.job.abandon = true; }
    st.view = null;
    if (ui.overlay) { ui.overlay.classList.remove('show'); ui.overlay.innerHTML = ''; }
    if (R.override) R.setOverride(null);
    setViewing(false);
  }

  /* ================================================================ sampling loop */
  function sampleLoop(job, pt, r2, target, onTick) {
    return new Promise((resolve, reject) => {
      let n = 1, last = performance.now(), ownBlit = null, calls = 0, lastS = -1, lastProgressT = performance.now();
      const tick = () => {
        if (job.cancel) return resolve('cancel');
        const now = performance.now(), dtf = now - last; last = now;
        if (dtf < 34 && n < CFG.budget * 4) n++; else if (dtf > 70 && n > 1) n--;
        try {
          for (let i = 0; i < n; i++) { pt.renderSample(); calls++; }
          if (ownBlit === null) { ownBlit = !!(pt.target && pt.target.texture); if (ownBlit && 'renderToCanvas' in pt) pt.renderToCanvas = false; }
          if (ownBlit) blit(r2, pt);
        } catch (e) { return reject(e); }
        const s = Math.floor(typeof pt.samples === 'number' && isFinite(pt.samples) ? pt.samples : calls / (CFG.tiles * CFG.tiles));
        if (s !== lastS) { lastS = s; lastProgressT = now; }
        else if (now - lastProgressT > 90000) return reject(new Error('path tracer made no progress for 90 s'));
        try { onTick(s); } catch (e) { return reject(e); }
        if (s >= target) resolve('done'); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  function autoExposure(r2, pt) {
    const t = pt && pt.target; if (!t || !t.texture) return null;
    const w = t.width, h = t.height, type = t.texture.type;
    let buf, half = false;
    if (type === THREE.FloatType) buf = new Float32Array(w * h * 4);
    else if (type === THREE.HalfFloatType) { buf = new Uint16Array(w * h * 4); half = true; }
    else return null;
    r2.readRenderTargetPixels(t, 0, 0, w, h, buf);
    const f = half ? (x) => THREE.DataUtils.fromHalfFloat(x) : (x) => x;
    const step = Math.max(1, Math.floor((w * h) / 24000)), L = [];
    for (let i = 0; i < w * h; i += step) {
      const l = 0.2126 * f(buf[i * 4]) + 0.7152 * f(buf[i * 4 + 1]) + 0.0722 * f(buf[i * 4 + 2]);
      if (isFinite(l)) L.push(l);
    }
    if (L.length < 32) return null;
    L.sort((a, b) => a - b);
    const hi = Math.floor(L.length * 0.97); let s = 0, c = 0;
    for (let i = Math.floor(L.length * 0.02); i < hi; i++) { s += Math.log(L[i] + 1e-4); c++; }
    if (!c) return null;
    const avg = Math.exp(s / c);
    return Math.max(0.3, Math.min(8, 0.26 / Math.max(1e-4, avg)));
  }
  const copyCanvas = (src, dst) => {
    dst = dst || document.createElement('canvas');
    if (dst.width !== src.width || dst.height !== src.height) { dst.width = src.width; dst.height = src.height; }
    dst.getContext('2d').drawImage(src, 0, 0);
    return dst;
  };

  async function tracePrepare(job, sizeW, sizeH, cam, center) {
    progress('טוען מנוע הדמיה מציאותית…', 0.02);
    const lib = await loadLib();
    if (job.cancel) return null;
    if (!lib) throw st.lastErr || new Error('three-gpu-pathtracer unavailable');
    const r2 = ensureR2();
    r2.setSize(sizeW, sizeH, false);
    r2.toneMappingExposure = renderer.toneMappingExposure;
    if (!st.pt) st.pt = makeTracer(lib, r2);
    progress('בונה סצנה למעקב קרניים (BVH)…', 0.05);
    await new Promise((r) => setTimeout(r, 30));
    const sub = buildSubset(center);
    sub.scene.environment = skyTexture();
    sub.scene.background = sub.scene.environment;
    sub.scene.add(cam); cam.updateMatrixWorld(true);
    const pt = st.pt;
    if (pt.setSceneAsync) await pt.setSceneAsync(sub.scene, cam);
    else pt.setScene(sub.scene, cam);
    if (job.cancel) return null;
    try { pt.reset && pt.reset(); } catch (_) {}
    progress('מכין שיידרים… (עשוי לקחת כמה שניות)', 0.08);
    await new Promise((r) => setTimeout(r, 30));
    console.info('[pathtrace] subset', sub.counts);
    return { lib, r2, pt, sub };
  }

  /* ================================================================ jobs */
  function begin(kind) {
    if (st.job) return null;
    if (!env.pano || !env.pano.active || !env.pano.node) { toast('ההדמיה המציאותית זמינה במצב סיור 360°'); return null; }
    if (st.view) exitView();
    const job = { kind, cancel: false, abandon: false, node: env.pano.node };
    st.job = job;
    try { env.pano.setAuto && env.pano.setAuto(false); } catch (_) {}
    setRunning(true);
    R.setOverride(freeze);
    return job;
  }
  function end(job) {
    if (st.job === job) st.job = null;
    setRunning(false);
    if (!st.view && R.override === freeze) R.setOverride(null);
  }
  const todName = () => (env.getTod ? env.getTod().name : 'day');

  async function start360() {
    const node = env.pano && env.pano.node;
    const key = node ? node.id + '|' + todName() : '';
    if (node && st.cache.has(key) && !st.job) { if (st.view) exitView(); show360(st.cache.get(key)); toast('הדמיה מהזיכרון ✓', 1600); return; }
    const job = begin('360'); if (!job) return;
    const pos = job.node.p.clone();
    let res = null;
    try {
      const exposure = renderer.toneMappingExposure;
      const ref = rasterEquirect(pos, 256, 128, 256, exposure);
      progress('טוען מנוע הדמיה מציאותית…', 0.02);
      const lib = await loadLib();
      if (!lib) throw st.lastErr || new Error('three-gpu-pathtracer unavailable');
      if (typeof lib.EquirectCamera !== 'function') throw new Error('three-gpu-pathtracer: EquirectCamera not exported');
      const ec = new lib.EquirectCamera();
      ec.position.copy(pos);
      const prep = await tracePrepare(job, CFG.eqW, CFG.eqH, ec, pos);
      if (!prep) { end(job); return; }
      const { r2, pt } = prep;
      let T = null, expDone = false, lastShow = 0;
      const disp = document.createElement('canvas');
      const out = await sampleLoop(job, pt, r2, CFG.samples, (s) => {
        progress(`דוגם ${s}/${CFG.samples}`, 0.1 + 0.9 * (s / CFG.samples));
        if (!expDone && s >= 12) { expDone = true; try { const e = autoExposure(r2, pt); if (e) r2.toneMappingExposure = e; } catch (e) { console.warn('[pathtrace] auto exposure', e); } }
        if (!T && s >= 24) { T = calibrate(r2.domElement, ref); copyCanvas(r2.domElement, disp); show360({ canvas: disp, T, kind: '360', source: 'pt', nodeId: job.node.id }); lastShow = performance.now(); }
        else if (T && performance.now() - lastShow > 1200) { copyCanvas(r2.domElement, disp); setViewerCanvas(disp, T); lastShow = performance.now(); }
      });
      if (out === 'cancel' && !T) { end(job); return; }
      if (!T) T = calibrate(r2.domElement, ref);
      copyCanvas(r2.domElement, disp);
      res = { canvas: disp, T, kind: '360', source: 'pt', nodeId: job.node.id, samples: Math.floor(pt.samples || 0), complete: out === 'done' };
      if (out === 'done') toast('ההדמיה המציאותית הושלמה ✓ — גררו כדי להסתכל מסביב', 3200);
    } catch (e) {
      console.warn('[pathtrace] 360 failed → raster fallback', e);
      if (job.cancel) { end(job); return; }
      dropTracer();
      toast('מנוע ההדמיה המציאותית אינו זמין כאן — מוצג רינדור 360 באיכות גבוהה', 4200);
      progress('מרנדר 360 באיכות גבוהה…', 0.5);
      await new Promise((r) => setTimeout(r, 40));
      try {
        const cv = rasterEquirect(pos, CFG.rasterEqW, CFG.rasterEqW / 2, CFG.rasterCube, renderer.toneMappingExposure);
        res = { canvas: cv, T: IDENT, kind: '360', source: 'raster', nodeId: job.node.id, complete: true };
      } catch (e2) { env.reportError && env.reportError('הדמיה 360', e2); }
    }
    if (res && res.complete) {
      st.cache.set(job.node.id + '|' + todName(), res);
      while (st.cache.size > 8) st.cache.delete(st.cache.keys().next().value);
    }
    if (res && !job.abandon && env.pano.active && env.pano.node === job.node) show360(res);
    end(job);
  }

  async function startView() {
    const job = begin('view'); if (!job) return;
    const w = Math.max(64, Math.floor(window.innerWidth * CFG.viewScale)), h = Math.max(64, Math.floor(window.innerHeight * CFG.viewScale));
    let res = null;
    const disp = document.createElement('canvas');
    try {
      const lib = await loadLib();
      if (!lib) throw st.lastErr || new Error('three-gpu-pathtracer unavailable');
      const Cam = lib.PhysicalCamera || THREE.PerspectiveCamera;
      const cam = new Cam(camera.fov, w / h, Math.max(0.02, camera.near), camera.far);
      camera.updateMatrixWorld(true);
      cam.position.copy(camera.getWorldPosition(new THREE.Vector3()));
      cam.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
      cam.updateProjectionMatrix();
      const prep = await tracePrepare(job, w, h, cam, cam.position.clone());
      if (!prep) { end(job); return; }
      const { r2, pt } = prep;
      let expDone = false, lastShow = 0, shown = false;
      const out = await sampleLoop(job, pt, r2, CFG.samples, (s) => {
        progress(`דוגם ${s}/${CFG.samples}`, 0.1 + 0.9 * (s / CFG.samples));
        if (!expDone && s >= 8) { expDone = true; try { const e = autoExposure(r2, pt); if (e) r2.toneMappingExposure = e; } catch (_) {} }
        if (s >= 1 && performance.now() - lastShow > 700) {
          copyCanvas(r2.domElement, disp); lastShow = performance.now();
          if (!shown) { shown = true; showStill({ canvas: disp, kind: 'view', source: 'pt', nodeId: job.node.id }); }
        }
      });
      if (out === 'cancel' && !shown) { end(job); return; }
      copyCanvas(r2.domElement, disp);
      res = { canvas: disp, kind: 'view', source: 'pt', nodeId: job.node.id, samples: Math.floor(pt.samples || 0) };
      if (out === 'done') toast('ההדמיה של המבט הושלמה ✓', 2600);
    } catch (e) {
      console.warn('[pathtrace] view failed → raster fallback', e);
      if (job.cancel) { end(job); return; }
      dropTracer();
      toast('מנוע ההדמיה המציאותית אינו זמין כאן — מוצג רינדור באיכות גבוהה (AO, דגימת-יתר)', 4200);
      try {
        const cv = R.captureView(camera, phone ? 1.5 : 2);
        res = { canvas: cv, kind: 'view', source: 'raster', nodeId: job.node.id };
      } catch (e2) { env.reportError && env.reportError('הדמיית מבט', e2); }
    }
    if (res && !job.abandon && env.pano.active && env.pano.node === job.node) showStill(res);
    end(job);
  }

  function stop() {
    if (!st.job) return;
    st.job.cancel = true;
    progress('עוצר…', 0);
  }

  /* ================================================================ download */
  function remap(cv, T) {
    if (!T || (T.flipU === 1 && !T.shiftU && !T.flipV)) return cv;
    const W = cv.width, H = cv.height;
    const src = cv.getContext('2d').getImageData(0, 0, W, H).data;
    const o = document.createElement('canvas'); o.width = W; o.height = H;
    const g = o.getContext('2d'); const img = g.createImageData(W, H); const d = img.data;
    for (let y = 0; y < H; y++) {
      const v = 1 - (y + 0.5) / H, v2 = T.flipV ? 1 - v : v, sy = Math.min(H - 1, Math.floor((1 - v2) * H));
      for (let x = 0; x < W; x++) {
        let u = T.flipU * ((x + 0.5) / W) + T.shiftU; u -= Math.floor(u);
        const sx = Math.min(W - 1, Math.floor(u * W)), si = (sy * W + sx) * 4, di = (y * W + x) * 4;
        d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2]; d[di + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return o;
  }
  async function download() {
    const v = st.view; if (!v || !v.canvas) { toast('אין הדמיה להורדה'); return false; }
    try {
      const cv = v.kind === '360' ? remap(v.canvas, v.T) : v.canvas;
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      if (!blob) throw new Error('toBlob failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `eakin-rd-${v.source === 'pt' ? 'photoreal' : 'render'}-${v.kind}-${v.nodeId || 'view'}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('התמונה נשמרה ✓', 2000);
      return true;
    } catch (e) { toast('ההורדה נכשלה'); console.warn(e); return false; }
  }

  /* ================================================================ watcher */
  const update = () => {
    const P = env.pano;
    if (!P || !P.active) { if (st.job || st.view) exitView(); return; }
    if (st.job && P.node !== st.job.node) { exitView(); return; }
    if (st.view) {
      if (P.node && st.view.nodeId && P.node.id !== st.view.nodeId) exitView();
      else if (st.view.camPos && camera.position.distanceToSquared(st.view.camPos) > 0.0025) exitView();
      else if (st.view.kind === 'view' && st.view.quat && camera.quaternion.angleTo(st.view.quat) > 0.02) exitView();
    }
  };
  env.onUpdate && env.onUpdate(update);

  return {
    start360, startView, stop, exitView, download, update,
    get running() { return !!st.job; },
    get viewing() { return st.view ? { kind: st.view.kind, source: st.view.source, nodeId: st.view.nodeId, T: st.view.T } : null; },
    get libState() { return st.lib === undefined ? 'not-loaded' : st.lib ? 'loaded' : 'failed'; },
    cache: st.cache, config: CFG,
    _rasterEquirect: rasterEquirect, _calibrate: calibrate,
  };
}
