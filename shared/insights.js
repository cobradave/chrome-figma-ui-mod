'use strict';

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Parse Figma instance count strings (e.g. "1,234", "0", "-", "7.8k").
 * @param {string|number|null|undefined} raw
 * @returns {number}
 */
function parseInstanceCount(raw) {
  if (raw == null) return 0;
  const text = String(raw).trim();
  if (!text || text === '-' || /^n\/a$/i.test(text)) return 0;

  const normalized = text.replace(/,/g, '');
  const suffixMatch = normalized.match(/^([\d.]+)\s*([kmb])$/i);
  if (suffixMatch) {
    const base = Number.parseFloat(suffixMatch[1]);
    if (!Number.isFinite(base)) return 0;
    const unit = suffixMatch[2].toLowerCase();
    const multiplier = unit === 'k' ? 1_000 : unit === 'm' ? 1_000_000 : 1_000_000_000;
    return Math.round(base * multiplier);
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * @param {Record<string, unknown>} item
 * @param {string} countKey
 * @returns {number}
 */
function itemCount(item, countKey) {
  return parseInstanceCount(item[countKey]);
}

/**
 * @param {Record<string, unknown>} item
 * @param {string} labelKey
 * @returns {string}
 */
function itemLabel(item, labelKey) {
  return String(item[labelKey] || item.name || item.mode || '').trim();
}

/**
 * @param {Record<string, unknown>[]} items
 * @param {string} countKey
 * @returns {Record<string, unknown>[]}
 */
function sortByCountDesc(items, countKey) {
  return [...items].sort((a, b) => itemCount(b, countKey) - itemCount(a, countKey));
}

/**
 * @param {Record<string, unknown>[]} items
 * @param {string} countKey
 * @returns {number}
 */
function sumCounts(items, countKey) {
  return items.reduce((sum, item) => sum + itemCount(item, countKey), 0);
}

/**
 * @param {Record<string, unknown>[]} items
 * @param {{ countKey?: string, labelKey?: string, topN?: number }} [opts]
 * @returns {{ label: string, percent: number }[]}
 */
function buildTopShareItems(items, opts = {}) {
  const countKey = opts.countKey || 'instances';
  const labelKey = opts.labelKey || 'name';
  const topN = opts.topN ?? 5;
  const total = sumCounts(items, countKey);
  if (total === 0) return [];

  return sortByCountDesc(items, countKey)
    .slice(0, topN)
    .map((item) => ({
      label: itemLabel(item, labelKey),
      percent: Math.round((itemCount(item, countKey) / total) * 100),
    }));
}

/**
 * @param {Record<string, unknown>[]} items
 * @param {{ countKey?: string, topN?: number, itemNoun?: string }} [opts]
 * @returns {string|null}
 */
function buildParetoFootnote(items, opts = {}) {
  const countKey = opts.countKey || 'instances';
  const topN = opts.topN ?? 10;
  const itemNoun = opts.itemNoun || 'items';
  const total = sumCounts(items, countKey);
  if (total === 0 || items.length <= topN) return null;

  const topSum = sortByCountDesc(items, countKey)
    .slice(0, topN)
    .reduce((sum, item) => sum + itemCount(item, countKey), 0);
  const pct = Math.round((topSum / total) * 100);
  return `Top ${topN} ${itemNoun} = ${pct}% of total instances`;
}

/**
 * @param {Record<string, unknown>[]} items
 * @param {string} countKey
 * @returns {number}
 */
function countZeroInstances(items, countKey = 'instances') {
  return items.filter((item) => itemCount(item, countKey) === 0).length;
}

/**
 * @param {Record<string, unknown>[]} items
 * @param {{ countKey?: string, itemNoun?: string }} [opts]
 * @returns {{ title: string, text: string, detail: string }|null}
 */
function buildZeroInstancesNote(items, opts = {}) {
  const countKey = opts.countKey || 'instances';
  const itemNoun = opts.itemNoun || 'items';
  const zeroCount = countZeroInstances(items, countKey);
  if (zeroCount === 0) return null;

  const singular = itemNoun.replace(/s$/, '');
  const noun = zeroCount === 1 ? singular : itemNoun;
  return {
    title: 'Zero instances',
    text: `${zeroCount} ${noun} with zero total instances — candidates to deprecate`,
    detail: 'Based on all-time totals (not recent inserts).',
  };
}

/**
 * @param {{ name?: string, instances?: string }[]} components
 * @returns {{ name: string, items: Record<string, unknown>[] }[]}
 */
function findDuplicateComponentNames(components) {
  const byName = new Map();

  for (const item of components || []) {
    const name = itemLabel(item, 'name');
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(item);
  }

  return [...byName.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([name, items]) => ({ name, items }));
}

/**
 * @param {{ name: string, items: Record<string, unknown>[] }} duplicate
 * @returns {{ name: string, meta: string }}
 */
function buildDuplicateComponentBullet({ name, items }) {
  const componentCount = items.length;
  const totalInstances = sumCounts(items, 'instances');
  const componentLabel = componentCount === 1 ? '1 component' : `${componentCount} components`;

  return {
    name,
    meta: `${componentLabel} · ${totalInstances.toLocaleString()} total instances`,
  };
}

/**
 * @param {{ name?: string, instances?: string }[]} components
 * @returns {{ title: string, text: string, detail: string, bullets: { name: string, meta: string }[] }|null}
 */
function buildDuplicateComponentNamesNote(components) {
  const list = components || [];
  const duplicates = findDuplicateComponentNames(list)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!duplicates.length) return null;

  return {
    title: 'Duplicate names',
    text: '',
    detail: 'Rename or consolidate duplicates in the library file.',
    bullets: duplicates.map(buildDuplicateComponentBullet),
  };
}

/**
 * @param {{ name: string, totalInstances?: string }[]} variants
 * @returns {number}
 */
function countZeroInstanceVariants(variants) {
  return countZeroInstances(variants || [], 'totalInstances');
}

/**
 * @param {{ name: string, totalInstances?: string }[]} variants
 * @returns {{ title: string, text: string, detail: string }|null}
 */
function buildZeroInstanceVariantsNote(variants) {
  return buildZeroInstancesNote(variants || [], { countKey: 'totalInstances', itemNoun: 'variants' });
}

/**
 * @param {Record<string, unknown>[]} items
 * @param {{ minInserts?: number }} [opts]
 * @returns {{ title: string, text: string }|null}
 */
function buildHighestDetachRateNote(items, opts = {}) {
  const minInserts = opts.minInserts ?? 10;
  let best = null;
  let bestRatio = 0;

  for (const item of items) {
    const inserts = itemCount(item, 'inserts');
    const detaches = itemCount(item, 'detaches');
    if (inserts < minInserts) continue;
    const ratio = detaches / Math.max(inserts, 1);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = item;
    }
  }

  if (!best || bestRatio < 1) return null;

  const ratioStr =
    bestRatio >= 10 ? `${Math.round(bestRatio)}×` : `${bestRatio.toFixed(1).replace(/\.0$/, '')}×`;
  return {
    title: 'Highest detach rate',
    text: `${itemLabel(best, 'name')} (detaches ${ratioStr} inserts)`,
  };
}

