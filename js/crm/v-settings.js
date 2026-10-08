// Settings: issuing entities (no invented tax/bank data — empty until the owner fills them), numbering series,
// email signature & sending, users/roles, CSV import/export, audit log, local-demo reset.
import { UNITS, TYPES, unitById } from '../data.js?v=3.6';
import { unitLabelL } from '../i18n.js?v=3.6';
import { tc } from './i18n-crm.js?v=3.6';
import { S, entries, get, setDoc, settings, DOC_TYPES, clientName, clientIdForEmail, splitName, unitState, dealFinance, all, STAGES } from './store.js?v=3.6';
import { esc, icon, fmtDateTime, toCSV, parseCSV, toast, $, formData, uid, isEmail, confirmUI, openModal } from './util.js?v=3.6';
import { pageHead, fld, tabs, empty } from './ui.js?v=3.6';
import { planText } from '../i18n.js?v=3.6';
import { planOf } from './store.js?v=3.6';
import { VAT_PRESETS } from './v-documents.js?v=3.6';

const F = { tab: 'company' };
const ENT_FIELDS = ['name', 'address', 'city', 'country', 'regNo', 'taxId', 'vatNo', 'email', 'phone', 'beneficiary', 'iban', 'bic', 'bank', 'footer', 'prefix'];

