// ABA PACIENTES (05/10/2026): a lista de contatos enxuta (sem notas, sem dono,
// sem dado clínico) e, para quem pode ver o CPF, só QUAIS contatos têm CPF
// guardado — nunca o número. O número continua saindo só pela ficha
// (lerRemoteCpfDoContato), um por vez, mascarado.
import { requireSupabase } from "./base";
import type { PacienteDaLista } from "@/features/pacientes/pacientesData";

export async function listRemotePacientes(): Promise<Omit<PacienteDaLista, "temCpf">[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("crm_contacts")
    .select("id, client_ref, full_name, preferred_name, phone, whatsapp, email, contact_type, created_at")
    .is("archived_at", null)
    .limit(5000);
  if (error) throw new Error(error.message);
  type Linha = { id: string; client_ref: string | null; full_name: string | null; preferred_name: string | null; phone: string | null; whatsapp: string | null; email: string | null; contact_type: string | null; created_at: string | null };
  return ((data ?? []) as Linha[])
    .filter((row) => (row.full_name ?? "").trim())
    .map((row) => ({
      id: row.client_ref || row.id,
      nome: row.full_name ?? "",
      apelido: row.preferred_name ?? "",
      telefone: row.phone ?? "",
      whatsapp: row.whatsapp ?? "",
      email: row.email ?? "",
      tipo: row.contact_type ?? "",
      criadoEm: row.created_at ?? "",
    }));
}

/** Os contatos que já têm CPF na ficha. Sem permissão a RLS devolve lista vazia, e a tela não promete nada. */
export async function listRemoteContatosComCpf(): Promise<Set<string>> {
  const client = requireSupabase();
  const { data, error } = await client.from("contato_documento").select("contact_ref").limit(10000);
  if (error) return new Set();
  return new Set(((data ?? []) as { contact_ref: string }[]).map((row) => row.contact_ref));
}
