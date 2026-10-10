// VILNYI RIVER CITY — photoreal 360° tour (Matterport-style). Path-traced equirectangular panoramas (Blender Cycles,
// rendered offline from the same procedural scenes as the live 3D walkthrough — see pano-work/) on a light three.js viewer:
// drag / swipe to look, wheel / pinch to zoom, gold floor rings to glide between standing points (re-projected cross-fade
// with a slight zoom), room chips, style switcher, minimap from the room polygons, Reserve, and a Photo-real ↔ Live 3D toggle.
//
//   export async function openPanoTour(container, { unitId, styleId, room, pointId, yaw, i18n, lang, dir, live,
//                                                   onExit(state), onReserve(unitId), onSwitchTo3D(state) })
//     → { ok, info, setStyle(id), getState(), dispose() }
//   export const tourReady: Promise<manifest>;  export function hasTour(typeId[, styleId]) → boolean (after tourReady)
//   export function pickSpot(manifest, pose, unit) / layoutMatch(manifest, unit, rooms)   (the selection rules, testable)
//
// v4 — "photoreal = the SAME place". Opened from the live 3D (opts.live = { pose, capture }), the tour opens on the
// path-traced panorama of the place the visitor stands in that is nearest to him, looking the same way (yaw, pitch and
// field of view are taken over as they are; the scene frame of each panorama — unit-local for apartments, lift-local for
// the car — is turned into world terms, so mirrored block C3 and rotated units need nothing special):
//   · apartment: the nearest point in the SAME room on the same level, from the renders of the unit's type (the
//     visitor's design; a design without renders is shown in its nearest rendered one, and the badge says so);
//   · common areas: the nearest point of the same zone — car park −1, corridor / lift lobby of this building and floor,
//     ground lobby of this building, inside the lift car, outdoors (forecourt, courtyard, street) — within `reach`.
//   When there is no such panorama (or it fails to load) the tour does not open at all: { ok: false }, and walk.js stays
//   in live 3D with a short note. It never opens in another room, floor, building or area by itself.
//   The badge says what differs from the live view: another building finish, another design, a sample apartment.
//   getState() gives the place back to walk.js: the visitor's original spot while he has not moved between hotspots
//   (live: true), else the panorama point he is on; always the current yaw, pitch, fov.
//
// Manifest: assets/tour/tour.json (pano-work/build_tour.py: types · pano-work/build3.py: places)
//   types[typeId]  = { refUnit, width, depth, azimuth, rooms:[{kind,name,level,poly:[[u,v]…]}], styles:{ styleId:{ points:[…] } } }
//   point = { id, room, roomIndex, level, pos:[u, v, y], links:[{ to, yaw, dist }], img:{ '2k': path, '4k': path }, mask? }
//   pos is unit-local; y = floor height of the level; the camera sat at y + eye.
//   point.mask = "outside" mask of that panorama (grey PNG, white = sky / surroundings seen directly or through clear
//   glass; pano-work/mask.py). Wherever it is white the viewer draws the surroundings captured from the visitor's real unit
//   (pano-outside.js), or a neutral haze until that capture exists.
//   stale[typeId][styleId] = [point ids] rendered before a later change of the scene (never chosen automatically).
//   places[id] = { kind: parking|corridor|lobby|lift|outdoor, building, shared?, floors, renderedFloor, finish, time?, snap,
//                  frame: 'building'|'lift', points:[{ id, pos:[x, z], img, mask?, snap?, finish?, links:[ids] }] }
//   A place panorama serves every floor in `floors`: its mask (pano-work/mask3.py) marks what is floor-specific — door
//   number plates, floor numerals, lift indicators, the lift doorway — and the viewer fills that from the live 3D of the
//   visitor's own floor (same capture as above, taken at the panorama's point). The lift-car panorama is lift-local and is
//   turned into whichever lift the visitor stands in.
// Projection: image centre = +v (+z) of the scene frame, left quarter = +u; yaw = three.js camera rotation.y.
// Scene frames: apartment = unit-local (x = u, z = v, y = 0 on the unit's floor); places = world (both blocks have rotY 0).
import * as THREE from 'three';
import { unitById, unitLabel, TYPES, BUILDINGS, BASEMENT, floorY, unitYaw, localToWorld, corridorsOf, coresOf } from './data.js?v=3.8';
import { tt, RTL } from './i18n-tour.js?v=3.8';
import { createOutside, ENV_GLSL, OVERSCAN } from './pano-outside.js?v=3.8';

const MANIFEST_URL = new URL('../assets/tour/tour.json?v=3.8', import.meta.url);
const ASSET_BASE = new URL('../assets/tour/', import.meta.url);
let MAN = null;
export const tourReady = fetch(MANIFEST_URL, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
  .then(m => (MAN = m && m.types ? m : { types: {}, places: {} }));
export function hasTour(typeId, styleId) {
  const t = MAN && MAN.types[typeId]; if (!t) return false;
  const ok = s => !!(t.styles[s] && t.styles[s].points && t.styles[s].points.length);
  return styleId ? ok(styleId) : Object.keys(t.styles || {}).some(ok);
}
const D2R = Math.PI / 180;
const OUTDOOR = ['balcony', 'loggia', 'terrace'];
const ROOM_ORDER = ['hall', 'living', 'kitchen', 'bedroom', 'dressing', 'bath', 'storage', 'balcony', 'loggia', 'terrace'];
// Field of view: the live walkthrough's model (walk.js) — portrait fixes the horizontal angle at 78°, landscape the
// vertical one at 68° (horizontally capped at 100°); zoom keeps the horizontal angle within 30°…110°.
const HFOV_MIN = 30, HFOV_MAX = 110, VFOV_CAP = 150;
const vOfH = (h, a) => 2 * Math.atan(Math.tan(h * D2R / 2) / a) / D2R;
const fovRange = a => [vOfH(HFOV_MIN, a), Math.min(VFOV_CAP, vOfH(HFOV_MAX, a))];
const fovDefault = a => (a < 1 ? Math.min(VFOV_CAP, vOfH(78, a)) : 2 * Math.atan(Math.min(Math.tan(34 * D2R) * a, Math.tan(50 * D2R)) / a) / D2R);

// ------------------------------------------------------------------ which panorama is "the same place"?
const WIDTH_TOL = 0.02, POLY_TOL = 0.15;
// metres: the farthest a common-area panorama may be from where the visitor stands (manifest: point.reach / place.reach)
export const REACH = { parking: 34, corridor: 18, lobby: 9, lift: 3, outdoor: 32 };
const NEAR_STYLE = { monaco: 'milano', kyoto: 'nordic', paris: 'riviera' };
const OUTDOOR_K = ['balcony', 'loggia', 'terrace'];
const bboxOf = poly => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const [x, y] of poly) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); } return [a, b, c, d]; };
/** The visitor's apartment has the very layout the type's panoramas were rendered in: same type (not a look-alike mapped
 *  onto it), same width within 2 %, and — when the live room outlines are given — every room where the manifest has it. */
export function layoutMatch(man, unit, rooms) {
  const t = man && man.types && unit && man.types[unit.type];
  if (!t || t.mapTo || !t.width) return false;
  const k = unit.width / t.width;
  if (Math.abs(k - 1) > WIDTH_TOL) return false;
  if (!Array.isArray(rooms) || !rooms.length) return true;
  const R = t.rooms || [];
  if (R.length !== rooms.length) return false;
  for (const a of R) {
    const A = bboxOf(a.poly);
    const hit = rooms.some(b => b.kind === a.kind && (b.level || 0) === (a.level || 0) && b.poly && bboxOf(b.poly).every((v, i) => Math.abs(v - A[i] * (i < 2 ? k : 1)) <= POLY_TOL));
    if (!hit) return false;
  }
  return true;
}
/** The rendered design shown for a visitor's design: his own, else the nearest rendered one, else any. */
export function styleFor(t, style) {
  const ok = s => !!(s && t && t.styles && t.styles[s] && (t.styles[s].points || []).length);
  return ok(style) ? style : ok(NEAR_STYLE[style]) ? NEAR_STYLE[style] : Object.keys((t && t.styles) || {}).find(ok) || null;
}
/** The place (manifest "places" entry) that covers a common-area pose, or null. */
export function placeFor(man, pose) {
  for (const [id, pl] of Object.entries((man && man.places) || {})) {
    if (pl.kind !== pose.kind || !(pl.points || []).length) continue;
    if (pl.frame === 'lift') { if (!pose.lift) continue; }
    else if (!pl.shared && pl.building !== pose.building) continue;
    if (Array.isArray(pl.floors) && !pl.floors.includes(pose.floor)) continue;
    return [id, pl];
  }
  return null;
}
/** Points of a place in world coordinates for a visitor on `floor` (and in `lift`, for the lift car). A point rendered in
 *  another building finish stays (finNote = the finish it shows); fill = its mask must be filled from this floor's live 3D. */
