import type {
  CategoryId,
  SimilarityConfidence,
} from "./types";
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
  /**
   * Kept as an explicit field for clients that want to present an optional
   * composition + intensity view. It never changes the primary rank.
   */
  combinedScore: number;
  confidence: SimilarityConfidence;
  publishable: boolean;
  warnings: readonly string[];
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
        confidence: comparison.confidence,
        publishable: comparison.publishable,
        warnings: comparison.warnings,
        leadingDriver: [...comparison.contributions].sort(
          (left, right) => right.jsContribution - left.jsContribution,
        )[0]?.categoryId,
      };
    })
    .sort(
      (left, right) =>
        Number(right.publishable) - Number(left.publishable) ||
        right.similarity - left.similarity ||
        right.scaleSimilarity - left.scaleSimilarity ||
        left.id.localeCompare(right.id),
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
