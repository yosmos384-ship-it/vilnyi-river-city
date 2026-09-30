// Units whose balcony / windows look out over Lacul Morii (the lake lies SSW of the plot: shore bearings 167°–249°,
// nearest shore ≈270 m away, beyond Intrarea Guliver, the P deck and the houses).
// Measured in the 3D scene (dev/shape-check.html → lakeViews): eye 1.6 m above the floor on the balcony (mid width, just
// inside the rail) and, for the corner units at the SSW end of each bar, at the gable window; 70° view at −4° pitch swept
// ±25° around the facade normal; everything but open water rendered black; share = water pixels / view. Listed: ≥ 0.5 %.
// With the true plan (C4 west, C3 east, wings meeting in the north, the courtyard open to the SSW) the lake shows:
//  · from the SSW-end corner units (Ap. 01 and 19 of each floor — their gable faces the lake head-on) from floor 5 up,
//    1.6 % (floor 5) … 8 % (floor 10) of the view — the strongest lake views;
//  · from the courtyard-facing wing units (20, 21: SSW over the courtyard mouth) and the wing-stub unit (26) from floor 6–7,
//    0.5 … 2 %;
//  · as a side view over the rooftops from the west-facing units near the SSW end (C3 02–05, C4 17–18) on floors 8–10.
// Floors 1–4 see the houses and trees of the neighbourhood, not the water.
export const LAKE_VIEW_UNITS = [
  'C3-5-01', 'C3-5-19', 'C3-6-01', 'C3-6-19', 'C3-6-20', 'C3-6-21', 'C3-7-01', 'C3-7-19', 'C3-7-20', 'C3-7-21',
  'C3-7-26', 'C3-8-01', 'C3-8-19', 'C3-8-20', 'C3-8-21', 'C3-8-26', 'C3-9-01', 'C3-9-02', 'C3-9-03', 'C3-9-19',
  'C3-9-20', 'C3-9-21', 'C3-9-26', 'C3-10-01', 'C3-10-02', 'C3-10-03', 'C3-10-04', 'C3-10-19', 'C3-10-20',
  'C3-10-21', 'C3-10-26', 'C4-5-01', 'C4-5-19', 'C4-6-01', 'C4-6-19', 'C4-6-20', 'C4-6-21', 'C4-7-01', 'C4-7-19',
  'C4-7-20', 'C4-7-21', 'C4-7-26', 'C4-8-01', 'C4-8-19', 'C4-8-20', 'C4-8-21', 'C4-8-26', 'C4-9-01', 'C4-9-19',
  'C4-9-20', 'C4-9-21', 'C4-9-26', 'C4-10-01', 'C4-10-19', 'C4-10-20', 'C4-10-21', 'C4-10-26',
];
// The panoramic ones (≥ 2 % of the view: a wide band of water with the fountain and the island park).
export const LAKE_VIEW_PANORAMIC = [
  'C3-6-01', 'C3-6-19', 'C3-7-01', 'C3-7-19', 'C3-8-01', 'C3-8-19', 'C3-9-01', 'C3-9-19', 'C3-10-01', 'C3-10-19',
  'C3-10-21', 'C4-6-01', 'C4-6-19', 'C4-7-01', 'C4-7-19', 'C4-8-01', 'C4-8-19', 'C4-9-01', 'C4-9-19', 'C4-10-01',
  'C4-10-19', 'C4-10-21',
];
// Measured share of the view per unit (best of balcony / gable), for badges or sorting.
export const LAKE_VIEW_SHARE = {"C3-5-01": 0.0158, "C3-5-19": 0.0168, "C3-6-01": 0.03, "C3-6-19": 0.0308, "C3-6-20": 0.0051, "C3-6-21": 0.0066, "C3-7-01": 0.0435, "C3-7-19": 0.0441, "C3-7-20": 0.0077, "C3-7-21": 0.0099, "C3-7-26": 0.0065, "C3-8-01": 0.0561, "C3-8-19": 0.0566, "C3-8-20": 0.011, "C3-8-21": 0.0141, "C3-8-26": 0.0087, "C3-9-01": 0.0701, "C3-9-02": 0.0055, "C3-9-03": 0.005, "C3-9-19": 0.0704, "C3-9-20": 0.0138, "C3-9-21": 0.017, "C3-9-26": 0.0107, "C3-10-01": 0.0817, "C3-10-02": 0.0063, "C3-10-03": 0.0058, "C3-10-04": 0.0053, "C3-10-19": 0.082, "C3-10-20": 0.0165, "C3-10-21": 0.0203, "C3-10-26": 0.0131, "C4-5-01": 0.016, "C4-5-19": 0.0162, "C4-6-01": 0.0295, "C4-6-19": 0.0298, "C4-6-20": 0.0051, "C4-6-21": 0.0064, "C4-7-01": 0.0428, "C4-7-19": 0.0434, "C4-7-20": 0.0087, "C4-7-21": 0.0102, "C4-7-26": 0.0061, "C4-8-01": 0.055, "C4-8-19": 0.0556, "C4-8-20": 0.0117, "C4-8-21": 0.0141, "C4-8-26": 0.0088, "C4-9-01": 0.0688, "C4-9-19": 0.0691, "C4-9-20": 0.0145, "C4-9-21": 0.0172, "C4-9-26": 0.011, "C4-10-01": 0.0808, "C4-10-19": 0.0813, "C4-10-20": 0.0175, "C4-10-21": 0.0207, "C4-10-26": 0.0135};
