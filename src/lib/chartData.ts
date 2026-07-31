// Agregadores PUROS para os gráficos (Relatórios do Financeiro e Dashboard 360).
// Regra da casa: gráfico nenhum inventa número — tudo aqui deriva das mesmas
// fontes oficiais (comandas do Lançar Dia, contas da P12, poupança), e cada
// função é testada em tests/relatorios-graficos.test.mjs.

import type {
  FinCategory,
  FinExpense,
  FinSale,
  P12Matrix,
} from "@/features/financeiro/financeiroData";
import { finGroupLabels, paymentMethodLabels, saleItemTypeLabels, saleTotal } from "@/features/financeiro/financeiroData";

export type ChartPoint = { label: string; value: number };
export type DonutSlice = { label: string; value: number; hint?: string };

// ---- Série mensal Faturamento × Custos × Lucro (espelho fiel da P12) ---------

export type MonthlyResultSeries = {
  labels: string[];
  faturamento: number[];
  custos: number[];
  lucro: number[];
  /** Último mês (0-11) com movimento — para o gráfico não desenhar 12 colunas vazias. */
  lastActiveMonth: number;
};

export function buildMonthlyResultSeries(matrix: P12Matrix): MonthlyResultSeries {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  // Faturamento do gráfico = comandas + crediário reconhecido no mês (igual ao
  // KPI e à meta — Lucas, 31/07/2026).
  const faturamento = matrix.revenueMonths.map((cell, index) => cell.total + (matrix.crediarioMonths[index] ?? 0));
  const custos = [...matrix.totalExpensesMonths];
  const lucro = [...matrix.profitMonths];
  let lastActiveMonth = 0;
  for (let month = 0; month < 12; month += 1) {
    if (faturamento[month] || custos[month] || lucro[month]) lastActiveMonth = month;
  }
  return { labels, faturamento, custos, lucro, lastActiveMonth };
}

// ---- Mapa de calor do mês (calendário: semanas × dias da semana) -------------

export type HeatDay = {
  date: string; // ISO
  dayOfMonth: number;
  total: number;
  count: number;
  inMonth: boolean;
};

export type CalendarHeat = {
  monthKey: string;
  weekdayLabels: string[];
  weeks: HeatDay[][]; // cada linha é uma semana, seg → dom
  maxTotal: number;
  total: number;
  bestDay: HeatDay | null;
};

