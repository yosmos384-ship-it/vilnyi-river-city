// CRM data layer.
// Runtime: claude.ai artifact capabilities (db, user, downloads, mcp) resolved via claude.use(); each may be null.
// Outside the artifact runtime (no window.claude) the CRM runs in LOCAL DEMO MODE on a localStorage-backed
// store with the same Firestore-like surface, clearly flagged in the UI.
//
// Collections (all shared db, CRM ones should be restricted to admin by db rules — see report):
//   units/{unitId}           {status, clientId, dealId, updatedAt, by}      ← the public site reads this
//   reservations/{resNo}     written by the public site (booking.js); CRM may add/cancel
//   leads/{id}               written by the public site (booking.js)
//   clients/{id}             CRM contacts; timeline[] embedded (bounded)
//   deals/{id}               unit sale: price, plan, schedule[], payments[] embedded
//   tasks/{id}               to-dos / reminders (recurring)
//   documents/{id}           issued pro-forma / receipt / reservation / quote / credit records (+ snapshot to re-render PDF)
//   emails/{campaignId}      one doc per mass-email run with a per-recipient log[]
//   templates/{id}           email templates, subject/body per language
//   settings/main            entities, numbering, signature, defaults
//   settings/counters        document number counters (lease-protected)
//   audit/{YYYY-MM-DD}       daily audit log (entries[])
import { PROJECT, UNITS, unitById, TYPES } from '../data.js?v=3.6';
import { uid, hash, today, clone, addMonths, round2 } from './util.js?v=3.6';

export const COLS = ['units', 'reservations', 'leads', 'clients', 'deals', 'tasks', 'documents', 'emails', 'templates', 'settings', 'audit'];
export const STAGES = ['lead', 'contacted', 'viewing', 'reserved', 'deposit', 'signed', 'paid60', 'delivered'];
export const STAGE_EXTRA = ['lost'];
export const UNIT_STATUSES = ['available', 'reserved', 'sold', 'blocked'];
export const DOC_TYPES = ['reservation', 'proforma', 'receipt', 'quote', 'credit'];
export const ENTITY_IDS = ['pt', 'cy'];

export const S = {
  mode: 'init',            // 'artifact' | 'local' | 'locked' | 'nodb'
  db: null, user: null, downloads: null, mcp: null,
  me: { id: null, name: '', email: null, isOwner: false, canEdit: false },
  data: Object.fromEntries(COLS.map(c => [c, new Map()])),
  ready: new Set(),
  writable: true,
};
const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
let raf = 0; const changed = new Set();
function emit(col) { changed.add(col); if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const c = new Set(changed); changed.clear(); listeners.forEach(fn => { try { fn(c); } catch (e) { console.error(e); } }); }); }

