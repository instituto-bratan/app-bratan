// JUNTAR COMANDAS NUMA NOTA SÓ (07/10/2026, pedido do Lucas — mãe e filho).
//
// A mesma janela serve a dois lugares:
//  · "comandas" — Impostos & NFs, cartão "Comandas aguardando NF": quem EMITE
//    (podeEmitirNota — por padrão, só o Estevão) emite a nota única na hora;
//    quem não emite deixa a nota pronta no Lote de notas para ele;
//  · "lote" — o Lote de notas: duas ou mais linhas ainda não emitidas viram
//    uma só (a do titular recebe tudo; as outras saem do lote, com o porquê).
//
// Tudo que aparece aqui vem do motor puro (juntarNotas.ts): a parte de cada
// comanda, quem pode ser o titular, o tipo, o total e o texto que vai na nota.
// A tela não calcula nada por conta própria — o que a pessoa lê antes de
// clicar é exatamente o que vai para a prefeitura.
//
// É a Gaveta da casa (a dos pedidos de compra): sobe de baixo no celular, entra
// pela direita no computador, vai por portal (a troca de tela anima o conteúdo
// com transform, e um `fixed` lá dentro ficava cortado e por baixo do dock).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Gaveta } from "@/features/compras/Gaveta";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { avisoQuemEmiteNota, canFinanceiroFull, podeEmitirNota } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { invocarIntegracao } from "@/lib/remoteData";
import { atualizarRemoteNfseLoteItem, criarRemoteNfseLoteItem, prontidaoDoLote } from "@/lib/remote/nfseLote";
import { dataBR } from "@/features/crm/notaNoFechamento";
import { moneyFin } from "./financeiroData";
import { chaveDoLote } from "./loteDeNotas";
import { mudancasNoLote, planoDaJuncao, type AnaliseDaJuncao, type TitularPossivel } from "./juntarNotas";

type Resposta = { ok: boolean; ref?: string; status?: string; error?: string; jaEmitida?: boolean; cobertaPor?: { rotulo: string; numero: string | null }; numero?: string | null; emailEnviado?: boolean; dados?: { numero?: string } };
type Resultado = { tom: "ok" | "info" | "erro"; texto: string };

const rotuloDoTipo = { CONSULTA: "Consulta", UNIFICADA: "Unificada (tratamento)" } as const;

