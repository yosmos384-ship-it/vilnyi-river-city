// VILNYI RIVER CITY — "Location on Google Maps" (#gmaps): four parts, each lazy and each with its own fallback.
//   1. Flyover — Google Photorealistic 3D (Maps JavaScript API, Map3DElement + flyCameraAround) orbiting the site;
//      fallback: a tilted satellite map turning slowly; last resort: the poster with an "Open in Google Maps" link.
//   2. Map + "what's nearby" — branded project marker, category chips, Places API (New) Nearby Search at runtime,
//      list with straight-line distance and estimated walking / driving time; fallback: the site's own curated places
//      (js/panorama.js POIS, real coordinates with sources) with Google-Maps route links.
//   3. Navigate — Google Maps directions and Waze deep links (no key needed, always shown).
//   4. Street View — StreetViewPanorama of the nearest outdoor panorama, facing the project; hidden if none.
// Nothing from Google is requested until the section approaches the viewport. The key lives in js/maps-config.js only.
// Google Maps Platform terms: the Google logo / attribution inside the map is never hidden; Places results are kept in
// memory for this page view only (no storage); the list carries the "Google Maps" attribution next to the map.
import { lang, onLangChange } from './i18n.js?v=3.17';
import { mt, GOOGLE_LANG } from './i18n-maps.js?v=light-map-1';
import { CARD, poiName, pt } from './i18n-panorama.js?v=3.17';
import { PROJECT } from './data.js?v=3.17';
import { PROJECT_LL, POIS, haversine, trueBearing } from './panorama.js?v=3.17';
import CFG from './maps-config.js?v=3.17';

const [LAT, LNG] = PROJECT_LL;                       // 44.4639, 26.0347 — see panorama.js for the sources
const CENTER = { lat: LAT, lng: LNG };
const DEST = `${LAT},${LNG}`;
export const NAV_LINKS = {
  gmaps: `https://www.google.com/maps/dir/?api=1&destination=${DEST}&travelmode=driving`,
  waze: `https://waze.com/ul?ll=${DEST}&navigate=yes&zoom=17`,
  open: `https://www.google.com/maps/search/?api=1&query=${DEST}`,
};

// Flyover camera: ~650 m from the site, 60° tilt, one full turn a minute.
const FLY = { range: 650, tilt: 60, alt: 25, turnMs: 60000 };

