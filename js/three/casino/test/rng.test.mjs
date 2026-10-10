import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng, cryptoRng, shuffle, Shoe, card, cards, cardName, rankOf, suitOf } from '../rng.js?v=3.8';

test('seeded rng is deterministic and in range', () => {
  const a = seededRng(42), b = seededRng(42), c = seededRng(43);
  const xa = Array.from({ length: 200 }, () => a.int(1000)), xb = Array.from({ length: 200 }, () => b.int(1000)), xc = Array.from({ length: 200 }, () => c.int(1000));
  assert.deepEqual(xa, xb); assert.notDeepEqual(xa, xc);
  assert.ok(xa.every(x => Number.isInteger(x) && x >= 0 && x < 1000));
});
test('crypto rng: rejection sampling, no modulo bias', () => {
  // a fake source that returns the worst words first: values ≥ the largest multiple of n must be rejected
  const words = [0xFFFFFFFF, 0xFFFFFFFE, 4294967295 - (4294967296 % 6) /* still ≥ limit? */, 5, 7, 12];
  let k = 0; const fake = { getRandomValues(buf) { for (let i = 0; i < buf.length; i++) buf[i] = words[k++ % words.length]; return buf; } };
  const r = cryptoRng(fake), lim = 4294967296 - (4294967296 % 6);
  const first = r.int(6);
  assert.equal(first, words.find(w => w < lim) % 6);
  // real crypto: uniform over a non-power-of-two range (chi-square, 37 cells, 370k draws; 99.9 % critical ≈ 67.99 for 36 d.o.f.)
  const real = cryptoRng(), n = 37, N = 370000, cnt = new Array(n).fill(0);
  for (let i = 0; i < N; i++) cnt[real.int(n)]++;
  const chi = cnt.reduce((s, c) => s + (c - N / n) ** 2 / (N / n), 0);
  assert.ok(chi < 67.99, 'chi² ' + chi);
  assert.throws(() => real.int(0));
});
test('Fisher–Yates: every permutation of 4 equally likely (seeded, chi-square)', () => {
  const r = seededRng(7), N = 240000, cnt = new Map();
  for (let i = 0; i < N; i++) { const k = shuffle([0, 1, 2, 3], r).join(''); cnt.set(k, (cnt.get(k) || 0) + 1); }
  assert.equal(cnt.size, 24);
  const chi = [...cnt.values()].reduce((s, c) => s + (c - N / 24) ** 2 / (N / 24), 0);
  assert.ok(chi < 49.73, 'chi² ' + chi);      // 99.9 % critical, 23 d.o.f.
});
test('cards and shoe', () => {
  assert.equal(card('As'), 0); assert.equal(card('Kc'), 51); assert.equal(card('10h'), card('Th')); assert.equal(cardName(card('Qd')), 'Qd');
  assert.deepEqual(cards('As Kh').map(c => [rankOf(c), suitOf(c)]), [[0, 0], [12, 1]]);
  const s = new Shoe(6, seededRng(1));
  assert.equal(s.cards.length, 312); assert.equal(s.cut, 234);
  const byCard = new Array(52).fill(0); for (const c of s.cards) byCard[c]++;
  assert.ok(byCard.every(n => n === 6));
  s.stack('As Kd'); assert.equal(s.draw(), card('As')); assert.equal(s.draw(), card('Kd'));
  const s2 = new Shoe(6, seededRng(1)); assert.deepEqual(s2.cards, new Shoe(6, seededRng(1)).cards);
  for (let i = 0; i < 234; i++) s2.draw(); assert.ok(s2.cutReached);
  assert.equal(new Shoe(8, seededRng(3)).cards.length, 416);
});
