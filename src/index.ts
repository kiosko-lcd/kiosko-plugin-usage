/**
 * Claude Code usage, read with `ccusage` from the local logs: the limit
 * windows of a subscription (or spend against caps on the API), today's
 * tokens by model and the spend of the last 5-hour blocks. Ported from the
 * aimonitor usage rail.
 */
import { definePlugin, defineSource, defineWidget, t } from '@kiosko/sdk';
import { SPARK_BLOCKS, execRunner, readUsage, type UsageSnapshot } from './ccusage.ts';
import { USAGE_SOURCE, drawBlocks, drawRail, level, railRatios, usageOf } from './draw.ts';
import { usageMax } from './demo.ts';

export type { UsageSnapshot, UsageWindow, UsageSpend, BlockPoint } from './ccusage.ts';

export const ccusageSource = defineSource({
  id: 'ccusage',
  name: { en: 'Claude Code usage (ccusage)', es: 'Consumo de Claude Code (ccusage)', de: 'Claude-Code-Nutzung (ccusage)', 'zh-Hant': 'Claude Code 用量（ccusage）', 'zh-Hans': 'Claude Code 用量（ccusage）' },
  description: {
    en: 'Runs ccusage, every minute by default and never more often. Each run walks the whole Claude Code history (a few seconds of CPU).',
    es: 'Ejecuta ccusage, cada minuto por defecto y nunca más a menudo. Cada pasada recorre todo el historial de Claude Code (unos segundos de CPU).',
    de: 'Führt ccusage aus, standardmäßig jede Minute und nie öfter. Jeder Lauf geht den gesamten Claude-Code-Verlauf durch (ein paar Sekunden CPU).',
    'zh-Hant': '執行 ccusage，預設每分鐘一次，且不會更頻繁。每次執行都會掃描完整的 Claude Code 歷史（耗費數秒 CPU）。',
    'zh-Hans': '运行 ccusage，默认每分钟一次，且不会更频繁。每次运行都会遍历完整的 Claude Code 历史（耗费几秒 CPU）。',
  },
  options: t.object({
    bin: t.string({
      default: 'ccusage',
      risk: 'exec',
      label: { en: 'ccusage command', es: 'Comando de ccusage', de: 'ccusage-Befehl', 'zh-Hant': 'ccusage 指令', 'zh-Hans': 'ccusage 命令' },
      help: { en: 'Looked up in PATH unless it is a full path. May carry arguments, e.g. "npx ccusage".', es: 'Se busca en el PATH salvo que sea una ruta completa. Puede llevar argumentos, p. ej. "npx ccusage".', de: 'Wird im PATH gesucht, sofern es kein vollständiger Pfad ist. Darf Argumente enthalten, z. B. „npx ccusage“.', 'zh-Hant': '除非是完整路徑，否則會在 PATH 中尋找。可帶參數，例如 "npx ccusage"。', 'zh-Hans': '除非是完整路径，否则在 PATH 中查找。可带参数，例如 "npx ccusage"。' },
    }),
    mode: t.enum(['max', 'api'] as const, {
      label: { en: 'Plan', es: 'Plan', de: 'Tarif', 'zh-Hant': '方案', 'zh-Hans': '套餐' },
      labels: { max: { en: 'Subscription: limit windows', es: 'Suscripción: ventanas de límite', de: 'Abo: Limit-Fenster', 'zh-Hant': '訂閱：限制時段', 'zh-Hans': '订阅：限额窗口' }, api: { en: 'API: spend against caps', es: 'API: gasto contra topes', de: 'API: Ausgaben gegen Obergrenzen', 'zh-Hant': 'API：花費對照上限', 'zh-Hans': 'API：花费对照上限' } },
    }),
    dailyCap: t.number({ default: 25, min: 0, step: 1, unit: 'USD', label: { en: 'Daily cap (API)', es: 'Tope diario (API)', de: 'Tageslimit (API)', 'zh-Hant': '每日上限（API）', 'zh-Hans': '每日上限（API）' } }),
    monthlyCap: t.number({ default: 400, min: 0, step: 10, unit: 'USD', label: { en: 'Monthly cap (API)', es: 'Tope mensual (API)', de: 'Monatslimit (API)', 'zh-Hant': '每月上限（API）', 'zh-Hans': '每月上限（API）' } }),
    calibration: t.object(
      {
        metric: t.enum(['cost', 'tokens'] as const, { label: { en: 'Measure', es: 'Medida', de: 'Maß', 'zh-Hant': '計量方式', 'zh-Hans': '计量方式' }, labels: { cost: { en: 'Equivalent cost', es: 'Coste equivalente', de: 'Gegenwert in Kosten', 'zh-Hant': '等值成本', 'zh-Hans': '等效成本' }, tokens: { en: 'Tokens', es: 'Tokens', de: 'Tokens', 'zh-Hant': 'Token 數', 'zh-Hans': 'Token 数' } } }),
        lookbackDays: t.integer({ default: 30, min: 0, max: 365, label: { en: 'Days of history (0 = all)', es: 'Días de histórico (0 = todo)', de: 'Tage Verlauf (0 = alle)', 'zh-Hant': '歷史天數（0 = 全部）', 'zh-Hans': '历史天数（0 = 全部）' } }),
        percentile: t.integer({ default: 100, min: 1, max: 100, slider: true, unit: '%', label: { en: 'Percentile that marks 100 %', es: 'Percentil que marca el 100 %', de: 'Perzentil, das 100 % markiert', 'zh-Hant': '標示 100 % 的百分位數', 'zh-Hans': '标记 100 % 的百分位数' } }),
      },
      {
        advanced: true,
        label: { en: 'Calibration (subscription)', es: 'Calibración (suscripción)', de: 'Kalibrierung (Abo)', 'zh-Hant': '校準（訂閱）', 'zh-Hans': '校准（订阅）' },
        help: {
          en: 'ccusage doesn’t know your plan’s limit, so a full bar is your own busiest block or week.',
          es: 'ccusage no conoce el límite del plan, así que la barra llena es tu bloque o semana más cargados.',
          de: 'ccusage kennt das Limit deines Tarifs nicht, daher ist ein voller Balken dein eigener intensivster Block bzw. deine intensivste Woche.',
          'zh-Hant': 'ccusage 不知道你方案的限額，因此滿格代表你自己用量最高的區塊或週。',
          'zh-Hans': 'ccusage 不知道你套餐的限额，因此满条代表你自己用量最高的区块或周。',
        },
      },
    ),
  }),
  intervalMs: 60_000,
  // Three ccusage runs of a few seconds of CPU each: faster than this, the panel would cost more than the usage it shows.
  minIntervalMs: 60_000,
  // Each run gives up after 30 s on its own.
  timeoutMs: 120_000,
  read: (ctx): Promise<UsageSnapshot> => readUsage(ctx.options, execRunner(ctx.options.bin, ctx.signal), Date.now(), ctx.log),
  demo: ({ now }) => usageMax(now),
});

