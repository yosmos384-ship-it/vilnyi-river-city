// City Drive — people. Adults only: every figure is the same generic grown-up build (1.66–1.86 m), invented, with no
// real person's likeness. One instanced low-poly character with a walk cycle animated in the vertex shader
// (thighs, shins, arms, forearms swing about their joints), so the whole crowd is a single draw call.
// They walk the pavements, wait and cross at junctions, sit at café tables and on benches, go in and out of shops,
// jump aside and shout when a car comes at them. Knock-downs are arcade-level: a tumble, no gore, bodies fade out.
import * as THREE from 'three';
import { genBlock } from './gen.js?v=3.7';
import { bodyBox } from './vehicle.js?v=3.7';

const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d9a066'];
const HAIR = ['#1b1512', '#3b2a1e', '#6b4a2e', '#a8793e', '#8a8a8a', '#d9d2c4', '#2a2a2e'];
const TOPS = ['#2b3a55', '#7a1f24', '#e8e2d2', '#1f5a4a', '#3a3a3e', '#c9a659', '#5a6b7a', '#8a4a35', '#d9d9de', '#40304e', '#2f6f8a', '#b9b4a8', '#151618', '#9a2f4a'];
const LEGS = ['#22262e', '#2f3a55', '#3d3a36', '#5a5246', '#16181b', '#4a5560', '#6b5a48'];
const CAP = 96, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function figureGeometry() {
  const P = [], N = [], Q = [], S = [], I = [];
  // part: type 0 body · 1 upper arm · 2 forearm · 3 thigh · 4 shin; side +1 left (+x) / −1 right; pivots (y) own, parent
  const add = (g, type, side, p1, p2, slot) => {
    const base = P.length / 3, p = g.attributes.position, n = g.attributes.normal, ix = g.index.array;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); Q.push(type, side, p1, p2); S.push(slot); }
    for (let i = 0; i < ix.length; i++) I.push(base + ix[i]); g.dispose();
  };
  const box = (w, h, d, x, y, z, taper = 1) => { const g = new THREE.BoxGeometry(w, h, d); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getY(i) < 0) { p.setX(i, p.getX(i) * taper); p.setZ(i, p.getZ(i) * taper); } } g.translate(x, y, z); g.computeVertexNormals(); return g; };
  // torso, hips, neck, head, hair, face marks
  add(box(0.4, 0.5, 0.22, 0, 1.19, 0, 0.82), 0, 0, 0, 0, 1);
  add(box(0.34, 0.2, 0.2, 0, 0.9, 0), 0, 0, 0, 0, 2);
  add(box(0.1, 0.09, 0.1, 0, 1.48, 0), 0, 0, 0, 0, 0);
  { const g = new THREE.SphereGeometry(0.108, 8, 6); g.scale(0.92, 1.12, 1); g.translate(0, 1.63, 0.005); add(g, 0, 0, 0, 0, 0); }
  { const g = new THREE.SphereGeometry(0.116, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55); g.scale(0.95, 1.1, 1.04); g.translate(0, 1.645, -0.012); add(g, 0, 0, 0, 0, 3); }
  for (const sx of [-1, 1]) add(box(0.022, 0.016, 0.01, sx * 0.038, 1.645, 0.102), 0, 0, 0, 0, 5);
  add(box(0.04, 0.008, 0.01, 0, 1.585, 0.1), 0, 0, 0, 0, 5);
  for (const sd of [1, -1]) {
    add(box(0.1, 0.32, 0.11, sd * 0.25, 1.26, 0, 0.9), 1, sd, 1.4, 0, 1);              // upper arm (sleeve)
    add(box(0.085, 0.3, 0.09, sd * 0.25, 0.96, 0, 0.85), 2, sd, 1.11, 1.4, 0);        // forearm
    add(box(0.08, 0.09, 0.05, sd * 0.25, 0.775, 0.005), 2, sd, 1.11, 1.4, 0);          // hand
    add(box(0.16, 0.44, 0.17, sd * 0.095, 0.7, 0, 0.85), 3, sd, 0.92, 0, 2);          // thigh
    add(box(0.13, 0.42, 0.14, sd * 0.095, 0.28, 0, 0.8), 4, sd, 0.5, 0.92, 2);        // shin
    add(box(0.11, 0.08, 0.26, sd * 0.095, 0.04, 0.045), 4, sd, 0.5, 0.92, 4);          // shoe
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aQ', new THREE.Float32BufferAttribute(Q, 4)); g.setAttribute('aSlot', new THREE.Float32BufferAttribute(S, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(P.length).fill(1), 3));
  g.setIndex(I); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.2); return g;
}

