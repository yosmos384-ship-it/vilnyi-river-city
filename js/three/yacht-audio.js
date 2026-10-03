// VILNYI Lifestyle yacht — sound: everything is synthesised with WebAudio (no audio files, no copyrighted music).
// Programmes per place: 'disco' (DJ set) / 'live' (band with a sung line) in the beach club, 'lounge' on the open decks
// and in the salons, 'spa' in the spa. Small effects (doors, lift, horn, clink …) and an engine hum under way.
// Sound starts only after a user gesture (unlock()); the beat clock runs regardless so the lights can follow it.
const PROG = {
  disco: { bpm: 122, vol: 0.9 }, live: { bpm: 96, vol: 0.85 }, lounge: { bpm: 88, vol: 0.5 }, spa: { bpm: 60, vol: 0.55 },
};
const ZONE_PROG = { beach: 'disco', swim: 'lounge', aft: 'lounge', sundeck: 'lounge', upaft: 'lounge', salon: 'lounge', dining: 'lounge', sky: 'lounge', spa: 'spa', massage: 'spa', sauna: 'spa', hammam: 'spa' };
const ZONE_GAIN = { beach: 1, swim: 0.5, aft: 0.45, sundeck: 0.8, upaft: 0.55, salon: 0.4, dining: 0.35, sky: 0.45, spa: 0.8, massage: 1, sauna: 0.7, hammam: 0.7 };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createAudio(yacht) {
  let ac = null, master = null, music = null, noise = null, delay = null, engine = null;
  const A = {
    unlocked: false, muted: false, volume: 0.7, beat: 0, beatTime: 0, show: 'dj', prog: null,
    unlock() {
      if (A.unlocked) { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); return; }
      try {
        const ua = navigator.userActivation; if (ua && !ua.hasBeenActive) return;
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ac = new AC(); if (ac.state === 'suspended') ac.resume().catch(() => {});
        master = ac.createGain(); master.gain.value = A.muted ? 0 : A.volume; master.connect(ac.destination);
        music = ac.createGain(); music.gain.value = 0; music.connect(master);
        const n = ac.sampleRate; noise = ac.createBuffer(1, n, n); const d = noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        delay = ac.createDelay(1); delay.delayTime.value = 0.36; const fb = ac.createGain(); fb.gain.value = 0.32; const dl = ac.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
        delay.connect(dl).connect(fb).connect(delay); dl.connect(music);
        A.unlocked = true; next = ac.currentTime + 0.08; step = 0;
        if (yacht._sndBtn) yacht._sndBtn();
      } catch { /* no audio */ }
    },
    setMuted(b) { A.muted = !!b; if (master) master.gain.setTargetAtTime(A.muted ? 0 : A.volume, ac.currentTime, 0.05); },
    setVolume(v) { A.volume = Math.max(0, Math.min(1, v)); if (master && !A.muted) master.gain.setTargetAtTime(A.volume, ac.currentTime, 0.05); },
    toggleShow() { A.show = A.show === 'live' ? 'dj' : 'live'; if (A.zoneId === 'beach') setProg(A.show === 'live' ? 'live' : 'disco'); yacht.walk._toast(yacht.t(A.show === 'live' ? 'live' : 'dj'), 2200); if (yacht.el && yacht.el.show) yacht.el.show.textContent = yacht.t(A.show === 'live' ? 'dj' : 'live'); },
    zone(z) { A.zoneId = z ? z.id : null; let p = z ? ZONE_PROG[z.id] || null : null; if (p === 'disco' && A.show === 'live') p = 'live'; if (yacht.massaging) p = 'spa'; setProg(p, z ? ZONE_GAIN[z.id] ?? 0.5 : 0); if (yacht.el && yacht.el.show) yacht.el.show.textContent = yacht.t(A.show === 'live' ? 'dj' : 'live'); },
    update, sfx, dispose() { try { if (engine) engine.stop(); ac && ac.close(); } catch { /* */ } ac = null; A.unlocked = false; },
  };
  let prog = null, pgain = 0, next = 0, step = 0, vt = 0;
  function setProg(p, g = pgain) {
    pgain = g;
    if (p !== prog) { prog = p; A.prog = p; step = 0; if (ac) { next = ac.currentTime + 0.12; } }
    if (music) music.gain.setTargetAtTime(p ? PROG[p].vol * g : 0, ac.currentTime, 0.35);
  }
  // ---- voices
  const env = (g, t, a, d, v) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function tone(type, f, t, a, d, v, o = {}) {
    const os = ac.createOscillator(), g = ac.createGain(); os.type = type; os.frequency.setValueAtTime(f, t); if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || d));
    if (o.det) os.detune.value = o.det;
    let node = os; if (o.lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, t); if (o.lpTo) fl.frequency.exponentialRampToValueAtTime(o.lpTo, t + d); fl.Q.value = o.q || 1; os.connect(fl); node = fl; }
    env(g, t, a, d, v); node.connect(g); g.connect(o.dest || music); if (o.echo) g.connect(delay);
    os.start(t); os.stop(t + a + d + 0.05);
  }
  function hit(t, d, v, type, f, q = 1, dest = music) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    env(g, t, 0.002, d, v); s.connect(fl).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + d + 0.05);
  }
  const kick = (t, v = 0.9) => tone('sine', 130, t, 0.002, 0.26, v, { to: 44, glide: 0.12 });
  const chord = (t, notes, d, v, type = 'sawtooth', o = {}) => notes.forEach((m, i) => tone(type, mtof(m), t, o.a ?? 0.01, d, v / notes.length, { det: (i - 1) * 7, lp: o.lp ?? 1400, lpTo: o.lpTo, echo: o.echo }));
  // voice: a saw through two formants with vibrato — an "aah" line for the live show
  function sing(t, m, d, v) {
    const os = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain(), f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(), mix = ac.createGain();
    os.type = 'sawtooth'; os.frequency.setValueAtTime(mtof(m), t); lfo.frequency.value = 5.4; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(mtof(m) * 0.012, t + 0.25); lfo.connect(lg).connect(os.frequency);
    f1.type = 'bandpass'; f1.frequency.value = 760; f1.Q.value = 5; f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 7;
    os.connect(f1).connect(mix); os.connect(f2).connect(mix);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.09); g.gain.setValueAtTime(v, t + d * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + d);
    mix.connect(g); g.connect(music); g.connect(delay); os.start(t); lfo.start(t); os.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
  }
  // ---- programmes (one call per 16th note)
  const DISCO_BASS = [45, 45, 57, 45, 45, 57, 45, 48, 41, 41, 53, 41, 43, 43, 55, 47];
  const DISCO_CH = [[57, 60, 64, 67], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
  const LIVE_CH = [[50, 57, 60, 65], [55, 59, 62, 65], [48, 55, 59, 64], [45, 52, 57, 60]];           // Dm7 G7 Cmaj7 Am7
  const LIVE_BASS = [38, 45, 43, 47, 36, 43, 45, 40];
  const LIVE_MEL = [[69, 3], [72, 3], [74, 2], [72, 4], [null, 4], [71, 3], [74, 3], [77, 2], [76, 6], [null, 2], [72, 3], [76, 3], [79, 2], [76, 4], [null, 4], [72, 2], [69, 2], [67, 2], [69, 8], [null, 2]];
  const LOUNGE_CH = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
  const SPA_NOTES = [62, 69, 74, 76, 81, 69, 72, 79];
  let melI = 0, melLeft = 0;
  function tick(p, i, t, sp16) {
    const bar = Math.floor(i / 16), s = i % 16;
    if (p === 'disco') {
      if (s % 4 === 0) kick(t, 0.95);
      if (s % 4 === 2) hit(t, 0.05, 0.16, 'highpass', 7500);
      if (s % 2 === 1) hit(t, 0.02, 0.05, 'highpass', 9000);
      if (s === 4 || s === 12) { hit(t, 0.12, 0.3, 'bandpass', 1600, 0.8); hit(t + 0.012, 0.1, 0.2, 'bandpass', 1900, 0.8); }
      tone('sawtooth', mtof(DISCO_BASS[s] - (bar % 4 === 3 && s > 11 ? 2 : 0)), t, 0.005, sp16 * 0.9, 0.34, { lp: 520, lpTo: 160, q: 6 });
      if (s === 2 || s === 7 || s === 10) chord(t, DISCO_CH[bar % 4].map(m => m + 12), sp16 * 1.6, 0.26, 'sawtooth', { lp: 2600, lpTo: 600, echo: true });
      if (bar % 8 >= 4 && s % 2 === 0) tone('square', mtof([76, 79, 81, 84, 81, 79, 76, 72][(i / 2) % 8 | 0]), t, 0.004, sp16 * 0.8, 0.07, { lp: 3000, echo: true });
    } else if (p === 'live') {
      if (s === 0 || s === 10) kick(t, 0.55);
      if (s === 4 || s === 12) hit(t, 0.16, 0.16, 'bandpass', 2200, 0.6);
      if (s % 2 === 0) hit(t, 0.06, s % 4 === 2 ? 0.07 : 0.035, 'highpass', 6500);
      if (s % 4 === 0) tone('triangle', mtof(LIVE_BASS[(bar * 2 + (s >= 8 ? 1 : 0)) % 8] + (s % 8 === 4 ? 7 : 0)), t, 0.01, sp16 * 3.4, 0.4, { lp: 700 });
      if (s === 0 || s === 6 || s === 11) chord(t, LIVE_CH[bar % 4], sp16 * 4.5, 0.34, 'triangle', { lp: 2200, a: 0.012 });
      if (s === 3 || s === 14) chord(t, LIVE_CH[bar % 4].map(m => m + 12).slice(1), sp16 * 1.2, 0.12, 'sine', { lp: 3000, echo: true });
      if (melLeft <= 0) { const [m, n] = LIVE_MEL[melI % LIVE_MEL.length]; melI++; melLeft = n; if (m != null) sing(t, m - 12, sp16 * n * 0.96, 0.2); }
      melLeft--;
    } else if (p === 'lounge') {
      if (s === 0 || s === 7 || s === 10) kick(t, 0.32);
      if (s === 4 || s === 12) hit(t, 0.1, 0.06, 'bandpass', 1800, 0.7);
      if (s % 2 === 0) hit(t, 0.03, 0.025, 'highpass', 8000);
      if (s === 0) chord(t, LOUNGE_CH[bar % 4], sp16 * 15, 0.3, 'triangle', { lp: 1500, a: 0.5 });
      if (s === 0 || s === 8) tone('sine', mtof(LOUNGE_CH[bar % 4][0] - 12), t, 0.02, sp16 * 6, 0.3);
      if ([2, 5, 9, 13].includes(s)) tone('sine', mtof(LOUNGE_CH[bar % 4][(i * 3) % 4] + 12 + (bar % 2 ? 0 : 2)), t, 0.004, 0.5, 0.11, { echo: true });
    } else if (p === 'spa') {
      if (s === 0 && bar % 2 === 0) chord(t, [50, 57, 62, 66].map(m => m + (bar % 8 >= 4 ? -2 : 0)), sp16 * 34, 0.34, 'sine', { lp: 900, a: 2.5 });
      if (s === 0 && bar % 2 === 0) tone('triangle', mtof(38 + (bar % 8 >= 4 ? -2 : 0)), t, 2, sp16 * 30, 0.16, { lp: 300 });
      if ((s === 4 && bar % 2 === 0) || (s === 10 && bar % 3 === 1) || (s === 14 && bar % 4 === 2)) tone('sine', mtof(SPA_NOTES[(bar * 3 + s) % SPA_NOTES.length]), t, 0.006, 2.4, 0.09, { echo: true });
    }
  }
  function update(dt) {
    // beat clock for the lights (follows the audio clock when it runs)
    const p = prog || (A.zoneId === 'beach' ? (A.show === 'live' ? 'live' : 'disco') : 'lounge'), bpm = PROG[p].bpm;
    if (A.unlocked && ac && ac.state === 'running') {
      const sp16 = 60 / bpm / 4;
      let guard = 0;
      while (prog && next < ac.currentTime + 0.22 && guard++ < 16) { if (next > ac.currentTime - 0.05) { try { tick(prog, step, Math.max(next, ac.currentTime + 0.005), sp16); } catch { /* */ } } step++; next += sp16; }
      if (!prog) { next = ac.currentTime + 0.1; }
      A.beatTime = prog ? (step - (next - ac.currentTime) / sp16) / 4 : A.beatTime + dt * bpm / 60;
      // engine hum under way
      const sp = Math.abs(yacht.helm.speed);
      if (sp > 0.2 && !engine) { engine = mkEngine(); }
      if (engine) { engine.g.gain.setTargetAtTime(Math.min(0.11, sp * 0.012) * (yacht.cur && yacht.cur.id === 'bridge' ? 1.3 : 0.8), ac.currentTime, 0.4); engine.os.frequency.setTargetAtTime(38 + sp * 2.2, ac.currentTime, 0.5); if (sp < 0.05 && yacht.helm.docked) { engine.stop(); engine = null; } }
    } else { vt += dt; A.beatTime = vt * bpm / 60; }
    const fr = A.beatTime - Math.floor(A.beatTime); A.beat = Math.exp(-fr * 4.5);
  }
  function mkEngine() {
    const os = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter(), s = ac.createBufferSource(), ng = ac.createGain(), nf = ac.createBiquadFilter();
    os.type = 'sawtooth'; os.frequency.value = 40; fl.type = 'lowpass'; fl.frequency.value = 130; g.gain.value = 0; os.connect(fl).connect(g).connect(master);
    s.buffer = noise; s.loop = true; nf.type = 'lowpass'; nf.frequency.value = 260; ng.gain.value = 0.5; s.connect(nf).connect(ng).connect(g);
    os.start(); s.start();
    return { os, g, stop() { try { g.gain.setTargetAtTime(0, ac.currentTime, 0.2); os.stop(ac.currentTime + 1); s.stop(ac.currentTime + 1); } catch { /* */ } } };
  }
  // ---- effects
  function sfx(kind) {
    if (!A.unlocked || !ac || A.muted) return;
    const t = ac.currentTime + 0.01, d = master;
    try {
      if (kind === 'door') hit(t, 0.35, 0.05, 'lowpass', 500, 0.7, d);
      else if (kind === 'lift') { tone('sine', 90, t, 0.2, 1.1, 0.08, { dest: d }); hit(t, 1.0, 0.03, 'lowpass', 300, 0.7, d); }
      else if (kind === 'chime') { tone('sine', 1320, t, 0.004, 0.6, 0.1, { dest: d }); tone('sine', 990, t + 0.18, 0.004, 0.8, 0.1, { dest: d }); }
      else if (kind === 'horn') { for (const f of [116, 146, 175]) tone('sawtooth', f, t, 0.12, 1.5, 0.12, { lp: 700, dest: d }); }
      else if (kind === 'alarm') { for (let i = 0; i < 3; i++) tone('square', 1400, t + i * 0.22, 0.004, 0.11, 0.06, { lp: 3000, dest: d }); }
      else if (kind === 'clink') { tone('sine', 2650, t, 0.001, 0.5, 0.12, { dest: d }); tone('sine', 3980, t + 0.012, 0.001, 0.4, 0.08, { dest: d }); tone('sine', 5300, t, 0.001, 0.2, 0.04, { dest: d }); }
      else if (kind === 'kiss') { hit(t, 0.07, 0.12, 'bandpass', 2600, 2.5, d); tone('sine', 900, t + 0.06, 0.004, 0.09, 0.07, { to: 1900, glide: 0.08, dest: d }); }
      else if (kind === 'clap') { hit(t, 0.07, 0.3, 'bandpass', 1500, 0.8, d); hit(t + 0.012, 0.09, 0.2, 'bandpass', 2100, 0.8, d); }
      else if (kind === 'sip') { hit(t, 0.18, 0.05, 'bandpass', 900, 3, d); tone('sine', 300, t + 0.16, 0.01, 0.12, 0.05, { to: 190, dest: d }); }
      else if (kind === 'take') { tone('sine', 1900, t, 0.001, 0.12, 0.05, { dest: d }); hit(t, 0.04, 0.04, 'highpass', 4000, 1, d); }
      else if (kind === 'robe') hit(t, 0.6, 0.05, 'bandpass', 2200, 0.5, d);
    } catch { /* */ }
  }
  return A;
}
