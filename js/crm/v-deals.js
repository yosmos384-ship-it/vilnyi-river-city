// Deals / reservations: unit sale per client, payment plan (PROJECT.terms), instalment schedule, payments register.
import { UNITS, TYPES, unitById, PROJECT } from '../data.js?v=3.12';
import { unitLabelL, planText } from '../i18n.js?v=3.12';
import { tc } from './i18n-crm.js?v=3.12';
import { S, entries, get, setDoc, patchDoc, all, dealFinance, buildSchedule, clientName, unitState, setUnitStatus, setStage, addTimeline, STAGES, settings, planOf } from './store.js?v=3.12';
import { esc, icon, eur, fmtDate, relDays, uid, today, addMonths, openModal, confirmUI, formData, toast, $, round2 } from './util.js?v=3.12';
import { pageHead, clientOptions, fld, empty, tabs, stageChip } from './ui.js?v=3.12';

const F = { status: 'active', q: '' };
const METHODS = ['bank', 'card', 'cash', 'other'];

export function render(root, name, params) {
  if (name === 'deal') return renderDeal(root, params[0]);
  const q = F.q.toLowerCase();
  const ds = entries('deals').filter(d => (F.status === 'all' || (d.status || 'active') === F.status) && (!q || [d.unitId, clientName(get('clients', d.clientId)), d.resNo].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const web = all('reservations').filter(r => r.status !== 'cancelled' && !entries('deals').some(d => d.resNo === r.resNo));
  const fins = ds.map(d => ({ d, f: dealFinance(d) }));
  const sum = k => fins.reduce((s, x) => s + x.f[k], 0);
  const counts = s => entries('deals').filter(d => s === 'all' || (d.status || 'active') === s).length;
  root.innerHTML = `${pageHead(tc('nav.deals'), esc(tc('dl.sub')), `<button class="btn ghost sm" data-act="csv">${icon('down')}${esc(tc('exportCsv'))}</button><button class="btn primary sm" data-act="new">${icon('plus')}${esc(tc('new.deal'))}</button>`)}
  ${web.length ? `<div class="card attention"><div class="card-h"><h2>${icon('globe')}${esc(tc('dl.webRes', { n: web.length }))}</h2></div><p class="muted">${esc(tc('dl.webResHint'))}</p>
    <ul class="rows">${web.map(r => { const lead = all('leads').find(l => l.resNo === r.resNo); return `<li><span class="dot"></span><div><b dir="ltr">${esc(r.resNo)}</b><small><span dir="ltr">${esc(r.unitId)}</span> · ${esc(lead?.name || '')} · ${esc(fmtDate(r.createdAt))}</small></div><button class="btn ghost sm" data-convert="${esc(r.resNo)}">${esc(tc('dl.convert'))}</button></li>`; }).join('')}</ul></div>` : ''}
  <div class="filters">${tabs([['active', tc('dstatus.active'), counts('active')], ['completed', tc('dstatus.completed'), counts('completed')], ['cancelled', tc('dstatus.cancelled'), counts('cancelled')], ['all', tc('all'), counts('all')]], F.status)}
    <label class="search">${icon('search')}<input type="search" name="q" value="${esc(F.q)}" placeholder="${esc(tc('dl.search'))}" aria-label="${esc(tc('dl.search'))}"></label></div>
  ${ds.length ? `<div class="tbl-wrap"><table class="tbl deals"><thead><tr><th>${esc(tc('client'))}</th><th>${esc(tc('unit'))}</th><th>${esc(tc('plan'))}</th><th class="num">${esc(tc('price'))}</th><th class="num">${esc(tc('paid'))}</th><th class="num">${esc(tc('balance'))}</th><th>${esc(tc('nextDue'))}</th></tr></thead><tbody>
    ${fins.map(({ d, f }) => { const c = get('clients', d.clientId); const nd = f.next ? relDays(f.next.due) : null; return `<tr class="click" data-href="#/deal/${encodeURIComponent(d.id)}"><td><a href="#/deal/${encodeURIComponent(d.id)}"><b>${esc(clientName(c))}</b></a><small>${c ? stageChip(c.stage) : ''}</small></td><td><b dir="ltr" class="mono">${esc(d.unitId)}</b><small>${esc(tc('entity.' + (d.entity || 'cy')))}</small></td><td>${esc(planText(planOf(d.planId)))}</td><td class="num">${eur(f.price)}</td><td class="num">${eur(f.paid)}<div class="prog sm"><i style="width:${Math.min(100, f.pctPaid)}%"></i></div></td><td class="num">${eur(f.balance)}</td><td>${f.next ? `<span class="${nd < 0 ? 'bad' : ''}">${eur(f.next.open)}</span><small>${esc(nd < 0 ? tc('overdueDays', { n: -nd }) : fmtDate(f.next.due))}</small>` : `<small>${esc(tc('dl.fullyPaid'))}</small>`}</td></tr>`; }).join('')}
    </tbody><tfoot><tr><th colspan="3">${esc(tc('total'))} · ${ds.length}</th><th class="num">${eur(sum('price'))}</th><th class="num">${eur(sum('paid'))}</th><th class="num">${eur(sum('balance'))}</th><th></th></tr></tfoot></table></div>` : empty(tc('dl.empty'))}`;
  root.querySelector('[name=q]').addEventListener('input', e => { F.q = e.target.value; const p = e.target.selectionStart; render(root, name, []); const n = root.querySelector('[name=q]'); n.focus(); n.setSelectionRange(p, p); });
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { F.status = b.dataset.tab; render(root, name, []); });
  root.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
  $('[data-act=new]', root).onclick = () => newDeal({});
  $('[data-act=csv]', root).onclick = async () => (await import('./v-settings.js?v=3.12')).exportDeals();
  root.querySelectorAll('[data-convert]').forEach(b => b.onclick = () => {
    const r = get('reservations', b.dataset.convert); const lead = all('leads').find(l => l.resNo === r.resNo);
    const cid = lead?.email ? entries('clients').find(c => (c.email || '').toLowerCase() === lead.email.toLowerCase())?.id : undefined;
    newDeal({ unitId: r.unitId, clientId: cid, planId: r.plan, resNo: r.resNo, start: String(r.createdAt || today()).slice(0, 10) });
  });
}

// ---------------- create ----------------
export function newDeal({ clientId, unitId, planId, resNo, start }) {
  const st = settings();
  const avail = UNITS.filter(u => { const s = unitState(u.id); return s.status === 'available' || u.id === unitId || (s.status === 'reserved' && s.source === 'web'); });
  openModal({
    title: tc('new.deal'), wide: true,
    body: `<div class="fgrid">
      ${fld(tc('client'), `<select name="clientId" required>${clientOptions(clientId)}</select>`, 'span2')}
      ${fld(tc('unit'), `<input name="unitId" list="unit-list" dir="ltr" value="${esc(unitId || '')}" placeholder="C3-5-07" autocomplete="off"><datalist id="unit-list">${avail.map(u => `<option value="${u.id}">${esc(tc('roomsN', { n: u.rooms }))} · ${TYPES[u.type].total.toFixed(1)} m² · ${eur(u.price)}</option>`).join('')}</datalist>`)}
      ${fld(tc('plan'), `<select name="planId">${PROJECT.terms.plans.map(p => `<option value="${p.id}" ${p.id === (planId || 'standard') ? 'selected' : ''}>${esc(planText(p))}</option>`).join('')}</select>`)}
      ${fld(tc('listPrice'), `<input name="price" type="number" min="0" step="100">`)}
      ${fld(tc('discount'), `<input name="discount" type="number" min="0" step="100" value="0">`)}
      ${fld(tc('issuer'), `<select name="entity">${['cy', 'pt'].map(e => `<option value="${e}" ${e === st.defaultEntity ? 'selected' : ''}>${esc(st.entities[e].name)}</option>`).join('')}</select>`)}
      ${fld(tc('dl.resDate'), `<input name="start" type="date" value="${esc(start || today())}">`)}
      ${fld(tc('dl.signDate'), `<input name="signDate" type="date" value="${esc(addMonths(start || today(), 1))}">`)}
      ${fld(tc('dl.deliveryDate'), `<input name="deliveryDate" type="date" value="${esc(addMonths(start || today(), PROJECT.deliveryMonths || 32))}">`)}
      ${fld(tc('dl.split'), `<select name="split">${[1, 2, 3, 4, 6, 12].map(n => `<option value="${n}">${n === 1 ? esc(tc('dl.single')) : esc(tc('dl.nInst', { n }))}</option>`).join('')}</select>`)}
      ${fld(tc('dl.resNo'), `<input name="resNo" dir="ltr" value="${esc(resNo || '')}" placeholder="${esc(tc('auto'))}">`)}
    </div><div class="sched-prev"></div><p class="err" hidden></p>`,
    foot: `<button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn primary" data-save>${esc(tc('dl.create'))}</button>`,
    onMount: (d, close) => {
      const priceIn = d.querySelector('[name=price]'), unitIn = d.querySelector('[name=unitId]');
      const prev = () => {
        const f = formData(d); const u = unitById(f.unitId);
        if (u && (!priceIn.value || priceIn.dataset.auto === '1')) { priceIn.value = u.price; priceIn.dataset.auto = '1'; }
        const price = (Number(priceIn.value) || 0) - (Number(f.discount) || 0);
        const sch = price > 0 ? buildSchedule(price, f.planId, f.start, { split: f.split, signDate: f.signDate, deliveryDate: f.deliveryDate }) : [];
        d.querySelector('.sched-prev').innerHTML = sch.length ? `<h3 class="h-s">${esc(tc('schedule'))}</h3><table class="tbl mini"><tbody>${sch.map(r => `<tr><td>${esc(tc('ik.' + r.kind))} ${esc(r.part || '')}</td><td>${esc(fmtDate(r.due))}</td><td class="num">${eur(r.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">${esc(tc('total'))}</th><th class="num">${eur(price)}</th></tr></tfoot></table>` : '';
      };
      priceIn.addEventListener('input', () => { priceIn.dataset.auto = '0'; });
      d.querySelectorAll('[name]').forEach(el => el.addEventListener('input', prev)); d.querySelectorAll('select').forEach(el => el.addEventListener('change', prev)); prev();
      d.querySelector('[data-save]').onclick = async () => {
        const f = formData(d); const err = d.querySelector('.err'); const u = unitById(f.unitId);
        if (!f.clientId) { err.textContent = tc('err.client'); err.hidden = false; return; }
        if (!u) { err.textContent = tc('err.unit'); err.hidden = false; return; }
        const us = unitState(u.id); if (us.status === 'sold' || (us.status === 'reserved' && us.source !== 'web' && us.clientId && us.clientId !== f.clientId)) { err.textContent = tc('err.unitTaken', { s: tc('st.' + us.status) }); err.hidden = false; return; }
        const price = Number(f.price) || u.price; const disc = Number(f.discount) || 0;
        const id = uid('d_'); const resNo2 = f.resNo || `VRC-${u.id.replace(/-/g, '')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
        const deal = { clientId: f.clientId, unitId: u.id, price, discount: disc, planId: f.planId, entity: f.entity, status: 'active', resNo: resNo2, schedule: buildSchedule(price - disc, f.planId, f.start, { split: f.split, signDate: f.signDate, deliveryDate: f.deliveryDate }), payments: [], reservedAt: f.start, createdAt: new Date().toISOString() };
        try {
          await setDoc('deals', id, deal, `deal created ${u.id} for ${clientName(get('clients', f.clientId))}`);
          await setUnitStatus(u.id, 'reserved', { clientId: f.clientId, dealId: id });
          if (!get('reservations', resNo2)) await setDoc('reservations', resNo2, { resNo: resNo2, unitId: u.id, status: 'reserved', plan: f.planId, createdAt: new Date().toISOString(), source: 'crm' });
          const c = get('clients', f.clientId);
          if (c) { await setDoc('clients', f.clientId, { ...c, unitIds: [...new Set([...(c.unitIds || []), u.id])] }); await addTimeline(f.clientId, { type: 'reservation', text: `${tc('dl.created')} · ${u.id} · ${eur(price - disc)}` }); if (STAGES.indexOf(c.stage) < STAGES.indexOf('reserved')) await setStage(f.clientId, 'reserved'); }
          toast(tc('saved')); close(); location.hash = '#/deal/' + encodeURIComponent(id);
        } catch (e) { err.textContent = tc('err.save') + ' ' + (e?.message || ''); err.hidden = false; }
      };
    },
  });
}

// ---------------- detail ----------------
function renderDeal(root, id) {
  const d = get('deals', id);
  if (!d) { root.innerHTML = pageHead(tc('nav.deals')) + empty(S.ready.has('deals') ? tc('dl.notFound') : tc('loading')); return; }
  const c = get('clients', d.clientId); const u = unitById(d.unitId); const f = dealFinance(d); const st = settings();
  const docs = entries('documents').filter(x => x.dealId === id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const pays = [...(d.payments || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  root.innerHTML = `<a class="crumb" href="#/deals">${icon('chevl')}${esc(tc('nav.deals'))}</a>
  ${pageHead(`${d.unitId} · ${clientName(c)}`, `${u ? esc(unitLabelL(u)) : ''} · <span dir="ltr">${esc(d.resNo || '')}</span>`, `
    <select class="sel-sm" data-status aria-label="${esc(tc('status'))}">${['active', 'completed', 'cancelled'].map(s => `<option value="${s}" ${s === (d.status || 'active') ? 'selected' : ''}>${esc(tc('dstatus.' + s))}</option>`).join('')}</select>
    <button class="btn ghost sm" data-doc="reservation">${icon('doc')}${esc(tc('dt.reservation'))}</button>
    <button class="btn ghost sm" data-doc="proforma">${icon('pdf')}${esc(tc('dl.proformaNext'))}</button>
    <button class="btn primary sm" data-act="pay">${icon('euro')}${esc(tc('dl.addPayment'))}</button>`)}
  <section class="kpis">
    <div class="kpi"><p class="kpi-l">${esc(tc('price'))}</p><p class="kpi-v">${eur(f.price)}</p><p class="kpi-s">${d.discount ? esc(tc('dl.discountOf', { v: eur(d.discount) })) : esc(planText(planOf(d.planId)))}</p></div>
    <div class="kpi"><p class="kpi-l">${esc(tc('paid'))}</p><p class="kpi-v">${eur(f.paid)}</p><div class="prog"><i style="width:${Math.min(100, f.pctPaid)}%"></i></div><p class="kpi-s">${f.pctPaid.toFixed(1)}%</p></div>
    <div class="kpi"><p class="kpi-l">${esc(tc('balance'))}</p><p class="kpi-v">${eur(f.balance)}</p><p class="kpi-s">${f.next ? esc(tc('dl.nextIs', { v: eur(f.next.open), d: fmtDate(f.next.due) })) : esc(tc('dl.fullyPaid'))}</p></div>
    <div class="kpi ${f.overdueAmount ? 'bad' : ''}"><p class="kpi-l">${esc(tc('dash.overdue'))}</p><p class="kpi-v">${eur(f.overdueAmount)}</p><p class="kpi-s">${esc(tc('entity.' + (d.entity || 'cy')))} · ${esc(st.entities[d.entity || 'cy'].name)}</p></div>
  </section>
  <div class="grid2">
    <div class="card"><div class="card-h"><h2>${esc(tc('schedule'))}</h2><div><button class="btn link sm" data-act="regen">${icon('refresh')}${esc(tc('dl.regen'))}</button><button class="btn link sm" data-act="addInst">${icon('plus')}${esc(tc('dl.addInst'))}</button></div></div>
      <div class="tbl-wrap"><table class="tbl sched"><thead><tr><th>${esc(tc('instalment'))}</th><th>${esc(tc('dueDate'))}</th><th class="num">${esc(tc('amount'))}</th><th class="num">${esc(tc('paid'))}</th><th></th></tr></thead><tbody>
      ${f.rows.map(r => { const dd = relDays(r.due); const cls = r.open <= 0.009 ? 'ok' : dd < 0 ? 'bad' : ''; return `<tr class="${cls}"><td>${esc(r.label || tc('ik.' + r.kind))} ${esc(r.part || '')}</td><td>${esc(fmtDate(r.due))}${r.open > 0.009 && dd < 0 ? `<small class="bad">${esc(tc('overdueDays', { n: -dd }))}</small>` : ''}</td><td class="num">${eur(r.amount)}</td><td class="num">${r.open <= 0.009 ? icon('check', 'okc') : eur(r.paid)}</td><td class="acts"><button class="icon-btn sm" data-inst="${esc(r.id)}" aria-label="${esc(tc('edit'))}">${icon('edit')}</button><button class="icon-btn sm" data-pf="${esc(r.id)}" aria-label="${esc(tc('dt.proforma'))}" title="${esc(tc('dt.proforma'))}">${icon('pdf')}</button></td></tr>`; }).join('')}
      </tbody><tfoot><tr><th colspan="2">${esc(tc('total'))}</th><th class="num">${eur(f.rows.reduce((s, r) => s + r.amount, 0))}</th><th class="num">${eur(f.paid)}</th><th></th></tr></tfoot></table></div>
      ${Math.abs(f.rows.reduce((s, r) => s + r.amount, 0) - f.price) > 0.5 ? `<p class="warn-t">${icon('alert')}${esc(tc('dl.schedMismatch', { a: eur(f.rows.reduce((s, r) => s + r.amount, 0)), b: eur(f.price) }))}</p>` : ''}
    </div>
    <div class="card"><div class="card-h"><h2>${esc(tc('payments'))}</h2></div>
      ${pays.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(tc('date'))}</th><th>${esc(tc('method'))}</th><th>${esc(tc('reference'))}</th><th class="num">${esc(tc('amount'))}</th><th></th></tr></thead><tbody>
      ${pays.map(p => `<tr><td>${esc(fmtDate(p.date))}</td><td>${esc(tc('pm.' + (p.method || 'bank')))}${p.kind === 'refund' ? ` <em class="tag warn">${esc(tc('refund'))}</em>` : ''}</td><td dir="ltr"><small>${esc(p.ref || '')}</small></td><td class="num">${p.kind === 'refund' ? '−' : ''}${eur(p.amount)}</td><td class="acts">${p.receiptId ? `<a class="icon-btn sm" href="#/documents/${encodeURIComponent(p.receiptId)}" title="${esc(tc('dt.receipt'))}">${icon('receipt')}</a>` : `<button class="icon-btn sm" data-receipt="${esc(p.id)}" title="${esc(tc('dl.issueReceipt'))}" aria-label="${esc(tc('dl.issueReceipt'))}">${icon('receipt')}</button>`}<button class="icon-btn sm" data-delpay="${esc(p.id)}" aria-label="${esc(tc('delete'))}">${icon('trash')}</button></td></tr>`).join('')}
      </tbody></table></div>` : empty(tc('dl.noPayments'))}
      <h3 class="h-s">${esc(tc('documents'))}</h3>
      ${docs.length ? `<ul class="rows">${docs.map(x => `<li><span class="dot ${x.status === 'void' ? '' : 'g'}"></span><div><a href="#/documents/${encodeURIComponent(x.id)}"><b dir="ltr">${esc(x.number)}</b></a><small>${esc(tc('dt.' + x.type))} · ${esc(fmtDate(x.date))}${x.status === 'void' ? ' · ' + esc(tc('void')) : ''}</small></div><b class="amt">${eur(x.total)}</b></li>`).join('')}</ul>` : `<p class="muted sm">${esc(tc('cl.noDocs'))}</p>`}
    </div>
  </div>
  <div class="card"><div class="card-h"><h2>${esc(tc('notes'))}</h2></div><textarea class="notes" name="dealNotes" rows="3" aria-label="${esc(tc('notes'))}">${esc(d.notes || '')}</textarea><p><button class="btn ghost sm" data-act="saveNotes">${esc(tc('save'))}</button></p></div>`;

  const save = (patch, a) => patchDoc('deals', id, patch, a);
  $('[data-status]', root).onchange = async e => {
    const v = e.target.value;
    if (v === 'cancelled') {
      if (!await confirmUI({ title: tc('dl.cancelT'), text: tc('dl.cancelQ', { u: d.unitId }), danger: true, ok: tc('dl.cancelOk') })) { e.target.value = d.status || 'active'; return; }
      await save({ status: 'cancelled', cancelledAt: new Date().toISOString() }, `deal ${d.unitId} cancelled`);
      await setUnitStatus(d.unitId, 'available');
      for (const r of all('reservations').filter(r => r.unitId === d.unitId && r.status !== 'cancelled')) await patchDoc('reservations', r.resNo, { status: 'cancelled', cancelledAt: new Date().toISOString() });
      await addTimeline(d.clientId, { type: 'system', text: `${tc('dstatus.cancelled')} · ${d.unitId}` });
    } else await save({ status: v }, `deal ${d.unitId} → ${v}`);
    toast(tc('saved'));
  };
  $('[data-act=pay]', root).onclick = () => addPayment(id);
  $('[data-act=saveNotes]', root).onclick = async () => { await save({ notes: $('[name=dealNotes]', root).value }); toast(tc('saved')); };
  $('[data-act=regen]', root).onclick = async () => {
    if (!await confirmUI({ title: tc('dl.regen'), text: tc('dl.regenQ'), ok: tc('dl.regen') })) return;
    await save({ schedule: buildSchedule(f.price, d.planId, d.reservedAt || today(), {}) }, `schedule regenerated ${d.unitId}`); toast(tc('saved'));
  };
  $('[data-act=addInst]', root).onclick = () => editInst(id, null);
  root.querySelectorAll('[data-inst]').forEach(b => b.onclick = () => editInst(id, b.dataset.inst));
  root.querySelectorAll('[data-doc]').forEach(b => b.onclick = async () => (await import('./v-documents.js?v=3.12')).newDocument({ type: b.dataset.doc, dealId: id, clientId: d.clientId, instId: b.dataset.doc === 'proforma' ? f.next?.id : undefined }));
  root.querySelectorAll('[data-pf]').forEach(b => b.onclick = async () => (await import('./v-documents.js?v=3.12')).newDocument({ type: 'proforma', dealId: id, clientId: d.clientId, instId: b.dataset.pf }));
  root.querySelectorAll('[data-receipt]').forEach(b => b.onclick = async () => (await import('./v-documents.js?v=3.12')).newDocument({ type: 'receipt', dealId: id, clientId: d.clientId, paymentId: b.dataset.receipt }));
  root.querySelectorAll('[data-delpay]').forEach(b => b.onclick = async () => {
    if (!await confirmUI({ title: tc('delete'), text: tc('dl.delPayQ'), danger: true, ok: tc('delete') })) return;
    await save({ payments: (d.payments || []).filter(p => p.id !== b.dataset.delpay) }, `payment removed on ${d.unitId}`); toast(tc('saved'));
  });
}

function editInst(dealId, instId) {
  const d = get('deals', dealId); const r = (d.schedule || []).find(x => x.id === instId) || { id: uid('i'), kind: 'custom', due: today(), amount: 0 };
  openModal({
    title: instId ? tc('dl.editInst') : tc('dl.addInst'),
    body: `<div class="fgrid">${fld(tc('label'), `<input name="label" value="${esc(r.label || tc('ik.' + r.kind))}">`, 'span2')}${fld(tc('dueDate'), `<input name="due" type="date" value="${esc(r.due)}">`)}${fld(tc('amount'), `<input name="amount" type="number" step="0.01" value="${esc(r.amount)}">`)}</div>`,
    foot: `${instId ? `<button type="button" class="btn link danger" data-del>${icon('trash')}${esc(tc('delete'))}</button>` : ''}<span class="grow"></span><button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn primary" data-save>${esc(tc('save'))}</button>`,
    onMount: (dl, close) => {
      dl.querySelector('[data-save]').onclick = async () => { const f = formData(dl); const row = { ...r, label: f.label === tc('ik.' + r.kind) ? undefined : f.label, due: f.due, amount: round2(f.amount) }; if (!row.label) delete row.label; const sch = instId ? d.schedule.map(x => x.id === instId ? row : x) : [...(d.schedule || []), row]; await patchDoc('deals', dealId, { schedule: sch }, `schedule edited ${d.unitId}`); toast(tc('saved')); close(); };
      dl.querySelector('[data-del]')?.addEventListener('click', async () => { await patchDoc('deals', dealId, { schedule: d.schedule.filter(x => x.id !== instId) }); close(); });
    },
  });
}

export function addPayment(dealId) {
  const d = get('deals', dealId); const f = dealFinance(d);
  openModal({
    title: tc('dl.addPayment'), sub: `<span dir="ltr">${esc(d.unitId)}</span> · ${esc(clientName(get('clients', d.clientId)))}`,
    body: `<div class="fgrid">${fld(tc('date'), `<input name="date" type="date" value="${today()}">`)}${fld(tc('amount'), `<input name="amount" type="number" step="0.01" min="0" value="${esc(f.next?.open || '')}">`)}
      ${fld(tc('method'), `<select name="method">${METHODS.map(m => `<option value="${m}">${esc(tc('pm.' + m))}</option>`).join('')}</select>`)}${fld(tc('kind'), `<select name="kind"><option value="payment">${esc(tc('payment'))}</option><option value="refund">${esc(tc('refund'))}</option></select>`)}
      ${fld(tc('reference'), `<input name="ref" dir="ltr" value="${esc(`${d.unitId}-${(clientName(get('clients', d.clientId)).split(' ').pop() || '').toUpperCase()}`)}">`, 'span2')}
      ${fld(tc('note'), `<input name="note">`, 'span2')}
      <label class="chk span2"><input type="checkbox" name="receipt" checked><span>${esc(tc('dl.issueReceiptNow'))}</span></label></div><p class="err" hidden></p>`,
    foot: `<button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn primary" data-save>${esc(tc('dl.record'))}</button>`,
    onMount: (dl, close) => dl.querySelector('[data-save]').onclick = async () => {
      const x = formData(dl); if (!(x.amount > 0)) { const e = dl.querySelector('.err'); e.textContent = tc('err.amount'); e.hidden = false; return; }
      const p = { id: uid('p'), date: x.date, amount: round2(x.amount), method: x.method, kind: x.kind, ref: x.ref, note: x.note, recordedAt: new Date().toISOString(), by: S.me.id || null };
      const cur = get('deals', dealId);
      await patchDoc('deals', dealId, { payments: [...(cur.payments || []), p] }, `payment ${p.amount} on ${d.unitId}`);
      await addTimeline(d.clientId, { type: 'payment', text: `${tc(x.kind === 'refund' ? 'refund' : 'payment')} ${eur(p.amount)} · ${tc('pm.' + p.method)} · ${p.ref || ''}` });
      // auto-advance the client stage on payment milestones
      const nf = dealFinance(get('deals', dealId)); const c = get('clients', d.clientId);
      if (c && x.kind !== 'refund') {
        const dep = nf.rows.find(r => r.kind === 'deposit'); let target = null;
        if (nf.paid >= nf.price * 0.6 - 0.5) target = 'paid60'; else if (dep && nf.paid >= dep.amount - 0.5) target = 'deposit';
        if (target && STAGES.indexOf(c.stage) < STAGES.indexOf(target)) await setStage(d.clientId, target);
      }
      toast(tc('saved')); close();
      if (x.receipt) (await import('./v-documents.js?v=3.12')).newDocument({ type: 'receipt', dealId, clientId: d.clientId, paymentId: p.id });
    },
  });
}
