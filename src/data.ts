import type { AdjacencyMap, DataManifest, MunicipalityCollection, MunicipalityStatsMap } from './types';

export type LoadedMapData = {
  manifest: DataManifest;
  municipalities: MunicipalityCollection;
  adjacency: AdjacencyMap;
  stats: MunicipalityStatsMap;
};

export async function loadMapData(): Promise<LoadedMapData> {
  const manifest = await fetchJson<DataManifest>('/data/manifest.json');
  const [municipalities, adjacency, stats] = await Promise.all([
    fetchJson<MunicipalityCollection>(manifest.municipalities),
    fetchJson<AdjacencyMap>(manifest.adjacency),
    manifest.stats ? fetchJson<MunicipalityStatsMap>(manifest.stats) : Promise.resolve({}),
  ]);

  return {
    manifest,
    municipalities,
    adjacency,
    stats,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return (await response.json()) as T;
}
