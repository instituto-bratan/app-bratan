// ESTOQUE (19/08/2026) — o motor, sem React, para poder ser testado.
//
// Dois estoques num módulo só: RECEPCAO (administrativo, da recepcionista) e
// ENFERMAGEM (medicações e insumos, da enfermeira). As práticas clássicas de
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
import type { FinPurchase } from "@/features/financeiro/financeiroData";

export type EstoqueSetor = "RECEPCAO" | "ENFERMAGEM";

export const setorLabels: Record<EstoqueSetor, string> = {
  RECEPCAO: "Recepção (administrativo)",
  ENFERMAGEM: "Enfermagem (medicações & saúde)",
};

/** Quem cuida de cada setor — aparece na tela e guia o acesso. */
export const setorDona: Record<EstoqueSetor, string> = {
  RECEPCAO: "recepcionista",
  ENFERMAGEM: "enfermeira",
};

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

export type EstoqueStatus = "OK" | "COMPRAR" | "ZERADO";

export function statusDoItem(saldo: number, minimo: number): EstoqueStatus {
  if (saldo <= 0) return "ZERADO";
  if (minimo > 0 && saldo <= minimo) return "COMPRAR";
  return "OK";
}

export type PosicaoItem = {
  item: EstoqueItem;
  saldo: number;
  status: EstoqueStatus;
  ultimoMovimento: string | null;
};

/** A posição de um setor inteiro, pronta para a tabela e para o relatório. */
export function posicaoDoSetor(items: EstoqueItem[], moves: EstoqueMovimento[], setor: EstoqueSetor): PosicaoItem[] {
  return items
    .filter((item) => item.setor === setor)
    .map((item) => {
      const doItem = moves.filter((mov) => mov.itemRef === item.id);
      const ultimo = doItem.length ? doItem.reduce((a, b) => (ordemCronologica(a, b) >= 0 ? a : b)) : null;
      const saldo = saldoDoItem(moves, item.id);
      return { item, saldo, status: statusDoItem(saldo, item.minimo), ultimoMovimento: ultimo?.movDate ?? null };
    })
    .sort((a, b) => {
      // Quem precisa de atenção primeiro: zerado, depois comprar, depois OK.
      const peso = { ZERADO: 0, COMPRAR: 1, OK: 2 } as const;
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
 */
export function chegadasPendentes(purchases: FinPurchase[], moves: EstoqueMovimento[], setor: EstoqueSetor): FinPurchase[] {
  const jaDeuEntrada = new Set(moves.filter((mov) => mov.compraRef).map((mov) => mov.compraRef));
  return purchases
    .filter((purchase) => purchase.estoqueSetor === setor && !jaDeuEntrada.has(purchase.id))
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
): RelatorioPosicao {
  const posicao = posicaoDoSetor(items, moves, setor);
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
};

/**
 * Lista de compras do setor: todo item zerado/abaixo do mínimo, com a sugestão
 * de quanto comprar — repõe até 2× o mínimo (chega em cima do ponto de pedido
 * de novo em ~duas janelas), nunca menos que 1.
 */
export function listaDeCompra(items: EstoqueItem[], moves: EstoqueMovimento[], setor: EstoqueSetor): ItemDaListaDeCompra[] {
  return posicaoDoSetor(items, moves, setor)
    .filter((linha) => linha.status !== "OK")
    .map((linha) => ({
      item: linha.item,
      saldo: linha.saldo,
      comprar: Math.max(Math.ceil(linha.item.minimo * 2 - linha.saldo), 1),
    }));
}
