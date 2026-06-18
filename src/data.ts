import type { AdjacencyMap, DataManifest, MunicipalityCollection } from './types';

export type LoadedMapData = {
  manifest: DataManifest;
  municipalities: MunicipalityCollection;
  adjacency: AdjacencyMap;
};

export async function loadMapData(): Promise<LoadedMapData> {
  const manifest = await fetchJson<DataManifest>('/data/manifest.json');
  const [municipalities, adjacency] = await Promise.all([
    fetchJson<MunicipalityCollection>(manifest.municipalities),
    fetchJson<AdjacencyMap>(manifest.adjacency),
  ]);

  return {
    manifest,
    municipalities,
    adjacency,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return (await response.json()) as T;
}
