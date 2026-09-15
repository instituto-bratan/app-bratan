// feegow-sync (15/09/2026, proposta 3.5): copia os agendamentos do Feegow para
// agenda_espelho (próximos N dias) — ocupação de sala real, confirmação de
// consulta e a agenda do dia sem digitar. Usa a API pública do Feegow
// (https://api.feegow.com/v1/api, cabeçalho x-access-token). Desligada por
// padrão; precisa de FEEGOW_TOKEN. Roda pelo cron das 5h30 e pelo botão da tela.
import { agoraBrasiliaISO, corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";

const NOMES_PADRAO: Record<string, string> = { "1": "Dr. Daniel", "15": "Barbara", "16": "Gessica", "19": "Juliana" };
const STATUS: Record<string, string> = { "1": "não confirmado", "7": "confirmado", "3": "atendido", "2": "em atendimento", "4": "aguardando", "208": "aguardando pagamento", "11": "desmarcado", "15": "remarcado", "22": "cancelado", "6": "faltou" };

function pega(obj: Record<string, unknown>, ...chaves: string[]) {
  for (const chave of chaves) if (obj[chave] !== undefined && obj[chave] !== null && obj[chave] !== "") return String(obj[chave]);
  return "";
}
const somaDias = (dia: string, n: number) => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
function dataISO(bruta: string) {
  const m = bruta.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return bruta.slice(0, 10);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  const client = db();
  const integracao = await lerIntegracao(client, "feegow");
  if (!integracao.ligada) return respostaDesligada("feegow");
  const faltam = segredosFaltando(["FEEGOW_TOKEN"]);
  if (faltam.length) return respostaSemSegredos("feegow", faltam);
  const config = integracao.config;
  const entrada = await corpo<{ de?: string; ate?: string }>(request);
  const de = entrada.de ?? somaDias(agoraBrasiliaISO(), -1);
  const ate = entrada.ate ?? somaDias(agoraBrasiliaISO(), Number(config.diasParaFrente ?? 30));
  const nomes = { ...NOMES_PADRAO, ...((config.nomesProfissionais as Record<string, string>) ?? {}) };
  const base = String(config.apiUrl ?? "https://api.feegow.com/v1/api");

  const resposta = await fetch(`${base}/appoints/search?data_start=${de}&data_end=${ate}`, { headers: { "x-access-token": Deno.env.get("FEEGOW_TOKEN") ?? "", Accept: "application/json" } });
  const dados = (await resposta.json().catch(() => ({}))) as { success?: boolean; content?: Record<string, unknown>[]; message?: string };
  if (!resposta.ok || dados.success === false) {
    await registrarEvento(client, { chave: "feegow", direcao: "ENTRADA", status: "ERRO", resumo: `Falha ao ler a agenda: HTTP ${resposta.status} ${dados.message ?? ""}`.trim() });
    return json({ ok: false, error: `Feegow respondeu HTTP ${resposta.status}: ${dados.message ?? ""}` });
  }
  const linhas = (dados.content ?? []).map((item) => {
    const dia = dataISO(pega(item, "data", "date", "data_agendamento"));
    const hora = pega(item, "horario", "hora", "start_time", "horario_inicio").slice(0, 5);
    const fimTxt = pega(item, "horario_fim", "end_time", "hora_fim").slice(0, 5);
    const duracao = Number(pega(item, "duracao", "tempo", "duration")) || 0;
    const inicio = dia && hora ? new Date(`${dia}T${hora}:00-03:00`) : null;
    const fim = inicio ? (fimTxt ? new Date(`${dia}T${fimTxt}:00-03:00`) : new Date(inicio.getTime() + (duracao || 30) * 60_000)) : null;
    const profissionalId = pega(item, "profissional_id", "professional_id", "ProfissionalID");
    return {
      origem: "feegow",
      origem_id: pega(item, "agendamento_id", "id", "AgendamentoID"),
      dia,
      inicio: inicio?.toISOString() ?? null,
      fim: fim?.toISOString() ?? null,
      minutos: inicio && fim ? Math.round((fim.getTime() - inicio.getTime()) / 60_000) : duracao || null,
      sala: pega(item, "local", "sala", "unidade") || null,
      profissional: nomes[profissionalId] ?? (pega(item, "profissional", "nome_profissional") || profissionalId || null),
      paciente: pega(item, "nome_paciente", "paciente", "patient_name") || null,
      tipo: pega(item, "procedimento", "nome_procedimento", "procedure", "tipo") || null,
      status: STATUS[pega(item, "status_id", "StaID")] ?? (pega(item, "status") || null),
    };
  }).filter((l) => l.origem_id && l.dia);
  let gravados = 0;
  for (let i = 0; i < linhas.length; i += 200) {
    const { error, count } = await client.from("agenda_espelho").upsert(linhas.slice(i, i + 200).map((l) => ({ ...l, sincronizado_em: new Date().toISOString() })), { onConflict: "origem,origem_id", count: "exact" });
    if (error) {
      await registrarEvento(client, { chave: "feegow", direcao: "ENTRADA", status: "ERRO", resumo: `Falha ao gravar: ${error.message}` });
      return json({ ok: false, error: error.message });
    }
    gravados += count ?? 0;
  }
  await registrarEvento(client, { chave: "feegow", direcao: "ENTRADA", status: "OK", resumo: `${gravados} agendamento(s) de ${de} a ${ate}` });
  return json({ ok: true, gravados, de, ate });
});
