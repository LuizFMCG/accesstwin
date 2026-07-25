import { describe, expect, it } from "vitest";

import {
  ALL_GOOGLE_PRIMARY_TYPES,
  CATEGORIES,
  GOOGLE_TABLE_A_SNAPSHOT,
} from "../src/lib/categories";
import { CATEGORY_IDS } from "../src/lib/types";

describe("urban category taxonomy", () => {
  it("defines exactly the eight product categories in stable order", () => {
    expect(CATEGORIES.map((category) => category.id)).toEqual(
      CATEGORY_IDS,
    );
    expect(CATEGORIES).toHaveLength(8);
    expect(GOOGLE_TABLE_A_SNAPSHOT).toBe("2026-07-20");
  });

  it("uses non-empty, unique Google Table A type identifiers", () => {
    const uniqueTypes = new Set(ALL_GOOGLE_PRIMARY_TYPES);

    expect(uniqueTypes.size).toBe(ALL_GOOGLE_PRIMARY_TYPES.length);
    for (const category of CATEGORIES) {
      expect(category.googlePrimaryTypes.length).toBeGreaterThan(0);
      for (const placeType of category.googlePrimaryTypes) {
        expect(placeType).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it("contains representative current Table A types", () => {
    expect(CATEGORIES[0].googlePrimaryTypes).toContain("restaurant");
    expect(CATEGORIES[1].googlePrimaryTypes).toContain("supermarket");
    expect(CATEGORIES[2].googlePrimaryTypes).toContain("medical_clinic");
    expect(CATEGORIES[3].googlePrimaryTypes).toContain("school");
    expect(CATEGORIES[4].googlePrimaryTypes).toContain("park");
    expect(CATEGORIES[5].googlePrimaryTypes).toContain("transit_station");
    expect(CATEGORIES[6].googlePrimaryTypes).toContain("coworking_space");
    expect(CATEGORIES[7].googlePrimaryTypes).toContain("city_hall");
  });
});
