#!/usr/bin/env node
/**
 * Regenerate shared/entity-icon-inline.js from shared/entity-icons/*.svg
 * Run after updating SVG source files.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'shared/entity-icons');

const fileToKind = {
  'icon.24.component.small.svg': 'component',
  'icon.24.component.set.small.svg': 'componentSet',
  'icon.24.variant.small.svg': 'variant',
  'icon.24.styles.svg': 'style',
  'icon.24.variable.small.svg': 'variable',
  'icon.24.variable.mode.small.svg': 'variableMode',
  'icon.24.figma.small.svg': 'figma',
  'icon.24.export.small.svg': 'export',
};

/** @type {Record<string, string>} */
const inline = {};

for (const [file, kind] of Object.entries(fileToKind)) {
  let svg = readFileSync(join(dir, file), 'utf8').trim();
  svg = svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
  inline[kind] = svg;
}

const out = `/** Auto-synced inline SVG markup for entity tags (fill: currentColor). */
const ENTITY_ICON_INLINE = ${JSON.stringify(inline, null, 2)};

if (typeof globalThis !== 'undefined') {
  globalThis.ENTITY_ICON_INLINE = ENTITY_ICON_INLINE;
}
`;

writeFileSync(join(root, 'shared/entity-icon-inline.js'), out);
console.log(`Synced ${Object.keys(inline).length} icons to shared/entity-icon-inline.js`);
