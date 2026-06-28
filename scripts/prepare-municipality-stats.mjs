import { iter } from 'but-unzip';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ESTAT_URL =
  'https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000032143614';
const POPULATION_AS_OF = '2020-10-01';

const root = process.cwd();
const source = process.env.MUNICIPALITY_STATS_XLSX ?? process.argv[2] ?? DEFAULT_ESTAT_URL;
const municipalitiesPath =
  process.env.MUNICIPALITY_STATS_MUNICIPALITIES_GEOJSON ??
  path.join(root, 'public', 'data', 'municipalities.generated.geojson');
const outPath =
  process.env.MUNICIPALITY_STATS_CSV ?? path.join(root, 'data', 'stats', 'municipality-stats.csv');

const [xlsxBytes, municipalities] = await Promise.all([
  readSource(source),
  readJson(municipalitiesPath),
]);
const workbook = await readXlsxWorkbook(xlsxBytes);
const censusRows = extractCensusRows(workbook.sheets[0]?.xml, workbook.sharedStrings);
const rows = buildStatsRows(municipalities, censusRows);

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, toCsv(rows));

console.log(`Wrote ${rows.length} municipality population rows to ${outPath}`);
console.log(`Matched population for ${rows.filter((row) => typeof row.population === 'number').length} rows`);

async function readSource(value) {
  if (/^https?:\/\//.test(value)) {
    const response = await fetch(value);
    if (!response.ok) {
      throw new Error(`Failed to download ${value}: ${response.status} ${response.statusText}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  return readFile(value);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readXlsxWorkbook(bytes) {
  const files = Object.fromEntries(
    await Promise.all(
      Array.from(iter(bytes)).map(async (entry) => [entry.filename, new TextDecoder().decode(await entry.read())]),
    ),
  );
  const rels = parseWorkbookRelationships(files['xl/_rels/workbook.xml.rels']);
  const sheets = parseWorkbookSheets(files['xl/workbook.xml'])
    .map((sheet) => ({
      ...sheet,
      xml: files[`xl/${rels.get(sheet.relationshipId)}`],
    }))
    .filter((sheet) => typeof sheet.xml === 'string');

  return {
    sharedStrings: parseSharedStrings(files['xl/sharedStrings.xml']),
    sheets,
  };
}

function parseWorkbookRelationships(xml) {
  const rels = new Map();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attributes = parseAttributes(match[1]);
    if (attributes.Id && attributes.Target) {
      rels.set(attributes.Id, attributes.Target);
    }
  }
  return rels;
}

function parseWorkbookSheets(xml) {
  return Array.from(xml.matchAll(/<sheet\b([^>]*)\/>/g)).map((match) => {
    const attributes = parseAttributes(match[1]);
    return {
      name: attributes.name,
      relationshipId: attributes['r:id'],
    };
  });
}

function parseAttributes(raw) {
  return Object.fromEntries(Array.from(raw.matchAll(/([\w:]+)="([^"]*)"/g)).map((match) => [match[1], decodeXml(match[2])]));
}

function parseSharedStrings(xml = '') {
  return Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map((match) =>
    Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((textMatch) => decodeXml(textMatch[1]))
      .join(''),
  );
}

function extractCensusRows(sheetXml, sharedStrings) {
  if (!sheetXml) {
    throw new Error('The e-Stat workbook does not include a readable first worksheet.');
  }

  const byCode = new Map();
  const byPrefectureAndName = new Map();

  for (const row of parseWorksheetRows(sheetXml, sharedStrings)) {
    const prefecture = parseNamedCode(row.A);
    const municipality = parseNamedCode(row.B);
    const population = parseNumber(row.E);

    if (!prefecture || !municipality || typeof population !== 'number') {
      continue;
    }

    const value = {
      code: municipality.code,
      prefectureName: prefecture.name,
      municipalityName: municipality.name,
      population,
    };
    byCode.set(value.code, value);
    byPrefectureAndName.set(`${value.prefectureName}:${value.municipalityName}`, value);
  }

  return {
    byCode,
    byPrefectureAndName,
  };
}

function parseWorksheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = parseAttributes(cellMatch[1]);
      const column = attributes.r?.match(/^[A-Z]+/)?.[0];
      if (!column) {
        continue;
      }

      row[column] = readCellValue(cellMatch[2], attributes.t, sharedStrings);
    }
    rows.push(row);
  }
  return rows;
}

function readCellValue(xml, type, sharedStrings) {
  if (type === 'inlineStr') {
    return Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((match) => decodeXml(match[1]))
      .join('');
  }

  const rawValue = xml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
  if (type === 's') {
    return sharedStrings[Number(rawValue)] ?? '';
  }

  return decodeXml(rawValue);
}

function parseNamedCode(value) {
  const match = String(value ?? '').match(/^(\d{2,5})_(.+)$/);
  if (!match) {
    return null;
  }

  return {
    code: match[1],
    name: match[2],
  };
}

function parseNumber(value) {
  const number = Number(String(value ?? '').replaceAll(',', ''));
  return Number.isFinite(number) ? number : undefined;
}

function buildStatsRows(municipalities, censusRows) {
  return municipalities.features
    .map((feature) => {
      const { municipalityCode, prefectureName, municipalityName } = feature.properties;
      const sourceRow = municipalityCode.startsWith('designated-city:')
        ? censusRows.byPrefectureAndName.get(`${prefectureName}:${municipalityName}`)
        : censusRows.byCode.get(municipalityCode);

      return {
        municipalityCode,
        population: sourceRow?.population,
        populationAsOf: sourceRow ? POPULATION_AS_OF : '',
        areaKm2: '',
        areaAsOf: '',
      };
    })
    .sort((left, right) => left.municipalityCode.localeCompare(right.municipalityCode, 'ja'));
}

function toCsv(rows) {
  const header = ['municipalityCode', 'population', 'populationAsOf', 'areaKm2', 'areaAsOf'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      header
        .map((key) => {
          const value = row[key] ?? '';
          return escapeCsvCell(value);
        })
        .join(','),
    ),
  ];

  return `${lines.join('\n')}\n`;
}

function escapeCsvCell(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function decodeXml(value) {
  return String(value)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}
