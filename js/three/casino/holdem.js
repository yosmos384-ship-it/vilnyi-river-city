// VILNYI Lifestyle casino — Casino Hold'em against the dealer (pure logic, money in integer cents).
// Ante → two cards each and a three-card flop → fold (lose the ante) or call (twice the ante) → turn and river →
// the dealer needs a pair of fours or better to qualify. Dealer does not qualify: the ante is paid by the table below
// and the call is returned. Dealer qualifies: the better hand wins — the ante by the table, the call 1:1; a tie pushes.
import { shuffle } from './rng.js?v=3.10';
import { best, CAT } from './poker.js?v=3.10';

export const RULES = Object.freeze({ minAnte: 500, maxAnte: 25000, betStep: 100 });
// ante pays by the player's final hand (x:1)
export const ANTE_PAYS = { 9: 100, 8: 20, 7: 10, 6: 3, 5: 2 };       // royal, straight flush, four, full house, flush; else 1
export const antePays = (cat) => ANTE_PAYS[cat] || 1;
/** Pair of fours or better. */
export function qualifies(e) { return e.cat >= 2 || (e.cat === 1 && e.ranks[0] >= 4); }
/** Settle a finished hand. → { result, ante, call (money returned incl. stake), returned } */
export function settle(ante, called, player, dealer) {
  if (!called) return { result: 'fold', ante: 0, call: 0, returned: 0 };
  const call = ante * 2, p = best(player), d = best(dealer);
  if (!qualifies(d)) return { result: 'noqualify', ante: ante + ante * antePays(p.cat), call, returned: ante + ante * antePays(p.cat) + call, p, d };
  if (p.score > d.score) return { result: 'win', ante: ante + ante * antePays(p.cat), call: call * 2, returned: ante + ante * antePays(p.cat) + call * 2, p, d };
  if (p.score === d.score) return { result: 'push', ante, call, returned: ante + call, p, d };
  return { result: 'lose', ante: 0, call: 0, returned: 0, p, d };
}
export class CasinoHoldem {
  constructor({ rng, rules = {} } = {}) { if (!rng) throw new Error('CasinoHoldem needs an rng'); this.rng = rng; this.rules = { ...RULES, ...rules }; this.phase = 'bet'; this.forced = null; }
  /** Force the pack: player 2, dealer 2, flop 3, turn, river. */
  stack(list) { this.forced = list.slice(); return this; }
  validAnte(a) { const R = this.rules; return Number.isInteger(a) && a >= R.minAnte && a <= R.maxAnte && a % R.betStep === 0; }
  deal(ante) {
    if (this.phase === 'decide') throw new Error('hand in progress');
    if (!this.validAnte(ante)) throw new Error('ante outside the table limits');
    const pack = Array.from({ length: 52 }, (_, i) => i); shuffle(pack, this.rng);
    if (this.forced) { const f = this.forced; this.forced = null; this.pack = [...f, ...pack.filter(c => !f.includes(c))]; } else this.pack = pack;
    this.ante = ante; this.player = this.pack.splice(0, 2); this.dealer = this.pack.splice(0, 2); this.board = this.pack.splice(0, 3);
    this.phase = 'decide'; this.result = null;
    return { player: this.player.slice(), flop: this.board.slice(), now: best([...this.player, ...this.board]) };
  }
  callCost() { return this.ante * 2; }
  fold() { if (this.phase !== 'decide') throw new Error('no hand'); this.phase = 'done'; this.result = { ...settle(this.ante, false), staked: this.ante, board: this.board.slice(), dealer: this.dealer.slice() }; return this.result; }
  call() {
    if (this.phase !== 'decide') throw new Error('no hand');
    this.board.push(...this.pack.splice(0, 2));
    const s = settle(this.ante, true, [...this.player, ...this.board], [...this.dealer, ...this.board]);
    this.phase = 'done'; this.result = { ...s, staked: this.ante * 3, board: this.board.slice(), dealer: this.dealer.slice(), playerHand: CAT[s.p.cat], dealerHand: CAT[s.d.cat] };
    return this.result;
  }
}
