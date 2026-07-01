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

export function useAvatar(pessoaId: string | null | undefined) {
  return useSyncExternalStore(subscribe, () => loadAvatar(pessoaId), () => null);
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
