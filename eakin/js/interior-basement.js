// interior-basement.js — pool table with 2D ball physics, laundry pair, utility sink, furnace, water heater, panel, storage
import { THREE, PI, V3, Batch, hinged, drawer, waterFixture, basinWater, books, rng, clamp } from './interior-lib.js';
import { bottle, glassCup } from './interior-kitchen.js';
import { C as LX, soft, tube, bknob, rugLux, vase, bookStack, candle, artLux, sconce, tableLampLux } from './interior-lux.js';
import { shaker } from './interior-lib.js';

const BALL_COLS = [0xffffff, 0xf2c40f, 0x1f4fbf, 0xd0201b, 0x4b2a8a, 0xf07a10, 0x137a3a, 0x7a1a1a, 0x111111];

function ballTexture(n) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const stripe = n >= 9, col = '#' + new THREE.Color(BALL_COLS[stripe ? n - 8 : n]).getHexString();
  g.fillStyle = stripe || n === 0 ? '#f7f5ee' : col; g.fillRect(0, 0, 128, 64);
  if (stripe) { g.fillStyle = col; g.fillRect(0, 19, 128, 26); }
  if (n > 0) for (const u of [32, 96]) {
    g.fillStyle = '#f7f5ee'; g.beginPath(); g.ellipse(u, 32, 10, 9, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#111'; g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), u, 33);
  } else { g.fillStyle = '#c62828'; g.beginPath(); g.arc(32, 32, 2, 0, PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildPool(E, G, top, root, B0) {
  const CX = 7.3, CZ = 4.55, PX = 0.559, PZ = 1.1175, R = 0.028575, SY = B0 + 0.79;
  const T = root.sub(CX, B0, CZ, 0);
  const MAH = 0x4a2416, FELT = 0x1d5a3c; // V2: deep green tournament cloth, dark walnut, brass
  const OX = PX + 0.16, OZ = PZ + 0.16;
  // legs + apron + bed
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0]]) {
    T.box('woodGloss', [0.14, 0.52, 0.14], [x * (OX - 0.14), 0.26, z * (OZ - 0.16)], MAH, { r: 0.02 });
    T.box('brass', [0.18, 0.05, 0.18], [x * (OX - 0.14), 0.025, z * (OZ - 0.16)], LX.brass, { r: 0.015 });
  }
  T.box('woodGloss', [2 * OX - 0.06, 0.22, 2 * OZ - 0.06], [0, 0.63, 0], MAH, { r: 0.02, grain: 'h' });
  T.box('felt', [2 * PX + 0.1, 0.03, 2 * PZ + 0.1], [0, 0.775, 0], FELT, { r: 0 });
  // cushions (with pocket gaps)
  const ch = 0.04, cw = 0.05;
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[-PZ + 0.085, -0.065], [0.065, PZ - 0.085]]) T.box('felt', [cw, ch, z1 - z0], [s * (PX + cw / 2), 0.79 + ch / 2, (z0 + z1) / 2], FELT, { r: 0.01 });
    T.box('felt', [2 * PX - 0.17, ch, cw], [0, 0.79 + ch / 2, s * (PZ + cw / 2)], FELT, { r: 0.01 });
  }
  // rail caps
  const rw = 0.11, ry = 0.79 + 0.045;
  for (const s of [-1, 1]) {
    T.box('woodGloss', [rw, 0.05, 2 * OZ], [s * (PX + cw + rw / 2), ry - 0.025, 0], MAH, { r: 0.012 });
    T.box('woodGloss', [2 * PX + 2 * cw, 0.05, rw], [0, ry - 0.025, s * (PZ + cw + rw / 2)], MAH, { r: 0.012 });
    for (let i = 1; i < 4; i++) { if (i === 2) continue; T.sph('gloss', 0.007, [s * (PX + cw + rw / 2), ry, -PZ + i * PZ / 2], 0xf3efe2, { sy: 0.3, ws: 10, hs: 6 }); T.sph('gloss', 0.007, [s * (PX + cw + rw / 2), ry, i * PZ / 2], 0xf3efe2, { sy: 0.3, ws: 10, hs: 6 }); }
    for (const x of [-PX / 2, 0, PX / 2]) T.sph('gloss', 0.007, [x, ry, s * (PZ + cw + rw / 2)], 0xf3efe2, { sy: 0.3, ws: 10, hs: 6 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.box('brass', [0.13, 0.008, 0.13], [sx * (PX + cw + rw / 2 - 0.01), ry + 0.004, sz * (PZ + cw + rw / 2 - 0.01)], LX.brass, { r: 0.003 });
  const pockets = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => ({ x: x * (PX + 0.012), z: z * (PZ + 0.012), r: 0.062 }))
    .concat([-1, 1].map((x) => ({ x: x * (PX + 0.035), z: 0, r: 0.056 })));
  for (const p of pockets) {
    T.cyl('matte', 0.068, 0.068, 0.012, [p.x, ry + 0.002, p.z], 0x0b0b0b, { seg: 24 });
    T.lathe('matte', [[0.07, 0], [0.065, -0.06], [0.04, -0.13], [0, -0.14]], [p.x, 0.8, p.z], 0x141414, { seg: 16 });
  }
  T.sph('gloss', 0.004, [0, 0.7901, PZ / 2], 0xffffff, { sy: 0.2, ws: 8, hs: 4 });
  T.sph('gloss', 0.004, [0, 0.7901, -PZ / 2], 0xffffff, { sy: 0.2, ws: 8, hs: 4 });
  T.solid(E, [2 * OX, 0.86, 2 * OZ], [0, 0.43, 0]);
  // balls
  const geo = new THREE.SphereGeometry(R, 24, 16);
  const balls = [];
  for (let n = 0; n < 16; n++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ballTexture(n), roughness: 0.1, metalness: 0 }));
    m.castShadow = true; G.add(m);
    balls.push({ n, m, x: 0, z: 0, vx: 0, vz: 0, on: true, sink: -1 });
  }
  const RACK = [[1], [10, 2], [3, 8, 11], [12, 4, 13, 5], [6, 14, 7, 15, 9]];
  const st = { moving: false, racked: true, lastClack: 0, cueBusy: false };
  const placeBall = (b) => { b.m.position.set(CX + b.x, SY + R, CZ + b.z); };
  const rack = () => {
    const d = 2 * R + 0.0006;
    balls.forEach((b) => { b.vx = b.vz = 0; b.on = true; b.sink = -1; b.m.visible = true; b.m.scale.setScalar(1); b.m.quaternion.identity(); });
    RACK.forEach((row, k) => row.forEach((n, j) => { const b = balls[n]; b.x = (j - k / 2) * d; b.z = -PZ / 2 - k * d * 0.866; b.m.rotation.set(Math.random() * 6, Math.random() * 6, 0); placeBall(b); }));
    const c = balls[0]; c.x = 0; c.z = PZ / 2; placeBall(c);
    st.racked = true; st.moving = false;
  };
  rack();
  // cue stick (animated during shots)
  const cue = new THREE.Group(); cue.rotation.order = 'YXZ'; cue.visible = false; G.add(cue);
  const stick = new THREE.Group(); cue.add(stick);
  const cb = new Batch(); const L = 1.45;
  cb.root.cyl('woodGloss', 0.0145, 0.0065, L, [0, 0, L / 2], 0xd6b07a, { rx: PI / 2, seg: 14 });
  cb.root.cyl('woodGloss', 0.0146, 0.0148, 0.5, [0, 0, L - 0.25], 0x2a160c, { rx: PI / 2, seg: 14 });
  cb.root.cyl('plastic', 0.0066, 0.0066, 0.012, [0, 0, 0.006], 0x2a62c9, { rx: PI / 2, seg: 10 });
  cb.root.cyl('plastic', 0.0068, 0.0068, 0.02, [0, 0, 0.022], 0xf3efe2, { rx: PI / 2, seg: 10 });
  cb.build(stick, E.M);
  const shoot = async (dx, dz, speed) => {
    if (st.cueBusy) return; st.cueBusy = true;
    const c = balls[0];
    cue.position.set(CX + c.x, SY + R, CZ + c.z);
    cue.rotation.set(-0.07, Math.atan2(-dx, -dz), 0);
    stick.position.z = 0.04; cue.visible = true;
    await E.anim.to(stick.position, 'z', 0.24, 0.45, 'io');
    await E.anim.to(stick.position, 'z', 0.012, 0.07, 'in');
    E.snd.clack(cue, 0.8); E.snd.thud(cue, 0.3);
    c.vx = dx * speed; c.vz = dz * speed; st.moving = true; st.racked = false;
    E.anim.to(stick.position, 'z', 0.1, 0.3, 'out').then(() => { cue.visible = false; st.cueBusy = false; });
  };
  const tableHit = new THREE.Mesh(new THREE.BoxGeometry(2 * OX, 0.12, 2 * OZ), new THREE.MeshBasicMaterial({ visible: false }));
  tableHit.position.set(CX, SY + 0.03, CZ); G.add(tableHit);
  E.interact(tableHit, () => (st.moving || st.cueBusy ? 'הכדורים מתגלגלים…' : st.racked ? 'שבירה' : 'מכה'), () => {
    if (st.moving || st.cueBusy) return;
    if (st.racked) { shoot((Math.random() - 0.5) * 0.03, -1, 7.2); return; }
    const c = balls[0];
    const targets = balls.filter((b) => b.n && b.on);
    if (!targets.length) { rack(); return; }
    targets.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
    const t = targets[Math.floor(Math.random() * Math.min(3, targets.length))];
    let dx = t.x - c.x, dz = t.z - c.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const a = (Math.random() - 0.5) * 0.06, ca = Math.cos(a), sa = Math.sin(a);
    shoot(dx * ca - dz * sa, dx * sa + dz * ca, 2.6 + Math.random() * 2.2);
  });
  // physics
  const inMouthSide = (z) => Math.abs(z) < 0.058 || Math.abs(z) > PZ - 0.07;
  const inMouthEnd = (x) => Math.abs(x) > PX - 0.07;
  const pocket = (b) => {
    b.on = false; b.sink = 0; b.vx = b.vz = 0;
    E.snd.tone(b.m, { freq: 190, freqEnd: 80, dur: 0.18, vol: 0.25 }); E.snd.burst(b.m, { dur: 0.12, type: 'lowpass', freq: 500, vol: 0.2 });
  };
  const ax = new THREE.Vector3(), dq = new THREE.Quaternion();
  E.anim.tick((dtIn) => {
    const dt = Math.min(dtIn, 1 / 30);
    for (const b of balls) if (b.sink >= 0) {
      b.sink += dt; const k = Math.min(1, b.sink / 0.3);
      b.m.position.y = SY + R - k * 0.09; b.m.scale.setScalar(1 - k * 0.3);
      if (k >= 1) { b.m.visible = false; b.sink = -1; }
    }
    if (!st.moving) return;
    const sub = 8, h = dt / sub, e = 0.94, ec = 0.78, mn = 2 * R;
    let t = E.anim.t;
    for (let s = 0; s < sub; s++) {
      for (const b of balls) if (b.on) { b.x += b.vx * h; b.z += b.vz * h; }
      for (const b of balls) {
        if (!b.on) continue;
        for (const p of pockets) { const dx = b.x - p.x, dz = b.z - p.z; if (dx * dx + dz * dz < p.r * p.r) { pocket(b); break; } }
        if (!b.on) continue;
        let hitC = 0;
        if (b.x > PX - R && !inMouthSide(b.z)) { b.x = 2 * (PX - R) - b.x; hitC = Math.abs(b.vx); b.vx = -Math.abs(b.vx) * ec; }
        else if (b.x < -PX + R && !inMouthSide(b.z)) { b.x = 2 * (-PX + R) - b.x; hitC = Math.abs(b.vx); b.vx = Math.abs(b.vx) * ec; }
        if (b.z > PZ - R && !inMouthEnd(b.x)) { b.z = 2 * (PZ - R) - b.z; hitC = Math.abs(b.vz); b.vz = -Math.abs(b.vz) * ec; }
        else if (b.z < -PZ + R && !inMouthEnd(b.x)) { b.z = 2 * (-PZ + R) - b.z; hitC = Math.abs(b.vz); b.vz = Math.abs(b.vz) * ec; }
        if (hitC > 0.4 && t - st.lastClack > 0.03) { st.lastClack = t; E.snd.thud(b.m, clamp(hitC / 6, 0.05, 0.4)); }
        if (Math.abs(b.x) > PX + 0.05 || Math.abs(b.z) > PZ + 0.05) pocket(b);
      }
      for (let i = 0; i < 16; i++) {
        const a = balls[i]; if (!a.on) continue;
        for (let j = i + 1; j < 16; j++) {
          const b = balls[j]; if (!b.on) continue;
          const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
          if (d2 >= mn * mn || d2 < 1e-12) continue;
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
          const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (rel > 0) {
            const imp = rel * (1 + e) / 2;
            a.vx -= imp * nx; a.vz -= imp * nz; b.vx += imp * nx; b.vz += imp * nz;
            if (t - st.lastClack > 0.022) { st.lastClack = t; E.snd.clack(a.m, clamp(rel / 3, 0.06, 1)); }
          }
          const ov = (mn - d) / 2; a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
        }
      }
      t += h;
    }
    let any = false;
    for (const b of balls) {
      if (!b.on) continue;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) {
        const ns = Math.max(0, sp - (0.16 + 0.1 * sp) * dt);
        if (ns < 0.012) { b.vx = b.vz = 0; } else { b.vx *= ns / sp; b.vz *= ns / sp; any = true; }
        // rolling rotation
        ax.set(b.vz, 0, -b.vx).normalize(); dq.setFromAxisAngle(ax, sp * dt / R); b.m.quaternion.premultiply(dq);
      }
      placeBall(b);
    }
    if (!any) {
      st.moving = false;
      const c = balls[0];
      if (!c.on) { // respawn cue ball at head spot (find a free spot)
        c.on = true; c.m.visible = true; c.m.scale.setScalar(1); c.x = 0; c.z = PZ / 2;
        for (let k = 0; k < 20; k++) { if (balls.every((b) => !b.on || b === c || Math.hypot(b.x - c.x, b.z - c.z) > 2.2 * R)) break; c.x = (Math.random() - 0.5) * 0.6; }
        placeBall(c);
      }
    }
  });
  return { rack };
}

