# tessera-plugin-usage

How much Claude Code you are burning, from ccusage: limit windows or spend, tokens by model, spend per block.

A plugin for [Tessera](https://github.com/Loksly/tessera), the widget mosaic for small USB LCD panels.

![Usage](docs/rail.png)

## Install

In Tessera, **Plugins → Install from npm** → `tessera-plugin-usage`, then restart Tessera. Or from a terminal:

```sh
npm install --prefix ~/.config/tessera/plugins tessera-plugin-usage
```

(macOS: `~/Library/Application Support/Tessera/plugins`, Windows: `%APPDATA%\Tessera\plugins`.)

## Requirements

- [`ccusage`](https://github.com/ryoppippi/ccusage) on the `PATH` (`npm install -g ccusage`).

## Widgets

### Usage — `usage/rail`

Limit windows (or spend against your caps) as bars with their reset time, and today’s tokens by model.

![Usage](docs/rail.png)

Uses: `usage/ccusage`.

| Option | Type | Default | |
|---|---|---|---|
| `bars` | number | `2` | Bars |
| `models` | number | `3` | Models listed |
| `warn` | number | `0.6` | Amber from |
| `alert` | number | `0.85` | Red from |

### Spend per 5-hour block — `usage/blocks`

The equivalent cost of the last twelve 5-hour blocks, the running one highlighted: is today unusual?

![Spend per 5-hour block](docs/blocks.png)

Uses: `usage/ccusage`.

*No options.*

## Data sources

### Claude Code usage (ccusage) — `usage/ccusage`

Runs ccusage every minute. Each run walks the whole Claude Code history (a few seconds of CPU). Read every 1 min while a widget uses it. Options are set once in Tessera → Settings → Data sources.

| Option | Type | Default | |
|---|---|---|---|
| `bin` | string | `"ccusage"` | ccusage command. Looked up in PATH unless it is a full path. May carry arguments, e.g. "npx ccusage". |
| `mode` | `max` \| `api` | `"max"` | Plan |
| `dailyCap` | number | `25` | Daily cap (API) |
| `monthlyCap` | number | `400` | Monthly cap (API) |
| `calibration.metric` | `cost` \| `tokens` | `"cost"` | Measure |
| `calibration.lookbackDays` | number | `30` | Days of history (0 = all) |
| `calibration.percentile` | number | `100` | Percentile that marks 100 % |

## Development

```sh
npm install
npm test          # node:test
npm run check     # TypeScript
npm run build     # dist/index.js, what Tessera loads
```

To try it in a running Tessera without publishing: `tessera plugins link .` and restart Tessera.

Working on Tessera and its plugins together: clone them side by side
(`tessera/` and `tessera-plugins/tessera-plugin-usage/`) and run `npm install` in
`tessera/`; its workspaces link every plugin found in `../tessera-plugins`.

## License

MIT
