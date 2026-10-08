// ESTOQUE (19/08/2026, pedido do Lucas): "vai ter o estoque da recepcionista e
// vai ter o estoque da enfermeira... o da enfermeira conectado com as compras...
// e que desse pra gerar relatórios ou imprimir."
//
// A tela é a posição do setor (o que tem, o que falta, o que vence), com as
// chegadas das Compras esperando confirmação em cima — porque a pendência que
// ninguém vê é a que ninguém resolve.
//
// PEDIDOS DE COMPRA (06/10/2026). Lucas: *"cada usuário, que é cada setor, vai
// cuidar do seu próprio estoque… e eu vou aprovar isso"*. Cada cargo virou um
// setor (10 ao todo), então: a pessoa abre no setor DELA e os outros ficam num
// seletor compacto; item em falta ganha "Pedir compra" (abre o pedido já
// preenchido em /compras); o "Já comprei" ficou só para o financeiro completo,
// que é quem o banco deixa gravar compra — para a enfermagem e a recepção ele
// dava erro de permissão.
//
// REDESENHO PAPEL & MUSGO (08/10/2026): a mesma tela, na forma aprovada — um
// cabeçalho só (com a frase do fluxo e o número já explicado), os setores em
// abas logo abaixo, o placar no tom "saber" (para saber), os blocos que pedem
// ação em folha (bipar, pedidos do setor, chegadas, validade, posição), a
// situação do item no selo da fundação e nada de vidro. Os dados, os botões, as
// permissões e os links (?setor=, ?pedido=&acao=) são os de antes.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  PackageCheck,
  Plus,
  Printer,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AccessGate } from "@/components/access/AccessGate";
import { Abas, BlocoFolha, BlocoSaber, Botao, Cabecalho, FraseDoFluxo, LinkSeta, Selo, type EstadoSelo } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canFinanceiroFull, canSeeModule, isCoordenacao } from "@/lib/access";
import { useCompras } from "@/features/compras/useCompras";
import { ehDoSetor, numeroDoPedido, podePedirPara, podeReceber, type PedidoCompra } from "@/features/compras/comprasData";
import { AcaoSeta, Campo, CampoSelecao, CampoTexto, Recado, SeloDoPedido } from "@/features/compras/pecas";
import {
  fraseDoPedidoNoItem,
  linkDoPedido,
  linkPedirCompra,
  pedidosAbertosDoSetor,
  recusaDoItem,
  pedirTudoQueFalta,
  quandoChega,
  quemCuidaDoSetor,
  setorInicialDoEstoque,
  setoresDaTelaDeEstoque,
} from "@/features/compras/estoquePedidos";
import { salvarArquivo } from "@/lib/salvarArquivo";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { type FinPurchase } from "@/features/financeiro/financeiroData";
import { JaCompreiGaveta } from "@/features/compras/RegistrarCompraForm";
import {
  acharPorCodigo,
  saldoDoItem,
  alertasDeValidade,
  chegadasPendentes,
  coberturaDias,
  consumoDiario,
  csvMovimentos,
  listaDeCompra,
  lotesDoItem,
  loteSugerido,
  minimoSugerido,
  movTipoLabels,
  parseGs1,
  posicaoDoSetor,
  relatorioPosicao,
  resumoDaFalta,
  podeMexerNoSetor,
  ehEstoqueSetor,
  setorLabels,
  setorNomes,
  type EstoqueItem,
  type EstoqueMovTipo,
  type EstoqueMovimento,
  type EstoqueSetor,
} from "./estoqueData";
import { useEstoque } from "./useEstoque";
import { perguntar } from "@/components/ui/avisos";

const diaBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const novoId = (prefixo: string) => `${prefixo}-${crypto.randomUUID()}`;

// A SITUAÇÃO DO ITEM no selo da fundação (08/10/2026, redesenho Papel & Musgo):
// as 4 marcas contam o caminho da compra do item — nada pedido (zerou, comprar),
// pedido feito (1), a caminho (3) — e o OK leva as 4 cheias. A palavra vai
// sempre junto; a cor só reforça. `rotulo` (caixa alta) segue no relatório impresso.
// 07/10/2026: o "Pedido feito" deixou o violeta (fora da marca); hoje é o ouro do
// "aguardando aprovação", o mesmo do selo do pedido. Petróleo SÓ no "a caminho".
const statusChip = {
  ZERADO: { rotulo: "ZEROU", palavra: "Zerou", estado: "recusado", etapas: 0 },
  COMPRAR: { rotulo: "COMPRAR", palavra: "Comprar", estado: "devolvido", etapas: 0 },
  OK: { rotulo: "OK", palavra: "OK", estado: "recebido", etapas: 4 },
  // 06/10/2026: o setor já pediu; o pedido espera aprovação ou compra.
  PEDIDO: { rotulo: "PEDIDO FEITO", palavra: "Pedido feito", estado: "aguardando", etapas: 1 },
  A_CAMINHO: { rotulo: "A CAMINHO", palavra: "A caminho", estado: "a-caminho", etapas: 3 },
} as const satisfies Record<string, { rotulo: string; palavra: string; estado: EstadoSelo; etapas: number }>;

const TH = "h-10 whitespace-nowrap border-b border-fio-2 px-3 text-left align-middle text-xs font-bold uppercase tracking-[0.06em] text-tinta-2";
const RUBRICA = "text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2";

/** Cabeça de um bloco: título curto, contagem em texto e o "O que é" ao lado. */
function CabecaDoBloco({ id, titulo, detalhe, dica, acao }: { id?: string; titulo: string; detalhe?: ReactNode; dica?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-4">
      <h2 id={id} className="flex flex-wrap items-center gap-x-2 text-sm font-bold leading-5 text-tinta">
        {titulo}
        {detalhe ? <span className="text-[13px] font-medium text-tinta-2">{detalhe}</span> : null}
        {dica}
      </h2>
      {acao}
    </div>
  );
}

/** Sugestões de categoria por setor — só para digitar menos (datalist). */
const categoriasSugeridas: Record<EstoqueSetor, string[]> = {
  RECEPCAO: ["Escritório", "Limpeza", "Copa/Cozinha", "Impressos", "Presentes"],
  ENFERMAGEM: ["Medicação", "Injetáveis", "Descartáveis", "Curativo", "Coleta/Exames"],
  PACIENTES: ["Alimentos", "Bebidas", "Banheiros", "Presentes"],
  // Setores de 06/10/2026 (cada cargo é um setor): sugestões mínimas, só para o datalist.
  COMERCIAL: ["Material de vendas", "Impressos", "Brindes", "Escritório"],
  FINANCEIRO: ["Escritório", "Impressos", "Arquivo"],
  DIRETORIA: ["Escritório", "Presentes", "Eventos"],
  CONSULTORIO: ["Material médico", "Descartáveis", "Escritório"],
  NUTRICAO: ["Material de consulta", "Impressos", "Alimentos"],
  MARKETING: ["Brindes", "Impressos", "Eventos", "Equipamento"],
  LIMPEZA: ["Produtos de limpeza", "Descartáveis", "Utensílios"],
};

/**
 * A COMPRA DO ITEM, no detalhe da linha (06/10/2026): uma decisão só, na ordem
 *   1. já tem compra a caminho → diz de quem e quando chega;
 *   2. já tem pedido aberto → diz em que pé está (não deixa comprar duas vezes);
 *   3. em falta, para o financeiro completo → "Já comprei" (ele grava compra);
 *   4. em falta, para o setor → "Pedir compra" (vai para aprovação).
 */
