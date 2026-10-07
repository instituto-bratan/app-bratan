// REGISTRAR UMA COMPRA (06/10/2026) — a regra que a tela Compras usava, agora
// num lugar só.
//
// Por quê: a compra passou a nascer em DOIS lugares — a tela Compras do
// Financeiro e o "Registrar compra" de um pedido aprovado (/compras). Se cada
// tela montasse a sua, a regra de 29/09 (à vista vira conta JÁ PAGA com a
// categoria da P12; crédito entra pela fatura; boleto se lança em Contas a
// Pagar) ia divergir na primeira mudança. As duas telas chamam montarCompra()
// e gravarCompra() daqui. 07/10/2026: o "Já comprei" do Estoque também (ver
// compraDoItemDoEstoque) — eram três montagens, agora é uma.
//
// Sem React e sem banco: tests/compras-tela.test.mjs confere a regra.
import { parseMoneyBR } from "@/lib/money";
import type { EstoqueItem, EstoqueSetor } from "@/features/estoque/estoqueData";
import { despesaDaCompraAVista, ehCompraAVista } from "./compraAVista";
import type { FinCategory, FinExpense, FinPaymentMethod, FinPurchase, FinPurchaseCard } from "./financeiroData";

/** As formas de pagamento que a tela de compra oferece, na ordem dos botões. */
export const FORMAS_DE_COMPRA: FinPaymentMethod[] = ["CARTAO_CREDITO", "BOLETO", "PIX", "CARTAO_DEBITO", "DINHEIRO", "TRANSFERENCIA"];

const CARTOES: Record<FinPurchaseCard, string> = { ITAU: "Itaú", SANTANDER: "Santander", SAFRA: "Safra", OUTRO: "Outro" };

export type FormularioDeCompra = {
  purchaseDate: string;
  description: string;
  supplier: string;
  /** Como a pessoa digitou ("1.500,00") ou já em número. */
  amount: string | number;
  method: FinPaymentMethod;
  card: FinPurchaseCard;
  installments: string | number;
  nfNote: string;
  deliveryEta: string | null;
  estoqueSetor: EstoqueSetor | "" | null;
  estoqueItemRef?: string | null;
  /** Categoria da P12 — obrigatória no à vista (a compra vira conta paga). */
  categoryRef: string;
  /** Pedido de compra de origem (cped-…): o gatilho do banco muda o pedido para "comprado". */
  pedidoRef?: string | null;
  notes?: string;
};

export type CompraMontada = {
  compra: FinPurchase;
  /** A conta já paga da compra à vista; null no crédito e no boleto. */
  conta: FinExpense | null;
  /** A frase que a tela mostra depois de gravar: onde a compra entra no P12. */
  aviso: string;
};

export type ResultadoMontagem = ({ ok: true } & CompraMontada) | { ok: false; erro: string };

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");

