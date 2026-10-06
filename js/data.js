// VILNYI RIVER CITY — single source of truth for project, apartment types, floor geometry and units.
// Units: metres. Building-local frame: x along the main bar, z across it, y up. Compass: see COMPASS (world −z ≈ WNW, +x ≈ NNE).
// All other modules read from here; nothing else invents geometry or prices (prices: see PRICING / priceOf below).

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
  contact: { whatsapp: '', email: 'sales@vilnyirivercity.com', phone: '' },
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

// ---------- Building geometry (building-local) ----------
// Traced from the permit CAD plans (Bloc C3 / C4, Plan Parter + Plan Etaj 10, 1:100) and the marketing floor plans:
// each block is ONE long double-loaded bar (≈128 m × 17 m, 3 stair/lift cores) with a perpendicular WING at its NNE end
// (the wing is as wide as the bar and sticks out 25 m on the courtyard side and 6 m on the street side). C3 and C4 are
// mirror images: C4 stands west, C3 east, and their wings point at each other and meet (0.3 m expansion joint), so the pair
// reads as a "U" open to the SSW — the continuous spine along the north street, the two bars running towards Intrarea Guliver.
// Cores sit on the OUTER side of each bar (C4: WNW, C3: ESE); the 1st core ≈19.5 m, the 3rd ≈60 m from the SSW end, the 2nd
// at the bar/wing junction.
//
// All geometry below is the CANONICAL block (= C4's own local frame): x runs along the bar from its SSW end (x = 0) to the
// NNE facade of the wing (x = 128); z is across it with the cores on −z and the long wing arm on +z. A building with
// `mirror: true` (C3) uses the same plan reflected z → −z: footprint / cores / corridors are reflected, every unit keeps a
// RIGHT-HANDED frame (its U axis is reversed, so a segment runs in the opposite direction) — no negative scales anywhere.
// Use footprintOf / coresOf / corridorsOf (true, per building); FOOTPRINT / CORES / CORRIDORS are the canonical copies.
const BAR_L = 128, HALF_D = 8.5, CORR = 1.1, WX0 = 111, WING_IN = 25, WING_OUT = 6;
const WZ0 = -HALF_D - WING_OUT, WZ1 = HALF_D + WING_IN;            // wing ends: −14.5 (street side), +33.5 (courtyard tip)
const WCX0 = WX0 + 7.4, WCX1 = WCX0 + 2 * CORR;                    // wing corridor x 118.4 … 120.6
export const GEOM = {
  barLength: BAR_L, depth: 2 * HALF_D, corridorHalf: CORR, unitDepth: 7.4,
  wing: { x0: WX0, x1: BAR_L, z0: WZ0, z1: WZ1, corridorX: (WCX0 + WCX1) / 2, cx0: WCX0, cx1: WCX1 },
  balconyDepth: 1.6,
};
// Footprint polygon (x,z), canonical
export const FOOTPRINT = [[0, -HALF_D], [WX0, -HALF_D], [WX0, WZ0], [BAR_L, WZ0], [BAR_L, WZ1], [WX0, WZ1], [WX0, HALF_D], [0, HALF_D]];

// Corridors per typical floor (axis-aligned rects: x0,x1,z0,z1), canonical
export const CORRIDORS = [
  { id: 'bar', x0: 0.6, x1: WCX1, z0: -CORR, z1: CORR },
  { id: 'wing', x0: WCX0, x1: WCX1, z0: WZ0 + 0.6, z1: WZ1 - 0.6 },
];

