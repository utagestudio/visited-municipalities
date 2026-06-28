import { type CSSProperties, useEffect, useRef } from 'react';
import bbox from '@turf/bbox';
import maplibregl, { GeoJSONSource, Map } from 'maplibre-gl';
import type { MunicipalityCollection, MunicipalityStatsMap } from './types';
import type { SavedState } from './types';
import {
  createBlankMapStyle,
  createBorderLayer,
  createFillLayer,
  createSelectedBorderLayer,
  MUNICIPALITY_FILL_LAYER_ID,
  MUNICIPALITY_SELECTED_BORDER_LAYER_ID,
  MUNICIPALITY_SOURCE_ID,
} from './mapStyle';

const LONG_PRESS_DELAY_MS = 650;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

type MunicipalityMapProps = {
  municipalities: MunicipalityCollection;
  stats: MunicipalityStatsMap;
  state: SavedState;
  selectedCode: string | null;
  focusCode: string | null;
  onSelect: (municipalityCode: string) => void;
  onUnvisit: (municipalityCode: string) => void;
  readOnly: boolean;
};

export function MunicipalityMap({
  municipalities,
  stats,
  state,
  selectedCode,
  focusCode,
  onSelect,
  onUnvisit,
  readOnly,
}: MunicipalityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const onUnvisitRef = useRef(onUnvisit);
  const readOnlyRef = useRef(readOnly);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number; municipalityCode: string } | null>(null);
  const ignoreNextClickRef = useRef(false);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onUnvisitRef.current = onUnvisit;
  }, [onUnvisit]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createBlankMapStyle(),
      center: [138.3, 37.8],
      zoom: 4.2,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      canvasContextAttributes: {
        alpha: true,
      },
    });

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.addSource(MUNICIPALITY_SOURCE_ID, {
        type: 'geojson',
        data: municipalities,
        promoteId: 'municipalityCode',
        tolerance: 0,
        buffer: 256,
      });
      map.addLayer(createFillLayer(state));
      map.addLayer(createBorderLayer());
      map.addLayer(createSelectedBorderLayer(selectedCode));
      fitToCollection(map, municipalities);
    });

    const hideHoverTooltip = () => {
      hoverPopupRef.current?.remove();
    };

    const clearLongPress = () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      longPressStartRef.current = null;
    };

    map.on('click', (event) => {
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
        return;
      }

      if (!map.getLayer(MUNICIPALITY_FILL_LAYER_ID)) {
        return;
      }

      const feature = getMunicipalityFeatureAtPoint(map, event.point);
      const municipalityCode = feature?.properties?.municipalityCode;
      if (typeof municipalityCode === 'string') {
        onSelectRef.current(municipalityCode);
      }
    });

    map.on('contextmenu', (event) => {
      event.preventDefault();

      if (!map.getLayer(MUNICIPALITY_FILL_LAYER_ID)) {
        return;
      }

      const feature = getMunicipalityFeatureAtPoint(map, event.point);
      const municipalityCode = feature?.properties?.municipalityCode;
      if (typeof municipalityCode === 'string' && !readOnlyRef.current) {
        onUnvisitRef.current(municipalityCode);
      }
    });

    map.on('touchstart', (event) => {
      clearLongPress();

      if (readOnlyRef.current || event.points.length !== 1 || !map.getLayer(MUNICIPALITY_FILL_LAYER_ID)) {
        return;
      }

      const feature = getMunicipalityFeatureAtPoint(map, event.point);
      const municipalityCode = feature?.properties?.municipalityCode;
      if (typeof municipalityCode !== 'string') {
        return;
      }

      longPressStartRef.current = {
        x: event.point.x,
        y: event.point.y,
        municipalityCode,
      };

      longPressTimerRef.current = window.setTimeout(() => {
        const longPressStart = longPressStartRef.current;
        if (!longPressStart || readOnlyRef.current) {
          return;
        }

        ignoreNextClickRef.current = true;
        event.originalEvent.preventDefault();
        onUnvisitRef.current(longPressStart.municipalityCode);
        clearLongPress();
      }, LONG_PRESS_DELAY_MS);
    });

    map.on('touchmove', (event) => {
      const longPressStart = longPressStartRef.current;
      if (!longPressStart || event.points.length !== 1) {
        clearLongPress();
        return;
      }

      const distance = Math.hypot(event.point.x - longPressStart.x, event.point.y - longPressStart.y);
      if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) {
        clearLongPress();
      }
    });

    map.on('touchend', clearLongPress);
    map.on('touchcancel', clearLongPress);

    map.on('mousemove', (event) => {
      if (!map.getLayer(MUNICIPALITY_FILL_LAYER_ID)) {
        hideHoverTooltip();
        return;
      }

      const feature = getMunicipalityFeatureAtPoint(map, event.point);
      const displayName = feature?.properties?.displayName;
      const municipalityCode = feature?.properties?.municipalityCode;
      map.getCanvas().style.cursor = typeof displayName === 'string' ? 'pointer' : '';

      if (typeof displayName !== 'string' || typeof municipalityCode !== 'string') {
        hideHoverTooltip();
        return;
      }

      const popup =
        hoverPopupRef.current ??
        new maplibregl.Popup({
          className: 'municipalityTooltip',
          closeButton: false,
          closeOnClick: false,
          offset: 12,
        });

      hoverPopupRef.current = popup
        .setLngLat(event.lngLat)
        .setDOMContent(createTooltipContent(displayName, stats[municipalityCode]))
        .addTo(map);
    });
    map.getCanvas().addEventListener('mouseleave', hideHoverTooltip);

    mapRef.current = map;

    return () => {
      clearLongPress();
      map.getCanvas().removeEventListener('mouseleave', hideHoverTooltip);
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getLayer(MUNICIPALITY_FILL_LAYER_ID)) {
      return;
    }

    map.setPaintProperty(MUNICIPALITY_FILL_LAYER_ID, 'fill-color', createFillLayer(state).paint?.['fill-color']);
  }, [state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getLayer(MUNICIPALITY_SELECTED_BORDER_LAYER_ID)) {
      return;
    }

    map.setFilter(
      MUNICIPALITY_SELECTED_BORDER_LAYER_ID,
      selectedCode ? ['==', ['get', 'municipalityCode'], selectedCode] : ['==', ['get', 'municipalityCode'], ''],
    );
  }, [selectedCode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      return;
    }

    const source = map.getSource(MUNICIPALITY_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(municipalities);
  }, [municipalities]);

  useEffect(() => {
    const map = mapRef.current;
    if (!focusCode) {
      return;
    }

    const feature = municipalities.features.find((item) => item.properties.municipalityCode === focusCode);
    if (!feature) {
      return;
    }

    fitToCollection(map, {
      type: 'FeatureCollection',
      features: [feature],
    });
  }, [focusCode, municipalities]);

  return (
    <div
      className="map"
      ref={containerRef}
      style={{ '--map-background-color': state.backgroundColor } as CSSProperties}
      aria-label="市区町村マップ"
    />
  );
}

