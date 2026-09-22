// NOTAS EMITIDAS CONTRA O INSTITUTO (22/09/2026)
//
// Pedido do Lucas: "receber todas as notas fiscais contra nós também". O card
// mostra o que a Focus achou no CNPJ da clínica e ainda não tem dono: para
// cada nota, as contas que podem ser dela (valor igual, data perto, nome do
// fornecedor), do mais provável ao menos. Um clique anexa — e a coluna "Nota
// fiscal" da planilha passa a dizer ANEXADA, igual à nota subida à mão.
//
// A nota casada sozinha não aparece aqui: apareceria como ruído. Aparece na
// conta, onde ela pertence.
import { useMemo, useState } from "react";
import { FileSearch, Link2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { candidatosDaNota, numeroCurto, type ContaParaCasar } from "../../../supabase/functions/_shared/notasRecebidas";
import type { NotaRecebida } from "@/lib/remote/notasRecebidas";
import { moneyFin, type FinExpense } from "./financeiroData";

const diaBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

export function NotasRecebidasCard({ itens, contas, carregando, ultimaBusca, readOnly, onBuscar, onVincular, onIgnorar, onAbrir }: {
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
}) {
  const [buscando, setBuscando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [recado, setRecado] = useState(ultimaBusca);
  const [escolhaManual, setEscolhaManual] = useState<Record<string, string>>({});
  const novas = itens.filter((n) => n.status === "NOVA");
  const resolvidas = itens.filter((n) => n.status !== "NOVA").slice(0, 6);

  const paraCasar: ContaParaCasar[] = useMemo(
    () => contas.map((c) => ({ id: c.id, description: c.description, supplier: c.supplier, amount: c.amount, paidAt: c.paidAt, dueDate: c.dueDate, notaStatus: c.notaStatus ?? null })),
    [contas],
  );

  async function buscar() {
    setBuscando(true);
    try {
      setRecado(await onBuscar());
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="rounded-lg border border-brand-oliva/20 bg-white/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-brand-musgo">
          <FileSearch className="h-5 w-5" aria-hidden="true" />
          Notas contra o Instituto
          {novas.length ? <span className="rounded-full bg-brand-dourado/80 px-2 py-0.5 text-xs font-bold text-white">{novas.length}</span> : null}
          <InfoTip title="O que os fornecedores emitiram no nosso CNPJ">
            A Focus lista as notas emitidas contra o CNPJ da clínica: a NF-e de mercadoria (farmácias, materiais) e a NFS-e de serviço
            do padrão nacional. O app baixa o PDF, casa sozinho quando valor, data e fornecedor apontam para uma única conta, e deixa
            aqui o que ficou em dúvida. Vincular anexa a nota à conta e manda o arquivo para a pasta do SharePoint — igual à nota
            subida à mão. A busca roda todo dia às 7h30 e no botão.
          </InfoTip>
        </h2>
        {readOnly ? null : (
          <Button type="button" variant="outline" size="sm" disabled={buscando} onClick={() => void buscar()}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", buscando && "animate-spin")} aria-hidden="true" />
            {buscando ? "Buscando…" : "Buscar na Focus"}
          </Button>
        )}
      </div>
      {recado ? <p className="mt-1 text-xs text-muted-foreground">{recado}</p> : null}

      <div className="mt-3 grid gap-2">
        {carregando && !itens.length ? <p className="text-xs text-muted-foreground">Carregando…</p> : null}
        {!carregando && !novas.length ? (
          <p className="rounded-md border border-dashed border-brand-oliva/30 bg-white/50 p-3 text-center text-xs text-muted-foreground">
            Nenhuma nota esperando dono. O que a Focus achar e não casar sozinho aparece aqui.
          </p>
        ) : null}
        {novas.map((nota) => {
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
                    {nota.tipo === "NFE" ? "NF-e" : "NFS-e"} nº {numeroCurto(nota)} · emitida em {diaBr(nota.emitidaEm)}
                    {nota.manifestacao ? ` · ${nota.manifestacao}` : ""}
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
                  <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={!nota.storagePathPdf && !nota.storagePathXml} onClick={() => void onAbrir(nota)}>
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
        {resolvidas.length ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Últimas resolvidas ({resolvidas.length})</summary>
            <ul className="mt-1 grid gap-0.5">
              {resolvidas.map((n) => (
                <li key={n.chave}>
                  {n.status === "VINCULADA" ? "✓ anexada" : n.status === "IGNORADA" ? "— não é nossa" : "✕ cancelada"} · {n.emitenteNome || n.emitenteDocumento} · {moneyFin(n.valor)}
                  {n.vinculoMotivo ? ` · ${n.vinculoMotivo}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
