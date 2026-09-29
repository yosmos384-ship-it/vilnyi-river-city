// Units whose balcony looks out over Lacul Morii (lake south / south-west of the plot).
// Measured in the 3D scene: balcony eye point (unitToWorld(balconyPoint) + floorY + 1.6 m), 70° view swept ±25°, share of
// the view that is open lake water. The lake shows from floor 6 up on the lake-facing S4 ends (units 18–21 of C3 and C4,
// ≈1–3.5 % of the view: a wide band of water with the fountain and the island park) and, as a side view over the rooftops,
// from floors 9–10 of the west-facing S2 units 14–17. Floors 1–5 see the neighbourhood trees, not the water.
export const LAKE_VIEW_UNITS = [
  'C3-6-18', 'C3-6-19', 'C3-6-20', 'C3-6-21', 'C3-7-18', 'C3-7-19', 'C3-7-20', 'C3-7-21', 'C3-8-18', 'C3-8-19',
  'C3-8-20', 'C3-8-21', 'C3-9-14', 'C3-9-15', 'C3-9-16', 'C3-9-17', 'C3-9-18', 'C3-9-19', 'C3-9-20', 'C3-9-21',
  'C3-10-14', 'C3-10-15', 'C3-10-16', 'C3-10-17', 'C3-10-18', 'C3-10-19', 'C3-10-20', 'C3-10-21', 'C4-6-18',
  'C4-6-19', 'C4-6-20', 'C4-6-21', 'C4-7-18', 'C4-7-19', 'C4-7-20', 'C4-7-21', 'C4-8-18', 'C4-8-19', 'C4-8-20',
  'C4-8-21', 'C4-9-14', 'C4-9-15', 'C4-9-16', 'C4-9-17', 'C4-9-18', 'C4-9-19', 'C4-9-20', 'C4-9-21', 'C4-10-14',
  'C4-10-15', 'C4-10-16', 'C4-10-17', 'C4-10-18', 'C4-10-19', 'C4-10-20', 'C4-10-21',
];
// The panoramic ones (lake-facing, floors 8–10) — the strongest lake views, if the site wants a second badge tier.
export const LAKE_VIEW_PANORAMIC = [
  'C3-8-18', 'C3-8-19', 'C3-8-20', 'C3-8-21', 'C3-9-18', 'C3-9-19', 'C3-9-20', 'C3-9-21', 'C3-10-18', 'C3-10-19',
  'C3-10-20', 'C3-10-21', 'C4-8-18', 'C4-8-19', 'C4-8-20', 'C4-8-21', 'C4-9-18', 'C4-9-19', 'C4-9-20', 'C4-9-21',
  'C4-10-18', 'C4-10-19', 'C4-10-20', 'C4-10-21',
];
