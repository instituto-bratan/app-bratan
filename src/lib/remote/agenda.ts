// Agenda do dia (29/09/2026): leitura do espelho do iClinic, Veio/Faltou da
// recepção e os nomes das fichas do CRM para ligar paciente → ficha.
// Nunca pede telefone do espelho: a tela não usa e o dado não precisa viajar.
import type { ContatoParaCasar, LinhaDoEspelho, Presenca } from "@/features/agenda/agendaDoDia";
import { invocarIntegracao } from "./integracoes";
import { requireSupabase } from "./base";

const COLUNAS_BASE = "id, origem, origem_id, dia, inicio, fim, minutos, profissional, paciente, tipo, status, confirmacao_status, respondido_em, sincronizado_em";
// Colunas da migration 202609290001: enquanto ela não for aplicada, a leitura
// cai para as colunas de sempre em vez de derrubar a tela.
const COLUNAS_NOVAS = "cor, criado_em";

function colunaInexistente(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42703" || /column .* does not exist/i.test(error.message ?? "")));
}

export async function listAgendaDoPeriodo(de: string, ate: string): Promise<LinhaDoEspelho[]> {
  const client = requireSupabase();
  const consulta = (colunas: string) => client.from("agenda_espelho").select(colunas).gte("dia", de).lte("dia", ate).order("inicio").limit(3000);
  let { data, error } = await consulta(`${COLUNAS_BASE}, ${COLUNAS_NOVAS}`);
  if (colunaInexistente(error)) ({ data, error } = await consulta(COLUNAS_BASE));
  if (error) throw new Error(error.message);
  return (data ?? []) as LinhaDoEspelho[];
}

/** Uma linha por consulta futura/recente, só com o que diz se cada calendário está vivo. */
export async function listSaudeDaAgenda(desde: string): Promise<Pick<LinhaDoEspelho, "profissional" | "sincronizado_em" | "criado_em">[]> {
  const client = requireSupabase();
  const consulta = (colunas: string) => client.from("agenda_espelho").select(colunas).eq("origem", "iclinic").gte("dia", desde).limit(5000);
  let { data, error } = await consulta("profissional, sincronizado_em, criado_em");
  if (colunaInexistente(error)) ({ data, error } = await consulta("profissional, sincronizado_em"));
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<LinhaDoEspelho, "profissional" | "sincronizado_em" | "criado_em">[];
}

/** Última leitura do iClinic (qualquer calendário). */
export async function ultimaSincronizacaoDaAgenda(): Promise<string | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("agenda_espelho").select("sincronizado_em").eq("origem", "iclinic").order("sincronizado_em", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0]?.sincronizado_em as string | undefined) ?? null;
}

export async function listPresencasDoPeriodo(de: string, ate: string): Promise<{ linhas: Presenca[]; tabelaPronta: boolean }> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("agenda_presenca")
    .select("origem, origem_id, presenca, primeira_consulta, marcado_por_nome, marcado_em")
    .gte("dia", de)
    .lte("dia", ate)
    .limit(3000);
  // Antes da migration aplicada a tabela não existe: a tela mostra a agenda e avisa.
  if (error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? ""))) return { linhas: [], tabelaPronta: false };
  if (error) throw new Error(error.message);
  return { linhas: (data ?? []) as Presenca[], tabelaPronta: true };
}

export async function salvarPresenca(linha: {
  origem: string;
  origem_id: string;
  espelho_id: string;
  dia: string;
  inicio: string | null;
  profissional: string;
  paciente: string;
  presenca: "VEIO" | "FALTOU" | null;
  primeira_consulta: boolean | null;
}) {
  const client = requireSupabase();
  const { error } = await client.from("agenda_presenca").upsert(linha, { onConflict: "origem,origem_id" });
  if (error) throw new Error(error.message);
}

/** Nomes das fichas do CRM (só id e nome) para ligar a agenda à ficha. */
export async function listFichasParaAgenda(): Promise<ContatoParaCasar[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("crm_contacts").select("id, client_ref, full_name").is("archived_at", null).limit(5000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; client_ref: string | null; full_name: string | null }[])
    .filter((row) => (row.full_name ?? "").trim())
    .map((row) => ({ id: row.client_ref || row.id, nome: row.full_name ?? "" }));
}

/** "Buscar agora no iClinic": a mesma leitura do cron de hora em hora. */
export async function buscarAgendaAgora() {
  return invocarIntegracao<{ ok?: boolean; error?: string; gravados?: number; lidos?: Record<string, number>; erros?: string[] }>("google-agenda-sync", {});
}
