import { personNamesMatch } from "./nameMatch";
import { isCoordenacao } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import type { Cargo, Pessoa } from "@/types/database";
import {
  loadInteligencia360State,
  mergePrescriptionReceivables,
  saveInteligencia360State,
  type ActionItem360,
  type Inteligencia360State,
  type PatientExperience,
  type PatientJourney,
  type PrescriptionSale,
  type Receivable,
  type RelationshipTouchpoint,
} from "@/features/inteligencia360/inteligencia360Data";

export type CrmRole =
  | "SUPER_ADMIN"
  | "ADMIN_GESTAO"
  | "FINANCEIRO"
  | "COMERCIAL_GESTOR"
  | "COMERCIAL_VENDEDOR"
  | "SDR_LEADS"
  | "MEDICO"
  | "RECEPCAO"
  | "ENFERMAGEM"
  | "CONCIERGE"
  | "ADMINISTRATIVO";

export type CrmContactType = "LEAD" | "PATIENT" | "FORMER_PATIENT" | "OTHER";
export type CrmLifecycleStage =
  | "COLD_LEAD"
  | "WARM_LEAD"
  | "QUALIFIED_LEAD"
  | "SCHEDULED"
  | "CONSULTED"
  | "PRESCRIBED"
  | "NEGOTIATION"
  | "CLOSED_PATIENT"
  | "ACTIVE_PATIENT"
  | "FOLLOW_UP"
  | "RESCUE"
  | "CHURN"
  | "INACTIVE";
export type CrmLeadTemperature = "COLD" | "WARM" | "HOT";
export type CrmPersonaFit = "AAA" | "HIGH_TICKET" | "MEDIUM" | "LOW_FIT" | "UNKNOWN";
export type CrmTaskType =
  | "WHATSAPP"
  | "CALL"
  | "EMAIL"
  | "IN_PERSON"
  | "INTERNAL_CHECK"
  | "CONTRACT"
  | "PAYMENT"
  | "SCHEDULE"
  | "FOLLOW_UP"
  | "RESCUE"
  | "CHURN_INVESTIGATION";
export type CrmTaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "SKIPPED" | "CANCELED" | "OVERDUE";
export type CrmPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CrmVisibilityScope = "OWNER_ONLY" | "ROLE" | "MANAGEMENT" | "ALL_ALLOWED";
export type CrmGeneratedBy = "MANUAL" | "CADENCE_ENGINE" | "PIPELINE_STAGE" | "INTELLIGENCE_ENGINE" | "IMPORT";
export type CrmTaskResult =
  | "RESPONDED"
  | "NO_RESPONSE"
  | "SCHEDULED"
  | "RESCHEDULED"
  | "SOLD"
  | "NOT_SOLD"
  | "SENT"
  | "NEEDS_MANAGER"
  | "OTHER";
export type CrmDealType = "FIRST_CONSULTATION" | "TREATMENT_PLAN" | "RENEWAL" | "RESCUE" | "UPSELL" | "CROSS_SELL";
export type CrmDealStage =
  | "LEAD_FRIO"
  | "LEAD_NOVO"
  | "CONTATADO"
  | "QUALIFICADO"
  | "CONSULTA_AGENDADA"
  | "CONSULTA_CONFIRMADA"
  | "CONSULTA_REALIZADA"
  | "PRESCRICAO_FEITA"
  | "EM_NEGOCIACAO"
  | "FECHOU_COMPLETO"
  | "FECHOU_PARCIAL"
  | "NAO_FECHOU"
  | "RECUPERACAO_D1_MEDICO"
  | "RECUPERACAO_D2_GESTOR"
  | "PERDIDO"
  | "RESGATE_D60"
  | "CHURN"
  | "NAO_ADESAO"; // POP v3.1: não aderiu nem após o contato do médico (comercial encerrado)

// Jornada PROGRAMA (régua pós-fechamento): eixo SEPARADO do stage comercial.
// O stage do deal registra a história comercial (ficou em FECHOU_*); a fase do
// programa é o que anda na trilha de cuidado. Ver programPhaseSpecs.
export type CrmProgramPhase =
  | "FECHAMENTO_D0" // fase 1
  | "TRES_CONTATOS_D1" // fase 2 — GATE: recepção + concierge + enfermeira
  | "AGENDAMENTO" // fase 3 — recepção monta a agenda no Feegow
  | "CADENCIA_PROGRAMA" // fase 4 — 6 a 9 meses
  | "ENCERRAMENTO"; // fase 5 — renovação / manutenção / alta
export type CrmProgramOutcome = "RENOVACAO" | "MANUTENCAO" | "ALTA";
export type CrmJourney = "COMERCIAL" | "PROGRAMA";
// Canal escolhido no fechamento (POP v3.1).
export type CrmAdhesionChannel = "PROGRAMA_ACOMPANHAMENTO" | "CLUBE_BRATAN" | "SOMENTE_TRATAMENTO";
export type CrmDealStatus = "OPEN" | "WON_FULL" | "WON_PARTIAL" | "LOST" | "PAUSED";
export type CrmObjectionCategory =
  | "PRICE"
  | "TRUST"
  | "TIMING"
  | "SPOUSE_OR_FAMILY"
  | "PAYMENT_METHOD"
  | "NEEDS_MORE_INFORMATION"
  | "NO_PERCEIVED_VALUE"
  | "NO_RESPONSE"
  | "OTHER";

export const objectionCategoryLabels: Record<CrmObjectionCategory, string> = {
  PRICE: "Preço / condição financeira",
  TRUST: "Confiança",
  TIMING: "Momento de vida",
  SPOUSE_OR_FAMILY: "Precisa falar com família",
  PAYMENT_METHOD: "Forma de pagamento",
  NEEDS_MORE_INFORMATION: "Quer mais informações",
  NO_PERCEIVED_VALUE: "Não viu valor ainda",
  NO_RESPONSE: "Sem resposta",
  OTHER: "Outro motivo",
};
export type CrmCadenceType =
  | "COLD_LEAD"
  | "COMMERCIAL_FOLLOW_UP"
  | "POST_CONSULTATION_NOT_CLOSED"
  | "POST_SALE_CONCIERGE"
  | "NURSING_14_DAYS"
  | "POST_APPLICATION_NURSING"
  | "MONTHLY_CHECKPOINT"
  | "RETURN_CYCLE"
  | "RESCUE_60_DAYS"
  | "ANNIVERSARY_1Y"
  | "GOOGLE_REVIEW";
export type CrmCadenceStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELED";
export type CrmOffsetType = "DAYS_AFTER_TRIGGER" | "BEFORE_EVENT_DATE" | "AFTER_EVENT_DATE" | "RECURRING_EVERY_X_DAYS" | "RECURRING_EVERY_X_MONTHS";
export type CrmTimeWindow = "MORNING" | "AFTERNOON" | "EVENING" | "ANY";
export type CrmChannel = "WHATSAPP" | "CALL" | "EMAIL" | "IN_PERSON" | "INTERNAL";
export type CrmSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "NO_RESPONSE";

export type CrmContact = {
  id: string;
  contactType: CrmContactType;
  lifecycleStage: CrmLifecycleStage;
  fullName: string;
  preferredName: string;
  phone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  sourceChannel: string;
  acquisitionCampaign: string;
  leadTemperature: CrmLeadTemperature;
  personaFit: CrmPersonaFit;
  mainPain: string;
  mainGoal: string;
  ownerUserId: string;
  commercialOwnerId: string;
  conciergeOwnerId: string;
  nurseOwnerId: string;
  doctorId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  optOut?: boolean;
};

export type CrmTask = {
  id: string;
  contactId: string;
  dealId: string;
  cadenceId: string;
  cadenceStepId: string;
  title: string;
  description: string;
  taskType: CrmTaskType;
  assignedToUserId: string;
  assignedToRole: CrmRole;
  dueAt: string;
  completedAt: string | null;
  status: CrmTaskStatus;
  priority: CrmPriority;
  visibilityScope: CrmVisibilityScope;
  generatedBy: CrmGeneratedBy;
  result: CrmTaskResult | "";
  resultNotes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Tarefa que compõe o GATE de uma fase do Programa (ex.: os 3 contatos do D+1).
  isGate?: boolean;
  gatePhase?: CrmProgramPhase; // a qual fase este gate pertence
};

export type CrmDeal = {
  id: string;
  contactId: string;
  title: string;
  dealType: CrmDealType;
  stage: CrmDealStage;
  estimatedValue: number;
  prescribedAmount: number;
  soldAmount: number;
  receivedAmount: number;
  probability: number;
  status: CrmDealStatus;
  mainObjection: string;
  objectionCategory: CrmObjectionCategory;
  sourceChannel: string;
  ownerUserId: string;
  doctorId: string;
  expectedCloseDate: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // --- Jornada PROGRAMA (pós-fechamento). Opcionais → retrocompatível. ---
  programPhase?: CrmProgramPhase | null; // null/ausente = ainda na jornada comercial
  programPhaseEnteredAt?: string; // quando entrou na fase atual (auditoria)
  programPhaseActorId?: string; // quem disparou a entrada (auditoria)
  programOutcome?: CrmProgramOutcome | null; // desfecho ao encerrar
  adhesionChannel?: CrmAdhesionChannel | null; // canal escolhido no fechamento
};

