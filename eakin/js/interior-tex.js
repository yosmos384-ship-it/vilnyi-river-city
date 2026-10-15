// interior-tex.js — procedural PBR texture synthesis for the INTERIOR module (V2 luxury).
// Every texture is computed in JS arrays (tileable value-noise fBm, domain warping) and written to canvases:
//   map (sRGB albedo), normal (tangent space, from the height field via a wrapped Sobel filter), rough (G = roughness, B = metalness).
// No side effects at import. Safe in Node fakes (createImageData / putImageData only).
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hexRGB = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// ------------------------------------------------------------------ noise
export function makeNoise(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const p = new Uint8Array(512), g = new Float32Array(256);
  const a = []; for (let i = 0; i < 256; i++) { a.push(i); g[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  // periodic 2D value noise (period Px, Py: positive integers) — hot path, kept monomorphic and allocation-free
  function n2(x, y, Px, Py) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    let X0 = xi % Px; if (X0 < 0) X0 += Px; let Y0 = yi % Py; if (Y0 < 0) Y0 += Py;
    let X1 = X0 + 1; if (X1 >= Px) X1 = 0; let Y1 = Y0 + 1; if (Y1 >= Py) Y1 = 0;
    const a = p[X0 & 255], b = p[X1 & 255], y0 = Y0 & 255, y1 = Y1 & 255;
    const v00 = g[p[a + y0]], v10 = g[p[b + y0]], v01 = g[p[a + y1]], v11 = g[p[b + y1]];
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const t0 = v00 + (v10 - v00) * u, t1 = v01 + (v11 - v01) * u;
    return t0 + (t1 - t0) * v;
  }
  function fbm(x, y, Px, Py, oct, gain) {
    if (Py === undefined) Py = Px; if (oct === undefined) oct = 4; if (gain === undefined) gain = 0.5;
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { sum += amp * n2(x * f, y * f, Px * f, Py * f); norm += amp; amp *= gain; f *= 2; }
    return sum / norm;
  }
  // ridged: 1 at the "creases"
  const ridge = (x, y, Px, Py) => 1 - Math.abs(n2(x, y, Px, Py === undefined ? Px : Py) * 2 - 1);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  // non-periodic 3D value noise (for geometry displacement)
  const H3 = (X, Y, Z) => g[p[p[p[X & 255] + (Y & 255)] + (Z & 255)]];
  function n3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const a0 = mix(mix(H3(xi, yi, zi), H3(xi + 1, yi, zi), u), mix(H3(xi, yi + 1, zi), H3(xi + 1, yi + 1, zi), u), v);
    const a1 = mix(mix(H3(xi, yi, zi + 1), H3(xi + 1, yi, zi + 1), u), mix(H3(xi, yi + 1, zi + 1), H3(xi + 1, yi + 1, zi + 1), u), v);
    return mix(a0, a1, w);
  }
  const f3 = (x, y, z, oct = 3) => { let s2 = 0, a2 = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { s2 += a2 * n3(x * f, y * f, z * f); n += a2; a2 *= 0.5; f *= 2.03; } return s2 / n; };
  return { n2, fbm, ridge, n3, f3, rnd: r };
}

// ------------------------------------------------------------------ canvas plumbing
function canvasOf(w, h, data) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  try {
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    if (img && img.data && img.data.set) { img.data.set(data); g.putImageData(img, 0, 0); }
  } catch (e) { /* headless fallback: blank canvas */ }
  return c;
}
function texOf(c, srgb, o = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (o.wrap !== false) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  else { t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
  t.anisotropy = o.aniso || 8;
  t.needsUpdate = true;
  return t;
}

/** Sobel normal map from a height field (wrapped). strength ≈ height units → slope per pixel. */
export function normalFromHeight(hgt, w, h, strength = 2, wrap = true) {
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = x < 0 ? 0 : x >= w ? w - 1 : x; y = y < 0 ? 0 : y >= h ? h - 1 : y; }
    return hgt[y * w + x];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1), l = at(x - 1, y), r = at(x + 1, y), bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
    const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
    const dy = (bl + 2 * b + br) - (tl + 2 * t + tr); // canvas y grows downward == -v
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const i = (y * w + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}

