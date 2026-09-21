// PORTAL DO PACIENTE — o motor (15/09/2026, proposta 3.7 do estudo).
//
// Tudo que o portal mostra é derivado do que a equipe já registra: o plano
// fechado no Kanban, os marcos do acompanhamento, as comandas, as parcelas, as
// medições da enfermagem e a consulta marcada. Este módulo é puro (testável
// com node --test): recebe os dados que a função portal-paciente devolve e
// escreve as frases. Regra da casa: número derivado sempre com a frase que o
// explica; nada de jargão para o paciente.

export type PortalConsulta = {
  id: string;
  em: string; // ISO com hora
  profissional: string;
  tipo: string;
  local: string;
  status: "AGENDADA" | "CONFIRMADA" | "REMARCAR" | "REALIZADA" | "CANCELADA" | "AGUARDANDO";
  origem: "AGENDA" | "MANUAL";
};

import type { PortalFoto } from "./fotosDoPaciente";
export type { PortalFoto };

export type PortalMedicao = {
  id: string;
  dia: string; // ISO data
  pesoKg: number | null;
  gorduraPct: number | null;
  massaMagraKg: number | null;
  cinturaCm: number | null;
  /** Os quatro do InBody que passaram a ser guardados em 21/09/2026. Só o exame do aparelho tem. */
  inbodyScore?: number | null;
  gorduraVisceral?: number | null;
  massaMuscularKg?: number | null;
  tmbKcal?: number | null;
  origem: "ENFERMAGEM" | "PACIENTE" | "IMPORTACAO";
};

/** Faixa normal do nível de gordura visceral segundo o próprio InBody: 1 a 9. */
export const VISCERAL_LIMITE_NORMAL = 9;

export type ResumoInBody = {
  ultima: PortalMedicao;
  /** Primeira medição com Score — para o "desde quando". Igual à última quando só há uma. */
  primeira: PortalMedicao;
  score: number;
  deltaScore: number | null;
  visceral: number | null;
  visceralAcimaDoNormal: boolean;
  musculoKg: number | null;
  deltaMusculo: number | null;
  tmbKcal: number | null;
  /** Uma frase só — o significado, não o dado (regra da Oura que o Lucas comprou). */
  frase: string;
  /**
   * A versão curta, para o topo da tela. Visto na prévia (21/09): a frase do
   * dia repetia, palavra por palavra, a frase do card logo abaixo. Manchete em
   * cima, frase completa no card.
   */
  manchete: string;
};

/**
 * O "número único" do portal: o InBody Score, com o que mudou desde o começo.
 *
 * É o equivalente honesto da "idade metabólica" que o Lucas pediu — o InBody 120
 * da clínica NÃO exporta idade metabólica, e inventar uma seria exatamente o
 * tipo de número que depois vira story e não se sustenta. O Score é do aparelho.
 */
