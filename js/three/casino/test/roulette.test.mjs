import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../rng.js?v=3.11';
import { WHEEL, REDS, colorOf, BET, payout, settle, spin, Roulette, RULES } from '../roulette.js?v=3.11';

test('wheel order and colours of the European wheel', () => {
  assert.equal(WHEEL.length, 37); assert.deepEqual([...WHEEL].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
  assert.deepEqual(WHEEL.slice(0, 10), [0, 32, 15, 19, 4, 21, 2, 25, 17, 34]); assert.deepEqual(WHEEL.slice(-5), [28, 12, 35, 3, 26]);
  assert.equal(REDS.size, 18); assert.equal(colorOf(0), 'green'); assert.equal(colorOf(1), 'red'); assert.equal(colorOf(2), 'black'); assert.equal(colorOf(10), 'black'); assert.equal(colorOf(11), 'black');
  assert.equal(colorOf(12), 'red'); assert.equal(colorOf(19), 'red'); assert.equal(colorOf(28), 'black'); assert.equal(colorOf(29), 'black'); assert.equal(colorOf(36), 'red');
  // on the wheel the colours alternate all the way round (zero aside)
  for (let i = 1; i < 36; i++) assert.notEqual(colorOf(WHEEL[i]), colorOf(WHEEL[i + 1]));
});
test('bet definitions and payouts', () => {
  const P = (b) => [b.numbers.length, b.pays];
  assert.deepEqual(P(BET.straight(17)), [1, 35]); assert.deepEqual(P(BET.split(17, 20)), [2, 17]); assert.deepEqual(P(BET.split(17, 18)), [2, 17]); assert.deepEqual(P(BET.split(0, 2)), [2, 17]);
  assert.deepEqual(BET.street(6).numbers, [16, 17, 18]); assert.equal(BET.street(6).pays, 11); assert.deepEqual(BET.trio(2).numbers, [0, 2, 3]); assert.equal(BET.trio(1).pays, 11);
  assert.deepEqual(BET.corner(17).numbers, [17, 18, 20, 21]); assert.equal(BET.corner(17).pays, 8); assert.deepEqual(P(BET.firstFour()), [4, 8]);
  assert.deepEqual(BET.sixLine(1).numbers, [1, 2, 3, 4, 5, 6]); assert.equal(BET.sixLine(11).pays, 5); assert.deepEqual(BET.sixLine(11).numbers, [31, 32, 33, 34, 35, 36]);
  assert.deepEqual(BET.column(3).numbers.slice(0, 3), [3, 6, 9]); assert.deepEqual(P(BET.column(1)), [12, 2]); assert.deepEqual(BET.dozen(2).numbers, [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]); assert.equal(BET.dozen(2).pays, 2);
  for (const k of ['red', 'black', 'odd', 'even', 'low', 'high']) assert.deepEqual(P(BET[k]()), [18, 1]);
  assert.ok(!BET.red().numbers.some(n => BET.black().numbers.includes(n))); assert.ok(!BET.even().numbers.includes(0));
  for (const bad of [() => BET.split(3, 4), () => BET.split(1, 5), () => BET.split(0, 4), () => BET.split(36, 37), () => BET.corner(3), () => BET.corner(34), () => BET.street(13), () => BET.sixLine(12), () => BET.straight(37), () => BET.column(4), () => BET.dozen(0)]) assert.throws(bad);
  assert.equal(payout(BET.straight(17), 100, 17), 3600); assert.equal(payout(BET.straight(17), 100, 18), 0);
  assert.equal(payout(BET.split(17, 20), 500, 20), 9000); assert.equal(payout(BET.corner(17), 500, 21), 4500); assert.equal(payout(BET.sixLine(1), 500, 6), 3000);
  assert.equal(payout(BET.street(1), 500, 2), 6000); assert.equal(payout(BET.dozen(1), 500, 12), 1500); assert.equal(payout(BET.red(), 500, 12), 1000); assert.equal(payout(BET.red(), 500, 0), 0);
});
test('every bet type returns 36/37 = 97.297 % (exhaustive over the 37 pockets)', () => {
  const all = [BET.straight(0), BET.straight(36), BET.split(8, 11), BET.split(0, 3), BET.street(4), BET.trio(1), BET.corner(32), BET.firstFour(), BET.sixLine(7), BET.column(2), BET.dozen(3), BET.red(), BET.black(), BET.odd(), BET.even(), BET.low(), BET.high()];
  for (const b of all) { let back = 0; for (let n = 0; n <= 36; n++) back += payout(b, 3700, n); assert.equal(back / (3700 * 37), 36 / 37, b.key); }
  console.log(`roulette: RTP of every bet ${(36 / 37 * 100).toFixed(3)} % (house edge ${(100 / 37).toFixed(3)} %); with la partage the even chances return ${((1 - 0.5 / 37) * 100).toFixed(3)} %`);
});
test('la partage flag (off by default): half back on zero for even chances only', () => {
  assert.equal(RULES.laPartage, false);
  assert.equal(payout(BET.red(), 1000, 0), 0); assert.equal(payout(BET.red(), 1000, 0, { laPartage: true }), 500);
  assert.equal(payout(BET.dozen(1), 1000, 0, { laPartage: true }), 0); assert.equal(payout(BET.straight(5), 1000, 0, { laPartage: true }), 0);
  let back = 0; for (let n = 0; n <= 36; n++) back += payout(BET.even(), 3700, n, { laPartage: true }); assert.ok(Math.abs(back / (3700 * 37) - (1 - 0.5 / 37)) < 1e-12);
});
test('several chips on one spin are settled together', () => {
  const bets = [{ bet: BET.straight(17), amount: 500 }, { bet: BET.split(17, 20), amount: 500 }, { bet: BET.corner(14), amount: 500 }, { bet: BET.red(), amount: 2500 }, { bet: BET.dozen(2), amount: 1000 }, { bet: BET.column(1), amount: 1000 }, { bet: BET.straight(0), amount: 100 }];
  const s = settle(bets, 17);                      // 17: black, 2nd dozen, 2nd column
  assert.equal(s.staked, 6100); assert.equal(s.returned, 500 * 36 + 500 * 18 + 500 * 9 + 1000 * 3); assert.equal(s.wins.length, 4);
  assert.equal(settle(bets, 0).returned, 3600);
});
test('table: limits, stacking chips, spin lands on the engine\'s number, history, determinism', () => {
  const t = new Roulette({ rng: seededRng(9) });
  assert.equal(t.place(BET.straight(7), 50), 'min'); assert.equal(t.place(BET.straight(7), 500), true); assert.equal(t.place(BET.straight(7), 2500), true);
  assert.equal(t.bets.get('straight:7').amount, 3000); assert.equal(t.place(BET.straight(7), 10000), 'max'); assert.equal(t.place(BET.red(), 50000), true); assert.equal(t.place(BET.red(), 100), 'max');
  assert.equal(t.total(), 53000);
  const r = t.spin(); assert.equal(WHEEL[r.index], r.number); assert.equal(r.staked, 53000); assert.equal(t.total(), 0); assert.equal(t.history[0], r.number);
  assert.equal(r.returned, (r.number === 7 ? 3000 * 36 : 0) + (REDS.has(r.number) ? 100000 : 0));
  const a = new Roulette({ rng: seededRng(5) }), b = new Roulette({ rng: seededRng(5) });
  const sa = Array.from({ length: 50 }, () => a.spin().number), sb = Array.from({ length: 50 }, () => b.spin().number); assert.deepEqual(sa, sb);
});
test('spin is uniform over the 37 pockets (seeded, chi-square)', () => {
  const r = seededRng(123), N = 370000, cnt = new Array(37).fill(0); for (let i = 0; i < N; i++) cnt[spin(r).number]++;
  const chi = cnt.reduce((s, c) => s + (c - N / 37) ** 2 / (N / 37), 0); assert.ok(chi < 67.99, 'chi² ' + chi);
});
