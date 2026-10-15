// interior-kitchen.js — shaker L-kitchen (north + west walls), appliances, sink, salad station
import { THREE, PI, V3, Batch, Frame, shaker, pull, knob, hinged, drawer, waterFixture, basinWater, plant, roundRectPts, rng, clamp } from './interior-lib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C as LX, bpull, bknob, soft, tube, vase, branches, bookStack, candle, lemons, pendant, romanShade, rugLux } from './interior-lux.js';

const WHITE = 0xf4f3ef, INNER = 0xf0ebe1, BLACK = 0x1b1b1b, SS = 0xd4d6d8;
const GREEN = LX.green, GREEN_D = LX.greenDark, BRASS = LX.brass; // V2: deep green shaker + brushed brass
const H = 0.884, TOE = 0.10, D = 0.58, FT = 0.02, FRONT = D + FT; // base cabinet dims (local, above floor)
const UY0 = 1.372, UH = 0.914, UD = 0.31;                          // upper cabinets

// ------------------------------------------------------------------ small props
export function platesStack(f, x, y, z, n, r = 0.13, col = 0xf7f6f2) {
  for (let i = 0; i < n; i++) f.cyl('gloss', r, r * 0.72, 0.016, [x, y + 0.008 + i * 0.019, z], col, { seg: 28 });
}
export function bowlStack(f, x, y, z, n, r = 0.075, col = 0xf3f1ec) {
  for (let i = 0; i < n; i++) f.lathe('gloss', [[0, 0], [r * 0.5, 0], [r * 0.95, r * 0.55], [r, r * 0.62], [r * 0.93, r * 0.62], [r * 0.45, 0.006], [0, 0.006]], [x, y + i * 0.022, z], col, { seg: 20 });
}
export function mug(f, x, y, z, col, ry = 0) {
  f.lathe('gloss', [[0, 0], [0.038, 0], [0.04, 0.004], [0.04, 0.095], [0.036, 0.095], [0.036, 0.008], [0, 0.008]], [x, y, z], col, { seg: 18 });
  f.torus('gloss', 0.022, 0.0055, [x + Math.cos(ry) * 0.042, y + 0.05, z - Math.sin(ry) * 0.042], col, { rs: 6, ts: 12, arc: PI, rz: -PI / 2, ry });
}
export function glassCup(f, x, y, z, h = 0.12, r = 0.035) {
  f.cyl('glass', r, r * 0.88, h, [x, y + h / 2, z], 0xffffff, { open: true, seg: 16 });
  f.cyl('glass', r * 0.88, r * 0.88, 0.008, [x, y + 0.004, z], 0xffffff, { seg: 16 });
}
export function jar(f, x, y, z, h, r, fill, lid = 0x8a6a48) {
  f.cyl('glass', r, r, h, [x, y + h / 2, z], 0xffffff, { open: true, seg: 18 });
  f.cyl('matte', r * 0.92, r * 0.92, h * 0.72, [x, y + h * 0.36, z], fill, { seg: 14 });
  f.cyl('wood', r * 1.02, r * 1.02, 0.02, [x, y + h + 0.01, z], lid, { seg: 18 });
}
export function bottle(f, key, x, y, z, h, r, col, cap = 0x222222) {
  f.lathe(key, [[0, 0], [r, 0], [r, h * 0.62], [r * 0.4, h * 0.8], [r * 0.32, h * 0.93], [0, h * 0.93]], [x, y, z], col, { seg: 16 });
  f.cyl('plastic', r * 0.36, r * 0.36, h * 0.08, [x, y + h * 0.96, z], cap, { seg: 10 });
}
export function pot(f, x, y, z, r, h, col = SS) {
  f.cyl('metal', r, r, h, [x, y + h / 2, z], col, { open: true, seg: 24 });
  f.cyl('metal', r, r, 0.004, [x, y + 0.002, z], col, { seg: 24 });
  f.box('metal', [0.05, 0.012, 0.02], [x + r + 0.022, y + h * 0.8, z], 0x333333);
  f.box('metal', [0.05, 0.012, 0.02], [x - r - 0.022, y + h * 0.8, z], 0x333333);
}

// ------------------------------------------------------------------ cabinet modules
function carcass(f, x0, w, y0, h, d, col = INNER, shelves = []) {
  f.box('duo', [0.018, h, d], [x0 + 0.009, y0 + h / 2, d / 2], col, { r: 0.002 });
  f.box('duo', [0.018, h, d], [x0 + w - 0.009, y0 + h / 2, d / 2], col, { r: 0.002 });
  f.box('duo', [w - 0.036, 0.018, d], [x0 + w / 2, y0 + 0.009, d / 2], col, { r: 0.002 });
  f.box('duo', [w - 0.036, 0.018, d], [x0 + w / 2, y0 + h - 0.009, d / 2], col, { r: 0.002 });
  f.box('duo', [w - 0.036, h - 0.036, 0.01], [x0 + w / 2, y0 + h / 2, 0.005], col, { r: 0 });
  for (const sy of shelves) f.box('duo', [w - 0.04, 0.018, d - 0.03], [x0 + w / 2, sy, d / 2 - 0.01], col, { r: 0.002 });
}
const drawerStyle = { key: 'duo', color: GREEN, boxKey: 'duo', boxColor: 0xdcc6a4, hkey: 'duo', hcol: BRASS, hopt: { slot: 1 } };

function doorSet(E, G, f, x0, w, y0, h, n, o = {}) {
  const gap = 0.003, dw = (w - gap * (n + 1)) / n, dh = h - gap * 2, out = [];
  const upper = !!o.upper;
  for (let i = 0; i < n; i++) {
    const left = n === 1 ? !o.right : i === 0;
    const hx = left ? x0 + gap + i * (dw + gap) : x0 + gap + i * (dw + gap) + dw;
    const st = hinged(E, G, f, {
      pos: [hx, y0 + gap, o.z || FRONT], hinge: left ? 'L' : 'R', angle: o.angle || 1.9,
      labels: o.labels,
      draw: (p) => {
        const px = left ? 0 : -dw;
        shaker(p, 'duo', px, 0, dw, dh, FT, GREEN, { glass: o.glass });
        const hxp = left ? dw - 0.04 : -dw + 0.04;
        if (upper) bknob(p, hxp, 0.07, 0); else bpull(p, hxp, dh - 0.11, 0, 0.14, true);
      },
    });
    out.push(st);
  }
  return out;
}

function baseCab(E, G, f, x0, w, kind, o = {}) {
  const shelves = (kind === 'doors' || kind === 'drawerDoor') ? [TOE + 0.40] : [];
  carcass(f, x0, w, TOE, H - TOE, D, INNER, shelves);
  f.box('duo', [w, TOE, 0.018], [x0 + w / 2, TOE / 2, D - 0.075], GREEN_D, { r: 0, slot: 3 }); // toe kick
  const gap = 0.003, fw = w - 0.006, avail = H - TOE - 2 * gap;
  const res = { drawers: [], doors: [] };
  if (kind === 'drawers3') {
    const hs = [0.18, 0.27, avail - 0.18 - 0.27 - 2 * gap];
    let top = H - gap;
    hs.forEach((hh, i) => {
      const yc = top - hh / 2;
      res.drawers.push(drawer(E, G, f, { ...drawerStyle,
        pos: [x0 + w / 2, TOE + 0 + (yc - TOE), FRONT], w: fw, h: hh, depth: 0.5, boxH: Math.min(hh - 0.04, 0.22),
        contents: o.drawerContents ? (cf, bw, bd, bh) => o.drawerContents(i, cf, bw, bd, bh) : null,
      }));
      top -= hh + gap;
    });
  } else if (kind === 'drawerDoor' || kind === 'sink') {
    const dh = 0.17;
    const yc = H - gap - dh / 2;
    if (kind === 'sink') {
      shaker(f, 'duo', x0 + gap, yc - dh / 2, fw, dh, FT, GREEN, { z0: FRONT }); // false front (static)
    } else {
      res.drawers.push(drawer(E, G, f, { ...drawerStyle, pos: [x0 + w / 2, yc, FRONT], w: fw, h: dh, depth: 0.5, boxH: 0.12,
        contents: o.drawerContents ? (cf, bw, bd, bh) => o.drawerContents(0, cf, bw, bd, bh) : null }));
    }
    const doorTop = yc - dh / 2 - gap;
    res.doors = doorSet(E, G, f, x0, w, TOE, doorTop - TOE, w > 0.56 ? 2 : 1, {});
  } else if (kind === 'doors') {
    res.doors = doorSet(E, G, f, x0, w, TOE, H - TOE, w > 0.56 ? 2 : 1, {});
  }
  if (o.inside) { try { o.inside(f, x0, w); } catch (e) { console.warn('[interior] cab inside', e); } }
  return res;
}

function upperCab(E, G, f, x0, w, o = {}) {
  const y0 = o.y0 || UY0, h = o.h || UH, d = o.d || UD;
  const shelves = o.shelves || [y0 + h * 0.34, y0 + h * 0.67];
  carcass(f, x0, w, y0, h, d, INNER, shelves);
  const n = o.n || (w > 0.5 ? 2 : 1);
  const doors = doorSet(E, G, f, x0, w, y0, h, n, { upper: true, glass: o.glass, z: d + FT, right: o.right });
  if (o.inside) { try { o.inside(f, x0, w, [y0 + 0.018, ...shelves.map((s) => s + 0.009)], d); } catch (e) { console.warn('[interior] upper inside', e); } }
  return doors;
}

