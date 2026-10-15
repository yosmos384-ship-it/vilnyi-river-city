// styles.js — V3 "renovation options" (STYLE bot). Three complete renovation styles that can be switched live:
//   modern  "מודרני יוקרתי"          (default)  warm greige plaster, natural oak herringbone, deep-green kitchen, Calacatta, brass
//   classic "קלאסי חם"                         taupe/sage painted paneling, walnut-stained oak, cream shaker + soapstone, nickel
//   dark    "סקנדינבי / כהה עכשווי"            charcoal limewash, light wire-brushed oak, matte-black kitchen + Nero Marquina
//
// Mechanism
//  - init() (once, after all modules built) tags every material with userData.styleKey = semantic slot ('wall', 'floorMain',
//    'counter', 'sofaFabric', …) and userData.styleSrc = its source material. A material reused for different purposes is
//    cloned per purpose (e.g. plasterWall → wall / wallAccent / wallKitchen / wallBathPaint). Materials that never change
//    get 'static:*' tags. Cabinet paint and slot-atlas brass hardware live in VERTEX COLOURS of the interior 'duo'
//    material: those vertices are found once and recoloured per style (no material change at all).
//  - A style gives per slot: c (target average albedo, sRGB hex; null = original look), r (material.roughness, a multiplier
//    of the roughness map on textured materials), m (metalness), tex (procedural texture recipe, generated lazily on the
//    first switch and cached; '=slot' reuses the original maps of another slot), ns (normal scale), sheen, cc (clearcoat), env.
//    The colour is applied as material.color = target / (average vertex colour × average map colour), so the texture detail
//    is kept and the visible average equals the target.
//  - Every slot keeps the same map presence in all styles → a switch never recompiles shaders (no material.needsUpdate),
//    it only swaps uniforms / textures and re-uploads a few colour attributes.
//  - set(id) → Promise; persists to localStorage ('eakin_style'), refreshes probes + shadows, calls
//    window.__tour.render.normalizeMaterials() when present. list() → [{id, he, en, desc, materials}].
// No side effects at import.
import { STYLE_GEN as G, noiseField, rand } from './mats.js';
import { makeNoise, synth } from './interior-tex.js';

const LS_KEY = 'eakin_style';
const DEFAULT = 'modern';
const TAU = Math.PI * 2;

/* ================================================================== style definitions */
// colours are sRGB hex strings = intended AVERAGE albedo of the surface (realistic: walls 0.45–0.7 linear-ish, no pure white)
const MODERN = {
  // walls / ceilings / trim
  wall: { c: '#D9D2C7' }, wallAccent: { c: '#CFC6B8' }, wallKitchen: { c: '#D9D2C7' }, wallBathPaint: { c: '#D6CFC4' },
  ceiling: { c: '#E8E4DC' }, trim: { c: '#E8E4DC' }, trimAccent: { c: '#E8E4DC' }, door: { c: '#E6E1D8', r: 0.34 },
  // floors / stone (null = original procedural look)
  floorMain: { c: null }, floorBed: { c: null }, stairWood: { c: null }, floorBath: { c: null }, wallBath: { c: null },
  // metals / frames
  doorExt: { c: '#141516' }, windowFrame: { c: '#18191A' }, metalDark: { c: null }, hardware: { c: null }, faucetMetal: { c: null },
  // exterior
  extWall: { c: '#D3CFC7' }, extGable: { c: '#DCD8D0' }, extTrim: { c: '#E8E4DC' }, roof: { c: null }, shutter: { c: '#2B2D30' },
  cedar: { c: null }, gutter: { c: '#1A1B1C' },
  // basement
  basementWall: { c: '#C9C6C0' }, basementCeil: { c: '#D6D2CA' }, basementFloor: { c: null },
  // kitchen / baths
  counter: { c: null }, vanityTop: { c: null }, cabinet: { c: '#34483C' }, hood: { c: '#E0D8CA' },
  // furniture / soft goods
  wood: { c: null }, woodLight: { c: null }, stoneTable: { c: null },
  sofaFabric: { c: '#D6CCBB', sheen: '#FFFFFF' }, upholstery: { c: '#D2C8B6' }, chairLeather: { c: '#9A5A2E' },
  headboard: { c: null }, velvetAccent: { c: null }, clubChair: { c: null },
  curtain: { c: '#D3C7B2' }, bedding: { c: '#E0D7C8' }, linen: { c: null }, rug: { c: '#C9BEAC' }, towel: { c: '#E4DCCF' }, throw: { c: null },
};
const CLASSIC = {
  wall: { c: '#C2B5A2' }, wallAccent: { c: '#9AA38C', tex: 'beadboard', ns: 1 }, wallKitchen: { c: '#D6CCB8' }, wallBathPaint: { c: '#C9BFAE' },
  ceiling: { c: '#E6E0D3' }, trim: { c: '#E4DCCC' }, trimAccent: { c: '#97A089' }, door: { c: '#E2DACA', r: 0.3 },
  floorMain: { c: '#6F4C34', tex: '=floorBed', ns: 1.1 }, floorBed: { c: '#6F4C34', ns: 1.1 }, stairWood: { c: '#6A4630' },
  floorBath: { c: null, tex: 'checker', ns: 1 }, wallBath: { c: null, tex: 'subway', ns: 1 },
  doorExt: { c: '#5B1F1E', r: 0.3 }, windowFrame: { c: '#E6E1D6', r: 0.4, m: 0 }, metalDark: { c: null }, hardware: { c: '#C9C6BE', r: 0.55 }, faucetMetal: { c: '#C9C6BE', r: 0.55 },
  extWall: { c: '#CDC2AC' }, extGable: { c: '#2F3B4F' }, extTrim: { c: '#E8E4DC' }, roof: { c: '#4A423C' }, shutter: { c: '#1E1F21' },
  cedar: { c: null }, gutter: { c: '#E3DED3' },
  basementWall: { c: '#CFC8BC' }, basementCeil: { c: '#D8D0C2' }, basementFloor: { c: null },
  counter: { c: null, tex: 'soapstone', cc: 0.15, ns: 0.5 }, vanityTop: { c: '#E2E0DC' }, cabinet: { c: '#E3DBC9' }, hood: { c: '#E3DBC9' },
  wood: { c: '#5E3A28' }, woodLight: { c: '#7A5538' }, stoneTable: { c: '#D2C4A8' },
  sofaFabric: { c: '#5A3524', tex: '=chairLeather', ns: 0.45, sheen: '#1E1A18' }, upholstery: { c: '#B8A88C' }, chairLeather: { c: '#5C2A22' },
  headboard: { c: '#34405A' }, velvetAccent: { c: '#7A2E2A' }, clubChair: { c: '#5C2A22' },
  curtain: { c: '#B7A47C' }, bedding: { c: '#E2D8C4' }, linen: { c: '#C9B99A' }, rug: { c: null, tex: 'oriental', ns: 0.8 }, towel: { c: '#E5DDCC' }, throw: { c: '#7A2E2A' },
};
const DARK = {
  wall: { c: '#C4BEB5' }, wallAccent: { c: '#4A4744', tex: 'limewash', ns: 0.8 }, wallKitchen: { c: '#4A4744', tex: 'limewash', ns: 0.8 },
  wallBathPaint: { c: '#A39B90', tex: 'microcement', ns: 0.7 },
  ceiling: { c: '#DCD7CF' }, trim: { c: '#BDB6AC' }, trimAccent: { c: '#45423F' }, door: { c: '#2B2A29', r: 0.5 },
  floorMain: { c: '#CDB896', tex: '=floorBed', r: 1.15, ns: 1.6 }, floorBed: { c: '#CDB896', r: 1.15, ns: 1.6 }, stairWood: { c: '#C8B391', r: 1.1 },
  floorBath: { c: '#8F887E', tex: 'microcement', ns: 0.7 }, wallBath: { c: '#A69E93', tex: 'microcement', ns: 0.7 },
  doorExt: { c: '#121212' }, windowFrame: { c: '#121314' }, metalDark: { c: null }, hardware: { c: '#3A3B3D', r: 0.8 }, faucetMetal: { c: '#2E2F31', r: 0.8 },
  extWall: { c: '#3C3D3E' }, extGable: { c: '#3C3D3E' }, extTrim: { c: '#2A2B2C' }, roof: { c: '#2A2A2B' }, shutter: { c: '#8A5A3A' },
  cedar: { c: '#A8693F' }, gutter: { c: '#141414' },
  basementWall: { c: '#B9B4AC' }, basementCeil: { c: '#3E3C3A' }, basementFloor: { c: null },
  counter: { c: null, tex: 'nero', cc: 0.6, ns: 0.3 }, vanityTop: { c: null, tex: 'nero', cc: 0.6, ns: 0.3 }, cabinet: { c: '#232221' }, hood: { c: '#3E3B38' },
  wood: { c: '#4B3122' }, woodLight: { c: '#C7B08C' }, stoneTable: { c: '#8D877E' },
  sofaFabric: { c: '#55613D', tex: '=headboard', ns: 0.4, sheen: '#A3B285' }, upholstery: { c: '#6E6A62' }, chairLeather: { c: '#262422' },
  headboard: { c: '#3D3B39' }, velvetAccent: { c: '#55613D' }, clubChair: { c: '#262422' },
  curtain: { c: '#6E6961' }, bedding: { c: '#8C877E' }, linen: { c: '#7A746B' }, rug: { c: '#4F4C47' }, towel: { c: '#8E8880' }, throw: { c: '#3E3C3A' },
};