export function render(root) {
  root.innerHTML = `${pageHead(tc('nav.settings'))}${tabs([['company', tc('set.company')], ['numbering', tc('set.numbering')], ['email', tc('set.email')], ['users', tc('set.users')], ['data', tc('set.data')], ['audit', tc('set.audit')]], F.tab)}<div class="set-body"></div>`;
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { F.tab = b.dataset.tab; render(root); });
  const body = $('.set-body', root); const st = settings();
  if (F.tab === 'company') {
    body.innerHTML = `<div class="legal" role="note">${icon('shield')}<div><b>${esc(tc('legal.title'))}</b><p>${esc(tc('set.entitiesNote'))}</p></div></div>
    <div class="grid2">${['cy', 'pt'].map(e => `<form class="card ent" data-ent="${e}"><div class="card-h"><h2>${esc(st.entities[e].name)}</h2><label class="chk"><input type="radio" name="defaultEntity" value="${e}" ${st.defaultEntity === e ? 'checked' : ''}><span>${esc(tc('set.default'))}</span></label></div>
      <div class="fgrid">${ENT_FIELDS.map(k => fld(tc('ent.' + k), `<input name="${k}" value="${esc(st.entities[e][k] || '')}" ${['iban', 'bic', 'regNo', 'taxId', 'vatNo', 'email', 'phone', 'prefix'].includes(k) ? 'dir="ltr"' : ''}>`, ['name', 'address', 'footer'].includes(k) ? 'span2' : '')).join('')}</div></form>`).join('')}</div>
    <div class="card gen"><div class="fgrid">${fld(tc('set.vatDefault'), `<select name="vatRate">${VAT_PRESETS.map(v => `<option value="${v}" ${v === Number(st.vatRate) ? 'selected' : ''}>${v}% · ${esc(tc('vat.' + v))}</option>`).join('')}</select>`)}${fld(tc('set.terms'), `<input name="paymentTermsDays" type="number" min="0" value="${esc(st.paymentTermsDays)}">`)}${fld(tc('vatNote'), `<input name="vatNote" value="${esc(st.vatNote || '')}" placeholder="${esc(tc('vatNoteHint'))}">`, 'span2')}</div>
    <p class="fine">${icon('info')}${esc(tc('set.vatInfo'))}</p><div class="row-end"><button class="btn primary" data-act="saveCo">${esc(tc('save'))}</button></div></div>
    <div class="card comp-card"><h2>${icon('shield')}${esc(tc('set.compliance'))}</h2><p class="muted sm" style="margin-top:8px">${esc(tc('set.compIntro'))}</p>
      <div class="comp">${['RO', 'PT', 'CY'].map(k => `<div><b>${esc(tc('set.comp' + k + 'T'))}</b><p>${esc(tc('set.comp' + k))}</p></div>`).join('')}</div></div>`;
    body.querySelectorAll('[name=defaultEntity]').forEach(r => r.addEventListener('change', () => body.querySelectorAll('[name=defaultEntity]').forEach(o => { o.checked = o === r; })));
    $('[data-act=saveCo]', body).onclick = async () => {
      const ents = {}; body.querySelectorAll('[data-ent]').forEach(f => { const x = formData(f); delete x.defaultEntity; ents[f.dataset.ent] = { ...st.entities[f.dataset.ent], ...x }; });
      const def = body.querySelector('[name=defaultEntity]:checked')?.value || st.defaultEntity;
      const g = formData(body.querySelector('.card.gen'));
      await setDoc('settings', 'main', { ...(get('settings', 'main') || {}), entities: ents, defaultEntity: def, vatRate: Number(g.vatRate) || 0, paymentTermsDays: Number(g.paymentTermsDays) || 0, vatNote: g.vatNote }, 'settings: company updated'); toast(tc('saved'));
    };
  } else if (F.tab === 'numbering') {
    const ctr = get('settings', 'counters') || {}; const y = new Date().getFullYear();
    body.innerHTML = `<div class="card"><p class="muted">${esc(tc('set.numInfo'))}</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(tc('type'))}</th><th>${esc(tc('set.prefix'))}</th><th>${esc(tc('set.pad'))}</th><th>${esc(tc('set.yearly'))}</th><th>${esc(tc('set.start'))}</th><th>${esc(tc('set.nextCy'))}</th><th>${esc(tc('set.nextPt'))}</th></tr></thead><tbody>
      ${DOC_TYPES.map(t => { const s = st.series[t]; const nx = e => { const key = `${e}.${t}.${s.yearly === false ? 'all' : y}`; const n = Math.max((ctr[key] || 0) + 1, Number(s.start || 1)); return `${st.entities[e].prefix}-${s.prefix}-${s.yearly === false ? '' : y + '-'}${String(n).padStart(s.pad || 4, '0')}`; }; return `<tr data-t="${t}"><td>${esc(tc('dt.' + t))}</td><td><input name="prefix" value="${esc(s.prefix)}" size="4" dir="ltr" aria-label="${esc(tc('set.prefix'))}"></td><td><input name="pad" type="number" min="2" max="8" value="${esc(s.pad || 4)}" aria-label="${esc(tc('set.pad'))}"></td><td><input type="checkbox" name="yearly" ${s.yearly !== false ? 'checked' : ''} aria-label="${esc(tc('set.yearly'))}"></td><td><input name="start" type="number" min="1" value="${esc(s.start || 1)}" aria-label="${esc(tc('set.start'))}"></td><td dir="ltr" class="mono">${esc(nx('cy'))}</td><td dir="ltr" class="mono">${esc(nx('pt'))}</td></tr>`; }).join('')}
    </tbody></table></div><p class="fine">${icon('info')}${esc(tc('set.numNote'))}</p><div class="row-end"><button class="btn primary" data-act="saveNum">${esc(tc('save'))}</button></div></div>`;
    $('[data-act=saveNum]', body).onclick = async () => {
      const series = {}; body.querySelectorAll('tr[data-t]').forEach(tr => { const x = formData(tr); series[tr.dataset.t] = { prefix: x.prefix || st.series[tr.dataset.t].prefix, pad: Number(x.pad) || 4, yearly: x.yearly, start: Number(x.start) || 1 }; });
      await setDoc('settings', 'main', { ...(get('settings', 'main') || {}), series }, 'settings: numbering updated'); toast(tc('saved'));
    };
  } else if (F.tab === 'email') {
    body.innerHTML = `<div class="card"><div class="fgrid">${fld(tc('set.sender'), `<input name="senderName" value="${esc(st.senderName || '')}">`)}${fld(tc('mail.throttle'), `<select name="throttleMs">${[1000, 2000, 3000, 5000, 10000].map(v => `<option value="${v}" ${v === Number(st.throttleMs) ? 'selected' : ''}>${v / 1000} s</option>`).join('')}</select>`)}
      ${fld(tc('set.signature'), `<textarea name="signature" rows="5">${esc(st.signature || '')}</textarea>`, 'span2')}</div>
      <p class="fine">${icon('info')}${esc(tc('set.sigNote'))}</p><div class="row-end"><button class="btn primary" data-act="saveMail">${esc(tc('save'))}</button></div></div>
      <div class="card"><h2>${esc(tc('set.gmailT'))}</h2><p class="muted">${esc(tc('set.gmailText'))}</p></div>`;
    $('[data-act=saveMail]', body).onclick = async () => { const x = formData(body); await setDoc('settings', 'main', { ...(get('settings', 'main') || {}), senderName: x.senderName, signature: x.signature, throttleMs: Number(x.throttleMs) }, 'settings: email updated'); toast(tc('saved')); };
  } else if (F.tab === 'users') {
    body.innerHTML = `<div class="card"><h2>${esc(tc('set.rolesT'))}</h2><p class="muted">${esc(tc('set.rolesIntro'))}</p>
      <table class="tbl roles"><thead><tr><th>${esc(tc('set.role'))}</th><th>${esc(tc('set.crm'))}</th><th>${esc(tc('set.site'))}</th></tr></thead><tbody>
      ${['owner', 'editor', 'contributor', 'viewer'].map(r => `<tr><th>${esc(tc('role.' + r))}</th><td>${esc(tc('role.' + r + '.crm'))}</td><td>${esc(tc('role.' + r + '.site'))}</td></tr>`).join('')}</tbody></table>
      <p class="fine">${icon('lock')}${esc(tc('set.rolesNote'))}</p>
      <dl class="kv"><dt>${esc(tc('set.you'))}</dt><dd>${esc(S.me.name || '—')} · ${esc(S.me.isOwner ? tc('role.owner') : S.me.canEdit ? tc('role.editor') : '—')}</dd><dt>${esc(tc('set.mode'))}</dt><dd>${esc(tc(S.mode === 'local' ? 'mode.local' : 'mode.live'))}</dd></dl></div>`;
  } else if (F.tab === 'data') {
    body.innerHTML = `<div class="grid2"><div class="card"><h2>${esc(tc('set.export'))}</h2><p class="muted">${esc(tc('set.exportNote'))}</p>
      <div class="btn-col"><button class="btn ghost" data-x="clients">${icon('down')}${esc(tc('nav.clients'))} (CSV)</button><button class="btn ghost" data-x="deals">${icon('down')}${esc(tc('nav.deals'))} (CSV)</button><button class="btn ghost" data-x="payments">${icon('down')}${esc(tc('payments'))} (CSV)</button><button class="btn ghost" data-x="units">${icon('down')}${esc(tc('nav.units'))} (CSV)</button><button class="btn ghost" data-x="documents">${icon('down')}${esc(tc('nav.documents'))} (CSV)</button></div></div>
    <div class="card"><h2>${esc(tc('set.import'))}</h2><p class="muted">${esc(tc('set.importNote'))}</p><p class="mono sm" dir="ltr">firstName,lastName,email,phone,country,lang,stage,source,tags,notes</p>
      <label class="btn ghost file">${icon('up')}${esc(tc('set.chooseCsv'))}<input type="file" accept=".csv,text/csv" hidden></label><div class="imp-res"></div></div></div>
    ${S.mode === 'local' ? `<div class="card"><h2>${esc(tc('set.demoT'))}</h2><p class="muted">${esc(tc('set.demoText'))}</p><button class="btn ghost danger" data-act="reset">${icon('trash')}${esc(tc('set.reset'))}</button></div>` : ''}`;
    body.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ({ clients: () => exportClients(entries('clients')), deals: exportDeals, payments: exportPayments, units: () => exportUnits(UNITS), documents: exportDocuments })[b.dataset.x]());
    $('input[type=file]', body).onchange = e => importClients(e.target.files[0], $('.imp-res', body));
    $('[data-act=reset]', body)?.addEventListener('click', async () => { if (!await confirmUI({ title: tc('set.reset'), text: tc('set.resetQ'), danger: true, ok: tc('set.reset') })) return; try { localStorage.removeItem('vrc.crm.localdb.v1'); } catch (e) { /* ignore */ } location.reload(); });
  } else {
    const days = entries('audit').sort((a, b) => String(b.day).localeCompare(String(a.day)));
    const rows = days.flatMap(d => [...(d.entries || [])].reverse()).slice(0, 400);
    body.innerHTML = rows.length ? `<div class="card"><p class="muted">${esc(tc('set.auditNote'))}</p><ol class="audit">${rows.map(r => `<li><time>${esc(fmtDateTime(r.at))}</time><span>${esc(r.text)}</span>${r.by && r.by !== S.me.id ? `<small>${esc(tc('set.byOther'))}</small>` : ''}</li>`).join('')}</ol></div>` : empty(tc('set.noAudit'));
  }
}

