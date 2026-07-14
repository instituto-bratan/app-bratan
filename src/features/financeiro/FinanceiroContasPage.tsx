import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Pencil, CalendarClock, CheckCircle2, CircleDollarSign, Plus, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  createFinId,
  expensePaymentMethods,
  finGroupLabels,
  finGroupOrder,
  moneyFin,
  paymentMethodLabels,
  type FinExpense,
  type FinPaymentMethod,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

function parseAmount(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function FinanceiroContasPage() {
  const { pessoa } = useAuth();
  const readOnly = !canFinanceiroFull(pessoa?.cargo);
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(now);
  const [categoryRef, setCategoryRef] = useState("");
  const [method, setMethod] = useState<FinPaymentMethod>("BOLETO");
  const [supplier, setSupplier] = useState("");
  const [installment, setInstallment] = useState("");
  const [documentNote, setDocumentNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todas" | "pendentes" | "pagas">("todas");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const categoriesByGroup = useMemo(
    () => finGroupOrder.map((groupKey) => ({
      groupKey,
      categories: financeiro.categories.filter((category) => category.groupKey === groupKey),
    })),
    [financeiro.categories],
  );
  const categoryById = useMemo(
    () => new Map(financeiro.categories.map((category) => [category.id, category])),
    [financeiro.categories],
  );

  const monthExpenses = useMemo(
    () => financeiro.expenses
      // Mesmo critério da P12: a conta pertence ao mês do VENCIMENTO.
      .filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === month)
      .filter((expense) => {
        if (statusFilter === "pendentes") return !expense.paidAt;
        if (statusFilter === "pagas") return Boolean(expense.paidAt);
        return true;
      }),
    [financeiro.expenses, month, statusFilter],
  );

  const totals = useMemo(() => {
    const all = financeiro.expenses.filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === month);
    return {
      total: all.reduce((sum, expense) => sum + expense.amount, 0),
      pending: all.filter((expense) => !expense.paidAt).reduce((sum, expense) => sum + expense.amount, 0),
      overdue: all.filter((expense) => !expense.paidAt && expense.dueDate < now).length,
    };
  }, [financeiro.expenses, month, now]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!description.trim()) return setFeedback("Descreva a conta.");
    if (!categoryRef) return setFeedback("Escolha a categoria da P12 — é ela que faz o número bater sozinho.");
    const value = parseAmount(amount);
    if (value <= 0) return setFeedback("Informe o valor.");

    const [num, total] = installment.split("/").map((part) => Number(part.trim()) || null);
    const category = categoryById.get(categoryRef);
    const editingExpense = editingExpenseId ? financeiro.expenses.find((existing) => existing.id === editingExpenseId) : null;
    const expense: FinExpense = {
      id: editingExpense?.id ?? createFinId("fexp"),
      description: description.trim(),
      categoryRef,
      amount: value,
      dueDate,
      paidAt: editingExpense?.paidAt ?? null,
      method,
      supplier: supplier.trim(),
      installmentNum: num,
      installmentTotal: total,
      documentNote: documentNote.trim(),
      isCapex: category?.isCapex ?? false,
      notes: editingExpense?.notes ?? "",
      createdAt: editingExpense?.createdAt ?? new Date().toISOString(),
    };
    if (editingExpense) {
      financeiro.updateExpense(expense);
      setFeedback(`Conta "${expense.description}" corrigida: ${moneyFin(value)} em "${category?.name}". A P12 já refletiu.`);
    } else {
      financeiro.addExpense(expense);
      setFeedback(`Conta lançada em "${category?.name}" · ${moneyFin(value)}.`);
    }
    resetForm();
  }

  function resetForm() {
    setEditingExpenseId(null);
    setDescription("");
    setAmount("");
    setSupplier("");
    setInstallment("");
    setDocumentNote("");
  }

  function startEditing(expense: FinExpense) {
    setEditingExpenseId(expense.id);
    setDescription(expense.description);
    setAmount(expense.amount.toFixed(2).replace(".", ","));
    setDueDate(expense.dueDate);
    setCategoryRef(expense.categoryRef);
    setMethod(expense.method ?? "BOLETO");
    setSupplier(expense.supplier);
    setInstallment(expense.installmentNum && expense.installmentTotal ? `${expense.installmentNum}/${expense.installmentTotal}` : "");
    setDocumentNote(expense.documentNote);
    setFeedback(`Editando a conta "${expense.description}" — corrija e salve para aplicar.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Contas a Pagar">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
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
                Contas a Pagar
                <InfoTip title="Por que a categoria é obrigatória?">
                  A categoria é o elo com a P12: cada conta lançada aqui já soma na célula certa da matriz — o trabalho manual de
                  "somar na P12 conforme cada item" deixa de existir. Obras e capex ficam marcados à parte, como pede o Plano de Virada.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Boletos, pix e contas recorrentes com categoria P12 obrigatória. Fatura de cartão entra como uma conta única.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" aria-label="Mês" />
            </div>
          </div>
        </motion.section>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <CircleDollarSign className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Total do mês</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totals.total)}</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <CalendarClock className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Ainda a pagar</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totals.pending)}</p>
          </div>
          <div className={cn("rounded-lg border p-4", totals.overdue ? "border-red-200 bg-red-50" : "border-brand-oliva/14 bg-white/55")}>
            <CalendarClock className={cn("h-5 w-5", totals.overdue ? "text-red-700" : "text-brand-musgo")} aria-hidden="true" />
            <p className={cn("mt-2 text-sm font-semibold", totals.overdue ? "text-red-800" : "text-brand-musgo")}>Vencidas sem pagamento</p>
            <p className={cn("text-2xl font-bold", totals.overdue ? "text-red-800" : "text-brand-tinta")}>{totals.overdue}</p>
          </div>
        </div>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        <Card className={cn(readOnly && "hidden")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
              {editingExpenseId ? "Corrigir conta" : "Nova conta"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
              <div className="sm:col-span-2">
                <Label>Descrição</Label>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: STIN HCG 1/2, Aluguel 512-515..." />
              </div>
              <div>
                <Label>Valor</Label>
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" inputMode="decimal" />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Categoria P12 (obrigatória)</Label>
                <select value={categoryRef} onChange={(event) => setCategoryRef(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  <option value="">Selecione a categoria...</option>
                  {categoriesByGroup.map((group) => (
                    <optgroup key={group.groupKey} label={finGroupLabels[group.groupKey]}>
                      {group.categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}{category.isCapex ? " · CAPEX" : ""}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <Label>Forma</Label>
                <select value={method} onChange={(event) => setMethod(event.target.value as FinPaymentMethod)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  {expensePaymentMethods.map((item) => (
                    <option key={item} value={item}>{paymentMethodLabels[item]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Parcela (ex.: 2/4)</Label>
                <Input value={installment} onChange={(event) => setInstallment(event.target.value)} placeholder="Opcional" />
              </div>
              <div className="sm:col-span-2">
                <Label>Fornecedor</Label>
                <Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Opcional" />
              </div>
              <div className="sm:col-span-2">
                <Label>NF / documento</Label>
                <Input value={documentNote} onChange={(event) => setDocumentNote(event.target.value)} placeholder="Nome do arquivo ou nº da nota (opcional)" />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <LiquidButton type="submit" size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {editingExpenseId ? "Salvar correção" : "Lançar conta"}
                </LiquidButton>
                {editingExpenseId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { resetForm(); setFeedback(""); }}>
                    Cancelar edição
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg">Contas de {month.split("-").reverse().join("/")}</CardTitle>
              <div className="flex gap-1.5">
                {(["todas", "pendentes", "pagas"] as const).map((filter) => (
                  <Button key={filter} type="button" size="sm" variant={statusFilter === filter ? "default" : "outline"} onClick={() => setStatusFilter(filter)}>
                    {filter === "todas" ? "Todas" : filter === "pendentes" ? "A pagar" : "Pagas"}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mobile-scrollbar-none overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase text-brand-oliva">
                  <tr>
                    <th className="px-3 py-2">Vencimento</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Categoria P12</th>
                    <th className="px-3 py-2">Forma</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-oliva/10">
                  {monthExpenses.length ? (
                    monthExpenses.map((expense) => {
                      const category = categoryById.get(expense.categoryRef);
                      const overdue = !expense.paidAt && expense.dueDate < now;
                      return (
                        <tr key={expense.id} className={cn(overdue && "bg-red-50/60")}>
                          <td className="px-3 py-2.5 whitespace-nowrap">{expense.dueDate.split("-").reverse().join("/")}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-brand-tinta">
                              {expense.description}
                              {expense.installmentNum && expense.installmentTotal ? ` · ${expense.installmentNum}/${expense.installmentTotal}` : ""}
                            </p>
                            {expense.supplier || expense.documentNote ? (
                              <p className="text-xs text-muted-foreground">{[expense.supplier, expense.documentNote].filter(Boolean).join(" · ")}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-xs">{category?.name ?? expense.categoryRef}{expense.isCapex ? <Badge className="ml-1.5 bg-brand-creme text-brand-tinta">CAPEX</Badge> : null}</td>
                          <td className="px-3 py-2.5 text-xs">{expense.method ? paymentMethodLabels[expense.method] : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-brand-musgo">{moneyFin(expense.amount)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {readOnly ? (
                              expense.paidAt ? <Badge className="bg-emerald-100 text-emerald-800">Paga</Badge> : <Badge variant="muted">Pendente</Badge>
                            ) : expense.paidAt ? (
                              <button type="button" onClick={() => financeiro.setExpensePaid(expense.id, null)} title="Desfazer pagamento">
                                <Badge className="bg-emerald-100 text-emerald-800">Paga {expense.paidAt.split("-").reverse().slice(0, 2).join("/")}</Badge>
                              </button>
                            ) : (
                              <Button type="button" size="sm" variant="outline" onClick={() => financeiro.setExpensePaid(expense.id, now)}>
                                Marcar paga
                              </Button>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {readOnly ? null : (
                              <>
                                <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${expense.description}`} onClick={() => startEditing(expense)}>
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Excluir ${expense.description}`}
                                  onClick={() => {
                                    if (!window.confirm(`Excluir a conta "${expense.description}" (${moneyFin(expense.amount)})? A P12 se ajusta sozinha.`)) return;
                                    if (editingExpenseId === expense.id) resetForm();
                                    financeiro.removeExpense(expense.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhuma conta neste mês/filtro.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
