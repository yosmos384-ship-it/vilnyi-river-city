// Floor-plan SVG drawn purely from data.js geometry (building-local metres; svg x = x along the bar, svg y = z), i.e. the
// same orientation as the permit CAD plans: bar horizontal, wing at the right — C3's wing up, C4's (mirror image) down.
// The north arrow points to true north.
import { UNITS, TYPES, GEOM, BUILDINGS, LAKE, TOP_FLOOR, COMPASS,
  unitsOn, blocksOn, unitToLocal, localToWorld, money, moneyRate, footprintOf, corridorsOf, coresOf, isMirrored } from './data.js?v=3.6';
import { t } from './i18n.js?v=3.6';

const NS = 'http://www.w3.org/2000/svg';
// full-floor view box per block (136 × 85 = the CSS 1.6 aspect): the free side of the bar carries title, north, scale, lake
const boundsOf = b => (isMirrored(b) ? { x: -4, y: -51, w: 136, h: 85 } : { x: -4, y: -34, w: 136, h: 85 });
let BOUNDS = boundsOf('C3');
const f1 = n => (Math.round(n * 100) / 100).toString();
const fmtArea = n => n.toFixed(1);

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const pts = arr => arr.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');

// Unit polygons in building-local coords
export function unitPoly(u) {
  return [[0, 0], [u.width, 0], [u.width, u.depth], [0, u.depth]].map(([a, b]) => unitToLocal(u, a, b));
}
export function outdoorPoly(u) {
  const T = TYPES[u.type];
  const d = GEOM.balconyDepth;
  let len = T.outdoorKind === 'terrace' ? u.width - 0.3 : Math.min(u.width - 0.4, Math.max(2.2, T.outdoor / d));
  const s = (u.width - len) / 2;
  return [[s, u.depth], [s + len, u.depth], [s + len, u.depth + d], [s, u.depth + d]].map(([a, b]) => unitToLocal(u, a, b));
}
function centroid(poly) { let x = 0, y = 0; poly.forEach(p => { x += p[0]; y += p[1]; }); return [x / poly.length, y / poly.length]; }

// Direction from the building towards the lake centre (world), for the "Lacul Morii" hint arrow.
function lakeBearing(bId) {
  const [wx, wz] = localToWorld(bId, 60, 0);
  const dx = LAKE.center[0] - wx, dz = LAKE.center[1] - wz; const L = Math.hypot(dx, dz);
  return [dx / L, dz / L];
}

