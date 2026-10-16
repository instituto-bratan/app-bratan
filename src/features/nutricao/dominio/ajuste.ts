// AJUSTAR AS QUANTIDADES ÀS METAS (16/10/2026).
//
// Áudio da Dra. Géssica (28/09/2026): "eu quero um plano com tantas calorias,
// com tantos gramas de proteína ou com tantos percentuais de carboidrato, eu
// quero que vocês considerem essas refeições, esses horários e esses
// alimentos". Ela escolhe os alimentos e as metas; o app acha as quantidades.
//
// Como: cada alimento do plano tem um papel pelo macronutriente que mais pesa
// nele (carboidrato, proteína ou gordura). O app acha um fator para cada papel
// (por exemplo, "carboidratos × 1,2") que leva o plano mais perto das metas,
// arredonda cada quantidade no jeito dela ("5 colheres de sopa", meia unidade,
// gramas de 5 em 5) e corrige o que o arredondamento desviou, um passo de cada
// vez. Ficam como estão: o que ela travou, legumes e verduras, frutas (a porção
// é a da lista dela), bebidas e o que não tem gramas ou alimento da tabela.
// Nada é aplicado sem ela ver o antes e o depois.
import { calcularPlano, type OpcoesCalculo, type Totais } from "./calculo";
import { arredondarPasso, escreverQuantidade, gramasRedondos, lerQuantidade } from "./quantidade";
import type { Alimento, Id, ItemRefeicao, MetasPlano, Refeicao } from "./tipos";

export type Macro3 = "cho" | "ptn" | "lip";
export type PapelNoAjuste = Macro3 | "fixo";

export type MetasEmGramas = { kcal: number; cho: number; ptn: number; lip: number };
export type ResumoMacros = { kcal: number; cho: number; ptn: number; lip: number };

export type MudancaAjuste = {
  refeicaoId: Id;
  refeicao: string;
  itemId: Id;
  descricao: string;
  antes: { quantidade: string; gramas: number | null };
  depois: { quantidade: string; gramas: number };
};

export type PropostaAjuste = {
  refeicoes: Refeicao[];
  mudancas: MudancaAjuste[];
  alvo: MetasEmGramas;
  antes: ResumoMacros;
  depois: ResumoMacros;
  mantidos: { descricao: string; motivo: string }[];
  /** Fator usado em cada papel (1 = não mudou). */
  fatores: Partial<Record<Macro3, number>>;
  /** Algum fator bateu no limite (quantidades ficariam absurdas): as metas não foram alcançadas por inteiro. */
  limitado: boolean;
  /** O que não deu para acertar e o que ela pode fazer (frases prontas para a tela). */
  avisos: string[];
};

const NOME_DO_MACRO: Record<Macro3, string> = { cho: "carboidrato", ptn: "proteína", lip: "gordura" };
const EXEMPLOS_DE_FONTE: Record<Macro3, string> = {
  cho: "arroz, pão, batata, aveia ou frutas",
  ptn: "carnes, ovos, iogurte ou queijos",
  lip: "azeite, castanhas, abacate ou pasta de amendoim",
};

/** Frases para o que ficou longe da meta (mais de 10%) e por quê. */
function avisosDoAjuste(depois: ResumoMacros, alvo: MetasEmGramas, papeis: Macro3[], limitado: boolean): string[] {
  const avisos: string[] = [];
  for (const m of MACROS) {
    const desvio = (depois[m] - alvo[m]) / Math.max(alvo[m], 1);
    if (Math.abs(desvio) <= 0.1) continue;
    const quanto = `${NOME_DO_MACRO[m]} ficou em ${Math.round(depois[m])} g (meta ${Math.round(alvo[m])} g)`;
    if (!papeis.includes(m)) avisos.push(`A ${quanto}: o plano não tem um alimento de ${NOME_DO_MACRO[m]} que o app possa mudar. Acrescente um (${EXEMPLOS_DE_FONTE[m]}) e ajuste de novo.`);
    else avisos.push(`A ${quanto}: com estes alimentos não dá para chegar mais perto sem desequilibrar o resto.`);
  }
  if (Math.abs(depois.kcal - alvo.kcal) > alvo.kcal * 0.05) avisos.push(`As calorias ficaram em ${depois.kcal} kcal (meta ${alvo.kcal} kcal).`);
  if (limitado) avisos.push("Algum grupo de alimentos chegou ao limite (4 vezes ou um quarto da quantidade original): confira as metas.");
  return avisos;
}

