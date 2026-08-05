import { readLocalValue, writeLocalValue } from "@/lib/localStore";

export type FinCategoryGroup = "CUSTO_FIXO" | "MAO_DE_OBRA" | "CUSTO_VARIAVEL" | "POUPANCA";
export type FinSaleItemType =
  | "CONSULTA"
  | "BIOIMPEDANCIA"
  | "TRATAMENTO"
  | "SINAL"
  | "RETORNO"
  | "PSICOLOGA"
  | "NUTRICIONISTA"
  | "DESTRAVAR"
  | "OUTRO";
export type FinPaymentMethod =
  | "PIX"
  | "CARTAO_CREDITO"
  | "CARTAO_DEBITO"
  | "DINHEIRO"
  | "CHEQUE"
  | "TRANSFERENCIA"
  | "BOLETO"
  | "DEBITO_CONTA";
export type FinCardMachine = "ITAU" | "SAFRA" | "OUTRA";

export type FinCategory = {
  id: string;
  groupKey: FinCategoryGroup;
  name: string;
  sortOrder: number;
  isCapex: boolean;
  active: boolean;
};

export type FinSaleItem = {
  id: string;
  itemType: FinSaleItemType;
  amount: number;
  description: string;
};

export type FinSalePayment = {
  id: string;
  method: FinPaymentMethod;
  amount: number;
  installments: number;
  cardMachine?: FinCardMachine | null;
};

export type FinAdhesion = "ABERTO" | "SIM" | "NAO";

export const adhesionLabels: Record<FinAdhesion, string> = {
  ABERTO: "Em aberto",
  SIM: "Aderiu",
  NAO: "Não aderiu",
};

export type FinSale = {
  id: string;
  saleDate: string;
  patientName: string;
  crmContactRef: string;
  notes: string;
  items: FinSaleItem[];
  payments: FinSalePayment[];
  // Aderiu ao plano de acompanhamento? Marcado na comanda (recepção/Lucas);
  // sinal NÃO significa adesão — pode ser sinal só de consulta.
  adhesion?: FinAdhesion;
  createdAt: string;
};

export type FinExpense = {
  id: string;
  description: string;
  categoryRef: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  method: FinPaymentMethod | null;
  supplier: string;
  installmentNum: number | null;
  installmentTotal: number | null;
  documentNote: string;
  isCapex: boolean;
  notes: string;
  createdAt: string;
  // "MENSAL" = repete todo mês (o app materializa a cópia do mês seguinte).
  recorrencia?: "MENSAL" | null;
};

// ---- Contas recorrentes -------------------------------------------------------
// Uma conta marcada como recorrente gera sozinha a ocorrência do mês seguinte.
// Cada ocorrência é uma conta de verdade (editável), com id determinístico
// `<raiz>~rec-YYYY-MM` — o que impede duplicar em qualquer dispositivo.

const REC_SEP = "~rec-";

export function recurringRootId(id: string) {
  const index = id.indexOf(REC_SEP);
  return index === -1 ? id : id.slice(0, index);
}

function daysInFinMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

// Próximo vencimento mensal preservando o dia (clampado em meses curtos).
export function nextMonthlyDueDate(dateISO: string, anchorDay?: number) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const wantedDay = anchorDay ?? day;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const clamped = Math.min(wantedDay, daysInFinMonth(nextYear, nextMonth));
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

// Gera as ocorrências que faltam de cada conta recorrente, até o mês seguinte
// ao atual (horizonte). Retorna SÓ as contas novas — quem chama persiste.
export function materializeRecurringExpenses(expenses: FinExpense[], todayISO: string): FinExpense[] {
  const [todayYear, todayMonth] = todayISO.split("-").map(Number);
  const horizonMonth = todayMonth === 12 ? 1 : todayMonth + 1;
  const horizonYear = todayMonth === 12 ? todayYear + 1 : todayYear;
  const horizon = `${horizonYear}-${String(horizonMonth).padStart(2, "0")}`;

  const chains = new Map<string, FinExpense[]>();
  for (const expense of expenses) {
    const root = recurringRootId(expense.id);
    const chain = chains.get(root);
    if (chain) chain.push(expense);
    else chains.set(root, [expense]);
  }

  const generated: FinExpense[] = [];
  for (const [root, chain] of chains) {
    const monthsInChain = new Set(chain.map((expense) => expense.dueDate.slice(0, 7)));
    let latest = chain[0];
    for (const expense of chain) {
      if (expense.dueDate > latest.dueDate) latest = expense;
    }
    // A corrente só continua se a ÚLTIMA ocorrência ainda estiver marcada
    // como recorrente — desmarcar a última encerra a repetição.
    if (latest.recorrencia !== "MENSAL") continue;

    const anchorDay = Number(latest.dueDate.slice(8, 10));
    let cursor = latest;
    while (true) {
      const nextDue = nextMonthlyDueDate(cursor.dueDate, anchorDay);
      const nextMonthRef = nextDue.slice(0, 7);
      if (nextMonthRef > horizon) break;
      if (!monthsInChain.has(nextMonthRef)) {
        const copy: FinExpense = {
          ...cursor,
          id: `${root}${REC_SEP}${nextMonthRef}`,
          dueDate: nextDue,
          paidAt: null,
          installmentNum: null,
          installmentTotal: null,
          createdAt: new Date().toISOString(),
          recorrencia: "MENSAL",
        };
        generated.push(copy);
        monthsInChain.add(nextMonthRef);
        cursor = copy;
      } else {
        // O mês já existe na corrente (ex.: cópia editada) — só avança o cursor.
        const existing = chain.find((expense) => expense.dueDate.slice(0, 7) === nextMonthRef);
        cursor = existing ?? { ...cursor, dueDate: nextDue };
      }
    }
  }
  return generated;
}

// ---- Parcelamento (30/07/2026) -------------------------------------------------
// Antes, "3/12" era só um RÓTULO: o app gravava uma linha e as parcelas seguintes
// nunca apareciam nos próximos meses (reclamação do Lucas). Agora a série inteira
// nasce junto, cada parcela com id determinístico `<raiz>~par-NN` — o mesmo
// truque da recorrência, que impede duplicar em qualquer aparelho.
//
// Diferença da recorrência: parcela TERMINA (tem total), recorrência é infinita.
// Por isso as duas nunca convivem na mesma conta.

const INSTALLMENT_SEP = "~par-";

// Trava contra erro de digitação (1/9999 criaria mil linhas na P12).
export const MAX_INSTALLMENTS = 72;

export function installmentRootId(id: string) {
  const index = id.indexOf(INSTALLMENT_SEP);
  return index === -1 ? recurringRootId(id) : id.slice(0, index);
}

/** Avança N meses preservando o dia (clampado em mês curto: 31/01 + 1 = 28/02). */
export function addMonthsToDue(dateISO: string, months: number, anchorDay?: number) {
  const day = anchorDay ?? Number(dateISO.slice(8, 10));
  let cursor = dateISO;
  for (let step = 0; step < months; step += 1) cursor = nextMonthlyDueDate(cursor, day);
  return cursor;
}

/** Todas as parcelas já lançadas da mesma série, da primeira para a última. */
export function installmentSeries(expenses: FinExpense[], anchor: Pick<FinExpense, "id">) {
  const root = installmentRootId(anchor.id);
  return expenses
    .filter((expense) => installmentRootId(expense.id) === root && expense.installmentTotal)
    .sort((a, b) => (a.installmentNum ?? 0) - (b.installmentNum ?? 0));
}

/**
 * As parcelas que FALTAM depois desta — é o que o app grava para a conta aparecer
 * em todos os meses até a última parcela. Devolve [] quando não é parcelado, é a
 * última parcela, ou as seguintes já existem.
 */
export function missingInstallments(expenses: FinExpense[], anchor: FinExpense): FinExpense[] {
  const total = anchor.installmentTotal ?? 0;
  const num = anchor.installmentNum ?? 1;
  if (total < 2 || num >= total || total > MAX_INSTALLMENTS) return [];

  const root = installmentRootId(anchor.id);
  const jaExistem = new Set(
    expenses
      .filter((expense) => installmentRootId(expense.id) === root)
      .map((expense) => expense.installmentNum ?? 0),
  );
  const anchorDay = Number(anchor.dueDate.slice(8, 10));
  const now = new Date().toISOString();
  const geradas: FinExpense[] = [];
  for (let parcela = num + 1; parcela <= total; parcela += 1) {
    if (jaExistem.has(parcela)) continue;
    geradas.push({
      ...anchor,
      id: `${root}${INSTALLMENT_SEP}${String(parcela).padStart(2, "0")}`,
      dueDate: addMonthsToDue(anchor.dueDate, parcela - num, anchorDay),
      paidAt: null,
      installmentNum: parcela,
      installmentTotal: total,
      // Parcela nunca é recorrente: ela acaba na última.
      recorrencia: null,
      createdAt: now,
    });
  }
  return geradas;
}

/** Parcelas seguintes ainda EM ABERTO — as que uma correção pode alcançar. */
export function futureOpenInstallments(expenses: FinExpense[], anchor: FinExpense) {
  const num = anchor.installmentNum ?? 0;
  return installmentSeries(expenses, anchor).filter(
    (expense) => (expense.installmentNum ?? 0) > num && !expense.paidAt && expense.id !== anchor.id,
  );
}

/** Resumo em português para a tela: "faltam 9 parcelas, R$ 4.500 até 10/05/2027". */
export function installmentSummary(expenses: FinExpense[], anchor: FinExpense) {
  const serie = installmentSeries(expenses, anchor);
  if (!anchor.installmentTotal || anchor.installmentTotal < 2) return null;
  const abertas = serie.filter((expense) => !expense.paidAt);
  const ultima = serie[serie.length - 1];
  return {
    lancadas: serie.length,
    total: anchor.installmentTotal,
    faltamLancar: Math.max(anchor.installmentTotal - serie.length, 0),
    abertas: abertas.length,
    valorAberto: abertas.reduce((sum, expense) => sum + (expense.amount || 0), 0),
    ultimoVencimento: ultima?.dueDate ?? anchor.dueDate,
  };
}

// Contas em aberto separadas em vencidas e chegando (vencem em até `days` dias).
// Vencidas olham no máximo `maxOverdueDays` para trás — histórico importado ou
// esquecido de meses fechados não inunda o aviso.
export function upcomingExpenses(expenses: FinExpense[], todayISO: string, days: number, maxOverdueDays = 60) {
  const shift = (base: string, deltaDays: number) => {
    const date = new Date(`${base}T12:00:00`);
    date.setDate(date.getDate() + deltaDays);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const limitISO = shift(todayISO, days);
  const oldestISO = shift(todayISO, -maxOverdueDays);

  const open = expenses.filter((expense) => !expense.paidAt);
  const byDue = (a: FinExpense, b: FinExpense) => a.dueDate.localeCompare(b.dueDate);
  return {
    vencidas: open.filter((expense) => expense.dueDate < todayISO && expense.dueDate >= oldestISO).sort(byDue),
    chegando: open.filter((expense) => expense.dueDate >= todayISO && expense.dueDate <= limitISO).sort(byDue),
  };
}

export const finGroupLabels: Record<FinCategoryGroup, string> = {
  CUSTO_FIXO: "1. Custo Fixo",
  MAO_DE_OBRA: "2. Mão de Obra",
  CUSTO_VARIAVEL: "3. Custos Variáveis",
  POUPANCA: "4. Poupanças",
};

export const finGroupOrder: FinCategoryGroup[] = ["CUSTO_FIXO", "MAO_DE_OBRA", "CUSTO_VARIAVEL", "POUPANCA"];

export const saleItemTypeLabels: Record<FinSaleItemType, string> = {
  CONSULTA: "Consulta",
  BIOIMPEDANCIA: "Bioimpedância",
  TRATAMENTO: "Tratamento / Medicação",
  SINAL: "Sinal",
  RETORNO: "Retorno",
  PSICOLOGA: "Psicóloga",
  NUTRICIONISTA: "Nutricionista",
  DESTRAVAR: "Destravar 360",
  OUTRO: "Outro",
};

export const saleItemTypes: FinSaleItemType[] = [
  "CONSULTA",
  "BIOIMPEDANCIA",
  "TRATAMENTO",
  "SINAL",
  "RETORNO",
  "PSICOLOGA",
  "NUTRICIONISTA",
  "DESTRAVAR",
  "OUTRO",
];

export const paymentMethodLabels: Record<FinPaymentMethod, string> = {
  PIX: "PIX",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  DINHEIRO: "Dinheiro",
  CHEQUE: "Cheque",
  TRANSFERENCIA: "Transferência",
  BOLETO: "Boleto",
  DEBITO_CONTA: "Débito em conta",
};

export const salePaymentMethods: FinPaymentMethod[] = ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "DINHEIRO", "CHEQUE", "TRANSFERENCIA"];
export const expensePaymentMethods: FinPaymentMethod[] = ["PIX", "BOLETO", "CARTAO_CREDITO", "CARTAO_DEBITO", "DEBITO_CONTA", "TRANSFERENCIA", "DINHEIRO"];

export const cardMachineLabels: Record<FinCardMachine, string> = {
  ITAU: "Itaú",
  SAFRA: "Safra",
  OUTRA: "Outra",
};

