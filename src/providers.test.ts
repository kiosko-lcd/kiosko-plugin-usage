import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createHttp, HttpError } from '@kiosko/sdk';
import { backoffMs, balanceLevel, classify, createAccounts, ShapeError, type ProviderOptions } from './accounts.ts';
import { parseDeepSeek } from './providers/deepseek.ts';
import { parseKimi } from './providers/kimi.ts';
import { parseOpenAICosts, parseOpenAIUsage, utcStarts } from './providers/openai.ts';

// Fixtures: the response examples of each provider's official docs, as published.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as unknown;

const NONE: ProviderOptions = { deepseek: { apiKey: '', lowBalance: 10 }, kimi: { apiKey: '', region: 'cn', lowBalance: 10 }, openai: { adminKey: '', monthlyBudget: 0 } };

test('DeepSeek: the documented example (amounts as strings, CNY)', () => {
  const a = parseDeepSeek(fixture('deepseek-balance'));
  assert.deepEqual(a.balance, { amount: 110, currency: 'CNY' });
  assert.deepEqual(a.parts, [{ id: 'toppedUp', amount: 100 }, { id: 'granted', amount: 10 }]);
  assert.equal(a.available, true);
  assert.equal(a.otherBalances, undefined);
});

test('DeepSeek: two currencies, the one with money leads; nonsense is a bad response', () => {
  const a = parseDeepSeek({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '0.00', granted_balance: '0.00', topped_up_balance: '0.00' }, { currency: 'USD', total_balance: '4.50', granted_balance: '0.00', topped_up_balance: '4.50' }] });
  assert.deepEqual(a.balance, { amount: 4.5, currency: 'USD' });
  assert.deepEqual(a.otherBalances, [{ amount: 0, currency: 'CNY' }]);
  assert.throws(() => parseDeepSeek({ error: { message: 'Authentication Fails' } }), ShapeError);
  assert.throws(() => parseDeepSeek({ balance_infos: [{ currency: 'CNY', total_balance: 'abc' }] }), ShapeError);
});

test('Kimi: the documented example; CNY on platform.kimi.com, USD on platform.kimi.ai', () => {
  const cn = parseKimi(fixture('kimi-balance'), 'cn');
  assert.deepEqual(cn.balance, { amount: 49.58894, currency: 'CNY' });
  assert.deepEqual(cn.parts, [{ id: 'cash', amount: 3.00001 }, { id: 'voucher', amount: 46.58893 }]);
  assert.equal(cn.available, true);
  assert.equal(parseKimi(fixture('kimi-balance'), 'global').balance.currency, 'USD');
  // In arrears: cash below zero, available = vouchers = 0, calls refused.
  const owed = parseKimi({ code: 0, data: { available_balance: 0, voucher_balance: 0, cash_balance: -1.2 }, scode: '0x0', status: true }, 'cn');
  assert.equal(owed.available, false);
  assert.throws(() => parseKimi({ code: 1, data: null }, 'cn'), ShapeError);
});

test('OpenAI: costs of the documented example; today is the UTC day', () => {
  // The example's bucket starts 2024-11-01T00:00Z.
  const now = Date.parse('2024-11-01T15:00:00Z');
  assert.deepEqual(utcStarts(now), { day: 1730419200, month: 1730419200 });
  const s = parseOpenAICosts([fixture('openai-costs')], now);
  assert.deepEqual(s.spendToday, { amount: 0.06, currency: 'USD' });
  assert.deepEqual(s.spendMonth, { amount: 0.06, currency: 'USD' });
  const later = parseOpenAICosts([fixture('openai-costs')], Date.parse('2024-11-02T01:00:00Z'));
  assert.equal(later.spendToday.amount, 0, 'yesterday’s bucket is not today');
  assert.equal(later.spendMonth.amount, 0.06);
});

test('OpenAI: completions usage by model (input already counts cached tokens)', () => {
  assert.deepEqual(parseOpenAIUsage(fixture('openai-usage-completions')), [{ model: 'other', tokens: 1500 }]);
  const by = parseOpenAIUsage({ object: 'page', data: [{ results: [{ model: 'gpt-a', input_tokens: 10, output_tokens: 5 }, { model: 'gpt-b', input_tokens: 100, output_tokens: 0 }] }] });
  assert.deepEqual(by.map((m) => m.model), ['gpt-b', 'gpt-a']);
});

