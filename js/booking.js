// Reserve flow (modal): 1 details → 2 payment plan → 3 deposit instructions → 4 confirmation.
// Persistence order: artifact runtime db → PROJECT.leadsEndpoint (POST) → localStorage + copyable summary.
// Never invents bank data: if PROJECT.bank is empty, a clear "details come from your advisor" notice is shown.
import { PROJECT, TYPES, money, moneyRate } from './data.js?v=3.6';
import { t, pick, planText, lang, onLangChange, LANG_CODES, unitLabelL } from './i18n.js?v=3.6';

// ---------- small utils shared with app.js ----------
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
// Wire every [data-copy] button inside root: copies the text of the element referenced by data-copy (id) or data-copy-text.
export function bindCopy(root) {
  root.querySelectorAll('[data-copy],[data-copy-text]').forEach(btn => {
    if (btn._copyBound) return; btn._copyBound = true;
    btn.addEventListener('click', async () => {
      const txt = btn.dataset.copyText ?? document.getElementById(btn.dataset.copy)?.textContent ?? '';
      const ok = await copyText(txt.trim());
      const lbl = btn.querySelector('.copy-l') || btn;
      const old = lbl.textContent; lbl.textContent = ok ? t('bk.copied') : '—';
      btn.classList.add('is-done'); setTimeout(() => { lbl.textContent = old; btn.classList.remove('is-done'); }, 1600);
    });
  });
}

function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

// Artifact runtime db (resolves null outside claude.ai or when not granted). Never blocks longer than `ms`.
let dbPromise = null;
export function getDb(ms = 5000) {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        if (!window.claude?.use) return null;
        return await Promise.race([window.claude.use('db'), new Promise(r => setTimeout(() => r(null), 11000))]);
      } catch (e) { return null; }
    })();
  }
  return Promise.race([dbPromise, new Promise(r => setTimeout(() => r(null), ms))]);
}

// Reserved unit ids from db + this browser
export async function loadReservations() {
  const ids = new Set(lsGet('vrc.reservations', []).map(r => r.unitId));
  const db = await getDb(8000);
  if (db) {
    try {
      const snap = await db.collection('reservations').get();
      snap.docs.forEach(d => { const v = d.data(); if (v?.unitId && v.status !== 'cancelled') ids.add(v.unitId); });
    } catch (e) { /* read not allowed / offline */ }
  }
  return ids;
}

// ---------- payment plan maths (used by the calculator too) ----------
export function planBreakdown(price, plan) {
  const dep = PROJECT.terms.reservationDeposit;
  const [a, b] = plan.split;
  const r = { price, deposit: dep, signing: price * a / 100, signingAfterDeposit: Math.max(0, price * a / 100 - dep), delivery: price * b / 100 };
  if (plan.mortgage) r.mortgage = price * plan.mortgage / 100;
  if (plan.id === 'zero') r.balloon = price;
  const g = PROJECT.terms.rentGuarantee;
  r.rentYear = price * g.minYield / 100; r.rentMonth = r.rentYear / 12; r.rentTotal = r.rentYear * g.years;
  return r;
}

// ISO codes; names come from Intl.DisplayNames in the current language (no hand-kept translations).
const COUNTRIES = ['IL', 'RO', 'UA', 'MD', 'DE', 'FR', 'IT', 'GB', 'PT', 'CY', 'ES', 'NL', 'BE', 'CH', 'AT', 'PL', 'US', 'CA', 'RU', 'XX'];
const CODES = ['+972', '+40', '+380', '+373', '+351', '+357', '+49', '+44', '+33', '+39', '+34', '+1', '+7', '+48', '+36'];
function countryName(code) {
  if (code === 'XX') return t('bk.otherCountry');
  try { return new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of(code) || code; } catch (e) { return code; }
}

// ---------- modal ----------
let dlg = null; let S = null; let unbindLang = null;

function ensureDialog() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.className = 'modal booking'; dlg.setAttribute('aria-labelledby', 'bk-title');
  document.body.appendChild(dlg);
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  return dlg;
}

function close() {
  if (!dlg?.open) return;
  dlg.classList.add('is-closing');
  setTimeout(() => { dlg.classList.remove('is-closing'); dlg.close(); document.documentElement.classList.remove('modal-open'); S?.returnFocus?.focus?.(); unbindLang?.(); unbindLang = null; }, 180);
}

