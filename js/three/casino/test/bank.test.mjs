import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bank, START, fmt, chipsFor, CHIPS } from '../bank.js?v=3.13';

const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { m.set(k, String(v)); }, m }; };
test('starts with €1,000, stakes, pays, persists', () => {
  const st = mem(), b = new Bank(st);
  assert.equal(b.balance, 100000); assert.equal(START, 100000);
  assert.equal(b.stake(2500), true); assert.equal(b.balance, 97500); assert.equal(b.stake(1e9), false); assert.equal(b.stake(-5), false); assert.equal(b.stake(10.5), false);
  b.pay(6250); b.round(2500, 6250); assert.equal(b.balance, 103750); assert.equal(b.stats.hands, 1); assert.equal(b.stats.biggestWin, 3750);
  const again = new Bank(st); assert.equal(again.balance, 103750); assert.equal(again.stats.biggestWin, 3750); assert.equal(again.session.hands, 0);
});
test('free refill only when broke', () => {
  const b = new Bank(mem());
  assert.equal(b.refill(), false); b.stake(99600); assert.equal(b.balance, 400); assert.ok(b.broke); assert.equal(b.refill(), true); assert.equal(b.balance, 100000); assert.equal(b.stats.refills, 1);
});
test('storage that throws or holds rubbish never breaks the bank', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const b = new Bank(bad); assert.equal(b.balance, 100000); assert.equal(b.stake(500), true); b.pay(1000); assert.equal(b.balance, 100500);
  for (const junk of ['{', '{"balance":-5}', '{"balance":"x"}', 'null', '{"balance":1e99}']) { const st = mem(); st.setItem('vrc.casino.v1', junk); assert.equal(new Bank(st).balance, 100000); }
  assert.equal(new Bank(null).balance, 100000);
});
test('formatting and chip stacks', () => {
  assert.equal(fmt(100000), '€1,000'); assert.equal(fmt(1250), '€12.50'); assert.equal(fmt(0), '€0'); assert.equal(fmt(123456789), '€1,234,567.89'); assert.equal(fmt(-500), '−€5');
  assert.deepEqual(CHIPS, [100, 500, 2500, 10000, 50000]);
  assert.deepEqual(chipsFor(63100), [50000, 10000, 2500, 500, 100]); assert.deepEqual(chipsFor(1500), [500, 500, 500]); assert.equal(chipsFor(900000).length, 12); assert.deepEqual(chipsFor(50), []);
});
