import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMapData } from './data';
import type { MunicipalityCollection } from './types';

const emptyCollection: MunicipalityCollection = {
  type: 'FeatureCollection',
  features: [],
};

describe('loadMapData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads municipality stats when the manifest provides a stats asset', async () => {
    stubFetch({
      '/data/manifest.json': {
        datasetName: 'test',
        sourceDate: '2023-01-01',
        municipalities: '/data/municipalities.geojson',
        adjacency: '/data/adjacency.json',
        stats: '/data/stats.json',
      },
      '/data/municipalities.geojson': emptyCollection,
      '/data/adjacency.json': { '13101': ['13102'] },
      '/data/stats.json': {
        '13101': {
          population: 68406,
          areaKm2: 11.66,
          populationAsOf: '2020-10-01',
          areaAsOf: '2023-01-01',
        },
      },
    });

    await expect(loadMapData()).resolves.toMatchObject({
      stats: {
        '13101': {
          population: 68406,
          areaKm2: 11.66,
        },
      },
    });
  });

  it('uses empty stats for manifests generated before stats support', async () => {
    stubFetch({
      '/data/manifest.json': {
        datasetName: 'test',
        sourceDate: '2023-01-01',
        municipalities: '/data/municipalities.geojson',
        adjacency: '/data/adjacency.json',
      },
      '/data/municipalities.geojson': emptyCollection,
      '/data/adjacency.json': {},
    });

    await expect(loadMapData()).resolves.toMatchObject({
      stats: {},
    });
  });
});

function stubFetch(responses: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => responses[url],
    })),
  );
}
