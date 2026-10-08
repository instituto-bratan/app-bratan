// PEDIDOS DE COMPRA POR SETOR — a tela /compras (06/10/2026).
//
// Lucas: *"cada setor ou cada usuário vai fazer o seu pedido de compra e eu
// vou autorizar e levar para frente"*. É o fluxograma POP-COMP-001 na tela:
//   PEDIR (o setor) → APROVAR (Gestor Financeiro) → COMPRAR (Financeiro) →
//   RECEBER (o setor; a entrada no estoque é na hora).
//
// Cada pessoa vê o que é dela: quem aprova tem "Esperam sua decisão" no topo
// (urgente primeiro, depois o mais antigo); o financeiro completo tem
// "Falta comprar"; o setor tem os pedidos dele, com o próximo passo em cada
// um. A regra de quem vê qual botão mora em pedidoTela.ts e a máquina de
// estados em comprasData.ts (a mesma do banco) — a tela só desenha.
//
// FORMA NOVA (08/10/2026, redesenho Papel & Musgo aprovado — imagem 02): um
// cabeçalho só, com a frase do fluxo; leituras em texto que filtram; a caixa de
// decisão em folha (Aprovar na linha, com Desfazer; "Aprovar os N" sem teto de
// valor — decisão do Lucas); os outros pedidos numa tabela Nº · Pedido ·
// Situação · Valor; e o pedido aberto num painel ao lado (no monitor) ou numa
// gaveta (abaixo de 1280 px), com a barra de decisão Aprovar (valor) → Devolver
// … Recusar. Os dados, os botões, as permissões e a URL são os de antes.
//
// Funciona sem banco (prévia): useCompras guarda tudo no aparelho, com
// pedidos de exemplo de vários setores em cada situação do fluxo.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Plus, RefreshCw } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { confirmar, perguntar, toast } from "@/components/ui/avisos";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, FraseDoFluxo, formatarReais } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { FRASE_SO_VE, useNivelDaTela } from "@/hooks/useNivelDaTela";
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
import { CabecaDaTabela, LinhaDaTabela, LinhaDoPedido, type AcoesDaLinha } from "./PedidoDaLista";
import { PainelDoPedidoAoLado, PainelDoPedidoNaGaveta, type PosicaoNoPainel } from "./PainelDoPedido";
import { Leitura, Recado, useMidia } from "./pecas";
import { ReceberPedidoGaveta } from "./ReceberPedidoForm";
import { RegistrarCompraGaveta } from "./RegistrarCompraForm";
import {
  acoesDoPedido,
  contadoresDaTela,
  dividirATela,
  fraseDoTopo,
  frasesDaListaVazia,
  lerPedidoDaUrl,
  loteParaAprovar,
  papeisNaTela,
  valorDoPedido,
} from "./pedidoTela";

/** O fluxograma do processo (POP-COMP-001), o mesmo de POPs & Fluxos. */
const FLUXOGRAMA = fluxogramas.find((documento) => documento.id === "pedido-compra-por-setor");

/** Aprovar é um toque; durante estes segundos dá para desfazer (só depois grava). */
const JANELA_DESFAZER_MS = 5000;

/** A partir daqui o pedido aberto fica num painel AO LADO da lista; abaixo, sobe como gaveta. */
const TELA_LARGA = "(min-width: 1280px)";

// idNovo (07/10/2026): o id (cped-…) do pedido NOVO nasce quando a gaveta abre
// e vale para todas as tentativas de envio — a resposta perdida na rede não
// vira um segundo pedido igual. Abrir a gaveta de novo gera outro.
type EstadoDoFormulario = { chave: number; aberto: boolean; inicio: InicioDoFormulario; existente: PedidoCompra | null; idNovo: string };

const somaDosValores = (lista: PedidoCompra[]) => Math.round(lista.reduce((soma, pedido) => soma + valorDoPedido(pedido).valor, 0) * 100) / 100;
const contagem = (n: number) => `${n} ${n === 1 ? "pedido" : "pedidos"}`;

