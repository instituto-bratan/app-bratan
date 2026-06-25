import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/localStore";
import { prepareSharePointDispatch } from "@/lib/sharepoint";
import type { ChecklistItem } from "@/features/checklist/checklistData";
import type { Aviso } from "@/features/mural/muralData";
import type { ComprovanteRecord } from "@/features/comprovantes/comprovantesData";
import type { AuditEventRecord } from "@/features/admin/auditoriaData";
import type { PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import type { Cargo, Colaborador, ComprovanteTipo, FormaPagamento, PagamentoLembreteStatus, PrioridadeAviso } from "@/types/database";

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
  const { data, error } = await client.from("colaborador_app").select("*").eq("ativo", true).order("nome", { ascending: true });

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

    const visibleExistingItems = currentTemplateKeys.size
      ? existingRunItems.filter((item) => currentTemplateKeys.has(itemKey(item)))
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
    .select("id, tipo, original_filename, mime_type, file_size_bytes, uploaded_at, valor, forma_pagamento, observacao, estorno_de, deleted_at, sharepoint_status, colaborador:uploaded_by(nome)")
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as RemoteComprovante[]).map((record) => ({
    id: record.id,
    tipo: record.tipo,
    arquivoNome: record.original_filename,
    arquivoTipo: record.mime_type,
    arquivoTamanho: record.file_size_bytes,
    anexadoEm: record.uploaded_at,
    anexadoPor: record.colaborador?.nome ?? "Equipe Bratan",
    anexadoPorCargo: uploadedByCargo,
    valor: record.valor ?? undefined,
    formaPagamento: record.forma_pagamento ?? undefined,
    observacao: record.observacao ?? undefined,
    estornoDe: record.estorno_de ?? undefined,
    deletedAt: record.deleted_at ?? undefined,
    sharePoint: {
      comprovanteId: record.id,
      arquivoNome: record.original_filename,
      queuedAt: record.uploaded_at,
      provider: "microsoft_graph_next_phase",
      status: record.sharepoint_status === "pendente" ? "pendente" : "pendente",
    },
  }));
}

export async function uploadRemoteComprovante(values: {
  pessoa: Colaborador;
  file: File;
  valor?: number;
  formaPagamento?: FormaPagamento;
  observacao?: string;
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

  const { error: insertError } = await client.from("comprovante").insert({
    id,
    storage_path: storagePath,
    original_filename: values.file.name,
    mime_type: values.file.type || "application/octet-stream",
    file_size_bytes: values.file.size,
    uploaded_by: values.pessoa.id,
    valor: values.valor ?? null,
    forma_pagamento: values.formaPagamento ?? null,
    observacao: values.observacao ?? null,
    sharepoint_job_payload: prepareSharePointDispatch(id, values.file.name),
  });

  if (insertError) throw insertError;
  await safeWriteRemoteAuditEvent({
    action: "comprovante.upload",
    entity: "comprovante",
    entityId: id,
    metadata: {
      fileName: values.file.name,
      fileSize: values.file.size,
      formaPagamento: values.formaPagamento ?? null,
      hasValor: typeof values.valor === "number",
    },
  });
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
    .select("id")
    .single();

  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "pagamento_lembrete.create",
    entity: "pagamento_lembrete",
    entityId: data.id,
    metadata: { dataPrevista: values.dataPrevista, hasContato: Boolean(values.contato) },
  });
}

export async function updateRemotePagamentoStatus(values: {
  id: string;
  status: PagamentoLembreteStatus;
}) {
  const client = requireSupabase();
  const { error } = await client
    .from("pagamento_lembrete")
    .update({
      status: values.status,
      pago_em: values.status === "pago" ? new Date().toISOString() : null,
    })
    .eq("id", values.id);

  if (error) throw error;
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
  const { error } = await client
    .from("pagamento_lembrete")
    .update({
      data_prevista: values.dataPrevista,
      status: "aberto",
      pago_em: null,
    })
    .eq("id", values.id);

  if (error) throw error;
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
  await safeWriteRemoteAuditEvent({
    action: "pagamento_lembrete.hide",
    entity: "pagamento_lembrete",
    entityId: id,
  });
}
