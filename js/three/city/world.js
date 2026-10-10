// City Drive — the streamed world: chunk meshes (ground / buildings / props / signs = 4 draw calls a chunk), global
// instanced pools for everything that can be knocked over (lamps, bins, traffic lights, fences), sky, lake, the site
// massing, time of day, and the static collision queries. No scene lights are added per lamp: night is emissive.
import * as THREE from 'three';
import { ROAD, CHUNK, hash2, inPoly } from './map.js?v=3.13';
import { Geo, HEX, createMaterials, createSignAtlas } from './geo.js?v=3.13';
import { genBlock, genEdge, genNode, obbCorners, poiSign, SHOPS } from './gen.js?v=3.13';
import { buildLandmarks } from './landmarks.js?v=3.13';

const TIMES = {
  day: { top: '#3f7fd0', hor: '#c9dcec', fog: '#bfd2e2', near: 160, far: 560, hemi: ['#dfeaf6', '#6a6f66', 1.15], sun: ['#fff4de', 2.3, [0.5, 0.8, 0.3]], night: 0, lit: 0.0, exp: 0.95 },
  dusk: { top: '#1f2c63', hor: '#e8935f', fog: '#8b7480', near: 130, far: 520, hemi: ['#a9a4c4', '#4a4350', 0.75], sun: ['#ffb37a', 1.1, [-0.75, 0.25, 0.4]], night: 0.55, lit: 0.32, exp: 1.0 },
  night: { top: '#04060f', hor: '#141c33', fog: '#0c1120', near: 90, far: 470, hemi: ['#5a6890', '#1d1f2a', 0.42], sun: ['#8fa2d8', 0.22, [0.3, 0.7, -0.5]], night: 1, lit: 0.5, exp: 1.12 },
};
const LOAD_R = 560, DROP_R = 720;