/**
 * @param {string|null|undefined} value
 * @param {number} [thresholdMonths]
 * @returns {boolean}
 */
function isStaleLastModified(value, thresholdMonths = 6) {
  if (!value) return false;
  const text = String(value).trim();
  if (/^\d+\s+years?\s+ago$/i.test(text)) return true;
  const monthsMatch = text.match(/^(\d+)\s+months?\s+ago$/i);
  if (monthsMatch) return parseInt(monthsMatch[1], 10) >= thresholdMonths;
  return false;
}

/**
 * @param {{ team?: string, instances?: string }[]} files
 * @returns {{ name: string, instances: number }[]}
 */
function aggregateFilesByTeam(files) {
  const teams = {};
  for (const file of files || []) {
    const team = String(file.team || 'Unknown').trim() || 'Unknown';
    teams[team] = (teams[team] || 0) + itemCount(file, 'instances');
  }
  return Object.entries(teams).map(([name, instances]) => ({ name, instances: String(instances) }));
}

/**
 * @param {number|null|undefined} count
 * @returns {string|null}
 */
function formatVariantSummary(count) {
  if (count == null) return null;
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n} variant${n === 1 ? '' : 's'}`;
}

/**
 * @param {{ name: string, totalInstances?: string }[]} variants
 * @returns {{ properties: Record<string, { value: string, count: number, percent: string }[]>, totalInstances: number }}
 */
function analyzePropertyUsage(variants) {
  const properties = {};
  let totalInstances = 0;

  for (const variant of variants || []) {
    const count = parseInstanceCount(variant.totalInstances);
    totalInstances += count;

    const parts = String(variant.name || '')
      .split(',')
      .map((part) => part.trim());
    let positionIndex = 1;

    for (const part of parts) {
      let propName;
      let propValue;

      if (part.includes('=')) {
        [propName, propValue] = part.split('=').map((segment) => segment.trim());
        propValue = propValue.replace(/\s*\(default\)/gi, '').trim();
      } else {
        propName = `Property ${positionIndex}`;
        propValue = part.replace(/\s*\(default\)/g, '').trim();
        positionIndex++;
      }

      if (!propName || !propValue) continue;

      if (!properties[propName]) properties[propName] = {};
      properties[propName][propValue] = (properties[propName][propValue] || 0) + count;
    }
  }

  const result = {};
  for (const [propName, values] of Object.entries(properties)) {
    const sorted = Object.entries(values)
      .map(([value, count]) => {
        let percent = '0';
        if (totalInstances > 0) {
          percent = Math.round((count / totalInstances) * 100).toString();
        }
        return { value, count, percent };
      })
      .sort((a, b) => b.count - a.count);
    result[propName] = sorted;
  }

  return { properties: result, totalInstances };
}

/**
 * @param {{ properties: Record<string, { value: string, percent: string }[]> }} propertyAnalysis
 * @returns {{ name: string, items: { label: string, percent: string|number }[] }[]}
 */
function propertyGroupsFromAnalysis(propertyAnalysis) {
  if (!propertyAnalysis?.properties) return [];

  return Object.entries(propertyAnalysis.properties).map(([name, values]) => ({
    name,
    items: values
      .filter((entry) => (entry.count ?? 0) > 0)
      .map((entry) => ({
        label: entry.value,
        percent: entry.percent,
        count: entry.count,
      })),
  })).filter((group) => group.items.length > 0);
}

/**
 * @param {{ scope?: { title: string, text: string }|null, groups?: object[], notes?: object[], footnote?: string|null }} payload
 * @returns {boolean}
 */
function insightsPayloadHasContent(payload) {
  if (!payload) return false;
  return Boolean(
    payload.groups?.length || payload.notes?.length || payload.footnote
  );
}

/**
 * @param {{ scope?: { title: string, text: string }|null, groups?: object[], notes?: object[], footnote?: string|null }} payload
 * @returns {string}
 */
function renderInsightBarsFromPayload(payload) {
  if (!payload) return '';
  return renderInsightBars(payload.groups, {
    scope: payload.scope || undefined,
    notes: payload.notes,
    footnote: payload.footnote || undefined,
  });
}

/**
 * @param {{ title: string, text: string }|null} scope
 * @param {object[]} groups
 * @param {object[]} notes
 * @param {string|null|undefined} footnote
 * @returns {{ scope: { title: string, text: string }|null, groups: object[], notes: object[], footnote: string|null }}
 */
function buildInsightsPayload(scope, groups, notes, footnote) {
  return {
    scope: scope || null,
    groups: groups || [],
    notes: notes || [],
    footnote: footnote || null,
  };
}

/**
 * @param {{ scope?: { title: string, text: string }|null, groups?: { name: string, items: { label: string, percent: number|string, count?: number }[] }[], notes?: { title: string, text: string, detail?: string }[], footnote?: string|null }} insights
 * @returns {string[][]}
 */
function insightsToCsvRows(insights) {
  if (!insights || !insightsPayloadHasContent(insights)) return [];

  const rows = [[], ['Insights']];
  if (insights.scope) {
    rows.push(['Scope', insights.scope.title, insights.scope.text]);
  }
  for (const note of insights.notes || []) {
    rows.push([note.title, note.text, note.detail || '']);
    for (const bullet of note.bullets || []) {
      if (typeof bullet === 'string') {
        rows.push(['', bullet, '']);
      } else {
        rows.push(['', bullet.name, bullet.meta]);
      }
    }
  }
  if (insights.footnote) {
    rows.push(['Footnote', insights.footnote]);
  }
  for (const group of insights.groups || []) {
    rows.push([], [group.name]);
    const hasCount = group.items?.some((item) => item.count != null);
    rows.push(hasCount ? ['Label', 'Percent', 'Instances'] : ['Label', 'Percent']);
    for (const item of group.items || []) {
      rows.push(
        hasCount
          ? [item.label, `${item.percent}%`, String(item.count ?? '')]
          : [item.label, `${item.percent}%`]
      );
    }
  }
  return rows;
}

/**
 * @param {{ scope?: { title: string, text: string }|null, groups?: object[], notes?: { title: string, text: string, detail?: string }[], footnote?: string|null }} insights
 * @returns {string}
 */
function insightsToMarkdown(insights) {
  if (!insights || !insightsPayloadHasContent(insights)) return '';

  let md = '\n## Insights\n\n';
  if (insights.scope) {
    md += `**${insights.scope.title}:** ${insights.scope.text}\n\n`;
  }
  for (const note of insights.notes || []) {
    md += `### ${note.title}\n\n`;
    if (note.text) md += `${note.text}\n\n`;
    for (const bullet of note.bullets || []) {
      if (typeof bullet === 'string') {
        md += `- ${bullet}\n`;
      } else {
        md += `- **${String(bullet.name).replace(/\|/g, '\\|')}** — ${bullet.meta}\n`;
      }
    }
    if (note.bullets?.length) md += '\n';
    if (note.detail) md += `_${note.detail}_\n\n`;
  }
  if (insights.footnote) {
    md += `_${insights.footnote}_\n\n`;
  }
  for (const group of insights.groups || []) {
    md += `### ${group.name}\n\n`;
    const hasCount = group.items?.some((item) => item.count != null);
    if (hasCount) {
      md += '| Label | % | Instances |\n|-------|---|----------|\n';
      for (const item of group.items || []) {
        md += `| ${item.label} | ${item.percent}% | ${item.count?.toLocaleString?.() ?? item.count ?? ''} |\n`;
      }
    } else {
      md += '| Label | % |\n|-------|---|\n';
      for (const item of group.items || []) {
        md += `| ${item.label} | ${item.percent}% |\n`;
      }
    }
    md += '\n';
  }
  return md;
}