const FATOR_MIN = 0.25;
const FATOR_MAX = 4;
const MACROS: Macro3[] = ["cho", "ptn", "lip"];

/** O papel do alimento no ajuste e, quando fica parado, o motivo. */
export function papelDoItem(item: ItemRefeicao, alimento: Alimento | undefined): { papel: PapelNoAjuste; motivo: string | null } {
  if (item.travado) return { papel: "fixo", motivo: "você travou a quantidade" };
  if (item.legumes) return { papel: "fixo", motivo: "legumes e verduras" };
  if (!alimento || !item.gramas || item.gramas <= 0) return { papel: "fixo", motivo: "sem gramas ou sem alimento da tabela" };
  const grupo = alimento.grupo.toLowerCase();
  if (grupo.includes("fruta")) return { papel: "fixo", motivo: "fruta: a porção é a da lista" };
  if (grupo.includes("bebida")) return { papel: "fixo", motivo: "bebida" };
  if (grupo.includes("verdura") || grupo.includes("hortali")) return { papel: "fixo", motivo: "legumes e verduras" };
  if (grupo.includes("leite")) return { papel: "ptn", motivo: null };
  const c = alimento.por100g;
  const e = { cho: 4 * (c.cho ?? 0), ptn: 4 * (c.ptn ?? 0), lip: 9 * (c.lip ?? 0) };
  const soma = e.cho + e.ptn + e.lip;
  if (!(soma > 0)) return { papel: "fixo", motivo: "sem valor na tabela" };
  // Ovo, carnes e laticínios mais gordos também são "a proteína" do prato.
  if (e.ptn / soma >= 0.3) return { papel: "ptn", motivo: null };
  if (e.cho / soma >= 0.4) return { papel: "cho", motivo: null };
  return { papel: e.lip >= e.cho ? "lip" : "cho", motivo: null };
}

/**
 * Metas dela em gramas. Prioridade: calorias e proteína (g/kg × peso); o resto
 * das calorias se divide entre carboidrato e gordura pelos percentuais dela
 * ou, sem eles, na proporção que o plano já tem.
 */
export function metasEmGramas(metas: MetasPlano, pesoKg: number | null, atual: Totais): MetasEmGramas | { erro: string } {
  const K = metas.kcal;
  if (!K || K <= 0) return { erro: "Falta a meta de calorias." };
  const energia = { cho: 4 * atual.cho, ptn: 4 * atual.ptn, lip: 9 * atual.lip };
  const somaAtual = energia.cho + energia.ptn + energia.lip;

  let P: number;
  if (metas.ptnGkg && metas.ptnGkg > 0) {
    if (!pesoKg || pesoKg <= 0) return { erro: "A meta de proteína é em g/kg: falta o peso de referência." };
    P = metas.ptnGkg * pesoKg;
  } else {
    P = somaAtual > 0 ? (K * (energia.ptn / somaAtual)) / 4 : (K * 0.2) / 4;
  }
  const resto = K - 4 * P;
  if (resto <= 0) return { erro: "As metas não fecham: só a proteína já passa das calorias." };

  let C: number;
  let L: number;
  const cp = metas.choPct;
  const lp = metas.lipPct;
  if (cp !== null && cp >= 0 && lp !== null && lp >= 0) {
    const w = cp + lp;
    if (w <= 0) return { erro: "Os percentuais de carboidrato e gordura estão zerados." };
    C = (resto * (cp / w)) / 4;
    L = (resto * (lp / w)) / 9;
  } else if (cp !== null && cp >= 0) {
    C = (K * cp) / 100 / 4;
    L = (resto - 4 * C) / 9;
  } else if (lp !== null && lp >= 0) {
    L = (K * lp) / 100 / 9;
    C = (resto - 9 * L) / 4;
  } else {
    const w = energia.cho + energia.lip;
    C = w > 0 ? (resto * (energia.cho / w)) / 4 : (resto * 0.6) / 4;
    L = w > 0 ? (resto * (energia.lip / w)) / 9 : (resto * 0.4) / 9;
  }
  if (C < 0 || L < 0) return { erro: "As metas não fecham: proteína e percentuais somam mais que as calorias." };
  return { kcal: K, cho: C, ptn: P, lip: L };
}

// ------------------------------------------------------------ mínimos quadrados com limites (até 3 fatores)

