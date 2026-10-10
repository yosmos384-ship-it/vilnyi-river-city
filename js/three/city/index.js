// VILNYI Lifestyle — City Drive (game mode). A fictional arcade game, opt-in only, separate from the apartment tour:
// it owns its own scene and camera and borrows the walkthrough's renderer while it runs (walk.js → city/hook.js).
// Stages: the car (cockpit, instruments, lights, wipers, horn, handbrake, reversing camera, sat-nav, radio),
// the streamed city (world.js), traffic and police (traffic.js), people (peds.js), damage, carjacking, wanted level.
import * as THREE from 'three';
import { createCar, cockpitSurface, setCarEnvScale, CAR_COLOURS } from '../cars.js?v=3.9';
import { buildMap, BOUNDS } from './map.js?v=3.9';
import { buildRealMap } from './osm.js?v=3.9';
import { createWorld } from './world.js?v=3.9';
import { createTraffic } from './traffic.js?v=3.9';
import { createPeds } from './peds.js?v=3.9';
import { createFx } from './fx.js?v=3.9';
import { createAudio } from './audio.js?v=3.9';
import { createRadio } from './radio.js?v=3.9';
import { createHud } from './hud.js?v=3.9';
import { cityT, cityDir } from './i18n.js?v=3.9';
import { makeBody, stepBody, collideStatic, bodyBox } from './vehicle.js?v=3.9';
import { poiSign } from './gen.js?v=3.9';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } } };

export async function startCityDrive(host) {
  const { renderer, container } = host, t = cityT(host.lang), dir = cityDir(host.lang);
  const settings = { violence: true, traffic: clamp(+ls.get('vrc.city.traffic', '2') || 2, 1, 3), sound: ls.get('vrc.city.sound', '1') !== '0' };
  // the real streets (OpenStreetMap) when they load, the procedural district otherwise
  let map; try { map = await buildRealMap(); } catch (e) { console.warn('[city] real street map unavailable — procedural district', e); map = buildMap(); }
  const scene = new THREE.Scene(); scene.environment = host.envMap || null;
  const camera = new THREE.PerspectiveCamera(80, 1, 0.07, 1000);
  const saved = { exposure: renderer.toneMappingExposure, shadow: renderer.shadowMap.autoUpdate };
  const world = createWorld(map, scene, { renderer, mode: host.timeMode || 'day' });
  const fx = createFx(scene), audio = createAudio(host.getAudioContext || null);
  audio.setEnabled(settings.sound);
  const G = { map, world, scene, settings, audio, fx, wanted: 0, body: null };
  const traffic = G.traffic = createTraffic(G), peds = G.peds = createPeds(G);
  let radioState = { on: false, name: '', freq: '', status: 'off', volume: 0.6 };
  const radio = createRadio({ audio, onChange: s => { radioState = s; } }); radioState = radio.state();
  const keys = new Set();
  const hud = createHud(container, { t, dir, lang: host.lang, settings, onAction: (a, v) => act(a, v) });
  const game = { active: true, frame, dispose, api: null };
  // a mute that is always on screen: the whole game's sound (engine, traffic, radio) goes quiet, and stays so
  let muted = ls.get('vrc.city.mute', '0') === '1';
  const muteB = document.createElement('button'); muteB.type = 'button'; muteB.className = 'cg-mute';
  muteB.style.cssText = 'position:absolute;top:10px;' + (dir === 'rtl' ? 'right' : 'left') + ':10px;z-index:40;width:42px;height:42px;border-radius:50%;border:1px solid rgba(201,164,92,.55);background:rgba(10,9,7,.82);color:#e6cc92;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;padding:0';
  const setMute = v => { muted = !!v; ls.set('vrc.city.mute', muted ? '1' : '0'); audio.setEnabled(!muted && settings.sound); radio.duck(muted ? 0 : 1); paintMute(); };
  const paintMute = () => { const lbl = muted ? t('sound') + ' · ' + t('off') : t('sound') + ' · ' + t('on'); muteB.setAttribute('aria-label', lbl); muteB.title = lbl; muteB.setAttribute('aria-pressed', String(muted));
    muteB.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/>${muted ? '<path d="M16 9.5l5 5M21 9.5l-5 5"/>' : '<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'}</svg>`; };
  muteB.addEventListener('click', ev => { ev.stopPropagation(); setMute(!muted); });
  for (const n of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'dblclick']) muteB.addEventListener(n, ev => ev.stopPropagation());
  container.appendChild(muteB); paintMute(); if (muted) setMute(true);

  // ------------------------------------------------------------------ player
  const P = { mode: 'car', car: null, body: null, extras: null, foot: { x: 0, z: 0, yaw: 0, pitch: 0, onFoot: true, vx: 0, vz: 0, isPlayer: true, mode: 'player' }, view: ls.get('vrc.city.view', 'fp') === 'chase' ? 'chase' : 'fp',
    look: { yaw: 0, pitch: 0 }, back: 0, fpTune: { up: 0.0, fwd: 0.22, pitch: 0.0, hfov: 72, p: 0.4 }, start: 'garage', engine: false, lights: null, high: false, wipers: false, wipT: 0, ind: 0, indT: 0, hb: false, door: 0, doorT: 0, win: 0, winT: 0, cam: null, shake: 0, surf: { grip: 1, drag: 1 }, surfT: 0, stuck: 0 };
  let heat = 0, hideT = 0, bustT = 0, crimeT = -99, state = 'play', time = 0, frameN = 0, hudT = 0, mapT = 0, route = null, routeT = -9, ambT = -99, lastHit = -9, edgeT = -9, policeT = 0, dmgStage = 0;
  const G0 = map.site.garage;
  // host.startId (GT VILNYI): the car starts on that street instead of the car park's garage, with no start chooser
  const S0 = host.startId && map.real ? map.startPose(host.startId) : null, A0 = S0 && !S0.garage ? S0 : G0;

  function windscreenFrame(S) {   // a frame lying in the windscreen: x across, y up the glass, z out of it
    const by = S.bA + 0.02, bz = S.zA + 0.06, ty = S.roof - 0.05, tz = S.zT1 + 0.1, len = Math.hypot(ty - by, tz - bz);
    const Y = new THREE.Vector3(0, (ty - by) / len, (tz - bz) / len), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3().crossVectors(X, Y);
    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.makeBasis(X, Y, Z).setPosition(0, by, bz); g.userData.len = len; return g;
  }
  let crackTex = null;
  function crackTexture() {
    if (crackTex) return crackTex; const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'); let s = 91; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = 'rgba(235,245,255,0.85)'; g.lineCap = 'round';
    for (const [cx, cy, n, R] of [[150, 150, 15, 150], [380, 90, 11, 110], [270, 200, 8, 80]]) {
      for (let k = 0; k < n; k++) { let a = k / n * 6.283 + r() * 0.3, x = cx, y = cy; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); for (let q = 0; q < 7; q++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * R / 7 * (0.6 + r()); y += Math.sin(a) * R / 7 * (0.6 + r()); g.lineTo(x, y); } g.stroke(); }
      for (let q = 1; q < 4; q++) { g.lineWidth = 0.9; g.beginPath(); for (let k = 0; k <= 24; k++) { const a = k / 24 * 6.283, rr = R * q / 5 * (0.85 + r() * 0.3); k ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.stroke(); }
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 26); gr.addColorStop(0, 'rgba(240,248,255,0.8)'); gr.addColorStop(1, 'rgba(240,248,255,0)'); g.fillStyle = gr; g.fillRect(cx - 26, cy - 26, 52, 52);
    }
    return (crackTex = new THREE.CanvasTexture(c));
  }
  function mountCar(kind, colour, x, z, yaw, dmg = 0, seed = 7) {
    const col = CAR_COLOURS[colour] ? colour : 'graphite';
    const car = createCar(kind, col, { interior: seed % 4, plate: seed * 13 + 5 });
    try { car.setCockpit(true); } catch (e) { console.warn('[city] cockpit', e); }
    car.setInside(P.view === 'fp'); scene.add(car.group);
    const S = car.spec, ex = new THREE.Group(); ex.name = 'city-car-extras'; car.group.add(ex);
    const wf = windscreenFrame(S); ex.add(wf);
    const bladeM = new THREE.MeshBasicMaterial({ color: 0x0a0a0b });
    const blades = [-1, 1].map((sd, i) => { const pv = new THREE.Group(); pv.position.set(sd > 0 ? 0.08 : -S.W / 2 + 0.34, 0.045, 0.014); const m = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.022, 0.02).translate(0.28, 0, 0), bladeM); pv.add(m); pv.rotation.z = 0.06; wf.add(pv); return pv; });
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(S.W - 0.62, wf.userData.len * 0.9).translate(0, wf.userData.len * 0.47, 0.02), new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 })); crack.renderOrder = 4; crack.visible = false; wf.add(crack);
    const zf = S.zF - 0.75, top = z0 => { const T = S.top; for (let k = 1; k < T.length; k++) if (z0 <= T[k][0]) { const f = (z0 - T[k - 1][0]) / (T[k][0] - T[k - 1][0]); return T[k - 1][1] + (T[k][1] - T[k - 1][1]) * f; } return T[T.length - 1][1]; };
    const yf = top(zf);
    const body = makeBody(kind, x, z, yaw); body.isPlayer = true; body.mode = 'player'; body.colourName = col; body.seed = seed;
    P.car = car; P.body = G.body = body; P.extras = { ex, blades, crack, bladeM, smokeAt: new THREE.Vector3(0, yf + 0.15, zf - 0.2), deformed: [] };
    P.door = P.doorT = 0; P.win = P.winT = 0; dmgStage = 0;
    if (dmg > 0) { body.dmg = Math.min(88, dmg); const n = Math.ceil(dmg / 22); for (let k = 0; k < n; k++) { const a = k * 2.4 + seed; deform(new THREE.Vector3(Math.cos(a) * S.W / 2, 0.6, Math.sin(a) > 0 ? S.zF - 0.2 : S.zR + 0.2), new THREE.Vector3(-Math.cos(a), 0, Math.sin(a) > 0 ? -1 : 1).normalize(), 0.18); } applyDamageLook(); }
    return car;
  }
  function unmountCar() {
    if (!P.car) return; const X = P.extras;
    for (const d of X.deformed) { d.mesh.geometry = d.orig; d.geo.dispose(); }
    X.ex.traverse(o => { if (o.geometry) o.geometry.dispose(); }); X.crack.material.dispose(); X.bladeM.dispose();
    P.car.group.remove(X.ex); P.car.dispose(); P.car = null; P.extras = null;
  }
  // ---- visible damage: dents by moving the body's vertices (on private copies of the shared geometry)
  const DEF = ['paint', 'glass', 'trim', 'lights', 'plates', 'door-paint', 'door-glass', 'door-trim', 'door-lights'];
  function deform(lp, ld, depth) {
    const X = P.extras, R = 0.75 + depth * 1.7;
    P.car.group.traverse(m => {
      if (!m.isMesh || !DEF.includes(m.name) || !m.geometry.attributes.position) return;
      let d = X.deformed.find(q => q.mesh === m);
      if (!d) { const geo = m.geometry.clone(); d = { mesh: m, orig: m.geometry, geo, base: geo.attributes.position.array.slice() }; m.geometry = geo; X.deformed.push(d); }
      const p = d.geo.attributes.position, n = d.geo.attributes.normal, b = d.base; let any = false;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), dd = Math.hypot(x - lp.x, (y - lp.y) * 0.6, z - lp.z); if (dd >= R) continue;
        const w = (1 - dd / R) ** 2, h = Math.sin(x * 31.7 + y * 17.3 + z * 23.1) * 0.5 + 0.5, k = depth * w * (0.65 + 0.7 * h);
        let nx = x + ld.x * k, ny = y + ld.y * k - k * 0.08, nz = z + ld.z * k;
        const ox = nx - b[i * 3], oy = ny - b[i * 3 + 1], oz = nz - b[i * 3 + 2], ol = Math.hypot(ox, oy, oz); if (ol > 0.5) { nx = b[i * 3] + ox * 0.5 / ol; ny = b[i * 3 + 1] + oy * 0.5 / ol; nz = b[i * 3 + 2] + oz * 0.5 / ol; }
        p.setXYZ(i, nx, ny, nz); any = true;
        if (n) { const q = w * 0.9, ax = n.getX(i) + (h - 0.5) * q * 1.6 - ld.x * q * 0.5, ay = n.getY(i) + (Math.cos(x * 40 + z * 29) * 0.5) * q, az = n.getZ(i) - ld.z * q * 0.5 + (0.5 - h) * q, L = Math.hypot(ax, ay, az) || 1; n.setXYZ(i, ax / L, ay / L, az / L); }
      }
      if (any) { p.needsUpdate = true; if (n) n.needsUpdate = true; }
    });
  }
  function sagBumper() {   // medium damage: the front bumper drops at one corner
    const S = P.car.spec, sd = P.body.pull >= 0 ? 1 : -1;
    for (const d of P.extras.deformed) { const p = d.geo.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); if (z > S.zF - 0.42 && y < 0.5) { const k = (p.getX(i) * sd / (S.W / 2) + 1) / 2; p.setY(i, y - 0.13 * k - 0.02); p.setZ(i, z + 0.05 * k); } } p.needsUpdate = true; }
  }
  function applyDamageLook() {
    const b = P.body, X = P.extras, st = b.dead ? 4 : b.dmg >= 60 ? 3 : b.dmg >= 25 ? 2 : b.dmg > 4 ? 1 : 0;
    X.crack.visible = b.dmg >= 30; X.crack.material.opacity = b.dmg >= 60 ? 0.8 : 0.42;
    if (b.dmg >= 40 && !b.pull) b.pull = (Math.random() < 0.5 ? -1 : 1) * 0.001;
    if (b.pull) b.pull = Math.sign(b.pull) * clamp((b.dmg - 40) / 60) * 0.085;
    if (st >= 2 && dmgStage < 2 && X.deformed.length) sagBumper();
    dmgStage = Math.max(dmgStage, st);
  }
  function repair(full = true) {
    const b = P.body; if (!b) return;
    const X = P.extras; for (const d of X.deformed) { d.mesh.geometry = d.orig; d.geo.dispose(); } X.deformed.length = 0;
    b.dmg = 0; b.dead = false; b.pull = 0; b.fuel = 1; X.crack.visible = false; dmgStage = 0;
    if (full) { world.repairAll(); fx.clear(); }
  }
  // ---- crashes
  const _lp = new THREE.Vector3(), _ld = new THREE.Vector3();
  function impact(kind, speed, px, pz, nx, nz, other) {
    const b = P.body; if (!b || speed < 1.2) return;
    const lvl = clamp(speed / 30);
    if (time - lastHit > 0.12 || speed > 8) audio.crash(lvl, px, pz);
    lastHit = time; P.shake = Math.max(P.shake, clamp(speed / 22));
    if (speed < 2.6) return;
    const hard = kind === 'wall' || kind === 'tree', add = hard ? Math.pow(speed, 1.45) * 0.42 : kind === 'car' ? Math.pow(speed, 1.4) * 0.3 : Math.pow(speed, 1.3) * 0.1;
    const severe = add >= 45, was = b.dmg;
    b.dmg = Math.min(severe ? 100 : 88, b.dmg + add);
    // dent where it was hit, in the car's own frame
    const sy = Math.sin(b.yaw), cy = Math.cos(b.yaw), dx = px - b.x, dz = pz - b.z, S = b.S;
    _lp.set(clamp(dx * cy - dz * sy, -S.W / 2, S.W / 2), 0.55, clamp(dx * sy + dz * cy, S.zR, S.zF)); _ld.set(nx * cy - nz * sy, 0, nx * sy + nz * cy).normalize();
    deform(_lp, _ld, clamp(add / 100 * 0.95, 0.05, 0.5));
    fx.emit('spark', px, 0.5, pz, nx * 3, 2, nz * 3, Math.min(26, 4 + speed), 1.5); fx.emit('debris', px, 0.5, pz, nx * 2, 2.5, nz * 2, Math.min(12, 2 + speed * 0.4), 1.6);
    if (b.dmg >= 30 && was < 30) fx.emit('glass', b.x + sy * 0.6, 1.1, b.z + cy * 0.6, b.vx * 0.5, 2, b.vz * 0.5, 22, 2.5);
    if (kind === 'tree') fx.emit('leaf', px, 3.5, pz, 0, 1, 0, 14, 5);
    if (b.dmg >= 100 && !b.dead) { b.dead = true; P.engine = false; audio.engine(false); fx.emit('steam', px, 1, pz, 0, 2, 0, 20, 2); hud.toast(t('wrecked') + ' — ' + t('wreckedSub'), 5200); }
    applyDamageLook();
    if (kind === 'car' && other && speed > 4) { crime(other.unit ? 1 : other.driver ? 0.5 : 0.2); if (other.driver && other.mode !== 'police') audio.honkAt(other.x, other.z, 0.7); }
    else if ((kind === 'lamp' || kind === 'tl') && speed > 3) crime(0.25);
  }
  function crime(h) { if (h <= 0) return; const was = Math.ceil(heat); heat = Math.min(5, heat + h); crimeT = time; hideT = 0; G.wanted = Math.ceil(heat); if (G.wanted > was && was === 0) hud.toast(t('police'), 1800); }
  G.onPedHit = (p, speed) => {
    audio.crash(clamp(0.2 + speed / 60), p.x, p.z); audio.voiceAt(p.x, p.z, 'cry', 0.9 + Math.random() * 0.3); P.shake = Math.max(P.shake, 0.35);
    P.body.dmg = Math.min(88, P.body.dmg + 2 + speed * 0.12); applyDamageLook();
    crime(1);
    if (time - ambT > 30 && !traffic.units.some(u => u.unit.kind === 'amb')) { ambT = time; const a = traffic.spawnUnit('amb', P.body.x, P.body.z, { x: p.x, z: p.z }); if (a) hud.toast(t('ambulance'), 2200); }
  };
  G.onPedLand = p => { audio.crash(0.12, p.x, p.z); };
  G.onPedScare = () => { if (Math.random() < 0.15) crime(0.1); };

  // ------------------------------------------------------------------ actions
  function setView(v) { P.view = v; P.cam = null; P.look.yaw = P.look.pitch = 0; ls.set('vrc.city.view', v); if (P.car) P.car.setInside(v === 'fp' && P.mode === 'car'); }
  function ignition(v) {
    if (P.mode !== 'car' || !P.body) return; const on = v == null ? !P.engine : !!v;
    if (on && P.body.dead) { hud.toast(t('wrecked') + ' — ' + t('wreckedSub'), 3200); return; }
    P.engine = on; audio.resume();
    if (on) { audio.engine(true, P.body.kind, P.body.C.ev); if (!radioState.on) radio.power(true); }   // the radio comes on with the ignition
    else { audio.engine(false); radio.power(false); }
  }
  function respawnOnRoad(msg) {
    const E = active(), ne = map.nearestEdge(E.x, E.z, 400) || map.nearestEdge(G0.x, G0.z, 400); if (!ne) return;
    const e = ne.e, s = clamp(ne.t, e.ta + 6, e.len - e.tb - 6), a = map.nodes[e.a], lat = e.hw * 0.45;
    const x = a.x + e.ux * s - e.uz * lat, z = a.z + e.uz * s + e.ux * lat;
    if (P.mode === 'car') Object.assign(P.body, { x, z, yaw: Math.atan2(e.ux, e.uz), vx: 0, vz: 0, w: 0 }); else Object.assign(P.foot, { x, z });
    P.cam = null; P.stuck = 0; if (msg) hud.toast(msg, 2000);
  }
  async function toGarage(reason) {   // tow / busted: fade, back at the garage with the car repaired
    state = 'fade'; await hud.fade(true);
    if (P.mode === 'foot') { P.mode = 'car'; P.car.group.visible = true; }
    repair(true); Object.assign(P.body, { x: G0.x, z: G0.z, yaw: G0.yaw, vx: 0, vz: 0, w: 0 }); heat = 0; G.wanted = 0; hideT = bustT = 0; traffic.clearUnits(); P.cam = null; hud.banner('');
    P.car.setInside(P.view === 'fp'); if (reason === 'busted') ignition(false);
    await hud.fade(false); state = 'play';
  }
  function getOut() {
    if (P.mode !== 'car') return; const b = P.body; if (Math.hypot(b.vx, b.vz) > 2.5) return;
    b.vx = b.vz = b.w = 0; ignition(false); audio.door();
    const lx = Math.cos(b.yaw), lz = -Math.sin(b.yaw); let x = b.x + lx * (b.hw + 0.7), z = b.z + lz * (b.hw + 0.7);
    if (world.inSolid(x, z, 0.3)) { x = b.x - lx * (b.hw + 0.7); z = b.z - lz * (b.hw + 0.7); }
    Object.assign(P.foot, { x, z, yaw: b.yaw, pitch: 0, vx: 0, vz: 0 }); P.mode = 'foot'; P.car.setInside(false); P.car.setLights(false); P.car.setIndicators(false, false); fx.setBeam(false); P.doorT = 0; P.look.yaw = P.look.pitch = 0;
  }
  function getIn() {
    if (P.mode !== 'foot') return; const f = P.foot, b = P.body;
    const own = b ? Math.hypot(f.x - b.x, f.z - b.z) : 99, n = traffic.nearest(f.x, f.z, 3.4);
    if (b && own < 4.2 && (!n || own - 2 <= n.d + 1)) { P.mode = 'car'; P.car.setInside(P.view === 'fp'); P.cam = null; audio.door(); return; }
    if (!n) return;
    // take that car: the driver (if any) is pulled out and runs off; ours stays behind as it is
    const c = n.car; audio.door();
    if (c.driver) { peds.bail(c, f.x, f.z); audio.voiceAt(c.x, c.z, 'hey', 1); crime(1); }
    const old = P.body, oc = old.colourName;
    unmountCar(); traffic.addParked(old.kind, oc, old.x, old.z, old.yaw, old.dmg);
    traffic.remove(c); mountCar(c.kind, c.colour, c.x, c.z, c.yaw, c.dmg, c.id % 61 + 3);
    P.mode = 'car'; P.cam = null; P.engine = false; hud.toast(t('taken'), 1600);
  }
  function setTime(m) { world.setTime(m); setCarEnvScale(m === 'night' ? 0.32 : m === 'dusk' ? 0.7 : 1, scene.environment); if (host.onTime) host.onTime(m); }
  function act(a, v) {
    audio.resume();
    if (a === 'tap') { if (v && P.mode === 'car' && P.view === 'fp' && tapScreen(v.x, v.y)) return hud.showRadio(); return hud.reveal(); }
    if (a === 'starts') return hud.showStarts(map.starts, P.start);
    if (a === 'startAt') return startFrom(v);
    if (a === 'hornDown') { audio.horn(true); if (P.mode === 'car' && P.body) peds.hornAt(P.body.x, P.body.z, Math.sin(P.body.yaw), Math.cos(P.body.yaw)); return; } if (a === 'hornUp') return audio.horn(false);
    if (a === 'view') return setView(P.view === 'fp' ? 'chase' : 'fp');
    if (a === 'lights') { P.lights = !lightsOn(); audio.click(); return; }
    if (a === 'high') { P.high = !P.high; if (P.high) P.lights = true; audio.click(); return; }
    if (a === 'wipers') { P.wipers = !P.wipers; audio.click(); return; }
    if (a === 'indL') { P.ind = P.ind === 1 ? 0 : 1; return; } if (a === 'indR') { P.ind = P.ind === -1 ? 0 : -1; return; }
    if (a === 'hand') { P.hb = !P.hb; audio.ratchet(); return; }
    if (a === 'start') return ignition();
    if (a === 'rpower') return radio.power(); if (a === 'rnext') return radio.next(1); if (a === 'rprev') return radio.next(-1);
    if (a === 'rpick') return radio.pick(+v); if (a === 'roff') return radio.power(false);
    if (a === 'rvol+') return radio.setVolume(radioState.volume + 0.1); if (a === 'rvol-') return radio.setVolume(radioState.volume - 0.1);
    if (a === 'out') return getOut(); if (a === 'enter' || a === 'take') return getIn();
    if (a === 'door') { P.doorT = P.doorT ? 0 : 1; audio.door(); return; } if (a === 'window') { P.winT = P.winT ? 0 : 1; return; }
    if (a === 'map') { hud.toggleMap(); mapT = 0; return; }
    if (a === 'settings') return hud.panelOpen ? hud.panel('') : hud.showSettings(world.time, about());
    if (a === 'closePanel') return hud.panel('');
    if (a === 'time') return setTime(world.time === 'day' ? 'dusk' : world.time === 'dusk' ? 'night' : 'day');
    if (a === 'setTime') { setTime(v); return hud.showSettings(world.time, about()); }
    if (a === 'setTraffic') { settings.traffic = +v; ls.set('vrc.city.traffic', v); return hud.showSettings(world.time, about()); }
    if (a === 'setSound') { settings.sound = v === '1'; ls.set('vrc.city.sound', v); audio.setEnabled(settings.sound); radio.duck(settings.sound ? 1 : 0); return hud.showSettings(world.time, about()); }
    if (a === 'repair') { hud.panel(''); repair(true); if (P.mode === 'car' && (world.inSolid(P.body.x, P.body.z, 0.5) || P.stuck > 2)) respawnOnRoad(); hud.toast(t('repair'), 1400); return; }
    if (a === 'tow') { hud.panel(''); return toGarage('tow'); }
    if (a === 'garage' || a === 'exit') { hud.panel(''); return leave('garage'); }
  }
  const about = () => (map.real ? t('aboutOsm') : t('about'));
  // a tap on the car's centre screen (3D) opens the radio strip
  const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  function tapScreen(fx, fy) {
    const scr = P.car && P.car.group.getObjectByName('screens'); if (!scr) return false;
    _ndc.set(fx * 2 - 1, -(fy * 2 - 1)); _ray.setFromCamera(_ndc, camera); const hit = _ray.intersectObject(scr, false)[0];
    return !!(hit && hit.uv && hit.uv.y < 0.64);
  }
  // "Start from…": fade out, the car on the chosen street (the Palace of the Parliament is the featured start), fade in
  async function startFrom(id) {
    if (state !== 'play' && state !== 'intro') return; state = 'fade'; hud.panel(''); await hud.fade(true);
    const p = map.startPose(id);
    if (P.mode === 'foot') { P.mode = 'car'; }
    P.car.group.visible = true; Object.assign(P.body, { x: p.x, z: p.z, yaw: p.yaw, vx: 0, vz: 0, w: 0 }); P.body.steer = 0;
    heat = 0; G.wanted = 0; hideT = bustT = 0; traffic.clearUnits(); hud.banner('');
    for (const c of [...traffic.cars]) if (c.mode !== 'parked' || Math.hypot(c.x - p.x, c.z - p.z) < 9) traffic.remove(c);
    P.cam = null; P.look.yaw = P.look.pitch = 0; P.back = 0; P.start = p.garage ? 'garage' : id; ls.set('vrc.city.start', P.start);
    try { await map.prefetch(p.x, p.z); } catch { /* the chunks come as the tiles arrive */ }
    for (let k = 0; k < 500 && (k < 3 || world.pending); k++) { world.update(p.x, p.z, 0, camera, 30); if (k % 6 === 5) await new Promise(r => setTimeout(r, 0)); }
    for (let k = 0; k < 30; k++) traffic.update(0.4, P.body, null, null);
    P.car.setInside(P.view === 'fp'); routeT = -9; P.stuck = 0;
    await hud.fade(false); state = 'play';
    const S = map.starts.find(s => s.id === P.start); if (S) hud.toast(t(S.key), 2400);
  }
  let leaving = false;
  async function leave(reason) { if (leaving) return; leaving = true; state = 'fade'; await hud.fade(true); game.active = false; try { host.onExit && host.onExit(reason); } catch (e) { console.warn(e); } }
  const lightsOn = () => (P.lights != null ? P.lights : P.engine && world.night > 0.3);
  const active = () => (P.mode === 'car' ? P.body : P.foot);
  // ---- keyboard (desktop)
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyH', 'KeyC', 'KeyL', 'KeyK', 'KeyX', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyT', 'KeyI', 'KeyM', 'KeyO', 'KeyU', 'Escape', 'Enter'];
  function onKey(ev) {
    if (!game.active || ev.metaKey || ev.ctrlKey || ev.altKey) return; const tg = ev.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    if (!KEYS.includes(ev.code)) return; ev.preventDefault(); ev.stopImmediatePropagation();
    const down = ev.type === 'keydown'; if (down) keys.add(ev.code); else keys.delete(ev.code);
    if (ev.code === 'KeyH') return act(down ? 'hornDown' : 'hornUp');
    if (!down || ev.repeat) return;
    const k = ev.code;
    if (k === 'KeyC') act('view'); else if (k === 'KeyL') act('lights'); else if (k === 'KeyK') act('high'); else if (k === 'KeyX') act('wipers'); else if (k === 'KeyQ') act('indL'); else if (k === 'KeyE') act('indR');
    else if (k === 'KeyR') (radioState.on ? radio.next(1) : radio.power(true)); else if (k === 'KeyF') (P.mode === 'car' ? getOut() : getIn()); else if (k === 'KeyT') act('repair'); else if (k === 'KeyI' || k === 'Enter') ignition();
    else if (k === 'KeyM') act('map'); else if (k === 'KeyO') act('door'); else if (k === 'KeyU') act('window'); else if (k === 'Escape') act('settings');
  }
  window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
  const onVis = () => { const on = !document.hidden && settings.sound; audio.setEnabled(on); radio.duck(on ? 1 : 0); if (document.hidden) { keys.clear(); audio.horn(false); } };   // silent while the tab is hidden
  document.addEventListener('visibilitychange', onVis);

  // ------------------------------------------------------------------ instruments painted on the car's own displays
  const revCam = new THREE.PerspectiveCamera(96, 512 / 280, 0.2, 400); let revReady = false;
  const _v = new THREE.Vector3(), _vp = new THREE.Vector4(), _sc = new THREE.Vector4();
  function paintCockpit(reversing) {
    let C; try { C = cockpitSurface(); } catch { return; } const g = C.g, b = P.body, GOLD = '#e2c078', kmh = Math.abs(b.vx * Math.sin(b.yaw) + b.vz * Math.cos(b.yaw)) * 3.6;
    if (!P.engine) { g.fillStyle = '#030405'; g.fillRect(0, 0, 512, 512); g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = GOLD; g.lineWidth = 3; g.globalAlpha = Math.floor(time * 1.6) % 2 ? 0.95 : 0.55; g.beginPath(); g.arc(256, 84, 40, 0, 7); g.stroke(); g.fillStyle = GOLD; g.font = '700 15px Arial, sans-serif'; g.fillText('START', 256, 78); g.font = '600 10px Arial, sans-serif'; g.fillText('ENGINE', 256, 96); g.globalAlpha = 1; g.fillStyle = '#46505b'; g.font = '600 14px Arial, sans-serif'; g.fillText('VILNYI Lifestyle', 256, 392); C.tex.needsUpdate = true; return; }
    const bg = g.createLinearGradient(0, 0, 0, 192); bg.addColorStop(0, '#05070a'); bg.addColorStop(1, '#0d1218'); g.fillStyle = bg; g.fillRect(0, 0, 512, 192);
    const dial = (cx, cy, r, f, label, max, stp, red, div = 1) => {
      const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2; g.lineCap = 'butt'; g.strokeStyle = '#27303a'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
      g.strokeStyle = GOLD; g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * clamp(f)); g.stroke();
      if (red) { g.strokeStyle = '#b3261e'; g.beginPath(); g.arc(cx, cy, r, a0 + (a1 - a0) * red, a1); g.stroke(); }
      g.fillStyle = '#c9d1da'; g.font = '600 10px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let v = 0; v <= max; v += stp) { const a = a0 + (a1 - a0) * v / max, c = Math.cos(a), s = Math.sin(a); g.strokeStyle = '#dfe5ec'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + c * (r - 11), cy + s * (r - 11)); g.lineTo(cx + c * (r - 3), cy + s * (r - 3)); g.stroke(); g.fillText(String(v / div), cx + c * (r - 23), cy + s * (r - 23)); }
      const a = a0 + (a1 - a0) * clamp(f); g.strokeStyle = '#ff6a3d'; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.stroke();
      g.fillStyle = '#1b222b'; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill(); g.fillStyle = '#8d98a5'; g.font = '600 10px Arial, sans-serif'; g.fillText(label, cx, cy + r * 0.58);
    };
    dial(100, 104, 78, kmh / 320, 'km/h', 320, 40, 0); dial(412, 104, 78, b.rpm / 8000, b.C.ev ? 'kW ×50' : 'rpm ×1000', 8000, 1000, 0.86, 1000);
    g.fillStyle = '#f4f6f8'; g.font = '700 58px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(String(Math.round(kmh)), 256, 108);
    g.fillStyle = '#8d98a5'; g.font = '600 12px Arial, sans-serif'; g.fillText('km/h', 256, 126);
    g.font = '700 16px Arial, sans-serif'; ['P', 'R', 'N', 'D'].forEach((q, i) => { g.fillStyle = q === b.gear ? GOLD : '#46505b'; g.fillText(q, 214 + i * 24, 152); }); if (b.gear === 'D') { g.fillStyle = GOLD; g.font = '700 12px Arial, sans-serif'; g.fillText(String(b.gearN), 304, 152); }
    const blink = Math.floor(time * 2.7) % 2 === 0, iL = blink && (P.ind === 1 || P.ind === 2), iR = blink && (P.ind === -1 || P.ind === 2);
    const arrow = (x, d, on) => { g.fillStyle = on ? '#3fe06a' : '#1d2b24'; g.beginPath(); g.moveTo(x + d * 14, 30); g.lineTo(x, 18); g.lineTo(x, 25); g.lineTo(x - d * 12, 25); g.lineTo(x - d * 12, 35); g.lineTo(x, 35); g.lineTo(x, 42); g.closePath(); g.fill(); };
    arrow(200, -1, iL); arrow(312, 1, iR);
    const lo = lightsOn(); g.fillStyle = P.high && lo ? '#4f8dff' : lo ? '#49d17a' : '#26313c'; g.beginPath(); g.arc(240, 30, 8, Math.PI / 2, Math.PI * 1.5, true); g.fill(); for (let k = -1; k <= 1; k++) g.fillRect(222, 28 + k * 6, 9, 2.5);
    g.strokeStyle = P.hb ? '#ff4a3a' : '#2a2022'; g.lineWidth = 2.5; g.beginPath(); g.arc(270, 30, 10, 0, 7); g.stroke(); g.fillStyle = P.hb ? '#ff4a3a' : '#2a2022'; g.font = '700 12px Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText('P', 270, 31);
    if (b.dmg >= 50) { g.fillStyle = '#ffb020'; g.font = '700 11px Arial, sans-serif'; g.fillText('⚠ ENGINE', 256, 172); }
    g.fillStyle = '#27303a'; g.fillRect(196, 180, 120, 5); g.fillStyle = b.fuel < 0.12 ? '#ff4a3a' : '#6fb6ff'; g.fillRect(196, 180, 120 * b.fuel, 5);
    // ---- centre screen: header (radio), then the reversing camera or the sat-nav
    const W = 512, H = 320, Y0 = 192;
    g.save(); g.beginPath(); g.rect(0, Y0, W, H); g.clip();
    if (reversing && revReady) {
      const cv = renderer.domElement, pr = renderer.getPixelRatio();
      try { g.drawImage(cv, 0, cv.height - 140 * pr, 256 * pr, 140 * pr, 0, Y0 + 40, W, H - 40); } catch { g.fillStyle = '#10151b'; g.fillRect(0, Y0 + 40, W, H - 40); }
      g.strokeStyle = '#3fe06a'; g.lineWidth = 3; g.beginPath(); g.moveTo(150, Y0 + H); g.lineTo(196, Y0 + 150); g.moveTo(362, Y0 + H); g.lineTo(316, Y0 + 150); g.stroke(); g.strokeStyle = '#ffd34d'; g.beginPath(); g.moveTo(176, Y0 + 220); g.lineTo(336, Y0 + 220); g.stroke(); g.strokeStyle = '#ff4a3a'; g.beginPath(); g.moveTo(160, Y0 + 280); g.lineTo(352, Y0 + 280); g.stroke();
    } else { g.translate(0, Y0 + 40); hud.drawMap(g, W, H - 40, mapData(190)); g.translate(0, -(Y0 + 40)); }
    g.fillStyle = '#0a0d11'; g.fillRect(0, Y0, W, 40); g.fillStyle = GOLD; g.fillRect(0, Y0 + 39, W, 1.5);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#f0f2f4'; g.font = '700 16px Arial, sans-serif';
    g.fillText(reversing ? 'R  CAMERA' : radioState.on ? `${radioState.freq} FM  ${radioState.name}` : 'NAV', 14, Y0 + 21, W - 110);
    g.textAlign = 'right'; g.fillStyle = '#9aa5b1'; g.font = '600 13px Arial, sans-serif'; const d = new Date(); g.fillText(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), W - 14, Y0 + 21);
    g.restore(); C.tex.needsUpdate = true;
  }
  function renderRear() {   // the reversing camera: a small view from the tail, drawn into a corner of the frame, copied to the screen
    const b = P.body, S = b.S, sy = Math.sin(b.yaw), cy = Math.cos(b.yaw);
    revCam.position.set(b.x + sy * (S.zR - 0.1), 0.95, b.z + cy * (S.zR - 0.1)); revCam.rotation.set(-0.42, b.yaw, 0, 'YXZ'); revCam.updateMatrixWorld();
    const st = renderer.getScissorTest(); renderer.getViewport(_vp); renderer.getScissor(_sc);
    renderer.setViewport(0, 0, 256, 140); renderer.setScissor(0, 0, 256, 140); renderer.setScissorTest(true);
    const vis = P.car.group.visible; P.car.group.visible = false; renderer.render(scene, revCam); P.car.group.visible = vis;
    renderer.setViewport(_vp); renderer.setScissor(_sc); renderer.setScissorTest(st); revReady = true;
  }
  function mapData(range) {
    const E = active();
    if (time - routeT > 2) { routeT = time; const a = map.nearestNode(E.x, E.z); route = a ? (map.route(a.id, G0.node, true) || map.route(a.id, G0.node)) : null; }
    return { map, x: E.x, z: E.z, yaw: P.mode === 'car' ? E.yaw : E.yaw, range, route, time, police: traffic.units.map(u => ({ x: u.x, z: u.z, amb: u.unit.kind === 'amb' })), label: p => (p.kind === 'metro' ? 'M ' + p.name : poiSign(p)) };
  }

  // ------------------------------------------------------------------ the frame
  const inp = { gas: 0, brake: 0, steer: 0, hb: false }; let gasA = 0, brakeA = 0;
  // autopilot for the automated tests: pure pursuit along the route polyline on the right-hand lane, slowing for bends and
  // for whatever is ahead in the lane
  function autoPath(path) {
    const pts = [];
    for (let k = 0; k < path.length - 1; k++) {
      const a = map.nodes[path[k]], b = map.nodes[path[k + 1]], e = map.edgeBetween(a.id, b.id), dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      const lat = !e ? 0 : e.ow ? Math.max(0, e.hw - 1.9) - (e.lanes > 1 ? 0 : 0) : Math.min(e.hw - 1.6, (map.real ? 0 : 0) + (e.cls >= 3 ? 4.9 : e.cls === 2 ? 1.8 : 1.6));
      const rx = -dz / L * lat, rz = dx / L * lat; if (!pts.length) pts.push([a.x + rx, a.z + rz]); pts.push([b.x + rx, b.z + rz]);
    }
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    return { pts, cum };
  }
  function autoDrive(b) {
    const A = P.auto, { pts, cum } = A.poly, sp = Math.hypot(b.vx, b.vz);
    // nearest point on the polyline at or after the current index
    let best = A.k || 0, bd = Infinity, bs = 0;
    for (let k = Math.max(0, (A.k || 0) - 2); k < Math.min(pts.length - 1, (A.k || 0) + 25); k++) { const p = pts[k], q = pts[k + 1], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz || 1, t = clamp(((b.x - p[0]) * dx + (b.z - p[1]) * dz) / L2), d = Math.hypot(b.x - p[0] - dx * t, b.z - p[1] - dz * t); if (d < bd) { bd = d; best = k; bs = cum[k] + t * Math.sqrt(L2); } }
    A.k = best; const total = cum[cum.length - 1];
    const at = s2 => { s2 = Math.min(total, s2); let k = A.k; while (k < pts.length - 2 && cum[k + 1] < s2) k++; const f = (s2 - cum[k]) / ((cum[k + 1] - cum[k]) || 1); return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f]; };
    const look = 5 + sp * 0.6, [tx, tz] = at(bs + look);
    const err = Math.atan2(Math.sin(Math.atan2(tx - b.x, tz - b.z) - b.yaw), Math.cos(Math.atan2(tx - b.x, tz - b.z) - b.yaw)), v = b.vx * Math.sin(b.yaw) + b.vz * Math.cos(b.yaw);
    // bend ahead: heading change over the next 30 m
    const h = s0 => { const p = at(s0), q = at(s0 + 6); return Math.atan2(q[0] - p[0], q[1] - p[1]); };
    // speed profile: every bend within 50 m caps the speed by the distance left to brake for it
    let vT = A.v;
    for (let d = 0; d <= 50; d += 5) { const a1 = h(bs + d - 7), a2 = h(bs + d + 1), turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
      if (turn > 0.25) { const vt = 4 + 7 * Math.max(0, 1 - turn / 1.3); vT = Math.min(vT, Math.sqrt(vt * vt + 2 * 2.6 * Math.max(0, d - 4))); } }
    // something in the lane ahead
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    for (const c of traffic.cars) { if (c.mode === 'gone') continue; const dx = c.x - b.x, dz = c.z - b.z, f = dx * fx + dz * fz, l = Math.abs(dx * fz - dz * fx); if (f > 2 && f < 9 + sp * 1.2 && l < 2.3) vT = Math.min(vT, Math.max(0, (f - 7) * 0.6)); }
    const done = total - bs < 10; if (done) A.done = true;
    if (done) vT = 0;
    return { steer: clamp(err * 2.4, -1, 1), gas: v < vT - 0.3 ? 1 : 0, brake: v > vT + 1.2 ? 1 : 0 };
  }
  function frame(dtRaw) {
    if (!game.active) return;
    const dt = Math.min(0.05, Math.max(1e-4, dtRaw || 0)); time += dt; frameN++;
    const w = container.clientWidth || 1, h = container.clientHeight || 1, scrA = w / h;
    const pad = hud.pad, k = keys, paused = state !== 'play' || hud.panelOpen;
    const gas = paused ? 0 : Math.max(k.has('KeyW') || k.has('ArrowUp') ? 1 : 0, pad.gas), brake = paused ? 0 : Math.max(k.has('KeyS') || k.has('ArrowDown') ? 1 : 0, pad.brake);
    let steer = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0); if (Math.abs(pad.steer) > Math.abs(steer)) steer = pad.steer; if (paused) steer = 0;
    const L = P.look, inCar = P.mode === 'car' && P.view === 'fp';
    L.yaw = clamp(L.yaw - hud.look.dx * 0.0052, inCar ? -1.45 : -2.7, inCar ? 1.45 : 2.7); L.pitch = clamp(L.pitch - hud.look.dy * 0.004, inCar ? -0.45 : -0.6, inCar ? 0.35 : 0.5); hud.look.dx = hud.look.dy = 0;
    P.back += clamp((hud.pad.back && P.mode === 'car' ? 1 : 0) - P.back, -dt * 4.5, dt * 4.5);
    const b = P.body;
    if (P.auto && P.mode === 'car' && !paused) { const A = autoDrive(b); gasA = A.gas; brakeA = A.brake; steer = A.steer; } else { gasA = gas; brakeA = brake; }
    if (P.mode === 'car') {
      if (!P.engine && (gas || brake) && !b.dead && time - (P.hintT || -9) > 3) { P.hintT = time; hud.toast(t('start') + ' ▸', 1500); }
      inp.gas = P.engine ? gasA : 0; inp.brake = brakeA; inp.steer = steer; inp.hb = P.hb || k.has('Space');
      if (P.hb && gas > 0.5 && P.engine) P.hb = false;   // drive off: the parking brake lets go
      if ((P.surfT -= dt) <= 0) { P.surfT = 0.12; const ne = map.nearestEdge(b.x, b.z, 40); const on = ne && ne.d < ne.e.hw + 0.6, pave = ne && ne.d < ne.e.hw + 6; P.surf.grip = on ? 1 : pave ? 0.94 : 0.74; P.surf.drag = on ? 1 : pave ? 1.05 : 1.7; P.off = !pave; }
      const n = Math.max(1, Math.min(8, Math.ceil(dt * 120)));
      for (let i = 0; i < n; i++) { stepBody(b, inp, dt / n, P.surf); collideStatic(b, world, impact, true); traffic.carHits(b, (o, sp, m) => impact('car', sp, m.px, m.pz, m.nx, m.nz, o)); }
      const sp = Math.hypot(b.vx, b.vz);
      if (map.inWater(b.x, b.z)) { fx.emit('steam', b.x, 0.5, b.z, 0, 3, 0, 20, 3); respawnOnRoad(t('water')); }
      if (b.x < BOUNDS.x0 + 60 || b.x > BOUNDS.x1 - 60 || b.z < BOUNDS.z0 + 60 || b.z > BOUNDS.z1 - 60) { if (time - edgeT > 5) { edgeT = time; hud.toast(t('edge'), 2200); } }
      // stuck (wedged, or on top of something): back on the road by itself
      if (P.engine && gasA > 0.5 && !b.dead && !P.hb) { P.stuck += dt; if (!P.stuckAt || Math.hypot(b.x - P.stuckAt[0], b.z - P.stuckAt[1]) > 2.5) { P.stuckAt = [b.x, b.z]; P.stuck = 0; } if (P.stuck > 5) { respawnOnRoad(t('respawn')); P.stuckAt = null; } } else { P.stuck = 0; P.stuckAt = null; }
      if (b.fuel <= 0.1 && time - (P.fuelT || -99) > 40) { P.fuelT = time; hud.toast(t('fuelLow'), 2600); }
    } else {
      const f = P.foot, mv = (gas - brake) * 4.6; f.yaw += steer * 2.4 * dt + L.yaw; L.yaw = 0;
      const nx = f.x + Math.sin(f.yaw) * mv * dt, nz = f.z + Math.cos(f.yaw) * mv * dt;
      if (!world.inSolid(nx, f.z, 0.35) && !map.inWater(nx, f.z)) f.x = nx; if (!world.inSolid(f.x, nz, 0.35) && !map.inWater(f.x, nz)) f.z = nz;
      f.vx = Math.sin(f.yaw) * mv; f.vz = Math.cos(f.yaw) * mv;
      if (b) { b.vx *= 0.9; b.vz *= 0.9; }
    }
    const E = active();
    if (state === 'play' || state === 'busted') {
      traffic.update(dt, E, peds.list, P.mode === 'foot' ? b : null); peds.update(dt, E);
      wantedTick(dt, E);
    }
    // ---- the car: pose, wheels, lights, indicators, wipers, door, smoke, tyres
    if (P.car) {
      const car = P.car, S = b.S, sy = Math.sin(b.yaw), cy = Math.cos(b.yaw), sp = Math.hypot(b.vx, b.vz), X = P.extras;
      car.group.position.set(b.x, 0, b.z); car.group.rotation.set(-b.pitch, b.yaw, b.roll + (b.dead ? 0.02 : 0), 'YXZ'); car.group.updateMatrixWorld(true);
      car.setWheels(b.spin, b.steer);
      const lo = lightsOn() && P.mode === 'car'; car.setLights(lo, b.braking || (brake > 0 && sp < 0.5 && !b.reversing), b.reversing);
      const blink = Math.floor(time * 2.7) % 2 === 0, bk = Math.floor(time * 2.7);
      car.setIndicators(blink && (P.ind === 1 || P.ind === 2), blink && (P.ind === -1 || P.ind === 2));
      if (P.ind && bk !== P.indT) { P.indT = bk; if (P.mode === 'car') audio.tick(blink); }
      if (P.ind && Math.abs(P.ind) === 1) { if (Math.abs(b.steer) > 0.2) P.indTurn = true; else if (P.indTurn && Math.abs(b.steer) < 0.04) { P.indTurn = false; P.ind = 0; } }   // self-cancelling
      if (P.wipers || P.wipT % 1 > 0.02) { const was = P.wipT % 1; P.wipT += dt * 0.9; if (!P.wipers && P.wipT % 1 < was) P.wipT = Math.floor(P.wipT); if (Math.floor(P.wipT * 2) !== Math.floor((P.wipT - dt * 0.9) * 2) && P.mode === 'car') audio.wiper(); }
      const wa = Math.sin((P.wipT % 1) * Math.PI) * 1.55; X.blades[0].rotation.z = 0.06 + wa; X.blades[1].rotation.z = 0.06 + wa;
      P.door += clamp(P.doorT - P.door, -dt * 2.2, dt * 2.2); if (sp > 1.5) P.doorT = 0; car.setDoor(P.door, 1.0);
      if (Math.abs(P.winT - P.win) > 0.001) { P.win += clamp(P.winT - P.win, -dt * 0.7, dt * 0.7); car.setWindow(P.win); }
      fx.setBeam(lo, b.x, b.z, b.yaw, P.high, S);
      if (b.dmg >= 50 && frameN % (b.dmg >= 75 ? 2 : 4) === 0) { _v.copy(X.smokeAt).applyMatrix4(car.group.matrixWorld); fx.emit(b.dmg >= 75 ? 'dark' : 'smoke', _v.x, _v.y, _v.z, b.vx * 0.4, 1.2, b.vz * 0.4, 1, 0.6); if ((b.dmg >= 75 || b.dead) && frameN % 6 === 0) fx.emit('steam', _v.x, _v.y, _v.z, b.vx * 0.4, 2, b.vz * 0.4, 1, 0.8); }
      if (P.mode === 'car' && b.slip > 2.2 && sp > 5) { for (const sd of [-1, 1]) { const wx = b.x - sy * S.wb / 2 + cy * sd * S.wheelX, wz = b.z - cy * S.wb / 2 - sy * sd * S.wheelX; fx.skid(wx, wz, Math.atan2(b.vx, b.vz), Math.max(0.5, sp * dt * 1.6)); if (frameN % 3 === 0) fx.emit('tyre', wx, 0.15, wz, 0, 0.6, 0, 1, 0.5); } }
      if (P.mode === 'car' && P.off && sp > 6 && frameN % 3 === 0) fx.emit('dust', b.x - sy * 2, 0.2, b.z - cy * 2, 0, 0.8, 0, 1, 1.2);
    }
    // ---- camera
    P.shake *= Math.exp(-dt * 5); const shk = P.shake * 0.06, sx = (Math.random() - 0.5) * shk, sy2 = (Math.random() - 0.5) * shk;
    // the head turns back to the road once the car moves (stopped, it stays where the driver looked)
    if (!hud.look.drag && P.mode === 'car' && (Math.hypot(b.vx, b.vz) > 1.5 || P.view !== 'fp')) { L.yaw *= 1 - damp(2.4, dt); L.pitch *= 1 - damp(2.4, dt); }
    // field of view from the HORIZONTAL angle wanted (a tall phone keeps a believable windscreen width)
    const hf = (a, hdeg) => 2 * Math.atan(Math.tan(hdeg * Math.PI / 360) / a) * 180 / Math.PI;
    // tall phone, cockpit: an off-axis frustum puts the horizon at P.fpTune.p of the height (less headliner, more road)
    let fov = scrA < 1 ? 92 : 70, vo = 0; const fpVo = scrA < 1 ? P.fpTune.p : 0, fpA = fpVo ? scrA / (2 * (1 - fpVo)) : scrA;
    const fpFov = scrA < 1 ? hf(fpA, P.fpTune.hfov) : Math.min(78, hf(scrA, Math.min(104, 80 + (scrA - 1) * 22)));
    if (P.mode === 'car') {
      const sp = Math.hypot(b.vx, b.vz); fov += clamp(sp / 83) * 9;
      if (P.view === 'fp') {
        const tall = scrA < 1, T = P.fpTune, kB = P.back * P.back * (3 - 2 * P.back);
        // head on the neck: the eyes sit ~9 cm ahead of the pivot and swing with the turn; look-back = over the right shoulder
        const hy = L.yaw * (1 - kB) - (Math.PI - 0.24) * kB, nk = 0.09;
        // forward offset per body: on a tall screen the header rail sits just inside the top edge (≈ 40° up)
        const S = P.car.spec, fw = clamp((S.zT1 - (S.roof - 0.08 - P.car.eye.y - T.up) / Math.tan(tall ? 0.7 : 0.62)) - P.car.eye.z, 0.02, tall ? T.fwd : 0.14);
        _v.copy(P.car.eye); _v.y += (tall ? T.up : 0.025) + 0.04 * kB; _v.z += fw - nk;
        _v.x += Math.sin(hy) * nk + Math.sin(hy) * 0.035 * (1 - kB) - 0.26 * kB; _v.z += Math.cos(hy) * nk;
        P.car.group.localToWorld(_v); camera.position.set(_v.x + sx, _v.y + sy2, _v.z);
        camera.rotation.set(b.pitch * 0.9 + (tall ? T.pitch : -0.075) + L.pitch * (1 - kB) - 0.06 * kB, b.yaw + Math.PI + hy, -b.roll * 0.6, 'YXZ');
        fov = fpFov + clamp(sp / 83) * (tall ? 5 : 6); vo = fpVo;
      }
      else {
        const dist = 6.4 + clamp(sp / 80) * 2.2, a = b.yaw + L.yaw + (b.reversing && sp > 2 ? 0 : 0), wantX = b.x - Math.sin(a) * dist, wantZ = b.z - Math.cos(a) * dist; let ch = 2.5;
        _v.set(wantX, ch, wantZ); for (let q = 0; q < 5 && world.inSolid(_v.x, _v.z, 0.5); q++) { _v.x = b.x + (_v.x - b.x) * 0.7; _v.z = b.z + (_v.z - b.z) * 0.7; _v.y += 0.5; }
        if (!P.cam) P.cam = _v.clone(); else P.cam.lerp(_v, damp(9, dt)); camera.position.set(P.cam.x + sx, P.cam.y + sy2, P.cam.z); camera.lookAt(b.x + Math.sin(b.yaw) * 2, 1.05 + L.pitch * 3, b.z + Math.cos(b.yaw) * 2);
      }
    } else { const f = P.foot; camera.position.set(f.x, 1.7 + 0.14, f.z); camera.rotation.set(L.pitch, f.yaw + Math.PI + L.yaw, 0, 'YXZ'); fov = scrA < 1 ? 86 : 68; }
    { const wantA = vo ? scrA / (2 * (1 - vo)) : scrA;
      if (Math.abs(camera.aspect - wantA) > 1e-4 || camera.userData.vo !== vo || camera.userData.h !== h || camera.userData.w !== w) {
        camera.aspect = wantA; camera.userData.vo = vo; camera.userData.w = w; camera.userData.h = h;
        if (vo) camera.setViewOffset(w, 2 * (1 - vo) * h, 0, (1 - 2 * vo) * h, w, h); else camera.clearViewOffset();
        if (Math.abs(camera.fov - fov) > 8) camera.fov = fov; camera.updateProjectionMatrix(); } }
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * clamp(dt * 6 + (P.cam ? 0 : 1)); camera.updateProjectionMatrix(); }
    { const nr = P.mode === 'car' ? (P.view === 'fp' ? 0.07 : 0.35) : 0.12; if (camera.near !== nr) { camera.near = nr; camera.updateProjectionMatrix(); } }
    camera.updateMatrixWorld();
    world.update(E.x, E.z, dt, camera, state === 'load' ? 40 : 6);
    if (P.noRender) { fx.update(dt, 400); return; }
    traffic.draw(camera); peds.draw(camera); fx.update(dt, h * renderer.getPixelRatio() * 0.5);
    audio.setListener(camera.position.x, camera.position.z);
    if (b) audio.drive({ rpm: P.engine ? b.rpm : 0, gas: P.mode === 'car' && P.engine ? gas : 0, kmh: P.mode === 'car' ? Math.hypot(b.vx, b.vz) * 3.6 : 0, slip: b.slip, onFoot: P.mode !== 'car' });
    // ---- displays, mirrors, the frame itself
    const fp = P.mode === 'car' && P.view === 'fp';
    if (fp) {
      const rev = b.reversing || (b.gear === 'R'); if (rev && frameN % 2 === 0) renderRear();
      if (frameN % 3 === 0 || rev) paintCockpit(rev);
      if (!rev && frameN % 2 === 1 && P.car.renderMirrors) { const au = renderer.shadowMap.autoUpdate; P.car.renderMirrors(renderer, scene); renderer.shadowMap.autoUpdate = au; }
    }
    if (renderer.getRenderTarget()) renderer.setRenderTarget(null);
    renderer.autoClear = true; renderer.render(scene, camera);
    // ---- HUD
    if (time - hudT > 0.1) { hudT = time; hud.set(hudState()); }
    if (time - mapT > 0.18) { mapT = time; hud.miniMap(mapData(150)); }
  }
  function hudState() {
    const b = P.body, f = P.foot, acts = [];
    const sp = b ? Math.hypot(b.vx, b.vz) : 0;
    if (state === 'play') {
      if (P.mode === 'car') { if (sp < 2.5) acts.push('out'); if (sp < 0.5 && !P.engine) acts.push('door', 'window'); if (b.dead) acts.push('tow'); if (Math.hypot(b.x - G0.x, b.z - G0.z) < 11 && sp < 4) acts.push('garage'); }
      else { const own = Math.hypot(f.x - b.x, f.z - b.z) < 4.2, n = traffic.nearest(f.x, f.z, 3.4); if (own && !(n && n.d + 1 < Math.hypot(f.x - b.x, f.z - b.z) - 2)) acts.push('enter'); else if (n) acts.push('take'); if (b.dead) acts.push('tow'); }
    }
    return { kmh: P.mode === 'car' ? Math.round(Math.abs(b.vx * Math.sin(b.yaw) + b.vz * Math.cos(b.yaw)) * 3.6) : 0, gear: P.mode === 'car' ? (b.gear === 'D' ? 'D' + b.gearN : b.gear) : '–', rpm: P.engine ? clamp(b.rpm / 7600) : 0, dmg: b ? b.dmg : 0, fuel: b ? b.fuel : 1,
      stars: Math.ceil(heat), hiding: heat > 0 && hideT > 1.5, onFoot: P.mode !== 'car', moving: P.mode === 'car' && sp > 2.8, lights: lightsOn(), high: P.high, wipers: P.wipers, indL: P.ind === 1, indR: P.ind === -1, hb: P.hb, engine: P.engine, radio: radioState, actions: acts };
  }
  // ---- wanted level, police, busted, escape
  function wantedTick(dt, E) {
    const stars = Math.ceil(heat); G.wanted = stars;
    const pol = traffic.units.filter(u => u.unit.kind === 'police');
    if (stars > 0) {
      if ((policeT -= dt) <= 0 && pol.length < Math.min(5, stars)) { policeT = 2.2; traffic.spawnUnit('police', E.x, E.z, null, E.vx || 0, E.vz || 0); }
      let seen = false, near = Infinity; for (const u of pol) { if (traffic.time - u.unit.seen < 1.2) seen = true; near = Math.min(near, Math.hypot(u.x - E.x, u.z - E.z)); }
      hideT = seen ? 0 : hideT + dt;
      if (hideT > 9 + stars * 2.5 && time - crimeT > 6) { heat = 0; G.wanted = 0; hideT = 0; traffic.clearUnits('police'); hud.toast(t('escaped'), 2400); audio.siren(0); return; }
      audio.siren(pol.length ? clamp(1.25 - near / 190, 0.06, 1) : 0, 'police');
      // boxed in / caught on foot
      const slow = P.mode === 'car' ? Math.hypot(P.body.vx, P.body.vz) < 2.4 : true, lim = P.mode === 'car' ? 7.5 : 4.5;
      if (state === 'play' && slow && near < lim) { bustT += dt; if (bustT > (P.mode === 'car' ? 2.6 : 1.0)) { state = 'busted'; bustT = 0; hud.banner(t('busted'), t('bustedSub'), true); audio.horn(false); setTimeout(() => { if (game.active) toGarage('busted'); }, 2300); } }
      else bustT = Math.max(0, bustT - dt * 0.7);
    } else {
      const amb = traffic.units.find(u => u.unit.kind === 'amb'); audio.siren(amb ? clamp(1.1 - Math.hypot(amb.x - E.x, amb.z - E.z) / 170, 0, 0.8) * (amb.unit.arrive > 0.5 ? 0.25 : 1) : 0, 'amb');
    }
    for (const u of traffic.units) if (u.unit.kind === 'amb') { if (u.unit.arrive > 12 && !u.unit.leaving) { u.unit.leaving = true; u.unit.target = { x: u.x + (u.x - E.x) * 4 + 300, z: u.z + (u.z - E.z) * 4 }; u.unit.arrive = 0; } if ((u.unit.leaving && Math.hypot(u.x - E.x, u.z - E.z) > 240) || traffic.time - (u.unit.t0 || (u.unit.t0 = traffic.time)) > 110) traffic.remove(u); }
    if (heat > 0 && !pol.length && time - crimeT > 40) heat = Math.max(0, heat - dt * 0.05);
  }

  function dispose() {
    game.active = false; try { muteB.remove(); } catch { /* */ } window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); document.removeEventListener('visibilitychange', onVis);
    try { radio.dispose(); audio.dispose(); } catch (e) { console.warn(e); }
    unmountCar(); traffic.dispose(); peds.dispose(); fx.dispose(); world.dispose(); hud.dispose();
    if (crackTex) crackTex.dispose();
    renderer.toneMappingExposure = saved.exposure; setCarEnvScale(1, null);
  }

  // ------------------------------------------------------------------ start: the car at the garage, the first chunks built
  const c0 = host.car || {};
  mountCar(c0.kind || 'gt', c0.colour || 'graphite', A0.x, A0.z, A0.yaw, 0, c0.seed || 11);
  setTime(host.timeMode || 'day');
  try { await map.prefetch(A0.x, A0.z); } catch { /* */ }
  for (let k = 0; k < 600 && (k < 3 || world.pending); k++) { world.update(A0.x, A0.z, 0, camera, 30); if (k % 6 === 5) await new Promise(r => setTimeout(r, 0)); }
  for (let k = 0; k < 40; k++) { traffic.update(0.4, P.body, null, null); }   // seed some traffic before the first frame
  if (host.autoStart !== false && host.gesture) ignition(true);
  if (map.real && host.chooser !== false && A0 === G0) hud.showStarts(map.starts, 'garage', true);   // where to start: the Palace of the Parliament is the featured one
  if (A0 !== G0) { P.start = host.startId; const SS = map.starts.find(x => x.id === host.startId); if (SS) hud.toast(t(SS.key), 2600); }
  game.api = {
    P, map, world, traffic, peds, fx, hud, radio, audio, scene, camera, settings, act, ignition, impact, crime, repair, toGarage, getOut, getIn, setTime, setView, respawnOnRoad, startFrom, tapScreen,
    autopilot(nodeId, v = 14) { const b0 = P.body, ne = map.nearestEdge(b0.x, b0.z, 40), fwd = ne ? (ne.e.ux * Math.sin(b0.yaw) + ne.e.uz * Math.cos(b0.yaw) >= 0 ? ne.e.b : ne.e.a) : null, a = fwd != null ? map.nodes[fwd] : map.nearestNode(b0.x, b0.z), path = a ? (map.route(a.id, nodeId, true) || map.route(a.id, nodeId)) : null; P.auto = path ? { path, i: 0, k: 0, v, poly: autoPath(path) } : null; return path ? path.length : 0; },
    get heat() { return heat; }, set heat(v) { heat = v; G.wanted = Math.ceil(v); }, get state() { return state; }, get time() { return time; }, keys, inp, hudState,
    info() { const i = renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, chunks: world.loaded.size, cars: traffic.cars.length, peds: peds.list.length }; },
  };
  return game;
}
