// O RECADO TRANCADO DO DR. (27/10/2026), lado da equipe: grava pela ficha do
// paciente no 360, direto no bucket privado e na tabela, sob a RLS
// (pode_recado_do_doutor — médicos e coordenação). O paciente ouve pela função
// portal-paciente, nunca por aqui. O "por que eu comecei" do paciente não
// aparece para a equipe: a RLS só entrega as linhas do DOUTOR.
import { requireSupabase, safeWriteRemoteAuditEvent } from "./base";
import { RECADO_BUCKET, caminhoDoRecado, duracaoDoRecado, limparQuemFala, tipoDoAudio } from "../../../supabase/functions/_shared/recadoTrancado";

export type RecadoDoDoutorRegistro = {
  id: string;
  contactRef: string;
  quemFala: string;
  duracaoS: number;
  abreEm: string;
  ouvidoEm: string | null;
  avisoEnviadoEm: string | null;
  criadoEm: string;
  storagePath: string;
  mimeType: string;
};

export async function listRemoteRecadosDoDoutor(contactRef: string): Promise<RecadoDoDoutorRegistro[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("paciente_recado")
    .select("id, contact_ref, quem_fala, duracao_s, abre_em, ouvido_em, aviso_enviado_em, criado_em, storage_path, mime_type")
    .eq("contact_ref", contactRef)
    .eq("autor", "DOUTOR")
    .order("abre_em", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    contactRef: String(r.contact_ref),
    quemFala: String(r.quem_fala ?? ""),
    duracaoS: Number(r.duracao_s ?? 0),
    abreEm: String(r.abre_em ?? "").slice(0, 10),
    ouvidoEm: (r.ouvido_em as string | null) ?? null,
    avisoEnviadoEm: (r.aviso_enviado_em as string | null) ?? null,
    criadoEm: String(r.criado_em ?? ""),
    storagePath: String(r.storage_path ?? ""),
    mimeType: String(r.mime_type ?? ""),
  }));
}

/** Sobe o áudio na pasta "doutor/" e grava a linha. Sem a linha, o arquivo é apagado (nada de órfão). */
export async function salvarRemoteRecadoDoDoutor(entrada: { contactRef: string; audio: Blob; mimeType: string; duracaoS: number; abreEm: string; quemFala: string }) {
  const client = requireSupabase();
  const id = crypto.randomUUID();
  const tipo = tipoDoAudio(entrada.mimeType) || "audio/mp4";
  const caminho = caminhoDoRecado("DOUTOR", entrada.contactRef, id, tipo);
  const { error: erroUpload } = await client.storage.from(RECADO_BUCKET).upload(caminho, entrada.audio, { contentType: tipo, upsert: false });
  if (erroUpload) throw new Error(erroUpload.message);
  const duracaoS = duracaoDoRecado(entrada.duracaoS);
  const { error } = await client.from("paciente_recado").insert({
    id,
    contact_ref: entrada.contactRef,
    autor: "DOUTOR",
    quem_fala: limparQuemFala(entrada.quemFala),
    storage_path: caminho,
    mime_type: tipo,
    duracao_s: duracaoS,
    abre_em: entrada.abreEm,
  });
  if (error) {
    await client.storage.from(RECADO_BUCKET).remove([caminho]);
    throw new Error(error.message);
  }
  await safeWriteRemoteAuditEvent({ action: "portal.recado.gravar", entity: "paciente_recado", entityId: id, metadata: { contactRef: entrada.contactRef, abreEm: entrada.abreEm, duracaoS } });
  return id;
}

/** Apaga enquanto o paciente não ouviu (a RLS recusa depois). Primeiro a linha, depois o arquivo. */
export async function apagarRemoteRecadoDoDoutor(recado: Pick<RecadoDoDoutorRegistro, "id" | "storagePath" | "contactRef">) {
  const client = requireSupabase();
  const { data, error } = await client.from("paciente_recado").delete().eq("id", recado.id).is("ouvido_em", null).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Este recado já foi ouvido pelo paciente e não pode mais ser apagado.");
  await client.storage.from(RECADO_BUCKET).remove([recado.storagePath]);
  await safeWriteRemoteAuditEvent({ action: "portal.recado.apagar", entity: "paciente_recado", entityId: recado.id, metadata: { contactRef: recado.contactRef } });
}

/** Link de 10 minutos para a equipe ouvir o que gravou. */
export async function urlDoRecadoDoDoutor(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from(RECADO_BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl as string;
}
