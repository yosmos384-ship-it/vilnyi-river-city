// interior-bath.js — bath 1 (main floor, tub/shower) and bath 2 (upstairs, glass shower) + shared toilet/vanity
import { THREE, PI, V3, Batch, shaker, pull, knob, hinged, drawer, waterFixture, plant, ellipsePts, roundRectPts, rng, switchPlate } from './interior-lib.js';
import { bottle, jar } from './interior-kitchen.js';
import { C as LX, soft, tube, fluted, bknob, bcup, vase, diffuser, candle, towelStack, heatedRail, hangingTowel, mirrorDisc, sconce, BR } from './interior-lux.js';

const WHITE = 0xf7f7f5, BLACK = 0x1b1b1b, CHROME = LX.brass, BRASS = LX.brass; // V2: all fixtures brushed brass

// ------------------------------------------------------------------ toilet (frame: back at wall z=0, floor y=0, facing +z)
export function toilet(E, G, F, label = '') {
  const bz = 0.45, sz = 1.22;
  F.add('ceramic', new THREE.LatheGeometry([
    [0, 0], [0.115, 0], [0.12, 0.01], [0.1, 0.06], [0.105, 0.18], [0.15, 0.27], [0.183, 0.35], [0.195, 0.392], [0.19, 0.405], [0.172, 0.405],
    [0.156, 0.385], [0.13, 0.33], [0.095, 0.285], [0.06, 0.255], [0.0, 0.248]].map(([r, y]) => new THREE.Vector2(r, y)), 40), [0, 0, bz], WHITE, { sz });
  F.box('ceramic', [0.2, 0.16, 0.16], [0, 0.32, 0.27], WHITE, { r: 0.04 });
  F.box('ceramic', [0.46, 0.36, 0.18], [0, 0.6, 0.115], WHITE, { r: 0.04, seg: 4 });
  F.box('ceramic', [0.48, 0.03, 0.2], [0, 0.795, 0.115], WHITE, { r: 0.012 });
  F.box('ceramic', [0.17, 0.2, 0.1], [0, 0.42, 0.06], WHITE, { r: 0.03 });
  F.cyl('ceramic', 0.012, 0.012, 0.025, [0.12, 0.012, 0.6], WHITE, { seg: 10 });
  F.cyl('ceramic', 0.012, 0.012, 0.025, [-0.12, 0.012, 0.6], WHITE, { seg: 10 });
  F.cyl('brass', 0.006, 0.006, 0.18, [-0.15, 0.14, 0.012], BRASS, { seg: 8 });
  F.box('brass', [0.05, 0.05, 0.03], [-0.15, 0.06, 0.02], BRASS, { r: 0.008 });
  // water + swirl overlay
  const wy = 0.3;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.1, 32), E.M.water);
  const swirlM = new THREE.MeshStandardMaterial({ color: 0xffffff, map: E.M._T.swirl, transparent: true, opacity: 0.0, depthWrite: false, roughness: 0.1 });
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(0.098, 32), swirlM);
  const wg = new THREE.Group(); F.place(wg, [0, wy, bz]); G.add(wg);
  const wgi = new THREE.Group(); wgi.scale.set(1, 1, sz * 0.92); wg.add(wgi);
  water.rotation.x = -PI / 2; swirl.rotation.x = -PI / 2; swirl.position.y = 0.002; water.renderOrder = 2; swirl.renderOrder = 3;
  const spin = new THREE.Group(); spin.add(swirl); wgi.add(water); wgi.add(spin);
  // seat + lid (pivot on hinge)
  const hz = 0.215, hy = 0.407;
  const seatSt = hinged(E, G, F, {
    pos: [0, hy, hz], hinge: 'T', angle: 1.66, dur: 0.6, labels: ['הרם מושב', 'הורד מושב'], snd: 'none',
    draw: (p) => { p.slab('gloss', ellipsePts(0, 0.235, 0.183, 0.228, 40), [ellipsePts(0, 0.25, 0.112, 0.142, 32)], 0.022, 0.02, WHITE, { curve: 32 }); p.box('gloss', [0.26, 0.016, 0.03], [0, 0.01, 0.0], 0xe8e8e6, { r: 0.006 }); },
  });
  const lidSt = hinged(E, G, F, {
    pos: [0, hy + 0.022, hz - 0.004], hinge: 'T', angle: 1.72, dur: 0.7, labels: ['פתח מכסה אסלה', 'סגור מכסה אסלה'], snd: 'none',
    draw: (p) => { p.slab('gloss', ellipsePts(0, 0.235, 0.19, 0.232, 40), [], 0.022, 0.022, WHITE, { curve: 32, bevel: 0.003 }); },
  });
  // hinged T rotates -angle around x (top hinge). Our seat/lid lie flat: closed = 0, open = rotate up toward -z (handle up)
  // ordering rules
  seatSt.toggle = async () => { if (!seatSt.open && !lidSt.open) await lidSt.set(true); await seatSt.set(!seatSt.open); E.snd.click(seatSt.pivot, 0.5); };
  lidSt.toggle = async () => { if (lidSt.open && seatSt.open) await seatSt.set(false); await lidSt.set(!lidSt.open); E.snd.thud(lidSt.pivot, 0.35); };
  // flush lever
  const lm = new THREE.Group(); F.place(lm, [-0.17, 0.72, 0.208]); G.add(lm);
  const lever = new THREE.Group(); lm.add(lever);
  const lb = new Batch(); lb.root.cyl('brass', 0.02, 0.02, 0.012, [0, 0, 0.006], BRASS, { rx: PI / 2, seg: 20 }); lb.root.box('brass', [0.075, 0.012, 0.012], [0.04, 0, 0.016], BRASS, { r: 0.005 }); lb.build(lever, E.M);
  const tankHit = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.4, 0.22), new THREE.MeshBasicMaterial({ visible: false }));
  F.place(tankHit, [0, 0.61, 0.115]); G.add(tankHit);
  const fl = { t: -1, spinV: 0.3 };
  E.interact(tankHit, () => (fl.t >= 0 ? 'מוריד מים…' : 'הורד מים'), () => {
    if (fl.t >= 0) return;
    fl.t = 0;
    E.anim.to(lever.rotation, 'z', -0.6, 0.15).then(() => E.anim.to(lever.rotation, 'z', 0, 0.4));
    const s = E.snd;
    s.burst(tankHit, { dur: 0.35, type: 'bandpass', freq: 900, q: 1, vol: 0.18 });
    s.burst(tankHit, { dur: 2.6, type: 'lowpass', freq: 2200, freqEnd: 350, vol: 0.42, attack: 0.15, delay: 0.1 });
    s.burst(tankHit, { dur: 1.2, type: 'bandpass', freq: 520, q: 4, vol: 0.2, attack: 0.1, delay: 1.2 });
    s.burst(tankHit, { dur: 3.0, type: 'highpass', freq: 3500, vol: 0.05, attack: 0.5, delay: 1.8 });
  });
  E.anim.tick((dt) => {
    if (fl.t < 0) { spin.rotation.y += dt * 0.2; return; }
    fl.t += dt; const t = fl.t;
    const dip = t < 0.5 ? t / 0.5 : t < 1.4 ? 1 : Math.max(0, 1 - (t - 1.4) / 2.6);
    wg.position.y = F.pt(0, wy, bz).y - dip * 0.055;
    wgi.scale.x = 1 - dip * 0.35; wgi.scale.z = sz * 0.92 * (1 - dip * 0.35);
    const sp = t < 2.2 ? Math.min(1, t / 0.4) : Math.max(0, 1 - (t - 2.2) / 1.5);
    spin.rotation.y += dt * (0.2 + sp * 14);
    swirlM.opacity = 0.85 * sp;
    if (t > 4.2) { fl.t = -1; swirlM.opacity = 0; wg.position.y = F.pt(0, wy, bz).y; wgi.scale.set(1, 1, sz * 0.92); }
  });
  F.solid(E, [0.46, 0.8, 0.7], [0, 0.4, 0.35]);
  return { seatSt, lidSt };
}


