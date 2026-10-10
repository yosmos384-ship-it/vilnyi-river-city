// Document engine: lays a document out on A4 canvases (the browser shapes Hebrew/Cyrillic/Latin and resolves bidi,
// using the page's Google Fonts), then packs the pages into a PDF written by hand (JPEG pages, DCTDecode).
// No external library: nothing to load from a CDN, identical output in the artifact and locally.
// The PDF is image-based (text not selectable) — a deliberate trade for exact multilingual rendering.
import { I18N } from '../i18n.js?v=3.11';
import { PROJECT, TYPES, TOP_FLOOR, unitById } from '../data.js?v=3.11';
import { tcL } from './i18n-crm.js?v=3.11';
import { eurL, fmtDate } from './util.js?v=3.11';

const PT_W = 595.28, PT_H = 841.89;        // A4 in PDF points
const DPI_SCALE = 2.75;                     // ≈ 198 dpi
const M = 44;                               // page margin (pt)
const GOLD = '#b08d4e', GOLD_HI = '#d9bd84', INK = '#15130f', MUTED = '#6f6758', LINE = '#e3dccd', PAPER = '#ffffff', BAND = '#0e0c09';

const FONT = {
  latin: { body: '"Manrope","Noto Sans","DejaVu Sans",Arial,sans-serif', disp: '"Cormorant Garamond","Noto Serif","DejaVu Serif",Georgia,serif' },
  he: { body: '"Heebo","Noto Sans Hebrew","Manrope","DejaVu Sans",Arial,sans-serif', disp: '"Frank Ruhl Libre","Noto Serif Hebrew","Cormorant Garamond","DejaVu Serif",serif' },
};

let birdImg = null;
function loadBird() {
  if (birdImg) return birdImg;
  birdImg = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'assets/bird.png'; });
  return birdImg;
}
async function ensureFonts(l) {
  const f = l === 'he' ? FONT.he : FONT.latin;
  const sample = l === 'he' ? 'אבג abc 123' : l === 'ru' || l === 'uk' ? 'Абв abc 123' : 'Abc 123 ăîșț';
  try {
    await Promise.all([`400 12px ${f.body}`, `600 12px ${f.body}`, `500 12px ${f.disp}`, `600 12px ${FONT.latin.disp}`].map(s => document.fonts.load(s, sample)));
    await document.fonts.ready;
  } catch (e) { /* fall back to whatever is available */ }
}

// Localised unit label in the document's language
export function unitLabelDoc(u, l) {
  if (!u) return '';
  const fl = u.floor === 0 ? tcL(l, 'u.ground') : `${tcL(l, 'u.floor')} ${u.floor === TOP_FLOOR ? '10/10D' : u.floor}`;
  return `${tcL(l, 'u.building')} ${u.building} · ${tcL(l, 'u.stair')} ${u.stair} · ${fl} · ${tcL(l, 'u.apt')} ${u.apNo}`;
}
export function planLabelDoc(planId, l, field = 'label') {
  const k = `terms.plan.${planId}.${field}`; const p = PROJECT.terms.plans.find(x => x.id === planId);
  return I18N[l]?.[k] || I18N.en?.[k] || p?.[field]?.[l] || p?.[field]?.en || planId || '';
}

// ---------------- bidi helpers ----------------
const HEB = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
// Wrap Latin / digit runs (e.g. "C3-4-18", "€ 101,120.00", "Tamar Friedman") in LRI…PDI.
const LTR_RUN = /[A-Za-z0-9€+@\u00C0-\u024F\u0400-\u04FF][A-Za-z0-9€+@&_'’.,:/()²\-\s\u00C0-\u024F\u0400-\u04FF]*[A-Za-z0-9€²\u00C0-\u024F\u0400-\u04FF]|[A-Za-z0-9€]/g;
export function isolateLtr(s) { return String(s).replace(LTR_RUN, m => '\u2066' + m + '\u2069'); }
export function countryNameL(code, l) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return code || '';
  try { return new Intl.DisplayNames([l, 'en'], { type: 'region' }).of(code) || code; } catch (e) { return code; }
}

