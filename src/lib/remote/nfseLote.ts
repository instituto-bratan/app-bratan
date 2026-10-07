// O lote de notas a emitir (22/09/2026): leitura e atualização das linhas, e a
// prontidão da ficha (CPF e e-mail existem? — só o sim/não, nunca o número).
import { requireSupabase } from "./base";
import type { ItemDoLote, NovoItemDoLote, ParteDoLote, StatusDoLote, TipoDoLote } from "@/features/financeiro/loteDeNotas";
import type { EmissaoComPartes } from "@/features/financeiro/juntarNotas";

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

/**
 * 07/10/2026 (junção de comandas): além do status, a linha do titular recebe
 * as partes de todos, o valor somado e o tomador; as outras ganham a
 * observação "Juntado na nota de …".
 */
export type PatchDoItemDoLote = Partial<
  Pick<ItemDoLote, "status" | "ref" | "numero" | "erro" | "emitidaEm" | "tipo" | "valor" | "partes" | "tomadorNome" | "contactRef" | "observacao" | "pagamentoTexto" | "dia">
>;

export async function atualizarRemoteNfseLoteItem(id: string, patch: PatchDoItemDoLote) {
  const client = requireSupabase();
  const linha: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) linha.status = patch.status;
  if (patch.ref !== undefined) linha.ref = patch.ref;
  if (patch.numero !== undefined) linha.numero = patch.numero;
  if (patch.erro !== undefined) linha.erro = patch.erro;
  if (patch.emitidaEm !== undefined) linha.emitida_em = patch.emitidaEm;
  if (patch.tipo !== undefined) linha.tipo = patch.tipo;
  if (patch.valor !== undefined) linha.valor = patch.valor;
  if (patch.partes !== undefined) linha.partes = patch.partes;
  if (patch.tomadorNome !== undefined) linha.tomador_nome = patch.tomadorNome;
  if (patch.contactRef !== undefined) linha.contact_ref = patch.contactRef;
  if (patch.observacao !== undefined) linha.observacao = patch.observacao;
  if (patch.pagamentoTexto !== undefined) linha.pagamento_texto = patch.pagamentoTexto;
  if (patch.dia !== undefined) linha.dia = patch.dia;
  const { error } = await client.from("nfse_lote_item").update(linha).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Item novo no lote (07/10/2026): quem não emite deixa a nota juntada pronta
 * para quem emite. A RLS só aceita PENDENTE, do financeiro completo ou de quem
 * emite. A ordem é a próxima do lote.
 */
export async function criarRemoteNfseLoteItem(item: NovoItemDoLote): Promise<ItemDoLote> {
  const client = requireSupabase();
  const { data: ultima } = await client.from("nfse_lote_item").select("ordem").eq("lote", item.lote).order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await client
    .from("nfse_lote_item")
    .insert({
      lote: item.lote,
      ordem: Number(ultima?.ordem ?? 0) + 1,
      sale_ref: item.saleRef,
      contact_ref: item.contactRef,
      tomador_nome: item.tomadorNome,
      tipo: item.tipo,
      valor: item.valor,
      dia: item.dia,
      pagamento_texto: item.pagamentoTexto,
      partes: item.partes,
      observacao: item.observacao,
      status: "PENDENTE",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return daLinha(data as Record<string, unknown>);
}

/**
 * As notas pedidas à Focus que cobrem mais de uma comanda (07/10/2026): a
 * juntada e a que levou sinal. A fila de comandas usa para não oferecer juntar
 * — nem emitir de novo — a comanda que já está dentro de uma delas. A RLS só
 * abre para o financeiro completo e para quem emite; para o resto, lista vazia.
 */
export async function listRemoteNotasComPartes(): Promise<EmissaoComPartes[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("nfse_emissao")
    .select("ref, sale_ref, status, numero, valor, partes, criado_em")
    .not("partes", "is", null)
    .order("criado_em", { ascending: false })
    .limit(300);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ref: String(r.ref),
    saleRef: String(r.sale_ref ?? ""),
    status: String(r.status ?? ""),
    numero: (r.numero as string | null) ?? null,
    valor: Number(r.valor ?? 0),
    partes: Array.isArray(r.partes) ? (r.partes as EmissaoComPartes["partes"]) : null,
  }));
}

export type ProntidaoDoContato = { contactRef: string; temCpf: boolean; temEmail: boolean };

export async function prontidaoDoLote(contactRefs: string[]): Promise<ProntidaoDoContato[]> {
  const refs = [...new Set(contactRefs.filter(Boolean))];
  if (!refs.length) return [];
  const client = requireSupabase();
  const { data, error } = await client.rpc("nfse_lote_prontidao", { p_refs: refs });
  if (error) throw new Error(error.message);
  const vindas = ((data ?? []) as Record<string, unknown>[]).map((r) => ({ contactRef: String(r.contact_ref), temCpf: Boolean(r.tem_cpf), temEmail: Boolean(r.tem_email) }));
  // 07/10/2026: a função do banco só responde ao financeiro completo. Para quem
  // EMITE (o Estevão, cargo gestor) ela voltava vazia e o lote dizia "sem CPF"
  // de todo mundo. O que faltou vai pela leitura direta que a RLS já abre à
  // coordenação: só a CHAVE da ficha em contato_documento (nunca o número) e
  // o e-mail do contato.
  const faltam = refs.filter((ref) => !vindas.some((v) => v.contactRef === ref));
  if (!faltam.length) return vindas;
  const [documentos, contatos] = await Promise.all([
    client.from("contato_documento").select("contact_ref").in("contact_ref", faltam),
    client.from("crm_contacts").select("client_ref, email").in("client_ref", faltam),
  ]);
  const comCpf = new Set(((documentos.data ?? []) as { contact_ref: string }[]).map((d) => d.contact_ref));
  const emailValido = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
  const comEmail = new Set(((contatos.data ?? []) as { client_ref: string; email: string | null }[]).filter((c) => emailValido.test(String(c.email ?? ""))).map((c) => c.client_ref));
  return [...vindas, ...faltam.map((ref) => ({ contactRef: ref, temCpf: comCpf.has(ref), temEmail: comEmail.has(ref) }))];
}