// Facade segments. U = unit width direction, V = corridor→facade (outward). (U, Y, V) is right-handed.
// origin(s) gives the corridor-side point at running distance s along the segment. Canonical frames:
//   S1 bar, non-core side (+z)            S2 bar, core side (−z; runs from the wing towards the SSW end)
//   S4 wing arm, SSW face (courtyard)     S5 wing, NNE face (whole length, tip → street end)
//   S6 wing stub beyond the core side, SSW face
// The true compass facing of every unit comes from its (mirrored) frame and COMPASS, never hard-coded.
const SEGMENTS = {
  S1: { len: WCX0, o: s => [s, CORR], U: [1, 0], V: [0, 1] },
  S2: { len: WX0, o: s => [WX0 - s, -CORR], U: [-1, 0], V: [0, -1] },
  S4: { len: WZ1 - HALF_D, o: s => [WCX0, HALF_D + s], U: [0, 1], V: [-1, 0] },
  S5: { len: WZ1 - WZ0, o: s => [WCX1, WZ1 - s], U: [0, -1], V: [1, 0] },
  S6: { len: WING_OUT, o: s => [WCX0, WZ0 + s], U: [0, 1], V: [-1, 0] },
};
const SEG_ORDER = ['S1', 'S2', 'S4', 'S5', 'S6'];
// Cores: stair + 2 lifts. Rect in building-local coords; liftDoor = point on corridor wall, liftNormal = direction into
// corridor; entrance = ground-floor lobby door on the facade; zOut = that facade line (core 2 opens through the wing stub).
export const CORES = [
  { stair: 1, x0: 15.5, x1: 23.5, z0: -HALF_D, z1: -CORR, liftDoors: [[18.0, -CORR], [21.0, -CORR]], liftNormal: [0, 1], entrance: [19.5, -HALF_D], zOut: -HALF_D },
  { stair: 3, x0: 56.0, x1: 64.0, z0: -HALF_D, z1: -CORR, liftDoors: [[58.5, -CORR], [61.5, -CORR]], liftNormal: [0, 1], entrance: [60.0, -HALF_D], zOut: -HALF_D },
  { stair: 2, x0: WX0, x1: WCX0, z0: -HALF_D, z1: -CORR, liftDoors: [[WX0 + 2.2, -CORR], [WX0 + 5.2, -CORR]], liftNormal: [0, 1], entrance: [(WX0 + WCX0) / 2, WZ0], zOut: WZ0 },
];
// Which scară serves a canonical building-local point (sign of z is irrelevant, so true coords of a mirrored block work too)
export function stairFor(x, z) { if (x > 87 || Math.abs(z) > HALF_D) return 2; return x < 40 ? 1 : 3; }

// Floor programmes (permit: parter 4×1c + 5×2c; floors 1–9 3×1c + 23×2c; floor 10 + 10D duplex 2×2c + 17×3c + 7×4c
// = 269 per block, 538 in all). Per segment an ordered list of 'type-class' tokens. '#core' = gap reserved for a core,
// 'X:<name>:<len>' = non-residential block. S2 is read from the wing towards the SSW end; its core gaps sit on the CORES rects.
const NOMINAL = { '1': 4.8, '2': 7.4, '3': 9.2, '4': 11.0 };
const PROGRAM = {
  typical: { S1: ['2', '2', '2', '2', '2', '2', '2', '2', '2', '2', 'X:stair:7.4'], S2: ['2', '2', '1', '2', '2', '#core:8', '2', '1', '2', '#core:8', '2'],
    S4: ['2', '2'], S5: ['2', '2', '2', '2'], S6: ['1'] },
  ground: { S1: ['X:amenity:44', 'X:parking:56', '2', 'X:stair:7.4'], S2: ['X:parking:47', '#core:8', 'X:parking:32.5', '#core:8', 'X:storage:15.5'],
    S4: ['1', '2'], S5: ['2', '1', '1', '2', '1', '2'], S6: ['X:lobby:6'] },
  top: { S1: ['4', '3', '3', '3', '3', '3', '3', '3', '3', '4', 'X:stair:7.4'], S2: ['4', '3', '3', '2', '3', '#core:8', '3', '2', '3', '#core:8', '4'],
    S4: ['3', '4'], S5: ['4', '3', '3', '4'], S6: ['3'] },
};

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
// rotY stays 0: the world frame is the building frame and true north comes from COMPASS (bars run NNE–SSW, their ends face
// SSW towards Intrarea Guliver, the two wings form the spine along the north street). Unit azimuths are true bearings.
// Placement (permit A.C. 252/2025 "Amplasament"): SSW ends 29.1 m from the south property limit (≈ 34 m from the Intrarea
// Guliver centre line, world x ≈ −47), the spine 11.5 m from the north limit (north street x ≈ 131), C3's wing stub
// 23.3 m from Faza I (C1) and C4's wing stub ≈ 25 m from Faza III (C5 bar at 30.6 m).
export const BUILDINGS = {
  C3: { id: 'C3', origin: [-13, 0], rotY: 0, mirror: true, ground: 'amenity', label: 'Bloc C3' },
  C4: { id: 'C4', origin: [-13, -67.3], rotY: 0, mirror: false, ground: 'kindergarten', label: 'Bloc C4' },
};
export function localToWorld(bId, x, z) {
  const b = BUILDINGS[bId]; const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
  return [b.origin[0] + x * c + z * s, b.origin[1] - x * s + z * c];
}
// Per-building (true) plan geometry: canonical, reflected z → −z for a mirrored block.
export const isMirrored = bId => !!(BUILDINGS[bId] && BUILDINGS[bId].mirror);
const mzOf = bId => (isMirrored(bId) ? -1 : 1);
const _geoCache = {};
function trueGeo(bId) {
  if (_geoCache[bId]) return _geoCache[bId];
  const m = mzOf(bId);
  const rect = r => (m > 0 ? { ...r } : { ...r, z0: -r.z1, z1: -r.z0 });
  const fp = FOOTPRINT.map(([x, z]) => [x, m * z]);
  const cores = CORES.map(c => ({ ...rect(c), stair: c.stair, liftDoors: c.liftDoors.map(([x, z]) => [x, m * z]), liftNormal: [c.liftNormal[0], m * c.liftNormal[1]],
    entrance: [c.entrance[0], m * c.entrance[1]], zOut: m * c.zOut }));
  return (_geoCache[bId] = { footprint: m > 0 ? fp : fp.reverse(), cores, corridors: CORRIDORS.map(rect), mz: m });
}
export const footprintOf = bId => trueGeo(bId).footprint;
export const coresOf = bId => trueGeo(bId).cores;
export const corridorsOf = bId => trueGeo(bId).corridors;
// canonical ↔ true building-local (the reflection is its own inverse)
export const canonToLocal = (bId, x, z) => [x, mzOf(bId) * z];
// The whole plot (traced from the sketch, geo metres): Str. Murelor on the west, the north street, the east street by
// the Aqua City pin, Str. Grigore H. Grandea / Intrarea Guliver on the south.
export const PLOT = [[-123,-162], [-69,-140], [-33,-112], [39,-79], [111,-52], [174,-25], [188,-17], [178,18], [151,63], [129,106], [117,119], [93,94], [57,86], [3,74], [-47,63], [-101,46], [-133,34], [-134,-27], [-130,-94]]
  .map(([gx, gz]) => geoToWorld(gx, gz).map(v => +v.toFixed(1)));
