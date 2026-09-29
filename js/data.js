// VILNYI RIVER CITY — single source of truth for project, apartment types, floor geometry and units.
// Units: metres. Building-local frame: x along the main bar, z across it, y up. Compass: see COMPASS (world −z ≈ WNW, +x ≈ NNE).
// All other modules read from here; nothing else invents geometry or prices.

export const PROJECT = {
  name: 'VILNYI RIVER CITY',
  tagline: { he: 'יותר מבית. סטנדרט גבוה יותר.', en: 'More than a home. A higher standard.', ru: 'Больше, чем дом. Выше стандарт.' },
  address: 'Str. Murelor nr. 1C, Sector 6, București, România',
  permit: { number: '252', date: '15.07.2025', issuer: 'Primăria Sectorului 6 — Arhitect Șef', applicant: 'S.C. SIMART ARHITECTURE S.A.', designer: 'S.C. VEGO DESIGN EXPERTISE S.R.L.', cadastral: '243614', totalApartments: 538, parkingPlaces: 662, regime: 'S+P+9E+Et.10 duplex', pot: '14.65%', cut: '1.38' },
  phase: 'Phase III of IV — buildings C3 & C4 (phases I–II delivered and occupied)',
  deliveryMonths: 32,
  partner: { name: 'VILNYI', role: { he: 'בעלת העסקה ושותפה בכירה בפרויקט', en: 'Deal owner and senior partner in the project', ro: 'Deținătorul tranzacției și partener principal în proiect', ru: 'Владелец сделки и старший партнёр проекта' } },
  currency: 'EUR',
  // Commercial terms as stated by the marketer. Edit here — the whole site follows.
  terms: {
    reservationDeposit: 5000,          // € — credited to the first instalment
    plans: [
      { id: 'standard', split: [60, 40], label: { he: 'סטנדרט 60/40', en: 'Standard 60/40', ru: 'Стандарт 60/40' },
        desc: { he: '60% במעמד החתימה (כולל המקדמה), 40% במסירה.', en: '60% at signing (deposit included), 40% on delivery.', ru: '60% при подписании (включая задаток), 40% при сдаче.' } },
      { id: 'mortgage', split: [60, 40], mortgage: 70, label: { he: '60/40 + משכנתא רומנית', en: '60/40 + Romanian mortgage', ru: '60/40 + румынская ипотека' },
        desc: { he: '60% בחתימה; במסירה החברה מסדרת משכנתא של עד 70% מבנק רומני (בכפוף לאישור הבנק) לפירעון היתרה ומחזור.', en: '60% at signing; on delivery the company arranges up to 70% financing from a Romanian bank (subject to bank approval) to settle the balance and refinance.', ru: '60% при подписании; при сдаче компания организует ипотеку до 70% в румынском банке (при одобрении банка).' } },
      { id: 'zero', split: [0, 100], label: { he: 'מסלול "0 הון עצמי"', en: '"Zero equity" track', ru: 'Программа «0 собственных средств»' },
        desc: { he: 'הלוואת בלון ישראלית על מלוא המחיר; החברה משלמת את הריבית 3 שנים עד המסירה, ואז משכנתא רומנית של 70–80% סוגרת את הבלון. בתרחיש הגרוע — עד כ‑15,000 € מהבית. בכפוף לאישור המלווים.', en: 'Israeli balloon loan on the full price; the company pays the interest for 3 years until delivery, then a 70–80% Romanian mortgage closes the balloon. Worst case the buyer adds up to ~€15,000. Subject to lender approval.', ru: 'Израильский кредит «баллон» на всю сумму; компания платит проценты 3 года до сдачи, затем румынская ипотека 70–80% закрывает кредит. В худшем случае — до ~15 000 € своих. При одобрении кредиторов.' } },
    ],
    rentGuarantee: { years: 3, minYield: 6 },   // % per year, first 3 years after delivery, per contract
    marketRent2c: 750,                          // €/month, as stated
    contract: { he: 'חוזה הרכישה נחתם בישראל וכולל ייפוי כוח לעורך הדין של החברה, המטפל ברישום ברומניה.', en: 'The purchase contract is signed in Israel and includes a power of attorney to the company’s lawyer, who handles registration in Romania.', ru: 'Договор подписывается в Израиле и включает доверенность юристу компании для регистрации в Румынии.' },
  },
  // PLACEHOLDERS — replace with the real account before going live. The site shows a warning while these are empty.
  bank: { beneficiary: '', iban: '', bic: '', bank: '', address: '' },
  payments: { stripePaymentLink: '' },           // e.g. https://buy.stripe.com/xxxx — enables "Pay deposit by card"
  leadsEndpoint: 'https://api.web3forms.com/submit',
  leadsKey: '5d364ce6-3da2-4d17-9a79-405669f5bc9a',                                  // Web3Forms access key (public by design; only allows sending to the owner's email)                             // optional POST URL (Formspree / Google Apps Script / Netlify function)
  contact: { whatsapp: '', email: '', phone: '' },
};

