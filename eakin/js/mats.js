// mats.js — procedural PBR texture / material library (owner: STRUCTURE bot). V2 "luxury, photoreal".
// No side effects on import. All textures are generated at build time (canvas, or DataTexture when no canvas exists).
//
// UV CONVENTION: textured materials expect UVs IN METERS (1 UV unit = 1 m). Each texture's .repeat =
// 1 / (real-world size of one texture tile in meters). house.js writes world-scaled UVs on all its geometry.
// On geometry with default 0..1 UVs either scale the geometry UVs to meters (worldUV() below) or clone the
// material + textures and set .repeat yourself.
//
// Every textured material gets: color map (sRGB, with baked cavity/AO darkening), a tangent-space normal map derived
// from a height field (Sobel → normal; OpenGL / three.js convention, +Y = +V), and a roughness map (linear).
// makeMaterials() is cached per (THREE, quality): calling it from several modules returns the SAME object (no double
// texture generation). Old (V1) material names still exist as aliases of the new luxury materials (see ALIASES).
//
// Exports: rand, noiseField, worldUV, canvasTexture, makeNormalFromHeight, normalPixelsFromHeight, textureFromPixels,
//          makeMaterials (default), ALIASES, MATERIAL_INFO.

/* ------------------------------------------------------------------ seeded random */
export function rand(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// integer hash → [0,1)
function hash3(i, j, k) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function makeCanvas(w, h) {
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
  } catch (_) {}
  try { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); } catch (_) {}
  return null;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);

/**
 * canvasTexture(THREE, w, h, drawFn(g2d, w, h), {repeat:[rx,ry]|number, srgb:true, anisotropy:8, wrap:true})
 * (kept from V1) Returns a THREE.CanvasTexture (RepeatWrapping, mipmaps).
 */
