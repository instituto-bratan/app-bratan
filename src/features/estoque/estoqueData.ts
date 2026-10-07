// ESTOQUE (19/08/2026) — o motor, sem React, para poder ser testado.
//
// Começou com dois estoques: RECEPCAO (administrativo, da recepcionista) e
// ENFERMAGEM (medicações e insumos, da enfermeira); PACIENTES entrou em 30/09
// e, em 06/10/2026, cada cargo virou um setor (lista abaixo). As práticas clássicas de
// gestão de estoque, na menor forma que funciona numa clínica:
//
//   · KARDEX — toda mudança é um movimento; o saldo é sempre derivado, nunca
//     gravado (a mesma filosofia do resto do app: derivar > armazenar).
//   · PONTO DE PEDIDO — cada item tem um mínimo; abaixo dele, "comprar".
//   · FEFO (vence-primeiro-sai-primeiro) — medicação tem lote e validade; a
//     saída sugere o lote que vence antes, e o app avisa o que está vencendo.
//   · CONTAGEM CÍCLICA — a contagem física vira um movimento CONTAGEM: o saldo
//     passa a valer o número contado e a divergência fica registrada.
//   · ELO COM AS COMPRAS — compra marcada "vai para o estoque" vira chegada
//     pendente; confirmar a chegada dá a entrada E carimba o "Chegou".
//   · ELO COM OS PEDIDOS DE COMPRA (06/10/2026) — item com pedido aberto vira
//     "Pedido feito" (esperando aprovação ou compra) e, depois de comprado,
//     "a caminho". A compra de um pedido se recebe PELO PEDIDO, então ela não
//     aparece de novo como "chegada pendente".
import type { FinPurchase } from "@/features/financeiro/financeiroData";

// PACIENTES (30/09/2026, pedido da CEO): cortesias da sala de espera e itens
// dos banheiros. Todo mundo vê; só a Aline (secretaria executiva) e a CEO mexem.
//
// CADA CARGO É UM SETOR (06/10/2026, pedidos de compra). Lucas: *"cada usuário,
// que é cada setor (enfermagem, recepção, comercial, eu/financeiro, a CEO…),
// vai cuidar do seu próprio estoque"*. Os setores novos não criam cargo novo
// (cargo novo quebra CRM, is_coordenacao e Acessos): cada setor diz quais
// cargos cuidam dele. É a MESMA lista da tabela `setor` do banco
// (202610060001_pedidos_de_compra.sql) — tests/compras-pedidos.test.mjs lê o
// seed da migração e confere código por código, cargo por cargo.
export type EstoqueSetor =
  | "RECEPCAO"
  | "ENFERMAGEM"
  | "PACIENTES"
  | "COMERCIAL"
  | "FINANCEIRO"
  | "DIRETORIA"
  | "CONSULTORIO"
  | "NUTRICAO"
  | "MARKETING"
  | "LIMPEZA";

/** Os setores na ordem da tabela `setor` (coluna ordem). */
export const setoresEmOrdem: EstoqueSetor[] = [
  "RECEPCAO",
  "ENFERMAGEM",
  "PACIENTES",
  "COMERCIAL",
  "FINANCEIRO",
  "DIRETORIA",
  "CONSULTORIO",
  "NUTRICAO",
  "MARKETING",
  "LIMPEZA",
];

/** Rótulo longo, o que a tela de Estoque já mostrava (os três antigos não mudaram). */
export const setorLabels: Record<EstoqueSetor, string> = {
  RECEPCAO: "Recepção (administrativo)",
  ENFERMAGEM: "Enfermagem (medicações & saúde)",
  PACIENTES: "Pacientes (cortesias & banheiros)",
  COMERCIAL: "Comercial",
  FINANCEIRO: "Financeiro",
  DIRETORIA: "Diretoria (CEO)",
  CONSULTORIO: "Consultório (Dr. Daniel)",
  NUTRICAO: "Nutrição",
  MARKETING: "Marketing",
  LIMPEZA: "Limpeza",
};

/** Nome curto do setor — igual à coluna `nome` da tabela `setor` (listas, pedidos, planilhas). */
export const setorNomes: Record<EstoqueSetor, string> = {
  RECEPCAO: "Recepção",
  ENFERMAGEM: "Enfermagem",
  PACIENTES: "Pacientes (Concierge)",
  COMERCIAL: "Comercial",
  FINANCEIRO: "Financeiro",
  DIRETORIA: "Diretoria (CEO)",
  CONSULTORIO: "Consultório (Dr. Daniel)",
  NUTRICAO: "Nutrição",
  MARKETING: "Marketing",
  LIMPEZA: "Limpeza",
};

