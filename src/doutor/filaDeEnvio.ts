// A FILA DE ENVIO DO APP DO DOUTOR (28/10/2026).
//
// O consultório nem sempre tem internet, e o doutor não pode esperar o envio
// para seguir com o paciente. Então "Enviar ao sistema" sempre GUARDA o
// protocolo neste aparelho primeiro (fila) e manda quando der: na hora, quando
// a internet volta, quando o doutor entra, ao reabrir o app.
//
// TRÊS REGRAS:
// 1. O MESMO PLANO NUNCA VIRA DOIS. A "assinatura" do plano decide: apertar
//    Enviar de novo sem mudar nada reaproveita o mesmo client_ref, e o banco
//    devolve o que já tem (protocolo_enviar é idempotente).
// 2. PLANO QUE MUDOU É VERSÃO NOVA. Se a versão anterior já subiu, a nova leva
//    `substitui` e o banco cancela a anterior (se ninguém abriu a negociação).
//    Se a anterior ainda estava na fila, ela é trocada ali mesmo.
// 3. ERRO QUE NÃO SE RESOLVE SOZINHO PARA A FILA (sem permissão, protocolo
//    recusado): o doutor vê a frase e reenvia quando quiser. Falta de internet
//    e login vencido só esperam.
//
// Sem React e sem Supabase: tests/doutor-protocolo.test.mjs lê direto.
import { assinaturaDoRetrato, montarEnvio, type EnvioDoProtocolo, type RetratoDaV22 } from "./protocoloDaV22";

export type ItemDaFila = {
  clientRef: string;
  envio: EnvioDoProtocolo;
  assinatura: string;
  paciente: string;
  criadoEm: string;
  tentativas: number;
  erro: string | null;
  /** Erro que não se resolve sozinho: não tenta de novo até o doutor pedir. */
  parado: boolean;
};

export type Enviado = { clientRef: string; assinatura: string; paciente: string; enviadoEm: string; id: string | null };

/** O que liga o plano em montagem ao que já foi enviado e à agenda do dia. */
export type Vinculo = {
  assinatura: string | null;
  clientRef: string | null;
  agendaRef: string | null;
  contactRef: string | null;
  /** O nome como veio da agenda: se o doutor trocar o nome, o vínculo com a agenda cai. */
  nomeDaAgenda: string | null;
};

export type EstadoDaPonte = { fila: ItemDaFila[]; enviados: Enviado[]; vinculo: Vinculo };

export const vinculoVazio: Vinculo = { assinatura: null, clientRef: null, agendaRef: null, contactRef: null, nomeDaAgenda: null };
export const estadoVazio: EstadoDaPonte = { fila: [], enviados: [], vinculo: vinculoVazio };

/** Quantos envios o aparelho lembra (para dizer "já enviado ✓" de um plano reaberto do histórico). */
export const LEMBRA_ENVIADOS = 200;

const textoOuNulo = (valor: unknown) => (typeof valor === "string" && valor ? valor : null);

/** Lê o que estava guardado no aparelho sem nunca quebrar (JSON velho ou mexido vira vazio). */
export function lerEstado(bruto: unknown): EstadoDaPonte {
  if (!bruto || typeof bruto !== "object") return estadoVazio;
  const e = bruto as Partial<EstadoDaPonte>;
  const fila = Array.isArray(e.fila)
    ? e.fila.filter((item): item is ItemDaFila => Boolean(item && typeof item.clientRef === "string" && item.envio && typeof item.assinatura === "string"))
    : [];
  const enviados = Array.isArray(e.enviados)
    ? e.enviados.filter((item): item is Enviado => Boolean(item && typeof item.clientRef === "string" && typeof item.assinatura === "string"))
    : [];
  const v = (e.vinculo ?? {}) as Partial<Vinculo>;
  return {
    fila: fila.map((item) => ({ ...item, tentativas: Number(item.tentativas) || 0, erro: textoOuNulo(item.erro), parado: Boolean(item.parado) })),
    enviados: enviados.slice(0, LEMBRA_ENVIADOS),
    vinculo: {
      assinatura: textoOuNulo(v.assinatura),
      clientRef: textoOuNulo(v.clientRef),
      agendaRef: textoOuNulo(v.agendaRef),
      contactRef: textoOuNulo(v.contactRef),
      nomeDaAgenda: textoOuNulo(v.nomeDaAgenda),
    },
  };
}

function mesmoNome(a: string, b: string) {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return n(a) === n(b);
}

export type ResultadoDaFila = {
  estado: EstadoDaPonte;
  clientRef: string;
  /** Este mesmo plano já tinha subido: nada novo para enviar. */
  jaEnviado: boolean;
  /** Este mesmo plano já estava esperando na fila. */
  jaNaFila: boolean;
};

