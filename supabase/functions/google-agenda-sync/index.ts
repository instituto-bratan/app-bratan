// google-agenda-sync (15/09/2026): lê o calendário "Agenda iClinic" do Google
// (o iClinic sincroniza para lá sozinho, só de ida) e grava em agenda_espelho com
// origem 'iclinic'. Não precisa de API do iClinic nem de conta Google no servidor:
// usa o ENDEREÇO PRIVADO iCal do calendário, guardado como segredo
// GOOGLE_AGENDA_ICS (uma ou mais URLs separadas por ";" — opcionalmente
// "Nome do profissional=URL"). Expande recorrências dentro da janela.
// Desligada por padrão; roda no cron das agendas e pelo botão da tela.
//
// 29/09/2026 — a leitura do arquivo foi para _shared/agendaIcs.ts (com teste) e a
// gravação deixou de perder dia: (1) nenhum origem_id repetido vai no mesmo
// lote (o Postgres recusava o lote INTEIRO); (2) lote recusado é regravado linha
// a linha em vez de parar tudo (antes, `break` jogava fora todos os lotes
// seguintes); (3) Google respondendo 429/5xx ganha uma segunda tentativa;
// (4) a resposta e o log dizem, por calendário, o que o arquivo traz (só
// contagens: procedimento, cor, descrição) — sem nome de paciente.
import { agoraBrasiliaISO, corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";
import { censoDoCalendario, linhasParaOEspelho, parseICS, type EventoIcs } from "../_shared/agendaIcs.ts";
import { COORDENACAO, exigirAcesso } from "../_shared/guarda.ts";

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function baixar(url: string): Promise<string> {
  for (let tentativa = 1; ; tentativa += 1) {
    const r = await fetch(url, { headers: { "User-Agent": "app-bratan/agenda-espelho" } });
    if (r.ok) return await r.text();
    if (tentativa >= 2 || !(r.status === 429 || r.status >= 500)) throw new Error(`HTTP ${r.status}`);
    await esperar(3000);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  // Quem pode chamar (29/09/2026, auditoria S1): o cron de hora em hora ou a coordenação (botão em Integrações).
  // A chave anônima do site NÃO basta mais — ver _shared/guarda.ts.
  const acesso = await exigirAcesso(request, { cargos: COORDENACAO, cron: true, automatico: true });
  if (!acesso.ok) return acesso.resposta;
  const client = db();
  const integracao = await lerIntegracao(client, "google_agenda");
  if (!integracao.ligada) return respostaDesligada("google_agenda");
  const faltam = segredosFaltando(["GOOGLE_AGENDA_ICS"]);
  if (faltam.length) return respostaSemSegredos("google_agenda", faltam);
  const entrada = await corpo<{ de?: string; ate?: string }>(request);
  const hoje = agoraBrasiliaISO();
  const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const valida = (dia?: string) => (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : undefined);
  const deISO = valida(entrada.de) ?? somaDias(hoje, -Number(integracao.config.diasParaTras ?? 2));
  const ateISO = valida(entrada.ate) ?? somaDias(hoje, Number(integracao.config.diasParaFrente ?? 120));
  const de = new Date(`${deISO}T00:00:00-03:00`);
  const ate = new Date(`${ateISO}T23:59:59-03:00`);
  const fontes = (Deno.env.get("GOOGLE_AGENDA_ICS") ?? "").split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^([^=]+)=(https?:\/\/.+)$/.exec(s);
    return m ? { rotulo: m[1].trim(), url: m[2].trim() } : { rotulo: "", url: s };
  });
  const rotulos = (integracao.config.rotulos as Record<string, string>) ?? {};
  let gravados = 0;
  const erros: string[] = [];
  const cargaEm = new Date().toISOString();
  const lidosPorRotulo = new Map<string, number>();
  const censo: Record<string, Record<string, number>> = {};
  const cargas: { rotulo: string; eventos: EventoIcs[] }[] = [];
  const rotulosComErro = new Set<string>();
  for (const fonte of fontes) {
    const nome = fonte.rotulo || "sem rótulo";
    try {
      const ics = await baixar(fonte.url);
      const eventos = parseICS(ics, de, ate);
      censo[nome] = censoDoCalendario(ics);
      lidosPorRotulo.set(fonte.rotulo, (lidosPorRotulo.get(fonte.rotulo) ?? 0) + eventos.length);
      cargas.push({ rotulo: fonte.rotulo, eventos });
    } catch (erro) {
      rotulosComErro.add(fonte.rotulo);
      // Nunca a URL inteira no log: ela é o segredo.
      erros.push(`${fonte.rotulo || "calendário sem rótulo"}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  const { linhas, repetidos } = linhasParaOEspelho(cargas, cargaEm, rotulos);
  let linhasRecusadas = 0;
  for (let i = 0; i < linhas.length; i += 200) {
    const lote = linhas.slice(i, i + 200);
    const { error, count } = await client.from("agenda_espelho").upsert(lote, { onConflict: "origem,origem_id", count: "exact" });
    if (!error) {
      gravados += count ?? lote.length;
      continue;
    }
    // Lote recusado: tenta uma a uma, para uma linha ruim não levar o dia junto.
    let recusadasNoLote = 0;
    for (const linha of lote) {
      const r = await client.from("agenda_espelho").upsert(linha, { onConflict: "origem,origem_id" });
      if (r.error) recusadasNoLote += 1;
      else gravados += 1;
    }
    linhasRecusadas += recusadasNoLote;
    if (recusadasNoLote) erros.push(`gravação: ${recusadasNoLote} consulta(s) recusada(s) pelo banco (${error.message.slice(0, 120)})`);
  }
  // O que sumiu do calendário foi desmarcado no iClinic: vira "cancelado" para não virar
  // consulta fantasma no portal. Trava de segurança: se o calendário veio vazio ou perdeu
  // mais de 40% dos eventos de uma vez, não mexe (provável leitura incompleta do Google).
  // Com qualquer erro na carga, ninguém é cancelado (a falta pode ser nossa).
  const cancelados: string[] = [];
  if (!erros.length) {
    for (const [rotulo, lidos] of lidosPorRotulo) {
      if (!rotulo || !lidos || rotulosComErro.has(rotulo)) continue;
      const { data: sobraram } = await client.from("agenda_espelho")
        .select("id").eq("origem", "iclinic").eq("profissional", rotulo).neq("status", "cancelado")
        .gte("dia", deISO).lte("dia", ateISO).lt("sincronizado_em", cargaEm).limit(5000);
      const fora = (sobraram ?? []).map((l: { id: string }) => l.id);
      if (!fora.length) continue;
      if (fora.length > (lidos + fora.length) * 0.4) {
        erros.push(`${rotulo}: ${fora.length} sumiram de uma vez — não cancelei, confira o calendário`);
        continue;
      }
      for (let i = 0; i < fora.length; i += 150) {
        const { error } = await client.from("agenda_espelho").update({ status: "cancelado", sincronizado_em: cargaEm }).in("id", fora.slice(i, i + 150));
        if (error) erros.push(`cancelamento ${rotulo}: ${error.message}`);
      }
      cancelados.push(`${rotulo}: ${fora.length}`);
    }
  }
  const lidos = Object.fromEntries([...lidosPorRotulo].map(([rotulo, n]) => [rotulo || "sem rótulo", n]));
  await registrarEvento(client, {
    chave: "google_agenda",
    direcao: "ENTRADA",
    status: erros.length ? "ERRO" : "OK",
    resumo: `${gravados} evento(s) de ${deISO} a ${ateISO} em ${fontes.length} calendário(s) (${[...lidosPorRotulo].map(([r, n]) => `${r || "sem rótulo"} ${n}`).join(", ")})${repetidos ? ` · ${repetidos} repetido(s) juntado(s)` : ""}${cancelados.length ? ` · desmarcados: ${cancelados.join(", ")}` : ""}${erros.length ? ` · erros: ${erros.join(" | ")}` : ""}`,
    detalhe: { lidos, censo, repetidos, linhasRecusadas, de: deISO, ate: ateISO },
  });
  return json({ ok: erros.length === 0, gravados, lidos, censo, repetidos, linhasRecusadas, cancelados, de: deISO, ate: ateISO, calendarios: fontes.length, erros });
});
