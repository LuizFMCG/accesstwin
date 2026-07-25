import { describe, expect, it, vi } from "vitest";

import { CATEGORIES } from "../src/lib/categories";
import {
  analyzeOrigin,
  buildIsochroneRequest,
  buildPlacesAggregateCountRequest,
  countPlacesForRing,
  generateIsochrone,
  GoogleMapsApiError,
  ISOCHRONES_ENDPOINT,
  PLACES_AGGREGATE_ENDPOINT,
} from "../src/lib/google";
import type {
  AnalysisInput,
  GeoJsonMultiPolygon,
  PlacesPolygon,
} from "../src/lib/types";

const ORIGIN: AnalysisInput["origin"] = {
  label: "Praça da Alfândega",
  latitude: -30.0277,
  longitude: -51.2308,
  placeId: "ChIJ_example",
};

const RING: PlacesPolygon = {
  componentIndex: 0,
  sourceVertexCount: 5,
  simplified: false,
  coordinates: [
    { latitude: -30.04, longitude: -51.23 },
    { latitude: -30.04, longitude: -51.21 },
    { latitude: -30.02, longitude: -51.21 },
    { latitude: -30.02, longitude: -51.23 },
    { latitude: -30.04, longitude: -51.23 },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Google request contracts", () => {
  it("builds the official Isochrones request and uses a Place resource union", () => {
    expect(buildIsochroneRequest({ origin: ORIGIN })).toEqual({
      travelDuration: "900s",
      travelMode: "WALK",
      travelDirection: "FROM",
      routingPreference: "TRAFFIC_UNAWARE",
      enableSmoothing: false,
      polygonFidelity: "MEDIUM",
      place: "places/ChIJ_example",
    });

    expect(
      buildIsochroneRequest({
        origin: { ...ORIGIN, placeId: undefined },
        travelDurationSeconds: 1_800,
        travelMode: "BICYCLE",
      }),
    ).toEqual(
      expect.objectContaining({
        travelDuration: "1800s",
        travelMode: "BICYCLE",
        location: {
          latitude: ORIGIN.latitude,
          longitude: ORIGIN.longitude,
        },
      }),
    );
  });

  it("enforces documented Isochrones duration and traffic limits", () => {
    expect(() =>
      buildIsochroneRequest({
        origin: ORIGIN,
        travelMode: "DRIVE",
        travelDurationSeconds: 3_601,
      }),
    ).toThrow(/cannot exceed 3600/);

    expect(() =>
      buildIsochroneRequest({
        origin: ORIGIN,
        travelMode: "WALK",
        routingPreference: "TRAFFIC_AWARE",
      }),
    ).toThrow(/only valid with DRIVE/);
  });

  it("builds the official Places Aggregate custom-area count request", () => {
    const request = buildPlacesAggregateCountRequest(
      RING,
      CATEGORIES[0],
    );

    expect(request).toEqual({
      insights: ["INSIGHT_COUNT"],
      filter: {
        locationFilter: {
          customArea: {
            polygon: {
              coordinates: RING.coordinates,
            },
          },
        },
        typeFilter: {
          includedPrimaryTypes: CATEGORIES[0].googlePrimaryTypes,
        },
        operatingStatus: ["OPERATING_STATUS_OPERATIONAL"],
      },
    });
  });

  it("accepts canonical string int64 counts and the numeric documentation example", async () => {
    const stringFetch = vi.fn(async () =>
      jsonResponse({ count: "42" }),
    );
    const numberFetch = vi.fn(async () =>
      jsonResponse({ count: 7 }),
    );

    await expect(
      countPlacesForRing(RING, CATEGORIES[0], "server-key", {
        fetchImpl: stringFetch as typeof fetch,
      }),
    ).resolves.toBe(42);
    await expect(
      countPlacesForRing(RING, CATEGORIES[0], "server-key", {
        fetchImpl: numberFetch as typeof fetch,
      }),
    ).resolves.toBe(7);
  });
});

describe("analyzeOrigin", () => {
  it("calls count once per category and exterior ring without exposing the key", async () => {
    const geometry: GeoJsonMultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-51.23, -30.04],
            [-51.21, -30.04],
            [-51.21, -30.02],
            [-51.23, -30.02],
            [-51.23, -30.04],
          ],
        ],
        [
          [
            [-51.20, -30.04],
            [-51.18, -30.04],
            [-51.18, -30.02],
            [-51.20, -30.02],
            [-51.20, -30.04],
          ],
        ],
      ],
    };
    const apiKey = "super-secret-server-key";
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        void _init;
        const endpoint = String(input);
        if (endpoint === ISOCHRONES_ENDPOINT) {
          return jsonResponse({ isochrone: { geoJson: geometry } });
        }
        if (endpoint === PLACES_AGGREGATE_ENDPOINT) {
          return jsonResponse({ count: "1" });
        }
        return jsonResponse({ error: { message: "Unexpected URL" } }, 404);
      },
    );

    const result = await analyzeOrigin(
      { origin: ORIGIN },
      apiKey,
      { fetchImpl: fetchMock as typeof fetch },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1 + CATEGORIES.length * 2);
    expect(result.rings).toHaveLength(2);
    expect(result.counts).toHaveLength(8);
    expect(result.counts.every((category) => category.count === 2)).toBe(
      true,
    );
    expect(result.totalCount).toBe(16);
    expect(result.geometryWarnings).toContainEqual(
      expect.objectContaining({ code: "MULTIPLE_COMPONENTS" }),
    );
    expect(JSON.stringify(result)).not.toContain(apiKey);

    for (const [url, requestInit] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain(apiKey);
      expect(requestInit?.headers).toEqual(
        expect.objectContaining({ "X-Goog-Api-Key": apiKey }),
      );
    }
  });

  it("redacts the key from upstream and network error messages", async () => {
    const apiKey = "never-leak-me";
    const upstreamFailure = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            status: "PERMISSION_DENIED",
            message: `Rejected key ${apiKey}`,
          },
        },
        403,
      ),
    );

    try {
      await generateIsochrone(
        { origin: ORIGIN },
        apiKey,
        { fetchImpl: upstreamFailure as typeof fetch },
      );
      throw new Error("Expected generateIsochrone to reject.");
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleMapsApiError);
      expect(String(error)).not.toContain(apiKey);
      expect(String(error)).toContain("[REDACTED]");
    }
  });
});
