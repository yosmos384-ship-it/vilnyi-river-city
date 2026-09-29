// VILNYI RIVER CITY — first-person walkthrough engine (Agent E).
// One renderer + scene: environment (B) + complex (B) + floor commons & lifts (D) + the target apartment (C).
// Controls (desktop + touch), collisions against userData.solid, floor following on userData.floor,
// lift rides, teleports, 360° mode, design switcher, minimap and a black/gold RTL-aware HUD.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  UNITS, TYPES, CORES, CORRIDORS, BUILDINGS, GEOM, LEVELS, FOOTPRINT, TOP_FLOOR,
  floorY, unitById, unitsOn, blocksOn, unitLabel, unitToLocal, unitToWorld, unitYaw, money,
} from '../data.js';

const EYE = 1.62, EYE_360 = 1.55, SPEED = 1.4, RUN = 2.4, RADIUS = 0.28, STEP_UP = 0.45, STEP_DOWN = 1.1;
const RAY_HEIGHTS = [0.3, 1.0, 1.6];
const CAR_DEPTH = 1.05;        // lift car centre behind the landing door (m)
const MAX_DPR = 1.75;

// English fallbacks for every HUD string (used when i18n has no such key).
const EN = {
  'walk.lobby': 'Lobby', 'walk.corridor': 'Corridor', 'walk.apartment': 'Apartment', 'walk.balcony': 'Balcony',
  'walk.parking': 'Parking', 'walk.lift': 'Lift', 'walk.floor': 'Floor', 'walk.ground': 'Ground floor',
  'walk.reserve': 'Reserve', 'walk.exit': 'Exit', 'walk.design': 'Design', 'walk.day': 'Day', 'walk.dusk': 'Dusk',
  'walk.night': 'Night', 'walk.walk': 'Walk', 'walk.360': '360°', 'walk.rooms': 'Rooms', 'walk.goto': 'Go to',
  'walk.loading': 'Preparing the residence…', 'walk.chooseFloor': 'Choose a floor', 'walk.help': 'How to move',
  'walk.help.title': 'Explore freely', 'walk.help.ok': 'Start exploring',
  'walk.help.drag': 'Drag to look around', 'walk.help.keys': 'W A S D or the arrow keys to walk',
  'walk.help.dblclick': 'Double-click the floor to glide there', 'walk.help.pad': 'Hold the arrows to walk and turn',
  'walk.help.dbltap': 'Double-tap to glide forward', 'walk.help.click': 'Tap doors and lift buttons to use them',
  'walk.help.360': '360° mode: stand still and look around',
  'walk.room.living': 'Living', 'walk.room.kitchen': 'Kitchen', 'walk.room.hall': 'Hall', 'walk.room.bedroom': 'Bedroom',
  'walk.room.bath': 'Bathroom', 'walk.room.storage': 'Storage', 'walk.room.dressing': 'Dressing', 'walk.room.balcony': 'Balcony',
  'walk.room.loggia': 'Loggia', 'walk.room.terrace': 'Terrace', 'walk.upper': 'upper level',
  'walk.photo': 'Photo', 'walk.photoSaved': 'Photo captured',
  'walk.settings': 'Settings', 'walk.map': 'Map', 'walk.zoomIn': 'Zoom in', 'walk.zoomOut': 'See more', 'walk.help.pinch': 'Pinch to see more or zoom in',
};
// Strings introduced with the 3D lift panel / open-any-door features, in all 8 site languages
// (used only when the site's i18n has no such key).
const LOCAL = {
  en: { 'walk.reserveThis': 'Reserve this apartment', 'walk.floors': 'Floors', 'walk.tapDoor': 'Tap the door to open it', 'walk.tapKey': 'Tap a floor button on the panel', 'walk.alarm': 'Alarm bell (demo)', 'walk.roomsN': 'rooms', 'walk.status.reserved': 'Reserved', 'walk.status.sold': 'Sold' },
  he: { 'walk.reserveThis': 'שריינו את הדירה הזו', 'walk.floors': 'קומות', 'walk.tapDoor': 'הקישו על הדלת כדי לפתוח אותה', 'walk.tapKey': 'הקישו על כפתור הקומה בלוח המעלית', 'walk.alarm': 'פעמון אזעקה (הדגמה)', 'walk.roomsN': 'חד׳', 'walk.status.reserved': 'משוריינת', 'walk.status.sold': 'נמכרה', 'walk.lift': 'מעלית', 'walk.floor': 'קומה', 'walk.corridor': 'מסדרון', 'walk.ground': 'קומת קרקע' },
  ru: { 'walk.reserveThis': 'Забронировать эту квартиру', 'walk.floors': 'Этажи', 'walk.tapDoor': 'Нажмите на дверь, чтобы открыть', 'walk.tapKey': 'Нажмите кнопку этажа на панели', 'walk.alarm': 'Кнопка вызова (демо)', 'walk.roomsN': 'комн.', 'walk.status.reserved': 'Забронирована', 'walk.status.sold': 'Продана' },
  uk: { 'walk.reserveThis': 'Забронювати цю квартиру', 'walk.floors': 'Поверхи', 'walk.tapDoor': 'Торкніться дверей, щоб відчинити', 'walk.tapKey': 'Натисніть кнопку поверху на панелі', 'walk.alarm': 'Кнопка виклику (демо)', 'walk.roomsN': 'кімн.', 'walk.status.reserved': 'Заброньована', 'walk.status.sold': 'Продана' },
  ro: { 'walk.reserveThis': 'Rezervă acest apartament', 'walk.floors': 'Etaje', 'walk.tapDoor': 'Atinge ușa pentru a o deschide', 'walk.tapKey': 'Apasă butonul etajului de pe panou', 'walk.alarm': 'Alarmă (demo)', 'walk.roomsN': 'camere', 'walk.status.reserved': 'Rezervat', 'walk.status.sold': 'Vândut' },
  fr: { 'walk.reserveThis': 'Réserver cet appartement', 'walk.floors': 'Étages', 'walk.tapDoor': 'Touchez la porte pour l’ouvrir', 'walk.tapKey': 'Appuyez sur un bouton d’étage du panneau', 'walk.alarm': 'Alarme (démo)', 'walk.roomsN': 'pièces', 'walk.status.reserved': 'Réservé', 'walk.status.sold': 'Vendu' },
  it: { 'walk.reserveThis': 'Prenota questo appartamento', 'walk.floors': 'Piani', 'walk.tapDoor': 'Tocca la porta per aprirla', 'walk.tapKey': 'Premi il pulsante del piano sul pannello', 'walk.alarm': 'Allarme (demo)', 'walk.roomsN': 'locali', 'walk.status.reserved': 'Riservato', 'walk.status.sold': 'Venduto' },
  de: { 'walk.reserveThis': 'Diese Wohnung reservieren', 'walk.floors': 'Etagen', 'walk.tapDoor': 'Tippen Sie auf die Tür, um sie zu öffnen', 'walk.tapKey': 'Tippen Sie auf eine Etagentaste', 'walk.alarm': 'Notruf (Demo)', 'walk.roomsN': 'Zimmer', 'walk.status.reserved': 'Reserviert', 'walk.status.sold': 'Verkauft' },
};
const MAX_APTS = 2;          // apartments kept loaded at once (the farthest one is disposed)
const LIGHT_SLOTS = 8;       // fixed pool of apartment point lights → the light count never changes (no shader recompiles)
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const HFOV_MIN = 30, HFOV_MAX = 110, HFOV_PORTRAIT = 78, VFOV_LANDSCAPE = 68, HFOV_LANDSCAPE_MAX = 100, VFOV_CAP = 150;
const IDLE_FADE_MS = 4000;
const ICON_GEAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.6H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.04a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z"/></svg>';
const ICON_MAP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>';
const FALLBACK_STYLES = [
  { id: 'milano', name: { he: 'מילאנו', en: 'Milano', ru: 'Милано' } },
  { id: 'nordic', name: { he: 'נורדי', en: 'Nordic', ru: 'Нордик' } },
  { id: 'riviera', name: { he: 'ריביירה', en: 'Riviera', ru: 'Ривьера' } },
];
const OUTDOOR = new Set(['balcony', 'loggia', 'terrace']);

// ---------- small helpers ----------
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const yawFromDir = (dx, dz) => Math.atan2(-dx, -dz);
function worldToLocal(bId, x, z) {
  const b = BUILDINGS[bId], c = Math.cos(b.rotY), s = Math.sin(b.rotY), dx = x - b.origin[0], dz = z - b.origin[1];
  return [dx * c - dz * s, dx * s + dz * c];
}
function localToWorldXZ(bId, x, z) {
  const b = BUILDINGS[bId], c = Math.cos(b.rotY), s = Math.sin(b.rotY);
  return [b.origin[0] + x * c + z * s, b.origin[1] - x * s + z * c];
}
function dirToWorld(bId, dx, dz) { const r = BUILDINGS[bId].rotY, c = Math.cos(r), s = Math.sin(r); return [dx * c + dz * s, -dx * s + dz * c]; }
function localToUnit(unit, x, z) {
  const f = unit.frame, dx = x - f.o[0], dz = z - f.o[1];
  return [dx * f.U[0] + dz * f.U[1], dx * f.V[0] + dz * f.V[1]];
}
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyCentroid(poly) { let x = 0, y = 0; for (const p of poly) { x += p[0]; y += p[1]; } return [x / poly.length, y / poly.length]; }
function isTouchDevice() { return (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window; }
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
function disposeMaterial(m) {
  if (!m) return;
  for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
  if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) u.value.dispose();
  m.dispose();
}
function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
    if (o.isInstancedMesh && o.dispose) o.dispose();
  });
}
function tween(dur, fn) {
  return new Promise(res => {
    const t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); fn(k < 1 ? k * k * (3 - 2 * k) : 1); k < 1 ? requestAnimationFrame(step) : res(); };
    step();
  });
}

// Load the sibling modules; any that is missing or throws is replaced by null (the walkthrough degrades gracefully).
async function loadModules(injected = {}) {
  const out = { ...injected };
  const tryImport = async (key, path) => {
    if (out[key]) return;
    try { out[key] = await import(path); } catch (e) { console.warn(`[walk] ${path} unavailable — continuing without it`, e); out[key] = null; }
  };
  await Promise.all([
    tryImport('environment', './environment.js'), tryImport('exterior', './exterior.js'),
    tryImport('apartment', './apartment.js'), tryImport('commons', './commons.js'), tryImport('materials', './materials.js'),
  ]);
  return out;
}

