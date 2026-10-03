import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RL, rlCell, betAt } from '../roulette-layout.js';

const K = (u, v) => { const b = betAt(u, v); return b ? b.bet.key : null; };
const [cw, ch] = RL.cell;
test('a tap in the middle of every cell is that number straight up; chips land on the cell', () => {
  for (let n = 0; n <= 36; n++) { const [u, v] = rlCell(n), b = betAt(u, v); assert.equal(b.bet.key, 'straight:' + n); assert.deepEqual(b.pos, [u, v]); }
  assert.ok(rlCell(1)[1] > rlCell(34)[1]);          // 1-2-3 lie at the wheel end, next to the zero
  assert.ok(rlCell(0)[1] > rlCell(1)[1]); assert.ok(rlCell(3)[0] > rlCell(1)[0]);
});
test('lines, crossings and edges give splits, corners, streets, six lines, trios and the first four', () => {
  const mid = (a, b) => [(rlCell(a)[0] + rlCell(b)[0]) / 2, (rlCell(a)[1] + rlCell(b)[1]) / 2];
  for (let n = 1; n <= 36; n++) {
    if (n % 3) assert.equal(K(...mid(n, n + 1)), `split:${n}-${n + 1}`);
    if (n <= 33) assert.equal(K(...mid(n, n + 3)), `split:${n}-${n + 3}`);
    if (n % 3 && n <= 32) assert.equal(K(...mid(n, n + 4)), `corner:${n}-${n + 1}-${n + 3}-${n + 4}`);
  }
  for (let c = 1; c <= 3; c++) assert.equal(K(rlCell(c)[0], RL.v0 + 12 * ch), 'split:0-' + c);
  for (let row = 1; row <= 12; row++) for (const u of [RL.u0, RL.u0 + 3 * cw]) assert.equal(K(u, rlCell(row * 3)[1]), `street:${row * 3 - 2}-${row * 3 - 1}-${row * 3}`);
  for (let row = 1; row <= 11; row++) assert.equal(K(RL.u0 + 3 * cw, (rlCell(row * 3)[1] + rlCell(row * 3 + 3)[1]) / 2), 'sixLine:' + Array.from({ length: 6 }, (_, i) => row * 3 - 2 + i).join('-'));
  assert.equal(K(RL.u0 + cw, RL.v0 + 12 * ch), 'trio:0-1-2'); assert.equal(K(RL.u0 + 2 * cw, RL.v0 + 12 * ch), 'trio:0-2-3');
  assert.equal(K(RL.u0, RL.v0 + 12 * ch), 'firstFour:0-1-2-3'); assert.equal(K(RL.u0 + 3 * cw, RL.v0 + 12 * ch), 'firstFour:0-1-2-3');
});
test('outside bets and off-layout taps', () => {
  for (let c = 1; c <= 3; c++) assert.equal(K(RL.u0 + (c - 0.5) * cw, RL.v0 - RL.colH / 2), 'column:' + c);
  assert.equal(K(RL.u0 - RL.dozW / 2, rlCell(2)[1]), 'dozen:1'); assert.equal(K(RL.u0 - RL.dozW / 2, rlCell(17)[1]), 'dozen:2'); assert.equal(K(RL.u0 - RL.dozW / 2, rlCell(35)[1]), 'dozen:3');
  const ev = (i) => K(RL.uL + RL.evW / 2, RL.v0 + (i * 2 + 1) * ch);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => ev(i).split(':')[0]), ['high', 'odd', 'black', 'red', 'even', 'low']);
  for (const [u, v] of [[RL.uL - 0.05, 0.5], [RL.u0 + 3 * cw + 0.06, 0.5], [0, RL.vB - 0.05], [0, RL.v0 + 12 * ch + RL.zeroH + 0.05], [RL.uL + 0.02, RL.v0 + 12 * ch + 0.05]]) assert.equal(betAt(u, v), null);
  // every point of a fine grid over the layout gives either nothing or a valid bet whose chips lie on the layout
  for (let u = RL.uL - 0.03; u < RL.u0 + 3 * cw + 0.03; u += 0.007) for (let v = RL.vB - 0.03; v < RL.v0 + 12 * ch + RL.zeroH + 0.03; v += 0.007) {
    const b = betAt(u, v); if (!b) continue;
    assert.ok(b.bet.numbers.length >= 1 && b.bet.pays >= 1); assert.ok(Math.hypot(b.pos[0] - u, b.pos[1] - v) < 0.75);
  }
});
