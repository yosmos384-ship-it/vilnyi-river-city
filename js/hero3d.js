// Live 3D complex for the hero and the finder "live view". One renderer/scene is shared: the canvas moves into
// whichever host (hero or finder) is on screen, so a phone only ever holds one WebGL context for this.
// If three.js or Agent B's modules are missing/fail, it reports failure and the page keeps its static imagery.
import { BUILDINGS, TOP_FLOOR, floorY, localToWorld, footprintOf } from './data.js?v=3.9';

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
  for (const id of Object.keys(BUILDINGS)) for (const [x, z] of footprintOf(id)) {
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
  // Finder view: a stable framing of the whole selected building (all floors P..10D in view). Choosing a floor only
  // moves the gold band — the camera never jumps; switching building orbits smoothly to the other block.
  // Each block is seen across the shared courtyard from the SSW end, so its long courtyard facade and the wing face the
  // viewer unobstructed (the outer sides are hidden behind Faza I / Faza III from any useful angle).
  const FINDER_AZ = { C3: -2.62, C4: 2.68 };
  const finderCam = { cur: null };
  const fitCache = new Map();
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
      const [envMod, extMod] = await Promise.all([import('./three/environment.js?v=3.9'), import('./three/exterior.js?v=3.9')]);
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
      if (/[?&]debug3d\b/.test(location.search)) window.__vrcHeroDbg = { THREE, scene, camera, complex, renderer, pick: (x, y, t) => pick(x, y, t), FINDER_AZ, fitCache, finderCam };
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
    const [wx, wz] = localToWorld(b, 60, 0);
    return new THREE.Vector3(wx, floorY(f) + 1.5, wz);
  }
  // Distance at which the selected building's box (ground → roof) fits the view at this aspect, with a margin
  function finderFit(b, aspect) {
    const key = b + ':' + aspect.toFixed(3) + ':' + camera.fov;
    if (fitCache.has(key)) return fitCache.get(key);
    const lo = floorCenter(b, 0), box0 = exteriorMod?.floorBandBox?.(b, 0), boxT = exteriorMod?.floorBandBox?.(b, TOP_FLOOR);
    const mn = box0 ? v3(THREE, box0.min) : lo.clone().add(new THREE.Vector3(-64, -2, -24));
    const mx = boxT ? v3(THREE, boxT.max) : lo.clone().add(new THREE.Vector3(64, 38, 24));
    const tgt = mn.clone().add(mx).multiplyScalar(0.5); tgt.y = (mn.y + mx.y) * 0.46;
    const corners = [];
    for (const x of [mn.x, mx.x]) for (const y of [mn.y, mx.y]) for (const z of [mn.z, mx.z]) corners.push(new THREE.Vector3(x, y, z));
    const cam = new THREE.PerspectiveCamera(camera.fov, aspect, 1, 5000);
    const fits = d => {
      {
        const az = FINDER_AZ[b];
        cam.position.set(tgt.x + Math.cos(az) * d, tgt.y + d * 0.36, tgt.z + Math.sin(az) * d); cam.lookAt(tgt); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        for (const c of corners) { const p = c.clone().project(cam); if (Math.abs(p.x) > 0.94 || Math.abs(p.y) > 0.86 || p.z > 1) return false; }
      }
      return true;
    };
    let d = 90; while (d < 900 && !fits(d)) d *= 1.04;
    const out = { tgt, d, h: d * 0.36 };
    fitCache.set(key, out); return out;
  }
  function placeFinderCamera(dt, snap) {
    const { b } = state.sel;
    const aspect = camera.aspect || 1.3;
    const fit = finderFit(b, aspect);
    const goal = { az: FINDER_AZ[b] ?? -2.2, tgt: fit.tgt, d: fit.d, h: fit.h };
    const c = finderCam.cur;
    if (snap || !c) finderCam.cur = { az: goal.az, tgt: goal.tgt.clone(), d: goal.d, h: goal.h };
    else {
      // orbit (angle, distance, target) instead of a straight-line fly, so a building switch glides around the blocks
      const k = 1 - Math.pow(0.02, dt);
      let da = goal.az - c.az; da = Math.atan2(Math.sin(da), Math.cos(da));
      c.az += da * k; c.d += (goal.d - c.d) * k; c.h += (goal.h - c.h) * k; c.tgt.lerp(goal.tgt, k);
    }
    const cur = finderCam.cur;
    const az = cur.az;   // no idle swing: a still image is easier to tap and never "moves under the finger"
    const pos = new THREE.Vector3(cur.tgt.x + Math.cos(az) * cur.d, cur.tgt.y + cur.h, cur.tgt.z + Math.sin(az) * cur.d);
    camGoalPos = pos; camGoalTgt = cur.tgt;
    if (snap) { camera.position.copy(pos); curTgt.copy(cur.tgt); camera.lookAt(curTgt); }
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
      placeFinderCamera(dt);
    }
    const k = state.where === 'hero' ? 1 - Math.pow(0.001, dt * 1.4) : 1;   // finder: placeFinderCamera already eases
    camera.position.lerp(camGoalPos, k); curTgt.lerp(camGoalTgt, k); camera.lookAt(curTgt);
    try { env?.update?.(dt, camera); } catch (e) { /* keep rendering */ }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && ready && !state.paused && state.host) { last = 0; raf = requestAnimationFrame(frame); } }
  function renderOnce() { if (!ready || !state.host) return; resize(true); try { env?.update?.(0.016, camera); } catch (e) {} renderer.render(scene, camera); state.host.classList.add('is-live'); }

  // ---------- host management (which container owns the canvas) ----------
  const io = new IntersectionObserver(entries => {
    for (const e of entries) state.visible.set(e.target, e.isIntersecting && (e.target !== heroHost || heroActive) ? e.intersectionRatio : 0);
    pickHost();
  }, { threshold: [0, 0.05, 0.25, 0.5, 0.75, 1] });
  if (heroHost) io.observe(heroHost);
  if (finderHost) io.observe(finderHost);
  const ro = new ResizeObserver(() => resize());
  let lastSize = [0, 0];

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
      resize(true);
      if (where === 'hero') { complex.highlightFloor?.(state.sel.b, null); complex.hoverFloor?.(null); placeHeroCamera(0, true); }
      else { highlight(state.sel.b, state.sel.f); placeFinderCamera(0, true); }
      requestAnimationFrame(() => host.classList.add('is-live'));
    }
    kick();
  }
  function resize(force = false) {
    if (!ready || !state.host) return;
    const r = state.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    // iOS shows/hides its address bar while scrolling: a height-only change under 120 px is ignored (the canvas is
    // CSS-stretched for that moment) instead of reallocating the drawing buffer and re-framing the camera.
    if (!force && w === lastSize[0] && h !== lastSize[1] && Math.abs(h - lastSize[1]) < 120) return;
    lastSize = [w, h];
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
  // A tap/click raycasts against the real facade meshes of both blocks and turns the hit height into a floor
  // (so what you touch is what you get, at any angle, on every facade and wing). The invisible per-floor pick volumes
  // (exterior.js) are the fallback, and touch also probes a few points around the finger.
  let ray, ndc, facadeList = null, bandList = null;
  const TOUCH_PROBE = [[0, 0], [0, -7], [0, 7], [-7, 0], [7, 0], [0, -14], [0, 14], [-14, 0], [14, 0]];
  function floorFromY(y) {
    for (let f = TOP_FLOOR; f >= 1; f--) if (y >= floorY(f) - 0.3) return f;   // the slab edge belongs to the floor it carries
    return 0;
  }
  function buildingOf(o) { for (let p = o; p; p = p.parent) { const m = /^bldg-(\w+)$/.exec(p.name || ''); if (m) return m[1]; } return null; }
  function pickAt(clientX, clientY) {
    ray = ray || new THREE.Raycaster(); ndc = ndc || new THREE.Vector2();
    const r = renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(facadeList, false)[0];
    if (hit) { const b = buildingOf(hit.object); if (b) return { type: 'floor', building: b, floor: floorFromY(hit.point.y) }; }
    const a = ray.intersectObjects(bandList, false)[0]?.object?.userData?.action;
    return a && a.type === 'floor' ? a : null;
  }
  function pick(clientX, clientY, touch = false) {
    if (!complex?.pickables?.length) return null;
    if (!facadeList) {
      facadeList = [];
      for (const g of Object.values(complex.buildings || {})) g.traverse(o => { if (o.isMesh && !o.name.startsWith('pick-') && o.visible && !/-(frame|hedge|led)$/.test(o.name)) facadeList.push(o); });   // thin mullions are skipped: the glass behind them is hit instead (5× cheaper)
      // underground band (-1) is not a selectable floor here
      bandList = complex.pickables.filter(m => (m.userData?.action?.floor ?? -1) >= 0 && m.userData.action.floor <= TOP_FLOOR);
    }
    for (const [dx, dy] of (touch ? TOUCH_PROBE : [[0, 0]])) { const a = pickAt(clientX + dx, clientY + dy); if (a) return a; }
    return null;
  }
  function highlight(b, f) { try { complex.highlightFloor?.(b, f); } catch (e) { /* optional */ } kick(); }
  function preview(a) {
    const key = a ? a.building + ':' + a.floor : null;
    if (key === state.hoverFloor) return;
    state.hoverFloor = key;
    const same = a && a.building === state.sel.b && a.floor === state.sel.f && state.where === 'finder';
    try { complex.hoverFloor ? complex.hoverFloor(a && !same ? a.building : null, a && !same ? a.floor : null) : (a ? highlight(a.building, a.floor) : restore()); } catch (e) { /* optional */ }
    onState('hover', a);
    kick();
  }
  function restore() { highlight(state.sel.b, state.where === 'finder' ? state.sel.f : null); }
  function bindPointer(c) {
    const SLOP = 10;
    let down = null; let lastMove = 0;
    c.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const touch = e.pointerType !== 'mouse';
      down = { x: e.clientX, y: e.clientY, az: orbit.az, t: performance.now(), moved: 0, id: e.pointerId, touch };
      state.pointerDown = true;
      if (state.where === 'hero') orbit.drag = down;
      if (touch) preview(pick(e.clientX, e.clientY, true));   // finger down: show which floor a tap would choose
    });
    c.addEventListener('pointermove', e => {
      if (down && e.pointerId === down.id) {
        const dx = e.clientX - down.x; down.moved = Math.max(down.moved, Math.hypot(dx, e.clientY - down.y));
        if (down.touch && down.moved > SLOP) preview(null);         // it became a scroll / drag, not a tap
        if (state.where === 'hero' && orbit.drag) { orbit.az = down.az - dx * 0.006; orbit.idleT = 0; kick(); }
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const now = performance.now(); if (now - lastMove < 50) return; lastMove = now;
      const a = pick(e.clientX, e.clientY);
      c.style.cursor = a ? 'pointer' : (state.where === 'hero' ? 'grab' : 'default');
      preview(a);
    });
    const end = (e, cancelled) => {
      if (!down || (e && e.pointerId !== down.id)) return;
      const d = down; down = null; state.pointerDown = false; orbit.drag = null; orbit.idleT = 0;
      const wasTap = !cancelled && d.moved <= SLOP && performance.now() - d.t < 800;
      let a = null;
      if (wasTap) a = pick(e.clientX, e.clientY, d.touch) || (d.touch && state.hoverFloor ? parseKey(state.hoverFloor) : null);
      if (d.touch) preview(null);
      if (a && a.floor >= 0 && a.floor <= TOP_FLOOR) {
        state.sel = { b: a.building, f: a.floor };
        if (state.where === 'finder') highlight(a.building, a.floor);
        onFloor(a.building, a.floor, state.where);
      }
    };
    const parseKey = k => { const [building, f] = k.split(':'); return { type: 'floor', building, floor: +f }; };
    c.addEventListener('pointerup', e => end(e, false));
    c.addEventListener('pointercancel', e => end(e, true));
    c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !down) preview(null); });
    c.addEventListener('contextmenu', e => { if (down?.touch) e.preventDefault(); });
  }

  function disposeGL() {
    try { complex?.dispose?.(); env?.dispose?.(); renderer?.dispose?.(); renderer?.domElement?.remove(); } catch (e) { /* ignore */ }
  }

  return {
    init,
    get ready() { return ready; },
    get failed() { return failed; },
    relayout() { offKey = ''; resize(true); kick(); },  // call after a language (direction) change
    setMode(m) { state.mode = m; try { env?.setMode?.(m); } catch (e) {} kick(); },
    // Finder selection: frame this building/floor and outline it
    focusFloor(b, f) {
      state.sel = { b, f };
      if (!ready) return;
      if (state.where === 'finder') highlight(b, f);
      kick();
    },
    // chip hover (desktop) → lighter preview band on the 3D
    previewFloor(b, f) { if (!ready || state.where !== 'finder') return; try { complex.hoverFloor?.(f == null || (b === state.sel.b && f === state.sel.f) ? null : b, f); } catch (e) {} kick(); },
    highlightUnits(ids) { try { complex?.setUnitHighlight?.(ids && ids.length ? ids : null); } catch (e) {} kick(); },
    pause() { state.paused = true; cancelAnimationFrame(raf); raf = 0; },
    resume() { state.paused = false; kick(); },
    dispose() { this.pause(); io.disconnect(); ro.disconnect(); nearIo?.disconnect(); document.removeEventListener('vrc:hero3d', onHeroEvt); disposeGL(); ready = false; },
  };
}