// ------------------------------------------------------------------ small fixtures
function faucetDeck(F, x, y, z, reach = 0.13) {
  // V2 brushed-brass single-lever with a soft arc spout
  F.cyl('brass', 0.024, 0.026, 0.012, [x, y + 0.006, z], BRASS, { seg: 20 });
  F.cyl('brass', 0.014, 0.015, 0.15, [x, y + 0.08, z], BRASS, { seg: 16 });
  tube(F, 'brass', [[x, y + 0.15, z], [x, y + 0.19, z + 0.02], [x, y + 0.2, z + reach * 0.6], [x, y + 0.18, z + reach]], 0.0095, BRASS, { tseg: 20, rs: 12 });
  F.cyl('brass', 0.011, 0.0095, 0.02, [x, y + 0.176, z + reach], BRASS, { seg: 12 });
  F.cyl('brass', 0.008, 0.008, 0.03, [x + 0.022, y + 0.12, z], BRASS, { rz: PI / 2, seg: 10 });
  F.cyl('brass', 0.004, 0.005, 0.06, [x + 0.04, y + 0.145, z], BRASS, { rz: 0.3, seg: 8 });
}

function vanityTopWithBasin(F, w, d, top, cx, cz, rx, rz, color = 0xffffff) {
  F.slab('marble', [[-w / 2, 0], [w / 2, 0], [w / 2, d], [-w / 2, d]], [ellipsePts(cx, cz, rx, rz, 40)], top, 0.03, color, { bevel: 0.004, curve: 40 });
  F.lathe('ceramic', [[0.0, -0.14], [0.03, -0.14], [0.06, -0.13], [0.09, -0.09], [0.1, -0.04], [0.105, 0]].map(([r, y]) => [r, y]), [cx, top - 0.029, cz], WHITE, { sx: rx / 0.105, sz: rz / 0.105, seg: 36 });
  F.cyl('brass', 0.018, 0.018, 0.004, [cx, top - 0.029 - 0.138, cz], BRASS, { seg: 16 });
  F.box('marble', [w, 0.1, 0.018], [0, top + 0.05, 0.009], color, { r: 0.004 });
}

function towel(F, x, y, z, w, h, col) {
  F.box('fabric', [w, h, 0.012], [x, y - h / 2, z + 0.016], col, { r: 0.005 });
  F.box('fabric', [w, h * 0.72, 0.012], [x, y - h * 0.36, z - 0.016 + 0.032], col, { r: 0.005 });
  F.box('fabric', [w, 0.02, 0.04], [x, y, z + 0.016], col, { r: 0.009 });
}