/** Resolve A x = b (n × n) por eliminação de Gauss; null se não tem solução única. */
function resolver(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((linha, i) => [...linha, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let i = col + 1; i < n; i++) if (Math.abs(M[i][col]) > Math.abs(M[piv][col])) piv = i;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let i = 0; i < n; i++) {
      if (i === col) continue;
      const f = M[i][col] / M[col][col];
      for (let j = col; j <= n; j++) M[i][j] -= f * M[col][j];
    }
  }
  return M.map((linha, i) => linha[n] / linha[i]);
}

type Problema = { base: Record<Macro3, Totais3>; fixo: Totais3; alvo: Totais3 & { kcal: number } };
type Totais3 = Record<Macro3, number>;

/**
 * O que conta mais quando não dá para acertar tudo: calorias e proteína (as
 * metas que ela fala primeiro), depois carboidrato e gordura.
 */
const PESOS = { cho: 1, ptn: 3, lip: 0.5, kcal: 5 } as const;
type Linha4 = "cho" | "ptn" | "lip" | "kcal";
const LINHAS: Linha4[] = ["cho", "ptn", "lip", "kcal"];

const energiaDe = (t: Totais3) => 4 * t.cho + 4 * t.ptn + 9 * t.lip;
const valorNaLinha = (t: Totais3, l: Linha4) => (l === "kcal" ? energiaDe(t) : t[l]);

/** Desvio relativo pesado de cada linha (quanto menor, mais perto das metas). */
function erroDosTotais(t: Totais3, alvo: Problema["alvo"]): number {
  return LINHAS.reduce((s, l) => s + Math.pow((PESOS[l] * (valorNaLinha(t, l) - alvo[l])) / Math.max(alvo[l], 1), 2), 0);
}

function erroDe(fatores: Totais3, p: Problema, papeis: Macro3[]): number {
  const t: Totais3 = { ...p.fixo };
  for (const g of papeis) for (const m of MACROS) t[m] += fatores[g] * p.base[g][m];
  return erroDosTotais(t, p.alvo);
}

function melhoresFatores(p: Problema, papeis: Macro3[]): Totais3 {
  const melhor: { f: Totais3; erro: number } = { f: { cho: 1, ptn: 1, lip: 1 }, erro: Infinity };
  const opcoes = ["livre", "min", "max"] as const;
  const total = Math.pow(3, papeis.length);
  for (let k = 0; k < total; k++) {
    const escolha = papeis.map((_, i) => opcoes[Math.floor(k / Math.pow(3, i)) % 3]);
    const f: Totais3 = { cho: 1, ptn: 1, lip: 1 };
    const livres: Macro3[] = [];
    papeis.forEach((g, i) => {
      if (escolha[i] === "min") f[g] = FATOR_MIN;
      else if (escolha[i] === "max") f[g] = FATOR_MAX;
      else livres.push(g);
    });
    if (livres.length) {
      // Linhas = carboidrato, proteína, gordura e calorias (pesadas pelo alvo e pela prioridade), colunas = fatores livres.
      const escala = (l: Linha4) => PESOS[l] / Math.max(p.alvo[l], 1);
      const A = LINHAS.map((l) => livres.map((g) => valorNaLinha(p.base[g], l) * escala(l)));
      const b = LINHAS.map((l) => {
        let v = p.alvo[l] - valorNaLinha(p.fixo, l);
        for (const g of papeis) if (!livres.includes(g)) v -= f[g] * valorNaLinha(p.base[g], l);
        return v * escala(l);
      });
      const AtA = livres.map((_, i) => livres.map((__, j) => A.reduce((s, linha) => s + linha[i] * linha[j], 0)));
      const Atb = livres.map((_, i) => A.reduce((s, linha, r) => s + linha[i] * b[r], 0));
      const x = resolver(AtA, Atb);
      if (!x) continue;
      if (x.some((v) => v < FATOR_MIN - 1e-9 || v > FATOR_MAX + 1e-9)) continue;
      livres.forEach((g, i) => (f[g] = x[i]));
    }
    const erro = erroDe(f, p, papeis);
    if (erro < melhor.erro - 1e-12) {
      melhor.f = f;
      melhor.erro = erro;
    }
  }
  return melhor.f;
}

// ------------------------------------------------------------ arredondar no jeito dela e corrigir o desvio

