import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../rng.js';
import { SYMBOLS, STRIPS, LINES, RULES, linePay, windowAt, evaluate, spin, theoreticalRTP, Slots } from '../slots.js';

test('machine definition: 5 reels, 3 rows, 20 distinct paylines, strips made of known symbols', () => {
  assert.equal(STRIPS.length, 5); assert.equal(LINES.length, 20); assert.equal(new Set(LINES.map(l => l.join(''))).size, 20);
  for (const l of LINES) { assert.equal(l.length, 5); assert.ok(l.every(r => r >= 0 && r <= 2)); }
  for (const s of STRIPS) {
    assert.ok([...s].every(c => SYMBOLS[c])); assert.equal(s.split('K').length - 1, 1);
    for (let i = 0; i < s.length; i++) assert.ok(s[i] !== s[(i + 1) % s.length] && s[i] !== s[(i + 2) % s.length], 'no symbol twice in a window');
  }
  assert.deepEqual(RULES.lineBets.map(b => b * 20 / 100), [1, 2, 5, 10, 20]);
});
test('line pays: left to right, wild substitutes, best of wild-run and symbol', () => {
  const P = (s) => { const r = linePay([...s]); return [r.pay, r.symbol, r.count]; };
  assert.deepEqual(P('YYYAS'), [50, 'Y', 3]); assert.deepEqual(P('YYYYY'), [1000, 'Y', 5]); assert.deepEqual(P('YYASS'), [5, 'Y', 2]);
  assert.equal(P('SYYYY')[0], 0);                                   // must start on the first reel
  assert.deepEqual(P('BYYAS'), [50, 'Y', 3]); assert.deepEqual(P('BBYAS'), [50, 'Y', 3]); assert.deepEqual(P('BBSAH'), [10, 'B', 2]);   // two wilds beat three stars (5)
  assert.deepEqual(P('BBBSS'), [100, 'B', 3]); assert.deepEqual(P('BBBBS'), [500, 'B', 4]);          // four wilds (500) beat five stars (60)
  assert.deepEqual(P('BBBBB'), [2500, 'B', 5]); assert.deepEqual(P('BBBBY'), [1000, 'Y', 5]);
  assert.deepEqual(P('SSBSA'), [15, 'S', 4]); assert.equal(P('SSKSS')[0], 0); assert.equal(P('BKSSS')[0], 0); assert.deepEqual(P('BBKSS'), [10, 'B', 2]);
  assert.equal(P('HHHOA')[0], 5); assert.equal(P('DDOAS')[0], 2); assert.equal(P('GGOAS')[0], 0);
});
test('window, line and scatter evaluation', () => {
  const g = windowAt([0, 0, 0, 0, 0]);
  assert.deepEqual(g.map(c => c.join('')), ['AWH', 'HOD', 'BDH', 'HDW', 'AGO']);
  assert.deepEqual(windowAt([42, 0, 0, 0, 0])[0], ['S', 'A', 'W']);  // strips wrap
  const grid = ['YKA', 'YSK', 'YHA', 'ASK', 'OWH'].map(s => [...s]);
  const e = evaluate(grid, 10);
  assert.deepEqual(e.wins.map(w => [w.line, w.symbol, w.count, w.amount]), [[1, 'Y', 3, 500], [5, 'Y', 2, 50], [17, 'Y', 2, 50]]);     // top row Y Y Y A O; two lines start Y Y
  assert.deepEqual(e.scatter, { count: 3, amount: 5 * 10 * 20 }); assert.equal(e.win, 600 + 1000);
});
test('theoretical RTP from the strips (exact) is about 95 %', () => {
  const t = theoreticalRTP();
  console.log(`slots: theoretical RTP ${(t.total * 100).toFixed(3)} % (lines ${(t.line * 100).toFixed(3)} % + scatter ${(t.scatter * 100).toFixed(3)} %), a given line pays on ${(t.hit * 100).toFixed(2)} % of spins; strips ${STRIPS.map(s => s.length).join('/')}`);
  assert.ok(t.total > 0.945 && t.total < 0.955, 'RTP ' + t.total);
  assert.ok(Math.abs(t.total - 0.950388) < 1e-5);
});
test('the exact figure agrees with a full enumeration of every reel position (middle line + scatter)', () => {
  const L = STRIPS.map(s => s.length), cyc = L.reduce((a, b) => a * b, 1); let pay = 0; const s = new Array(5);
  // payline 1 over every stop combination, pruned on the first three reels (a line needs ≥ 2 matching from the left)
  const memo = new Map();
  for (let a = 0; a < L[0]; a++) for (let b = 0; b < L[1]; b++) for (let c = 0; c < L[2]; c++) {
    s[0] = STRIPS[0][(a + 1) % L[0]]; s[1] = STRIPS[1][(b + 1) % L[1]]; s[2] = STRIPS[2][(c + 1) % L[2]];
    const key = s[0] + s[1] + s[2]; let sub = memo.get(key);
    if (sub === undefined) { sub = 0; for (let d = 0; d < L[3]; d++) for (let e = 0; e < L[4]; e++) { s[3] = STRIPS[3][(d + 1) % L[3]]; s[4] = STRIPS[4][(e + 1) % L[4]]; sub += linePay(s).pay; } memo.set(key, sub); }
    pay += sub;
  }
  const t = theoreticalRTP();
  assert.ok(Math.abs(pay / cyc - t.line) < 1e-9, `enumerated ${pay / cyc} v ${t.line}`);
  // scatter: count windows with a key per reel
  const q = STRIPS.map((st, r) => { let n = 0; for (let i = 0; i < L[r]; i++) if ([0, 1, 2].some(k => st[(i + k) % L[r]] === 'K')) n++; return n / L[r]; });
  let dist = [1]; for (const p of q) { const nd = new Array(dist.length + 1).fill(0); dist.forEach((v, k) => { nd[k] += v * (1 - p); nd[k + 1] += v * p; }); dist = nd; }
  assert.ok(Math.abs(dist.reduce((a, p, k) => a + p * SYMBOLS.K.pays[k], 0) - t.scatter) < 1e-12);
});
test('simulation agrees with the theoretical RTP (seeded, 3 000 000 spins)', () => {
  const r = seededRng(555); let staked = 0, back = 0, hits = 0, top = 0; const N = 3000000;
  for (let i = 0; i < N; i++) { const s = spin(r, 5); staked += s.staked; back += s.returned; if (s.win > 0) hits++; if (s.win > top) top = s.win; }
  console.log(`slots: simulated RTP ${(back / staked * 100).toFixed(2)} % over ${N.toLocaleString('en')} spins, hit frequency ${(hits / N * 100).toFixed(1)} %, biggest win ${(top / 100).toFixed(0)}× the total bet`);
  assert.ok(Math.abs(back / staked - theoreticalRTP().total) < 0.012);
});
test('machine: line bets, forced stops, reproducible', () => {
  const m = new Slots({ rng: seededRng(2) });
  assert.throws(() => m.spin(7));
  const a = m.stack([0, 0, 0, 0, 0]).spin(25); assert.equal(a.staked, 500); assert.deepEqual(a.stops, [0, 0, 0, 0, 0]);
  const x = new Slots({ rng: seededRng(9) }), y = new Slots({ rng: seededRng(9) });
  for (let i = 0; i < 100; i++) assert.deepEqual(x.spin(10), y.spin(10));
  for (let i = 0; i < 500; i++) { const s = x.spin(100); assert.equal(s.returned, s.wins.reduce((t, w) => t + w.amount, 0) + s.scatter.amount); assert.ok(s.stops.every((st, r) => st >= 0 && st < STRIPS[r].length)); }
});
