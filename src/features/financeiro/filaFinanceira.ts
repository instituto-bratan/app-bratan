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
import type { FinExpense, FinPurchase } from "./financeiroData";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

export type AlertaFila = "SEM_ARQUIVO" | "SEM_NF" | "SEM_CONTA" | "ATRASADO" | "CHEGANDO";

export type ItemFila = {
  chave: string;
  tipo: "CONTA" | "COMPRA";
  titulo: string;
  detalhe: string;
  valor: number;
  /** Data que manda na coluna: vencimento (conta) ou entrega prevista (compra). */
  data: string;
  alerta?: AlertaFila;
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
  };
  /** A frase do topo: "Hoje vencem 3 (R$ 4.200) · 9 vencidas (R$ 47.143) · 2 boletos sem arquivo". */
  resumo: string;
};

function somaDias(iso: string, dias: number) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);

function itemDaConta(expense: FinExpense, notasAnexadas: Set<string>): ItemFila {
  const parcela = expense.installmentNum && expense.installmentTotal ? ` · ${expense.installmentNum}/${expense.installmentTotal}` : "";
  const semArquivo = expense.method === "BOLETO" && !expense.documentNote.trim() && !notasAnexadas.has(expense.id);
  return {
    chave: `conta:${expense.id}`,
    tipo: "CONTA",
    titulo: `${expense.description}${parcela}`,
    detalhe: [expense.supplier, expense.method ? expense.method.replace("_", " ").toLowerCase() : ""].filter(Boolean).join(" · "),
    valor: expense.amount || 0,
    data: expense.dueDate,
    alerta: semArquivo ? "SEM_ARQUIVO" : undefined,
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
}): FilaFinanceira {
  const { expenses, purchases, hoje } = input;
  const notasAnexadas = input.notasAnexadas ?? new Set<string>();
  const limite = somaDias(hoje, input.diasSemana ?? 7);
  const maisVelha = somaDias(hoje, -(input.maxVencidosDias ?? 90));
  const porData = (a: ItemFila, b: ItemFila) => a.data.localeCompare(b.data) || b.valor - a.valor;

  const abertas = expenses.filter((expense) => !expense.paidAt && expense.dueDate);
  const vencidas = abertas.filter((e) => e.dueDate < hoje && e.dueDate >= maisVelha).map((e) => itemDaConta(e, notasAnexadas)).sort(porData);
  const vencemHoje = abertas.filter((e) => e.dueDate === hoje).map((e) => itemDaConta(e, notasAnexadas)).sort(porData);
  const semana = abertas.filter((e) => e.dueDate > hoje && e.dueDate <= limite).map((e) => itemDaConta(e, notasAnexadas)).sort(porData);

  const pendencias: ItemFila[] = [];
  let pedidosSemNf = 0;
  let comprasSemConta = 0;
  let pedidosAtrasados = 0;
  for (const purchase of purchases) {
    const base = {
      tipo: "COMPRA" as const,
      titulo: purchase.description,
      valor: purchase.amount || 0,
      purchase,
    };
    if (!purchase.receivedAt && purchase.deliveryEta && purchase.deliveryEta <= hoje) {
      pedidosAtrasados += 1;
      pendencias.push({
        ...base,
        chave: `compra-entrega:${purchase.id}`,
        detalhe: `${purchase.supplier || "sem fornecedor"} · previsto ${purchase.deliveryEta.split("-").reverse().slice(0, 2).join("/")} — chegou?`,
        data: purchase.deliveryEta,
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
  };

  const partes: string[] = [];
  if (vencemHoje.length) partes.push(`hoje vencem ${vencemHoje.length} (${brl(totais.vencemHoje)})`);
  if (vencidas.length) partes.push(`${vencidas.length} vencida${vencidas.length > 1 ? "s" : ""} (${brl(totais.vencidas)})`);
  if (!vencemHoje.length && !vencidas.length) partes.push("nada vencido e nada para hoje");
  if (semana.length) partes.push(`${semana.length} nos próximos ${input.diasSemana ?? 7} dias (${brl(totais.semana)})`);
  if (boletosSemArquivo) partes.push(`${boletosSemArquivo} boleto${boletosSemArquivo > 1 ? "s" : ""} sem arquivo`);
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
    resumo: partes.join(" · "),
  };
}