/** synthesize a PBR set. fn(u, v, o) fills o.r,o.g,o.b (0..1 sRGB), o.h (height), o.ro (roughness 0..1), o.me (metalness) */
export function synth(w, h, fn, opt = {}) {
  const N = w * h, col = new Uint8ClampedArray(N * 4), hgt = new Float32Array(N), rg = new Uint8ClampedArray(N * 4);
  const o = { r: 1, g: 1, b: 1, h: 0, ro: 0.5, me: 0 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    o.r = o.g = o.b = 1; o.h = 0; o.ro = 0.5; o.me = 0;
    fn((x + 0.5) / w, (y + 0.5) / h, o);
    const i = y * w + x, k = i * 4;
    col[k] = clamp01(o.r) * 255; col[k + 1] = clamp01(o.g) * 255; col[k + 2] = clamp01(o.b) * 255; col[k + 3] = 255;
    hgt[i] = o.h;
    rg[k] = 255; rg[k + 1] = clamp01(o.ro) * 255; rg[k + 2] = clamp01(o.me) * 255; rg[k + 3] = 255;
  }
  const wrap = opt.wrap !== false;
  return {
    map: texOf(canvasOf(w, h, col), true, { wrap }),
    normal: texOf(canvasOf(w, h, normalFromHeight(hgt, w, h, opt.ns || 2, wrap)), false, { wrap }),
    rough: texOf(canvasOf(w, h, rg), false, { wrap, aniso: 4 }),
  };
}

// ------------------------------------------------------------------ material recipes (u, v ∈ [0,1), all tileable)
const NZ = makeNoise(17);

/** periodic low-frequency field precomputed on an N×N grid, sampled bilinearly (speeds up domain warps ~10x) */
function grid(N, fn) {
  const a = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) a[y * N + x] = fn(x / N, y / N);
  return (u, v) => {
    const x = u * N, y = v * N, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    let x0 = xi % N; if (x0 < 0) x0 += N; let y0 = yi % N; if (y0 < 0) y0 += N;
    const x1 = x0 + 1 === N ? 0 : x0 + 1, y1 = y0 + 1 === N ? 0 : y0 + 1;
    const t0 = a[y0 * N + x0] + (a[y0 * N + x1] - a[y0 * N + x0]) * fx, t1 = a[y1 * N + x0] + (a[y1 * N + x1] - a[y1 * N + x0]) * fx;
    return t0 + (t1 - t0) * fy;
  };
}
const lazy = (mk) => { let v = null; return () => v || (v = mk()); };
const MG = lazy(() => {
  const { fbm } = NZ;
  const q1 = grid(128, (u, v) => fbm(u * 3, v * 3, 3, 3, 4)), q2 = grid(128, (u, v) => fbm(u * 3 + 7.3, v * 3 + 2.1, 3, 3, 4));
  return {
    q1, q2,
    w: grid(256, (u, v) => fbm(u * 4 + q1(u, v) * 3.2, v * 4 + q2(u, v) * 3.2, 4, 4, 5)),
    mask: grid(64, (u, v) => fbm(u * 2 + 3.3, v * 2, 2, 2, 3)),
    cloud: grid(128, (u, v) => fbm(u * 5, v * 5, 5, 5, 5)),
    thinW: grid(256, (u, v) => fbm(u * 6 + q2(u, v) * 2, v * 6 + q1(u, v) * 2, 6, 6, 4)),
  };
});
const WG = lazy(() => {
  const { fbm } = NZ;
  return {
    warp: grid(128, (u, v) => fbm(u * 3, v * 1, 3, 1, 4) * 4 + fbm(u * 8, v * 2, 8, 2, 3) * 0.8),
    tone: grid(64, (u, v) => fbm(u * 2 + 1.7, v * 1, 2, 1, 3)),
  };
});
const TG = lazy(() => {
  const { fbm } = NZ;
  return { bandW: grid(128, (u, v) => fbm(u * 2, v * 4, 2, 4, 4)), pitF: grid(256, (u, v) => fbm(u * 6, v * 24, 6, 24, 3)), spec: grid(256, (u, v) => fbm(u * 16, v * 16, 16, 16, 3)) };
});
const RG = lazy(() => ({ abrash: grid(128, (u, v) => NZ.fbm(u * 4, v * 4, 4, 4, 4)) }));

