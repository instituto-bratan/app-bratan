// A TELA /compras (06/10/2026) — o que ela decide, sem React, para poder testar.
//
// comprasData.ts é o motor (a máquina de estados, igual à do banco). Aqui fica
// só o que é da TELA: o que a URL pede, a frase do topo, quais botões cada
// pessoa vê em cada pedido, como a lista se divide entre "esperam sua decisão",
// "falta comprar" e o resto, e o que vai no formulário de cada passo. Assim a
// tela fica burra e a regra fica em tests/compras-tela.test.mjs.
import type { EstadoSelo } from "@/components/ui/papel-musgo";
import type { Cargo } from "@/types/database";
import {
  compraAbertaDoItem,
  ehEstoqueSetor,
  pedidoAbertoDoItem,
  saldoDoItem,
  type EstoqueItem,
  type EstoqueMovimento,
  type EstoqueSetor,
  type PedidoDoEstoque,
} from "@/features/estoque/estoqueData";
import type { FinPurchase } from "@/features/financeiro/financeiroData";
import {
  aprovadosParaComprar,
  caixaDeAprovacao,
  contadoresDosPedidos,
  diaEmSaoPaulo,
  diasEsperando,
  ehDoSetor,
  estaAtrasado,
  filtrarPedidos,
  filtroLabels,
  nomeDoSetor,
  numeroDoPedido,
  ordenarPedidos,
  pedidoStatusLabels,
  pedidosDaPessoa,
  podeAprovar,
  podeCancelar,
  podeComprar,
  podePedirPara,
  podeReceber,
  podeTransicionar,
  podeVerPedido,
  tempoEsperandoTexto,
  type FiltroPedidos,
  type PedidoCompra,
  type PedidoStatus,
  type RascunhoItem,
  type Recebimento,
} from "./comprasData";