/**
 * Os cargos que pertencem a cada setor — coluna `cargos` da tabela `setor`.
 * ENFERMAGEM mantém a nutricionista (regra de 19/08); PACIENTES continua da
 * Aline e da CEO (regra de 30/09).
 */
export const setorCargos: Record<EstoqueSetor, string[]> = {
  RECEPCAO: ["recepcionista"],
  ENFERMAGEM: ["enfermeira", "nutricionista"],
  PACIENTES: ["secretaria_executiva", "ceo"],
  COMERCIAL: ["gestor"],
  FINANCEIRO: ["gestor_financeiro"],
  DIRETORIA: ["ceo"],
  CONSULTORIO: ["dr_daniel"],
  NUTRICAO: ["nutricionista"],
  MARKETING: ["marketing"],
  LIMPEZA: ["limpeza"],
};

/** Quem cuida de cada setor (o cargo principal) — aparece na tela e guia o acesso. */
export const setorDona: Record<EstoqueSetor, string> = {
  RECEPCAO: "recepcionista",
  ENFERMAGEM: "enfermeira",
  PACIENTES: "secretaria_executiva",
  COMERCIAL: "gestor",
  FINANCEIRO: "gestor_financeiro",
  DIRETORIA: "ceo",
  CONSULTORIO: "dr_daniel",
  NUTRICAO: "nutricionista",
  MARKETING: "marketing",
  LIMPEZA: "limpeza",
};

export function ehEstoqueSetor(valor: unknown): valor is EstoqueSetor {
  return typeof valor === "string" && (setoresEmOrdem as string[]).includes(valor);
}

/**
 * Quem pode MEXER em cada setor — a mesma regra da função estoque_pode do banco:
 *   · PACIENTES: só os cargos do setor (Aline e CEO) — nem a coordenação;
 *   · os demais: a coordenação, ou os cargos do setor.
 * Nos três setores antigos o resultado é exatamente o de antes de 06/10.
 */
export function podeMexerNoSetor(cargo: string | null | undefined, setor: EstoqueSetor, ehCoordenacao: boolean) {
  const doSetor = Boolean(cargo && (setorCargos[setor] ?? []).includes(cargo));
  if (setor === "PACIENTES") return doSetor;
  return ehCoordenacao || doSetor;
}

/** Quais setores a pessoa enxerga: PACIENTES é de todos; os outros, de quem mexe. */
export function setoresVisiveis(cargo: string | null | undefined, ehCoordenacao: boolean): EstoqueSetor[] {
  return setoresEmOrdem.filter((setor) => setor === "PACIENTES" || podeMexerNoSetor(cargo, setor, ehCoordenacao));
}

/**
 * Os setores que SÃO da pessoa — o cargo dela está na lista do setor (06/10/2026).
 * Diferente de podeMexerNoSetor: a coordenação mexe em quase todos, mas o
 * setor DELA é um só (o Lucas é do Financeiro). É o que a tela de Estoque
 * mostra primeiro e o que a Home cobra como "em falta".
 */
export function setoresDoCargo(cargo: string | null | undefined): EstoqueSetor[] {
  if (!cargo) return [];
  return setoresEmOrdem.filter((setor) => (setorCargos[setor] ?? []).includes(cargo));
}

export type EstoqueItem = {
  id: string;
  setor: EstoqueSetor;
  nome: string;
  categoria: string;
  unidade: string;
  /** Ponto de pedido: abaixo disso o app acusa "comprar". */
  minimo: number;
  /** EAN/GTIN do produto — o que o leitor bipa. Vazio = item sem código. */
  codigoBarras: string;
  observacao: string;
  createdAt: string;
};

export type EstoqueMovTipo = "ENTRADA" | "SAIDA" | "AJUSTE" | "CONTAGEM";

export const movTipoLabels: Record<EstoqueMovTipo, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  AJUSTE: "Ajuste",
  CONTAGEM: "Contagem",
};

