// google-agenda-sync (15/09/2026): lê o calendário "Agenda iClinic" do Google
// (o iClinic sincroniza para lá sozinho, só de ida) e grava em agenda_espelho com
// origem 'iclinic'. Não precisa de API do iClinic nem de conta Google no servidor:
// usa o ENDEREÇO PRIVADO iCal do calendário, guardado como segredo
// GOOGLE_AGENDA_ICS (uma ou mais URLs separadas por ";" — opcionalmente
// "Nome do profissional=URL"). Expande recorrências semanais/diárias dentro da
// janela. Desligada por padrão; roda no cron das agendas e pelo botão da tela.
import { agoraBrasiliaISO, corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";

type Evento = { uid: string; inicio: Date; fim: Date; resumo: string; descricao: string; local: string; status: string; recurrenceId?: string };

function desdobrar(ics: string) {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}
function parseData(valor: string, params: string): Date | null {
  const tz = /TZID=([^;:]+)/.exec(params)?.[1] ?? "";
  if (/VALUE=DATE(?![-T])/.test(params) || /^\d{8}$/.test(valor)) return null; // dia inteiro: não é consulta
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(valor);
  if (!m) return null;
  const [, a, mo, d, h, mi, s, z] = m;
  if (z === "Z") return new Date(Date.UTC(+a, +mo - 1, +d, +h, +mi, +s));
  // Sem Z: hora local do TZID (o Google manda America/Sao_Paulo) — Brasília é UTC−3 o ano todo desde 2019.
  const offset = /Sao_Paulo|Brasilia|Fortaleza|Recife|Bahia|Belem/i.test(tz) || !tz ? -3 : 0;
  return new Date(Date.UTC(+a, +mo - 1, +d, +h - offset, +mi, +s));
}
function unescape(v: string) {
  return v.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\").trim();
}

/** Expande um VEVENT (com ou sem RRULE) em ocorrências dentro da janela. */
function ocorrencias(props: Record<string, { valor: string; params: string }[]>, de: Date, ate: Date): Evento[] {
  const pega = (k: string) => props[k]?.[0];
  const dtstart = pega("DTSTART");
  const dtend = pega("DTEND");
  if (!dtstart) return [];
  const inicio = parseData(dtstart.valor, dtstart.params);
  if (!inicio) return [];
  const fim = dtend ? parseData(dtend.valor, dtend.params) ?? new Date(inicio.getTime() + 30 * 60_000) : new Date(inicio.getTime() + 30 * 60_000);
  const dur = fim.getTime() - inicio.getTime();
  const base: Omit<Evento, "inicio" | "fim"> = {
    uid: unescape(pega("UID")?.valor ?? ""),
    resumo: unescape(pega("SUMMARY")?.valor ?? ""),
    descricao: unescape(pega("DESCRIPTION")?.valor ?? ""),
    local: unescape(pega("LOCATION")?.valor ?? ""),
    status: unescape(pega("STATUS")?.valor ?? "CONFIRMED"),
    recurrenceId: pega("RECURRENCE-ID")?.valor,
  };
  const rrule = pega("RRULE")?.valor;
  const exdates = new Set((props["EXDATE"] ?? []).flatMap((e) => e.valor.split(",")).map((v) => parseData(v.trim(), "")?.getTime()).filter(Boolean));
  if (!rrule) return inicio <= ate && fim >= de ? [{ ...base, inicio, fim }] : [];
  const regra = Object.fromEntries(rrule.split(";").map((p) => p.split("=") as [string, string]));
  const freq = regra.FREQ;
  const intervalo = Number(regra.INTERVAL ?? 1) || 1;
  const until = regra.UNTIL ? parseData(regra.UNTIL, "") ?? new Date(regra.UNTIL.slice(0, 4) + "-" + regra.UNTIL.slice(4, 6) + "-" + regra.UNTIL.slice(6, 8) + "T23:59:59-03:00") : null;
  const count = regra.COUNT ? Number(regra.COUNT) : null;
  const DIAS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const byday = regra.BYDAY ? regra.BYDAY.split(",").map((d) => DIAS.indexOf(d.slice(-2))).filter((i) => i >= 0) : null;
  const lista: Evento[] = [];
  let gerados = 0;
  // Anda dia a dia a partir do DTSTART (limite de 400 dias) e filtra pela regra.
  const cursor = new Date(inicio);
  const limite = new Date(Math.min(ate.getTime(), until?.getTime() ?? ate.getTime()));
  const diaInicial = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate()));
  for (let i = 0; i < 400 && cursor <= limite; i += 1) {
    const diasDesde = Math.round((Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()) - diaInicial.getTime()) / 86_400_000);
    let cai = false;
    if (freq === "DAILY") cai = diasDesde % intervalo === 0;
    else if (freq === "WEEKLY") {
      const semana = Math.floor(diasDesde / 7);
      const dow = new Date(cursor.getTime() - 3 * 3600_000).getUTCDay(); // dia da semana em Brasília
      cai = semana % intervalo === 0 && (byday ? byday.includes(dow) : diasDesde % 7 === 0);
    } else if (freq === "MONTHLY") cai = cursor.getUTCDate() === inicio.getUTCDate() && ((cursor.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + cursor.getUTCMonth() - inicio.getUTCMonth()) % intervalo === 0;
    if (cai) {
      gerados += 1;
      if (count && gerados > count) break;
      const ini = new Date(cursor);
      if (!exdates.has(ini.getTime()) && ini <= ate && ini.getTime() + dur >= de.getTime()) lista.push({ ...base, uid: `${base.uid}@${ini.toISOString().slice(0, 10)}`, inicio: ini, fim: new Date(ini.getTime() + dur) });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return lista;
}

export function parseICS(ics: string, de: Date, ate: Date): Evento[] {
  const linhas = desdobrar(ics);
  const eventos: Evento[] = [];
  const sobrescritos = new Map<string, Evento>();
  let atual: Record<string, { valor: string; params: string }[]> | null = null;
  for (const linha of linhas) {
    if (linha === "BEGIN:VEVENT") atual = {};
    else if (linha === "END:VEVENT" && atual) {
      const lista = ocorrencias(atual, de, ate);
      for (const ev of lista) {
        if (ev.recurrenceId) sobrescritos.set(`${ev.uid.split("@")[0]}@${(parseData(ev.recurrenceId, "") ?? new Date(0)).toISOString().slice(0, 10)}`, ev);
        else eventos.push(ev);
      }
      atual = null;
    } else if (atual) {
      const i = linha.indexOf(":");
      if (i < 0) continue;
      const chaveParams = linha.slice(0, i);
      const [chave, ...params] = chaveParams.split(";");
      (atual[chave] ??= []).push({ valor: linha.slice(i + 1), params: params.join(";") });
    }
  }
  // Instância modificada (RECURRENCE-ID) substitui a gerada pela regra.
  const final = eventos.filter((e) => !sobrescritos.has(e.uid));
  for (const ev of sobrescritos.values()) final.push(ev);
  return final;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  const client = db();
  const integracao = await lerIntegracao(client, "google_agenda");
  if (!integracao.ligada) return respostaDesligada("google_agenda");
  const faltam = segredosFaltando(["GOOGLE_AGENDA_ICS"]);
  if (faltam.length) return respostaSemSegredos("google_agenda", faltam);
  const entrada = await corpo<{ de?: string; ate?: string }>(request);
  const hoje = agoraBrasiliaISO();
  const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const deISO = entrada.de ?? somaDias(hoje, -Number(integracao.config.diasParaTras ?? 2));
  const ateISO = entrada.ate ?? somaDias(hoje, Number(integracao.config.diasParaFrente ?? 120));
  const de = new Date(`${deISO}T00:00:00-03:00`);
  const ate = new Date(`${ateISO}T23:59:59-03:00`);
  const fontes = (Deno.env.get("GOOGLE_AGENDA_ICS") ?? "").split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^([^=]+)=(https?:\/\/.+)$/.exec(s);
    return m ? { rotulo: m[1].trim(), url: m[2].trim() } : { rotulo: "", url: s };
  });
  const rotulos = (integracao.config.rotulos as Record<string, string>) ?? {};
  let gravados = 0;
  const erros: string[] = [];
  const linhas: Record<string, unknown>[] = [];
  const cargaEm = new Date().toISOString();
  const lidosPorRotulo = new Map<string, number>();
  for (const fonte of fontes) {
    try {
      const r = await fetch(fonte.url, { headers: { "User-Agent": "app-bratan/agenda-espelho" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ics = await r.text();
      const eventos = parseICS(ics, de, ate);
      lidosPorRotulo.set(fonte.rotulo, (lidosPorRotulo.get(fonte.rotulo) ?? 0) + eventos.length);
      for (const ev of eventos) {
        const cancelado = /CANCELLED/i.test(ev.status);
        const profissional = fonte.rotulo || rotulos[ev.local] || (ev.descricao.match(/Profissional:\s*([^\n]+)/i)?.[1] ?? "") || null;
        linhas.push({
          origem: "iclinic",
          origem_id: ev.uid.slice(0, 200),
          dia: new Date(ev.inicio.getTime() - 3 * 3600_000).toISOString().slice(0, 10),
          inicio: ev.inicio.toISOString(),
          fim: ev.fim.toISOString(),
          minutos: Math.round((ev.fim.getTime() - ev.inicio.getTime()) / 60_000),
          sala: ev.local || null,
          profissional,
          paciente: ev.resumo.slice(0, 200) || null,
          tipo: (ev.descricao.match(/Procedimento[s]?:\s*([^\n]+)/i)?.[1] ?? "").slice(0, 120) || null,
          status: cancelado ? "cancelado" : "agendado",
          sincronizado_em: cargaEm,
        });
      }
    } catch (erro) {
      erros.push(`${fonte.rotulo || fonte.url.slice(0, 40)}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  for (let i = 0; i < linhas.length; i += 200) {
    const { error, count } = await client.from("agenda_espelho").upsert(linhas.slice(i, i + 200), { onConflict: "origem,origem_id", count: "exact" });
    if (error) {
      erros.push(`gravação: ${error.message}`);
      break;
    }
    gravados += count ?? 0;
  }
  // O que sumiu do calendário foi desmarcado no iClinic: vira "cancelado" para não virar
  // consulta fantasma no portal. Trava de segurança: se o calendário veio vazio ou perdeu
  // mais de 40% dos eventos de uma vez, não mexe (provável leitura incompleta do Google).
  const cancelados: string[] = [];
  if (!erros.length) {
    for (const [rotulo, lidos] of lidosPorRotulo) {
      if (!rotulo || !lidos) continue;
      const { data: sobraram } = await client.from("agenda_espelho")
        .select("id").eq("origem", "iclinic").eq("profissional", rotulo).neq("status", "cancelado")
        .gte("dia", deISO).lte("dia", ateISO).lt("sincronizado_em", cargaEm);
      const fora = (sobraram ?? []).map((l: { id: string }) => l.id);
      if (!fora.length) continue;
      if (fora.length > (lidos + fora.length) * 0.4) {
        erros.push(`${rotulo}: ${fora.length} sumiram de uma vez — não cancelei, confira o calendário`);
        continue;
      }
      const { error } = await client.from("agenda_espelho").update({ status: "cancelado", sincronizado_em: cargaEm }).in("id", fora);
      if (error) erros.push(`cancelamento ${rotulo}: ${error.message}`);
      else cancelados.push(`${rotulo}: ${fora.length}`);
    }
  }
  await registrarEvento(client, { chave: "google_agenda", direcao: "ENTRADA", status: erros.length ? "ERRO" : "OK", resumo: `${gravados} evento(s) de ${deISO} a ${ateISO} em ${fontes.length} calendário(s) (${[...lidosPorRotulo].map(([r, n]) => `${r || "sem rótulo"} ${n}`).join(", ")})${cancelados.length ? ` · desmarcados: ${cancelados.join(", ")}` : ""}${erros.length ? ` · erros: ${erros.join(" | ")}` : ""}` });
  const lidos = Object.fromEntries([...lidosPorRotulo].map(([rotulo, n]) => [rotulo || "sem rótulo", n]));
  return json({ ok: erros.length === 0, gravados, lidos, cancelados, de: deISO, ate: ateISO, calendarios: fontes.length, erros });
});
