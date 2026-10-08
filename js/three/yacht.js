// VILNYI Lifestyle — concept experience: the yacht "VILNYI" at the pier of Lacul Morii (part 2; the limousine is part 1).
// Loaded lazily by walk.js (window.VRC.yacht.board(), the "Yacht" chip, or on reaching the quay). While active it owns
// the walker: positions are YACHT-LOCAL (x → bow, z → starboard, y above the waterline), so nothing jitters when the
// yacht is under way; the pier is the same frame frozen at the docked pose ("dock frame"). Collisions and floors are
// analytic (yacht-kit.js World); taps are ray-picks against the visible zones' targets.
import * as THREE from 'three';
import { PIER, DOCK, Y, WATER_Y } from './yacht-pier.js?v=3.7';
import { World, shellMaterials, buildMovers, bake } from './yacht-kit.js?v=3.7';
import { buildShell, buildStatics, LOBBY, DECKS } from './yacht-hull.js?v=3.7';
import { ZONES, makeCtx, addDeckZones, ROOM_U, makeDrink } from './yacht-rooms.js?v=3.7';
import { NAV_SHORE, LOOP, clearance } from './yacht-nav.js?v=3.7';
addDeckZones();
import { YT, SPEECH_LANG } from './yacht-i18n.js?v=3.7';
import { getMaterials } from './materials.js?v=3.7';
import { createHelm } from './yacht-helm.js?v=3.7';
import { createPeople } from './yacht-people.js?v=3.7';
import { createAudio } from './yacht-audio.js?v=3.7';
import { discoTick } from './yacht-disco.js?v=3.7';
import { createHeli } from './yacht-heli.js?v=3.7';

const EYE = 1.62, R = 0.28, SPEED = 1.4, RUN = 2.6, HALF = Math.PI / 2;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const isTouch = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
// destination chips: [key, zone id]
const DEST = [['quay', 'quay'], ['salon', 'salon'], ['dining', 'dining'], ['master', 'master'], ['cabin', 'vipS'], ['bridge', 'bridge'], ['sundeck', 'sundeck'], ['spa', 'spa'], ['casino', 'casino'], ['disco', 'beach']];
const AT = { quay: 'quay', dropoff: 'quay', aft: 'aft', salon: 'salon', dining: 'dining', master: 'master', bridge: 'bridge', sundeck: 'sundeck', spa: 'spa', disco: 'beach', swim: 'swim', cabin: 'vipS', casino: 'casino' };

const CSS = `
.vw.yacht .vw-bottom,.vw.yacht .vw-map,.vw.yacht .vw-mapbtn,.vw.yacht .vw-modes,.vw.yacht .vw-ucard,.vw.yacht .vw-carchip,.vw.yacht .vw-lift,.vw.yacht .vw-floorsbtn,
.vw.yacht .vw-styles,.vw.yacht .vw-tlabel,.vw.yacht [data-k=mode]{display:none!important}
.vw.yacht.yhelm .vw-pad,.vw.yacht.ypose .vw-pad .u,.vw.yacht.ypose .vw-pad .d{visibility:hidden}
.yh{position:absolute;inset:0;pointer-events:none;display:none;z-index:2}
.vw.yacht .yh{display:block}
.yh>*{pointer-events:auto}
.yh-bottom{position:absolute;bottom:calc(10px + var(--sb));left:calc(10px + var(--sl));right:calc(10px + var(--sr));display:flex;flex-direction:column;gap:6px;pointer-events:none;transition:opacity .45s}
.yh-bottom .vw-row{pointer-events:auto}
.yh-note{position:absolute;top:calc(58px + var(--st));left:50%;transform:translateX(-50%);max-width:min(560px,calc(100% - 24px));padding:9px 14px;font-size:12px;line-height:1.4;text-align:center;
  opacity:0;transition:opacity .5s;pointer-events:none;unicode-bidi:plaintext}
.yh-note.show{opacity:1}
.yh-note b{display:block;font-family:"Cormorant Garamond","Bodoni Moda",Georgia,serif;font-size:15px;font-weight:500;letter-spacing:.05em;color:var(--g2);margin-bottom:2px}
.yh-act{position:absolute;left:50%;bottom:calc(96px + var(--sb));transform:translateX(-50%);height:40px;padding:0 20px;font-size:12.5px;display:none}
.yh-act.show{display:inline-flex}
.yh-menu{position:absolute;left:50%;bottom:calc(146px + var(--sb));transform:translateX(-50%);padding:9px;display:none;flex-wrap:wrap;gap:6px;justify-content:center;max-width:min(430px,calc(100% - 24px))}
.yh-menu.show{display:flex}
.yh-menu .hd{flex:1 0 100%;text-align:center;font-family:"Cormorant Garamond",Georgia,serif;font-size:16px;color:var(--g2);letter-spacing:.04em}
.yh-lift{position:absolute;inset-inline-end:calc(134px + var(--sr));bottom:calc(96px + var(--sb));padding:9px;display:none;flex-direction:column;gap:5px;min-width:150px}
.yh-lift.show{display:flex}
.yh-lift .hd{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--g)}
.yh-lift button{height:32px;border-radius:999px;border:1px solid var(--ln);font-size:12px;color:#efe5cf;padding:0 12px;text-align:start}
.yh-lift button.on{background:var(--g);color:#111;font-weight:700;border-color:var(--g)}
.yh-snd{position:absolute;top:calc(58px + var(--st));inset-inline-start:calc(10px + var(--sl));width:38px;height:38px;padding:0;justify-content:center}
.vw.phone .yh-snd{top:calc(52px + var(--st));inset-inline-start:calc(8px + var(--sl))}
.yh-snd .off{display:none}.yh-snd.muted .on{display:none}.yh-snd.muted .off{display:inline}
.yh-vol{position:absolute;top:calc(100px + var(--st));inset-inline-start:calc(10px + var(--sl));width:38px;height:92px;writing-mode:vertical-lr;direction:rtl;accent-color:#c9a45c;display:none;margin:0}
.vw.phone .yh-vol{top:calc(94px + var(--st));inset-inline-start:calc(8px + var(--sl))}
.yh-snd:not(.muted)~.yh-vol{display:block}
.yh-show{position:absolute;top:calc(58px + var(--st));inset-inline-start:calc(54px + var(--sl));height:38px;display:none}
.vw.phone .yh-show{top:calc(52px + var(--st));inset-inline-start:calc(52px + var(--sl))}
.yh-show.show{display:inline-flex}
.yh-helm{position:absolute;left:0;right:0;bottom:calc(10px + var(--sb));display:none;pointer-events:none}
.vw.yhelm .yh-helm{display:block}.vw.yhelm .yh-bottom{display:none}.vw.yhelm .yh-act{display:none!important}
.yh-helm>*{pointer-events:auto}
.yh-hbtns{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);display:flex;gap:7px;flex-wrap:wrap;justify-content:center;width:max-content;max-width:calc(100% - 20px)}
.yh-read{position:absolute;left:50%;bottom:62px;transform:translateX(-50%);padding:6px 16px;display:flex;gap:14px;align-items:baseline;font-variant-numeric:tabular-nums;white-space:nowrap}
.yh-read b{font-family:"Cormorant Garamond",Georgia,serif;font-size:26px;color:var(--g2);font-weight:500}
.yh-read i{font-style:normal;font-size:10.5px;letter-spacing:.08em;opacity:.8}
.yh-read .st{font-size:11px;color:var(--g)}
.yh-thr{position:absolute;inset-inline-start:calc(14px + var(--sl));bottom:8px;width:54px;height:150px;border-radius:14px;touch-action:none;direction:ltr}
.yh-thr .tr{position:absolute;left:24px;top:12px;bottom:12px;width:6px;border-radius:3px;background:rgba(201,164,92,.25)}
.yh-thr .zero{position:absolute;left:14px;right:14px;top:66.6%;height:1px;background:var(--g)}
.yh-thr .kn{position:absolute;left:9px;width:36px;height:22px;border-radius:8px;background:linear-gradient(135deg,#e6c987,#b88a3c);top:60%}
.yh-rud{position:absolute;inset-inline-end:calc(14px + var(--sr));bottom:8px;width:170px;height:54px;border-radius:14px;touch-action:none;direction:ltr}
.yh-rud .tr{position:absolute;top:24px;left:14px;right:14px;height:6px;border-radius:3px;background:rgba(201,164,92,.25)}
.yh-rud .zero{position:absolute;top:14px;bottom:14px;left:50%;width:1px;background:var(--g)}
.yh-rud .kn{position:absolute;top:9px;width:22px;height:36px;border-radius:8px;background:linear-gradient(135deg,#e6c987,#b88a3c);left:calc(50% - 11px)}
.yh-hint{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);padding:6px 12px;font-size:10.5px;white-space:nowrap;max-width:calc(100% - 260px);overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext}
.vw.phone .yh-hint{display:none}
.vw.phone .yh-hbtns{left:calc(76px + var(--sl));right:calc(8px + var(--sr));transform:none;width:auto;max-width:none;justify-content:flex-end;bottom:116px}
.vw.phone .yh-hbtns .vw-btn{height:34px;padding:0 10px;font-size:10px}
.vw.phone .yh-read{left:calc(76px + var(--sl));right:calc(8px + var(--sr));transform:none;bottom:70px;gap:10px;padding:5px 10px;justify-content:flex-end;overflow:hidden}
.vw.phone .yh-read b{font-size:21px}.vw.phone .yh-read .st{font-size:10px;overflow:hidden;text-overflow:ellipsis}
.vw.phone .yh-bottom{left:var(--sl);right:var(--sr);bottom:calc(6px + var(--sb));flex-direction:row;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;pointer-events:auto;padding:1px 8px;touch-action:pan-x}
.vw.phone .yh-bottom::-webkit-scrollbar{display:none}
.vw.phone .yh-bottom .vw-row{flex-shrink:0;overflow:visible;max-width:none;align-self:auto;padding:0}
.vw.phone .yh-act{bottom:calc(134px + var(--sb))}
.vw.phone .yh-menu{bottom:calc(182px + var(--sb))}
.vw.phone .yh-lift{bottom:calc(134px + var(--sb));inset-inline-end:calc(8px + var(--sr))}
.vw.yacht .vw-title .t1{white-space:nowrap}
.vw.dim .yh-bottom{opacity:.25}
`;

