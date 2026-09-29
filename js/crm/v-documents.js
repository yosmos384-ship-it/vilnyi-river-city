// Documents: reservation confirmations, pro-forma invoices, payment receipts, quotes, credit notes.
// Numbered per issuer entity + type (settings/counters, lease-protected), stored in db `documents` with a full
// snapshot so the PDF can be re-rendered identically later. All documents are PRO-FORMA / INTERNAL.
import { unitById, TYPES, PROJECT } from '../data.js';
import { LANGS } from '../i18n.js';
import { tc, tcL } from './i18n-crm.js';
import { S, entries, get, setDoc, patchDoc, settings, nextNumber, dealFinance, clientName, addTimeline, DOC_TYPES } from './store.js';
import { esc, icon, eur, fmtDate, today, addDays, uid, openModal, confirmUI, formData, toast, $, $$, round2 } from './util.js';
import { pageHead, clientOptions, fld, empty, tabs, langOptions } from './ui.js';
import { documentPdf, renderDocument, unitLabelDoc } from './pdf.js';

const F = { type: 'all', q: '' };
export const VAT_PRESETS = [0, 5, 11, 19, 21, 23];   // shortcuts only; labels say whose rate it is

export function render(root, name, params) {
  if (params?.[0]) return renderDoc(root, params[0]);
  const q = F.q.toLowerCase();
  const ds = entries('documents').filter(d => (F.type === 'all' || d.type === F.type) && (!q || [d.number, d.client?.name, d.unit?.id].join(' ').toLowerCase().includes(q))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const cnt = t => entries('documents').filter(d => t === 'all' || d.type === t).length;
  root.innerHTML = `${pageHead(tc('nav.documents'), esc(tc('doc.sub')), `<button class="btn primary sm" data-act="new">${icon('plus')}${esc(tc('new.document'))}</button>`)}
  <div class="legal" role="note">${icon('shield')}<div><b>${esc(tc('legal.title'))}</b><p>${esc(tc('legal.text'))}</p></div></div>
  <div class="filters">${tabs([['all', tc('all'), cnt('all')], ...DOC_TYPES.map(t => [t, tc('dt.' + t), cnt(t)])], F.type)}
    <label class="search">${icon('search')}<input type="search" name="q" value="${esc(F.q)}" placeholder="${esc(tc('doc.search'))}" aria-label="${esc(tc('doc.search'))}"></label></div>
  ${ds.length ? `<div class="tbl-wrap"><table class="tbl docs"><thead><tr><th>${esc(tc('number'))}</th><th>${esc(tc('type'))}</th><th>${esc(tc('client'))}</th><th>${esc(tc('unit'))}</th><th>${esc(tc('date'))}</th><th class="num">${esc(tc('total'))}</th><th></th></tr></thead><tbody>
  ${ds.map(d => `<tr class="click ${d.status === 'void' ? 'void' : ''}" data-href="#/documents/${encodeURIComponent(d.id)}"><td><a href="#/documents/${encodeURIComponent(d.id)}"><b dir="ltr" class="mono">${esc(d.number)}</b></a><small>${esc(settings().entities[d.entityId]?.name || '')}</small></td><td>${esc(tc('dt.' + d.type))}${d.status === 'void' ? ` <em class="tag warn">${esc(tc('void'))}</em>` : ''}</td><td>${esc(d.client?.name || '')}</td><td dir="ltr" class="mono">${esc(d.unit?.id || '—')}</td><td>${esc(fmtDate(d.date))}</td><td class="num">${eur(d.total, 2)}</td><td class="acts"><button class="icon-btn sm" data-dl="${esc(d.id)}" aria-label="${esc(tc('download'))}" title="${esc(tc('download'))}">${icon('down')}</button></td></tr>`).join('')}
  </tbody></table></div>` : empty(tc('doc.empty'))}`;
  root.querySelector('[name=q]').addEventListener('input', e => { F.q = e.target.value; const p = e.target.selectionStart; render(root, name, []); const n = root.querySelector('[name=q]'); n.focus(); n.setSelectionRange(p, p); });
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { F.type = b.dataset.tab; render(root, name, []); });
  root.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a,button')) location.hash = tr.dataset.href; });
  root.querySelectorAll('[data-dl]').forEach(b => b.onclick = e => { e.stopPropagation(); downloadDoc(get('documents', b.dataset.dl)); });
  $('[data-act=new]', root).onclick = () => newDocument({});
}

