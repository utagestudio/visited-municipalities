import type { AdjacencyMap, SavedState } from './types';

const BASE_SATURATION = 68;
const BASE_LIGHTNESS = 58;
const MIN_HUE_DISTANCE = 45;
const HUE_STEP = 37;

export function pickColorForMunicipality(
  municipalityCode: string,
  state: SavedState,
  adjacency: AdjacencyMap,
): string {
  const adjacentColors = (adjacency[municipalityCode] ?? [])
    .map((code) => state.municipalities[code]?.color)
    .filter((color): color is string => Boolean(color));

  for (let index = 0; index < 18; index += 1) {
    const hue = normalizeHue(index * HUE_STEP + Object.keys(state.municipalities).length * 19);
    if (isHueDistinct(hue, adjacentColors)) {
      return hslToHex(hue, BASE_SATURATION, BASE_LIGHTNESS);
    }
  }

  const fallbackHue = normalizeHue(Object.keys(state.municipalities).length * HUE_STEP);
  const fallbackLightness = adjacentColors.length % 2 === 0 ? 48 : 66;
  return hslToHex(fallbackHue, BASE_SATURATION, fallbackLightness);
}

export function isHueDistinct(candidateHue: number, colors: string[]): boolean {
  return colors.every((color) => {
    const hue = parseHue(color);
    return hue === null || hueDistance(candidateHue, hue) >= MIN_HUE_DISTANCE;
  });
}

export function parseHue(color: string): number | null {
  const hslMatch = color.match(/hsl\(\s*(\d+(?:\.\d+)?)\s+[\d.]+%\s+[\d.]+%\s*\)/i);
  if (hslMatch) {
    return normalizeHue(Number(hslMatch[1]));
  }

  const hexMatch = color.match(/^#([\da-f]{6})$/i);
  if (!hexMatch) {
    return null;
  }

  const red = Number.parseInt(hexMatch[1].slice(0, 2), 16) / 255;
  const green = Number.parseInt(hexMatch[1].slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hexMatch[1].slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  if (delta === 0) {
    return null;
  }

  if (max === red) {
    return normalizeHue(60 * (((green - blue) / delta) % 6));
  }

  if (max === green) {
    return normalizeHue(60 * ((blue - red) / delta + 2));
  }

  return normalizeHue(60 * ((red - green) / delta + 4));
}

function hueDistance(left: number, right: number): number {
  const diff = Math.abs(normalizeHue(left) - normalizeHue(right));
  return Math.min(diff, 360 - diff);
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const sat = saturation / 100;
  const light = lightness / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = light - chroma / 2;
  const [red, green, blue] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}
