// PROTOCOLO DO DOUTOR — leitura e escrita (28/10/2026). Tabela e regras em
// supabase/migrations/202610280101_protocolo.sql (RLS + gatilho da máquina de
// estados + protocolo_enviar). Módulo próprio de propósito: remoteData.ts é o
// arquivo que todo mundo mexe.
import type { EnvioDoProtocolo } from "@/doutor/protocoloDaV22";
import { protocoloDoBanco, type MudancaDoProtocolo, type Protocolo, type StatusDoProtocolo } from "@/features/fechamento/protocolo";
import { requireSupabase } from "./base";

// O payload (o plano inteiro da v22) não viaja na lista: só quem precisa conferir abre.
const COLUNAS =
  "id, client_ref, medico_id, medico_nome, enviado_por, paciente_nome, contact_ref, agenda_ref, itens, total, opcoes_pagamento, numero_bra, substitui_ref, status, deal_ref, sale_ref, forma_escolhida, valor_fechado, motivo_nao_fechou, motivo_detalhe, motivo_cancelamento, negociacao_em, fechado_em, fechado_por, criado_no_aparelho_em, criado_em, atualizado_em";

/** A migração ainda não foi aplicada: a tela avisa em vez de quebrar. */
export function tabelaDoProtocoloAusente(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "")));
}

export type ListaDeProtocolos = { lista: Protocolo[]; tabelaPronta: boolean };

/** Os que estão na mesa do vendedor (prescritos e em negociação), do mais novo para o mais antigo. */
export async function listarProtocolosAbertos(): Promise<ListaDeProtocolos> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("protocolo")
    .select(COLUNAS)
    .in("status", ["PRESCRITO", "EM_NEGOCIACAO"] satisfies StatusDoProtocolo[])
    .order("criado_em", { ascending: false })
    .limit(300);
  if (tabelaDoProtocoloAusente(error)) return { lista: [], tabelaPronta: false };
  if (error) throw new Error(error.message);
  return { lista: ((data ?? []) as Record<string, unknown>[]).map(protocoloDoBanco), tabelaPronta: true };
}

/** Os que mudaram desde uma data (fechados, não fechou, cancelados) — o "resolvidos" da lista. */
export async function listarProtocolosResolvidos(desdeISO: string): Promise<ListaDeProtocolos> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("protocolo")
    .select(COLUNAS)
    .in("status", ["FECHADO", "NAO_FECHOU", "CANCELADO"] satisfies StatusDoProtocolo[])
    .gte("atualizado_em", desdeISO)
    .order("atualizado_em", { ascending: false })
    .limit(200);
  if (tabelaDoProtocoloAusente(error)) return { lista: [], tabelaPronta: false };
  if (error) throw new Error(error.message);
  return { lista: ((data ?? []) as Record<string, unknown>[]).map(protocoloDoBanco), tabelaPronta: true };
}

export async function lerProtocolo(id: string): Promise<Protocolo | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("protocolo").select(COLUNAS).eq("id", id).maybeSingle();
  if (tabelaDoProtocoloAusente(error)) return null;
  if (error) throw new Error(error.message);
  return data ? protocoloDoBanco(data as Record<string, unknown>) : null;
}

/**
 * Os protocolos já ligados a um negócio do CRM (o cartão do Kanban mostra os
 * itens). Uma consulta só, pela data — sem lista de ids na URL. Sem permissão
 * (RLS), volta vazio e o cartão fica como sempre foi.
 */
export async function protocolosLigadosANegocios(desdeISO: string): Promise<Protocolo[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("protocolo")
    .select(COLUNAS)
    .not("deal_ref", "is", null)
    .neq("status", "CANCELADO")
    .gte("criado_em", desdeISO)
    .order("criado_em", { ascending: false })
    .limit(1000);
  if (tabelaDoProtocoloAusente(error)) return [];
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(protocoloDoBanco);
}

/**
 * Os protocolos de um período (o check-in semanal soma o prescrito). A janela
 * vem com folga de um dia de cada lado: quem decide a semana é a data do
 * aparelho do doutor, que pode ter subido depois (fila sem internet).
 */
export async function protocolosDoPeriodo(deISO: string, ateISO: string): Promise<ListaDeProtocolos> {
  const client = requireSupabase();
  const de = new Date(Date.parse(`${deISO}T00:00:00-03:00`) - 86_400_000).toISOString();
  const ate = new Date(Date.parse(`${ateISO}T23:59:59-03:00`) + 8 * 86_400_000).toISOString();
  const { data, error } = await client
    .from("protocolo")
    .select(COLUNAS)
    .neq("status", "CANCELADO")
    .gte("criado_em", de)
    .lte("criado_em", ate)
    .order("criado_em", { ascending: true })
    .limit(1000);
  if (tabelaDoProtocoloAusente(error)) return { lista: [], tabelaPronta: false };
  if (error) throw new Error(error.message);
  return { lista: ((data ?? []) as Record<string, unknown>[]).map(protocoloDoBanco), tabelaPronta: true };
}

/**
 * Muda a situação (abrir negociação, fechou, não fechou, cancelar). O gatilho do
 * banco confere a mesma régua de travaDaMudanca; sem permissão, a RLS não
 * devolve linha nenhuma, e isso vira uma frase clara.
 */
export async function mudarProtocolo(id: string, mudanca: MudancaDoProtocolo): Promise<Protocolo> {
  const client = requireSupabase();
  const corpo: Record<string, unknown> = { status: mudanca.status };
  if (mudanca.dealRef !== undefined) corpo.deal_ref = mudanca.dealRef;
  if (mudanca.contactRef !== undefined) corpo.contact_ref = mudanca.contactRef;
  if (mudanca.saleRef !== undefined) corpo.sale_ref = mudanca.saleRef;
  if (mudanca.formaEscolhida !== undefined) corpo.forma_escolhida = mudanca.formaEscolhida;
  if (mudanca.valorFechado !== undefined) corpo.valor_fechado = mudanca.valorFechado;
  if (mudanca.motivoNaoFechou !== undefined) corpo.motivo_nao_fechou = mudanca.motivoNaoFechou;
  if (mudanca.motivoDetalhe !== undefined) corpo.motivo_detalhe = mudanca.motivoDetalhe;
  if (mudanca.motivoCancelamento !== undefined) corpo.motivo_cancelamento = mudanca.motivoCancelamento;
  const { data, error } = await client.from("protocolo").update(corpo).eq("id", id).select(COLUNAS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("O protocolo não mudou: seu acesso não permite, ou ele foi mexido em outro aparelho. Recarregue a lista.");
  return protocoloDoBanco(data as Record<string, unknown>);
}

export type RespostaDoEnvio = { id: string; client_ref: string; status: StatusDoProtocolo; novo: boolean };

/**
 * App do Doutor: grava o protocolo (idempotente pelo client_ref). O erro volta
 * inteiro (code, message) para a fila decidir se espera ou se para.
 */
export async function enviarRemoteProtocolo(envio: EnvioDoProtocolo): Promise<RespostaDoEnvio> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("protocolo_enviar", { _p: envio });
  if (error) throw error;
  const r = (data ?? {}) as Partial<RespostaDoEnvio>;
  if (!r.id) throw Object.assign(new Error("O sistema não confirmou o protocolo. Vai tentar de novo."), { code: "" });
  return { id: String(r.id), client_ref: String(r.client_ref ?? envio.client_ref), status: (r.status ?? "PRESCRITO") as StatusDoProtocolo, novo: Boolean(r.novo) };
}