// ---------------- detail ----------------
async function renderDoc(root, id) {
  const d = get('documents', id);
  if (!d) { root.innerHTML = pageHead(tc('nav.documents')) + empty(S.ready.has('documents') ? tc('doc.notFound') : tc('loading')); return; }
  root.innerHTML = `<a class="crumb" href="#/documents">${icon('chevl')}${esc(tc('nav.documents'))}</a>
  ${pageHead(`${tc('dt.' + d.type)} ${d.number}`, `${esc(d.client?.name || '')} · ${esc(fmtDate(d.date))} · ${eur(d.total, 2)}${d.status === 'void' ? ` · <em class="tag warn">${esc(tc('void'))}</em>` : ''}`,
    `<button class="btn ghost sm" data-act="mail">${icon('mail')}${esc(tc('doc.email'))}</button>${d.status !== 'void' && d.type === 'proforma' ? `<button class="btn ghost sm" data-act="credit">${icon('receipt')}${esc(tc('doc.credit'))}</button>` : ''}${d.status !== 'void' ? `<button class="btn ghost sm" data-act="void">${icon('x')}${esc(tc('doc.void'))}</button>` : ''}<button class="btn primary sm" data-act="dl">${icon('down')}${esc(tc('downloadPdf'))}</button>`)}
  <div class="legal sm" role="note">${icon('shield')}<p>${esc(tc('legal.short'))}</p></div>
  <div class="doc-prev" aria-busy="true"><p class="muted">${esc(tc('rendering'))}</p></div>`;
  $('[data-act=dl]', root).onclick = () => downloadDoc(d);
  $('[data-act=mail]', root).onclick = async () => (await import('./v-email.js')).sendSingle({ clientId: d.clientId, docId: d.id });
  $('[data-act=void]', root)?.addEventListener('click', async () => {
    if (!await confirmUI({ title: tc('doc.void'), text: tc('doc.voidQ', { n: d.number }), danger: true, ok: tc('doc.void') })) return;
    await patchDoc('documents', id, { status: 'void', voidedAt: new Date().toISOString(), snapshot: { ...d.snapshot, status: 'void' } }, `document ${d.number} voided`); toast(tc('saved'));
  });
  $('[data-act=credit]', root)?.addEventListener('click', () => newDocument({ type: 'credit', clientId: d.clientId, dealId: d.dealId, refDocId: d.id }));
  const pages = await renderDocument(d.snapshot);
  const box = $('.doc-prev', root); if (!box) return;
  box.innerHTML = ''; box.removeAttribute('aria-busy');
  pages.forEach((c, i) => { const img = document.createElement('img'); img.src = c.toDataURL('image/jpeg', 0.85); img.alt = `${d.number} — ${i + 1}/${pages.length}`; box.appendChild(img); });
}

// ---------------- save / download ----------------
export async function pdfBytesFor(doc) { return (await documentPdf(doc.snapshot)).bytes; }
export const fileNameFor = d => `${d.number}_${(d.client?.name || '').replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`.replace(/-+\.pdf$/, '.pdf');
export async function downloadDoc(d) {
  if (!d) return;
  toast(tc('rendering'), 'info', 1500);
  const bytes = await pdfBytesFor(d); const filename = fileNameFor(d);
  if (S.downloads) {
    try { await S.downloads.save({ filename, data: new Blob([bytes], { type: 'application/pdf' }) }); toast(tc('doc.saved')); }
    catch (e) { if (e?.code === 'declined') return; toast(tc('doc.saveErr', { c: e?.code || '' }), 'err', 5000); }
    return;
  }
  if (S.mode === 'local') {  // outside claude.ai a normal browser download works
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }
  toast(tc('doc.noDownloads'), 'err', 6000);
}

