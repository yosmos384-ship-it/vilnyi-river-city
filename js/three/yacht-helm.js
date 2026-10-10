// VILNYI Lifestyle yacht — under way: helm physics (throttle, rudder, inertia), soft limits of the navigable water with
// a depth alarm, the autopilot (scenic loop with the slow pass in front of VILNYI RIVER CITY → back to the pier), the
// stern-to docking manoeuvre and the wake.
import * as THREE from 'three';
import { PIER, DOCK, WATER_Y } from './yacht-pier.js?v=3.10';
import { clearance, awayDir, LOOP, route, clearLine, PASS_END, PROJECT } from './yacht-nav.js?v=3.10';
import { HT } from './yacht-heli-i18n.js?v=3.10';
import { bearingOf } from '../data.js?v=3.10';

const VMAX = 11, VCRUISE = 9.5, VAST = 3.2, RTURN = 115;   // m/s, m/s, m/s astern, turning radius at full rudder (m)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawOfDir = (dx, dz) => Math.atan2(-dz, dx);          // rotation.y whose local +x points along (dx, dz)

export function createHelm(yacht) {
  const walk = yacht.walk;
  const pose = { x: DOCK.pos[0], z: DOCK.pos[1], yaw: DOCK.yaw, roll: 0, pitch: 0, heave: 0 };
  const input = { throttle: 0, rudderPad: 0 };
  const H = {
    pose, input, speed: 0, omega: 0, throttle: 0, rudder: 0, mode: 'docked', docked: true, phase: null, queue: null, stuck: 0, alarmT: 0, dist: 0,
    heading() { return bearingOf(Math.cos(pose.yaw), -Math.sin(pose.yaw)); },
    // back at the pier at once (leaving the experience, or a teleport to the quay while she is away)
    reset() { pose.x = DOCK.pos[0]; pose.z = DOCK.pos[1]; pose.yaw = DOCK.yaw; pose.roll = pose.pitch = pose.heave = 0; H.speed = H.omega = 0; H.throttle = H.rudder = 0; input.throttle = 0; H.mode = 'docked'; H.docked = true; H.phase = null; H.queue = null; trail.length = 0; },
    manual() { if (H.mode === 'docked') castOff(); if (H.mode !== 'manual') { H.mode = 'manual'; H.phase = null; input.throttle = H.throttle; } },
    // scenic loop: from the pier the whole circuit; from elsewhere join it at the nearest mark by fairway and carry on
    auto() { if (H.mode === 'auto') return H.manual(); const fresh = H.docked; if (H.docked) castOff(); H.mode = 'auto'; H.phase = null; H.queue = fresh ? LOOP.slice() : joinLoop(); H.stuck = 0; },
    // back to the pier from anywhere: by the fairway to the approach point on the pier's axis (where the loop ends too)
    ret() { if (H.docked) return; H.mode = 'return'; H.stuck = 0; planReturn(); },
    // hands off the helm while under way → the autopilot takes her round the loop
    release() { if (!H.docked && H.mode === 'manual') { H.mode = 'auto'; H.phase = null; H.queue = joinLoop(); H.stuck = 0; } },
    update, dispose,
  };
  function castOff() { H.docked = false; H.mode = 'manual'; yacht.audio.sfx('horn'); }
  // route to the loop mark that is cheapest to reach by fairway, then the rest of the circuit
  function joinLoop() {
    let best = null, bc = Infinity;
    for (let k = 0; k < LOOP.length; k++) { const r = route(pose.x, pose.z, 0, 0, k); if (!r) continue; let c = 0, px = pose.x, pz = pose.z; for (const [a, b] of r) { c += Math.hypot(a - px, b - pz); px = a; pz = b; }
      // prefer a mark ahead of the bow
      const ang = Math.abs(wrap(yawOfDir(r[0][0] - pose.x, r[0][1] - pose.z) - pose.yaw)); c += ang * 120; if (c < bc) { bc = c; best = [...r, ...LOOP.slice(k + 1)]; } }
    return best;   // null: no mark in clear sight (backs off first)
  }
  // the approach point: on the pier's axis 128 m from its root (the yacht's centre; her stern then swings 30 m clear of
  // the pier head, and no shore, islet or the fountain is nearer than 60 m to any part of the hull while she pivots)
  const A = PASS_END;
  function planReturn() { H.phase = 'route'; H.queue = route(pose.x, pose.z, A[0], A[1]); }
  // steer towards a point; returns the distance to it
  function steerTo(tx, tz, vmax, dt) {
    const dx = tx - pose.x, dz = tz - pose.z, d = Math.hypot(dx, dz), err = wrap(yawOfDir(dx, dz) - pose.yaw);
    H.rudder += (clamp(err * 2.2, -1, 1) - H.rudder) * Math.min(1, dt * 2.5);
    // far off the bearing (a mark astern after "Return" or a manual excursion): take the way off and swing round on the
    // thrusters — a U-turn at speed is 230 m wide and used to end with the bow in the shallows of the island
    H.err = err;
    if (Math.abs(err) > 0.9) { vmax = Math.min(vmax, 0.45); if (H.speed > 1.0) H.speed *= Math.max(0, 1 - dt * 0.45); }
    const slow = 1 - 0.6 * Math.min(1, Math.abs(err) / 1.0);
    H.throttle += (clamp(vmax * slow / VMAX, 0, 1) - H.throttle) * Math.min(1, dt * 0.8);
    return d;
  }
  // follow H.queue (fairway points). Returns true when the last one is reached. Without a route — the bow is against a
  // shore — she backs off until a mark comes into clear sight.
  function follow(dt) {
    if (!H.queue) {
      H.rudder += (0 - H.rudder) * Math.min(1, dt * 2); H.throttle += (-0.45 - H.throttle) * Math.min(1, dt); H.stuck += dt;
      // (until the bow has water under it again — the soft limit holds her while it is in the shallows — or 25 s at most)
      if (H.stuck > 3 && (H.stuck > 25 || clearance(pose.x + Math.cos(pose.yaw) * 70, pose.z - Math.sin(pose.yaw) * 70) > 28)) { H.stuck = 0; if (H.mode === 'return') planReturn(); else H.queue = joinLoop(); }
      return false;
    }
    if (!H.queue.length) return true;
    const mk = H.queue[0], tx = mk[0], tz = mk[1];   // (a mark may carry its own speed and rounding radius)
    // she keeps to the leg — the straight line from the last mark (or from where the route was planned), which is the
    // line whose clearance was checked — by steering for a point 110 m ahead on it, not straight for the mark
    if (H.legQ !== H.queue) { H.legQ = H.queue; H.leg = [pose.x, pose.z]; }
    let ax = tx, az = tz;
    { const lx = tx - H.leg[0], lz = tz - H.leg[1], L = Math.hypot(lx, lz);
      if (L > 1) { const u = ((pose.x - H.leg[0]) * lx + (pose.z - H.leg[1]) * lz) / L, a = Math.min(L, Math.max(0, u) + 110); ax = H.leg[0] + lx / L * a; az = H.leg[1] + lz / L * a; } }
    steerTo(ax, az, mk[2] ?? VCRUISE, dt);
    const d = Math.hypot(tx - pose.x, tz - pose.z);
    // a mark counts as rounded when close, or when it has come abeam (no orbiting round a mark inside the turning circle)
    const ahead = (tx - pose.x) * Math.cos(pose.yaw) + (tz - pose.z) * -Math.sin(pose.yaw);
    // (only a mark that has been ahead of the bow: one that starts astern has to be steered for, not skipped)
    if (ahead > 0) H.seen = H.queue[0];
    // — and only once the next mark is in clear sight from here: a corner is never cut across a shore or the fountain
    if ((d < (mk[3] ?? 95) || (d < 280 && ahead < 0 && H.queue.length > 1 && H.seen === H.queue[0])) && (H.queue.length < 2 || d < 28 || clearLine(pose.x, pose.z, H.queue[1][0], H.queue[1][1], 45, 40))) { H.leg = [tx, tz]; H.queue.shift(); H.stuck = 0; if (!H.queue.length) return true; }
    // not getting anywhere (a mark behind a headland after a manual excursion): re-plan
    // (swinging round on the thrusters is not being stuck)
    if (Math.abs(H.speed) < 0.4 && Math.abs(H.err) < 0.9) { H.stuck += dt; if (H.stuck > 12) { H.stuck = 0; H.queue = null; } } else H.stuck = 0;
    return false;
  }
  function update(dt) {
    if (H.docked) { pose.heave = 0; wake(dt); return; }
    const helming = yacht.mode === 'helm';
    // ---- controls
    if (H.mode === 'manual') {
      if (helming) {
        const K = walk.keys;
        if (K.has('KeyW') || K.has('ArrowUp')) input.throttle = clamp(input.throttle + 0.45 * dt, -0.5, 1);
        if (K.has('KeyS') || K.has('ArrowDown')) input.throttle = clamp(input.throttle - 0.6 * dt, -0.5, 1);
        let r = input.rudderPad; if (K.has('KeyA') || K.has('ArrowLeft')) r += 1; if (K.has('KeyD') || K.has('ArrowRight')) r -= 1;
        H.rudder += (clamp(r, -1, 1) - H.rudder) * Math.min(1, dt * 2.2);
      } else H.rudder += (0 - H.rudder) * Math.min(1, dt * 1.5);
      H.throttle = input.throttle;
    } else if (H.mode === 'auto') {
      // the loop ends on the pier's axis off the pier head: the last mark is the docking manoeuvre's approach point
      if (H.queue && H.queue.length === 1 && H.queue[0][0] === A[0] && H.queue[0][1] === A[1]) { H.mode = 'return'; H.phase = 'approach'; H.queue = null; H.stuck = 0; }
      else if (follow(dt)) { H.mode = 'return'; H.stuck = 0; planReturn(); }
    } else if (H.mode === 'return') docking(dt);
    // ---- soft limits: slow down and turn away from shallow water (the autopilot's docking manoeuvre is exempt)
    let vcap = VMAX;
    if (!(H.mode === 'return' && H.phase && H.phase !== 'route' && H.phase !== 'approach')) {
      const fx = Math.cos(pose.yaw), fz = -Math.sin(pose.yaw), sgn = H.speed >= -0.05 ? 1 : -1;
      const px = pose.x + sgn * fx * 70, pz = pose.z + sgn * fz * 70;                 // bow (or stern when going astern)
      const ahead = Math.max(20, Math.abs(H.speed) * 7), c0 = clearance(px, pz), c1 = clearance(px + sgn * fx * ahead, pz + sgn * fz * ahead), c = Math.min(c0, c1);
      // (the alarm is for the hand on the helm; the autopilot's marks keep their own margins, so its bow may sweep closer)
      if (c < (H.mode === 'manual' ? 45 : 32)) {
        vcap = VMAX * clamp((c0 - 6) / 45, 0, 1) + 0.6 * clamp(c0 / 10, 0, 1);
        if (H.mode === 'manual') {
          const [ax, az] = awayDir(px, pz), turn = wrap(yawOfDir(ax, az) - pose.yaw);     // steer to where the water is deeper
          H.rudder += (clamp(turn * 1.5, -1, 1) * sgn - H.rudder) * Math.min(1, dt * 3) * clamp((45 - c) / 30, 0, 1);
        }
        H.alarmT -= dt; if (H.alarmT <= 0) { H.alarmT = 6; walk._toast(yacht.t('depth'), 2600); yacht.audio.sfx('alarm'); }
        if (c0 < 8 && sgn * H.speed > 0) H.speed *= Math.max(0, 1 - dt * 3);
      } else H.alarmT = Math.min(H.alarmT, 1.5);
    }
    // ---- dynamics (a heavy displacement hull: slow to gather way, slower to lose it)
    if (H.phase !== 'pivot' && H.phase !== 'back') {
      const vt = clamp(H.throttle >= 0 ? H.throttle * VMAX : H.throttle * 2 * VAST, -VAST, vcap), tau = Math.abs(vt) > Math.abs(H.speed) ? 7 : 5;
      H.speed += (vt - H.speed) * (1 - Math.exp(-dt / tau));
      const wt = H.rudder * (H.speed / RTURN + 0.045 * (1 - Math.min(1, Math.abs(H.speed) / 3)) * (helming || H.mode !== 'manual' ? 1 : 0));
      H.omega += (wt - H.omega) * (1 - Math.exp(-dt / 2.2));
    }
    pose.yaw = wrap(pose.yaw + H.omega * dt);
    pose.x += Math.cos(pose.yaw) * H.speed * dt; pose.z += -Math.sin(pose.yaw) * H.speed * dt;
    H.dist += Math.abs(H.speed) * dt;
    const t = performance.now() / 1000, k = Math.min(1, Math.abs(H.speed) / 6);
    pose.roll += (clamp(-H.omega * H.speed * 0.9, -0.03, 0.03) + Math.sin(t * 0.7) * 0.004 * k - pose.roll) * Math.min(1, dt * 1.2);
    pose.pitch = Math.sin(t * 0.53) * 0.0025 * k; pose.heave = Math.sin(t * 0.61) * 0.05 * k;
    passWatch(dt);
    wake(dt);
  }
  // ---- return to the pier: route → approach point → stop → pivot (bow to the lake) → back in along the pier axis → moored
  function docking(dt) {
    if (H.phase === 'route') {   // along the fairway marks until the approach point is next
      if (H.queue && H.queue.length <= 1) { H.phase = 'approach'; return; }
      if (follow(dt)) H.phase = 'approach';
      return;
    }
    if (H.phase === 'approach') {
      const dx = A[0] - pose.x, dz = A[1] - pose.z, off = Math.abs(wrap(yawOfDir(dx, dz) - pose.yaw));
      const d = steerTo(A[0], A[1], clamp(Math.hypot(dx, dz) / 12, 1.2, VCRUISE), dt);
      if (d < 14 || (d < 60 && Math.abs(H.speed) < 0.5)) { H.phase = 'stop'; return; }
      // already out on the pier's axis (just cast off, or drifted past the point): no need to go round — stop and back in
      { const [s, tt] = PIER.local(pose.x, pose.z); if (s > 106 && s < 300 && Math.abs(tt) < 45 && Math.abs(H.speed) < 1.0) { H.phase = 'stop'; return; } }
      // on the bearing but not getting anywhere (the straight line is not clear from here): back off and plan again
      if (off < 0.9 && Math.abs(H.speed) < 0.3) { H.stuck += dt; if (H.stuck > 8) { H.stuck = 0; H.phase = 'route'; H.queue = null; } } else H.stuck = 0;
      return;
    }
    if (H.phase === 'stop') {
      H.throttle = 0; H.rudder += (0 - H.rudder) * Math.min(1, dt * 2); H.speed *= Math.max(0, 1 - dt * 0.9);
      if (Math.abs(H.speed) < 0.25) { H.phase = 'pivot'; H.speed = 0; }
      return;
    }
    if (H.phase === 'pivot') {   // thrusters: turn on the spot until the bow points down the pier axis to the lake
      const err = wrap(DOCK.yaw - pose.yaw);
      H.omega += (clamp(err * 0.5, -0.11, 0.11) - H.omega) * Math.min(1, dt * 1.2); H.speed = 0; H.throttle = 0; H.rudder = clamp(err, -1, 1);
      slide(dt, 0.45);
      if (Math.abs(err) < 0.006 && Math.abs(H.omega) < 0.004) { H.phase = 'back'; H.omega = 0; pose.yaw = DOCK.yaw; }
      return;
    }
    if (H.phase === 'back') {    // astern along the axis: slide onto the line, slow down on the last metres, make fast
      const [s, tt] = PIER.local(pose.x, pose.z), left = s - DOCK.s;
      // (she comes astern only as fast as she is getting onto the line: never against the pier off its axis)
      const v = left < 0.12 ? 0 : -clamp(left * 0.12, 0.25, 2.6) * clamp(1 - (Math.abs(tt) - 0.4) / 4, left > 14 ? 0.12 : 0, 1); H.speed += (v - H.speed) * Math.min(1, dt * 0.8); H.throttle = H.speed / (2 * VAST); H.rudder = 0; H.omega = 0; pose.yaw = DOCK.yaw;
      slide(dt, 0.6);
      if (left < 0.12 && Math.abs(tt) < 0.3) { H.reset(); yacht.audio.sfx('horn'); walk._toast(yacht.t('docked'), 2600); }
    }
  }

  // thrusters: sideways onto the pier's axis
  function slide(dt, vmax) { const tt = PIER.local(pose.x, pose.z)[1], lat = clamp(-tt, -vmax * dt, vmax * dt); pose.x += PIER.T[0] * lat; pose.z += PIER.T[1] * lat; }
  // ---- the pass: a line on the screen when the project comes ahead of the bow / abeam (any mode, a few times a trip)
  const said = { ahead: -1e9, side: -1e9 }; let passClock = 0;
  function passWatch(dt) {
    passClock += dt;
    const dx = PROJECT[0] - pose.x, dz = PROJECT[1] - pose.z, d = Math.hypot(dx, dz); H.projectDist = d;
    const rel = wrap(yawOfDir(dx, dz) - pose.yaw);          // > 0: to port (rotation.y grows anticlockwise seen from above)
    H.projectRel = rel;
    if (d > 640 || Math.abs(H.speed) < 0.8) return;
    const a = Math.abs(rel);
    if (a < 0.3 && H.speed > 0 && d > 430 && passClock - said.ahead > 150 && passClock - said.side > 60) { said.ahead = passClock; walk._toast(HT(yacht.lang, 'passAhead'), 4200); }
    else if (a > 0.95 && a < 2.1 && d < 470 && passClock - said.side > 150) { said.side = passClock; walk._toast(HT(yacht.lang, rel > 0 ? 'passPort' : 'passStbd'), 5200); H.passSide = rel > 0 ? 'port' : 'starboard'; H.passes = (H.passes || 0) + 1; }
  }
  // ---- wake: a foam ribbon laid on the water behind the stern (world space) + a soft churn patch at the transom
  const N = 56, trail = [];
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), al = new Float32Array(N * 2), idx = [];
  for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aA', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage)); geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uK: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float aA; varying float vA; varying vec2 vU; void main(){ vA = aA; vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uT, uK; varying float vA; varying vec2 vU;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){ float e = abs(vU.x * 2. - 1.); float foam = n(vec2(vU.x * 9., vU.y * 0.9 - uT * 0.25)) * 0.6 + n(vec2(vU.x * 24., vU.y * 2.6 + uT * 0.4)) * 0.4;
        float edge = smoothstep(0.55, 0.95, e) * (1. - smoothstep(0.95, 1., e)), core = (1. - smoothstep(0., 0.5, e)) * 0.55;
        float a = vA * uK * clamp((edge * 0.9 + core) * (0.45 + foam * 0.9), 0., 1.);
        gl_FragColor = vec4(vec3(0.93, 0.97, 1.0), a * 0.8);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'vrc-yacht-wake'; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.visible = false; walk.scene.add(mesh);
  let acc = 0, len = 0;
  function wake(dt) {
    mat.uniforms.uT.value += dt;
    mat.uniforms.uK.value = walk.envMode === 'night' ? 0.5 : walk.envMode === 'dusk' ? 0.7 : 1;
    for (const p of trail) p.age += dt;
    while (trail.length && trail[0].age > 34) trail.shift();
    const sp = Math.abs(H.speed);
    if (!H.docked && sp > 0.3) {
      acc += sp * dt;
      if (acc > 5 || !trail.length) { acc = 0; const fx = Math.cos(pose.yaw), fz = -Math.sin(pose.yaw), o = H.speed > 0 ? -64 : 64; len += 5; trail.push({ x: pose.x + fx * o, z: pose.z + fz * o, nx: fz, nz: -fx, age: 0, k: Math.min(1, sp / 5), v: len }); if (trail.length > N - 1) trail.shift(); }
    }
    mesh.visible = trail.length > 1; if (!mesh.visible) return;
    // newest sample = the transom right now
    const fx = Math.cos(pose.yaw), fz = -Math.sin(pose.yaw), o = H.speed >= 0 ? -64 : 64;
    const pts = [...trail, { x: pose.x + fx * o, z: pose.z + fz * o, nx: fz, nz: -fx, age: 0, k: Math.min(1, sp / 5), v: len + acc }];
    for (let i = 0; i < N; i++) {
      const p = pts[Math.min(i, pts.length - 1)], w = 7.5 + p.age * 1.25, a = i < pts.length ? p.k * Math.max(0, 1 - p.age / 34) * Math.min(1, (pts.length - 1 - i) > 0 ? 1 : 0.9) : 0;
      pos[i * 6] = p.x + p.nx * w; pos[i * 6 + 1] = WATER_Y + 0.07; pos[i * 6 + 2] = p.z + p.nz * w; pos[i * 6 + 3] = p.x - p.nx * w; pos[i * 6 + 4] = WATER_Y + 0.07; pos[i * 6 + 5] = p.z - p.nz * w;
      uv[i * 4] = 0; uv[i * 4 + 1] = p.v / 14; uv[i * 4 + 2] = 1; uv[i * 4 + 3] = p.v / 14; al[i * 2] = al[i * 2 + 1] = a;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true; geo.attributes.aA.needsUpdate = true;
  }
  function dispose() { if (mesh.parent) mesh.parent.remove(mesh); geo.dispose(); mat.dispose(); }
  return H;
}
