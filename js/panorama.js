// VILNYI RIVER CITY — "360° around the project": a panoramic view captured from the real 3D scene (createEnvironment +
// createComplex, camera PANO_EYE_H m above the project; faces pre-rendered by dev/pano-capture.html into
// assets/panorama/<mode>-<size>/) with every point of interest pinned at its true bearing and ground distance,
// a north-up "radar" mini-map synced to the heading, category filters, and Google-Maps routes from the project.
// Self-contained: bootstraps itself on #around; the DOM (header, radar, list) renders at load, WebGL starts lazily
// when the section approaches the viewport. three.js is imported only then.
import { bearingOf, dirOfBearing, LAKE, BUILDINGS, GEOM, ROOF_Y, footprintOf, localToWorld } from './data.js?v=3.12';
import { lang, onLangChange } from './i18n.js?v=3.12';
import { pt, poiName, dirName, CARD } from './i18n-panorama.js?v=3.12';

// ---------------------------------------------------------------- geometry of the capture (shared with the capture page)
export const PANO_EYE_H = 120;
export const PANO_EYE = [51, PANO_EYE_H, -33.6];        // world x,y,z — over the middle of the C3–C4 "U" (see siteCentre)
// The centre of the two blocks' combined footprint, from data.js. The baked faces in assets/panorama/ are only valid
// for the massing and the eye they were captured with: if this drifts from PANO_EYE (or the buildings change shape),
// re-run dev/pano-capture.html — it refuses to capture while the two disagree.
export function siteCentre() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const id of Object.keys(BUILDINGS)) for (const [lx, lz] of footprintOf(id)) {
    const [x, z] = localToWorld(id, lx, lz);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}
// "You are here" anchors: the middle of each block's long bar, on the roof (world x,y,z) — always from data.js
export const PROJECT_ANCHORS = Object.keys(BUILDINGS).map(id => {
  const [x, z] = localToWorld(id, GEOM.wing.x0 / 2, 0);
  return { id: id.toLowerCase(), name: id, world: [x, ROOF_Y, z] };
});
// Cube faces: capture camera looks along dir with the given up vector; the viewer rebuilds the same orientation.
export const PANO_FACES = [
  { id: 'px', dir: [1, 0, 0], up: [0, 1, 0] }, { id: 'nx', dir: [-1, 0, 0], up: [0, 1, 0] },
  { id: 'pz', dir: [0, 0, 1], up: [0, 1, 0] }, { id: 'nz', dir: [0, 0, -1], up: [0, 1, 0] },
  { id: 'py', dir: [0, 1, 0], up: [0, 0, -1] }, { id: 'ny', dir: [0, -1, 0], up: [0, 0, 1] },
];
const MODES = ['day', 'dusk'];

// ---------------------------------------------------------------- the project on the map
// Aqua City OSM residential area (mapcarta.com/W455750583) centroid 44.46408, 26.03534 and the developer's Google-Maps
// site sketch (the black X, ≈200 m W / 40 m S of the "Aqua City" pin at Intrarea Godeni 15, scale checked against
// Anagram Brewery and the Lacul Morii shore). C3/C4 stand ~20 m NW of the X (data.js GEO.anchor).
export const PROJECT_LL = [44.4639, 26.0347];