function frontLoader(E, G, f, kind) {
  const W = 0.686, H = 0.98, D = 0.76, cy = 0.46, hr = 0.19;
  f.box('plastic', [0.02, H, D], [-W / 2 + 0.01, H / 2, D / 2], 0xf4f5f6, { r: 0.006 });
  f.box('plastic', [0.02, H, D], [W / 2 - 0.01, H / 2, D / 2], 0xf4f5f6, { r: 0.006 });
  f.box('plastic', [W, 0.025, D], [0, H - 0.0125, D / 2], 0xf4f5f6, { r: 0.008 });
  f.box('plastic', [W - 0.04, H, 0.02], [0, H / 2, 0.01], 0xdadcde, { r: 0 });
  f.box('plastic', [W - 0.02, 0.06, D - 0.02], [0, 0.03, D / 2], 0xdadcde, { r: 0 });
  f.plate('plastic', [[-W / 2, 0.06], [W / 2, 0.06], [W / 2, H - 0.17], [-W / 2, H - 0.17]], [{ circle: [0, cy, hr] }], D, 0.015, 0xf4f5f6, { curve: 40 });
  f.box('plastic', [W, 0.16, 0.05], [0, H - 0.09, D - 0.02], 0xe9ebed, { r: 0.01 });
  f.box('gloss', [0.2, 0.06, 0.004], [0.08, H - 0.09, D + 0.006], 0x1a1d22, { r: 0.002 });
  f.box('led', [0.08, 0.022, 0.002], [0.08, H - 0.09, D + 0.009], 0x66ccff, { r: 0 });
  f.box('plastic', [0.14, 0.05, 0.02], [-0.22, H - 0.09, D + 0.01], 0xcfd2d5, { r: 0.006 }); // detergent drawer
  // gasket
  f.torus('rubber', hr + 0.005, 0.018, [0, cy, D - 0.02], 0x9aa0a6, { rs: 8, ts: 36 });
  // drum (rotating)
  const drumG = new THREE.Group(); f.place(drumG, [0, cy, D - 0.32]); G.add(drumG);
  const db = new Batch(), d = db.root;
  d.cyl('metal', 0.235, 0.235, 0.5, [0, 0, 0], 0xb9bec3, { rx: PI / 2, seg: 32, open: true });
  d.cyl('metal', 0.235, 0.235, 0.01, [0, 0, -0.25], 0xa9aeb3, { rx: PI / 2, seg: 32 });
  for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3; d.box('plastic', [0.05, 0.04, 0.46], [Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0], 0xd0d4d8, { r: 0.012, rz: a + PI / 2 }); }
  const cols = kind === 'dryer' ? [0x2f3a45, 0xe9e4da, 0x8ea7b5, 0xc7835c] : [0x4b5560, 0xd8cbb0, 0x7a2e2a];
  cols.forEach((c, i) => d.box('fabric', [0.2, 0.08, 0.22], [Math.cos(i * 1.7) * 0.1, -0.13 + (i % 2) * 0.05, -0.1 + i * 0.06], c, { r: 0.03, rz: i }));
  db.build(drumG, E.M);
  // door
  const door = hinged(E, G, f, {
    pos: [-hr - 0.05, cy, D + 0.012], hinge: 'L', angle: 1.9, labels: [kind === 'dryer' ? 'פתח דלת מייבש' : 'פתח דלת מכונת כביסה', 'סגור דלת'], snd: 'cab',
    draw: (p) => {
      p.torus('metal', hr + 0.02, 0.026, [hr + 0.05, 0, 0.02], 0xd8dcdf, { rs: 10, ts: 40 });
      p.cyl('glassC', hr + 0.005, hr + 0.005, 0.01, [hr + 0.05, 0, 0.02], 0x8f9aa3, { rx: PI / 2, seg: 36 });
      p.box('plastic', [0.03, 0.12, 0.03], [2 * hr + 0.09, 0, 0.03], 0xcfd2d5, { r: 0.01 });
    },
  });
  // start control
  const run = { on: false, t: 0 };
  const hum = kind === 'dryer' ? E.snd.hum(drumG, { freq: 60, noiseF: 900, vol: 0.22, wobble: 0.9 }) : E.snd.hum(drumG, { freq: 50, noiseF: 420, vol: 0.25, wobble: 0.5 });
  const knobM = new THREE.Group(); f.place(knobM, [-0.06, 0.98 - 0.09, D + 0.005]); G.add(knobM);
  const kn = new THREE.Group(); knobM.add(kn);
  const kb = new Batch(); kb.root.cyl('plastic', 0.032, 0.034, 0.03, [0, 0, 0.015], 0xd8dcdf, { rx: PI / 2, seg: 24 }); kb.root.box('plastic', [0.006, 0.026, 0.006], [0, 0.014, 0.032], 0x333333, { r: 0 }); kb.build(kn, E.M);
  const name = kind === 'dryer' ? 'מייבש' : 'מכונת כביסה';
  E.interact(knobM, () => (door.open ? 'סגור את הדלת' : run.on ? `עצור ${name}` : `הפעל ${name}`), () => {
    E.snd.click(knobM, 0.8);
    if (door.open) return;
    run.on = !run.on; E.anim.to(kn.rotation, 'z', run.on ? -1.4 : 0, 0.3);
    if (run.on) { hum.start(); E.snd.beep(knobM, 2); } else hum.stop(0.8);
  });
  door.locked = () => run.on;
  door.lockedLabel = 'נעול בזמן פעולה';
  let spd = 0;
  E.anim.tick((dt, t) => {
    const target = run.on ? (kind === 'dryer' ? 4.2 : 3.2 * (Math.floor(t / 4) % 2 ? 1 : -1)) : 0;
    spd += (target - spd) * Math.min(1, dt * 1.5);
    drumG.rotation.z += spd * dt;
  });
  f.solid(E, [W, H, D + 0.06], [0, H / 2, (D + 0.06) / 2]);
}

