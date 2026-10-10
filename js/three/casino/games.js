// VILNYI Lifestyle casino — the tables: what a tap or a button means at each game, the dealing and the animations.
// The rules live in the engines; these classes only place bets, call the engine, show what it returns and move the
// play chips between the visitor's bankroll (bank.js) and the felt.
import * as THREE from 'three';
import { cards as parseCards } from './rng.js?v=3.12';
import { fmt } from './bank.js?v=3.12';
import { Blackjack, handTotal, basicStrategy } from './blackjack.js?v=3.12';
import { Roulette, WHEEL, colorOf } from './roulette.js?v=3.12';
import { RL, rlCell, betAt } from './roulette-layout.js?v=3.12';
import { Baccarat, total as bacTotal } from './baccarat.js?v=3.12';
import { Slots, RULES as SLOT_RULES, LINES, STRIPS, SYMBOLS } from './slots.js?v=3.12';
import { VideoPoker, PAYTABLE, RULES as VP_RULES, category } from './videopoker.js?v=3.12';
import { CasinoHoldem } from './holdem.js?v=3.12';
import { best } from './poker.js?v=3.12';
import { Craps } from './craps.js?v=3.12';
import * as ART from './art.js?v=3.12';
import { TOP, BJ_BOX, BAC_AREA, BAC, HLD, RL_TABLE, MACHINE } from './layout.js?v=3.12';

const sum = (a) => a.reduce((s, x) => s + x, 0), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const M = (c) => '<bdi>' + fmt(c) + '</bdi>', PLUS = (c) => '<bdi>+' + fmt(c) + '</bdi>';
const SHOE = [0.78, 0.3];
const CAT_KEY = ['high', 'pair', 'twopair', 'three', 'straight', 'flush', 'full', 'four', 'sflush', 'royal'];

class Table {
  constructor(c, s) { this.c = c; this.s = s; this.busy = false; }
  t(k, v) { return this.c.t(k, v); }
  canLeave() { return !this.busy; }
  staked() { return 0; }
  /** Take chips from the bankroll onto the felt. */
  put(amount, quiet = false) {
    const b = this.c.bank;
    if (!b.stake(amount)) { this.c.msg(esc(this.t(b.broke ? 'broke' : 'noFunds')), 2400, 'lose'); return false; }
    if (!quiet) this.c.sound.play('chip'); return true;
  }
  /** Close a round: pay what the engine returned, record it, announce the net result. */
  settle(staked, returned, o = {}) {
    const b = this.c.bank, net = returned - staked;
    if (returned > 0) b.pay(returned); b.round(staked, returned);
    if (!o.quiet) this.c.msg(net > 0 ? `${esc(this.t('youWin'))} ${M(net)}` : net < 0 ? `${esc(this.t('lose'))} ${M(-net)}` : esc(this.t('push')), 2200, net > 0 ? 'win' : net < 0 ? 'lose' : '');
    this.c.sound.play(net >= staked * 5 && net > 0 ? 'bigwin' : net > 0 ? 'win' : net < 0 ? 'lose' : 'push');
    return net;
  }
  dealerArm() { try { const f = this.c.yt.people.find('dealer-' + this.s.id); if (f) { f.armT = 1.2; clearTimeout(this._armT); this._armT = setTimeout(() => { if (!f.act) f.armT = 0; }, 260); } } catch { /* */ } }
  key(ev) { const b = { Enter: 0, Space: 0 }[ev.code]; if (b === undefined) return false; const g = this.buttons().find(x => !x.off && ['deal', 'spin', 'roll', 'draw'].includes(x.id)); if (g) { this.act(g.id); this.c.refresh(); return true; } return false; }
  close() {}
}

