// VILNYI Lifestyle casino — sitting down and playing: the bankroll, the play camera, the HUD, the cashier, and the
// table logic that connects the taps to the engines (blackjack.js, roulette.js …; no game rule lives here).
// One Casino object per yacht (yacht.casino); the room attaches its live meshes to it whenever the zone is (re)built.
// PLAY MONEY ONLY: the chips are fictional, there is no purchase, deposit, cash-out or prize anywhere in this code.
import * as THREE from 'three';
import { SPEECH_LANG } from '../yacht-i18n.js?v=3.6';
import { seededRng, cryptoRng } from './rng.js?v=3.6';
import { Bank, fmt, chipsFor, CHIPS } from './bank.js?v=3.6';
import { CT } from './i18n.js?v=3.6';
import * as ART from './art.js?v=3.6';
import { CardBatch, ChipBatch, CHIP_T } from './batches.js?v=3.6';
import { createSound } from './sound.js?v=3.6';
import { TOP, RL_TABLE, MACHINE, STATIONS } from './layout.js?v=3.6';
import { GAMES } from './games.js?v=3.6';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t, DEG = Math.PI / 180;
const ease = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const speed = () => (typeof window !== 'undefined' && window.VRC_CASINO_FAST ? 0.15 : 1);    // tests shorten every wait
const esc = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function storage() { try { const s = window.localStorage; s.getItem('vrc.casino.v1'); return s; } catch { return null; } }