function CompraDoItem({
  linha,
  pedidoCompleto,
  ajustaOPedido,
  recusa,
  podeRegistrar,
  podePedir,
  onPedir,
  onJaComprei,
}: {
  linha: ReturnType<typeof posicaoDoSetor>[number];
  /** O pedido aberto inteiro (motivo da devolução) — 07/10/2026. */
  pedidoCompleto: PedidoCompra | null;
  /** A pessoa é do setor do pedido (ajusta o devolvido). */
  ajustaOPedido: boolean;
  /** A última palavra sobre o item foi uma recusa (07/10/2026). */
  recusa: ReturnType<typeof recusaDoItem>;
  podeRegistrar: boolean;
  podePedir: boolean;
  onPedir: () => void;
  /** Abre a gaveta "Já comprei" (a mesma regra de compra do pedido aprovado). */
  onJaComprei: () => void;
}) {
  if (linha.compraAberta) {
    // Já comprado: é o "a caminho" — a única faixa em petróleo.
    return (
      <Recado tom="petroleo">
        <strong>Já comprei.</strong> {linha.compraAberta.supplier || "Fornecedor não anotado"} em {diaBR(linha.compraAberta.purchaseDate)}
        {linha.compraAberta.deliveryEta ? `, previsto para ${diaBR(linha.compraAberta.deliveryEta)}` : ""}.
        {" "}Some daqui quando alguém der a entrada da caixa.
      </Recado>
    );
  }
  if (linha.pedidoAberto?.status === "DEVOLVIDO") {
    // 07/10/2026: o devolvido NÃO vai chegar — está parado esperando o setor.
    // A frase de antes ("quando chegar, a entrada é dada pelo pedido") fazia a
    // pessoa esperar uma entrega que nunca vinha.
    const motivo = pedidoCompleto?.decisaoNota ?? "";
    return (
      <Recado tom="atencao">
        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="min-w-0 flex-[1_1_16rem] [overflow-wrap:anywhere]">
            <strong>{fraseDoPedidoNoItem(linha.pedidoAberto)}.</strong>{" "}
            {ajustaOPedido ? "Falta você ajustar e reenviar" : "Falta o setor ajustar e reenviar"}
            {motivo ? `: ${motivo}` : "."}
          </span>
          <LinkSeta to={linkDoPedido(linha.pedidoAberto.id, ajustaOPedido ? "ajustar" : undefined)}>{ajustaOPedido ? "Ajustar e reenviar" : "Ver o pedido"}</LinkSeta>
        </span>
      </Recado>
    );
  }
  if (linha.pedidoAberto) {
    return (
      <Recado tom="neutro" className="bg-folha">
        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="min-w-0 flex-[1_1_16rem]">
            <strong>{fraseDoPedidoNoItem(linha.pedidoAberto)}.</strong> Não precisa pedir de novo: quando chegar, a entrada é dada pelo pedido.
          </span>
          <LinkSeta to={linkDoPedido(linha.pedidoAberto.id)}>Ver o pedido</LinkSeta>
        </span>
      </Recado>
    );
  }
  if (linha.status === "OK") return null;
  // 07/10/2026: a última palavra sobre o item foi uma recusa — o motivo vem
  // ANTES do "Pedir compra", para ninguém pedir de novo sem saber por quê.
  const avisoDaRecusa = recusa ? (
    <span className="mb-1 block font-medium text-erro [overflow-wrap:anywhere]">
      <strong>Pedido {recusa.numero} foi recusado</strong>
      {recusa.motivo ? `: ${recusa.motivo}` : "."} Se ainda precisar, peça de novo explicando.
    </span>
  ) : null;
  if (podeRegistrar) {
    // 07/10/2026: o formulário curto (fornecedor, valor, data) gravava PIX fixo,
    // sem conta paga nem categoria. Agora o botão abre a gaveta de compra
    // completa (JaCompreiGaveta): forma de pagamento e, no à vista, a categoria da P12.
    return (
      <Recado tom="atencao">
        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="min-w-0 flex-[1_1_16rem]">
            <strong>Está em falta.</strong> Já comprou? Anote a compra: ela entra no Financeiro e o item fica "a caminho".
          </span>
          <Botao variante="primario" tamanho="pq" icone={<ShoppingCart className="h-4 w-4" aria-hidden="true" />} onClick={onJaComprei} className="max-md:h-11">
            Já comprei
          </Botao>
        </span>
      </Recado>
    );
  }
  if (!podePedir) {
    return avisoDaRecusa ? <Recado tom="erro">{avisoDaRecusa}</Recado> : null;
  }
  return (
    <Recado tom="atencao">
      <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="min-w-0 flex-[1_1_16rem]">
          {avisoDaRecusa}
          <strong>Está em falta.</strong> Peça a compra: o Gestor Financeiro aprova e o Financeiro compra.
        </span>
        <Botao variante="primario" tamanho="pq" icone={<ShoppingCart className="h-4 w-4" aria-hidden="true" />} onClick={onPedir} className="max-md:h-11">
          Pedir compra
        </Botao>
      </span>
    </Recado>
  );
}