export function openBooking({ unit, planId = 'standard', onReserved = () => {}, onLead = () => {} }) {
  ensureDialog();
  const saved = lsGet('vrc.contact', {});
  S = {
    unit, step: 1, planId, onReserved, onLead, returnFocus: document.activeElement,
    f: { name: saved.name || '', email: saved.email || '', code: saved.code || '+972', phone: saved.phone || '', country: saved.country || '', prefLang: saved.prefLang || lang, contactBy: saved.contactBy || 'whatsapp', consent: false },
    errors: {}, result: null, sending: false,
  };
  render();
  if (!dlg.open) dlg.showModal();
  document.documentElement.classList.add('modal-open');
  unbindLang = onLangChange(() => render());
  setTimeout(() => dlg.querySelector('input,button.primary')?.focus(), 30);
}

function stepper() {
  const steps = ['bk.step1', 'bk.step2', 'bk.step3', 'bk.step4'];
  return `<ol class="steps" aria-label="${esc(t('bk.title'))}">${steps.map((k, i) => `<li class="${i + 1 < S.step ? 'done' : ''}${i + 1 === S.step ? ' cur' : ''}" ${i + 1 === S.step ? 'aria-current="step"' : ''}><span class="n">${i + 1}</span><span class="l">${esc(t(k))}</span></li>`).join('')}</ol>`;
}

function unitSummaryHtml() {
  const u = S.unit, T = TYPES[u.type];
  return `<div class="bk-unit"><div><div class="bk-unit-l">${esc(unitLabelL(u))}</div><div class="bk-unit-s">${u.rooms === 1 ? t('rooms.1') : t('rooms.n', { n: u.rooms })} · ${T.total.toFixed(2)} m² · ${t('face.' + u.facing)}</div></div><div class="bk-unit-p">${money(u.price)}</div></div>`;
}

function field(id, label, input, err) {
  return `<div class="fld${err ? ' has-err' : ''}"><label for="${id}">${esc(label)}</label>${input}${err ? `<p class="err" id="${id}-err">${esc(err)}</p>` : ''}</div>`;
}

