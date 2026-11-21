/**
 * Coding agents' usage from their local logs, through ccusage's unified
 * report (ccusage 20 or newer): Claude Code, Codex, Kimi CLI, Qwen Code,
 * Gemini CLI, OpenCode, Copilot CLI… whatever ccusage detects, one row per
 * agent. One run of
 *
 *   ccusage daily --by-agent --json --since <first of the month>
 *
 * gives today's and this month's figures. Docs:
 * https://github.com/ccusage/ccusage/blob/main/docs/guide/json-output.md
 * (`--by-agent` adds an `agents` array to each row). Costs are ccusage's
 * estimates in US dollars from its pricing table (an equivalent cost, also
 * for flat-rate plans), never a bill.
 */
import { PluginError } from '@kiosko/sdk';
import type { Run } from './ccusage.ts';

export interface CcusageAgentRow {
  agent?: string;
  totalTokens?: number;
  totalCost?: number;
  modelBreakdowns?: { modelName?: string; cost?: number; inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number }[];
}
export interface CcusageUnifiedRow extends CcusageAgentRow {
  period?: string;
  agents?: CcusageAgentRow[];
}
export interface CcusageUnifiedReport {
  daily?: CcusageUnifiedRow[];
}

export interface AgentUsage {
  /** ccusage's source id: `claude`, `codex`, `kimi`, `qwen`… */
  id: string;
  tokensToday: number;
  costToday: number;
  tokensMonth: number;
  costMonth: number;
}

/** Data of the `usage/agents` source. Costs are USD equivalents. */
export interface AgentsSnapshot {
  agents: AgentUsage[];
  /** Today's tokens by model, all agents together, most first. */
  byModel: { model: string; tokens: number; agent: string }[];
  tokensToday: number;
  costToday: number;
  costMonth: number;
}

export interface AgentsOptions {
  bin: string;
  offline: boolean;
}

/** `YYYY-MM-DD` of `now` in local time, as ccusage groups days. */
export function localDay(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const tokensOf = (m: NonNullable<CcusageAgentRow['modelBreakdowns']>[number]) => (m.inputTokens ?? 0) + (m.outputTokens ?? 0) + (m.cacheCreationTokens ?? 0) + (m.cacheReadTokens ?? 0);

/** The unified report → per-agent figures. Pure. Throws when the rows have no `agents` (ccusage older than 20). */
export function buildAgents(report: CcusageUnifiedReport, now: number): AgentsSnapshot {
  const rows = report.daily ?? [];
  if (rows.length && !rows.some((r) => Array.isArray(r.agents))) throw new OldCcusage();
  const today = localDay(now);
  const month = today.slice(0, 7);
  const by = new Map<string, AgentUsage>();
  const models = new Map<string, { model: string; tokens: number; agent: string }>();
  for (const row of rows) {
    const period = row.period ?? '';
    if (!period.startsWith(month)) continue;
    for (const a of row.agents ?? []) {
      const id = a.agent ?? 'other';
      const u = by.get(id) ?? { id, tokensToday: 0, costToday: 0, tokensMonth: 0, costMonth: 0 };
      u.tokensMonth += a.totalTokens ?? 0;
      u.costMonth += a.totalCost ?? 0;
      if (period === today) {
        u.tokensToday += a.totalTokens ?? 0;
        u.costToday += a.totalCost ?? 0;
        for (const m of a.modelBreakdowns ?? []) {
          if (!m.modelName) continue;
          const k = `${id}\u0000${m.modelName}`;
          const e = models.get(k) ?? { model: m.modelName.replace(/^claude-/, ''), tokens: 0, agent: id };
          e.tokens += tokensOf(m);
          models.set(k, e);
        }
      }
      by.set(id, u);
    }
  }
  // Busiest first today, then this month.
  const agents = [...by.values()].sort((a, b) => b.costToday - a.costToday || b.tokensToday - a.tokensToday || b.costMonth - a.costMonth);
  return {
    agents,
    byModel: [...models.values()].filter((m) => m.tokens > 0).sort((a, b) => b.tokens - a.tokens),
    tokensToday: agents.reduce((s, a) => s + a.tokensToday, 0),
    costToday: agents.reduce((s, a) => s + a.costToday, 0),
    costMonth: agents.reduce((s, a) => s + a.costMonth, 0),
  };
}

export class OldCcusage extends PluginError {
  constructor() {
    super({
      en: 'This needs ccusage 20 or newer (its report by agent): update it with npm install -g ccusage@latest',
      es: 'Hace falta ccusage 20 o posterior (su informe por agente): actualízalo con npm install -g ccusage@latest',
      de: 'Dafür braucht es ccusage 20 oder neuer (Bericht nach Agent): aktualisiere es mit npm install -g ccusage@latest',
      'zh-Hant': '需要 ccusage 20 或更新版本（按代理分列的報告）：請以 npm install -g ccusage@latest 更新',
      'zh-Hans': '需要 ccusage 20 或更高版本（按智能体分列的报告）：请用 npm install -g ccusage@latest 更新',
    });
  }
}

/** Runs ccusage once and builds the snapshot. */
export async function readAgents(o: AgentsOptions, run: Run, now = Date.now()): Promise<AgentsSnapshot> {
  const since = `${localDay(now).slice(0, 7).replace('-', '')}01`;
  try {
    const report = (await run(['daily', '--by-agent', '--json', '--since', since, ...(o.offline ? ['--offline'] : [])])) as CcusageUnifiedReport;
    return buildAgents(report ?? {}, now);
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      throw new PluginError({
        en: `ccusage not found ("${o.bin}"): install it (npm install -g ccusage) or set its full path in the source options`,
        es: `No se encuentra ccusage («${o.bin}»): instálalo (npm install -g ccusage) o pon su ruta completa en las opciones de la fuente`,
        de: `ccusage nicht gefunden („${o.bin}“): Installiere es (npm install -g ccusage) oder trage seinen vollständigen Pfad in den Optionen der Datenquelle ein`,
        'zh-Hant': `找不到 ccusage（「${o.bin}」）：請安裝它（npm install -g ccusage），或在資料來源選項中填入它的完整路徑`,
        'zh-Hans': `找不到 ccusage（“${o.bin}”）：请安装它（npm install -g ccusage），或在数据源选项中填写它的完整路径`,
      }, { cause: err });
    }
    throw err;
  }
}
