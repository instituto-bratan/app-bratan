import { useSyncExternalStore } from "react";
import { readLocalValue, writeLocalValue } from "@/lib/localStore";

const avatarChangeEvent = "app-bratan-avatar-change";

function avatarStorageKey(pessoaId: string) {
  return `app-bratan-avatar-${pessoaId}`;
}

export function loadAvatar(pessoaId: string | null | undefined) {
  if (!pessoaId) return null;
  return readLocalValue<string | null>(avatarStorageKey(pessoaId), null);
}

export function saveAvatar(pessoaId: string, dataUrl: string | null) {
  writeLocalValue(avatarStorageKey(pessoaId), dataUrl);
  window.dispatchEvent(new Event(avatarChangeEvent));
}

function subscribe(callback: () => void) {
  window.addEventListener(avatarChangeEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(avatarChangeEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

// Foto no bucket público de avatares — visível para toda a equipe.
export function publicAvatarUrl(pessoaId: string | null | undefined) {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base || !pessoaId) return null;
  const version = readLocalValue<string>(`app-bratan-avatar-v-${pessoaId}`, "");
  return `${base}/storage/v1/object/public/avatars/${pessoaId}.jpg${version ? `?v=${version}` : ""}`;
}

export function bumpAvatarVersion(pessoaId: string) {
  writeLocalValue(`app-bratan-avatar-v-${pessoaId}`, String(Date.now()));
  window.dispatchEvent(new Event(avatarChangeEvent));
}

export function useAvatar(pessoaId: string | null | undefined) {
  return useSyncExternalStore(subscribe, () => loadAvatar(pessoaId), () => null);
}

// Melhor fonte disponível: a foto local (deste aparelho) ou a do bucket da equipe.
export function useAvatarSrc(pessoaId: string | null | undefined) {
  const local = useAvatar(pessoaId);
  return local ?? publicAvatarUrl(pessoaId);
}

export async function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível para processar a foto.");
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}
