# Agent instructions

## Release notes (`page.html`, `README.md`, and `chrome-web-store-description.txt`)

When you finish saving changes to user-facing extension code (`manifest.json`, `popup.*`, `scraper.js`, `background.js`, `content/**`, etc.), **prompt the user** whether `page.html`, `README.md`, and `chrome-web-store-description.txt` should be updated. **Suggest a draft summary** of the user-facing changes (plain-language bullets) so they can approve, edit, or skip. Do not update any of these files unless they ask.

### chrome-web-store-description.txt

Plain-text copy for the [Chrome Web Store listing](https://chromewebstore.google.com/detail/figma-ui-mod/pakkdlcbmijjkcocojcgonopnbkeolle). The user copy-pastes the **SUMMARY** and **DESCRIPTION** sections into the developer dashboard when submitting a new version. Keep the changelog and feature bullets in sync with `page.html`.

### page.html

Public changelog and feature list (hosted separately from the repo).

1. Set the header version to match `manifest.json`.
2. Add a new `<p><b>vX.Y.Z</b> - D Month YYYY</p>` block at the top of the **Updates** section with `<li>` bullets describing user-visible changes.
3. Update the **Features** section when capabilities are added or changed.

### README.md

Repo readme for developers and users browsing the project.

1. Update **What's new** with bullets for the latest user-facing changes.
2. Update **What you can export today** when export support changes.
3. Revise **How to use it**, **Tips**, and other sections when workflows change.

See `.cursor/rules/release-notes.mdc` for format examples and conventions.
