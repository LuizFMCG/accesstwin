import type { Origin } from "./types";

export type Territory = Origin & {
  id: string;
  city: string;
  state: string;
  country: "Brasil" | "Argentina" | "Uruguai";
  context: string;
};

export const TERRITORIES: readonly Territory[] = [
  { id: "cidade-baixa", label: "Cidade Baixa", city: "Porto Alegre", state: "RS", country: "Brasil", latitude: -30.0378, longitude: -51.2196, context: "central, cultural e caminhável" },
  { id: "bom-fim", label: "Bom Fim", city: "Porto Alegre", state: "RS", country: "Brasil", latitude: -30.0316, longitude: -51.2116, context: "misto, universitário e cotidiano" },
  { id: "moinhos", label: "Moinhos de Vento", city: "Porto Alegre", state: "RS", country: "Brasil", latitude: -30.0254, longitude: -51.2023, context: "serviços, gastronomia e alta intensidade" },
  { id: "menino-deus", label: "Menino Deus", city: "Porto Alegre", state: "RS", country: "Brasil", latitude: -30.0569, longitude: -51.2188, context: "residencial, serviços e parques" },
  { id: "centro-poa", label: "Centro Histórico", city: "Porto Alegre", state: "RS", country: "Brasil", latitude: -30.0303, longitude: -51.2287, context: "centralidade cívica e comércio" },
  { id: "batel", label: "Batel", city: "Curitiba", state: "PR", country: "Brasil", latitude: -25.4411, longitude: -49.2857, context: "serviços, compras e gastronomia" },
  { id: "centro-curitiba", label: "Centro", city: "Curitiba", state: "PR", country: "Brasil", latitude: -25.4296, longitude: -49.2719, context: "centralidade metropolitana e mobilidade" },
  { id: "savassi", label: "Savassi", city: "Belo Horizonte", state: "MG", country: "Brasil", latitude: -19.9385, longitude: -43.9342, context: "cultura, trabalho e vida noturna" },
  { id: "santa-teresa-rio", label: "Santa Teresa", city: "Rio de Janeiro", state: "RJ", country: "Brasil", latitude: -22.9219, longitude: -43.1884, context: "cultura, relevo e turismo" },
  { id: "botafogo", label: "Botafogo", city: "Rio de Janeiro", state: "RJ", country: "Brasil", latitude: -22.9519, longitude: -43.1812, context: "misto, conectado e intenso" },
  { id: "pinheiros", label: "Pinheiros", city: "São Paulo", state: "SP", country: "Brasil", latitude: -23.5666, longitude: -46.6911, context: "trabalho, cultura e gastronomia" },
  { id: "santa-cecilia", label: "Santa Cecília", city: "São Paulo", state: "SP", country: "Brasil", latitude: -23.5393, longitude: -46.6495, context: "central, denso e diverso" },
  { id: "cambui", label: "Cambuí", city: "Campinas", state: "SP", country: "Brasil", latitude: -22.8937, longitude: -47.0557, context: "serviços e vida de bairro" },
  { id: "asa-sul", label: "Asa Sul", city: "Brasília", state: "DF", country: "Brasil", latitude: -15.8174, longitude: -47.9004, context: "planejado, verde e setorizado" },
  { id: "rio-vermelho", label: "Rio Vermelho", city: "Salvador", state: "BA", country: "Brasil", latitude: -13.0103, longitude: -38.4891, context: "cultura, gastronomia e litoral" },
  { id: "boa-viagem", label: "Boa Viagem", city: "Recife", state: "PE", country: "Brasil", latitude: -8.1197, longitude: -34.8991, context: "litoral, serviços e alta densidade" },
  { id: "meireles", label: "Meireles", city: "Fortaleza", state: "CE", country: "Brasil", latitude: -3.7319, longitude: -38.4991, context: "litoral, turismo e serviços" },
  { id: "centro-floripa", label: "Centro", city: "Florianópolis", state: "SC", country: "Brasil", latitude: -27.5969, longitude: -48.5495, context: "comércio, serviços e conexão insular" },
  { id: "pocitos", label: "Pocitos", city: "Montevidéu", state: "Montevidéu", country: "Uruguai", latitude: -34.9098, longitude: -56.1506, context: "litoral, serviços e caminhabilidade" },
  { id: "cordon", label: "Cordón", city: "Montevidéu", state: "Montevidéu", country: "Uruguai", latitude: -34.9011, longitude: -56.1774, context: "universitário, cultural e central" },
  { id: "palermo-ba", label: "Palermo", city: "Buenos Aires", state: "CABA", country: "Argentina", latitude: -34.578, longitude: -58.426, context: "parques, gastronomia e alta intensidade" },
  { id: "san-telmo", label: "San Telmo", city: "Buenos Aires", state: "CABA", country: "Argentina", latitude: -34.6211, longitude: -58.3731, context: "histórico, cultural e turístico" },
];

export type SearchScope = "state" | "country" | "region";

export function territoriesInScope(
  reference: Territory,
  scope: SearchScope,
): Territory[] {
  return TERRITORIES.filter((territory) => {
    if (territory.id === reference.id) return false;
    if (scope === "state") {
      return (
        territory.country === reference.country &&
        territory.state === reference.state
      );
    }
    if (scope === "country") return territory.country === reference.country;
    return true;
  });
}