export const STYLES = [
  {
    id: 'modern', he: 'מודרני יוקרתי', en: 'Modern Luxury',
    desc: 'יוקרה חמה ושקטה: טיח גרז׳ חם, פרקט אלון אדרה טבעי, מטבח ירוק עמוק עם שיש קלקטה ופליז מוברש, חלונות פלדה שחורים, ספת בוקלה וכורסת עור קוניאק.',
    materials: 'קירות: טיח גרז׳ חם · רצפה: אלון אדרה טבעי · מטבח: ירוק עמוק + שיש קלקטה · פרזול: פליז מוברש · אמבטיה: אריחי שיש גדולים · חוץ: אפור-חם + חלונות שחורים',
    swatch: ['#D9D2C7', '#C49A6C', '#34483C', '#EDE8E0', '#D2AB62'],
    light: [1, 1, 1], slots: MODERN,
  },
  {
    id: 'classic', he: 'קלאסי חם', en: 'Warm Classic',
    desc: 'אמריקאי מסורתי וחם: חיפוי עץ צבוע בטאופ ומרווה, פרקט אלון בגוון אגוז, מטבח שייקר קרם עם משטחי סטון כהה וניקל מבריק, אריחי מטרו עם רובה כהה, שטיח פרסי, ספת צ׳סטרפילד מעור ותאורה חמימה.',
    materials: 'קירות: טאופ + חיפוי מרווה · רצפה: אלון בגוון אגוז · מטבח: שייקר קרם + סטון כהה · פרזול: ניקל מבריק · אמבטיה: מטרו עם רובה כהה + שחמט · חוץ: גמלונים כחול נייבי, תריסים שחורים',
    swatch: ['#C2B5A2', '#9AA38C', '#6F4C34', '#E3DBC9', '#45494A'],
    light: [1, 0.93, 0.82], slots: CLASSIC,
  },
  {
    id: 'dark', he: 'סקנדינבי / כהה עכשווי', en: 'Dark Contemporary',
    desc: 'עכשווי ודרמטי: קירות סיד פחם במטבח ובסלון, פרקט אלון בהיר מוברש, מטבח שחור מט עם שיש נרו מרקינה ונגיעות אגוז, מיקרו-בטון באמבטיות, ספה נמוכה בקטיפה ירוקת-אזוב וחוץ פחם עם ארז.',
    materials: 'קירות: סיד פחם + אפור חם · רצפה: אלון בהיר מוברש · מטבח: שחור מט + שיש נרו מרקינה · פרזול: גאנמטל · אמבטיה: מיקרו-בטון אפור חם · חוץ: פחם + חלונות שחורים + ארז',
    swatch: ['#4A4744', '#CDB896', '#232221', '#1E1E1F', '#55613D'],
    light: [1, 0.98, 0.95], slots: DARK,
  },
];
const BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s]));
export function list() { return STYLES.map((s) => ({ id: s.id, he: s.he, en: s.en, desc: s.desc, materials: s.materials, swatch: s.swatch.slice() })); }

