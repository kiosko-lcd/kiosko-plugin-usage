/**
 * Painting the providers' accounts (`usage/balance`, `usage/summary`) and
 * the coding agents (`usage/agents`). Every text has a floor of 11 px, so
 * Chinese stays readable on a small panel.
 */
import type { Graphics, Localized, RenderContext } from '@kiosko/sdk';
import { balanceLevel, type Account, type AccountError, type AccountsData, type ProviderId } from './account.ts';
import type { AgentsSnapshot } from './agents.ts';
import { currency, tokens } from './format.ts';

type Ctx = Pick<RenderContext<unknown, unknown>, 'box' | 'theme' | 'kit' | 'now' | 't' | 'sources' | 'fmt' | 'locale'>;

export const ACCOUNTS_SOURCE = 'usage/accounts';
export const AGENTS_SOURCE = 'usage/agents';

/** Smallest text painted, px: below it Chinese is a smudge on a panel. */
export const MIN_PX = 11;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const px = (n: number) => Math.max(MIN_PX, Math.round(n));
const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

export const PROVIDER_NAMES: Record<ProviderId, Localized> = {
  deepseek: { en: 'DeepSeek', es: 'DeepSeek', de: 'DeepSeek', 'zh-Hant': 'DeepSeek', 'zh-Hans': 'DeepSeek' },
  kimi: { en: 'Kimi', es: 'Kimi', de: 'Kimi', 'zh-Hant': 'Kimi', 'zh-Hans': 'Kimi' },
  openai: { en: 'OpenAI', es: 'OpenAI', de: 'OpenAI', 'zh-Hant': 'OpenAI', 'zh-Hans': 'OpenAI' },
};

/** ccusage's source ids → the agent's own name. Unknown ones keep their id. */
export const AGENT_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  kimi: 'Kimi CLI',
  qwen: 'Qwen Code',
  gemini: 'Gemini CLI',
  opencode: 'OpenCode',
  copilot: 'Copilot CLI',
  amp: 'Amp',
  droid: 'Droid',
  codebuff: 'Codebuff',
  cline: 'Cline',
  goose: 'Goose',
  kilo: 'Kilo',
  grok: 'Grok Build',
  antigravity: 'Antigravity',
  zcode: 'ZCode',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  pi: 'pi',
};
export const agentName = (id: string) => AGENT_NAMES[id] ?? id;

export const ATEXT = {
  balance: { en: 'Balance', es: 'Saldo', de: 'Guthaben', 'zh-Hant': '餘額', 'zh-Hans': '余额' },
  month: { en: 'This month', es: 'Este mes', de: 'Diesen Monat', 'zh-Hant': '本月花費', 'zh-Hans': '本月消费' },
  today: { en: 'Today', es: 'Hoy', de: 'Heute', 'zh-Hant': '今日', 'zh-Hans': '今日' },
  todayV: { en: 'today {v}', es: 'hoy {v}', de: 'heute {v}', 'zh-Hant': '今日 {v}', 'zh-Hans': '今日 {v}' },
  budgetV: { en: 'of {v}', es: 'de {v}', de: 'von {v}', 'zh-Hant': '預算 {v}', 'zh-Hans': '预算 {v}' },
  toppedUp: { en: 'topped up {v}', es: 'recargado {v}', de: 'aufgeladen {v}', 'zh-Hant': '儲值 {v}', 'zh-Hans': '充值 {v}' },
  granted: { en: 'granted {v}', es: 'regalado {v}', de: 'geschenkt {v}', 'zh-Hant': '贈送 {v}', 'zh-Hans': '赠送 {v}' },
  cash: { en: 'cash {v}', es: 'efectivo {v}', de: 'bar {v}', 'zh-Hant': '現金 {v}', 'zh-Hans': '现金 {v}' },
  voucher: { en: 'vouchers {v}', es: 'cupones {v}', de: 'Gutscheine {v}', 'zh-Hant': '抵用券 {v}', 'zh-Hans': '代金券 {v}' },
  low: { en: 'running low', es: 'queda poco', de: 'wird knapp', 'zh-Hant': '餘額偏低', 'zh-Hans': '余额偏低' },
  empty: { en: 'out of credit', es: 'sin saldo', de: 'kein Guthaben', 'zh-Hant': '餘額不足', 'zh-Hans': '余额不足' },
  noAccounts: {
    en: 'Add an API key in Settings → Data sources → AI accounts',
    es: 'Pon una clave de API en Ajustes → Fuentes de datos → Cuentas de IA',
    de: 'Trage einen API-Schlüssel ein: Einstellungen → Datenquellen → KI-Konten',
    'zh-Hant': '請到 設定 → 資料來源 → AI 帳戶 填入 API 金鑰',
    'zh-Hans': '请到 设置 → 数据源 → AI 账户 填写 API 密钥',
  },
  noAgents: { en: 'no agent usage this month', es: 'sin uso de agentes este mes', de: 'diesen Monat keine Agenten-Nutzung', 'zh-Hant': '本月尚無代理用量', 'zh-Hans': '本月暂无智能体用量' },
  agent: { en: 'Agent', es: 'Agente', de: 'Agent', 'zh-Hant': '代理', 'zh-Hans': '智能体' },
  tokensToday: { en: 'Tokens today', es: 'Tokens hoy', de: 'Tokens heute', 'zh-Hant': '今日 token', 'zh-Hans': '今日 token' },
  costToday: { en: 'Today', es: 'Hoy', de: 'Heute', 'zh-Hant': '今日', 'zh-Hans': '今日' },
  costMonth: { en: 'Month', es: 'Mes', de: 'Monat', 'zh-Hant': '本月', 'zh-Hans': '本月' },
  models: { en: 'Models today', es: 'Modelos hoy', de: 'Modelle heute', 'zh-Hant': '今日模型', 'zh-Hans': '今日模型' },
} satisfies Record<string, Localized>;