// Context (delivered phases, other blocks) as simple massing: footprint rects (world, axis-aligned with the buildings) + floors,
// after the permit's phase key plan (FAZA I C1, C2 · FAZA II C3, C4 · FAZA III C5, C6) and the developer renders.
// Faza I "Aqua City" (delivered, east): a closed courtyard ring — C2 the long bar facing SSW onto Intrarea Guliver, C1 the
//   north bar + east arm + a west arm facing C3 (the ring is open at its north-west corner), P+12, beige.
// Faza III (west, towards Str. Murelor): as on the developer renders, a comb the size of ours right beside it — C5 and C6,
//   two parallel full-length bars joined by a spine along the north street, open courtyard (50 m) towards Intrarea Guliver,
//   P+11 (same roof line as C3/C4), dark brown/charcoal with recessed balconies. Only a car park (25 m) separates C5 from C4.
//   Str. Murelor is bent round the plot's west corner in environment.js so the comb fits at full width.
// P: two-level parking deck along Intrarea Guliver in front of C4/C3, with the round spiral car ramp on its street side.
export const CONTEXT_BLOCKS = [
  { id: 'F1-C2', x0: -13, x1: 4, z0: 37.8, z1: 132, floors: 13, delivered: true, phase: 'I', tone: 'beige' },
  { id: 'F1-W', x0: 4, x1: 70, z0: 37.8, z1: 54.8, floors: 13, delivered: true, phase: 'I', tone: 'beige' },
  { id: 'F1-E', x0: 4, x1: 98, z0: 115, z1: 132, floors: 13, delivered: true, phase: 'I', tone: 'beige' },
  { id: 'F1-C1', x0: 98, x1: 115, z0: 37.8, z1: 132, floors: 13, delivered: true, phase: 'I', tone: 'beige' },
  { id: 'F3-C5', x0: -13, x1: 98, z0: -118, z1: -101, floors: 12, phase: 'III', tone: 'dark' },
  { id: 'F3-C6', x0: -13, x1: 98, z0: -185, z1: -168, floors: 12, phase: 'III', tone: 'dark' },
  { id: 'F3-N', x0: 98, x1: 115, z0: -185, z1: -101, floors: 12, phase: 'III', tone: 'dark' },
  { id: 'P', x0: -33, x1: -21, z0: -62, z1: 30, floors: 1, parking: true },
];
// Site features shared by the site plan, the context, the car park and the outdoor colliders (world coords):
// the spiral car ramp on the street side of the P deck (in front of C3's west half, as in the render), and the underground car-park
// ramp at the back of the courtyard (descends from the courtyard towards +z, foot inside the basement).
export const SPIRAL = { x: -34.5, z: -6, r0: 3.4, r1: 8.6, r: 9 };
export const RAMP = { x0: 84.6, x1: 88.8, z0: -54, z1: -30, open: -42 };
// The shared basement (P4) under both blocks and the courtyard, world rect
export const BASEMENT = { x0: -14, x1: 116, z0: -83, z1: 15.5 };
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
const facingOf = az => 'NESW'[Math.round(az / 90) % 4];
// Canonical frame → true (building-local) frame of a mirrored block: the reflected rectangle with a right-handed frame
// (U reversed, origin at the reflected far end), so unit-local (u, v) keeps the same meaning for apartment.js.
function trueFrame(fr, w, m) {
  if (m > 0) return fr;
  return { o: [fr.o[0] + fr.U[0] * w, -(fr.o[1] + fr.U[1] * w)], U: [-fr.U[0], fr.U[1]], V: [fr.V[0], -fr.V[1]] };
}
function worldDir(bId, [vx, vz]) { const r = BUILDINGS[bId].rotY; return [vx * Math.cos(r) + vz * Math.sin(r), -vx * Math.sin(r) + vz * Math.cos(r)]; }