const CSS = `
.vw.ycasino .yh-bottom,.vw.ycasino .vw-pad,.vw.ycasino .yh-act,.vw.ycasino .yh-menu,.vw.ycasino .yh-lift,.vw.ycasino .yh-note,.vw.ycasino .yh-show,.vw.ycasino .vw-tools{display:none!important}
.cz{position:absolute;inset:0;z-index:3;pointer-events:none;display:none;font-variant-numeric:tabular-nums;color:#f3ead7}
.cz.in{display:block}
.cz bdi{unicode-bidi:isolate;direction:ltr}
.cz-catch{position:absolute;inset:0;pointer-events:none;touch-action:none}
.cz.play .cz-catch{pointer-events:auto}
.cz-bal{position:absolute;top:calc(58px + var(--st));inset-inline-end:calc(10px + var(--sr));height:38px;padding:0 14px;display:flex;align-items:center;gap:8px;border-radius:999px;pointer-events:auto;font-size:11px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
.cz-bal b{font-family:"Cormorant Garamond",Georgia,serif;font-size:21px;font-weight:600;color:var(--g2);letter-spacing:0;text-transform:none}
.cz-bal i{font-style:normal;opacity:.8}
.vw:not(.phone):not(.ycasino) .cz[dir=ltr] .cz-bal{inset-inline-end:calc(134px + var(--sr))}
.vw.phone .cz-bal{top:calc(52px + var(--st));inset-inline-end:calc(8px + var(--sr));padding:0 11px}
.vw.phone .cz-bal i{display:none}
.cz-head{position:absolute;top:calc(58px + var(--st));left:50%;transform:translateX(-50%);max-width:calc(100% - 250px);height:38px;padding:0 16px;display:none;align-items:center;gap:10px;border-radius:999px;white-space:nowrap;overflow:hidden}
.vw.phone .cz-head{top:calc(96px + var(--st));max-width:calc(100% - 20px);height:32px}
.cz.play .cz-head{display:flex}
.cz-head b{font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;font-weight:600;color:var(--g2)}
.cz-head span{font-size:11.5px;opacity:.9;overflow:hidden;text-overflow:ellipsis}
.cz-msg{position:absolute;top:calc(112px + var(--st));left:50%;transform:translate(-50%,-6px);padding:9px 20px;border-radius:14px;font-family:"Cormorant Garamond",Georgia,serif;font-size:24px;font-weight:600;color:var(--g2);opacity:0;transition:opacity .25s,transform .25s;white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;text-align:center}
.vw.phone .cz-msg{top:calc(136px + var(--st));font-size:21px}
.cz-msg.show{opacity:1;transform:translate(-50%,0)}
.cz-msg.win{color:#9ff0b4}.cz-msg.lose{color:#ffb0a8}
.cz-bottom{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(10px + var(--sb));width:min(560px,calc(100% - 16px));padding:9px;display:none;flex-direction:column;gap:8px;pointer-events:auto}
.cz.play .cz-bottom{display:flex}
.cz-rack{display:flex;align-items:center;gap:7px;justify-content:center}
.cz-rack button{width:46px;height:46px;border-radius:50%;background-size:cover;border:2px solid transparent;flex-shrink:0;transition:transform .12s;touch-action:manipulation}
.cz-rack button.on{border-color:var(--g2);transform:translateY(-5px) scale(1.08);box-shadow:0 6px 14px rgba(0,0,0,.5)}
.cz-rack .tot{margin-inline-start:6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;line-height:1.25;min-width:64px}
.cz-rack .tot b{display:block;font-family:"Cormorant Garamond",Georgia,serif;font-size:20px;color:var(--g2);letter-spacing:0;text-transform:none}
.cz-extra{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
.cz-extra:empty{display:none}
.cz-extra button{height:34px;min-width:52px;padding:0 9px;border-radius:9px;border:1px solid var(--ln);font-size:11px;color:#efe5cf;touch-action:manipulation}
.cz-extra button.on{background:var(--g);color:#111;font-weight:700;border-color:var(--g)}
.cz-acts{display:flex;gap:7px}
.cz-acts button{flex:1 1 0;min-width:0;height:48px;border-radius:12px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;font-weight:600;border:1px solid var(--ln);color:#f3ead7;background:rgba(255,255,255,.04);touch-action:manipulation;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px}
.cz-acts button small{display:block;font-size:10px;font-weight:500;letter-spacing:0;text-transform:none;opacity:.85}
.cz-acts button.gold{background:linear-gradient(135deg,#e6c987,#b88a3c);color:#111;border-color:transparent}
.cz-acts button.sug{box-shadow:0 0 0 2px #9ff0b4 inset}
.cz-acts button:disabled{opacity:.32}
.cz-tools{display:flex;gap:6px;justify-content:space-between}
.cz-tools button{height:30px;padding:0 11px;border-radius:999px;border:1px solid var(--ln);font-size:11px;color:#efe5cf;white-space:nowrap;touch-action:manipulation}
.cz-tools button.on{border-color:var(--g);color:var(--g2);background:rgba(201,164,92,.16)}
.cz-tools button:disabled{opacity:.35}
.cz-tools .sp{flex:1}
.cz-hist{display:flex;gap:4px;justify-content:center;flex-wrap:nowrap;overflow:hidden;direction:ltr}
.cz-hist:empty{display:none}
.cz-hist i{font-style:normal;min-width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
.cz-hist i.red{background:#b3202c}.cz-hist i.black{background:#17181c;border:1px solid #555}.cz-hist i.green{background:#1d8a4c}
.cz-hist i:first-child{outline:2px solid var(--g2);outline-offset:1px}
.cz-labels{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.cz-lab{position:absolute;left:0;top:0;padding:2px 8px;border-radius:999px;background:rgba(8,8,8,.78);border:1px solid var(--ln);font-size:12.5px;font-weight:700;white-space:nowrap;transform:translate(-50%,-50%);will-change:transform}
.cz-lab.act{border-color:var(--g2);color:var(--g2);box-shadow:0 0 10px rgba(230,201,135,.5)}
.cz-lab.win{background:#17603a;border-color:#9ff0b4;color:#eafff0}.cz-lab.lose{background:#5c1a1a;border-color:#ffb0a8;color:#ffe9e6}.cz-lab.push{background:#3a3a3a}
.cz-lab.big{font-size:15px;padding:4px 12px}
.cz-modal{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);pointer-events:auto;z-index:2}
.cz-modal.show{display:flex}
.cz-card{width:min(430px,calc(100% - 28px));max-height:calc(100% - 60px);overflow:auto;padding:18px 18px 14px;text-align:center}
.cz-card h3{margin:0 0 8px;font-family:"Cormorant Garamond",Georgia,serif;font-size:25px;font-weight:600;color:var(--g2)}
.cz-card p{margin:6px 0;font-size:13.5px;line-height:1.5}
.cz-card p.big{font-size:16px;font-weight:700;color:#fff}
.cz-card p.rules{text-align:start;font-size:12.5px}
.cz-card table{width:100%;border-collapse:collapse;margin:8px 0;font-size:13px}
.cz-card td{padding:5px 4px;border-bottom:1px solid rgba(201,164,92,.2);text-align:start}
.cz-card td:last-child{text-align:end;font-weight:700;color:var(--g2)}
.cz-card .btns{display:flex;gap:8px;margin-top:12px}
.cz-card .btns button{flex:1;height:44px;border-radius:12px;border:1px solid var(--ln);font-size:13px;font-weight:600;color:#f3ead7;touch-action:manipulation}
.cz-card .btns button.gold{background:linear-gradient(135deg,#e6c987,#b88a3c);color:#111;border-color:transparent}
.cz-card .btns button:disabled{opacity:.35}
@media (max-height:520px){.cz-bottom{padding:6px;gap:5px}.cz-acts button{height:40px}.cz-rack button{width:38px;height:38px}}
`;

