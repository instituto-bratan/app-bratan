// CREDIÁRIO — Financeiro › Dia › Crediário (o caixa do dinheiro vivo).
//
// REDESENHO PAPEL & MUSGO (08/10/2026): UM cabeçalho com a frase que explica o
// número ("R$ 1.240,00 em dinheiro devem estar no cofre agora"), o cofre num
// bloco SABER (o saldo grande em Fraunces e o razão do mês), o lançamento e as
// movimentações em FOLHAS (decidir), e embaixo a conferência do cofre e o
// "somar no lucro". Nenhuma regra mudou: os mesmos lançamentos, o mesmo estorno,
// a mesma trava do lucro (valor ≤ o que entrou em dinheiro no mês). Mudou a forma.
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, Plus, ScanLine, Sparkles, Trash2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
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
import {
  createFinId,
  crediarioProfitOfMonth,
  crediarioFaturamentoDoMes,
  crediarioProfitTotal,
  moneyFin,
} from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";
import { confirmar } from "@/components/ui/avisos";
import {
  AJUDA,
  AvisoDaTela,
  CABECA_DA_FOLHA,
  CAMPO,
  Campo,
  Etiqueta,
  Leitura,
  NumeroEmReais,
  RUBRICA,
  TituloDoBloco,
  Vazio,
  diaCurto,
  nomeDoMes,
  nomeDoMesMaiusculo,
  quantos,
} from "./pecasDiaPagar";

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
  // Somar o caixa do crediário no lucro de um mês — só quando o gestor aperta.
  const [lucroMes, setLucroMes] = useState(() => todayISO().slice(0, 7));
  const [lucroValor, setLucroValor] = useState("");
  const [lucroNota, setLucroNota] = useState("");
  const [lucroFeedback, setLucroFeedback] = useState("");
  const [lucroEditando, setLucroEditando] = useState(false);
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

  // ---- Crediário no lucro do mês -------------------------------------------
  // O que vai para o lucro é o que ENTROU em dinheiro no mês (faturamento do
  // crediário), um mês por vez — o mesmo dinheiro nunca conta em dois meses.
  const financeiro = useFinanceiro(Number(lucroMes.slice(0, 4)));
  const jaNoLucroDoMes = crediarioProfitOfMonth(financeiro.crediarioProfits, lucroMes);
  const jaNoLucroTotal = crediarioProfitTotal(financeiro.crediarioProfits);
  // A base é o FATURAMENTO do mês (o que entrou em dinheiro nele), não o saldo
  // acumulado do caixa (Lucas, 02/09/2026).
  const sugestaoLucro = crediarioFaturamentoDoMes(allEntries, lucroMes);
  const mesIncluido = jaNoLucroDoMes > 0;
  const registroDoMes = financeiro.crediarioProfits.find((item) => item.monthRef === lucroMes);
  const suspeitosEmRisco = useMemo(() => suspects.reduce((acc, item) => acc + item.valorEmRisco, 0), [suspects]);

  function mesBR(month: string) {
    return new Date(`${month}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }

  function abrirLucro() {
    setLucroValor(
      (mesIncluido ? jaNoLucroDoMes : sugestaoLucro).toFixed(2).replace(".", ","),
    );
    setLucroNota(registroDoMes?.note ?? "");
    setLucroFeedback("");
    setLucroEditando(true);
  }

  function confirmarLucro() {
    setLucroFeedback("");
    if (readOnly) return setLucroFeedback("Você não tem permissão para mexer no lucro.");
    const valor = parseMoneyBR(lucroValor);
    if (!Number.isFinite(valor) || valor <= 0) return setLucroFeedback("Informe o valor — digite como 10.939,30.");
    if (valor > sugestaoLucro + 0.01) {
      return setLucroFeedback(
        `Em ${mesBR(lucroMes)} entraram ${moneyFin(sugestaoLucro)} em dinheiro. Não dá para somar ${moneyFin(valor)} no lucro — confira o valor ou os lançamentos do mês.`,
      );
    }
    financeiro.setCrediarioNoLucro(lucroMes, valor, lucroNota.trim());
    setLucroEditando(false);
    setLucroFeedback(
      `${moneyFin(valor)} somados ao faturamento e ao lucro de ${mesBR(lucroMes)}. O dinheiro continua no cofre — a P12, a meta e os Relatórios já refletem.`,
    );
  }

  async function removerLucro() {
    if (readOnly) return setLucroFeedback("Você não tem permissão para mexer no lucro.");
    if (!(await confirmar(`Tirar ${moneyFin(jaNoLucroDoMes)} do lucro de ${mesBR(lucroMes)}?`, { confirmar: "Tirar do lucro" }))) return;
    financeiro.removeCrediarioNoLucro(lucroMes);
    setLucroEditando(false);
    setLucroFeedback(`Removido do lucro de ${mesBR(lucroMes)}. O caixa do crediário voltou a ficar fora do resultado.`);
  }

  async function tirarDoCofre(item: CofreItem) {
    setEstornoFeedback("");
    if (readOnly) return setEstornoFeedback("Você não tem permissão para mexer nos lançamentos do caixa.");
    const dia = dataBR(item.data);
    if (item.kind === "MANUAL") {
      if (!(await confirmar(`Excluir a entrada "${item.quem}" de ${moneyFin(item.valor)} (${dia}) do caixa?`, { destrutivo: true, confirmar: "Excluir" }))) return;
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
      !(await confirmar(`Estornar ${moneyFin(item.valor)} de ${item.quem} (recebido em ${dia})?`, {
        corpo: "O valor volta a ficar em aberto no lembrete e sai do caixa do crediário. Fica registrado quem estornou.",
        destrutivo: true,
        confirmar: "Estornar",
      }))
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

  async function removeEntry(entry: FinCashEntry & { fromLembrete?: boolean }) {
    if (entry.fromLembrete) return;
    if (!(await confirmar(`Excluir "${entry.description}" (${moneyFin(entry.amount)}) do caixa?`, { destrutivo: true, confirmar: "Excluir" }))) return;
    if (useRemote) {
      deleteRemoteFinCashEntry(entry.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["fin-cash-entries"] }))
        .catch(() => setFeedback("Não foi possível excluir agora. Tente de novo."));
    } else {
      persistLocal(localEntries.filter((existing) => existing.id !== entry.id));
    }
  }

  // ---- Papel & Musgo (08/10/2026): a frase do cabeçalho, derivada dos mesmos totais ----
  const nomeMes = nomeDoMes(monthKey || todayISO().slice(0, 7));
  const fraseDoTopo =
    totals.saldo < 0 ? (
      <>
        <span className="alerta">O caixa está negativo: {moneyFin(totals.saldo)}.</span> Saiu mais dinheiro do que entrou — confira os lançamentos e
        o cofre.
      </>
    ) : (
      <>
        O cofre deve ter <strong>{moneyFin(totals.saldo)}</strong> em dinheiro agora. Em {nomeMes}, entraram {moneyFin(totals.entradasMes)} e saíram{" "}
        {moneyFin(totals.saidasMes)}.
      </>
    );
  const diferencaZerada = diferencaCofre !== null && Math.abs(diferencaCofre) < 0.01;

  return (
    <AccessGate allowed={canLembretesPagamento} label="Financeiro · Crediário" module="fin-crediario">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Financeiro · Dia"
          titulo="Crediário"
          frase={fraseDoTopo}
          acoes={
            <label className="grid gap-1">
              <span className="sr-only">Mês do caixa</span>
              <input
                type="month"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
                onBlur={() => {
                  if (!monthKey) setMonthKey(todayISO().slice(0, 7));
                }}
                className={cn(CAMPO, "w-[176px]")}
                aria-label="Mês do caixa"
              />
            </label>
          }
        />

        {feedback ? (
          <AvisoDaTela tom={/^(Não|Descreva)/.test(feedback) ? "atencao" : "ok"} onFechar={() => setFeedback("")}>
            {feedback}
          </AvisoDaTela>
        ) : null}

        <div className="grid items-start gap-8 max-md:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          {/* SABER: o cofre. No celular vem primeiro (o número antes da lista). */}
          <BlocoSaber as="aside" aria-labelledby="cofre-titulo" className="grid min-w-0 gap-4 max-xl:order-first xl:sticky xl:top-24 xl:col-start-2 xl:row-start-1">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="cofre-titulo" className={RUBRICA}>
                Dinheiro no cofre
              </h2>
              <InfoTip title="O caixa do dinheiro vivo">
                Livro-caixa exclusivo do dinheiro do crediário: registre aqui o que entra e o que sai. Os recebimentos em dinheiro marcados nos
                Lembretes entram sozinhos. Nada disto se mistura com a P12 nem com as comandas — é a visão limpa do caixa físico.
              </InfoTip>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <NumeroEmReais valor={totals.saldo} tamanho="grande" className={totals.saldo < 0 ? "text-erro" : undefined} />
              <span className="text-[13px] font-medium leading-5 text-tinta-2">
                saldo de hoje,
                <br />
                somando todos os meses
              </span>
            </div>
            <p className="text-sm font-medium leading-5 text-tinta-2 [text-wrap:pretty]">Fica fora da P12: só entra no lucro quando você soma o mês (abaixo).</p>
            <dl className="border-t border-fio-2">
              <div className="flex items-center justify-between gap-3 border-b border-fio py-3">
                <dt className="text-sm font-medium text-tinta-2">Entradas em {nomeMes}</dt>
                <dd className="whitespace-nowrap text-base font-bold tabular-nums text-tinta">{moneyFin(totals.entradasMes)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-fio py-3">
                <dt className="text-sm font-medium text-tinta-2">Saídas em {nomeMes}</dt>
                <dd className="whitespace-nowrap text-base font-bold tabular-nums text-tinta">{moneyFin(totals.saidasMes)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-fio py-3">
                <dt className="text-sm font-medium text-tinta-2">Já no lucro (todos os meses)</dt>
                <dd className="whitespace-nowrap text-base font-bold tabular-nums text-tinta">{moneyFin(jaNoLucroTotal)}</dd>
              </div>
            </dl>
          </BlocoSaber>

          <div className="grid min-w-0 gap-8 max-md:gap-6 xl:col-start-1 xl:row-start-1">
            {/* DECIDIR: o lançamento do dia. */}
            <BlocoFolha as="section" aria-labelledby="novo-lancamento-titulo">
              <div className={CABECA_DA_FOLHA}>
                <TituloDoBloco id="novo-lancamento-titulo" icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
                  Novo lançamento
                </TituloDoBloco>
              </div>
              <form className="grid gap-4 p-6 max-md:p-4 sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_minmax(0,9rem)]" onSubmit={handleSubmit}>
                <div className="grid min-w-0 content-start gap-2 sm:col-span-3">
                  <span className="text-[13px] font-bold leading-5 text-tinta" id="crediario-tipo">
                    Tipo
                  </span>
                  <div className="flex gap-2 sm:w-[16rem]" role="group" aria-labelledby="crediario-tipo">
                    {(["ENTRADA", "SAIDA"] as const).map((option) => (
                      <Leitura key={option} ativo={direction === option} onClick={() => setDirection(option)} className="h-10 flex-1 justify-center text-sm">
                        {option === "ENTRADA" ? "Entrada" : "Saída"}
                      </Leitura>
                    ))}
                  </div>
                </div>
                <Campo rotulo="Data" htmlFor="crediario-data">
                  <input id="crediario-data" type="date" className={CAMPO} value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
                </Campo>
                <Campo rotulo="Descrição" htmlFor="crediario-descricao">
                  <input
                    id="crediario-descricao"
                    className={CAMPO}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Ex.: recebido de Fulano · sangria para banco · troco"
                  />
                </Campo>
                <Campo rotulo="Valor (R$)" htmlFor="crediario-valor">
                  <input
                    id="crediario-valor"
                    className={cn(CAMPO, "text-right tabular-nums")}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="500,00"
                    inputMode="decimal"
                  />
                </Campo>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
                  <Botao type="submit" variante="primario" icone={<CircleDollarSign className="h-4 w-4" aria-hidden="true" />}>
                    Lançar
                  </Botao>
                  <p className={AJUDA}>Entrada soma no cofre; saída (sangria, troco, depósito no banco) tira.</p>
                </div>
              </form>
            </BlocoFolha>

            {/* As movimentações do mês: data · descrição · valor com sinal. */}
            <BlocoFolha as="section" aria-labelledby="movimentacoes-titulo" className="min-w-0 overflow-hidden">
              <div className={CABECA_DA_FOLHA}>
                <TituloDoBloco id="movimentacoes-titulo" detalhe={quantos(monthEntries.length, "movimentação", "movimentações")}>
                  Movimentações de {nomeMes}
                </TituloDoBloco>
              </div>
              {monthEntries.length ? (
                <ul>
                  {monthEntries.map((entry) => {
                    const automatico = Boolean((entry as { fromLembrete?: boolean }).fromLembrete);
                    return (
                      <li
                        key={entry.id}
                        className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-4 border-t border-fio px-6 py-3 first:border-t-0 transition-colors duration-150 hover:bg-saber/70 max-md:px-4"
                      >
                        <span className="text-[13px] font-semibold tabular-nums text-tinta-2">{diaCurto(entry.entryDate)}</span>
                        <div className="grid min-w-0 gap-1">
                          <p className="text-sm font-bold leading-5 text-tinta [overflow-wrap:anywhere]">{entry.description}</p>
                          {automatico ? <Etiqueta>automático (Lembretes)</Etiqueta> : null}
                        </div>
                        <span className="flex items-center gap-1">
                          <span className={cn("whitespace-nowrap text-sm font-bold tabular-nums", entry.direction === "ENTRADA" ? "text-ok" : "text-tinta")}>
                            {entry.direction === "ENTRADA" ? "+" : "−"} {moneyFin(entry.amount)}
                          </span>
                          {automatico ? (
                            <span className="h-8 w-8" aria-hidden="true" />
                          ) : (
                            <button
                              type="button"
                              aria-label={`Excluir ${entry.description}`}
                              title="Excluir"
                              onClick={() => removeEntry(entry)}
                              className="grid h-8 w-8 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-erro-claro hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Vazio titulo={`Nenhuma movimentação em ${nomeMes}`}>O que entrar ou sair do cofre aparece aqui, com a data. Recebimento em dinheiro dos Lembretes entra sozinho.</Vazio>
              )}
            </BlocoFolha>
          </div>
        </div>

        <div className="grid items-start gap-8 max-md:gap-6 lg:grid-cols-2">
          {/* CONFERÊNCIA DO COFRE — informe o dinheiro contado e o app aponta a
              diferença e os lançamentos suspeitos (28/07). */}
          <BlocoFolha as="section" aria-labelledby="conferir-cofre-titulo" className="min-w-0">
            <div className={CABECA_DA_FOLHA}>
              <TituloDoBloco id="conferir-cofre-titulo" icone={<ScanLine className="h-4 w-4" aria-hidden="true" />}>
                Conferir o cofre
              </TituloDoBloco>
              <InfoTip title="Para que serve">
                Conte o dinheiro do cofre e digite aqui. Se der diferença, o app mostra os lançamentos com cara de duplicata (mesmo paciente e mesmo
                valor lançados mais de uma vez) — geralmente é recebimento refeito porque a forma de pagamento saiu errada na primeira vez. Você estorna
                o errado e o cofre volta a bater.
              </InfoTip>
            </div>
            <div className="grid gap-4 p-6 max-md:p-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-end">
                <Campo rotulo="Dinheiro contado no cofre" htmlFor="cofre-contado">
                  <input
                    id="cofre-contado"
                    inputMode="decimal"
                    placeholder="Ex.: 10.939,30"
                    value={cofreContado}
                    onChange={(event) => setCofreContado(event.target.value)}
                    className={cn(CAMPO, "text-right tabular-nums")}
                  />
                </Campo>
                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-controle bg-saber px-3 py-2">
                    <dt className={RUBRICA}>Saldo do app</dt>
                    <dd className="mt-1 whitespace-nowrap text-base font-bold tabular-nums text-tinta">{moneyFin(totals.saldo)}</dd>
                  </div>
                  {diferencaCofre !== null ? (
                    <div className={cn("rounded-controle px-3 py-2", diferencaZerada ? "bg-ok-claro" : "bg-atencao-claro")}>
                      <dt className={RUBRICA}>Diferença</dt>
                      <dd className={cn("mt-1 whitespace-nowrap text-base font-bold tabular-nums", diferencaZerada ? "text-ok" : "text-atencao")}>
                        {diferencaZerada ? "Bateu ✓" : moneyFin(diferencaCofre)}
                      </dd>
                      {!diferencaZerada ? (
                        <dd className="text-xs font-semibold leading-4 text-tinta-2">
                          {diferencaCofre > 0 ? "o app tem MAIS que o cofre" : "o cofre tem MAIS que o app"}
                        </dd>
                      ) : null}
                    </div>
                  ) : null}
                </dl>
              </div>

              {suspects.length ? (
                <div className="grid gap-3">
                  <AvisoDaTela tom="atencao">
                    {quantos(suspects.length, "ponto")} para conferir — até {moneyFin(totalEmRisco)} podem estar sobrando no caixa.
                  </AvisoDaTela>
                  <ul className="grid gap-3">
                    {suspects.map((suspect) => (
                      <li key={`${suspect.motivo}-${suspect.itens[0].kind}-${suspect.itens[0].id}`} className="rounded-controle border border-fio p-3">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-tinta">
                          {suspect.itens[0].quem}
                          <Etiqueta tom="atencao">{motivoLabel[suspect.motivo]}</Etiqueta>
                          <span className="tabular-nums text-atencao">sobrando {moneyFin(suspect.valorEmRisco)}</span>
                        </p>
                        <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{suspect.descricao}</p>
                        <div className="mt-2 grid gap-2">
                          {suspect.itens.map((item) => (
                            <div key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-2 text-[13px]">
                              <span className="font-semibold tabular-nums text-tinta-2">{dataBR(item.data)}</span>
                              <Etiqueta>{item.kind === "MANUAL" ? "lançado à mão" : "lembrete"}</Etiqueta>
                              <span className="font-bold tabular-nums text-tinta">{moneyFin(item.valor)}</span>
                              <span className="font-medium text-tinta-2">{item.detalhe}</span>
                              {item.lembreteApagado ? (
                                <span className="font-bold text-erro">lembrete apagado</span>
                              ) : item.lembreteStatus === "cancelado" ? (
                                <span className="font-bold text-erro">lembrete cancelado</span>
                              ) : null}
                              {!readOnly ? (
                                <Botao variante="perigo" tamanho="pq" className="ml-auto" onClick={() => tirarDoCofre(item)} disabled={estornoMutation.isPending}>
                                  {item.kind === "MANUAL" ? "Excluir esta" : "Estornar este"}
                                </Botao>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className={AJUDA}>
                    Estornar devolve o valor para a dívida do paciente (o lembrete reabre) e tira o dinheiro do caixa. Nada é apagado sem você clicar, e
                    fica registrado quem fez.
                  </p>
                </div>
              ) : (
                <p className={AJUDA}>
                  Nenhum lançamento suspeito no momento: nenhum valor repetido, nenhum recebimento pendurado em lembrete apagado ou cancelado.
                </p>
              )}
              {estornoFeedback ? <AvisoDaTela tom={/^(Não|O estorno|Você)/.test(estornoFeedback) ? "atencao" : "ok"}>{estornoFeedback}</AvisoDaTela> : null}
            </div>
          </BlocoFolha>

          {/* CREDIÁRIO NO LUCRO (31/07/2026, pedido do Lucas): botão manual, por mês.
              Nunca automático — o caixa do crediário segue fora da P12 por padrão. */}
          <BlocoFolha as="section" aria-labelledby="lucro-crediario-titulo" className="min-w-0">
            <div className={CABECA_DA_FOLHA}>
              <TituloDoBloco id="lucro-crediario-titulo" icone={<Sparkles className="h-4 w-4" aria-hidden="true" />}>
                Somar o crediário do mês no lucro
              </TituloDoBloco>
              <InfoTip title="Quando usar e qual valor">
                Por padrão o dinheiro do crediário fica FORA do resultado — é caixa físico, separado da P12. No fechamento, escolha o mês e aperte o
                botão: o valor SOMA NO FATURAMENTO do mês, puxa o % da meta e entra no lucro. A base é o <strong>faturamento do crediário no mês</strong>{" "}
                — tudo que entrou em dinheiro nele (caixa e lembretes) —, e não o saldo do caixa, que é acumulado de vários meses e já descontou o que
                saiu. O dinheiro continua no cofre — muda o resultado, não o saldo.
              </InfoTip>
            </div>
            <div className="grid gap-4 p-6 max-md:p-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-end">
                <Campo rotulo="Mês do lucro" htmlFor="lucro-mes">
                  <input
                    id="lucro-mes"
                    type="month"
                    value={lucroMes}
                    onChange={(event) => {
                      setLucroMes(event.target.value);
                      setLucroEditando(false);
                      setLucroFeedback("");
                    }}
                    className={CAMPO}
                  />
                </Campo>
                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-controle bg-saber px-3 py-2">
                    <dt className={RUBRICA}>Entrou em dinheiro</dt>
                    <dd className="mt-1 whitespace-nowrap text-base font-bold tabular-nums text-tinta">{moneyFin(sugestaoLucro)}</dd>
                  </div>
                  <div className={cn("rounded-controle px-3 py-2", mesIncluido ? "bg-ok-claro" : "bg-saber")}>
                    <dt className={RUBRICA}>No lucro de {nomeDoMes(lucroMes)}</dt>
                    <dd className={cn("mt-1 whitespace-nowrap text-base font-bold tabular-nums", mesIncluido ? "text-ok" : "text-tinta-2")}>
                      {mesIncluido ? moneyFin(jaNoLucroDoMes) : "ainda não"}
                    </dd>
                  </div>
                </dl>
              </div>

              {mesIncluido && !lucroEditando ? (
                <div className="grid gap-2 rounded-controle bg-ok-claro p-4">
                  <p className="text-sm font-bold text-tinta">
                    {nomeDoMesMaiusculo(lucroMes)} de {lucroMes.slice(0, 4)} já está com {moneyFin(jaNoLucroDoMes)} do crediário somados ao lucro.
                  </p>
                  {registroDoMes?.note ? <p className="text-[13px] font-medium text-tinta-2">Observação: {registroDoMes.note}</p> : null}
                  {registroDoMes?.includedAt ? (
                    <p className="text-xs font-medium text-tinta-2">Marcado em {dataBR(registroDoMes.includedAt.slice(0, 10))}.</p>
                  ) : null}
                  {readOnly ? null : (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Botao variante="secundario" tamanho="pq" onClick={abrirLucro}>
                        Corrigir o valor
                      </Botao>
                      <Botao variante="perigo" tamanho="pq" className="ml-auto" onClick={removerLucro}>
                        Tirar do lucro
                      </Botao>
                    </div>
                  )}
                </div>
              ) : null}

              {!mesIncluido && !lucroEditando ? (
                <div className="grid gap-3">
                  <p className="text-sm font-medium leading-[22px] text-tinta-2 [text-wrap:pretty]">
                    {sugestaoLucro > 0 ? (
                      <>
                        Em {mesBR(lucroMes)} entraram <strong className="font-bold text-tinta">{moneyFin(sugestaoLucro)}</strong> em dinheiro (caixa do
                        crediário e recebimentos de lembrete). Esse é o faturamento do crediário do mês — é ele que vai para o lucro, não o saldo do caixa (
                        {moneyFin(totals.saldo)}), que é acumulado de vários meses.
                      </>
                    ) : (
                      <>Nenhuma entrada de dinheiro registrada em {mesBR(lucroMes)} — não há faturamento do crediário para somar.</>
                    )}
                  </p>
                  {readOnly || sugestaoLucro <= 0 ? null : (
                    <div>
                      {/* No celular o rótulo (com o valor e o mês) quebra em duas linhas em vez de sair do botão (08/10/2026). */}
                      <Botao
                        variante="primario"
                        icone={<Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        onClick={abrirLucro}
                        className="h-auto min-h-10 whitespace-normal py-2.5 text-left leading-5"
                      >
                        <span className="tabular-nums">
                          Somar {moneyFin(sugestaoLucro)} no lucro de {mesBR(lucroMes)}
                        </span>
                      </Botao>
                    </div>
                  )}
                </div>
              ) : null}

              {lucroEditando ? (
                <div className="grid gap-4 rounded-controle bg-saber p-4">
                  {suspeitosEmRisco > 0 ? (
                    <AvisoDaTela tom="atencao" className="bg-folha">
                      A conferência do cofre aponta {moneyFin(suspeitosEmRisco)} que podem estar sobrando no caixa. Resolva ali antes de somar no lucro,
                      senão o resultado do mês entra inflado.
                    </AvisoDaTela>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                    <Campo rotulo="Valor a somar" htmlFor="lucro-valor">
                      <input
                        id="lucro-valor"
                        inputMode="decimal"
                        value={lucroValor}
                        onChange={(event) => setLucroValor(event.target.value)}
                        placeholder="10.939,30"
                        className={cn(CAMPO, "text-right tabular-nums")}
                      />
                    </Campo>
                    <Campo rotulo="Observação" opcional htmlFor="lucro-nota">
                      <input
                        id="lucro-nota"
                        value={lucroNota}
                        onChange={(event) => setLucroNota(event.target.value)}
                        placeholder="Ex.: fechamento de julho, dinheiro conferido no cofre"
                        className={CAMPO}
                      />
                    </Campo>
                  </div>
                  <p className={AJUDA}>
                    Isto NÃO tira dinheiro do cofre: entra como linha própria no mês escolhido ({mesBR(lucroMes)}), somando no FATURAMENTO, no % da meta
                    e no lucro — na P12, nas Metas e nos Relatórios. Fica registrado quem marcou e quando, e dá para desfazer.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Botao variante="primario" onClick={confirmarLucro}>
                      Confirmar
                    </Botao>
                    <Botao variante="fantasma" onClick={() => setLucroEditando(false)}>
                      Cancelar
                    </Botao>
                  </div>
                </div>
              ) : null}

              {lucroFeedback ? (
                <AvisoDaTela tom={/^Removido|somados/.test(lucroFeedback) ? "ok" : "atencao"} onFechar={() => setLucroFeedback("")}>
                  {lucroFeedback}
                </AvisoDaTela>
              ) : null}
            </div>
          </BlocoFolha>
        </div>
      </div>
    </AccessGate>
  );
}

export default FinanceiroCrediarioPage;
