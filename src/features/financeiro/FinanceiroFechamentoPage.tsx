import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Landmark, Scale } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { parseMoneyBR } from "@/lib/money";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  buildDayExpected,
  createFinId,
  moneyFin,
  monthDaysWithSales,
  monthFeesExpenseRef,
  parseFinAmount,
  reconciliationStatusLabels,
  type FinExpense,
  type FinReconciliation,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

function formatDay(day: string) {
  return day.split("-").reverse().slice(0, 2).join("/");
}

function DayRow({
  day,
  financeiro,
  readOnly,
}: {
  day: string;
  financeiro: ReturnType<typeof useFinanceiro>;
  readOnly: boolean;
}) {
  const expected = useMemo(() => buildDayExpected(financeiro.sales, day), [financeiro.sales, day]);
  const saved = financeiro.reconciliations.find((record) => record.day === day) ?? null;
  const [feeItau, setFeeItau] = useState(saved ? String(saved.feeItau).replace(".", ",") : "");
  const [feeSafra, setFeeSafra] = useState(saved && saved.feeSafra ? String(saved.feeSafra).replace(".", ",") : "");
  const [note, setNote] = useState(saved?.divergenceNote ?? "");

  function save(status: FinReconciliation["status"]) {
    const record: FinReconciliation = {
      id: saved?.id ?? `frec-${day}`,
      day,
      expectedPix: expected.pix,
      expectedCardItau: expected.cardItau,
      expectedCardSafra: expected.cardSafra,
      expectedCardOutra: expected.cardOutra,
      expectedDinheiro: expected.dinheiro,
      feeItau: parseFinAmount(feeItau),
      feeSafra: parseFinAmount(feeSafra),
      status,
      divergenceNote: status === "DIVERGENTE" ? note.trim() : "",
      confirmedAt: new Date().toISOString(),
    };
    financeiro.saveReconciliation(record);
  }

  const status = saved?.status ?? "PENDENTE";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 sm:p-4",
        status === "CONFERIDO" && "border-emerald-200 bg-emerald-50/50",
        status === "DIVERGENTE" && "border-red-200 bg-red-50/60",
        status === "PENDENTE" && "border-brand-oliva/16 bg-white/60",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-lg font-bold text-brand-musgo">{formatDay(day)}</p>
          <Badge variant={status === "CONFERIDO" ? "muted" : status === "DIVERGENTE" ? "outline" : "gold"} className={cn(status === "DIVERGENTE" && "border-red-300 text-red-800")}>
            {reconciliationStatusLabels[status]}
          </Badge>
          <span className="text-xs text-muted-foreground">{expected.salesCount} comandas · {moneyFin(expected.total)}</span>
        </div>
        <div className={cn("flex gap-2", readOnly && "hidden")}>
          <Button type="button" size="sm" variant={status === "CONFERIDO" ? "default" : "outline"} onClick={() => save("CONFERIDO")}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Bateu
          </Button>
          <Button type="button" size="sm" variant="outline" className="border-red-300 text-red-800 hover:bg-red-50" onClick={() => save("DIVERGENTE")}>
            <AlertTriangle className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Divergente
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-5">
        <div className="rounded-md bg-white/70 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-brand-oliva">PIX esperado</p>
          <p className="font-semibold text-brand-tinta">{moneyFin(expected.pix)}</p>
        </div>
        <div className="rounded-md bg-white/70 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-brand-oliva">Cartão Itaú</p>
          <p className="font-semibold text-brand-tinta">{moneyFin(expected.cardItau)}</p>
        </div>
        <div className="rounded-md bg-white/70 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-brand-oliva">Cartão Safra</p>
          <p className="font-semibold text-brand-tinta">{moneyFin(expected.cardSafra)}</p>
        </div>
        <div className="rounded-md bg-white/70 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-brand-oliva">Dinheiro</p>
          <p className="font-semibold text-brand-tinta">{moneyFin(expected.dinheiro)}</p>
        </div>
        <div className="rounded-md bg-white/70 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-brand-oliva">Outros</p>
          <p className="font-semibold text-brand-tinta">{moneyFin(expected.outros)}</p>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase text-brand-oliva">Taxa descontada Itaú (extrato)</span>
          <Input value={feeItau} onChange={(event) => setFeeItau(event.target.value)} placeholder="0,00" inputMode="decimal" className="h-10" />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase text-brand-oliva">Taxa descontada Safra</span>
          <Input value={feeSafra} onChange={(event) => setFeeSafra(event.target.value)} placeholder="0,00" inputMode="decimal" className="h-10" />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase text-brand-oliva">Observação (se divergente)</span>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: faltou cair 1 crédito 3x" className="h-10" />
        </label>
      </div>
    </div>
  );
}

