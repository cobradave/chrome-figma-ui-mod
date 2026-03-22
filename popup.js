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

// Library-level export elements (all components)
const libraryExportSection = document.getElementById('libraryExportSection');
const exportLibraryCsvBtn = document.getElementById('exportLibraryCsv');
const exportLibraryJsonBtn = document.getElementById('exportLibraryJson');
const exportLibraryMdBtn = document.getElementById('exportLibraryMd');

// Component-level export elements (single component)
const componentExportSection = document.getElementById('componentExportSection');
const componentExportLabel = document.getElementById('componentExportLabel');
const exportCsvBtn = document.getElementById('exportCsv');
const exportJsonBtn = document.getElementById('exportJson');
const exportMdBtn = document.getElementById('exportMd');

const previewEl = document.getElementById('preview');
const previewContentEl = document.getElementById('previewContent');

// Event listeners
scanComponentsBtn.addEventListener('click', scanComponents);
componentDropdownEl.addEventListener('change', onComponentSelect);
scrapeBtn.addEventListener('click', scrapeVariants);

// Library-level exports
exportLibraryCsvBtn.addEventListener('click', () => exportLibraryData('csv'));
exportLibraryJsonBtn.addEventListener('click', () => exportLibraryData('json'));
exportLibraryMdBtn.addEventListener('click', () => exportLibraryData('md'));

// Component-level exports
exportCsvBtn.addEventListener('click', () => exportData('csv'));
exportJsonBtn.addEventListener('click', () => exportData('json'));
exportMdBtn.addEventListener('click', () => exportData('md'));

// ──────────────────────────────────────────────
// Scan for components (All Components view)
// ──────────────────────────────────────────────
async function scanComponents() {
  setStatus('Scanning for components...', 'info');
  scanComponentsBtn.disabled = true;

  // Reset component-level state
  scrapedData = null;
  selectedComponent = null;
  componentExportSection.style.display = 'none';
  previewEl.style.display = 'none';
  scrapeBtn.disabled = true;

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
    
    // Show library-level export buttons
    libraryExportSection.style.display = 'block';
    
    setStatus(`Found ${componentList.length} components. Export all, or select one for detailed stats.`, 'success');
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
    // Hide component-level export when deselecting
    componentExportSection.style.display = 'none';
    previewEl.style.display = 'none';
    return;
  }
  
  selectedComponent = componentList.find(c => c.name === selectedName);
  if (!selectedComponent) {
    setStatus('Component not found. Try scanning again.', 'error');
    return;
  }
  
  scrapeBtn.disabled = false;
  // Hide component export until they scrape
  componentExportSection.style.display = 'none';
  previewEl.style.display = 'none';
  scrapedData = null;
  setStatus(`Selected: ${selectedComponent.name}. Navigate to its variants in Figma, then click "Scrape Variants".`, 'info');
}

// ──────────────────────────────────────────────
// Scrape variants for selected component
// ──────────────────────────────────────────────
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
    
    // Show component-level export buttons with dynamic label
    componentExportSection.style.display = 'block';
    componentExportLabel.textContent = `Export: ${selectedComponent.name}`;
    
    showPreview(data);
    const countInfo = data.expectedCount ? ` (expected ${data.expectedCount})` : '';
    setStatus(`Found ${data.variants.length} variants for ${selectedComponent.name}${countInfo}`, 'success');
  } catch (err) {
    console.error('Scrape error:', err);
    setStatus('Error: ' + err.message, 'error');
  }
  
  scrapeBtn.disabled = false;
}

// ──────────────────────────────────────────────
// Injected: Scan for component list (runs in Figma page)
// ──────────────────────────────────────────────
async function scrapeComponentListFromPage() {
  try {
    const components = [];
    const seenNames = new Set();
    
    console.log('[ComponentScan] Starting scan with auto-scroll...');
    
    const extractComponents = () => {
      let foundNew = false;
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.innerText?.trim();
        if (!text) continue;
        if (text.length > 300 || text.length < 2) continue;
        
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        // A single component row shouldn't have more than 8 lines of text
        if (lines.length < 2 || lines.length > 8) continue;

        const firstLine = lines[0];
        // Component name shouldn't be a pure number or generic status
        if (/^[\d,]+$/.test(firstLine) || firstLine === '-' || firstLine === 'N/A') continue;
        
        // Exclude table headers
        const lowerFirst = firstLine.toLowerCase();
        if (lowerFirst === 'component' || lowerFirst.includes('total instances') || lowerFirst.includes('used by')) continue;

        let numIdx = -1;
        for (let i = 1; i < lines.length; i++) {
           if (/^[\d,]+$/.test(lines[i]) || lines[i] === '-' || lines[i] === '0') {
              numIdx = i;
              break;
           }
        }

        if (numIdx === -1) continue; // No instance count found

        let compName = firstLine.replace(/\s+[\d,]+$/, '').trim();
        if (compName.length < 2 || compName.length > 80) continue;
        
        // Ignore generic Figma UI elements that might look like component rows
        if (['filter', 'columns', 'export', 'cancel', 'save', 'done', 'close', 'search'].includes(compName.toLowerCase())) continue;

        if (seenNames.has(compName)) continue;

        let extraText = '';
        if (numIdx > 1) {
           extraText = lines.slice(1, numIdx).join(' ');
        }
        
        const instanceStr = lines[numIdx];
        const instanceCount = (instanceStr === '-' || instanceStr === '') ? '0' : instanceStr;

        seenNames.add(compName);
        components.push({
          name: compName,
          instances: instanceCount,
          badge: extraText
        });
        foundNew = true;
        console.log(`[ComponentScan] Found: ${compName} | Ex: ${extraText} | Inst: ${instanceCount}`);
      }
      return foundNew;
    };

    extractComponents();

    let scrollContainer = null;
    let maxScroll = 0;
    const allElems = document.querySelectorAll('*');
    for (const el of allElems) {
      if (el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
        if (el.tagName !== 'BODY' && el.tagName !== 'HTML') {
          const style = window.getComputedStyle(el);
          const isScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay' || style.overflow === 'auto' || style.overflow === 'scroll';
          if (isScrollable) {
            if (el.scrollHeight > maxScroll) {
              maxScroll = el.scrollHeight;
              scrollContainer = el;
            }
          }
        }
      }
    }

    if (scrollContainer) {
      console.log('[ComponentScan] Found scrollable list, auto-scrolling to collect all...');
      scrollContainer.scrollTop = 0;
      await new Promise(r => setTimeout(r, 300));
      extractComponents();

      let lastScroll = -1;
      let noNewComponentsCount = 0;

      while (true) {
        lastScroll = scrollContainer.scrollTop;
        scrollContainer.scrollTop += scrollContainer.clientHeight * 0.8;
        await new Promise(r => setTimeout(r, 500));
        
        const newlyFound = extractComponents();
        
        if (scrollContainer.scrollTop === lastScroll) {
          break; // Reached bottom
        }
        
        if (!newlyFound) {
          noNewComponentsCount++;
          if (noNewComponentsCount > 2) break;
        } else {
          noNewComponentsCount = 0;
        }
      }
    }

    console.log('[ComponentScan] Total components collected:', components.length);

    if (components.length === 0) {
      return { error: 'No components found. Make sure you\'re on the Library Analytics "All Components" view.' };
    }
    
    return { components };
  } catch (err) {
    return { error: 'Error scanning: ' + err.message };
  }
}

