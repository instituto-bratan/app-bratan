import type { PrioridadeAviso } from "@/types/database";

export type Aviso = {
  id: string;
  corpo: string;
  prioridade: PrioridadeAviso;
  autor: string;
  publicadoEm: string;
  deletedAt?: string;
};

export const muralStorageKey = "app-bratan-mural";

export const initialAvisos: Aviso[] = [
  {
    id: "aviso-comprovantes",
    prioridade: "importante",
    corpo: "A partir de hoje, todo comprovante de venda entra pelo APP - não pelo WhatsApp.",
    autor: "Lucas",
    publicadoEm: new Date().toISOString(),
  },
  {
    id: "aviso-folha",
    prioridade: "info",
    corpo: "Fechamento da folha é dia 25. Atestados precisam ser enviados imediatamente para o DP - é por causa do eSocial.",
    autor: "Lucas",
    publicadoEm: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
  },
];

export function sortAvisos(avisos: Aviso[]) {
  return [...avisos].sort((a, b) => new Date(b.publicadoEm).getTime() - new Date(a.publicadoEm).getTime());
}

export function activeAvisos(avisos: Aviso[]) {
  return sortAvisos(avisos.filter((aviso) => !aviso.deletedAt));
}
