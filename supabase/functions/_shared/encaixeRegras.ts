// LISTA DE PRONTIDÃO (ENCAIXE) — AS REGRAS SEM REDE E SEM BANCO (27/10/2026).
//
// Quando um horário do médico abre (o paciente tocou "Preciso remarcar" ou a
// consulta sumiu do iClinic), o horário vira uma VAGA. A vaga é oferecida a UMA
// pessoa da lista por vez — quem aceitou entrar no encaixe, com consentimento —
// e cada uma tem `minutosParaResponder` (30) para tocar no botão. Sem resposta,
// a oferta expira e passa para a próxima. Uma pessoa também só segura uma oferta
// por vez (não recebe duas vagas ao mesmo tempo).
//
// O banco garante o "uma por vez" com índices únicos parciais
// (202610280302_encaixe_lista_de_prontidao.sql); aqui mora a DECISÃO, testada em
// tests/whatsapp-encaixe.test.mjs. Quem aplica é supabase/functions/_shared/encaixe.ts.
import {
  diaEmBrasilia,
  diaDaSemanaEmBrasilia,
  diaPorExtenso,
  horaCheiaEmBrasilia,
  horaEmBrasilia,
  mesmoProfissional,
  profissionalNaLista,
  telefoneValido,
  tipoDaCaixa,
  type AcaoDoBotao,
  type ConfigEncaixe,
} from "./whatsappRegras.ts";

export type StatusDaVaga = "ABERTA" | "PREENCHIDA" | "OCUPADA" | "CANCELADA" | "EXPIRADA";
export type MotivoDaVaga = "CANCELAMENTO" | "REMARCACAO" | "TESTE";
export type StatusDaOferta = "ENVIANDO" | "AGUARDANDO" | "ACEITA" | "RECUSADA" | "EXPIRADA" | "FALHOU" | "BLOQUEADA" | "SAIU" | "CANCELADA";

/** Oferta que ainda segura a vaga (e a pessoa). */
export const OFERTA_VIVA: StatusDaOferta[] = ["ENVIANDO", "AGUARDANDO"];

export type LinhaDaAgenda = {
  id: string;
  inicio: string | null;
  fim?: string | null;
  minutos?: number | null;
  profissional: string | null;
  paciente: string | null;
  status: string | null;
  confirmacao_status?: string | null;
  respondido_em?: string | null;
  sincronizado_em?: string | null;
};

export type Vaga = { id: string; agendaId: string | null; inicio: string; fim: string | null; profissional: string; status: StatusDaVaga; motivo: MotivoDaVaga };

export type Oferta = { id: string; vagaId: string; listaEsperaId: string; status: StatusDaOferta; criadoEm: string; enviadaEm: string | null; expiraEm: string | null };

export type Candidato = {
  id: string;
  nome: string;
  telefone: string;
  /** Vazio = qualquer médico da lista do encaixe. */
  profissional: string;
  aceitaEncaixe: boolean;
  consentimentoEm: string | null;
  atendidoEm: string | null;
  criadoEm: string;
};

const MINUTO = 60_000;
/** Oferta parada em "ENVIANDO" por mais que isso: a função caiu no meio — conta como falha. */
const ENVIO_TRAVADO_MS = 5 * MINUTO;
/** A vaga só nasce de mudança recente (não ressuscita cancelamento antigo quando o WhatsApp liga). */
const JANELA_DA_MUDANCA_MS = 24 * 3600_000;

function instante(iso: string | null | undefined) {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : NaN;
}

function fimDe(inicio: string, fim: string | null | undefined, minutos?: number | null) {
  const t = instante(fim);
  if (Number.isFinite(t)) return t;
  return instante(inicio) + (minutos && minutos > 0 ? minutos : 30) * MINUTO;
}

/**
 * Esta linha da agenda abre uma vaga de encaixe AGORA? Só consulta de PACIENTE
 * de um dos profissionais do encaixe, que começa depois da antecedência mínima
 * e dentro de `diasParaFrente`, e que mudou nas últimas 24 h: desmarcada no
 * iClinic (status "cancelado") ou "Preciso remarcar" (confirmacao_status REMARCAR).
 */