export function canvasTexture(THREE, w, h, drawFn, opts = {}) {
  const { repeat = [1, 1], srgb = true, anisotropy = 8, wrap = true } = opts;
  const c = makeCanvas(w, h);
  let tex;
  if (c) {
    const g = c.getContext('2d');
    try { if (g) drawFn(g, w, h); } catch (e) { console.warn('[mats] draw failed', e); }
    tex = new THREE.CanvasTexture(c);
  } else {
    tex = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
  }
  if (wrap) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
  const r = Array.isArray(repeat) ? repeat : [repeat, repeat];
  tex.repeat.set(r[0], r[1]);
  tex.anisotropy = anisotropy;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * textureFromPixels(THREE, rgba(Uint8ClampedArray|Uint8Array, w*h*4), w, h, {srgb, repeat, anisotropy})
 * Row 0 = TOP of the image (= high V), as on a canvas. Uses a canvas when available (CanvasTexture), else a
 * DataTexture with flipY so orientation is identical.
 */
export function textureFromPixels(THREE, rgba, w, h, opts = {}) {
  const { srgb = true, repeat = [1, 1], anisotropy = 8 } = opts;
  let tex = null;
  const c = makeCanvas(w, h);
  if (c) {
    try {
      const g = c.getContext('2d');
      const img = g.createImageData(w, h);
      img.data.set(rgba);
      g.putImageData(img, 0, 0);
      tex = new THREE.CanvasTexture(c);
    } catch (e) { tex = null; }
  }
  if (!tex) {
    tex = new THREE.DataTexture(rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length), w, h);
    tex.flipY = true;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
  }
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  const r = Array.isArray(repeat) ? repeat : [repeat, repeat];
  tex.repeat.set(r[0], r[1]);
  tex.anisotropy = anisotropy;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ noise */
/**
 * noiseField(w, h, rnd, octaves=4, base=8, baseY=base) → Float32Array w*h in [0,1], tileable.
 * base/baseY = number of value-noise cells across the tile on the first octave (x / y). Anisotropic when they differ.
 */
export function noiseField(w, h, rnd, octaves = 4, base = 8, baseY) {
  const by = baseY || base;
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const cx = Math.max(1, Math.round(base * (1 << o))), cy = Math.max(1, Math.round(by * (1 << o)));
    const grid = new Float32Array(cx * cy);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    const X0 = new Int32Array(w), X1 = new Int32Array(w), SX = new Float32Array(w);
    for (let x = 0; x < w; x++) { const gx = (x / w) * cx, x0 = Math.floor(gx), f = gx - x0; X0[x] = x0 % cx; X1[x] = (x0 + 1) % cx; SX[x] = f * f * (3 - 2 * f); }
    for (let y = 0; y < h; y++) {
      const gy = (y / h) * cy, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      const r0 = (y0 % cy) * cx, r1 = ((y0 + 1) % cy) * cx, row = y * w;
      for (let x = 0; x < w; x++) {
        const sx = SX[x];
        const a = grid[r0 + X0[x]], b = grid[r0 + X1[x]], c = grid[r1 + X0[x]], d = grid[r1 + X1[x]];
        const top = a + (b - a) * sx, bot = c + (d - c) * sx;
        out[row + x] += amp * (top + (bot - top) * sy);
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
// bilinear wrap sample of a field (fw x fh) at field pixel coords (float)
function samp(f, fw, fh, x, y) {
  if (x < 0 || x >= fw) x -= Math.floor(x / fw) * fw;
  if (y < 0 || y >= fh) y -= Math.floor(y / fh) * fh;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const x1 = x0 + 1 === fw ? 0 : x0 + 1, y1 = y0 + 1 === fh ? 0 : y0 + 1;
  const a = f[y0 * fw + x0], b = f[y0 * fw + x1], c = f[y1 * fw + x0], d = f[y1 * fw + x1];
  const t = a + (b - a) * fx, bt = c + (d - c) * fx;
  return t + (bt - t) * fy;
}
// tileable Worley F1 / F2 (cells x cells jittered points) → {f1, f2} Float32Arrays (distance in cell units)
function worley(w, h, cells, rnd) {
  const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) { px[i] = rnd(); py[i] = rnd(); }
  const f1 = new Float32Array(w * h), f2 = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = (y / h) * cells, cy = Math.floor(gy);
    for (let x = 0; x < w; x++) {
      const gx = (x / w) * cells, cx = Math.floor(gx);
      let d1 = 9, d2 = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const ci = (cx + i + cells) % cells, cj = (cy + j + cells) % cells, k = cj * cells + ci;
        const dx = cx + i + px[k] - gx, dy = cy + j + py[k] - gy, d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      f1[y * w + x] = Math.sqrt(d1); f2[y * w + x] = Math.sqrt(d2);
    }
  }
  return { f1, f2 };
}
// separable wrap box blur (radius r px), n passes
function blurWrap(src, w, h, r, passes = 2) {
  let a = Float32Array.from(src); const b = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  const wr = (i, n) => (i < 0 ? i + n : i >= n ? i - n : i);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w; let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + wr(k, w)];
      for (let x = 0; x < w; x++) { b[row + x] = s * inv; s += a[row + wr(x + r + 1, w)] - a[row + wr(x - r, w)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += b[wr(k, h) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s * inv; s += b[wr(y + r + 1, h) * w + x] - b[wr(y - r, h) * w + x]; }
    }
  }
  return a;
}

/* ------------------------------------------------------------------ normal maps */
/**
 * normalPixelsFromHeight(height(Float32Array 0..1), w, h, strength, {wrap=true, strengthV}) → Uint8ClampedArray RGBA
 * Sobel gradient. strength = (meters of full 0..1 height range) / (meters per texel) — i.e. slope per unit height step
 * per pixel. Rows are top-down (canvas order, row 0 = high V).
 */
export function normalPixelsFromHeight(height, w, h, strength = 2, opts = {}) {
  const wrap = opts.wrap !== false;
  const sU = strength, sV = opts.strengthV != null ? opts.strengthV : strength;
  const out = new Uint8ClampedArray(w * h * 4);
  const XM = new Int32Array(w), XP = new Int32Array(w);
  for (let x = 0; x < w; x++) { XM[x] = wrap ? (x - 1 + w) % w : Math.max(0, x - 1); XP[x] = wrap ? (x + 1) % w : Math.min(w - 1, x + 1); }
  const H = height;
  for (let y = 0; y < h; y++) {
    const rm = (wrap ? (y - 1 + h) % h : Math.max(0, y - 1)) * w, r0 = y * w, rp = (wrap ? (y + 1) % h : Math.min(h - 1, y + 1)) * w;
    for (let x = 0; x < w; x++) {
      const xm = XM[x], xp = XP[x];
      const tl = H[rm + xm], t = H[rm + x], tr = H[rm + xp];
      const l = H[r0 + xm], r = H[r0 + xp];
      const bl = H[rp + xm], b = H[rp + x], br = H[rp + xp];
      const dx = ((tr + 2 * r + br) - (tl + 2 * l + bl)) * 0.125;   // dh per pixel toward +u
      const dyc = ((bl + 2 * b + br) - (tl + 2 * t + tr)) * 0.125;  // dh per pixel toward canvas-down (= -v)
      const nx = -dx * sU, ny = dyc * sV;                            // n = (-dh/du, -dh/dv, 1), dh/dv = -dyc
      const il = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (r0 + x) * 4;
      out[i] = nx * il + 127.5; out[i + 1] = ny * il + 127.5; out[i + 2] = il + 127.5; out[i + 3] = 255;
    }
  }
  return out;
}
/**
 * makeNormalFromHeight(THREE, heightSource, opts) → THREE texture (NoColorSpace, RepeatWrapping) usable as normalMap.
 *  heightSource: {data: Float32Array(0..1), width, height} | HTMLCanvasElement/OffscreenCanvas (luminance = height) |
 *                Float32Array (then pass opts.width/opts.height)
 *  opts: {strength=2, repeat=[1,1], depth (m), texel (m/px) → strength = depth/texel when both given}
 * Also callable as makeNormalFromHeight(THREE, float32, w, h, opts).
 */
export function makeNormalFromHeight(THREE, src, a, b, c) {
  let opts = a || {}, data = null, w = 0, h = 0;
  if (typeof a === 'number') { w = a; h = b; opts = c || {}; data = src; }
  else if (src && src.data && src.width) { data = src.data; w = src.width; h = src.height; }
  else if (src && (src instanceof Float32Array)) { data = src; w = opts.width; h = opts.height; }
  else if (src && src.getContext) {
    try {
      w = src.width; h = src.height;
      const g = src.getContext('2d', { willReadFrequently: true });
      const px = g.getImageData(0, 0, w, h).data;
      data = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) data[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
    } catch (_) { data = null; }
  }
  if (!data || !(w > 0) || !(h > 0)) return null;
  let strength = opts.strength != null ? opts.strength : 2;
  if (opts.depth != null && opts.texel) strength = opts.depth / opts.texel;
  const px = normalPixelsFromHeight(data, w, h, strength, opts);
  return textureFromPixels(THREE, px, w, h, { srgb: false, repeat: opts.repeat || [1, 1] });
}

/**
 * finish(THREE, spec) → {map, normalMap, roughnessMap}
 * spec: {w, h, col: Float32Array(n*3) sRGB 0..255, hgt: Float32Array 0..1, rgh: Float32Array 0..1, tile:[mU,mV],
 *        depth: meters of the 0..1 height range, cavity: darkening amount, cavityR: blur radius px, offset:[ou,ov]}
 */
function finish(THREE, s) {
  const { w, h, col, hgt, rgh } = s, n = w * h;
  const rep = [1 / s.tile[0], 1 / s.tile[1]];
  const out = {};
  // cavity / AO-ish darkening from the height field
  if (hgt && s.cavity) {
    const bl = blurWrap(hgt, w, h, s.cavityR || 3, 2);
    const k = s.cavity;
    for (let i = 0; i < n; i++) {
      const d = hgt[i] - bl[i];
      const m = d < 0 ? 1 + d * k : 1 + d * k * 0.25;
      const mm = clamp(m, 0.35, 1.12);
      col[i * 3] *= mm; col[i * 3 + 1] *= mm; col[i * 3 + 2] *= mm;
    }
  }
  const cpx = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { cpx[i * 4] = col[i * 3]; cpx[i * 4 + 1] = col[i * 3 + 1]; cpx[i * 4 + 2] = col[i * 3 + 2]; cpx[i * 4 + 3] = 255; }
  out.map = textureFromPixels(THREE, cpx, w, h, { srgb: true, repeat: rep });
  if (hgt && s.depth) {
    const tu = s.tile[0] / w, tv = s.tile[1] / h;
    const npx = normalPixelsFromHeight(hgt, w, h, s.depth / tu, { strengthV: s.depth / tv });
    out.normalMap = textureFromPixels(THREE, npx, w, h, { srgb: false, repeat: rep });
  }
  if (rgh) {
    const rpx = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { const v = clamp01(rgh[i]) * 255; rpx[i * 4] = v; rpx[i * 4 + 1] = v; rpx[i * 4 + 2] = v; rpx[i * 4 + 3] = 255; }
    out.roughnessMap = textureFromPixels(THREE, rpx, w, h, { srgb: false, repeat: rep });
  }
  if (s.offset) for (const t of [out.map, out.normalMap, out.roughnessMap]) if (t) t.offset.set(s.offset[0], s.offset[1]);
  return out;
}
function buffers(w, h) { const n = w * h; return { w, h, col: new Float32Array(n * 3), hgt: new Float32Array(n), rgh: new Float32Array(n) }; }
const put = (B, i, r, g, b) => { B.col[i * 3] = r; B.col[i * 3 + 1] = g; B.col[i * 3 + 2] = b; };

/* ------------------------------------------------------------------ wood */
// Shared wood-grain kernel. Fields are generated once per palette+size.
const KITS = new Map();
function woodKit(S, seed) {
  const N = Math.min(512, S);
  const key = 'wood' + N;
  if (KITS.has(key)) return KITS.get(key);
  seed = 11;
  const kit = {
    N,
    streak: noiseField(N, N, rand(seed + 1), 3, 3, 72),    // long streaks along x
    pores: noiseField(N, N, rand(seed + 2), 2, 24, 320),   // elongated pore flecks
    warp: noiseField(N, N, rand(seed + 3), 3, 2, 3),       // low-frequency ring warp
    tone: noiseField(N, N, rand(seed + 4), 3, 3, 6),       // broad tone
  };
  KITS.set(key, kit);
  return kit;
}
/**
 * wood(K, along, across, pid, pal, out) — along/across in meters within a board; pid in [0,1) board random.
 * Writes out[0..2]=rgb (sRGB 0..255), out[3]=height(0..1), out[4]=roughness.
 */
function woodSample(K, along, across, pid, pal, out) {
  const N = K.N;
  const ao = along + pid * 37.3, co = across + pid * 11.7;
  const st = samp(K.streak, N, N, ao * (N / 2.4), co * (N / 0.32));
  const po = samp(K.pores, N, N, ao * (N / 1.6), co * (N / 0.4));
  const wp = samp(K.warp, N, N, ao * (N / 3.0), co * (N / 1.2));
  const tn = samp(K.tone, N, N, ao * (N / 2.0), co * (N / 0.9));
  // flat-sawn "cathedral" rings: parabola along the board + warp
  const spacing = pal.ring * (0.7 + 0.6 * fract(pid * 7.13));
  const cath = pal.cath * (fract(pid * 3.7) - 0.5);
  const am = (along % 1.6) - 0.8;
  const t = (across + cath * am * am + (wp - 0.5) * 0.05) / spacing;
  const e = fract(t);
  const e2 = e * e, late = e2 * e2 * e * (e > 0.93 ? 1 - smooth(0.93, 1, e) : 1) + (e < 0.06 ? (1 - smooth(0, 0.06, e)) * 0.4 : 0);
  const pore = po <= 0.62 ? 0 : smooth(0.62, 0.78, po);
  const k = (st - 0.5) * pal.streakAmt + late * pal.ringAmt + pore * pal.poreAmt + (tn - 0.5) * pal.toneAmt;
  const bt = pal.boardVar * (fract(pid * 13.37) - 0.5);
  const L = 1 - k + bt;
  const wt = clamp01(0.5 + (fract(pid * 5.1) - 0.5) * pal.hueVar + (tn - 0.5));
  out[0] = clamp(lerp(pal.a[0], pal.b[0], wt) * L, 0, 255);
  out[1] = clamp(lerp(pal.a[1], pal.b[1], wt) * L, 0, 255);
  out[2] = clamp(lerp(pal.a[2], pal.b[2], wt) * L, 0, 255);
  out[3] = 0.6 + (st - 0.5) * 0.06 - late * 0.05 - pore * 0.12;
  out[4] = pal.rough + pore * 0.12 + (st - 0.5) * 0.06;
  return out;
}
const OAK_PAL = { a: [214, 178, 134], b: [192, 150, 104], ring: 0.006, cath: 0.03, streakAmt: 0.16, ringAmt: 0.12, poreAmt: 0.14, toneAmt: 0.10, boardVar: 0.12, hueVar: 0.8, rough: 0.5 };
const WALNUT_PAL = { a: [112, 76, 52], b: [86, 58, 40], ring: 0.007, cath: 0.05, streakAmt: 0.28, ringAmt: 0.2, poreAmt: 0.18, toneAmt: 0.2, boardVar: 0.16, hueVar: 0.7, rough: 0.42 };
const CEDAR_PAL = { a: [196, 128, 84], b: [168, 102, 64], ring: 0.005, cath: 0.04, streakAmt: 0.22, ringAmt: 0.16, poreAmt: 0.06, toneAmt: 0.18, boardVar: 0.22, hueVar: 1.2, rough: 0.6 };

// micro-bevel profile: height 1 inside, falls to 0 at the board edge over `bev` meters (rounded)
const bevelH = (d, bev) => (d >= bev ? 1 : Math.sqrt(clamp01(d / bev)));

function genHerringbone(THREE, S, seed, opts = {}) {
  const w = opts.width || 0.10, k = opts.k || 6;          // plank 0.10 x 0.60 m
  const tile = Math.SQRT2 * k * w;                        // 0.8485 m: k*√2w along one axis, √2*k*w along the other
  const B = buffers(S, S), K = woodKit(S, seed), o = [0, 0, 0, 0, 0];
  const bev = 0.0012, px = tile / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) * px, v = (S - y - 0.5) * px;      // meters (v up)
    // swap so the zig-zag columns run along V (world -z on floors): rotate pattern by +45°
    const X = (v - u) / Math.SQRT2 / w, Y = (u + v) / Math.SQRT2 / w; // pattern coords (plank-width units)
    let along, across, ii, jj, typ;
    const fy = Math.floor(Y), dH = X - fy, jH = Math.floor(dH / (2 * k));
    if (dH - 2 * jH * k <= k) { // horizontal brick H(i=fy+jk, j)
      jj = jH; ii = fy + jH * k; along = dH - 2 * jH * k; across = Y - fy; typ = 0;
    } else {
      const fx = Math.floor(X), D = fx + 1 - Y, jV = Math.floor((D - k) / (2 * k));
      jj = jV; ii = fx - k - jV * k; along = Y - (ii + 1 - k - jV * k); across = X - fx; typ = 1;
    }
    // periodic plank id (texture period ↔ i mod k on one axis, j on the other)
    const im = ((ii % k) + k) % k;
    const pid = hash3(im, typ, seed);
    woodSample(K, along * w + typ * 0.37, across * w, pid, OAK_PAL, o);
    const de = Math.min(along, k - along) * w, dc = Math.min(across, 1 - across) * w;
    const hb = bevelH(Math.min(de, dc), bev);
    const i = y * S + x;
    put(B, i, o[0], o[1], o[2]);
    B.hgt[i] = o[3] * 0.25 + 0.75 * hb;
    B.rgh[i] = o[4] + (1 - hb) * 0.25;
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.0009, cavity: 1.6, cavityR: 2 }));
}

