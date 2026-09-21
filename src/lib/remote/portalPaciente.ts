// Portal do paciente, lado da equipe: acesso, consultas e medições.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import { requireSupabase, uuidOrNull } from "./base";

// ---------------------------------------------------------------------------
// PORTAL DO PACIENTE (15/09/2026): o lado da equipe — link de acesso, próxima
// consulta digitada e medições da bioimpedância. O paciente lê pela função.
export type PacienteAcesso = { id: string; contactRef: string; expiraEm: string; usadoEm: string | null; ultimoAcessoEm: string | null; aparelho: string | null; criadoEm: string; revogadoEm: string | null };

export async function listRemotePacienteAcessos(contactRef: string): Promise<PacienteAcesso[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("paciente_acesso").select("id, contact_ref, expira_em, usado_em, ultimo_acesso_em, aparelho, criado_em, revogado_em").eq("contact_ref", contactRef).order("criado_em", { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, contactRef: r.contact_ref, expiraEm: r.expira_em, usadoEm: r.usado_em ?? null, ultimoAcessoEm: r.ultimo_acesso_em ?? null, aparelho: r.aparelho ?? null, criadoEm: r.criado_em, revogadoEm: r.revogado_em ?? null }));
}

export async function criarRemotePacienteAcesso(contactRef: string, tokenHash: string, diasValidade: number, criadoPor: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("paciente_acesso").insert({ contact_ref: contactRef, token_hash: tokenHash, expira_em: new Date(Date.now() + diasValidade * 86_400_000).toISOString(), criado_por: uuidOrNull(criadoPor) });
  if (error) throw new Error(error.message);
}

export async function revogarRemotePacienteAcesso(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("paciente_acesso").update({ revogado_em: new Date().toISOString(), sessao_hash: null, sessao_expira_em: null }).eq("id", id);
  if (error) throw new Error(error.message);
}

export type PacienteConsultaRecord = { id: string; contactRef: string; em: string; profissional: string; tipo: string; local: string; status: string; respondidoEm: string | null; criadoEm: string };

export async function listRemotePacienteConsultas(contactRef: string): Promise<PacienteConsultaRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("paciente_consulta").select("*").eq("contact_ref", contactRef).order("em", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, contactRef: r.contact_ref, em: r.em, profissional: r.profissional, tipo: r.tipo, local: r.local, status: r.status, respondidoEm: r.respondido_em ?? null, criadoEm: r.criado_em }));
}

export async function createRemotePacienteConsulta(entrada: { contactRef: string; em: string; profissional: string; tipo: string; local: string }, criadoPor: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("paciente_consulta").insert({ contact_ref: entrada.contactRef, em: entrada.em, profissional: entrada.profissional, tipo: entrada.tipo, local: entrada.local, criado_por: uuidOrNull(criadoPor) });
  if (error) throw new Error(error.message);
}

export async function updateRemotePacienteConsultaStatus(id: string, status: "AGENDADA" | "CONFIRMADA" | "REMARCAR" | "REALIZADA" | "CANCELADA") {
  const client = requireSupabase();
  const { error } = await client.from("paciente_consulta").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export type PacienteMedicaoRecord = { id: string; contactRef: string; dia: string; pesoKg: number | null; gorduraPct: number | null; massaMagraKg: number | null; cinturaCm: number | null; origem: "ENFERMAGEM" | "PACIENTE" | "IMPORTACAO"; observacao: string; criadoEm: string };

export async function listRemotePacienteMedicoes(contactRef: string): Promise<PacienteMedicaoRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("paciente_medicao").select("*").eq("contact_ref", contactRef).is("deleted_at", null).order("dia", { ascending: false });
  if (error) throw new Error(error.message);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, contactRef: r.contact_ref, dia: r.dia, pesoKg: n(r.peso_kg), gorduraPct: n(r.gordura_pct), massaMagraKg: n(r.massa_magra_kg), cinturaCm: n(r.cintura_cm), origem: r.origem, observacao: r.observacao ?? "", criadoEm: r.criado_em }));
}