// ---------------- create ----------------
function defaultLines(type, l, ctx) {
  const T = (k, v) => tcL(l, k, v); const u = ctx.unit; const ul = u ? `${u.id} — ${unitLabelDoc(u, l)}` : '';
  if (type === 'receipt' && ctx.payment) return [{ desc: T('d.line.payment', { unit: ul, ref: ctx.payment.ref || '' }), qty: 1, price: ctx.payment.amount }];
  if (type === 'reservation') return [{ desc: T('d.line.deposit', { unit: ul }), qty: 1, price: PROJECT.terms.reservationDeposit }];
  if (type === 'proforma' && ctx.inst) return [{ desc: `${ctx.inst.label || T('ik.' + ctx.inst.kind)}${ctx.inst.part ? ' ' + ctx.inst.part : ''} — ${ul}`, qty: 1, price: ctx.inst.open ?? ctx.inst.amount }];
  if (type === 'quote' && u) return [{ desc: T('d.line.unit', { unit: ul, m2: TYPES[u.type].total.toFixed(2) }), qty: 1, price: ctx.price ?? u.price }];
  if (type === 'credit' && ctx.refDoc) return ctx.refDoc.snapshot.lines.map(x => ({ ...x }));
  return [{ desc: ul, qty: 1, price: 0 }];
}

