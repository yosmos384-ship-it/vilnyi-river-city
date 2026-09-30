// VILNYI RIVER CITY — interior design styles and procedural PBR materials (Agent C).
// All textures are generated in code (canvas / pixel loops); UVs on apartment geometry are in metres,
// so every tiling texture is created with `repeat = 1 / tileSizeInMetres`.
import * as THREE from 'three';

export const STYLES = [
  {
    id: 'milano',
    name: { en: 'Milano', ro: 'Milano', he: 'מילאנו', ru: 'Милано', uk: 'Мілано', fr: 'Milano', it: 'Milano', de: 'Milano' },
    blurb: {
      en: 'Dark Italian elegance: walnut herringbone, Nero Marquina marble, brushed brass and charcoal velvet.',
      ro: 'Eleganță italiană profundă: parchet de nuc în model herringbone, marmură Nero Marquina, alamă periată și catifea antracit.',
      he: 'אלגנטיות איטלקית כהה: פרקט אגוז בדוגמת אדרה, שיש נרו מרקינה, פליז מוברש וקטיפה בגוון פחם.',
      ru: 'Тёмная итальянская элегантность: орех ёлочкой, мрамор Неро Маркина, латунь и угольный бархат.',
      uk: 'Темна італійська елегантність: горіх «ялинкою», мармур Неро Маркіна, брашована латунь і вугільний оксамит.',
      fr: 'Élégance italienne sombre : noyer à bâtons rompus, marbre Nero Marquina, laiton brossé et velours anthracite.',
      it: 'Eleganza italiana scura: noce a spina di pesce, marmo Nero Marquina, ottone spazzolato e velluto antracite.',
      de: 'Dunkle italienische Eleganz: Nussbaum im Fischgrätmuster, Nero-Marquina-Marmor, gebürstetes Messing und anthrazitfarbener Samt.',
    },
    palette: { floor: '#5b3b27', wall: '#d3cabd', accent: '#2a2623', metal: '#b48c55', fabric: '#3b3a3d', light: '#ffc58c' },
    lightColor: 0xffc38a, lightTemp: 2700,
  },
  {
    id: 'nordic',
    name: { en: 'Nordic', ro: 'Nordic', he: 'נורדי', ru: 'Скандинавский', uk: 'Скандинавський', fr: 'Nordique', it: 'Nordico', de: 'Nordisch' },
    blurb: {
      en: 'Bright Scandinavian calm: wide light-oak planks, white walls, natural linen and matte-black details.',
      ro: 'Calm scandinav luminos: dușumele late din stejar deschis, pereți albi, in natural și detalii negru mat.',
      he: 'שקט סקנדינבי מואר: אלון בהיר בלוחות רחבים, קירות לבנים, פשתן טבעי ופרטים בשחור מט.',
      ru: 'Светлый скандинавский покой: широкая светлая доска из дуба, белые стены, лён и матово-чёрные детали.',
      uk: 'Світлий скандинавський спокій: широка дошка зі світлого дуба, білі стіни, натуральний льон і матово-чорні деталі.',
      fr: 'Calme scandinave lumineux : larges lames de chêne clair, murs blancs, lin naturel et détails noir mat.',
      it: 'Calma scandinava luminosa: plance larghe in rovere chiaro, pareti bianche, lino naturale e dettagli nero opaco.',
      de: 'Helle skandinavische Ruhe: breite Dielen aus heller Eiche, weiße Wände, Naturleinen und mattschwarze Details.',
    },
    palette: { floor: '#cdb38d', wall: '#f1eee8', accent: '#1d1d1d', metal: '#1c1c1c', fabric: '#c9c3b8', light: '#ffd9ab' },
    lightColor: 0xffd6a6, lightTemp: 3000,
  },
  {
    id: 'riviera',
    name: { en: 'Riviera', ro: 'Riviera', he: 'ריביירה', ru: 'Ривьера', uk: 'Рив’єра', fr: 'Riviera', it: 'Riviera', de: 'Riviera' },
    blurb: {
      en: 'A Mediterranean holiday at home: travertine, warm sand tones, cane and rattan, olive greens, terracotta accents.',
      ro: 'O vacanță mediteraneeană acasă: travertin, tonuri calde de nisip, rafie și ratan, verde măsliniu și accente de teracotă.',
      he: 'חופשה ים-תיכונית בבית: טרוורטין, גוני חול חמים, קש וראטן, ירוק זית ונגיעות טרקוטה.',
      ru: 'Средиземноморский отпуск дома: травертин, тёплый песок, ротанг и венская сетка, оливковый и терракота.',
      uk: 'Середземноморська відпустка вдома: травертин, теплі піщані відтінки, віденське плетіння й ротанг, оливковий і теракота.',
      fr: 'Des vacances méditerranéennes à la maison : travertin, tons sable chauds, cannage et rotin, vert olive et touches de terre cuite.',
      it: 'Una vacanza mediterranea a casa: travertino, toni sabbia caldi, paglia di Vienna e rattan, verde oliva e accenti in terracotta.',
      de: 'Mittelmeerurlaub zu Hause: Travertin, warme Sandtöne, Wiener Geflecht und Rattan, Olivgrün und Terrakotta-Akzente.',
    },
    palette: { floor: '#d6c3a1', wall: '#e8d9c3', accent: '#6b6f48', metal: '#b89560', fabric: '#ece3d3', light: '#ffcf98' },
    lightColor: 0xffcc94, lightTemp: 2800,
  },
];