function ellipseWater(E, G, center, rx, rz, bottom) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 28); geo.translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo, E.M.water); m.position.set(center.x, bottom, center.z);
  m.scale.set(rx, 0.001, rz); m.visible = false; m.renderOrder = 1; G.add(m); return m;
}

function exhaustFan(E, top, x, y, z, floor) {
  const g = new THREE.Group(); g.userData.floor = floor; g.userData.ceiling = true; top.add(g);
  const b = new Batch(), f = b.root;
  f.box('plastic', [0.28, 0.012, 0.28], [x, y - 0.006, z], 0xf4f4f2, { r: 0.004 });
  for (let i = 0; i < 9; i++) f.box('plastic', [0.22, 0.008, 0.012], [x, y - 0.016, z - 0.1 + i * 0.025], 0xe6e6e3, { r: 0 });
  b.build(g, E.M, { shadow: false });
  const st = { on: false };
  const hum = E.snd.hum(g.children[0] || g, { freq: 95, noiseF: 900, vol: 0.12 });
  E.interact(g, () => (st.on ? 'כבה מאוורר' : 'הפעל מאוורר'), () => { st.on = !st.on; E.snd.switchClick(g); if (st.on) hum.start(); else hum.stop(0.6); });
}

// wall-mounted exhaust grille (frame: wall face, facing +z)
function wallFan(E, G, F, y) {
  const b = new Batch(), f = F.withBatch(b);
  f.box('plastic', [0.24, 0.24, 0.012], [0, y, 0.006], 0xf4f4f2, { r: 0.004 });
  for (let i = 0; i < 8; i++) f.box('plastic', [0.19, 0.012, 0.008], [0, y - 0.085 + i * 0.024, 0.014], 0xe6e6e3, { r: 0 });
  const g = new THREE.Group(); G.add(g); b.build(g, E.M, { shadow: false });
  const st = { on: false };
  const hum = E.snd.hum(g, { freq: 95, noiseF: 900, vol: 0.12 });
  E.interact(g, () => (st.on ? 'כבה מאוורר' : 'הפעל מאוורר'), () => { st.on = !st.on; E.snd.switchClick(g); if (st.on) hum.start(); else hum.stop(0.6); });
}

// ------------------------------------------------------------------ fluted floating vanity (frame: back at wall z=0, facing +z)
function flutedVanity(E, G, V, o) {
  const vw = o.w, vd = o.d, top = o.top, y0 = o.y0, key = o.key || 'walnut', vc = o.c || 0xffffff;
  const bh = top - 0.03 - y0; // carcass height under the marble top
  V.box(key, [vw, 0.02, vd - 0.02], [0, y0 + 0.01, (vd - 0.02) / 2], vc, { r: 0.004, grain: 'h' });
  V.box(key, [0.02, bh, vd - 0.02], [-vw / 2 + 0.01, y0 + bh / 2, (vd - 0.02) / 2], vc, { r: 0.004 });
  V.box(key, [0.02, bh, vd - 0.02], [vw / 2 - 0.01, y0 + bh / 2, (vd - 0.02) / 2], vc, { r: 0.004 });
  V.box(key, [vw - 0.04, bh, 0.012], [0, y0 + bh / 2, 0.006], vc, { r: 0 });
  V.box(key, [vw - 0.04, 0.016, vd - 0.06], [0, y0 + bh * 0.42, (vd - 0.04) / 2], vc, { r: 0 }); // shelf
  V.box('brass', [vw - 0.02, 0.012, 0.012], [0, y0 - 0.006, vd - 0.03], BRASS, { r: 0.004 });          // brass shadow-line trim
  const dh = 0.15, gap = 0.004, doorH = bh - dh - 3 * gap;
  if (o.contents) { try { o.contents(V, y0 + 0.02, y0 + bh * 0.42 + 0.008); } catch (e) { } }
  const dr = drawer(E, G, V, { pos: [0, top - 0.03 - gap - dh / 2, vd], w: vw - 0.012, h: dh, depth: vd - 0.12, key, color: vc, boxKey: 'duo', boxColor: 0xe9e2d6, boxH: 0.08,
    draw: (p) => { p.box(key, [vw - 0.012, dh, 0.018], [0, 0, -0.009], vc, { r: 0.004, grain: 'h' }); bcup(p, 0, 0.02, 0, 0.1); },
    contents: o.drawerContents || null });
  const door = hinged(E, G, V, { pos: [-vw / 2 + 0.006, y0 + gap, vd], hinge: 'L', angle: 1.8, labels: ['פתח ארונית', 'סגור ארונית'],
    draw: (p) => { const w2 = vw - 0.012; p.box(key, [w2, doorH, 0.012], [w2 / 2, doorH / 2, -0.012], vc, { r: 0.003 }); fluted(p, key, 0.004, 0.004, w2 - 0.008, doorH - 0.008, -0.004, vc, { pitch: 0.026 }); bknob(p, w2 - 0.045, doorH - 0.07, 0.006, 0.013); } });
  return { dr, door };
}

