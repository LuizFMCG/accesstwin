import { CATEGORIES } from "./categories";
import type {
  CategoryCount,
  GeoJsonMultiPolygon,
  Origin,
  TravelMode,
} from "./types";

const MODE_SPEED_KM_PER_MINUTE: Record<TravelMode, number> = {
  WALK: 0.075,
  BICYCLE: 0.22,
  DRIVE: 0.52,
};

const BASE_COUNTS = [42, 28, 21, 13, 24, 16, 31, 9] as const;

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number, index: number): number {
  let value = seed + Math.imul(index + 1, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_295;
}

function radiusFor(durationMinutes: number, travelMode: TravelMode): number {
  // A network isochrone is not a circle. The 0.72 factor makes the synthetic
  // geometry visibly plausible while keeping the demo explicitly non-empirical.
  return MODE_SPEED_KM_PER_MINUTE[travelMode] * durationMinutes * 0.72;
}

export function demoGeometry(
  origin: Origin,
  durationMinutes: number,
  travelMode: TravelMode,
): GeoJsonMultiPolygon {
  const radiusKm = radiusFor(durationMinutes, travelMode);
  const latitudeRadians = (origin.latitude * Math.PI) / 180;
  const latitudeScale = 1 / 110.574;
  const longitudeScale = 1 / (111.32 * Math.max(0.2, Math.cos(latitudeRadians)));
  const vertexCount = 72;
  const seed = stableHash(
    `${origin.label}:${origin.latitude.toFixed(4)}:${origin.longitude.toFixed(4)}`,
  );

  const ring = Array.from({ length: vertexCount }, (_, index) => {
    const angle = (index / vertexCount) * Math.PI * 2;
    const ripple =
      0.86 +
      seededUnit(seed, index) * 0.2 +
      Math.sin(angle * 3 + (seed % 17)) * 0.04;
    const radius = radiusKm * ripple;
    return [
      origin.longitude + Math.cos(angle) * radius * longitudeScale,
      origin.latitude + Math.sin(angle) * radius * latitudeScale,
    ] as const;
  });

  return {
    type: "MultiPolygon",
    coordinates: [[[...ring, ring[0]]]],
  };
}

export function demoCounts(
  origin: Origin,
  durationMinutes: number,
  travelMode: TravelMode,
): readonly CategoryCount[] {
  const seed = stableHash(
    `${origin.label}:${origin.latitude.toFixed(3)}:${origin.longitude.toFixed(3)}`,
  );
  const durationScale = Math.pow(durationMinutes / 15, 1.45);
  const modeScale: Record<TravelMode, number> = {
    WALK: 1,
    BICYCLE: 2.2,
    DRIVE: 4.1,
  };

  return CATEGORIES.map((category, index) => {
    const localCharacter = 0.58 + seededUnit(seed, index) * 0.88;
    const count = Math.max(
      0,
      Math.round(
        BASE_COUNTS[index] *
          localCharacter *
          durationScale *
          modeScale[travelMode],
      ),
    );
    return {
      categoryId: category.id,
      count,
      byRing: [{ componentIndex: 0, count }],
    };
  });
}

export function demoAreaKm2(
  durationMinutes: number,
  travelMode: TravelMode,
): number {
  const radiusKm = radiusFor(durationMinutes, travelMode);
  return Math.PI * radiusKm * radiusKm * 0.86;
}
