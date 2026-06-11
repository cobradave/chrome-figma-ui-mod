/**
 * Parse a simple RFC 4180 CSV string into rows of string cells.
 * @param {string} csv
 * @returns {string[][]}
 */
export function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    const next = csv[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\r') {
      continue;
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * @param {string[][]} rows
 * @param {string} label
 * @returns {string|undefined}
 */
export function csvLabelValue(rows, label) {
  const match = rows.find((row) => row[0] === label);
  return match?.[1];
}

/**
 * @param {string[][]} rows
 * @param {string} headerLabel
 * @returns {string[][]}
 */
export function csvDataRowsAfterHeader(rows, headerLabel) {
  const headerIdx = rows.findIndex((row) => row[0] === headerLabel);
  if (headerIdx === -1) return [];
  return rows.slice(headerIdx + 1).filter((row) => row.length > 1 && row.some(Boolean));
}

/**
 * Count markdown table body rows after a header line containing `needle`.
 * @param {string} md
 * @param {string} needle
 * @returns {number}
 */
export function markdownTableBodyRowCount(md, needle) {
  const lines = md.split('\n');
  const headerIdx = lines.findIndex((line) => line.includes(needle) && line.startsWith('|'));
  if (headerIdx === -1) return 0;
  let count = 0;
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    if (/^\|\s*-/.test(line)) continue;
    count++;
  }
  return count;
}

/**
 * @param {string} md
 * @param {string} sourceName
 * @returns {boolean}
 */
export function markdownTableContainsName(md, sourceName) {
  const escaped = sourceName.replace(/\|/g, '\\|');
  return md.includes(`| ${escaped} |`) || md.includes(`| ${escaped}|`);
}
