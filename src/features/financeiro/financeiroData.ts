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

export type FinSale = {
  id: string;
  saleDate: string;
  patientName: string;
  crmContactRef: string;
  notes: string;
  items: FinSaleItem[];
  payments: FinSalePayment[];
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
};

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
  savingsInMonths: number[];
  savingsInYear: number;
  groups: P12Group[];
  totalExpensesMonths: number[];
  totalExpensesYear: number;
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
// LUCRO segue a fórmula da planilha (linha 74): faturamento + entradas de poupança − despesas.
export function buildP12Matrix(sales: FinSale[], expenses: FinExpense[], categories: FinCategory[], year: number, savingsMoves: FinSavingsMove[] = []): P12Matrix {
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
    const reference = expense.paidAt || expense.dueDate;
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
    const rows = orderedCategories.filter((category) => category.groupKey === groupKey).map((category) => rowByRef.get(category.id)!);
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

  const totalExpensesMonths = Array.from({ length: 12 }, (_, index) =>
    groups.reduce((sum, group) => sum + group.months[index].total, 0),
  );
  const savingsInMonths = Array.from({ length: 12 }, () => 0);
  for (const move of savingsMoves) {
    if (move.direction !== "ENTRADA") continue;
    if (Number(move.moveDate.slice(0, 4)) !== year) continue;
    const month = monthIndex(move.moveDate);
    if (month >= 0) savingsInMonths[month] += move.amount || 0;
  }
  const revenueYear = revenueMonths.reduce((sum, cell) => sum + cell.total, 0);
  const savingsInYear = savingsInMonths.reduce((sum, value) => sum + value, 0);
  const totalExpensesYear = totalExpensesMonths.reduce((sum, value) => sum + value, 0);
  const profitMonths = totalExpensesMonths.map((expensesTotal, index) => revenueMonths[index].total + savingsInMonths[index] - expensesTotal);

  return {
    year,
    revenueMonths,
    revenueYear,
    savingsInMonths,
    savingsInYear,
    groups,
    totalExpensesMonths,
    totalExpensesYear,
    profitMonths,
    profitYear: revenueYear + savingsInYear - totalExpensesYear,
  };
}

export const p12MonthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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
  const monthPurchases = purchases.filter((purchase) => purchase.purchaseDate.startsWith(monthKey));
  const byMethod = new Map<FinPaymentMethod, number>();
  let total = 0;
  for (const purchase of monthPurchases) {
    total += purchase.amount;
    byMethod.set(purchase.method, (byMethod.get(purchase.method) ?? 0) + purchase.amount);
  }
  return { monthPurchases, total, byMethod };
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
  monthRef: string;
  createdAt: string;
};

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

export type FinInvoiceType = "CONSULTA" | "TRATAMENTO";
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
  TRATAMENTO: { iss: 0.02, pis: 0.0065, cofins: 0.03, irpj: 0.012, csll: 0.0108 },
};

export const invoiceTypeLabels: Record<FinInvoiceType, string> = {
  CONSULTA: "Consulta / Bio / Sinal",
  TRATAMENTO: "Tratamento",
};

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
};

export function monthInvoiceTotals(invoices: FinInvoice[], month: string): MonthInvoiceTotals {
  const totals: MonthInvoiceTotals = {
    count: 0,
    amount: 0,
    mensal: 0,
    trimestral: 0,
    byType: { CONSULTA: { count: 0, amount: 0 }, TRATAMENTO: { count: 0, amount: 0 } },
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
  }
  return totals;
}

export function quarterTrimestralTotal(invoices: FinInvoice[], quarterRef: string) {
  return quarterMonths(quarterRef).reduce((sum, month) => sum + monthInvoiceTotals(invoices, month).trimestral, 0);
}

// Comandas do mês que ainda não têm NF registrada (itens do Instituto; psi/nutri ficam fora).
export function salesPendingInvoice(sales: FinSale[], invoices: FinInvoice[], month: string) {
  const invoicedSales = new Set(invoices.filter((invoice) => invoice.saleRef).map((invoice) => invoice.saleRef));
  return sales
    .filter((sale) => sale.saleDate.slice(0, 7) === month)
    .filter((sale) => !invoicedSales.has(sale.id))
    .map((sale) => {
      const consulta = sale.items
        .filter((item) => consultaLikeTypes.includes(item.itemType) || item.itemType === "OUTRO")
        .reduce((sum, item) => sum + item.amount, 0);
      const tratamento = sale.items.filter((item) => item.itemType === "TRATAMENTO").reduce((sum, item) => sum + item.amount, 0);
      return { sale, consulta, tratamento };
    })
    .filter((entry) => entry.consulta > 0 || entry.tratamento > 0);
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
