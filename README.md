# Figma Analytics Export

A Chrome extension that exports **Library Analytics** data from Figma to CSV, JSON, or Markdown.

Open it from the Chrome toolbar — it appears as a **side panel** next to your Figma tab. You can also open it from the button injected into the Library Analytics modal header.

## What's new

### v1.6.8 (9 June 2026)

- Markdown exports: names with `|` no longer break tables.

### v1.6.7 (8 June 2026)

- **Panel insights** — Charts and maintainer notes in the side panel; optional include in exports.
- **Libraries path** — Fixed library name and component list detection.
- Improved variant extraction and special-character handling.

### v1.6.0 (1 June 2026)

- **Automatic view detection** — The panel updates as you open, close, or navigate Library Analytics views.
- **Contextual Download** — One button exports the current view; scanning happens automatically (no separate scan/scrape steps).
- **Guidance cards** and a **Switch to Analytics** button when you are on the Overview tab.
- **Expanded exports** — Styles and Variables (including **Modes**) lists and details; per-file usage for variants, single components, styles, and variables.
- **All launch paths** — Workspace thumbnail, in-file Library menu, and Libraries browser.
- **Modal launcher** — Open the side panel from a button in the analytics modal header.
- **Inline export** — CSV / JSON / Markdown buttons in the modal while the side panel is open.
- **Variables / Modes control** — Switch the Usage statistics sub-tab from the panel.
- **Complete lists** — Auto-scrolls virtualized tables so exports include every row.
- Remembers your last export format; detection runs only while the panel is open.

### v1.5.0 (15 March 2026)

- Renamed from **Figma UI Mod** to **Figma Analytics Export**.
- **Chrome side panel** replaces the toolbar popup.
- Unified **CSV / JSON / Markdown** format picker in the side panel.
- Property usage analysis retained in variant exports.

### v1.4.0 (15 February 2026)

- Added JSON and Markdown export formats alongside CSV.
- **Property usage analysis** — First analytics insights: variant property value counts and percentages in exports ([Davy Fung](https://github.com/cobradave)).

*Contributor: [Davy Fung](https://github.com/cobradave) — JSON and Markdown export formats, property usage analysis (foundation for panel insights), and initiated the move to a Chrome side panel (v1.5.0).*

## How to use it

1. Open **Library Analytics** in Figma (see ways to open it below).
2. Click the extension icon — or the **Figma Analytics Export** button in the modal header — to open the **side panel**.
3. Select the **Analytics** tab in the modal if you are on Overview (the panel can switch it for you).
4. Navigate to the view you want to export (component list, variant detail, file usage, styles, variables, etc.).
5. Choose **CSV**, **JSON**, or **Markdown**.
6. Click **Download** — the button label reflects the current view (e.g. "Download 603 components", "Download 24 variants", "Download file usage").

The panel updates automatically as you change tabs, types, or drill into details. Close the panel when you are done — detection only runs while it is open.

## Ways to open Library Analytics

| How you open it | Example |
|-----------------|--------|
| **From the workspace** — right‑click a library thumbnail → Library analytics | Browsing files on figma.com/files |
| **From inside a file** — File menu → Library → Library analytics | While editing a design file |
| **From Libraries** — Libraries button → pick a team → pick a library → Analytics tab | Libraries browser in the workspace |

The address bar may look similar between some of these — that is normal. The extension looks at what is on screen, not the URL.

## What you can export today

All views below support **CSV, JSON, and Markdown**.

| View | What it is | Export |
|------|------------|--------|
| **Components — list** | All library components and instance counts | ✅ Download |
| **Components — detail** | One component's variants, usage, and property analysis | ✅ Download |
| **Components — variant file usage** | Per-file breakdown for one variant | ✅ Download |
| **Components — single component file usage** | Per-file breakdown for a component without variants | ✅ Download |
| **Styles — list** | All library styles with instances, inserts, and detaches | ✅ Download |
| **Styles — detail** | One style's per-file usage | ✅ Download |
| **Variables — list (Variables tab)** | All variables with collection and usage stats | ✅ Download |
| **Variables — list (Modes tab)** | All modes with collection and instance counts | ✅ Download |
| **Variables — detail** | One variable's per-file usage | ✅ Download |

## Tips

- **Keep the Analytics tab selected** — Overview is not an export source.
- **Panel insights** — While you browse Library Analytics, the side panel shows usage charts and maintainer notes (top items, zero-instance signals, detach rates, file/team concentration, and more). Insights load automatically after the table is scanned.
- **Include insights in exports** — Check **Include insights** before downloading to add the same analysis to CSV, JSON, or Markdown exports (optional; off by default). Your preference is remembered.
- **Duration control** — Use the **Duration** picker in the panel (30 / 60 / 90 days / Year) to change the inserts and detaches window in Figma. Export the same view at different durations to compare trends over time.
- **Open the side panel while the modal is visible** — it works if the modal is already open or opens later; give it a second to update.
- If the status stays on "Looking for Library Analytics…" while the modal is visible, close and reopen the side panel (or reload the extension).
- **Inline export buttons** in the modal only appear while the side panel is open.
- Reload the extension after updates: `chrome://extensions` → refresh icon.
- Library Analytics requires a Figma **Organization or Enterprise** plan.

## Install locally

1. Download this folder to your computer.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose this folder.

## Panel previews (local)

Mock every side panel state in the browser without reloading the extension or stepping through Figma:

```bash
npm run previews
```

Regenerates mocks, starts **http://127.0.0.1:3847** (repo root so `popup.css` loads), and opens your browser. Press Ctrl+C to stop the server. Use `npm run previews:build` to generate files only.

Edit [`scripts/panel-preview-states.mjs`](scripts/panel-preview-states.mjs) and re-run to iterate on copy and proposed insight layouts. Generated output in `.previews/` is gitignored.

## Releasing a version

1. Bump the version in [`manifest.json`](manifest.json) (and update store listing / changelog copy if needed).
2. Commit and push to `main`.
3. Tag and push the same version:
   ```bash
   git tag v1.6.9
   git push origin v1.6.9
   ```
4. GitHub Actions runs tests, builds the Chrome Web Store ZIP, and publishes a **Release** with the ZIP and `chrome-web-store-listing.md` attached. Download from the repo **Releases** page.

The tag must match `manifest.json` (e.g. tag `v1.6.9` requires `"version": "1.6.9"`).

## Authors

- **Creator:** [Josh Harwood](https://github.com/NoWorries)
- **Contributor:** [Davy Fung](https://github.com/cobradave)

## Donations

If this is useful, you can [buy Josh a coffee](https://www.buymeacoffee.com/joshdesignnz).

## Screenshots

![Figma Analytics modal with export options](images/Figma_Analytics_-_Export_example.png)

![Example CSV exports](images/CSV_examples.png)

## TODO

- **Component thumbnails in the side panel** — Extract preview images from Library Analytics component list rows (via the scraper in the Figma tab) and surface them in the side panel and/or JSON export. Needs a live DOM probe first (`img` vs canvas vs background-image); watch for auth-bound CDN URLs and message size if embedding hundreds of previews.
