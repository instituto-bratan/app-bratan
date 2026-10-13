// PDCA · ADESÃO DR DANIEL — quem passou pela consulta e fechou (ou não) o plano.
//
// REDESENHO (08/10/2026, Papel & Musgo, etapa 4 — Resultados › Metas & PDCA):
// um cabeçalho só, com a taxa de adesão dita em frase; as abas Metas · PDCA logo
// abaixo (a casca as entrega). À esquerda, na folha, o que pede decisão: quem
// não aderiu (registrar a objeção ou marcar que aderiu); embaixo, quem aderiu.
// À direita, no saber, o mês em adesão com a faixa saudável de 70% a 80%.
// Mesmos dados, mesmos botões, mesma sincronização com o Supabase (as
// marcações que não sobem continuam guardadas até o "Tentar sincronizar").
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { buildPdca, type PdcaStatus } from "./pdcaData";
import { abasPdcaContabilidade } from "./exportContabilidade";
import { ExportarPlanilhaBotoes } from "./ExportarPlanilhaBotoes";
import {
  deleteRemoteFinPdcaMark,
  listRemoteFinPdcaMarks,
  saveRemoteFinPdcaMark,
  type FinPdcaMark,
} from "@/lib/remoteData";
import { moneyFin, type FinSale } from "./financeiroData";
import { useFinanceiro } from "./useFinanceiro";
import { perguntar } from "@/components/ui/avisos";
import { FaixaDasSalas } from "@/features/home/pecasDoInicio";
import { Campo, Linha, OrigemDosDados, Razao, Vazio, classeDoCampo } from "./pecasBancoFechamento";
import { AvisoDaTela } from "./pecasDiaPagar";
import { NumeroDoIndicador, RUBRICA_RESULTADOS, SeloDaSituacao, TituloDeBloco, mesDaTela, type TomDaSituacao } from "./pecasMetasPdca";

const pdcaMarksStorageKey = "app-bratan-fin-pdca-marks";

