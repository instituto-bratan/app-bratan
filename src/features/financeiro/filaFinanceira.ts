// FILA DO DIA (02/09/2026, redesenho do Contas a Pagar + Compras).
//
// Diagnóstico com os dados de agosto: 98 contas, 37 lançadas DEPOIS de vencer
// (registradas para constar), 61 pagas com atraso em jul–ago, metade sem
// fornecedor nem documento; Compras caiu de 71 lançamentos em junho para 5 em
// agosto. Lucas: "está tendo muita falha… minha, de às vezes não olhar, de ficar
// confuso com os boletos, de anotar as compras das medicações".
//
// A resposta não é mais um campo: é uma AGENDA na frente da planilha. Esta
// função monta, a partir das contas e das compras que já existem, o que precisa
// de ação hoje — em quatro colunas — e uma frase em português que resume tudo.
// Nada é digitado aqui; é tudo derivado.
//
// DIA DE PAGAR (08/10/2026, regra do Lucas): conta que vence em sábado,
// domingo ou feriado é paga no DIA ÚTIL ANTERIOR. As colunas (vencidas · vence
// hoje · semana) passam a olhar o `pagarEm` (diaDePagar do vencimento), não o
// vencimento cru: o aluguel de sábado 10/10 entra em "vence hoje" (pagar hoje)
// na sexta 09/10 e só vira "vencida" depois desse dia. O contador do Início na
// casca usa esta mesma função, então muda junto.
import type { FinExpense, FinPurchase } from "./financeiroData";
import { configAtual } from "@/lib/configNegocio";
import { diaDePagar, motivoDePagarAntes } from "./filaFinanceiraDiaDePagar";

export { diaDePagar, ehDiaUtilDePagamento, ehFeriado, FERIADOS_SAO_PAULO, motivoDePagarAntes } from "./filaFinanceiraDiaDePagar";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

export type AlertaFila = "SEM_ARQUIVO" | "SEM_NF" | "SEM_CONTA" | "ATRASADO" | "CHEGANDO" | "AGUARDA_APROVACAO" | "RECUSADA";

export type ItemFila = {
  chave: string;
  tipo: "CONTA" | "COMPRA";
  titulo: string;
  detalhe: string;
  valor: number;
  /** Vencimento (conta) ou entrega prevista (compra). */
  data: string;
  /**
   * O dia que manda na coluna (08/10/2026): para a conta, o dia de pagar —
   * o vencimento, ou o dia útil anterior quando ele cai em sábado, domingo ou
   * feriado; para a compra, a própria data.
   */
  pagarEm: string;
  /** "vence no sábado, 10/10" quando a conta é paga antes do vencimento; senão null. */
  pagaAntes: string | null;
  alerta?: AlertaFila;
  /** APROVAÇÃO (14/09/2026, proposta 1.7): conta no limite ou acima que ainda não foi aprovada não pode ser paga pela fila. */
  aguardaAprovacao?: boolean;
  expense?: FinExpense;
  purchase?: FinPurchase;
};

export type FilaFinanceira = {
  hoje: string;
  vencidas: ItemFila[];
  vencemHoje: ItemFila[];
  semana: ItemFila[];
  /** Compras que chegaram/atrasaram, sem NF ou sem conta — o "chegou e falta lançar". */
  pendencias: ItemFila[];
  totais: {
    vencidas: number;
    vencemHoje: number;
    semana: number;
    boletosSemArquivo: number;
    pedidosSemNf: number;
    comprasSemConta: number;
    pedidosAtrasados: number;
    notasSemDecisao: number;
    aguardandoAprovacao: number;
  };
  /** Limite de aprovação que valeu na montagem (0 = sem aprovação). */
  limiteAprovacao: number;
  /** A frase do topo: "Hoje vencem 3 (R$ 4.200) · 9 vencidas (R$ 47.143) · 2 boletos sem arquivo". */
  resumo: string;
};

function somaDias(iso: string, dias: number) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);

/** Conta precisa de aprovação? Valor no limite ou acima e ainda não aprovada. Limite zero desliga a regra. */
export function precisaAprovacao(expense: FinExpense, limite: number) {
  if (!limite || limite <= 0) return false;
  if ((expense.amount || 0) < limite) return false;
  return expense.aprovacaoStatus !== "APROVADA";
}