export function EstoquePage() {
  const { pessoa } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const estoque = useEstoque();
  // Os pedidos de compra que a pessoa enxerga (06/10/2026): dizem quais itens
  // já foram pedidos ("Pedido feito") e quais estão a caminho pelo pedido.
  const { pedidos } = useCompras();

  // "JÁ COMPREI" (21/09/2026; 07/10/2026 pela regra única de compra): o item
  // cuja compra o Financeiro está anotando — abre a gaveta JaCompreiGaveta.
  const [jaCompreiItem, setJaCompreiItem] = useState<EstoqueItem | null>(null);
  const hoje = todayISO();

  // QUAL SETOR (06/10/2026): cada pessoa abre no setor DELA (o que tem itens,
  // o principal primeiro); a coordenação, com o próprio vazio, cai na
  // Enfermagem como antes. A Home manda ?setor= e a tela obedece.
  // PACIENTES (30/09/2026) continua de todos para ver; só a Aline e a CEO mexem.
  const cargo = pessoa?.cargo ?? null;
  const ehCoordenacao = isCoordenacao(cargo);
  const telaSetores = useMemo(() => setoresDaTelaDeEstoque(cargo, ehCoordenacao), [cargo, ehCoordenacao]);
  const setorDaUrl = params.get("setor");
  const [setorEscolhido, setSetorEscolhido] = useState<EstoqueSetor | null>(null);
  useEffect(() => {
    if (setorDaUrl && ehEstoqueSetor(setorDaUrl) && telaSetores.visiveis.includes(setorDaUrl)) setSetorEscolhido(setorDaUrl);
  }, [setorDaUrl, telaSetores]);
  const setor: EstoqueSetor =
    setorEscolhido && telaSetores.visiveis.includes(setorEscolhido)
      ? setorEscolhido
      : setorInicialDoEstoque(cargo, ehCoordenacao, estoque.items, setorDaUrl);
  const setSetor = (proximo: EstoqueSetor) => setSetorEscolhido(proximo);
  const podeEditarModulo = canEditModule(pessoa, "estoque");
  const podeEditar = podeEditarModulo && podeMexerNoSetor(cargo, setor, ehCoordenacao);
  // Pedir compra é do módulo de pedidos (todo mundo, para o próprio setor) — não
  // depende de editar o estoque: o marketing e a limpeza só VEEM o estoque, mas pedem.
  const podePedir = canEditModule(pessoa, "compras") && podePedirPara(pessoa, setor);
  const podeConfirmarChegada = podeReceber(pessoa, setor);

  const [feedback, setFeedback] = useState("");
  const [erro, setErro] = useState("");
  const [itemAberto, setItemAberto] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);

  // AS COMPRAS ENTRAM NA CONTA (21/09/2026): sem elas, um item já comprado
  // continuava marcado COMPRAR até a caixa chegar — e era isso que fazia o
  // Lucas perder o controle de "já comprei ou não".
  // E OS PEDIDOS TAMBÉM (06/10/2026): item pedido vira "Pedido feito" e, depois
  // de comprado pelo pedido, "a caminho" — não grita COMPRAR de novo.
  const posicao = useMemo(
    () => posicaoDoSetor(estoque.items, estoque.moves, setor, estoque.compras, pedidos),
    [estoque.items, estoque.moves, setor, estoque.compras, pedidos],
  );
  const alertas = useMemo(
    () => alertasDeValidade(estoque.items.filter((item) => item.setor === setor), estoque.moves, hoje),
    [estoque.items, estoque.moves, setor, hoje],
  );
  // A compra de um pedido se recebe pelo pedido — não aparece aqui de novo.
  const chegadas = useMemo(
    () => chegadasPendentes(estoque.compras, estoque.moves, setor, pedidos),
    [estoque.compras, estoque.moves, setor, pedidos],
  );
  // "Para comprar" é o que AINDA é tarefa — item já comprado (a caminho) saiu
  // da conta, senão o card continua cobrando uma tarefa que já foi feita, que é
  // o problema que o status A_CAMINHO veio resolver. Desde 06/10/2026 o mesmo
  // vale para o item já pedido, inclusive o zerado: a falta dele continua
  // gritando na tabela (ZEROU), mas pedir de novo seria comprar duas vezes.
  const falta = useMemo(() => resumoDaFalta(posicao), [posicao]);
  const pedirTudo = useMemo(() => pedirTudoQueFalta(setor, posicao, pedidos), [setor, posicao, pedidos]);
  const pedidosDoSetor = useMemo(() => pedidosAbertosDoSetor(pedidos, setor), [pedidos, setor]);
  // A última recusa de cada item em falta (07/10/2026): o motivo aparece antes do "Pedir compra".
  const recusas = useMemo(() => {
    const mapa = new Map<string, NonNullable<ReturnType<typeof recusaDoItem>>>();
    for (const linha of posicao) {
      if (linha.status !== "COMPRAR" && linha.status !== "ZERADO") continue;
      if (linha.pedidoAberto || linha.compraAberta) continue;
      const recusa = recusaDoItem(linha.item.id, pedidos);
      if (recusa) mapa.set(linha.item.id, recusa);
    }
    return mapa;
  }, [posicao, pedidos]);

  // ---------------- novo item ----------------
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [minimo, setMinimo] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");

  async function salvarItem(event: FormEvent) {
    event.preventDefault();
    setErro("");
    if (!nome.trim()) {
      setErro("Dê um nome ao item.");
      return;
    }
    const item: EstoqueItem = {
      id: novoId("estq"),
      setor,
      nome: nome.trim(),
      categoria: categoria.trim(),
      unidade: unidade.trim() || "un",
      minimo: Number(minimo.replace(",", ".")) || 0,
      codigoBarras: codigoBarras.trim(),
      observacao: "",
      createdAt: new Date().toISOString(),
    };
    await estoque.upsertItem(item);
    setNome("");
    setCategoria("");
    setMinimo("");
    setCodigoBarras("");
    // 07/10/2026: setorNomes — "estoque da Marketing" não soa bem; com 10 setores vale o nome curto.
    setFeedback(`Item "${item.nome}" criado no estoque: ${setorNomes[setor]}.`);
  }

  // ---------------- movimento ----------------
  const [movTipo, setMovTipo] = useState<EstoqueMovTipo>("SAIDA");
  const [movQtd, setMovQtd] = useState("");
  const [movLote, setMovLote] = useState("");
  const [movValidade, setMovValidade] = useState("");
  const [movMotivo, setMovMotivo] = useState("");

  async function lancarMovimento(item: EstoqueItem, event: FormEvent) {
    event.preventDefault();
    setErro("");
    const quantidade = Number(movQtd.replace(",", "."));
    if (!quantidade && movTipo !== "CONTAGEM") {
      setErro("Diga a quantidade.");
      return;
    }
    if (quantidade < 0 && movTipo !== "AJUSTE") {
      setErro("Quantidade negativa só no Ajuste (ex.: quebrou, venceu).");
      return;
    }
    await estoque.createMove({
      id: novoId("estqmov"),
      itemRef: item.id,
      setor: item.setor,
      tipo: movTipo,
      quantidade,
      movDate: hoje,
      lote: movLote.trim(),
      validade: movValidade || null,
      compraRef: null,
      motivo: movMotivo.trim(),
      createdAt: new Date().toISOString(),
    });
    setMovQtd("");
    setMovLote("");
    setMovValidade("");
    setMovMotivo("");
    setFeedback(`${movTipoLabels[movTipo]} de ${quantidade} ${item.unidade} — ${item.nome}.`);
  }

  // ---------------- chegada de compra ----------------
  const [chegadaItemRef, setChegadaItemRef] = useState("");
  const [chegadaQtd, setChegadaQtd] = useState("");
  const [chegadaLote, setChegadaLote] = useState("");
  const [chegadaValidade, setChegadaValidade] = useState("");
  const [chegadaAberta, setChegadaAberta] = useState("");

  async function confirmarChegada(compra: FinPurchase, event: FormEvent) {
    event.preventDefault();
    setErro("");
    const quantidade = Number(chegadaQtd.replace(",", "."));
    if (!chegadaItemRef) {
      setErro("Escolha em qual item do estoque essa compra entra (ou crie o item antes).");
      return;
    }
    if (!quantidade || quantidade <= 0) {
      setErro("Diga quantas unidades chegaram.");
      return;
    }
    const item = estoque.items.find((existing) => existing.id === chegadaItemRef);
    if (!item) return;
    await estoque.createMove({
      id: novoId("estqmov"),
      itemRef: item.id,
      setor: item.setor,
      tipo: "ENTRADA",
      quantidade,
      movDate: hoje,
      lote: chegadaLote.trim(),
      validade: chegadaValidade || null,
      compraRef: compra.id,
      motivo: `Chegada da compra: ${compra.description}`.slice(0, 200),
      createdAt: new Date().toISOString(),
    });
    setChegadaAberta("");
    setChegadaItemRef("");
    setChegadaQtd("");
    setChegadaLote("");
    setChegadaValidade("");
    setFeedback(`Entrada confirmada: ${quantidade} ${item.unidade} de ${item.nome}. A compra foi carimbada como recebida.`);
  }

  // ---------------- modo bipe (leitor de código de barras) ----------------
  // O leitor USB é um teclado: bipa, "digita" o código e manda Enter. Por isso
  // não existe integração — só um campo que entende o que chegou. O DataMatrix
  // das caixas de medicação (padrão GS1/ANVISA) carrega GTIN + validade + lote:
  // um bip preenche a entrada inteira.
  const [bipTexto, setBipTexto] = useState("");
  const [bipItem, setBipItem] = useState<EstoqueItem | null>(null);
  const [bipLido, setBipLido] = useState<ReturnType<typeof parseGs1>>(null);
  const [bipDesconhecido, setBipDesconhecido] = useState("");
  const [bipVincularRef, setBipVincularRef] = useState("");

  function receberBip(codigo: string) {
    setErro("");
    setFeedback("");
    const lido = parseGs1(codigo);
    if (!lido) {
      setErro("Não entendi esse código — bipe de novo, ou digite o código e aperte Enter.");
      return;
    }
    const item = acharPorCodigo(estoque.items.filter((existing) => existing.setor === setor), codigo);
    setBipLido(lido);
    if (item) {
      setBipItem(item);
      setBipDesconhecido("");
    } else {
      setBipItem(null);
      setBipDesconhecido(lido.gtin || lido.cru);
    }
  }

  async function bipSaida(item: EstoqueItem) {
    const sugestao = loteSugerido(estoque.moves, item.id);
    await estoque.createMove({
      id: novoId("estqmov"),
      itemRef: item.id,
      setor: item.setor,
      tipo: "SAIDA",
      quantidade: 1,
      movDate: hoje,
      lote: bipLido?.lote || sugestao?.lote || "",
      validade: bipLido?.validade ?? sugestao?.validade ?? null,
      compraRef: null,
      motivo: "bip (leitor)",
      createdAt: new Date().toISOString(),
    });
    setFeedback(`Saída de 1 ${item.unidade} — ${item.nome} (bip).`);
    setBipItem(null);
    setBipLido(null);
    setBipTexto("");
  }

  async function bipEntrada(item: EstoqueItem, quantidade: number) {
    await estoque.createMove({
      id: novoId("estqmov"),
      itemRef: item.id,
      setor: item.setor,
      tipo: "ENTRADA",
      quantidade,
      movDate: hoje,
      lote: bipLido?.lote ?? "",
      validade: bipLido?.validade ?? null,
      compraRef: null,
      motivo: "bip (leitor)",
      createdAt: new Date().toISOString(),
    });
    setFeedback(
      `Entrada de ${quantidade} ${item.unidade} — ${item.nome}${bipLido?.lote ? ` · lote ${bipLido.lote}` : ""}${bipLido?.validade ? ` · val. ${diaBR(bipLido.validade)}` : ""} (bip).`,
    );
    setBipItem(null);
    setBipLido(null);
    setBipTexto("");
  }

  async function bipVincular() {
    const item = estoque.items.find((existing) => existing.id === bipVincularRef);
    if (!item || !bipDesconhecido) return;
    await estoque.upsertItem({ ...item, codigoBarras: bipLido?.gtin || bipDesconhecido });
    setFeedback(`Código ${bipLido?.gtin || bipDesconhecido} gravado no item "${item.nome}" — o próximo bip acha sozinho.`);
    setBipDesconhecido("");
    setBipVincularRef("");
    setBipItem(item);
  }

  // ---------------- relatórios ----------------
  function imprimirPosicao() {
    const relatorio = relatorioPosicao(estoque.items, estoque.moves, setor, hoje, estoque.compras, pedidos);
    const linhas = relatorio.linhas
      .map(
        (linha) =>
          `<tr><td>${linha.nome}</td><td>${linha.categoria || "—"}</td><td class="num">${linha.saldo}</td><td class="num">${linha.minimo}</td><td>${statusChip[linha.status].rotulo}</td><td>${linha.ultimo}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${relatorio.titulo}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,sans-serif;color:#2B2E24;margin:28px}
        h1{font-size:20px;margin:0}
        p.meta{color:#666;font-size:12px;margin:4px 0 16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border-bottom:1px solid #ddd;text-align:left;padding:6px 8px}
        th{text-transform:uppercase;font-size:10px;letter-spacing:.04em;color:#4D563B}
        td.num{text-align:right;font-variant-numeric:tabular-nums}
        .resumo{margin:0 0 14px;font-size:13px}
      </style></head><body>
      <h1>${relatorio.titulo}</h1>
      <p class="meta">Instituto Bratan · gerado em ${relatorio.geradoEm}</p>
      <p class="resumo"><strong>${relatorio.resumo.total}</strong> itens · <strong>${relatorio.resumo.zerados}</strong> zerados · <strong>${relatorio.resumo.comprar}</strong> abaixo do mínimo · <strong>${relatorio.resumo.vencendo}</strong> lote(s) vencendo</p>
      <table><thead><tr><th>Item</th><th>Categoria</th><th>Saldo</th><th>Mínimo</th><th>Situação</th><th>Último mov.</th></tr></thead>
      <tbody>${linhas}</tbody></table>
      <script>window.print()</script></body></html>`;
    const janela = window.open("", "_blank", "width=900,height=700");
    if (!janela) return;
    janela.document.write(html);
    janela.document.close();
  }

  function imprimirListaDeCompra() {
    const lista = listaDeCompra(estoque.items, estoque.moves, setor, estoque.compras, pedidos);
    if (!lista.length) {
      setFeedback("Nada para comprar: nenhum item zerado ou abaixo do mínimo.");
      return;
    }
    const linhas = lista
      .map(
        (linha) =>
          // Zerado já pedido ou comprado continua na lista (falta hoje), com o aviso — para ninguém comprar de novo.
          `<tr><td>${linha.item.nome}${linha.jaPedido ? ` <em>(já pedido ${numeroDoPedido(linha.jaPedido.numero)})</em>` : linha.jaComprado ? " <em>(já comprado)</em>" : ""}</td><td>${linha.item.categoria || "—"}</td><td class="num">${linha.saldo.toLocaleString("pt-BR")} ${linha.item.unidade}</td><td class="num"><strong>${linha.comprar.toLocaleString("pt-BR")} ${linha.item.unidade}</strong></td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de compras — ${setorLabels[setor]}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,sans-serif;color:#2B2E24;margin:28px}
        h1{font-size:20px;margin:0}
        p.meta{color:#666;font-size:12px;margin:4px 0 16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border-bottom:1px solid #ddd;text-align:left;padding:7px 8px}
        th{text-transform:uppercase;font-size:10px;letter-spacing:.04em;color:#4D563B}
        td.num{text-align:right;font-variant-numeric:tabular-nums}
      </style></head><body>
      <h1>Lista de compras — ${setorLabels[setor]}</h1>
      <p class="meta">Instituto Bratan · gerada em ${diaBR(hoje)} · sugestão repõe até 2× o mínimo</p>
      <table><thead><tr><th>Item</th><th>Categoria</th><th>Saldo</th><th>Comprar</th></tr></thead><tbody>${linhas}</tbody></table>
      <script>window.print()</script></body></html>`;
    const janela = window.open("", "_blank", "width=900,height=700");
    if (!janela) return;
    janela.document.write(html);
    janela.document.close();
  }

  function baixarCsv() {
    const inicio = `${hoje.slice(0, 7)}-01`;
    const csv = csvMovimentos(estoque.items, estoque.moves, setor, inicio, hoje);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    void salvarArquivo(`estoque-${setor.toLowerCase()}-${hoje.slice(0, 7)}.csv`, blob);
  }

  // A frase do cabeçalho (número sempre com frase).
  const fraseDoSetor = (
    <>
      <strong>{setorNomes[setor]}</strong> · quem cuida: {quemCuidaDoSetor(setor)}.{" "}
      {posicao.length ? `${posicao.length} ${posicao.length === 1 ? "item" : "itens"} no estoque` : "Nenhum item cadastrado ainda"}
      {falta.semPedido ? (
        <>
          {"; "}
          <span className="alerta">
            {falta.semPedido} em falta e sem pedido
          </span>
        </>
      ) : posicao.length ? "; nada em falta sem pedido" : ""}
      .
    </>
  );
  const placar: { rotulo: string; valor: number; frase: string; alerta?: boolean }[] = [
    { rotulo: "Itens no setor", valor: posicao.length, frase: setorLabels[setor] },
    {
      rotulo: "Para comprar",
      valor: falta.semPedido,
      // 06/10/2026: o que já foi pedido ou está a caminho não conta como tarefa — só aparece na frase.
      frase: [
        "em falta e ainda sem pedido",
        falta.jaPedidos ? `${falta.jaPedidos} já ${falta.jaPedidos === 1 ? "pedido" : "pedidos"}` : "",
        falta.aCaminho ? `${falta.aCaminho} a caminho` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      alerta: falta.semPedido > 0,
    },
    { rotulo: "Vencendo (60 dias)", valor: alertas.length, frase: "lotes com validade próxima", alerta: alertas.length > 0 },
    { rotulo: "Chegadas a confirmar", valor: chegadas.length, frase: "compras esperando entrada", alerta: chegadas.length > 0 },
  ];

  return (
    <AccessGate allowed={(c) => canSeeModule({ cargo: c }, "estoque")} label="Estoque" module="estoque">
      <div className="mx-auto w-full max-w-[1200px] font-sans text-tinta">
        <Cabecalho
          sobrancelha="Compras e estoque"
          titulo="Estoque por setor"
          frase={
            <>
              {fraseDoSetor}{" "}
              <InfoTip title="Como este estoque funciona" className="align-middle">
                Toda mudança é um movimento (entrada, saída, ajuste ou contagem) — o saldo é sempre a soma deles, nunca um
                número digitado. Cada item tem um mínimo: abaixo dele, a tela acusa COMPRAR. Medicação entra com lote e
                validade, e a saída sugere sempre o lote que vence primeiro. Item em falta: &quot;Pedir compra&quot; abre o
                pedido já preenchido; o Gestor Financeiro aprova, o Financeiro compra e, quando a caixa chega, confirmar o
                recebimento do pedido dá a entrada aqui. Compra marcada &quot;vai para o estoque&quot; no Financeiro aparece
                aqui em cima até alguém confirmar a chegada.
              </InfoTip>
            </>
          }
          acoes={
            <>
              <Botao variante="secundario" tamanho="pq" icone={<Printer className="h-4 w-4" aria-hidden="true" />} onClick={imprimirPosicao} className="max-md:h-11">
                Imprimir posição
              </Botao>
              <Botao variante="secundario" tamanho="pq" icone={<ClipboardList className="h-4 w-4" aria-hidden="true" />} onClick={imprimirListaDeCompra} className="max-md:h-11">
                Lista de compras
              </Botao>
              <Botao variante="secundario" tamanho="pq" icone={<Download className="h-4 w-4" aria-hidden="true" />} onClick={baixarCsv} className="max-md:h-11">
                CSV do mês
              </Botao>
            </>
          }
          rodape={
            // 06/10/2026: o texto "Dois estoques" ficou para trás — cada cargo virou um setor.
            <FraseDoFluxo link={{ to: "/compras", rotulo: "Ver os pedidos" }}>
              Cada setor cuida do próprio estoque. Quando falta, o setor pede a compra; o Gestor Financeiro aprova e a entrada cai aqui ao confirmar a chegada.
            </FraseDoFluxo>
          }
        />

        {/* Troca de setor (06/10/2026): os setores da pessoa como abas; com
            muitos setores (a coordenação vê os 10), o resto vai para um
            seletor compacto em vez de uma fileira de abas. */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-fio">
          <Abas
            rotulo="Setores do estoque"
            valor={telaSetores.botoes.includes(setor) ? setor : "__outro__"}
            onMudar={(id) => {
              if (ehEstoqueSetor(id)) setSetor(id);
            }}
            itens={telaSetores.botoes.map((chave) => ({ id: chave, rotulo: setorLabels[chave] }))}
            className="min-w-0 border-b-0"
          />
          <div className="flex flex-wrap items-center gap-3 pb-2">
            {telaSetores.noSeletor.length ? (
              <label className="flex items-center gap-2">
                <span className="sr-only">Ver outro setor</span>
                <CampoSelecao
                  value={telaSetores.noSeletor.includes(setor) ? setor : ""}
                  onChange={(event) => {
                    if (ehEstoqueSetor(event.target.value)) setSetor(event.target.value);
                  }}
                  className={cn("h-9 w-auto", telaSetores.noSeletor.includes(setor) && "border-musgo font-bold text-musgo")}
                >
                  <option value="">Outros setores ({telaSetores.noSeletor.length})…</option>
                  {telaSetores.noSeletor.map((chave) => (
                    <option key={chave} value={chave}>
                      {setorNomes[chave]}
                    </option>
                  ))}
                </CampoSelecao>
              </label>
            ) : null}
            {/* Ficha de aplicação (29/09/2026): a saída de medicação aplicada nasce lá, com paciente e lote. */}
            {setor === "ENFERMAGEM" && canSeeModule(pessoa, "aplicacoes") ? <LinkSeta to="/estoque/aplicacoes">Aplicações</LinkSeta> : null}
          </div>
        </div>

        <div className="grid gap-6">
          {feedback ? (
            <Recado tom="ok" role="status" icone={<CheckCircle2 aria-hidden="true" />}>
              <strong>{feedback}</strong>
            </Recado>
          ) : null}
          {erro ? (
            <Recado tom="erro" role="alert" icone={<AlertTriangle aria-hidden="true" />}>
              <strong>{erro}</strong>
            </Recado>
          ) : null}

          {/* Placar: para saber, sem borda. */}
          <BlocoSaber as="section" aria-label={`Resumo de ${setorNomes[setor]}`} className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            {placar.map((cartao) => (
              <div key={cartao.rotulo} className="min-w-0">
                <p className={RUBRICA}>{cartao.rotulo}</p>
                <p className={cn("mt-2 font-serifa text-[32px] font-normal leading-none tabular-nums", cartao.alerta ? "text-atencao" : "text-tinta")}>{cartao.valor}</p>
                <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{cartao.frase}</p>
              </div>
            ))}
          </BlocoSaber>

          {/* PEDIR TUDO O QUE ESTÁ EM FALTA (06/10/2026): um pedido só com todos os
              itens zerados ou abaixo do mínimo que ninguém pediu nem comprou. */}
          {podePedir && pedirTudo.itens.length ? (
            <Recado tom="atencao" icone={<ShoppingCart aria-hidden="true" />}>
              <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="min-w-0 flex-[1_1_16rem]">
                  <strong>
                    {pedirTudo.itens.length} {pedirTudo.itens.length === 1 ? "item em falta" : "itens em falta"} e sem pedido
                  </strong>{" "}
                  em {setorNomes[setor]}. Um pedido só leva todos, com a quantidade sugerida (repõe até 2× o mínimo); dá para ajustar antes de enviar.
                  {pedirTudo.deFora ? ` Os outros ${pedirTudo.deFora} ficam para um segundo pedido (o limite é 50 itens).` : ""}
                </span>
                <Botao variante="primario" onClick={() => navigate(pedirTudo.href)} className="max-md:h-11">
                  Pedir tudo o que está em falta
                </Botao>
              </span>
            </Recado>
          ) : null}

          {/* MODO BIPE: o leitor USB digita o código e manda Enter — sem integração. */}
          {podeEditar ? (
            <BlocoFolha as="section" aria-labelledby="estoque-bipar">
              <CabecaDoBloco
                id="estoque-bipar"
                titulo="Bipar código de barras"
                dica={
                  <InfoTip title="Como usar o leitor">
                    Qualquer leitor USB/Bluetooth funciona: ele "digita" o código e dá Enter sozinho — só deixar o cursor
                    nesta caixa. Nas caixas de medicação, o quadradinho DataMatrix (padrão ANVISA) carrega o produto, o
                    lote E a validade: um bip preenche a entrada inteira. Código desconhecido? Vincule uma vez e o próximo
                    bip acha sozinho.
                  </InfoTip>
                }
              />
              <div className="grid gap-3 px-4 pb-4">
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (bipTexto.trim()) receberBip(bipTexto.trim());
                  }}
                >
                  <label htmlFor="estoque-bip" className="sr-only">
                    Código de barras
                  </label>
                  <CampoTexto
                    id="estoque-bip"
                    value={bipTexto}
                    onChange={(event) => setBipTexto(event.target.value)}
                    placeholder="Clique aqui e bipe (ou digite o código e Enter)"
                    className="max-w-md flex-1 font-mono"
                    autoComplete="off"
                  />
                  <Botao type="submit" variante="secundario" icone={<Barcode className="h-4 w-4" aria-hidden="true" />} className="max-md:h-11">
                    Ler
                  </Botao>
                </form>

                {bipItem ? (
                  <Recado tom="ok">
                    <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <span className="min-w-0 flex-[1_1_16rem]">
                        <strong className="block">{bipItem.nome}</strong>
                        <span className="text-[13px] tabular-nums text-tinta-2">
                          saldo {saldoDoItem(estoque.moves, bipItem.id).toLocaleString("pt-BR")} {bipItem.unidade}
                          {bipLido?.lote ? ` · lote lido: ${bipLido.lote}` : ""}
                          {bipLido?.validade ? ` · validade lida: ${diaBR(bipLido.validade)}` : ""}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <Botao variante="primario" tamanho="pq" onClick={() => bipSaida(bipItem)} className="max-md:h-11">
                          Saída de 1 {bipItem.unidade}
                        </Botao>
                        <Botao
                          variante="secundario"
                          tamanho="pq"
                          className="max-md:h-11"
                          onClick={async () => {
                            const resposta = await perguntar(`Entrada de quantas ${bipItem.unidade} de ${bipItem.nome}?`, { valorInicial: "1", confirmar: "Dar entrada" });
                            const quantidade = Number((resposta ?? "").replace(",", "."));
                            if (quantidade > 0) void bipEntrada(bipItem, quantidade);
                          }}
                        >
                          Entrada…
                        </Botao>
                      </span>
                    </span>
                  </Recado>
                ) : null}

                {bipDesconhecido ? (
                  <Recado tom="atencao">
                    <strong className="block">Código {bipDesconhecido} ainda não está em nenhum item deste setor.</strong>
                    <span className="mt-2 flex flex-wrap items-end gap-2">
                      <Campo id="estoque-bip-vincular" rotulo="Vincular ao item" className="w-64 max-w-full">
                        <CampoSelecao id="estoque-bip-vincular" value={bipVincularRef} onChange={(event) => setBipVincularRef(event.target.value)}>
                          <option value="">— escolha o item —</option>
                          {estoque.items
                            .filter((item) => item.setor === setor)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nome}
                              </option>
                            ))}
                        </CampoSelecao>
                      </Campo>
                      <Botao variante="primario" onClick={() => void bipVincular()} disabled={!bipVincularRef} className="max-md:h-11">
                        Vincular código
                      </Botao>
                      <span className="text-[13px] text-tinta-2">ou crie o item em "Novo item" com este código.</span>
                    </span>
                  </Recado>
                ) : null}
              </div>
            </BlocoFolha>
          ) : null}

          {/* Os pedidos de compra deste setor que ainda não chegaram (06/10/2026):
              o devolvido para ajustar e o comprado para confirmar vêm primeiro. */}
          {pedidosDoSetor.length ? (
            <BlocoFolha as="section" aria-labelledby="estoque-pedidos">
              <CabecaDoBloco
                id="estoque-pedidos"
                titulo="Pedidos de compra deste setor"
                detalhe={`${pedidosDoSetor.length} ${pedidosDoSetor.length === 1 ? "pedido" : "pedidos"} ainda sem chegar`}
                dica={
                  <InfoTip title="De onde vem esta lista">
                    São os pedidos de {setorNomes[setor]} que ainda não chegaram. O pedido devolvido volta para o setor ajustar e
                    reenviar; o comprado espera alguém confirmar o recebimento, e é essa confirmação que dá a entrada no estoque.
                  </InfoTip>
                }
              />
              <ul>
                {pedidosDoSetor.map((pedido) => (
                  <li key={pedido.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-fio px-4 py-3 max-md:grid-cols-1">
                    <div className="grid min-w-0 gap-0.5">
                      <p className="text-sm font-bold leading-5 text-tinta [overflow-wrap:anywhere]">
                        <span className="mr-2 font-semibold tabular-nums text-tinta-2">{numeroDoPedido(pedido.numero)}</span>
                        {pedido.titulo}
                      </p>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <SeloDoPedido status={pedido.status} className="whitespace-normal" />
                        <span className="text-[13px] font-medium leading-5 text-tinta-2 [overflow-wrap:anywhere]">
                          {pedido.status === "DEVOLVIDO" && pedido.decisaoNota
                            ? `Motivo: ${pedido.decisaoNota}`
                            : pedido.status === "COMPRADO"
                              ? [pedido.fornecedor, quandoChega(pedido)].filter(Boolean).join(" · ")
                              : `Pedido por ${pedido.solicitanteNome || "alguém do setor"}`}
                        </span>
                      </span>
                    </div>
                    {/* ?pedido= abre o pedido certo na tela de pedidos (pedidoTela.lerPedidoDaUrl);
                        &acao= (07/10/2026) já abre a gaveta do botão — antes caía na lista
                        sem nada aberto e parecia que o toque não tinha feito nada. */}
                    {pedido.status === "COMPRADO" && podeConfirmarChegada ? (
                      <Botao variante="primario" tamanho="pq" icone={<PackageCheck className="h-4 w-4" aria-hidden="true" />} onClick={() => navigate(linkDoPedido(pedido.id, "receber"))} className="max-md:h-11 max-md:justify-self-start">
                        Chegou? Confirmar recebimento
                      </Botao>
                    ) : pedido.status === "DEVOLVIDO" && podePedir && ehDoSetor(pessoa, pedido) ? (
                      <Botao variante="primario" tamanho="pq" onClick={() => navigate(linkDoPedido(pedido.id, "ajustar"))} className="max-md:h-11 max-md:justify-self-start">
                        Ajustar e reenviar
                      </Botao>
                    ) : (
                      <LinkSeta to={linkDoPedido(pedido.id)} className="max-md:min-h-11">
                        Ver o pedido
                      </LinkSeta>
                    )}
                  </li>
                ))}
              </ul>
            </BlocoFolha>
          ) : null}

          {/* Chegadas das Compras */}
          {chegadas.length ? (
            <BlocoFolha as="section" aria-labelledby="estoque-chegadas">
              <CabecaDoBloco
                id="estoque-chegadas"
                titulo="Chegou? Confirme e a entrada é automática"
                detalhe={`${chegadas.length} ${chegadas.length === 1 ? "compra" : "compras"} a caminho`}
                dica={
                  <InfoTip title="De onde vem esta lista">
                    São as compras que o financeiro marcou como "vai para o estoque" deste setor. Confirmar a chegada dá a
                    entrada no item E carimba a compra como recebida no Financeiro — um ato só, sem retrabalho.
                  </InfoTip>
                }
              />
              <ul>
                {chegadas.map((compra) => (
                  <li key={compra.id} className="border-t border-fio px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="grid min-w-0 gap-0.5">
                        <p className="text-sm font-bold leading-5 text-tinta [overflow-wrap:anywhere]">{compra.description}</p>
                        <span className="flex flex-wrap items-center gap-x-3">
                          <Selo estado="a-caminho">A caminho</Selo>
                          <span className="text-[13px] font-medium leading-5 text-tinta-2">
                            Comprado em {diaBR(compra.purchaseDate)}
                            {compra.supplier ? ` · ${compra.supplier}` : ""}
                            {compra.deliveryEta ? ` · previsto ${diaBR(compra.deliveryEta)}` : ""}
                          </span>
                        </span>
                      </div>
                      {podeEditar ? (
                        <Botao
                          variante={chegadaAberta === compra.id ? "secundario" : "primario"}
                          tamanho="pq"
                          aria-expanded={chegadaAberta === compra.id}
                          onClick={() => setChegadaAberta((atual) => (atual === compra.id ? "" : compra.id))}
                          className="max-md:h-11"
                        >
                          {chegadaAberta === compra.id ? "Fechar" : "Chegou — dar entrada"}
                        </Botao>
                      ) : null}
                    </div>
                    {chegadaAberta === compra.id ? (
                      <form className="mt-3 grid gap-3 rounded-bloco bg-saber p-4 md:grid-cols-[1.4fr_0.6fr_0.8fr_0.8fr_auto] md:items-end" onSubmit={(event) => confirmarChegada(compra, event)}>
                        <Campo id={`chegada-${compra.id}-item`} rotulo="Item do estoque">
                          <CampoSelecao id={`chegada-${compra.id}-item`} value={chegadaItemRef} onChange={(event) => setChegadaItemRef(event.target.value)}>
                            <option value="">— escolha o item —</option>
                            {estoque.items
                              .filter((item) => item.setor === setor)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.nome}
                                </option>
                              ))}
                          </CampoSelecao>
                        </Campo>
                        <Campo id={`chegada-${compra.id}-qtd`} rotulo="Quantidade">
                          <CampoTexto id={`chegada-${compra.id}-qtd`} value={chegadaQtd} onChange={(event) => setChegadaQtd(event.target.value)} inputMode="decimal" placeholder="Ex.: 10" className="tabular-nums" />
                        </Campo>
                        <Campo id={`chegada-${compra.id}-lote`} rotulo="Lote (se tiver)">
                          <CampoTexto id={`chegada-${compra.id}-lote`} value={chegadaLote} onChange={(event) => setChegadaLote(event.target.value)} placeholder="Ex.: L2408" />
                        </Campo>
                        <Campo id={`chegada-${compra.id}-validade`} rotulo="Validade">
                          <CampoTexto id={`chegada-${compra.id}-validade`} type="date" value={chegadaValidade} onChange={(event) => setChegadaValidade(event.target.value)} />
                        </Campo>
                        <Botao type="submit" variante="primario" className="max-md:h-11">
                          Confirmar entrada
                        </Botao>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </BlocoFolha>
          ) : null}

          {/* Vencendo */}
          {alertas.length ? (
            <BlocoFolha as="section" aria-labelledby="estoque-validade">
              <CabecaDoBloco
                id="estoque-validade"
                titulo="Validade: use primeiro, troque antes de vencer"
                detalhe={`${alertas.length} ${alertas.length === 1 ? "lote" : "lotes"}`}
              />
              <ul>
                {alertas.map((alerta) => (
                  <li key={`${alerta.item.id}-${alerta.lote.lote}-${alerta.lote.validade}`} className="border-t border-fio px-4 py-2.5 text-sm leading-5">
                    <strong className="font-bold text-tinta">{alerta.item.nome}</strong>{" "}
                    <span className="font-medium text-tinta-2">
                      — lote {alerta.lote.lote || "s/ lote"} ({alerta.lote.saldo} {alerta.item.unidade}) ·{" "}
                    </span>
                    <span className={cn("font-bold", alerta.vencido ? "text-erro" : "text-atencao")}>
                      {alerta.vencido
                        ? `VENCIDO há ${Math.abs(alerta.diasParaVencer)} dia(s) — tirar do estoque com um Ajuste`
                        : `vence em ${alerta.diasParaVencer} dia(s) (${diaBR(alerta.lote.validade)})`}
                    </span>
                  </li>
                ))}
              </ul>
            </BlocoFolha>
          ) : null}

          {/* Posição + novo item */}
          <BlocoFolha as="section" aria-labelledby="estoque-posicao">
            <CabecaDoBloco
              id="estoque-posicao"
              titulo={`Posição — ${setorLabels[setor]}`}
              detalhe={posicao.length ? `${posicao.length} ${posicao.length === 1 ? "item" : "itens"}` : undefined}
              acao={
                podeEditar ? (
                  <Botao
                    variante="secundario"
                    tamanho="pq"
                    aria-expanded={novoAberto}
                    icone={<Plus className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => setNovoAberto((valor) => !valor)}
                    className="max-md:h-11"
                  >
                    Novo item
                  </Botao>
                ) : null
              }
            />
            {novoAberto && podeEditar ? (
              <form
                className="mx-4 mb-4 grid gap-3 rounded-bloco bg-saber p-4 md:grid-cols-[1.4fr_0.9fr_0.45fr_0.9fr_0.55fr_auto] md:items-end"
                onSubmit={salvarItem}
              >
                <Campo id="novo-item-nome" rotulo="Nome do item">
                  <CampoTexto id="novo-item-nome" value={nome} onChange={(event) => setNome(event.target.value)} placeholder={setor === "ENFERMAGEM" ? "Ex.: Undecilato 250mg" : "Ex.: Papel A4"} autoFocus />
                </Campo>
                <Campo id="novo-item-categoria" rotulo="Categoria">
                  <CampoTexto id="novo-item-categoria" value={categoria} onChange={(event) => setCategoria(event.target.value)} list={`categorias-${setor}`} placeholder="Ex.: Medicação" />
                  <datalist id={`categorias-${setor}`}>
                    {categoriasSugeridas[setor].map((sugestao) => (
                      <option key={sugestao} value={sugestao} />
                    ))}
                  </datalist>
                </Campo>
                <Campo id="novo-item-unidade" rotulo="Unidade">
                  <CampoTexto id="novo-item-unidade" value={unidade} onChange={(event) => setUnidade(event.target.value)} placeholder="un, cx, ml" />
                </Campo>
                <Campo
                  id="novo-item-codigo"
                  rotulo={
                    <span className="inline-flex items-center gap-1">
                      Código de barras
                      <InfoTip title="Bipe aqui">Clique no campo e bipe a caixa do produto — o leitor digita o código sozinho. Pode deixar vazio.</InfoTip>
                    </span>
                  }
                >
                  <CampoTexto id="novo-item-codigo" value={codigoBarras} onChange={(event) => setCodigoBarras(event.target.value)} placeholder="bipe ou digite" className="font-mono" />
                </Campo>
                <Campo
                  id="novo-item-minimo"
                  rotulo={
                    <span className="inline-flex items-center gap-1">
                      Mínimo
                      <InfoTip title="Ponto de pedido">Quando o saldo chegar neste número, a tela acusa COMPRAR. Deixe 0 para não avisar.</InfoTip>
                    </span>
                  }
                >
                  <CampoTexto id="novo-item-minimo" value={minimo} onChange={(event) => setMinimo(event.target.value)} inputMode="decimal" placeholder="Ex.: 5" className="tabular-nums" />
                </Campo>
                <Botao type="submit" variante="primario" className="max-md:h-11">
                  Criar
                </Botao>
              </form>
            ) : null}
            {posicao.length === 0 ? (
              <p className="mx-4 mb-4 rounded-bloco bg-saber px-4 py-6 text-center text-sm font-medium leading-6 text-tinta-2">
                {/* 07/10/2026: a parte do Financeiro só para quem entra nele — o
                    marketing e a limpeza editam o próprio estoque, mas não veem o Financeiro. */}
                {podeEditar
                  ? canFinanceiroFull(cargo)
                    ? 'Nenhum item ainda. Crie o primeiro em "Novo item" — ou marque uma compra como "vai para o estoque" no Financeiro.'
                    : 'Nenhum item ainda. Crie o primeiro em "Novo item".'
                  : `Nenhum item cadastrado em ${setorNomes[setor]} ainda.`}
                {/* 06/10/2026: setor novo começa vazio, mas já pode pedir compra (item escrito à mão no pedido). */}
                {podePedir ? (
                  <>
                    {" "}
                    Precisa comprar algo?{" "}
                    <Link to={linkPedirCompra(setor)} className="font-bold text-musgo underline underline-offset-2">
                      Fazer um pedido de compra
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-tinta md:min-w-[44rem]">
                  <thead>
                    <tr>
                      <th scope="col" className={cn(TH, "pl-4")}>
                        Item
                      </th>
                      <th scope="col" className={cn(TH, "max-md:hidden")}>
                        Categoria
                      </th>
                      <th scope="col" className={cn(TH, "text-right max-md:hidden")}>
                        Saldo
                      </th>
                      <th scope="col" className={cn(TH, "text-right max-md:hidden")}>
                        Mínimo
                      </th>
                      <th scope="col" className={cn(TH, "text-right max-md:hidden")}>
                        <span className="inline-flex items-center gap-1">
                          Cobertura
                          <InfoTip title="Para quantos dias dá">
                            Saldo dividido pelo consumo médio dos últimos 60 dias (só saídas). Também sugere o mínimo:
                            consumo × 7 dias de reposição × 1,5 de segurança.
                          </InfoTip>
                        </span>
                      </th>
                      <th scope="col" className={TH}>
                        Situação
                      </th>
                      <th scope="col" className={cn(TH, "pr-4 max-md:hidden")}>
                        Último mov.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {posicao.map((linha) => {
                      const aberto = itemAberto === linha.item.id;
                      const lotes = aberto ? lotesDoItem(estoque.moves, linha.item.id) : [];
                      const kardex = aberto
                        ? estoque.moves.filter((mov) => mov.itemRef === linha.item.id).slice(0, 12)
                        : [];
                      const sugestao = aberto ? loteSugerido(estoque.moves, linha.item.id) : null;
                      return (
                        <FragmentoItem
                          key={linha.item.id}
                          linha={linha}
                          cobertura={coberturaDias(linha.saldo, consumoDiario(estoque.moves, linha.item.id, hoje))}
                          sugestaoMinimo={minimoSugerido(consumoDiario(estoque.moves, linha.item.id, hoje))}
                          aberto={aberto}
                          lotes={lotes}
                          kardex={kardex}
                          sugestaoLote={sugestao?.lote ?? ""}
                          podeEditar={podeEditar}
                          onToggle={() => {
                            setItemAberto((atual) => (atual === linha.item.id ? "" : linha.item.id));
                            setMovTipo("SAIDA");
                          }}
                          onExcluir={async () => {
                            await estoque.deleteItem(linha.item.id);
                            setFeedback(`Item "${linha.item.nome}" removido (o histórico de movimentos fica guardado).`);
                          }}
                          podePedir={podePedir}
                          recusa={recusas.get(linha.item.id) ?? null}
                          onPedir={() => navigate(linkPedirCompra(setor, [linha.item.id]))}
                          formCompra={
                            <CompraDoItem
                              linha={linha}
                              pedidoCompleto={linha.pedidoAberto ? (pedidos.find((pedido) => pedido.id === linha.pedidoAberto?.id) ?? null) : null}
                              ajustaOPedido={
                                podePedir &&
                                Boolean(linha.pedidoAberto) &&
                                ehDoSetor(pessoa, {
                                  setor,
                                  solicitanteId: pedidos.find((pedido) => pedido.id === linha.pedidoAberto?.id)?.solicitanteId ?? null,
                                })
                              }
                              recusa={recusas.get(linha.item.id) ?? null}
                              podeRegistrar={estoque.podeRegistrarCompra}
                              podePedir={podePedir}
                              onPedir={() => navigate(linkPedirCompra(setor, [linha.item.id]))}
                              onJaComprei={() => setJaCompreiItem(linha.item)}
                            />
                          }
                          formMovimento={
                            <form className="grid gap-3 md:grid-cols-[0.9fr_0.6fr_0.7fr_0.8fr_1fr_auto] md:items-end" onSubmit={(event) => lancarMovimento(linha.item, event)}>
                              <Campo id={`mov-${linha.item.id}-tipo`} rotulo="Tipo">
                                <CampoSelecao id={`mov-${linha.item.id}-tipo`} value={movTipo} onChange={(event) => setMovTipo(event.target.value as EstoqueMovTipo)}>
                                  <option value="SAIDA">Saída (usei/entreguei)</option>
                                  <option value="ENTRADA">Entrada manual</option>
                                  <option value="AJUSTE">Ajuste (± achei/quebrou)</option>
                                  <option value="CONTAGEM">Contagem física</option>
                                </CampoSelecao>
                              </Campo>
                              <Campo id={`mov-${linha.item.id}-qtd`} rotulo={movTipo === "CONTAGEM" ? "Contei" : "Qtd"}>
                                <CampoTexto id={`mov-${linha.item.id}-qtd`} value={movQtd} onChange={(event) => setMovQtd(event.target.value)} inputMode="decimal" placeholder={movTipo === "AJUSTE" ? "+2 ou -1" : "Ex.: 1"} className="tabular-nums" />
                              </Campo>
                              <Campo id={`mov-${linha.item.id}-lote`} rotulo="Lote">
                                <CampoTexto id={`mov-${linha.item.id}-lote`} value={movLote} onChange={(event) => setMovLote(event.target.value)} placeholder={movTipo === "SAIDA" && loteSugerido(estoque.moves, linha.item.id) ? `FEFO: ${loteSugerido(estoque.moves, linha.item.id)?.lote}` : "opcional"} />
                              </Campo>
                              <Campo id={`mov-${linha.item.id}-validade`} rotulo="Validade">
                                <CampoTexto id={`mov-${linha.item.id}-validade`} type="date" value={movValidade} onChange={(event) => setMovValidade(event.target.value)} />
                              </Campo>
                              <Campo id={`mov-${linha.item.id}-motivo`} rotulo="Motivo / paciente">
                                <CampoTexto id={`mov-${linha.item.id}-motivo`} value={movMotivo} onChange={(event) => setMovMotivo(event.target.value)} placeholder="opcional" />
                              </Campo>
                              <Botao type="submit" variante="primario" className="max-md:h-11">
                                Lançar
                              </Botao>
                            </form>
                          }
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </BlocoFolha>
        </div>

        {/* Sem banco (prévia), avisa em português; com o banco não há o que dizer. */}
        {estoque.syncMode === "Somente local" ? (
          <p className="mt-8 text-center text-[13px] font-medium text-tinta-2">Modo prévia: o estoque fica só neste aparelho.</p>
        ) : null}
      </div>

      {estoque.podeRegistrarCompra ? (
        <JaCompreiGaveta
          item={jaCompreiItem}
          onFechar={() => setJaCompreiItem(null)}
          onRegistrada={(compra) => {
            estoque.aposRegistrarCompra(compra);
            setFeedback(`Anotado: ${compra.description} foi comprado. Ele sai da lista de comprar e fica "a caminho" até alguém dar a entrada.`);
          }}
        />
      ) : null}
    </AccessGate>
  );
}

// Linha da tabela + detalhe (kardex e lotes). Componente separado só para a
// tabela principal não virar um bloco ilegível.
// 08/10/2026 (redesenho Papel & Musgo): a mesma linha, densa e legível — o
// nome é um botão (teclado e leitor de tela abrem o detalhe), a situação é o
// selo da fundação e o detalhe aberto fica no tom "saber".
function FragmentoItem({
  linha,
  cobertura,
  sugestaoMinimo,
  aberto,
  lotes,
  kardex,
  sugestaoLote,
  podeEditar,
  podePedir,
  recusa,
  onPedir,
  onToggle,
  onExcluir,
  formMovimento,
  formCompra,
}: {
  linha: ReturnType<typeof posicaoDoSetor>[number];
  cobertura: number | null;
  sugestaoMinimo: number;
  aberto: boolean;
  lotes: ReturnType<typeof lotesDoItem>;
  kardex: EstoqueMovimento[];
  sugestaoLote: string;
  podeEditar: boolean;
  /** Pode pedir compra para este setor (06/10/2026). */
  podePedir: boolean;
  /** O último pedido do item foi recusado (07/10/2026): a linha diz antes do botão. */
  recusa: ReturnType<typeof recusaDoItem>;
  onPedir: () => void;
  onToggle: () => void;
  onExcluir: () => void;
  formMovimento: React.ReactNode;
  formCompra: React.ReactNode;
}) {
  const chip = statusChip[linha.status];
  const detalheId = `estoque-item-${linha.item.id}`;
  const td = "border-b border-fio px-3 py-2.5 align-top";
  // "Pedir compra" na própria linha: só o que falta e ninguém pediu nem comprou.
  // 07/10/2026: com o item aberto, o detalhe (CompraDoItem) já tem o "Pedir
  // compra" — dois botões iguais, um embaixo do outro, confundiam.
  const mostrarPedir =
    podePedir && !aberto && (linha.status === "COMPRAR" || linha.status === "ZERADO") && !linha.compraAberta && !linha.pedidoAberto;
  return (
    <>
      <tr className={cn("cursor-pointer transition-colors duration-150 ease-papel hover:bg-saber/70", aberto && "bg-saber")} onClick={onToggle}>
        <td className={cn(td, "pl-4")}>
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={aberto ? detalheId : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className="flex items-start gap-1.5 rounded-sm text-left font-bold leading-5 text-tinta [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
          >
            {aberto ? (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-oliva" aria-hidden="true" />
            ) : (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-oliva" aria-hidden="true" />
            )}
            {linha.item.nome}
          </button>
          {/* No celular, saldo e mínimo descem para baixo do nome (a tabela fica com 2 colunas). */}
          <span className={cn("ml-[22px] block text-[13px] font-medium leading-5 tabular-nums text-tinta-2 md:hidden", linha.status === "ZERADO" && "font-bold text-erro")}>
            tem {linha.saldo.toLocaleString("pt-BR")} {linha.item.unidade}
            {linha.item.minimo > 0 ? ` · mínimo ${linha.item.minimo.toLocaleString("pt-BR")}` : ""}
          </span>
        </td>
        <td className={cn(td, "font-medium text-tinta-2 max-md:hidden")}>{linha.item.categoria || "—"}</td>
        <td className={cn(td, "whitespace-nowrap text-right font-bold tabular-nums max-md:hidden", linha.status === "ZERADO" && "text-erro")}>
          {linha.saldo.toLocaleString("pt-BR")} {linha.item.unidade}
        </td>
        <td className={cn(td, "text-right font-medium tabular-nums text-tinta-2 max-md:hidden")}>{linha.item.minimo > 0 ? linha.item.minimo.toLocaleString("pt-BR") : "—"}</td>
        <td className={cn(td, "whitespace-nowrap text-right font-medium tabular-nums text-tinta-2 max-md:hidden")}>
          {cobertura === null ? "—" : `${cobertura} d`}
          {sugestaoMinimo > 0 && sugestaoMinimo !== linha.item.minimo ? (
            <span className="ml-1 text-xs" title="Mínimo sugerido pelo consumo">
              (mín. sug. {sugestaoMinimo})
            </span>
          ) : null}
        </td>
        <td className={td}>
          <span className="grid justify-items-start gap-0.5">
            <Selo estado={chip.estado} etapas={chip.etapas}>
              {chip.palavra}
            </Selo>
            {/* DESDE QUANDO (21/09/2026): "a caminho" sem data vira desculpa
                eterna. Com a data, a compra esquecida aparece sozinha. */}
            {linha.compraAberta ? (
              <span className="text-[13px] font-medium leading-5 text-tinta-2">
                comprei {diaBR(linha.compraAberta.purchaseDate)}
                {linha.compraAberta.deliveryEta ? ` · chega ${diaBR(linha.compraAberta.deliveryEta)}` : ""}
              </span>
            ) : linha.pedidoAberto ? (
              // 06/10/2026: o pedido diz em que pé está — ninguém pede de novo.
              <span className="text-[13px] font-medium leading-5 text-tinta-2">{fraseDoPedidoNoItem(linha.pedidoAberto)}</span>
            ) : recusa ? (
              // 07/10/2026: a recusa (com o motivo no detalhe) antes do "Pedir compra".
              <span className="text-[13px] font-bold leading-5 text-erro">pedido {recusa.numero} recusado</span>
            ) : null}
            {mostrarPedir ? (
              <AcaoSeta
                className="mt-0.5 max-md:min-h-11"
                onClick={(event) => {
                  event.stopPropagation();
                  onPedir();
                }}
              >
                Pedir compra
              </AcaoSeta>
            ) : null}
          </span>
        </td>
        <td className={cn(td, "whitespace-nowrap pr-4 font-medium tabular-nums text-tinta-2 max-md:hidden")}>{diaBR(linha.ultimoMovimento)}</td>
      </tr>
      {aberto ? (
        <tr id={detalheId} className="bg-saber">
          <td colSpan={7} className="border-b border-fio px-4 py-4">
            <div className="grid gap-4">
              {podeEditar ? formMovimento : null}
              {/* 06/10/2026: a compra do item não depende de editar o estoque —
                  o componente decide (já comprado, já pedido, Já comprei, Pedir compra). */}
              {formCompra}
              {lotes.length ? (
                <div>
                  <p className={cn(RUBRICA, "mb-2")}>Lotes na prateleira (o que vence antes, primeiro)</p>
                  <div className="flex flex-wrap gap-2">
                    {lotes.map((lote) => (
                      <span
                        key={`${lote.lote}-${lote.validade}`}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-controle border px-2.5 py-1 text-[13px] tabular-nums",
                          lote.lote === sugestaoLote ? "border-ouro-fio bg-ouro-claro font-bold text-tinta" : "border-fio-2 bg-folha font-medium text-tinta",
                        )}
                      >
                        {lote.lote} · {lote.saldo} · val. {diaBR(lote.validade)}
                        {lote.lote === sugestaoLote ? <span className="text-ouro"> ← usar este</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <p className={cn(RUBRICA, "mb-2")}>Últimos movimentos</p>
                {kardex.length === 0 ? (
                  <p className="text-[13px] font-medium text-tinta-2">Nenhum movimento ainda.</p>
                ) : (
                  <ul className="grid gap-1">
                    {kardex.map((mov) => (
                      <li key={mov.id} className="text-[13px] font-medium leading-5 text-tinta-2">
                        <span className="tabular-nums">{diaBR(mov.movDate)}</span> · <strong className="font-bold text-tinta">{movTipoLabels[mov.tipo]}</strong>{" "}
                        <span className="tabular-nums">{mov.quantidade}</span>
                        {mov.lote ? ` · lote ${mov.lote}` : ""}
                        {mov.compraRef ? " · veio da compra" : ""}
                        {mov.motivo ? ` · ${mov.motivo}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {podeEditar ? (
                <Botao
                  variante="perigo"
                  tamanho="pq"
                  icone={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onExcluir();
                  }}
                  className="-ml-3 w-fit max-md:h-11"
                >
                  Remover item do catálogo
                </Botao>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
