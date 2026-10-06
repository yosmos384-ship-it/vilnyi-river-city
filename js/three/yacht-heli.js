// VILNYI Lifestyle (concept experience) — the helicopter on the yacht's helipad and its scenic flight.
// Tap the helicopter (or the "Helicopter tour" chip / the prompt beside it): the cabin door slides open, the visitor
// takes the rear starboard seat by the deep window (drag to look round), the rotors run up, she lifts off and flies a
// guided tour of about two minutes — up along the lake shore, a close orbit of blocks C3 and C4, out through the very
// viewpoint of the developer's aerial render (exterior.js DEFAULT_VIEW), a wide circle over the neighbourhood and the
// lake, and back to the helipad wherever the yacht is by then (she may be under way on her autopilot).
// Buttons: Pause / Resume, Orbit the project again, Land now (pressed again: Skip), Free flight. No THREE.Light is added.
// The helicopter is a child of the yacht's root (airborne: of the scene, only while the visitor is aboard it), so it
// follows the yacht's visibility rule: never in the hero or the apartment views.
import * as THREE from 'three';
import { Y, WATER_Y } from './yacht-pier.js?v=3.5.1';
import { buildHeli, HELI } from './yacht-heli-model.js?v=3.5.1';
import { HT } from './yacht-heli-i18n.js?v=3.5.1';
import { clearance } from './yacht-nav.js?v=3.5.1';
import { BUILDINGS, GEOM, ROOF_Y, localToWorld, footprintOf, dirOfBearing, LAKE } from '../data.js?v=3.5.1';
import { DEFAULT_VIEW } from './exterior.js?v=3.5.1';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const D2R = Math.PI / 180, G = 9.81;
const isTouch = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

export const PAD = [45.4, Y.D2 + 0.015, 0];                // the helicopter's origin on the helipad (yacht-local), nose to the bow
// the flight plan's geometry (world): everything turns clockwise seen from above, so the project stays on the
// passenger's side (starboard)
const OC = [48, -30];                                       // middle of the C3 – C4 comb
const R_ORBIT = 230, ALT_ORBIT = 86, R_WIDE = 480, ALT_WIDE = 150, HOVER = 15, V_ORBIT = 36;
const VIEW_P = new THREE.Vector3(...DEFAULT_VIEW.position), VIEW_T = new THREE.Vector3(...DEFAULT_VIEW.target);
const PHI_VIEW = Math.atan2(VIEW_P.z - OC[1], VIEW_P.x - OC[0]), R_VIEW = Math.hypot(VIEW_P.x - OC[0], VIEW_P.z - OC[1]);
const polar = (phi, R, y) => new THREE.Vector3(OC[0] + R * Math.cos(phi), y, OC[1] + R * Math.sin(phi));
const SEAT = new THREE.Vector3(...HELI.seat);
const SEAT_YAW = -Math.PI / 2 - 0.75;                       // the seated visitor's resting gaze: out of the window, a little ahead
function siteCentre() { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const id of Object.keys(BUILDINGS)) for (const [lx, lz] of footprintOf(id)) { const [x, z] = localToWorld(id, lx, lz); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [(x0 + x1) / 2, (z0 + z1) / 2]; }

/**
 * The route from `start` (world, the hover point over the helipad). → { curve, L, at(s) → speed, marks:[{s, key}], sView }
 * opts.wide: fly the wide circle after the render pass (false after "Orbit the project again" once it has been flown).
 */
export function planTour(start, opts = {}) {
  const pts = [], add = (p, v, mark) => pts.push({ p, v, mark });
  add(start.clone(), 8);
  const phiS = Math.atan2(start.z - OC[1], start.x - OC[0]), d = Math.hypot(start.x - OC[0], start.z - OC[1]);
  let phiJ;
  if (d < 560) {   // from the pier: up the shore over the water, curving in to the orbit over 82°
    const span = 82 * D2R, n = 4, r0 = Math.max(d, R_ORBIT + 30);
    for (let k = 1; k <= n; k++) { const f = k / n; add(polar(phiS + span * f, lerp(r0, R_ORBIT, smooth(f)), lerp(start.y + 8, ALT_ORBIT, smooth(f * 1.15))), lerp(28, V_ORBIT, f), k === 1 ? 'enroute' : k === n ? 'orbit' : null); }
    phiJ = phiS + span;
  } else {         // from out on the lake: straight for the point where her course touches the orbit
    phiJ = phiS + Math.acos(R_ORBIT / d);
    const T = polar(phiJ, R_ORBIT, ALT_ORBIT), n = Math.max(1, Math.round(d / 420));
    for (let k = 1; k <= n; k++) add(new THREE.Vector3().lerpVectors(start, T, k / (n + 1)).setY(lerp(start.y + 8, ALT_ORBIT + 10, Math.min(1, k / n * 1.4))), 46, k === 1 ? 'enroute' : null);
    add(T, V_ORBIT, 'orbit');
  }
  // close orbit — at least 100° of it — ending at 20°, where she begins to open the circle and climb, evenly and always
  // turning the same way, to the developer's viewpoint 117° further round: the seat (not the helicopter's origin)
  // passes through DEFAULT_VIEW.position
  let phiE = 20 * D2R; while (phiE < phiJ + 100 * D2R) phiE += Math.PI * 2;
  const no = Math.max(2, Math.round((phiE - phiJ) / (30 * D2R)));
  for (let k = 1; k <= no; k++) add(polar(phiJ + (phiE - phiJ) * k / no, R_ORBIT, ALT_ORBIT), V_ORBIT);
  let phiV = PHI_VIEW; while (phiV < phiE + 60 * D2R) phiV += Math.PI * 2;
  { const a1 = phiV - 12 * D2R, ns = Math.max(3, Math.round((a1 - phiE) / (22 * D2R)));
    for (let k = 1; k < ns; k++) { const f = k / ns, e = 0.5 - 0.5 * Math.cos(Math.PI * f); add(polar(lerp(phiE, a1, f), lerp(R_ORBIT, R_VIEW, e), lerp(ALT_ORBIT, VIEW_P.y - HELI.seat[1], e)), lerp(V_ORBIT, 29, f)); } }
  const fx = -Math.sin(phiV), fz = Math.cos(phiV), org = new THREE.Vector3(VIEW_P.x - fx * SEAT.x + fz * SEAT.z, VIEW_P.y - SEAT.y, VIEW_P.z - fz * SEAT.x - fx * SEAT.z);
  const ring = (dphi) => { const c = Math.cos(dphi), s = Math.sin(dphi), x = org.x - OC[0], z = org.z - OC[1]; return new THREE.Vector3(OC[0] + x * c - z * s, org.y, OC[1] + x * s + z * c); };
  add(ring(-12 * D2R), 28, 'render'); add(org, 27, 'view'); add(ring(12 * D2R), 30);   // (three points of one circle: no change of bank through the viewpoint)
  if (opts.wide !== false) {
    const a0 = phiV + 12 * D2R, steps = [[32, 400, 128, 46], [60, 445, 142, 56, 'wide'], [92, R_WIDE, ALT_WIDE, 62], [124, R_WIDE, ALT_WIDE, 62], [156, R_WIDE, ALT_WIDE, 62], [188, R_WIDE - 6, ALT_WIDE - 6, 56]];
    for (const [dg, R, y, v, mk] of steps) add(polar(a0 + dg * D2R, R, y), v, mk);
  } else add(polar(phiV + 34 * D2R, R_VIEW + 30, VIEW_P.y + 6), 40);
  const curve = new THREE.CatmullRomCurve3(pts.map(q => q.p), false, 'centripetal'), K = 24, n = pts.length - 1;
  curve.arcLengthDivisions = n * K; const len = curve.getLengths(n * K), L = len[len.length - 1], sAt = pts.map((q, i) => len[i * K]);
  const at = (s) => { let i = 0; while (i < n - 1 && sAt[i + 1] < s) i++; return lerp(pts[i].v, pts[i + 1].v, smooth((s - sAt[i]) / Math.max(1e-3, sAt[i + 1] - sAt[i]))); };
  const marks = pts.map((q, i) => q.mark ? { s: sAt[i], key: q.mark } : null).filter(Boolean);
  return { curve, L, at, marks, sView: (marks.find(m => m.key === 'view') || {}).s ?? -1, pts: pts.map(q => q.p) };
}

