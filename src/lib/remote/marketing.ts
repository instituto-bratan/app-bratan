// Marketing: briefing do mês e o plano de conteúdo lido pela IA.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import type { Colaborador } from "@/types/database";
import { publicUrlSafeName, requireSupabase, safeWriteRemoteAuditEvent, uuidOrNull } from "./base";

// ---------------------------------------------------------------------------
// Marketing: briefing do mês (foto/PDF) + plano de conteúdo preenchido pela IA.

export type MarketingPiece = {
  id: string;
  date: string;
  format: string;
  title: string;
  notes?: string;
  status: "A_PRODUZIR" | "GRAVADO" | "EDITADO" | "POSTADO";
};

// Detalhe rico do briefing (estilo painel executivo). Tudo opcional p/ compatibilidade
// com planos antigos gerados pela IA (que só tinham summary/cadence/weeklyThemes/pieces).
export type MarketingAnchor = { title: string; description: string };
export type MarketingCadenceTotal = { format: string; count: string; detail?: string };
export type MarketingLegendItem = { format: string; role: string };
export type MarketingCalendarItem = { format: string; title: string };
export type MarketingCalendarDay = { day: number; week?: string; rest?: boolean; items: MarketingCalendarItem[] };
export type MarketingStoryBlock = { n: number; title: string; description: string };
export type MarketingReel = { n: number; title: string; description?: string; cta?: string };
export type MarketingCarrossel = { n: number; telas?: number; title: string; roteiro?: string; tag?: string };
export type MarketingWeek = {
  id: string;
  label: string;
  dateRange?: string;
  theme: string;
  angle?: string;
  mediaHook?: string;
  reels?: MarketingReel[];
  carrosseis?: MarketingCarrossel[];
  youtube?: { title: string; description?: string };
  stories?: string;
};
export type MarketingProductionNote = { title: string; description: string };

export type MarketingPlan = {
  monthRef: string;
  monthLabel?: string;
  title?: string;
  subtitle?: string;
  summary?: string;
  cadence: { format: string; target: string }[];
  weeklyThemes: { week: number; theme: string; notes?: string }[];
  pieces: MarketingPiece[];
  // Campos do briefing completo (opcionais).
  cadenceHeader?: { format: string; target: string }[];
  howToUse?: string;
  climate?: { intro?: string; anchors: MarketingAnchor[] };
  cadenceTotals?: MarketingCadenceTotal[];
  legend?: MarketingLegendItem[];
  calendar?: MarketingCalendarDay[];
  storiesEngine?: MarketingStoryBlock[];
  weeks?: MarketingWeek[];
  production?: MarketingProductionNote[];
  generatedAt?: string;
  generatedBy?: string;
};

export type MarketingBriefing = {
  id: string;
  monthRef: string;
  sourcePath?: string;
  sourceFilename?: string;
  status: "PENDENTE" | "PROCESSANDO" | "PROCESSADO" | "ERRO";
  errorDetail?: string;
  content?: MarketingPlan;
  createdAt: string;
};

export async function listRemoteMarketingBriefings(): Promise<MarketingBriefing[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("marketing_briefings")
    .select("id, month_ref, source_path, source_filename, status, error_detail, content, created_at")
    .order("month_ref", { ascending: false })
    .limit(60);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    monthRef: String(row.month_ref),
    sourcePath: (row.source_path as string) ?? undefined,
    sourceFilename: (row.source_filename as string) ?? undefined,
    status: row.status as MarketingBriefing["status"],
    errorDetail: (row.error_detail as string) ?? undefined,
    content: (row.content as MarketingPlan) ?? undefined,
    createdAt: String(row.created_at),
  }));
}

export async function uploadRemoteMarketingBriefing(values: {
  pessoa: Colaborador;
  file: File;
  monthRef: string;
}): Promise<string> {
  const client = requireSupabase();
  const id = crypto.randomUUID();
  const safeName = publicUrlSafeName(values.file.name) || "briefing";
  const storagePath = `${values.monthRef}/${id}-${safeName}`;

  const { error: storageError } = await client.storage.from("marketing-briefings").upload(storagePath, values.file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (storageError) throw storageError;

  const { error: insertError } = await client.from("marketing_briefings").insert({
    id,
    month_ref: values.monthRef,
    source_path: storagePath,
    source_filename: values.file.name,
    source_mime: values.file.type || "application/octet-stream",
    status: "PENDENTE",
    created_by: uuidOrNull(values.pessoa.id),
  });
  if (insertError) {
    await client.storage.from("marketing-briefings").remove([storagePath]);
    throw insertError;
  }

  await safeWriteRemoteAuditEvent({
    action: "marketing.briefing.enviar",
    entity: "marketing_briefings",
    entityId: id,
    metadata: { monthRef: values.monthRef, filename: values.file.name },
  });
  return id;
}

export async function invokeRemoteMarketingBriefingParse(briefingId: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("marketing-briefing-parse", {
    body: { briefingId },
  });
  if (error) throw error;
  return data as { configured: boolean; ok?: boolean; pieces?: number; error?: string };
}

export async function updateRemoteMarketingBriefingContent(id: string, content: MarketingPlan) {
  const client = requireSupabase();
  const { error } = await client
    .from("marketing_briefings")
    .update({ content, status: "PROCESSADO", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "marketing.plano.editar",
    entity: "marketing_briefings",
    entityId: id,
    metadata: { pieces: content.pieces?.length ?? 0 },
  });
}

export async function deleteRemoteMarketingBriefing(id: string, storagePath?: string) {
  const client = requireSupabase();
  if (storagePath) {
    await client.storage.from("marketing-briefings").remove([storagePath]);
  }
  const { error } = await client.from("marketing_briefings").delete().eq("id", id);
  if (error) throw error;
  await safeWriteRemoteAuditEvent({ action: "marketing.briefing.excluir", entity: "marketing_briefings", entityId: id });
}

export async function getRemoteMarketingBriefingUrl(storagePath: string) {
  const client = requireSupabase();
  const { data, error } = await client.storage.from("marketing-briefings").createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

// Exclusão definitiva de um lead do CRM: sem isso, o upsert do sync nunca
// apaga nada e o lead "ressuscita" no próximo carregamento.
