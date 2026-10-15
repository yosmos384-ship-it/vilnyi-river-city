// navgraph.js — navigation graph for walk + 360 navigation (room hubs, both sides of every doorway / cased opening,
// stair bottom/top, porch / front walk / street, back stoop / back yard) + A* path finding.
// Owner: NAV. Pure data module: NO three.js import, no side effects on import. Points are plain {x, y, z} where
// y = FEET height (floor level), not eye height.
//
//   const g = buildNavGraph(plan, { world, house, panos });   // world = core collision world (optional)
//   g.findPath(aId|node, bId|node) → { ids, nodes, pts:[{x,y,z}], doorAt:{ptIndex: doorId}, length } | null
//   findPath(a, b) (module export) uses the last graph built.
//
// Validation: every node is checked against the collision world (static AABBs at body height, like the player
// capsule) and pushed to the nearest clear standing spot (and snapped to the walkable surface). Without a world the
// plan geometry (walls minus openings) is used as a fallback so the module also works in plain node tests.

const BODY_LO = 0.35, BODY_HI = 1.75; // same vertical band the player controller collides with (feet + …)
const SPOT_R = 0.32;                  // clearance radius for standing spots (player R = 0.25)
const EDGE_R = 0.17;                  // corridor half-width for edge line-of-sight (player slides along walls)

const OUT_HE = {
  porch: 'מרפסת כניסה', frontwalk: 'שביל הכניסה', frontyard: 'חצר קדמית', street: 'רחוב', stoop: 'כניסה אחורית',
  backyard: 'חצר אחורית', driveway: 'חניה', eastside: 'חצר צדדית', stairdn: 'מדרגות למרתף',
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

// segment (2D) vs axis-aligned rect, Liang–Barsky
function segRect(ax, az, bx, bz, x0, z0, x1, z1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz], q = [ax - x0, x1 - ax, az - z0, z1 - az];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}
// 2D segment-segment intersection test
function segSeg(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / den, u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
  return t > 0.02 && t < 0.98 && u >= -0.02 && u <= 1.02;
}

// ------------------------------------------------------------------ plan-geometry fallback colliders
function planBoxes(plan) {
  const out = [];
  const B = (x0, y0, z0, x1, y1, z1) => out.push({ min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) } });
  const W = plan.W, D = plan.D, ET = plan.extWall || 0.25, IT = plan.intWall || 0.12;
  const LV = { basement: [plan.basementFloor, plan.basementCeil], main: [plan.mainFloor, plan.mainCeil], upper: [plan.upperFloor, plan.upperFloor + 2.4] };
  const ops = (wall, floor) => (plan.doors || []).concat((plan.openings || []).filter((o) => o.w > 0)).filter((o) => o.wall === wall && o.floor === floor).map((o) => [o.along - o.w / 2, o.along + o.w / 2]);
  const runs = (a0, a1, cuts) => {
    const r = []; let s = a0;
    for (const [c0, c1] of cuts.slice().sort((p, q) => p[0] - q[0])) { if (c0 > s) r.push([s, Math.min(c0, a1)]); s = Math.max(s, c1); }
    if (s < a1) r.push([s, a1]); return r.filter(([p, q]) => q - p > 0.01);
  };
  const wall = (axis, c, a0, a1, t, y0, y1, cuts) => {
    for (const [s, e] of runs(a0, a1, cuts)) { if (axis === 'x') B(s, y0, c - t / 2, e, y1, c + t / 2); else B(c - t / 2, y0, s, c + t / 2, y1, e); }
  };
  for (const fl of ['basement', 'main', 'upper']) {
    const [y0, y1] = LV[fl];
    wall('x', D, -ET / 2, W + ET / 2, ET, y0, y1, ops('ext_S', fl));
    wall('x', 0, -ET / 2, W + ET / 2, ET, y0, y1, ops('ext_N', fl));
    wall('z', W, 0, D, ET, y0, y1, ops('ext_E', fl));
    wall('z', 0, 0, D, ET, y0, y1, ops('ext_W', fl));
    for (const w of (plan.walls && plan.walls[fl]) || []) {
      const axis = Math.abs(w.a[0] - w.b[0]) < 1e-6 ? 'z' : 'x';
      const c = axis === 'x' ? w.a[1] : w.a[0];
      const a0 = axis === 'x' ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
      const a1 = axis === 'x' ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
      wall(axis, c, a0, a1, IT, y0, y1, ops(w.id, fl));
    }
  }
  const S = plan.stairs || {}, up = S.up, dn = S.down;
  if (up && dn) {
    // basement head wall + stair west wall (main level) + upper knee walls
    wall('x', dn.zTop, up.x0, up.x1, IT, plan.mainFloor, plan.mainCeil, ops('basement_head', 'main'));
    B(up.x0 - IT / 2, plan.mainFloor, dn.zTop, up.x0 + IT / 2, plan.mainCeil, up.zBottom - 0.52);
    B(up.x1 - IT / 2, plan.mainFloor, dn.zTop, up.x1 + IT / 2, plan.mainCeil, D);
    // up-stair mass as seen from the main floor (blocks LOS across it)
    B(up.x0 + 0.05, plan.mainFloor + 0.5, dn.zTop + 0.05, up.x1 - 0.05, plan.mainFloor + 2.0, up.zBottom - 0.6);
  }
  if (plan.kneeZ) for (const kz of plan.kneeZ) B(0, plan.upperFloor, kz - IT / 2, W, plan.upperFloor + (plan.kneeH || 1.2) + 0.3, kz + IT / 2);
  return out;
}

