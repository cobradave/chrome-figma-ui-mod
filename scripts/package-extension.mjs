#!/usr/bin/env node
/**
 * Build a lean Chrome Web Store upload ZIP (runtime files only).
 *
 * Output: dist/v{version}/ with the ZIP and chrome-web-store-listing.md
 * (description/changelog copy for the developer dashboard).
 *
 * Excludes tests, previews, dev scripts, docs, store listing assets, etc.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const STORE_LISTING_SOURCE = 'chrome-web-store-description.txt';

/** Extract SUMMARY and DESCRIPTION sections from chrome-web-store-description.txt. */
function parseStoreListing(source) {
  const summaryMatch = source.match(/=== SUMMARY ===\r?\n([\s\S]*?)\r?\n\r?\n=== DESCRIPTION ===/);
  const descriptionMatch = source.match(
    /=== DESCRIPTION ===\r?\n([\s\S]*?)(?:\r?\n\r?\n=== PREVIOUS LIVE LISTING|$)/,
  );
  if (!summaryMatch || !descriptionMatch) {
    throw new Error(`${STORE_LISTING_SOURCE} is missing SUMMARY or DESCRIPTION sections`);
  }
  return {
    summary: summaryMatch[1].trim(),
    description: descriptionMatch[1].trim(),
  };
}

/** Plain-text store copy → markdown (• bullets become -). */
function toMarkdownBullets(text) {
  return text.replace(/^• /gm, '- ');
}

/** Build chrome-web-store-listing.md for the versioned release folder. */
function buildStoreListingMarkdown(version, { summary, description }) {
  const lines = [
    `# Figma Analytics Export — v${version}`,
    '',
    'Chrome Web Store listing copy for the developer dashboard.',
    'Paste each section below into the matching field (plain text).',
    '',
    `Listing: https://chromewebstore.google.com/detail/figma-ui-mod/pakkdlcbmijjkcocojcgonopnbkeolle`,
    '',
    '## Summary',
    '',
    summary,
    '',
    '_Summary field limit: 132 characters._',
    '',
    '## Description',
    '',
    toMarkdownBullets(description),
    '',
  ];
  return lines.join('\n');
}

/** Paths relative to repo root that ship in the extension. */
const INCLUDE = [
  'manifest.json',
  'background.js',
  'scraper.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'unsupported.html',
  'unsupported.css',
  'favicon_16.png',
  'favicon_32.png',
  'favicon_48.png',
  'favicon_128.png',
  'content',
  'shared',
];

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;
const slug = 'figma-analytics-export';
const outDir = join(root, 'dist');
const releaseDir = join(outDir, `v${version}`);
const stageDir = join(outDir, '.stage');
const zipName = `${slug}-v${version}.zip`;
const zipPath = join(releaseDir, zipName);
const listingPath = join(releaseDir, 'chrome-web-store-listing.md');

const storeListingSourcePath = join(root, STORE_LISTING_SOURCE);
if (!existsSync(storeListingSourcePath)) {
  console.error(`Missing ${STORE_LISTING_SOURCE} — add store listing copy before packaging.`);
  process.exit(1);
}
const storeListingSource = readFileSync(storeListingSourcePath, 'utf8');
const versionCommentMatch = storeListingSource.match(/^# Version in manifest\.json: (.+)$/m);
if (versionCommentMatch && versionCommentMatch[1].trim() !== version) {
  console.warn(
    `Warning: ${STORE_LISTING_SOURCE} says v${versionCommentMatch[1].trim()} but manifest.json is v${version}`,
  );
}

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

for (const rel of INCLUDE) {
  const src = join(root, rel);
  if (!existsSync(src)) {
    console.error(`Missing required path: ${rel}`);
    process.exit(1);
  }
  cpSync(src, join(stageDir, rel), { recursive: true });
}

// Type/Duration switchers are dev-only in source; hide them in shipped builds.
const stagedPopupJs = join(stageDir, 'popup.js');
let popupJs = readFileSync(stagedPopupJs, 'utf8');
const showControlsPattern = /const SHOW_TYPE_DURATION_CONTROLS = (?:true|false);/;
if (!showControlsPattern.test(popupJs)) {
  console.error('popup.js is missing SHOW_TYPE_DURATION_CONTROLS flag');
  process.exit(1);
}
popupJs = popupJs.replace(showControlsPattern, 'const SHOW_TYPE_DURATION_CONTROLS = false;');
writeFileSync(stagedPopupJs, popupJs);

mkdirSync(releaseDir, { recursive: true });
rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', zipPath, '.'], { cwd: stageDir, stdio: 'inherit' });
rmSync(stageDir, { recursive: true, force: true });

const storeListing = parseStoreListing(storeListingSource);
writeFileSync(listingPath, buildStoreListingMarkdown(version, storeListing));

console.log(`\nCreated ${releaseDir}/`);
console.log(`  ${zipName}`);
console.log(`  chrome-web-store-listing.md`);
