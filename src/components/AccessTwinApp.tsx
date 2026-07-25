"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/categories";
import { demoAreaKm2, demoCounts, demoGeometry } from "@/lib/demo";
import { loadGoogleMaps } from "@/lib/google-browser";
import { compareProfiles } from "@/lib/similarity";
import type { CategoryId } from "@/lib/types";

type TravelMode = "WALK" | "BICYCLE" | "DRIVE";

type Origin = {
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
  placeId?: string;
};

type CategoryCount = {
  id: string;
  label: string;
  color: string;
  count: number;
};

type GeoGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

type Analysis = {
  origin: Origin;
  durationMinutes: number;
  travelMode: TravelMode;
  polygon: GeoGeometry;
  categories: CategoryCount[];
  total: number;
  areaKm2: number;
  density: number;
  source: "demo" | "google";
  warnings: string[];
  generatedAt: string;
};

type Driver = {
  id: string;
  label: string;
  shareA: number;
  shareB: number;
  contribution: number;
  driverPercent: number;
};

type Comparison = {
  score: number | null;
  distance: number | null;
  divergence: number | null;
  status: "ok" | "low-base" | "insufficient";
  drivers: Driver[];
};

const PRESETS: Origin[] = [
  {
    label: "Cidade Baixa",
    address: "Porto Alegre, RS",
    latitude: -30.0378,
    longitude: -51.2196,
  },
  {
    label: "Batel",
    address: "Curitiba, PR",
    latitude: -25.4411,
    longitude: -49.2857,
  },
  {
    label: "Centro Histórico",
    address: "Porto Alegre, RS",
    latitude: -30.0303,
    longitude: -51.2287,
  },
  {
    label: "Pocitos",
    address: "Montevidéu, Uruguai",
    latitude: -34.9098,
    longitude: -56.1506,
  },
  {
    label: "Palermo",
    address: "Buenos Aires, Argentina",
    latitude: -34.578,
    longitude: -58.426,
  },
];

const MODE_LABELS: Record<TravelMode, { label: string; icon: string }> = {
  WALK: { label: "A pé", icon: "↟" },
  BICYCLE: { label: "Bicicleta", icon: "◇" },
  DRIVE: { label: "Carro", icon: "→" },
};

const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

function calculateComparison(a: Analysis, b: Analysis): Comparison {
  const profileA: Partial<Record<CategoryId, number>> = {};
  const profileB: Partial<Record<CategoryId, number>> = {};
  for (const category of a.categories) {
    profileA[category.id as CategoryId] = category.count;
  }
  for (const category of b.categories) {
    profileB[category.id as CategoryId] = category.count;
  }

  const result = compareProfiles(profileA, profileB);
  const status =
    result.confidence === "INSUFFICIENT_BASE"
      ? "insufficient"
      : result.confidence === "LOW_BASE"
        ? "low-base"
        : "ok";
  const drivers = result.contributions
    .map((contribution) => ({
      id: contribution.categoryId,
      label: CATEGORY_BY_ID[contribution.categoryId].label,
      shareA: contribution.shareA,
      shareB: contribution.shareB,
      contribution: contribution.jsContribution,
      driverPercent: contribution.divergenceShare * 100,
    }))
    .sort((left, right) => right.contribution - left.contribution);

  return {
    score:
      result.publishable && result.similarity !== null
        ? result.similarity * 100
        : null,
    distance: result.distance,
    divergence: result.divergence,
    status,
    drivers,
  };
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir a comparação.";
}

function initialDemoAnalysis(
  origin: Origin,
  durationMinutes = 15,
  travelMode: TravelMode = "WALK",
): Analysis {
  const counts = demoCounts(origin, durationMinutes, travelMode);
  const countById = new Map(
    counts.map((category) => [category.categoryId, category.count]),
  );
  const categories = CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    color: category.color,
    count: countById.get(category.id) ?? 0,
  }));
  const total = categories.reduce((sum, category) => sum + category.count, 0);
  const areaKm2 = demoAreaKm2(durationMinutes, travelMode);

  return {
    origin,
    durationMinutes,
    travelMode,
    polygon: demoGeometry(origin, durationMinutes, travelMode),
    categories,
    total,
    areaKm2,
    density: areaKm2 > 0 ? total / areaKm2 : 0,
    source: "demo",
    warnings: [
      "Dados sintéticos: servem para explorar a interface e a hipótese.",
    ],
    generatedAt: "demo",
  };
}

