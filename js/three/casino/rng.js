// VILNYI Lifestyle casino — random numbers and cards (pure logic: no DOM, no three.js; runs under node for the tests).
// An RNG here is an object { int(n) } returning a uniform integer in [0, n). In play the source is
// crypto.getRandomValues with rejection sampling (no modulo bias); tests inject seededRng(seed) for determinism.

/** Deterministic RNG (mulberry32) for tests and replays. */
export function seededRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0); };
  return {
    seeded: true,
    // rejection sampling here too, so the seeded stream is exactly uniform
    int(n) { if (!(n >= 1)) throw new RangeError('int(n): n ≥ 1'); const lim = 4294967296 - (4294967296 % n); for (;;) { const x = next(); if (x < lim) return x % n; } },
  };
}
/** Cryptographic RNG: uniform integers by rejection sampling of 32-bit words (no modulo bias). */
export function cryptoRng(cryptoObj = globalThis.crypto) {
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') throw new Error('crypto.getRandomValues is not available');
  const buf = new Uint32Array(64); let i = buf.length;
  const next = () => { if (i >= buf.length) { cryptoObj.getRandomValues(buf); i = 0; } return buf[i++]; };
  return {
    seeded: false,
    int(n) {
      if (!(n >= 1) || n > 4294967296) throw new RangeError('int(n): 1 ≤ n ≤ 2^32');
      const lim = 4294967296 - (4294967296 % n);        // largest multiple of n that fits in 32 bits
      for (;;) { const x = next(); if (x < lim) return x % n; }
    },
  };
}
/** Fisher–Yates shuffle in place with the given RNG. */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = rng.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

// ---------------------------------------------------------------- cards: 0…51, rank = c % 13 (0 = ace … 12 = king), suit = c / 13 | 0
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['s', 'h', 'd', 'c'];                 // spades, hearts, diamonds, clubs
export const rankOf = (c) => c % 13;
export const suitOf = (c) => (c / 13) | 0;
export const cardName = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
/** 'As', '10h', 'Td', 'Kc' → card number. */
export function card(name) {
  const m = /^(10|[2-9TJQKA])([shdc])$/i.exec(String(name).trim()); if (!m) throw new Error('bad card ' + name);
  const r = m[1].toUpperCase() === 'T' ? '10' : m[1].toUpperCase();
  return SUITS.indexOf(m[2].toLowerCase()) * 13 + RANKS.indexOf(r);
}
export const cards = (s) => String(s).trim().split(/[\s,]+/).filter(Boolean).map(card);

/** A shoe of `decks` packs with a cut card: draw(), stack(cards) to force the next cards (tests / demos). */
export class Shoe {
  constructor(decks, rng, { penetration = 0.75, burn = 0 } = {}) {
    this.decks = decks; this.rng = rng; this.penetration = penetration; this.burn = burn;
    this.cards = []; this.pos = 0; this.shuffles = 0; this.forced = [];
    this.shuffle();
  }
  get size() { return this.decks * 52; }
  get cut() { return Math.round(this.size * this.penetration); }     // cards dealt before the cut card shows
  get remaining() { return this.cards.length - this.pos + this.forced.length; }
  get cutReached() { return this.pos >= this.cut; }
  shuffle() {
    const a = new Array(this.size); for (let i = 0; i < a.length; i++) a[i] = i % 52;
    this.cards = shuffle(a, this.rng); this.pos = this.burn; this.shuffles++;
  }
  /** Force the next cards to come out in this order (card numbers or names). */
  stack(list) { this.forced.push(...(typeof list === 'string' ? cards(list) : list.map(c => typeof c === 'string' ? card(c) : c))); return this; }
  draw() {
    if (this.forced.length) return this.forced.shift();
    if (this.pos >= this.cards.length) this.shuffle();     // (never in practice: the cut card comes first)
    return this.cards[this.pos++];
  }
}
