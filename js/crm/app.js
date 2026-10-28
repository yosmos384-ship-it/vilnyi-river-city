// VRC CRM — shell: sign-in, access gate, layout, router, language switcher, global search.
import { LANGS, langInfo, setLang, lang, initialLang, onLangChange } from '../i18n.js?v=3.14';
import { UNITS } from '../data.js?v=3.14';
import { tc } from './i18n-crm.js?v=3.15';
import { S, boot, enterLive, onChange, syncLeads, entries, clientName, get, can } from './store.js?v=3.15';
import { esc, icon, $, $$, debounce, initials } from './util.js?v=3.15';
import { seedDemo } from './demo.js?v=3.15';
import { getClient, signIn, signOut, setNewPassword } from './auth.js?v=3.15';

const VIEWS = {
  dashboard: () => import('./v-dashboard.js?v=3.15'),
  clients: () => import('./v-clients.js?v=3.15'),
  client: () => import('./v-clients.js?v=3.15'),
  pipeline: () => import('./v-clients.js?v=3.15'),
  units: () => import('./v-units.js?v=3.15'),
  deals: () => import('./v-deals.js?v=3.15'),
  deal: () => import('./v-deals.js?v=3.15'),
  documents: () => import('./v-documents.js?v=3.15'),
  email: () => import('./v-email.js?v=3.15'),
  tasks: () => import('./v-tasks.js?v=3.15'),
  users: () => import('./v-users.js?v=3.15'),
  settings: () => import('./v-settings.js?v=3.15'),
};
const NAV = [['dashboard', 'dash'], ['clients', 'users'], ['pipeline', 'kanban'], ['units', 'building'], ['deals', 'deal'], ['documents', 'doc'], ['email', 'mail'], ['tasks', 'task'], ['users', 'shield'], ['settings', 'cog']];
const ADMIN_ONLY = new Set(['settings', 'users']);

// Who may open a view. Local demo: everything. Live: admin-only pages, and mass email needs send_emails.
export function allowed(view) {
  if (S.mode !== 'live') return true;
  if (ADMIN_ONLY.has(view)) return !!S.me.isOwner;
  if (view === 'email') return can('send_emails');
  return true;
}

let current = { name: null, params: [], mod: null, cleanup: null };
let pendingRender = false;

function route() {
  const h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
  const [name, ...params] = h.split('/').map(decodeURIComponent);
  return { name: VIEWS[name] ? name : 'dashboard', params };
}
export function go(path) { location.hash = '#/' + path; }

async function renderView(force = false) {
  const r = route(); const main = $('#main'); if (!main) return;
  if (!allowed(r.name)) { go('dashboard'); return; }
  if (!force && document.activeElement && main.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && current.name === r.name) { pendingRender = true; return; }
  if (document.querySelector('dialog[open]') && current.name === r.name && !force) { pendingRender = true; return; }
  pendingRender = false;
  const same = current.name === r.name && String(current.params) === String(r.params);
  const scroll = same ? main.scrollTop : 0; const wscroll = same ? window.scrollY : 0;
  if (!same) { current.cleanup?.(); current.cleanup = null; }
  const mod = await VIEWS[r.name]();
  current = { ...current, name: r.name, params: r.params, mod };
  const out = await mod.render(main, r.name, r.params, { go, same });
  if (typeof out === 'function') { current.cleanup?.(); current.cleanup = out; }
  if (same) { main.scrollTop = scroll; window.scrollTo(0, wscroll); } else window.scrollTo(0, 0);
  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.v === r.name || (r.name === 'client' && a.dataset.v === 'clients') || (r.name === 'deal' && a.dataset.v === 'deals')));
  document.body.classList.remove('nav-open');
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) renderView(); }, 60));
document.addEventListener('crm:rerender', () => renderView(true));

