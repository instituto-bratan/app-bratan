// NOTAS EMITIDAS CONTRA O INSTITUTO (22/09/2026)
//
// Pedido do Lucas, em duas partes: (1) casar cada nota de fornecedor com a
// conta paga; (2) "ter todas, todas, todas as notas que vêm para a gente,
// porque eu tenho que mandar para a contabilidade". Por isso o card tem dois
// lados: a fila do que ainda não tem dono, e o mês inteiro — com o ZIP para o
// contador (PDF + XML + índice em Excel) e a importação do arquivo da
// prefeitura de São Paulo, que a Focus não enxerga.
import { useMemo, useRef, useState } from "react";
import { Download, FileSearch, FileUp, Link2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { candidatosDaNota, numeroCurto, type ContaParaCasar } from "../../../supabase/functions/_shared/notasRecebidas";
import type { NotaRecebida } from "@/lib/remote/notasRecebidas";
import { notasDoMes, resumoDoMes } from "./notasRecebidasExport";
import { moneyFin, type FinExpense } from "./financeiroData";

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
    <section className="rounded-lg border border-brand-oliva/20 bg-white/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
          <FileSearch className="h-5 w-5" aria-hidden="true" />
          Notas contra o Instituto
          {novas.length ? <span className="rounded-full bg-brand-dourado/80 px-2 py-0.5 text-xs font-bold text-white">{novas.length}</span> : null}
          <InfoTip title="Todas as notas que chegam para a gente">
            A Focus lista o que os fornecedores emitem no CNPJ da clínica (NF-e de mercadoria e NFS-e do padrão nacional); a NFS-e da
            prefeitura de São Paulo entra pelo CSV que o portal exporta. Cada arquivo vai sozinho para a pasta do mês no SharePoint
            (NOTAS FISCAIS RECEBIDAS/ano/mês) — casado com uma conta ou não. A SEFAZ só libera o XML completo e o PDF depois da
            ciência, num ciclo posterior: por isso algumas aparecem &quot;aguardando a SEFAZ&quot; por algumas horas. O ZIP do mês é o
            pacote para o contador: PDFs, XMLs e um índice em Excel.
          </InfoTip>
        </h2>
        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={buscando} onClick={() => void rodar(setBuscando, onBuscar)}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", buscando && "animate-spin")} aria-hidden="true" />
              {buscando ? "Buscando…" : "Buscar na Focus"}
            </Button>
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
            <Button type="button" variant="outline" size="sm" disabled={importando} onClick={() => inputCsv.current?.click()} title="O CSV exportado em nfe.prefeitura.sp.gov.br → Exportação de NF-e → notas recebidas">
              <FileUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {importando ? "Lendo…" : "Importar CSV da prefeitura"}
            </Button>
          </div>
        )}
      </div>
      {recado ? <p className="mt-1 text-xs text-muted-foreground">{recado}</p> : null}

      {/* ---- o mês inteiro, para a contabilidade ---- */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-brand-oliva/15 bg-white/70 px-3 py-2 text-xs">
        <label className="flex items-center gap-1.5 font-semibold text-brand-tinta">
          Mês
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mes)} className="h-8 rounded-md border border-brand-oliva/30 bg-white px-2 text-xs" aria-label="Mês das notas" />
        </label>
        <span className="text-muted-foreground">
          {resumo.quantidade === 0
            ? "Nenhuma nota neste mês."
            : `${resumo.quantidade} nota${resumo.quantidade === 1 ? "" : "s"} somando ${moneyFin(resumo.total)} · ${resumo.comArquivo} com arquivo${resumo.semArquivo ? ` · ${resumo.semArquivo} aguardando a SEFAZ` : ""} · ${resumo.ligadas} ligada${resumo.ligadas === 1 ? "" : "s"} a conta`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setVerTodas((v) => !v)}>
            {verTodas ? "Esconder a lista" : "Ver todas do mês"}
          </Button>
          <Button type="button" size="sm" className="h-8 text-xs" disabled={empacotando || resumo.quantidade === 0} onClick={() => void rodar(setEmpacotando, () => onBaixarZip(mes, doMes))}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {empacotando ? "Empacotando…" : "ZIP do mês para o contador"}
          </Button>
        </span>
      </div>
      {verTodas && doMes.length ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-brand-oliva">
                <th className="py-1 pr-2">Emissão</th>
                <th className="py-1 pr-2">Tipo · nº</th>
                <th className="py-1 pr-2">Emitente</th>
                <th className="py-1 pr-2 text-right">Valor</th>
                <th className="py-1 pr-2">Situação</th>
                <th className="py-1 pr-2">Arquivo</th>
              </tr>
            </thead>
            <tbody>
              {doMes.map((n) => (
                <tr key={n.chave} className="border-t border-brand-oliva/10">
                  <td className="py-1 pr-2 tabular-nums">{diaBr(n.emitidaEm)}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">{ROTULO_TIPO[n.tipo]} {numeroCurto(n)}</td>
                  <td className="max-w-[16rem] truncate py-1 pr-2" title={n.emitenteNome}>{n.emitenteNome || n.emitenteDocumento}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{moneyFin(n.valor)}</td>
                  <td className="py-1 pr-2">{n.status === "VINCULADA" ? `ligada: ${nomeDaConta(n.expenseRef).slice(0, 30)}` : n.status === "NOVA" ? "sem conta" : n.status === "IGNORADA" ? "não é nossa" : "cancelada"}</td>
                  <td className="py-1 pr-2">
                    {temArquivo(n) ? (
                      <button type="button" className="text-brand-musgo underline-offset-2 hover:underline" onClick={() => void onAbrir(n)}>abrir</button>
                    ) : (
                      <span className="text-muted-foreground">aguardando a SEFAZ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ---- a fila: o que ainda não tem dono ---- */}
      <div className="mt-3 grid gap-2">
        {carregando && !itens.length ? <p className="text-xs text-muted-foreground">Carregando…</p> : null}
        {!carregando && !novas.length ? (
          <p className="rounded-md border border-dashed border-brand-oliva/30 bg-white/50 p-3 text-center text-xs text-muted-foreground">
            Nenhuma nota esperando dono. O que chegar e não casar sozinho aparece aqui.
          </p>
        ) : null}
        {novas.length ? <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Sem conta ligada ({novas.length}) — do mais recente ao mais antigo</p> : null}
        {novas.slice(0, 60).map((nota) => {
          const candidatos = candidatosDaNota({ chave: nota.chave, tipo: nota.tipo, emitenteDocumento: nota.emitenteDocumento, emitenteNome: nota.emitenteNome, valor: nota.valor, emitidaEm: nota.emitidaEm }, paraCasar).slice(0, 4);
          const manual = escolhaManual[nota.chave] ?? "";
          const outras = contas
            .filter((c) => c.notaStatus !== "ANEXADA" && !candidatos.some((k) => k.conta.id === c.id))
            .sort((a, b) => (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate))
            .slice(0, 80);
          const trabalhando = ocupada === nota.chave;
          return (
            <div key={nota.chave} className="rounded-md border border-brand-oliva/20 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-brand-tinta">{nota.emitenteNome || nota.emitenteDocumento || "Emitente não informado"}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROTULO_TIPO[nota.tipo]} nº {numeroCurto(nota)} · emitida em {diaBr(nota.emitidaEm)}
                    {nota.manifestacao ? ` · ${nota.manifestacao}` : ""}
                    {!temArquivo(nota) ? " · arquivo aguardando a SEFAZ" : ""}
                  </p>
                </div>
                <span className="font-bold tabular-nums text-brand-musgo">{moneyFin(nota.valor)}</span>
              </div>
              {candidatos.length ? (
                <div className="mt-2 grid gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Pode ser esta conta</p>
                  {candidatos.map((k) => (
                    <button
                      key={k.conta.id}
                      type="button"
                      disabled={readOnly || trabalhando}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-dourado/40 bg-brand-creme/40 px-2.5 py-1.5 text-left text-xs hover:bg-brand-creme disabled:opacity-60"
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
                        <Link2 className="mr-1 inline h-3 w-3" aria-hidden="true" />
                        {k.conta.description}
                        <span className="text-muted-foreground"> · {diaBr(k.conta.paidAt ?? k.conta.dueDate)} · {k.motivos.join(", ")}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{moneyFin(k.conta.amount)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma conta com este valor nos últimos meses. Se a conta ainda não foi lançada, lance primeiro; se foi paga em outro valor, escolha abaixo.</p>
              )}
              {readOnly ? null : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    className="h-8 max-w-full flex-1 rounded-md border border-brand-oliva/30 bg-white px-2 text-xs"
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
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
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={!temArquivo(nota)} title={temArquivo(nota) ? "" : "O arquivo chega quando a SEFAZ liberar"} onClick={() => void onAbrir(nota)}>
                    Abrir
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground"
                    disabled={trabalhando}
                    onClick={async () => {
                      setOcupada(nota.chave);
                      try {
                        await onIgnorar(nota);
                      } finally {
                        setOcupada(null);
                      }
                    }}
                  >
                    <X className="mr-1 h-3 w-3" aria-hidden="true" /> Não é nossa
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {novas.length > 60 ? <p className="text-xs text-muted-foreground">Mostrando as 60 mais recentes de {novas.length}. Case estas e as próximas aparecem.</p> : null}
      </div>
    </section>
  );
}