type Pessoa = { id?: string | null; cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined;

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtdBR = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

// ---------------------------------------------------------------------------
// O que a URL pede
// ---------------------------------------------------------------------------

const FILTROS: FiltroPedidos[] = ["TODOS", "AGUARDANDO", "APROVADOS", "A_CAMINHO", "RECEBIDOS_MES", "DEVOLVIDOS"];

export type PedidoDaUrl = {
  /** Abrir o formulário "Novo pedido". */
  novo: boolean;
  setor: EstoqueSetor | null;
  /** Itens do estoque para vir no pedido (client_ref do estoque_item). */
  itens: string[];
  filtro: FiltroPedidos | null;
  /** Um pedido para abrir e mostrar (cped-…), vindo da Fila do dia. */
  pedido: string | null;
  /**
   * O que fazer nesse pedido (07/10/2026): `receber` abre "Chegou? Confirmar
   * recebimento" e `ajustar` abre "Ajustar e reenviar" — os botões do Estoque e
   * da Fila do dia com esse nome levavam só à lista, e parecia que o toque não
   * tinha feito nada. A tela só abre se a pessoa puder mesmo fazer aquilo.
   */
  acao: "receber" | "ajustar" | null;
  /** Há algo para consumir (a tela limpa a URL depois de usar). */
  temAlgo: boolean;
};

/**
 * Lê `?novo=1&setor=ENFERMAGEM&itens=ref1,ref2` (o botão "Pedir compra" do
 * Estoque), `?filtro=AGUARDANDO` (⌘K "Aprovar pedidos") e `?pedido=cped-…`.
 * `itens` aceita lista com vírgula ou o parâmetro repetido; setor desconhecido
 * é ignorado (o formulário usa o setor principal da pessoa).
 */
export function lerPedidoDaUrl(search: string): PedidoDaUrl {
  // Pelo URL (e não URLSearchParams direto): é o que existe em todo lugar onde a regra roda, inclusive nos testes.
  const params = new URL(`http://tela.local/?${search.startsWith("?") ? search.slice(1) : search}`).searchParams;
  const setorBruto = (params.get("setor") ?? "").trim().toUpperCase();
  const itens = [...params.getAll("itens"), ...params.getAll("item")]
    .flatMap((valor) => valor.split(","))
    .map((valor) => valor.trim())
    .filter(Boolean);
  const filtroBruto = (params.get("filtro") ?? "").trim().toUpperCase();
  const pedido = (params.get("pedido") ?? "").trim() || null;
  const novo = params.get("novo") === "1" || params.get("novo") === "true" || itens.length > 0;
  const filtro = (FILTROS as string[]).includes(filtroBruto) ? (filtroBruto as FiltroPedidos) : null;
  const acaoBruta = (params.get("acao") ?? "").trim().toLowerCase();
  const acao = pedido && (acaoBruta === "receber" || acaoBruta === "ajustar") ? acaoBruta : null;
  return {
    novo,
    setor: ehEstoqueSetor(setorBruto) ? setorBruto : null,
    itens: [...new Set(itens)],
    filtro,
    pedido,
    acao,
    temAlgo: novo || Boolean(filtro) || Boolean(pedido) || params.has("setor"),
  };
}

/**
 * Os itens do estoque pedidos pela URL viram linhas do formulário: só os do
 * setor (o banco recusa item de outro setor), sem repetir, com a quantidade
 * da lista de compras — repõe até 2× o mínimo, nunca menos que 1 (a mesma
 * conta de itensSugeridosDoEstoque).
 */
export function itensDoEstoqueParaPedido(
  refs: string[],
  itens: Pick<EstoqueItem, "id" | "setor" | "nome" | "unidade" | "minimo">[],
  moves: EstoqueMovimento[],
  setor: EstoqueSetor,
): RascunhoItem[] {
  const doSetor = new Map(itens.filter((item) => item.setor === setor).map((item) => [item.id, item]));
  const vistos = new Set<string>();
  const linhas: RascunhoItem[] = [];
  for (const ref of refs) {
    const item = doSetor.get(ref);
    if (!item || vistos.has(ref)) continue;
    vistos.add(ref);
    linhas.push(linhaDoEstoque(item, moves));
  }
  return linhas;
}

/** Uma linha do formulário a partir de um item do estoque (quantidade sugerida). */
export function linhaDoEstoque(item: Pick<EstoqueItem, "id" | "nome" | "unidade" | "minimo">, moves: EstoqueMovimento[]): RascunhoItem {
  const saldo = saldoDoItem(moves, item.id);
  return {
    estoqueItemRef: item.id,
    descricao: item.nome,
    quantidade: Math.max(Math.ceil((item.minimo || 0) * 2 - saldo), 1),
    unidade: item.unidade || "un",
    valorUnitario: null,
    link: "",
  };
}

/** "21/09" a partir de "2026-09-21". */
const diaDaData = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

/**
 * O que já está vindo para o item (07/10/2026): compra registrada ainda sem
 * entrada ("Já comprei" do Estoque) ou OUTRO pedido aberto com ele. É o que
 * impede comprar duas vezes — o status A_CAMINHO do Estoque já sabia disso, mas
 * o formulário do pedido e a caixa de aprovação não.
 *   "já comprado, chega 30/09" · "já comprado em 21/09" · "já no pedido #0012"
 */
export function oQueJaVemDoItem(
  itemRef: string | null,
  moves: EstoqueMovimento[],
  compras: FinPurchase[] = [],
  pedidos: PedidoDoEstoque[] = [],
  pedidoAtualId?: string | null,
): string {
  if (!itemRef) return "";
  const compra = compraAbertaDoItem(itemRef, compras, moves);
  if (compra) return compra.deliveryEta ? `já comprado, chega ${diaDaData(compra.deliveryEta)}` : `já comprado em ${diaDaData(compra.purchaseDate)}`;
  const outro = pedidoAbertoDoItem(
    itemRef,
    pedidos.filter((pedido) => pedido.id !== pedidoAtualId),
  );
  return outro ? `já no pedido ${numeroDoPedido(outro.numero)}` : "";
}

/**
 * "tem 4 cx · mínimo 10" — o que o aprovador precisa ver ao lado do item do
 * estoque. Com as compras e os pedidos (07/10/2026), diz também o que já está
 * vindo: "tem 3 un · mínimo 5 · já comprado, chega 30/09".
 */
export function textoDoEstoque(
  itemRef: string | null,
  itens: Pick<EstoqueItem, "id" | "unidade" | "minimo">[],
  moves: EstoqueMovimento[],
  jaVem?: { compras?: FinPurchase[]; pedidos?: PedidoDoEstoque[]; pedidoAtualId?: string | null },
): string {
  if (!itemRef) return "";
  const item = itens.find((candidato) => candidato.id === itemRef);
  if (!item) return "";
  const saldo = saldoDoItem(moves, item.id);
  const unidade = item.unidade || "un";
  const base = `tem ${qtdBR(saldo)} ${unidade}`;
  const comMinimo = item.minimo > 0 ? `${base} · mínimo ${qtdBR(item.minimo)}` : base;
  const vem = jaVem ? oQueJaVemDoItem(item.id, moves, jaVem.compras, jaVem.pedidos, jaVem.pedidoAtualId) : "";
  return vem ? `${comMinimo} · ${vem}` : comMinimo;
}

// ---------------------------------------------------------------------------
// Prazo (fluxograma: "Prazo de resposta: 1 dia útil. Pedido urgente: no mesmo dia.")
// ---------------------------------------------------------------------------

/**
 * Passou do prazo de resposta? Normal: mais de 1 dia útil esperando. Urgente:
 * o prazo é o mesmo dia — a partir do dia útil seguinte já está atrasado.
 * 07/10/2026: é o estaAtrasado do motor — a mesma régua da Fila do dia e do
 * contador "Aguardando aprovação" (antes cada um contava de um jeito).
 */
export function prazoEstourado(pedido: Pick<PedidoCompra, "status" | "urgencia" | "enviadoEm" | "createdAt">, hojeISO: string) {
  return estaAtrasado(pedido, hojeISO);
}

/** "06/10" a partir de uma data ISO (só o dia). */
export function diaCurto(iso: string | null | undefined) {
  if (!iso) return "";
  const dia = diaEmSaoPaulo(iso);
  const [, mes, d] = dia.split("-");
  return d && mes ? `${d}/${mes}` : dia;
}

/** "06/10 às 14:32", no horário de Brasília — a linha do tempo do pedido. */
export function dataHora(iso: string | null | undefined) {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(data);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")} às ${parte("hour")}:${parte("minute")}`;
}

/** "chega hoje" · "chega amanhã" · "previsão 08/10" · "previsão era 03/10" · "sem previsão". */
export function previsaoTexto(previsao: string | null | undefined, hojeISO: string) {
  if (!previsao) return "sem previsão de entrega";
  if (previsao === hojeISO) return "chega hoje";
  const amanha = new Date(`${hojeISO}T12:00:00Z`);
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  if (previsao === amanha.toISOString().slice(0, 10)) return "chega amanhã";
  return previsao < hojeISO ? `previsão era ${diaCurto(previsao)}` : `previsão ${diaCurto(previsao)}`;
}

/** "para 08/10" · "para hoje" — o "para quando" do pedido. */
export function paraQuandoTexto(precisaAte: string | null | undefined, hojeISO: string) {
  if (!precisaAte) return "";
  if (precisaAte === hojeISO) return "para hoje";
  return precisaAte < hojeISO ? `era para ${diaCurto(precisaAte)}` : `para ${diaCurto(precisaAte)}`;
}

// ---------------------------------------------------------------------------
// Quem vê o quê
// ---------------------------------------------------------------------------

export type PapeisNaTela = {
  /** Decide (Aprovar · Devolver · Recusar): compra_pode_aprovar. */
  aprovador: boolean;
  /** Registra a compra do aprovado: só o financeiro completo grava fin_purchases. */
  comprador: boolean;
};

export function papeisNaTela(pessoa: Pessoa): PapeisNaTela {
  return { aprovador: podeAprovar(pessoa), comprador: podeComprar(pessoa) };
}

export type AcoesDoPedido = {
  decidir: boolean;
  comprar: boolean;
  receber: boolean;
  ajustar: boolean;
  cancelar: boolean;
};

/**
 * Os botões de UM pedido para UMA pessoa — só o que a máquina e o banco
 * aceitariam. `podeEditar` = nível EDITAR na tela "Pedidos de compra" (quem só
 * vê não pede, não recebe, não ajusta nem cancela; decidir e comprar seguem as
 * próprias permissões, como no banco).
 */
export function acoesDoPedido(pedido: PedidoCompra, pessoa: Pessoa, podeEditar = true): AcoesDoPedido {
  // 07/10/2026: o DEVOLVIDO está nas mãos do setor (ou de quem pediu). Quem
  // aprova e a coordenação podiam "Ajustar e reenviar" no lugar dele — o Lucas
  // reenviava para a própria caixa o pedido que ele mesmo devolveu, sem o
  // ajuste pedido, e a tarefa sumia da Fila do setor. É a mesma regra da Fila
  // (pedidosParaAFila): para eles, o devolvido fica só com "Ver itens e histórico".
  const doSetor = podeEditar && podePedirPara(pessoa, pedido.setor) && ehDoSetor(pessoa, pedido);
  const cancelavel = (podeEditar || podeAprovar(pessoa)) && podeCancelar(pessoa, pedido.setor) && podeTransicionar(pedido.status, "CANCELAR");
  return {
    decidir: podeAprovar(pessoa) && podeTransicionar(pedido.status, "APROVAR"),
    comprar: podeComprar(pessoa) && podeTransicionar(pedido.status, "COMPRAR"),
    receber: podeEditar && podeReceber(pessoa, pedido.setor) && podeTransicionar(pedido.status, "RECEBER"),
    ajustar: doSetor && podeTransicionar(pedido.status, "REENVIAR"),
    cancelar: cancelavel && (pedido.status !== "DEVOLVIDO" || doSetor),
  };
}

/**
 * Quem cancelou e por quê (07/10/2026) — a faixa do pedido cancelado. O selo
 * diz só "Cancelado"; a faixa diz "Cancelado por Lucas: <motivo>".
 */
export function quemCancelou(pedido: Pick<PedidoCompra, "status" | "eventos">): { nome: string; motivo: string; em: string } | null {
  if (pedido.status !== "CANCELADO") return null;
  const evento = [...pedido.eventos].reverse().find((candidato) => candidato.tipo === "CANCELADO");
  return evento ? { nome: evento.porNome, motivo: evento.nota, em: evento.em } : { nome: "", motivo: "", em: "" };
}

/** Os pedidos que a pessoa enxerga (no banco é a RLS; na prévia, esta conta). */
export function pedidosVisiveis(pedidos: PedidoCompra[], pessoa: Pessoa) {
  return pedidos.filter((pedido) => podeVerPedido(pessoa, pedido));
}

// ---------------------------------------------------------------------------
// A frase do topo (número sempre com frase)
// ---------------------------------------------------------------------------

export function fraseDoTopo(pedidos: PedidoCompra[], pessoa: Pessoa, hojeISO: string): string {
  const { aprovador, comprador } = papeisNaTela(pessoa);
  const visiveis = pedidosVisiveis(pedidos, pessoa);
  const partes: string[] = [];
  if (aprovador) {
    const caixa = caixaDeAprovacao(visiveis);
    const valor = caixa.reduce((soma, pedido) => soma + (pedido.valorEstimado || 0), 0);
    const atrasados = caixa.filter((pedido) => prazoEstourado(pedido, hojeISO)).length;
    if (caixa.length) {
      partes.push(`${caixa.length} ${caixa.length === 1 ? "espera" : "esperam"} sua decisão${valor > 0 ? ` · ${brl(Math.round(valor * 100) / 100)}` : ""}`);
      if (atrasados) partes.push(`${atrasados} ${atrasados === 1 ? "passou" : "passaram"} do prazo`);
    } else {
      partes.push("Nada esperando sua decisão");
    }
  }
  if (comprador) {
    const aprovados = aprovadosParaComprar(visiveis).length;
    if (aprovados) partes.push(`${aprovados} ${aprovados === 1 ? "aprovado" : "aprovados"} para comprar`);
  }
  if (!aprovador) {
    const meus = pedidosDaPessoa(visiveis, pessoa);
    const c = contadoresDosPedidos(meus, hojeISO);
    const andamento: string[] = [];
    if (c.devolvidos) andamento.push(`${c.devolvidos} ${c.devolvidos === 1 ? "devolvido" : "devolvidos"} para ajuste`);
    if (c.aguardando) andamento.push(`${c.aguardando} aguardando aprovação`);
    if (c.aprovados && !comprador) andamento.push(`${c.aprovados} ${c.aprovados === 1 ? "aprovado" : "aprovados"}, falta comprar`);
    if (c.aCaminho) andamento.push(`${c.aCaminho} a caminho`);
    partes.push(andamento.length ? andamento.join(" · ") : "Nenhum pedido em andamento");
  }
  return partes.join(" · ");
}

// ---------------------------------------------------------------------------
// Como a tela se divide
// ---------------------------------------------------------------------------

export type DivisaoDaTela = {
  /** "Esperam sua decisão" (só para quem aprova, sem filtro). */
  decisao: PedidoCompra[];
  /** "Aprovados — falta comprar" (só para o financeiro completo, sem filtro). */
  comprar: PedidoCompra[];
  /** A lista de baixo: o resto (sem filtro) ou o filtro escolhido. */
  lista: PedidoCompra[];
  tituloDaLista: string;
};

/**
 * Sem filtro: os blocos de ação no topo e, embaixo, o que sobrou — nenhum
 * pedido aparece duas vezes. Com filtro (a pessoa tocou num contador): uma
 * lista só, na ordem que faz sentido para aquele passo, com os mesmos botões.
 */
export function dividirATela(pedidos: PedidoCompra[], pessoa: Pessoa, filtro: FiltroPedidos, hojeISO: string): DivisaoDaTela {
  const { aprovador, comprador } = papeisNaTela(pessoa);
  const visiveis = pedidosVisiveis(pedidos, pessoa);
  if (filtro !== "TODOS") {
    const filtrados = filtrarPedidos(visiveis, filtro, hojeISO);
    const lista = filtro === "AGUARDANDO" ? caixaDeAprovacao(filtrados) : filtro === "APROVADOS" ? aprovadosParaComprar(filtrados) : ordenarPedidos(filtrados);
    return { decisao: [], comprar: [], lista, tituloDaLista: filtroLabels[filtro] };
  }
  const decisao = aprovador ? caixaDeAprovacao(visiveis) : [];
  const comprar = comprador ? aprovadosParaComprar(visiveis) : [];
  const jaAcima = new Set([...decisao, ...comprar].map((pedido) => pedido.id));
  const base = aprovador || comprador ? visiveis : pedidosDaPessoa(visiveis, pessoa);
  const lista = ordenarPedidos(base.filter((pedido) => !jaAcima.has(pedido.id)));
  const tituloDaLista = aprovador || comprador ? (jaAcima.size ? "Os outros pedidos" : "Todos os pedidos") : "Meus pedidos e do meu setor";
  return { decisao, comprar, lista, tituloDaLista };
}

/** Os contadores da faixa do topo, com o que a pessoa enxerga. */
export function contadoresDaTela(pedidos: PedidoCompra[], pessoa: Pessoa, hojeISO: string) {
  return contadoresDosPedidos(pedidosVisiveis(pedidos, pessoa), hojeISO);
}

/** A lista vazia diz o que está acontecendo e qual é o próximo passo. */
export function frasesDaListaVazia(filtro: FiltroPedidos, podePedir: boolean): { titulo: string; texto: string } {
  const proximo = podePedir ? "Falta algo no setor? Toque em Novo pedido." : "Quando um setor pedir, o pedido aparece aqui.";
  switch (filtro) {
    case "AGUARDANDO":
      return { titulo: "Nenhum pedido aguardando aprovação", texto: proximo };
    case "APROVADOS":
      return { titulo: "Nenhum pedido aprovado esperando compra", texto: "Os pedidos aprovados aparecem aqui até alguém do Financeiro registrar a compra." };
    case "A_CAMINHO":
      return { titulo: "Nada a caminho", texto: "Depois que o Financeiro registra a compra, o pedido fica aqui até o setor confirmar que chegou." };
    case "RECEBIDOS_MES":
      return { titulo: "Nada recebido este mês", texto: "O pedido aparece aqui quando o setor confirma que a mercadoria chegou." };
    case "DEVOLVIDOS":
      return { titulo: "Nenhum pedido devolvido para ajuste", texto: "Pedido devolvido volta para quem pediu, com o motivo, para corrigir e reenviar." };
    default:
      return { titulo: "Nenhum pedido por aqui ainda", texto: proximo };
  }
}

// ---------------------------------------------------------------------------
// Os formulários de cada passo
// ---------------------------------------------------------------------------

/**
 * O "Registrar compra" de um pedido aprovado já vem preenchido: a descrição
 * diz de qual pedido é ("Pedido #0012 — Luva nitrílica M e mais 1"), a compra
 * vai para o estoque do setor do pedido e leva o pedido de origem (o gatilho
 * do banco muda o pedido para "comprado"). O valor sugerido é o estimado.
 */
export function compraDoPedido(pedido: PedidoCompra) {
  return {
    description: `Pedido ${numeroDoPedido(pedido.numero)} — ${pedido.titulo}`.trim(),
    supplier: pedido.fornecedor ?? "",
    amount: pedido.valorEstimado > 0 ? pedido.valorEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
    estoqueSetor: pedido.setor,
    estoqueItemRef: null as string | null,
    pedidoRef: pedido.id,
  };
}

/** Para a gravação da compra de um pedido: ainda dá? (o banco confere de novo no gatilho). */
export function podeRegistrarCompraDoPedido(pedido: PedidoCompra, pessoa: Pessoa): string | null {
  if (!podeComprar(pessoa)) return "Só o Financeiro registra a compra de um pedido.";
  if (!podeTransicionar(pedido.status, "COMPRAR")) return `O pedido ${numeroDoPedido(pedido.numero)} não está mais aprovado — recarregue a tela.`;
  return null;
}

export type LinhaDeRecebimento = {
  itemId: string;
  descricao: string;
  pedida: number;
  unidade: string;
  /** Texto como a pessoa digita ("10" ou "2,5"). */
  qtdRecebida: string;
  /** Lote e validade só fazem sentido no item do estoque da Enfermagem (medicação). */
  pedeLote: boolean;
  /** Item escrito à mão não entra no estoque — a tela avisa. */
  entraNoEstoque: boolean;
  lote: string;
  validade: string;
};

/** O recebimento começa com a quantidade pedida em cada item. */
export function recebimentoInicial(pedido: PedidoCompra): LinhaDeRecebimento[] {
  return [...pedido.itens]
    .sort((a, b) => a.ordem - b.ordem)
    .map((item) => ({
      itemId: item.id,
      descricao: item.descricao,
      pedida: item.quantidade,
      unidade: item.unidade || "un",
      qtdRecebida: qtdBR(item.quantidade).replace(/\./g, ""),
      pedeLote: pedido.setor === "ENFERMAGEM" && Boolean(item.estoqueItemRef),
      entraNoEstoque: Boolean(item.estoqueItemRef),
      lote: "",
      validade: "",
    }));
}

/**
 * Número digitado do jeito brasileiro: "2,5" → 2.5, "1.000" → 1000, "2.5" →
 * 2.5. Vazio ou texto → NaN (a máquina recusa com a frase certa).
 */
export function numeroDigitado(texto: string): number {
  const limpo = (texto ?? "").trim().replace(/\s/g, "");
  if (!limpo) return Number.NaN;
  if (limpo.includes(",")) {
    return /^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(limpo) ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number.NaN;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, ""));
  return /^\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : Number.NaN;
}