function langMenu() {
  const cur = langInfo(lang);
  return `<div class="lang-sw"><button type="button" class="lang-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(tc('language'))}">${cur.flagSvg}<span>${cur.short}</span></button>
    <ul class="lang-menu" role="listbox" hidden>${LANGS.map(l => `<li role="option" aria-selected="${l.code === lang}" data-l="${l.code}" tabindex="0">${l.flagSvg}<span>${esc(l.name)}</span></li>`).join('')}</ul></div>`;
}
function bindLang(root) {
  const btn = $('.lang-btn', root), menu = $('.lang-menu', root); if (!btn) return;
  btn.addEventListener('click', e => { e.stopPropagation(); const o = menu.hidden; menu.hidden = !o; btn.setAttribute('aria-expanded', String(o)); if (o) menu.querySelector('[aria-selected=true]')?.focus(); });
  menu.addEventListener('click', e => { const li = e.target.closest('[data-l]'); if (li) { setLang(li.dataset.l); } });
  menu.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.closest('[data-l]')?.click(); if (e.key === 'Escape') { menu.hidden = true; btn.focus(); } });
  document.addEventListener('click', () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
}

function modeBadge() {
  if (S.mode === 'local') return `<span class="mode-badge demo" title="${esc(tc('mode.localTip'))}">${icon('info')}${esc(tc('mode.local'))}</span>`;
  return `<span class="mode-badge live">${icon('shield')}${esc(tc('mode.live'))}</span>`;
}

function shell() {
  document.body.classList.toggle('ro', S.mode === 'live' && !S.me.canEdit);   // viewers: read-only screens
  document.body.innerHTML = `
  <div class="app">
    <aside class="side" aria-label="${esc(tc('nav.label'))}">
      <a class="brand" href="#/dashboard"><img src="assets/bird.png" alt="" width="34" height="30"><span class="bw" dir="ltr"><b>VILNYI</b><i>RIVER CITY</i></span></a>
      <p class="brand-sub">${esc(tc('app.sub'))}</p>
      <nav class="nav">${NAV.filter(([v]) => allowed(v)).map(([v, ic]) => `<a href="#/${v}" data-v="${v}">${icon(ic)}<span>${esc(tc('nav.' + v))}</span></a>`).join('')}</nav>
      <div class="side-foot">${modeBadge()}<a class="site-link" href="index.html" target="_blank" rel="noopener">${icon('globe')}<span>${esc(tc('nav.site'))}</span></a></div>
    </aside>
    <div class="side-scrim" data-act="nav"></div>
    <div class="col">
      <header class="top">
        <button type="button" class="icon-btn only-m" data-act="nav" aria-label="${esc(tc('nav.label'))}">${icon('menu')}</button>
        <div class="gsearch">${icon('search')}<input type="search" id="gq" placeholder="${esc(tc('search.global'))}" autocomplete="off" aria-label="${esc(tc('search.global'))}"><div class="gres" hidden></div></div>
        <div class="top-end">
          <div class="newmenu"><button type="button" class="btn primary sm" data-act="new">${icon('plus')}<span class="hide-s">${esc(tc('new'))}</span></button>
            <div class="pop" hidden>${['client', 'deal', 'task', 'document'].map(k => `<button type="button" data-new="${k}">${esc(tc('new.' + k))}</button>`).join('')}</div></div>
          ${langMenu()}
          ${S.mode === 'live' ? `<button type="button" class="icon-btn" data-act="signout" title="${esc(S.me.username)}" aria-label="${esc(tc('login.signout'))}">${icon('lock')}</button>` : ''}
          <span class="me" title="${esc(S.me.name || '')}">${esc(initials(S.me.name || 'VR'))}</span>
        </div>
      </header>
      ${S.mode === 'local' ? `<div class="demo-bar" role="note">${icon('info')}<span>${esc(tc('mode.localBar'))}</span></div>` : ''}
      <main id="main" tabindex="-1"></main>
    </div>
  </div>`;
  bindLang(document.body);
  $$('[data-act=nav]').forEach(b => b.addEventListener('click', () => document.body.classList.toggle('nav-open')));
  $('[data-act=signout]')?.addEventListener('click', doSignOut);
  const nb = $('[data-act=new]'), pop = $('.newmenu .pop');
  nb.addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; });
  document.addEventListener('click', () => { pop.hidden = true; });
  pop.addEventListener('click', async e => {
    const k = e.target.closest('[data-new]')?.dataset.new; if (!k) return;
    if (k === 'client') (await import('./v-clients.js?v=3.15')).editClient();
    if (k === 'deal') (await import('./v-deals.js?v=3.15')).newDeal({});
    if (k === 'task') (await import('./v-tasks.js?v=3.15')).editTask({});
    if (k === 'document') (await import('./v-documents.js?v=3.15')).newDocument({});
  });
  bindSearch();
}