function layoutSegment(segId, tokens, floor, bId, out, counter) {
  const seg = SEGMENTS[segId], m = mzOf(bId);
  // Core gaps must sit exactly on CORES rects: scale each run of units between cores to fit its own span.
  const coreSpans = segId === 'S2' ? CORES.filter(c => c.z1 <= -CORR + 1e-6 && c.x1 <= WX0 + 1e-6).map(c => [WX0 - c.x1, WX0 - c.x0]).sort((a, b) => a[0] - b[0]) : [];
  const groups = [[]]; for (const t of tokens) { if (t.startsWith('#core')) groups.push([]); else groups[groups.length - 1].push(t); }
  const spanOf = gi => { const a = gi === 0 ? 0 : coreSpans[gi - 1][1]; const b = gi < coreSpans.length ? coreSpans[gi][0] : seg.len; return [a, b]; };
  const kOf = gi => { const g = groups[gi]; let fx = 0, nm = 0; for (const t of g) { if (t.startsWith('X:')) fx += parseFloat(t.split(':').pop()); else nm += NOMINAL[t]; } const [a, b] = coreSpans.length ? spanOf(gi) : [0, seg.len]; return nm ? (b - a - fx) / nm : 1; };
  let gi = 0, k = kOf(0);
  let s = 0;
  for (const t of tokens) {
    if (t.startsWith('#core')) { gi++; s = coreSpans.length ? spanOf(gi)[0] : s + parseFloat(t.split(':')[1]); k = kOf(gi); continue; }
    if (t.startsWith('X:')) {
      const [, name, len] = t.split(':'); const L = parseFloat(len);
      const cf = frameOf(seg, s);
      out.blocks.push({ seg: segId, kind: name === 'amenity' ? (BUILDINGS[bId].ground) : name, s0: s, s1: s + L, frame: trueFrame(cf, L, m), cframe: cf, width: L, depth: GEOM.unitDepth, floor, building: bId });
      s += L; continue;
    }
    const w = NOMINAL[t] * k;
    const n = counter.n++;
    const type = floor === TOP_FLOOR ? topVariant(t) : variantFor(t, n * 7 + floor * 3 + (bId === 'C4' ? 2 : 0));
    const cf = frameOf(seg, s), fr = trueFrame(cf, w, m);
    const cx = fr.o[0] + fr.U[0] * w / 2 + fr.V[0] * GEOM.unitDepth / 2, cz = fr.o[1] + fr.U[1] * w / 2 + fr.V[1] * GEOM.unitDepth / 2;
    const az = bearingOf(...worldDir(bId, fr.V));
    const du = +(w * (t === '1' ? 0.3 : 0.22)).toFixed(3);
    const unit = {
      building: bId, floor, seg: segId, facing: facingOf(az), azimuth: Math.round(az),
      stair: stairFor(cx, cz), type, rooms: TYPES[type].rooms,
      frame: fr, width: +w.toFixed(3), depth: GEOM.unitDepth,
      door: { u: du },   // entrance door centre along U, on corridor wall (v=0)
      center: [cx, cz],
      // canonical copies (commons.js builds the corridors in the canonical frame and reflects its output)
      cframe: cf, cdoor: { u: m > 0 ? du : +(w - du).toFixed(3) },
    };
    out.units.push(unit);
    s += w;
  }
}
function frameOf(seg, s) { return { o: seg.o(s), U: seg.U, V: seg.V }; }