function itemDaConta(expense: FinExpense, notasAnexadas: Set<string>, limiteAprovacao: number): ItemFila {
  const parcela = expense.installmentNum && expense.installmentTotal ? ` · ${expense.installmentNum}/${expense.installmentTotal}` : "";
  const semArquivo = expense.method === "BOLETO" && !expense.documentNote.trim() && !notasAnexadas.has(expense.id);
  const aguarda = precisaAprovacao(expense, limiteAprovacao);
  const recusada = expense.aprovacaoStatus === "RECUSADA";
  return {
    chave: `conta:${expense.id}`,
    tipo: "CONTA",
    titulo: `${expense.description}${parcela}`,
    detalhe: [expense.supplier, expense.method ? expense.method.replace("_", " ").toLowerCase() : ""].filter(Boolean).join(" · "),
    valor: expense.amount || 0,
    data: expense.dueDate,
    pagarEm: diaDePagar(expense.dueDate),
    pagaAntes: motivoDePagarAntes(expense.dueDate),
    alerta: recusada ? "RECUSADA" : aguarda ? "AGUARDA_APROVACAO" : semArquivo ? "SEM_ARQUIVO" : undefined,
    aguardaAprovacao: aguarda,
    expense,
  };
}

export function buildFilaFinanceira(input: {
  expenses: FinExpense[];
  purchases: FinPurchase[];
  /** ids de contas que já têm nota/boleto anexado (fin_expense_nota). */
  notasAnexadas?: Set<string>;
  hoje: string;
  diasSemana?: number;
  /** Vencidas mais velhas que isso ficam fora da fila (são caso da planilha, não do dia). */
  maxVencidosDias?: number;
  /** Compras mais velhas que isso não entram nas pendências (histórico fica em Compras). */
  maxCompraDias?: number;
  /** Limite de aprovação (R$). Sem informar, vale o das Configurações do negócio (padrão 5.000). */
  limiteAprovacao?: number;
}): FilaFinanceira {
  const { expenses, hoje } = input;
  const notasAnexadas = input.notasAnexadas ?? new Set<string>();
  const limiteAprovacao = input.limiteAprovacao ?? (configAtual<number>("aprovacao.limite", hoje) ?? 0);
  const limite = somaDias(hoje, input.diasSemana ?? 7);
  const maisVelha = somaDias(hoje, -(input.maxVencidosDias ?? 90));
  // Compra de 3 meses atrás sem "chegou" já chegou há muito tempo — ninguém vai
  // conferir; ela fica no histórico de Compras, não na fila do dia.
  const compraMaisVelha = somaDias(hoje, -(input.maxCompraDias ?? 60));
  const purchases = input.purchases.filter((purchase) => purchase.purchaseDate >= compraMaisVelha);
  const porData = (a: ItemFila, b: ItemFila) => a.pagarEm.localeCompare(b.pagarEm) || a.data.localeCompare(b.data) || b.valor - a.valor;

  // A coluna sai do DIA DE PAGAR (08/10/2026): sábado, domingo e feriado pagam
  // no dia útil anterior. A janela das vencidas (90 dias) continua no vencimento.
  const abertas = expenses
    .filter((expense) => !expense.paidAt && expense.dueDate)
    .map((expense) => ({ expense, pagar: diaDePagar(expense.dueDate) }));
  const itens = (lista: typeof abertas) => lista.map(({ expense }) => itemDaConta(expense, notasAnexadas, limiteAprovacao)).sort(porData);
  const vencidas = itens(abertas.filter(({ expense, pagar }) => pagar < hoje && expense.dueDate >= maisVelha));
  const vencemHoje = itens(abertas.filter(({ pagar }) => pagar === hoje));
  const semana = itens(abertas.filter(({ pagar }) => pagar > hoje && pagar <= limite));

  const pendencias: ItemFila[] = [];
  let pedidosSemNf = 0;
  let comprasSemConta = 0;
  let pedidosAtrasados = 0;
  for (const purchase of purchases) {
    const base = {
      tipo: "COMPRA" as const,
      titulo: purchase.description,
      valor: purchase.amount || 0,
      pagaAntes: null,
      purchase,
    };
    if (!purchase.receivedAt && purchase.deliveryEta && purchase.deliveryEta <= hoje) {
      pedidosAtrasados += 1;
      pendencias.push({
        ...base,
        chave: `compra-entrega:${purchase.id}`,
        detalhe: `${purchase.supplier || "sem fornecedor"} · previsto ${purchase.deliveryEta.split("-").reverse().slice(0, 2).join("/")} — chegou?`,
        data: purchase.deliveryEta,
        pagarEm: purchase.deliveryEta,
        alerta: purchase.deliveryEta < hoje ? "ATRASADO" : "CHEGANDO",
      });
    }
    if (purchase.receivedAt && !purchase.nfNote.trim()) {
      pedidosSemNf += 1;
      pendencias.push({
        ...base,
        chave: `compra-nf:${purchase.id}`,
        detalhe: `${purchase.supplier || "sem fornecedor"} · chegou ${purchase.receivedAt.split("-").reverse().slice(0, 2).join("/")} — falta a NF`,
        data: purchase.receivedAt,
        pagarEm: purchase.receivedAt,
        alerta: "SEM_NF",
      });
    }
    if (purchase.method === "BOLETO" && !purchase.expenseRef) {
      comprasSemConta += 1;
      pendencias.push({
        ...base,
        chave: `compra-conta:${purchase.id}`,
        detalhe: `${purchase.supplier || "sem fornecedor"} · boleto sem conta a pagar — não está na P12`,
        data: purchase.purchaseDate,
        pagarEm: purchase.purchaseDate,
        alerta: "SEM_CONTA",
      });
    }
  }
  pendencias.sort(porData);

  const mesAtual = hoje.slice(0, 7);
  const notasSemDecisao = expenses.filter(
    (expense) => (expense.notaStatus ?? "PENDENTE") === "PENDENTE" && (expense.dueDate || "").slice(0, 7) === mesAtual && !notasAnexadas.has(expense.id),
  ).length;
  const boletosSemArquivo = [...vencidas, ...vencemHoje, ...semana].filter((item) => item.alerta === "SEM_ARQUIVO").length;
  const aguardandoAprovacao = [...vencidas, ...vencemHoje, ...semana].filter((item) => item.aguardaAprovacao).length;

  const soma = (lista: ItemFila[]) => round2(lista.reduce((total, item) => total + item.valor, 0));
  const totais = {
    vencidas: soma(vencidas),
    vencemHoje: soma(vencemHoje),
    semana: soma(semana),
    boletosSemArquivo,
    pedidosSemNf,
    comprasSemConta,
    pedidosAtrasados,
    notasSemDecisao,
    aguardandoAprovacao,
  };

  const partes: string[] = [];
  // Com conta de fim de semana/feriado puxada para hoje, a frase diz "pagar hoje" e conta quantas são.
  const antecipadas = vencemHoje.filter((item) => item.pagaAntes).length;
  if (vencemHoje.length && !antecipadas) partes.push(`hoje vencem ${vencemHoje.length} (${brl(totais.vencemHoje)})`);
  if (antecipadas) {
    partes.push(
      `pagar hoje ${vencemHoje.length} (${brl(totais.vencemHoje)}; ${antecipadas} ${antecipadas === 1 ? "vence" : "vencem"} no fim de semana ou feriado)`,
    );
  }
  if (vencidas.length) partes.push(`${vencidas.length} vencida${vencidas.length > 1 ? "s" : ""} (${brl(totais.vencidas)})`);
  if (!vencemHoje.length && !vencidas.length) partes.push("nada vencido e nada para hoje");
  if (semana.length) partes.push(`${semana.length} nos próximos ${input.diasSemana ?? 7} dias (${brl(totais.semana)})`);
  if (boletosSemArquivo) partes.push(`${boletosSemArquivo} boleto${boletosSemArquivo > 1 ? "s" : ""} sem arquivo`);
  if (aguardandoAprovacao) partes.push(`${aguardandoAprovacao} aguardando aprovação`);
  if (pedidosAtrasados) partes.push(`${pedidosAtrasados} pedido${pedidosAtrasados > 1 ? "s" : ""} para conferir se chegou`);
  if (pedidosSemNf) partes.push(`${pedidosSemNf} compra${pedidosSemNf > 1 ? "s" : ""} sem NF`);
  if (comprasSemConta) partes.push(`${comprasSemConta} compra${comprasSemConta > 1 ? "s" : ""} sem conta a pagar`);

  return {
    hoje,
    vencidas,
    vencemHoje,
    semana,
    pendencias,
    totais,
    limiteAprovacao,
    resumo: partes.join(" · "),
  };
}

