# AccessTwin

Protótipo exploratório para comparar a composição das amenidades alcançáveis a
partir de dois lugares sob o mesmo orçamento de deslocamento.

O produto combina:

- Google Maps Isochrones API para delimitar alcance pela rede;
- Google Places Aggregate API para contar amenidades em oito funções urbanas;
- distância de Jensen–Shannon para comparar a composição dos dois perfis;
- métricas separadas de volume, área e densidade para não confundir mix com
  escala.

O modo **Demonstração** usa dados sintéticos determinísticos e não consome APIs.
O modo **Google ao vivo** usa APIs faturáveis e exige as duas chaves descritas em
`.env.example`.

## Rodar localmente

```powershell
Set-Location D:\ebird-platform\apps\accesstwin-web
Copy-Item .env.example .env.local
# Preencha as duas chaves em .env.local.
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Abra `http://127.0.0.1:3000`.

## Verificação

```powershell
& "C:\Program Files\nodejs\npm.cmd" run check
```

Os testes cobrem identidade, simetria, suportes disjuntos e invariância de
escala da métrica; adaptação de Polygon/MultiPolygon; orientação e limite de
vértices; taxonomia; contratos HTTP; e não exposição da chave de servidor.

## Como interpretar

O score mostrado é:

```text
similaridade = 100 × (1 − √JSD₂)
```

Ele responde “o mix de funções acessíveis é parecido?”, não “os bairros são
equivalentes?”. Volumes absolutos continuam visíveis separadamente.

Guardrails iniciais:

- menos de 10 lugares em qualquer perfil: não publicar score;
- de 10 a 19: publicar com aviso de base baixa;
- 20 ou mais: leitura normal, ainda exploratória.

Esses cortes são regras de produto provisórias, não intervalos estatísticos.

## Limitações importantes

- A Isochrones API ainda é Preview e não oferece transporte público.
- Buracos da geometria não são representáveis na Places Aggregate; o app
  sinaliza a possível sobrecontagem.
- Componentes de MultiPolygon são consultados separadamente.
- Cobertura e classificação dos Places não são uma auditoria completa do
  território.
- Segurança, preço, qualidade, barreiras percebidas e preferência pessoal não
  entram no score.

Referências: [Isochrones API](https://developers.google.com/maps/documentation/isochrones),
[Places Aggregate API](https://developers.google.com/maps/documentation/places-aggregate)
e [tipos do Places API](https://developers.google.com/maps/documentation/places/web-service/place-types).
