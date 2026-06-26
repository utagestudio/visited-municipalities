import { describe, expect, it } from 'vitest';
import { buildTriangleGridCollection, shouldExcludeN03Feature } from './triangle-grid.mjs';

describe('triangle grid preprocessing', () => {
  it('builds edge-based adjacency from assigned triangle cells', () => {
    const groups = new Map([
      ['left', createGroup('left', 'Left', [[-1, 0], [0, 0], [0, 1], [-1, 1], [-1, 0]])],
      ['right', createGroup('right', 'Right', [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])],
    ]);

    const { collection, adjacency, stats } = buildTriangleGridCollection(groups, {
      cellSizeMeters: 70000,
      coverageThreshold: 0.45,
      progressIntervalMs: Number.POSITIVE_INFINITY,
      logger: silentLogger,
    });

    expect(collection.features.map((feature) => feature.properties.municipalityCode).sort()).toEqual(['left', 'right']);
    expect(adjacency.left).toContain('right');
    expect(adjacency.right).toContain('left');
    expect(stats.assignedCells).toBeGreaterThan(0);
  });

  it('keeps tiny municipalities clickable by forcing their best cell', () => {
    const groups = new Map([
      ['tiny', createGroup('tiny', 'Tiny', [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]])],
    ]);

    const { collection, stats } = buildTriangleGridCollection(groups, {
      cellSizeMeters: 70000,
      coverageThreshold: 0.5,
      progressIntervalMs: Number.POSITIVE_INFINITY,
      logger: silentLogger,
    });

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties.municipalityCode).toBe('tiny');
    expect(stats.forcedCells).toBe(1);
  });

  it('excludes known unassigned reclaimed lands from source N03 features', () => {
    expect(shouldExcludeN03Feature({ N03_004: '所属未定地' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '荒川河口部' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '中央防波堤外側廃棄物処理場（中潮橋南側）' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: 'うるま市・金武町境界部地先の埋立地' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '市川市・船橋市境界地先の土地' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: 'ベヨネース列岩' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '須美寿島' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '鳥島' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '孀婦岩' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '羽島' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '鰹島' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '鷹島（甑島南方）' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '津倉瀬（宇治群島北東方）' })).toBe(true);
    expect(shouldExcludeN03Feature({ N03_004: '千代田区' })).toBe(false);
  });
});

const silentLogger = {
  info() {},
  warn() {},
};

function createGroup(code, name, ring) {
  return {
    properties: {
      municipalityCode: code,
      prefectureName: 'Test',
      municipalityName: name,
      displayName: `Test ${name}`,
    },
    polygons: [[ring]],
  };
}