export function JuntarNotasDialog({
  modo,
  analise,
  onFechar,
  onPronto,
}: {
  modo: "comandas" | "lote";
  /** A análise congelada no momento em que a janela abriu. */
  analise: AnaliseDaJuncao;
  onFechar: () => void;
  /** Deu certo (emitiu, ficou no lote ou juntou no lote): a tela limpa a seleção. */
  onPronto: () => void;
}) {
  const { pessoa } = useAuth();
  const queryClient = useQueryClient();
  const podeEmitir = podeEmitirNota(pessoa);
  // O lote aceita item novo (e mudança) do financeiro completo e de quem emite — a mesma regra da RLS.
  const podeUsarOLote = podeEmitir || canFinanceiroFull(pessoa?.cargo);
  // null = escolha automática: o primeiro paciente com CPF na ficha (é o que
  // deixa a nota sair); depois que a pessoa escolhe, fica o que ela escolheu.
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<null | "emitir" | "lote">(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const terminou = resultado !== null && resultado.tom !== "erro";

  // CPF e e-mail na ficha: só o sim/não, nunca o número (o servidor lê o CPF da ficha do titular).
  const contatos = analise.titulares.map((t) => t.contatoRef ?? "").filter(Boolean);
  const prontidao = useQuery({
    queryKey: ["juntar-prontidao", contatos.join("|")],
    queryFn: () => prontidaoDoLote(contatos),
    enabled: contatos.length > 0,
    staleTime: 30_000,
    retry: 1,
  });
  const fichaDe = (t: TitularPossivel) => (t.contatoRef ? prontidao.data?.find((p) => p.contactRef === t.contatoRef) : undefined);
  const chave = escolhida ?? (analise.titulares.find((t) => fichaDe(t)?.temCpf) ?? analise.titulares[0])?.chave ?? "";

  const plano = useMemo(() => planoDaJuncao(analise, chave, { nome: pessoa?.nome ?? "", hoje: todayISO() }), [analise, chave, pessoa?.nome]);
  const titular = plano?.titular ?? null;
  const titularTemCpf = Boolean(titular && fichaDe(titular)?.temCpf);
  // Não deu para conferir a ficha (rede, permissão): a tela não afirma "sem
  // CPF" e deixa o servidor decidir — ele recusa com a frase certa se faltar.
  const cpfDesconhecido = prontidao.isError && Boolean(titular?.contatoRef);
  // Enquanto a ficha não respondeu (inclusive sem rede), a tela diz "conferindo" — nunca "sem CPF".
  const conferindo = Boolean(titular?.contatoRef) && prontidao.isPending;
  const travaPorCpf = !titularTemCpf && !cpfDesconhecido;

  function recarregar() {
    void queryClient.invalidateQueries({ queryKey: ["fin-invoices"] });
    void queryClient.invalidateQueries({ queryKey: [...chaveDoLote] });
    void queryClient.invalidateQueries({ queryKey: ["nfse-com-partes"] });
    void queryClient.invalidateQueries({ queryKey: ["nfse-das-comandas"] });
  }

  function mostrar(r: Resultado) {
    setResultado(r);
    toast(r.texto, { tom: r.tom === "erro" ? "erro" : r.tom === "ok" ? "ok" : "info", duracaoMs: r.tom === "erro" ? 10000 : 7000 });
  }

  /** Emite a nota única na prefeitura (só quem tem a permissão "Emitir nota fiscal"). */
  async function emitir() {
    if (!podeEmitir) return toast(avisoQuemEmiteNota, { tom: "atencao" });
    if (!plano || !titular) return;
    if (travaPorCpf) return toast(`Falta o CPF de ${titular.paciente} na ficha: a prefeitura recusaria a nota.`, { tom: "atencao" });
    setOcupado("emitir");
    try {
      const r = await invocarIntegracao<Resposta>("focus-nfse", { acao: "emitir", ...plano.pedido });
      if (!r.ok) {
        mostrar({ tom: "erro", texto: r.error ?? `A prefeitura recusou (${r.status ?? "sem resposta"}). Nada foi emitido.` });
        return;
      }
      const numero = r.numero ?? r.dados?.numero ?? null;
      if (r.jaEmitida) {
        mostrar({ tom: "erro", texto: `A comanda de ${titular.paciente} já tinha nota ${r.cobertaPor?.rotulo ?? ""}${numero ? ` (nº ${numero})` : ""}. Nada foi juntado: recarregue a tela e confira.` });
      } else if (numero) {
        mostrar({ tom: "ok", texto: `Nota autorizada: nº ${numero}, de ${moneyFin(plano.item.valor)}, no nome de ${titular.paciente}.${r.emailEnviado ? " Já foi por e-mail." : ""} As ${plano.item.partes.length} comandas saem da fila.` });
        onPronto();
      } else {
        mostrar({ tom: "info", texto: `Pedido enviado à prefeitura: nota única de ${moneyFin(plano.item.valor)} no nome de ${titular.paciente}. O número chega em instantes, e as comandas saem da fila quando ela autorizar.` });
        onPronto();
      }
      recarregar();
    } catch (falha) {
      mostrar({ tom: "erro", texto: `Não consegui falar com a prefeitura: ${falha instanceof Error ? falha.message : String(falha)}. Nada foi emitido.` });
    } finally {
      setOcupado(null);
    }
  }

  /** Deixa a nota juntada pronta no lote, para quem emite. */
  async function deixarNoLote() {
    if (!plano || !titular) return;
    if (!podeUsarOLote) return toast("Quem põe nota no lote é o financeiro ou quem emite.", { tom: "atencao" });
    setOcupado("lote");
    try {
      const criado = await criarRemoteNfseLoteItem(plano.item);
      mostrar({
        tom: "ok",
        texto: `Pronta no lote de ${criado.lote.split("-").reverse().join("/")}: nota única de ${moneyFin(criado.valor)} no nome de ${titular.paciente}. ${podeEmitir ? "Emita pelo Lote de notas quando o CPF estiver na ficha." : "O Estevão emite pelo Lote de notas."}`,
      });
      onPronto();
      recarregar();
    } catch (falha) {
      mostrar({ tom: "erro", texto: `Não consegui pôr a nota no lote: ${falha instanceof Error ? falha.message : String(falha)}` });
    } finally {
      setOcupado(null);
    }
  }

  /** Modo lote: a linha do titular recebe tudo; as outras saem do lote dizendo onde foram parar. */
  async function juntarNoLote() {
    if (!plano || !titular) return;
    if (!podeUsarOLote) return toast("Quem mexe no lote é o financeiro ou quem emite.", { tom: "atencao" });
    setOcupado("lote");
    const mudancas = mudancasNoLote(plano);
    try {
      // O titular primeiro: se algo falhar depois, nenhuma comanda some do lote.
      await atualizarRemoteNfseLoteItem(mudancas.titularId, mudancas.patch);
      for (const retirado of mudancas.retirados) await atualizarRemoteNfseLoteItem(retirado.id, { status: "RETIRADA", observacao: retirado.observacao });
      mostrar({ tom: "ok", texto: `Juntadas numa nota só de ${moneyFin(plano.item.valor)} no nome de ${titular.paciente}. ${podeEmitir ? "Ela está no lote, pronta para emitir." : "Ela está no lote para o Estevão emitir."}` });
      onPronto();
    } catch (falha) {
      mostrar({ tom: "erro", texto: `A junção parou no meio: ${falha instanceof Error ? falha.message : String(falha)}. Recarregue a tela e confira o lote.` });
    } finally {
      recarregar();
      setOcupado(null);
    }
  }

  const n = analise.pedacos.length;
  const fechar = () => {
    if (!ocupado) onFechar();
  };

  const acoes = (
    <div className="grid gap-3">
      {resultado ? (
        <div
          role={resultado.tom === "erro" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            resultado.tom === "erro" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          {resultado.tom === "erro" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{resultado.texto}</span>
        </div>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <Button type="button" variant="ghost" onClick={fechar} disabled={ocupado !== null}>
          {terminou ? "Fechar" : "Agora não"}
        </Button>
        {!terminou && analise.podeJuntar && plano ? (
          modo === "lote" ? (
            <LiquidButton type="button" size="sm" className="h-10 px-4" disabled={ocupado !== null || !podeUsarOLote} onClick={() => void juntarNoLote()}>
              {ocupado ? "Juntando…" : `Juntar no lote · ${moneyFin(plano.item.valor)}`}
            </LiquidButton>
          ) : podeEmitir ? (
            <>
              <Button type="button" variant="outline" className="h-10" disabled={ocupado !== null} onClick={() => void deixarNoLote()}>
                {ocupado === "lote" ? "Pondo no lote…" : "Deixar pronta no lote"}
              </Button>
              <LiquidButton type="button" size="sm" className="h-10 px-4" disabled={ocupado !== null || travaPorCpf} onClick={() => void emitir()}>
                {ocupado === "emitir" ? "Emitindo na prefeitura…" : `Emitir nota única de ${moneyFin(plano.item.valor)}`}
              </LiquidButton>
            </>
          ) : podeUsarOLote ? (
            <LiquidButton type="button" size="sm" className="h-10 px-4" disabled={ocupado !== null} onClick={() => void deixarNoLote()}>
              {ocupado === "lote" ? "Pondo no lote…" : "Deixar pronta no lote para o Estevão"}
            </LiquidButton>
          ) : (
            <p className="text-sm text-muted-foreground">{avisoQuemEmiteNota}. Quem põe nota no lote é o financeiro.</p>
          )
        ) : null}
      </div>
    </div>
  );

  return (
    <Gaveta
      aberta
      titulo="Juntar em uma nota só"
      subtitulo={`${n} ${modo === "lote" ? "notas do lote" : "comandas"} somam ${moneyFin(analise.total)}. A nota sai no nome de um paciente, e o texto diz de quem mais são os serviços.`}
      onFechar={fechar}
      rodape={acoes}
    >
      {!analise.podeJuntar ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700" role="alert">
          <p className="font-semibold">Não dá para juntar estas {modo === "lote" ? "notas" : "comandas"}:</p>
          <ul className="mt-1 list-disc pl-5">
            {analise.motivos.map((motivo) => (
              <li key={motivo}>{motivo}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{modo === "lote" ? "Notas que viram uma" : "Comandas que entram"}</p>
        <ul className="mt-1.5 grid gap-1.5">
          {analise.pedacos.map((pedaco) => (
            <li key={pedaco.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border border-brand-oliva/12 bg-white/70 px-3 py-2 text-sm">
              <span className="min-w-0 font-medium text-brand-tinta">{pedaco.paciente}</span>
              <span className="text-xs text-muted-foreground">
                comanda de {dataBR(pedaco.dia)}
                {pedaco.partes.length > 1 ? ` · já junta ${pedaco.partes.length} comandas` : ""}
              </span>
              <span className="ml-auto font-semibold tabular-nums text-brand-tinta">{moneyFin(pedaco.valor)}</span>
            </li>
          ))}
        </ul>
        {modo === "comandas" ? <p className="mt-1 text-xs text-muted-foreground">Valor de cada uma = a parte do Instituto (nutricionista e psicóloga ficam fora, vão pelos repasses).</p> : null}
      </section>

      {analise.podeJuntar && plano ? (
        <>
          <fieldset className="mt-4" disabled={ocupado !== null || terminou}>
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">A nota sai no nome de:</legend>
            <div className="mt-1.5 grid gap-1.5">
              {analise.titulares.map((t) => {
                const ficha = fichaDe(t);
                const marcado = t.chave === plano.titular.chave;
                return (
                  <label
                    key={t.chave}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                      marcado ? "border-brand-musgo bg-white/90 ring-1 ring-brand-musgo" : "border-brand-oliva/18 bg-white/50 hover:bg-white/80",
                    )}
                  >
                    <input type="radio" name="titular-da-nota" className="mt-1 h-4 w-4 accent-brand-musgo" checked={marcado} onChange={() => setEscolhida(t.chave)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-brand-tinta">{t.paciente}</span>
                      <span className="block text-xs">
                        {!t.contatoRef ? (
                          <span className="text-amber-700">comanda sem ficha do paciente: o CPF não tem de onde vir</span>
                        ) : prontidao.isPending ? (
                          <span className="text-muted-foreground">conferindo a ficha…</span>
                        ) : prontidao.isError ? (
                          <span className="text-muted-foreground">não consegui conferir a ficha agora (a prefeitura confere o CPF ao emitir)</span>
                        ) : ficha?.temCpf ? (
                          <span className="font-semibold text-brand-musgo">CPF guardado</span>
                        ) : (
                          <span className="text-amber-700">
                            sem CPF: coloque na{" "}
                            <Link to="/pacientes" className="font-semibold underline underline-offset-2">
                              aba Pacientes
                            </Link>
                          </span>
                        )}
                        {t.contatoRef && ficha && !ficha.temEmail ? <span className="text-muted-foreground"> · sem e-mail (a nota não vai por e-mail)</span> : null}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Tipo da nota</p>
              <p className="text-sm font-semibold text-brand-tinta">{rotuloDoTipo[analise.tipo]}</p>
              <p className="text-xs text-muted-foreground">{analise.porQueOTipo}</p>
            </div>
            <div className="rounded-lg border border-brand-dourado bg-white/70 px-4 py-2 sm:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">Valor da nota</p>
              <p className="text-2xl font-bold tabular-nums text-brand-musgo">{moneyFin(plano.item.valor)}</p>
              <p className="text-xs text-muted-foreground">soma das {n} {modo === "lote" ? "notas" : "comandas"}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">O texto que vai na nota</p>
            <p className="mt-1 whitespace-pre-wrap break-words rounded-md border border-brand-oliva/14 bg-white/70 p-3 font-mono text-[11px] leading-5 text-brand-tinta">{plano.discriminacao}</p>
          </div>

          {modo === "comandas" && podeEmitir && travaPorCpf && !conferindo ? (
            <p className="mt-3 text-sm font-semibold text-amber-700">
              Sem o CPF de {plano.titular.paciente} na ficha, a prefeitura recusa a nota. Coloque o CPF na aba Pacientes, escolha outro paciente ou deixe a nota pronta no lote.
            </p>
          ) : null}
        </>
      ) : null}
    </Gaveta>
  );
}
