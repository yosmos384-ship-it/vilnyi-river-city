// VILNYI Lifestyle casino — video poker, Jacks or Better with the full-pay 9/6 table (pure logic, money in cents).
// One 52-card pack shuffled for every hand; five cards dealt, any of them held, the rest replaced once.
import { shuffle } from './rng.js?v=3.9';
import { eval5 } from './poker.js?v=3.9';

// payout per coin for 1…5 coins bet (the royal flush pays 800 per coin at five coins: 4000)
export const PAYTABLE = [
  { id: 'royal', name: 'Royal flush', pays: [250, 500, 750, 1000, 4000] },
  { id: 'sflush', name: 'Straight flush', pays: [50, 100, 150, 200, 250] },
  { id: 'four', name: 'Four of a kind', pays: [25, 50, 75, 100, 125] },
  { id: 'full', name: 'Full house', pays: [9, 18, 27, 36, 45] },
  { id: 'flush', name: 'Flush', pays: [6, 12, 18, 24, 30] },
  { id: 'straight', name: 'Straight', pays: [4, 8, 12, 16, 20] },
  { id: 'three', name: 'Three of a kind', pays: [3, 6, 9, 12, 15] },
  { id: 'twopair', name: 'Two pair', pays: [2, 4, 6, 8, 10] },
  { id: 'jacks', name: 'Jacks or better', pays: [1, 2, 3, 4, 5] },
];
export const RULES = Object.freeze({ coinValues: [25, 100, 500], maxCoins: 5 });
const BY_CAT = { 9: 'royal', 8: 'sflush', 7: 'four', 6: 'full', 5: 'flush', 4: 'straight', 3: 'three', 2: 'twopair' };
/** Paying category of five cards: one of PAYTABLE ids, or null. */
export function category(cs) {
  const e = eval5(cs);
  if (e.cat >= 2) return BY_CAT[e.cat];
  if (e.cat === 1 && e.ranks[0] >= 11) return 'jacks';                 // pair of jacks, queens, kings or aces
  return null;
}
/** Credits won (stake not included, as on the machine) for `coins` coins. */
export function payFor(id, coins) { const row = PAYTABLE.find(r => r.id === id); return row ? row.pays[coins - 1] : 0; }

export class VideoPoker {
  constructor({ rng } = {}) { if (!rng) throw new Error('VideoPoker needs an rng'); this.rng = rng; this.phase = 'bet'; this.hand = []; this.held = [false, false, false, false, false]; this.forced = null; }
  /** Force the pack order for the next deal (tests / demos): the first five are dealt, the rest are the draws. */
  stack(list) { this.forced = list.slice(); return this; }
  /** Deal five cards for `coins` coins of `coinValue` cents. The stake is coins × coinValue. */
  deal(coins, coinValue) {
    if (this.phase === 'draw') throw new Error('draw first');
    if (!Number.isInteger(coins) || coins < 1 || coins > RULES.maxCoins || !(coinValue > 0)) throw new Error('bad bet');
    const pack = Array.from({ length: 52 }, (_, i) => i); shuffle(pack, this.rng);
    if (this.forced) { const f = this.forced; this.forced = null; this.pack = [...f, ...pack.filter(c => !f.includes(c))]; } else this.pack = pack;
    this.coins = coins; this.coinValue = coinValue; this.hand = this.pack.splice(0, 5); this.held = [false, false, false, false, false];
    this.phase = 'draw'; this.dealt = category(this.hand);
    return { hand: this.hand.slice(), category: this.dealt, staked: coins * coinValue };
  }
  hold(i, on = !this.held[i]) { if (this.phase !== 'draw') throw new Error('no hand'); if (i < 0 || i > 4) throw new Error('card 0…4'); this.held[i] = !!on; return this.held.slice(); }
  /** Replace the cards that are not held and settle. → { hand, category, win (cents, stake not included), returned } */
  draw() {
    if (this.phase !== 'draw') throw new Error('deal first');
    const replaced = [];
    for (let i = 0; i < 5; i++) if (!this.held[i]) { this.hand[i] = this.pack.shift(); replaced.push(i); }
    const cat = category(this.hand), win = payFor(cat, this.coins) * this.coinValue;
    this.phase = 'done'; this.result = { hand: this.hand.slice(), category: cat, win, returned: win, staked: this.coins * this.coinValue, replaced };
    return this.result;
  }
}
