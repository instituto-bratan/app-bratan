// FICHA DE APLICAÇÃO DA ENFERMAGEM (29/09/2026).
// Leitura direta da tabela (RLS can_aplicacao_read) e gravação SÓ pelas funções
// registrar_aplicacao / estornar_aplicacao, que lançam o movimento do estoque
// na mesma transação (202609290004_ficha_de_aplicacao.sql).
//
// Dado de saúde: nada de paciente, produto ou dose vai para console ou para a
// auditoria — o evento de auditoria leva só o identificador da aplicação.
import type { EnfermagemAplicacao, RascunhoAplicacao } from "@/features/estoque/aplicacaoData";
import { requireSupabase, safeWriteRemoteAuditEvent } from "./base";

const colunas =
  "client_ref, contact_ref, paciente_nome, item_ref, produto_nome, unidade, lote, validade, quantidade, frasco_aberto, dose, via, local_aplicacao, aplicado_em, aplicado_por_nome, observacao, insumo_item_ref, insumo_nome, insumo_quantidade, crm_task_ref, movimento_ref, insumo_movimento_ref, estoque_liberado, estoque_liberado_motivo, estoque_liberado_como, estornado_em, estorno_motivo, created_at";

function daLinha(row: Record<string, unknown>): EnfermagemAplicacao {
  return {
    id: String(row.client_ref),
    contactRef: String(row.contact_ref ?? ""),
    pacienteNome: String(row.paciente_nome ?? ""),
    itemRef: String(row.item_ref ?? ""),
    produtoNome: String(row.produto_nome ?? ""),
    unidade: String(row.unidade ?? "un"),
    lote: String(row.lote ?? ""),
    validade: String(row.validade ?? ""),
    quantidade: Number(row.quantidade ?? 0),
    frascoAberto: Boolean(row.frasco_aberto),
    dose: String(row.dose ?? ""),
    via: row.via as EnfermagemAplicacao["via"],
    localAplicacao: String(row.local_aplicacao ?? ""),
    aplicadoEm: String(row.aplicado_em ?? ""),
    aplicadoPorNome: String(row.aplicado_por_nome ?? ""),
    observacao: String(row.observacao ?? ""),
    insumoItemRef: (row.insumo_item_ref as string | null) ?? null,
    insumoNome: String(row.insumo_nome ?? ""),
    insumoQuantidade: Number(row.insumo_quantidade ?? 0),
    crmTaskRef: (row.crm_task_ref as string | null) ?? null,
    movimentoRef: (row.movimento_ref as string | null) ?? null,
    insumoMovimentoRef: (row.insumo_movimento_ref as string | null) ?? null,
    estoqueLiberado: Boolean(row.estoque_liberado),
    estoqueLiberadoMotivo: String(row.estoque_liberado_motivo ?? ""),
    estoqueLiberadoComo: (row.estoque_liberado_como as EnfermagemAplicacao["estoqueLiberadoComo"]) ?? null,
    estornadoEm: (row.estornado_em as string | null) ?? null,
    estornoMotivo: String(row.estorno_motivo ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

/** As aplicações a partir de um instante (a lista do dia pede a semana, para trocar de dia sem recarregar). */
export async function listRemoteAplicacoes(desdeISO: string): Promise<EnfermagemAplicacao[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("enfermagem_aplicacao")
    .select(colunas)
    .gte("aplicado_em", desdeISO)
    .order("aplicado_em", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(daLinha);
}

/** O histórico de um paciente (bloco na ficha do CRM). */
export async function listRemoteAplicacoesDoPaciente(contactRef: string): Promise<EnfermagemAplicacao[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("enfermagem_aplicacao")
    .select(colunas)
    .eq("contact_ref", contactRef)
    .order("aplicado_em", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(daLinha);
}

export type RespostaRegistro =
  | { ok: true; repetida?: boolean; liberado?: boolean }
  | { ok: false; problemas: string[]; senhaIncorreta?: boolean };

export async function registrarRemoteAplicacao(
  id: string,
  rascunho: RascunhoAplicacao,
  liberacao: { motivo: string; senhaGestor: string } | null,
): Promise<RespostaRegistro> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("registrar_aplicacao", {
    _client_ref: id,
    _contact_ref: rascunho.contactRef,
    _paciente_nome: rascunho.pacienteNome,
    _item_ref: rascunho.itemRef,
    _lote: rascunho.lote,
    _validade: rascunho.validade || null,
    _quantidade: rascunho.frascoAberto ? 0 : rascunho.quantidade,
    _frasco_aberto: rascunho.frascoAberto,
    _dose: rascunho.dose,
    _via: rascunho.via || null,
    _local: rascunho.localAplicacao,
    _aplicado_em: rascunho.aplicadoEm,
    _observacao: rascunho.observacao,
    _crm_task_ref: rascunho.crmTaskRef || null,
    _insumo_item_ref: rascunho.insumoItemRef || null,
    _insumo_quantidade: rascunho.insumoItemRef ? rascunho.insumoQuantidade : 0,
    _liberar_motivo: liberacao?.motivo ?? null,
    _senha_gestor: liberacao?.senhaGestor || null,
  });
  if (error) throw new Error(error.message || "O banco recusou a aplicação.");
  const resposta = (data ?? {}) as Record<string, unknown>;
  if (resposta.ok === true) {
    await safeWriteRemoteAuditEvent({ action: "enfermagem.aplicacao.registrar", entity: "enfermagem_aplicacao", entityId: id });
    return { ok: true, repetida: Boolean(resposta.repetida), liberado: Boolean(resposta.liberado) };
  }
  return {
    ok: false,
    problemas: Array.isArray(resposta.problemas) ? (resposta.problemas as unknown[]).map(String) : ["O estoque não bate com a aplicação."],
    senhaIncorreta: Boolean(resposta.senha_incorreta),
  };
}

export async function estornarRemoteAplicacao(id: string, motivo: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("estornar_aplicacao", { _client_ref: id, _motivo: motivo });
  if (error) throw new Error(error.message || "O banco recusou o estorno.");
  await safeWriteRemoteAuditEvent({ action: "enfermagem.aplicacao.estornar", entity: "enfermagem_aplicacao", entityId: id });
}
