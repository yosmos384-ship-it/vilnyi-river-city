#!/usr/bin/env node
// VRC CRM data move: JSON export (from the current CRM) -> SQL for the Supabase project.
//
// Local only. This script reads one file and writes one file. It makes no network connection and calls no service.
// The SQL it writes is reviewed by the owner and run in the Supabase SQL editor (see supabase/migrate-from-claude.md).
//
// Usage:
//   node scripts/migrate-crm.mjs <export.json> --out <migration.sql> [--owner <profile-uuid>]
//
//   --owner  optional: the admin's profile id (uuid). Migrated records are then owned by that user.
//            Without it, records get no owner and are visible to administrators and to anyone with view_all_clients.
//
// Prints the row counts in the export ("before") and in the SQL ("after"), per collection, and every row it skipped.

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const inputPath = args.find((a, i) => !a.startsWith('--') && (i === 0 || !['--out', '--owner'].includes(args[i - 1])));
const outPath = flag('--out');
const owner = flag('--owner');

if (!inputPath || !outPath) {
  console.error('usage: node scripts/migrate-crm.mjs <export.json> --out <migration.sql> [--owner <profile-uuid>]');
  process.exit(2);
}
if (owner && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)) {
  console.error('--owner must be a uuid');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
const collections = raw.format === 'vrc-crm-export' ? raw.collections : raw;
if (!collections || typeof collections !== 'object') {
  console.error('not a VRC CRM export: expected {format:"vrc-crm-export", collections:{...}}');
  process.exit(1);
}

// Old collection name -> table. 'audit' is not migrated (history stays in the export file).
const RECORD_TABLES = ['clients', 'deals', 'tasks', 'documents', 'emails', 'templates', 'leads', 'reservations'];
const UNIT_STATUSES = ['available', 'reserved', 'sold', 'blocked'];
const HANDLED = [...RECORD_TABLES, 'settings', 'units', 'counters'];

const sqlText = v => `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
const sqlJson = v => `${sqlText(JSON.stringify(v))}::jsonb`;
const ownerSql = owner ? sqlText(owner) + '::uuid' : 'null';

const before = {};
const after = Object.fromEntries(HANDLED.map(k => [k, 0]));
const skipped = [];
const out = [];
const bump = (map, k) => { map[k] = (map[k] || 0) + 1; };

for (const [name, rows] of Object.entries(collections)) {
  before[name] = Array.isArray(rows) ? rows.length : 0;
}
if (collections.settings) before.settings = collections.settings.length;

// Record tables: one row each, the whole CRM document in data.
for (const table of RECORD_TABLES) {
  for (const row of collections[table] || []) {
    const { id, ...data } = row || {};
    if (!id) { skipped.push(`${table}: row without id`); continue; }
    out.push(`insert into public.${table} (id, owner_id, data) values (${sqlText(id)}, ${ownerSql}, ${sqlJson(data)}) on conflict (id) do nothing;`);
    bump(after, table);
  }
}

// Settings: the 'main' document. The old 'counters' document holds the numbering counters (handled below).
for (const row of collections.settings || []) {
  if (row?.id === 'counters') {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'id' || key === 'updatedAt' || key === 'updatedBy') continue;
      if (!Number.isInteger(value) || value < 0) { skipped.push(`counters: ${key} has a non-integer value`); continue; }
      out.push(`insert into public.counters (key, value) values (${sqlText(key)}, ${value}) on conflict (key) do update set value = excluded.value;`);
      bump(after, 'counters');
    }
    continue;
  }
  if (row?.id !== 'main') { skipped.push(`settings: ${row?.id} is not migrated`); continue; }
  const { id, ...data } = row;
  out.push(`insert into public.settings (id, data) values ('main', ${sqlJson(data)}) on conflict (id) do update set data = excluded.data;`);
  bump(after, 'settings');
}

// Units: only the CRM's overrides (status, client, deal, note). Everything else is 'available' by default.
for (const row of collections.units || []) {
  if (!row?.id) { skipped.push('units: row without id'); continue; }
  if (row.status !== undefined && !UNIT_STATUSES.includes(row.status)) { skipped.push(`units: ${row.id} has unknown status ${row.status}`); continue; }
  const status = row.status || 'available';
  const free = status === 'available';
  out.push(`insert into public.units (id, status, client_id, deal_id, note) values (${sqlText(row.id)}, ${sqlText(status)}, ${free || !row.clientId ? 'null' : sqlText(row.clientId)}, ${free || !row.dealId ? 'null' : sqlText(row.dealId)}, ${sqlText(row.note || '')}) on conflict (id) do update set status = excluded.status, client_id = excluded.client_id, deal_id = excluded.deal_id, note = excluded.note;`);
  bump(after, 'units');
}

// Document number counters.
for (const row of collections.counters || []) {
  const value = Number(row?.value ?? row);
  if (!row?.id && !row?.key) { skipped.push('counters: row without key'); continue; }
  const key = row.key || row.id;
  if (!Number.isInteger(value) || value < 0) { skipped.push(`counters: ${key} has a non-integer value`); continue; }
  out.push(`insert into public.counters (key, value) values (${sqlText(key)}, ${value}) on conflict (key) do update set value = excluded.value;`);
  bump(after, 'counters');
}

const header = [
  '-- VRC CRM data move (generated by scripts/migrate-crm.mjs). Review, then run in the Supabase SQL editor.',
  `-- Source: ${inputPath}`,
  `-- Generated: ${new Date().toISOString()}`,
  '-- Idempotent: rows that already exist are left alone (on conflict).',
  'begin;',
];
writeFileSync(outPath, [...header, ...out, 'commit;', ''].join('\n'), 'utf8');

const pad = n => String(n).padStart(4);
console.log('BEFORE (rows in the export file):');
for (const [k, n] of Object.entries(before)) console.log(`  ${k.padEnd(14)} ${pad(n)}`);
console.log('AFTER (rows written to the SQL file):');
for (const [k, n] of Object.entries(after)) console.log(`  ${k.padEnd(14)} ${pad(n)}`);
const unknown = Object.keys(before).filter(k => !HANDLED.includes(k) && k !== 'audit' && k !== 'settings');
console.log(`not migrated: ${unknown.join(', ') || 'none'}${before.audit ? `; audit: ${before.audit} day-entries kept in the export file only` : ''}`);
if (skipped.length) { console.log(`SKIPPED (${skipped.length}):`); skipped.forEach(s => console.log('  - ' + s)); }
console.log(`wrote ${outPath}`);
