// COMPRA À VISTA VIRA CONTA PAGA (29/09/2026, auditoria B3).
//
// Por quê: a tela de Compras dizia que PIX/débito/dinheiro era "saída direta do
// caixa", mas nada registrava essa saída — a compra ficava só no controle e o
// dinheiro que saiu nunca aparecia no P12 nem em Contas a Pagar. Agora a compra
// à vista cria, junto, a conta JÁ PAGA na data da compra, com a categoria da P12.
//
// O que NÃO vira conta (para nunca contar em dobro):
//   · cartão de crédito — entra pela fatura do cartão (uma vez só);
//   · boleto — quem lança é Contas a Pagar (o boleto tem vencimento próprio);
//   · compra que já tem conta ligada (expenseRef), como a do "também é compra"
//     do Lançar rápido em Contas a Pagar.
// O id da conta é derivado do id da compra: reenviar não duplica.
import type { FinCategory, FinExpense, FinPaymentMethod, FinPurchase } from "./financeiroData";

/** Formas que tiram o dinheiro na hora. Transferência é igual ao PIX para o caixa. */
export const METODOS_A_VISTA: FinPaymentMethod[] = ["PIX", "CARTAO_DEBITO", "DINHEIRO", "TRANSFERENCIA"];

export function ehCompraAVista(method: FinPaymentMethod) {
  return METODOS_A_VISTA.includes(method);
}

export function idDaContaDaCompra(purchaseId: string) {
  return `fexp-compra-${purchaseId}`;
}

export function despesaDaCompraAVista(
  purchase: Pick<FinPurchase, "id" | "purchaseDate" | "description" | "supplier" | "amount" | "method" | "nfNote" | "expenseRef">,
  categoryRef: string,
  categories: Pick<FinCategory, "id" | "isCapex">[] = [],
  agoraISO = new Date().toISOString(),
): FinExpense | null {
  if (!ehCompraAVista(purchase.method)) return null;
  if (purchase.expenseRef) return null;
  if (!categoryRef) return null;
  const categoria = categories.find((item) => item.id === categoryRef);
  return {
    id: idDaContaDaCompra(purchase.id),
    description: purchase.description,
    categoryRef,
    amount: Math.round(purchase.amount * 100) / 100,
    dueDate: purchase.purchaseDate,
    paidAt: purchase.purchaseDate,
    method: purchase.method,
    supplier: purchase.supplier,
    installmentNum: null,
    installmentTotal: null,
    documentNote: purchase.nfNote,
    isCapex: categoria?.isCapex ?? false,
    notes: "Compra à vista lançada em Compras — já saiu do caixa.",
    createdAt: agoraISO,
    recorrencia: null,
  };
}
