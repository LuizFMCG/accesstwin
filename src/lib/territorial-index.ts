import { CATEGORIES } from "./categories";
import { demoAreaKm2, demoCounts } from "./demo";
import { rankProfiles, type RankedProfile } from "./ranking";
import {
  TERRITORIES,
  territoriesInScope,
  type SearchScope,
  type Territory,
} from "./territories";
import type { CategoryId, TravelMode } from "./types";

export const TERRITORIAL_INDEX_VERSION = "demo-2026.07";
export const TERRITORIAL_INDEX_TAXONOMY = "urban-functions-2026.07";

export type IndexedTerritory = {
  id: string;
  territory: Territory;
  counts: Partial<Record<CategoryId, number>>;
  total: number;
  density: number;
  areaKm2: number;
  source: "synthetic" | "google";
  indexedAt: string;
  indexVersion: string;
  taxonomyVersion: string;
};

export type TerritorialSearchResult = RankedProfile<IndexedTerritory>;

function countsRecord(
  counts: readonly { categoryId: CategoryId; count: number }[],
) {
  return Object.fromEntries(
    CATEGORIES.map((category) => [
      category.id,
      counts.find((entry) => entry.categoryId === category.id)?.count ?? 0,
    ]),
  ) as Partial<Record<CategoryId, number>>;
}

/**
 * Zero-cost index used by the product demo. The interface is intentionally the
 * same shape expected from a persisted, periodically refreshed real index.
 */
export function buildDemoTerritorialIndex(
  durationMinutes: number,
  travelMode: TravelMode,
): IndexedTerritory[] {
  const areaKm2 = demoAreaKm2(durationMinutes, travelMode);

  return TERRITORIES.map((territory) => {
    const counts = demoCounts(territory, durationMinutes, travelMode);
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    return {
      id: territory.id,
      territory,
      counts: countsRecord(counts),
      total,
      density: areaKm2 > 0 ? total / areaKm2 : 0,
      areaKm2,
      source: "synthetic" as const,
      indexedAt: "2026-07-25",
      indexVersion: TERRITORIAL_INDEX_VERSION,
      taxonomyVersion: TERRITORIAL_INDEX_TAXONOMY,
    };
  });
}

export function searchTerritorialIndex(
  reference: IndexedTerritory,
  index: readonly IndexedTerritory[],
  scope: SearchScope,
): TerritorialSearchResult[] {
  const allowed = new Set(
    territoriesInScope(reference.territory, scope).map(
      (territory) => territory.id,
    ),
  );
  return rankProfiles(
    reference,
    index.filter((candidate) => allowed.has(candidate.id)),
  );
}
