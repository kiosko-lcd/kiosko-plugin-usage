import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBaseContext } from '@kiosko/sdk';
import { money, percent, tokens } from './format.ts';
import { level, railRatios } from './draw.ts';
import { usageApi, usageMax } from './demo.ts';

test('tokens', () => {
  assert.equal(tokens(450), '450');
  assert.equal(tokens(2500), '3k');
  assert.equal(tokens(1_350_000), '1.4M');
  assert.equal(tokens(2_900_000_000), '2.90B');
});

test('money, percent, reset countdown', () => {
  assert.equal(money(0.45), '$0.45');
  assert.equal(money(12.5), '$12.50');
  assert.equal(money(125.75), '$126');
  assert.equal(percent(0.42), '42%');
  const fmt = createBaseContext({ now: 0, locale: 'es' }).fmt;
  assert.equal(fmt.duration(2 * 3600 * 1000 + 10 * 60 * 1000 - 5000, { round: 'up' }), '2 h 10', 'what the rail paints');
});

test('rail semaphore', () => {
  const t = { warn: 60, alert: 85 };
  assert.deepEqual(railRatios(usageMax(0)).map((r) => level(r, t)), ['info', 'alert']);
  assert.deepEqual(railRatios(usageApi(0)).map((r) => level(r, t)), ['info', 'warn']);
});

test('rail thresholds are % (bar fill), red from alert on', () => {
  assert.equal(level(0.85, { warn: 60, alert: 85 }), 'alert');
  assert.equal(level(0.6, { warn: 60, alert: 85 }), 'warn');
  assert.equal(level(0.59, { warn: 60, alert: 85 }), 'info');
});