export type EstoqueMovimento = {
  id: string;
  itemRef: string;
  setor: EstoqueSetor;
  tipo: EstoqueMovTipo;
  /**
   * ENTRADA/SAIDA: sempre positiva. AJUSTE: com sinal (+achou / −quebrou/venceu).
   * CONTAGEM: o número físico contado — o saldo PASSA A VALER isso.
   */
  quantidade: number;
  movDate: string;
  lote: string;
  validade: string | null;
  /** Compra que originou a entrada (fin_purchases id). */
  compraRef: string | null;
  motivo: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Saldo (a dobra do kardex)
// ---------------------------------------------------------------------------

function ordemCronologica(a: EstoqueMovimento, b: EstoqueMovimento) {
  if (a.movDate !== b.movDate) return a.movDate < b.movDate ? -1 : 1;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

/**
 * Saldo do item: entradas somam, saídas subtraem, ajustes somam com sinal e a
 * CONTAGEM reseta a régua para o número contado (é o que a contagem física
 * significa: a prateleira vence o papel).
 */
export function saldoDoItem(moves: EstoqueMovimento[], itemRef: string) {
  const doItem = moves.filter((mov) => mov.itemRef === itemRef).sort(ordemCronologica);
  let saldo = 0;
  for (const mov of doItem) {
    if (mov.tipo === "ENTRADA") saldo += mov.quantidade;
    else if (mov.tipo === "SAIDA") saldo -= mov.quantidade;
    else if (mov.tipo === "AJUSTE") saldo += mov.quantidade;
    else saldo = mov.quantidade; // CONTAGEM
  }
  return Math.round(saldo * 100) / 100;
}

export type EstoqueStatus = "OK" | "COMPRAR" | "ZERADO" | "PEDIDO" | "A_CAMINHO";

export const estoqueStatusLabels: Record<EstoqueStatus, string> = {
  OK: "OK",
  COMPRAR: "Comprar",
  ZERADO: "Zerado",
  PEDIDO: "Pedido feito",
  A_CAMINHO: "Já comprei — a caminho",
};

// ---------------------------------------------------------------------------
// Pedidos de compra (06/10/2026)
// ---------------------------------------------------------------------------

/**
 * O que o estoque precisa saber de um PEDIDO DE COMPRA. É um tipo mínimo de
 * propósito: o módulo de compras (src/features/compras/comprasData.ts) importa
 * ESTE arquivo, então este não importa aquele — e o PedidoCompra de lá cabe
 * aqui direto, sem conversão.
 */
export type PedidoDoEstoque = {
  id: string;
  numero: number | null;
  status: string;
  compraRef?: string | null;
  previsaoEntrega?: string | null;
  itens: Array<{ estoqueItemRef: string | null }>;
};

/** Pedido feito e ainda não comprado: esperando aprovação, aprovado, ou devolvido para ajuste. */
export const STATUS_PEDIDO_FEITO = ["ENVIADO", "DEVOLVIDO", "APROVADO"] as const;
/** Pedido já comprado e ainda não recebido. */
export const STATUS_PEDIDO_A_CAMINHO = ["COMPRADO"] as const;

export function pedidoEstaFeito(pedido: Pick<PedidoDoEstoque, "status"> | null | undefined) {
  return Boolean(pedido && (STATUS_PEDIDO_FEITO as readonly string[]).includes(pedido.status));
}

export function pedidoEstaACaminho(pedido: Pick<PedidoDoEstoque, "status"> | null | undefined) {
  return Boolean(pedido && (STATUS_PEDIDO_A_CAMINHO as readonly string[]).includes(pedido.status));
}

/**
 * O pedido aberto de um item (o que responde "já pediram isso?").
 *
 * Se houver mais de um (não devia: "Pedir tudo" não repete item com pedido
 * aberto), vale o que está mais adiante no caminho — comprado, depois
 * aprovado, aguardando, devolvido — e, empatando, o de número maior (o mais novo).
 * Recusado, cancelado e recebido não seguram o item: ele volta a pedir compra.
 */
export function pedidoAbertoDoItem(itemId: string, pedidos: PedidoDoEstoque[] = []): PedidoDoEstoque | null {
  const peso: Record<string, number> = { COMPRADO: 0, APROVADO: 1, ENVIADO: 2, DEVOLVIDO: 3 };
  const abertos = pedidos
    .filter((pedido) => pedido.status in peso && pedido.itens.some((linha) => linha.estoqueItemRef === itemId))
    .sort((a, b) => peso[a.status] - peso[b.status] || (b.numero ?? 0) - (a.numero ?? 0));
  return abertos[0] ?? null;
}

/**
 * A compra pertence a um pedido de compra? Essas se recebem pelo pedido
 * ("Chegou? Confirmar recebimento"), que dá a entrada de cada item de uma vez —
 * não pela "chegada pendente" do estoque, senão a mesma caixa entraria duas vezes.
 *
 * Duas formas de saber, porque nem toda listagem de compras traz a coluna
 * fin_purchases.pedido_ref (a do estoque, listRemoteComprasParaEstoque, não
 * traz; e antes da migração de 06/10 ela nem existe):
 *   · a compra tem pedidoRef;
 *   · algum pedido aponta para ela em compraRef (o gatilho do banco preenche).
 * Quem enxerga a compra do setor enxerga os pedidos do setor (as duas regras
 * saem de estoque_pode), então a segunda forma basta sozinha.
 */
export function compraEhDePedido(compra: FinPurchase, pedidos: PedidoDoEstoque[] = []): boolean {
  if (compra.pedidoRef) return true;
  return pedidos.some((pedido) => Boolean(pedido.compraRef) && pedido.compraRef === compra.id);
}

/**
 * A COMPRA ABERTA DE UM ITEM (21/09/2026).
 *
 * Aberta = registrada, com o item apontado, e ainda SEM entrada no estoque.
 * A data de recebimento no Financeiro não basta: alguém pode carimbar
 * "recebido" sem a caixa ter sido conferida e guardada. O que tira o item de
 * "a caminho" é o movimento de entrada, que é quem de fato viu o produto.
 */
export function compraAbertaDoItem(
  itemId: string,
  purchases: FinPurchase[],
  moves: EstoqueMovimento[],
): FinPurchase | null {
  const jaDeuEntrada = new Set(moves.filter((mov) => mov.compraRef).map((mov) => mov.compraRef));
  const abertas = purchases
    .filter((compra) => compra.estoqueItemRef === itemId && !jaDeuEntrada.has(compra.id))
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  return abertas[0] ?? null;
}

/**
 * O status do item.
 *
 * `temCompraAberta` existe porque saldo baixo NÃO quer dizer "comprar" quando a
 * compra já foi feita. Era exatamente isso que fazia a lista gritar COMPRAR
 * para uma medicação que já estava vindo — e o Lucas comprar de novo, ou travar
 * na dúvida. Zerado continua zerado mesmo com compra a caminho: o paciente de
 * hoje não pode esperar a transportadora.
 *
 * `temPedidoFeito` (06/10/2026): o setor já pediu e o pedido ainda não virou
 * compra (aguardando aprovação, aprovado ou devolvido para ajuste). O item
 * deixa de gritar COMPRAR — a tarefa do setor já foi feita — e vira "Pedido
 * feito". Compra registrada vence o pedido: se as duas coisas existem, é
 * "a caminho". Zerado continua zerado aqui também, pelo mesmo motivo.
 */
export function statusDoItem(saldo: number, minimo: number, temCompraAberta = false, temPedidoFeito = false): EstoqueStatus {
  if (saldo <= 0) return "ZERADO";
  if (minimo > 0 && saldo <= minimo) return temCompraAberta ? "A_CAMINHO" : temPedidoFeito ? "PEDIDO" : "COMPRAR";
  return "OK";
}

export type PosicaoItem = {
  item: EstoqueItem;
  saldo: number;
  status: EstoqueStatus;
  ultimoMovimento: string | null;
  /** A compra já feita e ainda não recebida. É o que responde "já comprei?". */
  compraAberta: FinPurchase | null;
  /** O pedido de compra aberto do item (06/10/2026). É o que responde "já pediram?". */
  pedidoAberto: PedidoDoEstoque | null;
};

/**
 * A posição de um setor inteiro, pronta para a tabela e para o relatório.
 * `pedidos` (06/10/2026): os pedidos de compra que a pessoa enxerga — sem eles,
 * o comportamento é exatamente o de antes.
 */
export function posicaoDoSetor(
  items: EstoqueItem[],
  moves: EstoqueMovimento[],
  setor: EstoqueSetor,
  purchases: FinPurchase[] = [],
  pedidos: PedidoDoEstoque[] = [],
): PosicaoItem[] {
  return items
    .filter((item) => item.setor === setor)
    .map((item) => {
      const doItem = moves.filter((mov) => mov.itemRef === item.id);
      const ultimo = doItem.length ? doItem.reduce((a, b) => (ordemCronologica(a, b) >= 0 ? a : b)) : null;
      const saldo = saldoDoItem(moves, item.id);
      const compraAberta = compraAbertaDoItem(item.id, purchases, moves);
      const pedidoAberto = pedidoAbertoDoItem(item.id, pedidos);
      return {
        item,
        saldo,
        // Pedido já comprado conta como compra a caminho, mesmo quando a
        // compra não aponta o item (um pedido costuma ter vários itens).
        status: statusDoItem(saldo, item.minimo, Boolean(compraAberta) || pedidoEstaACaminho(pedidoAberto), pedidoEstaFeito(pedidoAberto)),
        ultimoMovimento: ultimo?.movDate ?? null,
        compraAberta,
        pedidoAberto,
      };
    })
    .sort((a, b) => {
      // Quem precisa de atenção primeiro: zerado, comprar, pedido feito, a
      // caminho, OK. O que já foi pedido ou comprado desce — não é mais tarefa
      // do setor até chegar (o pedido feito ainda espera alguém decidir).
      const peso = { ZERADO: 0, COMPRAR: 1, PEDIDO: 2, A_CAMINHO: 3, OK: 4 } as const;
      if (peso[a.status] !== peso[b.status]) return peso[a.status] - peso[b.status];
      return a.item.nome.localeCompare(b.item.nome, "pt-BR");
    });
}

// ---------------------------------------------------------------------------
// Lotes e validade (FEFO)
// ---------------------------------------------------------------------------

export type LoteSaldo = {
  lote: string;
  validade: string | null;
  saldo: number;
};

/**
 * Saldo por lote: entradas com lote somam, saídas com lote subtraem. Movimentos
 * sem lote (ajuste, contagem, saída sem escolher) não mexem nos lotes — o saldo
 * de lote é um MAPA da prateleira, não uma segunda contabilidade. Por isso o
 * total dos lotes pode ser menor que o saldo do item (nunca é forçado a bater).
 */
export function lotesDoItem(moves: EstoqueMovimento[], itemRef: string): LoteSaldo[] {
  const porLote = new Map<string, LoteSaldo>();
  for (const mov of moves) {
    if (mov.itemRef !== itemRef || !mov.lote) continue;
    const chave = `${mov.lote}|${mov.validade ?? ""}`;
    const atual = porLote.get(chave) ?? { lote: mov.lote, validade: mov.validade, saldo: 0 };
    if (mov.tipo === "ENTRADA") atual.saldo += mov.quantidade;
    else if (mov.tipo === "SAIDA") atual.saldo -= mov.quantidade;
    else if (mov.tipo === "AJUSTE") atual.saldo += mov.quantidade;
    porLote.set(chave, atual);
  }
  return [...porLote.values()]
    .map((lote) => ({ ...lote, saldo: Math.round(lote.saldo * 100) / 100 }))
    .filter((lote) => lote.saldo > 0)
    .sort((a, b) => {
      // FEFO: vence primeiro, sai primeiro. Sem validade vai para o fim.
      if (!a.validade && !b.validade) return a.lote.localeCompare(b.lote);
      if (!a.validade) return 1;
      if (!b.validade) return -1;
      return a.validade.localeCompare(b.validade);
    });
}

/** O lote que a saída deve usar (o primeiro do FEFO). */
export function loteSugerido(moves: EstoqueMovimento[], itemRef: string): LoteSaldo | null {
  return lotesDoItem(moves, itemRef)[0] ?? null;
}

export type AlertaValidade = {
  item: EstoqueItem;
  lote: LoteSaldo;
  diasParaVencer: number;
  vencido: boolean;
};

function diasEntre(deISO: string, ateISO: string) {
  const de = new Date(`${deISO}T12:00:00`);
  const ate = new Date(`${ateISO}T12:00:00`);
  return Math.round((ate.getTime() - de.getTime()) / 86_400_000);
}

/** Lotes com saldo vencendo em até `janelaDias` (ou já vencidos), piores primeiro. */
export function alertasDeValidade(
  items: EstoqueItem[],
  moves: EstoqueMovimento[],
  todayISO: string,
  janelaDias = 60,
): AlertaValidade[] {
  const alertas: AlertaValidade[] = [];
  for (const item of items) {
    for (const lote of lotesDoItem(moves, item.id)) {
      if (!lote.validade) continue;
      const dias = diasEntre(todayISO, lote.validade);
      if (dias > janelaDias) continue;
      alertas.push({ item, lote, diasParaVencer: dias, vencido: dias < 0 });
    }
  }
  return alertas.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
}

// ---------------------------------------------------------------------------
// Chegadas: o elo com as Compras
// ---------------------------------------------------------------------------

/**
 * Compras marcadas para um setor que AINDA não deram entrada no estoque.
 * A régua é o movimento (compraRef), não o "Chegou" da compra: uma compra pode
 * ser carimbada como recebida no Financeiro sem ninguém ter dado a entrada — e
 * é exatamente esse esquecimento que a pendência existe para pegar.
 *
 * Compra de PEDIDO DE COMPRA fica de fora (06/10/2026): ela se recebe pelo
 * pedido, item a item — veja compraEhDePedido.
 */
export function chegadasPendentes(
  purchases: FinPurchase[],
  moves: EstoqueMovimento[],
  setor: EstoqueSetor,
  pedidos: PedidoDoEstoque[] = [],
): FinPurchase[] {
  const jaDeuEntrada = new Set(moves.filter((mov) => mov.compraRef).map((mov) => mov.compraRef));
  return purchases
    .filter((purchase) => purchase.estoqueSetor === setor && !jaDeuEntrada.has(purchase.id) && !compraEhDePedido(purchase, pedidos))
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
}

// ---------------------------------------------------------------------------
// Relatórios (texto puro e CSV — imprimíveis e testáveis)
// ---------------------------------------------------------------------------

const fmtQtd = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const diaBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export type RelatorioPosicao = {
  titulo: string;
  geradoEm: string;
  linhas: { nome: string; categoria: string; saldo: string; minimo: string; status: EstoqueStatus; ultimo: string }[];
  resumo: { total: number; zerados: number; comprar: number; vencendo: number };
};

export function relatorioPosicao(
  items: EstoqueItem[],
  moves: EstoqueMovimento[],
  setor: EstoqueSetor,
  todayISO: string,
  // 06/10/2026: com compras e pedidos, o papel impresso diz "a caminho" e
  // "pedido feito" igual à tela (sem eles, igual a antes).
  purchases: FinPurchase[] = [],
  pedidos: PedidoDoEstoque[] = [],
): RelatorioPosicao {
  const posicao = posicaoDoSetor(items, moves, setor, purchases, pedidos);
  const vencendo = alertasDeValidade(items.filter((item) => item.setor === setor), moves, todayISO).length;
  return {
    titulo: `Posição de estoque — ${setorLabels[setor]}`,
    geradoEm: diaBR(todayISO),
    linhas: posicao.map((linha) => ({
      nome: linha.item.nome,
      categoria: linha.item.categoria,
      saldo: `${fmtQtd(linha.saldo)} ${linha.item.unidade}`,
      minimo: linha.item.minimo > 0 ? `${fmtQtd(linha.item.minimo)} ${linha.item.unidade}` : "—",
      status: linha.status,
      ultimo: diaBR(linha.ultimoMovimento),
    })),
    resumo: {
      total: posicao.length,
      zerados: posicao.filter((linha) => linha.status === "ZERADO").length,
      comprar: posicao.filter((linha) => linha.status === "COMPRAR").length,
      vencendo,
    },
  };
}

/** CSV dos movimentos de um período (abre no Excel; separador ; como o resto do app). */
export function csvMovimentos(
  items: EstoqueItem[],
  moves: EstoqueMovimento[],
  setor: EstoqueSetor,
  start: string,
  end: string,
): string {
  const nomePor = new Map(items.map((item) => [item.id, item.nome]));
  const linhas = moves
    .filter((mov) => mov.setor === setor && mov.movDate >= start && mov.movDate <= end)
    .sort(ordemCronologica)
    .map((mov) =>
      [
        diaBR(mov.movDate),
        nomePor.get(mov.itemRef) ?? mov.itemRef,
        movTipoLabels[mov.tipo],
        String(mov.quantidade).replace(".", ","),
        mov.lote,
        diaBR(mov.validade),
        mov.compraRef ? "compra" : "",
        mov.motivo.replace(/;/g, ","),
      ].join(";"),
    );
  return ["Data;Item;Tipo;Quantidade;Lote;Validade;Origem;Motivo", ...linhas].join("\n");
}


// ---------------------------------------------------------------------------
// Código de barras e GS1 (a automação do "bip")
// ---------------------------------------------------------------------------

export type Gs1Lido = {
  /** GTIN do produto (o "código do item"), sem zeros à esquerda. */
  gtin: string;
  /** Validade (ISO), quando o código carrega — DataMatrix de medicação carrega. */
  validade: string | null;
  lote: string;
  /** O texto cru, para gravar/depurar. */
  cru: string;
};

/**
 * Lê o que o leitor bipou. Três formas chegam aqui:
 *   · EAN-13/EAN-14 puro (só dígitos) — código comum de qualquer produto;
 *   · GS1 DataMatrix das caixas de MEDICAÇÃO no Brasil (padrão ANVISA/SNCM):
 *     AIs 01=GTIN, 17=validade AAMMDD, 10=lote, 21=série. Campos de tamanho
 *     variável terminam no separador FNC1 (ASCII 29) — ou no fim do texto;
 *   · o mesmo GS1 com o prefixo de simbologia "]d2" que alguns leitores mandam.
 *
 * É isso que faz a entrada de medicação se preencher sozinha: um bip traz
 * item + lote + validade de uma vez.
 */
export function parseGs1(texto: string): Gs1Lido | null {
  const cru = texto.trim();
  if (!cru) return null;
  let corpo = cru.replace(/^\]d2/i, "").replace(/^\]C1/i, "");
  // Código simples: só dígitos (EAN-8/12/13/14).
  if (/^\d{8,14}$/.test(corpo)) {
    return { gtin: corpo.replace(/^0+/, ""), validade: null, lote: "", cru };
  }
  const GS = String.fromCharCode(29);
  let gtin = "";
  let validade: string | null = null;
  let lote = "";
  let i = 0;
  const fixos: Record<string, number> = { "01": 14, "17": 6, "11": 6, "15": 6 };
  while (i < corpo.length - 1) {
    if (corpo[i] === GS) {
      i += 1;
      continue;
    }
    const ai = corpo.slice(i, i + 2);
    i += 2;
    if (fixos[ai]) {
      const valor = corpo.slice(i, i + fixos[ai]);
      i += fixos[ai];
      if (ai === "01") gtin = valor.replace(/^0+/, "");
      if (ai === "17" && /^\d{6}$/.test(valor)) {
        const ano = 2000 + Number(valor.slice(0, 2));
        const mes = Number(valor.slice(2, 4));
        let dia = Number(valor.slice(4, 6));
        // Dia 00 no GS1 = "vale o mês inteiro" → último dia do mês.
        if (dia === 0) dia = new Date(ano, mes, 0).getDate();
        validade = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      }
    } else if (ai === "10" || ai === "21" || ai === "30") {
      const fim = corpo.indexOf(GS, i);
      const valor = fim === -1 ? corpo.slice(i) : corpo.slice(i, fim);
      i = fim === -1 ? corpo.length : fim;
      if (ai === "10") lote = valor;
    } else {
      // AI desconhecido: não dá para saber o tamanho — para de ler.
      break;
    }
  }
  if (!gtin && !validade && !lote) return null;
  return { gtin, validade, lote, cru };
}

