// Users & access (admin only): accounts and permissions, override requests, audit log.
// Accounts are created here through the admin-users Edge Function; the browser never holds the service key.
import { tc } from './i18n-crm.js?v=3.15';
import { S, listProfiles, listUnitRequests, resolveUnitRequest, adminAction, queryAudit, requestUnitOverride } from './store.js?v=3.15';
import { validUsername, normUsername } from './auth.js?v=3.15';
import { esc, icon, fmtDateTime, toast, $, $$, openModal, confirmUI, formData } from './util.js?v=3.15';
import { pageHead, tabs, fld, empty } from './ui.js?v=3.15';

export const ROLES = ['admin', 'manager', 'agent', 'viewer'];
export const PERMS = ['view_all_clients', 'change_units', 'create_deals', 'delete', 'send_emails', 'manage_users'];
// Starting toggles per role. The admin can change every toggle for every user.
const ROLE_DEFAULTS = {
  admin: Object.fromEntries(PERMS.map(p => [p, true])),
  manager: { view_all_clients: true, change_units: true, create_deals: true, send_emails: true },
  agent: { change_units: true, create_deals: true },
  viewer: { view_all_clients: true },
};

const F = { tab: 'users', audit: { userId: '', action: '', from: '', to: '' } };
let ROOT = null;   // the page's root element, for re-rendering after a change
const dayStart = (d, add = 0) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + add); return x.toISOString(); };

export async function render(root) {
  ROOT = root;
  if (!S.me.isOwner) { root.innerHTML = `${pageHead(tc('nav.users'))}${empty(tc('users.adminOnly'))}`; return; }
  if (S.mode !== 'live') { root.innerHTML = `${pageHead(tc('nav.users'))}${empty(tc('users.demo'))}`; return; }
  root.innerHTML = `${pageHead(tc('nav.users'), esc(tc('users.sub')))}${tabs([['users', tc('users.tab')], ['requests', tc('users.reqTab')], ['audit', tc('users.auditTab')]], F.tab)}<div class="set-body"></div>`;
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { F.tab = b.dataset.tab; render(root); });
  const body = $('.set-body', root);
  try {
    if (F.tab === 'users') await usersTab(body);
    else if (F.tab === 'requests') await requestsTab(body);
    else await auditTab(body);
  } catch (e) {
    body.innerHTML = `<div class="card"><p class="bad">${esc(tc('users.loadErr', { c: e?.code || '' }))}</p></div>`;
  }
}

// ---------------- accounts ----------------
async function usersTab(body) {
  const profiles = await listProfiles();
  body.innerHTML = `<div class="card"><div class="card-h"><h2>${icon('users')}${esc(tc('users.listT'))}</h2><div><button type="button" class="btn primary sm" data-act="new">${icon('plus')}${esc(tc('users.new'))}</button></div></div>
    ${profiles.length ? `<div class="tbl-wrap"><table class="tbl users"><thead><tr><th>${esc(tc('users.username'))}</th><th>${esc(tc('users.fullName'))}</th><th>${esc(tc('users.role'))}</th><th>${esc(tc('users.status'))}</th><th>${esc(tc('users.perms'))}</th><th></th></tr></thead><tbody>
      ${profiles.map(p => `<tr data-id="${esc(p.id)}"><td dir="ltr" class="mono">${esc(p.username)}</td><td>${esc(p.full_name || '—')}</td><td>${esc(tc('role.' + p.role))}</td>
        <td><span class="chip ${p.active ? 'u-available' : 'u-blocked'}"><i></i>${esc(tc(p.active ? 'users.active' : 'users.inactive'))}</span></td>
        <td class="sm">${PERMS.filter(k => p.role === 'admin' || p.permissions?.[k] === true).map(k => esc(tc('perm.' + k))).join(' · ') || '—'}</td>
        <td class="row-acts"><button type="button" class="btn ghost sm" data-act="edit">${esc(tc('edit'))}</button>
          <button type="button" class="btn ghost sm" data-act="reset">${esc(tc('users.resetLink'))}</button>
          <button type="button" class="btn ghost sm ${p.active ? 'danger' : ''}" data-act="toggle">${esc(tc(p.active ? 'users.deactivate' : 'users.activate'))}</button></td></tr>`).join('')}
    </tbody></table></div>` : empty(tc('users.none'))}
    <p class="fine">${icon('info')}${esc(tc('users.note'))}</p></div>`;

  body.querySelector('[data-act=new]').onclick = () => userDialog(null, () => render(ROOT));
  body.querySelectorAll('tr[data-id]').forEach(tr => {
    const p = profiles.find(x => x.id === tr.dataset.id);
    tr.querySelector('[data-act=edit]').onclick = () => userDialog(p, () => render(ROOT));
    tr.querySelector('[data-act=reset]').onclick = async () => {
      try { const r = await adminAction({ action: 'reset_link', id: p.id }); linkDialog(r.reset_link, p.username); }
      catch (e) { toast(errText(e), 'err', 5000); }
    };
    tr.querySelector('[data-act=toggle]').onclick = async () => {
      const next = !p.active;
      if (!await confirmUI({ title: tc(next ? 'users.activate' : 'users.deactivate'), text: tc(next ? 'users.activateQ' : 'users.deactivateQ', { u: p.username }), danger: !next, ok: tc(next ? 'users.activate' : 'users.deactivate') })) return;
      try { await adminAction({ action: 'set_active', id: p.id, active: next }); toast(tc('saved')); render(ROOT); }
      catch (e) { toast(errText(e), 'err', 5000); }
    };
  });
}

