// VILNYI RIVER CITY — app shell: wires i18n, sections, finder (plan/list/filters), unit panel, booking,
// hero 3D (lazy) and the walkthrough overlay (lazy import of ./three/walk.js).
import { PROJECT, TYPES, UNITS, LEVELS, TOP_FLOOR, ROOF_Y, BUILDINGS, CONTEXT_BLOCKS, LAKE, FOOTPRINT, PRICING, PRICE_STATS, priceOf, moneyRate,
  floorY, unitsOn, unitById, localToWorld, money, footprintOf } from './data.js?v=3.12';
import { t, pick, planText, num, setLang, lang, dir, onLangChange, initialLang, applyDom, i18nApi, LANGS, langInfo, unitLabelL } from './i18n.js?v=3.12';
import { createPlan, keyPlanSVG, statusClass } from './plan.js?v=3.12';
import { openBooking, loadReservations, planBreakdown, bindCopy, esc } from './booking.js?v=3.12';
import { createHero3D } from './hero3d.js?v=3.12';
import { tt as tourT } from './i18n-tour.js?v=3.12';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } };
const roomsText = n => (n === 1 ? t('rooms.1') : t('rooms.n', { n }));
const floorText = f => (f === 0 ? t('unit.ground') : t('unit.floor', { n: f === TOP_FLOOR ? '10 / 10D' : f }));
const area = n => n.toFixed(2).replace(/\.00$/, '');

// ---------------------------------------------------------------- state
const reserved = new Set();
const S = {
  b: 'C3', f: 5, view: 'plan', sort: 'price', limit: 30,
  flt: { rooms: '', facing: '', view: '', pmin: 0, pmax: 0, fmin: 0, fmax: TOP_FLOOR },
  styleId: lsGet('vrc.style', 'milano'),
  unit: null, calcPlan: 'standard', timeMode: 'dusk',
};
const statusOf = u => (reserved.has(u.id) ? 'reserved' : u.status);
const STYLES = ['milano', 'nordic', 'riviera', 'monaco', 'kyoto', 'paris'];
// designs without their own photoreal renders borrow the nearest rendered design's stills (veil / gallery fallback)
const STILL_STYLE = { monaco: 'milano', kyoto: 'nordic', paris: 'riviera' };

