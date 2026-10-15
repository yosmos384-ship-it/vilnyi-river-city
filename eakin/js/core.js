// core.js — renderer, sky/lights/env, ctx contract, module loading, player, interaction, modes, UI.
// Owner: CORE. Import has no side effects; index.html calls boot().
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import plan from './plan.js';
import { easings, createTweener, createAudio, scanSound, createParticles, createScanner, createMeasure } from './core-fx.js';
import { createWorld, createPlayer } from './core-player.js';
import { createPano } from './core-pano.js';
import { createNav } from './core-nav.js'; // V2 nav: arrows, floor cursor, glide, double-click walk, click-navigation mode
import { createMinimap, toastFn, FLOOR_HE, defaultFov, createZoom, createDpad, createRadioUI, createStyleUI, setupCompactUI, installGuards } from './core-ui.js'; // V3 UI
import { createRadio } from './radio-engine.js'; // V3 UI: shared 6-station radio (UI chip/panel + 3D radio in the living room)
import { createRender } from './core-render.js'; // V2: postFX, window lights, room reflection probes, mirrors
import { createPathTrace } from './core-pathtrace.js'; // V2: "הדמיה מציאותית" (path-traced 360 / view, raster fallback)
import { createStyles } from './styles.js'; // V3 STYLE: 3 renovation options (window.__tour.styles / ctx.styles)

const $ = (id) => document.getElementById(id);
const FLOOR_IDX = { basement: 0, main: 1, upper: 2, roof: 3 };
const UP = new THREE.Vector3(0, 1, 0);
const HOUSE_C = new THREE.Vector3(plan.W / 2, 1.0, plan.D / 2);
// camera yaw convention (core): rotation.y; yaw 0 looks toward -z (toward the house from the street)
const START = { p: [6.05, 1.6, 19.5], yaw: 0 };
const MODULES = [
  { id: 'house', file: './house.js', he: 'מבנה הבית' },
  { id: 'interior', file: './interior.js', he: 'פנים, מטבח ורהיטים' },
  { id: 'exterior', file: './exterior.js', he: 'חצר, רחוב ושכנים' },
];

function store(k, v) { try { if (v === undefined) return localStorage.getItem('eakin_' + k); localStorage.setItem('eakin_' + k, v); } catch (_) { return null; } return null; }