export function resumoInBody(medicoes: PortalMedicao[], desdeISO?: string): ResumoInBody | null {
  const noRecorte = desdeISO ? medicoes.filter((m) => m.dia >= desdeISO.slice(0, 10)) : medicoes;
  const comScore = noRecorte.filter((m) => typeof m.inbodyScore === "number" && m.inbodyScore > 0).sort((a, b) => a.dia.localeCompare(b.dia));
  if (!comScore.length) return null;
  const primeira = comScore[0];
  const ultima = comScore[comScore.length - 1];
  const score = ultima.inbodyScore as number;
  const deltaScore = comScore.length > 1 ? Math.round(score - (primeira.inbodyScore as number)) : null;
  const visceral = ultima.gorduraVisceral ?? null;
  const musculoKg = ultima.massaMuscularKg ?? null;
  const deltaMusculo =
    comScore.length > 1 && typeof primeira.massaMuscularKg === "number" && typeof musculoKg === "number" ? round1(musculoKg - primeira.massaMuscularKg) : null;
  const visceralAcimaDoNormal = typeof visceral === "number" && visceral > VISCERAL_LIMITE_NORMAL;

  let manchete: string;
  if (deltaScore === null) manchete = `Seu primeiro InBody Score chegou: ${score} de 100.`;
  else if (deltaScore >= 2) manchete = `Novo exame: seu Score subiu ${deltaScore} pontos desde ${diaMes(primeira.dia)}.`;
  else if (deltaScore <= -2) manchete = `Novo exame: seu Score caiu ${Math.abs(deltaScore)} pontos desde ${diaMes(primeira.dia)}.`;
  else manchete = `Novo exame: seu Score continua em ${score} de 100.`;

  let frase: string;
  if (deltaScore === null) frase = `Seu primeiro InBody Score é ${score} de 100. O próximo exame mostra a direção.`;
  else if (deltaScore >= 2) frase = `Seu Score subiu ${deltaScore} pontos desde ${diaMes(primeira.dia)}${deltaMusculo !== null && deltaMusculo >= 0.3 ? `, com ${deltaMusculo.toLocaleString("pt-BR")} kg a mais de músculo` : ""}.`;
  else if (deltaScore <= -2) frase = `Seu Score caiu ${Math.abs(deltaScore)} pontos desde ${diaMes(primeira.dia)}. A enfermagem olha isso com você no próximo toque.`;
  else frase = `Seu Score está estável desde ${diaMes(primeira.dia)}.`;
  if (visceralAcimaDoNormal) frase += ` A gordura visceral está no nível ${visceral} — a faixa ideal do aparelho vai até ${VISCERAL_LIMITE_NORMAL}.`;

  return { ultima, primeira, score, deltaScore, visceral, visceralAcimaDoNormal, musculoKg, deltaMusculo, tmbKcal: ultima.tmbKcal ?? null, frase, manchete };
}

export type PortalComanda = {
  id: string;
  dia: string;
  itens: { descricao: string; tipo: string; valor: number }[];
  pagamentos: { metodo: string; valor: number; parcelas: number }[];
  total: number;
};

export type PortalParcela = { id: string; valor: number; prevista: string; observacao: string };

export type PortalDocumento = { tipo: "CONTRATO" | "NOTA_FISCAL" | "NFSE"; titulo: string; url: string | null; numero: string | null; dia: string };

export type PortalPlano = {
  dealId: string;
  canal: string | null;
  inicio: string; // ISO data da adesão
  fase: string | null;
  marcosFeitos: string[];
  valorContratado: number;
  valorRecebido: number;
  closedAt: string | null;
  programPhaseEnteredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalDados = {
  /** Chave pública VAPID, para o navegador assinar os avisos. Ausente = avisos desligados. */
  pushPublicKey?: string | null;
  paciente: { nome: string; primeiroNome: string; contactRef: string; temSenha?: boolean; login?: string | null };
  plano: PortalPlano | null;
  consultas: PortalConsulta[];
  medicoes: PortalMedicao[];
  comandas: PortalComanda[];
  parcelasAbertas: PortalParcela[];
  documentos: PortalDocumento[];
  consentimentos: { tipo: string; aceito: boolean; em: string }[];
  /** Fotos de evolução (21/09/2026). URLs assinadas de 1 h. Só o paciente vê. */
  fotos?: PortalFoto[];
  geradoEm: string;
};

/** O que o portal precisa saber de um marco (subconjunto do ProgramMilestone do app). */
export type MarcoDoPlano = { key: string; type: "CHECK" | "BIO" | "MEDICO"; n: number; total: number; label: string; expectedDate: string; done: boolean; overdue: boolean };

const round1 = (n: number) => Math.round(n * 10) / 10;
const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function brl(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor || 0);
}
export function brlCentavos(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor || 0);
}

function dataLocal(iso: string) {
  // Aceita "AAAA-MM-DD" ou ISO com hora; sem hora, meio-dia local para não escorregar de dia.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(a, m - 1, d, 12, 0, 0);
  }
  return new Date(iso);
}