/**
 * "Enviar ao sistema": coloca o plano na fila (ou reconhece que ele já está lá
 * ou já subiu). Não envia nada — quem envia é a ponte, item a item.
 */
export function colocarNaFila(estado: EstadoDaPonte, retrato: RetratoDaV22, contexto: { agoraISO: string; novoId: () => string }): ResultadoDaFila {
  const assinatura = assinaturaDoRetrato(retrato);
  const jaSubiu = estado.enviados.find((item) => item.assinatura === assinatura);
  if (jaSubiu) {
    return {
      estado: { ...estado, vinculo: { ...estado.vinculo, assinatura, clientRef: jaSubiu.clientRef } },
      clientRef: jaSubiu.clientRef,
      jaEnviado: true,
      jaNaFila: false,
    };
  }
  const esperando = estado.fila.find((item) => item.assinatura === assinatura);
  if (esperando) {
    // Se tinha parado por erro, o doutor apertou de novo: tenta outra vez.
    const fila = estado.fila.map((item) => (item.clientRef === esperando.clientRef ? { ...item, parado: false } : item));
    return { estado: { ...estado, fila, vinculo: { ...estado.vinculo, assinatura, clientRef: esperando.clientRef } }, clientRef: esperando.clientRef, jaEnviado: false, jaNaFila: true };
  }

  // Versão nova do plano em montagem (mesmo paciente): a anterior sai.
  const anterior = estado.vinculo.clientRef;
  const anteriorNaFila = anterior ? estado.fila.find((item) => item.clientRef === anterior) : undefined;
  const anteriorSubiu = anterior ? estado.enviados.find((item) => item.clientRef === anterior) : undefined;
  const mesmoPaciente = (paciente: string | undefined) => Boolean(paciente && mesmoNome(paciente, retrato.nome));
  const substitui = anteriorSubiu && mesmoPaciente(anteriorSubiu.paciente) ? anteriorSubiu.clientRef : null;
  const filaSemAnterior = anteriorNaFila && mesmoPaciente(anteriorNaFila.paciente) ? estado.fila.filter((item) => item.clientRef !== anterior) : estado.fila;

  const clientRef = contexto.novoId();
  const envio = montarEnvio(retrato, {
    clientRef,
    agendaRef: estado.vinculo.agendaRef,
    contactRef: estado.vinculo.contactRef,
    substitui,
    agoraISO: contexto.agoraISO,
  });
  const item: ItemDaFila = { clientRef, envio, assinatura, paciente: envio.paciente_nome, criadoEm: contexto.agoraISO, tentativas: 0, erro: null, parado: false };
  return {
    estado: { ...estado, fila: [...filaSemAnterior, item], vinculo: { ...estado.vinculo, assinatura, clientRef } },
    clientRef,
    jaEnviado: false,
    jaNaFila: false,
  };
}

/** O banco respondeu (novo ou já existente): sai da fila e fica lembrado como enviado. */
export function aoResponder(estado: EstadoDaPonte, clientRef: string, resposta: { id?: string | null }, agoraISO: string): EstadoDaPonte {
  const item = estado.fila.find((entrada) => entrada.clientRef === clientRef);
  if (!item) return estado;
  const enviado: Enviado = { clientRef, assinatura: item.assinatura, paciente: item.paciente, enviadoEm: agoraISO, id: resposta.id ?? null };
  return {
    ...estado,
    fila: estado.fila.filter((entrada) => entrada.clientRef !== clientRef),
    enviados: [enviado, ...estado.enviados.filter((entrada) => entrada.clientRef !== clientRef)].slice(0, LEMBRA_ENVIADOS),
  };
}

export type Falha = { mensagem: string; definitiva: boolean; precisaEntrar: boolean };

/** Lê o erro do Supabase/fetch e decide: esperar (rede, login) ou parar (recusado). */
export function classificarFalha(erro: unknown): Falha {
  const e = (erro ?? {}) as { message?: unknown; code?: unknown; status?: unknown; name?: unknown };
  const mensagem = typeof e.message === "string" && e.message.trim() ? e.message.trim() : String(erro ?? "erro desconhecido");
  const codigo = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const rede = /failed to fetch|networkerror|load failed|network request failed|fetch failed|internet|timeout/i.test(mensagem) || e.name === "TypeError";
  if (rede) return { mensagem: "Sem internet agora: o protocolo fica guardado e sobe sozinho quando a conexão voltar.", definitiva: false, precisaEntrar: false };
  if (codigo === "28000" || codigo === "PGRST301" || codigo === "PGRST302" || status === 401 || /jwt|token|entre no sistema/i.test(mensagem)) {
    return { mensagem: "Entre no sistema para enviar: o protocolo fica guardado neste aparelho.", definitiva: false, precisaEntrar: true };
  }
  if (codigo === "42501" || codigo === "22023" || codigo === "P0001" || codigo === "23514" || status === 400 || status === 403) {
    return { mensagem, definitiva: true, precisaEntrar: false };
  }
  return { mensagem, definitiva: false, precisaEntrar: false };
}