export async function boot() {
  /* ================================================================ platform / quality */
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (('ontouchstart' in window) && navigator.maxTouchPoints > 0);
  const isPhone = isTouch && Math.min(screen.width || 1000, screen.height || 1000) < 820;
  let quality = store('q') === 'low' || store('q') === 'high' ? store('q') : (isPhone ? 'low' : 'high');
  const basePR = () => Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.5 : 2);
  document.body.classList.toggle('touch', !!isTouch);

  /* ================================================================ errors */
  const errors = [];
  function reportError(where, err) {
    const msg = (err && (err.message || err.toString())) || String(err);
    console.error('[tour]', where, err);
    if (errors.length > 12) return;
    errors.push({ where, msg });
    const list = $('errorsList');
    if (list) {
      const li = document.createElement('li');
      li.innerHTML = '<b></b><span></span>';
      li.querySelector('b').textContent = where;
      li.querySelector('span').textContent = msg;
      list.appendChild(li);
    }
    document.body.classList.add('has-errors');
    if ($('errors') && !document.body.classList.contains('loading')) showErrors();
  }
  let errT = 0;
  function showErrors() {
    $('errors').classList.add('show');
    clearTimeout(errT); errT = setTimeout(() => $('errors').classList.remove('show'), 12000);
  }
  window.addEventListener('error', (e) => { if (e && e.error) reportError('שגיאת זמן ריצה', e.error); });
  window.addEventListener('unhandledrejection', (e) => reportError('שגיאה אסינכרונית', e.reason));
  $('errorsClose') && $('errorsClose').addEventListener('click', () => $('errors').classList.remove('show'));

  /* ================================================================ renderer */
  const stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(basePR());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0; // V3 LOOK: core-render owns exposure (TOD.exp × small indoor lift, clamped 0.6–1.1)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // shadows are re-rendered on demand (see shadow scheduling in frame()), not every frame
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.domElement.id = 'gl';
  renderer.domElement.setAttribute('tabindex', '0');
  stage.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd6cfc2, 70, 320);
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 2000);
  camera.userData.__core = true;
  camera.rotation.order = 'YXZ';
  camera.position.set(HOUSE_C.x + 34, 26, HOUSE_C.z + 40);
  camera.lookAt(HOUSE_C);
  scene.add(camera);
  const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 120);
  ortho.up.set(0, 0, -1);
  ortho.userData.__core = true;
  let activeCam = camera;

  /* ================================================================ sky / lights / env */
  const sky = new Sky();
  sky.scale.setScalar(1000);
  sky.userData.__core = true;
  sky.frustumCulled = false;
  scene.add(sky);
  const skyU = sky.material.uniforms;

  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6d5c48, 0.85);
  hemi.userData.__core = true;
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe0b5, 3.2);
  sun.userData.__core = true;
  sun.castShadow = true;
  const shadowSize = () => (quality === 'high' ? 4096 : 1024); // V2: 4096 sun shadow on high (bias tuned in core-render)
  sun.shadow.mapSize.set(shadowSize(), shadowSize());
  const sc = sun.shadow.camera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 170;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  scene.add(sun); scene.add(sun.target);
  sun.target.userData.__core = true;

  // flashlight (always counted as a visible light; toggled by intensity)
  const flash = new THREE.SpotLight(0xfff1dc, 0, 22, 0.42, 0.55, 1.6);
  flash.position.set(0.18, -0.12, 0.05);
  flash.target.position.set(0.05, -0.15, -4);
  camera.add(flash); camera.add(flash.target);
  let flashOn = false;

  // stars
  const stars = (() => {
    const N = 1400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random(), v = Math.random() * 0.92 + 0.08;
      const th = u * Math.PI * 2, ph = Math.acos(v);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 900; pos[i * 3 + 1] = Math.cos(ph) * 900; pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 900;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const p = new THREE.Points(g, m); p.userData.__core = true; p.frustumCulled = false; p.visible = false; p.renderOrder = -1;
    scene.add(p); return p;
  })();

  let envTex = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(renderer);
    envTex = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envTex;
    if (room.dispose) room.dispose();
    pmrem.dispose();
  } catch (e) { reportError('סביבת תאורה', e); }

  /* ================================================================ time of day */
  const C = (h) => new THREE.Color(h);
  const TOD = {
    // V3 LOOK: ONE exposure per time of day (day 1.0 / evening 0.85 / night 0.75; core-render adds ≤ 6 % indoors and
    // clamps 0.6–1.1). Sun = key, sky env (core-render sky dome PMREM) = fill; the HemisphereLight is only a small
    // unoccluded bounce term (core-render scales it ×0.45 while the camera is inside). envK is unused since V3
    // (core-render applyEnv() sets every material's envMapIntensity from its zone).
    day: { skyEl: 24, az: -50, lightEl: 24, sunI: 3.6, sunC: C(0xfff0dc), hemiI: 0.35, hemiSky: C(0xd6e6ff), hemiGround: C(0x75644f), exp: 1.0, turb: 3.6, ray: 1.15, mie: 0.0032, mieG: 0.8, fog: C(0xd9d6cf), envK: 1.0, stars: 0, night: 0 },
    evening: { skyEl: 4, az: -62, lightEl: 7, sunI: 1.7, sunC: C(0xff9a5a), hemiI: 0.16, hemiSky: C(0xa596c4), hemiGround: C(0x3d2e26), exp: 0.85, turb: 8, ray: 2.5, mie: 0.007, mieG: 0.88, fog: C(0xb08a74), envK: 0.5, stars: 0.12, night: 0.55 },
    night: { skyEl: -14, az: -62, lightEl: 38, sunI: 0.22, sunC: C(0x93acff), hemiI: 0.04, hemiSky: C(0x283a6a), hemiGround: C(0x0b0b10), exp: 0.75, turb: 2, ray: 0.6, mie: 0.002, mieG: 0.8, fog: C(0x0a0f1c), envK: 0.1, stars: 1, night: 1 },
  };
  let todName = 'day';
  const todCur = { ...TOD.day, sunC: TOD.day.sunC.clone(), hemiSky: TOD.day.hemiSky.clone(), hemiGround: TOD.day.hemiGround.clone(), fog: TOD.day.fog.clone() };
  let todAnim = null;
  const lightDir = new THREE.Vector3();
  const dirFrom = (elDeg, azDeg, out) => {
    const el = THREE.MathUtils.degToRad(elDeg), az = THREE.MathUtils.degToRad(azDeg);
    return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  };
  const skyDir = new THREE.Vector3();
  function applyTOD(p) {
    dirFrom(p.skyEl, p.az, skyDir);
    skyU.sunPosition.value.copy(skyDir);
    skyU.turbidity.value = p.turb; skyU.rayleigh.value = p.ray; skyU.mieCoefficient.value = p.mie; skyU.mieDirectionalG.value = p.mieG;
    dirFrom(p.lightEl, p.az, lightDir);
    sun.intensity = p.sunI; sun.color.copy(p.sunC);
    hemi.intensity = p.hemiI; hemi.color.copy(p.hemiSky); hemi.groundColor.copy(p.hemiGround);
    renderer.toneMappingExposure = p.exp;
    scene.fog.color.copy(p.fog);
    stars.material.opacity = p.stars; stars.visible = p.stars > 0.01;
  }
  let envKApplied = -1;
  // V3 LOOK: env intensity is owned by core-render.applyEnv() (zones: room probe / interior fill / exterior sky; fill
  // scales with time of day). This wrapper keeps the old call sites (TOD animation, after build).
  function applyEnvK(k, force) {
    if (!force && Math.abs(k - envKApplied) < 0.02) return;
    envKApplied = k;
    try { if (typeof render !== 'undefined' && render && render.applyEnv) render.applyEnv(); } catch (_) {}
  }
  function setTOD(name, instant) {
    if (!TOD[name]) return;
    todName = name;
    for (const b of document.querySelectorAll('[data-tod]')) b.classList.toggle('on', b.dataset.tod === name);
    const from = { ...todCur, sunC: todCur.sunC.clone(), hemiSky: todCur.hemiSky.clone(), hemiGround: todCur.hemiGround.clone(), fog: todCur.fog.clone() };
    todAnim = { from, to: TOD[name], t: instant ? 1.6 : 0, dur: 1.6, lastEnv: 0 };
    for (const L of lamps) L.handle.set(name !== 'day');
    lampsDirty = true;
    renderer.shadowMap.needsUpdate = true;
    store('tod', name);
  }
  function updateTOD(dt) {
    if (!todAnim) return;
    todAnim.t += dt;
    const k = easings.inOutSine(Math.min(1, todAnim.t / todAnim.dur));
    const a = todAnim.from, b = todAnim.to;
    for (const key of Object.keys(b)) {
      if (b[key] && b[key].isColor) todCur[key].copy(a[key]).lerp(b[key], k);
      else todCur[key] = a[key] + (b[key] - a[key]) * k;
    }
    applyTOD(todCur);
    todAnim.lastEnv += dt;
    if (todAnim.lastEnv > 0.3 || k >= 1) { todAnim.lastEnv = 0; applyEnvK(todCur.envK); }
    renderer.shadowMap.needsUpdate = true; // sun direction / intensity changing
    if (k >= 1) todAnim = null;
  }
  applyTOD(todCur);

  /* ================================================================ core systems */
  const tweener = createTweener();
  const audio = createAudio(() => activeCam);
  const world = createWorld();
  const toast = toastFn($('toast'));
  // V3 UI: radio engine — a random station starts on the first user gesture (browsers block audio before one);
  // non-positional background mix everywhere + louder / panned near the 3D radio (it registers itself as the source)
  const radio = createRadio(audio);
  try { radio.probe(); } catch (_) {} // V5: can this page play real US streams (own host) or is external media blocked (artifact CSP)?
  radio.setListener(() => { const p = activeCam.position; return { x: p.x, y: p.y, z: p.z, yaw: activeCam === camera ? camera.rotation.y : NaN }; });
  const guards = installGuards({ audio, onFirstGesture: () => radio.autostart() });

  function floorAt(x, y, z) { // y = feet height
    const inFoot = x >= -0.05 && x <= plan.W + 0.05 && z >= -0.05 && z <= plan.D + 0.05;
    if (y < plan.mainFloor - 0.45 && (inFoot || y < -0.8)) return 'basement';
    if (!inFoot) return 'outside';
    if (y > plan.upperFloor - 0.4) return 'upper';
    return 'main';
  }
  // first solid surface below a point (basin / tub / floor) — used as default water floorY
  const _pr = new THREE.Raycaster(), _pb = new THREE.Box3();
  function probeDown(origin) {
    const list = [];
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible || (o.userData && o.userData.__core) || !o.geometry) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || (m.transparent && m.opacity < 0.5) || m.transmission > 0.5) return;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingBox) return;
      _pb.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
      if (origin.x < _pb.min.x || origin.x > _pb.max.x || origin.z < _pb.min.z || origin.z > _pb.max.z || _pb.min.y > origin.y) return;
      list.push(o);
    });
    if (!list.length) return null;
    _pr.set(new THREE.Vector3(origin.x, origin.y - 0.03, origin.z), new THREE.Vector3(0, -1, 0));
    _pr.near = 0; _pr.far = 4;
    const hits = _pr.intersectObjects(list, false);
    return hits.length ? hits[0].point.y : null;
  }
  const particles = createParticles(scene, floorAt, probeDown);
  const scanner = createScanner(scene, plan);
  const measure = createMeasure(scene, $('labels'));

  /* ---------------- rooms */
  const heOfKey = {};
  const roomsPlan = [];
  const YR = { basement: [plan.basementFloor - 0.2, plan.mainFloor - 0.15], main: [plan.mainFloor - 0.15, plan.upperFloor - 0.1], upper: [plan.upperFloor - 0.1, 8] };
  for (const fl of ['main', 'upper', 'basement']) {
    const rs = (plan.rooms && plan.rooms[fl]) || {};
    for (const [k, rm] of Object.entries(rs)) {
      heOfKey[k] = rm.he;
      const [x0, z0, x1, z1] = rm.r;
      roomsPlan.push({ key: k, name: rm.he, floor: fl, box: new THREE.Box3(new THREE.Vector3(x0, YR[fl][0], z0), new THREE.Vector3(x1, YR[fl][1], z1)), vol: (x1 - x0) * (z1 - z0) });
    }
  }
  roomsPlan.sort((a, b) => a.vol - b.vol);
  const roomsReg = [];
  const _rp = new THREE.Vector3();
  function roomAt(x, feet, z) {
    _rp.set(x, feet + 0.8, z);
    for (const r of roomsReg) if (r.box.containsPoint(_rp)) return r;
    for (const r of roomsPlan) if (r.box.containsPoint(_rp)) return r;
    return null;
  }
  const sameRoom = (a, b) => a && b && (a === b || heOfKey[a] === b || heOfKey[b] === a || heOfKey[a] === heOfKey[b] && heOfKey[a] !== undefined);

  /* ---------------- panos */
  const panoNodes = [];
  function addPano(name, position, lookYawRad = 0, opts = {}) {
    try {
      const p = Array.isArray(position) ? new THREE.Vector3(position[0], position[1], position[2]) : new THREE.Vector3().copy(position);
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) return null;
      const fromPlan = (plan.panos || []).find((n) => n.id === name);
      const he = opts.he || (fromPlan && fromPlan.he) || heOfKey[name] || String(name);
      const floor = opts.floor || floorAt(p.x, p.y - 1.6, p.z);
      const floorY = p.y - 1.6;
      // pano heading convention (matches plan.panos): look direction = (sin yaw, 0, cos yaw)  →  camera rotation.y = yaw + π
      const node = { id: String(name), he, p, yaw: lookYawRad || 0, camYaw: (lookYawRad || 0) + Math.PI, floor, floorY };
      const i = panoNodes.findIndex((n) => n.id === node.id);
      if (i >= 0) panoNodes[i] = node; else panoNodes.push(node);
      return node;
    } catch (e) { return null; }
  }
  for (const n of plan.panos || []) addPano(n.id, n.p, n.yaw, { he: n.he });

  /* ---------------- lamps */
  const lamps = [];
  let lampsDirty = true;
  const MAXL = () => (quality === 'high' ? { p: 12, s: 4 } : { p: 6, s: 2 });
  const LAMP_2700K = new THREE.Color(0xffb46b); // V3 LOOK: ~2700 K incandescent / warm LED
  const padPoint = [], padSpot = [];
  for (let i = 0; i < 12; i++) { const l = new THREE.PointLight(0xffffff, 0, 1, 2); l.position.set(0, -500, 0); l.visible = false; l.userData.__core = true; scene.add(l); padPoint.push(l); }
  for (let i = 0; i < 4; i++) { const l = new THREE.SpotLight(0xffffff, 0, 1); l.position.set(0, -500, 0); l.visible = false; l.userData.__core = true; scene.add(l); padSpot.push(l); }
  function addLamp(light, opts = {}) {
    if (!light || !light.isLight) return { on: false, set() {}, toggle() {} };
    light.castShadow = false;
    // V3 LOOK: physically plausible lamp budget (r160 physical units, candela, decay 2) for an exposure of ~0.75 at
    // night. Module values (recessed stand-ins up to 40 cd hanging 0.35 m under the ceiling, lamps 14–30 cd) blew the
    // walls/ceiling to white: a white wall 2 m from 40 cd has radiance ≈ 2.4 (≈ 4× paper-white). Recessed stand-ins
    // (house.js, userData.baseIntensity) ×0.22 and lowered 0.55 m (no hot ceiling), other lamps ×0.3; 1.2–9 cd
    // (spots ≤ 14). Interior lamps are pulled to warm 2700 K.
    const raw = light.intensity > 0 ? light.intensity : (light.isSpotLight ? 20 : 8);
    const fl0 = opts.floor || (light.userData && light.userData.floor) || '';
    const recessed = !!(light.isPointLight && light.userData && light.userData.baseIntensity !== undefined && (fl0 === 'main' || fl0 === 'upper'));
    const base = Math.min(light.isSpotLight ? 14 : 9, Math.max(1.2, raw * (recessed ? 0.22 : light.isSpotLight ? 0.35 : 0.3)));
    try {
      if (recessed && !light.userData.__lookLowered) { light.position.y -= 0.55; light.userData.__lookLowered = true; }
      if (fl0 !== 'outside' && light.color) light.color.lerp(LAMP_2700K, 0.6);
      light.userData.lookBase = base; light.userData.lookRaw = raw;
    } catch (_) {}
    const L = { light, room: opts.room || '', floor: opts.floor || null, optFloor: opts.floor || null, base, on: false, fx: [] };
    if (opts.fixture) {
      try {
        opts.fixture.traverse((m) => {
          if (!m.isMesh || !m.material) return;
          const arr = Array.isArray(m.material) ? m.material : [m.material];
          const cl = arr.map((mt) => {
            if (!mt.emissive) return mt;
            const c = mt.clone();
            const fb = Math.min(3.0, mt.emissiveIntensity > 0 ? mt.emissiveIntensity : 2.0); // V3 LOOK: lens/bulb glow ≤ 3
            if (c.emissive.r + c.emissive.g + c.emissive.b < 0.01) c.emissive.copy(light.color || new THREE.Color(0xfff2d8));
            L.fx.push({ m: c, base: fb });
            return c;
          });
          m.material = Array.isArray(m.material) ? cl : cl[0];
        });
      } catch (_) {}
    }
    const apply = () => {
      light.intensity = L.on ? L.base : 0;
      for (const f of L.fx) f.m.emissiveIntensity = L.on ? f.base : 0;
    };
    const handle = {
      get on() { return L.on; },
      set on(v) { handle.set(v); },
      set(v) { L.on = !!v; apply(); lampsDirty = true; },
      toggle() { handle.set(!L.on); return L.on; },
      light, get room() { return L.room; },
    };
    L.handle = handle;
    lamps.push(L);
    L.on = todName !== 'day'; apply();
    lampsDirty = true;
    return handle;
  }
  function lampsInRoom(roomName) { return lamps.filter((L) => sameRoom(L.room, roomName)).map((L) => L.handle); }
  const _lp = new THREE.Vector3();
  function manageLamps() {
    lampsDirty = false;
    const max = MAXL();
    const curFloor = playerFloor();
    activeCam.getWorldPosition(_lp);
    const scored = [];
    for (const L of lamps) {
      if (!L.floor) { try { const w = L.light.getWorldPosition(new THREE.Vector3()); L.floor = floorAt(w.x, w.y - 1.5, w.z); L.pos = w; } catch (_) { L.floor = 'main'; } }
      if (!L.pos) { L.pos = new THREE.Vector3(); }
      L.light.getWorldPosition(L.pos);
      if (quality === 'low' && L.floor !== curFloor) { L.score = Infinity; continue; }
      L.score = (L.on ? 0 : 1000) + L.pos.distanceTo(_lp) + (L.floor !== curFloor ? 25 : 0);
      scored.push(L);
    }
    scored.sort((a, b) => a.score - b.score);
    let np = 0, ns = 0;
    const pick = new Set();
    for (const L of scored) {
      if (L.light.isSpotLight) { if (ns < max.s) { ns++; pick.add(L); } }
      else if (np < max.p) { np++; pick.add(L); }
    }
    for (const L of lamps) L.light.visible = pick.has(L);
    const totalP = Math.min(max.p, lamps.filter((L) => !L.light.isSpotLight).length);
    const totalS = Math.min(max.s, lamps.filter((L) => L.light.isSpotLight).length);
    // pad so the visible light count stays constant (no shader recompiles when switching floors)
    for (let i = 0; i < padPoint.length; i++) padPoint[i].visible = i < totalP - np;
    for (let i = 0; i < padSpot.length; i++) padSpot[i].visible = i < totalS - ns;
  }

  /* ---------------- interactives */
  const interactives = [];
  const interMap = new Map();
  let interObjs = [];
  let interDirty = true;
  function addInteractive(obj, opts = {}) {
    if (!obj) return null;
    const e = { obj, label: opts.label, onUse: opts.onUse, hint: opts.hint, enabled: true };
    interactives.push(e); interMap.set(obj, e); interDirty = true;
    return {
      get enabled() { return e.enabled; }, set enabled(v) { e.enabled = !!v; interDirty = true; },
      remove() { const i = interactives.indexOf(e); if (i >= 0) interactives.splice(i, 1); interMap.delete(obj); interDirty = true; },
    };
  }

  /* ---------------- update hooks */
  const updaters = [];
  function onUpdate(fn) {
    if (typeof fn !== 'function') return () => {};
    const u = { fn, errs: 0 };
    updaters.push(u);
    return () => { const i = updaters.indexOf(u); if (i >= 0) updaters.splice(i, 1); };
  }

  /* ================================================================ V2 render (postFX / window lights / probes / mirrors) */
  const render = createRender({
    renderer, scene, camera, plan, sun,
    hemi, sky, roomEnv: envTex, // V3 LOOK: hemi scaled indoors, Sky swapped for a sky dome in probe captures, room fill env
    isViewFiltered: () => faded.size > 0, // V3 LOOK: no probe captures while dollhouse fade clones are active
    getQuality: () => quality, getMode: () => mode,
    getTod: () => ({ name: todName, exp: todCur.exp, night: todCur.night, hemiI: todCur.hemiI, animating: !!todAnim }),
    isTouch, toast: (m, ms) => toast(m, ms), reportError,
    isInteractive: (o) => interMap.has(o),
  });

  /* ================================================================ ctx */
  const ctx = {
    THREE, scene, renderer, camera, plan, quality,
    materials: {},
    envMap: envTex,
    addCollider(box3) { return world.addBox(box3); },
    addColliderFromObject(obj) { return world.addFromObject(obj); },
    addDynamicCollider(obj) { return world.addDynamic(obj); },
    addWalkable(mesh) { world.addWalkable(mesh); },
    addInteractive,
    onUpdate,
    tween: tweener.tween,
    easings,
    audio,
    registerRoom(name, o = {}) {
      if (!name || !o.box || !o.box.isBox3) return;
      const disp = o.he || o.label || heOfKey[name] || String(name);
      if (o.he && !heOfKey[name]) heOfKey[name] = o.he;
      const fl = o.floor || floorAt((o.box.min.x + o.box.max.x) / 2, o.box.min.y, (o.box.min.z + o.box.max.z) / 2);
      const s = new THREE.Vector3(); o.box.getSize(s);
      roomsReg.push({ key: name, name: disp, floor: fl, box: o.box.clone(), vol: s.x * s.y * s.z });
      roomsReg.sort((a, b) => a.vol - b.vol);
    },
    addPano(name, position, lookYawRad, opts) { const n = addPano(name, position, lookYawRad, opts); if (pano && pano.active) pano.rebuildList(); return n; },
    addLamp, lampsInRoom,
    particles,
    isTouch,
    floorAt,
    toast: (m) => toast(m),
    get mode() { return mode; },
    // 0 = day … 0.55 = evening … 1 = night; eased with the יום/ערב/לילה toggle (read each frame by exterior.js)
    timeOfDay: () => todCur.night,
    // V2: bathroom mirror → Object3D (plane in local XY, reflective face +Z). Reflector on high (max 2), else polished chrome.
    makeMirror: (w, h, o) => render.makeMirror(w, h, o),
  };

  /* ================================================================ player */
  const player = createPlayer({ camera, world, start: START });
  player.teleport(START.p, START.yaw);
  camera.position.set(HOUSE_C.x + 34, 26, HOUSE_C.z + 40); camera.lookAt(HOUSE_C);
  function playerFloor() {
    if (mode === 'pano' && pano.node) return pano.node.floor;
    const s = player.state;
    const r = roomAt(s.x, s.feet, s.z);
    return r ? r.floor : floorAt(s.x, s.feet, s.z);
  }

  /* ================================================================ orbit (dollhouse) */
  const orbit = new OrbitControls(camera, canvas);
  orbit.enabled = false;
  orbit.enableDamping = true; orbit.dampingFactor = 0.08;
  orbit.minDistance = 5; orbit.maxDistance = 70;
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.target.copy(HOUSE_C);
  orbit.autoRotateSpeed = 0.55;
  orbit.addEventListener('start', () => { orbit.autoRotate = false; });
  let lastDollPos = new THREE.Vector3(HOUSE_C.x + 13.5, 12.5, HOUSE_C.z + 16.5);

  /* ================================================================ view filters (dollhouse / plan) */
  const hiddenLayers = new Map();
  const faded = new Map();
  let viewFloor = 'all';
  let planFloor = 'main';
  let fadeFront = false;
  function hideSubtree(o) {
    o.traverse((c) => {
      if (c.isLight || (c.userData && c.userData.__core)) return;
      if (!hiddenLayers.has(c)) { hiddenLayers.set(c, c.layers.mask); c.layers.set(31); }
    });
  }
  function fadeSubtree(o) {
    o.traverse((m) => {
      if (!m.isMesh || faded.has(m) || hiddenLayers.has(m)) return;
      const orig = m.material;
      const arr = Array.isArray(orig) ? orig : [orig];
      const cl = arr.map((mt) => { const c = mt.clone(); c.transparent = true; c.opacity = Math.min(c.opacity, 0.22); c.depthWrite = false; return c; });
      const now = Array.isArray(orig) ? cl : cl[0];
      m.material = now;
      faded.set(m, { orig, now, cl });
    });
  }
  function restoreView() {
    for (const [o, mask] of hiddenLayers) o.layers.mask = mask;
    hiddenLayers.clear();
    for (const [m, f] of faded) { if (m.material === f.now) m.material = f.orig; for (const c of f.cl) c.dispose(); }
    faded.clear();
  }
  function applyView(kind, sel) {
    restoreView();
    const rec = (o, inh) => {
      if (o.userData && o.userData.__core) return;
      const fl = (o.userData && o.userData.floor) || inh;
      let hide = !!(o.userData && o.userData.ceiling) || fl === 'roof';
      if (!hide && sel !== 'all' && fl && fl !== 'outside' && FLOOR_IDX[fl] > FLOOR_IDX[sel]) hide = true;
      if (!hide && sel === 'basement' && fl === 'outside') hide = true;
      if (hide) { hideSubtree(o); return; }
      if (kind === 'dollhouse' && fadeFront && o.userData && o.userData.extSkin) { fadeSubtree(o); }
      for (const c of o.children) rec(c, fl);
    };
    for (const c of scene.children.slice()) rec(c, null);
  }

  /* ================================================================ fade / fly */
  const fadeEl = $('fade');
  function fade(op, ms = 300) {
    return new Promise((res) => {
      if (!fadeEl) return res();
      fadeEl.style.transition = `opacity ${ms}ms ease`;
      requestAnimationFrame(() => { fadeEl.style.opacity = String(op); });
      setTimeout(res, ms + 20);
    });
  }
  let fly = null;
  function flyTo(pos, quat, dur = 1.4, fov) {
    if (fly) fly.res();
    return new Promise((res) => {
      fly = { fp: camera.position.clone(), tp: pos.clone(), fq: camera.quaternion.clone(), tq: quat.clone(), t: 0, dur, res, ff: camera.fov, tf: fov != null ? fov : camera.fov, arc: Math.min(6, camera.position.distanceTo(pos) * 0.12) };
    });
  }
  function updateFly(dt) {
    if (!fly) return;
    fly.t += dt;
    const k = Math.min(1, fly.t / fly.dur);
    const e = easings.inOutCubic(k);
    camera.position.lerpVectors(fly.fp, fly.tp, e);
    camera.position.y += Math.sin(Math.PI * e) * fly.arc * 0.25;
    camera.quaternion.slerpQuaternions(fly.fq, fly.tq, easings.inOutSine(k));
    const f = fly.ff + (fly.tf - fly.ff) * e;
    if (Math.abs(camera.fov - f) > 1e-3) { camera.fov = f; camera.updateProjectionMatrix(); }
    if (k >= 1) { const r = fly.res; fly = null; r(); }
  }
  const quatLook = (from, target) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from, target, UP));
  const quatYP = (yaw, pitch) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

  /* ================================================================ pano mode */
  const _ra = new THREE.Ray(), _rv = new THREE.Vector3(), _near = [];
  function segBlocked(a, b, yLevel, ignoreDist = 0.05) {
    // true if any static collider box crossing yLevel blocks the horizontal segment a→b
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 1e-3) return false;
    _ra.origin.set(a.x, yLevel, a.z); _ra.direction.set(dx / len, 0, dz / len);
    for (const bx of world.boxes) {
      if (bx.min.y > yLevel || bx.max.y < yLevel) continue;
      if (bx.containsPoint(_ra.origin)) continue;
      _rv.set(b.x, yLevel, b.z); if (bx.containsPoint(_rv)) continue;
      const hit = _ra.intersectBox(bx, _rv);
      if (hit && _ra.origin.distanceTo(hit) < len - ignoreDist) return true;
    }
    return false;
  }
  let nav = null; // V2 nav controller (core-nav.js), created right after the pano
  const pano = createPano({
    scene, renderer, camera, plan,
    getNav: () => nav, isTouch, toast: (m, ms) => toast(m, ms),
    getPhotoreal: () => { try { const v = pathtrace && pathtrace.viewing; return !!(v && v.kind !== 'view'); } catch (_) { return false; } },
    getNodes: () => panoNodes,
    isOccluded: (a, b) => segBlocked(a.p, b.p, a.floorY + 1.1),
    fade,
    ui: { list: $('panoList'), tip: $('panoTip'), autoBtn: $('btnAutoRot') },
    onGo: () => { renderer.shadowMap.needsUpdate = true; },
    requestShadow: () => { renderer.shadowMap.needsUpdate = true; },
    defaultFov: () => defaultFov(isTouch), // V3 UI: wider vertical FOV on phones in portrait
    frameYaw: (node, pref) => panoFrameYaw(node, pref, 0.3), // V3 UI: arrive framed on the room
  });
  const pathtrace = createPathTrace({
    renderer, scene, camera, plan, pano, render, sun, isPhone, isTouch,
    getTod: () => ({ name: todName, night: todCur.night }), getMode: () => mode,
    toast: (m, ms) => toast(m, ms), reportError, onUpdate,
    getMaterials: () => ctx.materials, // V2 integration: ptTwin lookup (house copies mats.js into ctx.materials)
  });
  try {
    nav = createNav({
      scene, camera, renderer, canvas, plan, world, player, ctx, audio, isTouch, store,
      getMode: () => mode, getPano: () => pano, getPanoNodes: () => panoNodes,
      toast: (m, ms) => toast(m, ms), showHint: (m, ms) => showHint(m, ms),
    });
  } catch (e) { nav = null; reportError('ניווט', e); }

  /* ================================================================ HUD / UI */
  const minimap = createMinimap($('minimap'), plan);
  // V3 UI: walk-mode pinch / wheel zoom, arrow D-pad, radio chip + panel, style picker, compact phone panels
  const zoom = createZoom({ canvas, camera, getMode: () => mode, isTouch, isBusy: () => !!fly });
  createRadioUI({ radio, chip: $('radioChip'), panel: $('radioPanel'), toast: (m, ms) => toast(m, ms) });
  const styleUI = createStyleUI({ btn: $('btnStyle'), panel: $('stylePanel'), toast: (m, ms) => toast(m, ms), getStyles: () => (window.__tour && window.__tour.styles) || ctx.styles });
  setupCompactUI({ tools: $('tools'), btnMore: $('btnMore'), btnPanoMore: $('btnPanoMore') });
  function panoFrameYaw(node, pref, w) {
    if (!nav || !nav.framer || !node) return node ? node.camYaw : 0;
    const f = nav.framer.frameYaw({ x: node.p.x, feet: node.floorY, z: node.p.z }, { prefYaw: pref, prefWeight: w, vfov: defaultFov(isTouch), aspect: camera.aspect });
    return f.rect ? f.yaw : (isFinite(pref) ? pref : node.camYaw);
  }
  const crossEl = $('crosshair'), hoverEl = $('hoverLabel'), hoverTitle = $('hoverTitle'), hoverHint = $('hoverHint');
  const roomNameEl = $('roomName'), floorNameEl = $('floorName');
  const hintEl = $('hint');
  let hintShown = store('hint') === '1';
  function showHint(text, ms = 4200) {
    if (!hintEl) return;
    hintEl.textContent = text; hintEl.classList.add('show');
    clearTimeout(showHint._t); showHint._t = setTimeout(() => hintEl.classList.remove('show'), ms);
  }

  function setBodyMode(m) {
    for (const c of ['walk', 'pano', 'dollhouse', 'plan', 'intro', 'transition']) document.body.classList.toggle('mode-' + c, c === m);
    for (const b of document.querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === m);
  }
  function buildFloorChips() {
    const wrap = $('floorChips'); if (!wrap) return;
    const opts = mode === 'plan' || pendingMode === 'plan'
      ? [['upper', 'קומה עליונה'], ['main', 'קומת כניסה'], ['basement', 'מרתף']]
      : [['all', 'הכול'], ['upper', 'קומה עליונה'], ['main', 'קומת כניסה'], ['basement', 'מרתף']];
    const cur = (mode === 'plan' || pendingMode === 'plan') ? planFloor : viewFloor;
    wrap.innerHTML = '';
    for (const [k, he] of opts) {
      const b = document.createElement('button'); b.className = 'chip' + (k === cur ? ' on' : ''); b.textContent = he; b.dataset.floor = k;
      b.addEventListener('click', () => {
        if (mode === 'plan') { planFloor = k; applyView('plan', k); framePlan(); buildPlanLabels(); }
        else if (mode === 'dollhouse') { viewFloor = k; applyView('dollhouse', k); }
        buildFloorChips();
      });
      wrap.appendChild(b);
    }
    if (mode === 'dollhouse' || pendingMode === 'dollhouse') {
      const f = document.createElement('button'); f.className = 'chip ghost' + (fadeFront ? ' on' : ''); f.textContent = 'קירות חוץ שקופים';
      f.addEventListener('click', () => { fadeFront = !fadeFront; applyView('dollhouse', viewFloor); buildFloorChips(); });
      wrap.appendChild(f);
    }
  }

  /* ---------------- plan view */
  const planLabels = [];
  const FLOOR_Y = { basement: plan.basementFloor, main: plan.mainFloor, upper: plan.upperFloor };
  function framePlan() {
    const w = window.innerWidth, h = window.innerHeight, asp = w / h;
    let halfW, halfH;
    const needW = plan.W / 2 + 1.6, needH = plan.D / 2 + 2.2;
    if (needW / needH > asp) { halfW = needW; halfH = needW / asp; } else { halfH = needH; halfW = needH * asp; }
    ortho.left = -halfW; ortho.right = halfW; ortho.top = halfH; ortho.bottom = -halfH;
    ortho.zoom = 1;
    ortho.position.set(plan.W / 2, (FLOOR_Y[planFloor] || 0) + 40, plan.D / 2 + 0.4);
    ortho.up.set(0, 0, -1);
    ortho.lookAt(ortho.position.x, -100, ortho.position.z);
    ortho.updateProjectionMatrix();
    ortho.updateMatrixWorld(true);
  }
  function clearPlanLabels() { for (const l of planLabels) l.el.remove(); planLabels.length = 0; }
  function buildPlanLabels() {
    clearPlanLabels();
    const rs = (plan.rooms && plan.rooms[planFloor]) || {};
    const fy = FLOOR_Y[planFloor] || 0;
    for (const [k, rm] of Object.entries(rs)) {
      const [x0, z0, x1, z1] = rm.r;
      const el = document.createElement('div'); el.className = 'plabel';
      const wft = Math.round((x1 - x0) / plan.FT), dft = Math.round((z1 - z0) / plan.FT);
      el.innerHTML = '<b></b><span></span>';
      el.querySelector('b').textContent = rm.he;
      el.querySelector('span').textContent = `${wft}′×${dft}′ · ${((x1 - x0) * (z1 - z0)).toFixed(1)} מ״ר`;
      let cz = (z0 + z1) / 2;
      if (k === 'bed3') cz = (3.2 + z1) / 2;
      $('labels').appendChild(el);
      planLabels.push({ el, p: new THREE.Vector3((x0 + x1) / 2, fy + 0.1, cz), key: k });
    }
  }
  const _pv = new THREE.Vector3();
  function updatePlanLabels() {
    const w = window.innerWidth, h = window.innerHeight;
    for (const l of planLabels) {
      _pv.copy(l.p).project(ortho);
      l.el.style.transform = `translate(${((_pv.x + 1) / 2) * w}px, ${((1 - _pv.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  /* ================================================================ modes */
  let mode = 'boot';
  let pendingMode = null;
  let busy = false;
  let enteredHouse = false;

  function leaveMode(prev) {
    if (prev === 'walk') {
      if (document.pointerLockElement === canvas) try { document.exitPointerLock(); } catch (_) {}
      clearHover();
    } else if (prev === 'dollhouse' || prev === 'intro') {
      if (prev === 'dollhouse' && !fly) lastDollPos.copy(camera.position);
      orbit.enabled = false; orbit.autoRotate = false;
      restoreView();
    } else if (prev === 'plan') {
      restoreView(); clearPlanLabels();
      // continue from a top-down perspective view so the fly-out is smooth
      const p = new THREE.Vector3(ortho.position.x, (FLOOR_Y[planFloor] || 0) + 16, ortho.position.z);
      camera.position.copy(p);
      camera.quaternion.copy(quatLook(p, new THREE.Vector3(p.x, p.y - 10, p.z - 0.02)));
      activeCam = camera;
    } else if (prev === 'pano') {
      pano.exit();
      renderer.setPixelRatio(basePR());
      renderer.shadowMap.needsUpdate = true; // autoUpdate stays off (on-demand scheduling)
    }
  }

  async function setMode(next, opts = {}) {
    if (busy && !opts.force) return;
    if (next === mode && !opts.force) return;
    if (!['walk', 'pano', 'dollhouse', 'plan'].includes(next)) return;
    busy = true;
    const prev = mode;
    pendingMode = next;
    try {
      $('intro') && $('intro').classList.remove('show');
      leaveMode(prev);
      mode = 'transition';
      setBodyMode(next);
      document.body.classList.add('mode-transition');
      buildFloorChips();
      if (next === 'walk') {
        if (opts.teleport) player.teleport(opts.teleport.p, opts.teleport.yaw);
        else if (prev === 'pano' && pano.node) player.teleport(pano.node.p, pano.yaw);
        const s = player.state;
        const eye = new THREE.Vector3(s.x, s.camY, s.z);
        if (prev === 'pano') player.apply();
        else await flyTo(eye, quatYP(s.yaw, s.pitch), opts.dur || (prev === 'intro' || prev === 'dollhouse' ? 2.4 : 1.4), zoom.reset()); // V3 UI: phone-aware FOV
        player.apply();
        if (!isTouch) setTimeout(() => { if (mode === 'walk') showHint(nav ? nav.walkHint(lockFailed) : lockFailed ? 'גרור עם העכבר כדי להסתכל · WASD / חצים לתנועה' : 'הקלק על המסך כדי לשלוט · WASD לתנועה · Shift לריצה', 5000); }, 200);
      } else if (next === 'dollhouse') {
        viewFloor = opts.floor || viewFloor;
        applyView('dollhouse', viewFloor);
        orbit.target.copy(HOUSE_C);
        const to = opts.from ? opts.from.clone() : lastDollPos.clone();
        if (opts.intro) { camera.position.set(HOUSE_C.x + 40, 30, HOUSE_C.z + 46); camera.lookAt(HOUSE_C); }
        const scanP = runScan();
        await flyTo(to, quatLook(to, HOUSE_C), opts.intro ? 2.8 : 1.6, 55);
        orbit.enabled = true; orbit.autoRotate = !!opts.intro; orbit.update();
        void scanP;
      } else if (next === 'plan') {
        await fade(1, 240);
        planFloor = opts.floor || (playerFloor() === 'outside' ? 'main' : (playerFloor() || 'main'));
        if (!FLOOR_Y[planFloor]) planFloor = 'main';
        applyView('plan', planFloor);
        framePlan();
        activeCam = ortho;
        buildPlanLabels();
        buildFloorChips();
        await fade(0, 320);
      } else if (next === 'pano') {
        if (!panoNodes.length) { toast('אין נקודות 360 זמינות'); throw new Error('no pano nodes'); }
        await fade(1, 240);
        let node = opts.node;
        if (!node) {
          const ref = prev === 'walk' ? player.eye : camera.position;
          const fl = prev === 'walk' ? playerFloor() : null;
          let best = null, bd = Infinity;
          for (const n of panoNodes) {
            const d = n.p.distanceTo(ref) + (fl && n.floor !== fl ? 50 : 0);
            if (d < bd) { bd = d; best = n; }
          }
          node = best;
        }
        activeCam = camera;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
        pano.enter(node);
        await fade(0, 360);
      }
      mode = next;
    } catch (e) {
      if (String(e && e.message) !== 'no pano nodes') reportError('מעבר מצב', e);
      mode = prev === 'boot' ? 'dollhouse' : prev;
      if (mode === 'dollhouse') { orbit.enabled = true; }
    } finally {
      busy = false; pendingMode = null;
      setBodyMode(mode);
      document.body.classList.remove('mode-transition');
      buildFloorChips();
      lampsDirty = true;
    }
  }

  function runScan() {
    scanSound(audio, 2.5);
    return scanner.scan(2.5);
  }

  function teleport(eye, yaw = 0) {
    const p = Array.isArray(eye) ? eye : [eye.x, eye.y, eye.z];
    if (mode === 'walk') { player.teleport(p, yaw); return Promise.resolve(); }
    return setMode('walk', { teleport: { p, yaw }, force: true, dur: 1.4 });
  }
  function teleportToRoom(r) {
    if (!r) return;
    const node = panoNodes.find((n) => n.floor === r.floor && r.box.containsPoint(_rv.set(n.p.x, n.floorY + 0.8, n.p.z)));
    if (node) return teleport([node.p.x, node.p.y, node.p.z], node.camYaw); // pano yaws are framed after build (V3)
    const c = new THREE.Vector3(); r.box.getCenter(c);
    const fy = FLOOR_Y[r.floor] != null ? FLOOR_Y[r.floor] : 0;
    // V3 UI: no 360 node in this room → stand where most of the room is visible (corner / doorway, across the diagonal)
    try {
      if (nav && nav.framer) { const f = nav.framer.frameRoom([r.box.min.x, r.box.min.z, r.box.max.x, r.box.max.z], fy, { vfov: zoom.defaultFov, aspect: camera.aspect }); return teleport([f.x, fy + 1.6, f.z], f.yaw); }
    } catch (_) { /* fall back to the centre */ }
    return teleport([c.x, fy + 1.6, c.z], 0);
  }

  /* ================================================================ interaction */
  const irc = new THREE.Raycaster();
  irc.params.Points.threshold = 0.02; irc.params.Line.threshold = 0.02;
  const ihits = [];
  const ndcC = new THREE.Vector2(0, 0);
  const _ib = new THREE.Box3(), _iv = new THREE.Vector3();
  let hover = null; // {entry, meshes:[{m, orig, now, cl}]}
  let hoverLabelT = 0;
  function pickInteractive(ndc) {
    if (interDirty) { interObjs = interactives.filter((e) => e.enabled).map((e) => e.obj); interDirty = false; }
    if (!interObjs.length) return null;
    irc.setFromCamera(ndc, camera);
    irc.near = 0; irc.far = 2.6;
    ihits.length = 0;
    try { irc.intersectObjects(interObjs, true, ihits); } catch (_) { return null; }
    for (const h of ihits) {
      let o = h.object, e = null;
      while (o) { e = interMap.get(o); if (e && e.enabled) break; e = null; o = o.parent; }
      if (!e) continue;
      // occlusion by static colliders (walls) between eye and hit
      world.query(irc.ray.origin.x, irc.ray.origin.z, 2.7, _near, false);
      for (const b of _near) {
        _ib.copy(b).expandByScalar(0.06);
        if (_ib.containsPoint(h.point) || b.containsPoint(irc.ray.origin)) continue;
        const ip = irc.ray.intersectBox(b, _iv);
        if (ip && ip.distanceTo(irc.ray.origin) < h.distance - 0.05) return null;
      }
      return { entry: e, hit: h };
    }
    return null;
  }
  const HL = new THREE.Color(0x48d8ff);
  function hlOn(entry) {
    const meshes = [];
    entry.obj.traverse((m) => {
      if (!m.isMesh || !m.material || m.userData.__core) return;
      const orig = m.material;
      const arr = Array.isArray(orig) ? orig : [orig];
      if (!arr.some((x) => x && x.emissive)) return;
      const cl = arr.map((x) => (x && x.emissive ? x.clone() : x));
      const now = Array.isArray(orig) ? cl : cl[0];
      m.material = now;
      meshes.push({ m, orig, now, cl: cl.filter((x, i) => x !== arr[i]), src: arr.filter((x) => x && x.emissive) });
    });
    return meshes;
  }
  function hlOff(meshes) {
    if (!meshes) return;
    for (const r of meshes) { if (r.m.material === r.now) r.m.material = r.orig; for (const c of r.cl) c.dispose(); }
  }
  function hlPulse(meshes, t) {
    const k = 0.16 + 0.1 * Math.sin(t * 6);
    for (const r of meshes) {
      for (let i = 0; i < r.cl.length; i++) {
        const c = r.cl[i], o = r.src[i]; if (!o) continue;
        const oi = o.emissiveIntensity != null ? o.emissiveIntensity : 1;
        c.emissive.setRGB(o.emissive.r * oi + HL.r * k, o.emissive.g * oi + HL.g * k, o.emissive.b * oi + HL.b * k);
        c.emissiveIntensity = 1;
      }
    }
  }
  function labelOf(entry) {
    try { const l = typeof entry.label === 'function' ? entry.label() : entry.label; return l ? String(l) : ''; } catch (_) { return ''; }
  }
  function hintOf(entry) {
    try { const l = typeof entry.hint === 'function' ? entry.hint() : entry.hint; return l ? String(l) : ''; } catch (_) { return ''; }
  }
  function setHover(res) {
    const entry = res ? res.entry : null;
    if (hover && hover.entry === entry) return;
    clearHover();
    if (!entry) return;
    hover = { entry, meshes: hlOn(entry) };
    hoverLabelT = 0;
    refreshHoverLabel();
    if (!hintShown) {
      hintShown = true; store('hint', '1');
      showHint(isTouch ? 'הקש על אובייקט או לחץ "פעולה"' : 'לחץ E / הקלק לפעולה', 4500);
    }
  }
  function refreshHoverLabel() {
    if (!hover) return;
    hoverTitle.textContent = labelOf(hover.entry) || 'פעולה';
    const h = hintOf(hover.entry);
    hoverHint.textContent = h || (isTouch ? 'הקש / פעולה' : 'E / קליק');
    document.body.classList.add('hovering');
  }
  function clearHover() {
    if (hover) hlOff(hover.meshes);
    hover = null;
    document.body.classList.remove('hovering');
  }
  function use(res) {
    if (!res || !res.entry) return false;
    const e = res.entry;
    audio.resume();
    try {
      const r = e.onUse && e.onUse(res.hit);
      if (r && typeof r.then === 'function') r.catch((err) => reportError('פעולה: ' + labelOf(e), err));
    } catch (err) { reportError('פעולה: ' + labelOf(e), err); }
    // refresh highlight + label so state changes (emissive, color) show
    const refresh = () => { if (hover && hover.entry === e) { hlOff(hover.meshes); hover.meshes = hlOn(e); refreshHoverLabel(); } };
    setTimeout(refresh, 60); setTimeout(refresh, 700);
    return true;
  }
  function interactAt(ndc) {
    if (mode !== 'walk') return;
    if (measuring) { measurePoint(ndc); return; }
    const res = ndc ? pickInteractive(ndc) : (hover ? { entry: hover.entry, hit: null } : pickInteractive(ndcC));
    return use(res); // V2 nav: true when something was used (a double-click right after an interaction is ignored)
  }

  /* ---------------- surface picking (measure / dollhouse jump) */
  const src = new THREE.Raycaster();
  function surfaceHit(ndc, cam) {
    src.setFromCamera(ndc, cam);
    src.near = 0; src.far = 500;
    const list = [];
    const rec = (o) => {
      if (!o.visible || (o.userData && o.userData.__core)) return;
      if (o.isMesh && o.layers.test(src.layers) && !(o.isInstancedMesh && o.count > 64)) list.push(o);
      for (const c of o.children) rec(c);
    };
    for (const c of scene.children) rec(c);
    try {
      const hits = src.intersectObjects(list, false);
      return hits.length ? hits[0] : null;
    } catch (_) { return null; }
  }
  let measuring = false;
  function setMeasuring(on) {
    measuring = !!on && (mode === 'walk' || mode === 'dollhouse');
    document.body.classList.toggle('measuring', measuring);
    $('btnMeasure') && $('btnMeasure').classList.toggle('on', measuring);
    if (measuring) showHint('מדידה: סמן שתי נקודות על משטחים · Esc לניקוי', 4200);
    if (measuring) clearHover();
  }
  function measurePoint(ndc) {
    const h = surfaceHit(ndc || ndcC, activeCam);
    if (!h) { toast('לא נמצא משטח'); return; }
    const r = measure.addPoint(h.point);
    audio.tone(r === 1 ? 1200 : 1600, 0.08, { type: 'sine', gain: 0.05 });
  }

  /* ================================================================ input */
  const keys = new Set();
  const look = { x: 0, y: 0 };
  let locked = false, lockFailed = false, lockRequestedAt = 0;
  const joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
  const touchLook = new Map();
  let down = null;

  function ndcFrom(e) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    document.body.classList.toggle('locked', locked);
  });
  document.addEventListener('pointerlockerror', () => { lockFailed = true; locked = false; });
  document.addEventListener('mousemove', (e) => {
    if (!locked || mode !== 'walk') return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    if (Math.abs(mx) > 300 || Math.abs(my) > 300) return; // ignore browser glitch spikes
    look.x += mx * 0.0022; look.y += my * 0.0022;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    audio.resume();
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, type: e.pointerType, moved: 0, wasLocked: locked, button: e.button, lockReq: false };
    if (mode === 'pano') { pano.onDown(e); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} return; }
    if (mode === 'plan') { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} return; }
    if (mode === 'walk') {
      if (e.pointerType === 'mouse') {
        if (!locked && !lockFailed && e.button === 0 && !(nav && nav.clickMode)) { // V2: click-navigation mode = free cursor
          try {
            lockRequestedAt = performance.now();
            down.lockReq = true;
            const p = canvas.requestPointerLock();
            if (p && typeof p.catch === 'function') p.catch(() => { lockFailed = true; });
          } catch (_) { lockFailed = true; }
        }
      } else {
        touchLook.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (mode === 'pano') { pano.onMove(e); if (down && down.id === e.pointerId) down.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); return; }
    if (down && down.id === e.pointerId) {
      const dx = e.clientX - (down.lx != null ? down.lx : down.x), dy = e.clientY - (down.ly != null ? down.ly : down.y);
      down.lx = e.clientX; down.ly = e.clientY;
      down.moved += Math.abs(dx) + Math.abs(dy);
      if (mode === 'walk') {
        if (e.pointerType === 'mouse' && !locked) { if (nav && nav.clickMode) nav.dragLook(dx, dy, look); else { look.x += dx * 0.004; look.y += dy * 0.004; } }
      } else if (mode === 'plan') {
        const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
        ortho.position.x -= (dx * (ortho.right - ortho.left)) / ortho.zoom / w;
        ortho.position.z -= (dy * (ortho.top - ortho.bottom)) / ortho.zoom / h;
        ortho.updateMatrixWorld(true);
      }
    }
    if (mode === 'walk' && touchLook.has(e.pointerId) && !zoom.pinching) { // V3 UI: two fingers = pinch zoom, not look
      const p = touchLook.get(e.pointerId);
      if (nav && nav.clickMode) nav.dragLook(e.clientX - p.x, e.clientY - p.y, look); // V2: grab-the-world like 360
      else { look.x += (e.clientX - p.x) * 0.0048; look.y += (e.clientY - p.y) * 0.0048; }
      p.x = e.clientX; p.y = e.clientY;
    }
  });
  const endPointer = (e) => {
    if (mode === 'pano') pano.onUp(e);
    touchLook.delete(e.pointerId);
    if (!down || down.id !== e.pointerId) return;
    const d = down; down = null;
    if (e.type === 'pointercancel') return;
    if (mode === 'walk' && d.type !== 'mouse' && zoom.blockClick()) return; // V3 UI: fingers lifting after a pinch
    const isClick = d.moved < 7 && performance.now() - d.t < 450 && d.button === 0;
    if (!isClick) return;
    const ndc = ndcFrom(e);
    // V2 nav: arrows, double-click / double-tap walk, then interaction (nav calls interactAt itself)
    if (mode === 'walk' && nav) {
      try {
        if (nav.onClick(d.wasLocked ? null : ndc, { type: d.type, lockReq: !!d.lockReq && !lockFailed, wasLocked: d.wasLocked, measuring, x: e.clientX, y: e.clientY }, (n) => interactAt(n))) return;
      } catch (err) { reportError('ניווט', err); }
    }
    if (mode === 'walk') {
      if (d.wasLocked) interactAt(null);
      else if (d.type === 'mouse') { if (!d.lockReq || lockFailed) interactAt(ndc); }
      else interactAt(ndc);
    } else if (mode === 'dollhouse') {
      if (measuring) measurePoint(ndc);
    } else if (mode === 'plan') {
      planClick(ndc);
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    if (mode === 'walk') { zoom.onWheel(e); return; } // V3 UI: wheel / trackpad pinch = FOV zoom
    if (mode === 'pano') { e.preventDefault(); pano.onWheel(e); }
    else if (mode === 'plan') {
      e.preventDefault();
      ortho.zoom = Math.max(0.5, Math.min(5, ortho.zoom * Math.exp(-e.deltaY * 0.0015)));
      ortho.updateProjectionMatrix();
    }
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    if (mode !== 'dollhouse' || measuring) return;
    const h = surfaceHit(ndcFrom(e), camera);
    if (!h) return;
    const p = h.point;
    const inFoot = p.x > 0.1 && p.x < plan.W - 0.1 && p.z > 0.1 && p.z < plan.D - 0.1;
    let feet = 0;
    if (inFoot) {
      const lv = [plan.basementFloor, plan.mainFloor, plan.upperFloor].filter((y) => y <= p.y + 0.08);
      feet = lv.length ? Math.max(...lv) : plan.mainFloor;
    }
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    let yaw = Math.atan2(-dir.x, -dir.z);
    try { if (nav && nav.framer) { const f = nav.framer.frameYaw({ x: p.x, feet, z: p.z }, { prefYaw: yaw, prefWeight: 0.35, vfov: zoom.defaultFov, aspect: camera.aspect }); if (f.rect) yaw = f.yaw; } } catch (_) { /* keep */ } // V3 UI: framed entry
    teleport([p.x, feet + 1.6, p.z], yaw);
  });
  // plan pinch zoom (touch)
  const planPtrs = new Map(); let planPinch = 0, planZoom0 = 1;
  canvas.addEventListener('pointerdown', (e) => { if (mode === 'plan') { planPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (planPtrs.size === 2) { const [a, b] = [...planPtrs.values()]; planPinch = Math.hypot(a.x - b.x, a.y - b.y); planZoom0 = ortho.zoom; } } });
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'plan' || !planPtrs.has(e.pointerId)) return;
    planPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (planPtrs.size === 2 && planPinch > 0) { const [a, b] = [...planPtrs.values()]; ortho.zoom = Math.max(0.5, Math.min(5, planZoom0 * Math.hypot(a.x - b.x, a.y - b.y) / planPinch)); ortho.updateProjectionMatrix(); if (down) down.moved += 20; }
  });
  const planUp = (e) => { planPtrs.delete(e.pointerId); if (planPtrs.size < 2) planPinch = 0; };
  canvas.addEventListener('pointerup', planUp); canvas.addEventListener('pointercancel', planUp);

  function planClick(ndc) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, ortho);
    const fy = FLOOR_Y[planFloor] || 0;
    const t = (fy - rc.ray.origin.y) / (rc.ray.direction.y || -1e-6);
    if (!(t > 0)) return;
    const p = rc.ray.at(t, new THREE.Vector3());
    const feet = fy;
    _rp.set(p.x, feet + 0.8, p.z);
    let r = roomsReg.find((x) => x.floor === planFloor && x.box.containsPoint(_rp));
    if (!r) r = roomsPlan.find((x) => x.floor === planFloor && x.box.containsPoint(_rp));
    if (!r) { toast('הקש על חדר כדי להיכנס אליו'); return; }
    toast('נכנס אל ' + r.name, 1600);
    teleportToRoom(r);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    audio.resume();
    keys.add(e.code);
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyE': if (mode === 'walk') interactAt(null); break;
      case 'KeyQ': case 'KeyF': toggleFlash(); break;
      case 'Escape': measure.clear(); if (measuring) setMeasuring(false); $('help') && $('help').classList.remove('show'); break;
      case 'Digit1': setMode('walk'); break;
      case 'Digit2': setMode('pano'); break;
      case 'Digit3': setMode('dollhouse'); break;
      case 'Digit4': setMode('plan'); break;
      case 'KeyM': setMeasuring(!measuring); break;
      default: break;
    }
    if (mode === 'walk' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // V3 UI: arrow D-pad (replaces the joystick): hold = continuous move / turn with acceleration, tap = short step / turn.
  // Always on touch in walk mode; optional on desktop (✥ button in the tools, remembered).
  const dpad = createDpad($('dpad'), { onStep: (dir) => { if (mode === 'walk' && nav) nav.step(dir); }, onPress: () => audio.resume() });
  const dpBtn = $('btnDpad');
  const setDpadDesk = (on) => { document.body.classList.toggle('dpad-on', !!on); dpBtn && dpBtn.classList.toggle('on', !!on); store('dpad', on ? '1' : '0'); };
  if (!isTouch) setDpadDesk(store('dpad') === '1');
  dpBtn && dpBtn.addEventListener('click', () => setDpadDesk(!document.body.classList.contains('dpad-on')));
  $('btnAct') && $('btnAct').addEventListener('click', () => { audio.resume(); interactAt(null); });

  function toggleFlash(v) {
    flashOn = v != null ? !!v : !flashOn;
    flash.intensity = flashOn ? 30 : 0;
    $('btnFlash') && $('btnFlash').classList.toggle('on', flashOn);
    audio.tone(flashOn ? 1800 : 1200, 0.05, { type: 'square', gain: 0.03 });
  }

  /* ---------------- buttons */
  for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { audio.resume(); setMode(b.dataset.mode); });
  for (const b of document.querySelectorAll('[data-tod]')) b.addEventListener('click', () => setTOD(b.dataset.tod));
  $('btnMeasure') && $('btnMeasure').addEventListener('click', () => setMeasuring(!measuring));
  $('btnMeasureClear') && $('btnMeasureClear').addEventListener('click', () => measure.clear());
  $('btnFlash') && $('btnFlash').addEventListener('click', () => toggleFlash());
  $('btnErr') && $('btnErr').addEventListener('click', () => { if ($('errors').classList.contains('show')) $('errors').classList.remove('show'); else showErrors(); });
  $('btnHelp') && $('btnHelp').addEventListener('click', () => $('help').classList.toggle('show'));
  $('helpClose') && $('helpClose').addEventListener('click', () => $('help').classList.remove('show'));
  const qBtn = $('btnQuality');
  function setQuality(q) {
    quality = q; ctx.quality = q; store('q', q);
    if (mode !== 'pano') renderer.setPixelRatio(basePR());
    renderer.setSize(window.innerWidth, window.innerHeight);
    sun.shadow.mapSize.set(shadowSize(), shadowSize());
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    renderer.shadowMap.needsUpdate = true;
    lampsDirty = true;
    try { render.setQuality(q); } catch (_) {}
    if (qBtn) { qBtn.querySelector('.lbl') ? (qBtn.querySelector('.lbl').textContent = q === 'high' ? 'איכות גבוהה' : 'איכות חסכונית') : null; qBtn.classList.toggle('on', q === 'high'); }
  }
  qBtn && qBtn.addEventListener('click', () => setQuality(quality === 'high' ? 'low' : 'high'));
  setQuality(quality);
  const sBtn = $('btnSound');
  sBtn && sBtn.addEventListener('click', () => { audio.setMuted(!audio.muted); sBtn.classList.toggle('off', audio.muted); sBtn.querySelector('.ico') && (sBtn.querySelector('.ico').textContent = audio.muted ? '🔇' : '🔊'); });
  $('btnPanoDl') && $('btnPanoDl').addEventListener('click', async () => {
    if (mode !== 'pano') return;
    const b = $('btnPanoDl'); b.disabled = true; toast('מייצר תמונת 360… (4096×2048)', 4000);
    await new Promise((r) => setTimeout(r, 60));
    const ok = await pano.exportEquirect();
    b.disabled = false;
    toast(ok ? 'תמונת 360 נשמרה ✓' : 'הייצוא נכשל', 2600);
  });
  $('btnAutoRot') && $('btnAutoRot').addEventListener('click', () => pano.toggleAuto());
  $('btnEnter') && $('btnEnter').addEventListener('click', () => { audio.resume(); setMode('walk', { teleport: { p: START.p, yaw: START.yaw }, dur: 2.8 }); });

  /* ================================================================ resize / visibility */
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (mode === 'plan') { const z = ortho.zoom, px = ortho.position.x, pz = ortho.position.z; framePlan(); ortho.zoom = z; ortho.position.x = px; ortho.position.z = pz; ortho.updateProjectionMatrix(); }
    minimap.resize();
    zoom.onResize();
  }
  window.addEventListener('resize', onResize);
  let running = true;
  const clock = new THREE.Clock();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; keys.clear(); }
    else if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); }
  });

  /* ================================================================ main loop */
  let lastShadow = 0;
  let lastHud = 0, lastMap = 0, lastLamps = 0, lastRoomName = '', lastFloor = '', wasInside = false;
  const _sp = new THREE.Vector3();
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    if (mode === 'walk' && !fly) {
      const dp = dpad ? dpad.read(dt) : { forward: 0, turn: 0, run: false }; // V3 UI: arrow pad
      if (dp.turn) look.x -= dp.turn;
      const turn = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
      if (turn) look.x -= turn * 1.9 * dt;
      const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + dp.forward;
      const str = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || dp.run;
      const pin = { forward: fwd, strafe: str, run, lookX: look.x, lookY: look.y };
      if (nav) try { nav.walkInput(dt, pin); } catch (e) { reportError('ניווט', e); } // V2: glide along nav paths
      try { player.update(dt, pin); } catch (e) { reportError('שחקן', e); }
      look.x = 0; look.y = 0;
      // hover
      if (!measuring) {
        const hn = nav ? nav.hoverNdc() : null; // V2: click-navigation mode hovers under the mouse (false = none)
        const res = hn === false ? null : pickInteractive(hn || ndcC);
        setHover(res);
        if (hover) { hlPulse(hover.meshes, t); hoverLabelT += dt; if (hoverLabelT > 0.3) { hoverLabelT = 0; refreshHoverLabel(); } }
      }
      // first entry through the front door → scanner
      const s = player.state;
      const inside = s.x > 0.2 && s.x < plan.W - 0.2 && s.z > 0.2 && s.z < plan.D - 0.15 && s.feet > plan.mainFloor - 0.3 && s.feet < plan.mainFloor + 0.5;
      if (inside && !wasInside && !enteredHouse && s.z > plan.D - 2.5) { enteredHouse = true; runScan(); }
      wasInside = inside;
    } else { look.x = 0; look.y = 0; }

    updateFly(dt);
    zoom.update(dt); // V3 UI: smooth walk-mode FOV (pinch / wheel)
    if (mode === 'dollhouse' && orbit.enabled) orbit.update();
    if (mode === 'pano') pano.update(dt);
    if (nav) try { nav.update(dt, t); } catch (e) { if (!frame._navErr) { frame._navErr = true; reportError('ניווט', e); } }
    tweener.update(dt);
    world.updateDynamic();
    for (let i = 0; i < updaters.length; i++) {
      const u = updaters[i];
      try { u.fn(dt, t); } catch (e) { u.errs++; if (u.errs === 1) reportError('onUpdate', e); if (u.errs > 20) { updaters.splice(i, 1); i--; } }
    }
    particles.update(dt);
    scanner.update(dt, renderer.getPixelRatio());
    updateTOD(dt);
    audio.update();

    // sun / shadow focus
    let fx = HOUSE_C.x, fz = HOUSE_C.z;
    if (mode === 'walk') { fx = player.state.x; fz = player.state.z; }
    else if (mode === 'pano' && pano.node) { fx = pano.node.p.x; fz = pano.node.p.z; }
    fx = Math.round(fx / 4) * 4; fz = Math.round(fz / 4) * 4;
    if (Math.abs(fx - sun.target.position.x) > 0.01 || Math.abs(fz - sun.target.position.z) > 0.01) renderer.shadowMap.needsUpdate = true;
    sun.target.position.set(fx, 0, fz);
    sun.position.copy(sun.target.position).addScaledVector(lightDir, 75);
    // V3 LOOK: inside the house the sun shadow only has to cover the house (+ long low-sun shadows): ±16 m instead of
    // ±30 m → ~3.5× more shadow-map texels for crisp window patches / mullion shadows on the floor
    {
      const ins = (mode === 'walk' && floorAt(player.state.x, player.state.feet, player.state.z) !== 'outside') || (mode === 'pano' && pano.node && pano.node.floor !== 'outside');
      const half = ins ? 16 : 30;
      if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); renderer.shadowMap.needsUpdate = true; }
    }
    // on-demand shadow map: re-centre / TOD / quality set needsUpdate elsewhere; here: while any core tween (house doors,
    // windows) runs, and otherwise at most ~4×/s for module-driven motion (drawers, appliance doors…). Pano mode drives
    // its own updates (static camera).
    if (mode === 'walk') setInteriorCasters(floorAt(player.state.x, player.state.feet, player.state.z) !== 'outside');
    else if (mode === 'pano' && pano.node) setInteriorCasters(pano.node.floor !== 'outside');
    else if (mode === 'dollhouse') setInteriorCasters(viewFloor !== 'all'); // all floors: main pass ≈450 → keep shadow pass small
    else if (mode === 'plan') setInteriorCasters(true);
    if (mode !== 'pano') {
      if (tweener.busy) renderer.shadowMap.needsUpdate = true;
      else if (t - lastShadow > 0.25) { renderer.shadowMap.needsUpdate = true; }
      if (renderer.shadowMap.needsUpdate) lastShadow = t;
    }
    stars.position.copy(activeCam.position);

    if (lampsDirty || t - lastLamps > 0.5) { lastLamps = t; try { manageLamps(); } catch (e) { /* ignore */ } }

    // HUD
    if (t - lastHud > 0.2) {
      lastHud = t;
      let name = '', fl = '';
      if (mode === 'pano' && pano.node) { name = pano.node.he; fl = pano.node.floor; }
      else { const s = player.state; const r = roomAt(s.x, s.feet, s.z); name = r ? r.name : 'חוץ'; fl = r ? r.floor : floorAt(s.x, s.feet, s.z); }
      if (name !== lastRoomName || fl !== lastFloor) {
        lastRoomName = name; lastFloor = fl;
        roomNameEl && (roomNameEl.textContent = name);
        floorNameEl && (floorNameEl.textContent = FLOOR_HE[fl] || '');
        if (fl === 'basement' && mode === 'walk' && !flashOn && !toggleFlash._hinted) { toggleFlash._hinted = true; showHint('טיפ: Q / F להדלקת פנס', 3500); }
      }
    }
    if ((mode === 'walk' || mode === 'pano') && t - lastMap > 1 / 12) {
      lastMap = t;
      const s = player.state;
      if (mode === 'pano' && pano.node) minimap.draw({ x: pano.node.p.x, z: pano.node.p.z, yaw: pano.yaw, floor: pano.node.floor, roomName: pano.node.he });
      else minimap.draw({ x: s.x, z: s.z, yaw: s.yaw, floor: lastFloor || 'outside', roomName: lastRoomName });
    }
    if (mode === 'plan' || pendingMode === 'plan') updatePlanLabels();
    measure.update(activeCam, window.innerWidth, window.innerHeight);

    try { render.renderFrame(activeCam, dt); } catch (e) { if (!frame._err) { frame._err = true; reportError('רינדור', e); } }
    if (mode === 'pano' && pano.renderOverlay) pano.renderOverlay(activeCam); // V2 nav: arrows over the path-traced 360
  }

  /* ================================================================ shadow casters */
  // Sun shadows indoors only matter for pieces the sun can actually reach through a window. Interior module objects
  // (anything that is not the house shell / exterior) stop casting when they are small (bbox < 0.6 m), in the basement
  // (hopper windows only), or farther than ~1.6 m from every main/upper window. House shell, roof, porch, trees and
  // neighbours are untouched.
  const interiorCasters = [];
  let interiorCastOn = true;
  // from outside (walk / 360 on the lot) the interior's sun patches are invisible: skip those casters in the shadow pass
  function setInteriorCasters(on) {
    if (on === interiorCastOn) return;
    interiorCastOn = on;
    for (const o of interiorCasters) o.castShadow = on;
    renderer.shadowMap.needsUpdate = true;
  }
  function trimShadowCasters() {
    const wins = [];
    for (const w of plan.windows || []) {
      if (w.floor !== 'main' && w.floor !== 'upper' || w.type === 'vent') continue;
      const fy = w.floor === 'main' ? plan.mainFloor : plan.upperFloor;
      const a0 = w.along - w.w / 2, a1 = w.along + w.w / 2;
      const r = w.wall === 'ext_S' ? [a0, plan.D, a1, plan.D] : w.wall === 'ext_N' ? [a0, 0, a1, 0] : w.wall === 'ext_E' ? [plan.W, a0, plan.W, a1] : [0, a0, 0, a1];
      wins.push({ x0: r[0], z0: r[1], x1: r[2], z1: r[3], y0: fy, y1: fy + 2.6 });
    }
    // the front door sidelight + glass back door also admit sun
    for (const d of plan.doors || []) if (d.exterior) {
      const a0 = d.along - d.w / 2 - 0.4, a1 = d.along + d.w / 2 + 0.4;
      wins.push(d.wall === 'ext_S' ? { x0: a0, z0: plan.D, x1: a1, z1: plan.D, y0: plan.mainFloor, y1: plan.mainCeil } : { x0: plan.W, z0: a0, x1: plan.W, z1: a1, y0: plan.mainFloor, y1: plan.mainCeil });
    }
    const NEAR = 1.6, bb = new THREE.Box3(), sz = new THREE.Vector3();
    let off = 0, kept = 0;
    for (const top of scene.children) {
      if (!top || (top.userData && top.userData.__core) || top.name === 'house' || top.name === 'exterior') continue;
      if (top.userData && top.userData.floor === 'outside') continue;
      top.traverse((o) => {
        if (!o.isMesh || !o.castShadow) return;
        let fl = null; for (let p = o; p && !fl; p = p.parent) fl = p.userData && p.userData.floor;
        bb.setFromObject(o); bb.getSize(sz);
        let keep = fl !== 'basement' && fl !== 'outside' ? Math.max(sz.x, sz.y, sz.z) >= 0.6 : fl === 'outside';
        if (keep && fl !== 'outside') keep = wins.some((w) => bb.min.x < w.x1 + NEAR && bb.max.x > w.x0 - NEAR && bb.min.z < w.z1 + NEAR && bb.max.z > w.z0 - NEAR && bb.min.y < w.y1 && bb.max.y > w.y0);
        if (keep) { kept++; interiorCasters.push(o); } else { o.castShadow = false; off++; }
      });
    }
    return { off, kept };
  }

  /* ================================================================ load modules */
  const styles = createStyles(ctx); ctx.styles = styles; // V3 STYLE: list() works now; set() before init() is queued
  window.__tour = {
    styles,
    radio, zoom, dpad, minimap, styleUI, guards, get framer() { return nav && nav.framer; }, // V3 UI
    ctx, setMode, teleport, player, world, pano, scanner, setTOD, get mode() { return mode; }, panoNodes, lamps, render, pathtrace, nav,
    // photoreal 360 flag, unified: reads pathtrace.viewing (via pano.photoreal); setting it is a manual override for tests
    get pathtraceActive() { return pano.photoreal; }, set pathtraceActive(v) { pano.photoreal = v; },
  };
  document.body.classList.add('loading');
  setBodyMode('intro');
  requestAnimationFrame(frame);
  const listEl = $('loaderList'), barEl = $('loaderBar'), stepEl = $('loaderStep');
  const rows = {};
  for (const m of MODULES) {
    const li = document.createElement('li'); li.className = 'pending';
    li.innerHTML = '<span class="dot"></span><span class="nm"></span><span class="st">ממתין</span>';
    li.querySelector('.nm').textContent = m.he;
    listEl && listEl.appendChild(li);
    rows[m.id] = li;
  }
  const setRow = (id, cls, txt) => { const li = rows[id]; if (!li) return; li.className = cls; li.querySelector('.st').textContent = txt; };
  let progress = 0.04;
  const setProg = (p) => { progress = p; if (barEl) barEl.style.transform = `scaleX(${Math.max(0.02, Math.min(1, p))})`; };
  setProg(0.06);
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  for (let i = 0; i < MODULES.length; i++) {
    const m = MODULES[i];
    const base = 0.08 + (i / MODULES.length) * 0.82, span = 0.82 / MODULES.length;
    try {
      setRow(m.id, 'loading', 'טוען…'); stepEl && (stepEl.textContent = 'טוען ' + m.he);
      const mod = await import(m.file);
      setProg(base + span * 0.3);
      const build = mod.build || (mod.default && mod.default.build) || (typeof mod.default === 'function' ? mod.default : null);
      if (!build) throw new Error('המודול לא מייצא build(ctx)');
      setRow(m.id, 'building', 'בונה…'); stepEl && (stepEl.textContent = 'בונה ' + m.he);
      await nextFrame();
      let to;
      await Promise.race([
        Promise.resolve().then(() => build(ctx)),
        new Promise((_, rej) => { to = setTimeout(() => rej(new Error('תם הזמן (90 ש׳)')), 90000); }),
      ]);
      clearTimeout(to);
      setRow(m.id, 'done', '✓ מוכן');
    } catch (e) {
      setRow(m.id, 'failed', '✗ נכשל');
      reportError(`${m.he} (${m.file.replace('./', 'js/')})`, e);
    }
    setProg(base + span);
    await nextFrame();
  }
  stepEl && (stepEl.textContent = 'מכין תאורה, צללים וסריקה…');
  await nextFrame();
  try { world.refreshWalkables(); } catch (e) { reportError('משטחי הליכה', e); }
  try { if (nav) { world.updateDynamic(); nav.build(); } } catch (e) { reportError('ניווט (גרף)', e); } // V2: nav graph
  // V3 UI: re-aim every indoor 360 node at the view that shows the most of its room (authored yaw = mild preference)
  try { for (const n of panoNodes) { const y = panoFrameYaw(n, n.camYaw, 0.12); if (isFinite(y) && y !== n.camYaw) { n.camYaw = y; n.yaw = y - Math.PI; } } } catch (e) { reportError('מסגור 360', e); }
  try { trimShadowCasters(); } catch (e) { reportError('צללים', e); }
  try { await styles.init(); } catch (e) { reportError('סגנונות שיפוץ', e); } // V3 STYLE: tag materials + apply saved style (before probes)
  renderer.shadowMap.needsUpdate = true;
  try { applyEnvK(todCur.envK, true); } catch (_) {}
  stepEl && (stepEl.textContent = 'מכין השתקפויות ותאורת חלונות…');
  try { await render.afterBuild(); } catch (e) { reportError('רינדור V2', e); }
  for (const L of lamps) if (!L.optFloor) L.floor = null; // re-derive from final world positions
  try { manageLamps(); } catch (e) { reportError('תאורה', e); }
  try { scanner.prepare(quality === 'high' ? 14000 : 6000); } catch (_) {}
  const savedTod = store('tod');
  if (savedTod && TOD[savedTod] && savedTod !== 'day') setTOD(savedTod, true);
  try {
    if (renderer.compileAsync) await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))]);
    else renderer.compile(scene, camera);
  } catch (e) { try { renderer.compile(scene, camera); } catch (_) {} }
  setProg(1);
  await new Promise((r) => setTimeout(r, 250));
  document.body.classList.remove('loading');
  $('loader') && $('loader').classList.add('done');
  if (errors.length && $('errors')) showErrors();
  mode = 'intro';
  await setMode('dollhouse', { intro: true, force: true });
  if (mode === 'dollhouse') $('intro') && $('intro').classList.add('show');

  return window.__tour;
}
