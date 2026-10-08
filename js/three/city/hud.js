// City Drive — the game HUD (DOM overlay): touch controls for a portrait phone, dials, radio strip, minimap with
// police blips and the route back to VILNYI RIVER CITY, settings. Black and gold like the rest of the site.
import { ROAD } from './map.js?v=3.6';

const CSS = `
.cg{position:absolute;inset:0;z-index:40;font:500 13px/1.2 Manrope,Heebo,system-ui,sans-serif;color:#f3efe6;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden}
.cg *{box-sizing:border-box}
.cg button{font:inherit;color:inherit;border:0;background:none;padding:0;margin:0;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent}
.cg-look{position:absolute;inset:0}
.cg-b{pointer-events:auto;display:flex;align-items:center;justify-content:center;background:rgba(10,10,12,.62);border:1px solid rgba(226,192,120,.42)!important;border-radius:12px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);min-width:44px;height:44px;padding:0 10px!important;font-weight:700!important;letter-spacing:.02em}
.cg-b.on{background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a;border-color:#f0d596!important}
.cg-b.red.on{background:linear-gradient(180deg,#ff6a55,#b3261e);color:#fff;border-color:#ff8a78!important}
.cg-b svg{width:20px;height:20px}
.cg-top{position:absolute;top:calc(8px + env(safe-area-inset-top,0px));inset-inline:8px;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;gap:8px}
.cg-brand{background:rgba(10,10,12,.62);border:1px solid rgba(226,192,120,.42);border-radius:10px;padding:6px 9px;max-width:56%}
.cg-brand b{display:block;font:600 11px/1.15 Manrope,Heebo,sans-serif;color:#e2c078;letter-spacing:.04em}
.cg-stars{display:flex;gap:2px;margin-top:4px;direction:ltr}
.cg-stars i{width:15px;height:15px;display:block;background:#3a3830;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.cg-stars i.on{background:#ffd34d}.cg-stars.flash i.on{animation:cgbl .5s steps(2) infinite}
@keyframes cgbl{50%{background:#7a6a2a}}
.cg-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.cg-map{pointer-events:auto;width:118px;height:118px;border-radius:14px;border:1px solid rgba(226,192,120,.55);background:#0c1014;overflow:hidden;display:block}
.cg-map.big{position:fixed;inset:auto;top:calc(60px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:min(92vw,420px);height:min(92vw,420px);z-index:5}
.cg-map canvas{width:100%;height:100%;display:block}
.cg-col{position:absolute;inset-inline-start:8px;top:calc(96px + env(safe-area-inset-top,0px));display:flex;flex-direction:column;gap:6px}
.cg-colr{position:absolute;inset-inline-end:8px;top:calc(140px + env(safe-area-inset-top,0px));display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.cg-bottom{position:absolute;inset-inline:0;bottom:calc(8px + env(safe-area-inset-bottom,0px));pointer-events:none;direction:ltr}
.cg-radio{margin:0 8px 6px;display:flex;align-items:center;gap:5px;background:rgba(10,10,12,.66);border:1px solid rgba(226,192,120,.35);border-radius:12px;padding:4px 5px;pointer-events:auto}
.cg-radio .cg-b{height:34px;min-width:34px;border-radius:9px;padding:0 6px!important}
.cg-rn{flex:1;min-width:0;text-align:center;line-height:1.15}
.cg-rn b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700;font-size:12.5px}
.cg-rn span{font-size:10.5px;color:#cdbb8f;white-space:nowrap}
.cg-mid{display:flex;align-items:flex-end;justify-content:center;gap:8px;margin-bottom:6px;padding:0 8px}
.cg-clu{background:rgba(10,10,12,.66);border:1px solid rgba(226,192,120,.42);border-radius:14px;padding:5px 12px 6px;min-width:126px;text-align:center}
.cg-spd{font:700 34px/1 Manrope,system-ui,sans-serif;letter-spacing:-.02em}
.cg-clu small{font-size:10px;color:#cdbb8f;margin-inline-start:3px}
.cg-gear{display:inline-block;min-width:20px;font-weight:800;color:#e2c078;font-size:15px;margin-inline-start:6px}
.cg-bar{height:4px;border-radius:2px;background:#2a2823;margin-top:4px;overflow:hidden}.cg-bar i{display:block;height:100%;width:0;background:#e2c078}
.cg-bar.rpm i{background:linear-gradient(90deg,#e2c078 70%,#e0483a 92%)}.cg-bar.dmg i{background:#e0483a}.cg-bar.fuel i{background:#6fb6ff}
.cg-lab{display:flex;justify-content:space-between;font-size:9px;color:#9a917c;margin-top:2px;text-transform:uppercase;letter-spacing:.06em}
.cg-ctl{display:flex;justify-content:space-between;align-items:flex-end;padding:0 8px;gap:8px}
.cg-steer{pointer-events:auto;position:relative;width:46%;max-width:210px;height:92px;border-radius:16px;background:rgba(10,10,12,.5);border:1px solid rgba(226,192,120,.42)}
.cg-steer span{position:absolute;top:50%;transform:translateY(-50%);font-size:20px;color:#e2c078;opacity:.8}.cg-steer .l{left:12px}.cg-steer .r{right:12px}
.cg-knob{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f6e2b0,#b88a3c);box-shadow:0 2px 10px rgba(0,0,0,.6);pointer-events:none}
.cg-ped{display:flex;gap:6px;align-items:flex-end;pointer-events:none}
.cg-ped .cg-b{width:66px;border-radius:14px}.cg-gas{height:118px!important;background:rgba(20,40,24,.6)}.cg-brk{height:92px!important;background:rgba(48,16,14,.6)}
.cg-ped .cg-b.on{background:linear-gradient(180deg,#f0d596,#b88a3c)}
.cg-sm{display:flex;flex-direction:column;gap:6px;pointer-events:none}
.cg-act{position:absolute;left:50%;bottom:calc(300px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
.cg-act .cg-b{background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a;padding:0 16px!important;white-space:nowrap}
.cg-toast{position:absolute;left:50%;top:calc(150px + env(safe-area-inset-top,0px));transform:translateX(-50%);background:rgba(10,10,12,.82);border:1px solid rgba(226,192,120,.5);border-radius:12px;padding:9px 14px;max-width:86%;text-align:center;opacity:0;transition:opacity .25s;pointer-events:none;font-weight:600}
.cg-toast.show{opacity:1}
.cg-ban{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.35);pointer-events:none;text-align:center;padding:20px}
.cg-ban.show{display:flex}.cg-ban h2{font:700 44px/1 "Cormorant Garamond",Georgia,serif;letter-spacing:.08em;margin:0;color:#ffd34d;text-shadow:0 2px 18px #000}.cg-ban.bad h2{color:#ff5a48}.cg-ban p{margin:10px 0 0;font-size:15px;max-width:320px;text-shadow:0 1px 8px #000}
.cg-fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .28s;pointer-events:none}.cg-fade.on{opacity:1}
.cg-pan{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);pointer-events:auto;padding:14px}
.cg-pan.show{display:flex}
.cg-card{width:min(430px,100%);max-height:92%;overflow:auto;background:#0d0d0f;border:1px solid rgba(226,192,120,.55);border-radius:16px;padding:16px;touch-action:pan-y}
.cg-card h3{font:600 22px/1.15 "Cormorant Garamond",Georgia,serif;color:#e2c078;margin:0 0 10px}
.cg-card p{color:#d8d2c4;font-weight:400;line-height:1.45;margin:0 0 12px;font-size:13.5px}
.cg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0}
.cg-seg{display:flex;gap:4px}.cg-seg .cg-b{height:36px;min-width:52px;font-size:12px}
.cg-card .cg-b.wide{width:100%;margin-top:8px}
.cg-card .cg-b.gold{background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a}
.cg-card small{display:block;color:#9a917c;line-height:1.4;margin-top:10px;font-weight:400}
.cg.foot .cg-car,.cg.car .cg-foot{display:none!important}
@media (min-width:760px){.cg-steer{display:none}.cg-ped{display:none}.cg-act{bottom:210px}.cg-map{width:170px;height:170px}}
@media (max-height:520px){.cg-radio{display:none}.cg-act{bottom:150px}}
`;
const IC = {
  view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  lights: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M11.5 5.5C7 5.5 5 8.6 5 12s2 6.5 6.5 6.5c1.6 0 2.5-2.9 2.5-6.5s-.9-6.5-2.5-6.5z"/><path d="M17 8.5l4 1M17 12h4M17 15.5l4-1"/></svg>',
  high: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M11.5 5.5C7 5.5 5 8.6 5 12s2 6.5 6.5 6.5c1.6 0 2.5-2.9 2.5-6.5s-.9-6.5-2.5-6.5z"/><path d="M17 7h4M17 10.3h4M17 13.7h4M17 17h4"/></svg>',
  wipers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2.5 15a14 14 0 0 1 19 0"/><path d="M12 19L6.5 8.5"/><circle cx="12" cy="19" r="1.3"/></svg>',
  horn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10v4h3l6 4V6l-6 4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19"/></svg>',
  pw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.5 6.5a8 8 0 1 0 11 0"/></svg>',
};
export function createHud(container, { t, dir = 'ltr', lang = 'en', settings, onAction }) {
  if (!document.getElementById('cg-css')) { const s = document.createElement('style'); s.id = 'cg-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.className = 'cg car'; root.dir = dir; root.lang = lang;
  root.innerHTML = `
  <div class="cg-look"></div>
  <div class="cg-top">
    <div class="cg-brand"><b>${t('label')}</b><div class="cg-stars" role="img" aria-label="${t('wanted')}"><i></i><i></i><i></i><i></i><i></i></div></div>
    <div class="cg-right"><button class="cg-map" data-a="map" aria-label="${t('map')}"><canvas width="236" height="236"></canvas></button></div>
  </div>
  <div class="cg-col">
    <button class="cg-b cg-car" data-a="view" aria-label="${t('view')}">${IC.view}</button>
    <button class="cg-b cg-car" data-a="lights" aria-label="${t('lights')}">${IC.lights}</button>
    <button class="cg-b cg-car" data-a="high" aria-label="${t('high')}">${IC.high}</button>
    <button class="cg-b cg-car" data-a="wipers" aria-label="${t('wipers')}">${IC.wipers}</button>
  </div>
  <div class="cg-colr">
    <button class="cg-b" data-a="settings" aria-label="${t('settings')}">${IC.gear}</button>
    <button class="cg-b" data-a="time" aria-label="${t('day')}">${IC.sun}</button>
    <button class="cg-b" data-a="exit" aria-label="${t('garage')}">${IC.home}</button>
  </div>
  <div class="cg-act"></div>
  <div class="cg-toast" role="status"></div>
  <div class="cg-bottom">
    <div class="cg-radio cg-car"><button class="cg-b" data-a="rprev" aria-label="${t('prev')}">⏮</button><div class="cg-rn"><b></b><span></span></div><button class="cg-b" data-a="rnext" aria-label="${t('next')}">⏭</button><button class="cg-b" data-a="rvol-" aria-label="${t('vol')} −">−</button><button class="cg-b" data-a="rvol+" aria-label="${t('vol')} +">+</button><button class="cg-b" data-a="rpower" aria-label="${t('radio')}">${IC.pw}</button></div>
    <div class="cg-mid cg-car"><button class="cg-b" data-a="indL" aria-label="${t('ind')} ←">◀</button>
      <div class="cg-clu"><div><span class="cg-spd">0</span><small>km/h</small><span class="cg-gear">P</span></div><div class="cg-bar rpm"><i></i></div><div class="cg-lab"><span>${t('dmg')}</span><span>${t('fuel')}</span></div><div style="display:flex;gap:6px"><div class="cg-bar dmg" style="flex:1"><i></i></div><div class="cg-bar fuel" style="flex:1"><i></i></div></div></div>
      <button class="cg-b" data-a="indR" aria-label="${t('ind')} →">▶</button></div>
    <div class="cg-ctl">
      <div class="cg-steer" data-p="steer" aria-label="${t('steer')}"><span class="l">◀</span><i class="cg-knob"></i><span class="r">▶</span></div>
      <div class="cg-sm"><button class="cg-b cg-car" data-p="horn" aria-label="${t('horn')}">${IC.horn}</button><button class="cg-b cg-car red" data-a="hand" aria-label="${t('hand')}">(P)</button><button class="cg-b cg-car" data-a="start" style="font-size:10px">${t('start')}</button></div>
      <div class="cg-ped"><button class="cg-b cg-brk" data-p="brake" aria-label="${t('brake')}">▼</button><button class="cg-b cg-gas" data-p="gas" aria-label="${t('gas')}">▲</button></div>
    </div>
  </div>
  <div class="cg-ban"><h2></h2><p></p></div>
  <div class="cg-pan"><div class="cg-card"></div></div>
  <div class="cg-fade"></div>`;
  container.appendChild(root);
  const q = s => root.querySelector(s), el = { stars: q('.cg-stars'), spd: q('.cg-spd'), gear: q('.cg-gear'), rpm: q('.cg-bar.rpm i'), dmg: q('.cg-bar.dmg i'), fuel: q('.cg-bar.fuel i'), act: q('.cg-act'), toast: q('.cg-toast'), ban: q('.cg-ban'), pan: q('.cg-pan'), card: q('.cg-card'), fade: q('.cg-fade'), map: q('.cg-map'), cv: q('.cg-map canvas'), rn: q('.cg-rn b'), rs: q('.cg-rn span'), knob: q('.cg-knob'), look: q('.cg-look') };
  const pad = { gas: 0, brake: 0, steer: 0, horn: 0 }, look = { dx: 0, dy: 0, drag: false };
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  // hold pads
  root.querySelectorAll('button[data-p]').forEach(b => {
    const k = b.dataset.p, on = e => { stop(e); try { b.setPointerCapture(e.pointerId); } catch { /* */ } pad[k] = 1; b.classList.add('on'); if (k === 'horn') onAction('hornDown'); }, off = e => { stop(e); pad[k] = 0; b.classList.remove('on'); if (k === 'horn') onAction('hornUp'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  });
  { const sp = q('.cg-steer'); let id = null;
    const mv = e => { if (e.pointerId !== id) return; stop(e); const r = sp.getBoundingClientRect(), k = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 26))); pad.steer = -Math.sign(k) * Math.pow(Math.abs(k), 1.25); el.knob.style.transform = `translateX(${(k * (r.width / 2 - 30)).toFixed(1)}px)`; };
    sp.addEventListener('pointerdown', e => { id = e.pointerId; try { sp.setPointerCapture(id); } catch { /* */ } mv(e); });
    sp.addEventListener('pointermove', mv);
    const end = e => { if (e.pointerId !== id) return; id = null; pad.steer = 0; el.knob.style.transform = ''; }; sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end); sp.addEventListener('lostpointercapture', end); }
  // look by dragging on the free area
  { let id = null, lx = 0, ly = 0, t0 = 0, moved = 0;
    el.look.addEventListener('pointerdown', e => { id = e.pointerId; lx = e.clientX; ly = e.clientY; t0 = performance.now(); moved = 0; look.drag = true; try { el.look.setPointerCapture(id); } catch { /* */ } stop(e); });
    el.look.addEventListener('pointermove', e => { if (e.pointerId !== id) return; look.dx += e.clientX - lx; look.dy += e.clientY - ly; moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly); lx = e.clientX; ly = e.clientY; stop(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; look.drag = false; if (moved < 8 && performance.now() - t0 < 350) onAction('tap', { x: e.clientX, y: e.clientY }); }; el.look.addEventListener('pointerup', end); el.look.addEventListener('pointercancel', end); }
  root.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b || !root.contains(b)) return; e.stopPropagation(); onAction(b.dataset.a, b.dataset.v); });
  for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick', 'wheel', 'contextmenu']) root.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault(); });
  let toastT = 0, last = {}, acts = '';
  const setCls = (sel, on) => { const b = q(sel); if (b) b.classList.toggle('on', !!on); };
  function set(s) {
    if (s.kmh !== last.kmh) el.spd.textContent = String(s.kmh);
    if (s.gear !== last.gear) el.gear.textContent = s.gear;
    el.rpm.style.width = (s.rpm * 100).toFixed(0) + '%'; el.dmg.style.width = s.dmg.toFixed(0) + '%'; el.fuel.style.width = (s.fuel * 100).toFixed(0) + '%';
    if (s.stars !== last.stars) el.stars.querySelectorAll('i').forEach((i, k) => i.classList.toggle('on', k < s.stars));
    el.stars.classList.toggle('flash', !!s.hiding);
    if (s.onFoot !== last.onFoot) { root.classList.toggle('foot', !!s.onFoot); root.classList.toggle('car', !s.onFoot); }
    setCls('[data-a=lights]', s.lights); setCls('[data-a=high]', s.high); setCls('[data-a=wipers]', s.wipers); setCls('[data-a=indL]', s.indL); setCls('[data-a=indR]', s.indR); setCls('[data-a=hand]', s.hb); setCls('[data-a=rpower]', s.radio && s.radio.on); setCls('[data-a=start]', s.engine);
    const st = q('[data-a=start]'); if (st && s.engine !== last.engine) st.textContent = s.engine ? t('stop') : t('start');
    if (s.radio) { const r = s.radio, nm = r.on ? r.name : t('rOff'), sb = r.on ? r.freq + ' FM · ' + (r.status === 'live' ? t('rLive') : r.status === 'synth' ? t('rSynth') : t('rTune')) : '—'; if (el.rn.textContent !== nm) el.rn.textContent = nm; if (el.rs.textContent !== sb) el.rs.textContent = sb; }
    const a = (s.actions || []).join('|'); if (a !== acts) { acts = a; el.act.innerHTML = (s.actions || []).map(k => `<button class="cg-b" data-a="${k}">${t(k)}</button>`).join(''); }
    last = { kmh: s.kmh, gear: s.gear, stars: s.stars, onFoot: s.onFoot, engine: s.engine };
  }
  function toast(msg, ms = 2200) { el.toast.textContent = msg; el.toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('show'), ms); }
  function banner(title, sub = '', bad = false) { el.ban.classList.toggle('show', !!title); el.ban.classList.toggle('bad', bad); el.ban.querySelector('h2').textContent = title || ''; el.ban.querySelector('p').textContent = sub; }
  function fade(on) { el.fade.classList.toggle('on', !!on); return new Promise(r => setTimeout(r, 300)); }
  function panel(html) { el.pan.classList.toggle('show', !!html); el.card.innerHTML = html || ''; }
  function showSettings(time) {
    const seg = (a, opts, cur) => `<div class="cg-seg">${opts.map(([v, l]) => `<button class="cg-b${String(cur) === String(v) ? ' on' : ''}" data-a="${a}" data-v="${v}">${l}</button>`).join('')}</div>`;
    panel(`<h3>${t('settings')}</h3>
      <div class="cg-row"><span>${t('violence')}</span>${seg('setViolence', [[1, t('on')], [0, t('off')]], settings.violence ? 1 : 0)}</div>
      <div class="cg-row"><span>${t('traffic')}</span>${seg('setTraffic', [[1, t('low')], [2, t('med')], [3, t('hi')]], settings.traffic)}</div>
      <div class="cg-row"><span>${t('sound')}</span>${seg('setSound', [[1, t('on')], [0, t('off')]], settings.sound ? 1 : 0)}</div>
      <div class="cg-row"><span>${t('day')} / ${t('night')}</span>${seg('setTime', [['day', t('day')], ['dusk', t('dusk')], ['night', t('night')]], time)}</div>
      <button class="cg-b wide" data-a="repair">${t('repair')}</button><button class="cg-b wide" data-a="tow">${t('tow')}</button><button class="cg-b wide" data-a="exit">${t('garage')}</button>
      <button class="cg-b wide gold" data-a="closePanel">${t('close')}</button>
      <small>${t('help')}</small><small>${t('about')}</small>`);
  }
  // ---- minimap (heading-up): streets, lake, police blips, the route home
  const mctx = el.cv.getContext('2d'); let big = false;
  function drawMap(g, W, H, D) {   // D: {map, x, z, yaw, range, route:[node ids], police:[{x,z,amb}], time, heading:true}
    const { map, x, z, yaw } = D, k = W / (2 * D.range), c = Math.cos(yaw), s = Math.sin(yaw);
    // world → screen: forward (sin yaw, cos yaw) is up
    const X = (wx, wz) => W / 2 - ((wx - x) * c - (wz - z) * s) * k, Y = (wx, wz) => H / 2 - ((wx - x) * s + (wz - z) * c) * k;
    g.fillStyle = '#12171c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b3f5a'; g.beginPath(); map.lake.forEach(([wx, wz], i) => (i ? g.lineTo(X(wx, wz), Y(wx, wz)) : g.moveTo(X(wx, wz), Y(wx, wz)))); g.closePath(); g.fill();
    g.fillStyle = '#2a2a22'; g.beginPath(); map.site.plot.forEach(([wx, wz], i) => (i ? g.lineTo(X(wx, wz), Y(wx, wz)) : g.moveTo(X(wx, wz), Y(wx, wz)))); g.closePath(); g.fill();
    g.fillStyle = '#c9a659'; for (const b of map.site.vrc) { g.beginPath(); [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([a, q2], i) => { const wx = b.x + b.ux * a * b.hw - b.uz * q2 * b.hd, wz = b.z + b.uz * a * b.hw + b.ux * q2 * b.hd; i ? g.lineTo(X(wx, wz), Y(wx, wz)) : g.moveTo(X(wx, wz), Y(wx, wz)); }); g.closePath(); g.fill(); }
    const r = D.range * 1.5, seen = new Set(); g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) for (let i = Math.floor((x - r) / 128); i <= Math.floor((x + r) / 128); i++) for (let j = Math.floor((z - r) / 128); j <= Math.floor((z + r) / 128); j++) {
      const cell = map.cells.get(i + ',' + j); if (!cell) continue;
      for (const e of cell.edges) { if ((e.cls >= 2) !== (pass === 1)) continue; const key = e.id * 2 + pass; if (seen.has(key)) continue; seen.add(key); const a = map.nodes[e.a], b = map.nodes[e.b];
        g.strokeStyle = e.cls >= 3 ? '#8b93a0' : e.cls === 2 ? '#6d7580' : '#4b525b'; g.lineWidth = Math.max(1.2, e.hw * 2 * k); g.beginPath(); g.moveTo(X(a.x, a.z), Y(a.x, a.z)); g.lineTo(X(b.x, b.z), Y(b.x, b.z)); g.stroke(); }
    }
    if (D.route && D.route.length > 1) { g.strokeStyle = '#e2c078'; g.lineWidth = Math.max(2.5, 5 * k); g.setLineDash([6, 5]); g.beginPath(); g.moveTo(W / 2, H / 2); for (const id of D.route) { const n = map.nodes[id]; g.lineTo(X(n.x, n.z), Y(n.x, n.z)); } g.stroke(); g.setLineDash([]); }
    // home marker (clamped to the rim when off the map)
    { const G0 = map.site.garage; let hx = X(G0.x, G0.z), hy = Y(G0.x, G0.z); const dx = hx - W / 2, dy = hy - H / 2, m = Math.max(Math.abs(dx) / (W / 2 - 10), Math.abs(dy) / (H / 2 - 10)); if (m > 1) { hx = W / 2 + dx / m; hy = H / 2 + dy / m; }
      g.fillStyle = '#e2c078'; g.strokeStyle = '#14100a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx, hy - 8); g.lineTo(hx + 7, hy - 1); g.lineTo(hx + 5, hy + 7); g.lineTo(hx - 5, hy + 7); g.lineTo(hx - 7, hy - 1); g.closePath(); g.fill(); g.stroke(); }
    if (big) { g.font = '600 11px Manrope, Arial, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#d8d2c4'; for (const p of map.pois) { if (p.kind === 'home') continue; const px = X(p.x, p.z), py = Y(p.x, p.z); if (px < 0 || py < 0 || px > W || py > H) continue; g.beginPath(); g.arc(px, py, 2.5, 0, 7); g.fill(); g.fillText(D.label(p), px, py - 6); } }
    for (const p of D.police || []) { const px = X(p.x, p.z), py = Y(p.x, p.z); g.fillStyle = p.amb ? '#ff5a48' : (Math.floor(D.time * 5) % 2 ? '#4f8dff' : '#ff4040'); g.beginPath(); g.arc(Math.max(6, Math.min(W - 6, px)), Math.max(6, Math.min(H - 6, py)), 5, 0, 7); g.fill(); }
    g.fillStyle = '#ffffff'; g.strokeStyle = '#14100a'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, H / 2 - 9); g.lineTo(W / 2 + 6.5, H / 2 + 7); g.lineTo(W / 2, H / 2 + 3); g.lineTo(W / 2 - 6.5, H / 2 + 7); g.closePath(); g.fill(); g.stroke();
  }
  return {
    root, pad, look, set, toast, banner, fade, panel, showSettings, drawMap, mapCtx: mctx,
    miniMap(D) { const W = el.cv.width, H = el.cv.height; D.range = big ? 620 : 150; mctx.setTransform(1, 0, 0, 1, 0, 0); drawMap(mctx, W, H, D); },
    toggleMap() { big = !big; el.map.classList.toggle('big', big); const px = big ? 720 : 236; el.cv.width = el.cv.height = px; return big; },
    get panelOpen() { return el.pan.classList.contains('show'); },
    dispose() { clearTimeout(toastT); root.remove(); },
  };
}