// ---------------------------------------------------------------- static-ish sections
const ICON = {
  green: '<path d="M12 21v-7M12 14c-3.5 0-6-2.3-6-5.3C6 5.5 8.7 3 12 3s6 2.5 6 5.7c0 3-2.5 5.3-6 5.3zM9 10.5l3 2.2 3-3.2M4 21h16"/>',
  shops: '<path d="M5 8h14l-1.2 12.5H6.2zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
  parking: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.5 17V7.5h3.3a2.8 2.8 0 0 1 0 5.6H9.5"/>',
  kinder: '<path d="M4 20V10l8-6 8 6v10zM9.5 20v-5h5v5M12 8.3v.2"/><circle cx="12" cy="11" r="1.2"/>',
  lake: '<path d="M3 17c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0M3 20.5c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0M12 14V4M12 4c-1 1.5-1.2 3-.6 4.5M12 4c1 1.5 1.2 3 .6 4.5"/>',
};
// Figures quoted in the pricing texts — all read from data.js PRICING / the generated price list, nothing typed in here.
const ltr = x => '\u2066' + x + '\u2069';   // keep "+6%" / "€2,700" left-to-right inside Hebrew text
const pct = n => ltr((n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%');
function priceVars() {
  const R = PRICING.rooms;
  return { r1: ltr(money(R[1])), r2: ltr(money(R[2])), r3: ltr(money(R[PRICING.roomsUp])), min: ltr(money(PRICE_STATS.min)), max: ltr(money(PRICE_STATS.max)) };
}
const rateFrom = () => Math.min(...Object.values(PRICING.rooms));
// "2 rooms · €2,700/m² × 57.79 m²" for one unit; a floor / view / side adjustment is appended only when it is not zero
// (all three are switched off in data.js PRICING since v3.5).
function breakdownText(u) {
  const b = priceOf(u);
  const parts = [roomsText(b.rooms), ltr(`${money(b.base)}/m² × ${area(b.area)} m²`)];
  if (b.floorPct) parts.push(`${t('pr.floor')} ${pct(b.floorPct)}`);
  if (b.viewPct) parts.push(`${t('lake.' + b.view)} ${pct(b.viewPct)}`);
  if (b.sidePct) parts.push(`${t('side.' + b.side)} ${pct(b.sidePct)}`);
  return parts.join(' · ');
}
const lakeBadge = u => (u.view === 'none' ? '' : `<span class="lk lk-${u.view}" title="${esc(t('lake.' + u.view))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0M3 18.5c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0M12 10V4M9.5 6.5L12 4l2.5 2.5"/></svg>${esc(t('lake.' + u.view))}</span>`);
function renderStatic() {
  const P = PROJECT.permit;
  $('#heroStats').innerHTML = [
    [P.totalApartments, 'hero.stat.units'], [P.parkingPlaces, 'hero.stat.parking'],
    [PROJECT.deliveryMonths, 'hero.stat.delivery'], [money(rateFrom()), 'hero.stat.price'],
  ].map(([v, k]) => `<div class="stat"><b dir="ltr">${v}</b><span>${esc(t(k))}</span></div>`).join('');

  $('#amenities').innerHTML = [
    ['green', 'life.green'], ['shops', 'life.shops'], ['parking', 'life.parking'], ['kinder', 'life.kinder'], ['lake', 'life.lake'],
  ].map(([ic, k], i) => `<li class="am"><svg class="am-ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[ic]}</svg><span class="am-n" aria-hidden="true">0${i + 1}</span><h3 class="h5">${esc(t(k + '.t'))}</h3><p>${esc(t(k + '.d', { n: P.parkingPlaces }))}</p></li>`).join('');

  const T = PROJECT.terms;
  $('#termsGrid').innerHTML = [
    ['terms.price', t('terms.priceD', priceVars()), `<small class="tile-from">${esc(t('pr.from'))}</small><bdi dir="ltr">${money(rateFrom())}<small>/m²</small></bdi>`, 'nat'],
    ['terms.depositT', t('terms.depositD', { v: money(T.reservationDeposit) }), money(T.reservationDeposit)],
    ['terms.guarantee', t('terms.guaranteeD', { p: T.rentGuarantee.minYield, y: T.rentGuarantee.years }), `${T.rentGuarantee.minYield}%<small>× ${T.rentGuarantee.years}</small>`],
    ['terms.delivery', t('terms.deliveryD', { n: PROJECT.deliveryMonths }), `${PROJECT.deliveryMonths}<small>${esc(t('terms.mo'))}</small>`],
  ].map(([k, d, v, nat]) => `<div class="tile"><p class="tile-k">${esc(t(k))}</p><p class="tile-v${nat ? ' nat' : ''}" dir="${nat ? dir : 'ltr'}">${v}</p><p class="tile-d">${esc(d)}</p></div>`).join('');
  $('#plansRow').innerHTML = T.plans.map((p, i) => `<article class="plan-card"><span class="pc-idx">0${i + 1}</span><h3 class="h4">${esc(planText(p))}</h3>
      <div class="split" dir="ltr" aria-hidden="true">${p.split[0] ? `<i style="flex:${p.split[0]}"><span>${p.split[0]}%</span></i>` : ''}<i class="b" style="flex:${p.split[1]}"><span>${p.split[1]}%</span></i></div>
      <p>${esc(planText(p, 'desc'))}</p></article>`).join('') +
    `<article class="plan-card contract"><span class="pc-idx">§</span><h3 class="h4">${esc(t('terms.contract'))}</h3><p>${esc(t('terms.contract.text'))}</p></article>`;

  // facts
  const facts = [
    ['facts.permit', t('facts.permitV', { n: P.number, d: P.date })], ['facts.issuer', P.issuer],
    ['facts.applicant', P.applicant], ['facts.designer', P.designer], ['facts.cadastral', P.cadastral],
    ['facts.apartments', P.totalApartments], ['facts.parking', P.parkingPlaces], ['facts.regime', P.regime],
    ['facts.pot', P.pot], ['facts.cut', P.cut], ['facts.phase', t('facts.phaseV')],
    ['terms.delivery', t('terms.deliveryD', { n: PROJECT.deliveryMonths })],
  ];
  $('#partnerCard').innerHTML = `<img src="assets/bird.png" alt="" width="54" height="48"><div><p class="eyebrow">${esc(t('facts.partner'))}</p>
    <p class="pc-name" dir="ltr">${esc(PROJECT.partner?.name || 'VILNYI')}</p><p class="pc-role">${esc(t('terms.partner.role'))}</p></div>`;
  $('#locPts').innerHTML = ['loc.pt1', 'loc.pt2', 'loc.pt3', 'loc.pt4'].map(k => `<li>${esc(t(k, { n: num(P.parkingPlaces) }))}</li>`).join('');
  $('#factsGrid').innerHTML = facts.map(([k, v]) => `<div class="fact"><dt>${esc(t(k))}</dt><dd dir="auto">${esc(v)}</dd></div>`).join('');

  // address + contact (copyable text; links are conveniences only)
  const addrBlock = `<p class="addr-k">${esc(t('loc.address'))}</p><p class="addr-v" id="addrV" dir="ltr">${esc(PROJECT.address)}</p><button type="button" class="copy" data-copy="addrV"><span class="copy-l">${esc(t('bk.copy'))}</span></button>`;
  $('#addr').innerHTML = addrBlock;
  const C = PROJECT.contact || {};
  const items = [];
  if (C.phone) items.push(['bk.phone', C.phone, `tel:${C.phone.replace(/[^\d+]/g, '')}`]);
  if (C.whatsapp) items.push(['bk.c.whatsapp', C.whatsapp, `https://wa.me/${C.whatsapp.replace(/\D/g, '')}`]);
  if (C.email) items.push(['bk.email', C.email, `mailto:${C.email}`]);
  $('#contactList').innerHTML = (items.length ? items.map(([k, v, href], i) => `<div class="ct"><span class="ct-k">${esc(t(k))}</span><a class="ct-v" id="ct${i}" href="${esc(href)}" dir="ltr" target="_blank" rel="noopener">${esc(v)}</a><button type="button" class="copy" data-copy="ct${i}"><span class="copy-l">${esc(t('bk.copy'))}</span></button></div>`).join('')
    : `<p class="muted small">${esc(t('foot.noContact'))}</p>`) +
    `<div class="ct"><span class="ct-k">${esc(t('loc.address'))}</span><span class="ct-v" id="ctAddr" dir="ltr">${esc(PROJECT.address)}</span><button type="button" class="copy" data-copy="ctAddr"><span class="copy-l">${esc(t('bk.copy'))}</span></button></div>`;
  $('#copyright').textContent = t('foot.rights', { y: new Date().getFullYear() });
  renderMap();
  bindCopy(document);
}

// ---------------------------------------------------------------- location map (schematic SVG from LAKE + site data)
function renderMap() {
  const siteC = localToWorld('C3', 64, -33.6);   // middle of the C3–C4 courtyard
  // nearest lake-shore point to the site (sampled ellipse)
  let best = null;
  for (let i = 0; i < 360; i++) {
    const a = i / 360 * Math.PI * 2; const x = LAKE.center[0] + Math.cos(a) * LAKE.rx, z = LAKE.center[1] + Math.sin(a) * LAKE.rz;
    const d = Math.hypot(x - siteC[0], z - siteC[1]); if (!best || d < best.d) best = { x, z, d };
  }
  // Phones get a tighter crop (site, shore, island, fountain) so labels stay legible
  const narrow = mqMap.matches;
  const vb = narrow ? [-760, -1060, 1060, 1200] : [-1330, -1360, 1800, 1540];
  const rtl = dir === 'rtl';
  // text that mixes scripts follows the page direction; `end` = the side the label grows toward
  const lbl = (x, y, cls, txt, anchor = 'middle') => `<text x="${x}" y="${y}" class="m-lbl ${cls}" direction="${dir}" text-anchor="${anchor === 'middle' ? 'middle' : (anchor === 'end') !== rtl ? 'end' : 'start'}">${esc(txt)}</text>`;
  // soft, generic street grid (schematic texture only — no named streets beyond the project address)
  let grid = '';
  for (let x = -1300; x <= 460; x += 130) grid += `M${x} ${vb[1]}V${vb[1] + vb[3]}`;
  for (let z = -1340; z <= 180; z += 130) grid += `M${vb[0]} ${z}H${vb[0] + vb[2]}`;
  const blocks = [];
  for (const id of Object.keys(BUILDINGS)) blocks.push(`<polygon class="m-site" points="${footprintOf(id).map(([x, z]) => localToWorld(id, x, z).join(',')).join(' ')}"/>`);
  const ctx = CONTEXT_BLOCKS.map(c => `<rect class="m-ctx${c.delivered ? ' del' : ''}" x="${c.x0}" y="${c.z0}" width="${c.x1 - c.x0}" height="${c.z1 - c.z0}"/>`).join('');
  const [fx, fz] = LAKE.fountain;
  const I = LAKE.island;
  const mid = [(best.x + siteC[0]) / 2 + 40, (best.z + siteC[1]) / 2 + 30];
  const lakeL = narrow ? [-455, -790] : [LAKE.center[0], LAKE.center[1] - 210];
  $('#map').innerHTML = `<svg viewBox="${vb.join(' ')}" role="img" aria-label="${esc(t('loc.title'))}" direction="ltr" class="${narrow ? 'is-narrow' : ''}">
    <defs>
      <radialGradient id="mLake" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#1c2a31"/><stop offset="1" stop-color="#101a1f"/></radialGradient>
      <radialGradient id="mGlow"><stop offset="0" stop-color="#E8CC91" stop-opacity=".55"/><stop offset="1" stop-color="#E8CC91" stop-opacity="0"/></radialGradient>
      <clipPath id="mClip"><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" rx="0"/></clipPath>
    </defs>
    <g clip-path="url(#mClip)">
      <rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" class="m-land"/>
      <path d="${grid}" class="m-grid"/>
      <ellipse cx="${LAKE.center[0]}" cy="${LAKE.center[1]}" rx="${LAKE.rx + 34}" ry="${LAKE.rz + 34}" class="m-prom"/>
      <ellipse cx="${LAKE.center[0]}" cy="${LAKE.center[1]}" rx="${LAKE.rx}" ry="${LAKE.rz}" fill="url(#mLake)" class="m-lake"/>
      <ellipse cx="${LAKE.center[0]}" cy="${LAKE.center[1]}" rx="${LAKE.rx - 60}" ry="${LAKE.rz - 60}" class="m-ripple"/>
      <ellipse cx="${LAKE.center[0]}" cy="${LAKE.center[1]}" rx="${LAKE.rx - 150}" ry="${LAKE.rz - 150}" class="m-ripple"/>
      <circle cx="${I.center[0]}" cy="${I.center[1]}" r="${I.r}" class="m-island"/>
      <circle cx="${fx}" cy="${fz}" r="10" class="m-fountain"/><circle cx="${fx}" cy="${fz}" r="10" class="m-fountain-pulse"/>
      ${ctx}
      <circle cx="${siteC[0]}" cy="${siteC[1]}" r="190" fill="url(#mGlow)"/>
      ${blocks.join('')}
      <path d="M${siteC[0] - 20} ${siteC[1]}L${best.x} ${best.z}" class="m-walk"/>
      <text x="${mid[0]}" y="${mid[1]}" class="m-min">3′</text>
      ${lbl(lakeL[0], lakeL[1], 'lake', t('loc.lake'))}
      ${lbl(I.center[0], I.center[1] + I.r + 56, 'sm', t('loc.island'))}
      ${lbl(fx + 26, fz - 20, 'sm', t('loc.fountain'), 'start')}
      <text x="-24" y="4" class="m-lbl site" text-anchor="end">VILNYI RIVER CITY</text>
      <text x="-24" y="48" class="m-lbl sm" text-anchor="end">C3 · C4</text>
      ${lbl(190, 104, 'sm', t('loc.delivered'), 'end')}
      ${narrow ? '' : `<g class="m-centre" transform="translate(360 -560)"><path d="M-70 0H40M18 -16L42 0 18 16"/>${lbl(-12, -30, 'sm', t('loc.centre'))}</g>`}
      <g class="m-north" transform="translate(${vb[0] + 100} ${vb[1] + 110})"><circle r="44"/><path d="M0 -58L14 8 0 0-14 8Z"/><text y="-72" text-anchor="middle">${esc(t('plan.north'))}</text></g>
      <g class="m-scale" transform="translate(${vb[0] + 80} ${vb[1] + vb[3] - 50})"><path d="M0 0H200M0 -12V12M200 -12V12"/><text x="100" y="-24" text-anchor="middle">${esc(t('loc.scale'))}</text></g>
    </g></svg><figcaption>${esc(t('loc.mapNote'))}</figcaption>`;
}
const mqMap = matchMedia('(max-width: 600px)');
mqMap.addEventListener?.('change', () => renderMap());

// ---------------------------------------------------------------- finder
let plan = null;
function priceSteps() {
  const ps = UNITS.map(u => u.price); const lo = Math.floor(Math.min(...ps) / 25000) * 25000, hi = Math.ceil(Math.max(...ps) / 25000) * 25000;
  const out = []; for (let v = lo; v <= hi; v += 25000) out.push(v); return out;
}
function matches(u, withFloors = false) {
  const F = S.flt;
  if (F.rooms && (F.rooms === '4' ? u.rooms < 4 : u.rooms !== +F.rooms)) return false;
  if (F.facing && u.facing !== F.facing) return false;
  if (F.view === 'lake' && u.view === 'none') return false;
  if (F.view === 'courtyard' && u.side !== 'courtyard') return false;
  if (F.pmin && u.price < F.pmin) return false;
  if (F.pmax && u.price > F.pmax) return false;
  if (withFloors && (u.floor < F.fmin || u.floor > F.fmax)) return false;
  return true;
}
function activeFilters() { const F = S.flt; return [F.rooms, F.facing, F.view, F.pmin, F.pmax, F.fmin > 0 || F.fmax < TOP_FLOOR].filter(Boolean).length; }

function renderFilters() {
  const F = S.flt; const steps = priceSteps();
  const chip = (name, v, label, cur) => `<label class="chip"><input type="radio" name="${name}" value="${v}" ${String(cur) === String(v) ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  const opt = (v, label, cur) => `<option value="${v}" ${+cur === v ? 'selected' : ''}>${esc(label)}</option>`;
  const fl = f => (f === 0 ? t('finder.parter') : String(f));
  $('#filters').innerHTML = `
    <fieldset class="fg"><legend>${esc(t('finder.rooms'))}</legend><div class="chips">${chip('rooms', '', t('finder.any'), F.rooms)}${['1', '2', '3', '4'].map(r => chip('rooms', r, r === '4' ? '4' : r, F.rooms)).join('')}</div></fieldset>
    <fieldset class="fg"><legend>${esc(t('finder.facing'))}</legend><div class="chips">${chip('facing', '', t('finder.any'), F.facing)}${['N', 'E', 'S', 'W'].map(c => chip('facing', c, t('face.' + c), F.facing)).join('')}</div></fieldset>
    <fieldset class="fg"><legend>${esc(t('finder.view'))}</legend><div class="chips">${chip('view', '', t('finder.any'), F.view)}${chip('view', 'lake', t('finder.view.lake'), F.view)}${chip('view', 'courtyard', t('side.courtyard'), F.view)}</div></fieldset>
    <fieldset class="fg"><legend>${esc(t('finder.price'))}</legend><div class="sel2">
      <select name="pmin" aria-label="${esc(t('finder.minPrice'))}">${opt(0, t('finder.minPrice'), F.pmin)}${steps.slice(0, -1).map(v => opt(v, money(v), F.pmin)).join('')}</select>
      <span aria-hidden="true">–</span>
      <select name="pmax" aria-label="${esc(t('finder.maxPrice'))}">${opt(0, t('finder.maxPrice'), F.pmax)}${steps.slice(1).map(v => opt(v, money(v), F.pmax)).join('')}</select></div></fieldset>
    <fieldset class="fg fg-floors" ${S.view === 'list' ? '' : 'hidden'}><legend>${esc(t('finder.floorRange'))}</legend><div class="sel2">
      <select name="fmin" aria-label="${esc(t('finder.floorRange'))} min">${Array.from({ length: TOP_FLOOR + 1 }, (_, f) => opt(f, fl(f), F.fmin)).join('')}</select>
      <span aria-hidden="true">–</span>
      <select name="fmax" aria-label="${esc(t('finder.floorRange'))} max">${Array.from({ length: TOP_FLOOR + 1 }, (_, f) => opt(f, fl(f), F.fmax)).join('')}</select></div></fieldset>
    <button type="button" class="btn link sm" id="fltReset">${esc(t('finder.reset'))}</button>`;
  const n = activeFilters(); const b = $('#filtN'); b.hidden = !n; b.textContent = n;
}

function bindFilters() {
  const form = $('#filters');
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('change', e => {
    const el = e.target; const F = S.flt;
    if (el.name === 'rooms') F.rooms = el.value; else if (el.name === 'facing') F.facing = el.value; else if (el.name === 'view') F.view = el.value;
    else if (el.name in F) F[el.name] = +el.value;
    if (F.fmin > F.fmax) [F.fmin, F.fmax] = [F.fmax, F.fmin];
    if (F.pmin && F.pmax && F.pmin > F.pmax) [F.pmin, F.pmax] = [F.pmax, F.pmin];
    S.limit = 30; afterFilter();
    const n = activeFilters(); $('#filtN').hidden = !n; $('#filtN').textContent = n;
  });
  form.addEventListener('click', e => {
    if (e.target.id !== 'fltReset') return;
    S.flt = { rooms: '', facing: '', view: '', pmin: 0, pmax: 0, fmin: 0, fmax: TOP_FLOOR }; renderFilters(); afterFilter();
  });
  $('#filtBtn').addEventListener('click', () => {
    const open = !form.classList.contains('open'); form.classList.toggle('open', open); $('#filtBtn').setAttribute('aria-expanded', open);
  });
}
function afterFilter() { plan.applyMatches(); renderStack(); renderCount(); if (S.view === 'list') renderList(); }

function renderCount() {
  const all = UNITS.filter(u => u.building === S.b && matches(u, S.view === 'list'));
  $('#fdCount').textContent = t('finder.results', { n: all.length });
}

function renderTabs() {
  $('#bldTabs').innerHTML = Object.keys(BUILDINGS).map(b => `<button type="button" role="tab" data-b="${b}" aria-selected="${b === S.b}" class="${b === S.b ? 'on' : ''}"><span class="tb-b">${b}</span><span class="tb-s">${esc(t('finder.building'))}</span></button>`).join('');
  $$('#viewTabs button').forEach(bt => { const on = bt.dataset.view === S.view; bt.classList.toggle('on', on); bt.setAttribute('aria-selected', on); });
}

function renderStack() {
  const st = $('#floorStack'); const keep = st.scrollLeft;
  let h = '';
  for (let f = TOP_FLOOR; f >= 0; f--) {
    const us = unitsOn(S.b, f); const av = us.filter(u => statusOf(u) === 'available' && matches(u)).length;
    const on = f === S.f;
    h += `<button type="button" role="option" aria-selected="${on}" class="fl${on ? ' on' : ''}${f === TOP_FLOOR ? ' top' : ''}" data-f="${f}" style="--o:${f}">
      <span class="fl-n" dir="ltr">${f === 0 ? esc(t('finder.parterShort')) : f}${f === TOP_FLOOR ? '<sup>D</sup>' : ''}</span>
      <span class="fl-bar" aria-hidden="true"><i style="width:${us.length ? Math.round(av / us.length * 100) : 0}%"></i></span>
      <span class="fl-c">${av}</span></button>`;
  }
  st.innerHTML = h;
  st.scrollLeft = keep;   // re-rendering must not reset the phone strip's sideways scroll
}
// Bring the selected floor chip into view inside the sideways strip (phones) — never scrolls the page itself.
function revealChip(f, smooth = true) {
  const st = $('#floorStack'), c = st.querySelector(`[data-f="${f}"]`);
  if (!c || st.scrollWidth <= st.clientWidth + 1) return;
  const sr = st.getBoundingClientRect(), cr = c.getBoundingClientRect(), pad = 12;
  let dx = 0;
  if (cr.left < sr.left + pad) dx = cr.left - sr.left - pad; else if (cr.right > sr.right - pad) dx = cr.right - sr.right + pad;
  if (Math.abs(dx) > 1) st.scrollBy({ left: dx, behavior: smooth && !reduced ? 'smooth' : 'auto' });
}
function markHoverChip(a) {
  $$('#floorStack .fl.is-hover').forEach(x => x.classList.remove('is-hover'));
  if (a && a.building === S.b) $(`#floorStack [data-f="${a.floor}"]`)?.classList.add('is-hover');
}

// Elevation (the long courtyard facade of the chosen building) from LEVELS/floorY — also the no-WebGL "floor highlight"
function renderElev() {
  const W = 128, top = ROOF_Y;   // bar length incl. the wing (data.js GEOM.barLength)
  let s = `<svg viewBox="-6 ${-top - 5} ${W + 12} ${top + 10}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" direction="ltr">`;
  s += `<rect x="-6" y="0" width="${W + 12}" height="5" class="ev-ground"/><line x1="-6" x2="${W + 6}" y1="0" y2="0" class="ev-gl"/>`;
  for (let f = 0; f <= TOP_FLOOR; f++) {
    const y0 = floorY(f), y1 = f === TOP_FLOOR ? ROOF_Y : floorY(f + 1);
    const on = f === S.f;
    s += `<g class="ev-fl${on ? ' on' : ''}" data-f="${f}"><rect x="0" y="${-y1}" width="${W}" height="${y1 - y0}" class="ev-band"/>`;
    const us = unitsOn(S.b, f).filter(u => u.seg === 'S1');
    if (f === 0) s += `<rect x="1" y="${-y1 + 0.6}" width="${W - 2}" height="${y1 - y0 - 1}" class="ev-glaze"/>`;
    else for (const u of us) {
      const x0 = Math.min(u.frame.o[0], u.frame.o[0] + u.frame.U[0] * u.width);   // C3's frames run the other way (mirror image)
      const levels = f === TOP_FLOOR ? [floorY(10), floorY(11)] : [y0];
      for (const ly of levels) {
        s += `<rect x="${(x0 + 0.5).toFixed(2)}" y="${(-ly - 2.45).toFixed(2)}" width="${(u.width - 1).toFixed(2)}" height="2.05" class="ev-win"/>`;
        s += `<line x1="${(x0 + u.width * 0.18).toFixed(2)}" x2="${(x0 + u.width * 0.82).toFixed(2)}" y1="${(-ly - 0.95).toFixed(2)}" y2="${(-ly - 0.95).toFixed(2)}" class="ev-rail"/>`;
      }
    }
    s += `</g>`;
  }
  s += `<rect x="0" y="${-top}" width="${W}" height="${top}" class="ev-out"/>`;
  s += `<text x="0" y="${-top - 1.6}" class="ev-t" ${dir === 'rtl' ? 'direction="rtl" text-anchor="end"' : ''}>${S.b} · ${esc(floorText(S.f))}</text></svg>`;
  $('#elev').innerHTML = s;
}

function setFloor(b, f, { scroll = false, focusPlan = false } = {}) {
  S.b = b; S.f = f;
  renderTabs(); renderStack(); renderElev();
  plan.show(b, f);
  setPlanNote();
  renderCount();
  if (S.view === 'list') renderList();
  hero?.focusFloor(b, f);
  revealChip(f);
  $('#announce').textContent = `${b} · ${floorText(f)}`;
  // only when the finder is actually off screen (e.g. a floor picked on the hero 3D) — never fights the user's scroll
  if (scroll) {
    const r = $('#finder').getBoundingClientRect();
    if (r.top > innerHeight * 0.6 || r.bottom < 80) $('#finder').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
  if (focusPlan) setTimeout(() => $('#plan .pl-unit')?.focus({ preventScroll: true }), 400);
}

// The note line keeps its reserved height (CSS) whether or not it has text, so the legend below never shifts.
function setPlanNote() {
  const note = S.f === 0 ? t('finder.ground') : S.f === TOP_FLOOR ? t('finder.duplexNote') : '';
  const n = $('#planNote'); n.textContent = note || '\u00a0'; n.classList.toggle('is-empty', !note); n.hidden = false;
}

function renderLegend() {
  $('#legend').innerHTML = [1, 2, 3, 4].map(r => `<span class="lg"><i class="dot r${r}"></i>${esc(roomsText(r))}</span>`).join('') +
    `<span class="lg"><i class="dot res"></i>${esc(t('status.reserved'))}</span>` +
    `<span class="lg hint">${esc(matchMedia('(pointer: coarse)').matches ? t('finder.planHint') : t('finder.keyboardHint'))}</span>`;
}

function renderList() {
  const rows = UNITS.filter(u => u.building === S.b && matches(u, true));
  const key = { price: u => u.price, floor: u => u.floor * 100 + u.index, area: u => TYPES[u.type].total }[S.sort];
  rows.sort((a, b) => key(a) - key(b));
  const shown = rows.slice(0, S.limit);
  $('#listWrap').innerHTML = `<div class="ls-head"><label>${esc(t('finder.sort'))} <select id="lsSort">${['price', 'floor', 'area'].map(k => `<option value="${k}" ${k === S.sort ? 'selected' : ''}>${esc(t('finder.sort.' + k))}</option>`).join('')}</select></label></div>` +
    (rows.length ? `<ul class="ls">${shown.map(u => { const T = TYPES[u.type]; const st = statusOf(u); return `<li><button type="button" class="ls-row ${statusClass(st)}" data-id="${u.id}">
      <span class="ls-id"><i class="dot r${u.rooms}"></i><b dir="ltr">${u.building}-${u.floor === 0 ? 'P' : u.floor}-${String(u.index).padStart(2, '0')}</b><small>${esc(floorText(u.floor))}</small></span>
      <span class="ls-r">${esc(roomsText(u.rooms))}${T.duplex ? ' · ' + esc(t('rooms.duplex')) : ''}</span>
      <span class="ls-a" dir="ltr">${area(T.total)} m²</span>
      <span class="ls-f">${esc(t('face.' + u.facing))}${lakeBadge(u)}</span>
      <span class="ls-p" dir="ltr">${money(u.price)}<small>${moneyRate(u.rate)}/m²</small></span>
      <span class="ls-s">${esc(t('status.' + st))}</span></button></li>`; }).join('')}</ul>` +
      (rows.length > S.limit ? `<button type="button" class="btn ghost wide" id="lsMore">${esc(t('finder.more'))} (${rows.length - S.limit})</button>` : '')
      : `<p class="empty">${esc(t('finder.noResults'))}</p>`);
}

function bindFinder() {
  $('#bldTabs').addEventListener('click', e => { const b = e.target.closest('[data-b]')?.dataset.b; if (b && b !== S.b) setFloor(b, S.f); });
  $('#floorStack').addEventListener('click', e => { const f = e.target.closest('[data-f]')?.dataset.f; if (f != null && +f !== S.f) setFloor(S.b, +f); });
  // desktop: hovering a floor chip previews that floor's band on the 3D view
  $('#floorStack').addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const f = e.target.closest('[data-f]')?.dataset.f; if (f != null) hero?.previewFloor?.(S.b, +f); });
  $('#floorStack').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hero?.previewFloor?.(S.b, null); });
  $('#floorStack').addEventListener('keydown', e => {
    if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault();
    const f = Math.max(0, Math.min(TOP_FLOOR, S.f + (e.key === 'ArrowUp' ? 1 : -1))); setFloor(S.b, f);
    $(`#floorStack [data-f="${f}"]`)?.focus();
  });
  $('#elev').addEventListener('click', e => { const f = e.target.closest('[data-f]')?.dataset.f; if (f != null) setFloor(S.b, +f); });
  $('#viewTabs').addEventListener('click', e => {
    const v = e.target.closest('[data-view]')?.dataset.view; if (!v) return;
    S.view = v; renderTabs(); $('#planWrap').hidden = v !== 'plan'; $('#listWrap').hidden = v !== 'list';
    $('.fg-floors').hidden = v !== 'list'; renderCount(); if (v === 'list') renderList();
  });
  $('#listWrap').addEventListener('click', e => {
    const r = e.target.closest('.ls-row'); if (r) return openUnit(unitById(r.dataset.id));
    if (e.target.closest('#lsMore')) { S.limit += 30; renderList(); }
  });
  $('#listWrap').addEventListener('change', e => { if (e.target.id === 'lsSort') { S.sort = e.target.value; renderList(); } });
}

