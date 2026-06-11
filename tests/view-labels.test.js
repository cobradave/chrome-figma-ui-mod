import { describe, it, expect } from 'vitest';
import { loadSharedModule } from './helpers/loadShared.js';
import {
  LIBRARY_NAME,
  COMPONENT_SET,
  SINGLE_COMPONENT,
  VARIANT_SELECTED,
  STYLE_DETAIL,
  VARIABLE_DETAIL,
} from './fixtures/names.js';

const ViewLabels = loadSharedModule('shared/view-labels.js', 'ViewLabels');

describe('getViewContext', () => {
  const cases = [
    {
      name: 'overview tab',
      state: { modalOpen: true, analyticsTabSelected: false, libraryName: LIBRARY_NAME },
      expected: {
        breadcrumb: LIBRARY_NAME,
        title: 'Overview tab',
        subtitleLine: null,
        entityKind: null,
        variantOfName: null,
      },
    },
    {
      name: 'components list',
      state: {
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'components',
        depth: 'list',
        libraryName: LIBRARY_NAME,
        itemCount: 603,
      },
      expected: {
        breadcrumb: LIBRARY_NAME,
        title: 'Component list',
        subtitleLine: null,
        entityKind: null,
        variantOfName: null,
      },
    },
    {
      name: 'component set detail',
      state: {
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'components',
        depth: 'detail',
        libraryName: LIBRARY_NAME,
        itemName: COMPONENT_SET,
        variantCount: 24,
      },
      expected: {
        breadcrumb: LIBRARY_NAME,
        title: COMPONENT_SET,
        subtitleLine: 'tag',
        entityKind: 'componentSet',
        variantOfName: null,
      },
    },
    {
      name: 'variant file usage',
      state: {
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'components',
        depth: 'variant',
        libraryName: LIBRARY_NAME,
        itemName: VARIANT_SELECTED,
        componentSetName: COMPONENT_SET,
      },
      expected: {
        breadcrumb: LIBRARY_NAME,
        title: VARIANT_SELECTED,
        subtitleLine: 'variantOf',
        entityKind: null,
        variantOfName: COMPONENT_SET,
      },
    },
    {
      name: 'single component file usage',
      state: {
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'components',
        depth: 'component',
        libraryName: LIBRARY_NAME,
        itemName: SINGLE_COMPONENT,
      },
      expected: {
        breadcrumb: LIBRARY_NAME,
        title: SINGLE_COMPONENT,
        subtitleLine: 'tag',
        entityKind: 'component',
        variantOfName: null,
      },
    },
    {
      name: 'styles list',
      state: {
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'styles',
        depth: 'list',
        libraryName: LIBRARY_NAME,
        itemCount: 67,
      },
      expected: {
        breadcrumb: LIBRARY_NAME,
        title: 'Styles list',
        subtitleLine: null,
        entityKind: null,
        variantOfName: null,
      },
    },
    {
      name: 'style detail',
      state: {
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'styles',
        depth: 'detail',
        libraryName: LIBRARY_NAME,
        itemName: STYLE_DETAIL,
      },
      expected: {
        breadcrumb: LIBRARY_NAME,
        title: STYLE_DETAIL,
        subtitleLine: 'tag',
        entityKind: 'style',
        variantOfName: null,
      },
    },
    {
      name: 'variables list',
      state: {
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'variables',
        depth: 'list',
        libraryName: LIBRARY_NAME,
        itemCount: 338,
      },
      expected: {
        breadcrumb: LIBRARY_NAME,
        title: 'Usage statistics',
        subtitleLine: null,
        entityKind: null,
        variantOfName: null,
      },
    },
    {
      name: 'variable detail',
      state: {
        modalOpen: true,
        analyticsTabSelected: true,
        kind: 'variables',
        depth: 'detail',
        libraryName: LIBRARY_NAME,
        itemName: VARIABLE_DETAIL,
      },
      expected: {
        breadcrumb: LIBRARY_NAME,
        title: VARIABLE_DETAIL,
        subtitleLine: 'tag',
        entityKind: 'variable',
        variantOfName: null,
      },
    },
  ];

  it.each(cases)('$name', ({ state, expected }) => {
    expect(ViewLabels.getViewContext(state)).toMatchObject(expected);
  });

  it('returns null when modal is closed', () => {
    expect(ViewLabels.getViewContext({ modalOpen: false })).toBeNull();
  });
});
