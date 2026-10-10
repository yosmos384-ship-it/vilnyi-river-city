// City Drive — the arcade vehicle model shared by the player's car, the police and anything knocked loose.
// A body is {x, z, yaw, vx, vz, w, steer, …}; forward = (sin yaw, cos yaw), left = (cos yaw, −sin yaw) (cars.js frame:
// +z forward, +x = driver's side / left). Ground is flat (y = 0).
import { carSpec } from '../cars.js?v=3.13';
import { BOUNDS } from './map.js?v=3.13';

// believable figures by class: top speed km/h, launch acceleration m/s², braking m/s², lateral grip m/s², mass kg
export const CLASS = {
  sedan: { top: 250, a0: 6.4, brake: 10.4, grip: 9.0, mass: 2150, ev: false },
  coupe: { top: 285, a0: 8.0, brake: 11.0, grip: 10.0, mass: 1750, ev: false },
  suv: { top: 240, a0: 6.0, brake: 9.8, grip: 8.4, mass: 2450, ev: false },
  gt: { top: 300, a0: 8.8, brake: 11.2, grip: 10.2, mass: 1950, ev: false },
  ev: { top: 262, a0: 10.2, brake: 10.6, grip: 9.6, mass: 2250, ev: true },
  super: { top: 300, a0: 11.2, brake: 12.0, grip: 11.2, mass: 1550, ev: false },
};
const GEARS = [0.13, 0.24, 0.37, 0.52, 0.69, 0.86, 1.02];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function makeBody(kind, x, z, yaw) {
  const S = carSpec(kind), C = CLASS[kind] || CLASS.sedan;
  return { kind, S, C, x, z, yaw, vx: 0, vz: 0, w: 0, steer: 0, hw: S.W / 2, zF: S.zF, zR: S.zR, mass: C.mass, gear: 'P', gearN: 1, rpm: 800, slip: 0, spin: 0, dmg: 0, dead: false, pull: 0, fuel: 1, braking: false, reversing: false, roll: 0, pitch: 0, offroad: 0, hbT: 0 };
}
export const speedOf = b => Math.hypot(b.vx, b.vz);
export const fwdSpeed = b => b.vx * Math.sin(b.yaw) + b.vz * Math.cos(b.yaw);

