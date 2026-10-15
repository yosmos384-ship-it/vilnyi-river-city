// exterior.js — EXTERIOR module: terrain, lot, street, neighbour houses, trees, props, ambience.
// Contract: export async function build(ctx). Everything added here is tagged userData.floor = 'outside'.
import * as THREE from 'three';
import planDefault from './plan.js';
import { Bucket, setAniso, tag } from './exterior-util.js';
import { makeMaterials } from './exterior-tex.js';
import { buildGround, buildStreets, buildLot, streetBand, holeRect } from './exterior-ground.js';
import { buildNeighbors } from './exterior-houses.js';
import { buildFoliage, buildBackdrop } from './exterior-trees.js';
import { buildHeroTrees, buildGrassV2, buildHydrangeas, buildOrnGrasses, updateVegUniforms, vegUniforms } from './exterior-veg.js';
import { buildLandscape } from './exterior-landscape.js';
import { buildHorizon } from './exterior-horizon.js';
import { buildFences, buildMailbox, buildBins, buildAC, buildPoles, buildSigns, buildVehicles } from './exterior-props.js';
import { setupAmbient } from './exterior-audio.js';

// 0 = day … 1 = night. Updated every frame from ctx.timeOfDay (number or function) when core provides it.
export const nightUniform = { value: 0 };
// shared wind clock for all swaying vegetation shaders
export const windTime = { value: 0 };
// handle to the ambient sound controller (setEnabled(bool) to mute from UI)
// debug handle (tests / console): exposes the internal build state after build()
export const _debug = { W: null };
export const ambient = { controller: null, setEnabled(on) { if (this.controller) this.controller.setEnabled(on); } };

// [bucket name, material key, castShadow(hi), castShadow(low), walkable]
const BUCKETS = [
  ['concrete', 'concrete', false, false, true],
  ['gravel', 'gravel', false, false, true],
  ['asphalt', 'asphalt', false, false, true],
  ['mulch', 'mulch', false, false, false],
  ['siding', 'siding', true, false, false],
  ['brick', 'brick', true, false, false],
  ['roof', 'roof', true, false, false],
  ['paint', 'paint', true, false, false],
  ['glassLit', 'glassLit', false, false, false],
  ['glassDark', 'glassDark', false, false, false],
  ['bark', 'bark', true, true, false],
  ['wood', 'wood', true, false, false],
  ['darkMetal', 'darkMetal', true, false, false],
  ['galv', 'galv', true, false, false],
  ['chain', 'chain', false, false, false],
  ['lens', 'lens', false, false, false],
  ['wire', 'wire', false, false, false],
  ['signs', 'signs', false, false, false],
  ['plastic', 'plastic', true, true, false],
  ['carPaint', 'carPaint', true, false, false],
  ['carGlass', 'carGlass', false, false, false],
  ['tire', 'tire', true, false, false],
  ['chrome', 'chrome', false, false, false],
  ['carLights', 'carLights', false, false, false],
  // V2 luxury landscape
  ['pavers', 'pavers', false, false, true],
  ['stone', 'stone', false, false, true],
  ['cedar', 'cedar', true, false, false],
  ['hedge', 'hedge', true, false, false],
];
// path-tracer hints for merged buckets (RENDER bot excludes userData.noPathtrace === true)
const PT_FLAGS = { bark: { noPathtrace: false, hero: true } };

function readNight(ctx) {
  let t = ctx.timeOfDay;
  try { if (typeof t === 'function') t = t(); } catch (e) { t = undefined; }
  if (t && typeof t === 'object' && typeof t.value === 'number') t = t.value;
  return typeof t === 'number' && Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : null;
}