export function diaLongo(iso: string) {
  const d = dataLocal(iso);
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}
export function diaCurto(iso: string) {
  const d = dataLocal(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function diaMes(iso: string) {
  const d = dataLocal(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()].slice(0, 3)}`;
}
export function horaCurta(iso: string) {
  const d = dataLocal(iso);
  return `${String(d.getHours()).padStart(2, "0")}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""}`;
}

export function diasEntre(deISO: string, ateISO: string) {
  const a = dataLocal(deISO);
  const b = dataLocal(ateISO);
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** "é hoje", "é amanhã", "daqui a 5 dias", "daqui a 3 semanas", "daqui a 2 meses". */
export function fraseDeDias(dias: number) {
  if (dias < 0) return dias === -1 ? "foi ontem" : `foi há ${-dias} dias`;
  if (dias === 0) return "é hoje";
  if (dias === 1) return "é amanhã";
  if (dias < 14) return `daqui a ${dias} dias`;
  if (dias < 60) {
    const semanas = Math.round(dias / 7);
    return `daqui a ${semanas} semana${semanas > 1 ? "s" : ""}`;
  }
  let meses = Math.floor(dias / 30);
  const resto = dias - meses * 30;
  if (resto >= 20) meses += 1;
  const meio = resto >= 10 && resto < 20 ? " e meio" : "";
  return `daqui a ${meses} ${meses > 1 ? "meses" : "mês"}${meio}`;
}

export type ProximaConsulta = {
  id: string | null;
  em: string;
  comHora: boolean;
  profissional: string;
  tipo: string;
  local: string;
  origem: "AGENDA" | "MANUAL" | "PREVISTA";
  status: PortalConsulta["status"] | "PREVISTA";
  dias: number;
  quando: string; // "daqui a 12 dias"
  titulo: string; // "quinta-feira, 26 de setembro"
  hora: string | null;
  podeResponder: boolean;
};

/**
 * A próxima consulta MARCADA — só isso.
 *
 * Até 16/09/2026, quando não havia consulta marcada o app mostrava a data
 * PREVISTA pelo plano no lugar, com letra grande de bilhete. A Gabriela abriu o
 * portal e leu "próxima consulta: 19 de fevereiro" de uma consulta que ninguém
 * tinha marcado. Pedido do Lucas: *"quando não tem é só falar que ainda não foi
 * marcado"*. A data prevista continua onde ela é verdade — na trilha do plano,
 * rotulada como prevista.
 *
 * `marcos` fica na assinatura porque a ordem de confiança pode voltar a crescer
 * (agenda oficial, encaixe), e a tela chama sempre do mesmo jeito.
 */
export function proximaConsulta(consultas: PortalConsulta[], _marcos: MarcoDoPlano[], hojeISO: string): ProximaConsulta | null {
  const inicioHoje = dataLocal(hojeISO);
  inicioHoje.setHours(0, 0, 0, 0);
  const reais = consultas
    .filter((c) => c.status !== "CANCELADA" && c.status !== "REALIZADA" && new Date(c.em).getTime() >= inicioHoje.getTime())
    .sort((a, b) => a.em.localeCompare(b.em));
  const real = reais[0];
  if (real) {
    const dias = diasEntre(hojeISO, real.em.slice(0, 10));
    return { id: real.id, em: real.em, comHora: true, profissional: real.profissional, tipo: real.tipo, local: real.local, origem: real.origem, status: real.status, dias, quando: fraseDeDias(dias), titulo: diaLongo(real.em), hora: horaCurta(real.em), podeResponder: real.status !== "CONFIRMADA" && real.status !== "REMARCAR" && dias <= 14 };
  }
  return null;
}

/** Quantas medições existem ANTES do plano começar — é o que o botão oferece. */
export function medicoesAntesDoPlano(medicoes: PortalMedicao[], inicioISO: string | null | undefined) {
  if (!inicioISO) return 0;
  const corte = inicioISO.slice(0, 10);
  return medicoes.filter((m) => m.pesoKg !== null && m.pesoKg > 0 && m.dia < corte).length;
}

/**
 * A curva de gordura só vale a pena quando há pelo menos duas medições com o
 * percentual — uma linha de um ponto não é curva, é um ponto.
 */
export function temCurvaDeGordura(resumo: ResumoEvolucao | null) {
  return (resumo?.pontos.filter((ponto) => ponto.gordura !== null).length ?? 0) >= 2;
}

export type ResumoEvolucao = {
  primeira: PortalMedicao;
  ultima: PortalMedicao;
  semanas: number;
  deltaPeso: number | null;
  deltaGordura: number | null;
  deltaMassaMagra: number | null;
  deltaCintura: number | null;
  pontos: { dia: string; peso: number; gordura: number | null; origem: PortalMedicao["origem"] }[];
  frase: string;
};

/**
 * A curva: começo × hoje, com a frase que dá contexto (o primeiro mês é adaptação).
 *
 * `desdeISO` recorta o que entra. Decisão do Lucas (17/09/2026): **de cara, a
 * curva mostra o plano** — do fechamento para frente. O paciente que quiser vê
 * a vida toda com um toque.
 *
 * Por que o recorte é o padrão: a importação da InBody trouxe anos de exames.
 * Sem recorte, alguém que fechou o plano há um mês lia "acompanhando há 166
 * semanas" e "desde junho de 2023 você já perdeu...", misturando a vida inteira
 * com o que o plano entregou.
 */
export function resumoEvolucao(medicoes: PortalMedicao[], hojeISO: string, desdeISO?: string): ResumoEvolucao | null {
  const noRecorte = desdeISO ? medicoes.filter((m) => m.dia >= desdeISO.slice(0, 10)) : medicoes;
  const comPeso = noRecorte.filter((m) => m.pesoKg !== null && m.pesoKg > 0).sort((a, b) => a.dia.localeCompare(b.dia));
  if (!comPeso.length) return null;
  const primeira = comPeso[0];
  const ultima = comPeso[comPeso.length - 1];
  const semanas = Math.max(0, Math.round(diasEntre(primeira.dia, ultima.dia) / 7));
  const delta = (a: number | null, b: number | null) => (a !== null && b !== null ? round1(b - a) : null);
  const deltaPeso = delta(primeira.pesoKg, ultima.pesoKg);
  const deltaGordura = delta(primeira.gorduraPct, ultima.gorduraPct);
  const deltaMassaMagra = delta(primeira.massaMagraKg, ultima.massaMagraKg);
  const deltaCintura = delta(primeira.cinturaCm, ultima.cinturaCm);
  const diasDesdeInicio = diasEntre(primeira.dia, hojeISO);
  let frase: string;
  if (comPeso.length === 1) frase = `Sua primeira medição foi em ${diaMes(primeira.dia)}. A próxima mostra a direção.`;
  else if (deltaPeso !== null && deltaPeso <= -0.5) {
    frase = `Desde ${diaMes(primeira.dia)} você já perdeu ${Math.abs(deltaPeso).toLocaleString("pt-BR")} kg`;
    if (deltaMassaMagra !== null && deltaMassaMagra >= 0) frase += ", mantendo a massa magra";
    else if (deltaGordura !== null && deltaGordura < 0) frase += `, com ${Math.abs(deltaGordura).toLocaleString("pt-BR")} pontos a menos de gordura`;
    frase += ".";
  } else if (deltaPeso !== null && Math.abs(deltaPeso) < 0.5) {
    frase = diasDesdeInicio <= 45 ? "O primeiro mês é de adaptação: o corpo está se ajustando e o peso costuma mexer pouco. O resultado forte vem nos meses 2 e 3." : "O peso está estável nas últimas medições. Vale conversar com a enfermagem no próximo toque.";
  } else {
    frase = diasDesdeInicio <= 45 ? "Oscilar no começo é normal. A tendência aparece depois de três ou quatro medições." : "O peso subiu um pouco desde o início. A enfermagem vai olhar isso com você no próximo contato.";
  }
  return { primeira, ultima, semanas, deltaPeso, deltaGordura, deltaMassaMagra, deltaCintura, pontos: comPeso.map((m) => ({ dia: m.dia, peso: m.pesoKg as number, gordura: m.gorduraPct, origem: m.origem })), frase };
}

// ---------------------------------------------------------------------------
// O QUE A BALANÇA NÃO MOSTRA (21/09/2026) — passo 2 do portal
// ---------------------------------------------------------------------------

export type BalancaNaoMostra = {
  /**
   * MENTIU: o peso não caiu (ou subiu) e mesmo assim a composição melhorou —
   *   15 pacientes da clínica viveram isso e nunca souberam.
   * IDEAL: perdeu peso e NÃO perdeu músculo — é o que só 20% conseguem.
   * ESCONDEU: perdeu peso, mas parte do que saiu era músculo. Dito com cuidado
   *   e mandando para a enfermagem — é ela quem ajusta.
   */
  tipo: "MENTIU" | "IDEAL" | "ESCONDEU";
  titulo: string;
  /** O número grande do card. */
  destaque: string;
  frase: string;
};

/**
 * O card que a curva de peso não consegue contar.
 *
 * Nas 1.014 medições da clínica, 19,4% de todo o peso perdido era músculo, e
 * 15 pessoas viram a balança subir tendo ganhado massa magra. Esse é o dado
 * que a balança esconde — e é exatamente o que o Instituto mede e os outros
 * não. Sem gordura ou massa magra nas duas pontas, não há o que dizer.
 */
export function oQueABalancaNaoMostra(evolucao: ResumoEvolucao | null): BalancaNaoMostra | null {
  if (!evolucao || evolucao.pontos.length < 2 || evolucao.deltaPeso === null) return null;
  const { deltaPeso, deltaGordura, deltaMassaMagra } = evolucao;
  const desde = diaMes(evolucao.primeira.dia);
  const kg = (n: number) => `${Math.abs(n).toLocaleString("pt-BR")} kg`;
  const pts = (n: number) => `${Math.abs(n).toLocaleString("pt-BR")} ${Math.abs(n) === 1 ? "ponto" : "pontos"}`;

  // A balança não caiu — mas a composição melhorou.
  if (deltaPeso >= -0.4 && ((deltaMassaMagra !== null && deltaMassaMagra >= 0.5) || (deltaGordura !== null && deltaGordura <= -1))) {
    const ganhouMusculo = deltaMassaMagra !== null && deltaMassaMagra >= 0.5;
    const balanca = deltaPeso > 0.4 ? `A balança subiu ${kg(deltaPeso)} desde ${desde}` : `A balança quase não mexeu desde ${desde}`;
    const composicao = [
      ganhouMusculo ? `você ganhou ${kg(deltaMassaMagra as number)} de massa magra` : "",
      deltaGordura !== null && deltaGordura <= -1 ? `perdeu ${pts(deltaGordura)} de gordura` : "",
    ].filter(Boolean);
    return {
      tipo: "MENTIU",
      titulo: "A balança não contou tudo",
      destaque: ganhouMusculo ? `+${kg(deltaMassaMagra as number)} de músculo` : `−${pts(deltaGordura as number)} de gordura`,
      frase: `${balanca} — mas ${composicao.join(" e ")}. Músculo pesa: é por isso que aqui se mede composição, não só peso.`,
    };
  }

  // Perdeu peso de verdade.
  if (deltaPeso <= -1 && deltaMassaMagra !== null) {
    if (deltaMassaMagra >= 0) {
      return {
        tipo: "IDEAL",
        titulo: "Só saiu gordura",
        destaque: `−${kg(deltaPeso)}`,
        frase: `Você perdeu ${kg(deltaPeso)} desde ${desde} e a massa magra ${deltaMassaMagra >= 0.5 ? `subiu ${kg(deltaMassaMagra)}` : "ficou onde estava"}. Perder peso sem perder músculo é o que a maioria não consegue.`,
      };
    }
    if (deltaMassaMagra <= -0.5) {
      const parte = Math.round((Math.abs(deltaMassaMagra) / Math.abs(deltaPeso)) * 100);
      return {
        tipo: "ESCONDEU",
        titulo: "O que a balança não mostra",
        destaque: `${kg(deltaMassaMagra)} de massa magra`,
        frase: `Dos ${kg(deltaPeso)} que saíram desde ${desde}, ${kg(deltaMassaMagra)} eram massa magra${parte >= 10 ? ` — cerca de ${parte}%` : ""}. A enfermagem vai olhar isso com você no próximo toque: é ajuste de proteína e treino, não motivo para parar.`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// A FRASE DO DIA (21/09/2026) — uma coisa só no topo
// ---------------------------------------------------------------------------

/**
 * O que vai embaixo do "Boa tarde, Mariana": UMA frase, a mais importante hoje.
 *
 * Regra da Oura que o Lucas comprou: "as pessoas não querem o dado, querem o
 * significado". A ordem é a da novidade — exame novo fala primeiro, consulta
 * em cima da hora vem depois, e o passo do plano é o pano de fundo.
 */
export function fraseDoDia(entrada: {
  hojeISO: string;
  inbody: ResumoInBody | null;
  evolucao: ResumoEvolucao | null;
  proxima: ProximaConsulta | null;
  trilha: { frase: string } | null;
}): string {
  const { hojeISO, inbody, evolucao, proxima, trilha } = entrada;
  if (inbody && diasEntre(inbody.ultima.dia, hojeISO) <= 10) return inbody.manchete;
  if (evolucao && evolucao.pontos.length > 1 && diasEntre(evolucao.ultima.dia, hojeISO) <= 7) return evolucao.frase;
  if (proxima && proxima.dias <= 2) {
    const quando = proxima.dias === 0 ? "hoje" : proxima.dias === 1 ? "amanhã" : proxima.quando;
    return `Sua consulta com ${proxima.profissional} é ${quando}, às ${proxima.hora}.`;
  }
  if (trilha) return trilha.frase;
  if (evolucao) return evolucao.frase;
  return "Aqui está o seu espaço no Instituto.";
}

export type ResumoFinanceiro = {
  contratado: number;
  pago: number;
  emAberto: number;
  parcelas: PortalParcela[];
  proximaParcela: PortalParcela | null;
  frase: string;
};

/** O que foi fechado, o que já entrou e o que falta, sem juridiquês. */
export function resumoFinanceiro(comandas: PortalComanda[], parcelasAbertas: PortalParcela[], hojeISO: string): ResumoFinanceiro {
  const contratado = Math.round(comandas.reduce((s, c) => s + c.total, 0) * 100) / 100;
  const pago = Math.round(comandas.reduce((s, c) => s + c.pagamentos.reduce((p, x) => p + x.valor, 0), 0) * 100) / 100;
  const parcelas = [...parcelasAbertas].sort((a, b) => a.prevista.localeCompare(b.prevista));
  const emAberto = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100;
  const proximaParcela = parcelas.find((p) => p.prevista >= hojeISO) ?? parcelas[0] ?? null;
  let frase: string;
  if (!comandas.length) frase = "Ainda não há lançamentos no seu nome.";
  else if (emAberto <= 0.005) frase = `Tudo em dia: ${brl(pago)} pagos${comandas.length > 1 ? ` em ${comandas.length} lançamentos` : ""}.`;
  else if (proximaParcela) {
    const dias = diasEntre(hojeISO, proximaParcela.prevista);
    frase = `${brl(pago)} já pagos · falta ${brl(emAberto)}${parcelas.length > 1 ? ` em ${parcelas.length} parcelas` : ""} · a próxima ${dias < 0 ? "estava prevista para" : "vence em"} ${diaCurto(proximaParcela.prevista)}.`;
  } else frase = `${brl(pago)} já pagos · falta ${brl(emAberto)}.`;
  return { contratado, pago, emAberto, parcelas, proximaParcela, frase };
}

export type PassoDaTrilha = {
  mes: number; // 1..6
  rotulo: string; // "Mês 1"
  estado: "feito" | "agora" | "futuro";
  marcos: (MarcoDoPlano & { quem: string })[];
};

const QUEM: Record<MarcoDoPlano["type"], string> = { CHECK: "enfermagem", BIO: "enfermagem", MEDICO: "Dr. Daniel" };

/** A trilha dos seis meses, agrupada por mês, com o mês atual em destaque. */
/**
 * Em que mês do plano cai uma data prevista.
 *
 * Conta MÊS DE CALENDÁRIO, não bloco de 30 dias: o marco do "mês 2" é o que
 * cai dois meses depois da adesão, e dois meses podem ter 61 dias — com blocos
 * de 30 ele escorregava para o mês 3.
 */
function mesDaData(inicioISO: string, dataISO: string) {
  const [ai, mi, di] = inicioISO.slice(0, 10).split("-").map(Number);
  const [ad, md, dd] = dataISO.slice(0, 10).split("-").map(Number);
  let meses = (ad - ai) * 12 + (md - mi);
  if (dd < di) meses -= 1;
  return Math.max(1, meses);
}

/**
 * A trilha do plano do paciente.
 *
 * ATÉ 17/09/2026 ELA MENTIA PARA QUEM NÃO FECHOU O PROGRAMA. Os meses eram
 * fixos em seis e a consulta era colocada no mês `n * 2` — regra que só vale
 * para a grade do Programa de Acompanhamento (6 bio + 3 consultas em 6 meses).
 * Quem fechou o Clube Bratan, que dá direito a duas bioimpedâncias e duas
 * consultas, via no próprio portal uma caminhada de seis meses que nunca
 * comprou; e quem fechou só tratamento via quinze passos a dever.
 *
 * Agora o mês de cada marco vem da DATA PREVISTA dele, e a janela do plano é a
 * do último marco. Sem marco nenhum (só tratamento), devolve null — e a seção
 * simplesmente não aparece, em vez de mostrar uma trilha vazia.
 */
export function trilhaDoPlano(marcos: MarcoDoPlano[], inicioISO: string, hojeISO: string): { passos: PassoDaTrilha[]; mesAtual: number; feitos: number; total: number; meses: number; frase: string } | null {
  if (!marcos.length) return null;
  const meses = Math.max(...marcos.map((m) => mesDaData(inicioISO, m.expectedDate)));
  const diasNoPlano = Math.max(0, diasEntre(inicioISO, hojeISO));
  const mesAtual = Math.min(meses, Math.floor(diasNoPlano / 30) + 1);
  const passos: PassoDaTrilha[] = [];
  for (let mes = 1; mes <= meses; mes += 1) {
    const doMes = marcos.filter((m) => mesDaData(inicioISO, m.expectedDate) === mes).map((m) => ({ ...m, quem: QUEM[m.type] }));
    const todosFeitos = doMes.length > 0 && doMes.every((m) => m.done);
    passos.push({ mes, rotulo: `Mês ${mes}`, estado: mes < mesAtual || todosFeitos ? "feito" : mes === mesAtual ? "agora" : "futuro", marcos: doMes });
  }
  const feitos = marcos.filter((m) => m.done).length;
  const total = marcos.length;
  const proximo = marcos.filter((m) => !m.done).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))[0];
  const frase = proximo
    ? `Você está no mês ${mesAtual} de ${meses}. O próximo passo é ${proximo.label.toLowerCase()}, com ${QUEM[proximo.type]}, previsto para ${diaMes(proximo.expectedDate)}.`
    : `Você completou a caminhada${meses === 6 ? " dos seis meses" : ""}.`;
  return { passos, mesAtual, feitos, total, meses, frase };
}

export const CANAL_LABEL: Record<string, string> = {
  PROGRAMA: "Programa de Acompanhamento",
  CLUBE_BRATAN: "Clube Bratan",
  SOMENTE_TRATAMENTO: "Tratamento",
  CONSULTA_BLACK: "Consulta Black",
};

export function nomeDoPlano(canal: string | null) {
  if (!canal) return "Plano de acompanhamento";
  return CANAL_LABEL[canal] ?? canal.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Saudação pela hora local. */
export function saudacao(primeiroNome: string, hora = new Date().getHours()) {
  const periodo = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  return `${periodo}, ${primeiroNome}.`;
}

export function primeiroNome(nome: string) {
  return (nome || "").trim().split(/\s+/)[0] || "paciente";
}

export function montarLinkPortal(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/meu/entrar?t=${encodeURIComponent(token)}`;
}
