// State
let scrapedData = null;
let componentList = [];
let selectedComponent = null;

// Elements
const statusEl = document.getElementById('status');
const scanComponentsBtn = document.getElementById('scanComponents');
const componentSelectorEl = document.getElementById('componentSelector');
const componentDropdownEl = document.getElementById('componentDropdown');
const scrapeBtn = document.getElementById('scrape');
const exportCsvBtn = document.getElementById('exportCsv');
const exportJsonBtn = document.getElementById('exportJson');
const exportMdBtn = document.getElementById('exportMd');
const previewEl = document.getElementById('preview');
const previewContentEl = document.getElementById('previewContent');

// Event listeners
scanComponentsBtn.addEventListener('click', scanComponents);
componentDropdownEl.addEventListener('change', onComponentSelect);
scrapeBtn.addEventListener('click', scrapeVariants);
exportCsvBtn.addEventListener('click', () => exportData('csv'));
exportJsonBtn.addEventListener('click', () => exportData('json'));
exportMdBtn.addEventListener('click', () => exportData('md'));

// Scan for components (All Components view)
async function scanComponents() {
  setStatus('Scanning for components...', 'info');
  scanComponentsBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('figma.com')) {
      setStatus('Please open Figma first.', 'error');
      scanComponentsBtn.disabled = false;
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeComponentListFromPage,
    });

    const data = results[0]?.result;
    
    if (!data || data.error) {
      setStatus(data?.error || 'Could not find components.', 'error');
      scanComponentsBtn.disabled = false;
      return;
    }

    componentList = data.components;
    populateDropdown(componentList);
    componentSelectorEl.style.display = 'block';
    
    setStatus(`Found ${componentList.length} components. Select one from the dropdown.`, 'success');
  } catch (err) {
    console.error('Scan error:', err);
    setStatus('Error: ' + err.message, 'error');
  }
  
  scanComponentsBtn.disabled = false;
}

function populateDropdown(components) {
  componentDropdownEl.innerHTML = '<option value="">-- Select a component --</option>';
  
  // Sort by instance count (descending)
  const sorted = [...components].sort((a, b) => {
    const aNum = parseInt(a.instances?.replace(/,/g, '') || '0');
    const bNum = parseInt(b.instances?.replace(/,/g, '') || '0');
    return bNum - aNum;
  });
  
  sorted.forEach((comp) => {
    const option = document.createElement('option');
    option.value = comp.name;
    option.textContent = `${comp.name} (${comp.instances || '?'} instances)`;
    componentDropdownEl.appendChild(option);
  });
}

function onComponentSelect() {
  const selectedName = componentDropdownEl.value;
  if (selectedName === '') {
    selectedComponent = null;
    scrapeBtn.disabled = true;
    return;
  }
  
  selectedComponent = componentList.find(c => c.name === selectedName);
  if (!selectedComponent) {
    setStatus('Component not found. Try scanning again.', 'error');
    return;
  }
  
  scrapeBtn.disabled = false;
  setStatus(`Selected: ${selectedComponent.name}. Navigate to its variants in Figma, then click "Scrape Variants".`, 'info');
}

// Scrape variants for selected component
async function scrapeVariants() {
  if (!selectedComponent) {
    setStatus('Please select a component first.', 'error');
    return;
  }
  
  setStatus('Scraping variants...', 'info');
  scrapeBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeLibraryAnalyticsFromPage,
    });

    const data = results[0]?.result;
    
    if (!data) {
      setStatus('Could not scrape data.', 'error');
      scrapeBtn.disabled = false;
      return;
    }

    if (data.error) {
      setStatus(data.error, 'error');
      scrapeBtn.disabled = false;
      return;
    }

    // Use selected component name
    data.componentName = selectedComponent.name;
    scrapedData = data;
    
    exportCsvBtn.disabled = false;
    exportJsonBtn.disabled = false;
    exportMdBtn.disabled = false;
    
    showPreview(data);
    const countInfo = data.expectedCount ? ` (expected ${data.expectedCount})` : '';
    setStatus(`Found ${data.variants.length} variants for ${selectedComponent.name}${countInfo}`, 'success');
  } catch (err) {
    console.error('Scrape error:', err);
    setStatus('Error: ' + err.message, 'error');
  }
  
  scrapeBtn.disabled = false;
}

