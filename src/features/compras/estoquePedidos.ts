// PEDIDOS DE COMPRA × ESTOQUE × HOME (06/10/2026) — a cola entre as telas,
// sem React e sem banco, para poder ser testada (tests/compras-estoque-home.test.mjs).
//
// Lucas: *"cada usuário, que é cada setor, vai cuidar do seu próprio estoque…
// e eu vou aprovar isso"*. Três perguntas moram aqui:
//   · na tela de Estoque, qual setor a pessoa vê primeiro e como ela pede a
//     compra do que falta (o link que abre o formulário já preenchido);
//   · na Home, o que do estoque ainda é TAREFA (em falta e sem pedido) e o que
//     já anda sozinho (pedido feito, a caminho);
//   · na Fila do dia, a vez de cada papel no fluxo do pedido (POP-COMP-001):
//     aprovar, comprar, ajustar o devolvido, confirmar a chegada.
//
// comprasData.ts (o motor do pedido) importa estoqueData.ts; este arquivo
// importa os dois — por isso a cola não mora em nenhum deles.
import { cargoLabels } from "@/lib/access";
import type { Cargo } from "@/types/database";
import {
  ehEstoqueSetor,
  posicaoDoSetor,
  resumoDaFalta,
  setorCargos,
  setorNomes,
  setoresDoCargo,
  setoresVisiveis,
  type EstoqueItem,
  type EstoqueMovimento,
  type EstoqueSetor,
  type PedidoDoEstoque,
  type PosicaoItem,
} from "@/features/estoque/estoqueData";
import type { FinPurchase } from "@/features/financeiro/financeiroData";
import type { EntradaEstoqueDaFila, EntradaPedidosDaFila } from "@/features/home/filaDoDia";
import {
  LIMITES_DO_PEDIDO,
  STATUS_ABERTOS,
  aprovadosParaComprar,
  caixaDeAprovacao,
  diaEmSaoPaulo,
  diasEsperando,
  diasUteisEntre,
  estaAtrasado,
  itensSugeridosDoEstoque,
  numeroDoPedido,
  setorPrincipalDoCargo,
  type PedidoCompra,
  type RascunhoItem,
} from "./comprasData";

const diaBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const diaCurto = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const centavos = (valor: number) => Math.round(valor * 100) / 100;

