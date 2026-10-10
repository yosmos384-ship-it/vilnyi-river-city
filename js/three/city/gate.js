// The car park's exit gate (part of the calm tour, loaded with the −1 level): an electric sectional roll-up door in the
// mouth of the ramp tunnel, a barrier arm, a plate-reader pillar with a display, and a red/green signal. It opens as a
// car or a walker approaches from either side (or on a tap) and closes behind. World coordinates; y = 0 is the car-park floor.
import * as THREE from 'three';
import { RAMP, LEVELS, floorY } from '../../data.js?v=3.9';

export function createParkingGate({ height = 3.1, onSound = null } = {}) {
  const group = new THREE.Group(); group.name = 'vrc-parking-gate'; group.position.y = floorY(-1);
  const x0 = RAMP.x0, x1 = RAMP.x1, cx = (x0 + x1) / 2, W = x1 - x0, zG = RAMP.z1 - 0.3, slope = (LEVELS.groundY - LEVELS.parkingY) / (RAMP.z1 - RAMP.z0), y0 = (RAMP.z1 - zG) * slope, H = height - y0;
  const M = {
    alu: new THREE.MeshStandardMaterial({ color: '#b9bdc2', metalness: 0.85, roughness: 0.38 }), dark: new THREE.MeshStandardMaterial({ color: '#1b1d20', metalness: 0.5, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: '#0d1318', metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.55 }), white: new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.6 }),
    red: new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.5 }), hazard: null,
    lampR: new THREE.MeshBasicMaterial({ color: '#ff2a1e' }), lampG: new THREE.MeshBasicMaterial({ color: '#0c2a12' }), screen: null, none: new THREE.MeshBasicMaterial({ visible: false }),
  };
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const hz = tex(128, 32, g => { g.fillStyle = '#e8b21a'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#16171a'; for (let k = -2; k < 8; k++) { g.beginPath(); g.moveTo(k * 32, 32); g.lineTo(k * 32 + 16, 32); g.lineTo(k * 32 + 48, 0); g.lineTo(k * 32 + 32, 0); g.fill(); } }); hz.wrapS = THREE.RepeatWrapping; hz.repeat.set(4, 1);
  M.hazard = new THREE.MeshStandardMaterial({ map: hz, roughness: 0.6 });
  const scrC = document.createElement('canvas'); scrC.width = 128; scrC.height = 160; const scrG = scrC.getContext('2d'), scrT = new THREE.CanvasTexture(scrC); scrT.colorSpace = THREE.SRGBColorSpace; M.screen = new THREE.MeshBasicMaterial({ map: scrT });
  const add = (geo, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // ---- the door: seven aluminium sections that run up into the header (a section is hidden once it is inside)
  const NS = 7, sh = H / NS, panels = [];
  for (let k = 0; k < NS; k++) {
    const p = new THREE.Group(); p.position.set(cx, y0 + k * sh, zG); group.add(p);
    add(new THREE.BoxGeometry(W - 0.06, sh - 0.012, 0.045), M.alu, 0, sh / 2, 0, p);
    for (const dy of [0.06, sh - 0.06]) add(new THREE.BoxGeometry(W - 0.06, 0.012, 0.055), M.dark, 0, dy, 0, p);
    if (k === 4) for (let q = -3; q <= 3; q++) add(new THREE.BoxGeometry(0.42, sh * 0.5, 0.05), M.glass, q * 0.56, sh / 2, 0.004, p);   // vision panels
    if (k === 0) { add(new THREE.BoxGeometry(W - 0.06, 0.1, 0.05), M.hazard, 0, 0.05, 0.004, p); add(new THREE.BoxGeometry(W - 0.06, 0.03, 0.07), M.dark, 0, -0.012, 0, p); }
    panels.push(p);
  }
  add(new THREE.BoxGeometry(W + 0.1, 0.34, 0.36), M.dark, cx, height - 0.17, zG - 0.02);                       // header / motor housing
  for (const sx of [x0 + 0.05, x1 - 0.05]) add(new THREE.BoxGeometry(0.09, height, 0.12), M.dark, sx, height / 2, zG);   // guide rails
  // signal heads: one facing the hall (leaving), one facing up the ramp (coming in)
  const lamps = [];
  for (const [z, ry] of [[RAMP.z1 + 0.08, 0], [zG - 0.5, Math.PI]]) {
    const h = new THREE.Group(); h.position.set(x1 - 0.32, 2.2, z); h.rotation.y = ry; group.add(h);
    add(new THREE.BoxGeometry(0.2, 0.46, 0.1), M.dark, 0, 0, 0, h);
    const r = add(new THREE.CircleGeometry(0.07, 16), M.lampR.clone(), 0, 0.11, 0.052, h), g = add(new THREE.CircleGeometry(0.07, 16), M.lampG.clone(), 0, -0.11, 0.052, h); lamps.push([r, g]);
  }
  // sign over the portal
  const signT = tex(512, 96, g => { g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, 512, 96); g.strokeStyle = '#c9a659'; g.lineWidth = 3; g.strokeRect(4, 4, 504, 88); g.fillStyle = '#e9cf8f'; g.font = '700 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('IEȘIRE  ·  EXIT  ↑', 256, 50); });
  add(new THREE.PlaneGeometry(2.3, 0.43), new THREE.MeshBasicMaterial({ map: signT }), cx, height - 0.17, RAMP.z1 + 0.17);
  // ---- barrier arm on its pillar (right of the lane), plate reader on the driver's side
  const zB = RAMP.z1 + 2.7, px = x1 - 0.42;
  add(new THREE.BoxGeometry(0.34, 1.05, 0.34), M.white, px, 0.525, zB); add(new THREE.BoxGeometry(0.36, 0.06, 0.36), M.dark, px, 1.08, zB);
  const arm = new THREE.Group(); arm.position.set(px - 0.1, 0.98, zB + 0.2); group.add(arm);
  const AL = W - 0.95; for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(AL / 6, 0.09, 0.05), k % 2 ? M.white : M.red, -(k + 0.5) * AL / 6, 0, 0, arm);
  add(new THREE.BoxGeometry(0.2, 0.2, 0.09), M.dark, 0, 0, 0, arm);
  const zR = RAMP.z1 + 4.3, rx = x0 + 0.3;
  add(new THREE.BoxGeometry(0.22, 1.32, 0.2), M.dark, rx, 0.66, zR); add(new THREE.BoxGeometry(0.24, 0.03, 0.22), M.alu, rx, 1.335, zR);
  const scr = add(new THREE.PlaneGeometry(0.17, 0.21), M.screen, rx + 0.111, 1.08, zR); scr.rotation.y = Math.PI / 2;
  const cam = add(new THREE.BoxGeometry(0.1, 0.07, 0.14), M.dark, rx, 1.42, zR + 0.02); cam.rotation.x = 0.25; add(new THREE.CircleGeometry(0.025, 12), M.glass, rx, 1.415, zR + 0.094);
  add(new THREE.BoxGeometry(0.02, 0.012, 0.11), M.alu, rx + 0.115, 0.9, zR);   // ticket slot
  // ---- what blocks: the door plane and the lowered arm (walk.js reads userData.solid; `toggle` marks them as togglable)
  const solid = add(new THREE.BoxGeometry(W, height, 0.2), M.none, cx, height / 2, zG); solid.userData.solid = true; solid.userData.toggle = () => {}; solid.name = 'gate-door-collider';
  const solidArm = add(new THREE.BoxGeometry(AL, 0.5, 0.16), M.none, px - 0.1 - AL / 2, 0.85, zB + 0.2); solidArm.userData.solid = true; solidArm.userData.toggle = () => {}; solidArm.name = 'gate-arm-collider';
  // a tap on the door or the reader opens it
  for (const m of [solid, scr]) m.userData.action = { type: 'gate' };
  let open = 0, armOpen = 0, hold = 0, state = 'closed', lastScr = '', t = 0;
  const drawScreen = s => { if (s === lastScr) return; lastScr = s; const g = scrG; g.fillStyle = '#05080b'; g.fillRect(0, 0, 128, 160); g.fillStyle = s === 'open' ? '#3fe06a' : s === 'closed' ? '#e2c078' : '#ffd34d'; g.font = '700 20px Arial, sans-serif'; g.textAlign = 'center'; g.fillText(s === 'open' ? 'DRUM BUN' : s === 'closed' ? 'VILNYI' : '· · ·', 64, 52); g.font = '600 13px Arial, sans-serif'; g.fillStyle = '#9aa5b1'; g.fillText(s === 'open' ? 'B ✓' : 'P −1', 64, 84); g.strokeStyle = '#27303a'; g.strokeRect(14, 104, 100, 36); g.fillStyle = '#6fb6ff'; g.fillText(s === 'closed' ? 'CAMERA' : 'OK', 64, 127); scrT.needsUpdate = true; };
  drawScreen('closed');
  function apply() {
    const e = open * open * (3 - 2 * open), lift = e * H;
    for (let k = 0; k < NS; k++) { const y = y0 + k * sh + lift; panels[k].position.y = y; panels[k].visible = y < height - 0.3; }
    arm.rotation.z = -armOpen * 1.45;
    solid.userData.solid = open < 0.72; solidArm.userData.solid = armOpen < 0.6;
    const green = open > 0.97; for (const [r, g] of lamps) { r.material.color.set(green ? '#2a0d0b' : '#ff2a1e'); g.material.color.set(green ? '#35ff6a' : '#0c2a12'); }
  }
  apply();
  // points: [{x, z}] in world coordinates of whoever is on this level (a car being driven, the walker)
  function update(dt, points) {
    t += dt; let want = false, under = false;
    for (const p of points || []) {
      const dx = Math.abs(p.x - cx); if (dx > 4.5) continue;
      if (p.z > zG - 10 && p.z < RAMP.z1 + 16) want = true;
      if (Math.abs(p.z - zG) < 3.2 || Math.abs(p.z - zB) < 3.2) under = true;
    }
    hold = Math.max(0, hold - dt);
    const prev = state;
    const held = hold > 0; if (want || under || held) { armOpen = Math.min(1, armOpen + dt / 0.8); if (armOpen > 0.3) open = Math.min(1, open + dt / 2.0); state = open >= 1 ? 'open' : 'opening'; if (want) hold = Math.max(hold, 2.5); }
    else { open = Math.max(0, open - dt / 2.8); if (open < 0.5) armOpen = Math.max(0, armOpen - dt / 1.1); state = open <= 0 && armOpen <= 0 ? 'closed' : 'closing'; }
    if (state !== prev && onSound && (state === 'opening' || state === 'closing')) onSound(state);
    drawScreen(state === 'open' ? 'open' : state === 'closed' ? 'closed' : 'busy'); apply();
  }
  return {
    group, update, solids: [solid, solidArm],
    tap() { hold = Math.max(hold, 9); }, get state() { return state; }, get openness() { return open; }, get arm() { return armOpen; },
    zone: { cx, zGate: zG, zArm: zB, x0, x1 },
    dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); for (const m of Object.values(M)) if (m) m.dispose(); for (const [r, g] of lamps) { r.material.dispose(); g.material.dispose(); } hz.dispose(); scrT.dispose(); signT.dispose(); group.parent && group.parent.remove(group); },
  };
}