function render() {
  if (!S) return;
  const f = S.f, E = S.errors;
  let body = '';
  if (S.step === 1) {
    body = `<form class="bk-form" novalidate>
      ${field('bk-name', t('bk.name'), `<input id="bk-name" name="name" autocomplete="name" value="${esc(f.name)}" required ${E.name ? 'aria-invalid="true" aria-describedby="bk-name-err"' : ''}>`, E.name)}
      <div class="row2">
      ${field('bk-email', t('bk.email'), `<input id="bk-email" name="email" type="email" inputmode="email" autocomplete="email" dir="ltr" value="${esc(f.email)}" required ${E.email ? 'aria-invalid="true"' : ''}>`, E.email)}
      ${field('bk-phone', t('bk.phone'), `<div class="phone" dir="ltr"><select id="bk-code" name="code" aria-label="${esc(t('bk.code'))}">${CODES.map(c => `<option ${c === f.code ? 'selected' : ''}>${c}</option>`).join('')}</select><input id="bk-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" value="${esc(f.phone)}" required ${E.phone ? 'aria-invalid="true"' : ''}></div>`, E.phone)}
      </div>
      <div class="row2">
      ${field('bk-country', t('bk.country'), `<select id="bk-country" name="country" required><option value="">${esc(t('bk.selectCountry'))}</option>${COUNTRIES.map(c => `<option value="${c}" ${c === f.country ? 'selected' : ''}>${esc(countryName(c))}</option>`).join('')}</select>`, E.country)}
      ${field('bk-lang', t('bk.prefLang'), `<select id="bk-lang" name="prefLang">${LANG_CODES.map(l => `<option value="${l}" ${l === f.prefLang ? 'selected' : ''}>${esc(t('lang.' + l))}</option>`).join('')}</select>`)}
      </div>
      <fieldset class="fld chips-fld"><legend>${esc(t('bk.contactBy'))}</legend><div class="chips">${['whatsapp', 'phone', 'email', 'telegram'].map(c => `<label class="chip"><input type="radio" name="contactBy" value="${c}" ${c === f.contactBy ? 'checked' : ''}><span>${esc(t('bk.c.' + c))}</span></label>`).join('')}</div></fieldset>
      <label class="check${E.consent ? ' has-err' : ''}"><input type="checkbox" name="consent" ${f.consent ? 'checked' : ''}><span>${esc(t('bk.consent'))}</span></label>
      ${E.consent ? `<p class="err">${esc(E.consent)}</p>` : ''}
      <p class="fine">${esc(t('bk.privacy'))}</p>
      <div class="bk-actions"><button type="button" class="btn ghost" data-act="cancel">${esc(t('bk.cancel'))}</button><button type="submit" class="btn primary">${esc(t('bk.next'))}</button></div>
    </form>`;
  } else if (S.step === 2) {
    body = `<form class="bk-form" novalidate><fieldset class="plans"><legend class="h4">${esc(t('bk.choosePlan'))}</legend>
      ${PROJECT.terms.plans.map(p => { const r = planBreakdown(S.unit.price, p); return `<label class="plan-opt"><input type="radio" name="plan" value="${p.id}" ${p.id === S.planId ? 'checked' : ''}>
        <span class="po-body"><span class="po-t">${esc(planText(p))}</span><span class="po-d">${esc(planText(p, 'desc'))}</span>
        <span class="po-n">${p.split[0] ? `<span><em>${esc(t('calc.atSigning'))}</em><b>${money(r.signing)}</b></span>` : `<span><em>${esc(t('calc.balloon'))}</em><b>${money(r.balloon)}</b></span>`}<span><em>${esc(t('calc.onDelivery'))}</em><b>${money(r.delivery)}</b></span>${r.mortgage ? `<span><em>${esc(t('calc.mortgage', { p: p.mortgage }))}</em><b>${money(r.mortgage)}</b></span>` : ''}</span></span></label>`; }).join('')}
      </fieldset>
      <div class="bk-actions"><button type="button" class="btn ghost" data-act="back">${esc(t('bk.back'))}</button><button type="submit" class="btn primary">${esc(t('bk.next'))}</button></div></form>`;
  } else if (S.step === 3) {
    const bank = PROJECT.bank || {}; const hasBank = !!(bank.iban && bank.beneficiary);
    const ref = payRef();
    const rows = hasBank ? ['beneficiary', 'iban', 'bic', 'bank', 'address'].filter(k => bank[k]).map(k => `<div class="kv"><span>${esc(t('bk.bank.' + k))}</span><b id="bk-b-${k}" dir="ltr">${esc(bank[k])}</b><button type="button" class="copy" data-copy="bk-b-${k}"><span class="copy-l">${esc(t('bk.copy'))}</span></button></div>`).join('') : '';
    body = `<div class="bk-dep"><h3 class="h4">${esc(t('bk.depositTitle'))}</h3><p>${esc(t('bk.depositLead', { v: money(PROJECT.terms.reservationDeposit) }))}</p>
      <div class="kv big"><span>${esc(t('bk.amount'))}</span><b id="bk-amt" dir="ltr">${money(PROJECT.terms.reservationDeposit)}</b><button type="button" class="copy" data-copy-text="${PROJECT.terms.reservationDeposit}"><span class="copy-l">${esc(t('bk.copy'))}</span></button></div>
      <div class="kv big"><span>${esc(t('bk.reference'))}</span><b id="bk-ref" dir="ltr">${esc(ref)}</b><button type="button" class="copy" data-copy="bk-ref"><span class="copy-l">${esc(t('bk.copy'))}</span></button></div>
      <p class="fine">${esc(t('bk.referenceNote'))}</p>
      ${hasBank ? `<div class="bank">${rows}</div>` : `<div class="notice" role="note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 10v4M12 16.5v.5" stroke="currentColor" stroke-width="1.6"/></svg><p>${esc(t('bk.bankPending'))}</p></div>`}
      ${PROJECT.payments?.stripePaymentLink ? `<a class="btn gold-outline wide" href="${esc(PROJECT.payments.stripePaymentLink)}" target="_blank" rel="noopener">${esc(t('bk.card'))}</a>` : ''}
      <div class="bk-actions"><button type="button" class="btn ghost" data-act="back">${esc(t('bk.back'))}</button><button type="button" class="btn primary" data-act="confirm" ${S.sending ? 'disabled' : ''}>${esc(S.sending ? t('bk.sending') : t('bk.confirm'))}</button></div></div>`;
  } else {
    const r = S.result; const sum = summaryText();
    const waNum = (PROJECT.contact?.whatsapp || '').replace(/\D/g, '');
    const wa = `https://wa.me/${waNum}?text=${encodeURIComponent(sum)}`;
    const mail = `mailto:${encodeURIComponent(PROJECT.contact?.email || '')}?subject=${encodeURIComponent('VILNYI RIVER CITY — ' + r.resNo)}&body=${encodeURIComponent(sum)}`;
    body = `<div class="bk-done"><div class="seal" aria-hidden="true"><img src="assets/bird.png" alt=""></div>
      <h3 class="h3">${esc(t('bk.doneTitle'))}</h3><p>${esc(t('bk.doneLead', { name: f.name.split(/\s+/)[0] }))}</p>
      <div class="kv big"><span>${esc(t('bk.resNo'))}</span><b id="bk-resno" dir="ltr">${esc(r.resNo)}</b><button type="button" class="copy" data-copy="bk-resno"><span class="copy-l">${esc(t('bk.copy'))}</span></button></div>
      <p class="fine ${r.remote ? 'ok' : ''}">${esc(r.remote ? t('bk.savedRemote') : t('bk.savedLocal'))}</p>
      <h4 class="h5">${esc(t('bk.summary'))}</h4><pre class="summary" id="bk-sum" dir="auto">${esc(sum)}</pre>
      <div class="bk-share"><button type="button" class="btn gold-outline" data-copy="bk-sum"><span class="copy-l">${esc(t('bk.copySummary'))}</span></button>
      <a class="btn ghost" href="${esc(wa)}" target="_blank" rel="noopener">${esc(t('bk.sendWa'))}</a><a class="btn ghost" href="${esc(mail)}">${esc(t('bk.sendMail'))}</a></div>
      <div class="bk-actions"><span></span><button type="button" class="btn primary" data-act="close">${esc(t('bk.close'))}</button></div></div>`;
  }
  dlg.innerHTML = `<div class="modal-card">
    <header class="modal-head"><div><p class="eyebrow">VILNYI RIVER CITY</p><h2 id="bk-title" class="h3">${esc(t('bk.title'))}</h2></div>
    <button type="button" class="icon-btn close" data-act="cancel" aria-label="${esc(t('nav.close'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6"/></svg></button></header>
    ${stepper()}${S.step < 4 ? unitSummaryHtml() : ''}<div class="modal-body">${body}</div></div>`;
  bind();
}