const errText = e => tc('users.err.' + (e?.code || 'error'));

// Create or edit one account. Role presets fill the permission toggles; the admin can still change them.
function userDialog(p, done) {
  const isNew = !p;
  const cur = p ? { ...p.permissions } : { ...ROLE_DEFAULTS.agent };
  const permBoxes = () => PERMS.map(k => `<label class="chk"><input type="checkbox" name="perm" value="${k}" ${cur[k] === true ? 'checked' : ''}><span>${esc(tc('perm.' + k))}</span></label>`).join('');
  openModal({
    title: tc(isNew ? 'users.new' : 'users.edit'), sub: p ? `<span dir="ltr">${esc(p.username)}</span>` : '',
    body: `<div class="fgrid" data-f>
        ${isNew ? fld(tc('users.username'), `<input name="username" dir="ltr" autocomplete="off" autocapitalize="none" spellcheck="false" required placeholder="e.g. anna.k">`) : ''}
        ${fld(tc('users.fullName'), `<input name="full_name" value="${esc(p?.full_name || '')}" required>`)}
        ${fld(tc('users.role'), `<select name="role">${ROLES.map(r => `<option value="${r}" ${r === (p?.role || 'agent') ? 'selected' : ''}>${esc(tc('role.' + r))}</option>`).join('')}</select>`)}
      </div>
      <fieldset class="perms"><legend>${esc(tc('users.perms'))}</legend><div class="perm-grid">${permBoxes()}</div></fieldset>
      <p class="fine">${icon('info')}${esc(tc('users.roleNote'))}</p>
      <p class="login-err" role="alert" hidden></p>`,
    foot: `<button type="button" class="btn ghost" data-close>${esc(tc('cancel'))}</button><button type="button" class="btn primary" data-save>${esc(tc('save'))}</button>`,
    onMount: (d, close) => {
      const role = d.querySelector('[name=role]'), err = d.querySelector('.login-err');
      role.onchange = () => {   // role preset → toggles (admin can still adjust)
        const preset = ROLE_DEFAULTS[role.value] || {};
        d.querySelectorAll('[name=perm]').forEach(b => { b.checked = preset[b.value] === true; });
      };
      d.querySelector('[data-save]').onclick = async () => {
        const f = formData(d.querySelector('[data-f]'));
        const permissions = Object.fromEntries(PERMS.map(k => [k, !!d.querySelector(`[name=perm][value=${k}]`)?.checked]));
        if (isNew && !validUsername(f.username)) { err.textContent = tc('users.err.username'); err.hidden = false; return; }
        if (!String(f.full_name || '').trim()) { err.textContent = tc('users.err.name'); err.hidden = false; return; }
        const btn = d.querySelector('[data-save]'); btn.disabled = true;
        try {
          if (isNew) {
            const r = await adminAction({ action: 'create', username: normUsername(f.username), full_name: f.full_name.trim(), role: f.role, permissions });
            close(); linkDialog(r.reset_link, r.username, () => done?.());
            toast(tc('users.created'));
          } else {
            await adminAction({ action: 'update', id: p.id, full_name: f.full_name.trim(), role: f.role, permissions });
            close(); toast(tc('saved')); done?.();
          }
        } catch (e) { btn.disabled = false; err.textContent = errText(e); err.hidden = false; }
      };
    },
  });
}

// A one-time recovery link: the user opens it and sets a password. Shown once, never stored.
function linkDialog(link, username, after) {
  openModal({
    title: tc('users.linkT'), sub: `<span dir="ltr">${esc(username)}</span>`,
    body: `<p class="fine">${icon('info')}${esc(tc('users.linkNote'))}</p>
      <div class="test-row"><input readonly dir="ltr" value="${esc(link)}" aria-label="${esc(tc('users.linkT'))}" id="rl"><button type="button" class="btn ghost sm" data-copy>${esc(tc('copy'))}</button></div>`,
    foot: `<button type="button" class="btn primary" data-close>${esc(tc('done'))}</button>`,
    onMount: (d) => {
      d.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(link); toast(tc('copied')); } catch (e) { d.querySelector('#rl').select(); } };
    },
    onClose: () => after?.(),
  });
}

