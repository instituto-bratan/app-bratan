import { crmModuleRoutes, contactDisplayName, dealStageLabels, formatCrmDateTime, moneyCrm, taskEffectiveStatus, type CrmContact, type CrmDeal, type CrmMessageTemplate, type CrmState } from "@/features/crm/crmData";
import { buildDashboard360Snapshot, buildDataQuality, generateActionRecommendations, generateWeeklyKickoffBrief } from "@/features/inteligencia360/intelligenceEngine";
import { money360, moduleRoutes360, type Inteligencia360State } from "@/features/inteligencia360/inteligencia360Data";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";

export type ObsidianSyncMode = "MANUAL" | "AUTO_DAILY" | "AUTO_WEEKLY" | "ON_DEMAND";
export type ObsidianRedactionMode = "NONE" | "PARTIAL" | "STRICT";
export type ObsidianExportStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "SKIPPED";
export type ObsidianEntityType =
  | "DASHBOARD_SNAPSHOT"
  | "CRM_CONTACT"
  | "CRM_DEAL"
  | "CRM_TASK"
  | "CADENCE"
  | "TEMPLATE"
  | "REPORT"
  | "PLAYBOOK"
  | "AUDIT";

export type ObsidianVaultConfig = {
  enabled: boolean;
  vaultPath: string;
  syncMode: ObsidianSyncMode;
  exportSensitiveData: boolean;
  exportFinancialValues: boolean;
  exportPatientNames: boolean;
  exportContactPhone: boolean;
  defaultRedactionMode: ObsidianRedactionMode;
  lastSyncAt: string;
  lastSyncStatus: "connected" | "no_permission" | "invalid_path" | "awaiting_config" | "success" | "failed";
  lastSyncError: string;
  createdAt: string;
  updatedAt: string;
};