// Colunas da planilha ENTRADA: "Dr Daniel" = consulta+bio+sinal+tratamento+retorno+destravar; psi/nutri à parte.
export const drDanielItemTypes: FinSaleItemType[] = ["CONSULTA", "BIOIMPEDANCIA", "TRATAMENTO", "SINAL", "RETORNO", "DESTRAVAR", "OUTRO"];
export const consultaLikeTypes: FinSaleItemType[] = ["CONSULTA", "BIOIMPEDANCIA", "SINAL", "RETORNO", "DESTRAVAR"];

export function moneyFin(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function saleTotal(sale: FinSale) {
  return sale.items.reduce((sum, item) => sum + (item.amount || 0), 0);
}

/**
 * TICKET MÉDIO — o SINAL não conta (04/08/2026, regra do Lucas: "o ticket médio
 * está contando com os sinais de consulta, e não é pra contar").
 *
 * O sinal é adiantamento de um tratamento que será lançado por inteiro depois:
 * contá-lo dobra a receita na média e, pior, uma comanda só de sinal (R$ 429 em
 * média em julho) entra na conta como se fosse uma venda e afunda o indicador.
 * O FATURAMENTO continua somando o sinal — dinheiro que entrou é dinheiro que
 * entrou. Só o TICKET ignora.
 */
export const TICKET_IGNORED_ITEM_TYPES: FinSaleItemType[] = ["SINAL"];

export function saleTotalForTicket(sale: FinSale) {
  return sale.items.reduce(
    (sum, item) => (TICKET_IGNORED_ITEM_TYPES.includes(item.itemType) ? sum : sum + (item.amount || 0)),
    0,
  );
}

export type TicketMedio = {
  geral: number;
  novos: number;
  recorrentes: number;
  /** Comandas que entraram na conta (as que sobraram só com sinal ficam fora). */
  count: number;
  /** Comandas do período que foram ignoradas por serem apenas sinal. */
  ignoradasSoSinal: number;
};

/**
 * Ticket médio das comandas de um período, separando paciente novo de
 * recorrente (novo = a 1ª comanda registrada dele cai no período).
 */
export function buildTicketMedio(sales: FinSale[], start: string, end: string): TicketMedio {
  const patientKey = (sale: FinSale) => sale.crmContactRef || (sale.patientName || "").trim().toLowerCase();
  const firstSaleDate = new Map<string, string>();
  for (const sale of sales) {
    const key = patientKey(sale);
    if (!key) continue;
    const current = firstSaleDate.get(key);
    if (!current || sale.saleDate < current) firstSaleDate.set(key, sale.saleDate);
  }
  let geralSum = 0;
  let geralN = 0;
  let novoSum = 0;
  let novoN = 0;
  let recSum = 0;
  let recN = 0;
  let ignoradas = 0;
  for (const sale of sales) {
    if (sale.saleDate < start || sale.saleDate > end) continue;
    const total = saleTotalForTicket(sale);
    if (total <= 0) {
      // Sobrou zero depois de tirar o sinal: é comanda só de sinal.
      if (saleTotal(sale) > 0) ignoradas += 1;
      continue;
    }
    geralSum += total;
    geralN += 1;
    const key = patientKey(sale);
    const novo = Boolean(key) && firstSaleDate.get(key) === sale.saleDate;
    if (novo) {
      novoSum += total;
      novoN += 1;
    } else {
      recSum += total;
      recN += 1;
    }
  }
  const cents = (valor: number) => Math.round(valor * 100) / 100;
  return {
    geral: geralN ? cents(geralSum / geralN) : 0,
    novos: novoN ? cents(novoSum / novoN) : 0,
    recorrentes: recN ? cents(recSum / recN) : 0,
    count: geralN,
    ignoradasSoSinal: ignoradas,
  };
}

export function salePaymentsTotal(sale: FinSale) {
  return sale.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
}

export type DailyCardSummary = {
  totalConsulta: number;
  totalMedicacao: number;
  totalPsicologa: number;
  totalNutricionista: number;
  totalDia: number;
  byMethod: Record<FinPaymentMethod, number>;
  cardByMachine: Record<FinCardMachine, number>;
  salesCount: number;
  mismatchedSales: FinSale[];
};

// O "cartão verde" digital: totais por tipo e por forma de pagamento de um dia.
export function buildDailyCardSummary(sales: FinSale[], date: string): DailyCardSummary {
  const daySales = sales.filter((sale) => sale.saleDate === date);
  const summary: DailyCardSummary = {
    totalConsulta: 0,
    totalMedicacao: 0,
    totalPsicologa: 0,
    totalNutricionista: 0,
    totalDia: 0,
    byMethod: { PIX: 0, CARTAO_CREDITO: 0, CARTAO_DEBITO: 0, DINHEIRO: 0, CHEQUE: 0, TRANSFERENCIA: 0, BOLETO: 0, DEBITO_CONTA: 0 },
    cardByMachine: { ITAU: 0, SAFRA: 0, OUTRA: 0 },
    salesCount: daySales.length,
    mismatchedSales: [],
  };

  for (const sale of daySales) {
    for (const item of sale.items) {
      const amount = item.amount || 0;
      summary.totalDia += amount;
      if (item.itemType === "PSICOLOGA") summary.totalPsicologa += amount;
      else if (item.itemType === "NUTRICIONISTA") summary.totalNutricionista += amount;
      else if (item.itemType === "TRATAMENTO") summary.totalMedicacao += amount;
      else summary.totalConsulta += amount;
    }
    for (const payment of sale.payments) {
      summary.byMethod[payment.method] += payment.amount || 0;
      if (payment.method === "CARTAO_CREDITO" || payment.method === "CARTAO_DEBITO") {
        summary.cardByMachine[payment.cardMachine ?? "OUTRA"] += payment.amount || 0;
      }
    }
    if (Math.abs(saleTotal(sale) - salePaymentsTotal(sale)) > 0.01) {
      summary.mismatchedSales.push(sale);
    }
  }

  return summary;
}

export type P12Cell = { total: number; count: number };
export type P12Row = { category: FinCategory; months: P12Cell[]; yearTotal: number };
export type P12Group = { groupKey: FinCategoryGroup; label: string; months: P12Cell[]; yearTotal: number; rows: P12Row[] };
export type P12Matrix = {
  year: number;
  revenueMonths: P12Cell[];
  revenueYear: number;
  // Entradas no cofre/poupança (TODAS: aportes, rendimentos, trocas de conta). É saldo de
  // tesouraria — NÃO é receita, então NÃO entra no lucro. Só informativo/cofre.
  savingsInMonths: number[];
  savingsInYear: number;
  // Rendimento financeiro (juros do banco) = única entrada de cofre que é RECEITA de verdade.
  // É o que entra no lucro além do faturamento (decisão do Lucas: "só receita real").
  financialIncomeMonths: number[];
  financialIncomeYear: number;
  groups: P12Group[];
  // Despesas OPERACIONAIS (já sem a obra/CAPEX).
  totalExpensesMonths: number[];
  totalExpensesYear: number;
  // OBRA / investimento (CAPEX): fica FORA do lucro operacional — é pago pelo cofre.
  capexRows: P12Row[];
  capexMonths: number[];
  capexYear: number;
  // Crediário reconhecido como lucro naquele mês (só quando o gestor aperta o
  // botão — ver FinCrediarioProfit). Zero na esmagadora maioria dos meses.
  crediarioMonths: number[];
  crediarioYear: number;
  // Lucro = faturamento + juros (rendimento) + crediário incorporado − despesas
  // operacionais (sem obra, sem aportes).
  profitMonths: number[];
  profitYear: number;
};

function monthIndex(dateString: string) {
  const month = Number(dateString.slice(5, 7));
  return Number.isFinite(month) ? month - 1 : -1;
}

function emptyCells(): P12Cell[] {
  return Array.from({ length: 12 }, () => ({ total: 0, count: 0 }));
}

// A P12 ao vivo: faturamento derivado das comandas, despesas por categoria × mês.
// Regra do Lucas (14/07/2026): tudo POR MÊS, sem arrastar acumulado — a
// despesa conta no mês do VENCIMENTO (competência): conta de junho paga em
// julho continua sendo despesa de junho. O crediário (dinheiro vivo) fica
// FORA da P12 de propósito: é caixa separado, com aba própria.
// LUCRO do mês = faturamento + poupança − despesas do mês.
export function buildP12Matrix(
  sales: FinSale[],
  expenses: FinExpense[],
  categories: FinCategory[],
  year: number,
  savingsMoves: FinSavingsMove[] = [],
  crediarioProfits: FinCrediarioProfit[] = [],
): P12Matrix {
  const revenueMonths = emptyCells();
  for (const sale of sales) {
    if (Number(sale.saleDate.slice(0, 4)) !== year) continue;
    const month = monthIndex(sale.saleDate);
    if (month < 0) continue;
    revenueMonths[month].total += saleTotal(sale);
    revenueMonths[month].count += 1;
  }

  const rowByRef = new Map<string, P12Row>();
  const orderedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const category of orderedCategories) {
    rowByRef.set(category.id, { category, months: emptyCells(), yearTotal: 0 });
  }

  for (const expense of expenses) {
    // Competência mensal: o mês da despesa é o do vencimento, não o do pagamento.
    // Vale para TODAS as categorias, inclusive a provisão de impostos: o valor
    // separado no mês M é GASTO de M (Lucas, 03/08/2026: "os dezesseis mil foram
    // um gasto de julho"); no mês seguinte ele volta como FATURAMENTO no
    // fechamento contábil (item "ficou do mês anterior p/ impostos") — nunca
    // como gasto de novo.
    const reference = expense.dueDate || expense.paidAt || "";
    if (Number(reference.slice(0, 4)) !== year) continue;
    const month = monthIndex(reference);
    if (month < 0) continue;
    const row = rowByRef.get(expense.categoryRef);
    if (!row) continue;
    row.months[month].total += expense.amount || 0;
    row.months[month].count += 1;
    row.yearTotal += expense.amount || 0;
  }

  const groups: P12Group[] = finGroupOrder.map((groupKey) => {
    // Categorias CAPEX (obra) saem dos grupos: são investimento pago pelo cofre,
    // não custo operacional — não podem pesar no lucro do mês.
    const rows = orderedCategories.filter((category) => category.groupKey === groupKey && !category.isCapex).map((category) => rowByRef.get(category.id)!);
    const months = emptyCells();
    let yearTotal = 0;
    for (const row of rows) {
      row.months.forEach((cell, index) => {
        months[index].total += cell.total;
        months[index].count += cell.count;
      });
      yearTotal += row.yearTotal;
    }
    return { groupKey, label: finGroupLabels[groupKey], months, yearTotal, rows };
  });

  // OBRA / investimento (CAPEX): consolidado à parte, fora do lucro operacional.
  const capexRows = orderedCategories.filter((category) => category.isCapex).map((category) => rowByRef.get(category.id)!);
  const capexMonths = Array.from({ length: 12 }, (_, index) =>
    capexRows.reduce((sum, row) => sum + row.months[index].total, 0),
  );
  const capexYear = capexMonths.reduce((sum, value) => sum + value, 0);

  const totalExpensesMonths = Array.from({ length: 12 }, (_, index) =>
    groups.reduce((sum, group) => sum + group.months[index].total, 0),
  );
  const savingsInMonths = Array.from({ length: 12 }, () => 0);
  const financialIncomeMonths = Array.from({ length: 12 }, () => 0);
  for (const move of savingsMoves) {
    if (move.direction !== "ENTRADA") continue;
    if (Number(move.moveDate.slice(0, 4)) !== year) continue;
    const month = monthIndex(move.moveDate);
    if (month < 0) continue;
    savingsInMonths[month] += move.amount || 0;
    // Só o RENDIMENTO (juros do banco) é receita de verdade e entra no lucro.
    // Aporte, troca de contas, saldo inicial etc. são tesouraria, não receita.
    // Linha antiga sem kind mas com razão "rendimento" também conta — o
    // Fechamento gravou sem kind até 31/07/2026 e esses juros sumiam do lucro.
    const isRendimento = move.kind === "RENDIMENTO" || (!move.kind && /rendimento/i.test(move.reason || ""));
    if (isRendimento) financialIncomeMonths[month] += move.amount || 0;
  }
  // Crediário incorporado ao lucro, mês a mês (decisão manual do gestor).
  const crediarioMonths = Array.from({ length: 12 }, () => 0);
  for (const record of crediarioProfits) {
    if (Number(record.monthRef.slice(0, 4)) !== year) continue;
    const month = Number(record.monthRef.slice(5, 7)) - 1;
    if (month < 0 || month > 11) continue;
    crediarioMonths[month] += record.amount || 0;
  }
  const crediarioYear = crediarioMonths.reduce((sum, value) => sum + value, 0);

  const revenueYear = revenueMonths.reduce((sum, cell) => sum + cell.total, 0);
  const savingsInYear = savingsInMonths.reduce((sum, value) => sum + value, 0);
  const financialIncomeYear = financialIncomeMonths.reduce((sum, value) => sum + value, 0);
  const totalExpensesYear = totalExpensesMonths.reduce((sum, value) => sum + value, 0);
  const profitMonths = totalExpensesMonths.map(
    (expensesTotal, index) =>
      revenueMonths[index].total + financialIncomeMonths[index] + crediarioMonths[index] - expensesTotal,
  );

  return {
    year,
    revenueMonths,
    revenueYear,
    savingsInMonths,
    savingsInYear,
    financialIncomeMonths,
    financialIncomeYear,
    groups,
    totalExpensesMonths,
    totalExpensesYear,
    capexRows,
    capexMonths,
    capexYear,
    crediarioMonths,
    crediarioYear,
    profitMonths,
    profitYear: revenueYear + financialIncomeYear + crediarioYear - totalExpensesYear,
  };
}