const CSS = `
.yhl{position:absolute;inset:0;display:none;pointer-events:none}
.vw.yheli .yhl{display:block}
.vw.yheli .yh-bottom,.vw.yheli .yh-act,.vw.yheli .yh-menu,.vw.yheli .vw-pad{display:none!important}
.yhl>*{pointer-events:auto}
.yhl-labels{position:absolute;inset:0;overflow:hidden;pointer-events:none!important}
.yhl-lab{position:absolute;left:0;top:0;white-space:nowrap;font-size:10.5px;letter-spacing:.04em;color:#f6efdf;padding:3px 8px 3px 7px;border-radius:5px;background:rgba(8,8,8,.62);border-left:2px solid var(--g);
  will-change:transform;opacity:0;transition:opacity .35s;unicode-bidi:plaintext;text-shadow:0 1px 2px #000}
.yhl-lab.key{font-size:12px;font-weight:600;color:var(--g2);font-family:"Cormorant Garamond","Bodoni Moda",Georgia,serif;letter-spacing:.06em;font-size:14px}
.yhl-lab.on{opacity:1}
.yhl-lab::after{content:"";position:absolute;left:-2px;top:100%;width:1px;height:16px;background:linear-gradient(var(--g),rgba(201,164,92,0))}
.yhl-lab small{opacity:.7;font-size:9.5px;margin-inline-start:5px}
.yhl-bot{position:absolute;left:calc(8px + var(--sl));right:calc(8px + var(--sr));bottom:calc(10px + var(--sb));display:flex;flex-direction:column;align-items:center;gap:7px;pointer-events:none!important}
.yhl-bot>*{pointer-events:auto}
.yhl-read{padding:5px 16px;display:flex;gap:16px;align-items:baseline;font-variant-numeric:tabular-nums;white-space:nowrap;direction:ltr}
.yhl-read b{font-family:"Cormorant Garamond",Georgia,serif;font-size:23px;color:var(--g2);font-weight:500;display:inline-block;min-width:2.1ch;text-align:end}
.yhl-read i{font-style:normal;font-size:10px;letter-spacing:.08em;opacity:.8;text-transform:uppercase}
.yhl-btns{display:flex;gap:7px;flex-wrap:wrap;justify-content:center}
.yhl-btns .vw-btn{height:38px}
.yhl-btns [hidden]{display:none}
.yhl-pad{position:absolute;bottom:calc(150px + var(--sb));border-radius:16px;touch-action:none;display:none;direction:ltr}
.vw.yhfree .yhl-pad{display:block}
.yhl-pad.l{left:calc(12px + var(--sl));width:58px;height:150px}
.yhl-pad.r{right:calc(12px + var(--sr));width:150px;height:150px}
.yhl-pad .kn{position:absolute;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#e6c987,#b88a3c);left:calc(50% - 17px);top:calc(50% - 17px);pointer-events:none}
.yhl-pad .ax{position:absolute;background:rgba(201,164,92,.28)}
.yhl-pad.l .ax{left:28px;top:12px;bottom:12px;width:2px}.yhl-pad.r .ax{left:12px;right:12px;top:74px;height:2px}.yhl-pad.r .ax.v{left:74px;right:auto;top:12px;bottom:12px;width:2px;height:auto}
.vw.phone .yhl-read b{font-size:20px}
.vw.phone .yhl-btns .vw-btn{height:36px;padding:0 11px;font-size:10.5px}
`;

