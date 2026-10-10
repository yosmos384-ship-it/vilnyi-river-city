// VILNYI Lifestyle yacht — navigable water of Lacul Morii and the autopilot's route (pure maths, world coordinates).
import { LAKE } from '../data.js?v=3.12';

// shore polygon: data.js LAKE.shore smoothed exactly like lake.js SHORE (closed Catmull-Rom)
const SHORE = (() => {
  const P = LAKE.shore, n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), k = Math.max(2, Math.round(L / 14));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
})();
const BB = SHORE.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [1e9, -1e9, 1e9, -1e9]);
function inShore(x, z) {
  if (x < BB[0] || x > BB[1] || z < BB[2] || z > BB[3]) return false;
  let c = false;
  for (let i = 0, j = SHORE.length - 1; i < SHORE.length; j = i++) { const [xi, zi] = SHORE[i], [xj, zj] = SHORE[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; }
  return c;
}
const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9; let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(x - ax - dx * t, z - az - dz * t); };
function shoreDist(x, z) { let d = 1e9; for (let i = 0, j = SHORE.length - 1; i < SHORE.length; j = i++) { const q = segDist(x, z, SHORE[i][0], SHORE[i][1], SHORE[j][0], SHORE[j][1]); if (q < d) d = q; } return d; }
// island (leaf-shaped, lake.js ISL), islets, the footbridge and the fountain
const ISL = { c: LAKE.island.center, rot: -0.32, a: LAKE.island.r * 1.42 * 1.09, b: LAKE.island.r * 0.72 * 1.09 };
const islW = (s, t) => { const c = Math.cos(ISL.rot), n = Math.sin(ISL.rot); return [ISL.c[0] + s * c - t * n, ISL.c[1] + s * n + t * c]; };
const ISLETS = [[250, -150, 70, 0.25], [-120, 170, 90, -0.15], [300, 170, 45, 0.6]].map(([ds, dt, a, r]) => { const c = islW(ds / 1.09, dt / 1.09), an = r + ISL.rot; return [c[0] - Math.cos(an) * a, c[1] - Math.sin(an) * a, c[0] + Math.cos(an) * a, c[1] + Math.sin(an) * a]; });
const BRIDGE = [-384.25, -441.36, -583, -347.3];
function islandDist(x, z) {
  const dx = x - ISL.c[0], dz = z - ISL.c[1], c = Math.cos(ISL.rot), n = Math.sin(ISL.rot), s = dx * c + dz * n, t = -dx * n + dz * c;
  return (Math.hypot(s / ISL.a, t / ISL.b) - 1) * ISL.b;
}
/** Clearance (m) from (x, z) to the nearest shore / island / islet / bridge / fountain; negative = aground. */
export function clearance(x, z) {
  let d = inShore(x, z) ? shoreDist(x, z) : -shoreDist(x, z);
  d = Math.min(d, islandDist(x, z));
  for (const s of ISLETS) d = Math.min(d, segDist(x, z, s[0], s[1], s[2], s[3]) - 8);
  d = Math.min(d, segDist(x, z, BRIDGE[0], BRIDGE[1], BRIDGE[2], BRIDGE[3]) - 6);
  d = Math.min(d, Math.hypot(x - LAKE.fountain[0], z - LAKE.fountain[1]) - 22);
  return d;
}
/** Unit direction of increasing clearance at (x, z) (to steer away from the shallows). */
export function awayDir(x, z) { const e = 6, gx = clearance(x + e, z) - clearance(x - e, z), gz = clearance(x, z + e) - clearance(x, z - e), l = Math.hypot(gx, gz) || 1; return [gx / l, gz / l]; }