export const p12MonthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Resumo do mês que CONECTA as três lentes que se confundem: meta (faturamento),
// lucro (faturamento + juros − custos operacionais) e contas a pagar (fatia não paga).
// Tudo derivado das mesmas fontes da P12/Metas — nada digitado.
export type ResumoMes = {
  faturamento: number;
  rendimento: number; // juros do banco — entra no lucro
  crediarioNoLucro: number; // caixa do crediário reconhecido pelo gestor neste mês
  aportes: number; // aportes/trocas de conta no cofre — NÃO entram no lucro
  receita: number; // faturamento + rendimento (o que "entrou" e conta pro lucro)
  custosOperacionais: number;
  jaPago: number;
  aPagar: number;
  obra: number;
  lucroOperacional: number;
  metaSuper: number;
  metaAlvo: number;
  metaMin: number;
  faltaMeta: number;
  metaPercent: number;
};

export function buildResumoMes(
  sales: FinSale[],
  expenses: FinExpense[],
  categories: FinCategory[],
  savingsMoves: FinSavingsMove[],
  metas: { goalSuperRevenue: number; goalTargetRevenue: number; goalMinRevenue: number },
  monthKey: string,
  crediarioProfits: FinCrediarioProfit[] = [],
): ResumoMes {
  const year = Number(monthKey.slice(0, 4));
  const monthIdx = Number(monthKey.slice(5, 7)) - 1;
  const matrix = buildP12Matrix(sales, expenses, categories, year, savingsMoves, crediarioProfits);
  // Faturamento do mês = comandas + crediário reconhecido (Lucas, 31/07/2026:
  // o dinheiro do crediário incorporado conta como faturamento, e puxa a meta).
  const faturamentoComandas = matrix.revenueMonths[monthIdx]?.total ?? 0;
  const faturamento = faturamentoComandas + (matrix.crediarioMonths[monthIdx] ?? 0);
  const rendimento = matrix.financialIncomeMonths[monthIdx] ?? 0;
  const poupancaTotal = matrix.savingsInMonths[monthIdx] ?? 0;
  const aportes = poupancaTotal - rendimento; // entradas no cofre que NÃO são receita
  const crediarioNoLucro = matrix.crediarioMonths[monthIdx] ?? 0;
  const receita = faturamento + rendimento;
  const custosOperacionais = matrix.totalExpensesMonths[monthIdx] ?? 0;
  const obra = matrix.capexMonths[monthIdx] ?? 0;
  const lucroOperacional = matrix.profitMonths[monthIdx] ?? 0;
  // "A pagar" tem que somar exatamente a mesma base do custo operacional da P12:
  // só categorias conhecidas e não-CAPEX, competência pelo vencimento. Assim
  // jaPago = custos − aPagar nunca fica negativo por causa de categoria órfã.
  const operationalRefs = new Set(categories.filter((category) => !category.isCapex).map((category) => category.id));
  const aPagar = expenses
    .filter((expense) => {
      if (!operationalRefs.has(expense.categoryRef) || expense.paidAt) return false;
      // Mesma regra da matriz: competência pelo vencimento, sem deslocamento.
      return (expense.dueDate || expense.paidAt || "").slice(0, 7) === monthKey;
    })
    .reduce((sum, expense) => sum + (expense.amount || 0), 0);
  return {
    faturamento,
    rendimento,
    crediarioNoLucro,
    aportes,
    receita,
    custosOperacionais,
    jaPago: custosOperacionais - aPagar,
    aPagar,
    obra,
    lucroOperacional,
    metaSuper: metas.goalSuperRevenue,
    metaAlvo: metas.goalTargetRevenue,
    metaMin: metas.goalMinRevenue,
    faltaMeta: Math.max(metas.goalSuperRevenue - faturamento, 0),
    metaPercent: metas.goalSuperRevenue > 0 ? faturamento / metas.goalSuperRevenue : 0,
  };
}

export function createFinId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export type FinPurchaseCard = "ITAU" | "SANTANDER" | "SAFRA" | "OUTRO";

export type FinPurchase = {
  id: string;
  purchaseDate: string;
  description: string;
  supplier: string;
  amount: number;
  method: FinPaymentMethod;
  card: FinPurchaseCard | null;
  installments: number;
  nfNote: string;
  deliveryEta: string | null;
  receivedAt: string | null;
  expenseRef: string | null;
  notes: string;
  createdAt: string;
};

export const purchaseCardLabels: Record<FinPurchaseCard, string> = {
  ITAU: "Itaú",
  SANTANDER: "Santander",
  SAFRA: "Safra",
  OUTRO: "Outro",
};

export const finPurchasesStorageKey = "app-bratan-fin-purchases";

export function loadLocalFinPurchases() {
  return readLocalValue<FinPurchase[]>(finPurchasesStorageKey, []);
}

export function saveLocalFinPurchases(purchases: FinPurchase[]) {
  writeLocalValue(finPurchasesStorageKey, purchases);
}

export function purchaseMonthTotals(purchases: FinPurchase[], monthKey: string) {
  const monthPurchases = purchases
    .filter((purchase) => purchase.purchaseDate.startsWith(monthKey))
    .sort((a, b) => (a.purchaseDate < b.purchaseDate ? 1 : a.purchaseDate > b.purchaseDate ? -1 : 0));
  const byMethod = new Map<FinPaymentMethod, number>();
  const byCard = new Map<FinPurchaseCard, number>();
  let total = 0;
  let creditTotal = 0;
  let boletoTotal = 0;
  let toArriveTotal = 0;
  const toArrive: FinPurchase[] = [];
  for (const purchase of monthPurchases) {
    total += purchase.amount;
    byMethod.set(purchase.method, (byMethod.get(purchase.method) ?? 0) + purchase.amount);
    if (purchase.method === "CARTAO_CREDITO") creditTotal += purchase.amount;
    if (purchase.method === "BOLETO") boletoTotal += purchase.amount;
    // Cada cartão de CRÉDITO acumula numa fatura futura (é a fatura inteira que
    // entra no P12, não a compra individual).
    if (purchase.method === "CARTAO_CREDITO" && purchase.card) {
      byCard.set(purchase.card, (byCard.get(purchase.card) ?? 0) + purchase.amount);
    }
    // "Vai chegar": tem previsão de entrega e ainda não foi recebido.
    if (!purchase.receivedAt && purchase.deliveryEta) {
      toArrive.push(purchase);
      toArriveTotal += purchase.amount;
    }
  }
  return { monthPurchases, total, byMethod, byCard, creditTotal, boletoTotal, toArrive, toArriveTotal };
}

// Onde a compra é REALMENTE contabilizada (Compras é só controle — nada aqui
// entra no P12 sozinho, para não duplicar):
//  - Crédito → está na FATURA do cartão; a fatura inteira entra no P12 (Contas a Pagar).
//  - Boleto → você lança em Contas a Pagar (é lá que entra no P12).
//  - Débito/PIX/Dinheiro → saída direta do caixa/conta; o fechamento já reflete.
export function purchaseAccounting(purchase: Pick<FinPurchase, "method" | "card">): { label: string; tone: "credito" | "boleto" | "caixa" } {
  if (purchase.method === "CARTAO_CREDITO") {
    return { label: `Fatura ${purchase.card ? purchaseCardLabels[purchase.card] : "cartão"}`, tone: "credito" };
  }
  if (purchase.method === "BOLETO") return { label: "Contas a Pagar", tone: "boleto" };
  return { label: "Saída direta (caixa)", tone: "caixa" };
}

export const crediarioProfitStorageKey = "app-bratan-fin-crediario-lucro";

export function loadLocalCrediarioProfits() {
  return readLocalValue<FinCrediarioProfit[]>(crediarioProfitStorageKey, []);
}

export function saveLocalCrediarioProfits(records: FinCrediarioProfit[]) {
  writeLocalValue(crediarioProfitStorageKey, records);
}

export const finSalesStorageKey = "app-bratan-fin-sales";
export const finExpensesStorageKey = "app-bratan-fin-expenses";

export function loadLocalFinSales() {
  return readLocalValue<FinSale[]>(finSalesStorageKey, []);
}

export function saveLocalFinSales(sales: FinSale[]) {
  writeLocalValue(finSalesStorageKey, sales);
}

export function loadLocalFinExpenses() {
  return readLocalValue<FinExpense[]>(finExpensesStorageKey, []);
}

export function saveLocalFinExpenses(expenses: FinExpense[]) {
  writeLocalValue(finExpensesStorageKey, expenses);
}

// Espelho local do seed da migration — usado em prévia/offline.
export const seedFinCategories: FinCategory[] = ([
  ["cat-aluguel-iptu-agua", "CUSTO_FIXO", "Aluguel / IPTU / Água", 1, false],
  ["cat-energia", "CUSTO_FIXO", "Energia", 2, false],
  ["cat-celulares-internet", "CUSTO_FIXO", "Celulares corporativos / Internet", 3, false],
  ["cat-giro-pronamp-carro-emprestimo", "CUSTO_FIXO", "Giro pronamp / Carro empresarial / Empréstimo", 4, false],
  ["cat-convenio-medicos-donos", "CUSTO_FIXO", "Convênio Médicos (Donos)", 5, false],
  ["cat-taxa-anual-cremesp-coren-cnaes", "CUSTO_FIXO", "Taxa Anual CREMESP/COREN/CNAES", 6, false],
  ["cat-servico-recorrente-cheiro-bom", "CUSTO_FIXO", "Serviço recorrente (Cheiro Bom)", 7, false],
  ["cat-mensalidade-marketings", "CUSTO_FIXO", "Mensalidade Marketing's", 8, false],
  ["cat-salarios-fixos", "MAO_DE_OBRA", "Salários Fixos", 1, false],
  ["cat-prolabore-socios", "MAO_DE_OBRA", "Prolabore Sócios", 2, false],
  ["cat-salario-ceo", "MAO_DE_OBRA", "Salário CEO", 3, false],
  ["cat-medico-prescritor-dr-bratan", "MAO_DE_OBRA", "Médico e prescritor Instituto - Dr Bratan", 4, false],
  ["cat-horas-extras-13-ferias-bonificacoes", "MAO_DE_OBRA", "Horas extras / 13º / férias / bonificações", 5, false],
  ["cat-contratacao-rescisao-fgts", "MAO_DE_OBRA", "Contratação / Rescisão / FGTS rescisão", 6, false],
  ["cat-gestor", "MAO_DE_OBRA", "Gestor", 7, false],
  ["cat-secretaria-executiva", "MAO_DE_OBRA", "Secretaria Executiva", 8, false],
  ["cat-terceirizados-nutricionista", "MAO_DE_OBRA", "Terceirizados (Nutricionista)", 9, false],
  ["cat-terceirizados-psicologa", "MAO_DE_OBRA", "Terceirizados (Psicóloga)", 10, false],
  ["cat-terceirizados-advogada-contabilidade", "MAO_DE_OBRA", "Terceirizados (advogada, contabilidade)", 11, false],
  ["cat-encargos-fgts-irrf", "MAO_DE_OBRA", "Encargos (FGTS + IRRF)", 12, false],
  ["cat-beneficios-vale-transporte", "MAO_DE_OBRA", "Benefícios (vale transporte)", 13, false],
  ["cat-beneficios-cesta", "MAO_DE_OBRA", "Benefícios (cesta)", 14, false],
  ["cat-fatura-cartao-credito", "CUSTO_VARIAVEL", "Fatura cartão de crédito", 1, false],
  ["cat-gastos-colaboradores-exames", "CUSTO_VARIAVEL", "Gastos colaboradores (exame admissional/demissional)", 2, false],
  ["cat-lavanderia-flores-insumos-limpeza", "CUSTO_VARIAVEL", "Lavanderia / Flores / Insumos limpeza", 3, false],
  ["cat-papelaria-escritorio", "CUSTO_VARIAVEL", "Papelaria escritório", 4, false],
  ["cat-locacao-maquina-cafe", "CUSTO_VARIAVEL", "Locação máquina de café e insumos (recepção)", 5, false],
  ["cat-compra-mensal-diaria-mercado", "CUSTO_VARIAVEL", "Compra mensal / diária (mercado)", 6, false],
  ["cat-compras-treinamentos-aniversarios-podcast", "CUSTO_VARIAVEL", "Compras para treinamentos, aniversários, podcast", 7, false],
  ["cat-tarifa-bancaria-rede", "CUSTO_VARIAVEL", "Tarifa bancária (rede)", 8, false],
  ["cat-tarifa-bancaria-santander", "CUSTO_VARIAVEL", "Tarifa bancária (Santander mensal)", 9, false],
  ["cat-tarifa-bancaria-safra", "CUSTO_VARIAVEL", "Tarifa bancária Safra", 10, false],
  ["cat-tarifa-bancaria-debito-automatico", "CUSTO_VARIAVEL", "Tarifa bancária débito automático", 11, false],
  ["cat-tarifa-debito-seguro-emprestimo-socios", "CUSTO_VARIAVEL", "Tarifa débito seguro (empréstimo sócios)", 12, false],
  ["cat-sistemas-fornecedores-computador", "CUSTO_VARIAVEL", "Sistemas / outros fornecedores / Computador", 13, false],
  ["cat-boletos-compra-medicacoes", "CUSTO_VARIAVEL", "Boletos / Compra medicações (Stinpharma, Victa...)", 14, false],
  ["cat-boletos-compra-implantes-bios", "CUSTO_VARIAVEL", "Boletos / Compra implantes (Biós)", 15, false],
  ["cat-boletos-compra-insumos-geral", "CUSTO_VARIAVEL", "Boletos / Compra de insumos geral", 16, false],
  ["cat-manutencao-geral", "CUSTO_VARIAVEL", "Manutenção geral", 17, false],
  ["cat-gravacao-videos-fotos-podcast", "CUSTO_VARIAVEL", "Gravação de vídeos/fotos/podcast (marketing)", 18, false],
  ["cat-fretes-motoboy-uber", "CUSTO_VARIAVEL", "Fretes / Motoboy / Uber", 19, false],
  ["cat-receitas-controladas-servicos-medicina", "CUSTO_VARIAVEL", "Receitas controladas Dr / serviços de medicina", 20, false],
  ["cat-compras-variaveis-obras-2026", "CUSTO_VARIAVEL", "Compras variáveis (Obras 2026)", 21, true],
  ["cat-estorno-de-protocolos", "CUSTO_VARIAVEL", "Estorno de protocolos (pacientes)", 22, false],
  ["cat-destravar-360", "CUSTO_VARIAVEL", "DESTRAVAR 360", 23, false],
  ["cat-impostos-parcelas-anteriores", "CUSTO_VARIAVEL", "Impostos parcelas anteriores", 24, false],
  ["cat-impostos-mensais", "CUSTO_VARIAVEL", "Impostos Mensais", 25, false],
  ["cat-impostos-trimestrais", "CUSTO_VARIAVEL", "Impostos Trimestrais", 26, false],
  ["cat-poup-impostos-mensais", "POUPANCA", "Impostos Mensais (provisão)", 1, false],
  ["cat-poup-impostos-trimestrais", "POUPANCA", "Impostos Trimestrais / Devolução de paciente", 2, false],
  ["cat-poup-13-colaboradores", "POUPANCA", "Décimo Terceiro colaboradores", 3, false],
  ["cat-poup-ferias-colaboradores", "POUPANCA", "Férias + 1/3 colaboradores", 4, false],
  ["cat-poup-13-ferias-socios", "POUPANCA", "Décimo terceiro + Férias sócios", 5, false],
  ["cat-poup-rescisao", "POUPANCA", "Rescisão", 6, false],
  ["cat-poup-confraternizacao", "POUPANCA", "Confraternização final do ano", 7, false],
  ["cat-poup-urgencias", "POUPANCA", "Urgências", 8, false],
  ["cat-poup-urgencias-proximo-mes", "POUPANCA", "Urgências para o próximo mês", 9, false],
  ["cat-poup-inicio-ano-2027", "POUPANCA", "Início ano 2027 (custos)", 10, false],
] as [string, FinCategoryGroup, string, number, boolean][]).map(([id, groupKey, name, sortOrder, isCapex]) => ({
  id,
  groupKey,
  name,
  sortOrder,
  isCapex,
  active: true,
}));

