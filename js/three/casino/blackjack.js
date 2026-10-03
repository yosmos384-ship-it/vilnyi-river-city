// VILNYI Lifestyle casino — blackjack engine, European rules (pure logic; money in integer cents).
//
// Rules implemented (RULES below; every item is a config flag):
//  · 6-deck shoe, cut card at 75 % penetration: when it has come out the shoe is reshuffled before the next round.
//  · European no-hole-card (ENHC): the dealer takes one card face up and draws the second only after all players have
//    acted. A dealer blackjack takes every bet on the table including doubles and splits (no "original bets only");
//    only a player's own natural blackjack pushes against it.
//  · Dealer stands on all 17s, soft 17 included (S17).
//  · Blackjack pays 3:2. Bets are whole euros, so 3:2 always settles exactly to €0.50 (money is integer cents).
//  · Double down on any first two cards (doubleOn: 'any'; set '9-11' for the stricter European variant), one card only.
//  · Double after split allowed. Split any two cards of equal value (10-J-Q-K mix) up to 3 times → 4 hands per box.
//    Split aces receive one card each and stand; aces cannot be re-split. 21 after a split is 21, not a blackjack (1:1).
//  · No surrender. Insurance (half the box's bet) offered on a dealer ace, pays 2:1, settled when the dealer draws.
//  · A push returns the bet. Table limits €5 – €500 per box, up to 3 boxes.
import { Shoe, rankOf } from './rng.js';

export const RULES = Object.freeze({
  decks: 6, penetration: 0.75, burn: 0,
  minBet: 500, maxBet: 50000, betStep: 100, maxBoxes: 3,
  holeCard: false,                 // false = European no-hole-card
  dealerHitsSoft17: false,
  blackjackPays: [3, 2],
  doubleOn: 'any',                 // 'any' | '9-11'
  doubleAfterSplit: true,
  maxSplits: 3,                    // 3 splits → 4 hands per box
  resplitAces: false, splitAcesOneCard: true,
  insurance: true, insurancePays: [2, 1],
  surrender: false,
});

