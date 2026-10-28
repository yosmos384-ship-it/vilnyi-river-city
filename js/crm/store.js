// CRM data layer (v3.15).
// LIVE: Supabase (Postgres, Auth, Realtime). Only signed-in, active users get data. Row level security and the
//       RPCs in supabase/schema.sql decide what each user can read and change; the browser checks are for
//       convenience only.
// DEMO: used only while js/crm/config.js is empty. Same function names, browser storage, flagged in the UI.
//
// Collections (in live mode each is a table of the same name):
//   units        one row per unit that is not 'available' (status, clientId, dealId, note); changed only by RPCs
//   clients, deals, documents, tasks, emails, templates, leads, reservations, settings   id + data (jsonb)
//   counters     document number counters (changed only by next_counter)
//   audit_log    append-only; read by admins on the Users & access page
import { PROJECT, UNITS, unitById, TYPES } from '../data.js?v=3.14';
import { uid, hash, today, clone, addMonths, round2 } from './util.js?v=3.15';
import { tc } from './i18n-crm.js?v=3.15';
import { isConfigured } from './config.js?v=3.15';
import { getClient, loadProfile } from './auth.js?v=3.15';

export const COLS = ['units', 'reservations', 'leads', 'clients', 'deals', 'tasks', 'documents', 'emails', 'templates', 'settings', 'counters'];
export const STAGES = ['lead', 'contacted', 'viewing', 'reserved', 'deposit', 'signed', 'paid60', 'delivered'];
export const STAGE_EXTRA = ['lost'];
export const UNIT_STATUSES = ['available', 'reserved', 'sold', 'blocked'];
export const DOC_TYPES = ['reservation', 'proforma', 'receipt', 'quote', 'credit'];
export const ENTITY_IDS = ['pt', 'cy'];
const WRITER_ROLES = ['admin', 'manager', 'agent'];

export const S = {
  mode: 'init',            // 'local' (demo) | 'live' | 'signedout' | 'noaccess'
  sb: null,
  me: { id: null, name: '', username: '', email: null, role: null, perms: {}, isOwner: false, canEdit: false },
  data: Object.fromEntries(COLS.map(c => [c, new Map()])),
  ready: new Set(),
  // Browser-only features of the old artifact runtime. Not available here: views fall back to plain downloads.
  downloads: null, mcp: null,
};
const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
let raf = 0; const changed = new Set();
function emit(col) { changed.add(col); if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const c = new Set(changed); changed.clear(); listeners.forEach(fn => { try { fn(c); } catch (e) { console.error(e); } }); }); }

// Errors from Supabase become Errors with a short code ('forbidden', '42501', 'unavailable', ...).
function toError(err) {
  const e = new Error(err?.message || 'error');
  e.code = (err?.code === '42501' || err?.status === 403) ? 'forbidden' : (err?.code || 'error');
  return e;
}
const unwrap = res => { if (res.error) throw toError(res.error); return res.data; };
const forbidden = () => Object.assign(new Error('forbidden'), { code: 'forbidden' });

// ---------------- local demo backend (same rules as the SQL, on browser storage) ----------------
const LKEY = 'vrc.crm.localdb.v2';
let LOCAL = {};
function lsRead() { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (e) { return {}; } }
function lsWrite() { try { localStorage.setItem(LKEY, JSON.stringify(LOCAL)); } catch (e) { /* quota or blocked */ } }
const bucket = col => (LOCAL[col] = LOCAL[col] || {});
const localBackend = {
  async fetch(col) { return Object.entries(bucket(col)).map(([id, v]) => [id, clone(v)]); },
  async put(col, id, body) { bucket(col)[id] = clone(body); lsWrite(); },
  async del(col, id) { delete bucket(col)[id]; lsWrite(); },
  async audit(rows) { LOCAL.audit = [...(LOCAL.audit || []), ...rows.map(r => ({ id: uid('a'), created_at: new Date().toISOString(), ...r }))].slice(-600); lsWrite(); },
  async auditList(f) {
    return (LOCAL.audit || []).filter(r => (!f.userId || r.user_id === f.userId) && (!f.action || r.action.toLowerCase().includes(f.action.toLowerCase()))
      && (!f.from || r.created_at >= f.from) && (!f.to || r.created_at < f.to)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, f.limit || 300);
  },
  async rpc(name, a) {
    if (name === 'set_unit_status') {
      const cur = bucket('units')[a.p_unit_id] || { status: 'available', clientId: null, dealId: null, note: '' };
      const holderOk = ['reserved', 'sold'].includes(cur.status) && ['reserved', 'sold', 'available'].includes(a.p_status) && a.p_client_id && a.p_client_id === cur.clientId;
      const conflict = cur.status !== 'available' && !holderOk;
      const free = a.p_status === 'available';
      bucket('units')[a.p_unit_id] = { ...cur, status: a.p_status, clientId: free ? null : (a.p_client_id || null), dealId: free ? null : (a.p_deal_id || null), updatedAt: new Date().toISOString() };
      lsWrite();
      return { ok: true, status: a.p_status, override: conflict };    // demo user is the admin, so an override is allowed
    }
    if (name === 'set_unit_note') { const cur = bucket('units')[a.p_unit_id] || { status: 'available', note: '' }; bucket('units')[a.p_unit_id] = { ...cur, note: a.p_note || '' }; lsWrite(); return { ok: true }; }
    if (name === 'next_counter') {
      const start = Math.max(a.p_start || 1, 1); const cur = bucket('counters')[a.p_key]?.value;
      const n = cur === undefined ? start : Math.max(cur + 1, start);
      bucket('counters')[a.p_key] = { value: n }; lsWrite(); return n;
    }
    throw new Error('not available in demo: ' + name);
  },
};