export const ERROR_TEXT: Record<AccountError, Localized> = {
  auth: { en: 'key refused', es: 'clave rechazada', de: 'Schlüssel abgelehnt', 'zh-Hant': '金鑰無效', 'zh-Hans': '密钥无效' },
  network: { en: 'no connection', es: 'sin conexión', de: 'keine Verbindung', 'zh-Hant': '無法連線', 'zh-Hans': '无法连接' },
  down: { en: 'provider down', es: 'proveedor caído', de: 'Anbieter gestört', 'zh-Hant': '服務異常', 'zh-Hans': '服务异常' },
  rate: { en: 'rate-limited', es: 'limitado', de: 'gedrosselt', 'zh-Hant': '已被限速', 'zh-Hans': '已限流' },
  'bad-response': { en: 'unexpected reply', es: 'respuesta rara', de: 'unerwartete Antwort', 'zh-Hant': '回應異常', 'zh-Hans': '响应异常' },
};

export function accountsOf(sources: Record<string, unknown>): AccountsData | undefined {
  const d = sources[ACCOUNTS_SOURCE] as AccountsData | undefined;
  return d && typeof d === 'object' && Array.isArray(d.accounts) ? d : undefined;
}

export function agentsOf(sources: Record<string, unknown>): AgentsSnapshot | undefined {
  const d = sources[AGENTS_SOURCE] as AgentsSnapshot | undefined;
  return d && typeof d === 'object' && Array.isArray(d.agents) ? d : undefined;
}

/** The figure an account is shown by: its balance, or this month's spend when there is no balance (OpenAI). */
export function headline(a: Account): { label: Localized; value: number; currency: string } | null {
  if (a.balance) return { label: ATEXT.balance, value: a.balance.amount, currency: a.balance.currency };
  if (a.spendMonth) return { label: ATEXT.month, value: a.spendMonth.amount, currency: a.spendMonth.currency };
  return null;
}

/** The small line under the figure: what it is made of, or today's spend and the budget. */
export function detail(ctx: Pick<Ctx, 't' | 'locale'>, a: Account): string {
  const { t, locale } = ctx;
  const money = (v: number, cur: string) => currency(v, cur, locale);
  if (a.balance) {
    const cur = a.balance.currency;
    const parts = (a.parts ?? []).filter((p) => p.amount !== 0 || p.id === 'cash').map((p) => fill(t(ATEXT[p.id]), { v: money(p.amount, cur) }));
    const more = (a.otherBalances ?? []).filter((b) => b.amount !== 0).map((b) => money(b.amount, b.currency));
    return [...parts, ...more].join(' · ');
  }
  const out: string[] = [];
  if (a.spendToday) out.push(fill(t(ATEXT.todayV), { v: money(a.spendToday.amount, a.spendToday.currency) }));
  if (a.spendMonth && a.monthlyBudget) out.push(fill(t(ATEXT.budgetV), { v: money(a.monthlyBudget, a.spendMonth.currency) }));
  return out.join(' · ');
}

