// exterior-props.js — chain-link fences, mailbox, carts, AC condenser, utility poles + cobra-head street
// lights + overhead lines, street signs, parked cars and the white box truck.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boxGeo, cylGeo, mat, mulberry32, quadV, tag } from './exterior-util.js';
import { ATLAS, atlasUV } from './exterior-tex.js';
import { streetBand, CROSS, holeRect } from './exterior-ground.js';

const V = THREE.Vector3;

// ---------------------------------------------------------------- fences
export function buildFences(W) {
  const lines = W.fenceLines;
  if (!lines.length) return;
  const posts = [];
  for (const [ax, az, bx, bz] of lines) {
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.3) continue;
    const n = Math.max(1, Math.ceil(L / 2.5));
    for (let i = 0; i <= n; i++) posts.push({ x: ax + (bx - ax) * i / n, z: az + (bz - az) * i / n, end: i === 0 || i === n });
    W.B.chain.add(quadV(ax, az, bx, bz, 0.04, 1.2), null, 0xffffff);
    const rail = cylGeo(0.021, 0.021, L, 6, true);
    const dir = new V(bx - ax, 0, bz - az).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), dir);
    W.B.galv.add(rail, new THREE.Matrix4().compose(new V((ax + bx) / 2, 1.2, (az + bz) / 2), q, new V(1, 1, 1)), 0xffffff);
    const pad = 0.06;
    W.colliders.push(new THREE.Box3(new V(Math.min(ax, bx) - pad, 0, Math.min(az, bz) - pad), new V(Math.max(ax, bx) + pad, 1.3, Math.max(az, bz) + pad)));
  }
  const pg = cylGeo(0.03, 0.03, 1.3, 8, false); pg.translate(0, 0.65, 0);
  const pm = new THREE.InstancedMesh(pg, W.mats.galvPlain, posts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  posts.forEach((p, i) => { const s = p.end ? 1.45 : 1; m4.compose(new V(p.x, -0.05, p.z), q, new V(s, p.end ? 1.04 : 1, s)); pm.setMatrixAt(i, m4); });
  pm.instanceMatrix.needsUpdate = true;
  pm.castShadow = W.hi; pm.receiveShadow = true; pm.name = 'ext-fence-posts';
  pm.computeBoundingSphere && pm.computeBoundingSphere();
  tag(pm); W.root.add(pm);
}

