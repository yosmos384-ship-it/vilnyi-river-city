// Mass email: templates with merge fields per language, audience filters, per-recipient preview,
// and INDIVIDUAL sending — one Gmail message per client, addressed only to that client (no CC/BCC lists).
// Sends through the viewer's Gmail connector (artifact `mcp` capability: server "Gmail", tool "send_message").
// Throttled, stoppable, every send logged in db `emails/{campaignId}` (one document per run).
import { unitById } from '../data.js?v=3.7';
import { LANGS, lang as uiLang } from '../i18n.js?v=3.7';
import { tc, tcL } from './i18n-crm.js?v=3.7';
import { S, entries, get, setDoc, settings, dealFinance, clientName, STAGES } from './store.js?v=3.7';
import { esc, icon, eurL, fmtDate, fmtDateTime, uid, openModal, toast, $, $$, isEmail, b64FromBytes } from './util.js?v=3.7';
import { pageHead, flag, empty, fld, stageChip, allStages, tabs } from './ui.js?v=3.7';
import { BUILTIN_TEMPLATES, MERGE_FIELDS } from './templates.js?v=3.7';
import { unitLabelDoc } from './pdf.js?v=3.7';

const GMAIL = 'Gmail', TOOL = 'send_message';
const A = { tab: 'compose', tpl: 'tpl_welcome', stages: [], building: '', langs: [], withUnit: false, q: '', attach: 'none', picked: null, prevIdx: 0, throttle: null, editTpl: null, editLang: 'he' };
let RUN = null;   // active campaign state

// ---------------- templates ----------------
export function templates() {
  const saved = Object.fromEntries(entries('templates').map(t => [t.id, t]));
  const out = { ...BUILTIN_TEMPLATES };
  for (const [id, t] of Object.entries(saved)) out[id] = { ...(BUILTIN_TEMPLATES[id] || {}), ...t, subject: { ...(BUILTIN_TEMPLATES[id]?.subject || {}), ...(t.subject || {}) }, body: { ...(BUILTIN_TEMPLATES[id]?.body || {}), ...(t.body || {}) } };
  return out;
}
const tplName = (id, t) => BUILTIN_TEMPLATES[id] && !t.customName ? tc('tpl.' + id) : (t.name?.[uiLang] || t.name?.en || t.name || id);

