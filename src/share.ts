import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { DEFAULT_BACKGROUND_COLOR, isHexColor } from './storage';
import type { SavedState } from './types';

const SHARE_PARAM = 'share';

type CompactSharedState = {
  v: 1;
  b?: string;
  m: Array<[string, string]>;
};

export function createShareUrl(state: SavedState, baseUrl: string = window.location.href): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set(SHARE_PARAM, encodeSharedState(state));
  return url.toString();
}

export function readSharedStateFromUrl(url: string = window.location.href): SavedState | null {
  const payload = new URL(url).searchParams.get(SHARE_PARAM);
  return payload ? decodeSharedState(payload) : null;
}

export function isShareUrl(url: string = window.location.href): boolean {
  return new URL(url).searchParams.has(SHARE_PARAM);
}

export function encodeSharedState(state: SavedState): string {
  const compact: CompactSharedState = {
    v: 1,
    b: state.backgroundColor,
    m: Object.entries(state.municipalities).map(([municipalityCode, municipality]) => [
      municipalityCode,
      municipality.color,
    ]),
  };

  return compressToEncodedURIComponent(JSON.stringify(compact));
}

export function decodeSharedState(payload: string): SavedState {
  const raw = decompressFromEncodedURIComponent(payload);

  if (!raw) {
    throw new Error('Invalid share payload.');
  }

  const parsed = JSON.parse(raw) as Partial<CompactSharedState>;

  if (parsed.v !== 1 || !Array.isArray(parsed.m)) {
    throw new Error('Unsupported share payload.');
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    backgroundColor: typeof parsed.b === 'string' && isHexColor(parsed.b) ? parsed.b : DEFAULT_BACKGROUND_COLOR,
    municipalities: Object.fromEntries(
      parsed.m.filter(isCompactMunicipalityEntry).map(([municipalityCode, color]) => [
        municipalityCode,
        {
          visited: true,
          color,
        },
      ]),
    ),
  };
}

function isCompactMunicipalityEntry(value: unknown): value is [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
}