export function createWorld(map, scene, { renderer = null, mode = 'day' } = {}) {
  const M = createMaterials(), group = new THREE.Group(); group.name = 'city-world'; scene.add(group);
  // ---- sign atlas
  const texts = [];
  for (const s of SHOPS) texts.push({ kind: 'shop', text: s });
  for (const p of map.pois) if (p.kind !== 'home') texts.push({ kind: p.kind === 'metro' ? 'metro' : 'poi', text: p.kind === 'metro' || p.kind === 'bus' ? p.name : poiSign(p) });
  texts.push({ kind: 'poi', text: 'VILNYI RIVER CITY' }, { kind: 'poi', text: 'P  GARAJ' });
  for (const n of new Set(map.edges.filter(e => !e.dead).map(e => e.name))) texts.push({ kind: 'street', text: n });
  const atlas = createSignAtlas(texts); M.sign.map = atlas.tex;
  // ---- sky dome + sun, ground plane, lake, distant skyline
  const skyU = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color() }, uNight: M.U.uNight };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 20, 10), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uTop, uHor, uSun, uSunC; uniform float uNight;
      float h(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
      void main(){ vec3 d = normalize(vD); float t = pow(clamp(d.y, 0.0, 1.0), 0.55); vec3 c = mix(uHor, uTop, t);
        float s = max(dot(d, normalize(uSun)), 0.0); c += uSunC * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.25);
        vec2 sg = d.xz / max(0.15, d.y + 0.3) * 260.0, gi = floor(sg); float st = step(0.9975, h(gi)) * smoothstep(0.45, 0.1, length(fract(sg) - 0.5)) * smoothstep(0.7, 1.0, uNight) * smoothstep(0.05, 0.3, d.y); c += vec3(st) * 0.9;
        if (d.y < 0.0) c = mix(uHor, uHor * 0.6, clamp(-d.y * 4.0, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  sky.renderOrder = -10; sky.frustumCulled = false; group.add(sky);
  const groundG = new Geo(true); groundG.attr(3, 0, 0, 0).col(0.5, 0.5, 0.5).poly([[-2600, -2600], [2600, -2600], [2600, 2600], [-2600, 2600]], -0.04);
  const ground = new THREE.Mesh(groundG.build(), M.groundBase); ground.frustumCulled = false; group.add(ground);
  { const g = new Geo(true); g.attr(5, 0, 0, 0).col(1, 1, 1);
    const sh = new THREE.Shape(map.lake.map(([x, z]) => new THREE.Vector2(x, z))), sg = new THREE.ShapeGeometry(sh), p = sg.attributes.position, ix = sg.index.array;
    for (let i = 0; i < ix.length; i += 3) { const q = [ix[i], ix[i + 2], ix[i + 1]].map(k => [p.getX(k), p.getY(k)]); let ar = 0; for (let k = 0; k < 3; k++) ar += q[k][0] * q[(k + 1) % 3][1] - q[(k + 1) % 3][0] * q[k][1]; g.poly(q, 0.02); }
    sg.dispose();
    g.attr(3, 0, 0, 0).col(0.5, 0.5, 0.5); const isl = []; for (let k = 0; k < 20; k++) isl.push([map.island.c[0] + Math.cos(k / 20 * 6.283) * map.island.r, map.island.c[1] + Math.sin(k / 20 * 6.283) * map.island.r]); g.poly(isl, 0.25);
    const lake = new THREE.Mesh(g.build(), M.ground); lake.name = 'city-lake'; group.add(lake); }
  // skyline ring: a band of far silhouettes that follows the camera just inside the fog
  const skyline = (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d'); let s = 77; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.clearRect(0, 0, 1024, 64); g.fillStyle = '#fff';
    for (let x = 0; x < 1024;) { const w = 6 + r() * 16, h = 8 + r() * r() * 50; g.fillRect(x, 64 - h, w, h); x += w + (r() < 0.3 ? r() * 10 : 0); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(640, 640, 70, 40, 1, true), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: true }));
    m.position.y = 34; m.renderOrder = -9; m.frustumCulled = false; group.add(m); return m;
  })();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1), sun = new THREE.DirectionalLight(0xffffff, 1); group.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0xffffff, 100, 500);
  let T = TIMES.day, timeMode = 'day';
  function setTime(m) {
    timeMode = TIMES[m] ? m : 'day'; T = TIMES[timeMode];
    skyU.uTop.value.set(T.top); skyU.uHor.value.set(T.hor); skyU.uSun.value.set(...T.sun[2]).normalize(); skyU.uSunC.value.set(T.sun[0]).multiplyScalar(T.night > 0.9 ? 0.5 : 1);
    scene.fog.color.set(T.fog); scene.fog.near = T.near; scene.fog.far = T.far; scene.background = null;
    hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2];
    sun.color.set(T.sun[0]); sun.intensity = T.sun[1];
    M.U.uNight.value = T.night; M.U.uLit.value = T.lit;
    skyline.material.color.set(T.fog).multiplyScalar(T.night > 0.9 ? 1.5 : 0.72);
    M.sign.color.setScalar(T.night > 0.9 ? 1.0 : T.night > 0.3 ? 0.9 : 0.82);
    if (renderer) renderer.toneMappingExposure = T.exp;
    glow.visible = pool.visible = T.night > 0.3; glow.material.opacity = T.night > 0.9 ? 1 : 0.7;
    dirtyPools = true;
  }
  // ---- the site: VILNYI RIVER CITY and its neighbours as massing, the plot, the garage ramp portal
  { const g = new Geo(true), S = map.site;
    for (const b of S.boxes) { const vrc = b.tag === 'C3' || b.tag === 'C4'; g.attr(vrc ? 6 : 0, vrc ? 2 : 7, 0, 3.0).col(vrc ? '#efece4' : b.tag === 'ctxD' ? '#5d5f63' : '#cdbd9f'); g.box(b.x, b.z, b.ux, b.uz, b.hw, b.hd, 0, b.h, false); g.attr(4, 0, 0, 3).col('#4a4c50'); const c = obbCorners(b); g.quad([c[0][0], b.h, c[0][1]], [c[3][0], b.h, c[3][1]], [c[2][0], b.h, c[2][1]], [c[1][0], b.h, c[1][1]], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]); }
    const R = S.garage.ramp;   // ramp mouth: side walls, roof slab, dark opening
    g.attr(4, 0, 0, 3).col('#9a9a96'); for (const sd of [-1, 1]) g.box(R.x + R.ux * sd * (R.hw + 0.2), R.z + R.uz * sd * (R.hw + 0.2), R.ux, R.uz, 0.2, R.hd, 0, 3.1, true);
    g.box(R.x, R.z, R.ux, R.uz, R.hw + 0.4, R.hd, 2.7, 3.1, true); g.col('#0a0b0d'); g.box(R.x - R.uz * 1.0, R.z + R.ux * 1.0, R.ux, R.uz, R.hw, R.hd - 1.0, 0, 2.7, false);
    const m = new THREE.Mesh(g.build(), M.bld); m.name = 'city-site'; group.add(m);
    const gg = new Geo(true); gg.attr(4, 0, 0, 0).col('#8f8b82').poly(S.plot, 0.01); const m2 = new THREE.Mesh(gg.build(), M.ground); group.add(m2);
    // signs: the name over the ramp, "P GARAJ"
    const sg = new Geo(); const sx = R.x + R.uz * (R.hd + 0.05), sz = R.z - R.ux * (R.hd + 0.05);
    signQuad(sg, sx, 3.5, sz, R.uz, -R.ux, 4.4, 0.55, atlas.uv(atlas.index('poi', 'VILNYI RIVER CITY')));
    const sm = new THREE.Mesh(sg.build(), M.sign); group.add(sm); }
  // landmarks of the real map (Palace of the Parliament, Arcul de Triumf): built once, seen from afar
  const LM = buildLandmarks(map, M); group.add(LM.group);
  function signQuad(g, x, y, z, nx, nz, w, h, uv) {
    const tx = nz, tz = -nx; g.col(1, 1, 1);   // left → right as read by someone facing the sign
    g.quad([x - tx * w / 2, y - h / 2, z - tz * w / 2], [x + tx * w / 2, y - h / 2, z + tz * w / 2], [x + tx * w / 2, y + h / 2, z + tz * w / 2], [x - tx * w / 2, y + h / 2, z - tz * w / 2], [nx, 0, nz], [uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]);
  }
  // ---- chunk building
  const loaded = new Map(), queue = [], listeners = { load: [], drop: [] };
  const TREES = ['#4f8a3c', '#5c9a44', '#467c3a', '#6aa548', '#538f40'];
  function buildGround(ch) {
    const g = new Geo(true);
    for (const e of ch.edges) {
      const a = map.nodes[e.a], b = map.nodes[e.b], rx = -e.uz, rz = e.ux, C = ROAD[e.cls];
      const P = (t, lat, y = 0) => [a.x + e.ux * t + rx * lat, y, a.z + e.uz * t + rz * lat];
      const seg = (t0, t1, id, p1, p2, p3, uvf) => { g.attr(id, p1, p2, p3); g.col(0.5, 0.5, 0.5); g.quad(P(t0, -e.hw), P(t0, e.hw), P(t1, e.hw), P(t1, -e.hw), [0, 1, 0], uvf(t0, -e.hw), uvf(t0, e.hw), uvf(t1, e.hw), uvf(t1, -e.hw)); };
      let t0 = e.ta, t1 = e.len - e.tb; const road = (t, l) => [t, l];
      const za = e.cls >= 1 && !e.drive && (a.arms || []).length >= 3 && t1 - t0 > 30, zb = e.cls >= 1 && !e.drive && (b.arms || []).length >= 3 && t1 - t0 > 30;
      if (za) { seg(t0, t0 + 3.6, 1, 0, 0, 0, (t, l) => [l, t - t0]); t0 += 3.6; }
      if (zb) { seg(t1 - 3.6, t1, 1, 0, 0, 0, (t, l) => [l, t1 - t]); t1 -= 3.6; }
      seg(t0, t1, 0, e.drive ? 0 : e.ow ? (e.rab ? 4 : 6) : e.cls, e.hw, e.ow ? e.lanes : e.tram ? 1 : 0, road);
      e.za = za; e.zb = zb;
    }
    // the Dâmbovița in its walled channel (real map): water just under the road decks, quay paving on both banks
    for (const [p, q, pp, qn] of map.riverByChunk.get(ch.key) || []) {
      const W = map.riverHW, ofs = (P0, P1, Pn, d) => { const ax = P1[0] - P0[0], az = P1[1] - P0[1], La = Math.hypot(ax, az) || 1, bx = Pn ? Pn[0] - P1[0] : ax, bz = Pn ? Pn[1] - P1[1] : az, Lb = Math.hypot(bx, bz) || 1, nx = -(az / La + bz / Lb), nz = ax / La + bx / Lb, L = Math.hypot(nx, nz) || 1; return [P1[0] + nx / L * d, P1[1] + nz / L * d]; };
      const a0 = ofs(pp || [2 * p[0] - q[0], 2 * p[1] - q[1]], p, q, -(W - 3)), a1 = ofs(pp || [2 * p[0] - q[0], 2 * p[1] - q[1]], p, q, W - 3), b0 = ofs(p, q, qn, -(W - 3)), b1 = ofs(p, q, qn, W - 3);
      g.attr(5, 0, 0, 0).col(1, 1, 1).poly([a0, b0, b1, a1], -0.02);
      const c0 = ofs(pp || [2 * p[0] - q[0], 2 * p[1] - q[1]], p, q, -W), c1 = ofs(pp || [2 * p[0] - q[0], 2 * p[1] - q[1]], p, q, W), d0 = ofs(p, q, qn, -W), d1 = ofs(p, q, qn, W);
      g.attr(2, 0, 0, 0).col('#a7a197').poly([c0, d0, b0, a0], 0.1); g.poly([a1, b1, d1, c1], 0.1);
      g.attr(4, 0, 0, 0).col('#8d8a83'); g.wall(a0, b0, -0.02, 0.1); g.wall(b1, a1, -0.02, 0.1);
    }
    for (const n of ch.nodes) {
      const pts = [];
      for (const id of n.arms || []) { const e = map.edges[id], out = e.a === n.id ? 1 : -1, dx = e.ux * out, dz = e.uz * out, t = out > 0 ? e.ta : e.tb; for (const s of [-1, 1]) { const x = n.x + dx * t - dz * s * e.hw, z = n.z + dz * t + dx * s * e.hw; pts.push([x, z, Math.atan2(z - n.z, x - n.x)]); } }
      if (pts.length < 3) continue; pts.sort((p, q) => p[2] - q[2]);
      g.attr(0, 4, 0, 0).col(0.5, 0.5, 0.5);
      for (let k = 0; k < pts.length; k++) g.poly([[n.x, n.z], pts[k], pts[(k + 1) % pts.length]], 0);
    }
    const tops = [];
    for (const b of ch.blocks) {
      const G = genBlock(map, b), K = b.kerb, I = b.inner;
      // pavement ring between kerb and building line, then the block's own surface inside it (no overlapping layers)
      g.attr(2, 0, 0, 0).col('#9c978c'); for (let k = 0; k < 4; k++) g.poly([K[k], K[(k + 1) % 4], I[(k + 1) % 4], I[k]], 0.14);
      g.attr(4, 0, 0, 0).col('#77746d'); for (let k = 0; k < 4; k++) { const p = K[k], q = K[(k + 1) % 4], mx = (p[0] + q[0]) / 2 - b.cx, mz = (p[1] + q[1]) / 2 - b.cz, L = Math.hypot(mx, mz) || 1; g.wall(p, q, 0, 0.14, 0, [mx / L, mz / L]); }
      const full = G.ground.find(q => q.poly === I);
      if (full) g.attr(full.surf, 5, 6, 0).col(full.col).poly(I, 0.14);
      else if (b.zone === 'blocks' || b.zone === 'villas') g.attr(3, 0, 0, 0).col(0.5, 0.5, 0.5).poly(I, 0.14);
      else if (b.zone === 'offices') g.attr(4, 0, 0, 0).col('#8c8a84').poly(I, 0.14);
      else g.attr(2, 0, 0, 0).col('#9c978c').poly(I, 0.14);
      for (const q of G.ground) if (q !== full) tops.push(q);
    }
    // tram tracks that run outside a boulevard median (real map): two rails on a sleeper bed
    for (const [p, q] of map.tramByChunk.get(ch.key) || []) {
      const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz); if (L < 0.5) continue; const rx = -dz / L * 1.25, rz = dx / L * 1.25;
      tops.push({ poly: [[p[0] - rx, p[1] - rz], [q[0] - rx, q[1] - rz], [q[0] + rx, q[1] + rz], [p[0] + rx, p[1] + rz]], surf: 0, cls: 7, col: '#808080', y: -0.12, uvr: [p, dx / L, dz / L] });
    }
    const n0 = g.i.length;
    for (const q of tops) { if (q.uvr) { const [o, ux, uz] = q.uvr, base = g.p.length / 3; g.attr(q.surf, q.cls ?? 5, 1.25, 0).col(q.col); g.poly(q.poly, 0.16 + (q.y || 0)); for (let k = base; k < g.p.length / 3; k++) { const x = g.p[k * 3] - o[0], z = g.p[k * 3 + 2] - o[1]; g.u[k * 2] = x * ux + z * uz; g.u[k * 2 + 1] = -x * uz + z * ux; } continue; } g.attr(q.surf, q.cls ?? 5, 6, 0).col(q.col); g.poly(q.poly, 0.16 + (q.y || 0)); }
    if (!g.count) return null;
    const geo = g.build(); geo.addGroup(0, n0, 0); if (g.i.length > n0) geo.addGroup(n0, g.i.length - n0, 1);
    return new THREE.Mesh(geo, [M.ground, M.groundTop]);
  }
  function buildBuildings(ch) {
    const g = new Geo(true);
    for (const b of ch.blocks) for (const B of genBlock(map, b).bld) {
      g.col(B.col).attr(B.st, B.seed, 0, B.fh);
      const c = g.box(B.x, B.z, B.ux, B.uz, B.hw, B.hd, 0, B.h, false, B.shop ? B.front : -1, [B.st, B.seed, 1, Math.max(B.fh, 3.4)]);
      if (B.roof === 1) {   // gable roof along the long axis
        const long = B.hw >= B.hd, rh = Math.min(B.hw, B.hd) * 0.62, e = 0.5;
        const ax = long ? [B.ux, B.uz] : [-B.uz, B.ux], bx = long ? [-B.uz, B.ux] : [B.ux, B.uz], hl = (long ? B.hw : B.hd) + e, hs = (long ? B.hd : B.hw) + e;
        const pt = (u, v, y) => [B.x + ax[0] * u + bx[0] * v, y, B.z + ax[1] * u + bx[1] * v];
        g.col(B.roofCol).attr(4, 0, 0, 3);
        g.quad(pt(-hl, hs, B.h), pt(hl, hs, B.h), pt(hl, 0, B.h + rh), pt(-hl, 0, B.h + rh), [bx[0] * 0.6, 0.8, bx[1] * 0.6], [0, 0], [1, 0], [1, 1], [0, 1]);
        g.quad(pt(hl, -hs, B.h), pt(-hl, -hs, B.h), pt(-hl, 0, B.h + rh), pt(hl, 0, B.h + rh), [-bx[0] * 0.6, 0.8, -bx[1] * 0.6], [0, 0], [1, 0], [1, 1], [0, 1]);
        g.col(B.col); for (const s of [-1, 1]) g.quad(pt(s * (hl - e), -s * hs, B.h), pt(s * (hl - e), s * hs, B.h), pt(s * (hl - e), 0, B.h + rh), pt(s * (hl - e), 0, B.h + rh), [ax[0] * s, 0, ax[1] * s], [0, 0], [1, 0], [0.5, 1], [0.5, 1]);
      } else { g.col('#55575b').attr(4, 0, 0, 3); g.quad([c[0][0], B.h, c[0][1]], [c[3][0], B.h, c[3][1]], [c[2][0], B.h, c[2][1]], [c[1][0], B.h, c[1][1]], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
        if (B.st === 0 || B.st === 2) { g.col('#6a6c70'); g.box(B.x, B.z, B.ux, B.uz, Math.min(3, B.hw * 0.3), Math.min(2.5, B.hd * 0.4), B.h, B.h + 2.2, true); } }
    }
    return g.count ? new THREE.Mesh(g.build(), M.bld) : null;
  }
  const obox = (g, x, y, z, a, sx, sy, sz) => g.box(x, z, Math.cos(a), -Math.sin(a), sx / 2, sz / 2, y, y + sy, true);
  function buildProps(ch) {
    const g = new Geo(), sg = new Geo(), circles = [];
    const tree = ([x, z, s], y0 = 0.15) => { g.col('#4a3a2c'); g.cyl(x, y0, z, 0.16 * s, 0.11 * s, 2.6 * s, 5); g.col(TREES[Math.floor(hash2(x | 0, z | 0) * TREES.length)]); g.blob(x, y0 + 4.4 * s, z, 2.0 * s, 2.1 * s, 6); g.blob(x + 0.7 * s, y0 + 5.7 * s, z - 0.4 * s, 1.35 * s, 1.3 * s, 5); circles.push({ x, z, r: 0.28, k: 'tree' }); };
    const sign = (s, y = s.y) => { const i = atlas.index(s.kind, s.text); if (i < 0) return; signQuad(sg, s.x, y, s.z, s.nx, s.nz, s.w, s.h, atlas.uv(i)); if (s.post) { g.col('#3a3d42'); for (const d of [-0.42, 0.42]) g.cyl(s.x - s.nz * s.w * d, 0.15, s.z + s.nx * s.w * d, 0.06, 0.06, y, 4); signQuad(sg, s.x - s.nx * 0.02, y, s.z - s.nz * 0.02, -s.nx, -s.nz, s.w, s.h, atlas.uv(i)); } };
    for (const b of ch.blocks) {
      const G = genBlock(map, b);
      G.tree.forEach(t => tree(t, 0.17)); G.signs.forEach(s => sign(s));
      for (const [x, z, a] of G.bench) { g.col('#5a4630'); obox(g, x, 0.5, z, a, 1.7, 0.08, 0.45); obox(g, x - Math.sin(a) * 0.2, 0.58, z - Math.cos(a) * 0.2, a, 1.7, 0.45, 0.06); g.col('#2c2f33'); obox(g, x, 0.17, z, a, 1.5, 0.33, 0.08); circles.push({ x, z, r: 0.7, k: 'solid' }); }
      for (const [x, z, par] of G.table) { g.col('#2c2f33'); g.cyl(x, 0.14, z, 0.05, 0.05, 0.72, 4); g.col('#d9d2c4'); g.cyl(x, 0.86, z, 0.42, 0.42, 0.04, 6); g.poly([0, 1, 2, 3, 4, 5].map(k => [x + Math.cos(k * 1.047) * 0.42, z + Math.sin(k * 1.047) * 0.42]), 0.9);
        if (par) { g.col('#2c2f33'); g.cyl(x + 0.02, 0.9, z, 0.025, 0.025, 1.5, 4); g.col(['#b23b2e', '#e2c078', '#2f6f5a', '#e8e2d2'][Math.floor(hash2(x | 0, z | 0) * 4)]); g.cyl(x, 2.25, z, 1.35, 0.05, 0.5, 6); }
        circles.push({ x, z, r: 0.5, k: 'solid' }); }
      for (const st of G.seats) { if (st.bench) continue; const a = st.a, bx = -Math.sin(a) * 0.2, bz = -Math.cos(a) * 0.2; g.col('#3a2f26'); obox(g, st.x, 0.56, st.z, a, 0.42, 0.05, 0.42); obox(g, st.x + bx, 0.6, st.z + bz, a, 0.42, 0.42, 0.04); g.col('#2c2f33'); obox(g, st.x, 0.14, st.z, a, 0.36, 0.42, 0.04); }
      for (const [x, z, a, ci] of G.stall) { g.col('#7d6a52'); obox(g, x, 0.17, z, a, 3.4, 0.85, 1.5); g.col(['#b23b2e', '#2f6f5a', '#d9a531', '#2a5c9a', '#e8e2d2'][ci]); obox(g, x, 2.25, z, a, 3.8, 0.12, 2.2); g.col('#3a3d42'); for (const [u, v] of [[-1.7, -0.9], [1.7, -0.9], [-1.7, 0.9], [1.7, 0.9]]) g.cyl(x + Math.cos(a) * u + Math.sin(a) * v, 0.17, z - Math.sin(a) * u + Math.cos(a) * v, 0.04, 0.04, 2.1, 4);
        g.col(['#d9532e', '#e2b23a', '#6aa03a', '#c93a4a'][ci % 4]); obox(g, x, 1.02, z, a, 3.0, 0.16, 1.1); circles.push({ x, z, r: 1.5, k: 'solid' }); }
      for (const m of G.misc) {
        if (m.t === 'column') { g.col('#e6dfd0'); g.cyl(m.x, 0.17, m.z, 0.45, 0.4, m.h, 8); circles.push({ x: m.x, z: m.z, r: 0.5, k: 'solid' }); }
        else if (m.t === 'flag') { g.col('#b9bcc0'); g.cyl(m.x, 0.17, m.z, 0.05, 0.04, 8, 5); circles.push({ x: m.x, z: m.z, r: 0.15, k: 'solid' }); }
        else if (m.t === 'metro') {   // stair canopy with the M sign
          const a = m.a; g.col('#2c2f33'); for (const [u, v] of [[-2.4, -1], [2.4, -1], [-2.4, 1], [2.4, 1]]) g.cyl(m.x + Math.sin(a) * u + Math.cos(a) * v, 0.14, m.z + Math.cos(a) * u - Math.sin(a) * v, 0.06, 0.06, 2.6, 4);
          g.col('#7fa0b8'); g.box(m.x, m.z, Math.sin(a), Math.cos(a), 2.6, 1.15, 2.7, 2.82, true); g.col('#3d4046'); g.box(m.x, m.z, Math.sin(a), Math.cos(a), 2.4, 1.0, 0.14, 0.2, true);
          sign({ kind: 'metro', text: m.name, x: m.x + m.nx * 1.2, z: m.z + m.nz * 1.2, nx: m.nx, nz: m.nz, w: 3.4, h: 0.45, y: 3.15 }); sign({ kind: 'metro', text: m.name, x: m.x - m.nx * 1.2, z: m.z - m.nz * 1.2, nx: -m.nx, nz: -m.nz, w: 3.4, h: 0.45, y: 3.15 });
          circles.push({ x: m.x + Math.sin(a) * 2.2, z: m.z + Math.cos(a) * 2.2, r: 1.2, k: 'solid' }, { x: m.x - Math.sin(a) * 2.2, z: m.z - Math.cos(a) * 2.2, r: 1.2, k: 'solid' });
        } else if (m.t === 'busstop') shelter(g, sign, circles, m.x, m.z, m.a, m.nx, m.nz, m.name);
      }
    }
    for (const e of ch.edges) {
      if (e.bridge) { const a = map.nodes[e.a]; g.col('#b9b3a6'); for (const sd of [-1, 1]) { const o = e.hw + 0.5; const p0 = [a.x + e.ux * e.ta - e.uz * o * sd, a.z + e.uz * e.ta + e.ux * o * sd], p1 = [a.x + e.ux * (e.len - e.tb) - e.uz * o * sd, a.z + e.uz * (e.len - e.tb) + e.ux * o * sd]; g.wall(p0, p1, 0, 1.05, 0, [-e.uz * sd, e.ux * sd]); g.wall(p1, p0, 0, 1.05, 0, [e.uz * sd, -e.ux * sd]); } }
      const G = genEdge(map, e); G.tree.forEach(t => tree(t, 0.14));
      for (const s of G.stop) shelter(g, sign, circles, s.x, s.z, s.a, s.nx, s.nz, s.name);
      for (const [x, z, a] of G.pole) { g.col('#3d4046'); g.cyl(x, 0, z, 0.09, 0.07, 6.6, 5); obox(g, x, 6.2, z, a + Math.PI / 2, 5.6, 0.06, 0.06); circles.push({ x, z, r: 0.14, k: 'solid' }); }
    }
    for (const n of ch.nodes) for (const p of genNode(map, n).plate) {
      g.col('#3a3d42'); g.cyl(p.x, 0.14, p.z, 0.04, 0.04, 2.9, 4);
      const dx = Math.sin(p.a), dz = Math.cos(p.a);
      sign({ kind: 'street', text: p.t1, x: p.x + dx * 0.55, z: p.z + dz * 0.55, nx: -dz, nz: dx, w: 1.1, h: 0.2, y: 2.85, post: false }); sign({ kind: 'street', text: p.t1, x: p.x + dx * 0.55, z: p.z + dz * 0.55, nx: dz, nz: -dx, w: 1.1, h: 0.2, y: 2.85 });
      sign({ kind: 'street', text: p.t2, x: p.x - dz * 0.55, z: p.z + dx * 0.55, nx: dx, nz: dz, w: 1.1, h: 0.2, y: 2.62 }); sign({ kind: 'street', text: p.t2, x: p.x - dz * 0.55, z: p.z + dx * 0.55, nx: -dx, nz: -dz, w: 1.1, h: 0.2, y: 2.62 });
    }
    return { props: g.count ? new THREE.Mesh(g.build(), M.prop) : null, signs: sg.count ? new THREE.Mesh(sg.build(), M.sign) : null, circles };
  }
  function shelter(g, sign, circles, x, z, a, nx, nz, name) {
    const ux = Math.sin(a), uz = Math.cos(a);
    g.col('#2c2f33'); for (const u of [-1.9, 1.9]) g.cyl(x + ux * u - nx * 0.5, 0.14, z + uz * u - nz * 0.5, 0.05, 0.05, 2.4, 4);
    g.col('#6f8796'); g.box(x - nx * 0.55, z - nz * 0.55, ux, uz, 1.9, 0.03, 0.5, 2.3, false); g.col('#33373c'); g.box(x, z, ux, uz, 2.1, 0.8, 2.4, 2.5, true);
    g.col('#5a4630'); g.box(x - nx * 0.3, z - nz * 0.3, ux, uz, 1.4, 0.2, 0.55, 0.62, true);
    sign({ kind: 'street', text: name, x: x + nx * 0.82, z: z + nz * 0.82, nx, nz, w: 2.2, h: 0.3, y: 2.25 });
    circles.push({ x: x + ux * 1.2, z: z + uz * 1.2, r: 0.9, k: 'solid' }, { x: x - ux * 1.2, z: z - uz * 1.2, r: 0.9, k: 'solid' });
  }
  function collectPool(ch) {   // the breakable street furniture of this chunk (state lives on the items)
    if (ch.items) return ch.items;
    const it = [];
    for (const e of ch.edges) { const G = genEdge(map, e), a = map.nodes[e.a];
      for (const [x, z, , side] of G.lamp) { const t = (x - a.x) * e.ux + (z - a.z) * e.uz, cx = a.x + e.ux * t, cz = a.z + e.uz * t; it.push({ k: 'lamp', x, z, a: Math.atan2(cx - x, cz - z), r: 0.16, side, hit: 0 }); }
      for (const [x, z] of G.bin) it.push({ k: 'bin', x, z, a: 0, r: 0.3, hit: 0 }); }
    for (const b of ch.blocks) { const G = genBlock(map, b); for (const [x, z] of G.bin) it.push({ k: 'bin', x, z, a: 0, r: 0.3, hit: 0 }); for (const [x, z, a] of G.fence) it.push({ k: 'fence', x, z, a, r: 1.3, hit: 0 }); }
    for (const n of ch.nodes) for (const t of genNode(map, n).tl) it.push({ k: 'tl', x: t.x, z: t.z, a: t.a, r: 0.18, hit: 0, node: n, grp: map.axisAt(n, map.edges[t.edge]), tl: t });
    return (ch.items = it);
  }
  // a chunk is built in small steps spread over frames: its blocks are generated one by one, then the four meshes
  function plan(ch) {
    const S = [];
    for (const b of ch.blocks) if (!b.gen) S.push(() => genBlock(map, b));
    S.push(() => { for (const e of ch.edges) genEdge(map, e); for (const n of ch.nodes) genNode(map, n); });
    S.push(() => { ch.m.ground = buildGround(ch); }, () => { ch.m.bld = buildBuildings(ch); }, () => { const p = buildProps(ch); ch.m.props = p.props; ch.m.signs = p.signs; ch.circles = p.circles; collectPool(ch); });
    return S;
  }
  const stats = { built: 0, dropped: 0, maxStepMs: 0 };
  function step(ch) {
    if (!ch.plan) ch.plan = plan(ch);
    const t0 = performance.now(); ch.plan[ch.stage++](); stats.maxStepMs = Math.max(stats.maxStepMs, performance.now() - t0);
    if (ch.stage >= ch.plan.length) { ch.plan = null; for (const m of Object.values(ch.m)) if (m) { m.matrixAutoUpdate = false; group.add(m); } ch.ready = true; stats.built++; dirtyPools = true; for (const f of listeners.load) f(ch); }
  }
  function drop(ch) {
    for (const f of listeners.drop) f(ch);
    for (const m of Object.values(ch.m)) if (m) { group.remove(m); m.geometry.dispose(); }
    ch.m = {}; ch.ready = false; ch.stage = 0; ch.plan = null; loaded.delete(ch.key); dirtyPools = true; stats.dropped++;
  }
  // ---- instanced pools (lamps, bins, traffic lights, fences) + lamp glows and light pools on the road
  const POOLS = {}; let dirtyPools = true;
  const mkPool = (k, geo, cap, mat = M.prop) => { const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false; m.name = 'city-pool-' + k; group.add(m); POOLS[k] = m; return m; };
  { const g = new Geo(); g.col('#3d4046'); g.cyl(0, 0.1, 0, 0.11, 0.07, 7.6, 5); g.box(0, 0.9, 0, 1, 0.9, 0.06, 7.55, 7.68, true); g.col('#f4efdc'); g.box(0, 1.75, 0, 1, 0.42, 0.16, 7.42, 7.56, true); mkPool('lamp', g.build(), 700); }
  { const g = new Geo(); g.col('#2f4a3a'); g.cyl(0, 0.14, 0, 0.26, 0.3, 0.85, 6); g.col('#1d1f22'); g.cyl(0, 0.99, 0, 0.3, 0.1, 0.08, 6); mkPool('bin', g.build(), 400); }
  { const g = new Geo(); g.col('#2c2f33'); g.cyl(0, 0.1, 0, 0.09, 0.07, 3.3, 5); g.col('#16181b'); g.box(0, 0, 1, 0, 0.19, 0.13, 3.3, 4.35, true); mkPool('tl', g.build(), 260); }
  { const g = new Geo(); g.col('#a39c8c'); g.box(0, 0, 0, 1, 0.09, 1.3, 0.14, 0.5, true); g.col('#23282a'); g.box(0, 0, 0, 1, 0.02, 1.26, 0.5, 1.3, true); mkPool('fence', g.build(), 2600); }
  const lens = mkPool('lens', new THREE.CircleGeometry(0.105, 10), 780, new THREE.MeshBasicMaterial({ toneMapped: false })); lens.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(780 * 3), 3);
  const glowG = new THREE.BufferGeometry(); glowG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(700 * 3), 3)); glowG.setDrawRange(0, 0);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(0.25, 'rgba(255,214,150,0.55)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glow = new THREE.Points(glowG, new THREE.PointsMaterial({ map: glowTex, size: 5.5, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  glow.frustumCulled = false; glow.renderOrder = 5; group.add(glow);
  const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.33, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 700);
  pool.count = 0; pool.frustumCulled = false; pool.renderOrder = 2; group.add(pool);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _col = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
  let tlItems = [], poolX = 0, poolZ = 0;
  function rebuildPools() {
    dirtyPools = false; const n = { lamp: 0, bin: 0, tl: 0, fence: 0 }; let ng = 0, nl = 0; tlItems = [];
    const gp = glowG.attributes.position;
    for (const ch of loaded.values()) {
      if (!ch.ready) continue;
      const far = Math.max(Math.abs(ch.cx - poolX), Math.abs(ch.cz - poolZ)) > 300;   // fences only near the player
      for (const it of ch.items) {
        const P = POOLS[it.k]; if (n[it.k] >= P.instanceMatrix.count || (it.k === 'fence' && far)) continue;
        _q.setFromAxisAngle(UP, it.a);
        if (it.hit) { _q2.setFromAxisAngle(_v.set(Math.cos(it.ha), 0, -Math.sin(it.ha)), it.hit); _q.premultiply(_q2); }
        _m.compose(_v.set(it.x + (it.ox || 0), it.oy || 0, it.z + (it.oz || 0)), _q, _s); P.setMatrixAt(n[it.k]++, _m);
        if (it.k === 'lamp' && !it.hit && ng < 700) { const hx = it.x + Math.sin(it.a) * 1.75, hz = it.z + Math.cos(it.a) * 1.75; gp.setXYZ(ng++, hx, 7.3, hz); _m.makeScale(17, 1, 17).setPosition(hx, 0.05, hz); pool.setMatrixAt(nl++, _m); }
        if (it.k === 'tl' && !it.hit) { it.li = tlItems.length; tlItems.push(it); }
      }
    }
    for (const k of Object.keys(n)) { POOLS[k].count = n[k]; POOLS[k].instanceMatrix.needsUpdate = true; }
    glowG.setDrawRange(0, ng); gp.needsUpdate = true; pool.count = nl; pool.instanceMatrix.needsUpdate = true;
    // lenses: three per head, facing the approaching traffic
    let k = 0; for (const it of tlItems) { for (let j = 0; j < 3; j++) { _q.setFromAxisAngle(UP, it.a); _m.compose(_v.set(it.x + Math.sin(it.a) * 0.135, 4.12 - j * 0.31, it.z + Math.cos(it.a) * 0.135), _q, _s); lens.setMatrixAt(k++, _m); } }
    lens.count = k; lens.instanceMatrix.needsUpdate = true; lastSig = -1;
  }
  // ---- traffic signals: axis 0 green → yellow → all red → axis 1 green → …  (40 s cycle)
  let lastSig = -1, clock = 0;
  function signal(n, axis) {   // 0 green, 1 yellow, 2 red for traffic arriving on an arm of this axis
    if (!n.signal) return 0;
    const t = (clock + n.phase) % 40, ph = t < 16 ? 0 : t < 19 ? 1 : t < 20 ? 2 : t < 36 ? 3 : t < 39 ? 4 : 5;
    if (axis === 0) return ph === 0 ? 0 : ph === 1 ? 1 : 2;
    return ph === 3 ? 0 : ph === 4 ? 1 : 2;
  }
  const LC = [[0.05, 1, 0.25], [1, 0.75, 0.05], [1, 0.08, 0.05]];
  function updateSignals() {
    const tick = Math.floor(clock * 2); if (tick === lastSig) return; lastSig = tick;
    let k = 0; for (const it of tlItems) { const s = signal(it.node, it.grp); for (let j = 0; j < 3; j++) { const on = (j === 0 && s === 2) || (j === 1 && s === 1) || (j === 2 && s === 0), c = LC[2 - j]; lens.setColorAt(k++, _col.setRGB(c[0] * (on ? 1.6 : 0.07), c[1] * (on ? 1.6 : 0.07), c[2] * (on ? 1.6 : 0.07))); } }
    if (lens.instanceColor) lens.instanceColor.needsUpdate = true;
  }
  // ---- per-frame streaming
  let lastKey = '', waiting = false, waitT = 0, lastPre = '';
  function update(px, pz, dt, camera, budgetMs = 7) {
    clock += dt;
    const ci = Math.floor(px / CHUNK), cj = Math.floor(pz / CHUNK), R = Math.ceil(LOAD_R / CHUNK);
    const k0 = ci + ',' + cj;
    const k1 = k0 + ':' + Math.floor(px / 64) + ',' + Math.floor(pz / 64);
    if (k1 !== lastKey || (waiting && performance.now() - waitT > 200)) {
      lastKey = k1; waiting = false; waitT = performance.now(); if (map.real && k1 !== lastPre) { lastPre = k1; map.prefetch(px, pz); }
      for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
        const ch = map.chunks.get(i + ',' + j); if (!ch || loaded.has(ch.key) || Math.hypot(Math.max(0, Math.abs((i + 0.5) * CHUNK - px) - CHUNK / 2), Math.max(0, Math.abs((j + 0.5) * CHUNK - pz) - CHUNK / 2)) > LOAD_R) continue;
        if (!map.chunkReady(ch)) { waiting = true; continue; }   // its plots are still on the way (real map: 1 km tiles)
        ch.cx = (i + 0.5) * CHUNK; ch.cz = (j + 0.5) * CHUNK;
        loaded.set(ch.key, ch); ch.m = {}; ch.stage = 0; ch.plan = null; ch.ready = false; queue.push(ch);
      }
    }
    for (const ch of [...loaded.values()]) { const d = Math.max(Math.abs(ch.cx - px), Math.abs(ch.cz - pz)) - CHUNK / 2; if (d > DROP_R) { const qi = queue.indexOf(ch); if (qi >= 0) queue.splice(qi, 1); drop(ch); } }
    if (queue.length) {
      queue.sort((a, b) => Math.hypot(a.cx - px, a.cz - pz) - Math.hypot(b.cx - px, b.cz - pz));
      const t0 = performance.now();
      do { const ch = queue[0]; step(ch); if (ch.ready) queue.shift(); } while (queue.length && performance.now() - t0 < budgetMs);
    }
    if (Math.abs(px - poolX) > 90 || Math.abs(pz - poolZ) > 90) { poolX = px; poolZ = pz; dirtyPools = true; }
    if (dirtyPools) rebuildPools();
    updateSignals();
    sky.position.set(px, 0, pz); skyline.position.set(px, 34, pz); ground.position.set(Math.round(px / 64) * 64, 0, Math.round(pz / 64) * 64);
    sun.position.set(px + T.sun[2][0] * 200, T.sun[2][1] * 200, pz + T.sun[2][2] * 200); sun.target.position.set(px, 0, pz); sun.target.updateMatrixWorld();
  }
  // ---- static collision queries
  function solidsNear(x, z, r, out = []) {
    out.length = 0; const seen = solidsNear._s || (solidsNear._s = new Set()); seen.clear();
    for (let i = Math.floor((x - r) / 128); i <= Math.floor((x + r) / 128); i++) for (let j = Math.floor((z - r) / 128); j <= Math.floor((z + r) / 128); j++) {
      const c = map.cells.get(i + ',' + j); if (!c) continue;
      for (const b of c.blocks) { if (seen.has(b.id)) continue; seen.add(b.id); for (const o of genBlock(map, b).solid) if (Math.abs(o.x - x) < r + o.hw + o.hd && Math.abs(o.z - z) < r + o.hw + o.hd) out.push(o); }
    }
    for (const o of map.site.boxes) if (Math.abs(o.x - x) < r + o.hw + o.hd && Math.abs(o.z - z) < r + o.hw + o.hd) out.push(o);
    for (const o of LM.solids) if (Math.abs(o.x - x) < r + o.hw + o.hd && Math.abs(o.z - z) < r + o.hw + o.hd) out.push(o);
    return out;
  }
  function inSolid(x, z, pad = 0) { for (const o of solidsNear(x, z, pad + 1, inSolid._o || (inSolid._o = []))) { const dx = x - o.x, dz = z - o.z; if (Math.abs(dx * o.ux + dz * o.uz) < o.hw + pad && Math.abs(-dx * o.uz + dz * o.ux) < o.hd + pad) return o; } return null; }
  function propsNear(x, z, r, cb) {
    for (const ch of loaded.values()) {
      if (!ch.ready || Math.abs(ch.cx - x) > CHUNK / 2 + r + 30 || Math.abs(ch.cz - z) > CHUNK / 2 + r + 30) continue;
      for (const c of ch.circles) { const dx = c.x - x, dz = c.z - z, rr = r + c.r; if (dx * dx + dz * dz < rr * rr) cb(c, false); }
      for (const it of ch.items) { if (it.hit) continue; const dx = it.x - x, dz = it.z - z, rr = r + it.r; if (dx * dx + dz * dz < rr * rr) cb(it, true); }
    }
  }
  // knock a pool item over in direction (dx, dz)
  function knock(it, dx, dz, speed) {
    if (it.hit) return; const L = Math.hypot(dx, dz) || 1;
    it.ha = Math.atan2(dx / L, dz / L); it.hit = it.k === 'lamp' ? Math.min(1.35, 0.5 + speed * 0.04) : it.k === 'tl' ? Math.min(1.4, 0.6 + speed * 0.04) : 1.5;
    if (it.k === 'bin') { it.ox = dx / L * Math.min(6, speed * 0.4); it.oz = dz / L * Math.min(6, speed * 0.4); it.oy = 0.2; }
    if (it.k === 'fence') it.oy = 0.02;
    dirtyPools = true;
  }
  function repairAll() { for (const ch of map.chunks.values()) if (ch.items) for (const it of ch.items) { it.hit = 0; it.ox = it.oz = it.oy = 0; } dirtyPools = true; }
  setTime(mode);
  return {
    group, materials: M, atlas, loaded, stats, update, setTime, get time() { return timeMode; }, get night() { return T.night; }, signal, solidsNear, inSolid, propsNear, knock, repairAll,
    on(ev, f) { listeners[ev].push(f); }, get pending() { return queue.length; },
    dispose() {
      for (const ch of [...loaded.values()]) drop(ch); LM.dispose();
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map && o.material.map !== atlas.tex) o.material.map.dispose(); });
      for (const m of [sky.material, skyline.material, glow.material, pool.material, lens.material]) m.dispose();
      M.dispose(); scene.remove(group); scene.fog = null;
    },
  };
}