export function createPeds(G) {
  const { map, world, scene } = G;
  const geo = figureGeometry();
  const iAnim = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4), iA = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3), iB = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3), iS = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3), iH = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  for (const a of [iAnim, iA, iB, iS, iH]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iAnim', iAnim); geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iS', iS); geo.setAttribute('iH', iH);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aQ; attribute float aSlot; attribute vec4 iAnim; attribute vec3 iA, iB, iS, iH; varying float vFade;
      vec3 rotX(vec3 p, float py, float a){ float c = cos(a), s = sin(a); p.y -= py; return vec3(p.x, py + p.y * c - p.z * s, p.y * s + p.z * c); }
      vec3 rotN(vec3 n, float a){ float c = cos(a), s = sin(a); return vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float pT = aQ.x, pSd = aQ.y, ph = iAnim.x + (pSd < 0.0 ? 3.14159 : 0.0), amp = iAnim.y, pose = iAnim.z;
      float sw = sin(ph), a1 = 0.0, a2 = 0.0;
      if (pT > 2.5) { a1 = -amp * 0.62 * sw; a2 = amp * 1.05 * max(0.0, sin(ph + 1.9)); if (pose > 0.5 && pose < 1.5) { a1 = -1.5; a2 = 1.5; } if (pose > 1.5) { a1 = -0.35 * pSd + 0.5 * sw * amp; a2 = 0.6; } }
      else if (pT > 0.5) { a1 = amp * 0.4 * sw; a2 = -0.12 - min(amp, 1.6) * 0.22 * max(0.0, -sw) - max(0.0, amp - 1.2) * 0.9; if (pose > 0.5 && pose < 1.5) { a1 = -0.55; a2 = -0.9; } if (pose > 1.5) { a1 = -2.2 + 0.9 * sw * amp; a2 = -0.4; } }
      if (pT > 3.5 || (pT > 1.5 && pT < 2.5)) objectNormal = rotN(objectNormal, a2);
      if (pT > 0.5) objectNormal = rotN(objectNormal, a1);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      if (pT > 3.5 || (pT > 1.5 && pT < 2.5)) transformed = rotX(transformed, aQ.z, a2);
      if (pT > 0.5) transformed = rotX(transformed, pT > 3.5 || (pT > 1.5 && pT < 2.5) ? aQ.w : aQ.z, a1);
      else transformed.y += abs(sw) * 0.022 * min(amp, 1.2);
      vFade = iAnim.w;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
      vColor = aSlot < 0.5 ? iS : aSlot < 1.5 ? iA : aSlot < 2.5 ? iB : aSlot < 3.5 ? iH : aSlot < 4.5 ? vec3(0.03, 0.03, 0.035) : vec3(0.04, 0.03, 0.03);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vFade < 0.98) { vec2 q = fract(gl_FragCoord.xy * vec2(0.3183, 0.367)); if (fract(q.x * 7.0 + q.y * 13.0) > vFade) discard; }');
  };
  mat.customProgramCacheKey = () => 'city-peds';
  const mesh = new THREE.InstancedMesh(geo, mat, CAP); mesh.count = 0; mesh.frustumCulled = false; mesh.name = 'city-peds'; scene.add(mesh);
  const peds = []; let time = 0, tSpawn = 0, edgeBlocks = null;
  const C3 = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  function make(x, z, yaw) {
    const r = Math.random;
    const p = { ped: true, x, z, y: 0, yaw, state: 'walk', speed: 1.15 + r() * 0.45, ph: r() * 6.28, amp: 1, pose: 0, fade: 1, h: 0.95 + r() * 0.11, wd: 0.9 + r() * 0.24, onRoad: false, wp: null, t: 0,
      top: C3(TOPS[Math.floor(r() * TOPS.length)]), leg: C3(LEGS[Math.floor(r() * LEGS.length)]), skin: C3(SKIN[Math.floor(r() * SKIN.length)]), hair: C3(HAIR[Math.floor(r() * HAIR.length)]), alert: r() < 0.72, react: 0.2 + r() * 0.4 };
    peds.push(p); return p;
  }
  const remove = p => { const i = peds.indexOf(p); if (i >= 0) peds.splice(i, 1); if (p.seat) p.seat.ped = null; p.state = 'gone'; };
  // ---- pavements: (edge, side) with s along a→b
  const swLat = e => e.hw + 1.75;
  const swPos = (e, side, s, out = [0, 0]) => { const a = map.nodes[e.a]; out[0] = a.x + e.ux * s - e.uz * side * swLat(e); out[1] = a.z + e.uz * s + e.ux * side * swLat(e); return out; };
  const sEnd = (e, dir) => (dir > 0 ? e.len - e.tb - 1.8 : e.ta + 1.8);
  function attach(p, e, side, s, dir) { if (e.ow) side = 1; p.e = e; p.side = side; p.s = s; p.dir = dir; p.state = 'walk'; p.wp = null; p.onRoad = false; p.amp = 1; p.pose = 0; }
  function doorsOf(e, side) {
    if (!e.swDoors) e.swDoors = {}; if (e.swDoors[side]) return e.swDoors[side];
    if (!edgeBlocks) { edgeBlocks = new Map(); for (const b of map.blocks) for (const ei of b.edges) if (ei >= 0) (edgeBlocks.get(ei) || edgeBlocks.set(ei, []).get(ei)).push(b); }
    const out = [], a = map.nodes[e.a];
    for (const b of edgeBlocks.get(e.id) || []) { if (((b.cx - a.x) * -e.uz + (b.cz - a.z) * e.ux) * side < 0) continue;
      for (const d of genBlock(map, b).doors) { const s = (d.x - a.x) * e.ux + (d.z - a.z) * e.uz, l = Math.abs((d.x - a.x) * -e.uz + (d.z - a.z) * e.ux); if (s > e.ta + 3 && s < e.len - e.tb - 3 && l < e.hw + 9) out.push({ s, x: d.x, z: d.z }); } }
    return (e.swDoors[side] = out);
  }
  function atEnd(p) {
    const e = p.e, n = map.nodes[p.dir > 0 ? e.b : e.a], r = Math.random();
    const here = swPos(e, p.side, p.s);
    if (r < 0.42) {   // round the corner onto the next street
      let best = null;
      for (const ei of n.edges) { const e2 = map.edges[ei]; if (e2 === e || e2.dead || e2.drive) continue; const out = e2.a === n.id ? 1 : -1, s2 = sEnd(e2, -out);
        for (const sd of e2.ow ? [1] : [-1, 1]) { const q = swPos(e2, sd, s2), d = Math.hypot(q[0] - here[0], q[1] - here[1]); if (!best || d < best.d) best = { d, e2, sd, s2, out, q: [q[0], q[1]] }; } }
      if (best && best.d < e.hw + best.e2.hw + 9) { p.wp = [[best.q[0], best.q[1], 0]]; p.after = [best.e2, best.sd, best.s2, best.out]; p.state = 'link'; return; }
    }
    if (r < 0.8 && e.len - e.ta - e.tb > 20) {   // cross this street on the zebra
      p.state = 'wait'; p.t = 0.4 + Math.random() * 2.5; p.node = n; p.amp = 0; return;
    }
    p.dir = -p.dir;
  }
  function canCross(p) {
    const e = p.e, n = p.node;
    if (n.signal) { const ax = map.axisAt(n, e); return world.signal(n, ax) === 2 && world.signal(n, ax === 0 ? 1 : 0) === 0; }
    const a = map.nodes[e.a];
    for (const c of G.traffic.cars) { if (c.mode !== 'ai' && c.mode !== 'police') continue; const s = (c.x - a.x) * e.ux + (c.z - a.z) * e.uz, l = Math.abs((c.x - a.x) * -e.uz + (c.z - a.z) * e.ux); if (l < e.hw + 1 && Math.abs(s - p.s) < 26 && c.v > 2) return false; }
    const P = G.body; if (P && !P.onFoot) { const s = (P.x - a.x) * e.ux + (P.z - a.z) * e.uz, l = Math.abs((P.x - a.x) * -e.uz + (P.z - a.z) * e.ux); if (l < e.hw + 1 && Math.abs(s - p.s) < 40 && Math.hypot(P.vx, P.vz) > 3) return false; }
    return true;
  }
  // ---- spawning: walkers on the pavements around the player, people coming out of shops, people at tables
  function target() { return [0, 14, 30, 46][G.settings.traffic] ?? 30; }
  function spawnWalker(px, pz, first) {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * 6.283, d = first ? 20 + Math.random() * 150 : 85 + Math.random() * 100, ne = map.nearestEdge(px + Math.cos(a) * d, pz + Math.sin(a) * d, 60);
      if (!ne || ne.e.drive || ne.e.len - ne.e.ta - ne.e.tb < 24) continue;
      const e = ne.e; if (e.cls === 0 && Math.random() < 0.5) continue;
      const side = e.ow || Math.random() < 0.5 ? 1 : -1, s = e.ta + 3 + Math.random() * (e.len - e.ta - e.tb - 6), q = swPos(e, side, s);
      if (Math.hypot(q[0] - px, q[1] - pz) < (first ? 14 : 70) || world.inSolid(q[0], q[1], 0.4)) continue;
      const doors = doorsOf(e, side);
      if (!first && doors.length && Math.random() < 0.6) { const dr = doors[Math.floor(Math.random() * doors.length)], p = make(dr.x, dr.z, 0); p.wp = [[...swPos(e, side, dr.s), 0]]; p.after = [e, side, dr.s, Math.random() < 0.5 ? 1 : -1]; p.state = 'link'; p.fade = 0; return p; }
      const p = make(q[0], q[1], 0); attach(p, e, side, s, Math.random() < 0.5 ? 1 : -1); return p;
    }
    return null;
  }
  function syncSeats(px, pz) {
    let n = peds.reduce((a, p) => a + (p.seat ? 1 : 0), 0);
    for (const ch of world.loaded.values()) {
      if (!ch.ready || Math.abs(ch.cx - px) > 260 || Math.abs(ch.cz - pz) > 260) continue;
      for (const b of ch.blocks) for (const st of genBlock(map, b).seats) {
        const d = Math.hypot(st.x - px, st.z - pz);
        if (st.ped) { if (d > 190) remove(st.ped); continue; }
        if (n >= 14 || d > 150 || d < 12 || st.left || ((st.x * 7 + st.z * 13) % 1 + 1) % 1 > 0.62) continue;
        const p = make(st.x, st.z, st.a); p.state = 'sit'; p.pose = 1; p.amp = 0; p.seat = st; p.y = st.bench ? -0.36 : -0.3; st.ped = p; n++;
      }
    }
  }
  // ---- reactions
  function shout(p, kind = 'hey') { if (time - (p.shoutT || -9) < 2) return; p.shoutT = time; G.audio && G.audio.voiceAt(p.x, p.z, kind, 0.9 + (p.h - 1) * 4); }
  function flee(p, fx, fz, secs = 4) { if (p.seat) { p.seat.left = true; p.seat.ped = null; p.seat = null; p.y = 0; } const L = Math.hypot(fx, fz) || 1; p.state = 'flee'; p.fx = fx / L; p.fz = fz / L; p.t = secs; p.amp = 1.6; p.pose = 0; p.onRoad = false; p.wp = null; }
  function knock(p, P, speed) {
    if (p.seat) { p.seat.left = true; p.seat.ped = null; p.seat = null; }
    p.state = 'down'; p.pose = 2; p.amp = 1.4; p.onRoad = false; p.wp = null;
    p.vx = P.vx * 0.82 + (Math.random() - 0.5) * 2; p.vz = P.vz * 0.82 + (Math.random() - 0.5) * 2; p.vy = Math.min(7.5, 2.4 + speed * 0.14); p.y = 0.35; p.rx = 0; p.rs = (2 + Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1); p.t = 0; p.landed = false; p.yaw = Math.atan2(P.vx, P.vz) + Math.PI;
  }
  function update(dt, P) {
    time += dt;
    const px = P.x, pz = P.z, inCar = !P.onFoot, ps = inCar ? Math.hypot(P.vx, P.vz) : 0;
    if ((tSpawn -= dt) <= 0) {
      tSpawn = 0.3; const first = time < 2.5;
      const nW = peds.reduce((a, p) => a + (p.seat || p.state === 'down' ? 0 : 1), 0);
      if (nW < target()) for (let k = 0; k < (first ? 6 : 1); k++) spawnWalker(px, pz, first);
      syncSeats(px, pz);
      for (const p of [...peds]) if (!p.seat && Math.hypot(p.x - px, p.z - pz) > 230) remove(p);
    }
    const box = inCar ? bodyBox(P, 0.18) : null;
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i]; if (p.fade < 1 && p.state !== 'down' && p.state !== 'vanish') p.fade = Math.min(1, p.fade + dt * 2.5);
      // --- the player's car coming at them
      if (inCar && p.state !== 'down' && p.state !== 'vanish') {
        const dx = p.x - px, dz = p.z - pz;
        if (Math.abs(dx) < 34 && Math.abs(dz) < 34) {
          const lx = dx * box.ux + dz * box.uz, lz = -(dx) * box.uz + dz * box.ux - (P.zF + P.zR) / 2;
          if (Math.abs(lx) < box.hw + 0.12 && Math.abs(lz) < box.hd + 0.1) {
            if (G.settings.violence && ps > 2.6) { knock(p, P, ps); G.onPedHit && G.onPedHit(p, ps); continue; }
            // shoved aside, unharmed
            const sd = lx >= 0 ? 1 : -1; p.x += box.ux * sd * (box.hw + 0.5 - Math.abs(lx)); p.z += box.uz * sd * (box.hw + 0.5 - Math.abs(lx));
            if (ps > 1) { shout(p); flee(p, box.ux * sd, box.uz * sd, 3); G.onPedScare && G.onPedScare(p); }
          } else if (ps > 3.2 && p.state !== 'dodge') {
            const tt = clamp((dx * P.vx + dz * P.vz) / (ps * ps), 0, 1.6), cx = dx - P.vx * tt, cz = dz - P.vz * tt, miss = Math.hypot(cx, cz);
            const sure = !G.settings.violence;
            if (miss < 1.9 + (sure ? 0.8 : 0) && tt < (sure ? 1.5 : 1.3) && tt > 0.02) {
              // they need a moment to notice: the attentive ones a fraction of a second, the others often too long
              if (!p.seen) p.seen = time;
              if (sure || time - p.seen >= (p.alert ? p.react * 0.6 : p.react * 2.4)) {
                if (p.seat) { p.seat.left = true; p.seat.ped = null; p.seat = null; p.y = 0; }
                const sd = (cx * -P.vz + cz * P.vx) >= 0 ? 1 : -1, L = ps; p.state = 'dodge'; p.fx = -P.vz / L * sd; p.fz = P.vx / L * sd; p.t = sure ? 0.75 : 0.55; p.dv = sure ? 9 : 6.5; p.amp = 1.8; p.pose = 0; p.onRoad = false; p.wp = null; p.hop = 0; p.seen = 0; shout(p);
                G.onPedScare && G.onPedScare(p);
              }
            } else p.seen = 0;
          }
        }
      }
      // --- behaviour
      let mvx = 0, mvz = 0, sp = 0;
      if (p.state === 'walk') {
        p.s += p.dir * p.speed * dt; const e = p.e, q = swPos(e, p.side, p.s); mvx = q[0] - p.x; mvz = q[1] - p.z; p.x = q[0]; p.z = q[1]; p.yaw = Math.atan2(e.ux * p.dir, e.uz * p.dir); sp = p.speed;
        if ((p.dir > 0 && p.s >= sEnd(e, 1)) || (p.dir < 0 && p.s <= sEnd(e, -1))) atEnd(p);
        else if (Math.random() < dt * 0.05) { const ds = doorsOf(e, p.side).find(d => Math.abs(d.s - p.s) < 1.2); if (ds) { p.wp = [[ds.x, ds.z, 0]]; p.state = 'enter'; } }
      } else if (p.state === 'link' || p.state === 'enter' || p.state === 'cross') {
        const w = p.wp[0], dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz), st = p.speed * (p.state === 'cross' ? 1.15 : 1) * dt;
        if (d <= st) { p.x = w[0]; p.z = w[1]; p.wp.shift(); if (!p.wp.length) { if (p.state === 'enter') { p.state = 'vanish'; p.t = 0.4; } else { const A = p.after; attach(p, A[0], A[1], A[2], A[3]); } } }
        else { p.x += dx / d * st; p.z += dz / d * st; p.yaw = Math.atan2(dx, dz); }
        sp = p.speed; if (p.state === 'cross') { const a = map.nodes[p.e.a], l = Math.abs((p.x - a.x) * -p.e.uz + (p.z - a.z) * p.e.ux); p.onRoad = l < p.e.hw + 0.4; }
      } else if (p.state === 'wait') {
        p.t -= dt; p.amp = 0;
        if (p.t <= 0) { if (canCross(p)) { const q = swPos(p.e, -p.side, p.s); p.wp = [[q[0], q[1], 1]]; p.after = [p.e, -p.side, p.s, Math.random() < 0.7 ? -p.dir : p.dir]; p.state = 'cross'; p.amp = 1; } else { p.t = 0.5; if ((p.waited = (p.waited || 0) + 0.5) > 45) { p.waited = 0; p.dir = -p.dir; p.state = 'walk'; p.amp = 1; } } }
      } else if (p.state === 'dodge') {
        p.t -= dt; p.hop += dt; p.x += p.fx * p.dv * dt; p.z += p.fz * p.dv * dt; p.y = Math.max(0, Math.sin(Math.min(1, p.hop / 0.5) * Math.PI) * 0.35); p.yaw = Math.atan2(p.fx, p.fz); sp = p.dv;
        if (p.t <= 0) { p.y = 0; flee(p, p.fx, p.fz, 2.5 + Math.random() * 2); }
      } else if (p.state === 'flee') {
        p.t -= dt; const nx = p.x + p.fx * 4.2 * dt, nz = p.z + p.fz * 4.2 * dt;
        if (world.inSolid(nx, nz, 0.35)) { const t = p.fx; p.fx = -p.fz; p.fz = t; } else { p.x = nx; p.z = nz; }
        p.yaw = Math.atan2(p.fx, p.fz); sp = 4.2;
        if (p.t <= 0) { const ne = map.nearestEdge(p.x, p.z, 60); if (!ne) { remove(p); continue; } const e = ne.e, s = clamp(ne.t, e.ta + 2, e.len - e.tb - 2), q = swPos(e, ne.side, s); p.wp = [[q[0], q[1], 0]]; p.after = [e, ne.side, s, Math.random() < 0.5 ? 1 : -1]; p.e = e; p.state = 'link'; p.amp = 1; }
      } else if (p.state === 'vanish') { p.t -= dt; p.fade = clamp(p.t / 0.4); if (p.t <= 0) { remove(p); continue; } }
      else if (p.state === 'down') {
        p.t += dt;
        if (!p.landed) { p.vy -= 9.8 * dt; p.y += p.vy * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.rx += p.rs * dt;
          if (p.y <= 0.13) { p.y = 0.13; p.landed = true; p.tl = p.t; p.rx = Math.PI / 2 * (p.rs > 0 ? 1 : -1); p.amp = 0.25; G.onPedLand && G.onPedLand(p); } }
        else { const k = Math.exp(-dt * 3.5); p.vx *= k; p.vz *= k; const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt; if (!world.inSolid(nx, nz, 0.3)) { p.x = nx; p.z = nz; } p.amp *= Math.exp(-dt * 2);
          const tl = p.t - p.tl; if (tl > 4.5) p.fade = clamp(1 - (tl - 4.5) / 1.5); if (tl > 6) { remove(p); continue; } }
      } else if (p.state === 'sit') { p.amp = 0; }
      if (sp > 0) p.ph += dt * (4.2 + sp * 3.1);
    }
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function draw(camera) {
    let n = 0; const cx = camera.position.x, cz = camera.position.z;
    for (const p of peds) {
      if (n >= CAP || Math.abs(p.x - cx) > 170 || Math.abs(p.z - cz) > 170) continue;
      _q.setFromEuler(_e.set(p.state === 'down' ? p.rx : 0, p.yaw, 0, 'YXZ'));
      _m.compose(_v.set(p.x, p.y + (p.state === 'down' ? 0 : 0.14 * (p.onRoad || p.state === 'sit' ? 0 : 1)), p.z), _q, _s.set(p.wd, p.h, p.wd)); mesh.setMatrixAt(n, _m);
      iAnim.setXYZW(n, p.ph, p.amp, p.pose, p.fade); iA.setXYZ(n, p.top[0], p.top[1], p.top[2]); iB.setXYZ(n, p.leg[0], p.leg[1], p.leg[2]); iS.setXYZ(n, p.skin[0], p.skin[1], p.skin[2]); iH.setXYZ(n, p.hair[0], p.hair[1], p.hair[2]); n++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; for (const a of [iAnim, iA, iB, iS, iH]) a.needsUpdate = true;
  }
  return {
    list: peds, update, draw, mesh,
    // the driver of a wrecked or taken car gets out on the left and runs
    bail(c, fromX = null, fromZ = null) { const lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw), p = make(c.x + lx * (c.hw + 0.6), c.z + lz * (c.hw + 0.6), 0); const ax = fromX == null ? lx : p.x - fromX, az = fromZ == null ? lz : p.z - fromZ; flee(p, ax, az, 5); p.fade = 0.2; return p; },
    hornAt(x, z, fx, fz) { for (const p of peds) { if (p.state === 'down' || p.state === 'vanish' || p.state === 'dodge') continue; const dx = p.x - x, dz = p.z - z, f = dx * fx + dz * fz, l = dx * fz - dz * fx; if (f > 0 && f < 16 && Math.abs(l) < 3.2) { shout(p); flee(p, fz * (l >= 0 ? 1 : -1) + fx * 0.3, -fx * (l >= 0 ? 1 : -1) + fz * 0.3, 2.2); } } },
    count(state) { return peds.reduce((a, p) => a + (!state || p.state === state ? 1 : 0), 0); },
    spawnAt(x, z, yaw = 0) { const p = make(x, z, yaw); const ne = map.nearestEdge(x, z, 80); if (ne) attach(p, ne.e, ne.side, clamp(ne.t, ne.e.ta + 2, ne.e.len - ne.e.tb - 2), 1); p.x = x; p.z = z; p.state = 'idle'; p.amp = 0; return p; },
    dispose() { geo.dispose(); mat.dispose(); scene.remove(mesh); },
  };
}
