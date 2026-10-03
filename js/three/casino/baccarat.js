// VILNYI Lifestyle casino — baccarat (punto banco) engine: 8 decks, the full third-card tableau, Player 1:1,
// Banker 0.95:1 (5 % commission), Tie 8:1; a tie pushes the Player and Banker bets. Pure logic, money in integer cents.
import { Shoe, rankOf } from './rng.js';

export const RULES = Object.freeze({ decks: 8, minBet: 500, maxBet: 100000, betStep: 100, tiePays: 8, commission: 0.05, cutFromEnd: 16 });
export const pointOf = (c) => { const r = rankOf(c); return r >= 9 ? 0 : r + 1; };       // A = 1, 2…9, 10/J/Q/K = 0
export const total = (cs) => cs.reduce((s, c) => s + pointOf(c), 0) % 10;
/** Does the banker draw? b: banker total on two cards; p3: point of the player's third card, or null if the player stood. */
export function bankerDraws(b, p3) {
  if (p3 === null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}
/** Play one coup from `draw()` (a function returning the next card). → { player, banker, pt, bt, natural, winner } */
export function playCoup(draw) {
  const player = [draw()], banker = [draw()]; player.push(draw()); banker.push(draw());   // P, B, P, B
  let pt = total(player), bt = total(banker); const natural = pt >= 8 || bt >= 8;
  if (!natural) {
    let p3 = null;
    if (pt <= 5) { const c = draw(); player.push(c); p3 = pointOf(c); pt = total(player); }
    if (bankerDraws(bt, p3)) { banker.push(draw()); bt = total(banker); }
  }
  return { player, banker, pt, bt, natural, winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie' };
}
/** Money returned (stake included) for bets { player, banker, tie } in cents. */
export function settle(bets, winner, rules = RULES) {
  const b = { player: 0, banker: 0, tie: 0, ...bets }, r = { player: 0, banker: 0, tie: 0 };
  if (winner === 'tie') { r.tie = b.tie * (rules.tiePays + 1); r.player = b.player; r.banker = b.banker; }
  else if (winner === 'player') r.player = b.player * 2;
  else r.banker = b.banker + Math.round(b.banker * (1 - rules.commission));
  return { ...r, staked: b.player + b.banker + b.tie, returned: r.player + r.banker + r.tie };
}
export class Baccarat {
  constructor({ rng, rules = {} } = {}) {
    if (!rng) throw new Error('Baccarat needs an rng');
    this.rules = { ...RULES, ...rules };
    this.shoe = new Shoe(this.rules.decks, rng, { penetration: 1 - this.rules.cutFromEnd / (this.rules.decks * 52) });
    this.history = []; this.last = null;
  }
  validBets(b) { const R = this.rules; const v = Object.values({ player: 0, banker: 0, tie: 0, ...b }); return v.some(x => x > 0) && v.every(x => Number.isInteger(x) && x >= 0 && (x === 0 || (x >= R.minBet && x <= R.maxBet && x % R.betStep === 0))); }
  /** Deal a coup for bets { player, banker, tie }. */
  deal(bets) {
    if (!this.validBets(bets)) throw new Error('bets outside the table limits');
    let shuffled = false; if (this.shoe.cutReached) { this.shoe.shuffle(); shuffled = true; }
    const coup = playCoup(() => this.shoe.draw()), s = settle(bets, coup.winner, this.rules);
    this.last = { ...coup, pay: s, staked: s.staked, returned: s.returned, shuffled };
    this.history.unshift(coup.winner); if (this.history.length > 60) this.history.length = 60;
    return this.last;
  }
}
