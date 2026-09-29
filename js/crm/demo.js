// LOCAL DEMO MODE ONLY: seeds fictional sample data so the CRM can be evaluated outside claude.ai.
// Never runs in the artifact runtime (store.mode === 'artifact').
import { UNITS, PROJECT } from '../data.js';
import { S, setDoc, buildSchedule, all } from './store.js';
import { uid, addDays, addMonths, today } from './util.js';

const PEOPLE = [
  ['Avi', 'Cohen', 'he', 'IL', '+972 52 000 0001'], ['Noa', 'Levi', 'he', 'IL', '+972 54 000 0002'], ['Daniel', 'Mizrahi', 'he', 'IL', '+972 50 000 0003'],
  ['Maya', 'Peretz', 'he', 'IL', '+972 53 000 0004'], ['Ion', 'Popescu', 'ro', 'RO', '+40 721 000 005'], ['Elena', 'Ionescu', 'ro', 'RO', '+40 722 000 006'],
  ['Oleksandr', 'Kovalenko', 'uk', 'UA', '+380 67 000 0007'], ['Irina', 'Smirnova', 'ru', 'MD', '+373 69 000 008'], ['Julien', 'Moreau', 'fr', 'FR', '+33 6 00 00 00 09'],
  ['Giulia', 'Romano', 'it', 'IT', '+39 320 000 0010'], ['Lukas', 'Schneider', 'de', 'DE', '+49 151 0000011'], ['Tamar', 'Friedman', 'he', 'IL', '+972 58 000 0012'],
  ['Yael', 'Katz', 'he', 'IL', '+972 52 000 0013'], ['Sergiy', 'Bondarenko', 'uk', 'UA', '+380 50 000 0014'], ['Emma', 'Clarke', 'en', 'GB', '+44 7700 900015'],
];
const STAGE_OF = ['lead', 'contacted', 'viewing', 'reserved', 'deposit', 'signed', 'paid60', 'contacted', 'viewing', 'lead', 'deposit', 'signed', 'lead', 'reserved', 'lost'];

export async function seedDemo() {
  if (S.mode !== 'local') return;
  const snap = await S.db.collection('clients').get();
  if (!snap.empty) return;
  const now = Date.now();
  const pickUnits = UNITS.filter(u => u.floor >= 3 && u.floor <= 9);
  for (let i = 0; i < PEOPLE.length; i++) {
    const [fn, ln, lg, co, ph] = PEOPLE[i]; const id = 'demo' + (i + 1);
    const stage = STAGE_OF[i]; const created = new Date(now - (90 - i * 6) * 86400000).toISOString();
    const unit = ['reserved', 'deposit', 'signed', 'paid60'].includes(stage) ? pickUnits[(i * 37) % pickUnits.length] : (i % 3 === 0 ? pickUnits[(i * 53) % pickUnits.length] : null);
    const tl = [
      { id: uid('t'), type: 'web', at: created, text: 'Web lead · ' + (unit?.id || 'general enquiry') },
      { id: uid('t'), type: 'call', at: new Date(now - (60 - i * 3) * 86400000).toISOString(), text: 'Intro call — interested in a 2-room unit facing the lake, budget ~€150k.' },
    ];
    if (['viewing', 'reserved', 'deposit', 'signed', 'paid60'].includes(stage)) tl.unshift({ id: uid('t'), type: 'meeting', at: new Date(now - (40 - i) * 86400000).toISOString(), text: '3D tour on Zoom, walked through floor plan and balcony view.' });
    await setDoc('clients', id, {
      firstName: fn, lastName: ln, name: `${fn} ${ln}`, email: `${fn}.${ln}`.toLowerCase() + '@example.com', phone: ph, country: co, lang: lg,
      stage, source: i % 4 === 0 ? 'referral' : 'website', tags: i % 5 === 0 ? ['investor'] : [], unitIds: unit ? [unit.id] : [], timeline: tl, createdAt: created, lastActivity: tl[0].at, demo: true,
    });
    if (unit && ['reserved', 'deposit', 'signed', 'paid60'].includes(stage)) {
      const dealId = 'd' + id; const start = addDays(today(), -(70 - i * 4));
      const planId = ['standard', 'mortgage', 'standard', 'zero'][i % 4];
      const schedule = buildSchedule(unit.price, planId, start, { split: i % 2 ? 3 : 1 });
      const payments = [];
      if (stage !== 'reserved') payments.push({ id: uid('p'), date: addDays(start, 2), amount: PROJECT.terms.reservationDeposit, method: 'bank', ref: `${unit.id}-${ln.toUpperCase()}`, kind: 'payment' });
      if (stage === 'signed' || stage === 'paid60') payments.push({ id: uid('p'), date: addDays(start, 35), amount: Math.round(unit.price * 0.3), method: 'bank', ref: 'SWIFT', kind: 'payment' });
      if (stage === 'paid60') payments.push({ id: uid('p'), date: addDays(start, 60), amount: Math.round(unit.price * 0.6 - PROJECT.terms.reservationDeposit - unit.price * 0.3), method: 'bank', ref: 'SWIFT', kind: 'payment' });
      await setDoc('deals', dealId, { clientId: id, unitId: unit.id, price: unit.price, discount: i === 5 ? 3000 : 0, planId, entity: i % 2 ? 'pt' : 'cy', status: 'active', schedule, payments, createdAt: new Date(start + 'T10:00:00Z').toISOString(), resNo: 'VRC-DEMO-' + (i + 1), demo: true });
      await setDoc('units', unit.id, { status: stage === 'signed' || stage === 'paid60' ? 'sold' : 'reserved', clientId: id, dealId });
    }
  }
  // a few blocked units (developer hold) and some tasks
  for (const u of UNITS.filter(u => u.floor === 1 && u.building === 'C4').slice(0, 4)) await setDoc('units', u.id, { status: 'blocked', clientId: null, dealId: null, note: 'Developer hold' });
  const tasks = [
    ['Call back about mortgage pre-approval', 1, 'demo2'], ['Send floor plan PDF and 3D tour link', 0, 'demo3'], ['Prepare contract draft for lawyer', 3, 'demo6'],
    ['Follow up: deposit not yet received', -2, 'demo4'], ['Monthly construction update to all buyers', 6, null], ['Confirm Zoom viewing', 2, 'demo9'],
  ];
  for (const [title, d, cid] of tasks) await setDoc('tasks', uid('k'), { title, due: addDays(today(), d), clientId: cid, done: false, repeat: title.startsWith('Monthly') ? 'monthly' : 'none', createdAt: new Date().toISOString(), demo: true });
  void all; void addMonths;
}