export type CrmCadence = {
  id: string;
  name: string;
  description: string;
  cadenceType: CrmCadenceType;
  defaultOwnerRole: CrmRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CrmCadenceStep = {
  id: string;
  cadenceId: string;
  stepOrder: number;
  name: string;
  offsetType: CrmOffsetType;
  offsetValue: number;
  preferredTimeWindow: CrmTimeWindow;
  taskType: CrmTaskType;
  assignedToRole: CrmRole;
  messageTemplateId: string;
  required: boolean;
  pauseIfContactResponded: boolean;
  cancelIfStageChanged: boolean;
  active: boolean;
};

export type CrmCadenceEnrollment = {
  id: string;
  cadenceId: string;
  contactId: string;
  dealId: string;
  status: CrmCadenceStatus;
  enrolledAt: string;
  triggerSource: string;
  triggerDate: string;
  ownerUserId: string;
  ownerRole: CrmRole;
  completedAt: string | null;
  canceledReason: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmMessageTemplate = {
  id: string;
  name: string;
  category: string;
  roleOwner: CrmRole;
  cadenceType: CrmCadenceType;
  channel: CrmChannel;
  body: string;
  variables: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CrmTouchpoint = {
  id: string;
  contactId: string;
  taskId: string;
  cadenceId: string;
  touchType: CrmTaskType;
  channel: CrmChannel;
  sentByUserId: string;
  sentAt: string;
  responseReceived: boolean;
  responseAt: string | null;
  responseSummary: string;
  sentiment: CrmSentiment;
  createdAt: string;
};

export type CrmTimelineEvent = {
  id: string;
  contactId: string;
  eventType: string;
  eventTitle: string;
  eventDescription: string;
  sourceModule: "CRM" | "COMERCIAL" | "JORNADA" | "EXPERIENCIA" | "RECEBIVEIS" | "CONTRATOS" | "INTELIGENCIA_360";
  sourceId: string;
  createdBy: string;
  createdAt: string;
};

export type CrmState = {
  contacts: CrmContact[];
  deals: CrmDeal[];
  tasks: CrmTask[];
  cadences: CrmCadence[];
  cadenceSteps: CrmCadenceStep[];
  cadenceEnrollments: CrmCadenceEnrollment[];
  messageTemplates: CrmMessageTemplate[];
  touchpoints: CrmTouchpoint[];
  timelineEvents: CrmTimelineEvent[];
};

export type CrmMoveDealOptions = {
  stage: CrmDealStage;
  actorId: string;
  scheduledAt?: string;
  prescribedAmount?: number;
  soldAmount?: number;
  receivedAmount?: number;
  objection?: string;
  objectionCategory?: CrmObjectionCategory;
  partialReason?: string;
};

// v2 (03/07/2026): chave trocada para descartar caches antigos que continham dados fictícios.
export const crmStorageKey = "app-bratan-crm-v2";

const baseNow = new Date().toISOString();

export const crmRoleLabels: Record<CrmRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN_GESTAO: "Gestão",
  FINANCEIRO: "Financeiro",
  COMERCIAL_GESTOR: "Comercial gestor",
  COMERCIAL_VENDEDOR: "Comercial",
  SDR_LEADS: "SDR / Leads",
  MEDICO: "Médico",
  RECEPCAO: "Recepção",
  ENFERMAGEM: "Enfermagem",
  CONCIERGE: "Concierge",
  ADMINISTRATIVO: "Administrativo",
};

export const lifecycleLabels: Record<CrmLifecycleStage, string> = {
  COLD_LEAD: "Lead frio",
  WARM_LEAD: "Lead aquecido",
  QUALIFIED_LEAD: "Lead qualificado",
  SCHEDULED: "Consulta agendada",
  CONSULTED: "Consulta realizada",
  PRESCRIBED: "Prescrito",
  NEGOTIATION: "Em negociação",
  CLOSED_PATIENT: "Paciente fechado",
  ACTIVE_PATIENT: "Paciente ativo",
  FOLLOW_UP: "Follow-up",
  RESCUE: "Resgate",
  CHURN: "Churn",
  INACTIVE: "Inativo",
};

export const taskTypeLabels: Record<CrmTaskType, string> = {
  WHATSAPP: "WhatsApp",
  CALL: "Ligação",
  EMAIL: "E-mail",
  IN_PERSON: "Presencial",
  INTERNAL_CHECK: "Conferência",
  CONTRACT: "Contrato",
  PAYMENT: "Pagamento",
  SCHEDULE: "Agenda",
  FOLLOW_UP: "Follow-up",
  RESCUE: "Resgate",
  CHURN_INVESTIGATION: "Churn",
};

export const taskStatusLabels: Record<CrmTaskStatus, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  SKIPPED: "Pulada",
  CANCELED: "Cancelada",
  OVERDUE: "Atrasada",
};

export const taskResultLabels: Record<CrmTaskResult, string> = {
  RESPONDED: "Respondeu",
  NO_RESPONSE: "Sem resposta",
  SCHEDULED: "Agendou",
  RESCHEDULED: "Remarcou",
  SOLD: "Vendeu",
  NOT_SOLD: "Não vendeu",
  SENT: "Enviado",
  NEEDS_MANAGER: "Precisa de gestor",
  OTHER: "Outro",
};

export const priorityLabels: Record<CrmPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

// Explicação de cada coluna do Kanban em linguagem simples (para quem é leigo).
export const dealStageHints: Record<CrmDealStage, string> = {
  LEAD_FRIO: "Pessoa que demonstrou interesse mas ainda não conversamos de verdade.",
  LEAD_NOVO: "Acabou de chegar (indicação, Instagram, cadência). Primeiro contato ainda não foi feito.",
  CONTATADO: "Já falamos com a pessoa pelo menos uma vez. Aguardando ela evoluir.",
  QUALIFICADO: "Tem perfil e interesse reais. Hora de puxar para a consulta.",
  CONSULTA_AGENDADA: "Consulta marcada. A recepção confirma e orienta a chegada.",
  CONSULTA_CONFIRMADA: "Paciente confirmou presença. É garantir o acolhimento.",
  CONSULTA_REALIZADA: "Passou pelo Dr. Daniel. Aguardando a proposta do plano.",
  PRESCRICAO_FEITA: "Médico prescreveu. Vendas apresenta o valor cheio e o preço Bratan.",
  EM_NEGOCIACAO: "Proposta na mesa. Follow-up até decidir.",
  FECHOU_COMPLETO: "Comprou o plano inteiro! Presente, concierge D+1, agendamentos e contrato saem sozinhos.",
  FECHOU_PARCIAL: "Fechou uma parte. Registre o motivo — o resto do fluxo é igual ao completo.",
  NAO_FECHOU: "Não fechou (objeção registrada). O médico entra em D+1 e, se não responder, o gestor em D+2.",
  RECUPERACAO_D1_MEDICO: "Dr. Daniel está tentando reverter a objeção (dia seguinte à consulta).",
  RECUPERACAO_D2_GESTOR: "Médico não reverteu: agora é o Estevão quem conversa (2 dias depois).",
  PERDIDO: "Não vai fechar agora. Entra nos resgates futuros (60 dias, 6 meses, 1 ano).",
  RESGATE_D60: "Sumiu do ciclo: a Aline faz as 5 tentativas de resgate.",
  CHURN: "Pausou por condição real (dinheiro, momento de vida). Não é perdido: a Aline investiga o motivo e o resgate fica agendado sozinho para daqui a 6 meses.",
  NAO_ADESAO: "Não aderiu nem após o contato do Dr. Daniel. Vendas encerra aqui; o paciente segue na base para os resgates futuros.",
};

export const dealStageLabels: Record<CrmDealStage, string> = {
  LEAD_FRIO: "Lead frio",
  LEAD_NOVO: "Lead novo",
  CONTATADO: "Contatado",
  QUALIFICADO: "Qualificado",
  CONSULTA_AGENDADA: "Consulta agendada",
  CONSULTA_CONFIRMADA: "Consulta confirmada",
  CONSULTA_REALIZADA: "Consulta realizada",
  PRESCRICAO_FEITA: "Prescrição feita",
  EM_NEGOCIACAO: "Em negociação",
  FECHOU_COMPLETO: "Fechou completo",
  FECHOU_PARCIAL: "Fechou parcial",
  NAO_FECHOU: "Não fechou",
  RECUPERACAO_D1_MEDICO: "Recuperação D+1 Médico",
  RECUPERACAO_D2_GESTOR: "Recuperação D+2 Gestor",
  PERDIDO: "Perdido",
  RESGATE_D60: "Resgate D60",
  CHURN: "Churn (pausou)",
  NAO_ADESAO: "Não adesão",
};

export const dealStages: CrmDealStage[] = [
  "LEAD_FRIO",
  "LEAD_NOVO",
  "CONTATADO",
  "QUALIFICADO",
  "CONSULTA_AGENDADA",
  "CONSULTA_CONFIRMADA",
  "CONSULTA_REALIZADA",
  "PRESCRICAO_FEITA",
  "EM_NEGOCIACAO",
  "FECHOU_COMPLETO",
  "FECHOU_PARCIAL",
  "NAO_FECHOU",
  "RECUPERACAO_D1_MEDICO",
  "RECUPERACAO_D2_GESTOR",
  "PERDIDO",
  "RESGATE_D60",
  "CHURN",
];

export const cadenceTypeLabels: Record<CrmCadenceType, string> = {
  COLD_LEAD: "Lead frio D1/D5/D7/D60",
  COMMERCIAL_FOLLOW_UP: "Follow-up comercial",
  POST_CONSULTATION_NOT_CLOSED: "Não fechou - Médico/Gestor",
  POST_SALE_CONCIERGE: "Concierge D+1",
  NURSING_14_DAYS: "Enfermagem 14 dias",
  POST_APPLICATION_NURSING: "Pós-aplicação",
  MONTHLY_CHECKPOINT: "Checkpoint mensal",
  RETURN_CYCLE: "Ciclo de retorno",
  RESCUE_60_DAYS: "Resgate D60",
  ANNIVERSARY_1Y: "Aniversário 1 ano",
  GOOGLE_REVIEW: "Avaliação Google",
};

export const crmModuleRoutes = {
  tasks: "/crm/minhas-tarefas",
  deals: "/crm/vendas",
  cadences: "/crm/cadencias",
  contact: (id: string) => `/crm/contatos/${id}`,
} as const;

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function atLocalTime(dateIso: string, hour = 9, minute = 0) {
  return `${dateIso.slice(0, 10)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function createCrmId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s@.+-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D+/g, "");
}

export function moneyCrm(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
}

export function formatCrmDateTime(value: string | null | undefined) {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function cargoToCrmRole(cargo: Cargo | null | undefined): CrmRole | null {
  if (!cargo) return null;
  if (cargo === "dr_daniel") return "MEDICO";
  if (cargo === "ceo" || cargo === "gestor") return "ADMIN_GESTAO";
  if (cargo === "gestor_financeiro") return "FINANCEIRO";
  if (cargo === "marketing") return "SDR_LEADS";
  if (cargo === "secretaria_executiva") return "CONCIERGE";
  if (cargo === "recepcionista") return "RECEPCAO";
  if (cargo === "enfermeira" || cargo === "nutricionista") return "ENFERMAGEM";
  return null;
}

export function canCrm(cargo: Cargo | null | undefined) {
  return Boolean(cargo && cargo !== "limpeza");
}

export function isCrmManagement(cargo: Cargo | null | undefined) {
  return Boolean(cargo && (isCoordenacao(cargo) || cargo === "gestor_financeiro"));
}

export function canUserSeeFinancialValues(cargo: Cargo | null | undefined) {
  return Boolean(cargo && (isCoordenacao(cargo) || cargo === "recepcionista"));
}

export function canUserSeeSensitiveDetails(cargo: Cargo | null | undefined) {
  return Boolean(cargo && (isCoordenacao(cargo) || cargo === "enfermeira" || cargo === "nutricionista" || cargo === "secretaria_executiva"));
}

export function canUserAccessTask(pessoa: Pessoa | null | undefined, task: CrmTask) {
  if (!pessoa?.cargo) return false;
  if (isCrmManagement(pessoa.cargo)) return true;
  if (task.assignedToUserId && task.assignedToUserId === pessoa.id) return true;
  const role = cargoToCrmRole(pessoa.cargo);
  return Boolean(role && task.assignedToRole === role);
}

export function canUserAccessContact(pessoa: Pessoa | null | undefined, contact: CrmContact) {
  if (!pessoa?.cargo) return false;
  if (isCrmManagement(pessoa.cargo)) return true;
  if ([contact.ownerUserId, contact.commercialOwnerId, contact.conciergeOwnerId, contact.nurseOwnerId, contact.doctorId].includes(pessoa.id)) return true;
  const role = cargoToCrmRole(pessoa.cargo);
  if (role === "COMERCIAL_VENDEDOR" || role === "SDR_LEADS" || role === "RECEPCAO") return ["LEAD", "PATIENT"].includes(contact.contactType);
  if (role === "ENFERMAGEM") return contact.nurseOwnerId || contact.lifecycleStage === "ACTIVE_PATIENT";
  if (role === "CONCIERGE") return contact.conciergeOwnerId || ["CLOSED_PATIENT", "ACTIVE_PATIENT"].includes(contact.lifecycleStage);
  if (role === "MEDICO") return contact.doctorId || ["CONSULTED", "PRESCRIBED", "NEGOTIATION"].includes(contact.lifecycleStage);
  return false;
}

export function canUserAccessCadence(pessoa: Pessoa | null | undefined, cadence: CrmCadence) {
  if (!pessoa?.cargo) return false;
  if (isCrmManagement(pessoa.cargo)) return true;
  return cargoToCrmRole(pessoa.cargo) === cadence.defaultOwnerRole;
}

// "Quem faz o quê" das Réguas de Relacionamento — cada papel vê a sua regra
// em linguagem simples, para ninguém se perder no CRM.
export const roleRuleExplainers: Partial<Record<CrmRole, { title: string; rule: string }>> = {
  ENFERMAGEM: {
    title: "Sua régua: a cada 14 dias, sempre",
    rule: "Todo paciente que passou há 14 dias recebe sua mensagem — sem exceção. A régua repete de 14 em 14 dias enquanto o paciente estiver em acompanhamento, e as tarefas aparecem aqui no dia certo.",
  },
  CONCIERGE: {
    title: "Suas réguas: D+1, resgates (5 tentativas) e churn",
    rule: "Você faz o D+1 de boas-vindas após a 1ª consulta e conduz os resgates de 60 dias, 6 meses e 1 ano — 5 tentativas cada, em horários diferentes. Se o paciente responder, a régua pausa. Quem não volta depois das 5 tentativas vira churn: você liga e registra o motivo.",
  },
  ADMIN_GESTAO: {
    title: "Sua régua: 3·1·3·1",
    rule: "Follow-up do gestor em 3 dias, 1 semana, 3 semanas e 1 mês após o gatilho — negociações paradas e recuperação. Você também entra no D+2 quando o médico não fecha no D+1.",
  },
  RECEPCAO: {
    title: "Sua régua: ciclo de retorno (a cada 60 dias)",
    rule: "Exames 3 semanas antes, exames 1 semana antes, confirmação 3 dias antes e lembrete na véspera. O ciclo recomeça a cada 60 dias.",
  },
  MEDICO: {
    title: "Sua régua: D+1 de quem não fechou",
    rule: "No dia seguinte à consulta sem fechamento, você entende a objeção com calma. Se não resolver, o gestor assume no D+2.",
  },
  SDR_LEADS: {
    title: "Sua régua: D1 · D5 · D7 · D60",
    rule: "Lead frio: primeiro contato no D1, novo ângulo da dor no D5, prova/conteúdo no D7 e reativação no D60.",
  },
};

export function contactDisplayName(contact: CrmContact | undefined) {
  if (!contact) return "Contato sem nome";
  return contact.preferredName || contact.fullName || contact.phone || contact.whatsapp || "Contato sem nome";
}

export function isTaskOverdue(task: CrmTask, reference = new Date()) {
  if (task.status === "DONE" || task.status === "CANCELED") return false;
  return new Date(task.dueAt).getTime() < reference.getTime();
}

export function taskEffectiveStatus(task: CrmTask, reference = new Date()): CrmTaskStatus {
  if (isTaskOverdue(task, reference)) return "OVERDUE";
  return task.status;
}

export function whatsappUrl(contact: CrmContact, message?: string) {
  const phone = normalizePhone(contact.whatsapp || contact.phone);
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return phone ? `https://wa.me/55${phone.replace(/^55/, "")}${text}` : "";
}

export function applyMessageTemplate(template: CrmMessageTemplate | undefined, contact: CrmContact, extra: Record<string, string> = {}) {
  if (!template) return "";
  const firstName = (contact.preferredName || contact.fullName || "Tudo bem?").split(" ")[0];
  const values: Record<string, string> = {
    nome: contactDisplayName(contact),
    primeiro_nome: firstName,
    responsavel: extra.responsavel ?? "Equipe Bratan",
    data_consulta: extra.data_consulta ?? "",
    hora_consulta: extra.hora_consulta ?? "",
    medico: extra.medico ?? "Dr. Daniel",
    tratamento: extra.tratamento ?? "Plano Bratan",
    proxima_acao: extra.proxima_acao ?? "seguir com o próximo passo",
    link_google_review: extra.link_google_review ?? "link da avaliação",
    ...extra,
  };

  return template.body.replace(/\{\{(.*?)\}\}/g, (_match, key: string) => values[key.trim()] ?? "");
}

function createTask(values: Omit<CrmTask, "id" | "createdAt" | "updatedAt" | "completedAt" | "status" | "result" | "resultNotes"> & Partial<Pick<CrmTask, "id" | "status" | "result" | "resultNotes" | "completedAt" | "createdAt" | "updatedAt">>): CrmTask {
  const now = new Date().toISOString();
  return {
    id: values.id ?? createCrmId("task"),
    completedAt: values.completedAt ?? null,
    status: values.status ?? "PENDING",
    result: values.result ?? "",
    resultNotes: values.resultNotes ?? "",
    createdAt: values.createdAt ?? now,
    updatedAt: values.updatedAt ?? now,
    ...values,
  };
}

function createTimelineEvent(values: Omit<CrmTimelineEvent, "id" | "createdAt"> & Partial<Pick<CrmTimelineEvent, "id" | "createdAt">>): CrmTimelineEvent {
  return {
    id: values.id ?? createCrmId("tl"),
    createdAt: values.createdAt ?? new Date().toISOString(),
    ...values,
  };
}

const cadences: CrmCadence[] = [
  {
    id: "cad-cold-lead",
    name: "Comercial D1 / D5 / D7 / D60",
    description: "Aquecimento sem disparo automático, com mensagens variadas e registro manual.",
    cadenceType: "COLD_LEAD",
    defaultOwnerRole: "SDR_LEADS",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-not-closed",
    name: "Pós-consulta não fechou",
    description: "Médico D+1 e gestão D+2 quando a venda não fecha.",
    cadenceType: "POST_CONSULTATION_NOT_CLOSED",
    defaultOwnerRole: "MEDICO",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-concierge-d1",
    name: "Concierge D+1",
    description: "Boas-vindas, acolhimento e pedido de avaliação Google.",
    cadenceType: "POST_SALE_CONCIERGE",
    defaultOwnerRole: "CONCIERGE",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-nursing-14",
    name: "Enfermagem 14 em 14 dias",
    description: "Acompanhamento humano, sem sobrepor contato do mesmo dia.",
    cadenceType: "NURSING_14_DAYS",
    defaultOwnerRole: "ENFERMAGEM",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-post-application",
    name: "Pós-aplicação / bioimpedância",
    description: "Mensagem do dia seguinte, preferencialmente 15h30-16h30.",
    cadenceType: "POST_APPLICATION_NURSING",
    defaultOwnerRole: "ENFERMAGEM",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-rescue-60d",
    name: "Resgate tradicional (60 dias) — Aline",
    description: "Paciente sumiu do ciclo de retorno: 5 tentativas em horários diferentes. Resposta pausa a régua; sem resposta vira churn e a Aline liga.",
    cadenceType: "RESCUE_60_DAYS",
    defaultOwnerRole: "CONCIERGE",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-rescue-6m",
    name: "Resgate 6 meses — Aline",
    description: "Sumiu há 6 meses: 5 tentativas, conteúdo de valor primeiro, depois a pergunta do porquê não voltou.",
    cadenceType: "RESCUE_60_DAYS",
    defaultOwnerRole: "CONCIERGE",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-rescue-1y",
    name: "Resgate 1 ano — Aline",
    description: "Paciente sumiu há cerca de 1 ano: 5 tentativas de reaproximação com propósito. Resposta pausa a régua; sem resposta a Aline liga. (Isto é resgate, não é a mensagem de aniversário.)",
    cadenceType: "RESCUE_60_DAYS",
    defaultOwnerRole: "CONCIERGE",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-anniversary-1y",
    name: "Aniversário de 1 ano — Aline",
    description: "Comemoração de 1 ano de Instituto: parabéns, convite ao Instagram e proposta de avaliação de evolução. É celebração, não resgate — enfileira só quem segue ativo/recente.",
    cadenceType: "ANNIVERSARY_1Y",
    defaultOwnerRole: "CONCIERGE",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-gestor-3131",
    name: "3·1·3·1 do Gestor (Estevão)",
    description: "Follow-up do gestor: 3 dias, 1 semana, 3 semanas e 1 mês após o gatilho — negociações paradas e recuperações.",
    cadenceType: "POST_CONSULTATION_NOT_CLOSED",
    defaultOwnerRole: "ADMIN_GESTAO",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "cad-return-cycle",
    name: "Ciclo de retorno",
    description: "Exames, confirmação e lembrete final sem excesso de toque.",
    cadenceType: "RETURN_CYCLE",
    defaultOwnerRole: "RECEPCAO",
    active: true,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
];

const cadenceSteps: CrmCadenceStep[] = [
  ["step-cold-d1", "cad-cold-lead", 1, "D1 - primeiro contato", 1, "tpl-lead-d1", "SDR_LEADS"],
  ["step-cold-d5", "cad-cold-lead", 2, "D5 - novo ângulo da dor", 5, "tpl-lead-d5", "SDR_LEADS"],
  ["step-cold-d7", "cad-cold-lead", 3, "D7 - prova ou conteúdo", 7, "tpl-lead-d7", "SDR_LEADS"],
  ["step-cold-d60", "cad-cold-lead", 4, "D60 - reativação", 60, "tpl-lead-d60", "SDR_LEADS"],
  ["step-med-d1", "cad-not-closed", 1, "Médico D+1", 1, "tpl-medico-d1", "MEDICO"],
  ["step-gestor-d2", "cad-not-closed", 2, "Gestor D+2", 2, "tpl-gestor-d2", "ADMIN_GESTAO"],
  ["step-concierge-d1", "cad-concierge-d1", 1, "Concierge D+1", 1, "tpl-concierge-d1", "CONCIERGE"],
  ["step-concierge-reenvio", "cad-concierge-d1", 2, "Reenvio acolhimento", 2, "tpl-concierge-reenvio", "CONCIERGE"],
  ["step-nurse-14", "cad-nursing-14", 1, "Enfermagem 14 dias", 14, "tpl-enfermagem-14", "ENFERMAGEM"],
  ["step-post-application", "cad-post-application", 1, "Pós-aplicação", 1, "tpl-pos-aplicacao", "ENFERMAGEM"],
  ["step-rescue60-1", "cad-rescue-60d", 1, "Resgate 60d - tentativa 1", 0, "tpl-resgate-60", "CONCIERGE"],
  ["step-rescue60-2", "cad-rescue-60d", 2, "Resgate 60d - tentativa 2", 2, "tpl-resgate-60", "CONCIERGE"],
  ["step-rescue60-3", "cad-rescue-60d", 3, "Resgate 60d - tentativa 3", 4, "tpl-resgate-60", "CONCIERGE"],
  ["step-rescue60-4", "cad-rescue-60d", 4, "Resgate 60d - tentativa 4", 7, "tpl-resgate-60", "CONCIERGE"],
  ["step-rescue60-5", "cad-rescue-60d", 5, "Resgate 60d - tentativa 5 (última)", 10, "tpl-resgate-60", "CONCIERGE"],
  ["step-rescue6m-1", "cad-rescue-6m", 1, "Resgate 6m - tentativa 1 (conteúdo)", 0, "tpl-resgate-6m", "CONCIERGE"],
  ["step-rescue6m-2", "cad-rescue-6m", 2, "Resgate 6m - tentativa 2", 3, "tpl-resgate-6m", "CONCIERGE"],
  ["step-rescue6m-3", "cad-rescue-6m", 3, "Resgate 6m - tentativa 3", 6, "tpl-resgate-6m", "CONCIERGE"],
  ["step-rescue6m-4", "cad-rescue-6m", 4, "Resgate 6m - tentativa 4", 10, "tpl-resgate-6m", "CONCIERGE"],
  ["step-rescue6m-5", "cad-rescue-6m", 5, "Resgate 6m - tentativa 5 (última)", 14, "tpl-resgate-6m", "CONCIERGE"],
  ["step-rescue1y-1", "cad-rescue-1y", 1, "Resgate 1a - tentativa 1", 0, "tpl-resgate-1a", "CONCIERGE"],
  ["step-rescue1y-2", "cad-rescue-1y", 2, "Resgate 1a - tentativa 2", 3, "tpl-resgate-1a", "CONCIERGE"],
  ["step-rescue1y-3", "cad-rescue-1y", 3, "Resgate 1a - tentativa 3", 6, "tpl-resgate-1a", "CONCIERGE"],
  ["step-rescue1y-4", "cad-rescue-1y", 4, "Resgate 1a - tentativa 4", 10, "tpl-resgate-1a", "CONCIERGE"],
  ["step-rescue1y-5", "cad-rescue-1y", 5, "Resgate 1a - tentativa 5 (última)", 14, "tpl-resgate-1a", "CONCIERGE"],
  ["step-aniversario1y-1", "cad-anniversary-1y", 1, "Aniversário - parabéns + Instagram", 0, "tpl-aniversario-1a", "CONCIERGE"],
  ["step-aniversario1y-2", "cad-anniversary-1y", 2, "Aniversário - convite para avaliação de evolução", 3, "tpl-aniversario-1a-2", "CONCIERGE"],
  ["step-3131-3d", "cad-gestor-3131", 1, "Gestor - 3 dias", 3, "tpl-gestor-3131", "ADMIN_GESTAO"],
  ["step-3131-1s", "cad-gestor-3131", 2, "Gestor - 1 semana", 7, "tpl-gestor-3131", "ADMIN_GESTAO"],
  ["step-3131-3s", "cad-gestor-3131", 3, "Gestor - 3 semanas", 21, "tpl-gestor-3131", "ADMIN_GESTAO"],
  ["step-3131-1m", "cad-gestor-3131", 4, "Gestor - 1 mês", 30, "tpl-gestor-3131", "ADMIN_GESTAO"],
  ["step-exams-21", "cad-return-cycle", 1, "Exames 15 dias antes", -15, "tpl-exames-3-semanas", "RECEPCAO"],
  ["step-exams-7", "cad-return-cycle", 2, "Exames 1 semana antes", -7, "tpl-exames-1-semana", "RECEPCAO"],
  ["step-confirm-3", "cad-return-cycle", 3, "Confirmar consulta 3 dias", -3, "tpl-confirmacao-3", "RECEPCAO"],
  ["step-reminder-1", "cad-return-cycle", 4, "Lembrete 1 dia", -1, "tpl-lembrete-1", "RECEPCAO"],
].map(([id, cadenceId, stepOrder, name, offsetValue, messageTemplateId, assignedToRole]) => ({
  id: id as string,
  cadenceId: cadenceId as string,
  stepOrder: stepOrder as number,
  name: name as string,
  offsetType: (cadenceId === "cad-return-cycle" ? "BEFORE_EVENT_DATE" : cadenceId === "cad-nursing-14" ? "RECURRING_EVERY_X_DAYS" : "DAYS_AFTER_TRIGGER") as CrmOffsetType,
  offsetValue: offsetValue as number,
  preferredTimeWindow: (id === "step-post-application" ? "AFTERNOON" : id === "step-concierge-d1" ? "MORNING" : "ANY") as CrmTimeWindow,
  taskType: "WHATSAPP" as CrmTaskType,
  assignedToRole: assignedToRole as CrmRole,
  messageTemplateId: messageTemplateId as string,
  required: true,
  pauseIfContactResponded: true,
  cancelIfStageChanged: true,
  active: true,
}));

const messageTemplates: CrmMessageTemplate[] = [
  ["tpl-lead-d1", "Lead frio D1", "SDR", "SDR_LEADS", "COLD_LEAD", "Olá, {{primeiro_nome}}. Aqui é da equipe Bratan. Vi seu interesse em transformação de saúde e queria entender se você busca algo pontual ou uma mudança mais completa."],
  ["tpl-lead-d5", "Lead D5", "SDR", "SDR_LEADS", "COLD_LEAD", "{{primeiro_nome}}, passando com outro olhar: o que mais tem pesado hoje, energia, composição corporal, sono ou rotina? Posso te orientar o melhor próximo passo."],
  ["tpl-lead-d7", "Lead D7", "SDR", "SDR_LEADS", "COLD_LEAD", "{{primeiro_nome}}, se fizer sentido, posso te enviar um conteúdo curto do Dr. Daniel explicando como avaliamos longevidade e performance aqui no Instituto."],
  ["tpl-lead-d60", "Lead D60", "SDR", "SDR_LEADS", "COLD_LEAD", "{{primeiro_nome}}, retomando com cuidado. Ainda faz sentido conversarmos sobre seu plano de saúde e performance neste momento?"],
  ["tpl-resgate-60", "Resgate 60 dias", "Aline", "CONCIERGE", "RESCUE_60_DAYS", "{{primeiro_nome}}, aqui é a Aline, do Instituto Bratan. Sentimos sua falta no ciclo de retorno! Posso te ajudar a reagendar num horário que encaixe na sua rotina?"],
  ["tpl-resgate-6m", "Resgate 6 meses", "Aline", "CONCIERGE", "RESCUE_60_DAYS", "{{primeiro_nome}}, aqui é a Aline, do Instituto Bratan. O Dr. Daniel gravou um conteúdo novo que lembrei de você. Como está sua saúde nesses últimos meses? Adoraria te ver por aqui de novo."],
  ["tpl-resgate-1a", "Resgate 1 ano", "Aline", "CONCIERGE", "RESCUE_60_DAYS", "{{primeiro_nome}}, aqui é a Aline, do Instituto Bratan. Faz quase um ano que não nos falamos e você não saiu do meu radar. Como está sua saúde hoje? Adoraria retomar seu acompanhamento com a gente."],
  ["tpl-aniversario-1a", "Aniversário 1 ano", "Aline", "CONCIERGE", "ANNIVERSARY_1Y", "{{primeiro_nome}}, hoje faz 1 ano que você chegou ao Instituto Bratan — parabéns por ter cuidado de você! Segue nosso Instagram para acompanhar as novidades. Que tal marcarmos uma avaliação para ver sua evolução?"],
  ["tpl-aniversario-1a-2", "Aniversário 1 ano - reforço", "Aline", "CONCIERGE", "ANNIVERSARY_1Y", "{{primeiro_nome}}, reforçando o convite: montar uma avaliação de evolução dos seus 12 meses seria lindo de ver juntos. Quando encaixa na sua semana?"],
  ["tpl-gestor-3131", "Gestor 3·1·3·1", "Gestão", "ADMIN_GESTAO", "POST_CONSULTATION_NOT_CLOSED", "{{primeiro_nome}}, aqui é o Estevão, gestor do Instituto Bratan. Passando para saber se ficou alguma dúvida e como posso facilitar seu próximo passo com a gente."],
  ["tpl-medico-d1", "Médico D+1", "Recuperação", "MEDICO", "POST_CONSULTATION_NOT_CLOSED", "{{primeiro_nome}}, aqui é o Dr. Daniel. Queria entender com calma o que ficou como dúvida ou barreira para ajustarmos o caminho sem perder o objetivo principal."],
  ["tpl-gestor-d2", "Gestor D+2", "Recuperação", "ADMIN_GESTAO", "POST_CONSULTATION_NOT_CLOSED", "{{primeiro_nome}}, aqui é da gestão do Instituto Bratan. Passei para entender como podemos facilitar sua decisão e deixar o próximo passo claro."],
  ["tpl-concierge-d1", "Concierge D+1", "Concierge", "CONCIERGE", "POST_SALE_CONCIERGE", "Bom dia, {{primeiro_nome}}. Seja muito bem-vindo ao acompanhamento Bratan! Estou por aqui para qualquer dúvida e para cuidar da sua experiência conosco. Se puder, sua avaliação no Google nos ajuda demais: {{link_google_review}}"],
  ["tpl-concierge-reenvio", "Concierge reenvio", "Concierge", "CONCIERGE", "POST_SALE_CONCIERGE", "{{primeiro_nome}}, reforçando que ficamos à disposição. Quando puder, me diga se está tudo claro para o início do seu plano."],
  ["tpl-enfermagem-14", "Enfermagem 14 dias", "Enfermagem", "ENFERMAGEM", "NURSING_14_DAYS", "Olá, {{primeiro_nome}}. Passando para acompanhar como você está se sentindo no tratamento e se apareceu alguma dúvida ou intercorrência."],
  ["tpl-pos-aplicacao", "Pós-aplicação", "Enfermagem", "ENFERMAGEM", "POST_APPLICATION_NURSING", "Olá, {{primeiro_nome}}. Como você está hoje após a aplicação/bioimpedância de ontem? Teve alguma reação ou dúvida?"],
  ["tpl-exames-3-semanas", "Exames 15 dias", "Recepção", "RECEPCAO", "RETURN_CYCLE", "{{primeiro_nome}}, seu retorno está se aproximando. Estou reenviando o lembrete dos exames para chegarmos na consulta com tudo pronto."],
  ["tpl-exames-1-semana", "Exames 1 semana", "Recepção", "RECEPCAO", "RETURN_CYCLE", "{{primeiro_nome}}, passando para confirmar se os exames foram feitos e quando ficam disponíveis para o Dr. Daniel avaliar."],
  ["tpl-confirmacao-3", "Confirmação 3 dias", "Recepção", "RECEPCAO", "RETURN_CYCLE", "{{primeiro_nome}}, confirmando sua consulta em {{data_consulta}} às {{hora_consulta}}. Podemos contar com você?"],
  ["tpl-lembrete-1", "Lembrete 1 dia", "Recepção", "RECEPCAO", "RETURN_CYCLE", "{{primeiro_nome}}, passando só para lembrar da consulta de amanhã. Esperamos você no Instituto Bratan."],
].map(([id, name, category, roleOwner, cadenceType, body]) => ({
  id: id as string,
  name: name as string,
  category: category as string,
  roleOwner: roleOwner as CrmRole,
  cadenceType: cadenceType as CrmCadenceType,
  channel: "WHATSAPP",
  body: body as string,
  variables: ["nome", "primeiro_nome", "responsavel", "data_consulta", "hora_consulta", "medico", "tratamento", "proxima_acao", "link_google_review"],
  active: true,
  createdAt: baseNow,
  updatedAt: baseNow,
}));

const seedContacts: CrmContact[] = [
  {
    id: "crm-contact-lead-frio",
    contactType: "LEAD",
    lifecycleStage: "COLD_LEAD",
    fullName: "Marina Almeida",
    preferredName: "Marina",
    phone: "11999990001",
    whatsapp: "11999990001",
    email: "marina.demo@example.com",
    instagram: "@marinademo",
    sourceChannel: "Instagram",
    acquisitionCampaign: "Conteúdo longevidade",
    leadTemperature: "COLD",
    personaFit: "HIGH_TICKET",
    mainPain: "Baixa energia e dificuldade de manter disciplina.",
    mainGoal: "Emagrecimento com saúde e performance.",
    ownerUserId: "marketing",
    commercialOwnerId: "sdr",
    conciergeOwnerId: "",
    nurseOwnerId: "",
    doctorId: "dr-daniel",
    notes: "Seed demonstrativo.",
    createdBy: "seed",
    createdAt: baseNow,
    updatedAt: baseNow,
    archivedAt: null,
  },
  {
    id: "crm-contact-lead-quente",
    contactType: "LEAD",
    lifecycleStage: "QUALIFIED_LEAD",
    fullName: "Ricardo Torres",
    preferredName: "Ricardo",
    phone: "11999990002",
    whatsapp: "11999990002",
    email: "ricardo.demo@example.com",
    instagram: "",
    sourceChannel: "Indicação",
    acquisitionCampaign: "Paciente indicador",
    leadTemperature: "HOT",
    personaFit: "AAA",
    mainPain: "Rotina intensa, sono ruim e ganho de gordura abdominal.",
    mainGoal: "Plano completo de longevidade.",
    ownerUserId: "recepcao",
    commercialOwnerId: "vendedor",
    conciergeOwnerId: "",
    nurseOwnerId: "",
    doctorId: "dr-daniel",
    notes: "Lead qualificado para consulta.",
    createdBy: "seed",
    createdAt: baseNow,
    updatedAt: baseNow,
    archivedAt: null,
  },
  {
    id: "crm-contact-nao-fechou",
    contactType: "PATIENT",
    lifecycleStage: "FOLLOW_UP",
    fullName: "Helena Prado",
    preferredName: "Helena",
    phone: "11999990003",
    whatsapp: "11999990003",
    email: "helena.demo@example.com",
    instagram: "",
    sourceChannel: "Google",
    acquisitionCampaign: "Busca consulta",
    leadTemperature: "HOT",
    personaFit: "HIGH_TICKET",
    mainPain: "Cansaço e medo de reposição.",
    mainGoal: "Entender plano sem pressa.",
    ownerUserId: "vendedor",
    commercialOwnerId: "vendedor",
    conciergeOwnerId: "",
    nurseOwnerId: "",
    doctorId: "dr-daniel",
    notes: "Não fechou por timing e família.",
    createdBy: "seed",
    createdAt: baseNow,
    updatedAt: baseNow,
    archivedAt: null,
  },
  {
    id: "crm-contact-fechou-completo",
    contactType: "PATIENT",
    lifecycleStage: "ACTIVE_PATIENT",
    fullName: "Patricia Nogueira",
    preferredName: "Patricia",
    phone: "11999990004",
    whatsapp: "11999990004",
    email: "patricia.demo@example.com",
    instagram: "",
    sourceChannel: "Indicação",
    acquisitionCampaign: "Alto ticket",
    leadTemperature: "HOT",
    personaFit: "AAA",
    mainPain: "Desejo de envelhecer bem e ajustar composição corporal.",
    mainGoal: "Plano Bratan 6 meses completo.",
    ownerUserId: "concierge",
    commercialOwnerId: "vendedor",
    conciergeOwnerId: "concierge",
    nurseOwnerId: "enfermagem",
    doctorId: "dr-daniel",
    notes: "Fechou completo. Precisa contrato e D+1.",
    createdBy: "seed",
    createdAt: baseNow,
    updatedAt: baseNow,
    archivedAt: null,
  },
  {
    id: "crm-contact-ativo-enfermagem",
    contactType: "PATIENT",
    lifecycleStage: "ACTIVE_PATIENT",
    fullName: "Sergio Monteiro",
    preferredName: "Sergio",
    phone: "11999990005",
    whatsapp: "11999990005",
    email: "sergio.demo@example.com",
    instagram: "",
    sourceChannel: "Retorno",
    acquisitionCampaign: "Renovação",
    leadTemperature: "WARM",
    personaFit: "HIGH_TICKET",
    mainPain: "Manter consistência no tratamento.",
    mainGoal: "Acompanhamento quinzenal e retorno em 60 dias.",
    ownerUserId: "enfermagem",
    commercialOwnerId: "vendedor",
    conciergeOwnerId: "concierge",
    nurseOwnerId: "enfermagem",
    doctorId: "dr-daniel",
    notes: "Em tratamento ativo.",
    createdBy: "seed",
    createdAt: baseNow,
    updatedAt: baseNow,
    archivedAt: null,
  },
];

const seedDeals: CrmDeal[] = [
  {
    id: "crm-deal-lead-frio",
    contactId: "crm-contact-lead-frio",
    title: "Primeira consulta - Marina",
    dealType: "FIRST_CONSULTATION",
    stage: "LEAD_FRIO",
    estimatedValue: 18000,
    prescribedAmount: 0,
    soldAmount: 0,
    receivedAmount: 0,
    probability: 15,
    status: "OPEN",
    mainObjection: "",
    objectionCategory: "OTHER",
    sourceChannel: "Instagram",
    ownerUserId: "sdr",
    doctorId: "dr-daniel",
    expectedCloseDate: addDays(todayISO(), 14),
    closedAt: null,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "crm-deal-lead-quente",
    contactId: "crm-contact-lead-quente",
    title: "Plano Bratan - Ricardo",
    dealType: "TREATMENT_PLAN",
    stage: "CONSULTA_AGENDADA",
    estimatedValue: 22000,
    prescribedAmount: 0,
    soldAmount: 0,
    receivedAmount: 0,
    probability: 45,
    status: "OPEN",
    mainObjection: "",
    objectionCategory: "OTHER",
    sourceChannel: "Indicação",
    ownerUserId: "vendedor",
    doctorId: "dr-daniel",
    expectedCloseDate: addDays(todayISO(), 5),
    closedAt: null,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "crm-deal-nao-fechou",
    contactId: "crm-contact-nao-fechou",
    title: "Recuperação pós-consulta - Helena",
    dealType: "TREATMENT_PLAN",
    stage: "NAO_FECHOU",
    estimatedValue: 18000,
    prescribedAmount: 18000,
    soldAmount: 0,
    receivedAmount: 0,
    probability: 30,
    status: "OPEN",
    mainObjection: "Precisa conversar com familiar.",
    objectionCategory: "SPOUSE_OR_FAMILY",
    sourceChannel: "Google",
    ownerUserId: "vendedor",
    doctorId: "dr-daniel",
    expectedCloseDate: addDays(todayISO(), 3),
    closedAt: null,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "crm-deal-fechou-completo",
    contactId: "crm-contact-fechou-completo",
    title: "Plano Bratan 6 meses - Patricia",
    dealType: "TREATMENT_PLAN",
    stage: "FECHOU_COMPLETO",
    estimatedValue: 22000,
    prescribedAmount: 22000,
    soldAmount: 22000,
    receivedAmount: 12000,
    probability: 100,
    status: "WON_FULL",
    mainObjection: "",
    objectionCategory: "OTHER",
    sourceChannel: "Indicação",
    ownerUserId: "vendedor",
    doctorId: "dr-daniel",
    expectedCloseDate: todayISO(),
    closedAt: baseNow,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "crm-deal-ativo-enfermagem",
    contactId: "crm-contact-ativo-enfermagem",
    title: "Acompanhamento ativo - Sergio",
    dealType: "RENEWAL",
    stage: "FECHOU_PARCIAL",
    estimatedValue: 14000,
    prescribedAmount: 16000,
    soldAmount: 9000,
    receivedAmount: 9000,
    probability: 100,
    status: "WON_PARTIAL",
    mainObjection: "Começou com etapa menor.",
    objectionCategory: "PRICE",
    sourceChannel: "Retorno",
    ownerUserId: "vendedor",
    doctorId: "dr-daniel",
    expectedCloseDate: todayISO(),
    closedAt: baseNow,
    createdAt: baseNow,
    updatedAt: baseNow,
  },
];

const seedTasks: CrmTask[] = [
  createTask({
    id: "crm-task-d1-comercial",
    contactId: "crm-contact-lead-frio",
    dealId: "crm-deal-lead-frio",
    cadenceId: "cad-cold-lead",
    cadenceStepId: "step-cold-d1",
    title: "D1 comercial - primeiro contato",
    description: "Entender se o lead busca algo pontual ou transformação completa.",
    taskType: "WHATSAPP",
    assignedToUserId: "sdr",
    assignedToRole: "SDR_LEADS",
    dueAt: atLocalTime(todayISO(), 9),
    priority: "HIGH",
    visibilityScope: "ROLE",
    generatedBy: "CADENCE_ENGINE",
    createdBy: "seed",
  }),
  createTask({
    id: "crm-task-medico-d1",
    contactId: "crm-contact-nao-fechou",
    dealId: "crm-deal-nao-fechou",
    cadenceId: "cad-not-closed",
    cadenceStepId: "step-med-d1",
    title: "Médico D+1 - entender objeção",
    description: "Paciente não fechou. Contato médico para entender barreira e possível ajuste.",
    taskType: "WHATSAPP",
    assignedToUserId: "dr-daniel",
    assignedToRole: "MEDICO",
    dueAt: atLocalTime(todayISO(), 10),
    priority: "CRITICAL",
    visibilityScope: "ROLE",
    generatedBy: "PIPELINE_STAGE",
    createdBy: "seed",
  }),
  createTask({
    id: "crm-task-concierge-d1",
    contactId: "crm-contact-fechou-completo",
    dealId: "crm-deal-fechou-completo",
    cadenceId: "cad-concierge-d1",
    cadenceStepId: "step-concierge-d1",
    title: "Concierge D+1 - boas-vindas",
    description: "Acolhimento premium, disponibilidade e experiência.",
    taskType: "WHATSAPP",
    assignedToUserId: "concierge",
    assignedToRole: "CONCIERGE",
    dueAt: atLocalTime(todayISO(), 8, 30),
    priority: "HIGH",
    visibilityScope: "ROLE",
    generatedBy: "PIPELINE_STAGE",
    createdBy: "seed",
  }),
  createTask({
    id: "crm-task-enfermagem-14",
    contactId: "crm-contact-ativo-enfermagem",
    dealId: "crm-deal-ativo-enfermagem",
    cadenceId: "cad-nursing-14",
    cadenceStepId: "step-nurse-14",
    title: "Enfermagem 14 dias - acompanhamento",
    description: "Mensagem humana de acompanhamento e intercorrências.",
    taskType: "WHATSAPP",
    assignedToUserId: "enfermagem",
    assignedToRole: "ENFERMAGEM",
    dueAt: atLocalTime(todayISO(), 15, 30),
    priority: "MEDIUM",
    visibilityScope: "ROLE",
    generatedBy: "CADENCE_ENGINE",
    createdBy: "seed",
  }),
  createTask({
    id: "crm-task-admin-contrato",
    contactId: "crm-contact-fechou-completo",
    dealId: "crm-deal-fechou-completo",
    cadenceId: "",
    cadenceStepId: "",
    title: "Conferir contrato e enviar SuperSign",
    description: "Documento jurídico deve ficar em mãos em até 24h.",
    taskType: "CONTRACT",
    assignedToUserId: "administrativo",
    assignedToRole: "ADMINISTRATIVO",
    dueAt: atLocalTime(todayISO(), 16),
    priority: "HIGH",
    visibilityScope: "ROLE",
    generatedBy: "PIPELINE_STAGE",
    createdBy: "seed",
  }),
  createTask({
    id: "crm-task-financeiro-pendente",
    contactId: "crm-contact-fechou-completo",
    dealId: "crm-deal-fechou-completo",
    cadenceId: "",
    cadenceStepId: "",
    title: "Recebível parcial - acompanhar promessa",
    description: "Valor recebido menor que o vendido. Financeiro acompanha a diferença.",
    taskType: "PAYMENT",
    assignedToUserId: "financeiro",
    assignedToRole: "FINANCEIRO",
    dueAt: atLocalTime(addDays(todayISO(), -1), 11),
    priority: "HIGH",
    visibilityScope: "ROLE",
    generatedBy: "INTELLIGENCE_ENGINE",
    createdBy: "seed",
  }),
];

const seedEnrollments: CrmCadenceEnrollment[] = [
  {
    id: "enroll-lead-frio",
    cadenceId: "cad-cold-lead",
    contactId: "crm-contact-lead-frio",
    dealId: "crm-deal-lead-frio",
    status: "ACTIVE",
    enrolledAt: baseNow,
    triggerSource: "lead criado",
    triggerDate: addDays(todayISO(), -1),
    ownerUserId: "sdr",
    ownerRole: "SDR_LEADS",
    completedAt: null,
    canceledReason: "",
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "enroll-nao-fechou",
    cadenceId: "cad-not-closed",
    contactId: "crm-contact-nao-fechou",
    dealId: "crm-deal-nao-fechou",
    status: "ACTIVE",
    enrolledAt: baseNow,
    triggerSource: "deal nao fechou",
    triggerDate: addDays(todayISO(), -1),
    ownerUserId: "dr-daniel",
    ownerRole: "MEDICO",
    completedAt: null,
    canceledReason: "",
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "enroll-concierge",
    cadenceId: "cad-concierge-d1",
    contactId: "crm-contact-fechou-completo",
    dealId: "crm-deal-fechou-completo",
    status: "ACTIVE",
    enrolledAt: baseNow,
    triggerSource: "venda fechada",
    triggerDate: addDays(todayISO(), -1),
    ownerUserId: "concierge",
    ownerRole: "CONCIERGE",
    completedAt: null,
    canceledReason: "",
    createdAt: baseNow,
    updatedAt: baseNow,
  },
  {
    id: "enroll-nursing",
    cadenceId: "cad-nursing-14",
    contactId: "crm-contact-ativo-enfermagem",
    dealId: "crm-deal-ativo-enfermagem",
    status: "ACTIVE",
    enrolledAt: baseNow,
    triggerSource: "tratamento ativo",
    triggerDate: addDays(todayISO(), -14),
    ownerUserId: "enfermagem",
    ownerRole: "ENFERMAGEM",
    completedAt: null,
    canceledReason: "",
    createdAt: baseNow,
    updatedAt: baseNow,
  },
];

// Sem dados fictícios: o CRM real começa vazio (decisão do Lucas, 03/07/2026).
// Cadências e templates permanecem — são processo, não dados inventados.
export const seedCrmState: CrmState = {
  contacts: [],
  deals: [],
  tasks: [],
  cadences,
  cadenceSteps,
  cadenceEnrollments: [],
  messageTemplates,
  touchpoints: [],
  timelineEvents: [],
};

// Fixtures de demonstração usados APENAS pelos testes automatizados.
export const demoCrmFixtures: CrmState = {
  contacts: seedContacts,
  deals: seedDeals,
  tasks: seedTasks,
  cadences,
  cadenceSteps,
  cadenceEnrollments: seedEnrollments,
  messageTemplates,
  touchpoints: [],
  timelineEvents: seedContacts.map((contact) =>
    createTimelineEvent({
      id: `tl-created-${contact.id}`,
      contactId: contact.id,
      eventType: "CONTACT_CREATED",
      eventTitle: "Contato criado",
      eventDescription: `${contactDisplayName(contact)} entrou no CRM como ${contact.contactType.toLowerCase()}.`,
      sourceModule: "CRM",
      sourceId: contact.id,
      createdBy: "seed",
      createdAt: contact.createdAt,
    }),
  ),
};

function unionById<T extends { id: string }>(primary: T[], extras: T[]): T[] {
  const seen = new Set(primary.map((item) => item.id));
  return [...primary, ...extras.filter((item) => !seen.has(item.id))];
}

// Cadências/passos/mensagens novos entram por código: qualquer estado salvo
// (local ou vindo do Supabase) precisa ganhar os itens de catálogo que ainda
// não conhece, senão réguas novas nunca aparecem para quem já tem dados.
export function mergeCrmCatalogWithSeeds(state: CrmState): CrmState {
  return {
    ...seedCrmState,
    ...state,
    cadences: unionById(state.cadences ?? [], seedCrmState.cadences),
    cadenceSteps: unionById(state.cadenceSteps ?? [], seedCrmState.cadenceSteps),
    messageTemplates: unionById(state.messageTemplates ?? [], seedCrmState.messageTemplates),
  };
}

export function loadCrmState() {
  const state = readLocalValue<CrmState>(crmStorageKey, seedCrmState);
  return mergeCrmCatalogWithSeeds(state);
}

export function saveCrmState(state: CrmState) {
  writeLocalValue(crmStorageKey, state);
}

export function saveCrmStateWithIntelligence(state: CrmState) {
  saveCrmState(state);
  saveInteligencia360State(deriveInteligencia360FromCrm(state, loadInteligencia360State()));
}

export function findPotentialDuplicateContacts(state: CrmState, values: Partial<Pick<CrmContact, "fullName" | "phone" | "whatsapp" | "email">>) {
  const phone = normalizePhone(values.whatsapp || values.phone || "");
  const email = normalizeText(values.email || "");
  const name = normalizeText(values.fullName || "");

  return state.contacts.filter((contact) => {
    if (phone && phone.length >= 8) {
      const candidates = [contact.phone, contact.whatsapp].map((value) => normalizePhone(value)).filter((value) => value.length >= 8);
      if (candidates.some((value) => value.endsWith(phone) || phone.endsWith(value))) return true;
    }
    if (email && normalizeText(contact.email) === email) return true;
    return Boolean(values.fullName && contact.fullName && personNamesMatch(values.fullName, contact.fullName));
  });
}

export function findOrCreateCrmContact(
  state: CrmState,
  values: Partial<CrmContact> & Pick<CrmContact, "fullName">,
  actorId = "sistema",
) {
  const duplicates = findPotentialDuplicateContacts(state, values);
  if (duplicates[0]) {
    return {
      state,
      contact: duplicates[0],
      duplicateWarning: `Possível duplicidade encontrada: ${contactDisplayName(duplicates[0])}.`,
      created: false,
    };
  }

  const now = new Date().toISOString();
  const contact: CrmContact = {
    id: values.id ?? createCrmId("contact"),
    contactType: values.contactType ?? "LEAD",
    lifecycleStage: values.lifecycleStage ?? "COLD_LEAD",
    fullName: values.fullName,
    preferredName: values.preferredName ?? values.fullName.split(" ")[0] ?? "",
    phone: values.phone ?? "",
    whatsapp: values.whatsapp ?? values.phone ?? "",
    email: values.email ?? "",
    instagram: values.instagram ?? "",
    sourceChannel: values.sourceChannel ?? "Manual",
    acquisitionCampaign: values.acquisitionCampaign ?? "",
    leadTemperature: values.leadTemperature ?? "WARM",
    personaFit: values.personaFit ?? "UNKNOWN",
    mainPain: values.mainPain ?? "",
    mainGoal: values.mainGoal ?? "",
    ownerUserId: values.ownerUserId ?? actorId,
    commercialOwnerId: values.commercialOwnerId ?? actorId,
    conciergeOwnerId: values.conciergeOwnerId ?? "",
    nurseOwnerId: values.nurseOwnerId ?? "",
    doctorId: values.doctorId ?? "dr-daniel",
    notes: values.notes ?? "",
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    optOut: false,
  };

  return {
    state: {
      ...state,
      contacts: [contact, ...state.contacts],
      timelineEvents: [
        createTimelineEvent({
          contactId: contact.id,
          eventType: "CONTACT_CREATED",
          eventTitle: "Contato criado",
          eventDescription: "Contato criado como fonte única para tarefas, cadências e vendas.",
          sourceModule: "CRM",
          sourceId: contact.id,
          createdBy: actorId,
        }),
        ...state.timelineEvents,
      ],
    },
    contact,
    duplicateWarning: "",
    created: true,
  };
}

// IDs DETERMINÍSTICOS do motor. Antes eram aleatórios (crypto.randomUUID), o
// que, com o sync de "estado inteiro" por upsert, fazia cada aparelho/recarga
// criar linhas NOVAS para a mesma coisa — daí a explosão de duplicatas e a
// sensação de inscrição "sumindo". Agora a mesma inscrição/tarefa converge
// para o mesmo id em qualquer dispositivo, então o upsert é idempotente.
export function enrollmentIdFor(contactId: string, cadenceId: string, triggerDate: string) {
  return `enroll-${contactId}-${cadenceId}-${triggerDate}`;
}
export function cadenceTaskIdFor(contactId: string, cadenceId: string, stepId: string, dueDate: string) {
  return `task-${contactId}-${cadenceId}-${stepId}-${dueDate}`;
}

// Chave natural de uma tarefa de cadência (para deduplicar independentemente do
// id). Passos recorrentes têm uma tarefa POR DIA (ciclo), então a data entra na
// chave; passos únicos têm uma tarefa por execução, então a data fica de fora.
function cadenceTaskKey(task: Pick<CrmTask, "contactId" | "cadenceId" | "cadenceStepId" | "dueAt">, recurring: boolean) {
  const cycle = recurring ? (task.dueAt || "").slice(0, 10) : "unico";
  return `${task.contactId}|${task.cadenceId}|${task.cadenceStepId}|${cycle}`;
}

// Uma tarefa de passo único bloqueia recriação se estiver ABERTA ou se pertence
// a ESTA execução da régua (criada a partir da inscrição atual). Assim, concluir
// a tarefa não faz o motor recriá-la, mas uma NOVA inscrição (resgate rodando de
// novo meses depois) gera tarefas novas. Recorrentes: aberta ou mesmo dia.
function hasTaskForStep(state: CrmState, enrollment: CrmCadenceEnrollment, step: CrmCadenceStep, recurring: boolean, dueDate: string) {
  const runStart = enrollment.enrolledAt || enrollment.createdAt || "";
  return state.tasks.some((task) => {
    if (task.contactId !== enrollment.contactId || task.cadenceId !== enrollment.cadenceId || task.cadenceStepId !== step.id) return false;
    const open = !["DONE", "CANCELED", "SKIPPED"].includes(task.status);
    if (recurring) return open || task.dueAt.slice(0, 10) === dueDate;
    return open || (task.createdAt || "") >= runStart;
  });
}

function dueDateForStep(enrollment: CrmCadenceEnrollment, step: CrmCadenceStep, reference = new Date()) {
  if (step.offsetType === "RECURRING_EVERY_X_DAYS" && step.offsetValue > 0) {
    // Próxima ocorrência do ciclo (a cada X dias) que ainda não passou.
    const refDate = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-${String(reference.getDate()).padStart(2, "0")}`;
    let date = addDays(enrollment.triggerDate, step.offsetValue);
    for (let i = 0; i < 400 && date < refDate; i += 1) {
      date = addDays(date, step.offsetValue);
    }
    return date;
  }
  return addDays(enrollment.triggerDate, step.offsetValue);
}

function createTaskFromCadence(state: CrmState, enrollment: CrmCadenceEnrollment, step: CrmCadenceStep, reference = new Date()): CrmTask | null {
  const contact = state.contacts.find((item) => item.id === enrollment.contactId);
  if (!contact || contact.optOut) return null;
  const date = dueDateForStep(enrollment, step, reference);
  const recurring = step.offsetType === "RECURRING_EVERY_X_DAYS";
  // Ciclo do id: recorrente usa a data do ciclo; único usa a data de gatilho da
  // inscrição (estável na execução, novo a cada nova inscrição).
  const cycleTag = recurring ? date : enrollment.triggerDate;
  const id = cadenceTaskIdFor(enrollment.contactId, enrollment.cadenceId, step.id, cycleTag);
  // Idempotência do id (mesma execução em qualquer aparelho) + dedup por passo.
  if (state.tasks.some((task) => task.id === id)) return null;
  if (hasTaskForStep(state, enrollment, step, recurring, date)) return null;

  const hour = step.preferredTimeWindow === "MORNING" ? 9 : step.preferredTimeWindow === "AFTERNOON" ? 15 : 10;
  return createTask({
    id,
    contactId: enrollment.contactId,
    dealId: enrollment.dealId,
    cadenceId: enrollment.cadenceId,
    cadenceStepId: step.id,
    title: step.name,
    description: `Cadência ${cadenceTypeLabels[state.cadences.find((cadence) => cadence.id === enrollment.cadenceId)?.cadenceType ?? "COMMERCIAL_FOLLOW_UP"]}.`,
    taskType: step.taskType,
    assignedToUserId: enrollment.ownerUserId,
    assignedToRole: step.assignedToRole,
    dueAt: atLocalTime(date, hour),
    priority: step.assignedToRole === "MEDICO" || step.assignedToRole === "ADMIN_GESTAO" ? "HIGH" : "MEDIUM",
    visibilityScope: "ROLE",
    generatedBy: "CADENCE_ENGINE",
    createdBy: "cadence-engine",
  });
}

export function generateCadenceTasks(state: CrmState, reference = new Date()) {
  const tasksToAdd: CrmTask[] = [];
  for (const enrollment of state.cadenceEnrollments.filter((item) => item.status === "ACTIVE")) {
    const steps = state.cadenceSteps
      .filter((step) => step.cadenceId === enrollment.cadenceId && step.active)
      .sort((a, b) => a.stepOrder - b.stepOrder);

    let materializedForEnrollment = false;
    const pendingBeyondWindow: { step: CrmCadenceStep; dueTime: number }[] = [];
    for (const step of steps) {
      const workingState = { ...state, tasks: [...state.tasks, ...tasksToAdd] };
      const due = new Date(`${dueDateForStep(enrollment, step, reference)}T23:59:59`);
      if (due.getTime() > reference.getTime() + 7 * 24 * 60 * 60 * 1000) {
        pendingBeyondWindow.push({ step, dueTime: due.getTime() });
        continue;
      }
      const task = createTaskFromCadence(workingState, enrollment, step, reference);
      if (task) {
        tasksToAdd.push(task);
        materializedForEnrollment = true;
      } else if (
        workingState.tasks.some(
          (item) => item.contactId === enrollment.contactId && item.cadenceId === enrollment.cadenceId && item.cadenceStepId === step.id,
        )
      ) {
        materializedForEnrollment = true;
      }
    }

    // Cadências cujo primeiro toque cai longe (D+14, D+60, resgates) não podem
    // ficar invisíveis: sem nada na janela, a PRÓXIMA tarefa nasce mesmo assim.
    if (!materializedForEnrollment && pendingBeyondWindow.length) {
      pendingBeyondWindow.sort((a, b) => a.dueTime - b.dueTime);
      const task = createTaskFromCadence({ ...state, tasks: [...state.tasks, ...tasksToAdd] }, enrollment, pendingBeyondWindow[0].step, reference);
      if (task) tasksToAdd.push(task);
    }
  }

  return tasksToAdd.length ? { ...state, tasks: [...tasksToAdd, ...state.tasks] } : state;
}

// Sanea duplicatas que já entraram no banco (IDs aleatórios do modelo antigo)
// ou que dois aparelhos criaram ao mesmo tempo. Colapsa:
//  - inscrições ATIVAS repetidas do mesmo (contato+cadência): mantém a mais antiga;
//  - tarefas de cadência do mesmo passo/ciclo: mantém a mais avançada (concluída
//    ganha da pendente), depois a mais antiga.
// Estável: se nada muda, devolve o MESMO objeto (não dispara re-render/save).
export function dedupeCrmState(state: CrmState): CrmState {
  let changed = false;

  // Inscrições ativas duplicadas.
  const activeSeen = new Map<string, CrmCadenceEnrollment>();
  const droppedEnrollmentIds = new Set<string>();
  for (const enrollment of state.cadenceEnrollments) {
    if (enrollment.status !== "ACTIVE") continue;
    const key = `${enrollment.contactId}|${enrollment.cadenceId}`;
    const kept = activeSeen.get(key);
    if (!kept) {
      activeSeen.set(key, enrollment);
      continue;
    }
    // Mantém a mais antiga (enrolledAt); descarta a outra.
    const older = (enrollment.enrolledAt || enrollment.createdAt) < (kept.enrolledAt || kept.createdAt) ? enrollment : kept;
    const drop = older === enrollment ? kept : enrollment;
    activeSeen.set(key, older);
    droppedEnrollmentIds.add(drop.id);
    changed = true;
  }
  const cadenceEnrollments = droppedEnrollmentIds.size
    ? state.cadenceEnrollments.filter((enrollment) => !droppedEnrollmentIds.has(enrollment.id))
    : state.cadenceEnrollments;

  // Tarefas de cadência duplicadas (mesma chave natural).
  const recurringStepIds = new Set(
    state.cadenceSteps.filter((step) => step.offsetType === "RECURRING_EVERY_X_DAYS").map((step) => step.id),
  );
  const rankStatus = (status: CrmTaskStatus) => (status === "DONE" ? 3 : status === "SKIPPED" || status === "CANCELED" ? 2 : 1);
  const bestByKey = new Map<string, CrmTask>();
  const dropTaskIds = new Set<string>();
  for (const task of state.tasks) {
    if (!task.cadenceStepId) continue; // tarefas manuais nunca são deduplicadas
    const key = cadenceTaskKey(task, recurringStepIds.has(task.cadenceStepId));
    const kept = bestByKey.get(key);
    if (!kept) {
      bestByKey.set(key, task);
      continue;
    }
    let winner = kept;
    let loser = task;
    if (rankStatus(task.status) > rankStatus(kept.status)) {
      winner = task;
      loser = kept;
    } else if (rankStatus(task.status) === rankStatus(kept.status)) {
      // empate de status: mantém a mais antiga (createdAt)
      winner = (task.createdAt || "") < (kept.createdAt || "") ? task : kept;
      loser = winner === task ? kept : task;
    }
    bestByKey.set(key, winner);
    dropTaskIds.add(loser.id);
    changed = true;
  }
  const tasks = dropTaskIds.size ? state.tasks.filter((task) => !dropTaskIds.has(task.id)) : state.tasks;

  if (!changed) return state;
  return { ...state, cadenceEnrollments, tasks };
}

const CRM_DIFF_COLLECTIONS = [
  "contacts",
  "deals",
  "cadenceEnrollments",
  "tasks",
  "touchpoints",
  "timelineEvents",
  "cadences",
  "cadenceSteps",
  "messageTemplates",
] as const;

type CrmDiff = { [K in (typeof CRM_DIFF_COLLECTIONS)[number]]: CrmState[K] };

// Diferença entre dois estados: por coleção, devolve só as linhas NOVAS ou
// ALTERADAS (comparação por id + JSON). Usado no sync para salvar apenas o que
// mudou — reduz drasticamente o "um usuário reverte o trabalho do outro".
export function diffCrmStates(prev: CrmState, next: CrmState): CrmDiff {
  const diff = {} as CrmDiff;
  for (const key of CRM_DIFF_COLLECTIONS) {
    const prevById = new Map((prev[key] as { id: string }[]).map((row) => [row.id, JSON.stringify(row)]));
    diff[key] = (next[key] as { id: string }[]).filter((row) => {
      const before = prevById.get(row.id);
      return before === undefined || before !== JSON.stringify(row);
    }) as never;
  }
  return diff;
}

// ---- Listas para o Dr. Daniel (resumo à Géssica) ----------------------------
export type NotClosedRow = { deal: CrmDeal; contact: CrmContact | null; dateISO: string; objection: string };
export type ProgramRow = { contact: CrmContact; deal: CrmDeal | null; sinceISO: string; planAmount: number };

const NOT_CLOSED_STAGES: CrmDealStage[] = ["NAO_FECHOU", "RECUPERACAO_D1_MEDICO", "RECUPERACAO_D2_GESTOR"];

// Pacientes que NÃO fecharam nos últimos `days` dias (default 7 = "desde a
// semana passada"): negociação em fase de não-fechou/recuperação ou perdida,
// com a data do fato dentro da janela. Uma linha por contato (a mais recente).
export function notClosedRecently(state: CrmState, referenceISO: string, days = 7): NotClosedRow[] {
  const cutoff = addDays(referenceISO, -days);
  const rows: NotClosedRow[] = [];
  for (const deal of state.deals) {
    const isNotClosed = NOT_CLOSED_STAGES.includes(deal.stage) || deal.status === "LOST";
    if (!isNotClosed) continue;
    const dateISO = (deal.closedAt || deal.updatedAt || deal.createdAt || "").slice(0, 10);
    if (!dateISO || dateISO < cutoff) continue;
    const contact = state.contacts.find((item) => item.id === deal.contactId) ?? null;
    const objection = deal.mainObjection || (deal.objectionCategory ? objectionCategoryLabels[deal.objectionCategory] : "");
    rows.push({ deal, contact, dateISO, objection });
  }
  // Uma linha por contato: mantém a data mais recente.
  const latestByContact = new Map<string, NotClosedRow>();
  for (const row of rows) {
    const key = row.deal.contactId;
    const kept = latestByContact.get(key);
    if (!kept || row.dateISO > kept.dateISO) latestByContact.set(key, row);
  }
  return [...latestByContact.values()].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
}

// Pacientes ATIVOS no programa de acompanhamento (contato ACTIVE_PATIENT).
// Traz a negociação fechada (para valor/plano) e desde quando.
export function activeProgramPatients(state: CrmState): ProgramRow[] {
  const wonByContact = new Map<string, CrmDeal>();
  for (const deal of state.deals) {
    if (deal.status !== "WON_FULL" && deal.status !== "WON_PARTIAL") continue;
    const kept = wonByContact.get(deal.contactId);
    if (!kept || (deal.closedAt || deal.createdAt) > (kept.closedAt || kept.createdAt)) wonByContact.set(deal.contactId, deal);
  }
  return state.contacts
    .filter((contact) => contact.lifecycleStage === "ACTIVE_PATIENT" && !contact.archivedAt)
    .map((contact) => {
      const deal = wonByContact.get(contact.id) ?? null;
      return {
        contact,
        deal,
        sinceISO: (deal?.closedAt || contact.updatedAt || contact.createdAt || "").slice(0, 10),
        planAmount: deal?.soldAmount || deal?.prescribedAmount || 0,
      };
    })
    .sort((a, b) => contactDisplayName(a.contact).localeCompare(contactDisplayName(b.contact), "pt-BR"));
}

// Rótulos em português para o status das inscrições (tela é usada por leigos).
export const enrollmentStatusLabels: Record<CrmCadenceStatus, string> = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada (respondeu)",
  COMPLETED: "Concluída",
  CANCELED: "Cancelada",
};

// POP Caminhada do Paciente: qual régua cuida de cada fase do Kanban.
// Comercial/SDR aquece leads; negociação parada é do gestor (3·1·3·1);
// não fechou é médico D+1 → gestor D+2; fechado vira paciente da
// enfermagem (14 em 14); perdido/sumido entra nos resgates da Aline.
export const stageDefaultCadence: Partial<Record<CrmDealStage, string>> = {
  LEAD_FRIO: "cad-cold-lead",
  LEAD_NOVO: "cad-cold-lead",
  CONTATADO: "cad-cold-lead",
  QUALIFICADO: "cad-cold-lead",
  PRESCRICAO_FEITA: "cad-gestor-3131",
  EM_NEGOCIACAO: "cad-gestor-3131",
  NAO_FECHOU: "cad-not-closed",
  RECUPERACAO_D1_MEDICO: "cad-not-closed",
  RECUPERACAO_D2_GESTOR: "cad-gestor-3131",
  FECHOU_COMPLETO: "cad-nursing-14",
  FECHOU_PARCIAL: "cad-nursing-14",
  PERDIDO: "cad-rescue-60d",
  RESGATE_D60: "cad-rescue-60d",
  CHURN: "cad-rescue-6m",
};

// Um contato está "coberto" quando tem régua ativa/pausada ou tarefa aberta.
export function contactHasCoverage(state: CrmState, contactId: string) {
  const hasEnrollment = state.cadenceEnrollments.some(
    (enrollment) => enrollment.contactId === contactId && (enrollment.status === "ACTIVE" || enrollment.status === "PAUSED"),
  );
  if (hasEnrollment) return true;
  return state.tasks.some(
    (task) => task.contactId === contactId && !["DONE", "CANCELED", "SKIPPED"].includes(task.status),
  );
}

// Regra do Lucas (14/07/2026): NENHUM perfil do Kanban fica sem cadência e
// sem tarefa. Todo deal em fase mapeada cujo contato está descoberto entra
// automaticamente na régua da fase (e o motor gera as tarefas na sequência).
export function ensureCadenceCoverage(state: CrmState) {
  let nextState = state;
  for (const deal of state.deals) {
    const cadenceId = stageDefaultCadence[deal.stage];
    if (!cadenceId) continue;
    const cadence = nextState.cadences.find((item) => item.id === cadenceId);
    if (!cadence) continue;
    if (contactHasCoverage(nextState, deal.contactId)) continue;
    nextState = enrollContactInCadence(nextState, {
      cadenceId,
      contactId: deal.contactId,
      dealId: deal.id,
      triggerSource: "cobertura automatica (POP)",
      triggerDate: todayISO(),
      ownerUserId: deal.ownerUserId || cadence.defaultOwnerRole.toLowerCase(),
      ownerRole: cadence.defaultOwnerRole,
    });
  }
  return nextState;
}

// ============================================================================
// PROGRAMA — trilha de 5 fases pós-fechamento com GATE de avanço (POP v3.1)
// ============================================================================
// A jornada de cuidado roda num eixo próprio (deal.programPhase), separado do
// stage comercial. Cada fase pode exigir tarefas-GATE (uma por papel); o card
// só AVANÇA quando TODAS as tarefas-gate obrigatórias estão concluídas.
// Ex.: no D+1, Recepção + Concierge + Enfermeira precisam marcar "enviado".

export const programPhases: CrmProgramPhase[] = [
  "FECHAMENTO_D0",
  "TRES_CONTATOS_D1",
  "AGENDAMENTO",
  "CADENCIA_PROGRAMA",
  "ENCERRAMENTO",
];

export const programPhaseLabels: Record<CrmProgramPhase, string> = {
  FECHAMENTO_D0: "Fechamento",
  TRES_CONTATOS_D1: "Boas-vindas (D+1)",
  AGENDAMENTO: "Agendamento",
  CADENCIA_PROGRAMA: "Em acompanhamento",
  ENCERRAMENTO: "Encerramento",
};

export const programPhaseHints: Record<CrmProgramPhase, string> = {
  FECHAMENTO_D0: "Acabou de fechar. Vendas acionou Recepção, Concierge e Enfermagem.",
  TRES_CONTATOS_D1:
    "No dia seguinte, três pessoas falam com o paciente: Recepção (agenda tudo), Concierge (experiência + Google) e Enfermeira (bem-estar). O card só avança quando os TRÊS marcarem \"mensagem enviada\".",
  AGENDAMENTO:
    "A Recepção monta a agenda no Feegow (3 consultas do médico, 6 checkpoints da Performance, 1ª dose). Confirmada a agenda, avança sozinho.",
  CADENCIA_PROGRAMA:
    "Programa rodando (6 a 9 meses): enfermeira nas doses e a cada 14 dias, Performance mensal, médico a cada 60 dias.",
  ENCERRAMENTO: "Mês 6/9: decisão — renovar, manter (mais leve) ou dar alta.",
};

export const programOutcomeLabels: Record<CrmProgramOutcome, string> = {
  RENOVACAO: "Renovação",
  MANUTENCAO: "Manutenção",
  ALTA: "Alta",
};

type ProgramGateSpec = {
  key: string;
  role: CrmRole;
  userId: string;
  title: string;
  description: string;
  taskType: CrmTaskType;
  dueOffsetDays: number;
};
type ProgramPhaseSpec = {
  order: number;
  gate: ProgramGateSpec[]; // TODAS obrigatórias para avançar
  enrollCadences: string[]; // cadências materializadas ao ENTRAR na fase
  autoAdvance: boolean; // gate fechado avança sozinho
  next: CrmProgramPhase | null;
};

export const programPhaseSpecs: Record<CrmProgramPhase, ProgramPhaseSpec> = {
  FECHAMENTO_D0: { order: 1, gate: [], enrollCadences: [], autoAdvance: true, next: "TRES_CONTATOS_D1" },
  TRES_CONTATOS_D1: {
    order: 2,
    gate: [
      { key: "recepcao", role: "RECEPCAO", userId: "recepcao", title: "Recepção D+1 — agendar o programa", description: "Envie 1 mensagem com todas as datas (consultas, checkpoints e doses). Marque como enviada quando mandar.", taskType: "WHATSAPP", dueOffsetDays: 1 },
      { key: "concierge", role: "CONCIERGE", userId: "concierge", title: "Concierge D+1 — experiência + avaliação Google", description: "Pergunte como foi a experiência e peça a avaliação no Google. Marque como enviada quando mandar.", taskType: "WHATSAPP", dueOffsetDays: 1 },
      { key: "enfermeira", role: "ENFERMAGEM", userId: "enfermagem", title: "Enfermeira D+1 — bem-estar e efeitos", description: "Pergunte como o paciente está se sentindo e se teve efeitos colaterais. Marque como enviada quando mandar.", taskType: "WHATSAPP", dueOffsetDays: 1 },
    ],
    enrollCadences: [],
    autoAdvance: true,
    next: "AGENDAMENTO",
  },
  AGENDAMENTO: {
    order: 3,
    gate: [
      { key: "recepcao-agenda", role: "RECEPCAO", userId: "recepcao", title: "Montar a agenda no Feegow", description: "Agende as 3 consultas do Dr. Daniel (1 a cada 2 meses), os 6 checkpoints da Assistente de Performance (1/mês) e a 1ª dose/bioimpedância. Confirme aqui quando a agenda estiver montada.", taskType: "SCHEDULE", dueOffsetDays: 1 },
    ],
    enrollCadences: [],
    autoAdvance: true,
    next: "CADENCIA_PROGRAMA",
  },
  CADENCIA_PROGRAMA: { order: 4, gate: [], enrollCadences: ["cad-nursing-14"], autoAdvance: false, next: "ENCERRAMENTO" },
  ENCERRAMENTO: { order: 5, gate: [], enrollCadences: [], autoAdvance: false, next: null },
};

// Id determinístico da tarefa-gate (converge entre aparelhos; upsert idempotente).
export function programGateTaskIdFor(dealId: string, phase: CrmProgramPhase, key: string) {
  return `gate-${dealId}-${phase}-${key}`;
}

// Cria (idempotente) as tarefas-gate da fase e inscreve as cadências da fase.
function materializeProgramPhase(state: CrmState, deal: CrmDeal, phase: CrmProgramPhase, reference: Date): CrmState {
  const spec = programPhaseSpecs[phase];
  let next = state;
  const tasksToAdd: CrmTask[] = [];
  const enteredISO = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-${String(reference.getDate()).padStart(2, "0")}`;
  for (const gate of spec.gate) {
    const id = programGateTaskIdFor(deal.id, phase, gate.key);
    if (next.tasks.some((task) => task.id === id)) continue;
    tasksToAdd.push(
      createTask({
        id,
        contactId: deal.contactId,
        dealId: deal.id,
        cadenceId: "",
        cadenceStepId: "",
        title: gate.title,
        description: gate.description,
        taskType: gate.taskType,
        assignedToUserId: gate.userId,
        assignedToRole: gate.role,
        dueAt: atLocalTime(addDays(enteredISO, gate.dueOffsetDays), 9),
        priority: "HIGH",
        visibilityScope: "ROLE",
        generatedBy: "PIPELINE_STAGE",
        createdBy: "program-engine",
        isGate: true,
        gatePhase: phase,
      }),
    );
  }
  if (tasksToAdd.length) next = { ...next, tasks: [...tasksToAdd, ...next.tasks] };
  for (const cadenceId of spec.enrollCadences) {
    const cadence = next.cadences.find((item) => item.id === cadenceId);
    next = enrollContactInCadence(next, {
      cadenceId,
      contactId: deal.contactId,
      dealId: deal.id,
      triggerSource: "programa (fase)",
      triggerDate: enteredISO,
      ownerUserId: deal.ownerUserId || (cadence?.defaultOwnerRole ?? "CONCIERGE").toLowerCase(),
      ownerRole: cadence?.defaultOwnerRole ?? "CONCIERGE",
    });
  }
  return next;
}

// Coloca um deal no início da jornada PROGRAMA (chamado no fechamento).
export function startProgramJourney(state: CrmState, dealId: string, channel: CrmAdhesionChannel | null, actorId: string, reference = new Date()): CrmState {
  const deal = state.deals.find((item) => item.id === dealId);
  if (!deal || deal.programPhase) return state;
  const now = new Date().toISOString();
  const started: CrmDeal = { ...deal, programPhase: "FECHAMENTO_D0", programPhaseEnteredAt: now, programPhaseActorId: actorId, adhesionChannel: channel ?? deal.adhesionChannel ?? null, updatedAt: now };
  let next: CrmState = { ...state, deals: state.deals.map((item) => (item.id === dealId ? started : item)) };
  next = materializeProgramPhase(next, started, "FECHAMENTO_D0", reference);
  next = {
    ...next,
    timelineEvents: [
      createTimelineEvent({ contactId: deal.contactId, eventType: "PROGRAM_STARTED", eventTitle: "Entrou no Programa", eventDescription: `Fase: ${programPhaseLabels.FECHAMENTO_D0}`, sourceModule: "JORNADA", sourceId: dealId, createdBy: actorId }),
      ...next.timelineEvents,
    ],
  };
  return next;
}

// Situação do gate da fase atual: quais papéis faltam concluir.
export function programGateStatus(state: CrmState, dealId: string): { phase: CrmProgramPhase | null; total: number; done: number; missing: { role: CrmRole; title: string }[] } {
  const deal = state.deals.find((item) => item.id === dealId);
  if (!deal?.programPhase) return { phase: null, total: 0, done: 0, missing: [] };
  const spec = programPhaseSpecs[deal.programPhase];
  const missing: { role: CrmRole; title: string }[] = [];
  let done = 0;
  for (const gate of spec.gate) {
    const id = programGateTaskIdFor(deal.id, deal.programPhase, gate.key);
    const task = state.tasks.find((item) => item.id === id);
    if (task && task.status === "DONE") done += 1;
    else missing.push({ role: gate.role, title: gate.title });
  }
  return { phase: deal.programPhase, total: spec.gate.length, done, missing };
}

// Avança UMA fase se o gate estiver completo (idempotente, determinística).
export function advancePhaseIfGateComplete(state: CrmState, dealId: string, options?: { actorId?: string; reference?: Date }): CrmState {
  const reference = options?.reference ?? new Date();
  const actorId = options?.actorId ?? "program-engine";
  const deal = state.deals.find((item) => item.id === dealId);
  if (!deal?.programPhase) return state;
  const spec = programPhaseSpecs[deal.programPhase];
  if (!spec.autoAdvance || !spec.next) return state;
  const gateComplete = spec.gate.every((gate) => {
    const id = programGateTaskIdFor(deal.id, deal.programPhase as CrmProgramPhase, gate.key);
    const task = state.tasks.find((item) => item.id === id);
    return task?.status === "DONE";
  });
  if (!gateComplete) return state;
  const now = new Date().toISOString();
  const nextPhase = spec.next;
  const movedDeal: CrmDeal = { ...deal, programPhase: nextPhase, programPhaseEnteredAt: now, programPhaseActorId: actorId, updatedAt: now };
  let next: CrmState = { ...state, deals: state.deals.map((item) => (item.id === dealId ? movedDeal : item)) };
  next = materializeProgramPhase(next, movedDeal, nextPhase, reference);
  next = {
    ...next,
    timelineEvents: [
      createTimelineEvent({ contactId: deal.contactId, eventType: "PHASE_ADVANCED", eventTitle: `Avançou para ${programPhaseLabels[nextPhase]}`, eventDescription: "Gate completo — todas as tarefas do setor concluídas.", sourceModule: "JORNADA", sourceId: dealId, createdBy: actorId }),
      ...next.timelineEvents,
    ],
  };
  return next;
}

// Roda o avanço em TODOS os deals do programa até estabilizar (usado no pipeline).
export function advanceAllProgramGates(state: CrmState, reference = new Date()): CrmState {
  let next = state;
  const dealIds = state.deals.filter((deal) => deal.programPhase).map((deal) => deal.id);
  for (const dealId of dealIds) {
    // no máximo programPhases.length passos por deal (barreira contra loop)
    for (let i = 0; i < programPhases.length; i += 1) {
      const before = next;
      next = advancePhaseIfGateComplete(next, dealId, { reference });
      if (next === before) break;
    }
  }
  return next;
}

// Override manual da coordenação (arrastar o card): grava a fase e materializa.
export function setProgramPhase(state: CrmState, dealId: string, phase: CrmProgramPhase, actorId: string, reference = new Date()): CrmState {
  const deal = state.deals.find((item) => item.id === dealId);
  if (!deal) return state;
  const now = new Date().toISOString();
  const movedDeal: CrmDeal = { ...deal, programPhase: phase, programPhaseEnteredAt: now, programPhaseActorId: actorId, updatedAt: now };
  let next: CrmState = { ...state, deals: state.deals.map((item) => (item.id === dealId ? movedDeal : item)) };
  next = materializeProgramPhase(next, movedDeal, phase, reference);
  next = {
    ...next,
    timelineEvents: [
      createTimelineEvent({ contactId: deal.contactId, eventType: "PHASE_OVERRIDE", eventTitle: `Movido para ${programPhaseLabels[phase]}`, eventDescription: "Ajuste manual da coordenação.", sourceModule: "JORNADA", sourceId: dealId, createdBy: actorId }),
      ...next.timelineEvents,
    ],
  };
  return next;
}

// Exclui um lead por completo: contato, negociações, inscrições, tarefas,
// toques e histórico. Devolve as referências para apagar também no Supabase.
export function removeLeadFromCrm(state: CrmState, contactId: string) {
  const dealIds = state.deals.filter((deal) => deal.contactId === contactId).map((deal) => deal.id);
  const taskIds = state.tasks.filter((task) => task.contactId === contactId).map((task) => task.id);
  const nextState: CrmState = {
    ...state,
    contacts: state.contacts.filter((contact) => contact.id !== contactId),
    deals: state.deals.filter((deal) => deal.contactId !== contactId),
    tasks: state.tasks.filter((task) => task.contactId !== contactId),
    cadenceEnrollments: state.cadenceEnrollments.filter((enrollment) => enrollment.contactId !== contactId),
    touchpoints: state.touchpoints.filter((touch) => touch.contactId !== contactId),
    timelineEvents: state.timelineEvents.filter((event) => event.contactId !== contactId),
  };
  return { state: nextState, dealIds, taskIds };
}

// Cadências que contam PARA TRÁS da consulta futura (ciclo de retorno)
// precisam da data do evento como gatilho — inscrever "a partir de hoje"
// criaria tarefas no passado.
export function cadenceNeedsEventDate(state: CrmState, cadenceId: string) {
  return state.cadenceSteps.some(
    (step) => step.cadenceId === cadenceId && step.active && (step.offsetType === "BEFORE_EVENT_DATE" || step.offsetValue < 0),
  );
}

export function enrollContactInCadence(state: CrmState, values: Omit<CrmCadenceEnrollment, "id" | "status" | "enrolledAt" | "completedAt" | "canceledReason" | "createdAt" | "updatedAt">) {
  const existing = state.cadenceEnrollments.find(
    (item) => item.contactId === values.contactId && item.cadenceId === values.cadenceId && item.status === "ACTIVE",
  );
  if (existing) return state;
  const now = new Date().toISOString();

  // Regra do Lucas (14/07/2026): quem entra em cadência tem que aparecer no
  // Kanban Comercial. Sem negociação vinculada, reaproveita a aberta do
  // contato ou cria uma nova em "Lead novo".
  let nextState = state;
  let dealId = values.dealId;
  if (!dealId) {
    const openDeal = state.deals.find((deal) => deal.contactId === values.contactId && deal.status === "OPEN");
    if (openDeal) {
      dealId = openDeal.id;
    } else {
      const contact = state.contacts.find((item) => item.id === values.contactId);
      const cadence = state.cadences.find((item) => item.id === values.cadenceId);
      nextState = createDealForContact(state, {
        contactId: values.contactId,
        title: `${contact ? contactDisplayName(contact) : "Contato"} — ${cadence?.name ?? "cadência"}`,
        ownerUserId: values.ownerUserId,
        estimatedValue: 0,
        sourceChannel: "Cadência",
      });
      dealId = nextState.deals[0]?.id ?? "";
    }
  }

  const enrollment: CrmCadenceEnrollment = {
    status: "ACTIVE",
    enrolledAt: now,
    completedAt: null,
    canceledReason: "",
    createdAt: now,
    updatedAt: now,
    ...values,
    // Id determinístico: mesma inscrição (contato+cadência+data) converge em
    // qualquer aparelho, então o upsert não duplica. Depois do spread p/ vencer
    // qualquer id que venha em `values`.
    id: enrollmentIdFor(values.contactId, values.cadenceId, values.triggerDate),
    dealId,
  };
  return generateCadenceTasks({ ...nextState, cadenceEnrollments: [enrollment, ...nextState.cadenceEnrollments] });
}

export function checkContactFatigue(state: CrmState, contactId: string, reference = new Date()) {
  const since = new Date(reference);
  since.setDate(reference.getDate() - 14);
  const recentTouches = state.touchpoints.filter((touch) => touch.contactId === contactId && new Date(touch.sentAt).getTime() >= since.getTime());
  const today = reference.toISOString().slice(0, 10);
  const todayOpenTasks = state.tasks.filter(
    (task) => task.contactId === contactId && task.dueAt.slice(0, 10) === today && !["DONE", "CANCELED", "SKIPPED"].includes(task.status),
  );

  return {
    risk: recentTouches.length >= 5 || todayOpenTasks.length >= 3,
    recentTouchesCount: recentTouches.length,
    todayOpenTasksCount: todayOpenTasks.length,
    message:
      recentTouches.length >= 5
        ? "Muitos contatos nos últimos 14 dias. Revise antes de tocar novamente."
        : todayOpenTasks.length >= 3
          ? "Há muitas tarefas para o mesmo contato hoje."
          : "Contato dentro do limite de toque.",
  };
}

export function completeCrmTask(
  state: CrmState,
  taskId: string,
  values: { result: CrmTaskResult; resultNotes?: string; actorId: string; sentiment?: CrmSentiment },
) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return state;
  const now = new Date().toISOString();
  // Só uma resposta REAL do paciente (ou a venda) pausa a régua. "Não vendeu" e
  // "Precisa de gestor" NÃO pausam: são o gatilho para o próximo toque do POP
  // (ex.: médico D+1 marca "precisa de gestor" → o Gestor D+2 TEM de continuar).
  const responseReceived = ["RESPONDED", "SCHEDULED", "RESCHEDULED", "SOLD"].includes(values.result);
  const touchpoint: CrmTouchpoint = {
    id: createCrmId("touch"),
    contactId: task.contactId,
    taskId: task.id,
    cadenceId: task.cadenceId,
    touchType: task.taskType,
    channel: task.taskType === "CALL" ? "CALL" : task.taskType === "EMAIL" ? "EMAIL" : task.taskType === "IN_PERSON" ? "IN_PERSON" : "WHATSAPP",
    sentByUserId: values.actorId,
    sentAt: now,
    responseReceived,
    responseAt: responseReceived ? now : null,
    responseSummary: values.resultNotes ?? "",
    sentiment: values.sentiment ?? (values.result === "NO_RESPONSE" ? "NO_RESPONSE" : "NEUTRAL"),
    createdAt: now,
  };

  const updatedTasks = state.tasks.map((item) =>
    item.id === taskId
      ? {
          ...item,
          status: "DONE" as CrmTaskStatus,
          completedAt: now,
          result: values.result,
          resultNotes: values.resultNotes ?? "",
          updatedAt: now,
        }
      : item,
  );

  let pausedThisCadence = false;
  const updatedEnrollments = state.cadenceEnrollments.map((enrollment) => {
    // Resposta pausa apenas a régua DESTE contato — antes, pausava a cadência
    // inteira e travava os recém-inscritos de todo mundo.
    if (!task.cadenceId || enrollment.cadenceId !== task.cadenceId) return enrollment;
    if (enrollment.contactId !== task.contactId || enrollment.status !== "ACTIVE") return enrollment;
    const step = state.cadenceSteps.find((item) => item.id === task.cadenceStepId);
    if (!step?.pauseIfContactResponded || !responseReceived) return enrollment;
    pausedThisCadence = true;
    return { ...enrollment, status: "PAUSED" as CrmCadenceStatus, updatedAt: now };
  });

  // POP: os próximos toques da régua só acontecem se o paciente NÃO respondeu
  // (ex.: gestor D+2 só entra se o médico D+1 não reverteu). Ao pausar,
  // as tarefas futuras pendentes desta régua são puladas automaticamente.
  const finalTasks = pausedThisCadence
    ? updatedTasks.map((item) =>
        item.id !== taskId &&
        item.cadenceId === task.cadenceId &&
        item.contactId === task.contactId &&
        !["DONE", "CANCELED", "SKIPPED"].includes(item.status)
          ? {
              ...item,
              status: "SKIPPED" as CrmTaskStatus,
              resultNotes: "Pulada: paciente respondeu e a régua pausou.",
              updatedAt: now,
            }
          : item,
      )
    : updatedTasks;

  const completed: CrmState = {
    ...state,
    tasks: finalTasks,
    cadenceEnrollments: updatedEnrollments,
    touchpoints: [touchpoint, ...state.touchpoints],
    timelineEvents: [
      createTimelineEvent({
        contactId: task.contactId,
        eventType: "TASK_DONE",
        eventTitle: `Tarefa concluída: ${task.title}`,
        eventDescription: `${taskResultLabels[values.result]}${values.resultNotes ? ` - ${values.resultNotes}` : ""}`,
        sourceModule: "CRM",
        sourceId: task.id,
        createdBy: values.actorId,
      }),
      ...state.timelineEvents,
    ],
  };

  // Concluir uma tarefa-gate pode fechar o gate da fase → avança o Programa.
  if (task.isGate && task.dealId) {
    return advancePhaseIfGateComplete(completed, task.dealId, { actorId: values.actorId });
  }
  return completed;
}

export function createFollowUpTask(state: CrmState, taskId: string, actorId: string) {
  const source = state.tasks.find((task) => task.id === taskId);
  if (!source) return state;
  const next = createTask({
    contactId: source.contactId,
    dealId: source.dealId,
    cadenceId: "",
    cadenceStepId: "",
    title: `Próxima ação - ${source.title}`,
    description: "Criada a partir da tarefa anterior para não deixar o contato sem dono.",
    taskType: source.taskType,
    assignedToUserId: source.assignedToUserId,
    assignedToRole: source.assignedToRole,
    dueAt: atLocalTime(addDays(todayISO(), 1), 10),
    priority: source.priority,
    visibilityScope: source.visibilityScope,
    generatedBy: "MANUAL",
    createdBy: actorId,
  });
  return {
    ...state,
    tasks: [next, ...state.tasks],
    timelineEvents: [
      createTimelineEvent({
        contactId: source.contactId,
        eventType: "NEXT_TASK_CREATED",
        eventTitle: "Próxima tarefa criada",
        eventDescription: next.title,
        sourceModule: "CRM",
        sourceId: next.id,
        createdBy: actorId,
      }),
      ...state.timelineEvents,
    ],
  };
}

function updateContactStageForDealStage(contact: CrmContact, stage: CrmDealStage): CrmContact {
  const stageMap: Partial<Record<CrmDealStage, CrmLifecycleStage>> = {
    LEAD_FRIO: "COLD_LEAD",
    LEAD_NOVO: "WARM_LEAD",
    QUALIFICADO: "QUALIFIED_LEAD",
    CONSULTA_AGENDADA: "SCHEDULED",
    CONSULTA_CONFIRMADA: "SCHEDULED",
    CONSULTA_REALIZADA: "CONSULTED",
    PRESCRICAO_FEITA: "PRESCRIBED",
    EM_NEGOCIACAO: "NEGOTIATION",
    FECHOU_COMPLETO: "ACTIVE_PATIENT",
    FECHOU_PARCIAL: "ACTIVE_PATIENT",
    NAO_FECHOU: "FOLLOW_UP",
    RECUPERACAO_D1_MEDICO: "FOLLOW_UP",
    RECUPERACAO_D2_GESTOR: "FOLLOW_UP",
    PERDIDO: "INACTIVE",
    RESGATE_D60: "RESCUE",
    CHURN: "INACTIVE",
  };
  return {
    ...contact,
    lifecycleStage: stageMap[stage] ?? contact.lifecycleStage,
    contactType: ["FECHOU_COMPLETO", "FECHOU_PARCIAL"].includes(stage) ? "PATIENT" : contact.contactType,
    updatedAt: new Date().toISOString(),
  };
}

function addPipelineTasksForStage(state: CrmState, deal: CrmDeal, options: CrmMoveDealOptions) {
  const taskBase = {
    contactId: deal.contactId,
    dealId: deal.id,
    visibilityScope: "ROLE" as CrmVisibilityScope,
    generatedBy: "PIPELINE_STAGE" as CrmGeneratedBy,
    createdBy: options.actorId,
  };
  const tasks: CrmTask[] = [];
  const today = todayISO();

  if (options.stage === "CONSULTA_AGENDADA" || options.stage === "CONSULTA_CONFIRMADA") {
    tasks.push(
      createTask({
        ...taskBase,
        cadenceId: "",
        cadenceStepId: "",
        title: "Confirmar consulta e orientar chegada",
        description: "Recepção confirma data, exames/documentos e acolhimento inicial.",
        taskType: "SCHEDULE",
        assignedToUserId: "recepcao",
        assignedToRole: "RECEPCAO",
        dueAt: options.scheduledAt ?? atLocalTime(addDays(today, 1), 11),
        priority: "HIGH",
      }),
    );
  }

  if (options.stage === "PRESCRICAO_FEITA" || options.stage === "EM_NEGOCIACAO") {
    tasks.push(
      createTask({
        ...taskBase,
        cadenceId: "",
        cadenceStepId: "",
        title: "Follow-up da prescrição",
        description: "Registrar objeção, valor vendido e próximo passo sem duplicar no 360.",
        taskType: "FOLLOW_UP",
        assignedToUserId: deal.ownerUserId || "vendedor",
        assignedToRole: "COMERCIAL_VENDEDOR",
        dueAt: atLocalTime(addDays(today, 1), 10),
        priority: "HIGH",
      }),
    );
  }

  if (options.stage === "FECHOU_COMPLETO" || options.stage === "FECHOU_PARCIAL") {
    tasks.push(
      createTask({
        ...taskBase,
        cadenceId: "cad-concierge-d1",
        cadenceStepId: "step-concierge-d1",
        title: "Concierge D+1 - acolhimento",
        description: "Vendas fechou. Enviar boas-vindas e registrar experiência.",
        taskType: "WHATSAPP",
        assignedToUserId: "concierge",
        assignedToRole: "CONCIERGE",
        dueAt: atLocalTime(addDays(today, 1), 8, 30),
        priority: "HIGH",
      }),
      createTask({
        ...taskBase,
        cadenceId: "",
        cadenceStepId: "",
        title: "Agendar primeira dose e bioimpedância",
        description: "Recepção agenda datas iniciais e registra observação do plano.",
        taskType: "SCHEDULE",
        assignedToUserId: "recepcao",
        assignedToRole: "RECEPCAO",
        dueAt: atLocalTime(today, 16),
        priority: "HIGH",
      }),
      createTask({
        ...taskBase,
        cadenceId: "",
        cadenceStepId: "",
        title: "Conferir contrato e SuperSign",
        description: "Administrativo confere o documento jurídico item a item e envia para assinatura — contrato em mãos em até 24h (POP).",
        taskType: "CONTRACT",
        assignedToUserId: "administrativo",
        assignedToRole: "ADMINISTRATIVO",
        dueAt: atLocalTime(addDays(today, 1), 12),
        priority: "HIGH",
      }),
      createTask({
        ...taskBase,
        cadenceId: "",
        cadenceStepId: "",
        title: "Fazer o contrato e enviar à administradora",
        description: "Recepção monta o contrato no modelo do SharePoint (medicação/implante/ácido/implanon, CID, cláusulas, valor, pagamento), salva em PDF com o nº do caderno azul e envia à administradora (POP).",
        taskType: "CONTRACT",
        assignedToUserId: "recepcao",
        assignedToRole: "RECEPCAO",
        dueAt: atLocalTime(today, 17),
        priority: "HIGH",
      }),
      createTask({
        ...taskBase,
        cadenceId: "",
        cadenceStepId: "",
        title: "Mensagem D+1 com TODAS as datas agendadas",
        description: "Recepção envia a mensagem de início de tratamento (não é boas-vindas) com todas as datas: nutricionista, consultas do médico e 1ª dose (POP).",
        taskType: "WHATSAPP",
        assignedToUserId: "recepcao",
        assignedToRole: "RECEPCAO",
        dueAt: atLocalTime(addDays(today, 1), 9),
        priority: "HIGH",
      }),
    );

    // POP · Vendas: presente por faixa de fechamento, SOMENTE na 1ª consulta.
    // R$7 mil a R$10 mil → caixa PillBox; acima de R$10 mil → garrafa Stanley.
    const closedAmount = options.soldAmount ?? deal.soldAmount;
    if (deal.dealType === "FIRST_CONSULTATION" && closedAmount >= 7000) {
      const gift = closedAmount > 10000 ? "garrafa Stanley" : "caixa PillBox";
      tasks.push(
        createTask({
          ...taskBase,
          cadenceId: "",
          cadenceStepId: "",
          title: `Entregar presente de fechamento: ${gift}`,
          description: `Fechamento de ${moneyCrm(closedAmount)} na 1ª consulta. Parabenize e entregue a ${gift} antes de o paciente ir embora (POP: presente somente na 1ª consulta).`,
          taskType: "IN_PERSON",
          assignedToUserId: deal.ownerUserId || "vendedor",
          assignedToRole: "COMERCIAL_VENDEDOR",
          dueAt: atLocalTime(today, 17),
          priority: "HIGH",
        }),
      );
    }
  }


  if (options.stage === "CHURN") {
    tasks.push(
      createTask({
        ...taskBase,
        cadenceId: "",
        cadenceStepId: "",
        title: "Churn — investigar o motivo e acolher",
        description: options.objection
          ? `Motivo registrado: ${options.objection}. Aline entende a situação com carinho e registra o que souber — o resgate de 6 meses já ficou agendado sozinho.`
          : "Aline entende a situação com carinho e registra o que souber — o resgate de 6 meses já ficou agendado sozinho.",
        taskType: "CHURN_INVESTIGATION",
        assignedToUserId: "concierge",
        assignedToRole: "CONCIERGE",
        dueAt: atLocalTime(addDays(today, 1), 9),
        priority: "HIGH",
      }),
    );
  }

  if (options.stage === "NAO_FECHOU") {
    tasks.push(
      createTask({
        ...taskBase,
        cadenceId: "cad-not-closed",
        cadenceStepId: "step-med-d1",
        title: "Médico D+1 - objeção",
        description: options.objection || "Paciente não fechou. Entender objeção e tentar ajuste.",
        taskType: "WHATSAPP",
        assignedToUserId: "dr-daniel",
        assignedToRole: "MEDICO",
        dueAt: atLocalTime(addDays(today, 1), 10),
        priority: "CRITICAL",
      }),
      createTask({
        ...taskBase,
        cadenceId: "cad-not-closed",
        cadenceStepId: "step-gestor-d2",
        title: "Gestor D+2 - recuperação",
        description: "Se médico não reverteu, gestão entra com escuta e próximo passo.",
        taskType: "WHATSAPP",
        assignedToUserId: "gestao",
        assignedToRole: "ADMIN_GESTAO",
        dueAt: atLocalTime(addDays(today, 2), 10),
        priority: "HIGH",
      }),
    );
  }

  const newTasks = tasks.filter(
    (task) =>
      !state.tasks.some(
        (existing) =>
          existing.contactId === task.contactId &&
          existing.dealId === task.dealId &&
          existing.title === task.title &&
          !["DONE", "CANCELED", "SKIPPED"].includes(existing.status),
      ),
  );

  return newTasks;
}

export function moveDealStage(state: CrmState, dealId: string, options: CrmMoveDealOptions) {
  const deal = state.deals.find((item) => item.id === dealId);
  if (!deal) return { state, ok: false, message: "Negociação não encontrada." };
  if (options.stage === "NAO_FECHOU" && !options.objection?.trim()) return { state, ok: false, message: "Informe a objeção/motivo antes de marcar como não fechou." };
  if (options.stage === "CHURN" && !options.objection?.trim()) return { state, ok: false, message: "Informe o motivo do churn (ex.: sem condições financeiras agora) — é ele que orienta o resgate futuro." };
  if (options.stage === "FECHOU_COMPLETO" && !options.soldAmount) return { state, ok: false, message: "Informe o valor vendido antes de fechar completo." };
  if (options.stage === "FECHOU_PARCIAL" && (!options.soldAmount || !options.partialReason?.trim())) return { state, ok: false, message: "Informe valor vendido e motivo do parcial." };

  const now = new Date().toISOString();
  const updatedDeal: CrmDeal = {
    ...deal,
    stage: options.stage,
    prescribedAmount: options.prescribedAmount ?? deal.prescribedAmount,
    soldAmount: options.soldAmount ?? deal.soldAmount,
    receivedAmount: options.receivedAmount ?? deal.receivedAmount,
    mainObjection: options.objection ?? deal.mainObjection,
    objectionCategory: options.objectionCategory ?? deal.objectionCategory,
    // Churn preserva o status: quem fechou continua contando como fechado no
    // 360 — churn é pausa do PACIENTE, não cancelamento da venda.
    status:
      options.stage === "FECHOU_COMPLETO"
        ? "WON_FULL"
        : options.stage === "FECHOU_PARCIAL"
          ? "WON_PARTIAL"
          : options.stage === "PERDIDO"
            ? "LOST"
            : options.stage === "CHURN"
              ? deal.status
              : "OPEN",
    probability: options.stage === "FECHOU_COMPLETO" || options.stage === "FECHOU_PARCIAL" ? 100 : options.stage === "PERDIDO" ? 0 : deal.probability,
    closedAt: options.stage === "FECHOU_COMPLETO" || options.stage === "FECHOU_PARCIAL" ? now : deal.closedAt,
    updatedAt: now,
  };

  let nextState: CrmState = {
    ...state,
    deals: state.deals.map((item) => (item.id === dealId ? updatedDeal : item)),
    contacts: state.contacts.map((contact) => (contact.id === deal.contactId ? updateContactStageForDealStage(contact, options.stage) : contact)),
    timelineEvents: [
      createTimelineEvent({
        contactId: deal.contactId,
        eventType: "DEAL_STAGE_CHANGED",
        eventTitle: `Kanban: ${dealStageLabels[options.stage]}`,
        eventDescription: options.objection || options.partialReason || `Negociação movida para ${dealStageLabels[options.stage]}.`,
        sourceModule: "CRM",
        sourceId: deal.id,
        createdBy: options.actorId,
      }),
      ...state.timelineEvents,
    ],
  };

  const pipelineTasks = addPipelineTasksForStage(nextState, updatedDeal, options);
  if (pipelineTasks.length) {
    nextState = { ...nextState, tasks: [...pipelineTasks, ...nextState.tasks] };
  }

  if (options.stage === "FECHOU_COMPLETO" || options.stage === "FECHOU_PARCIAL") {
    nextState = enrollContactInCadence(nextState, {
      cadenceId: "cad-concierge-d1",
      contactId: deal.contactId,
      dealId: deal.id,
      triggerSource: "kanban fechado",
      triggerDate: todayISO(),
      ownerUserId: "concierge",
      ownerRole: "CONCIERGE",
    });
    nextState = enrollContactInCadence(nextState, {
      cadenceId: "cad-nursing-14",
      contactId: deal.contactId,
      dealId: deal.id,
      triggerSource: "tratamento ativo",
      triggerDate: todayISO(),
      ownerUserId: "enfermagem",
      ownerRole: "ENFERMAGEM",
    });
  }

  if (options.stage === "CHURN") {
    // POP/Réguas: churn → a Aline investiga agora e o resgate fica agendado
    // para daqui a ~6 meses (o motor gera a 1ª tentativa já com a data futura).
    nextState = enrollContactInCadence(nextState, {
      cadenceId: "cad-rescue-6m",
      contactId: deal.contactId,
      dealId: deal.id,
      triggerSource: "churn no kanban",
      triggerDate: addDays(todayISO(), 180),
      ownerUserId: "concierge",
      ownerRole: "CONCIERGE",
    });
  }

  if (options.stage === "NAO_FECHOU") {
    nextState = enrollContactInCadence(nextState, {
      cadenceId: "cad-not-closed",
      contactId: deal.contactId,
      dealId: deal.id,
      triggerSource: "kanban nao fechou",
      triggerDate: todayISO(),
      ownerUserId: "dr-daniel",
      ownerRole: "MEDICO",
    });
  }

  return { state: nextState, ok: true, message: "Kanban atualizado e tarefas ligadas aos setores criadas." };
}

export function createDealForContact(state: CrmState, values: { contactId: string; title: string; ownerUserId: string; estimatedValue: number; sourceChannel?: string }) {
  const now = new Date().toISOString();
  const deal: CrmDeal = {
    id: createCrmId("deal"),
    contactId: values.contactId,
    title: values.title,
    dealType: "FIRST_CONSULTATION",
    stage: "LEAD_NOVO",
    estimatedValue: values.estimatedValue,
    prescribedAmount: 0,
    soldAmount: 0,
    receivedAmount: 0,
    probability: 20,
    status: "OPEN",
    mainObjection: "",
    objectionCategory: "OTHER",
    sourceChannel: values.sourceChannel ?? "Manual",
    ownerUserId: values.ownerUserId,
    doctorId: "dr-daniel",
    expectedCloseDate: addDays(todayISO(), 14),
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...state,
    deals: [deal, ...state.deals],
    timelineEvents: [
      createTimelineEvent({
        contactId: values.contactId,
        eventType: "DEAL_CREATED",
        eventTitle: "Negociação criada",
        eventDescription: deal.title,
        sourceModule: "CRM",
        sourceId: deal.id,
        createdBy: values.ownerUserId,
      }),
      ...state.timelineEvents,
    ],
  };
}

export function crmSummary(state: CrmState, pessoa?: Pessoa | null) {
  const visibleTasks = pessoa ? state.tasks.filter((task) => canUserAccessTask(pessoa, task)) : state.tasks;
  const openTasks = visibleTasks.filter((task) => !["DONE", "CANCELED", "SKIPPED"].includes(task.status));
  const today = todayISO();
  const todayTasks = openTasks.filter((task) => task.dueAt.slice(0, 10) === today && !isTaskOverdue(task));
  const overdueTasks = openTasks.filter((task) => isTaskOverdue(task));
  const nextSeven = openTasks.filter((task) => {
    const date = task.dueAt.slice(0, 10);
    return date > today && date <= addDays(today, 7);
  });
  const fatigueContacts = state.contacts.filter((contact) => checkContactFatigue(state, contact.id).risk);
  const openDeals = state.deals.filter((deal) => deal.status === "OPEN");
  const staleDeals = openDeals.filter((deal) => !state.tasks.some((task) => task.dealId === deal.id && !["DONE", "CANCELED", "SKIPPED"].includes(task.status)));

  return {
    visibleTasks,
    openTasks,
    todayTasks,
    overdueTasks,
    nextSeven,
    completedTasks: visibleTasks.filter((task) => task.status === "DONE"),
    openDeals,
    newLeads: state.contacts.filter((contact) => ["COLD_LEAD", "WARM_LEAD", "QUALIFIED_LEAD"].includes(contact.lifecycleStage)),
    staleDeals,
    fatigueContacts,
  };
}

function crmPrescriptionFromDeal(deal: CrmDeal, contact: CrmContact): PrescriptionSale | null {
  if (!["PRESCRICAO_FEITA", "EM_NEGOCIACAO", "FECHOU_COMPLETO", "FECHOU_PARCIAL", "NAO_FECHOU", "CHURN"].includes(deal.stage)) return null;
  return {
    id: `crm-rx-${deal.id}`,
    patientReference: contact.id,
    patientType: contact.contactType === "LEAD" ? "NEW" : "RETURNING",
    doctorId: deal.doctorId,
    sellerId: deal.ownerUserId,
    consultationDate: deal.updatedAt.slice(0, 10),
    prescribedAmount: deal.prescribedAmount || deal.estimatedValue,
    soldAmount: deal.soldAmount,
    receivedAmount: deal.receivedAmount,
    closed: deal.status === "WON_FULL" || deal.status === "WON_PARTIAL",
    fullPlanClosed: deal.status === "WON_FULL",
    partialReason: deal.status === "WON_PARTIAL" ? deal.mainObjection || "Fechamento parcial registrado no CRM." : "",
    discountPercentage: 0,
    paymentMethod: deal.receivedAmount > 0 ? "Registrado no CRM" : "",
    installments: 1,
    acquisitionChannel: deal.sourceChannel,
    mainObjection: deal.mainObjection,
    objectionCategory: deal.objectionCategory === "NO_RESPONSE" ? "OTHER" : deal.objectionCategory,
    nextFollowUpDate: deal.expectedCloseDate,
    status:
      deal.status === "WON_FULL"
        ? "CLOSED_FULL"
        : deal.status === "WON_PARTIAL"
          ? "CLOSED_PARTIAL"
          : deal.stage === "NAO_FECHOU"
            ? "IN_RECOVERY"
            : "PRESCRIBED",
    notes: "Gerado automaticamente pelo CRM Bratan para evitar retrabalho.",
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
  };
}

function crmJourneyFromDeal(state: CrmState, deal: CrmDeal, contact: CrmContact): PatientJourney | null {
  if (!["FECHOU_COMPLETO", "FECHOU_PARCIAL"].includes(deal.stage)) return null;
  return {
    id: `crm-journey-${deal.id}`,
    patientReference: contact.id,
    patientType: contact.contactType === "LEAD" ? "NEW" : "RETURNING",
    currentStage: "ADMINISTRATIVE",
    doctorId: deal.doctorId,
    sellerId: deal.ownerUserId,
    conciergeId: contact.conciergeOwnerId || "concierge",
    nurseId: contact.nurseOwnerId || "enfermagem",
    adminId: "administrativo",
    treatmentPlanSummary: deal.title,
    prescriptionSent: deal.prescribedAmount > 0,
    treatmentGroupSent: true,
    pharmacyGroupSent: true,
    pmiCompleted: true,
    contractCreated: state.tasks.some((task) => task.dealId === deal.id && task.taskType === "CONTRACT" && task.status !== "CANCELED"),
    contractSent: false,
    contractSigned: false,
    firstDoseScheduled: false,
    firstBioimpedanceScheduled: false,
    allDatesScheduled: false,
    nextMedicalReturnDate: addDays(todayISO(), 60),
    nextExamDueDate: addDays(todayISO(), 39),
    notes: "Criado a partir do fechamento no Kanban Comercial.",
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
  };
}

function crmReceivableFromDeal(deal: CrmDeal, contact: CrmContact): Receivable | null {
  const open = Math.max(deal.soldAmount - deal.receivedAmount, 0);
  if (deal.soldAmount <= 0 || open <= 0) return null;
  return {
    id: `crm-recv-${deal.id}`,
    patientReference: contact.id,
    saleId: `crm-rx-${deal.id}`,
    totalAmount: deal.soldAmount,
    receivedAmount: deal.receivedAmount,
    dueDate: deal.expectedCloseDate || todayISO(),
    paymentMethod: "CRM Comercial",
    installments: 1,
    status: deal.receivedAmount > 0 ? "PARTIALLY_PAID" : "OPEN",
    ownerUserId: "financeiro",
    collectionStatus: "PROMISED_PAYMENT",
    notes: "Gerado automaticamente pelo Kanban Comercial.",
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
  };
}

function crmExperienceFromTouchpoint(touch: CrmTouchpoint, contact: CrmContact): PatientExperience | null {
  if (touch.sentiment !== "NEGATIVE") return null;
  return {
    id: `crm-exp-${touch.id}`,
    patientReference: contact.id,
    journeyId: "",
    npsScore: 6,
    satisfactionScore: 6,
    googleReviewRequested: false,
    googleReviewDone: false,
    leadershipContactDone: false,
    leadershipContactDate: "",
    feedbackType: "CRITICISM",
    feedbackText: touch.responseSummary || "Resposta negativa registrada no CRM.",
    actionRequired: true,
    actionPlanId: "",
    status: "OPEN",
    createdAt: touch.createdAt,
    updatedAt: touch.createdAt,
  };
}

function crmTouchpointFor360(touch: CrmTouchpoint, contact: CrmContact): RelationshipTouchpoint {
  const touchType = touch.cadenceId === "cad-concierge-d1" ? "D1_CONCIERGE" : touch.cadenceId === "cad-nursing-14" ? "NURSE_14_DAYS" : touch.cadenceId === "cad-return-cycle" ? "RETURN_CONSULTATION" : "RESCUE_ATTEMPT";
  return {
    id: `crm-touch-${touch.id}`,
    patientReference: contact.id,
    journeyId: "",
    touchType,
    scheduledDate: touch.sentAt.slice(0, 10),
    sentDate: touch.sentAt.slice(0, 10),
    responsibleRole: touch.sentByUserId,
    responsibleUserId: touch.sentByUserId,
    status: touch.responseReceived ? "RESPONDED" : "SENT",
    channel: touch.channel === "INTERNAL" ? "OTHER" : touch.channel,
    messageTemplateId: "",
    manualMessageText: touch.responseSummary,
    responseSummary: touch.responseSummary,
    optOut: Boolean(contact.optOut),
    fatigueRisk: false,
    notes: "Espelhado do CRM Bratan.",
    createdAt: touch.createdAt,
    updatedAt: touch.createdAt,
  };
}

export function deriveInteligencia360FromCrm(state: CrmState, base: Inteligencia360State): Inteligencia360State {
  const contactById = new Map(state.contacts.map((contact) => [contact.id, contact]));
  const crmPrescriptions = state.deals.flatMap((deal) => {
    const contact = contactById.get(deal.contactId);
    const record = contact ? crmPrescriptionFromDeal(deal, contact) : null;
    return record ? [record] : [];
  });
  const crmJourneys = state.deals.flatMap((deal) => {
    const contact = contactById.get(deal.contactId);
    const record = contact ? crmJourneyFromDeal(state, deal, contact) : null;
    return record ? [record] : [];
  });
  const crmReceivables = state.deals.flatMap((deal) => {
    const contact = contactById.get(deal.contactId);
    const record = contact ? crmReceivableFromDeal(deal, contact) : null;
    return record ? [record] : [];
  });
  const crmTouchpoints = state.touchpoints.flatMap((touch) => {
    const contact = contactById.get(touch.contactId);
    return contact ? [crmTouchpointFor360(touch, contact)] : [];
  });
  const crmExperiences = state.touchpoints.flatMap((touch) => {
    const contact = contactById.get(touch.contactId);
    const record = contact ? crmExperienceFromTouchpoint(touch, contact) : null;
    return record ? [record] : [];
  });
  const crmActions: ActionItem360[] = state.tasks
    .filter((task) => isTaskOverdue(task) && task.priority !== "LOW")
    .map((task) => ({
      id: `crm-action-${task.id}`,
      sourceModule: "MANUAL",
      sourceId: task.id,
      title: `CRM atrasado: ${task.title}`,
      description: task.description,
      priority: task.priority === "CRITICAL" ? "CRITICAL" : "HIGH",
      ownerUserId: task.assignedToUserId || task.assignedToRole,
      dueDate: task.dueAt.slice(0, 10),
      status: "OPEN",
      expectedImpact: task.taskType === "PAYMENT" ? "CASH" : task.taskType === "FOLLOW_UP" ? "CONVERSION" : "PROCESS",
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));

  const withoutCrm = {
    prescriptions: base.prescriptions.filter((record) => !record.id.startsWith("crm-rx-")),
    journeys: base.journeys.filter((record) => !record.id.startsWith("crm-journey-")),
    receivables: base.receivables.filter((record) => !record.id.startsWith("crm-recv-")),
    touchpoints: base.touchpoints.filter((record) => !record.id.startsWith("crm-touch-")),
    experiences: base.experiences.filter((record) => !record.id.startsWith("crm-exp-")),
    actions: base.actions.filter((record) => !record.id.startsWith("crm-action-")),
  };

  const prescriptions = [...crmPrescriptions, ...withoutCrm.prescriptions];
  return {
    ...base,
    prescriptions,
    journeys: [...crmJourneys, ...withoutCrm.journeys],
    receivables: mergePrescriptionReceivables([...crmReceivables, ...withoutCrm.receivables], prescriptions),
    touchpoints: [...crmTouchpoints, ...withoutCrm.touchpoints],
    experiences: [...crmExperiences, ...withoutCrm.experiences],
    actions: [...crmActions, ...withoutCrm.actions],
  };
}