function genWidePlank(THREE, S, seed, opts = {}) {
  const bw = opts.boardW || 0.19, rows = opts.rows || 8, tile = bw * rows; // 1.52 m
  const B = buffers(S, S), K = woodKit(S, seed), o = [0, 0, 0, 0, 0];
  const r0 = rand(seed + 77);
  // per row: random butt-joint positions (1–2 per tile length)
  const ends = [];
  for (let r = 0; r < rows; r++) {
    const a = r0();
    const two = r0() < 0.55;
    ends.push(two ? [a, fract(a + 0.42 + r0() * 0.16)].sort((p, q) => p - q) : [a]);
  }
  const bev = 0.0015, px = tile / S;
  for (let y = 0; y < S; y++) {
    const v = (S - y - 0.5) * px, r = Math.min(rows - 1, Math.floor(v / bw)), across = v - r * bw;
    const E = ends[r];
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S; // 0..1 along the tile
      // which board segment (between consecutive ends, wrapping)
      let seg = 0, start = E[E.length - 1] - 1;
      for (let q = 0; q < E.length; q++) { if (u >= E[q]) { seg = q + 1; start = E[q]; } }
      const nextEnd = seg < E.length ? E[seg] : E[0] + 1;
      const along = (u - start) * tile, toEnd = (nextEnd - u) * tile;
      const pid = hash3(r, seg % E.length, seed);
      woodSample(K, along, across, pid, OAK_PAL, o);
      const d = Math.min(across, bw - across, along, toEnd);
      const hb = bevelH(d, bev);
      const i = y * S + x;
      put(B, i, o[0], o[1], o[2]);
      B.hgt[i] = o[3] * 0.25 + 0.75 * hb;
      B.rgh[i] = o[4] + (1 - hb) * 0.25;
    }
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.0011, cavity: 1.5, cavityR: 2 }));
}

// boards of width bw running along U, no butt joints (solid lumber / T&G); groove = V-groove width (m) or 0
function genBoards(THREE, S, seed, pal, tile, bw, groove, depth) {
  const B = buffers(S, S), K = woodKit(S, seed), o = [0, 0, 0, 0, 0];
  const px = tile / S, rows = Math.max(1, Math.round(tile / bw)), bwe = tile / rows;
  for (let y = 0; y < S; y++) {
    const v = (S - y - 0.5) * px, r = Math.min(rows - 1, Math.floor(v / bwe)), across = v - r * bwe;
    const pid = hash3(r, 3, seed);
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) * px;
      woodSample(K, u, across, pid, pal, o);
      const d = Math.min(across, bwe - across);
      const hb = groove > 0 ? (d >= groove ? 1 : d / groove) : 1;
      const i = y * S + x;
      put(B, i, o[0], o[1], o[2]);
      B.hgt[i] = o[3] * 0.3 + 0.7 * hb;
      B.rgh[i] = o[4] + (1 - hb) * 0.2;
    }
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth, cavity: groove > 0 ? 1.4 : 0.6, cavityR: 2 }));
}