function bindSearch() {
  const q = $('#gq'), box = $('.gres');
  const run = debounce(() => {
    const s = q.value.trim().toLowerCase(); if (s.length < 2) { box.hidden = true; return; }
    const cl = entries('clients').filter(c => [clientName(c), c.email, c.phone].join(' ').toLowerCase().includes(s)).slice(0, 6);
    const un = UNITS.filter(u => u.id.toLowerCase().includes(s)).slice(0, 5);
    const dc = entries('documents').filter(d => String(d.number).toLowerCase().includes(s)).slice(0, 4);
    const rows = [
      ...cl.map(c => `<a href="#/client/${encodeURIComponent(c.id)}">${icon('users')}<span>${esc(clientName(c))}</span><small dir="ltr">${esc(c.email || c.phone || '')}</small></a>`),
      ...un.map(u => `<a href="#/units/${u.id}">${icon('building')}<span dir="ltr">${u.id}</span><small>${esc(tc('st.' + (get('units', u.id)?.status || 'available')))}</small></a>`),
      ...dc.map(d => `<a href="#/documents/${encodeURIComponent(d.id)}">${icon('doc')}<span dir="ltr">${esc(d.number)}</span><small>${esc(tc('dt.' + d.type))}</small></a>`),
    ];
    box.innerHTML = rows.length ? rows.join('') : `<p class="empty-s">${esc(tc('search.none'))}</p>`; box.hidden = false;
  }, 120);
  q.addEventListener('input', run); q.addEventListener('focus', run);
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { box.hidden = true; q.blur(); } if (e.key === 'Enter') box.querySelector('a')?.click(); });
  box.addEventListener('click', () => { box.hidden = true; q.value = ''; });
  document.addEventListener('click', e => { if (!e.target.closest('.gsearch')) box.hidden = true; });
}

// ---------------- sign-in and other full-page screens ----------------
const BRAND = `<img src="assets/bird.png" alt="" width="64" height="56"><p class="bw" dir="ltr"><b>VILNYI</b> <i>RIVER CITY</i></p>`;
const frame = inner => `<div class="lock"><div class="lock-card login-card">${BRAND}${inner}${langMenu()}</div></div>`;

function loginScreen(err = '') {
  document.body.innerHTML = frame(`<h1>${esc(tc('login.title'))}</h1><p>${esc(tc('login.text'))}</p>
    <form class="login-form" novalidate>
      <label class="f"><span>${esc(tc('login.user'))}</span><input name="username" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label class="f"><span>${esc(tc('login.pass'))}</span><input name="password" type="password" dir="ltr" autocomplete="current-password" required></label>
      <p class="login-err" role="alert" ${err ? '' : 'hidden'}>${esc(err)}</p>
      <button class="btn primary wide" type="submit">${esc(tc('login.submit'))}</button>
    </form>`);
  bindLang(document.body);
  const form = $('.login-form');
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try { await signIn(form.username.value, form.password.value); await afterAuth(); }
    catch (x) { loginScreen(x.code === 'bad_credentials' ? tc('login.bad') : tc('login.netErr')); }
  };
}

