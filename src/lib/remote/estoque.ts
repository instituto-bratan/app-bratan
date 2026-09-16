// Estoque: itens, movimentos e as compras que viram entrada.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import type { EstoqueItem, EstoqueMovimento } from "@/features/estoque/estoqueData";
import type { FinPurchase } from "@/features/financeiro/financeiroData";
import { requireSupabase, safeWriteRemoteAuditEvent, uuidOrNull } from "./base";

// ---------------------------------------------------------------------------
// ESTOQUE (19/08/2026): itens e movimentos. A enfermeira e a recepcionista
// enxergam só o próprio setor (RLS estoque_pode); a coordenação vê os dois.
// ---------------------------------------------------------------------------
export async function listRemoteEstoqueItems(): Promise<EstoqueItem[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estoque_item")
    .select("client_ref, setor, nome, categoria, unidade, minimo, codigo_barras, observacao, created_at")
    .is("deleted_at", null)
    .order("nome");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    setor: row.setor as EstoqueItem["setor"],
    nome: String(row.nome ?? ""),
    categoria: String(row.categoria ?? ""),
    unidade: String(row.unidade ?? "un"),
    minimo: Number(row.minimo ?? 0),
    codigoBarras: String(row.codigo_barras ?? ""),
    observacao: String(row.observacao ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }));
}

export async function upsertRemoteEstoqueItem(item: EstoqueItem, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("estoque_item").upsert(
    {
      client_ref: item.id,
      setor: item.setor,
      nome: item.nome,
      categoria: item.categoria,
      unidade: item.unidade,
      minimo: item.minimo,
      codigo_barras: item.codigoBarras,
      observacao: item.observacao,
      created_by: uuidOrNull(createdBy),
    },
    { onConflict: "client_ref" },
  );
  if (error) throw error;
}

export async function deleteRemoteEstoqueItem(itemRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("estoque_item").update({ deleted_at: new Date().toISOString() }).eq("client_ref", itemRef);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "estoque.item.excluir", entity: "estoque_item", entityId: itemRef });
}

export async function listRemoteEstoqueMoves(): Promise<EstoqueMovimento[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estoque_movimento")
    .select("client_ref, item_ref, setor, tipo, quantidade, mov_date, lote, validade, compra_ref, motivo, created_at")
    .is("deleted_at", null)
    .order("mov_date", { ascending: false })
    .limit(4000);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    itemRef: String(row.item_ref),
    setor: row.setor as EstoqueMovimento["setor"],
    tipo: row.tipo as EstoqueMovimento["tipo"],
    quantidade: Number(row.quantidade ?? 0),
    movDate: String(row.mov_date),
    lote: String(row.lote ?? ""),
    validade: (row.validade as string | null) ?? null,
    compraRef: (row.compra_ref as string | null) ?? null,
    motivo: String(row.motivo ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }));
}

export async function createRemoteEstoqueMove(move: EstoqueMovimento, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("estoque_movimento").insert({
    client_ref: move.id,
    item_ref: move.itemRef,
    setor: move.setor,
    tipo: move.tipo,
    quantidade: move.quantidade,
    mov_date: move.movDate,
    lote: move.lote,
    validade: move.validade,
    compra_ref: move.compraRef,
    motivo: move.motivo,
    created_by: uuidOrNull(createdBy),
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estoque.movimento",
    entity: "estoque_movimento",
    entityId: move.id,
    metadata: { setor: move.setor, tipo: move.tipo, quantidade: move.quantidade, compraRef: move.compraRef },
  });
}

/**
 * Compras marcadas para estoque — a versão que a ENFERMEIRA consegue ler.
 * A RLS de fin_purchases abre só as linhas com estoque_setor para quem cuida do
 * setor; o financeiro completo continua vendo tudo pela listagem normal.
 */
export async function listRemoteComprasParaEstoque(): Promise<FinPurchase[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_purchases")
    .select("client_ref, purchase_date, description, supplier, amount, method, card, installments, nf_note, delivery_eta, received_at, expense_ref, notes, estoque_setor, created_at")
    .not("estoque_setor", "is", null)
    .is("deleted_at", null)
    .order("purchase_date", { ascending: false })
    .limit(400);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    purchaseDate: String(row.purchase_date),
    description: String(row.description ?? ""),
    supplier: String(row.supplier ?? ""),
    amount: Number(row.amount ?? 0),
    method: row.method as FinPurchase["method"],
    card: (row.card as FinPurchase["card"]) ?? null,
    installments: Number(row.installments ?? 1),
    nfNote: String(row.nf_note ?? ""),
    deliveryEta: (row.delivery_eta as string | null) ?? null,
    receivedAt: (row.received_at as string | null) ?? null,
    expenseRef: (row.expense_ref as string | null) ?? null,
    notes: String(row.notes ?? ""),
    estoqueSetor: (row.estoque_setor as FinPurchase["estoqueSetor"]) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }));
}
