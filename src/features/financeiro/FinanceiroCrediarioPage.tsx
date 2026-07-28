import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CircleDollarSign, Plus, ScanLine, Trash2, Wallet } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import {
  cofreItemsFromManuais,
  cofreItemsFromRecebimentos,
  crediarioCashMoves,
  findCofreSuspects,
  type CofreItem,
} from "@/features/pagamentos/pagamentosData";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canLembretesPagamento } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { parseMoneyBR } from "@/lib/money";
import {
  createRemoteFinCashEntry,
  deleteRemoteFinCashEntry,
  deleteRemotePagamentoRecebimento,
  listRemoteFinCashEntries,
  listRemotePagamentoRecebimentos,
  type FinCashEntry,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { createFinId, moneyFin } from "./financeiroData";

const cashStorageKey = "app-bratan-fin-crediario";

type PagamentoRecebimentoRow = {
  id: string;
  lembreteId: string;
  valor: number;
  forma: string;
  recebidoEm: string;
  saleRef?: string | null;
  pacienteNome?: string | null;
  lembreteStatus?: string | null;
  lembreteApagado?: boolean;
};

const motivoLabel: Record<string, string> = {
  MESMO_VALOR_MESMO_DIA: "lançado 2x no mesmo dia",
  MESMO_VALOR_REPETIDO: "mesmo valor repetido",
  RECEBIMENTO_E_MANUAL: "lembrete + lançado à mão",
  LEMBRETE_APAGADO: "lembrete apagado",
  LEMBRETE_CANCELADO: "lembrete cancelado",
};

function dataBR(value: string) {
  return value.slice(0, 10).split("-").reverse().join("/");
}

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
  // Conferência do cofre: o valor contado à mão e o resultado do estorno.
  const [cofreContado, setCofreContado] = useState("");
  const [estornoFeedback, setEstornoFeedback] = useState("");
  const readOnly = !canEditModule(pessoa, "fin-crediario");

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
  const allReceipts = useMemo(
    () =>
      useRemote
        ? receiptsQuery.data ?? []
        : readLocalValue<PagamentoRecebimentoRow[]>("app-bratan-pagamento-recebimentos", []),
    [receiptsQuery.data, useRemote],
  );
  const lembreteEntries: (FinCashEntry & { fromLembrete?: boolean })[] = useMemo(() => {
    // Recebimento que veio de COMANDA (saleRef) já está no faturamento — trazer
    // para o caixa do crediário contaria o mesmo dinheiro duas vezes (28/07).
    return crediarioCashMoves(allReceipts)
      .map((receipt) => ({
        id: `lembrete-${receipt.id}`,
        entryDate: receipt.recebidoEm.slice(0, 10),
        direction: "ENTRADA" as const,
        description: `Recebimento de ${receipt.pacienteNome ?? "lembrete"} (dinheiro)`,
        amount: receipt.valor,
        fromLembrete: true,
      }));
  }, [allReceipts]);

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

  // Conferência do cofre: o app x o que foi contado na mão.
  const suspects = useMemo(
    () =>
      findCofreSuspects({
        recebimentos: cofreItemsFromRecebimentos(allReceipts),
        manuais: cofreItemsFromManuais(manualEntries),
      }),
    [allReceipts, manualEntries],
  );
  const totalEmRisco = useMemo(
    () => suspects.reduce((acc, suspect) => acc + suspect.valorEmRisco, 0),
    [suspects],
  );
  const contado = parseMoneyBR(cofreContado);
  const contadoValido = cofreContado.trim().length > 0 && Number.isFinite(contado);
  const diferencaCofre = contadoValido ? Math.round((totals.saldo - contado) * 100) / 100 : null;

  const estornoMutation = useMutation({
    mutationFn: (values: { id: string; motivo: string }) => deleteRemotePagamentoRecebimento(values),
    onSuccess: () => {
      setEstornoFeedback("Recebimento estornado: o valor voltou a ficar em aberto no lembrete e saiu do caixa.");
      queryClient.invalidateQueries({ queryKey: ["pagamento-recebimentos"] });
      queryClient.invalidateQueries({ queryKey: ["pagamentos"] });
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
    },
    onError: (error: unknown) =>
      setEstornoFeedback(
        error instanceof Error && error.message
          ? `Não deu para estornar: ${error.message}`
          : "Não foi possível estornar agora. Tente de novo.",
      ),
  });

  function tirarDoCofre(item: CofreItem) {
    setEstornoFeedback("");
    if (readOnly) return setEstornoFeedback("Você não tem permissão para mexer nos lançamentos do caixa.");
    const dia = dataBR(item.data);
    if (item.kind === "MANUAL") {
      if (!window.confirm(`Excluir a entrada "${item.quem}" de ${moneyFin(item.valor)} (${dia}) do caixa?`)) return;
      if (useRemote) {
        deleteRemoteFinCashEntry(item.id)
          .then(() => {
            setEstornoFeedback("Entrada manual excluída do caixa.");
            queryClient.invalidateQueries({ queryKey: ["fin-cash-entries"] });
          })
          .catch(() => setEstornoFeedback("Não foi possível excluir agora. Tente de novo."));
      } else {
        persistLocal(localEntries.filter((existing) => existing.id !== item.id));
        setEstornoFeedback("Entrada manual excluída do caixa.");
      }
      return;
    }
    if (!useRemote) return setEstornoFeedback("O estorno só funciona conectado ao sistema (fora do modo demonstração).");
    if (
      !window.confirm(
        `Estornar ${moneyFin(item.valor)} de ${item.quem} (recebido em ${dia})?\n\n` +
          "O valor volta a ficar em aberto no lembrete e sai do caixa do crediário. Fica registrado quem estornou.",
      )
    )
      return;
    estornoMutation.mutate({ id: item.id, motivo: "Conferência do cofre — lançamento duplicado" });
  }

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
    <AccessGate allowed={canLembretesPagamento} label="Financeiro · Crediário" module="fin-crediario">
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

        {/* CONFERÊNCIA DO COFRE — informe o dinheiro contado e o app aponta a
            diferença e os lançamentos suspeitos (28/07). */}
        <Card className="border-brand-dourado/40 bg-brand-creme/25">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              <ScanLine className="h-5 w-5 text-brand-dourado" aria-hidden="true" />
              Conferir o cofre
              <InfoTip title="Para que serve">
                Conte o dinheiro do cofre e digite aqui. Se der diferença, o app mostra os lançamentos com cara de
                duplicata (mesmo paciente e mesmo valor lançados mais de uma vez) — geralmente é recebimento refeito
                porque a forma de pagamento saiu errada na primeira vez. Você estorna o errado e o cofre volta a bater.
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="cofre-contado">Dinheiro contado no cofre</Label>
                <Input
                  id="cofre-contado"
                  inputMode="decimal"
                  placeholder="Ex.: 10.939,30"
                  value={cofreContado}
                  onChange={(event) => setCofreContado(event.target.value)}
                  className="w-40"
                />
              </div>
              <div className="rounded-lg border border-brand-oliva/20 bg-white/70 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Saldo do app</p>
                <p className="text-lg font-bold text-brand-tinta">{moneyFin(totals.saldo)}</p>
              </div>
              {diferencaCofre !== null ? (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2",
                    Math.abs(diferencaCofre) < 0.01
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Diferença</p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      Math.abs(diferencaCofre) < 0.01 ? "text-emerald-700" : "text-destructive",
                    )}
                  >
                    {Math.abs(diferencaCofre) < 0.01 ? "Bateu ✓" : moneyFin(diferencaCofre)}
                  </p>
                  {Math.abs(diferencaCofre) >= 0.01 ? (
                    <p className="text-[11px] text-muted-foreground">
                      {diferencaCofre > 0 ? "o app tem MAIS que o cofre" : "o cofre tem MAIS que o app"}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {suspects.length ? (
              <div className="rounded-lg border border-destructive/35 bg-destructive/5 p-3">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {suspects.length} ponto(s) para conferir — até {moneyFin(totalEmRisco)} podem estar sobrando no caixa
                </p>
                <ul className="mt-2 grid gap-2.5">
                  {suspects.map((suspect) => (
                    <li
                      key={`${suspect.motivo}-${suspect.itens[0].kind}-${suspect.itens[0].id}`}
                      className="rounded-md border border-brand-oliva/15 bg-white/70 p-2.5"
                    >
                      <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-brand-tinta">
                        {suspect.itens[0].quem}
                        <span className="rounded bg-brand-papel px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-oliva">
                          {motivoLabel[suspect.motivo]}
                        </span>
                        <span className="text-destructive">sobrando {moneyFin(suspect.valorEmRisco)}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">{suspect.descricao}</p>
                      <div className="mt-1.5 grid gap-1">
                        {suspect.itens.map((item) => (
                          <div key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="font-mono text-brand-oliva">{dataBR(item.data)}</span>
                            <span className="rounded bg-brand-papel px-1.5 py-0.5 font-semibold">
                              {item.kind === "MANUAL" ? "lançado à mão" : "lembrete"}
                            </span>
                            <span className="font-semibold text-brand-tinta">{moneyFin(item.valor)}</span>
                            <span className="text-muted-foreground">{item.detalhe}</span>
                            {item.lembreteApagado ? (
                              <span className="font-semibold text-destructive">lembrete apagado</span>
                            ) : item.lembreteStatus === "cancelado" ? (
                              <span className="font-semibold text-destructive">lembrete cancelado</span>
                            ) : null}
                            {!readOnly ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => tirarDoCofre(item)}
                                disabled={estornoMutation.isPending}
                              >
                                {item.kind === "MANUAL" ? "Excluir esta" : "Estornar este"}
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Estornar devolve o valor para a dívida do paciente (o lembrete reabre) e tira o dinheiro do caixa.
                  Nada é apagado sem você clicar, e fica registrado quem fez.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum lançamento suspeito no momento: nenhum valor repetido, nenhum recebimento pendurado em lembrete
                apagado ou cancelado.
              </p>
            )}
            {estornoFeedback ? <p className="text-sm font-semibold text-brand-musgo">{estornoFeedback}</p> : null}
          </CardContent>
        </Card>

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
                      {dataBR(entry.entryDate)}
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