/* ------------------------------------------------------------------ stone */
// Calacatta-style marble field. Returns {col, hgt, rgh} sampler closure over tileable fields (period = 1 tile).
function marbleKit(S, seed, style = 'calacatta') {
  const N = Math.min(512, S);
  const key = 'marble' + N + style + seed;
  if (KITS.has(key)) return KITS.get(key);
  const kit = {
    N, style,
    c1: noiseField(N, N, rand(seed + 1), 5, 3),
    w1: noiseField(N, N, rand(seed + 2), 4, 2),
    w2: noiseField(N, N, rand(seed + 3), 4, 2),
    v1: noiseField(N, N, rand(seed + 4), 5, 2),
    v2: noiseField(N, N, rand(seed + 5), 5, 4),
    st: noiseField(N, N, rand(seed + 6), 3, 3),
    fine: noiseField(N, N, rand(seed + 7), 2, 64),
  };
  KITS.set(key, kit);
  return kit;
}
// u,v in tile units (any real; fields wrap). out: rgb, height, vein amount
function marbleSample(K, u, v, out) {
  const N = K.N;
  const X = u * N, Y = v * N;
  const wa = samp(K.w1, N, N, X, Y), wb = samp(K.w2, N, N, X, Y);
  const fineW = samp(K.v2, N, N, X * 2, Y * 2);
  // family A: bold diagonal veins (2 per tile), meandering
  const wm = samp(K.c1, N, N, X * 2 + 17, Y * 2 + 41);
  const t1 = u + v + (wa - 0.5) * 0.6 + (wm - 0.5) * 0.18 + (fineW - 0.5) * 0.05;
  const d1 = Math.abs(fract(t1) - 0.5);
  const th = samp(K.st, N, N, X + 71, Y + 13);
  const w1 = 0.003 + 0.03 * th * th;
  const core = d1 < w1 * 2 ? (1 - smooth(0, w1 * 1.8, d1)) * (0.6 + 0.4 * (1 - smooth(0, w1 * 0.5, d1))) : 0;
  const halo = d1 < w1 * 4 + 0.05 ? 1 - smooth(0, w1 * 4 + 0.05, d1) : 0;
  // family B: thinner branches at another angle, present only in patches
  const t2 = 2 * u - v + (wb - 0.5) * 0.8 + (wm - 0.5) * 0.2;
  const d2 = Math.abs(fract(t2) - 0.5);
  const m2 = smooth(0.42, 0.62, samp(K.c1, N, N, X * 0.5 + 200, Y * 0.5 + 50));
  const br = d2 < 0.01 ? (1 - smooth(0, 0.0035 + 0.004 * th, d2)) * m2 : 0;
  // fine cracks: contours of a warped field, sparse
  const r = samp(K.v1, N, N, X + (wa - 0.5) * N * 0.5, Y + (wb - 0.5) * N * 0.5);
  const d3 = Math.abs(r - 0.5);
  const m3 = smooth(0.5, 0.7, samp(K.st, N, N, X * 0.8 + 333, Y * 0.8 + 99));
  const cr = d3 < 0.006 ? (1 - smooth(0, 0.0025, d3)) * m3 : 0;
  const cloud = samp(K.c1, N, N, X, Y), fn = samp(K.fine, N, N, X * 2, Y * 2);
  let R = 245, G = 243, Bc = 238;
  const cl = (cloud - 0.5) * 0.05 + (fn - 0.5) * 0.012;
  R *= 1 + cl; G *= 1 + cl; Bc *= 1 + cl * 1.15;
  const gold = halo * (0.18 + 0.2 * th);
  R = lerp(R, 214, gold); G = lerp(G, 196, gold); Bc = lerp(Bc, 158, gold);
  const gray = clamp01(Math.max(core * (0.55 + 0.4 * th), br * 0.65, cr * 0.5));
  R = lerp(R, 92, gray); G = lerp(G, 91, gray); Bc = lerp(Bc, 95, gray);
  out[0] = R; out[1] = G; out[2] = Bc;
  out[3] = 0.5 - gray * 0.08 + (fn - 0.5) * 0.04;
  out[4] = gray;
  return out;
}

function genMarbleSlab(THREE, S, seed, tile) {
  const B = buffers(S, S), K = marbleKit(S, seed), o = [0, 0, 0, 0, 0];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    marbleSample(K, x / S, y / S, o);
    const i = y * S + x;
    put(B, i, o[0], o[1], o[2]); B.hgt[i] = o[3]; B.rgh[i] = 0.07 + o[4] * 0.06;
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.0002, cavity: 0 }));
}
// large-format tiles cut from marble: tw x th meters, cols x rows in the texture, half offset per row, grout gw meters
function genMarbleTiles(THREE, S, seed, tw, th, cols, rows, gw) {
  const B = buffers(S, S), K = marbleKit(S, seed), o = [0, 0, 0, 0, 0];
  const TU = tw * cols, TV = th * rows, pu = TU / S, pv = TV / S;
  for (let y = 0; y < S; y++) {
    const v = (S - y - 0.5) * pv, r = Math.min(rows - 1, Math.floor(v / th)), lv = v - r * th;
    const off = (r % 2) * 0.5 * tw;
    for (let x = 0; x < S; x++) {
      let u = (x + 0.5) * pu - off; u = ((u % TU) + TU) % TU;
      const c = Math.floor(u / tw), lu = u - c * tw;
      const ti = hash3(c, r, seed);
      // each tile = different patch of the slab (same orientation, like book-cut tiles)
      marbleSample(K, lu / 1.6 + ti * 0.73, lv / 1.6 + fract(ti * 7.1) * 0.81, o);
      const d = Math.min(lu, tw - lu, lv, th - lv);
      const i = y * S + x;
      if (d < gw / 2) { // grout
        put(B, i, 206, 203, 197); B.hgt[i] = 0.1; B.rgh[i] = 0.75;
      } else {
        const hb = bevelH(d - gw / 2, 0.0012);
        const tone = 1 + (fract(ti * 3.3) - 0.5) * 0.025;
        put(B, i, o[0] * tone, o[1] * tone, o[2] * tone); B.hgt[i] = 0.25 + 0.7 * hb + (o[3] - 0.5) * 0.05; B.rgh[i] = 0.1 + o[4] * 0.05 + (1 - hb) * 0.2;
      }
    }
  }
  return finish(THREE, Object.assign(B, { tile: [TU, TV], depth: 0.0015, cavity: 1.2, cavityR: 1 }));
}

/* ------------------------------------------------------------------ generic surfaces */
// fbm noise surface; rgb base, color amount, roughness base/amp, height depth (m)
function genSurface(THREE, S, seed, tile, p) {
  const B = buffers(S, S), n = S * S;
  const f1 = noiseField(S, S, rand(seed), p.oct || 5, p.base || 6);
  const f2 = noiseField(S, S, rand(seed + 11), p.oct2 || 3, p.base2 || 48);
  let wp = null;
  if (p.warp) wp = [noiseField(S, S, rand(seed + 21), 3, 3), noiseField(S, S, rand(seed + 22), 3, 3)];
  const r = rand(seed + 5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    let a = f1[i];
    if (wp) a = samp(f1, S, S, x + (wp[0][i] - 0.5) * S * p.warp, y + (wp[1][i] - 0.5) * S * p.warp);
    const b = f2[i];
    const k = 1 + (a - 0.5) * p.colA + (b - 0.5) * (p.colB != null ? p.colB : p.colA * 0.5);
    put(B, i, p.rgb[0] * k, p.rgb[1] * k, p.rgb[2] * k);
    B.hgt[i] = clamp01(a * (p.hA != null ? p.hA : 0.5) + b * (p.hB != null ? p.hB : 0.5));
    B.rgh[i] = p.rough + (b - 0.5) * p.roughA + (a - 0.5) * (p.roughA2 || 0);
  }
  if (p.speckle) {
    for (let s = 0; s < p.speckle * n / 1000; s++) {
      const x = (r() * S) | 0, y = (r() * S) | 0, i = y * S + x, dark = r() < (p.speckDark != null ? p.speckDark : 0.5);
      const m = dark ? 0.7 + r() * 0.15 : 1.15 + r() * 0.1;
      B.col[i * 3] *= m; B.col[i * 3 + 1] *= m; B.col[i * 3 + 2] *= m;
      if (p.speckPit && dark) B.hgt[i] *= 0.4;
    }
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: p.depth || 0.001, cavity: p.cavity || 0.6, cavityR: p.cavityR || 2 }));
}

function genSiding(THREE, S, seed, opts = {}) {
  const laps = opts.laps || 8, exp = opts.exposure || 0.127, tile = laps * exp;
  const B = buffers(S, S), px = tile / S;
  const gr = noiseField(S, S, rand(seed), 3, 4, 96);    // embossed cedar-mill grain
  const pt = noiseField(S, S, rand(seed + 1), 3, 8);
  const r0 = rand(seed + 2);
  const joints = []; for (let l = 0; l < laps; l++) joints.push(r0() < 0.5 ? r0() : -1);
  for (let y = 0; y < S; y++) {
    const v = (S - y - 0.5) * px, l = Math.min(laps - 1, Math.floor(v / exp)), t = (v - l * exp) / exp; // t: 0 bottom → 1 top
    for (let x = 0; x < S; x++) {
      const i = y * S + x, u = x / S;
      let hh = 0.95 - 0.55 * t;                       // thick at the bottom (butt), thin at the top
      if (t < 0.035) hh *= 0.75 + 0.25 * (t / 0.035); // rounded drip edge
      if (t > 0.97) hh = 0.3;                          // tucked under the lap above
      const jd = joints[l] >= 0 ? Math.abs(u - joints[l]) * tile : 9;
      if (jd < 0.0025) hh -= 0.25;
      const g = gr[i];
      hh += (g - 0.5) * 0.04;
      const k = 1 + (pt[i] - 0.5) * 0.025 + (g - 0.5) * 0.02;
      put(B, i, 240 * k, 239 * k, 234 * k);
      B.hgt[i] = clamp01(hh);
      B.rgh[i] = 0.46 + (g - 0.5) * 0.08 + (pt[i] - 0.5) * 0.06;
    }
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.012, cavity: 0.9, cavityR: 3 }));
}

