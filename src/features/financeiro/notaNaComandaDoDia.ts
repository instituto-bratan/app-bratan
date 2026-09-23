// A NOTA NA COMANDA DO DIA (23/09/2026).
//
// Pedido do Lucas: "vão ter casos que a gente não vai emitir na hora do
// fechamento do CRM, e a gente vai lançar na comanda diária — o app tem que
// ter o entendimento de que, se não emitiu no Kanban, quando lançar na comanda
// diária vai emitir a nota". Estas regras dizem, para uma comanda qualquer:
// como a nota se reparte pelos itens, se é só sinal (não emite), quando é o
// padrão de emitir, e em que pé a nota dela está.
import type { NfseEmissao } from "@/lib/remote/integracoes";
import type { QuandoNota } from "@/features/crm/recebimentoKanbanData";
import type { DivisaoDaNota } from "@/features/crm/notaNoFechamento";
import { saleInvoiceBreakdown, type FinPaymentMethod, type FinSale, type FinSaleItem, type FinSalePayment } from "./financeiroData";

type ItemMinimo = Pick<FinSaleItem, "itemType" | "amount">;

/** Consulta, bio e tratamento somados pelos itens — o ponto de partida da nota repartida. */
export function divisaoDosItens(items: ItemMinimo[]): DivisaoDaNota {
  const b = saleInvoiceBreakdown({ items } as unknown as FinSale);
  return { consulta: b.consulta, bioimpedancia: b.bio, tratamento: b.tratamento };
}

/** Só sinal de consulta: adiantamento, a nota sai inteira depois. */
export function ehSoSinal(items: ItemMinimo[]) {
  return saleInvoiceBreakdown({ items } as unknown as FinSale).onlySinal;
}

/** O que o Instituto fatura nesta comanda (nutri e psi ficam fora — vão pelos repasses). */
export function valorFaturavel(items: ItemMinimo[]) {
  return saleInvoiceBreakdown({ items } as unknown as FinSale).total;
}

/** Sinal espera a consulta; o resto, por padrão, emite agora. */
export function quandoPadrao(items: ItemMinimo[]): QuandoNota {
  return ehSoSinal(items) ? "COM_A_CONSULTA" : "AGORA";
}

/** As formas de pagamento no formato que a discriminação da nota entende. */
export function parcelasDaComanda(payments: Pick<FinSalePayment, "method" | "installments">[]): { forma: FinPaymentMethod; parcelas?: number }[] {
  return payments.map((p) => ({ forma: p.method, parcelas: p.installments }));
}

export type EstadoDaNota = { estado: "AUTORIZADA" | "ENVIADA" | "ERRO" | "SEM_NOTA" | "SINAL" | "NAO_EMITIR"; rotulo: string; numeros: string[] };

const falhou = (status: string) => /ERRO|CANCEL|HTTP_/i.test(status);

/**
 * Em que pé está a nota da comanda: autorizada (com número), enviada (a
 * prefeitura ainda não respondeu), com erro, sem nota (é o caso que pede o
 * botão "Emitir"), sinal (não emite) ou "não emitir" (a instrução da comanda
 * diz: conta de sócio, aguardar, sem NF).
 */
export function estadoDaNota(sale: Pick<FinSale, "items" | "notaInstrucao" | "notaQuando">, emissoes: NfseEmissao[]): EstadoDaNota {
  const vivas = emissoes.filter((e) => !falhou(e.status));
  const autorizadas = vivas.filter((e) => /^autorizad/i.test(e.status) && e.numero);
  if (autorizadas.length) return { estado: "AUTORIZADA", rotulo: `NF ${autorizadas.map((e) => `nº ${e.numero}`).join(" e ")}`, numeros: autorizadas.map((e) => String(e.numero)) };
  if (vivas.length) return { estado: "ENVIADA", rotulo: "NF enviada, aguardando a prefeitura", numeros: [] };
  if (ehSoSinal(sale.items)) return { estado: "SINAL", rotulo: "sinal de consulta: a nota sai com a consulta", numeros: [] };
  const instrucao = String(sale.notaInstrucao ?? "");
  if (/sem nota|sem nf|n[aã]o emitir|conta (do |da |de )?s[oó]ci|aguardar/i.test(instrucao) || sale.notaQuando === "AGUARDANDO_ORIENTACAO") {
    return { estado: "NAO_EMITIR", rotulo: "sem nota por instrução da comanda", numeros: [] };
  }
  if (emissoes.length) return { estado: "ERRO", rotulo: "a última tentativa de nota falhou", numeros: [] };
  return { estado: "SEM_NOTA", rotulo: "sem nota fiscal", numeros: [] };
}