/* ================================================================== colour helpers */
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexLin(h) {
  const n = typeof h === 'number' ? h : parseInt(String(h).replace('#', ''), 16);
  return [s2l(((n >> 16) & 255) / 255), s2l(((n >> 8) & 255) / 255), s2l((n & 255) / 255)];
}
const rgbLin = (a) => [s2l(a[0] / 255), s2l(a[1] / 255), s2l(a[2] / 255)];

/* ================================================================== texture recipes */
// House recipes: meter UVs (mats.js finish() sets repeat = 1 / tile). Interior recipes: 0..1 tile (UVs pre-scaled).
// Every recipe returns {map, normalMap, roughnessMap, avg:[linear rgb]}.
function avgOfCol(col, n) { // col: Float32 sRGB 0..255 triplets
  let r = 0, g = 0, b = 0; const st = Math.max(1, (n / 4096) | 0); let k = 0;
  for (let i = 0; i < n; i += st) { r += s2l(Math.min(255, col[i * 3]) / 255); g += s2l(Math.min(255, col[i * 3 + 1]) / 255); b += s2l(Math.min(255, col[i * 3 + 2]) / 255); k++; }
  return [r / k, g / k, b / k];
}
function fin(THREE, B, o) { const t = G.finish(THREE, Object.assign(B, o)); t.avg = avgOfCol(B.col, B.w * B.h); return t; }

// vertical painted beadboard (V-groove + bead every 10 cm) — classic painted paneling
function texBeadboard(THREE, S) {
  const B = G.buffers(S, S), tile = 0.6, px = tile / S;
  const streak = noiseField(S, S, rand(611), 3, 64, 3), soft = noiseField(S, S, rand(612), 3, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = (x + 0.5) * px, a = u % 0.1, d = Math.min(a, 0.1 - a);
    let h = 0.85;
    if (d < 0.0018) h = 0.25 + 0.6 * (d / 0.0018);
    else if (a > 0.004 && a < 0.011) h = 0.85 + 0.12 * Math.sin(Math.PI * (a - 0.004) / 0.007);
    const k = 1 + (streak[i] - 0.5) * 0.035 + (soft[i] - 0.5) * 0.03;
    G.put(B, i, 214 * k, 212 * k, 206 * k);
    B.hgt[i] = h + (streak[i] - 0.5) * 0.02;
    B.rgh[i] = 0.5 + (streak[i] - 0.5) * 0.1 + (d < 0.0018 ? 0.15 : 0);
  }
  return fin(THREE, B, { tile: [tile, tile], depth: 0.004, cavity: 1.0, cavityR: 2 });
}
// glazed 3x6" subway tile (running bond) with charcoal grout
function texSubway(THREE, S) {
  const B = G.buffers(S, S), tile = 0.6, px = tile / S, tw = 0.15, th = 0.075, gw = 0.003;
  const f = noiseField(S, S, rand(621), 4, 6), f2 = noiseField(S, S, rand(622), 2, 48);
  for (let y = 0; y < S; y++) {
    const v = (S - y - 0.5) * px, r = Math.floor(v / th), lv = v - r * th, off = (r % 2) * tw / 2;
    for (let x = 0; x < S; x++) {
      const i = y * S + x; let u = (x + 0.5) * px - off; u = ((u % tile) + tile) % tile;
      const c = Math.floor(u / tw), lu = u - c * tw, d = Math.min(lu, tw - lu, lv, th - lv);
      if (d < gw / 2) { G.put(B, i, 72, 69, 66); B.hgt[i] = 0.1; B.rgh[i] = 0.85; continue; }
      const hb = G.bevelH(d - gw / 2, 0.004), ti = G.hash3(c, r, 623);
      const k = (1 + (ti - 0.5) * 0.05 + (f[i] - 0.5) * 0.04) * (0.9 + 0.1 * hb);
      G.put(B, i, 234 * k, 229 * k, 217 * k);
      B.hgt[i] = 0.3 + 0.62 * hb + (f[i] - 0.5) * 0.03;
      B.rgh[i] = 0.1 + (f2[i] - 0.5) * 0.05 + (1 - hb) * 0.1;
    }
  }
  return fin(THREE, B, { tile: [tile, tile], depth: 0.003, cavity: 1.0, cavityR: 1 });
}
// honed cream / charcoal marble checkerboard (15 cm) — classic bath floor
function texChecker(THREE, S) {
  const B = G.buffers(S, S), tile = 0.6, px = tile / S, ts = 0.15, gw = 0.002;
  const cl = noiseField(S, S, rand(631), 5, 3), vn = noiseField(S, S, rand(632), 4, 5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = (x + 0.5) * px, v = (S - y - 0.5) * px;
    const c = Math.floor(u / ts), r = Math.floor(v / ts), lu = u - c * ts, lv = v - r * ts, d = Math.min(lu, ts - lu, lv, ts - lv);
    if (d < gw / 2) { G.put(B, i, 150, 146, 140); B.hgt[i] = 0.1; B.rgh[i] = 0.8; continue; }
    const dark = ((c + r) & 1) === 1, ti = G.hash3(c, r, 633);
    const vein = Math.pow(1 - Math.abs(Math.sin((u * 9 + v * 4 + vn[i] * 3 + ti * 7) * Math.PI)), 18) * 0.5;
    const k = 1 + (cl[i] - 0.5) * 0.12 + (ti - 0.5) * 0.06;
    if (dark) G.put(B, i, (50 + vein * 60) * k, (51 + vein * 60) * k, (54 + vein * 58) * k);
    else G.put(B, i, (228 - vein * 50) * k, (222 - vein * 50) * k, (208 - vein * 46) * k);
    const hb = G.bevelH(d - gw / 2, 0.0015);
    B.hgt[i] = 0.3 + 0.65 * hb; B.rgh[i] = 0.24 + (cl[i] - 0.5) * 0.1 + (1 - hb) * 0.2;
  }
  return fin(THREE, B, { tile: [tile, tile], depth: 0.0015, cavity: 1.0, cavityR: 1 });
}
// trowelled microcement (warm grey, cloudy, satin)
function texSurface(THREE, S, seed, tile, p) {
  const B = G.buffers(S, S), n = S * S;
  const f1 = noiseField(S, S, rand(seed), p.oct || 5, p.base || 3), f2 = noiseField(S, S, rand(seed + 1), 3, p.base2 || 40);
  const w1 = noiseField(S, S, rand(seed + 2), 3, 2), w2 = noiseField(S, S, rand(seed + 3), 3, 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const a = G.samp(f1, S, S, x + (w1[i] - 0.5) * S * p.warp, y + (w2[i] - 0.5) * S * p.warp), b = f2[i];
    const k = 1 + (a - 0.5) * p.colA + (b - 0.5) * p.colB;
    G.put(B, i, p.rgb[0] * k, p.rgb[1] * k, p.rgb[2] * k);
    B.hgt[i] = G.clamp01(a * 0.7 + b * 0.3);
    B.rgh[i] = p.rough + (b - 0.5) * p.roughA + (a - 0.5) * (p.roughA2 || 0);
  }
  void n;
  return fin(THREE, B, { tile: [tile, tile], depth: p.depth, cavity: p.cavity || 0.3, cavityR: 2 });
}
const texMicrocement = (THREE, S) => texSurface(THREE, S, 641, 2.0, { rgb: [196, 191, 183], colA: 0.16, colB: 0.05, warp: 0.9, rough: 0.48, roughA: 0.16, roughA2: 0.14, base: 3, base2: 40, depth: 0.0004, cavity: 0.3 });
const texLimewash = (THREE, S) => texSurface(THREE, S, 651, 2.0, { rgb: [200, 197, 192], colA: 0.34, colB: 0.1, warp: 1.2, rough: 0.93, roughA: 0.04, base: 2, base2: 24, depth: 0.0005, cavity: 0.2 });

