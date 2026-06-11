/**
 * DOM probe for chrome-devtools MCP evaluate_script or DevTools console.
 * Paste the function body into evaluate_script, or run in console on a Figma tab.
 */
function figmaAnalyticsDomProbe() {
  const PREFIXES = {
    modalShell: 'header_modal--modal--',
    orgView: 'org_view_modal--container--',
    analytics: 'dsa_file_view_analytics--',
    libraryItem: 'library_item_view--',
    styles: 'file_view_styles--',
    fileViewModal: 'dsa_file_view_modal--',
    listView: 'dsa_list_view--',
    itemName: 'asset_file_view_header--name--',
  };

  const q = (prefix) => [...document.querySelectorAll(`[class*="${prefix}"]`)];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const tabLabel = (tab) => {
    const raw = (tab.innerText || tab.textContent || '').trim();
    return (raw.split('\n').map((l) => l.trim()).filter(Boolean)[0] || raw).trim();
  };

  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const analyticsDialog = dialogs.find((d) => {
    const t = d.innerText || d.textContent || '';
    const analyticsTab = [...d.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.getAttribute('aria-selected') === 'true' && /^analytics$/i.test(tabLabel(tab))
    );
    return (
      analyticsTab ||
      /Component statistics|Style statistics|Usage statistics|library (components|styles|variables) shown|Showing\s+\d+\s+variants/i.test(
        t
      )
    );
  });

  const launchContext = analyticsDialog
    ? (() => {
        const labels = [...analyticsDialog.querySelectorAll('[role="tab"]')].map((t) =>
          tabLabel(t).toLowerCase()
        );
        const inDesignFile = /^\/(design|file)\//.test(location.pathname);
        if (labels.includes('libraries') && labels.includes('overview') && labels.includes('analytics')) {
          return 'libraries';
        }
        if (analyticsDialog.querySelector('[class*="library_item_view--"]')) return 'libraries';
        if (labels.includes('overview') && labels.includes('analytics') && !labels.includes('libraries')) {
          return inDesignFile ? 'inFile' : 'workspace';
        }
        if (/(?:Library|File)\s+analytics/i.test(analyticsDialog.innerText || '') && inDesignFile) {
          return 'inFile';
        }
        return 'unknown';
      })()
    : null;

  const shells = q(PREFIXES.modalShell).filter(visible);
  const typeCombo = analyticsDialog
    ? [...analyticsDialog.querySelectorAll('[role="combobox"]')].find((c) =>
        /^type$/i.test(c.getAttribute('aria-label') || '')
      )
    : null;

  const nameEl = analyticsDialog?.querySelector(`[class*="${PREFIXES.itemName}"]`);

  const textOf = (el) => {
    const raw = (el?.innerText ?? el?.textContent ?? '').trim();
    return (raw.split('\n').map((l) => l.trim()).filter(Boolean)[0] || raw).trim();
  };

  const combos = [...document.querySelectorAll('[role="combobox"]')].map((el) => ({
    ariaLabel: el.getAttribute('aria-label'),
    ariaExpanded: el.getAttribute('aria-expanded'),
    ariaControls: el.getAttribute('aria-controls'),
    ariaOwns: el.getAttribute('aria-owns'),
    text: textOf(el),
    visible: visible(el),
    rect: (() => {
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    })(),
  }));

  const listboxes = [...document.querySelectorAll('[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]')].map(
    (el) => ({
      role: el.getAttribute('role'),
      id: el.id,
      ariaLabel: el.getAttribute('aria-label'),
      visible: visible(el),
      className: (el.className || '').slice(0, 120),
      text: (el.innerText || '').slice(0, 200),
      options: [...el.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')].map(
        (opt) => ({
          role: opt.getAttribute('role'),
          text: textOf(opt),
          innerText: (opt.innerText || '').slice(0, 120),
          ariaLabel: opt.getAttribute('aria-label'),
          ariaSelected: opt.getAttribute('aria-selected'),
          visible: visible(opt),
          tag: opt.tagName,
          className: (opt.className || '').slice(0, 100),
        })
      ),
      directChildren: [...el.children].slice(0, 8).map((child) => ({
        tag: child.tagName,
        role: child.getAttribute('role'),
        text: textOf(child),
        className: (child.className || '').slice(0, 100),
      })),
    })
  );

  return {
    url: location.href,
    ariaModals: dialogs.map((el) => ({
      label: el.getAttribute('aria-label'),
      textHead: (el.innerText || '').slice(0, 200),
    })),
    counts: Object.fromEntries(Object.entries(PREFIXES).map(([k, v]) => [k, q(v).length])),
    launchContext,
    analyticsDialog: analyticsDialog
      ? {
          title: analyticsDialog.getAttribute('aria-label'),
          heading: analyticsDialog.querySelector('h1,h2')?.innerText?.trim(),
          typeValue: typeCombo?.innerText?.trim(),
          tabLabels: [...analyticsDialog.querySelectorAll('[role="tab"]')].map((t) => ({
            label: tabLabel(t),
            selected: t.getAttribute('aria-selected'),
          })),
          itemName: nameEl?.innerText?.trim() || null,
          variantsLine: (analyticsDialog.innerText || '').match(/Showing\s+\d+\s+variants/i)?.[0] || null,
          listFooter:
            (analyticsDialog.innerText || '').match(/\d+\s+library (components|styles|variables) shown/i)?.[0] ||
            null,
          breadcrumb:
            (analyticsDialog.innerText || '').match(/(?:Library|File)\s+analytics\s*[/\\]\s*[^\n]+/i)?.[0] ||
            null,
          innerPrefixes: Object.fromEntries(
            Object.entries(PREFIXES)
              .filter(([k]) => k !== 'modalShell')
              .map(([k, v]) => [k, !!analyticsDialog.querySelector(`[class*="${v}"]`)])
          ),
        }
      : null,
    comboMenus: {
      combos,
      expandedCombos: combos.filter((c) => c.ariaExpanded === 'true'),
      listboxes,
      visibleListboxes: listboxes.filter((l) => l.visible),
    },
    breadcrumb:
      (document.body.innerText || '').match(/(?:Library|File)\s+analytics\s*[/\\]\s*[^\n]+/i)?.[0] || null,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { figmaAnalyticsDomProbe };
}
