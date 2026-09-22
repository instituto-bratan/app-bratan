// Notas emitidas contra o Instituto (22/09/2026) — leitura da tabela e os três
// botões, todos passando pela função focus-notas-recebidas (que é quem tem o
// token da Focus e a chave de serviço).
import { requireSupabase } from "./base";
import { invocarIntegracao } from "./integracoes";
import type { TipoDeNotaRecebida } from "../../../supabase/functions/_shared/notasRecebidas";

export type NotaRecebida = {
  chave: string;
  tipo: TipoDeNotaRecebida;
  emitenteDocumento: string;
  emitenteNome: string;
  valor: number;
  emitidaEm: string;
  situacao: string;
  manifestacao: string | null;
  status: "NOVA" | "VINCULADA" | "IGNORADA" | "CANCELADA";
  expenseRef: string | null;
  storagePathPdf: string | null;
  storagePathXml: string | null;
  vinculoMotivo: string;
  atualizadoEm: string;
};

export async function listRemoteNotasRecebidas(): Promise<NotaRecebida[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("nota_recebida")
    .select("chave, tipo, emitente_documento, emitente_nome, valor, emitida_em, situacao, manifestacao, status, expense_ref, storage_path_pdf, storage_path_xml, vinculo_motivo, atualizado_em")
    .order("emitida_em", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    chave: String(r.chave),
    tipo: r.tipo as TipoDeNotaRecebida,
    emitenteDocumento: String(r.emitente_documento ?? ""),
    emitenteNome: String(r.emitente_nome ?? ""),
    valor: Number(r.valor ?? 0),
    emitidaEm: String(r.emitida_em ?? ""),
    situacao: String(r.situacao ?? ""),
    manifestacao: (r.manifestacao as string | null) ?? null,
    status: r.status as NotaRecebida["status"],
    expenseRef: (r.expense_ref as string | null) ?? null,
    storagePathPdf: (r.storage_path_pdf as string | null) ?? null,
    storagePathXml: (r.storage_path_xml as string | null) ?? null,
    vinculoMotivo: String(r.vinculo_motivo ?? ""),
    atualizadoEm: String(r.atualizado_em ?? ""),
  }));
}

export type ResultadoDaBusca = { ok: boolean; error?: string; frase?: string; novas?: number; vinculadas?: number; pendentes?: number; erros?: string[] };

export function buscarNotasRecebidas() {
  return invocarIntegracao<ResultadoDaBusca>("focus-notas-recebidas", { acao: "sincronizar" });
}

export function vincularNotaRecebida(chave: string, expenseRef: string) {
  return invocarIntegracao("focus-notas-recebidas", { acao: "vincular", chave, expenseRef });
}

export function ignorarNotaRecebida(chave: string, reabrir = false) {
  return invocarIntegracao("focus-notas-recebidas", { acao: reabrir ? "reabrir" : "ignorar", chave });
}

/** Link de 10 minutos para o PDF/XML; o bucket é privado. */
export async function urlDaNotaRecebida(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("notas-fiscais-despesa").createSignedUrl(storagePath, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl as string;
}