function novoIdDeCompra() {
  const cripto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return `fbuy-${cripto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

/** Antes de gravar: onde a compra vai entrar no P12 (a faixa abaixo do formulário). */
export function ondeEntraNoP12(method: FinPaymentMethod, card: FinPurchaseCard | null): string {
  if (method === "CARTAO_CREDITO") return `Entra no P12 só pela fatura do ${CARTOES[card ?? "OUTRO"]} — não precisa lançar em outro lugar.`;
  if (method === "BOLETO") return "Depois de salvar, lance o boleto em Contas a Pagar (é lá que entra no P12).";
  // 06/10/2026: a frase antiga dizia "saída direta do caixa — fica só no
  // controle", o que deixou de ser verdade em 29/09 (à vista vira conta paga).
  return "Vira conta já paga em Contas a Pagar, na categoria escolhida — não lance de novo.";
}

/** Depois de gravar: o que aconteceu com a compra. */
export function avisoDaCompra(method: FinPaymentMethod, card: FinPurchaseCard | null, valor: number, purchaseDate: string): string {
  if (method === "CARTAO_CREDITO") {
    return `Compra registrada (${brl(valor)}). Ela entra no P12 só pela fatura do ${CARTOES[card ?? "OUTRO"]} — não lance de novo.`;
  }
  if (method === "BOLETO") {
    return `Compra registrada no controle (${brl(valor)}). Lembre de lançar o boleto em Contas a Pagar — é lá que entra no P12.`;
  }
  return `Compra registrada e lançada como conta PAGA em ${dataCurta(purchaseDate)} (${brl(valor)}) — já entra no P12. Não lance de novo em Contas a Pagar.`;
}

/**
 * Confere o formulário e monta a compra (e, no à vista, a conta já paga ligada
 * a ela por expenseRef). Mesmas travas e frases que a tela Compras sempre teve.
 */
export function montarCompra(
  formulario: FormularioDeCompra,
  opcoes: { categorias?: Pick<FinCategory, "id" | "isCapex">[]; id?: string; agoraISO?: string } = {},
): ResultadoMontagem {
  const descricao = (formulario.description ?? "").trim();
  const valor = typeof formulario.amount === "number" ? formulario.amount : parseMoneyBR(formulario.amount);
  if (!descricao) return { ok: false, erro: "Falta a descrição da compra." };
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "Não entendi o valor — digite como 1.500,00." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(formulario.purchaseDate ?? "")) return { ok: false, erro: "Falta a data da compra." };
  const aVista = ehCompraAVista(formulario.method);
  if (aVista && !formulario.categoryRef) return { ok: false, erro: "Escolha a categoria da P12 — a compra à vista já vira conta paga." };

  const ehCartao = formulario.method === "CARTAO_CREDITO" || formulario.method === "CARTAO_DEBITO";
  const parcelas = Math.max(1, Math.floor(Number(formulario.installments) || 1));
  const agoraISO = opcoes.agoraISO ?? new Date().toISOString();
  const compra: FinPurchase = {
    id: opcoes.id ?? novoIdDeCompra(),
    purchaseDate: formulario.purchaseDate,
    description: descricao,
    supplier: (formulario.supplier ?? "").trim(),
    amount: Math.round(valor * 100) / 100,
    method: formulario.method,
    card: ehCartao ? formulario.card : null,
    installments: ehCartao ? parcelas : 1,
    nfNote: (formulario.nfNote ?? "").trim(),
    deliveryEta: formulario.deliveryEta || null,
    receivedAt: null,
    expenseRef: null,
    notes: (formulario.notes ?? "").trim(),
    estoqueSetor: formulario.estoqueSetor || null,
    estoqueItemRef: formulario.estoqueItemRef || null,
    pedidoRef: formulario.pedidoRef || null,
    createdAt: agoraISO,
  };
  // Onde cada compra entra no P12 (29/09/2026, auditoria B3):
  //   · crédito → só pela fatura do cartão (nunca cria conta aqui);
  //   · boleto → Contas a Pagar (tem vencimento próprio);
  //   · à vista (PIX, débito, dinheiro, transferência) → conta JÁ PAGA ligada à
  //     compra por expenseRef (o id da conta deriva do id da compra: reenviar não duplica).
  const conta = despesaDaCompraAVista(compra, formulario.categoryRef, opcoes.categorias ?? [], agoraISO);
  return {
    ok: true,
    compra: { ...compra, expenseRef: conta?.id ?? null },
    conta,
    aviso: avisoDaCompra(compra.method, compra.card, compra.amount, compra.purchaseDate),
  };
}

/**
 * "JÁ COMPREI" DO ESTOQUE (07/10/2026) — o terceiro lugar onde a compra nasce.
 *
 * Por quê: o botão do Estoque (21/09) montava a compra na mão, com PIX fixo,
 * sem conta paga e sem categoria da P12 — a compra feita no cartão aparecia
 * como PIX e a feita no PIX nunca entrava no P12 (o defeito antigo do
 * levantamento de 06/10). Agora ele passa pelo MESMO montarCompra/gravarCompra
 * das outras duas telas: a pessoa escolhe a forma de pagamento e, no à vista,
 * a categoria. Do item vêm só a descrição, o setor e o vínculo (estoqueItemRef)
 * — é o vínculo que deixa o item "a caminho" no estoque. Sem pedido de origem.
 */
export function compraDoItemDoEstoque(item: Pick<EstoqueItem, "id" | "nome" | "setor">) {
  return {
    description: (item.nome ?? "").trim(),
    supplier: "",
    amount: "",
    estoqueSetor: item.setor,
    estoqueItemRef: item.id as string | null,
    pedidoRef: null as string | null,
  };
}

/** O que gravar precisa: o par addPurchase/addExpense do useFinanceiro (true = chegou ao servidor). */
export type GravadorDeCompra = {
  addPurchase: (compra: FinPurchase) => Promise<boolean>;
  addExpense: (conta: FinExpense) => Promise<boolean>;
};

export type ResultadoGravacao = {
  /** A compra está gravada (no servidor; no modo local, no aparelho). */
  compraGravada: boolean;
  /** A conta à vista está gravada; null quando a compra não tem conta (crédito, boleto). */
  contaGravada: boolean | null;
};

/**
 * Grava a COMPRA PRIMEIRO e só depois a conta paga. Por quê (06/10/2026): a
 * compra de um pedido pode ser recusada pelo banco (o gatilho exige o pedido
 * ainda APROVADO — alguém pode ter cancelado no meio), e gravar as duas juntas
 * deixava uma conta paga sem compra. `remoto` = falso no modo prévia/local,
 * em que addPurchase/addExpense devolvem false sem que isso seja falha.
 */
export async function gravarCompra(gravador: GravadorDeCompra, montada: CompraMontada, remoto: boolean): Promise<ResultadoGravacao> {
  const compraOk = await gravador.addPurchase(montada.compra);
  if (remoto && !compraOk) return { compraGravada: false, contaGravada: montada.conta ? false : null };
  if (!montada.conta) return { compraGravada: true, contaGravada: null };
  const contaOk = await gravador.addExpense(montada.conta);
  return { compraGravada: true, contaGravada: remoto ? contaOk : true };
}