function setRGB(o, c) { o.r = c[0]; o.g = c[1]; o.b = c[2]; }
function lerpRGB(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }

// Calacatta: warm white with soft clouds, bold grey/gold veins + thin hairlines (domain-warped)
const MARBLE_BASE = hexRGB(0xf6f3ee), MARBLE_CLOUD = hexRGB(0xe6e1d9), VEIN = hexRGB(0x7d7770), GOLD = hexRGB(0xb39a74);
export function marbleFn(u, v, o) {
  const G = MG(), q1 = G.q1(u, v), w = G.w(u, v);
  const tA = (u + v * 2) * TAU + w * 9.0;                       // bold diagonal veins
  const tB = (u * 3 - v * 2) * TAU + G.thinW(u, v) * 14 + NZ.n2(u * 64, v * 64, 64, 64) * 0.25;
  const tC = (u * 2 + v * 5) * TAU + w * 22;
  const bold = Math.pow(1 - Math.abs(Math.sin(tA * 0.5)), 9) * smooth(0.35, 0.7, G.mask(u, v));
  const thin = Math.pow(1 - Math.abs(Math.sin(tB * 0.5)), 46) * 0.75;
  const hair = Math.pow(1 - Math.abs(Math.sin(tC * 0.5)), 160) * 0.5;
  const veins = clamp01(bold * 0.95 + thin + hair);
  const cloud = G.cloud(u, v);
  let c = lerpRGB(MARBLE_BASE, MARBLE_CLOUD, smooth(0.35, 0.85, cloud) * 0.8);
  const vc = lerpRGB(VEIN, GOLD, smooth(0.3, 0.8, q1));
  c = lerpRGB(c, vc, veins * 0.88);
  // soft halo of the bold veins
  c = lerpRGB(c, lerpRGB(MARBLE_CLOUD, GOLD, 0.25), Math.pow(1 - Math.abs(Math.sin(tA * 0.5)), 3) * 0.18);
  setRGB(o, c);
  o.h = -veins * 0.25 + cloud * 0.05; o.ro = 0.07 + veins * 0.14 + cloud * 0.03;
}

// brushed metal (streaks along u) — grey, tinted by vertex color
export function brushedFn(u, v, o) {
  const { n2, fbm } = NZ;
  const s = n2(u * 2, v * 256, 2, 256) * 0.6 + n2(u * 6, v * 512, 6, 512) * 0.4;
  const blot = fbm(u * 3, v * 3, 3, 3, 3);
  const g = 0.86 + s * 0.14 - blot * 0.05;
  o.r = o.g = o.b = g; o.h = s; o.ro = 0.22 + s * 0.16 + blot * 0.08; o.me = 1;
}

function woodRecipe(light, dark, streak, ringF, poreT) {
  const L = hexRGB(light), D = hexRGB(dark), S = hexRGB(streak);
  return (u, v, o) => {
    const { n2 } = NZ, G = WG();
    const t = u * ringF + G.warp(u, v);
    const ring = Math.pow(0.5 + 0.5 * Math.sin(t * TAU), 3);
    const fib = n2(u * 160, v * 3, 160, 3);
    const pore = smooth(poreT, poreT + 0.08, n2(u * 220, v * 14, 220, 14)) * (0.6 + 0.4 * ring);
    const tone = G.tone(u, v);
    let c = lerpRGB(L, D, clamp01(ring * 0.55 + fib * 0.25 + (tone - 0.5) * 0.5));
    c = lerpRGB(c, S, smooth(0.55, 0.8, tone) * 0.35);
    c = lerpRGB(c, D, pore * 0.55);
    setRGB(o, c);
    o.h = -pore * 0.7 - ring * 0.2 + fib * 0.15; o.ro = 0.42 + pore * 0.35 + ring * 0.08;
  };
}
export const oakFn = woodRecipe(0xd2ad7c, 0x9c7547, 0xe3c597, 9, 0.8);
export const walnutFn = woodRecipe(0x7a5639, 0x3c281b, 0x9b7351, 7, 0.78);

