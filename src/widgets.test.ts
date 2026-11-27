import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import * as kit from '@loksly/lcd-canvas-kit';
import { THEMES, createBaseContext, defaultsOf, validate } from '@kiosko/sdk';
import plugin, { accountsSource, agentsSource, agentsWidget, balanceWidget, blocksWidget, ccusageSource, railWidget, summaryWidget } from './index.ts';
import { accountsDemo, agentsDemo, usageMax } from './demo.ts';
import type { AccountsData } from './account.ts';
import { MIN_PX } from './draw-accounts.ts';

const now = Date.parse('2026-11-21T10:42:00Z');
const theme = THEMES[0]!;
type W = typeof balanceWidget | typeof summaryWidget | typeof agentsWidget;

/** Paints a widget and returns every text drawn, with its size. */
function paint(w: W, sources: Record<string, unknown>, size: [number, number], locale: string, options?: object) {
  const texts: { text: string; size: number }[] = [];
  const spy = {
    ...kit,
    drawTracked: (g: never, text: string, x: number, y: number, o: { size: number }) => (texts.push({ text, size: o.size }), kit.drawTracked(g, text, x, y, o as never)),
    drawClipped: (g: never, text: string, x: number, y: number, w: number, o: { size: number }) => (texts.push({ text, size: o.size }), kit.drawClipped(g, text, x, y, w, o as never)),
  };
  const g = createCanvas(size[0], size[1]).getContext('2d');
  const opts = { ...(w.options ? defaultsOf(w.options as never) : {}), ...options };
  w.render(g as never, { ...createBaseContext({ now, locale }), options: opts, data: undefined, sources, working: true, box: { x: 0, y: 0, w: size[0], h: size[1] }, theme, fonts: theme.fonts, kit: spy, canvas: { createCanvas }, preview: true } as never);
  return texts;
}

const SIZES: [number, number][] = [[600, 200], [360, 120], [220, 100], [480, 260], [160, 80]];

test('new widgets: nothing under 11 px, in every language and size', () => {
  for (const locale of ['en', 'es', 'de', 'zh-Hant', 'zh-Hans']) {
    for (const size of SIZES) {
      for (const [w, sources] of [
        [balanceWidget, { 'usage/accounts': accountsDemo(now, locale) }],
        [summaryWidget, { 'usage/accounts': accountsDemo(now, locale) }],
        [agentsWidget, { 'usage/agents': agentsDemo(now, locale) }],
      ] as [W, Record<string, unknown>][]) {
        const texts = paint(w, sources, size, locale);
        assert.ok(texts.length > 0, `${w.id} ${size} ${locale} paints`);
        const tiny = texts.filter((t) => t.size < MIN_PX);
        assert.deepEqual(tiny, [], `${w.id} ${size.join('x')} ${locale}`);
      }
    }
  }
});

test('zh-Hans samples show the providers offered in mainland China, in CNY', () => {
  const cn = accountsDemo(now, 'zh-Hans').accounts;
  assert.deepEqual(cn.map((a) => a.provider), ['deepseek', 'kimi']);
  assert.ok(cn.every((a) => a.balance?.currency === 'CNY'));
  assert.deepEqual(agentsDemo(now, 'zh-Hans').agents.map((a) => a.id), ['kimi', 'qwen', 'opencode']);
  const text = paint(balanceWidget, { 'usage/accounts': accountsDemo(now, 'zh-Hans') }, [600, 200], 'zh-Hans').map((t) => t.text).join(' ');
  assert.match(text, /¥86\.40/);
  assert.match(text, /余额偏低/, 'Kimi under its threshold says so');
  const tw = paint(balanceWidget, { 'usage/accounts': accountsDemo(now, 'zh-Hant') }, [600, 200], 'zh-Hant').map((t) => t.text).join(' ');
  assert.match(tw, /US\$42\.10/);
  assert.match(tw, /餘額偏低/, 'traditional characters in Taiwan');
});

test('error and empty states are said in words', () => {
  const broken: AccountsData = {
    accounts: [
      { provider: 'deepseek', error: 'auth' },
      { provider: 'kimi', balance: { amount: 30, currency: 'CNY' }, error: 'network', updatedAt: now - 600_000 },
      { provider: 'openai', error: 'down' },
    ],
  };
  const words = (locale: string, w: W = summaryWidget) => paint(w, { 'usage/accounts': broken }, [360, 120], locale).map((t) => t.text).join(' ');
  assert.match(words('zh-Hans'), /密钥无效/);
  assert.match(words('zh-Hant'), /金鑰無效/);
  assert.match(words('en'), /key refused/);
  assert.match(words('en', balanceWidget), /no connection/);
  assert.match(words('en', balanceWidget), /CN¥30\.00/, 'the last good figure stays, dimmed');
  assert.match(paint(balanceWidget, { 'usage/accounts': { accounts: [] } }, [600, 200], 'zh-Hans').map((t) => t.text).join(''), /API 密钥/);
  assert.match(paint(agentsWidget, {}, [480, 260], 'es').map((t) => t.text).join(''), /sin uso de agentes/);
});

