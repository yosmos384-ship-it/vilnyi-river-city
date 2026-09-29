// Live 3D complex for the hero and the finder "live view". One renderer/scene is shared: the canvas moves into
// whichever host (hero or finder) is on screen, so a phone only ever holds one WebGL context for this.
// The hero has two views: 'photo' (the photoreal dusk render with a slow Ken-Burns, drawn by CSS) and 'live'
// (the 3D scene). Photo is shown while 3D loads, on low-power devices and whenever the live scene can't hold 24 fps;
// a small segmented toggle lets the visitor switch. If three.js or Agent B's modules fail, the photo simply stays.
import { BUILDINGS, FOOTPRINT, TOP_FLOOR, ROOF_Y, floorY, localToWorld } from './data.js';
import { t, lang, onLangChange } from './i18n.js';

const TAU = Math.PI * 2;
const LIVE_LABEL = { en: 'Live 3D', ro: '3D live', he: 'תלת-ממד חי', ru: 'Живое 3D', uk: 'Живе 3D', fr: '3D en direct', it: '3D dal vivo', de: 'Live-3D' };
const VIEW_KEY = 'vrc.heroView';
const SLOW_KEY = 'vrc.hero3dSlow';
const MIN_FPS = 24;

function v3(THREE, a) {
  if (!a) return null;
  if (a.isVector3) return a.clone();
  if (Array.isArray(a)) return new THREE.Vector3(a[0], a[1], a[2]);
  if (typeof a.x === 'number') return new THREE.Vector3(a.x, a.y, a.z);
  return null;
}
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* blocked */ } }
function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function sread(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function sstore(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } }

// Coarse hardware hint: few cores or little memory → start (and stay) on the photo unless the visitor asks for 3D.
function lowPowerHint() {
  const n = navigator.hardwareConcurrency, m = navigator.deviceMemory;
  return (typeof n === 'number' && n > 0 && n <= 4) || (typeof m === 'number' && m > 0 && m <= 4);
}

// Silhouette points of both buildings (footprint corners at ground and roof) — what the hero camera must frame.
function buildingPoints(extMod) {
  let y0 = 0, y1 = ROOF_Y;
  try {
    const lo = extMod?.floorBandBox?.('C3', 0), hi = extMod?.floorBandBox?.('C3', TOP_FLOOR);
    if (lo && hi) { y0 = lo.min.y; y1 = hi.max.y; }
  } catch (e) { /* data fallback */ }
  y1 += 3.5; // rooftop technical volume
  const pts = [];
  for (const id of Object.keys(BUILDINGS)) for (const [x, z] of FOOTPRINT) {
    const [wx, wz] = localToWorld(id, x, z);
    pts.push([wx, y0, wz], [wx, y1, wz]);
  }
  return pts;
}

// Hero framing per aspect ratio. All values are screen fractions (0 = top/left).
//  horizon: where the horizon line sits; top/bottom: where the buildings' roof and base should land;
//  cx: horizontal centre of the buildings (mirrored in RTL); maxW: widest the buildings may get (overflow allowed
//  on portrait so the towers read big, like the developer's render).
function framing(aspect, rtl) {
  if (aspect < 0.8) return { fov: 40, horizon: 0.2, top: 0.2, bottom: 0.74, cx: 0.5, maxW: 1.5 };
  if (aspect < 1.3) return { fov: 36, horizon: 0.2, top: 0.2, bottom: 0.66, cx: 0.5, maxW: 1.05 };
  return { fov: 30, horizon: 0.17, top: 0.17, bottom: 0.8, cx: rtl ? 0.36 : 0.64, maxW: 0.66 };
}