// Calendário de verdade (linhas = semanas, colunas = seg..dom): responde de
// olhado "quais dias do mês renderam" — o mapa de calor pedido em 28/07.
export function buildCalendarHeat(sales: FinSale[], monthKey: string): CalendarHeat {
  const byDate = new Map<string, { total: number; count: number }>();
  for (const sale of sales) {
    const date = sale.saleDate.slice(0, 10);
    if (date.slice(0, 7) !== monthKey) continue;
    const total = saleTotal(sale);
    const cell = byDate.get(date) ?? { total: 0, count: 0 };
    cell.total += total;
    cell.count += 1;
    byDate.set(date, cell);
  }

  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(`${monthKey}-01T12:00:00`).getDay() + 6) % 7; // 0 = segunda

  const weeks: HeatDay[][] = [];
  let week: HeatDay[] = [];
  for (let pad = 0; pad < firstWeekday; pad += 1) {
    week.push({ date: "", dayOfMonth: 0, total: 0, count: 0, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    const cell = byDate.get(date) ?? { total: 0, count: 0 };
    week.push({ date, dayOfMonth: day, total: cell.total, count: cell.count, inMonth: true });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push({ date: "", dayOfMonth: 0, total: 0, count: 0, inMonth: false });
    weeks.push(week);
  }

  const daysWithMoney = weeks.flat().filter((day) => day.inMonth && day.total > 0);
  const maxTotal = daysWithMoney.reduce((max, day) => Math.max(max, day.total), 0);
  const total = daysWithMoney.reduce((sum, day) => sum + day.total, 0);
  const bestDay = daysWithMoney.reduce<HeatDay | null>(
    (best, day) => (best && best.total >= day.total ? best : day),
    null,
  );
  return {
    monthKey,
    weekdayLabels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    weeks,
    maxTotal,
    total,
    bestDay,
  };
}

// Força de cada dia da semana no período (qual dia rende mais, na média).
export function buildWeekdayStrength(sales: FinSale[], range?: { from: string; to: string }): ChartPoint[] {
  const labels = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const totals = Array.from({ length: 7 }, () => 0);
  for (const sale of sales) {
    const date = sale.saleDate.slice(0, 10);
    if (range && (date < range.from || date > range.to)) continue;
    const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    totals[weekday] += saleTotal(sale);
  }
  return labels.map((label, index) => ({ label, value: totals[index] }));
}

// ---- Composições (donuts) ----------------------------------------------------

// Como o dinheiro entra: PIX, cartão, dinheiro… soma dos pagamentos das comandas.
export function buildPaymentDonut(sales: FinSale[], range?: { from: string; to: string }): DonutSlice[] {
  const totals = new Map<string, number>();
  for (const sale of sales) {
    const date = sale.saleDate.slice(0, 10);
    if (range && (date < range.from || date > range.to)) continue;
    for (const payment of sale.payments) {
      if (!payment.amount) continue;
      const label = paymentMethodLabels[payment.method] ?? payment.method;
      totals.set(label, (totals.get(label) ?? 0) + payment.amount);
    }
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// O que é vendido: consulta, tratamento, bioimpedância… soma dos itens.
export function buildItemTypeDonut(sales: FinSale[], range?: { from: string; to: string }): DonutSlice[] {
  const totals = new Map<string, number>();
  for (const sale of sales) {
    const date = sale.saleDate.slice(0, 10);
    if (range && (date < range.from || date > range.to)) continue;
    for (const item of sale.items) {
      if (!item.amount) continue;
      const label = saleItemTypeLabels[item.itemType] ?? item.itemType;
      totals.set(label, (totals.get(label) ?? 0) + item.amount);
    }
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// Para onde o dinheiro vai: custo fixo, mão de obra, variável, poupança.
// Mesma competência da P12 (mês do VENCIMENTO), mesmo recorte (sem obra).
export function buildExpenseGroupDonut(
  expenses: FinExpense[],
  categories: FinCategory[],
  monthKey?: string,
): DonutSlice[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    const category = categoryById.get(expense.categoryRef);
    if (!category || category.isCapex) continue;
    const competencia = (expense.dueDate || expense.paidAt || "").slice(0, 7);
    if (monthKey && competencia !== monthKey) continue;
    const label = (finGroupLabels[category.groupKey] ?? category.groupKey).replace(/^\d+\.\s*/, "");
    totals.set(label, (totals.get(label) ?? 0) + (expense.amount || 0));
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// Ranking das maiores categorias de despesa do mês (top N + "Outras").
export function buildExpenseCategoryRank(
  expenses: FinExpense[],
  categories: FinCategory[],
  monthKey: string,
  top = 8,
): ChartPoint[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    const category = categoryById.get(expense.categoryRef);
    if (!category || category.isCapex) continue;
    const competencia = (expense.dueDate || expense.paidAt || "").slice(0, 7);
    if (competencia !== monthKey) continue;
    totals.set(category.name, (totals.get(category.name) ?? 0) + (expense.amount || 0));
  }
  const sorted = [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((point) => point.value > 0)
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= top) return sorted;
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top).reduce((sum, point) => sum + point.value, 0);
  return [...head, { label: "Outras", value: rest }];
}

// ---- Ticket médio mês a mês ---------------------------------------------------

export function buildTicketMonthly(sales: FinSale[], year: number): ChartPoint[] {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const sums = Array.from({ length: 12 }, () => 0);
  const counts = Array.from({ length: 12 }, () => 0);
  for (const sale of sales) {
    if (Number(sale.saleDate.slice(0, 4)) !== year) continue;
    const total = saleTotal(sale);
    if (total <= 0) continue;
    const month = Number(sale.saleDate.slice(5, 7)) - 1;
    if (month < 0 || month > 11) continue;
    sums[month] += total;
    counts[month] += 1;
  }
  return labels.map((label, index) => ({
    label,
    value: counts[index] ? sums[index] / counts[index] : 0,
  }));
}

// ---- Funil de prescrições (Inteligência 360) ----------------------------------

export type FunnelStep = { label: string; value: number; hint?: string };

// Do prescrito ao fechado: quantos pacientes em cada desfecho.
export function buildPrescriptionFunnel(
  prescriptions: { status: string; soldAmount: number }[],
): FunnelStep[] {
  const order: [string, string][] = [
    ["PRESCRIBED", "Prescrito (aguardando)"],
    ["IN_RECOVERY", "Em recuperação"],
    ["CLOSED_FULL", "Fechou completo"],
    ["CLOSED_PARTIAL", "Fechou parcial"],
    ["NOT_CLOSED", "Não fechou"],
    ["LOST", "Perdido"],
  ];
  const counts = new Map<string, number>();
  for (const record of prescriptions) {
    counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  }
  return order
    .map(([status, label]) => ({ label, value: counts.get(status) ?? 0 }))
    .filter((step) => step.value > 0);
}

// ---- Escala amigável para eixos ------------------------------------------------

// "R$ 12,3 mil" em vez de "R$ 12.345,67" nos eixos — número palpável de olhar.
export function moneyCompact(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1).replace(".", ",")} mil`;
  return `${sign}R$ ${abs.toFixed(0)}`;
}

// Teto "redondo" para o eixo Y (1/2/2,5/5 × potência de 10).
export function niceCeil(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 3, 4, 5, 10]) {
    if (value <= step * power) return step * power;
  }
  return 10 * power;
}
