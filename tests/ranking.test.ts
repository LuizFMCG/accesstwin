import { describe, expect, it } from "vitest";
import { rankProfiles } from "../src/lib/ranking";

const reference = {
  id: "reference",
  counts: { food_drink: 50, shopping_supply: 50 },
  total: 100,
  density: 100,
};

describe("rankProfiles", () => {
  it("ranks the closest composition first", () => {
    const ranked = rankProfiles(reference, [
      {
        id: "different",
        counts: { food_drink: 100, shopping_supply: 0 },
        total: 100,
        density: 100,
      },
      {
        id: "twin",
        counts: { food_drink: 25, shopping_supply: 25 },
        total: 50,
        density: 100,
      },
    ]);

    expect(ranked[0].id).toBe("twin");
    expect(ranked[0].similarity).toBeCloseTo(100);
    expect(ranked[0].rank).toBe(1);
  });

  it("keeps Jensen-Shannon composition as the primary ranking", () => {
    const ranked = rankProfiles(reference, [
      {
        id: "same-mix-other-scale",
        counts: { food_drink: 5, shopping_supply: 5 },
        total: 10,
        density: 10,
      },
      {
        id: "other-mix-same-scale",
        counts: { food_drink: 75, shopping_supply: 25 },
        total: 100,
        density: 100,
      },
    ]);

    expect(ranked[0].id).toBe("same-mix-other-scale");
    expect(ranked[0].similarity).toBeCloseTo(100);
  });

  it("does not let density overturn a better composition match", () => {
    const ranked = rankProfiles(reference, [
      {
        id: "exact-mix-different-density",
        counts: { food_drink: 10, shopping_supply: 10 },
        total: 20,
        density: 1,
      },
      {
        id: "close-mix-same-density",
        counts: { food_drink: 52, shopping_supply: 48 },
        total: 100,
        density: 100,
      },
    ]);

    expect(ranked[0].id).toBe("exact-mix-different-density");
    expect(ranked[0].combinedScore).toBeLessThan(
      ranked[1].combinedScore,
    );
  });

  it("places insufficient profiles after publishable results", () => {
    const ranked = rankProfiles(reference, [
      {
        id: "tiny-perfect",
        counts: { food_drink: 4, shopping_supply: 4 },
        total: 8,
        density: 100,
      },
      {
        id: "valid-close",
        counts: { food_drink: 55, shopping_supply: 45 },
        total: 100,
        density: 100,
      },
    ]);

    expect(ranked[0].id).toBe("valid-close");
    expect(ranked[1].publishable).toBe(false);
  });
});