// ---------- HUD stylesheet (scoped under .vw) ----------
const CSS = `
.vw{position:absolute;inset:0;overflow:hidden;background:#050505;color:#f3ead7;font-family:"Manrope","Inter Tight","Heebo","Assistant",system-ui,sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:pan-x;-webkit-text-size-adjust:100%;
  --g:#c9a45c;--g2:#e6c987;--bg:rgba(8,8,8,.66);--ln:rgba(201,164,92,.40);
  --sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px);--st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px)}
.vw canvas.vw-gl{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none;cursor:grab}
.vw canvas.vw-gl.drag{cursor:grabbing}.vw canvas.vw-gl.act{cursor:pointer}
.vw-hud{position:absolute;inset:0;pointer-events:none}
.vw-hud>*{pointer-events:auto}
:where(.vw) button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.vw-panel{background:var(--bg);-webkit-backdrop-filter:blur(12px) saturate(1.2);backdrop-filter:blur(12px) saturate(1.2);border:1px solid var(--ln);border-radius:12px}
.vw-top,.vw-tools,.vw-map,.vw-mapbtn,.vw-pad,.vw-bottom,.vw-lift{transition:opacity .45s ease}
.vw-top{position:absolute;top:calc(10px + var(--st));left:calc(10px + var(--sl));right:calc(10px + var(--sr));display:flex;gap:8px;align-items:flex-start;justify-content:space-between;pointer-events:none}
.vw-top>*{pointer-events:auto}
.vw-title{padding:7px 12px;min-width:0;max-width:min(58vw,460px)}
.vw-title .t1{unicode-bidi:plaintext;text-align:start;font-family:"Cormorant Garamond","Bodoni Moda",Georgia,serif;font-size:15px;letter-spacing:.04em;color:var(--g2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vw-title .t2{font-size:11.5px;opacity:.88;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vw-title .t2 b{color:var(--g);font-weight:600}
.vw-actions{display:flex;gap:7px;flex-shrink:0}
.vw-btn{height:34px;padding:0 13px;border-radius:999px;display:inline-flex;align-items:center;gap:7px;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;touch-action:manipulation}
.vw-gold{background:linear-gradient(135deg,#e6c987,#b88a3c);color:#111;font-weight:700;box-shadow:0 5px 16px rgba(201,164,92,.22)}
.vw-ghost{background:var(--bg);border:1px solid var(--ln);color:#f3ead7;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.vw-ghost:hover{border-color:var(--g)}
.vw-ghost.on{border-color:var(--g);color:var(--g2);background:rgba(201,164,92,.16)}
.vw-price{font-weight:500;opacity:.8;letter-spacing:0;text-transform:none}
.vw-icon{width:34px;padding:0;justify-content:center}
.vw-gear{display:none}
.vw-tools{position:absolute;top:calc(58px + var(--st));right:calc(10px + var(--sr));display:flex;flex-direction:column;gap:7px;align-items:stretch;padding:7px;width:112px}
.vw[dir=rtl] .vw-tools{right:auto;left:calc(10px + var(--sl))}
.vw-seg{display:flex;border:1px solid var(--ln);border-radius:999px;overflow:hidden}
.vw-seg button{flex:1;padding:6px 0;font-size:11px;letter-spacing:.04em;color:#d9ccb0;touch-action:manipulation}
.vw-seg button.on{background:var(--g);color:#111;font-weight:700}
.vw-zoom{direction:ltr;align-items:center}
.vw-zoom button{font-size:15px;line-height:1;padding:4px 0;color:var(--g2)}
.vw-zoom button:active{background:rgba(201,164,92,.25)}
.vw-zoom .zv{flex:1.1;text-align:center;font-size:10.5px;letter-spacing:.04em;color:#e9dfc8;font-variant-numeric:tabular-nums}
.vw-tlabel{text-align:start;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--g);opacity:.9;padding:2px 4px 0}
.vw-styles{display:flex;flex-direction:column;gap:3px}
.vw-styles button{text-align:start;padding:5px 9px;border-radius:8px;font-size:11.5px;border:1px solid transparent;color:#e9dfc8}
.vw-styles button.on{border-color:var(--g);color:var(--g2);background:rgba(201,164,92,.10)}
.vw-prow{display:none}
.vw-bottom{position:absolute;bottom:calc(10px + var(--sb));left:calc(10px + var(--sl));right:calc(10px + var(--sr));display:flex;flex-direction:column;gap:6px;pointer-events:none}
.vw-row{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;pointer-events:auto;padding:1px;max-width:100%;align-self:center;touch-action:pan-x}
.vw-row::-webkit-scrollbar,.vw-bottom::-webkit-scrollbar{display:none}
.vw-chip{flex-shrink:0;height:30px;padding:0 12px;border-radius:999px;font-size:11.5px;white-space:nowrap;background:var(--bg);border:1px solid var(--ln);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:#efe5cf;touch-action:pan-x}
.vw-chip:hover{border-color:var(--g)}
.vw-chip.on{background:var(--g);border-color:var(--g);color:#111;font-weight:700}
.vw-chip.tp{border-style:dashed}
.vw-map{position:absolute;inset-inline-start:calc(10px + var(--sl));bottom:calc(88px + var(--sb));padding:5px;border-radius:11px}
.vw-map canvas{display:block;width:170px;height:106px;border-radius:7px;cursor:pointer}
.vw-mapbtn{display:none}
.vw-pad{position:absolute;right:calc(12px + var(--sr));bottom:calc(88px + var(--sb));width:112px;height:112px;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);gap:4px;direction:ltr}
.vw[dir=rtl] .vw-pad{right:auto;left:calc(12px + var(--sl))}
.vw-pad button{border-radius:11px;background:var(--bg);border:1px solid var(--ln);color:var(--g2);font-size:15px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);touch-action:none}
.vw-pad button.on{background:var(--g);color:#111}
.vw-pad .u{grid-area:1/2}.vw-pad .l{grid-area:2/1}.vw-pad .r{grid-area:2/3}.vw-pad .d{grid-area:3/2}
.vw-lift{position:absolute;inset-inline-end:136px;bottom:calc(88px + var(--sb));padding:9px;width:152px;display:none}
.vw-lift.show{display:block}
.vw-lift .hd{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--g);margin-bottom:7px;display:flex;justify-content:space-between;align-items:center}
.vw-lift .ind{font-family:"Cormorant Garamond",Georgia,serif;font-size:19px;color:var(--g2);letter-spacing:0;white-space:nowrap}
.vw-lift .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;direction:ltr}
.vw-lift .grid button{height:29px;border-radius:50%;aspect-ratio:1;border:1px solid var(--ln);font-size:11px;color:#efe5cf;justify-self:center;touch-action:manipulation}
.vw-lift .grid button.on{background:var(--g);color:#111;box-shadow:0 0 12px rgba(230,201,135,.7)}
.vw-lift .grid button.here{border-color:var(--g2);color:var(--g2)}
.vw-toast{position:absolute;top:calc(64px + var(--st));left:50%;transform:translateX(-50%);padding:7px 14px;border-radius:999px;font-size:12px;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
.vw-toast.show{opacity:1}
.vw-fade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .28s}
.vw-loading{position:absolute;inset:0;display:flex;flex-direction:column;gap:16px;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#15120c 0%,#050505 70%);transition:opacity .5s;z-index:5}
.vw-loading.hide{opacity:0;pointer-events:none}
.vw-loading .ring{width:46px;height:46px;border-radius:50%;border:1.5px solid rgba(201,164,92,.25);border-top-color:var(--g);animation:vwspin 1s linear infinite}
.vw-loading .lt{font-family:"Cormorant Garamond",Georgia,serif;font-size:19px;letter-spacing:.08em;color:var(--g2)}
@keyframes vwspin{to{transform:rotate(360deg)}}
.vw-help{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:4}
.vw-help.show{display:flex}
.vw-help .card{max-width:min(420px,calc(100% - 32px));padding:24px 24px 20px;border-radius:18px;background:rgba(10,10,10,.92);border:1px solid var(--ln)}
.vw-help h3{margin:0 0 14px;font-family:"Cormorant Garamond","Bodoni Moda",Georgia,serif;font-weight:500;font-size:26px;color:var(--g2);letter-spacing:.03em}
.vw-help ul{list-style:none;margin:0 0 18px;padding:0;display:flex;flex-direction:column;gap:10px}
.vw-help li{display:flex;gap:12px;align-items:center;font-size:14px;line-height:1.35}
.vw-help li i{flex:0 0 34px;height:34px;border-radius:50%;border:1px solid var(--ln);display:flex;align-items:center;justify-content:center;font-style:normal;color:var(--g);font-size:14px}
.vw-help .vw-btn{width:100%;justify-content:center;height:40px;font-size:13px}
.vw-help h3,.vw-help li span,.vw-chip,.vw-toast,.vw-styles button,.vw-title .t2,.vw-loading .lt,.vw-prow span{unicode-bidi:plaintext}
.vw-helpbtn{font-size:14px}
.vw.m360 .vw-pad .u,.vw.m360 .vw-pad .d{visibility:hidden}
.vw.riding .vw-pad,.vw.riding .vw-bottom{opacity:.35;pointer-events:none}
@media (max-width:900px){.vw-price{display:none}}

/* ---------- phones (pointer:coarse or < 700px): the 3D view comes first ---------- */
.vw.phone{--bg:rgba(10,9,7,.46);--ln:rgba(201,164,92,.34)}
.vw.phone .vw-top{top:calc(6px + var(--st));left:calc(8px + var(--sl));right:calc(8px + var(--sr));gap:6px;align-items:center}
.vw.phone .vw-title{flex:1 1 auto;max-width:none;padding:5px 11px;border-radius:12px}
.vw.phone .vw-title .brand{display:none}
.vw.phone .vw-title .t1{font-size:13.5px;line-height:1.2}
.vw.phone .vw-title .t2{font-size:10.5px;margin-top:0}
.vw.phone .vw-actions{gap:6px}
.vw.phone .vw-btn{height:38px;padding:0 12px;font-size:10.5px;letter-spacing:.05em}
.vw.phone .vw-gold{box-shadow:0 3px 10px rgba(0,0,0,.35)}
.vw.phone .vw-icon,.vw.phone .vw-exit,.vw.phone .vw-photo{width:38px;padding:0;justify-content:center}
.vw.phone .vw-exit .lbl,.vw.phone .vw-photo .lbl,.vw.phone .vw-price,.vw.phone .vw-helpbtn{display:none}
.vw.phone .vw-gear{display:inline-flex}
.vw.phone .vw-tools{display:none;position:absolute;top:calc(52px + var(--st));right:calc(8px + var(--sr));left:auto;width:212px;padding:10px;gap:9px;border-radius:16px;
  background:rgba(10,9,7,.84);box-shadow:0 14px 40px rgba(0,0,0,.5);transform-origin:top right;animation:vwpop .16s ease-out}
.vw.phone[dir=rtl] .vw-tools{left:calc(8px + var(--sl));right:auto;transform-origin:top left}
.vw.phone .vw-tools.open{display:flex}
@keyframes vwpop{from{opacity:0;transform:scale(.96) translateY(-4px)}to{opacity:1;transform:none}}
.vw.phone .vw-seg button{padding:8px 0;font-size:11.5px}
.vw.phone .vw-zoom button{font-size:17px;padding:5px 0}
.vw.phone .vw-tlabel.st{pointer-events:none}
.vw.phone .vw-tools .vw-styles{display:flex;flex-flow:row wrap;gap:5px}
.vw.phone .vw-styles button{flex:1 1 auto;text-align:center;padding:6px 8px;border-color:var(--ln);border-radius:999px;font-size:11.5px}
.vw.phone .vw-styles button.on{border-color:var(--g)}
.vw.phone .vw-prow{display:flex;align-items:center;gap:9px;padding:7px 4px 1px;border-top:1px solid rgba(201,164,92,.18);font-size:12px;color:#e9dfc8;text-align:start}
.vw.phone .vw-prow i{flex:0 0 22px;height:22px;border-radius:50%;border:1px solid var(--ln);display:flex;align-items:center;justify-content:center;font-style:normal;color:var(--g);font-size:11px}
.vw.phone .vw-bottom{bottom:calc(6px + var(--sb));left:var(--sl);right:var(--sr);flex-direction:row;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;
  scrollbar-width:none;padding:1px 8px;pointer-events:auto;touch-action:pan-x;overscroll-behavior-x:contain;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 10px,#000 calc(100% - 10px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 10px,#000 calc(100% - 10px),transparent 100%)}
.vw.phone .vw-row{overflow:visible;flex-shrink:0;align-self:auto;max-width:none;padding:0;gap:6px}
.vw.phone .vw-tp{padding-inline-start:7px;border-inline-start:1px solid rgba(201,164,92,.3)}
.vw.phone .vw-tp:empty,.vw.phone .vw-rooms:empty{display:none}
.vw.phone .vw-chip{height:32px;padding:0 12px;font-size:11.5px}
.vw.phone .vw-map{bottom:calc(46px + var(--sb));inset-inline-start:calc(8px + var(--sl));padding:3px;border-radius:10px}
.vw.phone .vw-map canvas{width:96px;height:68px;border-radius:7px}
.vw.phone.mapoff .vw-map{display:none}
.vw.phone.mapoff .vw-mapbtn{display:flex;position:absolute;bottom:calc(46px + var(--sb));inset-inline-start:calc(8px + var(--sl));width:38px;height:38px;border-radius:50%;
  align-items:center;justify-content:center;color:var(--g2);padding:0}
.vw.phone .vw-pad{bottom:calc(46px + var(--sb));right:calc(8px + var(--sr));width:118px;height:78px;grid-template:repeat(2,1fr)/repeat(3,1fr);gap:4px}
.vw.phone[dir=rtl] .vw-pad{right:auto;left:calc(8px + var(--sl))}
.vw.phone .vw-pad button{border-radius:10px;font-size:13px}
.vw.phone .vw-pad .d{grid-area:2/2}
.vw.phone.incar .vw-map,.vw.phone.incar .vw-mapbtn{display:none}
.vw.phone .vw-lift{left:calc(8px + var(--sl));right:calc(8px + var(--sr));bottom:calc(46px + var(--sb));width:auto;padding:8px 10px;border-radius:14px}
.vw.phone .vw-lift.show{display:flex;align-items:center;justify-content:center;gap:10px}
.vw.phone .vw-lift .hd{flex-direction:column;align-items:center;justify-content:center;margin:0;min-width:46px;gap:2px;font-size:9px}
.vw.phone .vw-lift .ind{font-size:22px;line-height:1}
.vw.phone .vw-lift .grid{grid-template-columns:repeat(6,40px);gap:6px}
.vw.phone .vw-lift .grid button{width:40px;height:40px;font-size:13px;background:rgba(0,0,0,.25)}
.vw.phone .vw-lift .grid button.on{background:var(--g)}
.vw.phone .vw-toast{top:calc(54px + var(--st));font-size:11.5px}
/* fallback 2D floor grid: hidden by default, opened from the small "Floors" button while in the car */
.vw-floorsbtn{display:none;position:absolute;inset-inline-end:calc(136px + var(--sr));bottom:calc(88px + var(--sb));height:34px;padding:0 12px;border-radius:999px;align-items:center;gap:6px;font-size:11px;letter-spacing:.06em;color:var(--g2);transition:opacity .45s}
.vw.incar .vw-floorsbtn,.vw.riding .vw-floorsbtn{display:inline-flex}
.vw-floorsbtn.on{background:rgba(201,164,92,.22);border-color:var(--g)}
.vw.phone .vw-floorsbtn{inset-inline-end:auto;inset-inline-start:calc(8px + var(--sl));bottom:calc(46px + var(--sb));height:36px}
.vw.phone.incar .vw-lift.show{bottom:calc(88px + var(--sb))}
/* unit card: label + price + reserve chip for the apartment you're in */
.vw-ucard{position:absolute;top:calc(60px + var(--st));left:50%;transform:translate(-50%,-6px);display:flex;align-items:center;gap:12px;padding:8px 8px 8px 14px;border-radius:16px;opacity:0;pointer-events:none;transition:opacity .35s,transform .35s;max-width:calc(100% - 20px)}
.vw[dir=rtl] .vw-ucard{padding:8px 14px 8px 8px}
.vw-ucard.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.vw-ucard .ut{min-width:0}
.vw-ucard .u1{font-family:"Cormorant Garamond","Bodoni Moda",Georgia,serif;font-size:15px;color:var(--g2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext;text-align:start}
.vw-ucard .u2{font-size:11.5px;opacity:.9;white-space:nowrap;unicode-bidi:plaintext;text-align:start}
.vw-ucard .u2 b{color:var(--g2);font-weight:600}
.vw-ucard .vw-btn{height:32px;font-size:10.5px;flex-shrink:0}
.vw.phone .vw-ucard{top:calc(52px + var(--st))}
.vw.phone.dim .vw-ucard{opacity:.7}
.vw-ucard.show~.vw-toast{top:calc(122px + var(--st))}
@media (min-width:600px){.vw.phone .vw-lift .grid{grid-template-columns:repeat(12,38px)}.vw.phone .vw-lift .grid button{width:38px;height:38px}}
/* auto-fade: the HUD steps back while you look/walk or after a few idle seconds; any tap brings it back */
.vw.phone.dim .vw-top,.vw.phone.dim .vw-map,.vw.phone.dim .vw-mapbtn,.vw.phone.dim .vw-bottom,.vw.phone.dim:not(.padon) .vw-pad{opacity:.15}
.vw.phone.dim.padon .vw-pad{opacity:.55}
.vw.phone.dim.riding .vw-bottom{opacity:.1}
`;

