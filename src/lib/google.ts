import { CATEGORIES } from "./categories";
import {
  isCounterClockwisePlacesRing,
  normalizeExteriorRings,
  PLACES_AGGREGATE_MAX_VERTICES,
} from "./geo";
import {
  POLYGON_FIDELITIES,
  ROUTING_PREFERENCES,
  TRAVEL_DIRECTIONS,
  TRAVEL_MODES,
  type AnalysisInput,
  type AnalysisParameters,
  type AnalysisResult,
  type CategoryCount,
  type IsochroneGenerateRequest,
  type GeoJsonMultiPolygon,
  type LatLng,
  type PlacesAggregateCountRequest,
  type PlacesPolygon,
  type UrbanCategory,
} from "./types";

export const ISOCHRONES_ENDPOINT =
  "https://isochrones.googleapis.com/v1/isochrones:generate";
export const PLACES_AGGREGATE_ENDPOINT =
  "https://areainsights.googleapis.com/v1:computeInsights";

type GoogleService = "Isochrones" | "Places Aggregate";
type JsonRecord = Record<string, unknown>;

export interface GoogleRequestOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class GoogleMapsApiError extends Error {
  readonly service: GoogleService;
  readonly httpStatus: number;
  readonly apiStatus?: string;

  constructor(
    service: GoogleService,
    httpStatus: number,
    message: string,
    apiStatus?: string,
  ) {
    super(message);
    this.name = "GoogleMapsApiError";
    this.service = service;
    this.httpStatus = httpStatus;
    this.apiStatus = apiStatus;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertApiKey(apiKey: string): void {
  if (apiKey.trim().length === 0) {
    throw new Error("A server-side Google Maps API key is required.");
  }
}

function redactSecret(value: string, secret: string): string {
  if (secret.length === 0) {
    return value;
  }
  return value.split(secret).join("[REDACTED]");
}

function validateLatLng({ latitude, longitude }: LatLng): void {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new RangeError("Latitude must be a number in [-90, 90].");
  }
  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RangeError("Longitude must be a number in [-180, 180].");
  }
}

function normalizePlaceResource(placeId: string): string {
  const trimmed = placeId.trim();
  if (trimmed.length === 0) {
    throw new RangeError("placeId cannot be empty.");
  }
  return trimmed.startsWith("places/") ? trimmed : `places/${trimmed}`;
}

export function resolveAnalysisParameters(
  input: AnalysisInput,
): AnalysisParameters {
  const parameters: AnalysisParameters = {
    travelDurationSeconds: input.travelDurationSeconds ?? 900,
    travelMode: input.travelMode ?? "WALK",
    travelDirection: input.travelDirection ?? "FROM",
    routingPreference:
      input.routingPreference ?? "TRAFFIC_UNAWARE",
    enableSmoothing: input.enableSmoothing ?? false,
    polygonFidelity: input.polygonFidelity ?? "MEDIUM",
  };

  if (!TRAVEL_MODES.includes(parameters.travelMode)) {
    throw new RangeError(`Unsupported travel mode "${parameters.travelMode}".`);
  }
  if (!TRAVEL_DIRECTIONS.includes(parameters.travelDirection)) {
    throw new RangeError(
      `Unsupported travel direction "${parameters.travelDirection}".`,
    );
  }
  if (!ROUTING_PREFERENCES.includes(parameters.routingPreference)) {
    throw new RangeError(
      `Unsupported routing preference "${parameters.routingPreference}".`,
    );
  }
  if (!POLYGON_FIDELITIES.includes(parameters.polygonFidelity)) {
    throw new RangeError(
      `Unsupported polygon fidelity "${parameters.polygonFidelity}".`,
    );
  }
  if (
    !Number.isInteger(parameters.travelDurationSeconds) ||
    parameters.travelDurationSeconds <= 0
  ) {
    throw new RangeError(
      "travelDurationSeconds must be a positive integer.",
    );
  }

  const durationLimit =
    parameters.travelMode === "DRIVE" ? 3_600 : 7_200;
  if (parameters.travelDurationSeconds > durationLimit) {
    throw new RangeError(
      `${parameters.travelMode} travel duration cannot exceed ${durationLimit} seconds.`,
    );
  }
  if (
    parameters.routingPreference === "TRAFFIC_AWARE" &&
    parameters.travelMode !== "DRIVE"
  ) {
    throw new RangeError(
      "TRAFFIC_AWARE routing is only valid with DRIVE mode.",
    );
  }

  return parameters;
}

export function buildIsochroneRequest(
  input: AnalysisInput,
): IsochroneGenerateRequest {
  const parameters = resolveAnalysisParameters(input);
  const baseRequest = {
    travelDuration: `${parameters.travelDurationSeconds}s`,
    travelMode: parameters.travelMode,
    travelDirection: parameters.travelDirection,
    routingPreference: parameters.routingPreference,
    enableSmoothing: parameters.enableSmoothing,
    polygonFidelity: parameters.polygonFidelity,
  } as const;

  if (input.origin.placeId) {
    return {
      ...baseRequest,
      place: normalizePlaceResource(input.origin.placeId),
    };
  }

  validateLatLng(input.origin);
  return {
    ...baseRequest,
    location: {
      latitude: input.origin.latitude,
      longitude: input.origin.longitude,
    },
  };
}

function assertPlacesPolygon(ring: PlacesPolygon): void {
  const { coordinates } = ring;
  if (
    coordinates.length < 4 ||
    coordinates.length > PLACES_AGGREGATE_MAX_VERTICES
  ) {
    throw new RangeError(
      `Places polygon must contain 4 to ${PLACES_AGGREGATE_MAX_VERTICES} coordinates.`,
    );
  }
  coordinates.forEach(validateLatLng);

  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (
    !last ||
    first.latitude !== last.latitude ||
    first.longitude !== last.longitude
  ) {
    throw new RangeError(
      "Places polygon must be closed with identical first and last coordinates.",
    );
  }
  if (!isCounterClockwisePlacesRing(coordinates)) {
    throw new RangeError(
      "Places polygon exterior ring must be counterclockwise.",
    );
  }
}

