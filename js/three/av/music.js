// VILNYI River City — lift and lobby music: a slow, warm loop made in code (no recordings). Soft triangle pads hold each
// chord for a bar with a gentle swell and overlap into the next (no gaps), over four chords at 72 bpm, and a sparse bell
// melody on a minor pentatonic. Levels are set for a phone speaker in a quiet lobby (audible, never harsh).
// Silent until started; start() and stop() fade it in and out.
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export function createLiftMusic(ac, out) {
  const g = ac.createGain(); g.gain.value = 0; g.connect(out);
  const CH = [[57, 60, 64, 67], [53, 57, 60, 64], [50, 54, 57, 60], [52, 55, 59, 62]];   // Am7, Fmaj7, Dm7, Em7
  const PENT = [0, 3, 5, 7, 10];
  const BAR = 4 * 60 / 72;
  let on = false, t0 = 0, bar = 0, timer = 0, seed = 2024;
  const LOOK = 4.0;   // seconds of music queued ahead: a busy main thread (a frame, a lift, a texture) must not leave a gap
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  // one chord = one bar: swell in over ~0.9 s, hold, and release just after the next chord has begun
  function pad(t, notes) {
    const end = t + BAR;
    for (const n of notes) for (const d of [-6, 6]) {
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), e = ac.createGain();
      o.type = 'triangle'; o.frequency.value = mtof(n); o.detune.value = d;
      f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 0.4;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.045, t + 0.9);
      e.gain.exponentialRampToValueAtTime(0.035, end);
      e.gain.exponentialRampToValueAtTime(0.0001, end + 0.9);
      o.connect(f).connect(e).connect(g); o.start(t); o.stop(end + 1.0);
    }
  }
  function bell(t, m) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), e = ac.createGain(), e2 = ac.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 2.01; e2.gain.value = 0.25;
    o.connect(e); o2.connect(e2).connect(e); e.connect(g);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.11, t + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    o.start(t); o2.start(t); o.stop(t + 2.7); o2.stop(t + 2.7);
  }
  function sched() {
    if (!on) return;
    const now = ac.currentTime;
    if (t0 < now) t0 = now + 0.12;                       // a suspended or late context: carry on from now
    while (t0 < now + LOOK) {
      const ch = CH[bar % CH.length];
      pad(t0, ch);
      const k = bar % 2 === 0 ? 2 : 1;
      for (let i = 0; i < k; i++) bell(t0 + (0.15 + rnd() * 0.6) * BAR, ch[0] + 12 + PENT[Math.floor(rnd() * PENT.length)]);
      t0 += BAR; bar++;
    }
  }
  return {
    start() {
      if (on) return; on = true; const now = ac.currentTime;
      t0 = Math.max(t0, now + 0.12);
      g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0.8, now, 0.6);
      clearInterval(timer); timer = setInterval(sched, 200); sched();
    },
    // tc: the fade's time constant (seconds). A car stops it at once: the notes already queued must not be heard in the car
    stop(tc = 0.35) {
      if (!on) return; on = false; clearInterval(timer);
      const now = ac.currentTime; g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, tc);
    },
    get playing() { return on; },
    dispose() { this.stop(); clearInterval(timer); setTimeout(() => { try { g.disconnect(); } catch { /* */ } }, 1500); },
  };
}
