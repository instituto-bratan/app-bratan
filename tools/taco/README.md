# TACO 4ª ed. → `taco-4ed.json`

Atualizado em 28/09/2026.

Os valores nutricionais do módulo nutrição vêm **só** desta tabela. Nenhum
valor é digitado à mão nem gerado por IA.

## Fonte

- Tabela Brasileira de Composição de Alimentos (TACO), 4ª edição revisada e
  ampliada, NEPA/Unicamp, 2011.
- Arquivo: `Taco-4a-Edicao.xlsx`, baixado de nepa.unicamp.br em 28/09/2026.
- 322270 bytes, SHA-256
  `a66b8ec528daeabc63bc2b015fc9bd8c6d76b941c2fc0ed93a4311d449302d14`.

O conversor para se o hash do xlsx for outro. Se um dia a planilha for trocada,
confira a origem e atualize `SHA256_ESPERADO` em `converter.ts`.

## Gerar de novo

Da raiz do projeto (Node 26, que roda `.ts` direto):

```sh
node tools/taco/converter.ts
```

Grava `src/features/nutricao/dados/taco-4ed.json`. O arquivo não tem data nem
hora: rodar de novo dá o mesmo JSON, byte a byte. O teste
`tests/nutricao-taco.test.mjs` confere que o JSON guardado é igual ao que o
conversor produz hoje.

## O que o conversor faz

Lê a aba `CMVCol taco3` com o leitor do app (`src/lib/planilhaLeitor.ts`) e
converte com `src/features/nutricao/dominio/taco.ts`:

| Coluna | Campo |
| --- | --- |
| 0 número do alimento | `id` = `taco-<n>` e `fonte.referencia` = `NEPA/Unicamp, 2011 · item <n>` |
| 1 descrição | `nome` (sem espaços sobrando) |
| 3 energia (kcal) | `por100g.kcal` |
| 5 proteína (g) | `por100g.ptn` |
| 6 lipídeos (g) | `por100g.lip` |
| 8 carboidrato (g) | `por100g.cho` |
| 9 fibra alimentar (g) | `por100g.fibra` |

- Linha de grupo (texto só na primeira coluna) vira `grupo` dos alimentos
  seguintes. O cabeçalho que a planilha repete a cada página é ignorado.
- `Tr` (traço) conta como 0 e o nutriente fica listado em `tracos`.
- `NA` (não aplicável), `*` (análise em reavaliação) e célula vazia viram
  `null`. O cálculo avisa quando um nutriente é `null`, em vez de somar zero
  calado.
- Valores com duas casas decimais.
- O conversor confere 597 alimentos numerados de 1 a 597, todos com grupo.

## Cuidados com os dados

- Óleos e azeites (itens 259, 260, 267 a 272) têm proteína e carboidrato `NA`:
  ficam `null`, e o cálculo mostra aviso de composição para eles.
- Sem valores na planilha (`*`): 450 Iogurte sabor abacaxi, 457 Leite de vaca
  desnatado UHT, 458 Leite de vaca integral, 591 Coco verde cru. 516 e 517
  (sal) vêm com `NA` em energia e macros.
- O carboidrato da TACO é calculado por diferença e sai levemente negativo em 4
  itens (288, 322, 337, 400, entre -0,01 e -0,05 g). Fica como a planilha diz.
