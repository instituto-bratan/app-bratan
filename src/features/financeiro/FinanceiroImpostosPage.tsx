import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileText, Landmark, Plus, ReceiptText, Trash2 } from "lucide-react";
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
  invoiceTaxes,
  invoiceTypeLabels,
  moneyFin,
  monthInvoiceTotals,
  monthlyTaxExpenseRef,
  parseFinAmount,
  quarterOfMonth,
  quarterTrimestralTotal,
  quarterlyTaxExpenseRef,
  salesPendingInvoice,
  type FinExpense,
  type FinInvoice,
  type FinInvoiceType,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

function InvoiceQuickForm({
  defaultType,
  defaultAmount,
  patientName,
  saleRef,
  comandaDate,
  onCreate,
}: {
  defaultType: FinInvoiceType;
  defaultAmount: number;
  patientName: string;
  saleRef: string | null;
  comandaDate: string | null;
  onCreate: (invoice: FinInvoice) => void;
}) {
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount).replace(".", ",") : "");
  const [issueDate, setIssueDate] = useState(todayISO());

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1">
        <span className="text-[10px] font-semibold uppercase text-brand-oliva">Nº nota</span>
        <Input value={number} onChange={(event) => setNumber(event.target.value)} className="h-9 w-24" placeholder="5951" inputMode="numeric" />
      </label>
      <label className="grid gap-1">
        <span className="text-[10px] font-semibold uppercase text-brand-oliva">Valor</span>
        <Input value={amount} onChange={(event) => setAmount(event.target.value)} className="h-9 w-28" placeholder="0,00" inputMode="decimal" />
      </label>
      <label className="grid gap-1">
        <span className="text-[10px] font-semibold uppercase text-brand-oliva">Emissão</span>
        <Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className="h-9 w-36" />
      </label>
      <Button
        type="button"
        size="sm"
        disabled={!number.trim() || parseFinAmount(amount) <= 0}
        onClick={() =>
          onCreate({
            id: createFinId("finv"),
            saleRef,
            invoiceType: defaultType,
            invoiceNumber: number.trim(),
            issueDate,
            comandaDate,
            patientName,
            amount: parseFinAmount(amount),
            notes: "",
            createdAt: new Date().toISOString(),
          })
        }
      >
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        {invoiceTypeLabels[defaultType].split(" ")[0]}
      </Button>
    </div>
  );
}

