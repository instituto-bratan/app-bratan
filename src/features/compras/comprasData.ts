// PEDIDOS DE COMPRA POR SETOR (06/10/2026) — o motor, sem React e sem banco.
//
// Lucas: *"cada setor ou cada usuário vai fazer o seu pedido de compra e eu vou
// autorizar e levar para frente."* O fluxo é o do fluxograma POP-COMP-001:
// PEDIR (o setor) → APROVAR (Gestor Financeiro) → COMPRAR (Financeiro) →
// RECEBER (o setor dá a entrada no estoque).
//
// A máquina de estados daqui é a MESMA das funções do banco
// (supabase/migrations/202610060001_pedidos_de_compra.sql). Por que repetir:
//   · o modo prévia/local (sem banco) precisa andar igual ao de verdade, senão
//     a prévia mostra um fluxo que o sistema não faz;
//   · a tela esconde o botão que o banco recusaria, em vez de deixar a pessoa
//     clicar e levar um erro;
//   · os testes (tests/compras-pedidos.test.mjs) conferem os dois lados.
// As frases de erro são as mesmas do banco, em português direto.
import { canFinanceiroFull, isCoordenacao, moduleLevel } from "@/lib/access";
import type { Cargo } from "@/types/database";
import {
  podeMexerNoSetor,
  setorNomes,
  setoresDoCargo,
  setoresEmOrdem,
  type EstoqueItem,
  type EstoqueMovimento,
  type EstoqueSetor,
  type PosicaoItem,
} from "@/features/estoque/estoqueData";
import { ehDiaUtil, somaDias } from "@/features/financeiro/recebiveisRede";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PedidoStatus = "ENVIADO" | "DEVOLVIDO" | "APROVADO" | "RECUSADO" | "COMPRADO" | "RECEBIDO" | "CANCELADO";

/** Os status na ordem do fluxograma (o CHECK de compra_pedido.status tem os mesmos). */
export const pedidoStatusEmOrdem: PedidoStatus[] = ["ENVIADO", "APROVADO", "COMPRADO", "RECEBIDO", "DEVOLVIDO", "RECUSADO", "CANCELADO"];

export type PedidoUrgencia = "NORMAL" | "URGENTE";

export type PedidoEventoTipo =
  | "CRIADO"
  | "REENVIADO"
  | "APROVADO"
  | "DEVOLVIDO"
  | "RECUSADO"
  | "CANCELADO"
  | "COMPRADO"
  | "COMPRA_DESFEITA"
  | "RECEBIDO"
  | "DIVERGENCIA";

export const pedidoEventoTipos: PedidoEventoTipo[] = [
  "CRIADO",
  "REENVIADO",
  "APROVADO",
  "DEVOLVIDO",
  "RECUSADO",
  "CANCELADO",
  "COMPRADO",
  "COMPRA_DESFEITA",
  "RECEBIDO",
  "DIVERGENCIA",
];

export type PedidoItem = {
  /** uuid da linha no banco (no modo local: `<pedido>-i<ordem>`). */
  id: string;
  ordem: number;
  /** Item do estoque do mesmo setor; null = item novo, escrito à mão. */
  estoqueItemRef: string | null;
  descricao: string;
  quantidade: number;
  unidade: string;
  /** Valor unitário estimado (opcional). */
  valorUnitario: number | null;
  link: string;
  /** Quanto chegou (preenchido no recebimento). */
  qtdRecebida: number | null;
};

export type PedidoEvento = {
  id: string;
  tipo: PedidoEventoTipo;
  porId: string | null;
  porNome: string;
  em: string;
  nota: string;
};

export type PedidoCompra = {
  /** client_ref (cped-<uuid>) — o id que o app usa, como no resto do sistema. */
  id: string;
  /** O número que as pessoas falam ("o pedido 7"); null só no instante antes de gravar. */
  numero: number | null;
  setor: EstoqueSetor;
  solicitanteId: string | null;
  solicitanteNome: string;
  titulo: string;
  justificativa: string;
  urgencia: PedidoUrgencia;
  precisaAte: string | null;
  status: PedidoStatus;
  valorEstimado: number;
  enviadoEm: string | null;
  decididoPor: string | null;
  decididoEm: string | null;
  decisaoNota: string;
  compraRef: string | null;
  compradoPor: string | null;
  compradoEm: string | null;
  fornecedor: string;
  valorFinal: number | null;
  previsaoEntrega: string | null;
  recebidoPor: string | null;
  recebidoEm: string | null;
  divergencia: string;
  canceladoEm: string | null;
  createdAt: string;
  updatedAt: string;
  itens: PedidoItem[];
  eventos: PedidoEvento[];
};

/** Quem está agindo (a pessoa logada). Basta o que vem do useAuth. */
export type AtorDoPedido = {
  id: string | null;
  nome: string;
  cargo: Cargo | null | undefined;
  acessos?: Record<string, string> | null;
};

// ---------------------------------------------------------------------------
// Rótulos e cores (as palavras do fluxograma)
// ---------------------------------------------------------------------------

export const pedidoStatusLabels: Record<PedidoStatus, string> = {
  ENVIADO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  COMPRADO: "Comprado · a caminho",
  RECEBIDO: "Recebido",
  DEVOLVIDO: "Devolvido para ajuste",
  RECUSADO: "Recusado",
  // 07/10/2026: era "Cancelado pelo setor", mas quem aprova e a coordenação
  // também cancelam — quem foi fica na faixa do pedido ("Cancelado por …").
  CANCELADO: "Cancelado",
};

/**
 * Cores do selo — as mesmas famílias do fluxograma (âmbar = esperando alguém,
 * verde = liberado, azul = a caminho, musgo = concluído, rosa = parou).
 * 07/10/2026: as MESMAS classes do SeloDoStatus da tela de pedidos — só tons
 * que o tema escuro remapeia no centro (globals.css: *-50, *-200, *-700/800/900
 * de amber/emerald). O sky-100/900/300 de antes não é remapeado e o selo
 * "Comprado · a caminho" ficava uma pílula azul-clara acesa no cartão escuro.
 */
export const pedidoStatusClasses: Record<PedidoStatus, string> = {
  ENVIADO: "border-amber-200 bg-amber-50 text-amber-900",
  DEVOLVIDO: "border-amber-200 bg-amber-50 text-amber-900",
  APROVADO: "border-emerald-200 bg-emerald-50 text-emerald-800",
  COMPRADO: "border-sky-200 bg-sky-50 text-sky-700",
  RECEBIDO: "border-brand-oliva/25 bg-brand-creme/70 text-brand-musgo",
  RECUSADO: "border-rose-200 bg-rose-50 text-rose-700",
  CANCELADO: "border-rose-200 bg-rose-50 text-rose-700",
};

export const pedidoEventoLabels: Record<PedidoEventoTipo, string> = {
  CRIADO: "Pedido enviado",
  REENVIADO: "Reenviado com os ajustes",
  APROVADO: "Aprovado",
  DEVOLVIDO: "Devolvido para ajuste",
  RECUSADO: "Recusado",
  CANCELADO: "Cancelado",
  COMPRADO: "Compra registrada",
  COMPRA_DESFEITA: "Compra excluída — voltou para aprovado",
  RECEBIDO: "Recebido no setor",
  DIVERGENCIA: "Algo não bateu na entrega",
};

export const urgenciaLabels: Record<PedidoUrgencia, string> = {
  NORMAL: "Normal",
  URGENTE: "Urgente",
};

/** O status dentro de uma frase ("está aguardando aprovação") — igual a compra_status_rotulo() do banco. */
export function statusNaFrase(status: PedidoStatus) {
  return pedidoStatusLabels[status].toLowerCase();
}

/** "#0007" — igual a compra_pedido_rotulo() do banco (não corta a partir de 10.000). */
export function numeroDoPedido(numero: number | null | undefined) {
  if (numero === null || numero === undefined) return "#—";
  return `#${String(numero).padStart(4, "0")}`;
}

/** Nome do setor para a tela (setor que o app ainda não conhece aparece pelo código). */
export function nomeDoSetor(setor: string) {
  return setorNomes[setor as EstoqueSetor] ?? setor;
}

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtdBR = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
/**
 * Arredonda como o numeric do banco (round(x, casas), meio para longe do zero).
 * Multiplicar o double direto erra: 10,555 × 100 dá 1055,4999… e viraria 10,55,
 * enquanto o banco grava 10,56. Deslocar a vírgula pelo texto ("10.555e2")
 * chega no número exato.
 */
