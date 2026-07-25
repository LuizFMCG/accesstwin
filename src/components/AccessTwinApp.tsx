"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/categories";
import { demoAreaKm2, demoCounts, demoGeometry } from "@/lib/demo";
import { loadGoogleMaps } from "@/lib/google-browser";
import { rankProfiles, type RankedProfile } from "@/lib/ranking";
import {
  TERRITORIES,
  territoriesInScope,
  type SearchScope,
  type Territory,
} from "@/lib/territories";
import type { CategoryId, Origin, TravelMode } from "@/lib/types";

type CategoryCount = {
  id: CategoryId;
  label: string;
  color: string;
  count: number;
};

type Analysis = {
  origin: Origin & { address?: string };
  durationMinutes: number;
  travelMode: TravelMode;
  polygon: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  categories: CategoryCount[];
  total: number;
  areaKm2: number;
  density: number;
  source: "demo" | "google";
  warnings: string[];
  generatedAt: string;
};

type TerritoryProfile = {
  id: string;
  territory: Territory;
  analysis: Analysis;
  counts: Partial<Record<CategoryId, number>>;
  total: number;
  density: number;
};

type RankedTerritory = RankedProfile<TerritoryProfile>;

const MODE_LABELS: Record<TravelMode, string> = {
  WALK: "A pé",
  BICYCLE: "Bicicleta",
  DRIVE: "Carro",
};

const SCOPE_LABELS: Record<SearchScope, { label: string; hint: string }> = {
  state: { label: "Estado", hint: "mesma UF" },
  country: { label: "País", hint: "mesmo país" },
  region: { label: "Região", hint: "Brasil + vizinhos" },
};

const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

function countsRecord(categories: readonly CategoryCount[]) {
  return Object.fromEntries(
    categories.map((category) => [category.id, category.count]),
  ) as Partial<Record<CategoryId, number>>;
}

function demoAnalysis(
  territory: Territory,
  durationMinutes: number,
  travelMode: TravelMode,
): Analysis {
  const rawCounts = demoCounts(territory, durationMinutes, travelMode);
  const byId = new Map(rawCounts.map((item) => [item.categoryId, item.count]));
  const categories = CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    color: category.color,
    count: byId.get(category.id) ?? 0,
  }));
  const total = categories.reduce((sum, category) => sum + category.count, 0);
  const areaKm2 = demoAreaKm2(durationMinutes, travelMode);
  return {
    origin: territory,
    durationMinutes,
    travelMode,
    polygon: demoGeometry(territory, durationMinutes, travelMode),
    categories,
    total,
    areaKm2,
    density: areaKm2 > 0 ? total / areaKm2 : 0,
    source: "demo",
    warnings: ["Índice demonstrativo; não representa medição real do território."],
    generatedAt: "demo",
  };
}

function toProfile(territory: Territory, analysis: Analysis): TerritoryProfile {
  return {
    id: territory.id,
    territory,
    analysis,
    counts: countsRecord(analysis.categories),
    total: analysis.total,
    density: analysis.density,
  };
}

async function requestAnalysis(
  origin: Origin,
  durationMinutes: number,
  travelMode: TravelMode,
): Promise<Analysis> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin,
      durationMinutes,
      travelMode,
      demo: false,
    }),
  });
  const payload = (await response.json()) as Analysis | { error?: string };
  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : `A análise falhou (${response.status}).`,
    );
  }
  return payload as Analysis;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível encontrar territórios semelhantes.";
}