/**
 * @param {{ name: string, inserts?: string, detaches?: string }[]} variants
 * @returns {{ title: string, text: string }|null}
 */
function buildHighDetachVariantsNote(variants) {
  const flagged = (variants || []).filter((variant) => {
    const inserts = itemCount(variant, 'inserts');
    const detaches = itemCount(variant, 'detaches');
    return inserts >= 5 && detaches / Math.max(inserts, 1) >= 1.5;
  });

  if (!flagged.length) return null;

  const noun = flagged.length === 1 ? 'variant' : 'variants';
  return {
    title: 'High detach rate',
    text: `${flagged.length} ${noun} with detaches ≥ 1.5× inserts (30d)`,
  };
}

/**
 * @param {{ properties: Record<string, { value: string, percent: string }[]> }} propertyAnalysis
 * @param {number} [threshold]
 * @returns {{ title: string, text: string }[]}
 */
function buildDominantPropertyNotes(propertyAnalysis, threshold = 70) {
  const notes = [];
  for (const [propName, values] of Object.entries(propertyAnalysis?.properties || {})) {
    const top = values[0];
    if (!top || Number(top.percent) < threshold) continue;
    notes.push({
      title: 'Skewed usage',
      text: `${propName}="${top.value}" is used in ${top.percent}% of instances`,
    });
  }
  return notes;
}

