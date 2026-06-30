import {
  averageTicketSold,
  isOverdue,
  moduleRoutes360,
  receivableOpenAmount,
  ticketStatus,
  ticketVariationPercentage,
  type ActionItem360,
  type Dashboard360Snapshot,
  type DataQualityItem,
  type Inteligencia360State,
  type IntelligenceInsight,
} from "./inteligencia360Data";

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? sum(valid) / valid.length : 0;
}

function lastUpdated(records: { updatedAt?: string; createdAt?: string }[]) {
  return records
    .map((record) => record.updatedAt ?? record.createdAt ?? "")
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}

function sourceInsight(
  input: Omit<IntelligenceInsight, "id" | "canCreateAction"> & {
    id: string;
    canCreateAction?: boolean;
  },
): IntelligenceInsight {
  return {
    canCreateAction: input.severity !== "healthy",
    ...input,
  };
}

export function analyzeWeeklyTicket(state: Inteligencia360State): IntelligenceInsight[] {
  if (!state.weeklyTickets.length) {
    return [
      sourceInsight({
        id: "ticket-missing",
        sourceModule: "TICKET_AVERAGE",
        sourceHref: moduleRoutes360.ticket,
        severity: "critical",
        title: "Ticket Médio Semanal ainda não foi preenchido",
        description: "Sem esse dado o Dashboard 360 fica parcial e perde leitura de margem, conversão e meta.",
        recommendation: "Preencher a semana atual separando paciente novo, recorrente e médico.",
      }),
    ];
  }

  return state.weeklyTickets
    .filter((record) => ticketStatus(record, state.settings.ticketDropCriticalPercentage) !== "ABOVE_TARGET")
    .slice(0, 4)
    .map((record) => {
      const variation = ticketVariationPercentage(record);
      const patientType = record.patientType === "NEW" ? "pacientes novos" : "pacientes recorrentes";
      const severity = ticketStatus(record, state.settings.ticketDropCriticalPercentage) === "CRITICAL" ? "critical" : "attention";

      return sourceInsight({
        id: `ticket-${record.id}`,
        sourceModule: "TICKET_AVERAGE",
        sourceHref: moduleRoutes360.ticket,
        severity,
        title: `Ticket ${severity === "critical" ? "crítico" : "em atenção"} em ${patientType}`,
        description: `${record.doctorName}: variação de ${variation.toFixed(1)}% vs semana anterior.`,
        recommendation:
          record.patientType === "NEW"
            ? "Revisar canal, persona, script e valor percebido antes da consulta."
            : "Revisar esteira de renovação, complementos, exames e plano de manutenção.",
      });
    });
}

export function analyzePrescriptionConversion(state: Inteligencia360State): IntelligenceInsight[] {
  const prescribed = sum(state.prescriptions.map((record) => record.prescribedAmount));
  const sold = sum(state.prescriptions.map((record) => record.soldAmount));
  const conversion = prescribed > 0 ? (sold / prescribed) * 100 : 0;

  if (!state.prescriptions.length) {
    return [
      sourceInsight({
        id: "prescriptions-missing",
        sourceModule: "PRESCRIPTION_CONVERSION",
        sourceHref: moduleRoutes360.commercial,
        severity: "critical",
        title: "Comercial ainda não registrou prescrições",
        description: "Sem prescrito x vendido não existe leitura de dinheiro deixado na mesa.",
        recommendation: "Registrar prescrição, venda, objeção principal e próximo follow-up.",
      }),
    ];
  }

  if (conversion < state.settings.prescriptionConversionMin) {
    return [
      sourceInsight({
        id: "prescriptions-low-conversion",
        sourceModule: "PRESCRIPTION_CONVERSION",
        sourceHref: moduleRoutes360.commercial,
        severity: "critical",
        title: "Conversão de prescrição abaixo da faixa ideal",
        description: `Conversão atual de ${conversion.toFixed(1)}%. Faixa ideal: ${state.settings.prescriptionConversionMin}% a ${state.settings.prescriptionConversionMax}%.`,
        recommendation: "Ativar mapa de objeções, treinar fechamento e revisar clareza de valor da prescrição.",
      }),
    ];
  }

  if (conversion > 95) {
    return [
      sourceInsight({
        id: "prescriptions-money-left",
        sourceModule: "PRESCRIPTION_CONVERSION",
        sourceHref: moduleRoutes360.commercial,
        severity: "attention",
        title: "Conversão muito alta pode indicar dinheiro na mesa",
        description: `Conversão atual de ${conversion.toFixed(1)}%. Pode haver prescrição baixa demais.`,
        recommendation: "Avaliar esteira de produtos, genética, exames, longevidade, complementos e plano mais completo.",
      }),
    ];
  }

  return [];
}

