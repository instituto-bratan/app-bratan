// REPESCAGEM (08/09/2026, pedido do Lucas): "uma aba de repescagens que registre
// há quanto tempo a pessoa deixou de vir (1 mês, 3 meses, 6 meses, 1 ano), o
// nome, a data e a hora em que a repescagem foi feita. A repescagem é por
// LIGAÇÃO; antes vai uma mensagem que é só a isca — para saber o melhor horário
// de ligar."
//
// Tudo ligado às cadências: a repescagem é a cadência "cad-repescagem" (isca no
// WhatsApp → ligação → 2ª ligação). Quem está sumido vem do dinheiro (última
// comanda), igual ao radar de resgate. Data e hora de cada toque são o
// completedAt das tarefas — nada é digitado à parte.
import type { FinSale } from "@/features/financeiro/financeiroData";
import {
  contactDisplayName,
  enrollContactInCadence,
  type CrmCadenceEnrollment,
  type CrmContact,
  type CrmRole,
  type CrmState,
  type CrmTask,
} from "./crmData";
import { tarefaDoPasso, passosDaCadencia } from "./cadenciaKanbanData";

export const CADENCIA_REPESCAGEM = "cad-repescagem";
export const PASSO_ISCA = "step-repesc-isca";
export const PASSO_LIGACAO_1 = "step-repesc-lig1";
export const PASSO_LIGACAO_2 = "step-repesc-lig2";

export type FaixaRepescagem = "M1" | "M3" | "M6" | "A1";

export const faixaRepescagemLabels: Record<FaixaRepescagem, string> = {
  M1: "1 mês sem vir",
  M3: "3 meses sem vir",
  M6: "6 meses sem vir",
  A1: "1 ano ou mais sem vir",
};

export const faixaRepescagemCurta: Record<FaixaRepescagem, string> = { M1: "1 mês", M3: "3 meses", M6: "6 meses", A1: "1 ano+" };

export function faixaPorDias(dias: number): FaixaRepescagem | null {
  if (dias >= 365) return "A1";
  if (dias >= 180) return "M6";
  if (dias >= 90) return "M3";
  if (dias >= 30) return "M1";
  return null;
}

function diasEntre(deISO: string, ateISO: string) {
  const [a1, m1, d1] = deISO.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ateISO.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export type CandidatoRepescagem = {
  contact: CrmContact;
  ultimaVisita: string;
  diasSemVir: number;
  faixa: FaixaRepescagem;
};

/**
 * Quem pode ser repescado: tem comanda (veio de verdade), a última faz 30+ dias
 * e ninguém está cuidando (sem negociação aberta, jornada ativa ou cadência
 * ativa). Mais tempo sumido primeiro, porque é quem mais precisa da ligação.
 */
export function candidatosRepescagem(state: CrmState, sales: FinSale[], hoje: string): CandidatoRepescagem[] {
  const ultimaPorContato = new Map<string, string>();
  for (const sale of sales) {
    if (!sale.crmContactRef) continue;
    const atual = ultimaPorContato.get(sale.crmContactRef);
    if (!atual || sale.saleDate > atual) ultimaPorContato.set(sale.crmContactRef, sale.saleDate);
  }
  const cuidados = new Set<string>();
  for (const deal of state.deals) {
    if (deal.status === "OPEN") cuidados.add(deal.contactId);
    if (deal.programPhase && !deal.programOutcome) cuidados.add(deal.contactId);
  }
  for (const enrollment of state.cadenceEnrollments) if (enrollment.status === "ACTIVE") cuidados.add(enrollment.contactId);
  // Quem já foi repescado nos últimos 60 dias não volta para a fila logo.
  for (const enrollment of state.cadenceEnrollments) {
    if (enrollment.cadenceId !== CADENCIA_REPESCAGEM) continue;
    const fim = (enrollment.completedAt ?? enrollment.updatedAt ?? enrollment.enrolledAt).slice(0, 10);
    if (diasEntre(fim, hoje) <= 60) cuidados.add(enrollment.contactId);
  }
  const lista: CandidatoRepescagem[] = [];
  for (const contact of state.contacts) {
    if (contact.archivedAt) continue;
    if (cuidados.has(contact.id)) continue;
    const ultima = ultimaPorContato.get(contact.id);
    if (!ultima) continue;
    const dias = diasEntre(ultima, hoje);
    const faixa = faixaPorDias(dias);
    if (!faixa) continue;
    lista.push({ contact, ultimaVisita: ultima, diasSemVir: dias, faixa });
  }
  return lista.sort((a, b) => b.diasSemVir - a.diasSemVir);
}

const MOTIVO = /Repescagem · (M1|M3|M6|A1) · última visita (\d{4}-\d{2}-\d{2})/;

export function motivoRepescagem(faixa: FaixaRepescagem, ultimaVisita: string) {
  return `Repescagem · ${faixa} · última visita ${ultimaVisita}`;
}

export function faixaDoMotivo(triggerSource: string): { faixa: FaixaRepescagem; ultimaVisita: string } | null {
  const achado = MOTIVO.exec(triggerSource);
  return achado ? { faixa: achado[1] as FaixaRepescagem, ultimaVisita: achado[2] } : null;
}

/** Cria a inscrição na cadência de repescagem (nasce a tarefa da isca). */
export function iniciarRepescagem(
  state: CrmState,
  candidato: CandidatoRepescagem,
  actor: { userId: string; role: CrmRole },
  hoje: string,
): CrmState {
  return enrollContactInCadence(state, {
    cadenceId: CADENCIA_REPESCAGEM,
    contactId: candidato.contact.id,
    dealId: "",
    triggerSource: motivoRepescagem(candidato.faixa, candidato.ultimaVisita),
    triggerDate: hoje,
    ownerUserId: actor.userId,
    ownerRole: actor.role,
  });
}

/** O paciente respondeu a isca dizendo o horário: a ligação passa para essa hora. */
export function marcarHorarioDaLigacao(state: CrmState, taskId: string, dueAtISO: string): CrmState {
  const now = new Date().toISOString();
  return {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId && task.status !== "DONE" ? { ...task, dueAt: dueAtISO, status: "PENDING", updatedAt: now } : task)),
  };
}

