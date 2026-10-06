// VILNYI Lifestyle yacht — the shell: hull, bulwarks, deck plates, tiered superstructure with glazing, rails, stern
// stairs, hardtop with funnel / mast / radar, helipad, tenders, name and emblem, night lighting — and the static part of
// the walking world (decks, stairs, exterior walls). Everything in yacht-local coordinates (see yacht-pier.js).
import * as THREE from 'three';
import { Y, planHalf, hullHalf, sheer, TIERS, tierHalf, PLATES } from './yacht-pier.js?v=3.5.1';
import { GeoB, canvasTex, shellMaterials } from './yacht-kit.js?v=3.5.1';

export const LOBBY = {
  x0: -4.2, x1: 3,
  stair: { xa: -2.2, xb: 0.32, xl: 1.6, zB0: -3.8, zB1: -2.6, zA0: -2.5, zA1: -1.3, n: 9 },
  lift: { x0: -1.5, x1: 0.9, z0: 1.4, z1: 3.6, d0: -0.95, d1: 0.35 },
};
// openings in the superstructure walls: aft = z spans in the aft wall, side = x spans (both sides)
export const OPEN = {
  main: { aft: [[-2.4, 2.4]], side: [[-30, -27.4], [-9.4, -7.4], [15.4, 17.2]] },
  upper: { aft: [[-2, 2]], side: [[10, 11.8]] },
  bridge: { aft: [[-0.7, 0.7]], side: [[5, 6.2]] },
};
export const STERN_STAIR = { x0: -65, x1: -59.6, z0: 5.45, z1: 6.65, n: 17 };
export const PASS = { x0: -69.45, x1: -65.75, hw: 0.62, y0: 0.75, y1: Y.D1 };     // passerelle (pier head → swim platform)
export const DECKS = [Y.D1, Y.D2, Y.D3, Y.D4];
const DOOR_H = 2.2;

// outline of a tier side as [x, half] points (with the step of the bridge tier)
function tierPts(t) {
  const pts = []; const add = (x) => pts.push([x, tierHalf(t, x)]);
  if (t.xb != null) { pts.push([t.x0, t.hwAft], [t.xb, t.hwAft], [t.xb, t.hw]); }
  else add(t.x0);
  const n0 = t.x1 - t.nose, xs = t.xb != null ? t.xb : t.x0;
  for (let x = Math.ceil((xs + 0.01) / 1.2) * 1.2; x < n0 - 0.01; x += 1.2) add(x);
  for (let i = 0; i <= 12; i++) { const k = Math.sin(i / 12 * Math.PI / 2); add(n0 + t.nose * k); }
  return pts;
}
const inSpans = (v0, v1, spans) => spans.some(([a, b]) => v0 >= a - 1e-6 && v1 <= b + 1e-6);
// cut [a, b] at span edges → pieces [v0, v1, isOpening]
function cut(a, b, spans) {
  const xs = new Set([a, b]); for (const [p, q] of spans) { if (p > a && p < b) xs.add(p); if (q > a && q < b) xs.add(q); }
  const l = [...xs].sort((p, q) => p - q), out = [];
  for (let i = 0; i < l.length - 1; i++) out.push([l[i], l[i + 1], inSpans(l[i], l[i + 1], spans)]);
  return out;
}