/** As linhas da tela viram o recebimento que a máquina e o banco leem. */
export function recebimentoDasLinhas(linhas: LinhaDeRecebimento[], divergencia: string): Recebimento {
  return {
    itens: linhas.map((linha) => ({
      itemId: linha.itemId,
      qtdRecebida: numeroDigitado(linha.qtdRecebida),
      lote: linha.pedeLote ? linha.lote.trim() : "",
      validade: linha.pedeLote && linha.validade ? linha.validade : null,
    })),
    divergencia: divergencia.trim(),
  };
}

/**
 * Chegou menos (ou mais) do que foi pedido: "o que não bateu" vira obrigatório
 * (07/10/2026; fluxograma, passo 7) — a tela, o motor e o banco exigem.
 */
export function recebimentoDiferente(linhas: LinhaDeRecebimento[]) {
  return linhas.some((linha) => {
    const n = numeroDigitado(linha.qtdRecebida);
    return Number.isFinite(n) && Math.abs(n - linha.pedida) > 1e-9;
  });
}

// ---------------------------------------------------------------------------
// Redesenho Papel & Musgo (08/10/2026) — o que a tela nova desenha, sem React
// ---------------------------------------------------------------------------

/**
 * O selo de cada situação (imagem 02 aprovada): as 4 marcas de etapa (pedido ·
 * aprovação · compra · recebimento) + a palavra + a cor. Petróleo SÓ no "a
 * caminho"; ouro no que espera a aprovação (é o "agora" de quem aprova).
 */
