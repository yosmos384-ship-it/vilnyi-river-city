// City Drive — the game HUD (DOM overlay). Rule since v3.7: nothing sits over the windscreen. In the car the controls live
// at the edges and on the lower band of the screen (over the dashboard): thin steering and pedal pads in the bottom
// corners, a small speed readout between them, one narrow column of view / light buttons at the inline-end edge (folds
// away while driving, back on a tap), the parked-car menu as one button at the inline-start edge (only when stopped),
// a hold-to-look-back button, a small translucent minimap in the top corner. The radio is a box in the other top corner
// (station down / up, the station name opens a short list, a swipe on the name changes station); the car's centre screen
// opens the same list. Black and gold like the rest of the site, RTL-aware.
const CSS = `
.cg{position:absolute;inset:0;z-index:40;font:500 13px/1.2 Manrope,Heebo,system-ui,sans-serif;color:#f3efe6;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden}
.cg *{box-sizing:border-box}
.cg button{font:inherit;color:inherit;border:0;background:none;padding:0;margin:0;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent}
.cg-look{position:absolute;inset:0}
.cg-b{pointer-events:auto;display:flex;align-items:center;justify-content:center;background:rgba(10,10,12,.46);border:1px solid rgba(226,192,120,.34)!important;border-radius:11px;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);width:40px;height:40px;font-weight:700!important;letter-spacing:.02em;transition:opacity .25s,transform .25s}
.cg-b.on{background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a;border-color:#f0d596!important}
.cg-b.red.on{background:linear-gradient(180deg,#ff6a55,#b3261e);color:#fff;border-color:#ff8a78!important}
.cg-b svg{width:19px;height:19px}
.cg-tl{position:absolute;top:calc(60px + env(safe-area-inset-top,0px));inset-inline-start:8px;max-width:64px;pointer-events:none}
.cg-brand{background:rgba(10,10,12,.42);border:1px solid rgba(226,192,120,.3);border-radius:9px;padding:4px 6px}
.cg-brand b{display:block;font:700 9px/1.15 Manrope,Heebo,sans-serif;color:#e2c078;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cg-brand span{display:block;font:600 8.5px/1.15 Manrope,Heebo,sans-serif;color:#cdbb8f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cg-stars{display:none;gap:1px;margin-top:3px;direction:ltr}.cg-stars.any{display:flex}
.cg-stars i{width:11px;height:11px;display:block;background:#3a3830;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.cg-stars i.on{background:#ffd34d}.cg-stars.flash i.on{animation:cgbl .5s steps(2) infinite}
@keyframes cgbl{50%{background:#7a6a2a}}
.cg-tr{position:absolute;top:calc(8px + env(safe-area-inset-top,0px));inset-inline-end:8px;pointer-events:none}
.cg-map{pointer-events:auto;width:70px;height:70px;border-radius:12px;border:1px solid rgba(226,192,120,.45);background:rgba(12,16,20,.5);overflow:hidden;display:block;opacity:.86}
.cg-map.big{position:fixed;inset:auto;top:calc(56px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:min(92vw,420px);height:min(92vw,420px);z-index:5;opacity:1}
.cg-map canvas{width:100%;height:100%;display:block}
.cg-colE{position:absolute;inset-inline-end:8px;top:calc(86px + env(safe-area-inset-top,0px));display:flex;flex-direction:column;gap:5px;pointer-events:none}
.cg-colS{position:absolute;inset-inline-start:8px;top:calc(118px + env(safe-area-inset-top,0px));display:flex;flex-direction:column;gap:5px;pointer-events:none}
.cg-sec{opacity:1}
.cg.drive:not(.reveal) .cg-sec{opacity:0;transform:scale(.6);pointer-events:none!important}
.cg-more{display:none!important}.cg.drive:not(.reveal) .cg-more{display:flex!important}
.cg-menu{position:absolute;inset-inline-start:52px;top:0;display:none;flex-direction:column;gap:5px;pointer-events:none}
.cg-menu.show{display:flex}
.cg-menu .cg-b{width:auto;min-width:0;padding:0 12px!important;height:36px;white-space:nowrap;font-size:12.5px;background:rgba(10,10,12,.72)}
.cg-menu .cg-b.gold{background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a}
.cg-bottom{position:absolute;inset-inline:0;bottom:calc(8px + env(safe-area-inset-bottom,0px));pointer-events:none;direction:ltr;display:flex;justify-content:space-between;align-items:flex-end;padding:0 8px;gap:6px}
.cg-steer{pointer-events:auto;position:relative;width:38%;max-width:220px;height:58px;border-radius:14px;background:rgba(10,10,12,.28);border:1px solid rgba(226,192,120,.3)}
.cg-steer span{position:absolute;top:50%;transform:translateY(-50%);font-size:15px;color:#e2c078;opacity:.7}.cg-steer .l{left:9px}.cg-steer .r{right:9px}
.cg-knob{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(246,226,176,.9),rgba(184,138,60,.85));box-shadow:0 2px 8px rgba(0,0,0,.5);pointer-events:none}
.cg-mid{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}
.cg-row{display:flex;gap:4px;pointer-events:none;justify-content:center}
.cg-row .cg-b{width:34px;height:32px;border-radius:9px;font-size:10px}
.cg-clu{background:rgba(10,10,12,.42);border:1px solid rgba(226,192,120,.3);border-radius:11px;padding:3px 8px 4px;min-width:74px;text-align:center;pointer-events:none}
.cg-spd{font:700 21px/1 Manrope,system-ui,sans-serif;letter-spacing:-.02em}
.cg-clu small{font-size:9px;color:#cdbb8f;margin-inline-start:2px}
.cg-gear{display:inline-block;min-width:16px;font-weight:800;color:#e2c078;font-size:12px;margin-inline-start:4px}
.cg-bars{display:flex;gap:4px;margin-top:3px}.cg-bar{flex:1;height:3px;border-radius:2px;background:#2a2823;overflow:hidden}.cg-bar i{display:block;height:100%;width:0;background:#e2c078}
.cg-bar.dmg i{background:#e0483a}.cg-bar.fuel i{background:#6fb6ff}
.cg-ped{display:flex;gap:5px;align-items:flex-end;pointer-events:none}
.cg-ped .cg-b{width:50px;border-radius:13px;background:rgba(10,10,12,.28)}.cg-gas{height:80px!important;background:rgba(20,40,24,.32)!important}.cg-brk{height:58px!important;background:rgba(48,16,14,.32)!important}
.cg-ped .cg-b.on{background:linear-gradient(180deg,#f0d596,#b88a3c)!important}
.cg-foot-act{display:flex;gap:6px;pointer-events:none}.cg-foot-act .cg-b{width:auto;padding:0 14px!important;height:38px;background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a;white-space:nowrap}
.cg-rbox{position:absolute;top:calc(8px + env(safe-area-inset-top,0px));left:60px;right:auto;width:min(176px,44vw);display:flex;align-items:stretch;gap:3px;padding:3px;background:rgba(10,10,12,.66);border:1px solid rgba(226,192,120,.42);border-radius:12px;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);pointer-events:auto;direction:ltr;touch-action:none}
.cg-rbox .cg-rb{width:26px;min-width:26px;height:44px;border-radius:9px;font-size:18px;line-height:1;color:#e2c078;background:rgba(226,192,120,.1)}
.cg-rmid{flex:1;min-width:0;height:44px;border-radius:9px;padding:2px 3px;text-align:center;display:flex;flex-direction:column;justify-content:center;line-height:1.15}
.cg-rmid .cg-rf{display:block;font:700 13px/1.1 Manrope,system-ui,sans-serif;color:#f3efe6;font-variant-numeric:tabular-nums;white-space:nowrap}
.cg-rmid .cg-rnm{display:block;font:600 10px/1.2 Manrope,Heebo,system-ui,sans-serif;color:#cdbb8f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.cg[dir=rtl] .cg-rbox{left:auto;right:60px}
.cg[dir=rtl] .cg-rlist{left:auto;right:76px}
.cg-rlist{position:absolute;top:calc(60px + env(safe-area-inset-top,0px));left:76px;right:auto;width:min(176px,44vw);max-height:44vh;overflow-y:auto;display:none;flex-direction:column;gap:3px;padding:4px;background:rgba(10,10,12,.92);border:1px solid rgba(226,192,120,.5);border-radius:12px;pointer-events:auto;direction:ltr;touch-action:pan-y}
.cg-rlist.show{display:flex}
.cg-rlist button{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;min-height:34px;padding:5px 8px;border-radius:8px;font-size:11.5px;text-align:start;color:#f3efe6}
.cg-rlist button b{font-variant-numeric:tabular-nums;color:#e2c078;flex-shrink:0}
.cg-rlist button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.cg-rlist button.on{background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a}
.cg-rlist button.on b{color:#14100a}
.cg-rlist .cg-rvol{display:flex;gap:4px;justify-content:space-between;align-items:center;padding-top:2px;border-top:1px solid rgba(226,192,120,.25)}
.cg-rlist .cg-rvol button{width:auto;min-width:40px;justify-content:center;min-height:30px;background:rgba(226,192,120,.12);border:1px solid rgba(226,192,120,.34)}
.cg-toast{position:absolute;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:rgba(10,10,12,.8);border:1px solid rgba(226,192,120,.5);border-radius:12px;padding:8px 13px;max-width:78%;text-align:center;opacity:0;transition:opacity .25s;pointer-events:none;font-weight:600;font-size:12.5px}
.cg-toast.show{opacity:1}
.cg-ban{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.35);pointer-events:none;text-align:center;padding:20px}
.cg-ban.show{display:flex}.cg-ban h2{font:700 44px/1 "Cormorant Garamond",Georgia,serif;letter-spacing:.08em;margin:0;color:#ffd34d;text-shadow:0 2px 18px #000}.cg-ban.bad h2{color:#ff5a48}.cg-ban p{margin:10px 0 0;font-size:15px;max-width:320px;text-shadow:0 1px 8px #000}
.cg-fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .28s;pointer-events:none}.cg-fade.on{opacity:1}
.cg-pan{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);pointer-events:auto;padding:14px}
.cg-pan.show{display:flex}
.cg-card{width:min(430px,100%);max-height:92%;overflow:auto;background:#0d0d0f;border:1px solid rgba(226,192,120,.55);border-radius:16px;padding:16px;touch-action:pan-y}
.cg-card h3{font:600 22px/1.15 "Cormorant Garamond",Georgia,serif;color:#e2c078;margin:0 0 10px}
.cg-card p{color:#d8d2c4;font-weight:400;line-height:1.45;margin:0 0 12px;font-size:13.5px}
.cg-card .cg-rw{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0}
.cg-seg{display:flex;gap:4px}.cg-seg .cg-b{height:36px;width:auto;min-width:52px;padding:0 8px!important;font-size:12px}
.cg-card .cg-b{width:auto}
.cg-card .cg-b.wide{width:100%;margin-top:8px;height:42px}
.cg-card .cg-b.gold{background:linear-gradient(180deg,#f0d596,#b88a3c);color:#14100a}
.cg-card small{display:block;color:#9a917c;line-height:1.4;margin-top:10px;font-weight:400}
.cg-st{display:flex;flex-direction:column;align-items:flex-start;text-align:start;width:100%!important;height:auto!important;padding:10px 12px!important;margin-top:8px;gap:2px}
.cg-st b{font-size:14px}.cg-st span{font-size:11.5px;font-weight:500;color:#cdbb8f}.cg-st.gold span{color:#3a2a10}
.cg-st.cur{outline:2px solid #e2c078;outline-offset:1px}
.cg.foot .cg-car,.cg.car .cg-foot{display:none!important}
.cg-osm{position:absolute;inset-inline-end:2px;bottom:1px;font:500 6.5px/1 Manrope,Arial,sans-serif;color:rgba(230,226,214,.7);pointer-events:none;direction:ltr}
.cg-map.big+.cg-osm{display:none}
@media (min-width:760px){.cg-map{width:120px;height:120px}.cg-tl{max-width:150px}.cg-brand b{font-size:11px}.cg-brand span{font-size:10px}.cg-colE{top:calc(140px + env(safe-area-inset-top,0px))}}
@media (max-width:380px){.cg-map{width:62px;height:62px}.cg-colE{top:calc(78px + env(safe-area-inset-top,0px))}}
@media (max-height:520px){.cg-map{width:76px;height:76px}.cg-colE{display:grid;grid-template-columns:repeat(2,38px);top:calc(84px + env(safe-area-inset-top,0px))}.cg-colE .cg-b{width:38px;height:36px}.cg-rbox{width:min(190px,30vw)}.cg-rlist{width:min(190px,30vw)}.cg-tl{top:calc(60px + env(safe-area-inset-top,0px))}.cg-steer{height:54px}.cg-gas{height:68px!important}.cg-brk{height:52px!important}.cg-toast{bottom:90px}}
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
  radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l9-4"/><circle cx="15.5" cy="14" r="2.6"/><path d="M6.5 12.5h4M6.5 15.5h4"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4.5h11l-2 3.5 2 3.5H5"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5.5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="18.5" r="1.8"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 16v2.5h3V16M17 16v2.5h3V16"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></svg>',
};
export function createHud(container, { t, dir = 'ltr', lang = 'en', settings, onAction }) {
  if (!document.getElementById('cg-css')) { const s = document.createElement('style'); s.id = 'cg-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.className = 'cg car'; root.dir = dir; root.lang = lang;
  const B = (a, ic, label, cls = '') => `<button class="cg-b ${cls}" data-a="${a}" aria-label="${label}" title="${label}">${ic}</button>`;
  root.innerHTML = `
  <div class="cg-look"></div>
  <div class="cg-tl"><div class="cg-brand"><b>VILNYI</b><span>City Drive</span><div class="cg-stars" role="img" aria-label="${t('wanted')}"><i></i><i></i><i></i><i></i><i></i></div></div></div>
  <div class="cg-rbox cg-car" role="group" aria-label="${t('radio')}"><button class="cg-rb" data-a="rprev" aria-label="${t('prev')}" title="${t('prev')}">‹</button><button class="cg-rmid" data-a="rlist" aria-expanded="false" aria-label="${t('radio')}"><b class="cg-rf">—</b><span class="cg-rnm">${t('rOff')}</span></button><button class="cg-rb" data-a="rnext" aria-label="${t('next')}" title="${t('next')}">›</button></div>
  <div class="cg-rlist cg-car" role="listbox"></div>
  <div class="cg-tr"><button class="cg-map" data-a="map" aria-label="${t('map')}"><canvas width="160" height="160"></canvas></button><span class="cg-osm">© OpenStreetMap</span></div>
  <div class="cg-colS">
    <button class="cg-b cg-car" data-p="back" aria-label="${t('lookBack')}" title="${t('lookBack')}">${IC.back}</button>
    <div style="position:relative;pointer-events:none">${B('carmenu', IC.car, t('carMenu'), 'cg-car cg-cm')}<div class="cg-menu"></div></div>
  </div>
  <div class="cg-colE">
    ${B('more', IC.more, t('more'), 'cg-more cg-car')}
    ${B('view', IC.view, t('view'), 'cg-sec cg-car')}${B('lights', IC.lights, t('lights'), 'cg-sec cg-car')}${B('high', IC.high, t('high'), 'cg-sec cg-car')}${B('wipers', IC.wipers, t('wipers'), 'cg-sec cg-car')}
    ${B('starts', IC.flag, t('startFrom'), 'cg-sec')}${B('time', IC.sun, t('day'), 'cg-sec')}${B('settings', IC.gear, t('settings'), 'cg-sec')}${B('exit', IC.home, t('garage'), 'cg-sec')}
  </div>
  <div class="cg-toast" role="status"></div>
  <div class="cg-bottom">
    <div class="cg-steer" data-p="steer" aria-label="${t('steer')}"><span class="l">◀</span><i class="cg-knob"></i><span class="r">▶</span></div>
    <div class="cg-mid">
      <div class="cg-foot-act cg-foot"></div>
      <div class="cg-row cg-car">${B('indL', '◀', t('ind') + ' ←')}${B('start', t('start'), t('start'))}${B('indR', '▶', t('ind') + ' →')}</div>
      <div class="cg-row cg-car"><button class="cg-b" data-p="horn" aria-label="${t('horn')}">${IC.horn}</button>${B('hand', '(P)', t('hand'), 'red')}</div>
      <div class="cg-clu cg-car"><div><span class="cg-spd">0</span><small>km/h</small><span class="cg-gear">P</span></div><div class="cg-bars"><div class="cg-bar dmg" title="${t('dmg')}"><i></i></div><div class="cg-bar fuel" title="${t('fuel')}"><i></i></div></div></div>
    </div>
    <div class="cg-ped"><button class="cg-b cg-brk" data-p="brake" aria-label="${t('brake')}">▼</button><button class="cg-b cg-gas" data-p="gas" aria-label="${t('gas')}">▲</button></div>
  </div>
  <div class="cg-ban"><h2></h2><p></p></div>
  <div class="cg-pan"><div class="cg-card"></div></div>
  <div class="cg-fade"></div>`;
  container.appendChild(root);
  const q = s => root.querySelector(s), el = { stars: q('.cg-stars'), spd: q('.cg-spd'), gear: q('.cg-gear'), dmg: q('.cg-bar.dmg i'), fuel: q('.cg-bar.fuel i'), menu: q('.cg-menu'), cm: q('.cg-cm'), footAct: q('.cg-foot-act'), toast: q('.cg-toast'), ban: q('.cg-ban'), pan: q('.cg-pan'), card: q('.cg-card'), fade: q('.cg-fade'), map: q('.cg-map'), cv: q('.cg-map canvas'), rbox: q('.cg-rbox'), rlist: q('.cg-rlist'), rf: q('.cg-rf'), rnm: q('.cg-rnm'), rmid: q('.cg-rmid'), knob: q('.cg-knob'), look: q('.cg-look') };
  const pad = { gas: 0, brake: 0, steer: 0, horn: 0, back: 0 }, look = { dx: 0, dy: 0, drag: false };
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  root.querySelectorAll('button[data-p]').forEach(b => {
    const k = b.dataset.p, on = e => { stop(e); try { b.setPointerCapture(e.pointerId); } catch { /* */ } pad[k] = 1; b.classList.add('on'); if (k === 'horn') onAction('hornDown'); }, off = e => { stop(e); pad[k] = 0; b.classList.remove('on'); if (k === 'horn') onAction('hornUp'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  });
  { const sp = q('.cg-steer'); let id = null;
    const mv = e => { if (e.pointerId !== id) return; stop(e); const r = sp.getBoundingClientRect(), k = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 22))); pad.steer = -Math.sign(k) * Math.pow(Math.abs(k), 1.25); el.knob.style.transform = `translateX(${(k * (r.width / 2 - 24)).toFixed(1)}px)`; };
    sp.addEventListener('pointerdown', e => { id = e.pointerId; try { sp.setPointerCapture(id); } catch { /* */ } mv(e); });
    sp.addEventListener('pointermove', mv);
    const end = e => { if (e.pointerId !== id) return; id = null; pad.steer = 0; el.knob.style.transform = ''; }; sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end); sp.addEventListener('lostpointercapture', end); }
  // look by dragging on the free area (a short tap: reveal the folded controls / hit the car's own screens)
  { let id = null, lx = 0, ly = 0, t0 = 0, moved = 0;
    el.look.addEventListener('pointerdown', e => { id = e.pointerId; lx = e.clientX; ly = e.clientY; t0 = performance.now(); moved = 0; look.drag = true; try { el.look.setPointerCapture(id); } catch { /* */ } stop(e); });
    el.look.addEventListener('pointermove', e => { if (e.pointerId !== id) return; look.dx += e.clientX - lx; look.dy += e.clientY - ly; moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly); lx = e.clientX; ly = e.clientY; stop(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; look.drag = false; if (moved < 8 && performance.now() - t0 < 350) { const r = root.getBoundingClientRect(); onAction('tap', { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); } }; el.look.addEventListener('pointerup', end); el.look.addEventListener('pointercancel', end); }
  root.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b || !root.contains(b)) return; e.stopPropagation(); const a = b.dataset.a;
    if (a === 'more') { reveal(5000); return; } if (a === 'carmenu') { menuOpen = !menuOpen; renderMenu(); reveal(6000); return; } if (a === 'rlist') { if (performance.now() - swipeAt < 350) return; toggleList(); return; }
    if (b.closest('.cg-menu')) { menuOpen = false; renderMenu(); }
    if (a !== 'rvol-' && a !== 'rvol+') closeList();   // a pick (or any other control) closes the list
    reveal(4000); onAction(a, b.dataset.v); });
  for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick', 'wheel', 'contextmenu']) root.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault(); });
  // ---- auto-hide while driving: the column folds to one ⋯ button, a tap anywhere brings it back for a few seconds
  let revealT = 0, toastT = 0, last = {}, acts = '', menuOpen = false;
  function reveal(ms = 4000) { root.classList.add('reveal'); clearTimeout(revealT); revealT = setTimeout(() => root.classList.remove('reveal'), ms); }
  // the radio list: tap the station name (or the centre screen of the car); it closes itself after a while or on a pick
  let listT = 0, swipeAt = 0, listKey = '';
  function toggleList() { if (el.rlist.classList.contains('show')) closeList(); else openList(); }
  function openList(ms = 9000) { el.rlist.classList.add('show'); el.rmid.setAttribute('aria-expanded', 'true'); clearTimeout(listT); listT = setTimeout(closeList, ms); }
  function closeList() { clearTimeout(listT); el.rlist.classList.remove('show'); el.rmid.setAttribute('aria-expanded', 'false'); }
  function showRadio() { openList(); }
  // a horizontal swipe on the station name changes the station (one step per ~44 px); a tap only opens the list
  { let id = null, x0 = 0, steps = 0;
    el.rmid.addEventListener('pointerdown', e => { id = e.pointerId; x0 = e.clientX; steps = 0; try { el.rmid.setPointerCapture(id); } catch { /* */ } });
    el.rmid.addEventListener('pointermove', e => { if (e.pointerId !== id) return; const dx = e.clientX - x0; const want = Math.trunc(dx / 44); if (want !== steps) { const d = want > steps ? 1 : -1; steps += d; swipeAt = performance.now(); onAction(d > 0 ? 'rprev' : 'rnext'); } });
    const end = e => { if (e.pointerId !== id) return; id = null; if (steps) swipeAt = performance.now(); };
    el.rmid.addEventListener('pointerup', end); el.rmid.addEventListener('pointercancel', end); }
  const setCls = (sel, on) => { const b = q(sel); if (b) b.classList.toggle('on', !!on); };
  function renderMenu() {
    const list = last.actions || [], car = list.filter(k => k !== 'enter' && k !== 'take');
    el.cm.style.display = car.length ? '' : 'none'; if (!car.length) menuOpen = false;
    el.menu.classList.toggle('show', menuOpen && car.length > 0);
    el.menu.innerHTML = menuOpen ? car.map(k => `<button class="cg-b${k === 'out' || k === 'garage' ? ' gold' : ''}" data-a="${k}">${t(k)}</button>`).join('') : '';
    el.cm.classList.toggle('on', menuOpen);
  }
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function renderList(r) {
    const li = r.stations.map((st, i) => `<button type="button" data-a="rpick" data-v="${i}" class="${i === r.index && r.on ? 'on' : ''}" role="option" aria-selected="${i === r.index && r.on}"><span>${esc(st.name)}</span><b>${esc(st.freq || '')}</b></button>`).join('');
    el.rlist.innerHTML = li + `<button type="button" data-a="roff" class="${r.on ? '' : 'on'}" role="option"><span>${esc(t('rOff'))}</span></button>` +
      `<div class="cg-rvol"><button type="button" data-a="rvol-" aria-label="${esc(t('vol'))} −">−</button><span style="font-size:10px;color:#cdbb8f">${esc(t('vol'))} ${Math.round(r.volume * 100)}%</span><button type="button" data-a="rvol+" aria-label="${esc(t('vol'))} +">+</button></div>`;
  }
  function set(s) {
    if (s.kmh !== last.kmh) el.spd.textContent = String(s.kmh);
    if (s.gear !== last.gear) el.gear.textContent = s.gear;
    el.dmg.style.width = s.dmg.toFixed(0) + '%'; el.fuel.style.width = (s.fuel * 100).toFixed(0) + '%';
    if (s.stars !== last.stars) { el.stars.querySelectorAll('i').forEach((i, k) => i.classList.toggle('on', k < s.stars)); el.stars.classList.toggle('any', s.stars > 0); }
    el.stars.classList.toggle('flash', !!s.hiding);
    if (s.onFoot !== last.onFoot) { root.classList.toggle('foot', !!s.onFoot); root.classList.toggle('car', !s.onFoot); }
    root.classList.toggle('drive', !!s.moving && !s.onFoot);
    setCls('[data-a=lights]', s.lights); setCls('[data-a=high]', s.high); setCls('[data-a=wipers]', s.wipers); setCls('[data-a=indL]', s.indL); setCls('[data-a=indR]', s.indR); setCls('[data-a=hand]', s.hb);  setCls('[data-a=start]', s.engine);
    const st = q('[data-a=start]'); if (st && s.engine !== last.engine) st.textContent = s.engine ? t('stop') : t('start');
    if (s.radio) {
      const r = s.radio, nm = r.on ? r.name : t('rOff'), fq = r.on ? (r.freq ? r.freq + ' FM' : '') + (r.status === 'tuning' ? ' …' : '') : '—';
      if (el.rnm.textContent !== nm) el.rnm.textContent = nm; if (el.rf.textContent !== fq) el.rf.textContent = fq;
      el.rbox.classList.toggle('on', !!r.on);
      const key = (r.on ? r.index : -1) + '|' + (r.stations || []).length + '|' + r.volume.toFixed(1);
      if (key !== listKey && r.stations) { listKey = key; renderList(r); }
    }
    const a = (s.actions || []).join('|');
    last = { kmh: s.kmh, gear: s.gear, stars: s.stars, onFoot: s.onFoot, engine: s.engine, actions: s.actions };
    if (a !== acts) { acts = a; renderMenu(); const fa = (s.actions || []).filter(k => k === 'enter' || k === 'take' || (s.onFoot && k === 'tow')); el.footAct.innerHTML = fa.map(k => `<button class="cg-b" data-a="${k}">${t(k)}</button>`).join(''); }
  }
  function toast(msg, ms = 2200) { el.toast.textContent = msg; el.toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('show'), ms); }
  function banner(title, sub = '', bad = false) { el.ban.classList.toggle('show', !!title); el.ban.classList.toggle('bad', bad); el.ban.querySelector('h2').textContent = title || ''; el.ban.querySelector('p').textContent = sub; }
  function fade(on) { el.fade.classList.toggle('on', !!on); return new Promise(r => setTimeout(r, 300)); }
  function panel(html) { el.pan.classList.toggle('show', !!html); el.card.innerHTML = html || ''; }
  function showSettings(time, about = '') {
    const seg = (a, opts, cur) => `<div class="cg-seg">${opts.map(([v, l]) => `<button class="cg-b${String(cur) === String(v) ? ' on' : ''}" data-a="${a}" data-v="${v}">${l}</button>`).join('')}</div>`;
    panel(`<h3>${t('settings')}</h3>
      <div class="cg-rw"><span>${t('traffic')}</span>${seg('setTraffic', [[1, t('low')], [2, t('med')], [3, t('hi')]], settings.traffic)}</div>
      <div class="cg-rw"><span>${t('sound')}</span>${seg('setSound', [[1, t('on')], [0, t('off')]], settings.sound ? 1 : 0)}</div>
      <div class="cg-rw"><span>${t('day')} / ${t('night')}</span>${seg('setTime', [['day', t('day')], ['dusk', t('dusk')], ['night', t('night')]], time)}</div>
      <button class="cg-b wide" data-a="starts">${t('startFrom')}</button><button class="cg-b wide" data-a="repair">${t('repair')}</button><button class="cg-b wide" data-a="tow">${t('tow')}</button><button class="cg-b wide" data-a="exit">${t('garage')}</button>
      <button class="cg-b wide gold" data-a="closePanel">${t('close')}</button>
      <small>${t('help')}</small><small>${about || t('about')}</small>`);
  }
  // "Start from…": the featured start (Palace of the Parliament) first and in gold
  function showStarts(list, cur, intro = false) {
    panel(`<h3>${t('startFrom')}</h3>${intro ? `<p>${t('startIntro')}</p>` : ''}
      ${list.map((s, i) => `<button class="cg-b cg-st${i === 0 ? ' gold' : ''}${s.id === cur ? ' cur' : ''}" data-a="startAt" data-v="${s.id}"><b>${t(s.key)}</b><span>${t(s.key + 'Sub')}</span></button>`).join('')}
      <button class="cg-b wide" data-a="closePanel">${t('close')}</button><small>${t('osmNote')}</small>`);
  }
  // ---- minimap (heading-up): streets, water, police blips, the route home
  const mctx = el.cv.getContext('2d'); let big = false;
  function drawMap(g, W, H, D) {   // D: {map, x, z, yaw, range, route:[node ids], police:[{x,z,amb}], time}
    const { map, x, z, yaw } = D, k = W / (2 * D.range), c = Math.cos(yaw), s = Math.sin(yaw);
    const X = (wx, wz) => W / 2 - ((wx - x) * c - (wz - z) * s) * k, Y = (wx, wz) => H / 2 - ((wx - x) * s + (wz - z) * c) * k;
    g.fillStyle = '#12171c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b3f5a'; g.beginPath(); map.lake.forEach(([wx, wz], i) => (i ? g.lineTo(X(wx, wz), Y(wx, wz)) : g.moveTo(X(wx, wz), Y(wx, wz)))); g.closePath(); g.fill();
    if (map.river && map.river.length) { g.strokeStyle = '#1b3f5a'; g.lineWidth = Math.max(2, map.riverHW * 1.6 * k); g.lineJoin = 'round'; g.beginPath(); map.river.forEach(([wx, wz], i) => (i ? g.lineTo(X(wx, wz), Y(wx, wz)) : g.moveTo(X(wx, wz), Y(wx, wz)))); g.stroke(); }
    g.fillStyle = '#2a2a22'; g.beginPath(); map.site.plot.forEach(([wx, wz], i) => (i ? g.lineTo(X(wx, wz), Y(wx, wz)) : g.moveTo(X(wx, wz), Y(wx, wz)))); g.closePath(); g.fill();
    g.fillStyle = '#c9a659'; for (const b of map.site.vrc) { g.beginPath(); [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([a, q2], i) => { const wx = b.x + b.ux * a * b.hw - b.uz * q2 * b.hd, wz = b.z + b.uz * a * b.hw + b.ux * q2 * b.hd; i ? g.lineTo(X(wx, wz), Y(wx, wz)) : g.moveTo(X(wx, wz), Y(wx, wz)); }); g.closePath(); g.fill(); }
    const pal = map.landmark && map.landmark('palace'); if (pal) { g.fillStyle = '#6d6250'; const r2 = 125 * k; g.beginPath(); [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([a, q2], i) => { const wx = pal.x + a * 120, wz = pal.z + q2 * 135; i ? g.lineTo(X(wx, wz), Y(wx, wz)) : g.moveTo(X(wx, wz), Y(wx, wz)); }); g.closePath(); g.fill(); void r2; }
    const r = D.range * 1.5, seen = new Set(); g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) for (let i = Math.floor((x - r) / 128); i <= Math.floor((x + r) / 128); i++) for (let j = Math.floor((z - r) / 128); j <= Math.floor((z + r) / 128); j++) {
      const cell = map.cells.get(i + ',' + j); if (!cell) continue;
      for (const e of cell.edges) { if ((e.cls >= 2) !== (pass === 1)) continue; const key = e.id * 2 + pass; if (seen.has(key)) continue; seen.add(key); const a = map.nodes[e.a], b = map.nodes[e.b];
        g.strokeStyle = e.cls >= 3 ? '#8b93a0' : e.cls >= 2 ? '#6d7580' : '#4b525b'; g.lineWidth = Math.max(1.2, e.hw * 2 * k); g.beginPath(); g.moveTo(X(a.x, a.z), Y(a.x, a.z)); g.lineTo(X(b.x, b.z), Y(b.x, b.z)); g.stroke(); }
    }
    if (D.route && D.route.length > 1) { g.strokeStyle = '#e2c078'; g.lineWidth = Math.max(2.5, 5 * k); g.setLineDash([6, 5]); g.beginPath(); g.moveTo(W / 2, H / 2); for (const id of D.route) { const n = map.nodes[id]; g.lineTo(X(n.x, n.z), Y(n.x, n.z)); } g.stroke(); g.setLineDash([]); }
    { const G0 = map.site.garage; let hx = X(G0.x, G0.z), hy = Y(G0.x, G0.z); const dx = hx - W / 2, dy = hy - H / 2, m = Math.max(Math.abs(dx) / (W / 2 - 10), Math.abs(dy) / (H / 2 - 10)); if (m > 1) { hx = W / 2 + dx / m; hy = H / 2 + dy / m; }
      g.fillStyle = '#e2c078'; g.strokeStyle = '#14100a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx, hy - 8); g.lineTo(hx + 7, hy - 1); g.lineTo(hx + 5, hy + 7); g.lineTo(hx - 5, hy + 7); g.lineTo(hx - 7, hy - 1); g.closePath(); g.fill(); g.stroke(); }
    if (big || D.labels) { g.font = '600 11px Manrope, Arial, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#d8d2c4'; for (const p of map.pois) { if (p.kind === 'home') continue; const px = X(p.x, p.z), py = Y(p.x, p.z); if (px < 0 || py < 0 || px > W || py > H) continue; g.beginPath(); g.arc(px, py, 2.5, 0, 7); g.fill(); g.fillText(D.label(p), px, py - 6); } }
    for (const p of D.police || []) { const px = X(p.x, p.z), py = Y(p.x, p.z); g.fillStyle = p.amb ? '#ff5a48' : (Math.floor(D.time * 5) % 2 ? '#4f8dff' : '#ff4040'); g.beginPath(); g.arc(Math.max(6, Math.min(W - 6, px)), Math.max(6, Math.min(H - 6, py)), 5, 0, 7); g.fill(); }
    g.fillStyle = '#ffffff'; g.strokeStyle = '#14100a'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, H / 2 - 9); g.lineTo(W / 2 + 6.5, H / 2 + 7); g.lineTo(W / 2, H / 2 + 3); g.lineTo(W / 2 - 6.5, H / 2 + 7); g.closePath(); g.fill(); g.stroke();
    if (map.real && W >= 300) { g.font = '500 11px Manrope, Arial, sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(230,226,214,.75)'; g.fillText('© OpenStreetMap contributors', W - 6, H - 6); }
  }
  return {
    root, pad, look, set, toast, banner, fade, panel, showSettings, showStarts, showRadio, reveal, drawMap, mapCtx: mctx,
    miniMap(D) { const W = el.cv.width, H = el.cv.height; D.range = big ? 620 : 170; mctx.setTransform(1, 0, 0, 1, 0, 0); drawMap(mctx, W, H, D); },
    toggleMap() { big = !big; el.map.classList.toggle('big', big); const px = big ? 720 : 160; el.cv.width = el.cv.height = px; return big; },
    get panelOpen() { return el.pan.classList.contains('show'); },
    dispose() { clearTimeout(toastT); clearTimeout(revealT); clearTimeout(listT); root.remove(); },
  };
}
