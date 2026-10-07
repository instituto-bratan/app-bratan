// SHAREPOINT PELO MICROSOFT GRAPH — o que mais de uma função precisa (07/10/2026).
//
// A sharepoint-dispatch sobe os arquivos; a focus-nfse, ao cancelar uma nota,
// precisa RENOMEAR os arquivos dela para "… - CANCELADA" (pedido do Lucas: a
// nota cancelada ficava na pasta com o nome normal e parecia duplicata da
// reemitida). Os segredos são os mesmos do projeto (MS_*, SHAREPOINT_DRIVE_ID).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export type GraphConfig = { tenantId: string; clientId: string; clientSecret: string; driveId: string };

export function graphConfig(): GraphConfig | null {
  const cfg = {
    tenantId: Deno.env.get("MS_TENANT_ID") ?? "",
    clientId: Deno.env.get("MS_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("MS_CLIENT_SECRET") ?? "",
    driveId: Deno.env.get("SHAREPOINT_DRIVE_ID") ?? "",
  };
  return cfg.tenantId && cfg.clientId && cfg.clientSecret && cfg.driveId ? cfg : null;
}

export async function graphToken(cfg: GraphConfig) {
  const resposta = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!resposta.ok) throw new Error(`Token do Microsoft Graph falhou (${resposta.status}).`);
  return String(((await resposta.json()) as { access_token?: string }).access_token ?? "");
}

/** "NF 6231 - NATAN MOURA - R$ 9.149,00.pdf" → "NF 6231 - NATAN MOURA - R$ 9.149,00 - CANCELADA.pdf" */
export function nomeCancelado(nome: string) {
  if (/CANCELADA/i.test(nome)) return nome;
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? `${nome.slice(0, ponto)} - CANCELADA${nome.slice(ponto)}` : `${nome} - CANCELADA`;
}

/**
 * Marca no SharePoint os arquivos de uma nota cancelada. Arquivo já enviado é
 * renomeado lá (PATCH name); arquivo ainda na fila só troca de nome na fila, e
 * sobe já como CANCELADA. Nunca derruba quem chamou: devolve o que conseguiu.
 */
export async function marcarNotaCanceladaNoSharePoint(client: SupabaseClient, ref: string) {
  const { data: linhas } = await client
    .from("sharepoint_dispatch_queue")
    .select("id, status, file_name, sharepoint_item_id")
    .eq("module", "NOTA_EMITIDA")
    .eq("entity_id", ref)
    .neq("status", "SKIPPED");
  let renomeados = 0;
  const erros: string[] = [];
  const cfg = graphConfig();
  let token = "";
  for (const linha of (linhas ?? []) as { id: string; status: string; file_name: string; sharepoint_item_id: string | null }[]) {
    const novo = nomeCancelado(linha.file_name);
    if (novo === linha.file_name) continue;
    try {
      if (linha.status === "SENT" && linha.sharepoint_item_id) {
        if (!cfg) throw new Error("SharePoint sem segredos configurados");
        token ||= await graphToken(cfg);
        const r = await fetch(`${GRAPH_BASE}/drives/${cfg.driveId}/items/${linha.sharepoint_item_id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: novo }),
        });
        if (!r.ok) throw new Error(`renomear falhou (${r.status})`);
        const item = (await r.json()) as { webUrl?: string };
        await client.from("sharepoint_dispatch_queue").update({ file_name: novo, sharepoint_web_url: String(item.webUrl ?? "") }).eq("id", linha.id);
      } else {
        await client.from("sharepoint_dispatch_queue").update({ file_name: novo }).eq("id", linha.id);
      }
      renomeados += 1;
    } catch (falha) {
      erros.push(`${linha.file_name}: ${(falha as Error)?.message ?? String(falha)}`);
    }
  }
  return { renomeados, erros };
}