const arred = (valor: number, casas: number) => {
  if (!Number.isFinite(valor)) return valor;
  const sinal = valor < 0 ? -1 : 1;
  const absoluto = Math.abs(valor);
  const texto = String(absoluto);
  const deslocado = texto.includes("e") ? absoluto * 10 ** casas : Number(`${texto}e${casas}`);
  return (sinal * Math.round(deslocado)) / 10 ** casas;
};

// ---------------------------------------------------------------------------
// Máquina de estados (a única fonte; o SQL é o espelho)
// ---------------------------------------------------------------------------

export type PedidoAcao =
  | "ENVIAR"
  | "REENVIAR"
  | "APROVAR"
  | "DEVOLVER"
  | "RECUSAR"
  | "CANCELAR"
  | "COMPRAR"
  | "DESFAZER_COMPRA"
  | "RECEBER";

/** De onde cada ação pode partir e para onde ela leva. null = pedido que ainda não existe. */
export const MAQUINA_DO_PEDIDO: Record<PedidoAcao, { de: Array<PedidoStatus | null>; para: PedidoStatus }> = {
  ENVIAR: { de: [null], para: "ENVIADO" },
  REENVIAR: { de: ["DEVOLVIDO"], para: "ENVIADO" },
  APROVAR: { de: ["ENVIADO"], para: "APROVADO" },
  DEVOLVER: { de: ["ENVIADO"], para: "DEVOLVIDO" },
  RECUSAR: { de: ["ENVIADO"], para: "RECUSADO" },
  CANCELAR: { de: ["ENVIADO", "DEVOLVIDO", "APROVADO"], para: "CANCELADO" },
  COMPRAR: { de: ["APROVADO"], para: "COMPRADO" },
  DESFAZER_COMPRA: { de: ["COMPRADO"], para: "APROVADO" },
  RECEBER: { de: ["COMPRADO"], para: "RECEBIDO" },
};

export function podeTransicionar(de: PedidoStatus | null, acao: PedidoAcao): boolean {
  return MAQUINA_DO_PEDIDO[acao].de.includes(de);
}

/** Pedido "aberto": ainda vai virar (ou já virou) compra que não chegou. */
export const STATUS_ABERTOS: PedidoStatus[] = ["ENVIADO", "DEVOLVIDO", "APROVADO", "COMPRADO"];

// ---------------------------------------------------------------------------
// Quem pode (espelho de compra_pode_* no banco)
// ---------------------------------------------------------------------------

type PessoaComAcesso = { id?: string | null; cargo?: Cargo | null; acessos?: Record<string, string> | null } | null | undefined;

/** Cuida do estoque do setor (estoque_pode), sem olhar a tela Acessos. */
function cuidaDoSetor(pessoa: PessoaComAcesso, setor: EstoqueSetor) {
  const cargo = pessoa?.cargo ?? null;
  return podeMexerNoSetor(cargo, setor, isCoordenacao(cargo));
}

/**
 * Pedir para um setor = mexer no estoque dele (compra_pode_pedir).
 * 07/10/2026: a exceção de Acessos em "Pedidos de compra" vale aqui como no
 * banco — "Só ver" ou "Oculto" tira o pedir (e, por tabela, cancelar e
 * receber); o padrão de todos é EDITAR, que não abre setor nenhum além do dele.
 */
export function podePedirPara(pessoa: PessoaComAcesso, setor: EstoqueSetor) {
  return moduleLevel(pessoa, "compras") === "EDITAR" && cuidaDoSetor(pessoa, setor);
}

/**
 * O pedido é do SETOR da pessoa: ela pediu, ou o cargo dela está na lista do
 * setor (setoresDoCargo). A coordenação mexe em quase todos os setores, mas não
 * é "do setor" — não ajusta o pedido devolvido no lugar dele, e cancelar o
 * pedido de outro setor pede o motivo (07/10/2026, igual ao banco).
 */
export function ehDoSetor(pessoa: PessoaComAcesso, pedido: Pick<PedidoCompra, "setor" | "solicitanteId">) {
  if (pessoa?.id && pedido.solicitanteId && pedido.solicitanteId === pessoa.id) return true;
  return setoresDoCargo(pessoa?.cargo ?? null).includes(pedido.setor);
}

/**
 * Aprovar pedidos (compra_pode_aprovar): o Gestor Financeiro por padrão; a
 * exceção da tela Acessos vence nas duas direções (libera outra pessoa ou tira
 * do Lucas), exatamente como moduleLevel().
 */
export function podeAprovar(pessoa: PessoaComAcesso) {
  return moduleLevel(pessoa, "compras-aprovacao") === "EDITAR";
}

/** Registrar a compra: só quem grava em fin_purchases (o financeiro completo). */
export function podeComprar(pessoa: PessoaComAcesso) {
  return canFinanceiroFull(pessoa?.cargo ?? null);
}

/**
 * Confirmar a chegada: o SETOR (quem pode pedir para ele) — SPEC "RECEBER (o
 * setor)". 07/10/2026: o financeiro completo deixou de receber por fora; em
 * PACIENTES isso punha o Lucas e o Dr. Daniel no kardex que a regra da CEO
 * (30/09) reserva à Aline e a ela. Igual a compra_pedido_receber no banco.
 */
export function podeReceber(pessoa: PessoaComAcesso, setor: EstoqueSetor) {
  return podePedirPara(pessoa, setor);
}

/** Cancelar: quem pede para o setor, ou quem aprova. */
export function podeCancelar(pessoa: PessoaComAcesso, setor: EstoqueSetor) {
  return podePedirPara(pessoa, setor) || podeAprovar(pessoa);
}

/**
 * Ver o pedido (RLS compra_pode_ver_pedido). 07/10/2026: "Só ver" em Acessos
 * continua vendo os do setor; "Oculto" fica só com o que a própria pessoa pediu.
 */
export function podeVerPedido(pessoa: PessoaComAcesso, pedido: Pick<PedidoCompra, "setor" | "solicitanteId">) {
  return (
    (moduleLevel(pessoa, "compras") !== "OCULTO" && cuidaDoSetor(pessoa, pedido.setor)) ||
    podeAprovar(pessoa) ||
    canFinanceiroFull(pessoa?.cargo ?? null) ||
    Boolean(pedido.solicitanteId && pessoa?.id && pedido.solicitanteId === pessoa.id)
  );
}

// Setor principal de cada cargo: o padrão do formulário "Novo pedido".
const setorPrincipalPorCargo: Record<Cargo, EstoqueSetor> = {
  recepcionista: "RECEPCAO",
  enfermeira: "ENFERMAGEM",
  nutricionista: "NUTRICAO",
  secretaria_executiva: "PACIENTES",
  ceo: "DIRETORIA",
  gestor: "COMERCIAL",
  gestor_financeiro: "FINANCEIRO",
  dr_daniel: "CONSULTORIO",
  marketing: "MARKETING",
  limpeza: "LIMPEZA",
};

export function setorPrincipalDoCargo(cargo: Cargo | null | undefined): EstoqueSetor | null {
  return cargo ? (setorPrincipalPorCargo[cargo] ?? null) : null;
}

/** Os setores para os quais a pessoa pode pedir — o próprio primeiro, depois os outros na ordem da tabela. */
export function setoresParaPedir(cargo: Cargo | null | undefined, ehCoordenacao: boolean): EstoqueSetor[] {
  const pode = setoresEmOrdem.filter((setor) => podeMexerNoSetor(cargo ?? null, setor, ehCoordenacao));
  const principal = setorPrincipalDoCargo(cargo);
  if (!principal || !pode.includes(principal)) return pode;
  return [principal, ...pode.filter((setor) => setor !== principal)];
}

// ---------------------------------------------------------------------------
// O formulário: rascunho, normalização e validação
// ---------------------------------------------------------------------------

/** Os mesmos limites que compra_pedido_enviar() confere. */
export const LIMITES_DO_PEDIDO = {
  itens: 50,
  titulo: 140,
  justificativaMin: 3,
  justificativa: 500,
  descricao: 200,
  unidade: 20,
  link: 500,
  motivoMin: 3,
  nota: 500,
  divergencia: 1000,
  quantidade: 100_000,
  valorUnitario: 1_000_000,
} as const;

export type RascunhoItem = {
  estoqueItemRef: string | null;
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number | null;
  link: string;
};

export type RascunhoPedido = {
  setor: EstoqueSetor | "";
  /** Vazio = título automático ("Luva nitrílica M e mais 2"). */
  titulo: string;
  justificativa: string;
  urgencia: PedidoUrgencia;
  precisaAte: string | null;
  itens: RascunhoItem[];
};

