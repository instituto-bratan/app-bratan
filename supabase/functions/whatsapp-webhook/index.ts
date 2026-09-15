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
        const corpo = msg.type === "text" ? msg.text?.body ?? "" : `[${msg.type}]`;
        const { error } = await client.from("mensagem_whatsapp").insert({ direcao: "ENTRADA", telefone: msg.from, corpo: corpo.slice(0, 4000), status: "RECEBIDA", provider_id: msg.id });
        if (!error) recebidas += 1;
      }
    }
  }
  if (recebidas || statusAtualizados) await registrarEvento(client, { chave: "whatsapp", direcao: "ENTRADA", status: "OK", resumo: `${recebidas} recebida(s) · ${statusAtualizados} status atualizado(s)` });
  return json({ ok: true, recebidas, statusAtualizados });
});
