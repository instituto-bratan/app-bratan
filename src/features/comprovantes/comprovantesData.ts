import type { SharePointQueueItem } from "@/lib/sharepoint";
import type { Cargo, ComprovanteTipo, FormaPagamento } from "@/types/database";

export type PeriodoFiltro = "dia" | "semana" | "mes" | "ano";

export type ComprovanteRecord = {
  id: string;
  tipo: ComprovanteTipo;
  arquivoNome: string;
  arquivoTipo: string;
  arquivoTamanho: number;
  anexadoEm: string;
  anexadoPor: string;
  anexadoPorCargo: Cargo;
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
