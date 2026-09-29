// Leads & clients: list (search/filter/bulk), client card with full timeline, kanban pipeline (drag & drop).
import { unitById } from '../data.js';
import { tc } from './i18n-crm.js';
import { S, entries, get, setDoc, delDoc, addTimeline, setStage, clientName, STAGES, dealFinance, splitName, clientIdForEmail } from './store.js';
import { countryName, esc, icon, eur, fmtDate, fmtDateTime, relDays, initials, uid, openModal, confirmUI, formData, toast, $, $$, isEmail } from './util.js';
import { pageHead, stageChip, flag, empty, stageOptions, langOptions, fld, allStages, tabs } from './ui.js';

const F = { q: '', stage: '', lang: '', source: '', sort: 'recent' };
const SOURCES = ['website', 'referral', 'agent', 'event', 'social', 'phone', 'other'];

export function render(root, name, params) {
  if (name === 'client') return renderCard(root, params[0]);
  if (name === 'pipeline') return renderKanban(root);
  return renderList(root);
}

// ---------------- list ----------------
function filtered() {
  const q = F.q.toLowerCase();
  let rows = entries('clients').filter(c => (!F.stage || c.stage === F.stage) && (!F.lang || c.lang === F.lang) && (!F.source || c.source === F.source)
    && (!q || [clientName(c), c.email, c.phone, c.country, (c.unitIds || []).join(' '), (c.tags || []).join(' ')].join(' ').toLowerCase().includes(q)));
  rows.sort(F.sort === 'name' ? (a, b) => clientName(a).localeCompare(clientName(b)) : F.sort === 'stage' ? (a, b) => allStages().indexOf(b.stage) - allStages().indexOf(a.stage) : (a, b) => String(b.lastActivity || b.createdAt || '').localeCompare(String(a.lastActivity || a.createdAt || '')));
  return rows;
}
function renderList(root) {
  const rows = filtered(); const total = entries('clients').length;
  root.innerHTML = `${pageHead(tc('nav.clients'), esc(tc('cl.sub', { n: total })), `<button class="btn ghost sm" data-act="csv">${icon('down')}${esc(tc('exportCsv'))}</button><button class="btn primary sm" data-act="new">${icon('plus')}${esc(tc('new.client'))}</button>`)}
  <div class="filters">
    <label class="search">${icon('search')}<input type="search" name="q" value="${esc(F.q)}" placeholder="${esc(tc('cl.search'))}" aria-label="${esc(tc('cl.search'))}"></label>
    <select name="stage" aria-label="${esc(tc('stage'))}"><option value="">${esc(tc('allStages'))}</option>${stageOptions(F.stage)}</select>
    <select name="lang" aria-label="${esc(tc('language'))}"><option value="">${esc(tc('allLangs'))}</option>${langOptions(F.lang)}</select>
    <select name="source" aria-label="${esc(tc('source'))}"><option value="">${esc(tc('allSources'))}</option>${SOURCES.map(s => `<option value="${s}" ${s === F.source ? 'selected' : ''}>${esc(tc('src.' + s))}</option>`).join('')}</select>
    <select name="sort" aria-label="${esc(tc('sort'))}">${['recent', 'name', 'stage'].map(s => `<option value="${s}" ${s === F.sort ? 'selected' : ''}>${esc(tc('sort.' + s))}</option>`).join('')}</select>
  </div>
  <div class="bulk" hidden><span class="bulk-n"></span><select name="bulkStage" aria-label="${esc(tc('stage'))}"><option value="">${esc(tc('cl.moveTo'))}</option>${stageOptions('')}</select><button class="btn ghost sm" data-act="bulkMail">${icon('mail')}${esc(tc('cl.emailSel'))}</button></div>
  ${rows.length ? `<div class="tbl-wrap"><table class="tbl clients"><thead><tr><th class="cb"><input type="checkbox" data-all aria-label="${esc(tc('selectAll'))}"></th><th>${esc(tc('name'))}</th><th>${esc(tc('contact'))}</th><th>${esc(tc('stage'))}</th><th>${esc(tc('units'))}</th><th>${esc(tc('lastActivity'))}</th></tr></thead><tbody>
    ${rows.map(c => `<tr data-id="${esc(c.id)}"><td class="cb"><input type="checkbox" data-sel="${esc(c.id)}" aria-label="${esc(clientName(c))}"></td>
      <td><a class="who" href="#/client/${encodeURIComponent(c.id)}"><span class="av">${esc(initials(clientName(c)))}</span><span><b>${esc(clientName(c))}</b><small>${flag(c.lang)}${esc(c.country || '')}${(c.tags || []).map(t => ` <em class="tag">${esc(t)}</em>`).join('')}</small></span></a></td>
      <td><span class="ltr" dir="ltr">${esc(c.email || '')}</span><small class="ltr" dir="ltr">${esc(c.phone || '')}</small></td>
      <td>${stageChip(c.stage || 'lead')}</td>
      <td dir="ltr" class="mono">${esc((c.unitIds || []).join(', ') || '—')}</td>
      <td><small>${esc(fmtDate(c.lastActivity || c.createdAt))}</small></td></tr>`).join('')}
  </tbody></table></div>` : empty(total ? tc('noMatch') : tc('cl.empty'))}`;

  root.querySelectorAll('.filters [name]').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { F[el.name] = el.value; const pos = el.selectionStart; renderList(root); const n = root.querySelector(`.filters [name=${el.name}]`); n.focus(); if (pos != null && n.setSelectionRange) n.setSelectionRange(pos, pos); }));
  $('[data-act=new]', root).onclick = () => editClient();
  $('[data-act=csv]', root).onclick = async () => (await import('./v-settings.js')).exportClients(rows);
  const bulk = $('.bulk', root);
  const sel = () => $$('[data-sel]:checked', root).map(x => x.dataset.sel);
  const upd = () => { const n = sel().length; bulk.hidden = !n; $('.bulk-n', root).textContent = tc('nSelected', { n }); };
  root.querySelectorAll('[data-sel]').forEach(cb => cb.addEventListener('change', upd));
  $('[data-all]', root)?.addEventListener('change', e => { $$('[data-sel]', root).forEach(cb => { cb.checked = e.target.checked; }); upd(); });
  $('[name=bulkStage]', root).addEventListener('change', async e => { const st = e.target.value; if (!st) return; for (const id of sel()) await setStage(id, st); toast(tc('saved')); });
  $('[data-act=bulkMail]', root).onclick = () => { sessionStorage.setItem('vrc.crm.mailPick', JSON.stringify(sel())); location.hash = '#/email'; };
}