export function analyzeRetention(state: Inteligencia360State): IntelligenceInsight[] {
  const latest = state.retentionCohorts.at(-1);
  if (!latest) {
    return [
      sourceInsight({
        id: "retention-missing",
        sourceModule: "RETENTION",
        sourceHref: moduleRoutes360.retention,
        severity: "attention",
        title: "Coorte de retenção ainda não foi preenchida",
        description: "Sem coorte mensal o time não enxerga quem voltou, quem sumiu e quem precisa de resgate.",
        recommendation: "Preencher a coorte do mês com retornos agendados, comparecimentos e faltas.",
      }),
    ];
  }

  const rate = latest.scheduledReturns > 0 ? (latest.attendedReturns / latest.scheduledReturns) * 100 : 0;
  if (rate < 75) {
    return [
      sourceInsight({
        id: `retention-${latest.id}`,
        sourceModule: "RETENTION",
        sourceHref: moduleRoutes360.retention,
        severity: "attention",
        title: "Retenção abaixo do esperado",
        description: `${latest.cohortLabel}: ${rate.toFixed(1)}% de comparecimento nos retornos agendados.`,
        recommendation: "Abrir lista de resgate e revisar régua de exames/confirmacões antes do retorno.",
      }),
    ];
  }

  return [];
}

export function analyzeRescue(state: Inteligencia360State): IntelligenceInsight[] {
  const open = state.rescueWorkflows.filter((record) => ["OPEN", "IN_PROGRESS", "CHURN_INVESTIGATION"].includes(record.status));
  const fatigue = state.touchpoints.filter((record) => record.fatigueRisk || record.optOut);
  const insights: IntelligenceInsight[] = [];

  if (open.length) {
    insights.push(
      sourceInsight({
        id: "rescue-open",
        sourceModule: "RESCUE",
        sourceHref: moduleRoutes360.retention,
        severity: "attention",
        title: `${open.length} paciente(s) em resgate`,
        description: "Há oportunidades abertas antes de classificar churn.",
        recommendation: "Priorizar tentativas com dono, canal e regra de parada clara.",
      }),
    );
  }

  if (fatigue.length) {
    insights.push(
      sourceInsight({
        id: "touch-fatigue",
        sourceModule: "RESCUE",
        sourceHref: moduleRoutes360.touchpoints,
        severity: "critical",
        title: "Risco de excesso de contato em paciente premium",
        description: `${fatigue.length} registro(s) sinalizam fadiga, opt-out ou excesso de toques.`,
        recommendation: "Pausar tentativas redundantes e levar para atendimento manual.",
      }),
    );
  }

  return insights;
}

