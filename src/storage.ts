import type { SavedState } from './types';

export const STORAGE_KEY = 'visitedMunicipalityMap:v1';
export const DEFAULT_BACKGROUND_COLOR = '#eef2f3';

export function createEmptyState(): SavedState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    municipalities: {},
  };
}

export function loadSavedState(storage: Storage = window.localStorage): SavedState {
  const raw = storage.getItem(STORAGE_KEY);

  if (!raw) {
    return createEmptyState();
  }

  try {
    return parseSavedState(raw);
  } catch {
    return createEmptyState();
  }
}

export function saveState(state: SavedState, storage: Storage = window.localStorage): void {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function pruneStateToKnownMunicipalities(state: SavedState, knownCodes: Set<string>): SavedState {
  return {
    ...state,
    municipalities: Object.fromEntries(
      Object.entries(state.municipalities).filter(([municipalityCode]) => knownCodes.has(municipalityCode)),
    ),
  };
}

export function parseSavedState(raw: string): SavedState {
  const parsed = JSON.parse(raw) as Partial<SavedState>;

  if (parsed.version !== 1 || typeof parsed.municipalities !== 'object' || parsed.municipalities === null) {
    throw new Error('Unsupported export format.');
  }

  return {
    version: 1,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    backgroundColor:
      typeof parsed.backgroundColor === 'string' && isHexColor(parsed.backgroundColor)
        ? parsed.backgroundColor
        : DEFAULT_BACKGROUND_COLOR,
    municipalities: Object.fromEntries(
      Object.entries(parsed.municipalities).filter(
        ([, value]) =>
          value &&
          typeof value === 'object' &&
          'visited' in value &&
          value.visited === true &&
          'color' in value &&
          typeof value.color === 'string',
      ),
    ),
  };
}

export function serializeSavedState(state: SavedState): string {
  return `${JSON.stringify(
    {
      ...state,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`;
}

export function isHexColor(color: string): boolean {
  return /^#[\da-f]{6}$/i.test(color);
}
