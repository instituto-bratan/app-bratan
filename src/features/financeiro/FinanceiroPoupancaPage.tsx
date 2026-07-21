import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, HandCoins, PiggyBank, Plus, Trash2 } from "lucide-react";
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
  monthProvisionsDone,
  operationalDebtToCofre,
  parseFinAmount,
  provisionMoveRef,
  savingsBalance,
  savingsKindDirection,
  savingsKindLabels,
  type FinSavingsKind,
  type FinSavingsMove,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

// Tipos oferecidos no formulário (na ordem de uso mais comum).
const KIND_OPTIONS: { value: FinSavingsKind; hint: string }[] = [
  { value: "APORTE", hint: "Reservou dinheiro no cofre (ex.: guardar lucro para a obra)." },
  { value: "USO_OBRA", hint: "Usou o cofre para pagar a obra. Uso normal, não vira dívida." },
  { value: "EMPRESTIMO", hint: "O cofre cobriu uma conta do operacional. O operacional passa a DEVER ao cofre." },
  { value: "DEVOLUCAO", hint: "O operacional devolveu dinheiro ao cofre (quita o empréstimo)." },
  { value: "RENDIMENTO", hint: "Rendimento pago pelo banco." },
  { value: "SALDO_INICIAL", hint: "Saldo que já existia no cofre quando começou o controle." },
  { value: "AJUSTE", hint: "Correção manual (entra como entrada)." },
];

const kindBadgeVariant: Record<FinSavingsKind, "gold" | "muted" | "outline"> = {
  APORTE: "muted",
  USO_OBRA: "outline",
  EMPRESTIMO: "gold",
  DEVOLUCAO: "muted",
  RENDIMENTO: "muted",
  PROVISAO: "muted",
  SALDO_INICIAL: "outline",
  AJUSTE: "outline",
};

