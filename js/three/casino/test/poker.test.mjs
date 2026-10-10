import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng, cards } from '../rng.js?v=3.10';
import { eval5, best, CAT } from '../poker.js?v=3.10';
import { VideoPoker, PAYTABLE, category, payFor } from '../videopoker.js?v=3.10';
import { CasinoHoldem, settle, qualifies, antePays } from '../holdem.js?v=3.10';

const E5 = (s) => eval5(cards(s));
test('five-card ranking: categories and tie-breaks', () => {
  const order = ['7s 5h 4d 3c 2s', 'As Kh 4d 3c 2s', '2s 2h 5d 4c 3s', 'As Ah 5d 4c 3s', '3s 3h 2d 2c As', 'Ks Kh Qd Qc 2s', '2s 2h 2d 4c 3s', 'As 2h 3d 4c 5s', '2s 3h 4d 5c 6s', 'Ts Jh Qd Kc As',
    '2s 4s 6s 8s Ts', 'As Ks Qs Js 9s', '2s 2h 2d 3c 3s', 'As Ah Ad Kc Ks', '2s 2h 2d 2c 3s', 'As 2s 3s 4s 5s', '9h Th Jh Qh Kh', 'Td Jd Qd Kd Ad'];
  const sc = order.map(s => E5(s).score); for (let i = 1; i < sc.length; i++) assert.ok(sc[i] > sc[i - 1], order[i]);
  assert.deepEqual(order.map(s => E5(s).cat), [0, 0, 1, 1, 2, 2, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9]);
  assert.equal(E5('As 2h 3d 4c 5s').ranks[0], 5);                  // the wheel is five-high
  assert.equal(E5('Qs Kh As 2d 3c').cat, 0);                       // no wrap-around straight
  assert.equal(E5('As Kh Qd Jc 9s').score > E5('As Kh Qd Tc 9s').score, true);
  assert.equal(E5('9s 9h Ad 3c 2s').score > E5('9d 9c Kd Qc Js').score, true);     // kicker decides
  assert.equal(E5('9s 9h Ad 3c 2s').score, E5('9d 9c As 3h 2d').score);            // suits never do
});
test('exhaustive count of all 2 598 960 five-card hands', () => {
  const n = new Array(10).fill(0); let jacks = 0; const h = [0, 0, 0, 0, 0];
  for (let a = 0; a < 48; a++) for (let b = a + 1; b < 49; b++) for (let c = b + 1; c < 50; c++) for (let d = c + 1; d < 51; d++) for (let e = d + 1; e < 52; e++) {
    h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e; const r = eval5(h); n[r.cat]++; if (r.cat === 1 && r.ranks[0] >= 11) jacks++;
  }
  assert.deepEqual(n, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 36, 4]);
  assert.equal(jacks, 337920);
  // value of the dealt hand alone under 9/6 (no draw): a sanity figure, not the game's RTP
  const pays = [0, 0, 2, 3, 4, 6, 9, 25, 50, 800], tot = n.reduce((s, c, i) => s + c * pays[i], 0) + jacks;
  console.log(`video poker 9/6: dealt-hand frequencies verified over all 2,598,960 hands (pat value ${(tot / 2598960 * 100).toFixed(2)} % before the draw; optimal-play RTP of 9/6 Jacks or Better is 99.54 % — published figure, not recomputed here)`);
});
test('best of seven', () => {
  const b = best(cards('As Ks 2d 7s 9s 9h Qs'));                   // flush in spades beats the pair
  assert.equal(b.cat, 5); assert.deepEqual(b.ranks, [14, 13, 12, 9, 7]);
  assert.equal(best(cards('2s 3h 4d 5c 6s 7h 8d')).ranks[0], 8);   // best straight of three
  assert.equal(best(cards('As Ah Ad Ks Kh Kd 2c')).cat, 6); assert.deepEqual(best(cards('As Ah Ad Ks Kh Kd 2c')).ranks, [14, 13]);
  assert.equal(best(cards('Ah 2s 3s 4s 5s 9d Kd')).cat, 4);        // wheel with the ace of another suit
  assert.equal(best(cards('As 2s 3s 4s 5s 9d Kd')).cat, 8);
  assert.equal(CAT[best(cards('Ts Js Qs Ks As 2d 2h')).cat], 'Royal flush');
});
test('Jacks or Better 9/6: paytable and categories', () => {
  const pay = Object.fromEntries(PAYTABLE.map(r => [r.id, r.pays]));
  assert.deepEqual([pay.full[0], pay.flush[0]], [9, 6]);            // "9/6"
  assert.deepEqual(pay.royal, [250, 500, 750, 1000, 4000]); assert.deepEqual(PAYTABLE.map(r => r.pays[0]), [250, 50, 25, 9, 6, 4, 3, 2, 1]);
  const C = (s) => category(cards(s));
  assert.equal(C('Ts Js Qs Ks As'), 'royal'); assert.equal(C('9s Ts Js Qs Ks'), 'sflush'); assert.equal(C('9s 9h 9d 9c Ks'), 'four'); assert.equal(C('9s 9h 9d Kc Ks'), 'full');
  assert.equal(C('2s 5s 9s Js Ks'), 'flush'); assert.equal(C('As 2h 3d 4c 5s'), 'straight'); assert.equal(C('9s 9h 9d 2c Ks'), 'three'); assert.equal(C('9s 9h 2d 2c Ks'), 'twopair');
  assert.equal(C('Js Jh 2d 3c Ks'), 'jacks'); assert.equal(C('As Ah 2d 3c Ks'), 'jacks'); assert.equal(C('Ts Th 2d 3c Ks'), null); assert.equal(C('As Kh Qd Jc 9s'), null);
  assert.equal(payFor('royal', 5), 4000); assert.equal(payFor('jacks', 3), 3); assert.equal(payFor(null, 5), 0);
});
test('video poker: deal, hold, draw', () => {
  const g = new VideoPoker({ rng: seededRng(3) });
  g.stack(cards('Js Jh 2d 3c 7s  Jd 4c 5c'));
  const d = g.deal(5, 100); assert.equal(d.staked, 500); assert.equal(d.category, 'jacks'); assert.throws(() => g.deal(5, 100));
  g.hold(0); g.hold(1);
  const r = g.draw(); assert.deepEqual(r.hand, cards('Js Jh Jd 4c 5c')); assert.equal(r.category, 'three'); assert.equal(r.win, 15 * 100); assert.deepEqual(r.replaced, [2, 3, 4]);
  assert.throws(() => g.draw());
  g.stack(cards('Ts Js Qs Ks As')); g.deal(5, 25); for (let i = 0; i < 5; i++) g.hold(i); assert.equal(g.draw().win, 4000 * 25);
  g.stack(cards('Ts Js Qs Ks As')); g.deal(1, 25); for (let i = 0; i < 5; i++) g.hold(i); assert.equal(g.draw().win, 250 * 25);
  g.stack(cards('2s 7h 9d Jc Ks  3s 4s 5s 6s 8s')); g.deal(1, 100); const x = g.draw(); assert.deepEqual(x.hand, cards('3s 4s 5s 6s 8s')); assert.equal(x.category, 'flush'); assert.equal(x.win, 600);
  assert.throws(() => g.deal(6, 100)); assert.throws(() => g.deal(0, 100));
  // a pack is 52 distinct cards and the draw never repeats a dealt card
  for (let i = 0; i < 300; i++) { const h = g.deal(1, 25).hand.slice(); const after = g.draw().hand; assert.equal(new Set([...h, ...after]).size, 10); }
});
test('Casino Hold\'em: qualification, ante table, settlement', () => {
  assert.equal(qualifies(best(cards('4s 4h 9d Jc Ks 2d 7h'))), true); assert.equal(qualifies(best(cards('3s 3h 9d Jc Ks 2d 7h'))), false); assert.equal(qualifies(best(cards('As Kh 9d Jc 5s 2d 7h'))), false);
  assert.deepEqual([9, 8, 7, 6, 5, 4, 3, 0].map(antePays), [100, 20, 10, 3, 2, 1, 1, 1]);
  const g = new CasinoHoldem({ rng: seededRng(8) });
  // player A-A, dealer K-Q, board K 7 2 | 9 3 → dealer pair of kings qualifies, player wins: ante 1:1, call 1:1
  g.stack(cards('As Ah  Kd Qc  Ks 7h 2d  9c 3s')); g.deal(1000); assert.equal(g.callCost(), 2000);
  let r = g.call(); assert.equal(r.result, 'win'); assert.equal(r.staked, 3000); assert.equal(r.returned, 2000 + 4000);
  // dealer does not qualify: ante paid, call pushed
  g.stack(cards('As Ah  3d 8c  Ks 7h 2d  9c Js')); g.deal(1000); r = g.call(); assert.equal(r.result, 'noqualify'); assert.equal(r.returned, 2000 + 2000);
  // dealer does not qualify even though the player's hand is worse: the ante is still paid
  g.stack(cards('4s 5h  Ad 8c  Ks 7h 2d  9c Js')); g.deal(1000); r = g.call(); assert.equal(r.result, 'noqualify'); assert.equal(r.returned, 4000);
  // flush for the player: ante 2:1
  g.stack(cards('As 9s  Kd Kc  Ks 7s 2s  9c 3d')); g.deal(1000); r = g.call(); assert.equal(r.result, 'win'); assert.equal(r.returned, 1000 + 2000 + 4000);
  // dealer wins
  g.stack(cards('As 9d  Kd Kc  Ks 7s 2s  9c 3d')); g.deal(1000); r = g.call(); assert.equal(r.result, 'lose'); assert.equal(r.returned, 0);
  // tie on the board
  g.stack(cards('2s 3d  2h 3c  As Ks Qd  Jc Th')); g.deal(1000); r = g.call(); assert.equal(r.result, 'push'); assert.equal(r.returned, 3000);
  // fold
  g.stack(cards('2s 7d  Ah Ac  Ks Qs Jd  4c 5h')); g.deal(1000); r = g.fold(); assert.equal(r.result, 'fold'); assert.equal(r.returned, 0); assert.equal(r.staked, 1000);
  assert.throws(() => g.deal(400)); assert.throws(() => g.call());
  assert.equal(settle(500, true, cards('Ts Js Qs Ks As 2d 3d'), cards('2c 2h Qs Ks As 2d 3d')).returned, 500 + 50000 + 2000);
});
test('Casino Hold\'em: house edge of a simple call/fold rule (seeded, 300 000 hands)', () => {
  const g = new CasinoHoldem({ rng: seededRng(31) }); let staked = 0, back = 0, antes = 0; const N = 300000;
  for (let i = 0; i < N; i++) {
    const d = g.deal(1000), now = d.now, hi = Math.max(...g.player.map(c => (c % 13 === 0 ? 14 : c % 13 + 1)));
    const r = (now.cat >= 1 || hi >= 11 || now.cat === 0) && !(now.cat === 0 && hi < 9) ? g.call() : g.fold();   // fold only weak no-pair hands
    staked += r.staked; back += r.returned; antes += 1000;
  }
  console.log(`casino hold'em: house edge ${((staked - back) / antes * 100).toFixed(2)} % of the ante with a simple call/fold rule (optimal play ≈ 2.2 %)`);
  assert.ok((staked - back) / antes > 0 && (staked - back) / antes < 0.08);
});