// ---------------------------------------------------------------- mailbox (interactive door)
export function buildMailbox(W) {
  const { ctx, B } = W;
  const dw = W.plan.driveway, sb = streetBand(W.plan);
  const x = dw.x1 + 0.55, z = sb.z0 - 0.45;
  W.mailboxPos = { x, z };
  // V2: modern matte-black steel post + base plate, black box, brass house numbers
  const blk = 0x141414;
  B.darkMetal.add(boxGeo(0.09, 1.04, 0.09), mat(x, 0.52, z), blk);
  B.darkMetal.add(boxGeo(0.2, 0.012, 0.2), mat(x, 0.006, z), blk);
  B.darkMetal.add(boxGeo(0.07, 0.07, 0.36), mat(x, 1.0, z + 0.02), blk);   // arm under the box
  B.darkMetal.add(boxGeo(0.22, 0.02, 0.5), mat(x, 1.065, z), blk);
  const bc = 0x161616, bodyY = 1.08;
  B.darkMetal.add(boxGeo(0.17, 0.11, 0.48), mat(x, bodyY + 0.055, z), bc);
  const top = new THREE.CylinderGeometry(0.085, 0.085, 0.48, 18, 1, false, Math.PI / 2, Math.PI);
  B.darkMetal.add(top, mat(x, bodyY + 0.11, z, Math.PI / 2, 0, 0), bc);
  // back cap
  const cap = new THREE.CircleGeometry(0.085, 18, 0, Math.PI);
  B.darkMetal.add(cap, mat(x, bodyY + 0.11, z - 0.24, 0, Math.PI, 0), bc);
  B.darkMetal.add(boxGeo(0.17, 0.11, 0.005), mat(x, bodyY + 0.055, z - 0.2425), bc);
  // brass number plates on both sides (atlas: brass gradient numerals on black)
  for (const s of [1, -1]) {
    const pg = new THREE.PlaneGeometry(0.3, 0.094);
    const uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const [u, v] = atlasUV(ATLAS.num, uv.getX(i), uv.getY(i)); uv.setXY(i, u, v); }
    B.signs.add(pg, mat(x + s * 0.0875, bodyY + 0.07, z, 0, s * Math.PI / 2, 0), 0xffffff);
  }
  // brass numbers on the post too (street side)
  { const pg = new THREE.PlaneGeometry(0.075, 0.24); const uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const [u, v] = atlasUV(ATLAS.num, 1 - uv.getY(i), uv.getX(i)); uv.setXY(i, u, v); }
    B.signs.add(pg, mat(x, 0.66, z + 0.0455), 0xffffff); }
  // flag (matte black, lowered)
  B.darkMetal.add(boxGeo(0.012, 0.2, 0.03), mat(x + 0.092, bodyY + 0.1, z - 0.12), 0x1c1c1c);
  B.darkMetal.add(boxGeo(0.012, 0.05, 0.09), mat(x + 0.092, bodyY + 0.18, z - 0.09), 0x1c1c1c);
  // door: separate group hinged at the bottom front edge (+z faces the street)
  const pivot = new THREE.Group();
  pivot.position.set(x, bodyY, z + 0.243);
  const doorShape = new THREE.Shape();
  doorShape.moveTo(-0.087, 0); doorShape.lineTo(0.087, 0); doorShape.lineTo(0.087, 0.11);
  doorShape.absarc(0, 0.11, 0.087, 0, Math.PI, false); doorShape.lineTo(-0.087, 0);
  const dg = new THREE.ExtrudeGeometry(doorShape, { depth: 0.012, bevelEnabled: false, curveSegments: 10 });
  const door = new THREE.Mesh(dg, W.mats.mailDoor);
  door.castShadow = true;
  pivot.add(door);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.03), W.mats.mailDoor);
  handle.position.set(0, 0.16, 0.025); pivot.add(handle);
  tag(pivot); W.root.add(pivot);
  let open = false;
  if (ctx.addInteractive) {
    ctx.addInteractive(door, {
      label: () => (open ? 'סגור תיבת דואר' : 'פתח תיבת דואר'),
      hint: '3351',
      onUse: () => {
        open = !open;
        const to = open ? 1.45 : 0;
        if (ctx.tween) ctx.tween(pivot.rotation, 'x', to, 0.45); else pivot.rotation.x = to;
        try { if (ctx.audio && ctx.audio.tone) ctx.audio.tone(open ? 900 : 600, 0.06, { type: 'square', gain: 0.03 }); } catch (e) { /* ignore */ }
      },
    });
  }
  W.colliders.push(new THREE.Box3(new V(x - 0.15, 0, z - 0.3), new V(x + 0.15, 1.3, z + 0.3)));
}

// ---------------------------------------------------------------- carts (blue recycling + gray trash)
export function buildBins(W) {
  const { B } = W;
  const dw = W.plan.driveway;
  const bx = dw.x1 + 0.55;
  const spots = [{ z: -1.6, col: 0x1d4f9c, recycle: true }, { z: -2.45, col: 0x55595d }];
  for (const s of spots) {
    const z = s.z, x = bx;
    const body = new THREE.CylinderGeometry(0.43, 0.36, 0.98, 4, 1, false);
    B.plastic.add(body, mat(x, 0.08 + 0.49, z, 0, Math.PI / 4, 0), s.col);
    B.plastic.add(boxGeo(0.66, 0.05, 0.7), mat(x + 0.02, 1.095, z), new THREE.Color(s.col).multiplyScalar(0.92));
    B.plastic.add(boxGeo(0.05, 0.06, 0.56), mat(x + 0.33, 1.02, z), new THREE.Color(s.col).multiplyScalar(0.85)); // handle (toward house)
    for (const sz of [-0.22, 0.22]) {
      const wg = cylGeo(0.1, 0.1, 0.06, 12, false);
      B.plastic.add(wg, mat(x + 0.3, 0.1, z + sz, Math.PI / 2, 0, 0), 0x202020);
    }
    B.darkMetal.add(cylGeo(0.012, 0.012, 0.5, 6, false), mat(x + 0.3, 0.1, z, Math.PI / 2, 0, 0), 0x777777);
    if (s.recycle) {
      const pg = new THREE.PlaneGeometry(0.42, 0.1);
      const uv = pg.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const [u, v] = atlasUV(ATLAS.recycle, uv.getX(i), uv.getY(i)); uv.setXY(i, u, v); }
      // face toward the driveway (-x), slightly proud of the tapered face
      B.signs.add(pg, mat(x - 0.302, 0.78, z, 0, -Math.PI / 2, 0.0), 0xffffff);
    }
    W.colliders.push(new THREE.Box3(new V(x - 0.34, 0, z - 0.36), new V(x + 0.38, 1.15, z + 0.36)));
    W.excl.push([x - 0.4, z - 0.4, x + 0.45, z + 0.4]);
  }
}