export type ObsidianExportQueueItem = {
  id: string;
  entityType: ObsidianEntityType;
  entityId: string;
  exportType: "CREATE" | "UPDATE" | "DELETE" | "SNAPSHOT";
  targetPath: string;
  status: ObsidianExportStatus;
  errorMessage: string;
  attempts: number;
  lastAttemptAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ObsidianSyncLog = {
  id: string;
  syncType: string;
  status: "DONE" | "FAILED" | "SKIPPED";
  startedAt: string;
  finishedAt: string;
  filesCreated: number;
  filesUpdated: number;
  filesFailed: number;
  errorMessage: string;
  triggeredByUserId: string;
  createdAt: string;
};

export type ObsidianVaultFile = {
  path: string;
  content: string;
  entityType: ObsidianEntityType;
  entityId: string;
};

export type ObsidianExportBundle = {
  files: ObsidianVaultFile[];
  queueItems: ObsidianExportQueueItem[];
  log: ObsidianSyncLog;
};

export const obsidianConfigStorageKey = "app-bratan-obsidian-config";
export const obsidianQueueStorageKey = "app-bratan-obsidian-export-queue";
export const obsidianLogsStorageKey = "app-bratan-obsidian-sync-logs";

const vaultRoot = "Instituto Bratan";
const textEncoder = new TextEncoder();

export const defaultObsidianConfig: ObsidianVaultConfig = {
  enabled: false,
  vaultPath: "",
  syncMode: "MANUAL",
  exportSensitiveData: false,
  exportFinancialValues: false,
  exportPatientNames: true,
  exportContactPhone: false,
  defaultRedactionMode: "PARTIAL",
  lastSyncAt: "",
  lastSyncStatus: "awaiting_config",
  lastSyncError: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const vaultFolders = [
  "00_Inbox",
  "01_CRM/Contatos",
  "01_CRM/Leads",
  "01_CRM/Pacientes",
  "01_CRM/Negociacoes",
  "01_CRM/Resgates",
  "02_Dashboard_360/Snapshots_Diarios",
  "02_Dashboard_360/Snapshots_Semanais",
  "02_Dashboard_360/Briefings",
  "03_Cadencias/Comercial",
  "03_Cadencias/Concierge",
  "03_Cadencias/Enfermagem",
  "03_Cadencias/Retorno",
  "03_Cadencias/Resgate",
  "04_Tarefas/Hoje",
  "04_Tarefas/Atrasadas",
  "04_Tarefas/Concluidas",
  "05_Playbooks/Comercial",
  "05_Playbooks/Objeções",
  "05_Playbooks/Atendimento",
  "05_Playbooks/Concierge",
  "05_Playbooks/Enfermagem",
  "05_Playbooks/Recepcao",
  "05_Playbooks/Administrativo",
  "06_Relatorios/Semanais",
  "06_Relatorios/Mensais",
  "06_Relatorios/Kickoff",
  "07_Decisoes/Decisoes_Gestao",
  "07_Decisoes/Reunioes",
  "07_Decisoes/Melhorias",
  "08_Auditoria/Logs",
  "08_Auditoria/Alteracoes",
  "08_Auditoria/Qualidade_Dados",
  "09_Templates/Mensagens",
  "09_Templates/Reunioes",
  "09_Templates/Checklists",
  "99_Arquivos_Gerados",
] as const;

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function loadObsidianConfig() {
  return readLocalValue<ObsidianVaultConfig>(obsidianConfigStorageKey, defaultObsidianConfig);
}

export function saveObsidianConfig(config: ObsidianVaultConfig) {
  writeLocalValue(obsidianConfigStorageKey, { ...config, updatedAt: nowIso() });
}

export function loadObsidianQueue() {
  return readLocalValue<ObsidianExportQueueItem[]>(obsidianQueueStorageKey, []);
}

export function saveObsidianQueue(queue: ObsidianExportQueueItem[]) {
  writeLocalValue(obsidianQueueStorageKey, queue);
}

export function appendObsidianQueueItems(queueItems: ObsidianExportQueueItem[]) {
  writeLocalValue(obsidianQueueStorageKey, [...queueItems, ...loadObsidianQueue()].slice(0, 200));
}

export function loadObsidianLogs() {
  return readLocalValue<ObsidianSyncLog[]>(obsidianLogsStorageKey, []);
}

export function appendObsidianLog(log: ObsidianSyncLog) {
  writeLocalValue(obsidianLogsStorageKey, [log, ...loadObsidianLogs()].slice(0, 50));
}

export type ObsidianSettingsRow = {
  id?: boolean;
  obsidian_enabled: boolean;
  obsidian_vault_path: string;
  sync_mode: string;
  export_sensitive_data: boolean;
  export_financial_values: boolean;
  export_patient_names: boolean;
  export_contact_phone: boolean;
  default_redaction_mode: string;
  last_sync_at: string | null;
  last_sync_status: string;
  last_sync_error: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ObsidianQueueRow = {
  id?: string;
  entity_type: string;
  entity_id: string;
  export_type: string;
  target_path: string;
  status: string;
  error_message: string;
  attempts: number;
  last_attempt_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ObsidianSyncLogRow = {
  id?: string;
  sync_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  files_created: number;
  files_updated: number;
  files_failed: number;
  error_message: string;
  triggered_by_user_id: string | null;
  created_at?: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asUuidOrNull(value: string | null | undefined) {
  return value && uuidPattern.test(value) ? value : null;
}

function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function obsidianConfigFromSettingsRow(row: ObsidianSettingsRow): ObsidianVaultConfig {
  return {
    enabled: !!row.obsidian_enabled,
    vaultPath: row.obsidian_vault_path ?? "",
    syncMode: oneOf(row.sync_mode, ["MANUAL", "AUTO_DAILY", "AUTO_WEEKLY", "ON_DEMAND"], "MANUAL"),
    exportSensitiveData: !!row.export_sensitive_data,
    exportFinancialValues: !!row.export_financial_values,
    exportPatientNames: !!row.export_patient_names,
    exportContactPhone: !!row.export_contact_phone,
    defaultRedactionMode: oneOf(row.default_redaction_mode, ["NONE", "PARTIAL", "STRICT"], "PARTIAL"),
    lastSyncAt: row.last_sync_at ?? "",
    lastSyncStatus: oneOf(
      row.last_sync_status,
      ["connected", "no_permission", "invalid_path", "awaiting_config", "success", "failed"],
      "awaiting_config",
    ),
    lastSyncError: row.last_sync_error ?? "",
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

export function obsidianConfigToSettingsRow(config: ObsidianVaultConfig): ObsidianSettingsRow {
  return {
    id: true,
    obsidian_enabled: config.enabled,
    obsidian_vault_path: config.vaultPath,
    sync_mode: config.syncMode,
    export_sensitive_data: config.exportSensitiveData,
    export_financial_values: config.exportFinancialValues,
    export_patient_names: config.exportPatientNames,
    export_contact_phone: config.exportContactPhone,
    default_redaction_mode: config.defaultRedactionMode,
    last_sync_at: config.lastSyncAt || null,
    last_sync_status: config.lastSyncStatus,
    last_sync_error: config.lastSyncError,
  };
}

export function obsidianQueueRowFromItem(item: ObsidianExportQueueItem): ObsidianQueueRow {
  return {
    entity_type: item.entityType,
    entity_id: item.entityId,
    export_type: item.exportType,
    target_path: item.targetPath,
    status: item.status,
    error_message: item.errorMessage,
    attempts: item.attempts,
    last_attempt_at: item.lastAttemptAt || null,
  };
}

export function obsidianQueueItemFromRow(row: ObsidianQueueRow): ObsidianExportQueueItem {
  return {
    id: row.id ?? createId("obsq"),
    entityType: oneOf(
      row.entity_type,
      ["DASHBOARD_SNAPSHOT", "CRM_CONTACT", "CRM_DEAL", "CRM_TASK", "CADENCE", "TEMPLATE", "REPORT", "PLAYBOOK", "AUDIT"],
      "REPORT",
    ),
    entityId: row.entity_id,
    exportType: oneOf(row.export_type, ["CREATE", "UPDATE", "DELETE", "SNAPSHOT"], "UPDATE"),
    targetPath: row.target_path,
    status: oneOf(row.status, ["PENDING", "PROCESSING", "DONE", "FAILED", "SKIPPED"], "PENDING"),
    errorMessage: row.error_message ?? "",
    attempts: row.attempts ?? 0,
    lastAttemptAt: row.last_attempt_at ?? "",
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

export function obsidianLogRowFromLog(log: ObsidianSyncLog): ObsidianSyncLogRow {
  return {
    sync_type: log.syncType,
    status: log.status,
    started_at: log.startedAt,
    finished_at: log.finishedAt || null,
    files_created: log.filesCreated,
    files_updated: log.filesUpdated,
    files_failed: log.filesFailed,
    error_message: log.errorMessage,
    triggered_by_user_id: asUuidOrNull(log.triggeredByUserId),
  };
}

export function obsidianLogFromRow(row: ObsidianSyncLogRow): ObsidianSyncLog {
  return {
    id: row.id ?? createId("obslog"),
    syncType: row.sync_type,
    status: oneOf(row.status, ["DONE", "FAILED", "SKIPPED"], "DONE"),
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? "",
    filesCreated: row.files_created ?? 0,
    filesUpdated: row.files_updated ?? 0,
    filesFailed: row.files_failed ?? 0,
    errorMessage: row.error_message ?? "",
    triggeredByUserId: row.triggered_by_user_id ?? "",
    createdAt: row.created_at ?? "",
  };
}

export function sanitizeFileName(value: string) {
  return (value || "Sem titulo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|#\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function yamlValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function generateMarkdownFile({
  title,
  module,
  entityType,
  entityId,
  body,
  config,
  generatedAt = nowIso(),
}: {
  title: string;
  module: string;
  entityType: ObsidianEntityType | string;
  entityId: string;
  body: string;
  config: ObsidianVaultConfig;
  generatedAt?: string;
}) {
  const frontmatter = [
    "---",
    "source: app_bratan",
    `module: ${yamlValue(module)}`,
    `entity_type: ${yamlValue(entityType)}`,
    `entity_id: ${yamlValue(entityId)}`,
    `generated_at: ${yamlValue(generatedAt)}`,
    `last_synced_at: ${yamlValue(generatedAt)}`,
    `redaction_mode: ${yamlValue(config.defaultRedactionMode.toLowerCase())}`,
    `sensitive_data: ${yamlValue(config.exportSensitiveData)}`,
    "---",
  ].join("\n");

  return `${frontmatter}\n\n# ${title}\n\n${body.trim()}\n`;
}

function maskName(name: string, config: ObsidianVaultConfig) {
  if (!config.exportPatientNames || config.defaultRedactionMode === "STRICT") return "Contato protegido";
  const cleaned = name.trim() || "Contato sem nome";
  if (config.defaultRedactionMode === "NONE") return cleaned;
  const [first, ...rest] = cleaned.split(/\s+/);
  const initials = rest.map((part) => `${part[0] ?? ""}.`).filter(Boolean).join(" ");
  return initials ? `${first} ${initials}` : first;
}

function maskPhone(phone: string, config: ObsidianVaultConfig) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (config.exportContactPhone && config.defaultRedactionMode === "NONE") return digits;
  if (config.defaultRedactionMode === "STRICT" || !config.exportContactPhone) return "telefone oculto";
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

export function applyRedactionRules<T extends Record<string, unknown>>(data: T, config: ObsidianVaultConfig): T {
  const redacted: Record<string, unknown> = { ...data };
  const strict = config.defaultRedactionMode === "STRICT";

  for (const key of Object.keys(redacted)) {
    const lower = key.toLowerCase();
    const value = redacted[key];

    if (/(cpf|document|diagnos|exam|bank|banc|medical|medico_detalhe)/i.test(lower)) {
      delete redacted[key];
      continue;
    }

    if (/(phone|whatsapp|telefone|celular)/i.test(lower) && typeof value === "string") {
      redacted[key] = maskPhone(value, config);
      continue;
    }

    if (/(name|nome|patient|paciente)/i.test(lower) && typeof value === "string") {
      redacted[key] = maskName(value, config);
      continue;
    }

    if (!config.exportFinancialValues && /(amount|value|valor|price|receita|faturamento|ticket|cash|caixa)/i.test(lower)) {
      redacted[key] = strict ? "oculto" : "valor oculto";
    }
  }

  return redacted as T;
}

export function testVaultConnection(config: ObsidianVaultConfig) {
  if (!config.enabled) {
    return {
      status: "awaiting_config" as const,
      message: "Ative o Vault Obsidian para liberar exportações.",
    };
  }

  if (!config.vaultPath.trim()) {
    return {
      status: "invalid_path" as const,
      message: "Informe o caminho da pasta do Vault. No navegador, a escrita direta no disco não é permitida; use Exportar ZIP.",
    };
  }

  return {
    status: "connected" as const,
    message: "Configuração válida. Neste app web, a sincronização direta com disco vira exportação ZIP segura.",
  };
}

function file(path: string, entityType: ObsidianEntityType, entityId: string, content: string): ObsidianVaultFile {
  return {
    path: `${vaultRoot}/${path}`,
    entityType,
    entityId,
    content,
  };
}

function readme(config: ObsidianVaultConfig) {
  return generateMarkdownFile({
    title: "Instituto Bratan - Vault Operacional",
    module: "obsidian",
    entityType: "README",
    entityId: "vault-readme",
    config,
    body: [
      "> O APP BRATAN continua sendo a fonte da verdade.",
      "",
      "Este Vault é uma camada de documentação viva para relatórios, snapshots, playbooks, decisões e histórico operacional.",
      "",
      "## Como usar",
      "- Gere exportações no APP BRATAN.",
      "- Importe ou descompacte o ZIP dentro do seu Vault Obsidian.",
      "- Use os arquivos para consulta, reunião, aprendizado e documentação.",
      "",
      "## Segurança e LGPD",
      "- Dados sensíveis são protegidos por padrão.",
      "- CPF, documentos, exames detalhados, dados bancários e conteúdo médico profundo não são exportados.",
      "- Valores financeiros e telefones dependem da configuração do admin.",
      "",
      `Última sincronização: ${config.lastSyncAt || "não realizada"}.`,
    ].join("\n"),
  });
}

export function exportDashboardSnapshot(state: Inteligencia360State, config: ObsidianVaultConfig, reference = new Date()) {
  const snapshot = buildDashboard360Snapshot(state, reference);
  const insights = generateActionRecommendations(state).slice(0, 8);
  const quality = buildDataQuality(state);
  const date = reference.toISOString().slice(0, 10);
  const body = [
    "## Indicadores",
    `- Faturamento vendido: ${config.exportFinancialValues ? money360(snapshot.totalSoldAmount) : "valor oculto"}`,
    `- Receita recebida: ${config.exportFinancialValues ? money360(snapshot.totalReceivedAmount) : "valor oculto"}`,
    `- Ticket médio geral: ${config.exportFinancialValues ? money360(snapshot.averageTicketGeneral) : "valor oculto"}`,
    `- Conversão prescrito x vendido: ${snapshot.prescriptionConversionRate.toFixed(1)}%`,
    `- Retenção: ${snapshot.retentionRate.toFixed(1)}%`,
    `- NPS médio: ${snapshot.npsAverage ? snapshot.npsAverage.toFixed(1) : "sem dado"}`,
    `- Qualidade dos dados: ${snapshot.dataCompletenessScore}%`,
    "",
    "## Insights",
    ...(insights.length ? insights.map((item) => `- **${item.title}**: ${item.recommendation}`) : ["- Sem alertas críticos."]),
    "",
    "## Qualidade dos dados",
    ...quality.map((item) => `- ${item.module}: ${item.status} - ${item.message}`),
    "",
    `Origem no app: ${moduleRoutes360.dashboard}`,
  ].join("\n");

  return file(
    `02_Dashboard_360/Snapshots_Diarios/${date} - Snapshot Dashboard 360.md`,
    "DASHBOARD_SNAPSHOT",
    `dashboard-${date}`,
    generateMarkdownFile({ title: `${date} - Snapshot Dashboard 360`, module: "dashboard_360", entityType: "DASHBOARD_SNAPSHOT", entityId: `dashboard-${date}`, body, config }),
  );
}

export function exportWeeklyKickoff(state: Inteligencia360State, config: ObsidianVaultConfig, reference = new Date()) {
  const year = reference.getFullYear();
  const week = Math.ceil((((reference.getTime() - new Date(year, 0, 1).getTime()) / 86400000) + new Date(year, 0, 1).getDay() + 1) / 7);
  const title = `${year}-W${String(week).padStart(2, "0")} - Kickoff Semanal`;
  return file(
    `06_Relatorios/Kickoff/${title}.md`,
    "REPORT",
    `kickoff-${year}-${week}`,
    generateMarkdownFile({ title, module: "inteligencia_360", entityType: "REPORT", entityId: `kickoff-${year}-${week}`, body: generateWeeklyKickoffBrief(state), config }),
  );
}

export function exportDailyBriefing(crm: CrmState, config: ObsidianVaultConfig, reference = new Date()) {
  const date = reference.toISOString().slice(0, 10);
  const openTasks = crm.tasks.filter((task) => !["DONE", "CANCELED", "SKIPPED"].includes(task.status));
  const todayTasks = openTasks.filter((task) => task.dueAt.slice(0, 10) === date);
  const overdueTasks = openTasks.filter((task) => taskEffectiveStatus(task, reference) === "OVERDUE");
  const dealsWithoutNextAction = crm.deals.filter((deal) => deal.status === "OPEN" && !openTasks.some((task) => task.dealId === deal.id));
  const body = [
    "## Briefing diário CRM",
    `- Tarefas de hoje: ${todayTasks.length}`,
    `- Tarefas vencidas: ${overdueTasks.length}`,
    `- Negociações sem próxima ação: ${dealsWithoutNextAction.length}`,
    `- Leads/contatos na base: ${crm.contacts.length}`,
    `- Negociações abertas: ${crm.deals.filter((deal) => deal.status === "OPEN").length}`,
    "",
    "## Próximas tarefas",
    ...(todayTasks.slice(0, 12).map((task) => `- ${task.title} - ${formatCrmDateTime(task.dueAt)}`)),
    "",
    "## Sem próxima ação",
    ...(dealsWithoutNextAction.slice(0, 12).map((deal) => `- ${deal.title} (${dealStageLabels[deal.stage]})`)),
    "",
    `Origem no app: ${crmModuleRoutes.tasks}`,
  ].join("\n");

  return file(
    `02_Dashboard_360/Briefings/${date} - Briefing Diário CRM.md`,
    "REPORT",
    `crm-briefing-${date}`,
    generateMarkdownFile({ title: `${date} - Briefing Diário CRM`, module: "crm", entityType: "REPORT", entityId: `crm-briefing-${date}`, body, config }),
  );
}

export function exportCrmContactSummary(contact: CrmContact, crm: CrmState, config: ObsidianVaultConfig) {
  const safe = applyRedactionRules(
    {
      name: contactDisplayName(contact),
      phone: contact.whatsapp || contact.phone,
      source: contact.sourceChannel,
      mainPain: config.exportSensitiveData ? contact.mainPain : "oculto por LGPD",
      mainGoal: contact.mainGoal,
    },
    config,
  );
  const openTasks = crm.tasks.filter((task) => task.contactId === contact.id && !["DONE", "CANCELED", "SKIPPED"].includes(task.status));
  const deals = crm.deals.filter((deal) => deal.contactId === contact.id);
  const folder = contact.contactType === "PATIENT" ? "Pacientes" : contact.contactType === "LEAD" ? "Leads" : "Contatos";
  const title = `CRM - Contato - ${sanitizeFileName(String(safe.name))}`;
  const body = [
    `- Referência: ${contact.id}`,
    `- Nome: ${safe.name}`,
    `- Telefone: ${safe.phone || "não exportado"}`,
    `- Origem: ${safe.source || "não informado"}`,
    `- Etapa atual: ${contact.lifecycleStage}`,
    `- Objetivo: ${safe.mainGoal || "não informado"}`,
    `- Dor/interesse: ${safe.mainPain || "não exportado"}`,
    "",
    "## Próximas tarefas",
    ...(openTasks.length ? openTasks.slice(0, 8).map((task) => `- ${task.title} - ${formatCrmDateTime(task.dueAt)}`) : ["- Sem próxima tarefa aberta."]),
    "",
    "## Negociações",
    ...(deals.length ? deals.map((deal) => `- ${deal.title} - ${dealStageLabels[deal.stage]}`) : ["- Sem negociação vinculada."]),
    "",
    `Origem no app: ${crmModuleRoutes.contact(contact.id)}`,
  ].join("\n");

  return file(
    `01_CRM/${folder}/${title}.md`,
    "CRM_CONTACT",
    contact.id,
    generateMarkdownFile({ title, module: "crm", entityType: "CRM_CONTACT", entityId: contact.id, body, config }),
  );
}

export function exportDealSummary(deal: CrmDeal, crm: CrmState, config: ObsidianVaultConfig) {
  const contact = crm.contacts.find((item) => item.id === deal.contactId);
  const safeContactName = maskName(contactDisplayName(contact), config);
  const openTasks = crm.tasks.filter((task) => task.dealId === deal.id && !["DONE", "CANCELED", "SKIPPED"].includes(task.status));
  const title = `Deal - ${sanitizeFileName(deal.title)} - ${deal.createdAt.slice(0, 10)}`;
  const body = [
    `- Contato: ${safeContactName}`,
    `- Etapa: ${dealStageLabels[deal.stage]}`,
    `- Responsável: ${deal.ownerUserId || "não informado"}`,
    `- Origem: ${deal.sourceChannel || "não informado"}`,
    `- Valor potencial: ${config.exportFinancialValues ? moneyCrm(deal.estimatedValue) : "valor oculto"}`,
    `- Valor vendido: ${config.exportFinancialValues ? moneyCrm(deal.soldAmount) : "valor oculto"}`,
    `- Objeção: ${deal.mainObjection || "sem objeção registrada"}`,
    "",
    "## Próximas ações",
    ...(openTasks.length ? openTasks.map((task) => `- ${task.title} - ${formatCrmDateTime(task.dueAt)}`) : ["- Sem próxima ação."]),
    "",
    `Origem no app: ${crmModuleRoutes.deals}`,
  ].join("\n");

  return file(
    `01_CRM/Negociacoes/${title}.md`,
    "CRM_DEAL",
    deal.id,
    generateMarkdownFile({ title, module: "crm", entityType: "CRM_DEAL", entityId: deal.id, body, config }),
  );
}

export function exportCadencePlaybooks(crm: CrmState, config: ObsidianVaultConfig) {
  return crm.cadences.map((cadence) => {
    const steps = crm.cadenceSteps.filter((step) => step.cadenceId === cadence.id).sort((a, b) => a.stepOrder - b.stepOrder);
    const title = `Cadência - ${sanitizeFileName(cadence.name)}`;
    const body = [
      cadence.description,
      "",
      "## Passos",
      ...steps.map((step) => `- ${step.stepOrder}. ${step.name} (${step.offsetValue} dias) - ${step.taskType}`),
      "",
      "## Regra",
      "Mensagens são geradas para aprovação humana. O APP não envia automaticamente nesta fase.",
    ].join("\n");

    return file(
      `03_Cadencias/${cadence.defaultOwnerRole === "ENFERMAGEM" ? "Enfermagem" : cadence.defaultOwnerRole === "CONCIERGE" ? "Concierge" : cadence.cadenceType.includes("RESCUE") ? "Resgate" : "Comercial"}/${title}.md`,
      "CADENCE",
      cadence.id,
      generateMarkdownFile({ title, module: "crm_cadencias", entityType: "CADENCE", entityId: cadence.id, body, config }),
    );
  });
}

export function exportMessageTemplates(templates: CrmMessageTemplate[], config: ObsidianVaultConfig) {
  return templates.map((template) => {
    const title = `Template - ${sanitizeFileName(template.name)}`;
    const body = [
      `- Canal: ${template.channel}`,
      `- Responsável: ${template.roleOwner}`,
      `- Categoria: ${template.category}`,
      "",
      "```text",
      template.body,
      "```",
    ].join("\n");

    return file(
      `09_Templates/Mensagens/${title}.md`,
      "TEMPLATE",
      template.id,
      generateMarkdownFile({ title, module: "crm_templates", entityType: "TEMPLATE", entityId: template.id, body, config }),
    );
  });
}

export function exportDataQualityReport(state: Inteligencia360State, config: ObsidianVaultConfig, reference = new Date()) {
  const date = reference.toISOString().slice(0, 10);
  const quality = buildDataQuality(state);
  const title = `${date} - Qualidade dos Dados`;
  const body = [
    "## Pendências",
    ...quality.map((item) => `- **${item.module}**: ${item.status} - ${item.message}. Impacto: ${item.impact}`),
  ].join("\n");

  return file(
    `08_Auditoria/Qualidade_Dados/${title}.md`,
    "AUDIT",
    `quality-${date}`,
    generateMarkdownFile({ title, module: "dashboard_360", entityType: "AUDIT", entityId: `quality-${date}`, body, config }),
  );
}

export function ensureVaultStructure(config: ObsidianVaultConfig): ObsidianVaultFile[] {
  const folderList = vaultFolders.map((folderName) => `- ${vaultRoot}/${folderName}`).join("\n");
  return [
    file("README.md", "PLAYBOOK", "vault-readme", readme(config)),
    file(
      "99_Arquivos_Gerados/Estrutura do Vault.md",
      "PLAYBOOK",
      "vault-structure",
      generateMarkdownFile({
        title: "Estrutura do Vault",
        module: "obsidian",
        entityType: "PLAYBOOK",
        entityId: "vault-structure",
        config,
        body: `## Pastas padrão\n${folderList}`,
      }),
    ),
  ];
}

export function buildVaultExportFiles({
  crm,
  inteligencia,
  config,
  reference = new Date(),
  includeContacts = true,
  includeDeals = true,
  includePlaybooks = true,
}: {
  crm: CrmState;
  inteligencia: Inteligencia360State;
  config: ObsidianVaultConfig;
  reference?: Date;
  includeContacts?: boolean;
  includeDeals?: boolean;
  includePlaybooks?: boolean;
}) {
  const files: ObsidianVaultFile[] = [
    ...ensureVaultStructure(config),
    exportDashboardSnapshot(inteligencia, config, reference),
    exportWeeklyKickoff(inteligencia, config, reference),
    exportDailyBriefing(crm, config, reference),
    exportDataQualityReport(inteligencia, config, reference),
  ];

  if (includeContacts) {
    files.push(...crm.contacts.slice(0, 30).map((contact) => exportCrmContactSummary(contact, crm, config)));
  }
  if (includeDeals) {
    files.push(...crm.deals.slice(0, 40).map((deal) => exportDealSummary(deal, crm, config)));
  }
  if (includePlaybooks) {
    files.push(...exportCadencePlaybooks(crm, config));
    files.push(...exportMessageTemplates(crm.messageTemplates, config));
  }

  return files;
}

export function enqueueExport(fileItem: ObsidianVaultFile, status: ObsidianExportStatus = "PENDING"): ObsidianExportQueueItem {
  const now = nowIso();
  return {
    id: createId("obsq"),
    entityType: fileItem.entityType,
    entityId: fileItem.entityId,
    exportType: fileItem.entityType === "DASHBOARD_SNAPSHOT" ? "SNAPSHOT" : "UPDATE",
    targetPath: fileItem.path,
    status,
    errorMessage: "",
    attempts: status === "PENDING" ? 0 : 1,
    lastAttemptAt: status === "PENDING" ? "" : now,
    createdAt: now,
    updatedAt: now,
  };
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function uint16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function toArrayBuffer(part: Uint8Array) {
  const copy = new Uint8Array(part.byteLength);
  copy.set(part);
  return copy.buffer;
}

export function exportVaultAsZip(files: ObsidianVaultFile[], zipName = `app-bratan-vault-${todayISO()}.zip`) {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const fileItem of files) {
    const name = textEncoder.encode(fileItem.path);
    const data = textEncoder.encode(fileItem.content);
    const checksum = crc32(data);
    const localHeader = new Uint8Array([
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(time),
      ...uint16(date),
      ...uint32(checksum),
      ...uint32(data.length),
      ...uint32(data.length),
      ...uint16(name.length),
      ...uint16(0),
    ]);
    chunks.push(localHeader, name, data);

    const centralHeader = new Uint8Array([
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(time),
      ...uint16(date),
      ...uint32(checksum),
      ...uint32(data.length),
      ...uint32(data.length),
      ...uint16(name.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
    ]);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array([
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(centralSize),
    ...uint32(offset),
    ...uint16(0),
  ]);

  const blobParts = [...chunks, ...central, end].map(toArrayBuffer);

  return {
    name: zipName,
    blob: new Blob(blobParts, { type: "application/zip" }),
  };
}

export function buildObsidianExportBundle(crm: CrmState, inteligencia: Inteligencia360State, config: ObsidianVaultConfig, triggeredByUserId = "preview"): ObsidianExportBundle {
  const startedAt = nowIso();
  const files = buildVaultExportFiles({ crm, inteligencia, config });
  const finishedAt = nowIso();
  const queueItems = files.map((fileItem) => enqueueExport(fileItem, "DONE"));
  const log: ObsidianSyncLog = {
    id: createId("obslog"),
    syncType: "EXPORT_ZIP",
    status: "DONE",
    startedAt,
    finishedAt,
    filesCreated: files.length,
    filesUpdated: 0,
    filesFailed: 0,
    errorMessage: "",
    triggeredByUserId,
    createdAt: finishedAt,
  };

  return { files, queueItems, log };
}

export function recordObsidianFilesExport(files: ObsidianVaultFile[], syncType: string, triggeredByUserId = "preview") {
  const startedAt = nowIso();
  const finishedAt = nowIso();
  const queueItems = files.map((fileItem) => enqueueExport(fileItem, "DONE"));
  const log: ObsidianSyncLog = {
    id: createId("obslog"),
    syncType,
    status: "DONE",
    startedAt,
    finishedAt,
    filesCreated: files.length,
    filesUpdated: 0,
    filesFailed: 0,
    errorMessage: "",
    triggeredByUserId,
    createdAt: finishedAt,
  };

  appendObsidianQueueItems(queueItems);
  appendObsidianLog(log);
  return { queueItems, log };
}

export function downloadObsidianFiles(files: ObsidianVaultFile[], fileName: string, syncType = "EXPORT_PARTIAL", triggeredByUserId = "preview") {
  const zip = exportVaultAsZip(files, fileName);
  downloadBlob(zip.blob, zip.name);
  recordObsidianFilesExport(files, syncType, triggeredByUserId);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
