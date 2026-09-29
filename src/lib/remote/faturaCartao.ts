// FATURA DO CARTÃO IMPORTADA (29/09/2026) — camada de dados.
// Tabelas e funções em supabase/migrations/202609290001_fatura_do_cartao.sql.
// A regra (leitura do arquivo, casamento, trava, rateio) mora em
// src/features/financeiro/faturaCartao.ts; aqui só se lê e grava.
import type { CartaoFatura, FaturaImportadaResumo, FormatoFatura, OrigemCategoria, RateioDeConta, TipoLinhaFatura } from "@/features/financeiro/faturaCartao";
import { requireSupabase, safeWriteRemoteAuditEvent } from "./base";

export type FaturaImportada = FaturaImportadaResumo & {
  finalCartao: string;
  vencimento: string;
  fechamento: string | null;
  somaLinhas: number;
  contaAcao: "CRIADA" | "ATUALIZADA";
  valorAnterior: number | null;
  vencimentoAnterior: string | null;
  arquivoNome: string;
  arquivoFormato: string;
  observacao: string;
};

export type ItemFaturaGravado = {
  clientRef: string;
  faturaRef: string;
  ordem: number;
  data: string | null;
  descricao: string;
  parcelaNum: number | null;
  parcelaTotal: number | null;
  valor: number;
  tipo: TipoLinhaFatura;
  categoriaRef: string | null;
  categoriaOrigem: OrigemCategoria;
  purchaseRef: string | null;
  casamento: "AUTO" | "MANUAL" | null;
};

/** Erro do banco em português (as funções levantam "CODIGO: frase"). */
export function mensagemDoErroDaFatura(error: unknown) {
  const texto = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  const frase = texto.match(/^[A-Z_]+:\s*(.+)$/);
  if (frase) return frase[1];
  if (/fin_fatura_cartao_mes_uidx/.test(texto)) return "A fatura deste cartão neste mês já foi importada.";
  if (/fin_fatura_cartao_assinatura_uidx/.test(texto)) return "Este mesmo arquivo já foi importado.";
  if (/fin_fatura_cartao_conta_uidx/.test(texto)) return "Esta conta a pagar já está ligada a outra fatura.";
  if (/compra_parcela_uidx|compra_fatura_uidx/.test(texto)) return "Uma das compras casadas já está ligada a outra linha de fatura. Desfaça esse casamento e tente de novo.";
  if (/function .*fin_fatura_confirmar|Could not find the function/i.test(texto)) {
    return "A importação de fatura ainda não está ligada no banco (falta aplicar a migration 202609290001_fatura_do_cartao).";
  }
  if (/row-level security|permission denied/i.test(texto)) return "Sem permissão: só o financeiro completo grava a fatura.";
  return texto;
}

function numero(value: unknown) {
  return Number(value ?? 0);
}

export async function listRemoteFaturasCartao(): Promise<FaturaImportada[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_fatura_cartao")
    .select("client_ref, cartao, final_cartao, mes_ref, vencimento, fechamento, total, soma_linhas, expense_ref, conta_acao, valor_anterior, vencimento_anterior, assinatura, arquivo_nome, arquivo_formato, observacao, created_at")
    .is("deleted_at", null)
    .order("vencimento", { ascending: false })
    .limit(120);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    clientRef: String(row.client_ref),
    cartao: row.cartao as CartaoFatura,
    finalCartao: String(row.final_cartao ?? ""),
    mesRef: String(row.mes_ref),
    vencimento: String(row.vencimento),
    fechamento: (row.fechamento as string | null) ?? null,
    total: numero(row.total),
    somaLinhas: numero(row.soma_linhas),
    expenseRef: String(row.expense_ref),
    contaAcao: row.conta_acao as FaturaImportada["contaAcao"],
    valorAnterior: row.valor_anterior == null ? null : numero(row.valor_anterior),
    vencimentoAnterior: (row.vencimento_anterior as string | null) ?? null,
    assinatura: String(row.assinatura),
    arquivoNome: String(row.arquivo_nome ?? ""),
    arquivoFormato: String(row.arquivo_formato ?? ""),
    observacao: String(row.observacao ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function listRemoteItensDaFatura(faturaRef: string): Promise<ItemFaturaGravado[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_fatura_cartao_item")
    .select("client_ref, fatura_ref, ordem, data_compra, descricao, parcela_num, parcela_total, valor, tipo, categoria_ref, categoria_origem, purchase_ref, casamento")
    .eq("fatura_ref", faturaRef)
    .is("deleted_at", null)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(itemDaLinha);
}

/** Compra#parcela já ligada a alguma fatura importada (para não casar de novo). */
export async function listRemoteComprasJaNaFatura(): Promise<{ purchaseRef: string; parcelaNum: number | null; faturaRef: string }[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_fatura_cartao_item")
    .select("purchase_ref, parcela_num, fatura_ref")
    .not("purchase_ref", "is", null)
    .is("deleted_at", null)
    .limit(5000);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    purchaseRef: String(row.purchase_ref),
    parcelaNum: row.parcela_num == null ? null : Number(row.parcela_num),
    faturaRef: String(row.fatura_ref),
  }));
}

