// PEDIDOS DE COMPRA POR SETOR — a tela /compras (06/10/2026).
//
// Lucas: *"cada setor ou cada usuário vai fazer o seu pedido de compra e eu
// vou autorizar e levar para frente"*. É o fluxograma POP-COMP-001 na tela:
//   PEDIR (o setor) → APROVAR (Gestor Financeiro) → COMPRAR (Financeiro) →
//   RECEBER (o setor; a entrada no estoque é na hora).
//
// Cada pessoa vê o que é dela: quem aprova tem "Esperam sua decisão" no topo
// (urgente primeiro, depois o mais antigo); o financeiro completo tem
// "Aprovados — falta comprar"; o setor tem os pedidos dele, com o próximo
// passo em cada um. A regra de quem vê qual botão mora em pedidoTela.ts e a
// máquina de estados em comprasData.ts (a mesma do banco) — a tela só desenha.
//
// Funciona sem banco (prévia): useCompras guarda tudo no aparelho, com
// pedidos de exemplo de vários setores em cada situação do fluxo.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { ClipboardCheck, Inbox, Plus, RefreshCw, ShoppingCart, Workflow } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { confirmar, perguntar, toast } from "@/components/ui/avisos";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { AvisoSoVe, FRASE_SO_VE, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { isCoordenacao } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { useEstoque } from "@/features/estoque/useEstoque";
import { fluxogramas } from "@/features/pops/popsData";
import {
  LIMITES_DO_PEDIDO,
  ehDoSetor,
  nomeDoSetor,
  numeroDoPedido,
  novoIdDePedido,
  rascunhoDoPedido,
  setoresParaPedir,
  type FiltroPedidos,
  type PedidoCompra,
  type RascunhoPedido,
} from "./comprasData";
import { useCompras } from "./useCompras";
import { NovoPedidoForm, type InicioDoFormulario } from "./NovoPedidoForm";
import { PedidoDaLista } from "./PedidoDaLista";
import { ReceberPedidoGaveta } from "./ReceberPedidoForm";
import { RegistrarCompraGaveta } from "./RegistrarCompraForm";
import {
  acoesDoPedido,
  contadoresDaTela,
  dividirATela,
  fraseDoTopo,
  frasesDaListaVazia,
  lerPedidoDaUrl,
  papeisNaTela,
} from "./pedidoTela";

/** O fluxograma do processo (POP-COMP-001), o mesmo de POPs & Fluxos. */
const FLUXOGRAMA = fluxogramas.find((documento) => documento.id === "pedido-compra-por-setor");

/** Aprovar é um toque; durante estes segundos dá para desfazer (só depois grava). */
const JANELA_DESFAZER_MS = 5000;

// idNovo (07/10/2026): o id (cped-…) do pedido NOVO nasce quando a gaveta abre
// e vale para todas as tentativas de envio — a resposta perdida na rede não
// vira um segundo pedido igual. Abrir a gaveta de novo gera outro.
type EstadoDoFormulario = { chave: number; aberto: boolean; inicio: InicioDoFormulario; existente: PedidoCompra | null; idNovo: string };