export function createHeli(yacht) {
  const walk = yacht.walk, T = (k) => HT(yacht.lang, k);
  const model = buildHeli(yacht.SM.M, yacht.shell.mats.emblem), heli = model.group;
  // the pilot's front view is a crew figure of the people atlas (the same painted-figure technique as the crew), taken
  // the first time the visitor comes to the foredeck
  let pilotDone = false;
  const pilotLook = () => { if (pilotDone) return; pilotDone = true; try { const A = yacht.people.atlas(), li = Math.max(0, yacht.people.looks.indexOf('steward_m')); model.setPilot(A.body, [(li % 8) * 256, Math.floor(li / 8) * 512]); } catch (e) { console.warn('[heli] pilot', e); } };
  heli.position.set(...PAD); yacht.root.add(heli);
  // on deck the walker goes round her (fuselage, tail boom)
  yacht.world.box(PAD[0] + HELI.bbox.x0, PAD[0] + HELI.bbox.x1, -HELI.bbox.hw, HELI.bbox.hw, Y.D2, Y.D2 + 1.9, { tag: 'static', on: () => H.state === 'parked' || H.onDeck });
  yacht.world.box(PAD[0] - 8.3, PAD[0] + HELI.bbox.x0, -0.45, 0.45, Y.D2, Y.D2 + 1.9, { tag: 'static', on: () => H.onDeck });
  model.proxy.userData.yact = () => H.board(); model.proxy.userData.reach = 9;

  const H = {
    state: 'parked', onDeck: true, riding: false, paused: false, rpm: 0, door: 0, doorT: 0,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, bank: 0, nose: 0, speed: 0, s: 0, plan: null, t: 0, kv: 1,
    wideDone: false, landPressed: false, phase: '', stats: { camToView: Infinity },
    model, group: heli,
    update, camera, board, hud, act, vis, chips, targets: () => (H.state === 'parked' && yacht.cur && (yacht.cur.id === 'fore' || yacht.cur.id === 'deck2') ? [model.proxy] : []),
    dispose, reset, planTour,
  };
  const padW = new THREE.Vector3(), padPrev = new THREE.Vector3(), padVel = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4();
  const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let padInit = false, userT = -1e9, lastYaw = 0, lastPitch = 0, fov0 = null, toastT = {}, wantIdx = 0;
  const now = () => yacht.time || 0;
  const say = (key, ms = 3600) => { H.phase = key; walk._toast(T(key), ms); };
  const once = (key, every, ms = 2600) => { if (now() - (toastT[key] ?? -1e9) > every) { toastT[key] = now(); walk._toast(T(key), ms); } };

  // ------------------------------------------------------------------ HUD
  const st = document.createElement('style'); st.textContent = CSS; walk.root.appendChild(st);
  const el = document.createElement('div'); el.className = 'yhl';
  el.innerHTML = `<div class="yhl-labels"></div>
    <div class="yhl-pad l vw-panel" data-p="l"><span class="ax"></span><span class="kn"></span></div><div class="yhl-pad r vw-panel" data-p="r"><span class="ax"></span><span class="ax v"></span><span class="kn"></span></div>
    <div class="yhl-bot"><div class="yhl-read vw-panel"><span><i class="la"></i> <b class="alt">0</b> <i class="ua"></i></span><span><i class="ls"></i> <b class="spd">0</b> <i class="us"></i></span></div>
    <div class="yhl-btns"><button class="vw-btn vw-ghost" data-h="pause"></button><button class="vw-btn vw-ghost" data-h="again"></button><button class="vw-btn vw-ghost" data-h="free"></button><button class="vw-btn vw-gold" data-h="land"></button><button class="vw-btn vw-gold" data-h="exit"></button></div></div>`;
  yacht.el.hud.appendChild(el);
  const q = (s) => el.querySelector(s), E = { labels: q('.yhl-labels'), alt: q('.alt'), spd: q('.spd'), la: q('.la'), ls: q('.ls'), ua: q('.ua'), us: q('.us'), pause: q('[data-h=pause]'), again: q('[data-h=again]'), free: q('[data-h=free]'), land: q('[data-h=land]'), exit: q('[data-h=exit]'), padL: q('.yhl-pad.l'), padR: q('.yhl-pad.r') };
  el.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b && b.dataset.h) { ev.stopPropagation(); hud(b.dataset.h); } });
  const status = (text, ms = 4200) => walk._toast(text, ms);   // (one line at a time, in the walkthrough's own toast)
  const input = { climb: 0, turn: 0, thr: 0 };
  { // free-flight pads: left = climb / descend, right = turn (x) and speed (y); they spring back
    const pad = (box, set) => { let id = null; const kn = box.querySelector('.kn');
      const upd = (ev) => { const r = box.getBoundingClientRect(), x = clamp(((ev.clientX - r.left) / r.width) * 2 - 1, -1, 1), y = clamp(1 - ((ev.clientY - r.top) / r.height) * 2, -1, 1); set(x, y); kn.style.transform = `translate(${box === E.padL ? 0 : x * (r.width / 2 - 20)}px,${-y * (r.height / 2 - 20)}px)`; };
      const end = () => { if (id == null) return; id = null; set(0, 0); kn.style.transform = ''; };
      box.addEventListener('pointerdown', (ev) => { ev.preventDefault(); id = ev.pointerId; try { box.setPointerCapture(id); } catch { /* */ } upd(ev); });
      box.addEventListener('pointermove', (ev) => { if (ev.pointerId === id) upd(ev); });
      for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) box.addEventListener(n, end); };
    pad(E.padL, (x, y) => { input.climb = y; }); pad(E.padR, (x, y) => { input.turn = x; input.thr = y; });
  }
  function texts() {
    E.la.textContent = T('alt'); E.ls.textContent = T('spd'); E.ua.textContent = T('m'); E.us.textContent = T('kmh');
    E.again.textContent = T('again'); E.exit.textContent = T('exit'); el.dir = walk.dir; buttons();
  }
  function buttons() {
    const s = H.state, air = s === 'tour' || s === 'free' || s === 'approach' || s === 'descend' || s === 'liftoff';
    E.pause.textContent = T(H.paused ? 'resume' : 'pause'); E.pause.hidden = !(s === 'tour' || s === 'approach'); E.pause.classList.toggle('on', H.paused);
    E.again.hidden = !(s === 'tour' || s === 'free' || s === 'approach');
    E.free.textContent = T(s === 'free' ? 'guided' : 'free'); E.free.hidden = !(s === 'spinup' || s === 'tour' || s === 'free' || s === 'liftoff');
    E.land.textContent = T(H.landPressed || s === 'approach' || s === 'descend' ? 'skip' : 'land'); E.land.hidden = !air || s === 'liftoff';
    E.exit.hidden = !(s === 'spinup' || s === 'seated' || s === 'spindown');
    walk.root.classList.toggle('yhfree', s === 'free' && isTouch());
  }
  function chips() {   // the "Helicopter tour" chip of the destination row (yacht.js rebuilds the row on a language change)
    const b = document.createElement('button'); b.className = 'vw-chip'; b.textContent = T('tour'); b.dataset.heli = '1';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); H.board(); }); yacht.el.dest.appendChild(b); texts(); labelTexts();
  }

  // ------------------------------------------------------------------ labels in the air: the project, the phases, the lake, landmarks
  const labels = [];
  const mkLabel = (id, pos, text, o = {}) => { const d = document.createElement('div'); d.className = 'yhl-lab' + (o.key ? ' key' : ''); E.labels.appendChild(d); const L = { id, pos: new THREE.Vector3(...pos), text, el: d, pri: o.pri ?? 5, max: o.max ?? 1e9, min: o.min ?? 0, far: !!o.far, w: 0, dyn: o.dyn || null }; labels.push(L); return L; };
  {
    const [cx, cz] = siteCentre();
    mkLabel('vrc', [cx, ROOF_Y + 26, cz], () => 'VILNYI RIVER CITY', { key: true, pri: 0, min: 300 });
    for (const id of Object.keys(BUILDINGS)) { const [x, z] = localToWorld(id, GEOM.wing.x0 / 2, 0); mkLabel(id, [x, ROOF_Y + 7, z], () => id, { key: true, pri: 1, max: 700 }); }
    mkLabel('f1', [57, 48, 86], () => 'Faza I · ' + T('phase1').replace(/^.*· ?/, ''), { pri: 2, max: 1100 });
    mkLabel('f3', [44, 44, -143], () => 'Faza III', { pri: 2, max: 1100 });
    mkLabel('lake', [-640, 6, 90], () => T('lake'), { pri: 2 });
    mkLabel('island', [LAKE.island.center[0], 14, LAKE.island.center[1]], () => T('island'), { pri: 4 });
    mkLabel('fountain', [LAKE.fountain[0], 30, LAKE.fountain[1]], () => T('fountain'), { pri: 5, max: 900 });
    mkLabel('yacht', [0, 0, 0], () => T('yacht'), { pri: 3, min: 90, dyn: (p) => p.copy(yacht.root.position).setY(22) });
    // the landmarks of the site's 360° map (panorama.js POIS — real bearings and distances from the project)
    import('../panorama.js?v=3.5.1').then(async (pm) => {
      let nameOf = (p) => p.name; try { const im = await import('../i18n-panorama.js?v=3.5.1'); if (im.poiName) nameOf = (p) => { try { return im.poiName(p) || p.name; } catch { return p.name; } }; } catch { /* plain names */ }
      const list = pm.POIS.filter(p => !p.onSite && p.id !== 'lake' && p.dist > 150 && p.dist < 4600 && (p.key || p.dist < 900)).sort((a, b) => a.dist - b.dist).slice(0, 12);
      for (const p of list) { const [dx, dz] = dirOfBearing(p.bearing); mkLabel('poi-' + p.id, [cx + dx * p.dist, 14, cz + dz * p.dist], () => nameOf(p), { pri: p.dist < 1500 ? 4 : 6, far: true, dist: p.dist }).dist = p.dist; }
      labelTexts(); H.pois = list.length;
    }).catch(() => { H.pois = 0; });
  }
  function labelTexts() { for (const L of labels) { const t = typeof L.text === 'function' ? L.text() : L.text; L.el.textContent = t; if (L.dist) { const s = document.createElement('small'); s.textContent = (L.dist / 1000).toFixed(1) + ' km'; L.el.appendChild(s); } L.w = 0; } }
  const placed = [];
  function labelTick() {
    const cam = walk.camera, W = walk.canvas.clientWidth || 390, Ht = walk.canvas.clientHeight || 844, show = H.riding && (H.state === 'tour' || H.state === 'free' || H.state === 'approach');
    placed.length = 0; let n = 0;
    const order = labels.slice().sort((a, b) => a.pri - b.pri);
    for (const L of order) {
      let on = false;
      if (show && n < 7) {
        if (L.dyn) L.dyn(L.pos);
        const dist = cam.position.distanceTo(L.pos);
        if (dist < L.max && dist > L.min && (L.far || dist < 2600)) {
          _v.copy(L.pos).project(cam);
          if (_v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 0.94 && _v.y > -0.55 && _v.y < 0.8) {
            if (!L.w) { L.w = L.el.offsetWidth || 90; L.h = L.el.offsetHeight || 20; }
            const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * Ht - L.h - 16;
            const r = [x - 4, y - 4, x + L.w + 4, y + L.h + 20];
            if (r[2] < W - 4 && !placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) { placed.push(r); L.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; on = true; n++; }
          }
        }
      }
      if (on !== L.on) { L.on = on; L.el.classList.toggle('on', on); }
    }
    H.labelsOn = n;
  }

  // ------------------------------------------------------------------ sound: rotor and turbine, synthesised (follows the yacht's mute)
  let snd = null;
  function sound() {
    const A = yacht.audio, ac = A && A.ac, out = A && A.master; if (!ac || !out) return null;
    if (snd && snd.ac === ac) return snd;
    try {
      const n = ac.sampleRate * 2, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; const chop = ac.createGain(); chop.gain.value = 0.5;
      const lfo = ac.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 4; const lg = ac.createGain(); lg.gain.value = 0.42; lfo.connect(lg).connect(chop.gain);
      const thump = ac.createOscillator(); thump.type = 'triangle'; thump.frequency.value = 20; const tg = ac.createGain(); tg.gain.value = 0;
      const whine = ac.createOscillator(); whine.type = 'sine'; whine.frequency.value = 600; const wg = ac.createGain(); wg.gain.value = 0;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(lp).connect(chop).connect(g); thump.connect(tg).connect(g); whine.connect(wg).connect(g); g.connect(out);
      src.start(); lfo.start(); thump.start(); whine.start();
      snd = { ac, g, lfo, lp, thump, tg, whine, wg, stop() { try { g.gain.setTargetAtTime(0, ac.currentTime, 0.2); for (const o of [src, lfo, thump, whine]) o.stop(ac.currentTime + 1); } catch { /* */ } } };
    } catch { snd = null; }
    return snd;
  }
  function soundTick() {
    if (H.rpm < 0.01) { if (snd) { snd.stop(); snd = null; } return; }
    const s = sound(); if (!s) return; const t = s.ac.currentTime, k = H.rpm, inside = H.riding ? 1 : 0;
    s.lfo.frequency.setTargetAtTime(2 + 24 * k, t, 0.1); s.thump.frequency.setTargetAtTime(4 + 22 * k, t, 0.1);   // blade passing: five blades at up to 5.2 turns a second
    s.lp.frequency.setTargetAtTime(inside ? 380 + 240 * k : 700 + 500 * k, t, 0.2);
    s.tg.gain.setTargetAtTime(0.16 * k, t, 0.2); s.whine.frequency.setTargetAtTime(500 + 1500 * k, t, 0.3); s.wg.gain.setTargetAtTime(0.012 * k * (inside ? 0.6 : 1), t, 0.3);
    const near = H.riding ? 1 : clamp(1 - walk.camera.position.distanceTo(heli.getWorldPosition(_v2)) / 60, 0, 1);
    s.g.gain.setTargetAtTime((inside ? 0.2 : 0.34) * (0.25 + 0.75 * k) * near, t, 0.25);
  }

  // ------------------------------------------------------------------ the helipad in the world
  function padUpdate(dt) {
    padW.set(...PAD).applyMatrix4(yacht.root.matrixWorld);
    if (!padInit) { padPrev.copy(padW); padInit = true; }
    if (dt > 1e-5) { _v.copy(padW).sub(padPrev).divideScalar(dt); if (_v.length() < 30) padVel.lerp(_v, damp(4, dt)); }
    padPrev.copy(padW);
  }
  const padYaw = () => yacht.helm.pose.yaw;
  function toAir() {
    heli.updateWorldMatrix(true, false); H.pos.setFromMatrixPosition(heli.matrixWorld); H.yaw = padYaw(); H.bank = 0; H.nose = 0;
    walk.scene.add(heli); H.onDeck = false; pose();
  }
  function toDeck() { yacht.root.add(heli); heli.position.set(...PAD); heli.quaternion.identity(); H.onDeck = true; H.bank = H.nose = 0; H.vel.set(0, 0, 0); H.speed = 0; heli.updateWorldMatrix(true, true); }
  // world pose from position, heading, nose-down and bank angles
  function pose() {
    _f.set(Math.cos(H.yaw), 0, -Math.sin(H.yaw)); _r.set(-_f.z, 0, _f.x);
    const cn = Math.cos(H.nose), sn = Math.sin(H.nose), cb = Math.cos(H.bank), sb = Math.sin(H.bank);
    const f = _v.copy(_f).multiplyScalar(cn).addScaledVector(UP, -sn), u = _u.copy(UP).multiplyScalar(cn).addScaledVector(_f, sn);
    const r = _v2.copy(_r).multiplyScalar(cb).addScaledVector(u, -sb), ub = u.multiplyScalar(cb).addScaledVector(_r, sb);
    heli.quaternion.setFromRotationMatrix(_m.makeBasis(f, ub, r)); heli.position.copy(H.pos);
    heli.updateMatrix(); heli.updateMatrixWorld(true);
  }
  // heading towards yawT with a coordinated bank; v: ground speed
  function steer(yawT, v, dt, rate = 2.2) {
    const dy = wrap(yawT - H.yaw), w = clamp(dy * rate, -0.55, 0.55); H.yaw = wrap(H.yaw + w * dt);
    H.bank += (clamp(-Math.atan(v * w / G) * 0.8, -0.5, 0.5) - H.bank) * damp(1.6, dt);
  }

  // ------------------------------------------------------------------ boarding and leaving
  const seatPose = () => ({ x: PAD[0] + SEAT.x, y: PAD[1] + SEAT.y, z: PAD[2] + SEAT.z, yaw: SEAT_YAW, pitch: -0.12, lim: 2.25, pmin: -1.15, pmax: 0.55, kind: 'heli', tapUp: false, onEnd });
  let doorGen = 0;
  const doorTo = (k, ms = 900) => new Promise(res => { const gen = ++doorGen, d0 = H.door, t0 = performance.now(); if (window.VRC_HELI_FAST) { H.door = k; model.setDoor(k); return res(); }
    const tick = () => { if (gen !== doorGen) return res(); const u = Math.min(1, (performance.now() - t0) / ms); H.door = d0 + (k - d0) * u; model.setDoor(H.door); if (u < 1 && !yacht.disposed) requestAnimationFrame(tick); else res(); }; tick(); });
  async function board() {
    if (H.state !== 'parked' || yacht.busy || !yacht.active) return false;
    if (yacht.mode !== 'walk') { await yacht._endPose(); if (yacht.mode !== 'walk') return false; }
    H.state = 'boarding';
    try {
      const w = yacht.w, far = !yacht.cur || Math.abs(w.y - Y.D2) > 0.6 || Math.hypot(w.x - PAD[0], w.z - 2.6) > 9;
      if (far) await yacht.goTo('fore');
      if (yacht.dropDrink) yacht.dropDrink(true);
      yacht.audio.sfx('door'); status(T('seat') + ' · ' + T('look'), 4200); await doorTo(1);
      const ok = await yacht.pose(seatPose(), window.VRC_HELI_FAST ? 60 : 1300);
      if (!ok || !yacht.active) { await doorTo(0); H.state = 'parked'; return false; }
      H.riding = true; walk.root.classList.add('yheli'); for (const g of model.glass) g.visible = false;
      lastYaw = walk.player.tYaw; lastPitch = walk.player.tPitch; userT = now();
      yacht.audio.sfx('door'); await doorTo(0);
      if (H.state !== 'boarding') return false;
      H.state = 'spinup'; H.t = 0; H.landPressed = false; H.paused = false; H.kv = 1; H.mode = 'guided'; H.wideDone = false; buttons();
      setTimeout(() => { if (H.state === 'spinup') walk._toast('“' + T('pilot') + '”', 3800); }, 2600); setTimeout(() => { if (H.state === 'spinup') status(T('start'), 2400); }, 600);
      yacht._zoneChanged(yacht.cur);
      return true;
    } catch (e) { console.warn('[heli] board', e); reset(true); return false; }
  }
  // the seat is given up: instantly (a teleport, leaving the yacht — the flight ends on the spot) or by stepping out
  async function onEnd(instant) {
    if (instant || !H.exiting) { reset(true); if (!instant) walk._toast(T('aborted'), 2200); return; }
    H.riding = false; walk.root.classList.remove('yheli', 'yhfree'); for (const g of model.glass) g.visible = true; fovReset();
  }
  async function stepOut() {
    if (H.exiting || !H.riding) return; H.exiting = true;
    try { yacht.audio.sfx('door'); await doorTo(1); await yacht._endPose(); await doorTo(0); } finally { H.exiting = false; if (H.state === 'seated' || H.state === 'spinup') H.state = 'spindown'; buttons(); yacht._zoneChanged(yacht.cur); }
  }
  function reset(hard) {
    if (!H.onDeck) toDeck();
    heli.visible = true;
    H.state = 'parked'; H.riding = false; H.paused = false; H.plan = null; H.exiting = false; H.landPressed = false;
    if (hard) { H.rpm = 0; H.door = 0; model.setDoor(0); model.setRpm(0); if (snd) { snd.stop(); snd = null; } }
    walk.root.classList.remove('yheli', 'yhfree'); for (const g of model.glass) g.visible = true; model.landing.visible = false; fovReset();
    buttons();
    try { if (yacht.cur) yacht._zoneChanged(yacht.cur); } catch { /* */ }
  }
  function fovReset() { if (fov0 != null) { fov0 = null; try { walk._applyFov(); } catch { /* */ } } }

  // ------------------------------------------------------------------ buttons
  function hud(k) {
    const s = H.state;
    if (k === 'pause' && (s === 'tour' || s === 'approach')) { H.paused = !H.paused; }
    else if (k === 'again' && (s === 'tour' || s === 'free' || s === 'approach')) { H.plan = planTour(H.pos, { wide: !H.wideDone }); H.s = 0; H.mark = 0; H.state = 'tour'; H.paused = false; H.landPressed = false; H.mode = 'guided'; say('orbit'); }
    else if (k === 'free') {
      if (s === 'free') { H.plan = planTour(H.pos, { wide: !H.wideDone }); H.s = 0; H.mark = 0; H.state = 'tour'; H.mode = 'guided'; say('orbit'); }
      else if (s === 'tour') { H.state = 'free'; H.mode = 'free'; H.paused = false; status(T(isTouch() ? 'freeHint' : 'freeKeys'), 9000); }
      else { H.mode = H.mode === 'free' ? 'guided' : 'free'; E.free.classList.toggle('on', H.mode === 'free'); }
    }
    else if (k === 'land') {
      if (s === 'tour' || s === 'free' || s === 'liftoff') { if (s === 'liftoff') return; H.state = 'approach'; H.paused = false; H.landPressed = true; say('home'); }
      else if (s === 'approach' || s === 'descend') skip();
    }
    else if (k === 'exit') { if (s === 'spinup' || s === 'seated' || s === 'spindown') stepOut(); }
    buttons();
  }
  async function skip() {
    if (H.skipping) return; H.skipping = true;
    try { await walk._fade(true); if (H.riding && !H.onDeck) { toDeck(); touchdown(); H.rpm = Math.min(H.rpm, 0.5); } } finally { await walk._fade(false); H.skipping = false; }
  }
  function touchdown() { H.state = 'spindown'; H.t = 0; model.landing.visible = false; say('landed', 3000); buttons(); yacht._zoneChanged(yacht.cur); }
  function act() {
    if (H.state !== 'parked' || yacht.mode !== 'walk' || yacht.busy) return null;
    const w = yacht.w; if (w.dock || Math.abs(w.y - Y.D2) > 0.6 || Math.hypot(w.x - (PAD[0] - 0.1), w.z - 1.2) > 6.5) return null;
    return { label: T('board'), fn: () => H.board() };
  }
  // open decks show their furniture, pool and guests from the air (they are built once, while the rotors run up)
  const AIR_ZONES = ['sundeck', 'aft', 'upaft', 'mterr', 'swim'];
  // parked, she is drawn only from where the foredeck can be seen (from the stern decks and the rooms the superstructure hides her)
  const SEE = new Set(['fore', 'deck2', 'deck3', 'deck4', 'mterr', 'master', 'bridge', 'quay']);
  function vis(set) { if (H.riding && H.state !== 'parked' && H.state !== 'boarding') for (const id of AIR_ZONES) set.add(id); return set; }

  // ------------------------------------------------------------------ per frame
  function update(dt) {
    if (yacht.lang !== H.lang) { H.lang = yacht.lang; texts(); labelTexts(); }
    padUpdate(dt); H._dt = dt;
    { const c = yacht.cur, see = !H.onDeck || !c || SEE.has(c.id); if (heli.visible !== see) heli.visible = see; }
    const s = H.state; H.t += dt;
    // rotor speed
    const rpmT = s === 'spinup' || s === 'liftoff' || s === 'tour' || s === 'free' || s === 'approach' || s === 'descend' ? 1 : 0;
    H.rpm += (rpmT - H.rpm) * damp(rpmT ? 0.42 : 0.3, dt); if (!rpmT && H.rpm < 0.004) H.rpm = 0;
    if (H.rpm > 0 || H._rpmShown) { model.rotor.rotation.y += H.rpm * 33 * dt; model.tailRotor.rotation.z += H.rpm * 120 * dt; model.setRpm(H.rpm, H.riding); H._rpmShown = H.rpm > 0; }
    model.beacon.visible = H.rpm > 0.05 && ((now() * 1.1) % 1) < 0.16;
    model.setNight(walk.envMode === 'night' ? 1 : walk.envMode === 'dusk' ? 0.7 : 0);

    if (s === 'spinup') {
      // the open decks are made ready for the view from above while the rotors run up
      if (!yacht._building && !yacht._want_build) { for (let i = 0; i < AIR_ZONES.length; i++) { const z = yacht.zones.get(AIR_ZONES[(wantIdx + i) % AIR_ZONES.length]); if (z && !z.built) { yacht._want_build = z; wantIdx += i + 1; break; } } }
      if (H.rpm > 0.94 && H.t > 6.5) { if (H.mode === 'free') E.free.classList.remove('on'); H.state = 'liftoff'; H.t = 0; toAir(); model.landing.visible = true; say('lift', 2600); buttons(); yacht._zoneChanged(yacht.cur); }
    } else if (s === 'liftoff') {
      const k = smooth(H.t / 6.5); H.pos.copy(padW).y += HOVER * k; H.yaw = padYaw(); H.vel.copy(padVel); H.speed = padVel.length();
      H.nose += (0 - H.nose) * damp(2, dt); H.bank += (0 - H.bank) * damp(2, dt); pose();
      if (H.t >= 6.5) { H.plan = planTour(H.pos, { wide: true }); H.s = 0; H.mark = 0; H.speed = padVel.length(); H.state = H.mode === 'free' ? 'free' : 'tour'; if (H.state === 'free') status(T(isTouch() ? 'freeHint' : 'freeKeys'), 9000); buttons(); }
    } else if (s === 'tour') tour(dt);
    else if (s === 'free') free(dt);
    else if (s === 'approach') approach(dt);
    else if (s === 'descend') descend(dt);
    else if (s === 'spindown') {
      if (H.riding && H.t > 2.2 && !H.exiting) stepOut();
      if (!H.riding && H.rpm < 0.01) { H.state = 'parked'; H.rpm = 0; model.setRpm(0); buttons(); }
    }
    // HUD read-outs and labels
    if (H.riding) {
      const alt = Math.max(0, (H.onDeck ? padW.y : H.pos.y) - WATER_Y), kmh = (H.onDeck ? padVel.length() : H.speed) * 3.6;
      const a = String(Math.round(alt)), v = String(Math.round(kmh)); if (E.alt.textContent !== a) E.alt.textContent = a; if (E.spd.textContent !== v) E.spd.textContent = v;
    } else if (H.labelsOn) labelTick();
    if (heli.parent && (yacht.root.visible || !H.onDeck)) { _v.copy(walk.camera.position); heli.worldToLocal(_v); model.facePilot(_v); if (!pilotDone && _v.length() < 40) pilotLook(); }
    soundTick();
  }
  function tour(dt) {
    const P = H.plan; H.kv += ((H.paused ? 0 : 1) - H.kv) * damp(1.1, dt);
    H.speed += (P.at(H.s) * H.kv - H.speed) * damp(0.8, dt); H.s += H.speed * dt;
    while (H.mark < P.marks.length && P.marks[H.mark].s <= H.s + 40) { const k = P.marks[H.mark++].key; if (k !== 'view') say(k, 4200); if (k === 'wide') H.wideDone = true; }
    if (H.s >= P.L - 0.5) { P.curve.getTangentAt(1, _v); H.vel.copy(_v).multiplyScalar(H.speed); H.state = 'approach'; say('home'); buttons(); return; }
    const u = H.s / P.L; P.curve.getPointAt(u, H.pos); P.curve.getTangentAt(u, _v);
    H.vel.copy(_v).multiplyScalar(H.speed);
    steer(Math.atan2(-_v.z, _v.x), H.speed, dt, 2.6);
    H.nose += (clamp(H.speed / 60 * 0.085 - _v.y * 0.25, -0.12, 0.14) - H.nose) * damp(1.2, dt);
    pose();
    // the render's viewpoint: how close the passenger's eye comes to it
    if (P.sView > 0 && Math.abs(H.s - P.sView) < 80) { const dv = _v2.copy(SEAT).applyMatrix4(heli.matrixWorld).distanceTo(VIEW_P); if (dv < H.stats.camToView) H.stats.camToView = dv; }
  }
  // back to the helipad, wherever it is and however it moves: fly to a point above it, matching the yacht's way, then
  // settle on it
  function approach(dt) {
    H.kv += ((H.paused ? 0 : 1) - H.kv) * damp(1.1, dt);
    const dx = padW.x - H.pos.x, dz = padW.z - H.pos.z, dh = Math.hypot(dx, dz);
    const vmax = H.landPressed ? 52 : 46, vd = Math.min(vmax, 0.4 + dh * 0.4) * H.kv;
    _v.set(dx / (dh || 1) * vd + padVel.x * H.kv, 0, dz / (dh || 1) * vd + padVel.z * H.kv);
    H.vel.x += (_v.x - H.vel.x) * damp(1.3, dt); H.vel.z += (_v.z - H.vel.z) * damp(1.3, dt);
    const yT = padW.y + 16 + clamp((dh - 25) * 0.14, 0, 118), vy = clamp((yT - H.pos.y) * 0.8, -9, 7) * H.kv; H.vel.y += (vy - H.vel.y) * damp(1.5, dt);
    H.pos.addScaledVector(H.vel, dt); H.speed = Math.hypot(H.vel.x, H.vel.z);
    const rel = Math.hypot(H.vel.x - padVel.x, H.vel.z - padVel.z);
    steer(dh > 45 && rel > 3 ? Math.atan2(-(H.vel.z - padVel.z * 0.5), H.vel.x - padVel.x * 0.5) : padYaw(), H.speed, dt, dh > 45 ? 2.2 : 1.2);
    H.nose += (clamp(H.speed / 60 * 0.08 - (vd < H.speed ? 0.05 : 0), -0.1, 0.12) - H.nose) * damp(1.2, dt);
    pose();
    if (dh < 90 && H.phase !== 'landing') say('landing', 3600);
    if (dh < 1.6 && rel < 1.4 && Math.abs(wrap(padYaw() - H.yaw)) < 0.2 && Math.abs(H.pos.y - yT) < 3 && !H.paused) { H.state = 'descend'; H.t = 0; H.off = _v.copy(H.pos).sub(padW).clone(); buttons(); }
  }
  function descend(dt) {
    const o = H.off; o.x += (0 - o.x) * damp(1.6, dt); o.z += (0 - o.z) * damp(1.6, dt); o.y = Math.max(0, o.y - clamp(o.y * 0.5, 0.45, 4.2) * dt);
    H.pos.copy(padW).add(o); H.vel.copy(padVel); H.speed = padVel.length();
    H.yaw = wrap(H.yaw + wrap(padYaw() - H.yaw) * damp(2.5, dt)); H.bank += (0 - H.bank) * damp(2, dt); H.nose += (0 - H.nose) * damp(2, dt); pose();
    if (o.y <= 0.012) { toDeck(); touchdown(); }
  }
  // free flight: arcade controls with soft limits (minimum height over land and water, a ceiling, the edge of the area)
  function free(dt) {
    const K = walk.keys; let thr = input.thr, turn = input.turn, climb = input.climb;
    if (K.has('KeyW')) thr += 1; if (K.has('KeyS')) thr -= 1; if (K.has('KeyA')) turn -= 1; if (K.has('KeyD')) turn += 1; if (K.has('KeyE') || K.has('KeyR')) climb += 1; if (K.has('KeyQ')) climb -= 1;
    thr = clamp(thr, -1, 1); turn = clamp(turn, -1, 1); climb = clamp(climb, -1, 1);
    H.fv = (H.fv ?? H.speed) + ((thr >= 0 ? thr * 55 : thr * 8) - (H.fv ?? H.speed)) * damp(thr ? 0.5 : 0.25, dt); H.speed = Math.abs(H.fv);
    // edge of the area: she turns back for the project by herself
    const ex = H.pos.x - OC[0], ez = H.pos.z - OC[1], ed = Math.hypot(ex, ez);
    let w = -turn * 0.62;
    if (ed > 1650) { const back = wrap(Math.atan2(ez, -ex) - H.yaw); w = clamp(back * 1.2, -0.62, 0.62); once('edge', 8); }
    H.yaw = wrap(H.yaw + w * dt); H.bank += (clamp(-Math.atan(H.fv * w / G) * 0.8, -0.5, 0.5) - H.bank) * damp(1.8, dt);
    H.nose += (clamp(H.fv / 60 * 0.1, -0.06, 0.13) - H.nose) * damp(1.4, dt);
    H.vel.set(Math.cos(H.yaw) * H.fv, 0, -Math.sin(H.yaw) * H.fv); H.pos.addScaledVector(H.vel, dt);
    const floor = clearance(H.pos.x, H.pos.z) > 25 ? 16 : 62, ceil = 340;
    H.fy = (H.fy ?? 0) + (climb * 11 - (H.fy ?? 0)) * damp(1.6, dt); H.pos.y += H.fy * dt;
    if (H.pos.y < floor) { H.pos.y += (floor - H.pos.y) * damp(1.4, dt); if (climb < 0) once('low', 8); H.fy = Math.max(0, H.fy); }
    if (H.pos.y > ceil) { H.pos.y += (ceil - H.pos.y) * damp(1.4, dt); H.fy = Math.min(0, H.fy); }
    pose();
  }

  // ------------------------------------------------------------------ the passenger's camera (yacht.js calls it instead of its own while riding)
  const _qe = new THREE.Quaternion(), _t = new THREE.Vector3();
  function camera() {
    const cam = walk.camera, P = walk.player;
    heli.updateWorldMatrix(true, false);
    // look assist: left alone for a few seconds the gaze returns to the project (or the yacht on the way home)
    const air = H.state === 'tour' || H.state === 'approach';
    if (Math.abs(P.tYaw - lastYaw) > 1e-4 || Math.abs(P.tPitch - lastPitch) > 1e-4 || walk._dragging) userT = now();
    const P2 = H.plan, nearView = H.state === 'tour' && P2 && P2.sView > 0 && Math.abs(H.s - P2.sView) < 70;
    if (air && now() - userT > (nearView ? 2.2 : 5)) {
      _t.copy(H.state === 'approach' ? padW : VIEW_T); heli.worldToLocal(_t).sub(SEAT);
      const yawW = Math.atan2(-_t.x, -_t.z), pitchW = Math.atan2(_t.y, Math.hypot(_t.x, _t.z)); H.stats.look = [yawW, pitchW, P.tYaw, P.tPitch, P.yaw, P.pitch, nearView ? 1 : 0];
      let dy = wrap(yawW - P.tYaw); const k = damp(nearView ? 5 : 1.6, H._dt || 0.016);
      const c0 = yacht.seat ? yacht.seat.yaw : SEAT_YAW;   // (yacht.pose() may have moved the seat's yaw by a whole turn)
      P.tYaw = clamp(P.tYaw + dy * k, c0 - 2.25, c0 + 2.25); P.tPitch = clamp(P.tPitch + (pitchW - P.tPitch) * k, -1.15, 0.55);
      if (nearView) { P.yaw += wrap(P.tYaw - P.yaw) * k; P.pitch += (P.tPitch - P.pitch) * k; }
    }
    lastYaw = P.tYaw; lastPitch = P.tPitch;
    // on a wide screen the pass through the render's viewpoint narrows the lens to the render's own
    if (nearView && cam.aspect > 1.25 && now() - userT > 2.2) { if (fov0 == null) fov0 = cam.fov; const f = lerp(fov0, DEFAULT_VIEW.fov, smooth(1 - Math.abs(H.s - P2.sView) / 70)); if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); } }
    else if (fov0 != null) fovReset();
    const vib = H.rpm * (H.onDeck ? 0.0016 : 0.0009), t = now();
    cam.position.copy(SEAT); cam.position.y += Math.sin(t * 61) * vib; cam.position.z += Math.sin(t * 47) * vib * 0.6; cam.position.applyMatrix4(heli.matrixWorld);
    heli.getWorldQuaternion(_q); _e.set(P.pitch, P.yaw, 0, 'YXZ'); cam.quaternion.copy(_q).multiply(_qe.setFromEuler(_e));
    // through the render's viewpoint the view is the render's: aimed at its target, horizon level (unless the visitor looks elsewhere)
    if (nearView && now() - userT > 2.2) { const m = smooth(1 - Math.abs(H.s - P2.sView) / 70); cam.quaternion.slerp(_qe.setFromRotationMatrix(_m.lookAt(cam.position, VIEW_T, UP)), m); }
    P.pos.copy(cam.position); P.pos.y -= P.eye || 1.62; walk._targetY = P.pos.y;
    H.frame = (H.frame || 0) + 1; if (H.frame % 2 === 0) { cam.updateMatrixWorld(true); cam.matrixWorldInverse.copy(cam.matrixWorld).invert(); labelTick(); }
  }

  function dispose() {
    try { if (snd) snd.stop(); } catch { /* */ }
    if (heli.parent) heli.parent.remove(heli); model.dispose(); el.remove(); st.remove(); walk.root.classList.remove('yheli', 'yhfree');
  }
  texts(); model.setRpm(0); model.setDoor(0); chips();
  return H;
}
