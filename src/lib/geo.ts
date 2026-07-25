import type {
  GeoJsonPosition,
  GeometryWarning,
  LatLng,
  NormalizedGeometry,
  PlacesPolygon,
  SupportedGeoJsonGeometry,
} from "./types";

export const PLACES_AGGREGATE_MAX_VERTICES = 7_000;

const AREA_EPSILON = 1e-12;

export class GeometryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeometryValidationError";
  }
}

function positionsEqual(
  first: GeoJsonPosition,
  second: GeoJsonPosition,
): boolean {
  return first[0] === second[0] && first[1] === second[1];
}

function parsePosition(
  value: unknown,
  componentIndex: number,
): GeoJsonPosition {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number" ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    throw new GeometryValidationError(
      `Component ${componentIndex} contains an invalid GeoJSON position.`,
    );
  }

  const [longitude, latitude] = value;
  if (longitude < -180 || longitude > 180) {
    throw new GeometryValidationError(
      `Longitude ${longitude} is outside [-180, 180].`,
    );
  }
  if (latitude < -90 || latitude > 90) {
    throw new GeometryValidationError(
      `Latitude ${latitude} is outside [-90, 90].`,
    );
  }

  return [longitude, latitude];
}

function cleanAndCloseRing(
  value: unknown,
  componentIndex: number,
): GeoJsonPosition[] {
  if (!Array.isArray(value)) {
    throw new GeometryValidationError(
      `Component ${componentIndex} has no exterior ring.`,
    );
  }

  const cleaned: GeoJsonPosition[] = [];
  for (const rawPosition of value) {
    const position = parsePosition(rawPosition, componentIndex);
    const previous = cleaned.at(-1);
    if (!previous || !positionsEqual(previous, position)) {
      cleaned.push(position);
    }
  }

  if (cleaned.length === 0) {
    throw new GeometryValidationError(
      `Component ${componentIndex} has an empty exterior ring.`,
    );
  }
  if (!positionsEqual(cleaned[0], cleaned.at(-1) as GeoJsonPosition)) {
    cleaned.push(cleaned[0]);
  }

  const openRing = cleaned.slice(0, -1);
  const uniquePositions = new Set(
    openRing.map(([longitude, latitude]) => `${longitude},${latitude}`),
  );
  if (uniquePositions.size < 3) {
    throw new GeometryValidationError(
      `Component ${componentIndex} must contain at least three unique vertices.`,
    );
  }
  if (uniquePositions.size !== openRing.length) {
    throw new GeometryValidationError(
      `Component ${componentIndex} contains a non-consecutive duplicate vertex.`,
    );
  }

  return cleaned;
}

/**
 * Unwraps longitudes only for planar winding calculation. Output coordinates
 * sent to Google remain normalized to [-180, 180].
 */
function unwrapLongitudes(
  ring: readonly GeoJsonPosition[],
): GeoJsonPosition[] {
  if (ring.length === 0) {
    return [];
  }

  const result: GeoJsonPosition[] = [ring[0]];
  let previousLongitude = ring[0][0];

  for (const [rawLongitude, latitude] of ring.slice(1)) {
    let longitude = rawLongitude;
    while (longitude - previousLongitude > 180) {
      longitude -= 360;
    }
    while (longitude - previousLongitude < -180) {
      longitude += 360;
    }
    result.push([longitude, latitude]);
    previousLongitude = longitude;
  }

  return result;
}

function signedArea(ring: readonly GeoJsonPosition[]): number {
  const unwrapped = unwrapLongitudes(ring);
  let twiceArea = 0;

  for (let index = 0; index < unwrapped.length - 1; index += 1) {
    const [x1, y1] = unwrapped[index];
    const [x2, y2] = unwrapped[index + 1];
    twiceArea += x1 * y2 - x2 * y1;
  }

  return twiceArea / 2;
}

function ensureCounterClockwise(
  ring: readonly GeoJsonPosition[],
  componentIndex: number,
): GeoJsonPosition[] {
  const area = signedArea(ring);
  if (Math.abs(area) <= AREA_EPSILON) {
    throw new GeometryValidationError(
      `Component ${componentIndex} has zero or indeterminate area.`,
    );
  }
  if (area > 0) {
    return [...ring];
  }

  const reversedOpenRing = ring.slice(0, -1).reverse();
  return [...reversedOpenRing, reversedOpenRing[0]];
}

