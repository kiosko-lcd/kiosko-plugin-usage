/**
 * OpenAI: the organization's costs this month and today's tokens by model,
 * with an Admin key (platform.openai.com → Settings → Organization → Admin
 * keys; a normal project key gets 403).
 *
 *   GET https://api.openai.com/v1/organization/costs?start_time=…&bucket_width=1d&limit=31
 *   GET https://api.openai.com/v1/organization/usage/completions?start_time=…&bucket_width=1d&group_by=model&limit=1
 *   Authorization: Bearer <admin key>
 *
 * Docs: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs
 * and …/methods/completions. Buckets are UTC days. Costs come as
 * `amount: { value, currency: "usd" }`; usage `input_tokens` already counts
 * cached and cache-write tokens. Prepaid credit balance has no API.
 */
import { num, ShapeError, type Provider, type ProviderOptions } from '../account.ts';

export const OPENAI_BASE = 'https://api.openai.com/v1/organization';
const DAY_S = 86_400;

interface Bucket<R> {
  start_time?: number;
  end_time?: number;
  results?: R[];
}
export interface OpenAIPage<R> {
  object?: string;
  data?: Bucket<R>[];
  has_more?: boolean;
  next_page?: string | null;
}
export interface OpenAICost {
  amount?: { value?: number; currency?: string };
}
export interface OpenAICompletions {
  input_tokens?: number;
  output_tokens?: number;
  model?: string | null;
}

/** Start of the UTC day and month of `now`, Unix seconds. */
export function utcStarts(now: number): { day: number; month: number } {
  const d = new Date(now);
  return { day: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000, month: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000 };
}

/** Pages of the costs report → spend today and this month. Pure. */
export function parseOpenAICosts(pages: unknown[], now: number) {
  const { day } = utcStarts(now);
  let month = 0;
  let today = 0;
  let currency = 'USD';
  for (const p of pages as OpenAIPage<OpenAICost>[]) {
    if (!p || !Array.isArray(p.data)) throw new ShapeError('openai costs data');
    for (const b of p.data) {
      for (const r of b.results ?? []) {
        const v = num(r.amount?.value ?? 0, 'openai amount.value');
        if (r.amount?.currency) currency = r.amount.currency.toUpperCase();
        month += v;
        if (typeof b.start_time === 'number' && b.start_time >= day && b.start_time < day + DAY_S) today += v;
      }
    }
  }
  return { spendToday: { amount: today, currency }, spendMonth: { amount: month, currency } };
}

/** The completions usage report grouped by model → tokens by model, most first. Pure. */
export function parseOpenAIUsage(page: unknown) {
  const p = page as OpenAIPage<OpenAICompletions>;
  if (!p || !Array.isArray(p.data)) throw new ShapeError('openai usage data');
  const by = new Map<string, number>();
  for (const b of p.data) for (const r of b.results ?? []) {
    const model = r.model ?? 'other';
    by.set(model, (by.get(model) ?? 0) + (r.input_tokens ?? 0) + (r.output_tokens ?? 0));
  }
  return [...by].map(([model, tokens]) => ({ model, tokens })).filter((m) => m.tokens > 0).sort((a, b) => b.tokens - a.tokens);
}

/** At most this many pages of costs (31 daily buckets fit in one). */
const MAX_PAGES = 3;

export const openai: Provider<ProviderOptions['openai']> = {
  id: 'openai',
  hosts: ['api.openai.com'],
  keyOf: (o) => o.adminKey,
  async read({ http, key, signal, now }) {
    const headers = { Authorization: `Bearer ${key}` };
    const { day, month } = utcStarts(now);
    const pages: unknown[] = [];
    let page: string | null | undefined;
    do {
      const q = new URLSearchParams({ start_time: String(month), bucket_width: '1d', limit: '31', ...(page ? { page } : {}) });
      const { data } = await http.json<OpenAIPage<OpenAICost>>(`${OPENAI_BASE}/costs?${q}`, { signal, noCache: true, headers });
      pages.push(data);
      page = data?.has_more ? data.next_page : null;
    } while (page && pages.length < MAX_PAGES);
    const spend = parseOpenAICosts(pages, now);
    // Tokens by model are a nicety: without them the spend still shows.
    let byModel: { model: string; tokens: number }[] = [];
    try {
      const q = new URLSearchParams({ start_time: String(day), bucket_width: '1d', group_by: 'model', limit: '1' });
      const { data } = await http.json(`${OPENAI_BASE}/usage/completions?${q}`, { signal, noCache: true, headers });
      byModel = parseOpenAIUsage(data);
    } catch (err) {
      if (signal.aborted) throw err;
    }
    return { ...spend, ...(byModel.length ? { byModel } : {}) };
  },
};