export function buildPlacesAggregateCountRequest(
  ring: PlacesPolygon,
  category: UrbanCategory,
): PlacesAggregateCountRequest {
  assertPlacesPolygon(ring);
  if (category.googlePrimaryTypes.length === 0) {
    throw new RangeError(
      `Category "${category.id}" has no Google primary types.`,
    );
  }

  return {
    insights: ["INSIGHT_COUNT"],
    filter: {
      locationFilter: {
        customArea: {
          polygon: {
            coordinates: ring.coordinates,
          },
        },
      },
      typeFilter: {
        includedPrimaryTypes: category.googlePrimaryTypes,
      },
      operatingStatus: ["OPERATING_STATUS_OPERATIONAL"],
    },
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function googleErrorDetails(body: unknown): {
  message: string;
  apiStatus?: string;
} {
  if (!isRecord(body) || !isRecord(body.error)) {
    return {
      message: typeof body === "string" ? body : "Google API request failed.",
    };
  }

  return {
    message:
      typeof body.error.message === "string"
        ? body.error.message
        : "Google API request failed.",
    apiStatus:
      typeof body.error.status === "string"
        ? body.error.status
        : undefined,
  };
}

async function postGoogleJson(
  service: GoogleService,
  endpoint: string,
  body: unknown,
  apiKey: string,
  options: GoogleRequestOptions,
): Promise<unknown> {
  assertApiKey(apiKey);
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Network request failed.";
    throw new GoogleMapsApiError(
      service,
      0,
      redactSecret(rawMessage, apiKey),
    );
  }

  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    const details = googleErrorDetails(responseBody);
    throw new GoogleMapsApiError(
      service,
      response.status,
      redactSecret(details.message, apiKey),
      details.apiStatus,
    );
  }

  return responseBody;
}

function parseIsochroneGeometry(body: unknown): GeoJsonMultiPolygon {
  if (
    !isRecord(body) ||
    !isRecord(body.isochrone) ||
    !isRecord(body.isochrone.geoJson) ||
    body.isochrone.geoJson.type !== "MultiPolygon" ||
    !Array.isArray(body.isochrone.geoJson.coordinates)
  ) {
    throw new GoogleMapsApiError(
      "Isochrones",
      502,
      "Isochrones API returned an invalid MultiPolygon response.",
    );
  }

  const geometry = {
    type: "MultiPolygon",
    coordinates: body.isochrone.geoJson.coordinates,
  } as GeoJsonMultiPolygon;

  // Performs deep coordinate validation at the external boundary.
  normalizeExteriorRings(geometry);
  return geometry;
}

function parseAggregateCount(body: unknown): number {
  if (!isRecord(body)) {
    throw new GoogleMapsApiError(
      "Places Aggregate",
      502,
      "Places Aggregate returned an invalid response.",
    );
  }

  const rawCount = body.count;
  const count =
    typeof rawCount === "number"
      ? rawCount
      : typeof rawCount === "string" && /^\d+$/.test(rawCount)
        ? Number(rawCount)
        : Number.NaN;

  if (
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    throw new GoogleMapsApiError(
      "Places Aggregate",
      502,
      "Places Aggregate returned an invalid count.",
    );
  }

  return count;
}

export async function generateIsochrone(
  input: AnalysisInput,
  apiKey: string,
  options: GoogleRequestOptions = {},
): Promise<GeoJsonMultiPolygon> {
  const request = buildIsochroneRequest(input);
  const body = await postGoogleJson(
    "Isochrones",
    ISOCHRONES_ENDPOINT,
    request,
    apiKey,
    options,
  );
  return parseIsochroneGeometry(body);
}

export async function countPlacesForRing(
  ring: PlacesPolygon,
  category: UrbanCategory,
  apiKey: string,
  options: GoogleRequestOptions = {},
): Promise<number> {
  const request = buildPlacesAggregateCountRequest(ring, category);
  const body = await postGoogleJson(
    "Places Aggregate",
    PLACES_AGGREGATE_ENDPOINT,
    request,
    apiKey,
    options,
  );
  return parseAggregateCount(body);
}

/**
 * Server-only orchestration. The API key is sent only in `X-Goog-Api-Key`;
 * it is never placed in a URL or included in the serializable result.
 */
export async function analyzeOrigin(
  input: AnalysisInput,
  apiKey: string,
  options: GoogleRequestOptions = {},
): Promise<AnalysisResult> {
  assertApiKey(apiKey);
  const parameters = resolveAnalysisParameters(input);
  const isochrone = await generateIsochrone(input, apiKey, options);
  const normalized = normalizeExteriorRings(isochrone);

  const counts: readonly CategoryCount[] = await Promise.all(
    CATEGORIES.map(async (category) => {
      const byRing = await Promise.all(
        normalized.rings.map(async (ring) => ({
          componentIndex: ring.componentIndex,
          count: await countPlacesForRing(
            ring,
            category,
            apiKey,
            options,
          ),
        })),
      );

      return {
        categoryId: category.id,
        count: byRing.reduce(
          (sum, ringCount) => sum + ringCount.count,
          0,
        ),
        byRing,
      };
    }),
  );

  return {
    origin: input.origin,
    parameters,
    isochrone,
    rings: normalized.rings,
    counts,
    totalCount: counts.reduce(
      (sum, categoryCount) => sum + categoryCount.count,
      0,
    ),
    geometryWarnings: normalized.warnings,
  };
}