/** Colour of an account's figure, and the word that goes with it when it isn't fine. */
function stateOf(ctx: Ctx, a: Account): { color: string; note: string | null; dim: boolean } {
  const c = ctx.theme.colors;
  if (a.error) return { color: headline(a) ? c.inkDim : c.inkFaint, note: ctx.t(ERROR_TEXT[a.error]), dim: true };
  const lv = balanceLevel(a);
  if (lv === 'alert') return { color: c.alert, note: a.balance ? ctx.t(ATEXT.empty) : null, dim: false };
  if (lv === 'warn') return { color: c.warn, note: a.balance ? ctx.t(ATEXT.low) : null, dim: false };
  return { color: c.ink, note: null, dim: false };
}

function quiet(g: Graphics, ctx: Ctx, text: Localized): void {
  const { box, kit, theme, t } = ctx;
  const size = px(Math.min(20, box.h * 0.16));
  const lines = kit.wrapLines(g, t(text), box.w, Math.max(1, Math.floor(box.h / (size * 1.3))), { size, family: theme.fonts.sans });
  lines.forEach((line, i) => kit.drawTracked(g, line, box.x, box.y + size * (1.1 + i * 1.3), { size, family: theme.fonts.sans, color: theme.colors.inkDim }));
}

export interface BalanceOptions {
  models: number;
}

/** One card per account: name, the big figure in its currency, what it is made of, and today's models if there is room. */
export function drawBalance(g: Graphics, ctx: Ctx, o: BalanceOptions): void {
  const { box, kit, theme, t } = ctx;
  const c = theme.colors;
  const data = accountsOf(ctx.sources);
  const accounts = data?.accounts ?? [];
  if (!accounts.length) {
    quiet(g, ctx, ATEXT.noAccounts);
    return;
  }
  // The grid whose cards come out largest (a card is drawn for 220 × 150 at scale 1).
  const gap = Math.round(clamp(box.w * 0.03, 8, 24));
  const grid = (cols: number) => {
    const rows = Math.ceil(accounts.length / cols);
    const cw = (box.w - gap * (cols - 1)) / cols;
    const ch = (box.h - gap * (rows - 1)) / rows;
    return { cols, cw, ch, scale: Math.min(cw / 220, ch / 150) };
  };
  const { cols, cw, ch } = accounts.map((_, i) => grid(i + 1)).reduce((a, b) => (b.scale > a.scale ? b : a));
  if (ch < 40) {
    drawSummary(g, ctx);
    return;
  }
  const s = clamp(Math.min(ch / 150, cw / 220), 0.6, 2);
  accounts.forEach((a, i) => {
    const x = box.x + (i % cols) * (cw + gap);
    const y = box.y + Math.floor(i / cols) * (ch + gap);
    if (i % cols > 0) {
      g.fillStyle = c.surfaceEdge;
      g.fillRect(Math.round(x - gap / 2), y, 1, ch);
    }
    const st = stateOf(ctx, a);
    const head = headline(a);
    // Name, and on the right the state word (low, refused…).
    const nameSize = px(17 * s);
    let cy = y + nameSize;
    // The state word goes next to the name when both fit whole, else first on the line under the figure.
    const name = t(PROVIDER_NAMES[a.provider]);
    const noteOpts = { size: nameSize, family: theme.fonts.sansBold, color: a.error ? c.inkDim : st.color, align: 'right' as const };
    const noteFits = !!st.note && kit.measureTracked(g, st.note, noteOpts) + Math.min(kit.measureTracked(g, name, { size: nameSize, family: theme.fonts.sansBold }), cw * 0.5) + 8 * s <= cw;
    const noteW = st.note && noteFits ? kit.drawTracked(g, st.note, x + cw, cy, noteOpts) : 0;
    kit.drawClipped(g, name, x, cy, Math.max(0, cw - noteW - 8 * s), { size: nameSize, family: theme.fonts.sansBold, tracking: 2 * s, smallCaps: nameSize >= 15, color: c.inkDim });
    // The figure, as large as the card allows.
    const room = y + ch - cy;
    const big = head ? currency(head.value, head.currency, ctx.locale) : '—';
    const want = Math.round(clamp(room * 0.42, MIN_PX, 64 * s));
    const bigSize = Math.max(MIN_PX, kit.fitSize(g, big, cw, { size: want, family: theme.fonts.monoBold }, MIN_PX));
    cy += Math.round(bigSize * 1.15 + 4 * s);
    kit.drawClipped(g, big, x, cy, cw, { size: bigSize, family: theme.fonts.monoBold, color: st.color });
    // What it is: "Balance" / "This month", then its parts.
    const small = px(14 * s);
    const line = [st.note && !noteFits ? st.note : '', head ? t(head.label) : '', detail(ctx, a)].filter(Boolean).join(' · ');
    if (line && cy + small * 1.5 <= y + ch) {
      cy += Math.round(small * 1.5);
      kit.drawClipped(g, line, x, cy, cw, { size: small, family: theme.fonts.mono, color: c.inkDim });
    }
    // Budget bar for a spend without a balance.
    if (!a.balance && a.spendMonth && a.monthlyBudget && cy + 14 * s <= y + ch) {
      const barY = Math.round(cy + 8 * s);
      const barH = Math.max(4, Math.round(8 * s));
      g.fillStyle = c.bg;
      g.fillRect(Math.round(x), barY, Math.round(cw), barH);
      g.fillStyle = st.color === c.ink ? c.info : st.color;
      g.fillRect(Math.round(x), barY, Math.max(2, Math.round(cw * clamp(a.spendMonth.amount / a.monthlyBudget, 0, 1))), barH);
      cy = barY + barH;
    }
    // Today's tokens by model.
    const lineH = Math.round(small * 1.45);
    for (const m of (a.byModel ?? []).slice(0, o.models)) {
      if (cy + lineH > y + ch) break;
      cy += lineH;
      const tw = kit.drawTracked(g, tokens(m.tokens), x + cw, cy, { size: small, family: theme.fonts.mono, color: c.inkDim, align: 'right' });
      kit.drawClipped(g, m.model, x, cy, Math.max(0, cw - tw - 8 * s), { size: small, family: theme.fonts.mono, color: c.inkDim });
    }
  });
}