/** Static walking world of the yacht: decks, stairs, pier + passerelle (dock), exterior walls. */
export function buildStatics(world, state) {
  const S = LOBBY.stair, hole = [S.xa, S.xl, S.zB0, S.zA1];
  // decks
  world.floor({ id: 'D1', x0: -65.7, x1: 42, y: Y.D1, half: PLATES[0].half, tag: 'static' });
  world.floor({ id: 'D2', x0: -59.5, x1: 60.5, y: Y.D2, half: PLATES[1].half, holes: [hole], tag: 'static' });
  world.floor({ id: 'D3', x0: -43.7, x1: 30.9, y: Y.D3, half: PLATES[2].half, holes: [hole], tag: 'static' });
  world.floor({ id: 'D4', x0: -35.7, x1: 19.9, y: Y.D4, half: PLATES[3].half, holes: [hole], tag: 'static' });
  // lobby stair: flight A (+x) → landing → flight B (−x), stacked on three decks
  for (const y of [Y.D1, Y.D2, Y.D3]) {
    world.floor({ id: 'stairA', x0: S.xa, x1: S.xb, z0: S.zA0, z1: S.zA1, y: (x) => y + 1.5 * (x - S.xa) / (S.xb - S.xa), tag: 'static' });
    world.floor({ id: 'stairL', x0: S.xb, x1: S.xl, z0: S.zB0, z1: S.zA1, y: y + 1.5, tag: 'static' });
    world.floor({ id: 'stairB', x0: S.xa, x1: S.xb, z0: S.zB0, z1: S.zB1, y: (x) => y + 1.5 + 1.5 * (S.xb - x) / (S.xb - S.xa), tag: 'static' });
  }
  const top = Y.D4 + Y.CEIL;
  world.seg(S.xa, S.zB0 - 0.05, S.xl + 0.05, S.zB0 - 0.05, Y.D1, top); world.seg(S.xl + 0.05, S.zB0 - 0.05, S.xl + 0.05, S.zA1 + 0.05, Y.D1, top);
  world.seg(S.xa, S.zA1 + 0.05, S.xl + 0.05, S.zA1 + 0.05, Y.D1, top); world.seg(S.xa, (S.zB1 + S.zA0) / 2, S.xb, (S.zB1 + S.zA0) / 2, Y.D1, top);
  world.box(S.xa, S.xb, S.zB0, S.zB1, Y.D1, Y.D1 + 2.4);                       // under the first flight B: closed
  // lift shaft (the car is a closet on every deck; its door is a zone door)
  const Lf = LOBBY.lift;
  world.seg(Lf.x0, Lf.z1, Lf.x1, Lf.z1, Y.D1, top); world.seg(Lf.x0, Lf.z0, Lf.x0, Lf.z1, Y.D1, top); world.seg(Lf.x1, Lf.z0, Lf.x1, Lf.z1, Y.D1, top);
  world.seg(Lf.x0, Lf.z0, Lf.d0, Lf.z0, Y.D1, top); world.seg(Lf.d1, Lf.z0, Lf.x1, Lf.z0, Y.D1, top);
  // stern stairs (swim platform ↔ main aft deck), both sides
  const T = STERN_STAIR;
  for (const sd of [-1, 1]) {
    const z0 = sd > 0 ? T.z0 : -T.z1, z1 = sd > 0 ? T.z1 : -T.z0;
    world.floor({ id: 'sternStair', x0: T.x0, x1: T.x1 + 0.15, z0, z1, y: (x) => Y.D1 + (Y.D2 - Y.D1) * Math.min(1, (x - T.x0) / (T.x1 - T.x0)), tag: 'static' });
    world.seg(T.x0 + 0.5, sd * (T.z0 - 0.05), T.x1 + 0.1, sd * (T.z0 - 0.05), Y.D1, Y.D2 + 1.1);        // balustrade to the platform
    world.box(T.x0 + 2.4, T.x1 + 0.2, z0, z1, Y.D1, Y.D1 + 1.2);                                      // no walking under the flight
  }
  world.seg(-59.5, -(T.z0 - 0.05), -59.5, T.z0 - 0.05, Y.D2, Y.D2 + 1.1, { see: true });               // aft rail of the main deck
  // pier (dock frame = yacht-local at the docked pose) and passerelle — only while the yacht is alongside
  const docked = () => state.docked;
  world.floor({ id: 'pier', dock: true, x0: -99.2 + 1.5, x1: -69.2, z0: -1.72, z1: 1.72, y: 0.75, tag: 'static' });
  world.floor({ id: 'pass', x0: PASS.x0 + 0.1, x1: PASS.x1 + 0.2, z0: -PASS.hw, z1: PASS.hw, y: (x) => PASS.y0 + (PASS.y1 - PASS.y0) * Math.max(0, Math.min(1, (x - PASS.x0 - 0.3) / (PASS.x1 - PASS.x0 - 0.5))), on: docked, tag: 'static' });
  // superstructure walls
  for (const t of TIERS) {
    const op = OPEN[t.id], pts = tierPts(t);
    for (const sd of [-1, 1]) for (let i = 0; i < pts.length - 1; i++) {
      const [xa, ha] = pts[i], [xb, hb] = pts[i + 1];
      if (Math.abs(xb - xa) < 1e-6) { world.seg(xa, sd * ha, xb, sd * hb, t.y0, t.y1, { tag: 'static' }); continue; }
      for (const [u0, u1, open] of cut(xa, xb, op.side)) {
        if (open) continue;
        const f = (x) => ha + (hb - ha) * (x - xa) / (xb - xa);
        world.seg(u0, sd * f(u0), u1, sd * f(u1), t.y0, t.y1, { tag: 'static' });
      }
    }
    const hA = t.hwAft ?? t.hw, hN = tierHalf(t, t.x1);
    for (const [u0, u1, open] of cut(-hA, hA, op.aft)) if (!open) world.seg(t.x0, u0, t.x0, u1, t.y0, t.y1, { tag: 'static' });
    world.seg(t.x1, -hN, t.x1, hN, t.y0, t.y1, { tag: 'static' });
  }
  // hardtop pylons, funnel base is on the roof (not reachable); tenders on the foredeck
  for (const sd of [-1, 1]) { world.box(-13.6, -12.4, sd * 5.0, sd * 6.2, Y.D4, Y.ROOF, { tag: 'static' }); world.box(31.2, 38.2, sd * 2.2, sd * 4.8, Y.D2, Y.D2 + 1.6, { tag: 'static' }); }
}

function nameTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 40, 0, 200); gr.addColorStop(0, '#f6e2a8'); gr.addColorStop(0.5, '#d2a95a'); gr.addColorStop(1, '#9a7430');
    g.fillStyle = gr; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 170px "Cormorant Garamond","Bodoni Moda",Georgia,"Times New Roman",serif';
    const s = 'VILNYI'; let x = 0; const gap = 34, ws = [...s].map(c => g.measureText(c).width), tot = ws.reduce((a, b) => a + b, 0) + gap * (s.length - 1);
    x = (w - tot) / 2; [...s].forEach((c, i) => { g.fillText(c, x + ws[i] / 2, h / 2 + 6); x += ws[i] + gap; });
  }, { repeat: false });
}
function helipadTex() {
  return canvasTex(512, 512, (g, w) => {
    g.clearRect(0, 0, w, w); g.strokeStyle = '#f4efe2'; g.lineWidth = 16; g.beginPath(); g.arc(256, 256, 232, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#d2a95a'; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 204, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f4efe2'; g.fillRect(170, 150, 34, 212); g.fillRect(308, 150, 34, 212); g.fillRect(170, 239, 172, 34);
  }, { repeat: false });
}
// gold bird (assets/bird.png is drawn on black): alpha from brightness
function emblemTex(onReady) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
    const k = Math.min(240 / img.width, 240 / img.height), w = img.width * k, h = img.height * k;
    g.drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h);
    try { const d = g.getImageData(0, 0, 256, 256), a = d.data; for (let i = 0; i < a.length; i += 4) { const v = Math.max(a[i], a[i + 1], a[i + 2]); a[i + 3] = v < 40 ? 0 : Math.min(255, (v - 40) * 4); } g.putImageData(d, 0, 0); } catch { /* tainted: keep the black tile */ }
    t.needsUpdate = true; onReady && onReady();
  };
  img.onerror = () => { const g = c.getContext('2d'); g.fillStyle = '#d2a95a'; g.beginPath(); g.moveTo(30, 150); g.lineTo(128, 60); g.lineTo(226, 120); g.lineTo(140, 200); g.closePath(); g.fill(); t.needsUpdate = true; };
  img.src = new URL('../../assets/bird.png', import.meta.url).href;
  return t;
}

