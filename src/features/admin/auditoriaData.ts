export type AuditEventRecord = {
  id: string;
  actorName: string;
  actorEmail?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const auditActionLabels: Record<string, string> = {
  "auth.create_colaborador_access": "Criou acesso de login para colaborador",
  "colaborador.create": "Colaborador cadastrado",
  "colaborador.update": "Colaborador atualizado",
  "colaborador.deactivate": "Desativou um colaborador",
  "colaborador.reactivate": "Reativou um colaborador",
  "aviso.publish": "Aviso publicado",
  "aviso.archive": "Aviso arquivado",
  "checklist.item.adicionar": "Adicionou uma tarefa ao checklist",
  "checklist_item.toggle": "Tarefa marcada",
  "checklist.reset": "Checklist reiniciado",
  "comprovante.upload": "Comprovante anexado",
  "comprovante.estorno": "Estorno registrado",
  "comprovante.hide": "Comprovante ocultado",
  "pagamento_lembrete.create": "Criou um lembrete de pagamento",
  "pagamento_lembrete.status": "Atualizou um lembrete de pagamento",
  "pagamento_lembrete.postpone": "Reagendou um lembrete de pagamento",
  "pagamento_lembrete.hide": "Ocultou um lembrete de pagamento",
  "financeiro.venda.lancar": "Lançou uma comanda",
  "financeiro.venda.editar": "Editou uma comanda",
  "financeiro.venda.excluir": "Excluiu uma comanda",
  "financeiro.despesa.lancar": "Lançou uma conta a pagar",
  "financeiro.despesa.excluir": "Excluiu uma conta",
  "financeiro.fechamento.salvar": "Salvou um fechamento de caixa",
  "financeiro.poupanca.lancar": "Movimentou a poupança",
  "financeiro.nf.registrar": "Registrou uma nota fiscal",
  "crm.sync": "Sincronizou o CRM",
  "inteligencia_360.sync": "Sincronizou a Inteligência 360",
  "estalecas.checkin": "Fez um check-in",
  "estalecas.checkin.invalidate": "Invalidou um check-in",
  "estalecas.consent": "Consentimento Estalecas",
  "estalecas.profile.update": "Perfil de ranking atualizado",
  "estalecas.config.update": "Configuração de Estalecas",
  "estalecas.transaction.create": "Lançamento de Estalecas",
  "estalecas.transaction.status": "Status de Estalecas",
  "estalecas.reward.create": "Criou um prêmio de Estalecas",
  "estalecas.reward.status": "Status de prêmio",
  "estalecas.reward.monthly_winner.create": "Vencedor mensal registrado",
  "estalecas.conquista.solicitar": "Enviou uma conquista para aprovação",
  "estalecas.conquista.aprovar": "Aprovou uma conquista",
  "estalecas.conquista.recusar": "Recusou uma conquista",
  "estalecas.checkin_code.create": "Criou código de check-in",
  "estalecas.checkin_code.activate": "Ativou código de check-in",
  "estalecas.checkin_code.deactivate": "Desativou código de check-in",
};

export const auditEntityLabels: Record<string, string> = {
  colaborador: "Colaborador",
  aviso: "Mural",
  checklist_item_run: "Checklist",
  checklist_run: "Checklist",
  comprovante: "Comprovante",
  pagamento_lembrete: "Lembrete de pagamento",
  gamification_profile: "Perfil de Estalecas",
  estaleca_config: "Configuração de Estalecas",
  estaleca_transactions: "Transação de Estalecas",
  estaleca_claims: "Conquista de Estalecas",
  checkins: "Check-in",
  checkin_event_codes: "Código de check-in",
  rewards: "Prêmio",
  fin_sales: "Comanda",
  fin_expenses: "Conta a pagar",
  fin_reconciliations: "Fechamento de caixa",
  fin_savings_moves: "Poupança",
  fin_invoices: "Nota fiscal",
  crm: "CRM",
  inteligencia_360: "Inteligência 360",
};

function humanizeCode(code: string) {
  const readable = code.replace(/[._]+/g, " ").trim();
  if (!readable) return code;
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

export function auditActionLabel(action: string) {
  return auditActionLabels[action] ?? humanizeCode(action);
}

export function auditEntityLabel(entity: string) {
  return auditEntityLabels[entity] ?? humanizeCode(entity);
}

const metadataKeyLabels: Record<string, string> = {
  saleDate: "Dia",
  day: "Dia",
  total: "Total",
  items: "Itens",
  amount: "Valor",
  valor: "Valor",
  amountSuggested: "Valor sugerido",
  dataPrevista: "Data combinada",
  checkinType: "Tipo",
  codePreview: "Código",
  eventDate: "Data do evento",
  hasContato: "Tem contato",
  dueDate: "Vencimento",
  installments: "Parcelas",
  estalecas: "Estalecas",
  checkpoints: "Checkpoints",
  cargo: "Cargo",
  prioridade: "Prioridade",
  grupo: "Grupo",
  descricao: "Descrição",
  concluido: "Concluída",
  status: "Status",
  before: "Antes",
  after: "Depois",
  reason: "Motivo",
  title: "Título",
  category: "Categoria",
  source: "Origem",
  type: "Tipo",
  moves: "Movimentações",
  month: "Mês",
  year: "Ano",
  fileName: "Arquivo",
  formaPagamento: "Forma de pagamento",
  pacienteReferencia: "Paciente",
  hasValor: "Tem valor",
  invoiceType: "Tipo de nota",
  invoiceNumber: "Número da nota",
  claimType: "Tipo de conquista",
  feeItau: "Taxa Itaú",
  feeSafra: "Taxa Safra",
  contacts: "Contatos",
  deals: "Negociações",
  tasks: "Tarefas",
  touchpoints: "Interações",
  weeklyTickets: "Tickets da semana",
  prescriptions: "Prescrições",
  receivables: "Recebimentos",
  actions: "Ações",
  tieBreakNote: "Observação de desempate",
  rankingOptIn: "Participa do ranking",
  hasDisplayName: "Tem nome de exibição",
  feedsReceivables360: "Entra nos recebimentos 360",
  gymCheckinEstalecas: "Estalecas por check-in na academia",
  churchCheckinEstalecas: "Estalecas por check-in na igreja",
  defaultCashbackPercent: "Cashback padrão (%)",
  eligibleCategories: "Categorias elegíveis",
  rewardType: "Tipo de prêmio",
};

const metadataValueLabels: Record<string, string> = {
  gym: "Academia",
  church: "Igreja",
};

const moneyKeys = new Set(["total", "amount", "valor", "amountSuggested", "feeItau", "feeSafra"]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;

function isTechnicalKey(key: string) {
  return /(?:^id$|Id$|Ids$|Uuid$|Ref$|^estornoDe$)/.test(key);
}

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatMetadataValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Sim" : "Não";

  if (typeof value === "number") {
    if (moneyKeys.has(key)) return moneyFormatter.format(value);
    return new Intl.NumberFormat("pt-BR").format(value);
  }

  if (typeof value === "string") {
    const isoMatch = value.match(isoDatePattern);
    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    if (moneyKeys.has(key)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return moneyFormatter.format(parsed);
    }
    return metadataValueLabels[value] ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatMetadataValue(key, item)).join(", ");
  }

  return String(value);
}

export function formatAuditMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata).filter(([key, value]) => {
    if (value === null || value === undefined || value === "") return false;
    if (isTechnicalKey(key)) return false;
    if (typeof value === "string" && uuidPattern.test(value)) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });

  if (!entries.length) return "Sem detalhes extras";

  return entries
    .map(([key, value]) => {
      const label = metadataKeyLabels[key] ?? humanizeCode(key);
      return `${label}: ${formatMetadataValue(key, value)}`;
    })
    .join(" · ");
}
