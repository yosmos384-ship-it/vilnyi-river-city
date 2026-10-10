// Units inventory: all UNITS from data.js, effective status (CRM units/{id} doc > active web reservation > available),
// floor-matrix and table views, bulk status changes. Writes units/{unitId} = {status, clientId, dealId, updatedAt}.
import { UNITS, TYPES, unitById, money } from '../data.js?v=3.10';
import { unitLabelL } from '../i18n.js?v=3.10';
import { tc } from './i18n-crm.js?v=3.10';
import { unitState, setUnitStatus, get, entries, clientName, UNIT_STATUSES, all, patchDoc } from './store.js?v=3.10';
import { esc, icon, eur, fmtDate, openModal, toast, $, $$, formData } from './util.js?v=3.10';
import { pageHead, statusChip, statusOptions, clientOptions, fld, empty } from './ui.js?v=3.10';
import { STATUS_COLORS, legend } from './charts.js?v=3.10';

const F = { view: 'grid', b: '', floor: '', rooms: '', status: '', q: '' };
try { F.view = localStorage.getItem('vrc.crm.unitView') || 'grid'; } catch (e) { /* ignore */ }

function list() {
  const q = F.q.toLowerCase();
  return UNITS.filter(u => (!F.b || u.building === F.b) && (F.floor === '' || u.floor === Number(F.floor)) && (!F.rooms || u.rooms === Number(F.rooms))
    && (!F.status || unitState(u.id).status === F.status) && (!q || u.id.toLowerCase().includes(q) || String(u.apNo) === q || (unitState(u.id).clientId && clientName(get('clients', unitState(u.id).clientId)).toLowerCase().includes(q))));
}

export function render(root, name, params) {
  const rows = list(); const counts = Object.fromEntries(UNIT_STATUSES.map(s => [s, 0])); UNITS.forEach(u => counts[unitState(u.id).status]++);
  root.innerHTML = `${pageHead(tc('nav.units'), esc(tc('un.sub', { n: UNITS.length })), `<div class="seg" role="group" aria-label="${esc(tc('view'))}"><button data-view="grid" aria-pressed="${F.view === 'grid'}">${icon('grid')}${esc(tc('un.grid'))}</button><button data-view="table" aria-pressed="${F.view === 'table'}">${icon('list')}${esc(tc('un.table'))}</button></div><button class="btn ghost sm" data-act="csv">${icon('down')}${esc(tc('exportCsv'))}</button>`)}
  <div class="status-tiles">${UNIT_STATUSES.map(s => `<button class="st-tile ${F.status === s ? 'on' : ''}" data-status="${s}" style="--c:${STATUS_COLORS[s]}"><i></i><span>${esc(tc('st.' + s))}</span><b>${counts[s]}</b></button>`).join('')}</div>
  <div class="filters">
    <label class="search">${icon('search')}<input type="search" name="q" value="${esc(F.q)}" placeholder="${esc(tc('un.search'))}" aria-label="${esc(tc('un.search'))}"></label>
    <select name="b" aria-label="${esc(tc('u.building'))}"><option value="">${esc(tc('un.allBuildings'))}</option>${['C3', 'C4'].map(b => `<option ${F.b === b ? 'selected' : ''}>${b}</option>`).join('')}</select>
    <select name="floor" aria-label="${esc(tc('u.floor'))}"><option value="">${esc(tc('un.allFloors'))}</option>${Array.from({ length: 11 }, (_, f) => `<option value="${f}" ${F.floor === String(f) ? 'selected' : ''}>${f === 0 ? esc(tc('u.ground')) : `${esc(tc('u.floor'))} ${f}`}</option>`).join('')}</select>
    <select name="rooms" aria-label="${esc(tc('rooms'))}"><option value="">${esc(tc('un.allRooms'))}</option>${[1, 2, 3, 4].map(r => `<option value="${r}" ${F.rooms === String(r) ? 'selected' : ''}>${esc(tc('roomsN', { n: r }))}</option>`).join('')}</select>
    <select name="status" aria-label="${esc(tc('status'))}"><option value="">${esc(tc('un.allStatus'))}</option>${statusOptions(F.status)}</select>
  </div>
  ${F.view === 'grid' ? grid(rows) : table(rows)}
  <p class="fine">${icon('info')}${esc(tc('un.note'))}</p>`;

  root.querySelectorAll('.filters [name]').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { F[el.name] = el.value; const pos = el.selectionStart; render(root, name, []); const n = root.querySelector(`.filters [name=${el.name}]`); n.focus(); if (pos != null && n.setSelectionRange) n.setSelectionRange(pos, pos); }));
  root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { F.view = b.dataset.view; try { localStorage.setItem('vrc.crm.unitView', F.view); } catch (e) { /* ignore */ } render(root, name, []); });
  root.querySelectorAll('[data-status]').forEach(b => b.onclick = () => { F.status = F.status === b.dataset.status ? '' : b.dataset.status; render(root, name, []); });
  root.querySelectorAll('[data-unit]').forEach(b => b.onclick = e => { if (e.target.closest('input')) return; editUnit(b.dataset.unit); });
  $('[data-act=csv]', root).onclick = async () => (await import('./v-settings.js?v=3.10')).exportUnits(rows);
  // bulk
  const bulk = $('.bulk', root);
  if (bulk) {
    const sel = () => $$('[data-sel]:checked', root).map(x => x.dataset.sel);
    const upd = () => { const n = sel().length; bulk.hidden = !n; $('.bulk-n', root).textContent = tc('nSelected', { n }); };
    root.querySelectorAll('[data-sel]').forEach(cb => cb.addEventListener('change', upd));
    $('[data-all]', root)?.addEventListener('change', e => { $$('[data-sel]', root).forEach(cb => { cb.checked = e.target.checked; }); upd(); });
    $('[name=bulkStatus]', bulk).addEventListener('change', async e => { const st = e.target.value; if (!st) return; const ids = sel(); for (const id of ids) await setUnitStatus(id, st); toast(tc('un.bulkDone', { n: ids.length, s: tc('st.' + st) })); });
  }
  if (params?.[0] && unitById(params[0]) && !document.querySelector('dialog[open]')) { editUnit(params[0]); history.replaceState(null, '', '#/units'); }
}

