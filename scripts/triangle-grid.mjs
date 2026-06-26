import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const WEB_MERCATOR_RADIUS = 6378137;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const DEFAULT_PROGRESS_INTERVAL_MS = 5000;

export function buildTriangleGridCollection(groups, options = {}) {
  const cellSizeMeters = Number(options.cellSizeMeters ?? 3000);
  const coverageThreshold = Number(options.coverageThreshold ?? 0.5);
  const progressIntervalMs = Number(options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS);
  const logger = options.logger ?? console;

  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) {
    throw new Error('cellSizeMeters must be a positive number.');
  }

  const projectedGroups = projectGroups(groups);
  const pieces = projectedGroups.flatMap((group) => group.pieces);
  if (pieces.length === 0) {
    return {
      collection: { type: 'FeatureCollection', features: [] },
      adjacency: {},
      stats: {
        cellSizeMeters,
        coverageThreshold,
        generatedCells: 0,
        assignedCells: 0,
        forcedCells: 0,
      },
    };
  }

  const globalBox = expandBox(combineBoxes(pieces.map((piece) => piece.box)), cellSizeMeters * 2);
  const triangleHeight = (Math.sqrt(3) / 2) * cellSizeMeters;
  const rowCount = Math.ceil((globalBox[3] - globalBox[1]) / triangleHeight) + 2;
  const colCount = Math.ceil((globalBox[2] - globalBox[0]) / cellSizeMeters) + 3;
  const triangleArea = (cellSizeMeters * triangleHeight) / 2;
  const spatialIndex = buildSpatialIndex(pieces, cellSizeMeters * 2);
  const assignmentByCellId = new Map();
  const bestCellsByCode = new Map();
  const groupByCode = new Map(projectedGroups.map((group) => [group.properties.municipalityCode, group]));
  const codes = new Set(groupByCode.keys());
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let generatedCells = 0;

  for (let row = -1; row <= rowCount; row += 1) {
    const rowY = globalBox[1] + row * triangleHeight;
    const rowOffset = row % 2 === 0 ? 0 : cellSizeMeters / 2;

    for (let col = -1; col <= colCount; col += 1) {
      const x = globalBox[0] + col * cellSizeMeters + rowOffset;
      const y = rowY;
      const p0 = [x, y];
      const p1 = [x + cellSizeMeters, y];
      const p2 = [x + cellSizeMeters / 2, y + triangleHeight];
      const p3 = [x - cellSizeMeters / 2, y + triangleHeight];

      for (const triangle of [
        [p0, p1, p2],
        [p0, p2, p3],
      ]) {
        generatedCells += 1;
        const cellId = `${row}:${col}:${triangle[1] === p1 ? 0 : 1}`;
        const assignment = assignTriangle(triangle, triangleArea, spatialIndex, coverageThreshold);

        rememberBestCells(bestCellsByCode, assignment.candidates, cellId, triangle);

        if (assignment.code) {
          assignmentByCellId.set(cellId, {
            code: assignment.code,
            triangle,
          });
        }
      }
    }

    const now = Date.now();
    if (now - lastProgressAt >= progressIntervalMs) {
      logger.info(
        `Triangle grid: row ${row + 2}/${rowCount + 2}, assigned ${assignmentByCellId.size.toLocaleString()} cells, elapsed ${Math.round(
          (now - startedAt) / 1000,
        )}s`,
      );
      lastProgressAt = now;
    }
  }

  let forcedCells = 0;
  const forcedCellIds = new Set();
  for (const code of codes) {
    if (hasAssignedCode(assignmentByCellId, code)) {
      continue;
    }

    const bestCell =
      (bestCellsByCode.get(code) ?? []).find((candidate) => !forcedCellIds.has(candidate.cellId)) ??
      fallbackCellForCode(code, groupByCode, globalBox, cellSizeMeters, triangleHeight, forcedCellIds);
    if (!bestCell) {
      logger.warn(`No triangle cell candidate found for ${code}; omitting from map geometry.`);
      continue;
    }

    assignmentByCellId.set(bestCell.cellId, {
      code,
      triangle: bestCell.triangle,
    });
    forcedCellIds.add(bestCell.cellId);
    forcedCells += 1;
  }

  const { features, adjacency } = buildFeaturesFromAssignments(projectedGroups, assignmentByCellId);

  return {
    collection: {
      type: 'FeatureCollection',
      features,
    },
    adjacency,
    stats: {
      cellSizeMeters,
      coverageThreshold,
      generatedCells,
      assignedCells: assignmentByCellId.size,
      forcedCells,
    },
  };
}