const thresholds = {
  warn: t.integer({ default: 60, min: 0, max: 100, unit: '%', slider: true, label: { en: 'Amber from', es: 'Ámbar desde', de: 'Gelb ab', 'zh-Hant': '琥珀色門檻', 'zh-Hans': '琥珀色阈值' }, help: { en: 'How full a bar is.', es: 'Lo llena que está una barra.', de: 'Wie voll ein Balken ist.', 'zh-Hant': '長條的填滿程度。', 'zh-Hans': '条形的填充程度。' } }),
  alert: t.integer({ default: 85, min: 0, max: 100, unit: '%', slider: true, label: { en: 'Red from', es: 'Rojo desde', de: 'Rot ab', 'zh-Hant': '紅色門檻', 'zh-Hans': '红色阈值' } }),
};

export const railWidget = defineWidget({
  id: 'rail',
  name: { en: 'Usage', es: 'Consumo', de: 'Nutzung', 'zh-Hant': '用量', 'zh-Hans': '用量' },
  description: {
    en: 'Limit windows (or spend against your caps) as bars with their reset time, and today’s tokens by model.',
    es: 'Las ventanas de límite (o el gasto contra tus topes) en barras con su reinicio, y los tokens de hoy por modelo.',
    de: 'Limit-Fenster (oder Ausgaben gegen deine Obergrenzen) als Balken mit ihrer Reset-Zeit, und die heutigen Tokens nach Modell.',
    'zh-Hant': '以長條顯示各限制時段（或相對於上限的花費）及其重設時間，並列出今日各模型的 token。',
    'zh-Hans': '以条形显示各限额窗口（或相对上限的花费）及其重置时间，并列出今日各模型的 token。',
  },
  icon: 'gauge',
  category: 'agents',
  tags: ['claude', 'ccusage', 'tokens', 'cost'],
  size: { min: { w: 220, h: 200 }, preferred: { w: 380, h: 390 } },
  options: t.object({
    bars: t.integer({ default: 2, min: 1, max: 2, label: { en: 'Bars', es: 'Barras', de: 'Balken', 'zh-Hant': '長條', 'zh-Hans': '条形' } }),
    models: t.integer({ default: 3, min: 0, max: 8, label: { en: 'Models listed', es: 'Modelos listados', de: 'Aufgeführte Modelle', 'zh-Hant': '列出的模型數', 'zh-Hans': '列出的模型数' }, help: { en: '0 = only today\'s total.', es: '0 = solo el total de hoy.', de: '0 = nur die heutige Summe.', 'zh-Hant': '0 = 僅顯示今日總計。', 'zh-Hans': '0 = 仅显示今日总计。' } }),
    ...thresholds,
  }),
  sources: [USAGE_SOURCE],
  redraw: 'minute',
  render(g, ctx) {
    drawRail(g, ctx, ctx.options);
  },
  // Ambient information: only worth lighting the panel for when a bar is in the red.
  idle: ({ sources, options }) => {
    const u = usageOf(sources);
    return !u || !railRatios(u).some((r) => level(r, options) === 'alert');
  },
  demo: ({ now }) => ({ sources: { [USAGE_SOURCE]: usageMax(now) } }),
});