// ---------------- merge ----------------
export function mergeVars(c, extra = {}) {
  const l = LANGS.some(x => x.code === c.lang) ? c.lang : 'en';
  const deal = entries('deals').filter(d => d.clientId === c.id && d.status !== 'cancelled').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const f = deal ? dealFinance(deal) : null; const u = deal ? unitById(deal.unitId) : unitById((c.unitIds || [])[0]);
  const st = settings(); const nm = clientName(c);
  return {
    firstName: c.firstName || nm.split(' ')[0] || '', lastName: c.lastName || '', fullName: nm, email: c.email || '',
    unit: u?.id || '', unitLabel: u ? `${u.id} (${unitLabelDoc(u, l)})` : '', price: f ? eurL(f.price, l, 0) : u ? eurL(u.price, l, 0) : '',
    amount: f?.next ? eurL(f.next.open, l) : '', dueDate: f?.next ? fmtDate(f.next.due, l) : '', balance: f ? eurL(f.balance, l) : '', paid: f ? eurL(f.paid, l) : '',
    payRef: deal ? `${deal.unitId}-${(c.lastName || nm.split(' ').pop() || '').toUpperCase()}` : '', resNo: deal?.resNo || (c.resNos || [])[0] || '',
    stage: tcL(l, 'stage.' + (c.stage || 'lead')), projectName: 'VILNYI RIVER CITY', signature: st.signature || st.senderName || '', docType: '', docNumber: '', ...extra,
  };
}
export const merge = (s, v) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (v[k] ?? ''));
export function htmlEmail(text, l) {
  const rtl = l === 'he';
  const paras = esc(text).split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html lang="${l}" dir="${rtl ? 'rtl' : 'ltr'}"><body style="margin:0;background:#f4f1ea;font-family:${rtl ? 'Heebo,Arial' : 'Manrope,Helvetica,Arial'},sans-serif;color:#1c1a15">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6dfd0">
<tr><td style="background:#0e0c09;padding:22px 28px;border-bottom:2px solid #c9a96a" dir="ltr"><span style="font-family:Georgia,serif;font-size:20px;letter-spacing:4px;color:#e6cc92">VILNYI</span><br><span style="font-size:10px;letter-spacing:5px;color:#cbbd9f">RIVER CITY</span></td></tr>
<tr><td style="padding:28px;font-size:15px;text-align:${rtl ? 'right' : 'left'}" dir="${rtl ? 'rtl' : 'ltr'}">${paras}</td></tr>
<tr><td style="padding:14px 28px;background:#faf7f0;font-size:11px;color:#8a8170;text-align:${rtl ? 'right' : 'left'}" dir="${rtl ? 'rtl' : 'ltr'}">VILNYI RIVER CITY · Str. Murelor nr. 1C, Sector 6, București</td></tr>
</table></td></tr></table></body></html>`;
}
function compose(c, tpl, extra) {
  const l = tpl.subject?.[c.lang] ? c.lang : 'en';
  const v = mergeVars(c, extra);
  const body = merge(tpl.body?.[l], v);
  return { lang: l, subject: merge(tpl.subject?.[l], v), body, html: htmlEmail(body, l), missing: MERGE_FIELDS.filter(k => (tpl.body?.[l] + tpl.subject?.[l]).includes('{{' + k + '}}') && !v[k]) };
}

// ---------------- audience ----------------
function audience() {
  const q = A.q.toLowerCase();
  return entries('clients').filter(c => (!A.stages.length || A.stages.includes(c.stage)) && (!A.langs.length || A.langs.includes(c.lang))
    && (!A.building || (c.unitIds || []).some(id => id.startsWith(A.building)) || entries('deals').some(d => d.clientId === c.id && d.unitId.startsWith(A.building)))
    && (!A.withUnit || entries('deals').some(d => d.clientId === c.id && d.status !== 'cancelled'))
    && (!q || [clientName(c), c.email].join(' ').toLowerCase().includes(q))).sort((a, b) => clientName(a).localeCompare(clientName(b)));
}
const eligible = c => isEmail(c.email) && !c.optOut;

// ---------------- sending ----------------
let fileArgs = null;
async function canFileArgs() { if (fileArgs != null) return fileArgs; try { fileArgs = !!(await S.mcp.listTools()).fileArgs; } catch (e) { fileArgs = false; } return fileArgs; }
const FATAL = ['needs_reauth', 'server_not_connected', 'selection_required', 'server_not_found', 'not_in_manifest', 'blocked_by_policy', 'approval_required', 'not_granted', 'capability_disabled', 'capability_removed', 'consent_required', 'user_changed'];
export function mailErrorText(e) { const k = 'mail.err.' + (e?.code || 'unknown'); const s = tc(k); return s === k ? tc('mail.err.unknown') + (e?.message ? ' — ' + e.message : '') : s; }
export function gmailAvailable() { return S.mode === 'local' ? 'demo' : S.mcp ? 'yes' : 'no'; }

// Send exactly one message to exactly one address.
async function sendOne({ to, subject, body, html, pdf }) {
  if (!isEmail(to)) throw { code: 'bad_address' };
  if (S.mode === 'local') { await new Promise(r => setTimeout(r, 250)); return { simulated: true, id: 'demo-' + uid() }; }
  if (!S.mcp) throw { code: 'no_mcp' };
  const input = { to: [to.trim()], subject, body, htmlBody: html };        // never cc / bcc
  if (pdf) {
    if (await canFileArgs()) input.attachments = [{ filename: pdf.filename, mimeType: 'application/pdf', content: { $file: { data: new Blob([pdf.bytes], { type: 'application/pdf' }), name: pdf.filename, type: 'application/pdf' } } }];
    else if (pdf.bytes.length < 600 * 1024) input.attachments = [{ filename: pdf.filename, mimeType: 'application/pdf', content: b64FromBytes(pdf.bytes) }];
    else throw { code: 'attach_too_large' };   // inline base64 grows 4/3 and the call input is capped at 1 MiB
  }
  const res = await S.mcp.callTool(GMAIL, TOOL, input);
  const p = res?.payload; return { id: (p && typeof p === 'object' && (p.id || p.message?.id)) || null };
}
async function pdfForClient(c, kind) {
  if (!kind || kind === 'none') return null;
  const docs = entries('documents').filter(d => d.clientId === c.id && d.type === kind && d.status !== 'void').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!docs[0]) return null;
  const { pdfBytesFor, fileNameFor } = await import('./v-documents.js?v=3.7');
  return { bytes: await pdfBytesFor(docs[0]), filename: fileNameFor(docs[0]), doc: docs[0] };
}

async function runCampaign(list, tplId, onTick) {
  const tpl = templates()[tplId]; const st = settings();
  const id = uid('m_'); const throttle = Math.max(1000, Number(A.throttle ?? st.throttleMs) || 2000);
  RUN = { id, total: list.length, done: 0, sent: 0, failed: 0, skipped: 0, stop: false, log: [], fatal: null, simulated: S.mode === 'local' };
  const doc = () => ({ kind: 'mass', templateId: tplId, subject: tpl.subject?.en || '', filters: { stages: A.stages, building: A.building, langs: A.langs, withUnit: A.withUnit, attach: A.attach }, createdAt: new Date(RUN.startedAt).toISOString(), by: S.me.id || null, total: RUN.total, sent: RUN.sent, failed: RUN.failed, skipped: RUN.skipped, status: RUN.status, simulated: RUN.simulated, log: RUN.log.slice(-1500) });
  RUN.startedAt = Date.now(); RUN.status = 'running';
  await setDoc('emails', id, doc(), `mass email started (${list.length})`);
  for (const c of list) {
    if (RUN.stop) break;
    const t0 = Date.now(); const entry = { clientId: c.id, email: c.email, at: new Date().toISOString() };
    try {
      const pdf = await pdfForClient(c, A.attach);
      const m = compose(c, tpl, pdf ? { docType: tcL(c.lang || 'en', 'dt.' + pdf.doc.type), docNumber: pdf.doc.number } : {});
      if (A.attach !== 'none' && !pdf) entry.note = 'no-attachment';
      const r = await sendOne({ to: c.email, subject: m.subject, body: m.body, html: m.html, pdf });
      entry.status = r.simulated ? 'simulated' : 'sent'; entry.messageId = r.id; entry.subject = m.subject; RUN.sent++;
    } catch (e) {
      entry.status = 'failed'; entry.error = e?.code || 'error'; entry.message = String(e?.message || '').slice(0, 200); RUN.failed++;
      if (FATAL.includes(e?.code) || e?.code === 'no_mcp') { RUN.fatal = e; RUN.stop = true; }
    }
    RUN.log.push(entry); RUN.done++;
    try { await setDoc('emails', id, doc()); } catch (e) { /* log write failed — continue sending */ }
    onTick?.();
    const wait = throttle - (Date.now() - t0); if (RUN.done < list.length && !RUN.stop && wait > 0) await new Promise(r => setTimeout(r, wait));
  }
  RUN.status = RUN.fatal ? 'failed' : RUN.stop ? 'stopped' : 'done';
  await setDoc('emails', id, doc(), `mass email ${RUN.status}: ${RUN.sent}/${RUN.total}`);
  onTick?.();
}

// ---------------- view ----------------
export function render(root) {
  try { const pick = JSON.parse(sessionStorage.getItem('vrc.crm.mailPick') || 'null'); if (pick) { A.picked = new Set(pick); A.tab = 'compose'; sessionStorage.removeItem('vrc.crm.mailPick'); } } catch (e) { /* ignore */ }
  const camp = entries('emails').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  root.innerHTML = `${pageHead(tc('nav.email'), esc(tc('mail.sub')))}
  ${gmailBanner()}
  ${tabs([['compose', tc('mail.compose')], ['templates', tc('mail.templates')], ['history', tc('mail.history'), camp.length]], A.tab)}
  <div class="mail-body"></div>`;
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { A.tab = b.dataset.tab; render(root); });
  const body = $('.mail-body', root);
  if (A.tab === 'templates') return renderTemplates(body, root);
  if (A.tab === 'history') return renderHistory(body, camp);
  renderCompose(body, root);
}
function gmailBanner() {
  const g = gmailAvailable();
  if (g === 'demo') return `<div class="legal info" role="note">${icon('info')}<p>${esc(tc('mail.demo'))}</p></div>`;
  if (g === 'no') return `<div class="legal bad" role="note">${icon('alert')}<p>${esc(tc('mail.noGmail'))}</p></div>`;
  return `<div class="legal" role="note">${icon('shield')}<p>${esc(tc('mail.privacy'))}</p></div>`;
}

function renderCompose(body, root) {
  const tpls = templates(); const aud = audience();
  if (!A.picked) A.picked = new Set(aud.filter(eligible).map(c => c.id));
  const recips = aud.filter(c => A.picked.has(c.id) && eligible(c));
  A.prevIdx = Math.min(A.prevIdx, Math.max(0, recips.length - 1));
  const tpl = tpls[A.tpl] || tpls.tpl_welcome; const cur = recips[A.prevIdx];
  const m = cur ? compose(cur, tpl) : null;
  const st = settings();
  body.innerHTML = `<div class="mail-grid">
  <div class="card">
    <div class="step"><span class="sn">1</span><h2>${esc(tc('mail.s1'))}</h2></div>
    <div class="tpl-pick">${Object.entries(tpls).map(([id, t]) => `<label class="tpl-opt"><input type="radio" name="tpl" value="${esc(id)}" ${id === A.tpl ? 'checked' : ''}><span><b>${esc(tplName(id, t))}</b><small>${esc(t.subject?.[uiLang] || t.subject?.en || '')}</small></span></label>`).join('')}</div>
    <div class="step"><span class="sn">2</span><h2>${esc(tc('mail.s2'))}</h2></div>
    <div class="chips-f" role="group" aria-label="${esc(tc('stage'))}">${allStages().map(s => `<label class="fchip"><input type="checkbox" data-stage="${s}" ${A.stages.includes(s) ? 'checked' : ''}><span>${esc(tc('stage.' + s))}</span></label>`).join('')}</div>
    <div class="chips-f" role="group" aria-label="${esc(tc('language'))}">${LANGS.map(l => `<label class="fchip"><input type="checkbox" data-lang="${l.code}" ${A.langs.includes(l.code) ? 'checked' : ''}><span>${l.flagSvg}${esc(l.short)}</span></label>`).join('')}</div>
    <div class="filters tight"><select name="building" aria-label="${esc(tc('u.building'))}"><option value="">${esc(tc('un.allBuildings'))}</option>${['C3', 'C4'].map(b => `<option ${A.building === b ? 'selected' : ''}>${b}</option>`).join('')}</select>
      <label class="chk"><input type="checkbox" name="withUnit" ${A.withUnit ? 'checked' : ''}><span>${esc(tc('mail.withDeal'))}</span></label>
      <label class="search">${icon('search')}<input type="search" name="aq" value="${esc(A.q)}" placeholder="${esc(tc('cl.search'))}" aria-label="${esc(tc('cl.search'))}"></label></div>
    <div class="recips"><div class="recips-h"><label class="chk"><input type="checkbox" data-allr ${recips.length && recips.length === aud.filter(eligible).length ? 'checked' : ''}><span>${esc(tc('mail.nOf', { n: recips.length, m: aud.length }))}</span></label></div>
      <ul>${aud.map(c => `<li class="${eligible(c) ? '' : 'off'}"><label class="chk"><input type="checkbox" data-pick="${esc(c.id)}" ${A.picked.has(c.id) && eligible(c) ? 'checked' : ''} ${eligible(c) ? '' : 'disabled'}><span>${esc(clientName(c))}</span></label>${flag(c.lang)}<small dir="ltr">${esc(c.email || tc('mail.noEmail'))}</small>${c.optOut ? `<em class="tag warn">${esc(tc('optedOut'))}</em>` : ''}${stageChip(c.stage || 'lead')}</li>`).join('') || `<li class="off">${esc(tc('noMatch'))}</li>`}</ul></div>
    <div class="step"><span class="sn">3</span><h2>${esc(tc('mail.s3'))}</h2></div>
    <div class="filters tight">${fld(tc('mail.attach'), `<select name="attach">${['none', 'reservation', 'proforma', 'receipt', 'quote'].map(k => `<option value="${k}" ${A.attach === k ? 'selected' : ''}>${esc(k === 'none' ? tc('mail.noAttach') : tc('mail.latest', { t: tc('dt.' + k) }))}</option>`).join('')}</select>`)}
      ${fld(tc('mail.throttle'), `<select name="throttle">${[1000, 2000, 3000, 5000, 10000].map(v => `<option value="${v}" ${v === Number(A.throttle ?? st.throttleMs) ? 'selected' : ''}>${v / 1000} s</option>`).join('')}</select>`)}</div>
    <p class="fine">${icon('info')}${esc(tc('mail.attachNote'))}</p>
  </div>
  <div class="card preview">
    <div class="step"><span class="sn">4</span><h2>${esc(tc('mail.s4'))}</h2></div>
    ${cur ? `<div class="pv-nav"><button class="icon-btn" data-pv="-1" aria-label="${esc(tc('prev'))}" ${A.prevIdx ? '' : 'disabled'}>${icon('chevl')}</button><span>${esc(tc('mail.recipientN', { n: A.prevIdx + 1, m: recips.length }))}</span><button class="icon-btn" data-pv="1" aria-label="${esc(tc('next'))}" ${A.prevIdx < recips.length - 1 ? '' : 'disabled'}>${icon('chev')}</button></div>
      <dl class="pv-head"><dt>${esc(tc('mail.to'))}</dt><dd dir="ltr">${esc(clientName(cur))} &lt;${esc(cur.email)}&gt; ${flag(m.lang)}</dd><dt>${esc(tc('mail.subject'))}</dt><dd>${esc(m.subject)}</dd></dl>
      ${m.missing.length ? `<p class="warn-t">${icon('alert')}${esc(tc('mail.missing', { f: m.missing.join(', ') }))}</p>` : ''}
      <iframe class="pv-frame" sandbox="" title="${esc(tc('preview'))}" srcdoc="${esc(m.html)}"></iframe>` : empty(tc('mail.noRecips'))}
    <div class="step"><span class="sn">5</span><h2>${esc(tc('mail.s5'))}</h2></div>
    <div class="send-box">${RUN && RUN.status === 'running' ? progressHtml() : `
      <div class="test-row"><input type="email" name="testTo" dir="ltr" placeholder="${esc(tc('mail.testTo'))}" value="${esc(S.me.email || '')}" aria-label="${esc(tc('mail.testTo'))}"><button class="btn ghost sm" data-act="test" ${cur ? '' : 'disabled'}>${esc(tc('mail.sendTest'))}</button></div>
      <button class="btn primary wide" data-act="send" ${recips.length && gmailAvailable() !== 'no' ? '' : 'disabled'}>${icon('send')}${esc(tc('mail.sendN', { n: recips.length }))}</button>
      <div class="confirm-send" hidden><p>${esc(tc('mail.confirmQ', { n: recips.length }))}</p><div><button class="btn ghost sm" data-act="cancelSend">${esc(tc('cancel'))}</button><button class="btn primary sm" data-act="go">${esc(tc('mail.confirmGo'))}</button></div></div>
      ${RUN ? progressHtml() : ''}`}</div>
  </div></div>`;

  const re = () => renderCompose(body, root);
  body.querySelectorAll('[name=tpl]').forEach(r => r.onchange = () => { A.tpl = r.value; re(); });
  body.querySelectorAll('[data-stage]').forEach(cb => cb.onchange = () => { A.stages = $$('[data-stage]:checked', body).map(x => x.dataset.stage); A.picked = null; re(); });
  body.querySelectorAll('[data-lang]').forEach(cb => cb.onchange = () => { A.langs = $$('[data-lang]:checked', body).map(x => x.dataset.lang); A.picked = null; re(); });
  $('[name=building]', body).onchange = e => { A.building = e.target.value; A.picked = null; re(); };
  $('[name=withUnit]', body).onchange = e => { A.withUnit = e.target.checked; A.picked = null; re(); };
  $('[name=aq]', body).addEventListener('input', e => { A.q = e.target.value; A.picked = null; const p = e.target.selectionStart; re(); const n = $('[name=aq]', body); n.focus(); n.setSelectionRange(p, p); });
  $('[name=attach]', body).onchange = e => { A.attach = e.target.value; };
  $('[name=throttle]', body).onchange = e => { A.throttle = Number(e.target.value); };
  body.querySelectorAll('[data-pick]').forEach(cb => cb.onchange = () => { cb.checked ? A.picked.add(cb.dataset.pick) : A.picked.delete(cb.dataset.pick); re(); });
  $('[data-allr]', body)?.addEventListener('change', e => { A.picked = new Set(e.target.checked ? aud.filter(eligible).map(c => c.id) : []); re(); });
  body.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => { A.prevIdx += Number(b.dataset.pv); re(); });
  $('[data-act=test]', body)?.addEventListener('click', async () => {
    const to = $('[name=testTo]', body).value.trim(); if (!isEmail(to)) { toast(tc('err.email'), 'err'); return; }
    const pdf = await pdfForClient(cur, A.attach); const mm = compose(cur, tpl, pdf ? { docType: tcL(cur.lang || 'en', 'dt.' + pdf.doc.type), docNumber: pdf.doc.number } : {});
    try { const r = await sendOne({ to, subject: '[TEST] ' + mm.subject, body: mm.body, html: mm.html, pdf }); toast(r.simulated ? tc('mail.simulated') : tc('mail.testSent', { to })); }
    catch (e) { toast(mailErrorText(e), 'err', 7000); }
  });
  const sendBtn = $('[data-act=send]', body), conf = $('.confirm-send', body);
  sendBtn?.addEventListener('click', () => { conf.hidden = false; sendBtn.hidden = true; conf.querySelector('[data-act=go]').focus(); });
  $('[data-act=cancelSend]', body)?.addEventListener('click', () => { conf.hidden = true; sendBtn.hidden = false; });
  $('[data-act=go]', body)?.addEventListener('click', () => {
    const list = recips.slice();
    runCampaign(list, A.tpl, () => { const box = $('.send-box', body); if (box && document.body.contains(box)) box.innerHTML = progressHtml(); bindStop(body); });
    const box = $('.send-box', body); box.innerHTML = progressHtml(); bindStop(body);
  });
  bindStop(body);
}
function bindStop(body) { $('[data-act=stop]', body)?.addEventListener('click', () => { if (RUN) RUN.stop = true; }); }
function progressHtml() {
  if (!RUN) return '';
  const p = RUN.total ? RUN.done / RUN.total * 100 : 0; const running = RUN.status === 'running';
  return `<div class="progress" role="status" aria-live="polite"><div class="pbar"><i style="width:${p}%"></i></div>
    <p><b>${RUN.done} / ${RUN.total}</b> · ${esc(tc('mstatus.sent'))} ${RUN.sent} · ${esc(tc('mstatus.failed'))} ${RUN.failed}${RUN.simulated ? ' · ' + esc(tc('mail.simulatedShort')) : ''}</p>
    ${RUN.fatal ? `<p class="bad">${icon('alert')}${esc(mailErrorText(RUN.fatal))}</p>` : ''}
    ${running ? `<button class="btn ghost sm" data-act="stop">${icon('x')}${esc(tc('mail.stop'))}</button>` : `<p class="ok">${esc(tc('mail.runStatus.' + RUN.status))}</p>`}
    <ol class="plog">${RUN.log.slice(-6).reverse().map(l => { const c = get('clients', l.clientId); return `<li class="${l.status}">${esc(clientName(c))} <small dir="ltr">${esc(l.email)}</small> — ${esc(tc('mstatus.' + l.status))}${l.error ? ` (${esc(l.error)})` : ''}</li>`; }).join('')}</ol></div>`;
}

function renderHistory(body, camp) {
  body.innerHTML = camp.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(tc('date'))}</th><th>${esc(tc('mail.template'))}</th><th>${esc(tc('status'))}</th><th class="num">${esc(tc('mstatus.sent'))}</th><th class="num">${esc(tc('mstatus.failed'))}</th><th></th></tr></thead><tbody>
    ${camp.map(e => `<tr><td>${esc(fmtDateTime(e.createdAt))}</td><td>${esc(e.kind === 'single' ? (e.subject || '') : tplName(e.templateId, templates()[e.templateId] || {}))}${e.simulated ? ` <em class="tag">${esc(tc('mail.simulatedShort'))}</em>` : ''}</td><td>${esc(tc('mail.runStatus.' + (e.status || 'done')))}</td><td class="num">${e.sent || 0} / ${e.total || 0}</td><td class="num">${e.failed || 0}</td><td><button class="btn link sm" data-log="${esc(e.id)}">${esc(tc('mail.viewLog'))}</button></td></tr>`).join('')}
  </tbody></table></div>` : empty(tc('mail.noHistory'));
  body.querySelectorAll('[data-log]').forEach(b => b.onclick = () => { const e = get('emails', b.dataset.log); openModal({ title: tc('mail.log'), wide: true, body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(tc('client'))}</th><th>${esc(tc('email'))}</th><th>${esc(tc('status'))}</th><th>${esc(tc('date'))}</th></tr></thead><tbody>${(e.log || []).map(l => `<tr><td>${esc(clientName(get('clients', l.clientId)))}</td><td dir="ltr">${esc(l.email)}</td><td>${esc(tc('mstatus.' + l.status))}${l.error ? ` <small>${esc(l.error)} ${esc(l.message || '')}</small>` : ''}${l.note === 'no-attachment' ? ` <small>${esc(tc('mail.noAttachFound'))}</small>` : ''}</td><td>${esc(fmtDateTime(l.at))}</td></tr>`).join('')}</tbody></table></div>` }); });
}

function renderTemplates(body, root) {
  const tpls = templates(); const id = A.editTpl && tpls[A.editTpl] ? A.editTpl : Object.keys(tpls)[0]; A.editTpl = id; const t = tpls[id]; const L = A.editLang;
  body.innerHTML = `<div class="tpl-grid"><div class="card tpl-list"><ul>${Object.entries(tpls).map(([k, x]) => `<li><button class="${k === id ? 'on' : ''}" data-t="${esc(k)}">${icon('mail')}<span>${esc(tplName(k, x))}</span></button></li>`).join('')}</ul><button class="btn ghost sm wide" data-act="newTpl">${icon('plus')}${esc(tc('mail.newTpl'))}</button></div>
  <div class="card"><div class="fgrid">${fld(tc('name'), `<input name="tname" value="${esc(tplName(id, t))}">`, 'span2')}</div>
    <div class="lang-tabs" role="tablist">${LANGS.map(l => `<button role="tab" aria-selected="${l.code === L}" data-el="${l.code}">${l.flagSvg}<span>${l.short}</span>${t.subject?.[l.code] ? '' : '<i class="miss" title="—"></i>'}</button>`).join('')}</div>
    <div dir="${L === 'he' ? 'rtl' : 'ltr'}">${fld(tc('mail.subject'), `<input name="tsubj" value="${esc(t.subject?.[L] || '')}">`)}${fld(tc('mail.body'), `<textarea name="tbody" rows="12">${esc(t.body?.[L] || '')}</textarea>`)}</div>
    <p class="fine">${esc(tc('mail.fields'))}</p><div class="mf">${MERGE_FIELDS.map(f => `<button type="button" class="mfb" data-mf="${f}" dir="ltr">{{${f}}}</button>`).join('')}</div>
    <div class="row-end">${!BUILTIN_TEMPLATES[id] ? `<button class="btn link danger sm" data-act="delTpl">${icon('trash')}${esc(tc('delete'))}</button>` : ''}<button class="btn primary sm" data-act="saveTpl">${esc(tc('save'))}</button></div></div></div>`;
  let lastField = $('[name=tbody]', body);
  ['tsubj', 'tbody'].forEach(n => $(`[name=${n}]`, body).addEventListener('focus', e => { lastField = e.target; }));
  body.querySelectorAll('[data-mf]').forEach(b => b.onclick = () => { const el = lastField; const s = el.selectionStart ?? el.value.length; el.value = el.value.slice(0, s) + `{{${b.dataset.mf}}}` + el.value.slice(el.selectionEnd ?? s); el.focus(); el.setSelectionRange(s + b.dataset.mf.length + 4, s + b.dataset.mf.length + 4); });
  const collect = () => { const cur = templates()[id]; return { name: $('[name=tname]', body).value, customName: !BUILTIN_TEMPLATES[id] || $('[name=tname]', body).value !== tplName(id, BUILTIN_TEMPLATES[id]), subject: { ...(cur.subject || {}), [L]: $('[name=tsubj]', body).value }, body: { ...(cur.body || {}), [L]: $('[name=tbody]', body).value } }; };
  const saveT = async () => { const x = collect(); await setDoc('templates', id, { name: x.customName ? { [uiLang]: x.name, en: x.name } : undefined, customName: x.customName, subject: x.subject, body: x.body }, `template saved ${id}`); };
  body.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { A.editTpl = b.dataset.t; render(root); });
  body.querySelectorAll('[data-el]').forEach(b => b.onclick = async () => { const x = collect(); const cur = templates()[id]; if (x.subject[L] !== (cur.subject?.[L] || '') || x.body[L] !== (cur.body?.[L] || '')) await saveT(); A.editLang = b.dataset.el; render(root); });
  $('[data-act=saveTpl]', body).onclick = async () => { await saveT(); toast(tc('saved')); };
  $('[data-act=newTpl]', body).onclick = async () => { const nid = uid('tpl_'); await setDoc('templates', nid, { name: { [uiLang]: tc('mail.newTpl'), en: 'New template' }, customName: true, subject: {}, body: {} }); A.editTpl = nid; render(root); };
  $('[data-act=delTpl]', body)?.addEventListener('click', async () => { const { delDoc } = await import('./store.js?v=3.7'); await delDoc('templates', id, `template deleted ${id}`); A.editTpl = null; render(root); });
}

// ---------------- single send (from a document or client) ----------------
export function sendSingle({ clientId, docId }) {
  const c = get('clients', clientId); const d = docId ? get('documents', docId) : null;
  if (!c) return;
  const tpl = templates().tpl_document; const l = c.lang || 'en';
  const m = compose(c, tpl, d ? { docType: tcL(tpl.subject?.[l] ? l : 'en', 'dt.' + d.type), docNumber: d.number } : {});
  openModal({
    title: tc('doc.email'), wide: true,
    body: `${gmailBanner()}<div class="fgrid">${fld(tc('mail.to'), `<input name="to" dir="ltr" value="${esc(c.email || '')}" readonly>`, 'span2')}${fld(tc('mail.subject'), `<input name="subject" value="${esc(m.subject)}">`, 'span2')}${fld(tc('mail.body'), `<textarea name="body" rows="9" dir="${m.lang === 'he' ? 'rtl' : 'ltr'}">${esc(m.body)}</textarea>`, 'span2')}
      ${d ? `<label class="chk span2"><input type="checkbox" name="att" checked><span>${icon('pdf')}${esc(tc('mail.attachDoc', { n: d.number }))}</span></label>` : ''}</div><p class="err" hidden></p>`,
    foot: `<button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn primary" data-send ${gmailAvailable() === 'no' || !isEmail(c.email) ? 'disabled' : ''}>${icon('send')}${esc(tc('mail.send'))}</button>`,
    onMount: (dl, close) => dl.querySelector('[data-send]').onclick = async () => {
      const btn = dl.querySelector('[data-send]'); btn.disabled = true; const err = dl.querySelector('.err');
      const subject = dl.querySelector('[name=subject]').value, text = dl.querySelector('[name=body]').value;
      let pdf = null; if (d && dl.querySelector('[name=att]')?.checked) { const { pdfBytesFor, fileNameFor } = await import('./v-documents.js?v=3.7'); pdf = { bytes: await pdfBytesFor(d), filename: fileNameFor(d) }; }
      const entry = { clientId, email: c.email, at: new Date().toISOString(), subject };
      try { const r = await sendOne({ to: c.email, subject, body: text, html: htmlEmail(text, m.lang), pdf }); entry.status = r.simulated ? 'simulated' : 'sent'; entry.messageId = r.id; }
      catch (e) { entry.status = 'failed'; entry.error = e?.code || 'error'; err.textContent = mailErrorText(e); err.hidden = false; btn.disabled = false; }
      await setDoc('emails', uid('m_'), { kind: 'single', subject, docId: docId || null, createdAt: entry.at, by: S.me.id || null, total: 1, sent: entry.status === 'failed' ? 0 : 1, failed: entry.status === 'failed' ? 1 : 0, status: entry.status === 'failed' ? 'failed' : 'done', simulated: entry.status === 'simulated', log: [entry] });
      if (entry.status !== 'failed') { const { addTimeline } = await import('./store.js?v=3.7'); await addTimeline(clientId, { type: 'email', text: `${subject}${pdf ? ' · ' + pdf.filename : ''}` }); toast(entry.status === 'simulated' ? tc('mail.simulated') : tc('mail.sentTo', { to: c.email })); close(); }
    },
  });
}
void STAGES; void uiLang;
