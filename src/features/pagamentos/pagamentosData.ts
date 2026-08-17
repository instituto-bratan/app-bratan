import { personNameTokens } from "@/features/crm/nameMatch";
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
// ————————————————————————————————————————————————————————————————————————
// CONFERÊNCIA DO COFRE (28/07/2026)
// O cofre descasou porque não havia estorno: lançamento com forma errada era
// refeito e o errado ficava contando. Isto aponta os pares suspeitos para a
// pessoa decidir — nunca apaga nada sozinho.
// ————————————————————————————————————————————————————————————————————————

export type CofreItemKind = "RECEBIMENTO" | "MANUAL";

// Uma linha de dinheiro no cofre: recebimento de lembrete ou lançamento manual.
export type CofreItem = {
  kind: CofreItemKind;
  id: string;
  quem: string;
  valor: number;
  data: string;
  detalhe: string;
  // Só o dinheiro vivo soma no cofre. PIX/cartão entram na conferência apenas
  // como contexto: eles mostram que o pagamento foi lançado duas vezes.
  somaNoCofre: boolean;
  lembreteId?: string;
  lembreteApagado?: boolean;
  lembreteStatus?: string;
};

export type CofreSuspectMotivo =
  | "MESMO_VALOR_MESMO_DIA"
  | "MESMO_VALOR_REPETIDO"
  | "RECEBIMENTO_E_MANUAL"
  | "LEMBRETE_APAGADO"
  | "LEMBRETE_CANCELADO";

export type CofreSuspect = {
  motivo: CofreSuspectMotivo;
  titulo: string;
  descricao: string;
  valorEmRisco: number;
  itens: CofreItem[];
};

// Palavras de descrição de lançamento manual que não são nome de gente
// (medicação, serviço) e por isso não valem para casar com o paciente.
const COFRE_NOISE_TOKENS = new Set([
  "tirze", "tirzepatida", "mounjaro", "ozempic", "consulta", "consultas",
  "sinal", "restante", "resto", "parcela", "pagamento", "pago", "recebido",
  "dinheiro", "pix", "cartao", "reembolso", "retirada", "lucro", "troco",
  "sangria", "avulsa", "avulso", "plano", "exame", "exames", "bio",
  "bioimpedancia", "aplicacao", "medicacao", "kit",
]);

function cofreNameTokens(value: string) {
  return personNameTokens(value ?? "").filter((token) => token.length > 2 && !COFRE_NOISE_TOKENS.has(token));
}

// Duas linhas falam da mesma pessoa quando dividem alguma palavra de nome.
// "TIRZE ALINE MENDES" (lançamento manual) casa com "ALINE CRISTINE MENDES"
// (recebimento) por ALINE/MENDES, que é exatamente o caso de 28/07/2026.
function cofreSamePerson(a: CofreItem, b: CofreItem) {
  const tokensA = cofreNameTokens(a.quem);
  const tokensB = cofreNameTokens(b.quem);
  if (!tokensA.length || !tokensB.length) return false;
  const setB = new Set(tokensB);
  return tokensA.some((token) => setB.has(token));
}

function cofreDia(item: CofreItem) {
  return item.data.slice(0, 10);
}

function dinheiroDoDia(items: CofreItem[]) {
  return new Set(items.map(cofreDia)).size === 1;
}

// Agrupa, dentro do mesmo valor, as linhas que se ligam por pessoa OU por dia.
// Assim R$ 2.800 da Aline no dia 28 não é confundido com R$ 2.800 do Paulo no dia 21.
function clusterCofreItems(items: CofreItem[]) {
  const clusters: CofreItem[][] = [];
  for (const item of items) {
    const target = clusters.find((cluster) =>
      cluster.some((other) => cofreSamePerson(item, other) || cofreDia(item) === cofreDia(other)),
    );
    if (target) target.push(item);
    else clusters.push([item]);
  }
  return clusters;
}

export function cofreItemsFromRecebimentos<
  T extends {
    id: string;
    lembreteId: string;
    valor: number;
    forma: string;
    recebidoEm: string;
    saleRef?: string | null;
    pacienteNome?: string | null;
    lembreteStatus?: string | null;
    lembreteApagado?: boolean;
  },
