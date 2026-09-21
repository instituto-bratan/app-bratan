import { supabase } from "@/lib/supabase";
import { publicUrlSafeName, requireSupabase as requireSupabaseBase, safeWriteRemoteAuditEvent as safeAudit, uuidOrNull as uuidOrNulo } from "./remote/base";
import { todayISO } from "@/lib/localStore";
import { prepareSharePointDispatch, sharePointTargetFolder, type SharePointDispatchStatus, type SharePointModule } from "@/lib/sharepoint";
import type { ChecklistItem } from "@/features/checklist/checklistData";
import type { Aviso } from "@/features/mural/muralData";
import type { ComprovanteRecord } from "@/features/comprovantes/comprovantesData";
import type { EstoqueItem, EstoqueMovimento } from "@/features/estoque/estoqueData";
import type { NpsContato, NpsMes } from "@/features/concierge/npsData";
import {
  checkinCodePreview,
  defaultEstalecaConfig,
  type EstalecaClaim,
  type CheckinEventCode,
  type EstalecaCheckin,
  type EstalecaConfig,
  type EstalecaReward,
  type EstalecaTransaction,
  type GamificationProfile,
} from "@/features/estalecas/estalecasData";
import type { AuditEventRecord } from "@/features/admin/auditoriaData";
import type {
  FinCategory,
  FinCrediarioProfit,
  FinExpense,
  FinInvoice,
  FinPartnerEntry,
  FinProvisionRule,
  FinPurchase,
  FinReconciliation,
  FinSale,
  FinSavingsMove,
} from "@/features/financeiro/financeiroData";
import type { PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import {
  deriveInteligencia360FromCrm,
  diffCrmStates,
  seedCrmState,
  type CrmCadence,
  type CrmCadenceEnrollment,
  type CrmCadenceStep,
  type CrmContact,
  type CrmDeal,
  type CrmMessageTemplate,
  type CrmState,
  type CrmTask,
  type CrmTimelineEvent,
  type CrmTouchpoint,
} from "@/features/crm/crmData";
import {
  defaultSettings360,
  type ActionItem360,
  type ChurnInvestigation,
  type Inteligencia360State,
  type ObjectionPlaybookItem,
  type OperationalSettings360,
  type PatientExperience,
  type PatientJourney,
  type PrescriptionSale,
  type PricingTableItem,
  type Receivable,
  type RelationshipTouchpoint,
  type RescueWorkflow,
  type RetentionCohort,
  type WeeklyAverageTicket,
} from "@/features/inteligencia360/inteligencia360Data";
import type {
  Cargo,
  CheckinStatus,
  CheckinType,
  CheckinValidationMethod,
  Colaborador,
  ComprovanteTipo,
  EstalecaTransactionSource,
  EstalecaTransactionStatus,
  EstalecaTransactionType,
  FormaPagamento,
  PagamentoLembreteStatus,
  PrioridadeAviso,
  RewardStatus,
  RewardType,
} from "@/types/database";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase ainda não está configurado.");
  }

  // The project keeps a focused hand-written Database type until Supabase can generate the full schema types.
  return supabase as any;
}


type AuditEvent = {
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

async function safeWriteRemoteAuditEvent(values: AuditEvent) {
  try {
    const client = requireSupabase();
    const { error } = await client.rpc("write_audit_event", {
      _action: values.action,
      _entity: values.entity,
      _entity_id: values.entityId ?? null,
      _metadata: values.metadata ?? {},
    });

    if (error) {
      console.warn("Audit event was not persisted.", error);
    }
  } catch (error) {
    console.warn("Audit event was not persisted.", error);
  }
}

export async function listRemoteColaboradores(): Promise<Colaborador[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("colaborador_app")
    .select("*")
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Colaborador[];
}

// Acessos por pessoa (tela "Acessos" — só Lucas/Dr. Daniel/CEO; RLS confere).
export async function saveRemoteColaboradorAcessos(
  colaboradorId: string,
  acessos: Record<string, string>,
  updatedBy: string | null,
) {
  const client = requireSupabase();
  const { error } = await client.from("colaborador_acesso").upsert(
    {
      colaborador_id: colaboradorId,
      acessos,
      updated_at: new Date().toISOString(),
      updated_by: uuidOrNull(updatedBy),
    },
    { onConflict: "colaborador_id" },
  );
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "admin.acessos.salvar",
    entity: "colaborador_acesso",
    entityId: colaboradorId,
    metadata: { acessos },
  });
}

export async function saveRemoteColaborador(values: {
  id: string | null;
  nome: string;
  email: string;
  cargo: Cargo;
}) {
  const client = requireSupabase();

  if (values.id) {
    const { error: colaboradorError } = await client
      .from("colaborador")
      .update({
        nome: values.nome,
        email: values.email,
      })
      .eq("id", values.id);

    if (colaboradorError) throw colaboradorError;

    const { error: cargoError } = await client
      .from("colaborador_cargo")
      .update({
        cargo: values.cargo,
      })
      .eq("colaborador_id", values.id);

    if (cargoError) throw cargoError;
    await safeWriteRemoteAuditEvent({
      action: "colaborador.update",
      entity: "colaborador",
      entityId: values.id,
      metadata: { cargo: values.cargo },
    });
    return values.id;
  }

  const { data: colaborador, error: colaboradorError } = await client
    .from("colaborador")
    .insert({
      nome: values.nome,
      email: values.email,
    })
    .select("id")
    .single();

  if (colaboradorError) throw colaboradorError;

  const { error: cargoError } = await client.from("colaborador_cargo").insert({
    colaborador_id: colaborador.id,
    cargo: values.cargo,
  });

  if (cargoError) throw cargoError;
  await safeWriteRemoteAuditEvent({
    action: "colaborador.create",
    entity: "colaborador",
    entityId: colaborador.id,
    metadata: { cargo: values.cargo },
  });
  return colaborador.id as string;
}

export async function createRemoteColaboradorAccess(values: {
  colaboradorId: string;
  nome: string;
  email: string;
  cargo: Cargo;
  password: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("create-colaborador-access", {
    body: {
      colaboradorId: values.colaboradorId,
      nome: values.nome,
      email: values.email,
      cargo: values.cargo,
      password: values.password,
    },
  });

  if (error) {
    // O MOTIVO DE VERDADE (25/08/2026). Quando a função responde não-2xx, o
    // supabase-js entrega um erro genérico ("non-2xx status code") e guarda o
    // corpo em error.context. Sem ler isso, a tela dizia "verifique a Edge
    // Function" para qualquer coisa — e o motivo real (e-mail, senha curta,
    // cargo) ficava invisível.
    const contexto = (error as { context?: Response }).context;
    if (contexto && typeof contexto.json === "function") {
      const corpo = await contexto.json().catch(() => null);
      const motivo = (corpo as { error?: string } | null)?.error;
      if (motivo) throw new Error(motivo);
    }
    throw error;
  }
  return data as { authId: string; colaboradorId: string };
}

// SENHA DO GESTOR (10/09/2026). O hash mora no banco e NÃO é legível: quem
// confere é a função SECURITY DEFINER. A tela só recebe true/false.
export async function senhaGestorDefinida() {
  const client = requireSupabase();
  const { data, error } = await client.rpc("senha_gestor_definida");
  if (error) throw error;
  return data === true;
}

export async function conferirSenhaGestor(senha: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("conferir_senha_gestor", { _senha: senha });
  if (error) throw error;
  return data === true;
}

export async function definirSenhaGestor(senha: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("definir_senha_gestor", { _senha: senha });
  if (error) throw error;
}

export async function deactivateRemoteColaborador(id: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("deactivate_colaborador", {
    _colaborador_id: id,
  });

  if (error) throw error;
}

export async function reactivateRemoteColaborador(id: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("reactivate_colaborador", {
    _colaborador_id: id,
  });

  if (error) throw error;
}

type RemoteAuditEvent = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  colaborador?: { nome?: string | null; email?: string | null } | null;
};

export async function listRemoteAuditEvents(): Promise<AuditEventRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("audit_event")
    .select("id, actor_id, action, entity, entity_id, metadata, created_at, colaborador:actor_id(nome, email)")
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) throw error;

  return ((data ?? []) as RemoteAuditEvent[]).map((event) => ({
    id: event.id,
    actorName: event.colaborador?.nome ?? "Sistema",
    actorEmail: event.colaborador?.email ?? undefined,
    action: event.action,
    entity: event.entity,
    entityId: event.entity_id ?? undefined,
    metadata: event.metadata ?? {},
    createdAt: event.created_at,
  }));
}

type RemoteAviso = {
  id: string;
  autor_id: string;
  corpo: string;
  prioridade: PrioridadeAviso;
  publicado_em: string;
  deleted_at: string | null;
  colaborador?: { nome?: string | null } | null;
};

export async function listRemoteAvisos(): Promise<Aviso[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("aviso")
    .select("id, autor_id, corpo, prioridade, publicado_em, deleted_at, colaborador:autor_id(nome)")
    .is("deleted_at", null)
    .order("publicado_em", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as RemoteAviso[]).map((aviso) => ({
    id: aviso.id,
    corpo: aviso.corpo,
    prioridade: aviso.prioridade,
    autor: aviso.colaborador?.nome ?? "Coordenação",
    publicadoEm: aviso.publicado_em,
    deletedAt: aviso.deleted_at ?? undefined,
  }));
}

export async function publishRemoteAviso(values: {
  pessoa: Colaborador;
  corpo: string;
  prioridade: PrioridadeAviso;
}) {
  const client = requireSupabase();
  const { error } = await client.from("aviso").insert({
    autor_id: values.pessoa.id,
    corpo: values.corpo,
    prioridade: values.prioridade,
  });

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "aviso.publish",
    entity: "aviso",
    metadata: { prioridade: values.prioridade },
  });
}

export async function archiveRemoteAviso(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("aviso").update({ deleted_at: new Date().toISOString() }).eq("id", id);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "aviso.archive",
    entity: "aviso",
    entityId: id,
  });
}

type RemoteChecklistRun = {
  id: string;
  template_id: string;
};

type RemoteChecklistTemplateItem = {
  grupo: string;
  descricao: string;
  responsavel: string;
  ordem: number;
};

type RemoteChecklistItemRun = {
  id: string;
  grupo: string;
  descricao: string;
  responsavel: string;
  ordem: number;
  concluido: boolean;
  concluido_por: string | null;
  concluido_em: string | null;
  source_task_id?: string | null;
};

export async function getOrCreateRemoteChecklistRun(dateRef = todayISO()) {
  const client = requireSupabase();

  const { data: template, error: templateError } = await client
    .from("checklist_template")
    .select("id")
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (templateError) throw templateError;
  if (!template) throw new Error("Checklist padrão não encontrado. Aplique as migrations do Supabase.");

  const { data: existingRun, error: existingRunError } = await client
    .from("checklist_run")
    .select("id, template_id")
    .eq("template_id", template.id)
    .eq("data_ref", dateRef)
    .maybeSingle();

  if (existingRunError) throw existingRunError;

  const run = existingRun as RemoteChecklistRun | null;
  if (run) {
    return run;
  }

  const { data: newRun, error: newRunError } = await client
    .from("checklist_run")
    .insert({
      template_id: template.id,
      data_ref: dateRef,
    })
    .select("id, template_id")
    .single();

  if (newRunError) throw newRunError;
  return newRun as RemoteChecklistRun;
}

export async function listRemoteChecklistItems(dateRef = todayISO()): Promise<{ runId: string; items: ChecklistItem[] }> {
  const client = requireSupabase();
  const run = await getOrCreateRemoteChecklistRun(dateRef);
  try {
    await ensurePersistentChecklistItems(run.id);
  } catch (error) {
    console.warn("Tarefas de rotina não sincronizaram.", error);
  }
  const mapRunItem = (item: RemoteChecklistItemRun): ChecklistItem => ({
    id: item.id,
    grupo: item.grupo,
    descricao: item.descricao,
    responsavel: item.responsavel,
    ordem: item.ordem,
    concluido: item.concluido,
    concluidoPor: item.concluido_por ? "Equipe Bratan" : undefined,
    concluidoEm: item.concluido_em ?? undefined,
  });
  const itemKey = (item: Pick<RemoteChecklistItemRun, "grupo" | "descricao">) => `${item.grupo}:::${item.descricao}`;

  const { data: existingItems, error: existingItemsError } = await client
    .from("checklist_item_run")
    .select("*")
    .eq("run_id", run.id)
    .order("ordem", { ascending: true });

  if (existingItemsError) throw existingItemsError;

  const { data: templateItems, error: templateItemsError } = await client
    .from("checklist_item_template")
    .select("grupo, descricao, responsavel, ordem")
    .eq("template_id", run.template_id)
    .order("ordem", { ascending: true });

  if (templateItemsError) throw templateItemsError;

  const currentTemplateItems = (templateItems ?? []) as RemoteChecklistTemplateItem[];
  const currentTemplateKeys = new Set(currentTemplateItems.map(itemKey));

  if (existingItems && existingItems.length > 0) {
    const existingRunItems = existingItems as RemoteChecklistItemRun[];
    const existingKeys = new Set(existingRunItems.map(itemKey));
    const missingTemplateItems = currentTemplateItems.filter((item) => !existingKeys.has(itemKey(item)));
    let createdItems: RemoteChecklistItemRun[] = [];

    if (missingTemplateItems.length > 0) {
      const { data: syncedItems, error: syncedItemsError } = await client
        .from("checklist_item_run")
        .insert(
          missingTemplateItems.map((item) => ({
            run_id: run.id,
            grupo: item.grupo,
            descricao: item.descricao,
            responsavel: item.responsavel,
            ordem: item.ordem,
          })),
        )
        .select("*");

      if (syncedItemsError) throw syncedItemsError;
      createdItems = (syncedItems ?? []) as RemoteChecklistItemRun[];
    }

    // O expurgo vale só para itens de template que saíram do template atual.
    // Tarefas adicionadas pela equipe (ordem 999) e as fixas/rotinas
    // (source_task_id) NÃO podem sumir — era isso que fazia a tarefa nova
    // "não ser adicionada": ela era criada e escondida no recarregamento.
    const keepAlways = (item: RemoteChecklistItemRun) => item.ordem >= 999 || Boolean(item.source_task_id);
    const visibleExistingItems = currentTemplateKeys.size
      ? existingRunItems.filter((item) => keepAlways(item) || currentTemplateKeys.has(itemKey(item)))
      : existingRunItems;
    const mergedItems = [...visibleExistingItems, ...createdItems].sort((a, b) => a.ordem - b.ordem);

    return {
      runId: run.id,
      items: mergedItems.map(mapRunItem),
    };
  }

  const inserts = currentTemplateItems.map((item) => ({
    run_id: run.id,
    grupo: item.grupo,
    descricao: item.descricao,
    responsavel: item.responsavel,
    ordem: item.ordem,
  }));

  if (!inserts.length) {
    return { runId: run.id, items: [] };
  }

  const { data: createdItems, error: createdItemsError } = await client
    .from("checklist_item_run")
    .insert(inserts)
    .select("*")
    .order("ordem", { ascending: true });

  if (createdItemsError) throw createdItemsError;

  return {
    runId: run.id,
    items: ((createdItems ?? []) as RemoteChecklistItemRun[]).map(mapRunItem),
  };
}