// interior (0..1 tile) recipes through interior-tex synth: soapstone, Nero Marquina, oriental rug
const NZ = makeNoise(97);
function soapstoneFn(u, v, o) {
  const { n2, fbm } = NZ;
  const cl = fbm(u * 4, v * 4, 4, 4, 5), w = fbm(u * 3 + 5.1, v * 3, 3, 3, 4);
  const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 1) * TAU + w * 9)), 38) * 0.55 + Math.pow(1 - Math.abs(Math.sin((u * 3 - v * 2) * TAU + cl * 12)), 90) * 0.35;
  const talc = n2(u * 220, v * 220, 220, 220) > 0.86 ? 0.06 : 0;
  const base = 0.25 + (cl - 0.5) * 0.06 + talc;
  o.r = base * 0.96 + vein * 0.24; o.g = base * 1.03 + vein * 0.25; o.b = base + vein * 0.24;
  o.h = cl * 0.1 - vein * 0.15; o.ro = 0.42 + (cl - 0.5) * 0.12 + vein * 0.05;
}
function neroFn(u, v, o) {
  const { n2, fbm } = NZ;
  const q = fbm(u * 3, v * 3, 3, 3, 4), w = fbm(u * 4 + q * 3, v * 4 + q * 3, 4, 4, 5), cl = fbm(u * 5 + 2.2, v * 5, 5, 5, 4);
  const bold = Math.pow(1 - Math.abs(Math.sin((u * 1 + v * 2) * TAU * 0.5 + w * 11)), 70) * (0.5 + 0.5 * q);
  const thin = Math.pow(1 - Math.abs(Math.sin((u * 3 - v * 1) * TAU * 0.5 + w * 17 + n2(u * 48, v * 48, 48, 48) * 0.6)), 160) * 0.8;
  const hair = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 5) * TAU * 0.5 + w * 29)), 400) * 0.6;
  const vein = Math.min(1, bold + thin + hair);
  const base = 0.09 + (cl - 0.5) * 0.035;
  o.r = base + vein * 0.82; o.g = base + vein * 0.8; o.b = base * 1.06 + vein * 0.77;
  o.h = -vein * 0.2 + cl * 0.04; o.ro = 0.06 + vein * 0.08 + (cl - 0.5) * 0.03;
}
const RUG = { field: [0.55, 0.22, 0.18], navy: [0.13, 0.17, 0.27], ivory: [0.85, 0.8, 0.69], rust: [0.66, 0.36, 0.2], gold: [0.76, 0.6, 0.32] };
function orientalFn(u, v, o) {
  const { n2, fbm } = NZ;
  const e = Math.min(u, 1 - u, v, 1 - v);
  let c;
  if (e < 0.025) c = RUG.navy;
  else if (e < 0.03) c = RUG.gold;
  else if (e < 0.1) { // main border: ivory with navy/rust rosettes
    const t = (u + v) * 30, ro = Math.abs(Math.sin(t * Math.PI)) * Math.abs(Math.sin((e - 0.03) / 0.07 * Math.PI));
    c = ro > 0.55 ? (Math.floor(t) % 2 ? RUG.navy : RUG.rust) : RUG.ivory;
  } else if (e < 0.11) c = RUG.rust;
  else {
    const x = u - 0.5, y = (v - 0.5) * 0.7, dm = Math.abs(x) + Math.abs(y);
    const lat = Math.abs(((u * 9 + v * 6) % 1) - 0.5) + Math.abs(((u * 9 - v * 6 + 20) % 1) - 0.5);
    if (dm < 0.16) c = dm < 0.06 ? RUG.ivory : dm < 0.075 ? RUG.gold : RUG.navy;
    else if (dm < 0.175) c = RUG.ivory;
    else c = lat > 0.86 ? RUG.navy : lat < 0.12 ? RUG.gold : RUG.field;
  }
  const ab = (fbm(u * 2, v * 9, 2, 9, 3) - 0.5) * 0.14, pile = n2(u * 300, v * 300, 300, 300);
  const k = 1 + ab + (pile - 0.5) * 0.08;
  o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.h = pile * 0.7; o.ro = 0.97;
}
function synthAvg(fn) {
  const o = { r: 1, g: 1, b: 1, h: 0, ro: 0.5, me: 0 }; let r = 0, g = 0, b = 0, k = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { fn((x + 0.5) / 40, (y + 0.5) / 40, o); r += s2l(Math.min(1, Math.max(0, o.r))); g += s2l(Math.min(1, Math.max(0, o.g))); b += s2l(Math.min(1, Math.max(0, o.b))); k++; }
  return [r / k, g / k, b / k];
}
function synthTex(fn, S, opt) {
  const t = synth(S, S, fn, opt);
  return { map: t.map, normalMap: t.normal, roughnessMap: t.rough, avg: synthAvg(fn) };
}
const RECIPES = {
  beadboard: (THREE, q) => texBeadboard(THREE, q ? 256 : 512),
  subway: (THREE, q) => texSubway(THREE, q ? 256 : 512),
  checker: (THREE, q) => texChecker(THREE, q ? 256 : 512),
  microcement: (THREE, q) => texMicrocement(THREE, q ? 256 : 512),
  limewash: (THREE, q) => texLimewash(THREE, q ? 256 : 512),
  soapstone: (THREE, q) => synthTex(soapstoneFn, q ? 256 : 512, { ns: 1 }),
  nero: (THREE, q) => synthTex(neroFn, q ? 256 : 512, { ns: 1.2 }),
  oriental: (THREE, q) => synthTex(orientalFn, q ? 256 : 512, { ns: 2, wrap: false }),
};
// nominal average albedo (sRGB 0..255) of the ORIGINAL textures, used only when a canvas cannot be read (node tests)
const NOMINAL = {
  plasterWall: [240, 237, 232], ceilingPlaster: [246, 245, 242], oakHerringbone: [196, 160, 116], oakWidePlank: [198, 162, 118], oakSolid: [200, 164, 120],
  stuccoSoftGray: [192, 193, 189], paintedSidingWhite: [226, 225, 220], architecturalShingleCharcoal: [58, 58, 60], marbleTileLarge: [236, 233, 228],
  paintedBlockGray: [198, 199, 197], joistPaintedWhite: [234, 233, 229], concretePolished: [170, 168, 163], cedarWood: [180, 114, 72], shutterWhite: [232, 231, 226],
  brushedBrass: [205, 168, 98], blackSteel: [30, 31, 33],
  'int.marble': [238, 234, 228], 'int.brass': [218, 218, 218], 'int.walnut': [104, 72, 50], 'int.wood': [205, 186, 150], 'int.woodGloss': [205, 186, 150],
  'int.travertine': [214, 196, 168], 'int.boucle': [228, 227, 222], 'int.linen': [222, 220, 214], 'int.leather': [222, 222, 222], 'int.velvet': [222, 222, 222],
  'int.rug': [236, 233, 228], 'int.plaster': [238, 236, 232], 'int.terry': [232, 232, 232], 'int.knit': [215, 215, 215],
};

