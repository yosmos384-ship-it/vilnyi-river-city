// VILNYI Lifestyle casino — geometry of the roulette betting layout (pure: shared by the felt artwork, the taps and
// the tests). Seen from the player's end of the table: u across (right positive), v away from the player towards the
// wheel. Numbers: 3 columns × 12 rows with 34-35-36 nearest the player and 1-2-3 next to the zero at the wheel end;
// the "2 : 1" column boxes nearest the player; the dozens and the even chances in two strips on the left.
import { BET } from './roulette.js?v=3.5.1';

export const RL = { cell: [0.19, 0.1], u0: -0.18, v0: 0.2, dozW: 0.105, evW: 0.105, zeroH: 0.13, colH: 0.105, ppm: 620 };      // wide cells: easy to hit on a phone
RL.w = 3 * RL.cell[0] + RL.dozW + RL.evW; RL.h = 12 * RL.cell[1] + RL.zeroH + RL.colH;
RL.uL = RL.u0 - RL.dozW - RL.evW; RL.vB = RL.v0 - RL.colH;
/** Centre (u, v) of a number's cell. */
export function rlCell(n) {
  if (n === 0) return [RL.u0 + 1.5 * RL.cell[0], RL.v0 + 12 * RL.cell[1] + RL.zeroH / 2];
  const row = Math.ceil(n / 3), col = (n - 1) % 3;
  return [RL.u0 + (col + 0.5) * RL.cell[0], RL.v0 + (12 - row + 0.5) * RL.cell[1]];
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/**
 * The bet a tap at (u, v) means, or null off the layout: the middle of a cell is a straight-up; a line between two
 * numbers a split; a crossing a corner; the outer edge of a row a street; an outer crossing a six line; the crossings
 * on the zero line the trios and the first four. → { bet, pos: [u, v] where the chips go }
 */
export function betAt(u, v, tol = 0.026) {
  const R = RL, [cw, ch] = R.cell, gu = (u - R.u0) / cw, gv = (v - R.v0) / ch;
  if (u >= R.uL && u < R.u0 - R.dozW && gv >= 0 && gv < 12) { const i = Math.floor(gv / 2); return { bet: [BET.high, BET.odd, BET.black, BET.red, BET.even, BET.low][i](), pos: [R.uL + R.evW / 2, R.v0 + (i * 2 + 1) * ch] }; }
  if (u >= R.u0 - R.dozW && u < R.u0 - tol && gv >= 0 && gv < 12) { const k = Math.floor(gv / 4); return { bet: BET.dozen(3 - k), pos: [R.u0 - R.dozW / 2, R.v0 + (k * 4 + 2) * ch] }; }
  if (v < R.v0 - tol * 0.5 && v >= R.vB && gu >= 0 && gu < 3) { const c = Math.floor(gu); return { bet: BET.column(c + 1), pos: [R.u0 + (c + 0.5) * cw, R.v0 - R.colH / 2] }; }
  if (gv > 12 + tol / ch && v <= R.v0 + 12 * ch + R.zeroH && gu >= 0 && gu <= 3) return { bet: BET.straight(0), pos: rlCell(0) };
  if (gu < -tol / cw || gu > 3 + tol / cw || gv < 0 || gv > 12 + tol / ch) return null;
  const lu = clamp(Math.round(gu), 0, 3), lv = clamp(Math.round(gv), 0, 12), nearU = Math.abs(gu - lu) * cw < tol, nearV = Math.abs(gv - lv) * ch < tol;
  const col = clamp(Math.floor(gu), 0, 2), vr = clamp(Math.floor(gv), 0, 11), row = 12 - vr, n = (row - 1) * 3 + col + 1;
  const lineU = R.u0 + lu * cw, lineV = R.v0 + lv * ch, midV = R.v0 + (vr + 0.5) * ch, midU = R.u0 + (col + 0.5) * cw;
  if (nearU && nearV && lv >= 1) {
    if (lv === 12) return { bet: lu === 1 ? BET.trio(1) : lu === 2 ? BET.trio(2) : BET.firstFour(), pos: [lineU, lineV] };
    const rA = 12 - lv;                              // the row beyond the line; rA + 1 is the one nearer the player
    if (lu === 0 || lu === 3) return { bet: BET.sixLine(rA), pos: [lineU, lineV] };
    return { bet: BET.corner((rA - 1) * 3 + lu), pos: [lineU, lineV] };
  }
  if (nearU) { if (lu === 0 || lu === 3) return { bet: BET.street(row), pos: [lineU, midV] }; const a = (row - 1) * 3 + lu; return { bet: BET.split(a, a + 1), pos: [lineU, midV] }; }
  if (nearV && lv >= 1) { if (lv === 12) return { bet: BET.split(0, col + 1), pos: [midU, lineV] }; const a = (12 - lv - 1) * 3 + col + 1; return { bet: BET.split(a, a + 3), pos: [midU, lineV] }; }
  return { bet: BET.straight(n), pos: rlCell(n) };
}