>(recebimentos: T[]): CofreItem[] {
  // Recebimento de COMANDA fica fora: já está no faturamento, não passa pelo cofre.
  return recebimentos
    .filter((item) => !item.saleRef)
    .map((item) => ({
      kind: "RECEBIMENTO" as const,
      id: item.id,
      quem: item.pacienteNome ?? "Paciente do lembrete",
      valor: item.valor,
      data: item.recebidoEm.slice(0, 10),
      detalhe: item.forma === "DINHEIRO" ? "recebido em dinheiro" : `recebido em ${item.forma.toLowerCase()}`,
      somaNoCofre: item.forma === "DINHEIRO",
      lembreteId: item.lembreteId,
      lembreteApagado: Boolean(item.lembreteApagado),
      lembreteStatus: item.lembreteStatus ?? undefined,
    }));
}

export function cofreItemsFromManuais<
  T extends { id: string; entryDate: string; direction: string; description: string; amount: number },
>(entries: T[]): CofreItem[] {
  return entries
    .filter((entry) => entry.direction === "ENTRADA")
    .map((entry) => ({
      kind: "MANUAL" as const,
      id: entry.id,
      quem: entry.description,
      valor: entry.amount,
      data: entry.entryDate.slice(0, 10),
      detalhe: "entrada lançada à mão",
      somaNoCofre: true,
    }));
}

// O que está somando no cofre e não deveria. Nada é apagado aqui: a função só
// aponta, quem decide é a pessoa.
export function findCofreSuspects(input: { recebimentos: CofreItem[]; manuais: CofreItem[] }): CofreSuspect[] {
  const todos = [...input.recebimentos, ...input.manuais];
  const suspects: CofreSuspect[] = [];

  const porValor = new Map<string, CofreItem[]>();
  for (const item of todos) {
    const key = item.valor.toFixed(2);
    porValor.set(key, [...(porValor.get(key) ?? []), item]);
  }

  for (const items of porValor.values()) {
    if (items.length < 2) continue;
    for (const cluster of clusterCofreItems(items)) {
      if (cluster.length < 2) continue;
      const ordenado = [...cluster].sort((a, b) => a.data.localeCompare(b.data));
      const temManual = ordenado.some((item) => item.kind === "MANUAL");
      const temRecebimento = ordenado.some((item) => item.kind === "RECEBIMENTO");
      const mesmoDia = dinheiroDoDia(ordenado);
      const noCofre = ordenado.filter((item) => item.somaNoCofre).length;
      // Sobrando = o que soma no cofre além da primeira vez. Se só uma das
      // linhas é dinheiro (ex.: lançaram PIX e depois dinheiro), a dúvida é o
      // valor inteiro dela.
      const valorEmRisco =
        noCofre === 0
          ? 0
          : Math.round(ordenado[0].valor * (noCofre >= 2 ? noCofre - 1 : 1) * 100) / 100;
      const motivo: CofreSuspectMotivo =
        temManual && temRecebimento ? "RECEBIMENTO_E_MANUAL" : mesmoDia ? "MESMO_VALOR_MESMO_DIA" : "MESMO_VALOR_REPETIDO";
      const descricao =
        motivo === "RECEBIMENTO_E_MANUAL"
          ? "O mesmo valor entrou pelo lembrete E foi lançado à mão no caixa — o dinheiro está contado duas vezes."
          : mesmoDia
            ? `${ordenado.length} lançamentos do mesmo valor no mesmo dia — provável relançamento (a primeira tentativa saiu errada e ficou).`
            : `${ordenado.length} lançamentos do mesmo valor em dias diferentes — confirme se foram pagamentos distintos.`;
      if (valorEmRisco === 0) continue;
      suspects.push({
        motivo,
        titulo: `${ordenado[0].quem} · ${ordenado[0].valor.toFixed(2)}`,
        descricao,
        valorEmRisco,
        itens: ordenado,
      });
    }
  }

  const jaListado = new Set(suspects.flatMap((suspect) => suspect.itens.map((item) => `${item.kind}:${item.id}`)));

  // Recebimento cujo lembrete foi apagado ou cancelado continua somando no cofre
  // sem nenhuma dívida por trás — foi assim que o cofre descasou em julho/2026.
  for (const item of input.recebimentos) {
    if (jaListado.has(`RECEBIMENTO:${item.id}`)) continue;
    if (!item.somaNoCofre) continue;
    if (item.lembreteApagado) {
      suspects.push({
        motivo: "LEMBRETE_APAGADO",
        titulo: `${item.quem} · ${item.valor.toFixed(2)}`,
        descricao: "O lembrete deste recebimento foi apagado, mas o dinheiro continua somando no cofre.",
        valorEmRisco: item.valor,
        itens: [item],
      });
    } else if (item.lembreteStatus === "cancelado") {
      suspects.push({
        motivo: "LEMBRETE_CANCELADO",
        titulo: `${item.quem} · ${item.valor.toFixed(2)}`,
        descricao: "O lembrete está cancelado (a dívida voltou a ficar em aberto), mas o recebimento continua somando no cofre.",
        valorEmRisco: item.valor,
        itens: [item],
      });
    }
  }

  return suspects.sort((a, b) => b.valorEmRisco - a.valorEmRisco);
}

