/**
 * DeepSeek: the balance of the account the key belongs to.
 *
 *   GET https://api.deepseek.com/user/balance   Authorization: Bearer <key>
 *
 * Docs: https://api-docs.deepseek.com/api/get-user-balance (base URL:
 * https://api-docs.deepseek.com/). Amounts come as strings ("110.00"), one
 * entry per currency (CNY or USD). No spend or token figures: DeepSeek has
 * no usage API, only the balance.
 */
import { num, ShapeError, type Money, type Provider, type ProviderOptions } from '../account.ts';

export const DEEPSEEK_URL = 'https://api.deepseek.com/user/balance';

export interface DeepSeekBalance {
  is_available?: boolean;
  balance_infos?: { currency?: string; total_balance?: string; granted_balance?: string; topped_up_balance?: string }[];
}

/** The response → the account. Pure; the first currency is the headline, as the console shows it. */
export function parseDeepSeek(body: unknown) {
  const b = body as DeepSeekBalance;
  if (!b || typeof b !== 'object' || !Array.isArray(b.balance_infos)) throw new ShapeError('deepseek balance_infos');
  const infos = b.balance_infos.map((i) => ({
    currency: String(i.currency ?? '').toUpperCase() || 'CNY',
    total: num(i.total_balance, 'deepseek total_balance'),
    granted: i.granted_balance === undefined ? undefined : num(i.granted_balance, 'deepseek granted_balance'),
    toppedUp: i.topped_up_balance === undefined ? undefined : num(i.topped_up_balance, 'deepseek topped_up_balance'),
  }));
  // An account topped up in one currency only lists that one; with both, the one with money leads.
  const sorted = [...infos].sort((a, b2) => Number(b2.total > 0) - Number(a.total > 0));
  const head = sorted[0];
  const balance: Money | undefined = head ? { amount: head.total, currency: head.currency } : undefined;
  return {
    ...(balance ? { balance } : {}),
    ...(sorted.length > 1 ? { otherBalances: sorted.slice(1).map((i) => ({ amount: i.total, currency: i.currency })) } : {}),
    ...(head && head.granted !== undefined && head.toppedUp !== undefined ? { parts: [{ id: 'toppedUp' as const, amount: head.toppedUp }, { id: 'granted' as const, amount: head.granted }] } : {}),
    ...(typeof b.is_available === 'boolean' ? { available: b.is_available } : {}),
  };
}

export const deepseek: Provider<ProviderOptions['deepseek']> = {
  id: 'deepseek',
  hosts: ['api.deepseek.com'],
  keyOf: (o) => o.apiKey,
  async read({ http, key, signal }) {
    const { data } = await http.json(DEEPSEEK_URL, { signal, noCache: true, headers: { Authorization: `Bearer ${key}` } });
    return parseDeepSeek(data);
  },
};