// ---------------- CSV ----------------
async function saveFile(filename, text) {
  if (S.downloads) { try { await S.downloads.save({ filename, data: text }); toast(tc('doc.saved')); } catch (e) { if (e?.code !== 'declined') toast(tc('doc.saveErr', { c: e?.code || '' }), 'err'); } return; }
  if (S.mode === 'local') { const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); return; }
  toast(tc('doc.noDownloads'), 'err', 6000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
export function exportClients(rows) {
  saveFile(`vrc-clients-${stamp()}.csv`, toCSV(rows, [{ key: 'firstName' }, { key: 'lastName' }, { key: 'email' }, { key: 'phone' }, { key: 'country' }, { key: 'lang' }, { key: 'stage' }, { key: 'source' }, { key: 'tags', get: r => (r.tags || []).join('; ') }, { key: 'units', get: r => (r.unitIds || []).join('; ') }, { key: 'optOut', get: r => r.optOut ? 'yes' : '' }, { key: 'createdAt' }, { key: 'lastActivity' }]));
}
export function exportDeals() {
  saveFile(`vrc-deals-${stamp()}.csv`, toCSV(entries('deals'), [{ key: 'resNo' }, { key: 'unitId' }, { key: 'client', get: d => clientName(get('clients', d.clientId)) }, { key: 'email', get: d => get('clients', d.clientId)?.email || '' }, { key: 'plan', get: d => planText(planOf(d.planId)) }, { key: 'entity' }, { key: 'status' }, { key: 'price', get: d => dealFinance(d).price }, { key: 'paid', get: d => dealFinance(d).paid }, { key: 'balance', get: d => dealFinance(d).balance }, { key: 'nextDue', get: d => dealFinance(d).next?.due || '' }, { key: 'nextAmount', get: d => dealFinance(d).next?.open || '' }, { key: 'createdAt' }]));
}
function exportPayments() {
  const rows = entries('deals').flatMap(d => (d.payments || []).map(p => ({ ...p, unitId: d.unitId, client: clientName(get('clients', d.clientId)) })));
  saveFile(`vrc-payments-${stamp()}.csv`, toCSV(rows, [{ key: 'date' }, { key: 'unitId' }, { key: 'client' }, { key: 'amount' }, { key: 'kind' }, { key: 'method' }, { key: 'ref' }, { key: 'receiptNo' }, { key: 'note' }]));
}
export function exportUnits(rows) {
  saveFile(`vrc-units-${stamp()}.csv`, toCSV(rows, [{ key: 'id' }, { key: 'building' }, { key: 'floor' }, { key: 'apNo' }, { key: 'rooms' }, { key: 'type' }, { key: 'm2', get: u => TYPES[u.type].total }, { key: 'price' }, { key: 'eurPerM2', get: u => u.rate }, { key: 'lakeView', get: u => u.view }, { key: 'side', get: u => u.side }, { key: 'facing' }, { key: 'status', get: u => unitState(u.id).status }, { key: 'client', get: u => { const s = unitState(u.id); return s.clientId ? clientName(get('clients', s.clientId)) : ''; } }, { key: 'label', get: u => unitLabelL(u) }]));
}
function exportDocuments() {
  saveFile(`vrc-documents-${stamp()}.csv`, toCSV(entries('documents'), [{ key: 'number' }, { key: 'type' }, { key: 'entityId' }, { key: 'date' }, { key: 'client', get: d => d.client?.name || '' }, { key: 'unit', get: d => d.unit?.id || '' }, { key: 'subtotal' }, { key: 'vatRate' }, { key: 'vat' }, { key: 'total' }, { key: 'status' }]));
}
async function importClients(file, out) {
  if (!file) return;
  const rows = parseCSV(await file.text()); let added = 0, updated = 0, skipped = 0;
  const pick = (r, ...ks) => { for (const k of ks) { const hit = Object.keys(r).find(x => x.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase()); if (hit && r[hit]) return r[hit]; } return ''; };
  for (const r of rows) {
    const email = pick(r, 'email', 'e-mail', 'mail'); let fn = pick(r, 'firstName', 'first', 'prenume', 'vorname'), ln = pick(r, 'lastName', 'last', 'surname', 'nume', 'nachname');
    if (!fn && !ln) { const n = splitName(pick(r, 'name', 'fullname')); fn = n.firstName; ln = n.lastName; }
    if (!fn && !ln && !email) { skipped++; continue; }
    if (email && !isEmail(email)) { skipped++; continue; }
    const id = email ? clientIdForEmail(email) : uid('c_'); const cur = get('clients', id);
    const stage = pick(r, 'stage'); const lg = pick(r, 'lang', 'language');
    const body = { ...(cur || { timeline: [{ id: uid('t'), type: 'system', at: new Date().toISOString(), text: 'Imported from CSV' }], createdAt: new Date().toISOString(), unitIds: [], stage: 'lead', source: 'other', lang: 'en' }),
      firstName: fn || cur?.firstName || '', lastName: ln || cur?.lastName || '', email: email || cur?.email || '', phone: pick(r, 'phone', 'tel', 'mobile') || cur?.phone || '', country: pick(r, 'country') || cur?.country || '' };
    body.name = `${body.firstName} ${body.lastName}`.trim();
    if (STAGES.includes(stage) || stage === 'lost') body.stage = stage;
    if (['en', 'ro', 'he', 'ru', 'uk', 'fr', 'it', 'de'].includes(lg)) body.lang = lg;
    const src = pick(r, 'source'); if (src) body.source = src;
    const tags = pick(r, 'tags'); if (tags) body.tags = tags.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    const notes = pick(r, 'notes'); if (notes && !cur) body.timeline.unshift({ id: uid('t'), type: 'note', at: new Date().toISOString(), text: notes });
    await setDoc('clients', id, body); cur ? updated++ : added++;
  }
  (await import('./store.js?v=3.6')).audit(`CSV import: +${added}, ~${updated}, skipped ${skipped}`);
  out.innerHTML = `<p class="ok">${icon('check')}${esc(tc('set.importDone', { a: added, u: updated, s: skipped }))}</p>`;
}
void unitById; void all; void openModal;
