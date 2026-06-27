import { describe, expect, it } from 'vitest';
import {
  loadSavedState,
  parseSavedState,
  pruneStateToKnownMunicipalities,
  saveState,
  serializeSavedState,
  STORAGE_KEY,
} from './storage';

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
        backgroundColor: '#ddeeff',
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
    expect(loadSavedState(storage).backgroundColor).toBe('#ddeeff');
  });

  it('prunes unknown municipality codes', () => {
    const pruned = pruneStateToKnownMunicipalities(
      {
        version: 1,
        updatedAt: '2026-06-18T00:00:00.000Z',
        backgroundColor: '#eef2f3',
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

  it('serializes and parses exported state', () => {
    const state = {
      version: 1,
      updatedAt: '2026-06-18T00:00:00.000Z',
      backgroundColor: '#ddeeff',
      municipalities: {
        keep: {
          visited: true,
          color: '#123456',
        },
      },
    } as const;

    expect(parseSavedState(serializeSavedState(state)).municipalities.keep.color).toBe('#123456');
    expect(parseSavedState(serializeSavedState(state)).backgroundColor).toBe('#ddeeff');
  });

  it('uses the default background color for older states', () => {
    expect(parseSavedState(JSON.stringify({ version: 1, municipalities: {} })).backgroundColor).toBe('#eef2f3');
  });

  it('rejects unsupported export versions', () => {
    expect(() => parseSavedState(JSON.stringify({ version: 2, municipalities: {} }))).toThrow();
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
