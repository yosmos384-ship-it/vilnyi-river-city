// VILNYI Lifestyle casino — poker hand evaluation shared by video poker and Casino Hold'em (pure logic).
import { rankOf, suitOf } from './rng.js?v=3.11';

export const CAT = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush'];
const hi = (c) => { const r = rankOf(c); return r === 0 ? 14 : r + 1; };          // ace high = 14, 2…13
/** Evaluate exactly five cards. → { cat (0…9), ranks: tie-break list (high first), score: comparable number } */
export function eval5(cs) {
  const rs = cs.map(hi).sort((a, b) => b - a), flush = cs.every(c => suitOf(c) === suitOf(cs[0]));
  const cnt = new Map(); for (const r of rs) cnt.set(r, (cnt.get(r) || 0) + 1);
  const groups = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);      // by count, then rank
  let straightHi = 0;
  if (cnt.size === 5) { if (rs[0] - rs[4] === 4) straightHi = rs[0]; else if (rs[0] === 14 && rs[1] === 5 && rs[4] === 2) straightHi = 5; }   // wheel: A-2-3-4-5
  let cat, ranks;
  if (straightHi && flush) { cat = straightHi === 14 ? 9 : 8; ranks = [straightHi]; }
  else if (groups[0][1] === 4) { cat = 7; ranks = [groups[0][0], groups[1][0]]; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = 6; ranks = [groups[0][0], groups[1][0]]; }
  else if (flush) { cat = 5; ranks = rs; }
  else if (straightHi) { cat = 4; ranks = [straightHi]; }
  else if (groups[0][1] === 3) { cat = 3; ranks = [groups[0][0], groups[1][0], groups[2][0]]; }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = 2; ranks = [groups[0][0], groups[1][0], groups[2][0]]; }
  else if (groups[0][1] === 2) { cat = 1; ranks = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]; }
  else { cat = 0; ranks = rs; }
  let score = cat; for (let i = 0; i < 5; i++) score = score * 15 + (ranks[i] || 0);
  return { cat, ranks, score };
}
const C7 = (() => { const o = []; for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) o.push([0, 1, 2, 3, 4, 5, 6].filter(i => i !== a && i !== b)); return o; })();
/** Best five-card hand out of 5, 6 or 7 cards. → eval5 result + { cards: the five used } */
export function best(cs) {
  if (cs.length === 5) return { ...eval5(cs), cards: cs.slice() };
  let top = null;
  const idx = cs.length === 7 ? C7 : [0, 1, 2, 3, 4, 5].map(skip => [0, 1, 2, 3, 4, 5].filter(i => i !== skip));
  for (const ix of idx) { const five = ix.map(i => cs[i]), e = eval5(five); if (!top || e.score > top.score) top = { ...e, cards: five }; }
  return top;
}
