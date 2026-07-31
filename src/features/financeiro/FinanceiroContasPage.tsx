import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Pencil, BellRing, CalendarClock, CheckCircle2, CircleDollarSign, Filter, Layers, PiggyBank, Plus, Repeat, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { canEditModule, canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  buildProvisionExpenses,
  buildProvisionPlan,
  createFinId,
  addMonthsToDue,
  futureOpenInstallments,
  installmentSummary,
  MAX_INSTALLMENTS,
  missingInstallments,
  expensePaymentMethods,
  finGroupLabels,
  finGroupOrder,
  moneyFin,
  monthLastDay,
  paymentMethodLabels,
  upcomingExpenses,
  type FinExpense,
  type FinPaymentMethod,
} from "./financeiroData";

// Aviso de vencimento: contas em aberto que vencem em até 3 dias.
const AVISO_DIAS = 3;
import { useFinanceiro } from "./useFinanceiro";

function parseAmount(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function FinanceiroContasPage() {
  const { pessoa } = useAuth();
  const readOnly = !canEditModule(pessoa, "fin-contas");
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
  const [recorrente, setRecorrente] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todas" | "pendentes" | "pagas">("todas");
  // Filtro de categoria (31/07, pedido do Lucas): por GRUPO da P12 ou por uma
  // categoria específica. "grupo:CUSTO_FIXO" ou o id da categoria.
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [buscaConta, setBuscaConta] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [provisionFeedback, setProvisionFeedback] = useState("");
  // Corrigindo uma parcela: aplicar também às seguintes ainda em aberto?
  const [aplicarNasSeguintes, setAplicarNasSeguintes] = useState(true);

  // Provisões da poupança do mês (13º, férias, rescisões, urgências, início de
  // ano, festa) — o bloco que a planilha antiga trazia embaixo.
  const provisionPlan = useMemo(
    () => buildProvisionPlan(financeiro.provisionRules, financeiro.expenses, month),
    [financeiro.provisionRules, financeiro.expenses, month],
  );

  function lancarProvisoes() {
    const novas = buildProvisionExpenses(financeiro.provisionRules, financeiro.expenses, month);
    if (!novas.length) {
      setProvisionFeedback("Este mês já está provisionado.");
      return;
    }
    for (const expense of novas) financeiro.addExpense(expense);
    const total = novas.reduce((sum, expense) => sum + expense.amount, 0);
    setProvisionFeedback(
      `${novas.length} provisão(ões) lançada(s) em Contas a Pagar (${moneyFin(total)}). O custo do mês já está somado — ao dar baixa, o valor entra no cofre da Poupança.`,
    );
  }

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

  // O que o filtro de categoria deixa passar. Um grupo inteiro da P12
  // ("grupo:CUSTO_FIXO"), "obra" (CAPEX) ou uma categoria específica.
  function passaCategoria(expense: FinExpense) {
    if (categoryFilter === "todas") return true;
    const category = categoryById.get(expense.categoryRef);
    // Obra segue a CATEGORIA (é o que a P12 usa). O flag da conta só decide
    // quando a categoria sumiu — senão o "EMPRESTIMO OBRA" (pago pelo
    // operacional, decisão de 20/07) apareceria como obra sem ser.
    if (categoryFilter === "obra") return category ? category.isCapex : Boolean(expense.isCapex);
    if (categoryFilter.startsWith("grupo:")) return category?.groupKey === categoryFilter.slice(6);
    return expense.categoryRef === categoryFilter;
  }

  function passaBusca(expense: FinExpense) {
    const termo = buscaConta.trim().toLowerCase();
    if (!termo) return true;
    const category = categoryById.get(expense.categoryRef);
    return [expense.description, expense.supplier, expense.documentNote, category?.name]
      .filter(Boolean)
      .some((campo) => String(campo).toLowerCase().includes(termo));
  }

  const monthExpenses = useMemo(
    () => financeiro.expenses
      // Mesmo critério da P12: a conta pertence ao mês do VENCIMENTO.
      .filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === month)
      .filter((expense) => {
        if (statusFilter === "pendentes") return !expense.paidAt;
        if (statusFilter === "pagas") return Boolean(expense.paidAt);
        return true;
      })
      .filter(passaCategoria)
      .filter(passaBusca),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeiro.expenses, month, statusFilter, categoryFilter, buscaConta, categoryById],
  );

  // Totais do que está NA TELA (com filtro) — para o filtro responder "quanto é".
  const totaisFiltrados = useMemo(() => ({
    total: monthExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    aPagar: monthExpenses.filter((expense) => !expense.paidAt).reduce((sum, expense) => sum + expense.amount, 0),
    pago: monthExpenses.filter((expense) => expense.paidAt).reduce((sum, expense) => sum + expense.amount, 0),
  }), [monthExpenses]);

  const filtroAtivo = categoryFilter !== "todas" || Boolean(buscaConta.trim()) || statusFilter !== "todas";
  const nomeDoFiltro = useMemo(() => {
    if (categoryFilter === "todas") return "";
    if (categoryFilter === "obra") return "Obra / investimento (CAPEX)";
    if (categoryFilter.startsWith("grupo:")) {
      const key = categoryFilter.slice(6) as (typeof finGroupOrder)[number];
      return finGroupLabels[key] ?? key;
    }
    return categoryById.get(categoryFilter)?.name ?? categoryFilter;
  }, [categoryFilter, categoryById]);

  const totals = useMemo(() => {
    const all = financeiro.expenses.filter((expense) => (expense.dueDate || expense.paidAt || "").slice(0, 7) === month);
    return {
      total: all.reduce((sum, expense) => sum + expense.amount, 0),
      pending: all.filter((expense) => !expense.paidAt).reduce((sum, expense) => sum + expense.amount, 0),
      overdue: all.filter((expense) => !expense.paidAt && expense.dueDate < now).length,
    };
  }, [financeiro.expenses, month, now]);

  // Aviso de vencimento olha o ANO inteiro, não só o mês da tela.
  const avisos = useMemo(() => upcomingExpenses(financeiro.expenses, now, AVISO_DIAS), [financeiro.expenses, now]);

  // Pré-visualização do parcelamento enquanto a pessoa digita "1/12".
  const previewParcelas = useMemo(() => {
    const [num, total] = installment.split("/").map((part) => Number(part.trim()) || 0);
    if (!total || total < 2 || total > MAX_INSTALLMENTS) return null;
    const parcelaAtual = num || 1;
    const restantes = Math.max(total - parcelaAtual, 0);
    if (!restantes) return null;
    const ultima = addMonthsToDue(dueDate, restantes);
    const valor = parseAmount(amount);
    return {
      mensagem: `Vai lançar ${restantes + 1} parcelas: da ${parcelaAtual}/${total} até a ${total}/${total}.`,
      detalhe: `Uma por mês, sempre no dia ${dueDate.slice(8, 10)}, terminando em ${ultima.split("-").reverse().join("/")}${
        valor > 0 ? ` · ${moneyFin(valor)} por parcela, ${moneyFin(valor * (restantes + 1))} no total` : ""
      }.`,
    };
  }, [installment, dueDate, amount]);

  const parcelasSeguintesDaEdicao = useMemo(() => {
    if (!editingExpenseId) return [];
    const editando = financeiro.expenses.find((expense) => expense.id === editingExpenseId);
    return editando ? futureOpenInstallments(financeiro.expenses, editando) : [];
  }, [editingExpenseId, financeiro.expenses]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!description.trim()) return setFeedback("Descreva a conta.");
    if (!categoryRef) return setFeedback("Escolha a categoria da P12 — é ela que faz o número bater sozinho.");
    const value = parseAmount(amount);
    if (value <= 0) return setFeedback("Informe o valor.");

    const [num, total] = installment.split("/").map((part) => Number(part.trim()) || null);
    if (total && total > MAX_INSTALLMENTS) {
      return setFeedback(`Parcelamento de ${total}x parece erro de digitação — o limite é ${MAX_INSTALLMENTS}x.`);
    }
    if (total && num && num > total) {
      return setFeedback(`Parcela ${num}/${total} não existe: a parcela não pode ser maior que o total.`);
    }
    if (total && total > 1 && recorrente) {
      return setFeedback("Escolha um dos dois: parcelado (tem fim) OU repete todo mês (não tem fim).");
    }
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
      recorrencia: recorrente ? "MENSAL" : null,
    };
    if (editingExpense) {
      financeiro.updateExpense(expense);
      // Correção em série: as parcelas SEGUINTES ainda em aberto acompanham o
      // valor/categoria/vencimento corrigidos. Parcela paga nunca é mexida.
      const seguintes = aplicarNasSeguintes ? futureOpenInstallments(financeiro.expenses, expense) : [];
      if (seguintes.length) {
        const anchorDay = Number(expense.dueDate.slice(8, 10));
        financeiro.updateExpenses(
          seguintes.map((parcela) => ({
            ...parcela,
            description: expense.description,
            categoryRef: expense.categoryRef,
            amount: expense.amount,
            method: expense.method,
            supplier: expense.supplier,
            isCapex: expense.isCapex,
            dueDate: addMonthsToDue(expense.dueDate, (parcela.installmentNum ?? 0) - (expense.installmentNum ?? 0), anchorDay),
          })),
        );
      }
      setFeedback(
        seguintes.length
          ? `Conta "${expense.description}" corrigida em ${moneyFin(value)} — e as ${seguintes.length} parcelas seguintes ainda em aberto foram ajustadas junto. Parcela já paga não foi tocada.`
          : `Conta "${expense.description}" corrigida: ${moneyFin(value)} em "${category?.name}". A P12 já refletiu.`,
      );
    } else {
      financeiro.addExpense(expense);
      // PARCELADO: a série inteira nasce junto, uma parcela em cada mês, até a
      // última (30/07/2026). Antes só a primeira era lançada e as seguintes
      // simplesmente não apareciam nos próximos meses.
      const parcelas = missingInstallments([...financeiro.expenses, expense], expense);
      if (parcelas.length) financeiro.addExpenses(parcelas);
      setFeedback(
        parcelas.length
          ? `Parcelado em ${total}x de ${moneyFin(value)}: lancei esta e as ${parcelas.length} seguintes, uma por mês, até ${parcelas.at(-1)!.dueDate.split("-").reverse().join("/")}. Cada uma cai no mês do seu vencimento na P12.`
          : recorrente
            ? `Conta recorrente lançada em "${category?.name}" · ${moneyFin(value)}. A do mês que vem nasce sozinha — edite o valor dela se mudar.`
            : `Conta lançada em "${category?.name}" · ${moneyFin(value)}.`,
      );
    }
    resetForm();
  }

  // Boleto lançado ANTES desta correção (30/07): a série existe só no rótulo.
  // Este botão lança as parcelas que faltam, sem tocar nas que já existem.
  function lancarParcelasQueFaltam(expense: FinExpense) {
    const faltam = missingInstallments(financeiro.expenses, expense);
    if (!faltam.length) return setFeedback("As parcelas seguintes desta conta já estão lançadas.");
    financeiro.addExpenses(faltam);
    setFeedback(
      `Lancei ${faltam.length} parcela(s) de "${expense.description}", uma por mês, até ${faltam.at(-1)!.dueDate.split("-").reverse().join("/")}.`,
    );
  }

  // Excluir o parcelamento inteiro (as que ainda não foram pagas).
  function excluirParcelasEmAberto(expense: FinExpense) {
    const abertas = [expense, ...futureOpenInstallments(financeiro.expenses, expense)].filter((item) => !item.paidAt);
    if (
      !window.confirm(
        `Excluir ${abertas.length} parcela(s) em aberto de "${expense.description}"?\n\nParcela já paga NÃO é excluída — o histórico fica.`,
      )
    )
      return;
    if (abertas.some((item) => item.id === editingExpenseId)) resetForm();
    financeiro.removeExpenses(abertas.map((item) => item.id));
    setFeedback(`${abertas.length} parcela(s) em aberto excluída(s). A P12 se ajustou sozinha.`);
  }

  function resetForm() {
    setEditingExpenseId(null);
    setDescription("");
    setAmount("");
    setSupplier("");
    setInstallment("");
    setDocumentNote("");
    setRecorrente(false);
    setAplicarNasSeguintes(true);
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
    setRecorrente(expense.recorrencia === "MENSAL");
    setFeedback(`Editando a conta "${expense.description}" — corrija e salve para aplicar.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Contas a Pagar" module="fin-contas">
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

        {avisos.vencidas.length || avisos.chegando.length ? (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/80 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
              <BellRing className="h-4 w-4" aria-hidden="true" />
              Contas chegando ({AVISO_DIAS} dias) e vencidas
            </p>
            <div className="space-y-1.5">
              {avisos.vencidas.map((expense) => (
                <div key={expense.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm">
                  <span className="font-semibold text-red-800">
                    VENCIDA {expense.dueDate.split("-").reverse().slice(0, 2).join("/")} · {expense.description}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-bold tabular-nums text-red-800">{moneyFin(expense.amount)}</span>
                    {!readOnly ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => financeiro.setExpensePaid(expense.id, now)}>
                        Marcar paga
                      </Button>
                    ) : null}
                  </span>
                </div>
              ))}
              {avisos.chegando.map((expense) => (
                <div key={expense.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white/70 px-3 py-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5 font-semibold text-amber-900">
                    <span>
                      {expense.dueDate === now ? "VENCE HOJE" : `Vence ${expense.dueDate.split("-").reverse().slice(0, 2).join("/")}`} · {expense.description}
                    </span>
                    {expense.recorrencia === "MENSAL" ? (
                      <Badge className="bg-brand-creme text-brand-tinta"><Repeat className="mr-1 h-3 w-3" aria-hidden="true" />Recorrente</Badge>
                    ) : null}
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="font-bold tabular-nums text-amber-900">{moneyFin(expense.amount)}</span>
                    {!readOnly ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => financeiro.setExpensePaid(expense.id, now)}>
                        Marcar paga
                      </Button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
                <Label className="flex items-center gap-1">
                  Parcela (ex.: 1/12)
                  <InfoTip title="Boleto parcelado">
                    Escreva a parcela desta conta e o total (1/12, 3/10…). Ao lançar, o app cria TODAS as parcelas
                    seguintes, uma em cada mês, até a última — cada uma entra na P12 no mês do seu vencimento. Corrigir o
                    valor de uma parcela oferece ajustar as seguintes que ainda estão em aberto.
                  </InfoTip>
                </Label>
                <Input
                  value={installment}
                  onChange={(event) => setInstallment(event.target.value)}
                  placeholder="Opcional — ex.: 1/12"
                  inputMode="text"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Fornecedor</Label>
                <Input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Opcional" />
              </div>
              <div className="sm:col-span-2">
                <Label>NF / documento</Label>
                <Input value={documentNote} onChange={(event) => setDocumentNote(event.target.value)} placeholder="Nome do arquivo ou nº da nota (opcional)" />
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-brand-oliva/16 bg-white/65 p-3 text-sm leading-6 sm:col-span-2 lg:col-span-4">
                <input
                  type="checkbox"
                  checked={recorrente}
                  onChange={(event) => setRecorrente(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-semibold text-brand-tinta">
                    <Repeat className="h-4 w-4 text-brand-musgo" aria-hidden="true" /> Repete todo mês
                  </span>
                  <span className="text-muted-foreground">
                    Aluguel, energia, assinaturas… A conta do mês seguinte nasce sozinha no mesmo dia de vencimento (o valor
                    pode ser editado depois). Para encerrar, edite a última e desmarque.
                  </span>
                </span>
              </label>
              {previewParcelas ? (
                <div className="rounded-lg border border-brand-dourado/40 bg-brand-creme/30 p-3 text-xs leading-5 sm:col-span-2 lg:col-span-4">
                  <p className="flex items-center gap-1.5 font-bold text-brand-tinta">
                    <Layers className="h-4 w-4 text-brand-dourado" aria-hidden="true" />
                    {previewParcelas.mensagem}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">{previewParcelas.detalhe}</p>
                </div>
              ) : null}
              {editingExpenseId && parcelasSeguintesDaEdicao.length ? (
                <label className="flex items-start gap-3 rounded-lg border border-brand-oliva/16 bg-white/65 p-3 text-sm leading-6 sm:col-span-2 lg:col-span-4">
                  <input
                    type="checkbox"
                    checked={aplicarNasSeguintes}
                    onChange={(event) => setAplicarNasSeguintes(event.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="font-semibold text-brand-tinta">
                      Aplicar também às {parcelasSeguintesDaEdicao.length} parcelas seguintes em aberto
                    </span>
                    <span className="block text-muted-foreground">
                      Corrige valor, categoria, forma e vencimento das próximas. Parcela já paga nunca é alterada.
                    </span>
                  </span>
                </label>
              ) : null}
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

            {/* FILTRO DE CATEGORIA (31/07): por grupo da P12, por obra ou por uma
                categoria específica — com o total do que ficou na tela. */}
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <div>
                <Label htmlFor="filtro-categoria" className="text-xs">
                  Filtrar por categoria
                </Label>
                <select
                  id="filtro-categoria"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-white/72 px-2 text-sm"
                >
                  <option value="todas">Todas as categorias</option>
                  <option value="obra">Obra / investimento (CAPEX)</option>
                  {finGroupOrder.map((groupKey) => (
                    <option key={groupKey} value={`grupo:${groupKey}`}>
                      Grupo · {finGroupLabels[groupKey]}
                    </option>
                  ))}
                  {categoriesByGroup.map((group) =>
                    group.categories.length ? (
                      <optgroup key={group.groupKey} label={finGroupLabels[group.groupKey]}>
                        {group.categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null,
                  )}
                </select>
              </div>
              <div>
                <Label htmlFor="filtro-busca" className="text-xs">
                  Buscar por descrição, fornecedor ou NF
                </Label>
                <Input
                  id="filtro-busca"
                  className="mt-1 h-10"
                  value={buscaConta}
                  onChange={(event) => setBuscaConta(event.target.value)}
                  placeholder="Ex.: Jaziel, aluguel, energia…"
                />
              </div>
              {filtroAtivo ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => {
                    setCategoryFilter("todas");
                    setBuscaConta("");
                    setStatusFilter("todas");
                  }}
                >
                  Limpar filtros
                </Button>
              ) : null}
            </div>

            {filtroAtivo ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-brand-dourado/35 bg-brand-creme/30 px-3 py-2 text-xs">
                <span className="font-bold text-brand-tinta">
                  <Filter className="mr-1 inline h-3.5 w-3.5 text-brand-dourado" aria-hidden="true" />
                  {monthExpenses.length} conta(s){nomeDoFiltro ? ` em ${nomeDoFiltro}` : ""}
                </span>
                <span className="text-muted-foreground">
                  Total <strong className="text-brand-tinta">{moneyFin(totaisFiltrados.total)}</strong>
                </span>
                <span className="text-muted-foreground">
                  A pagar <strong className="text-brand-tinta">{moneyFin(totaisFiltrados.aPagar)}</strong>
                </span>
                <span className="text-muted-foreground">
                  Já pago <strong className="text-brand-tinta">{moneyFin(totaisFiltrados.pago)}</strong>
                </span>
              </div>
            ) : null}
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
                      const serie = installmentSummary(financeiro.expenses, expense);
                      return (
                        <tr key={expense.id} className={cn(overdue && "bg-red-50/60")}>
                          <td className="px-3 py-2.5 whitespace-nowrap">{expense.dueDate.split("-").reverse().join("/")}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5 font-semibold text-brand-tinta">
                              <span>
                                {expense.description}
                                {expense.installmentNum && expense.installmentTotal ? ` · ${expense.installmentNum}/${expense.installmentTotal}` : ""}
                              </span>
                              {expense.recorrencia === "MENSAL" ? (
                                <Badge className="bg-brand-creme text-brand-tinta">
                                  <Repeat className="mr-1 h-3 w-3" aria-hidden="true" />Recorrente
                                </Badge>
                              ) : null}
                              {serie ? (
                                <Badge className="bg-brand-creme text-brand-tinta">
                                  <Layers className="mr-1 h-3 w-3" aria-hidden="true" />
                                  {serie.faltamLancar ? `${serie.lancadas} de ${serie.total} lançadas` : `${serie.abertas} em aberto`}
                                </Badge>
                              ) : null}
                            </div>
                            {expense.supplier || expense.documentNote ? (
                              <p className="text-xs text-muted-foreground">{[expense.supplier, expense.documentNote].filter(Boolean).join(" · ")}</p>
                            ) : null}
                            {serie ? (
                              <p className="text-xs text-muted-foreground">
                                {serie.faltamLancar ? (
                                  <>
                                    Faltam {serie.faltamLancar} parcela(s) sem lançar — os próximos meses estão vazios.
                                    {readOnly ? null : (
                                      <button
                                        type="button"
                                        onClick={() => lancarParcelasQueFaltam(expense)}
                                        className="ml-1 font-semibold text-brand-oliva underline underline-offset-2"
                                      >
                                        Lançar as que faltam
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    Parcelamento até {serie.ultimoVencimento.split("-").reverse().join("/")} ·{" "}
                                    {moneyFin(serie.valorAberto)} ainda a pagar
                                    {readOnly ? null : (
                                      <button
                                        type="button"
                                        onClick={() => excluirParcelasEmAberto(expense)}
                                        className="ml-1 font-semibold text-destructive underline underline-offset-2"
                                      >
                                        Excluir parcelas em aberto
                                      </button>
                                    )}
                                  </>
                                )}
                              </p>
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
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                        {filtroAtivo
                          ? `Nenhuma conta ${nomeDoFiltro ? `em ${nomeDoFiltro} ` : ""}neste mês com esse filtro — toque em "Limpar filtros" para ver todas.`
                          : "Nenhuma conta lançada neste mês."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* PROVISÕES DA POUPANÇA — o bloco "de baixo" da planilha CONTAS A PAGAR.
            Lançar aqui faz o custo do mês já sair somado; dar baixa manda o
            dinheiro para o cofre (aba Poupança), sem digitar duas vezes. */}
        <Card className="border-brand-dourado/40 bg-brand-creme/25">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <PiggyBank className="h-5 w-5 text-brand-dourado" aria-hidden="true" />
                Provisões da Poupança — {month.split("-").reverse().join("/")}
                <InfoTip title="Por que as provisões ficam aqui">
                  São os valores que a planilha antiga trazia no bloco de baixo: 13º, férias, rescisões, urgências,
                  início de ano e festa. Lançando aqui, o custo do mês já sai somado (elas entram no grupo "4. Poupanças"
                  do P12 e reduzem o lucro do mês, que é o certo em competência). Ao dar BAIXA numa provisão, o app
                  registra sozinho a entrada no cofre da aba Poupança — você não digita duas vezes. Quando o 13º/férias
                  for pago de verdade, registre SAÍDA na Poupança; não crie outra despesa (senão o custo conta duas vezes).
                </InfoTip>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-brand-musgo">
                  {provisionPlan.lancadas} de {provisionPlan.lines.length} lançadas · {moneyFin(provisionPlan.total)}/mês
                </span>
                {!readOnly && provisionPlan.pendentes > 0 ? (
                  <LiquidButton type="button" size="sm" onClick={lancarProvisoes}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Lançar {provisionPlan.pendentes} provisão(ões) do mês
                  </LiquidButton>
                ) : provisionPlan.pendentes === 0 ? (
                  <Badge variant="gold">Mês provisionado ✓</Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mobile-scrollbar-none overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase text-brand-oliva">
                  <tr>
                    <th className="px-3 py-2">Provisão</th>
                    <th className="px-3 py-2 text-right">Valor / mês</th>
                    <th className="px-3 py-2">Vencimento</th>
                    <th className="px-3 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {provisionPlan.lines.map((line) => (
                    <tr key={line.ruleId} className="border-t border-brand-oliva/10">
                      <td className="px-3 py-2 font-medium text-brand-tinta">{line.name}</td>
                      <td className="px-3 py-2 text-right font-semibold">{moneyFin(line.amount)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{monthLastDay(month).split("-").reverse().join("/")}</td>
                      <td className="px-3 py-2">
                        {line.paga ? (
                          <Badge variant="gold">Paga · no cofre</Badge>
                        ) : line.lancada ? (
                          <Badge variant="outline">Em Contas a Pagar</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Não lançada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-brand-dourado/40 bg-brand-creme/40">
                    <td className="px-3 py-2 font-bold text-brand-musgo">TOTAL provisionado no mês</td>
                    <td className="px-3 py-2 text-right font-bold text-brand-musgo">{moneyFin(provisionPlan.total)}</td>
                    <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">
                      Entra no P12 no grupo "4. Poupanças" e soma nos custos do mês
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {provisionFeedback ? <p className="mt-3 text-sm font-medium text-brand-musgo">{provisionFeedback}</p> : null}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
