// Nota fiscal da conta a pagar (a do fornecedor).
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import { requireSupabase } from "./base";

// ---- NOTA FISCAL DA CONTA A PAGAR (12/08/2026) ------------------------------
// A nota do FORNECEDOR anexada à conta. Segue o MESMO caminho do comprovante:
// storage privado + fila do SharePoint (a Edge Function sharepoint-dispatch lê o
// bucket da própria linha, então não precisou de mudança nela).
export type FinExpenseNotaRecord = {
  clientRef: string;
  expenseRef: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  numero: string;
  emitente: string;
  valor: number | null;
  emitidaEm: string | null;
  observacao: string;
  uploadedBy: string | null;
  createdAt: string;
};

export async function listRemoteExpenseNotas(): Promise<FinExpenseNotaRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_expense_nota")
    .select("client_ref, expense_ref, storage_path, file_name, mime_type, numero, emitente, valor, emitida_em, observacao, uploaded_by, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    clientRef: String(row.client_ref),
    expenseRef: String(row.expense_ref),
    // Nota casada antes do arquivo chegar da SEFAZ (22/09/2026): fica vazio até o XML completo baixar.
    storagePath: row.storage_path ? String(row.storage_path) : "",
    fileName: String(row.file_name ?? ""),
    mimeType: String(row.mime_type ?? ""),
    numero: String(row.numero ?? ""),
    emitente: String(row.emitente ?? ""),
    valor: row.valor === null || row.valor === undefined ? null : Number(row.valor),
    emitidaEm: row.emitida_em ? String(row.emitida_em).slice(0, 10) : null,
    observacao: String(row.observacao ?? ""),
    uploadedBy: row.uploaded_by ? String(row.uploaded_by) : null,
    createdAt: String(row.created_at ?? ""),
  }));
}
