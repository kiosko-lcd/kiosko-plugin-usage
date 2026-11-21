/**
 * Moonshot AI (Kimi): the balance of the account the key belongs to.
 *
 *   GET https://api.moonshot.cn/v1/users/me/balance   (platform.kimi.com, mainland China, CNY)
 *   GET https://api.moonshot.ai/v1/users/me/balance   (platform.kimi.ai, international, USD)
 *   Authorization: Bearer <key>
 *
 * Docs: https://platform.kimi.com/docs/api/balance and
 * https://platform.kimi.ai/docs/api/balance. Keys of one platform don't work
 * on the other (401). `available_balance` = cash + vouchers; `cash_balance`
 * may be negative (arrears). At ≤ 0 inference calls fail.
 */
import { num, ShapeError, type Provider, type ProviderOptions } from '../account.ts';

export const KIMI_URLS = {
  cn: 'https://api.moonshot.cn/v1/users/me/balance',
  global: 'https://api.moonshot.ai/v1/users/me/balance',
} as const;

/** The unit each platform documents for its balances. */
export const KIMI_CURRENCY = { cn: 'CNY', global: 'USD' } as const;

export interface KimiBalance {
  code?: number;
  data?: { available_balance?: number; voucher_balance?: number; cash_balance?: number };
  scode?: string;
  status?: boolean;
}

export function parseKimi(body: unknown, region: 'cn' | 'global') {
  const b = body as KimiBalance;
  if (!b || typeof b !== 'object' || !b.data || (b.code !== undefined && b.code !== 0)) throw new ShapeError(`kimi code ${String(b?.code)}`);
  const currency = KIMI_CURRENCY[region];
  const available = num(b.data.available_balance, 'kimi available_balance');
  return {
    balance: { amount: available, currency },
    parts: [
      { id: 'cash' as const, amount: num(b.data.cash_balance ?? 0, 'kimi cash_balance') },
      { id: 'voucher' as const, amount: num(b.data.voucher_balance ?? 0, 'kimi voucher_balance') },
    ],
    available: available > 0,
  };
}

export const kimi: Provider<ProviderOptions['kimi']> = {
  id: 'kimi',
  hosts: ['api.moonshot.cn', 'api.moonshot.ai'],
  keyOf: (o) => o.apiKey,
  async read({ http, key, signal }, o) {
    const region = o.region === 'global' ? 'global' : 'cn';
    const { data } = await http.json(KIMI_URLS[region], { signal, noCache: true, headers: { Authorization: `Bearer ${key}` } });
    return parseKimi(data, region);
  },
};
