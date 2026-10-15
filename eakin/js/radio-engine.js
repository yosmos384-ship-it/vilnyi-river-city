// radio-engine.js — shared procedural WebAudio radio: 6 AM "stations" (all music / voices synthesized, no samples),
// static between stations, background (non-positional) mix + louder panned mix near the vintage radio.
// Used by core (UI chip / panel, autostart on first gesture) and interior-radio.js (the 3D radio in the living room).
// Singleton: createRadio(audio) once (idempotent), getRadio() anywhere. No imports, no side effects on import.
// CPU: notes are scheduled ahead on the AudioContext clock (lookahead ~0.45 s, pumped by frames + a 100 ms timer);
// filters / formant banks / noise buffer are created once per station and reused; only oscillators + their envelope
// gains are created per note (WebAudio sources are one-shot by design).

export const FMIN = 540, FMAX = 1600;
export const STATIONS = [
  { id: 'swing', f: 640, call: 'WOSU', he: 'סווינג ג׳אז', sub: 'ביג-בנד, ויברפון וקונטרבס' },
  { id: 'doowop', f: 820, call: 'WBNS', he: 'דו-וופ ורוקנרול', sub: 'הרמוניות, פסנתר ושלישונים וסקסופון' },
  { id: 'country', f: 1010, call: 'WCKX', he: 'קאנטרי ובלוגראס', sub: 'בנג׳ו, כינור ובס בום-צ׳יק' },
  { id: 'blues', f: 1180, call: 'WCOL', he: 'בלוז', sub: 'שאפל איטי, 12 תיבות, אורגן וגיטרה' },
  { id: 'strings', f: 1370, call: 'WGRV', he: 'קלאסי ולאונג׳', sub: 'מיתרים, צ׳לו ונבל' },
  { id: 'scanner', f: 1560, call: 'CPD', he: 'סורק משטרה', sub: 'קשר משטרתי אמריקאי (מדומה, בלי מילים)' },
];
// V4/V5: real American stations. On a normal web host they play INSIDE the page through an <audio> element (no
// crossOrigin → no CORS needed; the element is not routed into WebAudio). Inside the claude.ai artifact the page CSP
// blocks external media + fetch: probe() then reports 'no' and the UI falls back to new-tab links + the in-house synth.
// streams = known direct streams (tried first); rb = radio-browser lookups (url_resolved, cached), pref = state/city.
export const LIVE_STATIONS = [
  { id: 'wosu', call: 'WOSU', freq: '89.7 FM', city: 'Columbus', he: 'חדשות NPR', url: 'https://www.wosu.org/listen-live', rb: [{ name: 'WOSU' }], pref: ['ohio', 'columbus'] },
  { id: 'wcol', call: 'WCOL', freq: '92.3 FM', city: 'Columbus', he: 'קאנטרי', url: 'https://wcol.iheart.com/', rb: [{ name: 'WCOL' }], pref: ['ohio', 'columbus'] },
  { id: 'wnci', call: 'WNCI', freq: '97.9 FM', city: 'Columbus', he: 'להיטים', url: 'https://wnci.iheart.com/', rb: [{ name: 'WNCI' }], pref: ['ohio', 'columbus'] },
  { id: 'qfm96', call: 'QFM96', freq: 'WLVQ 96.3', city: 'Columbus', he: 'רוק קלאסי', url: 'https://qfm96.com/', rb: [{ name: 'QFM96' }, { name: 'WLVQ' }], pref: ['ohio', 'columbus'] },
  { id: 'wwoz', call: 'WWOZ', freq: '90.7 FM', city: 'New Orleans', he: 'ג׳אז ובלוז', url: 'https://www.wwoz.org/', streams: ['https://wwoz-sc.streamguys1.com/wwoz-hi.mp3'], rb: [{ name: 'WWOZ' }], pref: ['louisiana'] },
  { id: 'kexp', call: 'KEXP', freq: '90.3 FM', city: 'Seattle', he: 'אינדי / אלטרנטיבי', url: 'https://www.kexp.org/listen', streams: ['https://kexp.streamguys1.com/kexp160.aac', 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3'], rb: [{ name: 'KEXP' }], pref: ['washington'] },
  { id: 'wbgo', call: 'WBGO', freq: '88.3 FM', city: 'Newark', he: 'ג׳אז', url: 'https://www.wbgo.org/', rb: [{ name: 'WBGO' }], pref: ['new jersey'] },
  { id: 'wqxr', call: 'WQXR', freq: '105.9 FM', city: 'New York', he: 'מוזיקה קלאסית', url: 'https://www.wqxr.org/', rb: [{ name: 'WQXR' }], pref: ['new york'] },
  { id: 'wcbsfm', call: 'WCBS-FM', freq: '101.1 FM', city: 'New York', he: 'אולדיז — שנות ה-50/60/70', url: 'https://www.wcbsfm.com/', rb: [{ name: 'WCBS-FM' }, { name: 'WCBS FM' }], pref: ['new york'] },
  { id: 'wtop', call: 'WTOP', freq: '103.5 FM', city: 'Washington D.C.', he: 'חדשות', url: 'https://wtop.com/', rb: [{ name: 'WTOP' }], pref: ['district of columbia', 'washington', 'virginia', 'maryland'] },
  { id: 'scanner', call: 'סורק משטרה אמיתי', freq: 'Broadcastify', city: 'Franklin County / Columbus', he: 'קשר משטרה וכיבוי בשידור חי', url: 'https://www.broadcastify.com/listen/ctid/2064/publicsafety', rb: [{ tag: 'scanner', name: 'police' }, { tag: 'scanner' }, { name: 'police scanner' }], pref: ['ohio', 'columbus', 'franklin'], scanner: true },
];
export const RB_MIRRORS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
// dial positions for the 3D radio needle (AM dial 540–1600, spread between the synth stations' marks)
const liveDial = (i) => 565 + (i * (1575 - 565)) / (LIVE_STATIONS.length - 1);
const BASE = 0.3, NEAR = 0.8, LOOK = 0.45, TUNE_W = 18;
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function lsGet(k) { try { return globalThis.localStorage ? globalThis.localStorage.getItem('eakin_' + k) : null; } catch (_) { return null; } }
function lsSet(k, v) { try { if (globalThis.localStorage) globalThis.localStorage.setItem('eakin_' + k, v); } catch (_) { /* private mode */ } }
const perfNow = () => ((globalThis.performance && globalThis.performance.now) ? globalThis.performance.now() : Date.now()) / 1000;

let SINGLETON = null;
export function getRadio() { return SINGLETON; }

export function createRadio(audio, opts = {}) {
  if (SINGLETON) { if (audio && !SINGLETON._audio) SINGLETON._audio = audio; return SINGLETON; }
  const savedVol = parseFloat(lsGet('radioVol'));
  const st = { on: false, idx: 0, f: STATIONS[0].f, vol: isFinite(savedVol) ? clamp(savedVol, 0, 1) : 0.7, cur: -1, tune: null, autoDone: false, notes: 0, events: 0, hidden: false, base: 0, near: 0 };
  const A = { ac: null, out: null, base: null, near: null, pan: null, bus: null, stat: null, statSrc: null, sg: [], kits: [], clocks: [], S: [], noise: null, iv: null };
  const subs = new Set(), panelSubs = new Set();
  let srcFn = null, lisFn = null;
  const emit = () => { for (const f of subs) { try { f(api.state); } catch (_) { /* listener */ } } };

  /* ------------------------------------------------------------------ graph (built once, reused) */
  function getAC() { try { const a = api._audio; return a ? a.ctx : null; } catch (_) { return null; } }
  function build() {
    if (A.out) return A.ac;
    const ac = getAC(); if (!ac) return null;
    try {
      A.ac = ac;
      let dest = null; try { dest = api._audio && api._audio.master; } catch (_) { dest = null; }
      A.out = ac.createGain(); A.out.gain.value = 0.0001; A.out.connect(dest || ac.destination);
      A.base = ac.createGain(); A.base.gain.value = 0.0001; A.base.connect(A.out);
      A.near = ac.createGain(); A.near.gain.value = 0.0001;
      if (typeof ac.createStereoPanner === 'function') { A.pan = ac.createStereoPanner(); A.near.connect(A.pan); A.pan.connect(A.out); } else A.near.connect(A.out);
      const post = ac.createGain(); post.gain.value = 1; post.connect(A.base); post.connect(A.near);
      const ws = ac.createWaveShaper(); const n = 1024, cv = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
      ws.curve = cv; ws.connect(post);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.9; lp.connect(ws);
      const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1200; pk.gain.value = 4; pk.Q.value = 0.8; pk.connect(lp);
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220; hp.connect(pk);
      A.bus = ac.createGain(); A.bus.gain.value = 1; A.bus.connect(hp);
      // noise buffer (shared by static, drums, squelch)
      const sr = ac.sampleRate || 44100, len = Math.floor(sr * 2);
      A.noise = ac.createBuffer(1, len, sr); const d = A.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A.stat = ac.createGain(); A.stat.gain.value = 0.0001; A.stat.connect(hp);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.45; bp.connect(A.stat);
      A.statSrc = ac.createBufferSource(); A.statSrc.buffer = A.noise; A.statSrc.loop = true; A.statSrc.connect(bp); A.statSrc.start();
      A.sg = STATIONS.map(() => { const g = ac.createGain(); g.gain.value = 0; g.connect(A.bus); return g; });
      A.kits = STATIONS.map(() => null);
      A.clocks = STATIONS.map(() => ({ t: 0, beat: 0 }));
      A.S = STATIONS.map(() => ({ next: 0 }));
      return ac;
    } catch (e) { try { console.warn('[radio] audio graph', e); } catch (_) {} A.out = null; return null; }
  }
  // per-station kit: destination + cached filters keyed by type/freq/q (reused by every note of that station)
  function kit(i) {
    if (A.kits[i]) return A.kits[i];
    const ac = A.ac, d = A.sg[i], cache = new Map();
    const K = {
      d, ac,
      filt(type, freq, q = 0.7) {
        const k = type + '|' + Math.round(freq) + '|' + q;
        let f = cache.get(k);
        if (!f) { f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(d); cache.set(k, f); }
        return f;
      },
    };
    A.kits[i] = K;
    return K;
  }

  /* ------------------------------------------------------------------ synth helpers */
  function note(K, t, freq, dur, type, vol, att = 0.008, rel = 0.08, lpF = 0, bend = 0) {
    const ac = K.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.linearRampToValueAtTime(freq * bend, t + Math.min(0.16, dur * 0.4));
    att = Math.min(att, dur * 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + Math.max(att, dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(lpF ? K.filt('lowpass', lpF, 0.7) : K.d);
    o.start(t); o.stop(t + dur + 0.05); st.notes++;
  }
  function pluck(K, t, freq, dur, type, vol, lpF = 0) {
    const ac = K.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(lpF ? K.filt('lowpass', lpF, 0.7) : K.d);
    o.start(t); o.stop(t + dur + 0.05); st.notes++;
  }
  function hit(K, t, dur, type, freq, q, vol, cut) {
    const ac = K.ac, s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = A.noise;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
    if (cut) { g.gain.setValueAtTime(vol, t + dur - 0.01); g.gain.linearRampToValueAtTime(0.0001, t + dur); } // abrupt (squelch)
    else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g); g.connect(K.filt(type, freq, q));
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function kick(K, t, vol) {
    const ac = K.ac, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(K.d); o.start(t); o.stop(t + 0.2); st.notes++;
  }

  /* ------------------------------------------------------------------ programmes (called once per beat) */
  // 1. swing in F, 140 bpm: walking bass, comping on 2 & 4, brushes + ride, vibes melody in swung 8ths
  const SW = { spb: 60 / 140, bars: [[[53, 57, 60, 62]], [[50, 54, 57, 60]], [[55, 58, 62, 65]], [[48, 52, 55, 58]], [[57, 60, 64, 67], [50, 54, 57, 60]], [[55, 58, 62, 65], [48, 52, 55, 58]], [[53, 57, 60, 62]], [[48, 52, 55, 58]]], mel: [65, 67, 69, 72, 74, 77, 79, 81] };
  function swing(K, t, beat) {
    const spb = SW.spb, bar = Math.floor(beat / 4) % 8, bi = beat % 4, ch = SW.bars[bar], chord = ch.length > 1 && bi >= 2 ? ch[1] : ch[0];
    const nextBar = SW.bars[(bar + 1) % 8][0];
    const bassN = bi === 0 ? chord[0] - 12 : bi === 1 ? chord[1] - 12 : bi === 2 ? chord[2] - 12 : nextBar[0] - 12 + (beat % 8 < 4 ? 1 : -1);
    note(K, t, mf(bassN), spb * 0.9, 'triangle', 0.32, 0.01, 0.1);
    note(K, t, mf(bassN + 12), spb * 0.5, 'sine', 0.06, 0.01, 0.05);
    if (bi === 1 || bi === 3) for (const n of chord.slice(1)) note(K, t, mf(n + 12), spb * 0.35, 'triangle', 0.045, 0.006, 0.06, 2500);
    hit(K, t, spb * 0.8, 'bandpass', 3200, 0.6, bi % 2 ? 0.09 : 0.05);
    hit(K, t, 0.18, 'highpass', 7500, 0.5, 0.05);
    if (bi % 2) hit(K, t + spb * 2 / 3, 0.12, 'highpass', 7500, 0.5, 0.035);
    const r = rng(bar * 31 + bi * 7 + 3);
    for (const sub of [0, 2 / 3]) {
      if (r() < 0.35) continue;
      const m = SW.mel[Math.floor(r() * SW.mel.length)];
      pluck(K, t + sub * spb, mf(m), 0.7, 'sine', 0.11); pluck(K, t + sub * spb, mf(m + 12), 0.25, 'sine', 0.025);
    }
  }
  // 2. doo-wop / 50s rock'n'roll ballad, 72 bpm 12/8: I-vi-IV-V, piano triplets, "ooh" pad, backbeat, sax answer
  const DW = { spb: 60 / 72, bars: [[48, 52, 55, 60], [45, 48, 52, 57], [41, 45, 48, 53], [43, 47, 50, 55]], mel: [[76, 72], [76, 72], [77, 72], [74, 71]], sax: [[67, 69, 72, 69], [64, 67, 69, 67], [65, 69, 72, 74], [67, 71, 74, 71]] };
  function doowop(K, t, beat) {
    const spb = DW.spb, bar = Math.floor(beat / 4) % 4, bi = beat % 4, ch = DW.bars[bar], sec = Math.floor(beat / 32) % 2;
    for (let k = 0; k < 3; k++) pluck(K, t + k * spb / 3, mf(ch[(k + bi) % 4] + 12), 0.5, 'triangle', 0.07);
    if (bi === 0 || bi === 2) note(K, t, mf(ch[bi === 0 ? 0 : 2] - 12), spb * 1.6, 'triangle', 0.3, 0.01, 0.2);
    if (bi === 0) for (const n of ch) note(K, t, mf(n + 12), spb * 4, 'sawtooth', 0.018, 0.35, 0.5, 900);
    if (bi === 1 || bi === 3) hit(K, t, 0.22, 'bandpass', 1800, 0.8, 0.12);
    hit(K, t, 0.08, 'highpass', 8000, 0.5, 0.025);
    if (sec === 0) {
      if (bi === 0 || bi === 2) { const m = DW.mel[bar][bi === 0 ? 0 : 1]; note(K, t, mf(m), spb * 1.9, 'sine', 0.12, 0.05, 0.3); note(K, t, mf(m) * 1.005, spb * 1.9, 'sine', 0.05, 0.08, 0.3); }
    } else {
      // tenor sax answer (sawtooth through a warm lowpass, a little scoop up into each note)
      const m = DW.sax[bar][bi];
      note(K, t + spb / 3, mf(m - 12) * 0.97, spb * 0.62, 'sawtooth', 0.06, 0.03, 0.12, 1300, 1 / 0.97);
    }
  }
  // 3. country / bluegrass, 116 bpm: boom-chick bass, banjo forward rolls in 16ths, fiddle, train-beat brushes
  const CO = { spb: 60 / 116, prog: ['G', 'G', 'C', 'G', 'G', 'D', 'D', 'G'], ch: { G: [43, [55, 59, 62]], C: [48, [55, 60, 64]], D: [50, [57, 62, 66]] }, roll: [2, 1, 0, 2, 1, 0, 2, 0] };
  function country(K, t, beat) {
    const spb = CO.spb, bar = Math.floor(beat / 4) % 8, bi = beat % 4, [root, tri] = CO.ch[CO.prog[bar]];
    if (bi === 0 || bi === 2) note(K, t, mf(bi === 0 ? root : root - 5), spb * 0.6, 'triangle', 0.3, 0.005, 0.1);
    if (bi % 2) for (const n of tri) note(K, t, mf(n), spb * 0.2, 'square', 0.022, 0.003, 0.05, 1800);
    for (let k = 0; k < 4; k++) {
      const n = tri[CO.roll[(bi * 4 + k) % 8]] + 12, tt = t + (k * spb) / 4;
      pluck(K, tt, mf(n), 0.22, 'square', 0.028, 3200); pluck(K, tt, mf(n), 0.16, 'triangle', 0.03);
    }
    if (bi === 0 || bi === 2) {
      const r = rng(bar * 13 + bi + 5), m = tri[Math.floor(r() * 3)] + 12 + (r() < 0.3 ? 2 : 0);
      note(K, t, mf(m), spb * 1.9, 'sawtooth', 0.032, 0.06, 0.25, 2300, r() < 0.4 ? 1.02 : 0);
      note(K, t, mf(m) * 1.004, spb * 1.9, 'sawtooth', 0.02, 0.09, 0.25, 2300);
    }
    hit(K, t, 0.1, 'bandpass', 3000, 0.6, bi % 2 ? 0.06 : 0.035);
    hit(K, t + spb / 2, 0.08, 'bandpass', 3000, 0.6, 0.025);
  }
  // 4. slow blues shuffle in A, 76 bpm: 12 bars, boogie bass, organ pad, kick/snare, guitar licks with bends
  const BL = { spb: 60 / 76, prog: [0, 5, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7], walk: [0, 7, 9, 10], pent: [57, 60, 62, 64, 67, 69, 72] };
  function blues(K, t, beat) {
    const spb = BL.spb, bar = Math.floor(beat / 4) % 12, bi = beat % 4, r0 = 45 + BL.prog[bar];
    const off = BL.walk[bi];
    note(K, t, mf(r0 + off), spb * 0.6, 'triangle', 0.26, 0.006, 0.1);
    note(K, t + spb * 2 / 3, mf(r0 + off), spb * 0.3, 'triangle', 0.15, 0.006, 0.06);
    if (bi === 0) for (const iv of [12, 16, 19, 22]) { note(K, t, mf(r0 + iv), spb * 4, 'sine', 0.03, 0.15, 0.4); note(K, t, mf(r0 + iv + 12), spb * 4, 'triangle', 0.008, 0.2, 0.4, 1500); }
    if (bi === 0 || bi === 2) kick(K, t, 0.3);
    if (bi === 1 || bi === 3) hit(K, t, 0.2, 'bandpass', 1800, 0.7, 0.12);
    hit(K, t, 0.07, 'highpass', 7800, 0.5, 0.035); hit(K, t + spb * 2 / 3, 0.06, 'highpass', 7800, 0.5, 0.025);
    if (bar % 4 === 0 && bi >= 1) {
      const r = rng(bar * 17 + bi * 3 + 11);
      for (const sub of [0, 2 / 3]) {
        if (r() < 0.25) continue;
        const m = BL.pent[Math.floor(r() * BL.pent.length)];
        note(K, t + sub * spb, mf(m), spb * 0.55, 'sawtooth', 0.05, 0.005, 0.15, 2000, r() < 0.35 ? Math.pow(2, 2 / 12) : 0);
      }
    }
  }
  // 5. classical / lounge strings, 66 bpm: string pad (detuned saws), cello, harp arpeggios, violin line
  const STR = { spb: 60 / 66, ch: [[48, [60, 64, 67, 71]], [45, [57, 60, 64, 67]], [50, [60, 62, 65, 69]], [43, [59, 62, 65, 67]], [41, [57, 60, 64, 65]], [40, [59, 62, 64, 67]], [50, [60, 62, 65, 69]], [43, [59, 62, 65, 67]]] };
  function strings(K, t, beat) {
    const spb = STR.spb, bar = Math.floor(beat / 4) % 8, bi = beat % 4, [root, tones] = STR.ch[bar];
    if (bi === 0) {
      for (const n of tones) { note(K, t, mf(n), spb * 4.3, 'sawtooth', 0.014, 0.7, 0.9, 1500); note(K, t, mf(n) * 1.0035, spb * 4.3, 'sawtooth', 0.01, 0.8, 0.9, 1500); }
      note(K, t, mf(root), spb * 4.2, 'sawtooth', 0.045, 0.4, 0.8, 700);
    }
    for (let k = 0; k < 2; k++) pluck(K, t + (k * spb) / 2, mf(tones[(bi * 2 + k) % 4] + 12), 1.2, 'sine', 0.055);
    if (bi === 0 || bi === 2) {
      const r = rng(bar * 7 + bi + 19), m = tones[Math.floor(r() * 4)] + 12;
      note(K, t, mf(m), spb * 1.95, 'sawtooth', 0.026, 0.28, 0.4, 2600); note(K, t, mf(m) * 0.997, spb * 1.95, 'sawtooth', 0.018, 0.32, 0.4, 2600);
    }
  }
  // 6. American police scanner: key-up clicks, garbled formant "voices" (no words), squelch tails, dispatch alert
  //    tones, static bursts and quiet gaps. Event-driven on a 0.25 s tick.
  const VOW = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240], [660, 1720, 2410]];
  function vox(K) {
    if (K.vox) return K.vox;
    const ac = K.ac, mix = ac.createGain(); mix.gain.value = 1;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2700;
    mix.connect(hp); hp.connect(lp); lp.connect(K.d);
    const inp = ac.createGain(); inp.gain.value = 1;
    const F = [1, 0.55, 0.28].map((lvl, i) => {
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = VOW[0][i]; f.Q.value = 7 + i * 2;
      const g = ac.createGain(); g.gain.value = lvl * 2.2; inp.connect(f); f.connect(g); g.connect(mix); return f;
    });
    K.vox = { inp, F, lp };
    return K.vox;
  }
  function transmission(K, t, dur, voice) {
    const ac = K.ac, V = vox(K), r = Math.random;
    hit(K, t, 0.03, 'highpass', 2500, 0.7, 0.1); // key-up click
    hit(K, t, dur, 'bandpass', 1800, 0.5, 0.018); // carrier hiss under the voice
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(voice.f0, t);
    g.gain.setValueAtTime(0.0001, t);
    o.connect(g); g.connect(V.inp);
    let tt = t + 0.08; const end = t + dur;
    while (tt < end - 0.06) {
      const syl = 0.07 + r() * 0.13, v = VOW[Math.floor(r() * VOW.length)], amp = 0.16 * (0.55 + 0.45 * r());
      for (let i = 0; i < 3; i++) V.F[i].frequency.setValueAtTime(v[i] * voice.fs * (0.94 + r() * 0.12), tt);
      o.frequency.setValueAtTime(voice.f0 * (0.9 + r() * 0.28), tt);
      o.frequency.linearRampToValueAtTime(voice.f0 * (0.82 + r() * 0.22), tt + syl);
      g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(amp, tt + 0.018);
      g.gain.setValueAtTime(amp * 0.8, tt + syl * 0.7); g.gain.linearRampToValueAtTime(0.0001, tt + syl);
      if (r() < 0.45) hit(K, Math.max(t, tt - 0.012), 0.035, 'highpass', 3200, 0.6, 0.045); // consonant
      tt += syl + (r() < 0.2 ? 0.12 + r() * 0.16 : 0.02 + r() * 0.05);
    }
    o.start(t); o.stop(end + 0.1); st.notes++;
    hit(K, end, 0.13 + r() * 0.08, 'bandpass', 2100, 0.35, 0.15, true); // squelch tail ("kssht", abrupt cut)
  }
  function alertTone(K, t) {
    const kind = Math.floor(Math.random() * 3);
    if (kind === 0) { for (let i = 0; i < 6; i++) note(K, t + i * 0.2, i % 2 ? 960 : 853, 0.19, 'sine', 0.07, 0.005, 0.01); return 1.25; } // hi-lo
    if (kind === 1) { for (let i = 0; i < 3; i++) note(K, t + i * 0.22, 1050, 0.13, 'square', 0.03, 0.003, 0.02, 2400); return 0.75; } // three beeps
    note(K, t, 1000, 0.95, 'sine', 0.06, 0.01, 0.05); return 1.0; // long attention tone
  }
  function scanner(K, t, beat, S) {
    if (beat < S.next) return;
    const spb = 0.25, r = Math.random, x = r();
    const dispatcher = { f0: 195 + r() * 30, fs: 1.15 }, officer = { f0: 105 + r() * 30, fs: 1.0 };
    let span;
    if (x < 0.14) { // static burst / crackle
      const d = 0.3 + r() * 0.6;
      for (let k = 0; k < 4; k++) hit(K, t + k * d / 4, d / 4 + 0.03, 'bandpass', 1300 + r() * 1400, 0.5, 0.05 + r() * 0.08);
      span = d + 0.6 + r() * 1.6;
    } else if (x < 0.3) { // dispatch alert + dispatcher
      const a = alertTone(K, t), d = 1.6 + r() * 2.2;
      transmission(K, t + a + 0.25, d, dispatcher);
      span = a + 0.25 + d + 0.5 + r() * 2.0;
    } else {
      const d = 1.1 + r() * 2.6, who = r() < 0.45 ? dispatcher : officer;
      transmission(K, t, d, who);
      span = d + (r() < 0.35 ? 0.35 + r() * 0.4 : 0.9 + r() * 2.8); // sometimes an immediate reply
    }
    st.events++;
    S.next = beat + Math.max(1, Math.ceil(span / spb));
  }
  const PROG = [swing, doowop, country, blues, strings, scanner];
  const SPB = [SW.spb, DW.spb, CO.spb, BL.spb, STR.spb, 0.25];

  /* ------------------------------------------------------------------ pump: dial tween, mix, scheduling */
  function clockNow() {
    const ac = A.ac;
    if (ac && (ac.state === undefined || ac.state === 'running')) return ['a', ac.currentTime];
    return ['p', perfNow()];
  }
  function stepTune() {
    const T = st.tune; if (!T) return;
    const [dom, v] = clockNow();
    if (T.dom !== dom) { T.dom = dom; T.last = v; }
    T.k = Math.min(1, T.k + Math.max(0, v - T.last) / T.dur); T.last = v;
    const k = T.k, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    st.f = T.a + (T.b - T.a) * e;
    if (k >= 1) { st.f = T.b; st.tune = null; emit(); }
  }
  const tuned = (f) => STATIONS.map((s) => clamp(1 - Math.abs(f - s.f) / TUNE_W, 0, 1));
  function pump() {
    stepTune();
    if (L.on) applyLiveVol();
    if (!st.on && !A.out) return;
    const ac = A.out ? A.ac : build();
    if (!ac || !A.out) return;
    const now = ac.currentTime;
    const tu = tuned(st.f);
    let best = -1, bv = 0.02;
    for (let i = 0; i < tu.length; i++) if (tu[i] > bv) { bv = tu[i]; best = i; }
    const total = Math.max(...tu);
    try {
      A.stat.gain.setTargetAtTime(st.on ? 0.02 + (1 - total) * 0.42 : 0.0001, now, 0.04);
      for (let i = 0; i < A.sg.length; i++) A.sg[i].gain.setTargetAtTime(st.on ? Math.pow(tu[i], 1.5) * 0.9 : 0, now, 0.05);
    } catch (_) { /* param */ }
    if (!st.on) best = -1;
    if (best !== st.cur) {
      st.cur = best;
      if (best >= 0) { A.clocks[best].t = now + 0.06; A.clocks[best].beat = 0; A.S[best].next = 0; }
      emit();
    }
    if (best >= 0) {
      const ck = A.clocks[best], K = kit(best);
      if (ck.t < now) ck.t = now + 0.02;
      let guard = 0;
      while (ck.t < now + LOOK && guard++ < 16) {
        try { PROG[best](K, ck.t, ck.beat, A.S[best]); } catch (e) { if (!pump._warned) { pump._warned = true; try { console.warn('[radio] programme', e); } catch (_) {} } }
        ck.t += SPB[best]; ck.beat++;
      }
    }
    // mix: comfortable background level everywhere + louder, panned mix near the 3D radio
    let att = 0, pan = 0;
    try {
      const s = srcFn && srcFn(), l = lisFn && lisFn();
      if (s && l) {
        const dx = s.x - l.x, dy = (s.y || 0) - (l.y || 0), dz = s.z - l.z, d = Math.hypot(dx, dy, dz);
        att = 1 / (1 + (d * d) / (2.4 * 2.4));
        if (d > 0.05 && isFinite(l.yaw)) { const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw); pan = clamp((dx * rx + dz * rz) / Math.max(0.3, Math.hypot(dx, dz)), -1, 1) * 0.75; }
      }
    } catch (_) { att = 0; }
    const v = st.on ? st.vol : 0;
    st.base = v * BASE; st.near = v * NEAR * att;
    try {
      A.base.gain.setTargetAtTime(Math.max(0.0001, st.base), now, 0.12);
      A.near.gain.setTargetAtTime(Math.max(0.0001, st.near), now, 0.12);
      if (A.pan) A.pan.pan.setTargetAtTime(pan, now, 0.1);
      A.out.gain.setTargetAtTime(st.on && !st.hidden ? 1 : 0.0001, now, st.on ? 0.25 : 0.06); // tube warm-up on power-on
    } catch (_) { /* param */ }
  }
  function startTimer() {
    if (A.iv || typeof setInterval !== 'function') return;
    A.iv = setInterval(pump, 100);
    if (A.iv && typeof A.iv.unref === 'function') A.iv.unref();
  }
  function stopTimer() { if (A.iv) { clearInterval(A.iv); A.iv = null; } }
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { st.hidden = !!document.hidden; pump(); });
    }
  } catch (_) { /* no DOM (tests) */ }

  /* ------------------------------------------------------------------ V5 live streams (<audio>) */
  const L = { avail: 'unknown', on: false, idx: -1, status: 'idle', el: null, token: 0, unlocked: false, skips: 0, probeP: null, cache: {}, lastMode: 'synth', autoLive: false, userPicked: false, failed: {} };
  const noticeSubs = new Set();
  const notice = (msg, kind) => { for (const f of noticeSubs) { try { f(msg, kind || 'info'); } catch (_) {} } };
  // 0.1 s silent WAV, played synchronously inside the first gesture so iOS lets this element play later (async)
  function silentWav() {
    const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), w = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) b[44 + i] = 128;
    let bin = ''; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function liveEl() {
    if (L.el || typeof document === 'undefined' || typeof Audio === 'undefined') return L.el;
    const el = new Audio(); // crossOrigin deliberately NOT set (no CORS needed; not routed into WebAudio)
    el.preload = 'none'; el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', '');
    el.addEventListener('error', () => { if (L.on && L.status === 'playing') { L.status = 'error'; notice('השידור נקטע — עובר לתחנה הבאה', 'error'); setTimeout(() => { if (L.on && L.status === 'error') skipLive(); }, 400); } });
    L.el = el;
    return el;
  }
  function unlockLive() {
    if (L.unlocked || L.avail !== 'yes') return;
    const el = liveEl(); if (!el) return;
    L.unlocked = true;
    try { el.src = silentWav(); const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }
  function stopEl() {
    const el = L.el; if (!el) return;
    try { el.pause(); el.removeAttribute('src'); el.load(); } catch (_) {}
  }
  const withTimeout = (ms) => { const c = typeof AbortController !== 'undefined' ? new AbortController() : null; const t = setTimeout(() => c && c.abort(), ms); return { signal: c ? c.signal : undefined, done: () => clearTimeout(t) }; };
  async function getJSON(url, ms) {
    const T = withTimeout(ms);
    try { const r = await fetch(url, { signal: T.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { T.done(); }
  }
  // can this page load external media / fetch? (blocked under the claude.ai artifact CSP)
  function probe() {
    if (L.probeP) return L.probeP;
    if (typeof fetch !== 'function') { L.avail = 'no'; emit(); return (L.probeP = Promise.resolve(false)); }
    L.probeP = (async () => {
      let ok = false;
      for (const m of RB_MIRRORS.slice(0, 2)) { try { await getJSON(m + '/json/stats', 3000); ok = true; break; } catch (_) { /* next mirror */ } }
      L.avail = ok ? 'yes' : 'no'; emit();
      if (ok) {
        // a synth station that was auto-started before the probe finished → switch to a random real one (keeps the synth until it plays)
        if (L.autoLive && !L.userPicked && !L.on) playLive(randomLive(), { auto: true });
        prefetch();
      }
      return ok;
    })();
    return L.probeP;
  }
  async function prefetch() { for (const S of LIVE_STATIONS) if (!(S.streams && S.streams.length)) { try { await rbLookup(S); } catch (_) {} } }
  async function rbLookup(S) {
    if (L.cache[S.id]) return L.cache[S.id];
    try { const c = JSON.parse(lsGet('rb_' + S.id) || 'null'); if (c && Date.now() - c.t < 3 * 864e5 && Array.isArray(c.urls) && c.urls.length) { L.cache[S.id] = c.urls; return c.urls; } } catch (_) {}
    const found = [];
    for (const q of S.rb || []) {
      const qs = new URLSearchParams(); if (q.name) qs.set('name', q.name); if (q.tag) qs.set('tag', q.tag);
      qs.set('countrycode', 'US'); qs.set('hidebroken', 'true'); qs.set('order', 'clickcount'); qs.set('reverse', 'true'); qs.set('limit', S.scanner ? '20' : '5');
      let list = null;
      for (const m of RB_MIRRORS) { try { list = await getJSON(m + '/json/stations/search?' + qs.toString(), 5000); break; } catch (_) { list = null; } }
      if (!Array.isArray(list)) continue;
      const callRe = !S.scanner && q.name ? new RegExp(q.name.replace(/[-\s]/g, '[-\\s]?'), 'i') : null;
      const score = (x) => { const loc = ((x.state || '') + ' ' + (x.name || '') + ' ' + (x.tags || '')).toLowerCase(); let sc = 0; (S.pref || []).forEach((p, i) => { if (loc.includes(p)) sc += 10 - i; }); if (/^https:/.test(x.url_resolved || '')) sc += 3; return sc; };
      list.filter((x) => x && x.url_resolved && (!callRe || callRe.test(x.name || ''))).sort((a, b) => score(b) - score(a))
        .forEach((x) => { if (!found.includes(x.url_resolved)) found.push(x.url_resolved); });
      if (found.length >= 3) break;
    }
    const urls = found.slice(0, 5);
    L.cache[S.id] = urls;
    if (urls.length) lsSet('rb_' + S.id, JSON.stringify({ t: Date.now(), urls }));
    return urls;
  }
  function attempt(url, tok) {
    return new Promise((res) => {
      const el = liveEl(); if (!el || tok !== L.token) return res(false);
      let done = false, to = 0;
      const fin = (ok) => { if (done) return; done = true; clearTimeout(to); el.removeEventListener('playing', onP); el.removeEventListener('error', onE); res(ok); };
      const onP = () => { if (el.src === url || el.currentSrc === url) fin(true); };
      const onE = () => fin(false);
      el.addEventListener('playing', onP); el.addEventListener('error', onE);
      to = setTimeout(() => fin(false), 6000);
      try { el.src = url; applyLiveVol(); const p = el.play(); if (p && p.catch) p.catch(() => fin(false)); } catch (_) { fin(false); }
    });
  }
  const randomLive = () => { const pool = LIVE_STATIONS.map((_, i) => i).filter((i) => !LIVE_STATIONS[i].scanner && !L.failed[LIVE_STATIONS[i].id]); return pool.length ? pool[Math.floor(Math.random() * pool.length)] : 0; };
  // play real station i. o.auto: keep the synth playing until the stream actually plays (auto switch / autostart)
  async function playLive(i, o = {}) {
    const n = LIVE_STATIONS.length; i = ((Math.round(i) % n) + n) % n;
    const S = LIVE_STATIONS[i];
    if (L.avail === 'no') { notice('שידור חי לא זמין בגרסה הזו — נפתח בלשונית חדשה', 'error'); return false; }
    if (!o.auto && !o.skip) { L.userPicked = true; L.skips = 0; }
    unlockLive();
    const tok = ++L.token;
    L.on = true; L.idx = i; L.status = 'connecting'; L.lastMode = 'live';
    if (!o.auto) { st.on = false; pump(); }
    sweep(liveDial(i));
    startTimer(); emit();
    let ok = false;
    const tried = new Set();
    const tryList = async (urls) => { for (const u of urls) { if (tok !== L.token) return false; if (tried.has(u)) continue; tried.add(u); if (await attempt(u, tok)) return true; } return false; };
    ok = await tryList(S.streams || []);
    if (!ok && tok === L.token && S.rb) { let urls = []; try { urls = await rbLookup(S); } catch (_) { urls = []; } ok = await tryList(urls); }
    if (tok !== L.token) return false; // superseded
    if (ok) {
      L.status = 'playing'; L.skips = 0; delete L.failed[S.id];
      if (st.on) { st.on = false; pump(); }
      emit(); return true;
    }
    L.failed[S.id] = true;
    stopEl();
    if (o.auto) { L.on = false; L.status = 'idle'; L.lastMode = 'synth'; emit(); return false; }
    if (S.scanner) { notice('לא נמצא סורק משטרה חי — מנגן את הסורק המדומה', 'error'); L.on = false; L.status = 'idle'; L.lastMode = 'synth'; tune(5); return false; }
    L.status = 'error'; emit();
    notice('התחנה ' + S.call + ' לא זמינה כרגע — עובר לתחנה הבאה', 'error');
    skipLive();
    return false;
  }
  function skipLive() {
    L.skips++;
    if (L.skips >= LIVE_STATIONS.length) { // nothing plays (geo-block / offline): back to the in-house radio
      L.skips = 0; L.on = false; L.status = 'idle'; L.lastMode = 'synth'; stopEl();
      notice('שידור חי לא זמין כרגע — הרדיו בבית מנגן', 'error');
      tune(Math.floor(Math.random() * STATIONS.length));
      return;
    }
    let j = L.idx;
    for (let k = 0; k < LIVE_STATIONS.length; k++) { j = (j + 1) % LIVE_STATIONS.length; if (!LIVE_STATIONS[j].scanner && !L.failed[LIVE_STATIONS[j].id]) break; }
    playLive(j, { skip: true });
  }
  function stopLive(quiet) {
    if (!L.on && L.status === 'idle') return;
    L.token++; L.on = false; L.status = 'idle'; stopEl(); if (!quiet) emit();
  }
  function applyLiveVol() {
    const el = L.el; if (!el) return;
    let att = 0;
    try { const s = srcFn && srcFn(), l = lisFn && lisFn(); if (s && l) { const d = Math.hypot(s.x - l.x, (s.y || 0) - (l.y || 0), s.z - l.z); att = 1 / (1 + (d * d) / (2.4 * 2.4)); } } catch (_) { att = 0; }
    try { el.volume = clamp(st.vol * (0.6 + 0.4 * att), 0, 1); } catch (_) { /* iOS: read-only */ }
    let muted = false; try { muted = !!(api._audio && api._audio.muted); } catch (_) {}
    el.muted = muted;
  }
  // needle-only sweep (no synth audio)
  function sweep(b) { const [dom, v] = clockNow(); const a = st.f; st.tune = Math.abs(b - a) < 0.5 ? null : { a, b, k: 0, dur: clamp(Math.abs(b - a) / 650, 0.45, 1.3), dom, last: v }; if (!st.tune) st.f = b; }

  /* ------------------------------------------------------------------ public API */
  function tune(idx, o = {}) {
    idx = ((Math.round(idx) % STATIONS.length) + STATIONS.length) % STATIONS.length;
    st.idx = idx;
    const b = STATIONS[idx].f, a = o.from != null ? clamp(o.from, FMIN, FMAX) : st.f;
    if (o.instant || Math.abs(b - a) < 0.5) { st.tune = null; st.f = b; }
    else { const [dom, v] = clockNow(); st.tune = { a, b, k: 0, dur: clamp(Math.abs(b - a) / 650, 0.45, 1.3), dom, last: v }; st.f = a; }
    if (!st.on) { st.on = true; startTimer(); }
    pump(); emit();
    return api;
  }
  const api = {
    _audio: audio || null,
    stations: STATIONS,
    get state() { return { on: st.on || L.on, synthOn: st.on, idx: st.idx, f: st.f, vol: st.vol, cur: st.cur, tuning: !!st.tune, station: STATIONS[st.idx], playing: (st.on && st.cur >= 0) || (L.on && L.status === 'playing'), live: api.live }; },
    get on() { return st.on || L.on; }, get idx() { return st.idx; }, get f() { return st.f; }, get cur() { return st.cur; },
    get volume() { return st.vol; }, get tuning() { return !!st.tune; }, get autoDone() { return st.autoDone; },
    play(idx) { if (idx != null) return api.tune(idx); stopLive(true); L.lastMode = 'synth'; if (!st.on) { st.on = true; startTimer(); if (!st.tune && Math.abs(st.f - STATIONS[st.idx].f) > 0.5) tune(st.idx); pump(); emit(); } return api; },
    stop() { if (!st.on && !L.on) return api; const wasLive = L.on; st.on = false; stopLive(true); pump(); stopTimer(); if (wasLive) L.lastMode = 'live'; emit(); return api; },
    toggle() { if (st.on || L.on) return api.stop(); if (L.lastMode === 'live' && L.idx >= 0 && L.avail === 'yes') { playLive(L.idx); return api; } return api.play(); },
    tune(i, o) { stopLive(true); L.lastMode = 'synth'; return tune(i, o); },
    next() { if (L.on) { playLive(L.idx + 1); return api; } return api.tune((st.on ? st.idx : st.idx - 1) + 1); },
    prev() { if (L.on) { playLive(L.idx - 1); return api; } return api.tune(st.idx - 1); },
    // V5 live
    probe, playLive(i) { playLive(i); return api; }, stopLive() { stopLive(); return api; },
    onNotice(fn) { if (typeof fn === 'function') noticeSubs.add(fn); return () => noticeSubs.delete(fn); },
    get live() { const S = LIVE_STATIONS[L.idx]; return { avail: L.avail, on: L.on, idx: L.idx, status: L.status, station: S || null, src: L.el ? L.el.src : '', muted: L.el ? !!L.el.muted : null, volume: L.el ? L.el.volume : null, cache: Object.assign({}, L.cache) }; },
    nowName() { if (L.on && LIVE_STATIONS[L.idx]) { const S = LIVE_STATIONS[L.idx]; return S.call + ' ' + S.freq + ' — ' + S.he; } const s = STATIONS[st.cur >= 0 ? st.cur : st.idx]; return s ? s.call + ' ' + s.f + ' — ' + s.he : ''; },
    liveDial,
    setVolume(v) { st.vol = clamp(+v || 0, 0, 1); lsSet('radioVol', String(st.vol.toFixed(2))); applyLiveVol(); pump(); emit(); return api; },
    // random station, "tuned in" with a short sweep of static
    playRandom() {
      const i = Math.floor(Math.random() * STATIONS.length), b = STATIONS[i].f;
      const from = clamp(b + (Math.random() < 0.5 ? -1 : 1) * (45 + Math.random() * 50), FMIN, FMAX);
      stopLive(true); L.lastMode = 'synth';
      return tune(i, { from });
    },
    // called once on the first user gesture (browsers block audio before one)
    // V5: a random REAL station when live playback works, else (artifact CSP / offline / probe pending) a synth one;
    // if the probe succeeds later, probe() switches to a real station (the synth keeps playing until it does)
    autostart() {
      if (st.autoDone) return false; st.autoDone = true;
      if (L.avail === 'yes') { api.playRandom(); unlockLive(); playLive(randomLive(), { auto: true }); return true; }
      if (L.avail === 'unknown') L.autoLive = true;
      api.playRandom(); return true;
    },
    onChange(fn) { if (typeof fn === 'function') { subs.add(fn); try { fn(api.state); } catch (_) {} } return () => subs.delete(fn); },
    // V4: ask the UI to open the radio panel (e.g. from the 3D radio) at a section ('live' | 'home')
    openPanel(section) { for (const f of panelSubs) { try { f(section || 'home'); } catch (_) {} } return panelSubs.size > 0; },
    onPanelRequest(fn) { if (typeof fn === 'function') panelSubs.add(fn); return () => panelSubs.delete(fn); },
    liveStations: LIVE_STATIONS,
    setSource(fn) { srcFn = typeof fn === 'function' ? fn : null; },
    setListener(fn) { lisFn = typeof fn === 'function' ? fn : null; },
    pump,
    debug() { return { ctx: A.ac ? (A.ac.state || 'fake') : 'none', built: !!A.out, notes: st.notes, events: st.events, cur: st.cur, f: +st.f.toFixed(1), on: st.on, base: +st.base.toFixed(3), near: +st.near.toFixed(3), timer: !!A.iv }; },
  };
  SINGLETON = api;
  if (opts.autoTimer) startTimer();
  return api;
}
