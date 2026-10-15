// exterior-audio.js — procedural ambience: birds (day), crickets (night), distant traffic + passing cars.
// Starts only after a user gesture; quieter when the camera is inside the house.

export function setupAmbient(W) {
  const { ctx, plan } = W;
  const A = ctx.audio;
  if (!A || typeof window === 'undefined') return null;
  const state = { started: false, enabled: true, master: null, ac: null, inside: false, night: 0 };
  let timers = [];
  const later = (fn, ms) => { const id = setTimeout(() => { timers = timers.filter((t) => t !== id); fn(); }, ms); timers.push(id); };

  function noiseBuffer(ac, seconds, pink) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2; }
      else d[i] = w;
    }
    // crossfade ends so the loop is seamless
    const f = Math.min(2000, len >> 2);
    for (let i = 0; i < f; i++) { const t = i / f; d[i] = d[i] * t + d[len - f + i] * (1 - t); }
    return buf;
  }
  const panner = (ac, p) => {
    if (ac.createStereoPanner) { const s = ac.createStereoPanner(); s.pan.value = p; return s; }
    return ac.createGain();
  };

  function start() {
    if (state.started) return;
    let ac = null;
    try { ac = A.ctx; } catch (e) { ac = null; }
    if (!ac || !ac.createGain) return;
    state.started = true; state.ac = ac;
    // never un-suspend a context the core mute button suspended (core mute = AudioContext.suspend())
    try { if (ac.state === 'suspended' && ac.resume && !A.muted) ac.resume(); } catch (e) { /* ignore */ }
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, start, true);
    const master = ac.createGain(); master.gain.value = 0;
    let out = null; try { out = A.master; } catch (e) { out = null; } // route through core's master bus when available
    master.connect(out && out.context === ac ? out : ac.destination);
    master.gain.setTargetAtTime(0.9, ac.currentTime, 1.5);
    state.master = master;
    // distant traffic bed
    const pinkBuf = noiseBuffer(ac, 6, true);
    const bed = ac.createBufferSource(); bed.buffer = pinkBuf; bed.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.3;
    const bedG = ac.createGain(); bedG.gain.value = 0.05;
    bed.connect(lp); lp.connect(bedG); bedG.connect(master); bed.start();
    state.bedG = bedG;
    // crickets (night): 4.4 kHz carrier, amplitude-pulsed
    const cr = ac.createOscillator(); cr.type = 'sine'; cr.frequency.value = 4400;
    const crAM = ac.createGain(); crAM.gain.value = 0;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28;
    const lfoG = ac.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(crAM.gain);
    const crG = ac.createGain(); crG.gain.value = 0;
    cr.connect(crAM); crAM.connect(crG); crG.connect(master);
    cr.start(); lfo.start();
    state.crG = crG;
    const whiteBuf = noiseBuffer(ac, 2, false);
    // passing car whoosh
    const passCar = () => {
      if (!state.enabled) return;
      try {
        const t0 = ac.currentTime, dur = 3 + Math.random() * 3;
        const src = ac.createBufferSource(); src.buffer = pinkBuf; src.loop = true;
        const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(250, t0);
        f.frequency.linearRampToValueAtTime(900 + Math.random() * 500, t0 + dur / 2); f.frequency.linearRampToValueAtTime(250, t0 + dur);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0);
        const peak = 0.12 + Math.random() * 0.12;
        g.gain.linearRampToValueAtTime(peak, t0 + dur / 2); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        const dir = Math.random() < 0.5 ? -1 : 1;
        const pn = panner(ac, -dir);
        if (pn.pan) { pn.pan.setValueAtTime(-dir * 0.9, t0); pn.pan.linearRampToValueAtTime(dir * 0.9, t0 + dur); }
        src.connect(f); f.connect(g); g.connect(pn); pn.connect(master);
        src.start(t0, Math.random() * 4); src.stop(t0 + dur + 0.1);
      } catch (e) { /* ignore */ }
      later(passCar, 7000 + Math.random() * 16000 + state.night * 15000);
    };
    later(passCar, 3000);
    // birds: species-like patterns of short FM chirps
    const chirp = (t, f0, f1, dur, gain, pan) => {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(50, f1), t + dur);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const pn = panner(ac, pan);
      o.connect(g); g.connect(pn); pn.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    };
    const songs = [
      (t, p, gn) => { for (let i = 0; i < 3; i++) chirp(t + i * 0.13, 4200, 2800, 0.09, gn, p); },               // tsip-tsip-tsip
      (t, p, gn) => { chirp(t, 2400, 3600, 0.18, gn, p); chirp(t + 0.24, 3600, 2200, 0.22, gn, p); },               // cardinal-ish "wheet-cheer"
      (t, p, gn) => { for (let i = 0; i < 6; i++) chirp(t + i * 0.07, 5200 - i * 120, 4300 - i * 100, 0.05, gn * 0.8, p); }, // trill
      (t, p, gn) => { chirp(t, 3000, 3100, 0.35, gn * 0.7, p); chirp(t + 0.45, 2600, 2650, 0.3, gn * 0.6, p); },    // whistle
      (t, p, gn) => { for (let i = 0; i < 2; i++) chirp(t + i * 0.2, 6000, 3500, 0.06, gn * 0.6, p); },             // sparrow chip
    ];
    const bird = () => {
      if (state.enabled && state.night < 0.6) {
        try {
          const t = ac.currentTime + 0.05;
          const song = songs[Math.floor(Math.random() * songs.length)];
          const reps = 1 + Math.floor(Math.random() * 3);
          const pan = Math.random() * 1.6 - 0.8, gn = 0.012 + Math.random() * 0.025;
          for (let k = 0; k < reps; k++) song(t + k * (0.8 + Math.random() * 0.6), pan, gn * (1 - state.night));
        } catch (e) { /* ignore */ }
      }
      later(bird, 1200 + Math.random() * 4500 + state.night * 6000);
    };
    later(bird, 800);
    later(bird, 2500);
    // occasional distant dog bark / breeze gust
    const gust = () => {
      try {
        const t0 = ac.currentTime, dur = 4 + Math.random() * 4;
        const src = ac.createBufferSource(); src.buffer = whiteBuf; src.loop = true;
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600 + Math.random() * 600; f.Q.value = 0.6;
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.025, t0 + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f); f.connect(g); g.connect(master); src.start(t0); src.stop(t0 + dur + 0.1);
      } catch (e) { /* ignore */ }
      later(gust, 9000 + Math.random() * 15000);
    };
    later(gust, 5000);
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, start, { capture: true, passive: true });

  let lastTarget = -1, lastNight = -1;
  const W_ = plan.W, D_ = plan.D;
  const update = () => {
    if (!state.started || !state.ac) return;
    const cam = ctx.camera;
    if (cam) {
      const p = cam.position;
      // camera world position (camera may be parented)
      let x = p.x, z = p.z;
      if (cam.matrixWorld) { x = cam.matrixWorld.elements[12]; z = cam.matrixWorld.elements[14]; }
      state.inside = x >= 0 && x <= W_ && z >= 0 && z <= D_;
    }
    const target = (!state.enabled || A.muted) ? 0 : state.inside ? 0.22 : 0.9;
    const t = state.ac.currentTime;
    if (Math.abs(target - lastTarget) > 0.001) { state.master.gain.setTargetAtTime(target, t, 0.35); lastTarget = target; }
    if (Math.abs(state.night - lastNight) > 0.02) {
      lastNight = state.night;
      if (state.crG) state.crG.gain.setTargetAtTime(0.012 * Math.max(0, (state.night - 0.4) / 0.6), t, 1.0);
      if (state.bedG) state.bedG.gain.setTargetAtTime(0.05 * (1 - 0.5 * state.night), t, 1.0);
    }
  };
  return {
    state, update,
    setNight(n) { state.night = n; },
    setEnabled(on) { state.enabled = !!on; },
    dispose() { timers.forEach(clearTimeout); timers = []; try { state.master && state.master.disconnect(); } catch (e) { /* ignore */ } },
  };
}