// ──────────────────────────────────────────────
// Injected: Scrape variant data (runs in Figma page)
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// Analysis: Property usage from variant data
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// Preview
// ──────────────────────────────────────────────
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
// Export: Library-level (all components)
// ──────────────────────────────────────────────
function exportLibraryData(format) {
  if (!componentList || componentList.length === 0) return;
  
  const timestamp = new Date().toISOString().split('T')[0];
  const exportPayload = {
    libraryName: 'Library Analytics',
    viewType: 'All Components',
    componentCount: componentList.length,
    components: componentList,
    scrapedAt: new Date().toISOString(),
  };
  
  if (format === 'csv') {
    const csv = generateLibraryCsv(exportPayload);
    downloadFile(csv, `library-analytics-${timestamp}.csv`, 'text/csv;charset=utf-8;');
  } else if (format === 'json') {
    const json = JSON.stringify(exportPayload, null, 2);
    downloadFile(json, `library-analytics-${timestamp}.json`, 'application/json');
  } else if (format === 'md') {
    const md = generateLibraryMarkdown(exportPayload);
    downloadFile(md, `library-analytics-${timestamp}.md`, 'text/markdown');
  }
  
  setStatus(`Exported all ${componentList.length} components as ${format.toUpperCase()}!`, 'success');
}

function generateLibraryCsv(data) {
  const rows = [];
  
  // Header metadata
  rows.push(['Library Analytics Export']);
  rows.push(['Exported', new Date(data.scrapedAt).toLocaleString()]);
  rows.push(['Total Components', data.componentCount]);
  rows.push([]);
  
  // Component data table
  rows.push(['Component', 'Instances']);
  
  // Sort by instance count descending
  const sorted = [...data.components].sort((a, b) => {
    const aNum = parseInt(a.instances?.replace(/,/g, '') || '0');
    const bNum = parseInt(b.instances?.replace(/,/g, '') || '0');
    return bNum - aNum;
  });
  
  for (const comp of sorted) {
    rows.push([comp.name, comp.instances || '0']);
  }
  
  // Escape and join
  return rows
    .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function generateLibraryMarkdown(data) {
  let md = `# Library Analytics - All Components\n\n`;
  md += `**Exported:** ${new Date(data.scrapedAt).toLocaleString()}\n`;
  md += `**Total Components:** ${data.componentCount}\n\n`;
  
  md += `## Component Usage\n\n`;
  md += `| # | Component | Instances |\n`;
  md += `|---|-----------|----------|\n`;
  
  // Sort by instance count descending
  const sorted = [...data.components].sort((a, b) => {
    const aNum = parseInt(a.instances?.replace(/,/g, '') || '0');
    const bNum = parseInt(b.instances?.replace(/,/g, '') || '0');
    return bNum - aNum;
  });
  
  sorted.forEach((comp, i) => {
    md += `| ${i + 1} | ${comp.name} | ${comp.instances || '0'} |\n`;
  });
  
  md += `\n---\n\n`;
  md += `*Exported from Figma Analytics Export (formerly Figma UI Mod)*\n`;
  
  return md;
}

// ──────────────────────────────────────────────
// Export: Component-level (single component variants)
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
  
  setStatus(`Exported ${scrapedData.componentName} as ${format.toUpperCase()}!`, 'success');
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
  md += `## Variant Usage (All Combinations)\n\n`;
  md += `| Variant | Total Instances | Inserts (30d) | Detaches (30d) |\n`;
  md += `|---------|-----------------|---------------|----------------|\n`;
  
  for (const v of data.variants) {
    md += `| ${v.name} | ${v.totalInstances} | ${v.inserts || '-'} | ${v.detaches || '-'} |\n`;
  }
  
  md += `\n---\n\n`;
  md += `*Exported from Figma Analytics Export (formerly Figma UI Mod)*\n`;
  
  return md;
}

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────
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