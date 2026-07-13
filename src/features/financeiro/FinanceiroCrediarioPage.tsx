import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, CircleDollarSign, Plus, Trash2, Wallet } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canLembretesPagamento } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { parseMoneyBR } from "@/lib/money";
import {
  createRemoteFinCashEntry,
  deleteRemoteFinCashEntry,
  listRemoteFinCashEntries,
  listRemotePagamentoRecebimentos,
  type FinCashEntry,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { createFinId, moneyFin } from "./financeiroData";

const cashStorageKey = "app-bratan-fin-crediario";

export function FinanceiroCrediarioPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [monthKey, setMonthKey] = useState(() => todayISO().slice(0, 7));
  const [localEntries, setLocalEntries] = useState<FinCashEntry[]>(() => readLocalValue(cashStorageKey, []));

  const [entryDate, setEntryDate] = useState(todayISO());
  const [direction, setDirection] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [feedback, setFeedback] = useState("");

  const entriesQuery = useQuery({
    queryKey: ["fin-cash-entries"],
    queryFn: listRemoteFinCashEntries,
    enabled: useRemote,
  });
  const receiptsQuery = useQuery({
    queryKey: ["pagamento-recebimentos"],
    queryFn: listRemotePagamentoRecebimentos,
    enabled: useRemote,
  });

  const manualEntries = useRemote ? entriesQuery.data ?? [] : localEntries;
  // Recebimentos em dinheiro dos Lembretes entram sozinhos como ENTRADA.
  const lembreteEntries: (FinCashEntry & { fromLembrete?: boolean })[] = useMemo(() => {
    const receipts = useRemote
      ? receiptsQuery.data ?? []
      : readLocalValue<{ id: string; valor: number; forma: string; recebidoEm: string }[]>("app-bratan-pagamento-recebimentos", []);
    return receipts
      .filter((receipt) => receipt.forma === "DINHEIRO")
      .map((receipt) => ({
        id: `lembrete-${receipt.id}`,
        entryDate: receipt.recebidoEm,
        direction: "ENTRADA" as const,
        description: "Recebimento de lembrete (dinheiro)",
        amount: receipt.valor,
        fromLembrete: true,
      }));
  }, [receiptsQuery.data, useRemote]);

  const allEntries = useMemo(
    () => [...manualEntries, ...lembreteEntries].sort((a, b) => b.entryDate.localeCompare(a.entryDate)),
    [manualEntries, lembreteEntries],
  );
  const monthEntries = allEntries.filter((entry) => entry.entryDate.startsWith(monthKey));
  const totals = useMemo(() => {
    const sum = (list: typeof allEntries, dir: "ENTRADA" | "SAIDA") =>
      list.filter((entry) => entry.direction === dir).reduce((acc, entry) => acc + entry.amount, 0);
    return {
      saldo: sum(allEntries, "ENTRADA") - sum(allEntries, "SAIDA"),
      entradasMes: sum(monthEntries, "ENTRADA"),
      saidasMes: sum(monthEntries, "SAIDA"),
    };
  }, [allEntries, monthEntries]);

  function persistLocal(next: FinCashEntry[]) {
    setLocalEntries(next);
    writeLocalValue(cashStorageKey, next);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const parsed = parseMoneyBR(amount);
    if (!description.trim()) return setFeedback("Descreva o lançamento (ex.: recebido de Fulano, troco, sangria...).");
    if (!Number.isFinite(parsed) || parsed <= 0) return setFeedback("Não entendi o valor — digite como 500,00.");

    const entry: FinCashEntry = {
      id: createFinId("fcash"),
      entryDate,
      direction,
      description: description.trim(),
      amount: Math.round(parsed * 100) / 100,
    };
    if (useRemote) {
      createRemoteFinCashEntry(entry, pessoa?.id ?? null)
        .then(() => queryClient.invalidateQueries({ queryKey: ["fin-cash-entries"] }))
        .catch(() => setFeedback("Não foi possível salvar agora. Tente de novo."));
    } else {
      persistLocal([entry, ...localEntries]);
    }
    setDescription("");
    setAmount("");
    setFeedback(
      `${direction === "ENTRADA" ? "Entrada" : "Saída"} de ${moneyFin(entry.amount)} registrada no caixa do crediário.`,
    );
  }

  function removeEntry(entry: FinCashEntry & { fromLembrete?: boolean }) {
    if (entry.fromLembrete) return;
    if (!window.confirm(`Excluir "${entry.description}" (${moneyFin(entry.amount)}) do caixa?`)) return;
    if (useRemote) {
      deleteRemoteFinCashEntry(entry.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["fin-cash-entries"] }))
        .catch(() => setFeedback("Não foi possível excluir agora. Tente de novo."));
    } else {
      persistLocal(localEntries.filter((existing) => existing.id !== entry.id));
    }
  }

  return (
    <AccessGate allowed={canLembretesPagamento} label="Financeiro · Crediário">
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
                <Badge variant="muted">Fora da P12</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Crediário (Dinheiro)
                <InfoTip title="O caixa do dinheiro vivo">
                  Livro-caixa exclusivo do dinheiro do crediário: registre aqui o que entra e o que sai. Os recebimentos em
                  dinheiro marcados nos Lembretes entram sozinhos. Nada disto se mistura com a P12 nem com as comandas — é a
                  visão limpa do caixa físico.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Entradas e saídas do dinheiro, com saldo sempre em dia.
              </p>
            </div>
            <Input
              type="month"
              value={monthKey}
              onChange={(event) => setMonthKey(event.target.value || todayISO().slice(0, 7))}
              className="w-44"
              aria-label="Mês do caixa"
            />
          </div>
        </motion.section>

        {feedback ? (
          <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            {feedback}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <Card className="border-brand-musgo/25 bg-[#f2f5ec] shadow-none">
            <CardContent className="p-4">
              <Wallet className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Saldo em caixa</p>
              <p className={cn("text-2xl font-bold", totals.saldo < 0 ? "text-destructive" : "text-brand-musgo")}>{moneyFin(totals.saldo)}</p>
            </CardContent>
          </Card>
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardContent className="p-4">
              <ArrowUpCircle className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Entradas no mês</p>
              <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totals.entradasMes)}</p>
            </CardContent>
          </Card>
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardContent className="p-4">
              <ArrowDownCircle className="h-5 w-5 text-red-500" aria-hidden="true" />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Saídas no mês</p>
              <p className="text-2xl font-bold text-brand-tinta">{moneyFin(totals.saidasMes)}</p>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
              Novo lançamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-[0.5fr_0.6fr_1.4fr_0.6fr_auto]" onSubmit={handleSubmit}>
              <div>
                <Label>Data</Label>
                <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
              </div>
              <div>
                <Label>Tipo</Label>
                <div className="flex gap-2">
                  {(["ENTRADA", "SAIDA"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDirection(option)}
                      className={cn(
                        "h-11 flex-1 rounded-md border px-2 text-sm font-semibold",
                        direction === option
                          ? option === "ENTRADA"
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : "border-red-300 bg-red-100 text-red-700"
                          : "border-brand-oliva/25 bg-white/60 text-brand-oliva",
                      )}
                    >
                      {option === "ENTRADA" ? "Entrada" : "Saída"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: recebido de Fulano · sangria para banco · troco" />
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="500,00" inputMode="decimal" />
              </div>
              <div className="flex items-end">
                <LiquidButton type="submit" size="sm">
                  <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
                  Lançar
                </LiquidButton>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Movimentações de {monthKey.split("-").reverse().join("/")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {monthEntries.length ? (
              monthEntries.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-tinta">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.entryDate.split("-").reverse().join("/")}
                      {(entry as { fromLembrete?: boolean }).fromLembrete ? " · automático (Lembretes)" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("whitespace-nowrap text-sm font-bold tabular-nums", entry.direction === "ENTRADA" ? "text-emerald-700" : "text-red-600")}>
                      {entry.direction === "ENTRADA" ? "+" : "−"} {moneyFin(entry.amount)}
                    </span>
                    {(entry as { fromLembrete?: boolean }).fromLembrete ? null : (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Excluir ${entry.description}`} onClick={() => removeEntry(entry)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma movimentação neste mês.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}

export default FinanceiroCrediarioPage;
