// Aba "Acompanhamento" do Dr. Daniel — motor puro.
//
// O plano de acompanhamento (POP v3.1) dura 6 meses a partir da adesão:
//   - 6 checkpoints mensais com a Assistente de Performance (1/mês)
//   - 6 bioimpedâncias (1/mês, junto do checkpoint)
//   - 3 consultas com o Dr. Daniel (1 a cada 2 meses: mês 2, 4 e 6)
// A agenda vive no Feegow; aqui vive o CONTROLE: o que já foi feito e o que
// vem a seguir, por paciente. Concluídos ficam em deal.programMilestonesDone
// (chaves determinísticas) — marcados pelo médico/gestão nesta aba.
import {
  contactDisplayName,
  createCrmId,
  programPhaseLabels,
  type CrmAdhesionChannel,
  type CrmContact,
  type CrmDeal,
  type CrmProgramPhase,
  type CrmState,
} from "@/features/crm/crmData";

export type ProgramMilestoneType = "CHECK" | "BIO" | "MEDICO";

// Quem, pelo POP v3.1, faz cada passo (rótulo de responsável — o time todo pode
// marcar, mas isto deixa claro de quem é a etapa no fluxo).
export const milestoneResponsible: Record<ProgramMilestoneType, string> = {
  CHECK: "Assistente de Performance",
  BIO: "Enfermagem / Performance",
  MEDICO: "Dr. Daniel",
};

export type ProgramMilestone = {
  key: string; // ex.: "CHECK-1", "BIO-3", "MEDICO-2"
  type: ProgramMilestoneType;
  n: number;
  total: number;
  label: string;
  expectedDate: string; // ISO — derivada da data de adesão
  done: boolean;
  overdue: boolean; // esperada para antes de hoje e ainda não feita
};

export type ProgramPatientCard = {
  dealId: string;
  contactId: string;
  patientName: string;
  phone: string;
  channel: CrmAdhesionChannel | null;
  phase: CrmProgramPhase;
  phaseLabel: string;
  startedAt: string; // início do programa (adesão)
  monthOfProgram: number; // 1..6 (trava em 6)
  milestones: ProgramMilestone[];
  checksDone: number;
  biosDone: number;
  medicoDone: number;
  nextMilestone: ProgramMilestone | null;
  overdueCount: number;
};

export const milestoneTypeLabels: Record<ProgramMilestoneType, string> = {
  CHECK: "Checkpoint Performance",
  BIO: "Bioimpedância",
  MEDICO: "Consulta Dr. Daniel",
};

const MEDICO_ORDINAL = ["1ª consulta", "2ª consulta", "3ª e última consulta"];

export function milestoneKey(type: ProgramMilestoneType, n: number) {
  return `${type}-${n}`;
}

function addMonthsISO(dateISO: string, months: number) {
  const [y, m, d] = dateISO.slice(0, 10).split("-").map(Number);
  const base = new Date(Date.UTC(y, (m - 1) + months, 1));
  // Preserva o dia, limitado ao último dia do mês destino (31/01 + 1 mês → 28/02).
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, lastDay));
  return base.toISOString().slice(0, 10);
}

function monthsBetween(startISO: string, todayISO: string) {
  const [sy, sm] = startISO.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = todayISO.slice(0, 10).split("-").map(Number);
  const sd = Number(startISO.slice(8, 10));
  let months = (ty - sy) * 12 + (tm - sm);
  if (td < sd) months -= 1;
  return Math.max(0, months);
}

export function programStartDate(deal: CrmDeal): string {
  return (deal.closedAt || deal.programPhaseEnteredAt || deal.updatedAt || deal.createdAt || "").slice(0, 10);
}

// Plano completo de marcos de um paciente, com o feito/por fazer.
export function buildMilestones(deal: CrmDeal, todayISO: string): ProgramMilestone[] {
  const start = programStartDate(deal);
  const done = new Set(deal.programMilestonesDone ?? []);
  const milestones: ProgramMilestone[] = [];
  for (let n = 1; n <= 6; n += 1) {
    const expected = addMonthsISO(start, n);
    for (const type of ["CHECK", "BIO"] as const) {
      const key = milestoneKey(type, n);
      milestones.push({
        key,
        type,
        n,
        total: 6,
        label: `${milestoneTypeLabels[type]} ${n}/6`,
        expectedDate: expected,
        done: done.has(key),
        overdue: !done.has(key) && expected < todayISO,
      });
    }
  }
  for (let n = 1; n <= 3; n += 1) {
    const expected = addMonthsISO(start, n * 2);
    const key = milestoneKey("MEDICO", n);
    milestones.push({
      key,
      type: "MEDICO",
      n,
      total: 3,
      label: `${MEDICO_ORDINAL[n - 1]} (mês ${n * 2})`,
      expectedDate: expected,
      done: done.has(key),
      overdue: !done.has(key) && expected < todayISO,
    });
  }
  return milestones.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate) || a.key.localeCompare(b.key));
}

