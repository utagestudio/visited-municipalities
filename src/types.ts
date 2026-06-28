import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export type MunicipalityProperties = {
  municipalityCode: string;
  prefectureName: string;
  municipalityName: string;
  displayName: string;
};

export type MunicipalityFeature = Feature<Polygon | MultiPolygon, MunicipalityProperties>;
export type MunicipalityCollection = FeatureCollection<Polygon | MultiPolygon, MunicipalityProperties>;

export type AdjacencyMap = Record<string, string[]>;

export type MunicipalityStats = {
  population?: number;
  areaKm2?: number;
  populationAsOf?: string;
  areaAsOf?: string;
};

export type MunicipalityStatsMap = Record<string, MunicipalityStats>;

export type SavedMunicipality = {
  visited: true;
  color: string;
};

export type SavedState = {
  version: 1;
  updatedAt: string;
  backgroundColor: string;
  municipalities: Record<string, SavedMunicipality>;
};

export type DataManifest = {
  datasetName: string;
  sourceDate: string;
  geometryMode?: 'triangle-grid';
  triangleCellSizeMeters?: number;
  triangleCoverageThreshold?: number;
  municipalities: string;
  adjacency: string;
  stats?: string;
};
