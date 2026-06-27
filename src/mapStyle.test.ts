import { describe, expect, it } from 'vitest';
import { buildFillColorExpression, createBlankMapStyle } from './mapStyle';
import type { SavedState } from './types';

describe('mapStyle', () => {
  it('uses a constant white fill when no municipalities are visited', () => {
    expect(buildFillColorExpression(emptyState())).toBe('#ffffff');
  });

  it('uses the configured background color', () => {
    const backgroundLayer = createBlankMapStyle('#ddeeff').layers[0] as { paint: { 'background-color': string } };

    expect(backgroundLayer.paint['background-color']).toBe('#ddeeff');
  });

  it('uses a match expression when municipalities are visited', () => {
    const expression = buildFillColorExpression({
      ...emptyState(),
      municipalities: {
        'sample:tokyo:chiyoda': {
          visited: true,
          color: '#cc3344',
        },
      },
    });

    expect(expression).toEqual(['match', ['get', 'municipalityCode'], 'sample:tokyo:chiyoda', '#cc3344', '#ffffff']);
  });
});

function emptyState(): SavedState {
  return {
    version: 1,
    updatedAt: '2026-06-18T00:00:00.000Z',
    backgroundColor: '#eef2f3',
    municipalities: {},
  };
}