/**
 * @param {{ properties: Record<string, { value: string, count: number }[]> }} propertyAnalysis
 * @returns {{ title: string, text: string }|null}
 */
function buildUnusedPropertyValuesNote(propertyAnalysis) {
  const unused = [];
  for (const [propName, values] of Object.entries(propertyAnalysis?.properties || {})) {
    for (const entry of values) {
      if (entry.count === 0) unused.push(`${propName}=${entry.value}`);
    }
  }
  if (!unused.length) return null;

  const preview = unused.slice(0, 3).join(', ');
  const suffix = unused.length > 3 ? ` (+${unused.length - 3} more)` : '';
  return {
    title: 'Unused property values',
    text: `${unused.length} variant ${unused.length === 1 ? 'value' : 'values'} with zero instances — ${preview}${suffix}`,
  };
}

/**
 * @param {{ name: string, totalInstances?: string }[]} variants
 * @param {{ properties: Record<string, { value: string, count: number, percent: string }[]> }} propertyAnalysis
 * @returns {{ title: string, text: string }[]}
 */
function buildDefaultSkewNotes(variants, propertyAnalysis) {
  const defaultValues = new Map();

  for (const variant of variants || []) {
    const parts = String(variant.name || '')
      .split(',')
      .map((part) => part.trim());
    let positionIndex = 1;

    for (const part of parts) {
      if (!/\(default\)/i.test(part)) {
        if (!part.includes('=')) positionIndex++;
        continue;
      }

      let propName;
      let propValue;
      if (part.includes('=')) {
        [propName, propValue] = part.split('=').map((segment) => segment.trim());
        propValue = propValue.replace(/\s*\(default\)/gi, '').trim();
      } else {
        propName = `Property ${positionIndex}`;
        propValue = part.replace(/\s*\(default\)/gi, '').trim();
        positionIndex++;
      }

      if (propName && propValue) defaultValues.set(`${propName}=${propValue}`, propName);
    }
  }

  const notes = [];
  for (const [key, propName] of defaultValues) {
    const propValue = key.slice(propName.length + 1);
    const values = propertyAnalysis?.properties?.[propName] || [];
    const entry = values.find((v) => v.value === propValue);
    const percent = entry ? Number(entry.percent) : 0;
    if (percent > 0 && percent < 50) {
      notes.push({
        title: 'Default skew',
        text: `${propName} default "${propValue}" is only ${percent}% of usage`,
      });
    }
  }
  return notes;
}

