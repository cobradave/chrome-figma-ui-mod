import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');

export function loadFixtureWithScraper(name, options = {}) {
  const html = readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');
  const scraperCode = readFileSync(join(rootDir, 'scraper.js'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: options.url || 'https://www.figma.com/files/team/recents',
  });
  dom.window.eval(scraperCode);
  return {
    document: dom.window.document,
    window: dom.window,
    scraper: dom.window.FigmaAnalyticsScraper,
  };
}

/** @deprecated use loadFixtureWithScraper */
export function loadFixture(name) {
  return loadFixtureWithScraper(name).document;
}

export function loadScraper() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'outside-only',
  });
  dom.window.eval(readFileSync(join(rootDir, 'scraper.js'), 'utf8'));
  return dom.window.FigmaAnalyticsScraper;
}
