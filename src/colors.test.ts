import { describe, expect, it } from 'vitest';
import { isHueDistinct, parseHue, pickColorForMunicipality } from './colors';
import type { AdjacencyMap, SavedState } from './types';

describe('colors', () => {
  it('parses hsl and hex hues', () => {
    expect(parseHue('hsl(120 68% 58%)')).toBe(120);
    expect(parseHue('#ff0000')).toBe(0);
  });

  it('rejects hues that are too close to adjacent colors', () => {
    expect(isHueDistinct(20, ['hsl(0 68% 58%)'])).toBe(false);
    expect(isHueDistinct(90, ['hsl(0 68% 58%)'])).toBe(true);
  });

  it('picks a color distinct from adjacent visited municipalities', () => {
    const adjacency: AdjacencyMap = {
      target: ['left'],
      left: ['target'],
    };
    const state: SavedState = {
      version: 1,
      updatedAt: '2026-06-18T00:00:00.000Z',
      backgroundColor: '#eef2f3',
      municipalities: {
        left: {
          visited: true,
          color: 'hsl(0 68% 58%)',
        },
      },
    };

    const color = pickColorForMunicipality('target', state, adjacency);
    const hue = parseHue(color);

    expect(hue).not.toBeNull();
    expect(isHueDistinct(hue!, ['hsl(0 68% 58%)'])).toBe(true);
  });
});