// ---------------- live Supabase backend ----------------
function liveBackend(sb) {
  return {
    async fetch(col) {
      if (col === 'units') return unwrap(await sb.from('units').select('id,status,client_id,deal_id,note,updated_at')).map(r => [r.id, { status: r.status, clientId: r.client_id, dealId: r.deal_id, note: r.note, updatedAt: r.updated_at }]);
      if (col === 'counters') return unwrap(await sb.from('counters').select('key,value')).map(r => [r.key, { value: r.value }]);
      return unwrap(await sb.from(col).select('id,data')).map(r => [r.id, r.data || {}]);
    },
    async put(col, id, body) { unwrap(await sb.from(col).upsert({ id, data: body })); },
    async del(col, id) {
      const rows = unwrap(await sb.from(col).delete().eq('id', id).select('id'));
      if (!rows.length) throw forbidden();                         // RLS hid the row or refused the delete
    },
    async audit(rows) { unwrap(await sb.from('audit_log').insert(rows)); },
    async auditList(f) {
      let q = sb.from('audit_log').select('id,user_id,action,entity,entity_id,before,after,created_at').order('created_at', { ascending: false }).limit(f.limit || 300);
      if (f.userId) q = q.eq('user_id', f.userId);
      if (f.action) q = q.ilike('action', '%' + f.action.replace(/[%_\\]/g, '\\$&') + '%');
      if (f.from) q = q.gte('created_at', f.from);
      if (f.to) q = q.lt('created_at', f.to);
      return unwrap(await q);
    },
    async rpc(name, args) { return unwrap(await sb.rpc(name, args)); },
  };
}

let B = localBackend;

// ---------------- boot, session, realtime ----------------
function setMe(p) {
  S.me = { id: p.id || null, name: p.full_name || p.username || '', username: p.username || '', email: null, role: p.role || null, perms: p.permissions || {}, isOwner: p.role === 'admin', canEdit: WRITER_ROLES.includes(p.role) };
}

// Returns 'local' | 'signedout' | 'live' | 'noaccess'. Throws on a connection problem (the app shows a retry screen).
export async function boot() {
  if (!isConfigured()) {
    S.mode = 'local'; B = localBackend; LOCAL = lsRead();
    setMe({ id: 'local-demo', full_name: 'Demo admin', username: 'demo', role: 'admin', permissions: {} });
    window.addEventListener('storage', e => { if (e.key === LKEY) { LOCAL = lsRead(); loadAll(); } });
    await loadAll();
    importLocalSiteOutbox();
    return S.mode;
  }
  S.sb = await getClient(); B = liveBackend(S.sb);
  const { data: { session } } = await S.sb.auth.getSession();
  if (!session) { S.mode = 'signedout'; return S.mode; }
  return enterLive();
}

// Called after sign-in (and by boot when a session exists).
export async function enterLive() {
  const profile = await loadProfile(S.sb);
  if (!profile || !profile.active) { S.mode = 'noaccess'; setMe(profile || {}); return S.mode; }
  setMe(profile); S.mode = 'live';
  await loadAll(); subscribe();
  return S.mode;
}

