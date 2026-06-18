import { describe, expect, it } from 'vitest';
import { createShareUrl, decodeSharedState, encodeSharedState, isShareUrl, readSharedStateFromUrl } from './share';
import type { SavedState } from './types';

describe('share', () => {
  it('round-trips shared state', () => {
    const decoded = decodeSharedState(encodeSharedState(exampleState()));

    expect(decoded.municipalities['13101']?.color).toBe('#123456');
    expect(decoded.municipalities['designated-city:神奈川県:横浜市']?.visited).toBe(true);
  });

  it('creates a URL with only the share parameter', () => {
    const url = createShareUrl(exampleState(), 'https://example.com/map?old=1#section');

    expect(isShareUrl(url)).toBe(true);
    expect(new URL(url).searchParams.has('old')).toBe(false);
    expect(new URL(url).hash).toBe('');
    expect(readSharedStateFromUrl(url)?.municipalities['13101']?.color).toBe('#123456');
  });

  it('rejects invalid share payloads', () => {
    expect(() => decodeSharedState('invalid')).toThrow();
  });
});

function exampleState(): SavedState {
  return {
    version: 1,
    updatedAt: '2026-06-19T00:00:00.000Z',
    municipalities: {
      '13101': {
        visited: true,
        color: '#123456',
      },
      'designated-city:神奈川県:横浜市': {
        visited: true,
        color: '#abcdef',
      },
    },
  };
}
