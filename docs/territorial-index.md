# Arquitetura do índice territorial

## Objetivo

Separar o custo de coleta do custo de busca. A coleta é periódica e controlada;
a busca de gêmeos é uma comparação matemática local e barata.

## Fluxo-alvo

1. Uma malha territorial define unidades comparáveis.
2. Um job calcula a isócrona e as oito contagens de cada unidade.
3. Os perfis são validados, versionados e armazenados.
4. A pessoa escolhe uma referência.
5. Jensen–Shannon compara a referência com todos os perfis do recorte.
6. O produto retorna o ranking, confiança e principais divergências.

## Unidade territorial

O catálogo atual usa pontos representativos de bairros para a demonstração.
Antes de uma expansão nacional, deve-se escolher e documentar uma unidade
consistente. Hexágonos H3 são adequados para cobertura regular; bairros oficiais
são melhores para reconhecimento humano, mas variam muito em tamanho e
qualidade de limites.

Recomendação para o piloto: malha regular ou H3 em Porto Alegre, acompanhada de
nomes de bairros apenas como contexto.

## Qualidade

Todo perfil real deve conter:

- fonte e data da coleta;
- versões do índice e da taxonomia;
- janela e modo de deslocamento;
- total mínimo de observações;
- avisos de geometria e cobertura;
- estado de publicação.

Perfis vazios não recebem score. Bases abaixo de dez observações não entram na
parte publicável do ranking. Bases entre dez e dezenove aparecem com confiança
baixa.

## Custos

A indexação deve rodar por lotes pequenos, com teto diário e kill switch. Uma
referência com uma isócrona e oito categorias pode causar várias requisições;
geometrias MultiPolygon podem aumentar esse total. O planejamento financeiro
deve usar métricas reais do Google Cloud, não apenas uma estimativa da interface.

## Próxima promoção de dados

1. Indexar um lote piloto de 25 a 50 células.
2. Auditar visualmente geometrias e contagens.
3. Comparar resultados com conhecimento local.
4. Medir estabilidade entre janelas de 10, 15, 20 e 30 minutos.
5. Só então ampliar a malha e publicar o índice real.