// ---------------- Sprint 2: fechamento do dia e poupança ----------------

export type FinReconciliationStatus = "PENDENTE" | "CONFERIDO" | "DIVERGENTE";
export type FinSavingsDirection = "ENTRADA" | "SAIDA";
export type FinSavingsSource = "MANUAL" | "PROVISAO" | "SALDO_INICIAL";

// Tipo do movimento do cofre — dá o "para quê" de cada entrada/saída, para
// separar o que é da obra do que o operacional pegou emprestado.
export type FinSavingsKind =
  | "APORTE" // entrada: guardou dinheiro no cofre (ex.: reservar lucro para a obra)
  | "USO_OBRA" // saída: usou o cofre para pagar OBRA (uso legítimo, não vira dívida)
  | "EMPRESTIMO" // saída: cofre cobriu conta OPERACIONAL → o operacional passa a dever
  | "DEVOLUCAO" // entrada: o operacional devolveu ao cofre (quita o empréstimo)
  | "RENDIMENTO" // entrada: rendimento do banco
  | "PROVISAO" // entrada: provisão (13º, férias)
  | "SALDO_INICIAL" // entrada: saldo inicial do cofre
  | "AJUSTE"; // entrada ou saída: ajuste/correção manual

export const savingsKindLabels: Record<FinSavingsKind, string> = {
  APORTE: "Guardei no cofre",
  USO_OBRA: "Usei na obra",
  EMPRESTIMO: "Cofre cobriu conta (a devolver)",
  DEVOLUCAO: "Devolvi ao cofre",
  RENDIMENTO: "Rendimento do banco",
  PROVISAO: "Provisão (13º/férias)",
  SALDO_INICIAL: "Saldo inicial",
  AJUSTE: "Ajuste manual",
};

// Direção natural de cada tipo (entra ou sai do cofre).
export const savingsKindDirection: Record<FinSavingsKind, FinSavingsDirection> = {
  APORTE: "ENTRADA",
  USO_OBRA: "SAIDA",
  EMPRESTIMO: "SAIDA",
  DEVOLUCAO: "ENTRADA",
  RENDIMENTO: "ENTRADA",
  PROVISAO: "ENTRADA",
  SALDO_INICIAL: "ENTRADA",
  AJUSTE: "ENTRADA",
};

export type FinReconciliation = {
  id: string;
  day: string;
  expectedPix: number;
  expectedCardItau: number;
  expectedCardSafra: number;
  expectedCardOutra: number;
  expectedDinheiro: number;
  feeItau: number;
  feeSafra: number;
  status: FinReconciliationStatus;
  divergenceNote: string;
  confirmedAt: string | null;
};

export type FinSavingsMove = {
  id: string;
  moveDate: string;
  direction: FinSavingsDirection;
  amount: number;
  reason: string;
  source: FinSavingsSource;
  kind?: FinSavingsKind;
  monthRef: string;
  createdAt: string;
};

// ---- Dívida paga sem comanda vira faturamento (31/07/2026) --------------------
// Buraco que o Lucas achou: pagamento de lembrete em PIX/cartão não aparecia em
// lugar nenhum. Só o DINHEIRO ia para o caixa do crediário; o resto apenas
// baixava a dívida e sumia — não entrava no faturamento nem na P12.
//
// A regra depende de existir comanda por trás da dívida:
//  · dívida que JÁ tem comanda lançada → o faturamento já contou; pagar é só dar
//    baixa no recebível (somar de novo seria duplicar);
//  · dívida que só existe como lembrete → o valor NUNCA entrou no faturamento, e
//    o pagamento tem que gerar a comanda.
// Esta função monta essa comanda, com id determinístico para o mesmo pagamento
// não virar duas comandas se a tela for enviada duas vezes.

export const lembretePaymentMethodMap: Record<string, FinPaymentMethod> = {
  DINHEIRO: "DINHEIRO",
  PIX: "PIX",
  CARTAO: "CARTAO_CREDITO",
  OUTRO: "TRANSFERENCIA",
};

export function saleRefFromLembretePayment(lembreteId: string, dia: string, valor: number) {
  const cents = Math.round((valor || 0) * 100);
  return `fsale-lem-${lembreteId}-${dia}-${cents}`;
}

export function saleFromLembretePayment(values: {
  lembreteId: string;
  patientName: string;
  crmContactRef?: string | null;
  valor: number;
  forma: string;
  dia: string;
  observacao?: string;
}): FinSale {
  const id = saleRefFromLembretePayment(values.lembreteId, values.dia, values.valor);
  const method = lembretePaymentMethodMap[values.forma] ?? "TRANSFERENCIA";
  const now = new Date().toISOString();
  return {
    id,
    saleDate: values.dia,
    patientName: values.patientName,
    crmContactRef: values.crmContactRef ?? "",
    notes: values.observacao?.trim()
      ? `Pagamento de dívida (Lembretes). ${values.observacao.trim()}`
      : "Pagamento de dívida registrado nos Lembretes — a dívida não tinha comanda.",
    items: [
      {
        id: `${id}-item`,
        // OUTRO de propósito: não é uma venda nova de tratamento/consulta, é a
        // cobrança de uma dívida antiga entrando no faturamento.
        itemType: "OUTRO",
        amount: Math.round((values.valor || 0) * 100) / 100,
        description: "Pagamento de dívida (Lembretes)",
      },
    ],
    payments: [
      {
        id: `${id}-pay`,
        method,
        amount: Math.round((values.valor || 0) * 100) / 100,
        installments: 1,
      },
    ],
    createdAt: now,
  };
}

// ---- Fechamento contábil e cofres separados (03/08/2026) -----------------------
// Regras do Lucas para o fechamento que vai à CONTABILIDADE:
//  · a linha "Impostos Mensais (provisão)" pertence ao MÊS SEGUINTE ao em que
//    foi separada (provisionou em junho = imposto de julho);
//  · existem DOIS cofres: o da OBRA (CDB) e o das PROVISÕES (13º, férias,
//    urgências, impostos…) — entradas e saídas separadas;
//  · Faturamento Bruto contábil = comandas (SEM crediário) + o que entrou da
//    poupança para obra + o que entrou para colaboradores/urgências + o que
//    ficou do mês anterior para os impostos;
//  · o crediário é visão INTERNA: nunca soma no que vai para a contabilidade.
export const IMPOSTOS_PROVISAO_CATEGORY = "cat-poup-impostos-mensais";

// Kinds que pertencem ao cofre da OBRA (CDB): uso na obra, empréstimo da sobra
// ao operacional e a devolução dele. Todo o resto é cofre das PROVISÕES.
const OBRA_KINDS = new Set<FinSavingsKind>(["USO_OBRA", "EMPRESTIMO", "DEVOLUCAO"]);

export type CofreResumo = { entradas: number; saidas: number; saldo: number };
export type DualSavings = { obra: CofreResumo; provisoes: CofreResumo };

export function isObraMove(move: FinSavingsMove) {
  if (move.kind && OBRA_KINDS.has(move.kind)) return true;
  // Aporte/saldo inicial/ajuste com "obra" ou "CDB" no motivo pertence ao cofre
  // da obra — é como se registra o dinheiro que JÁ estava no CDB antes do app.
  if (move.kind === "APORTE" || move.kind === "SALDO_INICIAL" || move.kind === "AJUSTE") {
    return /\bobra\b|\bcdb\b/i.test(move.reason || "");
  }
  return false;
}

/** Separa o cofre único em Obra (CDB) × Provisões, no período pedido (ou tudo). */
export function buildDualSavings(moves: FinSavingsMove[], monthKey?: string): DualSavings {
  const zero = (): CofreResumo => ({ entradas: 0, saidas: 0, saldo: 0 });
  const result: DualSavings = { obra: zero(), provisoes: zero() };
  for (const move of moves) {
    if (monthKey && move.moveDate.slice(0, 7) !== monthKey) continue;
    const pot = isObraMove(move) ? result.obra : result.provisoes;
    if (move.direction === "ENTRADA") pot.entradas += move.amount || 0;
    else pot.saidas += move.amount || 0;
  }
  result.obra.saldo = Math.round((result.obra.entradas - result.obra.saidas) * 100) / 100;
  result.provisoes.saldo = Math.round((result.provisoes.entradas - result.provisoes.saidas) * 100) / 100;
  return result;
}

// ---------------------------------------------------------------------------
// PROVA DO DINHEIRO (03/08/2026, pedido do Lucas: "faça chegar naqueles dezoito
// mil mais os trinta e um"). A conta do banco é a RÉGUA: saldo do Itaú (digitado
// do app do banco) − reserva de impostos (a provisão separada no mês anterior)
// + as notas contadas no cofre físico (registro do crediário) = dinheiro NA MÃO.
export type ProvaDoDinheiro = {
  saldoItau: number;
  reservadoImpostos: number;
  reservaMes: string; // "MM/AAAA" da provisão usada como reserva
  livreNoBanco: number;
  notasNoCofre: number;
  notasMes: string; // "MM/AAAA" do registro de crediário usado
  naMao: number;
};