export function newDocument({ type = 'proforma', clientId, dealId, instId, paymentId, refDocId }) {
  const st = settings();
  const deal = dealId ? get('deals', dealId) : null;
  const cid = clientId || deal?.clientId || '';
  const client = cid ? get('clients', cid) : null;
  let lang = client?.lang || 'en';
  const lines0 = () => {
    const d = dealId ? get('deals', dealId) : null; const f = d ? dealFinance(d) : null;
    return defaultLines(type, lang, { unit: d ? unitById(d.unitId) : null, payment: d?.payments?.find(p => p.id === paymentId), inst: f ? (f.rows.find(r => r.id === instId) || f.next) : null, price: f?.price, refDoc: refDocId ? get('documents', refDocId) : null });
  };
  let lines = lines0();
  const refDoc = refDocId ? get('documents', refDocId) : null;
  const vat0 = refDoc ? refDoc.vatRate : (type === 'receipt' ? 0 : st.vatRate || 0);
  openModal({
    title: tc('new.document'), wide: true, cls: 'docform',
    body: `<div class="legal sm" role="note">${icon('shield')}<p>${esc(tc('legal.short'))}</p></div>
    <div class="fgrid f3">
      ${fld(tc('type'), `<select name="type">${DOC_TYPES.map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${esc(tc('dt.' + t))}</option>`).join('')}</select>`)}
      ${fld(tc('issuer'), `<select name="entityId">${['cy', 'pt'].map(e => `<option value="${e}" ${e === (deal?.entity || refDoc?.entityId || st.defaultEntity) ? 'selected' : ''}>${esc(st.entities[e].name)}</option>`).join('')}</select>`)}
      ${fld(tc('docLang'), `<select name="lang">${langOptions(lang)}</select>`)}
      ${fld(tc('client'), `<select name="clientId">${clientOptions(cid)}</select>`, 'span2')}
      ${fld(tc('deal'), `<select name="dealId"><option value="">—</option>${entries('deals').filter(x => !cid || x.clientId === cid).map(x => `<option value="${esc(x.id)}" ${x.id === dealId ? 'selected' : ''}>${esc(x.unitId)} · ${esc(clientName(get('clients', x.clientId)))}</option>`).join('')}</select>`)}
      ${fld(tc('date'), `<input name="date" type="date" value="${today()}">`)}
      ${fld(tc('dueDate'), `<input name="dueDate" type="date" value="${addDays(today(), st.paymentTermsDays || 7)}">`)}
      ${fld(tc('vatRate'), `<select name="vatRate">${VAT_PRESETS.map(v => `<option value="${v}" ${v === vat0 ? 'selected' : ''}>${v}% · ${esc(tc('vat.' + v))}</option>`).join('')}</select>`)}
    </div>
    <h3 class="h-s">${esc(tc('lines'))}</h3>
    <div class="lines"></div><button type="button" class="btn link sm" data-addline>${icon('plus')}${esc(tc('addLine'))}</button>
    <div class="fgrid">${fld(tc('vatNote'), `<input name="vatNote" value="${esc(refDoc?.snapshot?.vatNote ?? st.vatNote ?? '')}" placeholder="${esc(tc('vatNoteHint'))}">`, 'span2')}
      ${fld(tc('payRef'), `<input name="payRef" dir="ltr" value="${esc(deal ? `${deal.unitId}-${(clientName(client).split(' ').pop() || '').toUpperCase()}` : '')}">`)}
      ${fld(tc('notes'), `<textarea name="notes" rows="2">${esc(refDoc ? tcL(lang, 'd.creditFor', { n: refDoc.number }) : '')}</textarea>`, 'span2')}</div>
    <div class="totals-box"></div><p class="err" hidden></p>`,
    foot: `<button type="button" class="btn ghost" data-prev>${icon('eye')}${esc(tc('preview'))}</button><span class="grow"></span><button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn primary" data-save>${icon('pdf')}${esc(tc('doc.issue'))}</button>`,
    onMount: (dl, close) => {
      const linesEl = $('.lines', dl);
      const drawLines = () => {
        linesEl.innerHTML = lines.map((l, i) => `<div class="line" data-i="${i}"><input name="l_desc" value="${esc(l.desc)}" aria-label="${esc(tc('d.desc'))}"><input name="l_qty" type="number" step="1" min="0" value="${esc(l.qty)}" aria-label="${esc(tc('qty'))}"><input name="l_price" type="number" step="0.01" value="${esc(l.price)}" aria-label="${esc(tc('amount'))}"><button type="button" class="icon-btn sm" data-rm="${i}" aria-label="${esc(tc('delete'))}">${icon('trash')}</button></div>`).join('');
        linesEl.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { lines.splice(Number(b.dataset.rm), 1); drawLines(); totals(); });
        linesEl.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { readLines(); totals(); }));
      };
      const readLines = () => { lines = $$('.line', dl).map(r => ({ desc: $('[name=l_desc]', r).value, qty: Number($('[name=l_qty]', r).value) || 0, price: Number($('[name=l_price]', r).value) || 0 })); };
      const totals = () => { const vr = Number($('[name=vatRate]', dl).value) || 0; const sub = round2(lines.reduce((s, l) => s + l.qty * l.price, 0)); const vat = round2(sub * vr / 100); $('.totals-box', dl).innerHTML = `<dl><dt>${esc(tc('subtotal'))}</dt><dd>${eur(sub, 2)}</dd><dt>${esc(tc('vat'))} ${vr}%</dt><dd>${eur(vat, 2)}</dd><dt class="t">${esc(tc('total'))}</dt><dd class="t">${eur(sub + vat, 2)}</dd></dl>`; };
      drawLines(); totals();
      $('[data-addline]', dl).onclick = () => { readLines(); lines.push({ desc: '', qty: 1, price: 0 }); drawLines(); };
      $('[name=vatRate]', dl).onchange = totals;
      const regen = () => { const f = formData(dl); type = f.type; lang = f.lang; dealId = f.dealId || null; lines = lines0(); drawLines(); totals(); };
      $('[name=type]', dl).onchange = regen; $('[name=lang]', dl).onchange = regen; $('[name=dealId]', dl).onchange = regen;
      $('[name=clientId]', dl).onchange = e => { const c = get('clients', e.target.value); if (c?.lang) $('[name=lang]', dl).value = c.lang; regen(); };
      const build = async (number) => { readLines(); const f = formData(dl); return buildSnapshot({ ...f, lines, number, paymentId, instId, refDoc }); };
      $('[data-prev]', dl).onclick = async () => { const snap = await build(tc('draft')); const pages = await renderDocument(snap); openModal({ title: tc('preview'), wide: true, cls: 'prevmodal', body: `<div class="doc-prev">${pages.map(c => `<img src="${c.toDataURL('image/jpeg', .85)}" alt="">`).join('')}</div>` }); };
      $('[data-save]', dl).onclick = async () => {
        const err = $('.err', dl); const f = formData(dl);
        if (!f.clientId) { err.textContent = tc('err.client'); err.hidden = false; return; }
        readLines(); if (!lines.length || lines.every(l => !l.price)) { err.textContent = tc('err.lines'); err.hidden = false; return; }
        const btn = $('[data-save]', dl); btn.disabled = true;
        try {
          const { number, seq } = await nextNumber(f.entityId, f.type);
          const snap = await build(number);
          const id = uid('doc_');
          const rec = { type: f.type, number, seq, entityId: f.entityId, clientId: f.clientId, dealId: f.dealId || null, unit: snap.unit, client: { name: snap.client.name }, date: f.date, lang: f.lang, subtotal: snap.subtotal, vatRate: snap.vatRate, vat: snap.vat, total: snap.total, status: 'issued', createdAt: new Date().toISOString(), createdBy: S.me.id || null, snapshot: snap, paymentId: paymentId || null, refDocId: refDoc?.id || null };
          await setDoc('documents', id, rec, `document issued ${number}`);
          if (paymentId && f.dealId) { const d = get('deals', f.dealId); await patchDoc('deals', f.dealId, { payments: (d.payments || []).map(p => p.id === paymentId ? { ...p, receiptId: id, receiptNo: number } : p) }); }
          await addTimeline(f.clientId, { type: 'doc', text: `${tc('dt.' + f.type)} ${number} · ${eur(snap.total, 2)}`, docId: id });
          toast(tc('doc.issued', { n: number })); close();
          location.hash = '#/documents/' + encodeURIComponent(id);
          downloadDoc(rec);
        } catch (e) { btn.disabled = false; err.textContent = tc('err.save') + ' ' + (e?.message || ''); err.hidden = false; }
      };
    },
  });
}

