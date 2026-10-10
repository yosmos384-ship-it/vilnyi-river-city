// City Drive — every other car: lane-following traffic (signals, queues, lane changes, horns), kerb-parked cars,
// loose bodies after a crash, wrecks, police and the ambulance. All drawn as instances: one mesh per car design
// (cars.js far model, tinted per car) + one each for contact shadows, roof light bars and night lights.
import * as THREE from 'three';
import { carGeometryXForward, CAR_KINDS, CAR_COLOURS, carSpec } from '../cars.js?v=3.13';
import { ROAD, hash2 } from './map.js?v=3.13';
import { genEdge, genBlock } from './gen.js?v=3.13';
import { makeBody, stepBody, bodyBox, obbMTV, collide, collideStatic, CLASS } from './vehicle.js?v=3.13';

const COLS = ['black', 'graphite', 'pearl', 'blue', 'champagne', 'green', 'silver', 'silver', 'burgundy', 'bronze', 'ice', 'red', 'pearl', 'graphite'];
const KINDS = ['sedan', 'sedan', 'suv', 'suv', 'ev', 'ev', 'gt', 'coupe', 'sedan', 'super'];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const CAP = 96, DRAW_R = 300;

export function createTraffic(G) {
  const { map, world, scene } = G;
  const group = new THREE.Group(); group.name = 'city-traffic'; scene.add(group);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.34 });
  const inst = {};
  for (const k of CAR_KINDS) { const g = carGeometryXForward(k); g.rotateY(-Math.PI / 2); const m = new THREE.InstancedMesh(g, mat, CAP); m.count = 0; m.frustumCulled = false; m.name = 'city-cars-' + k; m.setColorAt(0, new THREE.Color(1, 1, 1)); group.add(m); inst[k] = m; }
  const shTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 64, 4, 32, 64, 60); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.save(); g.translate(32, 64); g.scale(0.5, 1); g.translate(-32, -64); g.fillRect(-64, 0, 192, 128); g.restore(); return new THREE.CanvasTexture(c); })();
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), CAP * 3);
  shadows.count = 0; shadows.frustumCulled = false; shadows.renderOrder = 1; group.add(shadows);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.13, 0.26), new THREE.MeshBasicMaterial({ toneMapped: false }), 16); bars.count = 0; bars.frustumCulled = false; bars.setColorAt(0, new THREE.Color(1, 1, 1)); group.add(bars);
  const NG = 600, gGeo = new THREE.BufferGeometry(); gGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NG * 3), 3)); gGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NG * 3), 3)); gGeo.setDrawRange(0, 0);
  const gTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const glows = new THREE.Points(gGeo, new THREE.PointsMaterial({ map: gTex, size: 1.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glows.frustumCulled = false; glows.renderOrder = 6; group.add(glows);

  const cars = []; let nextId = 1, tSpawn = 0, time = 0; const stats = { sig: [0, 0, 0] };   // junction entries on green / yellow / red
  const pickCol = r => COLS[Math.floor(r * COLS.length)];
  function make(kind, colour, x, z, yaw, mode) {
    const b = makeBody(kind, x, z, yaw);
    Object.assign(b, { id: nextId++, colour, col: new THREE.Color(CAR_COLOURS[colour] || colour), mode, v: 0, lat: 0, latT: 0, driver: mode !== 'parked', wait: 0, honk: 0, wreck: false, tilt: 0, blockT: 0, slowT: 0, k0: Math.random() });
    cars.push(b); return b;
  }
  const remove = c => { const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); c.mode = 'gone'; if (c.lockNode && c.lockNode.lock === c.id) c.lockNode.lock = 0; };
  // ---- lanes
  const laneLat = (e, lane) => (e.ow ? -e.hw + (Math.min(lane, e.lanes - 1) + 0.5) * (2 * e.hw / e.lanes) : ROAD[e.cls].med / 2 + (lane + 0.5) * ROAD[e.cls].lw);   // one-way: lanes across the whole carriageway
  function seg(e, dir) {
    const o = map.nodes[dir > 0 ? e.a : e.b], end = map.nodes[dir > 0 ? e.b : e.a], hx = e.ux * dir, hz = e.uz * dir;
    return { o, end, hx, hz, rx: -hz, rz: hx, s0: dir > 0 ? e.ta : e.tb, s1: e.len - (dir > 0 ? e.tb : e.ta), zebra: dir > 0 ? e.zb : e.za };
  }
  function place(c) {   // rail position → world pose
    if (c.turn) { const T = c.turn, t = clamp(T.t), u = 1 - t; c.x = u * u * T.p0[0] + 2 * u * t * T.p1[0] + t * t * T.p2[0]; c.z = u * u * T.p0[1] + 2 * u * t * T.p1[1] + t * t * T.p2[1];
      const dx = 2 * u * (T.p1[0] - T.p0[0]) + 2 * t * (T.p2[0] - T.p1[0]), dz = 2 * u * (T.p1[1] - T.p0[1]) + 2 * t * (T.p2[1] - T.p1[1]); if (dx * dx + dz * dz > 1e-6) c.yaw = Math.atan2(dx, dz); return; }
    const S = c.sg; c.x = S.o.x + S.hx * c.s + S.rx * c.lat; c.z = S.o.z + S.hz * c.s + S.rz * c.lat;
    c.yaw = Math.atan2(S.hx, S.hz) + clamp((c.latT - c.lat) * 0.12, -0.2, 0.2);
  }
  function enter(c, e, dir, lane, s) { c.e = e; c.dir = dir; c.lane = lane; c.sg = seg(e, dir); c.s = s ?? c.sg.s0; c.lat = c.latT = laneLat(e, lane); c.turn = null; c.next = null; c.v0 = ROAD[e.cls].v * (0.82 + 0.3 * c.k0); }
  function chooseNext(c) {
    const n = c.sg.end, opts = [];
    for (const ei of n.edges) { const e = map.edges[ei]; if (e === c.e || e.dead) continue; const d = e.a === n.id ? 1 : -1; if (e.ow && d < 0) continue; const cs = c.sg.hx * e.ux * d + c.sg.hz * e.uz * d; if (e.drive && Math.random() > 0.04) continue; opts.push({ e, d, w: 0.2 + Math.max(0, cs) ** 2 * 2.2 + (e.cls >= c.e.cls ? 0.4 : 0) }); }
    if (!opts.length) return c.e.ow ? null : { e: c.e, d: -c.dir };
    let r = Math.random() * opts.reduce((a, o) => a + o.w, 0); for (const o of opts) { r -= o.w; if (r <= 0) return o; } return opts[0];
  }
  function startTurn(c) {
    const nx = c.next || chooseNext(c); if (!nx) { remove(c); return false; } const e2 = nx.e, d2 = nx.d, S2 = seg(e2, d2), lane2 = Math.min(c.lane, e2.lanes - 1), lat2 = laneLat(e2, lane2);
    const p0 = [c.x, c.z], p2 = [S2.o.x + S2.hx * S2.s0 + S2.rx * lat2, S2.o.z + S2.hz * S2.s0 + S2.rz * lat2];
    const h0 = [c.sg.hx, c.sg.hz], den = h0[0] * S2.hz - h0[1] * S2.hx; let p1;
    if (Math.abs(den) > 0.25) { const t = ((p2[0] - p0[0]) * S2.hz - (p2[1] - p0[1]) * S2.hx) / den; p1 = t > 0 && t < 60 ? [p0[0] + h0[0] * t, p0[1] + h0[1] * t] : [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2]; }
    else p1 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
    let len = 0, px = p0[0], pz = p0[1]; for (let k = 1; k <= 6; k++) { const t = k / 6, u = 1 - t, x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], z = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]; len += Math.hypot(x - px, z - pz); px = x; pz = z; }
    c.turn = { p0, p1, p2, len: Math.max(1, len), t: 0, e2, d2, lane2, sharp: Math.abs(den) > 0.4 };
    const n = c.sg.end; if (!n.signal) { n.lock = c.id; n.lockT = time; c.lockNode = n; } else stats.sig[world.signal(n, map.axisAt(n, c.e))]++;
    return true;
  }
  // ---- spawning
  function density() { return [0, 9, 20, 32][G.settings.traffic] ?? 20; }
  function spawnAI(px, pz, near = false) {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * 6.283, d = near ? 60 + Math.random() * 120 : 190 + Math.random() * 130, ne = map.nearestEdge(px + Math.cos(a) * d, pz + Math.sin(a) * d, 70);
      if (!ne || ne.e.drive || ne.e.len < 60) continue;
      const e = ne.e, dir = e.ow || Math.random() < 0.5 ? 1 : -1, S = seg(e, dir), s = S.s0 + 6 + Math.random() * Math.max(1, S.s1 - S.s0 - 30), lane = Math.floor(Math.random() * e.lanes), lat = laneLat(e, lane);
      const x = S.o.x + S.hx * s + S.rx * lat, z = S.o.z + S.hz * s + S.rz * lat;
      if (Math.hypot(x - px, z - pz) < (near ? 45 : 170)) continue;
      if (cars.some(c => Math.abs(c.x - x) < 11 && Math.abs(c.z - z) < 11)) continue;
      const c = make(KINDS[Math.floor(Math.random() * KINDS.length)], pickCol(Math.random()), x, z, 0, 'ai'); enter(c, e, dir, lane, s); c.v = c.v0 * 0.8; place(c); return c;
    }
    return null;
  }
  // kerb-parked cars and car-park rows come and go with the chunks (only the nearer ones are kept)
  const parkedOf = new Map();
  function syncParked(px, pz) {
    for (const ch of world.loaded.values()) {
      if (!ch.ready) continue; const d = Math.max(Math.abs(ch.cx - px), Math.abs(ch.cz - pz));
      if (d < 330 && !parkedOf.has(ch.key)) {
        const list = [];
        for (const e of ch.edges) for (const p of genEdge(map, e).park) { if (p.gone) continue; const c = make(KINDS[Math.floor(p.k * 977) % KINDS.length], pickCol((p.k * 131) % 1), p.x, p.z, p.yaw, 'parked'); c.spot = p; list.push(c); }
        for (const b of ch.blocks) for (const p of genBlock(map, b).lots) { if (p.gone) continue; const k = hash2(Math.round(p.x), Math.round(p.z)); const c = make(KINDS[Math.floor(k * 977) % KINDS.length], pickCol((k * 131) % 1), p.x, p.z, p.yaw, 'parked'); c.spot = p; list.push(c); }
        parkedOf.set(ch.key, list);
      } else if (d > 400 && parkedOf.has(ch.key)) { for (const c of parkedOf.get(ch.key)) if (c.mode === 'parked') remove(c); parkedOf.delete(ch.key); }
    }
    for (const k of [...parkedOf.keys()]) if (!world.loaded.has(k)) { for (const c of parkedOf.get(k)) if (c.mode === 'parked') remove(c); parkedOf.delete(k); }
  }
  // ---- driving on rails
  function sense(c, others, fx, fz) {   // nearest thing ahead in the lane: {gap, v}
    let gap = 80, lv = 0, who = null; const lx = fz, lz = -fx, hl = c.zF;
    for (const o of others) {
      if (o === c || o.mode === 'gone') continue;
      const dx = o.x - c.x, dz = o.z - c.z; if (Math.abs(dx) > 45 || Math.abs(dz) > 45) continue;
      const f = dx * fx + dz * fz, l = dx * lx + dz * lz; if (f < 0.5 || f > 45) continue;
      const half = o.ped ? 0.5 : 1.15 + Math.abs(Math.sin(o.yaw - c.yaw)) * 1.4;
      if (Math.abs(l) > 1.0 + half) continue;
      const g = f - hl - (o.ped ? 0.6 : 2.5); if (g < gap) { gap = g; lv = o.ped ? 0 : (o.mode === 'ai' ? o.v * Math.cos(o.yaw - c.yaw) : (o.vx * fx + o.vz * fz)); who = o; }
    }
    return { gap, lv, who };
  }
  function driveAI(c, dt, others) {
    const S = c.sg, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    let v0 = c.v0, gap = 80, lv = 0, who = null;
    const sn = sense(c, others, fx, fz); gap = sn.gap; lv = sn.lv; who = sn.who;
    if (c.turn) v0 = c.turn.sharp ? 6.5 : 10;
    else {
      const n = S.end, stop = S.s1 - (S.zebra ? 3.6 : 0) - 1.4 - c.zF, d = stop - c.s;
      if (!c.next && S.s1 - c.s < 45) c.next = chooseNext(c);
      if (c.next && d < 28) { const cs = S.hx * c.next.e.ux * c.next.d + S.hz * c.next.e.uz * c.next.d; if (cs < 0.6) v0 = Math.min(v0, 6.5 + Math.max(0, d) * 0.3); }
      let hold = false;
      if (n.signal) { const st = world.signal(n, map.axisAt(n, c.e)); if (st === 2 || (st === 1 && d > c.v * 0.9)) hold = true; }
      else if ((n.arms || []).length >= 3) { v0 = Math.min(v0, 7 + Math.max(0, d) * 0.35); if (n.lock && n.lock !== c.id && time - n.lockT < 6) hold = true; }
      if (hold && d > -2.5 && d < gap) { gap = Math.max(0, d); lv = 0; who = null; }
    }
    // IDM car-following
    const aMax = 2.4, b = 3.6, s0 = 2.2, T = 1.05, dv = c.v - lv;
    const ss = s0 + Math.max(0, c.v * T + c.v * dv / (2 * Math.sqrt(aMax * b)));
    let a = aMax * (1 - Math.pow(c.v / Math.max(1, v0), 4) - (gap < 79 ? (ss / Math.max(0.3, gap)) ** 2 : 0));
    a = clamp(a, -9, aMax); c.v = Math.max(0, c.v + a * dt); c.braking = a < -0.8;
    if (gap < 0.6) c.v = Math.min(c.v, 0.2);
    // blocked by something that is not moving traffic: honk, then go round it if a lane is free
    if (c.v < 0.4 && who && (who.mode !== 'ai' || who.isPlayer)) { c.blockT += dt; if (c.blockT > 2.2 && time - c.honk > 3.5 + c.k0 * 4) { c.honk = time; G.audio && G.audio.honkAt(c.x, c.z, 0.35 + c.k0 * 0.3); } }
    else c.blockT = Math.max(0, c.blockT - dt * 2);
    if (!c.turn) {
      const slow = who && gap < 14 && lv < c.v0 * 0.55; c.slowT = slow ? c.slowT + dt : 0;
      if ((c.slowT > 1.6 || c.blockT > 4) && Math.abs(c.lat - c.latT) < 0.2) {
        const nl = c.lane + 1 < c.e.lanes && (c.lane === 0 || Math.random() < 0.5) ? c.lane + 1 : c.lane - 1, cand = c.e.lanes > 1 ? laneLat(c.e, nl) : (c.blockT > 4 && !c.e.tram ? (c.latT > 0 && c.away ? laneLat(c.e, 0) : -0.4) : null);
        if (cand != null && cand !== c.latT) { // is that lane free around us?
          const tx = S.o.x + S.hx * c.s + S.rx * cand, tz = S.o.z + S.hz * c.s + S.rz * cand; let free = true;
          for (const o of others) { if (o === c) continue; const f = (o.x - tx) * S.hx + (o.z - tz) * S.hz, l = (o.x - tx) * S.rx + (o.z - tz) * S.rz; if (Math.abs(l) < 2 && f > -9 && f < 16) { free = false; break; } }
          if (free) { c.latT = cand; if (c.e.lanes > 1) c.lane = nl; else c.away = time; c.slowT = 0; c.blockT = 0; }
        }
      }
      if (c.away && c.e.lanes === 1 && time - c.away > 5) { c.latT = laneLat(c.e, 0); c.away = 0; }
      c.lat += clamp(c.latT - c.lat, -1.6 * dt * clamp(c.v / 3, 0.25, 1), 1.6 * dt * clamp(c.v / 3, 0.25, 1));
      c.s += c.v * dt;
      if (c.s >= S.s1) { place(c); if (!startTurn(c)) return; }
    } else {
      c.turn.t += c.v * dt / c.turn.len;
      if (c.turn.t >= 1) { const T2 = c.turn; if (c.lockNode) { if (c.lockNode.lock === c.id) c.lockNode.lock = 0; c.lockNode = null; } enter(c, T2.e2, T2.d2, T2.lane2); }
    }
    place(c); c.vx = Math.sin(c.yaw) * c.v; c.vz = Math.cos(c.yaw) * c.v;
  }
  // a rail car or a parked car that has been hit becomes a free body
  function loosen(c) { if (c.mode === 'ai' || c.mode === 'parked') { if (c.mode === 'ai') { c.vx = Math.sin(c.yaw) * c.v; c.vz = Math.cos(c.yaw) * c.v; } else { c.vx = c.vz = 0; if (c.spot) c.spot.gone = true; } c.w = 0; c.was = c.mode; c.mode = 'dyn'; c.rest = 0; if (c.lockNode && c.lockNode.lock === c.id) c.lockNode.lock = 0; } }
  const IDLE = { gas: 0, brake: 0.55, steer: 0, hb: false };
  function driveDyn(c, dt) {
    IDLE.brake = c.driver && !c.wreck ? 0.7 : 0.25; IDLE.hb = !c.driver; stepBody(c, IDLE, dt);
    collideStatic(c, world, null, true);
    const sp = Math.hypot(c.vx, c.vz);
    if (sp < 0.25 && Math.abs(c.w) < 0.2) { c.rest += dt; c.vx = c.vz = 0; c.w = 0; } else c.rest = 0;
    if (c.rest > 1.2) {
      if (c.was === 'parked' || !c.driver) { c.mode = 'parked'; return; }
      if (c.dmg >= 55 || c.wreck) { c.mode = 'wreck'; c.wreck = true; c.wreckT = time; if (c.driver) { c.driver = false; G.peds && G.peds.bail(c); } return; }
      // light knock: back into the traffic if a lane is at hand, otherwise the driver gives up
      const ne = map.nearestEdge(c.x, c.z, 12); if (ne && !ne.e.drive && !(ne.e.ow && Math.cos(c.yaw - Math.atan2(ne.e.ux, ne.e.uz)) < 0)) { const dir = Math.cos(c.yaw - Math.atan2(ne.e.ux, ne.e.uz)) >= 0 ? 1 : -1, S = seg(ne.e, dir), s = dir > 0 ? ne.t : ne.e.len - ne.t; if (s > S.s0 + 2 && s < S.s1 - 6) { c.mode = 'ai'; enter(c, ne.e, dir, 0, s); c.lat = (c.x - (S.o.x + S.hx * s)) * S.rx + (c.z - (S.o.z + S.hz * s)) * S.rz; c.v = 0; return; } }
      c.mode = 'wreck'; c.wreck = true; c.wreckT = time; c.driver = false; G.peds && G.peds.bail(c);
    }
  }
  // ---- police and ambulance: the same vehicle model as the player, driven by a pursuit controller
  const units = [];
  // a road position 150–260 m from the player, ahead of where he is going when he is moving, not in plain view up close
  function unitSpot(px, pz, hx = 0, hz = 0) {
    const moving = Math.hypot(hx, hz) > 6, base = Math.atan2(hz, hx);
    for (let tries = 0; tries < 24; tries++) {
      const a = moving && tries < 16 ? base + (Math.random() - 0.5) * 2.2 : Math.random() * 6.283, d = 150 + Math.random() * 110, ne = map.nearestEdge(px + Math.cos(a) * d, pz + Math.sin(a) * d, 80);
      if (!ne || ne.e.drive) continue;
      const x = ne.px, z = ne.pz; if (Math.hypot(x - px, z - pz) < 120 || world.inSolid(x, z, 2)) continue;
      const dt2 = (px - x) * ne.e.ux + (pz - z) * ne.e.uz; return { x, z, yaw: Math.atan2(ne.e.ux, ne.e.uz) + (dt2 < 0 ? Math.PI : 0) };
    }
    return null;
  }
  function spawnUnit(kind, px, pz, target = null, hx = 0, hz = 0) {
    const s = unitSpot(px, pz, hx, hz); if (!s) return null;
    const c = make(kind === 'amb' ? 'suv' : 'sedan', kind === 'amb' ? '#e9e9e4' : '#f2f3f5', s.x, s.z, s.yaw, kind);
    c.C = { ...CLASS[kind === 'amb' ? 'suv' : 'gt'], top: kind === 'amb' ? 150 : 262, a0: kind === 'amb' ? 5.5 : 9.6 }; c.mass = 4200; c.unit = { kind, path: null, pathT: -9, stuck: 0, rev: 0, target, arrive: 0, seen: 0, far: 0, idx: units.length }; c.driver = true;
    units.push(c); return c;
  }
  const inp = { gas: 0, brake: 0, steer: 0, hb: false };
  function los(ax, az, bx, bz) { const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 9); for (let k = 1; k < n; k++) { const t = k / n; if (world.inSolid(ax + (bx - ax) * t, az + (bz - az) * t, 0)) return false; } return true; }
  function driveUnit(c, dt, P) {
    const U = c.unit, tgt = U.target || P; const dx = tgt.x - c.x, dz = tgt.z - c.z, d = Math.hypot(dx, dz), sp = Math.hypot(c.vx, c.vz);
    let tx = tgt.x, tz = tgt.z, vT = 0;
    if (U.kind === 'police' && d > 250) { U.far += dt; if (U.far > 4) { const s = unitSpot(P.x, P.z, P.vx || 0, P.vz || 0); if (s) { c.x = s.x; c.z = s.z; c.yaw = s.yaw; c.vx = Math.sin(s.yaw) * 14; c.vz = Math.cos(s.yaw) * 14; c.w = 0; c.dmg = Math.min(c.dmg, 60); U.path = null; U.pathT = -9; U.far = 0; return; } } } else U.far = 0;
    if (time - U.losT > 0.3 || U.losT == null) { U.losT = time; U.los = d < 150 && los(c.x, c.z, tgt.x, tgt.z); }
    if (U.kind === 'police' && U.los && d < 180) U.seen = time;
    let direct = U.los && d < 150;
    if (!direct) {
      if (time - U.pathT > 1.5) { U.pathT = time; const a = map.nearestNode(c.x, c.z), b = map.nearestNode(tgt.x, tgt.z); U.path = a && b ? map.route(a.id, b.id) : null; }
      const p = U.path;
      if (!p || p.length < 2 || d < 45) direct = true;   // same junction as the target (or no route): just go for it
      else {   // follow the street: aim at a point ahead on the leg p[0] → p[1], keeping right
        let a = map.nodes[p[0]], b = map.nodes[p[1]], sx = b.x - a.x, sz = b.z - a.z, L = Math.hypot(sx, sz) || 1, tp = ((c.x - a.x) * sx + (c.z - a.z) * sz) / L;
        if (tp > L - 14 && p.length > 2) { p.shift(); a = b; b = map.nodes[p[1]]; sx = b.x - a.x; sz = b.z - a.z; L = Math.hypot(sx, sz) || 1; tp = ((c.x - a.x) * sx + (c.z - a.z) * sz) / L; }
        const lk = clamp(tp + 14 + sp * 0.55, 0, L), lat = lk < L - 1 ? 2.6 : 0; tx = a.x + sx / L * lk - sz / L * lat; tz = a.z + sz / L * lk + sx / L * lat; vT = U.kind === 'amb' ? 26 : 52;
        if (L - tp < 30 && p.length > 2) { const n2 = map.nodes[p[2]], cs = (sx * (n2.x - b.x) + sz * (n2.z - b.z)) / (L * (Math.hypot(n2.x - b.x, n2.z - b.z) || 1)); if (cs < 0.7) vT = Math.min(vT, 13 + Math.max(0, L - tp) * 0.5); }   // slow for the corner
      }
    }
    if (direct) {
      const lead = U.target ? 0 : Math.min(1.4, d / 30) * (U.idx % 2 && G.wanted >= 3 ? 1.7 : 1); tx += (P.vx || 0) * lead; tz += (P.vz || 0) * lead;
      const ps = U.target ? 0 : Math.hypot(P.vx || 0, P.vz || 0);
      vT = d < 8 ? (ps < 3 ? 0 : ps + 2) : d < 28 ? Math.max(ps + 7, 9) : 60;
      if (U.target) vT = d < 12 ? 0 : Math.min(22, d * 0.6);
    }
    let err = wrap(Math.atan2(tx - c.x, tz - c.z) - c.yaw);
    // feel for walls ahead and steer round them
    const look = 7 + sp * 0.55, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    if (world.inSolid(c.x + fx * look, c.z + fz * look, 1.2)) { const l = world.inSolid(c.x + Math.sin(c.yaw + 0.6) * look, c.z + Math.cos(c.yaw + 0.6) * look, 1.2), r = world.inSolid(c.x + Math.sin(c.yaw - 0.6) * look, c.z + Math.cos(c.yaw - 0.6) * look, 1.2); err = !l ? 0.7 : !r ? -0.7 : err > 0 ? 1.2 : -1.2; vT = Math.min(vT, 9); }
    vT = Math.min(vT, 9 + 52 * (1 - Math.min(1, Math.abs(err) / 0.85)));
    const vf = c.vx * fx + c.vz * fz;
    if (U.rev > 0) { U.rev -= dt; inp.gas = 0; inp.brake = 1; inp.steer = clamp(-err * 2, -1, 1); inp.hb = false; }
    else { inp.steer = clamp(err * 2.4, -1, 1); inp.gas = vf < vT ? 1 : 0; inp.brake = vf > vT + 2.5 ? 1 : 0; inp.hb = vT === 0 && sp < 2;
      if (vT > 3 && sp < 1.2) { U.stuck += dt; if (U.stuck > 1.6) { U.stuck = 0; U.rev = 1.3; } } else U.stuck = Math.max(0, U.stuck - dt); }
    if (vf < -0.3 && U.rev <= 0) { inp.brake = 0; inp.gas = 1; }
    stepBody(c, inp, dt);
    collideStatic(c, world, (k, s) => { if (s > 9) c.dmg = Math.min(100, c.dmg + s * 0.6); }, true, true);
    if (U.target && d < 14 && sp < 1) U.arrive += dt;
    if (c.dmg >= 100) { c.mode = 'wreck'; c.wreck = true; c.wreckT = time; c.driver = false; }
  }
  // ---- collisions between cars: `actives` are free bodies (player, police, loose cars), the rest are on rails / parked
  function carHits(P, onPlayerHit) {
    const act = []; if (P && !P.onFoot) act.push(P);
    for (const c of cars) if (c.mode === 'dyn' || c.mode === 'police' || c.mode === 'amb') act.push(c);
    for (let i = 0; i < act.length; i++) {
      const A = act[i], boxA = bodyBox(A);
      for (const B of cars) {
        if (B === A || B.mode === 'gone' || Math.abs(B.x - A.x) > 7 || Math.abs(B.z - A.z) > 7) continue;
        const free = B.mode === 'dyn' || B.mode === 'police' || B.mode === 'amb';
        if (free && act.indexOf(B) < i) continue;   // each free pair once
        const m = obbMTV(boxA, bodyBox(B)); if (!m) continue;
        const cl = -((A.vx - (B.mode === 'ai' ? Math.sin(B.yaw) * B.v : B.vx || 0)) * m.nx + (A.vz - (B.mode === 'ai' ? Math.cos(B.yaw) * B.v : B.vz || 0)) * m.nz);
        if (!free) { if (cl > 1.2 || B.mode === 'ai') loosen(B); else if (B.mode === 'wreck') { B.mode = 'dyn'; B.was = 'parked'; B.vx = B.vz = B.w = 0; B.rest = 0; } }
        B.fixed = B.mode === 'parked';
        const sp = collide(A, B, m); B.fixed = false; Object.assign(boxA, bodyBox(A));
        if (sp > 2) { B.dmg = Math.min(100, B.dmg + sp * (A.isPlayer ? 3.2 : 2.2)); if (B.dmg >= 55 && B.mode === 'dyn' && !B.unit) B.wreck = true; if (!A.isPlayer) A.dmg = Math.min(100, A.dmg + sp * 2.2); }
        if (A.isPlayer && onPlayerHit) onPlayerHit(B, sp, m);
      }
    }
  }
  // ---- per frame
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _one = new THREE.Vector3(1, 1, 1);
  function update(dt, P, pedList, parked = null) {
    time += dt;
    const px = P.x, pz = P.z;
    if ((tSpawn -= dt) <= 0) {
      tSpawn = 0.35; syncParked(px, pz);
      const nAI = cars.reduce((a, c) => a + (c.mode === 'ai' ? 1 : 0), 0);
      if (nAI < density()) spawnAI(px, pz, nAI < density() * 0.35 && time < 4);
      for (const c of [...cars]) { const d = Math.hypot(c.x - px, c.z - pz);
        if ((c.mode === 'ai' && d > 400) || ((c.mode === 'wreck' || c.mode === 'dyn') && d > 330) || (c.mode === 'wreck' && time - c.wreckT > 150 && d > 120)) remove(c); }
    }
    const others = sensed; others.length = 0;
    for (const c of cars) if (Math.abs(c.x - px) < 420 && Math.abs(c.z - pz) < 420) others.push(c);
    if (!P.onFoot) others.push(P); else if (parked) others.push(parked);
    if (pedList) for (const p of pedList) if (p.onRoad) others.push(p);
    for (const c of cars) {
      if (c.mode === 'ai') driveAI(c, dt, others);
      else if (c.mode === 'dyn') driveDyn(c, dt);
      else if (c.mode === 'police' || c.mode === 'amb') driveUnit(c, dt, P);
    }
    for (let i = units.length - 1; i >= 0; i--) if (units[i].mode === 'gone' || units[i].mode === 'wreck' || units[i].mode === 'dyn') units.splice(i, 1);
  }
  const sensed = [];
  function draw(camera) {
    const n = {}; for (const k of CAR_KINDS) n[k] = 0; let ns = 0, nb = 0, ng = 0;
    const cx = camera.position.x, cz = camera.position.z, night = world.night > 0.3, gp = gGeo.attributes.position, gc = gGeo.attributes.color, blink = Math.floor(time * 6) % 2;
    // moving cars and emergency vehicles first, so a street full of parked cars can never use up their instances
    for (let pass = 0; pass < 2; pass++) for (const c of cars) {
      if ((c.mode === 'parked') !== (pass === 1)) continue;
      const d = Math.hypot(c.x - cx, c.z - cz); if (d > (c.mode === 'parked' ? 175 : DRAW_R) || n[c.kind] >= CAP) continue;
      _q.setFromEuler(_e.set(-(c.pitch || 0), c.yaw, (c.roll || 0) + (c.wreck ? 0.03 : 0), 'YXZ'));
      const sq = c.dmg > 30 ? 1 - Math.min(0.16, (c.dmg - 30) / 400) : 1;
      _m.compose(_v.set(c.x, 0, c.z), _q, sq === 1 ? _one : _s.set(1, 1 - (1 - sq) * 0.4, sq)); const I = inst[c.kind]; I.setMatrixAt(n[c.kind], _m);
      _c.copy(c.col); if (c.dmg > 12) _c.multiplyScalar(1 - Math.min(0.5, c.dmg / 180)); I.setColorAt(n[c.kind]++, _c);
      if (d < 120 && ns < shadows.instanceMatrix.count) { const S = c.S; _q.setFromEuler(_e.set(0, c.yaw, 0)); _m.compose(_v.set(c.x + Math.sin(c.yaw) * (S.zF + S.zR) / 2, 0.03, c.z + Math.cos(c.yaw) * (S.zF + S.zR) / 2), _q, _s.set(S.W * 1.7, 1, S.L * 1.25)); shadows.setMatrixAt(ns++, _m); }
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      if (c.unit && nb < 16) { _q.setFromEuler(_e.set(0, c.yaw, 0)); _m.compose(_v.set(c.x - sy * 0.25, c.S.roof + 0.07, c.z - cy * 0.25), _q, _one); bars.setMatrixAt(nb, _m);
        const on = c.unit.kind === 'amb' || G.wanted > 0; bars.setColorAt(nb++, on ? (blink ? _c.setRGB(0.1, 0.25, 2.2) : c.unit.kind === 'amb' ? _c.setRGB(2.2, 0.15, 0.1) : _c.setRGB(2.0, 0.1, 0.12)) : _c.setRGB(0.12, 0.16, 0.4));
        if (on && ng < NG - 2) { gp.setXYZ(ng, c.x - sy * 0.25 + cy * 0.4 * (blink ? 1 : -1), c.S.roof + 0.25, c.z - cy * 0.25 - sy * 0.4 * (blink ? 1 : -1)); gc.setXYZ(ng++, blink ? 0.2 : 2.5, 0.25, blink ? 3 : 0.2); gp.setXYZ(ng, c.x, c.S.roof + 0.4, c.z); gc.setXYZ(ng++, blink ? 0.1 : 0.9, 0.12, blink ? 1.1 : 0.1); } }
      if ((night || c.braking) && d < 230 && ng < NG - 4 && (c.mode === 'ai' || c.unit)) {
        const S = c.S, hx = S.W / 2 - 0.28;
        for (const sd of [-1, 1]) { if (night) { gp.setXYZ(ng, c.x + sy * (S.zF - 0.1) + cy * sd * hx, S.yE + 0.05, c.z + cy * (S.zF - 0.1) - sy * sd * hx); gc.setXYZ(ng++, 1.3, 1.25, 1.1); }
          const k = c.braking ? 1.6 : 0.55; gp.setXYZ(ng, c.x + sy * (S.zR + 0.05) + cy * sd * hx, S.yE + 0.12, c.z + cy * (S.zR + 0.05) - sy * sd * hx); gc.setXYZ(ng++, k, 0.04, 0.03); }
      }
    }
    for (const k of CAR_KINDS) { const I = inst[k]; I.count = n[k]; I.instanceMatrix.needsUpdate = true; if (I.instanceColor) I.instanceColor.needsUpdate = true; }
    shadows.count = ns; shadows.instanceMatrix.needsUpdate = true; bars.count = nb; bars.instanceMatrix.needsUpdate = true; if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    gGeo.setDrawRange(0, ng); gp.needsUpdate = true; gc.needsUpdate = true;
  }
  // nearest car to a point (for "take this car"): {car, d}
  function nearest(x, z, maxD = 3.2, skip = null) {
    let best = null;
    for (const c of cars) { if (c === skip || c.mode === 'gone' || c.unit) continue; const B = bodyBox(c), dx = x - B.x, dz = z - B.z, qx = Math.max(Math.abs(dx * B.ux + dz * B.uz) - B.hw, 0), qz = Math.max(Math.abs(-dx * B.uz + dz * B.ux) - B.hd, 0), d = Math.hypot(qx, qz); if (d < maxD && (!best || d < best.d)) best = { car: c, d }; }
    return best;
  }
  return {
    group, cars, units, update, draw, carHits, nearest, remove, loosen, spawnUnit, stats,
    addParked(kind, colour, x, z, yaw, dmg = 0) { const c = make(kind, colour, x, z, yaw, 'parked'); c.dmg = dmg; c.driver = false; c.wreck = dmg >= 55; if (c.wreck) { c.mode = 'wreck'; c.wreckT = time; } return c; },
    clearUnits(kind) { for (const c of [...units]) if (!kind || c.unit.kind === kind) remove(c); for (let i = units.length - 1; i >= 0; i--) if (units[i].mode === 'gone') units.splice(i, 1); },
    count(mode) { return cars.reduce((a, c) => a + (c.mode === mode ? 1 : 0), 0); },
    get time() { return time; },
    dispose() { for (const m of Object.values(inst)) { m.geometry.dispose(); m.dispose(); } mat.dispose(); shadows.geometry.dispose(); shadows.material.dispose(); shTex.dispose(); bars.geometry.dispose(); bars.material.dispose(); gGeo.dispose(); glows.material.dispose(); gTex.dispose(); scene.remove(group); },
  };
}
