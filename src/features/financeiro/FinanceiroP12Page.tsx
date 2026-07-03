import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrainCircuit, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { canLembretesPagamento } from "@/lib/access";
import { cn } from "@/lib/utils";
import {
  buildP12Matrix,
  moneyFin,
  p12MonthLabels,
  saleTotal,
  type FinCategory,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

type CellSelection = { category: FinCategory | null; month: number; isRevenue: boolean };

function cellClass(value: number, isRevenue = false) {
  if (value === 0) return "text-muted-foreground/50";
  return isRevenue ? "font-semibold text-brand-musgo" : "text-brand-tinta";
}

export function FinanceiroP12Page() {
  const [year, setYear] = useState(new Date().getFullYear());
  const financeiro = useFinanceiro(year);
  const matrix = useMemo(
    () => buildP12Matrix(financeiro.sales, financeiro.expenses, financeiro.categories, year),
    [financeiro.sales, financeiro.expenses, financeiro.categories, year],
  );
  const [selection, setSelection] = useState<CellSelection | null>(null);

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
        const reference = expense.paidAt || expense.dueDate;
        return (
          expense.categoryRef === selection.category?.id &&
          Number(reference.slice(0, 4)) === year &&
          Number(reference.slice(5, 7)) - 1 === selection.month
        );
      })
      .map((expense) => ({
        id: expense.id,
        date: expense.paidAt || expense.dueDate,
        label: expense.description,
        detail: [expense.supplier, expense.paidAt ? "paga" : "pendente"].filter(Boolean).join(" · "),
        amount: expense.amount,
      }));
  }, [selection, financeiro.sales, financeiro.expenses, year]);

  return (
    <AccessGate allowed={canLembretesPagamento} label="Financeiro · P12">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
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
                  A mesma matriz categoria × mês da planilha, mas 100% derivada dos lançamentos: o faturamento vem das comandas
                  do Lançar Dia e cada categoria soma as contas lançadas nela. Clique em qualquer célula para ver a "prova viva"
                  — os lançamentos que compõem aquele número.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Nada aqui é digitado: se um número parecer errado, corrija o lançamento de origem e a matriz acompanha.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setYear((value) => value - 1)}>{year - 1}</Button>
              <Badge variant="outline" className="px-3 py-1.5 text-sm">{year}</Badge>
              <Button type="button" variant="outline" size="sm" onClick={() => setYear((value) => value + 1)}>{year + 1}</Button>
            </div>
          </div>
        </motion.section>

        <section className="rounded-lg border border-brand-oliva/15 bg-white/55 shadow-sm backdrop-blur-xl">
          <div className="kanban-scroll overflow-x-auto">
            <table className="w-full min-w-[1180px] text-right text-xs">
              <thead>
                <tr className="border-b border-brand-oliva/15 text-[11px] uppercase text-brand-oliva">
                  <th className="sticky left-0 z-10 bg-brand-papel px-3 py-2.5 text-left">Categoria</th>
                  {p12MonthLabels.map((label) => (
                    <th key={label} className="px-2 py-2.5">{label}</th>
                  ))}
                  <th className="px-3 py-2.5">Anual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-oliva/8">
                <tr className="bg-brand-creme/40 font-semibold">
                  <td className="sticky left-0 z-10 bg-brand-creme/90 px-3 py-2.5 text-left text-brand-musgo">FATURAMENTO BRUTO</td>
                  {matrix.revenueMonths.map((cell, month) => (
                    <td key={month} className="px-2 py-2.5">
                      <button
                        type="button"
                        className={cn("rounded px-1 py-0.5 hover:bg-white/70", cellClass(cell.total, true))}
                        onClick={() => cell.total && setSelection({ category: null, month, isRevenue: true })}
                      >
                        {cell.total ? moneyFin(cell.total) : "—"}
                      </button>
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-brand-musgo">{moneyFin(matrix.revenueYear)}</td>
                </tr>

                {matrix.groups.map((group) => (
                  <GroupRows key={group.groupKey} group={group} onSelect={(category, month) => setSelection({ category, month, isRevenue: false })} />
                ))}

                <tr className="bg-brand-musgo font-semibold text-brand-papel">
                  <td className="sticky left-0 z-10 bg-brand-musgo px-3 py-2.5 text-left">TOTAL DE DESPESAS</td>
                  {matrix.totalExpensesMonths.map((value, month) => (
                    <td key={month} className="px-2 py-2.5">{value ? moneyFin(value) : "—"}</td>
                  ))}
                  <td className="px-3 py-2.5">{moneyFin(matrix.totalExpensesYear)}</td>
                </tr>
                <tr className="bg-brand-creme/60 font-bold">
                  <td className="sticky left-0 z-10 bg-brand-creme px-3 py-2.5 text-left text-brand-musgo">LUCRO</td>
                  {matrix.profitMonths.map((value, month) => (
                    <td key={month} className={cn("px-2 py-2.5", value < 0 ? "text-red-700" : "text-brand-musgo")}>
                      {matrix.revenueMonths[month].total || matrix.totalExpensesMonths[month] ? moneyFin(value) : "—"}
                    </td>
                  ))}
                  <td className={cn("px-3 py-2.5", matrix.profitYear < 0 ? "text-red-700" : "text-brand-musgo")}>{moneyFin(matrix.profitYear)}</td>
                </tr>
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
  onSelect,
}: {
  group: ReturnType<typeof buildP12Matrix>["groups"][number];
  onSelect: (category: FinCategory, month: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <tr className="bg-white/70 font-semibold">
        <td className="sticky left-0 z-10 bg-brand-papel px-3 py-2.5 text-left">
          <button type="button" className="flex items-center gap-1.5 text-brand-musgo" onClick={() => setOpen((value) => !value)}>
            <span className={cn("text-[10px] transition-transform", open ? "rotate-90" : "")}>▶</span>
            {group.label}
          </button>
        </td>
        {group.months.map((cell, month) => (
          <td key={month} className={cn("px-2 py-2.5", cellClass(cell.total))}>{cell.total ? moneyFin(cell.total) : "—"}</td>
        ))}
        <td className="px-3 py-2.5 font-bold text-brand-musgo">{moneyFin(group.yearTotal)}</td>
      </tr>
      {open
        ? group.rows.map((row) => (
            <tr key={row.category.id} className="text-[11px]">
              <td className="sticky left-0 z-10 bg-brand-papel px-3 py-2 pl-7 text-left text-muted-foreground">
                {row.category.name}
                {row.category.isCapex ? <span className="ml-1 rounded bg-brand-creme px-1 text-[9px] font-semibold text-brand-tinta">CAPEX</span> : null}
              </td>
              {row.months.map((cell, month) => (
                <td key={month} className="px-2 py-2">
                  <button
                    type="button"
                    className={cn("rounded px-1 py-0.5 hover:bg-brand-creme/60", cellClass(cell.total))}
                    onClick={() => cell.total && onSelect(row.category, month)}
                    title={cell.count ? `${cell.count} lançamento(s)` : ""}
                  >
                    {cell.total ? moneyFin(cell.total) : "—"}
                  </button>
                </td>
              ))}
              <td className="px-3 py-2 font-semibold text-brand-tinta">{row.yearTotal ? moneyFin(row.yearTotal) : "—"}</td>
            </tr>
          ))
        : null}
    </>
  );
}
