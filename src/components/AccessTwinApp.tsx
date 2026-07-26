"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/categories";
import { loadGoogleMaps } from "@/lib/google-browser";
import { rankProfiles, type RankedProfile } from "@/lib/ranking";
import {
  buildDemoTerritorialIndex,
  searchTerritorialIndex,
  TERRITORIAL_INDEX_VERSION,
  type TerritorialSearchResult,
} from "@/lib/territorial-index";
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

type LiveProfile = {
  id: string;
  territory: Territory;
  counts: Partial<Record<CategoryId, number>>;
  total: number;
  density: number;
  analysis: Analysis;
};

type LiveRanked = RankedProfile<LiveProfile>;
type ResultItem = TerritorialSearchResult | LiveRanked;

const MODE_LABELS: Record<TravelMode, string> = {
  WALK: "A pé",
  BICYCLE: "Bicicleta",
  DRIVE: "Carro",
};

const SCOPE_LABELS: Record<SearchScope, { label: string; hint: string }> = {
  state: { label: "Estado", hint: "mesma UF" },
  country: { label: "País", hint: "mesmo país" },
  region: { label: "Cone Sul", hint: "Brasil + vizinhos" },
};

const CONFIDENCE_LABELS = {
  NORMAL: "base consistente",
  LOW_BASE: "base pequena",
  INSUFFICIENT_BASE: "base insuficiente",
} as const;

const numberFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

