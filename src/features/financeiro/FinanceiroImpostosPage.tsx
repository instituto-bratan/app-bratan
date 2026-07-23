import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronDown, FileText, Landmark, Plus, ReceiptText, Sparkles, Trash2, X } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  createFinId,
  invoiceTaxClass,
  invoiceTaxClassLabels,
  invoiceTaxes,
  invoiceTypeLabels,
  moneyFin,
  monthInvoiceTotals,
  monthlyTaxExpenseRef,
  nextInvoiceNumber,
  parseFinAmount,
  quarterOfMonth,
  quarterTrimestralTotal,
  quarterlyTaxExpenseRef,
  salesPendingInvoice,
  suggestInvoicePlans,
  type FinExpense,
  type FinInvoice,
  type FinInvoiceType,
  type PendingInvoiceSale,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

const typeBadgeVariant: Record<FinInvoiceType, "gold" | "muted" | "outline"> = {
  CONSULTA: "gold",
  BIOIMPEDANCIA: "outline",
  TRATAMENTO: "muted",
};

function dateBR(date: string | null | undefined) {
  if (!date) return "—";
  return date.split("-").reverse().slice(0, 2).join("/");
}

type DraftLine = { invoiceType: FinInvoiceType; numberText: string; amountText: string };

function amountToText(value: number) {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

// Cartão de emissão de UMA comanda: mostra o plano sugerido (separada/unificada),
// deixa editar tudo e registra todas as notas de uma vez.
function EmissaoCard({
  entry,
  allInvoices,
  onRegister,
}: {
  entry: PendingInvoiceSale;
  allInvoices: FinInvoice[];
  onRegister: (invoices: FinInvoice[]) => void;
}) {
  const { sale, breakdown, invoiced, remaining } = entry;
  const plans = useMemo(() => suggestInvoicePlans(sale, allInvoices), [sale, allInvoices]);
  const [planKey, setPlanKey] = useState(() => plans[0]?.key ?? "SEPARADA");
  const activePlan = plans.find((plan) => plan.key === planKey) ?? plans[0];
  const baseNumber = useMemo(() => nextInvoiceNumber(allInvoices), [allInvoices]);

  const [lines, setLines] = useState<DraftLine[]>(() =>
    (activePlan?.lines ?? []).map((line, index) => ({
      invoiceType: line.invoiceType,
      numberText: baseNumber ? String(baseNumber + index) : "",
      amountText: amountToText(line.amount),
    })),
  );
  const [issueDate, setIssueDate] = useState(todayISO());
  const [error, setError] = useState("");
  // Enquanto o usuário NÃO mexeu nos nºs, eles seguem a sequência da prefeitura:
  // registrar o cartão de cima re-preenche os de baixo com os próximos números.
  const [numbersDirty, setNumbersDirty] = useState(false);

  useEffect(() => {
    if (numbersDirty || !baseNumber) return;
    setLines((current) => current.map((line, index) => ({ ...line, numberText: String(baseNumber + index) })));
  }, [baseNumber, numbersDirty]);

  function switchPlan(key: string) {
    const plan = plans.find((candidate) => candidate.key === key);
    if (!plan) return;
    setPlanKey(plan.key);
    setLines(
      plan.lines.map((line, index) => ({
        invoiceType: line.invoiceType,
        numberText: baseNumber ? String(baseNumber + index) : "",
        amountText: amountToText(line.amount),
      })),
    );
    setNumbersDirty(false);
    setError("");
  }

  const parsedLines = lines.map((line) => ({ ...line, amount: parseFinAmount(line.amountText) }));
  const linesTotal = parsedLines.reduce((sum, line) => sum + (line.amount > 0 ? line.amount : 0), 0);
  const linesTax = parsedLines.reduce(
    (sum, line) => sum + (line.amount > 0 ? invoiceTaxes(line.invoiceType, line.amount).total : 0),
    0,
  );
  // Economia vs o caminho "preguiçoso" (tudo numa nota de consulta a 13,33%).
  const baselineTax = invoiceTaxes("CONSULTA", linesTotal).total;
  const economy = baselineTax - linesTax;
  const diffFromRemaining = linesTotal - remaining;

  function register() {
    if (!parsedLines.length) return;
    for (const line of parsedLines) {
      if (!line.numberText.trim()) return setError("Preencha o nº de todas as notas (o nº que a prefeitura emitiu).");
      if (!(line.amount > 0)) return setError("Toda nota precisa de um valor maior que zero.");
    }
    const numbers = parsedLines.map((line) => line.numberText.trim());
    if (new Set(numbers).size !== numbers.length) return setError("Tem nº de nota repetido no plano — confira.");
    const existing = new Set(allInvoices.map((invoice) => invoice.invoiceNumber.trim()));
    const duplicate = numbers.find((value) => existing.has(value));
    if (duplicate) return setError(`A NF ${duplicate} já está registrada — confira o número.`);
    onRegister(
      parsedLines.map((line) => ({
        id: createFinId("finv"),
        saleRef: sale.id,
        invoiceType: line.invoiceType,
        invoiceNumber: line.numberText.trim(),
        issueDate,
        comandaDate: sale.saleDate,
        patientName: sale.patientName,
        amount: line.amount,
        notes: "",
        createdAt: new Date().toISOString(),
      })),
    );
  }

  return (
    <div className="rounded-lg border border-brand-oliva/14 bg-white/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-brand-tinta">{sale.patientName}</p>
          <p className="text-xs text-muted-foreground">
            Comanda {dateBR(sale.saleDate)}
            {breakdown.consulta > 0 ? ` · consulta ${moneyFin(breakdown.consulta)}` : ""}
            {breakdown.bio > 0 ? ` · bio ${moneyFin(breakdown.bio)}` : ""}
            {breakdown.tratamento > 0 ? ` · tratamento ${moneyFin(breakdown.tratamento)}` : ""}
          </p>
          {invoiced > 0.5 ? (
            <p className="mt-0.5 text-xs font-semibold text-brand-oliva">
              Já emitido {moneyFin(invoiced)} · falta {moneyFin(remaining)}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase text-brand-oliva">Sem nota</p>
          <p className="text-lg font-bold text-brand-musgo">{moneyFin(remaining)}</p>
        </div>
      </div>

      {plans.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {plans.map((plan, index) => (
            <button
              key={plan.key}
              type="button"
              onClick={() => switchPlan(plan.key)}
              className={cn(
                "ios-pressable rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                planKey === plan.key
                  ? "border-brand-musgo bg-brand-musgo text-brand-papel"
                  : "border-brand-oliva/25 bg-white/70 text-brand-tinta hover:bg-brand-creme/60",
              )}
            >
              {plan.label} · imposto {moneyFin(plan.tax)}
              {index === 0 ? " ✓ menor" : ""}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2 grid gap-1.5">
        {lines.map((line, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              value={line.invoiceType}
              onChange={(event) =>
                setLines((current) =>
                  current.map((candidate, position) =>
                    position === index ? { ...candidate, invoiceType: event.target.value as FinInvoiceType } : candidate,
                  ),
                )
              }
              className="h-9 rounded-md border border-brand-oliva/25 bg-white/80 px-2 text-sm text-brand-tinta"
              aria-label="Tipo da nota"
            >
              {(Object.keys(invoiceTypeLabels) as FinInvoiceType[]).map((type) => (
                <option key={type} value={type}>
                  {invoiceTypeLabels[type]} ({invoiceTaxClass(type) === "CONSULTA" ? "13,33%" : "7,93%"})
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase text-brand-oliva">Nº</span>
              <Input
                value={line.numberText}
                onChange={(event) => {
                  setNumbersDirty(true);
                  setLines((current) =>
                    current.map((candidate, position) => (position === index ? { ...candidate, numberText: event.target.value } : candidate)),
                  );
                }}
                className="h-9 w-24"
                inputMode="numeric"
                placeholder="6017"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase text-brand-oliva">Valor</span>
              <Input
                value={line.amountText}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((candidate, position) => (position === index ? { ...candidate, amountText: event.target.value } : candidate)),
                  )
                }
                className="h-9 w-28"
                inputMode="decimal"
                placeholder="0,00"
              />
            </label>
            <span className="text-xs text-muted-foreground">
              imposto {moneyFin(parseFinAmount(line.amountText) > 0 ? invoiceTaxes(line.invoiceType, parseFinAmount(line.amountText)).total : 0)}
            </span>
            {lines.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remover esta nota do plano"
                onClick={() => setLines((current) => current.filter((_, position) => position !== index))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setLines((current) => [
              ...current,
              {
                invoiceType: "CONSULTA",
                numberText: baseNumber ? String(baseNumber + current.length) : "",
                amountText: "",
              },
            ])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> nota
        </Button>
        <label className="flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase text-brand-oliva">Emissão</span>
          <Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="h-9 w-36" />
        </label>
        <LiquidButton type="button" size="sm" className="h-9 px-4" onClick={register}>
          Registrar {parsedLines.length} nota{parsedLines.length > 1 ? "s" : ""} · {moneyFin(linesTotal)}
        </LiquidButton>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
        {economy > 0.005 ? (
          <span className="flex items-center gap-1 font-semibold text-brand-musgo">
            <Sparkles className="h-3.5 w-3.5 text-brand-dourado" aria-hidden="true" />
            economiza {moneyFin(economy)} vs tudo em nota de consulta
          </span>
        ) : null}
        {Math.abs(diffFromRemaining) > 0.5 ? (
          <span className="font-semibold text-amber-700">
            {diffFromRemaining > 0
              ? `atenção: ${moneyFin(Math.abs(diffFromRemaining))} acima do valor sem nota`
              : `ficam ${moneyFin(Math.abs(diffFromRemaining))} ainda sem nota`}
          </span>
        ) : null}
        {error ? <span className="font-semibold text-red-700">{error}</span> : null}
      </div>
    </div>
  );
}

// Livro do mês de UMA classe de imposto (uma "aba" da planilha CONTROLE DE IMPOSTOS).
function LivroClasse({
  title,
  invoices,
  readOnly,
  onRemove,
}: {
  title: string;
  invoices: FinInvoice[];
  readOnly: boolean;
  onRemove: (id: string, number: string) => void;
}) {
  const sums = invoices.reduce(
    (accumulator, invoice) => {
      const taxes = invoiceTaxes(invoice.invoiceType, invoice.amount);
      accumulator.amount += invoice.amount;
      accumulator.iss += taxes.iss;
      accumulator.pis += taxes.pis;
      accumulator.cofins += taxes.cofins;
      accumulator.irpj += taxes.irpj;
      accumulator.csll += taxes.csll;
      return accumulator;
    },
    { amount: 0, iss: 0, pis: 0, cofins: 0, irpj: 0, csll: 0 },
  );
  const mensal = sums.iss + sums.pis + sums.cofins;
  const trimestral = sums.irpj + sums.csll;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mobile-scrollbar-none overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-xs tabular-nums">
            <thead className="uppercase text-brand-oliva">
              <tr>
                <th className="px-2 py-2">Emissão</th>
                <th className="px-2 py-2">Comanda</th>
                <th className="px-2 py-2">Nº</th>
                <th className="px-2 py-2">Paciente</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2 text-right">Valor</th>
                <th className="px-2 py-2 text-right">ISS</th>
                <th className="px-2 py-2 text-right">PIS</th>
                <th className="px-2 py-2 text-right">COFINS</th>
                <th className="px-2 py-2 text-right">IRPJ</th>
                <th className="px-2 py-2 text-right">CSLL</th>
                <th className="px-2 py-2 text-right">Imposto</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-oliva/10">
              {invoices.length ? (
                invoices.map((invoice) => {
                  const taxes = invoiceTaxes(invoice.invoiceType, invoice.amount);
                  return (
                    <tr key={invoice.id}>
                      <td className="whitespace-nowrap px-2 py-2">{dateBR(invoice.issueDate)}</td>
                      <td className="whitespace-nowrap px-2 py-2">{dateBR(invoice.comandaDate)}</td>
                      <td className="px-2 py-2 font-semibold text-brand-musgo">{invoice.invoiceNumber}</td>
                      <td className="max-w-40 truncate px-2 py-2">{invoice.patientName || "—"}</td>
                      <td className="px-2 py-2">
                        <Badge variant={typeBadgeVariant[invoice.invoiceType]}>{invoiceTypeLabels[invoice.invoiceType]}</Badge>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-brand-tinta">{moneyFin(invoice.amount)}</td>
                      <td className="px-2 py-2 text-right">{moneyFin(taxes.iss)}</td>
                      <td className="px-2 py-2 text-right">{moneyFin(taxes.pis)}</td>
                      <td className="px-2 py-2 text-right">{moneyFin(taxes.cofins)}</td>
                      <td className="px-2 py-2 text-right">{moneyFin(taxes.irpj)}</td>
                      <td className="px-2 py-2 text-right">{moneyFin(taxes.csll)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-brand-musgo">{moneyFin(taxes.total)}</td>
                      <td className="px-2 py-2">
                        {readOnly ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Excluir NF ${invoice.invoiceNumber}`}
                            onClick={() => onRemove(invoice.id, invoice.invoiceNumber)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={13} className="px-2 py-6 text-center text-muted-foreground">
                    Nenhuma nota desta classe no mês.
                  </td>
                </tr>
              )}
            </tbody>
            {invoices.length ? (
              <tfoot>
                <tr className="border-t-2 border-brand-oliva/25 font-bold text-brand-musgo">
                  <td className="px-2 py-2" colSpan={5}>
                    TOTAL ({invoices.length} nota{invoices.length > 1 ? "s" : ""})
                  </td>
                  <td className="px-2 py-2 text-right">{moneyFin(sums.amount)}</td>
                  <td className="px-2 py-2 text-right">{moneyFin(sums.iss)}</td>
                  <td className="px-2 py-2 text-right">{moneyFin(sums.pis)}</td>
                  <td className="px-2 py-2 text-right">{moneyFin(sums.cofins)}</td>
                  <td className="px-2 py-2 text-right">{moneyFin(sums.irpj)}</td>
                  <td className="px-2 py-2 text-right">{moneyFin(sums.csll)}</td>
                  <td className="px-2 py-2 text-right">{moneyFin(mensal + trimestral)}</td>
                  <td className="px-2 py-2" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {invoices.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Imposto mensal (ISS+PIS+COFINS): <strong className="text-brand-musgo">{moneyFin(mensal)}</strong> · Trimestral
            (IRPJ+CSLL): <strong className="text-brand-musgo">{moneyFin(trimestral)}</strong>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FinanceiroImpostosPage() {
  const { pessoa } = useAuth();
  const readOnly = !canFinanceiroFull(pessoa?.cargo);
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [feedback, setFeedback] = useState("");
  const [showAvulsa, setShowAvulsa] = useState(false);

  const pending = useMemo(
    () => salesPendingInvoice(financeiro.sales, financeiro.invoices, month),
    [financeiro.sales, financeiro.invoices, month],
  );
  const pendingTotal = pending.reduce((sum, entry) => sum + entry.remaining, 0);
  const monthInvoices = useMemo(
    () =>
      financeiro.invoices
        .filter((invoice) => invoice.issueDate.slice(0, 7) === month)
        .sort((a, b) => (a.issueDate === b.issueDate ? a.invoiceNumber.localeCompare(b.invoiceNumber, "pt-BR", { numeric: true }) : a.issueDate.localeCompare(b.issueDate))),
    [financeiro.invoices, month],
  );
  const totals = useMemo(() => monthInvoiceTotals(financeiro.invoices, month), [financeiro.invoices, month]);
  const quarterRef = quarterOfMonth(month);
  const quarterTotal = useMemo(() => quarterTrimestralTotal(financeiro.invoices, quarterRef), [financeiro.invoices, quarterRef]);

  const monthlyGuideId = monthlyTaxExpenseRef(month);
  const quarterlyGuideId = quarterlyTaxExpenseRef(quarterRef);
  const monthlyGuideExists = financeiro.expenses.some((expense) => expense.id === monthlyGuideId);
  const quarterlyGuideExists = financeiro.expenses.some((expense) => expense.id === quarterlyGuideId);

  // Form da nota avulsa (sem comanda no sistema — ex.: acerto antigo).
  const [avulsa, setAvulsa] = useState({ invoiceType: "CONSULTA" as FinInvoiceType, numberText: "", amountText: "", patientName: "", issueDate: now, comandaDate: "" });

  function nextMonthDay20(reference: string) {
    const [year, monthNumber] = reference.split("-").map(Number);
    const next = new Date(year, monthNumber, 20);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-20`;
  }

  function createGuide(kind: "MENSAL" | "TRIMESTRAL") {
    const isMonthly = kind === "MENSAL";
    const amount = isMonthly ? totals.mensal : quarterTotal;
    if (amount <= 0) return;
    const expense: FinExpense = {
      id: isMonthly ? monthlyGuideId : quarterlyGuideId,
      description: isMonthly
        ? `Guia impostos mensais (ISS+PIS+COFINS) ${month.split("-").reverse().join("/")}`
        : `Guia impostos trimestrais (IRPJ+CSLL) ${quarterRef}`,
      categoryRef: isMonthly ? "cat-impostos-mensais" : "cat-impostos-trimestrais",
      amount: Math.round(amount * 100) / 100,
      dueDate: nextMonthDay20(month),
      paidAt: null,
      method: "BOLETO",
      supplier: "Receita / Prefeitura",
      installmentNum: null,
      installmentTotal: null,
      documentNote: "Gerada pelo módulo de Impostos",
      isCapex: false,
      notes: isMonthly ? `Base: ${totals.count} NFs de ${month}.` : `Base: NFs do trimestre ${quarterRef}.`,
      createdAt: new Date().toISOString(),
    };
    financeiro.addExpense(expense);
    setFeedback(`Guia ${isMonthly ? "mensal" : "trimestral"} de ${moneyFin(expense.amount)} lançada em Contas a Pagar e na P12.`);
  }

  function registerBatch(invoices: FinInvoice[]) {
    for (const invoice of invoices) financeiro.addInvoice(invoice);
    const numbers = invoices.map((invoice) => invoice.invoiceNumber).join(", ");
    setFeedback(
      `${invoices.length > 1 ? `${invoices.length} notas registradas` : "Nota registrada"} (NF ${numbers}) · ${moneyFin(invoices.reduce((sum, invoice) => sum + invoice.amount, 0))} para ${invoices[0]?.patientName || "paciente"}.`,
    );
  }

  function registerAvulsa() {
    const amount = parseFinAmount(avulsa.amountText);
    if (!avulsa.numberText.trim() || !(amount > 0)) return;
    if (financeiro.invoices.some((invoice) => invoice.invoiceNumber.trim() === avulsa.numberText.trim())) {
      setFeedback(`A NF ${avulsa.numberText.trim()} já está registrada — confira o número.`);
      return;
    }
    financeiro.addInvoice({
      id: createFinId("finv"),
      saleRef: null,
      invoiceType: avulsa.invoiceType,
      invoiceNumber: avulsa.numberText.trim(),
      issueDate: avulsa.issueDate,
      comandaDate: avulsa.comandaDate || null,
      patientName: avulsa.patientName.trim(),
      amount,
      notes: "Nota avulsa (sem comanda no app)",
      createdAt: new Date().toISOString(),
    });
    setFeedback(`NF avulsa ${avulsa.numberText.trim()} registrada (${moneyFin(amount)}).`);
    setAvulsa({ invoiceType: "CONSULTA", numberText: "", amountText: "", patientName: "", issueDate: now, comandaDate: "" });
  }

  const consultaInvoices = monthInvoices.filter((invoice) => invoiceTaxClass(invoice.invoiceType) === "CONSULTA");
  const procedimentoInvoices = monthInvoices.filter((invoice) => invoiceTaxClass(invoice.invoiceType) === "PROCEDIMENTO");

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Impostos">
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
                Impostos & Notas Fiscais
                <InfoTip title="Como a clínica emite (e o app ajuda)">
                  São 3 tipos de nota e 2 classes de imposto: CONSULTA paga 13,33% e TRATAMENTO/BIOIMPEDÂNCIA (procedimento)
                  pagam 7,93%. Por isso a prática da equipe: consulta paga vira DUAS notas (bio R$200 no imposto menor +
                  consulta no resto) e, quando fecha tratamento, dá para UNIFICAR tudo numa nota de tratamento — o menor
                  imposto. SINAL não gera nota: ele é somado na nota do serviço quando acontece (por isso a nota pode sair
                  maior que a comanda do dia — e comanda só de sinal nem aparece na fila). A fila abaixo já sugere o plano
                  certo por comanda; é só conferir o nº da prefeitura e registrar. O imposto mensal (ISS+PIS+COFINS) e o
                  trimestral (IRPJ+CSLL) viram guias em Contas a Pagar com um clique.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                O mesmo controle da planilha CONTROLE DE IMPOSTOS — sem fórmula quebrada e sem classificar nota na aba errada.
              </p>
            </div>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" aria-label="Mês" />
          </div>
        </motion.section>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <FileText className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">NFs no mês</p>
            <p className="text-2xl font-bold text-brand-tinta">
              {totals.count} · {moneyFin(totals.amount)}
            </p>
          </div>
          <div className={cn("rounded-lg border p-4", pending.length ? "border-brand-dourado/50 bg-brand-creme/40" : "border-brand-oliva/14 bg-white/55")}>
            <ReceiptText className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Comandas sem NF</p>
            <p className="text-2xl font-bold text-brand-tinta">
              {pending.length}
              {pendingTotal > 0 ? <span className="ml-1 text-base font-semibold text-brand-oliva">· {moneyFin(pendingTotal)}</span> : null}
            </p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <Landmark className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Imposto mensal ({month.slice(5, 7)})</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totals.mensal)}</p>
            <LiquidButton
              type="button"
              size="sm"
              className={cn("mt-2 h-8 px-3 text-xs", readOnly && "hidden")}
              disabled={monthlyGuideExists || totals.mensal <= 0}
              onClick={() => createGuide("MENSAL")}
            >
              {monthlyGuideExists ? "Guia já lançada" : "Gerar guia mensal"}
            </LiquidButton>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <Landmark className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Trimestral ({quarterRef.slice(5)})</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(quarterTotal)}</p>
            <LiquidButton
              type="button"
              size="sm"
              className={cn("mt-2 h-8 px-3 text-xs", readOnly && "hidden")}
              disabled={quarterlyGuideExists || quarterTotal <= 0}
              onClick={() => createGuide("TRIMESTRAL")}
            >
              {quarterlyGuideExists ? "Guia já lançada" : "Gerar guia trimestral"}
            </LiquidButton>
          </div>
        </div>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        {/* Resumo por classe — o bloco K/L da planilha, derivado das notas. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resumo do mês por classe de imposto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mobile-scrollbar-none overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">
                    <th className="py-1.5 pr-3">Classe</th>
                    <th className="py-1.5 pr-3 text-right">Notas</th>
                    <th className="py-1.5 pr-3 text-right">Valor</th>
                    <th className="py-1.5 pr-3 text-right">Imp. mensal</th>
                    <th className="py-1.5 pr-3 text-right">Imp. trimestral</th>
                    <th className="py-1.5 text-right">Imposto total</th>
                  </tr>
                </thead>
                <tbody>
                  {(["CONSULTA", "PROCEDIMENTO"] as const).map((klass) => (
                    <tr key={klass} className="border-t border-brand-oliva/10">
                      <td className="py-2 pr-3 font-semibold text-brand-tinta">{invoiceTaxClassLabels[klass]}</td>
                      <td className="py-2 pr-3 text-right">{totals.byClass[klass].count}</td>
                      <td className="py-2 pr-3 text-right">{moneyFin(totals.byClass[klass].amount)}</td>
                      <td className="py-2 pr-3 text-right">{moneyFin(totals.byClass[klass].mensal)}</td>
                      <td className="py-2 pr-3 text-right">{moneyFin(totals.byClass[klass].trimestral)}</td>
                      <td className="py-2 text-right font-semibold text-brand-musgo">
                        {moneyFin(totals.byClass[klass].mensal + totals.byClass[klass].trimestral)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-brand-oliva/25 font-bold text-brand-musgo">
                    <td className="py-2 pr-3">TOTAL</td>
                    <td className="py-2 pr-3 text-right">{totals.count}</td>
                    <td className="py-2 pr-3 text-right">{moneyFin(totals.amount)}</td>
                    <td className="py-2 pr-3 text-right">{moneyFin(totals.mensal)}</td>
                    <td className="py-2 pr-3 text-right">{moneyFin(totals.trimestral)}</td>
                    <td className="py-2 text-right">{moneyFin(totals.mensal + totals.trimestral)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Comandas aguardando NF · {month.split("-").reverse().join("/")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {pending.length ? (
              readOnly ? (
                <p className="py-2 text-sm text-muted-foreground">
                  {pending.length} comanda{pending.length > 1 ? "s" : ""} aguardando NF (emissão restrita ao financeiro).
                </p>
              ) : (
                pending.map((entry) => (
                  // key inclui o valor já emitido: registrar uma nota parcial
                  // remonta o cartão e o plano sugerido recalcula do zero.
                  <EmissaoCard key={`${entry.sale.id}:${entry.invoiced.toFixed(2)}`} entry={entry} allInvoices={financeiro.invoices} onRegister={registerBatch} />
                ))
              )
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Todas as comandas do mês têm NF registrada. ✓</p>
            )}
          </CardContent>
        </Card>

        {/* O livro do mês — as duas "abas" da planilha, derivadas e sem fórmula quebrada. */}
        <LivroClasse
          title={`Notas de ${invoiceTaxClassLabels.CONSULTA} · ${month.split("-").reverse().join("/")}`}
          invoices={consultaInvoices}
          readOnly={readOnly}
          onRemove={(id, number) => {
            financeiro.removeInvoice(id);
            setFeedback(`NF ${number} excluída.`);
          }}
        />
        <LivroClasse
          title={`Notas de ${invoiceTaxClassLabels.PROCEDIMENTO} · ${month.split("-").reverse().join("/")}`}
          invoices={procedimentoInvoices}
          readOnly={readOnly}
          onRemove={(id, number) => {
            financeiro.removeInvoice(id);
            setFeedback(`NF ${number} excluída.`);
          }}
        />

        {readOnly ? null : (
          <Card>
            <CardHeader className="pb-2">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => setShowAvulsa((value) => !value)}
                aria-expanded={showAvulsa}
              >
                <CardTitle className="text-base">Registrar nota avulsa (sem comanda no app)</CardTitle>
                <ChevronDown className={cn("h-4 w-4 text-brand-oliva transition-transform", showAvulsa && "rotate-180")} aria-hidden="true" />
              </button>
            </CardHeader>
            {showAvulsa ? (
              <CardContent className="flex flex-wrap items-end gap-2">
                <select
                  value={avulsa.invoiceType}
                  onChange={(event) => setAvulsa((current) => ({ ...current, invoiceType: event.target.value as FinInvoiceType }))}
                  className="h-9 rounded-md border border-brand-oliva/25 bg-white/80 px-2 text-sm text-brand-tinta"
                  aria-label="Tipo da nota avulsa"
                >
                  {(Object.keys(invoiceTypeLabels) as FinInvoiceType[]).map((type) => (
                    <option key={type} value={type}>
                      {invoiceTypeLabels[type]} ({invoiceTaxClass(type) === "CONSULTA" ? "13,33%" : "7,93%"})
                    </option>
                  ))}
                </select>
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase text-brand-oliva">Nº nota</span>
                  <Input value={avulsa.numberText} onChange={(event) => setAvulsa((current) => ({ ...current, numberText: event.target.value }))} className="h-9 w-24" inputMode="numeric" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase text-brand-oliva">Valor</span>
                  <Input value={avulsa.amountText} onChange={(event) => setAvulsa((current) => ({ ...current, amountText: event.target.value }))} className="h-9 w-28" inputMode="decimal" placeholder="0,00" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase text-brand-oliva">Paciente</span>
                  <Input value={avulsa.patientName} onChange={(event) => setAvulsa((current) => ({ ...current, patientName: event.target.value }))} className="h-9 w-44" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase text-brand-oliva">Emissão</span>
                  <Input type="date" value={avulsa.issueDate} onChange={(event) => setAvulsa((current) => ({ ...current, issueDate: event.target.value }))} className="h-9 w-36" />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase text-brand-oliva">Comanda (opcional)</span>
                  <Input type="date" value={avulsa.comandaDate} onChange={(event) => setAvulsa((current) => ({ ...current, comandaDate: event.target.value }))} className="h-9 w-36" />
                </label>
                <Button type="button" size="sm" disabled={!avulsa.numberText.trim() || parseFinAmount(avulsa.amountText) <= 0} onClick={registerAvulsa}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Registrar
                </Button>
              </CardContent>
            ) : null}
          </Card>
        )}
      </div>
    </AccessGate>
  );
}

export default FinanceiroImpostosPage;
