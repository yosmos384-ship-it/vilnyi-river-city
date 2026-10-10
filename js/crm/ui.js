// Shared CRM UI fragments.
import { LANGS, langInfo } from '../i18n.js?v=3.9';
import { tc } from './i18n-crm.js?v=3.9';
import { STAGES, STAGE_EXTRA, entries, clientName, UNIT_STATUSES } from './store.js?v=3.9';
import { esc, icon } from './util.js?v=3.9';

export const pageHead = (title, sub = '', actions = '') => `<div class="ph"><div><h1>${esc(title)}</h1>${sub ? `<p class="ph-sub">${sub}</p>` : ''}</div>${actions ? `<div class="ph-act">${actions}</div>` : ''}</div>`;
export const stageChip = s => `<span class="chip stage s-${esc(s)}">${esc(tc('stage.' + s))}</span>`;
export const statusChip = s => `<span class="chip ust u-${esc(s)}"><i></i>${esc(tc('st.' + s))}</span>`;
export const flag = (l) => { const i = langInfo(l); return i ? `<span class="fl" title="${esc(i.name)}">${i.flagSvg}</span>` : ''; };
export const empty = (text, act = '') => `<div class="empty">${icon('info')}<p>${esc(text)}</p>${act}</div>`;
export const allStages = () => [...STAGES, ...STAGE_EXTRA];

export const stageOptions = (sel) => allStages().map(s => `<option value="${s}" ${s === sel ? 'selected' : ''}>${esc(tc('stage.' + s))}</option>`).join('');
export const langOptions = (sel) => LANGS.map(l => `<option value="${l.code}" ${l.code === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
export const statusOptions = (sel) => UNIT_STATUSES.map(s => `<option value="${s}" ${s === sel ? 'selected' : ''}>${esc(tc('st.' + s))}</option>`).join('');
export const clientOptions = (sel, blank = true) => (blank ? `<option value="">${esc(tc('choose'))}</option>` : '') + entries('clients').sort((a, b) => clientName(a).localeCompare(clientName(b))).map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(clientName(c))}${c.email ? ' · ' + esc(c.email) : ''}</option>`).join('');

export const fld = (label, input, cls = '') => `<label class="f ${cls}"><span>${esc(label)}</span>${input}</label>`;
export const kpi = (label, value, sub = '', ic = '', tone = '') => `<div class="kpi ${tone}">${ic ? `<span class="kpi-ic">${icon(ic)}</span>` : ''}<p class="kpi-l">${esc(label)}</p><p class="kpi-v">${value}</p>${sub ? `<p class="kpi-s">${sub}</p>` : ''}</div>`;
export const tabs = (items, cur, attr = 'data-tab') => `<div class="tabs" role="tablist">${items.map(([k, l, n]) => `<button type="button" role="tab" ${attr}="${k}" aria-selected="${k === cur}">${esc(l)}${n != null ? `<b>${n}</b>` : ''}</button>`).join('')}</div>`;