// Function to scan for component list (runs in Figma page)
function scrapeComponentListFromPage() {
  try {
    const components = [];
    const seenNames = new Set();
    
    console.log('[ComponentScan] Starting scan...');
    
    const allElements = document.querySelectorAll('*');
    
    for (const el of allElements) {
      const text = el.innerText?.trim();
      if (!text) continue;
      
      if (text.length > 300 || text.length < 10) continue;
      if (!text.includes('❖')) continue;
      
      const numbers = text.match(/\b([\d,]{1,10})\b/g);
      if (!numbers || numbers.length < 1) continue;
      if (el.querySelectorAll('*').length > 20) continue;
      
      const nameMatch = text.match(/❖[^\n\t]+/);
      if (!nameMatch) continue;
      
      let compName = nameMatch[0].trim();
      compName = compName.replace(/\s+[\d,]+$/, '').trim();
      
      if (compName.length < 3 || compName.length > 80) continue;
      if (seenNames.has(compName)) continue;
      
      const validNumbers = numbers.filter(n => parseInt(n.replace(/,/g, '')) > 0);
      const instanceCount = validNumbers[0] || '';
      
      seenNames.add(compName);
      components.push({
        name: compName,
        instances: instanceCount,
      });
      
      if (components.length <= 5) {
        console.log('[ComponentScan] Found:', compName, '|', instanceCount);
      }
    }
    
    console.log('[ComponentScan] Total components found:', components.length);
    
    if (components.length === 0) {
      return { error: 'No components found. Make sure you\'re on the Library Analytics "All Components" view.' };
    }
    
    return { components };
  } catch (err) {
    return { error: 'Error scanning: ' + err.message };
  }
}

