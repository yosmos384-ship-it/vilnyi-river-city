// VILNYI Lifestyle casino — sounds synthesised with WebAudio (chips, cards, wheel, reels, wins) and the dealer's voice
// through speechSynthesis. Follows the yacht's sound switch and volume: silent until the visitor has unlocked the sound
// there, muted when it is muted.
export function createSound(yacht, speechLang) {
  let ac = null, noise = null;
  const on = () => !!(yacht.audio && yacht.audio.unlocked && !yacht.audio.muted);
  const ctx = () => {
    if (!on()) return null;
    if (!ac) { try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = new AC(); const n = ac.sampleRate * 0.5 | 0; noise = ac.createBuffer(1, n, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; } catch { return null; } }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  };
  const vol = () => Math.max(0, Math.min(1, yacht.audio.volume ?? 0.7));
  const tone = (f, t, d, v, type = 'sine', to = null) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * vol(), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.03); };
  const hit = (t, d, v, type, f, q = 1) => { const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.setValueAtTime(v * vol(), t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(fl).connect(g).connect(ac.destination); s.start(t, Math.random() * 0.3); s.stop(t + d + 0.03); };
  const S = {
    play(kind, o = {}) {
      const a = ctx(); if (!a) return; const t = a.currentTime + 0.005 + (o.delay || 0);
      try {
        if (kind === 'chip') { tone(2900 + Math.random() * 500, t, 0.05, 0.1, 'triangle'); tone(4300, t + 0.012, 0.04, 0.06, 'sine'); hit(t, 0.03, 0.08, 'highpass', 3500); }
        else if (kind === 'chips') { for (let i = 0; i < 4; i++) { tone(2700 + Math.random() * 900, t + i * 0.045, 0.05, 0.08, 'triangle'); hit(t + i * 0.045, 0.025, 0.06, 'highpass', 3800); } }
        else if (kind === 'card') { hit(t, 0.07, 0.16, 'bandpass', 2600, 0.7); hit(t + 0.04, 0.05, 0.07, 'highpass', 5000); }
        else if (kind === 'flip') { hit(t, 0.05, 0.12, 'bandpass', 3400, 1.2); }
        else if (kind === 'shuffle') { for (let i = 0; i < 14; i++) hit(t + i * 0.035, 0.03, 0.07, 'bandpass', 2200 + i * 60, 1); }
        else if (kind === 'win') { [659, 784, 988, 1319].forEach((f, i) => tone(f, t + i * 0.09, 0.3, 0.09, 'triangle')); }
        else if (kind === 'bigwin') { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, t + i * 0.085, 0.42, 0.1, 'triangle')); for (let i = 0; i < 6; i++) tone(2900 + Math.random() * 600, t + 0.5 + i * 0.05, 0.05, 0.06, 'triangle'); }
        else if (kind === 'lose') { tone(300, t, 0.3, 0.07, 'sine', 170); }
        else if (kind === 'push') { tone(520, t, 0.14, 0.06, 'sine'); }
        else if (kind === 'tick') { tone(1900, t, 0.02, 0.05, 'square'); }
        else if (kind === 'ball') { hit(t, 0.04, 0.1, 'bandpass', 3000, 3); tone(1500, t, 0.03, 0.04); }
        else if (kind === 'reel') { tone(180, t, 0.08, 0.09, 'square', 120); hit(t, 0.05, 0.08, 'lowpass', 900); }
        else if (kind === 'dice') { for (let i = 0; i < 5; i++) hit(t + i * 0.06 + Math.random() * 0.02, 0.03, 0.12, 'bandpass', 1800 + Math.random() * 900, 2); }
        else if (kind === 'btn') { tone(880, t, 0.04, 0.04, 'sine'); }
      } catch { /* sound is optional */ }
    },
    /** Dealer's voice in the site language (also shown as text by the caller). */
    say(text) {
      if (!on()) return;
      try { const ss = window.speechSynthesis; if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return; ss.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = speechLang(); u.rate = 1.02; u.pitch = 1; u.volume = Math.min(1, vol() + 0.2); ss.speak(u); } catch { /* no speech */ }
    },
    dispose() { try { ac && ac.close(); } catch { /* */ } ac = null; },
  };
  return S;
}