export function buildProvaDoDinheiro(
  expenses: FinExpense[],
  crediarioProfits: FinCrediarioProfit[],
  saldoItau: number,
  todayKey: string, // "YYYY-MM-DD"
): ProvaDoDinheiro {
  const mesAtual = todayKey.slice(0, 7);
  const [ano, mes] = mesAtual.split("-").map(Number);
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  // Reserva = provisão de impostos separada no mês ANTERIOR e AINDA EM ABERTO.
  // Quando ela é marcada como paga, o dinheiro JÁ SAIU da conta (transferência
  // executada) — o saldo digitado já vem sem ela, então não desconta de novo
  // (03/08/2026: os 16.813,07 debitaram à noite e a conta foi a 18.614,54).
  const reservadoImpostos = expenses
    .filter(
      (expense) =>
        expense.categoryRef === IMPOSTOS_PROVISAO_CATEGORY &&
        !expense.paidAt &&
        (expense.dueDate || "").slice(0, 7) === anterior,
    )
    .reduce((sum, expense) => sum + (expense.amount || 0), 0);
  // Notas no cofre = registro de crediário mais recente (o Lucas conta e registra).
  const latest = [...crediarioProfits]
    .filter((profit) => profit.monthRef <= mesAtual)
    .sort((a, b) => a.monthRef.localeCompare(b.monthRef))
    .pop();
  const notasNoCofre = latest?.amount ?? 0;
  const livreNoBanco = Math.round((saldoItau - reservadoImpostos) * 100) / 100;
  return {
    saldoItau: Math.round(saldoItau * 100) / 100,
    reservadoImpostos: Math.round(reservadoImpostos * 100) / 100,
    reservaMes: anterior.split("-").reverse().join("/"),
    livreNoBanco,
    notasNoCofre: Math.round(notasNoCofre * 100) / 100,
    notasMes: (latest?.monthRef ?? mesAtual).split("-").reverse().join("/"),
    naMao: Math.round((livreNoBanco + notasNoCofre) * 100) / 100,
  };
}

export type FechamentoContabil = {
  monthKey: string;
  /** (iv) Comandas do mês — SEM crediário. */
  faturamentoSemCrediario: number;
  /** (i) Saídas do cofre da OBRA usadas na obra no mês (USO_OBRA). */
  entradaPoupancaObra: number;
  /** (ii) Saídas do cofre das PROVISÕES no mês (colaboradores, urgências…). */
  entradaPoupancaProvisoes: number;
  /** (iii) Impostos do mês = a provisão separada no MÊS ANTERIOR. */
  impostosDoMesAnterior: number;
  /** Soma automática dos 4 itens — o que vai para a contabilidade. */
  faturamentoBruto: number;
  /** Todas as despesas do mês (competência pelo vencimento), obra incluída. */
  custosDoMes: number;
  /** Lucro p/ contabilidade = Faturamento Bruto − custos do mês. SEM crediário. */
  lucroContabil: number;
  /** Só visão interna: NUNCA somar nem enviar à contabilidade. */
  crediarioInterno: number;
};

export function buildFechamentoContabil(
  sales: FinSale[],
  expenses: FinExpense[],
  savingsMoves: FinSavingsMove[],
  monthKey: string,
  crediarioProfits: FinCrediarioProfit[] = [],
): FechamentoContabil {
  const faturamentoSemCrediario = sales
    .filter((sale) => sale.saleDate.slice(0, 7) === monthKey)
    .reduce((sum, sale) => sum + saleTotal(sale), 0);

  let entradaPoupancaObra = 0;
  let entradaPoupancaProvisoes = 0;
  for (const move of savingsMoves) {
    if (move.moveDate.slice(0, 7) !== monthKey) continue;
    // Regra do Lucas (03/08/2026): TODO resgate do CDB é obra e TODA devolução
    // ao CDB também. O item do fechamento é o LÍQUIDO que veio da poupança da
    // obra no mês: resgates − devoluções.
    if (isObraMove(move)) {
      if (move.direction === "SAIDA") entradaPoupancaObra += move.amount || 0;
      else if (move.kind === "DEVOLUCAO") entradaPoupancaObra -= move.amount || 0;
    } else if (move.direction === "SAIDA") {
      entradaPoupancaProvisoes += move.amount || 0;
    }
  }
  entradaPoupancaObra = Math.max(entradaPoupancaObra, 0);

  // (iii) A provisão de impostos separada no mês ANTERIOR é o dinheiro que ficou
  // na conta para pagar os impostos deste mês.
  const [ano, mes] = monthKey.split("-").map(Number);
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const impostosDoMesAnterior = expenses
    .filter(
      (expense) =>
        expense.categoryRef === IMPOSTOS_PROVISAO_CATEGORY &&
        (expense.dueDate || expense.paidAt || "").slice(0, 7) === anterior,
    )
    .reduce((sum, expense) => sum + (expense.amount || 0), 0);

  const faturamentoBruto =
    Math.round((faturamentoSemCrediario + entradaPoupancaObra + entradaPoupancaProvisoes + impostosDoMesAnterior) * 100) / 100;

  // Lucro p/ contabilidade (Lucas, 03/08/2026): Faturamento Bruto − TODAS as
  // despesas do mês (obra e provisão de impostos do próprio mês incluídas).
  // Crediário fica fora dos dois lados — é só visão interna.
  const custosDoMes = expenses
    .filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === monthKey)
    .reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const lucroContabil = Math.round((faturamentoBruto - custosDoMes) * 100) / 100;

  return {
    monthKey,
    faturamentoSemCrediario: Math.round(faturamentoSemCrediario * 100) / 100,
    entradaPoupancaObra: Math.round(entradaPoupancaObra * 100) / 100,
    entradaPoupancaProvisoes: Math.round(entradaPoupancaProvisoes * 100) / 100,
    impostosDoMesAnterior: Math.round(impostosDoMesAnterior * 100) / 100,
    faturamentoBruto,
    custosDoMes: Math.round(custosDoMes * 100) / 100,
    lucroContabil,
    crediarioInterno: crediarioProfitOfMonth(crediarioProfits, monthKey),
  };
}

// ---- Crediário no lucro (31/07/2026) -------------------------------------------
// O caixa do crediário (dinheiro vivo) fica FORA da P12 de propósito. Quando o
// gestor decide reconhecer esse dinheiro como lucro de um mês, nasce UMA linha
// destas — nunca automático, nunca em todo mês.
//
// Regra de ouro contra dupla contagem: o caixa é ACUMULADO (vem de vários
// meses). Então o que se incorpora é sempre o que AINDA NÃO foi incorporado:
// saldo do cofre − tudo que já entrou no lucro em meses anteriores.
export type FinCrediarioProfit = {
  id: string;
  monthRef: string;
  amount: number;
  note: string;
  includedAt: string;
  includedBy?: string | null;
};

export function crediarioProfitRef(monthKey: string) {
  return `crediario-lucro-${monthKey}`;
}

/** Total já reconhecido como lucro (todos os meses). */
export function crediarioProfitTotal(records: FinCrediarioProfit[]) {
  return round2(records.reduce((sum, record) => sum + (record.amount || 0), 0));
}

/** O que já foi reconhecido no mês pedido (0 quando o mês não foi incorporado). */
export function crediarioProfitOfMonth(records: FinCrediarioProfit[], monthKey: string) {
  return round2(
    records.filter((record) => record.monthRef === monthKey).reduce((sum, record) => sum + (record.amount || 0), 0),
  );
}

/**
 * Quanto o botão deve sugerir para um mês: o saldo do caixa menos tudo que já
 * foi para o lucro em OUTROS meses. Se o mês já está incorporado, sugere o
 * próprio valor dele (para o botão virar "atualizar"). Nunca sugere negativo.
 */
export function crediarioProfitSuggestion(
  saldoCaixa: number,
  records: FinCrediarioProfit[],
  monthKey: string,
) {
  const outrosMeses = round2(
    records.filter((record) => record.monthRef !== monthKey).reduce((sum, record) => sum + (record.amount || 0), 0),
  );
  return Math.max(round2(saldoCaixa - outrosMeses), 0);
}

function round2(value: number) {
  return Math.round((value || 0) * 100) / 100;
}

export type FinProvisionRule = {
  id: string;
  name: string;
  monthlyAmount: number;
  sortOrder: number;
  active: boolean;
};

export const reconciliationStatusLabels: Record<FinReconciliationStatus, string> = {
  PENDENTE: "Pendente",
  CONFERIDO: "Conferido",
  DIVERGENTE: "Divergente",
};

export type DayExpected = {
  day: string;
  pix: number;
  cardItau: number;
  cardSafra: number;
  cardOutra: number;
  dinheiro: number;
  outros: number;
  total: number;
  salesCount: number;
};

// O que o app espera ter caído em cada dia, por forma/maquininha — para bater com o extrato.
export function buildDayExpected(sales: FinSale[], day: string): DayExpected {
  const expected: DayExpected = { day, pix: 0, cardItau: 0, cardSafra: 0, cardOutra: 0, dinheiro: 0, outros: 0, total: 0, salesCount: 0 };
  for (const sale of sales) {
    if (sale.saleDate !== day) continue;
    expected.salesCount += 1;
    for (const payment of sale.payments) {
      const amount = payment.amount || 0;
      expected.total += amount;
      if (payment.method === "PIX") expected.pix += amount;
      else if (payment.method === "DINHEIRO") expected.dinheiro += amount;
      else if (payment.method === "CARTAO_CREDITO" || payment.method === "CARTAO_DEBITO") {
        if (payment.cardMachine === "SAFRA") expected.cardSafra += amount;
        else if (payment.cardMachine === "ITAU" || !payment.cardMachine) expected.cardItau += amount;
        else expected.cardOutra += amount;
      } else expected.outros += amount;
    }
  }
  return expected;
}

export function monthDaysWithSales(sales: FinSale[], month: string) {
  const days = new Set<string>();
  for (const sale of sales) {
    if (sale.saleDate.slice(0, 7) === month) days.add(sale.saleDate);
  }
  return [...days].sort();
}

export function savingsBalance(moves: FinSavingsMove[]) {
  return moves.reduce((sum, move) => sum + (move.direction === "ENTRADA" ? move.amount : -move.amount), 0);
}

// Quanto o OPERACIONAL deve ao cofre: soma dos empréstimos (cofre cobriu conta)
// menos as devoluções. É o valor "misturado" que ainda precisa ser compensado.
export function operationalDebtToCofre(moves: FinSavingsMove[]) {
  // Regra simplificada (Lucas, 03/08/2026): todo resgate do CDB é OBRA — o
  // "empréstimo ao operacional" saiu de cena. A dívida nunca fica negativa:
  // devolução além do emprestado é dinheiro da obra voltando, não crédito.
  const debt = moves.reduce((sum, move) => {
    if (move.kind === "EMPRESTIMO") return sum + move.amount;
    if (move.kind === "DEVOLUCAO") return sum - move.amount;
    return sum;
  }, 0);
  return Math.max(debt, 0);
}

// Total já usado do cofre para a obra (uso legítimo).
export function cofreSpentOnObra(moves: FinSavingsMove[]) {
  return moves.reduce((sum, move) => (move.kind === "USO_OBRA" ? sum + move.amount : sum), 0);
}

export function monthProvisionsDone(moves: FinSavingsMove[], month: string) {
  return moves.some((move) => move.source === "PROVISAO" && move.monthRef === month);
}

export function provisionMoveRef(month: string, ruleId: string) {
  return `fsav-prov-${month}-${ruleId}`;
}

export function monthFeesExpenseRef(month: string) {
  return `fexp-tarifas-${month}`;
}

