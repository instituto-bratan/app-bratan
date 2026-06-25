import { todayISO } from "@/lib/localStore";

export type ChecklistItem = {
  id: string;
  grupo: string;
  descricao: string;
  responsavel: string;
  ordem: number;
  concluido: boolean;
  concluidoPor?: string;
  concluidoEm?: string;
};

export const checklistTemplate: Omit<ChecklistItem, "concluido" | "concluidoPor" | "concluidoEm">[] = [
  {
    id: "fechamento-comanda",
    grupo: "Fechamento da véspera",
    descricao: "Receber e abrir a comanda do dia anterior",
    responsavel: "Financeiro",
    ordem: 1,
  },
  {
    id: "fechamento-totais",
    grupo: "Fechamento da véspera",
    descricao: "Conferir totais: dinheiro + Pix + cartão = entrada",
    responsavel: "Financeiro",
    ordem: 2,
  },
  {
    id: "fechamento-categorias",
    grupo: "Fechamento da véspera",
    descricao: "Separar receita por categoria",
    responsavel: "Financeiro",
    ordem: 3,
  },
  {
    id: "nfs-emitir",
    grupo: "Notas fiscais",
    descricao: "Emitir NFs dos atendimentos",
    responsavel: "Financeiro",
    ordem: 4,
  },
  {
    id: "nfs-arquivar",
    grupo: "Notas fiscais",
    descricao: "Arquivar NFs no SharePoint",
    responsavel: "Financeiro",
    ordem: 5,
  },
  {
    id: "lancamentos-planilha",
    grupo: "Lançamentos",
    descricao: "Atualizar planilha ENTRADA INSTITUTO BRATAN",
    responsavel: "Financeiro",
    ordem: 6,
  },
  {
    id: "lancamentos-recebiveis",
    grupo: "Lançamentos",
    descricao: "Registrar recebíveis e promessas",
    responsavel: "Financeiro",
    ordem: 7,
  },
  {
    id: "pagamentos-boletos",
    grupo: "Pagamentos",
    descricao: "Conferir boletos e vencimentos do dia",
    responsavel: "Financeiro",
    ordem: 8,
  },
  {
    id: "recepcao-divergencias",
    grupo: "Recepção",
    descricao: "Sinalizar divergências da comanda",
    responsavel: "Recepção",
    ordem: 9,
  },
];

export function checklistStorageKey(date = todayISO()) {
  return `app-bratan-checklist-${date}`;
}

export function createChecklistRun(): ChecklistItem[] {
  return checklistTemplate.map((item) => ({
    ...item,
    concluido: false,
  }));
}

export function checklistSummary(items: ChecklistItem[]) {
  const doneCount = items.filter((item) => item.concluido).length;
  const total = items.length;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;
  const nextItem = items.find((item) => !item.concluido) ?? null;

  return {
    doneCount,
    total,
    pendingCount: total - doneCount,
    progress,
    nextItem,
  };
}
