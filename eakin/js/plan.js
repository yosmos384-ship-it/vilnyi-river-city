// 3351 Eakin Rd — plan data (meters). x = east, z = south (street side), y = up.
// Derived from the owner's layout PDF (30' x 24' Cape Cod, 1.5 story + full basement).
const FT = 0.3048;
const f = (v) => +(v * FT).toFixed(4);

const plan = {
  FT, f,
  W: f(30),            // 9.144  x extent
  D: f(24),            // 7.315  z extent
  extWall: 0.25,       // exterior wall thickness (centered on the footprint line)
  intWall: 0.12,       // interior partition thickness (centered on the line)
  grade: 0,
  mainFloor: 0.60,     // top of finished main floor
  mainCeil: 3.04,
  upperFloor: 3.29,    // top of finished upper floor
  basementFloor: -1.70,
  basementCeil: 0.35,  // underside of joists
  kneeZ: [f(5), f(19)],        // 1.524 / 5.791 — upper knee walls (run full width along x)
  kneeH: 1.2,                  // knee wall height above upper floor
  roofSlope: 0.69,             // rise/run of roof (inner surface rises 0.69 m per m from knee wall toward ridge)
  ridgeZ: f(12),               // 3.658 ridge line runs along x
  upperFlatCeil: 2.35,         // flat ceiling height above upper floor (between z≈3.19 and z≈4.12)
  eaveOverhang: 0.35,
  rakeOverhang: 0.25,

  // ---------- MAIN FLOOR rooms: [x0, z0, x1, z1] ----------
  rooms: {
    main: {
      bed2:    { he: 'חדר שינה 2', r: [0,      0,      f(12), f(11)] },
      bed1:    { he: 'חדר שינה 1', r: [0,      f(11),  f(12), f(24)] },
      bath1:   { he: 'חדר רחצה 1', r: [f(12),  0,      f(18), f(7)]  },
      hall:    { he: 'מסדרון',     r: [f(12),  f(7),   f(18), f(24)] },
      kitchen: { he: 'מטבח',       r: [f(18),  0,      f(30), f(10)] },
      living:  { he: 'סלון',       r: [f(18),  f(10),  f(30), f(24)] },
    },
    upper: {
      bed3:    { he: 'חדר שינה 3', r: [0,      f(5),   f(13), f(19)] },
      bath2:   { he: 'חדר רחצה 2', r: [1.90,   f(5),   f(13), 3.20]  }, // carved from bed3's NE corner. Plan shower 3.5'x4' sits in its NE corner (x 2.896..3.962, z 1.524..2.743); toilet + vanity west of it
      landing: { he: 'מבואה',      r: [f(13),  f(5),   f(18), f(19)] },
      bed4:    { he: 'חדר שינה 4', r: [f(18),  f(5),   f(30), f(19)] },
    },
    basement: {
      basement:{ he: 'מרתף',       r: [0, 0, f(30), f(24)] },
    },
  },

  // ---------- interior wall lines (centerlines) main floor: {a:[x,z], b:[x,z]} ----------
  // Openings listed separately; house.js cuts them.
  walls: {
    main: [
      { id: 'w_bed_hall',    a: [f(12), 0],     b: [f(12), f(24)] },   // bedrooms | bath/hall
      { id: 'w_bed1_bed2',   a: [0, f(11)],     b: [f(12), f(11)] },
      { id: 'w_bath_hall',   a: [f(12), f(7)],  b: [f(18), f(7)] },
      { id: 'w_hall_east',   a: [f(18), 0],     b: [f(18), f(24)] },   // bath+hall | kitchen+living (has hall→living opening)
      { id: 'w_kit_living',  a: [f(18), f(10)], b: [f(30), f(10)] },   // kitchen | living (wide cased opening)
    ],
    upper: [
      { id: 'u_bed3_landing', a: [f(13), f(5)], b: [f(13), f(19)] },
      { id: 'u_landing_bed4', a: [f(18), f(5)], b: [f(18), f(19)] },
      { id: 'u_bath2_w',      a: [1.90, f(5)],  b: [1.90, 3.20] },     // bath2 partition (west side)
      { id: 'u_bath2_s',      a: [1.90, 3.20],  b: [f(13), 3.20] },    // bath2 partition (south side, has door)
    ],
  },

  // ---------- openings: wall id or 'ext_N|ext_S|ext_E|ext_W' (+ floor), center along wall axis, width, sill, head ----------
  // 'along' = coordinate along the wall (x for N/S walls, z for E/W walls)
  doors: [
    { id: 'front',    wall: 'ext_S', floor: 'main', along: 6.05, w: 0.92, h: 2.05, exterior: true, he: 'דלת כניסה' },
    { id: 'back',     wall: 'ext_E', floor: 'main', along: 1.35, w: 0.86, h: 2.05, exterior: true, he: 'דלת אחורית' },
    { id: 'bath1',    wall: 'w_bath_hall', floor: 'main', along: 4.20, w: 0.76, h: 2.03, he: 'דלת חדר רחצה' },
    { id: 'bed2',     wall: 'w_bed_hall',  floor: 'main', along: 2.75, w: 0.81, h: 2.03, he: 'דלת חדר שינה 2' },
    { id: 'bed1',     wall: 'w_bed_hall',  floor: 'main', along: 4.65, w: 0.81, h: 2.03, he: 'דלת חדר שינה 1' },
    { id: 'basement', wall: 'basement_head', floor: 'main', along: 5.03, w: 0.80, h: 2.00, he: 'דלת למרתף' }, // in a short wall at z=3.90 spanning x 4.572..5.486 under the stair top
    // bed3/bed4 'along' updated to the positions house.js actually builds (its DOOR_OVERRIDE keeps 1.98 m doors under the
    // sloped ceiling): bed3 z 3.34..4.10, bed4 z 3.02..3.78 (was 4.85 / 2.75 — integration pass)
    { id: 'bed3',     wall: 'u_bed3_landing', floor: 'upper', along: 3.72, w: 0.76, h: 1.98, he: 'דלת חדר שינה 3' },
    { id: 'bed4',     wall: 'u_landing_bed4', floor: 'upper', along: 3.40, w: 0.76, h: 1.98, he: 'דלת חדר שינה 4' },
    { id: 'bath2',    wall: 'u_bath2_s',      floor: 'upper', along: 2.45, w: 0.70, h: 1.98, he: 'דלת חדר רחצה 2', sliding: true },
  ],
  openings: [ // cased openings without doors
    { id: 'kit_living',  wall: 'w_kit_living', floor: 'main', along: 7.05, w: 1.50, h: 2.10 },
    { id: 'hall_living', wall: 'w_hall_east',  floor: 'main', along: 3.50, w: 0.90, h: 2.10 },
    { id: 'hall_kitchen',wall: 'w_hall_east',  floor: 'main', along: 2.55, w: 0.00, h: 0 }, // (none — kept for clarity: solid)
  ],
  windows: [ // sill/head heights are ABOVE that floor's finished floor
    { id: 'liv_pic',  wall: 'ext_S', floor: 'main', along: 7.70, w: 2.10, sill: 0.55, head: 2.10, type: 'picture', shutters: false },
    { id: 'bed1_f',   wall: 'ext_S', floor: 'main', along: 1.83, w: 1.10, sill: 0.80, head: 2.10, type: 'doubleHung', shutters: true },
    { id: 'bed1_w',   wall: 'ext_W', floor: 'main', along: 5.40, w: 0.90, sill: 0.90, head: 2.10, type: 'doubleHung' },
    { id: 'bed2_w',   wall: 'ext_W', floor: 'main', along: 1.70, w: 0.90, sill: 0.90, head: 2.10, type: 'doubleHung' },
    { id: 'bed2_n',   wall: 'ext_N', floor: 'main', along: 1.83, w: 1.10, sill: 0.90, head: 2.10, type: 'slider' },
    { id: 'bath1_n',  wall: 'ext_N', floor: 'main', along: 4.57, w: 0.70, sill: 1.45, head: 2.05, type: 'slider', obscure: true },
    { id: 'kit_n',    wall: 'ext_N', floor: 'main', along: 7.30, w: 1.30, sill: 1.05, head: 2.10, type: 'slider' }, // over the sink
    { id: 'liv_e',    wall: 'ext_E', floor: 'main', along: 5.20, w: 1.20, sill: 0.80, head: 2.10, type: 'doubleHung' },
    { id: 'bed3_w',   wall: 'ext_W', floor: 'upper', along: 3.66, w: 0.95, sill: 0.80, head: 2.00, type: 'doubleHung' },
    { id: 'bed4_e',   wall: 'ext_E', floor: 'upper', along: 3.66, w: 0.95, sill: 0.80, head: 2.00, type: 'doubleHung' },
    { id: 'attic_w',  wall: 'ext_W', floor: 'upper', along: 3.66, w: 0.45, sill: 2.55, head: 2.95, type: 'vent' },
    { id: 'attic_e',  wall: 'ext_E', floor: 'upper', along: 3.66, w: 0.45, sill: 2.55, head: 2.95, type: 'vent' },
    { id: 'bsmt_1',   wall: 'ext_S', floor: 'basement', along: 2.00, w: 0.80, sill: 1.65, head: 2.05, type: 'hopper' },
    { id: 'bsmt_2',   wall: 'ext_W', floor: 'basement', along: 3.60, w: 0.80, sill: 1.65, head: 2.05, type: 'hopper' },
    { id: 'bsmt_3',   wall: 'ext_N', floor: 'basement', along: 7.50, w: 0.80, sill: 1.65, head: 2.05, type: 'hopper' },
    { id: 'bsmt_4',   wall: 'ext_E', floor: 'basement', along: 5.00, w: 0.80, sill: 1.65, head: 2.05, type: 'hopper' },
  ],

  // ---------- stairs ----------
  stairs: {
    // main → upper: rises from the FRONT (z=7.20) toward the BACK (z=3.90). Entered from the hall's west strip at the bottom.
    up:   { x0: f(15), x1: f(18), zBottom: 7.20, zTop: 3.90, yBottom: 0.60, yTop: 3.29, risers: 14 },
    // main → basement: directly beneath, entered through basement door at z=3.90 (top), descends toward the front.
    down: { x0: f(15), x1: f(18), zTop: 3.90, zBottom: 7.05, yTop: 0.60, yBottom: -1.70, risers: 12 },
    upperHole: { x0: f(15), x1: f(18), z0: 3.90, z1: f(19) }, // opening in upper floor (guardrail on landing side)
  },

  porch: { x0: 5.05, x1: 7.05, z0: 7.315, z1: 8.90, slabTop: 0.45, steps: 2, columns: 2, roof: 'gable' },

  // ---------- lot & street ----------
  lot: { x0: -6.0, x1: 15.0, z0: -38.0, z1: 16.5 },   // ~21 m wide x 54 m deep, house set back ~9 m from front lot line
  street: { name: 'Eakin Rd', zCenter: 22.0, width: 7.2, sidewalk: false, ditch: false, curb: true, direction: 'x' },
  driveway: { x0: -4.6, x1: -1.6, z0: -6.0, z1: 18.4, material: 'gravel' }, // west side, street → back yard
  bigTree: { x: 4.5, z: -14.0, trunkR: 0.45, height: 17 },

  // Suggested 360-tour nodes (eye height 1.6 m above floor). core may add more.
  // yaw convention: initial LOOK DIRECTION = (sin yaw, 0, cos yaw) in world x/z — yaw 0 looks south (+z, toward the street),
  // yaw π looks north (-z, toward the house from the street). core converts with camera.rotation.y = yaw + π.
  // Interior spots were re-checked against interior.js furniture + open door leaves (≥0.3 m clearance, integration pass).
  panos: [
    { id: 'street',   he: 'רחוב',        p: [4.0, 1.6, 21.0], yaw: Math.PI },
    { id: 'frontyard',he: 'חצר קדמית',  p: [6.0, 1.6, 12.0], yaw: Math.PI },
    { id: 'porch',    he: 'מרפסת כניסה', p: [6.05, 2.05, 8.3], yaw: Math.PI },
    { id: 'living',   he: 'סלון',        p: [6.6, 2.2, 4.0],  yaw: 0.55 },  // toward sofa + picture window (SE)
    { id: 'kitchen',  he: 'מטבח',        p: [7.4, 2.2, 2.3],  yaw: -2.55 }, // toward sink window + range wall (NW)
    { id: 'hall',     he: 'מסדרון',      p: [4.3, 2.2, 3.1],  yaw: 0 },     // down the hall toward the front
    { id: 'bath1',    he: 'חדר רחצה 1',  p: [4.3, 2.2, 1.6],  yaw: Math.PI }, // toward tub + window (N)
    { id: 'bed1',     he: 'חדר שינה 1',  p: [2.95, 2.2, 4.95], yaw: -0.85 }, // from the door side toward bed + windows (SW)
    { id: 'bed2',     he: 'חדר שינה 2',  p: [3.05, 2.2, 2.0],  yaw: -2.0 },  // toward bed + windows (NW)
    { id: 'landing',  he: 'מבואה',       p: [4.6, 4.89, 2.6], yaw: 0 },
    { id: 'bed3',     he: 'חדר שינה 3',  p: [2.75, 4.89, 4.4], yaw: -1.95 }, // toward bed + west gable window
    { id: 'bath2',    he: 'חדר רחצה 2',  p: [2.75, 4.89, 2.8], yaw: 3.0 },  // toward shower + toilet (N)
    { id: 'bed4',     he: 'חדר שינה 4',  p: [6.6, 4.89, 3.0], yaw: 1.2 },   // toward bed + east gable window
    { id: 'basement', he: 'מרתף',        p: [5.6, -0.10, 2.2], yaw: 0.75 }, // toward the pool table (SE)
    { id: 'backyard', he: 'חצר אחורית', p: [5.0, 1.6, -9.0], yaw: 0 },
  ],
  address: '3351 Eakin Rd, Columbus, OH 43204',
};

// upper-floor inner roof height (above upperFloor) at a given z
plan.upperCeilAt = (z) => {
  const [k0, k1] = plan.kneeZ;
  const d = Math.min(Math.abs(z - k0), Math.abs(z - k1));
  if (z < k0 || z > k1) return Math.max(0, plan.kneeH - plan.roofSlope * (z < k0 ? k0 - z : z - k1));
  return Math.min(plan.upperFlatCeil, plan.kneeH + plan.roofSlope * d);
};
// exterior roof top surface height (world y) at a given z (outer face), ignoring overhang trim
plan.roofOuterY = (z) => plan.upperFloor + 0.15 + 0.12 + plan.roofSlope * (plan.ridgeZ - Math.abs(z - plan.ridgeZ)) - 0.0;

export default plan;
