// City Drive — the car radio.
// Presets 1–4 are the public broadcaster's own internet streams (Societatea Română de Radiodifuziune, host srr.ro),
// played through a plain <audio> element (no CORS needed as the sound is never routed through Web Audio). Preset 5,
// "VRC FM", is a built-in generated music programme (audio.js) with no recorded tracks at all — it is also what plays
// whenever a stream cannot be reached or is blocked. NOT VERIFIED against the live streams from the build sandbox
// (no outbound audio there): the Actualități address is the one a public station directory lists for it, the other
// three follow the same naming on the same host and are assumptions. Replace or extend the list with window.VRC_RADIO = [{name, freq, urls:[…]}] if needed.
// Rebroadcasting a station inside a commercial site may need the broadcaster's permission — the owner should check.
export const STATIONS = [
  { id: 'rra', name: 'Radio România Actualități', freq: '105.3', urls: ['https://stream4.srr.ro:8443/romania-actualitati'] },
  { id: 'rrm', name: 'Radio România Muzical', freq: '104.8', urls: ['https://stream4.srr.ro:8443/romania-muzical'] },
  { id: 'bfm', name: 'București FM', freq: '98.3', urls: ['https://stream4.srr.ro:8443/bucuresti-fm'] },
  { id: 'rrc', name: 'Radio România Cultural', freq: '101.3', urls: ['https://stream4.srr.ro:8443/romania-cultural'] },
  { id: 'vrc', name: 'VRC FM', freq: '88.8', synth: true },
];
export function createRadio({ audio, onChange = () => {} } = {}) {
  const list = (Array.isArray(globalThis.VRC_RADIO) && globalThis.VRC_RADIO.length ? [...globalThis.VRC_RADIO.filter(s => s && s.name && Array.isArray(s.urls)), STATIONS[STATIONS.length - 1]] : STATIONS).map(s => ({ ...s, dead: false }));
  let idx = 0, on = false, vol = 0.6, el = null, status = 'off', tok = 0, timer = 0, dirn = 1;
  try { const v = +localStorage.getItem('vrc.city.radioVol'); if (v > 0 && v <= 1) vol = v; const k = +localStorage.getItem('vrc.city.radio'); if (k >= 0 && k < list.length) idx = k; } catch { /* private mode */ }
  const names = list.map(s => ({ name: s.name, freq: s.freq || '' }));   // the station list (the car radio's menu)
  const state = () => ({ on, index: idx, name: list[idx].name, freq: list[idx].freq, status, volume: vol, synth: !!list[idx].synth, count: list.length, stations: names });
  const set = s => { status = s; onChange(state()); };
  function stopEl() { clearTimeout(timer); if (el) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* */ } el.onplaying = el.onerror = el.onstalled = el.onended = null; } }
  function synthOn(v) { try { audio && audio.radioSynth(v, vol); } catch (e) { console.warn('[city] radio synth', e); } }
  function standby(v) { try { audio && audio.radioSynth(v, vol * 0.35); } catch { /* */ } }
  function fail(my) {   // this station cannot be played now → the next preset, in the end VRC FM (never an error on screen)
    if (my !== tok) return; stopEl(); list[idx].dead = true;
    for (let k = 1; k <= list.length; k++) { const j = (idx + dirn * k + list.length * 4) % list.length; if (!list[j].dead || list[j].synth) { idx = j; break; } }
    tune();
  }
  function tryUrl(st, u, my) {
    if (u >= st.urls.length) return fail(my);
    try {
      if (!el) { el = new Audio(); el.preload = 'none'; el.setAttribute('playsinline', ''); }
      stopEl(); el.volume = vol;
      const next = () => { if (my === tok) tryUrl(st, u + 1, my); };
      el.onplaying = () => { if (my === tok) { clearTimeout(timer); standby(false); set('live'); } };
      el.onerror = next; el.onended = next;
      el.src = st.urls[u];
      timer = setTimeout(next, 5000);   // nothing after 5 s: blocked, offline or a format this browser cannot play
      const pr = el.play(); if (pr && pr.catch) pr.catch(() => { if (my === tok) { clearTimeout(timer); next(); } });
    } catch { fail(my); }
  }
  function tune() {
    const my = ++tok; if (!on) return; const st = list[idx];
    try { localStorage.setItem('vrc.city.radio', String(idx)); } catch { /* */ }
    if (st.synth) { stopEl(); synthOn(true); return set('synth'); }
    standby(true); set('tuning'); tryUrl(st, 0, my);   // VRC FM plays quietly while the stream connects: never silence
  }
  return {
    state, stations: list,
    // call from a user gesture (the ignition button): browsers only start audio then
    // quiet: the car's ignition — the generated programme (no network), so no live stream is held open by the game
    power(v, quiet = false) { on = v == null ? !on : !!v; if (!on) { tok++; stopEl(); synthOn(false); return set('off'); } if (quiet) idx = list.length - 1; tune(); },
    // a station picked from the list: tune it at once (the radio turns on)
    pick(i) { if (!list.length) return; dirn = 1; idx = ((+i % list.length) + list.length) % list.length; list[idx].dead = false; on = true; tune(); },
    next(d = 1) { dirn = d >= 0 ? 1 : -1; idx = (idx + dirn + list.length) % list.length; list[idx].dead = false; if (on) tune(); else onChange(state()); },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (el) el.volume = vol; if (on && list[idx].synth) synthOn(true); try { localStorage.setItem('vrc.city.radioVol', String(vol)); } catch { /* */ } onChange(state()); },
    duck(k) { if (el) el.volume = vol * k; },
    dispose() { tok++; on = false; stopEl(); synthOn(false); el = null; },
  };
}
