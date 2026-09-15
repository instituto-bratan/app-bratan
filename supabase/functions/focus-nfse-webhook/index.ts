// focus-nfse-webhook (15/09/2026): a Focus avisa quando a prefeitura autoriza,
// rejeita ou cancela a nota. Publicar com --no-verify-jwt; proteger com
// ?token=<FOCUS_WEBHOOK_TOKEN> na URL cadastrada na Focus.
import { db, json, registrarEvento } from "../_shared/integracoes.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const esperado = Deno.env.get("FOCUS_WEBHOOK_TOKEN");
  if (esperado && new URL(request.url).searchParams.get("token") !== esperado) return json({ error: "token inválido" }, 401);
  const dados = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ref = String(dados.ref ?? "");
  if (!ref) return json({ ok: true, ignorado: true });
  const client = db();
  const status = String(dados.status ?? "").toUpperCase() || "ATUALIZADA";
  await client
    .from("nfse_emissao")
    .update({ status, numero: (dados.numero as string) ?? undefined, url_pdf: (dados.url as string) ?? (dados.caminho_xml_nota_fiscal as string) ?? undefined, resposta: dados, erro: status.includes("ERRO") ? JSON.stringify(dados.erros ?? dados).slice(0, 500) : null, atualizado_em: new Date().toISOString() })
    .eq("ref", ref);
  await registrarEvento(client, { chave: "focus_nfse", direcao: "ENTRADA", entidade: "nfse_emissao", entityRef: ref, status, resumo: `Webhook: ${ref} → ${status}` });
  return json({ ok: true });
});