export function analyzeReceivables(state: Inteligencia360State): IntelligenceInsight[] {
  const open = state.receivables.filter((record) => !["PAID", "CANCELED"].includes(record.status));
  const overdue = open.filter((record) => record.status === "OVERDUE" || isOverdue(record.dueDate));
  const sold = sum(state.prescriptions.map((record) => record.soldAmount));
  const received = sum(state.prescriptions.map((record) => record.receivedAmount));

  const insights: IntelligenceInsight[] = [];
  if (overdue.length) {
    insights.push(
      sourceInsight({
        id: "receivables-overdue",
        sourceModule: "RECEIVABLES",
        sourceHref: moduleRoutes360.receivables,
        severity: "critical",
        title: "Recebíveis vencidos aumentam risco de caixa",
        description: `${overdue.length} registro(s) vencidos ou atrasados.`,
        recommendation: "Abrir cobrança com promessa de pagamento, responsável e próxima data.",
      }),
    );
  }

  if (sold > 0 && received / sold < 0.65) {
    insights.push(
      sourceInsight({
        id: "cash-gap",
        sourceModule: "RECEIVABLES",
        sourceHref: moduleRoutes360.receivables,
        severity: "attention",
        title: "Vendido alto, caixa recebido baixo",
        description: `Recebido representa ${(received / sold * 100).toFixed(1)}% do vendido registrado.`,
        recommendation: "Separar venda parcelada de caixa real e revisar aging de recebíveis.",
      }),
    );
  }

  return insights;
}

export function analyzePatientExperience(state: Inteligencia360State): IntelligenceInsight[] {
  const detractors = state.experiences.filter((record) => record.npsScore <= 6 || record.feedbackType === "CRITICISM" || record.feedbackType === "COMPLAINT");
  const googlePending = state.experiences.filter((record) => record.googleReviewRequested && !record.googleReviewDone);
  const leadershipPending = state.experiences.filter((record) => !record.leadershipContactDone);
  const insights: IntelligenceInsight[] = [];

  if (detractors.length) {
    insights.push(
      sourceInsight({
        id: "nps-low",
        sourceModule: "NPS",
        sourceHref: moduleRoutes360.experience,
        severity: "critical",
        title: "NPS baixo ou crítica aberta exige ação",
        description: `${detractors.length} registro(s) pedem plano corretivo obrigatório.`,
        recommendation: "Criar ação com dono e prazo, registrar causa e fechar retorno com o paciente.",
      }),
    );
  }

  if (googlePending.length || leadershipPending.length) {
    insights.push(
      sourceInsight({
        id: "experience-pending",
        sourceModule: "NPS",
        sourceHref: moduleRoutes360.experience,
        severity: "attention",
        title: "Pendências de reputação e contato de liderança",
        description: `${googlePending.length} avaliação(ões) Google pendentes e ${leadershipPending.length} contato(s) de liderança pendentes.`,
        recommendation: "Executar contato humano antes de pedir novas avaliações.",
      }),
    );
  }

  return insights;
}

export function generateActionRecommendations(state: Inteligencia360State) {
  return [
    ...analyzeWeeklyTicket(state),
    ...analyzePrescriptionConversion(state),
    ...analyzeRetention(state),
    ...analyzeRescue(state),
    ...analyzeReceivables(state),
    ...analyzePatientExperience(state),
  ].slice(0, 10);
}