export const valueOf = (c) => { const r = rankOf(c); return r === 0 ? 11 : r >= 9 ? 10 : r + 1; };
/** Best total of a hand. → { total, soft } (soft: an ace is still counted as 11). */
export function handTotal(cs) {
  let t = 0, aces = 0;
  for (const c of cs) { const v = valueOf(c); t += v; if (v === 11) aces++; }
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
export const isNatural = (h) => h.cards.length === 2 && !h.fromSplit && handTotal(h.cards).total === 21;

export class Blackjack {
  /** opts: { rng (required), rules: overrides of RULES } */
  constructor({ rng, rules = {} } = {}) {
    if (!rng) throw new Error('Blackjack needs an rng');
    this.rules = { ...RULES, ...rules };
    this.shoe = new Shoe(this.rules.decks, rng, { penetration: this.rules.penetration, burn: this.rules.burn });
    this.phase = 'bet';              // bet → (insurance) → player → done  (the dealer plays inside the last action)
    this.hands = []; this.dealer = []; this.active = -1; this.round = 0; this.shuffled = false;
  }
  validBet(b) { const R = this.rules; return Number.isInteger(b) && b >= R.minBet && b <= R.maxBet && b % R.betStep === 0; }

  /** Start a round. bets: cents per box (1…maxBoxes entries; 0 = empty box). → events */
  deal(bets) {
    if (this.phase !== 'bet' && this.phase !== 'done') throw new Error('round in progress');
    const R = this.rules, ev = [];
    if (!Array.isArray(bets) || bets.length < 1 || bets.length > R.maxBoxes) throw new Error('1…' + R.maxBoxes + ' boxes');
    const live = bets.map((b, i) => ({ b, i })).filter(o => o.b);
    if (!live.length) throw new Error('no bet');
    for (const o of live) if (!this.validBet(o.b)) throw new Error('bet outside the table limits');
    this.shuffled = false;
    if (this.shoe.cutReached) { this.shoe.shuffle(); this.shuffled = true; ev.push({ t: 'shuffle' }); }
    this.round++; this.dealer = [];
    this.hands = live.map(o => ({ box: o.i, cards: [], bet: o.b, doubled: false, fromSplit: false, splitAces: false, done: false, bust: false, insurance: 0, insured: null, result: null, returned: 0 }));
    const give = (h) => { const c = this.shoe.draw(); h.cards.push(c); ev.push({ t: 'card', hand: this.hands.indexOf(h), card: c }); };
    const up = () => { const c = this.shoe.draw(); this.dealer.push(c); ev.push({ t: 'card', hand: 'dealer', card: c }); };
    for (const h of this.hands) give(h);
    up();
    for (const h of this.hands) give(h);
    if (R.holeCard) { this.hole = this.shoe.draw(); ev.push({ t: 'hole' }); } else this.hole = null;
    for (const h of this.hands) if (isNatural(h)) h.done = true;
    if (R.insurance && rankOf(this.dealer[0]) === 0) { this.phase = 'insurance'; ev.push({ t: 'insurance?' }); return ev; }
    this._toPlayer(ev);
    return ev;
  }
  /** Insurance decisions, one per hand in order (true = take). cost = bet / 2 each. → events */
  insure(decisions) {
    if (this.phase !== 'insurance') throw new Error('no insurance now');
    const ev = [];
    this.hands.forEach((h, i) => { h.insured = !!(Array.isArray(decisions) ? decisions[i] : decisions); h.insurance = h.insured ? h.bet / 2 : 0; if (h.insured) ev.push({ t: 'insured', hand: i, stake: h.insurance }); });
    this._toPlayer(ev);
    return ev;
  }
  _toPlayer(ev) {
    this.phase = 'player'; this.active = -1;
    this._advance(ev);
  }
  // move to the next hand that still has to act; when there is none the dealer plays and the round is settled
  _advance(ev) {
    for (let i = 0; i < this.hands.length; i++) {
      const h = this.hands[i];
      if (h.done) continue;
      if (h.cards.length === 1) {                        // second hand of a split gets its card when its turn comes
        const c = this.shoe.draw(); h.cards.push(c); ev.push({ t: 'card', hand: i, card: c });
        if (handTotal(h.cards).total === 21) { h.done = true; continue; }
      }
      this.active = i; ev.push({ t: 'turn', hand: i }); return;
    }
    this.active = -1;
    this._dealerPlay(ev);
  }
  get hand() { return this.active >= 0 ? this.hands[this.active] : null; }
  /** Amount the action adds to the money on the table (0 when free). */
  cost(action) { const h = this.hand; if (!h) return 0; return action === 'double' || action === 'split' ? h.bet : 0; }
  /** Legal actions for the active hand. funds: cents the player can still put on the table (Infinity = unlimited). */
  legal(funds = Infinity) {
    const R = this.rules, h = this.hand, L = { hit: false, stand: false, double: false, split: false, insurance: this.phase === 'insurance', deal: this.phase === 'bet' || this.phase === 'done' };
    if (this.phase !== 'player' || !h) return L;
    const { total } = handTotal(h.cards), two = h.cards.length === 2;
    L.hit = L.stand = true;
    L.double = two && funds >= h.bet && (!h.fromSplit || R.doubleAfterSplit) && (R.doubleOn === 'any' || (total >= 9 && total <= 11));
    const inBox = this.hands.filter(x => x.box === h.box).length;
    L.split = two && funds >= h.bet && valueOf(h.cards[0]) === valueOf(h.cards[1]) && inBox < R.maxSplits + 1 && !(h.splitAces && !R.resplitAces);
    return L;
  }
  hit() { return this._act('hit'); }
  stand() { return this._act('stand'); }
  double() { return this._act('double'); }
  split() { return this._act('split'); }
  _act(a) {
    const L = this.legal(), h = this.hand, ev = [], i = this.active;
    if (!h || !L[a]) throw new Error('illegal action: ' + a);
    const draw = () => { const c = this.shoe.draw(); h.cards.push(c); ev.push({ t: 'card', hand: i, card: c, double: a === 'double' }); };
    if (a === 'stand') h.done = true;
    else if (a === 'hit' || a === 'double') {
      if (a === 'double') { h.doubled = true; h.bet *= 2; ev.push({ t: 'double', hand: i, bet: h.bet }); }
      draw();
      const { total } = handTotal(h.cards);
      if (total > 21) { h.bust = true; h.done = true; h.result = 'bust'; h.returned = 0; ev.push({ t: 'bust', hand: i }); }
      else if (total === 21 || a === 'double') h.done = true;
    } else if (a === 'split') {
      const aces = rankOf(h.cards[0]) === 0;
      const n = { box: h.box, cards: [h.cards.pop()], bet: h.doubled ? h.bet / 2 : h.bet, doubled: false, fromSplit: true, splitAces: aces, done: false, bust: false, insurance: 0, insured: h.insured, result: null, returned: 0 };
      h.fromSplit = true; h.splitAces = aces;
      this.hands.splice(i + 1, 0, n);
      ev.push({ t: 'split', hand: i, to: i + 1 });
      draw();
      if (aces && this.rules.splitAcesOneCard) {
        const c = this.shoe.draw(); n.cards.push(c); ev.push({ t: 'card', hand: i + 1, card: c });
        h.done = true; n.done = true;
      } else if (handTotal(h.cards).total === 21) h.done = true;
    }
    if (h.done) this._advance(ev); else ev.push({ t: 'turn', hand: i });
    return ev;
  }
  _dealerPlay(ev) {
    const R = this.rules, hs = this.hands;
    const live = hs.filter(h => !h.bust), contest = live.filter(h => !isNatural(h));
    const insured = hs.some(h => h.insurance > 0);
    const up = valueOf(this.dealer[0]), canBJ = up === 11 || up === 10;
    const drawD = () => { const c = this.hole != null ? this.hole : this.shoe.draw(); this.hole = null; this.dealer.push(c); ev.push({ t: 'card', hand: 'dealer', card: c }); };
    // second card: needed to settle anything that is still open (a live hand that a dealer blackjack could beat or
    // push, an insurance bet). Naturals against a 2…9 are paid without a draw.
    if (contest.length || insured || (live.length && canBJ)) drawD();
    const dealerBJ = this.dealer.length === 2 && handTotal(this.dealer).total === 21;
    if (!dealerBJ && contest.length) {
      for (;;) { const { total, soft } = handTotal(this.dealer); if (total > 17 || (total === 17 && !(soft && R.dealerHitsSoft17))) break; drawD(); }
    }
    const d = handTotal(this.dealer).total, dBust = d > 21;
    ev.push({ t: 'dealer', total: d, blackjack: dealerBJ, bust: dBust });
    const [bn, bd] = R.blackjackPays, [inN, inD] = R.insurancePays;
    hs.forEach((h, i) => {
      let ins = 0;
      if (h.insurance > 0) { ins = dealerBJ ? h.insurance + h.insurance * inN / inD : 0; ev.push({ t: 'insurance', hand: i, won: dealerBJ, returned: ins }); }
      if (!h.bust) {
        const p = handTotal(h.cards).total, nat = isNatural(h);
        if (dealerBJ) { h.result = nat ? 'push' : 'lose'; h.returned = nat ? h.bet : 0; }
        else if (nat) { h.result = 'blackjack'; h.returned = h.bet + h.bet * bn / bd; }
        else if (dBust || p > d) { h.result = 'win'; h.returned = h.bet * 2; }
        else if (p === d) { h.result = 'push'; h.returned = h.bet; }
        else { h.result = 'lose'; h.returned = 0; }
      }
      h.insReturned = ins;
      ev.push({ t: 'settle', hand: i, result: h.result, returned: h.returned, bet: h.bet });
    });
    this.phase = 'done';
    this.shuffleNext = this.shoe.cutReached;
    ev.push({ t: 'done', staked: this.staked(), returned: this.returned() });
  }
  /** Total money put on the table this round (bets, doubles, splits, insurance). */
  staked() { return this.hands.reduce((s, h) => s + h.bet + h.insurance, 0); }
  returned() { return this.hands.reduce((s, h) => s + h.returned + (h.insReturned || 0), 0); }
}

// ================================================================== basic strategy for these exact rules
// Computed, not tabulated: expected values on an infinite shoe (the standard basis of a "basic strategy" chart) with
// the no-hole-card rule built in — against a dealer blackjack every unit on the table is lost, so doubles and splits
// against a 10 or an ace are worth less than in the hole-card game.
const PC = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1].map(x => x / 13);      // P(card value v), v = 2…11 (index = value)
const memo = new Map();
function dealerDist(up, R) {                                             // → { 17…21: p, bust, bj }
  const key = 'd' + up + (R.dealerHitsSoft17 ? 'h' : 's'); if (memo.has(key)) return memo.get(key);
  const out = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0, bj: 0 };
  const rec = (t, aces, n, p) => {
    while (t > 21 && aces) { t -= 10; aces--; }
    if (n === 2 && t === 21) { out.bj += p; return; }
    if (n >= 2 && (t > 17 || (t === 17 && !(aces && R.dealerHitsSoft17)))) { if (t > 21) out.bust += p; else out[t] += p; return; }
    for (let v = 2; v <= 11; v++) rec(t + v, aces + (v === 11 ? 1 : 0), n + 1, p * PC[v]);
  };
  rec(up, up === 11 ? 1 : 0, 1, 1);
  memo.set(key, out); return out;
}
// EV of standing on `total` (per unit staked); a dealer blackjack loses the unit
function evStand(total, up, R) { const D = dealerDist(up, R); let e = -D.bj + D.bust; for (let t = 17; t <= 21; t++) e += D[t] * (total > t ? 1 : total < t ? -1 : 0); return total > 21 ? -1 : e; }
function evBest(total, soft, up, R) {                                    // hit / stand only (after the first decision)
  const key = 'b' + total + (soft ? 's' : 'h') + up + (R.dealerHitsSoft17 ? 'h' : 's'); if (memo.has(key)) return memo.get(key);
  const v = Math.max(evStand(total, up, R), evHit(total, soft, up, R)); memo.set(key, v); return v;
}
function evHit(total, soft, up, R) {
  let e = 0;
  for (let v = 2; v <= 11; v++) {
    let t = total + v, s = soft || v === 11;
    if (t > 21 && s) { t -= 10; s = soft && v === 11; }
    e += PC[v] * (t > 21 ? -1 : t === 21 ? evStand(21, up, R) : evBest(t, s, up, R));
  }
  return e;
}
function evDouble(total, soft, up, R) {
  let e = 0;
  for (let v = 2; v <= 11; v++) { let t = total + v, s = soft || v === 11; if (t > 21 && s) t -= 10; e += PC[v] * evStand(t, up, R); }
  return 2 * e;
}
function evSplit(v, up, R) {                                             // pair of value v (11 = aces); no re-split in the estimate
  let e = 0;
  for (let c = 2; c <= 11; c++) {
    let t = v + c, s = v === 11 || c === 11; if (t > 21) t -= 10, s = v === 11 && c === 11 ? true : false;
    let x;
    if (v === 11 && R.splitAcesOneCard) x = evStand(t, up, R);
    else { x = t === 21 ? evStand(21, up, R) : evBest(t, s, up, R); if (R.doubleAfterSplit && (R.doubleOn === 'any' || (t >= 9 && t <= 11))) x = Math.max(x, evDouble(t, s, up, R)); }
    e += PC[c] * x;
  }
  return 2 * e;
}
/**
 * Best action for a hand against the dealer's up card under `rules`.
 * cards: the hand; upCard: dealer's card; can: { double, split } (what is legal right now).
 * → { action: 'hit' | 'stand' | 'double' | 'split', ev: { hit, stand, double?, split? } }
 */
export function basicStrategy(cs, upCard, can = { double: true, split: true }, rules = RULES) {
  const R = { ...RULES, ...rules }, up = valueOf(upCard), { total, soft } = handTotal(cs);
  const ev = { stand: evStand(total, up, R), hit: evHit(total, soft, up, R) };
  if (can.double && cs.length === 2 && (R.doubleOn === 'any' || (total >= 9 && total <= 11))) ev.double = evDouble(total, soft, up, R);
  if (can.split && cs.length === 2 && valueOf(cs[0]) === valueOf(cs[1])) ev.split = evSplit(valueOf(cs[0]), up, R);
  let action = 'stand'; for (const k of ['hit', 'double', 'split']) if (ev[k] !== undefined && ev[k] > ev[action] + 1e-12) action = k;
  return { action, ev };
}
/** Should insurance be taken? Never on an infinite shoe (EV = −1/13 of the stake). */
export const insuranceEV = () => (4 / 13) * 2 - 9 / 13;