// ---------------------------------------------------------------- unit panel
function roomName(r) {
  const special = { 'Living + kitchenette': 'room.livingKitchenette', 'Baie oaspeți': 'room.guestBath', 'Hol etaj': 'room.upperHall', 'Dormitor master': 'room.master' };
  if (special[r.name]) return t(special[r.name]);
  const n = r.name.match(/\s(\d+)$/); return t('room.' + r.kind) + (n ? ' ' + n[1] : '');
}
function viewText(u) {
  const parts = [t('view.' + u.facing)];
  if (u.view !== 'none') parts.push(t('view.lake.' + u.view));
  parts.push(t('view.side.' + u.side));
  if (u.floor === TOP_FLOOR) parts.push(t('view.top')); else if (u.floor >= 6) parts.push(t('view.high')); else if (u.floor <= 2) parts.push(t('view.low'));
  return parts.join(' ');
}
const dlgU = () => $('#unitDlg');

function calcHTML(u) {
  const plans = PROJECT.terms.plans; const p = plans.find(x => x.id === S.calcPlan) || plans[0];
  const r = planBreakdown(u.price, p); const T = PROJECT.terms;
  const row = (k, v, cls = '') => `<div class="cr ${cls}"><span>${k}</span><b dir="ltr">${v}</b></div>`;
  let rows = row(esc(t('calc.deposit')) + `<small>${esc(t('calc.depositNote'))}</small>`, money(r.deposit));
  if (p.split[0]) rows += row(esc(t('calc.atSigning')) + ` · ${p.split[0]}%`, money(r.signing));
  if (r.balloon) rows += row(esc(t('calc.balloon')) + `<small>${esc(t('calc.interestByCo'))}</small>`, money(r.balloon));
  rows += row(esc(t('calc.onDelivery')) + ` · ${p.split[1]}%`, money(r.delivery));
  if (r.mortgage) rows += row(esc(t('calc.mortgage', { p: p.mortgage })), money(r.mortgage), 'soft');
  return `<div class="calc-tabs chips" role="radiogroup" aria-label="${esc(t('calc.plan'))}">${plans.map(x => `<label class="chip"><input type="radio" name="calcPlan" value="${x.id}" ${x.id === p.id ? 'checked' : ''}><span>${esc(planText(x))}</span></label>`).join('')}</div>
    <p class="calc-desc">${esc(planText(p, 'desc'))}</p>
    <div class="calc-rows">${rows}</div>
    <div class="rent"><p class="rent-k">${esc(t('calc.rent'))} · ${esc(t('calc.rentLine', { p: T.rentGuarantee.minYield, y: T.rentGuarantee.years }))}</p>
      <div class="rent-g"><div><b dir="ltr">${money(r.rentYear)}</b><span>${esc(t('calc.rentYear'))}</span></div><div><b dir="ltr">${money(r.rentMonth)}</b><span>${esc(t('calc.rentMonth'))}</span></div><div><b dir="ltr">${money(r.rentTotal)}</b><span>${esc(t('calc.rentTotal', { y: T.rentGuarantee.years }))}</span></div></div>
      ${u.rooms === 2 && T.marketRent2c ? `<p class="fine">${esc(t('calc.market', { v: money(T.marketRent2c) }))}</p>` : ''}</div>
    <p class="fine">${esc(t('calc.delivery', { n: PROJECT.deliveryMonths }))} · ${esc(t('calc.disclaimer'))}</p>`;
}

