/**
 * What every provider reader returns, and the small helpers they share.
 * Kept apart from `accounts.ts` (which runs the readers) so the readers and
 * the widgets can import it without a cycle.
 */
import type { HttpClient } from '@kiosko/sdk';

export type ProviderId = 'deepseek' | 'kimi' | 'openai';

/** Why a provider has no fresh figure: a widget says it in words. */
export type AccountError = 'auth' | 'network' | 'down' | 'rate' | 'bad-response';

/** One money figure, in the currency the API gave (ISO 4217, upper case). Never converted. */
export interface Money {
  amount: number;
  currency: string;
}

export interface Account {
  provider: ProviderId;
  /** What is left to spend, when the API says it (prepaid accounts). */
  balance?: Money;
  /** Further balances in other currencies (DeepSeek may hold CNY and USD). */
  otherBalances?: Money[];
  /** How the balance is made up: granted/topped-up (DeepSeek), voucher/cash (Kimi). */
  parts?: { id: 'granted' | 'toppedUp' | 'voucher' | 'cash'; amount: number }[];
  /** False when the provider says calls will fail for lack of funds. */
  available?: boolean;
  /** Spend, when the API gives it (OpenAI: UTC days, as the costs API buckets them). */
  spendToday?: Money;
  spendMonth?: Money;
  /** Today's tokens by model, most first. */
  byModel?: { model: string; tokens: number }[];
  /** Copied from the source options so a widget can colour the figure. */
  lowBalance?: number;
  monthlyBudget?: number;
  /** Last successful read, ms epoch. */
  updatedAt?: number;
  /** Set when the last attempt failed; the figures above are then the last good ones, if any. */
  error?: AccountError;
  /** When the next attempt will be made, while backing off. */
  retryAt?: number;
}

export interface AccountsData {
  accounts: Account[];
}

/** What a provider reader gets: a polite HTTP client, the key and a per-request signal. */
export interface ReadContext {
  http: HttpClient;
  key: string;
  signal: AbortSignal;
  now: number;
}

export interface Provider<O> {
  id: ProviderId;
  /** Hosts it contacts, for `permissions.network`. */
  hosts: string[];
  /** The key from its options; empty means "not configured". */
  keyOf: (o: O) => string;
  read: (ctx: ReadContext, o: O) => Promise<Omit<Account, 'provider'>>;
}

export interface ProviderOptions {
  deepseek: { apiKey: string; lowBalance: number };
  kimi: { apiKey: string; region: 'cn' | 'global'; lowBalance: number };
  openai: { adminKey: string; monthlyBudget: number };
}

/** A response that isn't what the docs promise: bad-response, never a crash. */
export class ShapeError extends Error {
  constructor(what: string) {
    super(`unexpected response: ${what}`);
    this.name = 'ShapeError';
  }
}

/** Numbers that some APIs send as strings ("110.00"). */
export function num(v: unknown, what: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ShapeError(what);
  return n;
}

/** Thresholds: amber at or under `lowBalance`, red when empty or the provider says no more calls. */
export function balanceLevel(a: Account): 'alert' | 'warn' | 'ok' {
  if (a.available === false || (a.balance && a.balance.amount <= 0)) return 'alert';
  if (a.balance && a.lowBalance && a.balance.amount <= a.lowBalance) return 'warn';
  if (a.spendMonth && a.monthlyBudget) {
    const r = a.spendMonth.amount / a.monthlyBudget;
    return r >= 1 ? 'alert' : r >= 0.8 ? 'warn' : 'ok';
  }
  return 'ok';
}