export function buildDashboard360Snapshot(state: Inteligencia360State, date = new Date()): Dashboard360Snapshot {
  const tickets = state.weeklyTickets;
  const prescriptions = state.prescriptions;
  const receivables = state.receivables.filter((record) => !["PAID", "CANCELED"].includes(record.status));
  const openReceivables = sum(receivables.map(receivableOpenAmount));
  const overdueReceivables = sum(receivables.filter((record) => record.status === "OVERDUE" || isOverdue(record.dueDate)).map(receivableOpenAmount));
  const prescribedAmount = sum(prescriptions.map((record) => record.prescribedAmount));
  const soldAmount = sum(prescriptions.map((record) => record.soldAmount));
  const npsValues = state.experiences.map((record) => record.npsScore).filter((value) => value > 0);
  const latestRetention = state.retentionCohorts.at(-1);
  const retentionRate = latestRetention && latestRetention.scheduledReturns > 0 ? (latestRetention.attendedReturns / latestRetention.scheduledReturns) * 100 : 0;
  const quality = buildDataQuality(state);

  return {
    referenceDate: date.toISOString().slice(0, 10),
    referenceWeek: `${date.getFullYear()}-S${Math.ceil(date.getDate() / 7)}`,
    referenceMonth: date.toISOString().slice(0, 7),
    totalSoldAmount: soldAmount || sum(tickets.map((record) => record.totalSoldAmount)),
    totalReceivedAmount: sum(prescriptions.map((record) => record.receivedAmount)) || sum(tickets.map((record) => record.totalReceivedAmount)),
    totalOpenReceivables: openReceivables,
    totalOverdueReceivables: overdueReceivables,
    averageTicketGeneral: average(tickets.map(averageTicketSold)),
    averageTicketNewPatients: average(tickets.filter((record) => record.patientType === "NEW").map(averageTicketSold)),
    averageTicketReturningPatients: average(tickets.filter((record) => record.patientType === "RETURNING").map(averageTicketSold)),
    prescriptionConversionRate: prescribedAmount > 0 ? (soldAmount / prescribedAmount) * 100 : 0,
    retentionRate,
    rescueOpenCount: state.rescueWorkflows.filter((record) => ["OPEN", "IN_PROGRESS", "CHURN_INVESTIGATION"].includes(record.status)).length,
    churnCount: state.rescueWorkflows.filter((record) => record.status === "NOT_RESCUED").length + state.churnInvestigations.filter((record) => record.status !== "RESOLVED").length,
    npsAverage: average(npsValues),
    criticalActionsCount: state.actions.filter((record) => record.priority === "CRITICAL" && record.status !== "DONE").length,
    overdueActionsCount: state.actions.filter((record) => record.status !== "DONE" && isOverdue(record.dueDate)).length,
    dataCompletenessScore: Math.round((quality.filter((item) => item.status === "complete").length / Math.max(quality.length, 1)) * 100),
    generatedAt: new Date().toISOString(),
  };
}

export function buildDataQuality(state: Inteligencia360State): DataQualityItem[] {
  const modules = [
    {
      module: "Ticket Médio Semanal",
      sourceHref: moduleRoutes360.ticket,
      records: state.weeklyTickets,
      missing: "Ticket Médio Semanal ainda não foi preenchido para esta semana.",
      impact: "Ticket, metas e queda semanal podem estar incompletos.",
    },
    {
      module: "Comercial e Prescrições",
      sourceHref: moduleRoutes360.commercial,
      records: state.prescriptions,
      missing: "Comercial ainda não registrou prescrito x vendido.",
      impact: "Conversão e dinheiro deixado na mesa ficam invisíveis.",
    },
    {
      module: "Jornada do Paciente",
      sourceHref: moduleRoutes360.journey,
      records: state.journeys,
      missing: "Há poucos registros de jornada do paciente.",
      impact: "Gargalos e contratos pendentes podem não aparecer.",
    },
    {
      module: "Réguas de Relacionamento",
      sourceHref: moduleRoutes360.touchpoints,
      records: state.touchpoints,
      missing: "Toques de relacionamento não foram registrados.",
      impact: "Risco de silêncio ou excesso de contato fica sem leitura.",
    },
    {
      module: "Retenção e Resgate",
      sourceHref: moduleRoutes360.retention,
      records: [...state.retentionCohorts, ...state.rescueWorkflows],
      missing: "Coorte/resgate ainda não foram atualizados.",
      impact: "Retenção, resgate e churn podem estar parciais.",
    },
    {
      module: "Experiência do Paciente",
      sourceHref: moduleRoutes360.experience,
      records: state.experiences,
      missing: "NPS e feedbacks ainda não foram preenchidos.",
      impact: "Reputação, críticas e avaliações Google ficam incompletas.",
    },
    {
      module: "Recebíveis e Caixa",
      sourceHref: moduleRoutes360.receivables,
      records: state.receivables,
      missing: "Recebíveis não foram atualizados.",
      impact: "Caixa real e valores vencidos podem estar distorcidos.",
    },
    {
      module: "Ações e Plano de Melhoria",
      sourceHref: moduleRoutes360.actions,
      records: state.actions,
      missing: "Não há ações com dono e prazo.",
      impact: "Insights podem não virar execução.",
    },
  ];

  return modules.map((module) => ({
    module: module.module,
    sourceHref: module.sourceHref,
    status: module.records.length ? "complete" : "missing",
    lastUpdated: lastUpdated(module.records),
    message: module.records.length ? "Dados disponíveis para consolidação." : module.missing,
    impact: module.impact,
  }));
}