// inp: {gas 0..1, brake 0..1, steer −1..1 (+ = left), hb bool}. surf: {grip, drag} multipliers (1 on the road).
export function stepBody(b, inp, dt, surf = null) {
  if (!(dt > 0)) return b;
  const C = b.C, S = b.S, sy = Math.sin(b.yaw), cy = Math.cos(b.yaw);
  let vf = b.vx * sy + b.vz * cy, vl = b.vx * cy - b.vz * sy;
  const sg = surf ? surf.grip : 1, top = C.top / 3.6 * (1 - 0.6 * clamp(b.dmg / 100)) * (b.fuel <= 0 ? 0.2 : 1), mu = C.grip * sg;
  const gas = b.dead ? 0 : clamp(inp.gas || 0), brk = clamp(inp.brake || 0), hb = !!inp.hb;
  // ---- steering: lock tightens with speed, rate-limited, a damaged car pulls to one side
  const av = Math.abs(vf), maxSteer = 0.6 / (1 + Math.pow(av / 15, 1.6));
  const tgt = clamp((inp.steer || 0) + b.pull * clamp(av / 8), -1, 1) * maxSteer, rate = (Math.abs(tgt) < Math.abs(b.steer) ? 3.6 : 2.4) * dt;
  b.steer += clamp(tgt - b.steer, -rate, rate);
  // ---- longitudinal
  let a = 0; b.braking = false; b.reversing = false;
  const thrust = v => C.a0 * Math.max(0, 1 - Math.pow(Math.max(0, v) / top, 1.5)) * (1 - 0.35 * clamp(b.dmg / 100));
  if (gas > 0) { if (vf < -0.3) { a += C.brake * gas; b.braking = true; } else a += thrust(vf) * gas; }
  if (brk > 0) {
    if (vf > 0.4) { a -= C.brake * brk; b.braking = true; }
    else if (!gas && !b.dead) { a -= 3.2 * brk * Math.max(0, 1 - Math.abs(vf) / 16); b.reversing = true; }
  }
  if (hb) { a -= Math.sign(vf) * Math.min(Math.abs(vf) / dt, 5.5); b.braking = true; }
  const kd = surf ? surf.drag : 1, drag = 0.22 + 0.01 * av + (kd - 1) * 2.2;
  if (!gas || vf < 0) a -= Math.sign(vf) * Math.min(Math.abs(vf) / dt, drag + 0.00042 * vf * vf + (gas || brk ? 0 : 0.5));
  else if (kd > 1) a -= (kd - 1) * 1.6 * clamp(vf / 6);
  a = clamp(a, -mu * 1.25, mu);
  let nvf = vf + a * dt;
  if (brk > 0 && !gas && vf > 0 && nvf < 0) nvf = 0;
  if (!gas && !brk && Math.abs(nvf) < 0.05) nvf = 0;
  if (vf > top && nvf > top) nvf = Math.max(top, vf - 6 * dt);
  // ---- yaw: bicycle model inside the grip circle; the handbrake breaks the rear loose
  let wT = nvf * Math.tan(b.steer) / S.wb;
  const wMax = mu * (hb ? 1.5 : 1.02) / Math.max(4, av); wT = clamp(wT, -wMax, wMax);
  b.w += (wT - b.w) * clamp(dt * (hb ? 4 : 9));
  b.yaw += b.w * dt;
  // ---- lateral: tyres scrub the side-slip off, up to the grip limit (beyond it the car drifts wide)
  const latMu = mu * (hb ? 0.32 : 0.92);
  // velocity in the new heading
  const sy2 = Math.sin(b.yaw), cy2 = Math.cos(b.yaw);
  // carry the old lateral component over as world velocity: the rotation of the heading is what creates side-slip
  const wx = sy * nvf + cy * vl, wz = cy * nvf - sy * vl;
  let f2 = wx * sy2 + wz * cy2, l2 = wx * cy2 - wz * sy2;
  const k2 = Math.min(Math.abs(l2), latMu * dt); l2 -= Math.sign(l2) * k2;
  b.slip = Math.abs(l2) + (hb && av > 4 ? 2 : 0) + (b.braking && brk > 0.9 && av > 28 ? 0.6 : 0);
  b.vx = sy2 * f2 + cy2 * l2; b.vz = cy2 * f2 - sy2 * l2;
  b.x += b.vx * dt; b.z += b.vz * dt;
  // ---- gears, revs, fuel, body motion
  const frac = Math.abs(f2) / (C.top / 3.6); let g = 0; while (g < GEARS.length - 1 && frac > GEARS[g] * 0.94) g++;
  const lo = g ? GEARS[g - 1] * 0.62 : 0, r = clamp((frac - lo) / (GEARS[g] - lo));
  const rT = b.dead ? 0 : 850 + r * 6400 + gas * 500 * (1 - r);
  b.rpm += (rT - b.rpm) * clamp(dt * 9); b.gearN = g + 1;
  b.gear = f2 < -0.3 || (b.reversing && f2 <= 0.05) ? 'R' : Math.abs(f2) > 0.3 || gas ? 'D' : hb ? 'P' : 'N';
  if (gas && !b.dead) b.fuel = Math.max(0, b.fuel - dt * gas * (0.35 + frac) / 900);
  b.spin += f2 / S.R * dt;
  b.roll += (clamp(-b.w * f2 * 0.004, -0.07, 0.07) - b.roll) * clamp(dt * 6);
  b.pitch += (clamp(-a * 0.0045, -0.03, 0.035) - b.pitch) * clamp(dt * 7);
  return b;
}

