// NPS do totem e da concierge.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import type { NpsContato, NpsMes } from "@/features/concierge/npsData";
import { requireSupabase, safeWriteRemoteAuditEvent, uuidOrNull } from "./base";

// ---- NPS do totem (04/08/2026) ------------------------------------------------
// O totem só INSERE (policy anon). Aqui é o lado de leitura, da coordenação.
export async function listRemoteNpsRespostas(): Promise<
  { id: string; nota: number; comentario: string; origem: string; criadoEm: string }[]
> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("nps_resposta")
    .select("id, nota, comentario, origem, criado_em")
    .is("deleted_at", null)
    .order("criado_em", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    nota: Number(row.nota ?? 0),
    comentario: String(row.comentario ?? ""),
    origem: String(row.origem ?? "TOTEM"),
    criadoEm: String(row.criado_em ?? ""),
  }));
}

// ---- NPS da Concierge (21/08/2026) -----------------------------------------
export async function listRemoteNpsContatos(): Promise<NpsContato[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("concierge_nps_contato")
    .select("client_ref, contato_date, paciente_nome, crm_contact_ref, canal, resultado, descricao, resolucao, created_at")
    .is("deleted_at", null)
    .order("contato_date", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    contatoDate: String(row.contato_date),
    pacienteNome: String(row.paciente_nome ?? ""),
    crmContactRef: (row.crm_contact_ref as string | null) ?? null,
    canal: row.canal as NpsContato["canal"],
    resultado: row.resultado as NpsContato["resultado"],
    descricao: String(row.descricao ?? ""),
    resolucao: String(row.resolucao ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }));
}

export async function upsertRemoteNpsContato(contato: NpsContato, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("concierge_nps_contato").upsert(
    {
      client_ref: contato.id,
      contato_date: contato.contatoDate,
      paciente_nome: contato.pacienteNome,
      crm_contact_ref: contato.crmContactRef,
      canal: contato.canal,
      resultado: contato.resultado,
      descricao: contato.descricao,
      resolucao: contato.resolucao,
      created_by: uuidOrNull(createdBy),
    },
    { onConflict: "client_ref" },
  );
  if (error) throw error;
}

export async function deleteRemoteNpsContato(contatoRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("concierge_nps_contato").update({ deleted_at: new Date().toISOString() }).eq("client_ref", contatoRef);
  if (error) throw error;
}

export async function getRemoteNpsMes(monthKey: string): Promise<NpsMes | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("concierge_nps_mes")
    .select("month_key, dores, elogios, pdca")
    .eq("month_key", monthKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const pdca = (row.pdca ?? {}) as Record<string, string>;
  return {
    monthKey: String(row.month_key),
    dores: (row.dores as NpsMes["dores"]) ?? [],
    elogios: (row.elogios as NpsMes["elogios"]) ?? [],
    pdca: { plan: pdca.plan ?? "", do: pdca.do ?? "", check: pdca.check ?? "", act: pdca.act ?? "" },
  };
}

export async function upsertRemoteNpsMes(mes: NpsMes, updatedBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("concierge_nps_mes").upsert(
    { month_key: mes.monthKey, dores: mes.dores, elogios: mes.elogios, pdca: mes.pdca, updated_by: uuidOrNull(updatedBy) },
    { onConflict: "month_key" },
  );
  if (error) throw error;
}

export async function hardDeleteRemoteComprovante(values: { id: string; storagePath?: string }) {
  const client = requireSupabase();
  // Itens ainda não enviados ao SharePoint saem da fila para não subirem depois.
  await client.from("sharepoint_dispatch_queue").delete().eq("entity_id", values.id).eq("status", "PENDING");
  if (values.storagePath) {
    const { error: storageError } = await client.storage.from("comprovantes").remove([values.storagePath]);
    if (storageError) console.warn("Arquivo do Storage não pôde ser removido.", storageError);
  }
  const { error } = await client.from("comprovante").delete().eq("id", values.id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "comprovante.excluir",
    entity: "comprovante",
    entityId: values.id,
    metadata: { storagePath: values.storagePath ?? null },
  });
}
