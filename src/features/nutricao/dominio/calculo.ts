// CÁLCULO DO PLANO ALIMENTAR (28/09/2026).
//
// Conta determinística, sem IA e sem valor inventado: gramas do item ×
// composição por 100 g do alimento da tabela. Regras ditadas pela Dra. Géssica
// no áudio de 28/09/2026:
// - Só a primeira opção de cada item entra. As substituições
//   (item.alternativas) aparecem no documento e ficam fora da conta.
// - Refeição marcada como opcional entra na conta.
// - 5 g de azeite de preparo entram no almoço e no jantar "sempre que tiver
//   legumes e verduras ali no almoço e no jantar", sem aparecer no documento.
//   refeicao.azeitePreparo true/false é a decisão dela; null segue a regra.
// - Tabela de calorias, carboidrato, proteína e gordura: g/kg com uma casa
//   ("só o número depois da vírgula, 1,5, 1,8"), gramas inteiras e percentual
//   inteiro. Exemplo dela: proteína 1,5 g/kg, 120 g, 30% do plano.
//
// Nada some em silêncio: item sem gramas, sem alimento, com nutriente ausente,
// plano sem peso ou azeite não configurado viram aviso. Arredonda só no fim.
import type { Alimento, Id, Nutriente, Refeicao } from "./tipos";

/** Somas sem arredondar. */
export type Totais = { kcal: number; cho: number; ptn: number; lip: number; fibra: number };

/** oculto = linha do azeite de preparo (entra na conta, não aparece no documento). */
export type LinhaCalculo = { refeicaoId: Id; itemId: Id | null; descricao: string; gramas: number; totais: Totais; oculto: boolean };

export type AvisoCalculo = {
  tipo: "sem_gramas" | "sem_alimento" | "sem_composicao" | "sem_peso" | "sem_azeite";
  refeicaoId: Id | null;
  itemId: Id | null;
  descricao: string;
};

export type Macro = { g: number; gkg: number | null; pct: number };

export type ResultadoCalculo = {
  linhas: LinhaCalculo[];
  porRefeicao: { refeicaoId: Id; nome: string; totais: Totais; kcal: number }[];
  total: Totais;
  /** Inteiro, conforme opcoes.caloriasPor. */
  kcal: number;
  macros: { cho: Macro; ptn: Macro; lip: Macro };
  /** Inteiro. */
  fibraG: number;
  avisos: AvisoCalculo[];
  azeiteIncluido: { refeicaoId: Id; gramas: number }[];
  /** Legumes e verduras de consumo livre (sem gramas): fora da conta, sem aviso. */
  livres: { refeicaoId: Id; itemId: Id; descricao: string }[];
};

export type OpcoesCalculo = {
  azeiteGramas: number;
  azeite: Alimento | null;
  pesoKg: number | null;
  /** "macros": 4 × carboidrato + 4 × proteína + 9 × gordura; "tabela": soma da energia da tabela. */
  caloriasPor: "macros" | "tabela";
};

/** Nutrientes que, ausentes na tabela, geram aviso. A fibra não entra aqui. */
const NUTRIENTES_AVISADOS: { chave: Nutriente; nome: string }[] = [
  { chave: "kcal", nome: "energia" },
  { chave: "cho", nome: "carboidrato" },
  { chave: "ptn", nome: "proteína" },
  { chave: "lip", nome: "gordura" },
];

function zerados(): Totais {
  return { kcal: 0, cho: 0, ptn: 0, lip: 0, fibra: 0 };
}

function somar(a: Totais, b: Totais): Totais {
  return { kcal: a.kcal + b.kcal, cho: a.cho + b.cho, ptn: a.ptn + b.ptn, lip: a.lip + b.lip, fibra: a.fibra + b.fibra };
}

/** Energia pelos macros (4/4/9), sem arredondar. */
function energiaMacros(t: Totais): number {
  return 4 * t.cho + 4 * t.ptn + 9 * t.lip;
}

function energia(t: Totais, caloriasPor: OpcoesCalculo["caloriasPor"]): number {
  return caloriasPor === "tabela" ? t.kcal : energiaMacros(t);
}

/** "a", "a e b", "a, b e c" — sempre a letra e. */
function listaEmTexto(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** null = segue a regra (almoço ou jantar com item de legumes e verduras); true ou false = decisão dela. */
export function azeiteSeAplica(refeicao: Refeicao): boolean {
  if (refeicao.azeitePreparo === true || refeicao.azeitePreparo === false) return refeicao.azeitePreparo;
  const tipoComAzeite = refeicao.tipo === "almoco" || refeicao.tipo === "jantar";
  return tipoComAzeite && refeicao.itens.some((item) => item.legumes);
}

/** gramas / 100 × composição por 100 g. Nutriente ausente (null) conta como 0 — quem chama avisa. */
export function nutrientesDoItem(gramas: number, alimento: Alimento): Totais {
  const fator = gramas / 100;
  const c = alimento.por100g;
  return {
    kcal: fator * (c.kcal ?? 0),
    cho: fator * (c.cho ?? 0),
    ptn: fator * (c.ptn ?? 0),
    lip: fator * (c.lip ?? 0),
    fibra: fator * (c.fibra ?? 0),
  };
}

/** Aviso de nutriente ausente, ou null quando energia e macros estão todos na tabela. */
function avisoDeComposicao(alimento: Alimento, refeicaoId: Id, itemId: Id | null, descricao: string): AvisoCalculo | null {
  const faltando = NUTRIENTES_AVISADOS.filter((n) => alimento.por100g[n.chave] === null).map((n) => n.nome);
  if (!faltando.length) return null;
  return {
    tipo: "sem_composicao",
    refeicaoId,
    itemId,
    descricao: `${descricao}: sem valor de ${listaEmTexto(faltando)} na tabela (${alimento.nome}), contado como 0.`,
  };
}

/**
 * Arredondamento pelo maior resto: inteiros que somam exatamente 100 quando a
 * soma da entrada é maior que zero; tudo zero caso contrário. Empate no resto
 * fica com quem vem primeiro, para o resultado não mudar de uma vez para outra.
 */
export function arredondarPercentuais(valores: number[]): number[] {
  const soma = valores.reduce((a, b) => a + b, 0);
  if (!(soma > 0)) return valores.map(() => 0);
  const exatos = valores.map((v) => (v * 100) / soma);
  const inteiros = exatos.map((v) => Math.floor(v));
  let faltam = 100 - inteiros.reduce((a, b) => a + b, 0);
  const ordem = exatos
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; faltam > 0 && ordem.length > 0; k = (k + 1) % ordem.length) {
    inteiros[ordem[k].i] += 1;
    faltam -= 1;
  }
  return inteiros;
}