// ---------------------------------------------------------------- AC condenser (interactive)
export function buildAC(W) {
  const { ctx, B } = W;
  const hole = holeRect(W.plan);
  const x = hole.x1 + 0.62, z = 2.85;
  B.concrete.add(boxGeo(0.95, 0.12, 0.95), mat(x, 0.03, z), 0xe0ded8);
  const unit = new THREE.Mesh(boxGeo(0.72, 0.66, 0.72), W.mats.ac);
  unit.position.set(x, 0.09 + 0.33, z); unit.castShadow = true; unit.receiveShadow = true;
  tag(unit); W.root.add(unit);
  B.darkMetal.add(boxGeo(0.76, 0.04, 0.76), mat(x, 0.77, z), 0x3a3c3d);
  const grill = new THREE.CircleGeometry(0.3, 28); grill.rotateX(-Math.PI / 2);
  const gm = new THREE.Mesh(grill, W.mats.grille); gm.position.set(x, 0.795, z); tag(gm); W.root.add(gm);
  // fan blades just under the grille
  const fan = new THREE.Group(); fan.position.set(x, 0.775, z);
  const bladeG = new THREE.BoxGeometry(0.26, 0.008, 0.08);
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(bladeG, W.mats.fan);
    b.position.set(Math.cos(k * 2.094) * 0.13, 0, Math.sin(k * 2.094) * 0.13);
    b.rotation.set(0.35, -k * 2.094, 0);
    fan.add(b);
  }
  tag(fan); W.root.add(fan);
  // line set + disconnect box on the wall
  B.darkMetal.add(cylGeo(0.022, 0.022, 0.5, 8), mat(hole.x1 + 0.12, 0.55, z - 0.15), 0x161616);
  B.darkMetal.add(cylGeo(0.022, 0.022, 0.4, 8), mat((hole.x1 + x - 0.36) / 2 + 0.06, 0.32, z - 0.15, 0, 0, Math.PI / 2), 0x161616);
  B.darkMetal.add(boxGeo(0.1, 0.3, 0.22), mat(hole.x1 + 0.05, 1.2, z + 0.25), 0x8d9092);
  B.darkMetal.add(cylGeo(0.012, 0.012, 0.75, 6), mat(hole.x1 + 0.05, 0.75, z + 0.25), 0x8d9092);
  W.colliders.push(new THREE.Box3(new V(x - 0.48, 0, z - 0.48), new V(x + 0.48, 0.85, z + 0.48)));
  W.excl.push([x - 0.55, z - 0.55, x + 0.55, z + 0.55]);
  let on = false, speed = 0, hum = null;
  W.updaters.push((dt) => {
    speed += ((on ? 18 : 0) - speed) * Math.min(1, dt * 0.8);
    fan.rotation.y += speed * dt;
  });
  if (ctx.addInteractive) {
    ctx.addInteractive(unit, {
      label: () => (on ? 'כבה מזגן' : 'הפעל מזגן'),
      hint: 'AC',
      onUse: () => {
        on = !on;
        try {
          const ac = ctx.audio && ctx.audio.ctx;
          if (on && ac && !hum) {
            const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58;
            const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
            const g = ac.createGain(); g.gain.value = 0;
            o.connect(f); f.connect(g);
            let out = g;
            if (ctx.audio.positional) { try { const pn = ctx.audio.positional(unit); if (pn) { g.connect(pn); out = null; } } catch (e) { /* fall back */ } }
            if (out) g.connect(ac.destination);
            o.start();
            g.gain.setTargetAtTime(0.05, ac.currentTime, 0.6);
            hum = { o, g };
          } else if (!on && hum && ac) {
            hum.g.gain.setTargetAtTime(0, ac.currentTime, 0.4);
            const h = hum; hum = null;
            setTimeout(() => { try { h.o.stop(); } catch (e) { /* ignore */ } }, 2500);
          }
        } catch (e) { /* audio optional */ }
      },
    });
  }
}