// honed travertine: horizontal bands + elongated pits
const TRA_A = hexRGB(0xe2d2b6), TRA_B = hexRGB(0xcdb592), TRA_P = hexRGB(0x9a8162);
export function travertineFn(u, v, o) {
  const { n2 } = NZ, G = TG();
  const t = v * 9 + G.bandW(u, v) * 2.4;
  const band = 0.5 + 0.5 * Math.sin(t * TAU);
  const pit = smooth(0.7, 0.8, n2(u * 18, v * 70, 18, 70) * 0.65 + G.pitF(u, v) * 0.35);
  const spec = G.spec(u, v);
  let c = lerpRGB(TRA_A, TRA_B, band * 0.6 + (spec - 0.5) * 0.4);
  c = lerpRGB(c, TRA_P, pit * 0.85);
  setRGB(o, c);
  o.h = -pit * 0.9 + spec * 0.08; o.ro = 0.5 + pit * 0.35 + spec * 0.08;
}

// bouclé: dense curly loops
export function boucleFn(u, v, o) {
  const { n2, ridge } = NZ;
  const a = n2(u * 46, v * 46, 46, 46), b = ridge(u * 90 + a * 1.5, v * 90 - a * 1.5, 90, 90), c = n2(u * 140, v * 140, 140, 140);
  const hgt = a * 0.5 + b * 0.4 + c * 0.25;
  const g = 0.8 + hgt * 0.17;
  o.r = g; o.g = g * 0.995; o.b = g * 0.975; o.h = hgt; o.ro = 0.95;
}

// linen: plain weave with slubs
export function linenFn(u, v, o) {
  const { n2 } = NZ;
  const N = 80;
  const iu = Math.floor(u * N), iv = Math.floor(v * N);
  const fu = u * N - iu, fv = v * N - iv;
  const slubU = n2(u * N, v * 3, N, 3), slubV = n2(u * 3, v * N, 3, N);
  const warp = Math.sin(fu * Math.PI) * (0.75 + slubU * 0.5), weft = Math.sin(fv * Math.PI) * (0.75 + slubV * 0.5);
  const top = (iu + iv) & 1 ? warp : weft;
  const hgt = top * 0.8 + Math.max(warp, weft) * 0.2;
  const tone = 0.86 + (slubU + slubV) * 0.06 + hgt * 0.06 - n2(u * 7, v * 7, 7, 7) * 0.04;
  o.r = tone; o.g = tone * 0.99; o.b = tone * 0.965; o.h = hgt; o.ro = 0.9;
}

// leather: pebble grain + creases
export function leatherFn(u, v, o) {
  const { n2, ridge, fbm } = NZ;
  const cell = n2(u * 70, v * 70, 70, 70), crease = Math.pow(ridge(u * 24, v * 24, 24, 24), 6), wear = fbm(u * 4, v * 4, 4, 4, 4);
  const g = 0.86 + cell * 0.1 - crease * 0.22 + (wear - 0.5) * 0.18;
  o.r = g; o.g = g; o.b = g; o.h = cell * 0.5 - crease * 0.6; o.ro = 0.42 + crease * 0.2 - wear * 0.12;
}

// velvet / wool flannel: soft mottling
export function velvetFn(u, v, o) {
  const { n2, fbm } = NZ;
  const m = fbm(u * 6, v * 6, 6, 6, 4), f = n2(u * 128, v * 128, 128, 128);
  const g = 0.86 + (m - 0.5) * 0.18 + f * 0.04;
  o.r = o.g = o.b = g; o.h = f * 0.3 + m * 0.2; o.ro = 0.85;
}

// glazed ceramic: glaze ripples + iron speckles
export function ceramicFn(u, v, o) {
  const { n2, fbm } = NZ;
  const rip = fbm(u * 5, v * 5, 5, 5, 4), sp = smooth(0.86, 0.9, n2(u * 180, v * 180, 180, 180));
  const g = 0.96 - sp * 0.55 + (rip - 0.5) * 0.06;
  o.r = g; o.g = g * 0.985; o.b = g * 0.96; o.h = rip * 0.6 - sp * 0.2; o.ro = 0.22 + rip * 0.12;
}