/* ================================================================== tagging rules */
const BATH = /^bath[12]$/, BEDROOM = /^bed[1-4]$/;
function bboxH(mesh) { try { const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox.max.y - g.boundingBox.min.y; } catch (_) { return 1; } }
function roomOf(o) { for (let p = o; p; p = p.parent) if (p.userData && p.userData.room) return p.userData.room; return null; }
function floorOf(o) { for (let p = o; p; p = p.parent) if (p.userData && p.userData.floor) return p.userData.floor; return null; }

// house material name → slot (mesh-aware)
function houseSlot(name, mesh) {
  const room = roomOf(mesh);
  switch (name) {
    case 'plasterWall': return room === 'living' ? 'wallAccent' : room === 'kitchen' ? 'wallKitchen' : BATH.test(room || '') ? 'wallBathPaint' : 'wall';
    case 'ceilingPlaster': return 'ceiling';
    case 'paintedTrim': return room === 'living' ? 'trimAccent' : 'trim';
    case 'paintedTrimExterior': return 'extTrim';
    case 'oakHerringbone': return 'floorMain';
    case 'oakWidePlank': return 'floorBed';
    case 'oakSolid': return 'stairWood';
    case 'marbleTileLarge': return bboxH(mesh) < 0.06 ? 'floorBath' : 'wallBath';
    case 'doorShakerWhite': return 'door';
    case 'doorBlack': return 'doorExt';
    case 'blackWindowFrame': return 'windowFrame';
    case 'blackSteel': return 'metalDark';
    case 'brushedBrass': case 'brassPolished': return 'hardware';
    case 'stuccoSoftGray': return 'extWall';
    case 'paintedSidingWhite': return 'extGable';
    case 'architecturalShingleCharcoal': return 'roof';
    case 'shutterWhite': return 'shutter';
    case 'cedarWood': return 'cedar';
    case 'gutterBlack': return 'gutter';
    case 'paintedBlockGray': return 'basementWall';
    case 'joistPaintedWhite': return 'basementCeil';
    case 'concretePolished': return 'basementFloor';
    default: return null;
  }
}
const HOUSE_STATIC = /^(glass|glassObscure|glassClear|glassFrosted|invisible|rubberGasket|pipeGray|galvanized|recessTrim|porcelain|metalChrome|concrete|concreteBand|stoneSill|plywood|gravel|houseNumbersBrass|houseNumbersShadow)$/;
// interior key → slot (mesh-aware)
function interiorSlot(key, mesh) {
  const room = roomOf(mesh) || '', fl = floorOf(mesh);
  switch (key) {
    case 'marble': return BATH.test(room) ? 'vanityTop' : 'counter';
    case 'brass': return BATH.test(room) ? 'faucetMetal' : 'hardware';
    case 'walnut': return 'wood';
    case 'wood': case 'woodGloss': return 'woodLight';
    case 'travertine': return 'stoneTable';
    case 'boucle': return room === 'living' ? 'sofaFabric' : 'upholstery';
    case 'leather': return 'chairLeather';
    case 'velvet': return fl === 'basement' ? 'clubChair' : BEDROOM.test(room) ? 'headboard' : 'velvetAccent';
    case 'linen': return mesh.isInstancedMesh || room === 'kitchen' ? 'curtain' : BEDROOM.test(room) ? 'bedding' : 'linen';
    case 'rug': return 'rug';
    case 'plaster': return room === 'kitchen' ? 'hood' : null;
    case 'terry': return 'towel';
    case 'knit': return 'throw';
    case 'duo': return 'static:duo'; // recoloured through vertex colours (see REMAP)
    default: return null;
  }
}
// slot-atlas vertex colours → slot (target = slot colour × (src / ref) so darker variants keep their relation)
const REMAP = [
  { src: 0x34483c, ref: 0x34483c, slot: 'cabinet', room: /^kitchen$/ },
  { src: 0x283a30, ref: 0x34483c, slot: 'cabinet', room: /^kitchen$/ },
  { src: 0xd2ab62, ref: 0xd2ab62, slot: 'hardware', bathSlot: 'faucetMetal' },
  { src: 0xb48a45, ref: 0xd2ab62, slot: 'hardware', bathSlot: 'faucetMetal' },
];
// the colour each of these slots had originally (for c:null in remapped slots)
const REMAP_BASE = { cabinet: 0x34483c, hardware: 0xd2ab62, faucetMetal: 0xd2ab62 };

