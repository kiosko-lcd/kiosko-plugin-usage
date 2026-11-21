/**
 * Balances and spend read from the providers' own billing APIs, with an API
 * key: DeepSeek, Moonshot (Kimi) and OpenAI. Each provider is a small
 * reader (`providers/*.ts`) that turns its JSON into an `Account`; this
 * module runs the configured ones, keeps them polite (timeouts, backoff,
 * Retry-After) and never lets a key reach a log or an error message.
 */
import { createHash } from 'node:crypto';
import { createHttp, HttpError, type HttpClient } from '@kiosko/sdk';
import { ShapeError, type Account, type AccountError, type AccountsData, type Provider, type ProviderId, type ProviderOptions } from './account.ts';
import { deepseek } from './providers/deepseek.ts';
import { kimi } from './providers/kimi.ts';
import { openai } from './providers/openai.ts';

export const PROVIDERS = { deepseek, kimi, openai } as const;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function classify(err: unknown): AccountError {
  if (err instanceof ShapeError) return 'bad-response';
  if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403) return 'auth';
    if (err.status === 429) return 'rate';
    if (err.status >= 500) return 'down';
    if (/not JSON/.test(err.message)) return 'bad-response';
    return err.status === 402 ? 'auth' : 'down';
  }
  return 'network';
}

const MIN = 60_000;
/** After a failure: 5, 10, 20, 40, then every 60 minutes. A bad key waits an hour (new options start afresh). */
export function backoffMs(failures: number, error: AccountError): number {
  if (error === 'auth') return 60 * MIN;
  return Math.min(60 * MIN, 5 * MIN * 2 ** Math.max(0, failures - 1));
}

interface State {
  last?: Omit<Account, 'provider'>;
  failures: number;
  error?: AccountError;
  retryAt?: number;
}

/** A fingerprint of the key, so the state follows the key without keeping it around in clear. */
const fingerprint = (id: string, key: string) => `${id}:${createHash('sha256').update(key).digest('hex').slice(0, 12)}`;

/** Each request gives up on its own after this long. */
export const REQUEST_TIMEOUT_MS = 15_000;

export interface Accounts {
  read: (o: ProviderOptions, signal: AbortSignal, now?: number) => Promise<AccountsData>;
}

/**
 * The reader of the `usage/accounts` source. Keeps, per provider and key,
 * the last good figures and the backoff: a provider that failed is not
 * asked again before `retryAt`, and its row keeps the last figures with
 * the error. Providers are asked in parallel; one failing never hides the
 * others.
 */
export function createAccounts(o: { http?: HttpClient; log?: (msg: string) => void } = {}): Accounts {
  const http = o.http ?? createHttp({ agent: 'kiosko-plugin-usage' });
  const log = o.log ?? (() => {});
  const states = new Map<string, State>();
  return {
    async read(opts, signal, now = Date.now()) {
      const jobs = PROVIDER_IDS.map(async (id): Promise<Account | null> => {
        const p = PROVIDERS[id] as Provider<unknown>;
        const po = opts[id];
        const key = p.keyOf(po).trim();
        if (!key) return null;
        const fp = fingerprint(id, key);
        const st = states.get(fp) ?? { failures: 0 };
        states.set(fp, st);
        const extra = { lowBalance: (po as { lowBalance?: number }).lowBalance, monthlyBudget: (po as { monthlyBudget?: number }).monthlyBudget };
        const known = Object.fromEntries(Object.entries(extra).filter(([, v]) => typeof v === 'number' && v > 0));
        if (st.retryAt && st.retryAt > now) return { provider: id, ...st.last, ...known, ...(st.error ? { error: st.error } : {}), retryAt: st.retryAt };
        try {
          const req = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
          const got = await p.read({ http, key, signal: req, now }, po);
          st.last = { ...got, updatedAt: now };
          st.failures = 0;
          delete st.error;
          delete st.retryAt;
          return { provider: id, ...st.last, ...known };
        } catch (err) {
          if (signal.aborted) throw err;
          const error = classify(err);
          st.failures++;
          st.error = error;
          // The server's own word wins when it gave one (Retry-After).
          const told = err instanceof HttpError ? err.retryAt : undefined;
          st.retryAt = Math.max(told ?? 0, now + backoffMs(st.failures, error));
          // Only the kind and the host: the key is in a header, never in the message.
          log(`${id}: ${error} (${err instanceof Error ? err.message : 'failed'}); next try ${new Date(st.retryAt).toISOString()}`);
          return { provider: id, ...st.last, ...known, error, retryAt: st.retryAt };
        }
      });
      const accounts = (await Promise.all(jobs)).filter((a): a is Account => a !== null);
      return { accounts };
    },
  };
}

export * from './account.ts';