// Todos os pacientes em acompanhamento (deals na jornada PROGRAMA, não encerrados).
export function buildProgramaBoard(state: CrmState, todayISO: string): ProgramPatientCard[] {
  const contactById = new Map(state.contacts.map((contact) => [contact.id, contact]));
  return state.deals
    // Encerramento ainda APARECE (é a decisão do médico: renovar/manutenção/alta);
    // o paciente só sai da lista quando o desfecho é registrado.
    .filter((deal) => deal.programPhase && !deal.programOutcome && deal.status !== "LOST")
    .map((deal) => {
      const contact = contactById.get(deal.contactId);
      const milestones = buildMilestones(deal, todayISO);
      const checksDone = milestones.filter((m) => m.type === "CHECK" && m.done).length;
      const biosDone = milestones.filter((m) => m.type === "BIO" && m.done).length;
      const medicoDone = milestones.filter((m) => m.type === "MEDICO" && m.done).length;
      const pending = milestones.filter((m) => !m.done);
      const start = programStartDate(deal);
      return {
        dealId: deal.id,
        contactId: deal.contactId,
        patientName: contact?.fullName || deal.title || "Paciente",
        phone: contact?.phone || "",
        channel: deal.adhesionChannel ?? null,
        phase: deal.programPhase as CrmProgramPhase,
        phaseLabel: programPhaseLabels[deal.programPhase as CrmProgramPhase],
        startedAt: start,
        monthOfProgram: Math.min(6, monthsBetween(start, todayISO) + 1),
        milestones,
        checksDone,
        biosDone,
        medicoDone,
        nextMilestone: pending[0] ?? null,
        overdueCount: milestones.filter((m) => m.overdue).length,
      };
    })
    .sort((a, b) => b.overdueCount - a.overdueCount || a.patientName.localeCompare(b.patientName));
}

// Constrói a lista de marcos concluídos a partir de contagens (para cadastrar
// paciente já em andamento: "já fez 3 checkpoints, 2 bios, 1 consulta").
export function programMilestonesFromCounts(checks: number, bios: number, medico: number): string[] {
  const done: string[] = [];
  for (let n = 1; n <= Math.min(6, Math.max(0, Math.floor(checks))); n += 1) done.push(milestoneKey("CHECK", n));
  for (let n = 1; n <= Math.min(6, Math.max(0, Math.floor(bios))); n += 1) done.push(milestoneKey("BIO", n));
  for (let n = 1; n <= Math.min(3, Math.max(0, Math.floor(medico))); n += 1) done.push(milestoneKey("MEDICO", n));
  return done.sort();
}

export type EnrollInput = {
  contactId: string;
  startDate: string; // ISO — data de adesão
  channel: CrmAdhesionChannel;
  checksDone: number;
  biosDone: number;
  medicoDone: number;
};