export const ESTADO_DO_SELO_DO_PEDIDO: Record<PedidoStatus, EstadoSelo> = {
  ENVIADO: "aguardando",
  APROVADO: "aprovado",
  COMPRADO: "a-caminho",
  RECEBIDO: "recebido",
  DEVOLVIDO: "devolvido",
  RECUSADO: "recusado",
  CANCELADO: "cancelado",
};

/** O selo do pedido: estado + a palavra de sempre (pedidoStatusLabels). Para quem compra, o aprovado diz "falta comprar". */
export function seloDoPedido(status: PedidoStatus, opcoes: { faltaComprar?: boolean } = {}): { estado: EstadoSelo; palavra: string } {
  const palavra = status === "APROVADO" && opcoes.faltaComprar ? "Aprovado · falta comprar" : pedidoStatusLabels[status];
  return { estado: ESTADO_DO_SELO_DO_PEDIDO[status], palavra };
}

/**
 * Quanto do prazo de resposta já passou (0 a 1) — o "relógio" da linha: o fio de
 * ouro enche e, passou do prazo, vira cheio e laranja. A régua é a de
 * estaAtrasado (normal: 1 dia útil; urgente: o mesmo dia).
 */
export function fracaoDoPrazo(pedido: Pick<PedidoCompra, "status" | "urgencia" | "enviadoEm" | "createdAt">, hojeISO: string): number {
  if (pedido.status !== "ENVIADO") return 0;
  if (estaAtrasado(pedido, hojeISO)) return 1;
  if (pedido.urgencia === "URGENTE") return 0.5;
  return Math.min(1, (diasEsperando(pedido, hojeISO) + 1) / 3);
}

