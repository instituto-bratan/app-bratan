// Notas emitidas contra o Instituto (22/09/2026) — leitura da tabela e os
// botões, todos passando pela função focus-notas-recebidas (que é quem tem o
// token da Focus e a chave de serviço).
import { requireSupabase } from "./base";
import { invocarIntegracao } from "./integracoes";
import type { NfseSpImportada, TipoDeNotaRecebida } from "../../../supabase/functions/_shared/notasRecebidas";

export type NotaRecebida = {
  chave: string;
  tipo: TipoDeNotaRecebida;
  numero: string | null;
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
  /** NFS-e de São Paulo: o link da nota no portal da prefeitura (não há arquivo no bucket). */
  urlExterna: string | null;
  /** A Focus já tem o XML completo desta NF-e? Antes disso não há PDF. */
  xmlCompleto: boolean;
  sharepointEnviadoEm: string | null;
  vinculoMotivo: string;
  atualizadoEm: string;
};

export async function listRemoteNotasRecebidas(): Promise<NotaRecebida[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("nota_recebida")
    .select("chave, tipo, numero, emitente_documento, emitente_nome, valor, emitida_em, situacao, manifestacao, status, expense_ref, storage_path_pdf, storage_path_xml, url_externa, sharepoint_enviado_em, vinculo_motivo, atualizado_em, resumo")
    .order("emitida_em", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    chave: String(r.chave),
    tipo: r.tipo as TipoDeNotaRecebida,
    numero: (r.numero as string | null) ?? null,
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
    urlExterna: (r.url_externa as string | null) ?? null,
    xmlCompleto: String((r.resumo as Record<string, unknown> | null)?.nfe_completa ?? "") === "true",
    sharepointEnviadoEm: (r.sharepoint_enviado_em as string | null) ?? null,
    vinculoMotivo: String(r.vinculo_motivo ?? ""),
    atualizadoEm: String(r.atualizado_em ?? ""),
  }));
}

export type ResultadoDaBusca = { ok: boolean; error?: string; frase?: string; pulou?: boolean; novas?: number; vinculadas?: number; pendentes?: number; arquivos?: number; ciencias?: number; aguardandoSefaz?: number; erros?: string[] };

export function buscarNotasRecebidas() {
  return invocarIntegracao<ResultadoDaBusca>("focus-notas-recebidas", { acao: "sincronizar" });
}

export function vincularNotaRecebida(chave: string, expenseRef: string) {
  return invocarIntegracao("focus-notas-recebidas", { acao: "vincular", chave, expenseRef });
}

export function ignorarNotaRecebida(chave: string, reabrir = false) {
  return invocarIntegracao("focus-notas-recebidas", { acao: reabrir ? "reabrir" : "ignorar", chave });
}

/** As NFS-e tomadas em São Paulo, lidas do CSV que o portal da prefeitura exporta. */
export function importarNfseSP(notas: NfseSpImportada[]) {
  return invocarIntegracao<{ ok: boolean; error?: string; frase?: string; novas?: number; jaExistiam?: number; vinculadas?: number }>("focus-notas-recebidas", { acao: "importar_nfse_sp", notas });
}

/** Link de 10 minutos para o PDF/XML; o bucket é privado. */
export async function urlDaNotaRecebida(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("notas-fiscais-despesa").createSignedUrl(storagePath, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl as string;
}

/** Os bytes de um arquivo do bucket — para o ZIP do mês. */
export async function bytesDaNotaRecebida(storagePath: string): Promise<Uint8Array> {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("notas-fiscais-despesa").download(storagePath);
  if (error || !data) throw new Error(error?.message ?? "arquivo não encontrado");
  return new Uint8Array(await data.arrayBuffer());
}