export function parseFinAmount(value: string) {
  const normalized = String(value ?? "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export const seedProvisionRules: FinProvisionRule[] = [
  { id: "prov-13-socios", name: "13º Sócios", monthlyAmount: 7272, sortOrder: 1, active: true },
  { id: "prov-13-colaboradores", name: "13º Colaboradores", monthlyAmount: 2063, sortOrder: 2, active: true },
  { id: "prov-rescisoes", name: "Rescisões", monthlyAmount: 1000, sortOrder: 3, active: true },
  { id: "prov-ferias-colaboradores", name: "Férias + 1/3 colaboradores", monthlyAmount: 2743, sortOrder: 4, active: true },
  { id: "prov-urgencias", name: "Urgências", monthlyAmount: 500, sortOrder: 5, active: true },
  { id: "prov-inicio-janeiro", name: "Início de ano (salários + aluguel janeiro)", monthlyAmount: 1000, sortOrder: 6, active: true },
  { id: "prov-festa-final-ano", name: "Festa de final de ano", monthlyAmount: 909.09, sortOrder: 7, active: true },
];

// ————————————————————————————————————————————————————————————————————————
// PROVISÕES DA POUPANÇA EM CONTAS A PAGAR (pedido do Lucas, 28/07/2026)
// Na planilha CONTAS A PAGAR-RECEBER as provisões ficam num bloco embaixo,
// para o custo do mês já sair somado. Aqui cada provisão vira DUAS coisas
// linkadas pelo mesmo id-raiz:
//   1) uma CONTA A PAGAR na categoria de Poupança do P12 (o custo soma);
//   2) uma ENTRADA na poupança quando a conta é paga (o cofre cresce).
// Ids determinísticos → clicar duas vezes não duplica.
// ————————————————————————————————————————————————————————————————————————

// Cada regra de provisão cai na linha certa do grupo "4. Poupanças" do P12.
export const provisionCategoryByRule: Record<string, string> = {
  "prov-13-socios": "cat-poup-13-ferias-socios",
  "prov-13-colaboradores": "cat-poup-13-colaboradores",
  "prov-rescisoes": "cat-poup-rescisao",
  "prov-ferias-colaboradores": "cat-poup-ferias-colaboradores",
  "prov-urgencias": "cat-poup-urgencias",
  "prov-inicio-janeiro": "cat-poup-inicio-ano-2027",
  "prov-festa-final-ano": "cat-poup-confraternizacao",
};

export function provisionExpenseRef(month: string, ruleId: string) {
  return `fexp-prov-${month}-${ruleId}`;
}

// Último dia do mês — a provisão vence no fechamento, como na planilha.
export function monthLastDay(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(year, mon, 0);
  return `${month}-${String(date.getDate()).padStart(2, "0")}`;
}

export type ProvisionPlanLine = {
  ruleId: string;
  name: string;
  amount: number;
  categoryRef: string;
  expenseId: string;
  savingsId: string;
  lancada: boolean;
  paga: boolean;
};

// Retrato do mês: o que cada provisão vale, se já está em Contas a Pagar e se
// já foi paga (isto é, se o dinheiro já entrou no cofre).
export function buildProvisionPlan(
  rules: FinProvisionRule[],
  expenses: FinExpense[],
  month: string,
): { lines: ProvisionPlanLine[]; total: number; lancadas: number; pendentes: number } {
  const byId = new Map(expenses.map((expense) => [expense.id, expense]));
  const lines = rules
    .filter((rule) => rule.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((rule) => {
      const expenseId = provisionExpenseRef(month, rule.id);
      const existing = byId.get(expenseId);
      return {
        ruleId: rule.id,
        name: rule.name,
        // Se já foi lançada, o valor que vale é o da conta (o Lucas pode ter ajustado).
        amount: existing ? existing.amount : rule.monthlyAmount,
        categoryRef: provisionCategoryByRule[rule.id] ?? "cat-poup-urgencias",
        expenseId,
        savingsId: provisionMoveRef(month, rule.id),
        lancada: Boolean(existing),
        paga: Boolean(existing?.paidAt),
      };
    });
  return {
    lines,
    total: lines.reduce((sum, line) => sum + line.amount, 0),
    lancadas: lines.filter((line) => line.lancada).length,
    pendentes: lines.filter((line) => !line.lancada).length,
  };
}

// As contas a pagar que faltam para o mês ficar provisionado (só as que ainda
// não existem — reexecutar é inofensivo).
export function buildProvisionExpenses(
  rules: FinProvisionRule[],
  expenses: FinExpense[],
  month: string,
  now = new Date().toISOString(),
): FinExpense[] {
  const plan = buildProvisionPlan(rules, expenses, month);
  return plan.lines
    .filter((line) => !line.lancada)
    .map((line) => ({
      id: line.expenseId,
      description: `Provisão: ${line.name}`,
      categoryRef: line.categoryRef,
      amount: line.amount,
      dueDate: monthLastDay(month),
      paidAt: null,
      method: null,
      supplier: "Poupança (cofre)",
      installmentNum: null,
      installmentTotal: null,
      documentNote: "",
      isCapex: false,
      notes: "Provisão mensal da poupança — ao dar baixa, o valor entra no cofre (aba Poupança). Quando o 13º/férias for pago de verdade, use SAÍDA da poupança, não crie outra despesa.",
      createdAt: now,
      recorrencia: null,
    }));
}

// Movimento de ENTRADA no cofre correspondente a uma provisão paga.
export function provisionSavingsMove(
  line: { ruleId: string; name: string; amount: number; savingsId: string },
  month: string,
  paidAt: string,
  now = new Date().toISOString(),
): FinSavingsMove {
  return {
    id: line.savingsId,
    moveDate: paidAt.slice(0, 10),
    direction: "ENTRADA",
    amount: line.amount,
    reason: `Provisão ${month.split("-").reverse().join("/")}: ${line.name}`,
    source: "PROVISAO",
    kind: "PROVISAO",
    monthRef: month,
    createdAt: now,
  };
}

export const finReconciliationsStorageKey = "app-bratan-fin-reconciliations";
export const finSavingsStorageKey = "app-bratan-fin-savings";

export function loadLocalFinReconciliations() {
  return readLocalValue<FinReconciliation[]>(finReconciliationsStorageKey, []);
}

export function saveLocalFinReconciliations(records: FinReconciliation[]) {
  writeLocalValue(finReconciliationsStorageKey, records);
}

export function loadLocalFinSavings() {
  return readLocalValue<FinSavingsMove[]>(finSavingsStorageKey, []);
}

export function saveLocalFinSavings(moves: FinSavingsMove[]) {
  writeLocalValue(finSavingsStorageKey, moves);
}

// ---------------- Sprint 3: notas fiscais/impostos e repasses ----------------

// Três tipos de nota (como a clínica emite de verdade): consulta, bioimpedância e
// tratamento. Para o IMPOSTO só existem DUAS classes (as duas abas da planilha
// CONTROLE DE IMPOSTOS): CONSULTA paga 13,33% e PROCEDIMENTO (tratamento e bio)
// paga 7,93%. É por isso que a equipe divide a consulta em duas notas (bio 200 +
// consulta resto) e às vezes unifica tudo numa nota de tratamento.
export type FinInvoiceType = "CONSULTA" | "BIOIMPEDANCIA" | "TRATAMENTO";
export type FinInvoiceTaxClass = "CONSULTA" | "PROCEDIMENTO";
export type FinPartnerProfessional = "NUTRICIONISTA" | "PSICOLOGA";
export type FinPartnerKind = "PLANO" | "AVULSA" | "RETORNO";

export type FinInvoice = {
  id: string;
  saleRef: string | null;
  invoiceType: FinInvoiceType;
  invoiceNumber: string;
  issueDate: string;
  comandaDate: string | null;
  patientName: string;
  amount: number;
  notes: string;
  createdAt: string;
};

export type FinPartnerEntry = {
  id: string;
  professional: FinPartnerProfessional;
  entryDate: string;
  patientName: string;
  saleItemRef: string | null;
  kind: FinPartnerKind;
  amount: number;
  notes: string;
  createdAt: string;
};

// Alíquotas da planilha CONTROLE DE IMPOSTOS (regime atual).
// Mensal = ISS + PIS + COFINS; Trimestral = IRPJ + CSLL.
export const finTaxRates: Record<FinInvoiceType, { iss: number; pis: number; cofins: number; irpj: number; csll: number }> = {
  CONSULTA: { iss: 0.02, pis: 0.0065, cofins: 0.03, irpj: 0.048, csll: 0.0288 },
  // Bioimpedância é PROCEDIMENTO: mesmas alíquotas do tratamento (7,93%).
  BIOIMPEDANCIA: { iss: 0.02, pis: 0.0065, cofins: 0.03, irpj: 0.012, csll: 0.0108 },
  TRATAMENTO: { iss: 0.02, pis: 0.0065, cofins: 0.03, irpj: 0.012, csll: 0.0108 },
};

export const invoiceTypeLabels: Record<FinInvoiceType, string> = {
  CONSULTA: "Consulta",
  BIOIMPEDANCIA: "Bioimpedância",
  TRATAMENTO: "Tratamento",
};

export function invoiceTaxClass(invoiceType: FinInvoiceType): FinInvoiceTaxClass {
  return invoiceType === "CONSULTA" ? "CONSULTA" : "PROCEDIMENTO";
}

export const invoiceTaxClassLabels: Record<FinInvoiceTaxClass, string> = {
  CONSULTA: "Consulta (13,33%)",
  PROCEDIMENTO: "Tratamento & Bio (7,93%)",
};

// Valor padrão da nota de bioimpedância quando a equipe divide a consulta
// em duas notas (bio + consulta). É o valor praticado na planilha (R$ 200).
export const defaultBioInvoiceAmount = 200;

export type InvoiceTaxes = {
  iss: number;
  pis: number;
  cofins: number;
  irpj: number;
  csll: number;
  mensal: number;
  trimestral: number;
  total: number;
};

export function invoiceTaxes(invoiceType: FinInvoiceType, amount: number): InvoiceTaxes {
  const rates = finTaxRates[invoiceType];
  const iss = amount * rates.iss;
  const pis = amount * rates.pis;
  const cofins = amount * rates.cofins;
  const irpj = amount * rates.irpj;
  const csll = amount * rates.csll;
  const mensal = iss + pis + cofins;
  const trimestral = irpj + csll;
  return { iss, pis, cofins, irpj, csll, mensal, trimestral, total: mensal + trimestral };
}

// Cache local das notas (mesmo padrão das comandas): protege o registro feito
// com internet oscilando — o que foi digitado não some ao recarregar.
export const finInvoicesStorageKey = "app-bratan-fin-invoices";

export function loadLocalFinInvoices() {
  return readLocalValue<FinInvoice[]>(finInvoicesStorageKey, []);
}

export function saveLocalFinInvoices(invoices: FinInvoice[]) {
  writeLocalValue(finInvoicesStorageKey, invoices);
}

export function quarterOfMonth(month: string) {
  const quarter = Math.ceil(Number(month.slice(5, 7)) / 3);
  return `${month.slice(0, 4)}-Q${quarter}`;
}

export function quarterMonths(quarterRef: string) {
  const year = quarterRef.slice(0, 4);
  const quarter = Number(quarterRef.slice(6));
  return [1, 2, 3].map((offset) => `${year}-${String((quarter - 1) * 3 + offset).padStart(2, "0")}`);
}

export function monthlyTaxExpenseRef(month: string) {
  return `fexp-imp-mensal-${month}`;
}

export function quarterlyTaxExpenseRef(quarterRef: string) {
  return `fexp-imp-trim-${quarterRef}`;
}

export function partnerClosingExpenseRef(professional: FinPartnerProfessional, month: string) {
  return `fexp-repasse-${professional.toLowerCase()}-${month}`;
}

export type MonthInvoiceTotals = {
  count: number;
  amount: number;
  mensal: number;
  trimestral: number;
  byType: Record<FinInvoiceType, { count: number; amount: number }>;
  // Resumo por classe de imposto, igual ao bloco K/L da planilha:
  // CONSULTA e PROCEDIMENTO, cada um com imposto mensal e trimestral.
  byClass: Record<FinInvoiceTaxClass, { count: number; amount: number; mensal: number; trimestral: number }>;
};

export function monthInvoiceTotals(invoices: FinInvoice[], month: string): MonthInvoiceTotals {
  const totals: MonthInvoiceTotals = {
    count: 0,
    amount: 0,
    mensal: 0,
    trimestral: 0,
    byType: {
      CONSULTA: { count: 0, amount: 0 },
      BIOIMPEDANCIA: { count: 0, amount: 0 },
      TRATAMENTO: { count: 0, amount: 0 },
    },
    byClass: {
      CONSULTA: { count: 0, amount: 0, mensal: 0, trimestral: 0 },
      PROCEDIMENTO: { count: 0, amount: 0, mensal: 0, trimestral: 0 },
    },
  };
  for (const invoice of invoices) {
    if (invoice.issueDate.slice(0, 7) !== month) continue;
    const taxes = invoiceTaxes(invoice.invoiceType, invoice.amount);
    totals.count += 1;
    totals.amount += invoice.amount;
    totals.mensal += taxes.mensal;
    totals.trimestral += taxes.trimestral;
    totals.byType[invoice.invoiceType].count += 1;
    totals.byType[invoice.invoiceType].amount += invoice.amount;
    const klass = invoiceTaxClass(invoice.invoiceType);
    totals.byClass[klass].count += 1;
    totals.byClass[klass].amount += invoice.amount;
    totals.byClass[klass].mensal += taxes.mensal;
    totals.byClass[klass].trimestral += taxes.trimestral;
  }
  return totals;
}

export function quarterTrimestralTotal(invoices: FinInvoice[], quarterRef: string) {
  return quarterMonths(quarterRef).reduce((sum, month) => sum + monthInvoiceTotals(invoices, month).trimestral, 0);
}

// Partes "do Instituto" de uma comanda (psi/nutri ficam fora — vão pelos repasses).
export function saleInvoiceBreakdown(sale: FinSale) {
  let bio = 0;
  let consulta = 0;
  let tratamento = 0;
  let sinal = 0;
  for (const item of sale.items) {
    if (item.itemType === "BIOIMPEDANCIA") bio += item.amount;
    else if (item.itemType === "TRATAMENTO") tratamento += item.amount;
    else if (consultaLikeTypes.includes(item.itemType) || item.itemType === "OUTRO") {
      consulta += item.amount;
      if (item.itemType === "SINAL") sinal += item.amount;
    }
  }
  const total = bio + consulta + tratamento;
  // Regra do Lucas (23/07): SINAL não gera nota — ele é SOMADO na nota do
  // serviço quando a consulta/bio/tratamento acontece. Comanda só de sinal
  // não pode ficar cobrando NF na fila.
  const onlySinal = total > 0 && Math.abs(total - sinal) < 0.005;
  return { bio, consulta, tratamento, sinal, onlySinal, total };
}

export type PendingInvoiceSale = {
  sale: FinSale;
  breakdown: ReturnType<typeof saleInvoiceBreakdown>;
  /** Soma das NFs já registradas para esta comanda. */
  invoiced: number;
  /** Quanto da comanda ainda está sem nota. */
  remaining: number;
  invoices: FinInvoice[];
};

// Comandas do mês que ainda não têm NF para TODO o valor do Instituto.
// O controle agora é por VALOR RESTANTE (não por tipo): uma comanda pode gerar
// 1, 2 ou 3 notas (bio + consulta + tratamento, ou tudo unificado em uma), e a
// comanda só sai da fila quando a soma das notas cobre o valor. Tolerância de
// R$ 0,50 para diferenças de arredondamento.
export function salesPendingInvoice(sales: FinSale[], invoices: FinInvoice[], month: string): PendingInvoiceSale[] {
  const invoicesBySale = new Map<string, FinInvoice[]>();
  for (const invoice of invoices) {
    if (!invoice.saleRef) continue;
    const list = invoicesBySale.get(invoice.saleRef) ?? [];
    list.push(invoice);
    invoicesBySale.set(invoice.saleRef, list);
  }
  return sales
    .filter((sale) => sale.saleDate.slice(0, 7) === month)
    .map((sale) => {
      const breakdown = saleInvoiceBreakdown(sale);
      const saleInvoices = invoicesBySale.get(sale.id) ?? [];
      const invoiced = saleInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
      return { sale, breakdown, invoiced, remaining: breakdown.total - invoiced, invoices: saleInvoices };
    })
    // Comanda só de SINAL não entra na fila: a nota sai depois, somada ao
    // serviço (regra do Lucas, 23/07).
    .filter((entry) => entry.remaining > 0.5 && !entry.breakdown.onlySinal);
}

// ---- Planos de emissão (o jeito que a clínica emite de verdade) ----

export type SuggestedInvoiceLine = { invoiceType: FinInvoiceType; amount: number };
export type InvoicePlan = {
  key: "SEPARADA" | "UNIFICADA";
  label: string;
  hint: string;
  lines: SuggestedInvoiceLine[];
  /** Imposto total (13,33% na consulta, 7,93% em bio/tratamento). */
  tax: number;
};

function planTax(lines: SuggestedInvoiceLine[]) {
  return lines.reduce((sum, line) => sum + invoiceTaxes(line.invoiceType, line.amount).total, 0);
}

// Sugere COMO emitir as notas de uma comanda, seguindo a prática da equipe:
// • SEPARADA — divide a consulta em bio (R$200, imposto menor) + consulta (resto),
//   e o tratamento em nota própria. "Tira um pouco da nota de consulta, que é altíssima."
// • UNIFICADA — quando tem tratamento, junta TUDO numa nota de tratamento (7,93%),
//   que é o menor imposto possível. "Às vezes unificamos tudo em uma nota de tratamento."
// Os valores são sugestões: a tela deixa editar tudo antes de registrar.
export function suggestInvoicePlans(sale: FinSale, existingInvoices: FinInvoice[] = []): InvoicePlan[] {
  const breakdown = saleInvoiceBreakdown(sale);
  const invoiced = existingInvoices
    .filter((invoice) => invoice.saleRef === sale.id)
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const remaining = Math.max(0, Math.round((breakdown.total - invoiced) * 100) / 100);
  if (remaining <= 0) return [];

  // Se já tem nota parcial, sugerimos UMA linha com o restante (sem re-dividir:
  // não dá para saber qual parte já foi emitida) — no tipo mais provável.
  if (invoiced > 0.5) {
    const type: FinInvoiceType = breakdown.tratamento > 0 ? "TRATAMENTO" : "CONSULTA";
    const lines = [{ invoiceType: type, amount: remaining }];
    return [{ key: "SEPARADA", label: "Completar o restante", hint: "cobre o que ficou sem nota", lines, tax: planTax(lines) }];
  }

  const plans: InvoicePlan[] = [];

  // Plano SEPARADA: bio + consulta + tratamento, cada um na sua nota.
  const separadaLines: SuggestedInvoiceLine[] = [];
  const consultaBucket = breakdown.consulta;
  const bioExplicit = breakdown.bio;
  if (bioExplicit > 0) {
    separadaLines.push({ invoiceType: "BIOIMPEDANCIA", amount: bioExplicit });
    if (consultaBucket > 0) separadaLines.push({ invoiceType: "CONSULTA", amount: consultaBucket });
  } else if (consultaBucket > defaultBioInvoiceAmount) {
    // Divide a consulta: bio 200 (7,93%) + consulta resto (13,33%).
    separadaLines.push({ invoiceType: "BIOIMPEDANCIA", amount: defaultBioInvoiceAmount });
    separadaLines.push({ invoiceType: "CONSULTA", amount: consultaBucket - defaultBioInvoiceAmount });
  } else if (consultaBucket > 0) {
    separadaLines.push({ invoiceType: "CONSULTA", amount: consultaBucket });
  }
  if (breakdown.tratamento > 0) separadaLines.push({ invoiceType: "TRATAMENTO", amount: breakdown.tratamento });
  if (separadaLines.length) {
    plans.push({
      key: "SEPARADA",
      label: breakdown.tratamento > 0 ? "Notas separadas" : "Bio + consulta",
      hint: "cada serviço na sua nota",
      lines: separadaLines,
      tax: planTax(separadaLines),
    });
  }

  // Plano UNIFICADA: só faz sentido quando existe tratamento na comanda.
  if (breakdown.tratamento > 0) {
    const lines: SuggestedInvoiceLine[] = [{ invoiceType: "TRATAMENTO", amount: remaining }];
    plans.push({
      key: "UNIFICADA",
      label: "Tudo em 1 nota de tratamento",
      hint: "menor imposto (7,93% sobre tudo)",
      lines,
      tax: planTax(lines),
    });
  }

  // Menor imposto primeiro — é o que a equipe escolhe na prática.
  return plans.sort((a, b) => a.tax - b.tax);
}

// Próximo número de nota provável (a prefeitura emite sequencial): maior número
// já registrado + 1. É só sugestão — a tela deixa corrigir.
export function nextInvoiceNumber(invoices: FinInvoice[]) {
  let max = 0;
  for (const invoice of invoices) {
    const value = Number(String(invoice.invoiceNumber).replace(/\D/g, ""));
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max > 0 ? max + 1 : null;
}

export const partnerProfessionalLabels: Record<FinPartnerProfessional, string> = {
  NUTRICIONISTA: "Dra. Géssica (Nutricionista)",
  PSICOLOGA: "Barbara (Psicóloga)",
};

export const partnerKindLabels: Record<FinPartnerKind, string> = {
  PLANO: "Plano de acompanhamento",
  AVULSA: "Consulta avulsa (paciente da Dra.)",
  RETORNO: "Retorno (sem repasse)",
};

// Regras do fechamento: plano R$110 Instituto→Dra; avulsa R$150 Dra→Instituto; retorno sem repasse.
export const partnerKindDefaults: Record<FinPartnerKind, { amount: number; direction: "INSTITUTO_PARA_DRA" | "DRA_PARA_INSTITUTO" | "SEM_REPASSE" }> = {
  PLANO: { amount: 110, direction: "INSTITUTO_PARA_DRA" },
  AVULSA: { amount: 150, direction: "DRA_PARA_INSTITUTO" },
  RETORNO: { amount: 0, direction: "SEM_REPASSE" },
};

export type PartnerMonthSummary = {
  institutoParaDra: number;
  draParaInstituto: number;
  net: number;
  entries: FinPartnerEntry[];
};

export function partnerMonthSummary(entries: FinPartnerEntry[], professional: FinPartnerProfessional, month: string): PartnerMonthSummary {
  const monthEntries = entries.filter((entry) => entry.professional === professional && entry.entryDate.slice(0, 7) === month);
  const institutoParaDra = monthEntries.filter((entry) => entry.kind === "PLANO").reduce((sum, entry) => sum + entry.amount, 0);
  const draParaInstituto = monthEntries.filter((entry) => entry.kind === "AVULSA").reduce((sum, entry) => sum + entry.amount, 0);
  return { institutoParaDra, draParaInstituto, net: institutoParaDra - draParaInstituto, entries: monthEntries };
}

// Itens psi/nutri lançados nas comandas que ainda não foram classificados no fechamento.
export function partnerSuggestions(sales: FinSale[], entries: FinPartnerEntry[], professional: FinPartnerProfessional, month: string) {
  const itemType: FinSaleItemType = professional === "NUTRICIONISTA" ? "NUTRICIONISTA" : "PSICOLOGA";
  const classified = new Set(entries.filter((entry) => entry.saleItemRef).map((entry) => entry.saleItemRef));
  const suggestions: { saleItemRef: string; date: string; patientName: string; amount: number }[] = [];
  for (const sale of sales) {
    if (sale.saleDate.slice(0, 7) !== month) continue;
    for (const item of sale.items) {
      if (item.itemType !== itemType || classified.has(item.id)) continue;
      suggestions.push({ saleItemRef: item.id, date: sale.saleDate, patientName: sale.patientName, amount: item.amount });
    }
  }
  return suggestions;
}

// ===========================================================================
// GESTÃO MENSAL — Reunião de Líderes (planilha do Coordenador Financeiro).
// Réplica viva da "Planilha_Gestao_Coordenador_Financeiro": comparativo mês
// anterior × mês atual, evolução de 6 meses e PDCA. TODOS os números são
// derivados dos lançamentos — só as explicações e o PDCA são escritos à mão
// (regra da casa: nada de valor digitado, nada de valor fictício).
// ===========================================================================

export type GestaoMensal = {
  monthKey: string;
  faturamento: number; // comandas do mês (o que os pacientes pagaram)
  entradasTratamento: number; // itens de tratamento/medicação
  entradasConsultas: number; // consulta, bioimpedância, sinal, retorno, destravar
  outrasEntradas: number; // psicóloga, nutricionista, outros
  custosFixos: number;
  folhaMeritocracia: number;
  custosVariaveis: number;
  provisoes: number;
  custosTotais: number; // operacionais (sem obra)
  obra: number; // CAPEX — fora do lucro, pago pelo cofre
  lucroLiquido: number; // faturamento − custos operacionais
  margem: number; // % do faturamento
  crediario: number; // visão interna, NUNCA na contabilidade
  comandas: number;
  ticketMedio: number;
};

export function buildGestaoMensal(
  sales: FinSale[],
  expenses: FinExpense[],
  categories: FinCategory[],
  monthKey: string,
  crediarioProfits: FinCrediarioProfit[] = [],
): GestaoMensal {
  const doMes = sales.filter((sale) => sale.saleDate.slice(0, 7) === monthKey);
  let entradasTratamento = 0;
  let entradasConsultas = 0;
  let outrasEntradas = 0;
  for (const sale of doMes) {
    for (const item of sale.items) {
      const valor = item.amount || 0;
      if (item.itemType === "TRATAMENTO") entradasTratamento += valor;
      else if (consultaLikeTypes.includes(item.itemType)) entradasConsultas += valor;
      else outrasEntradas += valor;
    }
  }
  const faturamento = entradasTratamento + entradasConsultas + outrasEntradas;

  const grupoPorRef = new Map(categories.map((category) => [category.id, category]));
  let custosFixos = 0;
  let folhaMeritocracia = 0;
  let custosVariaveis = 0;
  let provisoes = 0;
  let obra = 0;
  for (const expense of expenses) {
    if ((expense.dueDate || expense.paidAt || "").slice(0, 7) !== monthKey) continue;
    const category = grupoPorRef.get(expense.categoryRef);
    const valor = expense.amount || 0;
    if (!category) continue;
    if (category.isCapex) {
      obra += valor;
      continue;
    }
    if (category.groupKey === "CUSTO_FIXO") custosFixos += valor;
    else if (category.groupKey === "MAO_DE_OBRA") folhaMeritocracia += valor;
    else if (category.groupKey === "CUSTO_VARIAVEL") custosVariaveis += valor;
    else if (category.groupKey === "POUPANCA") provisoes += valor;
  }
  const custosTotais = custosFixos + folhaMeritocracia + custosVariaveis + provisoes;
  const lucroLiquido = faturamento - custosTotais;
  const cents = (valor: number) => Math.round(valor * 100) / 100;
  return {
    monthKey,
    faturamento: cents(faturamento),
    entradasTratamento: cents(entradasTratamento),
    entradasConsultas: cents(entradasConsultas),
    outrasEntradas: cents(outrasEntradas),
    custosFixos: cents(custosFixos),
    folhaMeritocracia: cents(folhaMeritocracia),
    custosVariaveis: cents(custosVariaveis),
    provisoes: cents(provisoes),
    custosTotais: cents(custosTotais),
    obra: cents(obra),
    lucroLiquido: cents(lucroLiquido),
    margem: faturamento > 0 ? Math.round((lucroLiquido / faturamento) * 10000) / 100 : 0,
    crediario: crediarioProfitOfMonth(crediarioProfits, monthKey),
    comandas: doMes.length,
    // Ticket médio pela regra da casa: sem os sinais (ver buildTicketMedio).
    ticketMedio: buildTicketMedio(sales, `${monthKey}-01`, `${monthKey}-31`).geral,
  };
}

/** Mês anterior a "YYYY-MM" (vira o ano em janeiro). */
export function previousMonthKey(monthKey: string) {
  const [ano, mes] = monthKey.split("-").map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

export type GestaoIndicador = {
  key: string;
  label: string;
  anterior: number;
  atual: number;
  variacao: number;
  /** null quando o mês anterior é zero (não existe variação % contra zero). */
  variacaoPercent: number | null;
  formato: "dinheiro" | "percentual" | "numero";
  /** Para pintar a seta: no custo, subir é ruim. */
  subirEhBom: boolean;
};

export function buildGestaoComparativo(anterior: GestaoMensal, atual: GestaoMensal): GestaoIndicador[] {
  const linhas: { key: keyof GestaoMensal; label: string; formato: GestaoIndicador["formato"]; subirEhBom: boolean }[] = [
    { key: "faturamento", label: "Faturamento bruto", formato: "dinheiro", subirEhBom: true },
    { key: "entradasTratamento", label: "Entradas de tratamento", formato: "dinheiro", subirEhBom: true },
    { key: "entradasConsultas", label: "Entradas de consultas", formato: "dinheiro", subirEhBom: true },
    { key: "custosFixos", label: "Custos fixos", formato: "dinheiro", subirEhBom: false },
    { key: "custosVariaveis", label: "Custos variáveis", formato: "dinheiro", subirEhBom: false },
    { key: "folhaMeritocracia", label: "Folha + meritocracias", formato: "dinheiro", subirEhBom: false },
    { key: "provisoes", label: "Provisões (13º, férias, impostos)", formato: "dinheiro", subirEhBom: false },
    { key: "lucroLiquido", label: "Lucro líquido", formato: "dinheiro", subirEhBom: true },
    { key: "margem", label: "Margem de lucro (%)", formato: "percentual", subirEhBom: true },
    { key: "comandas", label: "Comandas no mês", formato: "numero", subirEhBom: true },
    { key: "ticketMedio", label: "Ticket médio", formato: "dinheiro", subirEhBom: true },
  ];
  return linhas.map(({ key, label, formato, subirEhBom }) => {
    const valorAnterior = Number(anterior[key] ?? 0);
    const valorAtual = Number(atual[key] ?? 0);
    const variacao = Math.round((valorAtual - valorAnterior) * 100) / 100;
    return {
      key: String(key),
      label,
      anterior: valorAnterior,
      atual: valorAtual,
      variacao,
      variacaoPercent: valorAnterior !== 0 ? Math.round((variacao / Math.abs(valorAnterior)) * 10000) / 100 : null,
      formato,
      subirEhBom,
    };
  });
}

/** Últimos N meses terminando em monthKey (do mais antigo para o mais novo). */
export function buildEvolucaoMeses(
  sales: FinSale[],
  expenses: FinExpense[],
  categories: FinCategory[],
  monthKey: string,
  quantidade = 6,
  crediarioProfits: FinCrediarioProfit[] = [],
): GestaoMensal[] {
  const meses: string[] = [monthKey];
  for (let i = 1; i < quantidade; i += 1) meses.unshift(previousMonthKey(meses[0]));
  return meses.map((mes) => buildGestaoMensal(sales, expenses, categories, mes, crediarioProfits));
}

export const mesLongoLabels = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function monthKeyLabel(monthKey: string) {
  const [ano, mes] = monthKey.split("-").map(Number);
  return `${mesLongoLabels[(mes || 1) - 1]}/${ano}`;
}

// ===========================================================================
// RELATÓRIOS PARA A CONTABILIDADE — CSV pronto para abrir no Excel brasileiro
// (separador ponto e vírgula, vírgula decimal, BOM UTF-8 para não quebrar acento).
// ===========================================================================

function csvCell(valor: string | number | null | undefined) {
  if (valor === null || valor === undefined) return "";
  const texto = typeof valor === "number" ? valor.toFixed(2).replace(".", ",") : String(valor);
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function buildCsv(linhas: (string | number | null | undefined)[][]) {
  return "﻿" + linhas.map((linha) => linha.map(csvCell).join(";")).join("\r\n");
}

function dataBr(iso: string | null | undefined) {
  if (!iso) return "";
  const dia = iso.slice(0, 10).split("-");
  return dia.length === 3 ? `${dia[2]}/${dia[1]}/${dia[0]}` : iso;
}

/** Faturamento do mês, uma linha por ITEM da comanda (o que a contabilidade precisa). */
export function buildFaturamentoCsv(sales: FinSale[], monthKey: string) {
  const doMes = sales
    .filter((sale) => sale.saleDate.slice(0, 7) === monthKey)
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate));
  const linhas: (string | number)[][] = [
    ["Data", "Paciente", "Tipo do item", "Descrição", "Valor do item", "Formas de pagamento", "Total da comanda", "Comanda (id)"],
  ];
  let total = 0;
  for (const sale of doMes) {
    const formas = sale.payments
      .map((pagamento) => `${paymentMethodLabels[pagamento.method] ?? pagamento.method} ${moneyFin(pagamento.amount)}`)
      .join(" + ");
    const totalComanda = saleTotal(sale);
    for (const item of sale.items) {
      total += item.amount || 0;
      linhas.push([
        dataBr(sale.saleDate),
        sale.patientName,
        saleItemTypeLabels[item.itemType] ?? item.itemType,
        item.description || "",
        item.amount || 0,
        formas,
        totalComanda,
        sale.id,
      ]);
    }
  }
  linhas.push([]);
  linhas.push(["TOTAL DO FATURAMENTO", "", "", "", Math.round(total * 100) / 100, "", "", ""]);
  return buildCsv(linhas);
}

/** Gastos do mês (competência pelo vencimento), uma linha por conta. */
export function buildGastosCsv(expenses: FinExpense[], categories: FinCategory[], monthKey: string) {
  const porRef = new Map(categories.map((category) => [category.id, category]));
  const doMes = expenses
    .filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === monthKey)
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const linhas: (string | number)[][] = [
    ["Vencimento", "Pagamento", "Descrição", "Fornecedor", "Categoria (P12)", "Grupo", "É obra (CAPEX)?", "Valor", "Forma", "Parcela", "Nota fiscal", "Observações"],
  ];
  let totalOperacional = 0;
  let totalObra = 0;
  for (const expense of doMes) {
    const category = porRef.get(expense.categoryRef);
    const ehObra = Boolean(category?.isCapex);
    if (ehObra) totalObra += expense.amount || 0;
    else totalOperacional += expense.amount || 0;
    linhas.push([
      dataBr(expense.dueDate),
      expense.paidAt ? dataBr(expense.paidAt) : "EM ABERTO",
      expense.description,
      expense.supplier || "",
      category?.name ?? expense.categoryRef,
      category ? finGroupLabels[category.groupKey] : "",
      ehObra ? "SIM" : "não",
      expense.amount || 0,
      expense.method ? paymentMethodLabels[expense.method] ?? expense.method : "",
      expense.installmentNum && expense.installmentTotal ? `${expense.installmentNum}/${expense.installmentTotal}` : "",
      expense.documentNote || "",
      expense.notes || "",
    ]);
  }
  linhas.push([]);
  linhas.push(["TOTAL OPERACIONAL (entra no lucro)", "", "", "", "", "", "", Math.round(totalOperacional * 100) / 100]);
  linhas.push(["TOTAL OBRA / CAPEX (fora do lucro)", "", "", "", "", "", "", Math.round(totalObra * 100) / 100]);
  linhas.push(["TOTAL GERAL PAGO/A PAGAR NO MÊS", "", "", "", "", "", "", Math.round((totalOperacional + totalObra) * 100) / 100]);
  return buildCsv(linhas);
}

/** Resumo do fechamento — a folha de capa que vai junto com os dois anexos. */
export function buildResumoContabilCsv(gestao: GestaoMensal, fechamento: FechamentoContabil, lucroReal: number | null) {
  const linhas: (string | number | null)[][] = [
    [`FECHAMENTO ${monthKeyLabel(gestao.monthKey)} — INSTITUTO BRATAN`],
    [],
    ["RECEITA"],
    ["Faturamento bruto (comandas do mês)", gestao.faturamento],
    ["  Entradas de tratamento", gestao.entradasTratamento],
    ["  Entradas de consultas", gestao.entradasConsultas],
    ["  Outras entradas (psi/nutri/outros)", gestao.outrasEntradas],
    [],
    ["CUSTOS OPERACIONAIS (competência pelo vencimento)"],
    ["Custos fixos", gestao.custosFixos],
    ["Folha + meritocracias", gestao.folhaMeritocracia],
    ["Custos variáveis", gestao.custosVariaveis],
    ["Provisões (13º, férias, impostos)", gestao.provisoes],
    ["TOTAL DOS CUSTOS OPERACIONAIS", gestao.custosTotais],
    [],
    ["RESULTADO"],
    ["Lucro líquido (faturamento − custos operacionais)", gestao.lucroLiquido],
    ["Margem de lucro (%)", gestao.margem],
    lucroReal !== null ? ["Lucro REAL do mês (sobrou no banco, sem crediário)", lucroReal] : [],
    [],
    ["INVESTIMENTO — FORA DO LUCRO (pago pelo cofre/CDB)"],
    ["Obra (CAPEX) paga no mês", gestao.obra],
    ["Entrada da poupança usada na obra (resgates − devoluções)", fechamento.entradaPoupancaObra],
    ["Entrada da poupança p/ colaboradores e urgências", fechamento.entradaPoupancaProvisoes],
    ["Ficou do mês anterior para pagar os impostos", fechamento.impostosDoMesAnterior],
    ["FATURAMENTO BRUTO CONTÁBIL (soma dos 4 itens do fechamento)", fechamento.faturamentoBruto],
    [],
    ["CONTROLE INTERNO — NÃO VAI PARA A CONTABILIDADE"],
    ["Crediário reconhecido no mês (caixa físico)", gestao.crediario],
    [],
    ["Comandas no mês", gestao.comandas],
    ["Ticket médio", gestao.ticketMedio],
  ];
  return buildCsv(linhas.filter((linha) => linha.length > 0 || true));
}

// ===========================================================================
// PONTE DO LUCRO (03/08/2026) — por que existem três números de lucro e como
// um vira o outro. Nasceu para acabar com a dúvida recorrente da CEO: cada
// lente responde uma pergunta diferente, e a ponte mostra a passagem exata.
//   1. Lucro OPERACIONAL: a clínica se paga? (comandas − custos do dia a dia)
//   2. Lucro CONTÁBIL: o que vai para a contabilidade (soma poupanças e obra)
//   3. Lucro REAL/caixa: o que sobrou no banco depois de pagar tudo
// ===========================================================================

export type PonteLucroPasso = {
  label: string;
  valor: number;
  tipo: "base" | "mais" | "menos" | "total";
  explicacao: string;
};

export function buildPonteLucro(gestao: GestaoMensal, fechamento: FechamentoContabil, lucroReal: number | null): PonteLucroPasso[] {
  const passos: PonteLucroPasso[] = [
    {
      label: "Lucro operacional (a clínica se paga?)",
      valor: gestao.lucroLiquido,
      tipo: "base",
      explicacao: "Comandas do mês menos os custos do dia a dia (fixos, folha, variáveis e provisões). É o número da Reunião de Líderes: mede a operação, sem obra e sem dinheiro guardado.",
    },
    {
      label: "+ Entrada da poupança usada na obra",
      valor: fechamento.entradaPoupancaObra,
      tipo: "mais",
      explicacao: "Dinheiro que veio do CDB para a conta (resgates menos devoluções). Não é venda, mas a contabilidade precisa ver entrando.",
    },
    {
      label: "+ Entrada da poupança p/ colaboradores e urgências",
      valor: fechamento.entradaPoupancaProvisoes,
      tipo: "mais",
      explicacao: "Saídas do cofre das provisões usadas no mês (13º, férias, urgências).",
    },
    {
      label: "+ Ficou do mês anterior p/ impostos",
      valor: fechamento.impostosDoMesAnterior,
      tipo: "mais",
      explicacao: "A provisão de impostos separada no mês anterior. Ela sai do resultado daquele mês e entra neste como dinheiro disponível.",
    },
    {
      label: "− Obra paga no mês (CAPEX)",
      valor: gestao.obra,
      tipo: "menos",
      explicacao: "Investimento na obra. Fica fora do lucro operacional porque é patrimônio, não custo de atender paciente — mas a contabilidade abate.",
    },
    {
      label: "= Lucro contábil (vai para a contabilidade)",
      valor: fechamento.faturamentoBruto - fechamento.custosDoMes,
      tipo: "total",
      explicacao: "Faturamento bruto contábil menos todas as contas do mês, obra incluída. É o que sai no relatório para o contador. Crediário NUNCA entra aqui.",
    },
  ];
  if (lucroReal !== null) {
    passos.push({
      label: "Lucro REAL / caixa (sobrou no banco)",
      valor: lucroReal,
      tipo: "total",
      explicacao: "O que de fato sobrou na conta depois de pagar tudo, sem crediário e sem poupança. Difere do contábil porque o cartão do fim do mês cai depois, e porque contas de meses anteriores saíram neste mês.",
    });
  }
  return passos;
}

/** Diferença que explica a passagem do lucro operacional para o contábil. */
export function ponteLucroDiferenca(gestao: GestaoMensal, fechamento: FechamentoContabil) {
  const contabil = Math.round((fechamento.faturamentoBruto - fechamento.custosDoMes) * 100) / 100;
  return {
    operacional: gestao.lucroLiquido,
    contabil,
    diferenca: Math.round((contabil - gestao.lucroLiquido) * 100) / 100,
  };
}