export function generateWeeklyKickoffBrief(state: Inteligencia360State) {
  const snapshot = buildDashboard360Snapshot(state);
  const insights = generateActionRecommendations(state);
  const doctors = [...new Set(state.weeklyTickets.map((record) => record.doctorName))];
  const fallingDoctors = state.weeklyTickets.filter((record) => ticketVariationPercentage(record) < 0).map((record) => record.doctorName);
  const risingDoctors = state.weeklyTickets.filter((record) => ticketVariationPercentage(record) > 0).map((record) => record.doctorName);

  return [
    `Kick-off semanal - Inteligência 360`,
    `Vendido: ${snapshot.totalSoldAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Recebido: ${snapshot.totalReceivedAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
    `Ticket médio geral: ${snapshot.averageTicketGeneral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Novos: ${snapshot.averageTicketNewPatients.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Recorrentes: ${snapshot.averageTicketReturningPatients.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
    `Médicos analisados: ${doctors.join(", ") || "sem dados"}. Subiram: ${risingDoctors.join(", ") || "nenhum"}. Caíram: ${fallingDoctors.join(", ") || "nenhum"}.`,
    `Conversão prescrito x vendido: ${snapshot.prescriptionConversionRate.toFixed(1)}%. Recebíveis vencidos: ${snapshot.totalOverdueReceivables.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
    `Decisões necessárias: 1) foco comercial da semana; 2) prioridade de cobrança; 3) ajuste de jornada/retencao.`,
    `Ações recomendadas: ${insights.slice(0, 5).map((insight) => insight.recommendation).join(" | ") || "manter cadência e preencher dados."}`,
  ].join("\n");
}

export function generateMorningGoalMessage(state: Inteligencia360State, date = new Date()) {
  const snapshot = buildDashboard360Snapshot(state, date);
  const gap = Math.max(state.settings.weeklyRevenueTarget - snapshot.totalSoldAmount, 0);
  const focus = generateActionRecommendations(state)[0]?.recommendation ?? "executar o básico bem feito, com dados completos e paciente cuidado.";

  return [
    `Bom dia, equipe Bratan.`,
    `Meta semanal: ${state.settings.weeklyRevenueTarget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Vendido até agora: ${snapshot.totalSoldAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Gap: ${gap.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
    `Foco do dia: ${focus}`,
    `Cuidar bem, registrar bem e agir rápido. Dado vira decisão; decisão vira resultado.`,
  ].join("\n");
}

export function actionFromInsight(insight: IntelligenceInsight): ActionItem360 {
  const now = new Date();
  const due = new Date(now);
  due.setDate(now.getDate() + (insight.severity === "critical" ? 2 : 5));

  return {
    id: `act-${crypto.randomUUID?.() ?? Date.now()}`,
    sourceModule: insight.sourceModule,
    sourceId: insight.id,
    title: insight.title,
    description: `${insight.description} Recomendação: ${insight.recommendation}`,
    priority: insight.severity === "critical" ? "CRITICAL" : "HIGH",
    ownerUserId: "Gestão",
    dueDate: due.toISOString().slice(0, 10),
    status: "OPEN",
    expectedImpact:
      insight.sourceModule === "RECEIVABLES"
        ? "CASH"
        : insight.sourceModule === "NPS"
          ? "PATIENT_EXPERIENCE"
          : insight.sourceModule === "RETENTION" || insight.sourceModule === "RESCUE"
            ? "RETENTION"
            : "CONVERSION",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