export type EtapaRepescagem = "ISCA" | "LIGAR" | "REPESCADO" | "SEM_RETORNO";

export type CartaoRepescagem = {
  enrollmentId: string;
  contactId: string;
  nome: string;
  telefone: string;
  faixa: FaixaRepescagem | null;
  ultimaVisita: string;
  iniciadaEm: string;
  etapa: EtapaRepescagem;
  /** Tarefa pendente da etapa (isca ou ligação). */
  tarefaId: string | null;
  tarefaVence: string | null;
  atrasoDias: number;
  ligacaoN: 0 | 1 | 2;
  iscaEnviadaEm: string | null;
  ligacoes: { n: number; em: string; resultado: string }[];
  resultado: string;
  status: CrmCadenceEnrollment["status"];
};

function resultadoLegivel(task: CrmTask) {
  if (task.resultNotes) return task.resultNotes;
  const mapa: Record<string, string> = { SCHEDULED: "agendou", RESCHEDULED: "reagendou", RESPONDED: "respondeu", NO_RESPONSE: "não atendeu", SENT: "enviada", SOLD: "fechou" };
  return mapa[task.result] ?? task.result ?? "";
}

export function cartaoRepescagem(state: CrmState, enrollment: CrmCadenceEnrollment, hoje: string): CartaoRepescagem | null {
  const contact = state.contacts.find((item) => item.id === enrollment.contactId);
  if (!contact) return null;
  const passos = passosDaCadencia(state, CADENCIA_REPESCAGEM);
  const pares = passos.map((step) => ({ step, task: tarefaDoPasso(state, enrollment, step) }));
  const isca = pares.find((p) => p.step.id === PASSO_ISCA)?.task ?? null;
  const ligacoes = pares
    .filter((p) => p.step.id !== PASSO_ISCA && p.task?.status === "DONE")
    .map((p, i) => ({ n: i + 1, em: p.task!.completedAt ?? p.task!.dueAt, resultado: resultadoLegivel(p.task!) }));
  const pendente = pares.find((p) => p.task && !["DONE", "SKIPPED", "CANCELED"].includes(p.task.status)) ?? null;
  const motivo = faixaDoMotivo(enrollment.triggerSource);
  const ultimaResposta = [...pares].reverse().find((p) => p.task?.status === "DONE" && ["SCHEDULED", "RESCHEDULED", "RESPONDED", "SOLD"].includes(p.task.result))?.task;
  let etapa: EtapaRepescagem;
  if (enrollment.status === "ACTIVE" && pendente?.step.id === PASSO_ISCA) etapa = "ISCA";
  else if (enrollment.status === "ACTIVE") etapa = "LIGAR";
  else if (ultimaResposta) etapa = "REPESCADO";
  else etapa = "SEM_RETORNO";
  const vence = pendente?.task ? pendente.task.dueAt : null;
  const atraso = vence ? diasEntre(vence, hoje) : 0;
  return {
    enrollmentId: enrollment.id,
    contactId: contact.id,
    nome: contactDisplayName(contact),
    telefone: contact.whatsapp || contact.phone || "",
    faixa: motivo?.faixa ?? null,
    ultimaVisita: motivo?.ultimaVisita ?? "",
    iniciadaEm: enrollment.enrolledAt,
    etapa,
    tarefaId: pendente?.task?.id ?? null,
    tarefaVence: vence,
    atrasoDias: atraso > 0 ? atraso : 0,
    ligacaoN: pendente?.step.id === PASSO_LIGACAO_1 ? 1 : pendente?.step.id === PASSO_LIGACAO_2 ? 2 : 0,
    iscaEnviadaEm: isca?.status === "DONE" ? (isca.completedAt ?? isca.dueAt) : null,
    ligacoes,
    resultado: ultimaResposta ? resultadoLegivel(ultimaResposta) : enrollment.status === "ACTIVE" ? "" : ligacoes.length ? "sem retorno" : enrollment.canceledReason || "",
    status: enrollment.status,
  };
}

