// PRAZO DE CADA FASE DO PLANO (08/09/2026, Lucas: "não entendi por que Acabou de
// aderir, Boas-vindas e Agendamento têm todos — organize isso direito").
// O diagnóstico: 26 pacientes parados em "Boas-vindas (D+1)" desde julho e 8 em
// "Agendamento", porque o gate (marcar as mensagens) nunca foi concluído e o
// cartão não anda sem isso. Cada fase ganha um prazo; passou, o cartão fica
// vermelho, sobe para o topo da coluna e a coordenação pode avançar os
// vencidos de uma vez para "Em acompanhamento".
import type { CrmDeal, CrmProgramPhase } from "./crmData";

/** Dias que um paciente pode ficar na fase antes de ser considerado vencido (null = fase longa, sem prazo). */
export const PRAZO_DA_FASE_DIAS: Record<CrmProgramPhase, number | null> = {
  FECHAMENTO_D0: 1,
  TRES_CONTATOS_D1: 3,
  AGENDAMENTO: 7,
  PRIMEIRO_ATENDIMENTO: 21,
  CADENCIA_PROGRAMA: null,
  ENCERRAMENTO: null,
};

function diasEntre(deISO: string, ateISO: string) {
  const [a1, m1, d1] = deISO.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ateISO.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Há quantos dias o paciente está na fase atual (0 se entrou hoje ou sem data). */
export function diasNaFase(deal: Pick<CrmDeal, "programPhaseEnteredAt" | "updatedAt" | "createdAt">, hoje: string) {
  const desde = deal.programPhaseEnteredAt || deal.updatedAt || deal.createdAt;
  if (!desde) return 0;
  return Math.max(0, diasEntre(desde, hoje));
}

/** Passou do prazo da fase? (fases longas nunca vencem) */
export function faseVencida(deal: Pick<CrmDeal, "programPhase" | "programPhaseEnteredAt" | "updatedAt" | "createdAt">, hoje: string) {
  if (!deal.programPhase) return false;
  const prazo = PRAZO_DA_FASE_DIAS[deal.programPhase];
  if (prazo === null) return false;
  return diasNaFase(deal, hoje) > prazo;
}

/** Vencidos primeiro (o mais parado no topo), depois os no prazo, do mais antigo ao mais novo. */
export function ordenaPorTempoNaFase<T extends Pick<CrmDeal, "programPhase" | "programPhaseEnteredAt" | "updatedAt" | "createdAt">>(deals: T[], hoje: string): T[] {
  return [...deals].sort((a, b) => {
    const va = faseVencida(a, hoje) ? 1 : 0;
    const vb = faseVencida(b, hoje) ? 1 : 0;
    return vb - va || diasNaFase(b, hoje) - diasNaFase(a, hoje);
  });
}