type Ajustavel = {
  refeicaoId: Id;
  itemId: Id;
  /** macronutriente por grama */
  porGrama: Totais3;
  modo: "unidade" | "gramas";
  numero: number;
  porUnidade: number;
  unidade: string;
  gramas: number;
  /** "g"/"ml" no texto: reescrever com os gramas novos */
  textoEmGramas: boolean;
  /**
   * Arredondar só para o vizinho de baixo ou de cima do valor calculado: a
   * correção do arredondamento nunca muda a proporção entre os alimentos
   * (sem isso, ela tirava o frango para pôr ovo e "acertar" a gordura).
   */
  minimo: number;
  maximo: number;
};

/**
 * Arredondamentos aceitos para o valor exato: o de baixo e o de cima, desde
 * que não se afastem mais de 25% (meia concha de feijão no lugar de uma é
 * mudança grande demais para "arredondar"). O mais próximo sempre vale.
 */
function vizinhos(exato: number, passo: number, maisProximo: number): [number, number] {
  const baixo = Math.max(passo, Math.floor(exato / passo + 1e-9) * passo);
  const cima = Math.max(passo, Math.ceil(exato / passo - 1e-9) * passo);
  const perto = (v: number) => Math.abs(v - exato) <= exato * 0.25 + 1e-9;
  const opcoes = [baixo, cima, maisProximo].filter((v, i) => i === 2 || perto(v));
  return [Math.min(...opcoes), Math.max(...opcoes)];
}

function passoDe(a: Ajustavel): number {
  return a.modo === "unidade" ? 0.5 : a.gramas > 200 ? 10 : 5;
}

function gramasDe(a: Ajustavel, numeroOuGramas: number): number {
  return a.modo === "unidade" ? Math.round(numeroOuGramas * a.porUnidade) : numeroOuGramas;
}

function resumo(r: ReturnType<typeof calcularPlano>): ResumoMacros {
  return { kcal: r.kcal, cho: r.total.cho, ptn: r.total.ptn, lip: r.total.lip };
}