/** Acha o item pelo código bipado (compara GTIN sem zeros à esquerda). */
export function acharPorCodigo(items: EstoqueItem[], codigo: string): EstoqueItem | null {
  const lido = parseGs1(codigo);
  const chave = (valor: string) => valor.replace(/\D/g, "").replace(/^0+/, "");
  const alvo = lido?.gtin ? lido.gtin : chave(codigo);
  if (!alvo) return null;
  return items.find((item) => item.codigoBarras && chave(item.codigoBarras) === alvo) ?? null;
}

// ---------------------------------------------------------------------------
// Consumo e reposição (a inteligência do ponto de pedido)
// ---------------------------------------------------------------------------

/** Consumo médio por dia: saídas dos últimos `janelaDias`, dividido pela janela. */
export function consumoDiario(moves: EstoqueMovimento[], itemRef: string, todayISO: string, janelaDias = 60) {
  const inicio = new Date(`${todayISO}T12:00:00`);
  inicio.setDate(inicio.getDate() - janelaDias);
  const desde = inicio.toISOString().slice(0, 10);
  let total = 0;
  for (const mov of moves) {
    if (mov.itemRef !== itemRef || mov.tipo !== "SAIDA") continue;
    if (mov.movDate < desde || mov.movDate > todayISO) continue;
    total += mov.quantidade;
  }
  return Math.round((total / janelaDias) * 1000) / 1000;
}