// ------------------------------------------------------------------ appliances
function buildRange(E, G, K, F, R) {
  // V2 pro range: brushed stainless, cast-iron grates, brass burners + brass knobs. F: back-centre at floor, facing +z. width 0.762
  const W = 0.762, DP = 0.64, f = F;
  f.box('steel', [0.02, 0.89, DP], [-W / 2 + 0.01, 0.445, DP / 2], SS, { r: 0.003 });
  f.box('steel', [0.02, 0.89, DP], [W / 2 - 0.01, 0.445, DP / 2], SS, { r: 0.003 });
  f.box('matte', [W - 0.04, 0.89, 0.02], [0, 0.445, 0.01], 0x2a2a2a);
  f.box('steel', [W, 0.1, 0.06], [0, 0.85, DP - 0.025], SS, { r: 0.006 });            // control rail
  f.box('steel', [W, 0.012, DP - 0.02], [0, 0.908, DP / 2 - 0.01], 0xc9ccce, { r: 0.003 }); // spill tray top
  f.box('steel', [W, 0.06, 0.05], [0, 0.94, 0.025], SS, { r: 0.006 });                // backguard
  f.box('matte', [W - 0.04, 0.012, 0.03], [0, 0.97, 0.025], 0x1e1e1e, { r: 0.004 });
  f.box('matte', [W - 0.03, 0.08, 0.02], [0, 0.04, DP - 0.05], 0x1c1c1c, { r: 0.003 }); // kick
  // cast-iron grates (two)
  for (const gx of [-0.19, 0.19]) {
    const gw = 0.36, gd = DP - 0.1, gy = 0.93, gz = DP / 2 - 0.005;
    f.box('matte', [gw, 0.014, 0.016], [gx, gy, gz - gd / 2 + 0.008], 0x151515, { r: 0.004 });
    f.box('matte', [gw, 0.014, 0.016], [gx, gy, gz + gd / 2 - 0.008], 0x151515, { r: 0.004 });
    f.box('matte', [0.016, 0.014, gd], [gx - gw / 2 + 0.008, gy, gz], 0x151515, { r: 0.004 });
    f.box('matte', [0.016, 0.014, gd], [gx + gw / 2 - 0.008, gy, gz], 0x151515, { r: 0.004 });
    f.box('matte', [0.012, 0.014, gd], [gx, gy, gz], 0x151515, { r: 0.004 });
    for (const zz of [-0.15, 0.15]) f.box('matte', [gw, 0.014, 0.012], [gx, gy, gz + zz], 0x151515, { r: 0.004 });
  }
  // oven cavity (dark enamel)
  const cy0 = 0.2, cy1 = 0.76, cw = W - 0.09;
  f.box('matte', [cw, 0.01, DP - 0.08], [0, cy0, DP / 2 - 0.02], 0x1f2228);
  f.box('matte', [cw, 0.01, DP - 0.08], [0, cy1, DP / 2 - 0.02], 0x1f2228);
  f.box('matte', [0.01, cy1 - cy0, DP - 0.08], [-cw / 2, (cy0 + cy1) / 2, DP / 2 - 0.02], 0x1f2228);
  f.box('matte', [0.01, cy1 - cy0, DP - 0.08], [cw / 2, (cy0 + cy1) / 2, DP / 2 - 0.02], 0x1f2228);
  f.box('matte', [cw, cy1 - cy0, 0.01], [0, (cy0 + cy1) / 2, 0.06], 0x1f2228);
  f.box('steel', [W, 0.03, 0.02], [0, cy0 - 0.015, DP - 0.03], SS);
  f.box('steel', [0.045, cy1 - cy0, 0.02], [-W / 2 + 0.0225, (cy0 + cy1) / 2, DP - 0.03], SS);
  f.box('steel', [0.045, cy1 - cy0, 0.02], [W / 2 - 0.0225, (cy0 + cy1) / 2, DP - 0.03], SS);
  for (const ry of [cy0 + 0.17, cy0 + 0.34]) {
    for (let i = 0; i <= 12; i++) f.cyl('metal', 0.0025, 0.0025, DP - 0.12, [-cw / 2 + 0.02 + i * (cw - 0.04) / 12, ry, DP / 2 - 0.02], 0xbfc2c5, { seg: 5, rx: PI / 2 });
    f.cyl('metal', 0.003, 0.003, cw - 0.02, [0, ry, DP - 0.09], 0xbfc2c5, { seg: 5, rz: PI / 2 });
    f.cyl('metal', 0.003, 0.003, cw - 0.02, [0, ry, 0.08], 0xbfc2c5, { seg: 5, rz: PI / 2 });
  }
  const ovenLight = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
  const lightMesh = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), ovenLight);
  F.place(lightMesh, [cw / 2 - 0.06, cy1 - 0.08, 0.066]); G.add(lightMesh);
  const door = hinged(E, G, f, {
    pos: [0, cy0 - 0.02, DP], hinge: 'B', angle: 1.5, snd: 'heavy', labels: ['פתח תנור', 'סגור תנור'],
    draw: (p) => {
      const dw = W - 0.01, dh = cy1 - cy0 + 0.04;
      p.box('steel', [dw, 0.1, 0.04], [0, dh - 0.05, -0.02], SS, { r: 0.004 });
      p.box('steel', [dw, 0.07, 0.04], [0, 0.035, -0.02], SS, { r: 0.004 });
      p.box('steel', [0.08, dh - 0.17, 0.04], [-dw / 2 + 0.04, dh / 2, -0.02], SS, { r: 0.004 });
      p.box('steel', [0.08, dh - 0.17, 0.04], [dw / 2 - 0.04, dh / 2, -0.02], SS, { r: 0.004 });
      p.box('gloss', [dw - 0.16, dh - 0.17, 0.012], [0, dh / 2 - 0.005, -0.012], 0x15171a, { r: 0.002 });
      p.box('steel', [dw - 0.02, dh - 0.02, 0.01], [0, dh / 2, -0.042], 0x3a3d42, { r: 0 });
      p.cyl('brass', 0.012, 0.012, dw - 0.08, [0, dh - 0.05, 0.05], BRASS, { seg: 16, rz: PI / 2 });
      for (const sx of [-1, 1]) { p.cyl('brass', 0.008, 0.009, 0.05, [sx * (dw / 2 - 0.07), dh - 0.05, 0.025], BRASS, { seg: 10, rx: PI / 2 }); p.sph('brass', 0.012, [sx * (dw / 2 - 0.04), dh - 0.05, 0.05], BRASS, { ws: 10, hs: 8 }); }
    },
    onBefore: (open) => { if (open) ovenLight.emissiveIntensity = 1.6; },
    onChange: (open) => { if (!open) ovenLight.emissiveIntensity = 0; },
  });
  drawer(E, G, f, {
    pos: [0, 0.115, DP], w: W - 0.01, h: 0.13, depth: 0.5, key: 'steel', color: SS, boxKey: 'steel', boxColor: 0x3a3d42,
    draw: (p) => { p.box('steel', [W - 0.01, 0.13, 0.025], [0, 0, -0.0125], SS, { r: 0.004 }); p.cyl('steel', 0.009, 0.009, 0.4, [0, 0.03, 0.03], 0xe8e1cf, { rz: PI / 2, seg: 12 }); },
    contents: (cf) => { for (let i = 0; i < 3; i++) cf.box('steel', [0.42, 0.02, 0.3], [0, 0.012 + i * 0.022, 0], 0x55585c, { r: 0.004 }); },
  });
  // brass burners + gas flame rings (blue emissive), brass knobs on the rail
  const burners = [[-0.19, 0.17, 0.05], [0.19, 0.17, 0.045], [-0.19, 0.45, 0.045], [0.19, 0.45, 0.055]];
  const knobXs = [-0.3, -0.18, 0.18, 0.3];
  for (const kx of [-0.06, 0.06]) { // static oven/broil knobs
    f.cyl('brass', 0.024, 0.026, 0.028, [kx, 0.85, DP + 0.02], BRASS, { rx: PI / 2, seg: 24 });
    f.cyl('brass', 0.017, 0.017, 0.012, [kx, 0.85, DP + 0.04], BRASS, { rx: PI / 2, seg: 20 });
  }
  burners.forEach(([bx, bz, br], i) => {
    const cz = DP - bz;
    f.cyl('brass', br, br * 1.05, 0.016, [bx, 0.92, cz], BRASS, { seg: 28 });
    f.cyl('matte', br * 0.62, br * 0.62, 0.008, [bx, 0.931, cz], 0x1a1a1a, { seg: 24 });
    const m = new THREE.MeshStandardMaterial({ color: 0x0b1a40, emissive: 0x3d6dff, emissiveIntensity: 0, roughness: 0.4, transparent: true, opacity: 0.85, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(br * 0.98, 0.006, 6, 36), m);
    F.place(ring, [bx, 0.93, cz], { rx: -PI / 2 }); ring.visible = false; ring.renderOrder = 1; G.add(ring);
    const kg = new THREE.Group(); F.place(kg, [knobXs[i], 0.85, DP + 0.006]); G.add(kg);
    const kb = new Batch();
    kb.root.lathe('brass', [[0, 0], [0.026, 0], [0.027, 0.006], [0.024, 0.024], [0.018, 0.03], [0, 0.03]], [0, 0, 0], BRASS, { rx: PI / 2, seg: 24 });
    kb.root.box('brass', [0.006, 0.026, 0.008], [0, 0.0, 0.032], 0x7a5d2a, { r: 0.002 }); kb.build(kg, E.M);
    const st = { on: false, glow: 0 };
    E.interact(kg, () => (st.on ? `כבה להבה ${i + 1}` : `הדלק להבה ${i + 1}`), () => {
      st.on = !st.on; E.snd.click(kg, 0.7);
      if (st.on) { for (let k = 0; k < 3; k++) E.snd.click(kg, 0.3); E.snd.burst(kg, { dur: 0.35, type: 'lowpass', freq: 900, vol: 0.12, attack: 0.05, delay: 0.12 }); }
      E.anim.to(kg.rotation, 'z', st.on ? -PI * 0.75 : 0, 0.25);
    });
    E.anim.tick((dt, t) => {
      const target = st.on ? 1 : 0;
      st.glow += (target - st.glow) * Math.min(1, dt * (st.on ? 6 : 4));
      ring.visible = st.glow > 0.02;
      m.emissiveIntensity = st.glow * (2.6 + Math.sin(t * 23 + i) * 0.25);
      ring.scale.setScalar(1 + Math.sin(t * 31 + i * 2) * 0.015);
    });
  });
  F.solid(E, [W, 0.92, DP], [0, 0.46, DP / 2]);
  return { door };
}

function coilTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff'; g.lineWidth = 3.2; g.beginPath();
  for (let t = 0; t < 1; t += 0.003) { const a = t * PI * 2 * 6, r = 10 + t * 50; const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r; if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(64, 64, 62, 0, PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildHood(E, G, f, F0) {
  // V2: limewash plaster canopy with a brushed-brass band. f: west-run frame at range centre (back-centre at floor, facing +x world)
  const W = 0.762, y0 = 1.65, ceil = 2.44;
  f.box('brass', [W - 0.004, 0.07, 0.53], [0, y0 + 0.035, 0.265], BRASS, { r: 0.008 });
  const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.5, 0.02), new THREE.Vector2(0.27, 0.3), new THREE.Vector2(0, 0.3)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: W - 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3 });
  g.rotateY(-PI / 2);
  f.add('plaster', g, [W / 2 - 0.015, y0 + 0.08, 0.008], LX.ivory);
  f.box('plaster', [0.42, ceil - (y0 + 0.39) - 0.002, 0.28], [0, (ceil + y0 + 0.39) / 2 - 0.001, 0.14], LX.ivory, { r: 0.008 });
  f.box('steel', [W - 0.06, 0.004, 0.44], [0, y0 + 0.002, 0.25], 0x8e9296, { r: 0 });
  const lm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d0, emissiveIntensity: 0, roughness: 0.3 });
  const lights = new THREE.Group(); G.add(lights);
  for (const x of [-0.2, 0.2]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), lm); f.place(d, [x, y0 - 0.001, 0.36], { rx: PI / 2 }); lights.add(d); }
  const hit = new THREE.Mesh(new THREE.BoxGeometry(W, 0.38, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  f.place(hit, [0, y0 + 0.19, 0.25]); G.add(hit);
  const st = { on: false };
  E.interact(hit, () => (st.on ? 'כבה אור בקולט' : 'הדלק אור בקולט'), () => { st.on = !st.on; lm.emissiveIntensity = st.on ? 2.2 : 0; E.snd.switchClick(hit); });
}

function buildFridge(E, G, f) {
  // f: frame at fridge back-center floor, facing +z. 0.90 w, 1.78 h, body depth 0.70, doors 0.05
  const W = 0.9, Hh = 1.78, DP = 0.70, split = 0.80;
  const liner = new THREE.MeshStandardMaterial({ color: 0xf6f7f8, emissive: 0xeef5ff, emissiveIntensity: 0, roughness: 0.35, vertexColors: true });
  const b = new Batch(), L = f.withBatch(b);
  // shell
  f.box('duo', [0.03, Hh, DP], [-W / 2 + 0.015, Hh / 2, DP / 2], GREEN, { r: 0.004 });
  f.box('duo', [0.03, Hh, DP], [W / 2 - 0.015, Hh / 2, DP / 2], GREEN, { r: 0.004 });
  f.box('duo', [W, 0.03, DP], [0, Hh - 0.015, DP / 2], GREEN, { r: 0.004 });
  f.box('duo', [W - 0.06, 0.08, 0.02], [0, 0.04, DP - 0.03], GREEN_D, { slot: 3 });
  // liner (fresh food compartment)
  const lw = W - 0.06, ly0 = split + 0.02, ly1 = Hh - 0.03;
  L.box(liner, [lw, ly1 - ly0, 0.02], [0, (ly0 + ly1) / 2, 0.04], 0xffffff, { r: 0 });
  L.box(liner, [0.02, ly1 - ly0, DP - 0.05], [-lw / 2 + 0.01, (ly0 + ly1) / 2, DP / 2], 0xffffff, { r: 0 });
  L.box(liner, [0.02, ly1 - ly0, DP - 0.05], [lw / 2 - 0.01, (ly0 + ly1) / 2, DP / 2], 0xffffff, { r: 0 });
  L.box(liner, [lw, 0.02, DP - 0.05], [0, ly1 - 0.01, DP / 2], 0xffffff, { r: 0 });
  L.box(liner, [lw, 0.05, DP - 0.03], [0, ly0, DP / 2], 0xffffff, { r: 0 });
  L.box(liner, [lw - 0.04, 0.012, 0.012], [0, ly1 - 0.03, DP - 0.04], 0xffffff, { r: 0 }); // LED bar
  b.build(G, E.M);
  // glass shelves
  const shelfY = [ly0 + 0.26, ly0 + 0.5, ly0 + 0.72];
  for (const sy of shelfY) { f.box('glass', [lw - 0.04, 0.006, DP - 0.1], [0, sy, DP / 2 - 0.01], 0xffffff, { r: 0 }); f.box('plastic', [lw - 0.04, 0.012, 0.012], [0, sy, DP - 0.06], 0xe6e8ea, { r: 0 }); }
  // crisper drawers
  for (const x of [-0.2, 0.2]) {
    f.box('glassC', [0.4, 0.2, DP - 0.12], [x, ly0 + 0.13, DP / 2 - 0.02], 0xdfe9ee, { r: 0.01 });
    for (let i = 0; i < 4; i++) f.sph('food', 0.04, [x - 0.1 + i * 0.06, ly0 + 0.08, DP / 2 - 0.05 + (i % 2) * 0.08], x < 0 ? [0xd62d20, 0xe8a317, 0x3b8f2e, 0xc81e1e][i] : [0x7ab648, 0xe36b1c, 0x9fc95a, 0x5a8f2c][i], { ws: 10, hs: 8 });
  }
  // contents: milk, juice, eggs, jars, cheese, leftovers
  const s0 = shelfY[0] + 0.004, s1 = shelfY[1] + 0.004, s2 = shelfY[2] + 0.004;
  f.box('plastic', [0.1, 0.24, 0.1], [-0.28, s0 + 0.12, 0.35], 0xffffff, { r: 0.01 });
  f.cyl('plastic', 0.015, 0.015, 0.03, [-0.28, s0 + 0.255, 0.33], 0x2a62c9, { seg: 10 });
  f.box('plastic', [0.09, 0.22, 0.09], [-0.15, s0 + 0.11, 0.42], 0xf2a33a, { r: 0.008 });
  f.box('plastic', [0.3, 0.07, 0.11], [0.15, s0 + 0.035, 0.45], 0xcdb79e, { r: 0.006 });
  f.box('glassC', [0.18, 0.08, 0.14], [0.18, s0 + 0.04, 0.22], 0xdcdcdc, { r: 0.01 });
  f.cyl('food', 0.06, 0.06, 0.05, [0.18, s0 + 0.03, 0.22], 0xd98c3a, { seg: 16 });
  jar(f, -0.3, s1, 0.25, 0.12, 0.035, 0xb5452c, 0xd8d8d8);
  jar(f, -0.2, s1, 0.27, 0.1, 0.03, 0xe0c341, 0xd8d8d8);
  f.box('food', [0.14, 0.05, 0.1], [0.05, s1 + 0.025, 0.4], 0xf1c955, { r: 0.008 });
  bottle(f, 'glassC', 0.25, s1, 0.3, 0.28, 0.035, 0x6c1f2b, 0x222222);
  bottle(f, 'glassC', 0.33, s1, 0.24, 0.28, 0.035, 0xc9d38a, 0xb08a3c);
  f.cyl('plastic', 0.07, 0.07, 0.09, [-0.12, s2 + 0.045, 0.35], 0xffffff, { seg: 18 });
  f.cyl('plastic', 0.072, 0.072, 0.012, [-0.12, s2 + 0.095, 0.35], 0x3c7d4a, { seg: 18 });
  f.box('plastic', [0.18, 0.06, 0.12], [0.2, s2 + 0.03, 0.3], 0x77b5d9, { r: 0.008 });
  // doors (french) with bins
  const dW = W / 2 - 0.003, dH = Hh - split - 0.01, dT = 0.05;
  const mkDoor = (left) => hinged(E, G, f, {
    pos: [left ? -W / 2 : W / 2, split + 0.005, DP + dT], hinge: left ? 'L' : 'R', angle: 1.95, snd: 'heavy',
    labels: ['פתח מקרר', 'סגור מקרר'],
    draw: (p) => {
      const x0 = left ? 0 : -dW, cx = x0 + dW / 2;
      shaker(p, 'duo', x0, 0, dW, dH, dT, GREEN, { frame: 0.085 });
      p.box('plastic', [dW - 0.04, dH - 0.04, 0.012], [cx, dH / 2, -dT - 0.006], 0xf1f2f3, { r: 0.004 });
      const hx = left ? dW - 0.05 : -dW + 0.05;
      bpull(p, hx, dH / 2, 0, 0.62, true);
      for (let k = 0; k < 3; k++) {
        const by = 0.12 + k * 0.28;
        p.box('plastic', [dW - 0.07, 0.07, 0.1], [cx, by, -dT - 0.06], 0xdde6ea, { r: 0.006 });
        for (let j = 0; j < 3; j++) {
          const bx = x0 + 0.08 + j * (dW - 0.16) / 2, cols = [0x2b5e2b, 0xc93a2a, 0xe8c34a, 0x6d3f1f, 0xffffff];
          bottle(p, 'plastic', bx, by - 0.03, -dT - 0.06, k === 0 ? 0.22 : 0.15, 0.028, cols[(k * 3 + j + (left ? 0 : 2)) % 5]);
        }
      }
    },
  });
  const dl = mkDoor(true), dr = mkDoor(false);
  // freezer drawer
  const fz = drawer(E, G, f, {
    pos: [0, (split + 0.08) / 2 + 0.005, DP + dT], w: W - 0.006, h: split - 0.09, t: dT, depth: 0.55, slide: 0.45,
    labels: ['פתח מקפיא', 'סגור מקפיא'], boxKey: 'plastic', boxColor: 0xe9ecef, boxH: 0.4,
    draw: (p) => {
      shaker(p, 'duo', -(W - 0.006) / 2, -(split - 0.09) / 2, W - 0.006, split - 0.09, dT, GREEN, { frame: 0.085 });
      bpull(p, 0, (split - 0.09) / 2 - 0.08, 0, 0.5, false);
    },
    contents: (cf, bw, bd) => {
      for (let i = 0; i < 6; i++) cf.box('plastic', [0.16, 0.06 + (i % 3) * 0.03, 0.2], [-0.28 + (i % 3) * 0.24, 0.05 + Math.floor(i / 3) * 0.1, -0.12 + Math.floor(i / 3) * 0.2], [0x3d7cc9, 0xd9443a, 0xf2f2f2, 0x5aa65a, 0xf0b84c, 0x9a6bc4][i], { r: 0.008 });
      cf.box('plastic', [0.25, 0.04, 0.18], [0.1, 0.24, 0.12], 0xbfe3f5, { r: 0.006 });
    },
  });
  let glow = 0;
  E.anim.tick((dt) => {
    const target = (dl.open || dr.open) ? 0.65 : 0;
    glow += (target - glow) * Math.min(1, dt * 6);
    liner.emissiveIntensity = glow;
  });
  f.solid(E, [W, Hh, DP + dT], [0, Hh / 2, (DP + dT) / 2]);
}

function buildDishwasher(E, G, f) {
  // f: frame at module center x, back at wall, floor; width 0.61; front face at FRONT
  const W = 0.6, Hd = 0.78, y0 = 0.1;
  // hollow stainless tub (sides, top, back, floor)
  const tc = 0xb5b9bd, td = D - 0.03;
  f.box('steel', [0.012, Hd - 0.02, td], [-W / 2 + 0.016, y0 + Hd / 2, td / 2], tc, { r: 0 });
  f.box('steel', [0.012, Hd - 0.02, td], [W / 2 - 0.016, y0 + Hd / 2, td / 2], tc, { r: 0 });
  f.box('steel', [W - 0.03, 0.012, td], [0, y0 + Hd - 0.016, td / 2], tc, { r: 0 });
  f.box('steel', [W - 0.03, Hd - 0.02, 0.012], [0, y0 + Hd / 2, 0.02], tc, { r: 0 });
  f.box('steel', [W - 0.03, 0.012, td], [0, y0 + 0.02, td / 2], 0x9ea3a8, { r: 0 });
  f.cyl('plastic', 0.012, 0.012, 0.46, [0, y0 + 0.06, td / 2], 0x8f959b, { rz: PI / 2, seg: 10 }); // spray arm
  f.box('duo', [W, TOE, 0.018], [0, TOE / 2, D - 0.075], GREEN_D, { r: 0, slot: 3 });
  const racks = [];
  const mkRack = (ry, upper) => {
    const g = new THREE.Group(); f.place(g, [0, ry, D / 2 + 0.02]); G.add(g);
    const b = new Batch(), r = b.root, rw = W - 0.08, rd = D - 0.1, rh = upper ? 0.1 : 0.13;
    for (const yy of [0, rh]) {
      r.cyl('metal', 0.003, 0.003, rw, [0, yy, -rd / 2], 0x9aa0a6, { rz: PI / 2, seg: 5 });
      r.cyl('metal', 0.003, 0.003, rw, [0, yy, rd / 2], 0x9aa0a6, { rz: PI / 2, seg: 5 });
      r.cyl('metal', 0.003, 0.003, rd, [-rw / 2, yy, 0], 0x9aa0a6, { rx: PI / 2, seg: 5 });
      r.cyl('metal', 0.003, 0.003, rd, [rw / 2, yy, 0], 0x9aa0a6, { rx: PI / 2, seg: 5 });
    }
    for (let i = 0; i <= 10; i++) r.cyl('metal', 0.0025, 0.0025, rd, [-rw / 2 + i * rw / 10, 0, 0], 0x9aa0a6, { rx: PI / 2, seg: 4 });
    for (let i = 0; i <= 8; i++) {
      r.cyl('metal', 0.0025, 0.0025, rh, [-rw / 2, rh / 2, -rd / 2 + i * rd / 8], 0x9aa0a6, { seg: 4 });
      r.cyl('metal', 0.0025, 0.0025, rh, [rw / 2, rh / 2, -rd / 2 + i * rd / 8], 0x9aa0a6, { seg: 4 });
    }
    if (!upper) {
      for (let i = 0; i < 7; i++) r.cyl('gloss', 0.12, 0.12, 0.012, [-0.15 + (i % 2) * 0.01, 0.12, -0.2 + i * 0.055], 0xf6f5f1, { rx: PI / 2 - 0.15, seg: 26 });
      for (let i = 0; i < 4; i++) r.lathe('gloss', [[0, 0], [0.04, 0], [0.075, 0.05], [0.07, 0.05], [0.035, 0.006], [0, 0.006]], [0.13, 0.08, -0.17 + i * 0.1], 0xf1eee8, { rx: 1.2, seg: 16 });
    } else {
      for (let i = 0; i < 8; i++) { const x = -0.2 + (i % 4) * 0.13, z = -0.12 + Math.floor(i / 4) * 0.2; r.cyl('glass', 0.034, 0.03, 0.12, [x, 0.07, z], 0xffffff, { rx: PI, seg: 14, open: true }); }
    }
    b.build(g, E.M); g.visible = false; // only drawn while the door is open
    racks.push({ g, z0: g.position.clone(), dir: f.dir(0, 0, 1) });
    return g;
  };
  mkRack(y0 + 0.07, false); mkRack(y0 + 0.43, true);
  const st = { open: false, busy: false };
  const mount = new THREE.Group(); f.place(mount, [0, y0, FRONT]); G.add(mount);
  const pivot = new THREE.Group(); mount.add(pivot);
  const b = new Batch(), p = b.root, dh = Hd - 0.004;
  shaker(p, 'duo', -(W - 0.006) / 2, 0, W - 0.006, dh, 0.03, GREEN);
  p.box('steel', [W - 0.05, dh - 0.06, 0.01], [0, dh / 2, -0.035], 0x9ea3a8, { r: 0.004 });
  bpull(p, 0, dh - 0.09, 0, 0.3, false);
  b.build(pivot, E.M);
  const slideRacks = (out) => Promise.all(racks.map((rk, i) => {
    const dist = out ? (i === 0 ? 0.38 : 0.3) : 0;
    const target = rk.z0.clone().addScaledVector(rk.dir, dist);
    return Promise.all([E.anim.to(rk.g.position, 'x', target.x, 0.5), E.anim.to(rk.g.position, 'z', target.z, 0.5)]);
  }));
  E.interact(pivot, () => (st.open ? 'סגור מדיח' : 'פתח מדיח'), async () => {
    if (st.busy) return; st.busy = true;
    if (!st.open) {
      st.open = true; for (const rk of racks) rk.g.visible = true;
      E.snd.click(pivot); await E.anim.to(pivot.rotation, 'x', PI / 2 - 0.02, 0.6, 'out');
      E.snd.slide(pivot, 0.45); await slideRacks(true);
    } else {
      st.open = false; E.snd.slide(pivot, 0.45); await slideRacks(false);
      await E.anim.to(pivot.rotation, 'x', 0, 0.5); E.snd.thud(pivot, 0.6);
      for (const rk of racks) rk.g.visible = false;
    }
    st.busy = false;
  });
}

function buildMicrowave(E, G, f) {
  // frame: back-center at counter top, facing +z. 0.52 w x 0.30 h x 0.40 d
  const W = 0.52, Hm = 0.3, DP = 0.4, cw = 0.36;
  const inner = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, emissive: 0xfff0c8, emissiveIntensity: 0, roughness: 0.5, vertexColors: true });
  f.box('steel', [W, 0.02, DP], [0, Hm - 0.01, DP / 2], 0x2b2c2e, { r: 0.006 });
  f.box('steel', [0.02, Hm, DP], [-W / 2 + 0.01, Hm / 2, DP / 2], 0x2b2c2e, { r: 0.006 });
  f.box('steel', [0.02, Hm, DP], [W / 2 - 0.01, Hm / 2, DP / 2], 0x2b2c2e, { r: 0.006 });
  f.box('steel', [W, 0.02, DP], [0, 0.01, DP / 2], 0x2b2c2e, { r: 0.006 });
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) f.cyl('rubber', 0.012, 0.012, 0.01, [x, -0.004, 0.06], 0x111111, { seg: 8 });
  // control panel
  f.box('steel', [W - cw - 0.03, Hm - 0.02, 0.02], [W / 2 - (W - cw - 0.03) / 2 - 0.01, Hm / 2, DP - 0.01], 0x1f2022, { r: 0.002 });
  f.box('led', [0.09, 0.03, 0.004], [W / 2 - 0.085, Hm - 0.06, DP + 0.001], 0x55ffb0, { r: 0 });
  for (let i = 0; i < 9; i++) f.box('plastic', [0.025, 0.016, 0.004], [W / 2 - 0.115 + (i % 3) * 0.032, Hm - 0.11 - Math.floor(i / 3) * 0.026, DP + 0.002], 0x3a3b3e, { r: 0.002 });
  // cavity
  const b = new Batch(), L = f.withBatch(b), cx = -W / 2 + 0.02 + cw / 2;
  L.box(inner, [cw, 0.01, DP - 0.04], [cx, 0.025, DP / 2], 0xffffff, { r: 0 });
  L.box(inner, [cw, 0.01, DP - 0.04], [cx, Hm - 0.03, DP / 2], 0xffffff, { r: 0 });
  L.box(inner, [cw, Hm - 0.05, 0.01], [cx, Hm / 2, 0.03], 0xffffff, { r: 0 });
  L.box(inner, [0.01, Hm - 0.05, DP - 0.04], [cx + cw / 2, Hm / 2, DP / 2], 0xffffff, { r: 0 });
  b.build(G, E.M);
  // turntable + mug
  const tt = new THREE.Group(); f.place(tt, [cx, 0.035, DP / 2 + 0.01]); G.add(tt);
  const tb = new Batch(); tb.root.cyl('glass', 0.14, 0.14, 0.006, [0, 0.003, 0], 0xffffff, { seg: 32 }); mug(tb.root, 0.05, 0.006, 0.02, 0xc9573e, 0.3); tb.build(tt, E.M);
  // door
  const door = hinged(E, G, f, {
    pos: [-W / 2 + 0.005, 0.012, DP + 0.025], hinge: 'L', angle: 1.7, labels: ['פתח מיקרוגל', 'סגור מיקרוגל'],
    draw: (p) => {
      const dw = cw + 0.03, dh = Hm - 0.024;
      p.box('steel', [dw, dh, 0.025], [dw / 2, dh / 2, -0.0125], 0x2b2c2e, { r: 0.004 });
      p.box('gloss', [dw - 0.08, dh - 0.07, 0.006], [dw / 2 - 0.01, dh / 2, 0.001], 0x0d0f10, { r: 0.002 });
      p.box('steel', [0.018, dh - 0.06, 0.03], [dw - 0.02, dh / 2, 0.015], 0xd0d3d6, { r: 0.004 });
    },
    onBefore: (open) => { if (open) inner.emissiveIntensity = 0.8; },
    onChange: (open) => { if (!open && !run.on) inner.emissiveIntensity = 0; },
  });
  const run = { on: false, t: 0 };
  const hum = E.snd.hum(tt, { freq: 120, noiseF: 300, vol: 0.12 });
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.03), new THREE.MeshBasicMaterial({ visible: false }));
  f.place(btn, [W / 2 - 0.085, Hm / 2, DP + 0.01]); G.add(btn);
  const stop = (done) => { run.on = false; hum.stop(0.2); if (!door.open) inner.emissiveIntensity = 0; if (done) E.snd.beep(btn, 3); };
  E.interact(btn, () => (door.open ? 'סגור את דלת המיקרוגל' : run.on ? 'עצור מיקרוגל' : 'הפעל מיקרוגל (30 שנ׳)'), () => {
    E.snd.beep(btn, 1);
    if (door.open) return;
    if (run.on) { stop(false); return; }
    run.on = true; run.t = 30; inner.emissiveIntensity = 0.9; hum.start();
  });
  door.locked = () => false;
  E.anim.tick((dt) => { if (run.on) { tt.rotation.y += dt * 0.9; run.t -= dt; if (run.t <= 0 || door.open) stop(run.t <= 0); } });
}

