import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrainCircuit, Eye, EyeOff, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { canFinanceiroView } from "@/lib/access";
import { cn } from "@/lib/utils";
import {
  buildP12Matrix,
  moneyFin,
  p12MonthLabels,
  saleTotal,
  type FinCategory,
  type P12Matrix,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

type CellSelection = { category: FinCategory | null; month: number; isRevenue: boolean };

function cellValue(value: number, isRevenue = false) {
  if (!value) return <span className="text-brand-oliva/30">—</span>;
  return <span className={isRevenue ? "font-semibold text-brand-musgo" : "text-brand-tinta"}>{moneyFin(value)}</span>;
}

export function FinanceiroP12Page() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const financeiro = useFinanceiro(year);
  const matrix = useMemo(
    () => buildP12Matrix(financeiro.sales, financeiro.expenses, financeiro.categories, year, financeiro.savingsMoves),
    [financeiro.sales, financeiro.expenses, financeiro.categories, year, financeiro.savingsMoves],
  );
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const visibleMonths = monthFilter === null ? Array.from({ length: 12 }, (_, index) => index) : [monthFilter];

  const selectionEntries = useMemo(() => {
    if (!selection) return [];
    if (selection.isRevenue) {
      return financeiro.sales
        .filter((sale) => Number(sale.saleDate.slice(0, 4)) === year && Number(sale.saleDate.slice(5, 7)) - 1 === selection.month)
        .map((sale) => ({
          id: sale.id,
          date: sale.saleDate,
          label: sale.patientName,
          detail: sale.items.map((item) => item.itemType).join(", "),
          amount: saleTotal(sale),
        }));
    }
    return financeiro.expenses
      .filter((expense) => {
        const reference = expense.dueDate || expense.paidAt || "";
        return (
          expense.categoryRef === selection.category?.id &&
          Number(reference.slice(0, 4)) === year &&
          Number(reference.slice(5, 7)) - 1 === selection.month
        );
      })
      .map((expense) => ({
        id: expense.id,
        date: expense.dueDate || expense.paidAt || "",
        label: expense.description,
        detail: [
          expense.supplier,
          expense.paidAt ? `paga em ${expense.paidAt.slice(0, 10).split("-").reverse().join("/")}` : "pendente",
        ]
          .filter(Boolean)
          .join(" · "),
        amount: expense.amount,
      }));
  }, [selection, financeiro.sales, financeiro.expenses, year]);

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · P12">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Financeiro 360</Badge>
                <Badge variant="muted">{financeiro.syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                P12 ao vivo
                <InfoTip title="O que é a P12 ao vivo?">
                  A matriz categoria × mês 100% derivada dos lançamentos: faturamento vem das comandas e cada categoria soma as
                  contas lançadas nela, SEMPRE no mês do vencimento (conta de junho paga em julho continua em junho). O LUCRO
                  OPERACIONAL do mês = faturamento + poupança − despesas operacionais. A OBRA (investimento) aparece numa linha
                  à parte e NÃO entra no lucro — ela é paga pelo cofre (CDB), não pelo caixa do dia a dia. O crediário também
                  fica fora, em aba própria. Clique em qualquer valor para ver a "prova viva".
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Nada aqui é digitado: se um número parecer errado, corrija o lançamento de origem.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setYear((value) => value - 1)}>{year - 1}</Button>
              <Badge variant="outline" className="px-3 py-1.5 text-sm">{year}</Badge>
              <Button type="button" variant="outline" size="sm" onClick={() => setYear((value) => value + 1)}>{year + 1}</Button>
            </div>
          </div>
        </motion.section>

        <section className="flex flex-wrap items-center gap-1.5 rounded-lg border border-brand-oliva/15 bg-white/50 p-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setMonthFilter(null)}
            className={cn(
              "ios-pressable rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              monthFilter === null ? "bg-brand-musgo text-brand-papel" : "text-brand-tinta hover:bg-white/80",
            )}
          >
            Ano inteiro
          </button>
          {p12MonthLabels.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setMonthFilter((current) => (current === index ? null : index))}
              className={cn(
                "ios-pressable rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                monthFilter === index ? "bg-brand-musgo text-brand-papel" : "text-brand-tinta hover:bg-white/80",
                matrix.revenueMonths[index].total === 0 && matrix.totalExpensesMonths[index] === 0 && monthFilter !== index && "text-brand-oliva/40",
              )}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-brand-oliva/20 sm:block" />
          <button
            type="button"
            onClick={() => setHideEmpty((value) => !value)}
            className="ios-pressable flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-tinta hover:bg-white/80"
          >
            {hideEmpty ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            {hideEmpty ? "Só categorias com valor" : "Todas as categorias"}
          </button>
        </section>

        <section className="overflow-hidden rounded-xl border border-brand-oliva/15 bg-white/60 shadow-calm backdrop-blur-xl">
          <div className="kanban-scroll overflow-x-auto">
            <table className={cn("w-full whitespace-nowrap text-right text-sm tabular-nums", monthFilter === null ? "min-w-[1280px]" : "min-w-[560px]")}>
              <thead>
                <tr className="border-b border-brand-oliva/18 bg-brand-papel/80 text-[11px] uppercase tracking-wide text-brand-oliva">
                  <th className="cell-wrap sticky left-0 z-10 whitespace-normal bg-brand-papel px-4 py-3 text-left">Categoria</th>
                  {visibleMonths.map((month) => (
                    <th key={month} className="px-2.5 py-3">{p12MonthLabels[month]}</th>
                  ))}
                  <th className="px-4 py-3">Anual</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-brand-dourado/25 bg-brand-creme/45 font-semibold">
                  <td className="cell-wrap sticky left-0 z-10 whitespace-normal bg-brand-creme/95 px-4 py-3 text-left text-brand-musgo">FATURAMENTO BRUTO</td>
                  {visibleMonths.map((month) => (
                    <td key={month} className="px-2.5 py-3">
                      <button
                        type="button"
                        className="rounded px-1 py-0.5 hover:bg-white/80"
                        onClick={() => matrix.revenueMonths[month].total && setSelection({ category: null, month, isRevenue: true })}
                      >
                        {cellValue(matrix.revenueMonths[month].total, true)}
                      </button>
                    </td>
                  ))}
                  <td className="px-4 py-3 text-brand-musgo">{moneyFin(matrix.revenueYear)}</td>
                </tr>
                <tr className="border-b border-brand-oliva/15 bg-brand-creme/25 font-semibold">
                  <td className="cell-wrap sticky left-0 z-10 whitespace-normal bg-brand-creme/70 px-4 py-2.5 text-left text-brand-musgo">
                    Entrada de valores (Poupança)
                  </td>
                  {visibleMonths.map((month) => (
                    <td key={month} className="px-2.5 py-2.5">{cellValue(matrix.savingsInMonths[month], true)}</td>
                  ))}
                  <td className="px-4 py-2.5 text-brand-musgo">{moneyFin(matrix.savingsInYear)}</td>
                </tr>

                {matrix.groups.map((group) => (
                  <GroupRows
                    key={group.groupKey}
                    group={group}
                    visibleMonths={visibleMonths}
                    hideEmpty={hideEmpty}
                    onSelect={(category, month) => setSelection({ category, month, isRevenue: false })}
                  />
                ))}

                <tr className="bg-brand-musgo font-semibold text-brand-papel">
                  <td className="cell-wrap sticky left-0 z-10 whitespace-normal bg-brand-musgo px-4 py-3 text-left">TOTAL DESPESAS OPERACIONAIS</td>
                  {visibleMonths.map((month) => (
                    <td key={month} className="px-2.5 py-3">{matrix.totalExpensesMonths[month] ? moneyFin(matrix.totalExpensesMonths[month]) : "—"}</td>
                  ))}
                  <td className="px-4 py-3">{moneyFin(matrix.totalExpensesYear)}</td>
                </tr>
                <tr className="bg-brand-creme/70 font-bold">
                  <td className="cell-wrap sticky left-0 z-10 whitespace-normal bg-brand-creme px-4 py-3 text-left text-brand-musgo">
                    LUCRO OPERACIONAL DO MÊS
                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(fatur. + poupança − despesas operacionais; obra fica fora)</span>
                  </td>
                  {visibleMonths.map((month) => (
                    <td key={month} className={cn("px-2.5 py-3", matrix.profitMonths[month] < 0 ? "text-red-700" : "text-brand-musgo")}>
                      {matrix.revenueMonths[month].total || matrix.totalExpensesMonths[month] || matrix.savingsInMonths[month] ? moneyFin(matrix.profitMonths[month]) : "—"}
                    </td>
                  ))}
                  <td className={cn("px-4 py-3", matrix.profitYear < 0 ? "text-red-700" : "text-brand-musgo")}>{moneyFin(matrix.profitYear)}</td>
                </tr>
                {matrix.capexYear ? (
                  <tr className="border-t border-brand-dourado/30 bg-brand-papel/70 text-brand-oliva">
                    <td className="cell-wrap sticky left-0 z-10 whitespace-normal bg-brand-papel px-4 py-2.5 text-left">
                      Obra / investimento (pago pelo cofre)
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">fora do lucro operacional</span>
                    </td>
                    {visibleMonths.map((month) => (
                      <td key={month} className="px-2.5 py-2.5">{matrix.capexMonths[month] ? `(${moneyFin(matrix.capexMonths[month])})` : "—"}</td>
                    ))}
                    <td className="px-4 py-2.5">({moneyFin(matrix.capexYear)})</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <BrainCircuit className="h-4 w-4 text-brand-oliva" aria-hidden="true" />
          Meta do Plano de Virada: lucro médio de {moneyFin(83333)} por mês para chegar a {moneyFin(1000000)} no ano.
        </p>

        {selection ? (
          <div className="fixed inset-0 z-[70] bg-brand-tinta/28 backdrop-blur-sm" onClick={() => setSelection(null)}>
            <aside
              className="ml-auto flex h-full w-[min(30rem,100vw)] flex-col overflow-y-auto border-l border-brand-oliva/20 bg-brand-papel p-4 shadow-2xl sm:p-5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <Badge variant="gold">Prova viva</Badge>
                  <h2 className="mt-2 text-xl text-brand-musgo">
                    {selection.isRevenue ? "Faturamento bruto" : selection.category?.name} · {p12MonthLabels[selection.month]}/{year}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{selectionEntries.length} lançamento(s) compõem esta célula.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setSelection(null)} aria-label="Fechar">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
              <div className="grid gap-2">
                {selectionEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-tinta">{entry.label}</p>
                      <p className="text-xs text-muted-foreground">{entry.date.split("-").reverse().join("/")}{entry.detail ? ` · ${entry.detail}` : ""}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-brand-musgo">{moneyFin(entry.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-brand-dourado/30 bg-brand-creme/40 px-3 py-2 text-right text-sm font-bold text-brand-musgo">
                Total: {moneyFin(selectionEntries.reduce((sum, entry) => sum + entry.amount, 0))}
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </AccessGate>
  );
}

function GroupRows({
  group,
  visibleMonths,
  hideEmpty,
  onSelect,
}: {
  group: P12Matrix["groups"][number];
  visibleMonths: number[];
  hideEmpty: boolean;
  onSelect: (category: FinCategory, month: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const rows = hideEmpty ? group.rows.filter((row) => row.yearTotal !== 0) : group.rows;

  return (
    <>
      <tr className="border-y border-brand-oliva/12 bg-white/85 font-semibold">
        <td className="cell-wrap sticky left-0 z-10 whitespace-normal bg-brand-papel px-4 py-2.5 text-left">
          <button type="button" className="flex items-center gap-1.5 text-brand-musgo" onClick={() => setOpen((value) => !value)}>
            <span className={cn("text-[9px] text-brand-oliva transition-transform", open ? "rotate-90" : "")}>▶</span>
            {group.label}
            <span className="text-[10px] font-normal text-muted-foreground">({rows.length})</span>
          </button>
        </td>
        {visibleMonths.map((month) => (
          <td key={month} className="px-2.5 py-2.5">{cellValue(group.months[month].total)}</td>
        ))}
        <td className="px-4 py-2.5 font-bold text-brand-musgo">{group.yearTotal ? moneyFin(group.yearTotal) : "—"}</td>
      </tr>
      {open
        ? rows.map((row, index) => (
            <tr key={row.category.id} className={cn("text-[11px]", index % 2 === 1 && "bg-brand-papel/60")}>
              <td className={cn("sticky left-0 z-10 px-4 py-2 pl-8 text-left text-muted-foreground", index % 2 === 1 ? "bg-[#f5f2e8]" : "bg-brand-papel")}>
                {row.category.name}
                {row.category.isCapex ? <span className="ml-1.5 rounded bg-brand-creme px-1 py-0.5 text-[9px] font-semibold text-brand-tinta">CAPEX</span> : null}
              </td>
              {visibleMonths.map((month) => (
                <td key={month} className="px-2.5 py-2">
                  <button
                    type="button"
                    className="rounded px-1 py-0.5 hover:bg-brand-creme/70"
                    onClick={() => row.months[month].total && onSelect(row.category, month)}
                    title={row.months[month].count ? `${row.months[month].count} lançamento(s)` : ""}
                  >
                    {cellValue(row.months[month].total)}
                  </button>
                </td>
              ))}
              <td className="px-4 py-2 font-semibold text-brand-tinta">{row.yearTotal ? moneyFin(row.yearTotal) : "—"}</td>
            </tr>
          ))
        : null}
    </>
  );
}