class Yacht {
  constructor(walk) {
    this.walk = walk; this.active = false; this.ready = false; this.disposed = false;
    this.lang = String(walk.lang || 'en').slice(0, 2);
    this.t = (k) => YT(this.lang, k);
    this.world = new World(); this.state = { docked: true };
    this.doors = new Map(); this.zones = new Map(); this.order = 0;
    this.w = { x: -80, y: 0.75, z: 0, ty: 0.75, patch: null, dock: true };
    this.mode = 'walk'; this.seat = null; this.busy = false; this.glide = null; this.held = null;
    this.root = new THREE.Group(); this.root.name = 'vrc-yacht'; this.root.rotation.order = 'YXZ';
    this.dockMat = new THREE.Matrix4().compose(new THREE.Vector3(DOCK.pos[0], DOCK.y, DOCK.pos[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, DOCK.yaw, 0)), new THREE.Vector3(1, 1, 1));
    this.dockInv = this.dockMat.clone().invert(); this.dockQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, DOCK.yaw, 0));
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._ray = new THREE.Raycaster();
    this.maxZones = isTouch() ? 7 : 12;
    this._queue = []; this._building = null;
    this._init();
  }
  _init() {
    const walk = this.walk;
    this.SM = shellMaterials();
    buildStatics(this.world, this.state);
    this.shell = buildShell(); this.root.add(this.shell.group);
    for (const z of ZONES) this.zones.set(z.id, { ...z, lights: [], people: [], doors: [], built: false, group: null, targets: [], movers: null, used: 0 });
    this.helm = createHelm(this); this.people = createPeople(this); this.audio = createAudio(this);
    this._pose(); walk.scene.add(this.root);
    // the pier's colliders for the ordinary walker (lake.js builds the pier; YACHT-CONTRACT.md)
    try { const pier = walk.scene.getObjectByName('vrc-pier'); if (pier && !walk.floors.some(e => e.src === 'yacht-pier')) walk._register(pier, 'yacht-pier'); } catch (e) { console.warn('[yacht] pier colliders', e); }
    this._hud();
    this.heli = createHeli(this);   // the helicopter on the helipad and its scenic flight (yacht-heli.js)
    this.root.visible = false;
    this.ready = true;
  }
  // ------------------------------------------------------------------ pose of the yacht in the world
  _pose() {
    const p = this.helm.pose;
    this.root.position.set(p.x, WATER_Y + (p.heave || 0), p.z); this.root.rotation.set(p.pitch || 0, p.yaw, p.roll || 0, 'YXZ');
    this.root.updateMatrixWorld(true);
    this.state.docked = this.helm.docked;
    this.shell.dockOnly.visible = this.state.docked;
  }
  frameMat(dock = this.w.dock) { return dock ? this.dockMat : this.root.matrixWorld; }
  frameQ(dock = this.w.dock) { return dock ? this.dockQ : this.root.quaternion; }
  toWorld(x, y, z, dock = this.w.dock, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.frameMat(dock)); }
  toLocal(v, dock = false, out = new THREE.Vector3()) { return out.copy(v).applyMatrix4(dock ? this.dockInv : this._inv()); }
  _inv() { return (this._invM || (this._invM = new THREE.Matrix4())).copy(this.root.matrixWorld).invert(); }

  // ------------------------------------------------------------------ zones
  zoneAt(w = this.w) {
    let deck = 0, bd = 1e9; for (let i = 0; i < DECKS.length; i++) { const d = Math.abs(w.y - DECKS[i]); if (d < bd) { bd = d; deck = i + 1; } }
    if (w.dock || (w.patch && (w.patch.id === 'pass'))) return this.zones.get('quay');
    let best = null, ba = 1e18;   // the smallest box that contains the walker (rooms inside a lobby's or the spa's box win)
    for (const z of this.zones.values()) { if (z.deck !== deck) continue; const b = z.box; if (w.x >= b[0] && w.x <= b[1] && w.z >= b[2] && w.z <= b[3]) { const a = (b[1] - b[0]) * (b[3] - b[2]); if (a < ba) { ba = a; best = z; } } }
    return best || this.zones.get('quay');
  }
  materials() { const id = this.walk.styleId; if (this._mId !== id) { this._mId = id; this._m = getMaterials(id); } return this._m; }
  buildZone(z) {
    if (z.built) return z;
    const t0 = performance.now();
    const m = this.materials(), sg = new THREE.Group(), sh = new THREE.Group(), g = new THREE.Group(), gs = new THREE.Group(), gb = new THREE.Group(); g.name = 'yacht-zone-' + z.id;
    gs.name = 'shell'; gb.name = 'body'; g.add(gs, gb);
    z.lights = []; z.people = []; z.doors = []; z.targets = []; z.movers = [];
    const ctx = makeCtx(this, z, sg, m, sh);
    try { z.build(ctx); } catch (e) { console.warn('[yacht] zone ' + z.id, e); }
    // structure (walls, floors, ceilings, door leaves) and contents are baked apart: neighbours show the structure only
    for (const [src, dst] of [[sh, gs], [sg, gb]]) {
      src.updateMatrixWorld(true);
      try { const mv = buildMovers({ m, unit: { id: z.id } }, src, dst); if (mv) z.movers.push(mv); } catch (e) { console.warn('[yacht] movers ' + z.id, e); }
      bake(src, dst);
    }
    z.body = gb;
    // tap targets: joinery proxies (toggle), water-play proxies (playPart + toggle), our own (yact)
    g.traverse(o => {
      const ud = o.userData;
      if (ud.balconyDoor) { const d = this.doors.get(ud.balconyDoor); if (d) { d.proxies.push(o); ud.yact = () => this.tapDoor(d); z.targets.push(o); } return; }
      if (typeof ud.yact === 'function' || typeof ud.toggle === 'function') z.targets.push(o);
    });
    g.traverse(o => { if (o.isMesh && !z.targets.includes(o)) o.raycast = () => {}; });
    this.people.build(z, gb);
    this.root.add(g); g.updateMatrixWorld(true);
    z.group = g; z.built = true; z.ms = performance.now() - t0;
    if (z.onBuilt) try { z.onBuilt(this, z); } catch (e) { console.warn(e); }
    return z;
  }
  dropZone(z) {
    if (!z.built) return;
    for (const mv of z.movers || []) try { mv.dispose(); } catch { /* */ }
    this.people.drop(z);
    z.group.traverse(o => { if (o.geometry && o.geometry !== undefined && o.isMesh && !o.userData.sharedGeo) { try { if (o.name.startsWith('baked:') || o.name.startsWith('movers:')) o.geometry.dispose(); } catch { /* */ } } });
    this.root.remove(z.group); z.group = null; z.body = null; z.built = false; z.targets = []; z.movers = [];
    for (const d of z.doors) this.doors.delete(d.id); z.doors = [];
    this.world.remove(z.id);
  }
  _visSet(cur) { const s = new Set([cur.id]); for (const id of cur.near) s.add(id); if (this.heli) this.heli.vis(s); return s; }   // (from the helicopter: the open decks too)
  _zones(dt) {
    const cur = this.zoneAt();
    if (cur !== this.cur) { this.cur = cur; this._zoneChanged(cur); }
    const vis = this._vis;
    // background builds: the current zone first, then its neighbours — one per few frames
    if (!this._building) {
      const wb = this._want_build; this._want_build = null;
      const want = (wb && !wb.built ? wb : null) || [cur.id, ...cur.near].map(id => this.zones.get(id)).find(z => z && !z.built);
      if (want) { this._building = want; setTimeout(() => { if (!this.disposed) { this.buildZone(want); want.used = ++this.order; if (want.group) want.group.visible = vis.has(want.id); this._evict(); this._lights(true); } this._building = null; }, want === cur ? 0 : 60); }
    }
    this._doors(dt);
    this._bodies();
  }
  // contents of a neighbouring room show only through an open (or just closed) door, an archway, or interior glass;
  // from an open deck the dark glazing hides the rooms, so they appear as you come up to a door
  _bodies() {
    const cur = this.cur, w = this.w, now = this.time || 0; if (!cur) return;
    for (const id of this._vis) {
      const z = this.zones.get(id); if (!z || !z.built) continue;
      let show = z === cur;
      if (!show) {
        let linked = false;
        for (const a of [cur, z]) for (const d of a.doors) {
          const other = a === cur ? z.id : cur.id; if (d.to !== other) continue; linked = true;
          const near = Math.abs(w.y - d.y) < 1.2 && Math.hypot(w.x - d.x, w.z - d.z) < d.w / 2 + 4;
          if (d.open || now - d.shut < 1.1 || d.see === 2 || (d.see && !(cur.out && !z.out)) || (near && d.kind !== 'wood')) show = true;
        }
        if (!linked) show = !(cur.out && !z.out && z.deck === cur.deck) || cur.id === 'swim' || cur.id === 'quay';
      }
      if (z.body.visible !== show) z.body.visible = show;
    }
  }
  _zoneChanged(cur) {
    this._vis = this._visSet(cur);
    for (const z of this.zones.values()) if (z.built) { z.group.visible = this._vis.has(z.id); if (z.group.visible) z.used = ++this.order; }
    this._lights(true);
    this.walk._placeKind = cur.out ? 'outdoor' : 'indoor';
    this._blind(cur.deck === 1 && !cur.out && cur.id !== 'beach');
    this._title();
    this.audio.zone(cur);
    this.liftPanel(false);
  }
  // inside the hull (spa, lower lobby, guest cabins) nothing of the lake or the city can be seen: hide the surroundings
  _blind(on) {
    const walk = this.walk; if (!!this._blindList === !!on) return;
    if (on) {
      this._blindList = [];
      const hasLight = o => { let l = false; o.traverse(q => { if (q.isLight) l = true; }); return l; };
      for (const root of [walk.env && walk.env.group, walk.complex && walk.complex.group, walk.fleet && walk.fleet.group]) if (root) for (const o of root.children) if (o.visible && !o.isLight && !hasLight(o)) { o.visible = false; this._blindList.push(o); }
    } else { for (const o of this._blindList) o.visible = true; this._blindList = null; }
  }
  _evict() {
    const built = [...this.zones.values()].filter(z => z.built && !this._vis.has(z.id)).sort((a, b) => a.used - b.used);
    let n = [...this.zones.values()].filter(z => z.built).length;
    while (n > this.maxZones && built.length) { this.dropZone(built.shift()); n--; }
  }
  /** Build every zone now (tests / walkability audit). */
  buildAll() { const keep = this.maxZones; this.maxZones = 999; for (const z of this.zones.values()) { this.buildZone(z); z.group.visible = false; } this.maxZones = keep; if (this.cur) this._zoneChanged(this.cur); }

  // ------------------------------------------------------------------ lights: the walkthrough's fixed pool, placed in the zone
  _lights(reset) {
    const pool = this.walk._lightPool; if (!pool || !this.active) return;
    if (reset || !this._ls) {
      const w = this.w, list = [];
      for (const id of this._vis || []) { const z = this.zones.get(id); if (z && z.built) for (const l of z.lights) list.push({ l, d: Math.hypot(l[0] - w.x, l[2] - w.z) + (z === this.cur ? 0 : 6) + Math.abs(l[1] - w.y - 2.2) * 3 }); }
      list.sort((a, b) => a.d - b.d); this._ls = list.slice(0, pool.length).map(o => o.l);
    }
    const mode = this.walk.envMode, k = (mode === 'day' ? 0.75 : mode === 'dusk' ? 1 : 1.1) * (this.cur && this.cur.out ? (mode === 'day' ? 0 : 0.8) : 1);
    const col = this.materials().style.lightColor ?? 0xffd6a6;
    pool.forEach((p, i) => {
      const l = this._ls[i];
      if (!l) { p.intensity = 0; return; }
      this.toWorld(l[0], l[1], l[2], false, p.position); p.color.set(l[4] ?? col); p.distance = l[5] ?? 8; p.decay = 1.6; p.intensity = 5.4 * l[3] * k;
    });
  }

  // ------------------------------------------------------------------ doors (sliding): open as you approach, tap to toggle
  setDoor(d, open, instant = false) {
    if (d.open === open) return;
    if (open && d.to) { const z = this.zones.get(d.to); if (z && !z.built) { this._want_build = z; return; } }
    d.open = open; if (!open) d.shut = this.time || 0; for (const p of d.proxies) { try { p.userData._leafToggle ? p.userData._leafToggle(open, instant) : p.userData.toggle(open); } catch (e) { console.warn(e); } }
    if (!instant) this.audio.sfx('door');
  }
  tapDoor(d) { if (d.open) { d.hold = true; d.auto = false; this.setDoor(d, false); } else { d.hold = false; d.auto = false; this.setDoor(d, true); } }
  _doors(dt) {
    const w = this.w; if (w.dock) return;
    for (const id of this._vis || []) { const z = this.zones.get(id); if (!z || !z.built) continue;
      for (const d of z.doors) {
        if (d.noAuto) continue;
        if (Math.abs(w.y - d.y) > 1.2) continue;
        const along = d.axis === 'x' ? w.x - d.x : w.z - d.z, across = d.axis === 'x' ? w.z - d.z : w.x - d.x;
        const dist = Math.hypot(Math.max(0, Math.abs(along) - d.w / 2), across);
        if (d.hold) { if (dist > 2.2) d.hold = false; continue; }
        if (!d.open) { if (dist < 1.5 && this.mode === 'walk') { this.setDoor(d, true); d.auto = d.open; d.far = 0; } }
        else if (d.auto) { if (dist > 2.6) { d.far += dt; if (d.far > 1.6) { d.auto = false; this.setDoor(d, false); } } else d.far = 0; }
      }
    }
  }

  // ------------------------------------------------------------------ entering / leaving
  spotOf(zoneId) { const z = this.zones.get(zoneId); return z && z.spot ? { x: z.spot[0], z: z.spot[1], yaw: z.spot[2], y: z.y, dock: !!z.dock, zone: z } : null; }
  place(s, pitch = -0.03) {
    const w = this.w, P = this.walk.player;
    w.x = s.x; w.z = s.z; w.y = w.ty = s.y; w.dock = !!s.dock;
    const f = this.world.floorAt(w.x, w.z, w.y + 0.2, 0.6, 1.0); if (f) { w.y = w.ty = f.y; w.patch = f.p; w.dock = !!f.p.dock; }
    P.yaw = P.tYaw = s.yaw; P.pitch = P.tPitch = pitch; P.vel.set(0, 0, 0); P.eye = EYE;
    this.glide = null; this.mode = 'walk'; this.seat = null; this.busy = false; this._gen = (this._gen || 0) + 1; this._setPoseClass();
    this.cur = null; this._zones(0); this._camera();
  }
  async enter(o = {}) {
    const walk = this.walk; if (this.disposed) return false;
    const at = o.at || (o.from === 'quay' ? 'swim' : 'quay');
    window.VRC_LIFESTYLE = true;
    let spot = null;
    if (at === 'here') {   // walked onto the pier as an ordinary walker: take over on the spot
      const l = this.toLocal(walk.player.pos, true), f = this.world.floorAt(l.x, l.z, l.y + 0.2, 0.6, 1.0);
      if (f) spot = { x: l.x, z: l.z, y: f.y, dock: true, yaw: walk.player.yaw - DOCK.yaw, here: true };
    }
    const fade = !spot;
    if (!spot) spot = this.spotOf(AT[at] || at) || this.spotOf('quay');
    if (at === 'dropoff') { const [x, z] = PIER.Q; const l = this.toLocal(new THREE.Vector3(x, 0.3, z), true); spot = { x: Math.max(l.x, -97.2), z: 0, y: 0.75, dock: true, yaw: -HALF }; }
    if (spot.dock && !this.helm.docked && !spot.here) this.helm.reset();
    if (fade) await walk._fade(true);
    try {
      if (walk.drive && walk._exitCar) { try { await walk._exitCar(); } catch { /* */ } }
      // (called again while aboard: out of the seat, the helicopter or the casino table first — place() below would leave them half on)
      if (this.active) { await this._endPose(true); if (this.casino && this.casino.game) this.casino.leave(true); }
      if (!this.active) {
        this.active = true; this.root.visible = true; this._holdProxy(true);
        walk.root.classList.add('yacht'); walk.glide = null; walk.player.vel.set(0, 0, 0);
        this._saveLights();
        // the apartment and the commons are 300 m away: not drawn while aboard
        this._hidden = []; for (const o of walk.scene.children) if (o.visible && o.name && (o.name.startsWith('apartment-') || o.name.startsWith('walk-bldg-'))) { o.visible = false; this._hidden.push(o); }
        this._texts(); this._note();
      }
      const z = spot.zone || this.zoneAt({ ...spot, patch: null });
      if (z && z.load) await z.load();   // a zone whose code is imported on demand (the casino)
      if (z && !z.built) { this.buildZone(z); }
      this.place(spot, spot.here ? walk.player.pitch : -0.03);
      this._hudUpdate(true);
    } finally { if (fade) await walk._fade(false); }
    try { window.dispatchEvent(new CustomEvent('vrc:yacht-boarded', { detail: { at } })); } catch { /* */ }
    return true;
  }
  async goTo(zoneId) {
    if (this.busy) return; const s = this.spotOf(zoneId); if (!s) return;
    this._endPose(true);
    if (s.dock && !this.helm.docked) { this.walk._toast(this.t('gangwayIn'), 2400); return; }
    await this.walk._fade(true);
    try { const z = s.zone; if (z.load) await z.load(); if (!z.built) this.buildZone(z); this.place(s); this._hudUpdate(true); } finally { await this.walk._fade(false); }
  }
  async leave(o = {}) {
    const walk = this.walk; if (!this.active) return;
    const to = o.to || 'entrance', seamless = !!o.seamless;
    this._leaving = true;   // (watch() must not take the walker back while he is being sent home)
    if (!seamless) await walk._fade(true);
    try {
      this._endPose(true); this.dropDrink(true);
      // the lazily loaded parts own HUD, lens and sound of their own, and nothing ticks them once the yacht is left
      if (this.casino) try { this.casino.away(); } catch (e) { console.warn('[yacht] casino', e); }
      if (this.heli.state !== 'parked') this.heli.reset(true);   // (rotors still running down after a landing)
      // world pose of the walker for a hand-back on the spot
      const wp = this.toWorld(this.w.x, this.w.y, this.w.z), yawW = walk.player.yaw + (this.w.dock ? DOCK.yaw : this.helm.pose.yaw);
      this.active = false; walk.root.classList.remove('yacht', 'yhelm', 'ypose');
      this.audio.zone(null); this.helm.reset(); this._pose();
      this._restoreLights(); this._blind(false);
      for (const o of this._hidden || []) o.visible = true; this._hidden = null;
      walk.player.yaw = walk.player.tYaw = yawW;
      if (to === 'stay') {
        let p = wp; if (!seamless) { const [x, z] = PIER.Q; p = new THREE.Vector3(x, 0, z); walk.player.yaw = walk.player.tYaw = Math.atan2(-PIER.W[0], -PIER.W[1]); }
        walk.player.pos.copy(p); walk._targetY = p.y; walk.player.vel.set(0, 0, 0); walk._placeKind = 'outdoor'; walk._syncCamera();
      }
      walk._lastPlace = null; try { walk.el.t1.dataset.txt = '\u0000'; walk._updateTitle(); walk._updateHud(true); } catch { /* */ }
      try { window.dispatchEvent(new CustomEvent('vrc:yacht-left', { detail: { to } })); } catch { /* */ }
      if (to !== 'stay') {
        this.root.visible = false; this._holdProxy(false);
        if (window.VRC && typeof window.VRC.limoBack === 'function' && o.limo !== false && to === 'entrance') { try { await window.VRC.limoBack(); return; } catch (e) { console.warn('[yacht] limoBack', e); } }
        await walk._goto(to === 'apartment' ? 'apartment' : 'entrance', { instant: true });
      }
    } finally { this._leaving = false; if (!seamless) await walk._fade(false); }
  }
  // called by walk.js for an ordinary walker near the lake (≤ every 400 ms): detailed model near, proxy far; take over on the pier
  watch(cam) {
    if (this.active || this.disposed || this._leaving) return;
    const [s, t] = PIER.local(cam.x, cam.z), near = s > -260 && s < 420 && Math.abs(t) < 320 && cam.y < 12 && !this.walk._culled;
    if (near !== this.root.visible) { this.root.visible = near; this._holdProxy(near); if (near) { this.SM.setLook(this.walk.envMode, 1); this._pose(); } }
    if (near) this.SM.setLook(this.walk.envMode, 1);
    const walk = this.walk, p = walk.player.pos, [ps, pt] = PIER.local(p.x, p.z);
    if (!walk.drive && !walk.riding && !walk.busy && walk.mode === 'walk' && ps > 7 && ps < 31 && Math.abs(pt) < 2.1 && p.y < 1.4 && p.y > -0.2) this.enter({ at: 'here' });
  }
  _holdProxy(hold) { const px = this.walk.scene.getObjectByName('vrc-yacht-proxy'); if (px) { px.userData.hold = hold; if (hold) px.visible = false; } }
  _saveLights() { const pool = this.walk._lightPool || []; this._savedL = pool.map(l => ({ p: l.position.clone(), c: l.color.clone(), i: l.intensity, d: l.distance, k: l.decay })); }
  _restoreLights() {
    const pool = this.walk._lightPool || [], walk = this.walk;
    (this._savedL || []).forEach((s, i) => { const l = pool[i]; if (l) { l.position.copy(s.p); l.color.copy(s.c); l.intensity = s.i; l.distance = s.d; l.decay = s.k; } });
    const e = walk.unit && walk.loaded && walk.loaded.get(walk.unit.id); if (e && walk._assignLights) try { walk._assignLights(e); } catch { /* */ }
  }

  // ------------------------------------------------------------------ per frame (called by walk._update instead of its own walking)
  frame(dt) {
    const walk = this.walk, P = walk.player, w = this.w;
    this._dt = dt; this.time = (this.time || 0) + dt;
    // look (same feel as the walkthrough)
    let turn = 0;
    if (this.mode !== 'helm') { if (walk.keys.has('ArrowLeft') || walk.pad.l) turn += 1; if (walk.keys.has('ArrowRight') || walk.pad.r) turn -= 1; }
    if (turn) P.tYaw += turn * 1.5 * dt;
    if (this.seat) { const s = this.seat; P.tYaw = clamp(P.tYaw, s.yaw - s.lim, s.yaw + s.lim); P.tPitch = clamp(P.tPitch, s.pmin ?? -1.2, s.pmax ?? 1.2); }
    P.yaw += (P.tYaw - P.yaw) * damp(14, dt); P.pitch += (P.tPitch - P.pitch) * damp(14, dt);
    if (this.mode === 'walk' && !this.busy) this._walk(dt);
    this.helm.update(dt);
    this._pose();
    this.heli.update(dt);
    if (this.mode === 'walk') { w.y += (w.ty - w.y) * damp(12, dt); P.eye += (EYE - P.eye) * damp(8, dt); }
    // hand back to the ordinary walker at the root of the pier
    if (w.dock && this.mode === 'walk' && w.x < -99.2 + 3.2 && !this.busy) { this._camera(); this.leave({ to: 'stay', seamless: true }); return; }
    this._zones(dt);
    this._lights(false);
    this.audio.update(dt);
    this.people.update(dt);
    ROOM_U.uT.value = this.time % 3600; ROOM_U.uBeat.value = this.audio.beat; ROOM_U.uShow.value += ((this.audio.show === 'live' ? 1 : 0) - ROOM_U.uShow.value) * damp(3, dt);
    this._fxTick(dt);
    if (this.drinkTick) this.drinkTick(dt);
    if (this.poseTick) this.poseTick(dt);
    this.shell.radar.rotation.y += dt * 2.2;
    this._camera();
    if (this.casinoFrame) this.casinoFrame(dt);   // casino (lazy, ./casino/play.js): its HUD, and the camera while seated at a table
    // look of the shell: night lights, glazing clear from inside
    const out = this.cur && this.cur.out ? 1 : 0; this._outK = (this._outK ?? out) + (out - (this._outK ?? out)) * damp(4, dt);
    this.SM.setLook(walk.envMode, this._outK);
    // the walkthrough's own housekeeping that still applies
    try { walk._syncEnvMap(); walk._cullWorld(); if (walk.fleet) walk.fleet.update(walk.camera); } catch { /* */ }
    const mode = walk.envMode, e = this.cur && this.cur.out ? (mode === 'day' ? 0.82 : mode === 'dusk' ? 1.0 : 1.12) : (mode === 'day' ? 0.9 : 0.95);
    walk._expT = e; walk.renderer.toneMappingExposure += (e - walk.renderer.toneMappingExposure) * damp(2.5, dt);
    const now = performance.now();
    if (now - (this._hudT || 0) > 200) { this._hudT = now; this._hudUpdate(false); }
    try { walk._updateDim(now); } catch { /* */ }
  }
  _walk(dt) {
    const walk = this.walk, P = walk.player, w = this.w, K = walk.keys, pad = walk.pad;
    let f = 0, s = 0;
    if (K.has('KeyW') || K.has('ArrowUp') || pad.u) f += 1;
    if (K.has('KeyS') || K.has('ArrowDown') || pad.d) f -= 1;
    if (K.has('KeyD')) s += 1; if (K.has('KeyA')) s -= 1;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const want = this._want || (this._want = new THREE.Vector3()); want.set(0, 0, 0);
    if (f || s) { this.glide = null; const sp = (K.has('ShiftLeft') || K.has('ShiftRight')) ? RUN : SPEED; want.set(fx * f + rx * s, 0, fz * f + rz * s).normalize().multiplyScalar(sp); }
    else if (this.glide) {
      const g = this.glide, dx = g.x - w.x, dz = g.z - w.z, L = Math.hypot(dx, dz); g.t += dt;
      if (L < 0.12 || g.t > 12) this.glide = null; else want.set(dx / L, 0, dz / L).multiplyScalar(Math.min(1.9, L * 1.8 + 0.25) * Math.min(1, 0.35 + g.t * 2.2));
    }
    P.vel.lerp(want, damp(want.lengthSq() ? 7 : 10, dt));
    if (P.vel.lengthSq() > 1e-6) {
      const ox = w.x, oz = w.z, oty = w.ty, op = w.patch;
      const dx = P.vel.x * dt, dz = P.vel.z * dt, exp = Math.hypot(dx, dz); let got = this.world.move(w, dx, dz, R);
      // never into a room that is not built yet (it follows within a frame or two)
      if (got > 0) { const nz = this.zoneAt({ ...w, y: w.ty, dock: !!(w.patch && w.patch.dock) }); if (nz && !nz.built) { w.x = ox; w.z = oz; w.ty = oty; w.patch = op; got = 0; this._want_build = nz; } }
      if (this.glide) { if (got < exp * 0.3) { this.glide.stuck += dt; if (this.glide.stuck > 0.35) this.glide = null; } else this.glide.stuck = 0; }
      if (got < exp * 0.2 && !f && !s) P.vel.multiplyScalar(0.5);
      if (w.patch) w.dock = !!w.patch.dock;
    }
  }
  _camera() {
    if (this.heli && this.heli.riding) return this.heli.camera();   // seated in the helicopter: its cabin carries the camera
    const walk = this.walk, P = walk.player, w = this.w, cam = walk.camera;
    const sway = this.helm.docked ? 0 : Math.sin(this.time * 0.9) * 0.004;
    this.toWorld(w.x, w.y + P.eye, w.z, w.dock, cam.position);
    this._e.set(P.pitch, P.yaw, sway, 'YXZ'); this._q.setFromEuler(this._e);
    cam.quaternion.copy(this.frameQ()).multiply(this._q);
    this.toWorld(w.x, w.y, w.z, w.dock, P.pos); walk._targetY = P.pos.y;
  }

  // ------------------------------------------------------------------ taps
  tap(x, y, now = performance.now()) {
    const walk = this.walk; walk._poke && walk._poke();
    this.audio.unlock();
    const prev = this._taps;
    if (prev && now - prev.t < 360 && Math.hypot(x - prev.x, y - prev.y) < 40 && this.mode === 'walk') { this._taps = null; return this._glideTap(x, y); }
    this._taps = { t: now, x, y };
    if (this.busy) return;
    if (this.onTapAny && this.onTapAny(x, y)) return;
    const hit = this.pick(x, y); this._lastPick = hit ? hit.object.name + '|' + (hit.object.userData.piece || hit.object.userData.playPart || '') : null;
    // lying / seated: a tap gets you up (except a sip from the glass in your hand)
    const posed = this.mode !== 'walk' && this.mode !== 'helm' && this.seat && this.seat.tapUp !== false;
    if (hit && !(posed && !hit.object.userData.hand)) { try { const r = hit.fn(hit); if (r && r.catch) r.catch(e => console.warn(e)); } catch (e) { console.warn('[yacht] tap', e); } return; }
    if (posed) this._endPose();
  }
  _rayAt(x, y) {
    const r = this.walk.canvas.getBoundingClientRect(), ray = this._ray;
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.walk.camera); ray.near = 0; ray.far = 9;
    return ray;
  }
  // nearest tap target under the finger (small ring search on touch), not hidden behind a wall
  pick(x, y) {
    const objs = [];
    for (const id of this._vis || []) { const z = this.zones.get(id); if (z && z.built && z.group.visible) for (const o of z.targets) if (o.parent && o.visible !== false) objs.push(o); }
    for (const o of this.people.targets()) objs.push(o);
    if (this.extraTargets) for (const o of this.extraTargets) objs.push(o);
    if (this.heli) for (const o of this.heli.targets()) objs.push(o);
    if (!objs.length) return null;
    const offs = [[0, 0]]; const rads = isTouch() ? [10, 20] : [6]; for (const r of rads) for (let i = 0; i < 8; i++) offs.push([Math.cos(i / 8 * 6.283) * r, Math.sin(i / 8 * 6.283) * r]);
    const eye = this.toLocal(this.walk.camera.position, this.w.dock);
    for (const [ox, oy] of offs) {
      const ray = this._rayAt(x + ox, y + oy); let hits;
      try { hits = ray.intersectObjects(objs, false); } catch { hits = []; }
      for (const h of hits) {
        if (h.distance > (h.object.userData.reach || 7)) break;
        const lp = this.toLocal(h.point, this.w.dock);
        if (!this.world.los(eye.x, eye.y, eye.z, lp.x, lp.y, lp.z)) break;
        const ud = h.object.userData, fn = ud.yact || ((hh) => hh.object.userData.toggle());
        return { object: h.object, point: h.point, local: lp, distance: h.distance, fn };
      }
    }
    return null;
  }
  _glideTap(x, y) {
    // glide to the tapped point of the deck we stand on (≤ 12 m), else 2.5 m ahead
    const ray = this._rayAt(x, y), w = this.w, o = this.toLocal(ray.ray.origin, w.dock), d = ray.ray.direction.clone().applyQuaternion(this.frameQ().clone().invert());
    let tx, tz;
    if (d.y < -0.05) { const k = (w.y - o.y) / d.y; if (k > 0 && k < 14) { tx = o.x + d.x * k; tz = o.z + d.z * k; } }
    if (tx == null) { const P = this.walk.player; tx = w.x - Math.sin(P.yaw) * 2.5; tz = w.z - Math.cos(P.yaw) * 2.5; }
    this.glide = { x: tx, z: tz, t: 0, stuck: 0 };
  }
  key(ev, down) {
    const c = ev.code;
    if (down && !ev.repeat) {
      this.audio.unlock();
      if (c === 'KeyF' || c === 'Enter') { if (this.mode === 'helm') { this.leaveHelm(); return true; } if (this._act) { this._act.fn(); return true; } }
      if (this.mode === 'helm') { if (c === 'KeyP') { this.helm.auto(); return true; } if (c === 'KeyR') { this.helm.ret(); return true; } }
      if (c === 'KeyM') { this.audio.setMuted(!this.audio.muted); this._sndBtn(); return true; }
      if (c === 'Escape' && this.mode !== 'walk') { this.mode === 'helm' ? this.leaveHelm() : this._endPose(); return true; }
    }
    return false;
  }

  // ------------------------------------------------------------------ seated / lying poses (sunbeds, sauna, massage, helm chair)
  // seat: { x, y, z (eye point, local), yaw, pitch, lim (yaw range), pmin, pmax, kind, onEnd }
  async pose(seat, ms = 700) {
    if (this.busy) return false; this.busy = true; this.glide = null; const gen = this._gen;
    const w = this.w, P = this.walk.player, from = { x: w.x, y: w.y + P.eye, z: w.z, yaw: P.yaw, pitch: P.pitch };
    this._back = { x: w.x, y: w.y, z: w.z, yaw: P.yaw };
    // shortest turn
    let dy = seat.yaw - from.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); const yaw1 = from.yaw + dy;
    await this._tween(ms, k => { if (gen !== this._gen) return; const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; w.x = from.x + (seat.x - from.x) * e; w.z = from.z + (seat.z - from.z) * e; const ey = from.y + (seat.y - from.y) * e; w.y = w.ty = ey - P.eye; P.yaw = P.tYaw = from.yaw + (yaw1 - from.yaw) * e; P.pitch = P.tPitch = from.pitch + ((seat.pitch ?? 0) - from.pitch) * e; });
    if (gen !== this._gen) return false;   // teleported meanwhile (a chip, the lift)
    seat.yaw = yaw1; this.seat = seat; this.mode = seat.kind || 'sit'; this.busy = false; this._setPoseClass(); return true;
  }
  async _endPose(instant = false) {
    if (this.mode === 'helm') return this.leaveHelm();
    const seat = this.seat; if (!seat || this.busy && !instant) return;
    const b = this._back, w = this.w, P = this.walk.player;
    this.seat = null;
    if (seat.onEnd) try { await seat.onEnd(instant); } catch (e) { console.warn(e); }
    if (instant || !b) { if (b) { w.x = b.x; w.z = b.z; w.y = w.ty = b.y; } this.mode = 'walk'; this._setPoseClass(); return; }
    this.busy = true; const gen = this._gen;
    const from = { x: w.x, y: w.y + P.eye, z: w.z, pitch: P.pitch };
    await this._tween(600, k => { if (gen !== this._gen) return; const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; w.x = from.x + (b.x - from.x) * e; w.z = from.z + (b.z - from.z) * e; const ey = from.y + (b.y + EYE - from.y) * e; w.y = w.ty = ey - P.eye; P.pitch = P.tPitch = from.pitch * (1 - e) - 0.03 * e; });
    if (gen !== this._gen) return;
    const f = this.world.floorAt(w.x, w.z, w.y + 0.2, 0.6, 1.0); if (f) { w.y = w.ty = f.y; w.patch = f.p; }
    this.mode = 'walk'; this.busy = false; this._setPoseClass();
  }
  _setPoseClass() { const c = this.walk.root.classList; c.toggle('ypose', this.mode !== 'walk' && this.mode !== 'helm'); c.toggle('yhelm', this.mode === 'helm'); }
  _tween(ms, fn) { return new Promise(res => { const t0 = performance.now(); const step = () => { if (this.disposed) return res(); const k = Math.min(1, (performance.now() - t0) / ms); fn(k); if (k < 1) requestAnimationFrame(step); else res(); }; step(); }); }
  wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ------------------------------------------------------------------ helm
  async takeHelm(seat) {
    if (this.mode === 'helm' || this.busy) return;
    if (!(await this.pose({ ...seat, kind: 'helm', lim: 1.9, pmin: -0.7, pmax: 0.5, tapUp: false }))) return;
    this.mode = 'helm'; this._setPoseClass(); this._helmHud(true);
    this.walk._toast(this.t(isTouch() ? 'helmHintTouch' : 'helmHint'), 5200);
  }
  async leaveHelm() {
    if (this.mode !== 'helm') return;
    this.helm.release();   // under way with no hand on the helm: the autopilot keeps her on the loop
    this.mode = 'sit'; await this._endPose();
    if (!this.helm.docked) this.walk._toast(this.t('walkFree'), 3600);
  }

  // ------------------------------------------------------------------ lift
  liftPanel(show) {
    const el = this.el.lift; if (!el) return;
    if (show && this.w.dock) show = false;
    el.classList.toggle('show', !!show); this._liftOpen = !!show;
    if (show) { const here = this.zoneAt().deck; for (const b of el.querySelectorAll('button')) b.classList.toggle('on', +b.dataset.d === here); }
  }
  async liftTo(deck) {
    if (this.busy) return; this._endPose(true);
    const L = LOBBY.lift, w = this.w, inCar = w.x > L.x0 && w.x < L.x1 && w.z > L.z0 && w.z < L.z1;
    const here = this.zoneAt().deck; this.liftPanel(false);
    if (deck === here && inCar) return;
    this.busy = true;
    try {
      const d0 = this.doors.get('lift' + here); if (d0 && inCar) { this.setDoor(d0, false); await this.wait(650); }
      this.audio.sfx('lift');
      await this.walk._fade(true);
      const z = this.zones.get('lobby' + deck); if (z && !z.built) this.buildZone(z);
      const cx = (L.d0 + L.d1) / 2;
      this.place(inCar ? { x: cx, z: (L.z0 + L.z1) / 2, y: DECKS[deck - 1], yaw: 0 } : { x: cx, z: L.z0 - 1.3, y: DECKS[deck - 1], yaw: Math.PI });
      if (inCar) this.walk.player.yaw = this.walk.player.tYaw = 0;
      await this.wait(260);
      await this.walk._fade(false);
      this.audio.sfx('chime');
      const d1 = this.doors.get('lift' + deck); if (d1) { d1.hold = false; this.setDoor(d1, true); d1.auto = true; d1.far = 0; }
    } finally { this.busy = false; this._hudUpdate(true); }
  }

  // ------------------------------------------------------------------ drink in hand (set up by the bar; see yacht-rooms)
  dropDrink() { if (this.held && this.held.put) this.held.put(true); }

  // ------------------------------------------------------------------ speech
  say(key) {
    const text = this.t(key);
    this.walk._toast('“' + text + '”', 2600);
    if (!this.audio.unlocked || this.audio.muted) return;
    try { const ss = window.speechSynthesis; if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return; ss.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = SPEECH_LANG[this.lang] || 'en-GB'; u.rate = 1; u.pitch = 1.1; u.volume = 0.9; ss.speak(u); } catch { /* no speech */ }
  }

  // ------------------------------------------------------------------ HUD
  _hud() {
    const walk = this.walk, root = walk.root;
    const st = document.createElement('style'); st.textContent = CSS; root.appendChild(st); this._style = st;
    const h = document.createElement('div'); h.className = 'yh';
    h.innerHTML = `
      <div class="yh-note vw-panel"><b></b><span></span></div>
      <button class="yh-snd vw-btn vw-ghost" data-y="snd"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path class="on" d="M15.5 9.2a4 4 0 0 1 0 5.6M18 7a7 7 0 0 1 0 10"/><path class="off" d="M16 9.5l5 5M21 9.5l-5 5"/></svg></button>
      <input class="yh-vol" type="range" min="0" max="100" value="70" aria-label="volume">
      <button class="yh-show vw-btn vw-ghost" data-y="show"></button>
      <div class="yh-menu vw-panel"></div>
      <div class="yh-lift vw-panel"><div class="hd"></div></div>
      <button class="yh-act vw-btn vw-gold" data-y="act"></button>
      <div class="yh-helm">
        <div class="yh-hbtns"><button class="vw-btn vw-ghost" data-y="auto"></button><button class="vw-btn vw-ghost" data-y="ret"></button><button class="vw-btn vw-gold" data-y="hleave"></button></div>
        <div class="yh-read vw-panel"><span><b class="spd">0.0</b> <i class="kn"></i></span><span><b class="hdg">000</b><i>°</i></span><span class="st"></span></div>
        <div class="yh-thr vw-panel" data-y="thr"><span class="tr"></span><span class="zero"></span><span class="kn"></span></div>
        <div class="yh-rud vw-panel" data-y="rud"><span class="tr"></span><span class="zero"></span><span class="kn"></span></div>
        <div class="yh-hint vw-panel"></div>
      </div>
      <div class="yh-bottom"><div class="vw-row yh-decks"></div><div class="vw-row yh-dest"></div></div>`;
    root.appendChild(h);
    const q = s => h.querySelector(s);
    this.el = { hud: h, note: q('.yh-note'), act: q('.yh-act'), menu: q('.yh-menu'), lift: q('.yh-lift'), decks: q('.yh-decks'), dest: q('.yh-dest'), snd: q('.yh-snd'), show: q('.yh-show'),
      helm: q('.yh-helm'), spd: q('.spd'), hdg: q('.hdg'), hst: q('.yh-read .st'), kn: q('.yh-read .kn'), thr: q('.yh-thr'), thrK: q('.yh-thr .kn'), rud: q('.yh-rud'), rudK: q('.yh-rud .kn'), hint: q('.yh-hint'),
      auto: q('[data-y=auto]'), ret: q('[data-y=ret]'), hleave: q('[data-y=hleave]') };
    h.addEventListener('click', ev => this._click(ev));
    h.querySelector('.yh-vol').addEventListener('input', ev => this.audio.setVolume(+ev.target.value / 100));
    h.addEventListener('pointerdown', () => { this.audio.unlock(); walk._poke && walk._poke(); }, true);
    // throttle (vertical) and rudder (horizontal) sliders
    const slider = (el, set, vertical) => {
      let id = null;
      const upd = ev => { const r = el.getBoundingClientRect(); set(vertical ? clamp(1 - (ev.clientY - r.top - 12) / (r.height - 24), 0, 1) : clamp((ev.clientX - r.left - 14) / (r.width - 28), 0, 1)); };
      el.addEventListener('pointerdown', ev => { ev.preventDefault(); id = ev.pointerId; try { el.setPointerCapture(id); } catch { /* */ } upd(ev); });
      el.addEventListener('pointermove', ev => { if (ev.pointerId === id) upd(ev); });
      const end = () => { if (id == null) return; id = null; if (!vertical) this.helm.input.rudderPad = 0; };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    };
    slider(this.el.thr, v => { this.helm.manual(); this.helm.input.throttle = clamp(v * 1.5 - 0.5, -0.5, 1); }, true);   // lower third = astern
    slider(this.el.rud, v => { this.helm.manual(); this.helm.input.rudderPad = v * 2 - 1; }, false);
    this._texts();
  }
  _texts() {
    this.lang = String(this.walk.lang || 'en').slice(0, 2);
    const e = this.el, t = this.t;
    e.hud.dir = this.walk.dir;
    e.note.querySelector('b').textContent = t('label'); e.note.querySelector('span').textContent = t('note');
    e.decks.innerHTML = ''; e.dest.innerHTML = '';
    const mk = (box, txt, ds, cls = 'vw-chip') => { const b = document.createElement('button'); b.className = cls; b.textContent = txt; Object.assign(b.dataset, ds); box.appendChild(b); return b; };
    const deckName = (d) => d + ' · ' + t('d' + d) + (d === 1 ? ' · ' + t('casino') : '');   // the casino is on the lower deck
    for (let d = 4; d >= 1; d--) mk(e.decks, deckName(d), { deck: d });
    mk(e.decks, '← ' + t('back'), { y: 'back' }, 'vw-chip tp');
    for (const [k, z] of DEST) mk(e.dest, t(k), { dest: z });
    e.lift.querySelector('.hd').textContent = t('liftChoose');
    for (const b of [...e.lift.querySelectorAll('button')]) b.remove();
    for (let d = 4; d >= 1; d--) mk(e.lift, deckName(d), { lift: d }, '');
    e.auto.textContent = t('autopilot'); e.ret.textContent = t('dock'); e.hleave.textContent = t('helmLeave'); e.kn.textContent = t('kn');
    e.hint.textContent = t(isTouch() ? 'helmHintTouch' : 'helmHint');
    e.snd.title = t('music'); this._sndBtn();
    if (this.heli) this.heli.chips();
  }
  _sndBtn() { this.el.snd.classList.toggle('muted', this.audio.muted || !this.audio.unlocked); }
  _note(ms = 9000) { const n = this.el.note; n.classList.add('show'); clearTimeout(this._noteT); this._noteT = setTimeout(() => n.classList.remove('show'), ms); }
  _title() {
    const walk = this.walk, e = walk.el; if (!e || !this.active) return;
    const z = this.cur, d = z && z.deck ? this.t('d' + z.deck) : '';
    // two short lines so the concept label is never cut on a phone: "VILNYI Lifestyle" / "Concept experience · place"
    e.t1.textContent = 'VILNYI Lifestyle'; e.t1.title = this.t('label');
    e.t2.innerHTML = ''; const b = document.createElement('b'); b.textContent = this.t('tag'); e.t2.append(b, document.createTextNode(' · ' + (z ? this.t(z.name) : '') + (d && !this.walk._phone ? ' · ' + d : '') + (this.helm.docked ? '' : ' · ' + this.t('underway'))));
    for (const c of this.el.dest.children) c.classList.toggle('on', !!z && c.dataset.dest === z.id);
    for (const c of this.el.decks.children) if (c.dataset.deck) c.classList.toggle('on', !!z && +c.dataset.deck === z.deck);
  }
  // context action button: { label, fn } or null
  setAct(a) { this._act = a; const b = this.el.act; b.classList.toggle('show', !!a); if (a && b.textContent !== a.label) b.textContent = a.label; }
  menu(title, items) {   // items: [[label, fn]] ; null closes
    const m = this.el.menu; m.innerHTML = ''; this._menu = items || null; m.classList.toggle('show', !!items); if (!items) return;
    const hd = document.createElement('div'); hd.className = 'hd'; hd.textContent = title; m.appendChild(hd);
    items.forEach(([label], i) => { const b = document.createElement('button'); b.className = 'vw-chip'; b.textContent = label; b.dataset.mi = i; m.appendChild(b); });
    const c = document.createElement('button'); c.className = 'vw-chip tp'; c.textContent = this.t('close'); c.dataset.mi = -1; m.appendChild(c);
    clearTimeout(this._menuT); this._menuT = setTimeout(() => this.menu(null), 9000);
  }
  _click(ev) {
    const b = ev.target.closest('button'); if (!b) return; const ds = b.dataset;
    if (ds.mi != null) { const it = this._menu && this._menu[+ds.mi]; this.menu(null); if (it) it[1](); return; }
    if (ds.dest) return this.goTo(ds.dest);
    if (ds.deck) return this.liftTo(+ds.deck);
    if (ds.lift) return this.liftTo(+ds.lift);
    if (ds.y === 'back') return this.leave({ to: 'entrance' });
    if (ds.y === 'act') return this._act && this._act.fn();
    if (ds.y === 'snd') { if (!this.audio.unlocked) this.audio.unlock(); else this.audio.setMuted(!this.audio.muted); return this._sndBtn(); }
    if (ds.y === 'show') return this.audio.toggleShow && this.audio.toggleShow();
    if (ds.y === 'auto') return this.helm.auto();
    if (ds.y === 'ret') return this.helm.ret();
    if (ds.y === 'hleave') return this.leaveHelm();
  }
  _helmHud() { /* class toggles do the work */ }
  _hudUpdate(force) {
    if (!this.active) return;
    const w = this.w, L = LOBBY.lift;
    if (this.lang !== String(this.walk.lang || 'en').slice(0, 2)) { this._texts(); force = true; }
    if (force) this._title();
    // lift car: the deck chooser shows while standing inside
    const inCar = !w.dock && w.x > L.x0 && w.x < L.x1 && w.z > L.z0 + 0.2 && w.z < L.z1;
    if (inCar && !this._liftOpen && !this.busy && !this._wasInCar) this.liftPanel(true);
    if (!inCar && this._wasInCar) this.liftPanel(false);
    this._wasInCar = inCar;
    // helm read-out
    if (this.mode === 'helm' || !this.helm.docked) {
      const H = this.helm, e = this.el;
      e.spd.textContent = (Math.abs(H.speed) * 1.944).toFixed(1); e.hdg.textContent = String(Math.round(H.heading())).padStart(3, '0');
      const st = H.mode === 'auto' ? this.t('cruise') : H.mode === 'return' ? this.t('docking') : H.docked ? this.t('docked') : this.t('manual');
      if (e.hst.textContent !== st) { e.hst.textContent = st; this._title(); }
      e.auto.classList.toggle('on', H.mode === 'auto'); e.ret.classList.toggle('on', H.mode === 'return');
      e.thrK.style.top = `calc(${(1 - (H.throttle + 0.5) / 1.5) * 100}% - ${(1 - (H.throttle + 0.5) / 1.5) * 22 + 0}px + ${12 - (1 - (H.throttle + 0.5) / 1.5) * 24}px)`;
      e.rudK.style.left = `calc(${(H.rudder * 0.5 + 0.5) * 100}% - ${(H.rudder * 0.5 + 0.5) * 22}px + ${14 - (H.rudder * 0.5 + 0.5) * 28}px)`;
    } else if (this.el.hst.textContent) { this.el.hst.textContent = ''; this._title(); }
    if (this.hintTick) this.hintTick();
    this.el.show.classList.toggle('show', !!(this.cur && this.cur.id === 'beach'));
  }

  dispose() {
    this.disposed = true; this.active = false;
    try { if (this.casino) this.casino.dispose(); } catch { /* */ }
    try { this.heli.dispose(); this.audio.dispose(); this.people.dispose(); this.helm.dispose(); } catch { /* */ }
    for (const z of this.zones.values()) if (z.built) this.dropZone(z);
    this.shell.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
    this.el.hud.remove(); this._style.remove();
    this.walk.root.classList.remove('yacht', 'yhelm', 'ypose');
    this._holdProxy(false);
  }
}

