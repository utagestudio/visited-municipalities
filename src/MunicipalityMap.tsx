import { useEffect, useRef } from 'react';
import bbox from '@turf/bbox';
import maplibregl, { GeoJSONSource, Map } from 'maplibre-gl';
import type { MunicipalityCollection } from './types';
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

type MunicipalityMapProps = {
  municipalities: MunicipalityCollection;
  state: SavedState;
  selectedCode: string | null;
  focusCode: string | null;
  onSelect: (municipalityCode: string) => void;
};

export function MunicipalityMap({
  municipalities,
  state,
  selectedCode,
  focusCode,
  onSelect,
}: MunicipalityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.addSource(MUNICIPALITY_SOURCE_ID, {
        type: 'geojson',
        data: municipalities,
        promoteId: 'municipalityCode',
      });
      map.addLayer(createFillLayer(state));
      map.addLayer(createBorderLayer());
      map.addLayer(createSelectedBorderLayer(selectedCode));
      fitToCollection(map, municipalities);
    });

    map.on('click', (event) => {
      if (!map.getLayer(MUNICIPALITY_FILL_LAYER_ID)) {
        return;
      }

      const feature = map.queryRenderedFeatures(event.point, {
        layers: [MUNICIPALITY_FILL_LAYER_ID],
      })[0];
      const municipalityCode = feature?.properties?.municipalityCode;
      if (typeof municipalityCode === 'string') {
        onSelectRef.current(municipalityCode);
      }
    });

    map.on('mousemove', (event) => {
      if (!map.getLayer(MUNICIPALITY_FILL_LAYER_ID)) {
        return;
      }

      const features = map.queryRenderedFeatures(event.point, {
        layers: [MUNICIPALITY_FILL_LAYER_ID],
      });
      map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
    });

    mapRef.current = map;

    return () => {
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

  return <div className="map" ref={containerRef} aria-label="市区町村マップ" />;
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
