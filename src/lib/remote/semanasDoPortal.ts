// SEMANA X DE N (27/10/2026), lado da equipe: o texto de cada semana do portal
// (coordenação e enfermagem editam; a RLS confere) e as respostas do check-in
// de um paciente (a equipe clínica lê; ninguém da equipe grava resposta).
import { requireSupabase, safeWriteRemoteAuditEvent } from "./base";
import type { ConteudoDaSemana } from "../../../supabase/functions/_shared/semanaDoPaciente";

export type ConteudoDaSemanaRegistro = ConteudoDaSemana & { atualizadoEm: string | null };

export async function listRemoteSemanasDoPortal(): Promise<ConteudoDaSemanaRegistro[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("portal_semana_conteudo").select("semana, titulo, costuma_acontecer, missao, ativo, atualizado_em").order("semana");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    semana: Number(r.semana),
    titulo: String(r.titulo ?? ""),
    costumaAcontecer: String(r.costuma_acontecer ?? ""),
    missao: String(r.missao ?? ""),
    ativo: Boolean(r.ativo),
    atualizadoEm: (r.atualizado_em as string | null) ?? null,
  }));
}

/** Cria ou troca o texto de uma semana. Quem mexeu e quando, o banco carimba. */
export async function salvarRemoteSemanaDoPortal(conteudo: ConteudoDaSemana) {
  const client = requireSupabase();
  const { error } = await client.from("portal_semana_conteudo").upsert(
    { semana: conteudo.semana, titulo: conteudo.titulo.trim(), costuma_acontecer: conteudo.costumaAcontecer.trim(), missao: conteudo.missao.trim(), ativo: conteudo.ativo },
    { onConflict: "semana" },
  );
  if (error) throw new Error(error.message);
  await safeWriteRemoteAuditEvent({ action: "portal.semana.salvar", entity: "portal_semana_conteudo", entityId: String(conteudo.semana), metadata: { ativo: conteudo.ativo } });
}

export type CheckinDoPacienteRegistro = { semana: number; fome: number | null; energia: number | null; enjoo: number | null; vermelho: boolean; tarefaRef: string | null; atualizadoEm: string };

/** As últimas semanas respondidas por um paciente (mais nova primeiro). */
export async function listRemoteCheckinsDoPaciente(contactRef: string): Promise<CheckinDoPacienteRegistro[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("paciente_checkin").select("semana, fome, energia, enjoo, vermelho, tarefa_ref, atualizado_em").eq("contact_ref", contactRef).order("semana", { ascending: false }).limit(8);
  if (error) throw new Error(error.message);
  const nivel = (valor: unknown) => (valor === null || valor === undefined ? null : Number(valor));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    semana: Number(r.semana),
    fome: nivel(r.fome),
    energia: nivel(r.energia),
    enjoo: nivel(r.enjoo),
    vermelho: Boolean(r.vermelho),
    tarefaRef: (r.tarefa_ref as string | null) ?? null,
    atualizadoEm: String(r.atualizado_em ?? ""),
  }));
}
