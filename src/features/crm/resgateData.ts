// RADAR DE RESGATE (20/08/2026, pedido do Lucas): "a retenção de sessenta dias
// — a gente precisa saber quem passou sessenta dias atrás."
//
// A pergunta é respondida com DINHEIRO, não com memória: a última comanda do
// paciente diz quando ele veio pela última vez. Daí o radar separa em faixas
// (as três réguas da casa): 60 dias, 6 meses e 1 ano — e ainda mostra quem está
// CHEGANDO nos 60, para a Aline agir antes de virar resgate.
import type { FinSale } from "@/features/financeiro/financeiroData";
import { type CrmContact, type CrmState } from "./crmData";

export type FaixaDeResgate = "CHEGANDO" | "D60" | "M6" | "A1";

export const faixaLabels: Record<FaixaDeResgate, string> = {
  CHEGANDO: "Chegando aos 60 dias",
  D60: "Resgate 60 dias",
  M6: "Resgate 6 meses",
  A1: "Resgate 1 ano",
};

/** A cadência certa para cada faixa (seeds do catálogo). */
export const cadenciaDaFaixa: Record<Exclude<FaixaDeResgate, "CHEGANDO">, string> = {
  D60: "cad-rescue-60d",
  M6: "cad-rescue-6m",
  A1: "cad-rescue-1y",
};

export type PacienteNoRadar = {
  contact: CrmContact;
  ultimaVisita: string;
  diasSemVir: number;
  faixa: FaixaDeResgate;
};

function diasEntre(deISO: string, ateISO: string) {
  return Math.round((new Date(`${ateISO}T12:00:00`).getTime() - new Date(`${deISO}T12:00:00`).getTime()) / 86_400_000);
}

function faixaDosDias(dias: number): FaixaDeResgate | null {
  if (dias >= 365) return "A1";
  if (dias >= 180) return "M6";
  if (dias >= 60) return "D60";
  if (dias >= 50) return "CHEGANDO";
  return null;
}

/**
 * Quem está sumido e há quanto tempo.
 *
 * Entra no radar quem tem comanda (veio de verdade) e a última faz 50+ dias.
 * Fica FORA quem já está sendo cuidado — negociação aberta, jornada ativa ou
 * cadência ativa — porque o radar existe para achar quem NINGUÉM está olhando,
 * não para duplicar trabalho de quem já tem tarefa.
 */
export function radarDeResgate(state: CrmState, sales: FinSale[], todayISO: string): PacienteNoRadar[] {
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
  for (const enrollment of state.cadenceEnrollments) {
    if (enrollment.status === "ACTIVE") cuidados.add(enrollment.contactId);
  }

  const radar: PacienteNoRadar[] = [];
  for (const contact of state.contacts) {
    if (contact.archivedAt) continue;
    const ultima = ultimaPorContato.get(contact.id);
    if (!ultima) continue;
    if (cuidados.has(contact.id)) continue;
    const dias = diasEntre(ultima, todayISO);
    const faixa = faixaDosDias(dias);
    if (!faixa) continue;
    radar.push({ contact, ultimaVisita: ultima, diasSemVir: dias, faixa });
  }
  // Mais urgente primeiro DENTRO do que é acionável: quem acabou de cruzar os
  // 60 esfriou menos — é onde o resgate mais converte.
  const peso: Record<FaixaDeResgate, number> = { D60: 0, CHEGANDO: 1, M6: 2, A1: 3 };
  return radar.sort((a, b) => peso[a.faixa] - peso[b.faixa] || a.diasSemVir - b.diasSemVir);
}

export function radarPorFaixa(radar: PacienteNoRadar[]) {
  const porFaixa = new Map<FaixaDeResgate, PacienteNoRadar[]>();
  for (const pessoa of radar) {
    const lista = porFaixa.get(pessoa.faixa) ?? [];
    lista.push(pessoa);
    porFaixa.set(pessoa.faixa, lista);
  }
  return porFaixa;
}