// round backlit mirror cabinet (door = mirror). frame V: wall face z=0 facing +z. returns hinged state
function mirrorCabinet(E, G, V, cy, R, room) {
  const md = 0.11, glow = E.glow ? E.glow(room, 1.8) : E.M.led;
  V.cyl('duo', R - 0.01, R - 0.01, md, [0, cy, md / 2], 0xf2efe9, { rx: PI / 2, seg: 48 });
  V.torus(glow, R + 0.018, 0.007, [0, cy, 0.03], 0xffffff, { ts: 64, rs: 6 }); // LED halo washing the wall
  // inside: glass shelves + bottles (fit inside the circle)
  for (const [sy, sw] of [[-0.12, R * 1.5], [0.06, R * 1.75]]) V.box('glass', [sw, 0.006, md - 0.025], [0, cy + sy, md / 2], 0xffffff, { r: 0 });
  const meds = [0xe9e4da, 0x8a5a2c, 0x2f3a45, 0xd9c3a3, 0x6f7d6a];
  for (let i = 0; i < 4; i++) bottle(V, i % 2 ? 'amber' : 'ceramic', -0.12 + i * 0.08, cy - 0.117, 0.05, 0.11 + (i % 2) * 0.03, 0.02, meds[i], BRASS);
  for (let i = 0; i < 3; i++) bottle(V, 'ceramic', -0.08 + i * 0.08, cy + 0.063, 0.05, 0.1, 0.022, meds[(i + 2) % 5], BRASS);
  const st = hinged(E, G, V, {
    pos: [-R, cy, md + 0.012], hinge: 'L', angle: 1.55, labels: ['פתח ארון מראה', 'סגור ארון מראה'],
    draw: (p, pivot) => {
      p.torus('brass', R, 0.011, [R, 0, -0.004], BRASS, { ts: 64, rs: 10 });
      p.cyl('duo', R - 0.004, R - 0.004, 0.012, [R, 0, -0.008], 0xe9e5dc, { rx: PI / 2, seg: 48 });
      try { mirrorDisc(E, pivot, p, [R, 0, 0.0015], R - 0.006); } catch (e) { }
    },
  });
  return st;
}

