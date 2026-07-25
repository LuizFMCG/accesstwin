import { describe, expect, it } from "vitest";

import { compareProfiles } from "../src/lib/similarity";
import type { CategoryId, CategoryProfile } from "../src/lib/types";

function profile(
  values: Partial<Record<CategoryId, number>>,
): CategoryProfile {
  return values;
}

describe("compareProfiles", () => {
  it("returns 1 for identical compositions", () => {
    const result = compareProfiles(
      profile({ food_drink: 20, health_wellbeing: 30 }),
      profile({ food_drink: 20, health_wellbeing: 30 }),
    );

    expect(result.similarity).toBeCloseTo(1, 14);
    expect(result.distance).toBeCloseTo(0, 14);
    expect(result.divergence).toBeCloseTo(0, 14);
    expect(result.contributions.every(
      (item) => item.jsContribution === 0,
    )).toBe(true);
  });

  it("is invariant to profile scale", () => {
    const result = compareProfiles(
      profile({ food_drink: 20, mobility_automotive: 30 }),
      profile({ food_drink: 200, mobility_automotive: 300 }),
    );

    expect(result.similarity).toBeCloseTo(1, 14);
  });

  it("returns 0 for disjoint one-hot profiles", () => {
    const result = compareProfiles(
      profile({ food_drink: 20 }),
      profile({ civic_community: 20 }),
    );

    expect(result.divergence).toBeCloseTo(1, 14);
    expect(result.distance).toBeCloseTo(1, 14);
    expect(result.similarity).toBeCloseTo(0, 14);
  });

  it("is symmetric and its contributions sum to JSD", () => {
    const a = profile({
      food_drink: 30,
      health_wellbeing: 10,
      mobility_automotive: 10,
    });
    const b = profile({
      food_drink: 10,
      health_wellbeing: 10,
      civic_community: 30,
    });
    const forward = compareProfiles(a, b);
    const reverse = compareProfiles(b, a);

    expect(forward.similarity).toBeCloseTo(
      reverse.similarity as number,
      14,
    );
    expect(forward.divergence).toBeCloseTo(
      reverse.divergence as number,
      14,
    );
    expect(
      forward.contributions.reduce(
        (sum, item) => sum + item.jsContribution,
        0,
      ),
    ).toBeCloseTo(forward.divergence as number, 14);
    expect(
      forward.contributions.reduce(
        (sum, item) => sum + item.divergenceShare,
        0,
      ),
    ).toBeCloseTo(1, 14);

    for (const contribution of forward.contributions) {
      const swapped = reverse.contributions.find(
        (item) => item.categoryId === contribution.categoryId,
      );
      expect(swapped?.jsContribution).toBeCloseTo(
        contribution.jsContribution,
        14,
      );
    }
  });

  it("returns no score for an empty profile and exposes base guardrails", () => {
    const empty = compareProfiles(
      profile({}),
      profile({ food_drink: 5 }),
    );
    const small = compareProfiles(
      profile({ food_drink: 9 }),
      profile({ food_drink: 20 }),
    );
    const low = compareProfiles(
      profile({ food_drink: 10 }),
      profile({ food_drink: 19 }),
    );

    expect(empty.similarity).toBeNull();
    expect(empty.warnings).toContain("EMPTY_PROFILE");
    expect(small.publishable).toBe(false);
    expect(small.confidence).toBe("INSUFFICIENT_BASE");
    expect(low.publishable).toBe(true);
    expect(low.confidence).toBe("LOW_BASE");
  });

  it("rejects invalid counts and duplicate category entries", () => {
    expect(() =>
      compareProfiles(
        profile({ food_drink: -1 }),
        profile({ food_drink: 1 }),
      ),
    ).toThrow(/non-negative integer/);

    expect(() =>
      compareProfiles(
        [
          { categoryId: "food_drink", count: 1, byRing: [] },
          { categoryId: "food_drink", count: 2, byRing: [] },
        ],
        profile({ food_drink: 1 }),
      ),
    ).toThrow(/Duplicate category/);
  });
});