/** Para quantos dias o saldo dá, no ritmo atual. null = sem consumo medido. */
export function coberturaDias(saldo: number, consumoPorDia: number): number | null {
  if (consumoPorDia <= 0) return null;
  return Math.floor(saldo / consumoPorDia);
}

/**
 * Mínimo sugerido = consumo × (dias até repor) × margem de segurança.
 * A fórmula clássica do ponto de pedido, com números da clínica: uma compra
 * demora ~7 dias para chegar e a margem de 50% cobre semana cheia.
 */
export function minimoSugerido(consumoPorDia: number, leadTimeDias = 7, margem = 1.5) {
  if (consumoPorDia <= 0) return 0;
  return Math.ceil(consumoPorDia * leadTimeDias * margem);
}

export type ItemDaListaDeCompra = {
  item: EstoqueItem;
  saldo: number;
  comprar: number;
  /** Compra já registrada e não recebida. Só aparece em item ZERADO, que fica na lista mesmo assim. */
  jaComprado?: FinPurchase | null;
  /** Pedido de compra aberto (06/10/2026). Também só em item ZERADO, pelo mesmo motivo. */
  jaPedido?: PedidoDoEstoque | null;
};

/**
 * Lista de compras do setor: todo item zerado/abaixo do mínimo, com a sugestão
 * de quanto comprar — repõe até 2× o mínimo (chega em cima do ponto de pedido
 * de novo em ~duas janelas), nunca menos que 1.
 */
