// VILNYI Lifestyle casino — European roulette engine (single zero; pure logic, money in integer cents).
// All inside bets (straight 35:1, split 17:1, street / trio 11:1, corner / first four 8:1, six line 5:1) and outside
// bets (red / black, odd / even, low / high 1:1; dozens, columns 2:1). Optional "la partage" (half of the even-money
// stakes back on zero) — off by default.
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
export const RULES = Object.freeze({ minBet: 100, maxInside: 10000, maxOutside: 50000, maxTotal: 200000, laPartage: false });
const PAYS = { 1: 35, 2: 17, 3: 11, 4: 8, 6: 5, 12: 2, 18: 1 };      // by how many numbers the bet covers
const range = (a, b, step = 1) => { const o = []; for (let i = a; i <= b; i += step) o.push(i); return o; };
const rowOf = (n) => Math.ceil(n / 3);                                // 1…12 (the "street" of a number)

/** Bet builders. Each returns { type, numbers, pays, key } or throws on an impossible placement. */
export const BET = {
  straight(n) { if (!Number.isInteger(n) || n < 0 || n > 36) throw new Error('straight: 0…36'); return mk('straight', [n]); },
  split(a, b) {
    [a, b] = [Math.min(a, b), Math.max(a, b)];
    const ok = (a === 0 && b >= 1 && b <= 3) || (a >= 1 && b <= 36 && (b - a === 3 || (b - a === 1 && rowOf(a) === rowOf(b))));
    if (!ok || !Number.isInteger(a) || !Number.isInteger(b)) throw new Error('split: numbers are not neighbours'); return mk('split', [a, b]);
  },
  street(row) { if (!Number.isInteger(row) || row < 1 || row > 12) throw new Error('street: row 1…12'); return mk('street', [row * 3 - 2, row * 3 - 1, row * 3]); },
  trio(k) { if (k !== 1 && k !== 2) throw new Error('trio: 1 (0-1-2) or 2 (0-2-3)'); return mk('trio', k === 1 ? [0, 1, 2] : [0, 2, 3]); },
  corner(n) { if (!Number.isInteger(n) || n < 1 || n > 32 || n % 3 === 0) throw new Error('corner: lowest number of the square'); return mk('corner', [n, n + 1, n + 3, n + 4]); },
  firstFour() { return mk('firstFour', [0, 1, 2, 3]); },
  sixLine(row) { if (!Number.isInteger(row) || row < 1 || row > 11) throw new Error('six line: row 1…11'); return mk('sixLine', range(row * 3 - 2, row * 3 + 3)); },
  column(c) { if (![1, 2, 3].includes(c)) throw new Error('column 1…3'); return mk('column', range(c, 36, 3), c); },
  dozen(d) { if (![1, 2, 3].includes(d)) throw new Error('dozen 1…3'); return mk('dozen', range(d * 12 - 11, d * 12), d); },
  red() { return mk('red', [...REDS].sort((a, b) => a - b)); },
  black() { return mk('black', range(1, 36).filter(n => !REDS.has(n))); },
  odd() { return mk('odd', range(1, 36, 2)); },
  even() { return mk('even', range(2, 36, 2)); },
  low() { return mk('low', range(1, 18)); },
  high() { return mk('high', range(19, 36)); },
};
function mk(type, numbers, tag) { return { type, numbers, pays: PAYS[numbers.length], outside: numbers.length >= 12, evenMoney: numbers.length === 18, key: type + ':' + (tag ?? numbers.join('-')) }; }

/** Spin: uniform pocket of the wheel. → { number, index (position on the wheel), color } */
export function spin(rng) { const index = rng.int(37), number = WHEEL[index]; return { number, index, color: colorOf(number) }; }
/** Money returned for one bet (stake included) when `number` comes up. */
export function payout(bet, amount, number, rules = RULES) {
  if (bet.numbers.includes(number)) return amount * (bet.pays + 1);
  if (number === 0 && bet.evenMoney && rules.laPartage) return amount / 2;
  return 0;
}
/** Settle a list of { bet, amount }. → { staked, returned, wins: [{ bet, amount, returned }] } */
export function settle(bets, number, rules = RULES) {
  let staked = 0, returned = 0; const wins = [];
  for (const { bet, amount } of bets) { const r = payout(bet, amount, number, rules); staked += amount; returned += r; if (r > 0) wins.push({ bet, amount, returned: r }); }
  return { staked, returned, wins };
}
/** A table: chips are added to bets by key; limits are checked. */
export class Roulette {
  constructor({ rng, rules = {} } = {}) { if (!rng) throw new Error('Roulette needs an rng'); this.rng = rng; this.rules = { ...RULES, ...rules }; this.bets = new Map(); this.history = []; this.last = null; }
  total() { let s = 0; for (const b of this.bets.values()) s += b.amount; return s; }
  /** Add `amount` to a bet. → true, or a reason string when refused. */
  place(bet, amount) {
    const R = this.rules, cur = this.bets.get(bet.key), now = (cur ? cur.amount : 0) + amount;
    if (!Number.isInteger(amount) || amount < R.minBet) return 'min';
    if (now > (bet.outside ? R.maxOutside : R.maxInside)) return 'max';
    if (this.total() + amount > R.maxTotal) return 'max';
    if (cur) cur.amount = now; else this.bets.set(bet.key, { bet, amount });
    return true;
  }
  remove(key) { const b = this.bets.get(key); this.bets.delete(key); return b ? b.amount : 0; }
  clear() { const t = this.total(); this.bets.clear(); return t; }
  /** Spin and settle; the bets stay on the layout record `last` and the table is cleared. */
  spin() {
    const res = spin(this.rng), list = [...this.bets.values()], s = settle(list, res.number, this.rules);
    this.last = { ...res, ...s, bets: list.map(b => ({ bet: b.bet, amount: b.amount })) };
    this.history.unshift(res.number); if (this.history.length > 40) this.history.length = 40;
    this.bets.clear();
    return this.last;
  }
}
