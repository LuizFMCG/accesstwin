import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/categories";
import { demoAreaKm2, demoCounts, demoGeometry } from "@/lib/demo";
import { analyzeOrigin, GoogleMapsApiError } from "@/lib/google";
import type {
  CategoryCount,
  GeoJsonMultiPolygon,
  Origin,
  TravelMode,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CachedAnalysis = {
  expiresAt: number;
  payload: Record<string, unknown>;
};

type RateWindow = {
  count: number;
  resetsAt: number;
};

const runtimeState = globalThis as typeof globalThis & {
  __accessTwinAnalysisCache?: Map<string, CachedAnalysis>;
  __accessTwinRateWindows?: Map<string, RateWindow>;
};

const analysisCache =
  runtimeState.__accessTwinAnalysisCache ??
  (runtimeState.__accessTwinAnalysisCache = new Map());
const rateWindows =
  runtimeState.__accessTwinRateWindows ??
  (runtimeState.__accessTwinRateWindows = new Map());
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 12;

const requestSchema = z
  .object({
    origin: z.object({
      label: z.string().trim().min(1).max(160),
      address: z.string().trim().max(300).optional(),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      placeId: z.string().trim().min(1).max(300).optional(),
    }),
    durationMinutes: z.number().int().min(1).max(120),
    travelMode: z.enum(["WALK", "BICYCLE", "DRIVE"]),
    demo: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.travelMode === "DRIVE" && value.durationMinutes > 60) {
      context.addIssue({
        code: "custom",
        path: ["durationMinutes"],
        message: "O limite para carro é de 60 minutos.",
      });
    }
  });

type UiOrigin = Origin & { address?: string };

function sphericalRingArea(ring: readonly (readonly number[])[]): number {
  if (ring.length < 4) return 0;
  const earthRadiusMetres = 6_378_137;
  let accumulator = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [longitudeA, latitudeA] = ring[index];
    const [longitudeB, latitudeB] = ring[index + 1];
    const lonDelta = ((longitudeB - longitudeA) * Math.PI) / 180;
    const latA = (latitudeA * Math.PI) / 180;
    const latB = (latitudeB * Math.PI) / 180;
    accumulator += lonDelta * (2 + Math.sin(latA) + Math.sin(latB));
  }

  return Math.abs((accumulator * earthRadiusMetres * earthRadiusMetres) / 2);
}

function geometryAreaKm2(geometry: GeoJsonMultiPolygon): number {
  const squareMetres = geometry.coordinates.reduce((total, polygon) => {
    const exterior = polygon[0] ? sphericalRingArea(polygon[0]) : 0;
    const holes = polygon
      .slice(1)
      .reduce((sum, ring) => sum + sphericalRingArea(ring), 0);
    return total + Math.max(0, exterior - holes);
  }, 0);
  return squareMetres / 1_000_000;
}

function toUiCategories(counts: readonly CategoryCount[]) {
  const countsById = new Map(
    counts.map((category) => [category.categoryId, category.count]),
  );
  return CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    color: category.color,
    count: countsById.get(category.id) ?? 0,
  }));
}

function responseHeaders(cacheStatus = "BYPASS") {
  return {
    "Cache-Control": "no-store, max-age=0",
    "X-AccessTwin-Cache": cacheStatus,
  };
}

function analysisCacheKey(input: z.infer<typeof requestSchema>) {
  const location = input.origin.placeId
    ? `place:${input.origin.placeId}`
    : `point:${input.origin.latitude.toFixed(5)},${input.origin.longitude.toFixed(5)}`;
  return `${location}:${input.travelMode}:${input.durationMinutes}`;
}

function requestClientId(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous"
  );
}

