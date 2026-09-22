// O LOTE DE NOTAS A EMITIR (22/09/2026).
//
// A tabela que o Lucas conferiu no chat vira um cartão: uma linha por nota,
// com o que a comanda tem, o valor, se a ficha já tem CPF e e-mail, e um botão
// que emite tudo pela Focus em sequência e registra cada nota no controle. A
// função da Focus só aceita pedido de quem está logado, por isso o clique é
// de uma pessoa — e é aqui que ela clica.
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileCheck2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { toast } from "@/components/ui/avisos";
import { integracaoLigada } from "@/lib/integracoes";
import { invocarIntegracao } from "@/lib/remoteData";
import { atualizarRemoteNfseLoteItem, listRemoteNfseLote, prontidaoDoLote, type ProntidaoDoContato } from "@/lib/remote/nfseLote";
import { moneyFin, type FinInvoice } from "./financeiroData";
import { discriminacaoDoItem, invoicesDoItem, partesFecham, resumoDoLote, type ItemDoLote } from "./loteDeNotas";
import { rotuloDoTipoDeNota } from "../../../supabase/functions/_shared/notaEmitida";

type Resposta = { ok: boolean; ref?: string; status?: string; error?: string; jaEmitida?: boolean; numero?: string | null; emailEnviado?: boolean; dados?: { numero?: string; status?: string } };

const dataBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