/* ================================================================== engine */
export function createStyles(ctx) {
  const THREE = ctx.THREE;
  const low = () => ctx.quality === 'low';
  const state = { current: DEFAULT, ready: false, pending: null, token: 0, busy: false };
  const bases = new Map();     // styleSrc → base snapshot
  const vcAvgBy = new Map();   // styleSrc → [r,g,b] linear vertex-colour average
  const texCache = new Map();  // recipe → texture set
  const remaps = [];           // {attr, orig, groups:[{idx:Int32Array, rule, slot}]}
  const stats = { tagged: 0, static: 0, untagged: [], clones: 0, slots: {}, remapVerts: 0, initMs: 0, lastSwitchMs: 0, genMs: {} };
  const listeners = new Set();

  const snap = (m) => ({
    color: m.color && m.color.clone ? m.color.clone() : null, roughness: m.roughness, metalness: m.metalness,
    map: m.map || null, normalMap: m.normalMap || null, roughnessMap: m.roughnessMap || null,
    normalScale: m.normalScale && m.normalScale.clone ? m.normalScale.clone() : null, sheenColor: m.sheenColor && m.sheenColor.clone ? m.sheenColor.clone() : null,
    clearcoat: m.clearcoat, envMapIntensity: m.envMapIntensity,
  });
  function texAvg(tex, src) {
    try {
      const img = tex && tex.image;
      if (img && img.getContext && img.width > 0) {
        const g = img.getContext('2d', { willReadFrequently: true });
        const d = g && g.getImageData ? g.getImageData(0, 0, img.width, img.height) : null;
        if (d && d.data && d.data.length >= 4) {
          let r = 0, gg = 0, b = 0, k = 0; const st = Math.max(4, ((d.data.length / 4 / 4096) | 0) * 4);
          for (let i = 0; i < d.data.length; i += st) { r += s2l(d.data[i] / 255); gg += s2l(d.data[i + 1] / 255); b += s2l(d.data[i + 2] / 255); k++; }
          if (k && (r + gg + b) > 0) return [r / k, gg / k, b / k];
        }
      } else if (img && img.data && img.data.length >= 4) {
        const D = img.data; let r = 0, gg = 0, b = 0, k = 0; const st = Math.max(4, ((D.length / 4 / 4096) | 0) * 4);
        for (let i = 0; i < D.length; i += st) { r += s2l(D[i] / 255); gg += s2l(D[i + 1] / 255); b += s2l(D[i + 2] / 255); k++; }
        if (k && (r + gg + b) > 0) return [r / k, gg / k, b / k];
      }
    } catch (_) { /* tainted / headless */ }
    return NOMINAL[src] ? rgbLin(NOMINAL[src]) : [0.8, 0.8, 0.8];
  }

  /* ---------------- tagging */
  function tagAll() {
    const scene = ctx.scene; const cloneCache = new Map();
    const tagMat = (m, slot, src) => { m.userData.styleKey = slot; m.userData.styleSrc = src; };
    // returns the material to use for this mesh. The first slot that meets a source material claims the original
    // instance; every other slot of the same source gets one shared clone (textures + shader program are shared).
    const owner = new Map(); // material → slot claimed by the original instance
    const assign = (mesh, m, slot, src) => {
      if (slot.startsWith('static:')) { if (!m.userData.styleKey) m.userData.styleKey = slot; return m; }
      const key = src + '|' + slot;
      const own = owner.get(m);
      if (own === undefined && !m.userData.styleKey) { owner.set(m, slot); tagMat(m, slot, key); if (!bases.has(key)) bases.set(key, snap(m)); return m; }
      if (own === slot || (own === undefined && m.userData.styleKey === slot)) return m;
      let c = cloneCache.get(key);
      if (!c) {
        c = m.clone(); c.name = (m.name || 'mat') + '#' + slot; tagMat(c, slot, key); owner.set(c, slot);
        cloneCache.set(key, c); stats.clones++; if (!bases.has(key)) bases.set(key, snap(c));
      }
      return c;
    };
    const vcAcc = new Map();
    const addVc = (src, mesh, m) => {
      if (!m.vertexColors) return;
      const a = mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.color; if (!a) return;
      let acc = vcAcc.get(src); if (!acc) { acc = [0, 0, 0, 0]; vcAcc.set(src, acc); }
      const arr = a.array, is = a.itemSize || 3, n = a.count; const st = Math.max(1, (n / 2000) | 0);
      for (let i = 0; i < n; i += st) { acc[0] += arr[i * is]; acc[1] += arr[i * is + 1]; acc[2] += arr[i * is + 2]; acc[3]++; }
    };
    const handle = (mesh, kind) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = mats.slice(); let changed = false;
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i]; if (!m || !m.isMaterial) continue;
        if (!m.userData) m.userData = {};
        let slot = null, srcName = null;
        if (kind === 'house') {
          const nm = String(m.name || '').split('#')[0];
          slot = houseSlot(nm, mesh); srcName = nm;
          if (!slot && (HOUSE_STATIC.test(nm))) slot = 'static:' + nm;
          if (!slot && /lampDisc|ledStrip|bulb|lanternGlass/.test(nm)) slot = 'static:light';
        } else if (kind === 'interior') {
          const k = m.userData.intKey;
          if (k) { slot = interiorSlot(k, mesh); srcName = 'int.' + k; if (!slot) slot = 'static:int.' + k; }
        } else if (kind === 'exterior') {
          const k = m.userData.extKey; if (k) slot = 'static:ext.' + k;
        }
        if (!slot) {
          if (m.visible === false) slot = 'static:hidden';
          else if (m.userData.styleKey) continue;
          else if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01 || /glow|lamp|shade|bulb|led|light/i.test(m.name || '')) slot = 'static:light';
          else if (kind === 'interior' && m.map) slot = 'static:prop'; // billiard balls, radio dial, printed props
          else if (/mirror/i.test(m.name || '') || /mirror/i.test(mesh.name || '')) slot = 'static:mirror';
        }
        if (!slot) continue;
        const mm = assign(mesh, m, slot, srcName || slot);
        if (mm !== m) { out[i] = mm; changed = true; }
        if (!slot.startsWith('static:')) addVc(mm.userData.styleSrc, mesh, mm);
      }
      if (changed) mesh.material = Array.isArray(mesh.material) ? out : out[0];
    };
    for (const top of scene.children) {
      if (!top || (top.userData && top.userData.__core)) continue;
      const kind = top.name === 'house' ? 'house' : top.name === 'exterior' ? 'exterior' : 'interior';
      top.traverse((o) => { if (o.isMesh || o.isInstancedMesh) { try { handle(o, kind); } catch (e) { console.warn('[styles] tag', o.name, e); } } });
    }
    for (const [src, a] of vcAcc) if (a[3]) vcAvgBy.set(src, [a[0] / a[3], a[1] / a[3], a[2] / a[3]]);
    // vertex-colour remaps on the interior slot atlas
    // vertex colours are linear in r160 (ColorManagement on); the raw sRGB variant is also matched (colour management off / fakes)
    const hexRaw = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
    const rules = [];
    for (const r of REMAP) {
      rules.push(Object.assign({}, r, { lin: hexLin(r.src), refLin: hexLin(r.ref), raw: false }));
      rules.push(Object.assign({}, r, { lin: hexRaw(r.src), refLin: hexRaw(r.ref), raw: true }));
    }
    for (const top of scene.children) {
      if (!top || top.name === 'house' || top.name === 'exterior' || (top.userData && top.userData.__core)) continue;
      top.traverse((o) => {
        if (!o.isMesh || !o.material || !o.material.vertexColors || !o.material.userData || o.material.userData.intKey !== 'duo') return;
        const a = o.geometry && o.geometry.attributes && o.geometry.attributes.color; if (!a || !a.array) return;
        const room = roomOf(o) || '', arr = a.array, is = a.itemSize || 3, n = a.count;
        const groups = [];
        for (const r of rules) {
          if (r.room && !r.room.test(room)) continue;
          const slot = r.bathSlot && BATH.test(room) ? r.bathSlot : r.slot;
          const idx = [];
          for (let i = 0; i < n; i++) {
            const j = i * is;
            if (Math.abs(arr[j] - r.lin[0]) < 2e-3 && Math.abs(arr[j + 1] - r.lin[1]) < 2e-3 && Math.abs(arr[j + 2] - r.lin[2]) < 2e-3) idx.push(i);
          }
          if (idx.length) groups.push({ idx: Int32Array.from(idx), ratio: [r.lin[0] / r.refLin[0], r.lin[1] / r.refLin[1], r.lin[2] / r.refLin[2]], slot, raw: r.raw });
        }
        if (groups.length) { remaps.push({ attr: a, is, groups }); for (const g of groups) { stats.remapVerts += g.idx.length; stats.slots['vc:' + g.slot] = (stats.slots['vc:' + g.slot] || 0) + 1; } }
      });
    }
  }

  /* ---------------- textures */
  async function ensureTex(style) {
    const need = new Set();
    for (const k of Object.keys(style.slots)) { const t = style.slots[k].tex; if (t && !t.startsWith('=') && RECIPES[t] && !texCache.has(t)) need.add(t); }
    for (const t of need) {
      const t0 = now();
      try { texCache.set(t, RECIPES[t](THREE, low())); } catch (e) { console.warn('[styles] texture', t, e); texCache.set(t, null); }
      stats.genMs[t] = Math.round(now() - t0);
      await new Promise((r) => setTimeout(r, 0)); // keep the page responsive between recipes
    }
  }
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const baseOfSlot = (slot) => { for (const [k, b] of bases) if (k.endsWith('|' + slot)) return { b, key: k }; return null; };

  /* ---------------- apply */
  function applyMaterial(m, style) {
    const slot = m.userData.styleKey, src = m.userData.styleSrc;
    const b = bases.get(src); if (!b) return false;
    const spec = (style.slots && style.slots[slot]) || { c: null };
    // maps (presence kept)
    let maps = { map: b.map, normalMap: b.normalMap, roughnessMap: b.roughnessMap }, mapAvg = null;
    if (spec.tex && b.map) {
      if (spec.tex.startsWith('=')) {
        const o2 = baseOfSlot(spec.tex.slice(1)), ob = o2 && o2.b;
        if (ob && ob.map) { maps = { map: ob.map, normalMap: b.normalMap ? (ob.normalMap || b.normalMap) : null, roughnessMap: b.roughnessMap ? (ob.roughnessMap || b.roughnessMap) : null }; mapAvg = texAvgCached(ob.map, o2.key.split('|')[0]); }
      } else {
        const t = texCache.get(spec.tex);
        if (t && t.map) { maps = { map: t.map, normalMap: b.normalMap ? (t.normalMap || b.normalMap) : null, roughnessMap: b.roughnessMap ? (t.roughnessMap || b.roughnessMap) : null }; mapAvg = t.avg; }
      }
    }
    let presence = false;
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      if (!!m[k] !== !!maps[k]) presence = true;
      if (m[k] !== maps[k]) m[k] = maps[k];
    }
    if (presence) m.needsUpdate = true;
    // colour: target average albedo → material.color = target / (vertex-colour avg × map avg)
    if (m.color && b.color) {
      const vc = vcAvgBy.get(src) || [1, 1, 1];
      if (spec.c == null && !mapAvg) m.color.copy(b.color);                 // original look
      else if (spec.c == null) m.color.setRGB(1 / Math.max(0.05, vc[0]), 1 / Math.max(0.05, vc[1]), 1 / Math.max(0.05, vc[2])); // replacement texture shown as authored
      else {
        const ma = m.map ? (mapAvg || texAvgCached(b.map, src.split('|')[0])) : [1, 1, 1];
        const tg = hexLin(spec.c);
        m.color.setRGB(Math.min(6, tg[0] / Math.max(1e-4, vc[0] * ma[0])), Math.min(6, tg[1] / Math.max(1e-4, vc[1] * ma[1])), Math.min(6, tg[2] / Math.max(1e-4, vc[2] * ma[2])));
      }
    }
    if (typeof b.roughness === 'number') m.roughness = spec.r != null ? spec.r : b.roughness;
    if (typeof b.metalness === 'number') m.metalness = spec.m != null ? spec.m : b.metalness;
    if (m.normalScale && b.normalScale) { if (spec.ns != null) m.normalScale.set(spec.ns, spec.ns); else m.normalScale.copy(b.normalScale); }
    if (m.sheenColor && b.sheenColor) { if (spec.sheen) m.sheenColor.set(spec.sheen); else m.sheenColor.copy(b.sheenColor); }
    if (b.clearcoat > 0 && typeof m.clearcoat === 'number') m.clearcoat = spec.cc != null ? Math.max(0.01, spec.cc) : b.clearcoat;
    if (spec.env != null && typeof m.envMapIntensity === 'number') m.envMapIntensity = spec.env;
    return true;
  }
  const avgCache = new WeakMap();
  function texAvgCached(tex, nomKey) {
    if (!tex) return [1, 1, 1];
    let a = avgCache.get(tex);
    if (!a) { a = texAvg(tex, nomKey); avgCache.set(tex, a); }
    return a;
  }
  function applyRemaps(style) {
    for (const R of remaps) {
      const arr = R.attr.array, is = R.is;
      for (const g of R.groups) {
        const spec = style.slots[g.slot];
        const hx = spec && spec.c != null ? spec.c : REMAP_BASE[g.slot];
        const tgt = g.raw ? (() => { const n = typeof hx === 'number' ? hx : parseInt(String(hx).replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; })() : hexLin(hx);
        const r = tgt[0] * g.ratio[0], gg = tgt[1] * g.ratio[1], b = tgt[2] * g.ratio[2];
        for (let k = 0; k < g.idx.length; k++) { const j = g.idx[k] * is; arr[j] = r; arr[j + 1] = gg; arr[j + 2] = b; }
      }
      R.attr.needsUpdate = true;
    }
  }
  function applyLights(style) {
    const T = (typeof window !== 'undefined' && window.__tour) || null;
    const L = (T && T.lamps) || [];
    for (const e of L) {
      const l = e && (e.light || e.l); if (!l || !l.color) continue;
      if (!l.userData.__styleBase) l.userData.__styleBase = l.color.getHex();
      l.color.setHex(l.userData.__styleBase); l.color.r *= style.light[0]; l.color.g *= style.light[1]; l.color.b *= style.light[2];
    }
  }
  function sceneMaterials() {
    const set = new Set();
    for (const top of ctx.scene.children) {
      if (!top || (top.userData && top.userData.__core)) continue;
      top.traverse((o) => { if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && m.userData && m.userData.styleKey && !m.userData.styleKey.startsWith('static:')) set.add(m); });
    }
    return set;
  }
  function applyNow(style) {
    const t0 = now();
    let n = 0;
    for (const m of sceneMaterials()) { try { if (applyMaterial(m, style)) n++; } catch (e) { console.warn('[styles] apply', m.name, e); } }
    try { applyRemaps(style); } catch (e) { console.warn('[styles] remap', e); }
    try { applyLights(style); } catch (_) { }
    const T = (typeof window !== 'undefined' && window.__tour) || null;
    try { if (ctx.renderer && ctx.renderer.shadowMap) ctx.renderer.shadowMap.needsUpdate = true; } catch (_) { }
    try { T && T.render && T.render.requestProbes && T.render.requestProbes(200); } catch (_) { }
    try { T && T.render && T.render.normalizeMaterials && T.render.normalizeMaterials(); } catch (e) { console.warn('[styles] normalizeMaterials', e); }
    stats.lastSwitchMs = Math.round(now() - t0); stats.lastApplied = n;
    return n;
  }

  /* ---------------- public */
  async function set(id) {
    const style = BY_ID[id] || BY_ID[DEFAULT];
    if (!state.ready) { state.pending = style.id; return style.id; }
    const tok = ++state.token; state.busy = true;
    try {
      await ensureTex(style);
      if (tok !== state.token) return state.current; // a newer request won
      applyNow(style);
      state.current = style.id;
      try { localStorage.setItem(LS_KEY, style.id); } catch (_) { }
      for (const fn of listeners) { try { fn(style.id); } catch (_) { } }
    } finally { if (tok === state.token) state.busy = false; }
    return style.id;
  }
  async function init() {
    if (state.ready) return api;
    const t0 = now();
    try { tagAll(); } catch (e) { console.warn('[styles] tagging failed', e); }
    stats.initMs = Math.round(now() - t0);
    state.ready = true;
    let want = state.pending;
    if (!want) { try { want = localStorage.getItem(LS_KEY); } catch (_) { want = null; } }
    if (want && BY_ID[want] && want !== DEFAULT) await set(want);
    else { state.current = DEFAULT; applyNow(BY_ID[DEFAULT]); }
    return api;
  }
  function report() {
    const out = { styled: 0, static: 0, untagged: 0, untaggedNames: [], slots: {}, clones: stats.clones, remapMeshes: remaps.length, remapVerts: stats.remapVerts };
    const seen = new Set();
    for (const top of ctx.scene.children) {
      if (!top || (top.userData && top.userData.__core)) continue;
      top.traverse((o) => {
        if (!o.material) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (!m || seen.has(m)) continue; seen.add(m);
          const k = m.userData && m.userData.styleKey;
          if (!k) { if (m.visible === false || o.visible === false) continue; out.untagged++; if (out.untaggedNames.length < 40) out.untaggedNames.push((m.name || m.type || m.constructor.name) + ' @' + (o.name || o.type || '') + '<' + ((o.parent && o.parent.name) || '') + (m.map ? ' map' : '') + (m.color && m.color.getHexString ? ' #' + m.color.getHexString() : '')); }
          else if (k.startsWith('static:')) out.static++;
          else { out.styled++; out.slots[k] = (out.slots[k] || 0) + 1; }
        }
      });
    }
    out.slotCount = Object.keys(out.slots).length;
    return out;
  }
  const api = {
    init, set, list, report,
    get current() { return state.current; }, get ready() { return state.ready; }, get busy() { return state.busy; },
    get(id) { const s = BY_ID[id || state.current]; return s ? { id: s.id, he: s.he, en: s.en, desc: s.desc, materials: s.materials, swatch: s.swatch.slice() } : null; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    stats, STYLES,
  };
  return api;
}

export default createStyles;