export type QuadroRepescagem = {
  candidatos: CandidatoRepescagem[];
  porFaixa: Record<FaixaRepescagem, number>;
  isca: CartaoRepescagem[];
  ligar: CartaoRepescagem[];
  repescados: CartaoRepescagem[];
  semRetorno: CartaoRepescagem[];
  /** Todas as repescagens dos últimos dias, mais recente primeiro — o registro. */
  registro: CartaoRepescagem[];
};

export function buildQuadroRepescagem(state: CrmState, sales: FinSale[], hoje: string, diasHistorico = 90): QuadroRepescagem {
  const candidatos = candidatosRepescagem(state, sales, hoje);
  const porFaixa: Record<FaixaRepescagem, number> = { M1: 0, M3: 0, M6: 0, A1: 0 };
  for (const c of candidatos) porFaixa[c.faixa] += 1;
  const cartoes = state.cadenceEnrollments
    .filter((enrollment) => enrollment.cadenceId === CADENCIA_REPESCAGEM)
    .map((enrollment) => cartaoRepescagem(state, enrollment, hoje))
    .filter((c): c is CartaoRepescagem => Boolean(c))
    .filter((c) => c.status === "ACTIVE" || diasEntre(c.iniciadaEm, hoje) <= diasHistorico);
  const porUrgencia = (a: CartaoRepescagem, b: CartaoRepescagem) => b.atrasoDias - a.atrasoDias || (a.tarefaVence ?? "9").localeCompare(b.tarefaVence ?? "9");
  return {
    candidatos,
    porFaixa,
    isca: cartoes.filter((c) => c.etapa === "ISCA").sort(porUrgencia),
    ligar: cartoes.filter((c) => c.etapa === "LIGAR").sort(porUrgencia),
    repescados: cartoes.filter((c) => c.etapa === "REPESCADO").sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm)),
    semRetorno: cartoes.filter((c) => c.etapa === "SEM_RETORNO").sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm)),
    registro: [...cartoes].sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm)),
  };
}

/** A isca pronta para colar no WhatsApp. */
export function textoDaIsca(primeiroNome: string, remetente = "Aline") {
  return `Oi, ${primeiroNome}! Aqui é a ${remetente}, do Instituto Bratan 🌿 Faz um tempinho que não te vemos por aqui e lembrei de você. Queria te ligar rapidinho para saber como você está e te contar as novidades — qual o melhor horário para eu te ligar: de manhã, à tarde ou no fim do dia?`;
}