export type ChecklistTaskKind = "ATE_CONCLUIR" | "ROTINA";

export async function createRemoteChecklistTask(values: {
  titulo: string;
  grupo: string;
  kind: ChecklistTaskKind;
  createdBy: string | null;
}) {
  const client = requireSupabase();
  const { error } = await client.from("checklist_task").insert({
    titulo: values.titulo,
    grupo: values.grupo,
    kind: values.kind,
    created_by: uuidOrNull(values.createdBy),
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "checklist.item.adicionar",
    entity: "checklist_task",
    metadata: { grupo: values.grupo, descricao: values.titulo, kind: values.kind },
  });
}

// Garante que rotinas e tarefas "até concluir" apareçam no dia: cria no run
// do dia os itens que faltam (rotina sempre; até-concluir enquanto não feita).
async function ensurePersistentChecklistItems(runId: string) {
  const client = requireSupabase();
  const { data: tasks, error: tasksError } = await client
    .from("checklist_task")
    .select("id, titulo, grupo, kind, done_at")
    .eq("active", true);
  if (tasksError) throw tasksError;
  const pending = ((tasks ?? []) as { id: string; titulo: string; grupo: string; kind: string; done_at: string | null }[])
    .filter((task) => task.kind === "ROTINA" || !task.done_at);
  if (!pending.length) return;

  const { data: existing, error: existingError } = await client
    .from("checklist_item_run")
    .select("source_task_id")
    .eq("run_id", runId)
    .not("source_task_id", "is", null);
  if (existingError) throw existingError;
  const present = new Set(((existing ?? []) as { source_task_id: string }[]).map((row) => row.source_task_id));

  const missing = pending.filter((task) => !present.has(task.id));
  if (!missing.length) return;
  const { error: insertError } = await client.from("checklist_item_run").insert(
    missing.map((task) => ({
      run_id: runId,
      grupo: task.grupo,
      descricao: `${task.kind === "ROTINA" ? "🔁" : "📌"} ${task.titulo}`,
      responsavel: "Equipe",
      ordem: 500,
      source_task_id: task.id,
    })),
  );
  if (insertError) throw insertError;
}

export async function createRemoteChecklistItem(values: {
  runId: string;
  grupo: string;
  descricao: string;
  responsavel: string;
}) {
  const client = requireSupabase();
  const { error } = await client.from("checklist_item_run").insert({
    run_id: values.runId,
    grupo: values.grupo,
    descricao: values.descricao,
    responsavel: values.responsavel,
    ordem: 999,
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "checklist.item.adicionar",
    entity: "checklist_item_run",
    metadata: { grupo: values.grupo, descricao: values.descricao },
  });
}

export async function updateRemoteChecklistItem(values: {
  id: string;
  concluido: boolean;
  pessoaId: string | null;
}) {
  const client = requireSupabase();
  const { error } = await client
    .from("checklist_item_run")
    .update({
      concluido: values.concluido,
      concluido_por: values.concluido ? values.pessoaId : null,
      concluido_em: values.concluido ? new Date().toISOString() : null,
    })
    .eq("id", values.id);

  if (error) throw error;

  // Item vindo de tarefa persistente: concluir "até concluir" encerra a tarefa
  // (para de reaparecer); desmarcar reabre.
  const { data: itemRow } = await client
    .from("checklist_item_run")
    .select("source_task_id")
    .eq("id", values.id)
    .maybeSingle();
  const sourceTaskId = (itemRow as { source_task_id?: string | null } | null)?.source_task_id;
  if (sourceTaskId) {
    await client
      .from("checklist_task")
      .update({ done_at: values.concluido ? new Date().toISOString() : null })
      .eq("id", sourceTaskId)
      .eq("kind", "ATE_CONCLUIR");
  }
  await safeWriteRemoteAuditEvent({
    action: "checklist_item.toggle",
    entity: "checklist_item_run",
    entityId: values.id,
    metadata: { concluido: values.concluido },
  });
}

export async function resetRemoteChecklistRun(runId: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("checklist_item_run")
    .update({
      concluido: false,
      concluido_por: null,
      concluido_em: null,
    })
    .eq("run_id", runId);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "checklist.reset",
    entity: "checklist_run",
    entityId: runId,
  });
}

type RemoteComprovante = {
  id: string;
  tipo: ComprovanteTipo;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_at: string;
  paciente_referencia: string | null;
  crm_contact_ref: string | null;
  pagamento_lembrete_id: string | null;
  inteligencia_360_receivable_ref: string | null;
  valor: number | null;
  forma_pagamento: FormaPagamento | null;
  observacao: string | null;
  estorno_de: string | null;
  deleted_at: string | null;
  sharepoint_status: string;
  colaborador?: { nome?: string | null } | null;
};

export async function listRemoteComprovantes(uploadedByCargo: Cargo): Promise<ComprovanteRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("comprovante")
    .select("id, tipo, storage_path, original_filename, mime_type, file_size_bytes, uploaded_at, uploaded_by, paciente_referencia, crm_contact_ref, pagamento_lembrete_id, inteligencia_360_receivable_ref, valor, forma_pagamento, observacao, estorno_de, deleted_at, sharepoint_status, colaborador:uploaded_by(nome)")
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as RemoteComprovante[]).map((record) => ({
    id: record.id,
    tipo: record.tipo,
    storagePath: (record as { storage_path?: string }).storage_path ?? undefined,
    arquivoNome: record.original_filename,
    arquivoTipo: record.mime_type,
    arquivoTamanho: record.file_size_bytes,
    anexadoEm: record.uploaded_at,
    anexadoPor: record.colaborador?.nome ?? "Equipe Bratan",
    anexadoPorId: (record as { uploaded_by?: string }).uploaded_by ?? undefined,
    anexadoPorCargo: uploadedByCargo,
    pacienteReferencia: record.paciente_referencia ?? undefined,
    crmContactRef: record.crm_contact_ref ?? undefined,
    pagamentoLembreteId: record.pagamento_lembrete_id ?? undefined,
    inteligencia360ReceivableId: record.inteligencia_360_receivable_ref ?? undefined,
    valor: record.valor ?? undefined,
    formaPagamento: record.forma_pagamento ?? undefined,
    observacao: record.observacao ?? undefined,
    estornoDe: record.estorno_de ?? undefined,
    deletedAt: record.deleted_at ?? undefined,
    sharePoint: prepareSharePointDispatch(
      record.id,
      record.original_filename,
      record.tipo === "estorno" ? "ESTORNO" : "COMPROVANTE",
      new Date(record.uploaded_at),
    ),
  }));
}

export async function uploadRemoteComprovante(values: {
  pessoa: Colaborador;
  file: File;
  pacienteReferencia?: string;
  crmContactRef?: string;
  pagamentoLembreteId?: string;
  valor?: number;
  formaPagamento?: FormaPagamento;
  observacao?: string;
  alimentarRecebiveis360?: boolean;
  /** Comanda a que este comprovante pertence (Entrada Única, 14/08/2026). */
  saleRef?: string;
  salePaymentRef?: string;
}) {
  const client = requireSupabase();
  const id = crypto.randomUUID();
  const safeName = publicUrlSafeName(values.file.name) || "comprovante";
  const storagePath = `${todayISO()}/${id}-${safeName}`;

  const { error: storageError } = await client.storage.from("comprovantes").upload(storagePath, values.file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (storageError) throw storageError;

  const inteligenciaReceivableRef =
    values.alimentarRecebiveis360 !== false && values.pacienteReferencia && typeof values.valor === "number" && values.valor > 0
      ? `recv-comprovante-${id}`
      : null;

  const { error: insertError } = await client.from("comprovante").insert({
    id,
    storage_path: storagePath,
    original_filename: values.file.name,
    mime_type: values.file.type || "application/octet-stream",
    file_size_bytes: values.file.size,
    uploaded_by: values.pessoa.id,
    paciente_referencia: values.pacienteReferencia?.trim() || null,
    crm_contact_ref: values.crmContactRef || null,
    pagamento_lembrete_id: values.pagamentoLembreteId ?? null,
    inteligencia_360_receivable_ref: inteligenciaReceivableRef,
    valor: values.valor ?? null,
    forma_pagamento: values.formaPagamento ?? null,
    observacao: values.observacao ?? null,
    // Amarra o comprovante à comanda: é o que faz "sem comprovante" deixar de
    // ser invisível (processo à prova de erro, 10/08) e o que a Entrada Única usa.
    sale_ref: values.saleRef ?? null,
    sale_payment_ref: values.salePaymentRef ?? null,
    sharepoint_job_payload: prepareSharePointDispatch(id, values.file.name),
  });

  if (insertError) throw insertError;

  // Fila de despacho para o SharePoint: a Edge Function sharepoint-dispatch envia
  // o arquivo para a pasta certa quando as credenciais do Microsoft Graph estão configuradas.
  const { error: dispatchError } = await client.from("sharepoint_dispatch_queue").insert({
    module: "COMPROVANTE",
    entity_id: id,
    storage_bucket: "comprovantes",
    storage_path: storagePath,
    file_name: values.file.name,
    mime_type: values.file.type || "application/octet-stream",
    target_folder: sharePointTargetFolder("COMPROVANTE"),
    created_by: values.pessoa.id,
  });
  if (dispatchError) {
    console.warn("Comprovante salvo, mas não entrou na fila do SharePoint.", dispatchError);
  }

  if (values.pagamentoLembreteId) {
    const { error: pagamentoError } = await client.rpc("mark_pagamento_pago_por_comprovante", {
      _pagamento_id: values.pagamentoLembreteId,
      _comprovante_id: id,
    });
    if (pagamentoError) throw pagamentoError;
  }

  if (inteligenciaReceivableRef && values.pacienteReferencia && typeof values.valor === "number") {
    const { error: receivableError } = await client.from("receivables").upsert(
      {
        client_ref: inteligenciaReceivableRef,
        patient_reference: values.pacienteReferencia,
        total_amount: values.valor,
        received_amount: values.valor,
        due_date: todayISO(),
        payment_method: values.formaPagamento ?? "Comprovante",
        installments: 1,
        status: "PAID",
        owner_user_id: values.pessoa.id,
        collection_status: "RESOLVED",
        notes: values.pagamentoLembreteId
          ? `Recebido via comprovante ${values.file.name}; pendência vinculada ${values.pagamentoLembreteId}.`
          : `Recebido via comprovante ${values.file.name}.`,
      },
      { onConflict: "client_ref" },
    );
    if (receivableError) throw receivableError;
  }

  await safeWriteRemoteAuditEvent({
    action: "comprovante.upload",
    entity: "comprovante",
    entityId: id,
    metadata: {
      fileName: values.file.name,
      fileSize: values.file.size,
      pacienteReferencia: values.pacienteReferencia ?? null,
      pagamentoLembreteId: values.pagamentoLembreteId ?? null,
      formaPagamento: values.formaPagamento ?? null,
      hasValor: typeof values.valor === "number",
      feedsReceivables360: Boolean(inteligenciaReceivableRef),
    },
  });

  return id;
}

export type SharePointQueueRecord = {
  id: string;
  module: SharePointModule;
  entityId: string;
  fileName: string;
  targetFolder: string;
  status: SharePointDispatchStatus;
  attempts: number;
  lastError: string;
  sharePointWebUrl: string;
  sentAt: string | null;
  createdAt: string;
};

export async function listRemoteSharePointQueue(limit = 50): Promise<SharePointQueueRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sharepoint_dispatch_queue")
    .select("id, module, entity_id, file_name, target_folder, status, attempts, last_error, sharepoint_web_url, sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    module: row.module as SharePointModule,
    entityId: String(row.entity_id ?? ""),
    fileName: String(row.file_name ?? ""),
    targetFolder: String(row.target_folder ?? ""),
    status: row.status as SharePointDispatchStatus,
    attempts: Number(row.attempts ?? 0),
    lastError: String(row.last_error ?? ""),
    sharePointWebUrl: String(row.sharepoint_web_url ?? ""),
    sentAt: (row.sent_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function createRemoteEstorno(values: {
  pessoa: Colaborador;
  record: ComprovanteRecord;
}) {
  const client = requireSupabase();
  const id = crypto.randomUUID();
  const arquivoNome = `Estorno de ${values.record.arquivoNome}`;
  const { error } = await client.from("comprovante").insert({
    id,
    tipo: "estorno",
    storage_path: `estornos/${id}.json`,
    original_filename: arquivoNome,
    mime_type: "application/json",
    file_size_bytes: 0,
    uploaded_by: values.pessoa.id,
    paciente_referencia: values.record.pacienteReferencia ?? null,
    crm_contact_ref: values.record.crmContactRef ?? null,
    pagamento_lembrete_id: values.record.pagamentoLembreteId ?? null,
    valor: typeof values.record.valor === "number" ? -Math.abs(values.record.valor) : null,
    observacao: `Correção operacional do comprovante ${values.record.arquivoNome}.`,
    estorno_de: values.record.id,
    sharepoint_job_payload: prepareSharePointDispatch(id, arquivoNome),
  });

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "comprovante.estorno",
    entity: "comprovante",
    entityId: id,
    metadata: { estornoDe: values.record.id },
  });
}

export async function softDeleteRemoteComprovante(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("comprovante").update({ deleted_at: new Date().toISOString() }).eq("id", id);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "comprovante.hide",
    entity: "comprovante",
    entityId: id,
  });
}