async function refresh(col) {
  const rows = await B.fetch(col);
  S.data[col] = new Map(rows); S.ready.add(col); emit(col);
}
export async function loadAll() {
  await Promise.all(COLS.map(c => refresh(c).catch(e => { console.warn('[crm] load', c, e); S.ready.add(c); emit(c); })));
}

let channel = null;
function subscribe() {
  if (channel || !S.sb) return;
  const timers = {};
  channel = S.sb.channel('crm-live');
  COLS.forEach(col => channel.on('postgres_changes', { event: '*', schema: 'public', table: col }, () => {
    clearTimeout(timers[col]); timers[col] = setTimeout(() => refresh(col).catch(() => {}), 200);
  }));
  channel.subscribe();
}

// Who may use what. Local demo: everything. Live: admin, or the permission toggle for writers.
export function can(perm) {
  if (S.mode !== 'live') return true;
  return S.me.isOwner || (S.me.canEdit && S.me.perms?.[perm] === true);
}
function assertCanWrite() { if (S.mode === 'live' && !S.me.canEdit) throw forbidden(); }

// In local demo mode, pick up what the public site stored in this browser (booking.js local fallback).
function importLocalSiteOutbox() {
  try {
    const leads = JSON.parse(localStorage.getItem('vrc.outbox.leads') || '[]');
    const res = JSON.parse(localStorage.getItem('vrc.reservations') || '[]');
    let n = 0;
    leads.forEach(l => { const id = 'site-' + hash(JSON.stringify(l)); if (!bucket('leads')[id]) { bucket('leads')[id] = l; n++; } });
    res.forEach(r => { if (r.resNo && !bucket('reservations')[r.resNo]) { bucket('reservations')[r.resNo] = r; n++; } });
    if (n) { lsWrite(); refresh('leads'); refresh('reservations'); }
  } catch (e) { /* nothing to import */ }
}

// ---------------- reads ----------------
export const get = (col, id) => S.data[col]?.get(id);
export const all = (col) => [...(S.data[col]?.values() || [])];
export const entries = (col) => [...(S.data[col]?.entries() || [])].map(([id, v]) => ({ id, ...v }));

async function retryOnce(fn) {
  try { return await fn(); }
  catch (e) {
    if (e?.code === 'unavailable') { await new Promise(r => setTimeout(r, 400 + Math.random() * 600)); return fn(); }
    throw e;
  }
}

// ---------------- writes ----------------
export async function setDoc(col, id, data, auditText) {
  assertCanWrite();
  if (col === 'units') { await unitPatch(id, data); if (auditText) audit(auditText, { col, id }); return id; }
  const body = { ...data, updatedAt: new Date().toISOString(), updatedBy: S.me.id || null };
  S.data[col].set(id, body); emit(col);                               // optimistic
  try { await retryOnce(() => B.put(col, id, body)); }
  catch (e) { refresh(col).catch(() => {}); throw e; }
  if (auditText) audit(auditText, { col, id });
  return id;
}
export async function patchDoc(col, id, patch, auditText) {
  const cur = get(col, id) || {};
  return setDoc(col, id, { ...cur, ...patch }, auditText);
}
export async function delDoc(col, id, auditText) {
  assertCanWrite();
  S.data[col].delete(id); emit(col);
  try { await retryOnce(() => B.del(col, id)); }
  catch (e) { refresh(col).catch(() => {}); throw e; }
  if (auditText) audit(auditText, { col, id });
}

// Audit: rows are written by the app as the signed-in user. The database refuses any edit or delete of them.
const auditQueue = []; let auditBusy = false;
export function audit(text, ref = {}) {
  if (!S.me.id) return;
  auditQueue.push({ user_id: S.mode === 'live' ? S.me.id : null, action: String(text).slice(0, 300), entity: ref.col || null, entity_id: ref.id != null ? String(ref.id) : null });
  flushAudit();
}
async function flushAudit() {
  if (auditBusy || !auditQueue.length) return;
  auditBusy = true;
  const batch = auditQueue.splice(0, auditQueue.length);
  try { await retryOnce(() => B.audit(batch)); }
  catch (e) { console.warn('[crm] audit not saved, retrying', e); auditQueue.unshift(...batch); auditBusy = false; setTimeout(flushAudit, 5000); return; }
  auditBusy = false;
  if (auditQueue.length) flushAudit();
}
export const queryAudit = (filters = {}) => B.auditList(filters);