function renderUnit() {
  const u = S.unit; if (!u) return;
  const T = TYPES[u.type]; const st = statusOf(u);
  const lv = l => T.list.filter(r => r.level === l);
  const rowsFor = list => list.map(r => `<tr><th scope="row"><i class="rk rk-${r.kind}"></i>${esc(roomName(r))}</th><td dir="ltr">${area(r.area)} m²</td></tr>`).join('');
  const tbl = T.duplex
    ? `<tbody><tr class="lvl"><th colspan="2">${esc(t('unit.main'))}</th></tr>${rowsFor(lv(0))}<tr class="lvl"><th colspan="2">${esc(t('unit.upper'))}</th></tr>${rowsFor(lv(1))}</tbody>`
    : `<tbody>${rowsFor(T.list)}</tbody>`;
  const sw = { milano: ['#3b2a1f', '#121212', '#b08a4e', '#3a3a3f'], nordic: ['#d9c6a4', '#f3f1ec', '#d8d2c4', '#1c1c1c'], riviera: ['#d8c4a6', '#e9dcc6', '#7c8455', '#b5654a'], monaco: ['#121212', '#cfa75e', '#1f4a3a', '#1c2947'], kyoto: ['#e6dccb', '#d4bf9c', '#efe6d4', '#3e322a'], paris: ['#f4f1ea', '#c9a877', '#9db3c6', '#dbb4ae'] };
  dlgU().innerHTML = `<div class="sheet-card">
    <header class="sh-head">
      <div><p class="eyebrow">${esc(unitLabelL(u))}</p>
      <h2 id="ud-title" class="h3">${esc(roomsText(u.rooms))}${T.duplex ? ` <em>${esc(t('rooms.duplex'))}</em>` : ''}</h2>
      <p class="sh-type">${esc(t('unit.type'))} ${esc(u.type)} · <span dir="ltr">${esc(T.label)}</span></p></div>
      <button type="button" class="icon-btn" data-act="close" aria-label="${esc(t('unit.close'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6"/></svg></button>
    </header>
    <div class="sh-body">
      <div class="sh-price">
        <div><p class="k">${esc(t('unit.price'))}</p><p class="price" dir="ltr">${money(u.price)}</p><p class="ppm"><b dir="ltr">${moneyRate(u.rate)}</b> ${esc(t('unit.perM2'))}</p><p class="ppm-bd" id="ud-bd">${esc(breakdownText(u))}</p><p class="ppm-note">${esc(t('unit.perM2Note'))}</p>${lakeBadge(u)}</div>
        <span class="pill ${statusClass(st)}">${esc(t('status.' + st))}</span>
      </div>
      <div class="sh-key">${keyPlanSVG(u)}
        <dl class="sh-facts">
          <div><dt>${esc(t('unit.total'))}</dt><dd dir="ltr">${area(T.total)} m²</dd></div>
          <div><dt>${esc(t('unit.facing'))}</dt><dd>${esc(t('face.' + u.facing))}</dd></div>
          <div><dt>${esc(t('finder.floor'))}</dt><dd>${esc(u.floor === 0 ? t('finder.parter') : u.floor === TOP_FLOOR ? '10 / 10D' : String(u.floor))}</dd></div>
          <div><dt>${esc(t('unit.stair'))}</dt><dd>${esc(t('ul.stair'))} ${u.stair} · ${esc(t('ul.apt'))} ${u.apNo}</dd></div>
        </dl>
      </div>
      <div class="sh-acts">
        <button type="button" class="act" data-act="walk"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg><span>${esc(t('unit.walk'))}</span></button>
        ${photoBtnHTML(u)}
        <button type="button" class="act" data-act="tour"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M12 3v18M16.5 7.5l2 1.5-2 1.5"/></svg><span>${esc(t('unit.tour'))}</span></button>
        <button type="button" class="act" data-act="balcony"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18M5 20v-7h14v7M9 13v7M15 13v7M12 13v7M4 9l8-5 8 5"/></svg><span>${esc(t('unit.balcony'))}</span></button>
        <button type="button" class="act" data-act="lobby"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5l8-3 8 3v16M4 21h16M9 21v-5h6v5M8 8h2M14 8h2M8 12h2M14 12h2"/></svg><span>${esc(t('unit.lobby'))}</span></button>
      </div>
      ${st !== 'available' ? `<p class="notice-in">${esc(t('unit.reservedMsg'))}</p>` : ''}
      <section class="sh-sec"><h3 class="h5">${esc(t('unit.areas'))}</h3>
        <table class="areas">${tbl}<tfoot>
          <tr><th scope="row">${esc(t('unit.util'))}</th><td dir="ltr">${area(T.util)} m²</td></tr>
          <tr><th scope="row">${esc(t('unit.outdoor'))}</th><td dir="ltr">${area(T.outdoor)} m²</td></tr>
          <tr class="strong"><th scope="row">${esc(t('unit.total'))}</th><td dir="ltr">${area(T.total)} m²</td></tr>
          <tr><th scope="row">${esc(t('unit.built'))}</th><td dir="ltr">${area(T.built)} m²</td></tr></tfoot></table>
        ${T.est ? `<p class="est">${esc(t('unit.est'))}</p>` : ''}
      </section>
      <section class="sh-sec"><h3 class="h5">${esc(t('unit.view'))}</h3><p class="muted">${esc(viewText(u))}</p></section>
      <section class="sh-sec"><h3 class="h5">${esc(t('unit.design'))}</h3>
        <div class="styles" role="radiogroup" aria-label="${esc(t('unit.design'))}">${STYLES.map(id => `<label class="style-card"><input type="radio" name="style" value="${id}" ${id === S.styleId ? 'checked' : ''}>
          <span class="sw" aria-hidden="true">${sw[id].map(c => `<i style="background:${c}"></i>`).join('')}</span>
          <span class="st-n">${esc(t('style.' + id + '.n'))}</span><span class="st-d">${esc(t('style.' + id + '.d'))}</span></label>`).join('')}</div>
        <p class="fine">${esc(t('unit.designNote'))}</p></section>
      <section class="sh-sec ug" id="unitGal" hidden></section>
      <section class="sh-sec calc" id="calc"><h3 class="h5">${esc(t('calc.title'))}</h3><div id="calcBody">${calcHTML(u)}</div></section>
      <button type="button" class="btn link sm" data-act="share"><span class="copy-l">${esc(t('unit.share'))}</span></button>
      <p class="fine">${esc(t('facts.disclaimer'))}</p>
    </div>
    <footer class="sh-foot"><div class="sh-foot-p"><b dir="ltr">${money(u.price)}</b><span dir="ltr">${area(T.total)} m²</span></div>
      <button type="button" class="btn primary" data-act="reserve" ${st !== 'available' ? 'disabled' : ''}>${esc(t('unit.reserve'))}</button></footer>
  </div>`;
  renderUnitGallery();
}

