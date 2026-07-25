# AccessTwin

Motor exploratório de afinidade urbana. Em vez de pedir que a pessoa escolha
dois lugares arbitrários, o produto recebe um território de referência e
ranqueia automaticamente os territórios com composição funcional mais parecida.

## Proposta de valor

1. delimitar o cotidiano alcançável sob o mesmo orçamento de tempo;
2. organizar a oferta em oito funções urbanas comparáveis;
3. medir proximidade entre distribuições com Jensen–Shannon;
4. procurar e explicar os gêmeos urbanos no estado, país ou região.

O ranking principal pondera:

```text
82% × similaridade de composição Jensen–Shannon
+ 18% × aderência de densidade
```

Distância geográfica não entra no score. O painel mantém composição, volume e
densidade separados para não confundir “mesmo mix” com “mesma escala”.

## Modos de dados

### Explorar sem custo

Compara localmente um catálogo de 22 territórios do Brasil, Argentina e Uruguai.
Os perfis são sintéticos e determinísticos: validam o fluxo, a marca e a hipótese
de produto, mas não descrevem empiricamente os bairros.

### Google ao vivo

Usa Google Maps Isochrones e Places Aggregate. Para impedir consumo acidental:

- exige confirmação explícita antes da busca;
- analisa uma referência e no máximo quatro candidatos por execução;
- mostra o teto de chamadas antes da confirmação;
- mantém cache em memória por 24 horas;
- limita cada cliente a 12 análises em uma janela de 10 minutos.

O cache em memória é um guardrail de MVP, não um controle financeiro durável.
Uma versão pública precisa de armazenamento persistente, autenticação, quotas no
Google Cloud e um índice territorial pré-computado.

## Rodar localmente

```powershell
Set-Location D:\accesstwin
Copy-Item .env.example .env.local
# Preencha as chaves em .env.local para habilitar o modo ao vivo.
& "C:\Program Files\nodejs\npm.cmd" ci
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Abra `http://127.0.0.1:3000`.

## Verificação

```powershell
& "C:\Program Files\nodejs\npm.cmd" run check
```

Os testes cobrem a métrica, o ranking, a taxonomia, geometrias, contratos das
APIs e a não exposição da chave de servidor.

## Limitações

- O ranking demonstrativo usa perfis sintéticos.
- A busca ao vivo é uma shortlist econômica, não uma varredura nacional.
- A Isochrones API ainda é Preview e não oferece transporte público.
- Cobertura e classificação dos Places não são uma auditoria completa.
- Segurança, preço, qualidade, barreiras percebidas e preferência pessoal não
  entram no score.

O salto de produto seguinte é pré-calcular perfis reais de uma malha territorial
ampla. Isso permite procurar o gêmeo mais similar no país sem multiplicar
chamadas pagas a cada visita.