export function linhaAbreVaga(linha: LinhaDaAgenda, agoraISO: string, config: ConfigEncaixe): MotivoDaVaga | null {
  if (!config.ligado || !linha.inicio) return null;
  const agora = instante(agoraISO);
  const inicio = instante(linha.inicio);
  if (!Number.isFinite(inicio)) return null;
  if (inicio - agora < config.antecedenciaMinimaMinutos * MINUTO) return null;
  if (inicio - agora > config.diasParaFrente * 86_400_000) return null;
  if (tipoDaCaixa(linha.paciente) !== "PACIENTE") return null;
  if (!profissionalNaLista(linha.profissional, config.profissionais)) return null;
  const recente = (iso: string | null | undefined) => {
    const t = instante(iso);
    return Number.isFinite(t) && agora - t <= JANELA_DA_MUDANCA_MS;
  };
  if (String(linha.status ?? "").toLowerCase() === "cancelado" && recente(linha.sincronizado_em)) return "CANCELAMENTO";
  if (linha.confirmacao_status === "REMARCAR" && recente(linha.respondido_em)) return "REMARCACAO";
  return null;
}

export type SituacaoDaVaga = { aberta: true } | { aberta: false; status: Exclude<StatusDaVaga, "ABERTA" | "PREENCHIDA">; motivo: string };

/**
 * A vaga ainda existe? Fecha quando o paciente original manteve o horário
 * (voltou a confirmar ou a consulta voltou para o iClinic) ou quando OUTRO
 * paciente foi marcado no mesmo horário com o mesmo profissional. A vaga de
 * teste não olha a agenda.
 */
export function situacaoDaVaga(vaga: Vaga, agenda: LinhaDaAgenda[]): SituacaoDaVaga {
  if (vaga.motivo === "TESTE") return { aberta: true };
  const original = vaga.agendaId ? agenda.find((linha) => linha.id === vaga.agendaId) : undefined;
  if (original) {
    const desmarcada = String(original.status ?? "").toLowerCase() === "cancelado";
    if (vaga.motivo === "CANCELAMENTO" && !desmarcada) return { aberta: false, status: "CANCELADA", motivo: "a consulta voltou para a agenda" };
    if (vaga.motivo === "REMARCACAO" && !desmarcada && original.confirmacao_status !== "REMARCAR") return { aberta: false, status: "CANCELADA", motivo: "o paciente manteve o horário" };
  }
  const ini = instante(vaga.inicio);
  const fim = fimDe(vaga.inicio, vaga.fim);
  const outro = agenda.find((linha) => {
    if (linha.id === vaga.agendaId || !linha.inicio) return false;
    if (String(linha.status ?? "").toLowerCase() === "cancelado") return false;
    if (linha.confirmacao_status === "REMARCAR") return false;
    if (tipoDaCaixa(linha.paciente) !== "PACIENTE") return false;
    if (!mesmoProfissional(linha.profissional, vaga.profissional)) return false;
    const a = instante(linha.inicio);
    const b = fimDe(linha.inicio, linha.fim, linha.minutos);
    return a < fim && b > ini;
  });
  if (outro) return { aberta: false, status: "OCUPADA", motivo: "outro paciente foi marcado nesse horário" };
  return { aberta: true };
}

export function dentroDoHorarioDeEnvio(agoraISO: string, config: Pick<ConfigEncaixe, "horaInicio" | "horaFim" | "diasDaSemana">) {
  const hora = horaCheiaEmBrasilia(agoraISO);
  return config.diasDaSemana.includes(diaDaSemanaEmBrasilia(agoraISO)) && hora >= config.horaInicio && hora < config.horaFim;
}

export type Expiracao = { id: string; status: "EXPIRADA" | "FALHOU" };

export type DecisaoDaVaga =
  | { acao: "ESPERAR"; motivo: string; expirar: Expiracao[] }
  | { acao: "OFERECER"; candidato: Candidato; expirar: Expiracao[] }
  | { acao: "SEM_CANDIDATO"; expirar: Expiracao[] }
  | { acao: "ENCERRAR"; status: Exclude<StatusDaVaga, "ABERTA" | "PREENCHIDA">; motivo: string; expirar: Expiracao[]; cancelarVivas: boolean };

