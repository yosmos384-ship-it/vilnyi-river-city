// VILNYI River City — the building's sound, in one place:
//  · the apartment radio: a station scanner over the Romanian public stations (city/radio.js list; the generated programme
//    is the last one and the fallback). Each time a flat is entered it tunes to a random station;
//  · the apartment's 5.1 surround (surround.js) for everything the radio plays through the synth (the stream elements are
//    stereo: a browser routes a cross-origin stream through Web Audio only when the stream allows it, which is not assumed);
//  · the lift music (music.js): it starts with the first tap inside the building and carries through the lobby, the lifts
//    and the corridors; it stops when the visitor enters a flat, leaves the building or gets into a car;
//  · the car radio: a car in the car park has its own radio (stereo), playing a random station on entry;
//  · one mute for all of it, kept between visits.
// Browsers play no sound before a gesture: whatever is due waits for the next tap (sync() runs again then).
import { createAudio } from '../city/audio.js?v=3.11';
import { STATIONS } from '../city/radio.js?v=3.11';
import { createSurround } from './surround.js?v=3.11';
import { createLiftMusic } from './music.js?v=3.11';

const VOL = 0.62;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function createAV({ getCtx, onChange = () => {} } = {}) {
  const stations = STATIONS;
  const S = { muted: lsGet('vrc.av.mute') === '1', place: 'none', placeKey: 'none', liftOn: false, waitTap: false, radio: null, radioKey: null,
    station: -1, last: -1, status: 'off', pendingSync: false };
  const dead = new Set();
  let ac = null, final = null, sur = null, carBus = null, radioBus = null, synth = null, lift = null, el = null, tm = 0, tok = 0, noise = null, disposed = false;

  const state = () => {
    const st = S.station >= 0 ? stations[S.station] : null;
    return { muted: S.muted, radio: S.radio, status: S.status, liftOn: S.liftOn, place: S.place,
      station: st ? { name: st.name, freq: st.freq || '', synth: !!st.synth } : null, count: stations.length };
  };
  const emit = () => { try { onChange(state()); } catch (e) { console.warn('[av]', e); } };

  // the audio graph is made on the first sound (it needs the page's gesture): final → output, with the 5.1 mixer, the car
  // bus and the lift music feeding it; the synth (city/audio.js) feeds the radio bus, which goes to the surround or the car
  function graph() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; }
    if (disposed) return null;
    let c = null; try { c = getCtx ? getCtx() : null; } catch { c = null; }
    if (!c) return null;
    ac = c;
    const max = ac.destination.maxChannelCount || 2, six = max >= 6;
    if (six) { try { ac.destination.channelCount = 6; ac.destination.channelCountMode = 'explicit'; ac.destination.channelInterpretation = 'discrete'; } catch { /* stereo only */ } }
    final = ac.createGain();
    if (six) { final.channelCount = 6; final.channelCountMode = 'explicit'; final.channelInterpretation = 'discrete'; }
    final.gain.value = S.muted ? 0 : 1; final.connect(ac.destination);
    sur = createSurround(ac, final, six);
    carBus = ac.createGain(); carBus.connect(final);
    radioBus = ac.createGain(); radioBus.connect(sur);
    lift = createLiftMusic(ac, final);
    synth = createAudio(() => ac, { out: radioBus });
    return ac;
  }

  const pick = () => {
    const n = stations.length, pool = [];
    for (let i = 0; i < n; i++) if (i !== S.last && (!dead.has(i) || stations[i].synth)) pool.push(i);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : n - 1;
  };
  function stopStream() {
    clearTimeout(tm);
    if (el) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* */ } el.onplaying = el.onerror = null; }
  }
  // tune station i: a public stream, or the generated programme; a stream that cannot play moves on to the next one
  function play(i) {
    const my = ++tok, st = stations[i]; S.station = i; S.last = i;
    if (st.synth) { stopStream(); synth.radioSynth(true, VOL); S.status = 'live'; return emit(); }
    synth.radioSynth(true, VOL * 0.3);   // a quiet generated bed while the stream connects: never silence
    S.status = 'tuning'; emit();
    try {
      if (!el) { el = new Audio(); el.preload = 'none'; el.setAttribute('playsinline', ''); }
      stopStream(); el.muted = S.muted; el.volume = VOL;
      el.onplaying = () => { if (my !== tok) return; clearTimeout(tm); synth.radioSynth(false); S.status = 'live'; emit(); };
      el.onerror = () => { if (my === tok) fail(i, my); };
      el.src = st.urls[0];
      tm = setTimeout(() => { if (my === tok) fail(i, my); }, 6000);
      const pr = el.play();
      if (pr && pr.catch) pr.catch(err => {
        if (my !== tok) return;
        clearTimeout(tm);
        if (err && err.name === 'NotAllowedError') { S.status = 'tap'; emit(); }   // waits for the next tap (see onGesture)
        else fail(i, my);
      });
    } catch { fail(i, my); }
  }
  function fail(i, my) {
    if (my !== tok) return;
    stopStream(); dead.add(i);
    let j = (i + 1) % stations.length;
    for (let k = 1; k <= stations.length; k++) { const q = (i + k) % stations.length; if (!dead.has(q) || stations[q].synth) { j = q; break; } }
    play(j);
  }
  function startRadio(kind) {
    S.radio = kind; dead.clear();
    radioBus.disconnect(); radioBus.connect(kind === 'car' ? carBus : sur);
    play(pick());
  }
  function stopRadio() {
    tok++; stopStream(); if (synth) synth.radioSynth(false);
    S.radio = null; S.radioKey = null; S.status = 'off'; S.station = -1;
  }
  // brings the sound in line with the place: the radio of a flat or a car, the lift music in the lift and the corridors
  function sync() {
    if (disposed) return;
    const want = S.place === 'apartment' ? 'apartment' : S.place === 'car' ? 'car' : null;
    const wantLift = (S.place === 'lift' || S.place === 'common') && !S.waitTap;   // inside the building, after a tap there
    if (!graph()) { S.pendingSync = true; emit(); return; }   // no sound before a gesture
    S.pendingSync = false;
    if (S.radioKey !== (want ? S.placeKey : null)) {
      if (S.radio) stopRadio();
      if (want) { S.radioKey = S.placeKey; startRadio(want); }
    }
    if (S.liftOn !== wantLift) { S.liftOn = wantLift; if (wantLift) lift.start(); else lift.stop(); }
    emit();
  }
  // called on every change of where the visitor is: 'lift' | 'common' | 'apartment' (key = the flat) | 'car' | 'outside' | 'none'
  function place(kind, key = '') {
    if (disposed) return;
    const pk = kind + (key ? '|' + key : '');
    if (pk === S.placeKey) return;
    // coming in from the street: the lift music waits for the first tap inside the building (browsers want a gesture too)
    if ((kind === 'lift' || kind === 'common') && (S.place === 'none' || S.place === 'outside')) S.waitTap = true;
    S.place = kind; S.placeKey = pk;
    sync();
  }
  function setMute(v) {
    S.muted = !!v; lsSet('vrc.av.mute', S.muted ? '1' : '0');
    if (ac && final) final.gain.setTargetAtTime(S.muted ? 0 : 1, ac.currentTime, 0.04);
    if (el) { try { el.muted = S.muted; } catch { /* */ } }
    emit();
  }
  function burst() {   // the short hiss of a station change (scanner feel)
    if (!ac) return;
    const t = ac.currentTime, n = ac.createBufferSource();
    if (!noise) { noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    n.buffer = noise; const f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    n.connect(f).connect(g).connect(final); n.start(t); n.stop(t + 0.3);
  }
  function scan(d = 1) {
    if (!S.radio || disposed) return;
    const n = stations.length; burst(); play((S.station + (d >= 0 ? 1 : -1) + n) % n);
  }
  // a tap anywhere (the first one included) unlocks the sound: the waiting sync runs, a blocked station plays
  const onGesture = () => {
    if (disposed) return;
    const waited = S.waitTap || S.pendingSync; S.waitTap = false;
    if (!graph()) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    if (waited) sync();
    if (S.status === 'tap' && S.station >= 0) play(S.station);
  };
  const GEST = ['pointerdown', 'keydown', 'touchend'];
  for (const n of GEST) document.addEventListener(n, onGesture, true);
  emit();
  return {
    place, sync, state, scan, setMute,
    get muted() { return S.muted; },
    toggleMute() { setMute(!S.muted); },
    dispose() {
      if (disposed) return;
      disposed = true; S.placeKey = 'none'; S.place = 'none'; S.waitTap = false;
      for (const n of GEST) document.removeEventListener(n, onGesture, true);
      tok++; stopStream();
      try { if (synth) synth.dispose(); } catch { /* */ }
      try { if (lift) lift.dispose(); } catch { /* */ }
      try { if (ac && final) final.disconnect(); } catch { /* */ }
      el = null; S.radio = null; S.liftOn = false;
    },
  };
}
