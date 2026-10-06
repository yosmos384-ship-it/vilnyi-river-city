// Language of the first paint (v3.5). Classic, synchronous, dependency-free script loaded in <head> of index.html and
// crm.html BEFORE anything renders. It decides the language once, sets <html lang dir>, and exposes the result as
// window.VRC_LANG for js/i18n.js (initialLang / setLang). No network request of any kind is made here.
//
// Order of precedence
//   1. ?lang=xx in the URL            — wins for this visit (kept for the tab session, never stored as a choice)
//   2. the visitor's own choice       — made in the language menu, remembered in localStorage (vrc.lang + vrc.lang.set)
//   3. the visitor's country          — from the device time zone (Intl…timeZone → COUNTRY table → LANG_OF table);
//                                       multilingual countries (CH, BE, CA) and uninformative zones (UTC, CET, …) use
//                                       the browser languages (navigator.languages) instead
//   4. English
//
// Test hooks (first-visit logic only, they never override 1 or 2):  ?country=RO   ?tz=Europe/Bucharest
(function () {
  'use strict';
  var CODES = ['he', 'en', 'ro', 'ru', 'uk', 'fr', 'it', 'de'];
  var RTL = { he: 1 };
  var STATIC = 'he';                 // language the HTML files are written in (what would paint before the modules run)

  // Country → language. Anything not listed → English. '*' = no single language: decided by the browser languages,
  // with the listed fallback when none of the visitor's browser languages is one of ours.
  var LANG_OF = {
    IL: 'he',
    RO: 'ro', MD: 'ro',
    RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
    UA: 'uk',
    FR: 'fr', MC: 'fr', LU: 'fr',
    IT: 'it', SM: 'it', VA: 'it',
    DE: 'de', AT: 'de', LI: 'de',
    CH: '*de',                       // German-speaking majority; fr / it when the browser says so
    BE: '*en',                       // fr for French-speaking Belgians; Dutch speakers → English
    CA: '*en',                       // fr for French-speaking Canadians
  };

  // IANA time zone → country (only the zones of the countries above; every other zone means "another country").
  var Z = {
    IL: 'Asia/Jerusalem Asia/Tel_Aviv Israel',
    RO: 'Europe/Bucharest',
    MD: 'Europe/Chisinau Europe/Tiraspol',
    RU: 'Europe/Moscow Europe/Kaliningrad Europe/Samara Europe/Volgograd Europe/Saratov Europe/Ulyanovsk Europe/Astrakhan Europe/Kirov ' +
        'Asia/Yekaterinburg Asia/Omsk Asia/Novosibirsk Asia/Barnaul Asia/Tomsk Asia/Novokuznetsk Asia/Krasnoyarsk Asia/Irkutsk Asia/Chita ' +
        'Asia/Yakutsk Asia/Khandyga Asia/Vladivostok Asia/Ust-Nera Asia/Magadan Asia/Sakhalin Asia/Srednekolymsk Asia/Kamchatka Asia/Anadyr W-SU',
    BY: 'Europe/Minsk',
    KZ: 'Asia/Almaty Asia/Qyzylorda Asia/Qostanay Asia/Aqtobe Asia/Aqtau Asia/Atyrau Asia/Oral',
    KG: 'Asia/Bishkek',
    UA: 'Europe/Kyiv Europe/Kiev Europe/Uzhgorod Europe/Zaporozhye Europe/Simferopol',
    FR: 'Europe/Paris America/Guadeloupe America/Martinique America/Cayenne America/St_Barthelemy America/Marigot America/Miquelon ' +
        'Indian/Reunion Indian/Mayotte Pacific/Noumea Pacific/Tahiti Pacific/Marquesas Pacific/Gambier Pacific/Wallis',
    MC: 'Europe/Monaco',
    LU: 'Europe/Luxembourg',
    IT: 'Europe/Rome',
    SM: 'Europe/San_Marino',
    VA: 'Europe/Vatican',
    DE: 'Europe/Berlin Europe/Busingen',
    AT: 'Europe/Vienna',
    LI: 'Europe/Vaduz',
    CH: 'Europe/Zurich',
    BE: 'Europe/Brussels',
    CA: 'America/Toronto America/Montreal America/Vancouver America/Edmonton America/Winnipeg America/Halifax America/St_Johns America/Regina ' +
        'America/Moncton America/Glace_Bay America/Goose_Bay America/Blanc-Sablon America/Nipigon America/Thunder_Bay America/Rainy_River ' +
        'America/Atikokan America/Iqaluit America/Pangnirtung America/Resolute America/Rankin_Inlet America/Cambridge_Bay America/Yellowknife ' +
        'America/Inuvik America/Whitehorse America/Dawson America/Dawson_Creek America/Fort_Nelson America/Creston America/Swift_Current ' +
        'Canada/Eastern Canada/Central Canada/Mountain Canada/Pacific Canada/Atlantic Canada/Newfoundland',
  };
  var COUNTRY = {};
  for (var c in Z) { var zs = Z[c].split(' '); for (var i = 0; i < zs.length; i++) COUNTRY[zs[i]] = c; }

  var ok = function (l) { return CODES.indexOf(l) >= 0; };
  var ls = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var ss = function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  var qs = function (k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } };

  function browserLangs() {
    var a = [];
    try { a = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).slice(); } catch (e) { /* none */ }
    return a.map(function (x) { return String(x || '').toLowerCase(); });
  }
  // first browser language that is one of ours ('' if none)
  function firstBrowser() {
    var a = browserLangs();
    for (var i = 0; i < a.length; i++) { var b = a[i].split('-')[0]; if (ok(b)) return b; }
    return '';
  }
  function timeZone() {
    var t = qs('tz');
    if (!t) { try { t = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { t = ''; } }
    return t || '';
  }
  // A zone that names no place (UTC, GMT, Etc/…, CET, EET, …): privacy modes and some servers / old systems report these.
  function vague(tz) { return !tz || tz.indexOf('/') < 0 || tz.indexOf('Etc/') === 0; }

  // → { lang, country, tz, by } for a first visit
  function byCountry() {
    var forced = (qs('country') || '').toUpperCase().slice(0, 2), tz = timeZone();
    var country = forced || COUNTRY[tz] || '';
    if (!country && vague(tz)) {                       // the zone says nothing → the browser language is all we have
      var b = firstBrowser();
      return { lang: b || 'en', country: '', tz: tz, by: 'browser' };
    }
    var rule = LANG_OF[country];
    if (!rule) return { lang: 'en', country: country, tz: tz, by: 'country' };
    if (rule.charAt(0) === '*') return { lang: firstBrowser() || rule.slice(1), country: country, tz: tz, by: 'country+browser' };
    return { lang: rule, country: country, tz: tz, by: 'country' };
  }

  function resolve() {
    var q = qs('lang');
    if (ok(q)) { try { sessionStorage.setItem('vrc.lang.visit', q); } catch (e) { /* blocked */ } return { lang: q, by: 'url' }; }
    // A stored choice. Up to v3.4 the site stored its Hebrew default on every visit, so an old bare 'he' is not a choice.
    var saved = ls('vrc.lang');
    if (ok(saved) && (ls('vrc.lang.set') === '1' || saved !== 'he')) return { lang: saved, by: 'choice' };
    var v = ss('vrc.lang.visit');
    if (ok(v)) return { lang: v, by: 'url' };
    return byCountry();
  }

  var r = resolve(), html = document.documentElement;
  r.dir = RTL[r.lang] ? 'rtl' : 'ltr';
  html.lang = r.lang; html.dir = r.dir;

  // No flash of the Hebrew markup in another language: keep the page blank (dark) until i18n.js has filled the texts.
  if (r.lang !== STATIC) {
    html.classList.add('i18n-wait');
    var st = document.createElement('style');
    st.textContent = 'html.i18n-wait{background:#0B0A08}html.i18n-wait body{visibility:hidden}';
    (document.head || html).appendChild(st);
    document.title = 'VILNYI RIVER CITY';
    setTimeout(function () { html.classList.remove('i18n-wait'); }, 5000);   // never leave the page hidden if a module fails
  }

  r.codes = CODES;
  r.ready = function () { html.classList.remove('i18n-wait'); };
  // the visitor chose a language in the menu → remember it, and drop a ?lang= so a reload keeps the choice
  r.choose = function (l) {
    if (!ok(l)) return;
    try { localStorage.setItem('vrc.lang', l); localStorage.setItem('vrc.lang.set', '1'); } catch (e) { /* storage blocked */ }
    try { sessionStorage.removeItem('vrc.lang.visit'); } catch (e) { /* blocked */ }
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }
    } catch (e) { /* ignore */ }
  };
  r.byCountry = byCountry;
  window.VRC_LANG = r;
})();
