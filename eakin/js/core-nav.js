// core-nav.js — Street-View / Matterport style navigation for the walk (3D) and 360 modes:
//   • floor cursor (soft ring + dot, aligned to the surface normal) that follows the mouse / crosshair
//   • 3D chevron arrows on the floor toward neighbouring rooms (walk) / 360 nodes (pano), hover label in Hebrew
//   • click an arrow → smooth glide along the nav graph (doors opened on the way); double-click / double-tap on the
//     floor → glide there; double-click on a wall / furniture → step 1.5 m forward
//   • "ניווט בלחיצות" (click navigation: free cursor, drag = look) vs "ניווט חופשי (WASD)" (pointer lock)
// Owner: NAV. No side effects on import (everything is created inside createNav / createArrowSet / createFloorCursor).
import * as THREE from 'three';
import { buildNavGraph } from './navgraph.js';

export const NAV_FLOOR_HE = { upper: 'קומה עליונה', main: 'קומת כניסה', basement: 'מרתף', outside: 'חוץ' };
const FLOOR_RANK = { basement: 0, main: 1, outside: 1, upper: 2 };
const EYE = 1.6;
const UPV = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = a - b; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d); };

/* =========================================================================================== shared look */
let KIT = null;
function kit() {
  if (KIT) return KIT;
  // chevron outline in shape space (meters, tip toward +Y)
  const w = 0.25, k = 0.82, t = 0.115, a = 0.155;
  const P = [[0, a], [-w, a - w * k], [-w, a - w * k - t], [0, a - t], [w, a - w * k - t], [w, a - w * k]];
  const s = new THREE.Shape();
  s.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]); s.closePath();
  const chev = new THREE.ExtrudeGeometry(s, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.013, bevelSegments: 2, curveSegments: 1, steps: 1 });
  chev.rotateX(-Math.PI / 2); // +Y (tip) → −Z, extrusion → +Y (up)
  chev.translate(0, 0.012, 0);
  chev.computeBoundingSphere();
  // soft chevron blob (shadow / glow): white chevron blurred via canvas shadow (works in every browser)
  const N = 256, SPAN = 0.95, S = N / SPAN;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.clearRect(0, 0, N, N);
  const OFF = 2000;
  g.save(); g.translate(-OFF, 0);
  g.shadowColor = 'rgba(255,255,255,1)'; g.shadowBlur = 20; g.shadowOffsetX = OFF;
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 10; g.lineJoin = 'round';
  g.beginPath(); P.forEach(([x, y], i) => { const px = N / 2 + x * S, py = N / 2 - y * S; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath();
  g.fill(); g.stroke(); g.restore();
  const blob = new THREE.CanvasTexture(c); blob.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.PlaneGeometry(SPAN, SPAN); plane.rotateX(-Math.PI / 2); // canvas top → −Z (same as chevron tip)
  // radial soft disc (cursor halo)
  const d = document.createElement('canvas'); d.width = d.height = 64;
  const dg = d.getContext('2d'); const gr = dg.createRadialGradient(32, 32, 4, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = gr; dg.fillRect(0, 0, 64, 64);
  const disc = new THREE.CanvasTexture(d); disc.colorSpace = THREE.SRGBColorSpace;
  KIT = { chev, blob, plane, disc };
  return KIT;
}

let STYLE_DONE = false;
function injectStyle() {
  if (STYLE_DONE || typeof document === 'undefined') return;
  STYLE_DONE = true;
  const st = document.createElement('style'); st.id = 'navStyle';
  st.textContent = `
#navLabels{position:fixed;inset:0;pointer-events:none;z-index:9;overflow:hidden}
.navLbl{position:absolute;left:0;top:0;padding:6px 12px;border-radius:999px;background:rgba(12,16,24,.8);border:1px solid rgba(255,255,255,.28);color:#fff;font:600 13.5px/1.25 var(--font,system-ui,sans-serif);white-space:nowrap;text-align:center;direction:rtl;opacity:0;transition:opacity .18s ease;box-shadow:0 6px 18px rgba(0,0,0,.35);will-change:transform}
.navLbl small{display:block;font-weight:500;font-size:11px;color:var(--accent,#43e0ff)}
.navLbl.show{opacity:1}
body.touch .navLbl{font-size:12px;padding:4px 10px}
#navMode{display:none}
body.mode-walk:not(.touch) #navMode{display:flex}
#navMode button{font-size:11.5px;line-height:1.15;text-align:center}
#navMode button.on{background:rgba(67,224,255,.2);color:#cff8ff;box-shadow:inset 0 0 0 1px rgba(67,224,255,.55)}
body.nav-click.mode-walk:not(.touch):not(.measuring) #crosshair{display:none}
body.nav-click.mode-walk:not(.touch) #hoverLabel{left:var(--nav-hx,50%);top:calc(var(--nav-hy,50%) + 30px)}
`;
  document.head.appendChild(st);
}
function labelLayer() {
  let el = document.getElementById('navLabels');
  if (!el) { el = document.createElement('div'); el.id = 'navLabels'; document.body.appendChild(el); }
  return el;
}

/* =========================================================================================== arrow set */
// items: {x,y,z, yaw (rad, chevron heading: look-direction convention), label, sub, data}
export function createArrowSet(scene, opts = {}) {
  injectStyle();
  const K = kit();
  const touch = !!opts.touch;
  const root = new THREE.Group(); root.name = opts.name || 'nav-arrows'; root.userData.__core = true; root.visible = false;
  scene.add(root);
  const layer = opts.labelLayer || labelLayer();
  const items = [];
  let overlay = false, vis = 0, visTarget = 1, hover = null, time = 0;
  const _v = new THREE.Vector3(), _r = new THREE.Vector3();

  function makeItem() {
    const g = new THREE.Group(); g.userData.__core = true;
    const chevMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.42, roughness: 0.32, metalness: 0, transparent: true, opacity: 0.95, depthWrite: false });
    const shadowMat = new THREE.MeshBasicMaterial({ map: K.blob, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const glowMat = new THREE.MeshBasicMaterial({ map: K.blob, color: 0x6fe9ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const shadow = new THREE.Mesh(K.plane, shadowMat); shadow.position.set(0, 0.004, 0.035); shadow.scale.setScalar(1.12); shadow.renderOrder = 960;
    const glow = new THREE.Mesh(K.plane, glowMat); glow.position.y = 0.006; glow.scale.setScalar(1.35); glow.renderOrder = 961;
    const chev = new THREE.Mesh(K.chev, chevMat); chev.position.y = 0.008; chev.renderOrder = 962;
    for (const m of [shadow, glow, chev]) { m.castShadow = false; m.receiveShadow = false; m.userData.__core = true; }
    g.add(shadow, glow, chev);
    const el = document.createElement('div'); el.className = 'navLbl'; el.innerHTML = '<span></span><small></small>';
    layer.appendChild(el);
    const it = { g, chev, shadow, glow, chevMat, shadowMat, glowMat, el, alpha: 0, scale: 1, hover: false, phase: Math.random() * 6, data: null, x: 0, y: 0, z: 0, yaw: 0, sx: -1e4, sy: -1e4, onScreen: false, label: '', sub: '' };
    applyOverlay(it);
    return it;
  }
  function applyOverlay(it) {
    for (const m of [it.chevMat, it.shadowMat, it.glowMat]) m.depthTest = !overlay;
    it.chev.renderOrder = overlay ? 999 : 962; it.shadow.renderOrder = overlay ? 997 : 960; it.glow.renderOrder = overlay ? 998 : 961;
  }
  function set(list) {
    list = list || [];
    while (items.length > list.length) {
      const it = items.pop(); root.remove(it.g); it.el.remove();
      it.chevMat.dispose(); it.shadowMat.dispose(); it.glowMat.dispose();
      if (hover === it) hover = null;
    }
    for (let i = 0; i < list.length; i++) {
      let it = items[i];
      const L = list[i];
      if (!it) { it = makeItem(); items.push(it); root.add(it.g); }
      const same = it.data && L.key != null && it.key === L.key;
      if (!same) it.alpha = 0;
      it.key = L.key; it.data = L.data; it.label = L.label || ''; it.sub = L.sub || '';
      it.el.firstChild.textContent = it.label; it.el.lastChild.textContent = it.sub; it.el.lastChild.style.display = it.sub ? '' : 'none';
      place(it, L.x, L.y, L.z, L.yaw);
    }
    root.visible = items.length > 0;
  }
  function place(it, x, y, z, yaw) {
    it.x = x; it.y = y; it.z = z; if (yaw != null) it.yaw = yaw;
    it.g.position.set(x, y, z); it.g.rotation.set(0, it.yaw, 0);
  }
  function setOverlay(on) { on = !!on; if (on === overlay) return; overlay = on; for (const it of items) applyOverlay(it); }
  function setVisible(on) { visTarget = on ? 1 : 0; }
  function setHover(it) {
    if (hover === it) return;
    if (hover) hover.hover = false;
    hover = it || null;
    if (hover) hover.hover = true;
  }
  function update(dt, camera, rect) {
    time += dt;
    vis += (visTarget - vis) * (1 - Math.exp(-(visTarget > vis ? 7 : 12) * dt));
    if (Math.abs(vis - visTarget) < 0.01) vis = visTarget;
    root.visible = items.length > 0 && vis > 0.01;
    const W = rect ? rect.width : window.innerWidth, H = rect ? rect.height : window.innerHeight, L0 = rect ? rect.left : 0, T0 = rect ? rect.top : 0;
    for (const it of items) {
      it.alpha = Math.min(1, it.alpha + dt * 3.2);
      const a = it.alpha * vis;
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.6 + it.phase);
      const target = it.hover ? 1.22 : 1;
      it.scale += (target - it.scale) * (1 - Math.exp(-14 * dt));
      const s = it.scale * (1 + 0.035 * pulse);
      it.g.scale.set(s, 1, s);
      it.chev.position.y = 0.008 + 0.01 * pulse;
      it.chevMat.opacity = 0.95 * a;
      it.chevMat.emissiveIntensity = it.hover ? 0.75 : 0.36 + 0.1 * pulse;
      it.chevMat.color.setHex(it.hover ? 0xd8f8ff : 0xffffff);
      it.shadowMat.opacity = (0.42 + 0.08 * pulse) * a;
      it.glowMat.opacity = (it.hover ? 0.7 : 0.08 + 0.1 * pulse) * a;
      // label projection
      it.onScreen = false;
      if (camera && a > 0.05) {
        _v.set(it.x, it.y + 0.05, it.z).project(camera);
        if (_v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) {
          it.sx = L0 + (_v.x + 1) / 2 * W; it.sy = T0 + (1 - _v.y) / 2 * H; it.onScreen = true;
          // projected radius of ~0.32 m (pick tolerance)
          camera.getWorldDirection(_r); _r.cross(camera.up).normalize();
          _v.set(it.x + _r.x * 0.32, it.y, it.z + _r.z * 0.32).project(camera);
          it.rpx = Math.hypot(L0 + (_v.x + 1) / 2 * W - it.sx, T0 + (1 - _v.y) / 2 * H - it.sy);
        }
      }
      const showLbl = it.onScreen && (it.hover || (touch && vis > 0.6)) && !!it.label;
      it.el.classList.toggle('show', showLbl);
      if (it.onScreen) it.el.style.transform = `translate(${it.sx.toFixed(1)}px, ${(it.sy - Math.max(26, (it.rpx || 20) * 0.9)).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
  // screen-space pick (big comfortable targets; touch even bigger)
  function pick(cx, cy) {
    if (vis < 0.5) return null;
    let best = null, bs = Infinity;
    const minR = touch ? 40 : 24;
    for (const it of items) {
      if (!it.onScreen || it.alpha < 0.3) continue;
      const r = clamp((it.rpx || 0) * 1.15, minR, 160);
      const d = Math.hypot(cx - it.sx, cy - it.sy) / r;
      let s = d;
      if (touch && it.el.classList.contains('show')) { // tapping the label works too
        const ly = it.sy - Math.max(26, (it.rpx || 20) * 0.9) - 14;
        s = Math.min(s, Math.hypot(cx - it.sx, (cy - ly) * 1.6) / 60);
      }
      if (s < 1 && s < bs) { bs = s; best = it; }
    }
    return best;
  }
  function clear() { set([]); hover = null; }
  function dispose() { clear(); scene.remove(root); }
  return {
    root, items, set, place, update, pick, setHover, setVisible, setOverlay, clear, dispose,
    get hover() { return hover; }, get visible() { return vis > 0.5 && items.length > 0; },
  };
}

/* =========================================================================================== floor cursor */
export function createFloorCursor(scene) {
  const K = kit();
  const g = new THREE.Group(); g.name = 'nav-cursor'; g.userData.__core = true; g.visible = false; scene.add(g);
  const mk = (o) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }, o));
  const haloM = mk({ map: K.disc, color: 0x000000, opacity: 0.32 });
  const ringM = mk({ color: 0xffffff, opacity: 0.92, side: THREE.DoubleSide });
  const dotM = mk({ color: 0xffffff, opacity: 0.95, side: THREE.DoubleSide });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), haloM); halo.renderOrder = 950;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.145, 0.182, 48), ringM); ring.renderOrder = 951;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.032, 20), dotM); dot.renderOrder = 952;
  for (const m of [halo, ring, dot]) { m.userData.__core = true; m.castShadow = false; m.receiveShadow = false; }
  g.add(halo, ring, dot);
  const Z = new THREE.Vector3(0, 0, 1), _n = new THREE.Vector3();
  const st = { a: 0, target: 0, kind: 'floor', t: 0, overlay: false };
  function show(p, n, kind = 'floor') {
    _n.copy(n || UPV).normalize();
    g.position.copy(p).addScaledVector(_n, 0.012);
    g.quaternion.setFromUnitVectors(Z, _n);
    st.kind = kind; st.target = 1; g.visible = true;
    dot.visible = kind !== 'wall';
  }
  function hide() { st.target = 0; }
  function setOverlay(on) { on = !!on; if (on === st.overlay) return; st.overlay = on; for (const m of [haloM, ringM, dotM]) m.depthTest = !on; }
  function update(dt) {
    st.t += dt;
    st.a += (st.target - st.a) * (1 - Math.exp(-14 * dt));
    if (st.a < 0.01 && st.target === 0) { g.visible = false; return; }
    const wall = st.kind === 'wall', tgt = st.kind === 'target';
    const k = tgt ? 1 + 0.12 * Math.sin(st.t * 6) : 1;
    const flat = wall ? 0.8 : 1;
    g.scale.set(k * flat, k, 1);
    ringM.opacity = (wall ? 0.5 : 0.92) * st.a;
    dotM.opacity = 0.95 * st.a;
    haloM.opacity = (wall ? 0.18 : 0.32) * st.a;
    ringM.color.setHex(tgt ? 0xbff6ff : 0xffffff);
  }
  return { group: g, show, hide, update, setOverlay, get visible() { return g.visible && st.target > 0; } };
}

/* =========================================================================================== framing (V3) */
// "Show as much as possible on every entry": cast 72 horizontal rays at eye height against the static colliders
// (walls, tall furniture), clip them at the room's walls (+0.4 m, so a doorway does not count as room), and pick the
// heading whose view cone (current horizontal FOV) covers the largest floor area (Σ d²). Candidate standing points for
// a room: centre, 4 inset corners, 4 inset wall midpoints — corners looking across the diagonal usually win.
// Camera-yaw convention (core): look direction = (−sin yaw, 0, −cos yaw).
export function createFramer({ world, plan }) {
  const RAYS = 72, near = [], ray = new THREE.Ray(), hit = new THREE.Vector3(), box = new THREE.Box3();
  const TAU = Math.PI * 2;
  function floorKey(x, feet, z) {
    const inFoot = x >= -0.05 && x <= plan.W + 0.05 && z >= -0.05 && z <= plan.D + 0.05;
    if (!inFoot) return 'outside';
    if (feet < plan.mainFloor - 0.45) return 'basement';
    if (feet > plan.upperFloor - 0.4) return 'upper';
    return 'main';
  }
  // smallest plan room containing the point → {key, r:[x0,z0,x1,z1], he, floor} | null (outside)
  function roomRect(x, feet, z) {
    const fl = floorKey(x, feet, z); if (fl === 'outside') return null;
    const rs = (plan.rooms && plan.rooms[fl]) || {};
    let best = null, ba = Infinity;
    for (const [k, rm] of Object.entries(rs)) {
      const [x0, z0, x1, z1] = rm.r;
      if (x >= x0 - 0.05 && x <= x1 + 0.05 && z >= z0 - 0.05 && z <= z1 + 0.05) { const a = (x1 - x0) * (z1 - z0); if (a < ba) { ba = a; best = { key: k, r: rm.r, he: rm.he, floor: fl }; } }
    }
    return best;
  }
  function profile(x, feet, z, rect, maxD = 12) {
    const eyeY = feet + 1.55, out = new Float32Array(RAYS);
    const list = [];
    if (world) {
      world.query(x, z, maxD, near, false);
      for (const b of near) {
        if (b.max.y < eyeY - 0.3 || b.min.y > eyeY || b.max.y - b.min.y > 40) continue;
        if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) continue;
        list.push(b);
      }
    }
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * TAU, dx = -Math.sin(a), dz = -Math.cos(a);
      let d = maxD;
      if (rect) { // exit distance from the (slightly grown) room rectangle
        const [x0, z0, x1, z1] = rect, g = 0.4;
        if (dx > 1e-6) d = Math.min(d, (x1 + g - x) / dx); else if (dx < -1e-6) d = Math.min(d, (x0 - g - x) / dx);
        if (dz > 1e-6) d = Math.min(d, (z1 + g - z) / dz); else if (dz < -1e-6) d = Math.min(d, (z0 - g - z) / dz);
        d = Math.max(0.05, d);
      }
      ray.origin.set(x, eyeY, z); ray.direction.set(dx, 0, dz);
      for (const b of list) {
        box.copy(b);
        const p = ray.intersectBox(box, hit);
        if (p) { const t = Math.hypot(p.x - x, p.z - z); if (t < d) d = Math.max(0.05, t); }
      }
      out[i] = d;
    }
    return out;
  }
  const hfovOf = (vfovDeg, aspect) => 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfovDeg || 70) / 2) * (aspect || 1.6));
  // best heading from a point. o: {prefYaw, prefWeight (0..1, penalty per π of deviation), vfov, aspect, rect}
  function frameYaw(pos, o = {}) {
    const rect = o.rect !== undefined ? o.rect : (roomRect(pos.x, pos.feet, pos.z) || null);
    const prof = profile(pos.x, pos.feet, pos.z, rect ? rect.r || rect : null);
    const hf = Math.min(Math.PI * 0.95, Math.max(0.6, hfovOf(o.vfov, o.aspect)));
    const half = Math.max(1, Math.round((hf / TAU) * RAYS / 2));
    let bestI = 0, bestS = -Infinity, maxA = 1e-6;
    const area = new Float32Array(RAYS);
    for (let c = 0; c < RAYS; c++) {
      let s = 0;
      for (let k = -half; k <= half; k++) { const d = prof[(c + k + RAYS) % RAYS]; s += d * d; }
      area[c] = s; if (s > maxA) maxA = s;
    }
    const w = o.prefWeight || 0, pref = o.prefYaw;
    for (let c = 0; c < RAYS; c++) {
      const yaw = (c / RAYS) * TAU;
      let sc = area[c] / maxA;
      if (w && isFinite(pref)) sc -= w * angDiff(yaw, pref) / Math.PI;
      if (sc > bestS) { bestS = sc; bestI = c; }
    }
    let yaw = (bestI / RAYS) * TAU; if (yaw > Math.PI) yaw -= TAU;
    return { yaw, area: area[bestI], rect };
  }
  function freeAt(x, feet, z) {
    if (!world) return true;
    world.query(x, z, 0.6, near, true);
    for (const b of near) {
      if (b.max.y < feet + 0.3 || b.min.y > feet + 1.75) continue;
      const cx = clamp(x, b.min.x, b.max.x), cz = clamp(z, b.min.z, b.max.z);
      if (Math.hypot(x - cx, z - cz) < 0.3) return false;
    }
    if (world.hasWalkables) { const g = world.groundAt(x, z, feet + 0.5, feet + 0.45); if (g.best === null || Math.abs(g.best - feet) > 0.3) return false; }
    return true;
  }
  // best standing point + heading inside a room rectangle at floor height feet
  function frameRoom(rect, feet, o = {}) {
    const r = rect.r || rect, [x0, z0, x1, z1] = r;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ix = Math.min(0.6, (x1 - x0) / 3), iz = Math.min(0.6, (z1 - z0) / 3);
    const cands = [[cx, cz], [x0 + ix, z0 + iz], [x1 - ix, z0 + iz], [x0 + ix, z1 - iz], [x1 - ix, z1 - iz], [cx, z0 + iz], [cx, z1 - iz], [x0 + ix, cz], [x1 - ix, cz]];
    let best = null;
    for (const [x, z] of cands) {
      if (!freeAt(x, feet, z)) continue;
      const f = frameYaw({ x, feet, z }, Object.assign({}, o, { rect: { r } }));
      if (!best || f.area > best.area * 1.04) best = { x, z, feet, yaw: f.yaw, area: f.area };
    }
    if (!best) { const f = frameYaw({ x: cx, feet, z: cz }, Object.assign({}, o, { rect: { r } })); best = { x: cx, z: cz, feet, yaw: f.yaw, area: f.area }; }
    return best;
  }
  return { frameYaw, frameRoom, roomRect, profile, floorKey };
}

/* =========================================================================================== nav controller */
export function createNav(env) {
  const { scene, camera, plan, world, player } = env;
  const canvas = env.canvas || (env.renderer && env.renderer.domElement);
  const isTouch = !!env.isTouch;
  const getMode = env.getMode || (() => 'walk');
  const toast = env.toast || (() => {});
  const showHint = env.showHint || (() => {});
  const store = env.store || (() => null);
  injectStyle();

  const arrows = createArrowSet(scene, { touch: isTouch, name: 'nav-walk-arrows' });
  const cursor = createFloorCursor(scene);
  let graph = null, buildInfo = null;
  let clickMode = isTouch ? true : store('navmode') !== 'free';
  const mouse = { x: 0, y: 0, inside: false, moved: true, type: 'mouse' };
  let lastClick = null, lastPairT = -1e9, hoverItem = null, lastMode = '', touchHinted = false;
  let glide = null;
  let settle = null; // V3: after an arrow glide into a room, ease the heading to the framed view
  const framer = createFramer({ world, plan });
  let navD = 2.4;
  const arrowState = { x: 1e9, z: 1e9, feet: 1e9, t: -1e9, force: true };
  let time = 0;
  const _ndc = new THREE.Vector2(), C0 = new THREE.Vector2(0, 0);
  const rc = new THREE.Raycaster(); rc.layers.enableAll();
  const _hits = [], _n = new THREE.Vector3(), _bp = new THREE.Vector3(), _o = new THREE.Vector3();
  let rect = null;

  /* ---------------- graph */
  function build() {
    const t0 = performance.now();
    const panos = (env.getPanoNodes ? env.getPanoNodes() : []).map((n) => ({ id: n.id, he: n.he, p: { x: n.p.x, y: n.p.y, z: n.p.z }, floor: n.floor }));
    graph = buildNavGraph(plan, { world, house: env.ctx && env.ctx.house, panos });
    buildInfo = Object.assign(graph.stats(), { ms: Math.round(performance.now() - t0) });
    if (buildInfo.warnings.length) console.info('[nav] graph warnings', buildInfo.warnings);
    arrowState.force = true;
    return graph;
  }

  /* ---------------- helpers */
  function doorHandle(id) { const d = env.ctx && env.ctx.house && env.ctx.house.doors; return d ? d[id] : null; }
  function doorHe(id) { const d = (plan.doors || []).find((q) => q.id === id); return d && d.he ? d.he : 'הדלת'; }
  function groundY(x, z, feet) {
    try {
      if (!world || !world.hasWalkables) return feet;
      const g = world.groundAt(x, z, feet + 0.55, feet + 0.45);
      return g.best !== null && Math.abs(g.best - feet) < 0.6 ? g.best : feet;
    } catch (_) { return feet; }
  }
  function here() { const s = player.state; return { x: s.x, y: s.feet, z: s.z }; }
  function getRect() { if (!rect) rect = canvas.getBoundingClientRect(); return rect; }
  function ndcFromXY(x, y, out = _ndc) { const r = getRect(); return out.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); }
  function centerXY() { const r = getRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  const locked = () => document.pointerLockElement === canvas;

  // surface under a screen point: walkable floor (with normal) or the nearest collider face (wall / furniture)
  let walkList = [], walkLen = -1;
  function surfaceAt(ndc, maxD = 30) {
    if (!world) return null;
    if (walkLen !== world.walk.length) { walkList = world.walk.map((w) => w.mesh).filter(Boolean); walkLen = world.walk.length; }
    camera.updateMatrixWorld();
    rc.setFromCamera(ndc, camera); rc.near = 0.05; rc.far = maxD;
    let floor = null;
    _hits.length = 0;
    try { rc.intersectObjects(walkList, false, _hits); } catch (_) { _hits.length = 0; }
    const camY = rc.ray.origin.y;
    for (const h of _hits) {
      if (h.point.y > camY - 0.25) continue;
      if (h.face) _n.copy(h.face.normal).transformDirection(h.object.matrixWorld); else _n.set(0, 1, 0);
      if (_n.y < 0) _n.negate();
      if (_n.y < 0.5) continue;
      floor = { point: h.point.clone(), normal: _n.clone(), dist: h.distance, kind: 'floor' };
      break;
    }
    let best = floor ? floor.dist : maxD, hitBox = null;
    _o.copy(rc.ray.origin);
    const test = (b) => {
      if (!b || b.isEmpty() || b.max.y - b.min.y > 40 || b.containsPoint(_o)) return;
      const p = rc.ray.intersectBox(b, _bp); if (!p) return;
      const d = p.distanceTo(_o);
      if (d < best - 0.03) { best = d; hitBox = { b, p: p.clone(), d }; }
    };
    for (const b of world.boxes) test(b);
    for (const h of world.dyn) if (h.enabled) test(h.box);
    if (hitBox) {
      const { b, p } = hitBox;
      const f = [[Math.abs(p.x - b.min.x), -1, 0, 0], [Math.abs(p.x - b.max.x), 1, 0, 0], [Math.abs(p.y - b.min.y), 0, -1, 0], [Math.abs(p.y - b.max.y), 0, 1, 0], [Math.abs(p.z - b.min.z), 0, 0, -1], [Math.abs(p.z - b.max.z), 0, 0, 1]];
      f.sort((u, v) => u[0] - v[0]);
      return { point: p, normal: new THREE.Vector3(f[0][1], f[0][2], f[0][3]), dist: hitBox.d, kind: 'wall' };
    }
    return floor;
  }

  /* ---------------- routes: arrays of {x,y,z,door} (door = id of the door crossed on the segment arriving here) */
  function routeFromPath(start, p, end) {
    const r = [{ x: start.x, y: start.y, z: start.z, door: null }];
    if (p) p.pts.forEach((q, i) => { r.push({ x: q.x, y: q.y, z: q.z, door: p.doorAt[i] || null }); });
    if (end) r.push({ x: end.x, y: end.y, z: end.z, door: null });
    // drop duplicate points
    for (let i = r.length - 1; i > 0; i--) if (Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z) < 0.05 && Math.abs(r[i].y - r[i - 1].y) < 0.1 && !r[i].door) r.splice(i, 1);
    return r;
  }
  const sameLevel = (a, b) => Math.abs(a.y - b.y) < 0.3;
  function canShortcut(a, b) { return sameLevel(a, b) && graph.clearSeg(a, b, 0.2, true) && graph.stepOK(a, b); }
  function prune(r) {
    // string-pulling: from each kept point jump to the farthest point still reachable in a straight line
    // (never across a door segment, never across a change of level such as stairs)
    for (let i = 0; i < r.length - 2; i++) {
      let far = i + 1;
      for (let j = r.length - 1; j > i + 1; j--) {
        let ok = true;
        for (let k = i + 1; k <= j; k++) if (r[k].door || Math.abs(r[k].y - r[i].y) > 0.25) { ok = false; break; }
        if (ok && canShortcut(r[i], r[j])) { far = j; break; }
      }
      if (far > i + 1) r.splice(i + 1, far - i - 1);
    }
    return r;
  }
  function planRoute(from, to) {
    if (!graph) return null;
    if (Math.abs(to.y - from.y) < 0.45 && graph.clearSeg(from, to, 0.2, true) && graph.stepOK(from, to)) return [{ ...from, door: null }, { ...to, door: null }];
    const s0 = graph.nearest(from, { los: true, dyn: true, r: 0.15, yTol: 0.5, maxD: 14 }) || graph.nearest(from, { yTol: 0.5, maxD: 4 });
    const e0 = graph.nearest(to, { los: true, dyn: false, r: 0.15, yTol: 0.5, maxD: 10 }) || graph.nearest(to, { yTol: 0.5, maxD: 3 });
    if (!s0 || !e0) return null;
    const p = graph.findPath(s0, e0);
    if (!p) return null;
    return prune(routeFromPath(from, p, to));
  }

  /* ---------------- glide (walk mode) */
  function startGlide(route, opts = {}) {
    if (!route || route.length < 2) return false;
    const suffix = new Array(route.length).fill(0);
    for (let i = route.length - 2; i >= 0; i--) suffix[i] = suffix[i + 1] + Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z);
    const s = player.state;
    glide = { pts: route, suffix, i: 1, t: 0, chkT: 0, chkX: s.x, chkZ: s.z, stuck: 0, wait: false, manualT: 0, checked: {}, limit: 6 + suffix[0] * 2.2, label: opts.label || '', keepYaw: !!opts.keepYaw, frame: !!opts.frame };
    settle = null;
    const end = route[route.length - 1];
    cursor.show(new THREE.Vector3(end.x, groundY(end.x, end.z, end.y), end.z), UPV, 'target');
    arrows.setVisible(false); setHoverItem(null);
    return true;
  }
  function stopGlide(msg, arrived) {
    if (!glide) return;
    const g = glide;
    glide = null; cursor.hide(); arrowState.force = true;
    if (msg) toast(msg);
    if (arrived && g.frame) {
      try {
        const s = player.state, f = framer.frameYaw({ x: s.x, feet: s.feet, z: s.z }, { prefYaw: s.yaw, prefWeight: 0.3, vfov: camera.fov, aspect: camera.aspect });
        if (f.rect && angDiff(f.yaw, s.yaw) > 0.12) settle = { yaw: f.yaw, t: 1.8 };
      } catch (_) { settle = null; }
    }
  }
  // called by core before player.update() in walk mode; may add {moveX, moveZ, yawTo, yawRate} to the input
  function walkInput(dt, inp) {
    if (!glide && settle) {
      if (getMode() !== 'walk' || Math.abs(inp.forward || 0) > 0.1 || Math.abs(inp.strafe || 0) > 0.1 || Math.abs(inp.lookX || 0) + Math.abs(inp.lookY || 0) > 1e-5) settle = null;
      else { inp.yawTo = settle.yaw; inp.yawRate = 2.6; settle.t -= dt; if (settle.t <= 0 || angDiff(player.state.yaw, settle.yaw) < 0.01) settle = null; }
    }
    if (!glide) return;
    if (getMode() !== 'walk') { stopGlide(); return; }
    if (Math.abs(inp.forward || 0) > 0.1 || Math.abs(inp.strafe || 0) > 0.1) { stopGlide(); return; }
    if (Math.abs(inp.lookX || 0) + Math.abs(inp.lookY || 0) > 1e-5) glide.manualT = 1.4; else glide.manualT -= dt;
    const s = player.state;
    if (glide.lx != null && Math.hypot(s.x - glide.lx, s.z - glide.lz) > 1.5) { stopGlide(); return; } // teleported elsewhere
    glide.lx = s.x; glide.lz = s.z;
    glide.t += dt;
    if (glide.wait) { inp.moveX = 0; inp.moveZ = 0; glide.chkT = 0; glide.chkX = s.x; glide.chkZ = s.z; return; }
    const pts = glide.pts;
    // advance through reached waypoints
    for (let k = 0; k < 4; k++) {
      const p = pts[glide.i], last = glide.i === pts.length - 1;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      const reach = last ? 0.1 : (Math.abs(p.y - s.feet) > 0.25 ? 0.24 : 0.32);
      if (d >= reach) break;
      if (last) { stopGlide(null, true); return; }
      glide.i++;
    }
    const p = pts[glide.i], last = glide.i === pts.length - 1;
    // door on the segment we are about to take: open it first (or stop with a toast)
    if (p.door && !glide.checked[glide.i]) {
      glide.checked[glide.i] = true;
      const h = doorHandle(p.door);
      if (h && h.open === false) {
        if (typeof h.setOpen === 'function') {
          glide.wait = true;
          toast('פותח: ' + doorHe(p.door), 1400);
          const g0 = glide;
          const done = () => { if (glide === g0) glide.wait = false; };
          let pr; try { pr = h.setOpen(true); } catch (_) { pr = null; }
          Promise.race([Promise.resolve(pr), new Promise((r) => setTimeout(r, 1700))]).then(done, done);
          inp.moveX = 0; inp.moveZ = 0;
          return;
        }
        stopGlide((doorHe(p.door) || 'הדלת') + ' סגורה'); return;
      }
    }
    let dx = p.x - s.x, dz = p.z - s.z;
    const d = Math.hypot(dx, dz) || 1e-6;
    dx /= d; dz /= d;
    if (!last && d < 0.55) { // round the corner toward the next segment
      const q = pts[glide.i + 1]; let nx = q.x - p.x, nz = q.z - p.z; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const w = (0.55 - d) / 0.55 * 0.5;
      dx = dx * (1 - w) + nx * w; dz = dz * (1 - w) + nz * w; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    }
    const remaining = d + glide.suffix[glide.i];
    const vmax = 1.6 * (inp.run ? 1.7 : 1);
    const v = Math.min(vmax, 0.28 + remaining * 1.6);
    inp.moveX = dx * v; inp.moveZ = dz * v;
    if (glide.manualT <= 0 && !glide.keepYaw) { inp.yawTo = Math.atan2(-dx, -dz); inp.yawRate = 3.2; }
    // progress / stuck detection
    glide.chkT += dt;
    if (glide.chkT > 0.7) {
      const m = Math.hypot(s.x - glide.chkX, s.z - glide.chkZ);
      glide.chkT = 0; glide.chkX = s.x; glide.chkZ = s.z;
      if (m < 0.1) {
        glide.stuck++;
        if (!last && d < 0.8) glide.i++;
        else if (glide.stuck >= 2) { stopGlide(last && d < 0.45 ? null : 'הדרך חסומה — עצרתי', last && d < 0.45); return; }
      } else glide.stuck = 0;
    }
    if (glide.t > glide.limit) stopGlide();
  }

  /* ---------------- walk arrows */
  function setHoverItem(it) {
    if (hoverItem === it) return;
    hoverItem = it || null; arrows.setHover(hoverItem);
  }
  function floorTag(fromFloor, toFloor) {
    if (!toFloor || toFloor === fromFloor) return '';
    const up = (FLOOR_RANK[toFloor] || 0) > (FLOOR_RANK[fromFloor] || 0), down = (FLOOR_RANK[toFloor] || 0) < (FLOOR_RANK[fromFloor] || 0);
    return (up ? '⬆ ' : down ? '⬇ ' : '') + (NAV_FLOOR_HE[toFloor] || '');
  }
  // Arrows = rooms one step away (through a doorway / opening / stair) + this room's centre when far from it.
  // Each arrow points along the first leg of the (string-pulled) route, like Street View pointing at the doorway.
  function computeWalkArrows() {
    const h0 = here();
    const room = graph.roomKeyAt(h0.x, h0.y, h0.z) || roomOfNearest(h0);
    const fl = graph.floorOf(h0.x, h0.y, h0.z);
    const dests = room ? graph.neighborDests(room) : [];
    const own = room ? graph.hub(room) : null;
    if (own && Math.hypot(own.x - h0.x, own.z - h0.z) > 1.6) dests.push({ node: own, he: own.he, other: false });
    const cands = [];
    for (const d of dests) {
      const dn = d.node;
      if (Math.hypot(dn.x - h0.x, dn.z - h0.z) < 0.9 && Math.abs(dn.y - h0.y) < 0.4) continue;
      const route = planRoute(h0, { x: dn.x, y: dn.y, z: dn.z });
      if (!route || route.length < 2) continue;
      let len = 0; for (let i = 1; i < route.length; i++) len += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
      if (len > 18) continue;
      let k = 1; while (k < route.length - 1 && Math.hypot(route[k].x - h0.x, route[k].z - h0.z) < 0.35) k++;
      const a = route[k];
      const fc = (dn.floor === 'upper' || dn.floor === 'basement' || fl === 'upper' || fl === 'basement') && dn.floor !== fl;
      cands.push({ dest: d, route, len, fc, bearing: Math.atan2(a.x - h0.x, a.z - h0.z), score: len + (d.other ? 0 : 2.5) - (fc ? 1.5 : 0) });
    }
    cands.sort((a, b) => a.score - b.score);
    // max 4 arrows (+ up to 2 extra for stairs so a floor change is always offered); same-direction arrows fan out
    const picked = [];
    let regular = 0;
    for (const c of cands) {
      if (!c.fc && regular >= 4) continue;
      if (c.fc && picked.length >= 6) continue;
      let b = null;
      for (const off of [0, 0.36, -0.36, 0.66, -0.66]) { const t = c.bearing + off; if (!picked.some((p) => angDiff(p.bearing, t) < 0.34)) { b = t; break; } }
      if (b === null) continue;
      c.bearing = b; picked.push(c); if (!c.fc) regular++;
    }
    return picked.map((c) => {
      const dx = Math.sin(c.bearing), dz = Math.cos(c.bearing);
      const free = graph.freeAlong(h0, dx, dz, 3.6, 0.08, true);
      const dn = c.dest.node;
      return { key: dn.id, dx, dz, maxD: Math.max(0.9, free - 0.25), dy: 0, label: c.dest.he || dn.he || '', sub: floorTag(fl, dn.floor), data: c, yaw: Math.atan2(-dx, -dz) };
    });
  }
  function roomOfNearest(p) { const n = graph.nearest(p, { yTol: 0.6, maxD: 3 }); return n ? n.room : null; }
  let walkArrowList = [];
  function refreshWalkArrows(force) {
    const s = player.state;
    const moved = Math.hypot(s.x - arrowState.x, s.z - arrowState.z) > 0.25 || Math.abs(s.feet - arrowState.feet) > 0.2;
    if (!force && !arrowState.force && !moved && time - arrowState.t < 0.6) return;
    arrowState.x = s.x; arrowState.z = s.z; arrowState.feet = s.feet; arrowState.t = time; arrowState.force = false;
    walkArrowList = computeWalkArrows();
    for (const a of walkArrowList) a.cd = -1;
    layoutWalkArrows(0, true);
  }
  function adaptiveD(pitch) {
    const vf = THREE.MathUtils.degToRad(camera.fov || 70) / 2;
    const below = Math.atan(0.72 * Math.tan(vf)) - (pitch || 0);
    return clamp(below > 0.12 ? EYE / Math.tan(below) : 3.4, 1.2, 3.4);
  }
  function layoutWalkArrows(dt, setList) {
    const s = player.state;
    const tgt = adaptiveD(s.pitch);
    navD = dt > 0 ? navD + (tgt - navD) * (1 - Math.exp(-8 * dt)) : tgt;
    const list = walkArrowList.map((a) => {
      const d = clamp(navD, 0.9, a.maxD);
      if (a.cd < 0 || Math.abs(d - a.cd) > 0.12) { a.cd = d; a.dy = groundY(s.x + a.dx * d, s.z + a.dz * d, s.feet) - s.feet; }
      return { key: a.key, x: s.x + a.dx * d, y: s.feet + a.dy + 0.006, z: s.z + a.dz * d, yaw: a.yaw, label: a.label, sub: a.sub, data: a };
    });
    if (setList) arrows.set(list);
    else for (let i = 0; i < list.length && i < arrows.items.length; i++) arrows.place(arrows.items[i], list[i].x, list[i].y, list[i].z, list[i].yaw);
  }
  function goArrow(it) {
    const a = it && it.data; if (!a || !a.data) return false;
    const c = a.data, h0 = here();
    const route = c.route.map((q) => ({ ...q }));
    route[0] = { ...h0, door: null };
    prune(route);
    env.audio && env.audio.tone && env.audio.tone(980, 0.05, { type: 'sine', gain: 0.025 });
    return startGlide(route, { label: c.dest.he, frame: true });
  }
  // V3 D-pad tap: one short step forward / back (no heading change), stopping before obstacles
  function step(dir = 1, len = 0.75) {
    if (!graph || getMode() !== 'walk') return false;
    const h0 = here(), yaw = player.state.yaw, sg = dir < 0 ? -1 : 1;
    const dx = -Math.sin(yaw) * sg, dz = -Math.cos(yaw) * sg;
    const free = graph.freeAlong(h0, dx, dz, len + 0.3, 0.22, true);
    const dist = Math.min(len, free - 0.05);
    if (dist < 0.12) return false;
    return startGlide([{ ...h0, door: null }, { x: h0.x + dx * dist, y: h0.y, z: h0.z + dz * dist, door: null }], { keepYaw: true });
  }

  /* ---------------- double-click / double-tap */
  function walkDouble(ndc) {
    if (!graph) return false;
    const h0 = here();
    const hit = surfaceAt(ndc || C0);
    if (hit && hit.kind === 'floor' && hit.dist < 25) {
      const tgt = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      // keep the target a body radius away from walls / furniture: pull it back toward us
      for (let i = 0; i < 12 && graph.blockedAt(tgt.x, tgt.y, tgt.z, 0.26, true); i++) {
        const dx = h0.x - tgt.x, dz = h0.z - tgt.z, l = Math.hypot(dx, dz); if (l < 0.15) break;
        tgt.x += dx / l * 0.1; tgt.z += dz / l * 0.1;
      }
      if (Math.hypot(tgt.x - h0.x, tgt.z - h0.z) < 0.2 && Math.abs(tgt.y - h0.y) < 0.3) return false;
      const route = planRoute(h0, tgt);
      if (route && startGlide(route)) return true;
      toast('אין דרך להגיע לנקודה הזו');
      return false;
    }
    // wall / furniture / sky: 1.5 m forward in the view direction (stop before obstacles)
    const yaw = player.state.yaw, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    const free = graph.freeAlong(h0, dx, dz, 1.5, 0.22, true);
    const dist = Math.min(1.5, free - 0.05);
    if (dist < 0.25) { toast('אין מעבר בכיוון הזה'); return false; }
    return startGlide([{ ...h0, door: null }, { x: h0.x + dx * dist, y: h0.y, z: h0.z + dz * dist, door: null }]);
  }

  // core → nav: every click / tap in walk mode. Returns true when handled (core then does nothing else).
  function onClick(ndc, info = {}, doInteract) {
    if (!graph || getMode() !== 'walk') return false;
    if (info.measuring) return false;
    if (info.lockReq) return true; // the click that grabs the pointer (free mode) does nothing else
    const now = performance.now();
    const c = info.wasLocked || !ndc ? centerXY() : { x: info.x, y: info.y };
    const win = info.type === 'mouse' ? 450 : 300;
    if (lastClick && now - lastClick.t < win && Math.hypot(c.x - lastClick.x, c.y - lastClick.y) < 30) {
      const prev = lastClick; lastClick = null; lastPairT = now;
      if (!prev.interacted && !prev.arrow) walkDouble(info.wasLocked ? null : ndc);
      return true;
    }
    const it = arrows.pick(c.x, c.y);
    if (it) { lastClick = { t: now, x: c.x, y: c.y, arrow: true }; goArrow(it); return true; }
    let used = false;
    try { used = !!(doInteract && doInteract(info.wasLocked ? null : ndc)); } catch (_) { used = false; }
    lastClick = { t: now, x: c.x, y: c.y, interacted: used };
    return true;
  }
  // browser dblclick (mouse) — fallback when the OS double-click interval is longer than ours
  function onDblClick(e) {
    const m = getMode();
    if (m === 'pano') { env.getPano && env.getPano() && env.getPano().onDblClick && env.getPano().onDblClick(e); return; }
    if (m !== 'walk' || !graph || document.body.classList.contains('measuring')) return;
    const now = performance.now();
    if (now - lastPairT < 700 || (lastClick && (lastClick.interacted || lastClick.arrow) && now - lastClick.t < 700)) return;
    lastPairT = now; lastClick = null;
    walkDouble(locked() ? null : ndcFromXY(e.clientX, e.clientY, new THREE.Vector2()));
  }

  // core → nav: mouse/touch drag in click-navigation mode ("grab the world", same feel as the 360 mode)
  function dragLook(dx, dy, look) {
    const h = canvas.clientHeight || 800;
    const k = (THREE.MathUtils.degToRad(camera.fov || 70)) / h;
    look.x -= dx * k; look.y -= dy * k;
  }
  // core → nav: which NDC to use for the interaction hover pick (null = screen centre, false = no hover)
  function hoverNdc() {
    if (getMode() !== 'walk' || !clickMode || isTouch || locked()) return null;
    if (!mouse.inside || glide) return false;
    return ndcFromXY(mouse.x, mouse.y, new THREE.Vector2());
  }

  /* ---------------- per-frame */
  function update(dt, t) {
    time += dt; rect = null;
    const mode = getMode();
    if (mode !== lastMode) {
      if (lastMode === 'walk') { stopGlide(); arrows.clear(); setHoverItem(null); cursor.hide(); }
      if (mode === 'walk') { arrowState.force = true; if (isTouch && !touchHinted && graph) { touchHinted = true; setTimeout(() => getMode() === 'walk' && showHint('הקש על חץ כדי לעבור לחדר · הקשה כפולה על הרצפה = הליכה · גרירה = הסתכלות', 5200), 400); } }
      if (canvas && mode !== 'walk' && mode !== 'pano') canvas.style.cursor = '';
      lastMode = mode;
    }
    if (mode !== 'walk' || !graph) { cursor.update(dt); return; }
    const moving = player.state.speed > 0.35;
    // arrows are recomputed only while standing (they fade out while walking / gliding, Matterport-style)
    if (!glide && !moving) { refreshWalkArrows(false); arrows.setVisible(!document.body.classList.contains('measuring')); }
    else if (!glide) arrows.setVisible(false);
    layoutWalkArrows(dt, false);
    camera.updateMatrixWorld();
    arrows.update(dt, camera, getRect());
    // hover: mouse in click mode, crosshair when locked
    let px = null, py = null;
    if (!isTouch) {
      if (locked()) { const c = centerXY(); px = c.x; py = c.y; }
      else if (clickMode && mouse.inside) { px = mouse.x; py = mouse.y; }
    }
    const it = px !== null && !glide ? arrows.pick(px, py) : null;
    setHoverItem(it);
    const interHover = document.body.classList.contains('hovering');
    if (canvas && clickMode && !locked()) canvas.style.cursor = mouse.down ? 'grabbing' : (it || interHover) ? 'pointer' : 'default';
    else if (canvas && !clickMode && canvas.style.cursor) canvas.style.cursor = '';
    if (!glide) {
      if (px !== null && !it && !interHover && !document.body.classList.contains('measuring')) {
        const hit = surfaceAt(ndcFromXY(px, py));
        if (hit && hit.dist < 25) cursor.show(hit.point, hit.normal, hit.kind); else cursor.hide();
      } else cursor.hide();
    }
    cursor.update(dt);
  }

  /* ---------------- mode toggle UI */
  let toggleEl = null;
  function buildToggle() {
    if (isTouch || typeof document === 'undefined') return;
    const tools = document.getElementById('tools');
    const el = document.createElement('div');
    el.id = 'navMode'; el.className = 'seg glass'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'מצב ניווט');
    el.innerHTML = '<button data-nav="click" title="ניווט בלחיצות: גרירה = הסתכלות · קליק על חץ = מעבר · לחיצה כפולה = הליכה (N)"><span class="ico">👆</span>ניווט בלחיצות</button>' +
      '<button data-nav="free" title="ניווט חופשי: נעילת עכבר + WASD (N)"><span class="ico">⌨️</span>חופשי (WASD)</button>';
    for (const b of el.querySelectorAll('button')) b.addEventListener('click', (e) => { e.stopPropagation(); setClickMode(b.dataset.nav === 'click'); });
    if (tools) { const seg = tools.querySelector('.seg'); if (seg && seg.parentNode) seg.parentNode.insertBefore(el, seg.nextSibling); else tools.appendChild(el); }
    else { el.classList.add('ui'); el.style.cssText = 'position:fixed;right:16px;top:240px;z-index:10'; document.body.appendChild(el); }
    toggleEl = el;
  }
  function syncToggle() {
    document.body.classList.toggle('nav-click', clickMode);
    document.body.classList.toggle('nav-free', !clickMode);
    if (toggleEl) for (const b of toggleEl.querySelectorAll('button')) b.classList.toggle('on', (b.dataset.nav === 'click') === clickMode);
  }
  function walkHint(lockFailed) {
    if (isTouch) return 'הקש על חץ כדי לעבור לחדר · הקשה כפולה על הרצפה = הליכה · גרירה = הסתכלות';
    if (clickMode) return 'גרור כדי להסתכל · קליק על חץ = מעבר לחדר · לחיצה כפולה על הרצפה = הליכה · WASD לתנועה';
    return lockFailed ? 'גרור עם העכבר כדי להסתכל · WASD / חצים לתנועה · לחיצה כפולה = הליכה' : 'הקלק על המסך כדי לשלוט · WASD לתנועה · Shift לריצה · לחיצה כפולה = הליכה';
  }
  function setClickMode(on, quiet) {
    clickMode = isTouch ? true : !!on;
    store('navmode', clickMode ? 'click' : 'free');
    if (clickMode && locked()) { try { document.exitPointerLock(); } catch (_) {} }
    syncToggle();
    if (!quiet && getMode() === 'walk') showHint(walkHint(false), 4200);
  }

  /* ---------------- DOM listeners (hover tracking only; clicks come from core via onClick) */
  if (canvas) {
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; mouse.moved = true;
      if (clickMode && getMode() === 'walk') { document.body.style.setProperty('--nav-hx', e.clientX + 'px'); document.body.style.setProperty('--nav-hy', e.clientY + 'px'); }
    });
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') mouse.down = true; });
    window.addEventListener('pointerup', () => { mouse.down = false; });
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { mouse.inside = false; mouse.down = false; } });
    canvas.addEventListener('dblclick', (e) => { try { onDblClick(e); } catch (err) { console.error('[nav] dblclick', err); } });
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) return;
    if (e.code === 'KeyN' && getMode() === 'walk' && !isTouch) setClickMode(!clickMode);
  });
  buildToggle(); syncToggle();

  /* ---------------- 360 helpers (used by core-pano) */
  // arrows from a 360 node to its neighbours: [{node, bearing, dir:{x,z}, len, label, sub, maxD}]
  function panoArrowList(cur) {
    if (!graph || !cur) return null;
    const nodes = env.getPanoNodes ? env.getPanoNodes() : [];
    let links = graph.panoLinks(cur.id, 16);
    if (links.length < 2) links = graph.panoLinks(cur.id, 32); // sparse outdoor nodes (back yard)
    const origin = { x: cur.p.x, y: cur.floorY, z: cur.p.z };
    const out = [];
    for (const L of links) {
      if (out.length >= 7) break;
      const node = nodes.find((n) => n.id === L.pano); if (!node) continue;
      const b0 = Math.atan2(L.dir.x, L.dir.z);
      let bearing = null;
      for (const off of [0, 0.34, -0.34, 0.62, -0.62]) { const b = b0 + off; if (!out.some((o) => angDiff(o.bearing, b) < 0.33)) { bearing = b; break; } }
      if (bearing === null) continue;
      const dx = Math.sin(bearing), dz = Math.cos(bearing);
      const free = graph.freeAlong(origin, dx, dz, 3.6, 0.08, true);
      out.push({ node, bearing, dir: { x: dx, z: dz }, len: L.len, path: L.path, label: node.he, sub: floorTag(cur.floor, node.floor), maxD: Math.max(1.0, free - 0.25) });
    }
    return out;
  }
  // camera route for a 360 jump (eye positions) + opens closed doors on the way (no wait: the fly takes ~1 s)
  function panoRoute(a, b) {
    if (!graph || !a || !b) return null;
    const p = graph.findPath('pano:' + a.id, 'pano:' + b.id);
    if (!p) return null;
    for (const k of Object.keys(p.doorAt)) { const h = doorHandle(p.doorAt[k]); if (h && h.open === false && h.setOpen) { try { h.setOpen(true); } catch (_) {} } }
    const pts = p.pts.map((q) => new THREE.Vector3(q.x, q.y + EYE, q.z));
    pts[0] = a.p.clone(); pts[pts.length - 1] = b.p.clone();
    if (pts.length > 2) {
      // drop the graph's own pano-node offsets right at the ends
      if (pts[1].distanceTo(pts[0]) < 0.3) pts.splice(1, 1);
      if (pts.length > 2 && pts[pts.length - 2].distanceTo(pts[pts.length - 1]) < 0.3) pts.splice(pts.length - 2, 1);
    }
    return pts;
  }
  // nearest 360 node "in that direction" (double-click in pano)
  function panoInDirection(cur, bearing) {
    if (!graph || !cur) return null;
    const nodes = env.getPanoNodes ? env.getPanoNodes() : [];
    let best = null, bs = Infinity;
    for (const L of graph.panoLinks(cur.id, 24)) {
      const node = nodes.find((n) => n.id === L.pano); if (!node) continue;
      const bf = Math.atan2(L.dir.x, L.dir.z), bsN = Math.atan2(node.p.x - cur.p.x, node.p.z - cur.p.z);
      const dev = Math.min(angDiff(bf, bearing), angDiff(bsN, bearing));
      if (dev > 0.6) continue;
      const s = L.len * (1 + dev * 1.5);
      if (s < bs) { bs = s; best = node; }
    }
    return best;
  }

  return {
    build, walkInput, update, onClick, onDblClick, dragLook, hoverNdc, walkHint, setClickMode, step, framer,
    get settling() { return !!settle; },
    surfaceAt, groundY, panoArrowList, panoRoute, panoInDirection, startGlide, stopGlide, planRoute, walkDouble,
    get graph() { return graph; }, get ready() { return !!graph; }, get clickMode() { return clickMode; }, get gliding() { return !!glide; },
    get arrows() { return arrows; }, get cursor() { return cursor; }, get info() { return buildInfo; },
    // test / debug helpers
    goArrowIndex(i) { const it = arrows.items[i]; return it ? goArrow(it) : false; },
    arrowLabels() { return arrows.items.map((it) => it.label + (it.sub ? ' (' + it.sub + ')' : '')); },
    goTo(id) { if (!graph) return false; const n = graph.node(id) || graph.node('pano:' + id); if (!n) return false; const r = planRoute(here(), { x: n.x, y: n.y, z: n.z }); return r ? startGlide(r) : false; },
  };
}
