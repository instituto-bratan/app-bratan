import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/localStore";
import { prepareSharePointDispatch, sharePointTargetFolder, type SharePointDispatchStatus, type SharePointModule } from "@/lib/sharepoint";
import type { ChecklistItem } from "@/features/checklist/checklistData";
import type { Aviso } from "@/features/mural/muralData";
import type { ComprovanteRecord } from "@/features/comprovantes/comprovantesData";
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
import type { FinCategory, FinExpense, FinInvoice, FinPartnerEntry, FinProvisionRule, FinPurchase, FinReconciliation, FinSale, FinSavingsMove } from "@/features/financeiro/financeiroData";
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

function publicUrlSafeName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
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

  if (error) throw error;
  return data as { authId: string; colaboradorId: string };
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
    .select("id, tipo, storage_path, original_filename, mime_type, file_size_bytes, uploaded_at, paciente_referencia, pagamento_lembrete_id, inteligencia_360_receivable_ref, valor, forma_pagamento, observacao, estorno_de, deleted_at, sharepoint_status, colaborador:uploaded_by(nome)")
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
    anexadoPorCargo: uploadedByCargo,
    pacienteReferencia: record.paciente_referencia ?? undefined,
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
  pagamentoLembreteId?: string;
  valor?: number;
  formaPagamento?: FormaPagamento;
  observacao?: string;
  alimentarRecebiveis360?: boolean;
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
    pagamento_lembrete_id: values.pagamentoLembreteId ?? null,
    inteligencia_360_receivable_ref: inteligenciaReceivableRef,
    valor: values.valor ?? null,
    forma_pagamento: values.formaPagamento ?? null,
    observacao: values.observacao ?? null,
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
    .select("id, paciente_nome, contato, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at, colaborador:criado_por(nome)")
    .is("deleted_at", null)
    .order("data_prevista", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as RemotePagamentoLembrete[]).map(mapRemotePagamento);
}

export async function createRemotePagamento(values: {
  pessoa: Colaborador;
  pacienteNome: string;
  contato?: string;
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
      valor_pendente: values.valorPendente,
      data_prevista: values.dataPrevista,
      observacao: values.observacao ?? null,
      criado_por: values.pessoa.id,
    })
    .select("id, paciente_nome, contato, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
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
};

export async function listRemoteFinCashEntries(): Promise<FinCashEntry[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_cash_entries")
    .select("client_ref, entry_date, direction, description, amount")
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

// ---------------------------------------------------------------------------
// Marketing: briefing do mês (foto/PDF) + plano de conteúdo preenchido pela IA.

export type MarketingPiece = {
  id: string;
  date: string;
  format: string;
  title: string;
  notes?: string;
  status: "A_PRODUZIR" | "GRAVADO" | "EDITADO" | "POSTADO";
};

// Detalhe rico do briefing (estilo painel executivo). Tudo opcional p/ compatibilidade
// com planos antigos gerados pela IA (que só tinham summary/cadence/weeklyThemes/pieces).
export type MarketingAnchor = { title: string; description: string };
export type MarketingCadenceTotal = { format: string; count: string; detail?: string };
export type MarketingLegendItem = { format: string; role: string };
export type MarketingCalendarItem = { format: string; title: string };
export type MarketingCalendarDay = { day: number; week?: string; rest?: boolean; items: MarketingCalendarItem[] };
export type MarketingStoryBlock = { n: number; title: string; description: string };
export type MarketingReel = { n: number; title: string; description?: string; cta?: string };
export type MarketingCarrossel = { n: number; telas?: number; title: string; roteiro?: string; tag?: string };
export type MarketingWeek = {
  id: string;
  label: string;
  dateRange?: string;
  theme: string;
  angle?: string;
  mediaHook?: string;
  reels?: MarketingReel[];
  carrosseis?: MarketingCarrossel[];
  youtube?: { title: string; description?: string };
  stories?: string;
};
export type MarketingProductionNote = { title: string; description: string };

export type MarketingPlan = {
  monthRef: string;
  monthLabel?: string;
  title?: string;
  subtitle?: string;
  summary?: string;
  cadence: { format: string; target: string }[];
  weeklyThemes: { week: number; theme: string; notes?: string }[];
  pieces: MarketingPiece[];
  // Campos do briefing completo (opcionais).
  cadenceHeader?: { format: string; target: string }[];
  howToUse?: string;
  climate?: { intro?: string; anchors: MarketingAnchor[] };
  cadenceTotals?: MarketingCadenceTotal[];
  legend?: MarketingLegendItem[];
  calendar?: MarketingCalendarDay[];
  storiesEngine?: MarketingStoryBlock[];
  weeks?: MarketingWeek[];
  production?: MarketingProductionNote[];
  generatedAt?: string;
  generatedBy?: string;
};

export type MarketingBriefing = {
  id: string;
  monthRef: string;
  sourcePath?: string;
  sourceFilename?: string;
  status: "PENDENTE" | "PROCESSANDO" | "PROCESSADO" | "ERRO";
  errorDetail?: string;
  content?: MarketingPlan;
  createdAt: string;
};

export async function listRemoteMarketingBriefings(): Promise<MarketingBriefing[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("marketing_briefings")
    .select("id, month_ref, source_path, source_filename, status, error_detail, content, created_at")
    .order("month_ref", { ascending: false })
    .limit(60);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    monthRef: String(row.month_ref),
    sourcePath: (row.source_path as string) ?? undefined,
    sourceFilename: (row.source_filename as string) ?? undefined,
    status: row.status as MarketingBriefing["status"],
    errorDetail: (row.error_detail as string) ?? undefined,
    content: (row.content as MarketingPlan) ?? undefined,
    createdAt: String(row.created_at),
  }));
}