function openUnit(u) {
  if (!u) return;
  S.unit = u; plan?.select(u.id); hero?.highlightUnits([u.id]);
  renderUnit();
  const d = dlgU();
  if (!d.open) { S.unitReturn = document.activeElement; d.showModal(); document.documentElement.classList.add('modal-open'); }
  d.querySelector('.sh-body').scrollTop = 0;
  try { history.replaceState(null, '', '#u=' + u.id); } catch (e) { /* sandboxed */ }
  setTimeout(() => d.querySelector('[data-act="close"]')?.focus(), 20);
  preloadStill(stillFor(u, 'apartment'));
  prewarmWalkFor(u);
  if (phoneSheet()) hero?.pause();   // the sheet covers the whole screen on phones: free the CPU/GPU for the pre-warm
}
const phoneSheet = () => matchMedia('(max-width: 899px)').matches;
const u0 = () => S.unit;
function closeUnit() {
  const d = dlgU(); if (!d.open) return;
  d.classList.add('is-closing');
  setTimeout(() => { d.classList.remove('is-closing'); d.close(); document.documentElement.classList.remove('modal-open'); S.unitReturn?.focus?.({ preventScroll: true }); }, 200);
  hero?.highlightUnits(null);
  if ($('#walk').hidden) resumeHero();
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* sandboxed */ }
}
function bindUnit() {
  const d = dlgU();
  d.addEventListener('cancel', e => { e.preventDefault(); closeUnit(); });
  d.addEventListener('click', async e => {
    if (e.target === d) return closeUnit();
    const a = e.target.closest('[data-act]')?.dataset.act; const u = S.unit;
    if (!u || (!a && !e.target.closest('[data-ui]'))) return;
    const ug = e.target.closest('[data-ui]'); if (ug) return lbOpen($('#unitGal')._list || [], +ug.dataset.ui);
    if (a === 'close') closeUnit();
    else if (a === 'walk') openWalk(u.id, 'apartment', 'walk');
    else if (a === 'photo') openPhoto({ unitId: u.id, styleId: S.styleId, room: 'living' });
    else if (a === 'photo-soon') openWalk(u.id, 'apartment', 'walk');
    else if (a === 'tour') openWalk(u.id, 'apartment', '360');
    else if (a === 'balcony') openWalk(u.id, 'balcony', '360');
    else if (a === 'lobby') openWalk(u.id, 'lobby', 'walk');
    else if (a === 'reserve') reserve(u);
    else if (a === 'share') {
      const btn = e.target.closest('[data-act]'); let url = location.href.split('#')[0] + '#u=' + u.id;
      const { copyText } = await import('./booking.js?v=3.12'); const ok = await copyText(url);
      const l = btn.querySelector('.copy-l'); const old = l.textContent; l.textContent = ok ? t('unit.copied') : url; setTimeout(() => (l.textContent = old), 1800);
    }
  });
  d.addEventListener('change', e => {
    if (e.target.name === 'style') { S.styleId = e.target.value; lsSet('vrc.style', S.styleId); renderUnitGallery(); preloadStill(stillFor(u0(), 'apartment')); prewarmWalkFor(u0()); }
    if (e.target.name === 'calcPlan') { S.calcPlan = e.target.value; $('#calcBody').innerHTML = calcHTML(S.unit); $(`#calcBody input[value="${S.calcPlan}"]`)?.focus(); }
  });
}

function reserve(u) {
  if (statusOf(u) !== 'available') return;
  openBooking({
    unit: u, planId: S.calcPlan,
    onReserved: id => { reserved.add(id); plan.refresh(); renderStack(); if (S.unit?.id === id) renderUnit(); if (S.view === 'list') renderList(); },
  });
}

// ---------------------------------------------------------------- walkthrough: instant open + idle pre-warm
// Opening shows a photoreal still of the target room at once (< 1 frame when cached — it is preloaded with the unit
// panel) while the live 3D builds behind it; walk.js then streams apartment → corridor → surroundings. In idle time
// the page pre-warms: module preload, textures (worker + IndexedDB), and for the open unit panel the apartment and
// its shaders (walk.js prewarmWalk).
const WALK_MODS = ['js/three/walk.js?v=3.12', 'js/three/materials.js?v=3.12', 'js/three/apartment.js?v=3.12', 'js/three/furniture.js?v=3.12', 'js/three/commons.js?v=3.12',
  'js/three/cars.js?v=3.12', 'js/three/environment.js?v=3.12', 'js/three/context.js?v=3.12', 'js/three/lake.js?v=3.12', 'js/three/exterior.js?v=3.12',
  'vendor/addons/environments/RoomEnvironment.js', 'vendor/addons/utils/BufferGeometryUtils.js', 'vendor/addons/geometries/RoundedBoxGeometry.js'];
