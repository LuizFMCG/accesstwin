import { describe, expect, it } from "vitest";

import {
  GeometryValidationError,
  isCounterClockwisePlacesRing,
  normalizeExteriorRings,
  PLACES_AGGREGATE_MAX_VERTICES,
} from "../src/lib/geo";
import type {
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
  GeoJsonPosition,
} from "../src/lib/types";

describe("normalizeExteriorRings", () => {
  it("closes a Polygon, reverses clockwise winding, and swaps coordinate shape", () => {
    const polygon: GeoJsonPolygon = {
      type: "Polygon",
      coordinates: [
        [
          [-51.23, -30.04],
          [-51.23, -30.02],
          [-51.20, -30.02],
          [-51.20, -30.04],
        ],
      ],
    };

    const result = normalizeExteriorRings(polygon);
    const ring = result.rings[0];

    expect(result.inputType).toBe("Polygon");
    expect(result.hadHoles).toBe(false);
    expect(ring.coordinates).toHaveLength(5);
    expect(ring.coordinates[0]).toEqual(ring.coordinates.at(-1));
    expect(isCounterClockwisePlacesRing(ring.coordinates)).toBe(true);
    expect(ring.coordinates).toContainEqual({
      latitude: -30.04,
      longitude: -51.23,
    });
  });

  it("preserves MultiPolygon components and reports omitted holes", () => {
    const geometry: GeoJsonMultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
          [
            [0.5, 0.5],
            [0.5, 1],
            [1, 1],
            [1, 0.5],
            [0.5, 0.5],
          ],
        ],
        [
          [
            [3, 0],
            [4, 0],
            [4, 1],
            [3, 1],
            [3, 0],
          ],
        ],
      ],
    };

    const result = normalizeExteriorRings(geometry);

    expect(result.rings).toHaveLength(2);
    expect(result.rings.map((ring) => ring.componentIndex)).toEqual([0, 1]);
    expect(result.hadHoles).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["MULTIPLE_COMPONENTS", "HOLES_DROPPED"]),
    );
    expect(
      result.rings.every((ring) =>
        isCounterClockwisePlacesRing(ring.coordinates),
      ),
    ).toBe(true);
  });

  it("reduces large rings to the Places Aggregate 7000-coordinate limit", () => {
    const openRing: GeoJsonPosition[] = Array.from(
      { length: 7_100 },
      (_, index) => {
        const angle = (index / 7_100) * Math.PI * 2;
        return [Math.cos(angle), Math.sin(angle)];
      },
    );
    const polygon: GeoJsonPolygon = {
      type: "Polygon",
      coordinates: [[...openRing, openRing[0]]],
    };

    const result = normalizeExteriorRings(polygon);
    const ring = result.rings[0];

    expect(ring.coordinates).toHaveLength(
      PLACES_AGGREGATE_MAX_VERTICES,
    );
    expect(ring.coordinates[0]).toEqual(ring.coordinates.at(-1));
    expect(ring.simplified).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "VERTEX_LIMIT_SIMPLIFIED" }),
    );
  });

  it("reports antimeridian winding limitations", () => {
    const polygon: GeoJsonPolygon = {
      type: "Polygon",
      coordinates: [
        [
          [179, -10],
          [-179, -10],
          [-179, 10],
          [179, 10],
          [179, -10],
        ],
      ],
    };

    const result = normalizeExteriorRings(polygon);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "ANTIMERIDIAN_APPROXIMATION" }),
    );
    expect(isCounterClockwisePlacesRing(
      result.rings[0].coordinates,
    )).toBe(true);
  });

  it("rejects degenerate or non-consecutively duplicated rings", () => {
    expect(() =>
      normalizeExteriorRings({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [0, 0],
            [0, 1],
            [0, 0],
          ],
        ],
      }),
    ).toThrow(GeometryValidationError);

    expect(() =>
      normalizeExteriorRings({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [2, 0],
            [0, 0],
          ],
        ],
      }),
    ).toThrow(/zero or indeterminate area/);
  });
});
