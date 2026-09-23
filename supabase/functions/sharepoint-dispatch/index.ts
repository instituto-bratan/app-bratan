// sharepoint-dispatch: processa a fila sharepoint_dispatch_queue e envia os
// arquivos do Storage para as pastas certas do SharePoint via Microsoft Graph.
//
// Segredos necessários (supabase secrets set ...):
//   MS_TENANT_ID          - Directory (tenant) ID do app registrado no Azure AD
//   MS_CLIENT_ID          - Application (client) ID
//   MS_CLIENT_SECRET      - Client secret (permissão de aplicação Sites.ReadWrite.All com admin consent)
//   SHAREPOINT_DRIVE_ID   - ID do drive (biblioteca de documentos) de destino
//   SHAREPOINT_ROOT_FOLDER (opcional) - prefixo de pasta, ex.: "APP BRATAN"
//
// Sem os segredos configurados, a função responde com configured:false e não altera a fila.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { pastaDoArquivo } from "../_shared/pastaPorTipo.ts";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
const CHUNK_SIZE = 5 * 1024 * 1024;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;

type QueueRow = {
  id: string;
  module?: string | null;
  entity_id?: string | null;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  target_folder: string;
  attempts: number;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function sanitizeFileName(name: string) {
  const cleaned = (name || "arquivo")
    .replace(/["*:<>?/\\|#%]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return cleaned || "arquivo";
}

async function getGraphToken(tenantId: string, clientId: string, clientSecret: string) {
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token do Microsoft Graph falhou (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.access_token as string;
}

function encodeDrivePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

// Garante que a hierarquia de pastas exista antes do upload. As pastas base já
// existem no SharePoint do Instituto; isto cobre as subpastas de ano/mês.
async function ensureFolderPath(token: string, driveId: string, folderPath: string, cache: Set<string>) {
  const segments = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    const parent = current;
    current = current ? `${current}/${segment}` : segment;
    if (cache.has(current)) continue;

    const check = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodeDrivePath(current)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (check.ok) {
      cache.add(current);
      continue;
    }
    if (check.status !== 404) {
      throw new Error(`Consulta da pasta "${current}" falhou (${check.status}): ${await check.text()}`);
    }

    const createUrl = parent
      ? `${GRAPH_BASE}/drives/${driveId}/root:/${encodeDrivePath(parent)}:/children`
      : `${GRAPH_BASE}/drives/${driveId}/root/children`;
    const created = await fetch(createUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: segment, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (!created.ok && created.status !== 409) {
      throw new Error(`Criação da pasta "${current}" falhou (${created.status}): ${await created.text()}`);
    }
    cache.add(current);
  }
}

async function uploadSmallFile(token: string, driveId: string, drivePath: string, bytes: Uint8Array, mimeType: string) {
  const response = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/root:/${encodeDrivePath(drivePath)}:/content?@microsoft.graph.conflictBehavior=rename`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType || "application/octet-stream" },
      body: bytes,
    },
  );

  if (!response.ok) {
    throw new Error(`Upload simples falhou (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function uploadLargeFile(token: string, driveId: string, drivePath: string, bytes: Uint8Array) {
  const sessionResponse = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/root:/${encodeDrivePath(drivePath)}:/createUploadSession`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
    },
  );

  if (!sessionResponse.ok) {
    throw new Error(`Sessão de upload falhou (${sessionResponse.status}): ${await sessionResponse.text()}`);
  }

  const { uploadUrl } = await sessionResponse.json();
  let uploaded: Record<string, unknown> | null = null;

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
    const end = offset + chunk.length - 1;
    const chunkResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${offset}-${end}/${bytes.length}`,
      },
      body: chunk,
    });

    if (!chunkResponse.ok && chunkResponse.status !== 202) {
      throw new Error(`Chunk ${offset}-${end} falhou (${chunkResponse.status}): ${await chunkResponse.text()}`);
    }
    if (chunkResponse.status === 200 || chunkResponse.status === 201) {
      uploaded = await chunkResponse.json();
    }
  }

  if (!uploaded) throw new Error("Upload em sessão terminou sem item retornado.");
  return uploaded;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const tenantId = Deno.env.get("MS_TENANT_ID") ?? "";
  const clientId = Deno.env.get("MS_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET") ?? "";
  const driveId = Deno.env.get("SHAREPOINT_DRIVE_ID") ?? "";
  const rootFolder = (Deno.env.get("SHAREPOINT_ROOT_FOLDER") ?? "").replace(/^\/+|\/+$/g, "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  if (!tenantId || !clientId || !clientSecret || !driveId) {
    return json({
      configured: false,
      message:
        "Fila preservada. Configure MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET e SHAREPOINT_DRIVE_ID via supabase secrets set para ativar o envio.",
    });
  }

  // MOVER POR TIPO (pedido do Lucas, 23/09/2026): as notas que já estavam na
  // pasta do mês vão para "PDF" ou "XML" dentro dela. Move o item no próprio
  // SharePoint (PATCH parentReference), sem baixar nem subir de novo, e
  // registra a pasta nova na fila. Só roda quando pedido no corpo.
  const pedido = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (pedido.acao === "mover_por_tipo") {
    const limite = Math.min(120, Math.max(1, Number(pedido.limite ?? 60)));
    const { data: enviados, error: erroLista } = await supabase
      .from("sharepoint_dispatch_queue")
      .select("id, file_name, mime_type, target_folder, sharepoint_item_id, module")
      .eq("status", "SENT")
      .in("module", ["NOTA_RECEBIDA", "NOTA_EMITIDA", "NOTA_FISCAL_DESPESA"])
      .not("sharepoint_item_id", "is", null)
      .neq("sharepoint_item_id", "")
      .not("target_folder", "like", "%/PDF")
      .not("target_folder", "like", "%/XML")
      .order("created_at", { ascending: true })
      .limit(limite);
    if (erroLista) return json({ error: erroLista.message }, 500);
    if (!enviados?.length) return json({ configured: true, movidos: 0, message: "Nada para mover." });
    let token: string;
    try {
      token = await getGraphToken(tenantId, clientId, clientSecret);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 502);
    }
    const cache = new Set<string>();
    const idsDePasta = new Map<string, string>();
    let movidos = 0;
    let pulados = 0;
    const erros: string[] = [];
    for (const linha of enviados as { id: string; file_name: string; mime_type: string; target_folder: string; sharepoint_item_id: string }[]) {
      const destino = pastaDoArquivo(linha.target_folder, linha.mime_type || linha.file_name);
      if (destino === linha.target_folder) {
        pulados += 1;
        continue;
      }
      try {
        const caminho = rootFolder ? `${rootFolder}/${destino}` : destino;
        await ensureFolderPath(token, driveId, caminho, cache);
        let idPasta = idsDePasta.get(caminho);
        if (!idPasta) {
          const r = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodeDrivePath(caminho)}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) throw new Error(`pasta "${caminho}" não encontrada (${r.status})`);
          idPasta = String(((await r.json()) as { id?: string }).id ?? "");
          if (!idPasta) throw new Error(`pasta "${caminho}" sem id`);
          idsDePasta.set(caminho, idPasta);
        }
        const mv = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${linha.sharepoint_item_id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ parentReference: { id: idPasta }, "@microsoft.graph.conflictBehavior": "replace" }),
        });
        if (!mv.ok) throw new Error(`mover falhou (${mv.status}): ${(await mv.text()).slice(0, 200)}`);
        const item = (await mv.json()) as { webUrl?: string };
        await supabase.from("sharepoint_dispatch_queue").update({ target_folder: destino, sharepoint_web_url: String(item.webUrl ?? "") }).eq("id", linha.id);
        movidos += 1;
      } catch (error) {
        erros.push(`${linha.file_name}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 220));
      }
    }
    return json({ configured: true, movidos, pulados, erros, restantes: enviados.length === limite });
  }

  const { data: pending, error: queueError } = await supabase
    .from("sharepoint_dispatch_queue")
    .select("id, storage_bucket, storage_path, file_name, mime_type, target_folder, attempts, module, entity_id")
    .eq("status", "PENDING")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queueError) return json({ error: queueError.message }, 500);
  if (!pending?.length) return json({ configured: true, processed: 0, message: "Fila vazia." });

  let token: string;
  try {
    token = await getGraphToken(tenantId, clientId, clientSecret);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];
  const folderCache = new Set<string>();

  for (const row of pending as QueueRow[]) {
    await supabase
      .from("sharepoint_dispatch_queue")
      .update({ status: "PROCESSING", attempts: row.attempts + 1 })
      .eq("id", row.id);

    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(row.storage_bucket)
        .download(row.storage_path);
      if (downloadError || !blob) {
        throw new Error(`Download do Storage falhou: ${downloadError?.message ?? "arquivo vazio"}`);
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const folder = rootFolder ? `${rootFolder}/${row.target_folder}` : row.target_folder;
      const drivePath = `${folder}/${sanitizeFileName(row.file_name)}`;

      await ensureFolderPath(token, driveId, folder, folderCache);

      const item =
        bytes.length <= SIMPLE_UPLOAD_LIMIT
          ? await uploadSmallFile(token, driveId, drivePath, bytes, row.mime_type)
          : await uploadLargeFile(token, driveId, drivePath, bytes);

      await supabase
        .from("sharepoint_dispatch_queue")
        .update({
          status: "SENT",
          sent_at: new Date().toISOString(),
          last_error: "",
          sharepoint_item_id: String((item as Record<string, unknown>).id ?? ""),
          sharepoint_web_url: String((item as Record<string, unknown>).webUrl ?? ""),
        })
        .eq("id", row.id);
      results.push({ id: row.id, status: "SENT" });
      // O registro do comprovante guarda o status do SharePoint (14/09/2026:
      // 190 comprovantes diziam "pendente" com a fila já em SENT — a coluna
      // nunca era atualizada). Falha aqui não desfaz o envio.
      if (row.module === "COMPROVANTE" && row.entity_id) {
        await supabase.from("comprovante").update({ sharepoint_status: "enviado" }).eq("id", row.entity_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = row.attempts + 1 >= MAX_ATTEMPTS;
      await supabase
        .from("sharepoint_dispatch_queue")
        .update({ status: exhausted ? "FAILED" : "PENDING", last_error: message.slice(0, 900) })
        .eq("id", row.id);
      results.push({ id: row.id, status: exhausted ? "FAILED" : "RETRY", error: message });
    }
  }

  return json({
    configured: true,
    processed: results.length,
    sent: results.filter((item) => item.status === "SENT").length,
    results,
  });
});