function geoDistance(a: Origin, b: Origin) {
  const lat = a.latitude - b.latitude;
  const lon = (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(lat, lon);
}

function liveShortlist(reference: Origin, candidates: readonly Territory[]) {
  return [...candidates]
    .sort((a, b) => geoDistance(reference, a) - geoDistance(reference, b))
    .slice(0, 4);
}

type PlaceLike = {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: { lat(): number; lng(): number };
  fetchFields(options: { fields: string[] }): Promise<void>;
};

type AutocompleteConstructor = new (options: {
  includedRegionCodes: string[];
  placeholder: string;
}) => HTMLElement;

function LivePlaceSearch({
  apiKey,
  onChange,
}: {
  apiKey?: string;
  onChange: (origin: Origin & { address?: string }) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!apiKey || !hostRef.current) return;
    const host = hostRef.current;
    let active = true;

    async function attach() {
      try {
        const maps = await loadGoogleMaps(apiKey as string);
        const library = (await maps.maps.importLibrary("places")) as unknown as {
          PlaceAutocompleteElement: AutocompleteConstructor;
        };
        if (!active) return;
        const element = new library.PlaceAutocompleteElement({
          includedRegionCodes: ["br", "ar", "uy"],
          placeholder: "Digite um bairro, endereço ou lugar",
        });
        element.className = "place-autocomplete";
        element.addEventListener("gmp-select", async (event: Event) => {
          const prediction = (
            event as Event & {
              placePrediction: { toPlace(): PlaceLike };
            }
          ).placePrediction;
          const place = prediction.toPlace();
          await place.fetchFields({
            fields: ["id", "displayName", "formattedAddress", "location"],
          });
          if (!place.location) return;
          onChange({
            placeId: place.id,
            label:
              place.displayName ||
              place.formattedAddress ||
              "Território selecionado",
            address: place.formattedAddress,
            latitude: place.location.lat(),
            longitude: place.location.lng(),
          });
        });
        host.replaceChildren(element);
      } catch (caught) {
        if (active) setError(safeErrorMessage(caught));
      }
    }

    void attach();
    return () => {
      active = false;
      host.replaceChildren();
    };
  }, [apiKey, onChange]);

  return (
    <>
      <div className="live-search" ref={hostRef} />
      {error && <small className="field-error">{error}</small>}
    </>
  );
}

function BrandMark() {
  return (
    <svg aria-hidden="true" className="brand-symbol" viewBox="0 0 42 42">
      <path d="M5 21c4-9 9-13 16-13 7 0 12 4 16 13-4 9-9 13-16 13C14 34 9 30 5 21Z" />
      <circle cx="21" cy="21" r="5" />
      <path d="M21 4v8M21 30v8M4 21h8M30 21h8" />
    </svg>
  );
}

function ScopeControl({
  value,
  onChange,
  stateCount,
}: {
  value: SearchScope;
  onChange: (scope: SearchScope) => void;
  stateCount: number;
}) {
  return (
    <div className="scope-control" aria-label="Abrangência da busca">
      {(Object.keys(SCOPE_LABELS) as SearchScope[]).map((scope) => (
        <button
          className={value === scope ? "is-active" : ""}
          disabled={scope === "state" && stateCount === 0}
          key={scope}
          onClick={() => onChange(scope)}
          type="button"
        >
          <strong>{SCOPE_LABELS[scope].label}</strong>
          <small>{SCOPE_LABELS[scope].hint}</small>
        </button>
      ))}
    </div>
  );
}

function ProfileBars({
  reference,
  twin,
}: {
  reference: TerritoryProfile;
  twin: RankedTerritory;
}) {
  return (
    <div className="profile-bars">
      {CATEGORIES.map((category) => {
        const referenceCount = reference.counts[category.id] ?? 0;
        const twinCount = twin.counts[category.id] ?? 0;
        const referenceShare = reference.total
          ? (referenceCount / reference.total) * 100
          : 0;
        const twinShare = twin.total ? (twinCount / twin.total) * 100 : 0;
        return (
          <div className="profile-line" key={category.id}>
            <span>{category.shortLabel}</span>
            <div>
              <i
                className="profile-line__reference"
                style={{ width: `${referenceShare}%` }}
              />
              <i
                className="profile-line__twin"
                style={{ width: `${twinShare}%` }}
              />
            </div>
            <small>{numberFormat.format(referenceShare)} · {numberFormat.format(twinShare)}%</small>
          </div>
        );
      })}
    </div>
  );
}

