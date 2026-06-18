import { iter } from 'but-unzip';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import simplify from '@turf/simplify';
import union from '@turf/union';

const root = process.cwd();
const sourcePath = process.env.N03_GEOJSON;
const zipDir = process.env.N03_ZIP_DIR ?? path.join(root, 'data', 'raw');
const sourceDate = process.env.N03_SOURCE_DATE ?? 'manual';
const tolerance = Number(process.env.SIMPLIFY_TOLERANCE ?? '0.01');
const outDir = path.join(root, 'public', 'data');

await mkdir(outDir, { recursive: true });

const groups = await loadMunicipalityGroups();
const processed = buildMunicipalityCollection(groups);
const adjacency = buildAdjacency(processed.features);

await writeJson(path.join(outDir, 'municipalities.generated.geojson'), processed);
await writeJson(path.join(outDir, 'adjacency.generated.json'), adjacency);
await writeJson(path.join(outDir, 'manifest.json'), {
  datasetName: 'generated-n03',
  sourceDate,
  municipalities: '/data/municipalities.generated.geojson',
  adjacency: '/data/adjacency.generated.json',
});

console.log(`Wrote ${processed.features.length} municipality features to ${outDir}`);
console.log(`Wrote adjacency for ${Object.keys(adjacency).length} municipality keys`);

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

    const mergeInternalBoundaries = normalized.properties.municipalityCode.startsWith('designated-city:');
    const feature = mergeInternalBoundaries ? normalized : simplifyFeature(normalized);
    const municipalityCode = feature.properties.municipalityCode;
    const group = groups.get(municipalityCode) ?? {
      properties: feature.properties,
      polygons: [],
      mergeInternalBoundaries,
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

function buildMunicipalityCollection(groups) {
  return {
    type: 'FeatureCollection',
    features: Array.from(groups.values()).map(buildMunicipalityFeature),
  };
}

function buildMunicipalityFeature(group) {
  const feature = {
    type: 'Feature',
    properties: group.properties,
    geometry:
      group.polygons.length === 1
        ? {
            type: 'Polygon',
            coordinates: group.polygons[0],
          }
        : {
            type: 'MultiPolygon',
            coordinates: group.polygons,
          },
  };

  if (!group.mergeInternalBoundaries || group.polygons.length < 2) {
    return feature;
  }

  try {
    const unioned = union(
      {
        type: 'FeatureCollection',
        features: group.polygons.map((coordinates) => ({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates,
          },
        })),
      },
      {
        properties: group.properties,
      },
    );

    if (unioned) {
      return simplifyFeature(unioned);
    }
  } catch (error) {
    console.warn(`Failed to union ${group.properties.displayName}; keeping separate polygons.`, error);
  }

  return simplifyFeature(feature);
}

function simplifyFeature(feature) {
  return simplify(feature, {
    tolerance,
    highQuality: false,
    mutate: false,
  });
}

function buildAdjacency(features) {
  const boxes = features.map((feature) => ({
    code: feature.properties.municipalityCode,
    box: bbox(feature),
    feature,
  }));
  const adjacency = Object.fromEntries(features.map((feature) => [feature.properties.municipalityCode, []]));

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex];
      const right = boxes[rightIndex];

      if (!bboxTouches(left.box, right.box)) {
        continue;
      }

      if (booleanIntersects(left.feature, right.feature)) {
        adjacency[left.code].push(right.code);
        adjacency[right.code].push(left.code);
      }
    }
  }

  return Object.fromEntries(Object.entries(adjacency).map(([code, neighbors]) => [code, neighbors.sort()]));
}

function bboxTouches(left, right) {
  return left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1];
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`);
}