// terracotta / clay
export function clayFn(u, v, o) {
  const { n2, fbm } = NZ;
  const m = fbm(u * 6, v * 6, 6, 6, 5), g2 = n2(u * 150, v * 150, 150, 150);
  const g = 0.82 + (m - 0.5) * 0.3 + g2 * 0.08;
  o.r = g; o.g = g * 0.97; o.b = g * 0.95; o.h = g2 * 0.4 + m * 0.3; o.ro = 0.85;
}

// terry towel loops
export function terryFn(u, v, o) {
  const { n2, ridge } = NZ;
  const a = ridge(u * 70, v * 70, 70, 70), b = n2(u * 140, v * 140, 140, 140);
  const hgt = a * 0.6 + b * 0.4;
  const g = 0.85 + hgt * 0.14;
  o.r = o.g = o.b = g; o.h = hgt; o.ro = 0.97;
}

// chunky knit (throws)
export function knitFn(u, v, o) {
  const { n2 } = NZ;
  const x = u * 14, y = v * 22, fx = x - Math.floor(x) - 0.5;
  const vee = Math.sin(((y + Math.abs(fx) * 1.4) % 1) * Math.PI);
  const col = Math.sin((fx + 0.5) * Math.PI);
  const hgt = vee * col + n2(u * 120, v * 120, 120, 120) * 0.15;
  const g = 0.78 + hgt * 0.2;
  o.r = o.g = o.b = g; o.h = hgt; o.ro = 0.95;
}

// wool rug (NOT tiled — whole rug): border bands + soft abstract lattice + pile
export function rugFn(u, v, o) {
  const { n2 } = NZ;
  const ex = Math.min(u, 1 - u), ey = Math.min(v, 1 - v), e = Math.min(ex, ey);
  const border = smooth(0.045, 0.05, e) * (1 - smooth(0.075, 0.08, e));
  const lat = Math.abs(((u * 7 + v * 5) % 1) - 0.5) + Math.abs(((u * 7 - v * 5 + 10) % 1) - 0.5);
  const lattice = smooth(0.42, 0.48, lat) * (1 - smooth(0.52, 0.58, lat)) * smooth(0.1, 0.14, e);
  const abrash = RG().abrash(u, v);
  const pile = n2(u * 300, v * 300, 300, 300);
  const g = 0.93 - border * 0.28 - lattice * 0.12 + (abrash - 0.5) * 0.08 + pile * 0.04;
  o.r = g; o.g = g * 0.99; o.b = g * 0.97; o.h = pile * 0.7 - lattice * 0.3 - border * 0.2; o.ro = 0.98;
}

// felt (pool cloth)
export function feltFn(u, v, o) {
  const { n2, fbm } = NZ;
  const f = n2(u * 200, v * 200, 200, 200), m = fbm(u * 5, v * 5, 5, 5, 3);
  const g = 0.9 + f * 0.08 + (m - 0.5) * 0.06;
  o.r = o.g = o.b = g; o.h = f * 0.4; o.ro = 0.95;
}

// plaster/limewash for decorative pieces (lamp shades, hood)
export function plasterFn(u, v, o) {
  const { fbm } = NZ;
  const m = fbm(u * 5, v * 5, 5, 5, 5), d = fbm(u * 24, v * 24, 24, 24, 3);
  const g = 0.93 + (m - 0.5) * 0.1 + (d - 0.5) * 0.04;
  o.r = g; o.g = g * 0.99; o.b = g * 0.97; o.h = m * 0.6 + d * 0.3; o.ro = 0.88;
}

