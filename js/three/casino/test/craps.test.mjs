import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../rng.js?v=3.12';
import { Craps, resolve, ODDS_PAY, RULES } from '../craps.js?v=3.12';

test('come-out and point rules', () => {
  assert.equal(resolve(0, 3, 4).outcome, 'win'); assert.equal(resolve(0, 5, 6).outcome, 'win');
  for (const [a, b] of [[1, 1], [1, 2], [6, 6]]) assert.equal(resolve(0, a, b).outcome, 'lose');
  assert.deepEqual(resolve(0, 2, 2), { outcome: 'point', point: 4 });
  assert.equal(resolve(6, 3, 3).outcome, 'win'); assert.equal(resolve(6, 3, 4).outcome, 'lose'); assert.deepEqual(resolve(6, 5, 6), { outcome: 'roll', point: 6 }); assert.equal(resolve(6, 1, 1).outcome, 'roll');
});
test('pass line and odds payouts', () => {
  const g = new Craps({ rng: seededRng(1) });
  assert.throws(() => g.roll()); assert.throws(() => g.bet(400));
  g.bet(1000); g.stack([[3, 4]]); let r = g.roll(); assert.equal(r.outcome, 'win'); assert.equal(r.returned, 2000); assert.equal(g.phase, 'bet');
  g.bet(1000); g.stack([[1, 2]]); r = g.roll(); assert.equal(r.outcome, 'lose'); assert.equal(r.returned, 0);
  g.bet(1000); assert.throws(() => g.setOdds(1000)); g.stack([[2, 2]]); g.roll(); assert.equal(g.point, 4); assert.throws(() => g.bet(1000));
  assert.equal(g.maxOdds(), 3000); assert.throws(() => g.setOdds(3100)); g.setOdds(3000);
  g.stack([[5, 6], [1, 3]]); assert.equal(g.roll().outcome, 'roll'); r = g.roll(); assert.equal(r.outcome, 'win'); assert.equal(r.staked, 4000); assert.equal(r.returned, 2000 + 3000 + 6000);
  g.bet(1000); g.stack([[2, 3]]); g.roll(); assert.equal(g.maxOdds(), 4000); assert.throws(() => g.setOdds(500)); g.setOdds(2000); g.stack([[4, 1]]); assert.equal(g.roll().returned, 2000 + 2000 + 3000);
  g.bet(1000); g.stack([[4, 4]]); g.roll(); assert.equal(g.maxOdds(), 5000); assert.throws(() => g.setOdds(1200)); g.setOdds(5000); g.stack([[6, 2]]); assert.equal(g.roll().returned, 2000 + 5000 + 6000);
  g.bet(1000); g.stack([[4, 4], [3, 4]]); g.roll(); g.setOdds(5000); r = g.roll(); assert.equal(r.outcome, 'lose'); assert.equal(r.returned, 0); assert.equal(r.staked, 6000);
  assert.deepEqual(RULES.oddsMult, { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 }); assert.deepEqual(ODDS_PAY[6], [6, 5]);
});
test('exact pass-line probability 244/495 and zero edge on the odds', () => {
  const ways = (s) => 6 - Math.abs(7 - s);                         // ways to roll a sum
  let win = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const r = resolve(0, a, b);
    if (r.outcome === 'win') win += 1 / 36;
    else if (r.outcome === 'point') {                              // P(point before 7) from the engine's own rules
      let w = 0, l = 0; for (let c = 1; c <= 6; c++) for (let d = 1; d <= 6; d++) { const q = resolve(r.point, c, d).outcome; if (q === 'win') w++; else if (q === 'lose') l++; }
      assert.equal(w, ways(r.point)); assert.equal(l, 6);
      win += (1 / 36) * w / (w + l);
      const [n, dd] = ODDS_PAY[r.point]; assert.ok(Math.abs(w / (w + l) * (1 + n / dd) - 1) < 1e-12);   // odds are fair
    }
  }
  assert.ok(Math.abs(win - 244 / 495) < 1e-12);
  console.log(`craps: pass line wins ${(win * 100).toFixed(4)} % → house edge ${((1 - 2 * win) * 100).toFixed(3)} % (RTP ${(2 * win * 100).toFixed(3)} %); odds bets pay true odds (0 % edge)`);
});
test('seeded dice are fair and reproducible', () => {
  const a = new Craps({ rng: seededRng(12) }), b = new Craps({ rng: seededRng(12) }), cnt = new Array(13).fill(0), seq = [[], []];
  for (let i = 0; i < 72000; i++) { for (const [k, g] of [[0, a], [1, b]]) { if (g.phase === 'bet') g.bet(500); const r = g.roll(); seq[k].push(r.sum); if (k === 0) cnt[r.sum]++; } }
  assert.deepEqual(seq[0], seq[1]);
  for (let s = 2; s <= 12; s++) assert.ok(Math.abs(cnt[s] / 72000 - (6 - Math.abs(7 - s)) / 36) < 0.006, 'sum ' + s);
});