export type EstadoDaEtapa = "feita" | "agora" | "parou" | "falta";
export type EtapaDoCaminho = {
  chave: "pedido" | "aprovacao" | "compra" | "recebimento";
  rotulo: string;
  estado: EstadoDaEtapa;
  /** A frase ao lado do rótulo (vazia quando o fluxo parou antes desta etapa). */
  texto: string;
  /** Onde parou: devolvido (atenção), recusado (erro) ou cancelado (neutro). */
  tom?: "atencao" | "erro" | "neutro";
};

/**
 * O CAMINHO DO PEDIDO (o selo aberto em pé, imagem 02): as 4 etapas com quem
 * fez e quando. Feita = musgo; a vez dela = ouro, com "agora"; ainda falta =
 * clara; onde o pedido parou (devolvido, recusado, cancelado) leva a cor da situação.
 */
export function caminhoDoPedido(pedido: PedidoCompra, hojeISO: string): EtapaDoCaminho[] {
  const setor = nomeDoSetor(pedido.setor);
  const quemPediu = pedido.solicitanteNome || setor;
  const enviado = pedido.enviadoEm ?? pedido.createdAt;
  const ultimo = (tipo: string) => [...pedido.eventos].reverse().find((evento) => evento.tipo === tipo) ?? null;
  const aprovado = ultimo("APROVADO");
  const status = pedido.status;

  const etapaPedido: EtapaDoCaminho = {
    chave: "pedido",
    rotulo: "Pedido",
    estado: "feita",
    texto: enviado ? `${quemPediu} enviou em ${dataHora(enviado)}` : `${quemPediu} enviou`,
  };

  let aprovacao: EtapaDoCaminho;
  let compra: EtapaDoCaminho = { chave: "compra", rotulo: "Compra", estado: "falta", texto: "o Financeiro compra" };
  let recebimento: EtapaDoCaminho = { chave: "recebimento", rotulo: "Recebimento", estado: "falta", texto: `${setor} confirma quando chegar` };
  const parado = (etapa: EtapaDoCaminho): EtapaDoCaminho => ({ ...etapa, texto: "" });

  if (status === "ENVIADO") {
    const atrasado = estaAtrasado(pedido, hojeISO);
    const espera = diasEsperando(pedido, hojeISO) <= 0 ? "chegou hoje" : `espera ${tempoEsperandoTexto(pedido, hojeISO)}`;
    aprovacao = { chave: "aprovacao", rotulo: "Aprovação", estado: "agora", texto: atrasado ? `${espera} · passou do prazo` : espera };
  } else if (status === "DEVOLVIDO" || status === "RECUSADO") {
    const evento = ultimo(status);
    const quando = pedido.decididoEm ?? evento?.em ?? null;
    aprovacao = {
      chave: "aprovacao",
      rotulo: "Aprovação",
      estado: "parou",
      tom: status === "DEVOLVIDO" ? "atencao" : "erro",
      texto: `${status === "DEVOLVIDO" ? "devolvido para ajuste" : "recusado"}${evento?.porNome ? ` por ${evento.porNome}` : ""}${quando ? ` em ${dataHora(quando)}` : ""}`,
    };
    compra = parado(compra);
    recebimento = parado(recebimento);
  } else if (status === "CANCELADO") {
    const cancelou = quemCancelou(pedido);
    const textoCancelado = `cancelado${cancelou?.nome ? ` por ${cancelou.nome}` : ""}${cancelou?.em ? ` em ${dataHora(cancelou.em)}` : ""}`;
    if (aprovado) {
      aprovacao = { chave: "aprovacao", rotulo: "Aprovação", estado: "feita", texto: `${aprovado.porNome || "aprovado"}${aprovado.porNome ? " aprovou" : ""} em ${dataHora(aprovado.em)}` };
      compra = { ...compra, estado: "parou", tom: "neutro", texto: textoCancelado };
    } else {
      aprovacao = { chave: "aprovacao", rotulo: "Aprovação", estado: "parou", tom: "neutro", texto: textoCancelado };
      compra = parado(compra);
    }
    recebimento = parado(recebimento);
  } else {
    // APROVADO, COMPRADO ou RECEBIDO: a aprovação está feita.
    const quando = aprovado?.em ?? pedido.decididoEm;
    aprovacao = {
      chave: "aprovacao",
      rotulo: "Aprovação",
      estado: "feita",
      texto: `${aprovado?.porNome ? `${aprovado.porNome} aprovou` : "aprovado"}${quando ? ` em ${dataHora(quando)}` : ""}`,
    };
    if (status === "APROVADO") {
      compra = { ...compra, estado: "agora", texto: "o Financeiro cota, compra e registra aqui" };
    } else {
      const partes = [pedido.fornecedor || "fornecedor não anotado", pedido.valorFinal !== null && pedido.valorFinal !== undefined ? brl(pedido.valorFinal) : ""];
      compra = { ...compra, estado: "feita", texto: `${partes.filter(Boolean).join(" · ")}${pedido.compradoEm ? ` · ${diaCurto(pedido.compradoEm)}` : ""}` };
      recebimento =
        status === "COMPRADO"
          ? { ...recebimento, estado: "agora", texto: `${setor} confirma quando chegar · ${previsaoTexto(pedido.previsaoEntrega, hojeISO)}` }
          : {
              ...recebimento,
              estado: "feita",
              texto: `recebido em ${dataHora(pedido.recebidoEm)}${pedido.divergencia ? " · com uma observação na entrega" : ""}`,
            };
    }
  }
  return [etapaPedido, aprovacao, compra, recebimento];
}

