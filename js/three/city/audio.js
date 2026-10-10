// City Drive — all sound is synthesised with Web Audio (no samples): engine note by revs, tyre squeal, wind, horn,
// indicator relay, wipers, crashes, sirens, other drivers' horns, people shouting, and "VRC FM", a generated music
// programme for the radio (no recorded or copyrighted tracks). Nothing sounds before a user gesture.
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export function createAudio(getCtx, opts = {}) {
  let ac = null, master = null, sfx = null, noiseBuf = null, enabled = true, lx = 0, lz = 0;
  let E = null, SQ = null, WN = null, HN = null, SI = null, R = null;
  function ctx() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; }
    try { ac = getCtx ? getCtx() : null; if (!ac) { const ua = navigator.userActivation; if (ua && !ua.hasBeenActive) return null; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = new AC(); } } catch { ac = null; }
    if (!ac) return null;
    master = ac.createGain(); master.gain.value = enabled ? 0.9 : 0; master.connect(opts.out || ac.destination);   // opts.out: the apartment radio routes its synth elsewhere
    sfx = ac.createGain(); sfx.gain.value = 1; sfx.connect(master);
    const len = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, len, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }
  const noise = () => { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; };
  const env = (g, t, a, peak, d) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const att = (x, z, ref = 16) => { const d = Math.hypot(x - lx, z - lz); return 1 / (1 + (d / ref) * (d / ref)); };
  // ---- engine
  function engine(on, kind = 'sedan', ev = false) {
    if (!on) { if (E) { const t = ac.currentTime; E.out.gain.setTargetAtTime(0, t, 0.1); for (const n of E.src) try { n.stop(t + 0.6); } catch { /* */ } E = null; } return; }
    if (E || !ctx()) return; const t = ac.currentTime;
    const out = ac.createGain(); out.gain.value = 0; out.connect(sfx);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 1.2; lp.connect(out);
    const sh = ac.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2.2); } sh.curve = c; sh.connect(lp);
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(), o3 = ac.createOscillator(), g1 = ac.createGain(), g2 = ac.createGain(), g3 = ac.createGain();
    o1.type = ev ? 'sine' : 'sawtooth'; o2.type = ev ? 'triangle' : 'square'; o3.type = 'sine'; g1.gain.value = ev ? 0.3 : 0.5; g2.gain.value = ev ? 0.1 : 0.3; g3.gain.value = ev ? 0.05 : 0.45;
    o1.connect(g1).connect(sh); o2.connect(g2).connect(sh); o3.connect(g3).connect(lp);
    for (const o of [o1, o2, o3]) o.start(t);
    if (!ev) { o1.frequency.setValueAtTime(14, t); o1.frequency.exponentialRampToValueAtTime(30, t + 0.5); }   // starter catching
    E = { out, lp, o1, o2, o3, ev, src: [o1, o2, o3], k: kind === 'super' || kind === 'coupe' ? 1.18 : kind === 'gt' ? 1.08 : kind === 'suv' ? 0.86 : 1 };
  }
  function drive(s) {   // {rpm, gas, kmh, slip, onFoot}
    if (!ac) return; const t = ac.currentTime;
    if (E) {
      if (E.ev) { const f = 150 + s.kmh * 5.5 + s.gas * 60; E.o1.frequency.setTargetAtTime(f, t, 0.05); E.o2.frequency.setTargetAtTime(f * 2.02, t, 0.05); E.o3.frequency.setTargetAtTime(f * 0.5, t, 0.05); E.lp.frequency.setTargetAtTime(2600, t, 0.1); E.out.gain.setTargetAtTime(0.02 + Math.min(0.05, s.kmh * 0.0004) + s.gas * 0.03, t, 0.08); }
      else { const f = Math.max(22, s.rpm / 60 * 2 * E.k); E.o1.frequency.setTargetAtTime(f, t, 0.035); E.o2.frequency.setTargetAtTime(f * 0.5, t, 0.035); E.o3.frequency.setTargetAtTime(f * 0.25, t, 0.035); E.lp.frequency.setTargetAtTime(240 + s.rpm * 0.32 + s.gas * 900, t, 0.06); E.out.gain.setTargetAtTime(0.055 + s.gas * 0.075 + Math.min(0.03, s.rpm / 200000), t, 0.07); }
    }
    // tyres and wind
    if (!SQ && ctx()) { const n = noise(), bp = ac.createBiquadFilter(), g = ac.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1750; bp.Q.value = 7; g.gain.value = 0; n.connect(bp).connect(g).connect(sfx); n.start(); SQ = { n, bp, g };
      const n2 = noise(), lp = ac.createBiquadFilter(), g2 = ac.createGain(); lp.type = 'lowpass'; lp.frequency.value = 400; g2.gain.value = 0; n2.connect(lp).connect(g2).connect(sfx); n2.start(); WN = { n: n2, lp, g: g2 }; }
    if (SQ) { const k = s.onFoot ? 0 : Math.max(0, Math.min(1, (s.slip - 1.4) / 5)); SQ.g.gain.setTargetAtTime(k * 0.16, t, 0.05); SQ.bp.frequency.setTargetAtTime(1500 + s.slip * 60, t, 0.1);
      const w = s.onFoot ? 0 : Math.min(1, s.kmh / 260); WN.g.gain.setTargetAtTime(w * w * 0.3 + Math.min(0.03, s.kmh * 0.0006), t, 0.2); WN.lp.frequency.setTargetAtTime(300 + s.kmh * 9, t, 0.2); }
  }
  // ---- horn (held), other drivers' horns
  function horn(on) {
    if (!on) { if (HN) { HN.g.gain.setTargetAtTime(0, ac.currentTime, 0.02); const h = HN; HN = null; setTimeout(() => { for (const o of h.o) try { o.stop(); } catch { /* */ } }, 200); } return; }
    if (HN || !ctx()) return; const t = ac.currentTime, g = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; g.gain.value = 0; lp.connect(g).connect(sfx);
    const o = [415, 520].map(f => { const q = ac.createOscillator(); q.type = 'square'; q.frequency.value = f; q.connect(lp); q.start(t); return q; }); g.gain.setTargetAtTime(0.16, t, 0.012); HN = { g, o };
  }
  function honkAt(x, z, dur = 0.4) {
    if (!ctx()) return; const v = att(x, z, 22) * 0.13; if (v < 0.004) return; const t = ac.currentTime, g = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(g).connect(sfx);
    const base = 370 + Math.random() * 110; for (const f of [base, base * 1.26]) { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.setValueAtTime(v, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  }
  // ---- voices: a short formant shout ("hey!"), a longer cry, a grunt
  function voiceAt(x, z, kind = 'hey', pitch = 1) {
    if (!ctx()) return; const v = att(x, z, 14) * 0.2; if (v < 0.004) return; const t = ac.currentTime, dur = kind === 'cry' ? 0.6 : kind === 'grunt' ? 0.16 : 0.3;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; const f0 = (kind === 'cry' ? 330 : 240) * pitch * (0.9 + Math.random() * 0.25);
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (kind === 'cry' ? 1.5 : 1.25), t + dur * 0.3); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
    const mix = ac.createGain(); for (const [f, q, k] of kind === 'grunt' ? [[500, 5, 1], [1000, 6, 0.4]] : [[850, 6, 1], [1350, 8, 0.7], [2700, 9, 0.25]]) { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const gg = ac.createGain(); gg.gain.value = k; o.connect(b).connect(gg).connect(mix); }
    mix.connect(g).connect(sfx); env(g, t, 0.03, v * 2.2, dur); o.start(t); o.stop(t + dur + 0.1);
  }
  // ---- impacts: level 0..1 (bump → heavy crash); glass on the hard ones
  function crash(level = 0.5, x = lx, z = lz) {
    if (!ctx()) return; const k = Math.max(0.05, Math.min(1, level)) * att(x, z, 30), t = ac.currentTime; if (k < 0.01) return;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(120 + 60 * level, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.22); env(g, t, 0.005, 0.5 * k, 0.28); o.connect(g).connect(sfx); o.start(t); o.stop(t + 0.4);
    const n = noise(), bp = ac.createBiquadFilter(), g2 = ac.createGain(); bp.type = 'bandpass'; bp.frequency.value = 900 + level * 1400; bp.Q.value = 0.7; env(g2, t, 0.004, 0.42 * k, 0.12 + level * 0.35); n.connect(bp).connect(g2).connect(sfx); n.start(t); n.stop(t + 0.8);
    if (level > 0.45) { const n3 = noise(), hp = ac.createBiquadFilter(), g3 = ac.createGain(); hp.type = 'highpass'; hp.frequency.value = 5200; g3.gain.setValueAtTime(0.0001, t + 0.03); g3.gain.exponentialRampToValueAtTime(0.2 * k, t + 0.06); g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); n3.connect(hp).connect(g3).connect(sfx); n3.start(t); n3.stop(t + 0.9);
      for (let i = 0; i < 5; i++) { const q = ac.createOscillator(), gq = ac.createGain(); q.type = 'triangle'; q.frequency.value = 2400 + Math.random() * 4200; env(gq, t + 0.08 + i * 0.07 * Math.random(), 0.002, 0.05 * k, 0.12); q.connect(gq).connect(sfx); q.start(t); q.stop(t + 1); } }
    if (navigator.vibrate) try { navigator.vibrate(level > 0.5 ? [60, 30, 80] : 30); } catch { /* */ }
  }
  function blip(f, dur = 0.03, v = 0.1, type = 'square') { if (!ctx()) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; env(g, t, 0.002, v, dur); o.connect(g).connect(sfx); o.start(t); o.stop(t + dur + 0.05); }
  function swish(dur = 0.5, v = 0.05) { if (!ctx()) return; const t = ac.currentTime, n = noise(), bp = ac.createBiquadFilter(), g = ac.createGain(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1500, t + dur); env(g, t, dur * 0.3, v, dur * 0.7); n.connect(bp).connect(g).connect(sfx); n.start(t); n.stop(t + dur + 0.1); }
  // ---- sirens: level 0..1 by distance; police = wail, ambulance = two-tone
  function siren(level, kind = 'police') {
    if (level <= 0.001) { if (SI) { SI.g.gain.setTargetAtTime(0, ac.currentTime, 0.2); } return; }
    if (!ctx()) return; const t = ac.currentTime;
    if (!SI) { const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain(), lp = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = 950; l.type = 'sine'; l.frequency.value = 0.38; lg.gain.value = 380; lp.type = 'lowpass'; lp.frequency.value = 2600; g.gain.value = 0; l.connect(lg).connect(o.frequency); o.connect(lp).connect(g).connect(sfx); o.start(t); l.start(t); SI = { o, l, lg, g, kind: '' }; }
    if (SI.kind !== kind) { SI.kind = kind; SI.l.type = kind === 'amb' ? 'square' : 'sine'; SI.l.frequency.value = kind === 'amb' ? 1.05 : 0.38; SI.lg.gain.value = kind === 'amb' ? 120 : 380; SI.o.frequency.value = kind === 'amb' ? 820 : 950; }
    SI.g.gain.setTargetAtTime(Math.min(1, level) * 0.075, t, 0.15);
  }
  // ---- VRC FM: generated music (pads, bass, plucks, lead, drums) — four programmes that follow one another
  const PROGS = [
    { bpm: 126, root: 50, scale: [0, 1, 4, 5, 7, 8, 10], chords: [[0, 4, 7], [5, 8, 12], [0, 4, 7], [10, 14, 17], [1, 5, 8], [0, 4, 7]], lead: 'reed', swing: 0.0, name: 'hora' },
    { bpm: 96, root: 45, scale: [0, 2, 3, 5, 7, 8, 11], chords: [[0, 3, 7], [5, 8, 12], [8, 12, 15], [7, 11, 14]], lead: 'soft', swing: 0.08, name: 'seară' },
    { bpm: 112, root: 48, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], lead: 'pluck', swing: 0.05, name: 'drum' },
    { bpm: 138, root: 52, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], lead: 'reed', swing: 0, name: 'sârbă' },
  ];
  function tone(t, f, dur, type, v, cut = 3000, det = 0, atk = 0.01) {
    const g = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; lp.connect(g).connect(R.g);
    for (const d of det ? [-det, det] : [0]) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + 0.25); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + atk); g.gain.setValueAtTime(v, t + Math.max(atk, dur * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
  }
  function drum(t, kind) {
    if (kind === 'k') { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g).connect(R.g); o.start(t); o.stop(t + 0.25); return; }
    const n = noise(), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = kind === 'h' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'h' ? 7500 : 1900; const v = kind === 'h' ? 0.06 : 0.2, d = kind === 'h' ? 0.035 : 0.13;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); n.connect(f).connect(g).connect(R.g); n.start(t); n.stop(t + d + 0.05);
  }
  function rnd() { R.seed = (R.seed * 16807) % 2147483647; return R.seed / 2147483647; }
  function step(i, t) {
    const pi = Math.floor(i / 512) % PROGS.length, P = PROGS[pi], b = i % 16, bar = Math.floor(i / 16), ch = P.chords[Math.floor(bar / 2) % P.chords.length], sixteenth = 60 / P.bpm / 4;
    if (i % 512 === 0) { R.deg = 4; for (const [k, m] of [[0, 79], [1, 83], [2, 86]]) tone(t + k * 0.16, mtof(m), 0.5, 'sine', 0.12, 6000); }   // station chime between programmes
    const intro = i % 512 < 32;
    if (!intro) { if (b === 0 || b === 8 || (b === 10 && bar % 4 === 3)) drum(t, 'k'); if (b === 4 || b === 12) drum(t, 's'); if (b % 2 === 0) drum(t + (b % 4 === 2 ? P.swing * sixteenth : 0), 'h'); }
    if (b === 0) for (const n of ch) tone(t, mtof(P.root + n + 12), sixteenth * 15, 'sawtooth', 0.03, 900, 7, 0.08);
    if (b === 0 || b === 6 || b === 8 || b === 14) tone(t, mtof(P.root + ch[0] - 12), sixteenth * 2.2, 'triangle', 0.22, 500);
    if (b % 2 === 1 || P.lead === 'pluck') tone(t, mtof(P.root + ch[(b >> 1) % 3] + 24), 0.12, 'triangle', 0.045, 5000, 0, 0.004);
    // lead: a seeded walk over the scale in short phrases, resting every other two bars
    if (!intro && bar % 4 < 3 && (b % 2 === 0) && rnd() < (b % 4 === 0 ? 0.85 : 0.5)) {
      R.deg = Math.max(0, Math.min(13, R.deg + Math.round((rnd() - 0.5) * 4))); const sc = P.scale, oct = Math.floor(R.deg / sc.length), m = P.root + 24 + sc[R.deg % sc.length] + 12 * oct, len = sixteenth * (rnd() < 0.3 ? 4 : 2);
      if (P.lead === 'reed') tone(t, mtof(m), len, 'sawtooth', 0.055, 2600, 9, 0.02); else if (P.lead === 'soft') tone(t, mtof(m), len * 1.5, 'triangle', 0.09, 2200, 4, 0.05); else tone(t, mtof(m), len, 'square', 0.035, 1800, 0, 0.005);
    }
  }
  // ---- the radio-style programme (kind 'news'): what a car plays when no live station can be heard. No melody and no loop:
  // time pips, a short station sting, then speech-like phrases (a formant voice on a buzzing source, syllable by syllable)
  // with pauses between them. Nothing recorded; it only sounds like a bulletin.
  const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [660, 1720], [440, 1020], [600, 1400]];   // F1, F2 of vowels (Hz)
  function burst(t, d) {   // a consonant: a short hiss
    const s = noise(), f = ac.createBiquadFilter(), e = ac.createGain();
    f.type = 'highpass'; f.frequency.value = 2600; env(e, t, 0.003, 0.08, d); s.connect(f).connect(e).connect(R.g); s.start(t); s.stop(t + d + 0.05);
  }
  function voice(t, dur, f0, F, v) {   // one syllable: a buzzing source, pitch falling a little, through two formant band-passes
    const o = ac.createOscillator(), e = ac.createGain(), m = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.88, t + dur);
    for (const [f, q, k] of [[F[0], 7, 1], [F[1], 10, 0.45]]) { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const gg = ac.createGain(); gg.gain.value = k; o.connect(b).connect(gg).connect(m); }
    m.connect(e).connect(R.g); env(e, t, 0.025, v, dur - 0.025); o.start(t); o.stop(t + dur + 0.05);
  }
  function syllables(t, n) {   // a phrase: syllables with a speaking pitch that drifts from phrase to phrase
    const base = 105 + rnd() * 55; let tt = t;
    for (let i = 0; i < n; i++) {
      const dur = 0.12 + rnd() * 0.1, F = VOWELS[Math.floor(rnd() * VOWELS.length)];
      if (rnd() < 0.6) burst(tt - 0.02, 0.03);
      voice(tt, dur, base * (0.94 + rnd() * 0.12), F, 0.35);
      tt += dur + 0.015 + rnd() * 0.03;
    }
    return tt;
  }
  function sting(t) { tone(t, 659, 0.22, 'triangle', 0.2, 3000, 0, 0.01); tone(t + 0.22, 880, 0.5, 'triangle', 0.2, 3000, 0, 0.01); }
  function bulletin(t) {   // one item, scheduled whole: pips, the sting, three to five phrases, a pause at the end
    for (let k = 0; k < 4; k++) tone(t + k * 0.26, 1000, 0.09, 'sine', 0.18, 4000);
    tone(t + 1.04, 1000, 0.5, 'sine', 0.2, 4000);
    let tt = t + 1.7; sting(tt); tt += 0.9;
    const n = 3 + Math.floor(rnd() * 3);
    for (let p = 0; p < n; p++) { tt = syllables(tt, 2 + Math.floor(rnd() * 4)) + 0.25 + rnd() * 0.45; }
    return tt + 0.6;
  }
  function radioSynth(on, vol = 0.6, kind = 'music') {
    if (!on) { if (R) { clearInterval(R.timer); R.g.gain.setTargetAtTime(0, ac.currentTime, 0.1); const g = R.g; setTimeout(() => { try { g.disconnect(); } catch { /* */ } }, 800); R = null; } return; }
    if (!ctx()) return;
    if (R && R.kind !== kind) radioSynth(false);
    if (R) { R.g.gain.setTargetAtTime(vol * 0.55, ac.currentTime, 0.1); return; }
    const g = ac.createGain(); g.gain.value = vol * 0.55; g.connect(master);
    R = { g, kind, i: Math.floor(Math.random() * 4) * 512, next: ac.currentTime + 0.12, seed: 1 + Math.floor(Math.random() * 1e6), deg: 4, timer: 0 };
    const sched = () => {
      if (!R || !ac) return; if (R.next < ac.currentTime - 1) R.next = ac.currentTime + 0.05;
      if (R.kind === 'news') { while (R.next < ac.currentTime + 0.4) { try { R.next = bulletin(R.next); } catch (e) { console.warn('[city] news', e); R.next += 1; } } return; }
      while (R.next < ac.currentTime + 0.4) { const P = PROGS[Math.floor(R.i / 512) % PROGS.length]; try { step(R.i, R.next); } catch (e) { console.warn('[city] VRC FM', e); } R.next += 60 / P.bpm / 4; R.i++; }
    };
    R.timer = setInterval(sched, 110); sched();
  }
  return {
    resume: ctx, engine, drive, horn, honkAt, voiceAt, crash, siren, radioSynth,
    tick(hi) { blip(hi ? 1900 : 1500, 0.012, 0.05, 'square'); }, click() { blip(900, 0.02, 0.05, 'triangle'); }, ratchet() { for (let k = 0; k < 4; k++) setTimeout(() => blip(700 + k * 60, 0.015, 0.05, 'square'), k * 45); },
    wiper() { swish(0.45, 0.035); }, door() { crash(0.12); }, gate() { swish(1.6, 0.03); },
    setListener(x, z) { lx = x; lz = z; },
    setEnabled(v) { enabled = !!v; if (master) master.gain.setTargetAtTime(enabled ? 0.9 : 0, ac.currentTime, 0.05); },
    get radioPlaying() { return !!R; }, get ok() { return !!ac; },
    stopAll() { if (!ac) return; engine(false); horn(false); siren(0); radioSynth(false); if (SQ) { SQ.g.gain.setTargetAtTime(0, ac.currentTime, 0.05); WN.g.gain.setTargetAtTime(0, ac.currentTime, 0.05); } },
    dispose() { if (!ac) return; this.stopAll(); for (const v of [SQ, WN]) if (v) try { v.n.stop(ac.currentTime + 0.3); } catch { /* */ } if (SI) try { SI.o.stop(ac.currentTime + 0.5); SI.l.stop(ac.currentTime + 0.5); } catch { /* */ } const m = master; setTimeout(() => { try { m.disconnect(); } catch { /* */ } }, 900); SQ = WN = SI = null; ac = null; },
  };
}
