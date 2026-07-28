import type { Receivable } from "@/features/inteligencia360/inteligencia360Data";
import type { PagamentoLembreteStatus } from "@/types/database";

export type PagamentoFiltro = "abertos" | "vencidos" | "hoje" | "proximos" | "pagos" | "todos";

export type PagamentoLembrete = {
  id: string;
  pacienteNome: string;
  contato?: string;
  // Paciente do CRM — mesma chave das comandas e comprovantes. É o que permite
  // encaixar a comanda no lembrete sem depender de como o nome foi digitado.
  crmContactRef?: string;
  valorPendente: number;
  dataPrevista: string;
  observacao?: string;
  status: PagamentoLembreteStatus;
  criadoPor: string;
  criadoEm: string;
  pagoEm?: string;
  deletedAt?: string;
};

export type PagamentoRecebimento = {
  id: string;
  lembreteId: string;
  valor: number;
  forma: string;
  recebidoEm: string;
  // Comanda que abateu este lembrete. Preenchido = o dinheiro JÁ está no
  // faturamento pela comanda; não pode entrar de novo no caixa do crediário.
  saleRef?: string | null;
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

// ————————————————————————————————————————————————————————————————————————
// ENCAIXE LEMBRETE × COMANDA (28/07/2026)
// Regra do Lucas: NÃO duplicar. Quando a recepcionista lança na comanda o
// valor que o paciente estava devendo, aquele lembrete tem de ser abatido —
// o faturamento é a comanda, e o recebimento do lembrete é só a baixa dela.
// Quem paga em crediário (dinheiro) continua separado: aí o recebimento não
// tem comanda e o livro-caixa do crediário é o registro legítimo.
// ————————————————————————————————————————————————————————————————————————

export function normalizePatientName(name: string) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Lembretes em aberto do paciente da comanda. Casa primeiro pelo contato do
// CRM (à prova de erro de digitação) e, para os lembretes antigos que nasceram
// sem link, pelo nome normalizado.
export function openLembretesForPatient(
  lembretes: PagamentoLembrete[],
  patient: { ref?: string | null; name?: string | null },
): PagamentoLembrete[] {
  const ref = patient.ref || "";
  const name = normalizePatientName(patient.name ?? "");
  return lembretes
    .filter((record) => !record.deletedAt && record.status === "aberto" && record.valorPendente > 0)
    .filter((record) => {
      if (ref && record.crmContactRef) return record.crmContactRef === ref;
      if (!name) return false;
      const recordName = normalizePatientName(record.pacienteNome);
      if (!recordName) return false;
      // "Milton" casa com "Milton Ferreira": um nome é prefixo do outro.
      return recordName === name || recordName.startsWith(`${name} `) || name.startsWith(`${recordName} `);
    })
    .sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
}

export type EncaixeLembrete = {
  lembreteId: string;
  pacienteNome: string;
  valorPendente: number;
  dataPrevista: string;
  // Quanto a comanda abate deste lembrete (nunca mais do que o pendente).
  valorAbatido: number;
  quitou: boolean;
  novoPendente: number;
};

// Distribui o valor da comanda entre os lembretes em aberto do paciente, do
// vencimento mais antigo para o mais novo. Nunca abate mais do que se deve.
export function planEncaixeComanda(
  lembretes: PagamentoLembrete[],
  patient: { ref?: string | null; name?: string | null },
  valorComanda: number,
): { encaixes: EncaixeLembrete[]; totalEmAberto: number; totalAbatido: number; sobra: number } {
  const abertos = openLembretesForPatient(lembretes, patient);
  const totalEmAberto = abertos.reduce((sum, record) => sum + record.valorPendente, 0);
  let restante = Math.max(0, Math.round((valorComanda || 0) * 100) / 100);
  const encaixes: EncaixeLembrete[] = [];
  for (const record of abertos) {
    if (restante <= 0) break;
    const valorAbatido = Math.min(record.valorPendente, restante);
    const novoPendente = Math.round((record.valorPendente - valorAbatido) * 100) / 100;
    encaixes.push({
      lembreteId: record.id,
      pacienteNome: record.pacienteNome,
      valorPendente: record.valorPendente,
      dataPrevista: record.dataPrevista,
      valorAbatido: Math.round(valorAbatido * 100) / 100,
      quitou: novoPendente <= 0,
      novoPendente: novoPendente <= 0 ? 0 : novoPendente,
    });
    restante = Math.round((restante - valorAbatido) * 100) / 100;
  }
  const totalAbatido = encaixes.reduce((sum, item) => sum + item.valorAbatido, 0);
  return { encaixes, totalEmAberto, totalAbatido, sobra: restante };
}

// Caixa do crediário: só o dinheiro que NÃO veio por comanda. Recebimento com
// saleRef já está no faturamento — somá-lo aqui seria contar duas vezes.
export function crediarioCashMoves<T extends { forma: string; saleRef?: string | null }>(recebimentos: T[]): T[] {
  return recebimentos.filter((item) => item.forma === "DINHEIRO" && !item.saleRef);
}

export function mergePagamentoReceivables(receivables: Receivable[], pagamentos: PagamentoLembrete[]) {
  const pagamentoReceivables = pagamentos.filter((record) => !record.deletedAt).map(receivableFromPagamento);
  const pagamentoIds = new Set(pagamentoReceivables.map((record) => record.id));

  return [
    ...pagamentoReceivables,
    ...receivables.filter((record) => !isPagamentoReceivable(record) && !pagamentoIds.has(record.id)),
  ];
}