// ---------------- local demo store (Firestore-like subset) ----------------
const LKEY = 'vrc.crm.localdb.v1';
function lsRead() { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (e) { return {}; } }
function lsWrite(o) { try { localStorage.setItem(LKEY, JSON.stringify(o)); } catch (e) { /* quota / blocked */ } }
function makeLocalDb() {
  let store = lsRead();
  const subs = new Set();
  const snapDoc = (path) => { const d = store[path]; return { id: path.split('/').pop(), exists: !!d, data: () => d ? clone(d) : undefined, metadata: { fromCache: false, hasPendingWrites: false } }; };
  const notify = () => subs.forEach(s => s());
  const write = () => { lsWrite(store); notify(); };
  window.addEventListener('storage', e => { if (e.key === LKEY) { store = lsRead(); notify(); } });
  const docRef = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => snapDoc(path),
    set: async (d) => { store[path] = clone(d); write(); },
    update: async (d) => { if (!store[path]) throw { code: 'invalid_argument', message: 'missing' }; store[path] = deepMerge(store[path], clone(d)); write(); },
    delete: async () => { delete store[path]; write(); },
    acquire: async () => ({ acquired: true, version: 1 }),
    onSnapshot: (next) => { const f = () => next(snapDoc(path)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
    collection: (p) => colRef(path + '/' + p),
  });
  const colRef = (path) => {
    const q = { filters: [], order: null, lim: 0 };
    const run = (qq) => {
      const pre = path + '/'; let docs = Object.keys(store).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).sort().map(snapDoc);
      for (const [f, op, v] of qq.filters) docs = docs.filter(d => { const x = d.data()[f]; return op === '==' ? x === v : op === '!=' ? x !== v : op === '<' ? x < v : op === '>' ? x > v : op === '<=' ? x <= v : op === '>=' ? x >= v : op === 'in' ? v.includes(x) : true; });
      if (qq.order) { const [f, dir] = qq.order; docs.sort((a, b) => { const x = a.data()[f], y = b.data()[f]; return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1); }); }
      if (qq.lim) docs = docs.slice(0, qq.lim);
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
    };
    const mk = (qq) => ({
      path,
      where: (f, op, v) => mk({ ...qq, filters: [...qq.filters, [f, op, v]] }),
      orderBy: (f, dir = 'asc') => mk({ ...qq, order: [f, dir] }),
      limit: (n) => mk({ ...qq, lim: n }),
      get: async () => run(qq),
      onSnapshot: (next) => { const f = () => next(run(qq)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
      doc: (id) => docRef(path + '/' + (id || uid('l'))),
      add: async (d) => { const r = docRef(path + '/' + uid('l')); await r.set(d); return r; },
    });
    return mk(q);
  };
  return { doc: docRef, collection: colRef, _reset: () => { store = {}; write(); } };
}
function deepMerge(a, b) {
  const o = { ...a };
  for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a?.[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) ? deepMerge(a[k], b[k]) : b[k];
  return o;
}

// ---------------- boot ----------------
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
export async function boot() {
  if (!window.claude?.use) {
    S.mode = 'local';
    S.db = makeLocalDb();
    S.me = { id: 'local-demo', name: 'Demo admin', email: null, isOwner: true, canEdit: true };
    S.downloads = null; S.mcp = null;
  } else {
    const [user, db] = await Promise.all([withTimeout(window.claude.use('user'), 12000), withTimeout(window.claude.use('db'), 12000)]);
    S.user = user;
    const me = user ? await user.me() : null;
    const isOwner = !!me?.isOwner, canEdit = !!me?.canEdit;
    S.me = { id: me?.id || null, name: me?.name || '', email: me?.email || null, avatarUrl: me?.avatarUrl, isOwner, canEdit };
    if (!user || !(isOwner || canEdit)) { S.mode = 'locked'; return S.mode; }
    if (!db) { S.mode = 'nodb'; return S.mode; }
    S.db = db; S.mode = 'artifact';
    // Optional capabilities resolve in the background — features light up when they arrive.
    window.claude.use('downloads').then(d => { S.downloads = d; emit('caps'); }).catch(() => {});
    window.claude.use('mcp').then(m => { S.mcp = m; emit('caps'); }).catch(() => {});
  }
  subscribeAll();
  if (S.mode === 'local') importLocalSiteOutbox();
  return S.mode;
}

const unsubs = [];
function subscribeAll() {
  for (const col of COLS) {
    let q = S.db.collection(col);
    if (col === 'audit') q = q.orderBy('day', 'desc').limit(31);
    unsubs.push(q.onSnapshot(snap => {
      const m = new Map(); snap.docs.forEach(d => { if (d.exists !== false) m.set(d.id, d.data()); });
      S.data[col] = m; S.ready.add(col); emit(col);
    }, err => { console.warn('[crm] subscription', col, err); S.ready.add(col); if (err?.code === 'revoked') { S.writable = false; } emit(col); }));
  }
}