function itemDaLinha(row: Record<string, unknown>): ItemFaturaGravado {
  return {
    clientRef: String(row.client_ref),
    faturaRef: String(row.fatura_ref),
    ordem: Number(row.ordem),
    data: (row.data_compra as string | null) ?? null,
    descricao: String(row.descricao ?? ""),
    parcelaNum: row.parcela_num == null ? null : Number(row.parcela_num),
    parcelaTotal: row.parcela_total == null ? null : Number(row.parcela_total),
    valor: numero(row.valor),
    tipo: row.tipo as TipoLinhaFatura,
    categoriaRef: (row.categoria_ref as string | null) ?? null,
    categoriaOrigem: (row.categoria_origem as OrigemCategoria) ?? "REGRA",
    purchaseRef: (row.purchase_ref as string | null) ?? null,
    casamento: (row.casamento as ItemFaturaGravado["casamento"]) ?? null,
  };
}

export type ConfirmarFaturaPayload = {
  clientRef: string;
  cartao: CartaoFatura;
  finalCartao: string;
  mesRef: string;
  vencimento: string;
  fechamento: string | null;
  total: number;
  somaLinhas: number;
  assinatura: string;
  arquivoNome: string;
  arquivoFormato: FormatoFatura | "";
  observacao: string;
  conta: { acao: "CRIAR" | "ATUALIZAR"; clientRef: string; description: string; supplier: string; nota: string };
  itens: Omit<ItemFaturaGravado, "faturaRef">[];
};

/** Grava conta + fatura + itens numa transação só (fin_fatura_confirmar). */
export async function confirmarRemoteFaturaCartao(payload: ConfirmarFaturaPayload): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("fin_fatura_confirmar", {
    p: {
      client_ref: payload.clientRef,
      cartao: payload.cartao,
      final_cartao: payload.finalCartao,
      mes_ref: payload.mesRef,
      vencimento: payload.vencimento,
      fechamento: payload.fechamento,
      total: payload.total,
      soma_linhas: payload.somaLinhas,
      assinatura: payload.assinatura,
      arquivo_nome: payload.arquivoNome,
      arquivo_formato: payload.arquivoFormato,
      observacao: payload.observacao,
      conta: {
        acao: payload.conta.acao,
        client_ref: payload.conta.clientRef,
        description: payload.conta.description,
        supplier: payload.conta.supplier,
        nota: payload.conta.nota,
      },
      itens: payload.itens.map((item) => ({
        client_ref: item.clientRef,
        ordem: item.ordem,
        data_compra: item.data,
        descricao: item.descricao,
        parcela_num: item.parcelaNum,
        parcela_total: item.parcelaTotal,
        valor: item.valor,
        tipo: item.tipo,
        categoria_ref: item.categoriaRef,
        categoria_origem: item.categoriaOrigem,
        purchase_ref: item.purchaseRef,
        casamento: item.casamento,
      })),
    },
  });
  if (error) throw new Error(mensagemDoErroDaFatura(error));
  return String(data ?? payload.clientRef);
}

export async function desfazerRemoteFaturaCartao(faturaRef: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("fin_fatura_desfazer", { p_ref: faturaRef });
  if (error) throw new Error(mensagemDoErroDaFatura(error));
}

/** Troca a categoria de uma linha já importada (a P12 acompanha na hora). */
export async function updateRemoteCategoriaDoItem(itemRef: string, categoriaRef: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_fatura_cartao_item")
    .update({ categoria_ref: categoriaRef, categoria_origem: "MANUAL" })
    .eq("client_ref", itemRef);
  if (error) throw new Error(mensagemDoErroDaFatura(error));
  await safeWriteRemoteAuditEvent({ action: "financeiro.fatura_cartao.categoria", entity: "fin_fatura_cartao_item", entityId: itemRef, metadata: { categoriaRef } });
}

/** Soma dos itens por categoria de cada conta de fatura do ano (para a P12/Painel/Lucro). */
export async function listRemoteRateioDasFaturas(ano: number): Promise<RateioDeConta[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("fin_fatura_rateio", { p_ano: ano });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    expenseRef: String(row.expense_ref),
    categoriaRef: String(row.categoria_ref),
    valor: numero(row.valor),
  }));
}

/** Compras de cartão num intervalo (o hook do financeiro carrega um ano só; parcela vem de meses antes). */
export async function listRemoteComprasDeCartao(de: string, ate: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_purchases")
    .select("client_ref, purchase_date, description, supplier, amount, method, card, installments")
    .eq("method", "CARTAO_CREDITO")
    .gte("purchase_date", de)
    .lte("purchase_date", ate)
    .is("deleted_at", null)
    .order("purchase_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    purchaseDate: String(row.purchase_date),
    description: String(row.description ?? ""),
    supplier: String(row.supplier ?? ""),
    amount: numero(row.amount),
    method: "CARTAO_CREDITO" as const,
    card: (row.card as "ITAU" | "SANTANDER" | "SAFRA" | "OUTRO" | null) ?? null,
    installments: Number(row.installments ?? 1),
  }));
}