export class Walkthrough {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.i18n = opts.i18n || null;
    this.styleId = opts.styleId || 'milano';
    this.envMode = opts.timeMode || 'dusk';
    this.mode = 'walk';
    this.disposed = false;
    this.unit = null; this.bId = null; this.floor = null;
    this.apt = null; this.aptGroup = null; this.commons = null; this.liftInfos = [];
    this.loaded = new Map();         // unitId → { unit, apt, src, lights, rooms } (≤ MAX_APTS)
    this.solids = []; this.floors = []; this.actions = [];
    this.floorReq = false;           // true once real walkable floors are known → can't walk into the void
    this.player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, eye: EYE };
    this.keys = new Set(); this.pad = { u: 0, d: 0, l: 0, r: 0 };
    this.glide = null; this.riding = false; this.busy = false; this.touched360 = false;
    this.inCar = null; this._lastHud = 0; this._lastMap = 0; this._lastHover = 0;
    this._taps = null; this._pointers = new Map();
    this._ray = new THREE.Raycaster(); this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3();
    this._own = [];                 // helper objects we created (disposed by us)
    this._isTouch = isTouchDevice();
    this._zoomS = 1; this._baseTanH = Math.tan(34 * D2R); this._hfov = 70;   // zoom = scale on tan(½·horizontal FOV)
    this._pinch = null; this._phone = null; this._mapOpen = null; this._popOpen = false;
    this._lastAct = performance.now(); this._dim = false; this._suppressTap = 0;

    // DOM
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    this.root = document.createElement('div');
    this.root.className = 'vw';
    const style = document.createElement('style'); style.textContent = CSS; this.root.appendChild(style);
    container.appendChild(this.root);

    // renderer / scene / camera
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.canvas = this.renderer.domElement; this.canvas.className = 'vw-gl'; this.canvas.tabIndex = 0;
    this.root.appendChild(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 6000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.clock = new THREE.Clock();

    this._buildHud();
    this._bind();
    this._resize();
    this._ready = this._init();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  // ======================= i18n =======================
  t(key, fb) {
    let s;
    try { s = this.i18n && typeof this.i18n.t === 'function' ? this.i18n.t(key) : undefined; } catch { s = undefined; }
    if (typeof s !== 'string' || !s || s === key) { const loc = LOCAL[String(this.lang).slice(0, 2)]; s = (loc && loc[key]) ?? fb ?? EN[key] ?? LOCAL.en[key] ?? key.split('.').pop(); }
    return s;
  }
  get dir() { const d = this.i18n && this.i18n.dir; const v = typeof d === 'function' ? d() : d; return v === 'rtl' ? 'rtl' : v === 'ltr' ? 'ltr' : (document.documentElement.dir || 'ltr'); }
  get lang() { const l = this.i18n && this.i18n.lang; return (typeof l === 'function' ? l() : l) || document.documentElement.lang || 'en'; }

  // ======================= init =======================
  async _init() {
    this.mods = await loadModules(this.opts.modules);
    if (this.disposed) return;
    const M = this.mods;
    this.styles = (M.materials && Array.isArray(M.materials.STYLES) && M.materials.STYLES.length) ? M.materials.STYLES : FALLBACK_STYLES;
    if (!this.styles.some(s => s.id === this.styleId)) this.styleId = this.styles[0].id;

    // Interior image-based lighting (RoomEnvironment), swapped with the sky env on outdoor spots.
    try {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment(this.renderer);
      this.roomEnv = pm.fromScene(room, 0.04).texture;
      room.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
      pm.dispose();
    } catch (e) { console.warn('[walk] RoomEnvironment failed', e); this.roomEnv = null; }

    if (M.environment && M.environment.createEnvironment) {
      try {
        this.env = M.environment.createEnvironment(this.scene, this.renderer, { mode: this.envMode });
        if (this.env && this.env.group && !this.env.group.parent) this.scene.add(this.env.group);
      } catch (e) { console.warn('[walk] createEnvironment threw', e); this.env = null; }
    }
    if (!this.env) this._fallbackEnv();
    this._lightPool = [];
    for (let i = 0; i < LIGHT_SLOTS; i++) { const l = new THREE.PointLight(0xffe2b8, 0, 7.5, 1.6); l.name = 'walk-apt-light'; this.scene.add(l); this._lightPool.push(l); }
    this.skyEnv = this.scene.environment || null;

    if (M.exterior && M.exterior.createComplex) {
      try {
        this.complex = M.exterior.createComplex({});
        if (this.complex && this.complex.group && !this.complex.group.parent) this.scene.add(this.complex.group);
      } catch (e) { console.warn('[walk] createComplex threw', e); this.complex = null; }
    }
    // Building wrappers: commons groups (building-local) live inside these.
    this.bWrap = {};
    for (const [id, b] of Object.entries(BUILDINGS)) {
      const g = new THREE.Group(); g.name = 'walk-bldg-' + id; g.position.set(b.origin[0], 0, b.origin[1]); g.rotation.y = b.rotY;
      this.scene.add(g); this.bWrap[id] = g;
    }
    this._renderStyles(); this._renderTime();
  }

  _fallbackEnv() {
    const g = new THREE.Group(); g.name = 'walk-fallback-env';
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x404848, 1.1);
    const sun = new THREE.DirectionalLight(0xfff0dd, 1.5); sun.position.set(100, 200, 80);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x3d4a38, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    g.add(hemi, sun, ground); this.scene.add(g); this._own.push(g);
    const skies = { day: 0x9cc4e8, dusk: 0x5a4c66, night: 0x0a0e1a };
    const setMode = m => { this.scene.background = new THREE.Color(skies[m] || skies.dusk); hemi.intensity = m === 'night' ? 0.25 : m === 'dusk' ? 0.7 : 1.2; sun.intensity = m === 'day' ? 2 : m === 'dusk' ? 0.6 : 0; };
    setMode(this.envMode);
    this.env = { group: g, sun, setMode, update() {}, dispose() {}, _fallback: true };
  }

  // ======================= public API =======================
  async enter({ unitId, start = 'apartment', mode = 'walk' } = {}) {
    const token = (this._enterToken = (this._enterToken || 0) + 1);
    this._showLoading(true);
    await this._ready;
    if (this.disposed || token !== this._enterToken) return;
    const unit = unitById(unitId) || this.unit || UNITS.find(u => u.building === 'C3' && u.floor === 5) || UNITS[0];
    if (unit !== this.unit || !this.apt) {
      this.unit = unit; this.bId = unit.building;
      this._hideUnitCard();
      await this._buildApartment();
      if (this.disposed || token !== this._enterToken) return;
    }
    this._updateTitle();
    this._renderRooms();
    this.mode = mode === '360' ? '360' : 'walk';
    await this._goto(start, { instant: true });
    if (this.disposed || token !== this._enterToken) return;
    this._applyMode();
    this._showLoading(false);
    this.canvas.focus({ preventScroll: true });
    if (!lsGet('vrc.walk.help')) this._showHelp(true);
  }

  async setStyle(styleId) {
    if (!styleId || styleId === this.styleId && this.apt) { this._renderStyles(); return; }
    this.styleId = styleId;
    this._renderStyles();
    if (!this.unit) return;
    await this._ready;
    this._toast(this._styleName(styleId));
    await this._buildApartment();       // player state untouched → camera keeps its place
    this._renderRooms();
    this._updateHud(true);
    if (this.mode === 'walk') this._depenetrate(4);
  }

  setTimeMode(mode) {
    this.envMode = mode;
    try { this.env && this.env.setMode(mode); } catch (e) { console.warn(e); }
    this.skyEnv = this.scene.environment !== this.roomEnv ? this.scene.environment : this.skyEnv;
    this._renderTime();
  }

  /** Capture the current view as a high-res PNG data URL → opts.onPhoto(dataUrl), else download it. */
  takePhoto(scale = 2.5) {
    if (this.disposed) return null;
    const r = this.renderer, prev = r.getPixelRatio();
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    // cap the long side at ~4096 px to stay within mobile GPU limits
    const pr = Math.max(prev, Math.min(scale, 4096 / Math.max(w, h)));
    let url = null;
    try {
      r.setPixelRatio(pr); r.setSize(w, h, false);
      r.render(this.scene, this.camera);
      url = this.canvas.toDataURL('image/png');   // same task as render → drawing buffer still valid
    } catch (e) { console.warn('[walk] photo failed', e); }
    finally { r.setPixelRatio(prev); r.setSize(w, h, false); r.render(this.scene, this.camera); }
    if (!url) return null;
    this.el.fade.style.transition = 'none'; this.el.fade.style.background = '#fff'; this.el.fade.style.opacity = '0.7';
    requestAnimationFrame(() => { this.el.fade.style.transition = ''; this.el.fade.style.opacity = '0'; setTimeout(() => { this.el.fade.style.background = ''; }, 320); });
    this._toast(this.t('walk.photoSaved'));
    if (typeof this.opts.onPhoto === 'function') { try { this.opts.onPhoto(url); } catch (e) { console.warn(e); } }
    else {
      const a = document.createElement('a'); a.href = url;
      a.download = `VILNYI-RIVER-CITY-${this.unit ? this.unit.id : 'view'}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    }
    return url;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this._unbind();
    const safe = f => { try { f(); } catch (e) { console.warn('[walk] dispose', e); } };
    safe(() => this._disposeCommons());
    safe(() => this._disposeApartment());
    safe(() => this.complex && this.complex.dispose && this.complex.dispose());
    safe(() => this.env && this.env.dispose && this.env.dispose());
    safe(() => this.roomEnv && this.roomEnv.dispose());
    safe(() => { for (const o of this._own) disposeTree(o); this._own = []; });
    safe(() => disposeTree(this.scene));   // sweep anything left (textures of shared caches are re-uploaded if reused)
    safe(() => { this.scene.environment = null; this.scene.background = null; this.scene.clear(); });
    safe(() => { this.renderer.dispose(); this.renderer.forceContextLoss(); });
    this.root.remove();
    this.solids = this.floors = this.actions = [];
  }

  // ======================= building the world =======================
  // (Re)build the current unit (enter / design switch). Other loaded apartments are dropped; their corridor doors return.
  async _buildApartment() {
    const unit = this.unit;
    const prev = this.loaded.get(unit.id);
    const wasOpen = !!(prev && prev.apt.doorLeaf && prev.apt.doorLeaf.userData._open);
    this._disposeApartment();
    const e = this._loadApt(unit);
    this._setCurrent(e, { quiet: true });
    if (wasOpen && e.apt.doorLeaf) this._toggleDoor(e.apt.doorLeaf, true);
  }

  // Build + place one apartment (sync, ~30–110 ms). Registered under its own collider source 'apt:<id>'.
  _loadApt(unit) {
    const M = this.mods;
    let apt = null;
    const t0 = performance.now();
    if (M.apartment && M.apartment.buildApartment) {
      try { apt = M.apartment.buildApartment(unit, this.styleId, {}); } catch (e) { console.warn('[walk] buildApartment threw', e); }
    }
    if (!apt || !apt.group) apt = this._fallbackApartment(unit);
    const [wx, wz] = unitToWorld(unit, 0, 0);
    apt.group.position.set(wx, floorY(unit.floor), wz);
    apt.group.rotation.y = unitYaw(unit) + BUILDINGS[unit.building].rotY;   // rotY is 0 for both buildings
    this.scene.add(apt.group);
    apt.group.updateMatrixWorld(true);
    // Lights: lift them out of the group into specs; the fixed light pool serves the apartment you're in.
    const specs = [];
    for (const l of apt.lights || []) {
      if (!l || !l.isLight) continue;
      if (!l.parent) apt.group.add(l);
      l.updateMatrixWorld(true);
      specs.push({ pos: l.getWorldPosition(new THREE.Vector3()), color: l.color.clone(), intensity: l.intensity, distance: l.distance, decay: l.decay });
      l.parent.remove(l);
    }
    if (!apt.doorLeaf) apt.group.traverse(o => { if (!apt.doorLeaf && o.userData && o.userData.action && o.userData.action.type === 'aptDoor') apt.doorLeaf = o; });
    const e = { unit, apt, src: 'apt:' + unit.id, lights: specs, rooms: null, ms: performance.now() - t0 };
    this.loaded.set(unit.id, e);
    this._register(apt.group, e.src);
    if (this.commons) this._hideDuplicateDoor();
    return e;
  }

  // Make a loaded apartment the "current" one: HUD title, rooms, minimap, Reserve and the light pool follow it.
  _setCurrent(e, { quiet = false } = {}) {
    if (!e) return;
    const changed = this.unit !== e.unit || this.apt !== e.apt;
    this.unit = e.unit; this.apt = e.apt; this.aptGroup = e.apt.group;
    if (!e.rooms) e.rooms = this._normalizeRooms(e.apt.rooms || []);
    this.rooms = e.rooms;
    this._assignLights(e);
    this._updateTitle(); this._renderRooms();
    this._lastPlace = null; this._lastMap = 0;
    if (this.el && this.floor != null) this._updateHud(true);
    this._hideFloorsForWalker(true);
    if (!quiet && changed) this._showUnitCard(e.unit);
  }

  _assignLights(e) {
    const pool = this._lightPool; if (!pool) return;
    const token = (this._lightTok = (this._lightTok || 0) + 1);
    const from = pool.map(l => l.intensity);
    const apply = () => pool.forEach((l, i) => {
      const s = e.lights[i];
      if (s) { l.position.copy(s.pos); l.color.copy(s.color); l.distance = s.distance; l.decay = s.decay; l.userData.to = s.intensity; } else l.userData.to = 0;
      l.intensity = 0;
    });
    if (from.every(v => v === 0)) { apply(); pool.forEach(l => { l.intensity = l.userData.to; }); return; }
    // quick cross-fade: out, move, in
    tween(160, k => { if (token === this._lightTok) pool.forEach((l, i) => { l.intensity = from[i] * (1 - k); }); })
      .then(() => { if (token !== this._lightTok) return; apply(); return tween(420, k => { if (token === this._lightTok) pool.forEach(l => { l.intensity = l.userData.to * k; }); }); });
  }

  _disposeEntry(e) {
    if (!e) return;
    this._unregister(e.src);
    this.scene.remove(e.apt.group);
    try { e.apt.dispose ? e.apt.dispose() : disposeTree(e.apt.group); } catch (err) { console.warn(err); }
    this.loaded.delete(e.unit.id);
    if (this.apt === e.apt) { this.apt = null; this.aptGroup = null; }
  }

  // Keep at most MAX_APTS apartments: drop the farthest (never the current one or `keep`).
  _evict(keep) {
    while (this.loaded.size > MAX_APTS) {
      let worst = null, wd = -1;
      const P = this.player.pos;
      for (const e of this.loaded.values()) {
        if (e === keep || e.apt === this.apt) continue;
        const [x, z] = unitToWorld(e.unit, e.unit.width / 2, e.unit.depth / 2);
        const d = Math.hypot(P.x - x, (P.y - floorY(e.unit.floor)) * 2, P.z - z);
        if (d > wd) { wd = d; worst = e; }
      }
      if (!worst) break;
      this._disposeEntry(worst);
    }
    if (this.commons) this._hideDuplicateDoor();
  }

  // Which loaded apartment contains the walker (same floor, inside its footprint incl. balcony)?
  _aptAt(pos) {
    for (const e of this.loaded.values()) {
      const u = e.unit;
      if (u.building !== this.bId) continue;
      const dy = pos.y - floorY(u.floor);
      if (dy < -0.6 || dy > (TYPES[u.type].duplex ? 4.2 : 1.6)) continue;
      const [lx, lz] = worldToLocal(u.building, pos.x, pos.z);
      const [uu, vv] = localToUnit(u, lx, lz);
      if (uu > 0.02 && uu < u.width - 0.02 && vv > 0.12 && vv < u.depth + GEOM.balconyDepth + 0.3) return e;
    }
    return null;
  }

  _normalizeRooms(rooms) {
    const counts = {}, seen = {};
    rooms.forEach(r => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
    return rooms.map(r => {
      const poly = r.poly && r.poly.length >= 3 ? r.poly : null;
      const center = r.center || (poly ? polyCentroid(poly) : [this.unit.width / 2, this.unit.depth / 2]);
      const level = r.level || 0;
      const y = typeof r.y === 'number' ? r.y : level * LEVELS.typicalH;
      seen[r.kind] = (seen[r.kind] || 0) + 1;
      let label = this.t('walk.room.' + r.kind, EN['walk.room.' + r.kind] || r.name || r.kind);
      if (counts[r.kind] > 1 && r.kind !== 'hall') label += ' ' + seen[r.kind];
      if (r.kind === 'hall' && level === 1) label = this.t('walk.room.hall') + ' · ' + this.t('walk.upper');
      return { ...r, poly, center, level, y, label };
    });
  }

  _fallbackApartment(unit) {
    // Minimal walkable shell if apartment.js is missing: floor + balcony slab, light.
    const g = new THREE.Group(); g.name = 'walk-fallback-apt';
    const m = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.6 });
    const f = new THREE.Mesh(new THREE.BoxGeometry(unit.width, 0.1, unit.depth + GEOM.balconyDepth), m);
    f.position.set(unit.width / 2, -0.05, (unit.depth + GEOM.balconyDepth) / 2); f.userData.floor = true; g.add(f);
    const l = new THREE.PointLight(0xffe0b0, 15, 14); l.position.set(unit.width / 2, 2.4, unit.depth / 2); g.add(l);
    const T = TYPES[unit.type];
    const rooms = [{ kind: 'living', name: 'Living', area: T.util, center: [unit.width / 2, unit.depth * 0.6], poly: [[0, 0], [unit.width, 0], [unit.width, unit.depth], [0, unit.depth]] },
      { kind: T.outdoorKind, name: T.outdoorKind, area: T.outdoor, center: [unit.width / 2, unit.depth + GEOM.balconyDepth / 2], poly: [[0, unit.depth], [unit.width, unit.depth], [unit.width, unit.depth + GEOM.balconyDepth], [0, unit.depth + GEOM.balconyDepth]] }];
    return { group: g, rooms, entrance: { u: unit.door.u, v: 0 }, balconyPoint: { u: unit.width / 2, v: unit.depth + GEOM.balconyDepth * 0.55 }, lights: [], dispose() { disposeTree(g); } };
  }

  _disposeApartment() {
    for (const e of [...this.loaded.values()]) this._disposeEntry(e);
    this.apt = null; this.aptGroup = null;
    if (this.commons) this._hideDuplicateDoor();
  }

  async _buildCommons(bId, floor) {
    const M = this.mods;
    let c = null;
    if (M.commons && M.commons.buildFloorCommons) {
      try { c = await M.commons.buildFloorCommons(bId, floor, 'lobby'); } catch (e) { console.warn('[walk] buildFloorCommons threw', e); }
    }
    if (!c || !c.group) c = this._fallbackCommons(bId, floor);
    c.bId = bId; c.floor = floor;
    const wrap = this.bWrap[bId];
    wrap.add(c.group);
    c.lifts = Array.isArray(c.lifts) ? c.lifts : [];
    for (const L of c.lifts) if (L && L.group && !L.group.parent) wrap.add(L.group);
    // Helper walkable pads inside each lift car (in case the car floor isn't flagged userData.floor).
    c._helpers = new THREE.Group(); c._helpers.name = 'walk-lift-pads'; wrap.add(c._helpers);
    c._infos = c.lifts.map((L, i) => this._liftInfo(L, i, bId, floor));
    const padGeo = new THREE.BoxGeometry(1.7, 0.02, CAR_DEPTH * 2 + 0.2);
    const padMat = new THREE.MeshBasicMaterial({ visible: false });
    for (const inf of c._infos) {
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(inf.car[0] + inf.n[0] * 0.1, floorY(floor) - 0.01, inf.car[1] + inf.n[1] * 0.1);
      pad.rotation.y = Math.atan2(inf.n[0], inf.n[1]);
      pad.userData.floor = true; pad.userData._helper = true; c._helpers.add(pad);
    }
    c._padGeo = padGeo; c._padMat = padMat;
    wrap.updateMatrixWorld(true);
    return c;
  }

  _fallbackCommons(bId, floor) {
    const g = new THREE.Group(); g.name = 'walk-fallback-commons';
    const m = new THREE.MeshStandardMaterial({ color: 0x6b645a, roughness: 0.7 });
    const y = floorY(floor);
    const rects = floor === -1 ? [{ x0: 0, x1: 84, z0: -8.5, z1: 8.5 }, { x0: 67, x1: 84, z0: -38, z1: -8.5 }] : CORRIDORS;
    for (const r of rects) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.1, r.z1 - r.z0), m);
      f.position.set((r.x0 + r.x1) / 2, y - 0.05, (r.z0 + r.z1) / 2); f.userData.floor = true; g.add(f);
    }
    const l = new THREE.HemisphereLight(0xfff0dd, 0x333333, 0.8); g.add(l);
    const c = CORES[0];
    return { group: g, lifts: [], doors: [], spawn: { x: c.liftDoors[0][0] + 1.5, z: 0, yaw: 0 }, dispose() { disposeTree(g); } };
  }

  _liftInfo(lift, i, bId, floor) {
    let ci = typeof lift.core === 'number' ? lift.core : CORES.indexOf(lift.core);
    if (ci < 0 && lift.core && lift.core.stair != null) ci = CORES.findIndex(c => c.stair === lift.core.stair);
    if (ci < 0 || ci == null) ci = Math.floor(i / 2) % CORES.length;
    const di = typeof lift.doorIndex === 'number' ? lift.doorIndex : i % 2;
    const core = CORES[ci], door = core.liftDoors[di] || core.liftDoors[0], n = core.liftNormal;
    return { lift, core: ci, doorIndex: di, stair: core.stair, bId, floor, door, n, car: [door[0] - n[0] * CAR_DEPTH, door[1] - n[1] * CAR_DEPTH] };
  }

  // Commons builds a closed corridor leaf at every unit door; for each LOADED apartment hide it (apartment.js supplies the operable one).
  _hideDuplicateDoor() {
    for (const o of this._hiddenDoors || []) { o.visible = true; o.userData.solid = o.userData._solid; o.userData.action = o.userData._action; }
    this._hiddenDoors = [];
    const c = this.commons; if (!c) return;
    const ids = new Set(this.loaded.keys());
    if (ids.size) c.group.traverse(o => {
      const ud = o.userData || {}, a = ud.action;
      if ((a && a.type === 'aptDoor' && ids.has(a.unitId)) || (ud.doorLeaf && ids.has(ud.unitId))) {
        ud._solid = ud.solid; ud._action = a; ud.solid = false; delete ud.action; o.visible = false; this._hiddenDoors.push(o);
      }
    });
    this._unregister('commons'); this._registerCommons(c);
  }
  _registerCommons(c) {
    this._register(c.group, 'commons', false, new Set(c.lifts.map(L => L.group)));
    for (const L of c.lifts) if (L.group) this._register(L.group, 'commons', true);
    this._register(c._helpers, 'commons');
  }

  _activateCommons(c) {
    this.commons = c;
    this.liftInfos = c._infos || [];
    this._hiddenDoors = [];
    this._hideDuplicateDoor();   // also registers the commons colliders/actions
  }

  _disposeCommons(c = this.commons) {
    if (!c) return;
    if (c === this.commons) { this._unregister('commons'); this.commons = null; this.liftInfos = []; }
    try { c.dispose && c.dispose(); } catch (e) { console.warn(e); }
    for (const L of c.lifts || []) { if (L.group && L.group.parent) L.group.parent.remove(L.group); try { L.dispose && L.dispose(); } catch { /* optional */ } }
    if (c.group.parent) c.group.parent.remove(c.group);
    if (c._helpers) { c._helpers.parent && c._helpers.parent.remove(c._helpers); c._padGeo.dispose(); c._padMat.dispose(); }
  }

  async _setFloor(bId, floor) {
    if (this.commons && this.commons.bId === bId && this.commons.floor === floor) return;
    const c = await this._buildCommons(bId, floor);
    if (this.disposed) return;
    this._disposeCommons();
    this._activateCommons(c);
    this.floor = floor; this.bId = bId;
    this._hideFloorsForWalker(true);
    this._renderLiftPanel();
  }

  // Which facade floor bands to hide so the exterior never covers the interior we are in.
  _hideFloorsForWalker(force) {
    if (!this.complex || !this.complex.setHiddenFloor || this.floor == null) return;
    let f = this.floor;
    const u = this.unit, duplex = u && TYPES[u.type].duplex && u.building === this.bId && f === u.floor;
    let key;
    if (duplex && typeof this.complex.setHiddenFloors === 'function') key = 'm' + f;
    else { if (duplex && this.player.pos.y > floorY(f) + 1.6) f = f + 1; key = 's' + f; }
    key = this.bId + key;
    if (!force && key === this._hiddenKey) return;
    this._hiddenKey = key;
    try {
      for (const id of Object.keys(BUILDINGS)) if (id !== this.bId) this.complex.setHiddenFloor(id, null);
      if (duplex && typeof this.complex.setHiddenFloors === 'function') this.complex.setHiddenFloors(this.bId, [this.floor, this.floor + 1]);
      else this.complex.setHiddenFloor(this.bId, f);
    } catch (e) { console.warn('[walk] setHiddenFloor', e); }
  }

  // ======================= collider registry =======================
  _register(root, src, dyn = false, skip = null) {
    root.updateMatrixWorld(true);
    const walk = (o, act, solid, floor, d) => {
      if (skip && skip.has(o) && o !== root) return;
      const ud = o.userData || {};
      const a = ud.action ? o : act;
      const s = solid || !!ud.solid, f = floor || !!ud.floor, dd = d || !!ud.dynamic;
      if (o.isMesh) {
        if (s && !f) this.solids.push({ o, src, dyn: dd || !!a, box: null });
        if (f) { this.floors.push({ o, src, dyn: dd, box: null }); if (!ud._helper) this.floorReq = true; }
        if (a) this.actions.push({ o, root: a, src });
      }
      for (const c of o.children) walk(c, a, s && !o.isMesh, f && !o.isMesh, dd);
    };
    walk(root, null, false, false, dyn);
  }
  _unregister(src) {
    this.solids = this.solids.filter(e => e.src !== src);
    this.floors = this.floors.filter(e => e.src !== src);
    this.actions = this.actions.filter(e => e.src !== src);
    this.floorReq = this.floors.some(e => !e.o.userData._helper);
  }
  _near(list, p, r) {
    const out = [];
    for (const e of list) {
      if (!e.o.parent || e.o.userData.solid === false) continue;
      if (e.dyn || !e.box) { e.box = e.box || new THREE.Box3(); e.box.setFromObject(e.o); }
      if (e.box.distanceToPoint(p) < r) out.push(e.o);
    }
    return out;
  }
  // Raycast treating every material as double-sided (walls may be thin planes seen from behind).
  _cast(objects, origin, dir, far) {
    if (!objects.length) return [];
    const ray = this._ray; ray.set(origin, dir); ray.near = 0; ray.far = far;
    const touched = [];
    for (const o of objects) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m && m.side !== THREE.DoubleSide) { touched.push(m, m.side); m.side = THREE.DoubleSide; }
    }
    let hits;
    try { hits = ray.intersectObjects(objects, false); } finally { for (let i = touched.length - 2; i >= 0; i -= 2) touched[i].side = touched[i + 1]; }
    return hits;
  }

  // ======================= movement & collisions =======================
  _floorAt(x, y, z, entries) {
    const o = this._v1.set(x, y + STEP_UP, z);
    const hits = this._cast(entries, o, this._v2.set(0, -1, 0), STEP_UP + STEP_DOWN);
    return hits.length ? hits[0].point.y : null;
  }

  _hitNormal(h, fallbackDir) {
    if (!h.face) return fallbackDir.clone().negate();
    const n = h.face.normal.clone();
    if (h.object.isInstancedMesh && h.instanceId != null) { const m = new THREE.Matrix4(); h.object.getMatrixAt(h.instanceId, m); n.transformDirection(m); }
    n.transformDirection(h.object.matrixWorld); n.y = 0;
    if (n.lengthSq() < 1e-6) return fallbackDir.clone().negate();
    n.normalize();
    if (n.dot(fallbackDir) > 0) n.negate();
    return n;
  }

  // Sweep the player horizontally by `delta` with slide; returns actual movement length.
  _move(delta) {
    const P = this.player.pos, len0 = Math.hypot(delta.x, delta.z);
    if (len0 < 1e-6) return 0;
    const solids = this._near(this.solids, P, len0 + 1.2);
    const floors = this._near(this.floors, P, len0 + 1.5);
    let moved = 0, d = new THREE.Vector3(delta.x, 0, delta.z);
    for (let iter = 0; iter < 2 && d.lengthSq() > 1e-8; iter++) {
      const len = d.length(), dir = d.clone().divideScalar(len);
      let allow = len, n = null;
      for (const h of RAY_HEIGHTS) {
        const hits = this._cast(solids, this._v1.set(P.x, P.y + h, P.z), dir, len + RADIUS);
        const hit = hits.find(x => !x.object.userData.floor);
        if (hit && hit.distance - RADIUS < allow) { allow = Math.max(0, hit.distance - RADIUS - 0.005); n = this._hitNormal(hit, dir); }
      }
      if (allow > 1e-5) {
        const nx = P.x + dir.x * allow, nz = P.z + dir.z * allow;
        const fy = this._floorAt(nx, P.y, nz, floors);
        if (fy === null && this.floorReq) { n = n || dir.clone().negate(); allow = 0; }
        else { P.x = nx; P.z = nz; if (fy !== null) this._targetY = fy; moved += allow; }
      }
      if (!n || allow >= len - 1e-5) break;
      const rem = d.clone().multiplyScalar(1 - allow / len);
      d = rem.sub(n.clone().multiplyScalar(rem.dot(n)));   // slide along the wall
    }
    this._depenetrate(1, solids);
    return moved;
  }

  _depenetrate(iters = 1, solids = null) {
    const P = this.player.pos;
    solids = solids || this._near(this.solids, P, 1.2);
    if (!solids.length) return;
    const dir = this._v2;
    for (let k = 0; k < iters; k++) {
      let px = 0, pz = 0;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2; dir.set(Math.cos(a), 0, Math.sin(a));
        for (const h of [0.3, 1.0]) {
          const hit = this._cast(solids, this._v1.set(P.x, P.y + h, P.z), dir, RADIUS).find(x => !x.object.userData.floor);
          if (hit) { const push = RADIUS - hit.distance; px -= dir.x * push / 2; pz -= dir.z * push / 2; }
        }
      }
      if (Math.abs(px) + Math.abs(pz) < 1e-4) break;
      const fy = this._floorAt(P.x + px, P.y, P.z + pz, this._near(this.floors, P, 1.5));
      if (fy === null && this.floorReq) break;
      P.x += px; P.z += pz;
    }
  }

  _isFree(x, y, z) {
    const p = new THREE.Vector3(x, y, z);
    const solids = this._near(this.solids, p, 1.0), floors = this._near(this.floors, p, 1.5);
    if (this.floorReq && this._floorAt(x, y, z, floors) === null) return false;
    const down = this._cast(solids, new THREE.Vector3(x, y + 1.9, z), new THREE.Vector3(0, -1, 0), 1.85);
    if (down.some(h => !h.object.userData.floor)) return false;
    const dir = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2; dir.set(Math.cos(a), 0, Math.sin(a));
      for (const h of [0.3, 1.0]) if (this._cast(solids, new THREE.Vector3(x, y + h, z), dir, RADIUS + 0.08).some(q => !q.object.userData.floor)) return false;
    }
    return true;
  }
  // Nearest free standing spot around (x,z) — spiral search.
  _freeSpot(x, y, z, maxR = 1.6) {
    if (this._isFree(x, y, z)) return [x, z];
    for (let r = 0.35; r <= maxR; r += 0.35) {
      const n = Math.max(6, Math.round(r * 14));
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (this._isFree(px, y, pz)) return [px, pz]; }
    }
    return [x, z];
  }

  // ======================= placing the camera =======================
  _unitPoint(u, v, level = 0) {
    const [x, z] = unitToWorld(this.unit, u, v);
    return new THREE.Vector3(x, floorY(this.unit.floor) + level * LEVELS.typicalH, z);
  }
  _unitDirYaw(du, dv) {
    const U = this.unit.frame.U, V = this.unit.frame.V;
    const [wx, wz] = dirToWorld(this.unit.building, U[0] * du + V[0] * dv, U[1] * du + V[1] * dv);
    return yawFromDir(wx, wz);
  }
  _place(pos, yaw, pitch = -0.04) {
    const P = this.player;
    P.pos.copy(pos); this._targetY = pos.y; P.vel.set(0, 0, 0);
    P.yaw = P.tYaw = yaw; P.pitch = P.tPitch = pitch;
    this.glide = null; this.touched360 = false;
    this._syncCamera();
    this._hideFloorsForWalker(true);
  }

  // Resolve a start/teleport target to {floor, pos, yaw}
  _spot(where) {
    const u = this.unit, apt = this.apt;
    const unitFloor = u.floor;
    if (where === 'lobby' || where === 'parking') return { floor: where === 'lobby' ? 0 : -1, spawn: true };
    if (where === 'corridor') {
      // stand a little up the corridor and look at the entrance door diagonally
      const side = u.door.u > 1.9 ? -1.9 : 1.9;
      const pos = this._unitPoint(u.door.u + side, -0.8);
      return { floor: unitFloor, pos, yaw: this._unitDirYaw(-side, 0.75), free: true };
    }
    if (where === 'balcony') {
      const bp = (apt && apt.balconyPoint) || { u: u.width / 2, v: u.depth + GEOM.balconyDepth * 0.55 };
      const out = this.rooms.find(r => OUTDOOR.has(r.kind) && r.level === 0) || this.rooms.find(r => OUTDOOR.has(r.kind));
      const lvl = bp.level || 0;
      return { floor: unitFloor, pos: this._unitPoint(bp.u, bp.v, lvl), yaw: this._unitDirYaw(0, 1), outRoom: out, free: true };
    }
    if (where && where.room) return this._roomSpot(where.room);
    // apartment: stand at the corridor side of the living room, looking at the windows
    const liv = this.rooms.find(r => r.kind === 'living' && r.level === 0) || this.rooms.find(r => !OUTDOOR.has(r.kind)) || null;
    if (liv) {
      const vs = liv.poly ? liv.poly.map(p => p[1]) : [liv.center[1] - 1.5];
      const v = Math.min(Math.min(...vs) + 0.9, liv.center[1]);
      return { floor: unitFloor, pos: this._unitPoint(liv.center[0], v), yaw: this._unitDirYaw(0.18, 1), free: true };
    }
    const e = (apt && apt.entrance) || { u: u.door.u, v: 0 };
    return { floor: unitFloor, pos: this._unitPoint(e.u, 1.0), yaw: this._unitDirYaw(0, 1), free: true };
  }
  _roomSpot(r) {
    const u = this.unit;
    if (OUTDOOR.has(r.kind)) {
      const bp = this.apt && this.apt.balconyPoint;
      const useBp = bp && r.level === (bp.level || 0) && (!r.poly || pointInPoly([bp.u, bp.v], r.poly));
      const [pu, pv] = useBp ? [bp.u, bp.v] : r.center;
      return { floor: u.floor, pos: this._unitPoint(pu, pv, r.level), yaw: this._unitDirYaw(0, 1), free: true, room: r };
    }
    // Stand back from the room centre (toward the corridor) and look toward the facade.
    const vs = r.poly ? r.poly.map(p => p[1]) : [r.center[1]];
    const v = Math.max(Math.min(...vs) + 0.8, Math.min(r.center[1], Math.min(...vs) + 1.4));
    return { floor: u.floor, pos: this._unitPoint(r.center[0], this.mode === '360' ? r.center[1] : v, r.level), yaw: this._unitDirYaw(0, 1), free: true, room: r };
  }

  async _goto(where, { instant = false } = {}) {
    if (this.riding || !this.unit) return;
    if (!instant) await this._fade(true);
    try {
      let s = this._spot(where);
      const bId = this.unit.building;
      await this._setFloor(bId, s.floor);
      if (this.disposed) return;
      if (s.spawn) {
        const sp = (this.commons && this.commons.spawn) || { x: CORES[0].entrance[0], z: 0, yaw: 0 };
        const [x, z] = localToWorldXZ(bId, sp.x, sp.z);
        s = { floor: s.floor, pos: new THREE.Vector3(x, floorY(s.floor), z), yaw: (sp.yaw || 0) + BUILDINGS[bId].rotY, free: true };
      }
      const pos = s.pos.clone();
      if (s.free) {
        const fy = this._floorAt(pos.x, pos.y + 0.3, pos.z, this._near(this.floors, pos, 2));
        if (fy !== null) pos.y = fy;
        const [fx, fz] = this._freeSpot(pos.x, pos.y, pos.z); pos.x = fx; pos.z = fz;
      }
      this._place(pos, s.yaw);
      this.player.eye = this.mode === '360' ? EYE_360 : EYE;
      this._lastPlace = null;
      this._updateHud(true);
    } finally { if (!instant) await this._fade(false); }
  }

  // ======================= modes =======================
  setMode(m) {
    this.mode = m === '360' ? '360' : 'walk';
    this._applyMode();
    if (this.mode === '360') {
      // snap to the centre of the room we're in (or stay put outside the apartment)
      const r = this._currentRoom();
      if (r) {
        const s = this._roomSpot(r);
        const [fx, fz] = this._freeSpot(s.pos.x, s.pos.y, s.pos.z, 1.0);
        s.pos.x = fx; s.pos.z = fz;
        this._place(s.pos, this.player.yaw, this.player.pitch);
      }
      this.player.eye = EYE_360; this.touched360 = false;
    } else this.player.eye = EYE;
  }
  _applyMode() {
    this.root.classList.toggle('m360', this.mode === '360');
    this.el.modeSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === this.mode));
  }

  // ======================= actions (doors, lifts) =======================
  _pickAt(clientX, clientY, forFloor = false) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = this._ray; ray.setFromCamera(ndc, this.camera);
    const origin = ray.ray.origin.clone(), dir = ray.ray.direction.clone();
    const objs = new Set();
    const near = (l, rr) => this._near(l, origin, rr).forEach(o => objs.add(o));
    near(this.solids, 12); near(this.floors, forFloor ? 40 : 12); this.actions.forEach(a => a.o.parent && objs.add(a.o));
    const hits = this._cast([...objs], origin, dir, forFloor ? 40 : 12);
    return hits[0] || null;
  }
  _actionOf(hit) {
    if (!hit) return null;
    let o = hit.object;
    while (o) { if (o.userData && o.userData.action) return { action: o.userData.action, obj: o, hit }; o = o.parent; }
    return null;
  }

  async _doAction(a) {
    const act = a.action;
    if (act.type === 'aptDoor') return this._onAptDoor(act.unitId, a.obj);
    if (act.type === 'liftCall') return this._callLift(act.stair, act.building, a.obj, a.hit && a.hit.object);
    if (act.type === 'liftButton') return this._pressLiftButton(act.floor, act);
    if (act.type === 'liftDoor') return this._liftDoorKey(act);
    if (act.type === 'liftAlarm') return this._liftAlarm(act);
    if (typeof act.onClick === 'function') return act.onClick();
  }

  // Any apartment door on the corridor: loaded → swing it; not loaded → build that apartment behind it, then swing it open.
  async _onAptDoor(unitId, obj) {
    if (this.riding) return;
    const e = unitId && this.loaded.get(unitId);
    if (e) {
      const leaf = e.apt.doorLeaf || obj;
      const opening = !leaf.userData._open;
      if (opening) this._click(0.5);
      await this._toggleDoor(leaf);
      if (opening && e.apt !== this.apt) this._setCurrent(e);
      return;
    }
    const unit = unitId && unitById(unitId);
    if (!unit) return this._toggleDoor(obj);
    if (unit.building !== this.bId || unit.floor !== this.floor) return;   // doors of other floors are irrelevant
    return this._openNeighbour(unit, obj);
  }

  async _openNeighbour(unit, leaf) {
    if (this._opening) return;
    this._opening = unit.id;
    this._click(0.5);
    const stop = this._shimmer(leaf);
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 90))));   // let the shimmer show before the sync build
      if (this.disposed) return;
      const e = this._loadApt(unit);
      this._evict(e);
      try { if (this.renderer.compile) this.renderer.compile(e.apt.group, this.camera, this.scene); } catch { /* optional warm-up */ }
      stop();
      this._setCurrent(e);
      if (e.apt.doorLeaf) await this._toggleDoor(e.apt.doorLeaf, true);
      if (e.apt.doorLeaf) e.apt.doorLeaf.userData._autoDone = true;
    } catch (err) { console.warn('[walk] open neighbour', err); stop(); }
    finally { this._opening = null; }
  }

  // Subtle gold shimmer on a corridor door leaf while its apartment is being built.
  _shimmer(leaf) {
    if (!leaf || !leaf.material || Array.isArray(leaf.material)) return () => {};
    const orig = leaf.material, m = orig.clone();
    m.emissive = new THREE.Color(0xe6c987); m.emissiveIntensity = 0;
    leaf.material = m;
    let alive = true;
    const t0 = performance.now();
    const step = () => { if (!alive) return; const t = (performance.now() - t0) / 1000; m.emissiveIntensity = 0.12 + 0.12 * Math.sin(t * 9); requestAnimationFrame(step); };
    step();
    return () => { if (!alive) return; alive = false; leaf.material = orig; m.dispose(); };
  }

  _fillUnitCard(u) {
    const T = TYPES[u.type] || {};
    this.el.u1.textContent = (this.i18n && typeof this.i18n.unitLabel === 'function' && this.i18n.unitLabel(u)) || unitLabel(u);
    this.el.u2.innerHTML = '';
    const avail = !u.status || u.status === 'available';
    const parts = [];
    if (T.rooms) parts.push(['span', `${T.rooms} ${this.t('walk.roomsN')}`]);
    if (T.total) parts.push(['span', `${Math.round(T.total)} m²`]);
    const pr = avail ? (u.price ? money(u.price) : '') : this.t('walk.status.' + u.status, u.status);
    if (pr) parts.push(['b', pr]);
    parts.forEach(([tag, txt], i) => {   // each part is bidi-isolated so "61 m²" / "€151,600" never get reordered in RTL
      if (i) this.el.u2.append(document.createTextNode(' · '));
      const el = document.createElement(tag); el.textContent = txt; el.style.unicodeBidi = 'isolate'; el.dir = 'auto'; this.el.u2.append(el);
    });
    this.el.ureserve.style.display = avail ? '' : 'none';
  }
  _showUnitCard(u, ms = 7000) {
    if (!this.el || !u) return;
    this._cardUnit = u; this._fillUnitCard(u);
    this.el.toast.classList.remove('show');
    this.el.ucard.classList.add('show');
    this._poke();
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this._hideUnitCard(), ms);
  }
  _hideUnitCard() { if (!this.el) return; clearTimeout(this._cardT); this.el.ucard.classList.remove('show'); }

  // ---- small UI sounds (WebAudio, only after a user gesture) ----
  _audio() {
    try {
      const ua = navigator.userActivation; if (ua && !ua.hasBeenActive) return null;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      this._ac = this._ac || new AC();
      if (this._ac.state === 'suspended') this._ac.resume().catch(() => {});
      return this._ac;
    } catch { return null; }
  }
  _click(vol = 1) {   // soft mechanical key click
    const ac = this._audio(); if (!ac) return;
    try {
      const t = ac.currentTime + 0.005, n = Math.floor(ac.sampleRate * 0.03), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.12));
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.4;
      const g = ac.createGain(); g.gain.value = 0.22 * vol;
      src.connect(f).connect(g).connect(ac.destination); src.start(t);
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = 1850;
      og.gain.setValueAtTime(0.04 * vol, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(og).connect(ac.destination); o.start(t); o.stop(t + 0.08);
    } catch { /* optional */ }
  }
  _bell() {
    const ac = this._audio(); if (!ac) return;
    try {
      const t0 = ac.currentTime + 0.01;
      for (let i = 0; i < 6; i++) {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = 2100;
        const t = t0 + i * 0.16; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.14);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.15);
      }
    } catch { /* optional */ }
  }

  _toggleDoor(leaf, open) {
    if (typeof leaf.userData.toggle === 'function') return leaf.userData.toggle(open);
    if (leaf.userData._anim) return;
    const want = open ?? !leaf.userData._open;
    if (want === !!leaf.userData._open) return;
    let pivot = leaf.userData._pivot;
    if (!pivot) {
      // Build a hinge pivot at one vertical edge of the leaf (in its parent's frame) and swing it into the apartment.
      const parent = leaf.parent;
      parent.updateMatrixWorld(true);
      const wb = new THREE.Box3().setFromObject(leaf);
      const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
      const lb = new THREE.Box3();
      for (let i = 0; i < 8; i++) lb.expandByPoint(new THREE.Vector3(i & 1 ? wb.max.x : wb.min.x, i & 2 ? wb.max.y : wb.min.y, i & 4 ? wb.max.z : wb.min.z).applyMatrix4(inv));
      const sx = lb.max.x - lb.min.x, sz = lb.max.z - lb.min.z, alongX = sx >= sz;
      const inward = new THREE.Vector3(0, 0, 1);
      if (this.aptGroup) inward.transformDirection(this.aptGroup.matrixWorld); else inward.set(0, 0, 1);
      inward.transformDirection(inv);   // world → parent-local direction
      pivot = new THREE.Object3D(); pivot.name = 'walk-door-hinge';
      if (alongX) pivot.position.set(lb.min.x, 0, (lb.min.z + lb.max.z) / 2); else pivot.position.set((lb.min.x + lb.max.x) / 2, 0, lb.min.z);
      parent.add(pivot); pivot.updateMatrixWorld(true); pivot.attach(leaf);
      leaf.userData._pivot = pivot;
      leaf.userData._angle = alongX ? (inward.z > 0 ? -1 : 1) * 1.62 : (inward.x > 0 ? 1 : -1) * 1.62;
      this._own.push(pivot);
    }
    leaf.userData._anim = true;
    const from = pivot.rotation.y, to = want ? leaf.userData._angle : 0;
    return tween(750, k => { pivot.rotation.y = from + (to - from) * k; pivot.updateMatrixWorld(true); })
      .then(() => { leaf.userData._open = want; leaf.userData._anim = false; });
  }

  _nearestLift(stair, needOpen = false) {
    const P = this.player.pos;
    let best = null, bd = Infinity;
    for (const inf of this.liftInfos) {
      if (stair != null && inf.stair !== stair) continue;
      const [x, z] = localToWorldXZ(inf.bId, inf.door[0], inf.door[1]);
      let d = Math.hypot(P.x - x, P.z - z);
      if (needOpen && !inf.lift.doorsOpen) d += 5;
      if (d < bd) { bd = d; best = inf; }
    }
    return best;
  }
  _carWorld(inf) { const [x, z] = localToWorldXZ(inf.bId, inf.car[0], inf.car[1]); return [x, z]; }
  _carOf(pos) {
    for (const inf of this.liftInfos) {
      const [lx, lz] = worldToLocal(inf.bId, pos.x, pos.z);
      const dx = lx - inf.door[0], dz = lz - inf.door[1];
      const depth = -(dx * inf.n[0] + dz * inf.n[1]);           // metres behind the landing door
      const lat = Math.abs(dx * inf.n[1] - dz * inf.n[0]);
      if (depth > 0.15 && depth < CAR_DEPTH * 2 && lat < 0.9 && Math.abs(pos.y - floorY(inf.floor)) < 1) return inf;
    }
    return null;
  }

  _infOfAction(act) {
    if (!act) return null;
    return this.liftInfos.find(i => i.core === act.core && i.doorIndex === act.doorIndex && (act.stair == null || i.stair === act.stair)) || null;
  }
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Landing call plate: the tapped key lights, the car arrives, doors open, we step in and turn to the panel.
  async _callLift(stair, building, plate, hitObj) {
    const inf = this._nearestLift(stair, true);
    if (!inf || this.busy || this.riding) return;
    this.busy = true; this.glide = null;
    const light = plate && plate.userData && typeof plate.userData.light === 'function' ? plate.userData.light : null;
    try {
      this._click();
      if (light) light(true, hitObj);
      if (!inf.lift.doorsOpen) { await this._sleep(650); await inf.lift.open(); }
      else await this._sleep(250);
      if (light) light(false);
      await this._walkIntoCar(inf);
    } catch (e) { console.warn('[walk] lift call', e); if (light) light(false); }
    finally { this.busy = false; }
  }
  async _walkIntoCar(inf) {
    const P = this.player, [cx, cz] = this._carWorld(inf);
    const from = P.pos.clone(), fy = P.yaw;
    const midYaw = fy + wrapPi(yawFromDir(cx - from.x, cz - from.z) - fy);
    const dur = Math.min(1400, Math.max(700, from.distanceTo(new THREE.Vector3(cx, from.y, cz)) * 420));
    await tween(dur, k => { P.pos.x = from.x + (cx - from.x) * k; P.pos.z = from.z + (cz - from.z) * k; P.tYaw = P.yaw = fy + (midYaw - fy) * Math.min(1, k * 2.5); P.tPitch = P.pitch = P.pitch * (1 - k); P.vel.set(0, 0, 0); });
    this.glide = null;
    await this._facePanel(inf);
  }

  // Standing spot in front of the car operating panel (≈ 0.52 m from it), looking at its centre.
  _panelStand(inf) {
    const L = inf && inf.lift, pn = L && L.panel;
    if (!pn || !L.car) return null;
    L.car.updateMatrixWorld(true);
    const D = 0.52;
    const stand = L.car.localToWorld(new THREE.Vector3(pn.xs + D, 0, pn.zc));
    const look = new THREE.Vector3(-1, 0, 0).transformDirection(L.car.matrixWorld);
    return { x: stand.x, z: stand.z, yaw: yawFromDir(look.x, look.z), pitch: Math.atan2(1.285 - this.player.eye, D) };
  }
  // Turn smoothly to face the button panel (and zoom in on phones so the keys are finger-sized).
  async _facePanel(inf, dur = 950) {
    const s = this._panelStand(inf);
    this._occupy(inf);
    if (!s) return;
    const P = this.player, fx = P.pos.x, fz = P.pos.z, fy = P.yaw, fp = P.pitch;
    const ty = fy + wrapPi(s.yaw - fy);
    this._zoomForPanel(true, dur);
    await tween(dur, k => { P.pos.x = fx + (s.x - fx) * k; P.pos.z = fz + (s.z - fz) * k; P.yaw = P.tYaw = fy + (ty - fy) * k; P.pitch = P.tPitch = fp + (s.pitch - fp) * k; P.vel.set(0, 0, 0); });
    if (!this._keyHint) { this._keyHint = true; this._toast(this.t('walk.tapKey'), 2600); }
  }
  _occupy(inf) {
    if (this._inCarInf && this._inCarInf !== inf) this._inCarInf.lift.occupied = false;
    this._inCarInf = inf || null;
    if (inf) inf.lift.occupied = true;
  }
  _zoomForPanel(on, dur = 700) {
    if (on) {
      if (this._zoomSaved == null) this._zoomSaved = this._zoomS;
      const a = this.camera.aspect || 1;
      const want = (0.8 * a) / this._baseTanH;               // ≈ ±0.42 m of wall visible vertically at 0.52 m
      if (want < this._zoomS) this._tweenZoom(want, dur);
    } else if (this._zoomSaved != null) {
      const to = this._zoomSaved; this._zoomSaved = null;
      this._tweenZoom(to, dur);
    }
  }
  _tweenZoom(to, dur) {
    const from = this._zoomS, tok = (this._zoomTok = (this._zoomTok || 0) + 1);
    return tween(dur, k => { if (tok !== this._zoomTok) return; this._zoomS = from + (to - from) * k; this._applyFov(); });
  }

  async _pressLiftButton(floor, act) {
    if (this.riding || this.busy) return;
    let inf = this._carOf(this.player.pos);
    if (!inf) {
      inf = this._infOfAction(act) || this._nearestLift(null, true);
      if (!inf) return;
      this.busy = true;
      try { if (!inf.lift.doorsOpen) await inf.lift.open(); await this._walkIntoCar(inf); } finally { this.busy = false; }
    }
    return this._pressKey(inf, floor);
  }
  // A floor key (3D panel or the 2D fallback grid): light it, click, then ride.
  async _pressKey(inf, floor) {
    if (this.riding || !inf) return;
    const L = inf.lift;
    this._click();
    if (floor === inf.floor) {
      if (L.press) L.press(floor, 500);
      if (!L.doorsOpen) L.open();
      return;
    }
    if (L.press) L.press(floor);
    return this._ride(inf, floor);
  }
  async _liftDoorKey(act) {
    const inf = this._carOf(this.player.pos) || this._infOfAction(act);
    if (!inf || this.riding) return;
    const L = inf.lift;
    this._click();
    if (L.press) L.press(act.open ? 'open' : 'close', 700);
    try { if (act.open) await L.open(); else await L.close(); } catch (e) { console.warn(e); }
  }
  _liftAlarm(act) {
    const inf = this._carOf(this.player.pos) || this._infOfAction(act);
    this._click(); this._bell();
    if (inf && inf.lift.press) inf.lift.press('bell', 1600);
    this._toast(this.t('walk.alarm'), 2200);
  }

  async _ride(inf, target) {
    if (this.riding || !this.unit) return;
    const from = inf.floor;
    if (target === from) { if (!inf.lift.doorsOpen) inf.lift.open(); return; }
    this.riding = true; this.glide = null; this.root.classList.add('riding');
    this._rideTarget = target; this._renderLiftPanel();
    const P = this.player, bId = inf.bId;
    this._occupy(inf);
    // stand at the panel (the floor screen counts the floors while we travel)
    const st = this._panelStand(inf);
    if (st) {
      const sx = P.pos.x, sz = P.pos.z, sy = P.yaw, sp = P.pitch, ty = sy + wrapPi(st.yaw - sy);
      const far = Math.hypot(st.x - sx, st.z - sz) > 0.05 || Math.abs(ty - sy) > 0.05;
      if (far) { this._zoomForPanel(true, 500); await tween(500, k => { P.pos.x = sx + (st.x - sx) * k; P.pos.z = sz + (st.z - sz) * k; P.yaw = P.tYaw = sy + (ty - sy) * k; P.pitch = P.tPitch = sp + (st.pitch - sp) * k; }); }
    } else {
      const [cx, cz] = this._carWorld(inf), sx = P.pos.x, sz = P.pos.z;
      await tween(350, k => { P.pos.x = sx + (cx - sx) * k; P.pos.z = sz + (cz - sz) * k; });
    }
    // Camera rides a proxy parented like the car: anchor.y follows onTick.
    const anchor = new THREE.Object3D(); anchor.name = 'walk-lift-anchor';
    anchor.position.set(P.pos.x, floorY(from), P.pos.z);
    this.scene.add(anchor); anchor.add(this.camera);
    this.camera.position.set(0, P.eye, 0);
    this._anchor = anchor;
    // Build the destination floor while we travel (its own car is hidden until we arrive).
    const nextP = this._buildCommons(bId, target);
    let absMode = null, lastY = null, lastT = 0, vy = 0;
    this._rideSway = 0; this._rideSpeed = 0;
    const y0 = floorY(from), y1 = floorY(target);
    const onTick = y => {
      if (typeof y !== 'number' || !isFinite(y)) return;
      if (absMode === null && Math.abs(y0) > 0.3) absMode = Math.abs(y - y0) < Math.abs(y);
      const wy = absMode === false ? y0 + y : y;
      anchor.position.y = Math.min(Math.max(wy, Math.min(y0, y1) - 0.5), Math.max(y0, y1) + 0.5);
      this._liftFloorNow = this._floorFromY(anchor.position.y);
      // acceleration feel: the eye lags behind the car (dips when accelerating up, lifts when braking)
      const now = performance.now();
      if (lastY != null && now > lastT) {
        const dt = Math.max(0.008, (now - lastT) / 1000), v = (anchor.position.y - lastY) / dt, acc = (v - vy) / dt;
        vy += (v - vy) * 0.5;
        const want = Math.max(-0.035, Math.min(0.035, -acc * 0.012));
        this._rideSway += (want - this._rideSway) * 0.18;
        this._rideSpeed = Math.abs(vy);
      }
      lastY = anchor.position.y; lastT = now;
    };
    let next;
    try {
      next = await nextP;
      const twin = (next._infos || []).find(i => i.core === inf.core && i.doorIndex === inf.doorIndex);
      if (twin && twin.lift.group) twin.lift.group.visible = false;
      if (typeof inf.lift.travelTo === 'function') await inf.lift.travelTo(target, onTick);
      else await tween(Math.min(6000, 1200 * Math.abs(target - from)), k => onTick(y0 + (y1 - y0) * k));
    } catch (e) { console.warn('[walk] lift travel', e); if (!next) next = await nextP.catch(() => null); }
    if (this.disposed) return;
    this._rideSway = 0; this._rideSpeed = 0;
    // Arrive: swap commons, drop the camera back into the world at the same spot of the twin car.
    anchor.remove(this.camera); this.scene.add(this.camera); this.scene.remove(anchor); this._anchor = null;
    P.pos.y = this._targetY = y1;
    let arrived = null;
    if (next) {
      const [lx0, lz0] = worldToLocal(bId, P.pos.x, P.pos.z);
      this._disposeCommons();
      this._activateCommons(next);
      this.floor = target; this.bId = bId;
      const twin = this.liftInfos.find(i => i.core === inf.core && i.doorIndex === inf.doorIndex);
      if (twin) {
        arrived = twin;
        if (twin.lift.group) twin.lift.group.visible = true;
        const [tx, tz] = localToWorldXZ(bId, lx0, lz0); P.pos.x = tx; P.pos.z = tz;   // same car-relative spot (cars share x/z)
        twin.lift.car.visible = true;
        this._occupy(twin);
        this._syncCamera();
        try { if (!twin.lift.doorsOpen) await twin.lift.open(); } catch (e) { console.warn(e); }
      }
    }
    this._syncCamera();
    this._hideFloorsForWalker(true);
    this.riding = false; this._rideTarget = null; this._liftFloorNow = null;
    this.root.classList.remove('riding');
    this._renderLiftPanel(); this._updateHud(true);
    // turn back toward the open doors, ready to walk out
    if (arrived) {
      const [nx, nz] = dirToWorld(arrived.bId, arrived.n[0], arrived.n[1]);
      const [cx, cz] = this._carWorld(arrived);
      const sx = P.pos.x, sz = P.pos.z, sy = P.yaw, sp = P.pitch, ty = sy + wrapPi(yawFromDir(nx, nz) - sy);
      this._zoomForPanel(false, 800);
      this.busy = true;
      try { await tween(800, k => { P.pos.x = sx + (cx - sx) * k; P.pos.z = sz + (cz - sz) * k; P.yaw = P.tYaw = sy + (ty - sy) * k; P.pitch = P.tPitch = sp * (1 - k); }); }
      finally { this.busy = false; }
    }
  }
  _floorFromY(y) { let best = 0, bd = Infinity; for (let f = -1; f <= TOP_FLOOR; f++) { const d = Math.abs(floorY(f) - y); if (d < bd) { bd = d; best = f; } } return best; }

  // ======================= glide =======================
  _glideTo(x, z) { this.glide = { x, z, t: 0, stuck: 0 }; }
  _glideTap(clientX, clientY) {
    if (this.mode === '360' || this.riding) return;
    const hit = this._pickAt(clientX, clientY, true);
    if (hit && this._actionOf(hit)) return;
    const P = this.player;
    if (hit && hit.object.userData.floor && hit.distance < 35 && Math.abs(hit.point.y - P.pos.y) < 1.5) return this._glideTo(hit.point.x, hit.point.z);
    if (hit && !hit.object.userData.floor && hit.distance < 35) { // clicked a wall/furniture → go to its foot
      const d = new THREE.Vector3(hit.point.x - P.pos.x, 0, hit.point.z - P.pos.z); const L = d.length();
      if (L > 0.6) { d.multiplyScalar((L - 0.5) / L); return this._glideTo(P.pos.x + d.x, P.pos.z + d.z); }
    }
    this._glideTo(P.pos.x - Math.sin(P.yaw) * 2.5, P.pos.z - Math.cos(P.yaw) * 2.5);
  }

  // ======================= frame loop =======================
  _loop() {
    if (this.disposed) return;
    this._raf = requestAnimationFrame(this._loop);
    if (this._paused) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this._update(dt);
    try { this.env && this.env.update && this.env.update(dt, this.camera); } catch (e) { if (!this._envErr) { console.warn(e); this._envErr = true; } }
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const P = this.player;
    // look
    let turn = 0;
    if (this.keys.has('ArrowLeft') || this.pad.l) turn += 1;
    if (this.keys.has('ArrowRight') || this.pad.r) turn -= 1;
    if (turn) { P.tYaw += turn * 1.5 * dt; this.touched360 = true; }
    if (this.mode === '360' && !this.touched360 && !this._dragging) P.tYaw += 0.09 * dt;
    P.yaw += (P.tYaw - P.yaw) * damp(14, dt);
    P.pitch += (P.tPitch - P.pitch) * damp(14, dt);

    if (!this.riding && !this.busy && this.mode === 'walk' && this.apt) {
      let f = 0, s = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.pad.u) f += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.pad.d) f -= 1;
      if (this.keys.has('KeyD')) s += 1;
      if (this.keys.has('KeyA')) s -= 1;
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      const want = new THREE.Vector3();
      if (f || s) {
        this.glide = null;
        const sp = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) ? RUN : SPEED;
        want.set(fx * f + rx * s, 0, fz * f + rz * s).normalize().multiplyScalar(sp);
      } else if (this.glide) {
        const g = this.glide, dx = g.x - P.pos.x, dz = g.z - P.pos.z, L = Math.hypot(dx, dz);
        g.t += dt;
        if (L < 0.12 || g.t > 12) this.glide = null;
        else want.set(dx / L, 0, dz / L).multiplyScalar(Math.min(1.9, L * 1.8 + 0.25) * Math.min(1, 0.35 + g.t * 2.2));
      }
      P.vel.lerp(want, damp(want.lengthSq() ? 7 : 10, dt));
      if (P.vel.lengthSq() > 1e-6) {
        const d = P.vel.clone().multiplyScalar(dt), exp = d.length();
        const got = this._move(d);
        if (this.glide) { if (got < exp * 0.3) { this.glide.stuck += dt; if (this.glide.stuck > 0.35) { this.glide = null; this._doorHint(); } } else this.glide.stuck = 0; }
        else if (f > 0 && got < exp * 0.2) this._doorHint();
        if (got < exp * 0.2 && !f && !s) P.vel.multiplyScalar(0.5);
      }
      // stairs / steps: follow the floor under us
      if (this._targetY != null) {
        const fy = this._floorAt(P.pos.x, P.pos.y, P.pos.z, this._near(this.floors, P.pos, 1.2));
        if (fy !== null) this._targetY = fy;
        P.pos.y += (this._targetY - P.pos.y) * damp(12, dt);
      }
      this._autoDoor(f > 0);
      this._carWatch();
    }
    this._syncCamera();

    const now = performance.now();
    if (now - this._lastHud > 200) { this._lastHud = now; this._updateHud(); }
    if (now - this._lastMap > 110) { this._lastMap = now; this._drawMap(); }
    this._updateDim(now);
  }

  _syncCamera() {
    const P = this.player, cam = this.camera;
    if (this._anchor) cam.position.set(P.pos.x - this._anchor.position.x, P.eye, P.pos.z - this._anchor.position.z);
    else cam.position.set(P.pos.x, P.pos.y + P.eye, P.pos.z);
    if (this._anchor) {   // riding: eye lag from the car's acceleration + a whisper of sway at speed
      const t = performance.now() / 1000, sp = Math.min(1, (this._rideSpeed || 0) / 2.5);
      cam.position.y += this._rideSway || 0;
      cam.rotation.set(P.pitch + Math.sin(t * 1.7) * 0.0025 * sp, P.yaw, Math.sin(t * 2.3) * 0.004 * sp, 'YXZ');
    } else cam.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
    // Interior IBL indoors, sky IBL outdoors (balcony) for correct glass/metal reflections.
    const cur = this.scene.environment;
    if (cur && cur !== this.roomEnv) this.skyEnv = cur;
    const outside = this._placeKind === 'outdoor';
    const want = (!outside && this.roomEnv) ? this.roomEnv : this.skyEnv;
    if (want && cur !== want) this.scene.environment = want;
  }

  // Loaded apartments' doors open by themselves when you WALK into them (pad/keys); a glide stops at a closed door.
  _autoDoor(walking) {
    if (!walking || !this.loaded.size) return;
    const P = this.player.pos;
    if (this.player.vel.lengthSq() < 0.05) return;
    for (const e of this.loaded.values()) {
      const leaf = e.apt.doorLeaf;
      if (!leaf || leaf.userData._open || leaf.userData._anim || leaf.userData._autoDone) continue;
      const [x, z] = unitToWorld(e.unit, (e.apt.entrance && e.apt.entrance.u) ?? e.unit.door.u, 0);
      if (Math.abs(P.y - floorY(e.unit.floor)) > 1 || Math.hypot(P.x - x, P.z - z) > 1.5) continue;
      leaf.userData._autoDone = true; this._toggleDoor(leaf, true);
    }
  }
  // Blocked by a closed apartment door → tell the user to tap it (throttled).
  _doorHint() {
    const now = performance.now(); if (now - (this._doorHintT || 0) < 5000) return;
    const P = this.player, dir = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    const o = new THREE.Vector3(P.pos.x, P.pos.y + 1.0, P.pos.z);
    const hit = this._cast(this._near(this.solids, P.pos, 1.6), o, dir, 1.1)[0];
    if (!hit) return;
    let x = hit.object, door = false;
    while (x) { const ud = x.userData || {}; if (ud.doorLeaf || (ud.action && ud.action.type === 'aptDoor')) { door = true; break; } x = x.parent; }
    if (!door) return;
    this._doorHintT = now; this._toast(this.t('walk.tapDoor'), 2400);
  }
  // Entering the car on foot → turn to the panel; leaving it → restore the view and free the car.
  _carWatch() {
    if (this.busy || this.riding) return;
    const inf = this._carOf(this.player.pos);
    if (inf && inf !== this._inCarInf) {
      this._occupy(inf);
      this.busy = true; this.glide = null; this.player.vel.set(0, 0, 0);
      this._facePanel(inf, 900).finally(() => { this.busy = false; });
      this._renderLiftPanel();
    } else if (!inf && this._inCarInf) {
      this._occupy(null);
      this._zoomForPanel(false, 600);
      this._renderLiftPanel();
    }
  }

  // ======================= where am I =======================
  _unitUV(pos) {
    if (!this.unit || this.bId !== this.unit.building) return null;
    const [lx, lz] = worldToLocal(this.unit.building, pos.x, pos.z);
    const [u, v] = localToUnit(this.unit, lx, lz);
    const level = pos.y - floorY(this.unit.floor) > 1.6 ? 1 : 0;
    if (Math.abs(pos.y - floorY(this.unit.floor)) > 4.5) return null;
    return { u, v, level };
  }
  _currentRoom() {
    const uv = this._unitUV(this.player.pos);
    if (!uv || !this.rooms) return null;
    if (uv.u < -0.05 || uv.u > this.unit.width + 0.05 || uv.v < 0.02 || uv.v > this.unit.depth + GEOM.balconyDepth + 0.6) return null;
    const cand = this.rooms.filter(r => r.level === uv.level);
    const hit = cand.find(r => r.poly && pointInPoly([uv.u, uv.v], r.poly));
    if (hit) return hit;
    if (uv.v > this.unit.depth) return cand.find(r => OUTDOOR.has(r.kind)) || null;
    let best = null, bd = Infinity;
    for (const r of cand) { const d = Math.hypot(r.center[0] - uv.u, r.center[1] - uv.v); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  _floorName(f) {
    if (f === -1) return this.t('walk.parking');
    if (f === 0) return this.t('walk.ground');
    return `${this.t('walk.floor')} ${f === 11 ? '10D' : f}`;
  }

  // ======================= HUD =======================
  _buildHud() {
    const h = document.createElement('div'); h.className = 'vw-hud';
    h.innerHTML = `
      <div class="vw-top">
        <div class="vw-title vw-panel"><div class="t1"></div><div class="t2"></div></div>
        <div class="vw-actions">
          <button class="vw-btn vw-ghost vw-icon vw-helpbtn" data-k="help" aria-label="help">?</button>
          <button class="vw-btn vw-ghost vw-photo" data-k="photo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg><span class="lbl"></span></button>
          <button class="vw-btn vw-gold" data-k="reserve"><span class="lbl"></span><span class="vw-price"></span></button>
          <button class="vw-btn vw-ghost vw-icon vw-gear" data-k="gear" aria-expanded="false">${ICON_GEAR}</button>
          <button class="vw-btn vw-ghost vw-exit" data-k="exit"><span aria-hidden="true">✕</span><span class="lbl"></span></button>
        </div>
      </div>
      <div class="vw-tools vw-panel col">
        <div class="vw-seg" data-k="mode"><button data-m="walk"></button><button data-m="360"></button></div>
        <div class="vw-seg vw-time" data-k="time"><button data-t="day" title="">☀\uFE0E</button><button data-t="dusk">◐</button><button data-t="night">☾</button></div>
        <div class="vw-seg vw-zoom" data-k="zoom"><button data-z="-1">−</button><span class="zv"></span><button data-z="1">+</button></div>
        <button class="vw-tlabel st" data-k="dlabel"></button>
        <div class="vw-styles"></div>
        <button class="vw-prow" data-k="help"><i>?</i><span></span></button>
      </div>
      <div class="vw-map vw-panel"><canvas></canvas></div>
      <button class="vw-mapbtn vw-panel" data-k="map">${ICON_MAP}</button>
      <div class="vw-lift vw-panel"><div class="hd"><span class="lt"></span><span class="ind"></span></div><div class="grid"></div></div>
      <button class="vw-floorsbtn vw-ghost" data-k="floors" aria-expanded="false"><span aria-hidden="true">⇅</span><span class="lbl"></span></button>
      <div class="vw-pad">
        <button class="u" data-p="u" aria-label="forward">▲</button><button class="l" data-p="l" aria-label="turn left">◀</button>
        <button class="r" data-p="r" aria-label="turn right">▶</button><button class="d" data-p="d" aria-label="back">▼</button>
      </div>
      <div class="vw-bottom"><div class="vw-row vw-rooms"></div><div class="vw-row vw-tp"></div></div>
      <div class="vw-ucard vw-panel"><div class="ut"><div class="u1"></div><div class="u2"></div></div><button class="vw-btn vw-gold" data-k="ureserve"></button></div>
      <div class="vw-toast vw-panel"></div>
      <div class="vw-fade"></div>
      <div class="vw-help"><div class="card"><h3></h3><ul></ul><button class="vw-btn vw-gold" data-k="helpok"></button></div></div>
      <div class="vw-loading"><div class="ring"></div><div class="lt"></div></div>`;
    this.root.appendChild(h);
    const q = s => h.querySelector(s);
    this.el = {
      hud: h, t1: q('.t1'), t2: q('.t2'), reserve: q('[data-k=reserve]'), photo: q('[data-k=photo]'), exit: q('[data-k=exit]'), helpBtn: q('[data-k=help]'),
      tools: q('.vw-tools'), modeSeg: q('[data-k=mode]'), timeSeg: q('[data-k=time]'), dlabel: q('[data-k=dlabel]'), styles: q('.vw-styles'),
      map: q('.vw-map canvas'), lift: q('.vw-lift'), liftGrid: q('.vw-lift .grid'), liftT: q('.vw-lift .lt'), liftInd: q('.vw-lift .ind'),
      pad: q('.vw-pad'), rooms: q('.vw-rooms'), tp: q('.vw-tp'), toast: q('.vw-toast'), fade: q('.vw-fade'),
      help: q('.vw-help'), loading: q('.vw-loading'),
      gear: q('[data-k=gear]'), zoom: q('.vw-zoom'), zv: q('.vw-zoom .zv'), mapBtn: q('.vw-mapbtn'), prow: q('.vw-prow span'),
      floorsBtn: q('[data-k=floors]'), ucard: q('.vw-ucard'), u1: q('.vw-ucard .u1'), u2: q('.vw-ucard .u2'), ureserve: q('[data-k=ureserve]'),
    };
    // Floor buttons: -1, P, 1..10
    for (const f of [-1, 0, ...Array.from({ length: TOP_FLOOR }, (_, i) => i + 1)]) {
      const b = document.createElement('button'); b.dataset.f = f; b.textContent = f === 0 ? 'P' : String(f);
      this.el.liftGrid.appendChild(b);
    }
    this._applyTexts();
  }

  _applyTexts() {
    const e = this.el; if (!e) return;
    this.root.dir = this.dir;
    this.root.lang = this.lang;
    e.reserve.querySelector('.lbl').textContent = this.t('walk.reserve');
    e.exit.querySelector('.lbl').textContent = this.t('walk.exit');
    e.exit.setAttribute('aria-label', this.t('walk.exit'));
    e.helpBtn.title = this.t('walk.help');
    e.prow.textContent = this.t('walk.help');
    e.gear.title = this.t('walk.settings'); e.gear.setAttribute('aria-label', e.gear.title);
    e.mapBtn.title = this.t('walk.map'); e.mapBtn.setAttribute('aria-label', e.mapBtn.title);
    e.zoom.children[0].title = this.t('walk.zoomOut'); e.zoom.children[0].setAttribute('aria-label', e.zoom.children[0].title);
    e.zoom.children[2].title = this.t('walk.zoomIn'); e.zoom.children[2].setAttribute('aria-label', e.zoom.children[2].title);
    e.photo.querySelector('.lbl').textContent = this.t('walk.photo');
    e.photo.setAttribute('aria-label', this.t('walk.photo'));
    e.modeSeg.children[0].textContent = this.t('walk.walk');
    e.modeSeg.children[1].textContent = this.t('walk.360');
    for (const b of e.timeSeg.children) { b.title = this.t('walk.' + b.dataset.t); b.setAttribute('aria-label', b.title); }
    e.dlabel.textContent = this.t('walk.design');
    e.liftT.textContent = this.t('walk.lift');
    e.floorsBtn.querySelector('.lbl').textContent = this.t('walk.floors');
    e.ureserve.textContent = this.t('walk.reserveThis');
    if (this._cardUnit) this._fillUnitCard(this._cardUnit);
    e.loading.querySelector('.lt').textContent = this.t('walk.loading');
    e.help.querySelector('h3').textContent = this.t('walk.help.title');
    e.help.querySelector('[data-k=helpok]').textContent = this.t('walk.help.ok');
    const items = this._isTouch
      ? [['☝', 'walk.help.drag'], ['⇔', 'walk.help.pinch'], ['▲', 'walk.help.pad'], ['⤢', 'walk.help.dbltap'], ['◉', 'walk.help.click'], ['360', 'walk.help.360']]
      : [['☝', 'walk.help.drag'], ['W', 'walk.help.keys'], ['⤢', 'walk.help.dblclick'], ['◉', 'walk.help.click'], ['360', 'walk.help.360']];
    e.help.querySelector('ul').innerHTML = '';
    for (const [ic, k] of items) { const li = document.createElement('li'); const i = document.createElement('i'); i.textContent = ic; if (ic === '360') i.style.fontSize = '10px'; const s = document.createElement('span'); s.textContent = this.t(k); li.append(i, s); e.help.querySelector('ul').appendChild(li); }
    this._renderTeleports(); this._renderRooms(); this._renderStyles(); this._renderTime(); this._updateTitle(); this._applyModeSafe();
  }
  _applyModeSafe() { if (this.el) this.el.modeSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === this.mode)); }
  /** Call after the site language changes. */
  refreshTexts() { this._applyTexts(); this._updateHud(true); }

  _updateTitle() {
    if (!this.el) return;
    const u = this.unit;
    this.el.t1.innerHTML = '';
    const br = document.createElement('span'); br.className = 'brand'; br.textContent = u ? 'VILNYI RIVER CITY · ' : 'VILNYI RIVER CITY';
    this.el.t1.append(br, document.createTextNode(u ? ((this.i18n && typeof this.i18n.unitLabel === 'function' && this.i18n.unitLabel(u)) || unitLabel(u)) : ''));
    this.el.reserve.querySelector('.vw-price').textContent = u && u.price ? '· ' + money(u.price) : '';
    this.el.reserve.style.display = u && u.status && u.status !== 'available' ? 'none' : '';
  }
  _styleName(id) {
    const s = (this.styles || FALLBACK_STYLES).find(x => x.id === id) || { id, name: id };
    const n = s.name;
    if (typeof n === 'string') return n;
    const lang = String(this.lang).slice(0, 2);
    return (n && n[lang]) || this.t('walk.style.' + id, (n && n.en) || id);
  }
  _renderStyles() {
    if (!this.el) return;
    const box = this.el.styles; box.innerHTML = '';
    for (const s of this.styles || FALLBACK_STYLES) {
      const b = document.createElement('button'); b.textContent = this._styleName(s.id); b.dataset.s = s.id;
      b.classList.toggle('on', s.id === this.styleId); box.appendChild(b);
    }
  }
  _renderTime() { if (this.el) for (const b of this.el.timeSeg.children) b.classList.toggle('on', b.dataset.t === this.envMode); }
  _renderTeleports() {
    const box = this.el.tp; box.innerHTML = '';
    for (const k of ['lobby', 'corridor', 'apartment', 'balcony', 'parking']) {
      const b = document.createElement('button'); b.className = 'vw-chip tp'; b.dataset.tp = k; b.textContent = this.t('walk.' + k); box.appendChild(b);
    }
  }
  _renderRooms() {
    if (!this.el) return;
    const box = this.el.rooms; box.innerHTML = '';
    (this.rooms || []).forEach((r, i) => {
      const b = document.createElement('button'); b.className = 'vw-chip'; b.dataset.room = i;
      b.textContent = r.label + (r.level === 1 && r.kind !== 'hall' ? ' ↑' : ''); box.appendChild(b);
    });
  }
  _renderLiftPanel() {
    if (!this.el) return;
    const inf = this.riding ? true : this._carOf(this.player.pos);
    if (!inf) this._liftGridOpen = false;
    this.el.lift.classList.toggle('show', !!inf && !!this._liftGridOpen);
    this.el.floorsBtn.classList.toggle('on', !!this._liftGridOpen);
    this.el.floorsBtn.setAttribute('aria-expanded', String(!!this._liftGridOpen));
    this.root.classList.toggle('incar', !!inf);
    const here = this.riding ? this._liftFloorNow : this.floor;
    this.el.liftInd.textContent = here == null ? '' : (here === 0 ? 'P' : here === -1 ? '−1' : here) + (this.riding ? (this._rideTarget > (here ?? 0) ? ' ▲' : ' ▼') : '');
    for (const b of this.el.liftGrid.children) {
      const f = +b.dataset.f;
      b.classList.toggle('on', this.riding && f === this._rideTarget);
      b.classList.toggle('here', !this.riding && f === this.floor);
    }
  }

  _updateHud(force) {
    if (!this.el || !this.unit) return;
    if (!this.riding && this.loaded.size > 1) {   // walked into another loaded apartment → it becomes the current one
      const e = this._aptAt(this.player.pos);
      if (e && e.apt !== this.apt) return this._setCurrent(e);
    }
    let place, kind = 'indoor';
    const inf = !this.riding && this._carOf(this.player.pos);
    const room = !this.riding && !inf ? this._currentRoom() : null;
    let fl = this.riding ? this._liftFloorNow ?? this.floor : this.floor;
    if (this.riding || inf) place = this.t('walk.lift');
    else if (room) { place = room.label; if (OUTDOOR.has(room.kind)) kind = 'outdoor'; if (room.level === 1) fl = this.unit.floor + 1; }
    else if (this.floor === -1) place = this.t('walk.parking');
    else if (this.floor === 0) place = this.t('walk.lobby');
    else place = this.t('walk.corridor');
    this._placeKind = kind;
    const fname = this._floorName(fl);
    if (place === fname) place = '';
    const txt = place ? `${fname} · ${place}` : fname;
    if (force || txt !== this._lastPlace) {
      this._lastPlace = txt;
      this.el.t2.innerHTML = '';
      const b = document.createElement('b'); b.textContent = fname;
      this.el.t2.append(b, document.createTextNode(place ? ' · ' + place : ''));
      for (const c of this.el.rooms.children) c.classList.toggle('on', room && this.rooms[+c.dataset.room] === room);
    }
    const inCarNow = !!inf || this.riding;
    if (inCarNow !== this._wasInCar || this.riding) { this._wasInCar = inCarNow; this._renderLiftPanel(); }
    if (!this.riding) this._hideFloorsForWalker(false);
  }

  _toast(msg, ms = 1600) {
    const t = this.el.toast; t.textContent = msg; t.classList.add('show');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  _fade(on) { this.el.fade.style.opacity = on ? '1' : '0'; return new Promise(r => setTimeout(r, 290)); }
  _showLoading(on) { this.el.loading.classList.toggle('hide', !on); if (!on) { this._lastAct = performance.now(); this._setDim(false); } }
  _showHelp(on) { this.el.help.classList.toggle('show', on); if (!on) lsSet('vrc.walk.help', '1'); }

  // ======================= minimap =======================
  _drawMap() {
    const cv = this.el.map; if (!cv.offsetParent && cv.offsetWidth === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H || !this.unit || this.floor == null) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, W, H);
    const u = this.unit, bId = this.bId, P = this.player.pos;
    const [plx, plz] = worldToLocal(bId, P.x, P.z);
    const uv = this._unitUV(P);
    const inUnit = !this._mapWide && uv && uv.u > -0.3 && uv.u < u.width + 0.3 && uv.v > -0.1 && uv.v < u.depth + GEOM.balconyDepth + 0.3 && u.building === bId && Math.abs(this.floor - u.floor) <= 1;
    const uRect = (unit, d = unit.depth) => [[0, 0], [unit.width, 0], [unit.width, d], [0, d]].map(([a, b]) => unitToLocal(unit, a, b));
    let bx0, bx1, bz0, bz1;
    if (inUnit) {
      const pts = uRect(u, u.depth + GEOM.balconyDepth); bx0 = Math.min(...pts.map(p => p[0])) - 0.8; bx1 = Math.max(...pts.map(p => p[0])) + 0.8; bz0 = Math.min(...pts.map(p => p[1])) - 0.8; bz1 = Math.max(...pts.map(p => p[1])) + 0.8;
    } else { bx0 = -2; bx1 = 86; bz0 = -40; bz1 = 10.5; }
    const sc = Math.min(W / (bx1 - bx0), H / (bz1 - bz0)), ox = W / 2 - (bx0 + bx1) / 2 * sc, oz = H / 2 - (bz0 + bz1) / 2 * sc;
    const X = x => ox + x * sc, Z = z => oz + z * sc;
    const poly = (pts, fill, stroke, lw = 1) => { ctx.beginPath(); pts.forEach(([x, z], i) => i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };
    poly(FOOTPRINT, '#17140f', 'rgba(201,164,92,.55)', 1);
    const fl = this.floor;
    if (fl >= 0) {
      for (const c of CORRIDORS) poly([[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z1]], '#2b261d');
      for (const b of blocksOn(bId, fl)) poly([[0, 0], [b.width, 0], [b.width, b.depth], [0, b.depth]].map(([a, v]) => [b.frame.o[0] + b.frame.U[0] * a + b.frame.V[0] * v, b.frame.o[1] + b.frame.U[1] * a + b.frame.V[1] * v]), '#1d1b17', 'rgba(201,164,92,.18)');
      for (const x of unitsOn(bId, Math.min(fl, TOP_FLOOR))) poly(uRect(x), x.id === u.id ? 'rgba(201,164,92,.28)' : this.loaded.has(x.id) ? 'rgba(201,164,92,.12)' : null, 'rgba(201,164,92,.22)', 0.6);
    }
    for (const c of CORES) poly([[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z1]], '#26231e', 'rgba(201,164,92,.3)', 0.6);
    // apartment rooms (target unit, current level)
    if (u.building === bId && (fl === u.floor || fl === u.floor + 1 || inUnit) && this.rooms) {
      const lvl = uv ? uv.level : 0;
      const cur = this._currentRoom();
      for (const r of this.rooms) {
        if (r.level !== lvl || !r.poly) continue;
        poly(r.poly.map(([a, b]) => unitToLocal(u, a, b)), r === cur ? 'rgba(201,164,92,.32)' : OUTDOOR.has(r.kind) ? 'rgba(120,140,110,.18)' : 'rgba(243,234,215,.06)', 'rgba(230,201,135,.75)', inUnit ? 1 : 0.6);
        if (inUnit && sc > 9) {
          const [cx, cz] = unitToLocal(u, r.center[0], r.center[1]);
          ctx.fillStyle = 'rgba(243,234,215,.8)'; ctx.font = `${Math.max(8, Math.min(10, sc * 0.55))}px Manrope,Heebo,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(r.label.slice(0, 12), X(cx), Z(cz));
        }
      }
    }
    // player: view wedge + dot
    const yawL = this.player.yaw - BUILDINGS[bId].rotY, dx = -Math.sin(yawL), dz = -Math.cos(yawL);
    const R = inUnit ? 26 : 16, half = 0.55;
    const g = ctx.createRadialGradient(X(plx), Z(plz), 0, X(plx), Z(plz), R);
    g.addColorStop(0, 'rgba(230,201,135,.55)'); g.addColorStop(1, 'rgba(230,201,135,0)');
    ctx.beginPath(); ctx.moveTo(X(plx), Z(plz));
    const a0 = Math.atan2(dz, dx); ctx.arc(X(plx), Z(plz), R, a0 - half, a0 + half); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(X(plx), Z(plz), 3.4, 0, Math.PI * 2); ctx.fillStyle = '#e6c987'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
    // floor tag
    ctx.fillStyle = 'rgba(230,201,135,.9)'; ctx.font = '600 9.5px Manrope,Heebo,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${bId} · ${fl === -1 ? '−1' : fl === 0 ? 'P' : fl}`, 6, 5);
  }

  // ======================= input =======================
  _bind() {
    const c = this.canvas, e = this.el;
    this._h = {
      down: ev => this._onDown(ev), move: ev => this._onMove(ev), up: ev => this._onUp(ev),
      key: ev => this._onKey(ev, true), keyup: ev => this._onKey(ev, false), blur: () => { this.keys.clear(); this.pad = { u: 0, d: 0, l: 0, r: 0 }; },
      vis: () => { this._paused = document.hidden; if (!this._paused) this.clock.getDelta(); },
      ctx: ev => ev.preventDefault(), wheel: ev => this._onWheel(ev),
      hud: ev => this._onHudClick(ev),
      poke: ev => this._onAnyDown(ev),
      touch: ev => { if (ev.cancelable) ev.preventDefault(); },      // no page scroll / pinch-zoom over the 3D view
      gesture: ev => ev.preventDefault(),                              // iOS Safari page pinch
      orient: () => setTimeout(() => this._resize(), 120),
    };
    c.addEventListener('pointerdown', this._h.down);
    c.addEventListener('pointermove', this._h.move);
    c.addEventListener('pointerup', this._h.up);
    c.addEventListener('pointercancel', this._h.up);
    c.addEventListener('contextmenu', this._h.ctx);
    c.addEventListener('wheel', this._h.wheel, { passive: false });
    c.addEventListener('touchstart', this._h.touch, { passive: false });
    c.addEventListener('touchmove', this._h.touch, { passive: false });
    this.root.addEventListener('pointerdown', this._h.poke, true);
    this.root.addEventListener('gesturestart', this._h.gesture);
    this.root.addEventListener('gesturechange', this._h.gesture);
    window.addEventListener('orientationchange', this._h.orient);
    window.addEventListener('keydown', this._h.key);
    window.addEventListener('keyup', this._h.keyup);
    window.addEventListener('blur', this._h.blur);
    document.addEventListener('visibilitychange', this._h.vis);
    e.hud.addEventListener('click', this._h.hud);
    // hold-to-move pad
    for (const b of e.pad.children) {
      const k = b.dataset.p;
      const on = ev => { ev.preventDefault(); try { b.setPointerCapture(ev.pointerId); } catch { /* */ } this.pad[k] = 1; b.classList.add('on'); this.root.classList.add('padon'); this.glide = null; this.touched360 = true; };
      const off = () => { this.pad[k] = 0; b.classList.remove('on'); this.root.classList.toggle('padon', !!(this.pad.u || this.pad.d || this.pad.l || this.pad.r)); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
      b.addEventListener('contextmenu', ev => ev.preventDefault());
    }
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.container);
  }
  _unbind() {
    const c = this.canvas, h = this._h; if (!h) return;
    c.removeEventListener('pointerdown', h.down); c.removeEventListener('pointermove', h.move); c.removeEventListener('pointerup', h.up);
    c.removeEventListener('pointercancel', h.up); c.removeEventListener('contextmenu', h.ctx); c.removeEventListener('wheel', h.wheel);
    c.removeEventListener('touchstart', h.touch); c.removeEventListener('touchmove', h.touch);
    this.root.removeEventListener('pointerdown', h.poke, true);
    this.root.removeEventListener('gesturestart', h.gesture); this.root.removeEventListener('gesturechange', h.gesture);
    window.removeEventListener('orientationchange', h.orient);
    window.removeEventListener('keydown', h.key); window.removeEventListener('keyup', h.keyup); window.removeEventListener('blur', h.blur);
    document.removeEventListener('visibilitychange', h.vis);
    this.el.hud.removeEventListener('click', h.hud);
    this._ro && this._ro.disconnect();
    clearTimeout(this._toastT); clearTimeout(this._cardT);
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setSize(w, h, false);
    const a = w / Math.max(1, h);
    this.camera.aspect = a;
    // Portrait: fix the horizontal FOV (≈78°) so a phone sees a real room, not a keyhole.
    // Landscape: the classic 68° vertical FOV, horizontally capped.
    this._baseTanH = a < 1 ? Math.tan(HFOV_PORTRAIT / 2 * D2R) : Math.min(Math.tan(VFOV_LANDSCAPE / 2 * D2R) * a, Math.tan(HFOV_LANDSCAPE_MAX / 2 * D2R));
    this._applyFov();
    this.root.classList.toggle('narrow', w < 720);
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const phone = w < 700 || coarse;
    if (phone !== this._phone) {
      this._phone = phone;
      this.root.classList.toggle('phone', phone);
      if (this._mapOpen == null) this._mapOpen = !phone;
      this._setMapOpen(phone ? this._mapOpen : true);
      if (!phone) { this._setPopover(false); this._setDim(false); }
    }
  }
  /** Horizontal-FOV zoom: _zoomS scales tan(½·hFOV) of the default view; clamped to [30°, 110°] horizontally. */
  _applyFov() {
    const cam = this.camera, a = cam.aspect || 1, base = this._baseTanH;
    const t = Math.min(Math.tan(HFOV_MAX / 2 * D2R), Math.max(Math.tan(HFOV_MIN / 2 * D2R), base * this._zoomS));
    this._zoomS = t / base;
    cam.fov = Math.min(VFOV_CAP, 2 * Math.atan(t / a) * R2D);
    cam.updateProjectionMatrix();
    this._hfov = 2 * Math.atan(Math.tan(cam.fov / 2 * D2R) * a) * R2D;
    if (this.el && this.el.zv) this.el.zv.textContent = Math.round(this._hfov) + '°';
  }
  _zoomBy(f) { if (isFinite(f) && f > 0) { this._zoomS *= f; this._applyFov(); } }
  _zoom(dy) { this._zoomBy(Math.exp(Math.max(-120, Math.min(120, dy)) * 0.0015)); }   // dy > 0 → wider view
  _onWheel(ev) {
    ev.preventDefault();
    this._poke();
    const dy = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaMode === 2 ? ev.deltaY * 400 : ev.deltaY;
    if (ev.ctrlKey) this._zoomBy(Math.exp(Math.max(-60, Math.min(60, dy)) * 0.01));   // trackpad pinch: pinch-in (dy>0) = see more
    else this._zoom(dy);
  }

  // ---- HUD visibility: popover, minimap toggle, auto-fade ----
  _setPopover(open) {
    this._popOpen = !!open;
    if (!this.el) return;
    this.el.tools.classList.toggle('open', this._popOpen);
    this.el.gear.classList.toggle('on', this._popOpen);
    this.el.gear.setAttribute('aria-expanded', String(this._popOpen));
  }
  _setMapOpen(open) {
    this._mapOpen = !!open;
    this.root.classList.toggle('mapoff', !this._mapOpen);
    this._lastMap = 0;
  }
  _poke() { this._lastAct = performance.now(); if (this._dim && !this._dragging && !this._pinch) this._setDim(false); }
  _setDim(on) { if (on === this._dim) return; this._dim = on; this.root.classList.toggle('dim', on); }
  _onAnyDown(ev) {
    this._poke();
    if (this._popOpen && !(ev.target.closest && ev.target.closest('.vw-tools,.vw-gear'))) {
      this._setPopover(false);
      if (ev.target === this.canvas) this._suppressTap = performance.now();   // closing tap doesn't also open a door
    }
  }
  _updateDim(now) {
    if (!this._phone || !this.el) return this._setDim(false);
    const blocked = this._popOpen || this.el.help.classList.contains('show') || !this.el.loading.classList.contains('hide');
    if (blocked) return this._setDim(false);
    const P = this.player, since = now - this._lastAct;
    const walking = !!this.glide || this.keys.size > 0 || this.pad.u || this.pad.d || P.vel.lengthSq() > 0.05;
    this._setDim(!!(this._dragging || this._pinch || (walking && since > 1200) || since > IDLE_FADE_MS));
  }

  _onDown(ev) {
    this.canvas.focus({ preventScroll: true });
    this._pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { this.canvas.setPointerCapture(ev.pointerId); } catch { /* */ }
    if (this._pointers.size > 1) { this._startPinch(); return; }
    if (this._pinch) return;
    const P = this.player;
    this._drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, t: performance.now(), moved: 0,
      yaw: P.yaw, tYaw: P.tYaw, pitch: P.pitch, tPitch: P.tPitch };
    this.touched360 = true;
  }
  // A second finger turns the gesture into a pinch: undo any look-drag the first finger started, forget pending taps.
  _startPinch() {
    const d = this._drag, P = this.player;
    if (d) { P.yaw = d.yaw; P.tYaw = d.tYaw; P.pitch = d.pitch; P.tPitch = d.tPitch; }
    this._drag = null; this._dragging = false; this.canvas.classList.remove('drag');
    this._taps = null;
    const [a, b] = [...this._pointers.values()];
    this._pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), s0: this._zoomS };
    this._setDim(true);
  }
  _onMove(ev) {
    const pt = this._pointers.get(ev.pointerId);
    if (pt) { pt.x = ev.clientX; pt.y = ev.clientY; }
    if (this._pinch) {
      if (pt && this._pointers.size >= 2) {
        const [a, b] = [...this._pointers.values()];
        const dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
        this._zoomS = this._pinch.s0 * this._pinch.d0 / dist;   // fingers together → wider view (see more)
        this._applyFov();
      }
      return;
    }
    const d = this._drag;
    if (!d || d.id !== ev.pointerId) { if (ev.pointerType === 'mouse' && !d) this._hover(ev); return; }
    const dx = ev.clientX - d.x, dy = ev.clientY - d.y; d.x = ev.clientX; d.y = ev.clientY;
    d.moved = Math.max(d.moved, Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy));
    if (d.moved > 4) { this._dragging = true; this.canvas.classList.add('drag'); }
    // touch: "grab the view" — a full-width swipe turns by ≈1.4× the visible horizontal FOV
    const k = ev.pointerType === 'touch'
      ? 1.4 * (this._hfov * D2R) / Math.max(320, this.canvas.clientWidth || 390)
      : 0.0041 * Math.min(1.6, this._zoomS);
    const P = this.player;
    P.tYaw += dx * k; P.tPitch = Math.max(-1.35, Math.min(1.35, P.tPitch + dy * k));
  }
  _onUp(ev) {
    this._pointers.delete(ev.pointerId);
    if (this._pinch) {
      if (this._pointers.size === 0) { this._pinch = null; this._poke(); }
      else if (this._pointers.size >= 2) { const [a, b] = [...this._pointers.values()]; this._pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), s0: this._zoomS }; }
      return;
    }
    const d = this._drag; if (!d || d.id !== ev.pointerId) return;
    this._drag = null; this._dragging = false; this.canvas.classList.remove('drag');
    if (ev.type === 'pointercancel') return;
    if (d.moved < 8 && performance.now() - d.t < 450) this._tap(ev.clientX, ev.clientY);
  }
  // single tap = use the thing under the pointer; double tap/click = glide there
  _tap(x, y) {
    const now = performance.now(), prev = this._taps;
    if (now - this._suppressTap < 600) { this._taps = null; return; }
    if (prev && now - prev.t < 360 && Math.hypot(x - prev.x, y - prev.y) < 40) {
      this._taps = null;
      this._glideTap(x, y);
      return;
    }
    this._taps = { t: now, x, y };
    if (this.riding) return;
    const a = this._pickAction(x, y);
    if (a) this._doAction(a);
  }
  // Tap → action under the finger; if the exact point misses, try a small ring around it (finger-sized targets on phones).
  _pickAction(x, y) {
    const ok = a => a && a.hit.distance < 7 ? a : null;
    let a = ok(this._actionOf(this._pickAt(x, y)));
    if (a) return a;
    const rads = this._isTouch || this._phone ? [9, 18] : [6];
    for (const r of rads) for (let i = 0; i < 8; i++) {
      const t = i / 8 * Math.PI * 2;
      a = ok(this._actionOf(this._pickAt(x + Math.cos(t) * r, y + Math.sin(t) * r)));
      if (a) return a;
    }
    return null;
  }
  _hover(ev) {
    const now = performance.now(); if (now - this._lastHover < 90) return; this._lastHover = now;
    const a = this._actionOf(this._pickAt(ev.clientX, ev.clientY));
    this.canvas.classList.toggle('act', !!(a && a.hit.distance < 7));
  }
  _onKey(ev, down) {
    if (this.disposed || !this.root.isConnected || this.root.offsetParent === null && getComputedStyle(this.root).position !== 'fixed') return;
    const tgt = ev.target;
    if (tgt && tgt.closest && tgt.closest('input,textarea,select,[contenteditable="true"]')) return;
    const code = ev.code;
    if (down && code === 'Escape' && this.el.help.classList.contains('show')) { this._showHelp(false); return; }
    const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
    if (!moveKeys.includes(code)) return;
    if (code.startsWith('Arrow')) ev.preventDefault();
    if (down) { this.keys.add(code); this.touched360 = true; this._poke(); if (this.el.help.classList.contains('show')) this._showHelp(false); }
    else this.keys.delete(code);
  }
  _onHudClick(ev) {
    if (this._phone && ev.target.closest('.vw-map')) return this._setMapOpen(false);
    const b = ev.target.closest('button'); if (!b) return;
    const k = b.dataset.k;
    if (k === 'gear') return this._setPopover(!this._popOpen);
    if (k === 'map') return this._setMapOpen(true);
    if (b.dataset.z) return this._zoomBy(+b.dataset.z > 0 ? 1 / 1.2 : 1.2);
    if (k === 'reserve') return this.opts.onReserve && this.opts.onReserve(this.unit && this.unit.id);
    if (k === 'ureserve') { const id = this._cardUnit ? this._cardUnit.id : this.unit && this.unit.id; this._hideUnitCard(); return this.opts.onReserve && this.opts.onReserve(id); }
    if (k === 'floors') { this._liftGridOpen = !this._liftGridOpen; return this._renderLiftPanel(); }
    if (k === 'exit') return this.opts.onExit && this.opts.onExit();
    if (k === 'help') { this._setPopover(false); return this._showHelp(true); }
    if (k === 'photo') return this.takePhoto();
    if (k === 'helpok') return this._showHelp(false);
    if (k === 'dlabel') return this.el.tools.classList.toggle('col');
    if (b.dataset.m) return this.setMode(b.dataset.m);
    if (b.dataset.t) return this.setTimeMode(b.dataset.t);
    if (b.dataset.s) { this.el.tools.classList.add('col'); return this.setStyle(b.dataset.s); }
    if (b.dataset.tp) return this._goto(b.dataset.tp);
    if (b.dataset.room != null) { const r = this.rooms[+b.dataset.room]; if (r) return this._goto({ room: r }); }
    if (b.dataset.f != null && b.parentElement === this.el.liftGrid) { const inf = this._carOf(this.player.pos); if (inf) this._pressKey(inf, +b.dataset.f); }
  }
}