export function listaDeCompra(
  items: EstoqueItem[],
  moves: EstoqueMovimento[],
  setor: EstoqueSetor,
  purchases: FinPurchase[] = [],
  pedidos: PedidoDoEstoque[] = [],
): ItemDaListaDeCompra[] {
  return posicaoDoSetor(items, moves, setor, purchases, pedidos)
    // O que já foi comprado sai da lista de comprar — é o ponto inteiro: a
    // lista tem que responder "o que falta COMPRAR", não "o que está baixo".
    // Item ZERADO fica mesmo com compra a caminho: falta hoje, e quem atende
    // hoje precisa saber. O mesmo vale para o pedido feito (06/10/2026): sai
    // da lista (status PEDIDO), menos o zerado, que fica marcado "já pedido".
    .filter((linha) => linha.status === "ZERADO" || linha.status === "COMPRAR")
    .map((linha) => ({
      item: linha.item,
      saldo: linha.saldo,
      comprar: Math.max(Math.ceil(linha.item.minimo * 2 - linha.saldo), 1),
      jaComprado: linha.compraAberta,
      jaPedido: linha.pedidoAberto,
    }));
}

/**
 * EM FALTA E SEM PEDIDO (06/10/2026): o que ainda é tarefa do setor — item
 * zerado ou abaixo do mínimo que ninguém pediu nem comprou. É o número que a
 * Home cobra e o que o botão "Pedir tudo o que está em falta" leva.
 */