// ---------------- client editor ----------------
export function editClient(c = null, onSaved) {
  const x = c || { stage: 'lead', lang: 'he', source: 'phone' };
  openModal({
    title: c ? tc('cl.edit') : tc('new.client'), wide: true,
    body: `<div class="fgrid">
      ${fld(tc('firstName'), `<input name="firstName" value="${esc(x.firstName || '')}" required>`)}
      ${fld(tc('lastName'), `<input name="lastName" value="${esc(x.lastName || '')}">`)}
      ${fld(tc('email'), `<input name="email" type="email" dir="ltr" value="${esc(x.email || '')}">`)}
      ${fld(tc('phone'), `<input name="phone" type="tel" dir="ltr" value="${esc(x.phone || '')}">`)}
      ${fld(tc('country'), `<input name="country" value="${esc(x.country || '')}" placeholder="IL, RO, DE…">`)}
      ${fld(tc('prefLang'), `<select name="lang">${langOptions(x.lang)}</select>`)}
      ${fld(tc('stage'), `<select name="stage">${stageOptions(x.stage)}</select>`)}
      ${fld(tc('source'), `<select name="source">${SOURCES.map(s => `<option value="${s}" ${s === x.source ? 'selected' : ''}>${esc(tc('src.' + s))}</option>`).join('')}</select>`)}
      ${fld(tc('address'), `<input name="address" value="${esc(x.address || '')}">`, 'span2')}
      ${fld(tc('clientTaxId'), `<input name="taxId" dir="ltr" value="${esc(x.taxId || '')}">`)}
      ${fld(tc('budget'), `<input name="budget" type="number" min="0" step="1000" value="${esc(x.budget ?? '')}">`)}
      ${fld(tc('tags'), `<input name="tags" value="${esc((x.tags || []).join(', '))}" placeholder="investor, vip">`, 'span2')}
      <label class="chk span2"><input type="checkbox" name="optOut" ${x.optOut ? 'checked' : ''}><span>${esc(tc('optOut'))}</span></label>
    </div><p class="err" hidden></p>`,
    foot: `<button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn primary" data-save>${esc(tc('save'))}</button>`,
    onMount: (d, close) => d.querySelector('[data-save]').addEventListener('click', async () => {
      const f = formData(d); const err = d.querySelector('.err');
      if (!f.firstName && !f.lastName) { err.textContent = tc('err.name'); err.hidden = false; return; }
      if (f.email && !isEmail(f.email)) { err.textContent = tc('err.email'); err.hidden = false; return; }
      const id = c?.id || (f.email ? clientIdForEmail(f.email) : uid('c_'));
      if (!c && get('clients', id)) { err.textContent = tc('err.dupEmail'); err.hidden = false; return; }
      const body = { ...(c || { timeline: [{ id: uid('t'), type: 'system', at: new Date().toISOString(), text: 'Created' }], createdAt: new Date().toISOString(), unitIds: [] }), ...f, name: `${f.firstName} ${f.lastName}`.trim(), tags: f.tags ? f.tags.split(',').map(s => s.trim()).filter(Boolean) : [] };
      delete body.id;
      try { await setDoc('clients', id, body, `${c ? 'client updated' : 'client created'} ${body.name}`); toast(tc('saved')); close(); onSaved?.(id); if (!c) location.hash = '#/client/' + encodeURIComponent(id); }
      catch (e) { err.textContent = tc('err.save') + ' ' + (e?.message || ''); err.hidden = false; }
    }),
  });
}

