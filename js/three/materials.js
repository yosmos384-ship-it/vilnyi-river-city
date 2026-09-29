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
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function hex(c) { const col = new THREE.Color(c); return [col.r * 255, col.g * 255, col.b * 255]; }
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
function tex(c, { srgb = true, repeat = 1, repeatY } = {}) {
  const t = new THREE.CanvasTexture(c);
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
    const lw = Math.pow(Math.max(0, Math.sin(f * Math.PI)), 18) * 0.85 + Math.pow(f, 7) * 0.35;
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
  const strip = grainStrip(base, seed, 2048, 256, { rings: 8, figure: 0.55, contrast: 0.27, streaks: 0.2 });
  const planks = [];
  for (let m = 0; m < 8; m++) { planks.push([m, m, 4, 1]); planks.push([m + 4, m - 3, 1, 4]); }
  for (const [px, py, pw, ph] of planks) {
    const s0 = seed * 31 + px * 7 + py * 131 + pw, tone = 0.9 + rng(s0 + 5)() * 0.18, rough = 175 + rng(s0 + 9)() * 70;
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
  const strip = grainStrip(base, seed, 2048, 128, { rings: 7, figure: 0.45, contrast: 0.26, streaks: 0.24 });
  const rows = 12, rh = size / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * size * 0.6;
    while (x < size) {
      const len = size * (0.45 + r() * 0.4), s0 = seed + i * 97 + (x * 13 | 0);
      const tone = 0.93 + rng(s0 + 3)() * 0.12, rough = 180 + rng(s0 + 7)() * 60;
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
// Marble: soft cloudy ground + veins drawn along iso-contours of a domain-warped fbm (long meandering lines with
// natural wiggle), loosely aligned by a periodic diagonal bias; a second, finer and fainter vein family; a haze
// around the main veins. All noise is lattice-periodic → seamless.
function marbleTex(size, base, vein, { scale = 3, sharp = 7, seed = 5, vein2, strength = 0.85, network = 0.6 } = {}) {
  const warpA = fbmFn(2, 4, seed), warpB = fbmFn(2, 4, seed + 31), f1 = fbmFn(3, 5, seed + 57), f2 = fbmFn(5, 4, seed + 61), f3 = fbmFn(8, 3, seed + 67);
  const cloud = fbmFn(3, 4, seed + 70), grain = lattice(128, seed + 90);
  const A = hex(base), V = hex(vein), V2 = hex(vein2 || vein);
  const Al = A.map(x => Math.min(255, x * 1.14 + 7)), Ad = A.map(x => x * 0.86);
  const k = Math.max(1, Math.round(scale * 0.5)), T = Math.PI * 2;
  const wv = fbmFn(4, 3, seed + 80);               // vein width varies along its length
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ridge = (n) => 1 - Math.abs(2 * n - 1);
  const line = (r, w) => sm(1 - w, 1 - w * 0.2, r);   // crisp vein of half-width w (in ridge units)
  return pixels(size, (u, v) => {
    const wx = warpA(u, v) - 0.5, wy = warpB(u, v) - 0.5;
    const pu = u + wx * 0.32, pv = v + wy * 0.32;
    const bias = 0.5 + 0.5 * Math.sin(((u + v) * k + wx * 1.2) * T);
    const r1 = ridge(f1(pu, pv) * 0.7 + bias * 0.3), r2 = ridge(f2(pu + 0.31, pv - 0.17)), r3 = ridge(f3(pu - 0.2, pv + 0.4));
    const w = 0.004 + Math.pow(wv(u, v), 3) * 0.045 / (1 + sharp * 0.1);
    const vA = line(r1, w) * strength, halo = line(r1, w * 4) * 0.12 * strength;
    const vB = (line(r2, w * 0.45) * 0.7 + line(r3, 0.0025) * 0.3) * strength * network;
    const c = cloud(u, v);
    let col = c > 0.5 ? mix(A, Al, (c - 0.5) * 1.6) : mix(Ad, A, c * 2);
    col = mix(col, V2, Math.min(1, halo + vB * 0.6));
    col = mix(col, V, Math.min(1, vA + vB * 0.5));
    const gr = (grain(u, v) - 0.5) * 5;
    return [col[0] + gr, col[1] + gr, col[2] + gr];
  });
}
// Tileable furniture wood (veneer): rings run along x, integer ring count over the tile → seamless.
function woodTile(base, seed, size = 512) {
  const warp = fbmFn(2, 4, seed), streak = lattice(128, seed + 4), slow = fbmFn(2, 3, seed + 8);
  const early = base.map(x => x * 1.06 + 4), late = base.map(x => x * 0.72);
  return pixels(size, (u, v) => {
    const t = v * 10 + (warp(u, v) - 0.5) * 1.1 + Math.sin(u * Math.PI * 2 + seed) * 0.25;
    const f = t - Math.floor(t);
    const lw = Math.pow(Math.max(0, Math.sin(f * Math.PI)), 16) * 0.8 + Math.pow(f, 7) * 0.3;
    const col = mix(early, late, Math.min(1, lw)), k = 0.92 + (streak(u * 0.125, v) - 0.5) * 0.18 + (slow(u, v) - 0.5) * 0.2;
    return [col[0] * k, col[1] * k, col[2] * k];
  });
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
    else if (kind === 'jute') { const w = Math.sin(x * 0.8) * Math.sin(y * 0.8); t = 0.7 + w * 0.18 + (n(u, v) - 0.5) * 0.25; }
    else { const w = ((x % 3 < 1.5) ^ (y % 3 < 1.5)) ? 0.06 : -0.04; t = 0.82 + w + (n(u, v) - 0.5) * 0.14; }
    const g = Math.max(0, Math.min(1, t)) * 255; return [g, g, g];
  }, size);
}
// Weave / pile heightmaps → normal maps (tiny repeat: one tile ≈ 5–8 cm of cloth)
function weaveHeight(kind, seed = 3, size = 256) {
  const n = lattice(64, seed), n2 = lattice(128, seed + 1), n3 = fbmFn(16, 3, seed + 2);
  const T = kind === 'linen' ? 10 : kind === 'boucle' ? 8 : 8;       // thread period (px)
  return pixels(size, (u, v, x, y) => {
    let hgt;
    if (kind === 'boucle') {
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
// Effects atlas (2×2 cells, alpha only, white): 0 soft disc · 1 soft rectangle · 2 edge gradient (dense at the
// cell's top edge) · 3 downlight "scallop" wash (source at the cell's top centre). Used by the contact-shadow (AO)
// decals and the additive light decals; one texture → the decals of each material merge into one draw call.
function fxAtlas(size = 512) {
  const c = canvas(size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data, H = size / 2, pad = 3;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = x >= H ? 1 : 0, cy = y >= H ? 1 : 0, cell = cy * 2 + cx;
    const lx = x - cx * H, ly = y - cy * H;
    if (lx < pad || ly < pad || lx >= H - pad || ly >= H - pad) continue;
    const u = (lx - pad) / (H - 2 * pad - 1), v = (ly - pad) / (H - 2 * pad - 1);   // 0..1, v down
    const sx = u * 2 - 1, sy = v * 2 - 1;
    let a = 0;
    if (cell === 0) { const r = Math.min(1, Math.hypot(sx, sy)); a = Math.pow(1 - r * r, 2.2); }
    else if (cell === 1) { a = sm(1, 0.35, Math.abs(sx)) * sm(1, 0.35, Math.abs(sy)); a = Math.pow(a, 0.9); }
    else if (cell === 2) { a = Math.pow(1 - v, 2.4) * sm(1, 0.93, Math.abs(sx)); }
    else {
      const arc = 0.04 + 0.55 * sx * sx;                // parabolic cut-off line of the beam on the wall
      const inside = v >= arc ? Math.exp(-(v - arc) * 2.2) : Math.exp(-(arc - v) * 30);
      a = inside * Math.pow(Math.max(0, 1 - Math.abs(sx)), 1.3) * sm(1, 0.7, v) * sm(0, 0.08, v) * 0.85;
    }
    const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.max(0, Math.min(255, a * 255));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function plasterTex(seed = 4, strength = 0.06, size = 512) {
  const f = fbmFn(6, 5, seed);
  return pixels(size, (u, v) => { const g = (1 - strength + f(u, v) * strength * 2) * 235; return [g, g, g]; });
}
function limewashTex(seed = 8, size = 512) {
  const f = fbmFn(3, 5, seed), g2 = fbmFn(12, 3, seed + 3);
  return pixels(size, (u, v) => { const t = f(u, v) * 0.75 + g2(u, v) * 0.25; const g = (0.84 + t * 0.2) * 240; return [g, g, g]; });
}
function woodFurnitureTex(base, seed, size = 512) { return woodTile(base, seed, size); }
function caneTex(base, size = 256) {
  const c = canvas(size), ctx = c.getContext('2d'); const col = hex(base);
  ctx.fillStyle = rgbStr(col, 0.55); ctx.fillRect(0, 0, size, size);
  const s = size / 8;
  ctx.lineWidth = s * 0.28; ctx.lineCap = 'round';
  for (let i = -8; i < 16; i++) {
    ctx.strokeStyle = rgbStr(col, 1.05); ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s + size, size); ctx.stroke();
    ctx.strokeStyle = rgbStr(col, 0.95); ctx.beginPath(); ctx.moveTo(i * s + size, 0); ctx.lineTo(i * s, size); ctx.stroke();
  }
  ctx.strokeStyle = rgbStr(col, 1.12); ctx.lineWidth = s * 0.22;
  for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke(); }
  // holes
  ctx.fillStyle = 'rgba(20,14,8,0.85)';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { ctx.beginPath(); ctx.arc(i * s + s / 2, j * s + s / 2, s * 0.16, 0, 6.28); ctx.fill(); }
  return c;
}
function rugTex(style, size = 1024) {
  const c = canvas(size), ctx = c.getContext('2d');
  const noise = fabricTex(style === 'riviera' ? 'jute' : 'boucle', 11, 256);
  if (style === 'milano') {
    ctx.fillStyle = '#4a4744'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#8f7a5a'; ctx.lineWidth = 6; ctx.strokeRect(40, 40, size - 80, size - 80);
    ctx.strokeStyle = '#353230'; ctx.lineWidth = 26; ctx.strokeRect(80, 80, size - 160, size - 160);
    ctx.globalAlpha = 0.18; ctx.strokeStyle = '#b8a07a'; ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(size / 2, size / 2, 60 + i * 28, 0, 6.28); ctx.stroke(); }
    ctx.globalAlpha = 1;
  } else if (style === 'nordic') {
    ctx.fillStyle = '#e8e2d6'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#d7cfc0';
    for (let i = 0; i < 26; i++) ctx.fillRect(0, i * size / 26, size, 6);
    ctx.strokeStyle = '#bdb3a2'; ctx.lineWidth = 10; ctx.strokeRect(24, 24, size - 48, size - 48);
  } else {
    ctx.fillStyle = '#c9ae83'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#a88b5f'; ctx.lineWidth = 34; ctx.strokeRect(34, 34, size - 68, size - 68);
    ctx.strokeStyle = '#e6d6b8'; ctx.lineWidth = 8; ctx.strokeRect(80, 80, size - 160, size - 160);
  }
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.9;
  for (let x = 0; x < size; x += 256) for (let y = 0; y < size; y += 256) ctx.drawImage(noise, x, y);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  return c;
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

  // ---------- floors (colour + normal + roughness maps; tiles/planks carry their own variation)
  if (styleId === 'milano') {
    const hb = herringbone(hex('#7b5a40'), 11), R = 1 / 0.72;
    m.floor = std({ map: tex(hb.map, { repeat: R }), normalMap: tex(hb.normal, { srgb: false, repeat: R }), normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: tex(hb.rough, { srgb: false, repeat: R }), roughness: 0.82, metalness: 0, envMapIntensity: 0.45 });
    const mb = marbleTex(1024, '#151414', '#e6e0d4', { scale: 2, sharp: 3, seed: 21, vein2: '#57514a', strength: 0.85, network: 0.9 });
    m.marble = phys({ map: tex(mb, { repeat: 1 / 1.6 }), roughness: 0.14, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 1.0 });
    const tb = tileTex({ size: 512, tilesX: 2, tilesY: 2, colors: ['#1f1e1d'], grout: '#2c2a28', groutW: 3, surface: mb });
    m.floorBath = std({ map: tex(tb.map, { repeat: 1 / 1.2 }), normalMap: nrm(tb.bump, 1.5, 1 / 1.2), roughness: 0.22, envMapIntensity: 0.9 });
    m.wallBath = phys({ map: tex(mb, { repeat: 1 / 2.4 }), roughness: 0.26, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.9 });
    m.counter = m.marble;
    m.stone = phys({ map: tex(marbleTex(512, '#ebe6de', '#9a9084', { scale: 3, sharp: 3, seed: 33, strength: 0.65, network: 0.5 }), { repeat: 1 / 1.2 }), roughness: 0.16, clearcoat: 0.5, envMapIntensity: 0.9 });
  } else if (styleId === 'nordic') {
    const wp = widePlanks(hex('#d6bd97'), 12), R = 1 / 2.4;
    m.floor = std({ map: tex(wp.map, { repeat: R }), normalMap: tex(wp.normal, { srgb: false, repeat: R }), normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: tex(wp.rough, { srgb: false, repeat: R }), roughness: 0.88, envMapIntensity: 0.55 });
    const mb = marbleTex(1024, '#f2f0ec', '#9c978f', { scale: 3, sharp: 5, seed: 22, vein2: '#cdc8c0', strength: 0.6, network: 0.7 });
    m.marble = phys({ map: tex(mb, { repeat: 1 / 1.4 }), roughness: 0.14, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });
    const tb = tileTex({ size: 512, tilesX: 8, tilesY: 8, colors: ['#d9d7d2', '#d3d1cc', '#dcdad5'], grout: '#bdbab4', groutW: 2 });
    m.floorBath = std({ map: tex(tb.map, { repeat: 1 / 1.2 }), normalMap: nrm(tb.bump, 1.5, 1 / 1.2), roughness: 0.5 });
    const wt = tileTex({ size: 512, tilesX: 4, tilesY: 16, colors: ['#f4f3f0', '#eeede9', '#f1f0ec'], grout: '#dcdad5', groutW: 2, pattern: 'brick', glaze: 0.04 });
    m.wallBath = phys({ map: tex(wt.map, { repeat: 1 / 1.2 }), normalMap: nrm(wt.bump, 2, 1 / 1.2), roughness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.08, envMapIntensity: 0.8 });
    m.counter = phys({ map: tex(marbleTex(512, '#f3f2ef', '#b5afa6', { scale: 2, sharp: 3, seed: 44, strength: 0.55, network: 0.45 }), { repeat: 1 / 1.2 }), roughness: 0.18, clearcoat: 0.4 });
    m.stone = m.counter;
  } else {
    const tr = stoneTex(1024, '#e4d6bc', '#c9b38c', { bands: 14, pores: 0.06, seed: 7, contrast: 0.75 });
    const tt = tileTex({ size: 1024, tilesX: 2, tilesY: 2, colors: ['#e2d2b4', '#dccbad', '#e6d7bb'], grout: '#cdbb9b', groutW: 3, surface: tr, glaze: 0.03 });
    // floor height = tile grid + the travertine pores
    const th = canvas(1024), thc = th.getContext('2d'); thc.drawImage(tt.bump, 0, 0); thc.globalCompositeOperation = 'multiply'; thc.drawImage(tr.height_, 0, 0);
    m.floor = std({ map: tex(tt.map, { repeat: 1 / 1.6 }), normalMap: nrm(th, 2.2, 1 / 1.6), roughness: 0.5, envMapIntensity: 0.7 });
    const trN = nrm(tr.height_, 1.6, 1 / 1.4);
    m.marble = std({ map: tex(tr, { repeat: 1 / 1.4 }), normalMap: trN, roughness: 0.42, envMapIntensity: 0.8 });
    const zel = tileTex({ size: 512, tilesX: 8, tilesY: 8, colors: ['#ebe1cf', '#e7dcc8', '#eee5d5', '#e4d8c2', '#e9dfcc'], grout: '#dccdb3', groutW: 3, glaze: 0.035 });
    // zellige: hand-made undulating glaze → low-frequency height on top of the grout grid
    const zh = canvas(512), zhc = zh.getContext('2d'); zhc.drawImage(zel.bump, 0, 0); zhc.globalAlpha = 0.35; zhc.drawImage(plasterTex(31, 0.9, 512), 0, 0); zhc.globalAlpha = 1;
    m.wallBath = phys({ map: tex(zel.map, { repeat: 1 / 0.8 }), normalMap: nrm(zh, 2.2, 1 / 0.8), roughness: 0.16, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.95 });
    const bt = tileTex({ size: 512, tilesX: 6, tilesY: 6, colors: ['#b8653f', '#c07049', '#ad5d39', '#c47a55', '#b26a44'], grout: '#d9c7aa', groutW: 3, glaze: 0.1 });
    m.floorBath = std({ map: tex(bt.map, { repeat: 1 / 1.2 }), normalMap: nrm(bt.bump, 1.6, 1 / 1.2), roughness: 0.62 });
    m.counter = std({ map: tex(tr, { repeat: 1 / 1.2 }), normalMap: trN, roughness: 0.35 });
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
  const wallCol = { milano: '#c4b8a8', nordic: '#f1efea', riviera: '#eadcc6' }[styleId];
  m.wall = std({ color: wallCol, map: styleId === 'riviera' ? lime : plaster, normalMap: nPlaster, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.9, envMapIntensity: 0.35 });
  m.ceiling = std({ color: { milano: '#f2eee7', nordic: '#fbfaf8', riviera: '#f5eee2' }[styleId], roughness: 0.95, envMapIntensity: 0.3 });
  m.cutCap = std({ color: '#f4f2ee', roughness: 0.9 });
  m.skirting = std({ color: { milano: '#2a2522', nordic: '#f4f2ee', riviera: '#e2d2b8' }[styleId], roughness: 0.45, envMapIntensity: 0.6 });
  m.exterior = std({ color: '#ece8e0', map: plaster, roughness: 0.85 });

  // ---------- woods
  const woodBase = { milano: '#5a3a26', nordic: '#caa77c', riviera: '#9b7552' }[styleId];
  m.wood = std({ map: tex(woodFurnitureTex(hex(woodBase), 5), { repeat: 1.2 }), roughness: 0.45, envMapIntensity: 0.6 });
  m.woodDark = std({ map: tex(woodFurnitureTex(hex({ milano: '#3a2519', nordic: '#8a6a48', riviera: '#6e4f35' }[styleId]), 6), { repeat: 1.2 }), roughness: 0.4 });
  m.woodLight = std({ map: tex(woodFurnitureTex(hex('#d5b890'), 9), { repeat: 1.2 }), roughness: 0.55 });
  m.teak = std({ map: tex(woodFurnitureTex(hex('#8c6440'), 10), { repeat: 2 }), roughness: 0.7 });
  // feature wall: milano = fluted walnut; nordic = oak slats; riviera = limewash plaster arch niche
  m.wallAccent = styleId === 'milano' ? m.woodDark : styleId === 'nordic' ? m.woodLight : std({ color: '#dcc6a6', map: lime, normalMap: nPlaster, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.95 });

  // ---------- lacquer / cabinetry
  const lac = { milano: '#1f1e1d', nordic: '#efede8', riviera: '#6f7350' }[styleId];
  m.lacquer = phys({ color: lac, roughness: styleId === 'milano' ? 0.35 : 0.55, clearcoat: styleId === 'riviera' ? 0.4 : 0.2, clearcoatRoughness: 0.4, envMapIntensity: 0.6 });
  m.lacquer2 = styleId === 'nordic' ? m.woodLight : styleId === 'milano' ? m.wood : phys({ color: '#e8dcc6', roughness: 0.6, clearcoat: 0.2 });
  m.doorLeaf = styleId === 'milano' ? m.woodDark : std({ color: { nordic: '#f4f2ee', riviera: '#e9dcc6' }[styleId], roughness: 0.6 });
  m.frame = std({ color: { milano: '#1d1c1b', nordic: '#262626', riviera: '#5a4a3a' }[styleId], roughness: 0.45, metalness: 0.4 });
  m.doorFrame = styleId === 'milano' ? m.woodDark : m.skirting;

  // ---------- metals
  m.brass = std({ color: '#c49a5c', metalness: 1, roughness: 0.3, envMapIntensity: 1.2 });
  m.blackMetal = std({ color: '#161616', metalness: 0.6, roughness: 0.45 });
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
    riviera: { sofa: ['#efe7d8', boucle], chair: ['#e5dac6', boucle], accent: '#b5623b', c1: '#b5623b', c2: '#7b7f52', c3: '#e2c69a', throw: '#c98d5f', duvet: '#f1e9dc', head: '#e3d6c1', curtain: '#e6dac5', sheer: '#f7f1e6', towel: '#efe6d5', towel2: '#b5623b', outdoor: '#ece2cf' },
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
  m.throw = std({ color: P.throw, map: tex(fabricTex('boucle', 14), { repeat: 3 }), normalMap: nBoucle, roughness: 1, side: THREE.DoubleSide });
  m.linen = std({ color: '#f6f3ee', map: linen, normalMap: nLinen, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, envMapIntensity: 0.5 });
  m.duvet = std({ color: P.duvet, map: linen, normalMap: nLinen, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, envMapIntensity: 0.5, side: THREE.DoubleSide });
  m.headboard = std({ color: P.head, map: styleId === 'milano' ? velvet : linen, normalMap: styleId === 'milano' ? nVelvet : nLinen, roughness: 0.9 });
  m.curtain = std({ color: P.curtain, map: linen, normalMap: nLinen, roughness: 0.95, side: THREE.DoubleSide });
  // sheers are back-lit by the daylight behind them: a little emissive makes them glow like real voile
  m.sheer = std({ color: P.sheer, map: linen, roughness: 0.9, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color('#fff4e4'), emissiveIntensity: 0.28 });
  m.towel = std({ color: P.towel, map: tex(fabricTex('boucle', 15), { repeat: 6 }), normalMap: nBoucle, roughness: 1 });
  m.towel2 = std({ color: P.towel2, map: tex(fabricTex('boucle', 16), { repeat: 6 }), normalMap: nBoucle, roughness: 1 });
  m.outdoorFabric = std({ color: P.outdoor, map: fab, normalMap: nWeave, roughness: 0.95 });
  m.rug = std({ map: tex(rugTex(styleId), { repeat: 1 }), normalMap: nRug, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1, envMapIntensity: 0.2 });
  m.cane = std({ map: tex(caneTex('#c9a26b'), { repeat: 6 }), roughness: 0.75 });
  m.rattan = std({ color: '#b98f5a', map: tex(fabricTex('jute', 18), { repeat: 4 }), normalMap: nBoucle, roughness: 0.85 });
  m.accentFabric = std({ color: P.accent, map: velvet, normalMap: nVelvet, roughness: 0.9 });

  // ---------- ceramics, table, food
  m.porcelain = phys({ color: '#fbfbfa', roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 0.9 });
  m.ceramic = phys({ color: { milano: '#f3efe8', nordic: '#f4f3ef', riviera: '#f1e8d8' }[styleId], roughness: 0.2, clearcoat: 0.6 });
  m.ceramic2 = phys({ color: { milano: '#1f1f21', nordic: '#b7c1bd', riviera: '#b5623b' }[styleId], roughness: 0.3, clearcoat: 0.5 });
  m.cutlery = std({ color: styleId === 'milano' ? '#d6b27a' : '#dcdcdc', metalness: 1, roughness: 0.18, envMapIntensity: 1.3 });
  m.napkin = std({ color: { milano: '#6b6258', nordic: '#dcd6cb', riviera: '#b5623b' }[styleId], map: linen, roughness: 1 });
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

  // ---------- plants
  m.leaf = std({ map: tex(leafTex(styleId === 'riviera' ? '#6a7a48' : '#35602d')), roughness: 0.42, side: THREE.DoubleSide, envMapIntensity: 0.7 });
  m.leaf2 = std({ map: tex(leafTex(styleId === 'riviera' ? '#8a9868' : '#4f7a35')), roughness: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  m.stem = std({ color: '#5b4632', roughness: 0.8 });
  m.soil = std({ color: '#2b2018', roughness: 1 });
  m.pot = phys({ color: { milano: '#1c1b1b', nordic: '#e9e6e0', riviera: '#b76a45' }[styleId], roughness: 0.45, clearcoat: 0.3 });
  m.pot2 = std({ color: { milano: '#8a7d6d', nordic: '#b6aea3', riviera: '#d9c6a5' }[styleId], roughness: 0.8 });
  m.flower = std({ color: { milano: '#f3efe6', nordic: '#f6f2ea', riviera: '#f0c9a2' }[styleId], roughness: 0.8, side: THREE.DoubleSide });

  // ---------- art
  m.art = [0, 1, 2].map(i => std({ map: tex(artTex(styleId, i), { repeat: 1 }), roughness: 0.9, envMapIntensity: 0.3 }));
  m.artFrame = styleId === 'nordic' ? m.woodLight : styleId === 'milano' ? m.brass : m.woodDark;

  // ---------- light emitters (these are what makes the scene read "lit")
  const L = new THREE.Color(S.lightColor);
  m.lightEmit = std({ color: '#ffffff', emissive: L, emissiveIntensity: 2.6, roughness: 1 });
  m.led = std({ color: '#ffffff', emissive: L, emissiveIntensity: 3.2, roughness: 1 });
  m.lampShade = std({ color: { milano: '#e7dccb', nordic: '#f5f1ea', riviera: '#efe2cc' }[styleId], emissive: L, emissiveIntensity: 0.7, roughness: 0.9, side: THREE.DoubleSide });
  m.bulb = std({ color: '#fff', emissive: L, emissiveIntensity: 4 });
  m.plastic = std({ color: '#f2f2f0', roughness: 0.35 });
  m.darkPlastic = std({ color: '#1b1b1c', roughness: 0.4 });
  m.collider = new THREE.MeshBasicMaterial({ visible: false });

  // ---------- baked-look light & shadow decals (one shared atlas; unlit, no depth write)
  // ao / aoSoft: soft contact shadows under furniture and in wall/floor/ceiling junctions (normal blending, black)
  // glow / glowFaint: additive warm light pools, downlight scallops, lamp halos, cove wash; daylight: window spill
  const fx = tex(fxAtlas(), { repeat: 1 }); fx.wrapS = fx.wrapT = THREE.ClampToEdgeWrapping;
  const dec = (o) => new THREE.MeshBasicMaterial({ map: fx, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, ...o });
  const aoK = { milano: 0.72, nordic: 0.46, riviera: 0.52 }[styleId];
  m.ao = dec({ color: 0x000000, opacity: aoK });
  m.aoSoft = dec({ color: 0x000000, opacity: aoK * 0.42 });
  const gk = { milano: 1, nordic: 0.7, riviera: 0.8 }[styleId];
  m.glow = dec({ color: L, opacity: 0.5 * gk, blending: THREE.AdditiveBlending, fog: false });
  m.glowFaint = dec({ color: L, opacity: 0.2 * gk, blending: THREE.AdditiveBlending, fog: false });
  m.daylight = dec({ color: new THREE.Color('#fff3e2'), opacity: 0.2 * gk, blending: THREE.AdditiveBlending, fog: false });

  // name all materials (debug + stable bucket keys)
  for (const [k, v] of Object.entries(m)) if (v && v.isMaterial) v.name = `${styleId}.${k}`;
  m.art.forEach((a, i) => a.name = `${styleId}.art${i}`);
  cache.set(styleId, m);
  return m;
}
