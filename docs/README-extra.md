## Providers

Three sources, each optional: place only the widgets you want, and fill in only the keys you have.

| Source | What it reads | Where | Mainland China |
|---|---|---|---|
| `usage/ccusage` | Claude Code from its local logs, through ccusage: limit windows or spend against caps, tokens by model, 5-hour blocks | this machine | — (Claude is not offered there) |
| `usage/agents` | every coding agent ccusage finds on this machine: Claude Code, Codex, **Kimi CLI**, **Qwen Code**, Gemini CLI, OpenCode, Copilot CLI… | this machine | yes (Kimi CLI, Qwen Code; turn on *Offline prices* if GitHub is slow or blocked) |
| `usage/accounts` | balances and spend from each provider's billing API, with your key | the provider | yes (DeepSeek, Kimi on platform.kimi.com) |

### Keys for `usage/accounts`

Kiosko → Settings → Data sources → *AI accounts*. Keys are stored as secrets: masked in the editor and never written to a log. Balances are read every 5 minutes by default (2 at the most); a provider that fails waits longer before the next try (5, 10, 20, 40 minutes, then hourly; an hour after a refused key) and keeps showing its last figure, dimmed, with the reason. Amounts are shown in the currency the provider gives (¥ for CNY in simplified Chinese, CN¥ elsewhere, US$ in Taiwan); nothing is converted.

- **DeepSeek** — [platform.deepseek.com](https://platform.deepseek.com) → *API keys*. One platform for mainland China and abroad; the balance is in CNY or USD, as topped up. API: [`GET /user/balance`](https://api-docs.deepseek.com/api/get-user-balance).
- **Kimi (Moonshot AI)** — mainland China: [platform.kimi.com](https://platform.kimi.com) (balance in CNY); international: [platform.kimi.ai](https://platform.kimi.ai) (USD). Pick the matching *Platform*: a key only works on its own. API: [`GET /v1/users/me/balance`](https://platform.kimi.com/docs/api/balance).
- **OpenAI** — an organization **Admin key** ([platform.openai.com](https://platform.openai.com) → Settings → Organization → Admin keys; a project key is refused). Shows this month's spend (UTC days) against an optional budget, and today's tokens by model. There is no API for the prepaid credit balance. APIs: [costs](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs), [completions usage](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions).

### Not included, and why

- **Qwen (Alibaba Cloud Model Studio / DashScope)**: no API returns the balance or the bill with a Model Studio API key; they are only in the console ([billing](https://help.aliyun.com/en/model-studio/bill-query-and-cost-management)). Qwen Code's own usage is in `usage/agents`.
- **Zhipu GLM (bigmodel.cn)**: its [API reference](https://docs.bigmodel.cn/llms.txt) has no balance or usage endpoint.
- **SiliconFlow**: its only balance endpoint, `/v1/user/info`, was [switched off on 2026-08-14](https://docs.siliconflow.cn/en/release-notes/overview) with no replacement yet.
- **Gemini API**: usage and billing are only in AI Studio and Cloud Billing ([billing](https://aistudio.google.com/docs/billing)); no key-based API. Gemini CLI's usage is in `usage/agents`.
