// core-ui.js — minimap renderer + DOM UI helpers: zoom (pinch / wheel FOV), arrow D-pad, radio chip + panel, style
// picker, collapsible phone tools, iOS / audio-unlock guards. Owner: CORE (UI). No side effects on import.

export const FLOOR_HE = { upper: 'קומה עליונה', main: 'קומת כניסה', basement: 'מרתף', outside: 'חוץ', roof: 'גג' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => performance.now();

/* ============================================================================================ minimap */
// The card is half its V2 size (desktop 100×80, phone 66×52 CSS px). Compact drawing: only the current room is
// labelled. Tap / click the card to expand it to the old size for a few seconds.
export function createMinimap(canvas, plan) {
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, last = null, bigT = 0;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = Math.max(40, Math.round(r.width)); H = Math.max(32, Math.round(r.height));
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  resize();
  const card = canvas.closest ? canvas.closest('#mapCard') : null;
  function setBig(on) {
    if (!card) return;
    card.classList.toggle('big', !!on);
    resize(); if (last) draw(last);
    clearTimeout(bigT);
    if (on) bigT = setTimeout(() => setBig(false), 6000);
  }
  if (card) {
    card.setAttribute('role', 'button'); card.setAttribute('title', 'הקש להגדלת המפה');
    card.addEventListener('click', (e) => { e.stopPropagation(); setBig(!card.classList.contains('big')); });
  }
  const ROOM_FILL = { main: 'rgba(120,200,255,0.10)', upper: 'rgba(170,150,255,0.12)', basement: 'rgba(200,190,170,0.10)' };

  function draw(args) {
    last = args;
    const { x, z, yaw, floor, roomName } = args;
    if (!W) resize();
    const compact = W < 120;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const inside = floor !== 'outside';
    const pad = compact ? 5 : 8;
    let cx, cz, s;
    if (inside) { cx = plan.W / 2; cz = plan.D / 2; s = Math.min((W - 2 * pad) / plan.W, (H - 2 * pad) / plan.D); }
    else { cx = x; cz = z; s = compact ? 2.4 : 4.2; }
    const X = (wx) => (wx - cx) * s + W / 2, Y = (wz) => (wz - cz) * s + H / 2;

    if (!inside) {
      const L = plan.lot, st = plan.street, dw = plan.driveway;
      if (L) { g.fillStyle = 'rgba(90,150,90,0.18)'; g.fillRect(X(L.x0), Y(L.z0), (L.x1 - L.x0) * s, (L.z1 - L.z0) * s); }
      if (st) { g.fillStyle = 'rgba(160,160,170,0.30)'; g.fillRect(0, Y(st.zCenter - st.width / 2), W, st.width * s); }
      if (dw) { g.fillStyle = 'rgba(190,170,140,0.28)'; g.fillRect(X(dw.x0), Y(dw.z0), (dw.x1 - dw.x0) * s, (dw.z1 - dw.z0) * s); }
      if (plan.porch) { const p = plan.porch; g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(X(p.x0), Y(p.z0), (p.x1 - p.x0) * s, (p.z1 - p.z0) * s); }
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = compact ? 1 : 1.5;
      g.fillRect(X(0), Y(0), plan.W * s, plan.D * s); g.strokeRect(X(0), Y(0), plan.W * s, plan.D * s);
      if (plan.bigTree) { g.fillStyle = 'rgba(80,160,80,0.45)'; g.beginPath(); g.arc(X(plan.bigTree.x), Y(plan.bigTree.z), 5 * s * 0.6, 0, Math.PI * 2); g.fill(); }
    } else {
      const rooms = (plan.rooms && plan.rooms[floor]) || {};
      g.lineWidth = 1;
      const list = Object.entries(rooms).sort((a, b) => (b[1].r[2] - b[1].r[0]) * (b[1].r[3] - b[1].r[1]) - (a[1].r[2] - a[1].r[0]) * (a[1].r[3] - a[1].r[1]));
      for (const [, rm] of list) {
        const [x0, z0, x1, z1] = rm.r;
        const cur = rm.he === roomName;
        g.fillStyle = cur ? 'rgba(80,230,255,0.30)' : (ROOM_FILL[floor] || 'rgba(255,255,255,0.08)');
        g.strokeStyle = cur ? 'rgba(120,240,255,0.95)' : 'rgba(255,255,255,0.5)';
        g.fillRect(X(x0), Y(z0), (x1 - x0) * s, (z1 - z0) * s);
        g.strokeRect(X(x0) + 0.5, Y(z0) + 0.5, (x1 - x0) * s - 1, (z1 - z0) * s - 1);
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const fs = compact ? 7.5 : Math.max(8, Math.min(11, s * 0.55));
      g.font = `600 ${fs}px system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
      for (const [, rm] of list) {
        const [x0, z0, x1, z1] = rm.r;
        const w = (x1 - x0) * s;
        const cur = rm.he === roomName;
        if (compact && !cur) continue; // phone / small card: only the current room is labelled
        if (w < (compact ? 14 : 22)) continue;
        let txt = rm.he;
        if (compact && g.measureText(txt).width > w + 8) continue;
        g.fillStyle = cur ? '#ffffff' : 'rgba(255,255,255,0.9)';
        g.fillText(txt, X((x0 + x1) / 2), Y((z0 + z1) / 2) + (compact ? fs : 0));
      }
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = compact ? 1.4 : 2;
      g.strokeRect(X(0), Y(0), plan.W * s, plan.D * s);
      const S = plan.stairs && plan.stairs.up;
      if (S) {
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
        const zA = Math.min(S.zBottom, S.zTop), zB = Math.max(S.zBottom, S.zTop), n = compact ? 5 : 10;
        for (let i = 0; i <= n; i++) { const zz = zA + ((zB - zA) * i) / n; g.beginPath(); g.moveTo(X(S.x0), Y(zz)); g.lineTo(X(S.x1), Y(zz)); g.stroke(); }
      }
    }
    // player + view cone
    const px = X(x), pz = Y(z);
    const ang = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    const R = compact ? Math.min(20, W * 0.3) : 34;
    const grd = g.createRadialGradient(px, pz, 2, px, pz, R);
    grd.addColorStop(0, 'rgba(80,230,255,0.6)'); grd.addColorStop(1, 'rgba(80,230,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(px, pz); g.arc(px, pz, R, ang - 0.55, ang + 0.55); g.closePath(); g.fill();
    g.fillStyle = '#4fe6ff'; g.strokeStyle = '#fff'; g.lineWidth = compact ? 1.5 : 2;
    g.beginPath(); g.arc(clamp(px, 4, W - 4), clamp(pz, 4, H - 4), compact ? 3.2 : 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = `600 ${compact ? 7 : 9}px system-ui, Arial`; g.textAlign = 'center';
    g.fillText(compact ? '↑' : 'N ↑', W - (compact ? 6 : 14), compact ? 7 : 10);
  }
  return { draw, resize, setBig, get big() { return !!(card && card.classList.contains('big')); }, get size() { return { w: W, h: H }; } };
}

export function toastFn(el) {
  let t = 0;
  return (msg, ms = 2600) => {
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(t); t = setTimeout(() => el.classList.remove('show'), ms);
  };
}

/* ============================================================================================ FOV */
// Wider default vertical FOV on phones in portrait so more of the room is on screen; landscape phone 65; desktop 70.
export function defaultFov(isTouch) {
  const w = window.innerWidth || 1280, h = window.innerHeight || 800;
  if (h > w * 1.05) return isTouch ? 82 : 76;
  if (isTouch && Math.min(w, h) < 620) return 65;
  return 70;
}
// Walk-mode zoom: two-finger pinch on touch, wheel / trackpad pinch (ctrl+wheel) on desktop. Smooth FOV 35–95.
// (360 mode keeps its own pinch / wheel handling in core-pano.js with the same range.)
export function createZoom({ canvas, camera, getMode, isTouch, isBusy }) {
  const MIN = 35, MAX = 95;
  const pts = new Map();
  let pinch0 = 0, fov0 = 70, lastPinchT = -1e9, pinched = false;
  const st = { target: defaultFov(isTouch), user: false };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || getMode() !== 'walk') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { pinch0 = Math.max(1, dist()); fov0 = st.target; pinched = true; lastPinchT = now(); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size >= 2 && pinch0 > 0) { st.target = clamp(fov0 * (pinch0 / Math.max(1, dist())), MIN, MAX); st.user = true; lastPinchT = now(); }
  });
  const up = (e) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size < 2) pinch0 = 0;
    if (pts.size === 0) setTimeout(() => { if (!pts.size) pinched = false; }, 0);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  return {
    MIN, MAX,
    get pinching() { return pts.size >= 2 && pinch0 > 0; },
    // true while / right after a pinch: the fingers lifting must not count as taps (interaction / double-tap walk)
    blockClick() { return pinched || now() - lastPinchT < 350; },
    onWheel(e) {
      if (e.cancelable) e.preventDefault();
      const k = e.ctrlKey ? 0.01 : 0.0012; // ctrl+wheel = trackpad pinch (small deltas)
      st.target = clamp(st.target * Math.exp(clamp(e.deltaY, -120, 120) * k), MIN, MAX); st.user = true;
    },
    reset() { st.target = defaultFov(isTouch); st.user = false; return st.target; },
    get target() { return st.target; }, set target(v) { st.target = clamp(+v || 70, MIN, MAX); st.user = true; },
    get defaultFov() { return defaultFov(isTouch); },
    onResize() { if (!st.user) st.target = defaultFov(isTouch); },
    update(dt) {
      if (getMode() !== 'walk' || (isBusy && isBusy())) return;
      const f = camera.fov + (st.target - camera.fov) * (1 - Math.exp(-12 * dt));
      if (Math.abs(f - camera.fov) > 1e-3) { camera.fov = Math.abs(st.target - f) < 0.01 ? st.target : f; camera.updateProjectionMatrix(); }
    },
  };
}

/* ============================================================================================ arrow D-pad */
// ▲ forward, ▼ back, ◀ ▶ turn. Press-and-hold = continuous with acceleration (forward turns into a run after ~2 s);
// a quick tap = one short step (▲▼, via onStep) or a ~24° turn (◀▶).
export function createDpad(el, opts = {}) {
  if (!el) return null;
  const held = {};
  const st = { impulse: 0 };
  const TAP = 0.22;
  for (const b of el.querySelectorAll('[data-d]')) {
    const d = b.dataset.d;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (_) {}
      held[d] = now(); b.classList.add('on');
      if (opts.onPress) try { opts.onPress(d); } catch (_) {}
    };
    const release = (e) => {
      if (held[d] == null) return;
      const dur = (now() - held[d]) / 1000; delete held[d]; b.classList.remove('on');
      if (e && e.type === 'pointercancel') return;
      if (dur < TAP) {
        if (d === 'f' || d === 'b') { if (opts.onStep) try { opts.onStep(d === 'f' ? 1 : -1); } catch (_) {} }
        else st.impulse += (d === 'l' ? 1 : -1) * 0.42;
      }
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', (e) => e.preventDefault());
  }
  const hold = (d) => (held[d] != null ? (now() - held[d]) / 1000 : -1);
  return {
    el,
    get active() { return Object.keys(held).length > 0 || Math.abs(st.impulse) > 1e-3; },
    // → {forward (-1..1), turn (radians this frame, + = left), run}
    read(dt) {
      let forward = 0, turn = 0, run = false;
      const hf = hold('f'), hb = hold('b'), hl = hold('l'), hr = hold('r');
      if (hf >= TAP) { forward += Math.min(1, 0.45 + (hf - TAP) * 0.8); run = hf > 2.2; }
      if (hb >= TAP) forward -= Math.min(0.8, 0.4 + (hb - TAP) * 0.6);
      const rate = (h) => (h >= TAP ? Math.min(2.2, 0.8 + (h - TAP) * 1.6) : 0);
      turn = (rate(hl) - rate(hr)) * dt;
      if (Math.abs(st.impulse) > 1e-4) { const s = Math.sign(st.impulse) * Math.min(Math.abs(st.impulse), dt * 3.2); turn += s; st.impulse -= s; }
      return { forward, turn, run };
    },
    release() { for (const k of Object.keys(held)) delete held[k]; st.impulse = 0; for (const b of el.querySelectorAll('.on')) b.classList.remove('on'); },
    // tests
    press(d) { held[d] = now(); }, lift(d) { delete held[d]; },
  };
}

/* ============================================================================================ popover panels */
const openPanels = new Set();
function closeOnOutside(e) {
  for (const p of [...openPanels]) {
    if (p.el.contains(e.target) || (p.trigger && p.trigger.contains(e.target))) continue;
    hidePanel(p);
  }
}
function showPanel(p) {
  p.el.classList.add('show'); p.el.setAttribute('aria-hidden', 'false');
  if (p.trigger) p.trigger.setAttribute('aria-expanded', 'true');
  openPanels.add(p);
  if (openPanels.size === 1) { document.addEventListener('pointerdown', closeOnOutside, true); }
}
function hidePanel(p) {
  p.el.classList.remove('show'); p.el.setAttribute('aria-hidden', 'true');
  if (p.trigger) p.trigger.setAttribute('aria-expanded', 'false');
  openPanels.delete(p);
  if (!openPanels.size) document.removeEventListener('pointerdown', closeOnOutside, true);
}
function makePanel(el, trigger) {
  const p = { el, trigger };
  el.setAttribute('aria-hidden', 'true');
  return {
    get open() { return el.classList.contains('show'); },
    show() { showPanel(p); }, hide() { hidePanel(p); },
    toggle() { if (el.classList.contains('show')) hidePanel(p); else showPanel(p); },
  };
}
export function closePanels() { for (const p of [...openPanels]) hidePanel(p); }

/* ============================================================================================ radio chip + panel */
// V5: one panel for both sources. Top: shared controls (act on whatever plays). "📡 real American stations": on a
// normal web host (radio.live.avail === 'yes') each row is a one-tap play button (spinner while connecting, toast +
// auto-skip on failure); where external media is blocked (claude.ai artifact CSP) rows are new-tab links + a badge.
// Below: the 6 synthesized "radio in the house" stations (autoplay / random / 3D radio sync).
export function createRadioUI({ radio, chip, panel, toast }) {
  if (!radio || !chip || !panel) return null;
  chip.innerHTML = '<span class="rc-ico" aria-hidden="true">📻</span><span class="rc-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="rc-txt"><b></b><small></small></span>';
  chip.setAttribute('aria-haspopup', 'dialog');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LIVE = radio.liveStations || [];
  panel.innerHTML = `
    <div class="sh-head"><b>📻 רדיו <span class="sh-dim">Eakin ’56</span></b><button class="sh-x" data-act="close" aria-label="סגור">×</button></div>
    <div class="rp-now"><div class="rp-name"></div><div class="rp-sub"></div></div>
    <div class="rp-ctrl" dir="ltr">
      <button data-act="prev" aria-label="התחנה הקודמת" title="התחנה הקודמת">⏮</button>
      <button data-act="toggle" class="rp-play" aria-label="הפעלה / עצירה"></button>
      <button data-act="next" aria-label="התחנה הבאה" title="התחנה הבאה">⏭</button>
      <label class="rp-vol" title="עוצמה"><span aria-hidden="true">🔉</span><input type="range" min="0" max="100" step="1" aria-label="עוצמת הרדיו"></label>
    </div>
    <section class="rp-sec" id="rpLive"><div class="rp-h">📡 תחנות אמיתיות מאמריקה — שידור חי <span class="rp-how"></span></div>
      <div class="rp-badge"></div>
      <div class="rp-lvlist"></div>
      <div class="rp-foot rp-csp"></div></section>
    <div class="rp-h" id="rpHome">🏠 רדיו בתוך הבית</div>
    <div class="rp-list" role="listbox" aria-label="תחנות"></div>
    <div class="rp-foot">המוזיקה נשמעת בכל הבית בעוצמת רקע, וחזק יותר ליד הרדיו הישן בסלון.</div>`;
  const list = panel.querySelector('.rp-list'), lvlist = panel.querySelector('.rp-lvlist');
  radio.stations.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'rp-st'; b.dataset.i = String(i); b.setAttribute('role', 'option');
    b.innerHTML = '<span class="rp-f"></span><span class="rp-t"><b></b><small></small></span>';
    b.querySelector('.rp-f').textContent = s.f;
    b.querySelector('b').textContent = s.he;
    b.querySelector('small').textContent = s.call + ' · ' + s.sub;
    list.appendChild(b);
  });
  const info = (s) => `<span class="rp-t"><b><bdi dir="ltr">${esc(s.call)}</bdi> · <bdi dir="ltr">${esc(s.freq)}</bdi></b><small><bdi dir="ltr">${esc(s.city)}</bdi> · ${esc(s.he)}</small></span>`;
  let builtFor = '';
  function buildLive(avail) {
    const inPage = avail === 'yes';
    if (builtFor === (inPage ? 'in' : 'link')) return;
    builtFor = inPage ? 'in' : 'link';
    lvlist.innerHTML = LIVE.map((s, i) => inPage
      ? `<button class="rp-lv rp-lvb" data-live="${i}">${info(s)}<span class="rp-lvs" aria-hidden="true">▶</span></button>`
      : `<div class="rp-lv">${info(s)}<a class="rp-live" href="${esc(s.url)}" target="_blank" rel="noopener">▶ האזן בשידור חי</a></div>`).join('');
    panel.querySelector('.rp-how').textContent = inPage ? '(הקשה = ניגון כאן)' : '(נפתח בלשונית חדשה)';
    const badge = panel.querySelector('.rp-badge');
    badge.textContent = inPage ? '' : 'בגרסה המתארחת בדומיין שלך זה מתנגן כאן ישירות';
    badge.style.display = inPage ? 'none' : '';
    panel.querySelector('.rp-csp').textContent = inPage
      ? 'שידור חי מאמריקה בתוך הסיור · חלק מהתחנות עשויות להיות חסומות מחוץ לארה״ב — אז עוברים אוטומטית לתחנה הבאה'
      : 'שידור חי אמיתי לא יכול לרוץ בתוך הסיור עצמו בגלל הגבלות אבטחה של הדף';
  }
  const P = makePanel(panel, chip);
  const vol = panel.querySelector('input[type=range]');
  function render(s) {
    s = s || radio.state;
    const L = s.live || radio.live || { avail: 'no', on: false };
    buildLive(L.avail);
    const stn = s.station || radio.stations[s.idx];
    const live = L.on && L.station, conn = live && L.status === 'connecting';
    chip.classList.toggle('on', !!s.on);
    chip.classList.toggle('live', !!live);
    chip.classList.toggle('tuning', !!(s.on && (s.tuning || conn)));
    chip.querySelector('b').textContent = live ? L.station.call + ' · ' + L.station.he : (s.on ? stn.he : 'רדיו');
    chip.querySelector('small').textContent = live ? (conn ? 'מתחבר…' : '● LIVE ' + L.station.freq) : (s.on ? (s.tuning ? 'מכוון…' : stn.call + ' ' + stn.f) : 'כבוי');
    chip.setAttribute('aria-label', live ? 'שידור חי: ' + L.station.call + ' ' + L.station.he : (s.on ? 'רדיו מנגן: ' + stn.he : 'רדיו כבוי — פתח בחירת תחנות'));
    panel.querySelector('.rp-name').textContent = live ? '📡 ' + L.station.call + ' ' + L.station.freq + ' — ' + L.station.he : (s.on ? stn.call + ' ' + stn.f + ' — ' + stn.he : 'הרדיו כבוי');
    panel.querySelector('.rp-sub').textContent = live ? (conn ? 'מתחבר לשידור…' : 'שידור חי · ' + L.station.city) : (s.on ? (s.tuning ? 'מכוון… (רעש בין תחנות)' : stn.sub) : 'בחרו תחנה או לחצו ▶');
    const pb = panel.querySelector('.rp-play'); pb.textContent = s.on ? '⏹' : '▶'; pb.classList.toggle('on', !!s.on);
    for (const b of list.children) { const on = !!s.synthOn && +b.dataset.i === s.idx; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }
    for (const b of lvlist.querySelectorAll('[data-live]')) {
      const me = L.on && +b.dataset.live === L.idx;
      b.classList.toggle('on', me && L.status === 'playing'); b.classList.toggle('busy', me && L.status === 'connecting');
      const st = b.querySelector('.rp-lvs'); if (st) st.textContent = me ? (L.status === 'connecting' ? '' : L.status === 'playing' ? '■' : '⚠') : '▶';
    }
    if (document.activeElement !== vol) vol.value = String(Math.round(s.vol * 100));
  }
  chip.addEventListener('click', (e) => { e.stopPropagation(); render(); P.toggle(); });
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('a.rp-live');
    if (a) { // V4 fallback: the real stream opens in a new tab (default anchor action) — silence the in-house radio
      e.stopPropagation();
      try { radio.stop(); } catch (_) {}
      if (toast) setTimeout(() => toast('השידור נפתח בלשונית חדשה — הרדיו בבית הושתק', 3200), 0);
      return;
    }
    const b = e.target.closest('button'); if (!b) return;
    e.stopPropagation();
    const act = b.dataset.act;
    if (act === 'close') P.hide();
    else if (act === 'prev') radio.prev();
    else if (act === 'next') radio.next();
    else if (act === 'toggle') radio.toggle();
    else if (b.dataset.live != null) { const L = radio.live; if (L.on && L.idx === +b.dataset.live && L.status === 'playing') radio.stop(); else radio.playLive(+b.dataset.live); }
    else if (b.dataset.i != null) radio.tune(+b.dataset.i);
  });
  vol.addEventListener('input', () => radio.setVolume(+vol.value / 100));
  // V4: open requests (3D radio "תחנות אמיתיות") → show the panel scrolled to that section
  const openAt = (section) => {
    render(); P.show();
    const el = panel.querySelector(section === 'live' ? '#rpLive' : '#rpHome');
    requestAnimationFrame(() => { try { el && el.scrollIntoView({ block: 'start' }); } catch (_) {} });
  };
  if (radio.onPanelRequest) radio.onPanelRequest(openAt);
  if (radio.onNotice) radio.onNotice((msg) => toast && toast(msg, 3400));
  let lastKey = '';
  radio.onChange((s) => {
    render(s);
    const L = s.live || {};
    const key = L.on && L.status === 'playing' ? 'L' + L.idx : (s.synthOn && s.cur >= 0 ? 'S' + s.cur : '');
    if (key && key !== lastKey && !P.open && toast) {
      if (key[0] === 'L') toast('📡 בשידור חי: ' + L.station.call + ' ' + L.station.freq + ' — ' + L.station.he, 2800);
      else toast('📻 מנגן: ' + radio.stations[s.cur].he + ' · ' + radio.stations[s.cur].call + ' ' + radio.stations[s.cur].f, 2600);
    }
    lastKey = key;
  });
  render();
  return { panel: P, render, openAt };
}

/* ============================================================================================ style picker */
// STYLE bot exposes window.__tour.styles = {list(), set(id), current (getter or fn)}; the button stays hidden until it exists.
export function createStyleUI({ btn, panel, toast, getStyles }) {
  if (!btn || !panel) return null;
  let api = null, tries = 0, iv = 0;
  const safe = (fn) => { try { return fn(); } catch (_) { return null; } };
  function find() {
    const s = safe(getStyles);
    return s && typeof s.list === 'function' && typeof s.set === 'function' ? s : null;
  }
  function check() {
    api = find();
    document.body.classList.toggle('has-styles', !!api);
    if (api && iv) { clearInterval(iv); iv = 0; }
    return api;
  }
  const fields = (s, i) => {
    if (typeof s === 'string') return { id: s, name: s, blurb: '' };
    const id = s.id != null ? s.id : (s.key != null ? s.key : i);
    return { id, name: s.he || s.name || s.label || s.title || String(id), blurb: s.blurb || s.heBlurb || s.desc || s.description || s.sub || '', sw: Array.isArray(s.swatch) ? s.swatch : (Array.isArray(s.colors) ? s.colors : null) };
  };
  panel.innerHTML = '<div class="sh-head"><b>🎨 סגנון השיפוץ</b><button class="sh-x" data-act="close" aria-label="סגור">×</button></div><div class="sp-list" role="listbox" aria-label="סגנונות"></div>';
  const list = panel.querySelector('.sp-list');
  const P = makePanel(panel, btn);
  function render() {
    if (!check()) return;
    const items = (safe(() => api.list()) || []).map(fields);
    let cur = safe(() => (typeof api.current === 'function' ? api.current() : api.current)); // getter or function
    if (cur && typeof cur === 'object') cur = cur.id;
    list.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'sp-it' + (String(it.id) === String(cur) ? ' on' : ''); b.dataset.id = String(it.id); b.setAttribute('role', 'option');
      b.innerHTML = '<span class="sp-sw"></span><span class="sp-t"><b></b><small></small></span>';
      b.querySelector('b').textContent = it.name; b.querySelector('small').textContent = it.blurb;
      const sw = b.querySelector('.sp-sw');
      if (it.sw && it.sw.length) for (const c of it.sw.slice(0, 4)) { const i = document.createElement('i'); i.style.background = String(c); sw.appendChild(i); } else sw.remove();
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.classList.contains('busy')) return;
        b.classList.add('busy');
        let r; try { r = api.set(it.id); } catch (err) { r = Promise.reject(err); }
        Promise.resolve(r).then(() => { toast && toast('🎨 סגנון: ' + it.name, 2400); }, (err) => { console.warn('[styles] set', err); toast && toast('החלפת הסגנון נכשלה'); })
          .finally(() => { b.classList.remove('busy'); render(); });
      });
      list.appendChild(b);
    }
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (!check()) return; render(); P.toggle(); });
  panel.addEventListener('click', (e) => { const b = e.target.closest('[data-act="close"]'); if (b) { e.stopPropagation(); P.hide(); } });
  check();
  if (!api) iv = setInterval(() => { if (check() || ++tries > 60) { clearInterval(iv); iv = 0; } }, 1000);
  return { check, render, panel: P, get available() { return !!api; } };
}

/* ============================================================================================ phone layout */
// Tools column → one "⋯" button on phones; 360 actions → behind a "⋯" button in the 360 panel on phones.
export function setupCompactUI({ tools, btnMore, btnPanoMore }) {
  const body = document.body;
  if (btnMore) btnMore.addEventListener('click', (e) => { e.stopPropagation(); body.classList.toggle('tools-open'); btnMore.setAttribute('aria-expanded', body.classList.contains('tools-open') ? 'true' : 'false'); });
  if (btnPanoMore) btnPanoMore.addEventListener('click', (e) => { e.stopPropagation(); body.classList.toggle('pano-more'); btnPanoMore.classList.toggle('on', body.classList.contains('pano-more')); });
  document.addEventListener('pointerdown', (e) => {
    if (body.classList.contains('tools-open') && tools && !tools.contains(e.target) && !(e.target.closest && e.target.closest('.sheet'))) body.classList.remove('tools-open');
  }, true);
  // a tool picked from the expanded phone column closes it (day/night segment and toggles stay usable)
  if (tools) tools.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b === btnMore) return;
    if (b.id === 'btnStyle') return;
    if (window.matchMedia && matchMedia('(max-width: 900px)').matches) setTimeout(() => body.classList.remove('tools-open'), 260);
  });
}

/* ============================================================================================ guards */
// iOS Safari: block pinch page-zoom (gesture* events), ctrl+wheel page zoom on desktop, and unlock WebAudio on the first
// real gesture (pointerdown / touchend / click / keydown; a 1-sample silent buffer is played inside the gesture).
export function installGuards({ audio, onFirstGesture }) {
  const pd = (e) => { if (e.cancelable) e.preventDefault(); };
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, pd, { passive: false });
  window.addEventListener('wheel', (e) => { if (e.ctrlKey && e.cancelable) e.preventDefault(); }, { passive: false });
  let fired = false, done = false;
  const EVS = ['pointerdown', 'touchend', 'mousedown', 'click', 'keydown'];
  const unlock = (e) => {
    if (done) return;
    if (e.type === 'keydown' && (e.repeat || e.key === 'Escape')) return;
    try { audio.resume(); } catch (_) {}
    let c = null; try { c = audio.muted ? null : audio.ctx; } catch (_) { c = null; }
    if (c) { try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (_) {} }
    if (!fired) { fired = true; try { onFirstGesture && onFirstGesture(e); } catch (err) { console.warn('[ui] first gesture', err); } }
    if (c && c.state === 'running') { done = true; for (const ev of EVS) window.removeEventListener(ev, unlock, true); }
  };
  for (const ev of EVS) window.addEventListener(ev, unlock, true);
  return { get unlocked() { return done; }, get gestured() { return fired; } };
}