// ---- Conta parecida (08/09/2026) -------------------------------------------
// "Ficar confuso com os boletos" vira conta lançada duas vezes. Antes de gravar
// uma conta nova, o app procura uma parecida: mesmo valor com vencimento até 5
// dias de distância, ou mesma descrição no mesmo mês com o mesmo valor. Não
// bloqueia — pergunta.
function normaliza(texto: string) {
  return texto.trim().toLowerCase().replace(/\s+/g, " ");
}

export function contaParecida(
  expenses: FinExpense[],
  nova: { description: string; amount: number; dueDate: string; supplier?: string },
): FinExpense | null {
  const descricao = normaliza(nova.description);
  const fornecedor = normaliza(nova.supplier ?? "");
  const candidatas = expenses.filter((expense) => Math.abs((expense.amount || 0) - nova.amount) < 0.01);
  const mesmaDescricao = candidatas.find(
    (expense) => normaliza(expense.description) === descricao && expense.dueDate.slice(0, 7) === nova.dueDate.slice(0, 7),
  );
  if (mesmaDescricao) return mesmaDescricao;
  const perto = candidatas
    .filter((expense) => Math.abs(diasEntreDatas(expense.dueDate, nova.dueDate)) <= 5)
    .filter((expense) => !fornecedor || !expense.supplier || normaliza(expense.supplier) === fornecedor)
    .sort((a, b) => Math.abs(diasEntreDatas(a.dueDate, nova.dueDate)) - Math.abs(diasEntreDatas(b.dueDate, nova.dueDate)));
  return perto[0] ?? null;
}

function diasEntreDatas(de: string, ate: string) {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}