export function rascunhoVazio(setor: EstoqueSetor | "" = ""): RascunhoPedido {
  return { setor, titulo: "", justificativa: "", urgencia: "NORMAL", precisaAte: null, itens: [] };
}

/** Para "Ajustar e reenviar": o pedido devolvido volta para o formulário. */
export function rascunhoDoPedido(pedido: PedidoCompra): RascunhoPedido {
  return {
    setor: pedido.setor,
    titulo: pedido.titulo,
    justificativa: pedido.justificativa,
    urgencia: pedido.urgencia,
    precisaAte: pedido.precisaAte,
    itens: [...pedido.itens]
      .sort((a, b) => a.ordem - b.ordem)
      .map((item) => ({
        estoqueItemRef: item.estoqueItemRef,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        valorUnitario: item.valorUnitario,
        link: item.link,
      })),
  };
}

type ItemDoEstoqueParaPedido = Pick<EstoqueItem, "id" | "nome" | "unidade" | "setor">;

/**
 * Limpa o rascunho do mesmo jeito que o banco: espaços nas pontas, descrição e
 * unidade do item do estoque quando vierem vazias, unidade "un" por padrão,
 * quantidade com 3 casas e valor com 2.
 */
export function normalizarRascunho(rascunho: RascunhoPedido, itensDoEstoque: ItemDoEstoqueParaPedido[] = []): RascunhoPedido {
  const porId = new Map(itensDoEstoque.map((item) => [item.id, item]));
  return {
    setor: rascunho.setor,
    titulo: (rascunho.titulo ?? "").trim(),
    justificativa: (rascunho.justificativa ?? "").trim(),
    urgencia: rascunho.urgencia,
    precisaAte: rascunho.precisaAte ? rascunho.precisaAte.trim() || null : null,
    itens: rascunho.itens.map((item) => {
      const ref = item.estoqueItemRef?.trim() || null;
      const doEstoque = ref ? porId.get(ref) : undefined;
      const descricao = (item.descricao ?? "").trim() || doEstoque?.nome || "";
      const unidade = (item.unidade ?? "").trim() || doEstoque?.unidade || "un";
      const quantidade = Number.isFinite(item.quantidade) ? arred(item.quantidade, 3) : Number.NaN;
      const valorUnitario =
        item.valorUnitario === null || item.valorUnitario === undefined
          ? null
          : Number.isFinite(item.valorUnitario)
            ? arred(item.valorUnitario, 2)
            : Number.NaN;
      return { estoqueItemRef: ref, descricao, quantidade, unidade, valorUnitario, link: (item.link ?? "").trim() };
    }),
  };
}

function dataValida(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/**
 * O que falta ou está errado no formulário (vazio = pode enviar). As frases
 * são as do banco. `itensDoEstoque`, quando vier, confere que o item escolhido
 * é do estoque do setor (o banco confere de novo).
 */
export function validarPedido(rascunho: RascunhoPedido, itensDoEstoque?: ItemDoEstoqueParaPedido[]): string[] {
  const r = normalizarRascunho(rascunho, itensDoEstoque ?? []);
  const problemas: string[] = [];
  if (!r.setor || !setoresEmOrdem.includes(r.setor)) problemas.push("Escolha um setor válido para o pedido.");
  if (r.urgencia !== "NORMAL" && r.urgencia !== "URGENTE") problemas.push("Urgência inválida: use normal ou urgente.");
  if (r.precisaAte && !dataValida(r.precisaAte)) problemas.push('A data de "para quando" não é uma data válida.');
  if (r.justificativa.length < LIMITES_DO_PEDIDO.justificativaMin) problemas.push("Diga por que precisa (pelo menos 3 letras).");
  if (r.justificativa.length > LIMITES_DO_PEDIDO.justificativa) problemas.push('O "por quê" passa de 500 letras.');
  if (r.titulo.length > LIMITES_DO_PEDIDO.titulo) problemas.push("O título passa de 140 letras.");
  if (r.itens.length === 0) problemas.push("Coloque pelo menos um item no pedido.");
  if (r.itens.length > LIMITES_DO_PEDIDO.itens) problemas.push("Um pedido aceita até 50 itens. Divida em dois pedidos.");

  const doSetor = itensDoEstoque ? new Map(itensDoEstoque.filter((item) => item.setor === r.setor).map((item) => [item.id, item])) : null;
  const vistos = new Set<string>();
  r.itens.forEach((item, indice) => {
    const n = indice + 1;
    if (item.estoqueItemRef) {
      if (doSetor && !doSetor.has(item.estoqueItemRef)) problemas.push(`O item ${n} não é do estoque do setor escolhido.`);
      if (vistos.has(item.estoqueItemRef)) {
        // O banco diz o nome do cadastro do estoque, não o que foi digitado.
        const nome = doSetor?.get(item.estoqueItemRef)?.nome || item.descricao || String(n);
        problemas.push(`O item "${nome}" aparece duas vezes no pedido: junte numa linha só.`);
      }
      vistos.add(item.estoqueItemRef);
    }
    if (!item.descricao) problemas.push(`Escreva o que é o item ${n}.`);
    else if (item.descricao.length > LIMITES_DO_PEDIDO.descricao) problemas.push(`A descrição do item ${n} passa de 200 letras.`);
    if (item.unidade.length > LIMITES_DO_PEDIDO.unidade) problemas.push(`A unidade do item ${n} passa de 20 letras.`);
    if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) problemas.push(`Diga a quantidade do item ${n} (maior que zero).`);
    else if (item.quantidade > LIMITES_DO_PEDIDO.quantidade) problemas.push(`A quantidade do item ${n} passa de 100.000.`);
    if (item.valorUnitario !== null) {
      if (!Number.isFinite(item.valorUnitario) || item.valorUnitario < 0) problemas.push(`O valor do item ${n} não é um valor válido.`);
      else if (item.valorUnitario > LIMITES_DO_PEDIDO.valorUnitario) problemas.push(`O valor do item ${n} passa de R$ 1.000.000.`);
    }
    if (item.link.length > LIMITES_DO_PEDIDO.link) problemas.push(`O link do item ${n} passa de 500 letras.`);
  });
  return problemas;
}

/** Valor estimado = soma de quantidade × valor unitário dos itens que têm valor (2 casas). */
export function valorEstimado(itens: Array<Pick<RascunhoItem, "quantidade" | "valorUnitario">>): number {
  let total = 0;
  for (const item of itens) {
    if (item.valorUnitario === null || item.valorUnitario === undefined) continue;
    if (!Number.isFinite(item.quantidade) || !Number.isFinite(item.valorUnitario)) continue;
    total += arred(item.quantidade, 3) * arred(item.valorUnitario, 2);
  }
  return arred(total, 2);
}

/** Título automático: "Luva nitrílica M e mais 2" (o banco monta igual quando o título vem vazio). */
export function tituloAutomatico(itens: Array<Pick<RascunhoItem, "descricao">>): string {
  if (!itens.length) return "";
  const primeiro = (itens[0].descricao ?? "").trim();
  const resto = itens.length - 1;
  return `${primeiro}${resto > 0 ? ` e mais ${resto}` : ""}`.slice(0, LIMITES_DO_PEDIDO.titulo);
}

export function tituloDoPedido(rascunho: RascunhoPedido): string {
  const titulo = (rascunho.titulo ?? "").trim();
  return titulo || tituloAutomatico(rascunho.itens);
}

/** "3 itens · R$ 230,00 estimado" — a linha que resume o pedido numa lista. */
export function resumoDoPedido(pedido: Pick<PedidoCompra, "itens" | "valorEstimado" | "valorFinal">): string {
  const n = pedido.itens.length;
  const itens = `${n} ${n === 1 ? "item" : "itens"}`;
  if (pedido.valorFinal !== null && pedido.valorFinal !== undefined) return `${itens} · ${brl(pedido.valorFinal)} na compra`;
  if (pedido.valorEstimado > 0) return `${itens} · ${brl(pedido.valorEstimado)} estimado`;
  return `${itens} · sem valor estimado`;
}

/** "100 un × Seringa 3 mL · R$ 0,42 cada" — o item numa linha. */
export function textoDoItem(item: Pick<PedidoItem, "quantidade" | "unidade" | "descricao" | "valorUnitario">): string {
  const base = `${qtdBR(item.quantidade)} ${item.unidade} × ${item.descricao}`;
  return item.valorUnitario !== null && item.valorUnitario !== undefined ? `${base} · ${brl(item.valorUnitario)} cada` : base;
}

// ---------------------------------------------------------------------------
// Tempo esperando (dias úteis)
// ---------------------------------------------------------------------------