async function requestAnalysis(
  origin: Origin,
  durationMinutes: number,
  travelMode: TravelMode,
  demo: boolean,
): Promise<Analysis> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, durationMinutes, travelMode, demo }),
  });
  const payload = (await response.json()) as Analysis | { error?: string };

  if (!response.ok) {
    const message =
      "error" in payload && payload.error
        ? payload.error
        : `A análise falhou (${response.status}).`;
    throw new Error(message);
  }

  return payload as Analysis;
}

type PlaceLike = {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: {
    lat(): number;
    lng(): number;
  };
  fetchFields(options: { fields: string[] }): Promise<void>;
};

type PredictionLike = {
  toPlace(): PlaceLike;
};

type SelectEvent = Event & {
  placePrediction: PredictionLike;
};

type AutocompleteElement = HTMLElement & {
  placeholder?: string;
};

type AutocompleteConstructor = new (options: {
  includedRegionCodes: string[];
  placeholder: string;
}) => AutocompleteElement;

function PlacePicker({
  accent,
  letter,
  value,
  apiKey,
  live,
  onChange,
}: {
  accent: "coral" | "teal";
  letter: "A" | "B";
  value: Origin;
  apiKey?: string;
  live: boolean;
  onChange: (origin: Origin) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pickerError, setPickerError] = useState<string>();

  useEffect(() => {
    if (!live || !apiKey || !hostRef.current) return;
    let active = true;
    const host = hostRef.current;
    const runtimeApiKey = apiKey;

    async function attachAutocomplete() {
      try {
        const maps = await loadGoogleMaps(runtimeApiKey);
        const library = (await maps.maps.importLibrary("places")) as unknown as {
          PlaceAutocompleteElement: AutocompleteConstructor;
        };
        if (!active) return;

        const element = new library.PlaceAutocompleteElement({
          includedRegionCodes: ["br", "ar", "uy"],
          placeholder: `Busque o lugar ${letter}`,
        });
        element.className = "place-autocomplete";

        const handleSelect = async (event: Event) => {
          const prediction = (event as SelectEvent).placePrediction;
          const place = prediction.toPlace();
          await place.fetchFields({
            fields: [
              "id",
              "displayName",
              "formattedAddress",
              "location",
            ],
          });

          if (!place.location) return;
          onChange({
            placeId: place.id,
            label: place.displayName || place.formattedAddress || `Lugar ${letter}`,
            address: place.formattedAddress,
            latitude: place.location.lat(),
            longitude: place.location.lng(),
          });
        };

        element.addEventListener("gmp-select", handleSelect);
        element.addEventListener("gmp-error", () => {
          setPickerError("A busca do Google não respondeu. Confira a chave e tente novamente.");
        });
        host.replaceChildren(element);
      } catch (error) {
        if (active) setPickerError(safeErrorMessage(error));
      }
    }

    void attachAutocomplete();
    return () => {
      active = false;
      host.replaceChildren();
    };
  }, [apiKey, letter, live, onChange]);

  return (
    <section className={`place-card place-card--${accent}`}>
      <div className="place-card__top">
        <span className="place-letter" aria-hidden="true">
          {letter}
        </span>
        <span className="eyebrow">Lugar {letter}</span>
        <span className="place-dot" aria-hidden="true" />
      </div>
      <strong>{value.label}</strong>
      <span className="place-address">{value.address}</span>

      {live ? (
        <>
          {apiKey ? (
            <div ref={hostRef} className="autocomplete-host" />
          ) : (
            <div className="key-warning">Busca indisponível: chave do navegador ausente.</div>
          )}
          {pickerError && <small className="field-error">{pickerError}</small>}
        </>
      ) : (
        <div className="preset-list" aria-label={`Escolha o lugar ${letter}`}>
          {PRESETS.map((preset) => (
            <button
              className={
                preset.label === value.label ? "preset is-selected" : "preset"
              }
              key={`${letter}-${preset.label}`}
              onClick={() => onChange(preset)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function extractOuterRings(geometry: GeoGeometry): number[][][] {
  if (geometry.type === "Polygon") {
    const polygon = geometry.coordinates as number[][][];
    return polygon[0] ? [polygon[0]] : [];
  }

  const multiPolygon = geometry.coordinates as number[][][][];
  return multiPolygon.flatMap((polygon) => (polygon[0] ? [polygon[0]] : []));
}

function polygonPath(geometry: GeoGeometry) {
  const rings = extractOuterRings(geometry);
  const points = rings.flat();
  if (points.length === 0) return "";

  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  const minX = Math.min(...longitudes);
  const maxX = Math.max(...longitudes);
  const minY = Math.min(...latitudes);
  const maxY = Math.max(...latitudes);
  const scaleX = 232 / Math.max(maxX - minX, 0.0001);
  const scaleY = 144 / Math.max(maxY - minY, 0.0001);
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (260 - (maxX - minX) * scale) / 2;
  const offsetY = (172 - (maxY - minY) * scale) / 2;

  return rings
    .map((ring) =>
      ring
        .map(([longitude, latitude], index) => {
          const x = offsetX + (longitude - minX) * scale;
          const y = offsetY + (maxY - latitude) * scale;
          return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" "),
    )
    .map((path) => `${path} Z`)
    .join(" ");
}

function MiniMap({
  result,
  letter,
  accent,
}: {
  result: Analysis;
  letter: "A" | "B";
  accent: "coral" | "teal";
}) {
  return (
    <div className={`mini-map mini-map--${accent}`}>
      <svg
        aria-label={`Isócrona do lugar ${letter}`}
        role="img"
        viewBox="0 0 260 172"
      >
        <defs>
          <pattern
            id={`grid-${letter}`}
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(20)"
          >
            <path d="M 0 0 L 0 22" className="map-grid" />
          </pattern>
          <filter id={`shadow-${letter}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="5" stdDeviation="6" floodOpacity=".18" />
          </filter>
        </defs>
        <rect width="260" height="172" className="map-ground" />
        <rect width="260" height="172" fill={`url(#grid-${letter})`} />
        <path d="M-10 139 C50 112 74 126 130 94 S220 76 273 39" className="map-road" />
        <path d="M22 -8 C58 53 98 54 119 99 S166 155 238 181" className="map-road map-road--thin" />
        <path
          d={polygonPath(result.polygon)}
          className="isochrone-shape"
          filter={`url(#shadow-${letter})`}
        />
        <circle cx="130" cy="86" r="7" className="map-origin-ring" />
        <circle cx="130" cy="86" r="3" className="map-origin" />
      </svg>
      <div className="mini-map__label">
        <span className="place-letter">{letter}</span>
        <span>
          <strong>{result.origin.label}</strong>
          <small>
            {numberFormat.format(result.areaKm2)} km² de alcance
          </small>
        </span>
      </div>
    </div>
  );
}

function ScoreDial({ comparison }: { comparison: Comparison }) {
  const score = comparison.score;
  const rounded = score === null ? 0 : Math.round(score);

  return (
    <div
      className="score-dial"
      style={{ "--score": `${rounded * 3.6}deg` } as React.CSSProperties}
      aria-label={
        score === null
          ? "Sem base suficiente para calcular a similaridade"
          : `Similaridade de composição: ${rounded} de 100`
      }
    >
      <div className="score-dial__inside">
        <span className="score-dial__number">{score === null ? "—" : rounded}</span>
        <span className="score-dial__unit">/ 100</span>
      </div>
    </div>
  );
}

function CategoryRows({
  a,
  b,
  comparison,
}: {
  a: Analysis;
  b: Analysis;
  comparison: Comparison;
}) {
  const bById = new Map(b.categories.map((category) => [category.id, category]));
  const drivers = new Map(comparison.drivers.map((driver) => [driver.id, driver]));

  return (
    <div className="category-list">
      {a.categories.map((category) => {
        const other = bById.get(category.id);
        const driver = drivers.get(category.id);
        const shareA = a.total ? (category.count / a.total) * 100 : 0;
        const shareB = b.total ? ((other?.count ?? 0) / b.total) * 100 : 0;
        const maxShare = Math.max(shareA, shareB, 1);

        return (
          <div className="category-row" key={category.id}>
            <div className="category-name">
              <span
                className="category-swatch"
                style={{ backgroundColor: category.color }}
              />
              <span>{category.label}</span>
              <small>
                {driver && driver.driverPercent >= 1
                  ? `${Math.round(driver.driverPercent)}% da divergência`
                  : "perfil alinhado"}
              </small>
            </div>
            <div className="bar-pair">
              <div className="bar-line">
                <span className="bar-letter bar-letter--a">A</span>
                <div className="bar-track">
                  <span
                    className="bar-fill bar-fill--a"
                    style={{ width: `${(shareA / maxShare) * 100}%` }}
                  />
                </div>
                <strong>{numberFormat.format(shareA)}%</strong>
                <small>{category.count}</small>
              </div>
              <div className="bar-line">
                <span className="bar-letter bar-letter--b">B</span>
                <div className="bar-track">
                  <span
                    className="bar-fill bar-fill--b"
                    style={{ width: `${(shareB / maxShare) * 100}%` }}
                  />
                </div>
                <strong>{numberFormat.format(shareB)}%</strong>
                <small>{other?.count ?? 0}</small>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AccessTwinApp() {
  const [originA, setOriginA] = useState<Origin>(PRESETS[0]);
  const [originB, setOriginB] = useState<Origin>(PRESETS[1]);
  const [travelMode, setTravelMode] = useState<TravelMode>("WALK");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [dataMode, setDataMode] = useState<"demo" | "live">("demo");
  const [browserKey, setBrowserKey] = useState<string>();
  const [keyConfigured, setKeyConfigured] = useState<boolean>();
  const [results, setResults] = useState<[Analysis, Analysis]>(() => [
    initialDemoAnalysis(PRESETS[0]),
    initialDemoAnalysis(PRESETS[1]),
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    async function readConfig() {
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        const config = (await response.json()) as {
          browserKeyConfigured: boolean;
          browserKey?: string;
        };
        setKeyConfigured(config.browserKeyConfigured);
        setBrowserKey(config.browserKey);
      } catch {
        setKeyConfigured(false);
      }
    }

    void readConfig();
  }, []);

  const runComparison = useCallback(async () => {
    if (
      originA.latitude === originB.latitude &&
      originA.longitude === originB.longitude
    ) {
      setError("Escolha dois pontos diferentes para comparar.");
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const pair = await Promise.all([
        requestAnalysis(
          originA,
          durationMinutes,
          travelMode,
          dataMode === "demo",
        ),
        requestAnalysis(
          originB,
          durationMinutes,
          travelMode,
          dataMode === "demo",
        ),
      ]);
      setResults(pair);
    } catch (caught) {
      setError(safeErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [dataMode, durationMinutes, originA, originB, travelMode]);

  const comparison = useMemo(
    () => (results ? calculateComparison(results[0], results[1]) : undefined),
    [results],
  );

  const volumeRatio = results
    ? (Math.max(results[0].total, results[1].total) + 1) /
      (Math.min(results[0].total, results[1].total) + 1)
    : 1;
  const largerPlace =
    results && results[0].total >= results[1].total ? "A" : "B";

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AccessTwin — início">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>AccessTwin</span>
        </a>
        <div className="header-meta">
          <span className="experiment-pill">
            <i /> Experimento exploratório
          </span>
          <a href="#metodo">Como funciona</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="kicker">Geografia da vida cotidiana</span>
          <h1>
            Dois lugares.
            <br />
            <em>O mesmo alcance?</em>
          </h1>
          <p>
            Compare o mix de serviços, cultura, natureza e infraestrutura que
            cabe no mesmo tempo de deslocamento — sem confundir composição com
            quantidade.
          </p>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <span className="orbit orbit--one" />
          <span className="orbit orbit--two" />
          <span className="orbit-label orbit-label--a">A</span>
          <span className="orbit-label orbit-label--b">B</span>
          <span className="orbit-center">JS</span>
        </div>
      </section>

      <section className="composer" aria-labelledby="composer-title">
        <div className="composer__header">
          <div>
            <span className="section-number">01</span>
            <h2 id="composer-title">Monte a comparação</h2>
          </div>
          <div className="data-switch" aria-label="Fonte dos dados">
            <button
              className={dataMode === "demo" ? "is-active" : ""}
              onClick={() => setDataMode("demo")}
              type="button"
            >
              Demonstração
            </button>
            <button
              className={dataMode === "live" ? "is-active" : ""}
              disabled={keyConfigured === false}
              onClick={() => setDataMode("live")}
              type="button"
              title={
                keyConfigured === false
                  ? "Configure a chave do navegador para usar dados ao vivo"
                  : undefined
              }
            >
              Google ao vivo
              <span className="live-dot" />
            </button>
          </div>
        </div>

        <div className="places-grid">
          <PlacePicker
            accent="coral"
            apiKey={browserKey}
            letter="A"
            live={dataMode === "live"}
            onChange={setOriginA}
            value={originA}
          />
          <div className="versus" aria-hidden="true">
            <span>×</span>
          </div>
          <PlacePicker
            accent="teal"
            apiKey={browserKey}
            letter="B"
            live={dataMode === "live"}
            onChange={setOriginB}
            value={originB}
          />
        </div>

        <div className="journey-controls">
          <div className="control-group">
            <span className="control-label">Modo compartilhado</span>
            <div className="segmented">
              {(Object.keys(MODE_LABELS) as TravelMode[]).map((mode) => (
                <button
                  className={travelMode === mode ? "is-active" : ""}
                  key={mode}
                  onClick={() => setTravelMode(mode)}
                  type="button"
                >
                  <span aria-hidden="true">{MODE_LABELS[mode].icon}</span>
                  {MODE_LABELS[mode].label}
                </button>
              ))}
            </div>
          </div>
          <div className="control-group control-group--time">
            <span className="control-label">Tempo máximo</span>
            <div className="time-options">
              {[10, 15, 20, 30, 45].map((minutes) => (
                <button
                  className={durationMinutes === minutes ? "is-active" : ""}
                  key={minutes}
                  onClick={() => setDurationMinutes(minutes)}
                  type="button"
                >
                  {minutes}
                  <small>min</small>
                </button>
              ))}
            </div>
          </div>
          <button
            className="compare-button"
            disabled={loading}
            onClick={() => void runComparison()}
            type="button"
          >
            <span>{loading ? "Calculando…" : "Comparar acessibilidade"}</span>
            <i aria-hidden="true">{loading ? "···" : "↗"}</i>
          </button>
        </div>

        {dataMode === "demo" && (
          <p className="demo-note">
            <span>i</span>
            O modo demonstração usa dados sintéticos estáveis para explorar a
            hipótese sem consumir APIs pagas.
          </p>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <strong>A comparação não terminou.</strong>
            <span>{error}</span>
            {dataMode === "live" && (
              <button onClick={() => setDataMode("demo")} type="button">
                Usar demonstração
              </button>
            )}
          </div>
        )}
      </section>

      {results && comparison && (
        <section className="results" aria-live="polite">
          <div className="results-heading">
            <div>
              <span className="section-number">02</span>
              <h2>O retrato comparativo</h2>
            </div>
            <span className="result-source">
              {results[0].source === "google"
                ? "Dados ao vivo · Google Maps"
                : "Cenário demonstrativo"}
            </span>
          </div>

          <article className="score-card">
            <ScoreDial comparison={comparison} />
            <div className="score-copy">
              <span className="eyebrow">Similaridade de composição</span>
              <h3>
                {comparison.score === null
                  ? "Base insuficiente"
                  : comparison.score >= 80
                    ? "Rotinas parecidas, escalas distintas."
                    : comparison.score >= 60
                      ? "Há um núcleo comum — e diferenças claras."
                      : "Esses lugares habilitam rotinas diferentes."}
              </h3>
              <p>
                A pontuação compara a proporção entre oito grupos de amenidades.
                Ela não diz que os lugares são “equivalentes” nem mede
                qualidade, segurança ou preferência pessoal.
              </p>
              {comparison.status !== "ok" && (
                <span className="sample-warning">
                  {comparison.status === "insufficient"
                    ? "Score ocultado: ao menos um lugar tem menos de 10 itens."
                    : "Leia com cautela: uma das bases tem menos de 20 itens."}
                </span>
              )}
            </div>
            <div className="volume-callout">
              <span>Realidade absoluta</span>
              <strong>
                {volumeRatio.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
                ×
              </strong>
              <p>mais oferta classificada no lugar {largerPlace}</p>
            </div>
          </article>

          <div className="metric-grid">
            {[results[0], results[1]].map((result, index) => (
              <article
                className={`metric-card metric-card--${index === 0 ? "a" : "b"}`}
                key={result.origin.label}
              >
                <span className="metric-letter">{index === 0 ? "A" : "B"}</span>
                <div>
                  <small>{result.origin.label}</small>
                  <strong>{result.total}</strong>
                  <span>lugares classificados</span>
                </div>
                <dl>
                  <div>
                    <dt>Densidade</dt>
                    <dd>{numberFormat.format(result.density)}/km²</dd>
                  </div>
                  <div>
                    <dt>Diversidade</dt>
                    <dd>
                      {
                        result.categories.filter((category) => category.count > 0)
                          .length
                      }
                      /8 grupos
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <article className="map-card">
            <div className="card-title">
              <div>
                <span className="section-number">03</span>
                <h3>Áreas alcançáveis</h3>
              </div>
              <span>
                {durationMinutes} min · {MODE_LABELS[travelMode].label}
              </span>
            </div>
            <div className="map-pair">
              <MiniMap accent="coral" letter="A" result={results[0]} />
              <MiniMap accent="teal" letter="B" result={results[1]} />
            </div>
            <p className="map-caption">
              Formas normalizadas lado a lado para comparar alcance. Distâncias
              e áreas vêm da geometria; a representação não usa a mesma escala
              entre os dois quadros.
            </p>
          </article>

          <article className="profile-card">
            <div className="card-title">
              <div>
                <span className="section-number">04</span>
                <h3>Mix de amenidades</h3>
              </div>
              <div className="profile-legend">
                <span><i className="legend-a" /> A: participação</span>
                <span><i className="legend-b" /> B: participação</span>
                <small>número à direita = contagem</small>
              </div>
            </div>
            <CategoryRows
              a={results[0]}
              b={results[1]}
              comparison={comparison}
            />
          </article>

          <div className="insight-grid">
            <article className="drivers-card">
              <span className="eyebrow">O que mais separa A de B</span>
              <h3>Três sinais para investigar</h3>
              <ol>
                {comparison.drivers.slice(0, 3).map((driver, index) => {
                  const greater = driver.shareA >= driver.shareB ? "A" : "B";
                  const higher = Math.max(driver.shareA, driver.shareB) * 100;
                  const lower = Math.min(driver.shareA, driver.shareB) * 100;
                  return (
                    <li key={driver.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <p>
                        <strong>{driver.label}</strong> explica{" "}
                        {Math.round(driver.driverPercent)}% da divergência:{" "}
                        {numberFormat.format(higher)}% do mix em {greater}, ante{" "}
                        {numberFormat.format(lower)}% no outro lugar.
                      </p>
                    </li>
                  );
                })}
              </ol>
            </article>

            <article className="hypothesis-card">
              <span className="eyebrow">Leitura responsável</span>
              <h3>Um instrumento para formular perguntas.</h3>
              <p>
                O AccessTwin procura padrões emergentes. Uma pontuação alta pode
                esconder volumes muito diferentes; uma pontuação baixa pode
                refletir especialização útil. O resultado é evidência
                exploratória, não diagnóstico urbano.
              </p>
              <div className="quadrant">
                <span>mix parecido</span>
                <span>mix diferente</span>
                <strong>volume parecido</strong>
                <i>gêmeo forte</i>
                <i>mesma escala, outra rotina</i>
                <strong>volume diferente</strong>
                <i>mesmo mix, outra intensidade</i>
                <i>contextos distintos</i>
              </div>
            </article>
          </div>
        </section>
      )}

      <section className="method" id="metodo">
        <div>
          <span className="section-number section-number--light">05</span>
          <h2>O que o experimento realmente testa</h2>
        </div>
        <div className="method-steps">
          <article>
            <span>1</span>
            <h3>Mesmo orçamento de tempo</h3>
            <p>
              Duas isócronas usam o mesmo modo, duração e direção para delimitar
              o que é alcançável pela rede viária.
            </p>
          </article>
          <article>
            <span>2</span>
            <h3>Perfis comparáveis</h3>
            <p>
              Lugares operacionais são agrupados em oito funções urbanas. O
              total continua separado das proporções.
            </p>
          </article>
          <article>
            <span>3</span>
            <h3>Jensen–Shannon</h3>
            <p>
              A distância entre distribuições vira um índice de 0 a 100. É
              simétrica, aceita categorias ausentes e revela os drivers.
            </p>
          </article>
        </div>
        <div className="method-limit">
          <strong>Fora do escopo, por enquanto</strong>
          <p>
            Transporte público, qualidade do passeio, barreiras percebidas,
            preço, segurança, horários pessoais e cobertura perfeita de
            estabelecimentos. São dimensões candidatas a fases futuras, não
            premissas escondidas no score.
          </p>
        </div>
      </section>

      <footer>
        <a className="brand brand--footer" href="#top">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>AccessTwin</span>
        </a>
        <p>
          Protótipo de pesquisa · Isochrones e Places Aggregate, Google Maps ·
          Métrica Jensen–Shannon
        </p>
        <span>2026</span>
      </footer>
    </main>
  );
}