// Solve a camera position for a fixed heading/pitch so the projected building silhouette hits the target rect.
// Pitch comes from the horizon target: a camera pitched down by p puts the horizon tan(p)/tan(fov/2) above centre.
export function solveHeroCamera(pts, heading, aspect, fr) {
  const tanH = Math.tan((fr.fov * Math.PI) / 360);
  const pitch = Math.atan((1 - 2 * fr.horizon) * tanH);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const f = [cp * Math.cos(heading), -sp, cp * Math.sin(heading)];
  const r = [-Math.sin(heading), 0, Math.cos(heading)];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  let c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c = c.map(v => v / pts.length);
  let D = 220;
  const P = [c[0] - f[0] * D, c[1] - f[1] * D, c[2] - f[2] * D];
  const X0 = (fr.cx * 2 - 1), Ytop = 1 - 2 * fr.top, Ybot = 1 - 2 * fr.bottom;
  for (let it = 0; it < 16; it++) {
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const p of pts) {
      const a0 = p[0] - P[0], a1 = p[1] - P[1], a2 = p[2] - P[2];
      const z = Math.max(1, a0 * f[0] + a1 * f[1] + a2 * f[2]);
      const sx = (a0 * r[0] + a2 * r[2]) / (z * tanH * aspect);
      const sy = (a0 * u[0] + a1 * u[1] + a2 * u[2]) / (z * tanH);
      xmin = Math.min(xmin, sx); xmax = Math.max(xmax, sx); ymin = Math.min(ymin, sy); ymax = Math.max(ymax, sy);
    }
    D = (c[0] - P[0]) * f[0] + (c[1] - P[1]) * f[1] + (c[2] - P[2]) * f[2];
    const s = Math.max((ymax - ymin) / (Ytop - Ybot), (xmax - xmin) / (2 * fr.maxW));
    const dz = D - D * s;
    const dx = ((xmin + xmax) / 2 - X0) * D * s * tanH * aspect;
    const dy = (ymax - Ytop) * D * s * tanH;
    for (let k = 0; k < 3; k++) P[k] += f[k] * dz + r[k] * dx + u[k] * dy;
  }
  P[1] = Math.max(P[1], 12);
  D = (c[0] - P[0]) * f[0] + (c[1] - P[1]) * f[1] + (c[2] - P[2]) * f[2];
  return { pos: P, target: [P[0] + f[0] * D, P[1] + f[1] * D, P[2] + f[2] * D], fov: fr.fov };
}

