'use strict';

/**
 * CSV/JSON/Markdown export formatting shared by the side panel and inline page exports.
 * Fidelity contract: CSV/JSON preserve Figma names exactly; Markdown escapes table pipes only.
 */
(function () {
  if (typeof globalThis !== 'undefined' && globalThis.ExportFormat) return;

function mdCell(val) {
  return String(val ?? '').replace(/\|/g, '\\|');
}

function csvFromRows(rows) {
  return rows
    .map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function sortByInstancesDesc(items, field = 'instances') {
  return [...items].sort((a, b) => {
    const aNum = parseInt(String(a[field] ?? '').replace(/,/g, '') || '0', 10);
    const bNum = parseInt(String(b[field] ?? '').replace(/,/g, '') || '0', 10);
    return bNum - aNum;
  });
}

function fileUsageKindLabel(itemKind) {
  if (itemKind === 'styles') return 'Style';
  if (itemKind === 'component-variant') return 'Variant';
  if (itemKind === 'component') return 'Component';
  return 'Variable';
}

function fileUsageExportSlug(itemKind) {
  if (itemKind === 'styles') return 'style';
  if (itemKind === 'component-variant') return 'variant';
  if (itemKind === 'component') return 'component';
  return 'variable';
}

function sanitizeFilename(name, maxPrefix = 30) {
  const full = name || 'component';
  let hash = 0;
  for (let i = 0; i < full.length; i++) {
    hash = (hash * 31 + full.charCodeAt(i)) >>> 0;
  }
  const suffix = hash.toString(36).slice(0, 6);
  const prefix = full
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, maxPrefix) || 'export';
  return `${prefix}-${suffix}`;
}

function variantCsvRows(data) {
  const rows = [
    ['Component', data.componentName || ''],
    ['Exported', new Date(data.scrapedAt).toLocaleString()],
  ];
  if (data.totalInstances) rows.push(['Total Instances', data.totalInstances]);
  if (data.usedBy) rows.push(['Used By', `${data.usedBy} teams`]);
  if (data.usedIn) rows.push(['Used In', `${data.usedIn} files`]);
  rows.push([], ['Variant', 'Total Instances', 'Inserts (30d)', 'Detaches (30d)']);
  for (const v of data.variants || []) {
    rows.push([v.name, v.totalInstances, v.inserts || '0', v.detaches || '0']);
  }
  return rows;
}

function generateVariantCsv(data) {
  return csvFromRows(variantCsvRows(data));
}

function generateVariantMarkdown(data, options = {}) {
  const footer = options.footer ?? '\n---\n\n*Exported from Figma Analytics Export*\n';
  let md = `# ${data.componentName} - Library Analytics\n\n`;
  md += `**Exported:** ${new Date(data.scrapedAt).toLocaleString()}\n`;
  md += `**View:** ${data.viewType || 'Unknown'}\n\n`;

  if (data.totalInstances || data.usedBy || data.usedIn) {
    md += `## Summary\n\n`;
    if (data.totalInstances) md += `- **Total instances:** ${data.totalInstances}\n`;
    if (data.usedBy) md += `- **Used by:** ${data.usedBy} teams\n`;
    if (data.usedIn) md += `- **Used in:** ${data.usedIn} files\n`;
    md += `\n`;
  }

  md += `## Variant Usage (All Combinations)\n\n`;
  md += `| Variant | Total Instances | Inserts (30d) | Detaches (30d) |\n`;
  md += `|---------|-----------------|---------------|----------------|\n`;
  for (const v of data.variants || []) {
    md += `| ${mdCell(v.name)} | ${v.totalInstances} | ${v.inserts || '-'} | ${v.detaches || '-'} |\n`;
  }
  return md + footer;
}

function libraryCsvRows(data) {
  const rows = [
    ['Library Analytics Export'],
    ['Exported', new Date(data.scrapedAt).toLocaleString()],
    ['Library', data.libraryName || ''],
    ['Total Components', data.componentCount],
    [],
    ['Component', 'Instances'],
  ];
  for (const comp of sortByInstancesDesc(data.components || [])) {
    rows.push([comp.name, comp.instances || '0']);
  }
  return rows;
}

function generateLibraryCsv(data) {
  return csvFromRows(libraryCsvRows(data));
}

function generateLibraryMarkdown(data, options = {}) {
  const footer = options.footer ?? '\n---\n\n*Exported from Figma Analytics Export*\n';
  let md = `# Library Analytics - All Components\n\n`;
  md += `**Library:** ${data.libraryName || 'Unknown'}\n`;
  md += `**Exported:** ${new Date(data.scrapedAt).toLocaleString()}\n`;
  md += `**Total Components:** ${data.componentCount}\n\n`;
  md += `## Component Usage\n\n`;
  md += `| # | Component | Instances |\n`;
  md += `|---|-----------|----------|\n`;
  sortByInstancesDesc(data.components || []).forEach((comp, i) => {
    md += `| ${i + 1} | ${mdCell(comp.name)} | ${comp.instances || '0'} |\n`;
  });
  return md + footer;
}

function styleListCsvRows(data) {
  const rows = [
    ['Library Analytics Export - Styles'],
    ['Exported', new Date(data.scrapedAt).toLocaleString()],
    ['Library', data.libraryName || ''],
    ['Total Styles', data.styleCount],
    [],
    ['Style', 'Total Instances', 'Inserts (30d)', 'Detaches (30d)'],
  ];
  for (const style of sortByInstancesDesc(data.styles || [])) {
    rows.push([style.name, style.instances || '0', style.inserts || '0', style.detaches || '0']);
  }
  return rows;
}

function generateStyleListCsv(data) {
  return csvFromRows(styleListCsvRows(data));
}

function generateStyleListMarkdown(data, options = {}) {
  const footer = options.footer ?? '\n---\n\n*Exported from Figma Analytics Export*\n';
  let md = `# Library Analytics - All Styles\n\n`;
  md += `**Library:** ${data.libraryName || 'Unknown'}\n`;
  md += `**Exported:** ${new Date(data.scrapedAt).toLocaleString()}\n`;
  md += `**Total Styles:** ${data.styleCount}\n\n`;
  md += `## Style Usage\n\n`;
  md += `| # | Style | Total Instances | Inserts (30d) | Detaches (30d) |\n`;
  md += `|---|-------|-----------------|---------------|----------------|\n`;
  sortByInstancesDesc(data.styles || []).forEach((style, i) => {
    md += `| ${i + 1} | ${mdCell(style.name)} | ${style.instances || '0'} | ${style.inserts || '0'} | ${style.detaches || '0'} |\n`;
  });
  return md + footer;
}

function variableListCsvRows(data) {
  const rows = [
    ['Library Analytics Export - Variables'],
    ['Exported', new Date(data.scrapedAt).toLocaleString()],
    ['Library', data.libraryName || ''],
    ['Sub-tab', 'Variables'],
    ['Total Variables', data.entryCount || data.variables?.length || 0],
    [],
    ['Variable', 'Collection', 'Total Instances', 'Inserts (30d)', 'Detaches (30d)'],
  ];
  for (const variable of sortByInstancesDesc(data.variables || [])) {
    rows.push([
      variable.name,
      variable.collection || '',
      variable.instances || '0',
      variable.inserts || '0',
      variable.detaches || '0',
    ]);
  }
  return rows;
}

function generateVariableListCsv(data) {
  return csvFromRows(variableListCsvRows(data));
}

function generateVariableListMarkdown(data, options = {}) {
  const footer = options.footer ?? '\n---\n\n*Exported from Figma Analytics Export*\n';
  let md = `# Library Analytics - All Variables\n\n`;
  md += `**Library:** ${data.libraryName || 'Unknown'}\n`;
  md += `**Sub-tab:** Variables\n`;
  md += `**Exported:** ${new Date(data.scrapedAt).toLocaleString()}\n`;
  md += `**Total Variables:** ${data.entryCount || data.variables?.length || 0}\n\n`;
  md += `## Variable Usage\n\n`;
  md += `| # | Variable | Collection | Total Instances | Inserts (30d) | Detaches (30d) |\n`;
  md += `|---|----------|------------|-----------------|---------------|----------------|\n`;
  sortByInstancesDesc(data.variables || []).forEach((variable, i) => {
    md += `| ${i + 1} | ${mdCell(variable.name)} | ${mdCell(variable.collection || '')} | ${variable.instances || '0'} | ${variable.inserts || '0'} | ${variable.detaches || '0'} |\n`;
  });
  return md + footer;
}

function modeListCsvRows(data) {
  const rows = [
    ['Library Analytics Export - Modes'],
    ['Exported', new Date(data.scrapedAt).toLocaleString()],
    ['Library', data.libraryName || ''],
    ['Sub-tab', 'Modes'],
    ['Total Modes', data.entryCount || data.modes?.length || 0],
    [],
    ['Mode', 'Collection', 'Total Instances'],
  ];
  for (const mode of sortByInstancesDesc(data.modes || [], 'instances')) {
    rows.push([mode.mode, mode.collection || '', mode.instances || '0']);
  }
  return rows;
}

function generateModeListCsv(data) {
  return csvFromRows(modeListCsvRows(data));
}

function generateModeListMarkdown(data, options = {}) {
  const footer = options.footer ?? '\n---\n\n*Exported from Figma Analytics Export*\n';
  let md = `# Library Analytics - All Modes\n\n`;
  md += `**Library:** ${data.libraryName || 'Unknown'}\n`;
  md += `**Sub-tab:** Modes\n`;
  md += `**Exported:** ${new Date(data.scrapedAt).toLocaleString()}\n`;
  md += `**Total Modes:** ${data.entryCount || data.modes?.length || 0}\n\n`;
  md += `## Mode Usage\n\n`;
  md += `| # | Mode | Collection | Total Instances |\n`;
  md += `|---|------|------------|-----------------|\n`;
  sortByInstancesDesc(data.modes || []).forEach((mode, i) => {
    md += `| ${i + 1} | ${mdCell(mode.mode)} | ${mdCell(mode.collection || '')} | ${mode.instances || '0'} |\n`;
  });
  return md + footer;
}

function fileUsageCsvRows(data) {
  const kindLabel = fileUsageKindLabel(data.itemKind);
  const rows = [
    [`${kindLabel} File Usage Export`],
    [kindLabel, data.itemName || ''],
    ['Exported', new Date(data.scrapedAt).toLocaleString()],
    ['Library', data.libraryName || ''],
  ];
  if (data.totalInstances) rows.push(['Total Instances', data.totalInstances]);
  if (data.usedBy) rows.push(['Used By', `${data.usedBy} teams`]);
  if (data.usedIn) rows.push(['Used In', `${data.usedIn} files`]);
  rows.push([], ['File', 'Team', 'Instances', 'Last Modified']);
  for (const file of data.files || []) {
    rows.push([file.name, file.team || '', file.instances || '0', file.lastModified || '']);
  }
  return rows;
}

function generateFileUsageCsv(data) {
  return csvFromRows(fileUsageCsvRows(data));
}

function generateFileUsageMarkdown(data, options = {}) {
  const footer = options.footer ?? '\n---\n\n*Exported from Figma Analytics Export*\n';
  const kindLabel = fileUsageKindLabel(data.itemKind);
  let md = `# ${data.itemName} - ${kindLabel} File Usage\n\n`;
  md += `**Library:** ${data.libraryName || 'Unknown'}\n`;
  md += `**Exported:** ${new Date(data.scrapedAt).toLocaleString()}\n\n`;

  if (data.totalInstances || data.usedBy || data.usedIn) {
    md += `## Summary\n\n`;
    if (data.totalInstances) md += `- **Total instances:** ${data.totalInstances}\n`;
    if (data.usedBy) md += `- **Used by:** ${data.usedBy} teams\n`;
    if (data.usedIn) md += `- **Used in:** ${data.usedIn} files\n`;
    md += `\n`;
  }

  md += `## File Usage\n\n`;
  md += `| File | Team | Instances | Last Modified |\n`;
  md += `|------|------|----------|---------------|\n`;
  for (const file of data.files || []) {
    md += `| ${mdCell(file.name)} | ${mdCell(file.team || '')} | ${file.instances || '0'} | ${mdCell(file.lastModified || '')} |\n`;
  }
  return md + footer;
}

const ExportFormat = {
  mdCell,
  csvFromRows,
  sortByInstancesDesc,
  fileUsageKindLabel,
  fileUsageExportSlug,
  sanitizeFilename,
  variantCsvRows,
  generateVariantCsv,
  generateVariantMarkdown,
  libraryCsvRows,
  generateLibraryCsv,
  generateLibraryMarkdown,
  styleListCsvRows,
  generateStyleListCsv,
  generateStyleListMarkdown,
  variableListCsvRows,
  generateVariableListCsv,
  generateVariableListMarkdown,
  modeListCsvRows,
  generateModeListCsv,
  generateModeListMarkdown,
  fileUsageCsvRows,
  generateFileUsageCsv,
  generateFileUsageMarkdown,
};

if (typeof globalThis !== 'undefined') {
  globalThis.ExportFormat = ExportFormat;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExportFormat;
}
})();
