// VILNYI River City — the sound bar of the walkthrough: mute (always on screen), and the radio scanner (previous station,
// the station with its frequency, next). Plain DOM, the same in every place; the labels follow the page language.
const T = {
  en: { mute: 'Mute', on: 'Sound on', off: 'radio off', radioOff: 'Radio: enter a flat or a car', tap: 'Tap to start the radio', prev: 'Previous station', next: 'Next station', fb: 'Radio fallback · no stream', scan: 'Scan' },
  ro: { mute: 'Mut', on: 'Sunet pornit', off: 'radio oprit', radioOff: 'Radio: intră într-un apartament sau o mașină', tap: 'Atinge pentru a porni radioul', prev: 'Postul anterior', next: 'Postul următor', fb: 'Radio de rezervă · fără stream', scan: 'Caută' },
  he: { mute: 'השתקה', on: 'הצליל פועל', off: 'הרדיו כבוי', radioOff: 'רדיו: היכנסו לדירה או לרכב', tap: 'לחצו כדי להפעיל את הרדיו', prev: 'התחנה הקודמת', next: 'התחנה הבאה', fb: 'רדיו גיבוי · בלי שידור חי', scan: 'סריקה' },
  ru: { mute: 'Без звука', on: 'Звук включён', off: 'радио выключено', radioOff: 'Радио: войдите в квартиру или машину', tap: 'Нажмите, чтобы включить радио', prev: 'Предыдущая станция', next: 'Следующая станция', fb: 'Радио-резерв · без эфира', scan: 'Поиск' },
  uk: { mute: 'Без звуку', on: 'Звук увімкнено', off: 'радіо вимкнено', radioOff: 'Радіо: увійдіть до квартири або авто', tap: 'Торкніться, щоб увімкнути радіо', prev: 'Попередня станція', next: 'Наступна станція', fb: 'Радіо-резерв · без ефіру', scan: 'Пошук' },
  fr: { mute: 'Couper', on: 'Son activé', off: 'radio éteinte', radioOff: 'Radio : entrez dans un appartement ou une voiture', tap: 'Touchez pour lancer la radio', prev: 'Station précédente', next: 'Station suivante', fb: 'Radio de secours · sans flux', scan: 'Recherche' },
  it: { mute: 'Muto', on: 'Audio attivo', off: 'radio spenta', radioOff: 'Radio: entra in un appartamento o in un’auto', tap: 'Tocca per avviare la radio', prev: 'Stazione precedente', next: 'Stazione successiva', fb: 'Radio di riserva · senza flusso', scan: 'Cerca' },
  de: { mute: 'Stumm', on: 'Ton an', off: 'Radio aus', radioOff: 'Radio: Wohnung oder Auto betreten', tap: 'Tippen, um das Radio zu starten', prev: 'Vorheriger Sender', next: 'Nächster Sender', fb: 'Radio-Ersatz · ohne Stream', scan: 'Suchlauf' },
};
const ICON_ON = '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>';
const ICON_OFF = '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>';
const CSS = `.avb{position:absolute;left:calc(10px + var(--sl,0px));bottom:calc(98px + var(--sb,0px));z-index:7;display:flex;align-items:center;gap:4px;padding:4px;border-radius:999px;background:rgba(10,9,7,.82);border:1px solid rgba(201,164,92,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#f3ead7;font:600 11px/1 Manrope,Heebo,system-ui,sans-serif;direction:ltr;max-width:calc(100% - 20px);pointer-events:auto}
.avb button{height:34px;border:0;background:transparent;color:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;touch-action:manipulation;font:inherit}
.avb button:disabled{opacity:.35;cursor:default}
.avb-m{width:38px;height:34px;border:1px solid rgba(201,164,92,.5)!important;background:rgba(201,164,92,.12)!important}
.avb-m.on{background:rgba(200,32,42,.35)!important;border-color:rgba(200,32,42,.8)!important}
.avb-m svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.avb-p,.avb-n{width:30px;font-size:16px}
.avb-s{min-width:0;flex:1;height:34px;padding:0 8px;gap:8px;max-width:210px;justify-content:flex-start;white-space:nowrap;overflow:hidden}
.avb-s .f{color:#e2c078;font-variant-numeric:tabular-nums;flex-shrink:0}
.avb-s .n{overflow:hidden;text-overflow:ellipsis;min-width:0;font-weight:500;letter-spacing:.02em}
.avb-s:disabled .n{opacity:.8}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountAvBar(parent, av, getLang = () => 'en') {
  if (!document.getElementById('avb-css')) { const s = document.createElement('style'); s.id = 'avb-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div'); el.className = 'avb'; el.setAttribute('role', 'group');
  el.innerHTML = `<button type="button" class="avb-m" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></button>
    <button type="button" class="avb-p" aria-label=""><span aria-hidden="true">‹</span></button>
    <button type="button" class="avb-s"><b class="f"></b><span class="n"></span></button>
    <button type="button" class="avb-n" aria-label=""><span aria-hidden="true">›</span></button>`;
  parent.appendChild(el);
  const mute = el.querySelector('.avb-m'), prev = el.querySelector('.avb-p'), scan = el.querySelector('.avb-s'), next = el.querySelector('.avb-n');
  const f = el.querySelector('.f'), n = el.querySelector('.n'), ic = mute.querySelector('svg');
  const stop = ev => ev.stopPropagation();
  for (const ty of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'dblclick', 'wheel']) el.addEventListener(ty, stop);
  const L = () => T[String(getLang() || 'en').slice(0, 2)] || T.en;
  mute.addEventListener('click', () => av.toggleMute());
  prev.addEventListener('click', () => av.scan(-1));
  next.addEventListener('click', () => av.scan(1));
  scan.addEventListener('click', () => av.scan(1));
  let last = null;
  function update(s = av.state()) {
    const l = L();
    mute.classList.toggle('on', !!s.muted); mute.setAttribute('aria-pressed', String(!!s.muted));
    const txt = s.muted ? l.on : l.mute; mute.title = txt; mute.setAttribute('aria-label', txt);
    ic.innerHTML = s.muted ? ICON_OFF : ICON_ON;
    const on = !!s.radio;
    prev.disabled = next.disabled = scan.disabled = !on;
    prev.setAttribute('aria-label', l.prev); next.setAttribute('aria-label', l.next); scan.title = l.scan;
    // a car that plays the generated programme says so: the fallback is never mistaken for a real station
    const fallback = !!(s.station && s.station.synth && s.radio === 'car');
    if (on && s.station) { f.textContent = s.station.freq ? s.station.freq : ''; n.textContent = s.status === 'tap' ? l.tap : fallback ? l.fb : s.station.name; }
    else { f.textContent = ''; n.textContent = s.status === 'tap' ? l.tap : l.radioOff; }
    last = s;
  }
  update();
  return { update, refresh: () => update(last || av.state()), dispose() { el.remove(); } };
}