// ------------------------------------------------------------------ salad station
const VEG = [
  { he: 'מלפפון', L: 0.22, R: 0.021, n: 8, skin: 0x2e5b25, flesh: 0xd3e6a8, shape: 'cyl', wait: [6.33, 0.215] },
  { he: 'גזר', L: 0.17, R: 0.017, n: 7, skin: 0xe8761f, flesh: 0xf59b3b, shape: 'cone', wait: [6.56, 0.215] },
  { he: 'עגבנייה', L: 0.07, R: 0.035, n: 5, skin: 0xc8261c, flesh: 0xe4553d, shape: 'sphere', wait: [6.71, 0.215] },
  { he: 'בצל סגול', L: 0.068, R: 0.034, n: 4, skin: 0x6a2147, flesh: 0xdcc0d6, shape: 'sphere', wait: [6.81, 0.215] },
  { he: 'חסה', L: 0.13, R: 0.062, n: 5, skin: 0x86b84d, flesh: 0xbfe08a, shape: 'lettuce', wait: [5.72, 0.215] },
];

function geoFrom(fn) {
  const b = new Batch(); fn(b.root);
  const list = []; for (const [, l] of b.parts) list.push(...l);
  return list.length === 1 ? list[0] : mergeGeometries(list, false);
}

function buildSalad(E, G, CT) {
  const r = rng(77);
  const boardC = [6.48, 0.47], boardTop = CT + 0.022, xc = 6.4;
  const bowlC = new THREE.Vector3(5.86, CT, 0.44), bowlBottom = CT + 0.012;
  const sb = new Batch(), f = sb.root;
  // board
  f.box('wood', [0.42, 0.022, 0.28], [boardC[0], CT + 0.011, boardC[1]], 0xc08a55, { r: 0.006, grain: 'h' });
  f.box('wood', [0.42, 0.004, 0.005], [boardC[0], CT + 0.012, boardC[1] + 0.12], 0x9a6a3a, { r: 0 });
  // bowl
  f.lathe('gloss', [[0, 0], [0.06, 0], [0.07, 0.006], [0.12, 0.065], [0.132, 0.105], [0.127, 0.107], [0.115, 0.066], [0.062, 0.013], [0, 0.013]], [bowlC.x, CT, bowlC.z], 0xf5f3ee, { seg: 40 });
  // olive oil + salt + pepper
  bottle(f, 'glassC', 6.12, CT, 0.2, 0.26, 0.03, 0x8a8d1e, 0x1b1b1b);
  f.cyl('wood', 0.022, 0.026, 0.12, [6.04, CT + 0.06, 0.19], 0x6b4a2f, { seg: 14 });
  f.cyl('gloss', 0.022, 0.024, 0.1, [5.98, CT + 0.05, 0.22], 0xf2f2f2, { seg: 14 });
  sb.build(G, E.M);
  const hitBoard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.32), new THREE.MeshBasicMaterial({ visible: false }));
  hitBoard.position.set(boardC[0], CT + 0.06, boardC[1]); G.add(hitBoard);
  const hitBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.12, 16), new THREE.MeshBasicMaterial({ visible: false }));
  hitBowl.position.set(bowlC.x, CT + 0.06, bowlC.z); G.add(hitBowl);

  // knife: pivot at tip (back of board), blade toward -z from handle; blade vertical (y-z plane)
  const KR = -0.42; // idle (raised) pose
  const knife = new THREE.Group(); knife.position.set(xc, boardTop + 0.001, boardC[1] - 0.115); knife.rotation.x = KR; G.add(knife);
  const kb = new Batch(), k = kb.root;
  const blade = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0), new THREE.Vector2(0.205, 0.048), new THREE.Vector2(0.03, 0.03)]);
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.0022, bevelEnabled: false });
  bg.rotateY(-PI / 2); // shape x → z
  k.add('metal', bg, [0.0011, 0, 0], 0xe4e7ea, { uv: 'keep' });
  k.box('plastic', [0.02, 0.026, 0.12], [0, 0.03, 0.27], 0x161616, { r: 0.008 });
  for (const zz of [0.24, 0.27, 0.3]) k.cyl('plastic', 0.004, 0.004, 0.022, [0, 0.03, zz], 0xd8d8d8, { rz: PI / 2, seg: 8 });
  kb.build(knife, E.M);

  // vegetables
  const vegs = VEG.map((v) => {
    const g = new THREE.Group(); G.add(g);
    const geo = geoFrom((q) => {
      if (v.shape === 'cyl') {
        q.cyl('food', v.R, v.R, v.L - 0.02, [-v.L / 2, 0, 0], v.skin, { rz: PI / 2, seg: 16 });
        q.sph('food', v.R, [-0.01, 0, 0], v.skin, { sx: 0.5, ws: 12, hs: 8 });
        q.sph('food', v.R, [-v.L + 0.01, 0, 0], v.skin, { sx: 0.5, ws: 12, hs: 8 });
      } else if (v.shape === 'cone') {
        q.cyl('food', v.R * 0.2, v.R, v.L, [-v.L / 2, 0, 0], v.skin, { rz: PI / 2, seg: 14 });
        for (let i = 0; i < 4; i++) q.cyl('leaf', 0.001, 0.003, 0.06, [-0.03 + i * 0.002, 0.012 + i * 0.004, 0], 0x4c8c3f, { rz: 1.2 - i * 0.2, seg: 4 });
      } else if (v.shape === 'sphere') {
        q.sph('food', v.R, [-v.L / 2, 0, 0], v.skin, { sx: v.L / (2 * v.R), ws: 18, hs: 12 });
      } else {
        for (let i = 0; i < 14; i++) { const a = i * 2.4, rr = (i % 3) * 0.012; q.sph('food', v.R * (0.75 + (i % 4) * 0.08), [-v.L / 2 + Math.cos(a) * rr, Math.sin(a) * rr * 0.6, Math.sin(a * 1.3) * rr], i % 2 ? v.skin : 0x9fcd62, { ws: 10, hs: 8, sx: 1.0, sy: 0.85 }); }
      }
    });
    const mesh = new THREE.Mesh(geo, E.M.food); mesh.castShadow = true; g.add(mesh);
    const sliceGeo = geoFrom((q) => {
      const th = v.L / v.n;
      if (v.shape === 'lettuce') q.sph('food', 1, [0, 0, 0], v.flesh, { sx: 0.03, sy: 0.006, sz: 0.024, ws: 8, hs: 6 });
      else if (v.he === 'בצל סגול') { q.torus('food', v.R * 0.7, 0.006, [0, 0, 0], v.skin, { rs: 6, ts: 18, rx: PI / 2 }); q.torus('food', v.R * 0.45, 0.005, [0, 0, 0], v.flesh, { rs: 6, ts: 14, rx: PI / 2 }); }
      else {
        const rad = v.shape === 'cone' ? v.R * 0.7 : v.shape === 'sphere' ? v.R * 0.85 : v.R;
        q.cyl('food', rad, rad, Math.max(0.004, th * 0.7), [0, 0, 0], v.skin, { seg: 16, open: true });
        q.cyl('food', rad * 0.97, rad * 0.97, Math.max(0.004, th * 0.7) - 0.001, [0, 0, 0], v.flesh, { seg: 16 });
      }
    });
    const inst = new THREE.InstancedMesh(sliceGeo, E.M.food, v.n);
    inst.count = 0; inst.frustumCulled = false; inst.castShadow = true; G.add(inst);
    return { v, g, mesh, inst, rem: v.L, th: v.L / v.n, slices: [] };
  });
  const placeWaiting = (s) => {
    s.rem = s.v.L; s.g.scale.set(1, 1, 1); s.g.visible = true; s.g.rotation.set(0, 0, 0);
    s.g.position.set(s.v.wait[0] + s.v.L / 2, CT + s.v.R * (s.v.shape === 'lettuce' ? 0.85 : 1), s.v.wait[1]);
    s.inst.count = 0; s.slices.length = 0;
  };
  vegs.forEach(placeWaiting);
  const st = { idx: 0, busy: false, mixed: false, mixing: false, active: -1 };
  const gravity = 9.8;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
  const pileCount = () => vegs.reduce((a, s) => a + s.slices.length, 0);
  const spawn = (s) => {
    const p = new THREE.Vector3(xc - s.th / 2, boardTop + s.v.R * 0.7, boardC[1]);
    const a = r() * PI * 2, rr = Math.sqrt(r()) * 0.075;
    const target = new THREE.Vector3(bowlC.x + Math.cos(a) * rr, bowlBottom + 0.008 + pileCount() * 0.0016 + (0.075 - rr) * 0.25, bowlC.z + Math.sin(a) * rr);
    const T = 0.55;
    const vel = target.clone().sub(p).divideScalar(T); vel.y += 0.5 * gravity * T;
    const sl = { p, vel, t: 0, T, target, rot: new THREE.Euler(r() * 3, r() * 3, r() * 3), spin: new THREE.Vector3((r() - 0.5) * 14, (r() - 0.5) * 14, (r() - 0.5) * 14), fly: true };
    s.slices.push(sl); s.inst.count = s.slices.length;
  };
  E.anim.tick((dt, t) => {
    for (const s of vegs) {
      if (!s.slices.length) continue;
      s.slices.forEach((sl, i) => {
        if (sl.fly) {
          sl.t += dt; sl.vel.y -= gravity * dt; sl.p.addScaledVector(sl.vel, dt);
          sl.rot.x += sl.spin.x * dt; sl.rot.y += sl.spin.y * dt; sl.rot.z += sl.spin.z * dt;
          if (sl.t >= sl.T) { sl.fly = false; sl.p.copy(sl.target); sl.rot.x = (r() - 0.5) * 0.6 + (s.v.shape === 'lettuce' || s.v.he === 'בצל סגול' ? 0 : PI / 2 * (r() < 0.6 ? 1 : 0)); }
        }
        _q.setFromEuler(sl.rot); _m.compose(sl.p, _q, _s); s.inst.setMatrixAt(i, _m);
      });
      s.inst.instanceMatrix.needsUpdate = true;
    }
  });
  const bring = async (s) => {
    const tx = xc - s.th + s.v.L, ty = boardTop + s.v.R * (s.v.shape === 'lettuce' ? 0.85 : 1), tz = boardC[1];
    await Promise.all([E.anim.to(s.g.position, 'y', ty + 0.06, 0.2, 'out')]);
    await Promise.all([E.anim.to(s.g.position, 'x', tx, 0.35), E.anim.to(s.g.position, 'z', tz, 0.35)]);
    await E.anim.to(s.g.position, 'y', ty, 0.15, 'in');
  };
  const chop = async () => {
    if (st.busy || st.mixing) return;
    if (st.idx >= vegs.length) { E.snd.click(hitBoard, 0.3); return; }
    st.busy = true;
    const s = vegs[st.idx];
    if (st.active !== st.idx) { await bring(s); st.active = st.idx; }
    await E.anim.to(knife.rotation, 'x', -0.62, 0.12, 'out');
    await E.anim.to(knife.rotation, 'x', 0, 0.08, 'in');
    E.snd.chop(knife);
    E.anim.to(knife.rotation, 'x', KR, 0.18, 'out');
    s.rem -= s.th; spawn(s); st.mixed = false;
    if (s.rem <= s.th * 0.5) { s.g.visible = false; st.idx++; }
    else {
      s.g.scale.x = s.rem / s.v.L;
      if (s.v.shape === 'sphere' || s.v.shape === 'lettuce') { const k2 = Math.max(0.55, Math.sqrt(s.rem / s.v.L)); s.g.scale.y = s.g.scale.z = 0.6 + 0.4 * k2; }
      await E.anim.to(s.g.position, 'x', xc - s.th + s.rem, 0.12);
    }
    st.busy = false;
  };
  const mix = async () => {
    if (st.mixing || st.busy) return;
    const all = []; vegs.forEach((s) => s.slices.forEach((sl) => { if (!sl.fly) all.push(sl); }));
    if (!all.length) return;
    st.mixing = true;
    const data = all.map((sl) => ({ sl, r: Math.hypot(sl.p.x - bowlC.x, sl.p.z - bowlC.z), a: Math.atan2(sl.p.z - bowlC.z, sl.p.x - bowlC.x), y: sl.p.y, w: 5 + r() * 4, ph: r() * 6 }));
    let e = 0; const dur = 1.8;
    E.snd.burst(hitBowl, { dur: 1.6, type: 'bandpass', freq: 1400, q: 0.6, vol: 0.12, attack: 0.2 });
    await new Promise((res) => E.anim.tick((dt) => {
      e += dt; const k = Math.min(1, e / dur), amp = Math.sin(k * PI);
      for (const d of data) {
        d.a += d.w * dt * amp;
        const rr = clamp(d.r + Math.sin(e * 7 + d.ph) * 0.02 * amp, 0.005, 0.09);
        d.sl.p.set(bowlC.x + Math.cos(d.a) * rr, d.y + Math.abs(Math.sin(e * 9 + d.ph)) * 0.05 * amp, bowlC.z + Math.sin(d.a) * rr);
        d.sl.rot.x += dt * 6 * amp; d.sl.rot.z += dt * 4 * amp;
      }
      if (k >= 1) { res(); return false; }
    }));
    st.mixing = false; st.mixed = true;
  };
  const reset = async () => {
    E.snd.slide(hitBowl, 0.3);
    vegs.forEach(placeWaiting); st.idx = 0; st.active = -1; st.mixed = false; knife.rotation.x = KR;
  };
  E.interact(hitBoard, () => {
    if (st.idx >= vegs.length) return 'הירקות חתוכים — ערבב בקערה';
    return 'חתוך ' + vegs[st.idx].v.he;
  }, chop);
  E.interact(hitBowl, () => {
    const n = pileCount();
    if (st.mixing) return 'מערבב…';
    if (st.mixed && st.idx >= vegs.length) return 'סלט חדש';
    if (!n) return 'קערת סלט (חתוך ירקות על הקרש)';
    return 'ערבב סלט';
  }, () => {
    if (st.mixed && st.idx >= vegs.length) return reset();
    if (st.mixed && st.idx < vegs.length) return mix();
    return mix();
  });
}

