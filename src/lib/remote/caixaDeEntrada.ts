// Caixa de entrada do financeiro.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import type { Colaborador } from "@/types/database";
import type { EstalecaClaim } from "@/features/estalecas/estalecasData";
import { sharePointTargetFolder } from "@/lib/sharepoint";
import { createRemoteEstalecaTransaction } from "@/lib/remoteData";
import { requireSupabase, safeWriteRemoteAuditEvent, uuidOrNull , publicUrlSafeName } from "./base";
import { todayISO } from "@/lib/localStore";

// ---- Caixa de entrada do financeiro (02/09/2026) --------------------------------
export type FinInboxStatus = "NOVO" | "LANCADO" | "DESCARTADO";
export type FinInboxItem = {
  id: string;
  origem: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageBucket: string | null;
  storagePath: string | null;
  texto: string;
  leitura: Record<string, unknown>;
  status: FinInboxStatus;
  expenseRef: string | null;
  observacao: string;
  createdAt: string;
};

function mapInboxRow(row: Record<string, unknown>): FinInboxItem {
  return {
    id: String(row.client_ref),
    origem: String(row.origem ?? "UPLOAD"),
    fileName: String(row.file_name ?? ""),
    mimeType: String(row.mime_type ?? ""),
    fileSize: Number(row.file_size ?? 0),
    storageBucket: (row.storage_bucket as string | null) ?? null,
    storagePath: (row.storage_path as string | null) ?? null,
    texto: String(row.texto ?? ""),
    leitura: (row.leitura as Record<string, unknown>) ?? {},
    status: (row.status as FinInboxStatus) ?? "NOVO",
    expenseRef: (row.expense_ref as string | null) ?? null,
    observacao: String(row.observacao ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listRemoteFinInbox(): Promise<FinInboxItem[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_inbox_item")
    .select("client_ref, origem, file_name, mime_type, file_size, storage_bucket, storage_path, texto, leitura, status, expense_ref, observacao, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapInboxRow);
}

/** Sobe o arquivo (quando há) e grava o item lido. Devolve o item como ficou. */
export async function createRemoteFinInboxItem(values: {
  file?: File | null;
  origem: string;
  texto: string;
  leitura: Record<string, unknown>;
  pessoaId: string | null;
}): Promise<FinInboxItem> {
  const client = requireSupabase();
  const id = crypto.randomUUID();
  let storagePath: string | null = null;
  if (values.file) {
    const safeName = publicUrlSafeName(values.file.name) || "documento";
    storagePath = `${todayISO().slice(0, 7)}/${id}-${safeName}`;
    const { error: storageError } = await client.storage
      .from("fin-caixa-entrada")
      .upload(storagePath, values.file, { cacheControl: "3600", upsert: false });
    if (storageError) throw storageError;
  }
  const row = {
    client_ref: `inbox-${id}`,
    origem: values.origem,
    file_name: values.file?.name ?? "",
    mime_type: values.file?.type ?? "text/plain",
    file_size: values.file?.size ?? values.texto.length,
    storage_bucket: storagePath ? "fin-caixa-entrada" : null,
    storage_path: storagePath,
    texto: values.texto.slice(0, 20000),
    leitura: values.leitura,
    status: "NOVO",
    created_by: values.pessoaId,
  };
  const { data, error } = await client.from("fin_inbox_item").insert(row).select().single();
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "financeiro.caixa_entrada.receber", entity: "fin_inbox_item", entityId: row.client_ref, metadata: { origem: values.origem } });
  return mapInboxRow(data as Record<string, unknown>);
}

export async function updateRemoteFinInboxStatus(id: string, status: FinInboxStatus, expenseRef: string | null = null, observacao = "") {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_inbox_item")
    .update({ status, expense_ref: expenseRef, observacao })
    .eq("client_ref", id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: `financeiro.caixa_entrada.${status.toLowerCase()}`, entity: "fin_inbox_item", entityId: id, metadata: { expenseRef } });
}

export async function signedUrlFinInboxFile(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("fin-caixa-entrada").createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadRemoteExpenseNota(values: {
  expenseRef: string;
  expenseDescription: string;
  file: File;
  pessoaId: string | null;
  numero?: string;
  emitente?: string;
  valor?: number | null;
  emitidaEm?: string | null;
  observacao?: string;
}) {
  const client = requireSupabase();
  const id = crypto.randomUUID();
  const safeName = publicUrlSafeName(values.file.name) || "nota-fiscal";
  const storagePath = `${todayISO().slice(0, 7)}/${id}-${safeName}`;

  const { error: storageError } = await client.storage
    .from("notas-fiscais-despesa")
    .upload(storagePath, values.file, { cacheControl: "3600", upsert: false });
  if (storageError) throw storageError;

  const { error: insertError } = await client.from("fin_expense_nota").insert({
    client_ref: `nf-desp-${id}`,
    expense_ref: values.expenseRef,
    storage_bucket: "notas-fiscais-despesa",
    storage_path: storagePath,
    file_name: values.file.name,
    mime_type: values.file.type || "application/octet-stream",
    file_size: values.file.size,
    numero: values.numero ?? "",
    emitente: values.emitente ?? "",
    valor: values.valor ?? null,
    emitida_em: values.emitidaEm ?? null,
    observacao: values.observacao ?? "",
    uploaded_by: uuidOrNull(values.pessoaId),
  });
  if (insertError) throw insertError;

  // Nome do arquivo no SharePoint com a conta na frente: quem abrir a pasta
  // entende do que é a nota sem precisar abrir o app.
  const nomeNaPasta = `${values.expenseDescription} - ${values.file.name}`.slice(0, 180);
  const { error: dispatchError } = await client.from("sharepoint_dispatch_queue").insert({
    module: "NOTA_FISCAL_DESPESA",
    entity_id: id,
    storage_bucket: "notas-fiscais-despesa",
    storage_path: storagePath,
    file_name: nomeNaPasta,
    mime_type: values.file.type || "application/octet-stream",
    target_folder: sharePointTargetFolder("NOTA_FISCAL_DESPESA"),
    created_by: uuidOrNull(values.pessoaId),
  });
  if (dispatchError) console.warn("Nota salva, mas não entrou na fila do SharePoint.", dispatchError);

  await safeWriteRemoteAuditEvent({
    action: "financeiro.conta.nota.anexar",
    entity: "fin_expense_nota",
    entityId: id,
    metadata: { conta: values.expenseRef, arquivo: values.file.name },
  });
  return { id, storagePath };
}

/** Marca a conta como "não gera nota" ou "fornecedor vai mandar", sem arquivo. */
export async function setRemoteExpenseNotaStatus(expenseRef: string, status: "PENDENTE" | "AGUARDANDO" | "SEM_NOTA") {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_expenses")
    .update({ nota_status: status, updated_at: new Date().toISOString() })
    .eq("client_ref", expenseRef);
  if (error) throw error;
}

export async function deleteRemoteExpenseNota(clientRef: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_expense_nota")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("client_ref", clientRef);
  if (error) throw error;
}

export async function getRemoteExpenseNotaUrl(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("notas-fiscais-despesa").createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl as string;
}

export async function getRemoteComprovanteUrl(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("comprovantes").createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl as string;
}

export async function getRemoteEstalecaClaimPhotoUrl(photoPath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("estalecas-provas").createSignedUrl(photoPath, 60 * 10);
  if (error) throw error;
  return data.signedUrl as string;
}

export async function reviewRemoteEstalecaClaim(values: {
  pessoa: Colaborador;
  claim: EstalecaClaim;
  approve: boolean;
  amount: number;
  note: string;
}) {
  const client = requireSupabase();

  if (values.approve && values.amount > 0) {
    // Idempotência: a aprovação NÃO é atômica (credita e depois marca APROVADA).
    // Se o update da claim falhou antes, a claim continua PENDENTE e reaprovar
    // creditaria de novo. Só credita se ainda não houver transação desta claim.
    const { data: existing } = await client
      .from("estaleca_transactions")
      .select("id")
      .eq("metadata->>claimId", values.claim.id)
      .limit(1);
    if (!existing || !existing.length) {
      await createRemoteEstalecaTransaction({
        targetUserId: values.claim.colaboradorId,
        createdBy: values.pessoa.id,
        type: "earn",
        source: "admin_bonus",
        amount: values.amount,
        status: "approved",
        description: `Conquista aprovada: ${values.claim.title}`,
        metadata: { claimId: values.claim.id, claimType: values.claim.claimType, reviewNote: values.note },
      });
    }
  }

  const { error } = await client
    .from("estaleca_claims")
    .update({
      status: values.approve ? "APPROVED" : "REJECTED",
      reviewed_by: values.pessoa.id,
      reviewed_at: new Date().toISOString(),
      review_note: values.note,
    })
    .eq("id", values.claim.id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: values.approve ? "estalecas.conquista.aprovar" : "estalecas.conquista.recusar",
    entity: "estaleca_claims",
    entityId: values.claim.id,
    metadata: { amount: values.amount, claimType: values.claim.claimType },
  });
}