export const blocksWidget = defineWidget({
  id: 'blocks',
  name: { en: 'Spend per 5-hour block', es: 'Gasto por bloque (5 h)', de: 'Ausgaben pro 5-Stunden-Block', 'zh-Hant': '每 5 小時區塊的花費', 'zh-Hans': '每 5 小时区块的花费' },
  description: {
    en: 'The equivalent cost of the last 5-hour blocks (twelve by default), the running one highlighted: is today unusual?',
    es: 'El coste equivalente de los últimos bloques de 5 horas (doce por defecto), con el actual destacado: ¿hoy es un día raro?',
    de: 'Der Kostengegenwert der letzten 5-Stunden-Blöcke (standardmäßig zwölf), der laufende hervorgehoben: Ist heute ungewöhnlich?',
    'zh-Hant': '最近幾個 5 小時區塊（預設十二個）的等值成本，目前的區塊會醒目標示：今天是否異常？',
    'zh-Hans': '最近几个 5 小时区块（默认十二个）的等效成本，当前区块高亮显示：今天是否异常？',
  },
  icon: 'bar-chart',
  category: 'agents',
  tags: ['claude', 'ccusage', 'cost', 'sparkline'],
  size: { min: { w: 200, h: 100 }, preferred: { w: 600, h: 200 } },
  sources: [USAGE_SOURCE],
  options: t.object({
    blocks: t.integer({ default: 12, min: 4, max: SPARK_BLOCKS, label: { en: 'Blocks shown', es: 'Bloques mostrados', de: 'Angezeigte Blöcke', 'zh-Hant': '顯示的區塊數', 'zh-Hans': '显示的区块数' }, help: { en: '12 = two and a half days; 48 = ten.', es: '12 = dos días y medio; 48 = diez.', de: '12 = zweieinhalb Tage; 48 = zehn.', 'zh-Hant': '12 = 兩天半；48 = 十天。', 'zh-Hans': '12 = 两天半；48 = 十天。' } }),
  }),
  render(g, ctx) {
    drawBlocks(g, ctx, ctx.options.blocks);
  },
  idle: () => true,
  demo: ({ now }) => ({ sources: { [USAGE_SOURCE]: usageMax(now) } }),
});

export default definePlugin({
  id: 'usage',
  name: { en: 'AI usage', es: 'Consumo de IA', de: 'KI-Nutzung', 'zh-Hant': 'AI 用量', 'zh-Hans': 'AI 用量' },
  version: '0.2.1',
  languages: ['en', 'es', 'de', 'zh-Hant', 'zh-Hans'],
  sdk: '^0.2.0',
  permissions: { exec: ['ccusage'] },
  description: {
    en: 'How much Claude Code you are burning, from ccusage: limit windows or spend, tokens by model, spend per block.',
    es: 'Cuánto Claude Code estás gastando, según ccusage: ventanas de límite o gasto, tokens por modelo y gasto por bloque.',
    de: 'Wie viel Claude Code du verbrauchst, laut ccusage: Limit-Fenster oder Ausgaben, Tokens nach Modell, Ausgaben pro Block.',
    'zh-Hant': '你用掉了多少 Claude Code，資料來自 ccusage：限制時段或花費、各模型的 token、每個區塊的花費。',
    'zh-Hans': '你消耗了多少 Claude Code，数据来自 ccusage：限额窗口或花费、各模型的 token、每个区块的花费。',
  },
  author: 'Kiosko',
  license: 'MIT',
  icon: 'gauge',
  widgets: [railWidget, blocksWidget],
  sources: [ccusageSource],
});
