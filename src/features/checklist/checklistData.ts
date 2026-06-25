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
    id: "recepcao-confirmacoes",
    grupo: "Recepção / Comercial",
    descricao: "Confirmar consultas D-2/D-1 e atualizar iClinic/PDCA Comercial",
    responsavel: "Recepção",
    ordem: 1,
  },
  {
    id: "recepcao-acolhimento",
    grupo: "Recepção / Comercial",
    descricao: "Preparar acolhimento: questionário, bioimpedância, café/lanche e encaminhamento",
    responsavel: "Recepção",
    ordem: 2,
  },
  {
    id: "recepcao-contratos",
    grupo: "Recepção / Comercial",
    descricao: "Conferir contratos SuperSign: modelo, ordem, WhatsApp e campos obrigatórios",
    responsavel: "Recepção",
    ordem: 3,
  },
  {
    id: "recepcao-pos-venda",
    grupo: "Recepção / Comercial",
    descricao: "Registrar adesão/não adesão, presente e responsável pelo paciente",
    responsavel: "Recepção",
    ordem: 4,
  },
  {
    id: "gestao-pre-consulta",
    grupo: "Gestão",
    descricao: "Validar pré-consulta: cadastro, assinatura, documentos e bioimpedância",
    responsavel: "Gestão",
    ordem: 5,
  },
  {
    id: "gestao-entrega-final",
    grupo: "Gestão",
    descricao: "Conferir contrato, prontuário físico e entrega final antes da liberação",
    responsavel: "Gestão",
    ordem: 6,
  },
  {
    id: "gestao-nao-adesao",
    grupo: "Gestão",
    descricao: "Acompanhar não adesões e direcionar receitas conforme regra interna",
    responsavel: "Gestão",
    ordem: 7,
  },
  {
    id: "enfermagem-prescricoes",
    grupo: "Enfermagem",
    descricao: "Conferir prescrições, materiais, EPIs, sala e identificação do paciente",
    responsavel: "Enfermagem",
    ordem: 8,
  },
  {
    id: "enfermagem-registros",
    grupo: "Enfermagem",
    descricao: "Registrar medicações, procedimentos, intercorrências e descartes nos sistemas corretos",
    responsavel: "Enfermagem",
    ordem: 9,
  },
  {
    id: "enfermagem-acompanhamento",
    grupo: "Enfermagem",
    descricao: "Atualizar acompanhamento de pacientes em tratamento, doses e bioimpedância",
    responsavel: "Enfermagem",
    ordem: 10,
  },
  {
    id: "enfermagem-estoque",
    grupo: "Enfermagem",
    descricao: "Conferir estoque de medicamentos: mínimos, vencimentos, compras e entrada no iClinic",
    responsavel: "Enfermagem",
    ordem: 11,
  },
  {
    id: "enfermagem-esterilizacao",
    grupo: "Enfermagem",
    descricao: "Garantir instrumental esterilizado, descarte correto e DEA disponível",
    responsavel: "Enfermagem",
    ordem: 12,
  },
  {
    id: "limpeza-ambientes",
    grupo: "Higienização / Limpeza",
    descricao: "Classificar ambientes e executar limpeza concorrente ou terminal conforme criticidade",
    responsavel: "Limpeza",
    ordem: 13,
  },
  {
    id: "limpeza-checklist",
    grupo: "Higienização / Limpeza",
    descricao: "Usar EPIs e saneantes corretos, inspecionar resultado e registrar checklist",
    responsavel: "Limpeza",
    ordem: 14,
  },
  {
    id: "limpeza-geladeira",
    grupo: "Higienização / Limpeza",
    descricao: "Conferir temperatura da geladeira e agir se houver leitura fora da faixa",
    responsavel: "Limpeza",
    ordem: 15,
  },
  {
    id: "copa-insumos",
    grupo: "Copa / Nutrição",
    descricao: "Conferir validade, temperatura, bancada, mãos, luvas e insumos antes da oferta",
    responsavel: "Copa",
    ordem: 16,
  },
  {
    id: "copa-lanches",
    grupo: "Copa / Nutrição",
    descricao: "Higienizar, montar, embalar, etiquetar e refrigerar alimentos imediatamente",
    responsavel: "Copa",
    ordem: 17,
  },
  {
    id: "financeiro-coleta",
    grupo: "Financeiro / Administrativo",
    descricao: "Coletar comandas, receitas, comprovantes, contratos e documentos do crediário",
    responsavel: "Financeiro",
    ordem: 18,
  },
  {
    id: "financeiro-conciliacao",
    grupo: "Financeiro / Administrativo",
    descricao: "Conferir valores, meios de pagamento, taxas, rendimentos e trava de caixa",
    responsavel: "Financeiro",
    ordem: 19,
  },
  {
    id: "financeiro-registros",
    grupo: "Financeiro / Administrativo",
    descricao: "Atualizar planilhas, PDCA Comercial, P12, NFS-e e arquivos no SharePoint",
    responsavel: "Financeiro",
    ordem: 20,
  },
  {
    id: "financeiro-compras",
    grupo: "Financeiro / Administrativo",
    descricao: "Validar compras institucionais: NF/invoice, comprovante, formulário, reembolso e destino",
    responsavel: "Financeiro",
    ordem: 21,
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
