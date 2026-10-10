// City Drive — landmarks of the real map, built once (they are seen from far): the Palace of the Parliament (Palatul
// Parlamentului — a public building; its massive stepped neoclassical form: plinth, four set-back tiers with cornices,
// colonnades and the central crown, the portico on the east front towards Piața Constituției, the forecourt and gardens)
// and the Arcul de Triumf on its roundabout. Dimensions are the published ones (≈ 240 × 270 m, ≈ 84 m above ground);
// the outline is a simplified massing, no logos or signage. Uses the city's own materials (geo.js): 2–3 draw calls.
import * as THREE from 'three';
import { Geo } from './geo.js?v=3.9';

export function buildLandmarks(map, M) {
  const group = new THREE.Group(); group.name = 'city-landmarks'; const solids = [];
  const pal = map.landmark && map.landmark('palace');
  const g = new Geo(true), gp = new Geo(), gg = new Geo(true);
  if (pal) {
    const cx = pal.x, cz = pal.z, C = '#e6d9bf', C2 = '#d8cab0', STONE = '#cbbfa6';
    const box = (dx, dz, hw, hd, y0, y1, st, col, fh = 5.0) => { g.col(col).attr(st, 7 + y0, 0, fh); g.box(cx + dx, cz + dz, 1, 0, hw, hd, y0, y1, true); };
    // plinth + terraces
    box(0, 0, 130, 145, 0, 3.6, 4, STONE);
    const tiers = [[120, 135, 3.6, 24], [104, 118, 25.2, 41], [86, 98, 42.2, 55], [62, 72, 56.2, 66], [34, 40, 67.2, 78]];
    for (const [hw, hd, y0, y1] of tiers) { box(0, 0, hw, hd, y0, y1, 1, C, y1 - y0 > 15 ? 5.1 : 4.6); box(0, 0, hw + 2, hd + 2, y1, y1 + 1.2, 4, C2); }
    box(0, 0, 18, 22, 79.2, 86.5, 1, C, 3.6); box(0, 0, 19.5, 23.5, 86.5, 87.4, 4, C2);
    // corner pavilions on the lower tier (slightly proud of the façade)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * 110, sz * 125, 14, 14, 3.6, 27, 1, C, 5.1);
    // the east front: a projecting portico with a colonnade and entablature, and colonnades on the upper tiers
    box(131, 0, 11, 42, 3.6, 21, 1, C, 5.6); box(132, 0, 12, 44, 21, 24.5, 4, C2);
    gp.col('#efe6d2');
    const col = (x, z, y0, y1, r) => { gp.cyl(x, y0, z, r, r * 0.88, y1 - y0, 10); gp.cyl(x, y1 - 0.6, z, r * 1.35, r * 1.35, 0.6, 8); gp.cyl(x, y0, z, r * 1.3, r * 1.3, 0.5, 8); };
    for (let k = -6; k <= 6; k++) col(cx + 143.5, cz + k * 6.4, 3.6, 21, 0.85);
    box(144, 0, 2.2, 44, 21, 24.5, 4, C2);
    for (const [hw, hd, y0, y1] of tiers.slice(1, 4)) for (let z = -hd + 8; z <= hd - 8; z += 7.5) col(cx + hw + 1.6, cz + z, y0, y1 - 1.2, 0.55);
    for (const sz of [-1, 1]) for (let x = -96; x <= 96; x += 8) col(cx + x, cz + sz * (118 + 1.6), 25.2, 39.8, 0.5);
    // flag mast on the crown
    gp.col('#d9d9d9'); gp.cyl(cx, 87.4, cz, 0.18, 0.12, 14, 6);
    solids.push({ x: cx, z: cz, ux: 1, uz: 0, hw: 130, hd: 145 }, { x: cx + 133, z: cz, ux: 1, uz: 0, hw: 13, hd: 44 });
    // gardens and the forecourt down to Bulevardul Libertății: lawn parterres, paved axis, a ring of lamps (props)
    gg.attr(3, 0, 0, 0).col(0.55, 0.55, 0.55).poly([[cx - 300, cz - 230], [cx + 258, cz - 230], [cx + 258, cz + 300], [cx - 300, cz + 300]], 0.01);
    gg.attr(4, 0, 0, 0).col('#b9b1a2').poly([[cx + 130, cz - 60], [cx + 262, cz - 60], [cx + 262, cz + 60], [cx + 130, cz + 60]], 0.03);
    gg.attr(4, 0, 0, 0).col('#aaa293').poly([[cx - 140, cz - 155], [cx + 140, cz - 155], [cx + 140, cz + 155], [cx - 140, cz + 155]], 0.02);
    for (const sz of [-1, 1]) gg.attr(4, 0, 0, 0).col('#b3ab9c').poly([[cx + 140, cz + sz * 150], [cx + 258, cz + sz * 150], [cx + 258, cz + sz * 160], [cx + 140, cz + sz * 160]].map(([x, z]) => [x, z]), 0.03);
    gp.col('#3a3d42'); for (const sz of [-1, 1]) for (let x = 150; x <= 250; x += 20) { gp.cyl(cx + x, 0, cz + sz * 64, 0.09, 0.07, 6, 5); gp.cyl(cx + x, 6, cz + sz * 64, 0.3, 0.3, 0.5, 6); }
  }
  // Arcul de Triumf in the middle of its roundabout, its passage along the main avenue through it
  const arc = map.landmark && map.landmark('arc');
  if (arc) {
    let sx = 0, sz = 0, n = 0;
    for (const e of map.edges) { if (!e.rab) continue; const a = map.nodes[e.a]; if (Math.hypot(a.x - arc.x, a.z - arc.z) < 120) { sx += a.x; sz += a.z; n++; } }
    if (n >= 3) {
      const ax = sx / n, az = sz / n; let best = null;
      for (const e of map.edges) { if (e.rab || e.len < 30) continue; const a = map.nodes[e.a]; const d = Math.hypot(a.x - ax, a.z - az); if (d < 200 && (!best || e.cls > best.cls || (e.cls === best.cls && d < best.d))) best = { e, d, cls: e.cls }; }
      const ux = best ? best.e.uz : 0, uz = best ? -best.e.ux : 1;   // the arch's width runs across the avenue
      const A = '#ddd5c2', A2 = '#cfc6b1';
      const ab = (u, hw, hd, y0, y1, col) => { g.col(col).attr(4, 3, 0, 4); g.box(ax + ux * u, az + uz * u, ux, uz, hw, hd, y0, y1, true); };
      for (const s of [-1, 1]) ab(s * 8.75, 3.75, 5.75, 0, 19.5, A);
      ab(0, 12.5, 5.75, 19.5, 26.5, A); ab(0, 13.1, 6.3, 26.5, 27.4, A2); ab(0, 10.5, 4.6, 27.4, 29.6, A);
      // the vault: the opening's top is a half circle (springing at 14.5 m), the spandrels filled in slices
      for (let k = 0; k < 10; k++) { const u0 = -5 + k, u1 = u0 + 1, um = (u0 + u1) / 2, y = 14.5 + Math.sqrt(Math.max(0, 25 - um * um)); if (y < 19.4) ab(um, 0.5, 5.75, y, 19.5, A); }
      for (const s2 of [-1, 1]) { ab(s2 * 8.75, 3.95, 5.95, 0, 1.4, A2); ab(s2 * 8.75, 3.9, 5.9, 14.2, 14.8, A2); }   // plinths, impost band
      gp.col('#e9e2d0'); for (const f of [-1, 1]) for (const u of [-11.4, -6.1, 6.1, 11.4]) { const x = ax + ux * u - uz * f * 5.95, z = az + uz * u + ux * f * 5.95; gp.cyl(x, 1.2, z, 0.55, 0.5, 17.5, 8); }
      solids.push({ x: ax + ux * 8.75, z: az + uz * 8.75, ux, uz, hw: 3.75, hd: 5.75 }, { x: ax - ux * 8.75, z: az - uz * 8.75, ux, uz, hw: 3.75, hd: 5.75 });
    }
  }
  // the landmarks keep half the haze of everything else (a 84 m palace is seen across the city)
  const halfFog = (base, key) => { const m = base.clone(); const ob = base.onBeforeCompile; m.onBeforeCompile = (sh, r) => { if (ob) ob(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\n float fogFactor = smoothstep(fogNear, fogFar * 2.2, vFogDepth) * 0.75;\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);\n#endif'); }; m.customProgramCacheKey = () => key; return m; };
  const mB = halfFog(M.bld, 'city-bld-lm'), mP = halfFog(M.prop, 'city-prop-lm');
  const meshes = [];
  if (g.count) meshes.push(new THREE.Mesh(g.build(), mB));
  if (gp.count) meshes.push(new THREE.Mesh(gp.build(), mP));
  if (gg.count) meshes.push(new THREE.Mesh(gg.build(), M.ground));
  for (const m of meshes) { m.matrixAutoUpdate = false; m.frustumCulled = true; group.add(m); }
  return { group, solids, dispose() { for (const m of meshes) m.geometry.dispose(); mB.dispose(); mP.dispose(); } };
}
