// RESUMO DE FECHAMENTO (25/08/2026) — o motor, sem React, para poder ser testado.
//
// É o documento que o Lucas leva para a reunião de fechamento ("RESUMO DE
// FECHAMENTO JULHO"). A regra que organiza tudo: o app CALCULA o que sai dos
// lançamentos e a pessoa só digita o que é decisão de reunião ou o que só quem
// olha o banco sabe.
//
// DUAS REGRAS DA CASA, ditas pelo Lucas:
//  1. "é o fechamento na qual não tem nenhum valor do crediário" — o crediário
//     é controle interno (dinheiro em espécie no cofre) e NÃO entra aqui.
//  2. "no final da página o lucro sempre vai ser dividido pra Andrya 80% e pro
//     Daniel 20%, só por questões judiciais" — a divisão é fixa e calculada.
import { buildGestaoMensal, type FinCategory, type FinExpense, type FinSale, type GestaoMensal } from "./financeiroData";
import type { FinProvisionRule } from "./financeiroData";

/** A parte ESCRITA por gente — o que o app não tem como saber. */
export type FechamentoEscrito = {
  /** Saldos das contas no dia do fechamento. */
  saldoItau: string;
  saldoSafra: string;
  saldoSafraNota: string;
  saldoSantander: string;
  dinheiro: string;
  /** Adiantamentos combinados. */
  adiantamentos: string;
  /** "Ficou acordado o provisionamento apenas do:" */
  provisionamentoAcordado: string;
  /** Quanto do provisionamento foi de fato separado. */
  provisionamentoValor: string;
  /** Pagamentos feitos pela conta sócia. */
  pagamentosContaSocia: string;
  /** Lucro REAL distribuído (pode ser menor que o lucro do mês). */
  lucroDistribuido: string;
};

export const fechamentoEscritoVazio: FechamentoEscrito = {
  saldoItau: "",
  saldoSafra: "",
  saldoSafraNota: "",
  saldoSantander: "conta inativa",
  dinheiro: "",
  adiantamentos: "",
  provisionamentoAcordado: "",
  provisionamentoValor: "",
  pagamentosContaSocia: "",
  lucroDistribuido: "",
};

/** A divisão é fixa por decisão societária/judicial. */
export const DIVISAO_LUCRO = { andrya: 0.8, daniel: 0.2 } as const;

/**
 * A categoria da provisão de impostos do mês. Confirmado na produção: em julho
 * essa categoria tem exatamente os R$ 16.813,07 da linha IMPOSTOS do documento
 * (a soma do imposto mensal com o trimestral que o Lucas fazia à mão na
 * tabelinha IMP MENSAL / IMP TRIMES).
 */
export const CATEGORIA_IMPOSTOS_PROVISAO = "cat-poup-impostos-mensais";

export type LinhaProvisao = { nome: string; valor: number };

export type ResumoFechamento = {
  monthKey: string;
  /** Saldos digitados, já em número. */
  saldos: { itau: number; safra: number; santander: number; dinheiro: number; total: number };
  /** Entrada do mês COM a provisão de impostos somada (como no documento). */
  entradaTotalComImpostos: number;
  /** Entrada sem impostos = faturamento das comandas (a régua da meta da equipe). */
  entradaSemImpostos: number;
  saidaTotal: number;
  meta: number;
  /** Quanto falta (positivo) ou passou (negativo) da meta. */
  faltaParaMeta: number;
  bateuMeta: boolean;
  /** Provisões: impostos do mês + as regras fixas (13º, férias, urgências…). */
  impostosProvisionados: number;
  provisoesFixas: LinhaProvisao[];
  totalProvisoes: number;
  /** Lucro do mês pelos lançamentos (sem crediário). */
  lucroDoMes: number;
  /** O que a reunião decidiu distribuir (cai para o lucro do mês se em branco). */
  lucroDistribuido: number;
  divisao: { andrya: number; daniel: number };
  adiantamentos: number;
  provisionamentoAcordadoValor: number;
};