export type MedidorDoItem = {
  saldo: number;
  minimo: number;
  /** O que o pedido traz. */
  traz: number;
  /** Com o pedido, fica com. */
  fica: number;
  /** O fim da régua (o maior dos três, com folga). */
  max: number;
  /** Zerado ou no mínimo/abaixo dele: a barra do "tem" fica vermelha. */
  abaixo: boolean;
  unidade: string;
};

/**
 * O medidor do item do estoque no pedido (imagem 02): tem · mínimo · o que o
 * pedido traz · com quanto fica. Só para item do estoque (o escrito à mão não tem saldo).
 */
export function medidorDoItem(
  itemRef: string | null,
  quantidade: number,
  itens: Pick<EstoqueItem, "id" | "unidade" | "minimo">[],
  moves: EstoqueMovimento[],
): MedidorDoItem | null {
  if (!itemRef) return null;
  const item = itens.find((candidato) => candidato.id === itemRef);
  if (!item) return null;
  const saldo = Math.max(0, saldoDoItem(moves, item.id));
  const minimo = Math.max(0, item.minimo || 0);
  const traz = Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 0;
  const fica = saldo + traz;
  const max = Math.max(fica, minimo, 1) * 1.15;
  return { saldo, minimo, traz, fica, max, abaixo: saldo <= 0 || (minimo > 0 && saldo <= minimo), unidade: item.unidade || "un" };
}