function programFor(floor) { return floor === 0 ? PROGRAM.ground : floor === TOP_FLOOR ? PROGRAM.top : PROGRAM.typical; }

// =====================================================================================================================
// PRICING — the ONE table the owner edits. Every price on the site and in the CRM comes from priceOf() below.
//
//   rate  (€/m²) = rooms[number of rooms] × (1 + floor % + view % + orientation %)
//   price (€)    = total useful area (incl. balcony / loggia / terrace) × rate, ROUNDED TO THE NEAREST €50 (roundTo)
//
// v3.5 — OWNER DECISION, 6 Oct 2026: the price per m² depends ONLY on the number of rooms
//   1 room €3,000 · 2 rooms €2,700 · 3 rooms and more (incl. the 3- and 4-room duplexes) €2,500.
//   The floor, lake-view and courtyard adjustments are SWITCHED OFF (all 0 below) — the mechanism is kept.
//   To restore them put the percentages back (v3.4 values, on a single base of €2,250/m²):
//     floor:       { 0: -5, 1: 0, 2: 0, 3: 0, 4: 2, 5: 4, 6: 6, 7: 8, 8: 10, 9: 14, 10: 18 }
//     view:        { direct: 10, partial: 5, none: 0 }
//     orientation: { courtyard: 2, street: 0 }
// All adjustments are whole or decimal PERCENT of the room-count rate and are simply added together (not compounded).
// =====================================================================================================================
export const PRICING = {
  // € per m² of total useful area (suprafață utilă totală) by the type's number of rooms (TYPES[type].rooms: the living
  // room counts as a room — 1 = studio type 1A, 2 = types 2A–2F and the 2-room duplex D2, 3 = 3A / D3, 4 = D4).
  // `roomsUp` and above all use the `roomsUp` rate.
  rooms: { 1: 3000, 2: 2700, 3: 2500 },
  roomsUp: 3,
  roundTo: 50,                // unit price is rounded to the nearest multiple of this (€)
  // Floor adjustment, % of the rate. 0 = ground floor (Parter). 10 = floor 10 incl. the duplexes.
  // SWITCHED OFF by owner decision 6 Oct 2026 (v3.4 was { 0: -5, 1: 0, 2: 0, 3: 0, 4: 2, 5: 4, 6: 6, 7: 8, 8: 10, 9: 14, 10: 18 }).
  floor: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
  // Lake-view adjustment, % of the rate. The class of each unit is still decided by lakeViewOf() from the real geometry
  // (below) and shown as a badge / filter — it is information only now.
  // SWITCHED OFF by owner decision 6 Oct 2026 (v3.4 was { direct: 10, partial: 5, none: 0 }).
  view: { direct: 0, partial: 0, none: 0 },
  // Orientation adjustment, % of the rate: the quiet inner courtyard vs. the street / car-park side.
  // SWITCHED OFF by owner decision 6 Oct 2026 (v3.4 was { courtyard: 2, street: 0 }).
  orientation: { courtyard: 0, street: 0 },
  // Facade segments that look onto the inner courtyard between C3 and C4 (S1 = the bars' inner long side, S4 = the
  // wing arms' SSW face at the head of the courtyard). Everything else (S2 outer side, S5 north street, S6 wing stub
  // by the entrance forecourt) counts as street / parking.
  courtyardSegs: ['S1', 'S4'],
  // Lake-view classification (see lakeViewOf): share of the outlook that is open water of Lacul Morii.
  lake: {
    direct: 0.02,             // ≥ 2 % of the view AND water across ≥ directSpan degrees → "direct / open lake view"
    directSpan: 45,           // minimum horizontal width of visible water (degrees) for a direct view
    partial: 0.005,           // ≥ 0.5 % of the view → "partial lake view"; below that → none
    screenH: 12,              // m — roofs and tree crowns of the house neighbourhood + the park belt along the shore
    screenSetback: 40,        // m — that belt ends this far before the water's edge
    eye: 1.6,                 // m above the floor, standing on the balcony
  },
};