// ---------------------------------------------------------------------------
// PARA ONDE VAI O RECEBIMENTO (17/08/2026)
// ---------------------------------------------------------------------------
// Bug do Lucas: "eu fui colocar nos lembretes que alguém pagou no crediário, e
// não foi pro caixa do crediário". A causa era a tela: havia DOIS controles
// independentes que podiam se contradizer — a forma dizia "Dinheiro (vai para o
// crediário)" e, ao lado, a pergunta "essa dívida já tem comanda?" podia estar em
// "lançar agora". Gerando comanda, o recebimento ganha saleRef e sai do caixa do
// crediário (senão o mesmo dinheiro contaria duas vezes). Ninguém era avisado.
//
// Agora existe UMA escolha: o destino. A forma de pagamento continua sendo
// registrada, mas quem decide o caminho do dinheiro é este campo.
export type DestinoRecebimento = "CREDIARIO" | "FATURAMENTO" | "SO_BAIXA";

export const destinoRecebimentoLabels: Record<DestinoRecebimento, string> = {
  CREDIARIO: "Caixa do Crediário",
  FATURAMENTO: "Faturamento de hoje (lança comanda)",
  SO_BAIXA: "Só baixa na dívida",
};

export const destinoRecebimentoExplica: Record<DestinoRecebimento, string> = {
  CREDIARIO:
    "Parcela de crediário paga em dinheiro. O valor entra no caixa do Crediário e você reconhece no lucro quando quiser, pelo botão da tela do Crediário. NÃO cria comanda — a venda que gerou a dívida já aconteceu antes, e lançar de novo contaria a receita duas vezes.",
  FATURAMENTO:
    "A dívida nunca teve comanda e o dinheiro entrou agora. O app cria a comanda, e o valor aparece no faturamento de hoje, no fechamento diário e na P12.",
  SO_BAIXA:
    "A comanda já foi lançada quando a venda aconteceu. Aqui só a dívida diminui — somar outra vez contaria o mesmo dinheiro duas vezes.",
};

/** O destino sugerido pela forma de pagamento (dinheiro é crediário). */
export function destinoSugerido(forma: string): DestinoRecebimento {
  return forma === "DINHEIRO" ? "CREDIARIO" : "SO_BAIXA";
}

/** Só o destino FATURAMENTO cria comanda. */
export function destinoGeraComanda(destino: DestinoRecebimento) {
  return destino === "FATURAMENTO";
}

/**
 * O aviso quando a combinação não faz sentido. Devolve "" quando está tudo bem.
 * Era exatamente a contradição silenciosa que fez os R$ 8.000 do crediário
 * sumirem do caixa em 17/08.
 */
export function avisoDoDestino(forma: string, destino: DestinoRecebimento) {
  if (destino === "CREDIARIO" && forma !== "DINHEIRO") {
    return "O caixa do Crediário é só para dinheiro em espécie. Nesta forma de pagamento, escolha faturamento ou só baixa.";
  }
  if (destino === "FATURAMENTO" && forma === "DINHEIRO") {
    return "Atenção: em dinheiro, lançar comanda coloca o valor no faturamento de hoje e ele NÃO vai para o caixa do Crediário. Se é parcela de crediário, escolha Caixa do Crediário.";
  }
  return "";
}

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