/** O dia em Brasília de um instante ISO ("2026-10-06T01:30:00Z" → "2026-10-05"). */
export function diaEmSaoPaulo(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
}

/** Dias úteis DEPOIS de `de` até `ate` (inclusive): sexta → segunda = 1. Fim de semana e feriado não contam. */
export function diasUteisEntre(deISO: string, ateISO: string): number {
  if (!deISO || !ateISO || ateISO <= deISO) return 0;
  let dias = 0;
  let dia = deISO;
  for (let guarda = 0; guarda < 4000 && dia < ateISO; guarda += 1) {
    dia = somaDias(dia, 1);
    if (ehDiaUtil(dia)) dias += 1;
  }
  return dias;
}

/** O dia útil `n` dias antes de `hojeISO` (para montar exemplos e prazos). */
export function diaUtilAntes(hojeISO: string, n: number): string {
  let dia = hojeISO;
  let faltam = n;
  while (faltam > 0) {
    dia = somaDias(dia, -1);
    if (ehDiaUtil(dia)) faltam -= 1;
  }
  return dia;
}

/** Há quantos dias úteis o pedido espera desde que foi enviado. */
export function diasEsperando(pedido: Pick<PedidoCompra, "enviadoEm" | "createdAt">, hojeISO: string): number {
  return diasUteisEntre(diaEmSaoPaulo(pedido.enviadoEm ?? pedido.createdAt), hojeISO);
}

/**
 * Passou do prazo de resposta (fluxograma: "Prazo de resposta: 1 dia útil.
 * Pedido urgente: no mesmo dia."): normal, mais de 1 dia útil esperando;
 * urgente, a partir do dia útil seguinte. A tela pinta de âmbar.
 * 07/10/2026: virou a régua ÚNICA. Antes a linha e a frase do topo usavam o
 * prazoEstourado (com o urgente) e a Fila do dia e o contador "Aguardando
 * aprovação" usavam esta (sem o urgente) — o mesmo pedido estava atrasado numa
 * conta e em dia na outra.
 */
export function estaAtrasado(
  pedido: Pick<PedidoCompra, "status" | "enviadoEm" | "createdAt"> & { urgencia?: PedidoUrgencia | null },
  hojeISO: string,
): boolean {
  if (pedido.status !== "ENVIADO") return false;
  const dias = diasEsperando(pedido, hojeISO);
  return pedido.urgencia === "URGENTE" ? dias >= 1 : dias > 1;
}

/** "hoje" · "há 1 dia útil" · "há 3 dias úteis". */
export function tempoEsperandoTexto(pedido: Pick<PedidoCompra, "enviadoEm" | "createdAt">, hojeISO: string): string {
  const dias = diasEsperando(pedido, hojeISO);
  if (dias <= 0) return "hoje";
  return dias === 1 ? "há 1 dia útil" : `há ${dias} dias úteis`;
}

// ---------------------------------------------------------------------------
// Contadores, filtros e ordenação (a faixa do topo e a caixa de aprovação)
// ---------------------------------------------------------------------------

export type FiltroPedidos = "TODOS" | "AGUARDANDO" | "APROVADOS" | "A_CAMINHO" | "RECEBIDOS_MES" | "DEVOLVIDOS";

export const filtroLabels: Record<FiltroPedidos, string> = {
  TODOS: "Todos",
  AGUARDANDO: "Aguardando aprovação",
  APROVADOS: "Aprovados para comprar",
  A_CAMINHO: "A caminho",
  RECEBIDOS_MES: "Recebidos no mês",
  DEVOLVIDOS: "Devolvidos",
};

function recebidoNoMes(pedido: PedidoCompra, hojeISO: string) {
  return pedido.status === "RECEBIDO" && diaEmSaoPaulo(pedido.recebidoEm).slice(0, 7) === hojeISO.slice(0, 7);
}

export function filtrarPedidos(pedidos: PedidoCompra[], filtro: FiltroPedidos, hojeISO: string): PedidoCompra[] {
  switch (filtro) {
    case "AGUARDANDO":
      return pedidos.filter((pedido) => pedido.status === "ENVIADO");
    case "APROVADOS":
      return pedidos.filter((pedido) => pedido.status === "APROVADO");
    case "A_CAMINHO":
      return pedidos.filter((pedido) => pedido.status === "COMPRADO");
    case "RECEBIDOS_MES":
      return pedidos.filter((pedido) => recebidoNoMes(pedido, hojeISO));
    case "DEVOLVIDOS":
      return pedidos.filter((pedido) => pedido.status === "DEVOLVIDO");
    default:
      return pedidos;
  }
}

export type ContadoresPedidos = {
  aguardando: number;
  /** Soma do valor estimado do que espera decisão (a frase do cabeçalho). */
  valorAguardando: number;
  /** Aguardando além do prazo (estaAtrasado: 1 dia útil; urgente, no mesmo dia). */
  atrasados: number;
  aprovados: number;
  aCaminho: number;
  recebidosNoMes: number;
  devolvidos: number;
};

export function contadoresDosPedidos(pedidos: PedidoCompra[], hojeISO: string): ContadoresPedidos {
  const aguardando = pedidos.filter((pedido) => pedido.status === "ENVIADO");
  return {
    aguardando: aguardando.length,
    valorAguardando: arred(aguardando.reduce((soma, pedido) => soma + (pedido.valorEstimado || 0), 0), 2),
    atrasados: aguardando.filter((pedido) => estaAtrasado(pedido, hojeISO)).length,
    aprovados: pedidos.filter((pedido) => pedido.status === "APROVADO").length,
    aCaminho: pedidos.filter((pedido) => pedido.status === "COMPRADO").length,
    recebidosNoMes: pedidos.filter((pedido) => recebidoNoMes(pedido, hojeISO)).length,
    devolvidos: pedidos.filter((pedido) => pedido.status === "DEVOLVIDO").length,
  };
}

const quando = (pedido: Pick<PedidoCompra, "enviadoEm" | "createdAt">) => pedido.enviadoEm ?? pedido.createdAt ?? "";

/** Caixa de aprovação: só o que espera decisão — urgente primeiro, depois o mais antigo. */
export function caixaDeAprovacao(pedidos: PedidoCompra[]): PedidoCompra[] {
  return pedidos
    .filter((pedido) => pedido.status === "ENVIADO")
    .sort((a, b) => {
      if (a.urgencia !== b.urgencia) return a.urgencia === "URGENTE" ? -1 : 1;
      const qa = quando(a);
      const qb = quando(b);
      if (qa !== qb) return qa < qb ? -1 : 1;
      return (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER);
    });
}

/** "Aprovados — falta comprar": urgente primeiro, depois quem foi aprovado antes. */
export function aprovadosParaComprar(pedidos: PedidoCompra[]): PedidoCompra[] {
  return pedidos
    .filter((pedido) => pedido.status === "APROVADO")
    .sort((a, b) => {
      if (a.urgencia !== b.urgencia) return a.urgencia === "URGENTE" ? -1 : 1;
      const qa = a.decididoEm ?? quando(a);
      const qb = b.decididoEm ?? quando(b);
      return qa < qb ? -1 : qa > qb ? 1 : 0;
    });
}

/** Lista geral: o mais recente primeiro. */
export function ordenarPedidos(pedidos: PedidoCompra[]): PedidoCompra[] {
  return [...pedidos].sort((a, b) => {
    const qa = quando(a);
    const qb = quando(b);
    if (qa !== qb) return qa < qb ? 1 : -1;
    return (b.numero ?? 0) - (a.numero ?? 0);
  });
}

/**
 * "Meus pedidos": os que a pessoa fez e os dos setores de que ela cuida.
 * (cuidaDoSetor e não podePedirPara: quem só VÊ a tela continua vendo a lista
 * do setor — 07/10/2026.)
 */
export function pedidosDaPessoa(pedidos: PedidoCompra[], pessoa: PessoaComAcesso): PedidoCompra[] {
  return pedidos.filter(
    (pedido) => Boolean(pessoa?.id && pedido.solicitanteId === pessoa.id) || cuidaDoSetor(pessoa, pedido.setor),
  );
}

// ---------------------------------------------------------------------------
// O elo com o Estoque
// ---------------------------------------------------------------------------

/** Itens do estoque que já têm pedido aberto (não pedir de novo o que já foi pedido). */
export function itensComPedidoAberto(pedidos: PedidoCompra[]): Set<string> {
  const refs = new Set<string>();
  for (const pedido of pedidos) {
    if (!STATUS_ABERTOS.includes(pedido.status)) continue;
    for (const item of pedido.itens) if (item.estoqueItemRef) refs.add(item.estoqueItemRef);
  }
  return refs;
}