export function placePoints(id, pl, { floor, lift, finish, time }) {
  const y = floorY(floor), out = [];
  for (const p of pl.points || []) {
    const fin = p.finish !== undefined ? p.finish : pl.finish;
    let x, z, rot = 0;
    if (pl.frame === 'lift') {
      if (!lift || !BUILDINGS[lift.building]) continue;
      const [nx, nz] = lift.n, [wx, wz] = localToWorld(lift.building, lift.door[0] + p.pos[0] * nz + p.pos[1] * nx, lift.door[1] - p.pos[0] * nx + p.pos[1] * nz);
      x = wx; z = wz; rot = Math.atan2(nx, nz);
    } else if (pl.frame === 'world') [x, z] = p.pos;
    else [x, z] = localToWorld(pl.building, p.pos[0], p.pos[1]);
    out.push({ ...p, pos: [x, z, y], rot, level: 0, room: pl.kind, place: id, reach: p.reach ?? pl.reach ?? REACH[pl.kind] ?? 10,
      finNote: fin && finish && fin !== finish ? fin : null, dayNote: !!(pl.time && time && pl.time !== time),
      fill: !!p.mask && !(pl.kind === 'corridor' && floor === pl.renderedFloor && !(fin && finish && fin !== finish)) });
  }
  return out;
}
/** pose (walk.js _photoPose) → the panorama of this very place nearest to the visitor:
 *  { key: 'apt' | 'here', id, dist, style?, place? } or null (walk.js then stays in live 3D). */
