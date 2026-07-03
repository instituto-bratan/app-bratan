import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, PiggyBank, Plus, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { canLembretesPagamento } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  createFinId,
  moneyFin,
  monthProvisionsDone,
  parseFinAmount,
  provisionMoveRef,
  savingsBalance,
  type FinSavingsDirection,
  type FinSavingsMove,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";

export function FinanceiroPoupancaPage() {
  const now = todayISO();
  const financeiro = useFinanceiro(Number(now.slice(0, 4)));
  const [direction, setDirection] = useState<FinSavingsDirection>("ENTRADA");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [moveDate, setMoveDate] = useState(now);
  const [provisionMonth, setProvisionMonth] = useState(now.slice(0, 7));
  const [provisionAmounts, setProvisionAmounts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");

  const balance = useMemo(() => savingsBalance(financeiro.savingsMoves), [financeiro.savingsMoves]);
  const provisionsDone = monthProvisionsDone(financeiro.savingsMoves, provisionMonth);
  const provisionTotal = financeiro.provisionRules.reduce(
    (sum, rule) => sum + parseFinAmount(provisionAmounts[rule.id] ?? String(rule.monthlyAmount).replace(".", ",")),
    0,
  );

  function handleAddMove(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const value = parseFinAmount(amount);
    if (value <= 0) return setFeedback("Informe o valor do movimento.");
    if (!reason.trim()) return setFeedback("Descreva o motivo (ex.: lucro de junho, saída obra).");
    const move: FinSavingsMove = {
      id: createFinId("fsav"),
      moveDate,
      direction,
      amount: value,
      reason: reason.trim(),
      source: "MANUAL",
      monthRef: moveDate.slice(0, 7),
      createdAt: new Date().toISOString(),
    };
    financeiro.addSavingsMoves([move]);
    setFeedback(`${direction === "ENTRADA" ? "Entrada" : "Saída"} de ${moneyFin(value)} registrada.`);
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
    <AccessGate allowed={canLembretesPagamento} label="Financeiro · Poupança">
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
                Poupança
                <InfoTip title="Como funciona a Poupança aqui?">
                  O saldo é a soma de todos os movimentos — nada de acumular célula na planilha. As provisões do mês (13º,
                  férias, festa...) aparecem como sugestão pré-preenchida: você revisa, edita ou zera cada valor e confirma
                  manualmente no fechamento, exatamente como decidiu.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Entradas, saídas e provisões confirmadas — com o saldo sempre calculado.
              </p>
            </div>
            <div className="rounded-xl border border-brand-dourado/40 bg-brand-creme/50 px-5 py-3 text-right">
              <p className="text-xs font-semibold uppercase text-brand-oliva">Saldo atual</p>
              <p className={cn("text-3xl font-bold", balance < 0 ? "text-red-700" : "text-brand-musgo")}>{moneyFin(balance)}</p>
            </div>
          </div>
        </motion.section>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                Novo movimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={handleAddMove}>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={direction === "ENTRADA" ? "default" : "outline"} onClick={() => setDirection("ENTRADA")}>
                    <ArrowUpCircle className="mr-1.5 h-4 w-4" aria-hidden="true" /> Entrada
                  </Button>
                  <Button type="button" size="sm" variant={direction === "SAIDA" ? "default" : "outline"} onClick={() => setDirection("SAIDA")}>
                    <ArrowDownCircle className="mr-1.5 h-4 w-4" aria-hidden="true" /> Saída
                  </Button>
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
                  <Label>Motivo</Label>
                  <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: entrada lucro junho, saída obra..." />
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
              financeiro.savingsMoves.slice(0, 40).map((move) => (
                <div key={move.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {move.direction === "ENTRADA" ? (
                      <ArrowUpCircle className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-tinta">{move.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        {move.moveDate.split("-").reverse().join("/")}
                        {move.source === "PROVISAO" ? " · provisão" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", move.direction === "ENTRADA" ? "text-emerald-700" : "text-red-700")}>
                      {move.direction === "ENTRADA" ? "+" : "−"}{moneyFin(move.amount)}
                    </span>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Excluir movimento ${move.reason}`} onClick={() => financeiro.removeSavingsMove(move.id)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sem movimentos ainda. Dica: comece registrando uma entrada "Saldo anterior" com o valor atual da poupança.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}