/**
 * "Pedir tudo o que está em falta": os itens em COMPRAR ou ZERADO do setor,
 * com a quantidade da lista de compras (repõe até 2× o mínimo, nunca menos
 * que 1). Fica de fora o que já tem pedido aberto ou compra a caminho — pedir
 * de novo seria comprar duas vezes, o erro que o "a caminho" veio evitar.
 */
export function itensSugeridosDoEstoque(posicao: PosicaoItem[], pedidos: PedidoCompra[] = []): RascunhoItem[] {
  const jaPedidos = itensComPedidoAberto(pedidos);
  return posicao
    .filter((linha) => (linha.status === "COMPRAR" || linha.status === "ZERADO") && !linha.compraAberta && !jaPedidos.has(linha.item.id))
    .map((linha) => ({
      estoqueItemRef: linha.item.id,
      descricao: linha.item.nome,
      quantidade: Math.max(Math.ceil(linha.item.minimo * 2 - linha.saldo), 1),
      unidade: linha.item.unidade || "un",
      valorUnitario: null,
      link: "",
    }));
}

export type Recebimento = {
  itens: Array<{ itemId: string; qtdRecebida: number; lote?: string; validade?: string | null }>;
  divergencia: string;
};

type MovDaCompra = Pick<EstoqueMovimento, "id" | "itemRef" | "compraRef">;

/**
 * Itens do pedido que JÁ tiveram entrada desta compra pelo caminho antigo
 * ("Chegou — dar entrada" no Estoque), fora as entradas do próprio pedido
 * (emov-ped-…). 07/10/2026: sem isso, confirmar o recebimento depois dava uma
 * segunda ENTRADA da mesma caixa — o saldo dobrava e o FEFO e a ficha de
 * aplicação erravam. Mesma conta de compra_pedido_receber() no banco.
 */
export function itensJaComEntradaDaCompra(pedido: Pick<PedidoCompra, "id" | "compraRef" | "itens">, moves: MovDaCompra[] = []): Set<string> {
  const refs = new Set<string>();
  if (!pedido.compraRef) return refs;
  for (const item of pedido.itens) {
    if (!item.estoqueItemRef) continue;
    const proprio = `emov-ped-${pedido.id}-${item.ordem}`;
    if (moves.some((mov) => mov.compraRef === pedido.compraRef && mov.itemRef === item.estoqueItemRef && mov.id !== proprio)) {
      refs.add(item.estoqueItemRef);
    }
  }
  return refs;
}

/**
 * As ENTRADAS no estoque que o recebimento gera — a mesma conta de
 * compra_pedido_receber(): item do estoque com quantidade > 0, client_ref
 * determinístico (emov-ped-<pedido>-<ordem>), ligado à compra do pedido.
 * Item que saiu do cadastro do estoque (quando a lista vier) não ganha entrada,
 * nem o que já entrou desta compra pelo caminho antigo (quando os movimentos vierem).
 */
export function movimentosDoRecebimento(
  pedido: PedidoCompra,
  recebimento: Recebimento,
  hojeISO: string,
  agoraISO: string,
  itensDoEstoque?: Array<Pick<EstoqueItem, "id" | "setor">>,
  movesDoEstoque?: MovDaCompra[],
): EstoqueMovimento[] {
  const existentes = itensDoEstoque ? new Set(itensDoEstoque.filter((item) => item.setor === pedido.setor).map((item) => item.id)) : null;
  const jaEntrou = itensJaComEntradaDaCompra(pedido, movesDoEstoque);
  const movimentos: EstoqueMovimento[] = [];
  for (const item of [...pedido.itens].sort((a, b) => a.ordem - b.ordem)) {
    if (!item.estoqueItemRef) continue;
    if (existentes && !existentes.has(item.estoqueItemRef)) continue;
    if (jaEntrou.has(item.estoqueItemRef)) continue;
    const entrada = recebimento.itens.find((linha) => linha.itemId === item.id);
    if (!entrada || !Number.isFinite(entrada.qtdRecebida)) continue;
    const quantidade = arred(arred(entrada.qtdRecebida, 3), 2);
    if (quantidade <= 0) continue;
    movimentos.push({
      id: `emov-ped-${pedido.id}-${item.ordem}`,
      itemRef: item.estoqueItemRef,
      setor: pedido.setor,
      tipo: "ENTRADA",
      quantidade,
      movDate: hojeISO,
      lote: (entrada.lote ?? "").trim().slice(0, 60),
      validade: entrada.validade || null,
      compraRef: pedido.compraRef,
      motivo: `Pedido ${numeroDoPedido(pedido.numero)} recebido`,
      createdAt: agoraISO,
    });
  }
  return movimentos;
}

// ---------------------------------------------------------------------------
// aplicarAcao — a máquina inteira, sem banco (modo prévia/local e testes)
// ---------------------------------------------------------------------------

export type DadosDaAcao = {
  /** Motivo (devolver/recusar: obrigatório) ou observação (cancelar). */
  nota?: string;
  /** ENVIAR/REENVIAR: o formulário. */
  rascunho?: RascunhoPedido;
  /** ENVIAR: id (cped-<uuid>) e número do pedido novo. */
  novo?: { id: string; numero: number | null };
  /** Confere item do estoque do setor (enviar) e item apagado (receber). */
  itensDoEstoque?: ItemDoEstoqueParaPedido[];
  /** COMPRAR/DESFAZER_COMPRA: a compra registrada no Financeiro. */
  compra?: { compraRef: string; fornecedor: string; valorFinal: number | null; previsaoEntrega: string | null; porId?: string | null; porNome?: string };
  /** RECEBER: quanto chegou de cada item. */
  recebimento?: Recebimento;
  /** RECEBER: os movimentos do estoque, para não dar entrada em dobro (07/10/2026). */
  movesDoEstoque?: MovDaCompra[];
};

export type ResultadoAcao = { ok: true; pedido: PedidoCompra; repetida?: boolean } | { ok: false; erro: string };

const falha = (erro: string): ResultadoAcao => ({ ok: false, erro });

function comEvento(
  pedido: PedidoCompra,
  tipo: PedidoEventoTipo,
  porId: string | null,
  porNome: string,
  em: string,
  nota = "",
): PedidoEvento[] {
  return [...pedido.eventos, { id: `${pedido.id}-ev${pedido.eventos.length + 1}`, tipo, porId, porNome, em, nota }];
}

function itensDoRascunho(pedidoId: string, rascunho: RascunhoPedido): PedidoItem[] {
  return rascunho.itens.map((item, indice) => ({
    id: `${pedidoId}-i${indice + 1}`,
    ordem: indice + 1,
    estoqueItemRef: item.estoqueItemRef,
    descricao: item.descricao,
    quantidade: item.quantidade,
    unidade: item.unidade,
    valorUnitario: item.valorUnitario,
    link: item.link,
    qtdRecebida: null,
  }));
}

/**
 * Aplica uma ação ao pedido, com as mesmas travas e frases do banco.
 * `pedido` null = pedido novo (só ENVIAR). Nunca muda o objeto recebido.
 */