export async function uploadRemoteMarketingBriefing(values: {
  pessoa: Colaborador;
  file: File;
  monthRef: string;
}): Promise<string> {
  const client = requireSupabase();
  const id = crypto.randomUUID();
  const safeName = publicUrlSafeName(values.file.name) || "briefing";
  const storagePath = `${values.monthRef}/${id}-${safeName}`;

  const { error: storageError } = await client.storage.from("marketing-briefings").upload(storagePath, values.file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (storageError) throw storageError;

  const { error: insertError } = await client.from("marketing_briefings").insert({
    id,
    month_ref: values.monthRef,
    source_path: storagePath,
    source_filename: values.file.name,
    source_mime: values.file.type || "application/octet-stream",
    status: "PENDENTE",
    created_by: uuidOrNull(values.pessoa.id),
  });
  if (insertError) {
    await client.storage.from("marketing-briefings").remove([storagePath]);
    throw insertError;
  }

  await safeWriteRemoteAuditEvent({
    action: "marketing.briefing.enviar",
    entity: "marketing_briefings",
    entityId: id,
    metadata: { monthRef: values.monthRef, filename: values.file.name },
  });
  return id;
}

export async function invokeRemoteMarketingBriefingParse(briefingId: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("marketing-briefing-parse", {
    body: { briefingId },
  });
  if (error) throw error;
  return data as { configured: boolean; ok?: boolean; pieces?: number; error?: string };
}

export async function updateRemoteMarketingBriefingContent(id: string, content: MarketingPlan) {
  const client = requireSupabase();
  const { error } = await client
    .from("marketing_briefings")
    .update({ content, status: "PROCESSADO", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "marketing.plano.editar",
    entity: "marketing_briefings",
    entityId: id,
    metadata: { pieces: content.pieces?.length ?? 0 },
  });
}

export async function deleteRemoteMarketingBriefing(id: string, storagePath?: string) {
  const client = requireSupabase();
  if (storagePath) {
    await client.storage.from("marketing-briefings").remove([storagePath]);
  }
  const { error } = await client.from("marketing_briefings").delete().eq("id", id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "marketing.briefing.excluir", entity: "marketing_briefings", entityId: id });
}