function genArchShingles(THREE, S, seed, opts = {}) {
  const courses = opts.courses || 8, exp = opts.exposure || 0.143, tile = courses * exp; // 1.144 m
  const B = buffers(S, S), px = tile / S;
  const r0 = rand(seed);
  // per course: list of tab segments [u0,u1) in 0..1 with gap (dragon tooth) widths and tone
  const layout = [];
  for (let c = 0; c < courses; c++) {
    const segs = []; let p = r0() * 0.2; const start = p;
    while (p < start + 1 - 0.06) {
      const wdt = (0.11 + r0() * 0.22) / tile, gap = (0.035 + r0() * 0.05) / tile;
      const end = Math.min(p + wdt, start + 1);
      segs.push({ a: p, b: end, gapB: Math.min(end + gap, start + 1), gh: 0.55 + r0() * 0.3, tone: r0(), hue: r0() });
      p = Math.min(end + gap, start + 1);
    }
    layout.push({ start, segs });
  }
  const gran = noiseField(S, S, rand(seed + 3), 2, 160);
  const g2 = noiseField(S, S, rand(seed + 4), 3, 12);
  const sp = rand(seed + 9);
  for (let y = 0; y < S; y++) {
    const v = (S - y - 0.5) * px, c = Math.min(courses - 1, Math.floor(v / exp)), t = (v - c * exp) / exp; // t 0 = butt
    const L = layout[c];
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let u = x / S; if (u < L.start) u += 1;
      let seg = null, inGap = false;
      for (const s of L.segs) {
        if (u >= s.a && u < s.b) { seg = s; break; }
        if (u >= s.b && u < s.gapB) { seg = s; inGap = true; break; }
      }
      if (!seg) { seg = L.segs[L.segs.length - 1]; inGap = true; }
      const lowerLayer = inGap && t < seg.gh;
      let hh = lowerLayer ? 0.42 + 0.12 * (1 - t) : 0.72 + 0.18 * (1 - t);
      if (!lowerLayer && t < 0.02) hh -= 0.1 * (1 - t / 0.02);
      const gg = gran[i], tone = seg.tone;
      const tb = 54 + tone * 14 + (g2[i] - 0.5) * 10;
      let base = lowerLayer ? tb * 0.74 : tb;
      if (lowerLayer && t > seg.gh - 0.06) base *= 0.85; // shadow under the tab edge
      const warm = (seg.hue - 0.5) * 6;
      let R = base + warm, G = base + warm * 0.5, Bc = base + 1 - warm * 0.3;
      const gk = 1 + (gg - 0.5) * 0.55;
      R *= gk; G *= gk; Bc *= gk;
      // sparse lighter/darker granules
      const s = sp();
      if (s < 0.025) { R *= 1.5; G *= 1.5; Bc *= 1.5; } else if (s < 0.05) { R *= 0.6; G *= 0.6; Bc *= 0.6; }
      // shadow cast by the course above near the top of this course
      if (t > 0.9) { const k = 1 - 0.45 * (t - 0.9) / 0.1; R *= k; G *= k; Bc *= k; }
      put(B, i, R, G, Bc);
      B.hgt[i] = clamp01(hh + (gg - 0.5) * 0.05);
      B.rgh[i] = 0.86 + (gg - 0.5) * 0.12;
    }
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.006, cavity: 1.0, cavityR: 3 }));
}

function genBlock(THREE, S, seed) {
  // painted CMU 16"x8" running bond (light gray). Texture: 4 blocks x 10 courses = 1.626 x 2.032 m
  const cols = 4, rows = 10, TW = 1.626, TH = 2.032, joint = 0.010;
  const B = buffers(S, S), pu = TW / S, pv = TH / S;
  const f1 = noiseField(S, S, rand(seed), 4, 12), f2 = noiseField(S, S, rand(seed + 1), 2, 96);
  const bw = TW / cols, bh = TH / rows;
  for (let y = 0; y < S; y++) {
    const v = (S - y - 0.5) * pv, r = Math.min(rows - 1, Math.floor(v / bh)), lv = v - r * bh;
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let u = (x + 0.5) * pu - (r % 2) * bw * 0.5; u = ((u % TW) + TW) % TW;
      const c = Math.floor(u / bw), lu = u - c * bw;
      const d = Math.min(lu, bw - lu, lv, bh - lv);
      const pit = f2[i] > 0.74 ? (f2[i] - 0.74) * 2.5 : 0;
      const tone = 1 + (hash3(c, r, seed) - 0.5) * 0.03 + (f1[i] - 0.5) * 0.05;
      let hh;
      if (d < joint / 2) hh = 0.25 + 0.25 * Math.sqrt(1 - Math.pow(1 - d / (joint / 2), 2)) * 0.6; // tooled concave joint
      else hh = 0.75 + (f1[i] - 0.5) * 0.1 - pit * 0.3 + (f2[i] - 0.5) * 0.06;
      put(B, i, 204 * tone, 205 * tone, 203 * tone);
      B.hgt[i] = clamp01(hh);
      B.rgh[i] = 0.82 + (f2[i] - 0.5) * 0.12;
    }
  }
  return finish(THREE, Object.assign(B, { tile: [TW, TH], depth: 0.006, cavity: 1.2, cavityR: 2, offset: [0, 1.70 / TH] }));
}

function genConcretePolished(THREE, S, seed, tile) {
  const B = buffers(S, S), n = S * S;
  const f1 = noiseField(S, S, rand(seed), 5, 4), f2 = noiseField(S, S, rand(seed + 1), 3, 40);
  const W = worley(S, S, Math.max(16, (S / 4) | 0), rand(seed + 2));
  const wp = noiseField(S, S, rand(seed + 3), 3, 2);
  for (let i = 0; i < n; i++) {
    const m = (f1[i] - 0.5) * 0.16 + (wp[i] - 0.5) * 0.1;
    let R = 172, G = 170, Bc = 165;
    // exposed fine aggregate: worley cell centres
    const agg = 1 - smooth(0.08, 0.2, W.f1[i]);
    const ct = fract(W.f2[i] * 13.7);
    const aggC = ct < 0.33 ? 0.72 : ct < 0.66 ? 1.12 : 0.92;
    const k = (1 + m) * lerp(1, aggC, agg * 0.8) * (1 + (f2[i] - 0.5) * 0.07);
    put(B, i, R * k, G * k, Bc * k * 1.005);
    B.hgt[i] = 0.6 + agg * 0.02 - (f2[i] > 0.8 ? 0.2 : 0);
    B.rgh[i] = 0.2 + (f1[i] - 0.5) * 0.14 + (wp[i] - 0.5) * 0.1 + (f2[i] > 0.8 ? 0.2 : 0);
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.0006, cavity: 0.5, cavityR: 1 }));
}

function genTravertine(THREE, S, seed, tile) {
  const B = buffers(S, S), n = S * S;
  const band = noiseField(S, S, rand(seed), 4, 2, 24);   // horizontal layering
  const f2 = noiseField(S, S, rand(seed + 1), 3, 16);
  const pits = noiseField(S, S, rand(seed + 2), 2, 40, 120);
  for (let i = 0; i < n; i++) {
    const b = band[i], p = pits[i];
    const k = 1 + (b - 0.5) * 0.22 + (f2[i] - 0.5) * 0.06;
    let R = 222 * k, G = 206 * k, Bc = 182 * k;
    const pit = smooth(0.72, 0.8, p);
    R = lerp(R, 168, pit); G = lerp(G, 148, pit); Bc = lerp(Bc, 118, pit);
    put(B, i, R, G, Bc);
    B.hgt[i] = 0.7 - pit * 0.5 + (f2[i] - 0.5) * 0.04;
    B.rgh[i] = 0.5 + pit * 0.3 + (f2[i] - 0.5) * 0.1;
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.0015, cavity: 1.0, cavityR: 1 }));
}

