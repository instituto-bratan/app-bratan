// EXTRATO DO BANCO × APP (10/08/2026) — a rede de segurança do processo.
//
// O Lucas arrasta o extrato do Itaú (o mesmo .xlsx que ele já baixa) e o app
// casa sozinho. Em vez de ele precisar "se atentar ao extrato", os problemas
// vêm até ele em quatro caixas. Tudo que a conciliação manual desta semana
// levou horas para achar aparece aqui em segundos.
//
// REDESENHO (08/10/2026, Papel & Musgo, imagem 03): um cabeçalho só, com a
// leitura da conciliação como frase; à esquerda, na folha, o que pede decisão
// (as quatro caixas e a maquininha dia a dia); à direita, no saber, o mês em
// números. Mesmos dados, mesmos botões, mesma regra de gravação.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Info, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  listRemoteFinBankEntries,
  saveRemoteFinBankEntries,
  saveRemoteFinBankMatches,
  updateRemoteFinBankEntry,
} from "@/lib/remoteData";
import { moneyFin, monthKeyLabel } from "./financeiroData";
import { conciliarExtrato, leituraDaConciliacao, lerExtratoDeTexto, lerExtratoDeXlsx, linhasNovasDoExtrato, type BankEntry } from "./extratoBanco";
import { agendaRecebiveis, faturamentoRede, saldoRecebiveis } from "./recebiveisRede";
import { useFinanceiro } from "./useFinanceiro";
import { Campo, Linha, NumeroGrande, OrigemDosDados, RecadoDaTela, Razao, Rubrica, Selecao, TituloDoBloco, Vazio, mesDaRubrica, tabela } from "./pecasBancoFechamento";

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
  // CONCILIAÇÃO GRAVADA (14/09/2026): o que casou sozinho fica salvo no banco,
  // linha a linha, em vez de ser recalculado a cada abertura. Só grava o que
  // ainda não tem match; o que a pessoa marcou (IGNORADO) não é tocado.
  // COM A REFERÊNCIA (29/09/2026, auditoria B5): antes gravava match_ref null
  // para tudo, e ninguém sabia depois COM QUE comanda/conta a linha casou. Agora
  // grava o id do que casou; o que casou só pela descrição (rendimento,
  // adiantamento da maquininha — não há registro no app) NÃO é gravado: é
  // reconhecido de novo a cada abertura, pela mesma regra.
  const gravadosRef = useRef(new Set<string>());
  useEffect(() => {
    if (!useRemote || readOnly) return;
    const novos: { clientRef: string; matchKind: "COMANDA" | "DESPESA" | "COFRE"; matchRef: string | null; matchNote: string | null }[] = [];
    for (const casada of balde.casadas) {
      if (!casada.ref || casada.entry.matchKind || gravadosRef.current.has(casada.entry.clientRef)) continue;
      novos.push({ clientRef: casada.entry.clientRef, matchKind: casada.tipo, matchRef: casada.ref, matchNote: casada.comQue });
    }
    for (const grupo of balde.casadasAgrupadas) {
      if (!grupo.ref) continue;
      for (const entry of grupo.entries) {
        if (entry.matchKind || gravadosRef.current.has(entry.clientRef)) continue;
        novos.push({ clientRef: entry.clientRef, matchKind: grupo.tipo, matchRef: grupo.ref, matchNote: `${grupo.comQue} (pago em ${grupo.entries.length} lançamentos)` });
      }
    }
    if (!novos.length) return;
    for (const novo of novos) gravadosRef.current.add(novo.clientRef);
    void saveRemoteFinBankMatches(novos, pessoa?.id ?? null)
      .then((quantos) => {
        if (quantos) void queryClient.invalidateQueries({ queryKey: ["fin-bank-entries"] });
      })
      .catch((error) => console.warn("Não gravei o casamento do extrato.", error));
  }, [balde, useRemote, readOnly, pessoa?.id, queryClient]);
  // Dois números que a antecipação escondia: o que a maquininha ainda deve e o
  // faturamento mínimo acordado com a Rede (perder o acordado custa a taxa boa).
  const saldoMaquininha = useMemo(
    () => saldoRecebiveis(agendaRecebiveis(financeiro.sales), hoje),
    [financeiro.sales, hoje],
  );
  const faturamentoAcordado = useMemo(
    () => faturamentoRede(financeiro.sales, periodo.start.slice(0, 7)),
    [financeiro.sales, periodo],
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
      // Confere contra o que JÁ está no app (lido agora, não do cache): o mesmo
      // lançamento pode vir com outro id quando o Itaú muda o formato do arquivo.
      const noApp = (await entriesQuery.refetch()).data ?? [];
      const novas = linhasNovasDoExtrato(lidas, noApp);
      if (!novas.length) {
        setFeedback(`Li ${lidas.length} lançamento(s) e todos já estavam no app. Nada foi duplicado.`);
        return;
      }
      await importar.mutateAsync(novas);
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

  // As quatro caixas. `tom` (08/10/2026) troca o fundo vermelho/âmbar antigo:
  // dinheiro que entrou ou saiu sem registro pede ação já (erro); comanda ou
  // conta sem o par no banco pede conferência (atenção).
  const caixas = [
    {
      chave: "entrou",
      titulo: "Entrou no banco e não tem comanda",
      explica: "Dinheiro que caiu na conta sem registro no app. Alguém atendeu e não lançou.",
      tom: "erro" as const,
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
      tom: "erro" as const,
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
      tom: "atencao" as const,
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
      tom: "atencao" as const,
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

  const nomeDoMes = monthKeyLabel(monthKey);
  const mesRubrica = mesDaRubrica(monthKey, hoje);
  const maquininha = balde.maquininha;
  const tomDaMaquininha = maquininha.situacao === "OK" ? "ok" : maquininha.situacao === "SEM_DADOS" ? null : "atencao";

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Extrato do banco" module="fin-extrato">
      <div className="mx-auto w-full max-w-[1320px]">
        <Cabecalho
          sobrancelha="Financeiro · Banco"
          titulo={
            <>
              Extrato do banco{" "}
              <InfoTip title="Para que serve" className="align-middle">
                O extrato é a única fonte que não mente: se o dinheiro entrou, está lá. Arraste o arquivo que você já baixa
                do Itaú e o app casa sozinho com as comandas e as contas. O que sobrar aparece nas caixas abaixo — é só
                isso que precisa da sua atenção. Importar o mesmo arquivo duas vezes não duplica nada.
              </InfoTip>
            </>
          }
          frase={
            problemas ? (
              <>
                <span className="alerta">{leituraDaConciliacao(balde)}</span> Em vez de você olhar o extrato linha por linha, o app olha e
                mostra só o que não fecha.
              </>
            ) : (
              <>
                {leituraDaConciliacao(balde)} Em vez de você olhar o extrato linha por linha, o app olha e mostra só o que não fecha.
              </>
            )
          }
          acoes={
            <div className="flex flex-wrap items-end gap-2">
              <Campo rotulo="Mês" className="w-44">
                <Selecao id="mes-extrato" value={monthKey} onChange={(event) => setMonthKey(event.target.value)}>
                  {meses.map((mes) => (
                    <option key={mes} value={mes}>
                      {monthKeyLabel(mes)}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Botao
                variante="fantasma"
                icone={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                onClick={() => void queryClient.invalidateQueries({ queryKey: ["fin-bank-entries"] })}
              >
                Atualizar
              </Botao>
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
                  <Botao
                    variante="primario"
                    carregando={lendo || importar.isPending}
                    disabled={lendo || importar.isPending}
                    icone={<FileUp className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => inputArquivo.current?.click()}
                  >
                    Importar extrato (.xlsx do Itaú)
                  </Botao>
                </>
              ) : null}
            </div>
          }
        />

        {feedback || erro ? (
          <div className="mb-6 grid gap-2">
            {feedback ? <RecadoDaTela>{feedback}</RecadoDaTela> : null}
            {erro ? <RecadoDaTela tom="erro">{erro}</RecadoDaTela> : null}
          </div>
        ) : null}

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          {/* DECIDIR — o que não fechou, caixa por caixa (folha). */}
          <div className="grid min-w-0 gap-6">
            <BlocoFolha as="section" aria-labelledby="extrato-pontos" className="overflow-hidden">
              <TituloDoBloco
                id="extrato-pontos"
                titulo="Pontos para olhar"
                soma={
                  problemas ? (
                    <span className="text-atencao">
                      {problemas} {problemas === 1 ? "ponto" : "pontos"} em {nomeDoMes}
                    </span>
                  ) : (
                    <span className="text-ok">nada pendente</span>
                  )
                }
                ajuda="Só o que o app não conseguiu casar sozinho. Resolva na origem (comanda ou conta) e a linha some daqui."
              />
              {caixas.map((caixa, indice) => {
                const soma = caixa.itens.reduce((total, item) => total + Math.abs(item.valor), 0);
                return (
                  <section key={caixa.chave} aria-labelledby={`caixa-${caixa.chave}`} className={cn("border-t", indice > 0 ? "border-fio-2" : "border-fio")}>
                    <TituloDoBloco
                      id={`caixa-${caixa.chave}`}
                      nivel="h3"
                      className="pt-4"
                      titulo={caixa.titulo}
                      soma={
                        caixa.itens.length ? (
                          <span className={caixa.tom === "erro" ? "text-erro" : "text-atencao"}>
                            {caixa.itens.length} · {moneyFin(soma)}
                          </span>
                        ) : null
                      }
                      ajuda={caixa.explica}
                    />
                    {!caixa.itens.length ? (
                      <Vazio>Nada aqui — está tudo conferido.</Vazio>
                    ) : (
                      <ul>
                        {caixa.itens.map((item) => (
                          <Linha
                            key={item.id}
                            titulo={item.texto}
                            meta={[
                              <span key="dia" className="tabular-nums">
                                {dataBr(item.dia)}
                              </span>,
                              item.detalhe && item.detalhe !== item.texto ? item.detalhe : null,
                            ]}
                            valor={moneyFin(item.valor)}
                            acoes={
                              item.entry && !readOnly ? (
                                <Botao variante="fantasma" tamanho="pq" onClick={() => void ignorar(item.entry!)}>
                                  Não é do Instituto
                                </Botao>
                              ) : null
                            }
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </BlocoFolha>

            {/* MAQUININHA (regra do Lucas): toda TRANSFERÊNCIA AUTOM. RECEBIDA é o
                crédito da véspera caindo, líquido da taxa — tem que bater com os
                cartões das comandas. */}
            <BlocoFolha as="section" aria-labelledby="extrato-maquininha" className="overflow-hidden">
              <TituloDoBloco
                id="extrato-maquininha"
                titulo={
                  <>
                    Maquininha: o que caiu × as parcelas que venciam
                    <InfoTip title="Como funciona">
                      Desde 24/08/2026 a Rede não antecipa mais: o crédito cai em 31 dias corridos — uma parcela por mês no
                      parcelado. Cada dia é confrontado com as PARCELAS que venciam nele, já líquidas pela tabela do contrato
                      que valia NA DATA DA VENDA: vendas de 24 a 31/08 pelo acordo Q-7594851 (1,4% à vista · 2,68% no
                      parcelado), vendas de 01/09 em diante pelo Q-7621480 (1,7% à vista · 2,39% em qualquer parcelado ·
                      0,7% no débito). Antes de 24/08 a antecipação estava ligada (custo ~6%) e os dias antigos continuam
                      sendo lidos assim.
                    </InfoTip>
                  </>
                }
              />
              <dl className="grid gap-x-6 gap-y-4 border-t border-fio px-6 py-4 sm:grid-cols-2 lg:grid-cols-3 max-md:px-4">
                <div className="min-w-0">
                  <dt className="text-[13px] font-medium leading-5 text-tinta-2">Transferências recebidas</dt>
                  <dd className="text-base font-bold leading-6 tabular-nums text-tinta">{moneyFin(maquininha.transferencias)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[13px] font-medium leading-5 text-tinta-2">Cartão das comandas (véspera)</dt>
                  <dd className="text-base font-bold leading-6 tabular-nums text-tinta">{moneyFin(maquininha.cartaoComandas)}</dd>
                </div>
                <div className="min-w-0" title="Soma das parcelas com vencimento depois de hoje, já líquidas da taxa do contrato.">
                  <dt className="text-[13px] font-medium leading-5 text-tinta-2">A maquininha ainda me deve</dt>
                  <dd className="text-base font-bold leading-6 tabular-nums text-tinta">
                    {moneyFin(saldoMaquininha.aReceber)}{" "}
                    <span className="text-[13px] font-medium text-tinta-2">({saldoMaquininha.parcelas} parcela(s))</span>
                  </dd>
                </div>
                <div
                  className="min-w-0"
                  title="Faturamento mensal acordado com a Rede (Tabela 1 do contrato). Se em nenhum dos 3 meses do período de apuração o volume for atingido, as taxas com desconto caem."
                >
                  <dt className="text-[13px] font-medium leading-5 text-tinta-2">Acordado com a Rede</dt>
                  <dd className={cn("text-base font-bold leading-6 tabular-nums", faturamentoAcordado.bateu ? "text-tinta" : "text-atencao")}>
                    {faturamentoAcordado.percentual.toFixed(0)}%{" "}
                    <span className="text-[13px] font-medium text-tinta-2">
                      de {moneyFin(faturamentoAcordado.acordado)}
                      {faturamentoAcordado.bateu ? " · bateu" : ` — faltam ${moneyFin(faturamentoAcordado.falta)}`}
                    </span>
                  </dd>
                </div>
                {maquininha.taxaImplicita !== null ? (
                  <div className="min-w-0">
                    <dt className="text-[13px] font-medium leading-5 text-tinta-2">Taxa implícita</dt>
                    <dd className="text-base font-bold leading-6 tabular-nums text-tinta">{String(maquininha.taxaImplicita).replace(".", ",")}%</dd>
                  </div>
                ) : null}
              </dl>
              <p
                className={cn(
                  "flex items-start gap-2 border-t border-fio px-6 py-3 text-sm font-semibold leading-5 max-md:px-4",
                  tomDaMaquininha === "ok" ? "text-ok" : tomDaMaquininha === "atencao" ? "text-atencao" : "text-tinta-2",
                )}
              >
                {tomDaMaquininha === "ok" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : tomDaMaquininha === "atencao" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 stroke-oliva" aria-hidden="true" />
                )}
                <span>{maquininha.leitura}</span>
              </p>

              {/* DIA POR DIA (18/08/2026). No total do mês a taxa de um dia
                  compensa a sobra de outro e o furo desaparece: foi assim que
                  R$ 13.808 fechados no Kanban e nunca lançados ficaram escondidos.
                  Aqui cada adiantamento é confrontado só com o cartão do dia útil
                  que o originou. */}
              {maquininha.porDia.length ? (
                <div className="overflow-x-auto border-t border-fio">
                  <table className={cn(tabela.tabela, "min-w-[40rem]")}>
                    <caption className="sr-only">Maquininha dia por dia</caption>
                    <thead>
                      <tr>
                        <th scope="col" className={tabela.th}>Caiu no banco</th>
                        <th scope="col" className={tabela.th}>Origem</th>
                        <th scope="col" className={tabela.thNum}>Caiu</th>
                        <th scope="col" className={tabela.thNum}>Previsto</th>
                        <th scope="col" className={tabela.thNum}>Taxa</th>
                        <th scope="col" className={tabela.th}>Leitura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maquininha.porDia.map((dia) => (
                        <tr
                          key={dia.diaTransferencia}
                          className={cn(
                            tabela.linha,
                            dia.situacao === "SOBROU_NO_BANCO" ? "bg-erro-claro/50" : dia.situacao === "FALTOU_CAIR" ? "bg-atencao-claro/50" : "",
                          )}
                        >
                          <td className={cn(tabela.td, "whitespace-nowrap tabular-nums")}>{dataBr(dia.diaTransferencia)}</td>
                          <td className={cn(tabela.td, "text-tinta-2")}>{dia.origem}</td>
                          <td className={tabela.tdNum}>{moneyFin(dia.transferencia)}</td>
                          <td className={tabela.tdNum}>
                            {moneyFin(dia.regime === "PRAZO" ? dia.previstoLiquido : dia.cartao)}
                            {dia.regime === "PRAZO" ? null : <span className="ml-1 text-xs font-medium text-tinta-2">bruto</span>}
                          </td>
                          <td className={tabela.tdNum}>{dia.taxaImplicita === null ? "—" : `${String(dia.taxaImplicita).replace(".", ",")}%`}</td>
                          <td
                            className={cn(
                              tabela.td,
                              "font-semibold",
                              dia.situacao === "SOBROU_NO_BANCO" ? "text-erro" : dia.situacao === "FALTOU_CAIR" ? "text-atencao" : "text-ok",
                            )}
                          >
                            {dia.situacao === "OK"
                              ? "bate"
                              : dia.situacao === "SOBROU_NO_BANCO"
                                ? `sobrou ${moneyFin(dia.sobra)} — falta comanda de cartão`
                                : dia.transferencia === 0
                                  ? dia.regime === "PRAZO"
                                    ? "parcela não caiu — conferir no portal da Rede"
                                    : "o dinheiro do cartão não caiu"
                                  : "caiu menos do que o previsto"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </BlocoFolha>
          </div>

          {/* SABER — o mês no banco (sem borda, sem sombra). */}
          <BlocoSaber as="aside" aria-labelledby="extrato-mes" className="grid content-start gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <Rubrica as="h2" id="extrato-mes">
                {mesRubrica} no banco
              </Rubrica>
              <span className="whitespace-nowrap text-[13px] font-medium text-tinta-2">conferência automática</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <NumeroGrande valor={balde.totais.entrouBanco} />
              <span className="text-[13px] font-medium leading-5 text-tinta-2">entrou no banco</span>
            </div>
            <Razao
              linhas={[
                { rotulo: "Saiu do banco", detalhe: "pagamentos do mês", valor: moneyFin(balde.totais.saiuBanco) },
                { rotulo: "Faturado no app", detalhe: "comandas do mês", valor: moneyFin(balde.totais.faturadoApp) },
                {
                  rotulo: "Pontos para olhar",
                  detalhe: problemas ? "na folha ao lado, um por caixa" : undefined,
                  valor: problemas ? String(problemas) : "nenhum",
                  tom: problemas ? "atencao" : "ok",
                },
              ]}
            />
            <div className="grid gap-1">
              <p className="text-sm font-semibold leading-5 text-tinta">Casaram com o app</p>
              <Razao
                className="border-t-0"
                linhas={[
                  { rotulo: "Por valor e data", valor: String(balde.casadas.length), valorMenor: true },
                  { rotulo: "Com diferença de centavo/real", valor: String(balde.casadasComDiferenca.length), valorMenor: true },
                  { rotulo: "Conta paga em 2 lançamentos", valor: String(balde.casadasAgrupadas.length), valorMenor: true },
                ]}
              />
            </div>
            {balde.casadasComDiferenca.length || balde.casadasAgrupadas.length ? (
              <ul className="grid gap-2 text-[13px] font-medium leading-5 text-tinta">
                {balde.casadasComDiferenca.map((item) => (
                  <li key={item.entry.clientRef} className="rounded-controle bg-folha px-3 py-2">
                    <span className="tabular-nums">{dataBr(item.entry.entryDate)}</span> · {moneyFin(Math.abs(item.entry.amount))} casou com{" "}
                    <strong className="font-bold">{item.comQue}</strong> — diferença de {moneyFin(item.diferenca)}
                  </li>
                ))}
                {balde.casadasAgrupadas.map((item) => (
                  <li key={item.comQue + item.total} className="rounded-controle bg-folha px-3 py-2">
                    <strong className="font-bold">{item.comQue}</strong> foi pago em {item.entries.length} lançamentos:{" "}
                    <span className="tabular-nums">
                      {item.entries.map((entry) => moneyFin(Math.abs(entry.amount))).join(" + ")} = {moneyFin(item.total)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <OrigemDosDados modo={financeiro.syncMode} />
          </BlocoSaber>
        </div>
      </div>
    </AccessGate>
  );
}