// In local demo mode, pick up what the public site stored in this browser (booking.js local fallback).
function importLocalSiteOutbox() {
  try {
    const leads = JSON.parse(localStorage.getItem('vrc.outbox.leads') || '[]');
    const res = JSON.parse(localStorage.getItem('vrc.reservations') || '[]');
    const cur = lsRead(); let n = 0;
    leads.forEach(l => { const id = 'site-' + hash(JSON.stringify(l)); if (!cur['leads/' + id]) { cur['leads/' + id] = l; n++; } });
    res.forEach(r => { if (r.resNo && !cur['reservations/' + r.resNo]) { cur['reservations/' + r.resNo] = r; n++; } });
    if (n) { lsWrite(cur); window.dispatchEvent(new StorageEvent('storage', { key: LKEY })); }
  } catch (e) { /* nothing to import */ }
}

// ---------------- writes ----------------
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
export async function setDoc(col, id, data, auditText) {
  const body = { ...data, updatedAt: new Date().toISOString(), updatedBy: S.me.id || null };
  S.data[col].set(id, body); emit(col);                       // optimistic
  await retryOnce(() => S.db.collection(col).doc(id).set(body));
  if (auditText) audit(auditText, { col, id });
  return id;
}
export async function patchDoc(col, id, patch, auditText) {
  const cur = get(col, id) || {};
  return setDoc(col, id, { ...cur, ...patch }, auditText);
}
export async function delDoc(col, id, auditText) {
  S.data[col].delete(id); emit(col);
  await retryOnce(() => S.db.collection(col).doc(id).delete());
  if (auditText) audit(auditText, { col, id });
}

// Audit: one document per day (bounded array) to stay far below the 5,000-document store cap.
const auditQueue = []; let auditBusy = false;
export function audit(text, ref = {}) {
  auditQueue.push({ at: new Date().toISOString(), by: S.me.id || null, text, ...ref });
  flushAudit();
}
async function flushAudit() {
  if (auditBusy || !auditQueue.length) return; auditBusy = true;
  try {
    while (auditQueue.length) {
      const batch = auditQueue.splice(0, auditQueue.length);
      const day = today(); const ref = S.db.collection('audit').doc(day);
      const snap = await ref.get(); const cur = snap.exists ? snap.data() : { day, entries: [] };
      const body = { day, entries: [...(cur.entries || []), ...batch].slice(-600) };
      await ref.set(body);
    }
  } catch (e) { console.warn('[crm] audit', e); }
  auditBusy = false;
}

// Document numbering: counters doc protected by a short lease so two admins never get the same number.
export async function nextNumber(entity, type) {
  const st = settings(); const ser = st.series?.[type] || {}; const year = new Date().getFullYear();
  const ref = S.db.collection('settings').doc('counters');
  const holder = (S.me.id || 'local') + ':' + uid();
  for (let i = 0; i < 8; i++) {
    const l = await ref.acquire({ holder, ttlMs: 6000 });
    if (l.acquired) break;
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
  }
  const snap = await ref.get(); const c = snap.exists ? snap.data() : {};
  const key = `${entity}.${type}.${ser.yearly === false ? 'all' : year}`;
  const n = Math.max(Number(c[key] || 0) + 1, Number(ser.start || 1));
  await ref.set({ ...c, [key]: n });
  const prefix = (st.entities?.[entity]?.prefix || entity.toUpperCase()) + '-' + (ser.prefix || type.slice(0, 2).toUpperCase());
  return { number: `${prefix}-${ser.yearly === false ? '' : year + '-'}${String(n).padStart(ser.pad || 4, '0')}`, seq: n, key };
}

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
// Effective status: an explicit CRM units/{id} doc wins; otherwise an active web reservation makes it 'reserved'.
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
export async function setUnitStatus(unitId, status, extra = {}) {
  const cur = get('units', unitId) || {};
  const body = { status, clientId: extra.clientId !== undefined ? extra.clientId : (cur.clientId || null), dealId: extra.dealId !== undefined ? extra.dealId : (cur.dealId || null) };
  if (status === 'available') { body.clientId = null; body.dealId = null; }
  return setDoc('units', unitId, body, `unit ${unitId} → ${status}`);
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

export function typeOfUnit(u) { return TYPES[u.type]; }
export { unitById, UNITS };
