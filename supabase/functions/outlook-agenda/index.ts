// outlook-agenda (15/09/2026, proposta 3.6): copia um calendário do Microsoft
// 365 (caixa compartilhada, ex.: agenda@institutobratan.com.br) para
// agenda_espelho, com as mesmas credenciais de aplicativo do SharePoint
// (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET — o app precisa da permissão
// Calendars.Read de aplicativo). Desligada por padrão.
import { agoraBrasiliaISO, corpo, db, json, lerIntegracao, registrarEvento, respostaDesligada, respostaSemSegredos, segredosFaltando } from "../_shared/integracoes.ts";

const somaDias = (dia: string, n: number) => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

async function tokenGraph() {
  const tenant = Deno.env.get("MS_TENANT_ID");
  const body = new URLSearchParams({ client_id: Deno.env.get("MS_CLIENT_ID") ?? "", client_secret: Deno.env.get("MS_CLIENT_SECRET") ?? "", scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: "POST", body });
  const d = (await r.json()) as { access_token?: string; error_description?: string };
  if (!d.access_token) throw new Error(d.error_description ?? "sem access_token");
  return d.access_token;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  const client = db();
  const integracao = await lerIntegracao(client, "outlook");
  if (!integracao.ligada) return respostaDesligada("outlook");
  const faltam = segredosFaltando(["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET"]);
  if (faltam.length) return respostaSemSegredos("outlook", faltam);
  const caixa = String(integracao.config.caixaDeCorreio ?? "");
  if (!caixa) return json({ ok: false, error: "Configure caixaDeCorreio na integração (e-mail do calendário)." }, 400);
  const entrada = await corpo<{ de?: string; ate?: string }>(request);
  const de = entrada.de ?? somaDias(agoraBrasiliaISO(), -1);
  const ate = entrada.ate ?? somaDias(agoraBrasiliaISO(), Number(integracao.config.diasParaFrente ?? 30));
  try {
    const token = await tokenGraph();
    let url: string | null = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(caixa)}/calendarView?startDateTime=${de}T00:00:00-03:00&endDateTime=${ate}T23:59:59-03:00&$top=200&$select=id,subject,start,end,location,showAs,isCancelled,categories`;
    let gravados = 0;
    while (url) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="America/Sao_Paulo"' } });
      const d = (await r.json()) as { value?: Record<string, unknown>[]; "@odata.nextLink"?: string; error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? `HTTP ${r.status}`);
      const linhas = (d.value ?? []).map((ev) => {
        const start = (ev.start as { dateTime: string }).dateTime;
        const end = (ev.end as { dateTime: string }).dateTime;
        const inicio = new Date(`${start.slice(0, 19)}-03:00`);
        const fim = new Date(`${end.slice(0, 19)}-03:00`);
        return {
          origem: "outlook",
          origem_id: String(ev.id),
          dia: start.slice(0, 10),
          inicio: inicio.toISOString(),
          fim: fim.toISOString(),
          minutos: Math.round((fim.getTime() - inicio.getTime()) / 60_000),
          sala: ((ev.location as { displayName?: string })?.displayName ?? "") || null,
          profissional: ((ev.categories as string[]) ?? [])[0] ?? null,
          paciente: String(ev.subject ?? "") || null,
          tipo: String(ev.showAs ?? "") || null,
          status: ev.isCancelled ? "cancelado" : "agendado",
          sincronizado_em: new Date().toISOString(),
        };
      });
      if (linhas.length) {
        const { error, count } = await client.from("agenda_espelho").upsert(linhas, { onConflict: "origem,origem_id", count: "exact" });
        if (error) throw new Error(error.message);
        gravados += count ?? 0;
      }
      url = d["@odata.nextLink"] ?? null;
    }
    await registrarEvento(client, { chave: "outlook", direcao: "ENTRADA", status: "OK", resumo: `${gravados} evento(s) de ${de} a ${ate} (${caixa})` });
    return json({ ok: true, gravados, de, ate });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    await registrarEvento(client, { chave: "outlook", direcao: "ENTRADA", status: "ERRO", resumo: msg });
    return json({ ok: false, error: msg });
  }
});