// ---------- Levels ----------
export const LEVELS = { parkingY: -3.4, groundY: 0, groundH: 3.3, typicalH: 3.0, ceiling: 2.7, slab: 0.3 };
export function floorY(floor) {           // floor: -1 parking, 0 = Parter, 1..10, 11 = 10D (duplex upper)
  if (floor === -1) return LEVELS.parkingY;
  if (floor === 0) return 0;
  return LEVELS.groundH + (floor - 1) * LEVELS.typicalH;
}
export const TOP_FLOOR = 10;              // lifts serve -1, 0..10
export const ROOF_Y = floorY(11) + LEVELS.typicalH; // top of 10D

// ---------- Apartment types (room areas from the developer's plans; types marked est:true are estimates) ----------
// kind: living | kitchen | hall | bedroom | bath | storage | dressing | balcony | loggia | terrace
// level: 0 = main level, 1 = duplex upper level
const R = (kind, name, area, level = 0) => ({ kind, name, area, level });
export const TYPES = {
  '1A': { rooms: 1, label: '1 cameră · Tip 4A', util: 33.31, outdoor: 4.43, total: 37.74, built: 45.92, outdoorKind: 'balcony',
    list: [R('living', 'Living + kitchenette', 18.04), R('kitchen', 'Bucătărie', 7.74), R('hall', 'Hol', 2.99), R('bath', 'Baie', 4.54), R('balcony', 'Balcon', 4.43)] },
  '2A': { rooms: 2, label: '2 camere · Tip 2 (C3)', util: 52.79, outdoor: 5.0, total: 57.79, built: 70.03, outdoorKind: 'balcony',
    list: [R('hall', 'Hol', 4.98), R('kitchen', 'Bucătărie', 8.51), R('bath', 'Baie', 4.31), R('living', 'Living', 23.25), R('bedroom', 'Dormitor', 11.74), R('balcony', 'Balcon', 5.0)] },
  '2B': { rooms: 2, label: '2 camere · Tip 3.2', util: 50.01, outdoor: 8.86, total: 58.87, built: 72.15, outdoorKind: 'loggia',
    list: [R('hall', 'Hol', 5.74), R('kitchen', 'Bucătărie', 9.28), R('bath', 'Baie', 4.31), R('living', 'Living', 17.56), R('bedroom', 'Dormitor', 13.12), R('loggia', 'Logie', 8.86)] },
  '2C': { rooms: 2, label: '2 camere · Tip 2', util: 53.91, outdoor: 4.62, total: 58.53, built: 65.04, outdoorKind: 'balcony',
    list: [R('hall', 'Hol', 5.33), R('living', 'Living', 23.36), R('kitchen', 'Bucătărie', 8.62), R('bedroom', 'Dormitor', 12.08), R('bath', 'Baie', 4.52), R('balcony', 'Balcon', 4.62)] },
  '2D': { rooms: 2, label: '2 camere · Tip 7B.1', util: 54.09, outdoor: 11.69, total: 65.78, built: 67.0, outdoorKind: 'loggia',
    list: [R('hall', 'Hol', 6.23), R('living', 'Living', 18.75), R('kitchen', 'Bucătărie', 9.11), R('bedroom', 'Dormitor', 15.44), R('bath', 'Baie', 4.56), R('loggia', 'Logie', 11.69)] },
  '2E': { rooms: 2, label: '2 camere · Tip 9B', util: 53.10, outdoor: 7.97, total: 61.07, built: 66.25, outdoorKind: 'loggia',
    list: [R('hall', 'Hol', 5.9), R('living', 'Living', 18.09), R('kitchen', 'Bucătărie', 9.35), R('bedroom', 'Dormitor', 13.76), R('bath', 'Baie', 4.85), R('storage', 'Depozitare', 1.15), R('loggia', 'Logie', 7.97)] },
  '2F': { rooms: 2, label: '2 camere · Ap.1 (C3 Sc.3)', util: 53.26, outdoor: 7.38, total: 60.64, built: 74.46, outdoorKind: 'balcony',
    list: [R('living', 'Living', 21.06), R('kitchen', 'Bucătărie', 9.21), R('hall', 'Hol', 5.64), R('bedroom', 'Dormitor', 12.79), R('bath', 'Baie', 4.56), R('balcony', 'Balcon', 7.38)] },
  '3A': { rooms: 3, label: '3 camere · Ap.5 (C3 Sc.3)', util: 61.85, outdoor: 21.14, total: 82.99, built: 133.92, outdoorKind: 'balcony',
    list: [R('living', 'Living', 28.22), R('kitchen', 'Bucătărie', 10.1), R('hall', 'Hol', 8.71), R('bedroom', 'Dormitor 1', 11.45), R('bedroom', 'Dormitor 2', 13.93), R('bath', 'Baie', 3.37), R('balcony', 'Balcon', 21.14)] },
  // Floor 10 + 10D duplex penthouses
  'D2': { rooms: 2, duplex: true, est: true, label: '2 camere duplex · Et.10/10D', util: 57.5, outdoor: 19.97, total: 77.47, built: 88.0, outdoorKind: 'terrace',
    list: [R('living', 'Living', 18.09), R('kitchen', 'Bucătărie', 9.35), R('hall', 'Hol', 5.9), R('storage', 'Depozitare', 1.15), R('terrace', 'Terasă', 12.0), R('bedroom', 'Dormitor', 13.76, 1), R('bath', 'Baie', 4.85, 1), R('hall', 'Hol etaj', 4.4, 1), R('loggia', 'Logie', 7.97, 1)] },
  'D3': { rooms: 3, duplex: true, label: '3 camere duplex · Tip 10B', util: 82.79, outdoor: 26.68, total: 109.47, built: 101.43, outdoorKind: 'terrace',
    list: [R('living', 'Living', 28.79), R('kitchen', 'Bucătărie', 10.7), R('hall', 'Hol', 8.64), R('bath', 'Baie oaspeți', 3.34), R('terrace', 'Terasă', 18.59), R('hall', 'Hol etaj', 1.75, 1), R('bedroom', 'Dormitor 1', 12.88, 1), R('bedroom', 'Dormitor 2', 12.12, 1), R('bath', 'Baie', 4.57, 1), R('loggia', 'Logie', 8.09, 1)] },
  'D4': { rooms: 4, duplex: true, est: true, label: '4 camere duplex · Penthouse', util: 106.3, outdoor: 31.5, total: 137.8, built: 128.0, outdoorKind: 'terrace',
    list: [R('living', 'Living', 31.5), R('kitchen', 'Bucătărie', 11.2), R('hall', 'Hol', 9.8), R('bath', 'Baie oaspeți', 3.6), R('terrace', 'Terasă', 24.0), R('hall', 'Hol etaj', 3.2, 1), R('bedroom', 'Dormitor master', 15.1, 1), R('bedroom', 'Dormitor 2', 12.4, 1), R('bedroom', 'Dormitor 3', 11.6, 1), R('bath', 'Baie', 5.2, 1), R('dressing', 'Dressing', 3.0, 1), R('loggia', 'Logie', 7.5, 1)] },
};
export const TWO_ROOM_VARIANTS = ['2A', '2B', '2C', '2D', '2E', '2F'];

