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
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Barcode,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  PackageCheck,
  Plus,
  Printer,
  ShoppingCart,
  Syringe,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canFinanceiroFull, canSeeModule, isCoordenacao } from "@/lib/access";
import { useCompras } from "@/features/compras/useCompras";
import {
  ehDoSetor,
  numeroDoPedido,
  pedidoStatusClasses,
  pedidoStatusLabels,
  podePedirPara,
  podeReceber,
  type PedidoCompra,
} from "@/features/compras/comprasData";
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

const statusChip = {
  ZERADO: { rotulo: "ZEROU", classe: "border-rose-300 bg-rose-100 text-rose-900" },
  COMPRAR: { rotulo: "COMPRAR", classe: "border-amber-300 bg-amber-100 text-amber-900" },
  OK: { rotulo: "OK", classe: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  // 06/10/2026: o setor já pediu; o pedido espera aprovação ou compra.
  // 07/10/2026: era violeta (fora da marca, e o tema escuro não remapeia o
  // violet-100). Âmbar já é o COMPRAR; o "já pedido" usa o creme/dourado da
  // marca, o mesmo da faixa do pedido no detalhe do item.
  PEDIDO: { rotulo: "PEDIDO FEITO", classe: "border-brand-dourado/60 bg-brand-creme text-brand-musgo" },
  A_CAMINHO: { rotulo: "A CAMINHO", classe: "border-sky-300 bg-sky-100 text-sky-900" },
} as const;

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
    // 07/10/2026: text-sky-700 (era sky-900) — o tema escuro só clareia o 700;
    // com o 900 a confirmação do "Já comprei" ficava azul-escuro no fundo escuro.
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
        <strong>Já comprei.</strong> {linha.compraAberta.supplier || "Fornecedor não anotado"} em {diaBR(linha.compraAberta.purchaseDate)}
        {linha.compraAberta.deliveryEta ? `, previsto para ${diaBR(linha.compraAberta.deliveryEta)}` : ""}.
        {" "}Some daqui quando alguém der a entrada da caixa.
      </div>
    );
  }
  if (linha.pedidoAberto?.status === "DEVOLVIDO") {
    // 07/10/2026: o devolvido NÃO vai chegar — está parado esperando o setor.
    // A frase de antes ("quando chegar, a entrada é dada pelo pedido") fazia a
    // pessoa esperar uma entrega que nunca vinha.
    const motivo = pedidoCompleto?.decisaoNota ?? "";
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <span className="[overflow-wrap:anywhere]">
          <strong>{fraseDoPedidoNoItem(linha.pedidoAberto)}.</strong>{" "}
          {ajustaOPedido ? "Falta você ajustar e reenviar" : "Falta o setor ajustar e reenviar"}
          {motivo ? `: ${motivo}` : "."}
        </span>
        <Button asChild type="button" size="sm" variant="outline">
          <Link to={linkDoPedido(linha.pedidoAberto.id, ajustaOPedido ? "ajustar" : undefined)}>{ajustaOPedido ? "Ajustar e reenviar" : "Ver o pedido"}</Link>
        </Button>
      </div>
    );
  }
  if (linha.pedidoAberto) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/20 bg-white/80 px-3 py-2 text-sm text-brand-tinta">
        <span>
          <strong>{fraseDoPedidoNoItem(linha.pedidoAberto)}.</strong> Não precisa pedir de novo: quando chegar, a entrada é dada pelo
          pedido.
        </span>
        <Button asChild type="button" size="sm" variant="outline">
          <Link to={linkDoPedido(linha.pedidoAberto.id)}>Ver o pedido</Link>
        </Button>
      </div>
    );
  }
  if (linha.status === "OK") return null;
  // 07/10/2026: a última palavra sobre o item foi uma recusa — o motivo vem
  // ANTES do "Pedir compra", para ninguém pedir de novo sem saber por quê.
  const avisoDaRecusa = recusa ? (
    <span className="block text-rose-700 [overflow-wrap:anywhere]">
      <strong>Pedido {recusa.numero} foi recusado</strong>
      {recusa.motivo ? `: ${recusa.motivo}` : "."} Se ainda precisar, peça de novo explicando.
    </span>
  ) : null;
  if (podeRegistrar) {
    // 07/10/2026: o formulário curto (fornecedor, valor, data) gravava PIX fixo,
    // sem conta paga nem categoria. Agora o botão abre a gaveta de compra
    // completa (JaCompreiGaveta): forma de pagamento e, no à vista, a categoria da P12.
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-dourado/40 bg-brand-creme/30 px-3 py-2 text-sm text-brand-tinta">
        <span>Está em falta. Já comprou? Anote a compra: ela entra no Financeiro e o item fica "a caminho".</span>
        <Button type="button" size="sm" onClick={onJaComprei}>
          <ShoppingCart className="mr-1.5 h-4 w-4" aria-hidden="true" /> Já comprei
        </Button>
      </div>
    );
  }
  if (!podePedir) {
    return avisoDaRecusa ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm">{avisoDaRecusa}</div> : null;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-dourado/40 bg-brand-creme/30 px-3 py-2 text-sm text-brand-tinta">
      <span className="min-w-0 flex-1">
        {avisoDaRecusa}
        Está em falta. Peça a compra: o Gestor Financeiro aprova e o Financeiro compra.
      </span>
      <Button type="button" size="sm" onClick={onPedir}>
        <ShoppingCart className="mr-1.5 h-4 w-4" aria-hidden="true" /> Pedir compra
      </Button>
    </div>
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
      setFeedback("Nada para comprar: nenhum item zerado ou abaixo do mínimo. 👌");
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

  return (
    <AccessGate allowed={(c) => canSeeModule({ cargo: c }, "estoque")} label="Estoque" module="estoque">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Operação 360</Badge>
            <Badge variant="muted">{estoque.syncMode}</Badge>
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
            <Boxes className="h-8 w-8 text-brand-oliva" aria-hidden="true" />
            Estoque
            <InfoTip title="Como este estoque funciona">
              Toda mudança é um movimento (entrada, saída, ajuste ou contagem) — o saldo é sempre a soma deles, nunca um
              número digitado. Cada item tem um mínimo: abaixo dele, a tela acusa COMPRAR. Medicação entra com lote e
              validade, e a saída sugere sempre o lote que vence primeiro. Item em falta: &quot;Pedir compra&quot; abre o
              pedido já preenchido; o Gestor Financeiro aprova, o Financeiro compra e, quando a caixa chega, confirmar o
              recebimento do pedido dá a entrada aqui. Compra marcada &quot;vai para o estoque&quot; no Financeiro aparece
              aqui em cima até alguém confirmar a chegada.
            </InfoTip>
          </h1>
          {/* 06/10/2026: o texto "Dois estoques" ficou para trás — cada cargo virou um setor. */}
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Cada setor cuida do próprio estoque: o que tem, o que falta e o que vence. Quando falta, o setor pede a compra
            aqui mesmo; o Gestor Financeiro aprova e a entrada cai no estoque ao confirmar a chegada.
          </p>
          <p className="mt-1 text-sm text-brand-tinta">
            <strong>{setorNomes[setor]}</strong> · quem cuida: {quemCuidaDoSetor(setor)}
          </p>

          {/* Troca de setor (06/10/2026): os setores da pessoa como botões; com
              muitos setores (a coordenação vê os 10), o resto vai para um
              seletor compacto em vez de uma fileira de abas. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {telaSetores.botoes.map((chave) => (
              <button
                key={chave}
                type="button"
                onClick={() => setSetor(chave)}
                aria-pressed={setor === chave}
                className={cn(
                  "min-h-9 rounded-full border px-4 py-1.5 text-sm font-semibold transition",
                  setor === chave
                    ? "border-brand-musgo bg-brand-musgo text-brand-papel"
                    : "border-brand-oliva/25 bg-white/60 text-brand-oliva hover:text-brand-musgo",
                )}
              >
                {setorLabels[chave]}
              </button>
            ))}
            {telaSetores.noSeletor.length ? (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="sr-only">Ver outro setor</span>
                <select
                  value={telaSetores.noSeletor.includes(setor) ? setor : ""}
                  onChange={(event) => {
                    if (ehEstoqueSetor(event.target.value)) setSetor(event.target.value);
                  }}
                  className={cn(
                    "h-9 rounded-full border bg-white/70 px-3 text-sm font-semibold",
                    telaSetores.noSeletor.includes(setor) ? "border-brand-musgo text-brand-musgo" : "border-brand-oliva/25 text-brand-oliva",
                  )}
                >
                  <option value="">Outros setores ({telaSetores.noSeletor.length})…</option>
                  {telaSetores.noSeletor.map((chave) => (
                    <option key={chave} value={chave}>
                      {setorNomes[chave]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <span className="ml-auto flex flex-wrap gap-2">
              {/* Ficha de aplicação (29/09/2026): a saída de medicação aplicada nasce lá, com paciente e lote. */}
              {setor === "ENFERMAGEM" && canSeeModule(pessoa, "aplicacoes") ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/estoque/aplicacoes">
                    <Syringe className="mr-1.5 h-4 w-4" aria-hidden="true" /> Aplicações
                  </Link>
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={imprimirPosicao}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" /> Imprimir posição
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={imprimirListaDeCompra}>
                <ClipboardList className="mr-1.5 h-4 w-4" aria-hidden="true" /> Lista de compras
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={baixarCsv}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" /> CSV do mês
              </Button>
            </span>
          </div>
        </motion.section>

        {feedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {feedback}
          </div>
        ) : null}
        {erro ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50/80 px-4 py-3 text-sm font-semibold text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {erro}
          </div>
        ) : null}

        {/* MODO BIPE: o leitor USB digita o código e manda Enter — sem integração. */}
        {podeEditar ? (
          <Card className="border-brand-musgo/30 bg-white/70 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Barcode className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
                Bipar código de barras
                <InfoTip title="Como usar o leitor">
                  Qualquer leitor USB/Bluetooth funciona: ele "digita" o código e dá Enter sozinho — só deixar o cursor
                  nesta caixa. Nas caixas de medicação, o quadradinho DataMatrix (padrão ANVISA) carrega o produto, o
                  lote E a validade: um bip preenche a entrada inteira. Código desconhecido? Vincule uma vez e o próximo
                  bip acha sozinho.
                </InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (bipTexto.trim()) receberBip(bipTexto.trim());
                }}
              >
                <Input
                  value={bipTexto}
                  onChange={(event) => setBipTexto(event.target.value)}
                  placeholder="Clique aqui e bipe (ou digite o código e Enter)"
                  className="max-w-md font-mono"
                  autoComplete="off"
                />
                <Button type="submit" variant="outline">Ler</Button>
              </form>

              {bipItem ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-brand-tinta">{bipItem.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      saldo {saldoDoItem(estoque.moves, bipItem.id).toLocaleString("pt-BR")} {bipItem.unidade}
                      {bipLido?.lote ? ` · lote lido: ${bipLido.lote}` : ""}
                      {bipLido?.validade ? ` · validade lida: ${diaBR(bipLido.validade)}` : ""}
                    </p>
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => bipSaida(bipItem)}>Saída de 1 {bipItem.unidade}</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const resposta = await perguntar(`Entrada de quantas ${bipItem.unidade} de ${bipItem.nome}?`, { valorInicial: "1", confirmar: "Dar entrada" });
                        const quantidade = Number((resposta ?? "").replace(",", "."));
                        if (quantidade > 0) void bipEntrada(bipItem, quantidade);
                      }}
                    >
                      Entrada…
                    </Button>
                  </div>
                </div>
              ) : null}

              {bipDesconhecido ? (
                <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2.5 text-sm">
                  <p className="font-semibold text-amber-900">
                    Código {bipDesconhecido} ainda não está em nenhum item deste setor.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <Label>Vincular ao item</Label>
                      <select
                        value={bipVincularRef}
                        onChange={(event) => setBipVincularRef(event.target.value)}
                        className="flex h-9 w-64 rounded-md border border-input bg-white/80 px-3 py-1.5 text-sm"
                      >
                        <option value="">— escolha o item —</option>
                        {estoque.items
                          .filter((item) => item.setor === setor)
                          .map((item) => (
                            <option key={item.id} value={item.id}>{item.nome}</option>
                          ))}
                      </select>
                    </div>
                    <Button type="button" size="sm" onClick={() => void bipVincular()} disabled={!bipVincularRef}>
                      Vincular código
                    </Button>
                    <span className="text-xs text-muted-foreground">ou crie o item em "Novo item" com este código.</span>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Placar */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Itens no setor", value: String(posicao.length), hint: setorLabels[setor] },
            {
              label: "Para comprar",
              value: String(falta.semPedido),
              // 06/10/2026: o que já foi pedido ou está a caminho não conta como tarefa — só aparece na frase.
              hint: [
                "em falta e ainda sem pedido",
                falta.jaPedidos ? `${falta.jaPedidos} já ${falta.jaPedidos === 1 ? "pedido" : "pedidos"}` : "",
                falta.aCaminho ? `${falta.aCaminho} a caminho` : "",
              ]
                .filter(Boolean)
                .join(" · "),
              alerta: falta.semPedido > 0,
            },
            { label: "Vencendo (60 dias)", value: String(alertas.length), hint: "lotes com validade próxima", alerta: alertas.length > 0 },
            { label: "Chegadas a confirmar", value: String(chegadas.length), hint: "compras esperando entrada", alerta: chegadas.length > 0 },
          ].map((cardInfo) => (
            <Card key={cardInfo.label} className={cn("shadow-none backdrop-blur", cardInfo.alerta ? "border-amber-300 bg-amber-50/70" : "border-brand-oliva/20 bg-white/70")}>
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{cardInfo.label}</p>
                <p className={cn("mt-1 text-2xl font-bold tabular-nums", cardInfo.alerta ? "text-amber-900" : "text-brand-tinta")}>{cardInfo.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{cardInfo.hint}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* PEDIR TUDO O QUE ESTÁ EM FALTA (06/10/2026): um pedido só com todos os
            itens zerados ou abaixo do mínimo que ninguém pediu nem comprou. */}
        {podePedir && pedirTudo.itens.length ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50/70 px-4 py-3">
            <ShoppingCart className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm leading-6 text-amber-900">
              <strong>
                {pedirTudo.itens.length} {pedirTudo.itens.length === 1 ? "item em falta" : "itens em falta"} e sem pedido
              </strong>{" "}
              em {setorNomes[setor]}. Um pedido só leva todos, com a quantidade sugerida (repõe até 2× o mínimo); dá para
              ajustar antes de enviar.
              {pedirTudo.deFora ? ` Os outros ${pedirTudo.deFora} ficam para um segundo pedido (o limite é 50 itens).` : ""}
            </p>
            <Button type="button" className="min-h-10" onClick={() => navigate(pedirTudo.href)}>
              Pedir tudo o que está em falta
            </Button>
          </div>
        ) : null}

        {/* Os pedidos de compra deste setor que ainda não chegaram (06/10/2026):
            o devolvido para ajustar e o comprado para confirmar vêm primeiro. */}
        {pedidosDoSetor.length ? (
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                Pedidos de compra deste setor
                <InfoTip title="De onde vem esta lista">
                  São os pedidos de {setorNomes[setor]} que ainda não chegaram. O pedido devolvido volta para o setor ajustar e
                  reenviar; o comprado espera alguém confirmar o recebimento, e é essa confirmação que dá a entrada no estoque.
                </InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {pedidosDoSetor.map((pedido) => (
                <div key={pedido.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/15 bg-white/80 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-tinta">
                      <span className="tabular-nums">{numeroDoPedido(pedido.numero)}</span>
                      <span className="min-w-0 truncate">{pedido.titulo}</span>
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", pedidoStatusClasses[pedido.status])}>
                        {pedidoStatusLabels[pedido.status]}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {pedido.status === "DEVOLVIDO" && pedido.decisaoNota
                        ? `Motivo: ${pedido.decisaoNota}`
                        : pedido.status === "COMPRADO"
                          ? [pedido.fornecedor, quandoChega(pedido)].filter(Boolean).join(" · ")
                          : `Pedido por ${pedido.solicitanteNome || "alguém do setor"}`}
                    </p>
                  </div>
                  {/* ?pedido= abre o pedido certo na tela de pedidos (pedidoTela.lerPedidoDaUrl);
                      &acao= (07/10/2026) já abre a gaveta do botão — antes caía na lista
                      sem nada aberto e parecia que o toque não tinha feito nada. */}
                  {pedido.status === "COMPRADO" && podeConfirmarChegada ? (
                    <Button type="button" size="sm" onClick={() => navigate(linkDoPedido(pedido.id, "receber"))}>
                      <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden="true" /> Chegou? Confirmar recebimento
                    </Button>
                  ) : pedido.status === "DEVOLVIDO" && podePedir && ehDoSetor(pessoa, pedido) ? (
                    <Button type="button" size="sm" onClick={() => navigate(linkDoPedido(pedido.id, "ajustar"))}>
                      Ajustar e reenviar
                    </Button>
                  ) : (
                    <Button asChild type="button" size="sm" variant="outline">
                      <Link to={linkDoPedido(pedido.id)}>Ver o pedido</Link>
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Chegadas das Compras */}
        {chegadas.length ? (
          <Card className="border-sky-300 bg-sky-50/50 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageCheck className="h-5 w-5 text-sky-700" aria-hidden="true" />
                Chegou? Confirme e a entrada é automática
                <InfoTip title="De onde vem esta lista">
                  São as compras que o financeiro marcou como "vai para o estoque" deste setor. Confirmar a chegada dá a
                  entrada no item E carimba a compra como recebida no Financeiro — um ato só, sem retrabalho.
                </InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {chegadas.map((compra) => (
                <div key={compra.id} className="rounded-lg border border-sky-200 bg-white/80 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-brand-tinta">{compra.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Comprado em {diaBR(compra.purchaseDate)}
                        {compra.supplier ? ` · ${compra.supplier}` : ""}
                        {compra.deliveryEta ? ` · previsto ${diaBR(compra.deliveryEta)}` : ""}
                      </p>
                    </div>
                    {podeEditar ? (
                      <Button type="button" size="sm" variant={chegadaAberta === compra.id ? "secondary" : "default"} onClick={() => setChegadaAberta((atual) => (atual === compra.id ? "" : compra.id))}>
                        {chegadaAberta === compra.id ? "Fechar" : "Chegou — dar entrada"}
                      </Button>
                    ) : null}
                  </div>
                  {chegadaAberta === compra.id ? (
                    <form className="mt-3 grid gap-3 md:grid-cols-[1.4fr_0.6fr_0.8fr_0.8fr_auto]" onSubmit={(event) => confirmarChegada(compra, event)}>
                      <div>
                        <Label>Item do estoque</Label>
                        <select
                          value={chegadaItemRef}
                          onChange={(event) => setChegadaItemRef(event.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm"
                        >
                          <option value="">— escolha o item —</option>
                          {estoque.items
                            .filter((item) => item.setor === setor)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nome}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <Label>Quantidade</Label>
                        <Input value={chegadaQtd} onChange={(event) => setChegadaQtd(event.target.value)} inputMode="decimal" placeholder="Ex.: 10" />
                      </div>
                      <div>
                        <Label>Lote (se tiver)</Label>
                        <Input value={chegadaLote} onChange={(event) => setChegadaLote(event.target.value)} placeholder="Ex.: L2408" />
                      </div>
                      <div>
                        <Label>Validade</Label>
                        <Input type="date" value={chegadaValidade} onChange={(event) => setChegadaValidade(event.target.value)} />
                      </div>
                      <div className="self-end">
                        <LiquidButton type="submit" size="default">Confirmar entrada</LiquidButton>
                      </div>
                    </form>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Vencendo */}
        {alertas.length ? (
          <Card className="border-amber-300 bg-amber-50/50 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" />
                Validade: use primeiro, troque antes de vencer
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {alertas.map((alerta) => (
                <p key={`${alerta.item.id}-${alerta.lote.lote}-${alerta.lote.validade}`} className={cn(alerta.vencido ? "font-semibold text-rose-800" : "text-amber-900")}>
                  <strong>{alerta.item.nome}</strong> — lote {alerta.lote.lote || "s/ lote"} ({alerta.lote.saldo} {alerta.item.unidade}) ·{" "}
                  {alerta.vencido ? `VENCIDO há ${Math.abs(alerta.diasParaVencer)} dia(s) — tirar do estoque com um Ajuste` : `vence em ${alerta.diasParaVencer} dia(s) (${diaBR(alerta.lote.validade)})`}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Posição + novo item */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                Posição — {setorLabels[setor]}
              </CardTitle>
              {podeEditar ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setNovoAberto((valor) => !valor)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Novo item
                </Button>
              ) : null}
            </div>
            {novoAberto && podeEditar ? (
              <form className="mt-3 grid gap-3 rounded-lg border border-brand-oliva/20 bg-brand-creme/30 p-3 md:grid-cols-[1.4fr_0.9fr_0.45fr_0.9fr_0.55fr_auto]" onSubmit={salvarItem}>
                <div>
                  <Label>Nome do item</Label>
                  <Input value={nome} onChange={(event) => setNome(event.target.value)} placeholder={setor === "ENFERMAGEM" ? "Ex.: Undecilato 250mg" : "Ex.: Papel A4"} autoFocus />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Input value={categoria} onChange={(event) => setCategoria(event.target.value)} list={`categorias-${setor}`} placeholder="Ex.: Medicação" />
                  <datalist id={`categorias-${setor}`}>
                    {categoriasSugeridas[setor].map((sugestao) => (
                      <option key={sugestao} value={sugestao} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Input value={unidade} onChange={(event) => setUnidade(event.target.value)} placeholder="un, cx, ml" />
                </div>
                <div>
                  <Label>
                    Código de barras
                    <InfoTip title="Bipe aqui">Clique no campo e bipe a caixa do produto — o leitor digita o código sozinho. Pode deixar vazio.</InfoTip>
                  </Label>
                  <Input value={codigoBarras} onChange={(event) => setCodigoBarras(event.target.value)} placeholder="bipe ou digite" className="font-mono" />
                </div>
                <div>
                  <Label>
                    Mínimo
                    <InfoTip title="Ponto de pedido">Quando o saldo chegar neste número, a tela acusa COMPRAR. Deixe 0 para não avisar.</InfoTip>
                  </Label>
                  <Input value={minimo} onChange={(event) => setMinimo(event.target.value)} inputMode="decimal" placeholder="Ex.: 5" />
                </div>
                <div className="self-end">
                  <LiquidButton type="submit" size="default">Criar</LiquidButton>
                </div>
              </form>
            ) : null}
          </CardHeader>
          <CardContent>
            {posicao.length === 0 ? (
              <p className="rounded-lg border border-dashed border-brand-oliva/30 bg-white/50 px-4 py-6 text-center text-sm text-muted-foreground">
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
                    <Link to={linkPedirCompra(setor)} className="font-semibold text-brand-musgo underline underline-offset-2">
                      Fazer um pedido de compra
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-brand-oliva/25 text-left text-xs uppercase tracking-wide text-brand-oliva">
                      <th className="py-2 pr-3 font-semibold">Item</th>
                      <th className="py-2 pr-3 font-semibold">Categoria</th>
                      <th className="py-2 pr-3 text-right font-semibold">Saldo</th>
                      <th className="py-2 pr-3 text-right font-semibold">Mínimo</th>
                      <th className="py-2 pr-3 text-right font-semibold">
                        Cobertura
                        <InfoTip title="Para quantos dias dá">
                          Saldo dividido pelo consumo médio dos últimos 60 dias (só saídas). Também sugere o mínimo:
                          consumo × 7 dias de reposição × 1,5 de segurança.
                        </InfoTip>
                      </th>
                      <th className="py-2 pr-3 font-semibold">Situação</th>
                      <th className="py-2 font-semibold">Último mov.</th>
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
                            <form className="grid gap-3 md:grid-cols-[0.8fr_0.6fr_0.7fr_0.8fr_1fr_auto]" onSubmit={(event) => lancarMovimento(linha.item, event)}>
                              <div>
                                <Label>Tipo</Label>
                                <select value={movTipo} onChange={(event) => setMovTipo(event.target.value as EstoqueMovTipo)} className="flex h-10 w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm">
                                  <option value="SAIDA">Saída (usei/entreguei)</option>
                                  <option value="ENTRADA">Entrada manual</option>
                                  <option value="AJUSTE">Ajuste (± achei/quebrou)</option>
                                  <option value="CONTAGEM">Contagem física</option>
                                </select>
                              </div>
                              <div>
                                <Label>{movTipo === "CONTAGEM" ? "Contei" : "Qtd"}</Label>
                                <Input value={movQtd} onChange={(event) => setMovQtd(event.target.value)} inputMode="decimal" placeholder={movTipo === "AJUSTE" ? "+2 ou -1" : "Ex.: 1"} />
                              </div>
                              <div>
                                <Label>Lote</Label>
                                <Input value={movLote} onChange={(event) => setMovLote(event.target.value)} placeholder={movTipo === "SAIDA" && loteSugerido(estoque.moves, linha.item.id) ? `FEFO: ${loteSugerido(estoque.moves, linha.item.id)?.lote}` : "opcional"} />
                              </div>
                              <div>
                                <Label>Validade</Label>
                                <Input type="date" value={movValidade} onChange={(event) => setMovValidade(event.target.value)} />
                              </div>
                              <div>
                                <Label>Motivo / paciente</Label>
                                <Input value={movMotivo} onChange={(event) => setMovMotivo(event.target.value)} placeholder="opcional" />
                              </div>
                              <div className="self-end">
                                <LiquidButton type="submit" size="default">Lançar</LiquidButton>
                              </div>
                            </form>
                          }
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
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
  // "Pedir compra" na própria linha: só o que falta e ninguém pediu nem comprou.
  // 07/10/2026: com o item aberto, o detalhe (CompraDoItem) já tem o "Pedir
  // compra" — dois botões iguais, um embaixo do outro, confundiam.
  const mostrarPedir =
    podePedir && !aberto && (linha.status === "COMPRAR" || linha.status === "ZERADO") && !linha.compraAberta && !linha.pedidoAberto;
  return (
    <>
      <tr className="cursor-pointer border-b border-brand-oliva/10 hover:bg-brand-creme/30" onClick={onToggle}>
        <td className="py-2 pr-3">
          <span className="flex items-center gap-1.5 font-semibold text-brand-tinta">
            {aberto ? <ChevronDown className="h-3.5 w-3.5 text-brand-oliva" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 text-brand-oliva" aria-hidden="true" />}
            {linha.item.nome}
          </span>
        </td>
        <td className="py-2 pr-3 text-muted-foreground">{linha.item.categoria || "—"}</td>
        <td className="py-2 pr-3 text-right font-semibold tabular-nums">
          {linha.saldo.toLocaleString("pt-BR")} {linha.item.unidade}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{linha.item.minimo > 0 ? linha.item.minimo.toLocaleString("pt-BR") : "—"}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
          {cobertura === null ? "—" : `${cobertura} d`}
          {sugestaoMinimo > 0 && sugestaoMinimo !== linha.item.minimo ? (
            <span className="ml-1 text-[10px] text-brand-oliva" title="Mínimo sugerido pelo consumo">(mín. sug. {sugestaoMinimo})</span>
          ) : null}
        </td>
        <td className="py-2 pr-3">
          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold", chip.classe)}>{chip.rotulo}</span>
          {/* DESDE QUANDO (21/09/2026): "a caminho" sem data vira desculpa
              eterna. Com a data, a compra esquecida aparece sozinha. */}
          {linha.compraAberta ? (
            <span className="mt-0.5 block text-xs leading-tight text-muted-foreground">
              comprei {diaBR(linha.compraAberta.purchaseDate)}
              {linha.compraAberta.deliveryEta ? ` · chega ${diaBR(linha.compraAberta.deliveryEta)}` : ""}
            </span>
          ) : linha.pedidoAberto ? (
            // 06/10/2026: o pedido diz em que pé está — ninguém pede de novo.
            <span className="mt-0.5 block text-xs leading-tight text-muted-foreground">{fraseDoPedidoNoItem(linha.pedidoAberto)}</span>
          ) : recusa ? (
            // 07/10/2026: a recusa (com o motivo no detalhe) antes do "Pedir compra".
            <span className="mt-0.5 block text-xs leading-tight text-rose-700">pedido {recusa.numero} recusado</span>
          ) : null}
          {mostrarPedir ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 h-8 px-2.5 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                onPedir();
              }}
            >
              <ShoppingCart className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Pedir compra
            </Button>
          ) : null}
        </td>
        <td className="py-2 text-muted-foreground">{diaBR(linha.ultimoMovimento)}</td>
      </tr>
      {aberto ? (
        <tr className="border-b border-brand-oliva/10 bg-brand-creme/20">
          <td colSpan={7} className="px-3 py-3">
            <div className="grid gap-4">
              {podeEditar ? formMovimento : null}
              {/* 06/10/2026: a compra do item não depende de editar o estoque —
                  o componente decide (já comprado, já pedido, Já comprei, Pedir compra). */}
              {formCompra}
              {lotes.length ? (
                <div className="text-xs">
                  <p className="mb-1 font-semibold uppercase tracking-wide text-brand-oliva">Lotes na prateleira (o que vence antes, primeiro)</p>
                  <div className="flex flex-wrap gap-2">
                    {lotes.map((lote) => (
                      <span key={`${lote.lote}-${lote.validade}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1", lote.lote === sugestaoLote ? "border-brand-dourado bg-brand-creme font-semibold" : "border-brand-oliva/25 bg-white/70")}>
                        {lote.lote} · {lote.saldo} · val. {diaBR(lote.validade)}
                        {lote.lote === sugestaoLote ? " ← usar este" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="text-xs">
                <p className="mb-1 font-semibold uppercase tracking-wide text-brand-oliva">Últimos movimentos</p>
                {kardex.length === 0 ? (
                  <p className="text-muted-foreground">Nenhum movimento ainda.</p>
                ) : (
                  <ul className="grid gap-0.5">
                    {kardex.map((mov) => (
                      <li key={mov.id} className="text-muted-foreground">
                        {diaBR(mov.movDate)} · <strong className="text-brand-tinta">{movTipoLabels[mov.tipo]}</strong> {mov.quantidade}
                        {mov.lote ? ` · lote ${mov.lote}` : ""}
                        {mov.compraRef ? " · veio da compra" : ""}
                        {mov.motivo ? ` · ${mov.motivo}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {podeEditar ? (
                <button type="button" className="flex w-fit items-center gap-1 text-xs text-rose-700 hover:underline" onClick={(event) => { event.stopPropagation(); onExcluir(); }}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remover item do catálogo
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
