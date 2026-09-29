// LEITURA DO ICS DA AGENDA (29/09/2026) — peça pura, sem Deno, testada em
// tests/agenda-ics.test.mjs. Saiu de dentro de google-agenda-sync para dar
// para provar, com teste, cada defeito que fazia a ponte perder consulta:
//
//  1. Instância modificada de uma série (RECURRENCE-ID) nunca substituía a
//     original: a chave cortava o UID no primeiro "@" e o Google usa UID
//     "xxxx@google.com". Resultado: consulta em dobro E várias linhas com o
//     MESMO origem_id no mesmo lote — o Postgres recusa o lote inteiro ("ON
//     CONFLICT DO UPDATE command cannot affect row a second time") e o laço
//     parava ali (break), perdendo todos os lotes seguintes (dias inteiros).
//  2. Instância movida para FORA da janela deixava a original viva (consulta
//     fantasma no dia antigo).
//  3. Série antiga (DTSTART mais de 400 dias atrás) nunca chegava na janela.
//  4. Alarmes (VALARM) dentro do evento misturavam DESCRIPTION/TRIGGER no
//     evento.
//  5. "\;" escapado nunca era desfeito (o regex era /\;/, que é só ";").
//  6. O mesmo UID em dois calendários (convite com duas agendas) virava uma
//     linha só, trocando de profissional a cada hora, e podia derrubar o lote.
//
// O dia de cada consulta é o dia de BRASÍLIA (UTC−3 o ano todo desde 2019),
// nunca o dia UTC: consulta das 21h não pode cair no dia seguinte.

export type EventoIcs = {
  uid: string;
  inicio: Date;
  fim: Date;
  resumo: string;
  descricao: string;
  local: string;
  status: string;
  categorias: string;
  cor: string;
};

type Prop = { valor: string; params: string };
type Props = Record<string, Prop[]>;

const OFFSET_BRASILIA_H = -3;

export function desdobrar(ics: string): string[] {
  return ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

export function desescapar(v: string): string {
  return v
    .replace(/\\\\/g, "\u0000")
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\u0000/g, "\\")
    .trim();
}

/** Data/hora do ICS → instante. Dia inteiro (VALUE=DATE) devolve null: não é consulta. */
export function parseData(valor: string, params: string): Date | null {
  const tz = /TZID=([^;:]+)/.exec(params)?.[1] ?? "";
  if (/VALUE=DATE(?![-T])/.test(params) || /^\d{8}$/.test(valor)) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(valor.trim());
  if (!m) return null;
  const [, a, mo, d, h, mi, s, z] = m;
  if (z === "Z") return new Date(Date.UTC(+a, +mo - 1, +d, +h, +mi, +s));
  // Sem Z: hora local. O Google manda America/Sao_Paulo; hora "flutuante" (sem
  // TZID) também é tratada como Brasília, porque a agenda é daqui.
  const offset = !tz || /Sao_Paulo|Brasilia|Fortaleza|Recife|Bahia|Belem|Maceio|Araguaina|Santarem/i.test(tz) ? OFFSET_BRASILIA_H : 0;
  return new Date(Date.UTC(+a, +mo - 1, +d, +h - offset, +mi, +s));
}

/** O dia (AAAA-MM-DD) em Brasília de um instante. */
export function diaEmBrasilia(instante: Date): string {
  return new Date(instante.getTime() + OFFSET_BRASILIA_H * 3600_000).toISOString().slice(0, 10);
}

/** Separa "NOME;PARAM=X:valor" respeitando ":" dentro de aspas. */
function separarPropriedade(linha: string): { chave: string; params: string; valor: string } | null {
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') aspas = !aspas;
    else if (c === ":" && !aspas) {
      const [chave, ...params] = linha.slice(0, i).split(";");
      return { chave: chave.toUpperCase(), params: params.join(";"), valor: linha.slice(i + 1) };
    }
  }
  return null;
}