function grid(rows) {
  const ids = new Set(rows.map(u => u.id));
  const bs = F.b ? [F.b] : ['C3', 'C4'];
  return `<div class="ugrid-wrap">${legend(UNIT_STATUSES.map(s => ({ name: tc('st.' + s), color: STATUS_COLORS[s] })))}${bs.map(b => `<section class="ugrid card"><h2>${esc(tc('u.building'))} ${b}</h2>
    <div class="ug-rows">${Array.from({ length: 11 }, (_, i) => 10 - i).map(f => { const us = UNITS.filter(u => u.building === b && u.floor === f); return `<div class="ug-row"><span class="ug-f">${f === 0 ? 'P' : f}${f === 10 ? '/D' : ''}</span><div class="ug-units">${us.map(u => { const st = unitState(u.id); const c = st.clientId ? get('clients', st.clientId) : null; return `<button class="uc s-${st.status} ${ids.has(u.id) ? '' : 'dim'}" data-unit="${u.id}" data-tip="" title="${esc(`${u.id} · ${tc('roomsN', { n: u.rooms })} · ${TYPES[u.type].total.toFixed(1)} m² · ${money(u.price)} · ${tc('st.' + st.status)}${c ? ' · ' + clientName(c) : ''}`)}" aria-label="${esc(`${u.id} ${tc('st.' + st.status)}`)}"><span>${u.index}</span><i>${u.rooms}</i></button>`; }).join('')}</div></div>`; }).join('')}</div></section>`).join('')}</div>`;
}