/** Não subiu: conta a tentativa e guarda a frase. Falha definitiva para a fila deste item. */
export function aoFalhar(estado: EstadoDaPonte, clientRef: string, falha: Falha): EstadoDaPonte {
  return {
    ...estado,
    fila: estado.fila.map((item) =>
      item.clientRef === clientRef ? { ...item, tentativas: item.tentativas + 1, erro: falha.mensagem, parado: falha.definitiva } : item,
    ),
  };
}

/** Os que a ponte deve tentar agora (os parados esperam o doutor apertar de novo). */
export function prontosParaEnviar(estado: EstadoDaPonte) {
  return estado.fila.filter((item) => !item.parado);
}

/** "Novo plano": o vínculo com o envio anterior e com a agenda acaba; a fila e o histórico ficam. */
export function novoPlano(estado: EstadoDaPonte): EstadoDaPonte {
  return { ...estado, vinculo: vinculoVazio };
}

/** O doutor escolheu o paciente na agenda do dia. */
export function vincularAgenda(estado: EstadoDaPonte, escolha: { agendaRef: string; contactRef: string | null; nome: string }): EstadoDaPonte {
  return { ...estado, vinculo: { ...estado.vinculo, agendaRef: escolha.agendaRef, contactRef: escolha.contactRef, nomeDaAgenda: escolha.nome } };
}

/** Trocou o nome à mão depois de escolher da agenda: aquele horário não é mais deste plano. */
export function conferirNomeDaAgenda(estado: EstadoDaPonte, nomeAtual: string): EstadoDaPonte {
  const v = estado.vinculo;
  if (!v.nomeDaAgenda || mesmoNome(v.nomeDaAgenda, nomeAtual)) return estado;
  return { ...estado, vinculo: { ...v, agendaRef: null, contactRef: null, nomeDaAgenda: null } };
}

export type Situacao = { tipo: "vazio" | "nunca" | "na-fila" | "enviando" | "enviado" | "mudou" | "erro"; texto: string };

function hora(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** A frase embaixo do botão "Enviar ao sistema", sempre dizendo onde o protocolo está. */
export function situacaoDoPlano(
  estado: EstadoDaPonte,
  assinaturaAtual: string | null,
  contexto: { temSessao: boolean; online: boolean; enviando: boolean },
): Situacao {
  if (!assinaturaAtual) return { tipo: "vazio", texto: "Monte o plano e informe o paciente para enviar ao comercial." };
  const subiu = estado.enviados.find((item) => item.assinatura === assinaturaAtual);
  if (subiu) return { tipo: "enviado", texto: `Enviado ao sistema ✓${hora(subiu.enviadoEm) ? ` às ${hora(subiu.enviadoEm)}` : ""} — o comercial já vê este protocolo.` };
  const naFila = estado.fila.find((item) => item.assinatura === assinaturaAtual);
  if (naFila) {
    if (naFila.parado) return { tipo: "erro", texto: `Não foi para o sistema: ${naFila.erro ?? "erro desconhecido"} Toque em Enviar para tentar de novo.` };
    if (!contexto.temSessao) return { tipo: "na-fila", texto: "Guardado neste aparelho. Entre no sistema para ele subir." };
    if (!contexto.online) return { tipo: "na-fila", texto: "Guardado neste aparelho. Sobe sozinho quando a internet voltar." };
    if (contexto.enviando) return { tipo: "enviando", texto: "Enviando ao sistema…" };
    return { tipo: "na-fila", texto: naFila.erro ? `Guardado neste aparelho; vai tentar de novo (${naFila.erro})` : "Guardado neste aparelho; enviando em instantes." };
  }
  const v = estado.vinculo;
  const anteriorExiste = Boolean(v.clientRef && (estado.enviados.some((item) => item.clientRef === v.clientRef) || estado.fila.some((item) => item.clientRef === v.clientRef)));
  if (anteriorExiste && v.assinatura !== assinaturaAtual) {
    return { tipo: "mudou", texto: "O plano mudou depois do envio. Envie de novo para o comercial ver a versão nova." };
  }
  return { tipo: "nunca", texto: "Ainda não foi para o sistema." };
}
