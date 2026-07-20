import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";

export type PatientType360 = "NEW" | "RETURNING";
export type TicketStatus360 = "ABOVE_TARGET" | "ON_TARGET" | "BELOW_TARGET" | "CRITICAL";
export type RootCauseCategory360 =
  | "LEAD_MISALIGNMENT"
  | "WRONG_PERSONA"
  | "TOO_MUCH_DISCOUNT"
  | "LOW_PRESCRIPTION_VALUE"
  | "LOW_CONVERSION"
  | "LOW_ATTENDANCE_VOLUME"
  | "MIX_OF_RETURNING_PATIENTS"
  | "COMMERCIAL_EXECUTION"
  | "OTHER";
export type RepasseType360 = "FIXED" | "PERCENTAGE";
export type ObjectionCategory360 =
  | "PRICE"
  | "TRUST"
  | "TIMING"
  | "SPOUSE_OR_FAMILY"
  | "PAYMENT_METHOD"
  | "NEEDS_MORE_INFORMATION"
  | "NO_PERCEIVED_VALUE"
  | "OTHER";
export type PrescriptionStatus360 = "PRESCRIBED" | "CLOSED_FULL" | "CLOSED_PARTIAL" | "NOT_CLOSED" | "IN_RECOVERY" | "LOST";
export type JourneyStage360 =
  | "MEDICAL_CONSULTATION"
  | "SALES"
  | "SCHEDULING"
  | "NURSING"
  | "CONCIERGE"
  | "ADMINISTRATIVE"
  | "FOLLOW_UP"
  | "RESCUE"
  | "CHURN"
  | "COMPLETED";
export type TouchType360 =
  | "D1_CONCIERGE"
  | "NURSE_14_DAYS"
  | "MONTHLY_CHECKPOINT"
  | "EXAM_REQUEST_3_WEEKS"
  | "EXAM_READY_1_WEEK"
  | "CONSULTATION_CONFIRMATION_3_DAYS"
  | "CONSULTATION_REMINDER_1_DAY"
  | "RETURN_CONSULTATION"
  | "ONE_YEAR_ANNIVERSARY"
  | "INSTAGRAM_INVITE"
  | "RESCUE_ATTEMPT"
  | "CHURN_INVESTIGATION";
export type TouchStatus360 = "PENDING" | "SENT" | "RESPONDED" | "PAUSED" | "CANCELED" | "FAILED";
export type TouchChannel360 = "WHATSAPP" | "CALL" | "EMAIL" | "IN_PERSON" | "OTHER";
export type RescueType360 = "TRADITIONAL_60_DAYS" | "SIX_MONTHS" | "ONE_YEAR";
export type RescueStatus360 = "OPEN" | "IN_PROGRESS" | "RESCUED" | "NOT_RESCUED" | "CHURN_INVESTIGATION" | "CLOSED";
export type ChurnReasonCategory360 =
  | "OPERATIONAL_FRICTION"
  | "EXAM_OR_SCHEDULING_PROBLEM"
  | "PRICE"
  | "NO_PERCEIVED_VALUE"
  | "BAD_EXPERIENCE"
  | "HEALTH_OR_PERSONAL_REASON"
  | "MOVED_AWAY"
  | "NO_RESPONSE"
  | "OTHER";
export type FeedbackType360 = "PRAISE" | "CRITICISM" | "SUGGESTION" | "COMPLAINT";
export type ExperienceStatus360 = "OPEN" | "IN_REVIEW" | "RESOLVED";
export type ReceivableStatus360 = "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELED";
export type CollectionStatus360 = "NOT_STARTED" | "FIRST_CONTACT" | "NEGOTIATION" | "PROMISED_PAYMENT" | "ESCALATED" | "RESOLVED";
export type ActionSourceModule360 =
  | "TICKET_AVERAGE"
  | "PRESCRIPTION_CONVERSION"
  | "RETENTION"
  | "RESCUE"
  | "CHURN"
  | "NPS"
  | "RECEIVABLES"
  | "PRICING"
  | "MANUAL";
