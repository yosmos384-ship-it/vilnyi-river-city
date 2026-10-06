import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng, cards } from '../rng.js?v=3.5.1';
import { Baccarat, RULES, bankerDraws, playCoup, settle, total, pointOf } from '../baccarat.js?v=3.5.1';

const coup = (s) => { const q = cards(s); return playCoup(() => { if (!q.length) throw new Error('drew too many'); return q.shift(); }); };
test('card points and totals', () => {
  assert.deepEqual(cards('As 2s 9s Ts Js Qs Ks').map(pointOf), [1, 2, 9, 0, 0, 0, 0]);
  assert.equal(total(cards('7s 8h')), 5); assert.equal(total(cards('Ks Qh 9d')), 9); assert.equal(total(cards('5s 5h')), 0);
});
test('banker third-card tableau, all 8 × 11 cells', () => {
  const T = { 0: 'DDDDDDDDDD', 1: 'DDDDDDDDDD', 2: 'DDDDDDDDDD', 3: 'DDDDDDDDSD', 4: 'SSDDDDDDSS', 5: 'SSSSDDDDSS', 6: 'SSSSSSDDSS', 7: 'SSSSSSSSSS' };
  for (let b = 0; b <= 7; b++) { for (let p3 = 0; p3 <= 9; p3++) assert.equal(bankerDraws(b, p3), T[b][p3] === 'D', `banker ${b}, player third ${p3}`); assert.equal(bankerDraws(b, null), b <= 5); }
});
test('coups: naturals, player draws / stands, banker follows the tableau', () => {
  let c = coup('4s Kh 5d Qc');                     // deal order P, B, P, B → P 9 natural
  assert.deepEqual([c.pt, c.bt, c.natural, c.winner, c.player.length, c.banker.length], [9, 0, true, 'player', 2, 2]);
  c = coup('2s 3h 4d 5c');                         // P 6 stands, B 8 natural
  assert.deepEqual([c.pt, c.bt, c.natural, c.winner], [6, 8, true, 'banker']);
  c = coup('Ts 2h 6d 3c  9s');                     // P 6 stands; B 5 draws 9 → 4
  assert.deepEqual([c.pt, c.bt, c.player.length, c.banker.length, c.winner], [6, 4, 2, 3, 'player']);
  c = coup('Ts 2h 7d 4c');                         // P 7 stands; B 6 stands
  assert.deepEqual([c.pt, c.bt, c.player.length, c.banker.length, c.winner], [7, 6, 2, 2, 'player']);
  c = coup('2s Kh 3d 3c  8h');                     // P 5 draws 8 → 3; B 3 stands on a player 8
  assert.deepEqual([c.pt, c.bt, c.player.length, c.banker.length, c.winner], [3, 3, 3, 2, 'tie']);
  c = coup('2s Kh 3d 6c  7h  As');                 // P 5 draws 7 → 2; B 6 draws on 7 → 7
  assert.deepEqual([c.pt, c.bt, c.player.length, c.banker.length, c.winner], [2, 7, 3, 3, 'banker']);
  c = coup('2s Kh 3d 6c  5h');                     // P 5 draws 5 → 0; B 6 stands on 5
  assert.deepEqual([c.pt, c.bt, c.banker.length, c.winner], [0, 6, 2, 'banker']);
  c = coup('Ks 4h Qd Kc  Ah');                     // P 0 draws A → 1; B 4 stands on 1
  assert.deepEqual([c.pt, c.bt, c.banker.length, c.winner], [1, 4, 2, 'banker']);
  c = coup('Ks 5h Qd Kc  4h 3s');                  // P 0 draws 4; B 5 draws on 4 → 8
  assert.deepEqual([c.pt, c.bt, c.banker.length, c.winner], [4, 8, 3, 'banker']);
});
test('payouts: Player 1:1, Banker 0.95:1, Tie 8:1, P/B push on a tie', () => {
  assert.deepEqual(settle({ player: 1000, banker: 2000, tie: 500 }, 'player'), { player: 2000, banker: 0, tie: 0, staked: 3500, returned: 2000 });
  assert.equal(settle({ banker: 2000 }, 'banker').returned, 3900); assert.equal(settle({ banker: 500 }, 'banker').returned, 975); assert.equal(settle({ banker: 100000 }, 'banker').returned, 195000);
  assert.deepEqual(settle({ player: 1000, banker: 2000, tie: 500 }, 'tie'), { player: 1000, banker: 2000, tie: 4500, staked: 3500, returned: 7500 });
  assert.equal(settle({ tie: 500 }, 'player').returned, 0);
});
test('shoe of 8 decks, limits, reshuffle at the cut card', () => {
  const g = new Baccarat({ rng: seededRng(4) });
  assert.equal(g.shoe.size, 416); assert.equal(g.shoe.cut, 400); assert.equal(RULES.decks, 8);
  assert.throws(() => g.deal({ player: 400 })); assert.throws(() => g.deal({})); assert.throws(() => g.deal({ banker: 100100 }));
  let n = 0; while (g.shoe.shuffles === 1) { const r = g.deal({ banker: 500 }); assert.ok(r.player.length >= 2 && r.banker.length <= 3 && r.returned === r.pay.returned && [0, 975].includes(r.returned) || r.winner === 'tie' && r.returned === 500); n++; }
  assert.ok(n > 70 && n < 100);
});
test('house edge by seeded simulation (1 500 000 coups)', () => {
  const g = new Baccarat({ rng: seededRng(77) }), N = 1500000; let p = 0, b = 0, t = 0;
  for (let i = 0; i < N; i++) { const w = playCoup(() => g.shoe.draw()).winner; if (g.shoe.cutReached) g.shoe.shuffle(); if (w === 'player') p++; else if (w === 'banker') b++; else t++; }
  const eP = (b - p) / N, eB = (p - 0.95 * b) / N, eT = 1 - 9 * t / N;
  console.log(`baccarat: P ${(p / N * 100).toFixed(2)} %, B ${(b / N * 100).toFixed(2)} %, tie ${(t / N * 100).toFixed(2)} % — house edge Player ${(eP * 100).toFixed(2)} %, Banker ${(eB * 100).toFixed(2)} %, Tie ${(eT * 100).toFixed(2)} % (RTP ${((1 - eP) * 100).toFixed(2)} / ${((1 - eB) * 100).toFixed(2)} / ${((1 - eT) * 100).toFixed(2)} %)`);
  assert.ok(Math.abs(p / N - 0.4462) < 0.002 && Math.abs(b / N - 0.4586) < 0.002 && Math.abs(t / N - 0.0952) < 0.002);
  assert.ok(Math.abs(eP - 0.0124) < 0.003 && Math.abs(eB - 0.0106) < 0.003 && Math.abs(eT - 0.1436) < 0.02);
});
