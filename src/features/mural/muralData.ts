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

// ---------------------------------------------------------------- frases da tela (redesenho etapa 4, 08/10/2026)

/** A frase do cabeçalho do Mural: quantos avisos estão no ar e quantos são importantes. */
export function fraseDoMural(avisos: Aviso[]): { destaque: string; resto: string } {
  const ativos = activeAvisos(avisos);
  if (ativos.length === 0) return { destaque: "", resto: "Nenhum aviso no mural agora." };
  const importantes = ativos.filter((aviso) => aviso.prioridade === "importante").length;
  const destaque = ativos.length === 1 ? "1 aviso no mural" : `${ativos.length} avisos no mural`;
  const resto =
    importantes === 0
      ? ", todos informativos."
      : importantes === ativos.length
        ? ativos.length === 1
          ? ", e ele é importante."
          : ", todos importantes."
        : importantes === 1
          ? ", 1 deles importante."
          : `, ${importantes} deles importantes.`;
  return { destaque, resto };
}

function chaveDoDia(data: Date) {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

/**
 * Quando o aviso saiu, em palavras: "hoje, 09:12" · "ontem, 17:40" · "05/10, 09:12"
 * (com o ano quando não é o deste ano). Antes a tela mostrava só a hora, e um
 * aviso de semana passada parecia de hoje.
 */
export function quandoFoiPublicado(publicadoEm: string, agora = new Date()) {
  const data = new Date(publicadoEm);
  if (Number.isNaN(data.getTime())) return "";
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(data);
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (chaveDoDia(data) === chaveDoDia(agora)) return `hoje, ${hora}`;
  if (chaveDoDia(data) === chaveDoDia(ontem)) return `ontem, ${hora}`;
  const dia = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(data.getFullYear() === agora.getFullYear() ? {} : { year: "numeric" }),
  }).format(data);
  return `${dia}, ${hora}`;
}
