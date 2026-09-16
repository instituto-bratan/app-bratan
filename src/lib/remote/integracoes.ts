// Integrações externas: estado, eventos e segredos (lote C).
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import { detalheDoErroDaFuncao, requireSupabase, uuidOrNull } from "./base";

// ---------------------------------------------------------------------------
// INTEGRAÇÕES EXTERNAS (15/09/2026, lote C): prontas e desligadas.
import type { IntegracaoRecord } from "@/lib/integracoes";

export async function listRemoteIntegracoes(): Promise<IntegracaoRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("integracao").select("chave, nome, descricao, ligada, config, atualizado_em, atualizado_por").order("nome");
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    chave: row.chave,
    nome: row.nome,
    descricao: row.descricao ?? "",
    ligada: Boolean(row.ligada),
    config: (row.config as Record<string, unknown>) ?? {},
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por ?? null,
  }));
}

export async function saveRemoteIntegracao(chave: string, mudanca: { ligada?: boolean; config?: Record<string, unknown> }, atualizadoPor: string | null) {
  const client = requireSupabase();
  const { error } = await client
    .from("integracao")
    .update({ ...(mudanca.ligada === undefined ? {} : { ligada: mudanca.ligada }), ...(mudanca.config === undefined ? {} : { config: mudanca.config }), atualizado_em: new Date().toISOString(), atualizado_por: uuidOrNull(atualizadoPor) })
    .eq("chave", chave);
  if (error) throw new Error(error.message);
}

export type IntegracaoEvento = { id: string; chave: string; direcao: string; entidade: string | null; entityRef: string | null; status: string; resumo: string; criadoEm: string };

export async function listRemoteIntegracaoEventos(chave?: string, limit = 30): Promise<IntegracaoEvento[]> {
  const client = requireSupabase();
  let query = client.from("integracao_evento").select("id, chave, direcao, entidade, entity_ref, status, resumo, criado_em").order("criado_em", { ascending: false }).limit(limit);
  if (chave) query = query.eq("chave", chave);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({ id: row.id, chave: row.chave, direcao: row.direcao, entidade: row.entidade ?? null, entityRef: row.entity_ref ?? null, status: row.status, resumo: row.resumo ?? "", criadoEm: row.criado_em }));
}

/** Quais segredos de cada integração já existem nas Edge Functions (só sim/não). */
export async function statusSegredosIntegracoes(): Promise<Record<string, { exigidos: string[]; faltam: string[]; prontos: boolean }>> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("integracoes-status", { body: {} });
  if (error) throw new Error(await detalheDoErroDaFuncao(error));
  return ((data ?? {}) as { status?: Record<string, { exigidos: string[]; faltam: string[]; prontos: boolean }> }).status ?? {};
}

/** Chama uma Edge Function de integração e devolve o corpo (ok:false quando desligada/sem segredo). */
export async function invocarIntegracao<T extends { ok?: boolean; error?: string } = { ok: boolean; error?: string }>(slug: string, body: Record<string, unknown>): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(slug, { body });
  if (error) return { ok: false, error: await detalheDoErroDaFuncao(error) } as T;
  return (data ?? { ok: false, error: "sem resposta" }) as T;
}

export async function salvarPushAssinatura(pessoaId: string, assinatura: { endpoint: string; keys: { p256dh: string; auth: string } }, aparelho: string) {
  const client = requireSupabase();
  const { error } = await client.from("push_assinatura").upsert({ pessoa_id: pessoaId, endpoint: assinatura.endpoint, p256dh: assinatura.keys.p256dh, auth: assinatura.keys.auth, aparelho }, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
}

export async function removerPushAssinatura(endpoint: string) {
  const client = requireSupabase();
  const { error } = await client.from("push_assinatura").delete().eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}

export async function contarPushAssinaturas(pessoaId: string): Promise<number> {
  const client = requireSupabase();
  const { count, error } = await client.from("push_assinatura").select("id", { count: "exact", head: true }).eq("pessoa_id", pessoaId);
  if (error) return 0;
  return count ?? 0;
}

export type AgendaEspelhoItem = { id: string; origem: string; dia: string; inicio: string | null; fim: string | null; minutos: number | null; sala: string | null; profissional: string | null; paciente: string | null; tipo: string | null; status: string | null };

export async function listRemoteAgendaEspelho(de: string, ate: string): Promise<AgendaEspelhoItem[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("agenda_espelho").select("id, origem, dia, inicio, fim, minutos, sala, profissional, paciente, tipo, status").gte("dia", de).lte("dia", ate).order("inicio");
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({ id: row.id, origem: row.origem, dia: row.dia, inicio: row.inicio, fim: row.fim, minutos: row.minutos, sala: row.sala, profissional: row.profissional, paciente: row.paciente, tipo: row.tipo, status: row.status }));
}

export type ContratoAssinatura = { id: string; dealRef: string; status: string; urlAssinatura: string | null; signatarioNome: string | null; criadoEm: string; erro: string | null };

export async function listRemoteContratosDoDeal(dealRef: string): Promise<ContratoAssinatura[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("contrato_assinatura").select("id, deal_ref, status, url_assinatura, signatario_nome, criado_em, erro").eq("deal_ref", dealRef).order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({ id: row.id, dealRef: row.deal_ref, status: row.status, urlAssinatura: row.url_assinatura ?? null, signatarioNome: row.signatario_nome ?? null, criadoEm: row.criado_em, erro: row.erro ?? null }));
}

export type NfseEmissao = { id: string; ref: string; saleRef: string; tipo: string; valor: number; status: string; numero: string | null; urlPdf: string | null; erro: string | null; criadoEm: string };

export async function listRemoteNfseDaComanda(saleRef: string): Promise<NfseEmissao[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("nfse_emissao").select("id, ref, sale_ref, tipo, valor, status, numero, url_pdf, erro, criado_em").eq("sale_ref", saleRef).order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({ id: row.id, ref: row.ref, saleRef: row.sale_ref, tipo: row.tipo, valor: Number(row.valor), status: row.status, numero: row.numero ?? null, urlPdf: row.url_pdf ?? null, erro: row.erro ?? null, criadoEm: row.criado_em }));
}