export function LoteDeNotasCard({ readOnly, onRegister }: { readOnly: boolean; onRegister: (invoices: FinInvoice[]) => void }) {
  const ligada = integracaoLigada("focus_nfse");
  const [itens, setItens] = useState<ItemDoLote[] | null>(null);
  const [prontidao, setProntidao] = useState<Record<string, ProntidaoDoContato>>({});
  const [emitindo, setEmitindo] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);

  async function carregar() {
    try {
      const lista = await listRemoteNfseLote();
      setItens(lista);
      const pronta = await prontidaoDoLote(lista.map((i) => i.contactRef ?? ""));
      setProntidao(Object.fromEntries(pronta.map((p) => [p.contactRef, p])));
    } catch {
      setItens([]);
    }
  }
  useEffect(() => {
    if (ligada) void carregar();
  }, [ligada]);

  const visiveis = useMemo(() => (itens ?? []).filter((i) => i.status !== "RETIRADA"), [itens]);
  const resumo = useMemo(() => resumoDoLote(itens ?? []), [itens]);
  if (!ligada || !itens || !visiveis.length) return null;

  function aplicar(id: string, patch: Partial<ItemDoLote>) {
    setItens((atual) => (atual ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  /** Emite UM item e, se a prefeitura já autorizou, registra no controle. */
  async function emitirItem(item: ItemDoLote): Promise<"autorizada" | "enviada" | "erro"> {
    if (!partesFecham(item)) {
      const erro = "As partes não fecham com o valor da nota.";
      aplicar(item.id, { status: "ERRO", erro });
      await atualizarRemoteNfseLoteItem(item.id, { status: "ERRO", erro });
      return "erro";
    }
    setEmitindo(item.id);
    try {
      const r = await invocarIntegracao<Resposta>("focus-nfse", {
        acao: "emitir",
        saleRef: item.saleRef,
        tipo: item.tipo,
        valor: item.valor,
        discriminacao: discriminacaoDoItem(item),
        tomador: { nome: item.tomadorNome },
      });
      if (!r.ok) {
        const erro = r.error ?? `A Focus recusou: ${r.status ?? ""}`;
        aplicar(item.id, { status: "ERRO", erro });
        await atualizarRemoteNfseLoteItem(item.id, { status: "ERRO", erro });
        return "erro";
      }
      const numero = r.numero ?? r.dados?.numero ?? null;
      const ref = r.ref ?? null;
      if (numero) {
        const agora = new Date().toISOString();
        aplicar(item.id, { status: "AUTORIZADA", ref, numero: String(numero), erro: null, emitidaEm: agora });
        await atualizarRemoteNfseLoteItem(item.id, { status: "AUTORIZADA", ref, numero: String(numero), erro: null, emitidaEm: agora });
        onRegister(invoicesDoItem(item, String(numero), agora.slice(0, 10)));
        return "autorizada";
      }
      aplicar(item.id, { status: "ENVIADA", ref, erro: null });
      await atualizarRemoteNfseLoteItem(item.id, { status: "ENVIADA", ref, erro: null });
      return "enviada";
    } finally {
      setEmitindo(null);
    }
  }

  /** Nota que ficou "processando": pergunta de novo à prefeitura e registra quando vier o número. */
  async function consultarItem(item: ItemDoLote) {
    if (!item.ref) return;
    setEmitindo(item.id);
    try {
      const r = await invocarIntegracao<Resposta>("focus-nfse", { acao: "consultar", ref: item.ref });
      const numero = r.dados?.numero ?? null;
      const st = String(r.dados?.status ?? r.status ?? "").toUpperCase();
      if (numero) {
        const agora = new Date().toISOString();
        aplicar(item.id, { status: "AUTORIZADA", numero: String(numero), emitidaEm: agora });
        await atualizarRemoteNfseLoteItem(item.id, { status: "AUTORIZADA", numero: String(numero), emitidaEm: agora });
        onRegister(invoicesDoItem(item, String(numero), agora.slice(0, 10)));
        toast(`Nota autorizada: nº ${numero}.`, { tom: "ok" });
      } else if (/ERRO/.test(st)) {
        aplicar(item.id, { status: "ERRO", erro: `A prefeitura recusou (${st.toLowerCase()}). Veja o detalhe em Administração → Integrações.` });
        await atualizarRemoteNfseLoteItem(item.id, { status: "ERRO", erro: st });
      } else toast(`Ainda ${st.toLowerCase() || "processando"}…`, { tom: "info" });
    } finally {
      setEmitindo(null);
    }
  }

  async function emitirTodas() {
    const fila = visiveis.filter((i) => i.status === "PENDENTE" || i.status === "ERRO");
    if (!fila.length) return;
    if (!window.confirm(`Emitir ${fila.length} nota${fila.length > 1 ? "s" : ""} na prefeitura agora, no total de ${moneyFin(fila.reduce((s, i) => s + i.valor, 0))}? Depois de emitida, nota só sai com cancelamento.`)) return;
    setRodando(true);
    let autorizadas = 0;
    let enviadas = 0;
    let erros = 0;
    try {
      for (const item of fila) {
        const r = await emitirItem(item);
        if (r === "autorizada") autorizadas += 1;
        else if (r === "enviada") enviadas += 1;
        else erros += 1;
        // A prefeitura responde em segundos; um respiro entre as notas evita o limite da Focus.
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
    } finally {
      setRodando(false);
    }
    toast(`${autorizadas} autorizada${autorizadas === 1 ? "" : "s"} · ${enviadas} aguardando a prefeitura · ${erros} com erro`, { tom: erros ? "atencao" : "ok", duracaoMs: 9000 });
  }

  async function retirar(item: ItemDoLote) {
    if (!window.confirm(`Tirar ${item.tomadorNome} do lote? A nota não será emitida por aqui.`)) return;
    aplicar(item.id, { status: "RETIRADA" });
    await atualizarRemoteNfseLoteItem(item.id, { status: "RETIRADA" });
  }

  const pendentes = visiveis.filter((i) => i.status === "PENDENTE" || i.status === "ERRO");
  const semCpf = pendentes.filter((i) => !(i.contactRef && prontidao[i.contactRef]?.temCpf)).length;
  const semEmail = pendentes.filter((i) => !(i.contactRef && prontidao[i.contactRef]?.temEmail)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Lote de notas conferido · {visiveis[0]?.lote.split("-").reverse().join("/")}</CardTitle>
        <p className="text-sm text-muted-foreground">{resumo.frase}</p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {pendentes.length ? (
          <p className="text-xs text-muted-foreground">
            {semCpf ? `${semCpf} ${semCpf === 1 ? "paciente ainda sem CPF na ficha (a nota sai sem tomador identificado)" : "pacientes ainda sem CPF na ficha (a nota sai sem tomador identificado)"}` : "Todos com CPF na ficha"}
            {" · "}
            {semEmail ? `${semEmail} sem e-mail (a nota não será enviada por e-mail)` : "todos com e-mail"}
            . A função lê CPF e e-mail da ficha na hora de emitir: preencha antes de clicar.
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">
                <th className="py-1.5 pr-3">#</th>
                <th className="py-1.5 pr-3">Paciente</th>
                <th className="py-1.5 pr-3">Comanda</th>
                <th className="py-1.5 pr-3">Nota</th>
                <th className="py-1.5 pr-3 text-right">Valor</th>
                <th className="py-1.5 pr-3">Ficha</th>
                <th className="py-1.5 pr-3">Situação</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item) => {
                const p = item.contactRef ? prontidao[item.contactRef] : undefined;
                return (
                  <tr key={item.id} className="border-t border-brand-oliva/10 align-top">
                    <td className="py-2 pr-3 text-muted-foreground">{item.ordem}</td>
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-brand-tinta">{item.tomadorNome}</p>
                      {item.observacao ? <p className="text-xs text-muted-foreground">{item.observacao}</p> : null}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{dataBR(item.dia)}{item.partes.length > 1 ? ` (+${item.partes.length - 1})` : ""}</td>
                    <td className="py-2 pr-3">
                      {item.tipo === "UNIFICADA" ? "unificada, tratamento" : rotuloDoTipoDeNota(item.tipo)}
                      <p className="text-xs text-muted-foreground">{item.pagamentoTexto.toLowerCase()}</p>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">{moneyFin(item.valor)}</td>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">
                      <span className={p?.temCpf ? "text-brand-musgo" : "text-amber-700"}>CPF {p?.temCpf ? "✓" : "—"}</span>
                      {" · "}
                      <span className={p?.temEmail ? "text-brand-musgo" : "text-amber-700"}>e-mail {p?.temEmail ? "✓" : "—"}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {item.status === "AUTORIZADA" ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-brand-musgo"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> nº {item.numero}</span>
                      ) : item.status === "ENVIADA" ? (
                        <span className="text-amber-700">aguardando a prefeitura</span>
                      ) : item.status === "ERRO" ? (
                        <span className="inline-flex items-start gap-1 text-red-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {item.erro}</span>
                      ) : emitindo === item.id ? (
                        <span className="inline-flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> emitindo…</span>
                      ) : (
                        <span className="text-muted-foreground">para emitir</span>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {!readOnly && item.status === "ENVIADA" ? (
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={emitindo !== null} onClick={() => void consultarItem(item)}>Consultar</Button>
                      ) : null}
                      {!readOnly && (item.status === "PENDENTE" || item.status === "ERRO") ? (
                        <>
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={emitindo !== null || rodando} onClick={() => void emitirItem(item).then((r) => toast(r === "autorizada" ? "Nota autorizada." : r === "enviada" ? "Enviada; consulte em instantes." : "Não saiu — veja o erro na linha.", { tom: r === "erro" ? "erro" : "ok" }))}>
                            <FileCheck2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Emitir
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="ml-1 h-7 text-xs" disabled={emitindo !== null || rodando} onClick={() => void retirar(item)}>Tirar</Button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!readOnly && pendentes.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <LiquidButton type="button" size="sm" className="h-9 px-4" disabled={rodando || emitindo !== null} onClick={() => void emitirTodas()}>
              {rodando ? "Emitindo…" : `Emitir as ${pendentes.length} notas · ${moneyFin(pendentes.reduce((s, i) => s + i.valor, 0))}`}
            </LiquidButton>
            <span className="text-xs text-muted-foreground">Uma por vez, na prefeitura. Cada autorizada entra no controle abaixo com o número.</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