// ---------------------------------------------------------------- utility poles, street lights, lines
export function buildPoles(W) {
  const { B } = W;
  const sb = streetBand(W.plan);
  const pz = sb.z0 - 0.95;
  const want = [13.8, -22, -58, -94, -130, 49.5, 80, 118, 154];
  const xs = [];
  const conflict = (x) => {
    for (const d of W.driveways) if (x > d.x0 - 1.2 && x < d.x1 + 1.2 && d.side === 'N') return true;
    const dw = W.plan.driveway; if (x > dw.x0 - 1.5 && x < dw.x1 + 2) return true;
    for (const c of CROSS) if (Math.abs(x - c.x) < c.half + 2.5) return true;
    if (W.walkInfo) { const t = W.walkInfo.toStreet; if (x > t[0] - 1.5 && x < t[2] + 1.5) return true; }
    return false;
  };
  for (const x0 of want) {
    let x = x0;
    for (let k = 0; k < 12 && conflict(x); k++) x = x0 + (k % 2 ? -1 : 1) * Math.ceil((k + 1) / 2) * 1.5;
    xs.push(x);
  }
  xs.sort((a, b) => a - b);
  W.poleXs = xs;
  const wood = 0xffffff;
  const heads = [];
  xs.forEach((x, pi) => {
    B.wood.add(cylGeo(0.12, 0.165, 10.6, 9), mat(x, 4.7, pz), wood);
    B.wood.add(boxGeo(0.1, 0.11, 2.3), mat(x, 9.35, pz), 0xd8d0c4);
    for (const dz of [-1.0, 0, 1.0]) B.darkMetal.add(cylGeo(0.035, 0.05, 0.16, 8), mat(x, dz === 0 ? 10.0 : 9.48, pz + dz), 0x8a8a84);
    if (pi % 3 === 1) B.darkMetal.add(cylGeo(0.24, 0.24, 0.85, 12), mat(x - 0.32, 8.5, pz), 0x7b7f80); // transformer can on some poles
    // street light: mast arm toward the street + cobra head
    const arm = cylGeo(0.035, 0.035, 2.2, 8);
    B.darkMetal.add(arm, mat(x, 7.6, pz + 1.08, Math.PI / 2 - 0.12, 0, 0), 0x9a9c9e);
    const hx = x, hy = 7.75, hz = pz + 2.25;
    const head = new THREE.SphereGeometry(1, 16, 10);
    B.darkMetal.add(head, mat(hx, hy, hz, 0, 0, 0, 0.2, 0.11, 0.42), 0xa5a8aa);
    const lens = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    B.lens.add(lens, mat(hx, hy - 0.035, hz + 0.05, 0, 0, 0, 0.16, 0.07, 0.3), 0xffffff);
    heads.push(new V(hx, hy - 0.2, hz));
    W.colliders.push(new THREE.Box3(new V(x - 0.2, 0, pz - 0.2), new V(x + 0.2, 10, pz + 0.2)));
  });
  // overhead lines: 3 primaries on the crossarm/top + a communications cable lower
  const wires = (ya, yb, dz, sag, rad) => {
    for (let i = 0; i < xs.length - 1; i++) {
      const a = new V(xs[i], ya, pz + dz), b = new V(xs[i + 1], yb, pz + dz);
      W.B.wire.add(catenary(a, b, sag, rad), null, 0xffffff);
    }
  };
  wires(9.55, 9.55, -1.0, 0.55, 0.011); wires(9.55, 9.55, 1.0, 0.55, 0.011); wires(10.08, 10.08, 0, 0.5, 0.011);
  wires(6.9, 6.9, 0.16, 0.75, 0.022);
  // service drop to the house east gable (owner's video shows the cable on that side)
  const near = xs.reduce((best, x) => (Math.abs(x - 9) < Math.abs(best - 9) ? x : best), xs[0]);
  const hole = holeRect(W.plan);
  W.B.wire.add(catenary(new V(near, 8.6, pz), new V(hole.x1 + 0.03, 3.95, 5.4), 0.45, 0.014), null, 0xffffff);
  W.B.wire.add(catenary(new V(near, 6.85, pz + 0.16), new V(hole.x1 + 0.03, 3.55, 5.0), 0.5, 0.01), null, 0xffffff);
  W.B.darkMetal.add(boxGeo(0.06, 0.12, 0.06), mat(hole.x1 + 0.03, 3.95, 5.4), 0x222222);
  // point lights for the three heads nearest our house (high quality only)
  W.streetLights = [];
  if (W.hi) {
    const sorted = heads.slice().sort((a, b) => Math.abs(a.x - 4.5) - Math.abs(b.x - 4.5)).slice(0, 3);
    for (const p of sorted) {
      const L = new THREE.PointLight(0xffd29a, 0, 32, 2);
      L.position.copy(p); L.castShadow = false;
      tag(L); W.root.add(L); W.streetLights.push(L);
    }
  }
}
function catenary(a, b, sag, rad) {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 24, rad, 4, false);
}

