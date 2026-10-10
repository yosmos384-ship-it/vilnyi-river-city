// Units whose balcony / windows look out over Lacul Morii (the lake lies SSW of the plot: shore bearings 167°–249°,
// nearest shore ≈ 270 m away, beyond Intrarea Guliver, the P deck and the houses).
// Since v3.4 the classification lives in data.js (PRICING.lake + lakeViewOf — a line-of-sight computation over the lake
// shore, Faza I / Faza III, the other block and the neighbourhood screen, calibrated on the 3D scene with
// dev/shape-check.html → lakeViews). These lists are derived from it, so they can never disagree with the prices.
import { UNITS } from './data.js?v=3.11';
export const LAKE_VIEW_UNITS = UNITS.filter(u => u.view !== 'none').map(u => u.id);            // direct + partial
export const LAKE_VIEW_PANORAMIC = UNITS.filter(u => u.view === 'direct').map(u => u.id);      // direct / open view
export const LAKE_VIEW_SHARE = Object.fromEntries(UNITS.filter(u => u.lakeShare > 0).map(u => [u.id, u.lakeShare]));
