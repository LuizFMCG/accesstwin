# AccessTwin

Atlas exploratório de afinidades urbanas. A pessoa escolhe um território de
referência e o produto procura automaticamente, em todo o recorte disponível,
os territórios cuja composição funcional é mais parecida.

## Decisão metodológica

O ranking principal é determinado integralmente pela similaridade de composição
Jensen–Shannon:

```text
similaridade = 1 - distância Jensen–Shannon
```

Densidade e volume aparecem como dimensões complementares. Eles explicam se
dois lugares têm intensidade parecida, mas não alteram a ordem principal.
Perfis com menos de dez observações são considerados insuficientes e aparecem
depois dos resultados publicáveis.

## Índice territorial

O produto opera sobre um contrato de índice versionado:

- território, cidade, estado, país e coordenadas;
- contagens nas oito funções urbanas;
- total, área e densidade;
- fonte, data de indexação, versão do índice e versão da taxonomia.

O índice demonstrativo contém 22 territórios sintéticos e determinísticos do
Brasil, Argentina e Uruguai. Ele valida interface, método e arquitetura sem
custos de API; não descreve empiricamente esses bairros.

`src/lib/territorial-index.ts` concentra a construção e a busca. A mesma forma
de dados recebe futuramente perfis reais pré-calculados.

## Modo Google ao vivo

O modo ao vivo usa Google Maps Isochrones e Places Aggregate. Ele continua sendo
um piloto controlado, não uma varredura nacional. Cada busca:

- exige confirmação;
- analisa uma referência e no máximo quatro candidatos;
- informa previamente o teto de chamadas;
- aplica cache;
- limita análises por cliente e por dia;
- pode ser desligada imediatamente por variável de ambiente.

Variáveis de proteção:

```dotenv
ACCESSTWIN_LIVE_ENABLED=true
ACCESSTWIN_RATE_LIMIT=12
ACCESSTWIN_DAILY_ANALYSIS_LIMIT=100
ACCESSTWIN_CACHE_TTL_HOURS=24
```

Os limites da aplicação complementam, mas não substituem, budgets, alertas,
restrições de chave e quotas configurados no Google Cloud. O contador em memória
é uma última barreira do MVP; uma operação pública em múltiplas instâncias deve
persistir uso e cache em um banco compartilhado.

## Construir um índice real em lote

O script de indexação chama uma instância local do AccessTwin, respeitando os
mesmos controles da API. Ele nasce bloqueado e só roda com autorização explícita
e um teto definido:

```powershell
$env:ACCESSTWIN_ALLOW_PAID_INDEX_BUILD = "YES"
$env:ACCESSTWIN_INDEX_MAX_PROFILES = "5"
$env:ACCESSTWIN_INDEX_DURATION_MINUTES = "15"
$env:ACCESSTWIN_INDEX_TRAVEL_MODE = "WALK"
npm run index:live
```

O arquivo gerado fica em `data/*.generated.json` e não é versionado
automaticamente. Revise cobertura, custo, confiança e proveniência antes de
promover qualquer índice.

## Desenvolvimento

```powershell
Set-Location D:\accesstwin
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Abra `http://127.0.0.1:3000`.

## Verificação

```powershell
npm run check
```

O fluxo executa lint, verificação de tipos, testes, build Next.js e build de
hospedagem. Os testes cobrem métrica, ranking, confiança, índice territorial,
taxonomia, geometrias, contratos das APIs e proteção da chave do servidor.

## O que o score não mede

O AccessTwin mede semelhança de composição funcional. Segurança, preço,
qualidade, barreiras percebidas e preferência pessoal não entram no score. A
Isochrones API ainda não oferece transporte público, e a classificação de
Places não substitui uma auditoria territorial.
