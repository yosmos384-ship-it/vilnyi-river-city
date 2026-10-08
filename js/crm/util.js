// CRM helpers: escaping, formatting, dates, ids, icons, toasts, modal/drawer shells, confirm-in-UI.
import { lang } from '../i18n.js?v=3.6';
import { tc } from './i18n-crm.js?v=3.6';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const locale = () => ({ he: 'he-IL', en: 'en-GB', ro: 'ro-RO', ru: 'ru-RU', uk: 'uk-UA', fr: 'fr-FR', it: 'it-IT', de: 'de-DE' }[lang] || 'en-GB');
export function eur(n, dec = 0) {
  const v = Number(n) || 0;
  try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: dec, minimumFractionDigits: dec }).format(v); }
  catch (e) { return '€' + v.toFixed(dec); }
}
export function eurL(n, l, dec = 2) {   // for documents in a given language
  const loc = { he: 'he-IL', en: 'en-GB', ro: 'ro-RO', ru: 'ru-RU', uk: 'uk-UA', fr: 'fr-FR', it: 'it-IT', de: 'de-DE' }[l] || 'en-GB';
  try { return new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Number(n) || 0); }
  catch (e) { return '€' + (Number(n) || 0).toFixed(dec); }
}
export const nf = (n, dec = 0) => { try { return new Intl.NumberFormat(locale(), { maximumFractionDigits: dec }).format(Number(n) || 0); } catch (e) { return String(n); } };
export function countryName(code, l = lang) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return code || '';
  try { return new Intl.DisplayNames([l, 'en'], { type: 'region' }).of(code) || code; } catch (e) { return code; }
}
export const pct = (n) => nf(n, 1) + '%';
export const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

export const today = () => new Date().toISOString().slice(0, 10);
export function addDays(iso, d) { const x = new Date(iso + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); }
export function addMonths(iso, m) { const x = new Date(iso + 'T12:00:00Z'); const day = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + m); const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day, last)); return x.toISOString().slice(0, 10); }
export function fmtDate(iso, l = lang) {
  if (!iso) return '—';
  const loc = { he: 'he-IL', en: 'en-GB', ro: 'ro-RO', ru: 'ru-RU', uk: 'uk-UA', fr: 'fr-FR', it: 'it-IT', de: 'de-DE' }[l] || 'en-GB';
  try { return new Date(String(iso).length <= 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return String(iso).slice(0, 10); }
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; }
}
export function relDays(iso) {   // days from today (negative = past)
  if (!iso) return null;
  const a = new Date(today() + 'T12:00:00Z'), b = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => [...w][0] || '').join('').toUpperCase() || '?';
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const clone = o => JSON.parse(JSON.stringify(o ?? null));
export const isEmail = s => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(String(s || '').trim());

// ---------- icons (24px stroke, currentColor) ----------
const P = {
  dash: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><path d="M16 4.6a3 3 0 010 6M18.5 14.8c1.4.7 2.3 2.4 2.5 5.2"/>',
  kanban: '<rect x="3.5" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="10" rx="1"/><rect x="15.5" y="4" width="5" height="13" rx="1"/>',
  building: '<path d="M4 21V5l8-2v18M12 8l8 2.5V21M3 21h18M7 7.5h2M7 11h2M7 14.5h2M15 13h2M15 16.5h2"/>',
  deal: '<path d="M3 12l4-4 4 3 3-3 7 7-4 4-3-3-2 2-4-4z"/><path d="M7 8L3 12"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6M9 8h2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3.5 6l8.5 7 8.5-7"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2M3 12h0M21 12h0"/><circle cx="12" cy="12" r="7.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/>',
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8 9h8M8 12.5h5"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  euro: '<path d="M17 6.5A6.5 6.5 0 0010 10v4a6.5 6.5 0 007 3.5M5 10.5h9M5 13.5h8"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  send: '<path d="M4 12l16-8-6 16-3-6z"/><path d="M11 14l9-10"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  chevl: '<path d="M15 6l-6 6 6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  history: '<path d="M4 12a8 8 0 102.5-5.8M4 4v4h4"/><path d="M12 8v4l3 2"/>',
  pdf: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M8.5 16.5v-4h1.3a1.2 1.2 0 010 2.4H8.5M13 12.5v4h1a2 2 0 000-4zM17.5 12.5h-1.8v4M15.7 14.5h1.5"/>',
  receipt: '<path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
  grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.7 2.5 14.3 0 17M12 3.5c-2.5 2.7-2.5 14.3 0 17"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  shield: '<path d="M12 3l7.5 3v6c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6z"/>',
  refresh: '<path d="M20 11a8 8 0 00-14.3-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0014.3 4.3L20 15.5M20 20v-4.5h-4.5"/>',
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[n] || ''}</svg>`;

// ---------- toasts ----------
export function toast(msg, kind = 'ok', ms = 3200) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const el = document.createElement('div'); el.className = 'toast ' + kind;
  el.innerHTML = icon(kind === 'err' ? 'alert' : kind === 'info' ? 'info' : 'check') + `<span></span>`;
  el.querySelector('span').textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---------- modal (dialog element) ----------
// openModal({title, body (html), foot (html), wide, onMount(root, close)}) → close()
export function openModal({ title, sub = '', body, foot = '', wide = false, cls = '', onMount, onClose }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'cm-modal' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '');
  dlg.innerHTML = `<form method="dialog" class="cm-card" novalidate>
    <header class="cm-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
      <button type="button" class="icon-btn" data-close aria-label="${esc(tc('close'))}">${icon('x')}</button></header>
    <div class="cm-body">${body}</div>${foot ? `<footer class="cm-foot">${foot}</footer>` : ''}</form>`;
  document.body.appendChild(dlg);
  const close = () => { if (!dlg.isConnected) return; dlg.close(); dlg.remove(); onClose?.(); };
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dlg.addEventListener('mousedown', e => { if (e.target === dlg) close(); });
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  dlg.querySelector('form').addEventListener('submit', e => e.preventDefault());
  dlg.showModal();
  onMount?.(dlg, close);
  setTimeout(() => dlg.querySelector('.cm-body input:not([type=hidden]):not([readonly]), .cm-body select, .cm-body textarea')?.focus(), 20);
  return close;
}

// In-UI confirmation (no window.confirm): resolves true/false.
export function confirmUI({ title, text, ok, danger = false }) {
  return new Promise(res => {
    let done = false;
    const close = openModal({
      title, body: `<p class="confirm-text">${esc(text)}</p>`,
      foot: `<button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok || tc('confirm'))}</button>`,
      onMount: (d, c) => d.querySelector('[data-ok]').addEventListener('click', () => { done = true; res(true); c(); }),
      onClose: () => { if (!done) res(false); },
    });
  });
}

// Read a form's named fields into an object (checkbox → boolean, number inputs → number).
export function formData(root) {
  const o = {};
  root.querySelectorAll('[name]').forEach(el => {
    if (el.type === 'checkbox') { if (el.dataset.multi) { (o[el.name] ||= []); if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked; }
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.type === 'number') o[el.name] = el.value === '' ? null : Number(el.value);
    else o[el.name] = el.value.trim();
  });
  return o;
}

// CSV (RFC 4180) — used for import/export.
export function toCSV(rows, cols) {
  const q = v => { const s = v == null ? '' : String(v); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [cols.map(c => q(c.label ?? c.key)).join(','), ...rows.map(r => cols.map(c => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\r\n');
}
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim());
  return rows.filter(r => r.some(v => v.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function b64FromBytes(bytes) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