export function emFaltaSemPedido(posicao: PosicaoItem[]): PosicaoItem[] {
  return posicao.filter(
    (linha) => (linha.status === "COMPRAR" || linha.status === "ZERADO") && !linha.compraAberta && !linha.pedidoAberto,
  );
}

export type ResumoDaFalta = {
  /** Em falta (zerado ou abaixo do mínimo) e sem pedido nem compra — a tarefa. */
  semPedido: number;
  /** Desses, quantos estão zerados (é o que torna a tarefa "para hoje"). */
  zeradosSemPedido: number;
  /** Em falta, com pedido feito que ainda não virou compra. */
  jaPedidos: number;
  /** Em falta, já comprados (pela compra ou pelo pedido) e ainda não recebidos. */
  aCaminho: number;
};

/** Os números da falta de um setor, já separando o que é tarefa do que já anda. */
export function resumoDaFalta(posicao: PosicaoItem[]): ResumoDaFalta {
  const emFalta = posicao.filter((linha) => linha.status !== "OK");
  const semPedido = emFaltaSemPedido(posicao);
  const aCaminho = emFalta.filter((linha) => linha.compraAberta || pedidoEstaACaminho(linha.pedidoAberto));
  const jaPedidos = emFalta.filter(
    (linha) => !linha.compraAberta && pedidoEstaFeito(linha.pedidoAberto),
  );
  return {
    semPedido: semPedido.length,
    zeradosSemPedido: semPedido.filter((linha) => linha.status === "ZERADO").length,
    jaPedidos: jaPedidos.length,
    aCaminho: aCaminho.length,
  };
}

