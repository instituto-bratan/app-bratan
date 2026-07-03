import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, CheckCircle2, Plus, Trash2, UserRound } from "lucide-react";
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
  moneyFin,
  parseFinAmount,
  partnerClosingExpenseRef,
  partnerKindDefaults,
  partnerKindLabels,
  partnerMonthSummary,
  partnerProfessionalLabels,
  partnerSuggestions,
  type FinExpense,
  type FinPartnerEntry,
  type FinPartnerKind,
  type FinPartnerProfessional,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

export function FinanceiroRepassesPage() {
  const { pessoa } = useAuth();
  const readOnly = !canFinanceiroFull(pessoa?.cargo);
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [professional, setProfessional] = useState<FinPartnerProfessional>("NUTRICIONISTA");
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [feedback, setFeedback] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualKind, setManualKind] = useState<FinPartnerKind>("PLANO");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDate, setManualDate] = useState(now);

  const suggestions = useMemo(
    () => partnerSuggestions(financeiro.sales, financeiro.partnerEntries, professional, month),
    [financeiro.sales, financeiro.partnerEntries, professional, month],
  );
  const summary = useMemo(
    () => partnerMonthSummary(financeiro.partnerEntries, professional, month),
    [financeiro.partnerEntries, professional, month],
  );
  const closingId = partnerClosingExpenseRef(professional, month);
  const closingExists = financeiro.expenses.some((expense) => expense.id === closingId);

  function classify(saleItemRef: string, date: string, patientName: string, kind: FinPartnerKind) {
    const entry: FinPartnerEntry = {
      id: `fpar-${saleItemRef}`,
      professional,
      entryDate: date,
      patientName,
      saleItemRef,
      kind,
      amount: partnerKindDefaults[kind].amount,
      notes: "",
      createdAt: new Date().toISOString(),
    };
    financeiro.addPartnerEntry(entry);
  }

  function handleManual(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!manualName.trim()) return setFeedback("Informe o paciente.");
    const amount = manualAmount ? parseFinAmount(manualAmount) : partnerKindDefaults[manualKind].amount;
    const entry: FinPartnerEntry = {
      id: createFinId("fpar"),
      professional,
      entryDate: manualDate,
      patientName: manualName.trim(),
      saleItemRef: null,
      kind: manualKind,
      amount,
      notes: "Lançado manualmente",
      createdAt: new Date().toISOString(),
    };
    financeiro.addPartnerEntry(entry);
    setFeedback(`${partnerKindLabels[manualKind]} de ${manualName.trim()} registrado (${moneyFin(amount)}).`);
    setManualName("");
    setManualAmount("");
  }

  function closeMonth() {
    if (closingExists || summary.net <= 0) return;
    const categoryRef = professional === "NUTRICIONISTA" ? "cat-terceirizados-nutricionista" : "cat-terceirizados-psicologa";
    const expense: FinExpense = {
      id: closingId,
      description: `Repasse ${partnerProfessionalLabels[professional]} · ${month.split("-").reverse().join("/")}`,
      categoryRef,
      amount: Math.round(summary.net * 100) / 100,
      dueDate: `${month}-28`,
      paidAt: null,
      method: "PIX",
      supplier: partnerProfessionalLabels[professional],
      installmentNum: null,
      installmentTotal: null,
      documentNote: "Gerado pelo fechamento de repasses",
      isCapex: false,
      notes: `Instituto→Dra ${moneyFin(summary.institutoParaDra)} − Dra→Instituto ${moneyFin(summary.draParaInstituto)}.`,
      createdAt: new Date().toISOString(),
    };
    financeiro.addExpense(expense);
    setFeedback(`Fechamento lançado: ${moneyFin(expense.amount)} em Contas a Pagar (${partnerProfessionalLabels[professional]}).`);
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Repasses">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
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
                Repasses Nutri & Psi
                <InfoTip title="Como funciona o fechamento?">
                  Cada atendimento lançado nas comandas aparece aqui para classificar: plano de acompanhamento (R$ 110
                  Instituto→Dra), consulta avulsa de paciente da Dra (R$ 150 Dra→Instituto) ou retorno (sem repasse). O app
                  soma os dois lados e fecha o mês com um clique, lançando o repasse em Contas a Pagar na categoria certa.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                A planilha de fechamento da Géssica e da Barbara, montada sozinha a partir das comandas.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-40" aria-label="Mês" />
            </div>
          </div>
        </motion.section>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(partnerProfessionalLabels) as FinPartnerProfessional[]).map((option) => (
            <Button key={option} type="button" variant={professional === option ? "default" : "outline"} onClick={() => setProfessional(option)}>
              <UserRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {partnerProfessionalLabels[option]}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <p className="text-sm font-semibold text-brand-musgo">Instituto → Dra (planos)</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(summary.institutoParaDra)}</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <p className="text-sm font-semibold text-brand-musgo">Dra → Instituto (avulsas)</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(summary.draParaInstituto)}</p>
          </div>
          <div className={cn("rounded-lg border p-4", summary.net > 0 ? "border-brand-dourado/45 bg-brand-creme/40" : "border-emerald-200 bg-emerald-50/50")}>
            <p className="text-sm font-semibold text-brand-musgo">{summary.net >= 0 ? "A pagar à Dra" : "A receber da Dra"}</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(Math.abs(summary.net))}</p>
            {summary.net > 0 && !readOnly ? (
              <LiquidButton type="button" size="sm" className="mt-2 h-8 px-3 text-xs" disabled={closingExists} onClick={closeMonth}>
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                {closingExists ? "Fechamento já lançado" : "Fechar mês e lançar na P12"}
              </LiquidButton>
            ) : summary.net < 0 ? (
              <p className="mt-2 text-xs leading-4 text-muted-foreground">Saldo a favor do Instituto — registre a entrada quando a Dra repassar.</p>
            ) : null}
          </div>
        </div>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        {suggestions.length && !readOnly ? (
          <Card className="border-brand-dourado/40 bg-brand-creme/25">
            <CardHeader>
              <CardTitle className="text-lg">Vindos das comandas — classifique ({suggestions.length})</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {suggestions.map((suggestion) => (
                <div key={suggestion.saleItemRef} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/70 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-brand-tinta">{suggestion.patientName}</p>
                    <p className="text-xs text-muted-foreground">{suggestion.date.split("-").reverse().join("/")} · pago na comanda: {moneyFin(suggestion.amount)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => classify(suggestion.saleItemRef, suggestion.date, suggestion.patientName, "PLANO")}>
                      Plano (R$ 110)
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => classify(suggestion.saleItemRef, suggestion.date, suggestion.patientName, "AVULSA")}>
                      Avulsa (R$ 150)
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => classify(suggestion.saleItemRef, suggestion.date, suggestion.patientName, "RETORNO")}>
                      Retorno
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fechamento de {month.split("-").reverse().join("/")} · {partnerProfessionalLabels[professional]}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {summary.entries.length ? (
                summary.entries.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-tinta">{entry.patientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.entryDate.split("-").reverse().join("/")} · {partnerKindLabels[entry.kind]}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-bold", entry.kind === "PLANO" ? "text-brand-dourado" : entry.kind === "AVULSA" ? "text-emerald-700" : "text-muted-foreground")}>
                        {entry.kind === "RETORNO" ? "—" : moneyFin(entry.amount)}
                      </span>
                      {readOnly ? null : (
                        <Button type="button" variant="ghost" size="icon" aria-label={`Excluir ${entry.patientName}`} onClick={() => financeiro.removePartnerEntry(entry.id)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum atendimento classificado neste mês ainda.</p>
              )}
            </CardContent>
          </Card>

          <Card className={cn("h-fit", readOnly && "hidden")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                Lançar manualmente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={handleManual}>
                <div>
                  <Label>Paciente</Label>
                  <Input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Nome" />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <select value={manualKind} onChange={(event) => setManualKind(event.target.value as FinPartnerKind)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                    {(Object.keys(partnerKindLabels) as FinPartnerKind[]).map((kind) => (
                      <option key={kind} value={kind}>{partnerKindLabels[kind]}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Valor (padrão {moneyFin(partnerKindDefaults[manualKind].amount)})</Label>
                    <Input value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} placeholder={String(partnerKindDefaults[manualKind].amount)} inputMode="decimal" />
                  </div>
                  <div>
                    <Label>Data</Label>
                    <Input type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} />
                  </div>
                </div>
                <LiquidButton type="submit" size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Registrar
                </LiquidButton>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AccessGate>
  );
}
