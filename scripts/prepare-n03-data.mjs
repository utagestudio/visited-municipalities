import { iter } from 'but-unzip';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildTriangleGridCollection, shouldExcludeN03Feature } from './triangle-grid.mjs';

const EARTH_RADIUS_METERS = 6378137;
const root = process.cwd();
const sourcePath = process.env.N03_GEOJSON;
const zipDir = process.env.N03_ZIP_DIR ?? path.join(root, 'data', 'raw');
const statsCsvPath = process.env.MUNICIPALITY_STATS_CSV ?? path.join(root, 'data', 'stats', 'municipality-stats.csv');
const sourceDate = process.env.N03_SOURCE_DATE ?? 'manual';
const triangleCellSizeMeters = Number(process.env.TRIANGLE_CELL_SIZE_METERS ?? '3000');
const triangleCoverageThreshold = Number(process.env.TRIANGLE_COVERAGE_THRESHOLD ?? '0.5');
const outDir = path.join(root, 'public', 'data');

await mkdir(outDir, { recursive: true });

const groups = await loadMunicipalityGroups();
const municipalityStats = await buildMunicipalityStats(groups);
const {
  collection: processed,
  adjacency,
  stats,
} = buildTriangleGridCollection(groups, {
  cellSizeMeters: triangleCellSizeMeters,
  coverageThreshold: triangleCoverageThreshold,
});

await writeJson(path.join(outDir, 'municipalities.generated.geojson'), processed);
await writeJson(path.join(outDir, 'adjacency.generated.json'), adjacency);
await writeJson(path.join(outDir, 'municipality-stats.generated.json'), municipalityStats);
await writeJson(path.join(outDir, 'manifest.json'), {
  datasetName: 'generated-n03',
  sourceDate,
  geometryMode: 'triangle-grid',
  triangleCellSizeMeters,
  triangleCoverageThreshold,
  municipalities: '/data/municipalities.generated.geojson',
  adjacency: '/data/adjacency.generated.json',
  stats: '/data/municipality-stats.generated.json',
});

console.log(`Wrote ${processed.features.length} municipality features to ${outDir}`);
console.log(`Wrote color proximity graph for ${Object.keys(adjacency).length} municipality keys`);
console.log(`Wrote stats for ${Object.keys(municipalityStats).length} municipality keys`);
console.log(`Generated ${stats.assignedCells.toLocaleString()} assigned triangle cells (${stats.forcedCells} forced)`);

async function loadMunicipalityGroups() {
  const groups = new Map();

  if (sourcePath) {
    const raw = JSON.parse(await readFile(sourcePath, 'utf8'));

    if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
      throw new Error('N03_GEOJSON must point to a GeoJSON FeatureCollection.');
    }

    addFeaturesToGroups(groups, raw.features);
    return groups;
  }

  const zipNames = (await readdir(zipDir))
    .filter((name) => /^N03-20230101_\d{2}_GML\.zip$/.test(name))
    .sort();

  if (zipNames.length !== 47) {
    throw new Error(`Set N03_GEOJSON, or put 47 prefecture ZIP files in ${zipDir}. Found ${zipNames.length}.`);
  }

  for (const zipName of zipNames) {
    const geojson = await readGeoJsonFromZip(path.join(zipDir, zipName));
    addFeaturesToGroups(groups, geojson.features);
    console.log(`${zipName}: ${geojson.features.length} raw features`);
  }

  return groups;
}

async function readGeoJsonFromZip(zipPath) {
  const zipBytes = await readFile(zipPath);
  const geojsonEntry = Array.from(iter(zipBytes)).find((entry) => entry.filename.endsWith('.geojson'));

  if (!geojsonEntry) {
    throw new Error(`No .geojson file found in ${zipPath}`);
  }

  const geojson = JSON.parse(new TextDecoder().decode(await geojsonEntry.read()));

  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error(`${geojsonEntry.filename} in ${zipPath} is not a GeoJSON FeatureCollection.`);
  }

  return geojson;
}

function addFeaturesToGroups(groups, features) {
  for (const rawFeature of features) {
    const normalized = normalizeN03Feature(rawFeature);

    if (!normalized) {
      continue;
    }

    const feature = normalized;
    const municipalityCode = feature.properties.municipalityCode;
    const group = groups.get(municipalityCode) ?? {
      properties: feature.properties,
      polygons: [],
    };

    if (feature.geometry.type === 'Polygon') {
      group.polygons.push(feature.geometry.coordinates);
    } else if (feature.geometry.type === 'MultiPolygon') {
      group.polygons.push(...feature.geometry.coordinates);
    }

    groups.set(municipalityCode, group);
  }
}

