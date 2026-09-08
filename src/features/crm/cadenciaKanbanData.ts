// KANBAN POR CADÊNCIA (08/09/2026, pedido do Lucas): "não apenas do plano de
// acompanhamento — um kanban da cadência 3·1·3·1, outro da D1–D5 e assim vai".
//
// Cada cadência vira um quadro: as COLUNAS são os passos (D1, D5, D7, D60…) e
// os CARTÕES são as inscrições ativas, cada uma na coluna do passo que está
// esperando ser feito. Tudo derivado das tarefas que o motor já gera — nada é
// digitado aqui; concluir o passo no cartão usa o mesmo completeCrmTask da
// tela Minhas Tarefas e da Planilha de Cadências.
import {
  cadenceTaskIdFor,
  contactDisplayName,
  type CrmCadence,
  type CrmCadenceEnrollment,
  type CrmCadenceStep,
  type CrmState,
  type CrmTask,
} from "./crmData";

export type CartaoCadencia = {
  enrollmentId: string;
  cadenceId: string;
  contactId: string;
  dealId: string;
  nome: string;
  telefone: string;
  /** Por que entrou nesta régua (triggerSource da inscrição). */
  motivo: string;
  inscritoEm: string;
  /** Passo em que o cartão está (null = todos feitos). */
  stepId: string | null;
  /** Tarefa pendente desse passo, quando o motor já a criou. */
  tarefaId: string | null;
  /** Data prevista do toque (dueAt) — ou null se a tarefa ainda não nasceu. */
  vence: string | null;
  /** > 0 quando o toque já passou da data. */
  atrasoDias: number;
  venceHoje: boolean;
  passosFeitos: number;
  totalPassos: number;
  /** Resultado do último toque feito, para quem lê o cartão. */
  ultimoResultado: string;
  status: CrmCadenceEnrollment["status"];
};

export type ColunaCadencia = {
  stepId: string;
  nome: string;
  ordem: number;
  cartoes: CartaoCadencia[];
};

export type KanbanCadencia = {
  cadence: CrmCadence;
  colunas: ColunaCadencia[];
  /** Quem já passou por todos os passos ou saiu da régua nos últimos dias. */
  encerrados: CartaoCadencia[];
  totais: { ativos: number; atrasados: number; hoje: number };
};