// This function runs in the context of the Figma page - scrapes variant data
function scrapeLibraryAnalyticsFromPage() {
  try {
    console.log('[VariantScraper] Starting variant scrape...');
    
    const allText = document.body.innerText;
    
    const variantsMatch = allText.match(/Showing\s*(\d+)\s*variants/i);
    const expectedCount = variantsMatch ? parseInt(variantsMatch[1]) : 0;
    console.log('[VariantScraper] Expected variants:', expectedCount);
    
    let totalInstances = '';
    let usedBy = '';
    let usedIn = '';
    
    const statsMatch = allText.match(/Total\s*([\d,.]+k?)\s*instances/i);
    if (statsMatch) totalInstances = statsMatch[1];
    
    const teamsMatch = allText.match(/Used by\s*([\d,.]+k?)\s*teams/i);
    if (teamsMatch) usedBy = teamsMatch[1];
    
    const filesMatch = allText.match(/Used in\s*([\d,.]+k?)\s*files/i);
    if (filesMatch) usedIn = filesMatch[1];

    const variants = [];
    const seenNames = new Set();
    
    const allElements = document.querySelectorAll('*');
    
    for (const el of allElements) {
      const text = el.innerText?.trim();
      if (!text) continue;
      
      if (text.length > 300 || text.length < 20) continue;
      if (el.querySelectorAll('*').length > 15) continue;
      
      const isVariant = text.includes('=') || text.match(/\bdefault\b/i);
      if (!isVariant) continue;
      if (text.includes('❖')) continue;
      if (text.includes(' / ')) continue;
      
      const numbers = text.match(/\b([\d,]+)\b/g);
      if (!numbers || numbers.length < 3) continue;
      if (numbers.length > 6) continue;
      
      let nameEndPos = text.length;
      for (const num of numbers) {
        if (num.replace(/,/g, '').length >= 1) {
          const pos = text.indexOf(num);
          if (pos > 10 && pos < nameEndPos) {
            nameEndPos = pos;
            break;
          }
        }
      }
      
      let variantName = text.substring(0, nameEndPos).trim();
      variantName = variantName.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      
      if (variantName.length < 5) continue;
      if (seenNames.has(variantName)) continue;
      
      const lastThree = numbers.slice(-3);
      
      seenNames.add(variantName);
      variants.push({
        name: variantName,
        totalInstances: lastThree[0] || '0',
        inserts: lastThree[1] || '0',
        detaches: lastThree[2] || '0',
      });
      
      if (variants.length <= 5) {
        console.log('[VariantScraper] Found:', variantName.substring(0, 40), '|', lastThree);
      }
    }
    
    console.log('[VariantScraper] Total found:', variants.length, '/ expected:', expectedCount);

    if (expectedCount === 0) {
      return { error: 'Not on variants view. Click a component in Figma to see its "All variants" tab first.' };
    }

    if (variants.length === 0) {
      return { error: 'No variants found. Make sure you\'re on the "All variants" view for a component.' };
    }

    return {
      componentName: 'Selected Component',
      totalInstances: totalInstances,
      usedBy: usedBy,
      usedIn: usedIn,
      viewType: 'All Variants',
      expectedCount: expectedCount,
      variants: variants,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { error: 'Scraping error: ' + err.message };
  }
}

// Analyze property usage from variant data
function analyzePropertyUsage(variants) {
  const properties = {};
  let totalInstances = 0;
  
  for (const variant of variants) {
    const count = parseInt(variant.totalInstances?.replace(/,/g, '') || '0');
    totalInstances += count;
    
    const parts = variant.name.split(',').map(p => p.trim());
    let positionIndex = 0;
    const positionNames = ['state1', 'state2', 'color'];
    
    for (const part of parts) {
      if (part.includes('=')) {
        const [propName, propValue] = part.split('=').map(s => s.trim());
        if (!properties[propName]) properties[propName] = {};
        properties[propName][propValue] = (properties[propName][propValue] || 0) + count;
      } else if (positionIndex < positionNames.length) {
        const propName = positionNames[positionIndex];
        const propValue = part.replace(/\s*\(default\)/g, '').trim();
        if (!properties[propName]) properties[propName] = {};
        properties[propName][propValue] = (properties[propName][propValue] || 0) + count;
        positionIndex++;
      }
    }
  }
  
  const result = {};
  for (const [propName, values] of Object.entries(properties)) {
    const sorted = Object.entries(values)
      .map(([value, count]) => ({
        value,
        count,
        percent: totalInstances > 0 ? ((count / totalInstances) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.count - a.count);
    result[propName] = sorted;
  }
  
  return { properties: result, totalInstances };
}

function showPreview(data) {
  previewEl.style.display = 'block';
  
  const analysis = analyzePropertyUsage(data.variants);
  data.propertyAnalysis = analysis;
  
  let html = '<div style="font-weight: 600; margin-bottom: 8px;">Property Usage:</div>';
  
  const propNames = Object.keys(analysis.properties).slice(0, 4);
  for (const propName of propNames) {
    const values = analysis.properties[propName].slice(0, 3);
    html += `<div style="margin-bottom: 6px;">
      <div style="font-size: 11px; color: #666; text-transform: uppercase;">${propName}</div>`;
    for (const v of values) {
      const barWidth = Math.min(parseFloat(v.percent), 100);
      html += `<div style="display: flex; align-items: center; font-size: 12px; margin: 2px 0;">
        <span style="width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${v.value}</span>
        <div style="flex: 1; height: 8px; background: #eee; border-radius: 4px; margin: 0 6px;">
          <div style="width: ${barWidth}%; height: 100%; background: #4CAF50; border-radius: 4px;"></div>
        </div>
        <span style="width: 40px; text-align: right; color: #666;">${v.percent}%</span>
      </div>`;
    }
    html += '</div>';
  }
  
  html += `<div style="color: #888; font-size: 11px; margin-top: 8px;">
    ${data.variants.length} variants, ${analysis.totalInstances.toLocaleString()} total instances
  </div>`;
  
  previewContentEl.innerHTML = html;
}

// ──────────────────────────────────────────────
// Export: CSV, JSON, Markdown
// ──────────────────────────────────────────────

function exportData(format) {
  if (!scrapedData) return;
  
  const timestamp = new Date().toISOString().split('T')[0];
  const safeName = (scrapedData.componentName || 'component')
    .replace(/[^a-z0-9]/gi, '-')
    .toLowerCase()
    .slice(0, 30);
  
  if (format === 'csv') {
    const csv = generateCsv(scrapedData);
    downloadFile(csv, `${safeName}-analytics-${timestamp}.csv`, 'text/csv;charset=utf-8;');
  } else if (format === 'json') {
    const json = JSON.stringify(scrapedData, null, 2);
    downloadFile(json, `${safeName}-analytics-${timestamp}.json`, 'application/json');
  } else if (format === 'md') {
    const md = generateMarkdown(scrapedData);
    downloadFile(md, `${safeName}-analytics-${timestamp}.md`, 'text/markdown');
  }
  
  setStatus(`Exported as ${format.toUpperCase()}!`, 'success');
}

function generateCsv(data) {
  const rows = [];
  
  // Header metadata
  rows.push(['Component', data.componentName || '']);
  rows.push(['Exported', new Date(data.scrapedAt).toLocaleString()]);
  if (data.totalInstances) rows.push(['Total Instances', data.totalInstances]);
  if (data.usedBy) rows.push(['Used By', data.usedBy + ' teams']);
  if (data.usedIn) rows.push(['Used In', data.usedIn + ' files']);
  rows.push([]);
  
  // Variant data table
  rows.push(['Variant', 'Total Instances', 'Inserts (30d)', 'Detaches (30d)']);
  for (const v of data.variants) {
    rows.push([v.name, v.totalInstances, v.inserts || '0', v.detaches || '0']);
  }
  
  // Property analysis
  if (data.propertyAnalysis && data.propertyAnalysis.properties) {
    rows.push([]);
    rows.push(['Property Analysis']);
    rows.push(['Property', 'Value', 'Instances', 'Percentage']);
    
    for (const [propName, values] of Object.entries(data.propertyAnalysis.properties)) {
      for (const v of values) {
        rows.push([propName, v.value, v.count, v.percent + '%']);
      }
    }
  }
  
  // Escape and join
  return rows
    .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function generateMarkdown(data) {
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
  
  // Property usage analysis
  if (data.propertyAnalysis) {
    md += `## Property Usage\n\n`;
    md += `Total instances analyzed: **${data.propertyAnalysis.totalInstances.toLocaleString()}**\n\n`;
    
    for (const [propName, values] of Object.entries(data.propertyAnalysis.properties)) {
      md += `### ${propName}\n\n`;
      md += `| Value | Instances | % |\n`;
      md += `|-------|-----------|---|\n`;
      
      for (const v of values) {
        md += `| ${v.value} | ${v.count.toLocaleString()} | ${v.percent}% |\n`;
      }
      md += `\n`;
    }
  }
  
  // Variant table
  if (data.viewType === 'All Components') {
    md += `## Component Usage\n\n`;
    md += `| Component | Variants | Instances (30d) | Inserts (30d) | Detaches (30d) |\n`;
    md += `|-----------|----------|-----------------|---------------|----------------|\n`;
    
    for (const v of data.variants) {
      md += `| ${v.name} | ${v.variantCount || '-'} | ${v.totalInstances} | ${v.inserts || '-'} | ${v.detaches || '-'} |\n`;
    }
  } else {
    md += `## Variant Usage (All Combinations)\n\n`;
    md += `| Variant | Total Instances | Inserts (30d) | Detaches (30d) |\n`;
    md += `|---------|-----------------|---------------|----------------|\n`;
    
    for (const v of data.variants) {
      md += `| ${v.name} | ${v.totalInstances} | ${v.inserts || '-'} | ${v.detaches || '-'} |\n`;
    }
  }
  
  md += `\n---\n\n`;
  md += `*Exported from Figma Analytics Export (fna Figma UI Mod)*\n`;
  
  return md;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
}