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

  it("uses density only as a secondary signal", () => {
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
});
