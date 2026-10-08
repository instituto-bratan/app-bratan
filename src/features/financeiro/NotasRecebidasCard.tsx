// NOTAS EMITIDAS CONTRA O INSTITUTO (22/09/2026)
//
// Pedido do Lucas, em duas partes: (1) casar cada nota de fornecedor com a
// conta paga; (2) "ter todas, todas, todas as notas que vêm para a gente,
// porque eu tenho que mandar para a contabilidade". Por isso o card tem dois
// lados: a fila do que ainda não tem dono, e o mês inteiro — com o ZIP para o
// contador (PDF + XML + índice em Excel) e a importação do arquivo da
// prefeitura de São Paulo, que a Focus não enxerga.
// Papel & Musgo (08/10/2026): bloco de folha com contador, a faixa do mês em
// "saber", tabela densa do guia e as ações Vincular → Abrir … Não é nossa na ponta.
import { useMemo, useRef, useState } from "react";
import { Download, FileSearch, FileUp, Link2, RefreshCw, X } from "lucide-react";
import { BlocoFolha, Botao, Contador } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { candidatosDaNota, numeroCurto, type ContaParaCasar } from "../../../supabase/functions/_shared/notasRecebidas";
import type { NotaRecebida } from "@/lib/remote/notasRecebidas";
import { notasDoMes, resumoDoMes } from "./notasRecebidasExport";
import { moneyFin, type FinExpense } from "./financeiroData";
import { AJUDA, CABECA_DA_FOLHA, CAMPO_PQ, RUBRICA, TD, TH, TituloDoBloco } from "./pecasDiaPagar";

const diaBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const ROTULO_TIPO: Record<NotaRecebida["tipo"], string> = { NFE: "NF-e", NFSE: "NFS-e", NFSE_SP: "NFS-e SP" };

