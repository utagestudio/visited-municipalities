import { describe, expect, it } from 'vitest';
import { loadSavedState, pruneStateToKnownMunicipalities, saveState, STORAGE_KEY } from './storage';

describe('storage', () => {
  it('returns an empty state for malformed json', () => {
    const storage = new MapStorage();
    storage.setItem(STORAGE_KEY, '{broken');

    expect(loadSavedState(storage).municipalities).toEqual({});
  });

  it('saves and loads valid state', () => {
    const storage = new MapStorage();

    saveState(
      {
        version: 1,
        updatedAt: '2026-06-18T00:00:00.000Z',
        municipalities: {
          'sample:tokyo:chiyoda': {
            visited: true,
            color: '#cc3344',
          },
        },
      },
      storage,
    );

    expect(loadSavedState(storage).municipalities['sample:tokyo:chiyoda']?.color).toBe('#cc3344');
  });

  it('prunes unknown municipality codes', () => {
    const pruned = pruneStateToKnownMunicipalities(
      {
        version: 1,
        updatedAt: '2026-06-18T00:00:00.000Z',
        municipalities: {
          keep: {
            visited: true,
            color: '#000000',
          },
          drop: {
            visited: true,
            color: '#ffffff',
          },
        },
      },
      new Set(['keep']),
    );

    expect(Object.keys(pruned.municipalities)).toEqual(['keep']);
  });
});

class MapStorage implements Storage {
  private items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}