// ------------------------------------------------------------------ lounge corner: velvet club chairs, walnut drum table, brass bar cart
function clubChair(E, f, col) {
  soft(f, 'velvet', [0.84, 0.36, 0.8], [0, 0.2, 0], col, { e1: 0.25, e2: 0.15, flat: 0.6, noise: 0.004, seed: 71 });
  soft(f, 'velvet', [0.8, 0.5, 0.2], [0, 0.6, -0.3], col, { e1: 0.45, e2: 0.3, bend: 0.5, noise: 0.005, seed: 72 });
  for (const sx of [-1, 1]) soft(f, 'velvet', [0.17, 0.32, 0.72], [sx * 0.34, 0.52, 0.0], col, { e1: 0.5, e2: 0.25, noise: 0.004, seed: 73 + sx });
  soft(f, 'velvet', [0.52, 0.12, 0.56], [0, 0.43, 0.08], col, { e1: 0.4, e2: 0.15, flat: 0.5, sagTop: 0.01, noise: 0.004, seed: 75 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl('brass', 0.016, 0.012, 0.04, [sx * 0.33, 0.02, sz * 0.3], LX.brass, { seg: 10 });
  f.solid(E, [0.86, 0.82, 0.82], [0, 0.41, 0]);
}
function buildLounge(E, G, root, B0) {
  rugLux(root, 2.8, 2.1, [2.45, B0, 3.15], 0xb4a48c);
  clubChair(E, root.sub(1.55, B0, 3.15, PI / 2), 0x2f4a3a);
  clubChair(E, root.sub(3.35, B0, 3.15, -PI / 2), 0x2f4a3a);
  const T = root.sub(2.45, B0, 3.15, 0);
  T.cyl('walnut', 0.3, 0.3, 0.04, [0, 0.46, 0], 0xffffff, { seg: 48 });
  T.cyl('walnut', 0.26, 0.28, 0.42, [0, 0.22, 0], 0xffffff, { seg: 48 });
  T.cyl('brass', 0.285, 0.285, 0.01, [0, 0.005, 0], LX.brass, { seg: 48 });
  bookStack(T, -0.08, 0.48, 0.05, 2, rng(81), { w: 0.26, d: 0.2 });
  // whisky tray
  T.cyl('brass', 0.13, 0.13, 0.01, [0.12, 0.485, -0.08], LX.brass, { seg: 32 });
  T.lathe('glassC', [[0, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.13], [0.025, 0.17], [0.02, 0.21], [0, 0.21]], [0.12, 0.49, -0.1], 0xd9a35a, { seg: 20 });
  glassCup(T, 0.2, 0.49, -0.02, 0.08, 0.035); glassCup(T, 0.05, 0.49, -0.02, 0.08, 0.035);
  E.box(2.15, 2.75, 2.85, 3.45, B0, B0 + 0.5);
  // brass bar cart against the stair side (faces west)
  const BC = root.sub(4.45, B0, 5.2, -PI / 2), cw = 0.8, cd = 0.42;
  for (const sx of [-1, 1]) {
    tube(BC, 'brass', [[sx * cw / 2, 0.06, 0.03], [sx * cw / 2, 0.85, 0.03], [sx * cw / 2, 0.9, 0.08], [sx * cw / 2, 0.9, cd - 0.06], [sx * cw / 2, 0.85, cd - 0.03], [sx * cw / 2, 0.06, cd - 0.03]], 0.012, LX.brass, { tseg: 40, rs: 10 });
    for (const sz of [0.03, cd - 0.03]) { BC.cyl('duo', 0.03, 0.03, 0.022, [sx * cw / 2, 0.035, sz], 0x1b1b1b, { rz: PI / 2, seg: 18, slot: 6 }); }
  }
  for (const y of [0.22, 0.62]) {
    BC.box('glass', [cw - 0.02, 0.008, cd - 0.04], [0, y, cd / 2], 0xffffff, { r: 0 });
    BC.box('brass', [cw, 0.016, 0.012], [0, y, 0.02], LX.brass, { r: 0.004 }); BC.box('brass', [cw, 0.016, 0.012], [0, y, cd - 0.02], LX.brass, { r: 0.004 });
  }
  // decanters, glasses, ice bucket, books
  BC.lathe('glassC', [[0, 0], [0.06, 0], [0.065, 0.02], [0.065, 0.12], [0.03, 0.17], [0.022, 0.22], [0, 0.22]], [-0.22, 0.628, cd / 2], 0xc77a2a, { seg: 24 });
  BC.sph('glassC', 0.03, [-0.22, 0.88, cd / 2], 0xffffff, { ws: 14, hs: 10 });
  BC.lathe('glassC', [[0, 0], [0.05, 0], [0.055, 0.04], [0.04, 0.16], [0.02, 0.24], [0, 0.24]], [-0.06, 0.628, cd / 2 + 0.05], 0x5a2a1a, { seg: 24 });
  for (let i = 0; i < 4; i++) glassCup(BC, 0.1 + (i % 2) * 0.08, 0.628, cd / 2 - 0.06 + Math.floor(i / 2) * 0.1, 0.09, 0.035);
  BC.lathe('brass', [[0, 0], [0.07, 0], [0.085, 0.16], [0.08, 0.165], [0, 0.02]], [0.3, 0.628, cd / 2], LX.brass, { seg: 28 });
  bookStack(BC, -0.15, 0.228, cd / 2, 3, rng(83), { w: 0.28, d: 0.22 });
  vase(BC, 0.22, 0.228, cd / 2, 'globe', 0x2f3a33, 0.8);
  E.box(4.0, 4.45, 4.8, 5.6, B0, B0 + 0.95);
  // brass reading lamp on the drum table (lights with the room)
  tableLampLux(E, G, T.sub(-0.16, 0.48, -0.14), { room: 'basement', floor: 'basement', point: false, h: 0.5, sr: 0.15, kind: 'column' });
  // art over the lounge (west wall, between shelving and the window)
  artLux(root.sub(0.125, B0, 2.4, PI / 2), 7, 0, 1.25, 0, 0.9, 0.62, { key: 'brass', fc: LX.brass, fw: 0.012, fd: 0.03 });
}

export function buildBasement(E, G, top) {
  const B0 = E.plan.basementFloor, CEIL = E.plan.basementCeil;
  const B = new Batch(), root = B.root;
  // pool table + light
  const pool = buildPool(E, G, top, root, B0);
  const lg = new THREE.Group(); lg.userData.floor = 'basement'; lg.userData.ceiling = true; top.add(lg);
  // brass billiard pendant: brass bar + three green enamel domes with opal diffusers
  const lb = new Batch(), lf = lb.root.sub(7.3, 0, 4.55, 0), ly = B0 + 1.66;
  const billM = E.glow ? E.glow('basement', 2.4) : new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 2.2, roughness: 0.4 });
  tube(lf, 'brass', [[0, ly + 0.27, -0.62], [0, ly + 0.28, 0], [0, ly + 0.27, 0.62]], 0.014, LX.brass, { tseg: 20, rs: 12, caps: true });
  for (const z of [-0.42, 0, 0.42]) {
    lf.lathe('duo', [[0.2, 0], [0.195, 0.012], [0.16, 0.1], [0.08, 0.2], [0.03, 0.22], [0.02, 0.23]], [0, ly, z], 0x1e4a34, { seg: 40, slot: 4 });
    lf.torus('brass', 0.2, 0.006, [0, ly, z], LX.brass, { rx: PI / 2, ts: 40, rs: 6 });
    lf.cyl('brass', 0.012, 0.012, 0.05, [0, ly + 0.25, z], LX.brass, { seg: 10 });
    lf.cyl(billM, 0.17, 0.17, 0.004, [0, ly + 0.03, z], 0xffffff, { seg: 32 });
  }
  for (const z of [-0.55, 0.55]) lf.cyl('brass', 0.003, 0.003, CEIL - ly - 0.28, [0, (CEIL + ly + 0.28) / 2, z], LX.brass, { seg: 4 });
  lb.build(lg, E.M, { shadow: false });
  // cue rack on east wall + triangle (rack balls)
  const CR = root.sub(9.019, B0, 6.25, -PI / 2);
  CR.box('woodGloss', [0.55, 0.12, 0.08], [0, 0.22, 0.04], 0x5a2614, { r: 0.01 });
  CR.box('woodGloss', [0.55, 0.1, 0.08], [0, 1.45, 0.04], 0x5a2614, { r: 0.01 });
  CR.box('woodGloss', [0.55, 1.35, 0.02], [0, 0.85, 0.01], 0x5a2614, { r: 0.004 });
  for (let i = 0; i < 4; i++) {
    CR.cyl('woodGloss', 0.0065, 0.0145, 1.45, [-0.2 + i * 0.13, 0.95, 0.05], 0xd6b07a, { seg: 12 });
    CR.cyl('woodGloss', 0.0148, 0.0145, 0.5, [-0.2 + i * 0.13, 0.48, 0.05], [0x2a160c, 0x1b2a3a, 0x3a1a1a, 0x2a160c][i], { seg: 12 });
  }
  const triG = new THREE.Group(); CR.place(triG, [0, 1.0, 0.1]); G.add(triG);
  const tb = new Batch();
  for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3 + PI / 2; tb.root.box('woodGloss', [0.3, 0.02, 0.025], [Math.cos(a) * 0.087, Math.sin(a) * 0.087, 0], 0x7a4a2a, { r: 0.005, rz: a + PI / 2 }); }
  tb.build(triG, E.M);
  E.interact(triG, () => 'סדר כדורים', () => { E.snd.slide(triG, 0.4); E.snd.clack(triG, 0.5); pool.rack(); });
  // laundry (north wall) + utility sink + panel
  frontLoader(E, G, root.sub(6.04, B0, 0.125, 0), 'washer');
  frontLoader(E, G, root.sub(6.76, B0, 0.125, 0), 'dryer');
  // walnut folding counter over the machines + white shaker wall cabinets with brass knobs
  root.box('walnut', [1.44, 0.04, 0.8], [6.4, B0 + 1.005, 0.125 + 0.4], 0xffffff, { r: 0.008, grain: 'h' });
  { const ry = B0 + 1.42, ch = 0.52, cd = 0.34, WHT = 0xf3f0ea, F = root.sub(0, 0, 0.125, 0);
    for (const [x0, w] of [[5.7, 0.7], [6.4, 0.7]]) {
      F.box('duo', [0.018, ch, cd], [x0 + 0.009, ry + ch / 2, cd / 2], WHT, { r: 0.002 });
      F.box('duo', [0.018, ch, cd], [x0 + w - 0.009, ry + ch / 2, cd / 2], WHT, { r: 0.002 });
      F.box('duo', [w - 0.036, 0.018, cd], [x0 + w / 2, ry + 0.009, cd / 2], WHT, { r: 0.002 });
      F.box('duo', [w - 0.036, 0.018, cd], [x0 + w / 2, ry + ch - 0.009, cd / 2], WHT, { r: 0.002 });
      F.box('duo', [w - 0.036, 0.016, cd - 0.03], [x0 + w / 2, ry + ch / 2, cd / 2 - 0.01], WHT, { r: 0.002 });
      F.box('duo', [w - 0.036, ch - 0.036, 0.01], [x0 + w / 2, ry + ch / 2, 0.005], WHT, { r: 0 });
      const dw = (w - 0.009) / 2 - 0.003;
      for (const left of [true, false]) hinged(E, G, F, {
        pos: [left ? x0 + 0.003 : x0 + w - 0.003, ry + 0.003, cd + 0.02], hinge: left ? 'L' : 'R', angle: 1.8, labels: ['פתח ארון כביסה', 'סגור ארון כביסה'],
        draw: (p) => { shaker(p, 'duo', left ? 0 : -dw, 0, dw, ch - 0.006, 0.02, WHT); bknob(p, left ? dw - 0.04 : -dw + 0.04, 0.07, 0, 0.014); },
      });
    }
    bottle(F, 'plastic', 5.85, ry + 0.018, cd / 2, 0.24, 0.05, 0xf2efe6, 0xc9a25a);
    bottle(F, 'plastic', 5.98, ry + 0.018, cd / 2, 0.2, 0.045, 0xd9cdb8, 0xc9a25a);
    for (let i = 0; i < 3; i++) soft(F, 'terry', [0.3, 0.05, 0.24], [6.75, ry + ch / 2 + 0.035 + i * 0.048, cd / 2], [0xf4f0e8, 0xe7e0d3, 0xf4f0e8][i], { e1: 0.45, e2: 0.12, noise: 0.003, nu: 16, nv: 8, seed: i });
    F.cyl('ceramic', 0.06, 0.055, 0.14, [6.45, ry + ch / 2 + 0.078, cd / 2], 0xe9e3d6, { seg: 20 });
  }
  vase(root, 6.0, B0 + 1.025, 0.45, 'cylinder', 0xe9e3d6, 0.8); bottle(root, 'amber', 6.75, B0 + 1.025, 0.4, 0.22, 0.04, 0x8a4a1a, 0xc9a25a);
  soft(root, 'knit', [0.5, 0.28, 0.36], [5.85, B0 + 0.14, 1.35], 0xc9bba3, { e1: 0.25, e2: 0.25, noise: 0.004, seed: 9 }); // woven laundry basket
  for (let i = 0; i < 4; i++) soft(root, 'terry', [0.2, 0.06, 0.26], [5.75 + i * 0.07, B0 + 0.29, 1.35], [0x8ea7b5, 0xe9e4da, 0x2f3a45, 0xc7835c][i], { e1: 0.4, e2: 0.2, ry: i, noise: 0.003, seed: i + 3 });
  // utility sink
  const US = root.sub(7.6, B0, 0.125, 0), uw = 0.6, ud = 0.55, uh = 0.86;
  for (const [x, z] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) US.cyl('plastic', 0.018, 0.018, uh - 0.3, [x * (uw / 2 - 0.04), (uh - 0.3) / 2, 0.06 + z * (ud - 0.12)], 0xf4f4f2, { seg: 10 });
  const ty0 = uh - 0.32;
  US.box('plastic', [uw, 0.02, ud], [0, ty0, ud / 2], 0xf4f4f2, { r: 0.008 });
  US.box('plastic', [0.03, 0.32, ud], [-uw / 2 + 0.015, ty0 + 0.16, ud / 2], 0xf4f4f2, { r: 0.008 });
  US.box('plastic', [0.03, 0.32, ud], [uw / 2 - 0.015, ty0 + 0.16, ud / 2], 0xf4f4f2, { r: 0.008 });
  US.box('plastic', [uw, 0.32, 0.03], [0, ty0 + 0.16, 0.015], 0xf4f4f2, { r: 0.008 });
  US.box('plastic', [uw, 0.32, 0.03], [0, ty0 + 0.16, ud - 0.015], 0xf4f4f2, { r: 0.008 });
  US.cyl('matte', 0.025, 0.025, 0.004, [0, ty0 + 0.012, ud / 2], 0x333333, { seg: 12 });
  US.cyl('brass', 0.014, 0.014, 0.3, [0, uh + 0.15, 0.04], LX.brass, { seg: 12 });
  US.torus('brass', 0.08, 0.012, [0, uh + 0.3, 0.12], LX.brass, { arc: PI, ry: PI / 2, rs: 8, ts: 20 });
  US.cyl('brass', 0.012, 0.012, 0.05, [0, uh + 0.28, 0.2], LX.brass, { seg: 12 });
  for (const x of [-0.07, 0.07]) US.box('metal', [0.05, 0.015, 0.02], [x, uh + 0.08, 0.04], x < 0 ? 0xc0392b : 0x2a62c9, { r: 0.004 });
  const uwater = basinWater(E, G, 7.6, 0.125 + ud / 2, uw - 0.07, ud - 0.07, B0 + ty0 + 0.012);
  const ufh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.25), new THREE.MeshBasicMaterial({ visible: false }));
  US.place(ufh, [0, uh + 0.18, 0.12]); G.add(ufh);
  waterFixture(E, G, { target: ufh, from: US.pt(0, uh + 0.255, 0.2), basin: { mesh: uwater, bottom: B0 + ty0 + 0.012, max: 0.2, rate: 0.012, drain: 0.03 }, labels: ['פתח ברז', 'סגור ברז'], rate: 90 });
  US.solid(E, [uw, uh, ud], [0, uh / 2, ud / 2]);
  // electrical panel
  const EP = root.sub(8.6, B0, 0.125, 0), pw = 0.36, ph = 0.76, pd = 0.1, py = 1.1;
  EP.box('steel', [pw, ph, pd], [0, py + ph / 2, pd / 2], 0x9aa0a6, { r: 0.004 });
  EP.box('paint', [pw - 0.04, ph - 0.06, 0.004], [0, py + ph / 2, pd + 0.002], 0xb8bcc0, { r: 0 });
  EP.box('satin', [0.06, 0.08, 0.02], [0, py + ph - 0.09, pd + 0.01], 0x1b1b1b, { r: 0.004 });
  for (let i = 0; i < 10; i++) for (const s of [-1, 1]) {
    EP.box('satin', [0.06, 0.022, 0.018], [s * 0.05, py + ph - 0.18 - i * 0.05, pd + 0.009], 0x1b1b1b, { r: 0.002 });
    EP.box('paint', [0.03, 0.012, 0.003], [s * 0.12, py + ph - 0.18 - i * 0.05, pd + 0.004], 0xffffff, { r: 0 });
  }
  for (const x of [-0.1, 0, 0.1]) EP.cyl('steel', 0.012, 0.012, CEIL - (B0 + py + ph), [x, py + ph + (CEIL - B0 - py - ph) / 2, 0.05], 0x8e9296, { seg: 8 });
  hinged(E, G, EP, {
    pos: [-pw / 2, py, pd + 0.012], hinge: 'L', angle: 1.8, labels: ['פתח לוח חשמל', 'סגור לוח חשמל'],
    draw: (p) => { p.box('steel', [pw, ph, 0.012], [pw / 2, ph / 2, -0.006], 0xa6abb0, { r: 0.003 }); p.box('satin', [0.02, 0.05, 0.015], [pw - 0.03, ph / 2, 0.006], 0x333333, { r: 0.004 }); p.box('paint', [0.12, 0.08, 0.002], [pw / 2, ph - 0.12, 0.001], 0xf2f2ee, { r: 0 }); },
  });
  // furnace + plenum + flue
  const FU = root.sub(2.5, B0, 0.2, 0), fw = 0.56, fh = 1.22, fd = 0.72;
  FU.box('paint', [fw, fh, fd], [0, fh / 2, fd / 2], 0xc9ccce, { r: 0.006 });
  for (let i = 0; i < 6; i++) FU.box('matte', [fw - 0.12, 0.008, 0.004], [0, 0.2 + i * 0.03, fd + 0.002], 0x7a7e82, { r: 0 });
  FU.box('matte', [fw - 0.02, 0.004, 0.004], [0, 0.62, fd + 0.002], 0x9a9ea2, { r: 0 });
  FU.box('paint', [0.12, 0.06, 0.003], [0.15, 0.9, fd + 0.002], 0xf2f2ee, { r: 0 });
  FU.box('steel', [fw + 0.04, CEIL - B0 - fh, fd * 0.8], [0, fh + (CEIL - B0 - fh) / 2, fd * 0.45], 0xb8bcc0, { r: 0.004 });
  FU.box('steel', [0.4, 0.3, 0.3], [-fw / 2 - 0.2, 0.9, fd * 0.5], 0xb8bcc0, { r: 0.004 });
  FU.box('steel', [0.3, 0.3, 1.4], [-fw / 2 - 0.2, CEIL - B0 - 0.2, fd * 0.5 + 0.6], 0xb8bcc0, { r: 0.004 });
  FU.cyl('steel', 0.065, 0.065, CEIL - B0 - 1.0, [0.18, 1.0 + (CEIL - B0 - 1.0) / 2, fd * 0.3], 0xa9aeb3, { seg: 16 });
  FU.solid(E, [fw + 0.5, fh, fd], [-0.2, fh / 2, fd / 2]);
  // water heater
  const WH = root.sub(1.45, B0, 0.5, 0);
  WH.cyl('paint', 0.28, 0.28, 1.45, [0, 0.775, 0], 0xe9eaeb, { seg: 32 });
  WH.cyl('paint', 0.285, 0.285, 0.05, [0, 0.03, 0], 0x5f6a72, { seg: 32 });
  WH.sph('paint', 0.28, [0, 1.5, 0], 0xe9eaeb, { sy: 0.18, t0: 0, tl: PI / 2, ws: 32, hs: 8 });
  WH.cyl('steel', 0.05, 0.05, CEIL - B0 - 1.55, [0, 1.55 + (CEIL - B0 - 1.55) / 2, 0], 0xa9aeb3, { seg: 14 });
  for (const x of [-0.14, 0.14]) WH.cyl('metal', 0.012, 0.012, CEIL - B0 - 1.5, [x, 1.5 + (CEIL - B0 - 1.5) / 2, 0.05], 0xb87333, { seg: 8 });
  WH.box('satin', [0.12, 0.12, 0.08], [0, 0.32, 0.29], 0x2b2b2b, { r: 0.01 });
  WH.cyl('metal', 0.01, 0.01, 0.35, [0.24, 1.0, 0.18], 0xb87333, { seg: 8 });
  WH.box('paint', [0.2, 0.25, 0.003], [-0.1, 0.9, 0.283], 0xf5d547, { r: 0, ry: -0.35 });
  E.box(1.15, 1.75, 0.2, 0.8, B0, B0 + 1.5);
  // storage shelving (west wall) with bins
  for (const zc of [4.85, 5.8]) {
    const S = root.sub(0.125, B0, zc, PI / 2), sw = 0.9, sd = 0.45, sh = 1.8;
    for (const [x, z] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) S.cyl('metal', 0.012, 0.012, sh, [x * (sw / 2 - 0.012), sh / 2, 0.02 + z * (sd - 0.04)], 0xcfd3d6, { seg: 8 });
    for (let i = 0; i < 4; i++) {
      const y = 0.15 + i * 0.52;
      S.box('metal', [sw, 0.012, sd], [0, y, sd / 2], 0xbfc3c6, { r: 0 });
      for (let k = 0; k < 7; k++) S.box('metal', [sw - 0.02, 0.004, 0.004], [0, y + 0.008, 0.04 + k * 0.06], 0xbfc3c6, { r: 0 });
      if (i < 3) for (let k = 0; k < 2; k++) {
        const bc = [0x2f3a45, 0x6b8f71, 0xd8cbb0, 0x3a6fa8][(i + k) % 4];
        S.box('plastic', [0.4, 0.3, 0.4], [-0.21 + k * 0.42, y + 0.156, sd / 2], bc, { r: 0.02 });
        S.box('plastic', [0.42, 0.025, 0.42], [-0.21 + k * 0.42, y + 0.32, sd / 2], 0x1b1b1b, { r: 0.008 });
      }
    }
    books(S, -0.4, 0.1, 0.15 + 3 * 0.52 + 0.006, sd / 2, rng(zc * 10 | 0), { hmin: 0.2, hvar: 0.08 });
    S.solid(E, [sw, sh, sd], [0, sh / 2, sd / 2]);
  }
  // dehumidifier
  const DH = root.sub(3.0, B0, 7.17, PI), dw = 0.38, dh = 0.6, dd = 0.28;
  DH.box('plastic', [dw, dh, dd], [0, dh / 2 + 0.02, dd / 2], 0xf4f5f6, { r: 0.03 });
  for (let i = 0; i < 10; i++) DH.box('matte', [dw - 0.08, 0.008, 0.004], [0, 0.32 + i * 0.022, dd + 0.002], 0x8a8f94, { r: 0 });
  DH.box('plastic', [0.16, 0.025, 0.04], [0, dh + 0.02, dd / 2], 0xcfd2d5, { r: 0.008 });
  for (const sx of [-1, 1]) for (const sz of [0, 1]) DH.cyl('rubber', 0.02, 0.02, 0.02, [sx * 0.13, 0.01, 0.05 + sz * 0.18], 0x222222, { seg: 10 });
  const dled = new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff66, emissiveIntensity: 0 });
  const dl = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), dled); DH.place(dl, [0.12, dh - 0.03, dd + 0.004]); G.add(dl);
  const dhHit = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, dd), new THREE.MeshBasicMaterial({ visible: false })); DH.place(dhHit, [0, dh / 2, dd / 2]); G.add(dhHit);
  const dst = { on: false }; const dhum = E.snd.hum(dhHit, { freq: 100, noiseF: 700, vol: 0.14 });
  E.interact(dhHit, () => (dst.on ? 'כבה מסיר לחות' : 'הפעל מסיר לחות'), () => { dst.on = !dst.on; E.snd.beep(dhHit, 1); dled.emissiveIntensity = dst.on ? 2 : 0; if (dst.on) dhum.start(); else dhum.stop(0.5); });
  DH.solid(E, [dw, dh, dd], [0, dh / 2, dd / 2]);
  // rug near pool table? (unfinished basement: rubber mat by laundry)
  rugLux(root, 1.5, 0.62, [6.4, B0, 1.25], 0x8f8a7c);
  buildLounge(E, G, root, B0);
  E.switchAt(G, root.sub(5.75, B0, 7.19, PI), 'basement', [0, 1.2, 0]);
  B.build(G, E.M, { name: 'basement' });
}