/** One line per account: name, figure on the right, the state or detail in between when wide. For strips. */
export function drawSummary(g: Graphics, ctx: Ctx): void {
  const { box, kit, theme, t } = ctx;
  const c = theme.colors;
  const accounts = accountsOf(ctx.sources)?.accounts ?? [];
  if (!accounts.length) {
    quiet(g, ctx, ATEXT.noAccounts);
    return;
  }
  const rowH = clamp(box.h / accounts.length, MIN_PX * 1.5, 48);
  const shown = Math.max(1, Math.min(accounts.length, Math.floor(box.h / rowH)));
  const size = px(rowH * 0.56);
  accounts.slice(0, shown).forEach((a, i) => {
    const y = box.y + i * rowH + (rowH + size * 0.72) / 2;
    const st = stateOf(ctx, a);
    const head = headline(a);
    const fig = head ? currency(head.value, head.currency, ctx.locale) : (st.note ?? '—');
    const fw = kit.drawTracked(g, fig, box.x + box.w, y, head ? { size, family: theme.fonts.monoBold, color: st.color, align: 'right' } : { size: px(size * 0.85), family: theme.fonts.sansBold, color: c.inkDim, align: 'right' });
    const name = t(PROVIDER_NAMES[a.provider]);
    const nameW = Math.min(kit.measureTracked(g, name, { size, family: theme.fonts.sansBold }), box.w * 0.4);
    kit.drawClipped(g, name, box.x, y, Math.max(0, box.w - fw - 8), { size, family: theme.fonts.sansBold, color: c.inkDim });
    // In between: the state word, else the figure's detail, as far as it fits.
    const midX = box.x + nameW + Math.round(size * 0.8);
    const midW = box.x + box.w - fw - Math.round(size * 0.8) - midX;
    const spendNote = a.spendToday ? `${t(ATEXT.month)} · ${fill(t(ATEXT.todayV), { v: currency(a.spendToday.amount, a.spendToday.currency, ctx.locale) })}` : t(ATEXT.month);
    const mid = head && st.note ? st.note : head && !a.balance ? spendNote : '';
    const midSize = px(size * 0.78);
    // Whole, or its first part, or nothing: a clipped word is worse than none.
    const midOpts = { size: midSize, family: theme.fonts.sans, color: st.note ? st.color : c.inkFaint };
    const fits = [mid, mid.split(' · ')[0] ?? ''].find((m) => m && kit.measureTracked(g, m, midOpts) <= midW);
    if (fits) kit.drawTracked(g, fits, midX, y, midOpts);
  });
}

export interface AgentsWidgetOptions {
  models: number;
  month: boolean;
}