type RemotePagamentoLembrete = {
  id: string;
  paciente_nome: string;
  crm_contact_ref?: string | null;
  contato: string | null;
  valor_pendente: number | string;
  data_prevista: string;
  observacao: string | null;
  status: PagamentoLembreteStatus;
  criado_por: string;
  criado_em: string;
  pago_em: string | null;
  deleted_at: string | null;
  colaborador?: { nome?: string | null } | null;
};

function pagamentoReceivableClientRef(id: string) {
  return `pagamento-${id}`;
}

function remotePagamentoReceivableStatus(record: RemotePagamentoLembrete) {
  if (record.status === "pago") return "PAID";
  if (record.status === "cancelado") return "CANCELED";
  const dueDate = new Date(`${record.data_prevista}T00:00:00`);
  const today = new Date(`${todayISO()}T00:00:00`);
  return dueDate < today ? "OVERDUE" : "OPEN";
}

function remotePagamentoReceivableCollectionStatus(status: string) {
  if (status === "PAID" || status === "CANCELED") return "RESOLVED";
  if (status === "OVERDUE") return "FIRST_CONTACT";
  return "PROMISED_PAYMENT";
}

async function upsertRemoteReceivableFromPagamento(record: RemotePagamentoLembrete) {
  try {
    await upsertRemoteReceivableFromPagamentoStrict(record);
  } catch (error) {
    console.warn("Lembrete salvo, mas o espelho nos Recebíveis 360 não sincronizou.", error);
  }
}

async function upsertRemoteReceivableFromPagamentoStrict(record: RemotePagamentoLembrete) {
  const client = requireSupabase();
  const totalAmount = Number(record.valor_pendente);
  const status = remotePagamentoReceivableStatus(record);
  const { error } = await client.from("receivables").upsert(
    {
      client_ref: pagamentoReceivableClientRef(record.id),
      patient_reference: record.paciente_nome,
      total_amount: totalAmount,
      received_amount: status === "PAID" ? totalAmount : 0,
      due_date: record.data_prevista,
      payment_method: "Lembrete de pagamento",
      installments: 1,
      status,
      owner_user_id: record.criado_por,
      collection_status: remotePagamentoReceivableCollectionStatus(status),
      notes: record.observacao
        ? `Gerado automaticamente por Lembretes de pagamento. ${record.observacao}`
        : "Gerado automaticamente por Lembretes de pagamento.",
    },
    { onConflict: "client_ref" },
  );

  if (error) throw error;
}

function mapRemotePagamento(record: RemotePagamentoLembrete): PagamentoLembrete {
  return {
    id: record.id,
    pacienteNome: record.paciente_nome,
    crmContactRef: record.crm_contact_ref ?? undefined,
    contato: record.contato ?? undefined,
    valorPendente: Number(record.valor_pendente),
    dataPrevista: record.data_prevista,
    observacao: record.observacao ?? undefined,
    status: record.status,
    criadoPor: record.colaborador?.nome ?? "Coordenação",
    criadoEm: record.criado_em,
    pagoEm: record.pago_em ?? undefined,
    deletedAt: record.deleted_at ?? undefined,
  };
}

export async function listRemotePagamentos(): Promise<PagamentoLembrete[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("pagamento_lembrete")
    .select("id, paciente_nome, contato, crm_contact_ref, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at, colaborador:criado_por(nome)")
    .is("deleted_at", null)
    .order("data_prevista", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as RemotePagamentoLembrete[]).map(mapRemotePagamento);
}

export async function createRemotePagamento(values: {
  pessoa: Colaborador;
  pacienteNome: string;
  contato?: string;
  crmContactRef?: string | null;
  valorPendente: number;
  dataPrevista: string;
  observacao?: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("pagamento_lembrete")
    .insert({
      paciente_nome: values.pacienteNome,
      contato: values.contato ?? null,
      crm_contact_ref: values.crmContactRef || null,
      valor_pendente: values.valorPendente,
      data_prevista: values.dataPrevista,
      observacao: values.observacao ?? null,
      criado_por: values.pessoa.id,
    })
    .select("id, paciente_nome, contato, crm_contact_ref, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
    .single();

  if (error) throw error;
  await upsertRemoteReceivableFromPagamento(data as RemotePagamentoLembrete);
  await safeWriteRemoteAuditEvent({
    action: "pagamento_lembrete.create",
    entity: "pagamento_lembrete",
    entityId: data.id,
    metadata: { dataPrevista: values.dataPrevista, hasContato: Boolean(values.contato) },
  });
}

export type FinCashEntry = {
  id: string;
  entryDate: string;
  direction: "ENTRADA" | "SAIDA";
  description: string;
  amount: number;
  /** Paciente do CRM (dinheiro de fechamento) — a Conferência lê por aqui. */
  crmContactRef?: string | null;
};

export async function listRemoteFinCashEntries(): Promise<FinCashEntry[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_cash_entries")
    .select("client_ref, entry_date, direction, description, amount, crm_contact_ref")
    .is("deleted_at", null)
    .order("entry_date", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    entryDate: String(row.entry_date),
    direction: row.direction as FinCashEntry["direction"],
    description: String(row.description ?? ""),
    amount: Number(row.amount ?? 0),
    crmContactRef: (row.crm_contact_ref as string | null) ?? null,
  }));
}

export async function createRemoteFinCashEntry(entry: FinCashEntry, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_cash_entries").insert({
    client_ref: entry.id,
    entry_date: entry.entryDate,
    direction: entry.direction,
    description: entry.description,
    amount: entry.amount,
    crm_contact_ref: entry.crmContactRef ?? null,
    created_by: uuidOrNull(createdBy),
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.crediario.lancar",
    entity: "fin_cash_entries",
    entityId: entry.id,
    metadata: { direction: entry.direction, amount: entry.amount, entryDate: entry.entryDate },
  });
}

export async function deleteRemoteFinCashEntry(entryRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_cash_entries").update({ deleted_at: new Date().toISOString() }).eq("client_ref", entryRef);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "financeiro.crediario.excluir", entity: "fin_cash_entries", entityId: entryRef });
}

export async function deleteRemoteCrmLead(values: { contactRef: string; dealRefs: string[] }) {
  const client = requireSupabase();
  const byContact = ["crm_tasks", "crm_touchpoints", "crm_timeline_events", "crm_cadence_enrollments"] as const;
  for (const table of byContact) {
    const { error } = await client.from(table).delete().eq("contact_id", values.contactRef);
    if (error) throw error;
  }
  if (values.dealRefs.length) {
    const { error } = await client.from("crm_deals").delete().in("client_ref", values.dealRefs);
    if (error) throw error;
  }
  const { error: dealsByContact } = await client.from("crm_deals").delete().eq("contact_id", values.contactRef);
  if (dealsByContact) throw dealsByContact;
  const { error } = await client.from("crm_contacts").delete().eq("client_ref", values.contactRef);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "crm.lead.excluir", entity: "crm_contacts", entityId: values.contactRef });
}

export async function registerRemotePagamentoRecebimento(values: {
  lembreteId: string;
  valor: number;
  forma: "DINHEIRO" | "PIX" | "CARTAO" | "OUTRO";
  novoPendente: number;
  recebidoPor: string | null;
  // Comanda que abateu o lembrete. Preenchido = o valor já está no faturamento
  // pela comanda; o caixa do crediário ignora estes recebimentos.
  saleRef?: string | null;
}) {
  const client = requireSupabase();
  const { error } = await client.from("pagamento_recebimento").insert({
    lembrete_id: values.lembreteId,
    valor: values.valor,
    forma: values.forma,
    recebido_por: uuidOrNull(values.recebidoPor),
    sale_ref: values.saleRef || null,
  });
  if (error) throw error;

  const quitou = values.novoPendente <= 0;
  const { data, error: updateError } = await client
    .from("pagamento_lembrete")
    .update({
      valor_pendente: quitou ? 0 : values.novoPendente,
      status: quitou ? "pago" : "aberto",
      pago_em: quitou ? new Date().toISOString() : null,
    })
    .eq("id", values.lembreteId)
    .select("id, paciente_nome, contato, crm_contact_ref, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
    .single();
  if (updateError) throw updateError;
  await upsertRemoteReceivableFromPagamento(data as RemotePagamentoLembrete);
  await safeWriteRemoteAuditEvent({
    action: "pagamento_lembrete.recebimento",
    entity: "pagamento_lembrete",
    entityId: values.lembreteId,
    metadata: { valor: values.valor, forma: values.forma, quitou },
  });
}

export type RemotePagamentoRecebimento = {
  id: string;
  lembreteId: string;
  valor: number;
  forma: string;
  recebidoEm: string;
  saleRef?: string | null;
  // Estado do lembrete de origem — o cofre precisa saber quando o recebimento
  // ficou órfão (lembrete apagado) ou pendurado num lembrete cancelado.
  pacienteNome?: string | null;
  lembreteStatus?: string | null;
  lembreteApagado?: boolean;
};

export async function listRemotePagamentoRecebimentos(): Promise<RemotePagamentoRecebimento[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("pagamento_recebimento")
    .select("id, lembrete_id, valor, forma, recebido_em, sale_ref, lembrete:lembrete_id(paciente_nome, status, deleted_at)")
    .order("recebido_em", { ascending: false })
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const lembrete = (Array.isArray(row.lembrete) ? row.lembrete[0] : row.lembrete) as
      | Record<string, unknown>
      | null
      | undefined;
    return {
      id: String(row.id),
      lembreteId: String(row.lembrete_id),
      valor: Number(row.valor ?? 0),
      forma: String(row.forma ?? "DINHEIRO"),
      recebidoEm: String(row.recebido_em),
      saleRef: row.sale_ref ? String(row.sale_ref) : null,
      pacienteNome: lembrete?.paciente_nome ? String(lembrete.paciente_nome) : null,
      lembreteStatus: lembrete?.status ? String(lembrete.status) : null,
      lembreteApagado: Boolean(lembrete?.deleted_at),
    };
  });
}

