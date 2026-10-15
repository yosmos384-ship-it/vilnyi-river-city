// house-geo.js — geometry helpers for the luxury shell (owner: STRUCTURE bot). No side effects on import.
// All builders return NON-INDEXED BufferGeometry with position / normal / uv in WORLD space (meters).
//   prismGeo     — sweep a 2D profile along a straight run (baseboards, crown, casings, chair rail, roof courses)
//   frameGeo     — mitred rectangular frame from a profile (picture-frame / wainscot panel molding)
//   bevelBoxGeo  — axis-aligned box with chamfered long edges (trims, treads, posts)
//   PROFILES     — molding profiles in meters, (p = distance out from the mounting face, q = along the side axis)

export const PROFILES = {
  // 18 cm baseboard with an ogee top and a 19 mm shoe molding at the floor. q = up from the floor.
  base: [[0, 0], [0.033, 0], [0.0326, 0.004], [0.0312, 0.0085], [0.0285, 0.0125], [0.0245, 0.0158], [0.0198, 0.018], [0.0162, 0.0186],
    [0.0162, 0.150], [0.0148, 0.1545], [0.0148, 0.1595], [0.0122, 0.163], [0.0108, 0.1695], [0.0082, 0.1755], [0.0042, 0.1792], [0, 0.18]],
  // short baseboard for the upper floor knee walls (12 cm)
  baseLow: [[0, 0], [0.03, 0], [0.0296, 0.004], [0.0282, 0.0085], [0.0255, 0.0125], [0.0215, 0.0156], [0.0168, 0.0175], [0.0145, 0.018],
    [0.0145, 0.098], [0.0128, 0.103], [0.0112, 0.11], [0.0078, 0.1162], [0.004, 0.1192], [0, 0.12]],
  // crown: q measured UP from the bottom edge on the wall (total height 0.11, projection 0.10); last edge lies on the ceiling
  crown: (() => {
    const pts = [[0, 0], [0.006, 0], [0.0085, 0.0035], [0.0105, 0.0085], [0.0142, 0.0115]];
    const cx = 0.088, cy = 0.0115, rx = 0.0738, ry = 0.083;
    for (let i = 1; i <= 9; i++) { const a = Math.PI - (i / 9) * (Math.PI / 2); pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    pts.push([0.093, 0.0985], [0.0965, 0.1015], [0.1, 0.1015], [0.1, 0.11], [0, 0.11]);
    return pts;
  })(),
  // casing leg: q = across the leg from the opening edge (0) outward (0.085); thicker back band on the outside
  casing: [[0, 0], [0.0155, 0], [0.0178, 0.0025], [0.0188, 0.0075], [0.019, 0.068], [0.0232, 0.0705], [0.0245, 0.076], [0.0238, 0.0815], [0.021, 0.085], [0, 0.085]],
  // chair rail (q up, 0..0.065)
  chair: [[0, 0], [0.006, 0], [0.012, 0.004], [0.017, 0.012], [0.019, 0.022], [0.0215, 0.03], [0.022, 0.037], [0.0205, 0.046], [0.016, 0.054], [0.009, 0.061], [0, 0.065]],
  // panel (picture-frame) molding, height-field over q (0 = outer edge … 0.038 = inner edge)
  panel: [[0, 0], [0.004, 0.0015], [0.0085, 0.005], [0.0112, 0.0095], [0.012, 0.015], [0.0112, 0.0205], [0.0094, 0.0255], [0.0068, 0.03], [0.0036, 0.0345], [0, 0.038]],
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// triangle collector → BufferGeometry
function collector(T) {
  const P = [], N = [], U = [];
  return {
    // tri with per-vertex normals (n0..n2) or flat (null); orient: desired facing (3-vector) to fix winding
    tri(a, b, c, ua, ub, uc, na, nb, nc, orient) {
      let fn = norm(cross(sub(b, a), sub(c, a)));
      if (orient && dot(fn, orient) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; [nb, nc] = [nc, nb]; fn = [-fn[0], -fn[1], -fn[2]]; }
      for (const [p, uv, n] of [[a, ua, na], [b, ub, nb], [c, uc, nc]]) {
        P.push(p[0], p[1], p[2]);
        const nn = n || fn; N.push(nn[0], nn[1], nn[2]);
        U.push(uv[0], uv[1]);
      }
    },
    geo() {
      if (!P.length) return null;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(P), 3));
      g.setAttribute('normal', new T.BufferAttribute(new Float32Array(N), 3));
      g.setAttribute('uv', new T.BufferAttribute(new Float32Array(U), 2));
      g.computeBoundingBox(); g.computeBoundingSphere();
      return g;
    },
  };
}

