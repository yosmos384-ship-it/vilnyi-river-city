// VILNYI River City — lift and lobby music: a slow, warm loop made in code (no recordings). A soft triangle pad over four
// chords at 72 bpm and a sparse bell melody on a minor pentatonic; it fades in and out, and is silent until started.
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export function createLiftMusic(ac, out) {
  const g = ac.createGain(); g.gain.value = 0; g.connect(out);
  const CH = [[57, 60, 64, 67], [53, 57, 60, 64], [50, 54, 57, 60], [52, 55, 59, 62]];   // Am7, Fmaj7, Dm7, Em7
  const PENT = [0, 3, 5, 7, 10];
  const BAR = 4 * 60 / 72;
  let on = false, t0 = 0, bar = 0, timer = 0, seed = 2024;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  function pad(t, notes) {
    for (const n of notes) for (const d of [-7, 7]) {
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), e = ac.createGain();
      o.type = 'triangle'; o.frequency.value = mtof(n); o.detune.value = d;
      f.type = 'lowpass'; f.frequency.value = 900;
      e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.02, t + 1.4); e.gain.exponentialRampToValueAtTime(0.0001, t + BAR * 2);
      o.connect(f).connect(e).connect(g); o.start(t); o.stop(t + BAR * 2 + 0.2);
    }
  }
  function bell(t, m) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), e = ac.createGain(), e2 = ac.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 2.01; e2.gain.value = 0.22;
    o.connect(e); o2.connect(e2).connect(e); e.connect(g);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.06, t + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.start(t); o2.start(t); o.stop(t + 2.5); o2.stop(t + 2.5);
  }
  function sched() {
    if (!on) return;
    const now = ac.currentTime;
    while (t0 < now + 0.9) {
      const ch = CH[bar % CH.length];
      pad(t0, ch);
      const k = bar % 2 === 0 ? 2 : 1;
      for (let i = 0; i < k; i++) bell(t0 + rnd() * BAR * 0.8, ch[0] + 12 + PENT[Math.floor(rnd() * PENT.length)]);
      t0 += BAR; bar++;
    }
  }
  return {
    start() {
      if (on) return; on = true; const now = ac.currentTime;
      t0 = Math.max(t0, now + 0.12);
      g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0.5, now, 0.9);
      clearInterval(timer); timer = setInterval(sched, 300); sched();
    },
    stop() {
      if (!on) return; on = false; clearInterval(timer);
      const now = ac.currentTime; g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.35);
    },
    get playing() { return on; },
    dispose() { this.stop(); clearInterval(timer); setTimeout(() => { try { g.disconnect(); } catch { /* */ } }, 1500); },
  };
}
