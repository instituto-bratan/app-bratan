import type { Receivable } from "@/features/inteligencia360/inteligencia360Data";
import type { PagamentoLembreteStatus } from "@/types/database";

export type PagamentoFiltro = "abertos" | "vencidos" | "hoje" | "proximos" | "pagos" | "todos";

export type PagamentoLembrete = {
  id: string;
  pacienteNome: string;
  contato?: string;
  valorPendente: number;
  dataPrevista: string;
  observacao?: string;
  status: PagamentoLembreteStatus;
  criadoPor: string;
  criadoEm: string;
  pagoEm?: string;
  deletedAt?: string;
};

export const pagamentosStorageKey = "app-bratan-lembretes-pagamento";

export const pagamentoStatusLabels: Record<PagamentoLembreteStatus, string> = {
  aberto: "Em aberto",
  pago: "Pago",
  cancelado: "Cancelado",
};

export const pagamentoFiltroLabels: Record<PagamentoFiltro, string> = {
  abertos: "Em aberto",
  vencidos: "Vencidos",
  hoje: "Hoje",
  proximos: "Próximos",
  pagos: "Pagos",
  todos: "Todos",
};

function localDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function todayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function money(value?: number) {
  if (typeof value !== "number") return "Valor não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(localDate(dateString));
}

export function isPagamentoVencido(record: PagamentoLembrete) {
  return record.status === "aberto" && localDate(record.dataPrevista) < todayStart();
}

export function isPagamentoHoje(record: PagamentoLembrete) {
  const target = localDate(record.dataPrevista);
  const today = todayStart();
  return record.status === "aberto" && target.getTime() === today.getTime();
}

export function isPagamentoProximo(record: PagamentoLembrete) {
  const target = localDate(record.dataPrevista);
  const today = todayStart();
  const end = new Date(today);
  end.setDate(today.getDate() + 7);
  return record.status === "aberto" && target > today && target <= end;
}

export function sortPagamentos(records: PagamentoLembrete[]) {
  return [...records].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "aberto") return -1;
      if (b.status === "aberto") return 1;
    }

    return localDate(a.dataPrevista).getTime() - localDate(b.dataPrevista).getTime();
  });
}

export function filterPagamentos(records: PagamentoLembrete[], filter: PagamentoFiltro) {
  const active = records.filter((record) => !record.deletedAt);

  if (filter === "vencidos") return active.filter(isPagamentoVencido);
  if (filter === "hoje") return active.filter(isPagamentoHoje);
  if (filter === "proximos") return active.filter(isPagamentoProximo);
  if (filter === "pagos") return active.filter((record) => record.status === "pago");
  if (filter === "abertos") return active.filter((record) => record.status === "aberto");
  return active;
}

export function pagamentosSummary(records: PagamentoLembrete[]) {
  const active = records.filter((record) => !record.deletedAt);
  const abertos = active.filter((record) => record.status === "aberto");
  const vencidos = active.filter(isPagamentoVencido);
  const hoje = active.filter(isPagamentoHoje);
  const proximos = active.filter(isPagamentoProximo);
  const totalAberto = abertos.reduce((sum, record) => sum + record.valorPendente, 0);

  return {
    active,
    abertos,
    vencidos,
    hoje,
    proximos,
    totalAberto,
    proximoLembrete: sortPagamentos(abertos)[0] ?? null,
  };
}

export function pagamentoReceivableId(record: Pick<PagamentoLembrete, "id">) {
  return `recv-pagamento-${record.id}`;
}

export function isPagamentoReceivable(record: Pick<Receivable, "id">) {
  return record.id.startsWith("recv-pagamento-");
}

export function receivableFromPagamento(record: PagamentoLembrete): Receivable {
  const status = record.status === "pago" ? "PAID" : record.status === "cancelado" ? "CANCELED" : isPagamentoVencido(record) ? "OVERDUE" : "OPEN";
  const collectionStatus = status === "PAID" || status === "CANCELED" ? "RESOLVED" : status === "OVERDUE" ? "FIRST_CONTACT" : "PROMISED_PAYMENT";
  const updatedAt = record.pagoEm ?? record.criadoEm;

  return {
    id: pagamentoReceivableId(record),
    patientReference: record.pacienteNome,
    saleId: "",
    totalAmount: record.valorPendente,
    receivedAmount: status === "PAID" ? record.valorPendente : 0,
    dueDate: record.dataPrevista,
    paymentMethod: "Lembrete de pagamento",
    installments: 1,
    status,
    ownerUserId: record.criadoPor,
    collectionStatus,
    notes: record.observacao
      ? `Gerado automaticamente por Lembretes de pagamento. ${record.observacao}`
      : "Gerado automaticamente por Lembretes de pagamento.",
    createdAt: record.criadoEm,
    updatedAt,
  };
}

export function mergePagamentoReceivables(receivables: Receivable[], pagamentos: PagamentoLembrete[]) {
  const pagamentoReceivables = pagamentos.filter((record) => !record.deletedAt).map(receivableFromPagamento);
  const pagamentoIds = new Set(pagamentoReceivables.map((record) => record.id));

  return [
    ...pagamentoReceivables,
    ...receivables.filter((record) => !isPagamentoReceivable(record) && !pagamentoIds.has(record.id)),
  ];
}