function table(rows) {
  if (!rows.length) return empty(tc('noMatch'));
  return `<div class="bulk" hidden><span class="bulk-n"></span><select name="bulkStatus" aria-label="${esc(tc('status'))}"><option value="">${esc(tc('un.setStatus'))}</option>${statusOptions('')}</select></div>
  <div class="tbl-wrap"><table class="tbl units"><thead><tr><th class="cb"><input type="checkbox" data-all aria-label="${esc(tc('selectAll'))}"></th><th>${esc(tc('unit'))}</th><th>${esc(tc('type'))}</th><th>m²</th><th>${esc(tc('price'))}</th><th>${esc(tc('status'))}</th><th>${esc(tc('client'))}</th><th>${esc(tc('updated'))}</th></tr></thead><tbody>
  ${rows.map(u => { const st = unitState(u.id); const c = st.clientId ? get('clients', st.clientId) : null; const T = TYPES[u.type]; return `<tr data-unit="${u.id}" class="click"><td class="cb"><input type="checkbox" data-sel="${u.id}" aria-label="${u.id}"></td><td><b dir="ltr" class="mono">${u.id}</b><small>${esc(unitLabelL(u))}</small></td><td>${esc(tc('roomsN', { n: u.rooms }))}<small>${u.type} · ${esc(tc('face.' + u.facing))}</small></td><td class="num">${T.total.toFixed(2)}</td><td class="num">${eur(u.price)}</td><td>${statusChip(st.status)}${st.source === 'web' ? `<small>${esc(tc('un.webRes'))}</small>` : ''}</td><td>${c ? `<a href="#/client/${encodeURIComponent(st.clientId)}">${esc(clientName(c))}</a>` : '—'}</td><td><small>${st.updatedAt ? esc(fmtDate(st.updatedAt)) : '—'}</small></td></tr>`; }).join('')}
  </tbody></table></div>`;
}

export function editUnit(id) {
  const u = unitById(id); const st = unitState(id); const T = TYPES[u.type]; const cur = get('units', id) || {};
  const deal = entries('deals').find(d => d.unitId === id && d.status !== 'cancelled');
  const res = all('reservations').filter(r => r.unitId === id);
  openModal({
    title: `${tc('unit')} ${u.id}`, sub: esc(unitLabelL(u)),
    body: `<div class="unit-facts"><div><span>${esc(tc('type'))}</span><b>${esc(tc('roomsN', { n: u.rooms }))} · ${u.type}</b></div><div><span>${esc(tc('area'))}</span><b>${T.total.toFixed(2)} m²</b></div><div><span>${esc(tc('price'))}</span><b>${eur(u.price)}</b></div><div><span>${esc(tc('facing'))}</span><b>${esc(tc('face.' + u.facing))}</b></div></div>
      <div class="fgrid">${fld(tc('status'), `<select name="status">${statusOptions(st.status)}</select>`)}${fld(tc('client'), `<select name="clientId">${clientOptions(st.clientId)}</select>`)}
      ${fld(tc('note'), `<input name="note" value="${esc(cur.note || '')}">`, 'span2')}</div>
      ${res.length ? `<p class="fine">${icon('globe')}${esc(tc('un.webResList'))}: ${res.map(r => `<span dir="ltr">${esc(r.resNo)}</span> (${esc(tc('rstatus.' + (r.status || 'reserved')))})`).join(', ')}</p>` : ''}
      ${deal ? `<p><a class="btn ghost sm" href="#/deal/${encodeURIComponent(deal.id)}" data-close>${icon('deal')}${esc(tc('un.openDeal'))}</a></p>` : ''}`,
    foot: `${!deal ? `<button type="button" class="btn ghost" data-deal>${icon('plus')}${esc(tc('new.deal'))}</button>` : ''}<span class="grow"></span><button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn primary" data-save>${esc(tc('save'))}</button>`,
    onMount: (d, close) => {
      d.querySelector('[data-save]').onclick = async () => {
        const f = formData(d);
        await setUnitStatus(id, f.status, { clientId: f.clientId || null, dealId: deal?.id || null });
        if (f.note !== (cur.note || '')) await patchDoc('units', id, { note: f.note });
        // releasing a unit cancels its web reservation marker so the public site shows it free again
        if (f.status === 'available') for (const r of res.filter(r => r.status !== 'cancelled')) await patchDoc('reservations', r.resNo, { status: 'cancelled', cancelledAt: new Date().toISOString() }, `web reservation ${r.resNo} cancelled`);
        toast(tc('saved')); close();
      };
      d.querySelector('[data-deal]')?.addEventListener('click', async () => { close(); (await import('./v-deals.js?v=3.10')).newDeal({ unitId: id, clientId: d.querySelector('[name=clientId]').value || undefined }); });
      d.querySelector('[href^="#/deal"]')?.addEventListener('click', close);
    },
  });
}