// ---------------------------------------------------------------- noise + canvas helpers
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// Tileable value noise: lattice of `period` cells over the unit square.
function lattice(period, seed) {
  const r = rng(seed), g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => { // x,y in [0,1)
    x *= period; y *= period;
    const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = g[y0 * period + x0], b = g[y0 * period + x1], c = g[y1 * period + x0], d = g[y1 * period + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
function fbmFn(base, oct, seed) {
  const ls = []; for (let o = 0; o < oct; o++) ls.push(lattice(base << o, seed + o * 101));
  return (x, y) => { let v = 0, a = 0.5, n = 0; for (const l of ls) { v += l(x, y) * a; n += a; a *= 0.5; } return v / n; };
}
function canvas(w, h = w) {
  // OffscreenCanvas inside the texture worker (./tex-worker.js); a DOM canvas on the page.
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
// sRGB 0–255 components for canvas painting. (THREE.Color stores linear values, so reading .r/.g/.b directly would
// darken and over-saturate every generated texture.)
const _rgb = {};
function hex(c) { new THREE.Color(c).getRGB(_rgb, THREE.SRGBColorSpace); return [_rgb.r * 255, _rgb.g * 255, _rgb.b * 255]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function rgbStr(c, k = 1) { return `rgb(${Math.max(0, Math.min(255, c[0] * k)) | 0},${Math.max(0, Math.min(255, c[1] * k)) | 0},${Math.max(0, Math.min(255, c[2] * k)) | 0})`; }
function pixels(size, fn, h = size) {
  const c = canvas(size, h), ctx = c.getContext('2d'), img = ctx.createImageData(size, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < size; x++) {
    const p = fn(x / size, y / h, x, y); const i = (y * size + x) * 4;
    d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p[3] ?? 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}
// Phones upload a ≤ 512 px copy of the (identically generated) canvas: ¼ of the GPU memory and upload time.
const TEX_MAX = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 512 : 0;
const _small = new WeakMap();
function uploadSize(c) {
  if (!TEX_MAX || typeof document === 'undefined' || !(c.width > TEX_MAX || c.height > TEX_MAX)) return c;
  let d = _small.get(c);
  if (!d) {
    const k = TEX_MAX / Math.max(c.width, c.height);
    d = canvas(Math.max(1, Math.round(c.width * k)), Math.max(1, Math.round(c.height * k)));
    const x = d.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, d.width, d.height);
    _small.set(c, d);
  }
  return d;
}
function tex(c, { srgb = true, repeat = 1, repeatY } = {}) {
  const t = new THREE.CanvasTexture(uploadSize(c));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeatY ?? repeat);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const nrm = (c, s, repeat) => tex(normalFromHeight(c, s), { srgb: false, repeat });
// Normal map (tangent space, +Y = up in the texture) from the red channel of a height canvas; wraps at the edges.
function normalFromHeight(src, strength = 2) {
  const w = src.width, h = src.height, sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = sd[i * 4] / 255;
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yr = y * w;
    for (let x = 0; x < w; x++) {
      const nx = (H[yr + (x - 1 + w) % w] - H[yr + (x + 1) % w]) * strength, ny = (H[yp + x] - H[ym + x]) * strength;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1), i = (yr + x) * 4;
      d[i] = (nx * l * 0.5 + 0.5) * 255; d[i + 1] = (ny * l * 0.5 + 0.5) * 255; d[i + 2] = (l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); return c;
}
// A long strip of real-looking wood figure (grain runs along x): flat-sawn growth rings that arch into cathedrals,
// fine pore streaks and a slow tone drift. Planks are cut from random windows of it (never needs to tile).
const stripCache = new Map();
function grainStrip(base, seed, W = 2048, H = 256, { rings = 9, figure = 1, contrast = 0.42, streaks = 0.16 } = {}) {
  const key = base.join(',') + '|' + seed + '|' + rings + '|' + figure + '|' + contrast;
  if (stripCache.has(key)) return stripCache.get(key);
  const warp = fbmFn(3, 4, seed), slow = fbmFn(2, 3, seed + 9), streak = lattice(256, seed + 4), fleck = lattice(128, seed + 13);
  const early = base.map(x => x * 1.06 + 4), late = base.map(x => x * (1 - contrast));
  const r = rng(seed * 7 + 1), arches = [];
  for (let i = 0; i < 7; i++) arches.push([r(), 0.08 + r() * 0.14, 0.3 + r() * 0.5]);   // centre u, width, depth
  const c = pixels(W, (u, v, x, y) => {
    let t = (v - 0.5) * rings + (warp(u, v) - 0.5) * 2.2 * figure;
    for (const [cu, wdt, dep] of arches) { const du = (u - cu) / wdt; t += dep * figure * 3 * Math.exp(-du * du) * (1 - Math.abs(v - 0.5)); }
    const f = t - Math.floor(t);
    const lw = Math.pow(Math.max(0, Math.sin(f * Math.PI)), 7) * 0.55 + Math.pow(f, 5) * 0.4;
    let col = mix(early, late, Math.min(1, lw));
    const s = (streak(u * 0.06, v) - 0.5) * streaks + (fleck(u, v) - 0.5) * 0.05, k = 0.93 + (slow(u, v) - 0.5) * 0.14 + s;
    return [col[0] * k, col[1] * k, col[2] * k];
  }, H);
  stripCache.set(key, c);
  return c;
}
// Paint one plank (x,y,w,h in canvas px) from a random window of the grain strip; vertical planks are rotated.
function plank(ctx, strip, x, y, w, h, r, tone) {
  const along = w >= h, L = along ? w : h, S = along ? h : w;
  const sx = r() * Math.max(0, strip.width - L), sy = r() * Math.max(0, strip.height - S);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (along) ctx.drawImage(strip, sx, sy, L, S, x, y, L, S);
  else { ctx.translate(x, y + h); ctx.rotate(-Math.PI / 2); ctx.drawImage(strip, sx, sy, L, S, 0, 0, L, S); }
  ctx.restore();
  if (tone !== 1) { ctx.fillStyle = tone < 1 ? `rgba(20,10,4,${(1 - tone).toFixed(3)})` : `rgba(255,244,228,${((tone - 1) * 0.6).toFixed(3)})`; ctx.fillRect(x, y, w, h); }
}
// Heightmaps are drawn alongside the colour: plank faces mid-grey carrying a whisper of grain, V-grooves black.
function woodHeight(hctx, strip, x, y, w, h, r) {
  hctx.fillStyle = '#b4b4b4'; hctx.fillRect(x, y, w, h);
  hctx.globalAlpha = 0.18; plank(hctx, strip, x, y, w, h, r, 1); hctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- texture generators
// Herringbone of orthogonal planks (ratio 4:1). Lattice vectors (1,1) and (4,-4) in plank-width units;
// the texture tile is 8×8 plank widths, which is an exact period of that lattice → seamless.
// Returns colour, normal and roughness canvases.
function herringbone(base, seed, size = 1024) {
  const c = canvas(size), ctx = c.getContext('2d'), U = size / 8;
  const hc = canvas(size), hctx = hc.getContext('2d'), rc = canvas(size), rctx = rc.getContext('2d');
  const strip = grainStrip(base, seed, 2048, 256, { rings: 7, figure: 0.8, contrast: 0.34, streaks: 0.09 });
  const planks = [];
  for (let m = 0; m < 8; m++) { planks.push([m, m, 4, 1]); planks.push([m + 4, m - 3, 1, 4]); }
  for (const [px, py, pw, ph] of planks) {
    const s0 = seed * 31 + px * 7 + py * 131 + pw, rr = rng(s0 + 5)(), tone = 0.87 + rr * 0.2, rough = 170 + rng(s0 + 9)() * 80;
    for (const ox of [-8, 0, 8]) for (const oy of [-8, 0, 8]) {
      const X = (px + ox) * U, Y = (py + oy) * U, W = pw * U, H = ph * U;
      if (X > size || Y > size || X + W < 0 || Y + H < 0) continue;
      plank(ctx, strip, X, Y, W, H, rng(s0), tone);
      woodHeight(hctx, strip, X, Y, W, H, rng(s0));
      rctx.fillStyle = `rgb(${rough | 0},${rough | 0},${rough | 0})`; rctx.fillRect(X, Y, W, H);
    }
  }
  // micro-bevel: dark hairline in colour, groove in height
  for (const [px, py, pw, ph] of planks) for (const ox of [-8, 0, 8]) for (const oy of [-8, 0, 8]) {
    const X = (px + ox) * U + 0.5, Y = (py + oy) * U + 0.5, W = pw * U - 1, H = ph * U - 1;
    ctx.globalAlpha = 0.55; ctx.strokeStyle = rgbStr(base, 0.3); ctx.lineWidth = 1.4; ctx.strokeRect(X, Y, W, H);
    hctx.strokeStyle = '#000'; hctx.lineWidth = 2.5; hctx.strokeRect(X, Y, W, H);
  }
  ctx.globalAlpha = 1;
  rctx.globalAlpha = 0.25; rctx.drawImage(hc, 0, 0); rctx.globalAlpha = 1;
  return { map: c, normal: normalFromHeight(hc, 3.2), rough: rc };
}
// Wide staggered planks (nordic oak). Tile = 2.4 m × 2.4 m, 12 rows of 0.2 m.
function widePlanks(base, seed, size = 1024) {
  const c = canvas(size), ctx = c.getContext('2d'), r = rng(seed);
  const hc = canvas(size), hctx = hc.getContext('2d'), rc = canvas(size), rctx = rc.getContext('2d');
  const strip = grainStrip(base, seed, 2048, 128, { rings: 6, figure: 0.55, contrast: 0.17, streaks: 0.07 });
  const rows = 12, rh = size / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * size * 0.6;
    while (x < size) {
      const len = size * (0.45 + r() * 0.4), s0 = seed + i * 97 + (x * 13 | 0);
      const tone = 0.9 + rng(s0 + 3)() * 0.17, rough = 170 + rng(s0 + 7)() * 80;
      for (const ox of [0, -size, size]) {
        plank(ctx, strip, x + ox, i * rh, len, rh, rng(s0), tone);
        woodHeight(hctx, strip, x + ox, i * rh, len, rh, rng(s0));
        rctx.fillStyle = `rgb(${rough | 0},${rough | 0},${rough | 0})`; rctx.fillRect(x + ox, i * rh, len, rh);
        ctx.fillStyle = rgbStr(base, 0.45); ctx.globalAlpha = 0.6; ctx.fillRect(x + ox, i * rh, 1.2, rh); ctx.globalAlpha = 1;
        hctx.fillStyle = '#000'; hctx.fillRect(x + ox - 1, i * rh, 2.5, rh);
      }
      x += len;
    }
    ctx.fillStyle = rgbStr(base, 0.45); ctx.globalAlpha = 0.55; ctx.fillRect(0, i * rh, size, 1.2); ctx.globalAlpha = 1;
    hctx.fillStyle = '#000'; hctx.fillRect(0, i * rh - 1, size, 2.5);
  }
  rctx.globalAlpha = 0.25; rctx.drawImage(hc, 0, 0); rctx.globalAlpha = 1;
  return { map: c, normal: normalFromHeight(hc, 3), rough: rc };
}
// Travertine / limestone (tileable): near-straight sedimentary bands, cloudiness, and elongated open pores
// (colour + height canvases, so pores also read in the normal map).
function stoneTex(size, c1, c2, { bands = 6, pores = 0.0, seed = 3, contrast = 1 } = {}) {
  const f = fbmFn(4, 5, seed), st = fbmFn(2, 4, seed + 3), gr = lattice(256, seed + 5), cl = fbmFn(3, 4, seed + 11);
  const A = hex(c1), B = hex(c2);
  const c = pixels(size, (u, v) => {
    const w = f(u, v);
    let t = 0.5 + 0.5 * Math.sin((v * bands + (w - 0.5) * 0.7 + (st(u, v) - 0.5) * 0.9) * Math.PI * 2);
    t = Math.pow(t, 2.4) * 0.6 + (w - 0.3) * 0.5 + (cl(u, v) - 0.5) * 0.25;
    const col = mix(A, B, Math.max(0, Math.min(1, t * contrast)));
    const g = (gr(u, v) - 0.5) * 7;
    return [col[0] + g, col[1] + g, col[2] + g];
  });
  const h = canvas(size), hctx = h.getContext('2d'); hctx.fillStyle = '#b0b0b0'; hctx.fillRect(0, 0, size, size);
  if (pores > 0) {
    const ctx = c.getContext('2d'), r = rng(seed * 13 + 5), n = Math.round(size * size * pores * 0.0035);
    const dark = rgbStr(B, 0.62), lip = rgbStr(A, 1.08);
    for (let i = 0; i < n; i++) {
      const x = r() * size, y = r() * size, rx = (1 + r() * r() * 9) * size / 1024 * 2, ry = Math.max(0.6, rx * (0.18 + r() * 0.2));
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        if (x + ox < -20 || x + ox > size + 20 || y + oy < -20 || y + oy > size + 20) continue;
        ctx.fillStyle = lip; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(x + ox, y + oy + ry * 0.8, rx, ry, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = dark; ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rx, ry, 0, 0, 6.283); ctx.fill();
        hctx.fillStyle = '#202020'; hctx.beginPath(); hctx.ellipse(x + ox, y + oy, rx, ry, 0, 0, 6.283); hctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  c.height_ = h;
  return c;
}
// Marble: cloudy ground + veins drawn as iso-contours of a domain-warped fbm. The contour distance is normalised by
// the field gradient (|n - c| / |∇n|), so a vein keeps a controlled width instead of turning into hairline cracks
// where the field is steep; width swells and thins along the vein, veins fade in and out (real slabs never run a
// vein uniformly), each main vein carries a soft haze, and a finer secondary family crosses them. Everything is
// lattice-periodic → seamless. Returns the colour canvas with `.rough_` (roughness: polished stone, veins a touch
// duller) attached.
function marbleTex(size, base, vein, { seed = 5, vein2, strength = 0.9, network = 0.5, width = 1, levels = [0], scale = 1, turb = 0.4, turb2 = 0.4, haze = 0.35, cloud = 1, gold = 0, rough = 1, smoke = 0 } = {}) {
  const N = size, warpA = fbmFn(2, 4, seed), warpB = fbmFn(2, 4, seed + 31), f1 = fbmFn(3, 4, seed + 57), f2 = fbmFn(4, 4, seed + 61);
  const cl = fbmFn(3, 5, seed + 70), cl2 = fbmFn(8, 3, seed + 73), wv = fbmFn(4, 3, seed + 80), fade = fbmFn(2, 3, seed + 85), fade2 = fbmFn(4, 3, seed + 87), grain = lattice(256, seed + 90);
  const A = hex(base), V = hex(vein), V2 = hex(vein2 || vein), G = hex('#b8955a');
  const Al = A.map(x => Math.min(255, x * 1.12 + 8)), Ad = A.map(x => x * 0.84);
  // Directional "Perlin marble" fields: a diagonal ramp (integer slope → periodic) plus strong turbulence; veins are
  // where the ramp crosses integers, i.e. long meandering streams that never close into loops.
  const F1 = new Float32Array(N * N), F2 = new Float32Array(N * N), k1 = Math.max(1, Math.round(scale));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, wx = warpA(u, v) - 0.5, wy = warpB(u, v) - 0.5, pu = u + wx * 0.35, pv = v + wy * 0.35;
    F1[y * N + x] = (u + v) * k1 + (f1(pu, pv) - 0.5) * 2.6 * turb;
    F2[y * N + x] = (2 * u - v) * k1 + (f2(pu + 0.31, pv - 0.17) - 0.5) * 3.2 * turb2;
  }
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const wrapD = (d) => d - Math.round(d);             // neighbour differences across the tile seam (ramp jumps by an integer)
  const dist = (F, x, y, lv) => {
    const i = y * N + x, xl = y * N + (x - 1 + N) % N, xr = y * N + (x + 1) % N, yu = ((y - 1 + N) % N) * N + x, yd = ((y + 1) % N) * N + x;
    const g = Math.hypot(wrapD(F[xr] - F[xl]), wrapD(F[yd] - F[yu])) * N * 0.5 + 0.2;
    let d = 1e9; for (const c of lv) { const f = F[i] + c; d = Math.min(d, Math.abs(f - Math.round(f))); } return d / g;
  };
  const c = canvas(N), ctx = c.getContext('2d'), img = ctx.createImageData(N, N), D = img.data;
  const rc = canvas(N), rctx = rc.getContext('2d'), rimg = rctx.createImageData(N, N), RD = rimg.data;
  const w0 = 0.0035 * width;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const t = cl(u, v), t2 = cl2(u, v);
    let col = t > 0.5 ? mix(A, Al, (t - 0.5) * 1.5 * cloud) : mix(Ad, A, 1 - (0.5 - t) * 2 * cloud);
    col = mix(col, Al, Math.max(0, t2 - 0.55) * 0.5 * cloud);
    if (smoke) col = mix(col, V2, smoke * sm(0.42, 0.85, t) * (0.6 + 0.8 * t2));      // smoky grey drifts (dark marbles)
    const wm = 0.12 + 2.2 * Math.pow(wv(u, v), 2.5), w = w0 * wm;          // veins taper to nothing and swell
    const fm = sm(0.3, 0.55, fade(u, v)), fm2 = sm(0.42, 0.62, fade2(u, v));
    const d1 = dist(F1, x, y, levels), d2 = dist(F2, x, y, [0]);
    const core = Math.exp(-((d1 / w) ** 2)) * fm * strength;
    const hz = Math.exp(-d1 / (w * 7)) * haze * fm * strength;
    const sec = Math.exp(-((d2 / (w0 * 0.45)) ** 2)) * fm2 * network * strength;
    const sh = Math.exp(-d2 / (w0 * 3)) * 0.25 * fm2 * network * strength;
    col = mix(col, V2, Math.min(1, hz + sh));
    col = mix(col, gold ? mix(V, G, gold * sm(0.5, 0.8, t2)) : V, Math.min(1, core + sec * 0.8));
    const g = (grain(u, v) - 0.5) * 4, i = (y * N + x) * 4;
    D[i] = col[0] + g; D[i + 1] = col[1] + g; D[i + 2] = col[2] + g; D[i + 3] = 255;
    const r = (30 + (t2 - 0.5) * 16 + (core + sec) * 30) * rough;         // roughness ≈ 0.12 polished … 0.24 in the veins
    RD[i] = RD[i + 1] = RD[i + 2] = r; RD[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); rctx.putImageData(rimg, 0, 0);
  c.rough_ = rc;
  return c;
}
// Tileable furniture wood (veneer): fine straight grain with a gentle flame figure; rings run along x with an integer
// ring count over the tile → seamless. `.rough_` = satin lacquer (pores a little rougher than the late wood).
// Real veneer is mostly quarter/rift cut: many thin, nearly straight growth lines (≈ 60 per tile), a slow
// low-amplitude drift, flitch-to-flitch tone steps and fine open-pore streaks. The old wide, warped ring figure
// read as cartoon "wavy stripes" at furniture scale. `.height_` (pores + late wood) feeds a normal map.
function woodTile(base, seed, size = 512, { rings = 56, contrast = 0.22 } = {}) {
  const warp = fbmFn(2, 4, seed), fig = fbmFn(3, 3, seed + 2), pore = lattice(256, seed + 4), pore2 = lattice(512, seed + 5), slow = fbmFn(2, 3, seed + 8);
  const early = base.map(x => x * 1.05 + 4), late = base.map(x => x * (1 - contrast));
  const R = new Uint8Array(size * size), Hh = new Uint8Array(size * size);
  const flitch = [], rf = rng(seed * 3 + 1); for (let i = 0; i < 4; i++) flitch.push(0.95 + rf() * 0.1);   // 4 veneer leaves per tile
  const c = pixels(size, (u, v, x, y) => {
    const t = v * rings + (warp(u, v) - 0.5) * 1.6 + (fig(u, v) - 0.5) * 0.8 + Math.sin(u * Math.PI * 2 + v * 6) * 0.2;
    const f = t - Math.floor(t);
    const lw = Math.pow(Math.max(0, Math.sin(f * Math.PI)), 9) * 0.55 + Math.pow(f, 7) * 0.45;
    const p = pore(u * 0.015, v), p2 = pore2(u * 0.03, v);            // pores: short streaks along the grain
    const pr = Math.max(0, p - 0.6) * 1.6 + Math.max(0, p2 - 0.7) * 1.2;
    const col = mix(early, late, Math.min(1, lw * 0.8 + pr * 0.45));
    const k = (0.95 + (slow(u, v) - 0.5) * 0.12) * flitch[Math.min(3, (v * 4) | 0)];
    R[y * size + x] = 140 + lw * 40 + pr * 90;
    Hh[y * size + x] = 180 - lw * 40 - pr * 150;
    return [col[0] * k, col[1] * k, col[2] * k];
  });
  c.rough_ = pixels(size, (u, v, x, y) => { const r = R[y * size + x]; return [r, r, r]; });
  c.height_ = pixels(size, (u, v, x, y) => { const r = Hh[y * size + x]; return [r, r, r]; });
  return c;
}
// Tile grid; pattern: 'grid' | 'stack' | 'brick' | 'chevron'
function tileTex({ size = 512, tilesX = 4, tilesY = 4, colors, grout, groutW = 3, pattern = 'grid', seed = 1, glaze = 0.08, surface }) {
  const c = canvas(size), ctx = c.getContext('2d'), r = rng(seed);
  const bump = canvas(size), b = bump.getContext('2d');
  ctx.fillStyle = grout; ctx.fillRect(0, 0, size, size);
  b.fillStyle = '#333'; b.fillRect(0, 0, size, size);
  const tw = size / tilesX, th = size / tilesY;
  const drawTile = (x, y, w, h) => {
    const col = hex(colors[(r() * colors.length) | 0]);
    const k = 1 - glaze + r() * glaze * 2;
    for (const ox of [-size, 0, size]) {
      ctx.fillStyle = rgbStr(col, k); ctx.fillRect(x + ox + groutW / 2, y + groutW / 2, w - groutW, h - groutW);
      b.fillStyle = '#fff'; b.fillRect(x + ox + groutW / 2, y + groutW / 2, w - groutW, h - groutW);
    }
  };
  if (pattern === 'chevron') {
    // zig-zag rows of parallelogram-ish tiles approximated by stripes
    for (let j = 0; j < tilesY; j++) for (let i = 0; i < tilesX; i++) {
      const col = hex(colors[(i + j) % colors.length]);
      ctx.fillStyle = rgbStr(col, 1 - glaze + r() * glaze * 2);
      ctx.beginPath();
      const x = i * tw, y = j * th, up = i % 2 === 0;
      ctx.moveTo(x, y + (up ? th * 0.5 : 0)); ctx.lineTo(x + tw, y + (up ? 0 : th * 0.5));
      ctx.lineTo(x + tw, y + (up ? th : th * 1.5)); ctx.lineTo(x, y + (up ? th * 1.5 : th)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = grout; ctx.lineWidth = groutW; ctx.stroke();
    }
  } else {
    for (let j = 0; j < tilesY; j++) {
      const off = pattern === 'brick' ? (j % 2) * tw / 2 : 0;
      for (let i = -1; i < tilesX; i++) drawTile(i * tw + off, j * th, tw, th);
    }
  }
  if (surface) { ctx.globalAlpha = 0.35; ctx.drawImage(surface, 0, 0, size, size); ctx.globalAlpha = 1; }
  return { map: c, bump };
}
// Grayscale fabric weave / bouclé / velvet (tinted by material colour)
function fabricTex(kind, seed = 2, size = 256) {
  const n = lattice(64, seed), n2 = fbmFn(8, 3, seed + 5), bl = lattice(128, seed + 9);
  return pixels(size, (u, v, x, y) => {
    let t;
    if (kind === 'boucle') { t = 0.8 + (bl(u, v) - 0.5) * 0.34 + (n2(u, v) - 0.5) * 0.1; }
    else if (kind === 'velvet') { t = 0.84 + (n2(u, v) - 0.5) * 0.22 + (n(u, v) - 0.5) * 0.05; }
    else if (kind === 'linen') { const w = ((x % 4 < 2) ^ (y % 4 < 2)) ? 0.05 : -0.02; t = 0.84 + w + (n(u, v) - 0.5) * 0.1 + (n2(u, v) - 0.5) * 0.06; }
    else if (kind === 'knit') { const t2 = knitH(x, y, size); t = 0.72 + t2 * 0.26 + (n(u, v) - 0.5) * 0.06; }
    else if (kind === 'jute') { const w = Math.sin(x * 0.8) * Math.sin(y * 0.8); t = 0.7 + w * 0.18 + (n(u, v) - 0.5) * 0.25; }
    else { const w = ((x % 3 < 1.5) ^ (y % 3 < 1.5)) ? 0.06 : -0.04; t = 0.82 + w + (n(u, v) - 0.5) * 0.14; }
    const g = Math.max(0, Math.min(1, t)) * 255; return [g, g, g];
  }, size);
}
// Stockinette knit: columns of V-shaped stitches (8 columns × 12 rows per tile), each stitch a pair of slanted lobes.
function knitH(x, y, size) {
  const cw = size / 8, rh = size / 12, fx = (x % cw) / cw, fy = (y % rh) / rh;
  const side = fx < 0.5 ? fx * 2 : (1 - fx) * 2;             // 0 at the column edge, 1 at the centre seam
  const lobe = Math.sin(Math.min(1, Math.max(0, (fy + side * 0.45 - 0.1))) * Math.PI);
  return Math.max(0, lobe) * Math.pow(Math.sin(side * Math.PI * 0.5 + 0.2), 0.6);
}
// Weave / pile heightmaps → normal maps (tiny repeat: one tile ≈ 5–8 cm of cloth)
function weaveHeight(kind, seed = 3, size = 256) {
  const n = lattice(64, seed), n2 = lattice(128, seed + 1), n3 = fbmFn(16, 3, seed + 2);
  const T = kind === 'linen' ? 10 : kind === 'boucle' ? 8 : 8;       // thread period (px)
  return pixels(size, (u, v, x, y) => {
    let hgt;
    if (kind === 'knit') {
      hgt = 0.15 + knitH(x, y, size) * 0.8 + (n2(u, v) - 0.5) * 0.12;
    } else if (kind === 'boucle') {
      hgt = 0.5 + (n(u, v) - 0.5) * 0.9 + (n2(u, v) - 0.5) * 0.7 + (n3(u, v) - 0.5) * 0.3;
    } else if (kind === 'velvet') {
      hgt = 0.5 + (n3(u, v) - 0.5) * 0.35 + (n2(u, v) - 0.5) * 0.1;
    } else {
      // plain weave: warp threads (along y) over/under weft threads (along x), slubs for linen
      const i = Math.floor(x / T), j = Math.floor(y / T), fx = (x % T) / T, fy = (y % T) / T;
      const over = (i + j) % 2 === 0;
      const warpP = Math.sin(fx * Math.PI), weftP = Math.sin(fy * Math.PI);
      hgt = over ? 0.55 + warpP * 0.4 * (0.6 + 0.4 * Math.sin(fy * Math.PI)) : 0.55 + weftP * 0.4 * (0.6 + 0.4 * Math.sin(fx * Math.PI));
      hgt += (n(u, v) - 0.5) * (kind === 'linen' ? 0.35 : 0.15);
    }
    const g = Math.max(0, Math.min(1, hgt)) * 255; return [g, g, g];
  }, size);
}
// Effects atlas (4×2 cells, alpha only, white). Row 0: 0 soft disc · 1 soft rectangle · 2 edge gradient (dense at
// the cell's top edge) · 3 downlight "scallop" wash (source at the cell's top centre). Row 1: 4 lamp-shade
// hourglass (light escaping above and below a shade, shade at the cell centre) · 5 sun patch (a soft-edged
// rectangle with window-mullion bars, bright at the top edge) · 6 wide soft falloff (broad bounce light) ·
// 7 corner occlusion (dense at the top edge, fading fast). Used by the contact-shadow (AO) decals and the additive
// light decals; one texture → the decals of each material merge into one draw call.
function fxAtlas(size = 1024) {
  const Hh = size, c = canvas(size, Hh), ctx = c.getContext('2d'), img = ctx.createImageData(size, Hh), d = img.data, H = size / 4, pad = 3;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < Hh; y++) for (let x = 0; x < size; x++) {
    const cx = Math.floor(x / H), cy = Math.floor(y / H), cell = cy * 4 + cx;
    const lx = x - cx * H, ly = y - cy * H;
    if (lx < pad || ly < pad || lx >= H - pad || ly >= H - pad) continue;
    const u = (lx - pad) / (H - 2 * pad - 1), v = (ly - pad) / (H - 2 * pad - 1);   // 0..1, v down
    const sx = u * 2 - 1, sy = v * 2 - 1;
    let a = 0;
    if (cell === 0) { const r = Math.min(1, Math.hypot(sx, sy)); a = Math.pow(1 - r * r, 2.2); }
    else if (cell === 1) { a = sm(1, 0.35, Math.abs(sx)) * sm(1, 0.35, Math.abs(sy)); a = Math.pow(a, 0.9); }
    else if (cell === 2) { a = Math.pow(1 - v, 2.4) * sm(1, 0.93, Math.abs(sx)); }
    else if (cell === 3) {
      const arc = 0.04 + 0.55 * sx * sx;                // parabolic cut-off line of the beam on the wall
      const inside = v >= arc ? Math.exp(-(v - arc) * 2.2) : Math.exp(-(arc - v) * 30);
      a = inside * Math.pow(Math.max(0, 1 - Math.abs(sx)), 1.3) * sm(1, 0.7, v) * sm(0, 0.08, v) * 0.85;
    } else if (cell === 4) {
      // up-cone from the shade's open top (crisp edges, widening, fading with distance), a dimmer down-cone,
      // and a warm core around the shade itself
      const yy = -sy, ax = Math.abs(sx);
      let up = 0, dn = 0;
      if (yy > 0.08) { const t = yy - 0.08, w = 0.2 + t * 0.62; up = sm(w * 1.08, w * 0.86, ax) * Math.exp(-t * 1.9) * sm(0.08, 0.2, yy); }
      if (yy < -0.12) { const t = -0.12 - yy, w = 0.24 + t * 0.5; dn = sm(w * 1.1, w * 0.85, ax) * Math.exp(-t * 3.2) * 0.55 * sm(-0.12, -0.2, yy); }
      const r = Math.hypot(sx * 1.3, yy * 1.6), core = Math.exp(-r * r * 6) * 0.55;
      a = (up * 0.9 + dn + core) * sm(1, 0.85, ax) * sm(1, 0.9, Math.abs(yy));
    } else if (cell === 5) {
      // sun patch through a 3-bay window: bright near the glass (top), soft penumbra, two mullion shadows
      const edge = sm(1, 0.8, Math.abs(sx)) * sm(1, 0.85, v) * sm(0, 0.04, v);
      const bars = 1 - 0.75 * (Math.exp(-Math.pow((sx + 0.333) * 40, 2)) + Math.exp(-Math.pow((sx - 0.333) * 40, 2)));
      a = edge * bars * (0.45 + 0.55 * Math.pow(1 - v, 1.5));
    } else if (cell === 6) { const r = Math.min(1, Math.hypot(sx, sy)); a = Math.exp(-r * r * 2.6) * sm(1, 0.7, r); }
    else if (cell === 7) { a = Math.pow(1 - v, 5) * sm(1, 0.9, Math.abs(sx)); }
    else if (cell === 8) { a = Math.pow(1 - v, 1.35) * sm(1, 0.8, Math.abs(sx)) * sm(1, 0.97, v); }   // gentle falloff (room depth)
    else { a = 0; }
    const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.max(0, Math.min(255, a * 255));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
// Radial bloom sprite for the camera-facing light halos (bright core + wide soft skirt).
function bloomTex(size = 128) {
  return pixels(size, (u, v) => {
    const r = Math.hypot(u * 2 - 1, v * 2 - 1), a = r >= 1 ? 0 : (Math.exp(-r * r * 12) * 0.85 + Math.exp(-r * r * 3.2) * 0.4) * (1 - r * r);
    return [255, 255, 255, Math.min(255, a * 255)];
  });
}
function plasterTex(seed = 4, strength = 0.06, size = 512) {
  const f = fbmFn(6, 5, seed);
  return pixels(size, (u, v) => { const g = (1 - strength + f(u, v) * strength * 2) * 235; return [g, g, g]; });
}
function limewashTex(seed = 8, size = 512) {
  const f = fbmFn(3, 5, seed), g2 = fbmFn(12, 3, seed + 3);
  return pixels(size, (u, v) => { const t = f(u, v) * 0.75 + g2(u, v) * 0.25; const g = (0.84 + t * 0.2) * 240; return [g, g, g]; });
}
function woodFurnitureTex(base, seed, size = 512, o) { return woodTile(base, seed, size, o); }
// Vienna straw cane (8 cells per tile): paired vertical + horizontal strands, two diagonal strands, octagonal
// see-through holes (dark = the shadowed backing). `.height_` feeds a normal map so the strands catch the light.
function caneTex(base, size = 256) {
  const c = canvas(size), ctx = c.getContext('2d'), col = hex(base), s = size / 8;
  const h = canvas(size), hx = h.getContext('2d');
  ctx.fillStyle = rgbStr(col, 0.34); ctx.fillRect(0, 0, size, size);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, size, size);
  const strand = (x0, y0, x1, y1, w, k) => {
    for (const [cx, cz, lw, a] of [[ctx, rgbStr(col, k * 0.8), w, 1], [ctx, rgbStr(col, k * 1.08), w * 0.45, 1], [hx, '#c8c8c8', w, 1], [hx, '#ffffff', w * 0.4, 1]]) {
      cx.strokeStyle = cz; cx.lineWidth = lw; cx.lineCap = 'butt'; cx.globalAlpha = a;
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { cx.beginPath(); cx.moveTo(x0 + ox, y0 + oy); cx.lineTo(x1 + ox, y1 + oy); cx.stroke(); }
    }
  };
  const r = rng(91);
  for (let i = 0; i < 8; i++) {                         // paired verticals / horizontals (cell edges)
    const t = i * s;
    strand(t - s * 0.13, 0, t - s * 0.13, size, s * 0.16, 0.95 + r() * 0.08); strand(t + s * 0.13, 0, t + s * 0.13, size, s * 0.16, 0.95 + r() * 0.08);
  }
  for (let i = 0; i < 8; i++) { const t = i * s; strand(0, t - s * 0.13, size, t - s * 0.13, s * 0.16, 1.02); strand(0, t + s * 0.13, size, t + s * 0.13, s * 0.16, 1.02); }
  for (let i = -8; i < 16; i++) {                       // diagonals through the cell corners
    strand(i * s, 0, i * s + size, size, s * 0.14, 1.1); strand(i * s + size, 0, i * s, size, s * 0.14, 1.06);
  }
  ctx.globalAlpha = 1; hx.globalAlpha = 1;
  c.height_ = h;
  return c;
}
// Woven rattan lantern (sphere UVs: u around, v top→bottom): tight horizontal wraps over vertical ribs, small gaps
// where the lamp shines through. Returns colour; `.glow_` = emissive mask (gaps bright).
function rattanWeave(base, size = 512) {
  const col = hex(base), n = lattice(64, 17), rows = 72, ribs = 96;
  const G = new Uint8Array(size * size);
  const c = pixels(size, (u, v, x, y) => {
    const fy = (v * rows) % 1, fx = (u * ribs) % 1, row = Math.floor(v * rows), rib = Math.floor(u * ribs);
    const over = (row + rib) % 2 === 0;
    const wrap = Math.sin(fy * Math.PI), ribP = Math.sin(fx * Math.PI);
    let k = over ? 0.72 + 0.4 * wrap : 0.62 + 0.35 * ribP * (0.5 + 0.5 * wrap);
    const gap = Math.max(0, 1 - Math.abs(fy - 0.5) * 12) * Math.max(0, 1 - Math.abs(fx - 0.5) * 10) * (over ? 0 : 1);
    k *= 0.9 + (n(u, v) - 0.5) * 0.3;
    G[y * size + x] = Math.min(255, (Math.pow(1 - wrap, 3) * 0.35 + gap) * 255);
    return [col[0] * k, col[1] * k, col[2] * k];
  });
  c.glow_ = pixels(size, (u, v, x, y) => { const g = G[y * size + x]; return [g, g * 0.82, g * 0.6]; });
  return c;
}
// Rugs (whole rug in UV 0..1): milano = hand-knotted, faded abstract "marbled" wool with a border; nordic = cream
// berber with a hand-drawn diamond lattice; riviera = flat-woven jute (ribbed) with a darker bound edge.
function rugTex(style, size = 1024) {
  const n1 = fbmFn(3, 5, 41), n2 = fbmFn(6, 4, 43), pile = lattice(256, 47), pile2 = lattice(512, 49);
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const P = {
    milano: [hex('#6f6862'), hex('#8d857b'), hex('#4c4641'), hex('#a88f6c')],
    nordic: [hex('#ebe5da'), hex('#d8cfbf'), hex('#c9bfae'), hex('#bfb39f')],
    riviera: [hex('#cdb897'), hex('#bda582'), hex('#8e7658'), hex('#dccbaa')],
  }[style];
  return pixels(size, (u, v, x, y) => {
    const e = Math.min(u, v, 1 - u, 1 - v);                                   // distance to the edge (uv)
    const pl = (pile(u, v) - 0.5) * 0.12 + (pile2(u, v) - 0.5) * 0.08;         // pile / fibre noise
    let col;
    if (style === 'milano') {
      const t = n1(u, v), w = n2(u, v);
      const band = 0.5 + 0.5 * Math.sin((u * 3 + t * 2.5 + w * 0.8) * Math.PI * 2);
      col = mix(P[0], P[1], sm(0.35, 0.9, band) * 0.8);
      col = mix(col, P[2], sm(0.55, 0.8, w) * 0.45);                           // worn, darker abrash
      col = mix(col, P[3], sm(0.8, 0.95, band) * sm(0.4, 0.7, t) * 0.5);        // faded ochre veins
      if (e < 0.06) col = mix(P[2], P[1], sm(0.03, 0.035, e) * sm(0.045, 0.04, e) * 0.9);   // border + fillet
    } else if (style === 'nordic') {
      const a = (u + v) * 9, b = (u - v) * 9, wob = (n2(u, v) - 0.5) * 0.18;
      const la = Math.abs(a + wob - Math.round(a + wob)), lb = Math.abs(b + wob - Math.round(b + wob));
      const line = Math.max(sm(0.06, 0.02, la), sm(0.06, 0.02, lb));
      col = mix(P[0], P[2], line * 0.75);
      col = mix(col, P[1], (n1(u, v) - 0.4) * 0.5);
      if (e < 0.05) col = mix(P[3], col, sm(0.02, 0.045, e));
    } else {
      const rib = 0.5 + 0.5 * Math.sin(y * Math.PI * 2 / 6), knot = 0.5 + 0.5 * Math.sin(x * Math.PI * 2 / 12 + (y / 6 | 0) * Math.PI);
      col = mix(P[0], P[1], rib * 0.5 + knot * 0.2);
      col = mix(col, P[3], (n1(u, v) - 0.45) * 0.6);
      if (e < 0.05) col = mix(P[2], col, sm(0.035, 0.05, e));
    }
    const k = 1 + pl;
    return [col[0] * k, col[1] * k, col[2] * k];
  });
}
// Abstract art canvases, one family per style
function artTex(style, variant, w = 512, h = 640) {
  const c = canvas(w, h), ctx = c.getContext('2d'), r = rng(variant * 17 + style.length);
  const pal = {
    milano: ['#1d1b1a', '#b48c55', '#6b3b24', '#d9cfc0', '#3d3d40'],
    nordic: ['#f2efe9', '#1d1d1d', '#c9b89a', '#8fa3a8', '#d8cbb5'],
    riviera: ['#efe4d0', '#b5623b', '#6b6f48', '#d9b98a', '#2f4f5f'],
  }[style];
  ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, w, h);
  if (style === 'milano') {
    ctx.fillStyle = pal[3]; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = pal[[0, 2, 4][i]]; ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.arc(w * (0.3 + r() * 0.4), h * (0.25 + i * 0.25), w * (0.18 + r() * 0.2), 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = pal[1]; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.8); ctx.bezierCurveTo(w * 0.4, h * 0.2, w * 0.7, h, w * 0.9, h * 0.3); ctx.stroke();
  } else if (style === 'nordic') {
    ctx.strokeStyle = pal[1]; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let t = 0; t < 1; t += 0.01) { const x = w * (0.2 + 0.6 * t), y = h * (0.5 + Math.sin(t * 9 + variant) * 0.2 * (1 - t)); t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = pal[2 + (variant % 3)]; ctx.beginPath(); ctx.arc(w * 0.62, h * 0.32, w * 0.12, 0, 6.28); ctx.fill();
  } else {
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = pal[1 + ((i + variant) % 4)]; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(w * (0.2 + r() * 0.6), h * (0.2 + r() * 0.6), w * (0.08 + r() * 0.18), h * (0.06 + r() * 0.15), r() * 3, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal[4]; ctx.fillRect(0, h * 0.86, w, h * 0.14);
  }
  // canvas grain
  const g = fabricTex('linen', 3, 256); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.25;
  for (let x = 0; x < w; x += 256) for (let y = 0; y < h; y += 256) ctx.drawImage(g, x, y);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  return c;
}
// Leaf: darker margins, lighter midrib and curved secondary veins, a little mottling (UV 0..1 across the blade)
function leafTex(base, size = 256) {
  const col = hex(base), n = fbmFn(4, 3, base.length * 7 + 3);
  const c = pixels(size, (u, v) => {
    const du = Math.abs(u - 0.5) * 2;
    let k = 1.08 - du * du * 0.32 + (n(u, v) - 0.5) * 0.18 - v * 0.08;
    const rib = Math.exp(-(((u - 0.5) * 60) ** 2));                          // midrib
    const ph = (v + du * 0.28) * 9, sv = Math.pow(Math.abs(Math.sin(ph * Math.PI)), 40) * (1 - du) * 0.9; // secondary veins
    k += rib * 0.35 + sv * 0.16;
    return [col[0] * k, col[1] * k * 1.02, col[2] * k];
  });
  return c;
}
function paperBooksTex(size = 64) { // subtle page edges for book blocks
  return pixels(size, (u, v, x, y) => { const g = y % 2 ? 236 : 222; return [g, g - 4, g - 12]; });
}


// ---------------------------------------------------------------- texture cache (generation is deterministic)
// Every generator above is memoised by name + arguments (canvas arguments by their cache tag). The page can be
// handed the results ahead of time — generated off the main thread by ./tex-worker.js (OffscreenCanvas) and kept in
// IndexedDB for returning visitors — so getMaterials() only copies finished pixels instead of computing them.
// The pixels are identical either way: the look does not change.
const TEXMEM = new Map();     // key → live result (canvas, or object of canvases)
const TEXSTORE = new Map();   // key → [[path, ImageBitmap]] (prewarmed, not yet restored)
let TEXREC = null;            // Set of keys touched while recording (worker)
const isCanvas = v => !!v && typeof v === 'object' && typeof v.getContext === 'function' && typeof v.width === 'number';
function texKey(name, args) {
  let ok = true;
  const k = name + JSON.stringify(args, (_, v) => { if (isCanvas(v)) { if (!v.__tk) ok = false; return '§' + v.__tk; } return v; });
  return ok ? k : null;
}
function texParts(res, pre = '', out = []) {   // [[path, canvas]] — the canvas itself ('') and canvas-valued props
  if (isCanvas(res)) out.push([pre, res]);
  if (res && typeof res === 'object') for (const [k, v] of Object.entries(res)) if (k !== '__tk' && isCanvas(v)) texParts(v, pre ? pre + '.' + k : k, out);
  return out;
}
function texTag(res, key) { for (const [p, c] of texParts(res)) c.__tk = p ? key + '/' + p : key; return res; }
function texRestore(key, parts) {
  const byPath = new Map(parts.map(([p, bm]) => {
    const c = canvas(bm.width, bm.height); c.getContext('2d').drawImage(bm, 0, 0); return [p, c];
  }));
  let root = byPath.get('') || {};
  for (const [p, c] of [...byPath].filter(([p]) => p).sort((a, b) => a[0].length - b[0].length)) {
    const ks = p.split('.'); let o = root; for (const k of ks.slice(0, -1)) o = o[k]; o[ks[ks.length - 1]] = c;
  }
  for (const [, bm] of parts) try { bm.close(); } catch { /* */ }
  return texTag(root, key);
}
function memoTex(name, fn) {
  return function (...args) {
    const key = texKey(name, args);
    if (!key) return fn.apply(this, args);
    if (TEXREC) TEXREC.add(key);
    let r = TEXMEM.get(key);
    if (r) return r;
    const st = TEXSTORE.get(key);
    if (st) { TEXSTORE.delete(key); try { r = texRestore(key, st); } catch (e) { r = null; } }
    if (!r) r = texTag(fn.apply(this, args), key);
    TEXMEM.set(key, r);
    return r;
  };
}
herringbone = memoTex('herringbone', herringbone); widePlanks = memoTex('widePlanks', widePlanks);
stoneTex = memoTex('stoneTex', stoneTex); marbleTex = memoTex('marbleTex', marbleTex); woodTile = memoTex('woodTile', woodTile);
tileTex = memoTex('tileTex', tileTex); fabricTex = memoTex('fabricTex', fabricTex); weaveHeight = memoTex('weaveHeight', weaveHeight);
fxAtlas = memoTex('fxAtlas', fxAtlas); bloomTex = memoTex('bloomTex', bloomTex); plasterTex = memoTex('plasterTex', plasterTex);
limewashTex = memoTex('limewashTex', limewashTex); caneTex = memoTex('caneTex', caneTex); rattanWeave = memoTex('rattanWeave', rattanWeave);
rugTex = memoTex('rugTex', rugTex); artTex = memoTex('artTex', artTex); leafTex = memoTex('leafTex', leafTex);
paperBooksTex = memoTex('paperBooksTex', paperBooksTex); normalFromHeight = memoTex('normalFromHeight', normalFromHeight);

/** Worker side: generate every texture of a style; returns [[key, [[path, canvas]]]] for all keys the style uses. */
export function generateStyleTextures(styleId = 'milano') {
  TEXREC = new Set();
  try { cache.delete(styleId); getMaterials(styleId); } finally { cache.delete(styleId); }
  const keys = [...TEXREC]; TEXREC = null;
  return keys.map(k => [k, texParts(TEXMEM.get(k))]);
}
/** Page side: hand over pre-generated textures ([[key, [[path, ImageBitmap]]]]); unknown keys are ignored later. */
export function adoptTextures(entries) {
  let n = 0;
  for (const [k, parts] of entries || []) if (!TEXMEM.has(k) && !TEXSTORE.has(k)) { TEXSTORE.set(k, parts); n++; }
  return n;
}
export function hasMaterials(styleId) { return cache.has(styleId); }

// Pre-warm: textures of a style arrive from the worker (or IndexedDB) without blocking the page. Resolves (never
// rejects) once they are adopted, or at once when workers / OffscreenCanvas are unavailable — getMaterials() then
// generates on the main thread as before.
const _prewarm = new Map();
let _worker = null, _wseq = 0;
const _wwait = new Map();
function texWorker() {
  if (_worker !== null) return _worker;
  _worker = false;
  try {
    if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') return false;
    const oc = new OffscreenCanvas(1, 1); if (!oc.getContext('2d')) return false;
    _worker = new Worker(new URL('./tex-worker.js', import.meta.url), { type: 'module' });
    _worker.onmessage = ({ data }) => { const w = _wwait.get(data.id); if (w) { _wwait.delete(data.id); w(data); } };
    _worker.onerror = e => { e.preventDefault && e.preventDefault(); for (const w of _wwait.values()) w({ error: 'worker' }); _wwait.clear(); try { _worker.terminate(); } catch { /* */ } _worker = false; };
  } catch (e) { _worker = false; }
  return _worker;
}
// cacheOnly: generate + store in IndexedDB without handing the pixels to the page (for designs not needed yet).
export function prewarmTextures(styleId = 'milano', { cacheOnly = false } = {}) {
  if (!STYLES.find(s => s.id === styleId)) styleId = 'milano';
  if (cache.has(styleId)) return Promise.resolve(true);
  if (_prewarm.has(styleId)) return _prewarm.get(styleId);
  const w = texWorker();
  if (!w) return Promise.resolve(false);
  if (cacheOnly) {
    return new Promise(res => {
      const id = ++_wseq; _wwait.set(id, data => res(!!(data && data.cached)));
      w.postMessage({ id, styleId, cacheOnly: true, src: new URL('./materials.js', import.meta.url).href, three: new URL('../../vendor/three.module.min.js', import.meta.url).href });
    });
  }
  try { performance.mark('walk:tex-request'); } catch { /* */ }
  const p = new Promise(res => {
    const id = ++_wseq;
    _wwait.set(id, data => {
      try { performance.mark('walk:tex-arrived'); } catch { /* */ }
      if (data && data.entries) { adoptTextures(data.entries); res(true); } else { _prewarm.delete(styleId); res(false); }
    });
    w.postMessage({ id, styleId, src: new URL('./materials.js', import.meta.url).href, three: new URL('../../vendor/three.module.min.js', import.meta.url).href });
  });
  _prewarm.set(styleId, p);
  return p;
}

// ---------------------------------------------------------------- materials
const cache = new Map();
const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);

export function getMaterials(styleId = 'milano') {
  if (!STYLES.find(s => s.id === styleId)) styleId = 'milano';
  if (cache.has(styleId)) return cache.get(styleId);
  const S = STYLES.find(s => s.id === styleId);
  const m = { styleId, style: S };

  // shared grayscale textures (tinted per material colour) + cloth normal maps (UVs are metres → repeat = 1/tile)
  const fab = tex(fabricTex('weave', 2), { srgb: true, repeat: 3 });
  const velvet = tex(fabricTex('velvet', 4), { repeat: 2 });
  const boucle = tex(fabricTex('boucle', 6), { repeat: 5 });
  const linen = tex(fabricTex('linen', 7), { repeat: 4 });
  const plaster = tex(plasterTex(4, styleId === 'milano' ? 0.05 : 0.035), { repeat: 0.5 });
  const lime = tex(limewashTex(8), { repeat: 0.35 });
  const nWeave = nrm(weaveHeight('weave', 3), 1.6, 1 / 0.05), nLinen = nrm(weaveHeight('linen', 5), 1.8, 1 / 0.07);
  const nBoucle = nrm(weaveHeight('boucle', 9), 3.5, 1 / 0.09), nVelvet = nrm(weaveHeight('velvet', 11), 1.2, 1 / 0.2);
  const nPlaster = nrm(plasterTex(21, 0.5, 256), 0.9, 1 / 1.3);
  const nRug = nrm(weaveHeight('boucle', 9), 3.5, 26);
  // smudge: faint low-frequency roughness drift (wipe marks, uneven sheen) for lacquer, painted walls, appliances —
  // a perfectly uniform specular lobe is one of the strongest "CG" tells
  const smudgeC = (() => { const f = fbmFn(4, 5, 77), g = fbmFn(16, 3, 79); return pixels(256, (u, v) => { const t = 150 + (f(u, v) - 0.5) * 55 + (g(u, v) - 0.5) * 18; return [t, t, t]; }); })();
  const smudge = (rep) => tex(smudgeC, { srgb: false, repeat: rep });

  // ---------- floors (colour + normal + roughness maps; tiles/planks carry their own variation)
  if (styleId === 'milano') {
    const hb = herringbone(hex('#6e4f3a'), 11), R = 1 / 0.72;
    m.floor = std({ map: tex(hb.map, { repeat: R }), normalMap: tex(hb.normal, { srgb: false, repeat: R }), normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: tex(hb.rough, { srgb: false, repeat: R }), roughness: 0.6, metalness: 0, envMapIntensity: 0.6 });
    // Nero Marquina: near-black with smoky grey clouding, crisp white veins with a grey haze, a fine crossing network
    const mb = marbleTex(1024, '#141312', '#b3ada3', { seed: 21, vein2: '#4a4540', strength: 0.6, network: 0.4, width: 0.62, levels: [0, 0.42], scale: 2, turb: 0.3, turb2: 0.45, haze: 0.4, cloud: 1.4, smoke: 0.3 });
    m.marble = phys({ map: tex(mb, { repeat: 1 / 1.6 }), roughnessMap: tex(mb.rough_, { srgb: false, repeat: 1 / 1.6 }), roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 1.0 });
    const tb = tileTex({ size: 512, tilesX: 2, tilesY: 2, colors: ['#1f1e1d'], grout: '#2c2a28', groutW: 3, surface: mb });
    m.floorBath = std({ map: tex(tb.map, { repeat: 1 / 1.2 }), normalMap: nrm(tb.bump, 1.5, 1 / 1.2), roughness: 0.22, envMapIntensity: 0.9 });
    m.wallBath = phys({ map: tex(mb, { repeat: 1 / 1.8 }), roughnessMap: tex(mb.rough_, { srgb: false, repeat: 1 / 1.8 }), roughness: 1, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.9 });
    m.counter = m.marble;
    const sb = marbleTex(512, '#ebe6de', '#9a9084', { seed: 33, vein2: '#cfc7bb', strength: 0.7, network: 0.4, width: 1.4, gold: 0.5, rough: 1.2 });
    m.stone = phys({ map: tex(sb, { repeat: 1 / 1.2 }), roughnessMap: tex(sb.rough_, { srgb: false, repeat: 1 / 1.2 }), roughness: 1, clearcoat: 0.5, envMapIntensity: 0.9 });
  } else if (styleId === 'nordic') {
    const wp = widePlanks(hex('#cdae83'), 12), R = 1 / 2.4;
    m.floor = std({ map: tex(wp.map, { repeat: R }), normalMap: tex(wp.normal, { srgb: false, repeat: R }), normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: tex(wp.rough, { srgb: false, repeat: R }), roughness: 0.64, envMapIntensity: 0.7 });
    // Calacatta-style: warm white, soft grey veins with a wide haze and a faint gold cast
    const mb = marbleTex(1024, '#f2f0ec', '#8f887e', { seed: 22, vein2: '#d2ccc3', strength: 0.75, network: 0.45, width: 1.5, haze: 0.55, cloud: 0.7, gold: 0.35 });
    m.marble = phys({ map: tex(mb, { repeat: 1 / 1.4 }), roughnessMap: tex(mb.rough_, { srgb: false, repeat: 1 / 1.4 }), roughness: 1, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });
    const tb = tileTex({ size: 512, tilesX: 8, tilesY: 8, colors: ['#d9d7d2', '#d3d1cc', '#dcdad5'], grout: '#bdbab4', groutW: 2 });
    m.floorBath = std({ map: tex(tb.map, { repeat: 1 / 1.2 }), normalMap: nrm(tb.bump, 1.5, 1 / 1.2), roughness: 0.5 });
    const wt = tileTex({ size: 512, tilesX: 4, tilesY: 16, colors: ['#f4f3f0', '#eeede9', '#f1f0ec'], grout: '#dcdad5', groutW: 2, pattern: 'brick', glaze: 0.04 });
    m.wallBath = phys({ map: tex(wt.map, { repeat: 1 / 1.2 }), normalMap: nrm(wt.bump, 2, 1 / 1.2), roughness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.08, envMapIntensity: 0.8 });
    const cb = marbleTex(512, '#f3f2ef', '#aaa399', { seed: 44, vein2: '#dcd7cf', strength: 0.6, network: 0.35, width: 1.6, haze: 0.5, cloud: 0.6, rough: 1.3 });
    m.counter = phys({ map: tex(cb, { repeat: 1 / 1.2 }), roughnessMap: tex(cb.rough_, { srgb: false, repeat: 1 / 1.2 }), roughness: 1, clearcoat: 0.4 });
    m.stone = m.counter;
  } else {
    const tr = stoneTex(1024, '#dcc6a0', '#b8966a', { bands: 14, pores: 0.08, seed: 7, contrast: 0.95 });
    const tt = tileTex({ size: 1024, tilesX: 2, tilesY: 2, colors: ['#d2b994', '#cbb08a', '#d8c19e', '#c9ad86'], grout: '#b59c78', groutW: 3, surface: tr, glaze: 0.06 });
    // floor height = tile grid + the travertine pores
    const th = canvas(1024), thc = th.getContext('2d'); thc.drawImage(tt.bump, 0, 0); thc.globalCompositeOperation = 'multiply'; thc.drawImage(tr.height_, 0, 0); th.__tk = 'rivieraFloorH';
    m.floor = std({ map: tex(tt.map, { repeat: 1 / 1.6 }), normalMap: nrm(th, 2.2, 1 / 1.6), roughnessMap: smudge(0.6), roughness: 0.62 / 0.59, envMapIntensity: 0.42 });
    const trN = nrm(tr.height_, 1.6, 1 / 1.4);
    m.marble = std({ map: tex(tr, { repeat: 1 / 1.4 }), normalMap: trN, roughnessMap: smudge(0.8), roughness: 0.45 / 0.59, envMapIntensity: 0.6 });
    const zel = tileTex({ size: 512, tilesX: 8, tilesY: 8, colors: ['#ebe1cf', '#e7dcc8', '#eee5d5', '#e4d8c2', '#e9dfcc'], grout: '#dccdb3', groutW: 3, glaze: 0.035 });
    // zellige: hand-made undulating glaze → low-frequency height on top of the grout grid
    const zh = canvas(512), zhc = zh.getContext('2d'); zhc.drawImage(zel.bump, 0, 0); zhc.globalAlpha = 0.35; zhc.drawImage(plasterTex(31, 0.9, 512), 0, 0); zhc.globalAlpha = 1; zh.__tk = 'rivieraZelligeH';
    m.wallBath = phys({ map: tex(zel.map, { repeat: 1 / 0.8 }), normalMap: nrm(zh, 2.2, 1 / 0.8), roughness: 0.32, clearcoat: 0.45, clearcoatRoughness: 0.22, envMapIntensity: 0.85 });
    const bt = tileTex({ size: 512, tilesX: 6, tilesY: 6, colors: ['#b8653f', '#c07049', '#ad5d39', '#c47a55', '#b26a44'], grout: '#d9c7aa', groutW: 3, glaze: 0.1 });
    m.floorBath = std({ map: tex(bt.map, { repeat: 1 / 1.2 }), normalMap: nrm(bt.bump, 1.6, 1 / 1.2), roughness: 0.62 });
    m.counter = std({ map: tex(tr, { repeat: 1 / 1.2 }), normalMap: trN, roughnessMap: smudge(0.8), roughness: 0.4 / 0.59, envMapIntensity: 0.55 });
    m.stone = m.counter;
  }
  // outdoor deck: large-format porcelain
  {
    const col = { milano: ['#6d6a66', '#65625e'], nordic: ['#a9a6a0', '#a19e98'], riviera: ['#cdb89a', '#c5b091'] }[styleId];
    const st = stoneTex(512, col[0], col[1], { bands: 2, seed: 30, contrast: 0.3 });
    const ot = tileTex({ size: 512, tilesX: 2, tilesY: 4, colors: col, grout: '#555', groutW: 2, surface: st, pattern: 'brick' });
    m.floorOut = std({ map: tex(ot.map, { repeat: 1 / 1.2 }), normalMap: nrm(ot.bump, 1.5, 1 / 1.2), roughness: 0.75 });
  }

  // ---------- walls / ceiling
  const wallCol = { milano: '#bcb3a7', nordic: '#f1efea', riviera: '#eadcc6' }[styleId];
  m.wall = std({ color: wallCol, map: styleId === 'riviera' ? lime : plaster, normalMap: nPlaster, normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: smudge(0.4), roughness: 1.5, envMapIntensity: 0.24 });
  m.ceiling = std({ color: { milano: '#e9e3da', nordic: '#f3f1ed', riviera: '#eee5d7' }[styleId], roughness: 0.95, envMapIntensity: 0.2 });
  m.cutCap = std({ color: '#f4f2ee', roughness: 0.9 });
  m.skirting = std({ color: { milano: '#2a2522', nordic: '#f4f2ee', riviera: '#e2d2b8' }[styleId], roughness: 0.45, envMapIntensity: 0.6 });
  m.exterior = std({ color: '#ece8e0', map: plaster, roughness: 0.85 });

  // ---------- woods
  const woodBase = { milano: '#5a3a26', nordic: '#d2b893', riviera: '#9b7552' }[styleId];
  // tile ≈ 0.9 m; the grain runs along the texture's u → along world X/Z (horizontal) after the bake's world-UV projection
  // o.vertical: grain runs up the texture (cabinet fronts, doors, wall panels are veneered with vertical grain; the
  // bake's world-UV projection maps texture v to world Y on vertical faces)
  const rot90 = (src) => { const d = canvas(src.height, src.width), x = d.getContext('2d'); x.translate(d.width, 0); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0); if (src.__tk) d.__tk = src.__tk + '|rot90'; return d; };
  const woodM = (col, seed, rough, rep = 1.1, o = {}) => { let c = woodFurnitureTex(hex(col), seed, 512, o); if (o.vertical) { const r = rot90(c); r.rough_ = rot90(c.rough_); r.height_ = rot90(c.height_); c = r; } return std({ map: tex(c, { repeat: rep }), normalMap: tex(normalFromHeight(c.height_, 1.4), { srgb: false, repeat: rep }), normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: tex(c.rough_, { srgb: false, repeat: rep }), roughness: rough, envMapIntensity: 0.6 }); };
  m.wood = woodM(woodBase, 5, 0.6);
  m.woodDark = woodM({ milano: '#3c271b', nordic: '#8a6d50', riviera: '#6e4f35' }[styleId], 6, 0.55, 1.1, { contrast: 0.3, vertical: true });
  m.woodLight = woodM('#d8c3a2', 9, 0.72, 1.1, { contrast: 0.16, rings: 64 });
  m.teak = woodM('#8c6440', 10, 0.9, 2);
  // feature wall: milano = fluted walnut; nordic = oak slats; riviera = limewash plaster arch niche
  m.wallAccent = styleId === 'milano' ? m.woodDark : styleId === 'nordic' ? m.woodLight : std({ color: '#dcc6a6', map: lime, normalMap: nPlaster, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.95 });

  // ---------- lacquer / cabinetry
  const lac = { milano: '#1f1e1d', nordic: '#efede8', riviera: '#6f7350' }[styleId];
  m.lacquer = phys({ color: lac, roughnessMap: smudge(0.9), roughness: styleId === 'milano' ? 0.55 : 0.8, clearcoat: styleId === 'riviera' ? 0.4 : 0.2, clearcoatRoughness: 0.4, envMapIntensity: 0.6 });
  // nordic joinery: pale ash veneer (matt oiled) instead of flat white lacquer
  if (styleId === 'nordic') m.lacquer = woodM('#e3d5bf', 15, 0.62, 1.1, { contrast: 0.1, rings: 72, vertical: true });
  m.lacquer2 = styleId === 'nordic' ? m.woodLight : styleId === 'milano' ? m.wood : phys({ color: '#e8dcc6', roughness: 0.6, clearcoat: 0.2 });
  m.doorLeaf = styleId === 'milano' ? m.woodDark : std({ color: { nordic: '#f4f2ee', riviera: '#e9dcc6' }[styleId], roughness: 0.6 });
  m.frame = std({ color: { milano: '#1d1c1b', nordic: '#262626', riviera: '#5a4a3a' }[styleId], roughness: 0.45, metalness: 0.4 });
  m.doorFrame = styleId === 'milano' ? m.woodDark : m.skirting;

  // ---------- metals
  m.brass = std({ color: '#c49a5c', metalness: 1, roughness: 0.3, envMapIntensity: 1.2 });
  m.blackMetal = std({ color: '#141414', metalness: 0.35, roughness: 0.5, envMapIntensity: 0.8 });   // powder-coated
  m.chrome = std({ color: '#e8e8e8', metalness: 1, roughness: 0.08, envMapIntensity: 1.3 });
  m.steel = std({ color: '#b9bbbd', metalness: 1, roughness: 0.32, envMapIntensity: 1.1 });
  m.metal = styleId === 'nordic' ? m.blackMetal : m.brass;       // style accent metal (handles, legs, lamp parts)
  m.tap = styleId === 'nordic' ? m.blackMetal : styleId === 'milano' ? m.brass : m.brass;
  m.applianceGlass = phys({ color: '#0c0c0d', roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1 });
  m.screen = phys({ color: '#050506', roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 });
  m.rubber = std({ color: '#222', roughness: 0.9 });

  // ---------- glass & mirror (no transmission pass: cheap transparent PBR)
  m.glass = phys({ color: '#dfe9ea', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide });
  m.glassFrosted = phys({ color: '#eef2f2', roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  m.crystal = phys({ color: '#ffffff', roughness: 0.02, transparent: true, opacity: 0.3, envMapIntensity: 1.8, depthWrite: false });
  m.mirror = std({ color: '#d9dde0', metalness: 1, roughness: 0.02, envMapIntensity: 1.6 });
  m.wine = phys({ color: '#4a0710', roughness: 0.05, transparent: true, opacity: 0.85 });
  m.water = phys({ color: '#9fb9bd', roughness: 0.02, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 0.6 });

  // ---------- fabrics & upholstery
  const P = {
    milano: { sofa: ['#34363b', velvet], chair: ['#7a4526', null], accent: '#8a4b2a', c1: '#8c5a2b', c2: '#bfa06a', c3: '#2c2c30', throw: '#6b6258', duvet: '#d8d2c8', head: '#34333a', curtain: '#8d8274', sheer: '#e8e2d8', towel: '#2d2b2a', towel2: '#c9b89c', outdoor: '#57534e' },
    nordic: { sofa: ['#c6c1b8', linen], chair: ['#ece6da', boucle], accent: '#7d8c7a', c1: '#8a9b86', c2: '#d6b98c', c3: '#8ea1ad', throw: '#9c948a', duvet: '#f3f1ec', head: '#cfc8bd', curtain: '#f1eee7', sheer: '#faf8f4', towel: '#f1efea', towel2: '#aab4a8', outdoor: '#d9d5cd' },
    riviera: { sofa: ['#efe7d8', boucle], chair: ['#e5dac6', boucle], accent: '#b5623b', c1: '#b0674a', c2: '#7b7f52', c3: '#e2c69a', throw: '#b99477', duvet: '#f1e9dc', head: '#e3d6c1', curtain: '#e6dac5', sheer: '#f7f1e6', towel: '#efe6d5', towel2: '#b5623b', outdoor: '#ece2cf' },
  }[styleId];
  const NF = { [velvet.uuid]: nVelvet, [boucle.uuid]: nBoucle, [linen.uuid]: nLinen };
  const nOf = (t) => (t && NF[t.uuid]) || nWeave;
  m.fabric = styleId === 'milano'
    ? phys({ color: P.sofa[0], map: velvet, normalMap: nVelvet, roughness: 0.82, sheen: 1, sheenColor: new THREE.Color('#8b8a92'), sheenRoughness: 0.35, envMapIntensity: 0.45 })
    : std({ color: P.sofa[0], map: P.sofa[1], normalMap: nOf(P.sofa[1]), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, envMapIntensity: 0.4 });
  m.fabricAccent = styleId === 'milano'
    ? phys({ color: P.chair[0], roughness: 0.48, map: tex(fabricTex('velvet', 12), { repeat: 3 }), normalMap: nVelvet, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.7 }) // cognac leather
    : std({ color: P.chair[0], map: P.chair[1] || fab, normalMap: nOf(P.chair[1]), roughness: 0.95, envMapIntensity: 0.4 });
  m.leather = std({ color: styleId === 'nordic' ? '#6b4a33' : '#7a4526', roughness: 0.5, map: tex(fabricTex('velvet', 13), { repeat: 3 }), normalMap: nVelvet });
  m.cushionA = styleId === 'milano'
    ? phys({ color: P.c1, map: velvet, normalMap: nVelvet, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#d9a066'), sheenRoughness: 0.4 })
    : std({ color: P.c1, map: velvet, normalMap: nVelvet, roughness: 0.9 });
  m.cushionB = std({ color: P.c2, map: linen, normalMap: nLinen, roughness: 0.95 });
  m.cushionC = std({ color: P.c3, map: fab, normalMap: nWeave, roughness: 0.95 });
  m.throw = std({ color: P.throw, map: tex(fabricTex('knit', 14), { repeat: 1 / 0.12 }), normalMap: nrm(weaveHeight('knit', 14), 2.4, 1 / 0.12), roughness: 1, side: THREE.DoubleSide });
  m.linen = std({ color: '#f6f3ee', map: linen, normalMap: nLinen, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, envMapIntensity: 0.5 });
  m.duvet = std({ color: P.duvet, map: linen, normalMap: nLinen, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95, envMapIntensity: 0.5, side: THREE.DoubleSide });
  m.headboard = std({ color: P.head, map: styleId === 'milano' ? velvet : linen, normalMap: styleId === 'milano' ? nVelvet : nLinen, roughness: 0.9 });
  m.curtain = std({ color: P.curtain, map: linen, normalMap: nLinen, roughness: 0.95, side: THREE.DoubleSide });
  // sheers are back-lit by the daylight behind them: a little emissive makes them glow like real voile
  m.sheer = std({ color: P.sheer, map: linen, roughness: 0.9, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color('#fff4e4'), emissiveIntensity: 0.28 });
  m.towel = std({ color: P.towel, map: tex(fabricTex('boucle', 15), { repeat: 6 }), normalMap: nBoucle, roughness: 1 });
  m.towel2 = std({ color: P.towel2, map: tex(fabricTex('boucle', 16), { repeat: 6 }), normalMap: nBoucle, roughness: 1 });
  m.outdoorFabric = std({ color: P.outdoor, map: fab, normalMap: nWeave, roughness: 0.95 });
  m.rug = std({ map: tex(rugTex(styleId), { repeat: 1 }), normalMap: nRug, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1, envMapIntensity: 0.2 });
  { const ct = caneTex('#d9b98a'); m.cane = std({ map: tex(ct, { repeat: 9 }), normalMap: nrm(ct.height_, 2.2, 9), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.62, envMapIntensity: 0.45 }); }
  m.rattan = std({ color: '#b98f5a', map: tex(fabricTex('jute', 18), { repeat: 4 }), normalMap: nBoucle, roughness: 0.85 });
  // woven shades keep their own sphere UVs (a world-UV projection shows patch seams on a sphere)
  { const rw = rattanWeave('#c9a172'); m.rattanShade = std({ color: '#ffffff', map: tex(rw, { repeat: 1 }), emissiveMap: tex(rw.glow_, { repeat: 1 }), emissive: new THREE.Color(S.lightColor), emissiveIntensity: 1.6, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.4 }); }
  m.accentFabric = std({ color: P.accent, map: velvet, normalMap: nVelvet, roughness: 0.9 });
  // Cloth gets a sheen lobe (the soft bright rim fabric shows at grazing angles — the single biggest cue that reads
  // "textile" instead of "painted plastic"). Standard PBR extension (KHR_materials_sheen) → survives glTF export.
  const sheenify = (k, amt = 0.8, sr = 0.55) => {
    const a = m[k]; if (!a || a.isMeshPhysicalMaterial) return;
    const p = new THREE.MeshPhysicalMaterial(); THREE.MeshStandardMaterial.prototype.copy.call(p, a);
    p.defines = { STANDARD: '', PHYSICAL: '' };
    p.sheen = amt; p.sheenRoughness = sr; p.sheenColor = a.color.clone().lerp(new THREE.Color('#ffffff'), 0.3);
    m[k] = p; a.dispose();
  };
  for (const k of ['fabric', 'fabricAccent', 'cushionA', 'cushionB', 'cushionC', 'throw', 'linen', 'duvet', 'headboard', 'curtain', 'accentFabric', 'outdoorFabric']) if (!(styleId === 'milano' && k === 'fabricAccent')) sheenify(k);
  for (const k of ['towel', 'towel2']) sheenify(k, 0.5, 0.8);
  sheenify('rattanShade', 0.3, 0.7);

  // ---------- ceramics, table, food
  m.porcelain = phys({ color: '#fbfbfa', roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 0.9 });
  m.ceramic = phys({ color: { milano: '#f3efe8', nordic: '#f4f3ef', riviera: '#f1e8d8' }[styleId], roughness: 0.2, clearcoat: 0.6 });
  m.ceramic2 = phys({ color: { milano: '#1f1f21', nordic: '#b7c1bd', riviera: '#a4664c' }[styleId], roughness: 0.3, clearcoat: 0.5 });
  m.cutlery = std({ color: styleId === 'milano' ? '#d6b27a' : '#dcdcdc', metalness: 1, roughness: 0.18, envMapIntensity: 1.3 });
  m.napkin = std({ color: { milano: '#6b6258', nordic: '#dcd6cb', riviera: '#b98a6c' }[styleId], map: linen, roughness: 1 });
  m.fruit = std({ color: '#e0892c', roughness: 0.55 });
  m.fruit2 = std({ color: '#b7c43d', roughness: 0.5 });
  m.fruit3 = std({ color: '#8e1f24', roughness: 0.4 });
  m.bread = std({ color: '#b8834d', roughness: 0.9 });
  m.candle = std({ color: '#f4efe4', roughness: 0.7, emissive: '#3a2a10', emissiveIntensity: 0.2 });
  m.flame = std({ color: '#ffd28a', emissive: '#ffb347', emissiveIntensity: 3 });
  m.paper = std({ map: tex(paperBooksTex(), { repeat: 1 }), roughness: 0.95 });
  m.books = std({ vertexColors: true, roughness: 0.8, envMapIntensity: 0.4 });
  m.bottle = phys({ color: '#1f3a24', roughness: 0.1, transparent: true, opacity: 0.85, clearcoat: 1 });
  m.oil = phys({ color: '#b39a2a', roughness: 0.1, transparent: true, opacity: 0.8 });

  // ---------- cabinet interiors & their contents (openable joinery). Contents are vertex-coloured so a whole
  // wardrobe of garments / a fridge of groceries bakes into a handful of draw calls.
  m.cabinetIn = styleId === 'milano' ? woodM('#4a3326', 17, 0.6, 1.1, { contrast: 0.22, vertical: true })
    : styleId === 'nordic' ? std({ color: '#efebe4', roughnessMap: smudge(0.9), roughness: 0.75, envMapIntensity: 0.5 })
    : std({ color: '#e9dfcd', map: linen, roughness: 0.85, envMapIntensity: 0.5 });
  m.clothes = std({ vertexColors: true, map: fab, normalMap: nWeave, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95, envMapIntensity: 0.35 });
  m.goods = phys({ vertexColors: true, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.6 });
  m.food = phys({ vertexColors: true, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.55 });
  m.fridgeIn = std({ color: '#f3f5f6', roughness: 0.3, emissive: new THREE.Color('#dfeaf5'), emissiveIntensity: 0.07, envMapIntensity: 0.7 });
  m.coldLed = std({ color: '#ffffff', emissive: new THREE.Color('#eef5ff'), emissiveIntensity: 3.2, roughness: 1 });
  m.enamel = std({ color: '#26282b', roughness: 0.35, metalness: 0.1, envMapIntensity: 0.8 });
  m.drum = std({ color: '#c3c6c8', metalness: 0.9, roughness: 0.28, side: THREE.DoubleSide, envMapIntensity: 1.0 });
  m.hanger = styleId === 'nordic' ? m.woodLight : styleId === 'milano' ? m.woodDark : m.woodLight;

  // ---------- plants
  m.leaf = std({ map: tex(leafTex(styleId === 'riviera' ? '#6a7a48' : '#35602d')), roughness: 0.42, side: THREE.DoubleSide, envMapIntensity: 0.7 });
  m.leaf2 = std({ map: tex(leafTex(styleId === 'riviera' ? '#8a9868' : '#4f7a35')), roughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  m.stem = std({ color: '#5b4632', roughness: 0.8 });
  m.soil = std({ color: '#2b2018', roughness: 1 });
  m.pot = phys({ color: { milano: '#1c1b1b', nordic: '#e9e6e0', riviera: '#a86a4c' }[styleId], roughness: 0.45, clearcoat: 0.3 });
  m.pot2 = std({ color: { milano: '#8a7d6d', nordic: '#b6aea3', riviera: '#d9c6a5' }[styleId], roughness: 0.8 });
  m.flower = std({ color: { milano: '#f3efe6', nordic: '#f6f2ea', riviera: '#f0c9a2' }[styleId], roughness: 0.8, side: THREE.DoubleSide });

  // ---------- art
  m.art = [0, 1, 2].map(i => std({ map: tex(artTex(styleId, i), { repeat: 1 }), roughness: 0.9, envMapIntensity: 0.3 }));
  m.artFrame = styleId === 'nordic' ? m.woodLight : styleId === 'milano' ? m.brass : m.woodDark;

  // ---------- light emitters (these are what makes the scene read "lit")
  const L = new THREE.Color(S.lightColor);
  m.lightEmit = std({ color: '#ffffff', emissive: L, emissiveIntensity: 2.6, roughness: 1 });
  m.led = std({ color: '#ffffff', emissive: L, emissiveIntensity: 3.2, roughness: 1 });
  m.lampShade = std({ color: { milano: '#dccdb4', nordic: '#ece5d8', riviera: '#e6d3b4' }[styleId], map: linen, emissive: L.clone().lerp(new THREE.Color('#ff9a4a'), 0.2), emissiveMap: linen, emissiveIntensity: 0.5, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.3 });
  // opal glass globes: smooth milky glass lit from inside (no fabric weave)
  m.opal = std({ color: '#f3eee6', emissive: L.clone().lerp(new THREE.Color('#ffffff'), 0.25), emissiveIntensity: 0.85, roughness: 0.25, envMapIntensity: 0.5 });
  m.bulb = std({ color: '#fff', emissive: L, emissiveIntensity: 4 });
  m.plastic = std({ color: '#f2f2f0', roughness: 0.35 });
  m.darkPlastic = std({ color: '#1b1b1c', roughness: 0.4 });
  m.collider = new THREE.MeshBasicMaterial({ visible: false });

  // ---------- baked-look light & shadow decals (one shared atlas; unlit, no depth write)
  // ao / aoSoft: soft contact shadows under furniture and in wall/floor/ceiling junctions (normal blending, black)
  // glow / glowFaint: additive warm light pools, downlight scallops, lamp halos, cove wash; daylight: window spill
  const fx = tex(fxAtlas(), { repeat: 1 }); fx.wrapS = fx.wrapT = THREE.ClampToEdgeWrapping;
  const dec = (o) => new THREE.MeshBasicMaterial({ map: fx, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, ...o });
  const aoK = { milano: 0.8, nordic: 0.6, riviera: 0.66 }[styleId];
  m.ao = dec({ color: 0x000000, opacity: aoK });
  m.aoSoft = dec({ color: 0x000000, opacity: aoK * 0.42 });
  // room-depth falloff: rooms darken away from the glazing (ceiling, floor, side walls) — the look of real daylight
  m.shade = dec({ color: 0x000000, opacity: { milano: 0.5, nordic: 0.36, riviera: 0.42 }[styleId] });
  const gk = { milano: 1, nordic: 0.7, riviera: 0.8 }[styleId];
  // Additive light is tinted a little redder than the lamps: ACES compresses the red channel first when bright
  // light piles up on warm plaster, which otherwise drifts the pools towards a sickly yellow-green.
  const GL = L.clone().lerp(new THREE.Color('#ff9f5c'), 0.35);
  m.glow = dec({ color: GL, opacity: 0.44 * gk, blending: THREE.AdditiveBlending, fog: false });
  m.glowFaint = dec({ color: GL, opacity: 0.18 * gk, blending: THREE.AdditiveBlending, fog: false });
  m.daylight = dec({ color: new THREE.Color('#fff3e2'), opacity: 0.15 * gk, blending: THREE.AdditiveBlending, fog: false });
  m.lampGlow = dec({ color: new THREE.Color(S.lightColor).lerp(new THREE.Color('#ffb870'), 0.25), opacity: 0.62 * gk, blending: THREE.AdditiveBlending, fog: false });
  m.coldGlow = dec({ color: new THREE.Color('#dcecff'), opacity: 0.28, blending: THREE.AdditiveBlending, fog: false });   // fridge light
  // Camera-facing halos around bulbs / shades (one billboard mesh per apartment, built in apartment.js).
  // Each quad = 4 verts sharing the centre `position`; `corner` (±1,±1) and `bsize` expand it in view space.
  m.bloom = new THREE.ShaderMaterial({
    uniforms: { map: { value: (() => { const t = tex(bloomTex(), { srgb: false }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })() }, color: { value: new THREE.Color(S.lightColor).multiplyScalar(1.1 * gk + 0.3) } },
    vertexShader: `attribute vec2 corner; attribute float bsize; attribute float bk; varying vec2 vUv; varying float vK;
      void main(){ vUv = corner * 0.5 + 0.5; vK = bk; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xy += corner * bsize * 0.5; mv.z += bsize * 0.35; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; varying vec2 vUv; varying float vK;
      void main(){ float a = texture2D(map, vUv).a * vK; gl_FragColor = vec4(color * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  m.bloom.userData.noEnv = true;
  // Export hints (glTF): the halo billboard is view-space shader magic → skip it; the decals are plain unlit
  // MeshBasicMaterial quads (KHR_materials_unlit) — additive ones are marked so an exporter/viewer may drop or re-blend them.
  m.bloom.userData.noExport = true;
  for (const k of ['glow', 'glowFaint', 'daylight', 'lampGlow', 'coldGlow']) m[k].userData.additive = true;
  for (const k of ['ao', 'aoSoft', 'shade', 'glow', 'glowFaint', 'daylight', 'lampGlow', 'coldGlow']) m[k].userData.decal = true;

  // The interior IBL (RoomEnvironment, set by the host) is a bright neutral-grey box: at full strength its diffuse
  // term floods every surface with the same grey-white fill — the "washed-out" look. Keep it mostly for reflections:
  // matt surfaces take a fraction of it (the warm point lights, light decals and AO decals do the shaping), glossy
  // ones more, metals / mirrors / glass all of it.
  const envK = { milano: 1, nordic: 1.4, riviera: 1.12 }[styleId];   // the bright Scandinavian look keeps more fill
  for (const v of Object.values(m)) {
    if (!v || !v.isMaterial || v.userData.decal || !('envMapIntensity' in v)) continue;
    if (v.metalness >= 0.5 || v.transparent) continue;
    const r = v.roughness * (v.roughnessMap ? 0.6 : 1);
    v.envMapIntensity *= Math.min(1, (r >= 0.6 ? 0.42 : r >= 0.3 ? 0.62 : 0.85) * envK);
  }
  // name all materials (debug + stable bucket keys)
  for (const [k, v] of Object.entries(m)) if (v && v.isMaterial) v.name = `${styleId}.${k}`;
  // facade glazing: the cheap transparent glass plus a faint daylight emission, so windows read as the brightest
  // surface in the room (the eye adapts to the interior) without hiding the view
  m.glazing = m.glass.clone(); m.glazing.name = `${styleId}.glazing`;
  m.glazing.emissive = new THREE.Color('#dfe8f0'); m.glazing.emissiveIntensity = 0.1; m.glazing.opacity = 0.12;
  m.art.forEach((a, i) => a.name = `${styleId}.art${i}`);
  cache.set(styleId, m);
  if (typeof document !== 'undefined' && !TEXREC) TEXMEM.clear();   // the textures now own their canvases
  return m;
}