// ---------------------------------------------------------------- signs
export function buildSigns(W) {
  const { B } = W;
  const sb = streetBand(W.plan);
  const blade = (rect, x, y, z, ry) => {
    for (const flip of [0, Math.PI]) {
      const pg = new THREE.PlaneGeometry(0.92, 0.18);
      const uv = pg.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const [u, v] = atlasUV(rect, uv.getX(i), uv.getY(i)); uv.setXY(i, u, v); }
      B.signs.add(pg, mat(x, y, z, 0, ry + flip, 0, 1, 1, 1, 'YXZ').multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.004)), 0xffffff);
    }
    B.darkMetal.add(boxGeo(0.94, 0.2, 0.006), mat(x, y, z, 0, ry, 0), 0x0d4f2b);
  };
  const stop = (x, z, ry) => {
    const post = cylGeo(0.03, 0.03, 2.75, 8);
    B.galv.add(post, mat(x, 1.32, z), 0xffffff);
    const og = new THREE.CircleGeometry(0.38, 8, Math.PI / 8);
    const uv = og.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const [u, v] = atlasUV(ATLAS.stop, uv.getX(i), uv.getY(i)); uv.setXY(i, u, v); }
    const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    B.signs.add(og, mat(x + front.x * 0.045, 2.1, z + front.z * 0.045, 0, ry, 0), 0xffffff);
    B.darkMetal.add(new THREE.CircleGeometry(0.38, 8, Math.PI / 8), mat(x + front.x * 0.04, 2.1, z + front.z * 0.04, 0, ry + Math.PI, 0), 0x9a9c9e);
    W.colliders.push(new THREE.Box3(new V(x - 0.1, 0, z - 0.1), new V(x + 0.1, 2.6, z + 0.1)));
  };
  for (const c of CROSS) {
    const rect = c.name === 'clime' ? ATLAS.clime : ATLAS.harris;
    // southbound traffic (moving +z) stops on the west side, north of Eakin; sign faces -z
    const xA = c.x - c.half - 0.7, zA = sb.z0 - 0.8;
    stop(xA, zA, Math.PI);
    blade(ATLAS.eakin, xA, 2.78, zA, 0);
    blade(rect, xA, 2.98, zA, Math.PI / 2);
    B.galv.add(cylGeo(0.03, 0.03, 0.5, 8), mat(xA, 2.85, zA), 0xffffff);
    // northbound traffic stops on the east side, south of Eakin; sign faces +z
    const xB = c.x + c.half + 0.7, zB = sb.z1 + 0.8;
    stop(xB, zB, 0);
  }
}

