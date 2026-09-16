// Gestão Mensal e a reunião de líderes.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import type { FinInvoice, FinPartnerEntry, FinProvisionRule, FinSavingsMove } from "@/features/financeiro/financeiroData";
import { requireSupabase, safeWriteRemoteAuditEvent, uuidOrNull } from "./base";

// ---- Gestão Mensal / Reunião de Líderes (03/08/2026) --------------------------
// Uma linha por mês (client_ref = gestao-mensal-YYYY-MM). Guarda só o que é
// escrito por gente: explicações por indicador, PDCA e o snapshot do que foi
// apresentado. Os números vêm sempre dos lançamentos.
export type FinGestaoMensalRecord = {
  id: string;
  monthRef: string;
  explicacoes: Record<string, string>;
  pdca: Record<string, string>;
  snapshot: Record<string, unknown>;
  // Resumo de fechamento: o que é DIGITADO na reunião (saldos do dia, decisões).
  // O que é calculado não mora aqui — sai dos lançamentos toda vez que abre.
  fechamento: Record<string, string>;
  apresentadoEm: string | null;
};

export async function listRemoteFinGestaoMensal(): Promise<FinGestaoMensalRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_gestao_mensal")
    .select("client_ref, month_ref, explicacoes, pdca, snapshot, fechamento, apresentado_em")
    .is("deleted_at", null)
    .order("month_ref", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    monthRef: String(row.month_ref ?? ""),
    explicacoes: (row.explicacoes as Record<string, string>) ?? {},
    pdca: (row.pdca as Record<string, string>) ?? {},
    snapshot: (row.snapshot as Record<string, unknown>) ?? {},
    fechamento: (row.fechamento as Record<string, string>) ?? {},
    apresentadoEm: row.apresentado_em ? String(row.apresentado_em) : null,
  }));
}

export async function saveRemoteFinGestaoMensal(record: FinGestaoMensalRecord, updatedBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_gestao_mensal").upsert(
    {
      client_ref: record.id,
      month_ref: record.monthRef,
      explicacoes: record.explicacoes ?? {},
      pdca: record.pdca ?? {},
      snapshot: record.snapshot ?? {},
      fechamento: record.fechamento ?? {},
      apresentado_em: record.apresentadoEm,
      updated_by: uuidOrNull(updatedBy),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
    { onConflict: "client_ref" },
  );
  if (error) throw new Error(`fin_gestao_mensal: ${error.message} · ${error.details ?? ""} · código ${error.code ?? "?"}`);
  await safeWriteRemoteAuditEvent({
    action: "financeiro.gestao.mensal.salvar",
    entity: "fin_gestao_mensal",
    entityId: record.id,
    metadata: { mes: record.monthRef, apresentado: Boolean(record.apresentadoEm) },
  });
}

export async function createRemoteFinSavingsMoves(moves: FinSavingsMove[], createdBy: string | null) {
  if (!moves.length) return;
  const client = requireSupabase();
  const { error } = await client.from("fin_savings_moves").upsert(
    moves.map((move) => ({
      client_ref: move.id,
      move_date: move.moveDate,
      direction: move.direction,
      amount: move.amount,
      reason: move.reason,
      source: move.source,
      kind: move.kind ?? null,
      month_ref: move.monthRef,
      created_by: uuidOrNull(createdBy),
      // Reconfirmar provisões após excluir os movimentos do mês usa os MESMOS ids
      // determinísticos (fsav-prov-<mês>-<regra>). Com ignoreDuplicates a linha
      // soft-deletada não voltava e a provisão sumia do saldo/P12. Upsert real +
      // deleted_at:null a ressuscita.
      deleted_at: null,
    })),
    { onConflict: "client_ref" },
  );
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.poupanca.lancar",
    entity: "fin_savings_moves",
    metadata: { moves: moves.length, source: moves[0]?.source },
  });
}

export async function deleteRemoteFinSavingsMove(moveRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_savings_moves").update({ deleted_at: new Date().toISOString() }).eq("client_ref", moveRef);
  if (error) throw error;
}

export async function listRemoteFinProvisionRules(): Promise<FinProvisionRule[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_provision_rules")
    .select("client_ref, name, monthly_amount, sort_order, active")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    name: String(row.name),
    monthlyAmount: Number(row.monthly_amount ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
  }));
}

export async function listRemoteFinInvoices(year: number): Promise<FinInvoice[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_invoices")
    .select("client_ref, sale_ref, invoice_type, invoice_number, issue_date, comanda_date, patient_name, amount, notes, created_at")
    .gte("issue_date", `${year}-01-01`)
    .lte("issue_date", `${year}-12-31`)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    saleRef: (row.sale_ref as string | null) ?? null,
    invoiceType: row.invoice_type as FinInvoice["invoiceType"],
    invoiceNumber: String(row.invoice_number ?? ""),
    issueDate: String(row.issue_date),
    comandaDate: (row.comanda_date as string | null) ?? null,
    patientName: String(row.patient_name ?? ""),
    amount: Number(row.amount ?? 0),
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function createRemoteFinInvoice(invoice: FinInvoice, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_invoices").insert({
    client_ref: invoice.id,
    sale_ref: invoice.saleRef,
    invoice_type: invoice.invoiceType,
    invoice_number: invoice.invoiceNumber,
    issue_date: invoice.issueDate,
    comanda_date: invoice.comandaDate,
    patient_name: invoice.patientName,
    amount: invoice.amount,
    notes: invoice.notes,
    created_by: uuidOrNull(createdBy),
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.nf.registrar",
    entity: "fin_invoices",
    entityId: invoice.id,
    metadata: { invoiceType: invoice.invoiceType, amount: invoice.amount, invoiceNumber: invoice.invoiceNumber },
  });
}

export async function deleteRemoteFinInvoice(invoiceRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_invoices").update({ deleted_at: new Date().toISOString() }).eq("client_ref", invoiceRef);
  if (error) throw error;
}

export async function listRemoteFinPartnerEntries(year: number): Promise<FinPartnerEntry[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_partner_entries")
    .select("client_ref, professional, entry_date, patient_name, sale_item_ref, kind, amount, notes, created_at")
    .gte("entry_date", `${year}-01-01`)
    .lte("entry_date", `${year}-12-31`)
    .is("deleted_at", null)
    .order("entry_date", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    professional: row.professional as FinPartnerEntry["professional"],
    entryDate: String(row.entry_date),
    patientName: String(row.patient_name ?? ""),
    saleItemRef: (row.sale_item_ref as string | null) ?? null,
    kind: row.kind as FinPartnerEntry["kind"],
    amount: Number(row.amount ?? 0),
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function createRemoteFinPartnerEntry(entry: FinPartnerEntry, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_partner_entries").upsert(
    {
      client_ref: entry.id,
      professional: entry.professional,
      entry_date: entry.entryDate,
      patient_name: entry.patientName,
      sale_item_ref: entry.saleItemRef,
      kind: entry.kind,
      amount: entry.amount,
      notes: entry.notes,
      created_by: uuidOrNull(createdBy),
      // Reclassificar um repasse é excluir (soft delete) e recriar com o MESMO id
      // determinístico. Com ignoreDuplicates a linha soft-deletada não voltava e
      // o repasse sumia no refetch. Upsert real + deleted_at:null a ressuscita.
      deleted_at: null,
    },
    { onConflict: "client_ref" },
  );
  if (error) throw error;
}

export async function deleteRemoteFinPartnerEntry(entryRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_partner_entries").update({ deleted_at: new Date().toISOString() }).eq("client_ref", entryRef);
  if (error) throw error;
}