export type ActionPriority360 = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ActionStatus360 = "OPEN" | "IN_PROGRESS" | "WAITING" | "DONE" | "CANCELED";
export type ExpectedImpact360 = "CASH" | "MARGIN" | "PATIENT_EXPERIENCE" | "CONVERSION" | "RETENTION" | "PROCESS";

export type WeeklyAverageTicket = {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  referenceMonth: string;
  doctorId: string;
  doctorName: string;
  patientType: PatientType360;
  patientsSeenCount: number;
  patientsClosedCount: number;
  totalSoldAmount: number;
  totalReceivedAmount: number;
  targetAverageTicket: number;
  previousWeekAverageTicket: number;
  mainHypothesis: string;
  rootCauseCategory: RootCauseCategory360;
  actionPlan: string;
  responsibleUserId: string;
  dueDate: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PricingTableItem = {
  id: string;
  serviceName: string;
  category: string;
  standardPrice: number;
  bratanPrice: number;
  directCost: number;
  medicationCost: number;
  labCost: number;
  cardFeePercentage: number;
  doctorRepasseType: RepasseType360;
  doctorRepasseValue: number;
  otherVariableCosts: number;
  maxDiscountPercentage: number;
  active: boolean;
  strategicHighMargin: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type PrescriptionSale = {
  id: string;
  patientReference: string;
  patientType: PatientType360;
  doctorId: string;
  sellerId: string;
  consultationDate: string;
  prescribedAmount: number;
  soldAmount: number;
  receivedAmount: number;
  closed: boolean;
  fullPlanClosed: boolean;
  partialReason: string;
  discountPercentage: number;
  paymentMethod: string;
  installments: number;
  acquisitionChannel: string;
  mainObjection: string;
  objectionCategory: ObjectionCategory360;
  nextFollowUpDate: string;
  status: PrescriptionStatus360;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ObjectionPlaybookItem = {
  id: string;
  objectionCategory: ObjectionCategory360;
  objectionText: string;
  recommendedResponse: string;
  examples: string;
  active: boolean;
};

export type PatientJourney = {
  id: string;
  patientReference: string;
  patientType: PatientType360;
  currentStage: JourneyStage360;
  doctorId: string;
  sellerId: string;
  conciergeId: string;
  nurseId: string;
  adminId: string;
  treatmentPlanSummary: string;
  prescriptionSent: boolean;
  treatmentGroupSent: boolean;
  pharmacyGroupSent: boolean;
  pmiCompleted: boolean;
  contractCreated: boolean;
  contractSent: boolean;
  contractSigned: boolean;
  firstDoseScheduled: boolean;
  firstBioimpedanceScheduled: boolean;
  allDatesScheduled: boolean;
  nextMedicalReturnDate: string;
  nextExamDueDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type RelationshipTouchpoint = {
  id: string;
  patientReference: string;
  journeyId: string;
  touchType: TouchType360;
  scheduledDate: string;
  sentDate: string;
  responsibleRole: string;
  responsibleUserId: string;
  status: TouchStatus360;
  channel: TouchChannel360;
  messageTemplateId: string;
  manualMessageText: string;
  responseSummary: string;
  optOut: boolean;
  fatigueRisk: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type RetentionCohort = {
  id: string;
  cohortMonth: string;
  cohortLabel: string;
  totalPatients: number;
  scheduledReturns: number;
  attendedReturns: number;
  missedReturns: number;
  patientType: "PROGRAM" | "SINGLE" | "MIXED";
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type RescueWorkflow = {
  id: string;
  patientReference: string;
  rescueType: RescueType360;
  triggerDate: string;
  attemptsTotal: number;
  attemptsDone: number;
  status: RescueStatus360;
  rescuedCriteria: "RESCHEDULED" | "POSITIVE_RESPONSE" | "ATTENDED" | "MANUAL_DECISION" | "";
  ownerUserId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ChurnInvestigation = {
  id: string;
  patientReference: string;
  rescueWorkflowId: string;
  investigatorUserId: string;
  callDate: string;
  answered: boolean;
  churnReasonCategory: ChurnReasonCategory360;
  churnReasonDetail: string;
  correctiveAction: string;
  responsibleUserId: string;
  dueDate: string;
  status: "OPEN" | "ACTION_CREATED" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
};

export type PatientExperience = {
  id: string;
  patientReference: string;
  journeyId: string;
  npsScore: number;
  satisfactionScore: number;
  googleReviewRequested: boolean;
  googleReviewDone: boolean;
  leadershipContactDone: boolean;
  leadershipContactDate: string;
  feedbackType: FeedbackType360;
  feedbackText: string;
  actionRequired: boolean;
  actionPlanId: string;
  status: ExperienceStatus360;
  createdAt: string;
  updatedAt: string;
};

export type Receivable = {
  id: string;
  patientReference: string;
  saleId: string;
  totalAmount: number;
  receivedAmount: number;
  dueDate: string;
  paymentMethod: string;
  installments: number;
  status: ReceivableStatus360;
  ownerUserId: string;
  collectionStatus: CollectionStatus360;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ActionItem360 = {
  id: string;
  sourceModule: ActionSourceModule360;
  sourceId: string;
  title: string;
  description: string;
  priority: ActionPriority360;
  ownerUserId: string;
  dueDate: string;
  status: ActionStatus360;
  expectedImpact: ExpectedImpact360;
  createdAt: string;
  updatedAt: string;
};

export type OperationalSettings360 = {
  monthlyRevenueTarget: number;
  weeklyRevenueTarget: number;
  dailyRevenueTarget: number;
  generalAverageTicketTarget: number;
  ticketDropCriticalPercentage: number;
  prescriptionConversionMin: number;
  prescriptionConversionMax: number;
  maxDefaultDiscountPercentage: number;
  maxMessagesPerCycle: number;
  originSystem: "iClinic" | "Feegow" | "Manual" | "CSV" | "Outro";
  areaOwners: Record<string, string>;
};

export type Inteligencia360State = {
  weeklyTickets: WeeklyAverageTicket[];
  pricing: PricingTableItem[];
  prescriptions: PrescriptionSale[];
  objectionPlaybook: ObjectionPlaybookItem[];
  journeys: PatientJourney[];
  touchpoints: RelationshipTouchpoint[];
  retentionCohorts: RetentionCohort[];
  rescueWorkflows: RescueWorkflow[];
  churnInvestigations: ChurnInvestigation[];
  experiences: PatientExperience[];
  receivables: Receivable[];
  actions: ActionItem360[];
  settings: OperationalSettings360;
};

export type Dashboard360Snapshot = {
  referenceDate: string;
  referenceWeek: string;
  referenceMonth: string;
  totalSoldAmount: number;
  totalReceivedAmount: number;
  totalOpenReceivables: number;
  totalOverdueReceivables: number;
  averageTicketGeneral: number;
  averageTicketNewPatients: number;
  averageTicketReturningPatients: number;
  prescriptionConversionRate: number;
  retentionRate: number;
  rescueOpenCount: number;
  churnCount: number;
  npsAverage: number;
  criticalActionsCount: number;
  overdueActionsCount: number;
  dataCompletenessScore: number;
  generatedAt: string;
};

export type IntelligenceInsight = {
  id: string;
  sourceModule: ActionSourceModule360;
  sourceHref: string;
  severity: "healthy" | "attention" | "critical";
  title: string;
  description: string;
  recommendation: string;
  canCreateAction: boolean;
};

export type DataQualityItem = {
  module: string;
  sourceHref: string;
  status: "complete" | "partial" | "missing";
  lastUpdated: string | null;
  message: string;
  impact: string;
};

// v2 (03/07/2026): chave trocada para descartar caches antigos que continham dados fictícios.
export const inteligencia360StorageKey = "app-bratan-inteligencia-360-v2";

export const rootCauseLabels: Record<RootCauseCategory360, string> = {
  LEAD_MISALIGNMENT: "Lead desalinhado",
  WRONG_PERSONA: "Persona errada",
  TOO_MUCH_DISCOUNT: "Desconto excessivo",
  LOW_PRESCRIPTION_VALUE: "Prescrição baixa",
  LOW_CONVERSION: "Conversão baixa",
  LOW_ATTENDANCE_VOLUME: "Baixo volume",
  MIX_OF_RETURNING_PATIENTS: "Mix de recorrentes",
  COMMERCIAL_EXECUTION: "Execução comercial",
  OTHER: "Outro",
};

export const objectionLabels: Record<ObjectionCategory360, string> = {
  PRICE: "Preço",
  TRUST: "Confiança",
  TIMING: "Momento",
  SPOUSE_OR_FAMILY: "Cônjuge/família",
  PAYMENT_METHOD: "Forma de pagamento",
  NEEDS_MORE_INFORMATION: "Precisa entender melhor",
  NO_PERCEIVED_VALUE: "Valor não percebido",
  OTHER: "Outro",
};

export const stageLabels: Record<JourneyStage360, string> = {
  MEDICAL_CONSULTATION: "Consulta médica",
  SALES: "Vendas",
  SCHEDULING: "Agendamento",
  NURSING: "Enfermagem",
  CONCIERGE: "Concierge",
  ADMINISTRATIVE: "Administrativo",
  FOLLOW_UP: "Follow-up",
  RESCUE: "Resgate",
  CHURN: "Churn",
  COMPLETED: "Concluído",
};

export const touchTypeLabels: Record<TouchType360, string> = {
  D1_CONCIERGE: "D+1 Concierge",
  NURSE_14_DAYS: "Enfermeira 14 dias",
  MONTHLY_CHECKPOINT: "Checkpoint mensal",
  EXAM_REQUEST_3_WEEKS: "Exames 3 semanas",
  EXAM_READY_1_WEEK: "Exames 1 semana",
  CONSULTATION_CONFIRMATION_3_DAYS: "Confirmação 3 dias",
  CONSULTATION_REMINDER_1_DAY: "Lembrete 1 dia",
  RETURN_CONSULTATION: "Retorno",
  ONE_YEAR_ANNIVERSARY: "Parabéns 1 ano",
  INSTAGRAM_INVITE: "Convite Instagram",
  RESCUE_ATTEMPT: "Tentativa resgate",
  CHURN_INVESTIGATION: "Investigação churn",
};

export const actionPriorityLabels: Record<ActionPriority360, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const actionStatusLabels: Record<ActionStatus360, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando",
  DONE: "Concluída",
  CANCELED: "Cancelada",
};

const now = new Date().toISOString();

export const defaultSettings360: OperationalSettings360 = {
  monthlyRevenueTarget: 450000,
  weeklyRevenueTarget: 112500,
  dailyRevenueTarget: 22500,
  generalAverageTicketTarget: 12000,
  ticketDropCriticalPercentage: 10,
  prescriptionConversionMin: 70,
  prescriptionConversionMax: 80,
  maxDefaultDiscountPercentage: 10,
  maxMessagesPerCycle: 8,
  originSystem: "Manual",
  areaOwners: {
    financeiro: "Gestor Financeiro",
    comercial: "Secretário-vendedor",
    medico: "Dr. Daniel",
    recepcao: "Recepção",
    enfermagem: "Enfermagem",
    concierge: "Concierge",
    administrativo: "Administrativo",
    gestao: "Gestão",
  },
};

export const demoInteligencia360Fixtures: Inteligencia360State = {
  weeklyTickets: [
    {
      id: "wat-001",
      weekStartDate: "2026-06-22",
      weekEndDate: "2026-06-28",
      referenceMonth: "2026-06",
      doctorId: "dr-daniel",
      doctorName: "Dr. Daniel",
      patientType: "NEW",
      patientsSeenCount: 12,
      patientsClosedCount: 8,
      totalSoldAmount: 112000,
      totalReceivedAmount: 76000,
      targetAverageTicket: 13000,
      previousWeekAverageTicket: 15500,
      mainHypothesis: "Parte dos leads veio com expectativa de tratamento pontual.",
      rootCauseCategory: "LEAD_MISALIGNMENT",
      actionPlan: "Revisar briefing de qualificação e reforçar transformação completa.",
      responsibleUserId: "comercial",
      dueDate: "2026-07-03",
      notes: "Seed demonstrativo, sem paciente real.",
      createdBy: "Gestão",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "wat-002",
      weekStartDate: "2026-06-22",
      weekEndDate: "2026-06-28",
      referenceMonth: "2026-06",
      doctorId: "dr-daniel",
      doctorName: "Dr. Daniel",
      patientType: "RETURNING",
      patientsSeenCount: 9,
      patientsClosedCount: 7,
      totalSoldAmount: 61000,
      totalReceivedAmount: 42000,
      targetAverageTicket: 9000,
      previousWeekAverageTicket: 9800,
      mainHypothesis: "Renovações sem esteira complementar clara.",
      rootCauseCategory: "LOW_PRESCRIPTION_VALUE",
      actionPlan: "Preparar ofertas de manutenção, exames e complementos antes do retorno.",
      responsibleUserId: "gestao",
      dueDate: "2026-07-04",
      notes: "Seed demonstrativo.",
      createdBy: "Gestão",
      createdAt: now,
      updatedAt: now,
    },
  ],
  pricing: [
    {
      id: "price-001",
      serviceName: "Plano Bratan 6 meses",
      category: "Programa",
      standardPrice: 22000,
      bratanPrice: 18000,
      directCost: 2400,
      medicationCost: 3200,
      labCost: 900,
      cardFeePercentage: 3.2,
      doctorRepasseType: "PERCENTAGE",
      doctorRepasseValue: 18,
      otherVariableCosts: 650,
      maxDiscountPercentage: 10,
      active: true,
      strategicHighMargin: true,
      notes: "Preço demonstrativo para simulação de margem.",
      createdAt: now,
      updatedAt: now,
    },
  ],
  prescriptions: [
    {
      id: "rx-001",
      patientReference: "PAC-360-001",
      patientType: "NEW",
      doctorId: "Dr. Daniel",
      sellerId: "Comercial",
      consultationDate: "2026-06-24",
      prescribedAmount: 22000,
      soldAmount: 16000,
      receivedAmount: 8000,
      closed: true,
      fullPlanClosed: false,
      partialReason: "Paciente pediu reduzir primeira etapa.",
      discountPercentage: 8,
      paymentMethod: "Cartão",
      installments: 6,
      acquisitionChannel: "Indicação",
      mainObjection: "Queria começar com investimento menor.",
      objectionCategory: "PRICE",
      nextFollowUpDate: "2026-07-01",
      status: "CLOSED_PARTIAL",
      notes: "Seed demonstrativo.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "rx-002",
      patientReference: "PAC-360-002",
      patientType: "RETURNING",
      doctorId: "Dr. Daniel",
      sellerId: "Comercial",
      consultationDate: "2026-06-25",
      prescribedAmount: 9000,
      soldAmount: 0,
      receivedAmount: 0,
      closed: false,
      fullPlanClosed: false,
      partialReason: "",
      discountPercentage: 0,
      paymentMethod: "",
      installments: 0,
      acquisitionChannel: "Retorno",
      mainObjection: "Precisa falar com familiar.",
      objectionCategory: "SPOUSE_OR_FAMILY",
      nextFollowUpDate: "2026-06-30",
      status: "IN_RECOVERY",
      notes: "Seed demonstrativo.",
      createdAt: now,
      updatedAt: now,
    },
  ],
  objectionPlaybook: [
    {
      id: "obj-001",
      objectionCategory: "PRICE",
      objectionText: "Está caro.",
      recommendedResponse: "Retomar objetivo, custo de não tratar e plano por etapas sem desmontar a transformação.",
      examples: "Entendo. Vamos separar preço de prioridade e ver o que precisa acontecer primeiro.",
      active: true,
    },
  ],
  journeys: [
    {
      id: "journey-001",
      patientReference: "PAC-360-001",
      patientType: "NEW",
      currentStage: "ADMINISTRATIVE",
      doctorId: "Dr. Daniel",
      sellerId: "Comercial",
      conciergeId: "Concierge",
      nurseId: "Enfermagem",
      adminId: "Administrativo",
      treatmentPlanSummary: "Plano 6 meses com aplicação inicial e bioimpedância.",
      prescriptionSent: true,
      treatmentGroupSent: true,
      pharmacyGroupSent: true,
      pmiCompleted: true,
      contractCreated: true,
      contractSent: true,
      contractSigned: false,
      firstDoseScheduled: true,
      firstBioimpedanceScheduled: true,
      allDatesScheduled: false,
      nextMedicalReturnDate: "2026-08-24",
      nextExamDueDate: "2026-08-03",
      notes: "Contrato pendente de assinatura.",
      createdAt: now,
      updatedAt: now,
    },
  ],
  touchpoints: [
    {
      id: "touch-001",
      patientReference: "PAC-360-001",
      journeyId: "journey-001",
      touchType: "D1_CONCIERGE",
      scheduledDate: "2026-06-25",
      sentDate: "2026-06-25",
      responsibleRole: "Concierge",
      responsibleUserId: "concierge",
      status: "SENT",
      channel: "WHATSAPP",
      messageTemplateId: "tpl-d1",
      manualMessageText: "Oi, passando para saber como você está e se ficou alguma dúvida.",
      responseSummary: "",
      optOut: false,
      fatigueRisk: false,
      notes: "Seed demonstrativo.",
      createdAt: now,
      updatedAt: now,
    },
  ],
  retentionCohorts: [
    {
      id: "ret-001",
      cohortMonth: "2026-06",
      cohortLabel: "Junho 2026",
      totalPatients: 34,
      scheduledReturns: 22,
      attendedReturns: 16,
      missedReturns: 6,
      patientType: "MIXED",
      notes: "Coorte demonstrativa.",
      createdAt: now,
      updatedAt: now,
    },
  ],
  rescueWorkflows: [
    {
      id: "rescue-001",
      patientReference: "PAC-360-002",
      rescueType: "TRADITIONAL_60_DAYS",
      triggerDate: "2026-06-26",
      attemptsTotal: 5,
      attemptsDone: 2,
      status: "IN_PROGRESS",
      rescuedCriteria: "",
      ownerUserId: "atendimento",
      notes: "Tentativas respeitando fadiga de contato.",
      createdAt: now,
      updatedAt: now,
    },
  ],
  churnInvestigations: [],
  experiences: [
    {
      id: "exp-001",
      patientReference: "PAC-360-001",
      journeyId: "journey-001",
      npsScore: 8,
      satisfactionScore: 9,
      googleReviewRequested: true,
      googleReviewDone: false,
      leadershipContactDone: false,
      leadershipContactDate: "",
      feedbackType: "PRAISE",
      feedbackText: "Atendimento muito cuidadoso.",
      actionRequired: false,
      actionPlanId: "",
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    },
  ],
  receivables: [
    {
      id: "recv-001",
      patientReference: "PAC-360-001",
      saleId: "rx-001",
      totalAmount: 16000,
      receivedAmount: 8000,
      dueDate: "2026-06-28",
      paymentMethod: "Cartão",
      installments: 6,
      status: "PARTIALLY_PAID",
      ownerUserId: "financeiro",
      collectionStatus: "PROMISED_PAYMENT",
      notes: "Próxima parcela prometida para fechamento da semana.",
      createdAt: now,
      updatedAt: now,
    },
  ],
  actions: [
    {
      id: "act-001",
      sourceModule: "TICKET_AVERAGE",
      sourceId: "wat-001",
      title: "Revisar qualificação dos leads de menor ticket",
      description: "Comparar canal, persona e motivo de objeção dos pacientes novos da semana.",
      priority: "HIGH",
      ownerUserId: "Gestão",
      dueDate: "2026-07-03",
      status: "OPEN",
      expectedImpact: "CONVERSION",
      createdAt: now,
      updatedAt: now,
    },
  ],
  settings: defaultSettings360,
};

export const moduleRoutes360 = {
  dashboard: "/inteligencia-360",
  ticket: "/inteligencia-360/ticket-medio",
  pricing: "/inteligencia-360/precificacao",
  commercial: "/inteligencia-360/comercial",
  journey: "/inteligencia-360/jornada-paciente",
  touchpoints: "/inteligencia-360/reguas",
  retention: "/inteligencia-360/retencao-resgate",
  experience: "/inteligencia-360/experiencia",
  receivables: "/inteligencia-360/recebiveis",
  actions: "/inteligencia-360/acoes",
  settings: "/inteligencia-360/configuracoes",
} as const;

export function createId360(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? Date.now()}`;
}

export function money360(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
}

export function percent360(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

export function parseNumber360(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function averageTicketSold(record: WeeklyAverageTicket) {
  return record.patientsClosedCount > 0 ? record.totalSoldAmount / record.patientsClosedCount : 0;
}

export function averageTicketReceived(record: WeeklyAverageTicket) {
  return record.patientsClosedCount > 0 ? record.totalReceivedAmount / record.patientsClosedCount : 0;
}

export function ticketVariationPercentage(record: WeeklyAverageTicket) {
  const current = averageTicketSold(record);
  if (!record.previousWeekAverageTicket) return 0;
  return ((current - record.previousWeekAverageTicket) / record.previousWeekAverageTicket) * 100;
}

export function ticketStatus(record: WeeklyAverageTicket, criticalDrop = 10): TicketStatus360 {
  const average = averageTicketSold(record);
  const variation = ticketVariationPercentage(record);
  if (variation <= -Math.abs(criticalDrop)) return "CRITICAL";
  if (average < record.targetAverageTicket * 0.95) return "BELOW_TARGET";
  if (average <= record.targetAverageTicket * 1.05) return "ON_TARGET";
  return "ABOVE_TARGET";
}

export function pricingComputed(item: PricingTableItem) {
  const cardFee = item.bratanPrice * (item.cardFeePercentage / 100);
  const repasse = item.doctorRepasseType === "PERCENTAGE" ? item.bratanPrice * (item.doctorRepasseValue / 100) : item.doctorRepasseValue;
  const totalEstimatedCost = item.directCost + item.medicationCost + item.labCost + cardFee + repasse + item.otherVariableCosts;
  const grossMarginAmount = item.bratanPrice - totalEstimatedCost;
  const grossMarginPercentage = item.bratanPrice > 0 ? (grossMarginAmount / item.bratanPrice) * 100 : 0;
  const minimumAllowedPrice = item.bratanPrice * (1 - item.maxDiscountPercentage / 100);

  return {
    cardFee,
    repasse,
    totalEstimatedCost,
    grossMarginAmount,
    grossMarginPercentage,
    minimumAllowedPrice,
  };
}

export function receivableOpenAmount(record: Receivable) {
  return Math.max(record.totalAmount - record.receivedAmount, 0);
}

export function isOverdue(date: string) {
  if (!date) return false;
  return new Date(`${date}T00:00:00`).getTime() < new Date(`${todayISO()}T00:00:00`).getTime();
}

export function updateActionStatus360(record: ActionItem360, status: ActionStatus360, updatedAt = new Date().toISOString()): ActionItem360 {
  return {
    ...record,
    status,
    updatedAt,
  };
}

export function updateReceivableStatus360(
  record: Receivable,
  status: ReceivableStatus360,
  updatedAt = new Date().toISOString(),
): Receivable {
  return {
    ...record,
    status,
    receivedAmount: status === "PAID" ? record.totalAmount : record.receivedAmount,
    collectionStatus: status === "PAID" ? "RESOLVED" : status === "OVERDUE" ? "FIRST_CONTACT" : record.collectionStatus,
    updatedAt,
  };
}

export function saleReceivableId(record: Pick<PrescriptionSale, "id">) {
  return `recv-sale-${record.id}`;
}

export function isSaleReceivable(record: Pick<Receivable, "id">) {
  return record.id.startsWith("recv-sale-");
}

export function receivableFromPrescriptionSale(record: PrescriptionSale): Receivable | null {
  const openAmount = Math.max(record.soldAmount - record.receivedAmount, 0);
  if (!record.closed || record.soldAmount <= 0 || openAmount <= 0) return null;

  const status: ReceivableStatus360 = record.receivedAmount > 0 ? "PARTIALLY_PAID" : "OPEN";
  return {
    id: saleReceivableId(record),
    patientReference: record.patientReference,
    saleId: record.id,
    totalAmount: record.soldAmount,
    receivedAmount: record.receivedAmount,
    dueDate: record.nextFollowUpDate || record.consultationDate,
    paymentMethod: record.paymentMethod || "Comercial e Prescrições",
    installments: record.installments || 1,
    status,
    ownerUserId: record.sellerId || "Comercial",
    collectionStatus: "PROMISED_PAYMENT",
    notes: "Gerado automaticamente por Comercial e Prescrições.",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function mergePrescriptionReceivables(receivables: Receivable[], prescriptions: PrescriptionSale[]) {
  // Recebíveis que NÃO são gerados de prescrição (inclui os do CRM: crm-recv-*).
  const kept = receivables.filter((record) => !isSaleReceivable(record));
  // Toda venda já coberta por um recebível existente (pelo saleId) — ex.: o
  // crm-recv-<deal> aponta para saleId crm-rx-<deal>. Sem esta dedupe, a mesma
  // venda fechada no CRM virava DOIS recebíveis (crm-recv-* + recv-sale-crm-rx-*)
  // → caixa e linhas dobrados no Dashboard 360.
  const cobertas = new Set(kept.map((record) => record.saleId).filter(Boolean));
  const saleReceivables = prescriptions.flatMap((record) => {
    const receivable = receivableFromPrescriptionSale(record);
    if (!receivable || cobertas.has(receivable.saleId)) return [];
    return [receivable];
  });

  return [...saleReceivables, ...kept];
}

// Sem dados fictícios: o 360 real começa vazio e é alimentado pelo CRM e Financeiro.
// O mapa de objeções (playbook) permanece por ser conteúdo de processo.
export const seedInteligencia360State: Inteligencia360State = {
  weeklyTickets: [],
  pricing: [],
  prescriptions: [],
  objectionPlaybook: demoInteligencia360Fixtures.objectionPlaybook,
  journeys: [],
  touchpoints: [],
  retentionCohorts: [],
  rescueWorkflows: [],
  churnInvestigations: [],
  experiences: [],
  receivables: [],
  actions: [],
  settings: demoInteligencia360Fixtures.settings,
};

export function loadInteligencia360State() {
  return readLocalValue<Inteligencia360State>(inteligencia360StorageKey, seedInteligencia360State);
}

export function saveInteligencia360State(state: Inteligencia360State) {
  writeLocalValue(inteligencia360StorageKey, state);
}