// ESTORNO de recebimento (28/07/2026). Antes não existia: quem lançava errado
// (forma trocada, duplo lançamento) não tinha como desfazer, e o valor ficava
// inflando o caixa do crediário para sempre — foi o que descasou o cofre.
// Estornar apaga o recebimento E devolve o valor ao pendente do lembrete.
export async function deleteRemotePagamentoRecebimento(values: { id: string; motivo?: string }) {
  const client = requireSupabase();
  const { data: receipt, error: findError } = await client
    .from("pagamento_recebimento")
    .select("id, lembrete_id, valor, forma, recebido_em")
    .eq("id", values.id)
    .single();
  if (findError) throw findError;

  const lembreteId = String((receipt as Record<string, unknown>).lembrete_id);
  const valor = Number((receipt as Record<string, unknown>).valor ?? 0);

  const { data: lembrete, error: lembreteError } = await client
    .from("pagamento_lembrete")
    .select("id, valor_pendente, status")
    .eq("id", lembreteId)
    .single();
  if (lembreteError) throw lembreteError;

  // .select() de propósito: se a permissão bloquear, o delete volta VAZIO em vez
  // de dar erro — sem esta conferência o app diria "estornado" sem estornar.
  const { data: deleted, error: deleteError } = await client
    .from("pagamento_recebimento")
    .delete()
    .eq("id", values.id)
    .select("id");
  if (deleteError) throw deleteError;
  if (!deleted || deleted.length === 0) {
    throw new Error("Sem permissão para estornar este recebimento.");
  }

  // O valor volta a ser dívida: reabre o lembrete se ele havia sido quitado.
  const pendenteAtual = Number((lembrete as Record<string, unknown>).valor_pendente ?? 0);
  const novoPendente = Math.round((pendenteAtual + valor) * 100) / 100;
  const { data, error: updateError } = await client
    .from("pagamento_lembrete")
    .update({ valor_pendente: novoPendente, status: "aberto", pago_em: null })
    .eq("id", lembreteId)
    .select("id, paciente_nome, contato, crm_contact_ref, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
    .single();
  if (updateError) throw updateError;

  await upsertRemoteReceivableFromPagamento(data as RemotePagamentoLembrete);
  await safeWriteRemoteAuditEvent({
    action: "pagamento_lembrete.estorno",
    entity: "pagamento_lembrete",
    entityId: lembreteId,
    metadata: { recebimentoId: values.id, valor, novoPendente, motivo: values.motivo ?? "" },
  });
  return { lembreteId, valor, novoPendente };
}

export async function updateRemotePagamentoStatus(values: {
  id: string;
  status: PagamentoLembreteStatus;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("pagamento_lembrete")
    .update({
      status: values.status,
      pago_em: values.status === "pago" ? new Date().toISOString() : null,
    })
    .eq("id", values.id)
    .select("id, paciente_nome, contato, crm_contact_ref, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
    .single();

  if (error) throw error;
  await upsertRemoteReceivableFromPagamento(data as RemotePagamentoLembrete);
  await safeWriteRemoteAuditEvent({
    action: "pagamento_lembrete.status",
    entity: "pagamento_lembrete",
    entityId: values.id,
    metadata: { status: values.status },
  });
}

// Editar um lembrete existente (quem deve, valor, data e observação) —
// pedido do Lucas (27/07): antes só dava para mudar status/data, nunca o nome.
export async function updateRemotePagamentoDetalhes(values: {
  id: string;
  pacienteNome: string;
  valorPendente: number;
  dataPrevista: string;
  observacao?: string;
  crmContactRef?: string | null;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("pagamento_lembrete")
    .update({
      paciente_nome: values.pacienteNome,
      valor_pendente: values.valorPendente,
      data_prevista: values.dataPrevista,
      observacao: values.observacao || null,
      ...(values.crmContactRef === undefined ? {} : { crm_contact_ref: values.crmContactRef || null }),
    })
    .eq("id", values.id)
    .select("id, paciente_nome, contato, crm_contact_ref, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
    .single();

  if (error) throw error;
  await upsertRemoteReceivableFromPagamento(data as RemotePagamentoLembrete);
  await safeWriteRemoteAuditEvent({
    action: "pagamento_lembrete.editar",
    entity: "pagamento_lembrete",
    entityId: values.id,
    metadata: { pacienteNome: values.pacienteNome, valorPendente: values.valorPendente, dataPrevista: values.dataPrevista },
  });
}

export async function postponeRemotePagamento(values: {
  id: string;
  dataPrevista: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("pagamento_lembrete")
    .update({
      data_prevista: values.dataPrevista,
      status: "aberto",
      pago_em: null,
    })
    .eq("id", values.id)
    .select("id, paciente_nome, contato, crm_contact_ref, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
    .single();

  if (error) throw error;
  await upsertRemoteReceivableFromPagamento(data as RemotePagamentoLembrete);
  await safeWriteRemoteAuditEvent({
    action: "pagamento_lembrete.postpone",
    entity: "pagamento_lembrete",
    entityId: values.id,
    metadata: { dataPrevista: values.dataPrevista },
  });
}

export async function softDeleteRemotePagamento(id: string) {
  const client = requireSupabase();
  const { error } = await client.from("pagamento_lembrete").update({ deleted_at: new Date().toISOString() }).eq("id", id);

  if (error) throw error;
  const { error: receivableError } = await client
    .from("receivables")
    .update({
      status: "CANCELED",
      collection_status: "RESOLVED",
      updated_at: new Date().toISOString(),
    })
    .eq("client_ref", pagamentoReceivableClientRef(id));
  if (receivableError) throw receivableError;
  await safeWriteRemoteAuditEvent({
    action: "pagamento_lembrete.hide",
    entity: "pagamento_lembrete",
    entityId: id,
  });
}

function remoteNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function remoteText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function remoteStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uuidOrNull(value?: string | null) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function dateOrNull(value?: string | null) {
  return value || null;
}

function remoteId(row: { id?: string; client_ref?: string | null }, prefix: string) {
  return row.client_ref || row.id || `${prefix}-${crypto.randomUUID?.() ?? Date.now()}`;
}

function mapRemoteSettings(record: any): OperationalSettings360 {
  if (!record) return defaultSettings360;
  return {
    monthlyRevenueTarget: remoteNumber(record.monthly_revenue_target),
    weeklyRevenueTarget: remoteNumber(record.weekly_revenue_target),
    dailyRevenueTarget: remoteNumber(record.daily_revenue_target),
    generalAverageTicketTarget: remoteNumber(record.general_average_ticket_target),
    ticketDropCriticalPercentage: remoteNumber(record.ticket_drop_critical_percentage) || 10,
    prescriptionConversionMin: remoteNumber(record.prescription_conversion_min) || 70,
    prescriptionConversionMax: remoteNumber(record.prescription_conversion_max) || 80,
    maxDefaultDiscountPercentage: remoteNumber(record.max_default_discount_percentage) || 10,
    maxMessagesPerCycle: remoteNumber(record.max_messages_per_cycle) || 8,
    originSystem: ["iClinic", "Feegow", "Manual", "CSV", "Outro"].includes(record.origin_system)
      ? record.origin_system
      : defaultSettings360.originSystem,
    areaOwners:
      record.area_owners && typeof record.area_owners === "object" && !Array.isArray(record.area_owners)
        ? { ...defaultSettings360.areaOwners, ...record.area_owners }
        : defaultSettings360.areaOwners,
  };
}

function settingsPayload(settings: OperationalSettings360) {
  return {
    id: true,
    monthly_revenue_target: settings.monthlyRevenueTarget,
    weekly_revenue_target: settings.weeklyRevenueTarget,
    daily_revenue_target: settings.dailyRevenueTarget,
    general_average_ticket_target: settings.generalAverageTicketTarget,
    ticket_drop_critical_percentage: settings.ticketDropCriticalPercentage,
    prescription_conversion_min: settings.prescriptionConversionMin,
    prescription_conversion_max: settings.prescriptionConversionMax,
    max_default_discount_percentage: settings.maxDefaultDiscountPercentage,
    max_messages_per_cycle: settings.maxMessagesPerCycle,
    area_owners: settings.areaOwners,
    origin_system: settings.originSystem,
    updated_at: new Date().toISOString(),
  };
}

async function list360Table(table: string, orderColumn?: string) {
  const client = requireSupabase();
  let query = client.from(table).select("*");
  if (orderColumn) {
    query = query.order(orderColumn, { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function upsert360Table(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const client = requireSupabase();
  const { error } = await client.from(table).upsert(rows, { onConflict: "client_ref" });
  if (error) throw error;
}

export async function listRemoteInteligencia360State(): Promise<Inteligencia360State> {
  const client = requireSupabase();
  const [
    weeklyTickets,
    pricing,
    prescriptions,
    objectionPlaybook,
    journeys,
    touchpoints,
    retentionCohorts,
    rescueWorkflows,
    churnInvestigations,
    experiences,
    receivables,
    actions,
    settingsResult,
  ] = await Promise.all([
    list360Table("weekly_average_ticket", "week_start_date"),
    list360Table("pricing_table", "created_at"),
    list360Table("prescriptions_sales", "consultation_date"),
    list360Table("objection_playbook", "objection_text"),
    list360Table("patient_journey", "created_at"),
    list360Table("relationship_touchpoints", "scheduled_date"),
    list360Table("retention_cohorts", "created_at"),
    list360Table("rescue_workflows", "created_at"),
    list360Table("churn_investigations", "created_at"),
    list360Table("patient_experience", "created_at"),
    list360Table("receivables", "due_date"),
    list360Table("action_items", "due_date"),
    client.from("inteligencia_360_settings").select("*").eq("id", true).maybeSingle(),
  ]);

  if (settingsResult.error) throw settingsResult.error;

  const baseState: Inteligencia360State = {
    weeklyTickets: (weeklyTickets as any[]).map(
      (row): WeeklyAverageTicket => ({
        id: remoteId(row, "wat"),
        weekStartDate: row.week_start_date,
        weekEndDate: row.week_end_date,
        referenceMonth: row.reference_month,
        doctorId: row.doctor_id ?? "",
        doctorName: remoteText(row.doctor_name),
        patientType: row.patient_type,
        patientsSeenCount: remoteNumber(row.patients_seen_count),
        patientsClosedCount: remoteNumber(row.patients_closed_count),
        totalSoldAmount: remoteNumber(row.total_sold_amount),
        totalReceivedAmount: remoteNumber(row.total_received_amount),
        targetAverageTicket: remoteNumber(row.target_average_ticket),
        previousWeekAverageTicket: remoteNumber(row.previous_week_average_ticket),
        mainHypothesis: remoteText(row.main_hypothesis),
        rootCauseCategory: row.root_cause_category ?? "OTHER",
        actionPlan: remoteText(row.action_plan),
        responsibleUserId: row.responsible_user_id ?? "",
        dueDate: row.due_date ?? "",
        notes: remoteText(row.notes),
        createdBy: row.created_by ?? "Coordenação",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    pricing: (pricing as any[]).map(
      (row): PricingTableItem => ({
        id: remoteId(row, "price"),
        serviceName: remoteText(row.service_name),
        category: remoteText(row.category),
        standardPrice: remoteNumber(row.standard_price),
        bratanPrice: remoteNumber(row.bratan_price),
        directCost: remoteNumber(row.direct_cost),
        medicationCost: remoteNumber(row.medication_cost),
        labCost: remoteNumber(row.lab_cost),
        cardFeePercentage: remoteNumber(row.card_fee_percentage),
        doctorRepasseType: row.doctor_repasse_type ?? "PERCENTAGE",
        doctorRepasseValue: remoteNumber(row.doctor_repasse_value),
        otherVariableCosts: remoteNumber(row.other_variable_costs),
        maxDiscountPercentage: remoteNumber(row.max_discount_percentage),
        active: row.active ?? true,
        strategicHighMargin: row.strategic_high_margin ?? false,
        notes: remoteText(row.notes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    prescriptions: (prescriptions as any[]).map(
      (row): PrescriptionSale => ({
        id: remoteId(row, "sale"),
        patientReference: remoteText(row.patient_reference),
        patientType: row.patient_type,
        doctorId: row.doctor_id ?? "",
        sellerId: row.seller_id ?? "",
        consultationDate: row.consultation_date,
        prescribedAmount: remoteNumber(row.prescribed_amount),
        soldAmount: remoteNumber(row.sold_amount),
        receivedAmount: remoteNumber(row.received_amount),
        closed: row.closed ?? false,
        fullPlanClosed: row.full_plan_closed ?? false,
        partialReason: remoteText(row.partial_reason),
        discountPercentage: remoteNumber(row.discount_percentage),
        paymentMethod: remoteText(row.payment_method),
        installments: remoteNumber(row.installments),
        acquisitionChannel: remoteText(row.acquisition_channel),
        mainObjection: remoteText(row.main_objection),
        objectionCategory: row.objection_category ?? "OTHER",
        nextFollowUpDate: row.next_follow_up_date ?? "",
        status: row.status ?? "PRESCRIBED",
        notes: remoteText(row.notes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    objectionPlaybook: (objectionPlaybook as any[]).map(
      (row): ObjectionPlaybookItem => ({
        id: remoteId(row, "obj"),
        objectionCategory: row.objection_category ?? "OTHER",
        objectionText: remoteText(row.objection_text),
        recommendedResponse: remoteText(row.recommended_response),
        examples: remoteText(row.examples),
        active: row.active ?? true,
      }),
    ),
    journeys: (journeys as any[]).map(
      (row): PatientJourney => ({
        id: remoteId(row, "journey"),
        patientReference: remoteText(row.patient_reference),
        patientType: row.patient_type,
        currentStage: row.current_stage,
        doctorId: row.doctor_id ?? "",
        sellerId: row.seller_id ?? "",
        conciergeId: row.concierge_id ?? "",
        nurseId: row.nurse_id ?? "",
        adminId: row.admin_id ?? "",
        treatmentPlanSummary: remoteText(row.treatment_plan_summary),
        prescriptionSent: row.prescription_sent ?? false,
        treatmentGroupSent: row.treatment_group_sent ?? false,
        pharmacyGroupSent: row.pharmacy_group_sent ?? false,
        pmiCompleted: row.pmi_completed ?? false,
        contractCreated: row.contract_created ?? false,
        contractSent: row.contract_sent ?? false,
        contractSigned: row.contract_signed ?? false,
        firstDoseScheduled: row.first_dose_scheduled ?? false,
        firstBioimpedanceScheduled: row.first_bioimpedance_scheduled ?? false,
        allDatesScheduled: row.all_dates_scheduled ?? false,
        nextMedicalReturnDate: row.next_medical_return_date ?? "",
        nextExamDueDate: row.next_exam_due_date ?? "",
        notes: remoteText(row.notes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    touchpoints: (touchpoints as any[]).map(
      (row): RelationshipTouchpoint => ({
        id: remoteId(row, "touch"),
        patientReference: remoteText(row.patient_reference),
        journeyId: row.journey_id ?? "",
        touchType: row.touch_type,
        scheduledDate: row.scheduled_date,
        sentDate: row.sent_date ?? "",
        responsibleRole: remoteText(row.responsible_role),
        responsibleUserId: row.responsible_user_id ?? "",
        status: row.status ?? "PENDING",
        channel: row.channel ?? "WHATSAPP",
        messageTemplateId: remoteText(row.message_template_id),
        manualMessageText: remoteText(row.manual_message_text),
        responseSummary: remoteText(row.response_summary),
        optOut: row.opt_out ?? false,
        fatigueRisk: row.fatigue_risk ?? false,
        notes: remoteText(row.notes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    retentionCohorts: (retentionCohorts as any[]).map(
      (row): RetentionCohort => ({
        id: remoteId(row, "ret"),
        cohortMonth: remoteText(row.cohort_month),
        cohortLabel: remoteText(row.cohort_label),
        totalPatients: remoteNumber(row.total_patients),
        scheduledReturns: remoteNumber(row.scheduled_returns),
        attendedReturns: remoteNumber(row.attended_returns),
        missedReturns: remoteNumber(row.missed_returns),
        patientType: row.patient_type ?? "MIXED",
        notes: remoteText(row.notes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    rescueWorkflows: (rescueWorkflows as any[]).map(
      (row): RescueWorkflow => ({
        id: remoteId(row, "rescue"),
        patientReference: remoteText(row.patient_reference),
        rescueType: row.rescue_type,
        triggerDate: row.trigger_date,
        attemptsTotal: remoteNumber(row.attempts_total),
        attemptsDone: remoteNumber(row.attempts_done),
        status: row.status ?? "OPEN",
        rescuedCriteria: row.rescued_criteria ?? "",
        ownerUserId: row.owner_user_id ?? "",
        notes: remoteText(row.notes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    churnInvestigations: (churnInvestigations as any[]).map(
      (row): ChurnInvestigation => ({
        id: remoteId(row, "churn"),
        patientReference: remoteText(row.patient_reference),
        rescueWorkflowId: row.rescue_workflow_id ?? "",
        investigatorUserId: row.investigator_user_id ?? "",
        callDate: row.call_date ?? "",
        answered: row.answered ?? false,
        churnReasonCategory: row.churn_reason_category ?? "OTHER",
        churnReasonDetail: remoteText(row.churn_reason_detail),
        correctiveAction: remoteText(row.corrective_action),
        responsibleUserId: row.responsible_user_id ?? "",
        dueDate: row.due_date ?? "",
        status: row.status ?? "OPEN",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    experiences: (experiences as any[]).map(
      (row): PatientExperience => ({
        id: remoteId(row, "exp"),
        patientReference: remoteText(row.patient_reference),
        journeyId: row.journey_id ?? "",
        npsScore: remoteNumber(row.nps_score),
        satisfactionScore: remoteNumber(row.satisfaction_score),
        googleReviewRequested: row.google_review_requested ?? false,
        googleReviewDone: row.google_review_done ?? false,
        leadershipContactDone: row.leadership_contact_done ?? false,
        leadershipContactDate: row.leadership_contact_date ?? "",
        feedbackType: row.feedback_type ?? "PRAISE",
        feedbackText: remoteText(row.feedback_text),
        actionRequired: row.action_required ?? false,
        actionPlanId: row.action_plan_id ?? "",
        status: row.status ?? "OPEN",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    receivables: (receivables as any[]).map(
      (row): Receivable => ({
        id: remoteId(row, "recv"),
        patientReference: remoteText(row.patient_reference),
        saleId: row.sale_id ?? "",
        totalAmount: remoteNumber(row.total_amount),
        receivedAmount: remoteNumber(row.received_amount),
        dueDate: row.due_date,
        paymentMethod: remoteText(row.payment_method),
        installments: remoteNumber(row.installments),
        status: row.status ?? "OPEN",
        ownerUserId: row.owner_user_id ?? "",
        collectionStatus: row.collection_status ?? "NOT_STARTED",
        notes: remoteText(row.notes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    actions: (actions as any[]).map(
      (row): ActionItem360 => ({
        id: remoteId(row, "act"),
        sourceModule: row.source_module ?? "MANUAL",
        sourceId: row.source_id ?? "",
        title: remoteText(row.title),
        description: remoteText(row.description),
        priority: row.priority ?? "MEDIUM",
        ownerUserId: row.owner_user_id ?? "",
        dueDate: row.due_date ?? "",
        status: row.status ?? "OPEN",
        expectedImpact: row.expected_impact ?? "PROCESS",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    settings: mapRemoteSettings(settingsResult.data),
  };

  try {
    const crmState = await listRemoteCrmState();
    return deriveInteligencia360FromCrm(crmState, baseState);
  } catch (error) {
    console.warn("CRM remoto não entrou na consolidação do Dashboard 360.", error);
    return baseState;
  }
}

export async function saveRemoteInteligencia360State(state: Inteligencia360State) {
  const client = requireSupabase();
  await Promise.all([
    upsert360Table(
      "weekly_average_ticket",
      state.weeklyTickets.map((record) => ({
        client_ref: record.id,
        week_start_date: record.weekStartDate,
        week_end_date: record.weekEndDate,
        reference_month: record.referenceMonth,
        doctor_id: uuidOrNull(record.doctorId),
        doctor_name: record.doctorName,
        patient_type: record.patientType,
        patients_seen_count: record.patientsSeenCount,
        patients_closed_count: record.patientsClosedCount,
        total_sold_amount: record.totalSoldAmount,
        total_received_amount: record.totalReceivedAmount,
        target_average_ticket: record.targetAverageTicket,
        previous_week_average_ticket: record.previousWeekAverageTicket,
        main_hypothesis: record.mainHypothesis || null,
        root_cause_category: record.rootCauseCategory,
        action_plan: record.actionPlan || null,
        responsible_user_id: uuidOrNull(record.responsibleUserId),
        due_date: dateOrNull(record.dueDate),
        notes: record.notes || null,
        created_by: uuidOrNull(record.createdBy),
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "pricing_table",
      state.pricing.map((record) => ({
        client_ref: record.id,
        service_name: record.serviceName,
        category: record.category,
        standard_price: record.standardPrice,
        bratan_price: record.bratanPrice,
        direct_cost: record.directCost,
        medication_cost: record.medicationCost,
        lab_cost: record.labCost,
        card_fee_percentage: record.cardFeePercentage,
        doctor_repasse_type: record.doctorRepasseType,
        doctor_repasse_value: record.doctorRepasseValue,
        other_variable_costs: record.otherVariableCosts,
        max_discount_percentage: record.maxDiscountPercentage,
        strategic_high_margin: record.strategicHighMargin,
        active: record.active,
        notes: record.notes || null,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "prescriptions_sales",
      state.prescriptions.map((record) => ({
        client_ref: record.id,
        patient_reference: record.patientReference,
        patient_type: record.patientType,
        doctor_id: uuidOrNull(record.doctorId),
        seller_id: uuidOrNull(record.sellerId),
        consultation_date: record.consultationDate,
        prescribed_amount: record.prescribedAmount,
        sold_amount: record.soldAmount,
        received_amount: record.receivedAmount,
        closed: record.closed,
        full_plan_closed: record.fullPlanClosed,
        partial_reason: record.partialReason || null,
        discount_percentage: record.discountPercentage,
        payment_method: record.paymentMethod || null,
        installments: record.installments,
        acquisition_channel: record.acquisitionChannel || null,
        main_objection: record.mainObjection || null,
        objection_category: record.objectionCategory,
        next_follow_up_date: dateOrNull(record.nextFollowUpDate),
        status: record.status,
        notes: record.notes || null,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "objection_playbook",
      state.objectionPlaybook.map((record) => ({
        client_ref: record.id,
        objection_category: record.objectionCategory,
        objection_text: record.objectionText,
        recommended_response: record.recommendedResponse,
        examples: record.examples || null,
        active: record.active,
      })),
    ),
    upsert360Table(
      "patient_journey",
      state.journeys.map((record) => ({
        client_ref: record.id,
        patient_reference: record.patientReference,
        patient_type: record.patientType,
        current_stage: record.currentStage,
        doctor_id: uuidOrNull(record.doctorId),
        seller_id: uuidOrNull(record.sellerId),
        concierge_id: uuidOrNull(record.conciergeId),
        nurse_id: uuidOrNull(record.nurseId),
        admin_id: uuidOrNull(record.adminId),
        treatment_plan_summary: record.treatmentPlanSummary || null,
        prescription_sent: record.prescriptionSent,
        treatment_group_sent: record.treatmentGroupSent,
        pharmacy_group_sent: record.pharmacyGroupSent,
        pmi_completed: record.pmiCompleted,
        contract_created: record.contractCreated,
        contract_sent: record.contractSent,
        contract_signed: record.contractSigned,
        first_dose_scheduled: record.firstDoseScheduled,
        first_bioimpedance_scheduled: record.firstBioimpedanceScheduled,
        all_dates_scheduled: record.allDatesScheduled,
        next_medical_return_date: dateOrNull(record.nextMedicalReturnDate),
        next_exam_due_date: dateOrNull(record.nextExamDueDate),
        notes: record.notes || null,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "relationship_touchpoints",
      state.touchpoints.map((record) => ({
        client_ref: record.id,
        patient_reference: record.patientReference,
        journey_id: uuidOrNull(record.journeyId),
        touch_type: record.touchType,
        scheduled_date: record.scheduledDate,
        sent_date: dateOrNull(record.sentDate),
        responsible_role: record.responsibleRole,
        responsible_user_id: uuidOrNull(record.responsibleUserId),
        status: record.status,
        channel: record.channel,
        message_template_id: record.messageTemplateId || null,
        manual_message_text: record.manualMessageText || null,
        response_summary: record.responseSummary || null,
        opt_out: record.optOut,
        fatigue_risk: record.fatigueRisk,
        notes: record.notes || null,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "retention_cohorts",
      state.retentionCohorts.map((record) => ({
        client_ref: record.id,
        cohort_month: record.cohortMonth,
        cohort_label: record.cohortLabel,
        total_patients: record.totalPatients,
        scheduled_returns: record.scheduledReturns,
        attended_returns: record.attendedReturns,
        missed_returns: record.missedReturns,
        patient_type: record.patientType,
        notes: record.notes || null,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "rescue_workflows",
      state.rescueWorkflows.map((record) => ({
        client_ref: record.id,
        patient_reference: record.patientReference,
        rescue_type: record.rescueType,
        trigger_date: record.triggerDate,
        attempts_total: record.attemptsTotal,
        attempts_done: record.attemptsDone,
        status: record.status,
        rescued_criteria: record.rescuedCriteria || null,
        owner_user_id: uuidOrNull(record.ownerUserId),
        notes: record.notes || null,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "churn_investigations",
      state.churnInvestigations.map((record) => ({
        client_ref: record.id,
        patient_reference: record.patientReference,
        rescue_workflow_id: uuidOrNull(record.rescueWorkflowId),
        investigator_user_id: uuidOrNull(record.investigatorUserId),
        call_date: dateOrNull(record.callDate),
        answered: record.answered,
        churn_reason_category: record.churnReasonCategory,
        churn_reason_detail: record.churnReasonDetail || null,
        corrective_action: record.correctiveAction || null,
        responsible_user_id: uuidOrNull(record.responsibleUserId),
        due_date: dateOrNull(record.dueDate),
        status: record.status,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "patient_experience",
      state.experiences.map((record) => ({
        client_ref: record.id,
        patient_reference: record.patientReference,
        journey_id: uuidOrNull(record.journeyId),
        nps_score: record.npsScore,
        satisfaction_score: record.satisfactionScore,
        google_review_requested: record.googleReviewRequested,
        google_review_done: record.googleReviewDone,
        leadership_contact_done: record.leadershipContactDone,
        leadership_contact_date: dateOrNull(record.leadershipContactDate),
        feedback_type: record.feedbackType,
        feedback_text: record.feedbackText || null,
        action_required: record.actionRequired,
        action_plan_id: uuidOrNull(record.actionPlanId),
        status: record.status,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "receivables",
      state.receivables.map((record) => ({
        client_ref: record.id,
        patient_reference: record.patientReference,
        sale_id: uuidOrNull(record.saleId),
        total_amount: record.totalAmount,
        received_amount: record.receivedAmount,
        due_date: record.dueDate,
        payment_method: record.paymentMethod || null,
        installments: record.installments,
        status: record.status,
        owner_user_id: uuidOrNull(record.ownerUserId),
        collection_status: record.collectionStatus,
        notes: record.notes || null,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    upsert360Table(
      "action_items",
      state.actions.map((record) => ({
        client_ref: record.id,
        source_module: record.sourceModule,
        source_id: record.sourceId || null,
        title: record.title,
        description: record.description || null,
        priority: record.priority,
        owner_user_id: uuidOrNull(record.ownerUserId),
        due_date: dateOrNull(record.dueDate),
        status: record.status,
        expected_impact: record.expectedImpact,
        updated_at: record.updatedAt || new Date().toISOString(),
      })),
    ),
    client.from("inteligencia_360_settings").upsert(settingsPayload(state.settings), { onConflict: "id" }).then(({ error }: { error: unknown }) => {
      if (error) throw error;
    }),
  ]);

  await safeWriteRemoteAuditEvent({
    action: "inteligencia_360.sync",
    entity: "inteligencia_360",
    metadata: {
      weeklyTickets: state.weeklyTickets.length,
      prescriptions: state.prescriptions.length,
      receivables: state.receivables.length,
      actions: state.actions.length,
    },
  });
}

async function listCrmTable(table: string, orderColumn?: string) {
  const client = requireSupabase();
  let query = client.from(table).select("*");
  if (orderColumn) {
    query = query.order(orderColumn, { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function upsertCrmTable(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const client = requireSupabase();
  const { error } = await client.from(table).upsert(rows, { onConflict: "client_ref" });
  if (error) {
    // O erro do Supabase é um objeto simples: String() vira "[object Object]" e o
    // banner ficava mudo (bug da Aline, 03/08). Agora sobe legível e COM a tabela.
    const detalhe = [error.message, error.details, error.hint, error.code ? `código ${error.code}` : ""]
      .filter(Boolean)
      .join(" · ");
    throw new Error(`${table}: ${detalhe || "erro desconhecido"}`);
  }
}

export async function listRemoteCrmState(): Promise<CrmState> {
  const [contacts, deals, tasks, cadences, cadenceSteps, cadenceEnrollments, messageTemplates, touchpoints, timelineEvents] = await Promise.all([
    listCrmTable("crm_contacts", "created_at"),
    listCrmTable("crm_deals", "created_at"),
    listCrmTable("crm_tasks", "due_at"),
    listCrmTable("crm_cadences", "created_at"),
    listCrmTable("crm_cadence_steps", "step_order"),
    listCrmTable("crm_cadence_enrollments", "created_at"),
    listCrmTable("crm_message_templates", "created_at"),
    listCrmTable("crm_touchpoints", "sent_at"),
    listCrmTable("crm_timeline_events", "created_at"),
  ]);

  const mappedCadences = (cadences as any[]).map(
    (row): CrmCadence => ({
      id: remoteId(row, "crm-cadence"),
      name: remoteText(row.name),
      description: remoteText(row.description),
      cadenceType: row.cadence_type ?? "COMMERCIAL_FOLLOW_UP",
      defaultOwnerRole: row.default_owner_role ?? "ADMIN_GESTAO",
      active: row.active ?? true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );
  const mappedCadenceSteps = (cadenceSteps as any[]).map(
    (row): CrmCadenceStep => ({
      id: remoteId(row, "crm-step"),
      cadenceId: remoteText(row.cadence_id),
      stepOrder: remoteNumber(row.step_order),
      name: remoteText(row.name),
      offsetType: row.offset_type ?? "DAYS_AFTER_TRIGGER",
      offsetValue: remoteNumber(row.offset_value),
      preferredTimeWindow: row.preferred_time_window ?? "ANY",
      taskType: row.task_type ?? "WHATSAPP",
      assignedToRole: row.assigned_to_role ?? "ADMIN_GESTAO",
      messageTemplateId: row.message_template_id ?? "",
      required: row.required ?? true,
      pauseIfContactResponded: row.pause_if_contact_responded ?? true,
      cancelIfStageChanged: row.cancel_if_stage_changed ?? true,
      active: row.active ?? true,
    }),
  );
  const mappedMessageTemplates = (messageTemplates as any[]).map(
    (row): CrmMessageTemplate => ({
      id: remoteId(row, "crm-template"),
      name: remoteText(row.name),
      category: remoteText(row.category),
      roleOwner: row.role_owner ?? "ADMIN_GESTAO",
      cadenceType: row.cadence_type ?? "COMMERCIAL_FOLLOW_UP",
      channel: row.channel ?? "WHATSAPP",
      body: remoteText(row.body),
      variables: remoteStringArray(row.variables_json),
      active: row.active ?? true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );

  return {
    contacts: (contacts as any[]).map(
      (row): CrmContact => ({
        id: remoteId(row, "crm-contact"),
        contactType: row.contact_type ?? "LEAD",
        lifecycleStage: row.lifecycle_stage ?? "COLD_LEAD",
        fullName: remoteText(row.full_name),
        preferredName: remoteText(row.preferred_name),
        phone: remoteText(row.phone),
        whatsapp: remoteText(row.whatsapp),
        email: remoteText(row.email),
        instagram: remoteText(row.instagram),
        sourceChannel: remoteText(row.source_channel),
        acquisitionCampaign: remoteText(row.acquisition_campaign),
        leadTemperature: row.lead_temperature ?? "WARM",
        personaFit: row.persona_fit ?? "UNKNOWN",
        mainPain: remoteText(row.main_pain),
        mainGoal: remoteText(row.main_goal),
        ownerUserId: remoteText(row.owner_user_id),
        commercialOwnerId: remoteText(row.commercial_owner_id),
        conciergeOwnerId: remoteText(row.concierge_owner_id),
        nurseOwnerId: remoteText(row.nurse_owner_id),
        doctorId: remoteText(row.doctor_id),
        notes: remoteText(row.notes),
        createdBy: remoteText(row.created_by),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at ?? null,
        optOut: row.opt_out ?? false,
        referrerContactId: row.referrer_contact_id ?? null,
        marketingOptInEm: (row.marketing_opt_in_em as string | null) ?? null,
        marketingOptInCanal: (row.marketing_opt_in_canal as string | null) ?? null,
        referralRewardPaidAt: row.referral_reward_paid_at ?? null,
      }),
    ),
    deals: (deals as any[]).map(
      (row): CrmDeal => ({
        id: remoteId(row, "crm-deal"),
        contactId: remoteText(row.contact_id),
        title: remoteText(row.title),
        dealType: row.deal_type ?? "FIRST_CONSULTATION",
        stage: row.stage ?? "LEAD_NOVO",
        estimatedValue: remoteNumber(row.estimated_value),
        prescribedAmount: remoteNumber(row.prescribed_amount),
        soldAmount: remoteNumber(row.sold_amount),
        receivedAmount: remoteNumber(row.received_amount),
        probability: remoteNumber(row.probability),
        status: row.status ?? "OPEN",
        mainObjection: remoteText(row.main_objection),
        objectionCategory: row.objection_category ?? "OTHER",
        sourceChannel: remoteText(row.source_channel),
        ownerUserId: remoteText(row.owner_user_id),
        doctorId: remoteText(row.doctor_id),
        expectedCloseDate: row.expected_close_date ?? "",
        closedAt: row.closed_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        programPhase: row.program_phase ?? null,
        programPhaseEnteredAt: row.program_phase_entered_at ?? undefined,
        programPhaseActorId: row.program_phase_actor_id ?? undefined,
        programOutcome: row.program_outcome ?? null,
        adhesionChannel: row.adhesion_channel ?? null,
        programMilestonesDone: Array.isArray(row.program_milestones_done) ? (row.program_milestones_done as string[]) : [],
        receitaSncrEm: row.receita_sncr_em ?? null,
      }),
    ),
    tasks: (tasks as any[]).map(
      (row): CrmTask => ({
        id: remoteId(row, "crm-task"),
        contactId: remoteText(row.contact_id),
        dealId: remoteText(row.deal_id),
        cadenceId: remoteText(row.cadence_id),
        cadenceStepId: remoteText(row.cadence_step_id),
        title: remoteText(row.title),
        description: remoteText(row.description),
        taskType: row.task_type ?? "FOLLOW_UP",
        assignedToUserId: remoteText(row.assigned_to_user_id),
        assignedToRole: row.assigned_to_role ?? "ADMIN_GESTAO",
        // due_at pode ser NULL (tarefa "parada", sem prazo, ativa só quando houver
        // movimentação). null → "" para o motor tratar como sem prazo (nunca
        // atrasada). NÃO usar row.due_at direto: new Date(null) vira 1970 (falsa
        // atrasada).
        dueAt: remoteText(row.due_at),
        completedAt: row.completed_at ?? null,
        status: row.status ?? "PENDING",
        priority: row.priority ?? "MEDIUM",
        visibilityScope: row.visibility_scope ?? "ROLE",
        generatedBy: row.generated_by ?? "MANUAL",
        result: row.result ?? "",
        resultNotes: remoteText(row.result_notes),
        createdBy: remoteText(row.created_by),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isGate: row.is_gate ?? undefined,
        gatePhase: row.gate_phase ?? undefined,
      }),
    ),
    cadences: mappedCadences.length ? mappedCadences : seedCrmState.cadences,
    cadenceSteps: mappedCadenceSteps.length ? mappedCadenceSteps : seedCrmState.cadenceSteps,
    cadenceEnrollments: (cadenceEnrollments as any[]).map(
      (row): CrmCadenceEnrollment => ({
        id: remoteId(row, "crm-enrollment"),
        cadenceId: remoteText(row.cadence_id),
        contactId: remoteText(row.contact_id),
        dealId: remoteText(row.deal_id),
        status: row.status ?? "ACTIVE",
        enrolledAt: row.enrolled_at,
        triggerSource: remoteText(row.trigger_source),
        triggerDate: row.trigger_date,
        ownerUserId: remoteText(row.owner_user_id),
        ownerRole: row.owner_role ?? "ADMIN_GESTAO",
        completedAt: row.completed_at ?? null,
        canceledReason: remoteText(row.canceled_reason),
        notes: remoteText(row.notes),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ),
    messageTemplates: mappedMessageTemplates.length ? mappedMessageTemplates : seedCrmState.messageTemplates,
    touchpoints: (touchpoints as any[]).map(
      (row): CrmTouchpoint => ({
        id: remoteId(row, "crm-touch"),
        contactId: remoteText(row.contact_id),
        taskId: remoteText(row.task_id),
        cadenceId: remoteText(row.cadence_id),
        touchType: row.touch_type ?? "FOLLOW_UP",
        channel: row.channel ?? "WHATSAPP",
        sentByUserId: remoteText(row.sent_by_user_id),
        sentAt: row.sent_at,
        responseReceived: row.response_received ?? false,
        responseAt: row.response_at ?? null,
        responseSummary: remoteText(row.response_summary),
        sentiment: row.sentiment ?? "NEUTRAL",
        createdAt: row.created_at,
      }),
    ),
    timelineEvents: (timelineEvents as any[]).map(
      (row): CrmTimelineEvent => ({
        id: remoteId(row, "crm-timeline"),
        contactId: remoteText(row.contact_id),
        eventType: remoteText(row.event_type),
        eventTitle: remoteText(row.event_title),
        eventDescription: remoteText(row.event_description),
        sourceModule: row.source_module ?? "CRM",
        sourceId: remoteText(row.source_id),
        createdBy: remoteText(row.created_by),
        createdAt: row.created_at,
      }),
    ),
  };
}

export async function saveRemoteCrmState(state: CrmState, options?: { includeCatalog?: boolean; baseline?: CrmState }) {
  const now = new Date().toISOString();
  // Catálogo (cadências/passos/mensagens) tem RLS de gestão (can_crm_manage).
  // Quem não é coordenação pula essas tabelas: antes o sync inteiro morria
  // nelas e inscrições/tarefas (que vêm depois) nunca chegavam ao banco.
  const includeCatalog = options?.includeCatalog ?? true;
  // Sync por DIFERENÇA: com um baseline (último estado carregado), só sobem as
  // linhas que mudaram. Sem baseline, sobe tudo (primeira carga / retry).
  // Isso reduz muito o "um usuário reverte o trabalho do outro" (LWW).
  const pick = options?.baseline ? diffCrmStates(options.baseline, state) : state;

  await upsertCrmTable(
    "crm_contacts",
    pick.contacts.map((record) => ({
      client_ref: record.id,
      contact_type: record.contactType,
      lifecycle_stage: record.lifecycleStage,
      full_name: record.fullName,
      preferred_name: record.preferredName || null,
      phone: record.phone || null,
      whatsapp: record.whatsapp || null,
      email: record.email || null,
      instagram: record.instagram || null,
      source_channel: record.sourceChannel || null,
      acquisition_campaign: record.acquisitionCampaign || null,
      lead_temperature: record.leadTemperature,
      persona_fit: record.personaFit,
      main_pain: record.mainPain || null,
      main_goal: record.mainGoal || null,
      owner_user_id: record.ownerUserId || null,
      commercial_owner_id: record.commercialOwnerId || null,
      concierge_owner_id: record.conciergeOwnerId || null,
      nurse_owner_id: record.nurseOwnerId || null,
      doctor_id: record.doctorId || null,
      notes: record.notes || null,
      opt_out: record.optOut ?? false,
      created_by: record.createdBy || null,
      created_at: record.createdAt || now,
      updated_at: record.updatedAt || now,
      archived_at: record.archivedAt || null,
      referrer_contact_id: record.referrerContactId ?? null,
      marketing_opt_in_em: record.marketingOptInEm ?? null,
      marketing_opt_in_canal: record.marketingOptInCanal ?? null,
      referral_reward_paid_at: record.referralRewardPaidAt ?? null,
    })),
  );

  if (includeCatalog) {
  // Catálogo NUNCA vai por diff: o mergeCrmCatalogWithSeeds injeta os seeds no
  // baseline, o diff acha que nada mudou e a cadência nova jamais chega ao
  // banco — aí a FK de crm_cadence_enrollments derruba o save de quem não é
  // coordenação (bug da Aline, 03/08). São ~100 linhas: sobe tudo, sempre.
  await upsertCrmTable(
    "crm_cadences",
    state.cadences.map((record) => ({
      client_ref: record.id,
      name: record.name,
      description: record.description || null,
      cadence_type: record.cadenceType,
      default_owner_role: record.defaultOwnerRole,
      active: record.active,
      created_at: record.createdAt || now,
      updated_at: record.updatedAt || now,
    })),
  );

  await upsertCrmTable(
    "crm_cadence_steps",
    state.cadenceSteps.map((record) => ({
      client_ref: record.id,
      cadence_id: record.cadenceId,
      step_order: record.stepOrder,
      name: record.name,
      offset_type: record.offsetType,
      offset_value: record.offsetValue,
      preferred_time_window: record.preferredTimeWindow,
      task_type: record.taskType,
      assigned_to_role: record.assignedToRole,
      message_template_id: record.messageTemplateId || null,
      required: record.required,
      pause_if_contact_responded: record.pauseIfContactResponded,
      cancel_if_stage_changed: record.cancelIfStageChanged,
      active: record.active,
    })),
  );

  await upsertCrmTable(
    "crm_message_templates",
    state.messageTemplates.map((record) => ({
      client_ref: record.id,
      name: record.name,
      category: record.category || null,
      role_owner: record.roleOwner,
      cadence_type: record.cadenceType,
      channel: record.channel,
      body: record.body,
      variables_json: record.variables,
      active: record.active,
      created_at: record.createdAt || now,
      updated_at: record.updatedAt || now,
    })),
  );
  }

  // ORDEM IMPORTA (19/08/2026): o banco garante UMA jornada aberta por paciente
  // (crm_deals_one_active_journey) e confere linha a linha DENTRO do mesmo
  // comando. Se a jornada nova entrar antes de a antiga ser encerrada, a trava
  // dispara mesmo com o encerramento logo atrás no lote. Então: primeiro as
  // linhas que ENCERRAM/não têm jornada, depois as que ABREM jornada.
  const dealsOrdenados = [...pick.deals].sort((a, b) => {
    const abre = (record: (typeof pick.deals)[number]) => (record.programPhase && !record.programOutcome ? 1 : 0);
    return abre(a) - abre(b);
  });
  await upsertCrmTable(
    "crm_deals",
    dealsOrdenados.map((record) => ({
      client_ref: record.id,
      contact_id: record.contactId,
      title: record.title,
      deal_type: record.dealType,
      stage: record.stage,
      estimated_value: record.estimatedValue,
      prescribed_amount: record.prescribedAmount,
      sold_amount: record.soldAmount,
      received_amount: record.receivedAmount,
      probability: record.probability,
      status: record.status,
      main_objection: record.mainObjection || null,
      objection_category: record.objectionCategory,
      source_channel: record.sourceChannel || null,
      owner_user_id: record.ownerUserId || null,
      doctor_id: record.doctorId || null,
      expected_close_date: dateOrNull(record.expectedCloseDate),
      closed_at: record.closedAt || null,
      created_at: record.createdAt || now,
      updated_at: record.updatedAt || now,
      program_phase: record.programPhase ?? null,
      program_phase_entered_at: record.programPhaseEnteredAt || null,
      program_phase_actor_id: record.programPhaseActorId || null,
      program_outcome: record.programOutcome ?? null,
      adhesion_channel: record.adhesionChannel ?? null,
      program_milestones_done: record.programMilestonesDone ?? [],
      receita_sncr_em: record.receitaSncrEm ?? null,
    })),
  );

  await upsertCrmTable(
    "crm_cadence_enrollments",
    pick.cadenceEnrollments.map((record) => ({
      client_ref: record.id,
      cadence_id: record.cadenceId,
      contact_id: record.contactId,
      deal_id: record.dealId || null,
      status: record.status,
      enrolled_at: record.enrolledAt || now,
      trigger_source: record.triggerSource || null,
      trigger_date: record.triggerDate,
      owner_user_id: record.ownerUserId || null,
      owner_role: record.ownerRole,
      completed_at: record.completedAt || null,
      canceled_reason: record.canceledReason || null,
      notes: record.notes || null,
      created_at: record.createdAt || now,
      updated_at: record.updatedAt || now,
    })),
  );

  await upsertCrmTable(
    "crm_tasks",
    pick.tasks.map((record) => ({
      client_ref: record.id,
      contact_id: record.contactId || null,
      deal_id: record.dealId || null,
      cadence_id: record.cadenceId || null,
      cadence_step_id: record.cadenceStepId || null,
      title: record.title,
      description: record.description || null,
      task_type: record.taskType,
      assigned_to_user_id: record.assignedToUserId || null,
      assigned_to_role: record.assignedToRole,
      // "" → NULL: tarefa sem prazo (parada). Enviar "" para timestamptz falharia.
      due_at: record.dueAt || null,
      completed_at: record.completedAt || null,
      status: record.status,
      priority: record.priority,
      visibility_scope: record.visibilityScope,
      generated_by: record.generatedBy,
      result: record.result || null,
      result_notes: record.resultNotes || null,
      created_by: record.createdBy || null,
      created_at: record.createdAt || now,
      updated_at: record.updatedAt || now,
      is_gate: record.isGate ?? false,
      gate_phase: record.gatePhase ?? null,
    })),
  );

  await upsertCrmTable(
    "crm_touchpoints",
    pick.touchpoints.map((record) => ({
      client_ref: record.id,
      contact_id: record.contactId,
      task_id: record.taskId || null,
      cadence_id: record.cadenceId || null,
      touch_type: record.touchType,
      channel: record.channel,
      sent_by_user_id: record.sentByUserId || null,
      sent_at: record.sentAt || now,
      response_received: record.responseReceived,
      response_at: record.responseAt || null,
      response_summary: record.responseSummary || null,
      sentiment: record.sentiment,
      created_at: record.createdAt || now,
    })),
  );

  await upsertCrmTable(
    "crm_timeline_events",
    pick.timelineEvents.map((record) => ({
      client_ref: record.id,
      contact_id: record.contactId,
      event_type: record.eventType,
      event_title: record.eventTitle,
      event_description: record.eventDescription || null,
      source_module: record.sourceModule,
      source_id: record.sourceId || null,
      created_by: record.createdBy || null,
      created_at: record.createdAt || now,
    })),
  );

  await safeWriteRemoteAuditEvent({
    action: "crm.sync",
    entity: "crm",
    metadata: {
      contacts: state.contacts.length,
      deals: state.deals.length,
      tasks: state.tasks.length,
      touchpoints: state.touchpoints.length,
    },
  });
}



export async function listRemoteFinCategories(): Promise<FinCategory[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_categories")
    .select("client_ref, group_key, name, sort_order, is_capex, active")
    .eq("active", true)
    .order("group_key")
    .order("sort_order");

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    groupKey: row.group_key as FinCategory["groupKey"],
    name: String(row.name),
    sortOrder: Number(row.sort_order ?? 0),
    isCapex: Boolean(row.is_capex),
    active: Boolean(row.active),
  }));
}

export async function listRemoteFinPurchases(year: number): Promise<FinPurchase[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_purchases")
    .select("client_ref, purchase_date, description, supplier, amount, method, card, installments, nf_note, delivery_eta, received_at, expense_ref, notes, estoque_setor, created_at")
    .gte("purchase_date", `${year}-01-01`)
    .lte("purchase_date", `${year}-12-31`)
    .is("deleted_at", null)
    .order("purchase_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    purchaseDate: String(row.purchase_date),
    description: String(row.description ?? ""),
    supplier: String(row.supplier ?? ""),
    amount: Number(row.amount ?? 0),
    method: row.method as FinPurchase["method"],
    card: (row.card as FinPurchase["card"]) ?? null,
    installments: Number(row.installments ?? 1),
    nfNote: String(row.nf_note ?? ""),
    deliveryEta: (row.delivery_eta as string | null) ?? null,
    receivedAt: (row.received_at as string | null) ?? null,
    expenseRef: (row.expense_ref as string | null) ?? null,
    notes: String(row.notes ?? ""),
    estoqueSetor: (row.estoque_setor as FinPurchase["estoqueSetor"]) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }));
}

export async function createRemoteFinPurchase(purchase: FinPurchase, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_purchases").insert({
    client_ref: purchase.id,
    purchase_date: purchase.purchaseDate,
    description: purchase.description,
    supplier: purchase.supplier,
    amount: purchase.amount,
    method: purchase.method,
    card: purchase.card,
    installments: purchase.installments,
    nf_note: purchase.nfNote,
    delivery_eta: purchase.deliveryEta,
    received_at: purchase.receivedAt,
    expense_ref: purchase.expenseRef,
    notes: purchase.notes,
    estoque_setor: purchase.estoqueSetor ?? null,
    created_by: uuidOrNull(createdBy),
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.compra.registrar",
    entity: "fin_purchases",
    entityId: purchase.id,
    metadata: { purchaseDate: purchase.purchaseDate, amount: purchase.amount, method: purchase.method },
  });
}

export async function updateRemoteFinPurchase(purchase: FinPurchase) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_purchases")
    .update({
      purchase_date: purchase.purchaseDate,
      description: purchase.description,
      supplier: purchase.supplier,
      amount: purchase.amount,
      method: purchase.method,
      card: purchase.card,
      installments: purchase.installments,
      nf_note: purchase.nfNote,
      delivery_eta: purchase.deliveryEta,
      received_at: purchase.receivedAt,
      expense_ref: purchase.expenseRef,
      notes: purchase.notes,
      estoque_setor: purchase.estoqueSetor ?? null,
    })
    .eq("client_ref", purchase.id);
  if (error) throw error;
}

export async function deleteRemoteFinPurchase(purchaseRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_purchases").update({ deleted_at: new Date().toISOString() }).eq("client_ref", purchaseRef);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "financeiro.compra.excluir", entity: "fin_purchases", entityId: purchaseRef });
}

export type FinPdcaMark = { saleRef: string; status: "NAO_ADERIU" | "ADERIU_MANUAL"; objection: string };

export async function listRemoteFinPdcaMarks(): Promise<FinPdcaMark[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("fin_pdca_status").select("sale_ref, status, objection");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    saleRef: String(row.sale_ref),
    status: row.status as FinPdcaMark["status"],
    objection: String(row.objection ?? ""),
  }));
}

export async function saveRemoteFinPdcaMark(mark: FinPdcaMark) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_pdca_status")
    .upsert({ sale_ref: mark.saleRef, status: mark.status, objection: mark.objection }, { onConflict: "sale_ref" });
  if (error) throw error;
}

export async function deleteRemoteFinPdcaMark(saleRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_pdca_status").delete().eq("sale_ref", saleRef);
  if (error) throw error;
}

export async function loadRemoteFinMetasConfig(): Promise<Record<string, unknown> | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("fin_metas_config").select("config").eq("id", true).maybeSingle();
  if (error) throw error;
  return (data?.config as Record<string, unknown>) ?? null;
}

export async function saveRemoteFinMetasConfig(config: Record<string, unknown>) {
  const client = requireSupabase();
  const { error } = await client.from("fin_metas_config").upsert({ id: true, config }, { onConflict: "id" });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "financeiro.metas.configurar", entity: "fin_metas_config", metadata: {} });
}

// ---- Lucro Inteligente (01/09/2026): degraus de percentual + marca diária ----
export async function loadRemoteFinLucroConfig(): Promise<Record<string, unknown> | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("fin_lucro_config").select("config").eq("id", true).maybeSingle();
  if (error) throw error;
  return (data?.config as Record<string, unknown>) ?? null;
}

export async function saveRemoteFinLucroConfig(config: Record<string, unknown>) {
  const client = requireSupabase();
  const { error } = await client.from("fin_lucro_config").upsert({ id: true, config }, { onConflict: "id" });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "financeiro.lucro.configurar", entity: "fin_lucro_config", metadata: {} });
}

export type FinLucroDiaRemote = { dia: string; separado: boolean; observacao: string; updatedAt?: string };

export async function listRemoteFinLucroDias(year: number): Promise<FinLucroDiaRemote[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_lucro_dia")
    .select("dia, separado, observacao, updated_at")
    .gte("dia", `${year}-01-01`)
    .lte("dia", `${year}-12-31`);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    dia: String(row.dia),
    separado: Boolean(row.separado),
    observacao: String(row.observacao ?? ""),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }));
}

export async function saveRemoteFinLucroDia(marca: FinLucroDiaRemote, updatedBy?: string | null) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_lucro_dia")
    .upsert({ dia: marca.dia, separado: marca.separado, observacao: marca.observacao, updated_by: updatedBy ?? null }, { onConflict: "dia" });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.lucro.marcar_dia",
    entity: "fin_lucro_dia",
    entityId: marca.dia,
    metadata: { separado: marca.separado },
  });
}

// ---- Coordenador de Vendas · PDCA e Plano de Ação por mês (08/09/2026) ---------
export async function loadRemoteCrmCoordenadorMes(monthKey: string): Promise<Record<string, unknown> | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("crm_coordenador_mes").select("dados").eq("month_key", monthKey).maybeSingle();
  if (error) throw error;
  return (data?.dados as Record<string, unknown>) ?? null;
}

export async function saveRemoteCrmCoordenadorMes(monthKey: string, dados: Record<string, unknown>, updatedBy?: string | null) {
  const client = requireSupabase();
  const { error } = await client
    .from("crm_coordenador_mes")
    .upsert({ month_key: monthKey, dados, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() }, { onConflict: "month_key" });
  if (error) throw error;
}

// ---- Check-in semanal · a tabela que o Estevão preenche (21/09/2026) -----------
// A chave é a SEXTA que abre a semana (AAAA-MM-DD). Só as linhas digitadas e a
// meta base são gravadas: faturamento, ticket, conversão e meta acumulada saem
// derivados no app, porque número derivado que se grava congela e passa a
// mentir assim que a régua muda.
export async function loadRemoteCrmCheckinSemana(sextaISO: string): Promise<Record<string, unknown> | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("crm_checkin_semana").select("dados").eq("semana_inicio", sextaISO).maybeSingle();
  if (error) throw error;
  return (data?.dados as Record<string, unknown>) ?? null;
}

export async function saveRemoteCrmCheckinSemana(sextaISO: string, dados: Record<string, unknown>, updatedBy?: string | null) {
  const client = requireSupabase();
  const { error } = await client
    .from("crm_checkin_semana")
    .upsert({ semana_inicio: sextaISO, dados, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() }, { onConflict: "semana_inicio" });
  if (error) throw error;
}

// ---- Lucro Inteligente · resumo público (08/09/2026) ----------------------------
// Qualquer pessoa logada lê; só o financeiro grava (a tela do Lucro publica).
export type FinLucroPublicoRemote = {
  monthKey: string;
  diaRef: string;
  entrouLiquido: number;
  cabeGastar: number;
  contasPagas: number;
  sobra: number;
  lucroHoje: number;
  lucroMes: number;
  lucroMeta: number;
  medicoHoje: number;
  medicoMes: number;
  metaDia: number;
  feitoHoje: number;
  feitoMes: number;
  metaMes: number;
  diaComDoutor: boolean;
  atualizadoEm: string;
};

export async function loadRemoteFinLucroPublico(monthKey: string): Promise<FinLucroPublicoRemote | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("fin_lucro_publico").select("*").eq("month_key", monthKey).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const num = (chave: string) => Number(row[chave] ?? 0) || 0;
  return {
    monthKey: String(row.month_key),
    diaRef: String(row.dia_ref),
    entrouLiquido: num("entrou_liquido"),
    cabeGastar: num("cabe_gastar"),
    contasPagas: num("contas_pagas"),
    sobra: num("sobra"),
    lucroHoje: num("lucro_hoje"),
    lucroMes: num("lucro_mes"),
    lucroMeta: num("lucro_meta"),
    medicoHoje: num("medico_hoje"),
    medicoMes: num("medico_mes"),
    metaDia: num("meta_dia"),
    feitoHoje: num("feito_hoje"),
    feitoMes: num("feito_mes"),
    metaMes: num("meta_mes"),
    diaComDoutor: Boolean(row.dia_com_doutor),
    atualizadoEm: String(row.atualizado_em ?? ""),
  };
}

export async function saveRemoteFinLucroPublico(resumo: Omit<FinLucroPublicoRemote, "atualizadoEm">, atualizadoPor?: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_lucro_publico").upsert(
    {
      month_key: resumo.monthKey,
      dia_ref: resumo.diaRef,
      entrou_liquido: resumo.entrouLiquido,
      cabe_gastar: resumo.cabeGastar,
      contas_pagas: resumo.contasPagas,
      sobra: resumo.sobra,
      lucro_hoje: resumo.lucroHoje,
      lucro_mes: resumo.lucroMes,
      lucro_meta: resumo.lucroMeta,
      medico_hoje: resumo.medicoHoje,
      medico_mes: resumo.medicoMes,
      meta_dia: resumo.metaDia,
      feito_hoje: resumo.feitoHoje,
      feito_mes: resumo.feitoMes,
      meta_mes: resumo.metaMes,
      dia_com_doutor: resumo.diaComDoutor,
      atualizado_em: new Date().toISOString(),
      atualizado_por: atualizadoPor ?? null,
    },
    { onConflict: "month_key" },
  );
  if (error) throw error;
}

export async function listRemoteFinSales(year: number): Promise<FinSale[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_sales")
    .select("client_ref, sale_date, patient_name, crm_contact_ref, notes, adhesion, created_at, tipo_atendimento, plano_ou_avulsa, origem_indicacao, nota_instrucao, nota_quando, consulta_agendada_em, lancado_por_setor, aguardando_explicacao, fin_sale_items(client_ref, item_type, amount, description), fin_sale_payments(client_ref, method, amount, installments, card_machine, comprovante_status, comprovante_ref)")
    .gte("sale_date", `${year}-01-01`)
    .lte("sale_date", `${year}-12-31`)
    .is("deleted_at", null)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Record<string, any>[]).map((row) => ({
    id: String(row.client_ref),
    saleDate: String(row.sale_date),
    patientName: String(row.patient_name ?? ""),
    crmContactRef: String(row.crm_contact_ref ?? ""),
    notes: String(row.notes ?? ""),
    // A adesão é da COMANDA (fin_sales) — o SELECT já a traz. Faltava mapear aqui:
    // sem isto, todo refetch trazia adhesion=undefined, o estado local era
    // sobrescrito e ao reeditar a comanda a adesão marcada virava "ABERTO".
    adhesion: (row.adhesion as FinSale["adhesion"]) ?? "ABERTO",
    createdAt: String(row.created_at ?? ""),
    // Entrada Única (14/08/2026).
    tipoAtendimento: (row.tipo_atendimento as FinSale["tipoAtendimento"]) ?? null,
    planoOuAvulsa: (row.plano_ou_avulsa as FinSale["planoOuAvulsa"]) ?? null,
    origemIndicacao: String(row.origem_indicacao ?? ""),
    notaInstrucao: String(row.nota_instrucao ?? ""),
    notaQuando: (row.nota_quando as FinSale["notaQuando"]) ?? null,
    consultaAgendadaEm: row.consulta_agendada_em ? String(row.consulta_agendada_em).slice(0, 10) : null,
    lancadoPorSetor: (row.lancado_por_setor as FinSale["lancadoPorSetor"]) ?? null,
    aguardandoExplicacao: Boolean(row.aguardando_explicacao),
    items: ((row.fin_sale_items ?? []) as Record<string, unknown>[]).map((item) => ({
      id: String(item.client_ref),
      itemType: item.item_type as FinSale["items"][number]["itemType"],
      amount: Number(item.amount ?? 0),
      description: String(item.description ?? ""),
    })),
    payments: ((row.fin_sale_payments ?? []) as Record<string, unknown>[]).map((payment) => ({
      id: String(payment.client_ref),
      method: payment.method as FinSale["payments"][number]["method"],
      amount: Number(payment.amount ?? 0),
      installments: Number(payment.installments ?? 1),
      cardMachine: (payment.card_machine as FinSale["payments"][number]["cardMachine"]) ?? null,
      comprovanteStatus: (payment.comprovante_status as FinSale["payments"][number]["comprovanteStatus"]) ?? "PENDENTE",
      comprovanteRef: payment.comprovante_ref ? String(payment.comprovante_ref) : null,
    })),
  }));
}

/**
 * Registro da distribuição de UMA entrada única (reunião de 14/08/2026).
 * Guarda o que foi alimentado — serve de prova ("um clique e a gente já coloca
 * todos funcionando") e de idempotência: repetir o lançamento não cria em dobro.
 */
export async function registrarEntradaUnica(values: {
  clientRef: string;
  saleRef: string | null;
  crmContactRef: string | null;
  crmDealRef: string | null;
  comprovanteId: string | null;
  cadenciaId: string | null;
  payload: Record<string, unknown>;
  destinos: string[];
  lancadoPor: string | null;
  setor: "VENDAS" | "AGENDAMENTO" | "RECEPCAO";
}) {
  const client = requireSupabase();
  const { error } = await client.from("fin_entrada_unica").upsert(
    {
      client_ref: values.clientRef,
      sale_ref: values.saleRef,
      crm_contact_ref: values.crmContactRef,
      crm_deal_ref: values.crmDealRef,
      comprovante_id: values.comprovanteId,
      cadencia_id: values.cadenciaId,
      payload: values.payload,
      destinos: values.destinos,
      lancado_por: uuidOrNull(values.lancadoPor),
      setor: values.setor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_ref" },
  );
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.entrada_unica.lancar",
    entity: "fin_entrada_unica",
    entityId: values.clientRef,
    metadata: { destinos: values.destinos, setor: values.setor, comanda: values.saleRef },
  });
}

export async function createRemoteFinSale(sale: FinSale, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_sales").insert({
    client_ref: sale.id,
    sale_date: sale.saleDate,
    patient_name: sale.patientName,
    crm_contact_ref: sale.crmContactRef || null,
    notes: sale.notes,
    adhesion: sale.adhesion ?? "ABERTO",
    // Entrada Única (14/08/2026): o "caminho das pedras" viaja com a comanda.
    tipo_atendimento: sale.tipoAtendimento ?? null,
    plano_ou_avulsa: sale.planoOuAvulsa ?? null,
    origem_indicacao: sale.origemIndicacao || null,
    nota_instrucao: sale.notaInstrucao || null,
    nota_quando: sale.notaQuando ?? null,
    consulta_agendada_em: sale.consultaAgendadaEm || null,
    lancado_por_setor: sale.lancadoPorSetor ?? null,
    aguardando_explicacao: sale.aguardandoExplicacao ?? false,
    created_by: uuidOrNull(createdBy),
  });
  if (error) throw error;

  if (sale.items.length) {
    const { error: itemsError } = await client.from("fin_sale_items").insert(
      sale.items.map((item) => ({
        client_ref: item.id,
        sale_ref: sale.id,
        item_type: item.itemType,
        amount: item.amount,
        description: item.description,
      })),
    );
    if (itemsError) throw itemsError;
  }

  if (sale.payments.length) {
    const { error: paymentsError } = await client.from("fin_sale_payments").insert(
      sale.payments.map((payment) => ({
        client_ref: payment.id,
        sale_ref: sale.id,
        method: payment.method,
        amount: payment.amount,
        installments: payment.installments,
        card_machine: payment.cardMachine ?? null,
        comprovante_status: payment.comprovanteStatus ?? (payment.method === "DINHEIRO" ? "NAO_SE_APLICA" : "PENDENTE"),
        comprovante_ref: payment.comprovanteRef ?? null,
      })),
    );
    if (paymentsError) throw paymentsError;
  }

  await safeWriteRemoteAuditEvent({
    action: "financeiro.venda.lancar",
    entity: "fin_sales",
    metadata: { saleDate: sale.saleDate, items: sale.items.length, total: sale.items.reduce((sum, item) => sum + item.amount, 0) },
  });
}

export async function updateRemoteFinSale(sale: FinSale) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_sales")
    .update({
      sale_date: sale.saleDate,
      patient_name: sale.patientName,
      crm_contact_ref: sale.crmContactRef || null,
      notes: sale.notes,
      adhesion: sale.adhesion ?? "ABERTO",
    })
    .eq("client_ref", sale.id);
  if (error) throw error;

  const { error: clearItemsError } = await client.from("fin_sale_items").delete().eq("sale_ref", sale.id);
  if (clearItemsError) throw clearItemsError;
  const { error: clearPaymentsError } = await client.from("fin_sale_payments").delete().eq("sale_ref", sale.id);
  if (clearPaymentsError) throw clearPaymentsError;

  if (sale.items.length) {
    const { error: itemsError } = await client.from("fin_sale_items").insert(
      sale.items.map((item) => ({
        client_ref: item.id,
        sale_ref: sale.id,
        item_type: item.itemType,
        amount: item.amount,
        description: item.description,
      })),
    );
    if (itemsError) throw itemsError;
  }

  if (sale.payments.length) {
    const { error: paymentsError } = await client.from("fin_sale_payments").insert(
      sale.payments.map((payment) => ({
        client_ref: payment.id,
        sale_ref: sale.id,
        method: payment.method,
        amount: payment.amount,
        installments: payment.installments,
        card_machine: payment.cardMachine ?? null,
      })),
    );
    if (paymentsError) throw paymentsError;
  }

  await safeWriteRemoteAuditEvent({
    action: "financeiro.venda.editar",
    entity: "fin_sales",
    entityId: sale.id,
    metadata: { saleDate: sale.saleDate, items: sale.items.length, total: sale.items.reduce((sum, item) => sum + item.amount, 0) },
  });
}

export async function deleteRemoteFinSale(saleRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_sales").update({ deleted_at: new Date().toISOString() }).eq("client_ref", saleRef);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "financeiro.venda.excluir", entity: "fin_sales", entityId: saleRef });
}

export async function listRemoteFinExpenses(year: number): Promise<FinExpense[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_expenses")
    .select("client_ref, description, category_ref, amount, due_date, paid_at, method, supplier, installment_num, installment_total, document_note, is_capex, notes, created_at, recurrence, nota_status, aprovacao_status, aprovacao_por, aprovacao_em, aprovacao_nota")
    .gte("due_date", `${year}-01-01`)
    .lte("due_date", `${year}-12-31`)
    .is("deleted_at", null)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    description: String(row.description ?? ""),
    categoryRef: String(row.category_ref ?? ""),
    amount: Number(row.amount ?? 0),
    dueDate: String(row.due_date),
    paidAt: (row.paid_at as string | null) ?? null,
    method: (row.method as FinExpense["method"]) ?? null,
    supplier: String(row.supplier ?? ""),
    installmentNum: row.installment_num == null ? null : Number(row.installment_num),
    installmentTotal: row.installment_total == null ? null : Number(row.installment_total),
    documentNote: String(row.document_note ?? ""),
    isCapex: Boolean(row.is_capex),
    notaStatus: (row.nota_status as FinExpense["notaStatus"]) ?? "PENDENTE",
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? ""),
    recorrencia: (row.recurrence as FinExpense["recorrencia"]) ?? null,
    aprovacaoStatus: (row.aprovacao_status as FinExpense["aprovacaoStatus"]) ?? null,
    aprovacaoPor: (row.aprovacao_por as string | null) ?? null,
    aprovacaoEm: (row.aprovacao_em as string | null) ?? null,
    aprovacaoNota: (row.aprovacao_nota as string | null) ?? null,
  }));
}

export async function createRemoteFinExpense(expense: FinExpense, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_expenses").insert({
    client_ref: expense.id,
    description: expense.description,
    category_ref: expense.categoryRef,
    amount: expense.amount,
    due_date: expense.dueDate,
    paid_at: expense.paidAt,
    method: expense.method,
    supplier: expense.supplier,
    installment_num: expense.installmentNum,
    installment_total: expense.installmentTotal,
    document_note: expense.documentNote,
    is_capex: expense.isCapex,
    notes: expense.notes,
    recurrence: expense.recorrencia ?? null,
    created_by: uuidOrNull(createdBy),
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.despesa.lancar",
    entity: "fin_expenses",
    entityId: expense.id,
    metadata: { category: expense.categoryRef, amount: expense.amount, dueDate: expense.dueDate },
  });
}

// Tempo real do CRM: assina mudanças nas tabelas-chave e avisa o chamador.
// Postgres Changes respeita as RLS existentes; para o tamanho da equipe é a
// opção recomendada quando a integridade do dado importa (docs Supabase 2026).
export function subscribeRemoteCrmState(onChange: () => void): () => void {
  const client = requireSupabase();
  const channel = client
    .channel("crm-stream")
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_deals" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_tasks" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_cadence_enrollments" }, onChange)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

// Materialização de recorrentes: insere ignorando client_refs que já existem
// (inclusive cópias apagadas/soft-deleted — assim uma cópia excluída não renasce).
export async function createRemoteFinExpensesIgnoreDuplicates(expenses: FinExpense[], createdBy: string | null) {
  if (!expenses.length) return;
  const client = requireSupabase();
  const { error } = await client.from("fin_expenses").upsert(
    expenses.map((expense) => ({
      client_ref: expense.id,
      description: expense.description,
      category_ref: expense.categoryRef,
      amount: expense.amount,
      due_date: expense.dueDate,
      paid_at: expense.paidAt,
      method: expense.method,
      supplier: expense.supplier,
      installment_num: expense.installmentNum,
      installment_total: expense.installmentTotal,
      document_note: expense.documentNote,
      is_capex: expense.isCapex,
      nota_status: expense.notaStatus ?? "PENDENTE",
    aprovacao_status: expense.aprovacaoStatus ?? null,
    aprovacao_por: uuidOrNull(expense.aprovacaoPor ?? null),
    aprovacao_em: expense.aprovacaoEm ?? null,
    aprovacao_nota: expense.aprovacaoNota ?? null,
      notes: expense.notes,
      recurrence: expense.recorrencia ?? null,
      created_by: uuidOrNull(createdBy),
    })),
    { onConflict: "client_ref", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function markRemoteFinExpensePaid(expenseRef: string, paidAt: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_expenses").update({ paid_at: paidAt }).eq("client_ref", expenseRef);
  if (error) throw error;
}

export async function updateRemoteFinExpense(expense: FinExpense) {
  const client = requireSupabase();
  const { error } = await client
    .from("fin_expenses")
    .update({
      description: expense.description,
      category_ref: expense.categoryRef,
      amount: expense.amount,
      due_date: expense.dueDate,
      paid_at: expense.paidAt,
      method: expense.method,
      supplier: expense.supplier,
      installment_num: expense.installmentNum,
      installment_total: expense.installmentTotal,
      document_note: expense.documentNote,
      is_capex: expense.isCapex,
      notes: expense.notes,
      recurrence: expense.recorrencia ?? null,
      aprovacao_status: expense.aprovacaoStatus ?? null,
      aprovacao_por: uuidOrNull(expense.aprovacaoPor ?? null),
      aprovacao_em: expense.aprovacaoEm ?? null,
      aprovacao_nota: expense.aprovacaoNota ?? null,
    })
    .eq("client_ref", expense.id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.despesa.editar",
    entity: "fin_expenses",
    entityId: expense.id,
    metadata: { amount: expense.amount, dueDate: expense.dueDate },
  });
}

export async function deleteRemoteFinExpense(expenseRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_expenses").update({ deleted_at: new Date().toISOString() }).eq("client_ref", expenseRef);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "financeiro.despesa.excluir", entity: "fin_expenses", entityId: expenseRef });
}

export async function listRemoteFinReconciliations(year: number): Promise<FinReconciliation[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_reconciliations")
    .select("client_ref, day, expected_pix, expected_card_itau, expected_card_safra, expected_card_outra, expected_dinheiro, fee_itau, fee_safra, status, divergence_note, confirmed_at, counted_dinheiro, counted_card, counted_pix")
    .gte("day", `${year}-01-01`)
    .lte("day", `${year}-12-31`);

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    day: String(row.day),
    expectedPix: Number(row.expected_pix ?? 0),
    expectedCardItau: Number(row.expected_card_itau ?? 0),
    expectedCardSafra: Number(row.expected_card_safra ?? 0),
    expectedCardOutra: Number(row.expected_card_outra ?? 0),
    expectedDinheiro: Number(row.expected_dinheiro ?? 0),
    countedDinheiro: row.counted_dinheiro === null || row.counted_dinheiro === undefined ? null : Number(row.counted_dinheiro),
    countedCard: row.counted_card === null || row.counted_card === undefined ? null : Number(row.counted_card),
    countedPix: row.counted_pix === null || row.counted_pix === undefined ? null : Number(row.counted_pix),
    feeItau: Number(row.fee_itau ?? 0),
    feeSafra: Number(row.fee_safra ?? 0),
    status: row.status as FinReconciliation["status"],
    divergenceNote: String(row.divergence_note ?? ""),
    confirmedAt: (row.confirmed_at as string | null) ?? null,
  }));
}

export async function upsertRemoteFinReconciliation(record: FinReconciliation, confirmedBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_reconciliations").upsert(
    {
      client_ref: record.id,
      day: record.day,
      expected_pix: record.expectedPix,
      expected_card_itau: record.expectedCardItau,
      expected_card_safra: record.expectedCardSafra,
      expected_card_outra: record.expectedCardOutra,
      expected_dinheiro: record.expectedDinheiro,
      counted_dinheiro: record.countedDinheiro ?? null,
      counted_card: record.countedCard ?? null,
      counted_pix: record.countedPix ?? null,
      fee_itau: record.feeItau,
      fee_safra: record.feeSafra,
      status: record.status,
      divergence_note: record.divergenceNote,
      confirmed_by: uuidOrNull(confirmedBy),
      confirmed_at: record.confirmedAt,
    },
    { onConflict: "client_ref" },
  );
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.fechamento.salvar",
    entity: "fin_reconciliations",
    entityId: record.id,
    metadata: { day: record.day, status: record.status, feeItau: record.feeItau, feeSafra: record.feeSafra },
  });
}


// ---------------------------------------------------------------------------
// A camada de dados foi quebrada por domínio em 16/09/2026 (proposta 7.4).
// Este arquivo continua sendo a porta de entrada: nenhum import do app mudou.
// ---------------------------------------------------------------------------
export * from "./remote/marketing";
export * from "./remote/gamificacao";
export * from "./remote/estoque";
export * from "./remote/extrato";
export * from "./remote/crediario";
export * from "./remote/gestaoMensal";
export * from "./remote/estalecas";
export * from "./remote/nps";
export * from "./remote/notaFiscalConta";
export * from "./remote/caixaDeEntrada";
export * from "./remote/ia";
export * from "./remote/configuracoes";
export * from "./remote/rotinaDiaria";
export * from "./remote/integracoes";
export * from "./remote/compliance";
export * from "./remote/portalPaciente";
