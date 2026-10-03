// VILNYI Lifestyle casino — the visitor's bankroll of PLAY chips (pure logic; storage is injected).
// Fictional money only: there is no purchase, deposit, cash-out or prize anywhere. Everyone starts with €1,000; the
// balance is shared by all games and kept in localStorage; when broke the cashier refills it to €1,000 for free.
export const START = 100000;                       // cents
export const BROKE_BELOW = 500;                    // under the lowest table minimum (€5) the cashier refills
export const CHIPS = [100, 500, 2500, 10000, 50000];   // €1, €5, €25, €100, €500
const KEY = 'vrc.casino.v1';

/** Money as text: "€1,234" or "€1,234.50". */
export function fmt(cents) { const neg = cents < 0, a = Math.abs(cents), e = Math.floor(a / 100), c = Math.round(a % 100); return (neg ? '−' : '') + '€' + String(e).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (c ? '.' + String(c).padStart(2, '0') : ''); }
/** Chips that make up an amount, largest first (at most `max` discs; the rest is folded into the top chips). */
export function chipsFor(cents, max = 12) {
  const out = []; let left = Math.floor(cents / 100) * 100;
  for (let i = CHIPS.length - 1; i >= 0; i--) while (left >= CHIPS[i] && out.length < max) { out.push(CHIPS[i]); left -= CHIPS[i]; }
  return out;
}
export class Bank {
  /** storage: { getItem, setItem } or null (every access is wrapped: private mode, blocked storage). */
  constructor(storage = null) {
    this.storage = storage; this.balance = START; this.listeners = [];
    this.stats = { hands: 0, biggestWin: 0, wagered: 0, returned: 0, refills: 0 };
    this.session = { hands: 0, biggestWin: 0, wagered: 0, returned: 0, start: START };
    this.load(); this.session.start = this.balance;
  }
  load() {
    try {
      const raw = this.storage && this.storage.getItem(KEY); if (!raw) return;
      const d = JSON.parse(raw);
      if (Number.isFinite(d.balance) && d.balance >= 0 && d.balance < 1e12) this.balance = Math.round(d.balance);
      if (d.stats && typeof d.stats === 'object') for (const k of Object.keys(this.stats)) if (Number.isFinite(d.stats[k]) && d.stats[k] >= 0) this.stats[k] = d.stats[k];
    } catch { /* corrupt or blocked: start fresh */ }
  }
  save() { try { if (this.storage) this.storage.setItem(KEY, JSON.stringify({ balance: this.balance, stats: this.stats })); } catch { /* blocked */ } }
  onChange(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
  _emit() { this.save(); for (const f of this.listeners) { try { f(this); } catch { /* listener */ } } }
  can(cents) { return Number.isFinite(cents) && cents >= 0 && cents <= this.balance; }
  /** Take a stake off the balance. → false when there is not enough. */
  stake(cents) { if (!Number.isInteger(cents) || cents <= 0 || cents > this.balance) return false; this.balance -= cents; this.stats.wagered += cents; this.session.wagered += cents; this._emit(); return true; }
  /** Pay money back to the balance (stake included). */
  pay(cents) { if (!(cents > 0)) return; cents = Math.round(cents); this.balance += cents; this.stats.returned += cents; this.session.returned += cents; this._emit(); }
  /** Give a stake back untouched (a bet taken off the table before the deal): not counted as wagered. */
  refund(cents) { if (!(cents > 0)) return; this.balance += cents; this.stats.wagered -= cents; this.session.wagered -= cents; this._emit(); }
  /** Record a finished round: staked and returned in cents. */
  round(staked, returned) {
    const win = returned - staked;
    for (const s of [this.stats, this.session]) { s.hands++; if (win > s.biggestWin) s.biggestWin = win; }
    this._emit();
  }
  get broke() { return this.balance < BROKE_BELOW; }
  /** Free refill to €1,000 — only when broke. → true if refilled. */
  refill() { if (!this.broke) return false; this.balance = START; this.stats.refills++; this._emit(); return true; }
  get sessionNet() { return this.session.returned - this.session.wagered; }
}
