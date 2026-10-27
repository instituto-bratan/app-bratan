// Central Bratan (28/10/2026): os números de todas as frentes, numa chamada só.
// Módulo próprio (e não remoteData.ts) para não brigar com as outras frentes.
// A função do banco confere quem chama (pode_central) e devolve só agregados,
// sem nome de paciente — supabase/migrations/202610280201_central_bratan.sql.
import { requireSupabase } from "./base";

/** O JSON cru de central_resumo(); quem monta a tela é montarCentral (features/central/central.ts). */
export async function carregarResumoDaCentral(): Promise<unknown> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("central_resumo");
  // O erro do supabase-js leva o código (PGRST202 = função ainda não aplicada;
  // 42501 = sem acesso), que a tela traduz em mensagemDoErroDaCentral.
  if (error) throw error;
  return data;
}