// ------------------------------------------------------------------ painterly abstract art atlas (4 x 2 cells of 256) + impasto normal
export function paintingAtlas(small) {
  const W = small ? 512 : 1024, Hh = W / 2, C = W / 4;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  const R = makeNoise(31).rnd;
  const pals = [
    ['#efe8dc', '#c9a27e', '#7d6b5d', '#e3d3bf', '#2f2b28'],
    ['#ece6dd', '#3b4a54', '#8aa0ad', '#d8cfc2', '#b98b5e'],
    ['#f1ece3', '#a0522d', '#d9b99b', '#5e4b3c', '#efe0c9'],
    ['#e9e4dc', '#56624f', '#a3ac92', '#d6cdb9', '#2e2f2a'],
    ['#f2eee8', '#1f2a33', '#c6b39a', '#e8dccb', '#8c7a66'],
    ['#efe7dc', '#b4643c', '#e2b48a', '#3c3b38', '#f3e6d4'],
    ['#ebe7e1', '#7c8c8f', '#c4c9c4', '#38403f', '#e3d9c6'],
    ['#f3ede4', '#8b6f4e', '#d1b48e', '#2b2622', '#efe3d0'],
  ];
  try {
    for (let k = 0; k < 8; k++) {
      const ox = (k % 4) * C, oy = (k >> 2) * C, p = pals[k];
      g.save(); g.beginPath(); g.rect(ox, oy, C, C); g.clip();
      g.fillStyle = p[0]; g.fillRect(ox, oy, C, C);
      // large organic shapes
      for (let i = 0; i < 5; i++) {
        g.globalAlpha = 0.75 + R() * 0.25; g.fillStyle = p[1 + (i % 4)];
        g.beginPath();
        const cx = ox + C * (0.2 + R() * 0.6), cy = oy + C * (0.2 + R() * 0.6), rr = C * (0.12 + R() * 0.28);
        for (let a = 0; a <= 24; a++) { const an = a / 24 * TAU, rad = rr * (0.75 + 0.35 * Math.sin(an * 2 + i) + R() * 0.08); const x = cx + Math.cos(an) * rad, y = cy + Math.sin(an) * rad * (0.7 + (k % 3) * 0.2); if (a) g.lineTo(x, y); else g.moveTo(x, y); }
        g.closePath(); g.fill();
      }
      // gestural strokes
      g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        g.globalAlpha = 0.55 + R() * 0.4; g.strokeStyle = p[1 + ((i + 2) % 4)]; g.lineWidth = C * (0.015 + R() * 0.05);
        g.beginPath(); g.moveTo(ox + R() * C, oy + R() * C);
        g.bezierCurveTo(ox + R() * C, oy + R() * C, ox + R() * C, oy + R() * C, ox + R() * C, oy + R() * C); g.stroke();
      }
      // dry-brush texture
      g.globalAlpha = 0.07;
      for (let i = 0; i < 260; i++) { g.fillStyle = R() < 0.5 ? '#000' : '#fff'; g.fillRect(ox + R() * C, oy + R() * C, 1 + R() * 10, 1 + R() * 2); }
      g.globalAlpha = 1; g.restore();
    }
  } catch (e) { /* headless */ }
  const map = texOf(c, true, { wrap: false });
  // impasto normal from luminance (browser only)
  let normal = null;
  try {
    const id = g.getImageData(0, 0, W, Hh);
    if (id && id.data) {
      const d = id.data, hgt = new Float32Array(W * Hh), nz = makeNoise(5);
      for (let i = 0; i < W * Hh; i++) { const x = i % W, y = (i / W) | 0; hgt[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255 * 0.6 + nz.n2(x * 0.5, y * 0.5, W / 2, Hh / 2) * 0.25; }
      normal = texOf(canvasOf(W, Hh, normalFromHeight(hgt, W, Hh, 1.2, false)), false, { wrap: false });
    }
  } catch (e) { normal = null; }
  return { map, normal };
}

// ------------------------------------------------------------------ material slot atlas (G = roughness, B = metalness), 8 x 1 texels
// slots: 0 satin paint, 1 brushed brass, 2 polished chrome/brass, 3 matte paint, 4 gloss lacquer/ceramic, 5 black satin metal, 6 rubber, 7 aged brass
export const SLOTS = 8;
export const SLOT = { paint: 0, brass: 1, chrome: 2, matte: 3, gloss: 4, blackMetal: 5, rubber: 6, aged: 7 };
export function slotAtlas() {
  const vals = [[0.42, 0], [0.3, 1], [0.12, 1], [0.82, 0], [0.1, 0], [0.42, 0.85], [0.9, 0], [0.45, 1]];
  const data = new Uint8ClampedArray(SLOTS * 4);
  vals.forEach(([ro, me], i) => { data[i * 4] = 255; data[i * 4 + 1] = ro * 255; data[i * 4 + 2] = me * 255; data[i * 4 + 3] = 255; });
  const t = texOf(canvasOf(SLOTS, 1, data), false, { wrap: false, aniso: 1 });
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
