// Dinheiro da comanda no crediário (29/09/2026). Funções em 202609290011_dinheiro_da_comanda.sql.
import type { DinheiroNoCrediario } from "@/features/financeiro/dinheiroDaComanda";
import { requireSupabase } from "./base";

export async function gravarRemoteDinheiroDaComanda(entrada: DinheiroNoCrediario) {
  const client = requireSupabase();
  const { error } = await client.rpc("fin_crediario_entrada_da_comanda", {
    p_client_ref: entrada.id,
    p_dia: entrada.dia,
    p_valor: entrada.valor,
    p_descricao: entrada.descricao,
    p_contact_ref: entrada.contactRef ?? "",
    p_sale_ref: entrada.saleRef ?? "",
  });
  if (error) throw error;
}

export async function listRemoteDinheiroDaComandaDoDia(dia: string): Promise<DinheiroNoCrediario[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("fin_crediario_da_comanda", { p_dia: dia });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    dia: String(row.entry_date),
    valor: Number(row.amount ?? 0),
    descricao: String(row.description ?? ""),
    contactRef: (row.crm_contact_ref as string | null) ?? null,
    saleRef: (row.sale_ref as string | null) ?? null,
  }));
}
