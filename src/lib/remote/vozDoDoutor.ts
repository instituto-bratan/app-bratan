// A voz do doutor (22/09/2026): gravações por fase do plano, gravadas pela
// coordenação em Administração → Portal do paciente. O paciente as recebe pela
// função portal-paciente (URL assinada), nunca por aqui.
import { requireSupabase, safeWriteRemoteAuditEvent, uuidOrNull } from "./base";
import { extensaoDoAudio, type FaseDoDoutor } from "../../../supabase/functions/_shared/vozDoDoutor";

export type MensagemDoDoutorRegistro = {
  id: string;
  fase: FaseDoDoutor;
  titulo: string;
  texto: string;
  storagePath: string | null;
  mimeType: string | null;
  duracaoS: number | null;
  ativo: boolean;
  criadoEm: string;
};

const BUCKET = "portal-voz-doutor";

export async function listRemoteMensagensDoDoutor(): Promise<MensagemDoDoutorRegistro[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("portal_mensagem_doutor").select("id, fase, titulo, texto, storage_path, mime_type, duracao_s, ativo, criado_em").order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    fase: r.fase as FaseDoDoutor,
    titulo: String(r.titulo ?? ""),
    texto: String(r.texto ?? ""),
    storagePath: (r.storage_path as string | null) ?? null,
    mimeType: (r.mime_type as string | null) ?? null,
    duracaoS: r.duracao_s == null ? null : Number(r.duracao_s),
    ativo: Boolean(r.ativo),
    criadoEm: String(r.criado_em ?? ""),
  }));
}

/** Sobe o áudio e grava a mensagem; a anterior da mesma fase é desativada (fica no histórico). */
export async function salvarRemoteMensagemDoDoutor(entrada: { fase: FaseDoDoutor; titulo: string; texto: string; audio: Blob | null; mimeType: string; duracaoS: number | null; pessoaId: string | null }) {
  const client = requireSupabase();
  const id = crypto.randomUUID();
  let storagePath: string | null = null;
  if (entrada.audio) {
    storagePath = `${entrada.fase.toLowerCase()}/${id}.${extensaoDoAudio(entrada.mimeType)}`;
    const { error } = await client.storage.from(BUCKET).upload(storagePath, entrada.audio, { contentType: entrada.mimeType || "audio/mp4", upsert: false });
    if (error) throw new Error(error.message);
  }
  await client.from("portal_mensagem_doutor").update({ ativo: false, atualizado_em: new Date().toISOString() }).eq("fase", entrada.fase).eq("ativo", true);
  const { error } = await client.from("portal_mensagem_doutor").insert({
    id,
    fase: entrada.fase,
    titulo: entrada.titulo.trim(),
    texto: entrada.texto.trim(),
    storage_bucket: storagePath ? BUCKET : null,
    storage_path: storagePath,
    mime_type: storagePath ? entrada.mimeType : null,
    duracao_s: entrada.duracaoS == null ? null : Math.round(entrada.duracaoS),
    ativo: true,
    criado_por: uuidOrNull(entrada.pessoaId),
  });
  if (error) throw new Error(error.message);
  await safeWriteRemoteAuditEvent({ action: "portal.voz_doutor.gravar", entity: "portal_mensagem_doutor", entityId: id, metadata: { fase: entrada.fase, comAudio: Boolean(storagePath) } });
  return id;
}

export async function setRemoteMensagemDoDoutorAtiva(id: string, ativo: boolean) {
  const client = requireSupabase();
  const { error } = await client.from("portal_mensagem_doutor").update({ ativo, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Link de 10 minutos para ouvir na tela de administração. */
export async function urlDoAudioDoDoutor(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl as string;
}