// ------------------------------------------------------------------ build
let _last = null;

export function buildNavGraph(plan, ctx = {}) {
  const P = plan || {};
  const world = ctx.world && typeof ctx.world.query === 'function' ? ctx.world : null;
  const warnings = [];
  const FL = { main: P.mainFloor != null ? P.mainFloor : 0.6, upper: P.upperFloor != null ? P.upperFloor : 3.29, basement: P.basementFloor != null ? P.basementFloor : -1.7 };
  const W = P.W || 9.144, D = P.D || 7.315, IT = P.intWall || 0.12;

  /* ---------- collision access */
  const fb = world ? null : planBoxes(P);
  const qOut = [];
  function near(x, z, r, dyn) {
    if (world) { try { return world.query(x, z, r, qOut, !!dyn); } catch (_) { return []; } }
    return fb.filter((b) => b.max.x > x - r && b.min.x < x + r && b.max.z > z - r && b.min.z < z + r);
  }
  function ground(x, z, feet) {
    if (!world || !world.hasWalkables || typeof world.groundAt !== 'function') return { ok: true, y: feet };
    try {
      const g = world.groundAt(x, z, feet + 0.55, feet + 0.45);
      if (g.best === null || g.best === undefined) return { ok: false, y: feet };
      return { ok: Math.abs(g.best - feet) < 0.45, y: g.best };
    } catch (_) { return { ok: true, y: feet }; }
  }
  const tall = (b) => b.max.y - b.min.y > 40;
  function blockedAt(x, feet, z, r = SPOT_R, dyn = false) {
    const lo = feet + BODY_LO, hi = feet + BODY_HI;
    for (const b of near(x, z, r + 0.05, dyn)) {
      if (!(b.max.y > lo && b.min.y < hi) || tall(b)) continue;
      const cx = clamp(x, b.min.x, b.max.x), cz = clamp(z, b.min.z, b.max.z);
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return true;
    }
    return false;
  }
  // corridor line of sight at body height between two standing points (a.y / b.y = feet)
  function clearSeg(a, b, r = EDGE_R, dyn = false) {
    const L = hyp(a.x, a.z, b.x, b.z);
    if (L < 1e-4) return true;
    const lo = Math.min(a.y, b.y) + BODY_LO + 0.05, hi = Math.max(a.y, b.y) + BODY_HI;
    const list = near((a.x + b.x) / 2, (a.z + b.z) / 2, L / 2 + r + 0.1, dyn);
    for (const bx of list) {
      if (!(bx.max.y > lo && bx.min.y < hi) || tall(bx)) continue;
      const inA = a.x > bx.min.x - r && a.x < bx.max.x + r && a.z > bx.min.z - r && a.z < bx.max.z + r;
      const inB = b.x > bx.min.x - r && b.x < bx.max.x + r && b.z > bx.min.z - r && b.z < bx.max.z + r;
      const e = inA || inB ? 0.02 : r; // endpoint hugging a wall: test the bare box so we don't see through it
      if (segRect(a.x, a.z, b.x, b.z, bx.min.x - e, bx.min.z - e, bx.max.x + e, bx.max.z + e)) return false;
    }
    return true;
  }
  // walkable surface continuity along a segment: no rise/drop > maxStep between 0.2 m samples (stoop sides, stair
  // holes, porch edges). Only with a real world (walkable meshes); otherwise assumed fine.
  function stepOK(a, b, maxStep = 0.4) {
    if (!world || !world.hasWalkables || typeof world.groundAt !== 'function') return true;
    if (!needStep(a, b)) return true;
    const L = hyp(a.x, a.z, b.x, b.z), n = Math.max(1, Math.ceil(L / 0.2));
    let prev = a.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      let g; try { g = world.groundAt(x, z, prev + maxStep + 0.15, prev + maxStep); } catch (_) { return true; }
      if (g.top !== null && g.top > prev + maxStep) return false; // wall-like rise
      if (g.best === null || prev - g.best > maxStep + 0.05) return false; // hole / drop-off
      prev = g.best;
    }
    return Math.abs(prev - b.y) < maxStep + 0.05;
  }
  // indoor floors are flat except at the stair openings: only test those (and everything outdoors)
  function needStep(a, b) {
    const fa = floorOf(a.x, a.y, a.z), fb = floorOf(b.x, b.y, b.z);
    if (fa !== fb && fa !== 'outside' && fb !== 'outside') return true;
    if (fa === 'outside' || fb === 'outside') {
      // lawn ↔ lawn is gentle: only check near the house (porch, stoop, window wells) or from raised spots
      if (Math.max(Math.abs(a.y), Math.abs(b.y)) > 0.25) return true;
      return segRect(a.x, a.z, b.x, b.z, -1.2, -1.2, W + 1.2, D + 1.2);
    }
    const S = P.stairs || {}, up = S.up, dn = S.down;
    if (!up) return true;
    const holes = fa === 'upper' ? [[up.x0, up.zTop, up.x1, D]] : fa === 'main' && dn ? [[up.x0, dn.zTop, up.x1, dn.zBottom != null ? dn.zBottom : D]] : [];
    return holes.some((h) => segRect(a.x, a.z, b.x, b.z, h[0] - 0.1, h[1] - 0.1, h[2] + 0.1, h[3] + 0.1));
  }
  // free distance from p along direction (dx,dz) up to maxD (for arrow placement)
  function freeAlong(p, dx, dz, maxD = 3.5, r = 0.1, dyn = true) {
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let lo = 0, hi = maxD;
    if (clearSeg(p, { x: p.x + dx * maxD, y: p.y, z: p.z + dz * maxD }, r, dyn)) return maxD;
    for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (clearSeg(p, { x: p.x + dx * m, y: p.y, z: p.z + dz * m }, r, dyn)) lo = m; else hi = m; }
    return lo;
  }

  /* ---------- rooms */
  const ROOMS = [];
  for (const fl of ['main', 'upper', 'basement']) {
    for (const [k, rm] of Object.entries((P.rooms && P.rooms[fl]) || {})) {
      const [x0, z0, x1, z1] = rm.r;
      ROOMS.push({ key: k, he: rm.he, floor: fl, r: [x0, z0, x1, z1], area: (x1 - x0) * (z1 - z0) });
    }
  }
  ROOMS.sort((a, b) => a.area - b.area);
  const heOf = {}; for (const r of ROOMS) heOf[r.key] = r.he; Object.assign(heOf, Object.fromEntries(Object.entries(OUT_HE).filter(([k]) => !heOf[k])));
  const inFoot = (x, z, m = 0.05) => x >= -m && x <= W + m && z >= -m && z <= D + m;
  function floorOf(x, feet, z) {
    const foot = inFoot(x, z);
    if (feet < FL.main - 0.45 && (foot || feet < -0.8)) return 'basement';
    if (!foot) return 'outside';
    if (feet > FL.upper - 0.4) return 'upper';
    return 'main';
  }
  function roomRect(x, feet, z) {
    const fl = floorOf(x, feet, z);
    if (fl === 'outside') return null;
    for (const r of ROOMS) if (r.floor === fl && x >= r.r[0] - 1e-3 && x <= r.r[2] + 1e-3 && z >= r.r[1] - 1e-3 && z <= r.r[3] + 1e-3) return r;
    return null;
  }

  /* ---------- nodes */
  const nodes = [], byId = new Map();
  function addNode(o) {
    if (byId.has(o.id)) return byId.get(o.id);
    const fl = o.floor || floorOf(o.x, o.y, o.z);
    const rr = o.room ? null : roomRect(o.x, o.y, o.z);
    const n = Object.assign({ kind: 'room', hub: false, transit: false, links: [] }, o, { floor: fl, room: o.room || (rr ? rr.key : 'outside'), idx: nodes.length });
    if (!n.he) n.he = heOf[n.room] || n.room;
    n.ox = n.x; n.oz = n.z; // original (pre-validation) position
    nodes.push(n); byId.set(n.id, n);
    return n;
  }

  // 360 nodes (curated standing spots) become room hubs
  const panos = Array.isArray(ctx.panos) ? ctx.panos : (P.panos || []).map((p) => ({ id: p.id, he: p.he, p: { x: p.p[0], y: p.p[1], z: p.p[2] } }));
  for (const pn of panos) {
    const p = pn.p || {}; if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) continue;
    const feet = p.y - 1.6;
    const fl = pn.floor || floorOf(p.x, feet, p.z);
    const rr = fl === 'outside' ? null : roomRect(p.x, feet, p.z);
    const room = rr ? rr.key : (fl === 'outside' ? String(pn.id) : 'outside');
    if (fl === 'outside' && !heOf[room]) heOf[room] = pn.he || room;
    addNode({ id: 'pano:' + pn.id, x: p.x, y: feet, z: p.z, floor: fl, room, he: pn.he || heOf[room], kind: 'pano', pano: String(pn.id), hub: true });
  }
  const hubOfRoom = new Map();
  for (const n of nodes) if (n.hub && !hubOfRoom.has(n.room)) hubOfRoom.set(n.room, n);
  // rooms without a pano get a centre node as hub
  for (const r of ROOMS) {
    if (hubOfRoom.has(r.key)) continue;
    const n = addNode({ id: 'room:' + r.key, x: (r.r[0] + r.r[2]) / 2, y: FL[r.floor], z: (r.r[1] + r.r[3]) / 2, floor: r.floor, room: r.key, kind: 'room', hub: true });
    hubOfRoom.set(r.key, n);
  }

  /* ---------- doorways (both sides) */
  const SD = (P.stairs && P.stairs.down) || { zTop: 3.9 };
  const SU = (P.stairs && P.stairs.up) || { x0: 4.572, x1: 5.486, zBottom: 7.2, zTop: 3.9 };
  function wallGeom(id, floor) {
    if (id === 'ext_S') return { axis: 'x', c: D, ext: true };
    if (id === 'ext_N') return { axis: 'x', c: 0, ext: true };
    if (id === 'ext_E') return { axis: 'z', c: W, ext: true };
    if (id === 'ext_W') return { axis: 'z', c: 0, ext: true };
    if (id === 'basement_head') return { axis: 'x', c: SD.zTop };
    const w = ((P.walls && P.walls[floor]) || []).find((q) => q.id === id);
    if (!w) return null;
    const axis = Math.abs(w.a[0] - w.b[0]) < 1e-6 ? 'z' : 'x';
    return { axis, c: axis === 'x' ? w.a[1] : w.a[0] };
  }
  const OVR = { bed3: 3.72, bed4: 3.40 }; // house.js DOOR_OVERRIDE (plan.js already carries these values)
  const doorways = [];
  const hd = (ctx.house && ctx.house.doors) || {};
  for (const d of P.doors || []) doorways.push({ id: d.id, wall: d.wall, floor: d.floor, along: isFinite(d.along) ? d.along : OVR[d.id], w: d.w, door: true, exterior: !!d.exterior, he: d.he });
  for (const o of P.openings || []) {
    if (!(o.w > 0 && o.h > 0)) continue;
    let a0 = o.along - o.w / 2, a1 = o.along + o.w / 2;
    if (o.id === 'hall_living') { const lim = SD.zTop - IT / 2; if (a1 > lim) { a0 -= a1 - lim; a1 = lim; } } // same clip as house.js
    doorways.push({ id: o.id, wall: o.wall, floor: o.floor, along: (a0 + a1) / 2, w: a1 - a0, door: false });
  }
  const links = []; // forced edges: {a, b, pts?, door?, stair?}
  const doorSegs = []; // wall-line segments of real doors (non-link edges may not cross these)
  for (const d of doorways) {
    const g = wallGeom(d.wall, d.floor); if (!g) { warnings.push('no wall for ' + d.id); continue; }
    const fy = FL[d.floor] != null ? FL[d.floor] : FL.main;
    const cx = g.axis === 'x' ? d.along : g.c, cz = g.axis === 'x' ? g.c : d.along;
    const nx = g.axis === 'x' ? 0 : 1, nz = g.axis === 'x' ? 1 : 0;
    const off = g.ext ? 0.6 : 0.55;
    const half = d.w / 2;
    if (d.door) doorSegs.push({ id: d.id, floor: d.floor, ax: g.axis === 'x' ? cx - half : cx, az: g.axis === 'x' ? cz : cz - half, bx: g.axis === 'x' ? cx + half : cx, bz: g.axis === 'x' ? cz : cz + half });
    const side = (s) => {
      const x = cx + nx * off * s, z = cz + nz * off * s;
      let y = fy, room = null, floor = d.floor, transit = false, he;
      if (d.id === 'basement' && s > 0) { room = 'stairdn'; transit = true; y = fy - 0.33; floor = 'main'; he = OUT_HE.stairdn; }
      else if (g.ext && !inFoot(x, z, -0.01)) {
        floor = 'outside';
        if (d.id === 'front') { room = 'porch'; y = (P.porch && P.porch.slabTop) || 0.45; }
        else if (d.id === 'back') { room = 'stoop'; y = fy - 0.02; }
        else { room = 'outside'; y = 0; }
      }
      return addNode({ id: `door:${d.id}:${s > 0 ? 'p' : 'n'}`, x, y, z, floor, room: room || undefined, transit, he, kind: 'door', door: d.door ? d.id : null, opening: d.id, nx: nx * s, nz: nz * s });
    };
    const A = side(-1), Bn = side(1);
    if (d.id === 'basement') Bn.z = SD.zTop + 0.55; // just past the open leaves (they reach z ≈ 4.30)
    links.push({ a: A, b: Bn, door: d.door ? d.id : null, opening: d.id });
  }

  /* ---------- stairs */
  const sx = (SU.x0 + SU.x1) / 2 + 0.03;
  const zBot = Math.min(SU.zBottom, D - 0.16);
  const upBot = addNode({ id: 'stair:up:bottom', x: SU.x0 - 0.45, y: FL.main, z: zBot - 0.32, floor: 'main', room: 'hall', kind: 'stair', he: heOf.hall });
  const upTop = addNode({ id: 'stair:up:top', x: sx, y: FL.upper, z: SU.zTop - 0.38, floor: 'upper', room: 'landing', kind: 'stair', he: heOf.landing });
  const hallS = addNode({ id: 'hall:south', x: SU.x0 - 0.45, y: FL.main, z: (SD.zTop + zBot) / 2 + 0.1, floor: 'main', room: 'hall', kind: 'room' });
  void hallS;
  links.push({ a: upBot, b: upTop, stair: true, pts: [
    { x: upBot.x, y: FL.main, z: upBot.z }, { x: SU.x0 + 0.3, y: FL.main + 0.3, z: zBot - 0.27 }, { x: sx, y: FL.main + 0.45, z: zBot - 0.45 },
    { x: sx, y: FL.upper - 0.1, z: SU.zTop + 0.15 }, { x: upTop.x, y: FL.upper, z: upTop.z }] });
  const dnTop = byId.get('door:basement:p');
  const dnZB = SD.zBottom != null ? SD.zBottom : 7.05;
  const dnBot = addNode({ id: 'stair:down:bottom', x: sx - 0.03, y: FL.basement + 0.12, z: dnZB - 0.2, floor: 'basement', room: 'stairdn', transit: true, kind: 'stair', he: OUT_HE.stairdn });
  const dnExit = addNode({ id: 'stair:down:exit', x: SU.x0 - 0.5, y: FL.basement, z: dnZB - 0.25, floor: 'basement', room: 'basement', kind: 'stair' });
  if (dnTop) links.push({ a: dnTop, b: dnBot, stair: true, pts: [{ x: dnTop.x, y: dnTop.y, z: dnTop.z }, { x: dnBot.x, y: dnBot.y, z: dnBot.z }] });
  links.push({ a: dnBot, b: dnExit, stair: true });

  /* ---------- outdoors */
  const porch = P.porch || { x0: 5.05, x1: 7.05, z0: D, z1: 8.9, slabTop: 0.45 };
  const pcx = (porch.x0 + porch.x1) / 2;
  const st = P.street || { zCenter: 22, width: 7.2 };
  const dw = P.driveway || { x0: -4.6, x1: -1.6 };
  const backDoor = (P.doors || []).find((d) => d.id === 'back') || { along: 1.35 };
  addNode({ id: 'out:frontwalk', x: pcx, y: 0, z: porch.z1 + 0.65, floor: 'outside', room: 'frontwalk', kind: 'out', hub: true });
  addNode({ id: 'out:walk_s', x: pcx, y: 0, z: st.zCenter - st.width / 2 - 1.6, floor: 'outside', room: hubOfRoom.has('frontyard') ? 'frontyard' : 'frontwalk', kind: 'out' });
  addNode({ id: 'out:drive_front', x: (dw.x0 + dw.x1) / 2, y: 0, z: porch.z1 + 2.6, floor: 'outside', room: 'driveway', kind: 'out', hub: true });
  addNode({ id: 'out:drive_back', x: (dw.x0 + dw.x1) / 2, y: 0, z: -4.0, floor: 'outside', room: 'driveway', kind: 'out' });
  addNode({ id: 'out:eastside', x: W + 2.4, y: 0, z: D - 1.0, floor: 'outside', room: 'eastside', kind: 'out', hub: true });
  addNode({ id: 'out:stoop_low', x: W + 2.15, y: 0, z: backDoor.along, floor: 'outside', room: 'stoop', kind: 'out' });
  addNode({ id: 'out:back_ne', x: W + 1.6, y: 0, z: -3.6, floor: 'outside', room: hubOfRoom.has('backyard') ? 'backyard' : 'eastside', kind: 'out' });
  for (const [k, id] of [['frontwalk', 'out:frontwalk'], ['driveway', 'out:drive_front'], ['eastside', 'out:eastside'], ['stoop', 'door:back:p'], ['porch', 'door:front:p']]) {
    if (!hubOfRoom.has(k) && byId.get(id)) { byId.get(id).hub = true; hubOfRoom.set(k, byId.get(id)); }
  }
  if (!hubOfRoom.has('stairdn') && dnTop) hubOfRoom.set('stairdn', dnTop);

  /* ---------- validation: push nodes out of colliders, snap to the walkable surface */
  const rectOf = (n) => { if (n.floor === 'outside' || n.transit) return null; const r = ROOMS.find((q) => q.key === n.room); return r ? r.r : null; };
  function settle(n) {
    const g0 = ground(n.x, n.z, n.y);
    if (g0.ok) n.y = g0.y;
    if (!blockedAt(n.x, n.y, n.z) && g0.ok) return;
    const rect = rectOf(n);
    const okAt = (x, z) => {
      if (rect && (x < rect[0] + 0.2 || x > rect[2] - 0.2 || z < rect[1] + 0.2 || z > rect[3] - 0.2)) return null;
      const g = ground(x, z, n.y); if (!g.ok) return null;
      if (blockedAt(x, g.y, z)) return null;
      return g.y;
    };
    if (n.kind === 'door' || n.kind === 'stair') {
      // stay centred on the doorway: slide along the wall normal (away from the wall), small lateral tolerance
      const nx = n.nx || 0, nz = n.nz || 0;
      if (nx || nz) {
        for (let t = 0; t <= 0.7; t += 0.05) for (const l of [0, 0.08, -0.08, 0.16, -0.16]) {
          const x = n.ox + nx * t + nz * l, z = n.oz + nz * t + nx * l;
          const y = okAt(x, z); if (y !== null) { n.x = x; n.z = z; n.y = y; n.moved = Math.hypot(x - n.ox, z - n.oz); return; }
        }
        // door sides are allowed to hug the frame (the player capsule is smaller than the spot radius)
        n.tight = true; return;
      }
    }
    for (let rad = 0.1; rad <= 1.6; rad += 0.1) {
      const k = Math.max(8, Math.round(rad * 24));
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        const x = n.ox + Math.cos(a) * rad, z = n.oz + Math.sin(a) * rad;
        const y = okAt(x, z); if (y !== null) { n.x = x; n.z = z; n.y = y; n.moved = rad; return; }
      }
    }
    n.blocked = true; warnings.push('no clear spot near ' + n.id);
  }
  for (const n of nodes) { try { settle(n); } catch (e) { warnings.push('settle ' + n.id + ': ' + (e && e.message)); } }

  /* ---------- auxiliary grid nodes: let routes go around furniture in the larger rooms */
  const AUX = 1.2;
  for (const r of ROOMS) {
    const [x0, z0, x1, z1] = r.r, inset = 0.5;
    if (x1 - x0 < 2.2 || z1 - z0 < 2.2) continue;
    const ni = Math.max(1, Math.round((x1 - x0 - 2 * inset) / AUX)), nj = Math.max(1, Math.round((z1 - z0 - 2 * inset) / AUX));
    for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) {
      const x = x0 + inset + (x1 - x0 - 2 * inset) * i / ni, z = z0 + inset + (z1 - z0 - 2 * inset) * j / nj;
      const y0 = FL[r.floor];
      const rr = roomRect(x, y0, z); if (!rr || rr.key !== r.key) continue;
      if (nodes.some((n) => Math.abs(n.y - y0) < 0.5 && hyp(n.x, n.z, x, z) < 0.65)) continue;
      const g = ground(x, z, y0); if (!g.ok) continue;
      if (blockedAt(x, g.y, z)) continue;
      addNode({ id: `aux:${r.key}:${i}:${j}`, x, y: g.y, z, floor: r.floor, room: r.key, kind: 'aux' });
    }
  }

  /* ---------- edges */
  const edges = [];
  const adj = nodes.map(() => []);
  const edgeKey = new Set();
  function addEdge(a, b, o = {}) {
    if (!a || !b || a === b) return null;
    const k = a.idx < b.idx ? a.idx + ':' + b.idx : b.idx + ':' + a.idx;
    if (edgeKey.has(k)) return null;
    edgeKey.add(k);
    const pts = o.pts ? o.pts.map((p) => ({ x: p.x, y: p.y, z: p.z })) : [{ x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z }];
    pts[0] = { x: a.x, y: a.y, z: a.z }; pts[pts.length - 1] = { x: b.x, y: b.y, z: b.z };
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, (pts[i].y - pts[i - 1].y) * 0.5, pts[i].z - pts[i - 1].z);
    const e = { a: a.idx, b: b.idx, pts, cost: len + (o.stair ? 0.8 : 0) + (o.door ? 0.3 : 0), length: len, door: o.door || null, stair: !!o.stair, link: !!o.link };
    edges.push(e); adj[a.idx].push(e); adj[b.idx].push(e);
    if (o.link) { a.links.push(b.idx); b.links.push(a.idx); }
    return e;
  }
  for (const L of links) {
    const e = addEdge(L.a, L.b, { pts: L.pts, door: L.door, stair: L.stair, link: true });
    if (e && !L.stair && !clearSeg(L.a, L.b, 0.12, false)) warnings.push('doorway LOS blocked: ' + (L.opening || L.door));
  }
  const zone = (n) => (n.floor === 'outside' ? 'out' : n.floor);
  const lvl = (n) => (n.floor === 'outside' ? 'main' : n.floor);
  const crossesDoor = (a, b) => doorSegs.some((s) => s.floor === lvl(a) && segSeg(a.x, a.z, b.x, b.z, s.ax, s.az, s.bx, s.bz));
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (zone(a) !== zone(b)) continue;
      if (a.transit || b.transit) continue;            // transit (stair) nodes only connect through their links
      const maxD = a.kind === 'aux' || b.kind === 'aux' ? 3.0 : zone(a) === 'out' ? 16 : 8.5;
      const d = hyp(a.x, a.z, b.x, b.z);
      if (d > maxD || Math.abs(a.y - b.y) > (zone(a) === 'out' ? 0.75 : 0.3)) continue;
      if (crossesDoor(a, b)) continue;                 // real doors are crossed only via their link edge
      // never shortcut from the house interior to the outside through walls / openings
      if (clearSeg(a, b, EDGE_R, false) && stepOK(a, b) && stepOK(b, a)) addEdge(a, b);
    }
  }
  // connectivity: attach stragglers to their nearest same-zone node (forced, flagged)
  function reach(from) {
    const seen = new Uint8Array(nodes.length); const q = [from]; seen[from] = 1;
    while (q.length) { const u = q.pop(); for (const e of adj[u]) { const v = e.a === u ? e.b : e.a; if (!seen[v]) { seen[v] = 1; q.push(v); } } }
    return seen;
  }
  const root = (hubOfRoom.get('living') || nodes[0] || {}).idx || 0;
  for (let pass = 0; pass < 4 && nodes.length; pass++) {
    const seen = reach(root); let fixed = 0;
    for (const n of nodes) {
      if (seen[n.idx] || n.dead) continue;
      if (n.kind === 'aux') { n.dead = true; continue; } // isolated helper spot (e.g. boxed in by furniture): drop it
      let best = null, bd = Infinity;
      for (const m of nodes) { if (!seen[m.idx] || m.dead || zone(m) !== zone(n)) continue; const d = hyp(n.x, n.z, m.x, m.z) + Math.abs(n.y - m.y) * 3; if (d < bd) { bd = d; best = m; } }
      if (best) { addEdge(n, best, { forced: true }); warnings.push('forced edge ' + n.id + ' ↔ ' + best.id); fixed++; }
    }
    if (!fixed) break;
  }

  /* ---------- queries */
  const toNode = (x) => (x == null ? null : typeof x === 'string' ? byId.get(x) : typeof x === 'number' ? nodes[x] : x.idx != null && nodes[x.idx] === x ? x : null);
  function findPath(a0, b0) {
    const A = toNode(a0), Bn = toNode(b0);
    if (!A || !Bn) return null;
    const N = nodes.length, g = new Float64Array(N).fill(Infinity), f = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1), prevE = new Array(N), closed = new Uint8Array(N);
    const h = (n) => Math.hypot(n.x - Bn.x, n.y - Bn.y, n.z - Bn.z);
    g[A.idx] = 0; f[A.idx] = h(A);
    const open = [A.idx];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const u = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (u === Bn.idx) break;
      if (closed[u]) continue; closed[u] = 1;
      for (const e of adj[u]) {
        const v = e.a === u ? e.b : e.a; if (closed[v]) continue;
        const ng = g[u] + e.cost;
        if (ng < g[v]) { g[v] = ng; f[v] = ng + h(nodes[v]); prev[v] = u; prevE[v] = e; open.push(v); }
      }
    }
    if (!isFinite(g[Bn.idx])) return null;
    const ids = []; const es = [];
    for (let v = Bn.idx; v !== -1; v = prev[v]) { ids.push(v); if (prevE[v]) es.push(prevE[v]); }
    ids.reverse(); es.reverse();
    const pts = [{ x: A.x, y: A.y, z: A.z }]; const doorAt = {}; let length = 0;
    for (let i = 0; i < es.length; i++) {
      const e = es[i], fwd = e.a === ids[i];
      const ep = fwd ? e.pts : e.pts.slice().reverse();
      for (let k = 1; k < ep.length; k++) {
        pts.push({ x: ep[k].x, y: ep[k].y, z: ep[k].z });
        if (e.door) doorAt[pts.length - 1] = e.door; // segment (pts[i-1] → pts[i]) crosses this door
      }
      length += e.length;
    }
    return { ids: ids.map((i) => nodes[i].id), nodes: ids.map((i) => nodes[i]), pts, doorAt, length, cost: g[Bn.idx] };
  }
  // all shortest paths from one node (Dijkstra) — used for 360 neighbour links
  function dijkstra(a0, maxCost = Infinity) {
    const A = toNode(a0); if (!A) return null;
    const N = nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), prevE = new Array(N), done = new Uint8Array(N);
    dist[A.idx] = 0; const open = [A.idx];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const u = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (done[u]) continue; done[u] = 1;
      if (dist[u] > maxCost) continue;
      for (const e of adj[u]) { const v = e.a === u ? e.b : e.a; const nd = dist[u] + e.cost; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; prevE[v] = e; open.push(v); } }
    }
    return { dist, prev, prevE };
  }
  function roomKeyAt(x, feet, z) { const r = roomRect(x, feet, z); return r ? r.key : null; }
  function hub(room) { return hubOfRoom.get(room) || null; }
  // arrow destination for a node seen from a room: hub of the room on the far side (following door / stair links)
  function farDest(n, fromRoom, seen, depth) {
    if (!n || depth > 5 || seen.has(n.idx)) return null;
    seen.add(n.idx);
    if (n.room !== fromRoom && !n.transit) {
      const hb = hub(n.room);
      return { node: hb || n, room: n.room, he: (hb || n).he || heOf[n.room], other: true };
    }
    for (const li of n.links) { const r = farDest(nodes[li], fromRoom, seen, depth + 1); if (r) return r; }
    return null;
  }
  function destFor(n0, fromRoom) {
    const n = toNode(n0); if (!n) return null;
    const far = farDest(n, fromRoom, new Set(), 0);
    if (far) return far;
    if (n.room === fromRoom && !n.transit) return { node: n, room: n.room, he: n.he || heOf[n.room], other: false };
    return null;
  }
  // rooms one step away from a room (through any edge leaving it; doors / stairs followed to the far side)
  function neighborDests(room) {
    const out = new Map();
    for (const n of nodes) {
      if (n.room !== room || n.transit) continue;
      for (const e of adj[n.idx]) {
        const m = nodes[e.a === n.idx ? e.b : e.a];
        if (m.room === room && !m.transit) continue;
        const d = farDest(m, room, new Set([n.idx]), 0);
        if (d && d.node && !out.has(d.node.id)) out.set(d.node.id, d);
      }
    }
    return [...out.values()];
  }
  function nearest(p, opt = {}) {
    const tol = opt.yTol != null ? opt.yTol : 0.6;
    const list = [];
    for (const n of nodes) {
      if (n.dead || (opt.filter && !opt.filter(n))) continue;
      if (Math.abs(n.y - p.y) > tol) continue;
      const d = hyp(p.x, p.z, n.x, n.z); if (d > (opt.maxD || 1e9)) continue;
      list.push([d, n]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (const [, n] of list) {
      if (opt.los && !(clearSeg(p, n, opt.r != null ? opt.r : EDGE_R, !!opt.dyn) && stepOK(p, n))) continue;
      return n;
    }
    return null;
  }
  // 360 neighbours of a pano node: other pano nodes whose shortest path does not pass another pano hub first
  function panoLinks(panoId, maxLen = 16) {
    const A = byId.get('pano:' + panoId); if (!A) return [];
    const r = dijkstra(A, maxLen + 4); if (!r) return [];
    const out = [];
    for (const n of nodes) {
      if (n === A || n.kind !== 'pano' || !(r.dist[n.idx] <= maxLen + 2)) continue;
      let direct = true; const chain = [];
      for (let v = r.prev[n.idx]; v !== -1 && v !== A.idx; v = r.prev[v]) { chain.push(v); if (nodes[v].kind === 'pano') { direct = false; break; } }
      if (!direct) continue;
      const p = findPath(A, n); if (!p) continue;
      for (let i = 1; i < p.pts.length - 1 && direct; i++) {
        const q = p.pts[i];
        for (const m of nodes) if (m.kind === 'pano' && m !== A && m !== n && Math.abs(m.y - q.y) < 0.6 && hyp(m.x, m.z, q.x, q.z) < 0.9) { direct = false; break; }
      }
      if (!direct) continue;
      // bearing of the first leg (≥ 0.9 m along the path) — Street-View style: the arrow points at the doorway
      let acc = 0, dir = null;
      for (let i = 1; i < p.pts.length; i++) {
        const a = p.pts[i - 1], b = p.pts[i];
        const l = hyp(a.x, a.z, b.x, b.z); acc += l;
        if (acc >= 0.9 || i === p.pts.length - 1) { const q = p.pts[0]; dir = { x: b.x - q.x, z: b.z - q.z }; break; }
      }
      if (!dir || Math.hypot(dir.x, dir.z) < 1e-3) dir = { x: n.x - A.x, z: n.z - A.z };
      out.push({ pano: n.pano, node: n, path: p, dir, len: p.length });
    }
    out.sort((a, b) => a.len - b.len);
    return out;
  }

  const graph = {
    nodes, edges, byId, warnings, hubs: hubOfRoom, heOf,
    findPath, dijkstra, destFor, neighborDests, nearest, panoLinks, hub, roomKeyAt, floorOf,
    clearSeg, blockedAt, freeAlong, stepOK, needStep, segSegDoor: crossesDoor,
    node: toNode,
    get usesWorld() { return !!world; },
    stats() { return { nodes: nodes.length, edges: edges.length, links: edges.filter((e) => e.link).length, dead: nodes.filter((n) => n.dead).length, moved: nodes.filter((n) => n.moved).map((n) => n.id + ':' + n.moved.toFixed(2)), blocked: nodes.filter((n) => n.blocked).map((n) => n.id), warnings: warnings.slice() }; },
  };
  _last = graph;
  return graph;
}

export function findPath(a, b, graph = _last) { return graph ? graph.findPath(a, b) : null; }
export function lastNavGraph() { return _last; }