function normalizeN03Feature(feature) {
  const props = feature.properties ?? {};
  if (shouldExcludeN03Feature(props)) {
    return null;
  }

  const rawPrefectureName = props.N03_001;
  const prefectureName = normalizePrefectureName(rawPrefectureName);
  const districtOrDesignatedCityName = props.N03_003;
  const cityOrWardName = props.N03_004;
  const rawCode = props.N03_007;

  if (!prefectureName || !cityOrWardName || !rawCode || !feature.geometry) {
    return null;
  }

  const isDesignatedCityWard = isDesignatedCity(districtOrDesignatedCityName) && !isTokyoSpecialWardCode(rawCode);
  const municipalityName = isDesignatedCityWard ? districtOrDesignatedCityName : cityOrWardName;
  const municipalityCode = isDesignatedCityWard
    ? toDesignatedCityCode(prefectureName, districtOrDesignatedCityName)
    : rawCode;

  return {
    type: 'Feature',
    properties: {
      municipalityCode,
      prefectureName,
      municipalityName,
      displayName: `${prefectureName} ${municipalityName}`,
    },
    geometry: feature.geometry,
  };
}

function normalizePrefectureName(value) {
  if (typeof value !== 'string') {
    return value;
  }

  if (/[都道府県]$/.test(value)) {
    return value;
  }

  return `${value}県`;
}

function isDesignatedCity(value) {
  return typeof value === 'string' && value.endsWith('市');
}

function isTokyoSpecialWardCode(rawCode) {
  const code = String(rawCode);
  return /^131\d{2}$/.test(code);
}

function toDesignatedCityCode(prefectureName, cityName) {
  return `designated-city:${prefectureName}:${cityName}`;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`);
}

async function buildMunicipalityStats(groups) {
  const csvStats = await readMunicipalityStatsCsv(statsCsvPath);
  const statsByCode = {};

  for (const [municipalityCode, group] of groups) {
    const csvEntry = csvStats.get(municipalityCode) ?? {};
    const areaKm2 = csvEntry.areaKm2 ?? calculateGroupAreaKm2(group);

    statsByCode[municipalityCode] = {
      areaKm2,
      areaAsOf: csvEntry.areaAsOf ?? sourceDate,
      ...(typeof csvEntry.population === 'number'
        ? {
            population: csvEntry.population,
            populationAsOf: csvEntry.populationAsOf ?? sourceDate,
          }
        : {}),
    };
  }

  return statsByCode;
}

async function readMunicipalityStatsCsv(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return parseMunicipalityStatsCsv(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.log(`No municipality stats CSV found at ${filePath}; generating area-only stats.`);
      return new Map();
    }

    throw error;
  }
}

function parseMunicipalityStatsCsv(raw) {
  const rows = parseCsv(raw);
  const header = rows.shift();
  const stats = new Map();

  if (!header) {
    return stats;
  }

  const indexes = Object.fromEntries(header.map((name, index) => [name.trim(), index]));
  const codeIndex = indexes.municipalityCode;
  if (typeof codeIndex !== 'number') {
    throw new Error('Stats CSV must include a municipalityCode column.');
  }

  for (const row of rows) {
    const municipalityCode = row[codeIndex]?.trim();
    if (!municipalityCode) {
      continue;
    }

    stats.set(municipalityCode, {
      population: parseOptionalNumber(row[indexes.population]),
      populationAsOf: row[indexes.populationAsOf]?.trim() || undefined,
      areaKm2: parseOptionalNumber(row[indexes.areaKm2]),
      areaAsOf: row[indexes.areaAsOf]?.trim() || undefined,
    });
  }

  return stats;
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== '')) {
    rows.push(row);
  }

  return rows;
}

function parseOptionalNumber(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  const number = Number(value.replaceAll(',', ''));
  return Number.isFinite(number) ? number : undefined;
}

function calculateGroupAreaKm2(group) {
  const areaSquareMeters = group.polygons.reduce((sum, polygon) => sum + calculatePolygonArea(polygon), 0);
  return Math.round((areaSquareMeters / 1_000_000) * 100) / 100;
}

function calculatePolygonArea(polygon) {
  const [outerRing, ...holes] = polygon;
  if (!outerRing) {
    return 0;
  }

  return Math.max(
    0,
    Math.abs(calculateRingArea(outerRing)) - holes.reduce((sum, ring) => sum + Math.abs(calculateRingArea(ring)), 0),
  );
}

function calculateRingArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    area +=
      degreesToRadians(next[0] - current[0]) *
      (2 + Math.sin(degreesToRadians(current[1])) + Math.sin(degreesToRadians(next[1])));
  }

  return (area * EARTH_RADIUS_METERS ** 2) / 2;
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}
