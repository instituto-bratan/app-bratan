// Estalecas: conquistas com prova.
// Separado de remoteData.ts em 16/09/2026 (proposta 7.4); os imports do app não mudaram.
import type { Colaborador } from "@/types/database";
import type { EstalecaClaim } from "@/features/estalecas/estalecasData";
import { requireSupabase, safeWriteRemoteAuditEvent , publicUrlSafeName } from "./base";

// ---------------- Estalecas: conquistas com prova ----------------

export async function listRemoteEstalecaClaims(): Promise<EstalecaClaim[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("estaleca_claims")
    .select("id, colaborador_id, claim_type, title, description, photo_path, claim_date, amount_suggested, status, review_note, reviewed_at, created_at, colaborador:colaborador_id(nome)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return ((data ?? []) as Record<string, any>[]).map((row) => ({
    id: String(row.id),
    colaboradorId: String(row.colaborador_id),
    colaboradorNome: String(row.colaborador?.nome ?? "Colaborador"),
    claimType: row.claim_type as EstalecaClaim["claimType"],
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    photoPath: String(row.photo_path ?? ""),
    claimDate: String(row.claim_date),
    amountSuggested: Number(row.amount_suggested ?? 0),
    status: row.status as EstalecaClaim["status"],
    reviewNote: String(row.review_note ?? ""),
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function createRemoteEstalecaClaim(values: {
  pessoa: Colaborador;
  claimType: EstalecaClaim["claimType"];
  title: string;
  description: string;
  claimDate: string;
  amountSuggested: number;
  photoFile?: File | null;
}) {
  const client = requireSupabase();
  let photoPath = "";

  if (values.photoFile) {
    const safeName = publicUrlSafeName(values.photoFile.name) || "prova.jpg";
    photoPath = `${values.pessoa.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage.from("estalecas-provas").upload(photoPath, values.photoFile, {
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw uploadError;
  }

  const { error } = await client.from("estaleca_claims").insert({
    colaborador_id: values.pessoa.id,
    claim_type: values.claimType,
    title: values.title,
    description: values.description,
    photo_path: photoPath,
    claim_date: values.claimDate,
    amount_suggested: values.amountSuggested,
  });
  if (error) throw error;
  await safeWriteRemoteAuditEvent({
    action: "estalecas.conquista.solicitar",
    entity: "estaleca_claims",
    metadata: { claimType: values.claimType, title: values.title, amountSuggested: values.amountSuggested },
  });
}

export async function uploadRemoteAvatar(pessoaId: string, dataUrl: string) {
  const client = requireSupabase();
  const blob = await (await fetch(dataUrl)).blob();
  const { error } = await client.storage.from("avatars").upload(`${pessoaId}.jpg`, blob, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });
  if (error) throw error;
}

// Remove a foto do bucket público. Sem isto, "Remover foto" só apagava a cópia
// local e a equipe continuava vendo a foto publicada.
export async function deleteRemoteAvatar(pessoaId: string) {
  const client = requireSupabase();
  const { error } = await client.storage.from("avatars").remove([`${pessoaId}.jpg`]);
  if (error) throw error;
}
