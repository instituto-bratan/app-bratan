// SLA DE RESPOSTA AO LEAD (14/09/2026, proposta 3.9 do estudo de evolução).
//
// Responder em menos de 1 hora qualifica um lead cerca de 7 vezes mais do que
// responder depois, e 60 vezes mais do que em 24 horas (Oldroyd, McElheran e
// Elkington, HBR 2011). A meta da casa é 5 minutos. Este motor mede, para cada
// negociação que nasceu como lead, quanto tempo levou até o PRIMEIRO toque
// (tarefa concluída ou evento de mensagem/ligação na linha do tempo depois da
// entrada) e devolve: quem ainda está sem resposta, o % dentro do SLA no
// período e a frase para o coordenador. Tudo derivado; nada é digitado.
import type { CrmState, CrmTask, CrmTimelineEvent } from "./crmData";

const ESTAGIOS_DE_LEAD = new Set(["LEAD_NOVO", "CONTATADO", "QUALIFICADO", "LEAD_FRIO"]);
const EVENTOS_DE_TOQUE = new Set(["WHATSAPP", "CALL", "EMAIL", "MESSAGE_SENT", "TASK_DONE", "TOUCHPOINT", "CONTACT", "NOTE"]);

export type LeadSla = {
  dealId: string;
  contactId: string;
  nome: string;
  entrouEm: string;
  /** Primeiro toque registrado depois da entrada (ISO), ou null se ainda não houve. */
  primeiroToqueEm: string | null;
  /** Minutos até o primeiro toque; se não houve, minutos desde a entrada até agora. */
  minutos: number;
  dentroDoSla: boolean;
  semResposta: boolean;
  origem: string;
};

export type ResumoSla = {
  limiteMinutos: number;
  desde: string;
  leads: LeadSla[];
  semResposta: LeadSla[];
  total: number;
  dentro: number;
  percentualDentro: number;
  /** Mediana dos minutos até o primeiro toque (só os respondidos). */
  medianaMinutos: number | null;
  frase: string;
};

function minutosEntre(deISO: string, ateISO: string) {
  return Math.max(0, Math.round((new Date(ateISO).getTime() - new Date(deISO).getTime()) / 60_000));
}

function primeiroToque(contactId: string, dealId: string, entrouEm: string, tasks: CrmTask[], eventos: CrmTimelineEvent[]) {
  const candidatos: string[] = [];
  for (const task of tasks) {
    if (task.contactId !== contactId) continue;
    if (task.status !== "DONE" || !task.completedAt) continue;
    if (task.dealId && task.dealId !== dealId) continue;
    if (task.completedAt >= entrouEm) candidatos.push(task.completedAt);
  }
  for (const evento of eventos) {
    if (evento.contactId !== contactId || !evento.createdAt || evento.createdAt < entrouEm) continue;
    const tipo = (evento.eventType || "").toUpperCase();
    if (EVENTOS_DE_TOQUE.has(tipo) || /toque|mensagem|whatsapp|liga|contato/i.test(`${evento.eventType} ${evento.eventTitle}`)) candidatos.push(evento.createdAt);
  }
  return candidatos.sort()[0] ?? null;
}

/**
 * Mede o SLA dos leads que entraram a partir de `desde` (ISO) — e de qualquer
 * lead ainda sem resposta, mesmo mais antigo, porque esse continua sendo um
 * problema de hoje.
 */
export function buildResumoSla(state: CrmState, agoraISO: string, limiteMinutos = 5, desdeISO?: string): ResumoSla {
  const desde = desdeISO ?? new Date(new Date(agoraISO).getTime() - 30 * 86_400_000).toISOString();
  const contatos = new Map(state.contacts.map((c) => [c.id, c]));
  const leads: LeadSla[] = [];
  for (const deal of state.deals) {
    if (!ESTAGIOS_DE_LEAD.has(deal.stage) && deal.createdAt < desde) continue;
    if (deal.createdAt < desde && !ESTAGIOS_DE_LEAD.has(deal.stage)) continue;
    const contato = contatos.get(deal.contactId);
    if (!contato || contato.archivedAt) continue;
    const entrouEm = deal.createdAt;
    if (!entrouEm) continue;
    const toque = primeiroToque(deal.contactId, deal.id, entrouEm, state.tasks, state.timelineEvents);
    const minutos = minutosEntre(entrouEm, toque ?? agoraISO);
    const fechadoOuMovido = !ESTAGIOS_DE_LEAD.has(deal.stage) || deal.stage === "LEAD_FRIO";
    // Lead frio (LinkedIn, parado de propósito) e negociação que já andou de etapa não contam como "sem resposta".
    const semResposta = !toque && !fechadoOuMovido;
    const dentroDoSla = Boolean(toque) && minutos <= limiteMinutos;
    if (deal.createdAt < desde && !semResposta) continue;
    leads.push({
      dealId: deal.id,
      contactId: deal.contactId,
      nome: contato.fullName || contato.preferredName || "Contato",
      entrouEm,
      primeiroToqueEm: toque,
      minutos,
      dentroDoSla,
      semResposta,
      origem: deal.sourceChannel || contato.sourceChannel || "",
    });
  }
  const noPeriodo = leads.filter((l) => l.entrouEm >= desde && (l.primeiroToqueEm || l.semResposta));
  const total = noPeriodo.length;
  const dentro = noPeriodo.filter((l) => l.dentroDoSla).length;
  const respondidos = noPeriodo.filter((l) => l.primeiroToqueEm).map((l) => l.minutos).sort((a, b) => a - b);
  const mediana = respondidos.length ? respondidos[Math.floor(respondidos.length / 2)] : null;
  const semResposta = leads.filter((l) => l.semResposta).sort((a, b) => a.entrouEm.localeCompare(b.entrouEm));
  const percentualDentro = total ? Math.round((dentro / total) * 100) : 0;
  const frase = total
    ? `${dentro} de ${total} leads dos últimos 30 dias receberam o primeiro toque em até ${limiteMinutos} min (${percentualDentro}%)${mediana !== null ? ` · tempo típico ${formatMinutos(mediana)}` : ""}${semResposta.length ? ` · ${semResposta.length} ainda sem resposta` : ""}.`
    : semResposta.length
      ? `${semResposta.length} lead${semResposta.length > 1 ? "s" : ""} sem nenhum toque registrado.`
      : "Nenhum lead novo nos últimos 30 dias.";
  return { limiteMinutos, desde, leads, semResposta, total, dentro, percentualDentro, medianaMinutos: mediana, frase };
}

export function formatMinutos(minutos: number) {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 60 * 24) return `${Math.floor(minutos / 60)} h ${minutos % 60 ? `${minutos % 60} min` : ""}`.trim();
  return `${Math.floor(minutos / 1440)} d ${Math.floor((minutos % 1440) / 60)} h`;
}

/** Situação de um único negócio para o cartão do Kanban. */
export function slaDoNegocio(resumo: ResumoSla, dealId: string): LeadSla | null {
  return resumo.leads.find((l) => l.dealId === dealId) ?? null;
}