/**
 * O que já foi comprado e ainda não chegou, no setor — a resposta para
 * *"está chegando?"*, numa lista só.
 */
export function oQueEstaChegando(
  items: EstoqueItem[],
  moves: EstoqueMovimento[],
  setor: EstoqueSetor,
  purchases: FinPurchase[],
  hojeISO: string,
): { item: EstoqueItem; compra: FinPurchase; diasDesdeACompra: number; atrasada: boolean }[] {
  const dias = (de: string, ate: string) =>
    Math.round((Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) / 86400000);
  return posicaoDoSetor(items, moves, setor, purchases)
    .filter((linha): linha is PosicaoItem & { compraAberta: FinPurchase } => Boolean(linha.compraAberta))
    .map((linha) => ({
      item: linha.item,
      compra: linha.compraAberta,
      diasDesdeACompra: Math.max(0, dias(linha.compraAberta.purchaseDate, hojeISO)),
      // Passou da data prometida e ninguém deu entrada: é aqui que a compra
      // esquecida aparece, em vez de sumir entre "já comprei" e "chegou".
      atrasada: Boolean(linha.compraAberta.deliveryEta && linha.compraAberta.deliveryEta.slice(0, 10) < hojeISO.slice(0, 10)),
    }))
    .sort((a, b) => b.diasDesdeACompra - a.diasDesdeACompra);
}