// ------------------------------------------------------------------ BATH 1 (main floor)
export function buildBath1(E, G, top) {
  const F0 = E.plan.mainFloor, CEIL = E.plan.mainCeil - F0 - 0.004;
  const B = new Batch(), root = B.root;
  const XW = 3.718, XE = 5.426, ZN = 0.125, ZS = 2.074;
  // ---- alcove tub along north wall (x 3.718..5.242, z 0.125..0.887): ceramic tub, Calacatta apron
  const T = root.sub(XW, F0, ZN, 0), TL = 1.524, TD = 0.762, TH = 0.5;
  T.box('marble', [TL, TH - 0.03, 0.05], [TL / 2, (TH - 0.03) / 2, TD - 0.025], 0xffffff, { r: 0.006 });
  const hole = roundRectPts(0.09, 0.08, TL - 0.07, TD - 0.09, 0.13);
  T.slab('marble', [[0, 0], [TL, 0], [TL, TD], [0, TD]], [hole], TH, 0.05, 0xffffff, { bevel: 0.006 });
  const ib = { x0: 0.09, x1: TL - 0.07, z0: 0.08, z1: TD - 0.09, y0: 0.07, y1: TH - 0.05 };
  T.box('ceramic', [ib.x1 - ib.x0, 0.02, ib.z1 - ib.z0], [(ib.x0 + ib.x1) / 2, ib.y0, (ib.z0 + ib.z1) / 2], WHITE, { r: 0.006 });
  T.box('ceramic', [0.012, ib.y1 - ib.y0, ib.z1 - ib.z0], [ib.x0, (ib.y0 + ib.y1) / 2, (ib.z0 + ib.z1) / 2], WHITE, { r: 0 });
  T.box('ceramic', [0.012, ib.y1 - ib.y0, ib.z1 - ib.z0], [ib.x1, (ib.y0 + ib.y1) / 2, (ib.z0 + ib.z1) / 2], WHITE, { r: 0, rz: -0.25 });
  T.box('ceramic', [ib.x1 - ib.x0, ib.y1 - ib.y0, 0.012], [(ib.x0 + ib.x1) / 2, (ib.y0 + ib.y1) / 2, ib.z0], WHITE, { r: 0 });
  T.box('ceramic', [ib.x1 - ib.x0, ib.y1 - ib.y0, 0.012], [(ib.x0 + ib.x1) / 2, (ib.y0 + ib.y1) / 2, ib.z1], WHITE, { r: 0 });
  T.cyl('brass', 0.03, 0.03, 0.004, [0.2, ib.y0 + 0.012, TD / 2], BRASS, { seg: 18 });
  T.cyl('brass', 0.035, 0.035, 0.006, [ib.x0 + 0.008, 0.36, TD / 2], BRASS, { rz: PI / 2, seg: 18 });
  // ledge at east end (marble)
  T.box('marble', [XE - XW - TL, TH, TD], [TL + (XE - XW - TL) / 2, TH / 2, TD / 2], 0xffffff, { r: 0 });
  T.box('marble', [XE - XW - TL, 0.02, TD], [TL + (XE - XW - TL) / 2, TH + 0.01, TD / 2], 0xffffff, { r: 0.002 });
  // book-matched Calacatta slabs, floor-to-ceiling around the tub (window opening x 0.47..1.23 kept clear up to its head)
  const tt = 0.01, W = XE - XW, wy = 2.07;
  T.box('marble', [W, 1.45 - TH, tt], [W / 2, (TH + 1.45) / 2, tt / 2], 0xffffff, { r: 0 });
  T.box('marble', [0.47, CEIL - 1.45, tt], [0.235, (1.45 + CEIL) / 2, tt / 2], 0xffffff, { r: 0 });
  T.box('marble', [W - 1.23, CEIL - 1.45, tt], [1.23 + (W - 1.23) / 2, (1.45 + CEIL) / 2, tt / 2], 0xffffff, { r: 0 });
  T.box('marble', [0.76, CEIL - wy, tt], [0.85, (wy + CEIL) / 2, tt / 2], 0xffffff, { r: 0 });
  T.box('marble', [tt, CEIL - TH, TD + 0.04], [tt / 2, (TH + CEIL) / 2, (TD + 0.04) / 2], 0xffffff, { r: 0 });
  T.box('marble', [tt, CEIL - TH, TD + 0.04], [W - tt / 2, (TH + CEIL) / 2, (TD + 0.04) / 2], 0xffffff, { r: 0 });
  // niche shelf + amber / ceramic bottles
  T.box('marble', [0.34, 0.025, 0.1], [0.75, 1.25, 0.06], 0xffffff, { r: 0.003 });
  bottle(T, 'amber', 0.64, 1.263, 0.06, 0.2, 0.03, 0x8a4a1a, BRASS);
  bottle(T, 'ceramic', 0.73, 1.263, 0.06, 0.2, 0.03, 0xe9e2d6, BRASS);
  bottle(T, 'amber', 0.82, 1.263, 0.06, 0.16, 0.028, 0x5a3a1a, BRASS);
  // shower: brass rain head on a ceiling-height arm, valve trim, tub spout (west wall, local x = 0 plane)
  const hz = TD / 2;
  T.cyl('brass', 0.03, 0.03, 0.012, [0.016, 2.02, hz], BRASS, { rz: PI / 2, seg: 18 });
  tube(T, 'brass', [[0.016, 2.02, hz], [0.15, 2.03, hz], [0.27, 2.0, hz], [0.3, 1.97, hz]], 0.011, BRASS, { tseg: 16, rs: 10 });
  T.cyl('brass', 0.1, 0.1, 0.012, [0.3, 1.955, hz], BRASS, { seg: 40 });
  T.cyl('matte', 0.092, 0.092, 0.002, [0.3, 1.948, hz], 0x2a2a2a, { seg: 40 });
  T.cyl('brass', 0.08, 0.08, 0.01, [0.015, 1.15, hz], BRASS, { rz: PI / 2, seg: 32 });
  T.cyl('brass', 0.02, 0.022, 0.13, [0.075, 0.66, hz], BRASS, { rz: PI / 2, seg: 16 });
  T.cyl('brass', 0.016, 0.016, 0.03, [0.135, 0.645, hz], BRASS, { seg: 12 });
  // hand shower on a slide bar
  T.cyl('brass', 0.008, 0.008, 0.6, [0.02, 1.25, hz + 0.2], BRASS, { seg: 10 });
  T.cyl('brass', 0.018, 0.012, 0.18, [0.04, 1.42, hz + 0.2], BRASS, { seg: 14, rz: 0.15 });
  const vm = new THREE.Group(); T.place(vm, [0.022, 1.15, hz]); G.add(vm);
  const valve = new THREE.Group(); vm.add(valve);
  const vb = new Batch(); vb.root.cyl('brass', 0.022, 0.025, 0.04, [0.02, 0, 0], BRASS, { rz: PI / 2, seg: 18 }); vb.root.box('brass', [0.018, 0.012, 0.1], [0.04, 0, 0.04], BRASS, { r: 0.005 }); vb.build(valve, E.M);
  waterFixture(E, G, {
    target: valve, kind: 'shower', lever: { obj: valve, prop: 'x', on: -1.2, off: 0 },
    from: T.pt(0.3, 1.94, hz), dir: T.dir(0.08, -1, 0), streamLen: 1.4, stream: false,
    labels: ['הפעל מקלחת', 'סגור מקלחת'], rate: 260, spread: 0.25, sprayR: 0.22, floorY: F0 + ib.y0 + 0.012,
  });
  // hinged glass screen (brass frame) on the tub rim at the west end
  hinged(E, G, T, {
    pos: [0.012, TH + 0.005, TD - 0.03], hinge: 'L', angle: 1.25, dur: 0.8, labels: ['פתח מחיצת זכוכית', 'סגור מחיצת זכוכית'], snd: 'cab',
    draw: (p) => {
      p.box('glassClear', [0.8, 1.45, 0.008], [0.4, 0.725, -0.004], 0xffffff, { r: 0 });
      p.box('brass', [0.02, 1.45, 0.02], [0.01, 0.725, -0.004], BRASS, { r: 0.004 });
      p.box('brass', [0.8, 0.014, 0.014], [0.4, 1.445, -0.004], BRASS, { r: 0.003 });
      p.cyl('brass', 0.008, 0.008, 0.3, [0.76, 0.9, 0.025], BRASS, { seg: 10 });
      for (const yy of [0.77, 1.03]) p.cyl('brass', 0.005, 0.005, 0.03, [0.76, yy, 0.01], BRASS, { rx: PI / 2, seg: 8 });
    },
  });
  // ledge styling: stacked towels, diffuser, candle, small plant
  const LG = root.sub(XW + TL + (XE - XW - TL) / 2, F0 + TH + 0.02, ZN, 0);
  towelStack(LG, 0, 0, 0.2, 0.15, 0.3, 3, [0xf4f0e8, 0xe7e0d3, 0xf4f0e8]);
  diffuser(LG, 0, 0, 0.47, rng(5));
  candle(LG, 0.0, 0, 0.63, 0.08, 0.03);
  // bath mat
  soft(root, 'terry', [0.8, 0.012, 0.4], [4.45, F0 + 0.006, 1.15], 0xeee8dc, { e1: 0.3, e2: 0.08, noise: 0.0015, nu: 20, nv: 8 });
  // ---- fluted walnut floating vanity on east wall (front faces -x), z 0.90..1.433
  const V = root.sub(XE, F0, 1.165, -PI / 2), vw = 0.533, vd = 0.46, vtop = 0.86;
  flutedVanity(E, G, V, { w: vw, d: vd, top: vtop, y0: 0.32, key: 'walnut',
    contents: (f, yb, ys) => { bottle(f, 'ceramic', -0.12, yb, 0.2, 0.18, 0.04, 0xe9e2d6, BRASS); towelStack(f, 0.1, ys, 0.22, 0.2, 0.26, 2, [0xf4f0e8, 0xd9cdb8]); },
    drawerContents: (cf) => { cf.box('plastic', [0.12, 0.02, 0.05], [-0.1, 0.01, 0], 0xd9cdb8, { r: 0.005 }); cf.cyl('brass', 0.012, 0.012, 0.15, [0.05, 0.012, 0], BRASS, { rx: PI / 2, seg: 8 }); } });
  vanityTopWithBasin(V, vw + 0.02, vd + 0.02, vtop, 0, 0.27, 0.16, 0.12);
  faucetDeck(V, 0, vtop, 0.07, 0.13);
  vase(V, 0.2, vtop, 0.4, 'bottle', 0x6f7d6a, 0.6);
  diffuser(V, -0.2, vtop, 0.4, rng(8));
  const bcen = V.pt(0, 0, 0.27), basinBot = F0 + vtop - 0.029 - 0.13;
  const bw = ellipseWater(E, G, bcen, 0.11, 0.15, basinBot);
  const fh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.17), new THREE.MeshBasicMaterial({ visible: false }));
  V.place(fh, [0, vtop + 0.11, 0.12]); G.add(fh);
  waterFixture(E, G, { target: fh, from: V.pt(0, vtop + 0.166, 0.2), basin: { mesh: bw, bottom: basinBot, max: 0.1, rate: 0.008, drain: 0.02 }, labels: ['פתח ברז', 'סגור ברז'], rate: 60 });
  // round backlit mirror cabinet
  mirrorCabinet(E, G, V, 1.5, 0.25, 'bath1');
  // ---- toilet on east wall (faces -x) z centre 1.72
  const tl = toilet(E, G, root.sub(XE, F0, 1.72, -PI / 2));
  void tl;
  // ---- heated brass towel ladder (west wall, by the tub) with hanging towels
  const HR = root.sub(XW, F0, 1.13, PI / 2);
  heatedRail(HR, 0, 0.62, 0.42, 0.86, 6);
  hangingTowel(HR, -0.06, 1.3, 0.06, 0.2, 0.42, 0xf2ede4); hangingTowel(HR, 0.1, 1.13, 0.06, 0.18, 0.36, 0xc9b79c);
  // ---- TP holder (south wall), sconce over the TP area
  const TP = root.sub(4.93, F0, ZS, PI);
  TP.cyl('brass', 0.006, 0.006, 0.13, [0, 0.66, 0.05], BRASS, { rz: PI / 2, seg: 8 });
  TP.box('brass', [0.012, 0.04, 0.05], [0.07, 0.66, 0.025], BRASS, { r: 0.004 });
  TP.cyl('terry', 0.055, 0.055, 0.1, [-0.005, 0.66, 0.05], 0xffffff, { rz: PI / 2, seg: 18 });
  const glow = E.glow ? E.glow('bath1', 1.6) : E.M.led;
  sconce(root.sub(5.12, F0, ZS, PI), glow, 0, 1.62, {});
  // switch
  E.switchAt(G, root.sub(4.7, F0, ZS, PI), 'bath1', [0, 1.2, 0]);
  B.build(G, E.M, { name: 'bath1' });
  exhaustFan(E, top, 4.95, E.plan.mainCeil, 1.4, 'main');
  // colliders
  E.box(XW, XW + 1.708, ZN, ZN + TD, F0, F0 + TH);
  E.box(XE - 0.48, XE, 0.9, 1.433, F0 + 0.3, F0 + 0.9);
  E.box(XW, XW + 0.1, 0.9, 1.36, F0, F0 + 1.5);
}