/**
 * prismGeo(T, profile, {origin, axP, axQ, dir, length, caps=true, closed=true, smooth=40, uvQ=false})
 * Profile point (p,q) maps to origin + axP*p + axQ*q + dir*t, t ∈ [0, length].
 * closed: the last→first edge is part of the surface (usually the hidden mounting face — it is still emitted).
 * Normals are smoothed across profile vertices whose edge normals differ by < `smooth` degrees.
 * UV: u = t (meters along the run); v = perimeter distance along the profile (or q when uvQ).
 */
export function prismGeo(T, profile, o) {
  const pts = profile;
  const n = pts.length;
  if (n < 3 || !(o.length > 1e-5)) return null;
  const O = o.origin, AP = o.axP, AQ = o.axQ, D = o.dir, L = o.length;
  const closed = o.closed !== false, caps = o.caps !== false;
  const cosS = Math.cos(((o.smooth != null ? o.smooth : 40) * Math.PI) / 180);
  // polygon orientation in (p,q)
  let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const ccw = area > 0;
  const W = (p, q, t) => [O[0] + AP[0] * p + AQ[0] * q + D[0] * t, O[1] + AP[1] * p + AQ[1] * q + D[1] * t, O[2] + AP[2] * p + AQ[2] * q + D[2] * t];
  const edges = closed ? n : n - 1;
  // 2D outward normal per edge → 3D
  const en = [];
  for (let i = 0; i < edges; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const ox = ccw ? dy / l : -dy / l, oy = ccw ? -dx / l : dx / l; // outward in (p,q)
    en.push(norm([AP[0] * ox + AQ[0] * oy, AP[1] * ox + AQ[1] * oy, AP[2] * ox + AQ[2] * oy]));
  }
  const vN = (i, k) => { // normal at profile vertex k for edge i
    const nb = (k === i) ? (i - 1 + edges) % edges : (i + 1) % edges;
    const valid = closed || (k === i ? i > 0 : i + 1 < edges);
    if (!valid) return en[i];
    const a = en[i], b = en[nb];
    if (dot(a, b) >= cosS) return norm([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
    return en[i];
  };
  const C = collector(T);
  let per = 0;
  for (let i = 0; i < edges; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg < 1e-7) continue;
    // uvQ: v follows q (plus the height above uvP0, so vertical steps get a non-degenerate UV span for normal maps)
    const p0 = o.uvP0 || 0;
    const va = o.uvQ ? a[1] + (a[0] - p0) : per, vb = o.uvQ ? b[1] + (b[0] - p0) : per + seg; per += seg;
    const A0 = W(a[0], a[1], 0), B0 = W(b[0], b[1], 0), A1 = W(a[0], a[1], L), B1 = W(b[0], b[1], L);
    const na = vN(i, i), nb = vN(i, (i + 1) % n);
    C.tri(A0, B0, B1, [0, va], [0, vb], [L, vb], na, nb, nb, en[i]);
    C.tri(A0, B1, A1, [0, va], [L, vb], [L, va], na, nb, na, en[i]);
  }
  if (caps) {
    let tris = null;
    try { tris = T.ShapeUtils.triangulateShape(pts.map((p) => new T.Vector2(p[0], p[1])), []); } catch (_) { tris = null; }
    if (tris) {
      const dn = norm(D), dm = [-dn[0], -dn[1], -dn[2]];
      for (const f of tris) {
        const [a, b, c] = f.map((k) => pts[k]);
        C.tri(W(a[0], a[1], 0), W(b[0], b[1], 0), W(c[0], c[1], 0), [a[0], a[1]], [b[0], b[1]], [c[0], c[1]], null, null, null, dm);
        C.tri(W(a[0], a[1], L), W(b[0], b[1], L), W(c[0], c[1], L), [a[0], a[1]], [b[0], b[1]], [c[0], c[1]], null, null, null, dn);
      }
    }
  }
  return C.geo();
}

/**
 * frameGeo(T, profile, {origin, e1, e2, n, a0, b0, a1, b1, smooth=40})
 * Mitred rectangular frame on a wall plane: wall point = origin + e1*a + e2*b, out of the wall along n.
 * profile: height field p(q) — q measured INWARD from the outer rectangle edge (rect [a0,b0]-[a1,b1]).
 */
export function frameGeo(T, profile, o) {
  const { origin: O, e1, e2, n: N } = o;
  const C = collector(T);
  const W = (a, b, p) => [O[0] + e1[0] * a + e2[0] * b + N[0] * p, O[1] + e1[1] * a + e2[1] * b + N[1] * p, O[2] + e1[2] * a + e2[2] * b + N[2] * p];
  const rect = (q) => [[o.a0 + q, o.b0 + q], [o.a1 - q, o.b0 + q], [o.a1 - q, o.b1 - q], [o.a0 + q, o.b1 - q]];
  if (o.a1 - o.a0 < 2 * profile[profile.length - 1][1] + 0.01 || o.b1 - o.b0 < 2 * profile[profile.length - 1][1] + 0.01) return null;
  const cosS = Math.cos(((o.smooth != null ? o.smooth : 40) * Math.PI) / 180);
  for (let s = 0; s < 4; s++) {
    // inward 2D direction for side s (bottom, right, top, left)
    const inw = [[0, 1], [-1, 0], [0, -1], [1, 0]][s];
    const inv3 = [e1[0] * inw[0] + e2[0] * inw[1], e1[1] * inw[0] + e2[1] * inw[1], e1[2] * inw[0] + e2[2] * inw[1]];
    const segN = [];
    for (let k = 0; k + 1 < profile.length; k++) {
      const [p0, q0] = profile[k], [p1, q1] = profile[k + 1];
      const dq = q1 - q0, dp = p1 - p0, l = Math.hypot(dq, dp) || 1;
      // surface normal in (inward, out) plane: perpendicular to (dq, dp) pointing out of the wall
      const ni = -dp / l, no = dq / l;
      segN.push(norm([inv3[0] * ni + N[0] * no, inv3[1] * ni + N[1] * no, inv3[2] * ni + N[2] * no]));
    }
    for (let k = 0; k + 1 < profile.length; k++) {
      const [p0, q0] = profile[k], [p1, q1] = profile[k + 1];
      const r0 = rect(q0), r1 = rect(q1);
      const i0 = s, i1 = (s + 1) % 4;
      const A = W(r0[i0][0], r0[i0][1], p0), B = W(r0[i1][0], r0[i1][1], p0), Cc = W(r1[i1][0], r1[i1][1], p1), Dd = W(r1[i0][0], r1[i0][1], p1);
      const na = k > 0 && dot(segN[k], segN[k - 1]) >= cosS ? norm(segN[k].map((v, j) => v + segN[k - 1][j])) : segN[k];
      const nb = k + 2 < profile.length && dot(segN[k], segN[k + 1]) >= cosS ? norm(segN[k].map((v, j) => v + segN[k + 1][j])) : segN[k];
      const along = s % 2 === 0 ? 0 : 1;
      const ua = [r0[i0][along], q0], ub = [r0[i1][along], q0], uc = [r1[i1][along], q1], ud = [r1[i0][along], q1];
      C.tri(A, B, Cc, ua, ub, uc, na, na, nb, segN[k]);
      C.tri(A, Cc, Dd, ua, uc, ud, na, nb, nb, segN[k]);
    }
  }
  return C.geo();
}

/**
 * bevelBoxGeo(T, x0,y0,z0, x1,y1,z1, bevel, axis?) — axis-aligned box whose 4 edges parallel to `axis`
 * (default: the longest dimension) are chamfered by `bevel` meters; end caps are flat octagons.
 */
export function bevelBoxGeo(T, x0, y0, z0, x1, y1, z1, bevel = 0.003, axis) {
  const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
  const sz = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  if (!(sz[0] > 1e-5 && sz[1] > 1e-5 && sz[2] > 1e-5)) return null;
  let ax = axis === 'x' ? 0 : axis === 'y' ? 1 : axis === 'z' ? 2 : (sz[0] >= sz[1] && sz[0] >= sz[2] ? 0 : sz[1] >= sz[2] ? 1 : 2);
  const ia = (ax + 1) % 3, ib = (ax + 2) % 3; // profile axes (right-handed: ia × ib = ax)
  const A = sz[ia], B = sz[ib];
  const b = Math.max(0, Math.min(bevel, A * 0.3, B * 0.3));
  const prof = b > 1e-5
    ? [[b, 0], [A - b, 0], [A, b], [A, B - b], [A - b, B], [b, B], [0, B - b], [0, b]]
    : [[0, 0], [A, 0], [A, B], [0, B]];
  const unit = (k) => { const v = [0, 0, 0]; v[k] = 1; return v; };
  return prismGeo(T, prof, { origin: lo, axP: unit(ia), axQ: unit(ib), dir: unit(ax), length: sz[ax], smooth: 0 });
}