/** Os VEVENTs do arquivo, só com as propriedades do próprio evento (sem VALARM). */
function blocosDeEvento(ics: string): Props[] {
  const blocos: Props[] = [];
  let atual: Props | null = null;
  let profundidade = 0; // componentes aninhados dentro do VEVENT (VALARM…)
  for (const bruta of desdobrar(ics)) {
    const linha = bruta.trimEnd();
    if (!linha) continue;
    if (linha === "BEGIN:VEVENT") {
      atual = {};
      profundidade = 0;
      continue;
    }
    if (!atual) continue;
    if (linha === "END:VEVENT") {
      blocos.push(atual);
      atual = null;
      continue;
    }
    if (linha.startsWith("BEGIN:")) {
      profundidade += 1;
      continue;
    }
    if (linha.startsWith("END:")) {
      profundidade = Math.max(0, profundidade - 1);
      continue;
    }
    if (profundidade > 0) continue;
    const prop = separarPropriedade(linha);
    if (!prop) continue;
    (atual[prop.chave] ??= []).push({ valor: prop.valor, params: prop.params });
  }
  return blocos;
}

const DIAS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DIA_MS = 86_400_000;
// Dez anos de dias: cobre série criada há muito tempo sem laço infinito.
const LIMITE_DE_DIAS = 3700;

function baseDoEvento(props: Props): Omit<EventoIcs, "inicio" | "fim"> {
  const pega = (k: string) => props[k]?.[0];
  return {
    uid: desescapar(pega("UID")?.valor ?? ""),
    resumo: desescapar(pega("SUMMARY")?.valor ?? ""),
    descricao: desescapar(pega("DESCRIPTION")?.valor ?? ""),
    local: desescapar(pega("LOCATION")?.valor ?? ""),
    status: desescapar(pega("STATUS")?.valor ?? "CONFIRMED"),
    categorias: (props["CATEGORIES"] ?? []).map((c) => desescapar(c.valor)).join(","),
    cor: desescapar(pega("COLOR")?.valor ?? pega("X-APPLE-CALENDAR-COLOR")?.valor ?? ""),
  };
}