// Document numbering: atomic in the database (next_counter), so two users never get the same number.
export async function nextNumber(entity, type) {
  assertCanWrite();
  const st = settings(); const ser = st.series?.[type] || {}; const year = new Date().getFullYear();
  const key = `${entity}.${type}.${ser.yearly === false ? 'all' : year}`;
  const n = await retryOnce(() => B.rpc('next_counter', { p_key: key, p_start: Number(ser.start || 1) }));
  S.data.counters.set(key, { value: n }); emit('counters');
  const prefix = (st.entities?.[entity]?.prefix || entity.toUpperCase()) + '-' + (ser.prefix || type.slice(0, 2).toUpperCase());
  return { number: `${prefix}-${ser.yearly === false ? '' : year + '-'}${String(n).padStart(ser.pad || 4, '0')}`, seq: n, key };
}
export function countersView() { return Object.fromEntries([...S.data.counters].map(([k, v]) => [k, v.value])); }

// ---------------- settings ----------------
export const DEFAULT_SETTINGS = {
  entities: {
    pt: { prefix: 'PT', name: 'VILNYI, UNIPESSOAL LDA', country: 'Portugal', city: 'Lisboa', address: '', regNo: '', taxId: '', vatNo: '', email: '', phone: '', iban: '', bic: '', bank: '', beneficiary: '', footer: '' },
    cy: { prefix: 'CY', name: 'VILNYI LTD', country: 'Cyprus', city: '', address: '', regNo: 'HE 497395', taxId: '', vatNo: '', email: '', phone: '', iban: '', bic: '', bank: '', beneficiary: '', footer: '' },
  },
  defaultEntity: 'cy',
  series: {
    reservation: { prefix: 'RC', pad: 4, yearly: true },
    proforma: { prefix: 'PF', pad: 4, yearly: true },
    receipt: { prefix: 'RE', pad: 4, yearly: true },
    quote: { prefix: 'OF', pad: 4, yearly: true },
    credit: { prefix: 'CN', pad: 4, yearly: true },
  },
  vatRate: 0, vatNote: '',
  signature: 'VILNYI RIVER CITY\n',
  senderName: 'VILNYI RIVER CITY',
  throttleMs: 2000,
  paymentTermsDays: 7,
};
export function settings() {
  const s = get('settings', 'main') || {};
  const d = clone(DEFAULT_SETTINGS);
  return { ...d, ...s, entities: { pt: { ...d.entities.pt, ...(s.entities?.pt || {}) }, cy: { ...d.entities.cy, ...(s.entities?.cy || {}) } }, series: Object.fromEntries(DOC_TYPES.map(t => [t, { ...d.series[t], ...(s.series?.[t] || {}) }])) };
}

// ---------------- derived: units ----------------
// Effective status: an explicit CRM units row wins; otherwise an active web reservation makes it 'reserved'.
export function unitState(id) {
  const u = get('units', id);
  if (u?.status) return { status: u.status, clientId: u.clientId || null, dealId: u.dealId || null, source: 'crm', updatedAt: u.updatedAt };
  const r = all('reservations').find(r => r.unitId === id && r.status !== 'cancelled');
  if (r) return { status: 'reserved', clientId: null, dealId: null, source: 'web', resNo: r.resNo, updatedAt: r.createdAt };
  return { status: 'available', clientId: null, dealId: null, source: 'default' };
}
export function unitCounts() {
  const c = { available: 0, reserved: 0, sold: 0, blocked: 0 };
  for (const u of UNITS) c[unitState(u.id).status] = (c[unitState(u.id).status] || 0) + 1;
  return c;
}

