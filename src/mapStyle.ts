import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type { SavedState } from './types';

export const MUNICIPALITY_SOURCE_ID = 'municipalities';
export const MUNICIPALITY_FILL_LAYER_ID = 'municipality-fill';
export const MUNICIPALITY_BORDER_LAYER_ID = 'municipality-border';
export const MUNICIPALITY_SELECTED_BORDER_LAYER_ID = 'municipality-selected-border';

export function createBlankMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#eef2f3',
        },
      },
    ],
  };
}

export function createFillLayer(state: SavedState): FillLayerSpecification {
  return {
    id: MUNICIPALITY_FILL_LAYER_ID,
    type: 'fill',
    source: MUNICIPALITY_SOURCE_ID,
    paint: {
      'fill-color': buildFillColorExpression(state),
      'fill-opacity': 1,
    },
  };
}

export function createBorderLayer(): LineLayerSpecification {
  return {
    id: MUNICIPALITY_BORDER_LAYER_ID,
    type: 'line',
    source: MUNICIPALITY_SOURCE_ID,
    paint: {
      'line-color': '#7d8a92',
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1, 11, 1.8],
      'line-opacity': 0.7,
    },
  };
}

export function createSelectedBorderLayer(selectedCode: string | null): LineLayerSpecification {
  return {
    id: MUNICIPALITY_SELECTED_BORDER_LAYER_ID,
    type: 'line',
    source: MUNICIPALITY_SOURCE_ID,
    filter: selectedCode ? ['==', ['get', 'municipalityCode'], selectedCode] : ['==', ['get', 'municipalityCode'], ''],
    paint: {
      'line-color': '#111827',
      'line-width': 3,
      'line-opacity': 0.95,
    },
  };
}

export function buildFillColorExpression(state: SavedState): DataDrivenPropertyValueSpecification<string> {
  if (Object.keys(state.municipalities).length === 0) {
    return '#ffffff';
  }

  const expression: unknown[] = ['match', ['get', 'municipalityCode']];

  for (const [municipalityCode, municipality] of Object.entries(state.municipalities)) {
    expression.push(municipalityCode, municipality.color);
  }

  expression.push('#ffffff');
  return expression as ExpressionSpecification;
}