// ---------------- page painter ----------------
class Painter {
  constructor(l) {
    this.l = l; this.rtl = l === 'he'; this.f = this.rtl ? FONT.he : FONT.latin;
    this.pages = []; this.newPage();
  }
  newPage() {
    const c = document.createElement('canvas');
    c.width = Math.round(PT_W * DPI_SCALE); c.height = Math.round(PT_H * DPI_SCALE);
    const g = c.getContext('2d');
    g.scale(DPI_SCALE, DPI_SCALE); g.fillStyle = PAPER; g.fillRect(0, 0, PT_W, PT_H);
    g.direction = this.rtl ? 'rtl' : 'ltr'; g.textBaseline = 'alphabetic';
    this.c = c; this.g = g; this.pages.push(c); this.y = M;
    return g;
  }
  // x measured from the reading-start edge; converts for RTL
  X(x) { return this.rtl ? PT_W - x : x; }
  al(a) { if (!this.rtl) return a; return a === 'left' ? 'right' : a === 'right' ? 'left' : a; }
  font(size, w = 400, disp = false, latin = false) { this.g.font = `${w} ${size}px ${latin ? (disp ? FONT.latin.disp : FONT.latin.body) : disp ? this.f.disp : this.f.body}`; }
  text(s, x, y, { size = 9, w = 400, color = INK, align = 'left', disp = false, latin = false, max = 0, spacing = 0 } = {}) {
    const g = this.g; this.font(size, w, disp, latin); g.fillStyle = color; g.textAlign = this.al(align);
    if ('letterSpacing' in g) g.letterSpacing = spacing ? spacing + 'px' : '0px';
    let str = String(s ?? '');
    if (max && g.measureText(str).width > max) { while (str.length > 1 && g.measureText(str + '…').width > max) str = str.slice(0, -1); str += '…'; }
    // Bidi: in an RTL document a string with no Hebrew (phone, e-mail, IBAN, Latin name) is laid out LTR;
    // mixed strings keep an RTL base with each Latin/number run isolated so it is not reordered.
    const pureLtr = this.rtl && !HEB.test(str);
    g.direction = pureLtr ? 'ltr' : this.rtl ? 'rtl' : 'ltr';
    if (this.rtl && !pureLtr) str = isolateLtr(str);
    g.fillText(str, this.X(x), y);
    g.direction = this.rtl ? 'rtl' : 'ltr';
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }
  wrap(s, maxW, size = 9, w = 400) {
    this.font(size, w); const out = [];
    for (const para of String(s ?? '').split('\n')) {
      const words = para.split(/\s+/); let line = '';
      for (const wd of words) {
        const t = line ? line + ' ' + wd : wd;
        if (this.g.measureText(t).width > maxW && line) { out.push(line); line = wd; } else line = t;
      }
      out.push(line);
    }
    return out;
  }
  para(s, x, maxW, { size = 9, w = 400, color = INK, lh = 1.45 } = {}) {
    const lines = this.wrap(s, maxW, size, w);
    for (const ln of lines) { this.ensure(size * lh); this.text(ln, x, this.y + size, { size, w, color }); this.y += size * lh; }
  }
  rule(x0, x1, y, color = LINE, wdt = 0.6) { const g = this.g; g.strokeStyle = color; g.lineWidth = wdt; g.beginPath(); g.moveTo(this.X(x0), y); g.lineTo(this.X(x1), y); g.stroke(); }
  rect(x, y, w, h, fill, stroke) { const g = this.g; const X = this.rtl ? PT_W - x - w : x; if (fill) { g.fillStyle = fill; g.fillRect(X, y, w, h); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.6; g.strokeRect(X, y, w, h); } }
  ensure(h) { if (this.y + h > PT_H - 92) { this.newPage(); this.onNewPage?.(); } }
}

