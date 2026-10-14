// Contrato de medicação gerado pelo app (14/10/2026): números, dados e o modelo
// .docx do bucket privado "modelos-contrato" (202610140001).
import type { DadosDoContrato } from "@/features/contratos/montarContrato";
import { requireSupabase } from "./base";

export type ContratoGerado = {
  id: string;
  ano: number;
  numero: number;
  dealRef: string | null;
  contactRef: string | null;
  pacienteNome: string;
  valorTotal: number;
  dados: DadosDoContrato;
  status: "GERADO" | "ENVIADO" | "ASSINADO" | "CANCELADO";
  geradoEm: string;
};

const COLUNAS = "id, ano, numero, deal_ref, contact_ref, paciente_nome, valor_total, dados, status, gerado_em";

function doBanco(row: any): ContratoGerado {
  return {
    id: row.id,
    ano: row.ano,
    numero: row.numero,
    dealRef: row.deal_ref ?? null,
    contactRef: row.contact_ref ?? null,
    pacienteNome: row.paciente_nome,
    valorTotal: Number(row.valor_total ?? 0),
    dados: row.dados as DadosDoContrato,
    status: row.status,
    geradoEm: row.gerado_em,
  };
}

export async function listRemoteContratos(limit = 200): Promise<ContratoGerado[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("contrato_gerado").select(COLUNAS).order("ano", { ascending: false }).order("numero", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(doBanco);
}

/** Grava o contrato. Número repetido no mesmo ano volta como erro claro. */
export async function salvarRemoteContrato(dados: DadosDoContrato, refs: { dealRef: string | null; contactRef: string | null }): Promise<ContratoGerado> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("contrato_gerado")
    .insert({ ano: dados.ano, numero: dados.numero, deal_ref: refs.dealRef, contact_ref: refs.contactRef, paciente_nome: dados.paciente.nome.trim().toUpperCase(), valor_total: dados.valorTotal, dados })
    .select(COLUNAS)
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(`O contrato nº ${dados.numero}/${dados.ano} já existe. Use o próximo número.`);
    throw new Error(error.message);
  }
  return doBanco(data);
}

export async function mudarStatusRemoteContrato(id: string, status: ContratoGerado["status"]) {
  const client = requireSupabase();
  const { error } = await client.from("contrato_gerado").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** O modelo .docx (só quem pode gerar contrato consegue baixar). */
export async function baixarRemoteModeloContrato(modelo = "medicacao"): Promise<ArrayBuffer> {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("modelos-contrato").download(`${modelo}.docx`);
  if (error || !data) throw new Error(`Não consegui baixar o modelo do contrato (${error?.message ?? "arquivo vazio"}).`);
  return data.arrayBuffer();
}
