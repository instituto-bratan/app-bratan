// Extrato do banco e conciliação das linhas.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import type { FinSavingsMove } from "@/features/financeiro/financeiroData";
import { requireSupabase, safeWriteRemoteAuditEvent, uuidOrNull } from "./base";

// ---- Extrato do banco (10/08/2026) --------------------------------------------
export type FinBankEntryRow = {
  clientRef: string;
  entryDate: string;
  description: string;
  counterparty: string;
  document: string;
  amount: number;
  balance: number | null;
  matchKind: "COMANDA" | "DESPESA" | "COFRE" | "IGNORADO" | null;
  matchRef: string | null;
  matchNote: string | null;
};

/** Muda o estado do comprovante de um pagamento (10/08/2026). */
export async function updateRemotePaymentComprovante(
  paymentRef: string,
  status: "PENDENTE" | "ANEXADO" | "AGUARDANDO" | "NAO_SE_APLICA",
  comprovanteRef: string | null = null,
) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_sale_payments")
    .update({ comprovante_status: status, comprovante_ref: comprovanteRef })
    .eq("client_ref", paymentRef);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.comanda.comprovante",
    entity: "fin_sale_payments",
    entityId: paymentRef,
    metadata: { status },
  });
}

export async function listRemoteFinBankEntries(): Promise<FinBankEntryRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_bank_entry")
    .select("client_ref, entry_date, description, counterparty, document, amount, balance, match_kind, match_ref, match_note")
    .is("deleted_at", null)
    .order("entry_date", { ascending: false })
    .limit(3000);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    clientRef: String(row.client_ref),
    entryDate: String(row.entry_date ?? "").slice(0, 10),
    description: String(row.description ?? ""),
    counterparty: String(row.counterparty ?? ""),
    document: String(row.document ?? ""),
    amount: Number(row.amount ?? 0),
    balance: row.balance === null || row.balance === undefined ? null : Number(row.balance),
    matchKind: (row.match_kind as FinBankEntryRow["matchKind"]) ?? null,
    matchRef: row.match_ref ? String(row.match_ref) : null,
    matchNote: row.match_note ? String(row.match_note) : null,
  }));
}

/** Importa (ou reimporta) linhas do extrato. O client_ref determinístico evita duplicar. */
export async function saveRemoteFinBankEntries(entries: FinBankEntryRow[], importedBy: string | null) {
  if (!entries.length) return 0;
  const client = requireSupabase();
  const { error } = await client.from("fin_bank_entry").upsert(
    entries.map((entry) => ({
      client_ref: entry.clientRef,
      entry_date: entry.entryDate,
      description: entry.description,
      counterparty: entry.counterparty,
      document: entry.document,
      amount: entry.amount,
      balance: entry.balance,
      source: "ITAU",
      imported_by: uuidOrNull(importedBy),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    })),
    { onConflict: "client_ref", ignoreDuplicates: true },
  );
  if (error) throw new Error(`fin_bank_entry: ${error.message} · ${error.details ?? ""} · código ${error.code ?? "?"}`);
  await safeWriteRemoteAuditEvent({
    action: "financeiro.extrato.importar",
    entity: "fin_bank_entry",
    metadata: { linhas: entries.length, de: entries[entries.length - 1]?.entryDate, ate: entries[0]?.entryDate },
  });
  return entries.length;
}

/** Marca um lançamento do extrato (ex.: IGNORADO para o que não é do Instituto). */
export async function updateRemoteFinBankEntry(
  clientRef: string,
  patch: { matchKind?: FinBankEntryRow["matchKind"]; matchNote?: string | null },
  matchedBy: string | null,
) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_bank_entry")
    .update({
      match_kind: patch.matchKind ?? null,
      match_note: patch.matchNote ?? null,
      matched_by: uuidOrNull(matchedBy),
      matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("client_ref", clientRef);
  if (error) throw error;
}

export async function listRemoteFinSavings(): Promise<FinSavingsMove[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_savings_moves")
    .select("client_ref, move_date, direction, amount, reason, source, kind, month_ref, created_at")
    .is("deleted_at", null)
    .order("move_date", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    moveDate: String(row.move_date),
    direction: row.direction as FinSavingsMove["direction"],
    amount: Number(row.amount ?? 0),
    reason: String(row.reason ?? ""),
    source: row.source as FinSavingsMove["source"],
    kind: (row.kind ?? undefined) as FinSavingsMove["kind"],
    monthRef: String(row.month_ref ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));
}

// ---------------------------------------------------------------------------
// SALDO DO BANCO (17/09/2026). O valor digitado na Prova do dinheiro (P12) morava
// só no localStorage de quem digitou — então o "lucro real (caixa)" do Painel
// aparecia para o Lucas e sumia para todo mundo na reunião. Agora é do app.
export type SaldoDoBanco = { dia: string; valor: number; atualizadoEm: string };

export async function lerRemoteSaldoBanco(): Promise<SaldoDoBanco | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("fin_saldo_banco").select("dia, valor, atualizado_em").order("dia", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { dia: data.dia as string, valor: Number(data.valor), atualizadoEm: data.atualizado_em as string };
}

export async function salvarRemoteSaldoBanco(dia: string, valor: number, atualizadoPor: string | null) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_saldo_banco")
    .upsert({ dia, valor, atualizado_por: uuidOrNull(atualizadoPor), atualizado_em: new Date().toISOString() }, { onConflict: "dia" });
  if (error) throw new Error(error.message);
}
