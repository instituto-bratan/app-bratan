// O LOTE DE NOTAS A EMITIR (22/09/2026).
//
// A tabela que o Lucas conferiu no chat vira um cartão: uma linha por nota,
// com o que a comanda tem, o valor, se a ficha já tem CPF e e-mail, e um botão
// que emite tudo pela Focus em sequência e registra cada nota no controle. A
// função da Focus só aceita pedido de quem está logado, por isso o clique é
// de uma pessoa — e é aqui que ela clica.
//
// 07/10/2026: emitir (uma linha ou o lote todo) depende da permissão "Emitir
// nota fiscal" (podeEmitirNota — por padrão, só o Estevão), e NÃO do "só vê"
// da tela: o Estevão só VÊ Impostos & NFs e é ele quem emite o lote. Tirar do
// lote continua com quem edita a tela; Consultar (buscar o número da nota que
// ficou aguardando a prefeitura) também fica com quem emite.
//
// 07/10/2026 (juntar notas de dois pacientes, pedido do Lucas):
//  · CORREÇÃO: as partes de OUTRAS comandas iam como `sinais`, e o servidor só
//    aceita sinal do MESMO paciente — a nota "Simone + Murilo" (mãe e filho,
//    lote de setembro) seria recusada ao emitir. Agora vão em `juntar`, com o
//    valor de cada parte (juntarDoItem), e o texto ganha "INCLUI SERVIÇOS
//    PRESTADOS A: …";
//  · duas ou mais linhas ainda não emitidas podem virar uma só (JuntarNotasDialog);
//  · o cartão mostra TODOS os lotes, separados (o de setembro e o do mês em que
//    a junção pôs nota nova), e lê o lote pelo mesmo cache da fila de comandas.
//
// 07/10/2026 (CPF e emissão numa tela só, pedido do Lucas):
//  · a coluna Ficha das linhas abertas traz o CPF da ficha (CpfDaNotaInline, o
//    MESMO campo do Lançar Dia): guardar ali mesmo, sem ir na aba Pacientes;
//    quem emite tem "Guardar CPF e emitir";
//  · nota no nome de X com a comanda ligada à ficha de Y: o CPF não vai para a
//    ficha; quem emite manda "só nesta nota" (tomador.cpf). Essas linhas ficam
//    de fora do "Emitir todas" — sairiam com o CPF da pessoa errada;
//  · linha aberta cuja comanda já tem nota viva (emitida em outra tela — caso
//    Luciane, nota 6238) diz "Nota 6238 já emitida em outra tela" e não
//    oferece emitir. O banco também acompanha (202610070004_lote_acompanha_a_nota).
//
// REDESENHO (08/10/2026, Papel & Musgo): o cartão virou uma folha (é decisão:
// emitir, juntar, tirar) com a tabela do guia, a situação de cada linha dita em
// palavra + ícone + cor, e os botões da fundação. Nenhuma regra mudou.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Combine, FileCheck2, XCircle } from "lucide-react";
import { BlocoFolha, Botao, BotaoDecisao, Giro } from "@/components/ui/fundacao";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { avisoQuemEmiteNota, podeEmitirNota } from "@/lib/access";
import { integracaoLigada } from "@/lib/integracoes";
import { cn } from "@/lib/utils";
import { invocarIntegracao } from "@/lib/remoteData";
import { atualizarRemoteNfseLoteItem, listRemoteNfseLote, listRemoteNotasComPartes, prontidaoDoLote, type ProntidaoDoContato } from "@/lib/remote/nfseLote";
import { listRemoteNfseDasComandas } from "@/lib/remoteData";
import { moneyFin, type FinInvoice } from "./financeiroData";
import { chaveDoLote, discriminacaoDoItem, fraseDaNotaForaDoLote, juntarDoItem, notaForaDoLote, partesFecham, resumoDoLote, type ItemDoLote, type NotaForaDoLote } from "./loteDeNotas";
import { CpfDaNotaInline } from "./CpfDaNotaInline";
import { fichaDeOutraPessoa } from "./cpfDaNota";
import { analisarItensDoLote, type AnaliseDaJuncao } from "./juntarNotas";
import { JuntarNotasDialog } from "./JuntarNotasDialog";
import { TituloDoBloco, tabela } from "./pecasBancoFechamento";
import { rotuloDoTipoDeNota } from "../../../supabase/functions/_shared/notaEmitida";

