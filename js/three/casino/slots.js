// VILNYI Lifestyle casino — slot machine "VILNYI Riviera": 5 reels × 3 rows, 20 fixed paylines (pure logic, cents).
// Original symbols: the VILNYI bird (wild), yacht, diamond, champagne, anchor, compass, lake wave, shell, star and the
// golden key (scatter). Lines pay left to right from the first reel, the best win per line; the bird substitutes for
// every symbol but the key; keys pay anywhere on the screen as a multiple of the total bet. No bonus rounds, so the
// return to player follows exactly from the reel strips: theoreticalRTP() computes it (≈ 95.04 %).
export const SYMBOLS = {
  B: { id: 'bird', name: 'VILNYI bird (wild)', wild: true, pays: [0, 0, 10, 100, 500, 2500] },
  Y: { id: 'yacht', name: 'Yacht', pays: [0, 0, 5, 50, 200, 1000] },
  D: { id: 'diamond', name: 'Diamond', pays: [0, 0, 2, 30, 120, 500] },
  G: { id: 'champagne', name: 'Champagne', pays: [0, 0, 0, 20, 80, 300] },
  A: { id: 'anchor', name: 'Anchor', pays: [0, 0, 0, 15, 50, 200] },
  O: { id: 'compass', name: 'Compass', pays: [0, 0, 0, 10, 40, 150] },
  W: { id: 'wave', name: 'Lake', pays: [0, 0, 0, 8, 25, 100] },
  H: { id: 'shell', name: 'Shell', pays: [0, 0, 0, 5, 20, 80] },
  S: { id: 'star', name: 'Star', pays: [0, 0, 0, 5, 15, 60] },
  K: { id: 'key', name: 'Golden key (scatter)', scatter: true, pays: [0, 0, 0, 5, 20, 100] },     // × total bet
};
export const WILD = 'B', SCATTER = 'K';
// the five reel strips (they wrap); one key per reel, so a window never shows two
export const STRIPS = [
  'AWHSWGDWBOWHGYHASHOBSWAOKSOHGABSAHYWSDHOGDS',
  'HODBSYBWDHKASHWBSODWAHOASHOGHWAGSWHSGWSOGYAS',
  'BDHGSYHOASOWYSHOAWHABWGSDWSGWHOGSWHAKOSHADO',
  'HDWGHASODAOSHYSWBSWDOSGWHSOHWAGSYHAGOBHSOKAW',
  'AGODSWASHWADOHWYGHAKWSOBSHGYWAGOSHDSOWHSWHSO',
];
// paylines: the row (0 top, 1 middle, 2 bottom) taken on each reel
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [0, 2, 0, 2, 0],
];
export const RULES = Object.freeze({ lines: 20, lineBets: [5, 10, 25, 50, 100] });      // cents per line → total €1 … €20

/** Win of one line of five symbols as a multiple of the line bet. → { pay, symbol, count } */
export function linePay(s) {
  let w = 0; while (w < 5 && s[w] === WILD) w++;
  let best = { pay: SYMBOLS[WILD].pays[w], symbol: WILD, count: w };
  if (w < 5 && s[w] !== SCATTER) {
    const x = s[w]; let n = w; while (n < 5 && (s[n] === x || s[n] === WILD)) n++;
    const p = SYMBOLS[x].pays[n]; if (p > best.pay) best = { pay: p, symbol: x, count: n };
  }
  return best;
}
/** The 5 × 3 window for the reel stops: grid[reel][row]. */
export function windowAt(stops, strips = STRIPS) { return stops.map((st, r) => [0, 1, 2].map(row => strips[r][(st + row) % strips[r].length])); }
/** Evaluate a window. lineBet in cents. → { wins: [{ line, symbol, count, pay, amount }], scatter: { count, amount }, win } */
export function evaluate(grid, lineBet, lines = LINES) {
  const wins = []; let win = 0;
  lines.forEach((ln, i) => { const r = linePay(ln.map((row, reel) => grid[reel][row])); if (r.pay > 0) { const amount = r.pay * lineBet; wins.push({ line: i, ...r, amount }); win += amount; } });
  let sc = 0; for (const col of grid) for (const s of col) if (s === SCATTER) sc++;
  const scAmount = SYMBOLS[SCATTER].pays[Math.min(5, sc)] * lineBet * lines.length;
  return { wins, scatter: { count: sc, amount: scAmount }, win: win + scAmount };
}
/** One spin. → { stops, grid, wins, scatter, win, staked, returned } */
export function spin(rng, lineBet, strips = STRIPS) {
  const stops = strips.map(s => rng.int(s.length)), grid = windowAt(stops, strips), e = evaluate(grid, lineBet);
  return { stops, grid, ...e, staked: lineBet * LINES.length, returned: e.win };
}
/**
 * Exact return to player from the strips. Every row of a reel's window is uniform over that strip, so each payline
 * sees an independent uniform symbol per reel: sum the line pay over all symbol combinations weighted by the strip
 * counts; the scatter pays by the number of reels showing a key (3 of `len` stops each).
 * → { line, scatter, total, hit (chance that a given line pays) }
 */
export function theoreticalRTP(strips = STRIPS, lines = LINES) {
  const keys = Object.keys(SYMBOLS), len = strips.map(s => s.length);
  const cnt = strips.map(s => Object.fromEntries(keys.map(k => [k, s.split(k).length - 1])));
  let line = 0, hit = 0; const s = new Array(5);
  const rec = (i, p) => { if (i === 5) { const v = linePay(s).pay; line += p * v; if (v > 0) hit += p; return; } for (const k of keys) { const c = cnt[i][k]; if (!c) continue; s[i] = k; rec(i + 1, p * c / len[i]); } };
  rec(0, 1);
  let dist = [1];
  for (let i = 0; i < 5; i++) { const q = 3 * cnt[i][SCATTER] / len[i], nd = new Array(dist.length + 1).fill(0); dist.forEach((p, k) => { nd[k] += p * (1 - q); nd[k + 1] += p * q; }); dist = nd; }
  const scatter = dist.reduce((a, p, k) => a + p * SYMBOLS[SCATTER].pays[k], 0);
  return { line, scatter, total: line + scatter, hit, lines: lines.length };
}
export class Slots {
  constructor({ rng } = {}) { if (!rng) throw new Error('Slots needs an rng'); this.rng = rng; this.forced = null; this.last = null; }
  /** Force the next spin's reel stops (tests / demos). */
  stack(stops) { this.forced = stops.slice(); return this; }
  spin(lineBet) {
    if (!RULES.lineBets.includes(lineBet)) throw new Error('line bet must be one of ' + RULES.lineBets.join(', '));
    if (this.forced) { const stops = this.forced; this.forced = null; const grid = windowAt(stops), e = evaluate(grid, lineBet); return (this.last = { stops, grid, ...e, staked: lineBet * LINES.length, returned: e.win }); }
    return (this.last = spin(this.rng, lineBet));
  }
}