export function NotasRecebidasCard({ itens, contas, carregando, ultimaBusca, readOnly, onBuscar, onVincular, onIgnorar, onAbrir, onBaixarZip, onImportarCsv }: {
  itens: NotaRecebida[];
  contas: FinExpense[];
  carregando: boolean;
  /** A frase da última sincronização (fica na configuração da integração). */
  ultimaBusca: string;
  readOnly: boolean;
  onBuscar: () => Promise<string>;
  onVincular: (nota: NotaRecebida, expenseRef: string) => Promise<void>;
  onIgnorar: (nota: NotaRecebida) => Promise<void>;
  onAbrir: (nota: NotaRecebida) => Promise<void>;
  /** O pacote do mês para a contabilidade. */
  onBaixarZip: (mes: string, notas: NotaRecebida[]) => Promise<string>;
  /** O CSV que o portal da prefeitura de São Paulo exporta (NFS-e tomadas). */
  onImportarCsv: (arquivo: File) => Promise<string>;
}) {
  const [buscando, setBuscando] = useState(false);
  const [empacotando, setEmpacotando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [recado, setRecado] = useState(ultimaBusca);
  const [escolhaManual, setEscolhaManual] = useState<Record<string, string>>({});
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [verTodas, setVerTodas] = useState(false);
  const inputCsv = useRef<HTMLInputElement>(null);

  const novas = itens.filter((n) => n.status === "NOVA");
  const doMes = useMemo(() => notasDoMes(itens, mes), [itens, mes]);
  const resumo = useMemo(() => resumoDoMes(doMes), [doMes]);
  const paraCasar: ContaParaCasar[] = useMemo(
    () => contas.map((c) => ({ id: c.id, description: c.description, supplier: c.supplier, amount: c.amount, paidAt: c.paidAt, dueDate: c.dueDate, notaStatus: c.notaStatus ?? null })),
    [contas],
  );
  const nomeDaConta = (ref: string | null) => (ref ? contas.find((c) => c.id === ref)?.description ?? "conta" : "");
  const temArquivo = (n: NotaRecebida) => Boolean(n.storagePathPdf || n.storagePathXml || n.urlExterna);

  async function rodar(setter: (v: boolean) => void, acao: () => Promise<string>) {
    setter(true);
    try {
      setRecado(await acao());
    } catch (falha) {
      setRecado((falha as Error).message || "Não deu certo agora.");
    } finally {
      setter(false);
    }
  }

  return (
    <BlocoFolha as="section" aria-labelledby="notas-recebidas-titulo" className="min-w-0">
      <div className={CABECA_DA_FOLHA}>
        <TituloDoBloco id="notas-recebidas-titulo" icone={<FileSearch className="h-4 w-4" aria-hidden="true" />}>
          Notas contra o Instituto
        </TituloDoBloco>
        <Contador valor={novas.length} rotulo={`${novas.length} sem conta ligada`} />
        <InfoTip title="Todas as notas que chegam para a gente">
          A Focus lista o que os fornecedores emitem no CNPJ da clínica (NF-e de mercadoria e NFS-e do padrão nacional); a NFS-e da
          prefeitura de São Paulo entra pelo CSV que o portal exporta. Cada arquivo vai sozinho para a pasta do mês no SharePoint
          (NOTAS FISCAIS RECEBIDAS/ano/mês) — casado com uma conta ou não. A SEFAZ só libera o XML completo e o PDF depois da
          ciência, num ciclo posterior: por isso algumas aparecem &quot;aguardando a SEFAZ&quot; por algumas horas. O ZIP do mês é o
          pacote para o contador: PDFs, XMLs e um índice em Excel.
        </InfoTip>
        {readOnly ? null : (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Botao
              variante="secundario"
              tamanho="pq"
              disabled={buscando}
              icone={<RefreshCw className={cn("h-4 w-4", buscando && "animate-spin")} aria-hidden="true" />}
              onClick={() => void rodar(setBuscando, onBuscar)}
            >
              {buscando ? "Buscando…" : "Buscar na Focus"}
            </Botao>
            <input
              ref={inputCsv}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void rodar(setImportando, () => onImportarCsv(f));
              }}
            />
            <Botao
              variante="secundario"
              tamanho="pq"
              disabled={importando}
              carregando={importando}
              icone={<FileUp className="h-4 w-4" aria-hidden="true" />}
              onClick={() => inputCsv.current?.click()}
              title="O CSV exportado em nfe.prefeitura.sp.gov.br → Exportação de NF-e → notas recebidas"
            >
              {importando ? "Lendo…" : "Importar CSV da prefeitura"}
            </Botao>
          </div>
        )}
      </div>

      <div className="grid gap-4 p-6 max-md:p-4">
        {recado ? <p className={AJUDA}>{recado}</p> : null}

        {/* ---- o mês inteiro, para a contabilidade ---- */}
        <div className="flex flex-wrap items-center gap-3 rounded-controle bg-saber px-4 py-3">
          <label className="flex items-center gap-2 text-[13px] font-bold text-tinta">
            Mês
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mes)} className={cn(CAMPO_PQ, "w-[150px]")} aria-label="Mês das notas" />
          </label>
          <span className="text-[13px] font-medium leading-5 text-tinta-2">
            {resumo.quantidade === 0
              ? "Nenhuma nota neste mês."
              : `${resumo.quantidade} nota${resumo.quantidade === 1 ? "" : "s"} somando ${moneyFin(resumo.total)} · ${resumo.comArquivo} com arquivo${resumo.semArquivo ? ` · ${resumo.semArquivo} aguardando a SEFAZ` : ""} · ${resumo.ligadas} ligada${resumo.ligadas === 1 ? "" : "s"} a conta`}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Botao variante="fantasma" tamanho="pq" onClick={() => setVerTodas((v) => !v)} aria-expanded={verTodas}>
              {verTodas ? "Esconder a lista" : "Ver todas do mês"}
            </Botao>
            <Botao
              variante="secundario"
              tamanho="pq"
              disabled={empacotando || resumo.quantidade === 0}
              carregando={empacotando}
              icone={<Download className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void rodar(setEmpacotando, () => onBaixarZip(mes, doMes))}
            >
              {empacotando ? "Empacotando…" : "ZIP do mês para o contador"}
            </Botao>
          </span>
        </div>
        {verTodas && doMes.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse font-sans text-sm text-tinta">
              <thead>
                <tr>
                  <th className={TH}>Emissão</th>
                  <th className={TH}>Tipo · nº</th>
                  <th className={TH}>Emitente</th>
                  <th className={cn(TH, "text-right")}>Valor</th>
                  <th className={TH}>Situação</th>
                  <th className={TH}>Arquivo</th>
                </tr>
              </thead>
              <tbody>
                {doMes.map((n) => (
                  <tr key={n.chave} className="hover:bg-saber/70">
                    <td className={cn(TD, "py-2 tabular-nums")}>{diaBr(n.emitidaEm)}</td>
                    <td className={cn(TD, "whitespace-nowrap py-2")}>{ROTULO_TIPO[n.tipo]} {numeroCurto(n)}</td>
                    <td className={cn(TD, "max-w-[16rem] truncate py-2")} title={n.emitenteNome}>{n.emitenteNome || n.emitenteDocumento}</td>
                    <td className={cn(TD, "whitespace-nowrap py-2 text-right font-bold tabular-nums")}>{moneyFin(n.valor)}</td>
                    <td className={cn(TD, "py-2 text-[13px] text-tinta-2")}>{n.status === "VINCULADA" ? `ligada: ${nomeDaConta(n.expenseRef).slice(0, 30)}` : n.status === "NOVA" ? "sem conta" : n.status === "IGNORADA" ? "não é nossa" : "cancelada"}</td>
                    <td className={cn(TD, "py-2")}>
                      {temArquivo(n) ? (
                        <button type="button" className="text-[13px] font-bold text-musgo underline-offset-[3px] hover:underline" onClick={() => void onAbrir(n)}>abrir</button>
                      ) : (
                        <span className="text-[13px] text-tinta-2">aguardando a SEFAZ</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* ---- a fila: o que ainda não tem dono ---- */}
        {carregando && !itens.length ? <p className={AJUDA}>Carregando…</p> : null}
        {!carregando && !novas.length ? (
          <p className="rounded-controle bg-saber px-4 py-3 text-center text-[13px] font-medium leading-5 text-tinta-2">
            Nenhuma nota esperando dono. O que chegar e não casar sozinho aparece aqui.
          </p>
        ) : null}
        {novas.length ? <p className={RUBRICA}>Sem conta ligada ({novas.length}) — do mais recente ao mais antigo</p> : null}
        {novas.length ? (
          <ul className="grid">
            {novas.slice(0, 60).map((nota) => {
              const candidatos = candidatosDaNota({ chave: nota.chave, tipo: nota.tipo, emitenteDocumento: nota.emitenteDocumento, emitenteNome: nota.emitenteNome, valor: nota.valor, emitidaEm: nota.emitidaEm }, paraCasar).slice(0, 4);
              const manual = escolhaManual[nota.chave] ?? "";
              const outras = contas
                .filter((c) => c.notaStatus !== "ANEXADA" && !candidatos.some((k) => k.conta.id === c.id))
                .sort((a, b) => (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate))
                .slice(0, 80);
              const trabalhando = ocupada === nota.chave;
              return (
                <li key={nota.chave} className="grid gap-3 border-t border-fio py-4 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold leading-5 text-tinta">{nota.emitenteNome || nota.emitenteDocumento || "Emitente não informado"}</p>
                      <p className="text-[13px] font-medium leading-5 text-tinta-2">
                        {ROTULO_TIPO[nota.tipo]} nº {numeroCurto(nota)} · emitida em {diaBr(nota.emitidaEm)}
                        {nota.manifestacao ? ` · ${nota.manifestacao}` : ""}
                        {!temArquivo(nota) ? " · arquivo aguardando a SEFAZ" : ""}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-sm font-bold tabular-nums text-tinta">{moneyFin(nota.valor)}</span>
                  </div>
                  {candidatos.length ? (
                    <div className="grid gap-1.5">
                      <p className={RUBRICA}>Pode ser esta conta</p>
                      {candidatos.map((k) => (
                        <button
                          key={k.conta.id}
                          type="button"
                          disabled={readOnly || trabalhando}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-controle border border-fio-2 bg-folha px-3 py-2 text-left text-[13px] font-medium text-tinta transition-colors hover:border-musgo hover:bg-musgo-claro focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={async () => {
                            setOcupada(nota.chave);
                            try {
                              await onVincular(nota, k.conta.id);
                            } finally {
                              setOcupada(null);
                            }
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <Link2 className="mr-1.5 inline h-3.5 w-3.5 text-musgo" aria-hidden="true" />
                            <strong className="font-bold">{k.conta.description}</strong>
                            <span className="text-tinta-2"> · {diaBr(k.conta.paidAt ?? k.conta.dueDate)} · {k.motivos.join(", ")}</span>
                          </span>
                          <span className="font-bold tabular-nums">{moneyFin(k.conta.amount)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className={AJUDA}>Nenhuma conta com este valor nos últimos meses. Se a conta ainda não foi lançada, lance primeiro; se foi paga em outro valor, escolha abaixo.</p>
                  )}
                  {readOnly ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className={cn(CAMPO_PQ, "max-w-full flex-1")}
                        value={manual}
                        onChange={(e) => setEscolhaManual((atual) => ({ ...atual, [nota.chave]: e.target.value }))}
                        aria-label="Outra conta"
                      >
                        <option value="">Outra conta…</option>
                        {outras.map((c) => (
                          <option key={c.id} value={c.id}>
                            {diaBr(c.paidAt ?? c.dueDate)} · {c.description.slice(0, 48)} · {moneyFin(c.amount)}
                          </option>
                        ))}
                      </select>
                      <Botao
                        variante="suave"
                        tamanho="pq"
                        disabled={!manual || trabalhando}
                        onClick={async () => {
                          setOcupada(nota.chave);
                          try {
                            await onVincular(nota, manual);
                          } finally {
                            setOcupada(null);
                          }
                        }}
                      >
                        Vincular
                      </Botao>
                      <Botao variante="fantasma" tamanho="pq" disabled={!temArquivo(nota)} title={temArquivo(nota) ? "" : "O arquivo chega quando a SEFAZ liberar"} onClick={() => void onAbrir(nota)}>
                        Abrir
                      </Botao>
                      <Botao
                        variante="perigo"
                        tamanho="pq"
                        className="ml-auto"
                        disabled={trabalhando}
                        icone={<X className="h-4 w-4" aria-hidden="true" />}
                        onClick={async () => {
                          setOcupada(nota.chave);
                          try {
                            await onIgnorar(nota);
                          } finally {
                            setOcupada(null);
                          }
                        }}
                      >
                        Não é nossa
                      </Botao>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        {novas.length > 60 ? <p className={AJUDA}>Mostrando as 60 mais recentes de {novas.length}. Case estas e as próximas aparecem.</p> : null}
      </div>
    </BlocoFolha>
  );
}
