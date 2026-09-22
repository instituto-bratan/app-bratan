// O lote de notas a emitir (22/09/2026): leitura e atualização das linhas, e a
// prontidão da ficha (CPF e e-mail existem? — só o sim/não, nunca o número).
import { requireSupabase } from "./base";
import type { ItemDoLote, ParteDoLote, StatusDoLote, TipoDoLote } from "@/features/financeiro/loteDeNotas";

function daLinha(r: Record<string, unknown>): ItemDoLote {
  return {
    id: String(r.id),
    lote: String(r.lote),
    ordem: Number(r.ordem ?? 0),
    saleRef: String(r.sale_ref),
    contactRef: (r.contact_ref as string | null) ?? null,
    tomadorNome: String(r.tomador_nome ?? ""),
    tipo: r.tipo as TipoDoLote,
    valor: Number(r.valor ?? 0),
    dia: String(r.dia ?? "").slice(0, 10),
    pagamentoTexto: String(r.pagamento_texto ?? ""),
    partes: Array.isArray(r.partes) ? (r.partes as ParteDoLote[]) : [],
    observacao: String(r.observacao ?? ""),
    status: r.status as StatusDoLote,
    ref: (r.ref as string | null) ?? null,
    numero: (r.numero as string | null) ?? null,
    erro: (r.erro as string | null) ?? null,
    emitidaEm: (r.emitida_em as string | null) ?? null,
  };
}

export async function listRemoteNfseLote(): Promise<ItemDoLote[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("nfse_lote_item").select("*").order("lote", { ascending: false }).order("ordem", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(daLinha);
}

export async function atualizarRemoteNfseLoteItem(id: string, patch: Partial<Pick<ItemDoLote, "status" | "ref" | "numero" | "erro" | "emitidaEm">>) {
  const client = requireSupabase();
  const linha: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) linha.status = patch.status;
  if (patch.ref !== undefined) linha.ref = patch.ref;
  if (patch.numero !== undefined) linha.numero = patch.numero;
  if (patch.erro !== undefined) linha.erro = patch.erro;
  if (patch.emitidaEm !== undefined) linha.emitida_em = patch.emitidaEm;
  const { error } = await client.from("nfse_lote_item").update(linha).eq("id", id);
  if (error) throw new Error(error.message);
}

export type ProntidaoDoContato = { contactRef: string; temCpf: boolean; temEmail: boolean };

export async function prontidaoDoLote(contactRefs: string[]): Promise<ProntidaoDoContato[]> {
  const refs = [...new Set(contactRefs.filter(Boolean))];
  if (!refs.length) return [];
  const client = requireSupabase();
  const { data, error } = await client.rpc("nfse_lote_prontidao", { p_refs: refs });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ contactRef: String(r.contact_ref), temCpf: Boolean(r.tem_cpf), temEmail: Boolean(r.tem_email) }));
}
