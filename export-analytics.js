// export-analytics.js
// Adds JSON and Markdown export options to the Figma Library Analytics modal.
// Follows the same content-script pattern as background.js.
"use strict";

// ──────────────────────────────────────────────
// Helpers: detect modal context
// ──────────────────────────────────────────────

function getModalContext() {
  const isDSA = !!document.querySelector(
    '[class*="dsa_file_view_modal--container--"]',
  );
  const isOrg = !!document.querySelector(
    '[class*="org_view_modal--container--"]',
  );

  if (!isDSA && !isOrg) return null;

  let view = null;

  if (
    document.querySelector('[class*="dsa_file_view_overview--fileViewDSA--"]')
  ) {
    view = "Overview";
  } else if (
    isOrg &&
    document.querySelector(
      '[class*="overview_stats_view--componentDescriptionAndImage--"]',
    )
  ) {
    view = "Component Detail";
  } else if (
    document.querySelector('[class*="dsa_file_view_v2--slidingPaneLeft--"]')
  ) {
    view = "Component Detail";
  } else if (
    isOrg &&
    document.querySelector(
      '[class*="dsa_library_view--slidingPaneContainer--"]',
    )
  ) {
    view = "Component List";
  } else if (
    document.querySelector(
      '[class*="dsa_file_view_v2--slidingPaneContainer--"]',
    )
  ) {
    view = "Component List";
  }

  return { isDSA, isOrg, view };
}

// ──────────────────────────────────────────────
// Scrape: Component Detail view
// ──────────────────────────────────────────────

