// EXTRATO DO BANCO × APP (10/08/2026) — a rede de segurança do processo.
//
// O Lucas arrasta o extrato do Itaú (o mesmo .xlsx que ele já baixa) e o app
// casa sozinho. Em vez de ele precisar "se atentar ao extrato", os problemas
// vêm até ele em quatro caixas. Tudo que a conciliação manual desta semana
// levou horas para achar aparece aqui em segundos.
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileUp, Landmark, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  listRemoteFinBankEntries,
  saveRemoteFinBankEntries,
  updateRemoteFinBankEntry,
} from "@/lib/remoteData";
import { moneyFin, monthKeyLabel } from "./financeiroData";
import { conciliarExtrato, leituraDaConciliacao, lerExtratoDeTexto, lerExtratoDeXlsx, type BankEntry } from "./extratoBanco";
import { useFinanceiro } from "./useFinanceiro";

const dataBr = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function FinanceiroExtratoPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const readOnly = !canEditModule(pessoa, "fin-extrato");
  const queryClient = useQueryClient();
  const hoje = todayISO();
  const [monthKey, setMonthKey] = useState(hoje.slice(0, 7));
  const financeiro = useFinanceiro(Number(monthKey.slice(0, 4)));
  const [feedback, setFeedback] = useState("");
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const entriesQuery = useQuery({
    queryKey: ["fin-bank-entries"],
    queryFn: listRemoteFinBankEntries,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const importar = useMutation({
    mutationFn: (entries: BankEntry[]) =>
      saveRemoteFinBankEntries(
        entries.map((entry) => ({
          clientRef: entry.clientRef,
          entryDate: entry.entryDate,
          description: entry.description,
          counterparty: entry.counterparty,
          document: entry.document,
          amount: entry.amount,
          balance: entry.balance,
          matchKind: null,
          matchRef: null,
          matchNote: null,
        })),
        pessoa?.id ?? null,
      ),
    onSuccess: (quantas) => {
      void queryClient.invalidateQueries({ queryKey: ["fin-bank-entries"] });
      setFeedback(`${quantas} lançamento(s) do extrato importados. O que já existia não duplicou.`);
    },
    onError: (error: Error) => setErro(`Não consegui salvar o extrato: ${error.message}`),
  });

  const entries: BankEntry[] = useMemo(
    () =>
      (entriesQuery.data ?? []).map((row) => ({
        clientRef: row.clientRef,
        entryDate: row.entryDate,
        description: row.description,
        counterparty: row.counterparty,
        document: row.document,
        amount: row.amount,
        balance: row.balance,
        matchKind: row.matchKind,
        matchRef: row.matchRef,
        matchNote: row.matchNote,
      })),
    [entriesQuery.data],
  );

  const periodo = useMemo(() => {
    const [ano, mes] = monthKey.split("-").map(Number);
    const ultimo = new Date(ano, mes, 0).getDate();
    return { start: `${monthKey}-01`, end: `${monthKey}-${String(ultimo).padStart(2, "0")}` };
  }, [monthKey]);

  const balde = useMemo(
    () => conciliarExtrato(entries, financeiro.sales, financeiro.expenses, financeiro.savingsMoves, periodo.start, periodo.end),
    [entries, financeiro.sales, financeiro.expenses, financeiro.savingsMoves, periodo],
  );

  async function receberArquivo(arquivo: File) {
    setErro("");
    setFeedback("");
    setLendo(true);
    try {
      const lidas = arquivo.name.toLowerCase().endsWith(".xlsx")
        ? await lerExtratoDeXlsx(await arquivo.arrayBuffer())
        : lerExtratoDeTexto(await arquivo.text());
      if (!lidas.length) {
        setErro("Não achei lançamento nesse arquivo. Ele é o extrato de lançamentos do Itaú (.xlsx ou .csv)?");
        return;
      }
      if (!useRemote) {
        setFeedback(`Li ${lidas.length} lançamento(s) — mas neste modo (sem login) nada é salvo.`);
        return;
      }
      await importar.mutateAsync(lidas);
    } catch (falha) {
      setErro(`Não consegui ler o arquivo: ${(falha as Error).message}`);
    } finally {
      setLendo(false);
    }
  }

  async function ignorar(entry: BankEntry) {
    if (readOnly || !useRemote) return;
    await updateRemoteFinBankEntry(entry.clientRef, { matchKind: "IGNORADO", matchNote: "Marcado como não sendo do Instituto." }, pessoa?.id ?? null);
    void queryClient.invalidateQueries({ queryKey: ["fin-bank-entries"] });
  }

  const meses = useMemo(() => {
    const set = new Set<string>([hoje.slice(0, 7)]);
    for (const entry of entries) set.add(entry.entryDate.slice(0, 7));
    return [...set].sort().reverse();
  }, [entries, hoje]);

  const problemas =
    balde.entrouSemRegistro.length + balde.saiuSemRegistro.length + balde.comandaSemDinheiro.length + balde.contaSemSaida.length;

  const caixas = [
    {
      chave: "entrou",
      titulo: "Entrou no banco e não tem comanda",
      explica: "Dinheiro que caiu na conta sem registro no app. Alguém atendeu e não lançou.",
      cor: "border-red-300 bg-red-50/70",
      itens: balde.entrouSemRegistro.map((entry) => ({
        id: entry.clientRef,
        dia: entry.entryDate,
        valor: entry.amount,
        texto: entry.counterparty || entry.description,
        detalhe: entry.description,
        entry,
      })),
    },
    {
      chave: "saiu",
      titulo: "Saiu do banco e não tem conta lançada",
      explica: "Pagamento que aconteceu e o Contas a Pagar não sabe. Foi assim que 47 mil ficaram de fora em agosto.",
      cor: "border-red-300 bg-red-50/70",
      itens: balde.saiuSemRegistro.map((entry) => ({
        id: entry.clientRef,
        dia: entry.entryDate,
        valor: -entry.amount,
        texto: entry.counterparty || entry.description,
        detalhe: entry.description,
        entry,
      })),
    },
    {
      chave: "comanda",
      titulo: "Comanda no app e o dinheiro não apareceu",
      explica: "Provável forma de pagamento errada — ou o PIX não caiu mesmo.",
      cor: "border-amber-300 bg-amber-50/70",
      itens: balde.comandaSemDinheiro.map((item) => ({
        id: `${item.sale.id}-${item.valor}`,
        dia: item.sale.saleDate,
        valor: item.valor,
        texto: item.sale.patientName,
        detalhe: `lançado como ${item.forma}`,
        entry: null,
      })),
    },
    {
      chave: "conta",
      titulo: "Marcada como paga e não saiu do banco",
      explica: "Ou o pagamento não aconteceu, ou saiu por outra conta. Foi o caso da provisão de impostos.",
      cor: "border-amber-300 bg-amber-50/70",
      itens: balde.contaSemSaida.map((expense) => ({
        id: expense.id,
        dia: expense.paidAt ?? "",
        valor: expense.amount,
        texto: expense.description,
        detalhe: expense.supplier || "",
        entry: null,
      })),
    },
  ];

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Extrato do banco" module="fin-extrato">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Conferência automática</Badge>
            <Badge variant="muted">{financeiro.syncMode}</Badge>
          </div>
          <h1 className="mt-3 flex flex-wrap items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
            <Landmark className="h-7 w-7" aria-hidden="true" />
            Extrato do banco × app
            <InfoTip title="Para que serve">
              O extrato é a única fonte que não mente: se o dinheiro entrou, está lá. Arraste o arquivo que você já baixa
              do Itaú e o app casa sozinho com as comandas e as contas. O que sobrar aparece nas caixas abaixo — é só
              isso que precisa da sua atenção. Importar o mesmo arquivo duas vezes não duplica nada.
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Em vez de você precisar olhar o extrato linha por linha, o app olha — e te mostra só o que não fecha.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="mes-extrato">Mês</Label>
              <select
                id="mes-extrato"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
                className="mt-1 block rounded-md border border-brand-oliva/25 bg-white/80 px-3 py-2 text-sm font-semibold text-brand-tinta"
              >
                {meses.map((mes) => (
                  <option key={mes} value={mes}>
                    {monthKeyLabel(mes)}
                  </option>
                ))}
              </select>
            </div>
            {!readOnly ? (
              <>
                <input
                  ref={inputArquivo}
                  type="file"
                  accept=".xlsx,.csv,.txt"
                  className="hidden"
                  onChange={(event) => {
                    const arquivo = event.target.files?.[0];
                    if (arquivo) void receberArquivo(arquivo);
                    event.target.value = "";
                  }}
                />
                <Button type="button" className="gap-2" disabled={lendo || importar.isPending} onClick={() => inputArquivo.current?.click()}>
                  {lendo || importar.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileUp className="h-4 w-4" aria-hidden="true" />
                  )}
                  Importar extrato (.xlsx do Itaú)
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["fin-bank-entries"] })}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar
            </Button>
          </div>
          {feedback ? <p className="mt-3 text-sm font-semibold text-brand-musgo">{feedback}</p> : null}
          {erro ? <p className="mt-3 text-sm font-semibold text-red-700">{erro}</p> : null}
        </motion.section>

        {/* Placar */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { rotulo: "Entrou no banco", valor: moneyFin(balde.totais.entrouBanco), dica: `${monthKeyLabel(monthKey)}` },
            { rotulo: "Saiu do banco", valor: moneyFin(balde.totais.saiuBanco), dica: "pagamentos do mês" },
            { rotulo: "Faturado no app", valor: moneyFin(balde.totais.faturadoApp), dica: "comandas do mês" },
            {
              rotulo: "Pontos para olhar",
              valor: String(problemas),
              dica: problemas ? "abaixo, um por caixa" : "nada pendente 🎉",
              alerta: problemas > 0,
            },
          ].map((card) => (
            <div
              key={card.rotulo}
              className={cn(
                "rounded-xl border px-5 py-4",
                card.alerta ? "border-red-300 bg-red-50/70" : "border-brand-oliva/20 bg-white/70",
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{card.rotulo}</p>
              <p className={cn("mt-1 text-2xl font-bold", card.alerta ? "text-red-800" : "text-brand-musgo")}>{card.valor}</p>
              <p className="text-[11px] text-muted-foreground">{card.dica}</p>
            </div>
          ))}
        </div>

        <Card className="border-brand-oliva/20 bg-white/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              {problemas ? (
                <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
              )}
              {leituraDaConciliacao(balde)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="text-muted-foreground">
              Casaram por valor e data: <strong>{balde.casadas.length}</strong> · com diferença de centavo/real:{" "}
              <strong>{balde.casadasComDiferenca.length}</strong> · conta paga em 2 lançamentos:{" "}
              <strong>{balde.casadasAgrupadas.length}</strong>
            </p>
            {balde.casadasComDiferenca.map((item) => (
              <div key={item.entry.clientRef} className="rounded-md border border-brand-dourado/40 bg-brand-creme/40 px-3 py-1.5">
                {dataBr(item.entry.entryDate)} · {moneyFin(Math.abs(item.entry.amount))} casou com <strong>{item.comQue}</strong> —
                diferença de {moneyFin(item.diferenca)}
              </div>
            ))}
            {balde.casadasAgrupadas.map((item) => (
              <div key={item.comQue + item.total} className="rounded-md border border-brand-dourado/40 bg-brand-creme/40 px-3 py-1.5">
                <strong>{item.comQue}</strong> foi pago em {item.entries.length} lançamentos:{" "}
                {item.entries.map((entry) => moneyFin(Math.abs(entry.amount))).join(" + ")} = {moneyFin(item.total)}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* MAQUININHA (regra do Lucas): toda TRANSFERÊNCIA AUTOM. RECEBIDA é o
            crédito da véspera caindo, líquido da taxa — tem que bater com os
            cartões das comandas. */}
        <Card
          className={cn(
            "shadow-none",
            balde.maquininha.situacao === "OK"
              ? "border-emerald-200 bg-emerald-50/50"
              : balde.maquininha.situacao === "SEM_DADOS"
                ? "border-brand-oliva/20 bg-white/60"
                : "border-amber-300 bg-amber-50/70",
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Maquininha: adiantamentos × cartão das comandas
              <InfoTip title="Como funciona">
                O crédito de um dia cai no dia seguinte como "TRANSFERÊNCIA AUTOM. RECEBIDA", já com a taxa descontada.
                Então a soma dessas transferências tem que bater com os cartões das comandas da véspera, menos a taxa
                (~8%). Se cair mais do que as comandas dizem, tem venda no crédito sem comanda; se a diferença passar
                muito de 8%, tem crédito que não caiu ou comanda com forma de pagamento errada.
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>
                Transferências recebidas: <strong className="tabular-nums">{moneyFin(balde.maquininha.transferencias)}</strong>
              </span>
              <span>
                Cartão das comandas (véspera): <strong className="tabular-nums">{moneyFin(balde.maquininha.cartaoComandas)}</strong>
              </span>
              {balde.maquininha.taxaImplicita !== null ? (
                <span>
                  Taxa implícita: <strong className="tabular-nums">{String(balde.maquininha.taxaImplicita).replace(".", ",")}%</strong>
                </span>
              ) : null}
            </div>
            <p
              className={cn(
                "font-semibold",
                balde.maquininha.situacao === "OK"
                  ? "text-emerald-800"
                  : balde.maquininha.situacao === "SEM_DADOS"
                    ? "text-muted-foreground"
                    : "text-amber-900",
              )}
            >
              {balde.maquininha.leitura}
            </p>

            {/* DIA POR DIA (18/08/2026). No total do mês a taxa de um dia
                compensa a sobra de outro e o furo desaparece: foi assim que
                R$ 13.808 fechados no Kanban e nunca lançados ficaram escondidos.
                Aqui cada adiantamento é confrontado só com o cartão do dia útil
                que o originou. */}
            {balde.maquininha.porDia.length ? (
              <div className="mt-1 overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-brand-oliva/25 text-left text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Caiu no banco</th>
                      <th className="py-1 pr-3 font-medium">Cartão do dia</th>
                      <th className="py-1 pr-3 text-right font-medium">Adiantamento</th>
                      <th className="py-1 pr-3 text-right font-medium">Comandas</th>
                      <th className="py-1 pr-3 text-right font-medium">Taxa</th>
                      <th className="py-1 font-medium">Leitura</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {balde.maquininha.porDia.map((dia) => (
                      <tr
                        key={dia.diaTransferencia}
                        className={cn(
                          "border-b border-brand-oliva/10 last:border-0",
                          dia.situacao === "SOBROU_NO_BANCO" ? "bg-rose-50/80" : dia.situacao === "FALTOU_CAIR" ? "bg-amber-50/70" : "",
                        )}
                      >
                        <td className="py-1 pr-3">{dataBr(dia.diaTransferencia)}</td>
                        <td className="py-1 pr-3 text-muted-foreground">{dataBr(dia.diaCartao)}</td>
                        <td className="py-1 pr-3 text-right">{moneyFin(dia.transferencia)}</td>
                        <td className="py-1 pr-3 text-right">{moneyFin(dia.cartao)}</td>
                        <td className="py-1 pr-3 text-right">
                          {dia.taxaImplicita === null ? "—" : `${String(dia.taxaImplicita).replace(".", ",")}%`}
                        </td>
                        <td className={cn("py-1", dia.situacao === "SOBROU_NO_BANCO" ? "font-semibold text-rose-800" : dia.situacao === "FALTOU_CAIR" ? "text-amber-900" : "text-emerald-800")}>
                          {dia.situacao === "OK"
                            ? "bate"
                            : dia.situacao === "SOBROU_NO_BANCO"
                              ? `sobrou ${moneyFin(dia.sobra)} — falta comanda de cartão`
                              : dia.cartao > 0 && dia.transferencia === 0
                                ? "o dinheiro do cartão não caiu"
                                : "caiu menos do que a comanda diz"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* As quatro caixas */}
        {caixas.map((caixa) => (
          <Card key={caixa.chave} className={cn("shadow-none", caixa.itens.length ? caixa.cor : "border-brand-oliva/20 bg-white/60")}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {caixa.titulo}
                <Badge variant={caixa.itens.length ? "gold" : "muted"}>{caixa.itens.length}</Badge>
              </CardTitle>
              <p className="text-xs leading-5 text-muted-foreground">{caixa.explica}</p>
            </CardHeader>
            <CardContent>
              {!caixa.itens.length ? (
                <p className="text-sm text-muted-foreground">Nada aqui — está tudo conferido. ✓</p>
              ) : (
                <div className="grid gap-1.5">
                  {caixa.itens.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-oliva/16 bg-white/80 px-3 py-2 text-sm"
                    >
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="font-semibold tabular-nums text-brand-tinta">{dataBr(item.dia)}</span>
                        <span className="font-bold tabular-nums text-brand-musgo">{moneyFin(item.valor)}</span>
                        <span className="text-brand-tinta">{item.texto}</span>
                        {item.detalhe && item.detalhe !== item.texto ? (
                          <span className="text-xs text-muted-foreground">{item.detalhe}</span>
                        ) : null}
                      </span>
                      {item.entry && !readOnly ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => void ignorar(item.entry!)}>
                          Não é do Instituto
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </AccessGate>
  );
}