export function buildSnapshot({ type, entityId, lang, clientId, dealId, date, dueDate, vatRate, vatNote, notes, payRef, lines, number, paymentId, instId, refDoc }) {
  const st = settings(); const c = get('clients', clientId) || {}; const d = dealId ? get('deals', dealId) : null;
  const u = d ? unitById(d.unitId) : null; const f = d ? dealFinance(d) : null;
  const sub = round2(lines.reduce((s, l) => s + (l.qty ?? 1) * l.price, 0)); const vr = Number(vatRate) || 0; const vat = round2(sub * vr / 100);
  const pay = d?.payments?.find(p => p.id === paymentId);
  return {
    type, number, date, dueDate, lang, entityId, entity: { ...st.entities[entityId] }, status: 'issued',
    client: { name: clientName(c), email: c.email || '', phone: c.phone || '', country: c.country || '', address: c.address || '', taxId: c.taxId || '' },
    unit: u ? { id: u.id } : null, dealPrice: f?.price || null, planId: d?.planId || null,
    lines: lines.map(l => ({ desc: l.desc, qty: l.qty ?? 1, price: round2(l.price) })), subtotal: sub, vatRate: vr, vat, total: round2(sub + vat), vatNote, notes, payRef,
    payment: type === 'receipt' ? (pay ? { date: pay.date, method: pay.method, ref: pay.ref, amount: pay.amount } : { date, method: 'bank' }) : null,
    schedule: type === 'reservation' && f ? f.rows.map(r => ({ kind: r.kind, part: r.part || '', due: r.due, amount: r.amount })) : null,
    refNumber: refDoc?.number || null, instId: instId || null,
  };
}
void LANGS;