function ResultCard({
  result,
  selected,
  onSelect,
}: {
  result: RankedTerritory;
  selected: boolean;
  onSelect: () => void;
}) {
  const driver = result.leadingDriver
    ? CATEGORY_BY_ID[result.leadingDriver].shortLabel
    : "mix urbano";
  return (
    <button
      className={`rank-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className="rank-card__rank">
        {String(result.rank).padStart(2, "0")}
      </span>
      <span className="rank-card__place">
        <strong>{result.territory.label}</strong>
        <small>
          {result.territory.city} · {result.territory.state}
        </small>
      </span>
      <span className="rank-card__context">{result.territory.context}</span>
      <span className="rank-card__score">
        <strong>{Math.round(result.similarity)}</strong>
        <small>afinidade JS</small>
      </span>
      <span className="rank-card__arrow">↗</span>
      <span className="rank-card__driver">maior diferença: {driver}</span>
    </button>
  );
}

export function AccessTwinApp() {
  const [referenceTerritory, setReferenceTerritory] = useState<Territory>(
    TERRITORIES[0],
  );
  const [referenceOrigin, setReferenceOrigin] = useState<
    Origin & { address?: string }
  >(TERRITORIES[0]);
  const [scope, setScope] = useState<SearchScope>("country");
  const [travelMode, setTravelMode] = useState<TravelMode>("WALK");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [dataMode, setDataMode] = useState<"demo" | "live">("demo");
  const [browserKey, setBrowserKey] = useState<string>();
  const [keyConfigured, setKeyConfigured] = useState<boolean>();
  const [liveResult, setLiveResult] = useState<{
    reference: TerritoryProfile;
    ranked: RankedTerritory[];
  }>();
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((config: { browserKeyConfigured: boolean; browserKey?: string }) => {
        setKeyConfigured(config.browserKeyConfigured);
        setBrowserKey(config.browserKey);
      })
      .catch(() => setKeyConfigured(false));
  }, []);

  const candidates = useMemo(
    () => territoriesInScope(referenceTerritory, scope),
    [referenceTerritory, scope],
  );

  const demoResult = useMemo(() => {
    const reference = toProfile(
      referenceTerritory,
      demoAnalysis(referenceTerritory, durationMinutes, travelMode),
    );
    const profiles = candidates.map((territory) =>
      toProfile(
        territory,
        demoAnalysis(territory, durationMinutes, travelMode),
      ),
    );
    return { reference, ranked: rankProfiles(reference, profiles) };
  }, [candidates, durationMinutes, referenceTerritory, travelMode]);

  const activeResult =
    dataMode === "live" && liveResult ? liveResult : demoResult;
  const selectedTwin =
    activeResult.ranked.find((result) => result.id === selectedId) ??
    activeResult.ranked[0];

  const stateCount = TERRITORIES.filter(
    (territory) =>
      territory.id !== referenceTerritory.id &&
      territory.country === referenceTerritory.country &&
      territory.state === referenceTerritory.state,
  ).length;
  const shortlist = liveShortlist(referenceOrigin, candidates);
  const liveProfileCount = 1 + shortlist.length;
  const liveAggregateCalls = liveProfileCount * CATEGORIES.length;

  const chooseTerritory = useCallback((territory: Territory) => {
    setReferenceTerritory(territory);
    setReferenceOrigin(territory);
    setLiveResult(undefined);
  }, []);

  const runLiveRanking = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const candidateSet = liveShortlist(referenceOrigin, candidates);
      const [referenceAnalysis, ...candidateAnalyses] = await Promise.all([
        requestAnalysis(referenceOrigin, durationMinutes, travelMode),
        ...candidateSet.map((territory) =>
          requestAnalysis(territory, durationMinutes, travelMode),
        ),
      ]);
      const reference = toProfile(
        {
          ...referenceTerritory,
          ...referenceOrigin,
          id: "live-reference",
          context: "referência escolhida ao vivo",
        },
        referenceAnalysis,
      );
      const profiles = candidateSet.map((territory, index) =>
        toProfile(territory, candidateAnalyses[index]),
      );
      setLiveResult({ reference, ranked: rankProfiles(reference, profiles) });
    } catch (caught) {
      setError(safeErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [
    candidates,
    durationMinutes,
    referenceOrigin,
    referenceTerritory,
    travelMode,
  ]);

  return (
    <main id="top">
      <header className="site-header">
        <a className="brand" href="#top">
          <BrandMark />
          <span>
            <strong>AccessTwin</strong>
            <small>urban affinity engine</small>
          </span>
        </a>
        <nav>
          <a href="#buscar">Encontrar gêmeos</a>
          <a href="#metodo">Método</a>
          <span className="beta-pill">beta 01</span>
        </nav>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <span className="kicker">Inteligência territorial comparada</span>
          <h1>
            Escolha um lugar.
            <br />
            <em>Descubra seus gêmeos.</em>
          </h1>
          <p>
            O AccessTwin lê a composição do cotidiano ao alcance e procura,
            automaticamente, os territórios que mais se parecem com a sua
            referência — no estado, no país ou na região.
          </p>
          <a className="hero-cta" href="#buscar">
            Explorar afinidades <span>↓</span>
          </a>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <span className="signal signal--one" />
          <span className="signal signal--two" />
          <span className="signal signal--three" />
          <span className="node node--origin">REF</span>
          <span className="node node--a">01</span>
          <span className="node node--b">02</span>
          <span className="node node--c">03</span>
          <span className="visual-caption">similaridade não é proximidade</span>
        </div>
      </section>

      <section className="finder" id="buscar">
        <div className="section-heading">
          <div>
            <span className="section-index">01 / REFERÊNCIA</span>
            <h2>De onde partimos?</h2>
          </div>
          <div className="mode-switch">
            <button
              className={dataMode === "demo" ? "is-active" : ""}
              onClick={() => setDataMode("demo")}
              type="button"
            >
              Explorar sem custo
            </button>
            <button
              className={dataMode === "live" ? "is-active" : ""}
              disabled={keyConfigured === false}
              onClick={() => setDataMode("live")}
              type="button"
            >
              Dados Google <i />
            </button>
          </div>
        </div>

        <div className="finder-grid">
          <div className="reference-panel">
            <span className="field-label">Território de referência</span>
            {dataMode === "live" ? (
              <LivePlaceSearch
                apiKey={browserKey}
                onChange={(origin) => {
                  setReferenceOrigin(origin);
                  setLiveResult(undefined);
                }}
              />
            ) : (
              <select
                onChange={(event) => {
                  const territory = TERRITORIES.find(
                    (item) => item.id === event.target.value,
                  );
                  if (territory) chooseTerritory(territory);
                }}
                value={referenceTerritory.id}
              >
                {TERRITORIES.map((territory) => (
                  <option key={territory.id} value={territory.id}>
                    {territory.label} — {territory.city}
                  </option>
                ))}
              </select>
            )}
            <div className="reference-identity">
              <span>REF</span>
              <div>
                <strong>{referenceOrigin.label}</strong>
                <small>
                  {referenceOrigin.address
                    ? referenceOrigin.address
                    : `${referenceTerritory.city}, ${referenceTerritory.state}`}
                </small>
              </div>
            </div>
            <div className="quick-picks">
              {TERRITORIES.slice(0, 6).map((territory) => (
                <button
                  className={
                    territory.id === referenceTerritory.id ? "is-active" : ""
                  }
                  key={territory.id}
                  onClick={() => chooseTerritory(territory)}
                  type="button"
                >
                  {territory.label}
                </button>
              ))}
            </div>
          </div>

          <div className="search-settings">
            <div>
              <span className="field-label">Onde procurar semelhantes?</span>
              <ScopeControl
                onChange={(nextScope) => {
                  setScope(nextScope);
                  setLiveResult(undefined);
                }}
                stateCount={stateCount}
                value={scope}
              />
            </div>
            <div className="mobility-row">
              <label>
                <span className="field-label">Modo de acesso</span>
                <select
                  onChange={(event) =>
                    setTravelMode(event.target.value as TravelMode)
                  }
                  value={travelMode}
                >
                  {(Object.keys(MODE_LABELS) as TravelMode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Janela de tempo</span>
                <select
                  onChange={(event) =>
                    setDurationMinutes(Number(event.target.value))
                  }
                  value={durationMinutes}
                >
                  {[10, 15, 20, 30].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutos
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {dataMode === "live" ? (
              <div className="cost-guard">
                <div>
                  <strong>Busca piloto com limite de custo</strong>
                  <span>
                    1 referência + {shortlist.length} candidatos próximos · até{" "}
                    {liveAggregateCalls} consultas Places Aggregate
                  </span>
                </div>
                <button
                  disabled={loading || shortlist.length === 0}
                  onClick={() => void runLiveRanking()}
                  type="button"
                >
                  {loading ? "Analisando…" : "Confirmar busca ao vivo"}
                </button>
              </div>
            ) : (
              <div className="zero-cost">
                <span>0</span>
                <p>
                  <strong>chamadas pagas</strong>
                  O índice demonstrativo é calculado localmente.
                </p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <strong>A busca não terminou.</strong> {error}
          </div>
        )}
      </section>

      <section className="ranking" aria-live="polite">
        <div className="section-heading section-heading--results">
          <div>
            <span className="section-index">02 / RANKING</span>
            <h2>Territórios mais afins</h2>
          </div>
          <p>
            {activeResult.ranked.length} candidatos · {durationMinutes} min ·{" "}
            {MODE_LABELS[travelMode]}
            <span>
              {activeResult.reference.analysis.source === "google"
                ? "dados ao vivo"
                : "índice demonstrativo"}
            </span>
          </p>
        </div>

        {selectedTwin ? (
          <div className="results-layout">
            <div className="rank-list">
              {activeResult.ranked.slice(0, 8).map((result) => (
                <ResultCard
                  key={result.id}
                  onSelect={() => setSelectedId(result.id)}
                  result={result}
                  selected={selectedTwin.id === result.id}
                />
              ))}
            </div>

            <aside className="twin-detail">
              <span className="detail-label">Gêmeo urbano #{selectedTwin.rank}</span>
              <div className="detail-score">
                <strong>{Math.round(selectedTwin.similarity)}</strong>
                <span>
                  /100
                  <small>afinidade de composição</small>
                </span>
              </div>
              <h3>
                {referenceOrigin.label}
                <span>↔</span>
                {selectedTwin.territory.label}
              </h3>
              <p>
                O mix de funções urbanas é{" "}
                <strong>
                  {selectedTwin.similarity >= 85
                    ? "muito próximo"
                    : selectedTwin.similarity >= 70
                      ? "consistente"
                      : "parcialmente semelhante"}
                </strong>
                . A densidade relativa tem {Math.round(selectedTwin.scaleSimilarity)}
                /100 de aderência.
              </p>
              <div className="profile-legend">
                <span><i /> referência</span>
                <span><i /> gêmeo</span>
              </div>
              <ProfileBars
                reference={activeResult.reference}
                twin={selectedTwin}
              />
              <div className="detail-note">
                <strong>Por que não é apenas “o mais perto”?</strong>
                <span>
                  O ranking usa 82% de composição Jensen–Shannon e 18% de
                  intensidade. Distância geográfica não entra no score.
                </span>
              </div>
            </aside>
          </div>
        ) : (
          <div className="empty-result">
            Não há outro território cadastrado neste recorte. Amplie a busca.
          </div>
        )}
      </section>

      <section className="method" id="metodo">
        <div className="method-intro">
          <span className="section-index">03 / MÉTODO</span>
          <h2>O que torna dois territórios parecidos?</h2>
          <p>
            Não é aparência, distância nem um palpite de IA. É a distribuição
            relativa de oito funções que sustentam a vida cotidiana.
          </p>
        </div>
        <div className="method-grid">
          <article>
            <span>01</span>
            <h3>Mesmo tempo</h3>
            <p>Delimitamos o que cabe na mesma janela de deslocamento.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Mesmo vocabulário</h3>
            <p>A oferta é organizada em oito funções urbanas comparáveis.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Jensen–Shannon</h3>
            <p>Comparamos distribuições e revelamos o que aproxima ou separa.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Ranking explicável</h3>
            <p>O resultado mostra afinidade, escala e principal divergência.</p>
          </article>
        </div>
        <p className="method-disclaimer">
          No modo demonstrativo, os perfis são sintéticos e servem para validar
          a experiência do produto. No modo Google, os resultados usam
          isócronas e contagens ao vivo, com shortlist limitada para controlar
          custo. O score não mede segurança, qualidade, preço ou preferência.
        </p>
      </section>

      <footer>
        <a className="brand brand--footer" href="#top">
          <BrandMark />
          <span><strong>AccessTwin</strong><small>urban affinity engine</small></span>
        </a>
        <p>Territórios diferentes. Cotidianos surpreendentemente próximos.</p>
        <span>Porto Alegre · 2026</span>
      </footer>
    </main>
  );
}