export function shouldExcludeN03Feature(properties) {
  const name = properties?.N03_004;
  if (typeof name !== 'string') {
    return false;
  }

  return (
    name.includes('所属未定') ||
    name.includes('荒川河口部') ||
    name.includes('中央防波堤') ||
    name.includes('境界部地先の埋立地') ||
    name.includes('名古屋港口埋立地') ||
    name.includes('境界地先の土地') ||
    name === 'ベヨネース列岩' ||
    name === '須美寿島' ||
    name === '鳥島' ||
    name === '孀婦岩' ||
    name === '羽島' ||
    name === '鰹島' ||
    name.startsWith('鷹島（') ||
    name.startsWith('津倉瀬（')
  );
}

export function projectLonLat([longitude, latitude]) {
  const clampedLatitude = Math.max(Math.min(latitude, MAX_MERCATOR_LATITUDE), -MAX_MERCATOR_LATITUDE);
  const x = WEB_MERCATOR_RADIUS * degreesToRadians(longitude);
  const y = WEB_MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + degreesToRadians(clampedLatitude) / 2));
  return [x, y];
}

export function unprojectMercator([x, y]) {
  const longitude = radiansToDegrees(x / WEB_MERCATOR_RADIUS);
  const latitude = radiansToDegrees(2 * Math.atan(Math.exp(y / WEB_MERCATOR_RADIUS)) - Math.PI / 2);
  return [roundCoordinate(longitude), roundCoordinate(latitude)];
}

export function polygonArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function projectGroups(groups) {
  return Array.from(groups.values()).map((group) => {
    const pieces = group.polygons.flatMap((polygon) => {
      const projected = polygon.map((ring) => ring.map(projectLonLat));
      const box = ringBox(projected[0]);
      if (Math.abs(polygonArea(projected[0])) === 0) {
        return [];
      }

      return [
        {
          code: group.properties.municipalityCode,
          geometry: projected,
          box,
          feature: {
            type: 'Feature',
            properties: group.properties,
            geometry: {
              type: 'Polygon',
              coordinates: projected,
            },
          },
        },
      ];
    });

    return {
      properties: group.properties,
      pieces,
      representativePoint: pieces[0] ? ringCentroid(pieces[0].geometry[0]) : null,
    };
  });
}

function fallbackCellForCode(code, groupByCode, globalBox, cellSizeMeters, triangleHeight, forcedCellIds) {
  const group = groupByCode.get(code);
  if (!group?.representativePoint) {
    return null;
  }

  const fallback = triangleContainingPoint(group.representativePoint, globalBox, cellSizeMeters, triangleHeight);
  if (!fallback || forcedCellIds.has(fallback.cellId)) {
    return null;
  }

  return fallback;
}

function triangleContainingPoint(point, globalBox, cellSizeMeters, triangleHeight) {
  const estimatedRow = Math.floor((point[1] - globalBox[1]) / triangleHeight);
  let nearestCandidate = null;
  let nearestDistance = Infinity;

  for (let row = estimatedRow - 1; row <= estimatedRow + 1; row += 1) {
    const rowY = globalBox[1] + row * triangleHeight;
    const rowOffset = row % 2 === 0 ? 0 : cellSizeMeters / 2;
    const estimatedCol = Math.floor((point[0] - globalBox[0] - rowOffset) / cellSizeMeters);

    for (let col = estimatedCol - 2; col <= estimatedCol + 2; col += 1) {
      const x = globalBox[0] + col * cellSizeMeters + rowOffset;
      const y = rowY;
      const p0 = [x, y];
      const p1 = [x + cellSizeMeters, y];
      const p2 = [x + cellSizeMeters / 2, y + triangleHeight];
      const p3 = [x - cellSizeMeters / 2, y + triangleHeight];
      const candidates = [
        {
          cellId: `${row}:${col}:0`,
          triangle: [p0, p1, p2],
        },
        {
          cellId: `${row}:${col}:1`,
          triangle: [p0, p2, p3],
        },
      ];

      for (const candidate of candidates) {
        const distance = squaredDistance(point, triangleCentroid(candidate.triangle));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestCandidate = candidate;
        }

        if (pointInTriangle(point, candidate.triangle)) {
          return candidate;
        }
      }
    }
  }

  return nearestCandidate;
}