// ---------------- document layout ----------------
// snap: the stored document snapshot (see documents.js buildSnapshot)
export async function renderDocument(snap) {
  const l = snap.lang || 'en'; const T = (k, v) => tcL(l, k, v);
  await ensureFonts(l); const bird = await loadBird();
  const P = new Painter(l); const W = PT_W - 2 * M; const money = n => eurL(n, l);
  const ent = snap.entity || {}; const isVoid = snap.status === 'void';

  const header = (full) => {
    const g = P.g; const bandH = full ? 104 : 46;
    g.fillStyle = BAND; g.fillRect(0, 0, PT_W, bandH);
    const grad = g.createLinearGradient(0, 0, PT_W, 0); grad.addColorStop(0, '#f0dba6'); grad.addColorStop(.45, '#cfae6d'); grad.addColorStop(1, '#a88449');
    g.fillStyle = grad; g.fillRect(0, bandH, PT_W, 1.6);
    if (bird && full) { const h = 40, w = h * bird.width / bird.height; g.drawImage(bird, P.rtl ? PT_W - M - w : M, 26, w, h); }
    const wx = full ? M + 56 : M;
    // wordmark stays Latin/LTR in every language
    g.save(); g.direction = 'ltr';
    const wmX = P.rtl ? PT_W - wx : wx;
    g.font = `600 ${full ? 19 : 12}px ${FONT.latin.disp}`; g.fillStyle = GOLD_HI; g.textAlign = P.rtl ? 'right' : 'left';
    if ('letterSpacing' in g) g.letterSpacing = full ? '3.2px' : '2px';
    g.fillText('VILNYI', wmX, full ? 47 : 29);
    if (full) { g.font = `500 9px ${FONT.latin.body}`; if ('letterSpacing' in g) g.letterSpacing = '4px'; g.fillStyle = '#cbbd9f'; g.fillText('RIVER CITY', wmX, 64); }
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.restore();
    // title block at the far side
    P.text(T('d.title.' + snap.type), PT_W - M, full ? 46 : 29, { size: full ? 17 : 11, w: 500, color: '#f3ede1', align: 'right', disp: true });
    if (full) {
      P.text(`${T('d.no')} ${snap.number}`, PT_W - M, 64, { size: 9.5, w: 600, color: GOLD_HI, align: 'right' });
      P.text(`${T('d.date')}: ${fmtDate(snap.date, l)}`, PT_W - M, 78, { size: 8.5, color: '#cbbd9f', align: 'right' });
      if (snap.dueDate && (snap.type === 'proforma' || snap.type === 'quote')) P.text(`${T(snap.type === 'quote' ? 'd.validUntil' : 'd.due')}: ${fmtDate(snap.dueDate, l)}`, PT_W - M, 90, { size: 8.5, color: '#cbbd9f', align: 'right' });
    } else {
      P.text(snap.number, M + 60, 29, { size: 8.5, w: 600, color: GOLD_HI });
    }
    P.y = bandH + (full ? 16 : 18);
  };
  header(true);
  P.onNewPage = () => header(false);

  // Ribbon: pro-forma / internal notice
  P.rect(M, P.y, W, 20, '#f7f1e4');
  P.text(T(snap.type === 'receipt' ? 'd.ribbon.receipt' : 'd.ribbon'), M + 10, P.y + 13.5, { size: 7.6, w: 600, color: '#7a5f2c', spacing: 0.6, max: W - 20 });
  P.y += 32;
  if (isVoid) { const g = P.g; g.save(); g.translate(PT_W / 2, PT_H / 2); g.rotate(-0.5); g.font = `700 90px ${FONT.latin.body}`; g.fillStyle = 'rgba(190,40,40,.12)'; g.textAlign = 'center'; g.fillText('VOID', 0, 30); g.restore(); }

  // Issuer | Client
  const colW = (W - 24) / 2; const y0 = P.y;
  const block = (x, title, lines) => {
    let y = y0; P.text(title.toUpperCase(), x, y + 8, { size: 7.2, w: 600, color: GOLD, spacing: 1 }); y += 16;
    lines.filter(Boolean).forEach((ln, i) => { const ls = P.wrap(ln, colW, i ? 8.6 : 10.5, i ? 400 : 600); ls.forEach(s => { P.text(s, x, y + (i ? 9 : 11), { size: i ? 8.6 : 10.5, w: i ? 400 : 600, color: i ? '#3b362d' : INK }); y += i ? 12.5 : 15; }); });
    return y;
  };
  const addr = [ent.address, [ent.city, ent.country].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const yA = block(M, T('d.issuer'), [ent.name, addr, ent.regNo && `${T('d.regNo')}: ${ent.regNo}`, ent.taxId && `${T('d.taxId')}: ${ent.taxId}`, ent.vatNo && `${T('d.vatNo')}: ${ent.vatNo}`, ent.email, ent.phone]);
  const cl = snap.client || {};
  const yB = block(M + colW + 24, T(snap.type === 'receipt' ? 'd.receivedFrom' : 'd.billTo'), [cl.name, cl.address, countryNameL(cl.country, l), cl.taxId && `${T('d.taxId')}: ${cl.taxId}`, cl.email, cl.phone]);
  P.y = Math.max(yA, yB) + 12;

  // Property box
  const u = snap.unit ? unitById(snap.unit.id) : null;
  if (snap.unit) {
    P.ensure(66);
    const bx = P.y; P.rect(M, bx, W, 58, '#faf7f0', LINE);
    P.text(T('d.property').toUpperCase(), M + 12, bx + 15, { size: 7.2, w: 600, color: GOLD, spacing: 1 });
    P.text(`VILNYI RIVER CITY — ${u ? unitLabelDoc(u, l) : snap.unit.id}`, M + 12, bx + 31, { size: 10, w: 600, max: W - 24 });
    const Ty = u ? TYPES[u.type] : null;
    const facts = [snap.unit.id, Ty ? `${Ty.rooms} ${T(Ty.rooms === 1 ? 'd.room' : 'd.rooms')} · ${Ty.total.toFixed(2)} m²` : '', snap.dealPrice ? `${T('d.price')}: ${money(snap.dealPrice)}` : '', snap.planId ? `${T('d.plan')}: ${planLabelDoc(snap.planId, l)}` : ''].filter(Boolean).join('   ·   ');
    P.text(facts, M + 12, bx + 46, { size: 8.3, color: MUTED, max: W - 24 });
    P.text('Str. Murelor nr. 1C, Sector 6, București', PT_W - M - 12, bx + 15, { size: 7.4, color: MUTED, align: 'right', latin: true });
    P.y = bx + 72;
  }

  if (snap.type === 'receipt') {
    // Big amount card
    P.ensure(100);
    const by = P.y; P.rect(M, by, W, 84, BAND);
    P.text(T('d.sumOf').toUpperCase(), M + 16, by + 22, { size: 7.4, w: 600, color: GOLD_HI, spacing: 1 });
    P.text(money(snap.total), M + 16, by + 58, { size: 28, w: 500, color: '#f3ede1', disp: true, latin: true });
    const pmx = PT_W - M - 16;
    P.text(`${T('d.payDate')}: ${fmtDate(snap.payment?.date || snap.date, l)}`, pmx, by + 26, { size: 8.6, color: '#d9cfbb', align: 'right' });
    P.text(`${T('d.method')}: ${T('pm.' + (snap.payment?.method || 'bank'))}`, pmx, by + 42, { size: 8.6, color: '#d9cfbb', align: 'right' });
    if (snap.payment?.ref) P.text(`${T('d.reference')}: ${snap.payment.ref}`, pmx, by + 58, { size: 8.6, color: '#d9cfbb', align: 'right', max: W / 2 });
    P.y = by + 100;
    P.para(T('d.receiptText', { name: cl.name || '', amount: money(snap.total), purpose: snap.lines?.[0]?.desc || '' }), M, W, { size: 9.2, color: '#2c2821' });
    P.y += 8;
  }

  // Line items
  if (snap.type !== 'receipt' && (snap.lines || []).length) {
    const cx = { desc: M + 8, qty: M + W * 0.62, price: M + W * 0.8, amt: M + W - 8 };
    const head = () => {
      P.ensure(26); P.rect(M, P.y, W, 20, '#15130f');
      const hy = P.y + 13.5;
      P.text(T('d.desc'), cx.desc, hy, { size: 7.6, w: 600, color: GOLD_HI, spacing: .4 });
      P.text(T('d.qty'), cx.qty, hy, { size: 7.6, w: 600, color: GOLD_HI, align: 'right' });
      P.text(T('d.unitPrice'), cx.price, hy, { size: 7.6, w: 600, color: GOLD_HI, align: 'right' });
      P.text(T('d.amount'), cx.amt, hy, { size: 7.6, w: 600, color: GOLD_HI, align: 'right' });
      P.y += 20;
    };
    head();
    for (const ln of snap.lines) {
      const ls = P.wrap(ln.desc, W * 0.5, 8.8);
      const h = Math.max(22, ls.length * 12 + 10);
      if (P.y + h > PT_H - 92) { P.newPage(); header(false); head(); }
      ls.forEach((s, i) => P.text(s, cx.desc, P.y + 14 + i * 12, { size: 8.8, w: i ? 400 : 500 }));
      P.text(String(ln.qty ?? 1), cx.qty, P.y + 14, { size: 8.8, align: 'right' });
      P.text(money(ln.price), cx.price, P.y + 14, { size: 8.8, align: 'right' });
      P.text(money((ln.qty ?? 1) * ln.price), cx.amt, P.y + 14, { size: 8.8, w: 600, align: 'right' });
      P.y += h; P.rule(M, M + W, P.y);
    }
    // totals
    P.ensure(80); P.y += 10;
    const tx = M + W * 0.58, vx = M + W - 8;
    const trow = (k, v, strong) => { P.text(k, tx, P.y + 11, { size: strong ? 10 : 8.8, w: strong ? 600 : 400, color: strong ? INK : '#3b362d' }); P.text(v, vx, P.y + 11, { size: strong ? 11 : 8.8, w: 600, align: 'right', color: strong ? INK : '#3b362d' }); P.y += strong ? 20 : 15; };
    trow(T('d.subtotal'), money(snap.subtotal));
    trow(snap.vatRate ? `${T('d.vat')} ${snap.vatRate}%` : T('d.vat0'), money(snap.vat));
    P.rule(tx, M + W, P.y + 2, GOLD, 1); P.y += 6;
    trow(T(snap.type === 'credit' ? 'd.totalCredit' : 'd.total'), money(snap.total), true);
    if (snap.vatNote) { P.y += 2; P.para(snap.vatNote, tx, W * 0.42, { size: 7.4, color: MUTED }); }
    P.y += 10;
  }

  // Reservation: payment schedule and terms
  if (snap.type === 'reservation' && (snap.schedule || []).length) {
    P.ensure(60);
    P.text(T('d.schedule').toUpperCase(), M, P.y + 9, { size: 7.4, w: 600, color: GOLD, spacing: 1 }); P.y += 18;
    for (const r of snap.schedule) {
      P.ensure(18);
      P.text(`${T('ik.' + r.kind)}${r.part ? ' ' + r.part : ''}`, M + 4, P.y + 11, { size: 8.8 });
      P.text(fmtDate(r.due, l), M + W * 0.55, P.y + 11, { size: 8.8, color: MUTED, align: 'right' });
      P.text(money(r.amount), M + W - 4, P.y + 11, { size: 8.8, w: 600, align: 'right' });
      P.y += 17; P.rule(M, M + W, P.y);
    }
    P.y += 12;
    const desc = planLabelDoc(snap.planId, l, 'desc'); if (desc) P.para(desc, M, W, { size: 8.4, color: '#3b362d' });
    const contract = I18N[l]?.['terms.contract.text'] || PROJECT.terms.contract?.[l] || PROJECT.terms.contract?.en; if (contract) { P.y += 4; P.para(contract, M, W, { size: 8.4, color: '#3b362d' }); }
    P.y += 8;
  }
  if (snap.type === 'credit' && snap.refNumber) { P.para(T('d.creditFor', { n: snap.refNumber }), M, W, { size: 8.8, color: '#3b362d' }); P.y += 6; }

  // Payment instructions (not on receipts / credit notes)
  if (snap.type === 'proforma' || snap.type === 'reservation' || snap.type === 'quote') {
    P.ensure(90);
    P.text(T('d.payInstr').toUpperCase(), M, P.y + 9, { size: 7.4, w: 600, color: GOLD, spacing: 1 }); P.y += 18;
    const hasBank = !!(ent.iban);
    if (hasBank) {
      [['d.beneficiary', ent.beneficiary || ent.name], ['IBAN', ent.iban], ['BIC / SWIFT', ent.bic], ['d.bank', ent.bank]].filter(r => r[1]).forEach(([k, v]) => {
        P.text(k.startsWith('d.') ? T(k) : k, M + 4, P.y + 10, { size: 8.4, color: MUTED });
        P.text(v, M + 130, P.y + 10, { size: 8.8, w: 600, latin: true }); P.y += 14;
      });
    } else P.para(T('d.bankPending'), M + 4, W - 8, { size: 8.6, color: '#7a5f2c' });
    if (snap.payRef) { P.text(`${T('d.reference')}: ${snap.payRef}`, M + 4, P.y + 11, { size: 9, w: 600 }); P.y += 18; }
  }

  if (snap.notes) { P.ensure(40); P.y += 4; P.text(T('d.notes').toUpperCase(), M, P.y + 9, { size: 7.4, w: 600, color: GOLD, spacing: 1 }); P.y += 16; P.para(snap.notes, M, W, { size: 8.6, color: '#3b362d' }); }

  // Signature line
  P.ensure(60); P.y += 26;
  P.rule(M + W - 180, M + W, P.y, '#b9ae98');
  P.text(ent.name || '', M + W, P.y + 12, { size: 8, color: MUTED, align: 'right' });

  // footers on all pages
  P.pages.forEach((c, i) => {
    const g = c.getContext('2d'); P.g = g; P.c = c;
    const fy = PT_H - 70;
    P.rule(M, PT_W - M, fy, LINE);
    const lines = P.wrap(T('d.disclaimer'), W - 70, 6.6);
    lines.slice(0, 4).forEach((s, k) => P.text(s, M, fy + 12 + k * 9, { size: 6.6, color: MUTED }));
    P.text(`${i + 1} / ${P.pages.length}`, PT_W - M, fy + 12, { size: 7, color: MUTED, align: 'right', latin: true });
    const foot = [ent.name, ent.regNo, ent.footer].filter(Boolean).join(' · ');
    if (foot) P.text(foot, M, PT_H - 18, { size: 6.6, color: '#9a917f', max: W });
  });
  return P.pages;
}

// ---------------- minimal PDF writer (JPEG pages) ----------------
function canvasJpeg(c, q = 0.9) {
  return new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/jpeg', q));
}
function pdfEsc(s) { return String(s).replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, '?'); }
export async function pagesToPdf(pages, { title = 'Document', author = 'VILNYI RIVER CITY CRM' } = {}) {
  const enc = new TextEncoder(); const parts = []; let len = 0; const offs = [];
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\xE2\xE3\xCF\xD3]/g, '~'));
  const jpgs = []; for (const c of pages) jpgs.push({ bytes: await canvasJpeg(c), w: c.width, h: c.height });
  const n = pages.length; const pageIds = [], imgIds = [], cntIds = []; let next = 4;
  for (let i = 0; i < n; i++) { pageIds.push(next++); imgIds.push(next++); cntIds.push(next++); }
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${n} >>`));
  const now = new Date(); const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  obj(3, () => push(`<< /Title (${pdfEsc(title)}) /Author (${pdfEsc(author)}) /Producer (VRC CRM) /CreationDate (D:${d}Z) >>`));
  for (let i = 0; i < n; i++) {
    const j = jpgs[i]; const content = `q ${PT_W} 0 0 ${PT_H} 0 0 cm /Im${i} Do Q`;
    obj(pageIds[i], () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] /Resources << /XObject << /Im${i} ${imgIds[i]} 0 R >> >> /Contents ${cntIds[i]} 0 R >>`));
    obj(imgIds[i], () => { push(`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.bytes.length} >>\nstream\n`); push(j.bytes); push('\nendstream'); });
    obj(cntIds[i], () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  }
  const xref = len; const count = next;
  let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(x); push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function documentPdf(snap) {
  const pages = await renderDocument(snap);
  const bytes = await pagesToPdf(pages, { title: `${snap.number} ${snap.client?.name || ''}` });
  return { bytes, pages };
}