/** A small table of the coding agents: tokens and equivalent cost today, cost this month; today's models under it. */
export function drawAgents(g: Graphics, ctx: Ctx, o: AgentsWidgetOptions): void {
  const { box, kit, theme, t } = ctx;
  const c = theme.colors;
  const d = agentsOf(ctx.sources);
  if (!d || !d.agents.length) {
    quiet(g, ctx, ATEXT.noAgents);
    return;
  }
  const usd = (v: number) => currency(v, 'USD', ctx.locale);
  const s = clamp(Math.min(box.w / 420, box.h / 220), 0.6, 1.8);
  const head = px(13 * s);
  const size = px(18 * s);
  const rowH = Math.round(size * 1.6);
  // Columns from the right: month, today, tokens; dropped in that order when the names would not fit.
  const colW = Math.round(Math.max(kit.measureTracked(g, usd(999.99), { size, family: theme.fonts.monoBold }), 70 * s) + 20 * s);
  const tokW = Math.round(Math.max(kit.measureTracked(g, '999.9M', { size, family: theme.fonts.mono }), 60 * s) + 12 * s);
  const nameMin = Math.max(...d.agents.map((a) => Math.min(kit.measureTracked(g, agentName(a.id), { size, family: theme.fonts.sansBold }), 110 * s))) + 8 * s;
  const showMonth = o.month && box.w - 2 * colW - tokW >= nameMin;
  const showTokens = box.w - (showMonth ? 2 : 1) * colW - tokW >= nameMin;
  const xMonth = box.x + box.w;
  const xToday = showMonth ? xMonth - colW : xMonth;
  const xTok = xToday - colW;
  const nameW = Math.max(0, (showTokens ? xTok - tokW : xTok) - box.x);
  const headOpts = { size: head, family: theme.fonts.sansBold, color: c.inkFaint };
  let y = box.y + head;
  kit.drawClipped(g, t(ATEXT.agent), box.x, y, Math.max(0, nameW - 4), headOpts);
  if (showTokens) kit.drawTracked(g, kit.truncate(g, t(ATEXT.tokensToday), tokW + colW * 0.3, headOpts), xTok, y, { ...headOpts, align: 'right' });
  kit.drawTracked(g, t(ATEXT.costToday), xToday, y, { ...headOpts, align: 'right' });
  if (showMonth) kit.drawTracked(g, t(ATEXT.costMonth), xMonth, y, { ...headOpts, align: 'right' });
  y += Math.round(head * 0.6);
  g.fillStyle = c.surfaceEdge;
  g.fillRect(box.x, Math.round(y), box.w, 1);
  const bottom = box.y + box.h;
  let shown = 0;
  for (const a of d.agents) {
    if (y + rowH > bottom) break;
    y += rowH;
    shown++;
    const base = y - Math.round((rowH - size) / 2) + 1;
    if (showMonth) kit.drawTracked(g, usd(a.costMonth), xMonth, base, { size, family: theme.fonts.mono, color: c.inkDim, align: 'right' });
    kit.drawTracked(g, usd(a.costToday), xToday, base, { size, family: theme.fonts.monoBold, color: a.costToday > 0 ? c.ink : c.inkFaint, align: 'right' });
    if (showTokens) kit.drawTracked(g, tokens(a.tokensToday), xTok, base, { size, family: theme.fonts.mono, color: c.inkDim, align: 'right' });
    kit.drawClipped(g, agentName(a.id), box.x, base, Math.max(0, nameW - 8 * s), { size, family: theme.fonts.sansBold, color: c.ink });
  }
  // Today's models, as many as fit under the table.
  const small = px(14 * s);
  const mh = Math.round(small * 1.5);
  const models = d.byModel.slice(0, o.models);
  if (!models.length || shown < d.agents.length || y + mh * 2 > bottom) return;
  y += Math.round(mh * 1.25);
  kit.drawClipped(g, t(ATEXT.models), box.x, y, box.w, { size: small, family: theme.fonts.sansBold, color: c.inkFaint });
  for (const m of models) {
    if (y + mh > bottom) break;
    y += mh;
    const tw = kit.drawTracked(g, tokens(m.tokens), box.x + box.w, y, { size: small, family: theme.fonts.mono, color: c.inkDim, align: 'right' });
    kit.drawClipped(g, `${m.model}  ·  ${agentName(m.agent)}`, box.x, y, Math.max(0, box.w - tw - 10 * s), { size: small, family: theme.fonts.mono, color: c.inkDim });
  }
}