export function FinanceiroFechamentoPage() {
  const { pessoa } = useAuth();
  const readOnly = !canFinanceiroFull(pessoa?.cargo);
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [feedback, setFeedback] = useState("");
  const [bankYield, setBankYield] = useState("");
  const [bankYieldDate, setBankYieldDate] = useState(todayISO());

  const days = useMemo(() => monthDaysWithSales(financeiro.sales, month).reverse(), [financeiro.sales, month]);
  const monthRecs = financeiro.reconciliations.filter((record) => record.day.slice(0, 7) === month);
  const feesTotal = monthRecs.reduce((sum, record) => sum + record.feeItau + record.feeSafra, 0);
  const conferidos = monthRecs.filter((record) => record.status === "CONFERIDO").length;
  const divergentes = monthRecs.filter((record) => record.status === "DIVERGENTE").length;
  const feesExpenseId = monthFeesExpenseRef(month);
  const feesExpenseExists = financeiro.expenses.some((expense) => expense.id === feesExpenseId);

  function generateFeesExpense() {
    if (feesExpenseExists || feesTotal <= 0) return;
    const lastDay = `${month}-28`;
    const expense: FinExpense = {
      id: feesExpenseId,
      description: `Tarifas maquininhas ${month.split("-").reverse().join("/")}`,
      categoryRef: "cat-tarifa-bancaria-rede",
      amount: Math.round(feesTotal * 100) / 100,
      dueDate: lastDay,
      paidAt: lastDay,
      method: "DEBITO_CONTA",
      supplier: "Itaú / Safra",
      installmentNum: null,
      installmentTotal: null,
      documentNote: "Gerado pelo Fechamento do dia",
      isCapex: false,
      notes: `Soma das taxas registradas na conciliação de ${month}.`,
      createdAt: new Date().toISOString(),
    };
    financeiro.addExpense(expense);
    setFeedback(`Despesa de tarifas (${moneyFin(feesTotal)}) lançada na P12 em "Tarifa bancária (rede)".`);
  }

  function registrarRendimento() {
    const amount = parseMoneyBR(bankYield);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback("Não entendi o valor do rendimento — digite como 152,37.");
      return;
    }
    // A data vem do extrato — é ela que alinha a conciliação.
    const moveDate = bankYieldDate || todayISO();
    financeiro.addSavingsMoves([
      {
        id: createFinId("fsav"),
        moveDate,
        direction: "ENTRADA",
        amount: Math.round(amount * 100) / 100,
        reason: "Rendimento do banco",
        source: "MANUAL",
        monthRef: moveDate.slice(0, 7),
        createdAt: new Date().toISOString(),
      },
    ]);
    setBankYield("");
    setBankYieldDate(todayISO());
    setFeedback(`Rendimento do banco de ${moneyFin(amount)} registrado em ${moveDate.split("-").reverse().join("/")} — entra na linha "Entrada de valores" da P12 e na Poupança.`);
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Fechamento">
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
                Fechamento do dia
                <InfoTip title="O que é o Fechamento?">
                  O "bater com o Itaú" virou checklist: para cada dia com comandas, o app mostra o que deveria ter caído por
                  forma de pagamento e maquininha. Você confere no extrato, registra a taxa descontada e marca "Bateu" ou
                  "Divergente" com o motivo. No fim do mês, um clique lança a soma das taxas na P12.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Esperado × extrato, dia a dia. Divergência fica vermelha até ser resolvida.
              </p>
            </div>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" aria-label="Mês" />
          </div>
        </motion.section>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <Scale className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Dias conferidos</p>
            <p className="text-2xl font-bold text-brand-tinta">{conferidos} / {days.length}</p>
          </div>
          <div className={cn("rounded-lg border p-4", divergentes ? "border-red-200 bg-red-50" : "border-brand-oliva/14 bg-white/55")}>
            <AlertTriangle className={cn("h-5 w-5", divergentes ? "text-red-700" : "text-brand-musgo")} aria-hidden="true" />
            <p className={cn("mt-2 text-sm font-semibold", divergentes ? "text-red-800" : "text-brand-musgo")}>Divergências abertas</p>
            <p className={cn("text-2xl font-bold", divergentes ? "text-red-800" : "text-brand-tinta")}>{divergentes}</p>
          </div>
          <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
            <Landmark className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-brand-musgo">Taxas registradas no mês</p>
            <p className="text-2xl font-bold text-brand-tinta">{moneyFin(feesTotal)}</p>
            <LiquidButton
              type="button"
              size="sm"
              className={cn("mt-2 h-8 px-3 text-xs", readOnly && "hidden")}
              onClick={generateFeesExpense}
              disabled={feesExpenseExists || feesTotal <= 0}
            >
              {feesExpenseExists ? "Já lançada na P12" : "Lançar tarifas na P12"}
            </LiquidButton>
          </div>
        </div>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        <Card className="border-brand-dourado/30 bg-brand-creme/35 shadow-none">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-brand-musgo">Rendimento do banco no mês</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Quando a conta render, lance aqui: o valor entra como "Entrada de valores" na P12 e no histórico da Poupança — sem virar comanda.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Input
                  type="date"
                  value={bankYieldDate}
                  onChange={(event) => setBankYieldDate(event.target.value)}
                  className="w-40"
                  aria-label="Data do rendimento (a mesma do extrato)"
                />
                <Input
                  value={bankYield}
                  onChange={(event) => setBankYield(event.target.value)}
                  placeholder="Ex.: 152,37"
                  inputMode="decimal"
                  className="w-32"
                  aria-label="Valor do rendimento do banco"
                />
                <Button type="button" variant="outline" size="sm" onClick={registrarRendimento} disabled={readOnly}>
                  Registrar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dias de {month.split("-").reverse().join("/")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {days.length ? (
              days.map((day) => <DayRow key={`${day}-${financeiro.reconciliations.find((r) => r.day === day)?.confirmedAt ?? "novo"}`} day={day} financeiro={financeiro} readOnly={readOnly} />)
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma comanda lançada neste mês ainda — o fechamento nasce do Lançar Dia.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