// ---------- Building footprint (building-local) ----------
export const GEOM = {
  barLength: 84, depth: 17, corridorHalf: 1.1, unitDepth: 7.4,
  wing: { x0: 67, x1: 84, z0: -38, z1: -8.5, corridorX: 75.5 },
  balconyDepth: 1.6,
};
// Footprint polygon of one building (x,z), used for massing / roof / parking outline
export const FOOTPRINT = [[0, -8.5], [67, -8.5], [67, -38], [84, -38], [84, 8.5], [0, 8.5]];

// Corridors per typical floor (axis-aligned rects: x0,x1,z0,z1)
export const CORRIDORS = [
  { id: 'bar', x0: 0.6, x1: 76.6, z0: -1.1, z1: 1.1 },
  { id: 'wing', x0: 74.4, x1: 76.6, z0: -37.4, z1: 1.1 },
];

// Facade segments. U = unit width direction, V = corridor→facade (outward). (U, Y, V) is right-handed.
// origin(s) gives the corridor-side point at running distance s along the segment.
// The compass facing of each segment is derived from V and COMPASS (see below), not hard-coded:
// with the real site orientation S1 faces E (≈108°), S2 W (≈288°), S4 S (≈198°, towards Lacul Morii), S5 N (≈18°).
const SEGMENTS = {
  S1: { len: 84, o: s => [s, 1.1], U: [1, 0], V: [0, 1] },
  S2: { len: 67, o: s => [67 - s, -1.1], U: [-1, 0], V: [0, -1] },
  S4: { len: 29.5, o: s => [74.4, -38 + s], U: [0, 1], V: [-1, 0] },
  S5: { len: 36.9, o: s => [76.6, -1.1 - s], U: [0, -1], V: [1, 0] },
};
// Cores: stair + 2 lifts. Rect in building-local coords; liftDoor = point on corridor wall, liftNormal = direction into corridor.
export const CORES = [
  { stair: 1, x0: 17.6, x1: 25.6, z0: -8.5, z1: -1.1, liftDoors: [[20.1, -1.1], [23.1, -1.1]], liftNormal: [0, 1], entrance: [21.6, -8.5] },
  { stair: 3, x0: 41.4, x1: 49.4, z0: -8.5, z1: -1.1, liftDoors: [[43.9, -1.1], [46.9, -1.1]], liftNormal: [0, 1], entrance: [45.4, -8.5] },
  { stair: 2, x0: 67.0, x1: 74.4, z0: -8.5, z1: -1.1, liftDoors: [[69.2, -1.1], [72.2, -1.1]], liftNormal: [0, 1], entrance: [70.7, -8.5] },
];
// Which scară serves a building-local point
export function stairFor(x, z) { if (x > 60 || z < -8.5) return 2; return x < 33.5 ? 1 : 3; }

