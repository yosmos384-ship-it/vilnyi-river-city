// Live 3D complex for the hero and the finder "live view". One renderer/scene is shared: the canvas moves into
// whichever host (hero or finder) is on screen, so a phone only ever holds one WebGL context for this.
// If three.js or Agent B's modules are missing/fail, it reports failure and the page keeps its static imagery.
import { BUILDINGS, FOOTPRINT, TOP_FLOOR, floorY, localToWorld } from './data.js';

const TAU = Math.PI * 2;

function v3(THREE, a) {
  if (!a) return null;
  if (a.isVector3) return a.clone();
  if (Array.isArray(a)) return new THREE.Vector3(a[0], a[1], a[2]);
  if (typeof a.x === 'number') return new THREE.Vector3(a.x, a.y, a.z);
  return null;
}

// Axis-aligned world box of the whole complex from data (used when DEFAULT_VIEW is absent)
function complexBox() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const id of Object.keys(BUILDINGS)) for (const [x, z] of FOOTPRINT) {
    const [wx, wz] = localToWorld(id, x, z); x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
  }
  return { x0, x1, z0, z1, top: floorY(TOP_FLOOR + 1) + 3 };
}

export function createHero3D({ heroHost, finderHost, onFloor = () => {}, onState = () => {}, reducedMotion = false } = {}) {
  let THREE, env, complex, renderer, scene, camera, raf = 0, last = 0, failed = false, ready = false;
  let exteriorMod = null;
  const state = { mode: 'dusk', host: null, where: 'hero', visible: new Map(), paused: false, hoverFloor: null, sel: { b: 'C3', f: 5 } };
  const box = complexBox();
  const center = { x: (box.x0 + box.x1) / 2, z: (box.z0 + box.z1) / 2 };
  const orbit = { az: -2.35, dist: 190, h: 88, target: null, drag: null, idleT: 0, speed: TAU / 260 };
  const finderCam = { az: -2.5, swing: 0 };
  let camGoalPos = null, camGoalTgt = null, curTgt = null;

  // The hero 3D is one slide of the hero slideshow (js/hero-slides.js). It only counts as "on screen" while that slide
  // is active, and the whole engine is only built once it is needed: that slide is reached, or the finder comes near.
  let heroActive = false, needResolve = null;
  const needed = new Promise(r => { needResolve = r; });
  const onHeroEvt = e => {
    heroActive = !!e.detail?.active;
    if (heroActive) needResolve();
    if (ready) { if (!heroActive) state.visible.set(heroHost, 0); else ioSync(); pickHost(); }
  };
  document.addEventListener('vrc:hero3d', onHeroEvt);
  const nearIo = finderHost ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { needResolve(); nearIo.disconnect(); } }, { rootMargin: '900px 0px' }) : null;
  nearIo?.observe(finderHost);
  function ioSync() {
    if (!heroHost) return;
    const r = heroHost.getBoundingClientRect();
    const vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    state.visible.set(heroHost, r.height ? vis / r.height : 0);
  }
  const announce = st => { window.__vrcHero3D = st; document.dispatchEvent(new CustomEvent('vrc:hero3d-state', { detail: st })); };
  announce('created');

  async function init() {
    await needed;
    try {
      if (!window.WebGLRenderingContext) throw new Error('no webgl');
      THREE = await import('three');
      const [envMod, extMod] = await Promise.all([import('./three/environment.js'), import('./three/exterior.js')]);
      exteriorMod = extMod;
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
      if (!renderer.getContext()) throw new Error('webgl context');
      const coarse = matchMedia('(pointer: coarse)').matches;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = !coarse;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.className = 'hero3d-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, 16 / 9, 1, 12000);
      env = envMod.createEnvironment(scene, renderer, { mode: state.mode });
      if (env?.group && !env.group.parent) scene.add(env.group);
      complex = extMod.createComplex({});
      scene.add(complex.group);

      // Starting orbit from the exterior module's preferred view when it provides one
      const dv = extMod.DEFAULT_VIEW;
      const tgt = v3(THREE, dv?.target) || new THREE.Vector3(center.x, 16, center.z);
      const pos = v3(THREE, dv?.position || dv?.camera || dv?.pos);
      orbit.target = tgt;
      if (pos) {
        const dx = pos.x - tgt.x, dz = pos.z - tgt.z;
        orbit.az = Math.atan2(dz, dx); orbit.dist = Math.hypot(dx, dz); orbit.h = pos.y - tgt.y;
      }
      if (dv?.fov) camera.fov = dv.fov;
      curTgt = tgt.clone();
      placeHeroCamera(0, true);
      bindPointer(renderer.domElement);
      ready = true;
      if (heroActive) ioSync();
      pickHost();
      renderOnce();
      onState('ready'); announce('ready');
      return true;
    } catch (e) {
      console.warn('[hero3d] 3D unavailable, using static imagery:', e?.message || e);
      failed = true; onState('failed'); announce('failed'); disposeGL();
      return false;
    }
  }

  // ---------- camera ----------
  function placeHeroCamera(dt, snap) {
    const aspect = camera.aspect || 1.6;
    const fit = aspect < 1 ? 1.55 / aspect : aspect < 1.4 ? 1.25 : 1; // narrow screens need more distance
    const d = orbit.dist * fit, h = orbit.h * Math.min(fit, 1.6);
    const tgt = orbit.target;
    const pos = new THREE.Vector3(tgt.x + Math.cos(orbit.az) * d, tgt.y + h, tgt.z + Math.sin(orbit.az) * d);
    camGoalPos = pos; camGoalTgt = tgt;
    if (snap) { camera.position.copy(pos); curTgt.copy(tgt); camera.lookAt(curTgt); }
  }
  function floorCenter(b, f) {
    try {
      const bb = exteriorMod?.floorBandBox?.(b, f);
      if (bb) {
        const mn = v3(THREE, bb.min), mx = v3(THREE, bb.max);
        if (mn && mx) return mn.add(mx).multiplyScalar(0.5);
      }
    } catch (e) { /* fall through */ }
    const [wx, wz] = localToWorld(b, 50, -10);
    return new THREE.Vector3(wx, floorY(f) + 1.5, wz);
  }
  function placeFinderCamera(dt, snap) {
    const { b, f } = state.sel;
    const tgt = floorCenter(b, f);
    const aspect = camera.aspect || 1.3;
    const d = aspect < 1 ? 185 : 150;
    const az = finderCam.az + Math.sin(finderCam.swing) * 0.32;
    const pos = new THREE.Vector3(tgt.x + Math.cos(az) * d, tgt.y + 34 + Math.max(0, 9 - f) * 1.2, tgt.z + Math.sin(az) * d);
    camGoalPos = pos; camGoalTgt = tgt;
    if (snap) { camera.position.copy(pos); curTgt.copy(tgt); camera.lookAt(curTgt); }
  }

  // ---------- loop ----------
  function frame(now) {
    raf = 0;
    if (!ready || state.paused || !state.host || document.hidden) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    if (state.where === 'hero') {
      if (!orbit.drag) { orbit.idleT += dt; if (!reducedMotion && orbit.idleT > 2.5) orbit.az += orbit.speed * dt; }
      placeHeroCamera(dt);
    } else {
      if (!reducedMotion) finderCam.swing += dt * 0.18;
      placeFinderCamera(dt);
    }
    const k = 1 - Math.pow(0.001, dt * (state.where === 'hero' ? 1.4 : 0.9));
    camera.position.lerp(camGoalPos, k); curTgt.lerp(camGoalTgt, k); camera.lookAt(curTgt);
    try { env?.update?.(dt, camera); } catch (e) { /* keep rendering */ }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && ready && !state.paused && state.host) { last = 0; raf = requestAnimationFrame(frame); } }
  function renderOnce() { if (!ready || !state.host) return; resize(); try { env?.update?.(0.016, camera); } catch (e) {} renderer.render(scene, camera); state.host.classList.add('is-live'); }

  // ---------- host management (which container owns the canvas) ----------
  const io = new IntersectionObserver(entries => {
    for (const e of entries) state.visible.set(e.target, e.isIntersecting && (e.target !== heroHost || heroActive) ? e.intersectionRatio : 0);
    pickHost();
  }, { threshold: [0, 0.05, 0.25, 0.5, 0.75, 1] });
  if (heroHost) io.observe(heroHost);
  if (finderHost) io.observe(finderHost);
  const ro = new ResizeObserver(() => resize());

  function pickHost() {
    if (!ready) return;
    const hv = state.visible.get(heroHost) || 0, fv = state.visible.get(finderHost) || 0;
    let host = null, where = null;
    if (fv > 0 && (fv >= hv || hv < 0.05)) { host = finderHost; where = 'finder'; } else if (hv > 0) { host = heroHost; where = 'hero'; }
    if (!host) { state.host = null; cancelAnimationFrame(raf); raf = 0; return; }
    if (host !== state.host) {
      if (state.host) { ro.unobserve(state.host); state.host.classList.remove('is-live'); }
      state.host = host; state.where = where; offKey = '';
      (host.querySelector('.hero3d-slot') || host).appendChild(renderer.domElement);
      ro.observe(host);
      resize();
      if (where === 'hero') { complex.highlightFloor?.(state.sel.b, null); placeHeroCamera(0, true); }
      else { highlight(state.sel.b, state.sel.f); placeFinderCamera(0, true); }
      requestAnimationFrame(() => host.classList.add('is-live'));
    }
    kick();
  }
  function resize() {
    if (!ready || !state.host) return;
    const r = state.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const c = renderer.domElement;
    if (c.width !== Math.round(w * renderer.getPixelRatio()) || c.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / h;
    }
    applyOffset(w, h);
  }
  // In the hero the headline sits on the reading-start side, so the complex is framed toward the other side
  // (and lower on portrait phones). Off-centre framing via a view offset keeps the orbit maths centred.
  let offKey = '';
  function applyOffset(w, h) {
    const rtl = document.documentElement.dir === 'rtl';
    let ox = 0, oy = 0;
    if (state.where === 'hero') {
      // v1.6: the hero text sits below the image, so the complex is centred, nudged up clear of the slide controls
      oy = w / h > 1.15 ? h * 0.05 : h * 0.13; void rtl;
    }
    const key = [w, h, ox, oy].join();
    if (key === offKey) return; offKey = key;
    if (ox || oy) camera.setViewOffset(w, h, ox, oy, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  // ---------- picking ----------
  let ray, ndc;
  function pick(clientX, clientY) {
    if (!complex?.pickables?.length) return null;
    ray = ray || new THREE.Raycaster(); ndc = ndc || new THREE.Vector2();
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(complex.pickables, false)[0];
    const a = hit?.object?.userData?.action;
    return a && a.type === 'floor' ? a : null;
  }
  function highlight(b, f) { try { complex.highlightFloor?.(b, f); } catch (e) { /* optional */ } }
  function bindPointer(c) {
    let down = null; let lastMove = 0;
    c.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY, az: orbit.az, t: performance.now(), moved: 0 };
      if (state.where === 'hero') orbit.drag = down;
    });
    c.addEventListener('pointermove', e => {
      if (down) {
        const dx = e.clientX - down.x; down.moved = Math.max(down.moved, Math.abs(dx) + Math.abs(e.clientY - down.y));
        if (state.where === 'hero' && orbit.drag) { orbit.az = down.az - dx * 0.006; orbit.idleT = 0; kick(); }
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const now = performance.now(); if (now - lastMove < 60) return; lastMove = now;
      const a = pick(e.clientX, e.clientY);
      const key = a ? a.building + ':' + a.floor : null;
      if (key !== state.hoverFloor) {
        state.hoverFloor = key; c.style.cursor = a ? 'pointer' : 'grab';
        if (a) highlight(a.building, a.floor);
        else if (state.where === 'finder') highlight(state.sel.b, state.sel.f); else highlight(state.sel.b, null);
        onState('hover', a);
      }
    });
    const up = e => {
      if (!down) return;
      const wasClick = down.moved < 7 && performance.now() - down.t < 600;
      down = null; orbit.drag = null; orbit.idleT = 0;
      if (wasClick) {
        const a = pick(e.clientX, e.clientY);
        if (a && a.floor >= 0 && a.floor <= TOP_FLOOR) { state.sel = { b: a.building, f: a.floor }; onFloor(a.building, a.floor); }
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { down = null; orbit.drag = null; });
    c.addEventListener('pointerleave', () => { if (state.hoverFloor) { state.hoverFloor = null; highlight(state.sel.b, state.where === 'finder' ? state.sel.f : null); onState('hover', null); } });
  }

  function disposeGL() {
    try { complex?.dispose?.(); env?.dispose?.(); renderer?.dispose?.(); renderer?.domElement?.remove(); } catch (e) { /* ignore */ }
  }

  return {
    init,
    get ready() { return ready; },
    get failed() { return failed; },
    relayout() { offKey = ''; resize(); kick(); },  // call after a language (direction) change
    setMode(m) { state.mode = m; try { env?.setMode?.(m); } catch (e) {} kick(); },
    // Finder selection: frame this building/floor and outline it
    focusFloor(b, f) {
      state.sel = { b, f };
      if (!ready) return;
      if (state.where === 'finder') highlight(b, f);
      finderCam.az = b === 'C4' ? -2.2 : 2.3; // C4 is seen from its north side, C3 from its south side
      kick();
    },
    highlightUnits(ids) { try { complex?.setUnitHighlight?.(ids && ids.length ? ids : null); } catch (e) {} kick(); },
    pause() { state.paused = true; cancelAnimationFrame(raf); raf = 0; },
    resume() { state.paused = false; kick(); },
    dispose() { this.pause(); io.disconnect(); ro.disconnect(); nearIo?.disconnect(); document.removeEventListener('vrc:hero3d', onHeroEvt); disposeGL(); ready = false; },
  };
}