function createTooltipContent(displayName: string, stats: MunicipalityStatsMap[string] | undefined): HTMLElement {
  const root = document.createElement('div');
  root.className = 'municipalityTooltipContent';

  const title = document.createElement('strong');
  title.textContent = displayName;
  root.append(title);

  const population = document.createElement('span');
  population.textContent = `人口: ${formatPopulation(stats?.population, stats?.populationAsOf)}`;
  root.append(population);

  const area = document.createElement('span');
  area.textContent = `面積: ${formatArea(stats?.areaKm2, stats?.areaAsOf)}`;
  root.append(area);

  return root;
}

function formatPopulation(population: number | undefined, asOf: string | undefined): string {
  if (typeof population !== 'number') {
    return 'データなし';
  }

  return withAsOf(`${population.toLocaleString('ja-JP')}人`, asOf);
}

function formatArea(areaKm2: number | undefined, asOf: string | undefined): string {
  if (typeof areaKm2 !== 'number') {
    return 'データなし';
  }

  return withAsOf(`${areaKm2.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}km²`, asOf);
}

function withAsOf(value: string, asOf: string | undefined): string {
  return asOf ? `${value}（${asOf}）` : value;
}

function getMunicipalityFeatureAtPoint(map: Map, point: maplibregl.PointLike) {
  return map.queryRenderedFeatures(point, { layers: [MUNICIPALITY_FILL_LAYER_ID] })[0];
}

function fitToCollection(map: Map | null, collection: MunicipalityCollection): void {
  if (!map || collection.features.length === 0) {
    return;
  }

  const [minLng, minLat, maxLng, maxLat] = bbox(collection);
  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    {
      padding: 56,
      maxZoom: 10,
      duration: 700,
    },
  );
}