export function ajustarAsMetas(
  refeicoes: Refeicao[],
  alimentos: Record<Id, Alimento>,
  opcoes: OpcoesCalculo,
  metas: MetasPlano,
): PropostaAjuste | { erro: string } {
  const antesCalc = calcularPlano(refeicoes, alimentos, opcoes);
  const alvo = metasEmGramas(metas, opcoes.pesoKg, antesCalc.total);
  if ("erro" in alvo) return alvo;

  const base: Record<Macro3, Totais3> = { cho: { cho: 0, ptn: 0, lip: 0 }, ptn: { cho: 0, ptn: 0, lip: 0 }, lip: { cho: 0, ptn: 0, lip: 0 } };
  const papelDe = new Map<Id, Macro3>();
  const mantidos: PropostaAjuste["mantidos"] = [];
  for (const r of refeicoes) {
    for (const item of r.itens) {
      const { papel, motivo } = papelDoItem(item, item.alimentoId ? alimentos[item.alimentoId] : undefined);
      if (papel === "fixo") {
        if (item.descricao.trim()) mantidos.push({ descricao: `${r.nome} · ${item.descricao}`, motivo: motivo ?? "" });
        continue;
      }
      papelDe.set(item.id, papel);
    }
  }
  for (const linha of antesCalc.linhas) {
    const papel = linha.itemId ? papelDe.get(linha.itemId) : undefined;
    if (!papel) continue;
    for (const m of MACROS) base[papel][m] += linha.totais[m];
  }
  const fixo: Totais3 = {
    cho: antesCalc.total.cho - base.cho.cho - base.ptn.cho - base.lip.cho,
    ptn: antesCalc.total.ptn - base.cho.ptn - base.ptn.ptn - base.lip.ptn,
    lip: antesCalc.total.lip - base.cho.lip - base.ptn.lip - base.lip.lip,
  };
  const papeis = MACROS.filter((g) => base[g].cho + base[g].ptn + base[g].lip > 0);
  if (!papeis.length) return { erro: "Nenhum alimento com gramas e tabela para ajustar (os travados, legumes e frutas ficam como estão)." };

  // A meta de calorias vira a energia dos macros (4/4/9), a mesma conta das metas em gramas.
  const problema: Problema = { base, fixo, alvo: { cho: alvo.cho, ptn: alvo.ptn, lip: alvo.lip, kcal: 4 * alvo.cho + 4 * alvo.ptn + 9 * alvo.lip } };
  const fatores = melhoresFatores(problema, papeis);
  const limitado = papeis.some((g) => Math.abs(fatores[g] - FATOR_MIN) < 1e-6 || Math.abs(fatores[g] - FATOR_MAX) < 1e-6);

  // Arredonda cada alimento no jeito dela.
  const ajustaveis: Ajustavel[] = [];
  for (const r of refeicoes) {
    for (const item of r.itens) {
      const papel = papelDe.get(item.id);
      if (!papel || !item.gramas || !item.alimentoId) continue;
      const a = alimentos[item.alimentoId];
      const porGrama: Totais3 = { cho: (a.por100g.cho ?? 0) / 100, ptn: (a.por100g.ptn ?? 0) / 100, lip: (a.por100g.lip ?? 0) / 100 };
      const desejado = item.gramas * fatores[papel];
      const lida = lerQuantidade(item.quantidade);
      if (lida && lida.tipo === "caseira") {
        const porUnidade = item.gramas / lida.numero;
        const exato = desejado / porUnidade;
        const numero = arredondarPasso(exato, 0.5);
        const [minimo, maximo] = vizinhos(exato, 0.5, numero);
        ajustaveis.push({ refeicaoId: r.id, itemId: item.id, porGrama, modo: "unidade", numero, porUnidade, unidade: lida.unidade, gramas: Math.round(numero * porUnidade), textoEmGramas: false, minimo, maximo });
      } else {
        const g = gramasRedondos(desejado);
        const [minimo, maximo] = vizinhos(desejado, desejado > 200 ? 10 : 5, g);
        ajustaveis.push({ refeicaoId: r.id, itemId: item.id, porGrama, modo: "gramas", numero: g, porUnidade: 1, unidade: lida?.unidade ?? "", gramas: g, textoEmGramas: Boolean(lida), minimo, maximo });
      }
    }
  }

  // O arredondamento desvia um pouco: corrige um passo por vez enquanto melhora.
  const totalAtual = (): Totais3 => {
    const t: Totais3 = { ...fixo };
    for (const a of ajustaveis) for (const m of MACROS) t[m] += a.gramas * a.porGrama[m];
    return t;
  };
  const erroTotal = (t: Totais3) => erroDosTotais(t, problema.alvo);
  for (let volta = 0; volta < 60; volta++) {
    const t = totalAtual();
    const erroAgora = erroTotal(t);
    let melhor: { a: Ajustavel; numero: number; gramas: number; erro: number } | null = null;
    for (const a of ajustaveis) {
      for (const sentido of [-1, 1]) {
        const passo = passoDe(a);
        const numero = a.numero + sentido * passo;
        if (numero < a.minimo - 1e-9 || numero > a.maximo + 1e-9) continue;
        const gramas = gramasDe(a, numero);
        const t2: Totais3 = { cho: t.cho + (gramas - a.gramas) * a.porGrama.cho, ptn: t.ptn + (gramas - a.gramas) * a.porGrama.ptn, lip: t.lip + (gramas - a.gramas) * a.porGrama.lip };
        const e = erroTotal(t2);
        if (e < erroAgora - 1e-9 && (!melhor || e < melhor.erro)) melhor = { a, numero, gramas, erro: e };
      }
    }
    if (!melhor) break;
    melhor.a.numero = melhor.numero;
    melhor.a.gramas = melhor.gramas;
  }

  const porItem = new Map(ajustaveis.map((a) => [a.itemId, a]));
  const mudancas: MudancaAjuste[] = [];
  const novas: Refeicao[] = refeicoes.map((r) => ({
    ...r,
    itens: r.itens.map((item) => {
      const a = porItem.get(item.id);
      if (!a) return item;
      const quantidade = a.modo === "unidade" ? escreverQuantidade(a.numero, a.unidade) : a.textoEmGramas ? escreverQuantidade(a.gramas, a.unidade) : item.quantidade;
      if (quantidade === item.quantidade && a.gramas === item.gramas) return item;
      mudancas.push({ refeicaoId: r.id, refeicao: r.nome, itemId: item.id, descricao: item.descricao, antes: { quantidade: item.quantidade, gramas: item.gramas }, depois: { quantidade, gramas: a.gramas } });
      return { ...item, quantidade, gramas: a.gramas };
    }),
  }));

  const depoisCalc = calcularPlano(novas, alimentos, opcoes);
  const fatoresUsados: Partial<Record<Macro3, number>> = {};
  for (const g of papeis) fatoresUsados[g] = Math.round(fatores[g] * 100) / 100;
  const depois = resumo(depoisCalc);
  return { refeicoes: novas, mudancas, alvo, antes: resumo(antesCalc), depois, mantidos, fatores: fatoresUsados, limitado, avisos: avisosDoAjuste(depois, alvo, papeis, limitado) };
}