// Change a unit. Live: the set_unit_status RPC locks the unit row; a taken unit can only be changed by the
// client holding it (an admin may override). A refusal throws an Error with code 'unit_taken'.
export async function setUnitStatus(unitId, status, extra = {}) {
  assertCanWrite();
  if (!UNIT_STATUSES.includes(status)) throw new Error('invalid status: ' + status);
  const cur = get('units', unitId) || {};
  const clientId = extra.clientId !== undefined ? (extra.clientId || null) : (cur.clientId || null);
  const dealId = extra.dealId !== undefined ? (extra.dealId || null) : (cur.dealId || null);
  const free = status === 'available';
  const next = { status, clientId: free ? null : clientId, dealId: free ? null : dealId };
  if ((cur.status || 'available') === next.status && (cur.clientId || null) === next.clientId && (cur.dealId || null) === next.dealId) return { ok: true, noop: true };
  let res;
  try { res = await retryOnce(() => B.rpc('set_unit_status', { p_unit_id: unitId, p_status: status, p_client_id: next.clientId, p_deal_id: next.dealId })); }
  catch (e) { refresh('units').catch(() => {}); throw e; }
  if (!res?.ok) {
    refresh('units').catch(() => {});
    const e = new Error(tc('err.unitTaken', { s: tc('st.' + (res?.status || 'reserved')) })); e.code = 'unit_taken'; e.unitId = unitId; throw e;
  }
  S.data.units.set(unitId, { ...next, note: cur.note || '', updatedAt: new Date().toISOString() }); emit('units');
  if (S.mode !== 'live') audit(`unit ${unitId} → ${status}`, { col: 'units', id: unitId });   // live: the database writes this row
  return res;
}
async function setUnitNote(unitId, note) {
  try { await retryOnce(() => B.rpc('set_unit_note', { p_unit_id: unitId, p_note: note })); }
  catch (e) { refresh('units').catch(() => {}); throw e; }
  const cur = get('units', unitId) || {};
  S.data.units.set(unitId, { ...cur, note, updatedAt: new Date().toISOString() }); emit('units');
}
// setDoc('units', ...) from older views: status/client/deal change through the RPC, note through its own RPC.
async function unitPatch(id, data) {
  const cur = get('units', id) || {};
  const wantStatus = data.status ?? cur.status ?? 'available';
  const wantClient = data.clientId !== undefined ? (data.clientId || null) : (cur.clientId || null);
  const wantDeal = data.dealId !== undefined ? (data.dealId || null) : (cur.dealId || null);
  if (wantStatus !== (cur.status || 'available') || wantClient !== (cur.clientId || null) || wantDeal !== (cur.dealId || null)) {
    await setUnitStatus(id, wantStatus, { clientId: wantClient, dealId: wantDeal });
  }
  if (data.note !== undefined && data.note !== (cur.note || '')) await setUnitNote(id, data.note);
}

// Non-admin asks an admin to change a taken unit. The admin decides on the Users & access page.
export async function requestUnitOverride(unitId, status, clientId, dealId, reason) {
  assertCanWrite();
  return B.rpc('request_unit_change', { p_unit_id: unitId, p_status: status, p_client_id: clientId || null, p_deal_id: dealId || null, p_reason: reason });
}

// ---------------- derived: deals ----------------
export function planOf(id) { return PROJECT.terms.plans.find(p => p.id === id) || PROJECT.terms.plans[0]; }
// Default schedule from PROJECT.terms: deposit at reservation, rest of the signing share at contract, balance on delivery.
export function buildSchedule(price, planId, start = today(), opts = {}) {
  const plan = planOf(planId); const dep = PROJECT.terms.reservationDeposit;
  const [a, b] = plan.split; const sch = [];
  const signDate = opts.signDate || addMonths(start, 1);
  const delivery = opts.deliveryDate || addMonths(start, PROJECT.deliveryMonths || 32);
  sch.push({ id: uid('i'), kind: 'deposit', due: start, amount: Math.min(dep, price) });
  if (a > 0) {
    const signing = Math.max(0, round2(price * a / 100 - dep));
    const n = Math.max(1, Number(opts.split || 1));
    for (let i = 0; i < n; i++) sch.push({ id: uid('i'), kind: 'signing', part: n > 1 ? `${i + 1}/${n}` : '', due: addMonths(signDate, i), amount: round2(i < n - 1 ? Math.floor(signing / n) : signing - Math.floor(signing / n) * (n - 1)) });
    sch.push({ id: uid('i'), kind: plan.mortgage ? 'deliveryMortgage' : 'delivery', due: delivery, amount: round2(price * b / 100) });
  } else {
    sch.push({ id: uid('i'), kind: 'balloon', due: signDate, amount: round2(price - Math.min(dep, price)) });
  }
  return sch;
}
export function dealFinance(d) {
  const price = round2((d.price || 0) - (d.discount || 0));
  const paid = round2((d.payments || []).reduce((s, p) => s + (Number(p.amount) || 0) * (p.kind === 'refund' ? -1 : 1), 0));
  const sched = [...(d.schedule || [])].sort((a, b) => String(a.due).localeCompare(String(b.due)));
  // allocate paid amount to instalments in due order
  let left = paid; const rows = sched.map(s => { const got = Math.max(0, Math.min(s.amount, left)); left -= got; return { ...s, paid: round2(got), open: round2(s.amount - got) }; });
  const next = rows.find(r => r.open > 0.009) || null;
  const overdue = rows.filter(r => r.open > 0.009 && r.due < today());
  return { price, paid, balance: round2(price - paid), pctPaid: price ? paid / price * 100 : 0, rows, next, overdue, overdueAmount: round2(overdue.reduce((s, r) => s + r.open, 0)) };
}
export const activeDeals = () => entries('deals').filter(d => d.status !== 'cancelled');

