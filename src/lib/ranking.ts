import type { CategoryId } from "./types";
import { compareProfiles } from "./similarity";

export type RankableProfile = {
  id: string;
  counts: Readonly<Partial<Record<CategoryId, number>>>;
  total: number;
  density: number;
};

export type RankedProfile<T extends RankableProfile> = T & {
  rank: number;
  similarity: number;
  distance: number;
  scaleSimilarity: number;
  combinedScore: number;
  leadingDriver?: CategoryId;
};

export function rankProfiles<T extends RankableProfile>(
  reference: RankableProfile,
  candidates: readonly T[],
): RankedProfile<T>[] {
  return candidates
    .map((candidate) => {
      const comparison = compareProfiles(reference.counts, candidate.counts);
      const similarity = (comparison.similarity ?? 0) * 100;
      const scaleSimilarity =
        100 *
        Math.exp(
          -Math.abs(
            Math.log((candidate.density + 1) / (reference.density + 1)),
          ),
        );

      return {
        ...candidate,
        rank: 0,
        similarity,
        distance: comparison.distance ?? 1,
        scaleSimilarity,
        combinedScore: similarity * 0.82 + scaleSimilarity * 0.18,
        leadingDriver: [...comparison.contributions].sort(
          (left, right) => right.jsContribution - left.jsContribution,
        )[0]?.categoryId,
      };
    })
    .sort(
      (left, right) =>
        right.combinedScore - left.combinedScore ||
        right.similarity - left.similarity ||
        left.id.localeCompare(right.id),
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
