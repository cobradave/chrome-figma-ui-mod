# Manual test checklist

## Launch paths

1. **Path A:** Workspace thumbnail → Library analytics — auto-detect all six views.
2. **Path B:** In-file → File menu → Library → Library analytics — verify detection (breadcrumb may appear).
3. **Path C:** Workspace → Libraries → pick library — verify detection.

## Views

4. Components list → Scan enabled, Scrape disabled, inline CSV/JSON visible.
5. Click component → detail detected, Scrape enabled, Scan disabled.
6. Back → returns to list state without manual refresh.
7. Type = Styles → list and detail export enabled (CSV/JSON/Markdown).
8. Type = Variables → list and detail export enabled (CSV/JSON/Markdown).

## Performance

9. Close side panel → no `[FigmaAnalyticsExport]` console spam for 5 minutes.
10. Reopen panel → detector re-activates and status updates within ~1s of modal open.

## Regression

11. `npm test` passes all fixture tests.
12. MCP probe (see `tests/baselines/README.md`) matches `path-a.json` on live tab.