export function createHero3D({ heroHost, finderHost, onFloor = () => {}, onState = () => {}, reducedMotion = false } = {}) {
  let THREE, env, complex, renderer, scene, camera, raf = 0, last = 0, failed = false, ready = false;
  let exteriorMod = null, heroPts = null, offKey = '';
  const state = { mode: 'dusk', host: null, where: 'hero', visible: new Map(), paused: false, hoverFloor: null, sel: { b: 'C3', f: 5 } };
  const heroSec = heroHost?.closest('.hero') || heroHost?.parentElement || null;

  // ---------- hero view (photo ⇄ live) ----------
  const q = new URLSearchParams(location.search).get('hero');
  const forced = q === 'live' || q === 'photo' ? q : null;          // ?hero=live|photo — for testing / sharing
  const chosen = forced || read(VIEW_KEY);                          // an explicit visitor choice wins over heuristics
  const view = {
    want: chosen === 'live' ? 'live' : chosen === 'photo' ? 'photo' : (lowPowerHint() || sread(SLOW_KEY) ? 'photo' : 'auto'),
    shown: 'photo', explicit: !!chosen, probing: false,
    fps: { t0: 0, n: 0, slowFor: 0, warm: 0 },
  };
  let toggle = null;
  setShown('photo');
  buildToggle();

  function setShown(v) {
    view.shown = v;
    if (heroSec) heroSec.dataset.view = v;
    if (heroHost) heroHost.dataset.view = v;
    if (toggle) for (const b of toggle.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.view === v));
  }
  function buildToggle() {
    const side = heroSec?.querySelector('.hero-side');
    if (!side || side.querySelector('.hero-view')) return;
    toggle = document.createElement('div');
    toggle.className = 'hero-view';
    toggle.setAttribute('role', 'group');
    toggle.innerHTML =
      '<button type="button" data-view="photo" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M3.5 15.5l5-4.5 4 3.5 3-2.5 5 4"/><circle cx="15.5" cy="9.5" r="1.4"/></svg><span></span></button>' +
      '<button type="button" data-view="live" aria-pressed="false"><i class="hv-dot" aria-hidden="true"></i><span></span></button>';
    side.prepend(toggle);
    heroSec.classList.add('has-view-toggle');
    labelToggle();
    toggle.addEventListener('click', e => {
      const b = e.target.closest('[data-view]'); if (!b) return;
      const v = b.dataset.view;
      view.want = v; view.explicit = true; store(VIEW_KEY, v);
      if (v === 'photo') { view.probing = false; setShown('photo'); toggle.classList.remove('is-waiting'); pickHost(); }
      else if (ready) goLive();
      else toggle.classList.add('is-waiting');
    });
  }
  function labelToggle() {
    if (!toggle) return;
    const [p, l] = toggle.querySelectorAll('span');
    p.textContent = t('hero.static');
    l.textContent = LIVE_LABEL[lang] || LIVE_LABEL.en;
    toggle.setAttribute('aria-label', `${t('hero.static')} / ${l.textContent}`);
  }
  // Where the headline block starts (fraction of the hero height) → CSS var used by the portrait readability gradient,
  // so longer copy (e.g. English, stacked buttons) gets its dark fall-off earlier.
  function measureCopy() {
    const c = heroSec?.querySelector('.hero-copy'); if (!c) return;
    const hr = heroSec.getBoundingClientRect(), cr = c.getBoundingClientRect();
    if (hr.height > 0) heroSec.style.setProperty('--hero-copy', ((cr.top - hr.top) / hr.height * 100).toFixed(1) + '%');
  }
  const copyRO = heroSec ? new ResizeObserver(() => measureCopy()) : null;
  if (copyRO) { copyRO.observe(heroSec); const c = heroSec.querySelector('.hero-copy'); if (c) copyRO.observe(c); }
  measureCopy();
  const offLang = onLangChange(() => { labelToggle(); offKey = ''; requestAnimationFrame(measureCopy); });

  function goLive() {
    toggle?.classList.remove('is-waiting');
    view.probing = false; resetFps();
    setShown('live'); pickHost();
    if (state.host === heroHost) heroHost.classList.add('is-live');
  }
  // After 3D is ready: render it invisibly under the photo for a moment and only cross-fade in if it keeps ≥ 24 fps.
  function afterReady() {
    if (view.want === 'live') return goLive();
    if (view.want === 'photo') return;
    view.probing = true; resetFps(); pickHost();
  }
  function resetFps() { view.fps = { t0: 0, n: 0, slowFor: 0, warm: 0 }; }
  function sampleFps(now, dt) {
    const s = view.fps;
    if (s.warm < 0.6) { s.warm += dt; return; }                     // skip shader-compile hitches
    if (!s.t0) { s.t0 = now; s.n = 0; return; }
    s.n++;
    const span = (now - s.t0) / 1000;
    if (span < 1) return;
    const fps = s.n / span; s.t0 = now; s.n = 0;
    if (view.probing) {
      if (fps >= MIN_FPS) goLive(); else { s.slowFor += span; if (s.slowFor >= 2) fallBack(); }
      return;
    }
    if (view.shown === 'live' && !view.explicit) {
      if (fps < MIN_FPS) { s.slowFor += span; if (s.slowFor >= 3) fallBack(); } else s.slowFor = 0;
    }
  }
  function fallBack() {
    view.probing = false; view.want = 'photo'; sstore(SLOW_KEY, '1');
    setShown('photo'); heroHost?.classList.remove('is-live'); pickHost();
  }
  const heroLive = () => view.shown === 'live' || view.probing;

  // ---------- 3D ----------
  const orbit = { heading: 0.34, drift: 0, driftT: 0, user: 0, drag: null, idleT: 0 };
  const finderCam = { az: -2.5, swing: 0 };
  let camGoalPos = null, camGoalTgt = null, curTgt = null;

  async function init() {
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
      camera = new THREE.PerspectiveCamera(36, 16 / 9, 1, 12000);
      env = envMod.createEnvironment(scene, renderer, { mode: state.mode });
      if (env?.group && !env.group.parent) scene.add(env.group);
      complex = extMod.createComplex({});
      scene.add(complex.group);

      // Heading of the exterior module's preferred view (≈ the developer's aerial) is the hero's resting direction
      const dv = extMod.DEFAULT_VIEW;
      const tgt = v3(THREE, dv?.target), pos = v3(THREE, dv?.position || dv?.camera || dv?.pos);
      if (tgt && pos) orbit.heading = Math.atan2(tgt.z - pos.z, tgt.x - pos.x) + 0.15; // a touch north: C4 and the courtyard open up
      heroPts = buildingPoints(extMod);
      curTgt = new THREE.Vector3();
      camGoalPos = new THREE.Vector3(); camGoalTgt = new THREE.Vector3();
      placeHeroCamera(true);
      bindPointer(renderer.domElement);
      ready = true;
      afterReady();
      pickHost();
      renderOnce();
      onState('ready');
      return true;
    } catch (e) {
      console.warn('[hero3d] 3D unavailable, using the still render:', e?.message || e);
      failed = true; heroSec?.classList.add('hero-3d-failed'); setShown('photo');
      onState('failed'); disposeGL();
      return false;
    }
  }

  // ---------- camera ----------
  function placeHeroCamera(snap) {
    const aspect = camera.aspect || 1.6;
    const fr = framing(aspect, document.documentElement.dir === 'rtl');
    const s = solveHeroCamera(heroPts, orbit.heading + orbit.drift + orbit.user, aspect, fr);
    camGoalPos.set(...s.pos); camGoalTgt.set(...s.target);
    if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
    if (snap) { camera.position.copy(camGoalPos); curTgt.copy(camGoalTgt); camera.lookAt(curTgt); }
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
  function placeFinderCamera(snap) {
    const { b, f } = state.sel;
    const tgt = floorCenter(b, f);
    const aspect = camera.aspect || 1.3;
    const d = aspect < 1 ? 185 : 150;
    const az = finderCam.az + Math.sin(finderCam.swing) * 0.32;
    if (camera.fov !== 34) { camera.fov = 34; camera.updateProjectionMatrix(); }
    camGoalPos.set(tgt.x + Math.cos(az) * d, tgt.y + 34 + Math.max(0, 9 - f) * 1.2, tgt.z + Math.sin(az) * d);
    camGoalTgt.copy(tgt);
    if (snap) { camera.position.copy(camGoalPos); curTgt.copy(tgt); camera.lookAt(curTgt); }
  }

  // ---------- loop ----------
  function frame(now) {
    raf = 0;
    if (!ready || state.paused || !state.host || document.hidden) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    if (state.where === 'hero') {
      // Slow cinematic drift: a ±10° sway around the resting heading (≈ 80 s period); a drag adds an offset that eases home.
      if (!orbit.drag) {
        orbit.idleT += dt;
        if (!reducedMotion) { orbit.driftT += dt; orbit.drift = Math.sin(orbit.driftT * TAU / 80) * 0.18; }
        if (orbit.idleT > 6) orbit.user *= Math.pow(0.5, dt / 4);
      }
      placeHeroCamera(false);
      sampleFps(now, dt);
    } else {
      if (!reducedMotion) finderCam.swing += dt * 0.18;
      placeFinderCamera(false);
    }
    const k = 1 - Math.pow(0.001, dt * (state.where === 'hero' ? 1.4 : 0.9));
    camera.position.lerp(camGoalPos, k); curTgt.lerp(camGoalTgt, k); camera.lookAt(curTgt);
    try { env?.update?.(dt, camera); } catch (e) { /* keep rendering */ }
    renderer.render(scene, camera);
    if (state.host) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && ready && !state.paused && state.host) { last = 0; raf = requestAnimationFrame(frame); } }
  function renderOnce() {
    if (!ready || !state.host) return;
    resize(); try { env?.update?.(0.016, camera); } catch (e) {}
    renderer.render(scene, camera);
    if (state.host !== heroHost || view.shown === 'live') state.host.classList.add('is-live');
  }

  // ---------- host management (which container owns the canvas) ----------
  const io = new IntersectionObserver(entries => {
    for (const e of entries) state.visible.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
    pickHost();
  }, { threshold: [0, 0.05, 0.25, 0.5, 0.75, 1] });
  if (heroHost) io.observe(heroHost);
  if (finderHost) io.observe(finderHost);
  const ro = new ResizeObserver(() => resize());

  function pickHost() {
    if (!ready) return;
    const hv = heroLive() ? (state.visible.get(heroHost) || 0) : 0, fv = state.visible.get(finderHost) || 0;
    let host = null, where = null;
    if (fv > 0 && (fv >= hv || hv < 0.05)) { host = finderHost; where = 'finder'; } else if (hv > 0) { host = heroHost; where = 'hero'; }
    if (host !== state.host && state.host) { ro.unobserve(state.host); state.host.classList.remove('is-live'); }
    if (!host) { state.host = null; cancelAnimationFrame(raf); raf = 0; renderer.domElement.remove(); return; }
    if (host !== state.host) {
      state.host = host; state.where = where; offKey = '';
      (host.querySelector('.hero3d-slot') || host).appendChild(renderer.domElement);
      ro.observe(host);
      resize();
      if (where === 'hero') { highlight(state.sel.b, null); placeHeroCamera(true); resetFps(); }
      else { highlight(state.sel.b, state.sel.f); placeFinderCamera(true); }
      requestAnimationFrame(() => { if (state.host === host && (where === 'finder' || view.shown === 'live')) host.classList.add('is-live'); });
    }
    kick();
  }
  function resize() {
    if (!ready || !state.host) return;
    const r = state.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const c = renderer.domElement;
    if (c.width !== Math.round(w * renderer.getPixelRatio()) || c.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const key = [w, h, state.where, document.documentElement.dir].join();
    if (key !== offKey) {
      offKey = key; camera.clearViewOffset(); camera.updateProjectionMatrix();
      if (state.where === 'hero' && heroPts) placeHeroCamera(true);
    }
  }
  const onVis = () => { if (!document.hidden) { resetFps(); kick(); } };
  document.addEventListener('visibilitychange', onVis);

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
      down = { x: e.clientX, y: e.clientY, user: orbit.user, t: performance.now(), moved: 0 };
      if (state.where === 'hero') orbit.drag = down;
    });
    c.addEventListener('pointermove', e => {
      if (down) {
        const dx = e.clientX - down.x; down.moved = Math.max(down.moved, Math.abs(dx) + Math.abs(e.clientY - down.y));
        if (state.where === 'hero' && orbit.drag) { orbit.user = Math.max(-1.2, Math.min(1.2, down.user - dx * 0.004)); orbit.idleT = 0; kick(); }
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
    get heroView() { return view.shown; },
    relayout() { offKey = ''; labelToggle(); measureCopy(); resize(); kick(); },  // call after a language (direction) change
    setHeroView(v) { toggle?.querySelector(`[data-view="${v}"]`)?.click(); },
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
    dispose() {
      this.pause(); io.disconnect(); ro.disconnect(); copyRO?.disconnect(); offLang?.(); document.removeEventListener('visibilitychange', onVis);
      toggle?.remove(); heroSec?.classList.remove('has-view-toggle'); disposeGL(); ready = false;
    },
  };
}