export async function getRemoteMarketingBriefingUrl(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("marketing-briefings").createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

// Exclusão definitiva de um lead do CRM: sem isso, o upsert do sync nunca
// apaga nada e o lead "ressuscita" no próximo carregamento.
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
}) {
  const client = requireSupabase();
  const { error } = await client.from("pagamento_recebimento").insert({
    lembrete_id: values.lembreteId,
    valor: values.valor,
    forma: values.forma,
    recebido_por: uuidOrNull(values.recebidoPor),
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
    .select("id, paciente_nome, contato, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
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

export async function listRemotePagamentoRecebimentos(): Promise<
  { id: string; lembreteId: string; valor: number; forma: string; recebidoEm: string }[]
> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("pagamento_recebimento")
    .select("id, lembrete_id, valor, forma, recebido_em")
    .order("recebido_em", { ascending: false })
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    lembreteId: String(row.lembrete_id),
    valor: Number(row.valor ?? 0),
    forma: String(row.forma ?? "DINHEIRO"),
    recebidoEm: String(row.recebido_em),
  }));
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
    .select("id, paciente_nome, contato, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
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
    .select("id, paciente_nome, contato, valor_pendente, data_prevista, observacao, status, criado_por, criado_em, pago_em, deleted_at")
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
  if (error) throw error;
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
      referral_reward_paid_at: record.referralRewardPaidAt ?? null,
    })),
  );

  if (includeCatalog) {
  await upsertCrmTable(
    "crm_cadences",
    pick.cadences.map((record) => ({
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
    pick.cadenceSteps.map((record) => ({
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
    pick.messageTemplates.map((record) => ({
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

  await upsertCrmTable(
    "crm_deals",
    pick.deals.map((record) => ({
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

type RemoteEstalecaConfig = {
  church_checkin_estalecas: number;
  gym_checkin_estalecas: number;
  gym_checkin_checkpoints: number;
  streak_bonus_estalecas: number;
  milestone_500_estalecas: number;
  default_cashback_percent: number | string;
  max_cashback_estalecas: number;
  cashback_approval_days: number;
  estalecas_expiration_days: number | null;
  eligible_categories: unknown;
};

function mapRemoteConfig(record: RemoteEstalecaConfig | null | undefined): EstalecaConfig {
  if (!record) return defaultEstalecaConfig;

  return {
    churchCheckinEstalecas: record.church_checkin_estalecas,
    gymCheckinEstalecas: record.gym_checkin_estalecas,
    gymCheckinCheckpoints: record.gym_checkin_checkpoints,
    streakBonusEstalecas: record.streak_bonus_estalecas,
    milestone500Estalecas: record.milestone_500_estalecas,
    defaultCashbackPercent: Number(record.default_cashback_percent),
    maxCashbackEstalecas: record.max_cashback_estalecas,
    cashbackApprovalDays: record.cashback_approval_days,
    estalecasExpirationDays: record.estalecas_expiration_days,
    eligibleCategories: Array.isArray(record.eligible_categories)
      ? record.eligible_categories.filter((item): item is string => typeof item === "string")
      : defaultEstalecaConfig.eligibleCategories,
  };
}

export async function getRemoteEstalecaConfig(): Promise<EstalecaConfig> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estaleca_config")
    .select("church_checkin_estalecas, gym_checkin_estalecas, gym_checkin_checkpoints, streak_bonus_estalecas, milestone_500_estalecas, default_cashback_percent, max_cashback_estalecas, cashback_approval_days, estalecas_expiration_days, eligible_categories")
    .eq("id", true)
    .maybeSingle();

  if (error) throw error;
  return mapRemoteConfig(data as RemoteEstalecaConfig | null);
}

type RemoteGamificationProfile = {
  user_id: string;
  display_name: string | null;
  ranking_opt_in: boolean;
  checkins_consent_at: string | null;
  updated_at: string | null;
};

function mapRemoteProfile(record: RemoteGamificationProfile | null | undefined, pessoa: Colaborador): GamificationProfile {
  return {
    userId: pessoa.id,
    displayName: record?.display_name ?? undefined,
    rankingOptIn: record?.ranking_opt_in ?? true,
    checkinsConsentAt: record?.checkins_consent_at ?? undefined,
    updatedAt: record?.updated_at ?? undefined,
  };
}

export async function getRemoteGamificationProfile(pessoa: Colaborador): Promise<GamificationProfile> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("gamification_profile")
    .select("user_id, display_name, ranking_opt_in, checkins_consent_at, updated_at")
    .eq("user_id", pessoa.id)
    .maybeSingle();

  if (error) throw error;
  return mapRemoteProfile(data as RemoteGamificationProfile | null, pessoa);
}

export async function saveRemoteGamificationProfile(values: {
  pessoa: Colaborador;
  displayName?: string;
  rankingOptIn?: boolean;
  acceptCheckins?: boolean;
}) {
  const client = requireSupabase();
  const payload = {
    user_id: values.pessoa.id,
    display_name: values.displayName?.trim() || null,
    ranking_opt_in: values.rankingOptIn ?? true,
    checkins_consent_at: values.acceptCheckins ? new Date().toISOString() : undefined,
  };

  const { error } = await client
    .from("gamification_profile")
    .upsert(payload, { onConflict: "user_id" });

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: values.acceptCheckins ? "estalecas.consent" : "estalecas.profile.update",
    entity: "gamification_profile",
    entityId: values.pessoa.id,
    metadata: { rankingOptIn: values.rankingOptIn ?? true, hasDisplayName: Boolean(values.displayName?.trim()) },
  });
}

type RemoteEstalecaTransaction = {
  id: string;
  user_id: string;
  type: EstalecaTransactionType;
  source: EstalecaTransactionSource;
  amount: number;
  status: EstalecaTransactionStatus;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  expires_at: string | null;
  created_by: string | null;
};

function mapRemoteEstalecaTransaction(record: RemoteEstalecaTransaction): EstalecaTransaction {
  return {
    id: record.id,
    userId: record.user_id,
    type: record.type,
    source: record.source,
    amount: record.amount,
    status: record.status,
    description: record.description,
    metadata: record.metadata ?? {},
    createdAt: record.created_at,
    updatedAt: record.updated_at ?? undefined,
    expiresAt: record.expires_at ?? undefined,
    createdBy: record.created_by ?? undefined,
  };
}

export async function listRemoteEstalecaTransactions(): Promise<EstalecaTransaction[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estaleca_transactions")
    .select("id, user_id, type, source, amount, status, description, metadata, created_at, updated_at, expires_at, created_by")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) throw error;
  return ((data ?? []) as RemoteEstalecaTransaction[]).map(mapRemoteEstalecaTransaction);
}

type RemoteCheckin = {
  id: string;
  user_id: string;
  checkin_type: CheckinType;
  checkin_date: string;
  status: CheckinStatus;
  validation_method: CheckinValidationMethod;
  reward_transaction_id: string | null;
  checkpoints_awarded: number;
  estalecas_awarded: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  invalidated_by: string | null;
  invalidation_reason: string | null;
};

function mapRemoteCheckin(record: RemoteCheckin): EstalecaCheckin {
  return {
    id: record.id,
    userId: record.user_id,
    checkinType: record.checkin_type,
    checkinDate: record.checkin_date,
    status: record.status,
    validationMethod: record.validation_method,
    rewardTransactionId: record.reward_transaction_id ?? undefined,
    checkpointsAwarded: record.checkpoints_awarded,
    estalecasAwarded: record.estalecas_awarded,
    metadata: record.metadata ?? {},
    createdAt: record.created_at,
    updatedAt: record.updated_at ?? undefined,
    invalidatedBy: record.invalidated_by ?? undefined,
    invalidationReason: record.invalidation_reason ?? undefined,
  };
}

export async function listRemoteCheckins(): Promise<EstalecaCheckin[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("checkins")
    .select("id, user_id, checkin_type, checkin_date, status, validation_method, reward_transaction_id, checkpoints_awarded, estalecas_awarded, metadata, created_at, updated_at, invalidated_by, invalidation_reason")
    .order("checkin_date", { ascending: false })
    .limit(500);

  if (error) throw error;
  return ((data ?? []) as RemoteCheckin[]).map(mapRemoteCheckin);
}

type RemoteReward = {
  id: string;
  user_id: string;
  campaign_id: string | null;
  reward_type: RewardType;
  title: string;
  description: string;
  status: RewardStatus;
  month: number | null;
  year: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  delivered_at: string | null;
};

function mapRemoteReward(record: RemoteReward): EstalecaReward {
  return {
    id: record.id,
    userId: record.user_id,
    campaignId: record.campaign_id ?? undefined,
    rewardType: record.reward_type,
    title: record.title,
    description: record.description,
    status: record.status,
    month: record.month ?? undefined,
    year: record.year ?? undefined,
    metadata: record.metadata ?? {},
    createdAt: record.created_at,
    updatedAt: record.updated_at ?? undefined,
    deliveredAt: record.delivered_at ?? undefined,
  };
}

export async function listRemoteRewards(): Promise<EstalecaReward[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("rewards")
    .select("id, user_id, campaign_id, reward_type, title, description, status, month, year, metadata, created_at, updated_at, delivered_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return ((data ?? []) as RemoteReward[]).map(mapRemoteReward);
}

type RemoteRankingProfile = {
  user_id: string;
  display_name: string;
  ranking_opt_in: boolean;
};

export async function listRemoteRankingProfiles(): Promise<GamificationProfile[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("gamification_ranking_profile")
    .select("user_id, display_name, ranking_opt_in")
    .eq("ranking_opt_in", true);

  if (error) throw error;
  return ((data ?? []) as RemoteRankingProfile[]).map((record) => ({
    userId: record.user_id,
    displayName: record.display_name,
    rankingOptIn: record.ranking_opt_in,
  }));
}

export async function performRemoteEstalecasCheckin(values: {
  checkinType: CheckinType;
  validationCode?: string;
  validationMethod?: CheckinValidationMethod;
  deviceId?: string;
  userAgent?: string;
  consentAccepted?: boolean;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("perform_estalecas_checkin", {
    _checkin_type: values.checkinType,
    _validation_code: values.validationCode ?? null,
    _validation_method: values.validationMethod ?? null,
    _device_id: values.deviceId ?? null,
    _user_agent: values.userAgent ?? null,
    _consent_accepted: values.consentAccepted ?? false,
  });

  if (error) throw error;
  return data as {
    alreadyExists: boolean;
    checkinId: string;
    transactionId?: string;
    rewardId?: string;
    rewardTransactionId?: string;
    message: string;
  };
}

function estalecaConfigPayload(config: EstalecaConfig) {
  return {
    church_checkin_estalecas: config.churchCheckinEstalecas,
    gym_checkin_estalecas: config.gymCheckinEstalecas,
    gym_checkin_checkpoints: config.gymCheckinCheckpoints,
    streak_bonus_estalecas: config.streakBonusEstalecas,
    milestone_500_estalecas: config.milestone500Estalecas,
    default_cashback_percent: config.defaultCashbackPercent,
    max_cashback_estalecas: config.maxCashbackEstalecas,
    cashback_approval_days: config.cashbackApprovalDays,
    estalecas_expiration_days: config.estalecasExpirationDays,
    eligible_categories: config.eligibleCategories,
    updated_at: new Date().toISOString(),
  };
}

export async function saveRemoteEstalecaConfig(config: EstalecaConfig) {
  const client = requireSupabase();
  const { error } = await client
    .from("estaleca_config")
    .update(estalecaConfigPayload(config))
    .eq("id", true);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.config.update",
    entity: "estaleca_config",
    entityId: "default",
    metadata: {
      gymCheckinEstalecas: config.gymCheckinEstalecas,
      churchCheckinEstalecas: config.churchCheckinEstalecas,
      defaultCashbackPercent: config.defaultCashbackPercent,
      eligibleCategories: config.eligibleCategories,
    },
  });
}

export async function createRemoteEstalecaTransaction(values: {
  targetUserId: string;
  createdBy: string;
  type: EstalecaTransactionType;
  source: EstalecaTransactionSource;
  amount: number;
  status: EstalecaTransactionStatus;
  description: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string | null;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estaleca_transactions")
    .insert({
      user_id: values.targetUserId,
      type: values.type,
      source: values.source,
      amount: values.amount,
      status: values.status,
      description: values.description,
      metadata: values.metadata ?? {},
      expires_at: values.expiresAt ?? null,
      created_by: values.createdBy,
    })
    .select("id")
    .single();

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.transaction.create",
    entity: "estaleca_transactions",
    entityId: data?.id,
    metadata: {
      targetUserId: values.targetUserId,
      amount: values.amount,
      status: values.status,
      source: values.source,
      type: values.type,
    },
  });
  return data?.id as string;
}

export async function updateRemoteEstalecaTransactionStatus(values: {
  transaction: EstalecaTransaction;
  status: EstalecaTransactionStatus;
  reason: string;
}) {
  const client = requireSupabase();
  const metadata = {
    ...values.transaction.metadata,
    adminStatusReason: values.reason,
    previousStatus: values.transaction.status,
    statusUpdatedAt: new Date().toISOString(),
  };
  const { error } = await client
    .from("estaleca_transactions")
    .update({
      status: values.status,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.transaction.id);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.transaction.status",
    entity: "estaleca_transactions",
    entityId: values.transaction.id,
    metadata: {
      targetUserId: values.transaction.userId,
      amount: values.transaction.amount,
      before: values.transaction.status,
      after: values.status,
      reason: values.reason,
    },
  });
}

export async function invalidateRemoteCheckin(values: { checkinId: string; reason: string }) {
  const client = requireSupabase();
  const { error } = await client.rpc("invalidate_checkin", {
    _checkin_id: values.checkinId,
    _reason: values.reason,
  });

  if (error) throw error;
}

export async function updateRemoteRewardStatus(values: {
  reward: EstalecaReward;
  status: RewardStatus;
  reason: string;
}) {
  const client = requireSupabase();
  const metadata = {
    ...values.reward.metadata,
    adminStatusReason: values.reason,
    previousStatus: values.reward.status,
    statusUpdatedAt: new Date().toISOString(),
  };
  const { error } = await client
    .from("rewards")
    .update({
      status: values.status,
      metadata,
      delivered_at: values.status === "delivered" ? new Date().toISOString() : values.reward.deliveredAt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.reward.id);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.reward.status",
    entity: "rewards",
    entityId: values.reward.id,
    metadata: {
      targetUserId: values.reward.userId,
      before: values.reward.status,
      after: values.status,
      reason: values.reason,
    },
  });
}

export async function createRemoteMonthlyWinnerReward(values: {
  userId: string;
  month: number;
  year: number;
  title: string;
  description: string;
  tieBreakNote?: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("rewards")
    .insert({
      user_id: values.userId,
      reward_type: "monthly_winner",
      title: values.title,
      description: values.description,
      status: "pending",
      month: values.month,
      year: values.year,
      metadata: {
        tieBreakNote: values.tieBreakNote,
        uniqueWinnerRule: true,
      },
    })
    .select("id")
    .single();

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.reward.monthly_winner.create",
    entity: "rewards",
    entityId: data?.id,
    metadata: {
      targetUserId: values.userId,
      month: values.month,
      year: values.year,
      tieBreakNote: values.tieBreakNote,
    },
  });
  return data?.id as string;
}

export async function createRemoteReward(values: {
  userId: string;
  rewardType: RewardType;
  title: string;
  description: string;
  status: RewardStatus;
  metadata?: Record<string, unknown>;
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("rewards")
    .insert({
      user_id: values.userId,
      reward_type: values.rewardType,
      title: values.title,
      description: values.description,
      status: values.status,
      metadata: values.metadata ?? {},
      delivered_at: values.status === "delivered" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.reward.create",
    entity: "rewards",
    entityId: data?.id,
    metadata: {
      targetUserId: values.userId,
      rewardType: values.rewardType,
      status: values.status,
      title: values.title,
    },
  });
  return data?.id as string;
}

type RemoteCheckinEventCode = {
  id: string;
  checkin_type: CheckinType;
  label: string;
  code_hash: string;
  code_preview: string;
  event_date: string;
  active: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

function mapRemoteCheckinEventCode(record: RemoteCheckinEventCode): CheckinEventCode {
  return {
    id: record.id,
    checkinType: record.checkin_type,
    label: record.label,
    codeHash: record.code_hash,
    codePreview: record.code_preview,
    eventDate: record.event_date,
    active: record.active,
    expiresAt: record.expires_at ?? undefined,
    createdBy: record.created_by ?? undefined,
    createdAt: record.created_at,
    updatedAt: record.updated_at ?? undefined,
  };
}

export async function listRemoteCheckinEventCodes(): Promise<CheckinEventCode[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("checkin_event_codes")
    .select("id, checkin_type, label, code_hash, code_preview, event_date, active, expires_at, created_by, created_at, updated_at")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return ((data ?? []) as RemoteCheckinEventCode[]).map(mapRemoteCheckinEventCode);
}

export async function createRemoteCheckinEventCode(values: {
  pessoa: Colaborador;
  checkinType: CheckinType;
  label: string;
  code: string;
  eventDate: string;
  expiresAt?: string | null;
}) {
  const client = requireSupabase();
  const { data: hash, error: hashError } = await client.rpc("normalized_checkin_code_hash", {
    _validation_code: values.code,
  });

  if (hashError) throw hashError;

  const { data, error } = await client
    .from("checkin_event_codes")
    .insert({
      checkin_type: values.checkinType,
      label: values.label,
      code_hash: hash,
      code_preview: checkinCodePreview(values.code),
      event_date: values.eventDate,
      active: true,
      expires_at: values.expiresAt ?? null,
      created_by: values.pessoa.id,
    })
    .select("id")
    .single();

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.checkin_code.create",
    entity: "checkin_event_codes",
    entityId: data?.id,
    metadata: {
      checkinType: values.checkinType,
      eventDate: values.eventDate,
      codePreview: checkinCodePreview(values.code),
    },
  });
  return data?.id as string;
}

export async function updateRemoteCheckinEventCodeStatus(values: {
  id: string;
  active: boolean;
}) {
  const client = requireSupabase();
  const { error } = await client
    .from("checkin_event_codes")
    .update({ active: values.active, updated_at: new Date().toISOString() })
    .eq("id", values.id);

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: values.active ? "estalecas.checkin_code.activate" : "estalecas.checkin_code.deactivate",
    entity: "checkin_event_codes",
    entityId: values.id,
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
    .select("client_ref, purchase_date, description, supplier, amount, method, card, installments, nf_note, delivery_eta, received_at, expense_ref, notes, created_at")
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

export async function listRemoteFinSales(year: number): Promise<FinSale[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_sales")
    .select("client_ref, sale_date, patient_name, crm_contact_ref, notes, adhesion, created_at, fin_sale_items(client_ref, item_type, amount, description), fin_sale_payments(client_ref, method, amount, installments, card_machine)")
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
    })),
  }));
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
    .select("client_ref, description, category_ref, amount, due_date, paid_at, method, supplier, installment_num, installment_total, document_note, is_capex, notes, created_at, recurrence")
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
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? ""),
    recorrencia: (row.recurrence as FinExpense["recorrencia"]) ?? null,
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
    .select("client_ref, day, expected_pix, expected_card_itau, expected_card_safra, expected_card_outra, expected_dinheiro, fee_itau, fee_safra, status, divergence_note, confirmed_at")
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

export async function listRemoteFinSavings(): Promise<FinSavingsMove[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_savings_moves")
    .select("client_ref, move_date, direction, amount, reason, source, month_ref, created_at")
    .is("deleted_at", null)
    .order("move_date", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    moveDate: String(row.move_date),
    direction: row.direction as FinSavingsMove["direction"],
    amount: Number(row.amount ?? 0),
    reason: String(row.reason ?? ""),
    source: row.source as FinSavingsMove["source"],
    monthRef: String(row.month_ref ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function createRemoteFinSavingsMoves(moves: FinSavingsMove[], createdBy: string | null) {
  if (!moves.length) return;
  const client = requireSupabase();
  const { error } = await client.from("fin_savings_moves").upsert(
    moves.map((move) => ({
      client_ref: move.id,
      move_date: move.moveDate,
      direction: move.direction,
      amount: move.amount,
      reason: move.reason,
      source: move.source,
      month_ref: move.monthRef,
      created_by: uuidOrNull(createdBy),
      // Reconfirmar provisões após excluir os movimentos do mês usa os MESMOS ids
      // determinísticos (fsav-prov-<mês>-<regra>). Com ignoreDuplicates a linha
      // soft-deletada não voltava e a provisão sumia do saldo/P12. Upsert real +
      // deleted_at:null a ressuscita.
      deleted_at: null,
    })),
    { onConflict: "client_ref" },
  );
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.poupanca.lancar",
    entity: "fin_savings_moves",
    metadata: { moves: moves.length, source: moves[0]?.source },
  });
}

export async function deleteRemoteFinSavingsMove(moveRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_savings_moves").update({ deleted_at: new Date().toISOString() }).eq("client_ref", moveRef);
  if (error) throw error;
}

export async function listRemoteFinProvisionRules(): Promise<FinProvisionRule[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_provision_rules")
    .select("client_ref, name, monthly_amount, sort_order, active")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    name: String(row.name),
    monthlyAmount: Number(row.monthly_amount ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
  }));
}