// Floor programmes: per segment an ordered list of 'type-class' tokens. '#core' = gap reserved for a core, 'X:<name>:<len>' = non-residential block.
const NOMINAL = { '1': 4.8, '2': 7.4, '3': 9.2, '4': 11.0 };
const PROGRAM = {
  typical: { S1: ['3', '2', '2', '2', '2', '2', '2', '2', '2', '2', '3'], S2: ['2', '1', '#core:8', '2', '2', '#core:8', '1', '2'], S4: ['2', '1', '2', '2'], S5: ['2', '2', '2', '2', '2'] },
  ground: { S1: ['1', '2', '2', '1', '2', 'X:amenity:44'], S2: ['X:parking:17.6', '#core:8', 'X:parking:15.8', '#core:8', 'X:storage:17.6'], S4: ['X:storage:29.5'], S5: ['1', '2', '2', '1'] },
  top: { S1: ['4', '3', '3', '3', '3', '3', '3', '3', '3', '3', '4'], S2: ['4', '3', '#core:8', '3', '3', '#core:8', '2', '3'], S4: ['4', '2', '3', '3'], S5: ['4', '3', '4', '3', '4'] },
};
// S2 order runs from x=67 toward x=0 (U = -x), so the lists above are read in that direction.
// Core gaps in S2 are positioned by the core rects, not by nominal length — see layoutSegment.