function countsRecord(categories: readonly CategoryCount[]) {
  return Object.fromEntries(
    categories.map((category) => [category.id, category.count]),
  ) as Partial<Record<CategoryId, number>>;
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
  const lon =
    (a.longitude - b.longitude) *
    Math.cos((a.latitude * Math.PI) / 180);
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
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
    </span>
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

function mapPosition(territory: Territory) {
  const x = ((territory.longitude + 75) / 22) * 100;
  const y = ((-territory.latitude - 3) / 33) * 100;
  return {
    left: `${Math.min(96, Math.max(4, x))}%`,
    top: `${Math.min(94, Math.max(6, y))}%`,
  };
}

function TerritoryMap({
  reference,
  results,
  selectedId,
  onSelect,
}: {
  reference: Territory;
  results: readonly ResultItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="territory-map" aria-label="Mapa esquemático dos resultados">
      <div className="map-grid" aria-hidden="true" />
      <span className="map-label map-label--north">N</span>
      <span className="map-label map-label--ocean">ATLÂNTICO</span>
      {results.slice(0, 8).map((result, index) => (
        <button
          aria-label={`Abrir ${result.territory.label}`}
          className={`map-node ${
            selectedId === result.id ? "is-selected" : ""
          }`}
          key={result.id}
          onClick={() => onSelect(result.id)}
          style={mapPosition(result.territory)}
          type="button"
        >
          {index + 1}
        </button>
      ))}
      <span
        className="map-node map-node--reference"
        style={mapPosition(reference)}
      >
        R
      </span>
      <div className="map-legend">
        <span><i className="legend-reference" /> referência</span>
        <span><i className="legend-twin" /> gêmeos</span>
      </div>
    </div>
  );
}

function profileShare(
  counts: Partial<Record<CategoryId, number>>,
  id: CategoryId,
) {
  const total = CATEGORIES.reduce(
    (sum, category) => sum + (counts[category.id] ?? 0),
    0,
  );
  return total === 0 ? 0 : ((counts[id] ?? 0) / total) * 100;
}

export function AccessTwinApp() {
  const [dataMode, setDataMode] = useState<"demo" | "live">("demo");
  const [referenceTerritory, setReferenceTerritory] = useState<Territory>(
    TERRITORIES[0],
  );
  const [referenceOrigin, setReferenceOrigin] = useState<
    Origin & { address?: string }
  >(TERRITORIES[0]);
  const [scope, setScope] = useState<SearchScope>("country");
  const [travelMode, setTravelMode] = useState<TravelMode>("WALK");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [browserKey, setBrowserKey] = useState<string>();
  const [liveResults, setLiveResults] = useState<LiveRanked[]>([]);
  const [liveReference, setLiveReference] = useState<LiveProfile>();
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((config: { browserKey?: string }) =>
        setBrowserKey(config.browserKey),
      )
      .catch(() => setBrowserKey(undefined));
  }, []);

  const demoIndex = useMemo(
    () => buildDemoTerritorialIndex(durationMinutes, travelMode),
    [durationMinutes, travelMode],
  );
  const demoReference =
    demoIndex.find((profile) => profile.id === referenceTerritory.id) ??
    demoIndex[0];
  const demoResults = useMemo(
    () => searchTerritorialIndex(demoReference, demoIndex, scope),
    [demoIndex, demoReference, scope],
  );
  const activeResults: readonly ResultItem[] =
    dataMode === "demo" ? demoResults : liveResults;
  const activeReference =
    dataMode === "demo" ? demoReference : liveReference;
  const selected =
    activeResults.find((result) => result.id === selectedId) ??
    activeResults[0];

  const candidates = territoriesInScope(referenceTerritory, scope);
  const shortlist = liveShortlist(referenceOrigin, candidates);
  const stateCount = territoriesInScope(referenceTerritory, "state").length;
  const liveProfileCount = 1 + shortlist.length;
  const liveAggregateCalls = liveProfileCount * CATEGORIES.length;

  const changeReference = useCallback((territory: Territory) => {
    setReferenceTerritory(territory);
    setReferenceOrigin(territory);
    setLiveResults([]);
    setLiveReference(undefined);
    setError(undefined);
  }, []);

  async function runLiveRanking() {
    if (shortlist.length === 0 || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const referenceAnalysis = await requestAnalysis(
        referenceOrigin,
        durationMinutes,
        travelMode,
      );
      const candidateAnalyses = await Promise.all(
        shortlist.map(async (territory) => ({
          territory,
          analysis: await requestAnalysis(
            territory,
            durationMinutes,
            travelMode,
          ),
        })),
      );
      const referenceProfile: LiveProfile = {
        id: "live-reference",
        territory: {
          ...referenceTerritory,
          ...referenceOrigin,
          id: "live-reference",
          context: "referência escolhida ao vivo",
        },
        analysis: referenceAnalysis,
        counts: countsRecord(referenceAnalysis.categories),
        total: referenceAnalysis.total,
        density: referenceAnalysis.density,
      };
      const ranked = rankProfiles(
        referenceProfile,
        candidateAnalyses.map(({ territory, analysis }) => ({
          id: territory.id,
          territory,
          analysis,
          counts: countsRecord(analysis.categories),
          total: analysis.total,
          density: analysis.density,
        })),
      );
      setLiveReference(referenceProfile);
      setLiveResults(ranked);
      setSelectedId(ranked[0]?.id);
      document.querySelector("#resultados")?.scrollIntoView({
        behavior: "smooth",
      });
    } catch (caught) {
      setError(safeErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  const referenceCounts = activeReference?.counts ?? {};
  const selectedSimilarity =
    selected && "similarity" in selected ? selected.similarity : 0;
  const selectedScale =
    selected && "scaleSimilarity" in selected ? selected.scaleSimilarity : 0;

  return (
    <main id="top">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AccessTwin, início">
          <BrandMark />
          <span>
            <strong>AccessTwin</strong>
            <small>atlas de afinidades urbanas</small>
          </span>
        </a>
        <nav>
          <a href="#buscar">Explorar</a>
          <a href="#resultados">Resultados</a>
          <a href="#metodo">Método</a>
          <span className="beta-pill">índice piloto</span>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-stamp">
          <span>AT / 01</span>
          <span>PORTO ALEGRE — CONE SUL</span>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Geografia comparável, sem palpite de IA</p>
          <h1>
            Um lugar pode ter um <em>irmão</em> longe daqui.
          </h1>
          <p>
            Escolha uma área. O AccessTwin lê a composição do cotidiano e
            procura, em todo o índice, os territórios que funcionam de modo
            mais parecido.
          </p>
          <a className="hero-cta" href="#buscar">
            Encontrar gêmeos <span>↘</span>
          </a>
        </div>
        <div className="hero-field" aria-hidden="true">
          <div className="field-orbit field-orbit--a" />
          <div className="field-orbit field-orbit--b" />
          <span className="field-point field-point--origin">R</span>
          <span className="field-point field-point--one">01</span>
          <span className="field-point field-point--two">02</span>
          <span className="field-point field-point--three">03</span>
          <p>uma assinatura urbana<br />múltiplas correspondências</p>
        </div>
      </section>

      <section className="finder" id="buscar">
        <div className="section-heading">
          <div>
            <span className="section-index">01 / REFERÊNCIA</span>
            <h2>De onde partimos?</h2>
          </div>
          <div className="mode-switch" aria-label="Fonte dos dados">
            <button
              className={dataMode === "demo" ? "is-active" : ""}
              onClick={() => setDataMode("demo")}
              type="button"
            >
              Índice sem custo
            </button>
            <button
              className={dataMode === "live" ? "is-active" : ""}
              disabled={!browserKey}
              onClick={() => setDataMode("live")}
              type="button"
            >
              Google ao vivo <i />
            </button>
          </div>
        </div>

        <div className="finder-grid">
          <div className="reference-panel">
            <span className="field-label">Território de referência</span>
            {dataMode === "demo" ? (
              <select
                aria-label="Território de referência"
                onChange={(event) => {
                  const territory = TERRITORIES.find(
                    (item) => item.id === event.target.value,
                  );
                  if (territory) changeReference(territory);
                }}
                value={referenceTerritory.id}
              >
                {TERRITORIES.map((territory) => (
                  <option key={territory.id} value={territory.id}>
                    {territory.label} — {territory.city}
                  </option>
                ))}
              </select>
            ) : (
              <LivePlaceSearch
                apiKey={browserKey}
                onChange={setReferenceOrigin}
              />
            )}
            <div className="reference-identity">
              <span>R</span>
              <div>
                <strong>{referenceOrigin.label}</strong>
                <small>
                  {dataMode === "demo"
                    ? `${referenceTerritory.city} · ${referenceTerritory.state}`
                    : referenceOrigin.address ?? "Referência ao vivo"}
                </small>
              </div>
            </div>
            <div className="index-facts">
              <span><strong>{demoIndex.length}</strong> territórios indexados</span>
              <span><strong>8</strong> funções urbanas</span>
              <span><strong>JS</strong> métrica principal</span>
            </div>
          </div>

          <div className="search-settings">
            <div>
              <span className="field-label">Onde procurar os gêmeos</span>
              <ScopeControl
                onChange={setScope}
                stateCount={stateCount}
                value={scope}
              />
            </div>
            <div className="mobility-row">
              <label>
                <span className="field-label">Deslocamento</span>
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
                <span className="field-label">Janela cotidiana</span>
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
                  <span className="cost-kicker">CUSTO SOB CONTROLE</span>
                  <strong>Busca piloto com confirmação</strong>
                  <p>
                    1 referência + {shortlist.length} candidatos · teto de{" "}
                    {liveAggregateCalls} consultas Aggregate
                  </p>
                </div>
                <button
                  disabled={loading || shortlist.length === 0}
                  onClick={() => void runLiveRanking()}
                  type="button"
                >
                  {loading ? "Analisando…" : "Confirmar busca"}
                </button>
              </div>
            ) : (
              <div className="zero-cost">
                <span>R$ 0</span>
                <p>
                  <strong>Busca instantânea no índice local</strong>
                  Nenhuma API é chamada durante esta exploração.
                </p>
              </div>
            )}
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
      </section>

      <section className="ranking" id="resultados">
        <div className="section-heading section-heading--results">
          <div>
            <span className="section-index">02 / GÊMEOS URBANOS</span>
            <h2>As correspondências mais fortes</h2>
          </div>
          <p>
            <span>{MODE_LABELS[travelMode]}</span>
            {durationMinutes} min · {SCOPE_LABELS[scope].label} ·{" "}
            {dataMode === "demo" ? TERRITORIAL_INDEX_VERSION : "Google ao vivo"}
          </p>
        </div>

        {activeResults.length > 0 && activeReference ? (
          <>
            <div className="results-map-layout">
              <TerritoryMap
                onSelect={setSelectedId}
                reference={activeReference.territory}
                results={activeResults}
                selectedId={selected?.id}
              />
              <div className="ranking-principle">
                <span>REGRA DE ORDENAÇÃO</span>
                <strong>Composição primeiro.</strong>
                <p>
                  Jensen–Shannon define a ordem. Densidade aparece como
                  contexto, nunca como atalho para ultrapassar um perfil mais
                  parecido.
                </p>
              </div>
            </div>

            <div className="results-layout">
              <div className="rank-list">
                {activeResults.slice(0, 8).map((result, index) => {
                  const similarity =
                    "similarity" in result ? result.similarity : 0;
                  const confidence =
                    "confidence" in result ? result.confidence : "NORMAL";
                  return (
                    <button
                      className={`rank-card ${
                        selected?.id === result.id ? "is-selected" : ""
                      }`}
                      key={result.id}
                      onClick={() => setSelectedId(result.id)}
                      type="button"
                    >
                      <span className="rank-card__rank">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="rank-card__place">
                        <strong>{result.territory.label}</strong>
                        <small>
                          {result.territory.city} · {result.territory.state}
                        </small>
                      </span>
                      <span className="rank-card__context">
                        {result.territory.context}
                      </span>
                      <span className="rank-card__confidence">
                        {CONFIDENCE_LABELS[confidence]}
                      </span>
                      <span className="rank-card__score">
                        <strong>{numberFormat.format(similarity)}</strong>
                        <small>afinidade JS</small>
                      </span>
                      <span className="rank-card__arrow">↗</span>
                    </button>
                  );
                })}
              </div>

              {selected && (
                <aside className="twin-detail">
                  <span className="detail-label">GÊMEO SELECIONADO</span>
                  <div className="detail-score">
                    <strong>{numberFormat.format(selectedSimilarity)}</strong>
                    <span>%<small>afinidade de composição</small></span>
                  </div>
                  <h3>
                    {activeReference.territory.label}
                    <span>↔</span>
                    {selected.territory.label}
                  </h3>
                  <p>
                    Mesma lógica de distribuição entre as funções cotidianas.
                    A intensidade relativa é mostrada separadamente.
                  </p>
                  <div className="profile-legend">
                    <span><i /> referência</span>
                    <span><i /> gêmeo</span>
                  </div>
                  <div className="profile-bars">
                    {CATEGORIES.map((category) => {
                      const referenceShare = profileShare(
                        referenceCounts,
                        category.id,
                      );
                      const twinShare = profileShare(
                        selected.counts,
                        category.id,
                      );
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
                          <small>
                            {numberFormat.format(referenceShare)} /{" "}
                            {numberFormat.format(twinShare)}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="detail-metrics">
                    <div>
                      <span>INTENSIDADE</span>
                      <strong>{numberFormat.format(selectedScale)}%</strong>
                    </div>
                    <div>
                      <span>DENSIDADE</span>
                      <strong>
                        {numberFormat.format(selected.density)} / km²
                      </strong>
                    </div>
                  </div>
                  {"leadingDriver" in selected && selected.leadingDriver && (
                    <div className="detail-note">
                      <strong>Maior diferença</strong>
                      <span>
                        {CATEGORY_BY_ID[selected.leadingDriver].label} é a
                        função que mais separa os dois perfis.
                      </span>
                    </div>
                  )}
                </aside>
              )}
            </div>
          </>
        ) : (
          <div className="empty-result">
            {dataMode === "live"
              ? "Confirme a busca ao vivo para gerar o ranking."
              : "Não há outro território neste recorte. Amplie a busca."}
          </div>
        )}
      </section>

      <section className="method" id="metodo">
        <div className="method-intro">
          <span className="section-index">03 / MÉTODO ABERTO</span>
          <h2>O score tem uma função — e um limite.</h2>
          <p>
            O AccessTwin não tenta dizer se um lugar é “melhor”. Ele responde
            uma pergunta específica: quais territórios distribuem suas funções
            cotidianas de maneira mais parecida?
          </p>
        </div>
        <div className="method-grid">
          <article>
            <span>01</span>
            <h3>Mesmo tempo</h3>
            <p>Comparamos áreas alcançáveis na mesma janela de deslocamento.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Oito funções</h3>
            <p>Comida, saúde, educação, cultura, mobilidade e vida cívica.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Jensen–Shannon</h3>
            <p>A métrica compara proporções e define integralmente a ordem.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Confiança visível</h3>
            <p>Bases pequenas são sinalizadas e nunca fingem precisão.</p>
          </article>
        </div>
        <div className="method-ledger">
          <span>O QUE ENTRA</span>
          <p>composição funcional · intensidade · área · fonte · data</p>
          <span>O QUE NÃO ENTRA</span>
          <p>segurança · preço · qualidade · preferência pessoal</p>
        </div>
      </section>

      <footer>
        <a className="brand brand--footer" href="#top">
          <BrandMark />
          <span><strong>AccessTwin</strong><small>atlas de afinidades urbanas</small></span>
        </a>
        <p>Territórios diferentes. Cotidianos surpreendentemente próximos.</p>
        <span>Porto Alegre · 2026</span>
      </footer>
    </main>
  );
}