type Resposta = { ok: boolean; ref?: string; status?: string; error?: string; jaEmitida?: boolean; numero?: string | null; emailEnviado?: boolean; dados?: { numero?: string; status?: string } };

const dataBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

// 29/09/2026: a linha do controle de impostos nasce no SERVIDOR quando a
// prefeitura autoriza (inclusive a nota que cobre várias comandas, uma linha
// por parte). O cartão só pede para a tela recarregar o controle — registrar
// daqui também duplicava o imposto.
export function LoteDeNotasCard({ readOnly, invoices = [] }: { readOnly: boolean; invoices?: FinInvoice[] }) {
  const ligada = integracaoLigada("focus_nfse");
  const { pessoa } = useAuth();
  const podeEmitir = podeEmitirNota(pessoa);
  const queryClient = useQueryClient();
  const recarregarControle = () => void queryClient.invalidateQueries({ queryKey: ["fin-invoices"] });
  // O lote vem do cache compartilhado (chaveDoLote): a fila "Comandas
  // aguardando NF" lê o mesmo, e a junção que põe nota nova no lote recarrega
  // os dois de uma vez.
  const lote = useQuery({ queryKey: [...chaveDoLote], queryFn: listRemoteNfseLote, enabled: ligada, staleTime: 30_000 });
  const itens = lote.isError ? [] : (lote.data ?? null);
  const contatos = useMemo(() => [...new Set((itens ?? []).map((i) => i.contactRef ?? "").filter(Boolean))].sort(), [itens]);
  const fichas = useQuery({ queryKey: ["nfse-lote-prontidao", contatos.join("|")], queryFn: () => prontidaoDoLote(contatos), enabled: ligada && contatos.length > 0, staleTime: 30_000 });
  const prontidao = useMemo<Record<string, ProntidaoDoContato>>(() => Object.fromEntries((fichas.data ?? []).map((p) => [p.contactRef, p])), [fichas.data]);
  // A NOTA QUE SAIU POR OUTRA TELA (07/10/2026): as emissões da Focus das
  // comandas das linhas abertas (e das que cobrem várias, o mesmo cache da fila
  // de comandas) + o controle de impostos que a página já carregou.
  const refsAbertas = useMemo(
    () => [...new Set((itens ?? []).filter((i) => i.status === "PENDENTE" || i.status === "ERRO").flatMap((i) => [i.saleRef, ...i.partes.map((p) => p.saleRef)]).filter(Boolean))].sort(),
    [itens],
  );
  const emissoesDasLinhas = useQuery({ queryKey: ["nfse-das-comandas-do-lote", refsAbertas.join("|")], queryFn: () => listRemoteNfseDasComandas(refsAbertas), enabled: ligada && refsAbertas.length > 0, staleTime: 30_000 });
  const notasComPartes = useQuery({ queryKey: ["nfse-com-partes"], queryFn: listRemoteNotasComPartes, enabled: ligada, staleTime: 30_000 });
  const foraDoLote = useMemo<Record<string, NotaForaDoLote>>(() => {
    const fontes = { invoices, emissoes: [...(emissoesDasLinhas.data ?? []), ...(notasComPartes.data ?? [])] };
    const mapa: Record<string, NotaForaDoLote> = {};
    for (const item of itens ?? []) {
      const nota = notaForaDoLote(item, fontes);
      if (nota) mapa[item.id] = nota;
    }
    return mapa;
  }, [itens, invoices, emissoesDasLinhas.data, notasComPartes.data]);
  const [emitindo, setEmitindo] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  // Juntar linhas (07/10/2026): quem mexe no lote marca; com 2 ou mais, junta.
  const podeMexerNoLote = !readOnly || podeEmitir;
  const [marcados, setMarcados] = useState<string[]>([]);
  const [juncao, setJuncao] = useState<AnaliseDaJuncao | null>(null);

  const visiveis = useMemo(() => (itens ?? []).filter((i) => i.status !== "RETIRADA"), [itens]);
  const resumo = useMemo(() => resumoDoLote(itens ?? []), [itens]);
  if (!ligada || !itens || !visiveis.length) return null;

  // A comanda da linha está ligada à ficha de OUTRA pessoa (nome do tomador ≠ nome da ficha)?
  const fichaTrocada = (item: ItemDoLote) => fichaDeOutraPessoa(item.tomadorNome, item.contactRef ? prontidao[item.contactRef]?.nomeDaFicha : null);
  const recarregarProntidao = () => void queryClient.invalidateQueries({ queryKey: ["nfse-lote-prontidao"] });

  function aplicar(id: string, patch: Partial<ItemDoLote>) {
    queryClient.setQueryData<ItemDoLote[]>([...chaveDoLote], (atual) => (atual ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  /** Emite a linha e conta o que houve (o botão da linha e o "Guardar CPF e emitir"). */
  async function emitirLinha(item: ItemDoLote, cpfDaNota = "") {
    const r = await emitirItem(item, cpfDaNota);
    toast(r === "autorizada" ? "Nota autorizada." : r === "enviada" ? "Enviada; consulte em instantes." : "Não saiu — veja o erro na linha.", { tom: r === "erro" ? "erro" : "ok" });
  }

  /**
   * Emite UM item e, se a prefeitura já autorizou, registra no controle.
   * `cpfDaNota` (07/10/2026): o CPF digitado na linha vai como tomador.cpf —
   * é ele que manda na nota; sem ele, a função lê o da ficha da comanda.
   */
  async function emitirItem(item: ItemDoLote, cpfDaNota = ""): Promise<"autorizada" | "enviada" | "erro"> {
    // Segunda chave (07/10/2026): sem a permissão, nada vai à prefeitura nem muda a linha.
    if (!podeEmitir) {
      toast(avisoQuemEmiteNota, { tom: "atencao" });
      return "erro";
    }
    // Nota no nome de X com a ficha de Y: sem o CPF desta nota, sairia com o CPF de Y.
    if (!cpfDaNota && fichaTrocada(item)) {
      toast(`A nota de ${item.tomadorNome} está ligada à ficha de outra pessoa: digite o CPF na linha ("só nesta nota").`, { tom: "atencao", duracaoMs: 9000 });
      return "erro";
    }
    // Já saiu por outra tela: emitir de novo seria a segunda nota da mesma comanda.
    if (foraDoLote[item.id]) {
      toast(fraseDaNotaForaDoLote(foraDoLote[item.id]), { tom: "atencao" });
      return "erro";
    }
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
        tomador: { nome: item.tomadorNome, ...(cpfDaNota ? { cpf: cpfDaNota } : {}) },
        // As partes de OUTRAS comandas (o filho junto da mãe, ou o sinal pago
        // antes) vão em `juntar`, com o valor de cada parte (07/10/2026). Antes
        // iam como `sinais`, e o servidor recusa sinal de outro paciente. Ele
        // confere cada uma: existe, não tem nota e o valor cabe na comanda.
        juntar: juntarDoItem(item),
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
        recarregarControle();
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
        recarregarControle();
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
    if (!podeEmitir) return toast(avisoQuemEmiteNota, { tom: "atencao" });
    // Fora do "todas" (07/10/2026): a que já saiu por outra tela e a ligada à
    // ficha de outra pessoa (sairia com o CPF errado — essa vai pela linha).
    const fila = emitiveis;
    if (!fila.length) return;
    const deFora = pendentes.length - fila.length;
    if (!window.confirm(`Emitir ${fila.length} nota${fila.length > 1 ? "s" : ""} na prefeitura agora, no total de ${moneyFin(fila.reduce((s, i) => s + i.valor, 0))}?${deFora ? ` ${deFora} ficam de fora: a nota sai no nome de outra pessoa que não a da ficha — emita pela linha, com o CPF.` : ""} Depois de emitida, nota só sai com cancelamento.`)) return;
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

  // Abertas de verdade: a que já tem nota por outra tela não conta como "para emitir".
  const pendentes = visiveis.filter((i) => (i.status === "PENDENTE" || i.status === "ERRO") && !foraDoLote[i.id]);
  const emitiveis = pendentes.filter((i) => !fichaTrocada(i));
  const semCpf = pendentes.filter((i) => !(i.contactRef && prontidao[i.contactRef]?.temCpf)).length;
  const semEmail = pendentes.filter((i) => !(i.contactRef && prontidao[i.contactRef]?.temEmail)).length;
  // Os lotes, do mais novo ao mais velho (a lista já vem nessa ordem).
  const lotes = [...new Set(visiveis.map((i) => i.lote))];
  const mesDoLote = (lote: string) => lote.split("-").reverse().join("/");
  // Só entra na junção o que ainda não foi à prefeitura.
  const marcaveis = new Set(pendentes.map((i) => i.id));
  const selecionados = marcados.filter((id) => marcaveis.has(id));
  const valorSelecionado = visiveis.filter((i) => selecionados.includes(i.id)).reduce((s, i) => s + i.valor, 0);
  const alternar = (id: string) => setMarcados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  // 08/10/2026: âncora para o "Completar" de Avisos (nota sem CPF) cair aqui.
  // Sem overflow-hidden na folha: a barra de juntar gruda embaixo enquanto a lista rola.
  return (
    <BlocoFolha as="section" id="lote-de-notas" aria-labelledby="lote-de-notas-titulo" className="scroll-mt-24">
      <TituloDoBloco
        id="lote-de-notas-titulo"
        titulo={`Lote de notas conferido · ${lotes.map(mesDoLote).join(" e ")}`}
        ajuda={resumo.frase}
      />
      {pendentes.length ? (
        <p className="border-t border-fio px-6 py-3 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">
          <span className={semCpf ? "font-semibold text-atencao" : undefined}>
            {semCpf ? `${semCpf} ${semCpf === 1 ? "paciente ainda sem CPF na ficha (a nota dele não sai até guardar o CPF)" : "pacientes ainda sem CPF na ficha (a nota deles não sai até guardar o CPF)"}` : "Todos com CPF na ficha"}
          </span>
          {" · "}
          {semEmail ? `${semEmail} sem e-mail (a nota não será enviada por e-mail)` : "todos com e-mail"}
          . A função lê CPF e e-mail da ficha na hora de emitir: preencha antes de clicar.
        </p>
      ) : null}
      {podeMexerNoLote && pendentes.length > 1 ? (
        <p className="border-t border-fio px-6 py-3 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">
          Para juntar duas notas numa só (mãe e filho, por exemplo), marque as linhas e toque em “Juntar em uma nota”.
        </p>
      ) : null}
      <div className="mobile-scrollbar-none overflow-x-auto border-t border-fio">
        <table className={cn(tabela.tabela, "min-w-[880px]")}>
          <caption className="sr-only">Notas do lote</caption>
          <thead>
            <tr>
              {podeMexerNoLote ? (
                <th scope="col" className={cn(tabela.th, "w-10 pr-0")}>
                  <span className="sr-only">Juntar</span>
                </th>
              ) : null}
              <th scope="col" className={cn(tabela.th, "w-10")}>#</th>
              <th scope="col" className={tabela.th}>Paciente</th>
              <th scope="col" className={tabela.th}>Comanda</th>
              <th scope="col" className={tabela.th}>Nota</th>
              <th scope="col" className={tabela.thNum}>Valor</th>
              <th scope="col" className={tabela.th}>Ficha</th>
              <th scope="col" className={tabela.th}>Situação</th>
              <th scope="col" className={tabela.th}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          {lotes.map((loteDoGrupo) => (
            <tbody key={loteDoGrupo}>
              {lotes.length > 1 ? (
                <tr>
                  <td colSpan={podeMexerNoLote ? 9 : 8} className="border-b border-fio bg-saber px-4 py-2 text-[13px] font-bold leading-5 text-tinta">
                    Lote de {mesDoLote(loteDoGrupo)} · <span className="font-medium text-tinta-2">{resumoDoLote((itens ?? []).filter((i) => i.lote === loteDoGrupo)).frase}</span>
                  </td>
                </tr>
              ) : null}
              {visiveis.filter((i) => i.lote === loteDoGrupo).map((item) => {
              const p = item.contactRef ? prontidao[item.contactRef] : undefined;
              const fora = foraDoLote[item.id];
              // Linha aberta de verdade: ainda sem nota em lugar nenhum.
              const aberta = (item.status === "PENDENTE" || item.status === "ERRO") && !fora;
              // O botão direto quando a ficha certa tem CPF (ou ainda não se sabe — o
              // servidor confere); sem CPF, o caminho é o campo da linha.
              const pronta = aberta && !fichaTrocada(item) && p?.temCpf !== false;
              // O erro "falta CPF" da tentativa anterior deixa de valer quando o CPF foi guardado.
              const erroDeCpfResolvido = item.status === "ERRO" && Boolean(p?.temCpf) && /cpf/i.test(item.erro ?? "");
              return (
                <tr key={item.id} className={cn(tabela.linha, "align-top")}>
                  {podeMexerNoLote ? (
                    <td className={cn(tabela.td, "pr-0")}>
                      {marcaveis.has(item.id) ? (
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 cursor-pointer accent-musgo disabled:cursor-not-allowed disabled:opacity-40"
                          checked={selecionados.includes(item.id)}
                          disabled={emitindo !== null || rodando}
                          onChange={() => alternar(item.id)}
                          aria-label={`Marcar a nota de ${item.tomadorNome} para juntar`}
                        />
                      ) : null}
                    </td>
                  ) : null}
                  <td className={cn(tabela.td, "tabular-nums text-tinta-2")}>{item.ordem}</td>
                  <td className={tabela.td}>
                    <p className="font-bold text-tinta">{item.tomadorNome}</p>
                    {item.observacao ? <p className="text-[13px] text-tinta-2">{item.observacao}</p> : null}
                  </td>
                  <td className={cn(tabela.td, "whitespace-nowrap tabular-nums")}>{dataBR(item.dia)}{item.partes.length > 1 ? ` (+${item.partes.length - 1})` : ""}</td>
                  <td className={tabela.td}>
                    {item.tipo === "UNIFICADA" ? "unificada, tratamento" : rotuloDoTipoDeNota(item.tipo)}
                    <p className="text-[13px] text-tinta-2">{item.pagamentoTexto.toLowerCase()}</p>
                  </td>
                  <td className={cn(tabela.tdNum, "font-bold")}>{moneyFin(item.valor)}</td>
                  <td className={cn(tabela.td, "text-[13px]", aberta ? "min-w-[14rem]" : "whitespace-nowrap")}>
                    {aberta ? (
                      // O CPF na própria linha (07/10/2026): o mesmo campo do Lançar Dia.
                      <CpfDaNotaInline
                        contactRef={item.contactRef}
                        nomeDaNota={item.tomadorNome}
                        nomeDaFicha={p?.nomeDaFicha ?? null}
                        emitir={podeEmitir ? ({ cpf }) => emitirLinha(item, cpf) : undefined}
                        onGuardado={recarregarProntidao}
                        desabilitado={emitindo !== null || rodando}
                      />
                    ) : (
                      <span className={cn("font-semibold", p?.temCpf ? "text-ok" : "text-atencao")}>CPF {p?.temCpf ? "✓" : "—"}</span>
                    )}
                    <span className={cn("mt-1 block font-semibold", p?.temEmail ? "text-ok" : "text-atencao")}>e-mail {p?.temEmail ? "✓" : "— (a nota não vai por e-mail)"}</span>
                  </td>
                  <td className={cn(tabela.td, "text-[13px]")}>
                    {fora ? (
                      <span className="inline-flex items-start gap-1.5 font-semibold text-ok"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {fraseDaNotaForaDoLote(fora)}</span>
                    ) : item.status === "AUTORIZADA" ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-ok"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> nº {item.numero}</span>
                    ) : item.status === "ENVIADA" ? (
                      <span className="font-semibold text-petroleo">aguardando a prefeitura</span>
                    ) : erroDeCpfResolvido ? (
                      <span className="text-tinta-2">CPF guardado: pronta para emitir</span>
                    ) : item.status === "ERRO" ? (
                      <span className="inline-flex items-start gap-1.5 font-semibold text-erro"><XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {item.erro}</span>
                    ) : emitindo === item.id ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-tinta"><Giro className="h-3.5 w-3.5" /> emitindo…</span>
                    ) : (
                      <span className="text-tinta-2">para emitir</span>
                    )}
                  </td>
                  <td className={cn(tabela.td, "whitespace-nowrap text-right")}>
                    <span className="inline-flex flex-wrap items-center justify-end gap-1">
                      {(!readOnly || podeEmitir) && item.status === "ENVIADA" ? (
                        <Botao variante="secundario" tamanho="pq" disabled={emitindo !== null} onClick={() => void consultarItem(item)}>Consultar</Botao>
                      ) : null}
                      {podeEmitir && (item.status === "PENDENTE" || item.status === "ERRO") && pronta ? (
                        <Botao variante="suave" tamanho="pq" disabled={emitindo !== null || rodando} icone={<FileCheck2 className="h-4 w-4" aria-hidden="true" />} onClick={() => void emitirLinha(item)}>
                          Emitir
                        </Botao>
                      ) : null}
                      {!readOnly && (item.status === "PENDENTE" || item.status === "ERRO") ? (
                        <Botao variante="fantasma" tamanho="pq" disabled={emitindo !== null || rodando} onClick={() => void retirar(item)}>Tirar</Botao>
                      ) : null}
                    </span>
                  </td>
                </tr>
              );
              })}
            </tbody>
          ))}
        </table>
      </div>
      {podeMexerNoLote && selecionados.length === 1 ? (
        <p className="border-t border-fio px-6 py-3 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">1 nota marcada. Marque mais uma para juntar.</p>
      ) : null}
      {podeMexerNoLote && selecionados.length > 1 ? (
        <div className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-10 mx-4 my-4 flex flex-wrap items-center justify-between gap-3 rounded-bloco border border-musgo bg-folha px-4 py-3 shadow-flutua lg:bottom-3">
          <p className="text-sm font-bold leading-5 text-tinta">
            {selecionados.length} notas · <span className="tabular-nums">{moneyFin(valorSelecionado)}</span>
            <span className="block text-[13px] font-medium text-tinta-2">viram uma nota só, no nome de um dos pacientes</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Botao variante="fantasma" onClick={() => setMarcados([])}>Desmarcar</Botao>
            <Botao
              variante="primario"
              disabled={rodando || emitindo !== null}
              icone={<Combine className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setJuncao(analisarItensDoLote({ itens: itens ?? [], ids: selecionados }))}
            >
              Juntar em uma nota
            </Botao>
          </div>
        </div>
      ) : null}
      {podeEmitir && pendentes.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-fio px-6 py-4 max-md:px-4">
          <BotaoDecisao
            tipo="aprovar"
            rotulo={rodando ? "Emitindo…" : `Emitir as ${emitiveis.length} notas`}
            valor={rodando ? undefined : emitiveis.reduce((s, i) => s + i.valor, 0)}
            carregando={rodando}
            disabled={rodando || emitindo !== null || !emitiveis.length}
            onClick={() => void emitirTodas()}
          />
          <span className="text-[13px] font-medium leading-5 text-tinta-2">Uma por vez, na prefeitura. Cada autorizada entra no controle abaixo com o número.</span>
        </div>
      ) : pendentes.length ? (
        <p className="border-t border-fio px-6 py-4 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">{avisoQuemEmiteNota}</p>
      ) : null}
      {juncao ? <JuntarNotasDialog modo="lote" analise={juncao} onFechar={() => setJuncao(null)} onPronto={() => setMarcados([])} /> : null}
    </BlocoFolha>
  );
}
