// Meses fechados (29/09/2026). Tabela e função em 202609290010_mes_fechado.sql.
import type { MesFechado } from "@/features/financeiro/mesFechado";
import { requireSupabase } from "./base";

export async function listRemoteMesesFechados(): Promise<MesFechado[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("fin_mes_fechado").select("mes, fechado_em, observacao").order("mes", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({ mes: String(row.mes), fechadoEm: String(row.fechado_em ?? ""), observacao: String(row.observacao ?? "") }));
}

export async function fecharRemoteMes(mes: string, fechar: boolean, observacao?: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("fin_fechar_mes", { p_mes: mes, p_fechar: fechar, p_observacao: observacao ?? null });
  if (error) throw error;
}