export function pickSpot(man, pose, unit) {
  if (!man || !pose) return null;
  if (pose.kind === 'apt') {
    const t = unit && man.types && man.types[unit.type];
    if (!t || !pose.unit || !pose.room) return null;
    const style = styleFor(t, pose.style); if (!style) return null;
    const k = t.width ? unit.width / t.width : 1, out = OUTDOOR_K.includes(pose.room.kind);
    let best = null, bd = Infinity;
    for (const p of t.styles[style].points || []) {
      if ((p.level || 0) !== (pose.unit.level || 0)) continue;
      // the same room: walkable, no wall between (any outdoor space of the level is "the balcony")
      if (out ? !OUTDOOR_K.includes(p.room) : (p.room !== pose.room.kind || (p.roomIndex || 0) !== (pose.room.index || 0))) continue;
      const d = Math.hypot(p.pos[0] * k - pose.unit.u, p.pos[1] - pose.unit.v);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { key: 'apt', id: best.id, dist: bd, style } : null;
  }
  const pf = placeFor(man, pose); if (!pf) return null;
  let best = null, bd = Infinity;
  for (const p of placePoints(pf[0], pf[1], pose)) {
    const d = Math.hypot(p.pos[0] - pose.world[0], p.pos[1] - pose.world[2]);
    if (d <= p.reach && d < bd) { bd = d; best = p; }
  }
  return best ? { key: 'here', id: best.id, dist: bd, place: pf[0] } : null;
}
/** Is there a photoreal view for this pose? (walk.js dims the toggle where there is none.) Needs tourReady. */
export function hasSpot(pose, unitId) { return !!(MAN && pickSpot(MAN, pose, unitId ? unitById(unitId) : null)); }

const CSS = `
.pt{position:absolute;inset:0;overflow:hidden;background:#050505;color:#f3ead7;font-family:"Manrope","Inter Tight","Heebo","Assistant",system-ui,sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;--g:#c9a45c;--g2:#e6c987;--bg:rgba(8,8,8,.62);--ln:rgba(201,164,92,.42);
  --st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px)}
.pt *{box-sizing:border-box}
.pt button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;touch-action:manipulation}
.pt canvas.pt-gl{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;outline:none}
.pt canvas.pt-gl.drag{cursor:grabbing}.pt canvas.pt-gl.hot{cursor:pointer}
.pt-p{background:var(--bg);-webkit-backdrop-filter:blur(12px) saturate(1.15);backdrop-filter:blur(12px) saturate(1.15);border:1px solid var(--ln);border-radius:12px}
.pt-title{position:absolute;top:calc(10px + var(--st));inset-inline-start:10px;padding:6px 12px 7px;max-width:min(46vw,440px);pointer-events:none}
.pt-title .t1{font-family:"Cormorant Garamond","Bodoni Moda",Georgia,serif;font-size:18px;line-height:1.15;letter-spacing:.04em;color:var(--g2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-title .t2{font-size:11.5px;line-height:1.3;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;unicode-bidi:plaintext}
.pt-badge{display:inline-block;margin-top:4px;padding:2px 8px;border-radius:10px;font-size:10.5px;line-height:1.25;background:rgba(201,164,92,.16);border:1px solid var(--ln);color:var(--g2);white-space:normal;max-width:100%}
.pt-exit{position:absolute;top:calc(10px + var(--st));inset-inline-end:10px;height:36px;padding:0 14px 0 11px;display:flex;align-items:center;gap:7px;font-size:12.5px;letter-spacing:.03em}
.pt-exit svg{width:14px;height:14px}
.pt-exit:hover{border-color:var(--g)}
.pt-side{position:absolute;inset-inline-end:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px}
.pt-side button{width:38px;height:38px;display:grid;place-items:center;font-size:18px;line-height:1}
.pt-side button.on{background:linear-gradient(135deg,#e6c987,#b88a3c);color:#111;border-color:transparent}
.pt-side svg{width:18px;height:18px}
.pt-bottom{position:absolute;left:0;right:0;bottom:calc(10px + var(--sb));display:flex;flex-direction:column;align-items:center;gap:7px;pointer-events:none;padding:0 10px}
.pt-bottom>*{pointer-events:auto;max-width:100%}
.pt-styles{display:flex;align-items:center;gap:2px;padding:3px;border-radius:999px}
.pt-styles .lbl{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--g);padding:0 8px 0 9px;white-space:nowrap}
.pt-styles button{height:28px;padding:0 12px;border-radius:999px;font-size:12px;white-space:nowrap}
.pt-styles button.on{background:linear-gradient(135deg,#e6c987,#b88a3c);color:#111;font-weight:700}
.pt-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px;max-width:min(100%,860px);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%);padding-inline:12px}
.pt-chips::-webkit-scrollbar{display:none}
.pt-chip{flex:0 0 auto;height:32px;padding:0 13px;border-radius:999px;font-size:12.5px;white-space:nowrap;background:var(--bg);border:1px solid var(--ln);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.pt-chip.on{background:linear-gradient(135deg,#e6c987,#b88a3c);color:#111;font-weight:700;border-color:transparent}
.pt-chip.sep{border-style:dashed;opacity:.9}
.pt-chip:hover:not(.on){border-color:var(--g)}
.pt-map{position:absolute;inset-inline-start:10px;bottom:calc(92px + var(--sb));padding:6px;border-radius:12px;transition:opacity .3s}
.pt-map canvas{display:block;width:150px;height:150px;cursor:pointer}
.pt-map .cap{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--g);text-align:center;margin-top:3px}
.pt-hint{position:absolute;left:50%;bottom:calc(100px + var(--sb));transform:translateX(-50%);padding:8px 14px;border-radius:999px;font-size:12px;white-space:nowrap;opacity:0;transition:opacity .6s;pointer-events:none;max-width:calc(100% - 20px);overflow:hidden;text-overflow:ellipsis}
.pt-hint.show{opacity:1}
.pt-legal{position:absolute;inset-inline-end:10px;bottom:calc(4px + var(--sb));font-size:9.5px;opacity:.55;pointer-events:none}
.pt-mode{position:absolute;top:calc(10px + var(--st));left:50%;transform:translateX(-50%);display:flex;gap:2px;padding:3px;border-radius:999px;z-index:2}
.pt-mode button{height:30px;padding:0 14px;border-radius:999px;font-size:12.5px;letter-spacing:.02em;white-space:nowrap;display:flex;align-items:center;gap:6px}
.pt-mode button svg{width:15px;height:15px;flex:none;display:block}
.pt button.pt-p{background:var(--bg)}
.pt-mode button.on{background:linear-gradient(135deg,#e6c987,#b88a3c);color:#111;font-weight:700;cursor:default}
.pt-mode button:not(.on):hover{color:var(--g2)}
.pt-row{display:flex;align-items:center;justify-content:center;gap:8px;max-width:100%}
.pt .pt-res{height:34px;padding:0 18px;border-radius:999px;background:linear-gradient(135deg,#e6c987,#b88a3c);color:#111!important;font-weight:700;font-size:12.5px;letter-spacing:.04em;white-space:nowrap;box-shadow:0 6px 22px rgba(0,0,0,.4)}
.pt .pt-res:hover{filter:brightness(1.08)}
.pt .pt-res[disabled]{opacity:.45;cursor:default}
.pt.phone .pt-mode{top:calc(56px + var(--st))}
.pt.phone .pt-mode button{height:28px;padding:0 12px;font-size:12px}
.pt.phone .pt-map{top:calc(100px + var(--st))}
.pt.phone .pt-res{height:32px;padding:0 14px}
.pt-load{position:absolute;inset:0;display:grid;place-items:center;background:#050505;transition:opacity .5s;z-index:5}
.pt-load.off{opacity:0;pointer-events:none}
.pt-load .in{display:flex;flex-direction:column;align-items:center;gap:14px;font-size:13px;color:var(--g2);text-align:center;padding:0 24px}
.pt-spin{width:34px;height:34px;border-radius:50%;border:2px solid rgba(201,164,92,.25);border-top-color:var(--g2);animation:ptspin 1s linear infinite}
@keyframes ptspin{to{transform:rotate(360deg)}}
.pt-busy{position:absolute;top:50%;left:50%;width:26px;height:26px;margin:-13px;border-radius:50%;border:2px solid rgba(201,164,92,.2);border-top-color:var(--g2);animation:ptspin 1s linear infinite;opacity:0;transition:opacity .2s;pointer-events:none}
.pt-busy.on{opacity:1}
.pt.phone .pt-title{max-width:calc(100% - 120px)}
.pt.phone .pt-map{bottom:auto;top:calc(100px + var(--st))}
.pt.phone .pt-map canvas{width:104px;height:104px}
.pt.phone .pt-side{top:auto;bottom:calc(104px + var(--sb));transform:none}
.pt.phone .pt-side .zm{display:none}
.pt.phone .pt-hint{bottom:calc(98px + var(--sb));font-size:11.5px;white-space:normal;text-align:center;border-radius:14px;width:max-content}
.pt.phone .pt-styles .lbl{display:none}
.pt.phone .pt-legal{inset-inline-end:auto;inset-inline-start:10px}
.pt.embedded .pt-title{max-width:min(40vw,440px)}
.pt.phone.embedded .pt-title{max-width:calc(50% - 70px)}
.pt.phone.embedded .pt-map{top:calc(98px + var(--st))}
`;

const ICON = {
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>',
  gyro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 9c-1 2-1 4 0 6M21 9c1 2 1 4 0 6"/></svg>',
};

// ------------------------------------------------------------------ shader: two layers projected on proxy spheres
// While walking from A to B the camera moves between the capture points; each layer is re-projected through a sphere
// around its own capture point (radius ≈ room scale), which gives the forward-motion parallax of a real walk-through.
// A layer is a pre-rendered panorama (t, with an optional mask m whose white parts come from the atlas e) or, with l = 1,
// a live capture of an exact viewpoint (atlas e alone). y = (cos, sin) of the panorama's own turn (lift-local renders).
const VERT = `
out vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = `
precision highp float;
in vec3 vW;
uniform sampler2D tA; uniform sampler2D tB;
uniform sampler2D mA; uniform sampler2D mB; uniform sampler2D eA; uniform sampler2D eB;
uniform float wA; uniform float wB; uniform float gA; uniform float gB;
uniform float lA; uniform float lB; uniform float nA; uniform float nB; uniform vec2 yA; uniform vec2 yB;
uniform vec3 cA; uniform vec3 cB; uniform float rA; uniform float rB; uniform float k; uniform float fade;
out vec4 oc;
const float PI = 3.141592653589793;
vec3 proj(vec3 o, vec3 d, vec3 c, float R){
  vec3 q = o - c; float b = dot(q, d); float h = b*b - (dot(q,q) - R*R);
  float t = -b + sqrt(max(h, 0.0)); return normalize(q + t*d);
}
vec4 equi(sampler2D t, vec3 d){
  float u = 0.5 + atan(-d.x, d.z) / (2.0*PI);
  float v = 0.5 + asin(clamp(d.y, -1.0, 1.0)) / PI;
  // seam-free mip selection: take the u derivative from whichever of u / u+0.5 is continuous here
  float u2 = fract(u + 0.5);
  vec2 dx = vec2(dFdx(u), dFdx(v)), dy = vec2(dFdy(u), dFdy(v));
  vec2 dx2 = vec2(dFdx(u2), dFdx(v)), dy2 = vec2(dFdy(u2), dFdy(v));
  if (abs(dx2.x) + abs(dy2.x) < abs(dx.x) + abs(dy.x)) { dx = dx2; dy = dy2; }
  return textureGrad(t, vec2(u, v), dx, dy);
}
${ENV_GLSL}
// The JPEGs are display-referred (tone-mapped offline). The sampler hands back linear values, so they are encoded to sRGB
// again before they reach the canvas — until v2.8 they were written linear, which showed every panorama too dark.
vec3 toDisp(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 layer(sampler2D t, sampler2D m, sampler2D e, float w, float g, float live, float near, vec2 rot, vec3 dir, vec3 far){
  vec3 dl = vec3(dir.x * rot.x - dir.z * rot.y, dir.y, dir.x * rot.y + dir.z * rot.x);
  vec3 c = toDisp(equi(t, dl).rgb);
  float mk = equi(m, dl).r * w;
  // near = 1: floor-specific details of a common area (number plates, indicators, the lift doorway) from the live 3D of
  // this floor, taken at the panorama's own point; near = 0: the far surroundings of the visitor's unit, looked up along
  // the true view ray (a soft haze stands in until they are captured)
  vec3 haze = mix(vec3(0.78, 0.82, 0.86), vec3(0.88, 0.91, 0.95), smoothstep(-0.25, 0.35, far.y));
  vec3 o = mix(mix(haze, c, near), envAt(e, mix(far, dir, near)), g);
  c = mix(c, o, mk);
  return mix(c, envAt(e, dir), live);
}
void main(){
  vec3 d = normalize(vW - cameraPosition);
  vec3 col = layer(tA, mA, eA, wA, gA, lA, nA, yA, proj(cameraPosition, d, cA, rA), d);
  if (k > 0.0) col = mix(col, layer(tB, mB, eB, wB, gB, lB, nB, yB, proj(cameraPosition, d, cB, rB), d), k);
  oc = vec4(col * fade, 1.0);
}`;

function strFor(opts) {
  const i18n = opts.i18n;
  const langV = opts.lang || (i18n && (typeof i18n.lang === 'function' ? i18n.lang() : i18n.lang)) || document.documentElement.lang || 'en';
  const lang = String(langV).slice(0, 2);
  const dirV = opts.dir || (i18n && (typeof i18n.dir === 'function' ? i18n.dir() : i18n.dir)) || (RTL.has(lang) ? 'rtl' : 'ltr');
  const T = (key) => {
    // site i18n first for the shared vocabulary (walk.* / rooms), then our own table
    const siteKey = { lobby: 'walk.lobby', corridor: 'walk.corridor', parking: 'walk.parking', balcony: 'walk.balcony', reserve: 'walk.reserve' }[key.replace(/^r\./, '')];
    if (siteKey && i18n && typeof i18n.t === 'function') {
      try { const s = i18n.t(siteKey); if (typeof s === 'string' && s && s !== siteKey) return s; } catch { /* optional */ }
    }
    return tt(lang, key);
  };
  return { lang, dir: dirV === 'rtl' ? 'rtl' : 'ltr', T };
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapPi = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const baseId = id => id.replace(/-\d+$/, '');
const LIVE_ID = '@live';

export async function openPanoTour(container, opts = {}) {
  const man = await tourReady;
  const { lang, dir, T } = strFor(opts);
  const unit = opts.unitId ? unitById(opts.unitId) : null;
  const EYE = man.eye || 1.6;
  // opened from the live 3D: where the visitor stands (pose) and a way to capture any viewpoint of the live scene
  const live = opts.live && opts.live.pose && typeof opts.live.capture === 'function' ? opts.live : null;
  const pose = live ? live.pose : null;
  // normalise points: links → id list, img → lo (2k) / img (4k when there is one)
  const norm = (P) => (P || []).map(p => ({ ...p, mask: p.mask || null, links: (p.links || []).map(l => (typeof l === 'string' ? l : l.to)),
    lo: typeof p.img === 'string' ? p.img : p.img && (p.img['2k'] || p.img.lo), img: typeof p.img === 'string' ? p.img : p.img && (p.img['4k'] || p.img['2k']) }));

  // ---------------------------------------------------------------- scenes: the apartment (unit-local) + places (world)
  const sceneDefs = {};   // key → { kind:'apt'|'place', def }
  const typeId = (unit && unit.type) || opts.typeId;
  const liveRooms = pose && pose.kind === 'apt' ? pose.rooms : null;
  const matched = !!(unit && layoutMatch(man, unit, liveRooms));     // this unit IS what the type's panoramas show
  if (typeId && man.types[typeId]) {
    const t = man.types[typeId], styles = {};
    for (const [k, v] of Object.entries(t.styles || {})) styles[k] = { points: norm(v.points) };
    sceneDefs.apt = { kind: 'apt', def: { ...t, styles }, typeId, sample: !!(unit && t.refUnit && unit.id !== t.refUnit && !matched) };
  } else if (pose && pose.kind === 'apt' && unit) {
    sceneDefs.apt = { kind: 'apt', def: { width: unit.width, depth: unit.depth, rooms: liveRooms || [], styles: {} }, typeId, sample: false };
  }
  if (pose && pose.kind !== 'apt') {
    // the one place the visitor is in — its photoreal points on this floor / in this lift / with this finish (maybe none)
    const pf = placeFor(man, pose);
    sceneDefs.here = { kind: 'place', def: { kind: pose.kind, building: pose.building, floor: pose.floor, place: pf ? pf[0] : null,
      styles: { default: { points: pf ? norm(placePoints(pf[0], pf[1], pose)) : [] } } } };
  } else if (!pose && unit) {
    // opened on its own: the shared areas of the unit's building that need nothing from a live scene
    for (const [id, pl] of Object.entries(man.places || {})) {
      if (pl.frame === 'lift' || pl.time || !['lobby', 'parking', 'corridor'].includes(pl.kind) || sceneDefs[pl.kind]) continue;
      if (!pl.shared && pl.building !== unit.building) continue;
      const floor = pl.kind === 'corridor' ? unit.floor : pl.renderedFloor;
      if (pl.kind === 'corridor' && unit.floor !== pl.renderedFloor) continue;   // other floors need their own number plates (live)
      const P = norm(placePoints(id, pl, { floor, finish: pl.finish || 'classic' }));
      if (P.length) sceneDefs[pl.kind] = { kind: 'place', def: { kind: pl.kind, building: pl.shared ? unit.building : pl.building, floor, place: id, styles: { default: { points: P } } } };
    }
  }
  const stylesOf = (key) => { const d = sceneDefs[key]; return d ? Object.keys(d.def.styles || {}).filter(s => (d.def.styles[s].points || []).length) : []; };
  const isPlace = key => !!(sceneDefs[key] && sceneDefs[key].kind === 'place');

  // ---------------------------------------------------------------- DOM
  if (!document.getElementById('pt-css')) { const st = document.createElement('style'); st.id = 'pt-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div');
  root.className = 'pt'; root.dir = dir; root.lang = lang;
  if (container.classList && container.classList.contains('vw-pano')) root.classList.add('embedded');
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(root);
  const isPhone = () => root.clientWidth < 640 || root.clientHeight < 500;
  root.classList.toggle('phone', isPhone());

  const roomOpt = opts.room || opts.startRoom;
  let startRoom = roomOpt && typeof roomOpt === 'object' ? roomOpt.kind : roomOpt;
  if (startRoom === 'apartment') startRoom = 'living';
  const startKey = pose ? (pose.kind === 'apt' ? 'apt' : 'here')
    : (sceneDefs[startRoom] && isPlace(startRoom) ? startRoom : (sceneDefs.apt && stylesOf('apt').length ? 'apt' : null));
  if (!startKey || !sceneDefs[startKey]) {
    root.innerHTML = `<div class="pt-load"><div class="in"><div>${esc(T('soonHint'))}</div><div class="pt-row">
      ${opts.onSwitchTo3D ? `<button class="pt-res" type="button" data-a="3d">${esc(T('live3d'))}</button>` : ''}
      <button class="pt-p pt-exit" type="button" data-a="x" style="position:static">${ICON.x}<span>${esc(T('exit'))}</span></button></div></div></div>`;
    root.onclick = e => {
      const a = e.target.closest('button[data-a]')?.dataset.a; if (!a) return;
      dispose();
      if (a === '3d') opts.onSwitchTo3D({ unitId: opts.unitId, styleId: opts.styleId, room: { kind: startRoom || 'living', index: 0 } });
      else opts.onExit && opts.onExit(null);
    };
    function dispose() { root.remove(); }
    return { ok: false, dispose, close: dispose };
  }

  root.innerHTML = `
    <canvas class="pt-gl" tabindex="0" aria-label="${esc(T('title'))}"></canvas>
    <div class="pt-p pt-title"><div class="t1">${esc(T('title'))}</div><div class="t2"></div><div class="pt-badge" hidden>${esc(T('sample'))}</div></div>
    <button class="pt-p pt-exit" type="button">${ICON.x}<span>${esc(T('exit'))}</span></button>
    <div class="pt-p pt-mode" role="group" aria-label="${esc(T('toggle'))}">
      <button type="button" class="on" aria-pressed="true">${ICON.cam}<span>${esc(T('photo'))}</span></button>
      <button type="button" data-m="3d" aria-pressed="false" ${opts.onSwitchTo3D ? '' : 'hidden'}>${ICON.cube}<span>${esc(T('live3d'))}</span></button>
    </div>
    <div class="pt-side">
      <button class="pt-p zm" type="button" data-z="-1" aria-label="${esc(T('zoomIn'))}">+</button>
      <button class="pt-p zm" type="button" data-z="1" aria-label="${esc(T('zoomOut'))}">−</button>
      <button class="pt-p gy" type="button" hidden aria-label="${esc(T('gyro'))}" title="${esc(T('gyro'))}">${ICON.gyro}</button>
    </div>
    <div class="pt-p pt-map"><canvas width="300" height="300"></canvas><div class="cap">${esc(T('plan'))}</div></div>
    <div class="pt-p pt-hint">${esc(T('hint'))}</div>
    <div class="pt-bottom"><div class="pt-row"><div class="pt-p pt-styles"></div>${opts.onReserve && unit ? `<button type="button" class="pt-res">${esc(T('reserve'))}</button>` : ''}</div><div class="pt-chips"></div></div>
    <div class="pt-legal">${esc(T('illus'))}</div>
    <div class="pt-busy"></div>
    <div class="pt-load"><div class="in"><div class="pt-spin"></div><div>${esc(T('loading'))}</div></div></div>`;
  const $ = s => root.querySelector(s);
  const el = { canvas: $('canvas.pt-gl'), t1: $('.pt-title .t1'), t2: $('.pt-title .t2'), badge: $('.pt-badge'), exit: $('.pt-exit'), styles: $('.pt-styles'), chips: $('.pt-chips'),
    map: $('.pt-map'), mode: $('.pt-mode'), res: $('.pt-res'), mapC: $('.pt-map canvas'), hint: $('.pt-hint'), load: $('.pt-load'), busy: $('.pt-busy'), gy: $('.pt-side .gy') };

  // ---------------------------------------------------------------- three
  const renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const maxTex = renderer.capabilities.maxTextureSize || 4096;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';
  const blank = new THREE.DataTexture(new Uint8Array([5, 5, 5, 255]), 1, 1); blank.needsUpdate = true;
  const U = { tA: { value: blank }, tB: { value: blank }, cA: { value: new THREE.Vector3() }, cB: { value: new THREE.Vector3() },
    rA: { value: 4 }, rB: { value: 4 }, k: { value: 0 }, fade: { value: 1 },
    mA: { value: blank }, mB: { value: blank }, eA: { value: blank }, eB: { value: blank }, wA: { value: 0 }, wB: { value: 0 }, gA: { value: 0 }, gB: { value: 0 },
    lA: { value: 0 }, lB: { value: 0 }, nA: { value: 0 }, nB: { value: 0 }, yA: { value: new THREE.Vector2(1, 0) }, yB: { value: new THREE.Vector2(1, 0) } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, fragmentShader: FRAG, glslVersion: THREE.GLSL3, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

  // hotspot rings (floor circles at the neighbouring capture points)
  const ringGeo = new THREE.RingGeometry(0.2, 0.26, 56).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(0.2, 40).rotateX(-Math.PI / 2);
  const hitGeo = new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
  const hotGroup = new THREE.Group(); scene.add(hotGroup);
  const mkMat = (o, c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false });

  // ---------------------------------------------------------------- state
  const S = {
    key: startKey, style: null, point: null, yaw: 0, pitch: -0.05, fov: 78, vy: 0, vp: 0, livePoint: null,
    trans: null, dirty: true, disposed: false, touched: false, gyro: null, lastT: performance.now(),
  };
  const aspect = () => (root.clientWidth || 1) / (root.clientHeight || 1);
  const clampFov = v => { const [a, b] = fovRange(aspect()); return clamp(v, a, b); };
  const pts = () => { const d = sceneDefs[S.key]; const st = d && d.def.styles[S.style]; return (st && st.points) || []; };
  const byId = (id) => (id === LIVE_ID ? (S.livePoint && S.livePoint.key === S.key ? S.livePoint : undefined) : pts().find(p => p.id === id));
  const eyeOf = (p) => new THREE.Vector3(p.pos[0], p.eyeY !== undefined ? p.eyeY : (p.pos[2] || 0) + EYE, p.pos[1]);
  const uScale = () => { const d = sceneDefs.apt && sceneDefs.apt.def; return unit && d && d.width ? unit.width / d.width : 1; };
  const staleIds = st => new Set((unit && ((man.stale || {})[typeId] || {})[st]) || []);
  const frameYaw = key => (key === 'apt' && unit ? unitYaw(unit) + BUILDINGS[unit.building].rotY : 0);   // scene frame → world

  // ---------------------------------------------------------------- textures (LRU; low-res first, full-res after)
  const loader = new THREE.TextureLoader();
  const cache = new Map();   // url → { p: Promise<Texture>, t: Texture|null, used }
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function tex(url) {
    let e = cache.get(url);
    if (!e) {
      e = { t: null, used: performance.now() };
      e.p = new Promise((res, rej) => loader.load(new URL(url, ASSET_BASE).href, t => {
        t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        t.wrapS = THREE.RepeatWrapping; t.anisotropy = aniso; e.t = t; res(t);
      }, undefined, rej));
      cache.set(url, e);
      trim();
    }
    e.used = performance.now();
    return e.p;
  }
  function trim() {
    const hi = [...cache.entries()].filter(([u]) => !/-lo\.jpg$/.test(u)).sort((a, b) => b[1].used - a[1].used);
    const keep = new Set([U.tA.value, U.tB.value]);
    for (const [u, e] of hi.slice(isPhone() ? 3 : 5)) if (e.t && !keep.has(e.t)) { e.t.dispose(); cache.delete(u); }
  }
  const hiOK = (p) => p.img && p.img !== p.lo && maxTex >= 4096 && !isPhone() && !(navigator.connection && navigator.connection.saveData);
  async function bestNow(p) {   // lo immediately (or hi if cached), hi later
    const hiE = p.img && cache.get(p.img);
    if (hiE && hiE.t && hiOK(p)) return hiE.t;
    return tex(p.lo || p.img);
  }
  function upgrade(p) {
    if (p.live || !hiOK(p) || !p.lo) return;
    tex(p.img).then(t => {
      if (S.disposed || S.point !== p) return;
      if (S.trans) { S.pendingHi = t; return; }
      U.tA.value = t; S.dirty = true;
    }).catch(() => {});
  }
  function preloadNeighbours(p) {
    if (p.live) return;                                      // rings of a live viewpoint load on demand (lazy downloads)
    const phone = isPhone();
    for (const id of p.links || []) { const q = byId(id); if (!q || q.live) continue; tex(q.lo || q.img).catch(() => {}); if (!phone && hiOK(q)) tex(q.img).catch(() => {}); }
  }

  // ---------------------------------------------------------------- live captures (walk.js capturePano → a cube atlas)
  // One capture per viewpoint, kept while it may be shown again (the last three). eye = world position of the camera.
  const caps = new Map();   // id → { tex, used }
  function capTex(id, eye, yawOfFrame) {
    let e = caps.get(id);
    if (!e) {
      const r = live.capture({ eye, frameYaw: yawOfFrame, overscan: OVERSCAN });
      if (!r || !r.data) throw new Error('live capture unavailable');
      const t = new THREE.DataTexture(r.data, r.w, r.h, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.colorSpace = THREE.NoColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
      e = { tex: t, used: 0 }; caps.set(id, e);
      const liveNow = new Set([U.eA.value, U.eB.value]);
      for (const [k, x] of [...caps.entries()].sort((a, b) => b[1].used - a[1].used).slice(3)) if (!liveNow.has(x.tex) && x !== e) { x.tex.dispose(); caps.delete(k); }
    }
    e.used = performance.now();
    return e.tex;
  }

  // ---------------------------------------------------------------- the visitor's own surroundings (see header)
  const masks = new Map();   // url → { p: Promise<Texture|null>, t }
  function maskTex(url) {
    let e = masks.get(url);
    if (!e) {
      e = { t: null, used: 0 };
      e.p = new Promise(res => loader.load(new URL(url, ASSET_BASE).href, t => {
        t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        t.wrapS = THREE.RepeatWrapping; t.anisotropy = aniso; e.t = t; res(t);
      }, undefined, () => { console.warn('[pano] mask missing', url); res(null); }));
      masks.set(url, e);
    }
    e.used = performance.now();
    const liveNow = new Set([U.mA.value, U.mB.value]);
    for (const [u, x] of [...masks.entries()].sort((a, b) => b[1].used - a[1].used).slice(6)) if (x.t && !liveNow.has(x.t)) { x.t.dispose(); masks.delete(u); }
    return e.p;
  }
  const O = { api: null, p: null, failed: false, slot: 0, refNote: false };
  const wantsOutside = (p, key = S.key) => !!(unit && key === 'apt' && p && !p.live && p.mask);
  function ensureOutside() {
    if (O.p || S.disposed) return O.p;
    O.p = createOutside(renderer, { face: maxTex >= 4096 && !isPhone() ? 1024 : 768 }).then(api => {
      if (S.disposed) { api.dispose(); return null; }
      O.api = api;
      if (!S.trans) outsideForA();
      return api;
    }).catch(e => { O.failed = true; console.warn('[pano] surroundings unavailable — outside areas stay neutral', e); return null; });
    return O.p;
  }
  function captureInto(p, slot) {
    if (!O.api) return null;
    try { return O.api.capture(unit, p.pos[0] * uScale(), p.pos[1], (p.pos[2] || 0) + EYE, slot); }
    catch (e) { console.warn('[pano] outside capture failed', e); return null; }
  }
  // Everything a layer needs to show point p: { t, m, w, e, g, l, n, rot, env, miss }
  async function prep(p, key, slot) {
    const L = { t: blank, m: blank, w: 0, e: blank, g: 0, l: 0, n: 0, rot: p.rot || 0, env: false, miss: false };
    if (p.live) { L.e = capTex(LIVE_ID, p.world, frameYaw(key)); L.g = 1; L.l = 1; L.env = true; return L; }
    L.t = await bestNow(p);
    if (wantsOutside(p, key)) {
      const m = await maskTex(p.mask);
      if (!m) { L.miss = true; return L; }
      L.m = m; L.w = 1;
      if (!O.api && !O.failed) { ensureOutside(); return L; }
      const e = captureInto(p, slot);
      if (e) { L.e = e; L.g = 1; L.env = true; }
      return L;
    }
    if (live && isPlace(key) && p.mask && p.fill !== false) {       // this floor's number plates / indicators / lift doorway
      const m = await maskTex(p.mask);
      const strict = sceneDefs[key].def.kind === 'corridor';   // (a corridor rendered on another floor must not show that floor's numbers)
      if (!m && strict) throw new Error('floor mask missing');
      if (m) {
        try { L.e = capTex(key + ':' + p.id, [p.pos[0], (p.pos[2] || 0) + EYE, p.pos[1]], 0); L.m = m; L.w = 1; L.g = 1; L.n = 1; L.env = true; }
        catch (e) { if (strict) throw e; console.warn('[pano] live details unavailable', e); }
      }
    }
    return L;
  }
  function setLayer(s, L) {   // s: 'A' | 'B'
    U['t' + s].value = L.t; U['m' + s].value = L.m; U['w' + s].value = L.w; U['e' + s].value = L.e; U['g' + s].value = L.g;
    U['l' + s].value = L.l; U['n' + s].value = L.n; U['y' + s].value.set(Math.cos(L.rot), Math.sin(L.rot));
    if (s === 'A') S.envA = L.env; else S.envB = L.env;
  }
  function outsideForA() {   // the surroundings became available (or a transition ended) while A still shows the haze
    if (S.disposed || !O.api || !S.point || U.wA.value <= 0 || S.envA || !wantsOutside(S.point)) return;
    const e = captureInto(S.point, O.slot);
    if (e) { U.eA.value = e; S.envA = true; S.dirty = true; }
  }
  function noteRef(miss) {   // a panorama shown with its own (reference-unit) outside view must say so
    const d = sceneDefs.apt && sceneDefs.apt.def;
    O.refNote = !!(miss && unit && d && d.refUnit && d.refUnit !== unit.id);
  }

  // ---------------------------------------------------------------- hotspots
  function buildHotspots() {
    hotGroup.clear();
    const p = S.point; if (!p) return;
    for (const id of p.links || []) {
      const q = byId(id); if (!q || q.live || (q.level || 0) !== (p.level || 0)) continue;
      const g = new THREE.Group();
      g.position.set(q.pos[0], (q.pos[2] || 0) + 0.02, q.pos[1]);
      const ring = new THREE.Mesh(ringGeo, mkMat(0.95, 0xe6c987)), disc = new THREE.Mesh(discGeo, mkMat(0.22, 0xffffff));
      const hit = new THREE.Mesh(hitGeo, mkMat(0, 0xffffff)); hit.userData.target = q.id;
      ring.renderOrder = disc.renderOrder = 2; g.add(disc, ring, hit); g.userData = { ring, disc, id: q.id };
      hotGroup.add(g);
    }
    S.dirty = true;
  }

  // ---------------------------------------------------------------- HUD
  const floorName = f => (f === -1 ? T('r.parking') + ' −1' : f === 0 ? T('ground') : T('floorN').replace('{n}', f === 11 ? '10D' : f));
  const zoneLabel = p => (p.zone && T('z.' + p.zone) !== 'z.' + p.zone ? T('z.' + p.zone) : T('r.' + sceneDefs[S.key].def.kind));
  function roomLabel(p) {
    if (isPlace(S.key)) return zoneLabel(p);
    // the outdoor space is named as the visitor's own unit has it (a loggia type shown through the balcony-type renders)
    const own = unit && TYPES[unit.type] && !TYPES[unit.type].duplex && OUTDOOR.includes(p.room) ? TYPES[unit.type].outdoorKind : null;
    const name = T('r.' + (own && OUTDOOR.includes(own) ? own : p.room));
    if (p.live) return name + ((p.level || 0) > 0 ? ' · ' + T('upper') : '');
    const same = [...new Set(pts().filter(q => q.room === p.room).map(q => baseId(q.id)))];
    const n = same.length > 1 ? ' ' + (same.indexOf(baseId(p.id)) + 1) : '';
    return name + n + ((p.level || 0) > 0 ? ' · ' + T('upper') : '');
  }
  const finishName = f => { try { const v = opts.i18n && opts.i18n.t && opts.i18n.t('walk.finish.' + f); if (typeof v === 'string' && v && v !== 'walk.finish.' + f) return v; } catch { /* optional */ } return { classic: 'Signature', grand: 'Grand Marble', stone: 'Stone & Oak' }[f] || f; };
  function renderTitle() {
    const p = S.point; if (!p) return;
    const notes = [];
    if (S.key === 'apt') {
      el.t1.textContent = roomLabel(p);
      el.t2.textContent = unit ? ((opts.i18n && typeof opts.i18n.unitLabel === 'function' && opts.i18n.unitLabel(unit)) || unitLabel(unit)) : T('apartment');
      const d = sceneDefs.apt.def;
      if (O.refNote) notes.push(T('viewRef').replace('{n}', d && d.floor != null ? d.floor : ''));
      else if (sceneDefs.apt.sample || staleIds(S.style).has(p.id)) notes.push(T('sample'));
      const want = (pose && pose.style) || opts.styleId;
      if (want && S.style && want !== S.style) notes.push(T('styleNote').replace('{s}', T('s.' + S.style)));
    } else {
      // the real place, as the live 3D names it: "C3 · חניון −1" + the zone (lift lobby, corridor, forecourt…)
      const d = sceneDefs[S.key].def, b = p.building || d.building;
      el.t1.textContent = d.kind === 'outdoor' ? (p.zone === 'forecourt' && b ? b + ' · ' : '') + zoneLabel(p) : (b ? b + ' · ' : '') + floorName(d.floor);
      el.t2.textContent = d.kind === 'outdoor' ? T('r.outdoor') : d.kind === 'parking' && !p.zone ? '' : zoneLabel(p);
      if (p.finNote) notes.push(T('finishNote').replace('{f}', finishName(p.finNote)));
      if (p.dayNote) notes.push(T('dayNote'));
    }
    el.badge.textContent = notes.join(' · ');
    el.badge.hidden = !notes.length;
  }
  function renderStyles() {
    const list = S.key === 'apt' ? stylesOf('apt') : [];
    el.styles.hidden = list.length < 2 || (S.point && S.point.live && list.length < 1);
    const on = S.point && S.point.live ? (pose && list.includes(pose.style) ? pose.style : null) : S.style;
    // from the visitor's own viewpoint the design buttons lead to the (sample) panoramas of that design
    el.styles.innerHTML = `<span class="lbl">${esc(T('design'))}</span>` + list.map(s => `<button type="button" data-s="${s}" class="${s === on ? 'on' : ''}">${esc(T('s.' + s))}</button>`).join('');
  }
  function renderChips() {
    const P = S.key === 'apt' ? pts() : [], seen = new Set(), chips = [];
    const order = (p) => { const i = ROOM_ORDER.indexOf(p.room); return (i < 0 ? 50 : i) * 10 + (p.level || 0); };
    for (const p of [...P].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id))) {
      const b = baseId(p.id); if (seen.has(b)) continue; seen.add(b);
      chips.push({ key: S.key, id: p.id, base: b, label: roomLabel(p), on: S.point && !S.point.live && baseId(S.point.id) === b });
    }
    for (const [key, d] of Object.entries(sceneDefs)) {
      if (key === S.key || !stylesOf(key).length) continue;
      chips[key === 'apt' ? 'unshift' : 'push']({ key, label: key === 'apt' ? T('apartment') : T('r.' + d.def.kind), sep: true });
    }
    el.chips.innerHTML = chips.map((c, i) => `<button type="button" class="pt-chip${c.on ? ' on' : ''}${c.sep ? ' sep' : ''}" data-i="${i}">${esc(c.label)}</button>`).join('');
    el.chips._list = chips;
    const on = el.chips.querySelector('.on'); if (on && on.scrollIntoView) try { on.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch { /* old Safari */ }
  }

  // minimap ---------------------------------------------------------
  const mctx = el.mapC.getContext('2d');
  let mapTf = null;
  function placeRects(d) {   // world-frame outlines of the place the scene shows
    if (d.kind === 'parking') return [BASEMENT];
    if (d.kind === 'outdoor' || !BUILDINGS[d.building]) return [];
    return [...corridorsOf(d.building), ...coresOf(d.building)].map(r => {
      const [x0, z0] = localToWorld(d.building, r.x0, r.z0), [x1, z1] = localToWorld(d.building, r.x1, r.z1);
      return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
    });
  }
  const mapPts = () => { const P = [...pts()]; if (S.livePoint && S.livePoint.key === S.key) P.push(S.livePoint); return P; };
  function mapFrame() {
    const d = sceneDefs[S.key].def, P = mapPts();
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const add = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    if (S.key === 'apt' && d.rooms) for (const r of d.rooms) for (const [x, z] of r.poly) add(x, z);
    if (isPlace(S.key)) for (const r of placeRects(d)) { add(r.x0, r.z0); add(r.x1, r.z1); }
    for (const p of P) add(p.pos[0], p.pos[1]);
    if (d.kind === 'outdoor' && S.point) { add(S.point.pos[0] - 25, S.point.pos[1] - 25); add(S.point.pos[0] + 25, S.point.pos[1] + 25); }
    const pad = S.key === 'apt' ? 0.4 : 3;
    x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    const W = el.mapC.width, s = (W - 16) / Math.max(x1 - x0, z1 - z0);
    return { s, ox: (W - (x1 - x0) * s) / 2 - x0 * s, oz: (W - (z1 - z0) * s) / 2 - z0 * s };
  }
  function drawMap() {
    const P = mapPts(); if (!P.length) return;
    mapTf = mapFrame();
    const { s, ox, oz } = mapTf, W = el.mapC.width, X = x => ox + x * s, Z = z => oz + z * s;
    mctx.clearRect(0, 0, W, W);
    const d = sceneDefs[S.key].def, lv = (S.point && S.point.level) || 0;
    mctx.lineJoin = 'round';
    if (S.key === 'apt' && d.rooms) {
      for (const r of d.rooms) {
        if ((r.level || 0) !== lv) continue;
        mctx.beginPath(); r.poly.forEach(([x, z], i) => (i ? mctx.lineTo(X(x), Z(z)) : mctx.moveTo(X(x), Z(z)))); mctx.closePath();
        const cur = S.point && S.point.room === r.kind && pointInPoly(S.point.pos, r.poly);
        mctx.fillStyle = cur ? 'rgba(201,164,92,.22)' : OUTDOOR.includes(r.kind) ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.08)';
        mctx.fill(); mctx.strokeStyle = 'rgba(230,201,135,.75)'; mctx.lineWidth = 2; mctx.stroke();
      }
    } else {
      mctx.strokeStyle = 'rgba(230,201,135,.55)'; mctx.lineWidth = 2; mctx.fillStyle = 'rgba(255,255,255,.07)';
      for (const r of placeRects(d)) { mctx.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s); mctx.strokeRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s); }
    }
    for (const p of P) {
      if (p.live || (p.level || 0) !== lv) continue;
      mctx.beginPath(); mctx.arc(X(p.pos[0]), Z(p.pos[1]), 5, 0, Math.PI * 2);
      mctx.fillStyle = 'rgba(230,201,135,.9)'; mctx.fill();
    }
    if (S.point) {
      const cx = X(S.point.pos[0]), cz = Z(S.point.pos[1]);
      const a = Math.atan2(-Math.cos(S.yaw), -Math.sin(S.yaw)), half = Math.atan(Math.tan(S.fov * D2R / 2) * camera.aspect);
      const g = mctx.createRadialGradient(cx, cz, 0, cx, cz, 44);
      g.addColorStop(0, 'rgba(230,201,135,.55)'); g.addColorStop(1, 'rgba(230,201,135,0)');
      mctx.beginPath(); mctx.moveTo(cx, cz); mctx.arc(cx, cz, 44, a - Math.min(half, 1.2), a + Math.min(half, 1.2)); mctx.closePath(); mctx.fillStyle = g; mctx.fill();
      mctx.beginPath(); mctx.arc(cx, cz, 8, 0, Math.PI * 2); mctx.fillStyle = '#e6c987'; mctx.fill();
      mctx.lineWidth = 3; mctx.strokeStyle = '#111'; mctx.stroke();
    }
  }
  function pointInPoly([x, y], poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // ---------------------------------------------------------------- navigation
  function setBusy(on) { el.busy.classList.toggle('on', !!on); }
  async function go(target, { walk = true, keepYaw = true, yaw } = {}) {
    if (!target || S.trans || S.going || S.disposed) return;
    const from = S.point;
    if (from === target) return;
    setBusy(true); S.going = true;   // one pending move at a time: the next panorama's surroundings are captured into the spare slot
    let L;
    try { L = await prep(target, S.key, 1 - O.slot); } catch (e) { setBusy(false); S.going = false; console.warn('[pano] load failed', target.img || target.id, e); return; }
    if (from) S.moved = true;
    setBusy(false); S.going = false;
    if (S.disposed || S.trans) return;
    setLayer('B', L); noteRef(L.miss);
    const linked = from && walk && (from.links || []).includes(target.id) && (from.level || 0) === (target.level || 0);
    const A = from ? eyeOf(from) : eyeOf(target), B = eyeOf(target);
    const dist = A.distanceTo(B);
    U.cB.value.copy(B);
    const R = linked ? Math.max(2.6, dist * 1.25) : 50;
    U.rA.value = R; U.rB.value = R;
    if (!linked) U.cA.value.copy(camera.position);
    S.trans = { t0: performance.now(), dur: linked ? clamp(650 + dist * 170, 700, 2400) : 650, A, B: linked ? B : A.clone(), target, linked,
      yaw0: S.yaw, yaw1: yaw !== undefined ? yaw : S.yaw, fov0: S.fov };
    if (!linked) { U.cB.value.copy(A); }
    hotGroup.visible = false;
    S.point = target;
    renderTitle(); renderStyles(); renderChips(); drawMap();
  }
  function finishTrans() {
    const tr = S.trans; S.trans = null;
    setLayer('A', { t: S.pendingHi || U.tB.value, m: U.mB.value, w: U.wB.value, e: U.eB.value, g: U.gB.value, l: U.lB.value, n: U.nB.value,
      rot: Math.atan2(U.yB.value.y, U.yB.value.x), env: S.envB });
    S.pendingHi = null; O.slot = 1 - O.slot;
    setLayer('B', { t: blank, m: blank, w: 0, e: blank, g: 0, l: 0, n: 0, rot: 0, env: false });
    outsideForA();
    U.cA.value.copy(eyeOf(S.point)); U.cB.value.copy(U.cA.value); U.k.value = 0; U.rA.value = 4;
    camera.position.copy(eyeOf(S.point));
    S.fov = tr.fov0;
    hotGroup.visible = true; buildHotspots();
    upgrade(S.point); preloadNeighbours(S.point);
    S.dirty = true;
  }
  function stepTrans(now) {
    const tr = S.trans; if (!tr) return;
    const x = clamp((now - tr.t0) / tr.dur, 0, 1), e = ease(x);
    if (tr.linked) {
      camera.position.lerpVectors(tr.A, tr.B, e);
      U.k.value = clamp((x - 0.15) / 0.65, 0, 1);
      S.fov = tr.fov0 - Math.sin(x * Math.PI) * 6;
    } else {
      U.k.value = e;
    }
    if (tr.yaw1 !== tr.yaw0) S.yaw = tr.yaw0 + wrapPi(tr.yaw1 - tr.yaw0) * e;
    S.dirty = true;
    if (x >= 1) finishTrans();
  }
  async function enterScene(key, { pointId, room, yaw, style, point } = {}) {
    const d = sceneDefs[key]; if (!d) return;
    const styles = stylesOf(key);
    const near = { monaco: 'milano', kyoto: 'nordic', paris: 'riviera' }[style || opts.styleId];   // browsing by chip: designs without renders → the nearest rendered one
    const st = style && styles.includes(style) ? style : (key === 'apt' ? (styles.includes(opts.styleId) ? opts.styleId : styles.includes(near) ? near : styles.includes(S.style) ? S.style : styles[0]) : styles[0]);
    const prevKey = S.key, prevStyle = S.style; S.key = key; S.style = st || null;
    const P = pts();
    let p = point || (pointId && P.find(q => q.id === pointId)) || (room && P.find(q => q.room === room || baseId(q.id) === room));
    // a loggia / terrace unit shown through another type's renders: any outdoor point of the entry level is "the balcony"
    if (!p && OUTDOOR.includes(room)) p = P.find(q => OUTDOOR.includes(q.room) && !(q.level > 0)) || P.find(q => OUTDOOR.includes(q.room));
    p = p || P.find(q => q.room === 'living') || P[0];
    if (!p) { S.key = prevKey; S.style = prevStyle; return; }
    if (yaw === undefined) yaw = p.view ?? p.yaw ?? 0;
    const first = !S.point;
    if (first) {
      const L = await prep(p, key, O.slot);
      if (S.disposed) return;
      setLayer('A', L); noteRef(L.miss);
      S.point = p; S.yaw = yaw; camera.position.copy(eyeOf(p)); U.cA.value.copy(camera.position); U.cB.value.copy(camera.position);
      buildHotspots(); upgrade(p); preloadNeighbours(p);
      renderTitle(); renderStyles(); renderChips(); drawMap(); S.dirty = true;
    } else {
      await go(p, { walk: false, yaw });
      if (S.point !== p) { S.key = prevKey; S.style = prevStyle; }   // the move did not happen (busy / load failed)
      renderTitle(); renderStyles(); renderChips(); drawMap();
    }
  }
  async function setStyle(styleId) {
    if (S.key !== 'apt' || !stylesOf('apt').includes(styleId) || S.trans) return;
    const cur = S.point;
    if (styleId === S.style && !cur.live) return;
    const prev = S.style;
    S.style = styleId;
    const P = pts();
    let p = cur.live ? null : P.find(q => q.id === cur.id);
    if (!p) { let bd = Infinity; for (const q of P) { const dd = Math.hypot(q.pos[0] - cur.pos[0], q.pos[1] - cur.pos[1]) + ((q.level || 0) !== (cur.level || 0) ? 50 : 0) + (cur.live && q.room !== cur.room ? 20 : 0); if (dd < bd) { bd = dd; p = q; } } }
    if (!p) { S.style = prev; return; }
    S.point = { ...cur, id: '__prev', links: [] };   // force a cross-fade in place
    await go(p, { walk: false });
    if (S.point !== p) { S.point = cur; S.style = prev; }
    renderStyles();
  }

  // ---------------------------------------------------------------- input
  const ptrs = new Map();
  let drag = null, pinch = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    const r = el.canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(hotGroup.children.map(g => g.children[2]), false);
    if (hits.length) return byId(hits[0].object.userData.target);
    // otherwise: the linked point closest to the clicked direction (within ~16°)
    let best = null, bd = 0.28;
    for (const g of hotGroup.children) {
      const v = g.position.clone().sub(camera.position).normalize();
      const a = Math.acos(clamp(v.dot(ray.ray.direction), -1, 1));
      if (a < bd) { bd = a; best = byId(g.userData.id); }
    }
    return best;
  }
  function touched() {
    if (!S.touched) { S.touched = true; setTimeout(() => el.hint.classList.remove('show'), 1800); }
  }
  el.canvas.addEventListener('pointerdown', e => {
    el.canvas.setPointerCapture && el.canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touched();
    if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0 }; S.vy = S.vp = 0; el.canvas.classList.add('drag'); }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: S.fov }; drag = null; }
  });
  el.canvas.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      S.fov = clampFov(pinch.fov * pinch.d / Math.max(d, 1)); S.dirty = true; return;
    }
    if (drag) {
      const k = (S.fov * Math.PI / 180) / el.canvas.clientHeight;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (S.gyro) { S.gyro.off += dx * k; }
      else { S.yaw += dx * k; S.pitch = clamp(S.pitch + dy * k, -1.45, 1.45); }
      const dt = Math.max(1, performance.now() - drag.t);
      S.vy = dx * k / dt * 16; S.vp = dy * k / dt * 16;
      drag.x = e.clientX; drag.y = e.clientY; drag.t = performance.now(); S.dirty = true;
      return;
    }
    if (e.pointerType === 'mouse') {   // hover feedback
      const h = pick(e.clientX, e.clientY);
      el.canvas.classList.toggle('hot', !!h);
      for (const g of hotGroup.children) { const on = h && g.userData.id === h.id; g.userData.ring.material.opacity = on ? 1 : 0.85; g.userData.disc.material.opacity = on ? 0.45 : 0.2; g.userData.hot = !!on; }
      S.dirty = true;
    }
  });
  const up = e => {
    const wasTap = drag && drag.moved < 8 && ptrs.size === 1;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) {
      el.canvas.classList.remove('drag');
      if (drag && performance.now() - drag.t > 80) { S.vy = S.vp = 0; }
      if (wasTap) { const target = pick(e.clientX, e.clientY); if (target) go(target); }
      drag = null;
    }
  };
  el.canvas.addEventListener('pointerup', up);
  el.canvas.addEventListener('pointercancel', up);
  el.canvas.addEventListener('wheel', e => { e.preventDefault(); touched(); S.fov = clampFov(S.fov * Math.exp(e.deltaY * 0.0012)); S.dirty = true; }, { passive: false });
  el.canvas.addEventListener('keydown', e => {
    const k = e.key, step = 0.12;
    if (k === 'ArrowLeft') S.yaw += step; else if (k === 'ArrowRight') S.yaw -= step;
    else if (k === 'ArrowUp') S.pitch = clamp(S.pitch + step, -1.45, 1.45); else if (k === 'ArrowDown') S.pitch = clamp(S.pitch - step, -1.45, 1.45);
    else if (k === '+' || k === '=') S.fov = clampFov(S.fov - 6); else if (k === '-') S.fov = clampFov(S.fov + 6);
    else return;
    e.preventDefault(); touched(); S.dirty = true;
  });
  root.querySelectorAll('.pt-side .zm').forEach(b => b.onclick = () => { touched(); S.fov = clampFov(S.fov + (+b.dataset.z) * 10); S.dirty = true; });
  el.styles.onclick = e => { const b = e.target.closest('button[data-s]'); if (b) { touched(); setStyle(b.dataset.s); } };
  el.chips.onclick = e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    touched();
    const c = el.chips._list[+b.dataset.i];
    if (c.key !== S.key) { enterScene(c.key, {}); return; }
    const p = byId(c.id);
    if (p && (!S.point || baseId(S.point.id) !== c.base)) { const w = (S.point.links || []).includes(p.id); go(p, { walk: w, yaw: w ? undefined : p.view }); }
  };
  el.mapC.addEventListener('click', e => {
    if (!mapTf) return;
    const r = el.mapC.getBoundingClientRect(), sx = el.mapC.width / r.width;
    const mx = (e.clientX - r.left) * sx, mz = (e.clientY - r.top) * sx;
    let best = null, bd = 26;
    for (const p of pts()) { const d = Math.hypot(mapTf.ox + p.pos[0] * mapTf.s - mx, mapTf.oz + p.pos[1] * mapTf.s - mz); if (d < bd && (p.level || 0) === ((S.point && S.point.level) || 0)) { bd = d; best = p; } }
    if (best) { touched(); go(best, { walk: (S.point.links || []).includes(best.id) }); }
  });
  el.exit.onclick = () => { const s = getState(); dispose(); opts.onExit && opts.onExit(s); };
  el.mode.onclick = e => {
    if (!e.target.closest('button[data-m="3d"]') || !opts.onSwitchTo3D) return;
    const s = getState(); dispose(); opts.onSwitchTo3D(s);
  };
  if (el.res) el.res.onclick = () => { touched(); opts.onReserve(unit.id, getState()); };

  // gyroscope (only after an explicit tap; iOS asks for permission) --------------------------------
  const hasDO = typeof window.DeviceOrientationEvent !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  el.gy.hidden = !hasDO;
  const zee = new THREE.Vector3(0, 0, 1), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), eul = new THREE.Euler(), gq = new THREE.Quaternion(), ge = new THREE.Euler(0, 0, 0, 'YXZ');
  function onOrient(ev) {
    if (!S.gyro || ev.alpha == null) return;
    const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * Math.PI / 180;
    eul.set(ev.beta * Math.PI / 180, ev.alpha * Math.PI / 180, -ev.gamma * Math.PI / 180, 'YXZ');
    gq.setFromEuler(eul); gq.multiply(q1); gq.multiply(q0.setFromAxisAngle(zee, -orient));
    ge.setFromQuaternion(gq, 'YXZ');
    if (S.gyro.base === null) S.gyro.base = S.yaw - ge.y;
    S.gyro.yaw = ge.y; S.gyro.pitch = clamp(ge.x, -1.45, 1.45); S.dirty = true;
  }
  el.gy.onclick = async () => {
    touched();
    if (S.gyro) { S.gyro = null; el.gy.classList.remove('on'); window.removeEventListener('deviceorientation', onOrient); return; }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') throw new Error('denied');
      }
      S.gyro = { base: null, off: 0, yaw: 0, pitch: 0 }; el.gy.classList.add('on');
      window.addEventListener('deviceorientation', onOrient);
    } catch { el.hint.textContent = T('gyroOff'); el.hint.classList.add('show'); setTimeout(() => el.hint.classList.remove('show'), 2500); }
  };


  // ---------------------------------------------------------------- loop
  function resize() {
    const w = root.clientWidth || 1, h = root.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; root.classList.toggle('phone', isPhone()); S.fov = clampFov(S.fov); S.dirty = true;
  }
  const ro = new ResizeObserver(resize); ro.observe(root); resize();
  function frame(now) {
    if (S.disposed) return;
    const dt = Math.min(0.05, (now - S.lastT) / 1000); S.lastT = now;
    stepTrans(now);
    if (S.envA && U.gA.value < 1) { U.gA.value = Math.min(1, U.gA.value + dt / 0.45); S.dirty = true; }
    if (!drag && !S.gyro && (Math.abs(S.vy) > 1e-4 || Math.abs(S.vp) > 1e-4)) {
      S.yaw += S.vy; S.pitch = clamp(S.pitch + S.vp, -1.45, 1.45); S.vy *= 0.9; S.vp *= 0.9; S.dirty = true;
    } else if (!S.touched && !S.trans && !S.gyro && !pose) { S.yaw += dt * 0.035; S.dirty = true; }   // (never drifts off the visitor's own direction)
    if (S.gyro && S.gyro.base !== null) { S.yaw = S.gyro.yaw + S.gyro.base + S.gyro.off; S.pitch = S.gyro.pitch; }
    if (S.dirty) {
      camera.rotation.set(S.pitch, S.yaw, 0); camera.fov = S.fov; camera.updateProjectionMatrix();
      sky.position.copy(camera.position);
      // rings: fade with distance, face-on size stays readable
      for (const g of hotGroup.children) {
        const d = g.position.distanceTo(camera.position);
        g.userData.ring.material.opacity = clamp(1.25 - d * 0.08, 0.45, 0.95);
        g.scale.setScalar(Math.max(g.userData.hot ? 1.18 : 1, d / 9));        // far photoreal viewpoints (car park, corridors) stay visible
      }
      renderer.render(scene, camera);
      S.dirty = false;
      if (performance.now() - (S.mapT || 0) > 90) { drawMap(); S.mapT = performance.now(); }
    }
  }
  renderer.setAnimationLoop(frame);

  // Where the tour is now, for the live 3D to take over: world position of the standing point (feet), view direction in
  // world terms (yawWorld, pitch, fov = vertical degrees) and, for apartments, the unit-local form walk.js already knew.
  function getState() {
    const p = S.point; if (!p) return null;
    // opened from the live 3D and never moved between hotspots: the visitor goes back to the very spot he came from
    const same = !!(pose && !S.moved && S.key === startKey && p.id === info.pointId);
    const yaw = wrapPi(S.yaw), view = { yawWorld: wrapPi(S.yaw + frameYaw(S.key)), pitch: S.pitch, fov: S.fov, pointId: p.id, live: !!p.live || same, moved: !same };
    const uid = unit ? unit.id : opts.unitId;
    if (p.live || same) return { ...view, unitId: uid, styleId: opts.styleId, room: { kind: p.room, index: p.roomIndex || 0, level: p.level || 0 }, frame: 'world', kind: pose.kind,
      world: pose.world.slice(), building: pose.building, floor: pose.floor, yaw, level: p.level || 0 };
    // (below: the visitor walked to another panorama point — that is where the live 3D takes over)
    if (S.key === 'apt') return { ...view, unitId: uid, styleId: S.style, room: { kind: p.room, index: p.roomIndex || 0, level: p.level || 0 }, frame: 'unit', kind: 'apt',
      u: p.pos[0] * uScale(), v: p.pos[1], level: p.level || 0, yaw, sample: sceneDefs.apt.sample };
    const d = sceneDefs[S.key].def, o = BUILDINGS[d.building] ? BUILDINGS[d.building].origin : [0, 0];
    return { ...view, unitId: uid, styleId: opts.styleId, room: { kind: d.kind, index: 0, level: 0 }, frame: pose ? 'world' : 'building', kind: d.kind, building: p.building || d.building, floor: d.floor,
      world: [p.pos[0], p.pos[2] || 0, p.pos[1]], x: p.pos[0] - o[0], z: p.pos[1] - o[1], yaw };
  }
  function dispose() {
    if (S.disposed) return; S.disposed = true;
    renderer.setAnimationLoop(null); ro.disconnect(); window.removeEventListener('deviceorientation', onOrient);
    for (const e of cache.values()) if (e.t) e.t.dispose();
    for (const e of masks.values()) if (e.t) e.t.dispose();
    for (const e of caps.values()) e.tex.dispose();
    caps.clear();
    masks.clear(); if (O.api) { try { O.api.dispose(); } catch (e) { console.warn(e); } O.api = null; }
    cache.clear(); sky.geometry.dispose(); sky.material.dispose(); ringGeo.dispose(); discGeo.dispose(); hitGeo.dispose();
    hotGroup.traverse(o => o.material && o.material.dispose());
    renderer.dispose(); root.remove();
  }

  // ---------------------------------------------------------------- start
  const info = { mode: 'pano', key: startKey, pointId: null, dist: 0, matched };
  try {
    if (pose) {
      // the same place, the same direction: the nearest panorama of the place the visitor stands in, or nothing at all
      S.touched = true;
      S.pitch = clamp(pose.pitch || 0, -1.45, 1.45);
      S.fov = clampFov(pose.fov || fovDefault(aspect()));
      const yaw0 = wrapPi((pose.yaw || 0) - frameYaw(startKey));
      const hit = pickSpot(man, pose, unit);
      if (!hit) throw new Error('no photoreal view for this spot');
      await enterScene(startKey, { pointId: hit.id, yaw: yaw0, style: hit.style || pose.style });
      if (!S.point || S.point.id !== hit.id) throw new Error('the panorama of this spot failed to load');
      info.pointId = hit.id; info.dist = hit.dist; info.place = hit.place || null; info.style = S.style;
    } else {
      S.fov = clampFov(fovDefault(aspect()));
      await enterScene(startKey, { pointId: opts.pointId, room: isPlace(startKey) ? undefined : (startRoom || 'living'), yaw: opts.yaw, style: opts.styleId });
      if (!S.point) throw new Error('no panorama');
      info.pointId = S.point.id;
    }
  } catch (e) {
    if (pose && /^no photoreal view/.test(e && e.message)) console.info('[pano]', e.message); else console.warn('[pano] start failed', e);
    if (pose) { dispose(); return { ok: false, dispose() {}, close() {} }; }      // walk.js stays in live 3D and says so
    el.load.querySelector('.in').innerHTML = `<div>${esc(T('none'))}</div>`;
    return { ok: false, dispose, close: dispose };
  }
  el.load.classList.add('off');
  el.hint.textContent = T('hint');
  el.hint.classList.add('show'); setTimeout(() => el.hint.classList.remove('show'), 6000);
  el.canvas.focus({ preventScroll: true });

  const handle = { ok: true, info, setStyle, getState, dispose, close: dispose, get pointId() { return S.point && S.point.id; } };
  if (/[?&]ptdebug\b/.test(location.search)) {   // test hook: render one frame at a given look and return it as a JPEG data URL
    window.__ptDbg = { S, U, O, go, byId, pts, enterScene, sceneDefs, info, getState, outsideReady: () => (O.p || Promise.resolve(null)),
      snap(yaw = S.yaw, pitch = S.pitch, fov = S.fov) {
        S.touched = true; S.yaw = yaw; S.pitch = pitch; S.fov = fov; U.gA.value = S.envA ? 1 : U.gA.value;
        camera.rotation.set(S.pitch, S.yaw, 0); camera.fov = S.fov; camera.updateProjectionMatrix(); sky.position.copy(camera.position);
        renderer.render(scene, camera); return el.canvas.toDataURL('image/jpeg', 0.9);
      } };
  }
  return handle;
}
export default openPanoTour;