function defs(svg) {
  const d = el('defs', {}, svg);
  const hatch = el('pattern', { id: 'pl-hatch', width: 1.2, height: 1.2, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, d);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 1.2, class: 'pl-hatch-line' }, hatch);
  const hatch2 = el('pattern', { id: 'pl-hatch-res', width: 0.9, height: 0.9, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, d);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 0.9, class: 'pl-hatch-res' }, hatch2);
  const glow = el('filter', { id: 'pl-glow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, d);
  el('feGaussianBlur', { stdDeviation: 0.45, result: 'b' }, glow);
  const m = el('feMerge', {}, glow); el('feMergeNode', { in: 'b' }, m); el('feMergeNode', { in: 'SourceGraphic' }, m);
}

function drawCore(g, c, floor) {
  const cg = el('g', { class: 'pl-core' }, g);
  el('rect', { x: c.x0, y: c.z0, width: c.x1 - c.x0, height: c.z1 - c.z0, class: 'pl-core-box' }, cg);
  // lift shafts behind each landing door (door on corridor wall, shaft goes against liftNormal)
  const sw = 2.1, sd = 2.1;
  for (const [x, z] of c.liftDoors) {
    const nz = c.liftNormal[1];
    const y0 = nz > 0 ? z - sd : z; const x0 = x - sw / 2;
    el('rect', { x: x0 + 0.1, y: y0 + 0.1, width: sw - 0.2, height: sd - 0.2, class: 'pl-lift' }, cg);
    el('path', { d: `M${x0 + 0.1} ${y0 + 0.1}L${x0 + sw - 0.1} ${y0 + sd - 0.1}M${x0 + sw - 0.1} ${y0 + 0.1}L${x0 + 0.1} ${y0 + sd - 0.1}`, class: 'pl-lift-x' }, cg);
    el('line', { x1: x - 0.6, y1: z - 0.02, x2: x + 0.6, y2: z - 0.02, class: 'pl-lift-door' }, cg);
  }
  // stair: two flights along x with a landing, in the part of the core away from the corridor
  const cp = c.liftNormal[1] > 0;   // corridor on +z of the core
  const sx0 = c.x0 + 0.5, sx1 = c.x1 - 0.5, sz0 = cp ? c.z0 + 0.45 : c.z0 + 2.6, sz1 = cp ? c.z1 - 2.6 : c.z1 - 0.45;
  const mid = (sz0 + sz1) / 2, run0 = sx0 + 1.4, run1 = sx1 - 0.4;
  el('rect', { x: sx0, y: sz0, width: sx1 - sx0, height: sz1 - sz0, class: 'pl-stair-box' }, cg);
  el('line', { x1: run0, y1: mid, x2: run1, y2: mid, class: 'pl-stair-mid' }, cg);
  let p = '';
  for (let x = run0; x <= run1 + 1e-6; x += 0.3) p += `M${f1(x)} ${f1(sz0)}V${f1(sz1)}`;
  el('path', { d: p, class: 'pl-tread' }, cg);
  el('path', { d: `M${f1(run1 - 0.2)} ${f1(sz0 + (mid - sz0) / 2)}H${f1(run0 + 0.4)}M${f1(run0 + 0.4)} ${f1(mid + (sz1 - mid) / 2)}H${f1(run1 - 0.4)}`, class: 'pl-stair-arrow', 'marker-end': null }, cg);
  el('circle', { cx: run1 - 0.4, cy: mid + (sz1 - mid) / 2, r: 0.18, class: 'pl-stair-dot' }, cg);
  // building entrance (north facade) exists on the ground floor only; upper floors just name the stair inside the core
  const [ex, ez] = c.entrance, es = ez < 0 ? 1 : -1;   // entrance arrow points into the building
  if (floor === 0) {
    el('path', { d: `M${ex - 0.9} ${ez - es * 1.6}L${ex} ${ez - es * 0.25}L${ex + 0.9} ${ez - es * 1.6}Z`, class: 'pl-entry' }, cg);
    const tl = el('text', { x: ex, y: ez - es * 2.4 + (es < 0 ? 0.9 : 0), class: 'pl-core-label', 'text-anchor': 'middle', direction: document.documentElement.dir }, cg);
    tl.textContent = `${t('ul.stair')} ${c.stair}`;
  } else {
    const tl = el('text', { x: (c.x0 + c.x1) / 2, y: (sz0 + sz1) / 2 + 0.5, class: 'pl-core-label in', 'text-anchor': 'middle', direction: document.documentElement.dir }, cg);
    tl.textContent = `${t('ul.stair')} ${c.stair}`;
  }
}

function drawNorth(g, x, y, bId) {
  // true north in building-local (x, z) = svg (x, y): the needle is drawn along −y and turned onto it
  const a = (0 - COMPASS.negZ) * Math.PI / 180, [nx, nz] = [Math.sin(a), -Math.cos(a)];
  const rot = Math.atan2(nx, -nz) * 180 / Math.PI;
  const n = el('g', { class: 'pl-north', transform: `translate(${x} ${y}) rotate(${f1(rot)})` }, g);
  el('circle', { cx: 0, cy: 0, r: 2.3, class: 'pl-north-ring' }, n);
  el('path', { d: 'M0 -2.9L0.85 0.6L0 0.1L-0.85 0.6Z', class: 'pl-north-needle' }, n);
  el('path', { d: 'M0 2.9L0.85 -0.6L0 -0.1L-0.85 -0.6Z', class: 'pl-north-tail' }, n);
  const tx = el('text', { x: 0, y: -3.6, 'text-anchor': 'middle', class: 'pl-north-t' }, n);
  tx.textContent = t('plan.north');
}

function drawScale(g, x, y) {
  const s = el('g', { class: 'pl-scale', transform: `translate(${x} ${y})` }, g);
  el('path', { d: 'M0 0H10M0 -0.5V0.5M5 -0.35V0.35M10 -0.5V0.5', class: 'pl-scale-line' }, s);
  const a = el('text', { x: 0, y: -1.1, class: 'pl-scale-t', 'text-anchor': 'middle' }, s); a.textContent = '0';
  const b = el('text', { x: 10, y: -1.1, class: 'pl-scale-t', 'text-anchor': 'middle' }, s); b.textContent = `10 ${t('plan.m')}`;
}

export function statusClass(s) { return s === 'reserved' ? 'is-res' : s === 'sold' ? 'is-sold' : 'is-avail'; }

// ---------------------------------------------------------------------------------------------
export function createPlan(host, opts = {}) {
  const { onSelect = () => {}, onHover = () => {}, statusOf = u => u.status, matches = () => true } = opts;
  host.classList.add('plan');
  host.innerHTML = '';
  const stage = document.createElement('div'); stage.className = 'plan-stage'; host.appendChild(stage);
  const svg = el('svg', { class: 'plan-svg', viewBox: `${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}`, role: 'group', direction: 'ltr' }, stage);
  defs(svg);
  const root = el('g', {}, svg);
  const card = document.createElement('div'); card.className = 'plan-card'; card.hidden = true; host.appendChild(card);
  const tools = document.createElement('div'); tools.className = 'plan-tools';
  tools.innerHTML = `<button type="button" class="icon-btn" data-z="in"><span aria-hidden="true">+</span></button>
    <button type="button" class="icon-btn" data-z="out"><span aria-hidden="true">−</span></button>
    <button type="button" class="icon-btn" data-z="reset"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>`;
  host.appendChild(tools);

  let cur = { b: 'C3', f: 5 }; let selected = null; let unitEls = new Map();
  let view = { ...BOUNDS };

  function labelTools() {
    const L = { in: 'finder.zoomIn', out: 'finder.zoomOut', reset: 'finder.zoomReset' };
    tools.querySelectorAll('button').forEach(b => { b.setAttribute('aria-label', t(L[b.dataset.z])); b.title = t(L[b.dataset.z]); });
    svg.setAttribute('aria-label', `${cur.b} · ${cur.f === 0 ? t('unit.ground') : t('unit.floor', { n: cur.f })}`);
  }

  function draw() {
    root.innerHTML = ''; unitEls = new Map();
    const { b, f } = cur;
    const CORES = coresOf(b), mir = isMirrored(b);   // C3 is drawn with its wing up, C4 (mirror image) with it down
    // footprint slab
    el('polygon', { points: pts(footprintOf(b)), class: 'pl-slab' }, root);
    // corridors
    const wing = corridorsOf(b).find(c => c.id === 'wing');
    for (const c of corridorsOf(b)) {
      el('rect', { x: c.x0, y: c.z0, width: c.x1 - c.x0, height: c.z1 - c.z0, class: 'pl-corr' }, root);
    }
    const wx = (wing.x0 + wing.x1) / 2;
    el('path', { d: `M1.6 0H${f1(wx)}M${f1(wx)} ${f1(wing.z0 + 0.6)}V${f1(wing.z1 - 0.6)}`, class: 'pl-corr-axis' }, root);
    const ct = el('text', { x: 11.5, y: 0.45, class: 'pl-corr-t', 'text-anchor': 'middle' }, root); ct.textContent = t('plan.corridor');

    // ground-floor non-residential blocks
    for (const bl of blocksOn(b, f)) {
      const fr = { building: b, frame: bl.frame };
      const poly = [[0, 0], [bl.width, 0], [bl.width, bl.depth], [0, bl.depth]].map(([a, c]) => unitToLocal(fr, a, c));
      const g = el('g', { class: `pl-block pl-block-${bl.kind}` }, root);
      el('polygon', { points: pts(poly), class: 'pl-block-body' }, g);
      const [cx, cy] = centroid(poly);
      const tx = el('text', { x: cx, y: cy + 0.5, 'text-anchor': 'middle', class: 'pl-block-t' }, g);
      tx.textContent = bl.kind === 'stair' || bl.kind === 'lobby' ? `${t('ul.stair')} 2` : t('plan.' + bl.kind);
      const vertical = Math.abs(bl.frame.U[1]) > 0.5; // S4/S5 blocks run along z
      if (vertical) tx.setAttribute('transform', `rotate(-90 ${f1(cx)} ${f1(cy + 0.5)})`);
    }

    // units
    const list = unitsOn(b, f);
    for (const u of list) {
      const T = TYPES[u.type];
      const st = statusOf(u);
      const g = el('g', { class: `pl-unit r${u.rooms} ${statusClass(st)}`, 'data-id': u.id, tabindex: 0, role: 'button' }, root);
      g.setAttribute('aria-label', ariaFor(u, st));
      el('polygon', { points: pts(outdoorPoly(u)), class: 'pl-out' }, g);
      const poly = unitPoly(u);
      el('polygon', { points: pts(poly), class: 'pl-body' }, g);
      if (st !== 'available') el('polygon', { points: pts(poly), class: 'pl-body-hatch' }, g);
      // facade glazing line + entrance door tick on the corridor wall
      const g0 = unitToLocal(u, 0.35, u.depth - 0.18), g1 = unitToLocal(u, u.width - 0.35, u.depth - 0.18);
      el('line', { x1: g0[0], y1: g0[1], x2: g1[0], y2: g1[1], class: 'pl-glass' }, g);
      const d0 = unitToLocal(u, u.door.u - 0.45, 0), d1 = unitToLocal(u, u.door.u + 0.45, 0), dIn = unitToLocal(u, u.door.u - 0.45, 0.9);
      el('path', { d: `M${f1(d0[0])} ${f1(d0[1])}L${f1(dIn[0])} ${f1(dIn[1])}A0.9 0.9 0 0 ${u.frame.U[0] + u.frame.U[1] > 0 ? 1 : 0} ${f1(d1[0])} ${f1(d1[1])}`, class: 'pl-door' }, g);
      // label
      const [cx, cy] = centroid(poly);
      const lt = el('text', { x: cx, y: cy - 0.1, 'text-anchor': 'middle', class: 'pl-num' }, g);
      lt.textContent = String(u.index).padStart(2, '0');
      const at = el('text', { x: cx, y: cy + 2.0, 'text-anchor': 'middle', class: 'pl-area' }, g);
      at.textContent = `${fmtArea(T.total)} m²`;
      if (T.duplex) { const dt = el('text', { x: cx, y: cy - 2.5, 'text-anchor': 'middle', class: 'pl-dup' }, g); dt.textContent = 'DUPLEX'; }
      unitEls.set(u.id, g);
    }

    // cores on top so the stair symbols read clearly
    for (const c of CORES) drawCore(root, c, f);

    // courtyard annotations: floor title, north arrow, scale, lake bearing
    // Titles mix Latin ids with the UI language, so they follow the page direction (start edge stays at x=1)
    const rtl = document.documentElement.dir === 'rtl';
    const tAttr = rtl ? { direction: 'rtl', 'text-anchor': 'end' } : {};
    const title = el('text', { x: 1, y: mir ? -35.2 : 21.8, class: 'pl-title', ...tAttr }, root);
    title.textContent = `${b} · ${f === 0 ? t('unit.ground') : t('unit.floor', { n: f === TOP_FLOOR ? '10 / 10D' : f })}`;
    const sub = el('text', { x: 1, y: mir ? -32.3 : 24.7, class: 'pl-sub', ...tAttr }, root);
    sub.textContent = f === 0 ? '' : `${list.length} · ${t('finder.avail', { n: list.filter(u => statusOf(u) === 'available').length })}`;
    drawNorth(root, 92, mir ? -34 : 22, b);
    drawScale(root, 1.5, mir ? -24 : 34);
    const [lx, lz] = lakeBearing(b);
    const lg = el('g', { class: 'pl-lake', transform: `translate(62 ${mir ? -23 : 36})` }, root);
    const ang = Math.atan2(lz, lx) * 180 / Math.PI;
    el('path', { d: 'M-3 0H3M1.6 -1.1L3 0L1.6 1.1', class: 'pl-lake-arrow', transform: `rotate(${f1(ang)})` }, lg);
    const lt2 = el('text', { x: 0, y: 3.8, 'text-anchor': 'middle', class: 'pl-lake-t' }, lg); lt2.textContent = t('plan.lake');
    el('path', { d: 'M-3.8 5.2q1 -0.6 2 0t2 0t2 0t2 0', class: 'pl-wave' }, lg);

    if (selected && unitEls.has(selected)) unitEls.get(selected).classList.add('is-sel');
    applyMatches();
    labelTools();
  }

  function ariaFor(u, st) {
    const T = TYPES[u.type];
    return `${u.building} ${u.id.split('-').slice(1).join('-')} · ${u.rooms === 1 ? t('rooms.1') : t('rooms.n', { n: u.rooms })} · ${fmtArea(T.total)} m² · ${money(u.price)} · ${t('face.' + u.facing)}${u.view !== 'none' ? ' · ' + t('lake.' + u.view) : ''} · ${t('status.' + st)}`;
  }

  function applyMatches() {
    for (const [id, g] of unitEls) {
      const u = UNITS_BY_ID.get(id);
      g.classList.toggle('is-dim', !matches(u));
    }
  }

  // ---- hover card ----
  function showCard(u, clientX, clientY) {
    const T = TYPES[u.type]; const st = statusOf(u);
    card.innerHTML = `<div class="pc-top"><span class="pc-id">${u.building} · ${u.floor === 0 ? t('unit.ground') : t('unit.floor', { n: u.floor })} · #${String(u.index).padStart(2, '0')}</span><span class="pc-st ${statusClass(st)}">${t('status.' + st)}</span></div>
      <div class="pc-rooms"><i class="dot r${u.rooms}"></i>${u.rooms === 1 ? t('rooms.1') : t('rooms.n', { n: u.rooms })}${T.duplex ? ' · ' + t('rooms.duplex') : ''}</div>
      <div class="pc-price" dir="ltr">${money(u.price)}</div>
      <div class="pc-meta"><span dir="ltr">${fmtArea(T.total)} m²</span><span dir="ltr">${moneyRate(u.rate)}/m²</span><span>${t('face.' + u.facing)}</span>${u.view !== 'none' ? `<span class="pc-lk">${t('lake.' + u.view)}</span>` : ''}</div>`;
    card.hidden = false;
    const hr = host.getBoundingClientRect(); const cw = card.offsetWidth, ch = card.offsetHeight;
    let x = clientX - hr.left + 16, y = clientY - hr.top + 16;
    if (x + cw > hr.width - 8) x = clientX - hr.left - cw - 16;
    if (y + ch > hr.height - 8) y = clientY - hr.top - ch - 16;
    card.style.left = Math.max(8, x) + 'px'; card.style.top = Math.max(8, y) + 'px';
  }
  function hideCard() { card.hidden = true; }

  // ---- pointer interaction: pan/zoom + click ----
  const pointers = new Map(); let drag = null; let moved = 0; let pinch = null;
  function setView(v) {
    const minW = BOUNDS.w / 6;
    v.w = Math.min(BOUNDS.w, Math.max(minW, v.w)); v.h = v.w * BOUNDS.h / BOUNDS.w;
    v.x = Math.min(BOUNDS.x + BOUNDS.w - v.w, Math.max(BOUNDS.x, v.x));
    v.y = Math.min(BOUNDS.y + BOUNDS.h - v.h, Math.max(BOUNDS.y, v.y));
    view = v; svg.setAttribute('viewBox', `${f1(v.x)} ${f1(v.y)} ${f1(v.w)} ${f1(v.h)}`);
    const zoomed = v.w < BOUNDS.w - 0.01;
    stage.classList.toggle('is-zoomed', zoomed);
  }
  function toSvg(cx, cy) { const r = svg.getBoundingClientRect(); return [view.x + (cx - r.left) / r.width * view.w, view.y + (cy - r.top) / r.height * view.h]; }
  function zoomAt(k, cx, cy) {
    const [sx, sy] = cx == null ? [view.x + view.w / 2, view.y + view.h / 2] : toSvg(cx, cy);
    const nw = view.w / k; const nh = nw * BOUNDS.h / BOUNDS.w;
    setView({ x: sx - (sx - view.x) * nw / view.w, y: sy - (sy - view.y) * nh / view.h, w: nw, h: nh });
  }
  tools.addEventListener('click', e => {
    const z = e.target.closest('button')?.dataset.z; if (!z) return;
    if (z === 'in') zoomAt(1.5); else if (z === 'out') zoomAt(1 / 1.5); else setView({ ...BOUNDS });
  });
  svg.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey) && view.w >= BOUNDS.w - 0.01) return; // let the page scroll unless zooming
    e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
  }, { passive: false });
  svg.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
    if (pointers.size === 2) {
      const [a, b2] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b2[0], a[1] - b2[1]), w: view.w, mid: [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2] };
      drag = null;
    } else if (view.w < BOUNDS.w - 0.01 || e.pointerType === 'mouse') {
      drag = { x: e.clientX, y: e.clientY, v: { ...view } };
    }
  });
  svg.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pointers.size === 2) {
      const [a, b2] = [...pointers.values()]; const d = Math.hypot(a[0] - b2[0], a[1] - b2[1]);
      // target width = start width scaled by finger distance; zoomAt takes a factor relative to the current width
      zoomAt(view.w * d / (pinch.w * pinch.d), pinch.mid[0], pinch.mid[1]);
      moved = 99; hideCard(); return;
    }
    if (drag && pointers.size === 1) {
      const r = svg.getBoundingClientRect(); const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved > 4 && view.w < BOUNDS.w - 0.01) { setView({ ...view, x: drag.v.x - dx / r.width * view.w, y: drag.v.y - dy / r.height * view.h }); hideCard(); }
    }
    if (e.pointerType === 'mouse' && !pointers.size) {
      const g = e.target.closest?.('.pl-unit');
      if (g) { const u = UNITS_BY_ID.get(g.dataset.id); showCard(u, e.clientX, e.clientY); hover(u); }
      else { hideCard(); hover(null); }
    }
  });
  const endPtr = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) drag = null; };
  svg.addEventListener('pointerup', endPtr); svg.addEventListener('pointercancel', endPtr);
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hideCard(); hover(null); } });
  svg.addEventListener('click', e => {
    if (moved > 6) return;
    const g = e.target.closest('.pl-unit'); if (!g) return;
    select(g.dataset.id); onSelect(UNITS_BY_ID.get(g.dataset.id));
  });
  svg.addEventListener('keydown', e => {
    const g = e.target.closest?.('.pl-unit');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(g.dataset.id); onSelect(UNITS_BY_ID.get(g.dataset.id)); }
    if (e.key === '+' || e.key === '=') zoomAt(1.4); if (e.key === '-') zoomAt(1 / 1.4);
  });
  svg.addEventListener('focusin', e => {
    const g = e.target.closest?.('.pl-unit'); if (!g) return;
    const r = g.getBoundingClientRect(); const u = UNITS_BY_ID.get(g.dataset.id);
    showCard(u, r.right, r.top + r.height / 2); hover(u);
  });
  svg.addEventListener('focusout', () => { hideCard(); hover(null); });
  let lastHover = null;
  function hover(u) { const id = u?.id || null; if (id === lastHover) return; lastHover = id; onHover(u || null); }

  function select(id) {
    if (selected && unitEls.has(selected)) unitEls.get(selected).classList.remove('is-sel');
    selected = id; if (id && unitEls.has(id)) unitEls.get(id).classList.add('is-sel');
  }

  draw();
  return {
    show(b, f) { cur = { b, f }; BOUNDS = boundsOf(b); setView({ ...BOUNDS }); hideCard(); draw(); },
    refresh() { draw(); },
    applyMatches,
    select,
    get current() { return { ...cur }; },
  };
}
const UNITS_BY_ID = new Map(UNITS.map(u => [u.id, u]));

