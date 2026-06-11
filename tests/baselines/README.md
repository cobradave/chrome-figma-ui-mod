# Live browser validation (MCP)

## Prerequisites

- chrome-devtools MCP with `--autoConnect` in `~/.cursor/mcp.json`
- Remote debugging enabled in Chrome (`chrome://inspect/#remote-debugging`)
- Figma tab with Library Analytics modal open

## Protocol

1. `list_pages` → select the Figma tab.
2. `evaluate_script` with the body from [`scripts/dom-probe.js`](../../scripts/dom-probe.js) (`figmaAnalyticsDomProbe()`).
3. Compare output to [`path-a.json`](path-a.json) for the active view.
4. After code changes, run `npm test` for fixture regression, then repeat step 2 on a live tab.

## Path coverage

| Path | How to open | Baseline file |
|------|-------------|---------------|
| A | Workspace thumbnail → Library analytics | `path-a.json` (complete) |
| B | In-file → File menu → Library → Library analytics | [`path-b.json`](path-b.json) |
| C | Workspace → Libraries → pick library | [`path-c.json`](path-c.json) (components list) |

## Classifier self-test on live tab

After injecting the extension detector, check the console for `[FigmaAnalyticsExport]` logs when `?selftest=1` is in the URL, or run:

```js
// Requires scraper.js injected in page context
FigmaAnalyticsScraper.classifyAnalyticsState(
  FigmaAnalyticsScraper.findAnalyticsDialog()
)
```
