import { describe, expect, it } from "vitest";
import {
  buildDemoTerritorialIndex,
  searchTerritorialIndex,
} from "../src/lib/territorial-index";

describe("territorial index", () => {
  it("builds versioned, complete profiles for every catalog territory", () => {
    const index = buildDemoTerritorialIndex(15, "WALK");

    expect(index.length).toBeGreaterThan(20);
    expect(index.every((entry) => entry.total > 0)).toBe(true);
    expect(index.every((entry) => entry.indexVersion.length > 0)).toBe(true);
  });

  it("searches the whole selected scope and excludes the reference", () => {
    const index = buildDemoTerritorialIndex(15, "WALK");
    const reference = index.find((entry) => entry.id === "cidade-baixa");
    expect(reference).toBeDefined();

    const ranked = searchTerritorialIndex(reference!, index, "country");

    expect(ranked.some((entry) => entry.id === reference!.id)).toBe(false);
    expect(ranked.every((entry) => entry.territory.country === "Brasil")).toBe(
      true,
    );
    expect(ranked[0].rank).toBe(1);
  });
});