export type EntradaDaVaga = {
  vaga: Vaga;
  ofertas: Oferta[];
  candidatos: Candidato[];
  /** Quem já segura uma oferta viva de OUTRA vaga. */
  ocupados: Set<string>;
  agenda: LinhaDaAgenda[];
  agoraISO: string;
  config: ConfigEncaixe;
  /** A trava do modo teste: candidato fora da lista nem entra na fila. */
  libera: (telefone: string) => boolean;
};

function serve(candidato: Candidato, entrada: EntradaDaVaga, jaOfertados: Set<string>) {
  if (!candidato.aceitaEncaixe || !candidato.consentimentoEm || candidato.atendidoEm) return false;
  if (!telefoneValido(candidato.telefone)) return false;
  if (jaOfertados.has(candidato.id) || entrada.ocupados.has(candidato.id)) return false;
  if (candidato.profissional.trim() && !mesmoProfissional(candidato.profissional, entrada.vaga.profissional)) return false;
  return entrada.libera(candidato.telefone);
}

/** O próximo passo de UMA vaga aberta. */
export function decidirVaga(entrada: EntradaDaVaga): DecisaoDaVaga {
  const agora = instante(entrada.agoraISO);
  const expirar: Expiracao[] = [];
  const daVaga = entrada.ofertas.filter((oferta) => oferta.vagaId === entrada.vaga.id);

  const situacao = situacaoDaVaga(entrada.vaga, entrada.agenda);
  if (!situacao.aberta) return { acao: "ENCERRAR", status: situacao.status, motivo: situacao.motivo, expirar, cancelarVivas: true };

  for (const oferta of daVaga.filter((item) => OFERTA_VIVA.includes(item.status))) {
    if (oferta.status === "AGUARDANDO") {
      if (Number.isFinite(instante(oferta.expiraEm)) && instante(oferta.expiraEm) > agora) {
        return { acao: "ESPERAR", motivo: `esperando resposta até ${horaEmBrasilia(String(oferta.expiraEm))}`, expirar };
      }
      expirar.push({ id: oferta.id, status: "EXPIRADA" });
    } else {
      if (agora - instante(oferta.criadoEm) < ENVIO_TRAVADO_MS) return { acao: "ESPERAR", motivo: "oferta sendo enviada", expirar };
      expirar.push({ id: oferta.id, status: "FALHOU" });
    }
  }

  if (instante(entrada.vaga.inicio) - agora < entrada.config.antecedenciaMinimaMinutos * MINUTO) {
    return { acao: "ENCERRAR", status: "EXPIRADA", motivo: "o horário ficou perto demais para encaixe", expirar, cancelarVivas: false };
  }
  if (!dentroDoHorarioDeEnvio(entrada.agoraISO, entrada.config)) return { acao: "ESPERAR", motivo: "fora do horário de envio", expirar };

  const jaOfertados = new Set(daVaga.map((oferta) => oferta.listaEsperaId));
  const fila = entrada.candidatos
    .filter((candidato) => serve(candidato, entrada, jaOfertados))
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id));
  if (!fila.length) return { acao: "SEM_CANDIDATO", expirar };
  return { acao: "OFERECER", candidato: fila[0], expirar };
}

export type PassoDoPlano = { vaga: Vaga; decisao: DecisaoDaVaga };

/**
 * Todas as vagas abertas, da mais cedo para a mais tarde. A mesma pessoa não
 * recebe duas ofertas: quem é escolhido para uma vaga fica "ocupado" para as
 * seguintes; quem teve a oferta expirada ou cancelada fica livre de novo.
 */
export function planejarEncaixe(entrada: Omit<EntradaDaVaga, "vaga" | "ocupados"> & { vagas: Vaga[] }): PassoDoPlano[] {
  const ocupados = new Set(entrada.ofertas.filter((oferta) => OFERTA_VIVA.includes(oferta.status)).map((oferta) => oferta.listaEsperaId));
  const plano: PassoDoPlano[] = [];
  const abertas = entrada.vagas.filter((vaga) => vaga.status === "ABERTA").sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id));
  for (const vaga of abertas) {
    const vivasDaVaga = entrada.ofertas.filter((oferta) => oferta.vagaId === vaga.id && OFERTA_VIVA.includes(oferta.status));
    const decisao = decidirVaga({ ...entrada, vaga, ocupados: new Set([...ocupados].filter((id) => !vivasDaVaga.some((oferta) => oferta.listaEsperaId === id))) });
    for (const expirada of decisao.expirar) {
      const oferta = entrada.ofertas.find((item) => item.id === expirada.id);
      if (oferta) ocupados.delete(oferta.listaEsperaId);
    }
    if (decisao.acao === "ENCERRAR" && decisao.cancelarVivas) vivasDaVaga.forEach((oferta) => ocupados.delete(oferta.listaEsperaId));
    if (decisao.acao === "OFERECER") ocupados.add(decisao.candidato.id);
    plano.push({ vaga, decisao });
  }
  return plano;
}

