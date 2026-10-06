// VILNYI RIVER CITY — release consistency check (v3.5.1). Classic, dependency-free script; loaded with `defer` from
// index.html and crm.html right after the inline `window.VRC_VERSION = '…'` line.
//
// Every first-party JS / CSS / JSON URL of a release carries the same `?v=<token>` (written by dev/stamp-version.py),
// so a browser can never combine files of two releases. The HTML page itself is the one file that cannot be versioned
// by URL — this script closes that gap: it asks the server for the published token (version.json, never cached) and,
// when the page that is running is older, moves the visitor to the new release:
//   · nothing in progress           → one automatic reload (guarded, so it can never loop)
//   · booking form / walkthrough / tour / any dialog open, or typing in a field
//                                   → a small "new version — refresh" chip instead; the visitor decides when
// It also writes the running version into every [data-vrc-ver] element (the footer) so the owner can see at a glance
// which release a device is showing.
(function () {
  'use strict';
  var RUN = String(window.VRC_VERSION || '');
  if (!RUN) return;
  var me = document.currentScript;
  var FILE = new URL('../version.json?v=3.5.1', (me && me.src) || location.href);
  var AUTO_LATER = !(me && me.getAttribute('data-auto') === 'first');   // crm.html: auto-reload only right after load
  var KEY = 'vrc.ver.reload', PARAM = '_v';
  var TEXT = {
    he: ['גרסה חדשה של האתר זמינה', 'רענון'],
    en: ['A new version of the site is available', 'Refresh'],
    ro: ['Este disponibilă o versiune nouă a site-ului', 'Reîncarcă'],
    ru: ['Доступна новая версия сайта', 'Обновить'],
    uk: ['Доступна нова версія сайту', 'Оновити'],
    fr: ['Une nouvelle version du site est disponible', 'Actualiser'],
    it: ['È disponibile una nuova versione del sito', 'Aggiorna'],
    de: ['Eine neue Version der Website ist verfügbar', 'Aktualisieren'],
  };
  var ssGet = function () { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } };
  var ssSet = function (v) { try { sessionStorage.setItem(KEY, v); } catch (e) { /* blocked: the URL parameter is the guard */ } };
  var urlV = function () { try { return new URL(location.href).searchParams.get(PARAM); } catch (e) { return null; } };

  function label() {
    var els = document.querySelectorAll('[data-vrc-ver]');
    for (var i = 0; i < els.length; i++) els[i].textContent = 'v' + RUN;
    if (!els.length && me && me.hasAttribute('data-badge') && document.body && !document.getElementById('vrcVerBadge')) {
      var b = document.createElement('span');
      b.id = 'vrcVerBadge'; b.dir = 'ltr'; b.textContent = 'v' + RUN;
      b.style.cssText = 'position:fixed;bottom:4px;inset-inline-end:8px;z-index:5;font:500 10px/1 Manrope,system-ui,sans-serif;letter-spacing:.06em;color:rgba(233,226,212,.34);pointer-events:none';
      document.body.appendChild(b);
    }
  }

  // Something the visitor would lose on a reload?
  function busy() {
    var h = document.documentElement.classList;
    if (h.contains('walk-open') || h.contains('modal-open') || h.contains('pano-open')) return true;
    if (document.querySelector('dialog[open], [aria-modal="true"]')) return true;
    var a = document.activeElement;
    return !!(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable));
  }

  function go(v, force) {
    ssSet(v);
    var u = new URL(location.href);
    u.searchParams.set(PARAM, v);                       // a URL no cache has seen → the newest HTML, straight from the server
    if (force) u.searchParams.set('_t', String(Date.now())); else u.searchParams.delete('_t');
    location.replace(u.href);
  }

  var chip = null;
  function showChip(v) {
    if (chip || !document.body) return;
    var lang = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
    var tx = TEXT[lang] || TEXT.en;
    chip = document.createElement('div');
    chip.id = 'vrcUpdate'; chip.setAttribute('role', 'status'); chip.dir = lang === 'he' ? 'rtl' : 'ltr';
    chip.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:2147483000;' +
      'display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);padding:8px 8px 8px 14px;border-radius:999px;' +
      'background:rgba(14,13,10,.94);border:1px solid rgba(201,169,106,.55);color:#e9e2d4;box-shadow:0 8px 28px rgba(0,0,0,.5);' +
      'font:400 13px/1.25 Heebo,Manrope,system-ui,sans-serif';
    var s = document.createElement('span'); s.textContent = tx[0];
    var b = document.createElement('button'); b.type = 'button'; b.textContent = tx[1];
    b.style.cssText = 'flex:none;appearance:none;-webkit-appearance:none;border:0;border-radius:999px;padding:7px 14px;cursor:pointer;' +
      'background:#c9a96a;color:#17130c;font:600 13px/1 Heebo,Manrope,system-ui,sans-serif';
    b.addEventListener('click', function () { go(v, true); });
    chip.appendChild(s); chip.appendChild(b);
    place(); setInterval(place, 1000);
  }
  // A modal <dialog> makes everything outside it inert and paints above the page, so while one is open the chip has
  // to live inside it; it goes back to <body> when the dialog closes (or re-renders its content).
  function place() {
    var home = document.body, ds = document.querySelectorAll('dialog[open]');
    for (var i = 0; i < ds.length; i++) { try { if (ds[i].matches(':modal')) home = ds[i]; } catch (e) { home = ds[i]; } }
    if (chip.parentNode !== home) home.appendChild(chip);
  }

  var last = 0, first = true, pending = false;
  function check() {
    if (pending) return;
    pending = true; last = Date.now();
    var u = new URL(FILE.href); u.searchParams.set('ts', String(last));
    fetch(u.href, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var isFirst = first; first = false; pending = false;
        var pub = j && typeof j.v === 'string' && /^[\w.\-]{1,32}$/.test(j.v) ? j.v : null;
        if (!pub) return;
        if (pub === RUN) {                               // up to date: tidy the address bar after a version reload
          if (urlV() !== null) {
            try { var c = new URL(location.href); c.searchParams.delete(PARAM); c.searchParams.delete('_t'); history.replaceState(history.state, '', c.href); } catch (e) { /* keep the URL */ }
          }
          return;
        }
        var tried = ssGet() === pub || urlV() === pub;   // already reloaded for this release in this tab → never loop
        if (!tried && !busy() && (isFirst || AUTO_LATER)) go(pub, false);
        else showChip(pub);
      })
      .catch(function () { pending = false; first = false; });
  }
  window.VRC_checkVersion = check;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', label); else label();
  window.addEventListener('load', function () { label(); setTimeout(check, 1200); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - last > 5 * 60 * 1000) check();
  });
  setInterval(function () { if (document.visibilityState === 'visible') check(); }, 30 * 60 * 1000);
})();