export function FinanceiroPoupancaPage() {
  const { pessoa } = useAuth();
  const readOnly = !canFinanceiroFull(pessoa?.cargo);
  const now = todayISO();
  const financeiro = useFinanceiro(Number(now.slice(0, 4)));
  const [kind, setKind] = useState<FinSavingsKind>("APORTE");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [moveDate, setMoveDate] = useState(now);
  const [provisionMonth, setProvisionMonth] = useState(now.slice(0, 7));
  const [provisionAmounts, setProvisionAmounts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");

  const balance = useMemo(() => savingsBalance(financeiro.savingsMoves), [financeiro.savingsMoves]);
  const debt = useMemo(() => operationalDebtToCofre(financeiro.savingsMoves), [financeiro.savingsMoves]);

  // Uso do CDB no MÊS ATUAL, derivado AUTOMÁTICO: a obra vem das contas da P12
  // (categoria CAPEX/Obras) e a sobra é o CDB resgatado no mês menos a obra.
  // Assim, se uma conta de obra muda (ex.: dividir a fatura), estes números se
  // ajustam sozinhos — sem re-sincronizar nada à mão.
  const mesAtual = now.slice(0, 7);
  const obraDoMes = useMemo(
    () =>
      financeiro.expenses
        .filter((expense) => expense.isCapex && (expense.dueDate || expense.paidAt || "").slice(0, 7) === mesAtual)
        .reduce((sum, expense) => sum + (expense.amount || 0), 0),
    [financeiro.expenses, mesAtual],
  );
  const cdbResgatadoMes = useMemo(
    () =>
      financeiro.savingsMoves
        .filter((move) => (move.kind === "USO_OBRA" || move.kind === "EMPRESTIMO") && move.monthRef === mesAtual)
        .reduce((sum, move) => sum + move.amount, 0),
    [financeiro.savingsMoves, mesAtual],
  );
  const sobraDoMes = cdbResgatadoMes - obraDoMes;
  const provisionsDone = monthProvisionsDone(financeiro.savingsMoves, provisionMonth);
  const provisionTotal = financeiro.provisionRules.reduce(
    (sum, rule) => sum + parseFinAmount(provisionAmounts[rule.id] ?? String(rule.monthlyAmount).replace(".", ",")),
    0,
  );
  const direction = savingsKindDirection[kind];

  function handleAddMove(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const value = parseFinAmount(amount);
    if (value <= 0) return setFeedback("Informe o valor do movimento.");
    if (!reason.trim()) return setFeedback("Descreva o motivo (ex.: lucro de junho, fatura da obra).");
    const move: FinSavingsMove = {
      id: createFinId("fsav"),
      moveDate,
      direction,
      amount: value,
      reason: reason.trim(),
      source: kind === "SALDO_INICIAL" ? "SALDO_INICIAL" : "MANUAL",
      kind,
      monthRef: moveDate.slice(0, 7),
      createdAt: new Date().toISOString(),
    };
    financeiro.addSavingsMoves([move]);
    setFeedback(`${savingsKindLabels[kind]}: ${moneyFin(value)} registrado.`);
    setAmount("");
    setReason("");
  }

  function confirmProvisions() {
    if (provisionsDone) return;
    const moves: FinSavingsMove[] = financeiro.provisionRules
      .map((rule) => {
        const value = parseFinAmount(provisionAmounts[rule.id] ?? String(rule.monthlyAmount).replace(".", ","));
        return {
          id: provisionMoveRef(provisionMonth, rule.id),
          moveDate: `${provisionMonth}-28`,
          direction: "ENTRADA" as const,
          amount: value,
          reason: `Provisão ${rule.name} (${provisionMonth.split("-").reverse().join("/")})`,
          source: "PROVISAO" as const,
          kind: "PROVISAO" as const,
          monthRef: provisionMonth,
          createdAt: new Date().toISOString(),
        };
      })
      .filter((move) => move.amount > 0);
    if (!moves.length) return setFeedback("Nenhum valor de provisão informado.");
    financeiro.addSavingsMoves(moves);
    setFeedback(`Provisões de ${provisionMonth.split("-").reverse().join("/")} confirmadas: ${moneyFin(moves.reduce((sum, move) => sum + move.amount, 0))}.`);
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Poupança">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Financeiro 360</Badge>
                <Badge variant="muted">{financeiro.syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Cofre / Poupança
                <InfoTip title="Como funciona o cofre?">
                  O cofre guarda o dinheiro reservado (obra/CDB, provisões de 13º e férias). Cada movimento tem um TIPO: guardei
                  (aporte), usei na obra, o cofre cobriu uma conta do operacional (empréstimo, que fica como dívida a devolver)
                  ou o operacional devolveu. Assim a obra nunca se mistura com o dia a dia. O saldo é a soma dos movimentos.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Tudo separado: o que é da obra, o que foi guardado e o que o operacional pegou emprestado do cofre.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-brand-dourado/40 bg-brand-creme/50 px-5 py-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-brand-oliva">
                  <PiggyBank className="h-4 w-4" aria-hidden="true" /> Saldo do cofre
                </p>
                <p className={cn("mt-1 text-3xl font-bold", balance < 0 ? "text-red-700" : "text-brand-musgo")}>{moneyFin(balance)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Total reservado (obra, provisões, aportes).</p>
              </div>
              <div className={cn("rounded-xl border px-5 py-4", debt > 0.005 ? "border-amber-400/60 bg-amber-50/60" : "border-brand-oliva/20 bg-white/60")}>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-brand-oliva">
                  <HandCoins className="h-4 w-4" aria-hidden="true" /> Operacional deve ao cofre
                </p>
                <p className={cn("mt-1 text-3xl font-bold", debt > 0.005 ? "text-amber-700" : "text-brand-musgo")}>{moneyFin(debt)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {debt > 0.005 ? "Dinheiro do cofre que cobriu contas do operacional — a devolver." : "Nada pendente. Nada misturado. 👌"}
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {cdbResgatadoMes > 0.005 ? (
          <Card className="border-brand-dourado/30 bg-brand-creme/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HandCoins className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                Uso do CDB neste mês
                <Badge variant="muted" className="text-[10px]">automático</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-brand-oliva/16 bg-white/70 px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-brand-oliva">CDB resgatado no mês</p>
                  <p className="mt-1 text-2xl font-bold text-brand-musgo">{moneyFin(cdbResgatadoMes)}</p>
                </div>
                <div className="rounded-lg border border-brand-oliva/16 bg-white/70 px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-brand-oliva">− Obra do mês (P12)</p>
                  <p className="mt-1 text-2xl font-bold text-brand-tinta">{moneyFin(obraDoMes)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">puxado das contas de obra</p>
                </div>
                <div className={cn("rounded-lg border px-4 py-3", sobraDoMes > 0.005 ? "border-amber-400/50 bg-amber-50/60" : "border-brand-oliva/16 bg-white/70")}>
                  <p className="text-xs font-semibold uppercase text-brand-oliva">= Sobra (cobriu operacional)</p>
                  <p className={cn("mt-1 text-2xl font-bold", sobraDoMes > 0.005 ? "text-amber-700" : "text-brand-musgo")}>{moneyFin(sobraDoMes)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">a devolver ao cofre</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Atualiza sozinho: a obra vem das contas da categoria Obras (P12). Mexeu numa conta de obra? Estes números se
                ajustam na hora — sem re-lançar nada.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        <div className={cn("grid gap-5 lg:grid-cols-2", readOnly && "hidden")}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                Novo movimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={handleAddMove}>
                <div>
                  <Label>O que é este movimento?</Label>
                  <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value as FinSavingsKind)}
                    className="flex h-11 w-full rounded-md border border-input bg-white/80 px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {savingsKindLabels[option.value]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                    {direction === "ENTRADA" ? (
                      <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <ArrowDownCircle className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />
                    )}
                    {KIND_OPTIONS.find((option) => option.value === kind)?.hint}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Valor</Label>
                    <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" inputMode="decimal" />
                  </div>
                  <div>
                    <Label>Data</Label>
                    <Input type="date" value={moveDate} onChange={(event) => setMoveDate(event.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Motivo / descrição</Label>
                  <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: fatura VISA obra, guardar lucro de junho..." />
                </div>
                <div>
                  <LiquidButton type="submit" size="sm">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Registrar movimento
                  </LiquidButton>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className={cn(provisionsDone && "border-emerald-200 bg-emerald-50/40")}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <PiggyBank className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                  Provisões do mês
                </CardTitle>
                <Input type="month" value={provisionMonth} onChange={(event) => setProvisionMonth(event.target.value)} className="h-9 w-40" aria-label="Mês das provisões" />
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              {provisionsDone ? (
                <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Provisões de {provisionMonth.split("-").reverse().join("/")} já confirmadas.
                </p>
              ) : (
                <>
                  {financeiro.provisionRules.map((rule) => (
                    <label key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2">
                      <span className="text-sm text-brand-tinta">{rule.name}</span>
                      <Input
                        value={provisionAmounts[rule.id] ?? String(rule.monthlyAmount).replace(".", ",")}
                        onChange={(event) => setProvisionAmounts((current) => ({ ...current, [rule.id]: event.target.value }))}
                        className="h-9 w-28 text-right"
                        inputMode="decimal"
                        aria-label={`Valor de ${rule.name}`}
                      />
                    </label>
                  ))}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-brand-musgo">Total sugerido: {moneyFin(provisionTotal)}</p>
                    <LiquidButton type="button" size="sm" onClick={confirmProvisions}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Confirmar provisões
                    </LiquidButton>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Edite ou zere qualquer linha antes de confirmar — nada entra sozinho.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Movimentos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {financeiro.savingsMoves.length ? (
              financeiro.savingsMoves.slice(0, 60).map((move) => (
                <div key={move.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {move.direction === "ENTRADA" ? (
                      <ArrowUpCircle className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-brand-tinta">{move.reason}</p>
                        {move.kind ? (
                          <Badge variant={kindBadgeVariant[move.kind]} className="shrink-0 text-[10px]">{savingsKindLabels[move.kind]}</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{move.moveDate.split("-").reverse().join("/")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", move.direction === "ENTRADA" ? "text-emerald-700" : "text-red-700")}>
                      {move.direction === "ENTRADA" ? "+" : "−"}{moneyFin(move.amount)}
                    </span>
                    {readOnly ? null : (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Excluir movimento ${move.reason}`} onClick={() => financeiro.removeSavingsMove(move.id)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sem movimentos ainda. Dica: comece com um "Saldo inicial" com o valor atual do cofre.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