function buildSpatialIndex(pieces, binSize) {
  const globalBox = combineBoxes(pieces.map((piece) => piece.box));
  const bins = new Map();

  for (const piece of pieces) {
    for (const key of binKeysForBox(piece.box, globalBox, binSize)) {
      const existing = bins.get(key);
      if (existing) {
        existing.push(piece);
      } else {
        bins.set(key, [piece]);
      }
    }
  }

  return {
    bins,
    globalBox,
    binSize,
  };
}

function assignTriangle(triangle, triangleArea, spatialIndex, coverageThreshold) {
  const triangleBox = ringBox(triangle);
  const areaByCode = new Map();
  const pieces = uniquePiecesForBox(spatialIndex, triangleBox);
  const samples = triangleSamples(triangle);

  for (const sample of samples) {
    const piece = findContainingPiece(sample, pieces);

    if (piece) {
      areaByCode.set(piece.code, (areaByCode.get(piece.code) ?? 0) + triangleArea / samples.length);
    }
  }

  const mergedCandidates = Array.from(areaByCode, ([code, area]) => ({ code, area })).sort((left, right) => right.area - left.area);
  const totalArea = mergedCandidates.reduce((sum, candidate) => sum + candidate.area, 0);

  if (totalArea < triangleArea * coverageThreshold || mergedCandidates.length === 0) {
    return {
      code: null,
      candidates: mergedCandidates,
    };
  }

  return {
    code: mergedCandidates[0].code,
    candidates: mergedCandidates,
  };
}

function rememberBestCells(bestCellsByCode, candidates, cellId, triangle) {
  for (const candidate of candidates) {
    const previous = bestCellsByCode.get(candidate.code) ?? [];
    previous.push({
      area: candidate.area,
      cellId,
      triangle,
    });
    previous.sort((left, right) => right.area - left.area);
    bestCellsByCode.set(candidate.code, previous.slice(0, 20));
  }
}

function findContainingPiece(point, pieces) {
  for (const piece of pieces) {
    if (point[0] < piece.box[0] || point[0] > piece.box[2] || point[1] < piece.box[1] || point[1] > piece.box[3]) {
      continue;
    }

    if (booleanPointInPolygon(point, piece.feature, { ignoreBoundary: false })) {
      return piece;
    }
  }

  return null;
}

function buildFeaturesFromAssignments(projectedGroups, assignmentByCellId) {
  const propertiesByCode = new Map(projectedGroups.map((group) => [group.properties.municipalityCode, group.properties]));
  const directedBoundaryEdgesByCode = new Map();
  const ownerByUndirectedEdge = new Map();
  const adjacencySets = new Map(Array.from(propertiesByCode.keys(), (code) => [code, new Set()]));

  for (const { code, triangle } of assignmentByCellId.values()) {
    const edges = [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ];

    const codeEdges = directedBoundaryEdgesByCode.get(code) ?? new Map();
    directedBoundaryEdgesByCode.set(code, codeEdges);

    for (const [from, to] of edges) {
      const fromKey = pointKey(from);
      const toKey = pointKey(to);
      const forwardKey = `${fromKey}|${toKey}`;
      const reverseKey = `${toKey}|${fromKey}`;
      const undirectedKey = fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;

      if (codeEdges.has(reverseKey)) {
        codeEdges.delete(reverseKey);
      } else {
        codeEdges.set(forwardKey, { from, to, fromKey, toKey });
      }

      const owners = ownerByUndirectedEdge.get(undirectedKey) ?? new Set();
      owners.add(code);
      ownerByUndirectedEdge.set(undirectedKey, owners);
    }
  }

  for (const owners of ownerByUndirectedEdge.values()) {
    if (owners.size < 2) {
      continue;
    }

    const codes = Array.from(owners);
    for (let left = 0; left < codes.length; left += 1) {
      for (let right = left + 1; right < codes.length; right += 1) {
        adjacencySets.get(codes[left])?.add(codes[right]);
        adjacencySets.get(codes[right])?.add(codes[left]);
      }
    }
  }

  const features = [];
  for (const [code, properties] of propertiesByCode) {
    const boundaryEdges = directedBoundaryEdgesByCode.get(code);
    if (!boundaryEdges || boundaryEdges.size === 0) {
      continue;
    }

    const rings = polygonizeDirectedEdges(boundaryEdges);
    if (rings.length === 0) {
      continue;
    }

    const polygons = ringsToPolygons(rings).map((polygon) => polygon.map((ring) => ring.map(unprojectMercator)));
    if (polygons.length === 0) {
      continue;
    }

    features.push({
      type: 'Feature',
      properties,
      geometry:
        polygons.length === 1
          ? {
              type: 'Polygon',
              coordinates: polygons[0],
            }
          : {
              type: 'MultiPolygon',
              coordinates: polygons,
            },
    });
  }

  const adjacency = Object.fromEntries(
    Array.from(adjacencySets, ([code, neighbors]) => [code, Array.from(neighbors).sort()]).filter(([code]) =>
      features.some((feature) => feature.properties.municipalityCode === code),
    ),
  );

  return {
    features: features.sort((left, right) => left.properties.municipalityCode.localeCompare(right.properties.municipalityCode)),
    adjacency,
  };
}

