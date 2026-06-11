(function () {
  'use strict';

  const DEFAULT_MIN_OVERFLOW_PX = 120;

  /**
   * Collapse long insight panels and add a Show more / Show less toggle.
   * @param {HTMLElement} container — element wrapping `.preview` (e.g. `#panelInsights`)
   * @param {{ onLayoutChange?: () => void, minOverflowPx?: number }} [options]
   */
  function setupPanelInsightsExpand(container, options = {}) {
    const minOverflowPx = options.minOverflowPx ?? DEFAULT_MIN_OVERFLOW_PX;
    const preview = container.querySelector('.preview');
    if (!preview) return;

    container.querySelector('.preview-toggle')?.remove();
    preview.querySelector('.preview__footer')?.remove();

    let body = preview.querySelector('.preview__body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'preview__body';
      while (preview.firstChild) {
        body.appendChild(preview.firstChild);
      }
      preview.appendChild(body);
    }

    body.classList.remove('is-expanded', 'is-collapsed');

    const footer = document.createElement('div');
    footer.className = 'preview__footer';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'preview-toggle';
    toggle.textContent = 'Show more';
    toggle.hidden = true;
    footer.appendChild(toggle);
    preview.appendChild(footer);

    const notifyLayoutChange = () => {
      options.onLayoutChange?.();
    };

    const syncToggle = ({ revealChrome = true } = {}) => {
      if (body.classList.contains('is-expanded')) {
        toggle.hidden = !revealChrome;
        footer.hidden = !revealChrome;
        return;
      }
      body.classList.add('is-collapsed');
      const hiddenPx = body.scrollHeight - body.clientHeight;
      const hasMeaningfulOverflow = hiddenPx > minOverflowPx;
      body.classList.toggle('is-collapsed', hasMeaningfulOverflow);
      toggle.hidden = !revealChrome || !hasMeaningfulOverflow;
      footer.hidden = !revealChrome || !hasMeaningfulOverflow;
    };

    toggle.addEventListener('click', () => {
      const expanded = !body.classList.contains('is-expanded');
      body.classList.toggle('is-expanded', expanded);
      body.classList.toggle('is-collapsed', !expanded);
      toggle.textContent = expanded ? 'Show less' : 'Show more';
      syncToggle();
      notifyLayoutChange();
    });

    syncToggle({ revealChrome: !options.deferLayoutSync });
    if (options.syncImmediately) {
      void container.offsetHeight;
    }
    if (!options.deferLayoutSync) {
      requestAnimationFrame(() => {
        syncToggle();
        notifyLayoutChange();
      });
    }

    container._panelInsightsExpandSync = syncToggle;
  }

  function resyncPanelInsightsExpand(container) {
    container._panelInsightsExpandSync?.({ revealChrome: true });
  }

  const api = { setup: setupPanelInsightsExpand, resync: resyncPanelInsightsExpand };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.PanelInsightsExpand = api;
  }
})();