// Cadastra (ou atualiza) um paciente JÁ existente no plano de acompanhamento —
// usado para trazer quem entrou antes do app. Reaproveita o deal ganho mais
// recente do paciente; se não houver, cria um deal do plano. Idempotente por
// paciente: chamar de novo apenas atualiza os marcos/datas.
export function enrollPatientInProgram(state: CrmState, input: EnrollInput): CrmState {
  const now = new Date().toISOString();
  const milestones = programMilestonesFromCounts(input.checksDone, input.biosDone, input.medicoDone);
  const existing = state.deals
    .filter((deal) => deal.contactId === input.contactId)
    .sort((a, b) => (b.closedAt || b.createdAt || "").localeCompare(a.closedAt || a.createdAt || ""))[0];

  let deals: CrmDeal[];
  if (existing) {
    deals = state.deals.map((deal) =>
      deal.id === existing.id
        ? {
            ...deal,
            programPhase: "CADENCIA_PROGRAMA",
            programPhaseEnteredAt: deal.programPhaseEnteredAt || now,
            programOutcome: null,
            adhesionChannel: input.channel,
            closedAt: input.startDate || deal.closedAt,
            status: deal.status === "OPEN" ? "WON_FULL" : deal.status,
            programMilestonesDone: milestones,
            updatedAt: now,
          }
        : deal,
    );
  } else {
    const contact = state.contacts.find((item) => item.id === input.contactId);
    const newDeal: CrmDeal = {
      id: createCrmId("deal"),
      contactId: input.contactId,
      title: contact ? contactDisplayName(contact) : "Plano de acompanhamento",
      dealType: "TREATMENT_PLAN",
      stage: "FECHOU_COMPLETO",
      estimatedValue: 0,
      prescribedAmount: 0,
      soldAmount: 0,
      receivedAmount: 0,
      probability: 100,
      status: "WON_FULL",
      mainObjection: "",
      objectionCategory: "OTHER",
      sourceChannel: "Cadastro manual (plano existente)",
      ownerUserId: "",
      doctorId: "",
      expectedCloseDate: input.startDate,
      closedAt: input.startDate,
      createdAt: now,
      updatedAt: now,
      programPhase: "CADENCIA_PROGRAMA",
      programPhaseEnteredAt: now,
      adhesionChannel: input.channel,
      programMilestonesDone: milestones,
    };
    deals = [newDeal, ...state.deals];
  }

  const contacts = state.contacts.map((contact) =>
    contact.id === input.contactId && contact.lifecycleStage !== "ACTIVE_PATIENT"
      ? { ...contact, lifecycleStage: "ACTIVE_PATIENT" as const, updatedAt: now }
      : contact,
  );
  return { ...state, deals, contacts };
}

// Pacientes ATIVOS (ou fechados) que ainda NÃO estão no board do plano — para
// sugerir o cadastro dos antigos com um clique.
export function patientsNotInProgram(state: CrmState, todayISO: string): CrmContact[] {
  const enrolled = new Set(buildProgramaBoard(state, todayISO).map((card) => card.contactId));
  return state.contacts
    .filter((contact) => !contact.archivedAt && !enrolled.has(contact.id))
    .filter((contact) => ["CLOSED_PATIENT", "ACTIVE_PATIENT"].includes(contact.lifecycleStage))
    .sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b), "pt-BR"));
}

// Marca/desmarca um marco no deal (imutável — para usar com persist do CRM).
export function toggleProgramMilestone(state: CrmState, dealId: string, key: string): CrmState {
  return {
    ...state,
    deals: state.deals.map((deal) => {
      if (deal.id !== dealId) return deal;
      const current = new Set(deal.programMilestonesDone ?? []);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      return { ...deal, programMilestonesDone: [...current].sort(), updatedAt: new Date().toISOString() };
    }),
  };
}

function formatBR(dateISO: string) {
  return dateISO ? dateISO.slice(0, 10).split("-").reverse().join("/") : "";
}

// Relatório em TABELA para a Assistente de Performance (colunas por paciente,
// quanto já foi e quanto falta de cada etapa). Alimenta o PDF com a marca.
export function buildPerformanceReportTable(cards: ProgramPatientCard[]): { headers: string[]; rows: string[][] } {
  const headers = ["Paciente", "Fase", "Mês", "Checkpoints", "Bioimpedâncias", "Consultas Dr.", "Próximo passo"];
  const rows = cards.map((card) => {
    const next = card.nextMilestone
      ? `${card.nextMilestone.label} · ${formatBR(card.nextMilestone.expectedDate)}${card.nextMilestone.overdue ? " (ATRASADO)" : ""}`
      : "Plano completo";
    return [
      card.patientName,
      card.phaseLabel,
      `${card.monthOfProgram}/6`,
      `${card.checksDone}/6 · faltam ${6 - card.checksDone}`,
      `${card.biosDone}/6 · faltam ${6 - card.biosDone}`,
      `${card.medicoDone}/3 · faltam ${3 - card.medicoDone}`,
      next,
    ];
  });
  return { headers, rows };
}

// Resumo executivo do plano (para o cabeçalho do relatório).
export function programSummaryLines(cards: ProgramPatientCard[]): string[] {
  const emDia = cards.filter((card) => card.overdueCount === 0).length;
  const atrasados = cards.filter((card) => card.overdueCount > 0).length;
  const checkFaltam = cards.reduce((sum, card) => sum + (6 - card.checksDone), 0);
  const bioFaltam = cards.reduce((sum, card) => sum + (6 - card.biosDone), 0);
  return [
    `${cards.length} paciente(s) em acompanhamento — ${emDia} em dia, ${atrasados} com atraso.`,
    `Faltam no total: ${checkFaltam} checkpoint(s) e ${bioFaltam} bioimpedância(s).`,
  ];
}

