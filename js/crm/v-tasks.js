// Tasks & reminders: due dates, linked client/deal, recurring (weekly/monthly) — completing a recurring task
// schedules the next one. Instalments due soon appear as automatic payment reminders.
import { tc } from './i18n-crm.js?v=3.8';
import { entries, get, setDoc, patchDoc, delDoc, clientName, activeDeals, dealFinance } from './store.js?v=3.8';
import { esc, icon, eur, fmtDate, relDays, today, addDays, addMonths, uid, openModal, formData, toast, $ } from './util.js?v=3.8';
import { pageHead, clientOptions, fld, empty, tabs } from './ui.js?v=3.8';

const F = { tab: 'open' };
const REPEAT = ['none', 'weekly', 'monthly'];

export function render(root) {
  const all = entries('tasks');
  const open = all.filter(t => !t.done).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
  const done = all.filter(t => t.done).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt))).slice(0, 100);
  const auto = activeDeals().flatMap(d => dealFinance(d).rows.filter(r => r.open > 0.009 && relDays(r.due) <= 14).map(r => ({ d, r }))).sort((a, b) => a.r.due.localeCompare(b.r.due));
  const list = F.tab === 'done' ? done : open;
  const group = t => { const n = relDays(t.due); return n == null ? 'later' : n < 0 ? 'overdue' : n === 0 ? 'today' : n <= 7 ? 'week' : 'later'; };
  const groups = F.tab === 'done' ? [['done', list]] : ['overdue', 'today', 'week', 'later'].map(g => [g, list.filter(t => group(t) === g)]).filter(g => g[1].length);
  root.innerHTML = `${pageHead(tc('nav.tasks'), esc(tc('tk.sub')), `<button class="btn primary sm" data-act="new">${icon('plus')}${esc(tc('new.task'))}</button>`)}
  ${tabs([['open', tc('tk.open'), open.length], ['done', tc('tk.done'), done.length], ['auto', tc('tk.auto'), auto.length]], F.tab)}
  ${F.tab === 'auto' ? (auto.length ? `<div class="card"><p class="muted">${esc(tc('tk.autoHint'))}</p><ul class="rows big">${auto.map(({ d, r }) => { const c = get('clients', d.clientId); const n = relDays(r.due); return `<li class="${n < 0 ? 'late' : ''}"><span class="dot"></span><div><a href="#/deal/${encodeURIComponent(d.id)}"><b>${esc(clientName(c))}</b></a><small><span dir="ltr">${esc(d.unitId)}</span> · ${esc(tc('ik.' + r.kind))} · ${esc(n < 0 ? tc('overdueDays', { n: -n }) : fmtDate(r.due))}</small></div><b class="amt">${eur(r.open)}</b><button class="btn ghost sm" data-remind="${esc(d.clientId)}">${icon('mail')}${esc(tc('tk.remind'))}</button></li>`; }).join('')}</ul></div>` : empty(tc('dash.noInst')))
    : groups.length ? groups.map(([g, ts]) => `<section class="card tgroup"><h2 class="tg-h ${g}">${esc(tc('tg.' + g))} <span>${ts.length}</span></h2><ul class="tasks">${ts.map(t => { const c = t.clientId && get('clients', t.clientId); return `<li class="${t.done ? 'is-done' : ''}"><label class="tchk"><input type="checkbox" data-done="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="${esc(tc('tk.markDone'))}"><span></span></label>
      <div class="t-b"><b>${esc(t.title)}</b><small>${t.due ? esc(fmtDate(t.due)) : ''}${c ? ` · <a href="#/client/${encodeURIComponent(t.clientId)}">${esc(clientName(c))}</a>` : ''}${t.repeat && t.repeat !== 'none' ? ` · ${icon('refresh')}${esc(tc('rep.' + t.repeat))}` : ''}</small>${t.notes ? `<p>${esc(t.notes)}</p>` : ''}</div>
      <button class="icon-btn sm" data-edit="${esc(t.id)}" aria-label="${esc(tc('edit'))}">${icon('edit')}</button></li>`; }).join('')}</ul></section>`).join('') : empty(tc(F.tab === 'done' ? 'tk.noneDone' : 'tk.none'))}`;
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { F.tab = b.dataset.tab; render(root); });
  $('[data-act=new]', root).onclick = () => editTask({});
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editTask({ id: b.dataset.edit, ...get('tasks', b.dataset.edit) }));
  root.querySelectorAll('[data-done]').forEach(cb => cb.onchange = async () => {
    const t = get('tasks', cb.dataset.done);
    await patchDoc('tasks', cb.dataset.done, { done: cb.checked, doneAt: cb.checked ? new Date().toISOString() : null }, `task ${cb.checked ? 'done' : 'reopened'}: ${t.title}`);
    if (cb.checked && t.repeat && t.repeat !== 'none' && !t.spawned) {
      const next = t.repeat === 'weekly' ? addDays(t.due || today(), 7) : addMonths(t.due || today(), 1);
      await setDoc('tasks', uid('k'), { ...t, due: next, done: false, doneAt: null, spawned: false, createdAt: new Date().toISOString() });
      await patchDoc('tasks', cb.dataset.done, { spawned: true });
      toast(tc('tk.nextScheduled', { d: fmtDate(next) }));
    }
  });
  root.querySelectorAll('[data-remind]').forEach(b => b.onclick = () => { sessionStorage.setItem('vrc.crm.mailPick', JSON.stringify([b.dataset.remind])); location.hash = '#/email'; });
}

export function editTask(t = {}) {
  openModal({
    title: t.id ? tc('tk.edit') : tc('new.task'),
    body: `<div class="fgrid">${fld(tc('title'), `<input name="title" value="${esc(t.title || '')}" required>`, 'span2')}
      ${fld(tc('dueDate'), `<input name="due" type="date" value="${esc(t.due || today())}">`)}${fld(tc('tk.repeat'), `<select name="repeat">${REPEAT.map(r => `<option value="${r}" ${r === (t.repeat || 'none') ? 'selected' : ''}>${esc(tc('rep.' + r))}</option>`).join('')}</select>`)}
      ${fld(tc('client'), `<select name="clientId">${clientOptions(t.clientId || '')}</select>`, 'span2')}
      ${fld(tc('notes'), `<textarea name="notes" rows="3">${esc(t.notes || '')}</textarea>`, 'span2')}</div><p class="err" hidden></p>`,
    foot: `${t.id ? `<button type="button" class="btn link danger" data-del>${icon('trash')}${esc(tc('delete'))}</button>` : ''}<span class="grow"></span><button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn primary" data-save>${esc(tc('save'))}</button>`,
    onMount: (d, close) => {
      d.querySelector('[data-save]').onclick = async () => {
        const f = formData(d); if (!f.title) { const e = d.querySelector('.err'); e.textContent = tc('err.title'); e.hidden = false; return; }
        const id = t.id || uid('k'); const cur = t.id ? get('tasks', t.id) : { done: false, createdAt: new Date().toISOString() };
        await setDoc('tasks', id, { ...cur, ...f, clientId: f.clientId || null }, t.id ? null : `task created: ${f.title}`); toast(tc('saved')); close();
      };
      d.querySelector('[data-del]')?.addEventListener('click', async () => { await delDoc('tasks', t.id, `task deleted: ${t.title}`); close(); });
    },
  });
}