export function aplicarAcao(
  pedido: PedidoCompra | null,
  acao: PedidoAcao,
  ator: AtorDoPedido,
  agoraISO: string,
  dados: DadosDaAcao = {},
): ResultadoAcao {
  const nomeDoAtor = ator.nome ?? "";
  const nota = (dados.nota ?? "").trim();

  if (acao === "ENVIAR" || acao === "REENVIAR") {
    if (!ator.cargo) return falha("Entre no app para pedir uma compra.");
    if (!dados.rascunho) return falha("O pedido chegou vazio. Preencha o formulário de novo.");
    const rascunho = normalizarRascunho(dados.rascunho, dados.itensDoEstoque ?? []);
    if (rascunho.setor && setoresEmOrdem.includes(rascunho.setor) && !podePedirPara(ator, rascunho.setor)) {
      return falha("Você não pode pedir compras para este setor.");
    }
    const problemas = validarPedido(rascunho, dados.itensDoEstoque);
    if (problemas.length) return falha(problemas[0]);
    const setor = rascunho.setor as EstoqueSetor;
    const titulo = tituloDoPedido(rascunho);
    const valor = valorEstimado(rascunho.itens);

    // Pedido que já existe (mesmo client_ref): é reenvio de um devolvido.
    if (pedido) {
      if (pedido.status === "ENVIADO") return { ok: true, pedido, repetida: true };
      if (!podeTransicionar(pedido.status, "REENVIAR")) {
        return falha(`Este pedido está "${statusNaFrase(pedido.status)}" e não pode ser reenviado.`);
      }
      if (!podePedirPara(ator, pedido.setor)) return falha("Você não pode reenviar pedidos deste setor.");
      const base: PedidoCompra = {
        ...pedido,
        setor,
        titulo,
        justificativa: rascunho.justificativa,
        urgencia: rascunho.urgencia,
        precisaAte: rascunho.precisaAte,
        valorEstimado: valor,
        status: "ENVIADO",
        enviadoEm: agoraISO,
        decididoPor: null,
        decididoEm: null,
        decisaoNota: "",
        itens: itensDoRascunho(pedido.id, rascunho),
        updatedAt: agoraISO,
      };
      return { ok: true, pedido: { ...base, eventos: comEvento(base, "REENVIADO", ator.id, nomeDoAtor, agoraISO) } };
    }

    if (acao === "REENVIAR") return falha("Pedido não encontrado. Recarregue a tela.");
    const id = dados.novo?.id ?? novoIdDePedido();
    const novo: PedidoCompra = {
      id,
      numero: dados.novo?.numero ?? null,
      setor,
      solicitanteId: ator.id,
      solicitanteNome: nomeDoAtor,
      titulo,
      justificativa: rascunho.justificativa,
      urgencia: rascunho.urgencia,
      precisaAte: rascunho.precisaAte,
      status: "ENVIADO",
      valorEstimado: valor,
      enviadoEm: agoraISO,
      decididoPor: null,
      decididoEm: null,
      decisaoNota: "",
      compraRef: null,
      compradoPor: null,
      compradoEm: null,
      fornecedor: "",
      valorFinal: null,
      previsaoEntrega: null,
      recebidoPor: null,
      recebidoEm: null,
      divergencia: "",
      canceladoEm: null,
      createdAt: agoraISO,
      updatedAt: agoraISO,
      itens: itensDoRascunho(id, rascunho),
      eventos: [],
    };
    return { ok: true, pedido: { ...novo, eventos: comEvento(novo, "CRIADO", ator.id, nomeDoAtor, agoraISO) } };
  }

  if (acao === "APROVAR" || acao === "DEVOLVER" || acao === "RECUSAR") {
    if (!podeAprovar(ator)) return falha("Só quem aprova pedidos de compra pode decidir.");
    if (acao !== "APROVAR" && nota.length < LIMITES_DO_PEDIDO.motivoMin) {
      return falha(`Diga o motivo para ${acao === "DEVOLVER" ? "devolver" : "recusar"}: pelo menos 3 letras.`);
    }
    if (nota.length > LIMITES_DO_PEDIDO.nota) return falha("O motivo passa de 500 letras.");
    if (!pedido) return falha("Pedido não encontrado. Recarregue a tela.");
    const destino = MAQUINA_DO_PEDIDO[acao].para;
    if (pedido.status === destino) return { ok: true, pedido, repetida: true };
    if (!podeTransicionar(pedido.status, acao)) {
      return falha(`Este pedido está "${statusNaFrase(pedido.status)}": só pedido aguardando aprovação pode ser decidido.`);
    }
    const base: PedidoCompra = { ...pedido, status: destino, decididoPor: ator.id, decididoEm: agoraISO, decisaoNota: nota, updatedAt: agoraISO };
    return { ok: true, pedido: { ...base, eventos: comEvento(base, destino as "APROVADO" | "DEVOLVIDO" | "RECUSADO", ator.id, nomeDoAtor, agoraISO, nota) } };
  }

  if (acao === "CANCELAR") {
    if (!ator.cargo) return falha("Entre no app para cancelar o pedido.");
    if (nota.length > LIMITES_DO_PEDIDO.nota) return falha("O motivo passa de 500 letras.");
    if (!pedido) return falha("Pedido não encontrado. Recarregue a tela.");
    if (!podeCancelar(ator, pedido.setor)) return falha("Você não pode cancelar pedidos deste setor.");
    if (pedido.status === "CANCELADO") return { ok: true, pedido, repetida: true };
    if (pedido.status === "COMPRADO") {
      return falha('A compra já foi feita. Para desistir, o Financeiro exclui a compra e o pedido volta para "aprovado".');
    }
    if (!podeTransicionar(pedido.status, "CANCELAR")) {
      return falha(`Este pedido está "${statusNaFrase(pedido.status)}": não dá mais para cancelar.`);
    }
    // 07/10/2026: cancelar pedido de OUTRO setor (quem aprova, a coordenação)
    // é uma recusa depois da aprovação — o setor precisa do motivo.
    if (!ehDoSetor(ator, pedido) && nota.length < LIMITES_DO_PEDIDO.motivoMin) {
      return falha("Diga o motivo para cancelar o pedido de outro setor: pelo menos 3 letras.");
    }
    const base: PedidoCompra = { ...pedido, status: "CANCELADO", canceladoEm: agoraISO, updatedAt: agoraISO };
    return { ok: true, pedido: { ...base, eventos: comEvento(base, "CANCELADO", ator.id, nomeDoAtor, agoraISO, nota) } };
  }

  if (acao === "COMPRAR") {
    // No banco quem faz isto é o gatilho ao gravar fin_purchases com pedido_ref
    // (e a RLS de fin_purchases só deixa o financeiro completo gravar).
    if (!podeComprar(ator)) return falha("Só o Financeiro registra a compra de um pedido.");
    if (!pedido) return falha("O pedido de compra desta compra não existe. Recarregue a tela.");
    if (!dados.compra?.compraRef) return falha("Compra sem identificação não pode ser ligada a um pedido de compra.");
    if (!podeTransicionar(pedido.status, "COMPRAR")) {
      return falha(`O pedido ${numeroDoPedido(pedido.numero)} está "${statusNaFrase(pedido.status)}": só pedido aprovado vira compra.`);
    }
    const porId = dados.compra.porId ?? ator.id;
    const porNome = dados.compra.porNome ?? nomeDoAtor;
    const base: PedidoCompra = {
      ...pedido,
      status: "COMPRADO",
      compraRef: dados.compra.compraRef,
      compradoPor: porId,
      compradoEm: agoraISO,
      fornecedor: (dados.compra.fornecedor ?? "").trim(),
      valorFinal: dados.compra.valorFinal,
      previsaoEntrega: dados.compra.previsaoEntrega,
      updatedAt: agoraISO,
    };
    return { ok: true, pedido: { ...base, eventos: comEvento(base, "COMPRADO", porId, porNome, agoraISO, base.fornecedor) } };
  }

  if (acao === "DESFAZER_COMPRA") {
    // Gatilho de fin_purchases: só volta se o pedido ainda está COMPRADO com
    // ESTA compra; em qualquer outro caso, nada muda (sem erro).
    if (!pedido) return falha("Pedido não encontrado. Recarregue a tela.");
    if (!podeTransicionar(pedido.status, "DESFAZER_COMPRA") || !dados.compra?.compraRef || pedido.compraRef !== dados.compra.compraRef) {
      return { ok: true, pedido, repetida: true };
    }
    const base: PedidoCompra = {
      ...pedido,
      status: "APROVADO",
      compraRef: null,
      compradoPor: null,
      compradoEm: null,
      fornecedor: "",
      valorFinal: null,
      previsaoEntrega: null,
      updatedAt: agoraISO,
    };
    return {
      ok: true,
      pedido: {
        ...base,
        eventos: comEvento(base, "COMPRA_DESFEITA", ator.id, nomeDoAtor, agoraISO, 'A compra foi excluída no Financeiro; o pedido voltou para "aprovado".'),
      },
    };
  }

  // RECEBER
  if (!ator.cargo) return falha("Entre no app para confirmar o recebimento.");
  if (!pedido) return falha("Pedido não encontrado. Recarregue a tela.");
  if (!podeReceber(ator, pedido.setor)) return falha("Só quem cuida do estoque deste setor confirma o recebimento.");
  if (pedido.status === "RECEBIDO") return { ok: true, pedido, repetida: true };
  if (!podeTransicionar(pedido.status, "RECEBER")) {
    return falha(`Este pedido está "${statusNaFrase(pedido.status)}": só pedido já comprado pode ser recebido.`);
  }
  const recebimento = dados.recebimento;
  const divergencia = (recebimento?.divergencia ?? "").trim();
  if (divergencia.length > LIMITES_DO_PEDIDO.divergencia) return falha("O texto do que não bateu passa de 1.000 letras.");
  if (!recebimento || !Array.isArray(recebimento.itens)) return falha("Informe quanto chegou de cada item.");

  const existentes = dados.itensDoEstoque
    ? new Set(dados.itensDoEstoque.filter((item) => item.setor === pedido.setor).map((item) => item.id))
    : null;
  const jaEntrou = itensJaComEntradaDaCompra(pedido, dados.movesDoEstoque);
  const semEstoque: string[] = [];
  const jaComEntrada: string[] = [];
  let diferente = false;
  const itens: PedidoItem[] = [];
  for (const item of [...pedido.itens].sort((a, b) => a.ordem - b.ordem)) {
    const entrada = recebimento.itens.find((linha) => linha.itemId === item.id);
    if (!entrada) return falha(`Informe quanto chegou de "${item.descricao}".`);
    if (!Number.isFinite(entrada.qtdRecebida) || entrada.qtdRecebida < 0) {
      return falha(`A quantidade recebida de "${item.descricao}" não é um número válido.`);
    }
    const qtd = arred(entrada.qtdRecebida, 3);
    if (qtd > LIMITES_DO_PEDIDO.quantidade) return falha(`A quantidade recebida de "${item.descricao}" passa de 100.000.`);
    if (entrada.validade && !dataValida(entrada.validade)) return falha(`A validade de "${item.descricao}" não é uma data válida.`);
    if (qtd !== arred(item.quantidade, 3)) diferente = true;
    if (item.estoqueItemRef && arred(qtd, 2) > 0) {
      if (existentes && !existentes.has(item.estoqueItemRef)) semEstoque.push(item.descricao);
      else if (jaEntrou.has(item.estoqueItemRef)) jaComEntrada.push(item.descricao);
    }
    itens.push({ ...item, qtdRecebida: qtd });
  }
  // 07/10/2026 (fluxograma, passo 7): chegou diferente do pedido → anotar a
  // divergência é obrigatório, igual ao banco.
  if (diferente && divergencia.length < 3) return falha("Chegou quantidade diferente da pedida: conte o que não bateu (pelo menos 3 letras).");
  const base: PedidoCompra = {
    ...pedido,
    itens,
    status: "RECEBIDO",
    recebidoPor: ator.id,
    recebidoEm: agoraISO,
    divergencia,
    updatedAt: agoraISO,
  };
  const notas = [
    semEstoque.length ? `Sem entrada no estoque (o item saiu do cadastro): ${semEstoque.join(", ")}` : "",
    jaComEntrada.length ? `Já tinha entrada desta compra no estoque: ${jaComEntrada.join(", ")}` : "",
  ].filter(Boolean);
  let eventos = comEvento(base, "RECEBIDO", ator.id, nomeDoAtor, agoraISO, notas.join(" · "));
  if (divergencia) eventos = comEvento({ ...base, eventos }, "DIVERGENCIA", ator.id, nomeDoAtor, agoraISO, divergencia);
  return { ok: true, pedido: { ...base, eventos } };
}