test('errors are classified for the widget; backoff grows to an hour, a bad key waits an hour', () => {
  assert.equal(classify(new HttpError('HTTP 401 from x', { status: 401, url: 'x' })), 'auth');
  assert.equal(classify(new HttpError('HTTP 429 from x', { status: 429, url: 'x' })), 'rate');
  assert.equal(classify(new HttpError('HTTP 503 from x', { status: 503, url: 'x' })), 'down');
  assert.equal(classify(new HttpError('not JSON from x', { status: 200, url: 'x' })), 'bad-response');
  assert.equal(classify(new ShapeError('x')), 'bad-response');
  assert.equal(classify(new TypeError('fetch failed')), 'network');
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((n) => backoffMs(n, 'network') / 60_000), [5, 10, 20, 40, 60, 60]);
  assert.equal(backoffMs(1, 'auth'), 3_600_000);
});

test('balance level: amber at or under the threshold, red when empty or refused; budget for spend', () => {
  assert.equal(balanceLevel({ provider: 'deepseek', balance: { amount: 50, currency: 'CNY' }, lowBalance: 10 }), 'ok');
  assert.equal(balanceLevel({ provider: 'deepseek', balance: { amount: 10, currency: 'CNY' }, lowBalance: 10 }), 'warn');
  assert.equal(balanceLevel({ provider: 'kimi', balance: { amount: 0, currency: 'CNY' } }), 'alert');
  assert.equal(balanceLevel({ provider: 'deepseek', balance: { amount: 5, currency: 'CNY' }, available: false }), 'alert');
  assert.equal(balanceLevel({ provider: 'openai', spendMonth: { amount: 85, currency: 'USD' }, monthlyBudget: 100 }), 'warn');
  assert.equal(balanceLevel({ provider: 'openai', spendMonth: { amount: 85, currency: 'USD' } }), 'ok');
});

/** A local stand-in for the three providers: routes by path, checks the key, counts the calls. */
async function fakeServer(handle: (req: IncomingMessage, path: string) => { status: number; body: unknown; headers?: Record<string, string> }) {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    calls.push(`${req.headers['x-host']}${url.pathname}`);
    const r = handle(req, url.pathname);
    res.writeHead(r.status, { 'content-type': 'application/json', ...r.headers });
    res.end(typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  // The real HTTP client, its requests sent to the fake server instead of the provider.
  const fetchLocal: typeof fetch = (input, init) => {
    const u = new URL(String(input));
    return fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, { ...init, headers: { ...(init?.headers as Record<string, string>), 'x-host': u.host } });
  };
  let t = Date.parse('2026-11-21T10:00:00Z');
  const http = createHttp({ agent: 'test', fetch: fetchLocal, now: () => t });
  return { http, calls, close: () => server.close(), setNow: (n: number) => (t = n) };
}

test('end to end against a fake server: every configured provider read, keys only in the header, unconfigured ones skipped', async () => {
  const srv = await fakeServer((req, path) => {
    const auth = req.headers.authorization;
    if (path === '/user/balance') return auth === 'Bearer sk-ds' ? { status: 200, body: fixture('deepseek-balance') } : { status: 401, body: {} };
    if (path === '/v1/users/me/balance') return { status: 200, body: fixture('kimi-balance') };
    return { status: 404, body: {} };
  });
  try {
    const logs: string[] = [];
    const acc = createAccounts({ http: srv.http, log: (m) => logs.push(m) });
    const now = Date.parse('2026-11-21T10:00:00Z');
    const d = await acc.read({ ...NONE, deepseek: { apiKey: 'sk-ds', lowBalance: 10 }, kimi: { apiKey: 'sk-kimi', region: 'cn', lowBalance: 60 } }, new AbortController().signal, now);
    assert.deepEqual(d.accounts.map((a) => a.provider), ['deepseek', 'kimi']);
    assert.deepEqual(srv.calls.sort(), ['api.deepseek.com/user/balance', 'api.moonshot.cn/v1/users/me/balance']);
    assert.equal(d.accounts[1]!.lowBalance, 60);
    assert.equal(balanceLevel(d.accounts[1]!), 'warn');
    assert.equal(d.accounts[0]!.updatedAt, now);
    assert.deepEqual(logs, []);
  } finally {
    srv.close();
  }
});

