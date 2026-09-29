// O SINAL ENTRA SOMADO NA NOTA DA CONSULTA (29/09/2026).
//
// Regra do Lucas: "sinal de consulta não se emite nota fiscal, ele só se soma
// depois, quando o próprio paciente passar na consulta ou fechar o
// tratamento". A primeira metade já valia (sinal não emite). A segunda não
// existia: quando a consulta acontecia, a nota saía só com o valor do dia, e
// os R$ 500 do sinal nunca apareciam em nota nenhuma — imposto a menos, sem
// ninguém ver. Aqui ficam as regras puras: quais sinais deste paciente ainda
// não entraram em nota, e quanto a nota de hoje tem que somar.
import { saleInvoiceBreakdown, type FinInvoice, type FinSale } from "./financeiroData";

export type SinalEmAberto = { saleRef: string; dia: string; valor: number };

/** Sinais pagos por este paciente que ainda não entraram em nenhuma nota. */
export function sinaisEmAberto(entrada: { sales: FinSale[]; invoices: FinInvoice[]; contactRef: string; excetoSaleRef?: string }): SinalEmAberto[] {
  if (!entrada.contactRef) return [];
  const comNota = new Set(entrada.invoices.filter((invoice) => invoice.saleRef).map((invoice) => invoice.saleRef as string));
  return entrada.sales
    .filter((sale) => sale.crmContactRef === entrada.contactRef && sale.id !== entrada.excetoSaleRef && !comNota.has(sale.id))
    .filter((sale) => saleInvoiceBreakdown(sale).onlySinal)
    .map((sale) => ({ saleRef: sale.id, dia: sale.saleDate, valor: Math.round(saleInvoiceBreakdown(sale).sinal * 100) / 100 }))
    .filter((sinal) => sinal.valor > 0)
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

export function somaDosSinais(sinais: SinalEmAberto[]) {
  return Math.round(sinais.reduce((soma, sinal) => soma + sinal.valor, 0) * 100) / 100;
}

/** A frase do cartão da nota. */
export function fraseDosSinais(sinais: SinalEmAberto[]) {
  if (!sinais.length) return "";
  const soma = somaDosSinais(sinais);
  const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return sinais.length === 1
    ? `Este paciente pagou ${reais(soma)} de sinal em ${dia(sinais[0].dia)}. Ele entra somado nesta nota.`
    : `Este paciente tem ${sinais.length} sinais sem nota (${reais(soma)}: ${sinais.map((s) => `${reais(s.valor)} em ${dia(s.dia)}`).join(", ")}). Eles entram somados nesta nota.`;
}

/**
 * Qual das notas do plano leva o sinal: a de consulta, quando existe (o sinal
 * é adiantamento da consulta); senão, a primeira nota do plano.
 */
export function naturezaQueLevaOSinal(naturezas: string[]) {
  if (!naturezas.length) return null;
  return naturezas.includes("CONSULTA") ? "CONSULTA" : naturezas[0];
}

export type SinalEsperando = SinalEmAberto & { paciente: string; contactRef: string | null };

/** Todos os sinais sem nota, do mais antigo ao mais novo — o cartão de Impostos & NFs. */
export function sinaisEsperandoAConsulta(sales: FinSale[], invoices: FinInvoice[]): SinalEsperando[] {
  const comNota = new Set(invoices.filter((invoice) => invoice.saleRef).map((invoice) => invoice.saleRef as string));
  return sales
    .filter((sale) => !comNota.has(sale.id) && saleInvoiceBreakdown(sale).onlySinal)
    .map((sale) => ({ saleRef: sale.id, dia: sale.saleDate, valor: Math.round(saleInvoiceBreakdown(sale).sinal * 100) / 100, paciente: sale.patientName, contactRef: sale.crmContactRef ?? null }))
    .filter((sinal) => sinal.valor > 0)
    .sort((a, b) => a.dia.localeCompare(b.dia));
}
