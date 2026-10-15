// interior.js — INTERIOR module: furniture, fixtures and every interactive item inside the house.
// Exports build(ctx). Split into interior-*.js sub-modules; each section is isolated in try/catch.
import * as L from './interior-lib.js';
import { buildKitchen } from './interior-kitchen.js';
import { buildBath1, buildBath2 } from './interior-bath.js';
import { buildBedroomsMain, buildBedroomsUpper, buildLiving } from './interior-rooms.js';
import { buildRadio } from './interior-radio.js';
import { buildBasement } from './interior-basement.js';
import { upgradeMaterials, finalizeDrapes } from './interior-lux.js';

const THREE = L.THREE;
const MAX_POINT_LIGHTS = 4;

export async function build(ctx) {
  let plan = ctx && ctx.plan;
  if (!plan) { try { plan = (await import('./plan.js')).default; } catch (e) { console.warn('[interior] no plan'); return; } }
  const scene = ctx.scene;
  const root = scene; // every interior group is a top-level scene child with its own userData.floor tag
  const groups = [];

  const M = L.makeMaterials(ctx.quality);
  try { upgradeMaterials(M, ctx.quality); } catch (e) { console.warn('[interior] material upgrade failed', e); }
  // V3 STYLE bot: name + expose the key → material table (js/styles.js tags them with userData.styleKey after build)
  try { for (const k of Object.keys(M)) { const m = M[k]; if (m && m.isMaterial) { if (!m.name) m.name = 'int:' + k; m.userData.intKey = m.userData.intKey || k; } } ctx.interiorMaterials = M; } catch (e) { }
  const before = new Set(scene.children);
  const anim = new L.Anim();
  const snd = new L.Snd(ctx);
  try { ctx.onUpdate((dt) => { anim.update(dt); snd.update(); }); }
  catch (e) { console.warn('[interior] onUpdate unavailable', e); }

  const hooks = {}, localLamps = {}, tops = {}, glows = {};
  let pointBudget = MAX_POINT_LIGHTS;
  const mkTop = (name, floor) => { const g = new THREE.Group(); g.name = 'interior-' + name; g.userData.floor = floor; root.add(g); groups.push(g); return g; };
  tops.main = mkTop('lights-main', 'main'); tops.upper = mkTop('lights-upper', 'upper'); tops.basement = mkTop('lights-basement', 'basement');

  const E = {
    ctx, plan, M, anim, snd, q: ctx.quality || 'high', top: root,
    interact(obj, label, onUse) {
      if (!obj || !ctx.addInteractive) return;
      const safe = () => { try { const r = onUse(); if (r && typeof r.catch === 'function') r.catch((e) => console.warn('[interior] action', e)); } catch (e) { console.warn('[interior] action', e); } };
      const lab = typeof label === 'function' ? () => { try { return label(); } catch (e) { return ''; } } : label;
      try { ctx.addInteractive(obj, { label: lab, onUse: safe }); } catch (e) { console.warn('[interior] addInteractive', e); }
    },
    collider(b) { try { ctx.addCollider && ctx.addCollider(b); } catch (e) { } },
    box(x0, x1, z0, z1, y0, y1) { E.collider(new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)), new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1)))); },
    roomHook(room, fn) { (hooks[room] = hooks[room] || []).push(fn); },
    /** o: {room, floor, group, pos(world), mats:[shade, bulb], point, intensity, emissive:[shadeI, bulbI]} */
    lamp(o) {
      const [ei, bi] = o.emissive || [1, 2];
      const apply = (on) => { try { if (o.mats[0]) o.mats[0].emissiveIntensity = on ? ei : 0; if (o.mats[1]) o.mats[1].emissiveIntensity = on ? bi : 0; } catch (e) { } };
      let light = null, core = null;
      const inten = o.intensity || 10;
      if (o.point && pointBudget > 0) {
        pointBudget--;
        light = new THREE.PointLight(0xffd3a0, inten, 6, 2);
        light.castShadow = false; light.position.copy(o.pos);
        (tops[o.floor] || root).add(light);
        if (ctx.addLamp) { try { core = ctx.addLamp(light, { room: o.room, floor: o.floor }) || null; } catch (e) { core = null; } }
      }
      const h = {
        _on: o.defaultOn !== false, light, core,
        get on() { if (core) { try { return !!core.on; } catch (e) { return h._on; } } return h._on; },
        set(on) {
          on = !!on;
          if (core) { try { core.set(on); } catch (e) { } }
          else { h._on = on; if (light) light.intensity = on ? inten : 0; }
          last = on; apply(on);
        },
      };
      let last = null;
      if (core) { last = h.on; apply(last); anim.tick(() => { const on = h.on; if (on !== last) { last = on; apply(on); } }); }
      else { h.set(h._on); (localLamps[o.room] = localLamps[o.room] || []).push(h); }
      return h;
    },
    /** shared emissive material for a room's decorative fixtures (sconces, LED strips): follows that room's lamps */
    glow(room, base = 1.6, o = {}) {
      const key = room + ':' + base + ':' + (o.color || 0);
      if (glows[key]) return glows[key];
      const m = new THREE.MeshStandardMaterial({ color: o.color || 0xfbf6ec, emissive: o.emissive || 0xffdcae, emissiveIntensity: 0, roughness: 0.35, metalness: 0 });
      m.name = 'glow-' + room; glows[key] = m;
      let acc = 1, cur = -1;
      anim.tick((dt) => {
        acc += dt; if (acc < 0.2) return; acc = 0;
        let on = true;
        try {
          let hs = (ctx.lampsInRoom && ctx.lampsInRoom(room)) || [];
          if (!Array.isArray(hs)) hs = Array.from(hs);
          hs = hs.concat(localLamps[room] || []);
          if (hs.length) on = hs.some((h) => h && h.on);
        } catch (e) { on = true; }
        const v = on ? base : 0;
        if (v !== cur) { cur = v; m.emissiveIntensity = v; }
      });
      return m;
    },
    switchAt(G, F, room, pos) {
      const rocker = L.switchPlate(E, G, F, pos);
      const all = () => {
        let core = [];
        try { core = (ctx.lampsInRoom && ctx.lampsInRoom(room)) || []; } catch (e) { core = []; }
        if (!Array.isArray(core)) { try { core = Array.from(core); } catch (e) { core = []; } }
        return core.filter(Boolean).concat(localLamps[room] || []);
      };
      const st = { on: true };
      const isOn = () => { const a = all(); if (a.length) { try { return a.some((h) => !!h.on); } catch (e) { } } return st.on; };
      const sync = () => { rocker.rotation.x = isOn() ? -0.18 : 0.18; };
      sync();
      E.interact(rocker.parent, () => (isOn() ? 'כבה אור' : 'הדלק אור'), () => {
        const next = !isOn(); st.on = next;
        for (const h of all()) { try { h.set(next); } catch (e) { } }
        for (const fn of hooks[room] || []) { try { fn(next); } catch (e) { } }
        snd.switchClick(rocker); sync();
      });
      anim.tick(() => { rocker.rotation.x += ((isOn() ? -0.18 : 0.18) - rocker.rotation.x) * 0.5; });
    },
  };

  const section = (name, floor, fn, room) => {
    const g = mkTop(name, floor);
    if (room) { g.userData.room = room; g.userData.roomFixed = true; }
    try { fn(g); } catch (e) { console.warn(`[interior] section "${name}" failed`, e); }
    return g;
  };
  section('kitchen', 'main', (g) => buildKitchen(E, g), 'kitchen');
  section('bath1', 'main', (g) => buildBath1(E, g, root), 'bath1');
  section('living', 'main', (g) => buildLiving(E, g, root, buildRadio), 'living');
  section('bedrooms-main', 'main', (g) => buildBedroomsMain(E, g));
  section('bath2', 'upper', (g) => buildBath2(E, g, root), 'bath2');
  section('bedrooms-upper', 'upper', (g) => buildBedroomsUpper(E, g));
  section('basement', 'basement', (g) => buildBasement(E, g, root), 'basement');
  // hall + landing switches (house owns those rooms' fixtures)
  section('switches-main', 'main', (g) => { const b = new L.Batch(); E.switchAt(g, b.root.sub(3.718, plan.mainFloor, 6.0, Math.PI / 2), 'hall', [0, 1.2, 0]); b.build(g, M, { shadow: false }); }, 'hall');
  section('switches-upper', 'upper', (g) => { const b = new L.Batch(); E.switchAt(g, b.root.sub(4.022, plan.upperFloor, 3.6, Math.PI / 2), 'landing', [0, 1.2, 0]); b.build(g, M, { shadow: false }); }, 'landing');

  // linen drapes: all panels as a few InstancedMeshes (one per floor & pleat class)
  try {
    const dg = {};
    finalizeDrapes(E, (floor) => dg[floor] || (dg[floor] = mkTop('drapes-' + floor, floor)));
  } catch (e) { console.warn('[interior] drapes failed', e); }

  // room tags (RENDER bot: per-room reflection probes). Nearest tagged ancestor wins, else room from world position.
  const added = scene.children.filter((c) => !before.has(c));
  for (const g of added) g.updateMatrixWorld(true);
  const roomAt = (x, y, z) => {
    const fl = y < plan.mainFloor - 0.45 ? 'basement' : y > plan.upperFloor - 0.4 ? 'upper' : 'main';
    const rs = (plan.rooms && plan.rooms[fl]) || {};
    let best = null, bd = Infinity;
    for (const k of Object.keys(rs)) {
      const [x0, z0, x1, z1] = rs[k].r;
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1), d = dx + dz;
      if (fl === 'upper' && k === 'bed3' && x > 1.9 && z < 3.2) continue; // bath2 is carved out of bed3
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  const _b = new THREE.Box3(), _c = new THREE.Vector3();
  const posRoom = (o) => {
    if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); _b.getCenter(_c); }
    else o.getWorldPosition(_c);
    return isFinite(_c.x) ? roomAt(_c.x, _c.y, _c.z) : null;
  };
  const tag = (o, inh) => {
    let room = o.userData.room || inh || null;
    if (!room && (o.isMesh || o.isLight)) { try { room = posRoom(o); } catch (e) { room = null; } }
    if (room) o.userData.room = room;
    const pass = o.userData.roomFixed ? o.userData.room : inh;
    for (const c of o.children) tag(c, pass);
    if (!o.userData.room) { const r = o.children.map((c) => c.userData.room).find(Boolean); if (r) o.userData.room = r; }
  };
  for (const g of added) { try { tag(g, null); } catch (e) { } }
  return groups;
}

export default build;