// The link the admin sent (or a reset link) lands here: set a new password, then enter the CRM.
function recoveryScreen(err = '') {
  document.body.innerHTML = frame(`<h1>${esc(tc('login.setTitle'))}</h1><p>${esc(tc('login.setText'))}</p>
    <form class="login-form" novalidate>
      <label class="f"><span>${esc(tc('login.newPass'))}</span><input name="p1" type="password" dir="ltr" autocomplete="new-password" minlength="12" required></label>
      <label class="f"><span>${esc(tc('login.newPass2'))}</span><input name="p2" type="password" dir="ltr" autocomplete="new-password" minlength="12" required></label>
      <p class="login-err" role="alert" ${err ? '' : 'hidden'}>${esc(err)}</p>
      <button class="btn primary wide" type="submit">${esc(tc('login.setBtn'))}</button>
    </form>`);
  bindLang(document.body);
  const form = $('.login-form');
  form.onsubmit = async e => {
    e.preventDefault();
    if (form.p1.value.length < 12) return recoveryScreen(tc('login.short'));
    if (form.p1.value !== form.p2.value) return recoveryScreen(tc('login.mismatch'));
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try { await setNewPassword(form.p1.value); history.replaceState(null, '', location.pathname + location.search); await afterAuth(); }
    catch (x) { recoveryScreen(tc('login.netErr')); }
  };
}

function noAccessScreen() {
  document.body.innerHTML = frame(`<div class="lock-ic">${icon('lock')}</div><h1>${esc(tc('login.noAccessT'))}</h1><p>${esc(tc('login.noAccess'))}</p>
    <button class="btn ghost" type="button" id="so">${esc(tc('login.signout'))}</button>`);
  bindLang(document.body);
  $('#so').onclick = doSignOut;
}

function errorScreen() {
  document.body.innerHTML = frame(`<div class="lock-ic">${icon('alert')}</div><h1>${esc(tc('login.netErrT'))}</h1><p>${esc(tc('login.netErr'))}</p>
    <button class="btn ghost" type="button" id="rt">${esc(tc('login.retry'))}</button>`);
  bindLang(document.body);
  $('#rt').onclick = () => location.reload();
}

function loading() {
  document.body.innerHTML = `<div class="lock"><div class="lock-card"><img src="assets/bird.png" alt="" width="64" height="56" class="pulse"><p class="bw" dir="ltr"><b>VILNYI</b> <i>RIVER CITY</i></p><p class="muted">${esc(tc('loading'))}</p></div></div>`;
}

async function doSignOut() {
  try { await signOut(); } catch (e) { /* fall through: reload clears the screen either way */ }
  location.href = location.pathname;
}

// ---------------- screen state ----------------
let view = 'loading';
let appStarted = false, authWired = false;
function draw() {
  document.title = tc('app.title');
  if (view === 'loading') return loading();
  if (view === 'login') return loginScreen();
  if (view === 'recovery') return recoveryScreen();
  if (view === 'noaccess') return noAccessScreen();
  if (view === 'error') return errorScreen();
  shell(); renderView(true);
}
function show(v) { view = v; draw(); }

function startApp() {
  view = 'app';
  if (!appStarted) {
    appStarted = true;
    window.addEventListener('hashchange', () => renderView(true));
    let synced = false;
    onChange(cols => {
      if (!synced && S.ready.has('leads') && S.ready.has('clients')) { synced = true; syncLeads().catch(e => console.warn(e)); }
      else if (synced && cols.has('leads')) syncLeads().catch(e => console.warn(e));
      if (view === 'app') renderView();
    });
  }
  draw();
}

// Once per page: a recovery link switches to "set password"; a sign-out from another tab reloads to the login.
async function wireAuth() {
  if (authWired) return;
  authWired = true;
  const sb = await getClient();
  sb.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') show('recovery');
    if (event === 'SIGNED_OUT' && view === 'app') location.href = location.pathname;
  });
}

async function afterAuth() {
  const mode = await enterLive();
  if (mode === 'noaccess') return show('noaccess');
  await wireAuth();
  startApp();
}

async function main() {
  setLang(initialLang(), false);
  onLangChange(draw);
  draw();
  let mode;
  try { mode = await boot(); }
  catch (e) { console.warn('[crm] start', e); return show('error'); }
  if (mode === 'local') { await seedDemo(); return startApp(); }
  if (mode === 'signedout') return show('login');
  if (mode === 'noaccess') return show('noaccess');
  // Live session. A recovery link opened in this tab goes straight to "set your password".
  if (/type=recovery/.test(location.hash)) { await wireAuth(); return show('recovery'); }
  await wireAuth();
  startApp();
}
main();