// ---------- Compass & geography (from the Google Maps satellite view + the permit site plan) ----------
// The world frame IS the building frame (rotY = 0 for both buildings, so walkthrough, commons and the shared basement
// stay axis-aligned), but the building grid is rotated against true north: the C3/C4 spine runs along the plot's
// north boundary and the arms point SSW towards Intrarea Guliver / Lacul Morii.
// COMPASS.negZ = true bearing (degrees clockwise from north) of the world −z axis; world +x points to negZ + 90 (≈ NNE).
export const COMPASS = { negZ: 288 };
export function bearingOf(dx, dz) { const b = Math.atan2(dx, -dz) * 180 / Math.PI + COMPASS.negZ; return ((b % 360) + 360) % 360; }
export function dirOfBearing(deg) { const a = (deg - COMPASS.negZ) * Math.PI / 180; return [Math.sin(a), -Math.cos(a)]; }
// Geographic frame for the surroundings: gx = metres east, gz = metres south (map north up), origin = the black X of the
// site sketch (screenshot px 554,960; ≈0.45 m per screenshot px, calibrated on Faza I and the house lots).
// GEO.anchor pins one geo point to one world point; the rotation follows COMPASS. C3+C4 (the comb of two bars pointing SSW
// with the wing "spine" along the north) stand on the X, ~20 m west of Faza I's open courtyard side.
const GEO = { anchorGeo: [-20.5, -16.9], anchorWorld: [42, -47] };
const GEO_A = (COMPASS.negZ - 360) * Math.PI / 180, GEO_C = Math.cos(GEO_A), GEO_S = Math.sin(GEO_A);
export function geoToWorld(gx, gz) {
  const dx = gx - GEO.anchorGeo[0], dz = gz - GEO.anchorGeo[1];
  return [GEO.anchorWorld[0] + dx * GEO_C + dz * GEO_S, GEO.anchorWorld[1] - dx * GEO_S + dz * GEO_C];
}
export function worldToGeo(x, z) {
  const dx = x - GEO.anchorWorld[0], dz = z - GEO.anchorWorld[1];
  return [GEO.anchorGeo[0] + dx * GEO_C - dz * GEO_S, GEO.anchorGeo[1] + dx * GEO_S + dz * GEO_C];
}

// ---------- Buildings in the site (world placement) ----------
// rotY stays 0: the world frame is the building frame and true north comes from COMPASS (bars run NNE–SSW, arms' ends
// face SSW towards Intrarea Guliver, the wings form the spine along the north). Unit azimuths are true bearings.
export const BUILDINGS = {
  C3: { id: 'C3', origin: [0, 0], rotY: 0, ground: 'amenity', label: 'Bloc C3' },
  C4: { id: 'C4', origin: [0, -64], rotY: 0, ground: 'kindergarten', label: 'Bloc C4' },
};
export function localToWorld(bId, x, z) {
  const b = BUILDINGS[bId]; const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
  return [b.origin[0] + x * c + z * s, b.origin[1] - x * s + z * c];
}
// The whole plot (traced from the sketch, geo metres): Str. Murelor on the west, the north street, the east street by
// the Aqua City pin, Str. Grigore H. Grandea / Intrarea Guliver on the south.
export const PLOT = [[-123,-162], [-69,-140], [-33,-112], [39,-79], [111,-52], [174,-25], [188,-17], [178,18], [151,63], [129,106], [117,119], [93,94], [57,86], [3,74], [-47,63], [-101,46], [-133,34], [-134,-27], [-130,-94]]
  .map(([gx, gz]) => geoToWorld(gx, gz).map(v => +v.toFixed(1)));
