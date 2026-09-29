// BUSCA DE PACIENTE NO ⌘K (29/09/2026). O atalho achava telas e verbos, mas
// não achava gente — e quase toda pergunta do dia começa por um nome ("o que a
// Simone fechou?", "a Lais já pagou?"). Aqui só nome e o ref da ficha: o resto
// a ficha mostra, com as permissões dela. A RLS do CRM decide quem enxerga.
import { requireSupabase } from "./base";

export type PacienteAchado = { ref: string; nome: string };

/** Termo limpo para o ilike: sem % e _ (que viram curinga) e sem espaço duplo. */
export function termoDaBusca(texto: string) {
  return String(texto ?? "").replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
}

export async function buscarPacientes(texto: string): Promise<PacienteAchado[]> {
  const termo = termoDaBusca(texto);
  if (termo.length < 3) return [];
  const client = requireSupabase();
  const { data, error } = await client
    .from("crm_contacts")
    .select("client_ref, full_name, preferred_name")
    .is("archived_at", null)
    .or(`full_name.ilike.%${termo}%,preferred_name.ilike.%${termo}%`)
    .order("full_name")
    .limit(6);
  if (error) return [];
  return ((data ?? []) as { client_ref: string; full_name: string | null; preferred_name: string | null }[]).map((c) => ({ ref: c.client_ref, nome: (c.full_name || c.preferred_name || "").trim() }));
}