class Casino {
  constructor(yt) {
    this.yt = yt; this.walk = yt.walk;
    this.bank = new Bank(storage());
    this.sound = createSound(yt, () => SPEECH_LANG[this.lang] || 'en-GB');
    this.chip = 500; this.game = null; this.station = null; this.k = 0; this.cards = []; this.labels = new Map(); this.noticed = false; this.seedN = 0;
    this.wheels = new Map(); this.view = null; this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4(); this._ray = new THREE.Raycaster();
    this._hud();
    this.bank.onChange(() => this._balance());
    this._key = (ev) => { if (this.yt.disposed) return window.removeEventListener('keydown', this._key, true); if (!this.game || this.modalOpen) return; if (this.game.key && this.game.key(ev)) { ev.preventDefault(); } if (/^(Key[WASD]|Arrow|Space|Enter)/.test(ev.code)) ev.stopImmediatePropagation(); if (ev.code === 'Escape') { ev.stopImmediatePropagation(); this.leave(); } };
    window.addEventListener('keydown', this._key, true);
    try { window.VRC = window.VRC || {}; window.VRC.casino = this; } catch { /* */ }
  }
  get lang() { return String(this.walk.lang || 'en').slice(0, 2); }
  t(k, v) { return CT(this.lang, k, v); }
  money(c) { return '<bdi>' + fmt(c) + '</bdi>'; }
  /** RNG for an engine: crypto in play; window.VRC_CASINO_SEED makes every game reproducible (tests). */
  rng() {
    const s = typeof window !== 'undefined' ? window.VRC_CASINO_SEED : null;
    if (s != null) return seededRng((+s || 1) + 7919 * this.seedN++);
    try { return cryptoRng(); } catch { return seededRng((Date.now() ^ (performance.now() * 1000)) >>> 0); }
  }
  wait(ms) { return new Promise(r => setTimeout(r, ms * speed())); }
  dur(ms) { return ms * speed(); }