export function FinanceiroPdcaPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const canEdit = canEditModule(pessoa, "fin-pdca");
  const now = todayISO();
  const [month, setMonth] = useState(now.slice(0, 7));
  const financeiro = useFinanceiro(Number(month.slice(0, 4)));
  const [localMarks, setLocalMarks] = useState<FinPdcaMark[]>(() => readLocalValue(pdcaMarksStorageKey, []));
  // Marcações que o Supabase rejeitou (ex.: RLS): ficam aqui aguardando o
  // "Tentar sincronizar" e NÃO podem ser engolidas pelo refetch — era isso que
  // fazia tudo "voltar" quando a pessoa atualizava a página.
  const pendingRef = useRef(new Map<string, FinPdcaMark | { saleRef: string; status: null }>());
  const [syncFailed, setSyncFailed] = useState(false);
  const [syncErrorDetail, setSyncErrorDetail] = useState("");

  const marksQuery = useQuery({
    queryKey: ["fin-pdca-marks"],
    queryFn: async () => {
      const remote = await listRemoteFinPdcaMarks();
      // O retrato do banco vale para todo mundo, MENOS para o que ainda não
      // conseguiu subir daqui — senão o refetch apaga o trabalho da pessoa.
      const pending = pendingRef.current;
      const merged = [
        ...remote.filter((mark) => !pending.has(mark.saleRef)),
        ...[...pending.values()].filter((mark): mark is FinPdcaMark => Boolean(mark.status)),
      ];
      setLocalMarks(merged);
      writeLocalValue(pdcaMarksStorageKey, merged);
      return merged;
    },
    enabled: useRemote,
  });
  void marksQuery;

  function syncMarkRemote(mark: FinPdcaMark | { saleRef: string; status: null }) {
    const action = mark.status ? saveRemoteFinPdcaMark(mark as FinPdcaMark) : deleteRemoteFinPdcaMark(mark.saleRef);
    return action
      .then(() => {
        pendingRef.current.delete(mark.saleRef);
        if (pendingRef.current.size === 0) {
          setSyncFailed(false);
          setSyncErrorDetail("");
        }
      })
      .catch((error) => {
        console.warn("Marcação do PDCA não sincronizou.", error);
        pendingRef.current.set(mark.saleRef, mark);
        setSyncFailed(true);
        setSyncErrorDetail(error instanceof Error ? error.message : String(error));
      });
  }

  function persistMark(mark: FinPdcaMark | { saleRef: string; status: null }) {
    setLocalMarks((current) => {
      const next = current.filter((existing) => existing.saleRef !== mark.saleRef);
      if (mark.status) next.push(mark as FinPdcaMark);
      writeLocalValue(pdcaMarksStorageKey, next);
      return next;
    });
    if (useRemote) void syncMarkRemote(mark);
  }

  function retrySync() {
    for (const mark of pendingRef.current.values()) void syncMarkRemote(mark);
  }

  async function markNaoAderiu(sale: FinSale) {
    const objection = await perguntar(`Qual foi a objeção de ${sale.patientName}?`, { placeholder: "preço, tempo, medo, vai pensar…", confirmar: "Registrar" });
    if (objection === null) return;
    persistMark({ saleRef: sale.id, status: "NAO_ADERIU", objection: objection.trim() });
  }

  const marksMap = useMemo(() => new Map(localMarks.map((mark) => [mark.saleRef, mark])), [localMarks]);
  const pdca = useMemo(() => buildPdca(financeiro.sales, month, marksMap), [financeiro.sales, month, marksMap]);
  const rows = pdca.rows;

  const totalTratamentos = rows.reduce((sum, row) => sum + row.tratamento, 0);
  // Exportação para a contabilidade (09/09): só tratamentos, no formato da planilha antiga.
  const abasContabilidade = useMemo(
    () => abasPdcaContabilidade({ pdca, sales: financeiro.sales, monthKey: month }),
    [pdca, financeiro.sales, month],
  );
  const aderiram = rows.filter((row) => row.status === "ADERIU" || row.status === "ADERIU_DEPOIS");
  const naoAderiram = rows.filter((row) => row.status === "NAO_ADERIU");
  const decididos = rows.length;
  const taxaAdesao = decididos ? (aderiram.length / decididos) * 100 : 0;
  const naFaixa = taxaAdesao >= 70 && taxaAdesao <= 80;
  const nomeDoMes = mesDaTela(month, now);
  const taxaTexto = `${taxaAdesao.toFixed(1).replace(".", ",")}%`;

  // A situação de cada linha: palavra + cor (a cor nunca fala sozinha).
  const statusBadge: Record<PdcaStatus, { label: string; tom: TomDaSituacao }> = {
    ADERIU: { label: "Aderiu", tom: "ok" },
    ADERIU_DEPOIS: { label: "Aderiu depois", tom: "ok" },
    NAO_ADERIU: { label: "Não aderiu", tom: "atencao" },
  };

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · PDCA" module="fin-pdca">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Resultados · Metas & PDCA"
          titulo={
            <>
              PDCA · Adesão Dr Daniel{" "}
              <InfoTip title="Como o app classifica cada paciente" className="align-middle">
                Adesão aqui é <strong>plano de acompanhamento — R$ 6.997</strong>: tratamento abaixo disso não conta
                como adesão nem entra no ticket (regra da CEO, 31/08). Quem <strong>só pagou o sinal</strong> ainda
                nem passou pela consulta e fica FORA da conta. <strong>Medicação avulsa</strong> (tirzepatida, doses,
                vitaminas, pellets) nunca é adesão nem entra no ticket, mesmo que a comanda passe de R$ 6.997; comanda
                sem consulta e sem plano é recorrente comprando — também fora. Passou pela consulta e não fechou o plano, é
                não-adesão; se voltar e fechar o plano depois, o app reclassifica sozinho. Meta: 70% a 80%.
              </InfoTip>
            </>
          }
          frase={
            <>
              {decididos ? (
                <>
                  Em {nomeDoMes.toLowerCase()}, <strong className="tabular-nums">{aderiram.length} de {decididos}</strong> pacientes que passaram pela consulta
                  fecharam o plano: <strong className={naFaixa ? "tabular-nums" : "alerta tabular-nums"}>{taxaTexto}</strong>, para uma meta de 70% a 80%.{" "}
                </>
              ) : (
                <>Em {nomeDoMes.toLowerCase()}, ninguém passou pela consulta ainda. </>
              )}
              Consulta de hoje pode ser adesão de amanhã — o funil respeita o tempo de decisão do paciente.
            </>
          }
          acoes={
            <>
              <Campo rotulo="Mês" className="w-44">
                <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={classeDoCampo} aria-label="Mês" />
              </Campo>
              <div className="flex min-h-10 items-center">
                <ExportarPlanilhaBotoes rotulo="Contabilidade" arquivo={`PDCA-DR-DANIEL-${month}`} abas={abasContabilidade} />
              </div>
            </>
          }
        />

        {syncFailed ? (
          <AvisoDaTela
            tom="erro"
            acao={
              <Botao variante="secundario" tamanho="pq" onClick={retrySync}>
                Tentar sincronizar
              </Botao>
            }
          >
            Sua marcação NÃO chegou ao Supabase — ela está salva só neste aparelho. Não saia da tela sem sincronizar.
            {syncErrorDetail ? (
              <span className="mt-1 block break-all font-mono text-xs font-medium leading-4 text-tinta-2">Detalhe técnico: {syncErrorDetail}</span>
            ) : null}
          </AvisoDaTela>
        ) : null}

        {pdca.sinaisAguardando.length ? (
          <AvisoDaTela tom="info">
            <strong>{pdca.sinaisAguardando.length} sinal(is) aguardando a consulta</strong>{" "}
            <span className="font-medium text-tinta-2">
              — fora da margem de propósito (a decisão ainda não aconteceu): {pdca.sinaisAguardando.map((s) => s.paciente).join(" · ")}
            </span>
          </AvisoDaTela>
        ) : null}

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] max-md:gap-6">
          <div className="grid min-w-0 gap-8 max-md:gap-6">
            {/* DECIDIR — quem não aderiu: registrar a objeção ou marcar que aderiu (folha). */}
            <BlocoFolha as="section" aria-labelledby="pdca-nao-aderiram" className="overflow-hidden">
              <TituloDeBloco
                id="pdca-nao-aderiram"
                className="px-6 pb-3 pt-5 max-md:px-4 max-md:pt-4"
                titulo={`Não aderiram (${naoAderiram.length})`}
                ajuda="Passou pela consulta e não fechou o plano. Registre a objeção para o PDCA aprender com ela."
              />
              {naoAderiram.length ? (
                <ul>
                  {naoAderiram.map((row) => (
                    <Linha
                      key={row.sale.id}
                      titulo={row.sale.patientName}
                      meta={[
                        <span key="dia" className="tabular-nums">
                          {row.sale.saleDate.split("-").reverse().join("/")}
                        </span>,
                        row.detail ? row.detail : "sem objeção registrada",
                      ]}
                      acoes={
                        canEdit ? (
                          <>
                            <Botao variante="suave" tamanho="pq" onClick={() => markNaoAderiu(row.sale)}>
                              Registrar objeção
                            </Botao>
                            <Botao
                              variante="secundario"
                              tamanho="pq"
                              onClick={() => persistMark({ saleRef: row.sale.id, status: "ADERIU_MANUAL", objection: "" })}
                            >
                              Marcar aderiu
                            </Botao>
                          </>
                        ) : (
                          <SeloDaSituacao tom={statusBadge[row.status].tom}>{statusBadge[row.status].label}</SeloDaSituacao>
                        )
                      }
                    />
                  ))}
                </ul>
              ) : (
                <Vazio>Ninguém marcado como perdido.</Vazio>
              )}
            </BlocoFolha>

            {/* SABER — quem aderiu no mês (só para ler). */}
            <BlocoSaber as="section" aria-labelledby="pdca-aderiram" className="overflow-hidden p-0 max-md:p-0">
              <TituloDeBloco
                id="pdca-aderiram"
                className="px-6 pb-3 pt-5 max-md:px-4 max-md:pt-4"
                titulo={`Aderiram (${aderiram.length})`}
                ajuda="Plano (≥ R$ 6.997) na comanda ou fechou depois."
              />
              {aderiram.length ? (
                <ul>
                  {aderiram.map((row) => (
                    <Linha
                      key={row.sale.id}
                      className="hover:bg-fio/40"
                      titulo={row.sale.patientName}
                      meta={[
                        <span key="dia" className="tabular-nums">
                          {row.sale.saleDate.split("-").reverse().join("/")}
                        </span>,
                        row.detail || null,
                      ]}
                      acoes={<SeloDaSituacao tom={statusBadge[row.status].tom}>{statusBadge[row.status].label}</SeloDaSituacao>}
                    />
                  ))}
                </ul>
              ) : (
                <Vazio tom="neutro">Nenhuma adesão registrada no mês.</Vazio>
              )}
            </BlocoSaber>
          </div>

          {/* SABER — o mês em adesão, com a faixa saudável (70% a 80%). */}
          <BlocoSaber as="aside" aria-labelledby="pdca-mes" className="grid content-start gap-4">
            <h2 id="pdca-mes" className={RUBRICA_RESULTADOS}>
              {nomeDoMes} em adesão
            </h2>
            <div className="grid gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold leading-5 text-tinta">
                  Taxa de adesão <span className="text-[13px] font-semibold text-ok">· meta 70–80%</span>
                </span>
                <NumeroDoIndicador tom={decididos && !naFaixa ? "atencao" : undefined}>{decididos ? taxaTexto : "—"}</NumeroDoIndicador>
              </div>
              <FaixaDasSalas
                valor={decididos ? taxaAdesao : 0}
                de={70}
                ate={80}
                descricao={decididos ? `Taxa de adesão ${taxaTexto}; a meta é de 70% a 80%` : "Sem paciente decidido no mês; a meta é de 70% a 80%"}
              />
              <p className="text-[13px] font-medium leading-5 text-tinta-2">
                {!decididos
                  ? "Sem paciente decidido no mês ainda."
                  : naFaixa
                    ? "Dentro da faixa saudável."
                    : taxaAdesao < 70
                      ? "Abaixo da faixa saudável."
                      : "Acima da faixa saudável."}
              </p>
            </div>
            <Razao
              linhas={[
                { rotulo: "Aderiram", detalhe: "plano (≥ R$ 6.997) na comanda ou fechou depois", valor: String(aderiram.length) },
                {
                  rotulo: "Não aderiram",
                  detalhe: "passou pela consulta e não fechou o plano",
                  valor: String(naoAderiram.length),
                  tom: naoAderiram.length ? "atencao" : undefined,
                },
              ]}
            />
            <div className="grid gap-1">
              <p className={RUBRICA_RESULTADOS}>Ticket médio do plano</p>
              <NumeroDoIndicador>{pdca.ticketPlano ? moneyFin(pdca.ticketPlano) : "—"}</NumeroDoIndicador>
              <p className="text-[13px] font-medium leading-5 text-tinta-2">
                só plano/tratamento ≥ R$ 6.997 · sem sinal nem medicação avulsa · total do mês {moneyFin(totalTratamentos)}
              </p>
            </div>
            <OrigemDosDados modo={financeiro.syncMode} />
          </BlocoSaber>
        </div>
      </div>
    </AccessGate>
  );
}

export default FinanceiroPdcaPage;