function payRef() {
  const sur = (S.f.name.trim().split(/\s+/).pop() || '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  return `${S.unit.id}-${sur}`;
}

function summaryText() {
  const u = S.unit, T = TYPES[u.type], f = S.f;
  const plan = PROJECT.terms.plans.find(p => p.id === S.planId);

  return [
    `VILNYI RIVER CITY — ${t('bk.title')}`,
    `${t('bk.resNo')}: ${S.result?.resNo || ''}`,
    `${t('bk.unit')}: ${unitLabelL(u)} (${u.id})`,
    `${u.rooms === 1 ? t('rooms.1') : t('rooms.n', { n: u.rooms })} · ${T.total.toFixed(2)} m² · ${t('face.' + u.facing)}`,
    `${t('bk.price')}: ${money(u.price)} (${moneyRate(u.rate)}/m²)`,
    `${t('bk.planChosen')}: ${plan ? planText(plan) : ''}`,
    `${t('calc.deposit')}: ${money(PROJECT.terms.reservationDeposit)} · ${t('bk.reference')}: ${payRef()}`,
    `${t('bk.name')}: ${f.name}`,
    `${t('bk.email')}: ${f.email}`,
    `${t('bk.phone')}: ${f.code} ${f.phone}`,
    `${t('bk.country')}: ${f.country ? countryName(f.country) : ''}`,
    `${t('bk.prefLang')}: ${t('lang.' + f.prefLang)} · ${t('bk.contactBy')} ${t('bk.c.' + f.contactBy)}`,
    new Date(S.result?.createdAt || Date.now()).toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  ].join('\n');
}

function readForm() {
  const form = dlg.querySelector('form'); if (!form) return;
  const fd = new FormData(form);
  if (S.step === 1) {
    for (const k of ['name', 'email', 'code', 'phone', 'country', 'prefLang', 'contactBy']) if (fd.has(k)) S.f[k] = String(fd.get(k)).trim();
    S.f.consent = fd.get('consent') === 'on';
  } else if (S.step === 2) { S.planId = fd.get('plan') || S.planId; }
}

function validate() {
  const f = S.f, E = {};
  if (f.name.split(/\s+/).filter(Boolean).length < 2 || f.name.length < 4) E.name = t('bk.err.name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) E.email = t('bk.err.email');
  if (f.phone.replace(/\D/g, '').length < 6) E.phone = t('bk.err.phone');
  if (!f.country) E.country = t('bk.err.country');
  if (!f.consent) E.consent = t('bk.err.consent');
  S.errors = E; return !Object.keys(E).length;
}

function bind() {
  bindCopy(dlg);
  const form = dlg.querySelector('form');
  form?.addEventListener('submit', async e => {
    e.preventDefault(); readForm();
    if (S.step === 1) {
      if (!validate()) { render(); dlg.querySelector('[aria-invalid="true"], .has-err input')?.focus(); return; }
      lsSet('vrc.contact', { ...S.f, consent: undefined });
      saveRecord('leads', leadDoc('lead')).catch(() => {});
      S.onLead?.(S.f);
    }
    S.step++; render(); dlg.querySelector('.modal-body input, .modal-body button.primary')?.focus();
  });
  form?.addEventListener('change', readForm);
  dlg.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
    const a = b.dataset.act;
    if (a === 'cancel' || a === 'close') close();
    else if (a === 'back') { readForm(); S.step--; render(); }
    else if (a === 'confirm') await confirmReservation();
  }));
}