function diasEntre(de: string, ate: string) {
  const [a1, m1, d1] = de.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ate.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function passosDaCadencia(state: CrmState, cadenceId: string): CrmCadenceStep[] {
  return state.cadenceSteps.filter((step) => step.cadenceId === cadenceId && step.active).sort((a, b) => a.stepOrder - b.stepOrder);
}

/** Mesma linkagem tarefa↔inscrição da Planilha de Cadências (id determinístico; depois, busca por contato+cadência+passo). */
export function tarefaDoPasso(state: CrmState, enrollment: CrmCadenceEnrollment, step: CrmCadenceStep): CrmTask | null {
  const recorrente = step.offsetType === "RECURRING_EVERY_X_DAYS" || step.offsetType === "RECURRING_EVERY_X_MONTHS";
  const porId = recorrente ? null : state.tasks.find((task) => task.id === cadenceTaskIdFor(enrollment.contactId, enrollment.cadenceId, step.id, enrollment.triggerDate)) ?? null;
  return (
    porId ??
    state.tasks
      .filter(
        (task) =>
          task.contactId === enrollment.contactId &&
          task.cadenceId === enrollment.cadenceId &&
          task.cadenceStepId === step.id &&
          task.createdAt >= enrollment.createdAt,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    null
  );
}

const FEITA: CrmTask["status"][] = ["DONE", "SKIPPED", "CANCELED"];

function cartaoDaInscricao(state: CrmState, enrollment: CrmCadenceEnrollment, passos: CrmCadenceStep[], hoje: string): CartaoCadencia | null {
  const contact = state.contacts.find((item) => item.id === enrollment.contactId);
  if (!contact) return null;
  const pares = passos.map((step) => ({ step, task: tarefaDoPasso(state, enrollment, step) }));
  const feitos = pares.filter((par) => par.task && FEITA.includes(par.task.status));
  // O passo da vez: o primeiro que ainda não foi feito (com tarefa pendente ou
  // ainda por nascer — a régua é sequencial).
  const daVez = enrollment.status === "ACTIVE" ? pares.find((par) => !par.task || !FEITA.includes(par.task.status)) ?? null : null;
  const tarefa = daVez?.task ?? null;
  const vence = tarefa ? tarefa.dueAt.slice(0, 10) : null;
  const atraso = vence ? diasEntre(vence, hoje) : 0;
  const ultimo = [...feitos].sort((a, b) => (b.task!.completedAt ?? "").localeCompare(a.task!.completedAt ?? ""))[0]?.task;
  return {
    enrollmentId: enrollment.id,
    cadenceId: enrollment.cadenceId,
    contactId: contact.id,
    dealId: enrollment.dealId,
    nome: contactDisplayName(contact),
    telefone: contact.whatsapp || contact.phone || "",
    motivo: enrollment.triggerSource || "",
    inscritoEm: enrollment.triggerDate || enrollment.enrolledAt.slice(0, 10),
    stepId: daVez?.step.id ?? null,
    tarefaId: tarefa && tarefa.status !== "DONE" ? tarefa.id : null,
    vence,
    atrasoDias: atraso > 0 ? atraso : 0,
    venceHoje: vence === hoje,
    passosFeitos: feitos.length,
    totalPassos: passos.length,
    ultimoResultado: ultimo?.resultNotes || ultimo?.result || "",
    status: enrollment.status,
  };
}

export function buildKanbanCadencia(state: CrmState, cadenceId: string, hoje: string, diasHistorico = 30): KanbanCadencia | null {
  const cadence = state.cadences.find((item) => item.id === cadenceId);
  if (!cadence) return null;
  const passos = passosDaCadencia(state, cadenceId);
  const colunas: ColunaCadencia[] = passos.map((step) => ({ stepId: step.id, nome: step.name, ordem: step.stepOrder, cartoes: [] }));
  const encerrados: CartaoCadencia[] = [];
  let atrasados = 0;
  let hojeN = 0;
  let ativos = 0;
  for (const enrollment of state.cadenceEnrollments) {
    if (enrollment.cadenceId !== cadenceId) continue;
    const cartao = cartaoDaInscricao(state, enrollment, passos, hoje);
    if (!cartao) continue;
    if (enrollment.status === "ACTIVE" && cartao.stepId) {
      ativos += 1;
      if (cartao.atrasoDias > 0) atrasados += 1;
      if (cartao.venceHoje) hojeN += 1;
      colunas.find((coluna) => coluna.stepId === cartao.stepId)?.cartoes.push(cartao);
      continue;
    }
    const referencia = (enrollment.completedAt ?? enrollment.updatedAt ?? enrollment.enrolledAt).slice(0, 10);
    if (diasEntre(referencia, hoje) <= diasHistorico) encerrados.push(cartao);
  }
  // Atrasado primeiro, depois quem vence antes.
  const ordem = (a: CartaoCadencia, b: CartaoCadencia) => b.atrasoDias - a.atrasoDias || (a.vence ?? "9999").localeCompare(b.vence ?? "9999") || a.nome.localeCompare(b.nome);
  for (const coluna of colunas) coluna.cartoes.sort(ordem);
  encerrados.sort((a, b) => b.inscritoEm.localeCompare(a.inscritoEm));
  return { cadence, colunas, encerrados, totais: { ativos, atrasados, hoje: hojeN } };
}

export type ResumoCadencia = { cadence: CrmCadence; ativos: number; atrasados: number; passos: number };

/** Uma linha por cadência com passos, para montar as abas: quem tem gente ativa vem primeiro. */
export function resumoDasCadencias(state: CrmState, hoje: string): ResumoCadencia[] {
  return state.cadences
    .filter((cadence) => cadence.active && passosDaCadencia(state, cadence.id).length > 0)
    .map((cadence) => {
      const kanban = buildKanbanCadencia(state, cadence.id, hoje, 0);
      return { cadence, ativos: kanban?.totais.ativos ?? 0, atrasados: kanban?.totais.atrasados ?? 0, passos: kanban?.colunas.length ?? 0 };
    })
    .sort((a, b) => b.ativos - a.ativos || b.atrasados - a.atrasados || a.cadence.name.localeCompare(b.cadence.name));
}

/** Nome curto para caber numa aba (o nome completo fica no title). */
export function rotuloCurtoDaCadencia(cadence: CrmCadence): string {
  const porId: Record<string, string> = {
    "cad-cold-lead": "Lead frio D1·D5·D7·D60",
    "cad-not-closed": "Não fechou D1–D5",
    "cad-concierge-d1": "Concierge D+1",
    "cad-pos-consulta-d1": "Pós-consulta D+1",
    "cad-nursing-14": "Enfermagem 14 dias",
    "cad-post-application": "Pós-aplicação",
    "cad-rescue-60d": "Resgate 60 dias",
    "cad-rescue-6m": "Resgate 6 meses",
    "cad-rescue-1y": "Resgate 1 ano",
    "cad-anniversary-1y": "Aniversário 1 ano",
    "cad-pos-fechamento-d2d5": "Pós-fechamento D2–D5",
    "cad-gestor-5lig": "Gestor · 5 ligações",
    "cad-gestor-3131": "3·1·3·1 do Gestor",
    "cad-return-cycle": "3·1·3·1 da consulta",
    "cad-repescagem": "Repescagem",
  };
  return porId[cadence.id] ?? cadence.name.replace(/\s*[—-]\s*.*$/, "").slice(0, 26);
}