export function FinanceiroImpostosPage() {
  const { pessoa } = useAuth();
  const readOnly = !canFinanceiroFull(pessoa?.cargo);
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [feedback, setFeedback] = useState("");

  const pending = useMemo(
    () => salesPendingInvoice(financeiro.sales, financeiro.invoices, month),
    [financeiro.sales, financeiro.invoices, month],
  );
  const monthInvoices = financeiro.invoices.filter((invoice) => invoice.issueDate.slice(0, 7) === month);
  const totals = useMemo(() => monthInvoiceTotals(financeiro.invoices, month), [financeiro.invoices, month]);
  const quarterRef = quarterOfMonth(month);
  const quarterTotal = useMemo(() => quarterTrimestralTotal(financeiro.invoices, quarterRef), [financeiro.invoices, quarterRef]);

  const monthlyGuideId = monthlyTaxExpenseRef(month);
  const quarterlyGuideId = quarterlyTaxExpenseRef(quarterRef);
  const monthlyGuideExists = financeiro.expenses.some((expense) => expense.id === monthlyGuideId);
  const quarterlyGuideExists = financeiro.expenses.some((expense) => expense.id === quarterlyGuideId);

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
                <InfoTip title="Como funciona?">
                  Cada comanda vira NF de consulta (ISS 2% + PIS 0,65% + COFINS 3% + IRPJ 4,8% + CSLL 2,88%) e/ou de tratamento
                  (IRPJ 1,2% + CSLL 1,08%). O app calcula os impostos de cada nota, soma o mensal (ISS+PIS+COFINS) e o
                  trimestral (IRPJ+CSLL), e gera as guias direto em Contas a Pagar e na P12 — sem re-digitar nada.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Fila de comandas sem NF, notas do mês com impostos calculados e guias com um clique.
              </p>
            </div>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" aria-label="Mês" />
          </div>
        </motion.section>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <FileText className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">NFs no mês</p>
            <p className="text-2xl font-bold text-brand-tinta">{totals.count} · {moneyFin(totals.amount)}</p>
          </div>
          <div className={cn("rounded-lg border p-4", pending.length ? "border-brand-dourado/50 bg-brand-creme/40" : "border-brand-oliva/14 bg-white/55")}>
            <ReceiptText className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Comandas sem NF</p>
            <p className="text-2xl font-bold text-brand-tinta">{pending.length}</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <Landmark className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Imposto mensal ({month.slice(5, 7)})</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totals.mensal)}</p>
            <LiquidButton type="button" size="sm" className={cn("mt-2 h-8 px-3 text-xs", readOnly && "hidden")} disabled={monthlyGuideExists || totals.mensal <= 0} onClick={() => createGuide("MENSAL")}>
              {monthlyGuideExists ? "Guia já lançada" : "Gerar guia mensal"}
            </LiquidButton>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <Landmark className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Trimestral ({quarterRef.slice(5)})</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(quarterTotal)}</p>
            <LiquidButton type="button" size="sm" className={cn("mt-2 h-8 px-3 text-xs", readOnly && "hidden")} disabled={quarterlyGuideExists || quarterTotal <= 0} onClick={() => createGuide("TRIMESTRAL")}>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Comandas aguardando NF · {month.split("-").reverse().join("/")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {pending.length ? (
              pending.map(({ sale, consulta, tratamento }) => (
                <div key={sale.id} className="rounded-lg border border-brand-oliva/14 bg-white/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-brand-tinta">{sale.patientName}</p>
                      <p className="text-xs text-muted-foreground">
                        Comanda {sale.saleDate.split("-").reverse().join("/")}
                        {consulta > 0 ? ` · consulta ${moneyFin(consulta)}` : ""}
                        {tratamento > 0 ? ` · tratamento ${moneyFin(tratamento)}` : ""}
                        {sale.notes ? ` · ${sale.notes}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className={cn("mt-2 flex flex-wrap gap-4", readOnly && "hidden")}>
                    {consulta > 0 ? (
                      <InvoiceQuickForm defaultType="CONSULTA" defaultAmount={consulta} patientName={sale.patientName} saleRef={sale.id} comandaDate={sale.saleDate} onCreate={(invoice) => { financeiro.addInvoice(invoice); setFeedback(`NF ${invoice.invoiceNumber} registrada (${moneyFin(invoice.amount)}).`); }} />
                    ) : null}
                    {tratamento > 0 ? (
                      <InvoiceQuickForm defaultType="TRATAMENTO" defaultAmount={tratamento} patientName={sale.patientName} saleRef={sale.id} comandaDate={sale.saleDate} onCreate={(invoice) => { financeiro.addInvoice(invoice); setFeedback(`NF ${invoice.invoiceNumber} registrada (${moneyFin(invoice.amount)}).`); }} />
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Todas as comandas do mês têm NF registrada. ✓</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notas do mês (impostos calculados)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mobile-scrollbar-none overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="uppercase text-brand-oliva">
                  <tr>
                    <th className="px-2 py-2">Emissão</th>
                    <th className="px-2 py-2">Nº</th>
                    <th className="px-2 py-2">Paciente</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2 text-right">ISS</th>
                    <th className="px-2 py-2 text-right">PIS</th>
                    <th className="px-2 py-2 text-right">COFINS</th>
                    <th className="px-2 py-2 text-right">IRPJ</th>
                    <th className="px-2 py-2 text-right">CSLL</th>
                    <th className="px-2 py-2 text-right">Total imp.</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-oliva/10">
                  {monthInvoices.length ? (
                    monthInvoices.map((invoice) => {
                      const taxes = invoiceTaxes(invoice.invoiceType, invoice.amount);
                      return (
                        <tr key={invoice.id}>
                          <td className="px-2 py-2 whitespace-nowrap">{invoice.issueDate.split("-").reverse().slice(0, 2).join("/")}</td>
                          <td className="px-2 py-2 font-semibold text-brand-musgo">{invoice.invoiceNumber}</td>
                          <td className="px-2 py-2 max-w-40 truncate">{invoice.patientName}</td>
                          <td className="px-2 py-2">
                            <Badge variant={invoice.invoiceType === "CONSULTA" ? "gold" : "muted"}>{invoice.invoiceType === "CONSULTA" ? "Consulta" : "Tratamento"}</Badge>
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
                              <Button type="button" variant="ghost" size="icon" aria-label={`Excluir NF ${invoice.invoiceNumber}`} onClick={() => financeiro.removeInvoice(invoice.id)}>
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={12} className="px-2 py-8 text-center text-muted-foreground">Nenhuma NF registrada neste mês.</td>
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