/** As variáveis do modelo oferta_vaga (sem nome do médico, sem procedimento). */
export function variaveisDaOferta(vaga: Pick<Vaga, "inicio">, nome: string, minutos: number) {
  return [nome || "tudo bem", diaPorExtenso(vaga.inicio), horaEmBrasilia(vaga.inicio), String(minutos)];
}

// ---------------------------------------------------------------------------
// A resposta da pessoa à oferta
// ---------------------------------------------------------------------------

export type RespostaDaOferta = {
  /** Novo status da oferta (só se ela ainda estiver viva). */
  oferta: StatusDaOferta | null;
  vaga: "PREENCHIDA" | null;
  /** O que acontece com a pessoa na lista. */
  lista: "ENCAIXADA" | "SAIU" | null;
  /** Tarefa para a recepção marcar no iClinic. */
  avisarRecepcao: boolean;
  /** Oferecer para a próxima já. */
  avancar: boolean;
  resposta: string;
};

/**
 * "Quero o horário" vale enquanto a oferta ainda é a vez dela (AGUARDANDO),
 * mesmo que os 30 minutos tenham acabado de passar e ninguém ainda tenha
 * recebido a vaga. Depois que a vaga passou para outra pessoa, não vale mais.
 */
export function decidirRespostaDaOferta(entrada: {
  acao: AcaoDoBotao;
  oferta: Pick<Oferta, "status"> | null;
  vaga: Pick<Vaga, "status" | "inicio" | "motivo"> | null;
  agoraISO: string;
}): RespostaDaOferta {
  const nada: RespostaDaOferta = { oferta: null, vaga: null, lista: null, avisarRecepcao: false, avancar: false, resposta: "" };
  const { acao, oferta, vaga } = entrada;
  if (!oferta || !vaga) return { ...nada, resposta: acao === "OUTRO" ? "" : "Não achei essa oferta aqui. A recepção vai te responder por esta conversa." };
  const viva = OFERTA_VIVA.includes(oferta.status);
  const teste = vaga.motivo === "TESTE" ? " (teste)" : "";
  if (acao === "ENCAIXE_SAIR") {
    return { ...nada, oferta: viva ? "SAIU" : null, lista: "SAIU", avancar: viva, resposta: `Pronto, você saiu da lista de encaixe${teste}. Se quiser voltar, é só pedir à recepção.` };
  }
  if (acao === "ENCAIXE_NAO") {
    return { ...nada, oferta: viva ? "RECUSADA" : null, avancar: viva, resposta: `Sem problema! Você continua na lista e avisamos no próximo horário que abrir${teste}.` };
  }
  if (acao !== "ENCAIXE_SIM") return nada;
  const aindaDaPraMarcar = vaga.status === "ABERTA" && instante(vaga.inicio) > instante(entrada.agoraISO);
  if (oferta.status === "AGUARDANDO" && aindaDaPraMarcar) {
    return {
      oferta: "ACEITA",
      vaga: "PREENCHIDA",
      lista: "ENCAIXADA",
      avisarRecepcao: vaga.motivo !== "TESTE",
      avancar: false,
      resposta: `Combinado! Separamos o horário de ${diaPorExtenso(vaga.inicio)}, às ${horaEmBrasilia(vaga.inicio)}, para você${teste}. A recepção confirma por aqui em seguida.`,
    };
  }
  return { ...nada, resposta: `Esse horário não está mais disponível${teste}. Você continua na lista e avisamos no próximo que abrir.` };
}

/** A data (Brasília) e a hora da vaga, para o aviso da recepção. */
export function quandoDaVaga(vaga: Pick<Vaga, "inicio">) {
  return { dia: diaEmBrasilia(vaga.inicio), extenso: diaPorExtenso(vaga.inicio), hora: horaEmBrasilia(vaga.inicio) };
}