/**
 * @param {{ name: string, totalInstances?: string }[]} variants
 * @param {number|null|undefined} variantCount
 * @returns {{ title: string, text: string, detail?: string }|null}
 */
function buildCombinatorialExplosionNote(variants, variantCount) {
  const total = variantCount ?? variants?.length ?? 0;
  if (total < 8) return null;

  const zeroCount = countZeroInstanceVariants(variants);
  const usedCount = (variants || []).filter((v) => parseInstanceCount(v.totalInstances) > 0).length;

  if (zeroCount < 3 && usedCount / total >= 0.5) return null;

  const parts = [`${total} variants defined`, `${usedCount} with usage`];
  if (zeroCount) parts.push(`${zeroCount} with zero instances`);

  return {
    title: 'Variant matrix',
    text: `${parts.join(', ')} — consider simplifying`,
    detail: 'Large matrices with low usage add maintenance cost.',
  };
}

/**
 * @param {{ instances?: string, inserts?: string, totalInstances?: string }[]} items
 * @param {{ countKey?: string, insertKey?: string, minInstances?: number, itemNoun?: string }} [opts]
 * @returns {{ title: string, text: string }|null}
 */
function buildLegacyActivityNote(items, opts = {}) {
  const countKey = opts.countKey || 'instances';
  const insertKey = opts.insertKey || 'inserts';
  const minInstances = opts.minInstances ?? 100;
  const itemNoun = opts.itemNoun || 'items';

  const legacyCount = (items || []).filter(
    (item) => itemCount(item, countKey) >= minInstances && itemCount(item, insertKey) === 0
  ).length;

  if (!legacyCount) return null;

  return {
    title: 'Legacy usage',
    text: `${legacyCount} ${legacyCount === 1 ? itemNoun.replace(/s$/, '') : itemNoun} with high all-time use but zero recent inserts (30d)`,
  };
}

/**
 * @param {string|null|undefined} duration
 * @returns {string|null}
 */
function durationInsightsFootnote(duration) {
  if (!duration || duration === '30') return null;
  const labels = { 60: '60 days', 90: '90 days', year: 'the past year' };
  const label = labels[duration] || `${duration} days`;
  return `Inserts and detaches reflect ${label} (selected in Figma)`;
}

/**
 * @param {string|null|undefined} existingFootnote
 * @param {string|null|undefined} duration
 * @returns {string|null}
 */
function mergeInsightsFootnote(existingFootnote, duration) {
  const durationNote = durationInsightsFootnote(duration);
  if (existingFootnote && durationNote) return `${existingFootnote}. ${durationNote}`;
  return existingFootnote || durationNote || null;
}

/**
 * @param {{ label: string, percent: number|string }[]} items
 * @returns {string}
 */
function renderBarRows(items) {
  return items
    .map((item) => {
      const pct = Math.min(Number(item.percent) || 0, 100);
      return `<div class="preview-bar-row">
        <span class="preview-bar-row__label">${escapeHtml(item.label)}</span>
        <div class="preview-bar-row__track"><div class="preview-bar-row__fill" style="width:${pct}%"></div></div>
        <span class="preview-bar-row__pct">${escapeHtml(String(item.percent))}%</span>
      </div>`;
    })
    .join('');
}

/**
 * @param {{ title: string, text: string, detail?: string, bullets?: (string|{ name: string, meta: string })[] }} note
 * @returns {string}
 */
