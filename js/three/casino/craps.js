// VILNYI Lifestyle casino — craps: the pass line with free odds (pure logic, money in integer cents).
// Come-out roll: 7 or 11 wins 1:1, 2 / 3 / 12 loses, anything else becomes the point. Then the point before a 7 wins.
// Odds may be added behind the line once a point is set (up to 3× on 4 / 10, 4× on 5 / 9, 5× on 6 / 8) and pay the
// true odds: 2:1 on 4 / 10, 3:2 on 5 / 9, 6:5 on 6 / 8.
export const RULES = Object.freeze({ minBet: 500, maxBet: 50000, betStep: 100, oddsMult: { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 } });
export const ODDS_PAY = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };
/** One roll applied to a state { point: 0 | 4…10 }. → { outcome: 'win' | 'lose' | 'point' | 'roll', point } */
export function resolve(point, d1, d2) {
  const s = d1 + d2;
  if (!point) { if (s === 7 || s === 11) return { outcome: 'win', point: 0 }; if (s === 2 || s === 3 || s === 12) return { outcome: 'lose', point: 0 }; return { outcome: 'point', point: s }; }
  if (s === point) return { outcome: 'win', point: 0 };
  if (s === 7) return { outcome: 'lose', point: 0 };
  return { outcome: 'roll', point };
}
export class Craps {
  constructor({ rng, rules = {} } = {}) { if (!rng) throw new Error('Craps needs an rng'); this.rng = rng; this.rules = { ...RULES, ...rules }; this.point = 0; this.pass = 0; this.odds = 0; this.phase = 'bet'; this.forced = []; this.history = []; }
  /** Force the next rolls (tests / demos): [[d1, d2], …]. */
  stack(rolls) { this.forced.push(...rolls); return this; }
  validBet(b) { const R = this.rules; return Number.isInteger(b) && b >= R.minBet && b <= R.maxBet && b % R.betStep === 0; }
  /** Put a pass-line bet down (only before a come-out roll). */
  bet(amount) { if (this.phase !== 'bet') throw new Error('the pass line is closed until the point is decided'); if (!this.validBet(amount)) throw new Error('bet outside the table limits'); this.pass = amount; this.odds = 0; this.phase = 'comeout'; }
  maxOdds() { return this.point ? this.pass * this.rules.oddsMult[this.point] : 0; }
  /** Odds step that pays in whole cents and whole chips: multiples of €1 on 4 / 10, €2 on 5 / 9, €5 on 6 / 8. */
  oddsStep() { return this.point ? { 4: 100, 10: 100, 5: 200, 9: 200, 6: 500, 8: 500 }[this.point] : 0; }
  /** Set the odds bet behind the line (0 to take it down). */
  setOdds(amount) {
    if (this.phase !== 'point') throw new Error('odds only once a point is set');
    if (!Number.isInteger(amount) || amount < 0 || amount > this.maxOdds() || amount % this.oddsStep() !== 0) throw new Error('odds outside the limits');
    this.odds = amount;
  }
  /** Roll the dice. → { d1, d2, sum, outcome, point, staked, returned } (returned only when the bet is decided) */
  roll() {
    if (this.phase !== 'comeout' && this.phase !== 'point') throw new Error('place a pass-line bet first');
    const [d1, d2] = this.forced.length ? this.forced.shift() : [this.rng.int(6) + 1, this.rng.int(6) + 1];
    const was = this.point, r = resolve(this.point, d1, d2), out = { d1, d2, sum: d1 + d2, outcome: r.outcome, point: r.point, was, staked: 0, returned: 0 };
    this.history.unshift(d1 + d2); if (this.history.length > 30) this.history.length = 30;
    if (r.outcome === 'point') { this.point = r.point; this.phase = 'point'; }
    else if (r.outcome === 'win' || r.outcome === 'lose') {
      out.staked = this.pass + this.odds;
      if (r.outcome === 'win') { const [n, d] = was ? ODDS_PAY[was] : [0, 1]; out.returned = this.pass * 2 + (this.odds ? this.odds + this.odds * n / d : 0); }
      this.point = 0; this.pass = 0; this.odds = 0; this.phase = 'bet';
    }
    return out;
  }
}