// ---------- Lake view from real geometry ----------
// Lacul Morii lies SSW of the plot (shore bearings ≈ 167°–249°, nearest shore ≈ 270 m). For a unit we stand on its
// balcony (mid width) and — for the corner units at the SSW end of each bar — also at their gable window / wrap-around
// balcony, and sweep the horizon ±60° around that facade's normal in 1° steps. Along each bearing the water between the
// shore lines (LAKE.shore, minus the island) is visible only beyond the sight line that clears every obstacle in between:
//   · the massing of Faza I and Faza III and the P deck (CONTEXT_BLOCKS), the other block and our own wing (footprints),
//   · the houses and trees between Intrarea Guliver and the shore, as a screen of height lake.screenH at the shore belt.
// The visible water is summed as a solid angle and expressed as a share of a 70° × 44° outlook, weighting bearings the
// way a person turns on the balcony (straight ahead ×1, up to 35° aside ×⅔, up to 60° aside ×⅓) — the same measure as
// the 3D check in dev/shape-check.html (lakeViews), which this model was calibrated against (127 candidate units rendered
// in the 3D scene, v3.4: r.m.s. difference 0.15 % of the view; screenH / screenSetback are the two fitted numbers).
// Low floors behind the houses and trees therefore get no lake-view class even when they face the lake.
function _hits(poly, ex, ez, dx, dz) {          // sorted distances at which a ray crosses a polygon's edges
  const ts = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], sx = bx - ax, sz = bz - az, den = dx * sz - dz * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - ex) * sz - (az - ez) * sx) / den, s = ((ax - ex) * dz - (az - ez) * dx) / den;
    if (t > 1e-6 && s >= 0 && s < 1) ts.push(t);
  }
  return ts.sort((a, b) => a - b);
}
let _obst = null;
function _obstacles() {
  return _obst || (_obst = [
    ...CONTEXT_BLOCKS.map(b => ({ poly: [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]], h: LEVELS.groundH + (b.floors - 1) * LEVELS.typicalH })),
    ...Object.keys(BUILDINGS).map(id => ({ poly: footprintOf(id).map(([x, z]) => localToWorld(id, x, z)), h: ROOF_Y })),
  ]);
}
const VIEW_DEG2 = 70 * 43.75;                   // the reference outlook (70° wide, 16:10), in square degrees
function _lakeFrom(ex, ez, h, normal) {         // → { share, span } seen from one eye point looking along `normal` (bearing)
  const L = PRICING.lake; let solid = 0, span = 0;
  if (h <= L.screenH) return { share: 0, span: 0 };
  const [cx, cz] = LAKE.island.center, ir = LAKE.island.r, D = 180 / Math.PI;
  for (let d = -60; d <= 60; d++) {
    const [dx, dz] = dirOfBearing(normal + d);
    const w = _hits(LAKE.shore, ex, ez, dx, dz); if (w.length < 2) continue;
    let dmin = (w[0] - L.screenSetback) * h / (h - L.screenH);                     // sight line over the shore belt
    for (const o of _obstacles()) {
      const t = _hits(o.poly, ex, ez, dx, dz); if (!t.length || t[0] > w[0]) continue;
      dmin = Math.max(dmin, h > o.h ? t[t.length - 1] * h / (h - o.h) : Infinity);  // sight line over a building
    }
    const px = cx - ex, pz = cz - ez, tc = px * dx + pz * dz, q = ir * ir - (px * px + pz * pz - tc * tc);
    let v = 0;
    for (let i = 0; i + 1 < w.length; i += 2) {
      const a = Math.max(w[i], dmin), b = w[i + 1]; if (b <= a) continue;
      const segs = q > 0 ? [[a, Math.min(b, tc - Math.sqrt(q))], [Math.max(a, tc + Math.sqrt(q)), b]] : [[a, b]];
      for (const [p, r] of segs) if (r > p) v += (Math.atan(h / p) - Math.atan(h / r)) * D;   // vertical angle of water
    }
    if (v > 0.1) span++;
    solid += v * (Math.abs(d) <= 10 ? 1 : Math.abs(d) <= 35 ? 2 / 3 : 1 / 3);
  }
  return { share: solid / VIEW_DEG2, span };
}
// → { view: 'direct' | 'partial' | 'none', share, span } for a unit
export function lakeViewOf(u) {
  const L = PRICING.lake, h = floorY(u.floor) + L.eye;
  let best = _lakeFrom(...unitToWorld(u, u.width / 2, u.depth + GEOM.balconyDepth * 0.55), h, u.azimuth);
  // corner unit at the SSW end of a bar: its gable (building-local −x, world bearing of that axis) looks at the lake
  const f = u.frame, x0 = Math.min(f.o[0], f.o[0] + f.U[0] * u.width);
  if ((u.seg === 'S1' || u.seg === 'S2') && x0 < 0.5) {
    const g = _lakeFrom(...localToWorld(u.building, -0.9, f.o[1] + f.V[1] * u.depth / 2), h, bearingOf(...worldDir(u.building, [-1, 0])));
    if (g.share > best.share) best = g;
  }
  const view = best.share >= L.direct && best.span >= L.directSpan ? 'direct' : best.share >= L.partial ? 'partial' : 'none';
  return { view, share: +best.share.toFixed(4), span: best.span };
}

