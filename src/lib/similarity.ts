import {
  CATEGORY_IDS,
  type CategoryCount,
  type CategoryId,
  type CategoryProfile,
  type SimilarityContribution,
  type SimilarityDirection,
  type SimilarityResult,
} from "./types";

const EPSILON = 1e-15;
const CATEGORY_ID_SET = new Set<string>(CATEGORY_IDS);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function assertCount(value: number, categoryId: CategoryId): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new RangeError(
      `Count for category "${categoryId}" must be a finite, non-negative integer.`,
    );
  }
}

function isCategoryCountArray(
  profile: CategoryProfile,
): profile is readonly CategoryCount[] {
  return Array.isArray(profile);
}

function normalizeProfile(
  profile: CategoryProfile,
): Readonly<Record<CategoryId, number>> {
  const normalized = Object.fromEntries(
    CATEGORY_IDS.map((categoryId) => [categoryId, 0]),
  ) as Record<CategoryId, number>;

  if (isCategoryCountArray(profile)) {
    const seen = new Set<CategoryId>();

    for (const entry of profile) {
      if (!CATEGORY_ID_SET.has(entry.categoryId)) {
        throw new RangeError(`Unknown category "${entry.categoryId}".`);
      }
      if (seen.has(entry.categoryId)) {
        throw new RangeError(
          `Duplicate category "${entry.categoryId}" in profile.`,
        );
      }

      assertCount(entry.count, entry.categoryId);
      normalized[entry.categoryId] = entry.count;
      seen.add(entry.categoryId);
    }
  } else {
    for (const categoryId of CATEGORY_IDS) {
      const count = profile[categoryId] ?? 0;
      assertCount(count, categoryId);
      normalized[categoryId] = count;
    }
  }

  return normalized;
}

function klTerm(probability: number, midpoint: number): number {
  if (probability === 0) {
    return 0;
  }
  return probability * Math.log2(probability / midpoint);
}

function directionFor(
  shareA: number,
  shareB: number,
): SimilarityDirection {
  if (Math.abs(shareA - shareB) <= EPSILON) {
    return "EQUAL";
  }
  return shareA > shareB ? "A_HIGHER" : "B_HIGHER";
}

/**
 * Compares the composition of two eight-category urban profiles.
 *
 * The returned score is `1 - sqrt(JSD_2)`, so it is symmetric, invariant to
 * multiplying either profile by a positive constant, and bounded by 0 and 1.
 * Absolute totals are returned separately and must not be folded into this
 * compositional score.
 */
export function compareProfiles(
  profileA: CategoryProfile,
  profileB: CategoryProfile,
): SimilarityResult {
  const countsA = normalizeProfile(profileA);
  const countsB = normalizeProfile(profileB);
  const totalA = CATEGORY_IDS.reduce(
    (sum, categoryId) => sum + countsA[categoryId],
    0,
  );
  const totalB = CATEGORY_IDS.reduce(
    (sum, categoryId) => sum + countsB[categoryId],
    0,
  );

  const hasEmptyProfile = totalA === 0 || totalB === 0;
  const rawContributions = CATEGORY_IDS.map((categoryId) => {
    const shareA = totalA === 0 ? 0 : countsA[categoryId] / totalA;
    const shareB = totalB === 0 ? 0 : countsB[categoryId] / totalB;
    const midpoint = (shareA + shareB) / 2;
    const jsContribution =
      midpoint === 0
        ? 0
        : Math.max(
            0,
            0.5 *
              (klTerm(shareA, midpoint) + klTerm(shareB, midpoint)),
          );

    return {
      categoryId,
      countA: countsA[categoryId],
      countB: countsB[categoryId],
      shareA,
      shareB,
      jsContribution,
      direction: directionFor(shareA, shareB),
    };
  });

  const divergence = hasEmptyProfile
    ? null
    : clamp01(
        rawContributions.reduce(
          (sum, contribution) => sum + contribution.jsContribution,
          0,
        ),
      );
  const distance = divergence === null ? null : Math.sqrt(divergence);
  const similarity = distance === null ? null : clamp01(1 - distance);

  const contributions: readonly SimilarityContribution[] =
    rawContributions.map((contribution) => ({
      ...contribution,
      divergenceShare:
        divergence !== null && divergence > EPSILON
          ? contribution.jsContribution / divergence
          : 0,
    }));

  const smallestBase = Math.min(totalA, totalB);
  const confidence =
    smallestBase < 10
      ? "INSUFFICIENT_BASE"
      : smallestBase < 20
        ? "LOW_BASE"
        : "NORMAL";
  const publishable = !hasEmptyProfile && smallestBase >= 10;
  const warnings: string[] = [];

  if (hasEmptyProfile) {
    warnings.push("EMPTY_PROFILE");
  }
  if (smallestBase < 10) {
    warnings.push("INSUFFICIENT_BASE");
  } else if (smallestBase < 20) {
    warnings.push("LOW_BASE");
  }

  return {
    similarity,
    divergence,
    distance,
    totalA,
    totalB,
    confidence,
    publishable,
    warnings,
    contributions,
  };
}
