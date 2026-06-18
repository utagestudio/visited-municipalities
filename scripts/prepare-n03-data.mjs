import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import dissolve from '@turf/dissolve';
import simplify from '@turf/simplify';

const root = process.cwd();
const sourcePath = process.env.N03_GEOJSON;
const sourceDate = process.env.N03_SOURCE_DATE ?? 'manual';
const tolerance = Number(process.env.SIMPLIFY_TOLERANCE ?? '0.01');
const outDir = path.join(root, 'public', 'data');

if (!sourcePath) {
  console.error('Set N03_GEOJSON to a GeoJSON FeatureCollection converted from the N03 dataset.');
  console.error('Example: N03_GEOJSON=./data/raw/n03.geojson N03_SOURCE_DATE=2023-01-01 npm run prepare:data');
  process.exit(1);
}

const raw = JSON.parse(await readFile(sourcePath, 'utf8'));

if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
  throw new Error('N03_GEOJSON must point to a GeoJSON FeatureCollection.');
}

await mkdir(outDir, { recursive: true });

const normalized = raw.features.map(normalizeN03Feature).filter(Boolean);
const dissolved = dissolveByMunicipality(normalized);
const simplified = simplify(dissolved, {
  tolerance,
  highQuality: false,
  mutate: false,
});
const adjacency = buildAdjacency(simplified.features);

await writeJson(path.join(outDir, 'municipalities.generated.geojson'), simplified);
await writeJson(path.join(outDir, 'adjacency.generated.json'), adjacency);
await writeJson(path.join(outDir, 'manifest.json'), {
  datasetName: 'generated-n03',
  sourceDate,
  municipalities: '/data/municipalities.generated.geojson',
  adjacency: '/data/adjacency.generated.json',
});

console.log(`Wrote ${simplified.features.length} municipality features to ${outDir}`);
console.log(`Wrote adjacency for ${Object.keys(adjacency).length} municipality keys`);

function normalizeN03Feature(feature) {
  const props = feature.properties ?? {};
  const prefectureName = props.N03_001;
  const cityName = props.N03_004;
  const wardName = props.N03_005;
  const rawCode = props.N03_007;

  if (!prefectureName || !cityName || !rawCode || !feature.geometry) {
    return null;
  }

  const isTokyoSpecialWard = prefectureName === '東京都' && cityName === '特別区部' && wardName;
  const isDesignatedCityWard = Boolean(wardName) && !isTokyoSpecialWard;
  const municipalityName = isTokyoSpecialWard ? wardName : cityName;
  const municipalityCode = isDesignatedCityWard ? toDesignatedCityCode(rawCode) : rawCode;

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

function toDesignatedCityCode(rawCode) {
  const code = String(rawCode);
  if (!/^\d{5}$/.test(code)) {
    return `designated-city:${code}`;
  }

  return `${code.slice(0, 4)}0`;
}

function dissolveByMunicipality(features) {
  const dissolved = dissolve(
    {
      type: 'FeatureCollection',
      features,
    },
    {
      propertyName: 'municipalityCode',
    },
  );

  const sourceProperties = new Map(features.map((feature) => [feature.properties.municipalityCode, feature.properties]));

  return {
    type: 'FeatureCollection',
    features: dissolved.features.map((feature) => ({
      ...feature,
      properties: sourceProperties.get(feature.properties.municipalityCode) ?? feature.properties,
    })),
  };
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
