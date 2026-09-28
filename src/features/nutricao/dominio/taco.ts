// LEITURA DA TACO 4ª ED. (28/09/2026).
//
// Os valores nutricionais do módulo vêm só da Tabela Brasileira de Composição
// de Alimentos, 4ª edição (NEPA/Unicamp, 2011), a partir da planilha oficial.
// Nada é digitado à mão: tools/taco/converter.ts lê o xlsx e usa estas funções
// para gerar dados/taco-4ed.json.
//
// Como a planilha escreve as células:
// - "Tr" (traço) é valor muito pequeno: conta como 0 e fica anotado em `tracos`;
// - "NA" é "não aplicável" na legenda da TACO: o nutriente não existe naquele
//   alimento (carboidrato e proteína do azeite, por exemplo) e conta 0;
// - "*" (análise em reavaliação) e vazio são ausência: viram null, nunca 0,
//   para o cálculo poder avisar (é o caso do leite integral);
// - números com ponto decimal, às vezes em notação científica (2.03E-2).
// E as linhas: o cabeçalho se repete a cada página; linha de grupo tem texto só
// na primeira coluna; linha de alimento começa pelo número do item.
//
// Só `import type` aqui: o conversor roda este arquivo direto no Node, que
// apaga os tipos e não resolve imports sem extensão.
import type { Alimento, Composicao100g, Nutriente } from "./tipos";

/** Colunas da aba "CMVCol taco3". */
const COLUNA: Record<Nutriente, number> = { kcal: 3, cho: 8, ptn: 5, lip: 6, fibra: 9 };
const ORDEM: Nutriente[] = ["kcal", "cho", "ptn", "lip", "fibra"];
const NUMERO = /^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;

export function valorTaco(celula: string): { valor: number | null; traco: boolean } {
  const texto = (celula ?? "").trim();
  if (/^tr$/i.test(texto)) return { valor: 0, traco: true };
  if (/^na$/i.test(texto)) return { valor: 0, traco: false };
  if (!NUMERO.test(texto)) return { valor: null, traco: false };
  const valor = Number(texto);
  return { valor: Number.isFinite(valor) ? valor : null, traco: false };
}

/** Duas casas decimais, sem "-0". */
function duasCasas(valor: number): number {
  const arredondado = Math.round(valor * 100) / 100;
  return arredondado === 0 ? 0 : arredondado;
}

function limpar(texto: string | undefined): string {
  return (texto ?? "").replace(/\s+/g, " ").trim();
}

/** Texto na primeira coluna e nada nas outras (o cabeçalho repetido tem texto nas outras). */
function ehLinhaDeGrupo(linha: string[]): boolean {
  const primeira = limpar(linha[0]);
  if (!primeira || /^\d+$/.test(primeira)) return false;
  return linha.slice(1).every((celula) => !limpar(celula));
}

export function linhasTacoParaAlimentos(linhas: string[][]): Alimento[] {
  const alimentos: Alimento[] = [];
  let grupo = "";
  for (const linha of linhas) {
    if (ehLinhaDeGrupo(linha)) {
      grupo = limpar(linha[0]);
      continue;
    }
    const numero = limpar(linha[0]);
    const nome = limpar(linha[1]);
    if (!/^\d+$/.test(numero) || !nome) continue;

    const n = Number(numero);
    const por100g = {} as Composicao100g;
    const tracos: Nutriente[] = [];
    for (const nutriente of ORDEM) {
      const { valor, traco } = valorTaco(linha[COLUNA[nutriente]] ?? "");
      por100g[nutriente] = valor === null ? null : duasCasas(valor);
      if (traco) tracos.push(nutriente);
    }
    alimentos.push({
      id: `taco-${n}`,
      nome,
      grupo,
      por100g,
      tracos,
      fonte: { tabela: "TACO 4ª ed.", referencia: `NEPA/Unicamp, 2011 · item ${n}` },
    });
  }
  return alimentos;
}