function scrapeComponentDetail(ctx) {
  const containerDiv =
    document.querySelector('div[data-testid="component-drilldown"]') ||
    document.querySelector('div[data-testid="style-drilldown"]');

  if (!containerDiv) return null;

  const rows = Array.from(
    containerDiv.querySelectorAll('div[class*="table--row--"]'),
  );

  // Header info
  const headerTitle = getHeaderTitle(ctx.isOrg);
  const componentTitle =
    document
      .querySelector('div[class*="asset_file_view_header--name--"]')
      ?.textContent.trim() || "Unknown";

  const descEl = document.querySelector(
    'div[class*="overview_stats_view--componentDescription--"]',
  );
  const description = descEl ? descEl.textContent.trim() : "";

  const statEls = document.querySelectorAll(
    'div[class*="overview_stats_view--stat--"]',
  );
  const totalInstances = statEls[0]?.textContent.trim() || "";
  const usedBy = statEls[1]?.textContent.trim() || "";
  const usedIn = statEls[2]?.textContent.trim() || "";

  // Extract variant rows
  const variants = rows.map((row) => {
    const avatarColumn = row.querySelector(
      'div[class*="library_item_view--oneComponentViewFileNameCol--"], div[class*="stats_table--fileNameColumn--"]',
    );
    const teamNameCol = row.querySelector(
      'div[class*="library_item_view--oneComponentViewTeamCol--"]',
    );
    const componentName = avatarColumn?.textContent.trim() || "";
    const teamName = teamNameCol?.textContent.trim() || "";
    const statsColumns = Array.from(
      row.querySelectorAll('div[class*="library_modal_stats--numCol"]'),
    ).map((col) => col.textContent.trim());

    return {
      name: componentName,
      team: teamName,
      totalInstances: statsColumns[0] || "0",
      inserts: statsColumns[1] || "0",
      detaches: statsColumns[2] || "0",
    };
  });

  return {
    library: headerTitle,
    componentName: componentTitle,
    description,
    totalInstances,
    usedBy,
    usedIn,
    viewType: "Component Detail",
    variants,
    propertyAnalysis: analyzePropertyUsage(variants),
    scrapedAt: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────
// Scrape: Component List view
// ──────────────────────────────────────────────

function scrapeComponentList(ctx) {
  if (
    document.querySelectorAll('div[class*="stats_table--row--"]').length === 0
  ) {
    return null;
  }

  const containerDiv = document.querySelector(
    'div[class*="library_item_stats_by_asset--"]',
  );
  if (!containerDiv) return null;

  const rows = Array.from(
    containerDiv.querySelectorAll('div[class*="stats_table--row--"]'),
  );

  const headerTitle = getHeaderTitle(ctx.isOrg);

  const analyticsTypeEl = document.querySelector(
    'button[class*="dsa_file_view_tabs--assetType--"]',
  );
  const analyticsType = analyticsTypeEl
    ? analyticsTypeEl.textContent.trim()
    : "Components";

  const dateRangeEl = document.querySelector(
    'span[class*="dsa_file_view_tabs--duration--"]',
  );
  const dateRange = dateRangeEl ? dateRangeEl.textContent.trim() : "";

  // Extract component rows
  const components = rows.map((row) => {
    const avatarColumn = row.querySelector(
      'div[class*="stats_table--avatarColumn--"]',
    );
    const componentName = avatarColumn?.textContent.trim() || "";
    const statsColumns = Array.from(
      row.querySelectorAll('div[class*="stats_table--statsColVal--"]'),
    ).map((col) => col.textContent.trim());

    return {
      name: componentName,
      totalInstances: statsColumns[0] || "0",
      inserts: statsColumns[1] || "0",
      detaches: statsColumns[2] || "0",
    };
  });

  return {
    library: headerTitle,
    analyticsType,
    dateRange,
    viewType: "Component List",
    components,
    scrapedAt: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────

function getHeaderTitle(isOrg) {
  if (isOrg) {
    const el = document.querySelector(
      'span[class*="end_truncated_text--truncatedText--"]',
    );
    if (el) {
      let text = el.textContent || "";
      text = text.replace(" • Default library for all files", "");
      return text.trim();
    }
    return "Undefined";
  }
  const el = document.querySelector('h2[class*="dialog-common__title__"]');
  return el ? el.textContent.trim() : "Undefined";
}

/**
 * Analyze property usage from variant data.
 * Ported from the Figma Library Analytics Exporter extension.
 */
function analyzePropertyUsage(variants) {
  const properties = {};
  let totalInstances = 0;

  for (const variant of variants) {
    const count = parseInt(
      (variant.totalInstances || "0").replace(/,/g, ""),
      10,
    );
    totalInstances += count;

    // Parse variant name: "default, default, purple, linkComponent=false, ..."
    const parts = (variant.name || "").split(",").map((p) => p.trim());
    let positionIndex = 0;
    const positionNames = ["state1", "state2", "color"];

    for (const part of parts) {
      if (part.includes("=")) {
        const [propName, propValue] = part.split("=").map((s) => s.trim());
        if (!properties[propName]) properties[propName] = {};
        properties[propName][propValue] =
          (properties[propName][propValue] || 0) + count;
      } else if (positionIndex < positionNames.length) {
        const propName = positionNames[positionIndex];
        const propValue = part.replace(/\s*\(default\)/g, "").trim();
        if (propValue) {
          if (!properties[propName]) properties[propName] = {};
          properties[propName][propValue] =
            (properties[propName][propValue] || 0) + count;
        }
        positionIndex++;
      }
    }
  }

  // Convert to sorted arrays with percentages
  const result = {};
  for (const [propName, values] of Object.entries(properties)) {
    result[propName] = Object.entries(values)
      .map(([value, count]) => ({
        value,
        count,
        percent:
          totalInstances > 0
            ? ((count / totalInstances) * 100).toFixed(1)
            : "0",
      }))
      .sort((a, b) => b.count - a.count);
  }

  return { properties: result, totalInstances };
}

// ──────────────────────────────────────────────
// Generate Markdown
// ──────────────────────────────────────────────

function generateMarkdown(data) {
  const title = data.componentName || data.library || "Analytics";
  let md = `# ${title} - Library Analytics\n\n`;
  md += `**Exported:** ${new Date(data.scrapedAt).toLocaleString()}\n`;
  md += `**View:** ${data.viewType || "Unknown"}\n`;
  if (data.library) md += `**Library:** ${data.library}\n`;
  md += `\n`;

  if (data.totalInstances || data.usedBy || data.usedIn) {
    md += `## Summary\n\n`;
    if (data.totalInstances)
      md += `- **Total instances:** ${data.totalInstances}\n`;
    if (data.usedBy) md += `- **Used by:** ${data.usedBy}\n`;
    if (data.usedIn) md += `- **Used in:** ${data.usedIn}\n`;
    if (data.description) md += `- **Description:** ${data.description}\n`;
    md += `\n`;
  }

  if (data.dateRange) {
    md += `**Date range:** ${data.dateRange}\n\n`;
  }

  // Property usage analysis (Component Detail only)
  if (data.propertyAnalysis && data.propertyAnalysis.properties) {
    const props = data.propertyAnalysis.properties;
    if (Object.keys(props).length > 0) {
      md += `## Property Usage\n\n`;
      md += `Total instances analyzed: **${data.propertyAnalysis.totalInstances.toLocaleString()}**\n\n`;

      for (const [propName, values] of Object.entries(props)) {
        md += `### ${propName}\n\n`;
        md += `| Value | Instances | % |\n`;
        md += `|-------|-----------|---|\n`;
        for (const v of values) {
          md += `| ${v.value} | ${v.count.toLocaleString()} | ${v.percent}% |\n`;
        }
        md += `\n`;
      }
    }
  }

  // Data table
  if (data.viewType === "Component List" && data.components) {
    md += `## Component Usage\n\n`;
    md += `| Component | Total Instances | Inserts (30d) | Detaches (30d) |\n`;
    md += `|-----------|-----------------|---------------|----------------|\n`;
    for (const c of data.components) {
      md += `| ${c.name} | ${c.totalInstances} | ${c.inserts || "-"} | ${c.detaches || "-"} |\n`;
    }
  } else if (data.variants) {
    md += `## Variant Usage\n\n`;
    md += `| Variant | Team | Total Instances | Inserts (30d) | Detaches (30d) |\n`;
    md += `|---------|------|-----------------|---------------|----------------|\n`;
    for (const v of data.variants) {
      md += `| ${v.name} | ${v.team || "-"} | ${v.totalInstances} | ${v.inserts || "-"} | ${v.detaches || "-"} |\n`;
    }
  }

  md += `\n---\n\n`;
  md += `*Exported from Figma UI Mod — Library Analytics*\n`;
  return md;
}

// ──────────────────────────────────────────────
// Download helper
// ──────────────────────────────────────────────

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────
// Main export function
// ──────────────────────────────────────────────

function exportAnalyticsAs(format) {
  const ctx = getModalContext();

  if (!ctx) {
    alert("Library Analytics modal is not visible.");
    return;
  }

  if (ctx.view === "Overview") {
    alert("ℹ️ Switch to the Analytics tab to export data.");
    return;
  }

  let data = null;

  if (ctx.view === "Component Detail") {
    data = scrapeComponentDetail(ctx);
  } else if (ctx.view === "Component List") {
    data = scrapeComponentList(ctx);
  }

  if (!data) {
    alert(
      "Could not scrape analytics data. Make sure you are on the correct view.",
    );
    return;
  }

  const currentDate = new Date().toISOString().split("T")[0];
  const safeName = (data.componentName || data.library || "analytics")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 40);

  if (format === "json") {
    const json = JSON.stringify(data, null, 2);
    const filename = `Figma-Analytics_-_${safeName}_-_${currentDate}.json`;
    downloadFile(json, filename, "application/json");
    console.log("📄 Exported JSON: " + filename);
  } else if (format === "md") {
    const md = generateMarkdown(data);
    const filename = `Figma-Analytics_-_${safeName}_-_${currentDate}.md`;
    downloadFile(md, filename, "text/markdown");
    console.log("📄 Exported Markdown: " + filename);
  }
}

// ──────────────────────────────────────────────
// UI: inject buttons into the analytics modal
// ──────────────────────────────────────────────

let exportModalInterval = null;

function injectExportButtons(modal) {
  if (exportModalInterval) return;

  console.log("🟢 [export-analytics] Modal opened, injecting export buttons");

  // Inject CSS for the export buttons (only once)
  if (!document.getElementById("exportAnalyticsStyles")) {
    const style = document.createElement("style");
    style.id = "exportAnalyticsStyles";
    style.textContent = `
    .extension-export-json,
    .extension-export-md {
      font-weight: 400;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      height: 24px;
      line-height: 32px;
      max-width: 200px;
      padding: 0 10px;
      background-color: transparent;
      border-radius: 6px;
      -moz-outline-radius: 6px;
      cursor: default;
      -webkit-user-select: none;
      user-select: none;
      color: var(--color-text);
      outline: 1px solid var(--color-text);
      outline-offset: -1px;
      background-clip: padding-box;
      box-sizing: border-box;
      margin-left: 8px;
      font-size: 11px;
    }
    .extension-export-json:active:not(:disabled),
    .extension-export-md:active:not(:disabled) {
      background-color: var(--color-bg-pressed);
    }
    .extension-export-json:focus:not(:disabled),
    .extension-export-md:focus:not(:disabled) {
      outline-width: 2px;
      outline-offset: -2px;
      background-color: var(--color-bg-pressed);
      outline-color: var(--color-bg-toolbar-selected);
    }
  `;
    document.head.appendChild(style);
  }

  exportModalInterval = setInterval(() => {
    let targetContainer = null;
    const isOrg = !!document.querySelector(
      '[class*="org_view_modal--container--"]',
    );

    if (
      document.querySelector('[class*="dsa_file_view_overview--fileViewDSA--"]')
    ) {
      // Overview — skip
    } else if (
      isOrg &&
      document.querySelector(
        '[class*="overview_stats_view--componentDescriptionAndImage--"]',
      )
    ) {
      targetContainer = Array.from(
        document.querySelectorAll(
          '[data-testid="component-drilldown"] [class*="asset_file_view_header--header--"]',
        ),
      ).find((el) => el.offsetParent !== null);
    } else if (
      document.querySelector('[class*="dsa_file_view_v2--slidingPaneLeft--"]')
    ) {
      targetContainer = modal.querySelector(
        '[class*="asset_file_view_header--header--"]',
      );
    } else if (
      isOrg &&
      document.querySelector(
        '[class*="dsa_library_view--slidingPaneContainer--"]',
      )
    ) {
      targetContainer = modal.querySelector(
        '[class*="dsa_file_view_tabs--dropdownContainer--"]',
      );
    } else if (
      document.querySelector(
        '[class*="dsa_file_view_v2--slidingPaneContainer--"]',
      )
    ) {
      targetContainer = modal.querySelector(
        '[class*="dsa_file_view_tabs--dropdownContainer--"]',
      );
    }

    if (targetContainer) {
      // JSON button
      if (!targetContainer.querySelector("#downloadJSON")) {
        const btnJson = document.createElement("button");
        btnJson.id = "downloadJSON";
        btnJson.innerText = "Download JSON";
        btnJson.className = "extension-export-json";
        btnJson.onclick = () => exportAnalyticsAs("json");
        targetContainer.appendChild(btnJson);
      }
      // Markdown button
      if (!targetContainer.querySelector("#downloadMarkdown")) {
        const btnMd = document.createElement("button");
        btnMd.id = "downloadMarkdown";
        btnMd.innerText = "Download Markdown";
        btnMd.className = "extension-export-md";
        btnMd.onclick = () => exportAnalyticsAs("md");
        targetContainer.appendChild(btnMd);
      }
    }
  }, 1000);
}

function stopExportModalInterval() {
  if (exportModalInterval) {
    clearInterval(exportModalInterval);
    exportModalInterval = null;
    console.log("🔴 [export-analytics] Modal closed, stopping interval");
  }
}

// Observer for modal open/close
const exportModalObserver = new MutationObserver(() => {
  const modal =
    document.querySelector('[class*="dsa_file_view_modal--container--"]') ||
    document.querySelector('[class*="org_view_modal--container--"]');

  if (modal) {
    injectExportButtons(modal);
  } else {
    stopExportModalInterval();
  }
});

exportModalObserver.observe(document.body, {
  childList: true,
  subtree: true,
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request === "exportJSON") {
    exportAnalyticsAs("json");
  } else if (request === "exportMarkdown") {
    exportAnalyticsAs("md");
  }
});