/** The visible shell. → { group, radar, dockOnly (passerelle + lines), dispose } */
export function buildShell() {
  const { M } = shellMaterials();
  const b = new GeoB(), group = new THREE.Group(); group.name = 'vrc-yacht-shell';
  const own = [];
  const mats = { ...M };
  mats.name = new THREE.MeshStandardMaterial({ map: nameTex(), transparent: true, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.2, emissive: '#6b5220', emissiveIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, side: THREE.DoubleSide }); mats.name.name = 'y-keep-name';
  mats.emblem = new THREE.MeshBasicMaterial({ map: emblemTex(), transparent: true, alphaTest: 0.08, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, side: THREE.DoubleSide }); mats.emblem.name = 'y-keep-emblem';
  mats.decal = new THREE.MeshBasicMaterial({ map: helipadTex(), transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }); mats.decal.name = 'y-keep-decal';
  own.push(mats.name, mats.emblem, mats.decal);

  // ---------------- hull
  const xs = [];
  { const N = 60; for (let i = 0; i <= N; i++) { const u = i / N; xs.push(u < 0.12 ? -66 + u / 0.12 * 8 : u < 0.55 ? -58 + (u - 0.12) / 0.43 * 62 : 4 + 62 * Math.pow((u - 0.55) / 0.45, 0.85)); } xs[N] = 66; }
  const bands = [[-1.6, 'antifoul'], [0.16, 'gold'], [0.36, 'hull'], [1.5, 'hull'], [3.0, 'hull'], ['c0', 'gold'], ['c1', 'hull'], ['top', null]];
  const yOf = (x, r) => { const s = sheer(x), v = bands[r][0]; return v === 'top' ? s : v === 'c0' ? s - 0.62 : v === 'c1' ? s - 0.5 : Math.min(v, s - (r <= 2 ? 0.9 - r * 0.1 : 0.62)); };
  // stations are plan coordinates: the raked stem moves each row's x forward with height (see hullHalf)
  const act = (xx, y) => xx <= 8 ? xx : 8 + (xx - 8) * (51 + 7 * Math.max(0, Math.min(1, y / 7))) / 58;
  const HP = (xx, r, sd) => { let x = xx, y = 0; for (let k = 0; k < 3; k++) { y = Math.max(-1.6, yOf(x, r)); x = act(xx, y); } return [x, y, sd * hullHalf(x, y)]; };
  for (let i = 0; i < xs.length - 1; i++) for (let r = 0; r < bands.length - 1; r++) for (const sd of [-1, 1]) {
    const a = HP(xs[i], r, sd), bb = HP(xs[i + 1], r, sd), c = HP(xs[i + 1], r + 1, sd), d = HP(xs[i], r + 1, sd);
    if (Math.abs(a[1] - d[1]) < 1e-4 && Math.abs(bb[1] - c[1]) < 1e-4) continue;
    if (sd > 0) b.quad(bands[r][1], bb, a, d, c); else b.quad(bands[r][1], a, bb, c, d);
  }
  { // transom + the swim platform's aft face
    const h0 = hullHalf(-66, -1.6), h1 = hullHalf(-66, Y.D1);
    b.quad('hull', [-66, -1.6, h0], [-66, -1.6, -h0], [-66, Y.D1, -h1], [-66, Y.D1, h1]);
  }
  // long hull windows of the lower deck (glow at night)
  for (const sd of [-1, 1]) for (const [x0, x1] of [[-55, -39], [-34, -8], [4, 20], [24, 36]]) {
    const n = Math.ceil((x1 - x0) / 2);
    for (let i = 0; i < n; i++) {
      const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n, y0 = 2.35, y1 = 3.25, o = 0.025;
      const q = [[xa, y0, sd * (hullHalf(xa, y0) + o)], [xb, y0, sd * (hullHalf(xb, y0) + o)], [xb, y1, sd * (hullHalf(xb, y1) + o)], [xa, y1, sd * (hullHalf(xa, y1) + o)]];
      if (sd > 0) b.quad('hwin', q[1], q[0], q[3], q[2]); else b.quad('hwin', ...q);
    }
  }
  // bulwark: inner face + cap, from the stern buttresses to the bow
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = HP(xs[i], bands.length - 1, 1)[0], xb = HP(xs[i + 1], bands.length - 1, 1)[0]; if (xb <= -65.5) continue;
    for (const sd of [-1, 1]) {
      const fl = (x) => Math.max(x < -59.5 ? Y.D1 : Y.D2, x - 58.9), sa = sheer(xa), sb = sheer(xb);
      const oa = hullHalf(xa, sa), ob = hullHalf(xb, sb), ia = Math.max(0, oa - 0.3), ib = Math.max(0, ob - 0.3);
      const ja = Math.max(0, Math.min(ia, hullHalf(xa, fl(xa)) - 0.3)), jb = Math.max(0, Math.min(ib, hullHalf(xb, fl(xb)) - 0.3));
      b.quad('white', [xa, fl(xa), sd * ja], [xb, fl(xb), sd * jb], [xb, sb, sd * ib], [xa, sa, sd * ia]);
      b.quad('white', [xa, sa, sd * ia], [xb, sb, sd * ib], [xb, sb, sd * ob], [xa, sa, sd * oa]);
    }
  }
  // ---------------- deck plates (top: teak; underside: soffit with downlights; edge: white fascia + LED line)
  const S = LOBBY.stair;
  const plate = (pl, o = {}) => {
    const brk = new Set([pl.x0, pl.x1]); for (let x = Math.ceil(pl.x0 / 2) * 2; x < pl.x1; x += 2) brk.add(x);
    if (o.hole) { brk.add(S.xa); brk.add(S.xl); }
    if (o.brk) for (const x of o.brk) brk.add(x);
    const l = [...brk].sort((p, q) => p - q), th = o.th ?? 0.26;
    for (let i = 0; i < l.length - 1; i++) {
      const xa = l[i], xb = l[i + 1], ha = pl.half(xa), hb = pl.half(xb);
      const strips = o.hole && xa >= S.xa - 1e-6 && xb <= S.xl + 1e-6 ? [[0, 0, 0], [0, 0, 1]] : [[0, 0, 2]];
      for (const st of strips) {
        const za = st[2] === 0 ? [-ha, S.zB0] : st[2] === 1 ? [S.zA1, ha] : [-ha, ha], zb = st[2] === 0 ? [-hb, S.zB0] : st[2] === 1 ? [S.zA1, hb] : [-hb, hb];
        const top = o.top ? o.top((xa + xb) / 2) : 'teak';
        b.quad(top, [xa, pl.y, za[1]], [xb, pl.y, zb[1]], [xb, pl.y, zb[0]], [xa, pl.y, za[0]]);
        if (o.under) b.quad(o.under, [xa, pl.y - th, za[0]], [xb, pl.y - th, zb[0]], [xb, pl.y - th, zb[1]], [xa, pl.y - th, za[1]]);
      }
      if (o.fascia) for (const sd of [-1, 1]) {
        b.quad('white', [xa, pl.y - th, sd * ha], [xb, pl.y - th, sd * hb], [xb, pl.y + 0.02, sd * hb], [xa, pl.y + 0.02, sd * ha]);
        if (o.led) b.quad('led', [xa, pl.y - th - 0.001, sd * (ha - 0.12)], [xb, pl.y - th - 0.001, sd * (hb - 0.12)], [xb, pl.y - th - 0.001, sd * (hb - 0.04)], [xa, pl.y - th - 0.001, sd * (ha - 0.04)]);
      }
    }
    if (o.fascia) for (const [x, flip] of [[pl.x0, false], [pl.x1, true]]) { const h = pl.half(x); if (h > 0.05) b.quad('white', [x, pl.y - th, -h], [x, pl.y - th, h], [x, pl.y + 0.02, h], [x, pl.y + 0.02, -h]); void flip; }
  };
  plate(PLATES[0], { top: (x) => x < -58 ? 'teak' : 'white' });
  plate(PLATES[1], { hole: true, under: 'soffit', brk: [-58, -38, 30] });
  plate(PLATES[2], { hole: true, under: 'soffit', fascia: true, led: true, brk: [-28, 22] });
  plate(PLATES[3], { hole: true, under: 'soffit', fascia: true, led: true, brk: [-4, 17] });
  plate(PLATES[4], { top: () => 'white', under: 'soffit', fascia: true, led: true, th: 0.3 });
  // the main deck's aft edge above the beach club: fascia with the name and the emblem
  { const h = PLATES[1].half(-59.5); b.quad('hull', [-59.5, Y.D2 - 0.9, h], [-59.5, Y.D2 - 0.9, -h], [-59.5, Y.D2 + 0.02, -h], [-59.5, Y.D2 + 0.02, h]);
    b.quad('white', [-59.5, Y.D2 - 0.9, -h], [-59.5, Y.D2 - 0.9, h], [-58, Y.D2 - 0.9, h], [-58, Y.D2 - 0.9, -h]);
    b.quad('name', [-59.53, Y.D2 - 0.78, 2.6], [-59.53, Y.D2 - 0.78, -2.6], [-59.53, Y.D2 - 0.1, -2.6], [-59.53, Y.D2 - 0.1, 2.6], [[1, 0.1], [0, 0.1], [0, 0.9], [1, 0.9]]);
    for (const sd of [-1, 1]) b.quad('emblem', [-59.53, Y.D2 - 0.86, sd * 4.4 + 0.45], [-59.53, Y.D2 - 0.86, sd * 4.4 - 0.45], [-59.53, Y.D2 + 0.0, sd * 4.4 - 0.45], [-59.53, Y.D2 + 0.0, sd * 4.4 + 0.45], [[1, 0], [0, 0], [0, 1], [1, 1]]);
    b.quad('led', [-59.52, Y.D2 - 0.9, h - 0.3], [-59.52, Y.D2 - 0.9, -h + 0.3], [-59.52, Y.D2 - 0.86, -h + 0.3], [-59.52, Y.D2 - 0.86, h - 0.3]);
  }
  // name on both bows
  for (const sd of [-1, 1]) {
    const x0 = 36, x1 = 50, y0 = 5.05, y1 = 6.75, z = (x) => sd * (hullHalf(x, 5.9) + 0.035);
    const q = [[x0, y0, z(x0)], [x1, y0, z(x1)], [x1, y1, z(x1)], [x0, y1, z(x0)]];
    if (sd > 0) b.quad('name', q[1], q[0], q[3], q[2], [[0, 0], [1, 0], [1, 1], [0, 1]]); else b.quad('name', ...q, [[1, 0], [0, 0], [0, 1], [1, 1]]);
  }
  // ---------------- superstructure tiers
  for (const t of TIERS) {
    const op = OPEN[t.id], pts = tierPts(t), lo = t.y0 + 0.55, hi = t.y1 - 0.45, dh = t.y0 + DOOR_H;
    const bandsOf = (open) => open ? [[dh, t.y1, 'white']] : [[t.y0, lo, 'white'], [lo, hi, 'glass'], [hi, t.y1, 'white']];
    let run = 0;
    for (const sd of [-1, 1]) for (let i = 0; i < pts.length - 1; i++) {
      const [xa, ha] = pts[i], [xb, hb] = pts[i + 1];
      if (Math.abs(xb - xa) < 1e-6) { b.wall('white', xa, sd * ha, xb, sd * hb, t.y0, t.y1); continue; }
      const f = (x) => ha + (hb - ha) * (x - xa) / (xb - xa);
      for (const [u0, u1, open] of cut(xa, xb, op.side)) {
        for (const [y0, y1, k] of bandsOf(open)) b.wall(k, u0, sd * f(u0), u1, sd * f(u1), y0, y1);
      }
      // mullions every second panel
      if (sd > 0) run++;
      if (i % 2 === 0 && !inSpans(xa - 0.2, xa + 0.2, op.side.map(([p, q]) => [p - 0.3, q + 0.3]))) b.box('dark', xa, (lo + hi) / 2, sd * ha, 0.07, hi - lo, 0.09, Math.atan2(-(hb - ha) * sd, xb - xa));
    }
    void run;
    const hA = t.hwAft ?? t.hw, hN = tierHalf(t, t.x1);
    for (const [u0, u1, open] of cut(-hA, hA, op.aft)) for (const [y0, y1, k] of bandsOf(open)) b.wall(k, t.x0, u0, t.x0, u1, y0, y1);
    for (const [y0, y1, k] of bandsOf(false)) b.wall(k, t.x1, -hN, t.x1, hN, y0, y1);
    for (const z of [-hN, 0, hN]) b.box('dark', t.x1, (lo + hi) / 2, z, 0.09, hi - lo, 0.07);
  }
  // ---------------- glass rails round the open decks
  const rail = (ax, az, bx, bz, y) => {
    b.wall('rail', ax, az, bx, bz, y + 0.1, y + 1.02);
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
    b.box('steel', (ax + bx) / 2, y + 1.05, (az + bz) / 2, L, 0.045, 0.06, ry);
    b.box('steel', ax, y + 0.53, az, 0.045, 1.02, 0.045, ry);
  };
  for (const pl of [PLATES[2], PLATES[3]]) {
    const n = Math.ceil((pl.x1 - pl.x0) / 2);
    for (const sd of [-1, 1]) for (let i = 0; i < n; i++) { const xa = pl.x0 + (pl.x1 - pl.x0) * i / n, xb = pl.x0 + (pl.x1 - pl.x0) * (i + 1) / n; rail(xa, sd * (pl.half(xa) - 0.06), xb, sd * (pl.half(xb) - 0.06), pl.y); }
    const ha = pl.half(pl.x0) - 0.06, hb = pl.half(pl.x1) - 0.06;
    for (let i = 0; i < 6; i++) rail(pl.x0 + 0.06, -ha + 2 * ha * i / 6, pl.x0 + 0.06, -ha + 2 * ha * (i + 1) / 6, pl.y);
    rail(pl.x1 - 0.06, -hb, pl.x1 - 0.06, hb, pl.y);
  }
  { const T = STERN_STAIR, z = T.z0 - 0.05; for (let i = 0; i < 4; i++) rail(-59.45, -z + 2 * z * i / 4, -59.45, -z + 2 * z * (i + 1) / 4, Y.D2); }
  // ---------------- stern stairs
  { const T = STERN_STAIR, run = (T.x1 - T.x0) / T.n, rise = (Y.D2 - Y.D1) / T.n;
    for (const sd of [-1, 1]) {
      const zc = sd * (T.z0 + T.z1) / 2, w = T.z1 - T.z0;
      for (let i = 0; i < T.n; i++) { b.box('teak', T.x0 + run * (i + 0.5), Y.D1 + rise * (i + 1) - 0.02, zc, run + 0.02, 0.04, w); b.box('white', T.x0 + run * (i + 1) - 0.012, Y.D1 + rise * (i + 0.5), zc, 0.024, rise, w); b.box('led', T.x0 + run * i + 0.02, Y.D1 + rise * (i + 1) - 0.06, zc, 0.012, 0.012, w - 0.2); }
      // stringer panel towards the platform (white) with a glass rail on it
      b.quad('white', [T.x0, Y.D1, sd * (T.z0 - 0.04)], [T.x1, Y.D1, sd * (T.z0 - 0.04)], [T.x1, Y.D2, sd * (T.z0 - 0.04)], [T.x0, Y.D1 + 0.02, sd * (T.z0 - 0.04)]);
      b.quad('rail', [T.x0, Y.D1 + 0.1, sd * (T.z0 - 0.05)], [T.x1, Y.D2 + 0.1, sd * (T.z0 - 0.05)], [T.x1, Y.D2 + 1.0, sd * (T.z0 - 0.05)], [T.x0, Y.D1 + 1.0, sd * (T.z0 - 0.05)]);
      b.box('steel', (T.x0 + T.x1) / 2, (Y.D1 + Y.D2) / 2 + 1.02, sd * (T.z0 - 0.05), Math.hypot(T.x1 - T.x0, Y.D2 - Y.D1), 0.045, 0.06, 0, 0, Math.atan2(Y.D2 - Y.D1, T.x1 - T.x0));
    }
  }
  // ---------------- hardtop pylons, funnel with the emblem, mast, domes, navigation lights
  for (const sd of [-1, 1]) b.box('white', -13, (Y.D4 + Y.ROOF) / 2 - 0.1, sd * 5.6, 1.1, Y.ROOF - Y.D4 - 0.2, 0.5, 0, 0, 0.16);
  { const fy = Y.ROOF;
    const sh = new THREE.Shape([[-3.2, 0], [3.0, 0], [2.2, 2.7], [-1.5, 2.9], [-3.2, 1.6]].map(([x, y]) => new THREE.Vector2(x, y)));
    const fg = new THREE.ExtrudeGeometry(sh, { depth: 4.4, bevelEnabled: false }); fg.translate(0, 0, -2.2);
    b.geo('dark', fg, new THREE.Matrix4().makeTranslation(-9, fy, 0)); fg.dispose();
    b.box('gold', -9.2, fy + 2.86, 0, 3.4, 0.08, 4.5, 0, 0, 0.03);
    for (const sd of [-1, 1]) {
      const q = [[-10.6, fy + 0.35, sd * 2.215], [-7.4, fy + 0.35, sd * 2.215], [-7.4, fy + 2.55, sd * 2.215], [-10.6, fy + 2.55, sd * 2.215]];
      if (sd > 0) b.quad('emblem', q[1], q[0], q[3], q[2], [[0, 0.12], [1, 0.12], [1, 0.88], [0, 0.88]]); else b.quad('emblem', ...q, [[1, 0.12], [0, 0.12], [0, 0.88], [1, 0.88]]);
    }
    // mast
    const mg = new THREE.CylinderGeometry(0.16, 0.42, 5.4, 10); b.geo('white', mg, new THREE.Matrix4().makeTranslation(3, fy + 2.7, 0)); mg.dispose();
    b.box('white', 3, fy + 3.2, 0, 0.5, 0.16, 6.4); b.box('white', 3, fy + 4.4, 0, 0.36, 0.12, 3.2);
    for (const sd of [-1, 1]) { const dg = new THREE.SphereGeometry(0.85, 16, 10); b.geo('white', dg, new THREE.Matrix4().makeTranslation(0.5, fy + 0.95, sd * 3.4)); dg.dispose(); b.box('white', 0.5, fy + 0.2, sd * 3.4, 0.5, 0.4, 0.5);
      const d2 = new THREE.SphereGeometry(0.38, 12, 8); b.geo('white', d2, new THREE.Matrix4().makeTranslation(3, fy + 3.62, sd * 2.8)); d2.dispose(); }
    b.box('led', 3, fy + 5.46, 0, 0.14, 0.14, 0.14);
    b.box('navG', 12, Y.ROOF + 0.12, 5.4, 0.3, 0.16, 0.12); b.box('navR', 12, Y.ROOF + 0.12, -5.4, 0.3, 0.16, 0.12);
  }
  // ---------------- helipad, tenders, foredeck gear
  b.quad('decal', [39.5, Y.D2 + 0.012, 5.6], [50.7, Y.D2 + 0.012, 5.6], [50.7, Y.D2 + 0.012, -5.6], [39.5, Y.D2 + 0.012, -5.6], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  for (const a of [0, 1, 2, 3, 4, 5, 6, 7]) { const an = a / 8 * Math.PI * 2; b.box('led', 45.1 + Math.cos(an) * 5.75, Y.D2 + 0.03, Math.sin(an) * 5.75, 0.12, 0.05, 0.12); }
  for (const sd of [-1, 1]) {
    const tg = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); tg.scale(3.4, 0.95, 1.15);
    b.geo('white', tg, new THREE.Matrix4().makeTranslation(34.7, Y.D2 + 1.25, sd * 3.5)); tg.dispose();
    b.box('teak', 34.5, Y.D2 + 1.26, sd * 3.5, 5.6, 0.03, 1.9);
    b.box('dark', 35.4, Y.D2 + 1.55, sd * 3.5, 1.5, 0.55, 1.5, 0, 0, 0); b.box('steel', 33.2, Y.D2 + 0.35, sd * 3.5, 0.2, 0.7, 1.7); b.box('steel', 36.4, Y.D2 + 0.35, sd * 3.5, 0.2, 0.7, 1.5);
  }
  for (const sd of [-1, 1]) { b.box('steel', 57, Y.D2 + 0.3, sd * 0.9, 0.7, 0.6, 0.5); b.box('dark', 55.4, Y.D2 + 0.05, sd * 0.9, 2.6, 0.06, 0.16); }
  // ---------------- underwater lights
  const uwq = (x, z, s) => b.quad('uw', [x - s, 0.05, z + s], [x + s, 0.05, z + s], [x + s, 0.05, z - s], [x - s, 0.05, z - s], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  for (let x = -62; x <= 44; x += 9) for (const sd of [-1, 1]) uwq(x, sd * (hullHalf(x, 0) + 0.6), 5.5);
  for (const z of [-5, 0, 5]) uwq(-68.5, z, 5);

  for (const m of b.build(mats, 'shell')) group.add(m);

  // ---------------- radar (turns), passerelle + mooring lines (only alongside)
  const radar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 2.6), M.white); radar.position.set(3, Y.ROOF + 4.62, 0); radar.name = 'yacht-radar'; group.add(radar);
  const dock = new THREE.Group(); dock.name = 'yacht-dock-only';
  { const d = new GeoB(), L = Math.hypot(PASS.x1 - PASS.x0, PASS.y1 - PASS.y0), an = Math.atan2(PASS.y1 - PASS.y0, PASS.x1 - PASS.x0), cx = (PASS.x0 + PASS.x1) / 2, cy = (PASS.y0 + PASS.y1) / 2;
    d.box('teak', cx, cy - 0.03, 0, L + 0.5, 0.06, PASS.hw * 2 + 0.2, 0, 0, an);
    for (const sd of [-1, 1]) { d.box('steel', cx, cy + 0.95, sd * (PASS.hw + 0.08), L, 0.04, 0.04, 0, 0, an); d.box('steel', cx, cy + 0.5, sd * (PASS.hw + 0.08), L, 0.025, 0.025, 0, 0, an);
      for (const k of [-0.45, 0, 0.45]) d.box('steel', cx + k * L * Math.cos(an), cy + k * L * Math.sin(an) + 0.47, sd * (PASS.hw + 0.08), 0.035, 0.95, 0.035); }
    // mooring lines: stern corners → pier bollards
    for (const sd of [-1, 1]) { const a = new THREE.Vector3(-65.6, Y.D1 + 0.05, sd * 6.2), c = new THREE.Vector3(-70.6, 0.9, sd * 1.55), mid = a.clone().add(c).multiplyScalar(0.5), len = a.distanceTo(c);
      const g = new THREE.CylinderGeometry(0.035, 0.035, len, 6); g.rotateZ(Math.PI / 2); const m = new THREE.Matrix4().lookAt(a, c, new THREE.Vector3(0, 1, 0)); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), c.clone().sub(a).normalize());
      d.geo('rope', g, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1))); g.dispose(); void m; }
    for (const m of d.build(mats, 'dock')) dock.add(m);
  }
  group.add(dock);
  return {
    group, radar, dockOnly: dock, mats,
    dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); for (const m of own) { if (m.map) m.map.dispose(); m.dispose(); } },
  };
}