// ---------- The single price function ----------
// → { base (€/m² for the unit's room count), rooms, floorPct, viewPct, sidePct, pct, view, side, rate (€/m², exact),
//     area (m²), price (€, rounded to roundTo) }
// Reads u.view / u.side when already set (build() stores them on every unit), otherwise works them out.
export function baseRateOf(rooms) { const P = PRICING; return P.rooms[Math.min(Math.max(rooms, 1), P.roomsUp)]; }
export function priceOf(u) {
  const P = PRICING;
  const view = u.view || lakeViewOf(u).view;
  const side = u.side || (P.courtyardSegs.includes(u.seg) ? 'courtyard' : 'street');
  const floorPct = P.floor[u.floor] ?? 0, viewPct = P.view[view] ?? 0, sidePct = P.orientation[side] ?? 0;
  const pct = floorPct + viewPct + sidePct;
  const rooms = TYPES[u.type].rooms, base = baseRateOf(rooms);
  const rate = Math.round(base * (100 + pct)) / 100;          // exact to the cent (percentages are added, then applied once)
  const area = TYPES[u.type].total;
  const price = Math.round(area * rate / P.roundTo) * P.roundTo;   // rounded to the nearest €50
  return { base, rooms, floorPct, viewPct, sidePct, pct, view, side, rate, area, price };
}

export const UNITS = [];
export const BLOCKS = [];      // non-residential blocks (ground-floor amenity / parking / storage / lobby, the corner stair cell)
(function build() {
  for (const bId of Object.keys(BUILDINGS)) {
    let apNo = 1;
    for (let floor = 0; floor <= TOP_FLOOR; floor++) {
      const prog = programFor(floor); const out = { units: [], blocks: [] }; const counter = { n: 0 };
      for (const segId of SEG_ORDER) layoutSegment(segId, prog[segId], floor, bId, out, counter);
      out.units.forEach((u, i) => {
        u.index = i + 1; u.apNo = apNo++;
        u.id = `${bId}-${floor === 0 ? 'P' : floor}-${String(u.index).padStart(2, '0')}`;
        const lv = lakeViewOf(u);
        u.view = lv.view; u.lakeShare = lv.share;                                   // 'direct' | 'partial' | 'none'
        u.side = PRICING.courtyardSegs.includes(u.seg) ? 'courtyard' : 'street';
        const pr = priceOf(u); u.rate = pr.rate; u.price = pr.price;                // the only place a price is set
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
// €/m² rates can have cents when percentage adjustments are on (e.g. 2,700 × 1.07 = 2,889.00, 2,250 × 1.07 = 2,407.50) — shown exactly, without decimals when whole
export function moneyRate(n) { return '€' + n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }); }
// Price list summary for "from …" figures and filter bounds
export const PRICE_STATS = (() => {
  const ps = UNITS.map(u => u.price), rs = UNITS.map(u => u.rate);
  return { min: Math.min(...ps), max: Math.max(...ps), rateMin: Math.min(...rs), rateMax: Math.max(...rs) };
})();
