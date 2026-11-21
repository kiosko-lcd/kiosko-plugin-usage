/**
 * Sample usage for the gallery, the editor and the tests (the original
 * fixtures), relative to `now`.
 */
import type { AccountsData } from './account.ts';
import type { AgentsSnapshot, AgentUsage } from './agents.ts';
import type { BlockPoint, UsageSnapshot } from './ccusage.ts';

const min = (n: number) => n * 60_000;

/** Forty-eight 5-hour blocks (ten days) with a recognisable shape; the last one is running. */
function blocks(now: number): BlockPoint[] {
  const last12 = [18.4, 46.2, 3.1, 31.7, 29.5, 1.2, 12.8, 9.4, 22.6, 5.7, 38.9, 14.3];
  // The days before: quieter nights, busier afternoons, a calm weekend.
  const before = Array.from({ length: 36 }, (_, i) => Math.round((i % 5 === 1 || i % 5 === 3 ? 6 + ((i * 7) % 30) : 1 + ((i * 3) % 5)) * (i >= 15 && i < 25 ? 0.3 : 1) * 10) / 10);
  const costs = [...before, ...last12];
  return costs.map((cost, i) => ({ cost, startTime: now - (costs.length - 1 - i) * 5 * 3_600_000, active: i === costs.length - 1 }));
}

export function usageMax(now: number): UsageSnapshot {
  return {
    mode: 'max',
    windows: [
      { id: 'block', ratio: 0.42, resetsAt: now + min(134) },
      { id: 'week', ratio: 0.88, resetsAt: now + min(3_180) },
    ],
    blockHistory: blocks(now),
    tokensToday: 4_230_000,
    byModel: [
      { model: 'opus-5', tokens: 2_900_000 },
      { model: 'sonnet-5', tokens: 1_100_000 },
      { model: 'haiku-4.5', tokens: 230_000 },
    ],
  };
}

export function usageApi(now: number): UsageSnapshot {
  return {
    mode: 'api',
    spend: [
      { id: 'day', amount: 11.4, cap: 25 },
      { id: 'month', amount: 268, cap: 400 },
    ],
    blockHistory: blocks(now),
    tokensToday: 4_230_000,
    byModel: [
      { model: 'opus-5', tokens: 2_900_000 },
      { model: 'sonnet-5', tokens: 1_330_000 },
    ],
  };
}

/** Mainland China: the providers offered there. */
const mainland = (locale: string) => /^zh-(Hans|CN|SG)/i.test(locale);

/**
 * Sample accounts for the gallery: DeepSeek and Kimi in CNY in simplified
 * Chinese (Kimi running low), and elsewhere their international accounts in
 * USD next to OpenAI's monthly spend.
 */
export function accountsDemo(now: number, locale: string): AccountsData {
  if (mainland(locale)) {
    return {
      accounts: [
        { provider: 'deepseek', balance: { amount: 86.4, currency: 'CNY' }, parts: [{ id: 'toppedUp', amount: 80 }, { id: 'granted', amount: 6.4 }], available: true, lowBalance: 10, updatedAt: now - min(3) },
        { provider: 'kimi', balance: { amount: 12.35, currency: 'CNY' }, parts: [{ id: 'cash', amount: 2.35 }, { id: 'voucher', amount: 10 }], available: true, lowBalance: 20, updatedAt: now - min(3) },
      ],
    };
  }
  return {
    accounts: [
      { provider: 'openai', spendToday: { amount: 3.2, currency: 'USD' }, spendMonth: { amount: 42.1, currency: 'USD' }, monthlyBudget: 100, byModel: [{ model: 'gpt-5.5', tokens: 1_840_000 }, { model: 'gpt-5-mini', tokens: 420_000 }], updatedAt: now - min(4) },
      { provider: 'deepseek', balance: { amount: 18.2, currency: 'USD' }, parts: [{ id: 'toppedUp', amount: 18.2 }, { id: 'granted', amount: 0 }], available: true, lowBalance: 5, updatedAt: now - min(4) },
      { provider: 'kimi', balance: { amount: 3.45, currency: 'USD' }, parts: [{ id: 'cash', amount: 3.45 }, { id: 'voucher', amount: 0 }], available: true, lowBalance: 5, updatedAt: now - min(4) },
    ],
  };
}

/** Sample coding agents: Kimi CLI and Qwen Code in simplified Chinese, Claude Code and Codex elsewhere. */
export function agentsDemo(_now: number, locale: string): AgentsSnapshot {
  const agents: AgentUsage[] = mainland(locale)
    ? [
        { id: 'kimi', tokensToday: 3_120_000, costToday: 2.84, tokensMonth: 61_400_000, costMonth: 48.9 },
        { id: 'qwen', tokensToday: 1_460_000, costToday: 1.12, tokensMonth: 22_800_000, costMonth: 17.3 },
        { id: 'opencode', tokensToday: 380_000, costToday: 0.21, tokensMonth: 9_100_000, costMonth: 5.6 },
      ]
    : [
        { id: 'claude', tokensToday: 4_230_000, costToday: 11.4, tokensMonth: 96_000_000, costMonth: 268 },
        { id: 'codex', tokensToday: 1_150_000, costToday: 2.9, tokensMonth: 30_500_000, costMonth: 61.2 },
        { id: 'gemini', tokensToday: 240_000, costToday: 0.3, tokensMonth: 4_800_000, costMonth: 6.1 },
      ];
  const byModel = mainland(locale)
    ? [
        { model: 'kimi-for-coding', tokens: 3_120_000, agent: 'kimi' },
        { model: 'qwen3-coder-plus', tokens: 1_460_000, agent: 'qwen' },
        { model: 'deepseek-v4-pro', tokens: 380_000, agent: 'opencode' },
      ]
    : [
        { model: 'opus-5', tokens: 2_900_000, agent: 'claude' },
        { model: 'sonnet-5', tokens: 1_330_000, agent: 'claude' },
        { model: 'gpt-5-codex', tokens: 1_150_000, agent: 'codex' },
        { model: 'gemini-3-pro', tokens: 240_000, agent: 'gemini' },
      ];
  return {
    agents,
    byModel,
    tokensToday: agents.reduce((s, a) => s + a.tokensToday, 0),
    costToday: agents.reduce((s, a) => s + a.costToday, 0),
    costMonth: agents.reduce((s, a) => s + a.costMonth, 0),
  };
}