/** "A", "A e B", "A, B e C". */
function juntar(partes: string[]) {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

// ---------------------------------------------------------------------------
// O botão "Pedir compra" (Estoque → /compras)
// ---------------------------------------------------------------------------

/**
 * O endereço que abre o formulário "Novo pedido" já preenchido — o combinado
 * com a tela /compras: `novo=1`, `setor` e `itens` (client_refs do estoque
 * separados por vírgula). Repetido sai uma vez só e passa de 50 itens não vai
 * (o pedido aceita até 50; o resto fica para um segundo pedido).
 */
export function linkPedirCompra(setor: EstoqueSetor, itemRefs: string[] = []): string {
  const refs = [...new Set(itemRefs.map((ref) => (ref ?? "").trim()).filter(Boolean))].slice(0, LIMITES_DO_PEDIDO.itens);
  const base = `/compras?novo=1&setor=${encodeURIComponent(setor)}`;
  return refs.length ? `${base}&itens=${refs.map((ref) => encodeURIComponent(ref)).join(",")}` : base;
}

export type PedirTudo = {
  /** O que vai para o formulário, na ordem da tela (zerado primeiro). */
  itens: RascunhoItem[];
  href: string;
  /** Itens que ficaram de fora por passar do limite de um pedido (50). */
  deFora: number;
};

/**
 * "Pedir tudo o que está em falta": os itens COMPRAR/ZERADO do setor que
 * ainda não têm pedido aberto nem compra a caminho (itensSugeridosDoEstoque),
 * com o link pronto. Nada em falta → `itens` vazio, e a tela esconde o botão.
 */
export function pedirTudoQueFalta(setor: EstoqueSetor, posicao: PosicaoItem[], pedidos: PedidoCompra[] = []): PedirTudo {
  const sugeridos = itensSugeridosDoEstoque(posicao, pedidos);
  const itens = sugeridos.slice(0, LIMITES_DO_PEDIDO.itens);
  return {
    itens,
    href: linkPedirCompra(
      setor,
      itens.map((item) => item.estoqueItemRef ?? ""),
    ),
    deFora: sugeridos.length - itens.length,
  };
}

/** A frase do pedido na linha do item: "Pedido #0014 aguardando aprovação". */
export function fraseDoPedidoNoItem(pedido: Pick<PedidoDoEstoque, "numero" | "status" | "previsaoEntrega">): string {
  const numero = numeroDoPedido(pedido.numero);
  switch (pedido.status) {
    case "ENVIADO":
      return `Pedido ${numero} aguardando aprovação`;
    case "APROVADO":
      return `Pedido ${numero} aprovado, falta comprar`;
    case "DEVOLVIDO":
      return `Pedido ${numero} devolvido para ajuste`;
    case "COMPRADO":
      return `Pedido ${numero} comprado${pedido.previsaoEntrega ? `, chega ${diaBR(pedido.previsaoEntrega)}` : ""}`;
    default:
      return `Pedido ${numero}`;
  }
}

/**
 * Os pedidos abertos do setor, na ordem do que pede ação do setor: devolvido
 * (ajustar), comprado (confirmar a chegada), depois os que esperam alguém.
 */
export function pedidosAbertosDoSetor(pedidos: PedidoCompra[], setor: EstoqueSetor): PedidoCompra[] {
  const peso: Record<string, number> = { DEVOLVIDO: 0, COMPRADO: 1, ENVIADO: 2, APROVADO: 3 };
  return pedidos
    .filter((pedido) => pedido.setor === setor && STATUS_ABERTOS.includes(pedido.status))
    .sort((a, b) => (peso[a.status] ?? 9) - (peso[b.status] ?? 9) || (a.numero ?? 0) - (b.numero ?? 0));
}

// ---------------------------------------------------------------------------
// A tela de Estoque com 10 setores
// ---------------------------------------------------------------------------

export type SetoresDaTela = {
  /** Os setores DA pessoa (o principal primeiro). */
  proprios: EstoqueSetor[];
  /** Os outros que ela enxerga, na ordem da tabela `setor`. */
  outros: EstoqueSetor[];
  /** Os que aparecem como botões (até 3 setores no total cabem todos). */
  botoes: EstoqueSetor[];
  /** Os que vão para o seletor compacto ("Outros setores…"). */
  noSeletor: EstoqueSetor[];
  visiveis: EstoqueSetor[];
};

/**
 * Quem vê muitos setores (a coordenação vê os 10) não ganha uma fileira de 10
 * abas: os setores dela viram botões e o resto vai para um seletor. Quem vê
 * até 3 (a recepção vê Recepção e Pacientes) continua com todos em botões.
 */
export function setoresDaTelaDeEstoque(cargo: Cargo | null | undefined, ehCoordenacao: boolean): SetoresDaTela {
  const visiveis = setoresVisiveis(cargo ?? null, ehCoordenacao);
  const meus = setoresDoCargo(cargo ?? null).filter((setor) => visiveis.includes(setor));
  const principal = setorPrincipalDoCargo(cargo);
  const proprios = principal && meus.includes(principal) ? [principal, ...meus.filter((setor) => setor !== principal)] : meus;
  const outros = visiveis.filter((setor) => !proprios.includes(setor));
  const cabeTudo = visiveis.length <= 3;
  return {
    proprios,
    outros,
    botoes: cabeTudo ? [...proprios, ...outros] : proprios,
    noSeletor: cabeTudo ? [] : outros,
    visiveis,
  };
}

/**
 * O setor em que a tela abre.
 *   1. o da URL (?setor=, vindo da Home), se a pessoa enxerga;
 *   2. o setor DELA que já tem itens (o principal primeiro) — a CEO é da
 *      Diretoria, mas o estoque que ela cuida hoje é o dos Pacientes;
 *   3. a coordenação, com o próprio setor vazio, cai na Enfermagem (como antes
 *      de 06/10) ou no primeiro setor com itens;
 *   4. senão, o setor principal dela, mesmo vazio — é onde ela começa o próprio estoque.
 */
export function setorInicialDoEstoque(
  cargo: Cargo | null | undefined,
  ehCoordenacao: boolean,
  items: Pick<EstoqueItem, "setor">[],
  daUrl?: string | null,
): EstoqueSetor {
  const { proprios, outros, visiveis } = setoresDaTelaDeEstoque(cargo, ehCoordenacao);
  if (daUrl && ehEstoqueSetor(daUrl) && visiveis.includes(daUrl)) return daUrl;
  const temItem = (setor: EstoqueSetor) => items.some((item) => item.setor === setor);
  const proprioComItem = proprios.find(temItem);
  if (proprioComItem) return proprioComItem;
  if (ehCoordenacao) {
    const candidatos: EstoqueSetor[] = ["ENFERMAGEM", ...outros.filter((setor) => setor !== "ENFERMAGEM")];
    const outroComItem = candidatos.find((setor) => outros.includes(setor) && temItem(setor));
    if (outroComItem) return outroComItem;
  }
  return proprios[0] ?? visiveis[0] ?? "PACIENTES";
}

/** "Enfermeira e Nutricionista (e a coordenação)" — quem mexe no setor, para a tela dizer. */
export function quemCuidaDoSetor(setor: EstoqueSetor): string {
  const nomes = (setorCargos[setor] ?? []).map((cargo) => cargoLabels[cargo as Cargo] ?? cargo);
  const lista = juntar(nomes);
  // PACIENTES é a exceção da regra (30/09/2026): nem a coordenação mexe.
  return setor === "PACIENTES" ? lista : `${lista} (e a coordenação)`;
}

// ---------------------------------------------------------------------------
// A Home: o card de estoque
// ---------------------------------------------------------------------------

/**
 * O estoque na Fila do dia: só os setores DA pessoa, contando como tarefa o
 * que está em falta e AINDA não tem pedido nem compra — o pedido feito e o
 * que está a caminho entram só na frase (antes a Home cobrava "comprar" de um
 * item que já estava vindo, e olhava só Recepção e Enfermagem para todo mundo).
 *
 * A coordenação ganha, além dos dela, um resumo dos outros setores como "para
 * saber" (não conta no número do ícone): é o "o setor ainda não pediu".
 */
export function estoqueParaAFila(entrada: {
  items: EstoqueItem[];
  moves: EstoqueMovimento[];
  purchases?: FinPurchase[];
  pedidos?: PedidoDoEstoque[];
  cargo: Cargo | null | undefined;
  ehCoordenacao: boolean;
  /**
   * Pode pedir compra (canEditModule "compras"). 07/10/2026: o botão do cartão
   * dizia "Pedir compra" e só abria o Estoque. Agora, quem pode pedir vai direto
   * ao pedido já preenchido com o que falta (o mesmo do "Pedir tudo o que está
   * em falta"); quem não pode vê "Ver no estoque".
   */
  podePedir?: boolean;
}): EntradaEstoqueDaFila[] {
  const { items, moves, cargo, ehCoordenacao } = entrada;
  const purchases = entrada.purchases ?? [];
  const pedidos = entrada.pedidos ?? [];
  const meus = setoresDoCargo(cargo ?? null);
  const posicao = (setor: EstoqueSetor) => posicaoDoSetor(items, moves, setor, purchases, pedidos);
  const resumo = (setor: EstoqueSetor) => resumoDaFalta(posicao(setor));

  const linhas: EntradaEstoqueDaFila[] = meus.map((setor) => {
    const p = posicao(setor);
    const r = resumoDaFalta(p);
    // pedirTudoQueFalta só aceita PedidoCompra; aqui os pedidos chegam no tipo
    // mínimo do estoque, que é o que itensComPedidoAberto lê (status + itens).
    const tudo = entrada.podePedir && r.semPedido > 0 ? pedirTudoQueFalta(setor, p, pedidos as PedidoCompra[]) : null;
    return {
      setor,
      rotulo: setorNomes[setor],
      itens: r.semPedido,
      zerados: r.zeradosSemPedido,
      jaPedidos: r.jaPedidos,
      aCaminho: r.aCaminho,
      href: tudo?.itens.length ? tudo.href : `/estoque?setor=${setor}`,
      acao: tudo?.itens.length ? "Pedir compra" : "Ver no estoque",
    };
  });

  if (ehCoordenacao) {
    const outros = setoresVisiveis(cargo ?? null, true)
      .filter((setor) => !meus.includes(setor))
      .map((setor) => ({ setor, r: resumo(setor) }))
      .filter((linha) => linha.r.semPedido > 0);
    if (outros.length) {
      linhas.push({
        setor: "OUTROS",
        rotulo: "outros setores",
        itens: outros.reduce((soma, linha) => soma + linha.r.semPedido, 0),
        zerados: outros.reduce((soma, linha) => soma + linha.r.zeradosSemPedido, 0),
        paraSaber: true,
        href: `/estoque?setor=${outros[0].setor}`,
        detalhe: `${outros.map((linha) => `${setorNomes[linha.setor]}: ${linha.r.semPedido}`).join(" · ")} — o setor ainda não pediu`,
      });
    }
  }
  return linhas;
}

// ---------------------------------------------------------------------------
// A Home: a vez de cada papel no fluxo do pedido
// ---------------------------------------------------------------------------

export type QuemNaFila = {
  id: string | null | undefined;
  cargo: Cargo | null | undefined;
  /** podeAprovar(pessoa): o Gestor Financeiro, ou quem Acessos liberou. */
  aprova: boolean;
  /** podeComprar(pessoa): o financeiro completo, que registra a compra. */
  compra: boolean;
  /** Vê o módulo de pedidos (todo mundo, salvo exceção em Acessos). */
  pede: boolean;
};

function diasCorridos(deISO: string, ateISO: string) {
  if (!deISO || !ateISO) return 0;
  return Math.round((Date.parse(`${ateISO.slice(0, 10)}T12:00:00Z`) - Date.parse(`${deISO.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
}

const enviadoEm = (pedido: PedidoCompra) => pedido.enviadoEm ?? pedido.createdAt ?? "";

/** Sem previsão de entrega, quantos dias corridos depois da compra a Home pergunta "chegou?". */
export const DIAS_PARA_PERGUNTAR_SE_CHEGOU = 3;

/**
 * O que a Fila do dia mostra dos pedidos para esta pessoa (POP-COMP-001):
 *   · quem aprova → os que esperam decisão (atrasado depois de 1 dia útil);
 *   · o financeiro completo → os aprovados que falta comprar;
 *   · o setor e quem pediu → o devolvido ("ajuste e reenvie") e o comprado
 *     que já devia ter chegado ("chegou? confirme o recebimento"): com
 *     previsão, a partir do dia previsto; sem previsão, 3 dias depois da compra.
 * "O setor" aqui é o setor DA pessoa (o cargo está na lista do setor): a
 * coordenação mexe em quase todos, mas não é ela quem ajusta o pedido da
 * recepção — e o Lucas não deve ver como tarefa dele o pedido que ele mesmo devolveu.
 */
/** Quantos dias corridos um aviso "para saber" fica na Fila (recusa, cancelamento, divergência). */
export const DIAS_DO_AVISO_NA_FILA = 7;

/** Os botões da Fila que agem num pedido abrem a gaveta certa em /compras (07/10/2026). */
export function linkDoPedido(id: string, acao?: "receber" | "ajustar"): string {
  return `/compras?pedido=${encodeURIComponent(id)}${acao ? `&acao=${acao}` : ""}`;
}

export function pedidosParaAFila(pedidos: PedidoCompra[], quem: QuemNaFila, hojeISO: string): EntradaPedidosDaFila {
  const entrada: EntradaPedidosDaFila = {};

  if (quem.aprova) {
    const caixa = caixaDeAprovacao(pedidos);
    if (caixa.length) {
      const maisAntigo = caixa.reduce((a, b) => (enviadoEm(a) <= enviadoEm(b) ? a : b));
      entrada.aprovar = {
        quantidade: caixa.length,
        valor: centavos(caixa.reduce((soma, pedido) => soma + (pedido.valorEstimado || 0), 0)),
        urgentes: caixa.filter((pedido) => pedido.urgencia === "URGENTE").length,
        atrasados: caixa.filter((pedido) => estaAtrasado(pedido, hojeISO)).length,
        maisAntigoDias: Math.max(0, ...caixa.map((pedido) => diasEsperando(pedido, hojeISO))),
        desde: diaEmSaoPaulo(enviadoEm(maisAntigo)),
      };
    }
  }

  if (quem.compra) {
    const aprovados = aprovadosParaComprar(pedidos);
    if (aprovados.length) {
      const aprovadoEm = (pedido: PedidoCompra) => diaEmSaoPaulo(pedido.decididoEm ?? enviadoEm(pedido));
      const desde = aprovados.map(aprovadoEm).sort()[0] ?? "";
      entrada.comprar = {
        quantidade: aprovados.length,
        valor: centavos(aprovados.reduce((soma, pedido) => soma + (pedido.valorEstimado || 0), 0)),
        urgentes: aprovados.filter((pedido) => pedido.urgencia === "URGENTE").length,
        vencidos: aprovados.filter((pedido) => Boolean(pedido.precisaAte) && (pedido.precisaAte as string).slice(0, 10) < hojeISO).length,
        maisAntigoDias: Math.max(0, ...aprovados.map((pedido) => diasUteisEntre(aprovadoEm(pedido), hojeISO))),
        desde,
      };
    }
    // CHEGOU DIFERENTE DO PEDIDO (07/10/2026; fluxograma, passo 7: "anotar a
    // divergência no pedido; o Financeiro é avisado"). Fica na Fila de quem
    // compra por 7 dias depois do recebimento, para conferir a nota e cobrar o
    // fornecedor; dá para silenciar como qualquer item.
    const divergencias = pedidos
      .filter((pedido) => pedido.status === "RECEBIDO" && pedido.divergencia.trim())
      .map((pedido) => ({ pedido, dia: diaEmSaoPaulo(pedido.recebidoEm ?? pedido.updatedAt) }))
      .filter(({ dia }) => dia && diasCorridos(dia, hojeISO) <= DIAS_DO_AVISO_NA_FILA)
      .map(({ pedido, dia }) => ({
        id: pedido.id,
        numero: numeroDoPedido(pedido.numero),
        titulo: pedido.titulo,
        setor: setorNomes[pedido.setor] ?? pedido.setor,
        texto: pedido.divergencia.trim(),
        dia,
      }))
      .sort((a, b) => b.dia.localeCompare(a.dia));
    if (divergencias.length) entrada.divergencias = divergencias;
  }

  if (quem.pede) {
    const meusSetores = setoresDoCargo(quem.cargo ?? null);
    const meus = pedidos.filter(
      (pedido) => Boolean(quem.id && pedido.solicitanteId === quem.id) || meusSetores.includes(pedido.setor),
    );
    entrada.devolvidos = meus
      .filter((pedido) => pedido.status === "DEVOLVIDO")
      .map((pedido) => ({
        id: pedido.id,
        numero: numeroDoPedido(pedido.numero),
        titulo: pedido.titulo,
        motivo: pedido.decisaoNota,
        dia: diaEmSaoPaulo(pedido.decididoEm ?? pedido.updatedAt),
      }))
      .sort((a, b) => a.dia.localeCompare(b.dia));
    entrada.chegou = meus
      .filter((pedido) => pedido.status === "COMPRADO")
      .map((pedido) => {
        const dia = diaEmSaoPaulo(pedido.compradoEm ?? pedido.updatedAt);
        const previsao = pedido.previsaoEntrega ? pedido.previsaoEntrega.slice(0, 10) : null;
        const devia = previsao ? previsao <= hojeISO : diasCorridos(dia, hojeISO) >= DIAS_PARA_PERGUNTAR_SE_CHEGOU;
        if (!devia) return null;
        return {
          id: pedido.id,
          numero: numeroDoPedido(pedido.numero),
          titulo: pedido.titulo,
          fornecedor: pedido.fornecedor,
          previsao,
          dia,
          atrasado: Boolean(previsao && previsao < hojeISO),
        };
      })
      .filter((linha): linha is NonNullable<typeof linha> => linha !== null)
      .sort((a, b) => (a.previsao ?? a.dia).localeCompare(b.previsao ?? b.dia));
    // RECUSADO OU CANCELADO POR OUTRA PESSOA (07/10/2026). A tela prometia "o
    // setor é avisado" e nada avisava: o pedido recusado deixava de segurar o
    // item e o Estoque mandava pedir de novo, sem o motivo. Fica "para saber"
    // por 7 dias; quem decidiu (ou cancelou) não recebe o próprio aviso, e o
    // pedido cancelado por quem o fez não avisa ninguém.
    const parados = meus
      .map((pedido) => {
        if (pedido.status === "RECUSADO") {
          if (quem.id && pedido.decididoPor === quem.id) return null;
          const por = [...pedido.eventos].reverse().find((evento) => evento.tipo === "RECUSADO");
          return { pedido, status: "RECUSADO" as const, por: por?.porNome ?? "", motivo: pedido.decisaoNota, dia: diaEmSaoPaulo(pedido.decididoEm ?? pedido.updatedAt) };
        }
        if (pedido.status === "CANCELADO") {
          const evento = [...pedido.eventos].reverse().find((candidato) => candidato.tipo === "CANCELADO");
          if (!evento || (quem.id && evento.porId === quem.id) || (evento.porId && evento.porId === pedido.solicitanteId)) return null;
          return { pedido, status: "CANCELADO" as const, por: evento.porNome, motivo: evento.nota, dia: diaEmSaoPaulo(pedido.canceladoEm ?? evento.em) };
        }
        return null;
      })
      .filter((linha): linha is NonNullable<typeof linha> => linha !== null && Boolean(linha.dia) && diasCorridos(linha.dia, hojeISO) <= DIAS_DO_AVISO_NA_FILA)
      .map(({ pedido, ...resto }) => ({ id: pedido.id, numero: numeroDoPedido(pedido.numero), titulo: pedido.titulo, ...resto }))
      .sort((a, b) => b.dia.localeCompare(a.dia));
    if (parados.length) entrada.parados = parados;
  }

  return entrada;
}

/**
 * A última palavra sobre um item foi uma RECUSA? (07/10/2026) Olha os pedidos
 * com o item; se o mais recente foi recusado, devolve o número e o motivo para
 * o Estoque mostrar ANTES do "Pedir compra" — senão o setor pede de novo o que
 * acabou de ser recusado, sem saber por quê. Pedido aberto ou recebido depois
 * da recusa vence (a recusa ficou para trás).
 */
export function recusaDoItem(itemId: string, pedidos: PedidoCompra[]): { numero: string; motivo: string; dia: string } | null {
  const doItem = pedidos
    .filter((pedido) => pedido.status !== "CANCELADO" && pedido.itens.some((item) => item.estoqueItemRef === itemId))
    .sort((a, b) => {
      const qa = a.decididoEm ?? enviadoEm(a);
      const qb = b.decididoEm ?? enviadoEm(b);
      return qa < qb ? 1 : qa > qb ? -1 : (b.numero ?? 0) - (a.numero ?? 0);
    });
  const ultimo = doItem[0];
  if (!ultimo || ultimo.status !== "RECUSADO") return null;
  return { numero: numeroDoPedido(ultimo.numero), motivo: ultimo.decisaoNota, dia: diaEmSaoPaulo(ultimo.decididoEm ?? ultimo.updatedAt) };
}

/** "chega 09/10" / "comprado em 02/10" — a data do pedido comprado numa frase curta. */
export function quandoChega(pedido: Pick<PedidoCompra, "previsaoEntrega" | "compradoEm">): string {
  if (pedido.previsaoEntrega) return `chega ${diaCurto(pedido.previsaoEntrega)}`;
  return pedido.compradoEm ? `comprado em ${diaCurto(diaEmSaoPaulo(pedido.compradoEm))}` : "";
}
