import { listRemoteIaEventos, type IaEventoRecord } from "./ia";
// Cofre de compliance (6.1) e lista de espera (3.2).
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import { requireSupabase, uuidOrNull } from "./base";

// ---------------------------------------------------------------------------
// COFRE DE COMPLIANCE (15/09/2026, proposta 6.1) e LISTA DE ESPERA (3.2).
export type TipoConsentimento = "LGPD" | "IMAGEM" | "IA" | "TRATAMENTO" | "MARKETING";
export type Consentimento = { id: string; contactRef: string; tipo: TipoConsentimento; aceito: boolean; canal: string; versaoTexto: string; observacao: string; coletadoPor: string | null; coletadoEm: string; revogadoEm: string | null };

function rowConsentimento(row: any): Consentimento {
  return { id: row.id, contactRef: row.contact_ref, tipo: row.tipo, aceito: Boolean(row.aceito), canal: row.canal ?? "", versaoTexto: row.versao_texto ?? "", observacao: row.observacao ?? "", coletadoPor: row.coletado_por ?? null, coletadoEm: row.coletado_em, revogadoEm: row.revogado_em ?? null };
}

export async function listRemoteConsentimentos(contactRef?: string): Promise<Consentimento[]> {
  const client = requireSupabase();
  let query = client.from("consentimento").select("*").order("coletado_em", { ascending: false }).limit(contactRef ? 100 : 2000);
  if (contactRef) query = query.eq("contact_ref", contactRef);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowConsentimento);
}

export async function registrarRemoteConsentimento(entrada: { contactRef: string; tipo: TipoConsentimento; aceito: boolean; canal: string; observacao?: string; coletadoPor: string | null }) {
  const client = requireSupabase();
  const { error } = await client.from("consentimento").insert({ contact_ref: entrada.contactRef, tipo: entrada.tipo, aceito: entrada.aceito, canal: entrada.canal, observacao: entrada.observacao ?? "", coletado_por: uuidOrNull(entrada.coletadoPor) });
  if (error) throw new Error(error.message);
}

export type ComplianceRegistro = { id: string; tipo: "DPO" | "RIPD" | "POLITICA" | "INCIDENTE" | "TREINAMENTO"; titulo: string; detalhe: Record<string, unknown>; responsavel: string; substituto: string; status: string; vigenteDe: string | null; prazoEm: string | null; encerradoEm: string | null; criadoEm: string; atualizadoEm: string };

function rowCompliance(row: any): ComplianceRegistro {
  return { id: row.id, tipo: row.tipo, titulo: row.titulo, detalhe: (row.detalhe as Record<string, unknown>) ?? {}, responsavel: row.responsavel ?? "", substituto: row.substituto ?? "", status: row.status ?? "ABERTO", vigenteDe: row.vigente_de ?? null, prazoEm: row.prazo_em ?? null, encerradoEm: row.encerrado_em ?? null, criadoEm: row.criado_em, atualizadoEm: row.atualizado_em };
}

export async function listRemoteCompliance(): Promise<ComplianceRegistro[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("compliance_registro").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowCompliance);
}

export async function saveRemoteCompliance(registro: Partial<ComplianceRegistro> & { tipo: ComplianceRegistro["tipo"]; titulo: string }, criadoPor: string | null): Promise<string> {
  const client = requireSupabase();
  const payload = { tipo: registro.tipo, titulo: registro.titulo, detalhe: registro.detalhe ?? {}, responsavel: registro.responsavel ?? "", substituto: registro.substituto ?? "", status: registro.status ?? "ABERTO", vigente_de: registro.vigenteDe ?? null, prazo_em: registro.prazoEm ?? null, encerrado_em: registro.encerradoEm ?? null, atualizado_em: new Date().toISOString() };
  if (registro.id) {
    const { error } = await client.from("compliance_registro").update(payload).eq("id", registro.id);
    if (error) throw new Error(error.message);
    return registro.id;
  }
  const { data, error } = await client.from("compliance_registro").insert({ ...payload, criado_por: uuidOrNull(criadoPor) }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export type ListaEsperaItem = { id: string; contactRef: string | null; nome: string; telefone: string; preferencia: string; profissional: string; criadoEm: string; atendidoEm: string | null };

export async function listRemoteListaEspera(): Promise<ListaEsperaItem[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("lista_espera").select("*").is("atendido_em", null).order("criado_em");
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({ id: row.id, contactRef: row.contact_ref ?? null, nome: row.nome, telefone: row.telefone ?? "", preferencia: row.preferencia ?? "", profissional: row.profissional ?? "", criadoEm: row.criado_em, atendidoEm: row.atendido_em ?? null }));
}

export async function addRemoteListaEspera(item: { contactRef?: string | null; nome: string; telefone: string; preferencia: string; profissional: string }, criadoPor: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("lista_espera").insert({ contact_ref: item.contactRef ?? null, nome: item.nome, telefone: item.telefone, preferencia: item.preferencia, profissional: item.profissional, criado_por: uuidOrNull(criadoPor) });
  if (error) throw new Error(error.message);
}

export async function resolverRemoteListaEspera(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("lista_espera").update({ atendido_em: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Narrativa do mês / respostas do 360: o último ia_evento de uma função para uma referência. */
export async function ultimoRemoteIaEvento(funcao: string, entityRef: string): Promise<IaEventoRecord | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("ia_evento").select("id").eq("funcao", funcao).eq("entity_ref", entityRef).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const eventos = await listRemoteIaEventos().catch(() => [] as IaEventoRecord[]);
  return eventos.find((e) => e.id === (data as { id: string }).id) ?? null;
}

// ---------------------------------------------------------------------------
// CPF DO PACIENTE (17/09/2026). Mora em tabela separada de propósito: a ficha do
// contato é lida por quase todo mundo e pela função do portal, e o CPF não pode
// viajar junto por acidente. Quem enxerga e quem grava é decidido pelo acesso à
// tela de Impostos & NFs, que é onde a nota é emitida.
export type CpfDoContato = { contactRef: string; cpf: string; coletadoEm: string; atualizadoEm: string };

export async function lerRemoteCpfDoContato(contactRef: string): Promise<CpfDoContato | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("contato_documento").select("contact_ref, cpf, coletado_em, atualizado_em").eq("contact_ref", contactRef).maybeSingle();
  // Sem permissão, o Supabase devolve lista vazia em vez de erro — o app trata
  // como "não tenho", que é exatamente o comportamento certo para quem não pode ver.
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { contactRef: data.contact_ref as string, cpf: data.cpf as string, coletadoEm: data.coletado_em as string, atualizadoEm: data.atualizado_em as string };
}

export async function salvarRemoteCpfDoContato(contactRef: string, cpf: string, atualizadoPor: string | null) {
  const client = requireSupabase();
  const { error } = await client
    .from("contato_documento")
    .upsert({ contact_ref: contactRef, cpf, atualizado_por: uuidOrNull(atualizadoPor), atualizado_em: new Date().toISOString() }, { onConflict: "contact_ref" });
  if (error) throw new Error(error.message);
}

export async function apagarRemoteCpfDoContato(contactRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("contato_documento").delete().eq("contact_ref", contactRef);
  if (error) throw new Error(error.message);
}