function simplifyByOrderedSampling(
  ring: readonly GeoJsonPosition[],
  maxVertices: number,
): GeoJsonPosition[] {
  if (ring.length <= maxVertices) {
    return [...ring];
  }

  const openRing = ring.slice(0, -1);
  const uniqueVertexBudget = maxVertices - 1;
  const sampled = Array.from(
    { length: uniqueVertexBudget },
    (_, sampleIndex) =>
      openRing[
        Math.floor((sampleIndex * openRing.length) / uniqueVertexBudget)
      ],
  );

  return [...sampled, sampled[0]];
}

function crossesAntimeridian(
  ring: readonly GeoJsonPosition[],
): boolean {
  return ring
    .slice(1)
    .some(
      ([longitude], index) =>
        Math.abs(longitude - ring[index][0]) > 180,
    );
}

function toLatLng([longitude, latitude]: GeoJsonPosition): LatLng {
  return { latitude, longitude };
}

export function isCounterClockwisePlacesRing(
  coordinates: readonly LatLng[],
): boolean {
  if (coordinates.length < 4) {
    return false;
  }

  const ring: GeoJsonPosition[] = coordinates.map(
    ({ latitude, longitude }) => [longitude, latitude],
  );
  return signedArea(ring) > AREA_EPSILON;
}

/**
 * Converts RFC 7946 Polygon/MultiPolygon coordinates to the simplified
 * one-exterior-ring contract accepted by Places Aggregate.
 *
 * Holes cannot be represented by that API and are therefore reported and
 * omitted. MultiPolygon components are kept as separate request units.
 */
export function normalizeExteriorRings(
  geometry: SupportedGeoJsonGeometry,
  requestedMaxVertices = PLACES_AGGREGATE_MAX_VERTICES,
): NormalizedGeometry {
  if (!Number.isInteger(requestedMaxVertices) || requestedMaxVertices < 4) {
    throw new RangeError("maxVertices must be an integer of at least 4.");
  }
  const maxVertices = Math.min(
    requestedMaxVertices,
    PLACES_AGGREGATE_MAX_VERTICES,
  );

  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : null;

  if (!polygons) {
    throw new GeometryValidationError(
      "Only GeoJSON Polygon and MultiPolygon are supported.",
    );
  }
  if (polygons.length === 0) {
    throw new GeometryValidationError(
      "The geometry must contain at least one polygon component.",
    );
  }

  const warnings: GeometryWarning[] = [];
  const rings: PlacesPolygon[] = [];
  let hadHoles = false;

  if (polygons.length > 1) {
    warnings.push({
      code: "MULTIPLE_COMPONENTS",
      message:
        "MultiPolygon components are preserved as separate Places Aggregate requests; their counts are summed assuming disjoint interiors.",
    });
  }

  polygons.forEach((polygon, componentIndex) => {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new GeometryValidationError(
        `Component ${componentIndex} has no exterior ring.`,
      );
    }

    const holeCount = Math.max(0, polygon.length - 1);
    if (holeCount > 0) {
      hadHoles = true;
      warnings.push({
        code: "HOLES_DROPPED",
        componentIndex,
        message:
          `Component ${componentIndex} has ${holeCount} interior ring(s). ` +
          "Places Aggregate cannot represent holes, so counts may be overestimated.",
      });
    }

    const sourceVertexCount = Array.isArray(polygon[0])
      ? polygon[0].length
      : 0;
    let exteriorRing = cleanAndCloseRing(
      polygon[0],
      componentIndex,
    );

    if (crossesAntimeridian(exteriorRing)) {
      warnings.push({
        code: "ANTIMERIDIAN_APPROXIMATION",
        componentIndex,
        message:
          "The component crosses the antimeridian. Winding was computed with unwrapped longitudes; verify the downstream polygon.",
      });
    }

    exteriorRing = ensureCounterClockwise(
      exteriorRing,
      componentIndex,
    );
    const simplified = exteriorRing.length > maxVertices;
    if (simplified) {
      exteriorRing = simplifyByOrderedSampling(
        exteriorRing,
        maxVertices,
      );
      exteriorRing = ensureCounterClockwise(
        exteriorRing,
        componentIndex,
      );
      warnings.push({
        code: "VERTEX_LIMIT_SIMPLIFIED",
        componentIndex,
        message:
          `Component ${componentIndex} was reduced from ${sourceVertexCount} ` +
          `to ${exteriorRing.length} vertices using ordered sampling.`,
      });
    }

    rings.push({
      componentIndex,
      coordinates: exteriorRing.map(toLatLng),
      sourceVertexCount,
      simplified,
    });
  });

  return {
    rings,
    warnings,
    hadHoles,
    inputType: geometry.type,
  };
}
