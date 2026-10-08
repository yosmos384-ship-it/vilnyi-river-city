// Dashboard: KPIs, inventory, lead flow, cash-flow, funnel, upcoming tasks & instalments, recent activity.
import { UNITS, PROJECT } from '../data.js?v=3.6';
import { tc } from './i18n-crm.js?v=3.6';
import { entries, unitState, dealFinance, activeDeals, STAGES, clientName, get, all } from './store.js?v=3.6';
import { esc, eur, nf, fmtDate, relDays, today, icon, addDays } from './util.js?v=3.6';
import { pageHead, kpi, empty } from './ui.js?v=3.6';
import { columns, stackRows, hbars, legend, bindTips, STATUS_COLORS, SERIES } from './charts.js?v=3.6';

export function render(root) {
  const counts = { C3: { available: 0, reserved: 0, sold: 0, blocked: 0 }, C4: { available: 0, reserved: 0, sold: 0, blocked: 0 } };
  for (const u of UNITS) counts[u.building][unitState(u.id).status]++;
  const tot = k => counts.C3[k] + counts.C4[k];
  const deals = activeDeals(); const fin = deals.map(d => ({ d, f: dealFinance(d) }));
  const collected = fin.reduce((s, x) => s + x.f.paid, 0);
  const deposits = fin.reduce((s, x) => s + Math.min(x.f.paid, x.f.rows.find(r => r.kind === 'deposit')?.amount || 0), 0);
  const pipeline = fin.reduce((s, x) => s + x.f.price, 0);
  const outstanding = fin.reduce((s, x) => s + x.f.balance, 0);
  const overdue = fin.reduce((s, x) => s + x.f.overdueAmount, 0);
  const clients = entries('clients'); const live = clients.filter(c => c.stage !== 'lost');
  const won = live.filter(c => STAGES.indexOf(c.stage) >= STAGES.indexOf('reserved')).length;
  const conv = live.length ? won / live.length * 100 : 0;
  const soldValue = UNITS.filter(u => unitState(u.id).status === 'sold').reduce((s, u) => s + u.price, 0);

  // leads per week (12 weeks)
  const weeks = []; const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - 7 * 11);
  for (let i = 0; i < 12; i++) { const a = new Date(start.getTime() + i * 7 * 86400000); weeks.push({ a, b: new Date(a.getTime() + 7 * 86400000), n: 0 }); }
  clients.forEach(c => { const t = new Date(c.createdAt || 0).getTime(); const w = weeks.find(w => t >= w.a.getTime() && t < w.b.getTime()); if (w) w.n++; });
  const wkData = weeks.map(w => ({ label: fmtDate(w.a.toISOString().slice(0, 10)).replace(/\s?\d{4}$/, '').replace(/[,.]$/, ''), values: [w.n], tip: `${tc('dash.weekOf')} ${fmtDate(w.a.toISOString().slice(0, 10))}: ${w.n}` }));

  // cash: received per month (past 6) and scheduled open (next 6)
  const months = []; const m0 = new Date(); m0.setUTCDate(1);
  for (let i = -5; i <= 6; i++) { const d = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + i, 1)); months.push({ key: d.toISOString().slice(0, 7), rec: 0, due: 0 }); }
  const mm = k => months.find(m => m.key === k);
  entries('deals').forEach(d => (d.payments || []).forEach(p => { const m = mm(String(p.date).slice(0, 7)); if (m) m.rec += (Number(p.amount) || 0) * (p.kind === 'refund' ? -1 : 1); }));
  fin.forEach(({ f }) => f.rows.forEach(r => { if (r.open > 0) { const k = String(r.due).slice(0, 7) < months[6].key ? months[5].key : String(r.due).slice(0, 7); const m = mm(k); if (m) m.due += r.open; } }));
  const monthLabel = k => { try { return new Date(k + '-15').toLocaleDateString(document.documentElement.lang, { month: 'short' }); } catch (e) { return k; } };
  const cash = months.map(m => ({ label: monthLabel(m.key), values: [m.rec, m.due], tip: `${m.key} · ${tc('dash.received')}: ${eur(m.rec)} · ${tc('dash.scheduled')}: ${eur(m.due)}` }));
  const kfmt = (v, axis) => axis ? (v >= 1e6 ? nf(v / 1e6, 1) + 'M' : v >= 1e3 ? nf(v / 1e3) + 'k' : nf(v)) : eur(v);

  // tasks & instalments
  const tasks = entries('tasks').filter(t => !t.done && t.due && relDays(t.due) <= 7).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8);
  const inst = fin.flatMap(({ d, f }) => f.rows.filter(r => r.open > 0 && r.due <= addDays(today(), 30)).map(r => ({ d, r }))).sort((a, b) => a.r.due.localeCompare(b.r.due)).slice(0, 8);
  const acts = clients.flatMap(c => (c.timeline || []).slice(0, 6).map(e => ({ c, e }))).sort((a, b) => String(b.e.at).localeCompare(String(a.e.at))).slice(0, 8);

  const stR = k => ({ key: k, value: 0, color: STATUS_COLORS[k], label: tc('st.' + k) });
  root.innerHTML = `${pageHead(tc('nav.dashboard'), esc(tc('dash.sub', { n: UNITS.length })), `<a class="btn ghost sm" href="#/units">${icon('building')}${esc(tc('dash.openUnits'))}</a>`)}
  <section class="kpis">
    ${kpi(tc('st.available'), nf(tot('available')), `${nf(tot('available') / UNITS.length * 100, 0)}% ${esc(tc('dash.ofUnits'))}`, 'building')}
    ${kpi(tc('st.reserved'), nf(tot('reserved')), esc(tc('dash.blockedN', { n: tot('blocked') })), 'clock')}
    ${kpi(tc('st.sold'), nf(tot('sold')), eur(soldValue), 'star')}
    ${kpi(tc('dash.deposits'), eur(deposits), esc(tc('dash.collected', { v: eur(collected) })), 'euro')}
    ${kpi(tc('dash.pipeline'), eur(pipeline), esc(tc('dash.outstanding', { v: eur(outstanding) })), 'deal')}
    ${kpi(tc('dash.conversion'), nf(conv, 1) + '%', esc(tc('dash.convSub', { a: won, b: live.length })), 'bolt')}
    ${overdue > 0 ? kpi(tc('dash.overdue'), eur(overdue), esc(tc('dash.overdueSub')), 'alert', 'bad') : ''}
  </section>
  <section class="grid2">
    <div class="card"><div class="card-h"><h2>${esc(tc('dash.inventory'))}</h2>${legend(['available', 'reserved', 'sold', 'blocked'].map(k => ({ name: `${tc('st.' + k)} ${tot(k)}`, color: STATUS_COLORS[k] })))}</div>
      ${stackRows(['C3', 'C4'].map(b => ({ label: `${tc('u.building')} ${b}`, parts: ['available', 'reserved', 'sold', 'blocked'].map(k => ({ ...stR(k), value: counts[b][k] })) })))}
      <table class="mini-t"><thead><tr><th></th>${['available', 'reserved', 'sold', 'blocked'].map(k => `<th>${esc(tc('st.' + k))}</th>`).join('')}</tr></thead><tbody>${['C3', 'C4'].map(b => `<tr><th>${b}</th>${['available', 'reserved', 'sold', 'blocked'].map(k => `<td>${counts[b][k]}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div>
    <div class="card"><div class="card-h"><h2>${esc(tc('dash.funnel'))}</h2></div>
      ${hbars(STAGES.map(s => ({ label: tc('stage.' + s), value: clients.filter(c => c.stage === s).length })))}
    </div>
    <div class="card"><div class="card-h"><h2>${esc(tc('dash.leadsWeekly'))}</h2><span class="muted sm">${esc(tc('dash.last12'))}</span></div>
      ${columns({ data: wkData, series: [{ name: tc('dash.newLeads'), color: SERIES[0] }], ariaLabel: tc('dash.leadsWeekly') })}</div>
    <div class="card"><div class="card-h"><h2>${esc(tc('dash.cash'))}</h2>${legend([{ name: tc('dash.received'), color: SERIES[0] }, { name: tc('dash.scheduled'), color: SERIES[1], outline: true }])}</div>
      ${columns({ data: cash, series: [{ name: tc('dash.received'), color: SERIES[0] }, { name: tc('dash.scheduled'), color: SERIES[1], outline: true }], fmt: kfmt, ariaLabel: tc('dash.cash') })}</div>
  </section>
  <section class="grid3">
    <div class="card"><div class="card-h"><h2>${esc(tc('dash.tasks'))}</h2><a href="#/tasks" class="lnk">${esc(tc('all'))}</a></div>
      ${tasks.length ? `<ul class="rows">${tasks.map(t => { const dd = relDays(t.due); const c = t.clientId && get('clients', t.clientId); return `<li class="${dd < 0 ? 'late' : ''}"><span class="dot"></span><div><b>${esc(t.title)}</b><small>${c ? esc(clientName(c)) + ' · ' : ''}${esc(dd < 0 ? tc('overdueDays', { n: -dd }) : dd === 0 ? tc('todayW') : fmtDate(t.due))}</small></div></li>`; }).join('')}</ul>` : empty(tc('dash.noTasks'))}</div>
    <div class="card"><div class="card-h"><h2>${esc(tc('dash.instalments'))}</h2><a href="#/deals" class="lnk">${esc(tc('all'))}</a></div>
      ${inst.length ? `<ul class="rows">${inst.map(({ d, r }) => { const c = get('clients', d.clientId); const dd = relDays(r.due); return `<li class="${dd < 0 ? 'late' : ''}"><span class="dot"></span><div><a href="#/deal/${encodeURIComponent(d.id)}"><b>${esc(clientName(c))}</b></a><small><span dir="ltr">${esc(d.unitId)}</span> · ${esc(tc('ik.' + r.kind))} · ${esc(dd < 0 ? tc('overdueDays', { n: -dd }) : fmtDate(r.due))}</small></div><b class="amt">${eur(r.open)}</b></li>`; }).join('')}</ul>` : empty(tc('dash.noInst'))}</div>
    <div class="card"><div class="card-h"><h2>${esc(tc('dash.activity'))}</h2></div>
      ${acts.length ? `<ul class="rows">${acts.map(({ c, e }) => `<li><span class="dot g"></span><div><a href="#/client/${encodeURIComponent(c.id)}"><b>${esc(clientName(c))}</b></a><small>${esc(tc('ev.' + (e.type || 'note')))} · ${esc(fmtDate(e.at))}</small></div></li>`).join('')}</ul>` : empty(tc('dash.noAct'))}</div>
  </section>`;
  bindTips(root);
  void PROJECT; void all;
}