/** Todas as pesagens desde uma data, de todos os pacientes — alimenta o semáforo de
 *  adesão e a tela de pesagens da semana da enfermagem (16/09/2026). */
export async function listRemotePacienteMedicoesDesde(desdeISO: string): Promise<PacienteMedicaoRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("paciente_medicao").select("*").gte("dia", desdeISO).is("deleted_at", null).order("dia", { ascending: false });
  if (error) throw new Error(error.message);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, contactRef: r.contact_ref, dia: r.dia, pesoKg: n(r.peso_kg), gorduraPct: n(r.gordura_pct), massaMagraKg: n(r.massa_magra_kg), cinturaCm: n(r.cintura_cm), origem: r.origem, observacao: r.observacao ?? "", criadoEm: r.criado_em }));
}

export async function createRemotePacienteMedicao(entrada: { contactRef: string; dia: string; pesoKg: number | null; gorduraPct: number | null; massaMagraKg: number | null; cinturaCm: number | null; observacao: string }, registradoPor: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("paciente_medicao").insert({ contact_ref: entrada.contactRef, dia: entrada.dia, peso_kg: entrada.pesoKg, gordura_pct: entrada.gorduraPct, massa_magra_kg: entrada.massaMagraKg, cintura_cm: entrada.cinturaCm, origem: "ENFERMAGEM", observacao: entrada.observacao, registrado_por: uuidOrNull(registradoPor) });
  if (error) throw new Error(error.message);
}

/**
 * Grava de uma vez as medições lidas do arquivo da InBody (16/09/2026).
 * A origem fica IMPORTACAO para separar do que a enfermagem digitou e do que o
 * paciente mandou pelo portal. Quem chama já tirou as repetidas.
 */
export async function createRemotePacienteMedicoesEmLote(
  entradas: {
    contactRef: string;
    dia: string;
    pesoKg: number | null;
    gorduraPct: number | null;
    massaMagraKg: number | null;
    cinturaCm: number | null;
    inbodyScore?: number | null;
    gorduraVisceral?: number | null;
    massaMuscularKg?: number | null;
    tmbKcal?: number | null;
    observacao: string;
  }[],
  registradoPor: string | null,
) {
  if (!entradas.length) return 0;
  const client = requireSupabase();
  const { error } = await client.from("paciente_medicao").insert(
    entradas.map((entrada) => ({
      contact_ref: entrada.contactRef,
      dia: entrada.dia,
      peso_kg: entrada.pesoKg,
      gordura_pct: entrada.gorduraPct,
      massa_magra_kg: entrada.massaMagraKg,
      cintura_cm: entrada.cinturaCm,
      inbody_score: entrada.inbodyScore ?? null,
      gordura_visceral: entrada.gorduraVisceral ?? null,
      massa_muscular_kg: entrada.massaMuscularKg ?? null,
      tmb_kcal: entrada.tmbKcal ?? null,
      origem: "IMPORTACAO",
      observacao: entrada.observacao,
      registrado_por: uuidOrNull(registradoPor),
    })),
  );
  if (error) throw new Error(error.message);
  return entradas.length;
}

export async function deleteRemotePacienteMedicao(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("paciente_medicao").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export type PacientePortalEvento = { id: string; acao: string; detalhe: Record<string, unknown> | null; criadoEm: string };

export async function listRemotePacientePortalEventos(contactRef: string): Promise<PacientePortalEvento[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("paciente_portal_evento").select("id, acao, detalhe, criado_em").eq("contact_ref", contactRef).order("criado_em", { ascending: false }).limit(15);
  if (error) return [];
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, acao: r.acao, detalhe: (r.detalhe as Record<string, unknown>) ?? null, criadoEm: r.criado_em }));
}
