// Glue between the apartment walkthrough (walk.js) and the City Drive game mode. Loaded lazily the first time the
// −1 car park is on screen; the game itself (city/index.js and friends) is only fetched after the visitor opts in.
// Without that opt-in nothing here changes the tour except the working exit gate of the car park.
import * as THREE from 'three';
import { createParkingGate } from './gate.js?v=3.13';
import { cityT, cityDir } from './i18n.js?v=3.13';

const CSS = `.cgh-chip{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(214px + env(safe-area-inset-bottom,0px));z-index:6;display:none;align-items:center;gap:8px;padding:0 16px;height:44px;border-radius:22px;border:1px solid #f0d596;background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a;font:700 13.5px/1 Manrope,Heebo,system-ui,sans-serif;white-space:nowrap;cursor:pointer;pointer-events:auto;box-shadow:0 4px 18px rgba(0,0,0,.5)}
.cgh-chip.show{display:flex}.cgh-chip.near{animation:cghp 1.4s ease-in-out infinite}@keyframes cghp{50%{box-shadow:0 0 0 7px rgba(240,213,150,.28),0 4px 18px rgba(0,0,0,.5)}}
.cgh-ov{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:16px;pointer-events:auto}
.cgh-card{width:min(430px,100%);background:#0d0d0f;border:1px solid rgba(226,192,120,.6);border-radius:16px;padding:18px;color:#f3efe6;font:400 14px/1.5 Manrope,Heebo,system-ui,sans-serif}
.cgh-card h3{font:600 24px/1.15 "Cormorant Garamond",Georgia,serif;color:#e2c078;margin:0 0 4px}.cgh-card em{display:block;font-style:normal;font-size:11px;letter-spacing:.08em;color:#cdbb8f;margin-bottom:10px}
.cgh-card p{margin:0 0 14px;color:#d8d2c4}.cgh-card b.age{display:inline-block;border:1.5px solid #e2c078;color:#e2c078;border-radius:8px;padding:2px 8px;font-size:13px;margin-inline-end:8px}
.cgh-card button{display:block;width:100%;height:46px;border-radius:12px;font:700 14px/1 Manrope,Heebo,system-ui,sans-serif;cursor:pointer;margin-top:8px}
.cgh-go{background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a;border:0}.cgh-no{background:none;color:#f3efe6;border:1px solid rgba(226,192,120,.45)}
.cgh-load{position:absolute;inset:0;z-index:59;display:flex;align-items:center;justify-content:center;background:#000;color:#e2c078;font:600 15px Manrope,Heebo,system-ui,sans-serif;letter-spacing:.06em}`;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function createCityHook(walk) {
  let gate = null, gateFor = null, game = null, busy = false, chip = null, hudDisp = null, disposed = false;
  const t = k => cityT(walk.lang)(k), root = walk.root;
  if (!document.getElementById('cgh-css')) { const s = document.createElement('style'); s.id = 'cgh-css'; s.textContent = CSS; document.head.appendChild(s); }
  function ensureChip() {
    if (chip) return chip; chip = document.createElement('button'); chip.className = 'cgh-chip'; chip.type = 'button';
    chip.addEventListener('click', ev => { ev.stopPropagation(); start(); }); for (const n of ['pointerdown', 'pointerup', 'touchstart']) chip.addEventListener(n, ev => ev.stopPropagation());
    root.appendChild(chip); return chip;
  }
  function gateSound(kind) { try { const ac = walk._audio && walk._audio(); if (!ac || (walk._soundOn && !walk._soundOn())) return; const tt = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(kind === 'opening' ? 62 : 54, tt); lp.type = 'lowpass'; lp.frequency.value = 420; g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.035, tt + 0.15); g.gain.setValueAtTime(0.035, tt + 2.0); g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.5); o.connect(lp).connect(g).connect(ac.destination); o.start(tt); o.stop(tt + 2.6); } catch { /* optional */ } }
  function syncGate() {
    const c = walk.commons, has = !!(c && Array.isArray(c.parkedCars) && c.parkedCars.length);
    if (has && gateFor !== c) {
      dropGate(); gate = createParkingGate({ onSound: gateSound }); gateFor = c; walk.scene.add(gate.group); walk._register(gate.group, 'gate', true);
    } else if (!has && gate) dropGate();
  }
  function dropGate() { if (!gate) return; try { walk._unregister('gate'); } catch { /* */ } gate.dispose(); gate = null; gateFor = null; }
  function notice() {
    return new Promise(res => {
      const ov = document.createElement('div'); ov.className = 'cgh-ov'; ov.dir = cityDir(walk.lang); ov.lang = String(walk.lang || 'en').slice(0, 2);
      ov.innerHTML = `<div class="cgh-card" role="dialog" aria-modal="true"><h3></h3><em></em><p></p><button class="cgh-go"></button><button class="cgh-no"></button></div>`;
      ov.querySelector('h3').textContent = t('title'); ov.querySelector('em').textContent = t('label');
      const p = ov.querySelector('p'); const age = document.createElement('b'); age.className = 'age'; age.textContent = '16+'; p.appendChild(age); p.appendChild(document.createTextNode(t('notice')));
      const go = ov.querySelector('.cgh-go'), no = ov.querySelector('.cgh-no'); go.textContent = t('ok'); no.textContent = t('cancel');
      const done = v => { ov.remove(); res(v); };
      go.addEventListener('click', () => done(true)); no.addEventListener('click', () => done(false));
      for (const n of ['pointerdown', 'pointerup', 'touchstart', 'click', 'dblclick', 'wheel']) ov.addEventListener(n, ev => ev.stopPropagation());
      root.appendChild(ov);
    });
  }
  // The explicit opt-in: chip → (first time) notice in the site language → the game takes the screen.
  async function start(opts = {}) {
    if (busy || game || disposed) return; busy = true;
    try {
      if (lsGet('vrc.city.ok') !== '1') { if (!(await notice())) return; lsSet('vrc.city.ok', '1'); }
      const load = document.createElement('div'); load.className = 'cgh-load'; load.textContent = t('loading'); root.appendChild(load);
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
      try {
        const D = walk.drive, rec = D && D.rec;
        try { walk._engineStop && walk._engineStop(); if (D) D.pad.gas = D.pad.brake = D.pad.steer = 0; walk.keys && walk.keys.clear(); } catch { /* */ }
        const m = await import('./index.js?v=3.13');
        const g = await m.startCityDrive({
          renderer: walk.renderer, container: root, lang: walk.lang, envMap: walk.scene.environment || null, timeMode: walk.envMode || 'day',
          car: rec ? { kind: rec.kind, colour: rec.colour, seed: (String(rec.id).split(':').pop() | 0) % 53 + 3 } : {},
          getAudioContext: () => (walk._audio ? walk._audio() : null), gesture: true, onExit: () => stop(),
          startId: opts.startId || null, chooser: opts.startId ? false : undefined,
        });
        if (disposed) { g.dispose(); return; }
        hudDisp = walk.el && walk.el.hud ? walk.el.hud.style.display : null; if (walk.el && walk.el.hud) walk.el.hud.style.display = 'none';
        if (chip) chip.classList.remove('show');
        game = g; document.documentElement.classList.add('game-open');   // version-check.js never reloads during a game
      } catch (e) { console.warn('[city] could not start', e); }
      load.remove();
    } finally { busy = false; }
  }
  function stop() {
    const g = game; game = null; document.documentElement.classList.remove('game-open'); if (!g) return;
    try { g.dispose(); } catch (e) { console.warn('[city] dispose', e); }
    if (walk.el && walk.el.hud) walk.el.hud.style.display = hudDisp || '';
    try { walk.renderer.setRenderTarget(null); walk.renderer.setScissorTest(false); walk.clock && walk.clock.getDelta(); walk.keys && walk.keys.clear(); if (walk.setTimeMode && walk.envMode) walk.setTimeMode(walk.envMode); if (walk._renderDriveHud) walk._renderDriveHud(true); } catch (e) { console.warn('[city] restore', e); }
  }
  const pts = [];
  return {
    get active() { return !!game; }, get gate() { return gate; }, start, stop,
    // called once per frame by walk.js; true = the game drew this frame
    frame(dt) {
      if (game) { if (game.active) { game.frame(dt); return true; } stop(); return false; }
      syncGate();
      const D = walk.drive, P = walk.player && walk.player.pos;
      if (gate) {
        pts.length = 0; const y = D ? D.ctl.y : P ? P.y : 9;
        if (y < -0.4) pts.push(D ? { x: D.ctl.x, z: D.ctl.z } : { x: P.x, z: P.z });
        gate.update(dt, pts);
      }
      // the opt-in chip: only while driving a car on the −1 level; it pulses at the gate
      const show = !!(D && !D.anim && D.ctl.y < -1.2 && gate && !busy && !walk.busy);
      if (show || chip) { const c = ensureChip(); c.classList.toggle('show', show); if (show) { const txt = t('chip'); if (c.textContent !== txt) c.textContent = txt; const Z = gate.zone; c.classList.toggle('near', Math.abs(D.ctl.x - Z.cx) < 7 && D.ctl.z < Z.zGate + 16); } }
      return false;
    },
    tapGate() { if (gate) gate.tap(); },
    dispose() { disposed = true; if (game) stop(); document.documentElement.classList.remove('game-open'); dropGate(); if (chip) chip.remove(); chip = null; },
  };
}
void THREE;