// ---------------------------------------------------------------------------
// Ida e volta com o banco (formato das funções compra_pedido_*)
// ---------------------------------------------------------------------------

/** cped-<uuid> em minúsculas — o formato que compra_pedido_enviar() aceita. */
export function novoIdDePedido(): string {
  const cripto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cripto?.randomUUID) return `cped-${cripto.randomUUID().toLowerCase()}`;
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const variante = "89ab"[Math.floor(Math.random() * 4)];
  return `cped-${hex(8)}-${hex(4)}-4${hex(3)}-${variante}${hex(3)}-${hex(12)}`;
}

const texto = (valor: unknown) => (valor === null || valor === undefined ? "" : String(valor));
const textoOuNulo = (valor: unknown) => (valor === null || valor === undefined || valor === "" ? null : String(valor));
const numeroOuNulo = (valor: unknown) => (valor === null || valor === undefined || valor === "" ? null : Number(valor));

/** Uma linha do banco (tabela ou o jsonb das funções) vira o pedido do app. */
export function pedidoDoBanco(row: Record<string, unknown>): PedidoCompra {
  const itensBrutos = Array.isArray(row.itens) ? (row.itens as Record<string, unknown>[]) : [];
  const eventosBrutos = Array.isArray(row.eventos) ? (row.eventos as Record<string, unknown>[]) : [];
  return {
    id: texto(row.client_ref),
    numero: numeroOuNulo(row.numero),
    setor: texto(row.setor) as EstoqueSetor,
    solicitanteId: textoOuNulo(row.solicitante_id),
    solicitanteNome: texto(row.solicitante_nome),
    titulo: texto(row.titulo),
    justificativa: texto(row.justificativa),
    urgencia: row.urgencia === "URGENTE" ? "URGENTE" : "NORMAL",
    precisaAte: textoOuNulo(row.precisa_ate),
    status: texto(row.status) as PedidoStatus,
    valorEstimado: Number(row.valor_estimado ?? 0),
    enviadoEm: textoOuNulo(row.enviado_em),
    decididoPor: textoOuNulo(row.decidido_por),
    decididoEm: textoOuNulo(row.decidido_em),
    decisaoNota: texto(row.decisao_nota),
    compraRef: textoOuNulo(row.compra_ref),
    compradoPor: textoOuNulo(row.comprado_por),
    compradoEm: textoOuNulo(row.comprado_em),
    fornecedor: texto(row.fornecedor),
    valorFinal: numeroOuNulo(row.valor_final),
    previsaoEntrega: textoOuNulo(row.previsao_entrega),
    recebidoPor: textoOuNulo(row.recebido_por),
    recebidoEm: textoOuNulo(row.recebido_em),
    divergencia: texto(row.divergencia),
    canceladoEm: textoOuNulo(row.cancelado_em),
    createdAt: texto(row.created_at),
    updatedAt: texto(row.updated_at),
    itens: itensBrutos
      .map((item) => ({
        id: texto(item.id),
        ordem: Number(item.ordem ?? 0),
        estoqueItemRef: textoOuNulo(item.estoque_item_ref),
        descricao: texto(item.descricao),
        quantidade: Number(item.quantidade ?? 0),
        unidade: texto(item.unidade) || "un",
        valorUnitario: numeroOuNulo(item.valor_unitario),
        link: texto(item.link),
        qtdRecebida: numeroOuNulo(item.qtd_recebida),
      }))
      .sort((a, b) => a.ordem - b.ordem),
    eventos: eventosBrutos
      .map((evento) => ({
        id: texto(evento.id),
        tipo: texto(evento.tipo) as PedidoEventoTipo,
        porId: textoOuNulo(evento.por),
        porNome: texto(evento.por_nome),
        em: texto(evento.em),
        nota: texto(evento.nota),
      }))
      .sort((a, b) => (a.em < b.em ? -1 : a.em > b.em ? 1 : 0)),
  };
}

/** O formulário no formato que compra_pedido_enviar(_pedido jsonb) lê. */
export function rascunhoParaBanco(id: string, rascunho: RascunhoPedido) {
  return {
    client_ref: id,
    setor: rascunho.setor,
    titulo: (rascunho.titulo ?? "").trim(),
    justificativa: (rascunho.justificativa ?? "").trim(),
    urgencia: rascunho.urgencia,
    precisa_ate: rascunho.precisaAte || null,
    itens: rascunho.itens.map((item) => ({
      estoque_item_ref: item.estoqueItemRef || null,
      descricao: (item.descricao ?? "").trim(),
      quantidade: item.quantidade,
      unidade: (item.unidade ?? "").trim(),
      valor_unitario: item.valorUnitario,
      link: (item.link ?? "").trim(),
    })),
  };
}

/** O recebimento no formato que compra_pedido_receber(_itens jsonb) lê. */
export function recebimentoParaBanco(recebimento: Recebimento) {
  return recebimento.itens.map((linha) => ({
    item_id: linha.itemId,
    qtd_recebida: linha.qtdRecebida,
    lote: (linha.lote ?? "").trim(),
    validade: linha.validade || null,
  }));
}

// ---------------------------------------------------------------------------
// Exemplos para a prévia (sem banco): a tela cheia, com cada situação do fluxo
// ---------------------------------------------------------------------------