// ------------------------------------------------------------------ main
export function buildKitchen(E, G) {
  const F0 = E.plan.mainFloor, CT = F0 + 0.914;
  const WN = 0.125, WW = 5.546, WE = 9.019, WS = 2.988;
  const K = new Batch(); const root = K.root;
  const FN = root.sub(0, F0, WN, 0);          // north run: local x = world x, local z = from wall
  const FW = root.sub(WW, F0, 0, PI / 2);     // west run: local x = -world z, local z = world x - WW
  const zx = (z) => -z;

  // ---- north base run
  // blind corner (hidden) 5.546..6.156
  carcass(FN, WW, 0.61, TOE, H - TOE, D, INNER, []);
  baseCab(E, G, FN, 6.156, 0.687, 'drawers3', {
    drawerContents: (i, cf, bw, bd) => {
      if (i === 0) { // cutlery tray
        cf.box('wood', [bw, 0.04, bd], [0, 0.02, 0], 0xd8bf98, { r: 0.002 });
        for (let k = 0; k < 4; k++) for (let j = 0; j < 5; j++) cf.box('metal', [0.018, 0.006, 0.18], [-bw / 2 + 0.07 + k * 0.1 + j * 0.006, 0.043 + j * 0.002, 0], 0xd9dcde, { r: 0.002 });
      } else if (i === 1) { // utensils, towels
        for (let k = 0; k < 4; k++) cf.box('fabric', [0.18, 0.03, 0.28], [-bw / 2 + 0.12 + k * 0.01, 0.016 + k * 0.03, 0.05], [0xd9d3c7, 0x9fb3c8, 0xf2efe9, 0xc77b5a][k], { r: 0.006 });
        cf.cyl('wood', 0.012, 0.03, 0.3, [0.12, 0.03, 0], 0xb08458, { rx: PI / 2, seg: 10 });
        cf.box('plastic', [0.08, 0.01, 0.3], [0.2, 0.01, 0], 0x1b1b1b, { r: 0.003 });
      } else { // pots
        pot(cf, -0.14, 0, 0, 0.11, 0.12); pot(cf, 0.14, 0, 0, 0.1, 0.1, 0xb8bcc0);
      }
    },
  });
  baseCab(E, G, FN, 6.843, 0.914, 'sink', {
    inside: (f) => {
      f.cyl('plastic', 0.02, 0.02, 0.25, [7.3, TOE + 0.6, 0.25], 0xeeeeee, { seg: 10 });
      f.torus('plastic', 0.05, 0.02, [7.3, TOE + 0.42, 0.25], 0xeeeeee, { arc: PI, rz: PI, rs: 8, ts: 12 });
      f.cyl('plastic', 0.02, 0.02, 0.2, [7.35, TOE + 0.45, 0.12], 0xeeeeee, { seg: 10, rx: PI / 2 });
      bottle(f, 'plastic', 7.05, TOE + 0.018, 0.4, 0.3, 0.04, 0x2a8fd6, 0xffffff);
      bottle(f, 'plastic', 7.13, TOE + 0.018, 0.45, 0.24, 0.035, 0xf2c94c, 0x2a2a2a);
      f.box('plastic', [0.2, 0.15, 0.15], [7.55, TOE + 0.093, 0.4], 0x6fbf73, { r: 0.01 });
    },
  });
  buildDishwasher(E, G, root.sub(7.757 + 0.305, F0, WN, 0));
  baseCab(E, G, FN, 8.367, 0.652, 'drawerDoor', {
    inside: (f) => { pot(f, 8.55, TOE + 0.018, 0.3, 0.12, 0.14); pot(f, 8.82, TOE + 0.018, 0.32, 0.1, 0.1, 0x3a3a3a); bowlStack(f, 8.7, TOE + 0.418, 0.3, 4, 0.1, 0xe8e2d8); },
    drawerContents: (i, cf) => { for (let k = 0; k < 6; k++) cf.box('plastic', [0.12, 0.05, 0.12], [-0.2 + (k % 3) * 0.15, 0.03, -0.1 + Math.floor(k / 3) * 0.16], 0xf0f0ee, { r: 0.008 }); },
  });
  // ---- west base run (local x = -z)
  FW.box('paint', [0.065, H - TOE, 0.02], [zx(0.7675), TOE + (H - TOE) / 2, FRONT - 0.01], WHITE, { r: 0.002 }); // filler at corner
  buildRange(E, G, K, root.sub(WW, F0, (0.8 + 1.562) / 2, PI / 2));
  baseCab(E, G, FW, zx(2.072), 0.502, 'drawerDoor', {
    inside: (f, x0, w) => { platesStack(f, x0 + w / 2, TOE + 0.018, 0.3, 5, 0.15, 0xe9e6df); bowlStack(f, x0 + w / 2, TOE + 0.418, 0.3, 3, 0.11, 0xd6dee6); },
    drawerContents: (i, cf) => { for (let k = 0; k < 3; k++) cf.box('fabric', [0.3, 0.03, 0.18], [0, 0.016 + k * 0.032, 0], [0xe8e2d4, 0x7a96b0, 0xd29a6b][k], { r: 0.006 }); },
  });
  // ---- countertops: Calacatta marble (eased edge)
  const hole = roundRectPts(6.92, 0.24, 7.68, 0.685, 0.02).map(([x, z]) => [x, z]);
  root.slab('marble', [[WW, WN], [WE, WN], [WE, 0.76], [6.181, 0.76], [6.181, 0.8], [WW, 0.8]], [hole], CT, 0.03, 0xffffff, { bevel: 0.004 });
  root.slab('marble', [[WW, 1.565], [6.181, 1.565], [6.181, 2.075], [WW, 2.075]], [], CT, 0.03, 0xffffff, { bevel: 0.004 });
  // ---- sink basin (undermount stainless)
  const sb = { x0: 6.935, x1: 7.665, z0: 0.255, z1: 0.67, top: CT - 0.03, bot: CT - 0.25 };
  const bw = sb.x1 - sb.x0, bd = sb.z1 - sb.z0, bh = sb.top - sb.bot;
  root.box('steel', [bw, 0.008, bd], [(sb.x0 + sb.x1) / 2, sb.bot, (sb.z0 + sb.z1) / 2], SS, { r: 0 });
  root.box('steel', [0.008, bh, bd], [sb.x0, sb.bot + bh / 2, (sb.z0 + sb.z1) / 2], SS, { r: 0 });
  root.box('steel', [0.008, bh, bd], [sb.x1, sb.bot + bh / 2, (sb.z0 + sb.z1) / 2], SS, { r: 0 });
  root.box('steel', [bw, bh, 0.008], [(sb.x0 + sb.x1) / 2, sb.bot + bh / 2, sb.z0], SS, { r: 0 });
  root.box('steel', [bw, bh, 0.008], [(sb.x0 + sb.x1) / 2, sb.bot + bh / 2, sb.z1], SS, { r: 0 });
  root.cyl('brass', 0.045, 0.045, 0.004, [7.3, sb.bot + 0.006, 0.49], BRASS, { seg: 24 });
  root.cyl('matte', 0.02, 0.02, 0.005, [7.3, sb.bot + 0.008, 0.49], 0x111111, { seg: 16 });
  // faucet: brushed-brass gooseneck (tube) + side lever
  const fz = 0.2, fx = 7.3;
  root.cyl('brass', 0.03, 0.033, 0.014, [fx, CT + 0.007, fz], BRASS, { seg: 24 });
  root.cyl('brass', 0.017, 0.018, 0.2, [fx, CT + 0.11, fz], BRASS, { seg: 18 });
  tube(root, 'brass', [[fx, CT + 0.2, fz], [fx, CT + 0.27, fz + 0.01], [fx, CT + 0.3, fz + 0.08], [fx, CT + 0.28, fz + 0.16], [fx, CT + 0.25, fz + 0.18]], 0.0125, BRASS, { tseg: 32, rs: 14 });
  root.cyl('brass', 0.0145, 0.0125, 0.03, [fx, CT + 0.245, fz + 0.18], BRASS, { seg: 16 });
  root.cyl('metal', 0.01, 0.01, 0.003, [fx, CT + 0.229, fz + 0.18], 0x444444, { seg: 12 });
  // soap pump (ceramic + brass) + brass dish
  root.cyl('ceramic', 0.032, 0.03, 0.13, [7.62, CT + 0.065, 0.205], 0xefe9dd, { seg: 20 });
  root.cyl('brass', 0.01, 0.012, 0.04, [7.62, CT + 0.15, 0.205], BRASS, { seg: 12 });
  root.box('brass', [0.05, 0.008, 0.01], [7.6, CT + 0.172, 0.205], BRASS, { r: 0.003 });
  const lever = new THREE.Group(); lever.position.set(fx + 0.02, CT + 0.17, fz); G.add(lever);
  const lb = new Batch(); lb.root.cyl('brass', 0.011, 0.011, 0.024, [0.012, 0, 0], BRASS, { rz: PI / 2, seg: 14 });
  lb.root.cyl('brass', 0.0045, 0.006, 0.1, [0.024, 0.05, 0], BRASS, { seg: 10 }); lb.root.sph('brass', 0.007, [0.024, 0.1, 0], BRASS, { ws: 10, hs: 8 }); lb.build(lever, E.M);
  const water = basinWater(E, G, 7.3, 0.4625, bw - 0.012, bd - 0.012, sb.bot + 0.004);
  const faucetHit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.26), new THREE.MeshBasicMaterial({ visible: false }));
  faucetHit.position.set(fx, CT + 0.18, fz + 0.09); G.add(faucetHit);
  waterFixture(E, G, {
    target: faucetHit, lever: { obj: lever, prop: 'x', on: 0.65, off: 0 },
    from: V3(fx, CT + 0.226, fz + 0.18), dir: V3(0, -1, 0), basin: { mesh: water, bottom: sb.bot + 0.004, max: 0.12, rate: 0.01, drain: 0.025 },
    labels: ['פתח ברז', 'סגור ברז'], rate: 90, spread: 0.02,
  });
  // ---- full-height Calacatta backsplash
  const tt = 0.01, y0 = CT, y1 = F0 + UY0, yFull = F0 + 2.3, yCeil = E.plan.mainCeil - 0.004;
  const slabN = (x0, x1, ya, yb) => root.box('marble', [x1 - x0, yb - ya, tt], [(x0 + x1) / 2, (ya + yb) / 2, WN + tt / 2], 0xffffff, { r: 0 });
  slabN(WW, 6.58, y0, y1); slabN(6.58, 8.02, y0, F0 + 1.03); slabN(8.02, WE, y0, yFull);
  const slabW = (z0, z1, ya, yb) => root.box('marble', [tt, yb - ya, z1 - z0], [WW + tt / 2, (ya + yb) / 2, (z0 + z1) / 2], 0xffffff, { r: 0 });
  slabW(WN + tt, 0.8, y0, y1); slabW(0.8, 1.562, y0, yCeil); slabW(1.562, 2.075, y0, y1);
  root.box('marble', [1.44, 0.02, 0.06], [7.3, F0 + 1.04, WN + 0.03], 0xffffff, { r: 0.004 }); // window stool
  // ---- upper cabinets (green shaker, brass knobs)
  const shelfDishes = (f, x0, w, ys, d) => {
    const n = Math.max(1, Math.floor(w / 0.3));
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * w / n;
      platesStack(f, cx, ys[0], d / 2, 6, Math.min(0.13, w / n / 2 - 0.02));
      const cw = w / n, nm = Math.max(1, Math.floor((cw - 0.04) / 0.1)), ng = Math.max(1, Math.floor((cw - 0.03) / 0.085));
      for (let k = 0; k < nm; k++) mug(f, x0 + i * cw + 0.065 + k * 0.1, ys[1], d / 2 + (k % 2) * 0.04, [0xf2efe9, 0x5e7f99, 0xd9c3a3][k % 3], 0.5);
      for (let k = 0; k < ng; k++) glassCup(f, x0 + i * cw + 0.05 + k * 0.085, ys[2], d / 2 - 0.03, 0.12, 0.032);
    }
  };
  const pantry = (f, x0, w, ys, d) => {
    const fills = [0xf3efe6, 0xc89a5a, 0x7a4a2a, 0xe8d58a, 0x9c3a2a, 0x3f2a1f];
    let i = 0; for (let x = x0 + 0.06; x < x0 + w - 0.05; x += 0.09) { jar(f, x, ys[0], d / 2, 0.18, 0.04, fills[i % 6]); jar(f, x, ys[1], d / 2, 0.13, 0.035, fills[(i + 3) % 6]); i++; }
    bowlStack(f, x0 + w / 2, ys[2], d / 2, 3, 0.09);
  };
  carcass(FN, WW, 0.33, UY0, UH, UD, INNER, []);
  FN.box('duo', [0.33, UH, FT], [WW + 0.165, UY0 + UH / 2, UD + FT / 2], GREEN, { r: 0.002 });
  upperCab(E, G, FN, 5.876, 0.624, { inside: pantry });
  upperCab(E, G, FW, zx(0.78), 0.325, { inside: (f, x0, w, ys, d) => { bottle(f, 'glassC', x0 + w / 2, ys[0], d / 2, 0.3, 0.035, 0x4b2a1a); jar(f, x0 + w / 2, ys[1], d / 2, 0.14, 0.04, 0xd9b26a); } });
  upperCab(E, G, FW, zx(2.07), 0.49, { right: true, inside: shelfDishes });
  upperCab(E, G, FW, zx(2.98), 0.9, { y0: 1.86, h: 0.426, d: 0.6, shelves: [], n: 2, inside: (f, x0, w, ys) => { f.box('plastic', [0.4, 0.06, 0.45], [x0 + 0.25, ys[0] + 0.03, 0.3], 0x777777, { r: 0.01 }); f.box('plastic', [0.36, 0.08, 0.3], [x0 + 0.66, ys[0] + 0.04, 0.3], 0xc9b28a, { r: 0.01 }); } });
  // ---- open floating walnut shelves (north wall, east end) with styled ceramics
  const ledMat = E.glow ? E.glow('kitchen', 1.1, { emissive: 0xfff0d8 }) : E.M.led;
  const SX0 = 8.11, SX1 = WE - 0.005, sd = 0.27, st = 0.05;
  for (const sy of [F0 + 1.56, F0 + 1.96]) {
    root.box('walnut', [SX1 - SX0, st, sd], [(SX0 + SX1) / 2, sy + st / 2, WN + tt + sd / 2], 0xffffff, { r: 0.006, grain: 'h' });
    root.box(ledMat, [SX1 - SX0 - 0.06, 0.006, 0.012], [(SX0 + SX1) / 2, sy - 0.002, WN + tt + sd - 0.04], 0xffffff, { r: 0 });
  }
  { const r = rng(91), y = F0 + 1.61, z = WN + tt + sd / 2 + 0.01, y2 = F0 + 2.01;
    platesStack(root, 8.3, y, z, 5, 0.12, 0xf3eee6); bowlStack(root, 8.3, y + 0.1, z, 3, 0.085, 0xd8cfc1);
    vase(root, 8.62, y, z, 'amphora', 0xe9e3d8, 0.8); vase(root, 8.76, y, z + 0.02, 'bottle', 0x2f3a33, 0.75);
    for (let i = 0; i < 3; i++) mug(root, 8.88 + (i % 2) * 0.02, y + i * 0.0, z - 0.06 + i * 0.06, [0xefe9dd, 0xd9cdb8, 0x8a6a48][i], 0.4);
    bookStack(root, 8.36, y2, z, 3, r, { w: 0.24, d: 0.18, colors: [0xe7e0d2, 0x34483c, 0xb9a88f] });
    vase(root, 8.6, y2, z, 'globe', 0xb48a5a, 0.9, 'clay'); branches(root, 8.6, y2 + 0.18, z, 0.17, r, 4);
    candle(root, 8.82, y2, z - 0.04, 0.12, 0.03); candle(root, 8.9, y2, z + 0.05, 0.08, 0.03);
  }
  // crown molding (green) + light rail + LED strips under uppers
  const crownN = (x0, x1) => { const c0 = Math.max(WW, x0 - 0.02), c1 = Math.min(WE, x1 + 0.02), c2 = Math.max(WW, x0 - 0.03), c3 = Math.min(WE, x1 + 0.03); FN.box('duo', [c1 - c0, 0.05, 0.05], [(c0 + c1) / 2, UY0 + UH + 0.025, UD + FT - 0.005], GREEN, { r: 0.008 }); FN.box('duo', [c3 - c2, 0.02, 0.07], [(c2 + c3) / 2, UY0 + UH + 0.06, UD + FT + 0.005], GREEN, { r: 0.006 }); FN.box('duo', [x1 - x0, 0.02, 0.015], [(x0 + x1) / 2, UY0 - 0.01, UD + FT - 0.008], GREEN, { r: 0.002 }); FN.box(ledMat, [x1 - x0 - 0.04, 0.006, 0.012], [(x0 + x1) / 2, UY0 - 0.004, 0.08], 0xffffff, { r: 0 }); };
  crownN(WW, 6.5);
  const crownW = (z0, z1, yb = UY0, yt = UY0 + UH, d = UD) => { const a0 = z0 - 0.02, a1 = Math.min(WS, z1 + 0.02), b0 = z0 - 0.03, b1 = Math.min(WS, z1 + 0.03); FW.box('duo', [a1 - a0, 0.05, 0.05], [-(a0 + a1) / 2, yt + 0.025, d + FT - 0.005], GREEN, { r: 0.008 }); FW.box('duo', [b1 - b0, 0.02, 0.07], [-(b0 + b1) / 2, yt + 0.06, d + FT + 0.005], GREEN, { r: 0.006 }); };
  crownW(0.455, 0.78); crownW(1.58, 2.07); crownW(2.08, 2.98, 1.86, 2.286, 0.6);
  FW.box(ledMat, [0.44, 0.006, 0.012], [zx(1.825), UY0 - 0.004, 0.08], 0xffffff, { r: 0 });
  // range hood
  buildHood(E, G, root.sub(WW, F0, (0.8 + 1.562) / 2, PI / 2), F0);
  // fridge (panel-ready)
  buildFridge(E, G, root.sub(WW, F0, 2.53, PI / 2));
  // microwave on counter (north run, east end, under the open shelves)
  buildMicrowave(E, G, root.sub(8.67, CT, WN + 0.04, 0));
  // counter styling: walnut knife block, ceramic crock + wooden spoons, lemons, leaning boards
  root.box('walnut', [0.11, 0.2, 0.16], [8.2, CT + 0.1, 0.22], 0xffffff, { r: 0.01, rx: -0.2 });
  for (let i = 0; i < 5; i++) root.box('brass', [0.016, 0.06, 0.03], [8.17 + (i % 3) * 0.03, CT + 0.22 + (i % 2) * 0.01, 0.2 + Math.floor(i / 3) * 0.03], 0x2a241c, { r: 0.004, rx: -0.2 });
  vase(root, 5.7, CT, 1.98, 'cylinder', 0xe9e3d6, 0.85);
  for (let i = 0; i < 5; i++) root.cyl('wood', 0.006, 0.006, 0.3, [5.7 + Math.cos(i * 1.3) * 0.025, CT + 0.2, 1.98 + Math.sin(i * 1.3) * 0.025], [0xd8b88c, 0x8a6a48, 0xc9a274][i % 3], { seg: 6, rx: Math.cos(i) * 0.15, rz: Math.sin(i) * 0.15 });
  lemons(root, 5.92, CT, 1.78, rng(12));
  // leaning walnut + oak boards in the corner
  root.box('walnut', [0.36, 0.5, 0.02], [5.86, CT + 0.255, WN + tt + 0.06], 0xffffff, { r: 0.008, rx: -0.12 });
  root.cyl('walnut', 0.018, 0.018, 0.02, [5.86, CT + 0.46, WN + tt + 0.035], 0xffffff, { rx: PI / 2 - 0.12, seg: 16 });
  root.box('wood', [0.3, 0.38, 0.018], [5.9, CT + 0.195, WN + tt + 0.1], LX.oak, { r: 0.008, rx: -0.14 });
  // wool runner
  rugLux(root, 1.6, 0.72, [7.35, F0, 1.22], 0x9a9384);
  // plant on counter
  plant(root, 'bushy', [7.88, CT, 0.3], rng(4), 0.45);
  // Roman shade on the sink window (stops above the faucet when lowered)
  try { romanShade(E, G, root.sub(7.3, F0, WN, 0), root.sub(7.3, F0, WN, 0), { w: 1.3, top: 2.18, bottom: 1.27, z: 0.085, color: LX.linen }); } catch (e) { console.warn('[interior] roman shade', e); }
  // sculptural globe pendants over the sink counter (one real light)
  if (E.top) {
    try {
      pendant(E, E.top, { x: 6.95, z: 0.5, floor: 'main', room: 'kitchen', ceilY: E.plan.mainCeil, y: F0 + 1.64, style: 'globe', r: 0.14, point: true, intensity: 16, labels: ['הדלק מנורה מעל הכיור', 'כבה מנורה מעל הכיור'] });
      pendant(E, E.top, { x: 7.65, z: 0.5, floor: 'main', room: 'kitchen', ceilY: E.plan.mainCeil, y: F0 + 1.64, style: 'globe', r: 0.14, point: false, labels: ['הדלק מנורה מעל הכיור', 'כבה מנורה מעל הכיור'] });
    } catch (e) { console.warn('[interior] kitchen pendants', e); }
  }

  E.switchAt(G, root.sub(8.05, F0, WS, PI), 'kitchen', [0, 1.2, 0]);
  K.build(G, E.M, { name: 'kitchen' });
  // colliders
  E.box(WW, WE, WN, 0.76, F0, CT);
  E.box(WW, 6.21, 0.76, 2.075, F0, CT);
  // salad
  try { buildSalad(E, G, CT); } catch (e) { console.warn('[interior] salad failed', e); }
}