// ---- 2-D oriented boxes
export function bodyBox(b, grow = 0) { const zc = (b.zF + b.zR) / 2, sy = Math.sin(b.yaw), cy = Math.cos(b.yaw); return { x: b.x + sy * zc, z: b.z + cy * zc, ux: cy, uz: -sy, hw: b.hw + grow, hd: (b.zF - b.zR) / 2 + grow }; }
const cornersOf = o => [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, c]) => [o.x + o.ux * a * o.hw - o.uz * c * o.hd, o.z + o.uz * a * o.hw + o.ux * c * o.hd]);
// minimum translation that moves A out of B: {nx, nz (from B to A), d, px, pz (contact point)} or null
export function obbMTV(A, B) {
  const dx = A.x - B.x, dz = A.z - B.z;
  if (Math.abs(dx) + Math.abs(dz) > (A.hw + A.hd + B.hw + B.hd) * 1.42) return null;
  const CA = cornersOf(A), CB = cornersOf(B); let best = null;
  for (const o of [A, B]) for (const [nx, nz] of [[o.ux, o.uz], [-o.uz, o.ux]]) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of CA) { const d = x * nx + z * nz; if (d < a0) a0 = d; if (d > a1) a1 = d; }
    for (const [x, z] of CB) { const d = x * nx + z * nz; if (d < b0) b0 = d; if (d > b1) b1 = d; }
    const ov = Math.min(a1, b1) - Math.max(a0, b0); if (ov <= 0) return null;
    if (!best || ov < best.d) { const s = (dx * nx + dz * nz) >= 0 ? 1 : -1; best = { nx: nx * s, nz: nz * s, d: ov }; }
  }
  // contact: A's corner deepest into B, or B's corner deepest into A
  let px = 0, pz = 0, m = Infinity;
  for (const [x, z] of CA) { const d = (x - B.x) * best.nx + (z - B.z) * best.nz; if (d < m) { m = d; px = x; pz = z; } }
  let m2 = -Infinity, qx = 0, qz = 0; for (const [x, z] of CB) { const d = (x - A.x) * best.nx + (z - A.z) * best.nz; if (d > m2) { m2 = d; qx = x; qz = z; } }
  const inB = (x, z) => Math.abs((x - B.x) * B.ux + (z - B.z) * B.uz) <= B.hw + 0.05 && Math.abs(-(x - B.x) * B.uz + (z - B.z) * B.ux) <= B.hd + 0.05;
  if (!inB(px, pz)) { px = qx; pz = qz; }
  best.px = px; best.pz = pz; return best;
}
// push a body out of a static obstacle and take the hit: returns the impact speed (m/s along the normal)
export function bounce(b, m, e = 0.12, fr = 0.35) {
  b.x += m.nx * (m.d + 0.01); b.z += m.nz * (m.d + 0.01);
  const vn = b.vx * m.nx + b.vz * m.nz; if (vn >= 0) return 0;
  const tx = -m.nz, tz = m.nx, vt = b.vx * tx + b.vz * tz;
  b.vx = tx * vt * (1 - fr * Math.min(1, -vn / (Math.abs(vt) + 0.5))) - m.nx * vn * e; b.vz = tz * vt * (1 - fr * Math.min(1, -vn / (Math.abs(vt) + 0.5))) - m.nz * vn * e;
  const rx = m.px - b.x, rz = m.pz - b.z; b.w += clamp((rx * m.nz - rz * m.nx) * vn * 0.035, -2.2, 2.2);
  return -vn;
}
// two moving bodies (a.mass, b.mass): exchange an impulse along the normal (from B to A); returns the closing speed
export function collide(a, b, m) {
  const ia = 1 / a.mass, ib = b.fixed ? 0 : 1 / b.mass, tot = ia + ib;
  a.x += m.nx * m.d * (ia / tot); a.z += m.nz * m.d * (ia / tot); if (!b.fixed) { b.x -= m.nx * m.d * (ib / tot); b.z -= m.nz * m.d * (ib / tot); }
  const rvx = a.vx - b.vx, rvz = a.vz - b.vz, vn = rvx * m.nx + rvz * m.nz; if (vn >= 0) return 0;
  const j = -(1 + 0.18) * vn / tot;
  a.vx += m.nx * j * ia; a.vz += m.nz * j * ia; b.vx -= m.nx * j * ib; b.vz -= m.nz * j * ib;
  const ra = [m.px - a.x, m.pz - a.z], rb = [m.px - b.x, m.pz - b.z];
  a.w += clamp(-(ra[0] * m.nz - ra[1] * m.nx) * j * ia * 0.28, -2.5, 2.5); b.w += clamp((rb[0] * m.nz - rb[1] * m.nx) * j * ib * 0.28, -3, 3);
  return -vn;
}
// static world: buildings (boxes), street furniture (circles), map edge. onHit(kind, speed, px, pz, nx, nz, item)
const _sol = [];
export function collideStatic(b, world, onHit, breakable = true, ghost = false) {   // ghost: trees and benches do not stop it (emergency vehicles)
  const A = bodyBox(b);
  for (const o of world.solidsNear(A.x, A.z, 4, _sol)) {
    const m = obbMTV(A, o); if (!m) continue;
    const sp = bounce(b, m); Object.assign(A, bodyBox(b)); if (onHit) onHit('wall', sp, m.px, m.pz, m.nx, m.nz, o);
  }
  world.propsNear(A.x, A.z, A.hd + 0.3, (c, isItem) => {
    if (ghost && !isItem) return;
    // circle vs box in the car's frame
    const dx = c.x - A.x, dz = c.z - A.z, lx = dx * A.ux + dz * A.uz, lz = -dx * A.uz + dz * A.ux;
    const qx = clamp(lx, -A.hw, A.hw), qz = clamp(lz, -A.hd, A.hd), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
    if (d2 > c.r * c.r) return;
    let nx, nz, d = Math.sqrt(d2);
    if (d > 1e-4) { nx = -(ex * A.ux - ez * A.uz) / d; nz = -(ex * A.uz + ez * A.ux) / d; }
    else { const sp = Math.hypot(b.vx, b.vz) || 1; nx = -b.vx / sp; nz = -b.vz / sp; }
    const vn = -(b.vx * nx + b.vz * nz), sp = Math.hypot(b.vx, b.vz);
    const weak = isItem && breakable && (c.k === 'bin' || c.k === 'fence' ? sp > 1.2 : c.k === 'lamp' ? vn > 5 : vn > 6.5);
    if (weak) {
      const loss = c.k === 'bin' ? 0.02 : c.k === 'fence' ? 0.06 : 0.16; b.vx *= 1 - loss; b.vz *= 1 - loss;
      world.knock(c, b.vx, b.vz, sp); if (onHit) onHit(c.k, c.k === 'bin' || c.k === 'fence' ? sp * 0.12 : vn * 0.45, c.x, c.z, nx, nz, c);
    } else {
      const m = { nx, nz, d: c.r - d, px: c.x, pz: c.z }, s2 = bounce(b, m); Object.assign(A, bodyBox(b)); if (onHit) onHit(isItem ? c.k : c.k === 'tree' ? 'tree' : 'wall', s2, c.x, c.z, nx, nz, c);
    }
  });
  const B = BOUNDS, mrg = 30;
  if (b.x < B.x0 + mrg) { b.x = B.x0 + mrg; b.vx = Math.abs(b.vx) * 0.3; } if (b.x > B.x1 - mrg) { b.x = B.x1 - mrg; b.vx = -Math.abs(b.vx) * 0.3; }
  if (b.z < B.z0 + mrg) { b.z = B.z0 + mrg; b.vz = Math.abs(b.vz) * 0.3; } if (b.z > B.z1 - mrg) { b.z = B.z1 - mrg; b.vz = -Math.abs(b.vz) * 0.3; }
}
