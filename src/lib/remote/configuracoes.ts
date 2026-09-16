// Configurações com vigência (proposta 7.3).
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import { requireSupabase, safeWriteRemoteAuditEvent, uuidOrNull } from "./base";

// ---------------------------------------------------------------------------
// CONFIGURAÇÕES COM VIGÊNCIA (14/09/2026, proposta 7.3)
// ---------------------------------------------------------------------------
export async function listRemoteAppConfig(): Promise<import("@/lib/configNegocio").LinhaConfig[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("app_config_vigencia")
    .select("chave, valor, vigente_de, observacao, criado_em, colaborador:criado_por(nome)")
    .order("vigente_de", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    chave: String(row.chave),
    valor: row.valor,
    vigenteDe: String(row.vigente_de ?? "").slice(0, 10),
    criadoEm: String(row.criado_em ?? ""),
    observacao: String(row.observacao ?? ""),
    criadoPorNome: ((row.colaborador as { nome?: string | null } | null)?.nome ?? null),
  }));
}

export async function saveRemoteAppConfig(values: { chave: string; valor: unknown; vigenteDe: string; observacao?: string; pessoaId: string | null }) {
  const client = requireSupabase();
  const { error } = await client.from("app_config_vigencia").insert({
    chave: values.chave,
    valor: values.valor as never,
    vigente_de: values.vigenteDe,
    observacao: values.observacao ?? "",
    criado_por: uuidOrNull(values.pessoaId),
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "config.negocio.alterar", entity: "app_config_vigencia", entityId: values.chave, metadata: { valor: values.valor, vigenteDe: values.vigenteDe } });
}