function polygonizeDirectedEdges(edgeMap) {
  const outgoing = new Map();
  for (const edge of edgeMap.values()) {
    const existing = outgoing.get(edge.fromKey) ?? [];
    existing.push(edge);
    outgoing.set(edge.fromKey, existing);
  }

  const unused = new Set(edgeMap.keys());
  const rings = [];

  while (unused.size > 0) {
    const firstKey = unused.values().next().value;
    const first = edgeMap.get(firstKey);
    const ring = [first.from];
    let current = first;

    while (current && unused.has(`${current.fromKey}|${current.toKey}`)) {
      unused.delete(`${current.fromKey}|${current.toKey}`);
      ring.push(current.to);

      if (current.toKey === first.fromKey) {
        break;
      }

      const candidates = (outgoing.get(current.toKey) ?? []).filter((edge) => unused.has(`${edge.fromKey}|${edge.toKey}`));
      current = chooseNextEdge(current, candidates);
    }

    if (ring.length >= 4 && pointKey(ring[0]) === pointKey(ring[ring.length - 1])) {
      rings.push(removeDuplicateClosingArtifacts(ring));
    }
  }

  return rings.filter((ring) => Math.abs(polygonArea(ring.slice(0, -1))) > 1);
}

function chooseNextEdge(current, candidates) {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const incomingAngle = Math.atan2(current.to[1] - current.from[1], current.to[0] - current.from[0]);
  return candidates
    .map((edge) => ({
      edge,
      turn: positiveAngle(Math.atan2(edge.to[1] - edge.from[1], edge.to[0] - edge.from[0]) - incomingAngle),
    }))
    .sort((left, right) => left.turn - right.turn)[0].edge;
}

function ringsToPolygons(rings) {
  const outers = [];
  const holes = [];

  for (const ring of rings) {
    const openRing = ring.slice(0, -1);
    if (polygonArea(openRing) >= 0) {
      outers.push({
        outer: ring,
        holes: [],
      });
    } else {
      holes.push(ring);
    }
  }

  for (const hole of holes) {
    const point = hole[0];
    const container = outers.find((candidate) => pointInRing(point, candidate.outer));
    if (container) {
      container.holes.push(hole);
    }
  }

  return outers.map(({ outer, holes: polygonHoles }) => [ensureCounterClockwise(outer), ...polygonHoles.map(ensureClockwise)]);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if (current[1] > point[1] !== previous[1] > point[1]) {
      const x = ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) + current[0];
      if (point[0] < x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function uniquePiecesForBox(spatialIndex, box) {
  const pieces = new Set();
  for (const key of binKeysForBox(box, spatialIndex.globalBox, spatialIndex.binSize)) {
    for (const piece of spatialIndex.bins.get(key) ?? []) {
      pieces.add(piece);
    }
  }
  return pieces;
}

function binKeysForBox(box, globalBox, binSize) {
  const keys = [];
  const minX = Math.floor((box[0] - globalBox[0]) / binSize);
  const maxX = Math.floor((box[2] - globalBox[0]) / binSize);
  const minY = Math.floor((box[1] - globalBox[1]) / binSize);
  const maxY = Math.floor((box[3] - globalBox[1]) / binSize);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      keys.push(`${x}:${y}`);
    }
  }

  return keys;
}

