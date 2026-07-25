export const TRAVEL_MODES = ["DRIVE", "BICYCLE", "WALK"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export const TRAVEL_DIRECTIONS = ["FROM", "TO"] as const;
export type TravelDirection = (typeof TRAVEL_DIRECTIONS)[number];

export const ROUTING_PREFERENCES = [
  "TRAFFIC_UNAWARE",
  "TRAFFIC_AWARE",
] as const;
export type RoutingPreference = (typeof ROUTING_PREFERENCES)[number];

export const POLYGON_FIDELITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type PolygonFidelity = (typeof POLYGON_FIDELITIES)[number];

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * An origin selected by the browser autocomplete.
 *
 * Coordinates are retained for rendering. When `placeId` is present the
 * server uses the canonical `places/{place_id}` origin accepted by the
 * Isochrones API; otherwise it sends `latitude`/`longitude`.
 */
export interface Origin extends LatLng {
  label: string;
  placeId?: string;
}

export const CATEGORY_IDS = [
  "food_drink",
  "shopping_supply",
  "health_wellbeing",
  "education_knowledge",
  "culture_leisure_nature",
  "mobility_automotive",
  "services_finance_work",
  "civic_community",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface UrbanCategory {
  id: CategoryId;
  label: string;
  shortLabel: string;
  description: string;
  color: `#${string}`;
  /**
   * Places API (New) Table A primary types. Places Aggregate automatically
   * expands type hierarchies, so the list deliberately favors stable parent
   * types plus independent leaf families.
   */
  googlePrimaryTypes: readonly string[];
}

export type GeoJsonPosition = readonly [
  longitude: number,
  latitude: number,
];
export type GeoJsonLinearRing = readonly GeoJsonPosition[];

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: readonly GeoJsonLinearRing[];
}

export interface GeoJsonMultiPolygon {
  type: "MultiPolygon";
  coordinates: readonly (readonly GeoJsonLinearRing[])[];
}

export type SupportedGeoJsonGeometry =
  | GeoJsonPolygon
  | GeoJsonMultiPolygon;

export const GEOMETRY_WARNING_CODES = [
  "HOLES_DROPPED",
  "MULTIPLE_COMPONENTS",
  "VERTEX_LIMIT_SIMPLIFIED",
  "ANTIMERIDIAN_APPROXIMATION",
] as const;

export type GeometryWarningCode =
  (typeof GEOMETRY_WARNING_CODES)[number];

export interface GeometryWarning {
  code: GeometryWarningCode;
  message: string;
  componentIndex?: number;
}

/**
 * The simplified polygon contract consumed by Places Aggregate.
 * One object represents one exterior ring / one API request.
 */
export interface PlacesPolygon {
  componentIndex: number;
  coordinates: readonly LatLng[];
  sourceVertexCount: number;
  simplified: boolean;
}

export interface NormalizedGeometry {
  rings: readonly PlacesPolygon[];
  warnings: readonly GeometryWarning[];
  hadHoles: boolean;
  inputType: SupportedGeoJsonGeometry["type"];
}

export interface IsochroneGenerateBaseRequest {
  travelDuration: string;
  travelMode: TravelMode;
  travelDirection: TravelDirection;
  routingPreference: RoutingPreference;
  enableSmoothing: boolean;
  polygonFidelity: PolygonFidelity;
}

export type IsochroneGenerateRequest = IsochroneGenerateBaseRequest &
  (
    | {
        location: LatLng;
        place?: never;
      }
    | {
        place: string;
        location?: never;
      }
  );

export interface IsochroneGenerateResponse {
  isochrone: {
    geoJson: GeoJsonMultiPolygon;
  };
}

export interface PlacesAggregateCountRequest {
  insights: readonly ["INSIGHT_COUNT"];
  filter: {
    locationFilter: {
      customArea: {
        polygon: {
          coordinates: readonly LatLng[];
        };
      };
    };
    typeFilter: {
      includedPrimaryTypes: readonly string[];
    };
    operatingStatus: readonly ["OPERATING_STATUS_OPERATIONAL"];
  };
}

/**
 * Protobuf JSON maps int64 to string. A number is tolerated at the boundary
 * because one official documentation example currently renders it as numeric.
 */
export interface PlacesAggregateCountResponse {
  count: string | number;
}

export interface RingCount {
  componentIndex: number;
  count: number;
}

export interface CategoryCount {
  categoryId: CategoryId;
  count: number;
  byRing: readonly RingCount[];
}

export interface AnalysisInput {
  origin: Origin;
  travelDurationSeconds?: number;
  travelMode?: TravelMode;
  travelDirection?: TravelDirection;
  routingPreference?: RoutingPreference;
  enableSmoothing?: boolean;
  polygonFidelity?: PolygonFidelity;
}

export interface AnalysisParameters {
  travelDurationSeconds: number;
  travelMode: TravelMode;
  travelDirection: TravelDirection;
  routingPreference: RoutingPreference;
  enableSmoothing: boolean;
  polygonFidelity: PolygonFidelity;
}

export interface AnalysisResult {
  origin: Origin;
  parameters: AnalysisParameters;
  isochrone: GeoJsonMultiPolygon;
  rings: readonly PlacesPolygon[];
  counts: readonly CategoryCount[];
  totalCount: number;
  geometryWarnings: readonly GeometryWarning[];
}

export type CategoryProfile =
  | readonly CategoryCount[]
  | Readonly<Partial<Record<CategoryId, number>>>;

export type SimilarityDirection =
  | "A_HIGHER"
  | "B_HIGHER"
  | "EQUAL";

export interface SimilarityContribution {
  categoryId: CategoryId;
  countA: number;
  countB: number;
  shareA: number;
  shareB: number;
  /**
   * Additive contribution to Jensen-Shannon divergence, in bits.
   */
  jsContribution: number;
  /**
   * Fraction of total divergence attributable to this category, from 0 to 1.
   */
  divergenceShare: number;
  direction: SimilarityDirection;
}

export type SimilarityConfidence =
  | "INSUFFICIENT_BASE"
  | "LOW_BASE"
  | "NORMAL";

export interface SimilarityResult {
  /**
   * 1 - Jensen-Shannon distance. Null only when either profile has no places.
   */
  similarity: number | null;
  divergence: number | null;
  distance: number | null;
  totalA: number;
  totalB: number;
  confidence: SimilarityConfidence;
  /**
   * Product guardrail: false when either origin has fewer than 10 places.
   * The mathematical score remains available for diagnostics.
   */
  publishable: boolean;
  warnings: readonly string[];
  contributions: readonly SimilarityContribution[];
}
