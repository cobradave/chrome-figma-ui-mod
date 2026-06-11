import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Load a browser-oriented shared script that attaches to globalThis.
 * @param {string} relativePath — e.g. shared/insights.js
 * @param {string} globalName — e.g. PanelInsights
 */
export function loadSharedModule(relativePath, globalName) {
  const code = readFileSync(path.join(rootDir, relativePath), 'utf8');
  const sandbox = { module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox[globalName] || sandbox.module.exports;
}

/**
 * Load multiple shared scripts into one sandbox (for modules that depend on each other).
 * @param {string[]} relativePaths
 */
export function loadSharedModules(relativePaths) {
  const sandbox = { module: { exports: {} } };
  sandbox.globalThis = sandbox;
  for (const relativePath of relativePaths) {
    const code = readFileSync(path.join(rootDir, relativePath), 'utf8');
    vm.runInNewContext(code, sandbox);
  }
  return sandbox;
}