// ================================================================== blackjack
class BJ extends Table {
  constructor(c, s) {
    super(c, s); this.name = 'bj'; this.rules = 'rulesBJ';
    this.eng = new Blackjack({ rng: c.rng() }); this.bets = [0, 0, 0]; this.last = null; this.phase = 'bet'; this.vd = []; this.H = []; this.hint = false; this.active = -1; this.gone = false; this.said = false;
  }
  open() { this.c.say('placeBets'); }
  toggleHint() { this.hint = !this.hint; }
  staked() { return this.phase === 'bet' ? sum(this.bets) : this.phase === 'done' ? 0 : sum(this.H.map(h => h.bet + h.ins)); }
  canLeave() { return !this.busy && (this.phase === 'bet' || this.phase === 'done'); }
  close() { if (this.phase === 'bet') { const t = sum(this.bets); if (t) this.c.bank.refund(t); this.bets = [0, 0, 0]; } }
  rig(x) { this.eng.shoe.stack(x); }
  spots() {
    if (this.phase === 'bet' || !this.H.length) return BJ_BOX;
    if (!this.H.some(h => h.split)) return this.H.map(h => BJ_BOX[h.box]);
    const n = this.H.length, sp = Math.min(0.27, 0.92 / Math.max(1, n - 1)); return this.H.map((h, i) => [(i - (n - 1) / 2) * sp, 0.96]);
  }
  get noChips() { return this.phase !== 'bet' && this.phase !== 'done'; }
  // cards are drawn larger than life so they read on a phone; smaller again when many split hands share the felt
  scale() { const n = this.H.length; return n <= 3 ? 1.4 : n <= 4 ? 1.25 : 1; }
  view() {
    let u0 = -0.3, u1 = 0.3; const sc = this.scale();
    if (this.phase !== 'bet' && this.H.length) { const sp = this.spots(); u0 = Math.min(-0.14, ...sp.map(p => p[0] - 0.05 * sc)); u1 = Math.max(0.14, ...sp.map((p, i) => p[0] + (0.03 + 0.026 * this.H[i].cards.length) * sc)); }
    return { u: (u0 + u1) / 2, v: 0.64, W: Math.max(0.56, u1 - u0 + 0.16), D: 1.04 };
  }
  layout(ms = 280) {
    const c = this.c, n = this.vd.length, sc = this.scale(), sp = Math.min(0.092 * sc, 0.56 / Math.max(1, n - 1)), S = this.spots();
    this.vd.forEach((k, j) => { k.s = sc; c.move(k, (j - (n - 1) / 2) * sp, 0.26, { flip: 1, ms, lift: k.fresh ? 0.05 : 0.004 }); });
    this.H.forEach((h, i) => h.cards.forEach((k, j) => { k.s = sc; c.move(k, S[i][0] + (j * 0.026 - 0.012) * sc, S[i][1] - 0.085 - 0.0585 * sc - j * 0.03 * sc, { flip: 1, ms, lift: k.fresh ? 0.05 : 0.004, turn: k.turn || 0 }); }));
    for (const k of c.cards) k.fresh = false;
    c.cards = [...this.vd, ...this.H.flatMap(h => h.cards)]; c._cardsDirty = true;
  }
  totalText(cs) { const { total, soft } = handTotal(cs); return soft && total < 21 && cs.length > 1 ? `${total - 10}/${total}` : String(total); }
  labels() {
    const L = [], S = this.spots();
    if (this.phase === 'bet') { BJ_BOX.forEach(([u, v], i) => { if (this.bets[i]) L.push({ id: 'b' + i, u, v: v + 0.1, text: M(this.bets[i]) }); }); return L; }
    if (this.vd.length) { const cs = this.vd.map(k => k.c), d = handTotal(cs).total; L.push({ id: 'd', u: 0, v: 0.26 - 0.0585 * this.scale() - 0.035, text: esc(this.t('dealerHas')) + ' ' + (cs.length === 2 && d === 21 ? 'BJ' : this.totalText(cs)), cls: d > 21 ? 'lose' : '' }); }
    const many = this.H.length > 3;
    this.H.forEach((h, i) => {
      if (!h.cards.length) return; const [u, v] = S[i], tot = this.totalText(h.cards.map(k => k.c));
      let text = tot, cls = h.bust ? 'lose' : i === this.active && this.phase === 'player' ? 'act' : '';
      if (h.res) { const r = h.res, net = r.returned - h.bet; cls = net > 0 ? 'win' : net < 0 ? 'lose' : 'push'; text = (many ? '' : tot + ' · ') + (r.result === 'blackjack' ? `${many ? 'BJ' : esc(this.t('blackjackX'))} ${PLUS(net)}` : r.result === 'win' ? PLUS(net) : r.result === 'push' ? esc(this.t('push')) : esc(this.t(r.result === 'bust' ? 'bust' : 'lose'))); }
      else if (h.bust) text = (many ? '' : tot + ' · ') + esc(this.t('bust'));
      L.push({ id: 'h' + i, u, v: v + 0.105, text, cls });
    });
    return L;
  }
  chips() {
    const c = this.c, out = [];
    if (this.phase === 'bet') { BJ_BOX.forEach(([u, v], i) => { if (this.bets[i]) out.push(...c.stack(this.bets[i], u, v, 0.001, i)); }); return out; }
    if (this.gone) return out;
    const S = this.spots();
    this.H.forEach((h, i) => { const [u, v] = S[i]; if (!h.lost) out.push(...c.stack(h.bet, u, v, 0.001, i)); if (h.ins) out.push(...c.stack(h.ins, u, v - 0.31, 0.001, i + 20)); if (h.win) out.push(...c.stack(h.win, u - 0.055, v + 0.02, 0.001, i + 40)); });
    return out;
  }
  status() {
    const R = this.eng.rules;
    if (this.phase === 'insurance') return esc(this.t('insuranceQ'));
    if (this.phase === 'player' && this.active >= 0) { const s = `${esc(this.t('hand'))} ${this.active + 1}/${this.H.length} · ${esc(this.t('bet'))} ${M(this.staked())}`; return this.hint && !this.busy ? s + ' · ' + esc(this.t('hintIs', { a: this.t(this.suggest()) })) : s; }
    return `${M(R.minBet)} – ${M(R.maxBet)} · ${esc(this.t('tapChip'))}`;
  }
  suggest() { try { return basicStrategy(this.eng.hand.cards, this.eng.dealer[0], this.eng.legal(this.c.bank.balance), this.eng.rules).action; } catch { return 'stand'; } }
  buttons() {
    const t = (k) => this.t(k), b = this.c.bank;
    if (this.phase === 'insurance') { const cost = sum(this.eng.hands.map(h => h.bet / 2)); return [{ id: 'ins', label: t('insurance'), sub: M(cost), off: this.busy || b.balance < cost }, { id: 'noins', label: t('noInsurance'), gold: true, off: this.busy, sug: this.hint }]; }
    if (this.phase === 'player') { const L = this.eng.legal(b.balance), sg = this.hint && !this.busy ? this.suggest() : null; return ['hit', 'stand', 'double', 'split'].map(id => ({ id, label: t(id), off: this.busy || !L[id], sug: sg === id, gold: id === 'hit' || id === 'stand' })); }
    const tot = sum(this.bets);
    return [{ id: 'clear', label: t('clear'), off: this.busy || !tot || this.phase !== 'bet' }, { id: 'rebet', label: t('rebet'), off: this.busy || !this.last || tot > 0 || this.phase === 'play' }, { id: 'deal', label: t('deal'), gold: true, off: this.busy || !tot || this.phase !== 'bet' }];
  }
  key(ev) { const k = { KeyH: 'hit', KeyS: 'stand', KeyD: 'double', KeyP: 'split' }[ev.code]; if (k && this.phase === 'player' && !this.busy && this.eng.legal(this.c.bank.balance)[k]) { this.act(k); return true; } return super.key(ev); }
  reset() { this.phase = 'bet'; this.vd = []; this.H = []; this.c.cards = []; this.c._cardsDirty = true; this.gone = false; this.active = -1; }
  add(i) {
    if (this.busy) return; if (this.phase === 'done') this.reset(); if (this.phase !== 'bet') return;
    const R = this.eng.rules, chip = this.c.chip;
    if (this.bets[i] + chip > R.maxBet) return this.c.msg(esc(this.t('maxBet', { x: fmt(R.maxBet) })), 1800);
    if (!this.put(chip)) return; this.bets[i] += chip; this.c.refresh();
  }
  tap(u, v) { let bi = -1, bd = 0.17; BJ_BOX.forEach(([a, b], i) => { const d = Math.hypot(u - a, v - b); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0) this.add(bi); }
  act(id) {
    if (this.busy) return;
    if (id === 'clear') { const t = sum(this.bets); if (t) this.c.bank.refund(t); this.bets = [0, 0, 0]; return this.c.refresh(); }
    if (id === 'rebet') { if (this.phase === 'done') this.reset(); for (let i = 0; i < 3; i++) if (this.last[i]) { if (!this.put(this.last[i], i > 0)) break; this.bets[i] = this.last[i]; } return this.c.refresh(); }
    if (id === 'deal') return this.deal();
    if (id === 'ins' || id === 'noins') { const take = id === 'ins', cost = sum(this.eng.hands.map(h => h.bet / 2)); if (take && !this.put(cost)) return; return this.run(this.eng.insure(this.eng.hands.map(() => take))); }
    if (this.phase !== 'player' || !this.eng.legal(this.c.bank.balance)[id]) return;
    const cost = this.eng.cost(id); if (cost && !this.put(cost)) return;
    return this.run(this.eng[id]());
  }
  deal() {
    const R = this.eng.rules, low = this.bets.find(b => b > 0 && b < R.minBet);
    if (low !== undefined) return this.c.msg(esc(this.t('minBet', { x: fmt(R.minBet) })), 1800);
    this.reset(); this.phase = 'play'; this.last = this.bets.slice();
    const ev = this.eng.deal(this.bets.slice());
    this.H = this.eng.hands.map(h => ({ box: h.box, cards: [], bet: h.bet, ins: 0, res: null, bust: false, split: false, win: 0 })); this.bets = [0, 0, 0];
    return this.run(ev);
  }
  async give(e) {
    const c = this.c, k = c.card(e.card, SHOE[0], SHOE[1], 0.07); k.fresh = true; if (e.double) k.turn = Math.PI / 2;
    if (e.hand === 'dealer') this.vd.push(k); else this.H[e.hand].cards.push(k);
    this.layout(300); c.sound.play('card'); this.dealerArm(); c.refresh();
    await c.wait(340);
  }
  async run(ev) {
    const c = this.c; this.busy = true; c.refresh();
    try {
      for (const e of ev) {
        if (e.t === 'shuffle') { c.msg(esc(this.t('shuffle')), 1600); c.sound.play('shuffle'); await c.wait(900); }
        else if (e.t === 'card') await this.give(e);
        else if (e.t === 'insurance?') { this.phase = 'insurance'; }
        else if (e.t === 'insured') { this.H[e.hand].ins = e.stake; }
        else if (e.t === 'turn') { this.phase = 'player'; this.active = e.hand; }
        else if (e.t === 'double') { this.H[e.hand].bet = e.bet; c.sound.play('chip'); }
        else if (e.t === 'split') { const h = this.H[e.hand], k = h.cards.pop(); h.split = true; this.H.splice(e.to, 0, { box: h.box, cards: [k], bet: h.bet, ins: 0, res: null, bust: false, split: true, win: 0 }); this.layout(260); c.sound.play('chip'); c.refresh(); await c.wait(320); }
        else if (e.t === 'bust') { this.H[e.hand].bust = true; this.H[e.hand].lost = true; c.sound.play('lose'); c.refresh(); await c.wait(350); }
        else if (e.t === 'dealer') { this.active = -1; this.phase = 'play'; if (e.blackjack) { c.say('dealerBJ'); await c.wait(700); } }
        else if (e.t === 'insurance') { c.msg(esc(this.t(e.won ? 'insWin' : 'insLose')), 1500, e.won ? 'win' : 'lose'); this.H[e.hand].ins = e.won ? e.returned : 0; c.refresh(); await c.wait(800); }
        else if (e.t === 'settle') { const h = this.H[e.hand]; h.res = e; h.bet = e.bet; h.win = Math.max(0, e.returned - e.bet); h.lost = e.returned === 0; }
        else if (e.t === 'done') {
          this.active = -1; this.phase = 'play'; c.refresh();
          if (this.H.some(h => h.res && h.res.result === 'blackjack')) { c.say('blackjackX'); await c.wait(500); }
          this.settle(e.staked, e.returned);
          await c.wait(1700); this.gone = true; this.phase = 'done';
        }
      }
      // a natural on the first two cards is announced as soon as it is dealt
      if (this.phase === 'player' || this.phase === 'insurance') { if (!this.said && this.H.some(h => !h.split && h.cards.length === 2 && handTotal(h.cards.map(k => k.c)).total === 21)) { this.said = true; c.say('blackjackX'); } }
    } finally { this.busy = false; this.said = this.phase === 'done' ? false : this.said; c.refresh(); }
  }
}

// ================================================================== roulette
class RouletteT extends Table {
  constructor(c, s) { super(c, s); this.name = 'roulette'; this.rules = 'rulesRoulette'; this.eng = new Roulette({ rng: c.rng() }); this.pos = new Map(); this.shown = null; this.last = null; this.mode = 'layout'; this.forced = null; this.result = null; }
  open() { this.c.say('placeBets'); this.c.dolly.visible = false; }
  staked() { return this.eng.total(); }
  close() { const t = this.eng.clear(); if (t) this.c.bank.refund(t); this.c.dolly.visible = false; }
  rig(n) { this.forced = +n; }
  view() { const p = this.c.walk.camera.aspect < 1; return this.mode === 'wheel' ? { u: RL_TABLE.wheel[0], v: RL_TABLE.wheel[1], W: 1.15, D: 1.1, elev: 60 } : { u: RL.uL + RL.w / 2, v: RL.vB + RL.h / 2, W: RL.w + 0.08, D: RL.h + 0.08, elev: p ? 74 : 54, fov: p ? 82 : 44 }; }
  status() { const R = this.eng.rules; return this.result != null && !this.eng.total() ? `<b style="font-family:inherit;font-size:13px;color:#fff">${this.result} ${esc(this.t(colorOf(this.result)))}</b>` : `${M(R.minBet)} – ${M(R.maxInside)} · ${esc(this.t('tapChip'))}`; }
  history() { return this.eng.history.slice(0, 12).map(n => `<i class="${colorOf(n)}">${n}</i>`).join(''); }
  // (chips are drawn 1.5× on the layout: the cells are small on a phone)
  chips() { const out = []; let i = 0; const list = this.shown || [...this.eng.bets.values()].map(b => ({ key: b.bet.key, amount: b.amount })); for (const b of list) { const p = this.pos.get(b.key); if (p) out.push(...this.c.stack(b.amount, p[0], p[1], 0.002, i++, 1.5)); } return out; }
  labels() { const L = []; if (this.result != null && this.mode === 'layout' && this.win) L.push({ id: 'w', u: rlCell(this.result)[0], v: rlCell(this.result)[1] + 0.085, text: PLUS(this.win), cls: 'win big' }); return L; }
  buttons() { const t = (k) => this.t(k), tot = this.eng.total(); return [{ id: 'clear', label: t('clear'), off: this.busy || !tot }, { id: 'rebet', label: t('rebet'), off: this.busy || !this.last || tot > 0 }, { id: 'spin', label: t('spin'), gold: true, off: this.busy || !tot }]; }
  place(bet, pos, amount) {
    if (!this.c.bank.can(amount)) return this.put(amount) && false;
    const r = this.eng.place(bet, amount);
    if (r !== true) { this.c.msg(esc(this.t(r === 'min' ? 'minBet' : 'maxBet', { x: fmt(r === 'min' ? this.eng.rules.minBet : bet.outside ? this.eng.rules.maxOutside : this.eng.rules.maxInside) })), 1600); return false; }
    this.put(amount); this.pos.set(bet.key, pos); return true;
  }
  tap(u, v) { if (this.busy) return; const hit = betAt(u, v); if (!hit) return; if (this.shown) { this.shown = null; this.win = 0; this.c.dolly.visible = false; } this.place(hit.bet, hit.pos, this.c.chip); this.c.refresh(); }
  act(id) {
    if (this.busy) return;
    if (id === 'clear') { const t = this.eng.clear(); if (t) this.c.bank.refund(t); return this.c.refresh(); }
    if (id === 'rebet') { this.shown = null; this.win = 0; this.c.dolly.visible = false; for (const b of this.last) if (!this.place(b.bet, this.pos.get(b.bet.key), b.amount)) break; return this.c.refresh(); }
    if (id === 'spin') return this.spin();
  }
  async spin() {
    const c = this.c, w = c.wheels.get(this.s.id); this.busy = true; this.shown = null; c.dolly.visible = false; c.say('noMoreBets'); c.refresh();
    const real = this.eng.rng; if (this.forced != null) { const n = this.forced; this.forced = null; this.eng.rng = { int: () => WHEEL.indexOf(n) }; }
    const res = this.eng.spin(); this.eng.rng = real;
    this.last = res.bets; this.shown = res.bets.map(b => ({ key: b.bet.key, amount: b.amount })); c.refresh();
    await c.wait(500); this.mode = 'wheel';
    await new Promise((done) => {
      const T = c.dur(5600), t0 = performance.now(), psi0 = w.psi, step = Math.PI * 2 / 37, aP = -Math.PI / 2 + res.index * step, B = Math.PI * 2 * 5.5, R0 = RL_TABLE.wheelR + 0.05, R1 = RL_TABLE.wheelR * 0.86, y0 = c.deckY + TOP; let ticks = 0;
      w.spin = (now) => {
        const t = clamp((now - t0) / T, 0, 1); w.psi = psi0 + (now - t0) / 1000 * 1.25; w.rotor.rotation.y = w.psi;
        const a = aP - w.psi + B * (1 - t) * (1 - t), k = clamp((t - 0.62) / 0.3, 0, 1), e = k * k * (3 - 2 * k), R = R0 + (R1 - R0) * e + Math.sin(k * Math.PI * 3) * 0.012 * (1 - k);
        w.ball.position.set(w.x + Math.cos(a) * R, y0 + 0.088 - 0.016 * e + Math.abs(Math.sin(k * Math.PI * 4)) * 0.012 * (1 - k), w.z + Math.sin(a) * R);
        if (t > 0.6 && t < 0.97 && Math.floor(t * 40) > ticks) { ticks = Math.floor(t * 40); c.sound.play('ball'); }
        if (t >= 1) { w.spin = null; w.index = res.index; done(); }
      };
    });
    this.result = res.number; c.msg(`<bdi>${res.number}</bdi> · ${esc(this.t(res.color))}`, 2200); c.sound.say(String(res.number) + ' ' + this.t(res.color));
    await c.wait(1300); this.mode = 'layout';
    const [du, dv] = rlCell(res.number), [x, y, z] = c.at(du, dv, 0.036); c.dolly.position.set(x, y, z); c.dolly.visible = true;
    this.shown = res.wins.map(b => ({ key: b.bet.key, amount: b.amount })); this.win = Math.max(0, res.returned - res.staked);
    c.refresh(); await c.wait(700);
    this.settle(res.staked, res.returned);
    this.busy = false; c.refresh();
  }
}

// ================================================================== baccarat
class BaccaratT extends Table {
  constructor(c, s) { super(c, s); this.name = 'baccarat'; this.rules = 'rulesBaccarat'; this.eng = new Baccarat({ rng: c.rng() }); this.bets = { player: 0, tie: 0, banker: 0 }; this.last = null; this.vp = []; this.vb = []; this.res = null; this.shownBets = null; }
  open() { this.c.say('placeBets'); }
  staked() { return this.bets.player + this.bets.tie + this.bets.banker; }
  close() { const t = this.staked(); if (t) this.c.bank.refund(t); }
  rig(x) { this.eng.shoe.stack(x); }
  view() { return { u: 0, v: 0.68, W: 0.86, D: 0.92 }; }
  status() { const R = this.eng.rules; return `${M(R.minBet)} – ${M(R.maxBet)} · ${esc(this.t('tapChip'))}`; }
  history() { return this.eng.history.slice(0, 14).map(w => `<i class="${w === 'player' ? 'black' : w === 'banker' ? 'red' : 'green'}">${w === 'player' ? 'P' : w === 'banker' ? 'B' : 'T'}</i>`).join(''); }
  spot(k) { const a = BAC_AREA[k]; return [(a[0] + a[2]) / 2 - 0.02, (a[1] + a[3]) / 2 + 0.01]; }
  chips() { const out = [], b = this.shownBets || this.bets; ['player', 'tie', 'banker'].forEach((k, i) => { if (b[k]) out.push(...this.c.stack(b[k], ...this.spot(k), 0.001, i)); if (this.res && this.res.pay[k] > b[k]) out.push(...this.c.stack(this.res.pay[k] - b[k], this.spot(k)[0], this.spot(k)[1] - 0.075, 0.001, i + 9)); }); return out; }
  labels() {
    const L = [], tx = (k) => this.t(k);
    const lv = BAC.handV - 0.0585 * BAC.s - 0.035;
    if (this.vp.length) L.push({ id: 'p', u: -BAC.handU, v: lv, text: esc(tx('player')) + ' ' + bacTotal(this.vp.map(k => k.c)), cls: this.res && this.res.winner === 'player' ? 'win' : '' });
    if (this.vb.length) L.push({ id: 'b', u: BAC.handU, v: lv, text: esc(tx('banker')) + ' ' + bacTotal(this.vb.map(k => k.c)), cls: this.res && this.res.winner === 'banker' ? 'win' : '' });
    if (this.res && this.res.winner === 'tie') L.push({ id: 't', u: 0, v: BAC.handV, text: esc(tx('tie')), cls: 'win big' });
    return L;
  }
  buttons() { const t = (k) => this.t(k), tot = this.staked(); return [{ id: 'clear', label: t('clear'), off: this.busy || !tot }, { id: 'rebet', label: t('rebet'), off: this.busy || !this.last || tot > 0 }, { id: 'deal', label: t('deal'), gold: true, off: this.busy || !tot }]; }
  fresh() { if (this.res) { this.res = null; this.shownBets = null; this.vp = []; this.vb = []; this.c.cards = []; this.c._cardsDirty = true; } }
  tap(u, v) {
    if (this.busy) return;
    for (const k of ['tie', 'player', 'banker']) { const a = BAC_AREA[k]; if (u > a[0] - 0.03 && u < a[2] + 0.03 && v > a[1] - 0.03 && v < a[3] + 0.06) { this.fresh(); const R = this.eng.rules; if (this.bets[k] + this.c.chip > R.maxBet) return this.c.msg(esc(this.t('maxBet', { x: fmt(R.maxBet) })), 1600); if (this.put(this.c.chip)) this.bets[k] += this.c.chip; return this.c.refresh(); } }
  }
  act(id) {
    if (this.busy) return;
    if (id === 'clear') { const t = this.staked(); if (t) this.c.bank.refund(t); this.bets = { player: 0, tie: 0, banker: 0 }; return this.c.refresh(); }
    if (id === 'rebet') { this.fresh(); for (const k of ['player', 'tie', 'banker']) if (this.last[k]) { if (!this.put(this.last[k])) break; this.bets[k] = this.last[k]; } return this.c.refresh(); }
    if (id === 'deal') return this.deal();
  }
  async deal() {
    const c = this.c, R = this.eng.rules;
    if (Object.values(this.bets).some(b => b > 0 && b < R.minBet)) return c.msg(esc(this.t('minBet', { x: fmt(R.minBet) })), 1800);
    this.busy = true; this.fresh(); c.say('noMoreBets');
    const r = this.eng.deal({ ...this.bets }); this.last = { ...this.bets }; this.shownBets = { ...this.bets }; this.bets = { player: 0, tie: 0, banker: 0 }; c.refresh();
    if (r.shuffled) { c.msg(esc(this.t('shuffle')), 1500); c.sound.play('shuffle'); await c.wait(900); }
    const give = async (side, card, j) => {
      const k = c.card(card, SHOE[0], SHOE[1], 0.07, { s: BAC.s }), u0 = side === 'p' ? -BAC.handU : BAC.handU; (side === 'p' ? this.vp : this.vb).push(k);
      if (j < 2) c.move(k, u0 + (j - 0.5) * 0.092 * BAC.s, BAC.handV, { flip: 1, ms: 320 }); else c.move(k, u0, BAC.handV + 0.108 * BAC.s, { flip: 1, ms: 320, turn: Math.PI / 2 });
      c.sound.play('card'); this.dealerArm(); c.refresh(); await c.wait(420);
    };
    await give('p', r.player[0], 0); await give('b', r.banker[0], 0); await give('p', r.player[1], 1); await give('b', r.banker[1], 1);
    await c.wait(350);
    if (r.player[2] != null) await give('p', r.player[2], 2);
    if (r.banker[2] != null) await give('b', r.banker[2], 2);
    this.res = r; c.refresh();
    c.msg(esc(this.t(r.winner)) + ` <bdi>${r.pt} – ${r.bt}</bdi>`, 1500); c.sound.say(this.t(r.winner)); await c.wait(1100);
    this.settle(r.staked, r.returned);
    this.busy = false; c.refresh();
  }
}

// ================================================================== Casino Hold'em
class HoldemT extends Table {
  constructor(c, s) { super(c, s); this.name = 'holdem'; this.rules = 'rulesHoldem'; this.eng = new CasinoHoldem({ rng: c.rng() }); this.ante = 0; this.call = 0; this.last = 0; this.phase = 'bet'; this.vp = []; this.vd = []; this.vb = []; this.res = null; }
  open() { this.c.say('placeBets'); }
  staked() { return this.phase === 'done' ? 0 : this.ante + this.call; }
  canLeave() { return !this.busy && this.phase !== 'decide'; }
  close() { if (this.phase === 'bet' && this.ante) this.c.bank.refund(this.ante); }
  rig(x) { this.eng.stack(typeof x === 'string' ? parseCards(x) : x); }
  view() { return { u: 0, v: 0.6, W: 0.84, D: 1.1 }; }
  status() { const R = this.eng.rules; if (this.phase === 'decide') { const b = best([...this.eng.player, ...this.eng.board]); return esc(this.t(CAT_KEY[b.cat])); } return `${esc(this.t('ante'))} ${M(R.minAnte)} – ${M(R.maxAnte)}`; }
  chips() { const out = []; if (this.gone) return out; if (this.ante) out.push(...this.c.stack(this.ante, HLD.ante[0], HLD.ante[1], 0.001, 1)); if (this.call) out.push(...this.c.stack(this.call, HLD.call[0], HLD.call[1], 0.001, 2)); if (this.res && this.res.returned > this.res.staked) out.push(...this.c.stack(this.res.returned - this.res.staked, 0, HLD.ante[1] - 0.085, 0.001, 3)); return out; }
  labels() {
    const L = [], r = this.res;
    if (r && r.p) { L.push({ id: 'p', u: 0.24, v: HLD.playerV, text: esc(this.t(CAT_KEY[r.p.cat])), cls: r.result === 'win' || r.result === 'noqualify' ? 'win' : r.result === 'lose' ? 'lose' : 'push' }); L.push({ id: 'd', u: 0.24, v: HLD.dealerV, text: esc(r.result === 'noqualify' ? this.t('dealerNoQ') : this.t(CAT_KEY[r.d.cat])), cls: r.result === 'lose' ? 'win' : '' }); }
    else if (this.phase === 'decide') L.push({ id: 'p', u: 0.24, v: HLD.playerV, text: esc(this.t(CAT_KEY[best([...this.eng.player, ...this.eng.board]).cat])), cls: 'act' });
    return L;
  }
  buttons() {
    const t = (k) => this.t(k);
    if (this.phase === 'decide') return [{ id: 'fold', label: t('fold'), off: this.busy }, { id: 'call', label: t('call'), sub: M(this.ante * 2), gold: true, off: this.busy || this.c.bank.balance < this.ante * 2 }];
    return [{ id: 'clear', label: t('clear'), off: this.busy || !this.ante || this.phase !== 'bet' }, { id: 'rebet', label: t('rebet'), off: this.busy || !this.last || (this.phase === 'bet' && this.ante > 0) }, { id: 'deal', label: t('deal'), gold: true, off: this.busy || !this.ante || this.phase !== 'bet' }];
  }
  reset() { this.phase = 'bet'; this.res = null; this.ante = 0; this.call = 0; this.gone = false; this.vp = []; this.vd = []; this.vb = []; this.c.cards = []; this.c._cardsDirty = true; }
  tap(u, v) {
    if (this.busy || this.phase === 'decide') return; if (v < 0.86) return;
    if (this.phase === 'done') this.reset();
    const R = this.eng.rules; if (this.ante + this.c.chip > R.maxAnte) return this.c.msg(esc(this.t('maxBet', { x: fmt(R.maxAnte) })), 1600);
    if (this.put(this.c.chip)) this.ante += this.c.chip; this.c.refresh();
  }
  act(id) {
    if (this.busy) return;
    if (id === 'clear') { if (this.ante) this.c.bank.refund(this.ante); this.ante = 0; return this.c.refresh(); }
    if (id === 'rebet') { if (this.phase === 'done') this.reset(); if (this.put(this.last)) this.ante = this.last; return this.c.refresh(); }
    if (id === 'deal') return this.deal();
    if (id === 'call' || id === 'fold') return this.finish(id === 'call');
  }
  async deal() {
    const c = this.c, R = this.eng.rules; if (this.ante < R.minAnte) return c.msg(esc(this.t('minBet', { x: fmt(R.minAnte) })), 1800);
    this.busy = true; this.last = this.ante; const d = this.eng.deal(this.ante); this.phase = 'play'; c.refresh();
    const S = HLD.s, give = async (arr, card, u, v, up) => { const k = c.card(card, SHOE[0], SHOE[1], 0.07, { s: S }); arr.push(k); c.move(k, u, v, { flip: up ? 1 : 0, ms: 300 }); c.sound.play('card'); this.dealerArm(); await c.wait(300); };
    for (let i = 0; i < 2; i++) { await give(this.vp, d.player[i], (i - 0.5) * 0.096 * S, HLD.playerV, true); await give(this.vd, this.eng.dealer[i], (i - 0.5) * 0.096 * S, HLD.dealerV, false); }
    for (let i = 0; i < 3; i++) await give(this.vb, d.flop[i], (i - 2) * 0.095 * S, HLD.boardV, true);
    this.phase = 'decide'; this.busy = false; c.refresh();
  }
  async finish(call) {
    const c = this.c; if (call && !this.put(this.ante * 2)) return;
    this.busy = true; if (call) this.call = this.ante * 2; c.refresh();
    const r = call ? this.eng.call() : this.eng.fold();
    if (call) for (let i = 3; i < 5; i++) { const k = c.card(r.board[i], SHOE[0], SHOE[1], 0.07, { s: HLD.s }); this.vb.push(k); c.move(k, (i - 2) * 0.095 * HLD.s, HLD.boardV, { flip: 1, ms: 300 }); c.sound.play('card'); this.dealerArm(); await c.wait(420); }
    for (const k of this.vd) { c.move(k, (this.vd.indexOf(k) - 0.5) * 0.096 * HLD.s, HLD.dealerV, { flip: 1, ms: 260, lift: 0.03 }); c.sound.play('flip'); await c.wait(260); }
    this.res = r; this.phase = 'play'; c.refresh(); await c.wait(900);
    this.settle(r.staked, r.returned);
    await c.wait(1400); this.gone = true; this.phase = 'done'; this.busy = false; c.refresh();
  }
}

// ================================================================== craps (pass line with odds)
const DIE_Q = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [0, 0, Math.PI / 2], 5: [0, 0, -Math.PI / 2], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };
class CrapsT extends Table {
  constructor(c, s) { super(c, s); this.name = 'craps'; this.rules = 'rulesCraps'; this.eng = new Craps({ rng: c.rng() }); this.pass = 0; this.last = 0; this.roll = null; this.res = null; this.win = 0; }
  open() { this.c.say('placeBets'); }
  staked() { return (this.eng.phase === 'bet' ? this.pass : this.eng.pass) + this.eng.odds; }
  canLeave() { return !this.busy && this.eng.phase !== 'point'; }
  close() { if (this.pass) this.c.bank.refund(this.pass); for (const d of this.c.dice) d.visible = false; }
  rig(x) { this.eng.stack(x); }
  view() { const p = this.c.walk.camera.aspect < 1; return { u: 0, v: ART.CR.v0 + 0.44, W: ART.CR.w + 0.08, D: 0.98, elev: p ? 60 : 46, fov: p ? 72 : 44 }; }
  status() { const R = this.eng.rules, p = this.eng.point; return p ? `${esc(this.t('point'))} <b style="color:#fff">${p}</b> · ${esc(this.t('odds'))} <bdi>${fmt(this.eng.odds)} / ${fmt(this.eng.maxOdds())}</bdi>` : `${esc(this.t('comeOut'))} · ${M(R.minBet)} – ${M(R.maxBet)}`; }
  history() { return this.eng.history.slice(0, 12).map(n => `<i class="${n === 7 ? 'red' : n === 11 ? 'green' : 'black'}">${n}</i>`).join(''); }
  chips() { const out = [], K = ART.CR, pv = K.v0 + (K.passV[0] + K.passV[1]) / 2, ov = K.v0 + (K.oddsV[0] + K.oddsV[1]) / 2, pass = this.eng.phase === 'bet' ? this.pass : this.eng.pass; if (pass) out.push(...this.c.stack(pass, 0.3, pv, 0.002, 1)); if (this.eng.odds) out.push(...this.c.stack(this.eng.odds, 0.3, ov, 0.002, 2)); if (this.win) out.push(...this.c.stack(this.win, 0.18, pv, 0.002, 3)); return out; }
  labels() {
    const L = [], p = this.eng.point;
    const K = ART.CR;
    if (p) { const i = K.points.indexOf(p); L.push({ id: 'on', u: (i - 2.5) * K.boxW, v: K.v0 + K.pointV[1] + 0.035, text: 'ON', cls: 'act big' }); }
    if (this.res && !this.roll) L.push({ id: 'r', u: 0, v: K.v0 + K.textV, text: `<bdi>${this.res.d1} + ${this.res.d2} = ${this.res.sum}</bdi>`, cls: 'big ' + (this.res.outcome === 'win' ? 'win' : this.res.outcome === 'lose' ? 'lose' : '') });
    return L;
  }
  buttons() {
    const t = (k) => this.t(k), ph = this.eng.phase;
    if (ph === 'point') return [{ id: 'odds', label: t('odds') + ' +', sub: M(this.oddsInc()), off: this.busy || this.eng.odds + this.oddsInc() > this.eng.maxOdds() }, { id: 'roll', label: t('roll'), gold: true, off: this.busy }];
    return [{ id: 'clear', label: t('clear'), off: this.busy || !this.pass }, { id: 'rebet', label: t('rebet'), off: this.busy || !this.last || this.pass > 0 }, { id: 'roll', label: t('roll'), gold: true, off: this.busy || !this.pass }];
  }
  oddsInc() { const st = this.eng.oddsStep() || 100; return Math.max(st, Math.floor(this.c.chip / st) * st); }
  tap(u, v) {
    if (this.busy) return; const R = this.eng.rules;
    if (this.eng.phase === 'point') { if (v < ART.CR.v0 + 0.36) this.act('odds'); return; }
    if (v > ART.CR.v0 + 0.32) return; this.win = 0; this.res = null;
    if (this.pass + this.c.chip > R.maxBet) return this.c.msg(esc(this.t('maxBet', { x: fmt(R.maxBet) })), 1600);
    if (this.put(this.c.chip)) this.pass += this.c.chip; this.c.refresh();
  }
  act(id) {
    if (this.busy) return;
    if (id === 'clear') { if (this.pass) this.c.bank.refund(this.pass); this.pass = 0; return this.c.refresh(); }
    if (id === 'rebet') { this.win = 0; this.res = null; if (this.put(this.last)) this.pass = this.last; return this.c.refresh(); }
    if (id === 'odds') { const inc = this.oddsInc(); if (this.eng.odds + inc > this.eng.maxOdds()) return; if (!this.put(inc)) return; this.eng.setOdds(this.eng.odds + inc); return this.c.refresh(); }
    if (id === 'roll') return this.throw();
  }
  async throw() {
    const c = this.c, R = this.eng.rules;
    if (this.eng.phase === 'bet') { if (this.pass < R.minBet) return c.msg(esc(this.t('minBet', { x: fmt(R.minBet) })), 1800); this.eng.bet(this.pass); this.last = this.pass; this.pass = 0; }
    this.busy = true; this.win = 0; this.res = null; c.refresh();
    const staked = this.eng.pass + this.eng.odds, r = this.eng.roll();
    c.sound.play('dice');
    await new Promise((done) => { const T = c.dur(1150), t0 = performance.now(), to = [[-0.07 - Math.random() * 0.16, 0.5 + Math.random() * 0.1], [0.07 + Math.random() * 0.16, 0.5 + Math.random() * 0.1]], spin = [Math.random() * 6, Math.random() * 6];
      this.roll = (now) => {
        const t = clamp((now - t0) / T, 0, 1), e = 1 - Math.pow(1 - t, 3);
        c.dice.forEach((d, i) => { const u = (i ? 0.5 : -0.5) + (to[i][0] - (i ? 0.5 : -0.5)) * e, v = 0.02 + (to[i][1] - 0.02) * e, [x, y, z] = c.at(u, v, 0.0225 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.12 * (1 - t));
          d.visible = true; d.position.set(x, y, z); const q = DIE_Q[i ? r.d2 : r.d1], k = (1 - e) * 9; d.rotation.set(q[0] + k * (1 + i), spin[i] * e + k, q[2] + k * 0.7); });
        if (t >= 1) { this.roll = null; done(); }
      }; });
    this.res = r; c.refresh();
    const out = r.outcome;
    if (out === 'point') { c.msg(`${esc(this.t('point'))} ${r.point}`, 1600); c.sound.say(this.t('point') + ' ' + r.point); }
    else if (out === 'roll') c.msg(String(r.sum), 900);
    else { if (out === 'lose' && r.was) c.msg(esc(this.t('sevenOut')), 1400, 'lose'); await c.wait(500); this.win = Math.max(0, r.returned - staked); this.settle(staked, r.returned, { quiet: out === 'lose' && !!r.was }); }
    await c.wait(400); this.busy = false; c.refresh();
  }
  tick(dt, now) { if (this.roll) this.roll(now); }
}