export async function listRemoteFinInvoices(year: number): Promise<FinInvoice[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_invoices")
    .select("client_ref, sale_ref, invoice_type, invoice_number, issue_date, comanda_date, patient_name, amount, notes, created_at")
    .gte("issue_date", `${year}-01-01`)
    .lte("issue_date", `${year}-12-31`)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    saleRef: (row.sale_ref as string | null) ?? null,
    invoiceType: row.invoice_type as FinInvoice["invoiceType"],
    invoiceNumber: String(row.invoice_number ?? ""),
    issueDate: String(row.issue_date),
    comandaDate: (row.comanda_date as string | null) ?? null,
    patientName: String(row.patient_name ?? ""),
    amount: Number(row.amount ?? 0),
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function createRemoteFinInvoice(invoice: FinInvoice, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_invoices").insert({
    client_ref: invoice.id,
    sale_ref: invoice.saleRef,
    invoice_type: invoice.invoiceType,
    invoice_number: invoice.invoiceNumber,
    issue_date: invoice.issueDate,
    comanda_date: invoice.comandaDate,
    patient_name: invoice.patientName,
    amount: invoice.amount,
    notes: invoice.notes,
    created_by: uuidOrNull(createdBy),
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "financeiro.nf.registrar",
    entity: "fin_invoices",
    entityId: invoice.id,
    metadata: { invoiceType: invoice.invoiceType, amount: invoice.amount, invoiceNumber: invoice.invoiceNumber },
  });
}

