import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASINO_I18N, CT, LANGS } from '../i18n.js?v=3.11';

test('all 8 languages carry every key, non-empty; the play-money notice is in each', () => {
  assert.deepEqual([...LANGS].sort(), ['de', 'en', 'fr', 'he', 'it', 'ro', 'ru', 'uk']);
  const keys = Object.keys(CASINO_I18N.en);
  for (const l of LANGS) { for (const k of keys) assert.ok(typeof CASINO_I18N[l][k] === 'string' && CASINO_I18N[l][k].trim().length > 0, l + '.' + k); assert.deepEqual(Object.keys(CASINO_I18N[l]).filter(k => !keys.includes(k)), []); }
  for (const l of LANGS) if (l !== 'en') assert.notEqual(CASINO_I18N[l].notice, CASINO_I18N.en.notice);
  assert.equal(CT('en', 'minBet', { x: '€5' }), 'Minimum bet €5'); assert.equal(CT('xx', 'deal'), 'Deal'); assert.equal(CT('he', 'casino'), 'קזינו');
  for (const l of LANGS) for (const k of ['minBet', 'maxBet']) assert.ok(CASINO_I18N[l][k].includes('{x}'));
  for (const l of LANGS) assert.ok(CASINO_I18N[l].hintIs.includes('{a}'));
});