// ---------------------------------------------------------------- points of interest (real coordinates, sources cited)
// cat: transport | shopping | education | health | parks | leisure | city.  kind → i18n 'k.<kind>'.  key:true = priority label.
export const POIS = [
  // --- transport
  { id: 'm-crangasi', cat: 'transport', kind: 'metro', name: 'Crângași', line: 'M1', ll: [44.45191, 26.04715], key: true }, // mapcarta.com/N610929150 (OSM)
  { id: 'm-1mai', cat: 'transport', kind: 'metro', name: '1 Mai', line: 'M4', ll: [44.47053, 26.05063], key: true },          // mapcarta.com/N5257635111 (OSM)
  { id: 'm-poenaru', cat: 'transport', kind: 'metro', name: 'Petrache Poenaru', line: 'M1', ll: [44.44543, 26.04655] },       // mapcarta.com/N305136011 (OSM)
  { id: 'm-grozavesti', cat: 'transport', kind: 'metro', name: 'Grozăvești', line: 'M1', ll: [44.44274, 26.06036] },         // mapcarta.com/N582975264 (OSM)
  { id: 'gara-nord', cat: 'transport', kind: 'rail', name: 'Gara de Nord', line: 'CFR · M1 · M4', ll: [44.44674, 26.07384], key: true }, // mapcarta.com/13712682 (OSM)
  { id: 'stop-giulesti', cat: 'transport', kind: 'bus', name: 'Piața Giulești', line: 'STB', ll: [44.46654, 26.03500] },     // mapcarta.com/N8394828646 (OSM bus stop)
  { id: 'otp', cat: 'transport', kind: 'airport', name: 'Henri Coandă · OTP', ll: [44.57111, 26.08500], key: true },        // en.wikipedia.org/wiki/Bucharest_Henri_Coandă_International_Airport
  // --- shopping
  { id: 'lidl', cat: 'shopping', kind: 'supermarket', name: 'Lidl', ll: [44.46410, 26.03735], key: true },                  // lidl.ro store "Intrarea Godeni 6-8" (in the complex); position = mapcarta.com/W455750583 "Lidl 160 m east"
  { id: 'mega-g2', cat: 'shopping', kind: 'supermarket', name: 'Mega Image', ll: [44.46525, 26.037694] },                   // mega-image.ro/storedetails/mega-image-giulesti-2 (Calea Giulești 233)
  { id: 'piata-giulesti', cat: 'shopping', kind: 'market', name: 'Piața Giulești', ll: [44.46624, 26.03494] },              // mapcarta.com/W23682952 (OSM)
  { id: 'auchan', cat: 'shopping', kind: 'hyper', name: 'Auchan Crângași', ll: [44.457571, 26.040747], key: true },          // wolt.com venue "Auchan Hypermarket Crangasi" map data (Bd. Constructorilor 16A)
  { id: 'mega-g1', cat: 'shopping', kind: 'supermarket', name: 'Mega Image 24/7', ll: [44.458068, 26.052693] },             // mega-image.ro/storedetails/mega-image-giulesti (Calea Giulești 38-40)
  { id: 'piata-crangasi', cat: 'shopping', kind: 'market', name: 'Piața Crângași', ll: [44.45277, 26.04860] },              // mapcarta.com/N5554337021 (OSM)
  { id: 'orhideea', cat: 'shopping', kind: 'mall', name: 'Orhideea · Carrefour', ll: [44.44488, 26.06303] },               // mapcarta.com/W23557062 (OSM, Splaiul Independenței 210)
  { id: 'afi', cat: 'shopping', kind: 'mall', name: 'AFI Cotroceni', ll: [44.43036, 26.05200], key: true },                 // mapcarta.com/W244033697 (OSM)
  { id: 'plaza', cat: 'shopping', kind: 'mall', name: 'Plaza România', ll: [44.4284778, 26.0348139], key: true },           // en.wikipedia.org/wiki/Plaza_Romania
  // --- education
  { id: 'kinder', cat: 'education', kind: 'kinder', name: 'C4', i18nName: 'poi.kinder', ll: PROJECT_LL, onSite: true },      // on site: data.js BUILDINGS.C4.ground = 'kindergarten' (building permit 252/2025)
  { id: 'marin-preda', cat: 'education', kind: 'highschool', name: 'Liceul „Marin Preda”', ll: [44.45964, 26.04308], key: true }, // mapcarta.com/W40849681 (OSM)
  { id: 'scoala-162', cat: 'education', kind: 'school', name: 'Școala Gimnazială nr. 162', ll: [44.46825, 26.03167] },      // mapcarta.com/W394660497 (OSM)
  { id: 'feroviar', cat: 'education', kind: 'highschool', name: 'Colegiul Feroviar „Mihai I”', ll: [44.46669, 26.042092] }, // bucuresti.ro/locatii/educatie-colegiul-tehnic-feroviar-mihai-i-381
  { id: 'upb', cat: 'education', kind: 'university', name: 'Politehnica', ll: [44.43833, 26.05139], key: true },           // en.wikipedia.org/wiki/Politehnica_University_of_Bucharest
  // --- health
  { id: 'catena', cat: 'health', kind: 'pharmacy', name: 'Catena', ll: [44.462393, 26.04296] },                            // sfatulmedicului.ro/farmacie/catena-giulesti-133_844 (Calea Giulești 133)
  { id: 'hosp-mil', cat: 'health', kind: 'hospital', name: 'Spitalul Militar Central', ll: [44.442664, 26.072785], key: true }, // bucuresti.ro/locatii/spitale-spitalul-universitar-de-urgenta-militar-central-dr-carol-davila-98
  // --- parks & water
  { id: 'lake', cat: 'parks', kind: 'lake', name: 'Lacul Morii', i18nName: 'poi.lake', ll: [44.46150, 26.03500], key: true }, // nearest shore: data.js LAKE shore (traced from the Google-Maps satellite view); lake: en.wikipedia.org/wiki/Lacul_Morii
  { id: 'p-giulesti', cat: 'parks', kind: 'park', name: 'Parcul Giulești', ll: [44.46083, 26.04314] },                     // mapcarta.com/W23679596 (OSM)
  { id: 'p-crangasi', cat: 'parks', kind: 'park', name: 'Parcul Crângași', ll: [44.452667, 26.045759] },                   // bucuresti.ro/locatii/parcuri-si-gradini-parcul-crangasi-82
  { id: 'botanic', cat: 'parks', kind: 'garden', name: 'Grădina Botanică', i18nName: 'poi.botanic', ll: [44.43767, 26.06335] }, // mapcarta.com/W23557199 (OSM)
  // --- leisure & sport
  { id: 'anagram', cat: 'leisure', kind: 'brewery', name: 'Anagram Brewery', ll: [44.458727, 26.036784] },                 // wanderlog.com/place/details/6363532/anagram-brewery (Str. Mehadia 43)
  { id: 'stayfit', cat: 'leisure', kind: 'gym', name: 'Stay Fit Gym', ll: [44.45770, 26.04060] },                         // stayfit.ro/bucuresti/crangasi (inside Auchan Crângași — wolt.com coordinates of the centre)
  { id: 'strand', cat: 'leisure', kind: 'pool', name: 'Ștrand Giulești', ll: [44.46860, 26.03004] },                      // mapcarta.com/W394497076 (OSM)
  { id: 'rapid', cat: 'leisure', kind: 'stadium', name: 'Superbet Arena · Rapid', ll: [44.45595, 26.05684], key: true },    // mapcarta.com/W859341022 (OSM)
  { id: 'opera', cat: 'leisure', kind: 'theatre', name: 'Opera Comică pentru Copii', ll: [44.45506, 26.05772] },           // mapcarta.com/W163127914 (OSM)
  { id: 'romexpo', cat: 'leisure', kind: 'expo', name: 'Romexpo', ll: [44.47628, 26.06514] },                             // mapcarta.com/W23554160 (OSM)
  // --- city orientation
  { id: 'victoriei', cat: 'city', kind: 'square', name: 'Piața Victoriei', i18nName: 'poi.victoriei', ll: [44.4529, 26.0858], key: true }, // en.wikipedia.org/wiki/Victory_Square,_Bucharest
  { id: 'oldtown', cat: 'city', kind: 'oldtown', name: 'Centrul Vechi', i18nName: 'poi.oldtown', ll: [44.43254, 26.10314], key: true },   // mapcarta.com/W232341176 (OSM)
  { id: 'parliament', cat: 'city', kind: 'landmark', name: 'Palatul Parlamentului', i18nName: 'poi.parliament', ll: [44.42753, 26.08729], key: true }, // mapcarta.com/25729220 (OSM)
];
export const CATS = ['transport', 'shopping', 'education', 'health', 'parks', 'leisure', 'city'];