// The scenic loop. A mark is [x, z, speed (m/s, default: cruise), rounding radius (m, default 95)].
//  1. off the pier she swings round to port in the open water south of the fountain and comes back heading for the
//     buildings (VILNYI RIVER CITY ahead of the bow), then
//  2. THE PASS: slowly north along the east shore, 95–125 m off the pier head, the project 340–400 m off to starboard,
//  3. west through the fairway north of the fountain, round the wide west basin and back along the south shore,
//  4. the same approach again — bow to the project, then her starboard side — ending stopped on the pier's axis
//     (PASS_END), where she swings her bow to the lake and backs in.
const SITE = [42, -47];                       // centre of the C3 / C4 plot (lake.js SITE)
export const PROJECT = SITE;
export const PASS_END = [-352.3, -12.5];      // on the pier's axis, 128 m from its root (= PIER.at(128))
const APPROACH = [[-548, 184, 7, 60], [-478, 136, 6, 60], [-405, 72, 4.4, 60], [-364, 18, 3.2, 45]];
export const LOOP = [
  [-420, 3, 7], [-515, 58, 9], [-610, 26, 9], [-700, 30, 9], [-752, 90, 8.5], [-748, 150, 8], [-700, 196, 7.5, 60], [-630, 206, 7, 60],
  ...APPROACH, [PASS_END[0], PASS_END[1], 3, 40], [-354, -60, 2.6, 35], [-379, -121, 2.5, 35], [-440, -146, 3, 40],
  [-510, -152, 6, 60], [-575, -150, 7, 60], [-628, -118, 7.5, 60], [-672, -62, 8.5], [-730, -10], [-830, 35], [-960, 5], [-1070, -70],
  [-1150, -190], [-1235, -250], [-1300, -170], [-1290, -40], [-1200, 70], [-1040, 180], [-850, 222], [-710, 214, 8], [-630, 206, 7, 60],
  ...APPROACH.map(m => m.slice()), [PASS_END[0], PASS_END[1], 2.2, 24],
];
// extra fairway marks: the basin south of the island (reached round its west end; the footbridge closes the east side)
// and the pocket east of the island
// — and the far north-west of the lake and the open water off the pier, which the loop does not visit
const EXTRA = [[-560, -615], [-700, -560], [-880, -520], [-1040, -480], [-640, -120], [-460, -150],
  [-1190, -470], [-1240, -640], [-1300, -690], [-1360, -610], [-660, 42], [-660, 190], [-560, 110], [-530, 48]];
const NODES = [...LOOP, ...EXTRA];
/** Is the straight line a → b clear by at least `m` metres all the way? */
export function clearLine(ax, az, bx, bz, m = 40, lead = 0) {   // lead: metres at the start that only need to be afloat
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 25));
  for (let i = 0; i <= n; i++) if (clearance(ax + (bx - ax) * i / n, az + (bz - az) * i / n) < (L * i / n < lead ? 4 : m)) return false;
  return true;
}
let EDGES = null;
function edges() {
  if (EDGES) return EDGES;
  EDGES = NODES.map(() => []);
  for (let i = 0; i < NODES.length; i++) for (let j = i + 1; j < NODES.length; j++) {
    const d = Math.hypot(NODES[i][0] - NODES[j][0], NODES[i][1] - NODES[j][1]);
    if (d < 520 && clearLine(NODES[i][0], NODES[i][1], NODES[j][0], NODES[j][1], 45)) { EDGES[i].push([j, d]); EDGES[j].push([i, d]); }
  }
  return EDGES;
}
/**
 * Fairway route from (x, z) to (tx, tz) over the marks: [[x, z] …] ending with the target, or null when no mark is in
 * clear sight of the start (nose against a shore: back off first). goal: optional index of a LOOP mark to end at.
 */
export function route(x, z, tx, tz, goal = -1) {
  if (goal < 0 && clearLine(x, z, tx, tz, 60, 90)) return [[tx, tz]];
  const E = edges(), n = NODES.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  // (the first leg may start in a tight spot, but a long one keeps the fairway's margin like every other leg)
  for (let i = 0; i < n; i++) { const d = Math.hypot(NODES[i][0] - x, NODES[i][1] - z); if (clearLine(x, z, NODES[i][0], NODES[i][1], d < 170 ? 30 : 45, 90)) dist[i] = d; }
  if (!dist.some(isFinite)) return null;
  for (;;) {
    let u = -1; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break; done[u] = true;
    for (const [v, d] of E[u]) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
  }
  let end = goal;
  if (end < 0) { let best = Infinity; for (let i = 0; i < n; i++) if (dist[i] < Infinity && clearLine(NODES[i][0], NODES[i][1], tx, tz, 45)) { const c = dist[i] + Math.hypot(NODES[i][0] - tx, NODES[i][1] - tz); if (c < best) { best = c; end = i; } } }
  if (end < 0 || dist[end] === Infinity) return null;
  const path = []; for (let u = end; u >= 0; u = prev[u]) path.unshift(NODES[u]);
  if (goal < 0) path.push([tx, tz]);
  return path;
}
/** Cost of the fairway route from (x, z) to LOOP mark k (Infinity if none). */
export function routeCost(x, z, k) { const r = route(x, z, 0, 0, k); if (!r) return Infinity; let c = 0, px = x, pz = z; for (const [a, b] of r) { c += Math.hypot(a - px, b - pz); px = a; pz = b; } return c; }
export { SHORE as NAV_SHORE };
