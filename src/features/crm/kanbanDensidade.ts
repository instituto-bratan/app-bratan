// DENSIDADE DOS QUADROS (08/09/2026, Lucas: "todos os kanbans com a mesma
// proporção do Plano de Acompanhamento no modo Executivo"). Uma régua só, para
// Plano, Em aberto, cadências e repescagens; o padrão é Executivo.
export type KanbanDensity = "compact" | "comfortable" | "executive";

export const densityLabels: Record<KanbanDensity, string> = {
  compact: "Compacto",
  comfortable: "Confortável",
  executive: "Executivo",
};

export const densityColumns: Record<KanbanDensity, string> = {
  compact: "auto-cols-[minmax(300px,320px)]",
  comfortable: "auto-cols-[minmax(360px,390px)]",
  executive: "auto-cols-[minmax(420px,460px)]",
};

export const DENSIDADE_STORAGE_KEY = "app-bratan-kanban-density-v2";
export const DENSIDADE_PADRAO: KanbanDensity = "executive";