function genBoucle(THREE, S, seed, tile) {
  const B = buffers(S, S), n = S * S;
  const W1 = worley(S, S, Math.max(24, (S / 7) | 0), rand(seed)), W2 = worley(S, S, Math.max(32, (S / 5) | 0), rand(seed + 1));
  const f = noiseField(S, S, rand(seed + 2), 3, 12);
  for (let i = 0; i < n; i++) {
    const l1 = 1 - smooth(0.0, 0.45, W1.f1[i]), l2 = 1 - smooth(0.0, 0.4, W2.f1[i]);
    const ring = Math.max(l1, l2 * 0.8);
    const k = 0.86 + ring * 0.16 + (f[i] - 0.5) * 0.05;
    put(B, i, 236 * k, 231 * k, 220 * k);
    B.hgt[i] = clamp01(0.3 + ring * 0.6);
    B.rgh[i] = 0.92 + (f[i] - 0.5) * 0.06;
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.002, cavity: 1.4, cavityR: 1 }));
}

function genLinen(THREE, S, seed, tile, rgb) {
  const B = buffers(S, S);
  const threads = Math.round(tile / 0.0011); // ~1.1 mm thread pitch
  const slubU = noiseField(S, S, rand(seed), 3, 6, 140), slubV = noiseField(S, S, rand(seed + 1), 3, 140, 6);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const a = (x / S) * threads, b = (y / S) * threads;
    const ia = Math.floor(a), ib = Math.floor(b);
    const warpUp = ((ia + ib) & 1) === 0;
    const fa = fract(a), fb = fract(b);
    const warpH = Math.sin(Math.PI * fb) * (warpUp ? 1 : 0.4) * (0.8 + slubU[i] * 0.4);
    const weftH = Math.sin(Math.PI * fa) * (warpUp ? 0.4 : 1) * (0.8 + slubV[i] * 0.4);
    const hh = Math.max(warpH * Math.sin(Math.PI * fa) ** 0.3, weftH * Math.sin(Math.PI * fb) ** 0.3);
    const k = 0.84 + hh * 0.2 + (slubU[i] - 0.5) * 0.08 + (slubV[i] - 0.5) * 0.06;
    put(B, i, rgb[0] * k, rgb[1] * k, rgb[2] * k);
    B.hgt[i] = clamp01(hh);
    B.rgh[i] = 0.9;
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.0004, cavity: 0.8, cavityR: 1 }));
}

function genLeather(THREE, S, seed, tile, rgb) {
  const B = buffers(S, S), n = S * S;
  const W = worley(S, S, Math.max(24, (S / 8) | 0), rand(seed));
  const f = noiseField(S, S, rand(seed + 1), 4, 4), f2 = noiseField(S, S, rand(seed + 2), 2, 64);
  for (let i = 0; i < n; i++) {
    const crease = smooth(0.0, 0.12, W.f2[i] - W.f1[i]); // 0 in creases
    const k = 0.82 + crease * 0.16 + (f[i] - 0.5) * 0.22 + (f2[i] - 0.5) * 0.04;
    put(B, i, rgb[0] * k, rgb[1] * k, rgb[2] * k);
    B.hgt[i] = 0.4 + crease * 0.5;
    B.rgh[i] = 0.42 + (1 - crease) * 0.2 + (f[i] - 0.5) * 0.16;
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.0006, cavity: 1.2, cavityR: 1 }));
}

function genBrushed(THREE, S, seed, tile, rgb, roughBase, roughAmp) {
  const B = buffers(S, S), n = S * S;
  const st = noiseField(S, S, rand(seed), 3, 2, 256), st2 = noiseField(S, S, rand(seed + 1), 2, 6, 512);
  const f = noiseField(S, S, rand(seed + 2), 3, 4);
  for (let i = 0; i < n; i++) {
    const s = st[i] * 0.6 + st2[i] * 0.4;
    const k = 1 + (s - 0.5) * 0.08 + (f[i] - 0.5) * 0.05;
    put(B, i, rgb[0] * k, rgb[1] * k, rgb[2] * k);
    B.hgt[i] = s;
    B.rgh[i] = roughBase + (s - 0.5) * roughAmp + (f[i] - 0.5) * roughAmp * 0.4;
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.00004, cavity: 0 }));
}

function genZellige(THREE, S, seed, tile, n = 4) {
  const B = buffers(S, S), ts = tile / n, px = tile / S, gw = 0.0025;
  const f = noiseField(S, S, rand(seed), 4, 8), f2 = noiseField(S, S, rand(seed + 1), 3, 24);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = (x + 0.5) * px, v = (S - y - 0.5) * px;
    const c = Math.floor(u / ts), r = Math.floor(v / ts), lu = u - c * ts, lv = v - r * ts;
    const d = Math.min(lu, ts - lu, lv, ts - lv), hsh = hash3(c, r, seed);
    if (d < gw / 2) { put(B, i, 214, 210, 200); B.hgt[i] = 0.05; B.rgh[i] = 0.8; continue; }
    const pool = (f[i] - 0.5);
    const base = [56 + hsh * 28, 104 + hsh * 30, 88 + hsh * 22];
    const k = 1 + pool * 0.35 + (f2[i] - 0.5) * 0.08 - (1 - smooth(0, 0.008, d - gw / 2)) * 0.25;
    put(B, i, base[0] * k, base[1] * k, base[2] * k);
    B.hgt[i] = clamp01(0.55 + pool * 0.6 * smooth(0, 0.01, d) + 0.3 * smooth(0, 0.004, d - gw / 2));
    B.rgh[i] = 0.06 + (f2[i] - 0.5) * 0.06;
  }
  return finish(THREE, Object.assign(B, { tile: [tile, tile], depth: 0.002, cavity: 0.8, cavityR: 2 }));
}

/* ------------------------------------------------------------------ worldUV (kept) */
/**
 * worldUV(geometry, {scale=1}) — rewrite the 'uv' attribute so 1 UV unit = 1 m (box projection per vertex normal).
 */
export function worldUV(geo, opts = {}) {
  const s = opts.scale || 1;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!pos || !nor) return geo;
  const n = pos.count; const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = ny > 0 ? -z : z; }
    else if (ax >= az) { u = nx > 0 ? -z : z; v = y; }
    else { u = nz > 0 ? x : -x; v = y; }
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
  }
  geo.setAttribute('uv', new pos.constructor(uv, 2));
  return geo;
}

/* ------------------------------------------------------------------ aliases (V1 names → V2 luxury materials) */
export const ALIASES = {
  oakLVP: 'oakWidePlank',
  stairOak: 'oakSolid',
  tileFloorGray: 'marbleTileLarge',
  subwayTileWhite: 'marbleTileLarge',
  drywall: 'plasterWall',
  ceiling: 'ceilingPlaster',
  stuccoExterior: 'stuccoSoftGray',
  vinylSidingGray: 'paintedSidingWhite',
  shingleDarkBrown: 'architecturalShingleCharcoal',
  trimWhite: 'paintedTrim',
  fasciaWhite: 'paintedTrimExterior',
  gutterWhite: 'gutterBlack',
  doorWhite: 'doorShakerWhite',
  metalBlack: 'blackSteel',
  brass: 'brushedBrass',
  joistWood: 'joistPaintedWhite',
  beadboard: 'cedarWood',
  cmuBlockPainted: 'paintedBlockGray',
  brickSill: 'stoneSill',
  steelPainted: 'blackSteel',
};
export const MATERIAL_INFO = {
  note: 'Meter UVs. Textured materials have map + normalMap + roughnessMap. glass/glassObscure are cheap raster window ' +
    'glass (no transmission pass); glassClear/glassFrosted use MeshPhysical transmission (heavier: extra opaque pass when visible). ' +
    'material.userData.ptTwin names the transmission twin a path tracer may swap in.',
};

/* ------------------------------------------------------------------ main factory */
const CACHE = new Map();
/** per-material generation time (ms) of the last build — diagnostics only */
export const TIMING = {};
/**
 * makeMaterials(THREE, quality='high') → { name: Material, ... } (cached per THREE+quality; same object on repeat calls)
 */
