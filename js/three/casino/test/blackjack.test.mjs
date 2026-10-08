import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng, cards, card } from '../rng.js?v=3.7';
import { Blackjack, RULES, handTotal, basicStrategy, isNatural } from '../blackjack.js?v=3.7';

const E = 100;                                     // one euro in cents
const game = (stack, rules) => { const g = new Blackjack({ rng: seededRng(11), rules }); if (stack) g.shoe.stack(stack); return g; };
const net = (g) => g.returned() - g.staked();
// one box: the stack order is P, D, P, then whatever the actions draw, then the dealer's cards

test('rule set is the European one asked for', () => {
  assert.deepEqual({ ...RULES }, { decks: 6, penetration: 0.75, burn: 0, minBet: 500, maxBet: 50000, betStep: 100, maxBoxes: 3, holeCard: false, dealerHitsSoft17: false,
    blackjackPays: [3, 2], doubleOn: 'any', doubleAfterSplit: true, maxSplits: 3, resplitAces: false, splitAcesOneCard: true, insurance: true, insurancePays: [2, 1], surrender: false });
  const g = game(); assert.equal(g.shoe.size, 312); assert.equal(g.shoe.cut, 234);
  assert.equal(typeof g.surrender, 'undefined');
});
test('soft and hard totals', () => {
  const T = (s) => handTotal(cards(s));
  assert.deepEqual(T('As 6h'), { total: 17, soft: true });
  assert.deepEqual(T('As 6h Kd'), { total: 17, soft: false });
  assert.deepEqual(T('As Ah'), { total: 12, soft: true });
  assert.deepEqual(T('As Ah Ad 8c'), { total: 21, soft: true });
  assert.deepEqual(T('As Ah Ad 8c Ks'), { total: 21, soft: false });
  assert.deepEqual(T('Ks Qh 2d'), { total: 22, soft: false });
  assert.deepEqual(T('5s 6h Td'), { total: 21, soft: false });
  assert.deepEqual(T('As Kd'), { total: 21, soft: true });
});
test('no hole card: the dealer has one card until the players have acted', () => {
  const g = game('Ts 9h 8d  7c');
  const ev = g.deal([10 * E]);
  assert.equal(g.dealer.length, 1); assert.equal(g.hole, null);
  assert.deepEqual(ev.filter(e => e.t === 'card').map(e => e.hand), [0, 'dealer', 0]);
  g.stand();                                       // dealer 9 + 7 = 16 → draws from the shoe
  assert.ok(g.dealer.length >= 3); assert.equal(g.phase, 'done');
});
test('blackjack pays 3:2, exact to €0.50 on odd bets', () => {
  for (const [bet, back] of [[5 * E, 1250], [10 * E, 2500], [15 * E, 3750], [7 * E, 1750], [500 * E, 125000]]) {
    const g = game('As 9h Kd');                    // natural against a 9: paid without a dealer draw
    g.deal([bet]);
    assert.equal(g.phase, 'done'); assert.equal(g.hands[0].result, 'blackjack'); assert.equal(g.returned(), back); assert.equal(g.dealer.length, 1);
  }
});
test('natural against a ten: dealer draws one card only; push on dealer blackjack', () => {
  let g = game('As Kh Kd  5c'); g.deal([10 * E]);
  assert.equal(g.dealer.length, 2); assert.equal(g.hands[0].result, 'blackjack'); assert.equal(net(g), 15 * E);
  g = game('As Kh Kd  Ac'); g.deal([10 * E]);
  assert.equal(g.hands[0].result, 'push'); assert.equal(net(g), 0);
});
test('ENHC: dealer blackjack takes doubles too (not "original bets only")', () => {
  const g = game('6s Kh 5d  Td  Ac');              // 11 v K, double, draw 10 → 21; dealer K + A = blackjack
  g.deal([20 * E]); assert.ok(g.legal().double);
  g.double();
  assert.equal(g.phase, 'done'); assert.equal(g.hands[0].result, 'lose');
  assert.equal(g.staked(), 40 * E); assert.equal(g.returned(), 0); assert.equal(net(g), -40 * E);
});
test('ENHC: dealer blackjack takes both hands of a split', () => {
  const g = game('8s Ah 8d  3c Tc  Kc');           // decline insurance, split 8s: 8+3 (double it), 8+10; dealer A + K
  g.deal([10 * E]); assert.equal(g.phase, 'insurance'); g.insure([false]);
  g.split(); assert.equal(g.hands.length, 2);
  assert.deepEqual(g.hands[0].cards, cards('8s 3c')); g.double(); // draws Tc → 21
  // second hand gets its card now
  assert.equal(g.active, 1);
});
test('ENHC split + double all lost to a dealer blackjack', () => {
  const g = game('8s Kh 8d  3c Tc  9s  Ac');
  g.deal([10 * E]); g.split(); g.double();         // hand 0: 8,3 + T = 21 (20 € on it)
  assert.deepEqual(g.hands[1].cards, cards('8d 9s')); g.stand();
  assert.equal(g.dealer.length, 2); assert.equal(handTotal(g.dealer).total, 21);
  assert.deepEqual(g.hands.map(h => h.result), ['lose', 'lose']);
  assert.equal(g.staked(), 30 * E); assert.equal(g.returned(), 0);
});
test('dealer stands on soft 17', () => {
  const g = game('Ts 6h 8d  As');                  // player 18; dealer 6 + A = soft 17 → stands
  g.deal([10 * E]); g.stand();
  assert.equal(g.dealer.length, 2); assert.deepEqual(handTotal(g.dealer), { total: 17, soft: true });
  assert.equal(g.hands[0].result, 'win'); assert.equal(net(g), 10 * E);
  const h17 = game('Ts 6h 8d  As 2c', { dealerHitsSoft17: true }); h17.deal([10 * E]); h17.stand();
  assert.equal(h17.dealer.length, 3);              // the flag works the other way too
});
test('dealer draws to 17 and busts; push returns the bet', () => {
  let g = game('Ts 6h 8d  Kc 9c'); g.deal([10 * E]); g.stand();
  assert.equal(handTotal(g.dealer).total, 25); assert.equal(g.hands[0].result, 'win'); assert.equal(g.returned(), 20 * E);
  g = game('Ts 9h 9d  Tc'); g.deal([10 * E]); g.stand();
  assert.equal(g.hands[0].result, 'push'); assert.equal(g.returned(), 10 * E);
  g = game('Ts 9h 8d  Tc'); g.deal([10 * E]); g.stand();
  assert.equal(g.hands[0].result, 'lose'); assert.equal(g.returned(), 0);
});
test('bust loses at once; with every hand bust the dealer does not draw', () => {
  const g = game('Ts 9h 6d  Kc');
  g.deal([10 * E]); const ev = g.hit();
  assert.ok(ev.some(e => e.t === 'bust')); assert.equal(g.phase, 'done'); assert.equal(g.dealer.length, 1); assert.equal(g.returned(), 0);
});
test('double on any two cards: one card only; 9–11 flag', () => {
  const g = game('2s 6h 3d  4c  Tc Ks');           // hard 5
  g.deal([10 * E]); assert.ok(g.legal().double);
  g.double(); assert.equal(g.hands[0].cards.length, 3); assert.equal(g.hands[0].bet, 20 * E); assert.equal(g.phase, 'done');
  const r = game('2s 6h 3d', { doubleOn: '9-11' }); r.deal([10 * E]); assert.equal(r.legal().double, false);
  const r2 = game('5s 6h 6d', { doubleOn: '9-11' }); r2.deal([10 * E]); assert.equal(r2.legal().double, true);
  const s = game('As 6h 7d'); s.deal([10 * E]); assert.ok(s.legal().double);       // soft 18
  const h = game('5s 6h 6d  2c'); h.deal([10 * E]); h.hit(); assert.equal(h.legal().double, false);   // not after a hit
  const p = game('5s 6h 6d'); p.deal([10 * E]); assert.equal(p.legal(5 * E).double, false); assert.equal(p.legal(10 * E).double, true);   // funds
  assert.throws(() => h.double());
});
test('split equal values (K-Q), double after split, win and lose settled per hand', () => {
  const g = game('Ks 6h Qd  Ac  5c 5d Ah  Th 9d');
  g.deal([10 * E]); assert.ok(g.legal().split);
  g.split();                                       // hand 0: K + A = 21 (not a blackjack) → auto-stands
  assert.equal(g.active, 1); assert.deepEqual(g.hands[0].cards, cards('Ks Ac')); assert.equal(isNatural(g.hands[0]), false);
  assert.deepEqual(g.hands[1].cards, cards('Qd 5c'));
  g.hit();                                         // 15 + 5 = 20
  g.stand();                                       // dealer 6 + A = soft 17 stands
  assert.deepEqual(g.hands.map(h => h.result), ['win', 'win']);
  assert.equal(g.hands[0].returned, 20 * E);       // 21 after split pays 1:1
  assert.equal(net(g), 20 * E);
});
test('double after split allowed (flag)', () => {
  const g = game('8s 6h 8d  3c'); g.deal([10 * E]); g.split();
  assert.deepEqual(g.hands[0].cards, cards('8s 3c')); assert.ok(g.legal().double);
  const n = game('8s 6h 8d  3c', { doubleAfterSplit: false }); n.deal([10 * E]); n.split(); assert.equal(n.legal().double, false);
});
test('split up to three times → four hands, no fifth', () => {
  const g = game('8s 6h 8d  8h 8c 8s');
  g.deal([10 * E]);
  g.split(); assert.deepEqual(g.hands[0].cards, cards('8s 8h'));
  g.split(); assert.deepEqual(g.hands[0].cards, cards('8s 8c'));
  g.split(); assert.deepEqual(g.hands[0].cards, cards('8s 8s'));
  assert.equal(g.hands.length, 4); assert.equal(g.legal().split, false); assert.throws(() => g.split());
  assert.equal(g.staked(), 40 * E);
});
test('split aces: one card each, no re-split, 21 pays 1:1', () => {
  const g = game('As 6h Ad  Ks Ac  Th 2d 9c');
  g.deal([10 * E]); assert.ok(g.legal().split);
  g.split();
  assert.equal(g.phase, 'done');                   // both hands stood automatically
  assert.deepEqual(g.hands[0].cards, cards('As Ks')); assert.deepEqual(g.hands[1].cards, cards('Ad Ac'));
  assert.equal(g.hands[0].result, 'win'); assert.equal(g.hands[0].returned, 20 * E);   // 1:1, not 3:2
  assert.equal(g.hands[1].result, 'lose');         // A-A = 12 v dealer 6 + T + 2 = 18 … no re-split was offered
  assert.equal(g.hands.length, 2);
});
test('insurance: offered on an ace, pays 2:1, settled when the dealer draws', () => {
  let g = game('Ts Ah 9d  Kc');
  g.deal([10 * E]); assert.equal(g.phase, 'insurance'); assert.ok(g.legal().insurance); assert.throws(() => g.hit());
  g.insure([true]); assert.equal(g.hands[0].insurance, 5 * E); assert.equal(g.phase, 'player');
  const ev = g.stand();
  assert.ok(ev.some(e => e.t === 'insurance' && e.won && e.returned === 15 * E));
  assert.equal(g.hands[0].result, 'lose'); assert.equal(g.staked(), 15 * E); assert.equal(g.returned(), 15 * E); assert.equal(net(g), 0);
  g = game('Ts Ah 9d  6c'); g.deal([10 * E]); g.insure([true]); g.stand();      // dealer A + 6 = soft 17, no blackjack
  assert.equal(g.hands[0].result, 'win'); assert.equal(net(g), 10 * E - 5 * E);
  g = game('As Ah Kd  Qc'); g.deal([10 * E]); g.insure([true]);                 // "even money": natural + insurance v dealer blackjack
  assert.equal(g.phase, 'done'); assert.equal(g.hands[0].result, 'push'); assert.equal(net(g), 10 * E);
  g = game('Ts Kh 9d'); g.deal([10 * E]); assert.equal(g.phase, 'player');      // no insurance on a ten
  g = game('Ts Ah 9d  6c', { insurance: false }); g.deal([10 * E]); assert.equal(g.phase, 'player');
});
test('insurance is settled even when every hand busts', () => {
  const g = game('Ts Ah 6d  Kc  Qc');
  g.deal([10 * E]); g.insure([true]); g.hit();     // 26: bust
  assert.equal(g.dealer.length, 2); assert.equal(g.hands[0].result, 'bust');
  assert.equal(g.returned(), 15 * E); assert.equal(net(g), 0);
});
test('three boxes: dealing order, independent settlement', () => {
  const g = game('Ts 5h As   7d   9s 6c Kd   8c 9h');   // boxes: T9, 5-6, A-K; dealer 7
  const ev = g.deal([10 * E, 20 * E, 50 * E]);
  assert.deepEqual(ev.filter(e => e.t === 'card').map(e => e.hand), [0, 1, 2, 'dealer', 0, 1, 2]);
  assert.equal(g.active, 0); g.stand();
  assert.equal(g.active, 1); g.double();           // 11 + 8 = 19
  assert.equal(g.phase, 'done');                   // box 3 has a natural; dealer 7 + 9 = 16 … draws
  assert.equal(g.hands[2].result, 'blackjack'); assert.equal(g.hands[2].returned, 125 * E);
  assert.throws(() => g.deal([10 * E, 10 * E, 10 * E, 10 * E]));
  const g2 = game('Ts 7d 9s  Tc'); g2.deal([0, 10 * E, 0]); assert.equal(g2.hands.length, 1); assert.equal(g2.hands[0].box, 1);
});
test('table limits €5 – €500, whole euros', () => {
  const g = game('Ts 9h 7d');
  for (const b of [4 * E, 501 * E, 550, 0.5, -500]) assert.throws(() => g.deal([b]), /limits|no bet/);
  assert.ok(g.validBet(500 * E) && g.validBet(5 * E) && !g.validBet(499));
  assert.doesNotThrow(() => g.deal([5 * E])); assert.throws(() => g.deal([5 * E]), /in progress/);
});
test('cut card: reshuffle before the round after it is reached', () => {
  const g = game(); let rounds = 0;
  while (!g.shoe.cutReached) { g.deal([5 * E]); if (g.phase === 'insurance') g.insure([false]); while (g.phase === 'player') g.stand(); rounds++; assert.equal(g.shoe.shuffles, 1); }
  assert.ok(g.shoe.pos >= 234 && g.shoe.pos < 260); assert.ok(g.shuffleNext);
  const ev = g.deal([5 * E]);
  assert.equal(ev[0].t, 'shuffle'); assert.equal(g.shoe.shuffles, 2); assert.ok(g.shoe.pos <= 4);
  assert.ok(rounds > 30);
});
test('money is conserved: returned is 0, 1×, 2× or 2.5× of each hand; seeded play is reproducible', () => {
  const run = (seed) => {
    const g = new Blackjack({ rng: seededRng(seed) }); let bank = 0; const log = [];
    for (let i = 0; i < 3000; i++) {
      g.deal([10 * E, 25 * E]); if (g.phase === 'insurance') g.insure([i % 2 === 0, false]);
      while (g.phase === 'player') { const L = g.legal(), s = basicStrategy(g.hand.cards, g.dealer[0], L).action; g[s](); }
      for (const h of g.hands) assert.ok([0, h.bet, 2 * h.bet, 2.5 * h.bet].includes(h.returned), 'returned ' + h.returned + ' on ' + h.bet);
      assert.ok(Number.isInteger(g.returned()) && g.returned() % 50 === 0);
      bank += g.returned() - g.staked(); log.push(bank);
    }
    return log;
  };
  assert.deepEqual(run(5), run(5)); assert.notDeepEqual(run(5), run(6));
});
test('basic strategy is computed for these rules (ENHC, S17, DAS, double any two)', () => {
  const B = (hand, up, can) => basicStrategy(cards(hand), card(up), can).action;
  assert.equal(B('6s 5h', '6d'), 'double'); assert.equal(B('6s 5h', 'Td'), 'hit');     // no-hole-card: 11 v 10 is a hit
  assert.equal(B('6s 5h', 'Ad'), 'hit'); assert.equal(B('6s 4h', '9d'), 'double'); assert.equal(B('6s 4h', 'Td'), 'hit');
  assert.equal(B('8s 8h', 'Td'), 'hit'); assert.equal(B('8s 8h', 'Ad'), 'hit'); assert.equal(B('8s 8h', '7d'), 'split');   // ENHC: 8-8 v 10 / A is not split
  assert.equal(B('As Ah', 'Ad'), 'hit'); assert.equal(B('As Ah', '6d'), 'split'); assert.equal(B('As Ah', 'Td'), 'split');
  assert.equal(B('Ts Kh', '6d'), 'stand'); assert.equal(B('9s 9h', '7d'), 'stand'); assert.equal(B('9s 9h', '9d'), 'split');
  assert.equal(B('Ts 6h', 'Td'), 'hit'); assert.equal(B('Ts 6h', '6d'), 'stand'); assert.equal(B('Ts 2h', '4d'), 'stand'); assert.equal(B('Ts 2h', '2d'), 'hit');
  assert.equal(B('As 7h', '9d'), 'hit'); assert.equal(B('As 7h', '7d'), 'stand'); assert.equal(B('As 7h', '5d'), 'double'); assert.equal(B('As 6h', '2d'), 'hit');
  assert.equal(B('5s 5h', '9d'), 'double'); assert.equal(B('4s 4h', '5d'), 'split'); assert.equal(B('Ts 7h', 'Ad'), 'stand');
  assert.equal(B('6s 5h', '6d', { double: false, split: false }), 'hit');
});
test('house edge with basic strategy (seeded simulation, 400 000 rounds)', () => {
  const g = new Blackjack({ rng: seededRng(2026) }); let staked = 0, back = 0, initial = 0; const N = 400000;
  for (let i = 0; i < N; i++) {
    g.deal([10 * E]); initial += 10 * E;
    if (g.phase === 'insurance') g.insure([false]);
    while (g.phase === 'player') g[basicStrategy(g.hand.cards, g.dealer[0], g.legal()).action]();
    staked += g.staked(); back += g.returned();
  }
  const edge = (staked - back) / initial;          // per unit of initial bet
  console.log(`blackjack: house edge ${(edge * 100).toFixed(3)} % of the initial bet, RTP ${(back / staked * 100).toFixed(3)} % of money staked, ${g.shoe.shuffles} shoes`);
  assert.ok(edge > 0.001 && edge < 0.011, 'edge ' + edge);
});
