import type { PrioridadeAviso } from "@/types/database";

export type Aviso = {
  id: string;
  corpo: string;
  prioridade: PrioridadeAviso;
  autor: string;
  publicadoEm: string;
  deletedAt?: string;
};

// v2 (03/07/2026): chave trocada para descartar avisos fictícios em cache.
export const muralStorageKey = "app-bratan-mural-v2";

// Sem avisos fictícios: o mural começa vazio.
export const initialAvisos: Aviso[] = [];

export function sortAvisos(avisos: Aviso[]) {
  return [...avisos].sort((a, b) => new Date(b.publicadoEm).getTime() - new Date(a.publicadoEm).getTime());
}

export function activeAvisos(avisos: Aviso[]) {
  return sortAvisos(avisos.filter((aviso) => !aviso.deletedAt));
}