// ------------------------------------------------------------------ BATH 2 (upper)
export function buildBath2(E, G, top) {
  const P = E.plan, F2 = P.upperFloor, ceil = (z) => P.upperCeilAt(z);
  const B = new Batch(), root = B.root;
  const XW = 1.96, XE = 3.902, ZN = 1.524, ZS = 3.14;
  const sx0 = 2.896, sz1 = 2.743;
  // walk-in shower: low marble tray + brass linear drain
  root.box('marble', [XE - sx0, 0.065, sz1 - ZN], [(sx0 + XE) / 2, F2 + 0.0325, (ZN + sz1) / 2], 0xffffff, { r: 0.006 });
  root.box('brass', [0.62, 0.004, 0.05], [(sx0 + XE) / 2, F2 + 0.066, ZN + 0.12], BRASS, { r: 0 });
  for (let i = 0; i < 20; i++) root.box('matte', [0.02, 0.002, 0.03], [(sx0 + XE) / 2 - 0.28 + i * 0.0295, F2 + 0.0685, ZN + 0.12], 0x2a241c, { r: 0 });
  // Calacatta slabs: north knee wall + east wall (to the slope)
  root.box('marble', [XE - sx0, 1.11, 0.01], [(sx0 + XE) / 2, F2 + 0.065 + 0.555, ZN + 0.005], 0xffffff, { r: 0 });
  const E1 = root.sub(XE, F2, 0, -PI / 2);
  E1.plate('marble', [[ZN, 0.065], [sz1, 0.065], [sz1, ceil(sz1) - 0.02], [ZN + 0.01, ceil(ZN) - 0.02]], [], 0.01, 0.01, 0xffffff);
  // niche (marble shelf) with amber bottles
  root.box('marble', [0.3, 0.02, 0.09], [3.5, F2 + 1.0, ZN + 0.055], 0xffffff, { r: 0.003 });
  bottle(root, 'amber', 3.42, F2 + 1.01, ZN + 0.055, 0.17, 0.026, 0x7a4a1a, BRASS);
  bottle(root, 'ceramic', 3.5, F2 + 1.01, ZN + 0.055, 0.17, 0.026, 0xe9e2d6, BRASS);
  bottle(root, 'amber', 3.58, F2 + 1.01, ZN + 0.055, 0.14, 0.024, 0x5a3a1a, BRASS);
  // clear glass west panel (follows the slope) with brass channel
  const W1 = root.sub(sx0, F2, 0, -PI / 2);
  W1.plate('glassClear', [[ZN + 0.01, 0.07], [sz1 - 0.01, 0.07], [sz1 - 0.01, Math.min(1.97, ceil(sz1) - 0.06)], [ZN + 0.01, ceil(ZN) - 0.05]], [], 0.004, 0.008, 0xffffff);
  root.box('brass', [0.02, 0.02, sz1 - ZN], [sx0, F2 + 0.075, (ZN + sz1) / 2], BRASS, { r: 0.004 });
  // south: fixed panel x 3.50..3.90 + sliding door
  const gh = Math.min(1.9, ceil(sz1) - 0.1);
  root.box('glassClear', [0.39, gh, 0.008], [3.7, F2 + 0.07 + gh / 2, sz1], 0xffffff, { r: 0 });
  root.box('brass', [1.006, 0.02, 0.03], [(sx0 + XE) / 2, F2 + 0.07 + gh + 0.01, sz1 + 0.01], BRASS, { r: 0.004 });
  root.box('brass', [0.02, gh, 0.02], [XE - 0.01, F2 + 0.07 + gh / 2, sz1], BRASS, { r: 0.004 });
  const slider = new THREE.Group(); slider.position.set(sx0 + 0.3, F2 + 0.07, sz1 + 0.022); G.add(slider);
  const sb = new Batch();
  sb.root.box('glassClear', [0.58, gh, 0.008], [0, gh / 2, 0], 0xffffff, { r: 0 });
  sb.root.cyl('brass', 0.008, 0.008, 0.34, [-0.24, gh * 0.55, 0.03], BRASS, { seg: 12 });
  for (const yy of [0.15, -0.15]) sb.root.cyl('brass', 0.005, 0.005, 0.03, [-0.24, gh * 0.55 + yy, 0.015], BRASS, { rx: PI / 2, seg: 8 });
  for (const x of [-0.2, 0.2]) sb.root.cyl('brass', 0.018, 0.018, 0.012, [x, gh + 0.01, 0], BRASS, { rx: PI / 2, seg: 16 });
  sb.build(slider, E.M);
  const sd = { open: false };
  E.interact(slider, () => (sd.open ? 'סגור דלת מקלחון' : 'פתח דלת מקלחון'), () => {
    sd.open = !sd.open; E.snd.slide(slider, 0.5, 1.3);
    E.anim.to(slider.position, 'x', sx0 + 0.3 + (sd.open ? 0.42 : 0), 0.6).then(() => { if (!sd.open) E.snd.click(slider, 0.6); });
  });
  // brass rain head on an arm from the east wall, valve trim
  const hzR = 2.62, hy = Math.min(1.86, ceil(hzR - 0.12) - 0.035);
  tube(root, 'brass', [[XE - 0.005, F2 + hy + 0.03, hzR], [XE - 0.18, F2 + hy + 0.035, hzR], [XE - 0.31, F2 + hy + 0.02, hzR], [XE - 0.32, F2 + hy + 0.008, hzR]], 0.009, BRASS, { tseg: 16, rs: 10 });
  root.cyl('brass', 0.026, 0.026, 0.01, [XE - 0.005, F2 + hy + 0.03, hzR], BRASS, { rz: PI / 2, seg: 16 });
  root.cyl('brass', 0.12, 0.12, 0.01, [XE - 0.32, F2 + hy, hzR], BRASS, { seg: 44 });
  root.cyl('matte', 0.11, 0.11, 0.002, [XE - 0.32, F2 + hy - 0.006, hzR], 0x2a2a2a, { seg: 44 });
  root.cyl('brass', 0.075, 0.075, 0.01, [XE - 0.015, F2 + 1.1, 2.25], BRASS, { rz: PI / 2, seg: 30 });
  const vm = new THREE.Group(); vm.position.set(XE - 0.022, F2 + 1.1, 2.25); G.add(vm);
  const valve = new THREE.Group(); vm.add(valve);
  const vb = new Batch(); vb.root.cyl('brass', 0.02, 0.022, 0.04, [-0.02, 0, 0], BRASS, { rz: PI / 2, seg: 16 }); vb.root.box('brass', [0.018, 0.012, 0.1], [-0.04, 0, 0.04], BRASS, { r: 0.005 }); vb.build(valve, E.M);
  waterFixture(E, G, {
    target: valve, kind: 'shower', lever: { obj: valve, prop: 'x', on: 1.2, off: 0 },
    from: V3(XE - 0.32, F2 + hy - 0.01, hzR), dir: V3(0, -1, 0), streamLen: hy - 0.07, stream: false,
    labels: ['הפעל מקלחת גשם', 'סגור מקלחת'], rate: 260, spread: 0.18, sprayR: 0.17, floorY: F2 + 0.066,
  });
  // toilet on west wall facing +x, styling on the tank
  toilet(E, G, root.sub(XW, F2, 1.98, PI / 2));
  const TK = root.sub(XW, F2 + 0.81, 1.98, PI / 2);
  plant(TK, 'snake', [0.15, 0, 0.11], rng(12), 0.35);
  candle(TK, -0.12, 0, 0.11, 0.07, 0.028);
  // fluted white-oak floating vanity on west wall (z 2.40..2.90) facing +x
  const V = root.sub(XW, F2, 2.65, PI / 2), vw = 0.5, vd = 0.42, vtop = 0.86;
  flutedVanity(E, G, V, { w: vw, d: vd, top: vtop, y0: 0.42, key: 'wood', c: LX.oak,
    contents: (f, yb) => { bottle(f, 'ceramic', 0.1, yb, 0.2, 0.12, 0.025, 0xd9cdb8, BRASS); },
    drawerContents: (cf) => { cf.box('terry', [0.2, 0.04, 0.15], [-0.1, 0.02, 0], 0xffffff, { r: 0.008 }); bottle(cf, 'plastic', 0.12, 0, 0, 0.12, 0.025, 0x9b6a8f, 0xffffff); } });
  vanityTopWithBasin(V, vw + 0.01, vd + 0.01, vtop, 0, 0.25, 0.14, 0.1);
  faucetDeck(V, 0, vtop, 0.06, 0.12);
  diffuser(V, 0.19, vtop, 0.36, rng(3));
  const bc = V.pt(0, 0, 0.25), basinBot = F2 + vtop - 0.029 - 0.13;
  const bwm = ellipseWater(E, G, bc, 0.09, 0.13, basinBot);
  const fh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.06), new THREE.MeshBasicMaterial({ visible: false }));
  V.place(fh, [0, vtop + 0.11, 0.11]); G.add(fh);
  waterFixture(E, G, { target: fh, from: V.pt(0, vtop + 0.156, 0.18), basin: { mesh: bwm, bottom: basinBot, max: 0.09, rate: 0.008, drain: 0.02 }, labels: ['פתח ברז', 'סגור ברז'], rate: 60 });
  // backlit round mirror (Reflector via ctx.makeMirror when available)
  const glow = E.glow ? E.glow('bath2', 1.8) : E.M.led;
  V.torus('brass', 0.235, 0.01, [0, 1.38, 0.03], BRASS, { ts: 64, rs: 10 });
  V.cyl('duo', 0.23, 0.23, 0.02, [0, 1.38, 0.015], 0xe9e5dc, { rx: PI / 2, seg: 48 });
  V.torus(glow, 0.252, 0.007, [0, 1.38, 0.009], 0xffffff, { ts: 64, rs: 6 });
  try { mirrorDisc(E, G, V, [0, 1.38, 0.0262], 0.226); } catch (e) { }
  // heated brass towel rail (south wall, faces -z) with towels, bath mat
  const S = root.sub(3.32, F2, ZS, PI);
  heatedRail(S, 0, 0.9, 0.42, 0.78, 6);
  hangingTowel(S, -0.05, 1.5, 0.06, 0.22, 0.44, 0xf2ede4); hangingTowel(S, 0.08, 1.3, 0.06, 0.2, 0.36, 0xa7b09b);
  soft(root, 'terry', [0.7, 0.02, 0.34], [3.3, F2 + 0.01, 2.95], 0xeee8dc, { e1: 0.3, e2: 0.08, noise: 0.002, nu: 20, nv: 8 });
  E.switchAt(G, root.sub(2.92, F2, ZS, PI), 'bath2', [0, 1.2, 0]);
  B.build(G, E.M, { name: 'bath2' });
  wallFan(E, G, root.sub(3.45, F2, ZS, PI), 1.98);
  E.box(XW, XW + 0.42, 2.4, 2.9, F2 + 0.4, F2 + 0.9);
}