// "What's nearby" categories → Places API (New) primary types (Table A). `safe` = retry list if a type is refused.
// `site` picks the matching curated places from panorama.js for the fallback; `keep` = a curated place always listed
// (the kindergarten inside the project, building permit 252/2025; the Lacul Morii shore — not a Places type).
const CATS = [
  { id: 'transport', types: ['subway_station', 'train_station', 'light_rail_station', 'bus_station'], safe: ['subway_station', 'train_station'], r: 3000, site: p => p.cat === 'transport' && p.kind !== 'airport' },
  { id: 'school', types: ['primary_school', 'secondary_school', 'school'], safe: ['school'], r: 2000, site: p => p.cat === 'education' && p.kind !== 'kinder' },
  { id: 'kinder', types: ['preschool', 'child_care_agency'], safe: ['preschool'], r: 2000, site: p => p.kind === 'kinder', keep: 'kinder' },
  { id: 'shop', types: ['supermarket', 'grocery_store', 'shopping_mall'], safe: ['supermarket'], r: 2500, site: p => p.cat === 'shopping' },
  { id: 'parks', types: ['park'], safe: ['park'], r: 2500, site: p => p.cat === 'parks', keep: 'lake' },
  { id: 'health', types: ['hospital', 'pharmacy'], safe: ['hospital'], r: 3000, site: p => p.cat === 'health' },
];

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mm = q => typeof matchMedia === 'function' && matchMedia(q).matches;
const reduced = mm('(prefers-reduced-motion: reduce)');
const coarse = mm('(pointer: coarse)');
const walkMin = d => Math.max(1, Math.round(d * 1.3 / 80));                       // same model as the 360° section
const driveMin = d => Math.max(2, Math.round(2 + d * 1.35 / (d < 2500 ? 330 : d < 8000 ? 450 : 780)));
function fmtDist(d) {
  if (d < 1) return mt('onsite');
  const U = CARD[lang] || CARD.en;
  if (d < 1000) return `${Math.round(d / 10) * 10} ${U.m}`;
  let s = String(d < 10000 ? Math.round(d / 100) / 10 : Math.round(d / 1000)); if (U.comma) s = s.replace('.', ',');
  return `${s} ${U.km}`;
}
const routeUrl = (ll, placeId) => `https://www.google.com/maps/dir/?api=1&origin=${DEST}&destination=${ll[0]},${ll[1]}${placeId ? `&destination_place_id=${encodeURIComponent(placeId)}` : ''}&travelmode=${haversine(PROJECT_LL, ll) <= 1500 ? 'walking' : 'driving'}`;
const ICON = {
  pause: '<path d="M9 6v12M15 6v12"/>', play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  gmaps: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  waze: '<path d="M5 15.5c-1.3-.3-2-1.2-2-2.3 0-.6.4-1 1-1.2.2-4.3 3.8-7.5 8.3-7.5 4.6 0 8.2 3.4 8.2 7.6 0 3.5-2.5 5.9-6 6.6"/><circle cx="8.5" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/><path d="M10.3 18h2.9M10 10.5h.01M15 10.5h.01M10 13.2c1.3 1.1 3.3 1.1 4.6 0"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
// Curated (site) places are named in the current language at render time; Google places come in the API's language.
const nameOf = p => (p.lake ? mt('lake') : p.poi ? poiName(p.poi) : p.name);
const kindOf = p => (p.lake ? '' : p.poi ? [pt('k.' + p.poi.kind), p.poi.line].filter(Boolean).join(' · ') : p.kind);
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

// ---------------------------------------------------------------- Google loader (one script, on demand)
let gmP = null;
const authListeners = new Set();
function loadGoogle() {
  if (gmP) return gmP;
  gmP = new Promise((res, rej) => {
    const key = CFG.GOOGLE_MAPS_API_KEY;
    if (!key) return rej(new Error('maps: no API key'));
    if (window.google?.maps?.importLibrary) return res(window.google.maps);
    const cb = '__vrcMapsReady';
    const timer = setTimeout(() => rej(new Error('maps: load timeout')), 25000);
    window[cb] = () => { clearTimeout(timer); try { delete window[cb]; } catch (e) { window[cb] = undefined; } res(window.google.maps); };
    // Called by Google when the key is refused (referrer not allowed, API not enabled, billing): switch to fallbacks.
    const prev = window.gm_authFailure;
    window.gm_authFailure = () => { for (const f of authListeners) { try { f(); } catch (e) { /* keep going */ } } if (typeof prev === 'function') prev(); };
    const q = new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: cb, language: GOOGLE_LANG[lang] || 'en', region: 'RO' });
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${q}`; s.async = true;
    s.onerror = () => { clearTimeout(timer); rej(new Error('maps: script could not load')); };
    document.head.appendChild(s);
  });
  gmP.catch(e => console.info('[maps]', e.message));
  return gmP;
}
const lib = name => loadGoogle().then(g => g.importLibrary(name));

// ================================================================ bootstrap
function boot() {
  const sec = document.getElementById('gmaps');
  if (!sec || sec.dataset.ready) return;
  sec.dataset.ready = '1';
  createMaps(sec);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

function createMaps(sec) {
  const app = $('#gmApp', sec);
  const S = { cat: CATS[0].id, playing: !reduced, fly: null, flyKind: '', map: null, markers: [], projMarker: null, sel: null,
    items: [], source: '', cache: new Map(), gen: 0, off: !CFG.GOOGLE_MAPS_API_KEY, svDone: false, onScreen: false };

  app.innerHTML = `
    <div class="gm-fly">
      <div class="gm-stage" id="gmStage" role="region">
        <img class="gm-poster" src="ai/real-aerial-day.jpg" width="1376" height="768" alt="" loading="lazy" decoding="async">
        <div class="gm-host" id="gmFlyHost"></div>
        <div class="gm-state" id="gmState" aria-live="polite"></div>
        <button type="button" class="gm-pp" id="gmPP" aria-pressed="false" hidden></button>
      </div>
      <p class="gm-hint" id="gmHint" hidden></p>
    </div>
    <div class="gm-nav">
      <div class="gm-nav-copy">
        <h3 class="gm-h3" data-m="navTitle"></h3>
        <p class="gm-sub" data-m="navLead"></p>
        <p class="gm-addr"><span class="gm-addr-k" data-m="address"></span><span class="gm-addr-v" dir="ltr">${esc(PROJECT.address)}</span></p>
      </div>
      <div class="gm-nav-btns">
        <a class="btn primary" id="gmGo" href="${NAV_LINKS.gmaps}" target="_blank" rel="noopener">${svg('gmaps')}<span data-m="gmaps"></span></a>
        <a class="btn gold-outline" id="gmWaze" href="${NAV_LINKS.waze}" target="_blank" rel="noopener">${svg('waze')}<span data-m="waze"></span></a>
      </div>
    </div>
    <div class="gm-near" id="gmNear">
      <div class="gm-near-head">
        <h3 class="gm-h3" data-m="nearTitle"></h3>
        <p class="gm-sub" id="gmNearLead"></p>
      </div>
      <div class="gm-chips" id="gmChips" role="group"></div>
      <div class="gm-near-grid">
        <div class="gm-map" id="gmMap" role="region"><div class="gm-map-off" id="gmMapOff" hidden></div></div>
        <div class="gm-list-wrap">
          <ol class="gm-list" id="gmList" aria-live="polite"></ol>
          <p class="gm-src" id="gmSrc"></p>
        </div>
      </div>
    </div>
    <div class="gm-sv" id="gmSv" hidden>
      <h3 class="gm-h3" data-m="svTitle"></h3>
      <p class="gm-sub" data-m="svLead"></p>
      <div class="gm-sv-stage" id="gmSvStage" role="region"></div>
    </div>
    <p class="fine gm-note" data-m="note"></p>`;

  // Keep the readable neighborhood map first; start the flyover only when requested.
  const flyBlock = $('.gm-fly', app), flyDetails = document.createElement('details');
  flyDetails.className = 'gm-extra';
  flyDetails.innerHTML = '<summary data-m="flyLabel"></summary>';
  flyDetails.append(flyBlock);
  $('.gm-nav', app).after(flyDetails);
  app.prepend($('#gmNear', app));

  const stage = $('#gmStage', app), host = $('#gmFlyHost', app), state = $('#gmState', app), pp = $('#gmPP', app), hint = $('#gmHint', app);
  const chips = $('#gmChips', app), list = $('#gmList', app), src = $('#gmSrc', app), mapEl = $('#gmMap', app), mapOff = $('#gmMapOff', app);
  const sv = $('#gmSv', app), svStage = $('#gmSvStage', app);

  // ---------- text (re-rendered on language change)
  function setState(kind) {           // '', 'loading', 'poster', 'off', 'tilt'
    S.stateKind = kind;
    stage.dataset.state = kind;
    if (kind === 'loading') state.innerHTML = `<span class="gm-spin" aria-hidden="true"></span><span>${esc(mt('loading'))}</span>`;
    else if (kind === 'poster') state.innerHTML = `<span>${esc(mt('poster'))}</span>`;
    else if (kind === 'off') state.innerHTML = `<span>${esc(mt('off'))}</span><a class="btn ghost sm" href="${NAV_LINKS.open}" target="_blank" rel="noopener">${svg('ext')}<span>${esc(mt('open'))}</span></a>`;
    else if (kind === 'tilt') state.innerHTML = `<span class="gm-tag">${esc(mt('tilt'))}</span>`;
    else state.innerHTML = '';
  }
  function renderPP() {
    pp.setAttribute('aria-pressed', String(!S.playing));
    pp.setAttribute('aria-label', mt(S.playing ? 'pause' : 'play'));
    pp.title = mt(S.playing ? 'pause' : 'play');
    pp.innerHTML = svg(S.playing ? 'pause' : 'play');
  }
  function renderText() {
    for (const el of sec.querySelectorAll('[data-m]')) el.textContent = mt(el.dataset.m);
    stage.setAttribute('aria-label', mt('flyLabel'));
    mapEl.setAttribute('aria-label', mt('mapLabel'));
    svStage.setAttribute('aria-label', mt('svLabel'));
    chips.setAttribute('aria-label', mt('nearTitle'));
    hint.textContent = mt(coarse ? 'hintTouch' : 'hint');
    $('#gmNearLead', app).textContent = mt(S.source === 'site' ? 'fallback' : 'nearLead');
    if (S.stateKind) setState(S.stateKind);
    renderPP(); renderChips(); renderList();
    mapOff.innerHTML = `<p>${esc(mt('off'))}</p><a class="btn ghost sm" href="${NAV_LINKS.open}" target="_blank" rel="noopener">${svg('ext')}<span>${esc(mt('open'))}</span></a>`;
    if (S.projMarker?.content?.querySelector) { const l = S.projMarker.content.querySelector('.gm-pin-t'); if (l) l.textContent = 'VILNYI RIVER CITY'; }
  }
  function renderChips() {
    chips.innerHTML = CATS.map(c => `<button type="button" class="gm-chip" data-cat="${c.id}" aria-pressed="${c.id === S.cat}">${esc(mt('cat.' + c.id))}</button>`).join('');
  }
  function renderList() {
    if (S.loadingCat) { list.innerHTML = `<li class="gm-li-msg"><span class="gm-spin" aria-hidden="true"></span>${esc(mt('searching'))}</li>`; src.textContent = ''; return; }
    if (!S.items.length) {
      const c = CATS.find(x => x.id === S.cat);
      list.innerHTML = S.source ? `<li class="gm-li-msg">${esc(mt('none', { r: fmtDist(c.r) }))}</li>` : '';
      src.textContent = ''; return;
    }
    list.innerHTML = S.items.map((p, i) => {
      const times = p.dist < 1 ? '' : `${p.dist <= 2500 ? `<span>${esc(mt('walk', { n: walkMin(p.dist) }))}</span>` : ''}<span>${esc(mt('drive', { n: driveMin(p.dist) }))}</span>`;
      return `<li class="gm-li${S.sel === p.key ? ' is-sel' : ''}" data-key="${esc(p.key)}">
        <button type="button" class="gm-li-main" data-sel="${esc(p.key)}"><b class="gm-n" aria-hidden="true">${i + 1}</b>
          <span class="gm-li-t"><span class="gm-li-name">${esc(nameOf(p))}</span>${kindOf(p) ? `<span class="gm-li-kind">${esc(kindOf(p))}</span>` : ''}</span>
          <span class="gm-li-meta"><span class="gm-li-d" dir="ltr">${esc(fmtDist(p.dist))}</span>${times}</span></button>
        ${p.dist < 1 ? '' : `<a class="gm-li-route" href="${esc(routeUrl(p.ll, p.placeId))}" target="_blank" rel="noopener" title="${esc(mt('route'))}">${svg('route')}<span>${esc(mt('route'))}</span></a>`}
      </li>`;
    }).join('');
    src.innerHTML = `${esc(mt('est'))}<br>${S.source === 'google' ? `<span class="gm-attr">${esc(mt('srcGoogle'))}</span>` : esc(mt('srcSite'))}`;
  }

  // ================================================================ 1. flyover
  pp.addEventListener('click', () => { S.playing = !S.playing; renderPP(); S.playing ? startOrbit() : stopOrbit(); });
  function startOrbit() {
    if (!S.playing || !S.onScreen || document.hidden || !S.fly) return;
    if (S.flyKind === '3d') {
      try {
        S.fly.flyCameraAround({ camera: { center: { lat: LAT, lng: LNG, altitude: FLY.alt }, tilt: S.fly.tilt ?? FLY.tilt, range: S.fly.range ?? FLY.range, heading: S.fly.heading ?? 0 }, durationMillis: FLY.turnMs, repeatCount: 1 });
      } catch (e) { console.warn('[maps] orbit', e); }
    } else if (S.flyKind === 'tilt' && !S.raf) {
      let last = performance.now();
      const step = now => {
        const dt = Math.min(100, now - last); last = now;
        try { S.fly.setHeading(((S.fly.getHeading() || 0) + dt * 360 / FLY.turnMs) % 360); } catch (e) { /* raster map without heading */ }
        S.raf = requestAnimationFrame(step);
      };
      S.raf = requestAnimationFrame(step);
    }
  }
  function stopOrbit() {
    if (S.flyKind === '3d') { try { S.fly.stopCameraAnimation(); } catch (e) { /* nothing running */ } }
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
  }
  // A deliberate gesture (mouse drag, wheel, two fingers) pauses the orbit; one-finger scrolling the page does not.
  const userPause = () => { if (S.playing) { S.playing = false; renderPP(); stopOrbit(); } };
  host.addEventListener('mousedown', userPause);
  host.addEventListener('wheel', userPause, { passive: true });
  host.addEventListener('touchstart', e => { if (e.touches.length > 1) userPause(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { document.hidden ? stopOrbit() : startOrbit(); });

  async function startFlyover() {
    const mode = CFG.FLYOVER_MODE || 'auto';
    if (S.off || mode === 'off') { setState(S.off ? 'off' : 'poster'); return; }
    setState('loading');
    if (mode !== 'tilt') {
      try { await start3D(); return; } catch (e) { console.info('[maps] 3D flyover unavailable:', e.message); host.innerHTML = ''; S.fly = null; }
      if (mode === '3d') { setState(S.off ? 'off' : 'poster'); return; }
    }
    try { await startTilt(); } catch (e) { console.info('[maps] satellite flyover unavailable:', e.message); goOff(); }
  }
  async function start3D() {
    const L = await lib('maps3d');
    if (!L?.Map3DElement) throw new Error('no Map3DElement');
    const m = new L.Map3DElement({
      center: { lat: LAT, lng: LNG, altitude: FLY.alt }, range: FLY.range, tilt: FLY.tilt, heading: 20,
      mode: L.MapMode?.HYBRID ?? 'HYBRID', gestureHandling: 'COOPERATIVE', defaultUIHidden: false,
    });
    await new Promise((res, rej) => {
      let done = false;
      const ok = () => { if (!done) { done = true; res(); } };
      m.addEventListener('gmp-error', () => { if (!done) { done = true; rej(new Error('gmp-error')); } else goOff(); });
      m.addEventListener('gmp-steadychange', e => { if (e.isSteady) ok(); });
      host.appendChild(m);
      setTimeout(ok, 9000);                       // slow tiles: show the live map anyway
    });
    try {
      const mk = new L.Marker3DElement({ position: { lat: LAT, lng: LNG, altitude: 70 }, altitudeMode: L.AltitudeMode?.RELATIVE_TO_GROUND ?? 'RELATIVE_TO_GROUND', extruded: true, label: 'VILNYI RIVER CITY' });
      try {
        const { PinElement } = await lib('marker');
        mk.append(new PinElement({ background: '#c9a96a', borderColor: '#8f7040', glyphColor: '#17130c', scale: 1.3 }));
      } catch (e) { /* default pin */ }
      m.append(mk);
    } catch (e) { console.info('[maps] 3D marker', e.message); }
    m.addEventListener('gmp-animationend', () => { if (S.playing) startOrbit(); });
    S.fly = m; S.flyKind = '3d';
    stage.classList.add('is-live'); setState(''); pp.hidden = false; hint.hidden = false; renderPP();
    startOrbit();
  }
  async function startTilt() {
    const { Map } = await lib('maps');
    const m = new Map(host, {
      center: CENTER, zoom: 17.4, tilt: 67.5, heading: 20, mapTypeId: 'satellite', mapId: CFG.GOOGLE_MAP_ID || undefined,
      renderingType: 'VECTOR', isFractionalZoomEnabled: true, gestureHandling: 'cooperative', disableDefaultUI: true, zoomControl: true, clickableIcons: false,
    });
    S.fly = m; S.flyKind = 'tilt';
    await addProjectMarker(m, true);
    stage.classList.add('is-live'); setState('tilt'); pp.hidden = false; hint.hidden = false; renderPP();
    startOrbit();
  }

  // ================================================================ 2. map + nearby
  chips.addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b || b.dataset.cat === S.cat) return;
    S.cat = b.dataset.cat; S.sel = null; renderChips(); loadCat();
  });
  list.addEventListener('click', e => { const b = e.target.closest('[data-sel]'); if (b) select(b.dataset.sel, true); });

  async function addProjectMarker(map, big = false) {
    const el = document.createElement('div');
    el.className = 'gm-pin' + (big ? ' big' : '');
    el.innerHTML = `<img src="assets/bird.png" alt="" width="22" height="20"><span class="gm-pin-t" dir="ltr">VILNYI RIVER CITY</span>`;
    try {
      if (!CFG.GOOGLE_MAP_ID) throw new Error('no map id');
      const { AdvancedMarkerElement } = await lib('marker');
      return new AdvancedMarkerElement({ map, position: CENTER, content: el, title: mt('project'), zIndex: 1000 });
    } catch (e) {
      return new google.maps.Marker({ map, position: CENTER, title: mt('project'), zIndex: 1000,
        icon: { url: 'assets/bird.png', scaledSize: new google.maps.Size(34, 30) } });
    }
  }
  async function startMap() {
    if (S.off) return goMapOff();
    try {
      const { Map } = await lib('maps');
      const opts = { center: CENTER, zoom: 14.6, gestureHandling: 'cooperative', clickableIcons: false, mapTypeId: 'roadmap', mapTypeControl: true,
        mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'] },
        streetViewControl: false, fullscreenControl: true, isFractionalZoomEnabled: true };
      if (CFG.GOOGLE_MAP_ID) { opts.mapId = CFG.GOOGLE_MAP_ID; opts.colorScheme = google.maps.ColorScheme?.LIGHT ?? 'LIGHT'; }
      S.map = new Map(mapEl, opts);
      S.projMarker = await addProjectMarker(S.map, false);
      loadCat();
    } catch (e) { console.info('[maps] map unavailable:', e.message); goMapOff(); }
  }

  async function googleNearby(c) {
    if (!CFG.PLACES_NEARBY || S.off || !S.map) throw new Error('places off');
    const { Place, SearchNearbyRankPreference } = await lib('places');
    const ask = (types, fields) => Place.searchNearby({
      fields, includedPrimaryTypes: types, maxResultCount: 12,
      locationRestriction: { center: CENTER, radius: c.r },
      rankPreference: SearchNearbyRankPreference?.DISTANCE ?? 'DISTANCE',
    });
    let r;
    try { r = await ask(c.types, ['id', 'displayName', 'location', 'primaryTypeDisplayName']); }
    catch (e) { console.info('[maps] nearby retry', c.id, e.message); r = await ask(c.safe, ['id', 'displayName', 'location']); }
    return (r?.places || []).filter(p => p.location).map(p => {
      const ll = [p.location.lat(), p.location.lng()];
      return { key: 'g:' + p.id, placeId: p.id, name: p.displayName || '', kind: p.primaryTypeDisplayName || '', ll, dist: haversine(PROJECT_LL, ll) };
    });
  }
  function siteNearby(c) {
    return POIS.filter(c.site).map(siteItem);
  }
  function siteItem(p) {
    return { key: 's:' + p.id, poi: p, ll: p.ll, dist: p.onSite ? 0 : haversine(PROJECT_LL, p.ll), site: true, lake: p.id === 'lake' };
  }
  async function loadCat() {
    const c = CATS.find(x => x.id === S.cat), want = S.cat, gen = S.gen;
    let items, source;
    if (S.cache.has(want)) ({ items, source } = S.cache.get(want));
    else {
      S.loadingCat = true; renderList();
      try { items = await googleNearby(c); source = 'google'; }
      catch (e) { if (S.map && !S.off) console.info('[maps] nearby fallback', c.id, e.message); items = siteNearby(c); source = 'site'; }
      const keep = c.keep && POIS.find(p => p.id === c.keep);
      if (keep && !items.some(i => i.key === 's:' + keep.id)) items.push(siteItem(keep));
      items.sort((a, b) => a.dist - b.dist);
      if (source === 'google') S.cache.set(want, { items, source });     // memory only, this page view
      S.loadingCat = false;
    }
    if (want !== S.cat || gen !== S.gen) return;        // a newer request (other chip, or the switch to the fallback) won
    S.items = items; S.source = source;
    $('#gmNearLead', app).textContent = mt(source === 'site' ? 'fallback' : 'nearLead');
    renderList(); drawMarkers();
  }
  async function drawMarkers() {
    for (const m of S.markers) { try { m.map = null; m.setMap?.(null); } catch (e) { /* gone */ } }
    S.markers = [];
    if (!S.map) return;
    let Adv = null;
    if (CFG.GOOGLE_MAP_ID) { try { Adv = (await lib('marker')).AdvancedMarkerElement; } catch (e) { Adv = null; } }
    const bounds = new google.maps.LatLngBounds(); bounds.extend(CENTER);
    S.items.forEach((p, i) => {
      if (p.dist < 1) return;
      const pos = { lat: p.ll[0], lng: p.ll[1] };
      let mk;
      if (Adv) {
        const el = document.createElement('div');
        el.className = 'gm-dot' + (p.lake ? ' lake' : '') + (S.sel === p.key ? ' is-sel' : ''); el.textContent = String(i + 1);
        mk = new Adv({ map: S.map, position: pos, content: el, title: nameOf(p), gmpClickable: true });
        mk.addListener('click', () => select(p.key, false));
      } else {
        mk = new google.maps.Marker({ map: S.map, position: pos, title: nameOf(p), icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#c9a96a', fillOpacity: 1, strokeColor: '#17130c', strokeWeight: 1.5 }, label: { text: String(i + 1), color: '#17130c', fontSize: '11px', fontWeight: '700' } });
        mk.addListener('click', () => select(p.key, false));
      }
      mk._key = p.key; S.markers.push(mk); bounds.extend(pos);
    });
    if (S.markers.length) S.map.fitBounds(bounds, 48); else { S.map.setCenter(CENTER); S.map.setZoom(14.6); }
  }
  function select(key, fromList) {
    S.sel = key;
    for (const li of list.querySelectorAll('.gm-li')) li.classList.toggle('is-sel', li.dataset.key === key);
    for (const m of S.markers) { if (m.content?.classList) m.content.classList.toggle('is-sel', m._key === key); }
    const p = S.items.find(x => x.key === key);
    if (p && S.map) { S.map.panTo({ lat: p.ll[0], lng: p.ll[1] }); if ((S.map.getZoom() || 0) < 15) S.map.setZoom(15); }
    if (!fromList) list.querySelector(`.gm-li[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }
  function goMapOff() {
    mapEl.classList.add('is-off'); mapOff.hidden = false;
    for (const m of S.markers) { try { m.map = null; m.setMap?.(null); } catch (e) { /* gone */ } }
    S.markers = []; S.map = null; S.cache.clear(); S.gen++; S.loadingCat = false; loadCat();
  }

  // ================================================================ 4. Street View
  async function startSV() {
    if (S.off || S.svDone) return; S.svDone = true;
    try {
      const L = await lib('streetView');
      const svc = new L.StreetViewService();
      const { data } = await svc.getPanorama({ location: CENTER, radius: 150, preference: L.StreetViewPreference?.NEAREST ?? 'nearest', source: L.StreetViewSource?.OUTDOOR ?? 'outdoor' });
      const at = data?.location?.latLng; if (!at || !data.location.pano) throw new Error('no panorama');
      const heading = trueBearing([at.lat(), at.lng()], PROJECT_LL);
      sv.hidden = false;
      new L.StreetViewPanorama(svStage, {
        pano: data.location.pano, pov: { heading, pitch: 8 }, zoom: 0, addressControl: false, motionTracking: false, motionTrackingControl: false,
        fullscreenControl: true, linksControl: true, panControl: false, enableCloseButton: false, showRoadLabels: true,
      });
    } catch (e) { sv.hidden = true; console.info('[maps] Street View hidden:', e.message); }
  }

  // ================================================================ failure from Google (key / referrer / billing)
  function goOff() {
    if (S.off && S.offDone) return; S.off = true; S.offDone = true;
    stopOrbit(); S.fly = null; S.flyKind = ''; host.innerHTML = ''; stage.classList.remove('is-live'); pp.hidden = true; hint.hidden = true;
    setState('off'); sv.hidden = true; goMapOff();
  }
  authListeners.add(() => { console.info('[maps] Google refused the key — showing the fallbacks'); goOff(); });

  // ================================================================ lazy start
  renderText();
  setState(S.off ? 'off' : 'poster');
  let flyStarted = false, mapStarted = false;
  flyDetails.addEventListener('toggle', () => {
    S.onScreen = flyDetails.open;
    if (flyDetails.open && !flyStarted) { flyStarted = true; startFlyover(); }
    else if (flyDetails.open) startOrbit(); else stopOrbit();
  });
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (e.target === stage) {
        S.onScreen = flyDetails.open && e.isIntersecting;
        if (S.onScreen && !flyStarted) { flyStarted = true; startFlyover(); }
        else if (S.onScreen) startOrbit(); else stopOrbit();
      }
      if (e.target === mapEl && e.isIntersecting && !mapStarted) { mapStarted = true; S.off ? goMapOff() : startMap(); }
    }
  }, { rootMargin: '300px 0px' });
  io.observe(stage); io.observe(mapEl);
  // Street View starts with the map (its block is hidden until a panorama is found, so it cannot be observed itself).
  const svIo = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { svIo.disconnect(); startSV(); } }, { rootMargin: '400px 0px' });
  svIo.observe($('#gmNear', app));
  onLangChange(() => renderText());
}
