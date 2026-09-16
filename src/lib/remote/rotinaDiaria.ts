// Achados da rotina das 6h (proposta 1.2).
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import { detalheDoErroDaFuncao, requireSupabase, uuidOrNull } from "./base";

// ---------------------------------------------------------------------------
// ACHADOS DA ROTINA DIÁRIA (14/09/2026, proposta 1.2)
// ---------------------------------------------------------------------------
export type AchadoDiario = {
  id: string;
  chave: string;
  tipo: string;
  dia: string;
  titulo: string;
  detalhe: string;
  valor: number | null;
  href: string;
  urgencia: 0 | 1 | 2 | 3;
  cargos: string[];
  quantidade: number;
  resolvidoEm: string | null;
  atualizadoEm: string;
};

export async function listRemoteAchados(): Promise<AchadoDiario[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("achado_diario")
    .select("id, chave, tipo, dia, titulo, detalhe, valor, href, urgencia, cargos, quantidade, resolvido_em, atualizado_em")
    .is("resolvido_em", null)
    .order("urgencia", { ascending: true })
    .order("dia", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    chave: String(row.chave),
    tipo: String(row.tipo),
    dia: String(row.dia ?? "").slice(0, 10),
    titulo: String(row.titulo ?? ""),
    detalhe: String(row.detalhe ?? ""),
    valor: row.valor === null || row.valor === undefined ? null : Number(row.valor),
    href: String(row.href ?? "/"),
    urgencia: (Number(row.urgencia ?? 2) as 0 | 1 | 2 | 3),
    cargos: (row.cargos as string[]) ?? [],
    quantidade: Number(row.quantidade ?? 1),
    resolvidoEm: (row.resolvido_em as string | null) ?? null,
    atualizadoEm: String(row.atualizado_em ?? ""),
  }));
}

export async function resolverRemoteAchado(id: string, pessoaId: string | null) {
  const client = requireSupabase();
  const { error } = await client
    .from("achado_diario")
    .update({ resolvido_em: new Date().toISOString(), resolvido_por: uuidOrNull(pessoaId), atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Dispara a rotina diária agora (o cron roda às 6h; este é o botão "atualizar achados"). */
export async function dispararRotinaDiaria(): Promise<{ ok: boolean; resumo?: Record<string, number>; error?: string }> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("rotina-diaria", { body: {} });
  if (error) return { ok: false, error: await detalheDoErroDaFuncao(error) };
  const body = (data ?? {}) as { ok?: boolean; resumo?: Record<string, number>; error?: string };
  return { ok: Boolean(body.ok), resumo: body.resumo, error: body.error };
}