/** Todas as ocorrências (dentro da janela) de um VEVENT, com ou sem RRULE. */
function ocorrencias(props: Props, de: Date, ate: Date): EventoIcs[] {
  const pega = (k: string) => props[k]?.[0];
  const dtstart = pega("DTSTART");
  if (!dtstart) return [];
  const inicio = parseData(dtstart.valor, dtstart.params);
  if (!inicio) return [];
  const dtend = pega("DTEND");
  const fimLido = dtend ? parseData(dtend.valor, dtend.params) : null;
  const fim = fimLido && fimLido > inicio ? fimLido : new Date(inicio.getTime() + 30 * 60_000);
  const dur = fim.getTime() - inicio.getTime();
  const base = baseDoEvento(props);
  const rrule = pega("RRULE")?.valor;
  if (!rrule) return inicio <= ate && fim >= de ? [{ ...base, inicio, fim }] : [];

  const exdates = new Set(
    (props["EXDATE"] ?? [])
      .flatMap((e) => e.valor.split(",").map((v) => parseData(v.trim(), e.params)?.getTime()))
      .filter((t): t is number => typeof t === "number"),
  );
  const regra = Object.fromEntries(rrule.split(";").map((p) => p.split("=") as [string, string]));
  const freq = regra.FREQ;
  const intervalo = Number(regra.INTERVAL ?? 1) || 1;
  const until = regra.UNTIL
    ? parseData(regra.UNTIL, "") ?? new Date(`${regra.UNTIL.slice(0, 4)}-${regra.UNTIL.slice(4, 6)}-${regra.UNTIL.slice(6, 8)}T23:59:59-03:00`)
    : null;
  const count = regra.COUNT ? Number(regra.COUNT) : null;
  const byday = regra.BYDAY ? regra.BYDAY.split(",").map((d) => DIAS.indexOf(d.slice(-2))).filter((i) => i >= 0) : null;
  const lista: EventoIcs[] = [];
  const limite = Math.min(ate.getTime(), until?.getTime() ?? ate.getTime());
  const diaInicial = Date.parse(`${diaEmBrasilia(inicio)}T00:00:00Z`);
  let gerados = 0;
  for (let i = 0; i < LIMITE_DE_DIAS; i += 1) {
    const ini = new Date(inicio.getTime() + i * DIA_MS);
    if (ini.getTime() > limite) break;
    const diasDesde = Math.round((Date.parse(`${diaEmBrasilia(ini)}T00:00:00Z`) - diaInicial) / DIA_MS);
    let cai = false;
    if (freq === "DAILY") cai = diasDesde % intervalo === 0;
    else if (freq === "WEEKLY") {
      const dow = new Date(Date.parse(`${diaEmBrasilia(ini)}T00:00:00Z`)).getUTCDay();
      cai = Math.floor(diasDesde / 7) % intervalo === 0 && (byday ? byday.includes(dow) : diasDesde % 7 === 0);
    } else if (freq === "MONTHLY") {
      const a = diaEmBrasilia(ini);
      const b = diaEmBrasilia(inicio);
      const meses = (Number(a.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + Number(a.slice(5, 7)) - Number(b.slice(5, 7));
      cai = a.slice(8, 10) === b.slice(8, 10) && meses % intervalo === 0;
    }
    if (!cai) continue;
    gerados += 1;
    if (count && gerados > count) break;
    if (exdates.has(ini.getTime())) continue;
    if (ini <= ate && ini.getTime() + dur >= de.getTime()) {
      lista.push({ ...base, uid: `${base.uid}@${diaEmBrasilia(ini)}`, inicio: ini, fim: new Date(ini.getTime() + dur) });
    }
  }
  return lista;
}

/** Eventos com horário dentro da janela [de, ate]. Recorrências já expandidas. */
export function parseICS(ics: string, de: Date, ate: Date): EventoIcs[] {
  const eventos: EventoIcs[] = [];
  // Chave "UID@dia original" de toda instância modificada, esteja ela dentro
  // ou fora da janela: a original gerada pela regra sai de qualquer jeito.
  const substituidas = new Set<string>();
  const modificadas: EventoIcs[] = [];
  for (const props of blocosDeEvento(ics)) {
    const rid = props["RECURRENCE-ID"]?.[0];
    if (rid) {
      const original = parseData(rid.valor, rid.params);
      const uid = desescapar(props["UID"]?.[0]?.valor ?? "");
      if (!original || !uid) continue;
      const chave = `${uid}@${diaEmBrasilia(original)}`;
      substituidas.add(chave);
      for (const ev of ocorrencias({ ...props, RRULE: [] }, de, ate)) modificadas.push({ ...ev, uid: chave });
      continue;
    }
    eventos.push(...ocorrencias(props, de, ate));
  }
  return [...eventos.filter((e) => !substituidas.has(e.uid)), ...modificadas];
}

/**
 * O que o calendário TRAZ (29/09/2026): só contagens, nunca o conteúdo — nome
 * de paciente e observação não vão para log. Serve para responder, com o
 * arquivo real, "o ICS traz o procedimento / a cor?".
 */
export function censoDoCalendario(ics: string): Record<string, number> {
  const censo: Record<string, number> = { eventos: 0, diaInteiro: 0, recorrentes: 0, comDescricao: 0, comLocal: 0, comCategoria: 0, comCor: 0, comProcedimentoNoTexto: 0 };
  for (const props of blocosDeEvento(ics)) {
    censo.eventos += 1;
    const base = baseDoEvento(props);
    const dt = props["DTSTART"]?.[0];
    if (dt && !parseData(dt.valor, dt.params)) censo.diaInteiro += 1;
    if (props["RRULE"]?.length) censo.recorrentes += 1;
    if (base.descricao) censo.comDescricao += 1;
    if (base.local) censo.comLocal += 1;
    if (base.categorias) censo.comCategoria += 1;
    if (base.cor) censo.comCor += 1;
    if (procedimentoNoTexto(`${base.resumo}\n${base.descricao}\n${base.categorias}`)) censo.comProcedimentoNoTexto += 1;
  }
  return censo;
}

// Procedimentos do Dr. Daniel no iClinic (ids e cores conferidos em 09/2026).
// A cor verde-água #4be0de é a ÚNICA que marca paciente novo (regra do Lucas).
export const PROCEDIMENTOS_ICLINIC = [
  { id: 1152774, nome: "Primeira consulta", cor: "#4be0de", padrao: /primeira\s+consulta/i },
  { id: 1152775, nome: "Paciente em acompanhamento", cor: "#ff8ac4", padrao: /paciente\s+em\s+acompanhamento/i },
  { id: 1153298, nome: "Programa de acompanhamento - Clube Bratan", cor: "#f0e901", padrao: /programa\s+de\s+acompanhamento/i },
  { id: 1217358, nome: "Implantes hormonais", cor: "#ffa81e", padrao: /implantes?\s+hormona/i },
  { id: 1878708, nome: "Clube de consulta Bratan", cor: "#ffa81e", padrao: /clube\s+de\s+consulta/i },
] as const;

export function procedimentoNoTexto(texto: string): string | null {
  for (const p of PROCEDIMENTOS_ICLINIC) if (p.padrao.test(texto)) return p.nome;
  return null;
}

/** O tipo da consulta, se o calendário disser: procedimento conhecido, linha "Procedimento:" ou categoria. */
export function tipoDoEvento(ev: Pick<EventoIcs, "resumo" | "descricao" | "categorias">): string | null {
  const conhecido = procedimentoNoTexto(`${ev.descricao}\n${ev.categorias}\n${ev.resumo}`);
  if (conhecido) return conhecido;
  const linha = /Procedimentos?:\s*([^\n]+)/i.exec(ev.descricao)?.[1]?.trim();
  if (linha) return linha.slice(0, 120);
  return ev.categorias ? ev.categorias.slice(0, 120) : null;
}

export type LinhaDoEspelho = {
  origem: "iclinic";
  origem_id: string;
  dia: string;
  inicio: string;
  fim: string;
  minutos: number;
  sala: string | null;
  profissional: string | null;
  paciente: string | null;
  tipo: string | null;
  status: "agendado" | "cancelado";
  sincronizado_em: string;
  cor?: string;
};

/**
 * Monta as linhas do upsert SEM origem_id repetido (a causa do lote recusado).
 * - Mesmo UID em dois calendários: o primeiro calendário fica com o UID puro
 *   (linha que já existe continua a mesma) e os outros ganham "#rótulo".
 * - Mesmo UID duas vezes no mesmo calendário: fica a última (a mais nova).
 * A coluna `cor` só vai quando o calendário trouxe cor, para o upsert não
 * depender da coluna nova antes da migration de 29/09 ser aplicada.
 */
export function linhasParaOEspelho(
  cargas: { rotulo: string; eventos: EventoIcs[] }[],
  cargaEm: string,
  rotulosPorLocal: Record<string, string> = {},
): { linhas: LinhaDoEspelho[]; repetidos: number } {
  const porId = new Map<string, LinhaDoEspelho>();
  const donoDoUid = new Map<string, string>();
  let repetidos = 0;
  for (const carga of cargas) {
    for (const ev of carga.eventos) {
      const uid = ev.uid.slice(0, 180);
      if (!uid) continue;
      const dono = donoDoUid.get(uid);
      if (dono === undefined) donoDoUid.set(uid, carga.rotulo);
      const origemId = dono === undefined || dono === carga.rotulo ? uid : `${uid}#${carga.rotulo || "sem-rotulo"}`.slice(0, 200);
      if (porId.has(origemId)) repetidos += 1;
      const profissional = carga.rotulo || rotulosPorLocal[ev.local] || (/Profissional:\s*([^\n]+)/i.exec(ev.descricao)?.[1]?.trim() ?? "") || null;
      const linha: LinhaDoEspelho = {
        origem: "iclinic",
        origem_id: origemId,
        dia: diaEmBrasilia(ev.inicio),
        inicio: ev.inicio.toISOString(),
        fim: ev.fim.toISOString(),
        minutos: Math.round((ev.fim.getTime() - ev.inicio.getTime()) / 60_000),
        sala: ev.local || null,
        profissional,
        paciente: ev.resumo.slice(0, 200) || null,
        tipo: tipoDoEvento(ev),
        status: /CANCELLED/i.test(ev.status) ? "cancelado" : "agendado",
        sincronizado_em: cargaEm,
      };
      if (ev.cor) linha.cor = ev.cor.slice(0, 40);
      porId.delete(origemId); // reinsere no fim: a ordem segue a última leitura
      porId.set(origemId, linha);
    }
  }
  return { linhas: [...porId.values()], repetidos };
}