function renderNoteBullets(bullets) {
  if (!bullets?.length) return '';

  return `<ul class="preview-note__list">${bullets
    .map((bullet) => {
      if (typeof bullet === 'string') {
        return `<li class="preview-note__list-item"><span class="preview-note__list-name">${escapeHtml(bullet)}</span></li>`;
      }
      return `<li class="preview-note__list-item">
        <span class="preview-note__list-name">${escapeHtml(bullet.name)}</span>
        <span class="preview-note__list-meta">${escapeHtml(bullet.meta)}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

/**
 * @param {{ title: string, text: string, detail?: string, bullets?: (string|{ name: string, meta: string })[] }} note
 * @returns {string}
 */
function renderNote(note) {
  const bullets = renderNoteBullets(note.bullets);
  const text = note.text
    ? `<div class="preview-note__text">${escapeHtml(note.text)}</div>`
    : '';
  const detail = note.detail
    ? `<div class="preview-note__detail">${escapeHtml(note.detail)}</div>`
    : '';

  return `<div class="preview-note">
    <div class="preview-group__name">${escapeHtml(note.title)}</div>
    ${text}
    ${bullets}
    ${detail}
  </div>`;
}

/**
 * @param {{ name: string, items: { label: string, percent: number|string }[] }[]} groups
 * @param {{ scope?: { title: string, text: string }, footnote?: string, notes?: { title: string, text: string, detail?: string }[] }} [opts]
 * @returns {string}
 */
function renderInsightBars(groups, opts = {}) {
  const body = (groups || [])
    .filter((group) => group.items?.length)
    .map(
      (group) => `<div class="preview-group">
        <div class="preview-group__name">${escapeHtml(group.name)}</div>
        ${renderBarRows(group.items)}
      </div>`
    )
    .join('');

  const scopeBlock = opts.scope ? renderNote(opts.scope) : '';

  const notes = opts.notes || [];
  const notesBlock = notes.length
    ? `<div class="preview-notes">${notes.map((note) => renderNote(note)).join('')}</div>`
    : '';

  const footnote = opts.footnote
    ? `<div class="preview-footnote">${escapeHtml(opts.footnote)}</div>`
    : '';

  const hasContent = scopeBlock || notesBlock || body || footnote;
  if (!hasContent) return '';

  return `<div id="preview" class="preview">
    ${scopeBlock ? `<div class="preview-scope">${scopeBlock}</div>` : ''}
    ${notesBlock}
    ${body}
    ${footnote}
  </div>`;
}

function buildRankedListInsightsPayload(items, scope, groupName, itemNoun) {
  const list = items || [];
  const groups = [];
  const topItems = buildTopShareItems(list, { topN: 5 });
  if (topItems.length) groups.push({ name: groupName, items: topItems });

  const notes = [];
  const zeroNote = buildZeroInstancesNote(list, { itemNoun });
  if (zeroNote) notes.push(zeroNote);

  const footnote = buildParetoFootnote(list, { topN: 10, itemNoun });
  return buildInsightsPayload(scope, groups, notes, footnote || null);
}

function buildComponentListInsightsPayload(components, scope) {
  const payload = buildRankedListInsightsPayload(components, scope, 'Top components', 'components');
  const duplicateNote = buildDuplicateComponentNamesNote(components);
  if (duplicateNote) payload.notes.unshift(duplicateNote);
  return payload;
}

function buildComponentListInsightsHtml(components, scope) {
  return renderInsightBarsFromPayload(buildComponentListInsightsPayload(components, scope));
}

function buildStyleListInsightsPayload(styles, scope, duration) {
  const list = styles || [];
  const groups = [];
  const topItems = buildTopShareItems(list, { topN: 5 });
  if (topItems.length) groups.push({ name: 'Top styles', items: topItems });

  const notes = [];
  const detachNote = buildHighestDetachRateNote(list);
  if (detachNote) notes.push(detachNote);
  const zeroNote = buildZeroInstancesNote(list, { itemNoun: 'styles' });
  if (zeroNote) notes.push(zeroNote);
  const legacyNote = buildLegacyActivityNote(list, { itemNoun: 'styles' });
  if (legacyNote) notes.push(legacyNote);

  return buildInsightsPayload(scope, groups, notes, mergeInsightsFootnote(null, duration));
}

function buildStyleListInsightsHtml(styles, scope, duration) {
  return renderInsightBarsFromPayload(buildStyleListInsightsPayload(styles, scope, duration));
}

function buildVariableListInsightsPayload(variables, scope, duration) {
  const list = variables || [];
  const groups = [];

  const byCollection = {};
  for (const variable of list) {
    const collection = String(variable.collection || 'Other').trim() || 'Other';
    if (!byCollection[collection]) byCollection[collection] = [];
    byCollection[collection].push(variable);
  }
  const collectionTotals = Object.entries(byCollection)
    .map(([collection, items]) => ({
      label: collection,
      count: sumCounts(items, 'instances'),
    }))
    .sort((a, b) => b.count - a.count);
  const collectionSum = collectionTotals.reduce((sum, entry) => sum + entry.count, 0);
  if (collectionSum > 0) {
    groups.push({
      name: 'By collection',
      items: collectionTotals.slice(0, 5).map((entry) => ({
        label: entry.label,
        percent: Math.round((entry.count / collectionSum) * 100),
      })),
    });
  }

  const topVariables = buildTopShareItems(list, { topN: 3 });
  if (topVariables.length) groups.push({ name: 'Top variables', items: topVariables });

  const notes = [];
  const detachNote = buildHighestDetachRateNote(list);
  if (detachNote) notes.push(detachNote);
  const zeroNote = buildZeroInstancesNote(list, { itemNoun: 'variables' });
  if (zeroNote) notes.push(zeroNote);
  const legacyNote = buildLegacyActivityNote(list, { itemNoun: 'variables' });
  if (legacyNote) notes.push(legacyNote);

  const zeroInserts = list.filter((item) => itemCount(item, 'inserts') === 0).length;
  const footnote = mergeInsightsFootnote(
    zeroInserts > 0 ? `${zeroInserts} variables with zero inserts (30d)` : null,
    duration
  );

  return buildInsightsPayload(scope, groups, notes, footnote);
}

function buildVariableListInsightsHtml(variables, scope, duration) {
  return renderInsightBarsFromPayload(buildVariableListInsightsPayload(variables, scope, duration));
}

function buildModeListInsightsPayload(modes, scope) {
  const list = modes || [];
  const byCollection = {};
  for (const mode of list) {
    const collection = String(mode.collection || 'Other').trim() || 'Other';
    if (!byCollection[collection]) byCollection[collection] = [];
    byCollection[collection].push(mode);
  }

  const groups = Object.entries(byCollection)
    .map(([collection, items]) => {
      const total = sumCounts(items, 'instances');
      if (total === 0) return null;
      return {
        name: `${collection} collection`,
        items: sortByCountDesc(items, 'instances').map((item) => ({
          label: itemLabel(item, 'mode'),
          percent: Math.round((itemCount(item, 'instances') / total) * 100),
        })),
      };
    })
    .filter(Boolean);

  const notes = [];
  const zeroNote = buildZeroInstancesNote(list, { itemNoun: 'modes' });
  if (zeroNote) notes.push(zeroNote);

  return buildInsightsPayload(
    scope,
    groups,
    notes,
    'Modes tab — inserts/detaches not shown in Figma'
  );
}

function buildModeListInsightsHtml(modes, scope) {
  return renderInsightBarsFromPayload(buildModeListInsightsPayload(modes, scope));
}

function buildFileUsageInsightsPayload(files, scope) {
  const list = files || [];
  const groups = [];

  const topFiles = buildTopShareItems(list, { labelKey: 'name', topN: 3 });
  if (topFiles.length) groups.push({ name: 'Top files', items: topFiles });

  const teamItems = aggregateFilesByTeam(list);
  const topTeams = buildTopShareItems(teamItems, { topN: 3 });
  if (topTeams.length) groups.push({ name: 'Top teams', items: topTeams });

  const notes = [];
  const staleCount = list.filter((file) => isStaleLastModified(file.lastModified)).length;
  if (staleCount > 0) {
    notes.push({
      title: 'Stale files',
      text: `${staleCount} files not modified in 6+ months`,
    });
  }

  let footnote = null;
  if (teamItems.length >= 3) {
    const total = sumCounts(list, 'instances');
    if (total > 0) {
      const topThree = sortByCountDesc(teamItems, 'instances')
        .slice(0, 3)
        .reduce((sum, team) => sum + itemCount(team, 'instances'), 0);
      footnote = `Top 3 teams = ${Math.round((topThree / total) * 100)}% of instances`;
    }
  }

  return buildInsightsPayload(scope, groups, notes, footnote);
}

function buildFileUsageInsightsHtml(files, scope) {
  return renderInsightBarsFromPayload(buildFileUsageInsightsPayload(files, scope));
}

function buildVariantDetailInsightsPayload(variants, variantCount, duration) {
  const variantText = formatVariantSummary(variantCount);
  const scope = variantText ? { title: 'Variants', text: variantText } : null;

  if (!variants?.length) {
    return buildInsightsPayload(scope, [], [], mergeInsightsFootnote(null, duration));
  }

  const propertyAnalysis = analyzePropertyUsage(variants);
  const groups = propertyGroupsFromAnalysis(propertyAnalysis);

  const notes = [];
  const zeroNote = buildZeroInstanceVariantsNote(variants);
  if (zeroNote) notes.push(zeroNote);
  const matrixNote = buildCombinatorialExplosionNote(variants, variantCount);
  if (matrixNote) notes.push(matrixNote);
  const unusedNote = buildUnusedPropertyValuesNote(propertyAnalysis);
  if (unusedNote) notes.push(unusedNote);
  notes.push(...buildDefaultSkewNotes(variants, propertyAnalysis));
  const detachNote = buildHighDetachVariantsNote(variants);
  if (detachNote) notes.push(detachNote);
  const legacyNote = buildLegacyActivityNote(variants, {
    countKey: 'totalInstances',
    minInstances: 50,
    itemNoun: 'variants',
  });
  if (legacyNote) notes.push(legacyNote);
  notes.push(...buildDominantPropertyNotes(propertyAnalysis));

  return buildInsightsPayload(scope, groups, notes, mergeInsightsFootnote(null, duration));
}

function buildVariantDetailInsightsHtml(variants, variantCount, duration) {
  return renderInsightBarsFromPayload(
    buildVariantDetailInsightsPayload(variants, variantCount, duration)
  );
}

function buildInsightsPayloadForState(state, data, options = {}) {
  const scope = options.scope ?? null;
  const duration = options.duration ?? state?.duration ?? null;

  if (state.kind === 'components' && state.depth === 'list') {
    return buildComponentListInsightsPayload(data?.components, scope);
  }
  if (state.kind === 'components' && state.depth === 'detail') {
    return buildVariantDetailInsightsPayload(data?.variants, state.variantCount, duration);
  }
  if (
    state.kind === 'components' &&
    (state.depth === 'variant' || state.depth === 'component')
  ) {
    return buildFileUsageInsightsPayload(data?.files, scope);
  }
  if (state.kind === 'styles' && state.depth === 'list') {
    return buildStyleListInsightsPayload(data?.styles, scope, duration);
  }
  if (state.kind === 'styles' && state.depth === 'detail') {
    return buildFileUsageInsightsPayload(data?.files, scope);
  }
  if (state.kind === 'variables' && state.depth === 'list') {
    if (state.variablesSubTab === 'modes') {
      return buildModeListInsightsPayload(data?.modes, scope);
    }
    return buildVariableListInsightsPayload(data?.variables, scope, duration);
  }
  if (state.kind === 'variables' && state.depth === 'detail') {
    return buildFileUsageInsightsPayload(data?.files, scope);
  }

  return buildInsightsPayload(scope, [], [], null);
}

function buildInsightsHtml(state, data, options = {}) {
  const scope = options.scope || null;
  const duration = options.duration ?? state?.duration ?? null;
  const payload = buildInsightsPayloadForState(state, data, { scope, duration });
  if (insightsPayloadHasContent(payload)) {
    return renderInsightBarsFromPayload(payload);
  }
  return payload.scope ? renderInsightBars([], { scope: payload.scope }) : '';
}

const panelInsightsApi = {
  escapeHtml,
  parseInstanceCount,
  itemCount,
  sortByCountDesc,
  sumCounts,
  buildTopShareItems,
  buildParetoFootnote,
  countZeroInstances,
  buildZeroInstancesNote,
  findDuplicateComponentNames,
  buildDuplicateComponentBullet,
  buildDuplicateComponentNamesNote,
  countZeroInstanceVariants,
  buildZeroInstanceVariantsNote,
  buildHighestDetachRateNote,
  isStaleLastModified,
  aggregateFilesByTeam,
  formatVariantSummary,
  analyzePropertyUsage,
  propertyGroupsFromAnalysis,
  buildHighDetachVariantsNote,
  buildDominantPropertyNotes,
  buildUnusedPropertyValuesNote,
  buildDefaultSkewNotes,
  buildCombinatorialExplosionNote,
  buildLegacyActivityNote,
  durationInsightsFootnote,
  mergeInsightsFootnote,
  renderBarRows,
  renderNote,
  renderInsightBars,
  renderInsightBarsFromPayload,
  insightsPayloadHasContent,
  buildInsightsPayload,
  buildInsightsPayloadForState,
  insightsToCsvRows,
  insightsToMarkdown,
  buildComponentListInsightsPayload,
  buildComponentListInsightsHtml,
  buildStyleListInsightsHtml,
  buildVariableListInsightsHtml,
  buildModeListInsightsHtml,
  buildFileUsageInsightsHtml,
  buildVariantDetailInsightsHtml,
  buildInsightsHtml,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = panelInsightsApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PanelInsights = panelInsightsApi;
}