// ---------------- override requests ----------------
async function requestsTab(body) {
  const [reqs, profiles] = await Promise.all([listUnitRequests('pending'), listProfiles()]);
  const name = id => profiles.find(p => p.id === id)?.username || '—';
  body.innerHTML = `<div class="card"><h2>${icon('shield')}${esc(tc('users.reqT'))}</h2><p class="muted">${esc(tc('users.reqIntro'))}</p>
    ${reqs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(tc('users.when'))}</th><th>${esc(tc('users.by'))}</th><th>${esc(tc('units'))}</th><th>${esc(tc('users.wants'))}</th><th>${esc(tc('users.reason'))}</th><th></th></tr></thead><tbody>
      ${reqs.map(r => `<tr data-id="${r.id}"><td class="sm">${esc(fmtDateTime(r.created_at))}</td><td dir="ltr">${esc(name(r.requester))}</td><td dir="ltr">${esc(r.unit_id)}</td>
        <td>${esc(tc('st.' + r.requested_status))}${r.requested_client_id ? ` · <span dir="ltr">${esc(r.requested_client_id)}</span>` : ''}</td><td>${esc(r.reason)}</td>
        <td class="row-acts"><button type="button" class="btn primary sm" data-act="ok">${esc(tc('users.approve'))}</button><button type="button" class="btn ghost sm danger" data-act="no">${esc(tc('users.reject'))}</button></td></tr>`).join('')}
    </tbody></table></div>` : empty(tc('users.reqNone'))}</div>`;
  body.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = Number(tr.dataset.id);
    const decide = async approve => {
      if (!await confirmUI({ title: tc(approve ? 'users.approve' : 'users.reject'), text: tc(approve ? 'users.approveQ' : 'users.rejectQ'), danger: !approve, ok: tc(approve ? 'users.approve' : 'users.reject') })) return;
      try { await resolveUnitRequest(id, approve, ''); toast(tc('saved')); render(ROOT); }
      catch (e) { toast(tc('users.err.' + (e?.code || 'error')) || e.message, 'err', 5000); }
    };
    tr.querySelector('[data-act=ok]').onclick = () => decide(true);
    tr.querySelector('[data-act=no]').onclick = () => decide(false);
  });
}

// Used by the sales screens when a unit is taken: ask an admin to decide (reason is required).
export async function askOverride(unitId, status, clientId, dealId) {
  const reason = window.prompt(tc('users.reasonPrompt', { u: unitId })) || '';
  if (reason.trim().length < 3) return false;
  await requestUnitOverride(unitId, status, clientId, dealId, reason.trim());
  toast(tc('users.requested'));
  return true;
}

// ---------------- audit log ----------------
async function auditTab(body) {
  const profiles = await listProfiles();
  const f = F.audit;
  body.innerHTML = `<div class="card"><div class="card-h"><h2>${icon('doc')}${esc(tc('users.auditT'))}</h2></div>
    <form class="fgrid audit-filters" data-f>
      ${fld(tc('users.by'), `<select name="userId"><option value="">${esc(tc('users.anyone'))}</option>${profiles.map(p => `<option value="${p.id}" ${p.id === f.userId ? 'selected' : ''}>${esc(p.username)}</option>`).join('')}</select>`)}
      ${fld(tc('users.action'), `<input name="action" value="${esc(f.action)}" placeholder="${esc(tc('users.actionHint'))}">`)}
      ${fld(tc('users.from'), `<input name="from" type="date" value="${esc(f.from)}">`)}
      ${fld(tc('users.to'), `<input name="to" type="date" value="${esc(f.to)}">`)}
      <div class="row-end span2"><button type="button" class="btn primary sm" data-act="apply">${esc(tc('users.apply'))}</button></div>
    </form>
    <div class="audit-out"></div></div>`;
  const out = $('.audit-out', body);
  const name = id => profiles.find(p => p.id === id)?.username || (id ? '—' : tc('users.system'));
  const run = async () => {
    const x = formData(body.querySelector('[data-f]'));
    F.audit = { userId: x.userId || '', action: (x.action || '').trim(), from: x.from || '', to: x.to || '' };
    out.innerHTML = `<p class="muted">${esc(tc('loading'))}</p>`;
    const rows = await queryAudit({ userId: F.audit.userId, action: F.audit.action, from: F.audit.from ? dayStart(F.audit.from) : '', to: F.audit.to ? dayStart(F.audit.to, 1) : '', limit: 300 });
    out.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl audit-tbl"><thead><tr><th>${esc(tc('users.when'))}</th><th>${esc(tc('users.by'))}</th><th>${esc(tc('users.action'))}</th><th>${esc(tc('users.object'))}</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="sm">${esc(fmtDateTime(r.created_at))}</td><td dir="ltr">${esc(name(r.user_id))}</td><td>${esc(r.action)}</td><td dir="ltr" class="sm">${esc([r.entity, r.entity_id].filter(Boolean).join(' · '))}</td></tr>`).join('')}
    </tbody></table></div><p class="fine">${esc(tc('users.auditCap', { n: rows.length }))}</p>` : empty(tc('users.auditNone'));
  };
  $('[data-act=apply]', body).onclick = () => run().catch(e => { out.innerHTML = `<p class="bad">${esc(tc('users.loadErr', { c: e?.code || '' }))}</p>`; });
  await run();
}
