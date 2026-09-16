// BASE DA CAMADA DE DADOS (16/09/2026, proposta 7.4 do estudo).
//
// O acesso a dados vivia num arquivo só, de 5.579 linhas — o maior do projeto e
// o que mais dá conflito quando duas pessoas mexem no mesmo dia. A quebra é por
// domínio, e `remoteData.ts` continua sendo a porta de entrada: ninguém precisa
// trocar import nenhum. Aqui ficam só as peças que todos os domínios usam.
import { supabase } from "@/lib/supabase";

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase ainda não está configurado.");
  }
  // O projeto mantém um tipo Database escrito à mão até dar para gerar o schema inteiro.
  return supabase as any;
}

/** Só devolve o valor quando ele é mesmo um uuid — o banco recusa o resto. */
export function uuidOrNull(value?: string | null) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

/** Número que pode não existir: null continua null, em vez de virar zero. */
export function numeroOuNulo(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

/** Lê o corpo real do erro de uma Edge Function (o supabase-js só diz "non-2xx"). */
export async function detalheDoErroDaFuncao(error: unknown): Promise<string> {
  const contexto = (error as { context?: Response })?.context;
  if (contexto && typeof contexto.json === "function") {
    try {
      const body = await contexto.json();
      return String(body?.error ?? body?.message ?? JSON.stringify(body));
    } catch {
      /* corpo não era JSON */
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Grava o evento de auditoria sem nunca derrubar a ação de quem está usando. */
export async function safeWriteRemoteAuditEvent(values: { action: string; entity: string; entityId?: string | null; metadata?: Record<string, unknown> | null }) {
  try {
    const client = requireSupabase();
    const { error } = await client.rpc("write_audit_event", {
      _action: values.action,
      _entity: values.entity,
      _entity_id: values.entityId ?? null,
      _metadata: values.metadata ?? {},
    });
    if (error) console.warn("Audit event was not persisted.", error);
  } catch (error) {
    console.warn("Audit event was not persisted.", error);
  }
}

/** Nome de arquivo que sobrevive a uma URL pública (sem acento, sem espaço). */
export function publicUrlSafeName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