// ---------------- derived: clients ----------------
export function clientName(c) { return c ? (c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || '—') : '—'; }
export function splitName(full) { const p = String(full || '').trim().split(/\s+/); return { firstName: p[0] || '', lastName: p.slice(1).join(' ') }; }
export const clientIdForEmail = (email) => 'c_' + hash(String(email || '').trim().toLowerCase());

// Web leads that have no CRM client yet → create clients (deterministic id from email so it is idempotent).
export async function syncLeads() {
  let n = 0;
  for (const [id, l] of S.data.leads) {
    if (!l?.email) continue;
    const cid = clientIdForEmail(l.email);
    const cur = get('clients', cid);
    if (cur && (cur.leadIds || []).includes(id)) continue;
    const nm = splitName(l.name);
    const ev = { id: uid('t'), type: l.kind === 'reservation' ? 'reservation' : 'web', at: l.createdAt || new Date().toISOString(), text: l.kind === 'reservation' ? `Web reservation ${l.resNo || ''} · ${l.unitId || ''} · plan ${l.plan || ''}` : `Web lead · ${l.unitId || ''} · ${l.contactBy || ''}` };
    const base = cur || { ...nm, name: l.name, email: l.email, phone: l.phone || '', country: l.country || '', lang: l.prefLang || l.siteLang || 'he', contactBy: l.contactBy || '', stage: 'lead', source: 'website', tags: [], timeline: [], createdAt: l.createdAt || new Date().toISOString(), unitIds: [] };
    const body = { ...base, leadIds: [...(base.leadIds || []), id], timeline: [ev, ...(base.timeline || [])].slice(0, 400) };
    if (l.unitId && !(body.unitIds || []).includes(l.unitId)) body.unitIds = [...(body.unitIds || []), l.unitId];
    if (l.kind === 'reservation' && STAGES.indexOf(body.stage) < STAGES.indexOf('reserved')) body.stage = 'reserved';
    if (l.resNo) body.resNos = [...new Set([...(body.resNos || []), l.resNo])];
    await setDoc('clients', cid, body, cur ? null : `client created from web lead ${l.email}`);
    n++;
  }
  return n;
}

export async function addTimeline(clientId, ev) {
  const c = get('clients', clientId); if (!c) return;
  const e = { id: uid('t'), at: new Date().toISOString(), by: S.me.id || null, ...ev };
  await setDoc('clients', clientId, { ...c, timeline: [e, ...(c.timeline || [])].slice(0, 400), lastActivity: e.at });
}
export async function setStage(clientId, stage) {
  const c = get('clients', clientId); if (!c || c.stage === stage) return;
  const e = { id: uid('t'), at: new Date().toISOString(), by: S.me.id || null, type: 'stage', from: c.stage, to: stage };
  await setDoc('clients', clientId, { ...c, stage, timeline: [e, ...(c.timeline || [])].slice(0, 400), lastActivity: e.at }, `client ${clientName(c)} stage ${c.stage} → ${stage}`);
}

// ---------------- admin (Users & access) ----------------
export async function listProfiles() {
  if (S.mode !== 'live') return [];
  return unwrap(await S.sb.from('profiles').select('id, username, full_name, role, permissions, active, created_at').order('username'));
}
export async function listUnitRequests(status = 'pending') {
  if (S.mode !== 'live') return [];
  let q = S.sb.from('unit_requests').select('*').order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  return unwrap(await q);
}
export async function resolveUnitRequest(id, approve, note = '') {
  return unwrap(await S.sb.rpc('resolve_unit_request', { p_request_id: id, p_approve: !!approve, p_note: note || null }));
}
// Create / update / (de)activate users and issue reset links. Runs in the admin-users Edge Function.
export async function adminAction(body) {
  const { data, error } = await S.sb.functions.invoke('admin-users', { body });
  let code = null;
  if (error) { try { code = (await error.context.json()).error; } catch (e) { code = 'error'; } }
  if (code || data?.error) { const e = new Error(code || data.error); e.code = code || data.error; throw e; }
  return data;
}

export const typeOfUnit = (u) => TYPES[u.type];
export { unitById, UNITS };