// ================================================================== machines: the screen is a canvas drawn here
class Machine extends Table {
  constructor(c, s) { super(c, s); this.noChips = true; this.K = MACHINE[s.game]; this.dirty = true; }
  open() {
    const c = this.c, K = this.K, m = c.screenMesh, off = K.d / 2 + 0.012, x = this.s.O[0] - this.s.look[0] * off, z = this.s.O[1] - this.s.look[1] * off;
    m.position.set(x, c.deckY + K.sy, z); m.rotation.set(0, this.s.yaw, 0); m.scale.set(K.sw, K.sh, 1); m.visible = true;
    const t = c.screen.t, ph = Math.round(512 * K.sh / K.sw); this.ph = ph; t.repeat.set(1, ph / 512); t.offset.set(0, 1 - ph / 512);
    this.dirty = true;
  }
  view() { const K = this.K; return { vertical: true, u: 0, v: -(K.d / 2 + 0.01), h: K.sy + 0.02, W: K.sw + 0.1, D: K.sh + 0.2, elev: 2, fov: this.c.walk.camera.aspect < 1 ? 50 : 40 }; }
  close() { this.c.screenMesh.visible = false; }
  tick(dt, now) { if (this.anim) { this.anim(now); this.dirty = true; } if (this.dirty) { this.dirty = false; this.draw(this.c.screen.g, now); this.c.screen.t.needsUpdate = true; } }
  /** Screen tap in metres → canvas pixels. */
  px(u, v) { return [(u / this.K.sw + 0.5) * 512, (0.5 - v / this.K.sh) * this.ph]; }
}
class SlotsM extends Machine {
  constructor(c, s) { super(c, s); this.name = 'slots'; this.rules = 'rulesSlots'; this.eng = new Slots({ rng: c.rng() }); this.bi = 1; this.pos = STRIPS.map((st, i) => (i * 7) % st.length); this.res = null; this.lineI = 0; this.sym = ART.slotSymbols(); }
  rig(x) { this.eng.stack(x); }
  get lineBet() { return SLOT_RULES.lineBets[this.bi]; }
  staked() { return this.lineBet * LINES.length; }
  status() { return `${esc(this.t('lines'))} · ${esc(this.t('lineBet'))} ${M(this.lineBet)}` + (this.res && this.res.win ? ` · ${esc(this.t('win'))} ${M(this.res.win)}` : ''); }
  buttons() { const t = (k) => this.t(k); return [{ id: 'less', label: '−', off: this.busy || this.bi === 0 }, { id: 'more', label: '+', off: this.busy || this.bi === SLOT_RULES.lineBets.length - 1 }, { id: 'spin', label: t('spin'), sub: M(this.staked()), gold: true, off: this.busy }]; }
  act(id) { if (this.busy) return; if (id === 'less' || id === 'more') { this.bi = clamp(this.bi + (id === 'more' ? 1 : -1), 0, SLOT_RULES.lineBets.length - 1); this.dirty = true; return this.c.refresh(); } if (id === 'spin') return this.spin(); }
  tap() { if (!this.busy) this.spin(); }
  async spin() {
    const c = this.c; if (!this.put(this.staked(), true)) return;
    this.busy = true; this.res = null; c.refresh();
    const r = this.eng.spin(this.lineBet), t0 = performance.now(), from = this.pos.slice(), T = r.stops.map((_, i) => c.dur(900 + i * 320)), stopped = [false, false, false, false, false];
    await new Promise((done) => { this.anim = (now) => {
      let all = true;
      for (let i = 0; i < 5; i++) { const L = STRIPS[i].length, t = clamp((now - t0) / T[i], 0, 1), e = 1 - Math.pow(1 - t, 3), travel = 3 * L + ((r.stops[i] - from[i]) % L + L) % L; this.pos[i] = from[i] + travel * e; if (t < 1) all = false; else if (!stopped[i]) { stopped[i] = true; this.pos[i] = r.stops[i]; c.sound.play('reel'); } }
      if (all) { this.anim = null; done(); }
    }; });
    this.res = r; this.dirty = true; this.lineT = performance.now();
    this.settle(r.staked, r.returned, { quiet: r.returned === 0 });
    if (r.returned === 0) c.sound.play('tick');
    await c.wait(250); this.busy = false; c.refresh();
  }
  tick(dt, now) { if (this.res && this.res.wins.length && !this.anim && now - (this.lineT || 0) > 900) { this.lineT = now; this.lineI++; this.dirty = true; } super.tick(dt, now); }
  draw(g) {
    const W = 512, x0 = 16, y0 = 78, cw = 96, ch = 116;
    g.fillStyle = '#0a1226'; g.fillRect(0, 0, W, 512);
    g.fillStyle = '#f0d79a'; g.font = '700 30px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('VILNYI RIVIERA', W / 2, 40);
    g.save(); g.beginPath(); g.rect(x0, y0, cw * 5, ch * 3); g.clip();
    for (let i = 0; i < 5; i++) {
      const st = STRIPS[i], L = st.length, p = this.pos[i], f = p - Math.floor(p), b = Math.floor(p);
      g.fillStyle = i % 2 ? '#111d3c' : '#0d1732'; g.fillRect(x0 + i * cw, y0, cw, ch * 3);
      for (let j = -1; j <= 3; j++) { const k = st[((b + j) % L + L) % L]; g.drawImage(this.sym[k], x0 + i * cw + 4, y0 + (j - f) * ch + (ch - 88) / 2, 88, 88); }
    }
    g.restore();
    g.strokeStyle = '#d2a95a'; g.lineWidth = 4; g.strokeRect(x0 - 2, y0 - 2, cw * 5 + 4, ch * 3 + 4); g.lineWidth = 1.5; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(x0 + i * cw, y0); g.lineTo(x0 + i * cw, y0 + ch * 3); g.stroke(); }
    const r = this.res;
    if (r && r.wins.length && !this.anim) {
      const w = r.wins[this.lineI % r.wins.length], ln = LINES[w.line]; g.strokeStyle = '#ffe9a6'; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath();
      ln.forEach((row, i) => { const x = x0 + (i + 0.5) * cw, y = y0 + (row + 0.5) * ch; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      for (let i = 0; i < w.count; i++) { g.strokeStyle = '#9ff0b4'; g.lineWidth = 4; g.strokeRect(x0 + i * cw + 4, y0 + ln[i] * ch + 4, cw - 8, ch - 8); }
    }
    g.fillStyle = '#cfe0ff'; g.font = '600 20px system-ui,sans-serif'; g.textAlign = 'left'; g.fillText('BET ' + fmt(this.staked()), 20, 462); g.textAlign = 'right';
    g.fillStyle = r && r.win ? '#9ff0b4' : '#cfe0ff'; g.font = (r && r.win ? '700 28px' : '600 20px') + ' system-ui,sans-serif'; g.fillText('WIN ' + fmt(r ? r.win : 0), 492, 462);
    g.textAlign = 'center'; g.fillStyle = 'rgba(240,215,154,0.8)'; g.font = '500 15px system-ui,sans-serif'; g.fillText('PLAY CHIPS ONLY · 20 LINES · ' + (r && r.scatter.count >= 3 ? r.scatter.count + ' KEYS!' : 'WILD = BIRD'), W / 2, 494);
  }
}
class VideoPokerM extends Machine {
  constructor(c, s) { super(c, s); this.name = 'vpoker'; this.rules = 'rulesVP'; this.eng = new VideoPoker({ rng: c.rng() }); this.coins = 5; this.ci = 1; this.res = null; this.atlas = ART.cardAtlas().image; }
  rig(x) { this.eng.stack(typeof x === 'string' ? parseCards(x) : x); }
  get coin() { return VP_RULES.coinValues[this.ci]; }
  staked() { return this.coins * this.coin; }
  canLeave() { return !this.busy && this.eng.phase !== 'draw'; }
  status() { const cat = this.eng.phase === 'draw' ? this.eng.dealt : this.res ? this.res.category : null; return `${this.coins} × ${M(this.coin)}` + (cat ? ` · ${esc(this.t(cat))}` : '') + (this.res && this.res.win ? ` · ${esc(this.t('win'))} ${M(this.res.win)}` : ''); }
  buttons() { const t = (k) => this.t(k); if (this.eng.phase === 'draw') return [{ id: 'draw', label: t('draw'), gold: true, off: this.busy }]; return [{ id: 'coin', label: t('coin'), sub: M(this.coin), off: this.busy }, { id: 'coins', label: t('coins'), sub: String(this.coins), off: this.busy }, { id: 'deal', label: t('deal'), sub: M(this.staked()), gold: true, off: this.busy }]; }
  extra() { return this.eng.phase === 'draw' ? this.eng.held.map((h, i) => ({ id: 'hold' + i, label: this.t('hold') + ' ' + (i + 1), on: h, off: this.busy })) : []; }
  act(id) {
    if (this.busy) return;
    if (id === 'coin') { this.ci = (this.ci + 1) % VP_RULES.coinValues.length; this.dirty = true; return this.c.refresh(); }
    if (id === 'coins') { this.coins = this.coins % VP_RULES.maxCoins + 1; this.dirty = true; return this.c.refresh(); }
    if (id.startsWith('hold')) { this.eng.hold(+id.slice(4)); this.c.sound.play('tick'); this.dirty = true; return this.c.refresh(); }
    if (id === 'deal') { if (!this.put(this.staked(), true)) return; this.res = null; this.eng.deal(this.coins, this.coin); this.c.sound.play('card'); this.dirty = true; return this.c.refresh(); }
    if (id === 'draw') { const r = this.eng.draw(); this.res = r; this.c.sound.play('card'); this.dirty = true; this.settle(r.staked, r.returned, { quiet: r.returned === 0 }); return this.c.refresh(); }
  }
  tap(u, v) { if (this.busy || this.eng.phase !== 'draw') return; const [x, y] = this.px(u, v); if (y < 236 || y > 380) return; const i = Math.floor((x - 11) / 98); if (i >= 0 && i < 5) this.act('hold' + i); }
  draw(g) {
    const W = 512, H = this.ph, win = this.res ? this.res.category : this.eng.phase === 'draw' ? this.eng.dealt : null;
    g.fillStyle = '#0b1f4a'; g.fillRect(0, 0, W, 512);
    // paytable: 9 rows × 5 coin columns
    const names = { royal: 'ROYAL FLUSH', sflush: 'STRAIGHT FLUSH', four: '4 OF A KIND', full: 'FULL HOUSE', flush: 'FLUSH', straight: 'STRAIGHT', three: '3 OF A KIND', twopair: 'TWO PAIR', jacks: 'JACKS OR BETTER' };
    g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,233,166,0.16)'; g.fillRect(196 + (this.coins - 1) * 62, 6, 62, 9 * 23 + 4);
    PAYTABLE.forEach((r, i) => {
      const y = 19 + i * 23; if (r.id === win) { g.fillStyle = '#b3202c'; g.fillRect(4, y - 11, W - 8, 22); }
      g.fillStyle = r.id === win ? '#fff' : '#ffe9a6'; g.font = '700 15px system-ui,sans-serif'; g.textAlign = 'left'; g.fillText(names[r.id], 10, y);
      g.textAlign = 'right'; r.pays.forEach((p, k) => { g.fillStyle = r.id === win && k === this.coins - 1 ? '#fff' : k === this.coins - 1 ? '#ffe9a6' : '#c9b37a'; g.fillText(String(p), 252 + k * 62, y); });
    });
    g.strokeStyle = '#d2a95a'; g.lineWidth = 2; g.strokeRect(4, 6, W - 8, 9 * 23 + 4);
    const hand = this.eng.hand, c = ART.CARD;
    for (let i = 0; i < 5; i++) {
      const x = 15 + i * 98, y = 250, has = hand && hand.length === 5;
      if (has) g.drawImage(this.atlas, (hand[i] % 13) * c.cw, Math.floor(hand[i] / 13) * c.ch, c.cw, c.ch, x, y, 90, 125); else g.drawImage(this.atlas, 0, 4 * c.ch, c.cw, c.ch, x, y, 90, 125);
      if (this.eng.phase === 'draw' && this.eng.held[i]) { g.fillStyle = '#ffe9a6'; g.fillRect(x + 8, y - 20, 74, 18); g.fillStyle = '#111'; g.font = '700 13px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('HELD', x + 45, y - 10); }
    }
    g.textAlign = 'left'; g.fillStyle = '#cfe0ff'; g.font = '600 16px system-ui,sans-serif'; g.fillText('BET ' + fmt(this.staked()), 12, H - 14);
    g.textAlign = 'right'; g.fillStyle = this.res && this.res.win ? '#9ff0b4' : '#cfe0ff'; g.font = (this.res && this.res.win ? '700 20px' : '600 16px') + ' system-ui,sans-serif'; g.fillText('WIN ' + fmt(this.res ? this.res.win : 0), W - 12, H - 14);
    g.textAlign = 'center'; g.fillStyle = 'rgba(240,215,154,0.8)'; g.font = '500 12px system-ui,sans-serif'; g.fillText('PLAY CHIPS ONLY', W / 2, H - 14);
  }
}
void THREE; void category; void SYMBOLS;

export const GAMES = { bj: BJ, roulette: RouletteT, baccarat: BaccaratT, holdem: HoldemT, craps: CrapsT, slots: SlotsM, vpoker: VideoPokerM };