const numero = (texto: string) => {
  const limpo = (texto || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : 0;
};
const cents = (valor: number) => Math.round(valor * 100) / 100;

export function buildResumoFechamento(values: {
  sales: FinSale[];
  expenses: FinExpense[];
  categories: FinCategory[];
  provisionRules: FinProvisionRule[];
  monthKey: string;
  /** Meta da equipe no mês (super-supermeta é a régua do painel; aqui é a meta acordada). */
  meta: number;
  escrito: FechamentoEscrito;
  /** Categoria da provisão de impostos, para separar dos outros custos. */
  categoriaImpostos: string;
}): ResumoFechamento {
  // CREDIÁRIO FORA: buildGestaoMensal recebe [] de propósito — o documento do
  // fechamento não leva o crediário (regra do Lucas).
  const gestao: GestaoMensal = buildGestaoMensal(
    values.sales,
    values.expenses,
    values.categories,
    values.monthKey,
    [],
  );

  const impostosProvisionados = cents(
    values.expenses
      .filter(
        (expense) =>
          expense.categoryRef === values.categoriaImpostos &&
          (expense.dueDate || expense.paidAt || "").slice(0, 7) === values.monthKey,
      )
      .reduce((soma, expense) => soma + (expense.amount || 0), 0),
  );

  const provisoesFixas = values.provisionRules
    .filter((regra) => regra.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((regra) => ({ nome: regra.name, valor: cents(regra.monthlyAmount || 0) }));

  const totalProvisoes = cents(
    impostosProvisionados + provisoesFixas.reduce((soma, linha) => soma + linha.valor, 0),
  );

  const itau = numero(values.escrito.saldoItau);
  const safra = numero(values.escrito.saldoSafra);
  const santander = numero(values.escrito.saldoSantander);
  const dinheiro = numero(values.escrito.dinheiro);

  const entradaSemImpostos = cents(gestao.faturamento);
  // No documento a "ENTRADA TOTAL + IMPOSTOS PROV" soma a provisão de impostos
  // à entrada — é o dinheiro que passou pela conta antes de separar o imposto.
  const entradaTotalComImpostos = cents(entradaSemImpostos + impostosProvisionados);
  const lucroDoMes = cents(gestao.lucroLiquido);

  const digitado = numero(values.escrito.lucroDistribuido);
  const lucroDistribuido = values.escrito.lucroDistribuido.trim() ? cents(digitado) : lucroDoMes;

  return {
    monthKey: values.monthKey,
    saldos: { itau, safra, santander, dinheiro, total: cents(itau + safra + santander + dinheiro) },
    entradaTotalComImpostos,
    entradaSemImpostos,
    saidaTotal: cents(gestao.custosTotais),
    meta: cents(values.meta),
    faltaParaMeta: cents(values.meta - entradaSemImpostos),
    bateuMeta: entradaSemImpostos >= values.meta,
    impostosProvisionados,
    provisoesFixas,
    totalProvisoes,
    lucroDoMes,
    lucroDistribuido,
    divisao: {
      andrya: cents(lucroDistribuido * DIVISAO_LUCRO.andrya),
      daniel: cents(lucroDistribuido * DIVISAO_LUCRO.daniel),
    },
    adiantamentos: numero(values.escrito.adiantamentos),
    provisionamentoAcordadoValor: numero(values.escrito.provisionamentoValor),
  };
}

/**
 * OS ÚLTIMOS N MESES, sempre (25/08/2026). Antes a lista de meses do painel
 * saía só dos lançamentos JÁ CARREGADOS — e como o app carrega um ANO por vez,
 * era impossível chegar em 2025: o mês não aparecia na lista, e sem selecionar
 * o mês o ano não era carregado. Um ovo-e-galinha que escondia o histórico.
 */
export function ultimosMeses(mesBase: string, quantos = 24): string[] {
  const [ano, mes] = mesBase.split("-").map(Number);
  const lista: string[] = [];
  for (let passo = 0; passo < quantos; passo += 1) {
    const data = new Date(ano, mes - 1 - passo, 1);
    lista.push(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`);
  }
  return lista;
}