// Context (delivered phases, other blocks) as simple massing: footprint rect (world, axis-aligned with the buildings) + floors.
// Faza I "Aqua City" (delivered, east): U-shaped courtyard block, long bars facing SSW/NNE, open towards C3, P+12, beige.
// Faza III (west, towards Str. Murelor): two slender NNE bars joined by a spine at the north end, P+11, dark grey/brown.
// P: two-level parking deck along Intrarea Guliver in front of C3/C4 (the round spiral car ramp stands in front of the courtyard).
export const CONTEXT_BLOCKS = [
  { id: 'F1-S', x0: -2, x1: 15, z0: 30, z1: 132, floors: 13, delivered: true, phase: 'I', tone: 'beige' },
  { id: 'F1-N', x0: 67, x1: 84, z0: 30, z1: 132, floors: 13, delivered: true, phase: 'I', tone: 'beige' },
  { id: 'F1-E', x0: 15, x1: 67, z0: 115, z1: 132, floors: 13, delivered: true, phase: 'I', tone: 'beige' },
  { id: 'F3-A', x0: 10, x1: 94, z0: -127, z1: -114, floors: 12, phase: 'III', tone: 'dark' },
  { id: 'F3-B', x0: 18, x1: 94, z0: -152, z1: -139, floors: 12, phase: 'III', tone: 'dark' },
  { id: 'F3-N', x0: 94, x1: 107, z0: -152, z1: -114, floors: 12, phase: 'III', tone: 'dark' },
  { id: 'P', x0: -38, x1: -26, z0: -98, z1: 4, floors: 1, parking: true },
];
// Lacul Morii (lake + island park with fountain), world coords. The shore is a polygon traced from the map (its
// north-east corner lies ~120 m south of Str. Grandea, ~250 m SSW of the buildings); center/rx/rz is a world-axis ellipse
// approximation for schematics.
export const LAKE = (() => {
  const shoreGeo = [[6, 257], [-35, 247], [-139, 240], [-302, 245], [-487, 262], [-696, 290], [-905, 334], [-1102, 404], [-1299, 508],
    [-1461, 649], [-1554, 812], [-1543, 986], [-1427, 1137], [-1229, 1253], [-986, 1322], [-719, 1357], [-464, 1345], [-209, 1299],
    [0, 1206], [139, 1079], [203, 928], [174, 754], [116, 603], [72, 470], [35, 348], [16, 284]];
  const shore = shoreGeo.map(([gx, gz]) => geoToWorld(gx, gz).map(v => +v.toFixed(1)));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, cx = 0, cz = 0;
  for (const [x, z] of shore) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); cx += x; cz += z; }
  const r = (p, d = 0) => geoToWorld(...p).map(v => +v.toFixed(d));
  return {
    shore, center: [Math.round(cx / shore.length), Math.round(cz / shore.length)], rx: Math.round((x1 - x0) * 0.42), rz: Math.round((z1 - z0) * 0.42),
    island: { center: r([-499, 649]), r: 110 }, fountain: r([-197, 499]),
  };
})();

// ---------- Layout generation ----------
function variantFor(cls, seed) {
  if (cls === '2') return TWO_ROOM_VARIANTS[seed % TWO_ROOM_VARIANTS.length];
  if (cls === '1') return '1A';
  if (cls === '3') return '3A';
  return 'D4';
}
function topVariant(cls) { return cls === '2' ? 'D2' : cls === '3' ? 'D3' : 'D4'; }
// True compass bearing of a segment's outward facade normal (V) in a building, and the nearest N/E/S/W letter.
function segAzimuth(seg, bId) {
  const r = BUILDINGS[bId].rotY, [vx, vz] = seg.V;
  return bearingOf(vx * Math.cos(r) + vz * Math.sin(r), -vx * Math.sin(r) + vz * Math.cos(r));
}
const facingOf = az => 'NESW'[Math.round(az / 90) % 4];

function layoutSegment(segId, tokens, floor, bId, out, counter) {
  const seg = SEGMENTS[segId];
  // total nominal residential length vs available (fixed blocks keep their length)
  let fixed = 0, nominal = 0;
  for (const t of tokens) {
    if (t.startsWith('#core') || t.startsWith('X:')) fixed += parseFloat(t.split(':').pop());
    else nominal += NOMINAL[t];
  }
  // Core gaps must sit exactly on CORES rects: scale each run of units between cores to fit its own span.
  const coreSpans = segId === 'S2' ? CORES.filter(c => c.z1 <= -1.1 && c.x1 <= 67).map(c => [67 - c.x1, 67 - c.x0]).sort((a, b) => a[0] - b[0]) : [];
  const groups = [[]]; for (const t of tokens) { if (t.startsWith('#core')) groups.push([]); else groups[groups.length - 1].push(t); }
  const spanOf = gi => { const a = gi === 0 ? 0 : coreSpans[gi - 1][1]; const b = gi < coreSpans.length ? coreSpans[gi][0] : seg.len; return [a, b]; };
  const kOf = gi => { const g = groups[gi]; let fx = 0, nm = 0; for (const t of g) { if (t.startsWith('X:')) fx += parseFloat(t.split(':').pop()); else nm += NOMINAL[t]; } const [a, b] = coreSpans.length ? spanOf(gi) : [0, seg.len]; return nm ? (b - a - fx) / nm : 1; };
  let gi = 0, k = kOf(0);
  let s = 0;
  for (const t of tokens) {
    if (t.startsWith('#core')) { gi++; s = coreSpans.length ? spanOf(gi)[0] : s + parseFloat(t.split(':')[1]); k = kOf(gi); continue; }
    if (t.startsWith('X:')) {
      const [, name, len] = t.split(':'); const L = parseFloat(len);
      out.blocks.push({ seg: segId, kind: name === 'amenity' ? (BUILDINGS[bId].ground) : name, s0: s, s1: s + L, frame: frameOf(seg, s), width: L, depth: GEOM.unitDepth, floor, building: bId });
      s += L; continue;
    }
    const w = NOMINAL[t] * k;
    const n = counter.n++;
    const type = floor === TOP_FLOOR ? topVariant(t) : variantFor(t, n * 7 + floor * 3 + (bId === 'C4' ? 2 : 0));
    const fr = frameOf(seg, s);
    const cx = fr.o[0] + fr.U[0] * w / 2 + fr.V[0] * GEOM.unitDepth / 2, cz = fr.o[1] + fr.U[1] * w / 2 + fr.V[1] * GEOM.unitDepth / 2;
    const az = segAzimuth(seg, bId);
    const unit = {
      building: bId, floor, seg: segId, facing: facingOf(az), azimuth: Math.round(az),
      stair: stairFor(cx, cz), type, rooms: TYPES[type].rooms,
      frame: fr, width: +w.toFixed(3), depth: GEOM.unitDepth,
      door: { u: +(w * (t === '1' ? 0.3 : 0.22)).toFixed(3) }, // entrance door centre along U, on corridor wall (v=0)
      center: [cx, cz],
    };
    out.units.push(unit);
    s += w;
  }
}
function frameOf(seg, s) { return { o: seg.o(s), U: seg.U, V: seg.V }; }

