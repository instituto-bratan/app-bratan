// RISCO DE FALTA E DE ABANDONO (14/09/2026, propostas 5.4 e 3.3 do estudo).
//
// Dois motores puros, com testes. Enquanto não há 12 meses de dados para um
// modelo estatístico, valem regras simples e explicáveis — cada ponto vem com a
// frase do motivo, para a pessoa saber POR QUE o paciente está amarelo ou
// vermelho. Quando o modelo chegar, as telas não mudam: só a função.
import type { CrmDeal, CrmState, CrmTask } from "./crmData";

export type NivelRisco = "VERDE" | "AMARELO" | "VERMELHO";

export type Risco = {
  nivel: NivelRisco;
  pontos: number;
  motivos: string[];
  /** Uma frase, pronta para o cartão. */
  frase: string;
};

const FECHADAS = new Set(["DONE", "CANCELED", "SKIPPED"]);

function diasEntre(deISO: string, ateISO: string) {
  const [a1, m1, d1] = deISO.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ateISO.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

function nivelDosPontos(pontos: number): NivelRisco {
  if (pontos >= 4) return "VERMELHO";
  if (pontos >= 2) return "AMARELO";
  return "VERDE";
}

// ---- Abandono do plano ---------------------------------------------------------
export type EntradaAbandono = {
  deal: Pick<CrmDeal, "id" | "contactId" | "programPhase" | "programPhaseEnteredAt" | "closedAt" | "createdAt" | "programMilestonesDone">;
  tasks: Pick<CrmTask, "contactId" | "dealId" | "status" | "result" | "dueAt" | "completedAt" | "taskType">[];
  /** Datas (ISO) das comandas/atendimentos do paciente — a última é "a última dose/visita". undefined = a tela não sabe (regra pulada). */
  visitas?: string[];
  /** Data da próxima consulta/retorno agendado, se houver (ISO). */
  proximoRetorno?: string | null;
  /** Último dia em que o paciente mandou a pesagem (ISO), se o app souber. */
  ultimaPesagem?: string | null;
  hoje: string;
};

export function riscoDeAbandono(entrada: EntradaAbandono): Risco {
  const { deal, hoje } = entrada;
  const motivos: string[] = [];
  let pontos = 0;
  const inicio = (deal.programPhaseEnteredAt || deal.closedAt || deal.createdAt || hoje).slice(0, 10);
  const diasNoPlano = Math.max(0, diasEntre(inicio, hoje));
  const doPaciente = entrada.tasks.filter((t) => t.contactId === deal.contactId);

  // 1) Resposta ao último toque: a última tarefa concluída com "sem resposta".
  const concluidas = doPaciente.filter((t) => t.status === "DONE" && t.completedAt).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const ultima = concluidas[0];
  if (ultima && ultima.result === "NO_RESPONSE") {
    pontos += 2;
    motivos.push("não respondeu ao último toque");
  }
  const semResposta = concluidas.slice(0, 3).filter((t) => t.result === "NO_RESPONSE").length;
  if (semResposta >= 2) {
    pontos += 1;
    motivos.push(`${semResposta} dos últimos 3 toques sem resposta`);
  }

  // 2) Toque da régua atrasado há mais de 3 dias (a equipe não chegou nele).
  const atrasadas = doPaciente.filter((t) => !FECHADAS.has(t.status) && t.dueAt && diasEntre(t.dueAt, hoje) > 3);
  if (atrasadas.length) {
    pontos += 1;
    motivos.push(`${atrasadas.length} toque${atrasadas.length > 1 ? "s" : ""} da régua atrasado${atrasadas.length > 1 ? "s" : ""}`);
  }

  // 3) Retorno não agendado depois do 1º mês.
  if (diasNoPlano >= 30 && !entrada.proximoRetorno) {
    pontos += 2;
    motivos.push("sem retorno agendado");
  }

  // 4) Dias desde a última visita/dose (comanda): > 45 dias é sinal forte.
  const visitas = entrada.visitas ? [...entrada.visitas].filter(Boolean).sort() : null;
  const ultimaVisita = visitas ? visitas[visitas.length - 1] : undefined;
  if (visitas === null) {
    /* a tela não trouxe as comandas: não julga por visita */
  } else if (ultimaVisita) {
    const dias = diasEntre(ultimaVisita, hoje);
    if (dias > 45) {
      pontos += 2;
      motivos.push(`${dias} dias desde a última visita`);
    } else if (dias > 30) {
      pontos += 1;
      motivos.push(`${dias} dias desde a última visita`);
    }
  } else if (diasNoPlano >= 21) {
    pontos += 1;
    motivos.push("nenhuma visita registrada desde a adesão");
  }

  // 5) Pesagem semanal (quando o app souber): mais de 14 dias sem enviar.
  if (entrada.ultimaPesagem !== undefined && entrada.ultimaPesagem !== null && diasEntre(entrada.ultimaPesagem, hoje) > 14) {
    pontos += 1;
    motivos.push("sem pesagem há mais de 2 semanas");
  }

  const nivel = nivelDosPontos(pontos);
  const frase = nivel === "VERDE" ? "Em dia: respondeu, veio e tem retorno marcado." : `${nivel === "VERMELHO" ? "Risco alto de abandono" : "Atenção"}: ${motivos.join(", ")}.`;
  return { nivel, pontos, motivos, frase };
}

/** Atalho para as telas: monta a entrada a partir do estado do CRM e das comandas. */
export function riscoDoPaciente(state: Pick<CrmState, "tasks">, deal: EntradaAbandono["deal"], visitas: string[] | undefined, hoje: string, proximoRetorno?: string | null): Risco {
  return riscoDeAbandono({ deal, tasks: state.tasks, visitas, hoje, proximoRetorno: proximoRetorno ?? null });
}

// ---- Falta na consulta ----------------------------------------------------------
export type EntradaFalta = {
  /** Dia e hora da consulta (ISO). */
  consultaEm: string;
  /** Quando foi marcada (ISO), se souber. */
  marcadaEm?: string | null;
  primeiraConsulta: boolean;
  /** O paciente confirmou (respondeu ao toque de 48 h)? */
  confirmou: boolean;
  /** Quantas vezes já faltou antes. */
  faltasAnteriores: number;
  agora: string;
};

export function riscoDeFalta(entrada: EntradaFalta): Risco {
  const motivos: string[] = [];
  let pontos = 0;
  if (entrada.faltasAnteriores > 0) {
    pontos += 2;
    motivos.push(`já faltou ${entrada.faltasAnteriores} vez${entrada.faltasAnteriores > 1 ? "es" : ""}`);
  }
  if (entrada.marcadaEm && diasEntre(entrada.marcadaEm, entrada.consultaEm) > 14) {
    pontos += 1;
    motivos.push("marcada com mais de 14 dias de antecedência");
  }
  if (entrada.primeiraConsulta) {
    pontos += 1;
    motivos.push("primeira consulta");
  }
  const horasAte = (new Date(entrada.consultaEm).getTime() - new Date(entrada.agora).getTime()) / 3_600_000;
  if (!entrada.confirmou && horasAte <= 48) {
    pontos += 2;
    motivos.push("não confirmou nas últimas 48 h");
  }
  const nivel = nivelDosPontos(pontos);
  const frase = nivel === "VERDE" ? "Baixo risco de falta." : `${nivel === "VERMELHO" ? "Alto risco de falta — ligar hoje" : "Vale um toque a mais"}: ${motivos.join(", ")}.`;
  return { nivel, pontos, motivos, frase };
}

/** Ordena consultas para a recepção ligar primeiro em quem tem mais risco. */
export function ordenarPorRisco<T extends { risco: Risco }>(itens: T[]) {
  return [...itens].sort((a, b) => b.risco.pontos - a.risco.pontos);
}