// ---------------------------------------------------------------- vehicles
function sedanShapes(suv) {
  const body = new THREE.Shape(), cab = new THREE.Shape();
  if (!suv) {
    body.moveTo(-2.3, 0.3); body.lineTo(-1.82, 0.3);
    body.absarc(-1.42, 0.3, 0.4, Math.PI, 0, true);
    body.lineTo(1.0, 0.3); body.absarc(1.4, 0.3, 0.4, Math.PI, 0, true);
    body.lineTo(2.3, 0.3); body.quadraticCurveTo(2.42, 0.32, 2.42, 0.55); body.lineTo(2.36, 0.78);
    body.quadraticCurveTo(2.2, 0.87, 1.6, 0.9); body.lineTo(0.95, 0.94); body.lineTo(-1.55, 0.96);
    body.lineTo(-2.25, 0.93); body.quadraticCurveTo(-2.42, 0.9, -2.42, 0.6); body.lineTo(-2.38, 0.34); body.lineTo(-2.3, 0.3);
    cab.moveTo(0.98, 0.9); cab.lineTo(0.15, 1.38); cab.lineTo(-0.98, 1.4); cab.lineTo(-1.65, 0.92); cab.lineTo(0.98, 0.9);
    return { body, cab, len: 4.84, wheelX: [-1.42, 1.4], wheelR: 0.33, roof: [-0.98, 0.15, 1.4], width: 1.82 };
  }
  body.moveTo(-2.35, 0.38); body.lineTo(-1.96, 0.38);
  body.absarc(-1.5, 0.38, 0.46, Math.PI, 0, true);
  body.lineTo(1.04, 0.38); body.absarc(1.5, 0.38, 0.46, Math.PI, 0, true);
  body.lineTo(2.3, 0.38); body.quadraticCurveTo(2.46, 0.4, 2.46, 0.7); body.lineTo(2.41, 0.98);
  body.quadraticCurveTo(2.2, 1.07, 1.5, 1.08); body.lineTo(0.9, 1.1); body.lineTo(-2.3, 1.12);
  body.lineTo(-2.42, 0.96); body.lineTo(-2.44, 0.5); body.lineTo(-2.35, 0.38);
  cab.moveTo(0.92, 1.06); cab.lineTo(0.1, 1.72); cab.lineTo(-2.12, 1.75); cab.lineTo(-2.3, 1.08); cab.lineTo(0.92, 1.06);
  return { body, cab, len: 4.9, wheelX: [-1.5, 1.5], wheelR: 0.37, roof: [-2.12, 0.1, 1.75], width: 1.92 };
}
function addCar(W, x, z, ry, color, suv) {
  const { B } = W;
  const S = sedanShapes(suv);
  const wd = S.width;
  const H = mat(x, 0, z, 0, ry, 0);
  const put = (bucket, geo, M, col) => bucket.add(geo, M ? new THREE.Matrix4().multiplyMatrices(H, M) : H.clone(), col);
  const bodyG = new THREE.ExtrudeGeometry(S.body, { depth: wd - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 14 });
  bodyG.translate(0, 0, -(wd - 0.12) / 2);
  put(B.carPaint, bodyG, null, color);
  const cabG = new THREE.ExtrudeGeometry(S.cab, { depth: wd - 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 4 });
  cabG.translate(0, 0, -(wd - 0.3) / 2);
  put(B.carGlass, cabG, null, 0xffffff);
  // roof skin + pillars in body colour
  const [rx0, rx1, ry0] = S.roof;
  put(B.carPaint, new RoundedBoxGeometry(rx1 - rx0 + 0.06, 0.05, wd - 0.26, 2, 0.02), mat((rx0 + rx1) / 2, ry0 + 0.035, 0), color);
  const pil = (ax, ay, bx, by) => {
    const L = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
    for (const sz of [1, -1]) put(B.carPaint, boxGeo(L, 0.07, 0.05), mat((ax + bx) / 2, (ay + by) / 2, sz * (wd / 2 - 0.1), 0, 0, ang), color);
  };
  const c = S.cab.getPoints(1);
  if (c.length >= 4) { pil(c[0].x, c[0].y, c[1].x, c[1].y); pil(c[2].x, c[2].y, c[3].x, c[3].y); }
  for (const sz of [1, -1]) put(B.carPaint, boxGeo(0.08, (suv ? 0.62 : 0.45), 0.05), mat(suv ? -0.75 : -0.38, (suv ? 1.4 : 1.15), sz * (wd / 2 - 0.1)), color);
  // mirrors, lights, grille, plate, bumpers
  for (const sz of [1, -1]) put(B.carPaint, boxGeo(0.12, 0.1, 0.16), mat(suv ? 0.78 : 0.82, suv ? 1.16 : 0.99, sz * (wd / 2 + 0.06)), color);
  const front = suv ? 2.46 : 2.43, back = suv ? -2.46 : -2.39;
  const ly = suv ? 0.86 : 0.66;
  for (const sz of [1, -1]) {
    put(B.carLights, boxGeo(0.08, 0.13, 0.36), mat(front, ly, sz * (wd / 2 - 0.3)), 0xf4f3ee);
    put(B.carLights, boxGeo(0.08, 0.13, 0.4), mat(back, ly + 0.08, sz * (wd / 2 - 0.3)), 0x9a1010);
  }
  put(B.carLights, boxGeo(0.06, 0.16, 0.7), mat(front, ly - 0.06, 0), 0x161616);
  put(B.carLights, boxGeo(0.03, 0.12, 0.33), mat(back - 0.04, ly - 0.15, 0), 0xe8e8e0);
  put(B.tire, boxGeo(0.14, 0.14, wd - 0.04), mat(front - 0.03, suv ? 0.5 : 0.36, 0), 0xffffff);
  put(B.tire, boxGeo(0.14, 0.14, wd - 0.04), mat(back + 0.03, suv ? 0.5 : 0.36, 0), 0xffffff);
  // wheels
  for (const wx of S.wheelX) for (const sz of [1, -1]) {
    const zc = sz * (wd / 2 - 0.13);
    put(B.tire, new THREE.CylinderGeometry(S.wheelR, S.wheelR, 0.23, 20), mat(wx, S.wheelR, zc, Math.PI / 2, 0, 0), 0xffffff);
    put(B.chrome, new THREE.CylinderGeometry(S.wheelR * 0.62, S.wheelR * 0.62, 0.24, 16), mat(wx, S.wheelR, zc, Math.PI / 2, 0, 0), 0xdedede);
    put(B.chrome, new THREE.CylinderGeometry(S.wheelR * 0.18, S.wheelR * 0.18, 0.25, 8), mat(wx, S.wheelR, zc, Math.PI / 2, 0, 0), 0x888888);
  }
  // collider (world AABB of the rotated footprint)
  const box = new THREE.Box3(new V(-S.len / 2, 0, -wd / 2 - 0.1), new V(S.len / 2, suv ? 1.8 : 1.45, wd / 2 + 0.1));
  box.applyMatrix4(H);
  W.colliders.push(box);
  W.excl.push([box.min.x, box.min.z, box.max.x, box.max.z]);
}
function addBoxTruck(W, x, z, ry) {
  const { B } = W;
  const H = mat(x, 0, z, 0, ry, 0);
  const put = (bucket, geo, M, col) => bucket.add(geo, new THREE.Matrix4().multiplyMatrices(H, M), col);
  const white = 0xf3f3f1, wd = 2.05;
  // cab (front toward +x local)
  put(B.carPaint, new RoundedBoxGeometry(1.5, 1.25, wd, 3, 0.1), mat(2.05, 1.45, 0), white);
  put(B.carPaint, new RoundedBoxGeometry(0.95, 0.75, wd - 0.05, 3, 0.1), mat(3.15, 1.15, 0), white); // hood
  put(B.carGlass, boxGeo(0.06, 0.62, wd - 0.25), mat(2.78, 1.78, 0, 0, 0, 0.32), 0xffffff);
  for (const sz of [1, -1]) put(B.carGlass, boxGeo(0.9, 0.55, 0.04), mat(2.15, 1.75, sz * (wd / 2 + 0.005)), 0xffffff);
  put(B.chrome, boxGeo(0.08, 0.5, 1.5), mat(3.63, 1.05, 0), 0xc8c8c8); // grille
  put(B.carLights, boxGeo(0.08, 0.18, 0.4), mat(3.63, 1.25, 0.72), 0xf4f3ee);
  put(B.carLights, boxGeo(0.08, 0.18, 0.4), mat(3.63, 1.25, -0.72), 0xf4f3ee);
  put(B.tire, boxGeo(0.2, 0.22, wd + 0.05), mat(3.66, 0.62, 0), 0xffffff); // bumper
  for (const sz of [1, -1]) put(B.carPaint, boxGeo(0.06, 0.32, 0.2), mat(2.6, 1.95, sz * (wd / 2 + 0.2)), 0x222222); // mirrors
  // chassis + cargo box
  put(B.tire, boxGeo(6.6, 0.25, 1.0), mat(0.3, 0.72, 0), 0xffffff);
  put(B.carPaint, new RoundedBoxGeometry(4.5, 2.45, 2.32, 2, 0.05), mat(-1.15, 2.08, 0), 0xf6f6f4);
  put(B.paint, boxGeo(4.52, 0.08, 2.34), mat(-1.15, 0.89, 0), 0x8c8c8c);
  put(B.paint, boxGeo(0.04, 2.3, 2.2), mat(-3.42, 2.08, 0), 0xdedede); // roll-up door face
  for (let k = 1; k < 9; k++) put(B.paint, boxGeo(0.05, 0.02, 2.2), mat(-3.43, 0.9 + k * 0.26, 0), 0xb8b8b8);
  put(B.carLights, boxGeo(0.05, 0.12, 0.25), mat(-3.43, 0.98, 0.95), 0x9a1010);
  put(B.carLights, boxGeo(0.05, 0.12, 0.25), mat(-3.43, 0.98, -0.95), 0x9a1010);
  // wheels: front single, rear dual
  const R = 0.43;
  for (const sz of [1, -1]) {
    put(B.tire, new THREE.CylinderGeometry(R, R, 0.26, 20), mat(2.85, R, sz * 0.88, Math.PI / 2, 0, 0), 0xffffff);
    put(B.chrome, new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.27, 12), mat(2.85, R, sz * 0.88, Math.PI / 2, 0, 0), 0xcfcfcf);
    for (const dz of [0.0, 0.27]) {
      put(B.tire, new THREE.CylinderGeometry(R, R, 0.25, 20), mat(-1.6, R, sz * (0.75 + dz), Math.PI / 2, 0, 0), 0xffffff);
    }
    put(B.chrome, new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.26, 12), mat(-1.6, R, sz * 1.02, Math.PI / 2, 0, 0), 0xcfcfcf);
  }
  const box = new THREE.Box3(new V(-3.45, 0, -1.2), new V(3.7, 3.35, 1.2));
  box.applyMatrix4(H);
  W.colliders.push(box);
}
export function buildVehicles(W) {
  const sb = streetBand(W.plan);
  // white box truck parked across the street, like in the owner's video (front toward +x, south curb)
  addBoxTruck(W, 1.5, sb.z1 - 1.3, 0);
  addCar(W, -26, sb.z1 - 1.15, 0, 0x1f3552, false);   // dark blue sedan, south curb
  addCar(W, 37, sb.z0 + 1.15, Math.PI, 0xe9e9e6, true); // white SUV, north curb heading -x
  // a silver sedan in a neighbour's driveway (closest one with room)
  const dws = W.driveways.filter((d) => Math.abs(d.z1 - d.z0) > 9).sort((a, b) => Math.abs(a.x - 4.5) - Math.abs(b.x - 4.5));
  if (dws.length) {
    const d = dws[0];
    const zc = d.side === 'N' ? d.z0 + 3.2 : d.z1 - 3.2;
    addCar(W, d.x, zc, d.side === 'N' ? -Math.PI / 2 : Math.PI / 2, 0xa9adb2, false);
  }
  if (dws.length > 3) {
    const d = dws[3];
    const zc = d.side === 'N' ? d.z0 + 3.4 : d.z1 - 3.4;
    addCar(W, d.x, zc, d.side === 'N' ? -Math.PI / 2 : Math.PI / 2, 0x5a1a1f, true);
  }
}