// A failed import is forgotten, and the next attempt (the retry button) asks for a new URL: the browser caches a failed
// module record by its URL, so the same URL could never succeed again.
let walkModP = null, walkModTry = 0;
const walkModule = () => (walkModP ||= import('./three/walk.js?v=3.12' + (walkModTry ? '&r=' + walkModTry : '')).catch(e => { walkModP = null; walkModTry++; throw e; }));
const lowData = () => { try { const c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))); } catch (e) { return false; } };
const onIdle = (fn, timeout = 2500) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 300));
function preloadWalkModules() {
  if (preloadWalkModules.done || lowData()) return; preloadWalkModules.done = true;
  for (const href of WALK_MODS) {
    if (document.querySelector(`link[rel="modulepreload"][href="${href}"]`)) continue;
    const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = href; document.head.appendChild(l);
  }
}
let warmT = 0;
function prewarmWalkFor(u, delay = 600) {
  if (lowData()) return;
  clearTimeout(warmT);
  warmT = setTimeout(() => onIdle(() => {
    if (!$('#walk').hidden) return;
    preloadWalkModules();
    walkModule().then(m => m.prewarmWalk && m.prewarmWalk({ unitId: u ? u.id : null, styleId: S.styleId, shaders: !!u })).catch(() => {});
  }), delay);
}
// Photoreal still for the room the walkthrough opens in (gallery renders; the same design where possible).
function stillFor(u, start, room) {
  const kind = ['lobby', 'corridor', 'parking'].includes(start) ? start : start === 'balcony' ? 'balcony' : (room && room.kind) || 'living';
  const want = { living: 'living', kitchen: 'kitchen', bedroom: 'bedroom', bath: 'bath', hall: 'living', dressing: 'bedroom', storage: 'living', balcony: 'balcony', loggia: 'balcony', terrace: 'balcony' }[kind] || kind;
  const name = it => (it.src || '').split('/').pop().replace(/\.\w+$/, '');
  const sid = STILL_STYLE[S.styleId] || S.styleId;
  const score = it => {
    const n = name(it); let s = 0;
    if (!n.includes(want)) return -1;
    if (it.style && it.style !== sid) return -1;
    if (u && it.unitType === u.type) s += 3;
    if (it.src.startsWith('assets/gallery/')) s += 2;              // path-traced renders of the real plans
    if (n === `${sid}-${want}` || n === want) s += 1;
    if (/penthouse|duplex|dollhouse/.test(n) && !(u && it.unitType === u.type)) s -= 3;
    return s;
  };
  const best = G.items.map(it => [score(it), it]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0])[0];
  if (best) return best[1].url;
  if (['living', 'kitchen', 'bedroom', 'bath'].includes(want)) return `assets/gallery/${sid}-${want}.jpg`;
  return { lobby: 'assets/gallery/lobby.jpg', corridor: 'assets/gallery/corridor.jpg', parking: 'assets/gallery/parking.jpg', balcony: 'assets/gallery/view-lake-floor8.jpg' }[want] || `assets/gallery/${sid}-living.jpg`;
}
const stillCache = new Map();
function preloadStill(url) {
  if (!url || stillCache.has(url)) return;
  const im = new Image(); im.decoding = 'async'; im.src = url; stillCache.set(url, im);
  im.decode?.().catch(() => {});
}
function veilStyles() {
  if (document.getElementById('walkStillCss')) return;
  const st = document.createElement('style'); st.id = 'walkStillCss';
  st.textContent = `.walk-still{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.04);transition:opacity .35s ease;pointer-events:none}
.walk-still.on{opacity:1;animation:walkStillZoom 14s ease-out forwards}
@keyframes walkStillZoom{from{transform:scale(1.04)}to{transform:scale(1.12)}}
.walk-veil.has-still{place-items:end center;background:#050403}
.walk-veil.has-still::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,4,3,.35) 0%,rgba(5,4,3,0) 30%,rgba(5,4,3,0) 55%,rgba(5,4,3,.82) 100%);pointer-events:none}
.walk-veil.has-still .walk-load{position:relative;z-index:1;gap:6px;padding:0 24px calc(28px + env(safe-area-inset-bottom))}
.walk-veil.has-still .walk-bird{width:40px}
.walk-veil.has-still .walk-t{font-size:20px;margin-top:4px}
.walk-veil.has-still .walk-s{font-size:13px;color:rgba(243,234,215,.8)}
.walk-veil.is-out{opacity:0;transition:opacity .35s ease;pointer-events:none}
@media (prefers-reduced-motion:reduce){.walk-still.on{animation:none}}`;
  document.head.appendChild(st);
}
function showStill(unitId, start, room) {
  veilStyles();
  const V = $('#walkVeil'); V.classList.remove('is-out');
  let img = V.querySelector('.walk-still');
  if (!img) { img = document.createElement('img'); img.className = 'walk-still'; img.alt = ''; img.decoding = 'async'; V.prepend(img); }
  const url = stillFor(unitById(unitId), start, room);
  img.classList.remove('on'); V.classList.remove('has-still');
  if (!url) return;
  const on = () => { if (!V.hidden && img.dataset.src === url) { img.classList.add('on'); V.classList.add('has-still'); } };
  img.dataset.src = url;
  img.onerror = () => { img.classList.remove('on'); V.classList.remove('has-still'); };
  if (img.getAttribute('src') !== url) img.src = url;
  if (img.complete && img.naturalWidth) on(); else img.onload = on;
}
function hideVeil() {
  const V = $('#walkVeil');
  if (V.hidden) return;
  V.classList.add('is-out');
  setTimeout(() => { if (V.classList.contains('is-out')) { V.hidden = true; V.classList.remove('is-out', 'has-still'); V.querySelector('.walk-still')?.classList.remove('on'); } }, 360);
}

// ---------------------------------------------------------------- walkthrough overlay (Agent E)
let walk = null; let walkArgs = null; let walkFromUnit = false;
async function openWalk(unitId, start, mode, room, from, after) {
  closePhoto(true);
  walkArgs = { unitId, start, mode, room, from, after };
  const W = $('#walk'); W.hidden = false; W.classList.remove('is-ready'); document.documentElement.classList.add('walk-open');
  // A modal <dialog> sits in the top layer above any z-index, so step out of the unit sheet while walking
  if (dlgU().open) { walkFromUnit = true; dlgU().close(); }
  $('#walkVeil').hidden = false; $('#walkVeil').classList.remove('failed');
  showStill(unitId, start, room);
  $('#walkT').textContent = t('walk.loading'); $('#walkS').textContent = t('walk.loadingSub'); $('#walkRetry').hidden = true;
  $('#walkX').focus();
  hero?.pause();
  clearTimeout(warmT);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));   // the still is on screen before the 3D work starts
  if (W.hidden) return;
  // Attempt 1 = full quality. If it fails before anything is drawn, attempt 2 = safe mode (no shared GPU context, no
  // post-processing, no detail maps, 1× pixels, textures on the page). Only when both fail is the failure text shown.
  let placed = false;
  const attempt = async safe => {
    const watch = setTimeout(() => { if (walk && !walk.live) console.info('[walk] still starting after 40 s; step:', walk.step); }, 40000);
    let limit = null;
    try {
      const mod = await walkModule();
      if (W.hidden) return 'closed';
      if (walk) { try { walk.dispose(); } catch (e) {} walk = null; }
      walk = new mod.Walkthrough($('#walkStage'), {
        i18n: i18nApi, styleId: S.styleId, timeMode: S.timeMode, safe,
        onExit: () => closeWalk(),
        onReserve: id => { closeWalk(); const u = unitById(id || unitId); if (u) { openUnit(u); reserve(u); } },
      });
      placed = !!(from && mod.Walkthrough.startsFromPano && from.frame !== 'building' && isFinite(from.u));
      // hard limit: an await that never resolves must fall through to the safe attempt, not keep the loading text forever
      const timedOut = new Promise((_, rej) => { limit = setTimeout(() => rej(new Error(`timed out at step "${walk.step}"`)), 90000); });
      await Promise.race([walk.enter({ unitId, start, mode, from: placed ? from : null }), timedOut]);
      return W.hidden ? 'closed' : 'ok';
    } catch (e) {
      if (W.hidden) return 'closed';
      // a frame is already on screen: a failing optional step must not replace the view with "unavailable"
      if (walk && walk.live) { console.warn('[walk] late step failed; the view stays up', e); return 'ok'; }
      console.warn(`[walk] start failed${safe ? ' (safe mode)' : ''} at step "${walk ? walk.step : 'import'}":`, e);
      return 'failed';
    } finally { clearTimeout(watch); clearTimeout(limit); }
  };
  let outcome = await attempt(false);
  if (outcome === 'failed') {
    try { walk?.dispose(); } catch (e) {} walk = null; $('#walkStage').innerHTML = '';
    outcome = await attempt(true);
  }
  if (outcome === 'closed') return;
  if (outcome === 'failed') return walkFailed();
  if (W.hidden) return;
  // Optional steps (a start in the car park, a room) are bounded: they can never keep the view behind the veil.
  const bounded = (p, ms) => Promise.race([Promise.resolve(p), new Promise(r => setTimeout(r, ms))]);
  if (after) { try { await bounded(after(walk), 12000); } catch (e) { console.warn('[walk] after enter', e); } }
  if (!placed && room && start === 'apartment' && room.kind && room.kind !== 'living' && walk && walk.jumpToRoom) {
    try { await bounded(walk.jumpToRoom(room.kind, room.index | 0), 8000); } catch (e) { console.warn('[walk] jumpToRoom', e); }
  }
  hideVeil(); W.classList.add('is-ready'); // the HUD has its own Exit button
}
function walkFailed() {
  // never while a frame is on screen: the message is for "no 3D at all", not for a view that is already rendering
  if (walk && walk.live) return hideVeil();
  console.warn('[walk] unavailable after safe-mode retry; step:', walk ? walk.step : 'import');
  $('#walkVeil').classList.add('failed'); $('#walkVeil').classList.remove('has-still', 'is-out'); $('#walkVeil .walk-still')?.classList.remove('on');
  $('#walkT').textContent = t('walk.unavailable'); $('#walkS').textContent = '';
  const r = $('#walkRetry'); r.hidden = false; r.textContent = t('walk.retry');
}
function closeWalk() {
  const W = $('#walk'); closePhoto(true); if (W.hidden) return;
  try { walk?.dispose(); } catch (e) { /* ignore */ }
  walk = null; $('#walkStage').innerHTML = ''; W.hidden = true;
  document.documentElement.classList.remove('walk-open');
  if (walkFromUnit && S.unit) { walkFromUnit = false; renderUnit(); dlgU().showModal(); }
  if (!(dlgU().open && phoneSheet())) resumeHero();
  (dlgU().open ? dlgU().querySelector('[data-act="walk"]') : $('#heroTour'))?.focus?.();
  if (dlgU().open && S.unit) prewarmWalkFor(S.unit, 2500);   // the spare renderer went with the walkthrough
}
function bindWalk() {
  $('#walkX').addEventListener('click', closeWalk);
  $('#walkRetry').addEventListener('click', () => walkArgs && openWalk(walkArgs.unitId, walkArgs.start, walkArgs.mode, walkArgs.room, walkArgs.from, walkArgs.after));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#walk').hidden && !$('#walkVeil').hidden) closeWalk(); });
  bindPick();
}
// ---------------------------------------------------------------- 3D tour: choose the building (C3 or C4), GT VILNYI
// The target flat is an available 3-room on floor 7 of the chosen building (any flat if none); the tour starts in its lobby.
function entryUnit(b) { return unitsOn(b, 7).find(x => x.rooms === 3 && statusOf(x) === 'available') || unitsOn(b, 7)[0] || UNITS.find(u => u.building === b); }
function pickBuilding() { const P = $('#pickB'); if (!P) return; P.hidden = false; P.querySelector('.opt')?.focus?.(); }
function closePick() { const P = $('#pickB'); if (P) P.hidden = true; $('#heroTour')?.focus?.(); }
function bindPick() {
  const P = $('#pickB'); if (!P) return;
  P.addEventListener('click', e => {
    if (e.target === P || e.target.closest('[data-pick-x]')) return closePick();
    const b = e.target.closest('[data-b]');
    if (b) { const u = entryUnit(b.dataset.b); closePick(); if (u) openWalk(u.id, 'lobby', 'walk'); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !P.hidden) closePick(); });
  $('#heroTour').addEventListener('click', pickBuilding);
  // GT VILNYI: the walkthrough opens in the car park, then City Drive starts in a car on the street outside the Marriott hotel
  $('#heroGT').addEventListener('click', () => { const u = entryUnit('C3'); if (u) openWalk(u.id, 'parking', 'walk', null, null, w => w.startCity({ startId: 'marriott' })); });
}