function leadDoc(kind) {
  const f = S.f;
  return { kind, unitId: S.unit.id, plan: S.planId, name: f.name, email: f.email, phone: `${f.code} ${f.phone}`, country: f.country, prefLang: f.prefLang, contactBy: f.contactBy, siteLang: lang, createdAt: new Date().toISOString(), resNo: S.result?.resNo || null };
}

// db → endpoint → local. Returns true when stored off-device.
async function saveRecord(collection, doc, id) {
  const db = await getDb(5000);
  if (db) {
    try {
      const col = db.collection(collection);
      if (id) await col.doc(id).set(doc); else await col.add(doc);
      return true;
    } catch (e) { /* not granted → next option */ }
  }
  if (PROJECT.leadsEndpoint) {
    try {
      // Flatten nested fields so the email service shows readable lines
      const flat = { _subject: `VILNYI River City — ${collection === 'reservations' ? 'New reservation' : 'New lead'} ${doc.unitId || ''}`.trim(), _template: 'table', collection };
      const walk = (o, pre) => { for (const [k, v] of Object.entries(o || {})) { const key = pre ? pre + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key); else flat[key] = Array.isArray(v) ? v.join(', ') : v; } };
      walk(doc, '');
      if (doc.email) { flat._replyto = doc.email; flat.replyto = doc.email; }
      if (PROJECT.leadsKey) { flat.access_key = PROJECT.leadsKey; flat.subject = flat._subject; flat.from_name = 'VILNYI River City website'; }
      const res = await fetch(PROJECT.leadsEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(flat) });
      if (res.ok) return true;
    } catch (e) { /* offline / blocked */ }
  }
  const key = 'vrc.outbox.' + collection; const arr = lsGet(key, []); arr.push(doc); lsSet(key, arr.slice(-50)); // kept for a later manual send
  return false;
}

async function confirmReservation() {
  if (S.sending) return;
  S.sending = true; render();
  const now = new Date();
  const resNo = `VRC-${S.unit.id.replace(/-/g, '')}-${now.getTime().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
  S.result = { resNo, createdAt: now.toISOString(), remote: false };
  // Public reservation marker (no personal data) + private lead with contact details
  const pub = { resNo, unitId: S.unit.id, status: 'reserved', plan: S.planId, createdAt: S.result.createdAt };
  const r1 = await saveRecord('reservations', pub, resNo);
  const r2 = await saveRecord('leads', leadDoc('reservation'), resNo);
  const mine = lsGet('vrc.reservations', []); mine.push(pub); lsSet('vrc.reservations', mine);
  S.result.remote = r1 && r2;
  S.sending = false; S.step = 4; render();
  S.onReserved?.(S.unit.id, S.result);
  dlg.querySelector('.bk-done h3')?.focus?.();
}