// ------------------------------------------------------------------ things to do on board
Object.assign(Yacht.prototype, {
  // moving lights of the disco, helm screens, disco light colours
  _fxTick(dt) {
    const b = this.zones.get('beach');
    if (b && b.built && b.group.visible) discoTick(this, b, dt);   // the look of the moment, the rig, the pooled lights (yacht-disco.js)
    if (this._screen && (this.cur && (this.cur.id === 'bridge' || this.cur.id === 'lobby4')) && this.time - (this._screenT || 0) > 0.4) { this._screenT = this.time; this._drawScreen(); }
    if (this.dance) { this.dance.t -= dt; if (this.dance.t <= 0) this.dance = null; }
  },
  poseTick(dt) {
    // dancing: the visitor's view bobs to the beat; a held glass sways with it
    const P = this.walk.player;
    if (this.dance && this.mode === 'walk') { const ph = this.audio.beatTime * Math.PI; P.eye = EYE - Math.abs(Math.sin(ph)) * 0.045; this.w.x += Math.sin(ph) * 0.0015; }
    if (this.held) { const g = this.held.d.group, t = this.time; if (!this.held.anim) g.position.set(0.16 + Math.sin(t * 1.1) * 0.004, -0.2 + Math.sin(t * 1.7) * 0.004 - (this.dance ? Math.abs(Math.sin(this.audio.beatTime * Math.PI)) * 0.02 : 0), -0.42); }
    // context button
    let a = null;
    if (this.mode === 'massage') a = { label: this.t('massageEnd'), fn: () => this._endPose() };
    else if (this.mode === 'lie' || this.mode === 'sit') a = { label: this.t('getUp'), fn: () => this._endPose() };
    else if (this.held && this.mode === 'walk') a = this.held.level > 0 ? { label: this.t('drinkSip'), fn: () => this.sip() } : { label: this.t('drinkPut'), fn: () => this.held.put() };
    if (!a && this.heli) a = this.heli.act();   // beside the helicopter: "Board the helicopter"
    if ((a && a.label) !== (this._act && this._act.label)) this.setAct(a);
  },
  hintTick() {
    const z = this.cur; if (!z) return; const H = this._hints || (this._hints = {});
    const once = (k, key, ms = 3400) => { if (!H[k]) { H[k] = 1; this.walk._toast(this.t(key), ms); } };
    if (z.id === 'quay' && this.helm.docked && this.w.x > -90) once('board', 'boardHint');
    if ((z.id === 'sundeck' && this.w.x > -12 && this.w.z < 0) || (z.id === 'beach' && this.w.z > 2.5 && this.w.x > -52 && this.w.x < -45)) { if (!this.held) once('drink', 'drinkTake'); }
    if (z.id === 'massage') once('massage', 'massageStart');
    if (z.id === 'salon') once('door', 'doorHint');
  },
  lieDown(seat) { if (this.mode !== 'walk') return; this.dropDrink(); return this.pose({ ...seat }).then((ok) => { if (ok) this.walk._toast(this.t('tapUp'), 2200); }); },
  sitDown(seat) { if (this.mode !== 'walk') return; return this.pose({ ...seat }).then((ok) => { if (ok) this.walk._toast(this.t('tapUp'), 2200); }); },
  // spa: robe from the hook (fade), lie face down, the therapist works, tap / button to finish
  async massage(seat, robe) {
    if (this.busy || this.mode !== 'walk') return;
    this.dropDrink();
    const walk = this.walk;
    walk._toast(this.t('massageRobe'), 2600); this.audio.sfx('robe');
    const gen = this._gen;
    await this.wait(500); await walk._fade(true);
    if (gen !== this._gen || this.mode !== 'walk') { walk._fade(false); return; }
    robe.visible = false;
    const ok = await this.pose({ ...seat, onEnd: async (instant) => {
      if (!instant) await walk._fade(true);
      robe.visible = true; this.massaging = false; this.people.setAnim('masseuse', 'idle'); this.audio.zone(this.cur);
      if (!instant) setTimeout(() => walk._fade(false), 350);
    } }, 30);
    if (!ok) { robe.visible = true; walk._fade(false); return; }
    this.massaging = true; this.people.setAnim('masseuse', 'massage'); this.audio.zone(this.cur);
    await this.wait(500); await walk._fade(false);
    walk._toast(this.t('massageOn'), 4200);
  },
  // drinks: take from the bar → in hand (a child of the camera) → sip until empty → put back
  takeDrink(d) {
    if (this.busy || this.mode !== 'walk') return;
    if (this.held) { if (this.held.d === d) return; this.held.put(true); }
    const cam = this.walk.camera, g = d.group, parent = g.parent, home = d.home.clone();
    d.proxy.visible = false;
    cam.add(g); g.position.set(0.16, -0.2, -0.42); g.rotation.set(0.1, 0, -0.06); g.scale.setScalar(1);
    // tap targets: the glass in the hand (sip) and its place on the bar (put back)
    const hp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.12), d.proxy.material); hp.position.set(0, 0.1, 0); hp.userData.yact = () => this.sip(); hp.userData.hand = true; g.add(hp);
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), d.proxy.material); bp.position.copy(home).y += 0.1; bp.userData.yact = () => this.held && this.held.put(); parent.add(bp);
    this.extraTargets = [hp, bp];
    const held = { d, level: 1, anim: false, put: (instant) => {
      cam.remove(g); hp.removeFromParent(); bp.removeFromParent(); this.extraTargets = null;
      if (parent.parent) { parent.add(g); g.position.copy(home); g.rotation.set(0, 0, 0); d.proxy.visible = true; }
      d.liq.scale.y = d.full; d.liq.visible = true; this.held = null;
      if (!instant) this.audio.sfx('take');
    } };
    this.held = held; this.audio.sfx('take');
    this.walk._toast(this.t('drinkHave'), 2400);
  },
  async sip() {
    const h = this.held; if (!h || h.anim) return;
    if (h.level <= 0) return this.walk._toast(this.t('drinkEmpty'), 2600);
    h.anim = true; const g = h.d.group, from = g.position.clone(), to = new THREE.Vector3(0.02, -0.075, -0.2);
    await this._tween(520, k => { const e = k * k * (3 - 2 * k); g.position.lerpVectors(from, to, e); g.rotation.set(0.1 + 0.75 * e, 0, -0.06 * (1 - e)); });
    this.audio.sfx('sip'); h.level = Math.max(0, h.level - 0.25);
    await this._tween(500, k => { h.d.liq.scale.y = Math.max(0.0001, h.d.full * (h.level + 0.25 * (1 - k))); });
    if (h.level <= 0) h.d.liq.visible = false;
    await this._tween(480, k => { const e = 1 - k * k * (3 - 2 * k); g.position.lerpVectors(from, to, e); g.rotation.set(0.1 + 0.75 * e, 0, -0.06 * (1 - e)); });
    h.anim = false;
    if (h.level <= 0) this.walk._toast(this.t('drinkEmpty'), 3000);
  },
  async clink() {
    const h = this.held; this.audio.sfx('clink'); if (!h || h.anim) return;
    h.anim = true; const g = h.d.group, from = g.position.clone(), to = new THREE.Vector3(0.06, -0.12, -0.56);
    await this._tween(900, k => { const e = Math.sin(k * Math.PI); g.position.lerpVectors(from, to, e); });
    h.anim = false;
  },
  danceWith(sec) { this.dance = { t: sec }; },
  // bridge screens: chart of the lake with the yacht and the route · speed / heading / throttle · depth sounder
  helmScreen() {
    if (!this._screen) {
      const c = document.createElement('canvas'); c.width = 768; c.height = 256; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const m = new THREE.MeshBasicMaterial({ map: t }); m.name = 'y-keep-helmscreen'; m.toneMapped = false;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of NAV_SHORE) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      this._screen = { c, t, m, bb: [x0, x1, z0, z1] }; this._drawScreen();
    }
    return this._screen.m;
  },
  _drawScreen() {
    const S = this._screen, g = S.c.getContext('2d'), H = this.helm, [x0, x1, z0, z1] = S.bb;
    g.fillStyle = '#04090f'; g.fillRect(0, 0, 768, 256);
    // 1 — chart (north-up is not needed: the lake as the world has it, x → right, z → down)
    const k = Math.min(236 / (x1 - x0), 236 / (z1 - z0)), ox = 128 - (x0 + x1) / 2 * k, oz = 128 - (z0 + z1) / 2 * k, X = (x) => ox + x * k, Zc = (z) => oz + z * k;
    g.beginPath(); NAV_SHORE.forEach(([x, z], i) => i ? g.lineTo(X(x), Zc(z)) : g.moveTo(X(x), Zc(z))); g.closePath(); g.fillStyle = '#0b2c44'; g.fill(); g.strokeStyle = '#2f86b8'; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = 'rgba(201,164,92,0.75)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(DOCK.pos[0]), Zc(DOCK.pos[1])); LOOP.forEach(([x, z]) => g.lineTo(X(x), Zc(z))); g.closePath(); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#c9a45c'; g.fillRect(X(PIER.S[0]) - 2, Zc(PIER.S[1]) - 2, 5, 5);
    g.save(); g.translate(X(H.pose.x), Zc(H.pose.z)); g.rotate(-H.pose.yaw); g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, 4); g.lineTo(-6, -4); g.closePath(); g.fill(); g.restore();
    g.fillStyle = '#7fb4d6'; g.font = '11px sans-serif'; g.fillText('LACUL MORII', 10, 18);
    // 2 — speed, heading, throttle, rudder
    g.fillStyle = '#c9a45c'; g.font = '600 64px Georgia,serif'; g.textAlign = 'center'; g.fillText((Math.abs(H.speed) * 1.944).toFixed(1), 384, 96);
    g.font = '13px sans-serif'; g.fillStyle = '#9fb4c6'; g.fillText('KN', 384, 118);
    g.font = '600 34px Georgia,serif'; g.fillStyle = '#e9e2cf'; g.fillText(String(Math.round(H.heading())).padStart(3, '0') + '°', 384, 170);
    g.fillStyle = '#16283a'; g.fillRect(280, 196, 208, 12); g.fillStyle = '#c9a45c'; const tw = H.throttle * (H.throttle >= 0 ? 138 : 69); g.fillRect(349 + Math.min(0, tw), 196, Math.abs(tw), 12);
    g.fillStyle = '#16283a'; g.fillRect(280, 222, 208, 8); g.fillStyle = '#7fd8ff'; g.fillRect(384 + Math.min(0, -H.rudder * 100), 222, Math.abs(H.rudder * 100), 8);
    g.font = '11px sans-serif'; g.fillStyle = '#7fb4d6'; g.fillText(H.mode === 'auto' ? 'AUTOPILOT' : H.mode === 'return' ? 'RETURN · ' + String(H.phase || '').toUpperCase() : H.docked ? 'MOORED' : 'MANUAL', 384, 28);
    // 3 — radar sweep + depth under the bow
    g.textAlign = 'left'; const cx = 640, cy = 120;
    g.strokeStyle = '#1f5f4a'; g.lineWidth = 1; for (const r of [30, 60, 90]) { g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke(); }
    const a = this.time * 1.6; const gr = g.createConicGradient ? g.createConicGradient(a, cx, cy) : null;
    if (gr) { gr.addColorStop(0, 'rgba(60,255,160,0.55)'); gr.addColorStop(0.12, 'rgba(60,255,160,0)'); gr.addColorStop(1, 'rgba(60,255,160,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 90, 0, 6.283); g.fill(); }
    g.fillStyle = '#3cffa0'; for (let i = 0; i < 16; i++) { const an = i / 16 * 6.283, c0 = clearance(H.pose.x + Math.cos(an) * 60, H.pose.z + Math.sin(an) * 60); const rr = Math.max(8, Math.min(88, 20 + c0 * 0.45)); g.fillRect(cx + Math.cos(an + H.pose.yaw) * rr - 1.5, cy + Math.sin(an + H.pose.yaw) * rr - 1.5, 3, 3); }
    const dep = clearance(H.pose.x + Math.cos(H.pose.yaw) * 66, H.pose.z - Math.sin(H.pose.yaw) * 66);
    g.font = '12px sans-serif'; g.fillStyle = dep < 45 ? '#ff6a4a' : '#7fb4d6'; g.fillText('DEPTH ' + Math.max(0, dep * 0.12 + 2).toFixed(1) + ' m', 580, 238);
    S.t.needsUpdate = true;
  },
});

export function createYacht(walk) { return new Yacht(walk); }
export { PIER };