// ---------------------------------------------------------------- photoreal 360° tour (js/pano-tour.js, lazy)
// Pre-rendered path-traced panoramas per apartment type × design (assets/tour/tour.json). Shown in the #walk overlay,
// either on its own (unit panel button) or on top of a running Walkthrough (walk.js calls window.VRC.openPhotoTour);
// its "Live 3D" toggle goes back to / opens the Walkthrough at the same room.
let TOUR = null; let photo = null;
const tourReady = fetch('assets/tour/tour.json?v=3.12', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
  .then(m => { TOUR = m && m.types ? m : { types: {} }; refreshPhotoBtn(); return TOUR; });
const hasPhoto = u => !!(u && TOUR && TOUR.types[u.type] && Object.keys(TOUR.types[u.type].styles || {}).length);
const PHOTO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>';
function photoBtnHTML(u) {
  const ok = hasPhoto(u);
  return `<button type="button" class="act" data-act="${ok ? 'photo' : 'photo-soon'}" ${ok ? '' : `title="${esc(tourT(lang, 'soonHint'))}"`}>${PHOTO_ICON}<span>${esc(tourT(lang, ok ? 'btn' : 'soon'))}</span></button>`;
}
function refreshPhotoBtn() {
  const b = dlgU()?.querySelector?.('[data-act="photo"],[data-act="photo-soon"]');
  if (b && S.unit) b.outerHTML = photoBtnHTML(S.unit);
}
const roomRef = r => (r && typeof r === 'object' ? { kind: r.kind || 'living', index: r.index | 0 } : { kind: r || 'living', index: 0 });
async function openPhoto({ unitId, styleId, room, onBack, live, onFail } = {}) {
  const W = $('#walk'); const overWalk = !!(walk && !W.hidden);
  if (overWalk && live && live.pose) {
    // v4: nothing rendered for the spot the visitor stands on → the tour is not opened at all (walk.js stays in live 3D
    // and says so); it never opens somewhere else instead
    try { const m = await panoMod(); await m.tourReady; if (!m.hasSpot(live.pose, unitId)) { onFail?.(); return; } }
    catch (e) { console.warn('[photo] unavailable:', e); onFail?.(); return; }
  }
  closePhoto(true);
  if (!overWalk) {
    walkArgs = { unitId, start: 'apartment', mode: 'walk' };
    W.hidden = false; W.classList.remove('is-ready'); document.documentElement.classList.add('walk-open');
    if (dlgU().open) { walkFromUnit = true; dlgU().close(); }
    $('#walkVeil').hidden = false; $('#walkVeil').classList.remove('failed'); $('#walkRetry').hidden = true;
    showStill(unitId, 'apartment', roomRef(room));
    $('#walkT').textContent = tourT(lang, 'loading'); $('#walkS').textContent = '';
    hero?.pause();
  }
  const layer = document.createElement('div');
  layer.className = 'tour-layer'; layer.style.cssText = 'position:absolute;inset:0;z-index:30;background:#050505';
  W.appendChild(layer);
  const P = photo = { layer, handle: null, overWalk };
  const toLive = st => {
    const r = roomRef(st && st.room ? st.room : room);
    closePhoto(true);
    // over a running walkthrough the whole pose goes back (v3: position, yaw, pitch, fov — see walk.js _returnFromPhoto)
    if (overWalk && walk) { if (onBack) onBack(live ? (st || null) : r.kind, r.index); else walk.jumpToRoom?.(r.kind, r.index); return; }
    openWalk(unitId, r.kind === 'balcony' ? 'balcony' : ['lobby', 'corridor', 'parking'].includes(r.kind) ? r.kind : 'apartment', 'walk', r, st && st.unitId === unitId ? st : null);
  };
  try {
    const mod = await panoMod();
    if (photo !== P) return;
    P.handle = await mod.openPanoTour(layer, {
      unitId, styleId: styleId || S.styleId, room: roomRef(room), i18n: i18nApi, lang, dir, live: overWalk ? live : null,
      onExit: () => { closePhoto(true); closeWalk(); },
      onReserve: id => { closePhoto(true); closeWalk(); const u = unitById(id || unitId); if (u) { openUnit(u); reserve(u); } },
      onSwitchTo3D: toLive,
    });
    if (photo !== P) { P.handle?.dispose?.(); return; }
    // the realistic view of this very spot could not be produced: back to the live 3D exactly where it was, with a note
    if (overWalk && live && P.handle && P.handle.ok === false) { closePhoto(true); if (onBack) onBack(null); onFail?.(); return; }
    hideVeil(); W.classList.add('is-ready');
  } catch (e) {
    console.warn('[photo] unavailable:', e);
    if (overWalk && live) { closePhoto(true); if (onBack) onBack(null); onFail?.(); return; }   // stay where the visitor was, with the note
    toLive(null);
  }
}
let panoModP = null;
const panoMod = () => (panoModP ||= import('./pano-tour.js?v=3.12').catch(e => { panoModP = null; throw e; }));
let panoModV = null;
function closePhoto(silent) {
  const P = photo; if (!P) return; photo = null;
  try { P.handle?.dispose?.(); } catch (e) { /* ignore */ }
  P.layer.remove();
}
window.VRC = window.VRC || {};
// walk.js hook: ({unitId, styleId, room:{kind,index}, live:{pose, capture}, onBack(state), onFail()}) → Promise
window.VRC.openPhotoTour = (o = {}) => openPhoto({ unitId: o.unitId, styleId: o.styleId, room: o.room || o.roomKind, onBack: o.onBack, live: o.live, onFail: o.onFail });
window.VRC.hasPhotoTour = unitId => hasPhoto(unitById(unitId));
// walk.js: is there a photoreal view for this pose (walk.js _photoPose)? true / false, or undefined while the tour module
// and its manifest are still loading (they are fetched in the background on the first question)
window.VRC.hasPhotoAt = (pose, unitId) => {
  if (!panoModV) { panoMod().then(m => m.tourReady.then(() => { panoModV = m; })).catch(() => {}); return undefined; }
  try { return panoModV.hasSpot(pose, unitId); } catch { return undefined; }
};
if (/[?&]ptdebug\b/.test(location.search)) window.__VRC_DBG = { get walk() { return walk; }, get photo() { return photo; } };   // test hook (pano-work/v3/test_same_place.py)
window.VRC.photoTourReady = tourReady;
window.VRC.openBooking = id => { const u = unitById(id); if (u) reserve(u); else document.querySelector('.site-foot')?.scrollIntoView({ behavior: 'smooth' }); };

// ---------------------------------------------------------------- gallery (assets/gallery/manifest.json, filled by the lead)
const GAL_TYPES = ['exterior', 'interior', 'lobby', 'amenity'];
const G = { items: [], tab: 'all', lb: { list: [], i: 0 } };
const capOf = it => (it.caption ? (typeof it.caption === 'string' ? it.caption : (it.caption[lang] ?? it.caption.en ?? Object.values(it.caption)[0] ?? '')) : '');
const safeSrc = s => typeof s === 'string' && s && !/^[a-z][\w+.-]*:|^\/\//i.test(s) && !s.includes('..'); // local, relative only

async function loadGallery() {
  let url = 'assets/gallery/manifest.json?v=3.12';
  try { const q = new URLSearchParams(location.search).get('gallery'); if (q && safeSrc(q)) url = q; } catch (e) { /* ignore */ }
  let list = [];
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (r.ok) list = await r.json();
  } catch (e) { list = []; }
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  G.items = (Array.isArray(list) ? list : []).filter(it => it && safeSrc(it.src) && GAL_TYPES.includes(it.type))
    .map(it => ({ ...it, url: (it.src.startsWith('assets/') || it.src.startsWith('ai/')) ? it.src : base + it.src.replace(/^\.\//, '') }));
  renderGallery();
  if (dlgU().open) { renderUnitGallery(); if (S.unit) preloadStill(stillFor(S.unit, 'apartment')); }
}

function galList() { return G.tab === 'all' ? G.items : G.items.filter(i => i.type === G.tab); }
function renderGallery() {
  const has = G.items.length > 0;
  $('#gallery').hidden = !has; $$('.nav-gal').forEach(a => { a.hidden = !has; });
  if (!has) return;
  const types = GAL_TYPES.filter(ty => G.items.some(i => i.type === ty));
  if (!types.includes(G.tab)) G.tab = 'all';
  $('#galTabs').innerHTML = types.length > 1 ? ['all', ...types].map(ty => `<button type="button" role="tab" data-gt="${ty}" aria-selected="${ty === G.tab}" class="${ty === G.tab ? 'on' : ''}">${esc(t('gal.' + ty))}</button>`).join('') : '';
  const list = galList();
  $('#galGrid').innerHTML = list.map((it, i) => `<button type="button" class="gal-item${i === 0 ? ' feat' : ''}" data-gi="${i}" aria-label="${esc(t('gal.open'))}: ${esc(capOf(it) || t('gal.' + it.type))}">
      <img src="${esc(it.url)}" alt="" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async">
      <span class="gal-cap"><span class="gal-k">${esc(t('gal.' + it.type))}${it.style ? ' · ' + esc(t('style.' + it.style + '.n')) : ''}</span>${capOf(it) ? `<span class="gal-t">${esc(capOf(it))}</span>` : ''}</span></button>`).join('');
  $$('#galGrid img').forEach(img => img.addEventListener('error', () => img.closest('.gal-item')?.remove(), { once: true }));
}

// Images for the open unit: same type first, then interiors in the chosen style, then other interiors.
function unitGalleryList(u) {
  const score = it => (it.unitType === u.type ? 3 : 0) + (it.style === S.styleId ? 2 : 0) + (it.type === 'interior' ? 1 : 0);
  return G.items.filter(it => it.type === 'interior' || it.unitType === u.type)
    .filter(it => !it.unitType || it.unitType === u.type)
    .sort((a, b) => score(b) - score(a)).slice(0, 10);
}
function renderUnitGallery() {
  const host = dlgU().querySelector('#unitGal'); if (!host || !S.unit) return;
  const list = unitGalleryList(S.unit);
  host.hidden = !list.length;
  host.innerHTML = list.length ? `<h3 class="h5">${esc(t('unit.gallery'))}</h3><div class="ug-strip">${list.map((it, i) => `<button type="button" class="ug-item" data-ui="${i}" aria-label="${esc(t('gal.open'))}: ${esc(capOf(it) || t('gal.' + it.type))}"><img src="${esc(it.url)}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>` : '';
  host._list = list;
  host.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.closest('.ug-item')?.remove(), { once: true }));
}

// ---- lightbox (keyboard ←/→, swipe on touch, focus returns to the opener)
function lbShow(i) {
  const L = G.lb.list; if (!L.length) return;
  G.lb.i = (i + L.length) % L.length; const it = L[G.lb.i];
  const img = $('#lbImg'); img.classList.remove('in'); img.src = it.url; img.alt = capOf(it) || t('gal.' + it.type);
  img.decode?.().catch(() => {}).finally(() => requestAnimationFrame(() => img.classList.add('in')));
  $('#lbCap').textContent = [t('gal.' + it.type), it.style ? t('style.' + it.style + '.n') : '', capOf(it)].filter(Boolean).join(' · ');
  $('#lbN').textContent = `${G.lb.i + 1} / ${L.length}`;
  const multi = L.length > 1; $('#lightbox .lb-prev').hidden = !multi; $('#lightbox .lb-next').hidden = !multi;
}
function lbOpen(list, i) {
  G.lb.list = list; G.lb.ret = document.activeElement;
  const d = $('#lightbox'); if (!d.open) d.showModal(); document.documentElement.classList.add('modal-open');
  lbShow(i); d.querySelector('.lb-x').focus();
}
function lbClose() {
  const d = $('#lightbox'); if (!d.open) return; d.close();
  if (!dlgU().open) document.documentElement.classList.remove('modal-open');
  G.lb.ret?.focus?.({ preventScroll: true });
}
function bindGallery() {
  $('#galTabs').addEventListener('click', e => { const ty = e.target.closest('[data-gt]')?.dataset.gt; if (ty) { G.tab = ty; renderGallery(); $(`#galTabs [data-gt="${ty}"]`)?.focus(); } });
  $('#galGrid').addEventListener('click', e => { const b = e.target.closest('[data-gi]'); if (b) lbOpen(galList(), +b.dataset.gi); });
  const d = $('#lightbox');
  const rtlStep = k => (dir === 'rtl' ? -k : k);
  d.addEventListener('cancel', e => { e.preventDefault(); lbClose(); });
  d.addEventListener('click', e => {
    const a = e.target.closest('[data-lb]')?.dataset.lb;
    if (a === 'close') lbClose(); else if (a === 'prev') lbShow(G.lb.i - 1); else if (a === 'next') lbShow(G.lb.i + 1);
    else if (e.target === d || e.target.id === 'lbStage') lbClose();
  });
  d.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); lbShow(G.lb.i + rtlStep(-1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); lbShow(G.lb.i + rtlStep(1)); }
  });
  let sw = null; const stage = $('#lbStage');
  stage.addEventListener('pointerdown', e => { sw = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  stage.addEventListener('pointerup', e => {
    if (!sw || sw.id !== e.pointerId) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { lbShow(G.lb.i + (dx < 0 ? rtlStep(1) : rtlStep(-1))); }
  });
  stage.addEventListener('pointercancel', () => { sw = null; });
}

// ---------------------------------------------------------------- hero 3D (lazy)
let hero = null;
let heroDeferred = false;
function startHero() {
  if (hero) return;
  let save = false; try { save = !!navigator.connection?.saveData; } catch (e) {}
  if (save) return;
  hero = createHero3D({
    heroHost: $('#heroHost'), finderHost: $('#finderHost'), reducedMotion: reduced,
    // a floor tapped on the finder's own 3D view must not move the page; one picked on the hero scrolls to the finder
    onFloor: (b, f, where) => { if (b !== S.b || f !== S.f) setFloor(b, f, { scroll: where === 'hero' }); else if (where === 'hero') setFloor(b, f, { scroll: true }); },
    onState: (s, a) => {
      if (s === 'hover') { markHoverChip(a); return; }
      if (s === 'ready') {
        document.body.classList.add('has-3d');
        $('#modeCtl').hidden = false; $('#heroHint').hidden = false; markMode('dusk');
        hero.focusFloor(S.b, S.f);
      } else if (s === 'failed') { document.body.classList.add('no-3d'); hero = null; }
    },
  });
  // Under a full-screen unit sheet (phones) or the walkthrough the hero is invisible: building it now would only
  // compete with the walkthrough's pre-warm. It is created (the slideshow keeps its 3D slide) but built once the
  // page is visible again (closeUnit / closeWalk → resumeHero).
  if ((dlgU().open && phoneSheet()) || !$('#walk').hidden) { heroDeferred = true; return; }
  hero.init();
}
const resumeHero = () => {
  if (!hero) return;
  hero.resume();
  if (heroDeferred) { heroDeferred = false; onIdle(() => hero?.init(), 1500); }
};
function markMode(m) { S.timeMode = m; $$('#modeCtl button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m)); }

// ---------------------------------------------------------------- header / nav / language
function bindHeader() {
  const head = $('#head');
  const onScroll = () => head.classList.toggle('scrolled', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const nav = $('#nav'), mb = $('#menuBtn');
  mb.addEventListener('click', () => { const o = !nav.classList.contains('open'); nav.classList.toggle('open', o); mb.setAttribute('aria-expanded', o); head.classList.toggle('menu-open', o); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) { nav.classList.remove('open'); mb.setAttribute('aria-expanded', false); head.classList.remove('menu-open'); } });
  bindLangMenu();
  $('#modeCtl').addEventListener('click', e => { const m = e.target.closest('[data-mode]')?.dataset.mode; if (m) { hero?.setMode(m); markMode(m); } });
}
// Language dropdown: flag + native name, keyboard navigable (listbox pattern)
function markLang() {
  const L = langInfo(lang);
  $('#langBtn').innerHTML = `${L.flagSvg}<span class="lang-code">${L.short}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>`;
  $('#langBtn').setAttribute('aria-label', `${t('lang.menu')}: ${L.name}`);
  $('#langMenu').setAttribute('aria-label', t('lang.menu'));
  $('#langMenu').innerHTML = LANGS.map(l => `<li role="option" id="lo-${l.code}" tabindex="-1" data-lang="${l.code}" lang="${l.code}" dir="ltr" aria-selected="${l.code === lang}">${l.flagSvg}<span dir="${l.dir}">${l.name}</span><span class="lang-code-sm">${l.code.toUpperCase()}</span>${l.code === lang ? '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}</li>`).join('');
}
function bindLangMenu() {
  const btn = $('#langBtn'), menu = $('#langMenu');
  const items = () => $$('#langMenu [role="option"]');
  const open = () => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); (menu.querySelector('[aria-selected="true"]') || items()[0]).focus(); };
  const close = (focusBtn = true) => { if (menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focusBtn) btn.focus(); };
  btn.addEventListener('click', () => (menu.hidden ? open() : close()));
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
  menu.addEventListener('click', e => { const li = e.target.closest('[data-lang]'); if (!li) return; close(); if (li.dataset.lang !== lang) setLang(li.dataset.lang); });
  menu.addEventListener('keydown', e => {
    const list = items(); const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement?.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !e.target.closest('#lang')) close(false); });
}