// ---------------------------------------------------------------- distances & times
const R_EARTH = 6371008.8, RAD = Math.PI / 180;
export function haversine([la1, lo1], [la2, lo2]) {
  const a = Math.sin((la2 - la1) * RAD / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin((lo2 - lo1) * RAD / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function trueBearing([la1, lo1], [la2, lo2]) {
  const y = Math.sin((lo2 - lo1) * RAD) * Math.cos(la2 * RAD);
  const x = Math.cos(la1 * RAD) * Math.sin(la2 * RAD) - Math.sin(la1 * RAD) * Math.cos(la2 * RAD) * Math.cos((lo2 - lo1) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
// Straight line × detour factor; walking 4.8 km/h; driving speed grows with distance (city streets → boulevards → DN1).
const walkMin = d => Math.max(1, Math.round(d * 1.3 / 80));
const driveMin = d => Math.max(2, Math.round(2 + d * 1.35 / (d < 2500 ? 330 : d < 8000 ? 450 : 780)));
const WALKABLE = 1200;                                    // ≤ ~20 min on foot → turquoise
// The lake pin stands on the nearest point of the shore AS DRAWN in the 3D scene (data.js LAKE.shore), so it sits on the
// water's edge in the panorama; its map coordinates follow from that offset (metres north / east of the project).
{
  let best = null;
  for (const [x, z] of LAKE.shore) { const d = Math.hypot(x - PANO_EYE[0], z - PANO_EYE[2]); if (!best || d < best.d) best = { d, b: bearingOf(x - PANO_EYE[0], z - PANO_EYE[2]) }; }
  const lake = POIS.find(p => p.id === 'lake');
  if (lake && best) {
    const n = best.d * Math.cos(best.b * RAD), e = best.d * Math.sin(best.b * RAD);
    lake.ll = [+(PROJECT_LL[0] + n / 111320).toFixed(5), +(PROJECT_LL[1] + e / (111320 * Math.cos(PROJECT_LL[0] * RAD))).toFixed(5)];
  }
}
for (const p of POIS) {
  p.dist = p.onSite ? 0 : haversine(PROJECT_LL, p.ll);
  p.bearing = p.onSite ? 0 : trueBearing(PROJECT_LL, p.ll);
  p.walk = walkMin(p.dist); p.drive = driveMin(p.dist);
  p.mode = p.dist <= WALKABLE ? 'walk' : 'drive';
}

// ---------------------------------------------------------------- icons
const I = {
  transport: '<rect x="5" y="3.5" width="14" height="14" rx="3"/><path d="M5 11h14M8.5 14.5h.01M15.5 14.5h.01M8 20.5l1.5-3M16 20.5l-1.5-3"/>',
  metro: '<circle cx="12" cy="12" r="8.5"/><path d="M7.8 15.8V8.4l4.2 5 4.2-5v7.4"/>',
  rail: '<rect x="6" y="3.5" width="12" height="13" rx="2.5"/><path d="M6 10.5h12M9 13.8h.01M15 13.8h.01M8.5 20.5l2-3.5M15.5 20.5l-2-3.5"/>',
  bus: '<rect x="5" y="3.5" width="14" height="14" rx="2"/><path d="M5 12h14M8 20v-2.5M16 20v-2.5M8.5 15h.01M15.5 15h.01M9 6.5h6"/>',
  airport: '<path d="M21 15.5l-8-5V4.8a1.5 1.5 0 0 0-3 0v5.7l-8 5v2l8-2.4v4.4l-2.2 1.6v1.4L11.5 21l3.7 1.5v-1.4L13 19.5v-4.4l8 2.4z"/>',
  shopping: '<path d="M5 8h14l-1.2 12.5H6.2zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
  education: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14zM6.5 11.5v4.5c3.3 2.4 7.7 2.4 11 0v-4.5M21.5 9.5v5.5"/>',
  health: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
  parks: '<path d="M12 21v-6M12 15c-3.6 0-6-2.3-6-5.3C6 6.4 8.7 3.5 12 3.5s6 2.9 6 6.2c0 3-2.4 5.3-6 5.3zM8 21h8"/>',
  lake: '<path d="M3 15c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0M3 19c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0M12 11.5V4M12 4c-1.2 1.6-1.4 3.2-.7 4.8M12 4c1.2 1.6 1.4 3.2.7 4.8"/>',
  leisure: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  stadium: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/><ellipse cx="12" cy="12" rx="4.5" ry="2.3"/><path d="M12 6.5v11"/>',
  city: '<path d="M3.5 20.5h17M5 20.5V10.5M9 20.5V10.5M15 20.5V10.5M19 20.5V10.5M3.5 10.5h17L12 4z"/>',
  kinder: '<path d="M4 20V10l8-6 8 6v10zM9.5 20v-5h5v5"/><circle cx="12" cy="10.5" r="1.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  unfull: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  gyro: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M3 9a9 9 0 0 0 0 6M21 9a9 9 0 0 1 0 6M11 18.5h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2.2-6.5L15 17v4M8 12.5l1.5-4.5 3.5-1 2 3.5 2.5 1.5M12.2 14.5l1-4.5"/>',
  car: '<path d="M4 16.5V12l2-5h12l2 5v4.5zM4 16.5V19M20 16.5V19M4 12h16"/><circle cx="7.5" cy="14.3" r=".8"/><circle cx="16.5" cy="14.3" r=".8"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  dusk: '<path d="M4 17h16M7 17a5 5 0 0 1 10 0M12 7v2.5M5.5 10.5l1.6 1.2M18.5 10.5l-1.6 1.2M8 20.5h8"/>',
  drag: '<path d="M8 12h8M4.5 12l3-3M4.5 12l3 3M19.5 12l-3-3M19.5 12l-3 3"/>',
};
const KIND_ICON = { metro: 'metro', rail: 'rail', bus: 'bus', airport: 'airport', lake: 'lake', stadium: 'stadium', kinder: 'kinder' };
const svg = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k] || ''}</svg>`;
const iconOf = p => KIND_ICON[p.kind] || p.cat;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- formatting
function fmtDist(d) {
  if (d < 1) return pt('onsite');
  const U = CARD[lang] || CARD.en;
  if (d < 1000) return `${Math.round(d / 10) * 10} ${U.m}`;
  const km = d < 10000 ? (Math.round(d / 100) / 10) : Math.round(d / 1000);
  let s = String(km); if (U.comma) s = s.replace('.', ',');
  return `${s} ${U.km}`;
}
const fmtMin = n => pt('min', { n });
const nameOf = p => poiName(p);
export function mapsDir(p, mode) {
  const o = PROJECT_LL.join(','), d = p.ll.join(',');
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=${mode === 'walk' ? 'walking' : 'driving'}`;
}
export const mapsOpen = p => `https://www.google.com/maps/search/?api=1&query=${p.ll.join(',')}`;

// ---------------------------------------------------------------- radar scale (piecewise, rings evenly spaced)
const RINGS = [500, 1000, 2000, 5000];
function radarR(d) {
  if (d <= 500) return d / 500 * 22;
  if (d <= 1000) return 22 + (d - 500) / 500 * 22;
  if (d <= 2000) return 44 + (d - 1000) / 1000 * 22;
  if (d <= 5000) return 66 + (d - 2000) / 3000 * 22;
  return Math.min(95, 88 + (d - 5000) / 9000 * 7);
}
const polar = (b, r) => [Math.sin(b * RAD) * r, -Math.cos(b * RAD) * r];

// ================================================================ bootstrap
const $ = (s, r = document) => r.querySelector(s);
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } };

function boot() {
  const sec = document.getElementById('around');
  if (!sec || sec.dataset.ready) return;
  sec.dataset.ready = '1';
  createPanorama(sec);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

// ================================================================ the widget
function createPanorama(sec) {
  const app = $('#panoApp', sec);
  const S = {
    filter: 'all', sel: null, yaw: 0, pitch: -0.2, hfov: 0, mode: MODES.includes(lsGet('vrc.panoMode')) ? lsGet('vrc.panoMode') : 'dusk',
    dirty: true, auto: !reduced, lastUser: 0, anim: null, gyro: null, listAll: false, full: false,
  };
  let gl = null;           // { THREE, renderer, scene, camera, faces, … } once WebGL is up
  let W = 0, H = 0;

  // ---------- static DOM
  app.innerHTML = `
    <div class="pano-bar">
      <div class="pano-chips" role="toolbar" id="panoChips"></div>
      <div class="pano-legend" aria-hidden="true"><span class="lg is-walk"><i></i><b data-p="legend.walk"></b></span><span class="lg is-drive"><i></i><b data-p="legend.drive"></b></span></div>
    </div>
    <div class="pano-stage" id="panoStage" tabindex="0" role="application">
      <div class="pano-gl"></div>
      <div class="pano-vignette" aria-hidden="true"></div>
      <div class="pano-pins" id="panoPins"></div>
      <div class="pano-compass" dir="ltr" aria-hidden="true"><div class="pc-strip"></div><div class="pc-mark"><i></i><b class="pc-deg"></b></div></div>
      <div class="pano-tools">
        <div class="pano-mode" role="group">
          <button type="button" data-mode="day" class="pt-btn">${svg('sun')}<span data-p="day"></span></button>
          <button type="button" data-mode="dusk" class="pt-btn">${svg('dusk')}<span data-p="dusk"></span></button>
        </div>
        <button type="button" class="pt-btn pt-ic" data-act="gyro" hidden>${svg('gyro')}</button>
        <button type="button" class="pt-btn pt-ic pt-zoom" data-act="zin">${svg('plus')}</button>
        <button type="button" class="pt-btn pt-ic pt-zoom" data-act="zout">${svg('minus')}</button>
        <button type="button" class="pt-btn pt-ic" data-act="full">${svg('full')}</button>
      </div>
      <figure class="pano-radar" dir="ltr"><svg class="pr-svg" viewBox="-100 -100 200 200" role="img"></svg></figure>
      <div class="pano-hint" aria-hidden="true">${svg('drag')}<span></span></div>
      <div class="pano-veil"><img src="assets/bird.png" alt="" width="46" height="41"><p class="pv-t"></p><div class="pv-bar"><i></i></div></div>
      <aside class="pano-card" id="panoCard" hidden aria-live="polite"></aside>
    </div>
    <div class="pano-foot">
      <p class="pano-note"></p>
      <div class="pano-list" id="panoList"></div>
      <button type="button" class="btn link pano-more" id="panoMore"></button>
    </div>`;
  const stage = $('#panoStage', app), pinsEl = $('#panoPins', app), card = $('#panoCard', app), radar = $('.pr-svg', app);
  const veil = $('.pano-veil', app), hint = $('.pano-hint', app), strip = $('.pc-strip', app), degEl = $('.pc-deg', app);
  const gyroBtn = $('[data-act="gyro"]', app), fullBtn = $('[data-act="full"]', app);

  // compass strip: 2 turns of ticks, 4 px per degree, scrolled by the heading
  const PXD = 4;
  {
    let h = '';
    for (let d = -180; d <= 540; d += 5) {
      const b = ((d % 360) + 360) % 360, x = (d + 180) * PXD;
      const card4 = b % 90 === 0, card8 = b % 45 === 0;
      h += `<i class="t${card4 ? ' c4' : card8 ? ' c8' : b % 15 === 0 ? ' c15' : ''}" style="left:${x}px"></i>`;
      if (card8) h += `<b class="l${card4 ? ' c4' : ''}" data-b="${b}" style="left:${x}px"></b>`;
      else if (b % 15 === 0) h += `<em style="left:${x}px">${b}</em>`;
    }
    strip.innerHTML = h;
  }

  // pins
  const pinEls = new Map();
  const projPins = [
    ...POIS.filter(p => !p.onSite),
    // the project itself, seen when looking down (roof of each block's bar, from data.js)
    ...PROJECT_ANCHORS.map(a => ({ ...a, proj: true, cat: 'project' })),
  ];
  pinsEl.innerHTML = projPins.map(p => p.proj
    ? `<div class="pp pp-proj" data-id="${p.id}"><span class="pp-card"><img src="assets/bird.png" alt="" width="20" height="18"><span class="pp-tx"><b dir="ltr">VILNYI RIVER CITY · ${p.name}</b><small data-p="here"></small></span></span><span class="pp-stem"></span><span class="pp-dot"></span></div>`
    : `<button type="button" class="pp is-${p.mode}${p.key ? ' key' : ''}" data-id="${p.id}" data-cat="${p.cat}"><span class="pp-card"><i class="pp-ic">${svg(iconOf(p))}</i><span class="pp-tx"><b dir="auto"></b><small></small></span></span><span class="pp-stem"></span><span class="pp-dot"></span></button>`).join('');
  // distance-ring tags (the rings themselves are drawn on the ground in WebGL; each tag rides its ring near the view centre)
  const GROUND_RINGS = [{ r: 500, c: 'walk' }, { r: 1000, c: 'walk' }, { r: 2000, c: 'drive' }];
  pinsEl.insertAdjacentHTML('afterbegin', GROUND_RINGS.map(g => `<span class="pp-ring is-${g.c}" data-r="${g.r}"></span>`).join(''));
  const ringTags = GROUND_RINGS.map(g => ({ ...g, el: pinsEl.querySelector(`[data-r="${g.r}"]`) }));
  for (const p of projPins) {
    const el = pinsEl.querySelector(`[data-id="${p.id}"]`);
    pinEls.set(p.id, { p, el, cardEl: el.querySelector('.pp-card'), w: 0, h: 0, dir: null });
  }

  // ---------- language-dependent text
  function renderText() {
    const rtl = lang === 'he';
    sec.querySelector('[data-pp="eyebrow"]').textContent = pt('eyebrow');
    sec.querySelector('[data-pp="title"]').textContent = pt('title');
    sec.querySelector('[data-pp="lead"]').textContent = pt('lead');
    app.querySelectorAll('[data-p]').forEach(el => { el.textContent = pt(el.dataset.p); });
    stage.setAttribute('aria-label', pt('stageLabel'));
    $('.pano-mode', app).setAttribute('aria-label', pt('modeLabel'));
    $('[data-act="zin"]', app).setAttribute('aria-label', pt('zoomIn'));
    $('[data-act="zout"]', app).setAttribute('aria-label', pt('zoomOut'));
    fullBtn.setAttribute('aria-label', pt(S.full ? 'exitFull' : 'full'));
    gyroBtn.setAttribute('aria-label', pt(S.gyro ? 'gyroOff' : 'gyro'));
    radar.setAttribute('aria-label', pt('radar'));
    hint.querySelector('span').textContent = pt(coarse ? 'hintTouch' : 'hint');
    veil.querySelector('.pv-t').textContent = pt('loading');
    $('.pano-note', app).textContent = pt('note');
    strip.querySelectorAll('b.l').forEach(b => { b.textContent = dirName(+b.dataset.b, true); });
    for (const { p, el } of pinEls.values()) {
      if (p.proj) continue;
      el.querySelector('b').textContent = nameOf(p);
      el.querySelector('small').innerHTML = pinMeta(p);
      el.setAttribute('aria-label', `${nameOf(p)} — ${pt('k.' + p.kind)}, ${fmtDist(p.dist)}`);
    }
    { const U = CARD[lang] || CARD.en; for (const g of ringTags) g.el.textContent = g.r < 1000 ? `${g.r} ${U.m}` : `${g.r / 1000} ${U.km}`; }
    for (const v of pinEls.values()) v.w = 0;     // re-measure
    renderChips(); renderRadar(); renderList();
    if (S.sel) openCard(S.sel, false);
    S.dirty = true;
    app.dir = rtl ? 'rtl' : 'ltr';
  }
  function pinMeta(p) {
    const t = p.mode === 'walk' ? `${svg('walk', 'pm-ic')}${fmtMin(p.walk)}` : `${svg('car', 'pm-ic')}${fmtMin(p.drive)}`;
    return `<span class="pm-d">${fmtDist(p.dist)}</span><span class="pm-sep"></span><span class="pm-t">${t}</span>`;
  }

  // ---------- chips
  function renderChips() {
    const n = c => POIS.filter(p => c === 'all' || p.cat === c).length;
    $('#panoChips', app).innerHTML = ['all', ...CATS].map(c => `<button type="button" class="pchip${S.filter === c ? ' on' : ''}" data-f="${c}" aria-pressed="${S.filter === c}">${c === 'all' ? '' : svg(c === 'parks' ? 'parks' : c)}<span>${esc(pt(c === 'all' ? 'all' : 'cat.' + c))}</span><em>${n(c)}</em></button>`).join('');
  }
  $('#panoChips', app).addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    S.filter = b.dataset.f;
    if (S.sel && !visibleCat(S.sel)) closeCard();
    renderChips(); applyFilter(); renderList();
    b.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  });
  const visibleCat = p => p.proj || S.filter === 'all' || p.cat === S.filter;
  function applyFilter() {
    for (const { p, el } of pinEls.values()) el.classList.toggle('off', !visibleCat(p));
    radar.querySelectorAll('[data-id]').forEach(g => g.classList.toggle('off', !visibleCat(POIS.find(p => p.id === g.dataset.id))));
    S.dirty = true;
  }

  // ---------- radar (north-up, rings 500 m / 1 / 2 / 5 km, view cone follows the heading)
  function lakePath() {
    // data.js LAKE.shore is world x,z → bearing/distance from the eye → radar polar
    return LAKE.shore.map(([x, z], i) => {
      const dx = x - PANO_EYE[0], dz = z - PANO_EYE[2];
      const [px, py] = polar(bearingOf(dx, dz), radarR(Math.hypot(dx, dz)));
      return `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
    }).join('') + 'Z';
  }
  function renderRadar() {
    const U = CARD[lang] || CARD.en;
    const ringLbl = d => d < 1000 ? `${d} ${U.m}` : `${d / 1000} ${U.km}`;
    let h = `<defs><radialGradient id="prg" r="1"><stop offset="0" stop-color="#1b1712"/><stop offset="1" stop-color="#0b0a08"/></radialGradient>
      <radialGradient id="pcone" cx="0" cy="0" r="97" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e6cc92" stop-opacity=".42"/><stop offset=".7" stop-color="#e6cc92" stop-opacity=".12"/><stop offset="1" stop-color="#e6cc92" stop-opacity="0"/></radialGradient>
      <clipPath id="prc"><circle r="97"/></clipPath></defs>
      <circle r="98" fill="url(#prg)" class="pr-bg"/>
      <path class="pr-lake" clip-path="url(#prc)" d="${lakePath()}"/>`;
    for (const d of RINGS) h += `<circle class="pr-ring" r="${radarR(d)}"/>`;
    for (let a = 0; a < 360; a += 30) { const [x1, y1] = polar(a, 91), [x2, y2] = polar(a, a % 90 ? 95 : 98); h += `<line class="pr-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }
    // ring labels on the NNW radius (the quietest sector around the project)
    for (const d of RINGS) { const [x, y] = polar(338, radarR(d)); h += `<text class="pr-rl" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${esc(ringLbl(d))}</text>`; }
    h += `<path class="pr-cone" d=""/>`;
    for (const p of POIS) {
      if (p.onSite) continue;
      const r = radarR(p.dist), [x, y] = polar(p.bearing, r);
      h += `<g class="pr-poi is-${p.mode}${p.dist > 5000 ? ' far' : ''}" data-id="${p.id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle class="pr-hit" r="7"/><circle class="pr-dot" r="${p.key ? 2.9 : 2.2}"/></g>`;
    }
    h += `<g class="pr-me"><circle r="5.5" class="pr-me-r"/><circle r="2.4" class="pr-me-d"/></g>`;
    h += `<text class="pr-n" x="0" y="-84">${esc(dirName(0, true))}</text>`;
    radar.innerHTML = h;
    applyFilter(); updateRadar();
  }
  let lastCone = '';
  function updateRadar() {
    const cone = radar.querySelector('.pr-cone'); if (!cone) return;
    const b = heading(), half = hfov() / 2 / RAD;
    const [x1, y1] = polar(b - half, 97), [x2, y2] = polar(b + half, 97);
    const d = `M0 0L${x1.toFixed(1)} ${y1.toFixed(1)}A97 97 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z`;
    if (d !== lastCone) { cone.setAttribute('d', d); lastCone = d; }
  }
  radar.addEventListener('click', e => {
    const g = e.target.closest('[data-id]'); if (!g) return;
    select(POIS.find(p => p.id === g.dataset.id), true);
  });

  // ---------- list below the stage
  function renderList() {
    const list = POIS.filter(visibleCat).slice().sort((a, b) => a.dist - b.dist);
    const LIM = 12, show = S.listAll ? list : list.slice(0, LIM);
    $('#panoList', app).innerHTML = show.map(p => `<button type="button" class="pl-row is-${p.mode}${S.sel === p ? ' on' : ''}" data-id="${p.id}">
      <i class="pl-ic">${svg(iconOf(p))}</i><span class="pl-tx"><b dir="auto">${esc(nameOf(p))}</b><small>${esc(pt('k.' + p.kind))}${p.line ? ` · <span dir="ltr">${esc(p.line)}</span>` : ''}</small></span>
      <span class="pl-d"><b>${fmtDist(p.dist)}</b><small>${p.onSite ? '' : p.mode === 'walk' ? svg('walk', 'pm-ic') + fmtMin(p.walk) : svg('car', 'pm-ic') + fmtMin(p.drive)}</small></span></button>`).join('');
    const more = $('#panoMore', app);
    more.hidden = list.length <= LIM;
    more.textContent = S.listAll ? pt('less') : pt('more', { n: list.length });
  }
  $('#panoMore', app).addEventListener('click', () => { S.listAll = !S.listAll; renderList(); });
  $('#panoList', app).addEventListener('click', e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const p = POIS.find(q => q.id === b.dataset.id);
    select(p, true);
    const r = stage.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  });

  // ---------- detail card
  function select(p, fly) {
    if (!p) return;
    S.sel = p; stopAuto();
    openCard(p, true);
    if (fly && !p.onSite) flyTo(p);
    for (const v of pinEls.values()) v.el.classList.toggle('sel', v.p === p);
    radar.querySelectorAll('[data-id]').forEach(g => g.classList.toggle('sel', g.dataset.id === p.id));
    $('#panoList', app).querySelectorAll('[data-id]').forEach(b => b.classList.toggle('on', b.dataset.id === p.id));
    S.dirty = true;
  }
  function openCard(p, focus) {
    const walkOK = p.dist <= 3000 && !p.onSite;
    const b = Math.round(p.bearing);
    card.className = `pano-card is-${p.mode}`;
    card.innerHTML = `
      <button type="button" class="pc-x" data-act="close" aria-label="${esc(pt('close'))}">${svg('close')}</button>
      <p class="pc-cat">${svg(iconOf(p))}<span>${esc(pt('cat.' + p.cat))}</span></p>
      <h3 class="pc-title" dir="auto">${esc(nameOf(p))}</h3>
      <p class="pc-kind">${esc(pt('k.' + p.kind))}${p.line ? ` · <span dir="ltr">${esc(p.line)}</span>` : ''}</p>
      <dl class="pc-stats">
        <div><dt>${esc(pt('straight'))}</dt><dd>${fmtDist(p.dist)}</dd></div>
        ${p.onSite ? '' : `<div class="${p.mode === 'walk' ? 'hl' : ''}"><dt>${svg('walk', 'pm-ic')}${esc(pt('walk'))}</dt><dd>≈ ${fmtMin(p.walk)}</dd></div>
        <div class="${p.mode === 'drive' ? 'hl' : ''}"><dt>${svg('car', 'pm-ic')}${esc(pt('drive'))}</dt><dd>≈ ${fmtMin(p.drive)}</dd></div>
        <div><dt>${esc(pt('bearing'))}</dt><dd class="dd-dir">${esc(dirName(b))} · <span dir="ltr">${b}°</span></dd></div>`}
      </dl>
      ${p.onSite ? `<p class="pc-onsite">${esc(pt('onsiteNote'))}</p>` : `<div class="pc-acts">
        ${walkOK ? `<a class="btn ${p.mode === 'walk' ? 'primary' : 'gold-outline'} sm" href="${mapsDir(p, 'walk')}" target="_blank" rel="noopener">${svg('walk')}<span>${esc(pt('routeWalk'))}</span></a>` : ''}
        <a class="btn ${p.mode === 'drive' ? 'primary' : 'gold-outline'} sm" href="${mapsDir(p, 'drive')}" target="_blank" rel="noopener">${svg('car')}<span>${esc(pt('routeDrive'))}</span></a>
        <a class="btn link pc-open" href="${mapsOpen(p)}" target="_blank" rel="noopener">${svg('pin')}<span>${esc(pt('open'))}</span></a>
      </div>`}
      <p class="pc-fine">${esc(pt('fine'))}</p>`;
    card.hidden = false;
    stage.classList.add('has-card');
    if (focus && !coarse) requestAnimationFrame(() => card.querySelector('.pc-x')?.focus({ preventScroll: true }));
  }
  function closeCard() {
    card.hidden = true; stage.classList.remove('has-card');
    S.sel = null;
    for (const v of pinEls.values()) v.el.classList.remove('sel');
    radar.querySelectorAll('.sel').forEach(g => g.classList.remove('sel'));
    $('#panoList', app).querySelectorAll('.on').forEach(b => b.classList.remove('on'));
    S.dirty = true;
  }
  card.addEventListener('click', e => { if (e.target.closest('[data-act="close"]')) { closeCard(); stage.focus({ preventScroll: true }); } });
  pinsEl.addEventListener('click', e => {
    const b = e.target.closest('button.pp'); if (!b || S.dragMoved) return;
    select(POIS.find(p => p.id === b.dataset.id), true);
  });

  // ---------- camera state (works with or without WebGL: pins/radar still follow the heading)
  const hfov = () => S.hfov || (W && H && W / H < 1 ? 78 : 96) * RAD;
  function vfov() { const a = W / H || 1.6; return Math.min(100 * RAD, 2 * Math.atan(Math.tan(hfov() / 2) / a)); }
  function heading() { return ((bearingOf(-Math.sin(S.yaw), -Math.cos(S.yaw)) % 360) + 360) % 360; }
  function yawForBearing(b) { const [x, z] = dirOfBearing(b); return Math.atan2(-x, -z); }
  const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
  function flyTo(p) {
    const target = yawForBearing(p.bearing);
    const elev = -Math.atan2(PANO_EYE_H, Math.max(p.dist, 1));
    let pitchT = elev + 0.12;                                 // place slightly below centre → room for its label above
    const sheet = !card.hidden && W <= 760 ? card.offsetHeight : 0;
    if (sheet && H) {                                         // phone: the card is a bottom sheet → aim at ~62 % of the free band
      const yT = (H - sheet) * 0.62, ndc = (H / 2 - yT) / (H / 2);
      pitchT = elev - Math.atan(ndc * Math.tan(vfov() / 2));
    }
    pitchT = clampPitch(Math.max(-1.2, pitchT));
    S.anim = { t0: performance.now(), dur: reduced ? 1 : 950, y0: S.yaw, dy: wrapPi(target - S.yaw), p0: S.pitch, dp: pitchT - S.pitch };
    S.dirty = true; kick();
  }
  function stopAuto() { S.auto = false; S.lastUser = performance.now(); hint.classList.add('gone'); }
  S.yaw = yawForBearing(lsGet('vrc.panoBearing') ? +lsGet('vrc.panoBearing') : 205);   // first look: SSW, over the open side of the U towards Lacul Morii

  // ---------- input: drag / swipe, pinch, wheel, keys
  const ptrs = new Map(); let pinch0 = 0, fov0 = 0, drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.pano-card, .pano-tools, .pano-radar')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    S.dragMoved = false;
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch, moved: 0 };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = hfov(); drag = null; }
  });
  stage.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch0) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      setFov(fov0 * pinch0 / Math.max(20, d)); S.dragMoved = true; return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.moved > 6) {
      if (!S.dragMoved) { S.dragMoved = true; stage.setPointerCapture?.(e.pointerId); stage.classList.add('dragging'); stopAuto(); S.anim = null; }
      const k = hfov() / Math.max(1, W);
      S.yaw = drag.yaw + dx * k;
      S.pitch = clampPitch(drag.pitch + dy * k);
      S.dirty = true; kick();
    }
  });
  const endPtr = e => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = 0;
    if (!ptrs.size) { drag = null; stage.classList.remove('dragging'); setTimeout(() => { S.dragMoved = false; }, 0); lsSet('vrc.panoBearing', Math.round(heading())); }
  };
  stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', e => {
    if (e.target.closest('.pano-card')) return;
    if (!(S.full || e.ctrlKey || document.activeElement === stage || stage.matches(':hover'))) return;
    e.preventDefault(); stopAuto();
    setFov(hfov() * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)));
  }, { passive: false });
  stage.addEventListener('keydown', e => {
    const k = e.key, step = 6 * RAD;
    if (k === 'Escape') { if (S.sel) closeCard(); else if (S.full) toggleFull(false); return; }
    if (e.target !== stage) return;
    if (k === 'ArrowLeft') S.yaw += step; else if (k === 'ArrowRight') S.yaw -= step;
    else if (k === 'ArrowUp') S.pitch = clampPitch(S.pitch + step); else if (k === 'ArrowDown') S.pitch = clampPitch(S.pitch - step);
    else if (k === '+' || k === '=') setFov(hfov() / 1.15); else if (k === '-') setFov(hfov() * 1.15);
    else return;
    e.preventDefault(); stopAuto(); S.dirty = true; kick();
  });
  const clampPitch = p => Math.max(-1.45, Math.min(0.55, p));
  function setFov(f) { S.hfov = Math.max(26 * RAD, Math.min(115 * RAD, f)); S.dirty = true; kick(); }

  // ---------- tools
  app.querySelector('.pano-tools').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) { setMode(b.dataset.mode); return; }
    const a = b.dataset.act;
    if (a === 'zin') setFov(hfov() / 1.25);
    else if (a === 'zout') setFov(hfov() * 1.25);
    else if (a === 'full') toggleFull(!S.full);
    else if (a === 'gyro') toggleGyro();
    stopAuto();
  });
  function markMode() { app.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode))); }
  function setMode(m) { if (m === S.mode) return; S.mode = m; lsSet('vrc.panoMode', m); markMode(); if (gl) loadFaces(m); }
  markMode();

  // fullscreen: real Fullscreen API where it exists (not on iPhone Safari) → otherwise a fixed overlay
  function toggleFull(on) {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (on) {
      const req = app.requestFullscreen || app.webkitRequestFullscreen;
      if (req && !coarse) { try { const r = req.call(app); if (r?.catch) r.catch(() => pseudoFull(true)); } catch (err) { pseudoFull(true); } }
      else pseudoFull(true);
    } else {
      if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      pseudoFull(false);
    }
  }
  function pseudoFull(on) {
    app.classList.toggle('is-full', on); document.documentElement.classList.toggle('pano-open', on);
    setFull(on);
  }
  function setFull(on) {
    S.full = on; fullBtn.innerHTML = svg(on ? 'unfull' : 'full'); fullBtn.setAttribute('aria-label', pt(on ? 'exitFull' : 'full'));
    requestAnimationFrame(resize);
  }
  const onFs = () => { const on = (document.fullscreenElement || document.webkitFullscreenElement) === app; if (!on) app.classList.remove('is-full'); setFull(on || app.classList.contains('is-full')); };
  document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);

  // gyroscope: only after an explicit tap (iOS asks for DeviceOrientation permission inside that gesture)
  if (coarse && typeof window.DeviceOrientationEvent !== 'undefined') gyroBtn.hidden = false;
  let gyroH = null;
  async function toggleGyro() {
    if (S.gyro) { removeEventListener('deviceorientation', gyroH); S.gyro = null; gyroBtn.classList.remove('on'); gyroBtn.setAttribute('aria-label', pt('gyro')); return; }
    try {
      const DOE = window.DeviceOrientationEvent;
      if (typeof DOE.requestPermission === 'function') { const r = await DOE.requestPermission(); if (r !== 'granted') throw new Error('denied'); }
    } catch (err) { flash(pt('gyroDenied')); return; }
    S.gyro = { off: null };
    gyroH = ev => {
      if (ev.alpha == null) return;
      const { yaw, pitch } = orient(ev);
      if (S.gyro.off == null) S.gyro.off = S.yaw - yaw;
      S.yaw = yaw + S.gyro.off; S.pitch = clampPitch(pitch); S.anim = null; S.dirty = true; kick();
    };
    addEventListener('deviceorientation', gyroH);
    gyroBtn.classList.add('on'); gyroBtn.setAttribute('aria-label', pt('gyroOff'));
    setTimeout(() => { if (S.gyro && S.gyro.off == null) flash(pt('gyroNone')); }, 1500);
  }
  // DeviceOrientation (alpha, beta, gamma, screen angle) → camera yaw/pitch (same maths as three's old DeviceOrientationControls)
  function orient(ev) {
    const a = ev.alpha * RAD, b = ev.beta * RAD, g = ev.gamma * RAD;
    const o = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * RAD;
    // quaternion from Euler YXZ (b, a, -g), then -90° about X, then -o about Z
    const e = eulerToQuat(b, a, -g), qx = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], qz = [0, 0, Math.sin(-o / 2), Math.cos(-o / 2)];
    const q = qmul(qmul(e, qx), qz);
    const [x, y, z, w] = q;                          // forward = q · (0,0,-1)
    const fx = -(2 * (x * z + w * y)), fy = -(2 * (y * z - w * x)), fz = -(1 - 2 * (x * x + y * y));
    return { yaw: Math.atan2(-fx, -fz), pitch: Math.asin(Math.max(-1, Math.min(1, fy))) };
  }
  function eulerToQuat(x, y, z) { // order YXZ
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
  }
  function qmul([ax, ay, az, aw], [bx, by, bz, bw]) {
    return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
  }
  let flashT = 0;
  function flash(msg) {
    hint.classList.remove('gone'); hint.querySelector('span').textContent = msg; hint.classList.add('msg');
    clearTimeout(flashT); flashT = setTimeout(() => { hint.classList.add('gone'); hint.classList.remove('msg'); }, 2600);
  }

  // ---------- pin projection + label layout (screen-space greedy, no overlaps)
  function dirFor(p) {
    if (p.proj) { const [x, y, z] = p.world; return norm([x - PANO_EYE[0], y - PANO_EYE[1], z - PANO_EYE[2]]); }
    const [dx, dz] = dirOfBearing(p.bearing);
    return norm([dx * p.dist, -PANO_EYE_H, dz * p.dist]);
  }
  function dirAt(b, d) { const [dx, dz] = dirOfBearing(b); return norm([dx * d, -PANO_EYE_H, dz * d]); }
  const norm = ([x, y, z]) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const STEM0 = 20;
  function project(d) {
    // camera basis from yaw/pitch (Euler YXZ): forward f, right r, up u
    const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
    const f = [-sy * cp, sp, -cy * cp], r = [cy, 0, -sy], u = [sy * sp, cp, cy * sp];
    const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]; if (z <= 0.05) return null;
    const x = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z, y = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z;
    const tx = Math.tan(hfov() / 2), ty = Math.tan(vfov() / 2);
    return [W / 2 + x / tx * W / 2, H / 2 - y / ty * H / 2];
  }
  function layout() {
    const placed = [];
    const top = 52, bottom = H - 8;
    // keep clear of overlays: tools (inline-end top), radar (bottom corner), open card
    const blocks = [];
    const sr = stage.getBoundingClientRect();
    for (const sel of ['.pano-tools', '.pano-radar', '.pano-card:not([hidden])']) {
      const el = stage.querySelector(sel); if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect(); blocks.push({ x: r.left - sr.left - 4, y: r.top - sr.top - 4, w: r.width + 8, h: r.height + 8 });
    }
    const hit = (a) => blocks.some(b => ov(a, b)) || placed.some(b => ov(a, b));
    const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const vis = [];
    for (const v of pinEls.values()) {
      if (!visibleCat(v.p)) { v.el.style.visibility = 'hidden'; continue; }
      v.dir = v.dir || dirFor(v.p);
      const s = project(v.dir);
      if (!s || s[0] < -30 || s[0] > W + 30 || s[1] < top - 10 || s[1] > bottom + 30) { v.el.style.visibility = 'hidden'; continue; }
      if (!v.w) { v.w = v.cardEl.offsetWidth || 150; v.h = v.cardEl.offsetHeight || 44; }
      vis.push([v, s]);
    }
    // every visible anchor dot is an obstacle, so no label ever covers another place's dot
    for (const [, [x, y]] of vis) placed.push({ x: x - 9, y: y - 9, w: 18, h: 18 });
    // ring tags: prefer the inline-start side of the view (the radar owns the inline-end corner), else the other side,
    // else the centre; never under an overlay, a label or a place's dot
    const side = (app.dir === 'rtl' ? 1 : -1) * hfov() / RAD * 0.3;
    for (const g of ringTags) {
      let done = false;
      for (const off of gl ? [side, -side, side * 0.5, -side * 0.5, 0] : []) {
        const s = project(dirAt(heading() + off, g.r));
        if (!s || s[1] < top + 20 || s[1] > bottom - 16 || s[0] < 40 || s[0] > W - 40) continue;
        const r = { x: s[0] - 32, y: s[1] - 12, w: 64, h: 24 };
        if (hit(r)) continue;
        placed.push(r); g.el.style.visibility = 'visible'; done = true;
        g.el.style.transform = `translate3d(${s[0].toFixed(1)}px,${s[1].toFixed(1)}px,0) translate(-50%,-50%)`;
        break;
      }
      if (!done) g.el.style.visibility = 'hidden';
    }
    const rank = v => (v.p === S.sel ? -1e9 : 0) + (v.p.proj ? -1e8 : 0) + (v.p.key ? -1e6 : 0) + (v.p.dist || 0);
    vis.sort((a, b) => rank(a[0]) - rank(b[0]));
    for (const [v, [x, y]] of vis) {
      // candidate slots: stems growing by one label height, and at each height the card centred or slid sideways
      // (it always keeps the stem under its own width) — dense, overlap-free stacking above the horizon
      let ok = null;
      const shift = Math.max(0, v.w / 2 - 16), xs = [0, -shift, shift];
      for (let st = STEM0; !ok && y - st - v.h >= top; st += v.h + 7) {
        for (const off of xs) {
          let cx = x - v.w / 2 + off; cx = Math.max(6, Math.min(W - 6 - v.w, cx));
          const r = { x: cx - 3, y: y - st - v.h - 3, w: v.w + 6, h: v.h + 6 };
          if (!hit(r)) { ok = { st, dx: cx - (x - v.w / 2) }; placed.push(r); break; }
        }
      }
      const el = v.el;
      el.style.visibility = 'visible';
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      if (ok) { el.classList.remove('mini'); el.style.setProperty('--stem', ok.st + 'px'); el.style.setProperty('--dx', ok.dx.toFixed(1) + 'px'); }
      else el.classList.add('mini');
    }
  }
  function updateCompass() {
    const b = heading();
    strip.style.transform = `translate3d(${(-(b + 180) * PXD).toFixed(1)}px,0,0)`;
    degEl.textContent = `${Math.round(b) % 360}° ${dirName(b, true)}`;
  }

  // ---------- frame loop (renders only when something changed; sleeps off-screen)
  let raf = 0, lastT = 0, onScreen = false;
  function kick() { if (!raf && onScreen && !document.hidden) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    let moving = false;
    if (S.anim) {
      const a = S.anim, k = Math.min(1, (now - a.t0) / a.dur), e = k < .5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      S.yaw = a.y0 + a.dy * e; S.pitch = a.p0 + a.dp * e; S.dirty = true; moving = true;
      if (k >= 1) S.anim = null;
    } else if (S.auto && gl && !S.gyro) {
      S.yaw -= dt * 0.045; S.dirty = true; moving = true;
    } else if (!S.auto && !reduced && !S.sel && !S.gyro && !S.full && gl && now - S.lastUser > 30000 && !ptrs.size) S.auto = true;
    if (S.dirty) {
      S.dirty = false;
      if (gl) renderGL();
      layout(); updateCompass(); updateRadar();
    }
    if (moving || S.gyro || S.dirty) kick();
  }
  function renderGL() {
    const { camera, renderer, scene } = gl;
    const vf = vfov() / RAD;
    if (Math.abs(camera.fov - vf) > 1e-4 || camera.aspect !== W / H) { camera.fov = vf; camera.aspect = W / H; camera.updateProjectionMatrix(); }
    camera.rotation.set(S.pitch, S.yaw, 0, 'YXZ');
    renderer.render(scene, camera);
  }
  function resize() {
    const r = stage.getBoundingClientRect(); W = Math.round(r.width); H = Math.round(r.height);
    if (gl) gl.renderer.setSize(W, H, false);
    S.dirty = true; kick();
  }
  new ResizeObserver(resize).observe(stage);
  document.addEventListener('visibilitychange', kick);

  // ---------- WebGL (lazy)
  let started = false;
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (e.target === stage) { onScreen = e.isIntersecting; if (onScreen) { resize(); kick(); } }
    }
    if (!started && es.some(e => e.isIntersecting)) { started = true; initGL(); }
  }, { rootMargin: '500px 0px' });
  io.observe(stage);

  async function initGL() {
    try {
      const THREE = await import('three');
      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
      if (!renderer.getContext()) throw new Error('no webgl');
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.className = 'pano-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      $('.pano-gl', app).appendChild(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0a08);
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      const faces = {};
      const cap = new THREE.PerspectiveCamera(90, 1, 0.1, 10);
      for (const f of PANO_FACES) {
        const m = new THREE.MeshBasicMaterial({ color: 0x111111, depthWrite: false, depthTest: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.004, 2.004), m);
        cap.up.set(...f.up); cap.position.set(0, 0, 0); cap.lookAt(...f.dir);
        mesh.quaternion.copy(cap.quaternion);
        mesh.position.set(f.dir[0], f.dir[1], f.dir[2]);
        scene.add(mesh); faces[f.id] = mesh;
      }
      buildGroundRings(THREE, scene);
      gl = { THREE, renderer, scene, camera, faces, loadSeq: 0, maxAniso: renderer.capabilities.getMaxAnisotropy() };
      resize();
      await loadFaces(S.mode);
      veil.classList.add('gone');
      setTimeout(() => { if (!hint.classList.contains('msg')) hint.classList.add('gone'); }, 7000);
      S.dirty = true; kick();
    } catch (err) {
      console.warn('[panorama] WebGL view unavailable:', err?.message || err);
      stage.classList.add('no-gl');
      veil.querySelector('.pv-t').textContent = pt('fail');
      veil.classList.add('fail');
      S.dirty = true; kick();
    }
  }
  // Distance rings painted on the (flat) ground around the eye: a ground-plane band of world width ∝ radius, every vertex
  // pushed onto a sphere inside the cube (r = 0.9) so it overlays the panorama at exactly the right place; dashed + glow.
  function buildGroundRings(THREE, scene) {
    const SEG = 240;
    for (const g of GROUND_RINGS) {
      const col = new THREE.Color(g.c === 'walk' ? 0x6fd8cf : 0xe6cc92);
      for (const [wk, op, dash] of [[0.045, 0.10, false], [0.011, g.c === 'walk' ? 0.85 : 0.6, true]]) {
        const pos = [], idx = []; const w = g.r * wk;
        for (let i = 0; i < SEG; i++) {
          if (dash && i % 3 === 2) continue;                    // 2 on, 1 off
          const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2, base = pos.length / 3;
          for (const [a, rr] of [[a0, g.r - w / 2], [a0, g.r + w / 2], [a1, g.r - w / 2], [a1, g.r + w / 2]]) {
            const [x, y, z] = norm([Math.sin(a) * rr, -PANO_EYE_H, -Math.cos(a) * rr]);
            pos.push(x * 0.9, y * 0.9, z * 0.9);
          }
          idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
        const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 2; mesh.frustumCulled = false; scene.add(mesh);
      }
    }
  }
  function faceSize() {
    const px = Math.max(W, H) * Math.min(devicePixelRatio || 1, 2);
    return px > 1100 && !coarse ? 1536 : 1024;
  }
  function loadFaces(mode) {
    const { THREE, faces } = gl, seq = ++gl.loadSeq, size = faceSize();
    const loader = new THREE.TextureLoader();
    const bar = veil.querySelector('.pv-bar i');
    let n = 0;
    stage.classList.add('loading');
    return Promise.all(PANO_FACES.map(f => new Promise((res, rej) => {
      loader.load(`assets/panorama/${mode}-${size}/${f.id}.jpg`, tex => {
        n++; bar.style.transform = `scaleX(${n / 6})`;
        if (seq !== gl.loadSeq) { tex.dispose(); return res(); }
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, gl.maxAniso);
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
        f._tex = tex; res();
      }, undefined, () => rej(new Error('face ' + f.id)));
    }))).then(() => {
      if (seq !== gl.loadSeq) return;
      for (const f of PANO_FACES) {
        const m = faces[f.id].material; const old = m.map;
        m.map = f._tex; m.color.set(0xffffff); m.needsUpdate = true; if (old) old.dispose(); f._tex = null;
      }
      stage.classList.remove('loading');
      S.dirty = true; kick();
    });
  }

  // ---------- go
  renderText();
  onLangChange(() => renderText());
  requestAnimationFrame(() => { resize(); });
}
