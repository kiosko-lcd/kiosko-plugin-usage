import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { errorMessage } from '@kiosko/sdk';
import { buildAgents, localDay, OldCcusage, readAgents, type CcusageUnifiedReport } from './agents.ts';

// `ccusage daily --by-agent --json`, the example of ccusage's docs/guide/json-output.md.
const doc = JSON.parse(readFileSync(new URL('./fixtures/ccusage-daily-by-agent.json', import.meta.url), 'utf8')) as CcusageUnifiedReport;
const at = (day: string) => new Date(`${day}T12:00:00`).getTime();

test('the documented by-agent row: Kimi CLI today and this month', () => {
  const s = buildAgents(doc, at('2026-04-21'));
  assert.deepEqual(s.agents, [{ id: 'kimi', tokensToday: 3500, costToday: 0.00327, tokensMonth: 3500, costMonth: 0.00327 }]);
  assert.deepEqual(s.byModel, [{ model: 'kimi-for-coding', tokens: 3500, agent: 'kimi' }]);
  assert.equal(s.costToday, 0.00327);
  const tomorrow = buildAgents(doc, at('2026-04-22'));
  assert.equal(tomorrow.agents[0]!.costToday, 0);
  assert.equal(tomorrow.agents[0]!.costMonth, 0.00327);
  assert.equal(buildAgents(doc, at('2026-05-01')).agents.length, 0, 'last month is not this month');
});

test('several agents and days: busiest today first, models across agents', () => {
  const row = (period: string, agents: [string, number, number, string][]) => ({ period, agents: agents.map(([agent, totalTokens, totalCost, modelName]) => ({ agent, totalTokens, totalCost, modelBreakdowns: [{ modelName, inputTokens: totalTokens }] })) });
  const s = buildAgents({ daily: [row('2026-11-20', [['codex', 900, 9, 'gpt-5-codex']]), row('2026-11-21', [['claude', 100, 1, 'claude-opus-5'], ['qwen', 500, 2, 'qwen3-coder-plus']])] }, at('2026-11-21'));
  assert.deepEqual(s.agents.map((a) => a.id), ['qwen', 'claude', 'codex']);
  assert.deepEqual(s.byModel.map((m) => m.model), ['qwen3-coder-plus', 'opus-5']);
  assert.equal(s.costMonth, 12);
});

test('rows without `agents` mean a ccusage older than 20: a clear error', () => {
  assert.throws(() => buildAgents({ daily: [{ period: '2026-11-21', totalTokens: 5 }] }, at('2026-11-21')), OldCcusage);
  assert.match(errorMessage(new OldCcusage(), 'zh-CN'), /需要 ccusage 20/);
  assert.deepEqual(buildAgents({ daily: [] }, at('2026-11-21')).agents, []);
});

test('readAgents: one run, from the first of the month, --offline when asked; missing binary in words', async () => {
  const calls: string[] = [];
  await readAgents({ bin: 'ccusage', offline: true }, async (args) => (calls.push(args.join(' ')), { daily: [] }), at('2026-11-21'));
  assert.deepEqual(calls, ['daily --by-agent --json --since 20261101 --offline']);
  assert.equal(localDay(at('2026-03-05')), '2026-03-05');
  const missing = async () => {
    throw Object.assign(new Error('spawn ccusage ENOENT'), { code: 'ENOENT' });
  };
  await assert.rejects(readAgents({ bin: 'ccusage', offline: false }, missing), (e: unknown) => /^找不到 ccusage/.test(errorMessage(e, 'zh-CN')));
});
