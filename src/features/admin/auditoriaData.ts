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
  "auth.create_colaborador_access": "Acesso criado",
  "colaborador.create": "Colaborador cadastrado",
  "colaborador.update": "Colaborador atualizado",
  "colaborador.deactivate": "Colaborador desligado",
  "colaborador.reactivate": "Colaborador reativado",
  "aviso.publish": "Aviso publicado",
  "aviso.archive": "Aviso arquivado",
  "checklist_item.toggle": "Tarefa marcada",
  "checklist.reset": "Checklist reiniciado",
  "comprovante.upload": "Comprovante anexado",
  "comprovante.estorno": "Estorno registrado",
  "comprovante.hide": "Comprovante ocultado",
  "pagamento_lembrete.create": "Lembrete criado",
  "pagamento_lembrete.status": "Status do lembrete",
  "pagamento_lembrete.postpone": "Lembrete reagendado",
  "pagamento_lembrete.hide": "Lembrete ocultado",
  "estalecas.checkin": "Check-in Estalecas",
  "estalecas.consent": "Consentimento Estalecas",
  "estalecas.profile.update": "Perfil de ranking atualizado",
  "estalecas.config.update": "Configuração de Estalecas",
  "estalecas.transaction.create": "Lançamento de Estalecas",
  "estalecas.transaction.status": "Status de Estalecas",
  "estalecas.checkin.invalidate": "Check-in invalidado",
  "estalecas.reward.status": "Status de prêmio",
  "estalecas.reward.monthly_winner.create": "Vencedor mensal registrado",
  "estalecas.checkin_code.create": "Código de check-in criado",
  "estalecas.checkin_code.activate": "Código de check-in ativado",
  "estalecas.checkin_code.deactivate": "Código de check-in desativado",
};

export const auditEntityLabels: Record<string, string> = {
  colaborador: "Colaborador",
  aviso: "Mural",
  checklist_item_run: "Checklist",
  checklist_run: "Checklist",
  comprovante: "Comprovante",
  pagamento_lembrete: "Lembrete",
  gamification_profile: "Perfil de Estalecas",
  estaleca_config: "Configuração de Estalecas",
  estaleca_transactions: "Transação de Estalecas",
  checkins: "Check-ins",
  checkin_event_codes: "Códigos de check-in",
  rewards: "Prêmios",
};

export function auditActionLabel(action: string) {
  return auditActionLabels[action] ?? action;
}

export function auditEntityLabel(entity: string) {
  return auditEntityLabels[entity] ?? entity;
}

export function formatAuditMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== "");

  if (!entries.length) return "Sem detalhes extras";

  return entries
    .map(([key, value]) => {
      const normalized = typeof value === "boolean" ? (value ? "sim" : "não") : String(value);
      return `${key}: ${normalized}`;
    })
    .join(" · ");
}