test('config from 0.2 keeps working: the ccusage source and its options are unchanged', () => {
  assert.equal(plugin.sources![0], ccusageSource);
  assert.equal(ccusageSource.id, 'ccusage');
  const old = { bin: 'npx ccusage', mode: 'api', dailyCap: 30, monthlyCap: 500, calibration: { metric: 'tokens', lookbackDays: 14, percentile: 90 } };
  const v = validate(ccusageSource.options!, old);
  assert.deepEqual(v.issues, []);
  assert.deepEqual(v.value, old);
  // Widgets placed with 0.2 keep their type and options.
  assert.deepEqual(plugin.widgets!.slice(0, 2).map((w) => w.id), ['rail', 'blocks']);
  assert.deepEqual(validate(plugin.widgets![0]!.options!, { bars: 1, models: 2, warn: 50, alert: 90 }).issues, []);
});

test('new sources: no key by default (nothing asked), keys are secrets, hosts declared, polite intervals', () => {
  const d = defaultsOf(accountsSource.options!);
  assert.deepEqual([d.deepseek.apiKey, d.kimi.apiKey, d.openai.adminKey], ['', '', '']);
  const props = (accountsSource.options as unknown as { props: Record<string, { props: Record<string, { secret?: boolean }> }> }).props;
  assert.equal(props.deepseek!.props.apiKey!.secret, true);
  assert.equal(props.kimi!.props.apiKey!.secret, true);
  assert.equal(props.openai!.props.adminKey!.secret, true);
  assert.deepEqual(plugin.permissions?.network, ['api.deepseek.com', 'api.moonshot.cn', 'api.moonshot.ai', 'api.openai.com']);
  assert.ok(accountsSource.minIntervalMs! >= 120_000, 'balances at most every 2 minutes');
  assert.ok(agentsSource.minIntervalMs! >= 60_000);
  assert.deepEqual(defaultsOf(agentsSource.options!), { bin: 'ccusage', offline: false });
});

test('empty: each widget passes its turn only when its source delivered nothing to show', () => {
  const empty = (w: { empty?: (c: never) => boolean }, sources: Record<string, unknown>) => w.empty!({ options: {}, data: undefined, sources, now } as never);
  const usage = (v: unknown) => ({ 'usage/ccusage': v });
  for (const w of [railWidget, blocksWidget]) {
    assert.equal(empty(w, {}), false, `${w.id}: loading is not empty`);
    assert.equal(empty(w, usage(usageMax(now))), false, `${w.id}: real data`);
    assert.equal(empty(w, usage({})), true, `${w.id}: an empty object`);
  }
  assert.equal(empty(railWidget, usage({ mode: 'max', stale: true, windows: [], tokensToday: 0 })), true, 'rail: ccusage gave nothing');
  assert.equal(empty(railWidget, usage({ mode: 'max', stale: false, windows: [], tokensToday: 0 })), false, 'rail: a healthy zero is shown');
  assert.equal(empty(blocksWidget, usage({ mode: 'max', blockHistory: [] })), true, 'blocks: no blocks yet');

  const accounts = (v: unknown) => ({ 'usage/accounts': v });
  for (const w of [balanceWidget, summaryWidget]) {
    assert.equal(empty(w, {}), false, `${w.id}: loading is not empty`);
    assert.equal(empty(w, accounts(accountsDemo(now, 'en'))), false, `${w.id}: real data`);
    assert.equal(empty(w, accounts({ accounts: [] })), true, `${w.id}: no account configured`);
    assert.equal(empty(w, accounts({})), true, `${w.id}: an empty object`);
    assert.equal(empty(w, accounts({ accounts: [{ provider: 'deepseek', error: 'down' }] })), true, `${w.id}: failing with no figure`);
    assert.equal(empty(w, accounts({ accounts: [{ provider: 'deepseek', error: 'down', balance: { amount: 5, currency: 'USD' } }] })), false, `${w.id}: failing, last figure still shown`);
  }

  const agents = (v: unknown) => ({ 'usage/agents': v });
  assert.equal(empty(agentsWidget, {}), false, 'agents: loading is not empty');
  assert.equal(empty(agentsWidget, agents(agentsDemo(now, 'en'))), false, 'agents: real data');
  assert.equal(empty(agentsWidget, agents({ agents: [] })), true, 'agents: no agent used');
  assert.equal(empty(agentsWidget, agents({})), true, 'agents: an empty object');
});
