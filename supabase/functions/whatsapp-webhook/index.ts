// whatsapp-webhook (15/09/2026): a Meta chama aqui. GET = verificação do
// webhook (hub.verify_token); POST = status das mensagens enviadas e mensagens
// recebidas. Publicar com --no-verify-jwt (a Meta não manda JWT do Supabase);
// a segurança é o verify token + a assinatura X-Hub-Signature-256 quando
// WHATSAPP_APP_SECRET estiver configurado.
import { db, json, registrarEvento } from "../_shared/integracoes.ts";

async function assinaturaConfere(request: Request, bruto: string) {
  const segredo = Deno.env.get("WHATSAPP_APP_SECRET");
  if (!segredo) return true; // sem segredo do app, aceita (o verify token já protege a inscrição)
  const header = request.headers.get("x-hub-signature-256") ?? "";
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(bruto));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return header === `sha256=${hex}`;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const desafio = url.searchParams.get("hub.challenge") ?? "";
    if (modo === "subscribe" && token && token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) return new Response(desafio, { status: 200 });
    return new Response("verify token inválido", { status: 403 });
  }
  if (request.method !== "POST") return json({ error: "use GET ou POST" }, 405);

  const bruto = await request.text();
  if (!(await assinaturaConfere(request, bruto))) return json({ error: "assinatura inválida" }, 401);
  let body: { entry?: { changes?: { value?: Record<string, unknown> }[] }[] } = {};
  try {
    body = JSON.parse(bruto);
  } catch {
    return json({ ok: true });
  }
  const client = db();
  let recebidas = 0;
  let statusAtualizados = 0;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const st of (value.statuses as { id: string; status: string; errors?: unknown[] }[] | undefined) ?? []) {
        const mapa: Record<string, string> = { sent: "ENVIADA", delivered: "ENTREGUE", read: "LIDA", failed: "ERRO" };
        const { count } = await client
          .from("mensagem_whatsapp")
          .update({ status: mapa[st.status] ?? st.status.toUpperCase(), erro: st.status === "failed" ? JSON.stringify(st.errors ?? []).slice(0, 500) : null, atualizado_em: new Date().toISOString() }, { count: "exact" })
          .eq("provider_id", st.id);
        statusAtualizados += count ?? 0;
      }
      for (const msg of (value.messages as { id: string; from: string; type: string; text?: { body: string }; timestamp?: string }[] | undefined) ?? []) {
        const botao = (msg as { button?: { text?: string; payload?: string }; interactive?: { button_reply?: { title?: string; id?: string } } });
        const corpo = msg.type === "text" ? msg.text?.body ?? "" : msg.type === "button" ? botao.button?.text ?? botao.button?.payload ?? "[button]" : msg.type === "interactive" ? botao.interactive?.button_reply?.title ?? "[interactive]" : `[${msg.type}]`;
        const { error } = await client.from("mensagem_whatsapp").insert({ direcao: "ENTRADA", telefone: msg.from, corpo: corpo.slice(0, 4000), status: "RECEBIDA", provider_id: msg.id });
        if (!error) recebidas += 1;
        // CONFIRMAÇÃO EM DOIS TOQUES (15/09/2026): "1"/"confirmo"/"sim" confirma; "2"/"remarcar" pede remarcação.
        const t = corpo.trim().toLowerCase();
        const confirma = /^(1|sim|confirmo|confirmar|confirmado|ok)\b/.test(t);
        const remarca = /^(2|remarcar|reagendar|não posso|nao posso|cancelar)\b/.test(t);
        if (confirma || remarca) {
          const { data: ultima } = await client.from("mensagem_whatsapp").select("task_ref").eq("telefone", msg.from).eq("direcao", "SAIDA").like("task_ref", "agenda:%").order("criado_em", { ascending: false }).limit(1).maybeSingle();
          const agendaId = ultima?.task_ref?.replace("agenda:", "");
          if (agendaId) {
            await client.from("agenda_espelho").update({ confirmacao_status: confirma ? "CONFIRMADA" : "REMARCAR", respondido_em: new Date().toISOString() }).eq("id", agendaId);
            if (remarca) {
              const { data: ag } = await client.from("agenda_espelho").select("paciente, inicio, profissional").eq("id", agendaId).maybeSingle();
              await client.from("achado_diario").upsert({ chave: `remarcar:${agendaId}`, tipo: "REMARCAR", dia: new Date().toISOString().slice(0, 10), titulo: `${ag?.paciente ?? "Paciente"} pediu para remarcar`, detalhe: `Consulta de ${ag?.inicio ? new Date(ag.inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "?"} com ${ag?.profissional ?? "—"} — horário libera para a lista de espera`, href: "/acompanhamento", urgencia: 1, cargos: ["recepcionista", "secretaria_executiva", "gestor"], quantidade: 1, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
            }
          }
        }
      }
    }
  }
  if (recebidas || statusAtualizados) await registrarEvento(client, { chave: "whatsapp", direcao: "ENTRADA", status: "OK", resumo: `${recebidas} recebida(s) · ${statusAtualizados} status atualizado(s)` });
  return json({ ok: true, recebidas, statusAtualizados });
});