export function PedidosDeCompraPage() {
  const { pessoa } = useAuth();
  const nivel = useNivelDaTela("compras");
  const compras = useCompras();
  const estoque = useEstoque();
  const hoje = todayISO();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const largo = useMidia(TELA_LARGA);

  const papeis = papeisNaTela(pessoa);
  const setores = useMemo(() => setoresParaPedir(pessoa?.cargo, isCoordenacao(pessoa?.cargo)), [pessoa?.cargo]);
  const podePedir = nivel.podeEditar && setores.length > 0;

  const [filtro, setFiltro] = useState<FiltroPedidos>("TODOS");
  // O pedido aberto no painel (ou na gaveta). No monitor, sem nada escolhido, o
  // painel mostra o primeiro da caixa de decisão — até a pessoa fechar.
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [fechouPainel, setFechouPainel] = useState(false);
  const [focarPainel, setFocarPainel] = useState(0);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<EstadoDoFormulario>({ chave: 0, aberto: false, inicio: { setor: "" }, existente: null, idNovo: "" });
  const [paraComprarId, setParaComprarId] = useState<string | null>(null);
  const [paraReceberId, setParaReceberId] = useState<string | null>(null);
  const [acaoDaUrl, setAcaoDaUrl] = useState<{ id: string; acao: "receber" | "ajustar" } | null>(null);

  const pedidos = compras.pedidos;
  const porId = useMemo(() => new Map(pedidos.map((pedido) => [pedido.id, pedido])), [pedidos]);
  const divisao = useMemo(() => dividirATela(pedidos, pessoa, filtro, hoje), [pedidos, pessoa, filtro, hoje]);
  const totalDaTela = useMemo(() => {
    const tudo = dividirATela(pedidos, pessoa, "TODOS", hoje);
    return tudo.decisao.length + tudo.comprar.length + tudo.lista.length;
  }, [pedidos, pessoa, hoje]);
  const contadores = useMemo(() => contadoresDaTela(pedidos, pessoa, hoje), [pedidos, pessoa, hoje]);
  const frase = useMemo(() => fraseDoTopo(pedidos, pessoa, hoje), [pedidos, pessoa, hoje]);

  // Filtro "Aguardando" para quem aprova vira a própria caixa de decisão; "Falta
  // comprar" para quem compra, o bloco de compra. O resto é a tabela.
  const caixa = filtro === "TODOS" ? divisao.decisao : filtro === "AGUARDANDO" && papeis.aprovador ? divisao.lista : [];
  const paraComprar = filtro === "TODOS" ? divisao.comprar : filtro === "APROVADOS" && papeis.comprador ? divisao.lista : [];
  const tabela = caixa === divisao.lista || paraComprar === divisao.lista ? [] : divisao.lista;
  const ordemNaTela = useMemo(() => [...caixa, ...paraComprar, ...tabela], [caixa, paraComprar, tabela]);

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
      // O pedido que veio pela URL abre no painel; com &acao=, a gaveta do botão já basta.
      if (!url.acao) {
        setAbertoId(url.pedido);
        setFocarPainel((n) => n + 1);
      }
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

  /** Põe UM pedido na janela do "Desfazer" (a gravação sai depois dela). Devolve se entrou. */
  function agendarAprovacao(pedido: PedidoCompra) {
    if (pendentes.current.has(pedido.id) || aprovando.has(pedido.id)) return false;
    const timer = window.setTimeout(() => void gravarRef.current(pedido.id), JANELA_DESFAZER_MS);
    pendentes.current.set(pedido.id, { pedido, timer });
    setAprovando((atual) => new Set(atual).add(pedido.id));
    return true;
  }

  function aprovar(pedido: PedidoCompra) {
    if (!agendarAprovacao(pedido)) return;
    toast(`Pedido ${numeroDoPedido(pedido.numero)} aprovado.`, {
      tom: "ok",
      duracaoMs: JANELA_DESFAZER_MS,
      acao: { rotulo: "Desfazer", onClick: () => desfazerAprovacao(pedido.id) },
    });
  }

  /**
   * "Aprovar os N" (08/10/2026): a caixa inteira de uma vez, SEM TETO de valor
   * (decisão do Lucas). Cada pedido entra na mesma janela de 5 s; um aviso só,
   * e o "Desfazer" dele volta todos.
   */
  function aprovarVarios(lista: PedidoCompra[]) {
    const lote = loteParaAprovar(lista, new Set([...aprovando, ...pendentes.current.keys()]));
    const agendados = lote.pedidos.filter((pedido) => agendarAprovacao(pedido));
    if (!agendados.length) return;
    if (agendados.length === 1) {
      toast(`Pedido ${numeroDoPedido(agendados[0].numero)} aprovado.`, {
        tom: "ok",
        duracaoMs: JANELA_DESFAZER_MS,
        acao: { rotulo: "Desfazer", onClick: () => desfazerAprovacao(agendados[0].id) },
      });
      return;
    }
    toast(`${agendados.length} pedidos aprovados · ${formatarReais(somaDosValores(agendados))}.`, {
      tom: "ok",
      duracaoMs: JANELA_DESFAZER_MS,
      acao: { rotulo: "Desfazer", onClick: () => desfazerVarios(agendados.map((pedido) => pedido.id)) },
    });
  }

  /** Tira um pedido da janela do "Desfazer". Devolve o pedido, ou null se a gravação já saiu. */
  function tirarDaJanela(id: string) {
    const pendente = pendentes.current.get(id);
    if (!pendente) return null;
    window.clearTimeout(pendente.timer);
    pendentes.current.delete(id);
    setAprovando((atual) => {
      const proximo = new Set(atual);
      proximo.delete(id);
      return proximo;
    });
    return pendente.pedido;
  }

  function desfazerAprovacao(id: string) {
    const pedido = tirarDaJanela(id);
    if (!pedido) {
      toast("A aprovação já foi gravada. Se precisar voltar atrás, cancele o pedido.", { tom: "atencao", duracaoMs: 6000 });
      return;
    }
    toast(`Aprovação do pedido ${numeroDoPedido(pedido.numero)} desfeita.`, { tom: "info" });
  }

  function desfazerVarios(ids: string[]) {
    const desfeitos = ids.map(tirarDaJanela).filter(Boolean).length;
    if (!desfeitos) {
      toast("As aprovações já foram gravadas. Se precisar voltar atrás, cancele o pedido.", { tom: "atencao", duracaoMs: 6000 });
      return;
    }
    const gravados = ids.length - desfeitos;
    toast(`${desfeitos === 1 ? "1 aprovação desfeita" : `${desfeitos} aprovações desfeitas`}${gravados ? ` · ${gravados} já tinha${gravados === 1 ? "" : "m"} sido gravada${gravados === 1 ? "" : "s"}` : ""}.`, {
      tom: gravados ? "atencao" : "info",
      duracaoMs: gravados ? 6000 : 3500,
    });
  }

  // Devolver e recusar (08/10/2026): o motivo é escrito na própria barra de
  // decisão do painel (o componente não deixa sair sem ele) e conferido aqui de
  // novo — pelo menos 3 letras, como o motor e o banco exigem.
  async function devolverOuRecusar(pedido: PedidoCompra, decisao: "DEVOLVER" | "RECUSAR", motivo: string) {
    const devolver = decisao === "DEVOLVER";
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

  // ---- O painel do pedido ----
  const idNoPainel = abertoId ?? (largo && !fechouPainel ? (caixa[0]?.id ?? null) : null);
  const pedidoNoPainel = idNoPainel ? (porId.get(idNoPainel) ?? null) : null;

  function abrir(id: string) {
    setAbertoId(id);
    setFechouPainel(false);
    setFocarPainel((n) => n + 1);
  }
  function fecharPainel() {
    setAbertoId(null);
    setFechouPainel(true);
    setDestaque(null);
  }
  /** Antes de abrir outra gaveta (compra, recebimento, ajuste), a do pedido sai — nunca duas empilhadas. */
  const liberarGaveta = () => {
    if (!largo) setAbertoId(null);
  };

  function handlersDo(pedido: PedidoCompra): AcoesDaLinha {
    return {
      onAprovar: () => aprovar(pedido),
      onDevolver: (motivo) => devolverOuRecusar(pedido, "DEVOLVER", motivo),
      onRecusar: (motivo) => devolverOuRecusar(pedido, "RECUSAR", motivo),
      onDesfazerAprovacao: () => desfazerAprovacao(pedido.id),
      onComprar: () => {
        liberarGaveta();
        setParaComprarId(pedido.id);
      },
      onReceber: () => {
        liberarGaveta();
        setParaReceberId(pedido.id);
      },
      onAjustar: () => {
        liberarGaveta();
        abrirFormulario({ setor: pedido.setor, rascunho: rascunhoDoPedido(pedido) }, pedido);
      },
      onCancelar: () => void cancelar(pedido),
    };
  }

  const posicaoNoPainel = (pedido: PedidoCompra): PosicaoNoPainel | null => {
    const indice = ordemNaTela.findIndex((outro) => outro.id === pedido.id);
    if (indice < 0) return null;
    return {
      atual: indice + 1,
      total: ordemNaTela.length,
      onAnterior: indice > 0 ? () => abrir(ordemNaTela[indice - 1].id) : null,
      onProximo: indice < ordemNaTela.length - 1 ? () => abrir(ordemNaTela[indice + 1].id) : null,
    };
  };

  const propsDoPainel = (pedido: PedidoCompra) => ({
    pedido,
    acoes: acoesDoPedido(pedido, pessoa, nivel.podeEditar),
    hojeISO: hoje,
    estoqueItens: estoque.items,
    moves: estoque.moves,
    compras: estoque.compras,
    pedidos,
    aprovador: papeis.aprovador,
    verFinanceiro: papeis.comprador,
    aprovando: aprovando.has(pedido.id),
    ocupado: compras.salvando,
    handlers: handlersDo(pedido),
  });

  const escolhida = (pedido: PedidoCompra) => pedido.id === idNoPainel || pedido.id === destaque;

  function linhaDaCaixa(pedido: PedidoCompra, tipo: "decisao" | "comprar") {
    return (
      <LinhaDoPedido
        key={pedido.id}
        pedido={pedido}
        tipo={tipo}
        hojeISO={hoje}
        acoes={acoesDoPedido(pedido, pessoa, nivel.podeEditar)}
        escolhida={escolhida(pedido)}
        aprovando={aprovando.has(pedido.id)}
        ocupado={compras.salvando}
        onAbrir={() => abrir(pedido.id)}
        handlers={handlersDo(pedido)}
      />
    );
  }

  const novoPedido = () => abrirFormulario({ setor: setores[0] ?? "" });

  // As leituras em texto (imagem 02): cada uma filtra a tela; tocar de novo volta para todos.
  // Até a sua decisão | depois dela.
  const alternarFiltro = (proximo: FiltroPedidos) => setFiltro((atual) => (atual === proximo ? "TODOS" : proximo));
  const leiturasAntes: { filtro: FiltroPedidos; rotulo: string; numero: number; extra?: string }[] = [
    { filtro: "TODOS", rotulo: "Todos", numero: totalDaTela },
    {
      filtro: "AGUARDANDO",
      rotulo: "Aguardando",
      numero: contadores.aguardando,
      extra: contadores.atrasados ? `${contadores.atrasados} ${contadores.atrasados === 1 ? "atrasado" : "atrasados"}` : undefined,
    },
  ];
  const leiturasDepois: { filtro: FiltroPedidos; rotulo: string; numero: number; dica?: string }[] = [
    { filtro: "APROVADOS", rotulo: "Falta comprar", numero: contadores.aprovados },
    { filtro: "A_CAMINHO", rotulo: "A caminho", numero: contadores.aCaminho },
    { filtro: "RECEBIDOS_MES", rotulo: "Recebidos", numero: contadores.recebidosNoMes, dica: "Recebidos no mês" },
    ...(contadores.devolvidos || filtro === "DEVOLVIDOS" ? [{ filtro: "DEVOLVIDOS" as FiltroPedidos, rotulo: "Devolvidos", numero: contadores.devolvidos }] : []),
  ];

  const pedidoParaComprar = paraComprarId ? (porId.get(paraComprarId) ?? null) : null;
  const pedidoParaReceber = paraReceberId ? (porId.get(paraReceberId) ?? null) : null;
  const vazio = frasesDaListaVazia(filtro, podePedir);
  const nadaNaTela = !caixa.length && !paraComprar.length && !tabela.length;
  const loteDaCaixa = loteParaAprovar(caixa, new Set([...aprovando]));
  const painelAoLado = largo && pedidoNoPainel;
  const tituloDaTabela = filtro === "TODOS" ? (divisao.tituloDaLista === "Os outros pedidos" ? "Outros pedidos" : divisao.tituloDaLista) : divisao.tituloDaLista;

  return (
    <AccessGate allowed={() => false} label="Pedidos de compra" module="compras">
      <div className={cn("mx-auto grid w-full max-w-[1400px] items-start gap-6", painelAoLado ? "grid-cols-[minmax(0,1fr)_408px] min-[1400px]:grid-cols-[minmax(0,1fr)_488px]" : "max-w-[1200px]")}>
        <div className="min-w-0 font-sans text-tinta">
          <Cabecalho
            sobrancelha="Compras e estoque"
            titulo="Pedidos de compra"
            frase={compras.carregando ? "Carregando os pedidos…" : <FraseDestacada frase={frase} />}
            acoes={
              podePedir ? (
                <Botao variante="secundario" icone={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={novoPedido} className="max-md:h-11">
                  Novo pedido
                </Botao>
              ) : null
            }
            rodape={
              <FraseDoFluxo>
                {papeis.aprovador
                  ? "O setor pede, você aprova, o Financeiro compra e o setor confirma a chegada."
                  : "O setor pede, o Gestor Financeiro aprova, o Financeiro compra e o setor confirma a chegada."}
                {FLUXOGRAMA ? (
                  <>
                    {" "}
                    <a
                      href={FLUXOGRAMA.assetPath} target="_blank"
                      rel="noreferrer"
                      title="Abre o fluxograma POP-COMP-001 em outra aba"
                      className="group inline-flex items-center gap-1 whitespace-nowrap rounded-sm text-sm font-bold leading-5 text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                    >
                      Ver o fluxo
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-150 ease-papel group-hover:translate-x-0.5" aria-hidden="true" />
                    </a>
                  </>
                ) : null}
              </FraseDoFluxo>
            }
          />

          {nivel.soVe ? (
            <Recado tom="atencao" role="status" className="mb-6">
              {FRASE_SO_VE}
            </Recado>
          ) : null}

          {/* Leituras em texto: cada uma filtra a tela. */}
          <div
            role="group"
            aria-label="Mostrar pedidos"
            className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden"
          >
            {leiturasAntes.map((leitura) => (
              <Leitura
                key={leitura.filtro}
                ativa={filtro === leitura.filtro}
                rotulo={leitura.rotulo}
                numero={leitura.numero}
                extra={leitura.extra}
                onClick={() => (leitura.filtro === "TODOS" ? setFiltro("TODOS") : alternarFiltro(leitura.filtro))}
              />
            ))}
            <span aria-hidden="true" className="h-4 w-px shrink-0 bg-fio-2" />
            {leiturasDepois.map((leitura) => (
              <Leitura
                key={leitura.filtro}
                ativa={filtro === leitura.filtro}
                rotulo={leitura.rotulo}
                numero={leitura.numero}
                dica={leitura.dica}
                onClick={() => alternarFiltro(leitura.filtro)}
              />
            ))}
          </div>

          {compras.erroDeLeitura ? (
            <Recado tom="erro" role="alert" className="mb-6 items-center">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span>{compras.erroDeLeitura}</span>
                <Botao variante="secundario" tamanho="pq" icone={<RefreshCw className="h-4 w-4" aria-hidden="true" />} onClick={compras.recarregar} className="max-md:h-11">
                  Tentar de novo
                </Botao>
              </span>
            </Recado>
          ) : null}

          {compras.carregando ? (
            <BlocoFolha as="section" aria-label="Carregando os pedidos" aria-busy="true">
              <p className="px-4 pb-2 pt-4 text-sm font-bold text-tinta">Carregando os pedidos</p>
              <ul aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="grid gap-2 border-t border-fio px-4 py-4">
                    <span className="h-3.5 w-3/4 rounded-sm bg-fio motion-safe:animate-pulse" />
                    <span className="h-3 w-1/2 rounded-sm bg-fio/70 motion-safe:animate-pulse" />
                  </li>
                ))}
              </ul>
            </BlocoFolha>
          ) : (
            <div className="grid gap-8">
              {caixa.length ? (
                <BlocoFolha as="section" aria-labelledby="caixa-de-decisao">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-2 pt-4">
                    <h2 id="caixa-de-decisao" className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold leading-5 text-tinta">
                      Esperam sua decisão
                      <span className="whitespace-nowrap text-[13px] font-medium text-tinta-2">
                        {contagem(caixa.length)} · <span className="tabular-nums">{formatarReais(somaDosValores(caixa))}</span>
                      </span>
                    </h2>
                    {loteDaCaixa.pedidos.length > 1 ? (
                      <Botao
                        variante="fantasma"
                        tamanho="pq"
                        icone={<Check className="h-4 w-4" aria-hidden="true" />}
                        disabled={compras.salvando}
                        onClick={() => aprovarVarios(caixa)}
                        className="-mr-2 max-md:-ml-3 max-md:mr-0 max-md:h-11"
                      >
                        <span>
                          Aprovar os {loteDaCaixa.pedidos.length}{" "}
                          <span className="font-semibold tabular-nums text-tinta-2">· {formatarReais(loteDaCaixa.valor)}</span>
                        </span>
                      </Botao>
                    ) : null}
                  </div>
                  <p className="px-4 pb-3 text-[13px] font-medium leading-5 text-tinta-2">
                    Urgente primeiro, depois o mais antigo. Prazo: 1 dia útil; urgente, no mesmo dia.
                  </p>
                  <ul>{caixa.map((pedido) => linhaDaCaixa(pedido, "decisao"))}</ul>
                </BlocoFolha>
              ) : null}

              {paraComprar.length ? (
                <BlocoFolha as="section" aria-labelledby="falta-comprar">
                  <div className="px-4 pb-3 pt-4">
                    <h2 id="falta-comprar" className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold leading-5 text-tinta">
                      Falta comprar
                      <span className="whitespace-nowrap text-[13px] font-medium text-tinta-2">
                        {contagem(paraComprar.length)} · <span className="tabular-nums">{formatarReais(somaDosValores(paraComprar))}</span>
                      </span>
                    </h2>
                    <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">Cote, compre e registre aqui: vira compra no Financeiro e o setor vê “a caminho”.</p>
                  </div>
                  <ul>{paraComprar.map((pedido) => linhaDaCaixa(pedido, "comprar"))}</ul>
                </BlocoFolha>
              ) : null}

              {tabela.length ? (
                <section aria-labelledby="outros-pedidos">
                  <h2 id="outros-pedidos" className="mb-2 flex flex-wrap items-baseline gap-x-2 text-base font-bold leading-6 text-tinta">
                    {tituloDaTabela}
                    <span className="whitespace-nowrap text-[13px] font-medium text-tinta-2">
                      {contagem(tabela.length)} · <span className="tabular-nums">{formatarReais(somaDosValores(tabela))}</span>
                    </span>
                  </h2>
                  <table className="w-full border-collapse text-left font-sans text-sm text-tinta max-md:block">
                    <CabecaDaTabela />
                    <tbody className="max-md:block">
                      {tabela.map((pedido) => (
                        <LinhaDaTabela
                          key={pedido.id}
                          pedido={pedido}
                          hojeISO={hoje}
                          acoes={acoesDoPedido(pedido, pessoa, nivel.podeEditar)}
                          quemCompra={papeis.comprador}
                          escolhida={escolhida(pedido)}
                          aprovando={aprovando.has(pedido.id)}
                          ocupado={compras.salvando}
                          onAbrir={() => abrir(pedido.id)}
                          handlers={handlersDo(pedido)}
                        />
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}

              {nadaNaTela || (filtro !== "TODOS" && !caixa.length && !paraComprar.length && !tabela.length) ? (
                <BlocoSaber className="grid justify-items-center px-6 py-10 text-center">
                  <p className="text-base font-bold leading-6 text-tinta">{vazio.titulo}</p>
                  <p className="mx-auto mt-1 max-w-md text-sm font-medium leading-6 text-tinta-2">{vazio.texto}</p>
                  {podePedir && (filtro === "TODOS" || filtro === "AGUARDANDO") ? (
                    <Botao variante="primario" icone={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={novoPedido} className="mt-5 max-md:h-11">
                      Novo pedido
                    </Botao>
                  ) : null}
                </BlocoSaber>
              ) : null}
            </div>
          )}

          {compras.ehLocal ? (
            <p className="mt-8 text-center text-[13px] font-medium text-tinta-2">Modo prévia: os pedidos são de exemplo e ficam só neste aparelho.</p>
          ) : null}
        </div>

        {painelAoLado && pedidoNoPainel ? (
          <PainelDoPedidoAoLado
            {...propsDoPainel(pedidoNoPainel)}
            posicao={posicaoNoPainel(pedidoNoPainel)}
            onFechar={fecharPainel}
            focarAoAbrir={focarPainel}
          />
        ) : null}
      </div>

      {!largo ? (
        <PainelDoPedidoNaGaveta
          {...(pedidoNoPainel ? propsDoPainel(pedidoNoPainel) : { ...propsDoPainelVazio(hoje, papeis.aprovador, papeis.comprador) })}
          pedido={pedidoNoPainel}
          aberta={Boolean(abertoId && pedidoNoPainel)}
          onFechar={fecharPainel}
        />
      ) : null}

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

/**
 * A frase do topo (fraseDoTopo) com o peso no lugar certo: o primeiro pedaço
 * em negrito (o número que pede a decisão) e o "passou do prazo" na cor de
 * atenção — a palavra continua lá, a cor só reforça.
 */
function FraseDestacada({ frase }: { frase: string }) {
  const partes = frase.split(" · ");
  return (
    <>
      {partes.map((parte, i) => (
        <span key={i}>
          {i > 0 ? " · " : null}
          <span className="whitespace-nowrap">
            {i === 0 ? <strong>{parte}</strong> : /do prazo$/.test(parte) ? <span className="alerta">{parte}</span> : parte}
          </span>
        </span>
      ))}
    </>
  );
}

/** A gaveta fechada (sem pedido) ainda precisa das props — nada nelas é usado. */
function propsDoPainelVazio(hojeISO: string, aprovador: boolean, verFinanceiro: boolean) {
  const nada = () => undefined;
  return {
    acoes: { decidir: false, comprar: false, receber: false, ajustar: false, cancelar: false },
    hojeISO,
    estoqueItens: [],
    moves: [],
    compras: [],
    pedidos: [],
    aprovador,
    verFinanceiro,
    aprovando: false,
    ocupado: false,
    handlers: { onAprovar: nada, onDevolver: nada, onRecusar: nada, onDesfazerAprovacao: nada, onComprar: nada, onReceber: nada, onAjustar: nada, onCancelar: nada },
  };
}

export default PedidosDeCompraPage;