function rerenderAll() {
  markLang(); renderStatic(); renderFilters(); renderTabs(); renderStack(); renderElev(); renderLegend(); renderCount();
  plan.refresh();
  setPlanNote();
  if (S.view === 'list') renderList();
  if (dlgU().open) renderUnit();
  renderGallery();
  if ($('#lightbox').open) lbShow(G.lb.i);
  try { walk?.refreshTexts?.(); } catch (e) { /* HUD keeps previous texts */ }
  hero?.relayout?.();
  if (!$('#walkVeil').hidden) { $('#walkT').textContent = t($('#walkVeil').classList.contains('failed') ? 'walk.unavailable' : 'walk.loading'); }
}

// ---------------------------------------------------------------- boot
function boot() {
  setLang(initialLang(), false);   // resolved language (URL → saved choice → visitor's country); not stored as a choice
  plan = createPlan($('#plan'), {
    statusOf, matches: u => matches(u),
    onSelect: u => openUnit(u),
    onHover: u => hero?.highlightUnits(u ? [u.id] : (S.unit && dlgU().open ? [S.unit.id] : null)),
  });
  bindHeader(); bindFilters(); bindFinder(); bindUnit(); bindWalk(); bindGallery();
  rerenderAll();
  setFloor(S.b, S.f);
  onLangChange(rerenderAll);

  // deep link #u=C3-5-07
  const m = location.hash.match(/^#u=([\w-]+)/);
  if (m && unitById(m[1])) { const u = unitById(m[1]); setFloor(u.building, u.floor); openUnit(u); }

  loadGallery();
  // Reservations are read only in the CRM; reading the db on page load made claude.ai show a sign-in prompt to every visitor.
  if (false) loadReservations().then(ids => { if (!ids.size) return; ids.forEach(id => reserved.add(id)); plan.refresh(); renderStack(); if (S.view === 'list') renderList(); if (dlgU().open) renderUnit(); }).catch(() => {});

  const kick = () => {
    (window.requestIdleCallback ? requestIdleCallback(startHero, { timeout: 1500 }) : setTimeout(startHero, 400));
    setTimeout(() => onIdle(preloadWalkModules), 1500);           // fetch + compile the walkthrough's modules
    // then its textures (worker; cached in IndexedDB). Phones wait for a unit panel (intent): the decoded textures of
    // one design weigh tens of MB until the walkthrough uses them.
    if (!dlgU().open && !matchMedia('(pointer: coarse)').matches) prewarmWalkFor(null, 4000);
  };
  if (document.readyState === 'complete') kick(); else addEventListener('load', kick, { once: true });
}
boot();