// Small static key plan (string) for the unit panel: the floor outline with one unit picked out.
export function keyPlanSVG(unit) {
  const us = unitsOn(unit.building, unit.floor);
  const p = a => a.map(q => `${f1(q[0])},${f1(q[1])}`).join(' ');
  const b = unit.building, mir = isMirrored(b);
  let s = `<svg class="keyplan" viewBox="${mir ? '-3 -37 134 54' : '-3 -17 134 54'}" role="img" aria-label="${t('unit.keyplan')}" direction="ltr">`;
  s += `<polygon points="${p(footprintOf(b))}" class="kp-slab"/>`;
  for (const c of corridorsOf(b)) s += `<rect x="${c.x0}" y="${c.z0}" width="${c.x1 - c.x0}" height="${c.z1 - c.z0}" class="kp-corr"/>`;
  for (const c of coresOf(b)) s += `<rect x="${c.x0}" y="${c.z0}" width="${c.x1 - c.x0}" height="${c.z1 - c.z0}" class="kp-core"/>`;
  for (const u of us) {
    const on = u.id === unit.id;
    s += `<polygon points="${p(unitPoly(u))}" class="kp-u${on ? ' on' : ''}"/>`;
    if (on) s += `<polygon points="${p(outdoorPoly(u))}" class="kp-u on out"/>`;
  }
  { const a = (0 - COMPASS.negZ) * Math.PI / 180, rot = Math.atan2(Math.sin(a), Math.cos(a)) * 180 / Math.PI;
    s += `<g transform="translate(6 ${mir ? -30 : 30}) rotate(${f1(rot)})"><circle r="2.4" class="kp-n"/><path d="M0 -3L.9 .6 0 .1-.9 .6Z" class="kp-nn"/></g>`; }
  s += `</svg>`;
  return s;
}