export async function deleteRemoteFinInvoice(invoiceRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_invoices").update({ deleted_at: new Date().toISOString() }).eq("client_ref", invoiceRef);
  if (error) throw error;
}

export async function listRemoteFinPartnerEntries(year: number): Promise<FinPartnerEntry[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("fin_partner_entries")
    .select("client_ref, professional, entry_date, patient_name, sale_item_ref, kind, amount, notes, created_at")
    .gte("entry_date", `${year}-01-01`)
    .lte("entry_date", `${year}-12-31`)
    .is("deleted_at", null)
    .order("entry_date", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.client_ref),
    professional: row.professional as FinPartnerEntry["professional"],
    entryDate: String(row.entry_date),
    patientName: String(row.patient_name ?? ""),
    saleItemRef: (row.sale_item_ref as string | null) ?? null,
    kind: row.kind as FinPartnerEntry["kind"],
    amount: Number(row.amount ?? 0),
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function createRemoteFinPartnerEntry(entry: FinPartnerEntry, createdBy: string | null) {
  const client = requireSupabase();
  const { error } = await client.from("fin_partner_entries").upsert(
    {
      client_ref: entry.id,
      professional: entry.professional,
      entry_date: entry.entryDate,
      patient_name: entry.patientName,
      sale_item_ref: entry.saleItemRef,
      kind: entry.kind,
      amount: entry.amount,
      notes: entry.notes,
      created_by: uuidOrNull(createdBy),
      // Reclassificar um repasse é excluir (soft delete) e recriar com o MESMO id
      // determinístico. Com ignoreDuplicates a linha soft-deletada não voltava e
      // o repasse sumia no refetch. Upsert real + deleted_at:null a ressuscita.
      deleted_at: null,
    },
    { onConflict: "client_ref" },
  );
  if (error) throw error;
}

export async function deleteRemoteFinPartnerEntry(entryRef: string) {
  const client = requireSupabase();
  const { error } = await client.from("fin_partner_entries").update({ deleted_at: new Date().toISOString() }).eq("client_ref", entryRef);
  if (error) throw error;
}

// ---------------- Estalecas: conquistas com prova ----------------

export async function listRemoteEstalecaClaims(): Promise<EstalecaClaim[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estaleca_claims")
    .select("id, colaborador_id, claim_type, title, description, photo_path, claim_date, amount_suggested, status, review_note, reviewed_at, created_at, colaborador:colaborador_id(nome)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return ((data ?? []) as Record<string, any>[]).map((row) => ({
    id: String(row.id),
    colaboradorId: String(row.colaborador_id),
    colaboradorNome: String(row.colaborador?.nome ?? "Colaborador"),
    claimType: row.claim_type as EstalecaClaim["claimType"],
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    photoPath: String(row.photo_path ?? ""),
    claimDate: String(row.claim_date),
    amountSuggested: Number(row.amount_suggested ?? 0),
    status: row.status as EstalecaClaim["status"],
    reviewNote: String(row.review_note ?? ""),
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function createRemoteEstalecaClaim(values: {
  pessoa: Colaborador;
  claimType: EstalecaClaim["claimType"];
  title: string;
  description: string;
  claimDate: string;
  amountSuggested: number;
  photoFile?: File | null;
}) {
  const client = requireSupabase();
  let photoPath = "";

  if (values.photoFile) {
    const safeName = publicUrlSafeName(values.photoFile.name) || "prova.jpg";
    photoPath = `${values.pessoa.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage.from("estalecas-provas").upload(photoPath, values.photoFile, {
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw uploadError;
  }

  const { error } = await client.from("estaleca_claims").insert({
    colaborador_id: values.pessoa.id,
    claim_type: values.claimType,
    title: values.title,
    description: values.description,
    photo_path: photoPath,
    claim_date: values.claimDate,
    amount_suggested: values.amountSuggested,
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.conquista.solicitar",
    entity: "estaleca_claims",
    metadata: { claimType: values.claimType, title: values.title, amountSuggested: values.amountSuggested },
  });
}

export async function uploadRemoteAvatar(pessoaId: string, dataUrl: string) {
  const client = requireSupabase();
  const blob = await (await fetch(dataUrl)).blob();
  const { error } = await client.storage.from("avatars").upload(`${pessoaId}.jpg`, blob, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });
  if (error) throw error;
}

// Remove a foto do bucket público. Sem isto, "Remover foto" só apagava a cópia
// local e a equipe continuava vendo a foto publicada.
export async function deleteRemoteAvatar(pessoaId: string) {
  const client = requireSupabase();
  const { error } = await client.storage.from("avatars").remove([`${pessoaId}.jpg`]);
  if (error) throw error;
}

export async function hardDeleteRemoteComprovante(values: { id: string; storagePath?: string }) {
  const client = requireSupabase();
  // Itens ainda não enviados ao SharePoint saem da fila para não subirem depois.
  await client.from("sharepoint_dispatch_queue").delete().eq("entity_id", values.id).eq("status", "PENDING");
  if (values.storagePath) {
    const { error: storageError } = await client.storage.from("comprovantes").remove([values.storagePath]);
    if (storageError) console.warn("Arquivo do Storage não pôde ser removido.", storageError);
  }
  const { error } = await client.from("comprovante").delete().eq("id", values.id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "comprovante.excluir",
    entity: "comprovante",
    entityId: values.id,
    metadata: { storagePath: values.storagePath ?? null },
  });
}

export async function getRemoteComprovanteUrl(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("comprovantes").createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl as string;
}

export async function getRemoteEstalecaClaimPhotoUrl(photoPath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("estalecas-provas").createSignedUrl(photoPath, 60 * 10);
  if (error) throw error;
  return data.signedUrl as string;
}

export async function reviewRemoteEstalecaClaim(values: {
  pessoa: Colaborador;
  claim: EstalecaClaim;
  approve: boolean;
  amount: number;
  note: string;
}) {
  const client = requireSupabase();

  if (values.approve && values.amount > 0) {
    // Idempotência: a aprovação NÃO é atômica (credita e depois marca APROVADA).
    // Se o update da claim falhou antes, a claim continua PENDENTE e reaprovar
    // creditaria de novo. Só credita se ainda não houver transação desta claim.
    const { data: existing } = await client
      .from("estaleca_transactions")
      .select("id")
      .eq("metadata->>claimId", values.claim.id)
      .limit(1);
    if (!existing || !existing.length) {
      await createRemoteEstalecaTransaction({
        targetUserId: values.claim.colaboradorId,
        createdBy: values.pessoa.id,
        type: "earn",
        source: "admin_bonus",
        amount: values.amount,
        status: "approved",
        description: `Conquista aprovada: ${values.claim.title}`,
        metadata: { claimId: values.claim.id, claimType: values.claim.claimType, reviewNote: values.note },
      });
    }
  }

  const { error } = await client
    .from("estaleca_claims")
    .update({
      status: values.approve ? "APPROVED" : "REJECTED",
      reviewed_by: values.pessoa.id,
      reviewed_at: new Date().toISOString(),
      review_note: values.note,
    })
    .eq("id", values.claim.id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: values.approve ? "estalecas.conquista.aprovar" : "estalecas.conquista.recusar",
    entity: "estaleca_claims",
    entityId: values.claim.id,
    metadata: { amount: values.amount, claimType: values.claim.claimType },
  });
}