export async function build(ctx) {
  const plan = ctx.plan || planDefault;
  const root = new THREE.Group();
  root.name = 'exterior';
  tag(root);
  ctx.scene.add(root);
  const hi = ctx.quality !== 'low';
  try { if (ctx.renderer && ctx.renderer.capabilities) setAniso(Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())); } catch (e) { /* ignore */ }

  const bt = plan.bigTree || { x: 4.5, z: -14, trunkR: 0.45, height: 17 };
  const W = {
    ctx, plan, hi, root,
    B: {}, mats: null,
    excl: [], colliders: [], walkables: [], foliage: [], backTrees: [], fenceLines: [], houseRects: [], driveways: [], updaters: [],
    windTime, nightUniform,
    // hero trees (full branch + leaf-card trees, path traced). Coordinates unchanged from v1 + one new ornamental tree.
    nearTrees: [
      { x: bt.x, z: bt.z, h: bt.height, r: bt.trunkR, crown: 7.2, ring: 1.6, tint: 0xffffff },  // the big mature back-yard tree
      { x: 1.8, z: 13.2, h: 10.5, r: 0.27, crown: 4.4, ring: 1.1, tint: 0xf4ffe8, front: true }, // front-yard maple (uplit)
      { x: -3.4, z: -27.5, h: 12.5, r: 0.32, crown: 5.0, ring: 0, tint: 0xfff6e6 },            // back-left
      { x: 12.4, z: -29.5, h: 10.5, r: 0.26, crown: 4.3, ring: 0, tint: 0xf0ffe6 },            // back-right
      { x: 12.4, z: 11.0, h: 6.6, r: 0.14, crown: 2.9, ring: 0.95, tint: 0xeaf6f0 },          // NEW: ornamental (serviceberry) east front lawn
    ],
    hydrangeas: [], ornGrasses: [], nightLights: [],
  };
  _debug.W = W;
  for (const [name] of BUCKETS) W.B[name] = new Bucket(name);

  const step = (name, fn) => { try { fn(W); } catch (e) { console.warn('[exterior] ' + name + ' failed:', e); } };
  step('materials', () => { W.mats = makeMaterials(W); });
  try { if (W.mats) { for (const k of Object.keys(W.mats)) { const m = W.mats[k]; if (m && m.isMaterial) { if (!m.name) m.name = 'ext:' + k; m.userData.extKey = k; } } ctx.exteriorMaterials = W.mats; } } catch (_) { } // V3 STYLE bot
  if (!W.mats) return;
  W.streetZ0 = streetBand(plan).z0;
  step('ground', buildGround);
  step('streets', buildStreets);
  step('lot', buildLot);                 // back stoop + house exclusion
  step('neighbors', buildNeighbors);
  step('landscape', buildLandscape);     // driveway, walks, beds, planting plan, lights, cedar fence, patio, street details
  step('mailbox', buildMailbox);
  step('bins', buildBins);
  step('ac', buildAC);
  step('poles', buildPoles);
  step('signs', buildSigns);
  step('vehicles', buildVehicles);
  step('heroTrees', buildHeroTrees);
  step('backdrop', buildBackdrop);       // instanced mid trees (realistic) + far blob trees
  step('fences', buildFences);           // neighbours' chain link only (our lot has the cedar fence)
  step('hydrangeas', () => buildHydrangeas(W, W.hydrangeas));
  step('ornGrasses', () => buildOrnGrasses(W, W.ornGrasses));
  step('foliage', buildFoliage);
  step('horizon', buildHorizon);
  step('grass', buildGrassV2);

  // merge buckets into meshes
  for (const [name, mk, shHi, shLo, walk] of BUCKETS) {
    try {
      const b = W.B[name];
      if (!b || b.empty) continue;
      const geo = b.build();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, W.mats[mk]);
      mesh.name = 'ext-' + name;
      mesh.castShadow = hi ? shHi : shLo;
      mesh.receiveShadow = name !== 'lens' && name !== 'glassLit';
      tag(mesh, PT_FLAGS[name]);
      root.add(mesh);
      if (walk) W.walkables.push(mesh);
      W.meshes = W.meshes || {};
      W.meshes[name] = mesh;
    } catch (e) { console.warn('[exterior] bucket ' + name + ' failed:', e); }
  }
  root.updateMatrixWorld(true);

  // physics / navigation hooks
  try { if (ctx.addWalkable) for (const m of W.walkables) ctx.addWalkable(m); } catch (e) { console.warn('[exterior] walkables', e); }
  try { if (ctx.addCollider) for (const b of W.colliders) ctx.addCollider(b); } catch (e) { console.warn('[exterior] colliders', e); }
  try {
    if (ctx.registerRoom) {
      const hole = holeRect(plan), sb = streetBand(plan), L = plan.lot;
      const B3 = (x0, z0, x1, z1) => new THREE.Box3(new THREE.Vector3(x0, -0.5, z0), new THREE.Vector3(x1, 8, z1));
      ctx.registerRoom('חצר קדמית', { floor: 'outside', box: B3(L.x0, hole.z1, L.x1, sb.z0) });
      ctx.registerRoom('חצר אחורית', { floor: 'outside', box: B3(L.x0, L.z0, L.x1, hole.z0) });
      ctx.registerRoom('חצר צדדית מערבית', { floor: 'outside', box: B3(L.x0, hole.z0, hole.x0, hole.z1) });
      ctx.registerRoom('חצר צדדית מזרחית', { floor: 'outside', box: B3(hole.x1, hole.z0, L.x1, hole.z1) });
      ctx.registerRoom('רחוב Eakin Rd', { floor: 'outside', box: B3(-150, sb.z0, 160, sb.z1) });
    }
  } catch (e) { console.warn('[exterior] rooms', e); }

  // ambience
  try { ambient.controller = setupAmbient(W); } catch (e) { console.warn('[exterior] audio', e); }

  // per-frame: wind clock, day/night emissives, street lights, ambience
  const m = W.mats;
  let lastN = -1;
  if (ctx.onUpdate) ctx.onUpdate((dt, t) => {
    windTime.value = typeof t === 'number' ? t : windTime.value + (dt || 0.016);
    const n = readNight(ctx);
    if (n !== null) nightUniform.value = n;
    const nv = nightUniform.value;
    if (Math.abs(nv - lastN) > 0.002) {
      lastN = nv;
      const k = Math.max(0, (nv - 0.25) / 0.75);
      m.glassLit.emissiveIntensity = 1.6 * k;
      m.glassDark.emissiveIntensity = 0.05 * k;
      m.lens.emissiveIntensity = 0.1 + 6 * k;
      for (const L of W.streetLights || []) L.intensity = 60 * k;
      for (const nl of W.nightLights || []) nl.light.intensity = nl.base * k;
      if (ambient.controller) ambient.controller.setNight(nv);
    }
    updateVegUniforms(W, nv);
    for (const u of W.updaters) { try { u(dt || 0.016, t); } catch (e) { /* ignore */ } }
    if (ambient.controller) ambient.controller.update();
  });

  return { root, nightUniform, windTime, vegUniforms };
}