  // ------------------------------------------------------------------ live meshes of the room (called on every zone build)
  attach(c, M) {
    if (this.game) this.leave(true);
    for (const o of this.live || []) { try { o.removeFromParent(); if (o.geometry) o.geometry.dispose(); } catch { /* */ } }
    if (this.cardBatch) this.cardBatch.dispose(); if (this.chipBatch) this.chipBatch.dispose();
    this.c = c; this.M = M; this.deckY = c.y; this.live = []; this.cards = [];
    const add = (o) => { o.userData.keep = true; o.raycast = () => {}; c.sg.add(o); this.live.push(o); return o; };
    this.cardBatch = new CardBatch(ART.cardAtlas()); c.sg.add(this.cardBatch.mesh);
    this.chipBatch = new ChipBatch(M.chips); c.sg.add(this.chipBatch.mesh);
    // roulette rotors and balls
    if (!this.wheelMat) { const t = ART.wheelTex(); this.wheelMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.2 }); this.wheelMat.name = 'y-keep-wheel'; this.ballMat = new THREE.MeshStandardMaterial({ color: '#fffdf5', roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0.35 }); }
    this.wheels.clear();
    for (const s of STATIONS) if (s.game === 'roulette') {
      const [x, z] = s.P(RL_TABLE.wheel[0], RL_TABLE.wheel[1]), g = new THREE.CircleGeometry(RL_TABLE.wheelR, 56); g.rotateX(-Math.PI / 2);
      const rotor = add(new THREE.Mesh(g, this.wheelMat)); rotor.position.set(x, c.y + TOP + 0.058, z);
      const hub = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 16), M.brass); hub.position.y = 0.045; hub.raycast = () => {}; rotor.add(hub);
      const ball = add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), this.ballMat));
      this.wheels.set(s.id, { s, rotor, ball, x, z, psi: Math.random() * 6, index: (s.id.charCodeAt(2) * 7) % 37, spin: null });
    }
    // dice
    if (!this.diceMat) { this.diceMat = new THREE.MeshStandardMaterial({ map: ART.diceTex(), roughness: 0.3, emissive: '#400', emissiveIntensity: 0.3 }); this.diceMat.name = 'y-keep-dice'; }
    this.dice = [0, 1].map(() => {
      const g = new THREE.BoxGeometry(0.045, 0.045, 0.045), uv = g.attributes.uv, face = [2, 5, 1, 6, 3, 4];      // +x −x +y −y +z −z
      for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, (face[f] - 1 + uv.getX(k)) / 6, uv.getY(k)); }
      const m = add(new THREE.Mesh(g, this.diceMat)); m.visible = false; return m;
    });
    // the screen of the machine being played (a canvas)
    if (!this.screen) { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; const m = new THREE.MeshBasicMaterial({ map: t }); m.toneMapped = false; m.name = 'y-keep-screen'; this.screen = { cv, g: cv.getContext('2d'), t, m }; }
    this.screenMesh = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.screen.m)); this.screenMesh.visible = false;
    // roulette marker on the winning number
    this.dolly = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.07, 14), M.crystal)); this.dolly.visible = false;
    this.yt.casinoFrame = (dt) => this.frame(dt);
    this._balance();
  }

  // ------------------------------------------------------------------ HUD
  _hud() {
    const root = this.walk.root;
    const st = document.createElement('style'); st.textContent = CSS; root.appendChild(st); this._style = st;
    const el = document.createElement('div'); el.className = 'cz';
    el.innerHTML = `<div class="cz-catch"></div><div class="cz-labels"></div>
      <button class="cz-bal vw-panel" data-a="cashier"><i></i><b></b></button>
      <div class="cz-head vw-panel"><b></b><span></span></div>
      <div class="cz-msg vw-panel"></div>
      <div class="cz-bottom vw-panel"><div class="cz-hist"></div><div class="cz-rack"></div><div class="cz-extra"></div><div class="cz-acts"></div>
        <div class="cz-tools"><button data-a="leave"></button><span class="sp"></span><button data-a="hint"></button><button data-a="rules"></button><button data-a="stats"></button></div></div>
      <div class="cz-modal"><div class="cz-card vw-panel"></div></div>`;
    root.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.el = { root: el, catch: q('.cz-catch'), labels: q('.cz-labels'), bal: q('.cz-bal'), head: q('.cz-head'), msg: q('.cz-msg'), bottom: q('.cz-bottom'), hist: q('.cz-hist'), rack: q('.cz-rack'), extra: q('.cz-extra'), acts: q('.cz-acts'), tools: q('.cz-tools'), modal: q('.cz-modal'), card: q('.cz-card') };
    el.addEventListener('click', (ev) => this._click(ev));
    el.addEventListener('pointerdown', () => { this.yt.audio.unlock(); this.walk._poke && this.walk._poke(); }, true);
    // taps on the table / screen
    let down = null;
    this.el.catch.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId }; });
    this.el.catch.addEventListener('pointerup', (ev) => { const d = down; down = null; if (!d || d.id !== ev.pointerId || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 14 || performance.now() - d.t > 900) return; this._tap(ev.clientX, ev.clientY); });
    this.el.catch.addEventListener('contextmenu', (ev) => ev.preventDefault());
    this.el.catch.addEventListener('wheel', (ev) => ev.preventDefault(), { passive: false });
    this._texts();
  }
  _texts() {
    const e = this.el, t = (k) => this.t(k);
    this._lang = this.lang; e.root.dir = this.walk.dir === 'rtl' ? 'rtl' : 'ltr';
    e.bal.querySelector('i').textContent = t('balance'); e.bal.title = t('cashier');
    e.tools.querySelector('[data-a=leave]').textContent = '← ' + t('leave'); e.tools.querySelector('[data-a=hint]').textContent = t('hint');
    e.tools.querySelector('[data-a=rules]').textContent = t('rules'); e.tools.querySelector('[data-a=stats]').textContent = t('stats');
    e.rack.innerHTML = '';
    for (const v of CHIPS) { const b = document.createElement('button'); b.dataset.chip = v; b.style.backgroundImage = `url(${ART.chipIcon(v)})`; b.setAttribute('aria-label', fmt(v)); e.rack.appendChild(b); }
    const tot = document.createElement('div'); tot.className = 'tot'; tot.innerHTML = `<span></span><b></b>`; e.rack.appendChild(tot);
    this._balance(); this._rack();
  }
  _balance() { if (this.el) this.el.bal.querySelector('b').innerHTML = this.money(this.bank.balance); }
  _rack() { for (const b of this.el.rack.querySelectorAll('button')) b.classList.toggle('on', +b.dataset.chip === this.chip); }
  _click(ev) {
    const b = ev.target.closest('button'); if (!b) return; const ds = b.dataset;
    this.sound.play('btn');
    if (ds.chip) { this.chip = +ds.chip; this._rack(); return; }
    if (ds.m != null) { const f = this._modalBtns && this._modalBtns[+ds.m]; if (f && f.fn) f.fn(); else this.modal(null); return; }
    if (ds.g) { if (this.game && !b.disabled) { try { const r = this.game.act(ds.g); if (r && r.catch) r.catch(e => console.warn('[casino]', e)); } catch (e) { console.warn('[casino]', e); } } return; }
    if (ds.a === 'leave') return this.leave();
    if (ds.a === 'cashier') return this.cashier();
    if (ds.a === 'stats') return this.stats();
    if (ds.a === 'rules') return this.game && this.modal({ title: this.t(this.game.name), html: `<p class="rules">${esc(this.t(this.game.rules))}</p><p>${esc(this.t('notice'))}</p>` });
    if (ds.a === 'hint') { if (this.game && this.game.toggleHint) { this.game.toggleHint(); this.refresh(); } return; }
  }
  /** Big transient line (and, for the dealer's calls, the voice). */
  msg(text, ms = 1800, cls = '') { const m = this.el.msg; m.innerHTML = text; m.className = 'cz-msg vw-panel show ' + cls; clearTimeout(this._msgT); this._msgT = setTimeout(() => m.classList.remove('show'), Math.max(500, ms * (speed() < 1 ? 0.5 : 1))); }
  say(key, vars) { const text = this.t(key, vars); this.msg(esc(text), 1900); this.sound.say(text); }
  modal(o) {
    const m = this.el.modal; this.modalOpen = !!o; m.classList.toggle('show', !!o); if (!o) { this._modalBtns = null; return; }
    const btns = o.buttons || [{ label: this.t('close') }]; this._modalBtns = btns;
    this.el.card.innerHTML = `<h3>${esc(o.title)}</h3>${o.html}<div class="btns">${btns.map((b, i) => `<button data-m="${i}" class="${b.gold ? 'gold' : ''}" ${b.off ? 'disabled' : ''}>${esc(b.label)}</button>`).join('')}</div>`;
  }
  statsRows() { const s = this.bank.session, a = this.bank.stats, t = (k) => esc(this.t(k)); return `<table><tr><td>${t('balance')}</td><td>${this.money(this.bank.balance)}</td></tr><tr><td>${t('hands')}</td><td>${s.hands} <small>(${a.hands})</small></td></tr><tr><td>${t('biggest')}</td><td>${this.money(Math.max(s.biggestWin, 0))} <small>(${this.money(a.biggestWin)})</small></td></tr><tr><td>${t('wagered')}</td><td>${this.money(s.wagered)}</td></tr><tr><td>${t('net')}</td><td>${this.money(this.bank.sessionNet)}</td></tr></table>`; }
  stats() { this.modal({ title: this.t('stats'), html: this.statsRows() + `<p>${esc(this.t('notice'))}</p>` }); }
  /** The cashier: says what the chips are, shows the session, refills a broke visitor for free. Nothing can be bought or cashed out. */
  cashier() {
    const t = (k) => esc(this.t(k)), broke = this.bank.broke && !(this.game && this.game.staked && this.game.staked() > 0);
    this.modal({ title: this.t('cashier'), html: `<p class="big">${t('notice')}</p><p>${t('noticeLong')}</p>${this.statsRows()}<p>${broke ? '' : t('notBroke')}</p>`,
      buttons: [{ label: this.t('refill'), gold: true, off: !broke, fn: () => { if (this.bank.refill()) { this.sound.play('chips'); this.modal(null); this.say('sayRefill'); this.refresh(); } } }, { label: this.t('close') }] });
    if (!this._cashSaid) { this._cashSaid = true; this.sound.say(this.t('sayCashier')); }
  }
  notice(then) {
    if (this.noticed) return then();
    this.noticed = true;
    this.modal({ title: this.t('casino'), html: `<p class="big">${esc(this.t('notice'))}</p><p>${esc(this.t('noticeLong'))}</p>`, buttons: [{ label: this.t('ok'), gold: true, fn: () => { this.modal(null); then(); } }] });
  }
  /** Rebuild the buttons, totals and chips from the game's state. */
  refresh() {
    const g = this.game; if (!g) return; const e = this.el;
    if (this._lang !== this.lang) this._texts();
    e.head.querySelector('b').textContent = this.t(g.name); e.head.querySelector('span').innerHTML = g.status ? g.status() : '';
    const acts = g.buttons();
    e.acts.innerHTML = acts.map(a => `<button data-g="${a.id}" class="${a.gold ? 'gold ' : ''}${a.sug ? 'sug' : ''}" ${a.off ? 'disabled' : ''}>${esc(a.label)}${a.sub ? `<small>${a.sub}</small>` : ''}</button>`).join('');
    const ex = g.extra ? g.extra() : [];
    e.extra.innerHTML = ex.map(a => `<button data-g="${a.id}" class="${a.on ? 'on' : ''}" ${a.off ? 'disabled' : ''}>${esc(a.label)}</button>`).join('');
    e.rack.style.display = g.noChips ? 'none' : 'flex';
    const tot = e.rack.querySelector('.tot'); tot.querySelector('span').textContent = this.t('bet'); tot.querySelector('b').innerHTML = this.money(g.staked ? g.staked() : 0);
    e.tools.querySelector('[data-a=leave]').disabled = !!g.busy || !g.canLeave();
    const hb = e.tools.querySelector('[data-a=hint]'); hb.style.display = g.toggleHint ? '' : 'none'; hb.classList.toggle('on', !!g.hint);
    e.hist.innerHTML = g.history ? g.history() : '';
    this.chipBatch.set(g.chips ? g.chips() : []);
    this._labelSet(g.labels ? g.labels() : []);
    this._padBot = null;
  }
  _labelSet(list) {
    const seen = new Set();
    for (const l of list) { let d = this.labels.get(l.id); if (!d) { d = { el: document.createElement('div') }; this.el.labels.appendChild(d.el); this.labels.set(l.id, d); } seen.add(l.id); d.l = l; const cls = 'cz-lab ' + (l.cls || ''); if (d.el.className !== cls) d.el.className = cls; if (d.html !== l.text) { d.html = l.text; d.el.innerHTML = l.text; } }
    for (const [id, d] of this.labels) if (!seen.has(id)) { d.el.remove(); this.labels.delete(id); }
  }

  // ------------------------------------------------------------------ sit / leave
  sit(id) {
    const s = STATIONS.find(q => q.id === id); if (!s || s.taken || this.game || this._sitting || !this.c) return false;
    this._sitting = true;
    this.notice(() => { this._sitting = false; this._sit(s); });
    return true;
  }
  _sit(s) {
    const yt = this.yt, w = yt.w, P = this.walk.player;
    try { yt._endPose(true); yt.dropDrink(true); yt.menu(null); } catch { /* */ }
    // stand at the table (so leaving puts the visitor there), facing it
    const back = s.machine ? 0.86 : s.vTowardPlayer ? null : 0.55, [sx, sz] = back == null ? s.P(0, 1.9) : [s.O[0] - s.look[0] * back, s.O[1] - s.look[1] * back];
    const f = yt.world.floorAt(sx, sz, w.y + 0.2, 0.6, 1.0); if (f) { w.x = sx; w.z = sz; w.y = w.ty = f.y; w.patch = f.p; }
    P.yaw = P.tYaw = Math.atan2(-s.look[0], -s.look[1]); P.pitch = P.tPitch = -0.25; P.vel.set(0, 0, 0); yt.glide = null;
    yt.busy = true; this.walk.root.classList.add('ycasino'); this.el.root.classList.add('play');
    this.station = s; this.game = new GAMES[s.game](this, s); this.fov0 = this.walk.camera.fov; this.viewCur = null;
    this.refresh();
    if (this.game.open) this.game.open();
    return true;
  }
  leave(force = false) {
    const g = this.game; if (!g) return false;
    if (!force && (g.busy || !g.canLeave())) return false;
    try { g.close(); } catch (e) { console.warn('[casino]', e); }
    this.game = null; this.station = null; this.cards = []; this.cardBatch.set([]); this.chipBatch.set([]); this._labelSet([]);
    for (const d of this.dice || []) d.visible = false; if (this.screenMesh) this.screenMesh.visible = false; if (this.dolly) this.dolly.visible = false;
    this.el.root.classList.remove('play'); this.walk.root.classList.remove('ycasino'); this.el.msg.classList.remove('show'); this.modal(null);
    this.yt.busy = false;
    return true;
  }

  /** The visitor leaves the yacht (yacht.leave): stand up at once, and take the casino's HUD and lens off the screen —
   *  nothing calls frame() once the yacht is left. */
  away() {
    if (this._sitting) { this._sitting = false; this.noticed = false; }
    this.leave(true); this.modal(null);
    this._shown = false; this.el.root.classList.remove('in', 'play'); this.walk.root.classList.remove('ycasino');
    this.k = 0; if (this._C) this._C.ok = false;
    if (this._camOn) { this._camOn = false; try { this.walk._applyFov(); } catch { /* */ } }
  }

  // ------------------------------------------------------------------ geometry helpers (table coordinates ↔ yacht-local ↔ screen)
  /** Table point (u, v, height above the top) → yacht-local [x, y, z]. */
  at(u, v, h = 0, s = this.station) { const [x, z] = s.P(u, v); return [x, this.deckY + (s.machine ? 0 : TOP) + h, z]; }
  cardYaw(s = this.station) { return Math.atan2(-s.look[0], -s.look[1]); }
  /** A new card lying face down at a table point; animate it with move(). */
  card(c, u, v, h = 0.004, o = {}) { const [x, y, z] = this.at(u, v, h); const k = { c, x, y, z, yaw: this.cardYaw() + (o.turn || 0), flip: o.flip ?? 0, s: o.s ?? 1, anim: null }; this.cards.push(k); this._cardsDirty = true; return k; }
  /** Fly a card to a table point (and turn it face up / down). → the time it takes (ms) */
  move(k, u, v, o = {}) {
    const [x, y, z] = this.at(u, v, o.h ?? 0.004), d = this.dur(o.ms ?? 300);
    k.anim = { t0: performance.now() + this.dur(o.delay || 0), d, x0: k.x, y0: k.y, z0: k.z, f0: k.flip, yaw0: k.yaw, x1: x, y1: y, z1: z, f1: o.flip ?? k.flip, yaw1: this.cardYaw() + (o.turn || 0), lift: o.lift ?? 0.05 };
    return d;
  }
  _cards(now) {
    let dirty = this._cardsDirty; this._cardsDirty = false;
    for (const k of this.cards) {
      const a = k.anim; if (!a) continue; dirty = true;
      const t = clamp((now - a.t0) / Math.max(1, a.d), 0, 1), e = ease(t);
      k.x = lerp(a.x0, a.x1, e); k.z = lerp(a.z0, a.z1, e); k.y = lerp(a.y0, a.y1, e) + Math.sin(Math.PI * t) * a.lift; k.flip = lerp(a.f0, a.f1, e); k.yaw = lerp(a.yaw0, a.yaw1, e);
      if (t >= 1) k.anim = null;
    }
    if (dirty) this.cardBatch.set(this.cards);
  }
  /** Chip stacks for an amount at a table point (splits tall stacks into neighbouring columns). */
  stack(amount, u, v, h = 0, seed = 0, scale = 1) {
    const all = chipsFor(amount, 30), out = [], per = scale > 1 ? 6 : 10;
    for (let i = 0, n = 0; i < all.length; i += per, n++) { const [x, y, z] = this.at(u + n * 0.047 * scale, v, h); out.push({ x, y, z, chips: all.slice(i, i + per).reverse(), seed: seed + n, scale }); }
    return out;
  }
  // camera pose (yacht-local) for a view { u, v, h, W, D, elev, vertical }
  _pose(s, v, out) {
    const cam = this.walk.camera, cv = this.walk.canvas, Hpx = cv.clientHeight || 800, aspect = cam.aspect || 1, portrait = aspect < 1;
    const fov = v.fov ?? (portrait ? 66 : 44), tV = Math.tan(fov * DEG / 2), tH = tV * aspect;      // a wide lens on a phone keeps the camera under the ceiling
    if (this._padBot == null) this._padBot = (this.el.bottom.offsetHeight || 180) + 22;
    const padTop = portrait ? 136 : 110, padBot = this._padBot, band = clamp((Hpx - padTop - padBot) / Hpx, 0.3, 1);
    const [tx, ty, tz] = this.at(v.u || 0, v.v || 0, v.h || 0, s);
    let e = (v.elev ?? (portrait ? 62 : 48)) * DEG, d;
    if (v.vertical) { e = (v.elev ?? 3) * DEG; d = Math.max(v.W / 2 / tH, v.D / 2 / (tV * band)); }
    else d = Math.max(v.W / 2 / tH, v.D * Math.sin(e) / 2 / (tV * band));
    d *= 1.05;
    const maxY = this.deckY + 2.42; if (!v.vertical && ty + d * Math.sin(e) > maxY) e = Math.asin(clamp((maxY - ty) / d, 0.35, 1));
    out.pos.set(tx - s.look[0] * d * Math.cos(e), ty + d * Math.sin(e), tz - s.look[1] * d * Math.cos(e));
    this._m.lookAt(out.pos, this._v.set(tx, ty, tz), THREE.Object3D.DEFAULT_UP); out.quat.setFromRotationMatrix(this._m);
    // put the target in the middle of the free band between the top bar and the bottom panel
    const off = (padBot - padTop) / 2, delta = Math.atan(off / (Hpx / 2) * tV);
    out.quat.multiply(this._q.setFromAxisAngle(this._v2.set(1, 0, 0), -delta));
    out.fov = fov;
  }
  _camera(dt) {
    const cam = this.walk.camera, yt = this.yt, on = !!this.game;
    this.k = clamp(this.k + (on ? dt : -dt) / (0.7 * Math.max(0.2, speed())), 0, 1);
    if (!on && this.k <= 0) { if (this._camOn) { this._camOn = false; try { this.walk._applyFov(); } catch { /* */ } } return; }
    this._camOn = true;
    const s = this.station || this._lastStation; if (!s) return; this._lastStation = s;
    const P = this._P || (this._P = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 50 }), C = this._C || (this._C = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 50, ok: false });
    if (on) { this._pose(s, this.game.view(), P); if (!C.ok || this._snap) { C.pos.copy(P.pos); C.quat.copy(P.quat); C.fov = P.fov; C.ok = true; this._snap = false; } else { const a = 1 - Math.exp(-dt * 5 / Math.max(0.2, speed())); C.pos.lerp(P.pos, a); C.quat.slerp(P.quat, a); C.fov = lerp(C.fov, P.fov, a); } }
    const e = ease(this.k), wp = yt.toWorld(C.pos.x, C.pos.y, C.pos.z, false, this._v), wq = this._q.copy(yt.frameQ(false)).multiply(C.quat);
    cam.position.lerp(wp, e); cam.quaternion.slerp(wq, e);
    const f0 = this.fov0 || cam.fov; cam.fov = lerp(f0, C.fov, e); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    if (!on && this.k <= 0.001) C.ok = false;
  }
  /** Screen point → table coordinates { u, v } on the plane `h` above the table top (or the machine's screen plane). */
  pick(cx, cy, h = 0) {
    const cam = this.walk.camera, r = this.walk.canvas.getBoundingClientRect(), s = this.station, yt = this.yt;
    this._ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), cam);
    const o = yt.toLocal(this._ray.ray.origin, false, new THREE.Vector3()), d = this._ray.ray.direction.clone().applyQuaternion(yt.frameQ(false).clone().invert());
    if (s.machine) {         // vertical screen plane in front of the cabinet: → { u (right), v (up from the screen's middle) }
      const K = MACHINE[s.game], off = K.d / 2 + 0.008, px = s.O[0] - s.look[0] * off, pz = s.O[1] - s.look[1] * off, den = -(d.x * s.look[0] + d.z * s.look[1]); if (Math.abs(den) < 1e-5) return null;
      const k = ((o.x - px) * s.look[0] + (o.z - pz) * s.look[1]) / den; if (k <= 0) return null;
      const hx = o.x + d.x * k - px, hz = o.z + d.z * k - pz;
      return { u: hx * s.U[0] + hz * s.U[1], v: o.y + d.y * k - (this.deckY + K.sy) };
    }
    const y = this.deckY + TOP + h; if (d.y > -1e-4) return null; const k = (y - o.y) / d.y; if (k <= 0) return null;
    const hx = o.x + d.x * k - s.O[0], hz = o.z + d.z * k - s.O[1];
    return { u: hx * s.U[0] + hz * s.U[1], v: hx * s.V[0] + hz * s.V[1] };
  }
  /** Table point → client coordinates (for the labels, and for tests that tap the felt). */
  screenOf(u, v, h = 0) {
    const cam = this.walk.camera, r = this.walk.canvas.getBoundingClientRect(), [x, y, z] = this.at(u, v, h);
    const p = this.yt.toWorld(x, y, z, false, new THREE.Vector3()).project(cam);
    return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, ok: p.z < 1 };
  }
  _tap(cx, cy) {
    const g = this.game; if (!g || this.modalOpen || !g.tap) return;
    const p = this.pick(cx, cy, g.tapH || 0); if (!p) return;
    try { const r = g.tap(p.u, p.v); if (r && r.catch) r.catch(e => console.warn('[casino]', e)); } catch (e) { console.warn('[casino]', e); }
  }
  _labels() {
    const r0 = this.el.root.getBoundingClientRect();
    for (const d of this.labels.values()) { const l = d.l, p = this.screenOf(l.u, l.v, l.h || 0); d.el.style.transform = `translate(${(p.x - r0.left).toFixed(1)}px,${(p.y - r0.top).toFixed(1)}px) translate(-50%,-50%)`; d.el.style.display = p.ok ? '' : 'none'; }
  }

  // ------------------------------------------------------------------ per frame (yacht.frame calls this after placing the walker's camera)
  frame(dt) {
    const yt = this.yt, now = performance.now(), inRoom = !!(yt.active && yt.cur && yt.cur.id === 'casino');
    const show = inRoom || !!this.game;
    if (show !== this._shown) { this._shown = show; this.el.root.classList.toggle('in', show); if (show) { if (this._lang !== this.lang) this._texts(); this._balance(); if (!this._hinted) { this._hinted = true; this.walk._toast(this.t('tapSit'), 3600); } } }
    if (!show && this.k <= 0) return;
    for (const w of this.wheels.values()) {
      if (w.spin) w.spin(now); else { w.psi += dt * 0.3; w.rotor.rotation.y = w.psi; const a = -Math.PI / 2 + w.index * (Math.PI * 2 / 37) - w.psi, R = RL_TABLE.wheelR * 0.86; w.ball.position.set(w.x + Math.cos(a) * R, this.deckY + TOP + 0.072, w.z + Math.sin(a) * R); }
    }
    this._cards(now);
    if (this.game && this.game.tick) this.game.tick(dt, now);
    this._camera(dt);
    if (this.game) this._labels();
  }
  /** Test / demo hook: force what comes next at the current table (cards "As Kd …", a roulette number, dice [[d1,d2]], reel stops). */
  rig(x) { return this.game && this.game.rig ? (this.game.rig(x), true) : false; }
  dispose() { window.removeEventListener('keydown', this._key, true); this.el.root.remove(); this._style.remove(); this.sound.dispose(); }
}

/** Called by the room builder: (re)attach the live meshes; create the Casino the first time. */
export function attachPlay(c, { M }) {
  const yt = c.yt;
  if (!yt.casino) yt.casino = new Casino(yt);
  yt.casino.attach(c, M);
}
export { Casino, CHIP_T };