function consumeRateLimit(clientId: string) {
  const now = Date.now();
  const current = rateWindows.get(clientId);
  if (!current || current.resetsAt <= now) {
    rateWindows.set(clientId, { count: 1, resetsAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }
  if (current.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  current.count += 1;
  return { allowed: true, remaining: RATE_LIMIT - current.count };
}

function publicGoogleError(error: GoogleMapsApiError) {
  if (error.httpStatus === 429) {
    return {
      status: 429,
      message:
        "A cota do Google Maps foi atingida. Aguarde um pouco ou use a demonstração.",
    };
  }
  if (error.httpStatus === 401 || error.httpStatus === 403) {
    return {
      status: 502,
      message:
        "O Google Maps recusou a credencial do servidor. Verifique APIs, faturamento e restrições da chave.",
    };
  }
  if (error.httpStatus === 400) {
    return {
      status: 422,
      message:
        "O Google não conseguiu analisar essa área com os parâmetros escolhidos.",
    };
  }
  return {
    status: 502,
    message:
      "As APIs geoespaciais do Google não responderam como esperado. Tente novamente ou use a demonstração.",
  };
}

export async function POST(request: Request) {
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch (error) {
    const details =
      error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join(" ")
        : "JSON inválido.";
    return NextResponse.json(
      { error: `Parâmetros inválidos. ${details}` },
      { status: 400, headers: responseHeaders() },
    );
  }

  const origin = input.origin as UiOrigin;
  const travelMode = input.travelMode as TravelMode;

  if (input.demo) {
    const counts = demoCounts(
      origin,
      input.durationMinutes,
      travelMode,
    );
    const total = counts.reduce((sum, category) => sum + category.count, 0);
    const areaKm2 = demoAreaKm2(input.durationMinutes, travelMode);
    return NextResponse.json(
      {
        origin,
        durationMinutes: input.durationMinutes,
        travelMode,
        polygon: demoGeometry(origin, input.durationMinutes, travelMode),
        categories: toUiCategories(counts),
        total,
        areaKm2,
        density: areaKm2 > 0 ? total / areaKm2 : 0,
        source: "demo",
        warnings: [
          "Dados sintéticos: servem para explorar a interface e a hipótese, não para descrever esses bairros.",
        ],
        generatedAt: new Date().toISOString(),
      },
      { headers: responseHeaders() },
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "A chave de servidor do Google Maps ainda não está configurada. Use a demonstração ou configure GOOGLE_MAPS_SERVER_API_KEY.",
      },
      { status: 503, headers: responseHeaders() },
    );
  }

  const cacheKey = analysisCacheKey(input);
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, {
      headers: responseHeaders("HIT"),
    });
  }
  if (cached) analysisCache.delete(cacheKey);

  const rate = consumeRateLimit(requestClientId(request));
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error:
          "O limite de proteção foi atingido. Aguarde até 10 minutos antes de iniciar outra busca ao vivo.",
      },
      {
        status: 429,
        headers: {
          ...responseHeaders(),
          "Retry-After": "600",
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  try {
    const signal = AbortSignal.timeout(45_000);
    const result = await analyzeOrigin(
      {
        origin,
        travelDurationSeconds: input.durationMinutes * 60,
        travelMode,
        travelDirection: "FROM",
        routingPreference: "TRAFFIC_UNAWARE",
        enableSmoothing: false,
        polygonFidelity: "MEDIUM",
      },
      apiKey,
      { signal },
    );
    const areaKm2 = geometryAreaKm2(result.isochrone);
    const categories = toUiCategories(result.counts);

    const payload = {
      origin,
      durationMinutes: input.durationMinutes,
      travelMode,
      polygon: result.isochrone,
      categories,
      total: result.totalCount,
      areaKm2,
      density: areaKm2 > 0 ? result.totalCount / areaKm2 : 0,
      source: "google",
      warnings: result.geometryWarnings.map((warning) => warning.message),
      generatedAt: new Date().toISOString(),
      taxonomyVersion: "2026-07-20",
      categoryDefinitions: categories.map((category) => ({
        id: category.id,
        label: CATEGORY_BY_ID[category.id].description,
      })),
    };
    analysisCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json(payload, {
      headers: {
        ...responseHeaders("MISS"),
        "X-RateLimit-Limit": String(RATE_LIMIT),
        "X-RateLimit-Remaining": String(rate.remaining),
      },
    });
  } catch (error) {
    if (error instanceof GoogleMapsApiError) {
      const publicError = publicGoogleError(error);
      return NextResponse.json(
        { error: publicError.message },
        { status: publicError.status, headers: responseHeaders() },
      );
    }

    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: timedOut
          ? "A análise excedeu 45 segundos. Tente novamente ou use a demonstração."
          : "Não foi possível concluir a análise geoespacial.",
      },
      { status: timedOut ? 504 : 500, headers: responseHeaders() },
    );
  }
}