function programFor(floor) { return floor === 0 ? PROGRAM.ground : floor === TOP_FLOOR ? PROGRAM.top : PROGRAM.typical; }

const FLOOR_FACTOR = f => 1;   // flat price per m² as instructed; add floor premiums here if wanted
const FACING_FACTOR = { N: 1, S: 1, E: 1, W: 1 };
export const PRICE_PER_M2 = 2500; // € per m² of total useful area (suprafață utilă totală, incl. balcony/loggia/terrace)

export const UNITS = [];
export const BLOCKS = [];      // non-residential ground-floor blocks
(function build() {
  for (const bId of Object.keys(BUILDINGS)) {
    let apNo = 1;
    for (let floor = 0; floor <= TOP_FLOOR; floor++) {
      const prog = programFor(floor); const out = { units: [], blocks: [] }; const counter = { n: 0 };
      for (const segId of ['S1', 'S2', 'S4', 'S5']) layoutSegment(segId, prog[segId], floor, bId, out, counter);
      out.units.forEach((u, i) => {
        u.index = i + 1; u.apNo = apNo++;
        u.id = `${bId}-${floor === 0 ? 'P' : floor}-${String(u.index).padStart(2, '0')}`;
        const T = TYPES[u.type];
        u.price = Math.round(T.total * PRICE_PER_M2 * FLOOR_FACTOR(floor) * FACING_FACTOR[u.facing]);
        u.status = 'available';
        UNITS.push(u);
      });
      BLOCKS.push(...out.blocks);
    }
  }
})();

export const unitById = id => UNITS.find(u => u.id === id);
export const unitsOn = (bId, floor) => UNITS.filter(u => u.building === bId && u.floor === floor);
export const blocksOn = (bId, floor) => BLOCKS.filter(b => b.building === bId && b.floor === floor);
export function unitLabel(u) { return `${u.building} · Sc.${u.stair} · ${u.floor === 0 ? 'Parter' : 'Et.' + u.floor}${u.floor === TOP_FLOOR ? '/10D' : ''} · Ap.${u.apNo}`; }
// Unit-local (u along width, v corridor→facade) → building-local (x,z)
export function unitToLocal(unit, uu, vv) { const f = unit.frame; return [f.o[0] + f.U[0] * uu + f.V[0] * vv, f.o[1] + f.U[1] * uu + f.V[1] * vv]; }
export function unitToWorld(unit, uu, vv) { const [x, z] = unitToLocal(unit, uu, vv); return localToWorld(unit.building, x, z); }
// Yaw (radians, three.js rotation.y) that maps unit-local axes (x=u, z=v) onto building-local axes
export function unitYaw(unit) { const [vx, vz] = unit.frame.V; return Math.atan2(vx, vz); }
export function money(n) { return '€' + Math.round(n).toLocaleString('en-US'); }
