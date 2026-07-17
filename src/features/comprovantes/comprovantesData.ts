import type { SharePointQueueItem } from "@/lib/sharepoint";
import type { Receivable } from "@/features/inteligencia360/inteligencia360Data";
import type { PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import type { Cargo, ComprovanteTipo, FormaPagamento } from "@/types/database";

export type PeriodoFiltro = "dia" | "semana" | "mes" | "ano";

export type ComprovanteRecord = {
  id: string;
  storagePath?: string;
  tipo: ComprovanteTipo;
  arquivoNome: string;
  arquivoTipo: string;
  arquivoTamanho: number;
  anexadoEm: string;
  anexadoPor: string;
  anexadoPorCargo: Cargo;
  pacienteReferencia?: string;
  pagamentoLembreteId?: string;
  inteligencia360ReceivableId?: string;
  valor?: number;
  formaPagamento?: FormaPagamento;
  observacao?: string;
  estornoDe?: string;
  deletedAt?: string;
  sharePoint: SharePointQueueItem;
};

export const comprovantesStorageKey = "app-bratan-comprovantes";
export const comprovantesAccept = ".jpg,.jpeg,.png,.heic,.pdf,image/jpeg,image/png,image/heic,application/pdf";

export const formaLabels: Record<FormaPagamento, string> = {
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
};

export function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function isAcceptedComprovante(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return file.type === "application/pdf" || file.type.startsWith("image/") || extension === "heic" || extension === "pdf";
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function isInsideFilter(dateString: string, filter: PeriodoFiltro) {
  const target = new Date(dateString);
  const now = new Date();

  if (filter === "dia") return sameDay(target, now);
  if (filter === "semana") {
    const start = startOfWeek(now);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return target >= start && target < end;
  }
  if (filter === "mes") return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
  return target.getFullYear() === now.getFullYear();
}

export function money(value?: number) {
  if (typeof value !== "number") return "Valor não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// ---- Filtros da lista de comprovantes ----------------------------------------
export type OrdenacaoComprovante = "recentes" | "antigos" | "maior_valor" | "menor_valor";

export type ComprovanteFiltros = {
  periodo: PeriodoFiltro | "tudo";
  data: string; // "YYYY-MM-DD"; dia específico — tem prioridade sobre `mes` e `periodo`
  mes: string; // "YYYY-MM"; quando preenchido tem prioridade sobre `periodo`
  busca: string;
  tipo: "todos" | ComprovanteTipo;
  forma: FormaPagamento | "todas";
  autor: string; // "todos" ou o nome exato de quem anexou
  ordenacao: OrdenacaoComprovante;
};

export const defaultComprovanteFiltros: ComprovanteFiltros = {
  periodo: "mes",
  data: "",
  mes: "",
  busca: "",
  tipo: "todos",
  forma: "todas",
  autor: "todos",
  ordenacao: "recentes",
};

export function matchesComprovanteFiltros(record: ComprovanteRecord, filtros: ComprovanteFiltros): boolean {
  if (record.deletedAt) return false;

  // Período: dia específico tem a maior prioridade; depois o mês; depois o preset.
  if (filtros.data) {
    if (record.anexadoEm.slice(0, 10) !== filtros.data) return false;
  } else if (filtros.mes) {
    if (record.anexadoEm.slice(0, 7) !== filtros.mes) return false;
  } else if (filtros.periodo !== "tudo") {
    if (!isInsideFilter(record.anexadoEm, filtros.periodo)) return false;
  }

  if (filtros.tipo !== "todos" && record.tipo !== filtros.tipo) return false;
  if (filtros.forma !== "todas" && record.formaPagamento !== filtros.forma) return false;
  if (filtros.autor !== "todos" && record.anexadoPor !== filtros.autor) return false;

  const termo = filtros.busca.trim().toLowerCase();
  if (termo) {
    const alvo = [record.arquivoNome, record.pacienteReferencia, record.observacao, record.anexadoPor]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!alvo.includes(termo)) return false;
  }

  return true;
}

export function sortComprovantes(records: ComprovanteRecord[], ordenacao: OrdenacaoComprovante): ComprovanteRecord[] {
  return [...records].sort((a, b) => {
    switch (ordenacao) {
      case "antigos":
        return new Date(a.anexadoEm).getTime() - new Date(b.anexadoEm).getTime();
      case "maior_valor":
        return (b.valor ?? 0) - (a.valor ?? 0);
      case "menor_valor":
        return (a.valor ?? 0) - (b.valor ?? 0);
      case "recentes":
      default:
        return new Date(b.anexadoEm).getTime() - new Date(a.anexadoEm).getTime();
    }
  });
}

export function filterComprovantes(records: ComprovanteRecord[], filtros: ComprovanteFiltros): ComprovanteRecord[] {
  return sortComprovantes(
    records.filter((record) => matchesComprovanteFiltros(record, filtros)),
    filtros.ordenacao,
  );
}

// Quantos filtros estão diferentes do padrão — usado no botão "Limpar filtros".
export function countActiveComprovanteFiltros(filtros: ComprovanteFiltros): number {
  let count = 0;
  if (filtros.busca.trim()) count += 1;
  if (filtros.data) count += 1;
  else if (filtros.mes) count += 1;
  else if (filtros.periodo !== defaultComprovanteFiltros.periodo) count += 1;
  if (filtros.tipo !== "todos") count += 1;
  if (filtros.forma !== "todas") count += 1;
  if (filtros.autor !== "todos") count += 1;
  if (filtros.ordenacao !== "recentes") count += 1;
  return count;
}

// Lista de autores (quem anexou) presentes nos registros, para o seletor.
export function listComprovanteAutores(records: ComprovanteRecord[]): string[] {
  const set = new Set<string>();
  for (const record of records) {
    if (!record.deletedAt && record.anexadoPor) set.add(record.anexadoPor);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Soma líquida (entradas menos estornos) de uma lista já filtrada.
export function somaComprovantes(records: ComprovanteRecord[]): number {
  return records.reduce((sum, record) => sum + (record.valor ?? 0), 0);
}

export function activeComprovantes(records: ComprovanteRecord[]) {
  return records
    .filter((record) => !record.deletedAt)
    .sort((a, b) => new Date(b.anexadoEm).getTime() - new Date(a.anexadoEm).getTime());
}

export function comprovantesSummary(records: ComprovanteRecord[]) {
  const activeRecords = activeComprovantes(records);
  const todayRecords = activeRecords.filter((record) => isInsideFilter(record.anexadoEm, "dia"));
  const pendingSharePoint = activeRecords.filter((record) => record.sharePoint.status === "pendente").length;
  const totalHoje = todayRecords.reduce((sum, record) => sum + (record.valor ?? 0), 0);

  return {
    activeRecords,
    todayRecords,
    pendingSharePoint,
    totalHoje,
    lastRecord: activeRecords[0] ?? null,
  };
}

export function applyComprovanteToPagamentos(records: PagamentoLembrete[], comprovante: ComprovanteRecord) {
  if (!comprovante.pagamentoLembreteId || comprovante.tipo !== "entrada") return records;

  return records.map((record) =>
    record.id === comprovante.pagamentoLembreteId
      ? {
          ...record,
          status: "pago" as const,
          pagoEm: comprovante.anexadoEm,
        }
      : record,
  );
}

export function receivableFromComprovante(comprovante: ComprovanteRecord): Receivable | null {
  if (comprovante.tipo !== "entrada" || !comprovante.pacienteReferencia || typeof comprovante.valor !== "number" || comprovante.valor <= 0) {
    return null;
  }

  const id = comprovante.inteligencia360ReceivableId ?? `recv-${comprovante.id}`;
  return {
    id,
    patientReference: comprovante.pacienteReferencia,
    saleId: "",
    totalAmount: comprovante.valor,
    receivedAmount: comprovante.valor,
    dueDate: comprovante.anexadoEm.slice(0, 10),
    paymentMethod: comprovante.formaPagamento ? formaLabels[comprovante.formaPagamento] : "Comprovante",
    installments: 1,
    status: "PAID",
    ownerUserId: "Financeiro",
    collectionStatus: "RESOLVED",
    notes: comprovante.pagamentoLembreteId
      ? `Recebido via comprovante ${comprovante.arquivoNome}; pendência vinculada ${comprovante.pagamentoLembreteId}.`
      : `Recebido via comprovante ${comprovante.arquivoNome}.`,
    createdAt: comprovante.anexadoEm,
    updatedAt: comprovante.anexadoEm,
  };
}