export function calcularPlano(refeicoes: Refeicao[], alimentos: Record<Id, Alimento>, opcoes: OpcoesCalculo): ResultadoCalculo {
  const linhas: LinhaCalculo[] = [];
  const avisos: AvisoCalculo[] = [];
  const azeiteIncluido: { refeicaoId: Id; gramas: number }[] = [];
  const porRefeicao: ResultadoCalculo["porRefeicao"] = [];
  const livres: ResultadoCalculo["livres"] = [];

  for (const refeicao of refeicoes) {
    let totaisRefeicao = zerados();

    // Só a opção principal: item.alternativas nunca é lido aqui.
    for (const item of refeicao.itens) {
      const semGramas = item.gramas === null || !(item.gramas > 0);
      const alimento = item.alimentoId ? alimentos[item.alimentoId] : undefined;
      // Legumes e verduras "à vontade": consumo livre, fora da conta e sem aviso.
      if (item.legumes && semGramas) {
        livres.push({ refeicaoId: refeicao.id, itemId: item.id, descricao: item.descricao });
        continue;
      }
      if (semGramas) {
        avisos.push({ tipo: "sem_gramas", refeicaoId: refeicao.id, itemId: item.id, descricao: `${item.descricao}: sem gramas, fora do cálculo.` });
      }
      if (!alimento) {
        avisos.push({ tipo: "sem_alimento", refeicaoId: refeicao.id, itemId: item.id, descricao: `${item.descricao}: sem alimento da tabela, fora do cálculo.` });
      }
      if (semGramas || !alimento || item.gramas === null) continue;

      const aviso = avisoDeComposicao(alimento, refeicao.id, item.id, item.descricao);
      if (aviso) avisos.push(aviso);
      const totais = nutrientesDoItem(item.gramas, alimento);
      linhas.push({ refeicaoId: refeicao.id, itemId: item.id, descricao: item.descricao, gramas: item.gramas, totais, oculto: false });
      totaisRefeicao = somar(totaisRefeicao, totais);
    }

    if (azeiteSeAplica(refeicao) && opcoes.azeiteGramas > 0) {
      if (!opcoes.azeite) {
        avisos.push({
          tipo: "sem_azeite",
          refeicaoId: refeicao.id,
          itemId: null,
          descricao: `${refeicao.nome}: azeite de preparo não configurado, ${opcoes.azeiteGramas} g fora do cálculo.`,
        });
      } else {
        const descricao = `Azeite de preparo (${opcoes.azeite.nome})`;
        const aviso = avisoDeComposicao(opcoes.azeite, refeicao.id, null, descricao);
        if (aviso) avisos.push(aviso);
        const totais = nutrientesDoItem(opcoes.azeiteGramas, opcoes.azeite);
        linhas.push({ refeicaoId: refeicao.id, itemId: null, descricao, gramas: opcoes.azeiteGramas, totais, oculto: true });
        azeiteIncluido.push({ refeicaoId: refeicao.id, gramas: opcoes.azeiteGramas });
        totaisRefeicao = somar(totaisRefeicao, totais);
      }
    }

    porRefeicao.push({ refeicaoId: refeicao.id, nome: refeicao.nome, totais: totaisRefeicao, kcal: Math.round(energia(totaisRefeicao, opcoes.caloriasPor)) });
  }

  const total = porRefeicao.reduce((acc, r) => somar(acc, r.totais), zerados());

  const peso = opcoes.pesoKg !== null && opcoes.pesoKg > 0 ? opcoes.pesoKg : null;
  if (peso === null) {
    avisos.push({ tipo: "sem_peso", refeicaoId: null, itemId: null, descricao: "Sem peso de referência: g/kg não calculado." });
  }
  // g × 10 / peso, arredondado uma vez só: 1,5 e não 1,4999…
  const gkg = (g: number) => (peso === null ? null : Math.round((g * 10) / peso) / 10);
  const [pctCho, pctPtn, pctLip] = arredondarPercentuais([4 * total.cho, 4 * total.ptn, 9 * total.lip]);

  return {
    linhas,
    porRefeicao,
    total,
    kcal: Math.round(energia(total, opcoes.caloriasPor)),
    macros: {
      cho: { g: Math.round(total.cho), gkg: gkg(total.cho), pct: pctCho },
      ptn: { g: Math.round(total.ptn), gkg: gkg(total.ptn), pct: pctPtn },
      lip: { g: Math.round(total.lip), gkg: gkg(total.lip), pct: pctLip },
    },
    fibraG: Math.round(total.fibra),
    avisos,
    azeiteIncluido,
    livres,
  };
}
