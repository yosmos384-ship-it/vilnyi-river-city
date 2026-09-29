// Plain-SVG charts with a shared hover/focus tooltip. Single y-axis only; thin marks; recessive grid.
import { esc } from './util.js';

export const STATUS_COLORS = { available: '#2f9e74', reserved: '#b68a24', sold: '#7a84d8', blocked: '#d45a3c' };  // validated (dark surface)
export const SERIES = ['#c9a96a', '#7a84d8'];

// Column chart. data: [{label, values:[v1,v2?], tip}] ; series: [{name,color,outline?}]
export function columns({ data, series, height = 180, fmt = v => v, ariaLabel = '' }) {
  const W = 560, H = height, pl = 44, pr = 8, pt = 10, pb = 26;
  const max = Math.max(1, ...data.flatMap(d => d.values.map(v => v || 0)));
  const nice = niceMax(max); const iw = W - pl - pr, ih = H - pt - pb;
  const bw = iw / data.length; const k = series.length; const barW = Math.max(4, Math.min(26, (bw - 8) / k - 2));
  const ticks = [0, .5, 1].map(f => f * nice);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">`;
  for (const t of ticks) { const y = pt + ih - ih * t / nice; s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="grid"/><text x="${pl - 6}" y="${y + 3.5}" class="ax" text-anchor="end">${esc(fmt(t, true))}</text>`; }
  data.forEach((d, i) => {
    const x0 = pl + i * bw + (bw - (barW + 2) * k + 2) / 2;
    d.values.forEach((v, j) => {
      const h = ih * (v || 0) / nice; const x = x0 + j * (barW + 2), y = pt + ih - h; const c = series[j].color;
      if (h > 0) s += `<path d="${roundTop(x, y, barW, h, Math.min(4, barW / 2, h))}" fill="${series[j].outline ? 'none' : c}" stroke="${c}" stroke-width="${series[j].outline ? 1.4 : 0}" ${series[j].outline ? 'stroke-dasharray="3 2"' : ''}/>`;
    });
    s += `<rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${ih}" fill="transparent" class="hit" tabindex="0" data-tip="${esc(d.tip || `${d.label}: ${d.values.map(fmt).join(' / ')}`)}"/>`;
    if (data.length <= 14 || i % 2 === 0) s += `<text x="${pl + i * bw + bw / 2}" y="${H - 8}" class="ax" text-anchor="middle">${esc(d.label)}</text>`;
  });
  s += `<line x1="${pl}" x2="${W - pr}" y1="${pt + ih}" y2="${pt + ih}" class="base"/></svg>`;
  return s;
}
function roundTop(x, y, w, h, r) { return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

// Horizontal stacked bar (one row per item): rows [{label, parts:[{key,value,color,label}]}]
export function stackRows(rows, { total } = {}) {
  return `<div class="stack-rows">${rows.map(r => {
    const T = total || r.parts.reduce((s, p) => s + p.value, 0) || 1;
    return `<div class="sr"><span class="sr-l">${esc(r.label)}</span><div class="sr-bar">${r.parts.filter(p => p.value > 0).map(p => `<span class="seg" style="flex:${p.value} 0 0;background:${p.color}" tabindex="0" data-tip="${esc(`${r.label} · ${p.label}: ${p.value} (${Math.round(p.value / T * 100)}%)`)}"></span>`).join('')}</div></div>`;
  }).join('')}</div>`;
}

// Horizontal bars (single series) — funnel style
export function hbars(rows, { fmt = v => v, color = '#c9a96a' } = {}) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<div class="hbars">${rows.map(r => `<div class="hb" tabindex="0" data-tip="${esc(r.tip || `${r.label}: ${fmt(r.value)}`)}"><span class="hb-l">${esc(r.label)}</span><span class="hb-t"><i style="width:${Math.max(r.value ? 2 : 0, r.value / max * 100)}%;background:${r.color || color}"></i></span><b>${esc(fmt(r.value))}</b></div>`).join('')}</div>`;
}

export const legend = (items) => `<div class="legend">${items.map(i => `<span><i style="${i.outline ? `border:1.4px dashed ${i.color}` : `background:${i.color}`}"></i>${esc(i.name)}</span>`).join('')}</div>`;

// Shared tooltip (one per page)
let tipEl = null;
export function bindTips(root) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true; document.body.appendChild(tipEl); }
  const show = (el, x, y) => { tipEl.textContent = el.dataset.tip; tipEl.hidden = false; const r = tipEl.getBoundingClientRect(); tipEl.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px'; tipEl.style.top = Math.max(8, y - r.height - 12) + 'px'; el.classList.add('hov'); };
  const hide = (el) => { tipEl.hidden = true; el?.classList.remove('hov'); };
  root.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('pointermove', e => show(el, e.clientX, e.clientY));
    el.addEventListener('pointerleave', () => hide(el));
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); });
    el.addEventListener('blur', () => hide(el));
  });
}