function exemplo(
  numero: number,
  setor: EstoqueSetor,
  solicitante: { id: string; nome: string },
  enviadoDia: string,
  campos: Partial<PedidoCompra> & Pick<PedidoCompra, "justificativa" | "status">,
  itens: Array<Omit<PedidoItem, "id" | "ordem" | "qtdRecebida" | "link"> & { qtdRecebida?: number | null; link?: string }>,
  eventos: Array<Omit<PedidoEvento, "id">>,
): PedidoCompra {
  const id = `cped-00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`;
  const enviadoEm = `${enviadoDia}T12:00:00.000Z`;
  const linhas: PedidoItem[] = itens.map((item, indice) => ({
    id: `${id}-i${indice + 1}`,
    ordem: indice + 1,
    link: "",
    qtdRecebida: null,
    ...item,
  }));
  return {
    id,
    numero,
    setor,
    solicitanteId: solicitante.id,
    solicitanteNome: solicitante.nome,
    titulo: tituloAutomatico(linhas),
    urgencia: "NORMAL",
    precisaAte: null,
    valorEstimado: valorEstimado(linhas),
    enviadoEm,
    decididoPor: null,
    decididoEm: null,
    decisaoNota: "",
    compraRef: null,
    compradoPor: null,
    compradoEm: null,
    fornecedor: "",
    valorFinal: null,
    previsaoEntrega: null,
    recebidoPor: null,
    recebidoEm: null,
    divergencia: "",
    canceladoEm: null,
    createdAt: enviadoEm,
    updatedAt: enviadoEm,
    ...campos,
    itens: linhas,
    eventos: [{ tipo: "CRIADO" as const, porId: solicitante.id, porNome: solicitante.nome, em: enviadoEm, nota: "" }, ...eventos].map((evento, indice) => ({
      id: `${id}-ev${indice + 1}`,
      ...evento,
    })),
  };
}

/**
 * Seis pedidos plausíveis, de setores diferentes, um em cada situação do
 * fluxo, com datas relativas a hoje — para a prévia mostrar a tela cheia
 * (caixa de aprovação, aprovado para comprar, a caminho, devolvido, recebido).
 * Os ids de quem pediu são os da prévia (preview-<cargo>), então "Meus
 * pedidos" funciona quando se entra na prévia com aquele cargo.
 */
export function pedidosDeExemplo(hojeISO: string): PedidoCompra[] {
  const lucas = { id: "preview-gestor_financeiro", nome: "Lucas" };
  const enfermagem = { id: "preview-enfermeira", nome: "Enfermagem Bratan" };
  const recepcao = { id: "preview-recepcionista", nome: "Recepção Bratan" };
  const concierge = { id: "preview-secretaria_executiva", nome: "Concierge" };
  const limpeza = { id: "preview-limpeza", nome: "Equipe Limpeza" };
  const marketing = { id: "preview-marketing", nome: "Marketing" };
  const comercial = { id: "preview-gestor", nome: "Comercial" };
  const instante = (dia: string, hora = "13:00") => `${dia}T${hora}:00.000Z`;
  const ontemUtil = diaUtilAntes(hojeISO, 1);
  const anteontemUtil = diaUtilAntes(hojeISO, 2);
  const tresUteis = diaUtilAntes(hojeISO, 3);
  const cincoUteis = diaUtilAntes(hojeISO, 5);
  // O recebido conta em "Recebidos no mês" — no começo do mês, recebe hoje.
  const diaRecebido = anteontemUtil.slice(0, 7) === hojeISO.slice(0, 7) ? anteontemUtil : hojeISO;

  return [
    exemplo(
      14,
      "ENFERMAGEM",
      enfermagem,
      anteontemUtil,
      {
        status: "ENVIADO",
        urgencia: "URGENTE",
        precisaAte: somaDias(hojeISO, 2),
        justificativa: "Acabam antes da próxima entrega da Stin; a semana tem 18 aplicações marcadas.",
      },
      [
        { estoqueItemRef: null, descricao: "Seringa 3 mL sem agulha", quantidade: 100, unidade: "un", valorUnitario: 0.42 },
        { estoqueItemRef: null, descricao: "Agulha 30 x 7", quantidade: 100, unidade: "un", valorUnitario: 0.25 },
      ],
      [],
    ),
    exemplo(
      15,
      "RECEPCAO",
      recepcao,
      hojeISO,
      { status: "ENVIADO", justificativa: "Reposição do mês para a recepção e a copa." },
      [
        { estoqueItemRef: null, descricao: "Papel A4 (resma com 500 folhas)", quantidade: 5, unidade: "resma", valorUnitario: 32.9 },
        { estoqueItemRef: null, descricao: "Café em grãos 1 kg", quantidade: 3, unidade: "pct", valorUnitario: 79.9 },
        { estoqueItemRef: null, descricao: "Copo descartável 180 mL", quantidade: 10, unidade: "pct", valorUnitario: null },
      ],
      [],
    ),
    exemplo(
      12,
      "PACIENTES",
      concierge,
      tresUteis,
      {
        status: "APROVADO",
        decididoPor: lucas.id,
        decididoEm: instante(ontemUtil, "14:00"),
        justificativa: "Cortesias da sala de espera abaixo do mínimo.",
      },
      [
        { estoqueItemRef: null, descricao: "Barrinha de aveia, banana e mel", quantidade: 48, unidade: "un", valorUnitario: 1.89 },
        { estoqueItemRef: null, descricao: "Absorvente íntimo", quantidade: 32, unidade: "un", valorUnitario: 0.6 },
      ],
      [{ tipo: "APROVADO", porId: lucas.id, porNome: lucas.nome, em: instante(ontemUtil, "14:00"), nota: "" }],
    ),
    exemplo(
      10,
      "LIMPEZA",
      limpeza,
      cincoUteis,
      {
        status: "COMPRADO",
        decididoPor: lucas.id,
        decididoEm: instante(tresUteis, "15:00"),
        compraRef: "fpur-exemplo-pedido-0010",
        compradoPor: lucas.id,
        compradoEm: instante(anteontemUtil, "16:00"),
        fornecedor: "Mercado Livre",
        valorFinal: 286.2,
        previsaoEntrega: somaDias(hojeISO, 1),
        justificativa: "Estoque da limpeza para o mês inteiro.",
      },
      [
        { estoqueItemRef: null, descricao: "Álcool 70% 1 L", quantidade: 12, unidade: "un", valorUnitario: 9.9 },
        { estoqueItemRef: null, descricao: "Papel toalha interfolha", quantidade: 6, unidade: "fardo", valorUnitario: 27.9 },
      ],
      [
        { tipo: "APROVADO", porId: lucas.id, porNome: lucas.nome, em: instante(tresUteis, "15:00"), nota: "" },
        { tipo: "COMPRADO", porId: lucas.id, porNome: lucas.nome, em: instante(anteontemUtil, "16:00"), nota: "Mercado Livre" },
      ],
    ),
    exemplo(
      13,
      "MARKETING",
      marketing,
      anteontemUtil,
      {
        status: "DEVOLVIDO",
        decididoPor: lucas.id,
        decididoEm: instante(ontemUtil, "11:00"),
        decisaoNota: "Mande o link de 2 fornecedores para comparar o preço.",
        justificativa: "Gravar os vídeos do Dr. Daniel na clínica.",
      },
      [{ estoqueItemRef: null, descricao: "Tripé para celular com luz", quantidade: 1, unidade: "un", valorUnitario: 189 }],
      [{ tipo: "DEVOLVIDO", porId: lucas.id, porNome: lucas.nome, em: instante(ontemUtil, "11:00"), nota: "Mande o link de 2 fornecedores para comparar o preço." }],
    ),
    exemplo(
      8,
      "COMERCIAL",
      comercial,
      diaUtilAntes(diaRecebido, 4),
      {
        status: "RECEBIDO",
        decididoPor: lucas.id,
        decididoEm: instante(diaUtilAntes(diaRecebido, 3), "10:00"),
        compraRef: "fpur-exemplo-pedido-0008",
        compradoPor: lucas.id,
        compradoEm: instante(diaUtilAntes(diaRecebido, 3), "17:00"),
        fornecedor: "Gráfica Vila Olímpia",
        valorFinal: 640,
        previsaoEntrega: diaRecebido,
        recebidoPor: comercial.id,
        recebidoEm: instante(diaRecebido, "18:00"),
        justificativa: "Pastas para entregar o plano ao paciente na consulta.",
      },
      [{ estoqueItemRef: null, descricao: "Pasta com logo (impressa)", quantidade: 200, unidade: "un", valorUnitario: 3.2, qtdRecebida: 200 }],
      [
        { tipo: "APROVADO", porId: lucas.id, porNome: lucas.nome, em: instante(diaUtilAntes(diaRecebido, 3), "10:00"), nota: "" },
        { tipo: "COMPRADO", porId: lucas.id, porNome: lucas.nome, em: instante(diaUtilAntes(diaRecebido, 3), "17:00"), nota: "Gráfica Vila Olímpia" },
        { tipo: "RECEBIDO", porId: comercial.id, porNome: comercial.nome, em: instante(diaRecebido, "18:00"), nota: "" },
      ],
    ),
  ];
}
