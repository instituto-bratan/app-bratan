// O LOTE DE NOTAS A EMITIR (22/09/2026) — as regras puras.
//
// Cada item é UMA nota: comanda principal, valor, tipo, o dia e a forma de
// pagamento que vão na discriminação, e as "partes" (como o valor se reparte
// entre as comandas no controle de impostos — uma nota pode juntar mãe e
// filho, ou somar um sinal pago antes). O texto da nota é o mesmo do
// fechamento (notaNoFechamento.ts), para a nota do lote sair igual à do dia.
import { createFinId, type FinInvoice, type FinInvoiceType } from "./financeiroData";
import { discriminacao as textoDaNota, type NaturezaDaNota } from "@/features/crm/notaNoFechamento";

export type TipoDoLote = "CONSULTA" | "BIOIMPEDANCIA" | "TRATAMENTO" | "UNIFICADA";
export type StatusDoLote = "PENDENTE" | "ENVIADA" | "AUTORIZADA" | "ERRO" | "RETIRADA";
export type ParteDoLote = { saleRef: string; invoiceType: FinInvoiceType; amount: number; patientName: string; comandaDate: string };
export type ItemDoLote = {
  id: string;
  lote: string;
  ordem: number;
  saleRef: string;
  contactRef: string | null;
  tomadorNome: string;
  tipo: TipoDoLote;
  valor: number;
  dia: string;
  pagamentoTexto: string;
  partes: ParteDoLote[];
  observacao: string;
  status: StatusDoLote;
  ref: string | null;
  numero: string | null;
  erro: string | null;
  emitidaEm: string | null;
};

/** A natureza que dá o texto e o código: a unificada é uma nota de tratamento. */
export function naturezaDoItem(tipo: TipoDoLote): NaturezaDaNota {
  return tipo === "UNIFICADA" ? "TRATAMENTO" : tipo;
}

/** A discriminação exatamente como a do fechamento, para o dia e a forma de pagamento do item. */
export function discriminacaoDoItem(item: Pick<ItemDoLote, "tipo" | "dia" | "pagamentoTexto">) {
  return textoDaNota(naturezaDoItem(item.tipo), item.dia, item.pagamentoTexto);
}

/** As linhas do controle de impostos que a nota autorizada gera — uma por parte, todas com o mesmo número. */
export function invoicesDoItem(item: ItemDoLote, numero: string, issueDate: string): FinInvoice[] {
  const partes = item.partes.length ? item.partes : [{ saleRef: item.saleRef, invoiceType: naturezaDoItem(item.tipo), amount: item.valor, patientName: item.tomadorNome, comandaDate: item.dia }];
  return partes.map((parte) => ({
    id: createFinId("finv"),
    saleRef: parte.saleRef,
    invoiceType: parte.invoiceType,
    invoiceNumber: numero,
    issueDate,
    comandaDate: parte.comandaDate,
    patientName: parte.patientName,
    amount: parte.amount,
    notes: partes.length > 1 ? `Nota ${numero} emitida pela Focus no lote ${item.lote} em nome de ${item.tomadorNome}, cobrindo ${partes.length} comandas (esta parte: ${parte.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).` : `Emitida pela Focus no lote ${item.lote}.`,
    createdAt: new Date().toISOString(),
  }));
}

/** As partes fecham com o valor da nota? Diferença de centavo é erro de imposto. */
export function partesFecham(item: Pick<ItemDoLote, "valor" | "partes">) {
  if (!item.partes.length) return true;
  const soma = item.partes.reduce((s, p) => s + p.amount, 0);
  return Math.abs(soma - item.valor) < 0.005;
}

export function resumoDoLote(itens: ItemDoLote[]) {
  const por = (s: StatusDoLote) => itens.filter((i) => i.status === s);
  const pendentes = por("PENDENTE");
  const valor = (lista: ItemDoLote[]) => lista.reduce((s, i) => s + i.valor, 0);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const partes: string[] = [];
  if (pendentes.length) partes.push(`${pendentes.length} para emitir (${brl(valor(pendentes))})`);
  if (por("ENVIADA").length) partes.push(`${por("ENVIADA").length} aguardando a prefeitura`);
  if (por("AUTORIZADA").length) partes.push(`${por("AUTORIZADA").length} autorizadas (${brl(valor(por("AUTORIZADA")))})`);
  if (por("ERRO").length) partes.push(`${por("ERRO").length} com erro`);
  if (por("RETIRADA").length) partes.push(`${por("RETIRADA").length} retiradas`);
  return { pendentes: pendentes.length, valorPendente: valor(pendentes), frase: partes.join(" · ") || "Lote vazio." };
}
