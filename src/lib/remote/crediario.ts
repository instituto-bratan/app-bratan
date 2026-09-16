// Crediário no lucro do mês.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import type { FinCrediarioProfit } from "@/features/financeiro/financeiroData";
import { requireSupabase, safeWriteRemoteAuditEvent, uuidOrNull } from "./base";

// ---- Crediário no lucro do mês (31/07/2026) -----------------------------------
// Uma linha por mês que o gestor decidiu reconhecer. Upsert por client_ref
// determinístico (crediario-lucro-YYYY-MM): apertar o botão duas vezes atualiza
// o valor em vez de criar outra linha.
export async function listRemoteFinCrediarioProfits(): Promise<FinCrediarioProfit[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_crediario_profit")
    .select("client_ref, month_ref, amount, note, included_at, included_by")
    .is("deleted_at", null)
    .order("month_ref", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    monthRef: String(row.month_ref ?? ""),
    amount: Number(row.amount ?? 0),
    note: String(row.note ?? ""),
    includedAt: String(row.included_at ?? ""),
    includedBy: row.included_by ? String(row.included_by) : null,
  }));
}

export async function saveRemoteFinCrediarioProfit(record: FinCrediarioProfit, includedBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_crediario_profit").upsert(
    {
      client_ref: record.id,
      month_ref: record.monthRef,
      amount: record.amount,
      note: record.note ?? "",
      included_by: uuidOrNull(includedBy),
      included_at: record.includedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
    { onConflict: "client_ref" },
  );
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.crediario.lucro.incluir",
    entity: "fin_crediario_profit",
    entityId: record.id,
    metadata: { mes: record.monthRef, valor: record.amount, nota: record.note ?? "" },
  });
}

export async function deleteRemoteFinCrediarioProfit(recordRef: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_crediario_profit")
    .update({ deleted_at: new Date().toISOString() })
    .eq("client_ref", recordRef);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.crediario.lucro.remover",
    entity: "fin_crediario_profit",
    entityId: recordRef,
    metadata: {},
  });
}