export function makeMaterials(THREE, quality = 'high') {
  let perT = CACHE.get(THREE);
  if (!perT) { perT = {}; try { CACHE.set(THREE, perT); } catch (_) {} }
  if (perT[quality]) return perT[quality];
  const M = buildMaterials(THREE, quality);
  perT[quality] = M;
  return M;
}

function buildMaterials(THREE, quality) {
  const low = quality === 'low';
  const L = low ? 512 : 1024;   // hero textures
  const S = low ? 256 : 512;    // regular
  const XS = low ? 128 : 256;   // small
  const M = {};
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const safe = (name, fn) => {
    const t0 = now();
    try { M[name] = fn(); } catch (e) { console.warn('[mats] failed', name, e); M[name] = std({ color: 0xcccccc, roughness: 0.8 }); }
    if (M[name]) { M[name].name = name; M[name].userData = M[name].userData || {}; }
    TIMING[name] = Math.round(now() - t0);
    return M[name];
  };
  // lazy: generated on first access (materials the house shell does not use itself). Assigning overrides.
  // The getter caches in a closure, so copies of this property descriptor (e.g. house.js copies descriptors into
  // ctx.materials) all resolve to the SAME material, generated once on first access.
  const lazy = (name, fn) => {
    let done = false, val;
    const resolve = () => {
      if (!done) {
        done = true;
        Object.defineProperty(M, name, { value: undefined, writable: true, enumerable: true, configurable: true });
        val = safe(name, fn); KITS.clear();
      }
      return val;
    };
    Object.defineProperty(M, name, {
      configurable: true, enumerable: true,
      get: resolve,
      set(v) { done = true; val = v; Object.defineProperty(M, name, { value: v, writable: true, enumerable: true, configurable: true }); },
    });
  };
  // texture set → material params
  const tx = (t, ns = 1) => {
    const o = { map: t.map, roughness: 1 };
    if (t.roughnessMap) o.roughnessMap = t.roughnessMap;
    if (t.normalMap) o.normalMap = t.normalMap;
    return o;
  };
  const withNS = (m, s) => { try { if (m.normalScale) m.normalScale.set(s, s); } catch (_) {} return m; };

  /* ---------------- wood floors & wood */
  safe('oakHerringbone', () => withNS(std(Object.assign(tx(genHerringbone(THREE, L, 101)), { metalness: 0, envMapIntensity: 0.9 })), 1));
  safe('oakWidePlank', () => withNS(std(Object.assign(tx(genWidePlank(THREE, L, 131)), { metalness: 0, envMapIntensity: 0.9 })), 1));
  safe('oakSolid', () => withNS(std(Object.assign(tx(genBoards(THREE, S, 202, OAK_PAL, 1.0, 0.25, 0, 0.0004)), { metalness: 0 })), 1));
  lazy('walnutWood', () => withNS(std(Object.assign(tx(genBoards(THREE, S, 303, WALNUT_PAL, 1.0, 0.2, 0, 0.0004)), { metalness: 0 })), 1));
  safe('cedarWood', () => withNS(std(Object.assign(tx(genBoards(THREE, S, 404, CEDAR_PAL, 1.12, 0.14, 0.004, 0.003)), { metalness: 0 })), 1));
  safe('joistPaintedWhite', () => {
    const t = genSurface(THREE, S, 505, 1.2, { rgb: [238, 237, 233], colA: 0.03, rough: 0.72, roughA: 0.1, oct: 3, base: 3, base2: 40, depth: 0.0006, warp: 0.3, cavity: 0.4 });
    return std(Object.assign(tx(t), { metalness: 0 }));
  });
  safe('plywood', () => {
    const t = genBoards(THREE, S, 1616, { a: [206, 176, 130], b: [190, 158, 112], ring: 0.012, cath: 0.08, streakAmt: 0.2, ringAmt: 0.2, poreAmt: 0.02, toneAmt: 0.2, boardVar: 0.1, hueVar: 0.6, rough: 0.8 }, 1.22, 1.22, 0, 0.0003);
    return std(Object.assign(tx(t), { metalness: 0 }));
  });

  /* ---------------- stone & tile */
  lazy('marbleCalacatta', () => {
    const t = genMarbleSlab(THREE, L, 707, 1.6);
    const o = Object.assign(tx(t), { metalness: 0, roughness: 1, envMapIntensity: 1.0 });
    if (!low) Object.assign(o, { clearcoat: 1, clearcoatRoughness: 0.04 });
    return withNS(phys(o), 0.4);
  });
  safe('marbleTileLarge', () => withNS(std(Object.assign(tx(genMarbleTiles(THREE, L, 707, 1.22, 0.61, 2, 4, 0.002)), { metalness: 0, envMapIntensity: 1.0 })), 1));
  lazy('zelligeTile', () => withNS(std(Object.assign(tx(genZellige(THREE, S, 909, 0.4, 4)), { metalness: 0 })), 1));
  lazy('travertine', () => withNS(std(Object.assign(tx(genTravertine(THREE, S, 1010, 0.6)), { metalness: 0 })), 1));
  safe('stoneSill', () => std(Object.assign(tx(genSurface(THREE, XS, 1111, 0.8, { rgb: [216, 209, 194], colA: 0.08, rough: 0.6, roughA: 0.1, oct: 4, base: 4, depth: 0.0008, speckle: 4 })), { metalness: 0 })));
  safe('concretePolished', () => std(Object.assign(tx(genConcretePolished(THREE, S, 1212, 2.0)), { metalness: 0, envMapIntensity: 1.0 })));
  safe('concrete', () => std(Object.assign(tx(genSurface(THREE, S, 1313, 2.0, { rgb: [178, 175, 168], colA: 0.16, rough: 0.88, roughA: 0.14, oct: 6, base: 4, depth: 0.0025, speckle: 25, speckPit: true, cavity: 0.8 })), { metalness: 0 })));
  safe('concreteBand', () => std(Object.assign(tx(genSurface(THREE, S, 1414, 2.0, { rgb: [168, 166, 160], colA: 0.1, rough: 0.86, roughA: 0.1, oct: 5, base: 4, depth: 0.002, speckle: 10 })), { metalness: 0 })));
  safe('paintedBlockGray', () => withNS(std(Object.assign(tx(genBlock(THREE, S, 1515)), { metalness: 0 })), 1));

  /* ---------------- walls / ceilings / exterior skins */
  safe('plasterWall', () => withNS(std(Object.assign(tx(genSurface(THREE, S, 1717, 2.0, { rgb: [242, 239, 234], colA: 0.022, colB: 0.008, rough: 0.86, roughA: 0.05, roughA2: 0.08, oct: 4, base: 3, base2: 64, hA: 0.8, hB: 0.2, warp: 0.5, depth: 0.0006, cavity: 0.15 })), { metalness: 0 })), 0.6));
  safe('ceilingPlaster', () => withNS(std(Object.assign(tx(genSurface(THREE, XS, 1818, 2.0, { rgb: [247, 246, 243], colA: 0.012, rough: 0.93, roughA: 0.03, oct: 3, base: 3, base2: 48, depth: 0.0003, cavity: 0.1 })), { metalness: 0 })), 0.5));
  safe('stuccoSoftGray', () => withNS(std(Object.assign(tx(genSurface(THREE, S, 1919, 1.0, { rgb: [196, 197, 193], colA: 0.07, colB: 0.05, rough: 0.9, roughA: 0.08, oct: 5, base: 4, base2: 96, hA: 0.55, hB: 0.45, warp: 0.25, depth: 0.0025, speckle: 12, cavity: 0.9 })), { metalness: 0 })), 1));
  safe('paintedSidingWhite', () => withNS(std(Object.assign(tx(genSiding(THREE, S, 2020)), { metalness: 0 })), 1));
  safe('architecturalShingleCharcoal', () => withNS(std(Object.assign(tx(genArchShingles(THREE, S, 2121)), { metalness: 0 })), 1));
  lazy('carpet', () => std(Object.assign(tx(genSurface(THREE, S, 1717 + 5, 0.5, { rgb: [176, 168, 156], colA: 0.18, rough: 0.98, roughA: 0.04, oct: 3, base: 64, depth: 0.002 })), { metalness: 0 })));
  lazy('gravel', () => std(Object.assign(tx(genSurface(THREE, S, 2222, 0.6, { rgb: [128, 122, 112], colA: 0.6, rough: 0.95, roughA: 0.1, oct: 3, base: 48, depth: 0.01, speckle: 60, cavity: 1.2 })), { metalness: 0 })));

  /* ---------------- fabrics / leather (for interior) */
  lazy('boucleFabric', () => withNS(phys(Object.assign(tx(genBoucle(THREE, S, 2323, 0.15)), { metalness: 0, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff) })), 1));
  lazy('linenFabric', () => withNS(phys(Object.assign(tx(genLinen(THREE, S, 2424, 0.12, [208, 198, 182])), { metalness: 0, sheen: 0.4, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xf4ece0) })), 1));
  lazy('leatherCognac', () => withNS(std(Object.assign(tx(genLeather(THREE, S, 2525, 0.3, [150, 84, 42])), { metalness: 0 })), 1));
  lazy('velvet', () => {
    const t = genSurface(THREE, XS, 2626, 0.5, { rgb: [52, 74, 60], colA: 0.18, rough: 0.85, roughA: 0.1, oct: 4, base: 4, depth: 0.0003, warp: 0.6 });
    return phys(Object.assign(tx(t), { metalness: 0, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x9fbfa8) }));
  });

  /* ---------------- metals */
  safe('brushedBrass', () => withNS(std(Object.assign(tx(genBrushed(THREE, S, 2727, 0.2, [205, 168, 98], 0.3, 0.16)), { metalness: 1, envMapIntensity: 1.2 })), 0.5));
  safe('brassPolished', () => std({ color: 0xd8b26a, metalness: 1, roughness: 0.14, envMapIntensity: 1.2 }));
  safe('blackSteel', () => std(Object.assign(tx(genBrushed(THREE, XS, 2828, 0.5, [30, 31, 33], 0.4, 0.12)), { metalness: 0.55 })));
  safe('blackWindowFrame', () => std({ color: 0x18191a, metalness: 0.15, roughness: 0.42 }));
  safe('metalChrome', () => std({ color: 0xffffff, roughness: 0.08, metalness: 1 }));
  safe('galvanized', () => std(Object.assign(tx(genBrushed(THREE, XS, 2929, 0.6, [178, 183, 186], 0.42, 0.2)), { metalness: 0.75, side: THREE.DoubleSide })));
  safe('gutterBlack', () => std({ color: 0x1a1b1c, roughness: 0.38, metalness: 0.35, side: THREE.DoubleSide }));
  safe('rubberGasket', () => std({ color: 0x101010, roughness: 0.9, metalness: 0 }));
  safe('pipeGray', () => std({ color: 0x9ea3a6, roughness: 0.45, metalness: 0.6 }));

  /* ---------------- paint / doors */
  safe('paintedTrim', () => std({ color: 0xf2f0eb, roughness: 0.36, metalness: 0 }));
  safe('paintedTrimExterior', () => std({ color: 0xf3f2ee, roughness: 0.4, metalness: 0 }));
  safe('doorShakerWhite', () => std({ color: 0xf1eee8, roughness: 0.34, metalness: 0 }));
  safe('doorBlack', () => phys({ color: 0x111213, roughness: 0.32, metalness: 0.0, clearcoat: low ? 0 : 0.35, clearcoatRoughness: 0.3 }));
  safe('shutterWhite', () => {
    const draw = (mode) => (g, w, h) => {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const grd = g.createLinearGradient(0, i * h / n, 0, (i + 1) * h / n);
        if (mode === 'color') { grd.addColorStop(0, '#d8d7d2'); grd.addColorStop(0.2, '#fafaf7'); grd.addColorStop(0.85, '#eeede8'); grd.addColorStop(1, '#a9a8a2'); }
        else { grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.9, '#262626'); grd.addColorStop(1, '#000000'); }
        g.fillStyle = grd; g.fillRect(0, i * h / n, w, h / n);
      }
    };
    return std({
      map: canvasTexture(THREE, 64, 256, draw('color'), { repeat: [1 / 0.4, 1 / 0.4] }),
      bumpMap: canvasTexture(THREE, 64, 256, draw('bump'), { repeat: [1 / 0.4, 1 / 0.4], srgb: false }), bumpScale: 1.5,
      roughness: 0.45,
    });
  });
  safe('porcelain', () => std({ color: 0xf7f5ef, roughness: 0.18, metalness: 0 }));
  safe('recessTrim', () => std({ color: 0x2a2a2b, roughness: 0.6, metalness: 0.2 }));

  /* ---------------- glass */
  // window glass: cheap raster (transparent physical, no transmission pass). Path tracer may swap in userData.ptTwin.
  safe('glass', () => {
    const m = phys({
      color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.12,
      envMapIntensity: 1.4, ior: 1.5, specularIntensity: 1, depthWrite: false, side: THREE.DoubleSide,
    });
    m.userData = { ptTwin: 'glassClear' };
    return m;
  });
  safe('glassObscure', () => {
    const t = genSurface(THREE, XS, 3030, 0.15, { rgb: [235, 240, 242], colA: 0.1, rough: 0.45, roughA: 0.4, oct: 3, base: 32, depth: 0.0006 });
    const m = phys({
      color: 0xeef3f4, metalness: 0, roughness: 0.45, transparent: true, opacity: 0.82,
      normalMap: t.normalMap, envMapIntensity: 1.0, depthWrite: false, side: THREE.DoubleSide,
    });
    m.userData = { ptTwin: 'glassFrosted' };
    return m;
  });
  safe('glassClear', () => (low
    ? phys({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.15, ior: 1.5, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide })
    : phys({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, thickness: 0.01, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.2, side: THREE.DoubleSide })));
  safe('glassFrosted', () => (low
    ? phys({ color: 0xf2f5f6, metalness: 0, roughness: 0.5, transparent: true, opacity: 0.8, envMapIntensity: 1.0, depthWrite: false, side: THREE.DoubleSide })
    : phys({ color: 0xffffff, metalness: 0, roughness: 0.45, transmission: 1, thickness: 0.008, ior: 1.5, envMapIntensity: 1.0, side: THREE.DoubleSide })));

  /* ---------------- emissive (lights). house.js clones per room so each follows its lamp. */
  safe('lampDisc', () => std({ color: 0xffffff, emissive: 0xffe4c0, emissiveIntensity: 2.2, roughness: 0.3 }));
  safe('ledStrip', () => std({ color: 0xffffff, emissive: 0xffc98a, emissiveIntensity: 3.0, roughness: 0.4 }));
  safe('bulb', () => std({ color: 0xfff8ea, emissive: 0xffd9a0, emissiveIntensity: 2.0, roughness: 0.2 }));
  safe('lanternGlass', () => std({ color: 0xfff3dc, emissive: 0xffcf8a, emissiveIntensity: 1.5, roughness: 0.3, transparent: true, opacity: 0.9 }));

  // invisible helper (stair ramps etc.)
  safe('invisible', () => std({ color: 0xff00ff, visible: false, side: THREE.DoubleSide }));

  KITS.clear();
  // V1 names → V2 materials (same objects)
  for (const [old, neu] of Object.entries(ALIASES)) if (M[neu] && !M[old]) M[old] = M[neu];
  return M;
}

/* ------------------------------------------------------------------ V3 STYLE bot: low-level generators for js/styles.js
 * (renovation-style textures generated lazily on the first style switch). Read-only re-exports, no behaviour change.
 * finish(THREE, {w,h,col,hgt,rgh,tile:[mU,mV],depth,cavity,cavityR}) → {map, normalMap, roughnessMap} (meter UVs). */
export const STYLE_GEN = {
  finish, buffers, put, samp, worley, blurWrap, hash3, bevelH, clamp, clamp01, lerp, smooth, fract,
  surface: genSurface, boards: genBoards, widePlank: genWidePlank, herringbone: genHerringbone,
  linen: genLinen, leather: genLeather, boucle: genBoucle, brushed: genBrushed,
  PAL: { oak: OAK_PAL, walnut: WALNUT_PAL, cedar: CEDAR_PAL },
};

export default makeMaterials;