/**
 * Aprovar vários de uma vez (decisão do Lucas, 08/10/2026: SEM TETO de valor):
 * os da caixa que ainda não estão na janela do "Desfazer", e quanto somam.
 */
export function loteParaAprovar(caixa: PedidoCompra[], jaAprovando: ReadonlySet<string>): { pedidos: PedidoCompra[]; valor: number } {
  const pedidos = caixa.filter((pedido) => pedido.status === "ENVIADO" && !jaAprovando.has(pedido.id));
  const valor = Math.round(pedidos.reduce((soma, pedido) => soma + (pedido.valorEstimado || 0), 0) * 100) / 100;
  return { pedidos, valor };
}

/** O valor que a linha mostra: o da compra quando já foi comprado; senão o estimado. */
export function valorDoPedido(pedido: Pick<PedidoCompra, "valorFinal" | "valorEstimado">): { valor: number; deOnde: "compra" | "estimado" | "sem" } {
  if (pedido.valorFinal !== null && pedido.valorFinal !== undefined) return { valor: pedido.valorFinal, deOnde: "compra" };
  return pedido.valorEstimado > 0 ? { valor: pedido.valorEstimado, deOnde: "estimado" } : { valor: 0, deOnde: "sem" };
}

export type NotaDaSituacao = { texto: string; tom: "neutro" | "atencao" | "erro" } | null;