function hasAssignedCode(assignmentByCellId, code) {
  for (const assignment of assignmentByCellId.values()) {
    if (assignment.code === code) {
      return true;
    }
  }
  return false;
}

function triangleCentroid(triangle) {
  return [
    (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
    (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3,
  ];
}

function ringCentroid(ring) {
  let areaFactorSum = 0;
  let xSum = 0;
  let ySum = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    const areaFactor = current[0] * next[1] - next[0] * current[1];
    areaFactorSum += areaFactor;
    xSum += (current[0] + next[0]) * areaFactor;
    ySum += (current[1] + next[1]) * areaFactor;
  }

  if (areaFactorSum === 0) {
    return ring[0] ?? null;
  }

  return [xSum / (3 * areaFactorSum), ySum / (3 * areaFactorSum)];
}

function triangleSamples(triangle) {
  const centroid = triangleCentroid(triangle);
  return [
    centroid,
    interpolateTriangle(triangle, 0.6, 0.2, 0.2),
    interpolateTriangle(triangle, 0.2, 0.6, 0.2),
    interpolateTriangle(triangle, 0.2, 0.2, 0.6),
    interpolateTriangle(triangle, 0.45, 0.45, 0.1),
    interpolateTriangle(triangle, 0.45, 0.1, 0.45),
    interpolateTriangle(triangle, 0.1, 0.45, 0.45),
  ];
}

function pointInTriangle(point, triangle) {
  const first = sign(point, triangle[0], triangle[1]);
  const second = sign(point, triangle[1], triangle[2]);
  const third = sign(point, triangle[2], triangle[0]);
  const hasNegative = first < 0 || second < 0 || third < 0;
  const hasPositive = first > 0 || second > 0 || third > 0;
  return !(hasNegative && hasPositive);
}

function sign(point, first, second) {
  return (point[0] - second[0]) * (first[1] - second[1]) - (first[0] - second[0]) * (point[1] - second[1]);
}

function squaredDistance(first, second) {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2;
}

function interpolateTriangle(triangle, firstWeight, secondWeight, thirdWeight) {
  return [
    triangle[0][0] * firstWeight + triangle[1][0] * secondWeight + triangle[2][0] * thirdWeight,
    triangle[0][1] * firstWeight + triangle[1][1] * secondWeight + triangle[2][1] * thirdWeight,
  ];
}

function ringBox(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return [minX, minY, maxX, maxY];
}

function combineBoxes(boxes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box[0]);
    minY = Math.min(minY, box[1]);
    maxX = Math.max(maxX, box[2]);
    maxY = Math.max(maxY, box[3]);
  }

  return [minX, minY, maxX, maxY];
}

function expandBox(box, amount) {
  return [box[0] - amount, box[1] - amount, box[2] + amount, box[3] + amount];
}

function removeDuplicateClosingArtifacts(ring) {
  const next = [];
  for (const point of ring) {
    if (next.length === 0 || pointKey(next[next.length - 1]) !== pointKey(point)) {
      next.push(point);
    }
  }

  if (pointKey(next[0]) !== pointKey(next[next.length - 1])) {
    next.push(next[0]);
  }

  return next;
}

function ensureCounterClockwise(ring) {
  return polygonArea(ring.slice(0, -1)) >= 0 ? ring : [...ring].reverse();
}

function ensureClockwise(ring) {
  return polygonArea(ring.slice(0, -1)) <= 0 ? ring : [...ring].reverse();
}

function pointKey(point) {
  return `${Math.round(point[0] * 1000)},${Math.round(point[1] * 1000)}`;
}

function positiveAngle(angle) {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
  return (value * 180) / Math.PI;
}

function roundCoordinate(value) {
  return Math.round(value * 1e6) / 1e6;
}