test('a failing provider: kept figures, an error word, no new request before the backoff, no key in the log', async () => {
  let fail = false;
  const srv = await fakeServer(() => (fail ? { status: 503, body: 'down' } : { status: 200, body: fixture('deepseek-balance') }));
  try {
    const logs: string[] = [];
    const acc = createAccounts({ http: srv.http, log: (m) => logs.push(m) });
    const o = { ...NONE, deepseek: { apiKey: 'sk-secret-123', lowBalance: 10 } };
    const sig = new AbortController().signal;
    const t0 = Date.parse('2026-11-21T10:00:00Z');
    await acc.read(o, sig, t0);
    fail = true;
    srv.setNow(t0 + 60_000);
    const d = await acc.read(o, sig, t0 + 60_000);
    assert.equal(d.accounts[0]!.error, 'down');
    assert.deepEqual(d.accounts[0]!.balance, { amount: 110, currency: 'CNY' }, 'the last good figure stays');
    assert.equal(srv.calls.length, 2);
    // Two minutes later: still backing off (the client also rests the host after a 503).
    const again = await acc.read(o, sig, t0 + 3 * 60_000);
    assert.equal(srv.calls.length, 2, 'not asked again yet');
    assert.equal(again.accounts[0]!.error, 'down');
    assert.ok(logs.length === 1 && /deepseek: down/.test(logs[0]!));
    assert.ok(!logs.join('\n').includes('sk-secret'), 'the key never reaches the log');
  } finally {
    srv.close();
  }
});

test('a refused key is an auth error, and asked again only after an hour', async () => {
  const srv = await fakeServer(() => ({ status: 401, body: { error: { message: 'Invalid Authentication', type: 'invalid_authentication_error' } } }));
  try {
    const acc = createAccounts({ http: srv.http });
    const o = { ...NONE, kimi: { apiKey: 'bad', region: 'global' as const, lowBalance: 10 } };
    const sig = new AbortController().signal;
    const t0 = Date.parse('2026-11-21T10:00:00Z');
    const d = await acc.read(o, sig, t0);
    assert.equal(d.accounts[0]!.error, 'auth');
    assert.equal(d.accounts[0]!.retryAt, t0 + 3_600_000);
    assert.deepEqual(srv.calls, ['api.moonshot.ai/v1/users/me/balance']);
    await acc.read(o, sig, t0 + 30 * 60_000);
    assert.equal(srv.calls.length, 1);
    // A new key starts afresh.
    await acc.read({ ...o, kimi: { ...o.kimi, apiKey: 'other' } }, sig, t0 + 31 * 60_000);
    assert.equal(srv.calls.length, 2);
  } finally {
    srv.close();
  }
});

test('OpenAI end to end: month costs and today by model, with the documented query', async () => {
  const seen: string[] = [];
  const srv = await fakeServer((req, path) => {
    seen.push(`${path}?${new URL(req.url ?? '', 'http://x').searchParams}`);
    if (path === '/v1/organization/costs') return { status: 200, body: { object: 'page', data: [{ object: 'bucket', start_time: 1730419200, end_time: 1730505600, results: [{ object: 'organization.costs.result', amount: { value: 1.5, currency: 'usd' } }] }, { object: 'bucket', start_time: 1730505600, end_time: 1730592000, results: [{ object: 'organization.costs.result', amount: { value: 0.25, currency: 'usd' } }] }], has_more: false, next_page: null } };
    if (path === '/v1/organization/usage/completions') return { status: 200, body: { object: 'page', data: [{ object: 'bucket', results: [{ model: 'gpt-x', input_tokens: 900, output_tokens: 100 }] }], has_more: false, next_page: null } };
    return { status: 404, body: {} };
  });
  try {
    const acc = createAccounts({ http: srv.http });
    const now = Date.parse('2024-11-02T09:00:00Z');
    const d = await acc.read({ ...NONE, openai: { adminKey: 'sk-admin', monthlyBudget: 50 } }, new AbortController().signal, now);
    const a = d.accounts[0]!;
    assert.deepEqual(a.spendMonth, { amount: 1.75, currency: 'USD' });
    assert.deepEqual(a.spendToday, { amount: 0.25, currency: 'USD' });
    assert.deepEqual(a.byModel, [{ model: 'gpt-x', tokens: 1000 }]);
    assert.equal(a.monthlyBudget, 50);
    assert.deepEqual(seen, [
      '/v1/organization/costs?start_time=1730419200&bucket_width=1d&limit=31',
      '/v1/organization/usage/completions?start_time=1730505600&bucket_width=1d&group_by=model&limit=1',
    ]);
  } finally {
    srv.close();
  }
});

test('nothing configured: no request, no account', async () => {
  const acc = createAccounts({ http: { json: async () => assert.fail('no request'), text: async () => assert.fail('no request'), resting: () => undefined } });
  assert.deepEqual(await acc.read(NONE, new AbortController().signal), { accounts: [] });
});