/**
 * A frase curta embaixo do selo, na tabela (imagem 02: "Stin Pharma · chega
 * qui, 08/10", "Você pediu: …"). É a faixa do passo de antes (FaixaDoPasso),
 * agora em uma linha: o que falta, o motivo da devolução/recusa, quem cancelou.
 * O aguardando não tem frase: a linha mostra o relógio do prazo. O aprovado,
 * para quem compra, também não: a linha mostra "Registrar compra →".
 */
export function notaDaSituacao(pedido: PedidoCompra, hojeISO: string, opcoes: { quemCompra?: boolean } = {}): NotaDaSituacao {
  switch (pedido.status) {
    case "DEVOLVIDO":
      return { texto: pedido.decisaoNota ? `O que ajustar: “${pedido.decisaoNota}”` : "Voltou para quem pediu ajustar e reenviar", tom: "atencao" };
    case "RECUSADO":
      return { texto: `Motivo: ${pedido.decisaoNota || "sem motivo registrado"}`, tom: "erro" };
    case "CANCELADO": {
      const cancelou = quemCancelou(pedido);
      const quem = cancelou?.nome ? ` por ${cancelou.nome}` : "";
      const quando = cancelou?.em ? ` em ${diaCurto(cancelou.em)}` : "";
      return { texto: `Cancelado${quem}${quando}${cancelou?.motivo ? `: ${cancelou.motivo}` : ""}`, tom: "neutro" };
    }
    case "COMPRADO":
      return { texto: `${pedido.fornecedor || "fornecedor não anotado"} · ${previsaoTexto(pedido.previsaoEntrega, hojeISO)}`, tom: "neutro" };
    case "APROVADO":
      return opcoes.quemCompra ? null : { texto: "o Financeiro vai comprar", tom: "neutro" };
    case "RECEBIDO":
      return { texto: `recebido em ${diaCurto(pedido.recebidoEm)}${pedido.divergencia ? " · com uma observação na entrega" : ""}`, tom: "neutro" };
    default:
      return null;
  }
}

/** Pedido que já saiu do fluxo (recebido, recusado, cancelado): a linha fica mais apagada. */
export function pedidoEncerrado(status: PedidoStatus): boolean {
  return status === "RECEBIDO" || status === "RECUSADO" || status === "CANCELADO";
}
