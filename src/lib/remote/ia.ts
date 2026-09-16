import type { FinBankEntryRow } from "@/lib/remoteData";
// Registro de cada uso de IA (propostas 1.6 e 6.2).
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import { detalheDoErroDaFuncao, requireSupabase, uuidOrNull } from "./base";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// O QUE A IA FEZ (14/09/2026, propostas 1.6 e 6.2): registro de cada uso de
// modelo pelo app, gravado pelas Edge Functions; a pessoa revisa aqui.
// ---------------------------------------------------------------------------
export type IaEventoRecord = {
  id: string;
  createdAt: string;
  funcao: string;
  modelo: string;
  finalidade: string;
  classeRisco: "BAIXO" | "MEDIO" | "ALTO";
  entidade: string | null;
  entityRef: string | null;
  atorNome: string | null;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
  confianca: number | null;
  duracaoMs: number | null;
  resumo: string;
  resultado: Record<string, unknown>;
  permissao: "PROPOSTA" | "AUTO" | "ERRO";
  decisao: "ACEITO" | "AJUSTADO" | "RECUSADO" | null;
  revisadoEm: string | null;
};

export async function listRemoteIaEventos(limit = 200): Promise<IaEventoRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("ia_evento")
    .select("id, created_at, funcao, modelo, finalidade, classe_risco, entidade, entity_ref, ator_id, tokens_entrada, tokens_saida, custo_usd, confianca, duracao_ms, resumo, resultado, permissao, decisao, revisado_em, colaborador:ator_id(nome)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at ?? ""),
    funcao: String(row.funcao ?? ""),
    modelo: String(row.modelo ?? ""),
    finalidade: String(row.finalidade ?? ""),
    classeRisco: (row.classe_risco as IaEventoRecord["classeRisco"]) ?? "BAIXO",
    entidade: (row.entidade as string | null) ?? null,
    entityRef: (row.entity_ref as string | null) ?? null,
    atorNome: ((row.colaborador as { nome?: string | null } | null)?.nome ?? null),
    tokensEntrada: Number(row.tokens_entrada ?? 0),
    tokensSaida: Number(row.tokens_saida ?? 0),
    custoUsd: Number(row.custo_usd ?? 0),
    confianca: row.confianca === null || row.confianca === undefined ? null : Number(row.confianca),
    duracaoMs: row.duracao_ms === null || row.duracao_ms === undefined ? null : Number(row.duracao_ms),
    resumo: String(row.resumo ?? ""),
    resultado: (row.resultado as Record<string, unknown>) ?? {},
    permissao: (row.permissao as IaEventoRecord["permissao"]) ?? "PROPOSTA",
    decisao: (row.decisao as IaEventoRecord["decisao"]) ?? null,
    revisadoEm: (row.revisado_em as string | null) ?? null,
  }));
}

export async function revisarRemoteIaEvento(id: string, decisao: "ACEITO" | "AJUSTADO" | "RECUSADO", pessoaId: string | null) {
  const client = requireSupabase();
  const { error } = await client
    .from("ia_evento")
    .update({ decisao, revisado_por: uuidOrNull(pessoaId), revisado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}


/** CAIXA DE ENTRADA INTELIGENTE (14/09/2026, proposta 1.1): pede à Edge Function que leia o documento com IA. */
export async function lerInboxComIA(inboxId: string): Promise<{ ok: boolean; configured: boolean; leitura?: Record<string, unknown>; error?: string }> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("inbox-ler-documento", { body: { inboxId } });
  if (error) return { ok: false, configured: true, error: await detalheDoErroDaFuncao(error) };
  const body = (data ?? {}) as { ok?: boolean; configured?: boolean; leitura?: Record<string, unknown>; error?: string };
  return { ok: Boolean(body.ok), configured: body.configured !== false, leitura: body.leitura, error: body.error };
}

/**
 * CONCILIAÇÃO GRAVADA LINHA A LINHA (14/09/2026): o casamento automático do
 * Extrato passa a ficar salvo no banco (antes era recalculado a cada abertura e
 * as 187 linhas importadas estavam todas sem match_kind).
 */
export async function saveRemoteFinBankMatches(
  matches: { clientRef: string; matchKind: NonNullable<FinBankEntryRow["matchKind"]>; matchRef: string | null; matchNote: string | null }[],
  matchedBy: string | null,
) {
  if (!matches.length) return 0;
  const client = requireSupabase();
  const agora = new Date().toISOString();
  let gravados = 0;
  for (const match of matches) {
    const { error } = await client
      .from("fin_bank_entry")
      .update({ match_kind: match.matchKind, match_ref: match.matchRef, match_note: match.matchNote, matched_by: uuidOrNull(matchedBy), matched_at: agora, updated_at: agora })
      .eq("client_ref", match.clientRef)
      .is("match_kind", null);
    if (!error) gravados += 1;
  }
  return gravados;
}