// ---------------- client card ----------------
const EV_TYPES = ['note', 'call', 'email', 'meeting', 'whatsapp'];
function renderCard(root, id) {
  const c = get('clients', id);
  if (!c) { root.innerHTML = pageHead(tc('nav.clients')) + empty(S.ready.has('clients') ? tc('cl.notFound') : tc('loading'), `<a class="btn ghost sm" href="#/clients">${esc(tc('back'))}</a>`); return; }
  const deals = entries('deals').filter(d => d.clientId === id);
  const docs = entries('documents').filter(d => d.clientId === id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const tasks = entries('tasks').filter(t => t.clientId === id && !t.done);
  const mails = entries('emails').flatMap(e => (e.log || []).filter(l => l.clientId === id).map(l => ({ ...l, subject: e.subject })));
  const tl = [...(c.timeline || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const si = STAGES.indexOf(c.stage);
  const wa = (c.phone || '').replace(/\D/g, '');
  root.innerHTML = `<a class="crumb" href="#/clients">${icon('chevl')}${esc(tc('nav.clients'))}</a>
  <div class="ccard-h">
    <span class="av xl">${esc(initials(clientName(c)))}</span>
    <div class="ccard-t"><h1>${esc(clientName(c))}</h1><p>${flag(c.lang)} ${esc(countryName(c.country))} · ${esc(tc('src.' + (c.source || 'other')))} · ${esc(tc('since'))} ${esc(fmtDate(c.createdAt))}${c.optOut ? ` · <em class="tag warn">${esc(tc('optedOut'))}</em>` : ''}</p>
      <p class="contacts">${c.email ? `<a href="mailto:${esc(c.email)}" dir="ltr">${icon('mail')}${esc(c.email)}</a>` : ''}${c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}" dir="ltr">${icon('phone')}${esc(c.phone)}</a>` : ''}${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">${icon('send')}WhatsApp</a>` : ''}</p></div>
    <div class="ph-act"><button class="btn ghost sm" data-act="edit">${icon('edit')}${esc(tc('edit'))}</button><button class="btn ghost sm" data-act="task">${icon('task')}${esc(tc('new.task'))}</button><button class="btn ghost sm" data-act="doc">${icon('doc')}${esc(tc('new.document'))}</button><button class="btn primary sm" data-act="deal">${icon('plus')}${esc(tc('new.deal'))}</button></div>
  </div>
  <ol class="stagebar" aria-label="${esc(tc('stage'))}">${STAGES.map((s, i) => `<li><button type="button" data-stage="${s}" class="${i < si ? 'done' : i === si ? 'cur' : ''}" ${i === si ? 'aria-current="step"' : ''}>${esc(tc('stage.' + s))}</button></li>`).join('')}<li class="lost"><button type="button" data-stage="lost" class="${c.stage === 'lost' ? 'cur' : ''}">${esc(tc('stage.lost'))}</button></li></ol>
  <div class="ccard-grid">
    <div class="col-a">
      <div class="card"><div class="card-h"><h2>${esc(tc('deals'))}</h2></div>
        ${deals.length ? deals.map(d => { const f = dealFinance(d); const u = unitById(d.unitId); return `<a class="deal-row" href="#/deal/${encodeURIComponent(d.id)}"><div><b dir="ltr">${esc(d.unitId)}</b><small>${u ? esc(tc('roomsN', { n: u.rooms })) : ''} · ${esc(tc('dstatus.' + (d.status || 'active')))}</small></div><div class="prog"><i style="width:${Math.min(100, f.pctPaid)}%"></i></div><div class="amt"><b>${eur(f.paid)}</b><small>/ ${eur(f.price)}</small></div></a>`; }).join('') : empty(tc('cl.noDeals'))}
      </div>
      <div class="card"><div class="card-h"><h2>${esc(tc('details'))}</h2></div>
        <dl class="kv">${[['email', c.email], ['phone', c.phone], ['country', countryName(c.country)], ['prefLang', c.lang ? tc('langName.' + c.lang) : ''], ['address', c.address], ['clientTaxId', c.taxId], ['budget', c.budget ? eur(c.budget) : ''], ['interested', (c.unitIds || []).join(', ')], ['tags', (c.tags || []).join(', ')], ['webRes', (c.resNos || []).join(', ')]].filter(r => r[1]).map(([k, v]) => `<dt>${esc(tc(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
      <div class="card"><div class="card-h"><h2>${esc(tc('documents'))}</h2></div>
        ${docs.length ? `<ul class="rows">${docs.slice(0, 8).map(d => `<li><span class="dot g"></span><div><a href="#/documents/${encodeURIComponent(d.id)}"><b dir="ltr">${esc(d.number)}</b></a><small>${esc(tc('dt.' + d.type))} · ${esc(fmtDate(d.date))}</small></div><b class="amt">${eur(d.total)}</b></li>`).join('')}</ul>` : empty(tc('cl.noDocs'))}</div>
      ${tasks.length ? `<div class="card"><div class="card-h"><h2>${esc(tc('nav.tasks'))}</h2></div><ul class="rows">${tasks.map(t => `<li class="${relDays(t.due) < 0 ? 'late' : ''}"><span class="dot"></span><div><b>${esc(t.title)}</b><small>${esc(fmtDate(t.due))}</small></div></li>`).join('')}</ul></div>` : ''}
      ${mails.length ? `<div class="card"><div class="card-h"><h2>${esc(tc('emailsSent'))}</h2></div><ul class="rows">${mails.slice(-8).reverse().map(m => `<li><span class="dot ${m.status === 'sent' ? 'g' : ''}"></span><div><b>${esc(m.subject || '')}</b><small>${esc(tc('mstatus.' + m.status))} · ${esc(fmtDateTime(m.at))}</small></div></li>`).join('')}</ul></div>` : ''}
    </div>
    <div class="col-b card">
      <div class="card-h"><h2>${esc(tc('timeline'))}</h2></div>
      <div class="composer">
        <div class="seg-tabs" role="radiogroup">${EV_TYPES.map((t, i) => `<label><input type="radio" name="evType" value="${t}" ${i === 0 ? 'checked' : ''}><span>${icon(t === 'call' ? 'phone' : t === 'email' ? 'mail' : t === 'meeting' ? 'cal' : t === 'whatsapp' ? 'send' : 'note')}${esc(tc('ev.' + t))}</span></label>`).join('')}</div>
        <textarea name="evText" rows="3" placeholder="${esc(tc('tl.placeholder'))}" aria-label="${esc(tc('tl.placeholder'))}"></textarea>
        <div class="composer-f"><input type="datetime-local" name="evAt" aria-label="${esc(tc('date'))}"><button class="btn primary sm" data-act="log">${esc(tc('tl.add'))}</button></div>
      </div>
      ${tl.length ? `<ol class="timeline">${tl.map(e => `<li class="ev-${esc(e.type || 'note')}"><span class="tl-ic">${icon(e.type === 'call' ? 'phone' : e.type === 'email' || e.type === 'mass' ? 'mail' : e.type === 'meeting' ? 'cal' : e.type === 'doc' ? 'doc' : e.type === 'payment' ? 'euro' : e.type === 'stage' ? 'chev' : e.type === 'web' || e.type === 'reservation' ? 'globe' : e.type === 'whatsapp' ? 'send' : 'note')}</span>
        <div class="tl-b"><p class="tl-h"><b>${esc(tc('ev.' + (e.type || 'note')))}</b><time>${esc(fmtDateTime(e.at))}</time></p>
        ${e.type === 'stage' ? `<p>${stageChip(e.from || 'lead')} → ${stageChip(e.to)}</p>` : `<p class="tl-t">${esc(e.text || '')}</p>`}</div>
        ${['note', 'call', 'email', 'meeting', 'whatsapp'].includes(e.type) ? `<button class="icon-btn sm" data-del="${esc(e.id)}" aria-label="${esc(tc('delete'))}">${icon('trash')}</button>` : ''}</li>`).join('')}</ol>` : empty(tc('tl.empty'))}
    </div>
  </div>
  <p class="danger-zone"><button class="btn link danger" data-act="delete">${icon('trash')}${esc(tc('cl.delete'))}</button></p>`;

  root.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => setStage(id, b.dataset.stage).then(() => toast(tc('saved'))));
  $('[data-act=edit]', root).onclick = () => editClient({ id, ...c });
  $('[data-act=deal]', root).onclick = async () => (await import('./v-deals.js')).newDeal({ clientId: id, unitId: (c.unitIds || [])[0] });
  $('[data-act=doc]', root).onclick = async () => (await import('./v-documents.js')).newDocument({ clientId: id, dealId: deals[0]?.id });
  $('[data-act=task]', root).onclick = async () => (await import('./v-tasks.js')).editTask({ clientId: id });
  $('[data-act=log]', root).onclick = async () => {
    const txt = $('[name=evText]', root).value.trim(); if (!txt) { $('[name=evText]', root).focus(); return; }
    const at = $('[name=evAt]', root).value; const type = $('[name=evType]:checked', root).value;
    await addTimeline(id, { type, text: txt, ...(at ? { at: new Date(at).toISOString() } : {}) }); toast(tc('saved'));
    document.dispatchEvent(new Event('crm:rerender'));
  };
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!await confirmUI({ title: tc('delete'), text: tc('tl.delQ'), danger: true, ok: tc('delete') })) return;
    const cur = get('clients', id); await setDoc('clients', id, { ...cur, timeline: (cur.timeline || []).filter(e => e.id !== b.dataset.del) });
  });
  $('[data-act=delete]', root).onclick = async () => {
    if (!await confirmUI({ title: tc('cl.delete'), text: tc('cl.delQ', { name: clientName(c) }), danger: true, ok: tc('delete') })) return;
    await delDoc('clients', id, `client deleted ${clientName(c)}`); location.hash = '#/clients';
  };
}

// ---------------- kanban ----------------
function renderKanban(root) {
  const cl = entries('clients');
  const dealOf = id => entries('deals').find(d => d.clientId === id && d.status !== 'cancelled');
  const cols = [...STAGES, 'lost'];
  root.innerHTML = `${pageHead(tc('nav.pipeline'), esc(tc('kb.sub')), `<button class="btn primary sm" data-act="new">${icon('plus')}${esc(tc('new.client'))}</button>`)}
  <div class="kanban">${cols.map(s => { const items = cl.filter(c => (c.stage || 'lead') === s); const val = items.reduce((a, c) => { const d = dealOf(c.id); return a + (d ? dealFinance(d).price : 0); }, 0); return `<section class="kcol" data-col="${s}" aria-label="${esc(tc('stage.' + s))}">
    <header><h3>${esc(tc('stage.' + s))}</h3><span class="n">${items.length}</span>${val ? `<small>${eur(val)}</small>` : ''}</header>
    <div class="kdrop">${items.map(c => { const d = dealOf(c.id); return `<article class="kcard" draggable="true" data-id="${esc(c.id)}" tabindex="0">
      <p class="kc-t"><span class="av sm">${esc(initials(clientName(c)))}</span><a href="#/client/${encodeURIComponent(c.id)}">${esc(clientName(c))}</a>${flag(c.lang)}</p>
      <p class="kc-m">${d ? `<span dir="ltr">${esc(d.unitId)}</span> · ${eur(dealFinance(d).price)}` : esc((c.unitIds || []).join(', ') || tc('kb.noUnit'))}</p>
      <label class="kc-move"><span class="vh">${esc(tc('cl.moveTo'))}</span><select data-move="${esc(c.id)}">${cols.map(x => `<option value="${x}" ${x === s ? 'selected' : ''}>${esc(tc('stage.' + x))}</option>`).join('')}</select></label>
    </article>`; }).join('')}</div></section>`; }).join('')}</div>`;
  $('[data-act=new]', root).onclick = () => editClient();
  let dragId = null;
  root.querySelectorAll('.kcard').forEach(k => {
    k.addEventListener('dragstart', e => { dragId = k.dataset.id; k.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
    k.addEventListener('dragend', () => { k.classList.remove('drag'); root.querySelectorAll('.kcol').forEach(c => c.classList.remove('over')); });
  });
  root.querySelectorAll('.kcol').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', async e => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/plain') || dragId; if (id) { await setStage(id, col.dataset.col); toast(tc('movedTo', { s: tc('stage.' + col.dataset.col) })); } });
  });
  root.querySelectorAll('[data-move]').forEach(s => s.addEventListener('change', async () => { await setStage(s.dataset.move, s.value); toast(tc('movedTo', { s: tc('stage.' + s.value) })); }));
  void splitName; void tabs;
}