export function PedidosDeCompraPage() {
  const { pessoa } = useAuth();
  const nivel = useNivelDaTela("compras");
  const compras = useCompras();
  const estoque = useEstoque();
  const hoje = todayISO();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const papeis = papeisNaTela(pessoa);
  const setores = useMemo(() => setoresParaPedir(pessoa?.cargo, isCoordenacao(pessoa?.cargo)), [pessoa?.cargo]);
  const podePedir = nivel.podeEditar && setores.length > 0;

  const [filtro, setFiltro] = useState<FiltroPedidos>("TODOS");
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const [destaque, setDestaque] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<EstadoDoFormulario>({ chave: 0, aberto: false, inicio: { setor: "" }, existente: null, idNovo: "" });
  const [paraComprarId, setParaComprarId] = useState<string | null>(null);
  const [paraReceberId, setParaReceberId] = useState<string | null>(null);
  const [acaoDaUrl, setAcaoDaUrl] = useState<{ id: string; acao: "receber" | "ajustar" } | null>(null);

  const pedidos = compras.pedidos;
  const porId = useMemo(() => new Map(pedidos.map((pedido) => [pedido.id, pedido])), [pedidos]);
  const divisao = useMemo(() => dividirATela(pedidos, pessoa, filtro, hoje), [pedidos, pessoa, filtro, hoje]);
  const contadores = useMemo(() => contadoresDaTela(pedidos, pessoa, hoje), [pedidos, pessoa, hoje]);
  const frase = useMemo(() => fraseDoTopo(pedidos, pessoa, hoje), [pedidos, pessoa, hoje]);

  function abrirFormulario(inicio: InicioDoFormulario, existente: PedidoCompra | null = null) {
    if (!podePedir && !existente) {
      toast(nivel.podeEditar ? "Você não cuida de nenhum setor para pedir compras." : FRASE_SO_VE, { tom: "atencao", duracaoMs: 6000 });
      return;
    }
    setFormulario((atual) => ({ chave: atual.chave + 1, aberto: true, inicio, existente, idNovo: novoIdDePedido() }));
  }
  const fecharFormulario = () => setFormulario((atual) => ({ ...atual, aberto: false }));

  // ---- O que a URL pede: ?novo=1&setor=…&itens=… (Estoque), ?filtro=… (⌘K), ?pedido=… (Fila do dia) ----
  useEffect(() => {
    const url = lerPedidoDaUrl(searchParams.toString());
    const doEstado = (location.state as { novoPedido?: { setor?: string; rascunho?: Partial<RascunhoPedido>; itens?: string[] } } | null)?.novoPedido;
    if (!url.temAlgo && !doEstado) return;
    if (url.filtro) setFiltro(url.filtro);
    if (url.pedido) {
      setDestaque(url.pedido);
      setAbertos((atual) => new Set(atual).add(url.pedido as string));
      // 07/10/2026: "Chegou? Confirmar recebimento" e "Ajustar e reenviar" do
      // Estoque e da Fila do dia abrem a gaveta certa, não só a lista.
      if (url.acao) setAcaoDaUrl({ id: url.pedido, acao: url.acao });
    }
    if (url.novo || doEstado) {
      const setorPedido = (doEstado?.setor as string | undefined) ?? url.setor ?? "";
      const setor = setores.find((opcao) => opcao === setorPedido) ?? setores[0] ?? "";
      abrirFormulario({ setor, rascunho: doEstado?.rascunho, refsDoEstoque: [...url.itens, ...(doEstado?.itens ?? [])] });
    }
    // Consumido: a URL volta limpa (recarregar a página não reabre o formulário).
    setSearchParams(new URLSearchParams(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // A ação que veio pela URL (?pedido=…&acao=receber|ajustar): abre a gaveta
  // quando o pedido chegar na lista — e só se a pessoa puder mesmo fazer aquilo.
  useEffect(() => {
    if (!acaoDaUrl) return;
    const pedido = porId.get(acaoDaUrl.id);
    if (!pedido) return;
    setAcaoDaUrl(null);
    const acoes = acoesDoPedido(pedido, pessoa, nivel.podeEditar);
    if (acaoDaUrl.acao === "receber" && acoes.receber) setParaReceberId(pedido.id);
    else if (acaoDaUrl.acao === "ajustar" && acoes.ajustar) abrirFormulario({ setor: pedido.setor, rascunho: rascunhoDoPedido(pedido) }, pedido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acaoDaUrl, porId]);

  // O pedido que veio pela URL: rola até ele quando a lista carregar.
  useEffect(() => {
    if (!destaque || !porId.has(destaque)) return;
    const id = window.setTimeout(() => document.getElementById(`pedido-${destaque}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    return () => window.clearTimeout(id);
  }, [destaque, porId]);

  // ---- Aprovar com "Desfazer" (5 s) — sem mexer no banco: a gravação só sai depois da janela ----
  const comprasRef = useRef(compras);
  comprasRef.current = compras;
  const pendentes = useRef(new Map<string, { pedido: PedidoCompra; timer: number }>());
  const [aprovando, setAprovando] = useState<Set<string>>(() => new Set());
  const montada = useRef(true);

  async function gravarAprovacao(id: string, aoSair = false) {
    const pendente = pendentes.current.get(id);
    if (!pendente) return;
    window.clearTimeout(pendente.timer);
    pendentes.current.delete(id);
    // 07/10/2026: saindo da tela (fechar a aba, F5, trocar de aba), a gravação
    // vai com keepalive — um fetch comum pode ser cancelado pelo navegador no
    // descarregamento, e o Lucas via "aprovado" com o pedido ainda aguardando.
    if (!(aoSair && comprasRef.current.decidirAoSair(pendente.pedido, "APROVAR"))) {
      await comprasRef.current.decidir(pendente.pedido, "APROVAR");
    }
    if (montada.current) {
      setAprovando((atual) => {
        const proximo = new Set(atual);
        proximo.delete(id);
        return proximo;
      });
    }
  }
  const gravarRef = useRef(gravarAprovacao);
  gravarRef.current = gravarAprovacao;

  useEffect(() => {
    montada.current = true;
    // Saiu da tela, fechou ou trocou de aba: o que estava na janela do "Desfazer" grava na hora.
    const gravarTudo = () => {
      for (const id of [...pendentes.current.keys()]) void gravarRef.current(id, true);
    };
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") gravarTudo();
    };
    window.addEventListener("pagehide", gravarTudo);
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.removeEventListener("pagehide", gravarTudo);
      document.removeEventListener("visibilitychange", aoEsconder);
      montada.current = false;
      gravarTudo();
    };
  }, []);

  function aprovar(pedido: PedidoCompra) {
    if (pendentes.current.has(pedido.id) || aprovando.has(pedido.id)) return;
    const timer = window.setTimeout(() => void gravarRef.current(pedido.id), JANELA_DESFAZER_MS);
    pendentes.current.set(pedido.id, { pedido, timer });
    setAprovando((atual) => new Set(atual).add(pedido.id));
    toast(`Pedido ${numeroDoPedido(pedido.numero)} aprovado.`, {
      tom: "ok",
      duracaoMs: JANELA_DESFAZER_MS,
      acao: { rotulo: "Desfazer", onClick: () => desfazerAprovacao(pedido.id) },
    });
  }

  function desfazerAprovacao(id: string) {
    const pendente = pendentes.current.get(id);
    if (!pendente) {
      toast("A aprovação já foi gravada. Se precisar voltar atrás, cancele o pedido.", { tom: "atencao", duracaoMs: 6000 });
      return;
    }
    window.clearTimeout(pendente.timer);
    pendentes.current.delete(id);
    setAprovando((atual) => {
      const proximo = new Set(atual);
      proximo.delete(id);
      return proximo;
    });
    toast(`Aprovação do pedido ${numeroDoPedido(pendente.pedido.numero)} desfeita.`, { tom: "info" });
  }

  async function devolverOuRecusar(pedido: PedidoCompra, decisao: "DEVOLVER" | "RECUSAR") {
    const devolver = decisao === "DEVOLVER";
    const motivo = await perguntar(`${devolver ? "Devolver" : "Recusar"} o pedido ${numeroDoPedido(pedido.numero)}?`, {
      corpo: devolver
        ? "O pedido volta para quem pediu, com o que mudar. A pessoa corrige e reenvia."
        : "O pedido para aqui. Quem pediu vê a recusa e o motivo.",
      rotulo: devolver ? "O que mudar" : "Motivo da recusa",
      placeholder: devolver ? "Ex.: mande o link de 2 fornecedores para comparar o preço." : "Ex.: já temos o suficiente até o fim do mês.",
      multilinha: true,
      confirmar: devolver ? "Devolver ao setor" : "Recusar o pedido",
    });
    if (motivo === null) return;
    if (motivo.trim().length < LIMITES_DO_PEDIDO.motivoMin) {
      toast(`Diga o motivo para ${devolver ? "devolver" : "recusar"}: pelo menos 3 letras.`, { tom: "atencao", duracaoMs: 6000 });
      return;
    }
    const gravado = await compras.decidir(pedido, decisao, motivo.trim().slice(0, LIMITES_DO_PEDIDO.nota));
    if (gravado) toast(`Pedido ${numeroDoPedido(pedido.numero)} ${devolver ? "devolvido ao setor" : "recusado"}.`, { tom: "ok" });
  }

  async function cancelar(pedido: PedidoCompra) {
    // 07/10/2026: cancelar pedido de OUTRO setor (quem aprova, a coordenação)
    // pede o motivo, como o Recusar — o setor vê "Cancelado por <nome>: <motivo>".
    if (!ehDoSetor(pessoa, pedido)) {
      const motivo = await perguntar(`Cancelar o pedido ${numeroDoPedido(pedido.numero)} de ${nomeDoSetor(pedido.setor)}?`, {
        corpo: "Ele sai da fila e não volta. O setor vê que foi você e o motivo.",
        rotulo: "Motivo do cancelamento",
        placeholder: "Ex.: o fornecedor parou de vender; vamos comprar junto com o pedido da semana que vem.",
        multilinha: true,
        confirmar: "Cancelar o pedido",
      });
      if (motivo === null) return;
      if (motivo.trim().length < LIMITES_DO_PEDIDO.motivoMin) {
        toast("Diga o motivo para cancelar o pedido de outro setor: pelo menos 3 letras.", { tom: "atencao", duracaoMs: 6000 });
        return;
      }
      const gravado = await compras.cancelar(pedido, motivo.trim().slice(0, LIMITES_DO_PEDIDO.nota));
      if (gravado) toast(`Pedido ${numeroDoPedido(pedido.numero)} cancelado.`, { tom: "ok" });
      return;
    }
    const certeza = await confirmar(`Cancelar o pedido ${numeroDoPedido(pedido.numero)}?`, {
      corpo: "Ele sai da fila e não volta. Se ainda precisar, faça um pedido novo.",
      confirmar: "Cancelar o pedido",
      cancelar: "Voltar",
      destrutivo: true,
    });
    if (!certeza) return;
    const gravado = await compras.cancelar(pedido);
    if (gravado) toast(`Pedido ${numeroDoPedido(pedido.numero)} cancelado.`, { tom: "ok" });
  }

  function alternar(id: string) {
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function linha(pedido: PedidoCompra) {
    const acoes = acoesDoPedido(pedido, pessoa, nivel.podeEditar);
    return (
      <PedidoDaLista
        key={pedido.id}
        pedido={pedido}
        variante={acoes.decidir ? "decisao" : "lista"}
        acoes={acoes}
        hojeISO={hoje}
        estoqueItens={estoque.items}
        moves={estoque.moves}
        compras={estoque.compras}
        pedidos={pedidos}
        aberto={abertos.has(pedido.id)}
        onAlternar={() => alternar(pedido.id)}
        aprovando={aprovando.has(pedido.id)}
        ocupado={compras.salvando}
        destaque={destaque === pedido.id}
        verCompraNoFinanceiro={papeis.comprador}
        handlers={{
          onAprovar: () => aprovar(pedido),
          onDevolver: () => void devolverOuRecusar(pedido, "DEVOLVER"),
          onRecusar: () => void devolverOuRecusar(pedido, "RECUSAR"),
          onDesfazerAprovacao: () => desfazerAprovacao(pedido.id),
          onComprar: () => setParaComprarId(pedido.id),
          onReceber: () => setParaReceberId(pedido.id),
          onAjustar: () => abrirFormulario({ setor: pedido.setor, rascunho: rascunhoDoPedido(pedido) }, pedido),
          onCancelar: () => void cancelar(pedido),
        }}
      />
    );
  }

  const novoPedido = () => abrirFormulario({ setor: setores[0] ?? "" });

  // A faixa de contadores: cada um filtra a lista (tocar de novo volta para tudo).
  const faixa: { filtro: FiltroPedidos; numero: number; rotulo: string; alerta?: boolean }[] = [
    { filtro: "AGUARDANDO", numero: contadores.aguardando, rotulo: "Aguardando aprovação", alerta: contadores.atrasados > 0 },
    { filtro: "APROVADOS", numero: contadores.aprovados, rotulo: "Aprovados para comprar" },
    { filtro: "A_CAMINHO", numero: contadores.aCaminho, rotulo: "A caminho" },
    { filtro: "RECEBIDOS_MES", numero: contadores.recebidosNoMes, rotulo: "Recebidos no mês" },
    ...(contadores.devolvidos ? [{ filtro: "DEVOLVIDOS" as FiltroPedidos, numero: contadores.devolvidos, rotulo: "Devolvidos para ajuste" }] : []),
  ];

  const pedidoParaComprar = paraComprarId ? (porId.get(paraComprarId) ?? null) : null;
  const pedidoParaReceber = paraReceberId ? (porId.get(paraReceberId) ?? null) : null;
  const vazio = frasesDaListaVazia(filtro, podePedir);
  const nadaNaTela = !divisao.decisao.length && !divisao.comprar.length && !divisao.lista.length;

  return (
    <AccessGate allowed={() => false} label="Pedidos de compra" module="compras">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Compras e estoque</p>
            <h1 className="mt-1 text-3xl leading-tight text-brand-musgo sm:text-4xl">Pedidos de compra</h1>
            <p className="mt-2 text-base leading-6 text-brand-tinta/85">{compras.carregando ? "Carregando os pedidos…" : frase}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            {FLUXOGRAMA ? (
              <Button asChild variant="outline" className="h-12 sm:h-10">
                <a href={FLUXOGRAMA.assetPath} target="_blank" rel="noreferrer" title="Abre o fluxograma POP-COMP-001 em outra aba">
                  <Workflow className="mr-2 h-4 w-4" aria-hidden="true" />
                  Como funciona
                </a>
              </Button>
            ) : null}
            {podePedir ? (
              <Button type="button" onClick={novoPedido} className={cn("h-12 sm:h-10", !FLUXOGRAMA && "col-span-2")}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Novo pedido
              </Button>
            ) : null}
          </div>
        </header>

        <AvisoSoVe soVe={nivel.soVe} />

        {/* Faixa de contadores (clicáveis). */}
        <nav aria-label="Filtrar os pedidos" className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))]">
          {faixa.map((celula) => {
            const ativo = filtro === celula.filtro;
            return (
              <button
                key={celula.filtro}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(ativo ? "TODOS" : celula.filtro)}
                className={cn(
                  "ios-pressable flex min-h-[4.5rem] flex-col justify-between rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo
                    ? "border-brand-musgo bg-brand-musgo text-brand-papel shadow-sm"
                    : "border-brand-oliva/15 bg-white/65 text-brand-tinta hover:bg-white/90",
                )}
              >
                <span className={cn("text-2xl font-semibold leading-none tabular-nums", !ativo && celula.alerta && "text-amber-800")}>{celula.numero}</span>
                <span className={cn("mt-2 text-sm leading-tight", ativo ? "text-brand-papel/90" : "text-muted-foreground")}>{celula.rotulo}</span>
              </button>
            );
          })}
        </nav>

        {filtro !== "TODOS" ? (
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Mostrando só: <span className="font-semibold text-brand-tinta">{divisao.tituloDaLista}</span>
            </span>
            <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => setFiltro("TODOS")}>
              Ver todos os pedidos
            </Button>
          </div>
        ) : null}

        {compras.erroDeLeitura ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span>{compras.erroDeLeitura}</span>
            <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={compras.recarregar}>
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Tentar de novo
            </Button>
          </div>
        ) : null}

        {compras.carregando ? (
          <Bloco titulo="Carregando os pedidos" icone={<Inbox className="h-5 w-5" aria-hidden="true" />}>
            <ul className="divide-y divide-brand-oliva/10" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="grid gap-2 px-4 py-4 sm:px-5">
                  <span className="h-3.5 w-40 rounded bg-brand-oliva/12 motion-safe:animate-pulse" />
                  <span className="h-4 w-3/4 rounded bg-brand-oliva/12 motion-safe:animate-pulse" />
                  <span className="h-3.5 w-1/2 rounded bg-brand-oliva/10 motion-safe:animate-pulse" />
                </li>
              ))}
            </ul>
          </Bloco>
        ) : (
          <>
            {divisao.decisao.length ? (
              <Bloco
                titulo="Esperam sua decisão"
                contagem={divisao.decisao.length}
                icone={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />}
                descricao="Urgente primeiro, depois o mais antigo. Prazo: 1 dia útil; urgente, no mesmo dia."
                destaque
              >
                <ul className="divide-y divide-brand-oliva/10">{divisao.decisao.map(linha)}</ul>
              </Bloco>
            ) : null}

            {divisao.comprar.length ? (
              <Bloco
                titulo="Aprovados — falta comprar"
                contagem={divisao.comprar.length}
                icone={<ShoppingCart className="h-5 w-5" aria-hidden="true" />}
                descricao="Cote, compre e registre aqui: vira compra no Financeiro e o setor vê “a caminho”."
              >
                <ul className="divide-y divide-brand-oliva/10">{divisao.comprar.map(linha)}</ul>
              </Bloco>
            ) : null}

            {divisao.lista.length ? (
              <Bloco titulo={divisao.tituloDaLista} contagem={divisao.lista.length} icone={<Inbox className="h-5 w-5" aria-hidden="true" />}>
                <ul className="divide-y divide-brand-oliva/10">{divisao.lista.map(linha)}</ul>
              </Bloco>
            ) : nadaNaTela || filtro !== "TODOS" ? (
              <Card className="px-6 py-10 text-center">
                <Inbox className="mx-auto h-8 w-8 text-brand-oliva" aria-hidden="true" />
                <p className="mt-3 text-lg font-semibold text-brand-musgo">{vazio.titulo}</p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{vazio.texto}</p>
                {podePedir && (filtro === "TODOS" || filtro === "AGUARDANDO") ? (
                  <Button type="button" onClick={novoPedido} className="mt-5 h-12 sm:h-10">
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Novo pedido
                  </Button>
                ) : null}
              </Card>
            ) : null}
          </>
        )}

        {compras.ehLocal ? (
          <p className="text-center text-sm text-muted-foreground">
            Modo prévia: os pedidos são de exemplo e ficam só neste aparelho.
          </p>
        ) : null}
      </div>

      <NovoPedidoForm
        key={formulario.chave}
        aberta={formulario.aberto}
        onFechar={fecharFormulario}
        setores={formulario.existente ? [formulario.existente.setor] : setores}
        inicio={formulario.inicio}
        existente={formulario.existente}
        estoqueItens={estoque.items}
        moves={estoque.moves}
        pedidos={pedidos}
        salvando={compras.salvando}
        compras={estoque.compras}
        onEnviar={(rascunho, existente) =>
          compras.enviar(rascunho, existente, { itensDoEstoque: estoque.items.length ? estoque.items : undefined, id: formulario.idNovo || undefined })
        }
      />

      {papeis.comprador ? (
        <RegistrarCompraGaveta
          pedido={pedidoParaComprar}
          onFechar={() => setParaComprarId(null)}
          onRegistrada={(pedido, compra) => {
            compras.aposRegistrarCompra(pedido, compra);
          }}
        />
      ) : null}

      <ReceberPedidoGaveta
        pedido={pedidoParaReceber}
        salvando={compras.salvando}
        onFechar={() => setParaReceberId(null)}
        onReceber={(pedido, recebimento) => compras.receber(pedido, recebimento, { itensDoEstoque: estoque.items.length ? estoque.items : undefined })}
      />
    </AccessGate>
  );
}

/** Um bloco da tela: título com a contagem e a lista de pedidos dentro (lista, não cartões soltos). */
function Bloco({
  titulo,
  contagem,
  descricao,
  icone,
  destaque = false,
  children,
}: {
  titulo: string;
  contagem?: number;
  descricao?: string;
  icone?: ReactNode;
  destaque?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden", destaque && "border-brand-dourado/50")}>
      <div className={cn("flex items-start gap-3 border-b border-brand-oliva/12 px-4 py-4 sm:px-5", destaque && "bg-brand-creme/40")}>
        {icone ? <span className="mt-0.5 text-brand-musgo">{icone}</span> : null}
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight text-brand-musgo">
            {titulo}
            {contagem !== undefined ? (
              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-brand-musgo px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-papel">{contagem}</span>
            ) : null}
          </h2>
          {descricao ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{descricao}</p> : null}
        </div>
      </div>
      {children}
    </Card>
  );
}

export default PedidosDeCompraPage;
