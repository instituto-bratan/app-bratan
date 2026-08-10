// PLANILHAS PARA A CONTABILIDADE (07/08/2026, pedido do Lucas) — em Excel, uma
// aba por assunto, no MESMO formato dos arquivos que ele já envia hoje:
//   • "ENTRADA INSTITUTO BRATAN.xlsx" → grade diária (DATA · ENTRADA TOTAL ·
//     DINHEIRO · PIX · CARTAO · MEDICAÇÃO · CONSULTA · RENDIMENTO · PSI · NUTRI)
//   • "CONTAS A PAGAR- RECEBER.xlsx" → DATA DE VENCIMENTO · DATA DE PAGAMENTO ·
//     DESCRICAO DO DEBITO · VALOR · FORMAS DE PAGAMENTO · OBSERVACAO · TABELA P12
// Assim o contador recebe o que está acostumado a ler, sem retrabalho.
//
// Tudo derivado dos lançamentos. Nada digitado, nada inventado.
import type { XlsxSheet } from "@/lib/xlsxWriter";
import {
  buildGestaoMensal,
  consultaLikeTypes,
  finGroupLabels,
  monthKeyLabel,
  paymentMethodLabels,
  saleTotal,
  savingsKindLabels,
  type FinCategory,
  type FinCrediarioProfit,
  type FinExpense,
  type FinSale,
  type FinSavingsMove,
} from "./financeiroData";

export type DadosContabilidade = {
  sales: FinSale[];
  expenses: FinExpense[];
  categories: FinCategory[];
  savingsMoves: FinSavingsMove[];
  crediarioProfits: FinCrediarioProfit[];
  monthKey: string;
};

const noMes = (iso: string | null | undefined, monthKey: string) => (iso || "").slice(0, 7) === monthKey;

/** Arredonda para centavos: soma de float deixa ruído (53989.229999999996) e a
 *  planilha da contabilidade não pode ter número esquisito quando alguém clica. */
const cents = (valor: number) => Math.round(valor * 100) / 100;

/** Dias do mês que têm movimento (comanda ou rendimento), em ordem. */
function diasComMovimento(dados: DadosContabilidade) {
  const dias = new Set<string>();
  for (const sale of dados.sales) if (noMes(sale.saleDate, dados.monthKey)) dias.add(sale.saleDate.slice(0, 10));
  for (const move of dados.savingsMoves) {
    if (noMes(move.moveDate, dados.monthKey) && /rendimento/i.test(move.reason || "")) dias.add(move.moveDate.slice(0, 10));
  }
  return [...dias].sort();
}

// ---------------------------------------------------------------------------
// 1. ENTRADAS — a grade diária que a contabilidade já conhece.
// ---------------------------------------------------------------------------
export function abaEntradasDiarias(dados: DadosContabilidade): XlsxSheet {
  const dias = diasComMovimento(dados);
  const zerado = () => ({ total: 0, dinheiro: 0, pix: 0, cartao: 0, outros: 0, medicacao: 0, consulta: 0, psi: 0, nutri: 0, destravar: 0, rendimento: 0 });
  const porDia = new Map<string, ReturnType<typeof zerado>>(dias.map((dia) => [dia, zerado()]));

  for (const sale of dados.sales) {
    if (!noMes(sale.saleDate, dados.monthKey)) continue;
    const linha = porDia.get(sale.saleDate.slice(0, 10));
    if (!linha) continue;
    linha.total += saleTotal(sale);
    for (const pagamento of sale.payments) {
      const valor = pagamento.amount || 0;
      if (pagamento.method === "DINHEIRO") linha.dinheiro += valor;
      else if (pagamento.method === "PIX") linha.pix += valor;
      else if (pagamento.method === "CARTAO_CREDITO" || pagamento.method === "CARTAO_DEBITO") linha.cartao += valor;
      else linha.outros += valor;
    }
    for (const item of sale.items) {
      const valor = item.amount || 0;
      if (item.itemType === "TRATAMENTO") linha.medicacao += valor;
      else if (item.itemType === "PSICOLOGA") linha.psi += valor;
      else if (item.itemType === "NUTRICIONISTA") linha.nutri += valor;
      else if (item.itemType === "DESTRAVAR") linha.destravar += valor;
      else if (consultaLikeTypes.includes(item.itemType)) linha.consulta += valor;
    }
  }
  for (const move of dados.savingsMoves) {
    if (!noMes(move.moveDate, dados.monthKey)) continue;
    if (!/rendimento/i.test(move.reason || "") && move.kind !== "RENDIMENTO") continue;
    const linha = porDia.get(move.moveDate.slice(0, 10));
    if (linha) linha.rendimento += (move.direction === "ENTRADA" ? 1 : -1) * (move.amount || 0);
  }

  const colunas: XlsxSheet["columns"] = [
    { header: "DATA", width: 12, kind: "data" },
    { header: "ENTRADA TOTAL", width: 16, kind: "dinheiro" },
    { header: "DINHEIRO", width: 14, kind: "dinheiro" },
    { header: "PIX", width: 14, kind: "dinheiro" },
    { header: "CARTÃO", width: 14, kind: "dinheiro" },
    { header: "OUTROS", width: 13, kind: "dinheiro" },
    { header: "MEDICAÇÃO / TRATAMENTO", width: 22, kind: "dinheiro" },
    { header: "CONSULTA", width: 14, kind: "dinheiro" },
    { header: "CONSULTA PSI", width: 14, kind: "dinheiro" },
    { header: "CONSULTA NUTRI", width: 15, kind: "dinheiro" },
    { header: "DESTRAVAR 360", width: 15, kind: "dinheiro" },
    { header: "RENDIMENTO", width: 14, kind: "dinheiro" },
  ];
  const linhas = dias.map((dia) => {
    const d = porDia.get(dia)!;
    return [dia, d.total, d.dinheiro, d.pix, d.cartao, d.outros, d.medicacao, d.consulta, d.psi, d.nutri, d.destravar, d.rendimento];
  });
  const somar = (i: number) => cents(linhas.reduce((soma, linha) => soma + (Number(linha[i]) || 0), 0));

  return {
    name: "ENTRADAS",
    title: `CONTROLE DO VALOR FATURADO — ${monthKeyLabel(dados.monthKey).toUpperCase()}`,
    subtitle: "Instituto Bratan · gerado pelo APP BRATAN a partir das comandas do Lançar Dia (nada digitado à mão)",
    columns: colunas,
    rows: linhas,
    totalRow: ["TOTAL", ...Array.from({ length: colunas.length - 1 }, (_, i) => somar(i + 1))],
  };
}

// ---------------------------------------------------------------------------
// 2. RECEBIMENTOS — comanda por comanda, com a forma de pagamento.
// ---------------------------------------------------------------------------
export function abaRecebimentos(dados: DadosContabilidade): XlsxSheet {
  const doMes = dados.sales
    .filter((sale) => noMes(sale.saleDate, dados.monthKey))
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate));
  const linhas = doMes.map((sale) => [
    sale.saleDate,
    sale.patientName,
    sale.items.map((item) => item.description || "").filter(Boolean).join(" · ") || "—",
    sale.payments.map((p) => paymentMethodLabels[p.method] ?? p.method).join(" + "),
    sale.payments.map((p) => (p.installments && p.installments > 1 ? `${p.installments}x` : "1x")).join(" + "),
    saleTotal(sale),
  ]);
  return {
    name: "RECEBIMENTOS",
    title: `CONTROLE DE RECEBIMENTOS — ${monthKeyLabel(dados.monthKey).toUpperCase()}`,
    subtitle: `${doMes.length} comanda(s) · uma linha por atendimento, com a forma de pagamento`,
    columns: [
      { header: "DATA", width: 12, kind: "data" },
      { header: "PACIENTE", width: 34 },
      { header: "DESCRIÇÃO", width: 40 },
      { header: "FORMA DE PAGAMENTO", width: 26 },
      { header: "PARCELAS", width: 11 },
      { header: "VALOR RECEBIDO", width: 17, kind: "dinheiro" },
    ],
    rows: linhas,
    totalRow: ["TOTAL", "", "", "", "", cents(linhas.reduce((soma, linha) => soma + Number(linha[5]), 0))],
  };
}

// ---------------------------------------------------------------------------
// 3. CONTAS A PAGAR — cabeçalho igual ao arquivo que ele já envia.
// ---------------------------------------------------------------------------
export function abaContasAPagar(dados: DadosContabilidade): XlsxSheet {
  const porRef = new Map(dados.categories.map((categoria) => [categoria.id, categoria]));
  const doMes = dados.expenses
    .filter((expense) => noMes(expense.dueDate || expense.paidAt, dados.monthKey))
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

  const linhas = doMes.map((expense) => {
    const categoria = porRef.get(expense.categoryRef);
    const parcela = expense.installmentNum && expense.installmentTotal ? `${expense.installmentNum}/${expense.installmentTotal}` : "";
    const observacao = [parcela && `parcela ${parcela}`, expense.documentNote && `NF ${expense.documentNote}`, expense.notes]
      .filter(Boolean)
      .join(" · ");
    return [
      expense.dueDate || "",
      expense.paidAt || "",
      expense.description + (expense.supplier ? ` — ${expense.supplier}` : ""),
      expense.amount || 0,
      expense.method ? paymentMethodLabels[expense.method] ?? expense.method : "",
      observacao,
      categoria ? `${finGroupLabels[categoria.groupKey]} · ${categoria.name}` : expense.categoryRef,
      categoria?.isCapex ? "OBRA (investimento)" : "operacional",
      expense.paidAt ? expense.amount || 0 : 0,
    ];
  });

  const totalGeral = cents(linhas.reduce((soma, linha) => soma + Number(linha[3]), 0));
  const totalPago = cents(linhas.reduce((soma, linha) => soma + Number(linha[8]), 0));

  return {
    name: "CONTAS A PAGAR",
    title: `CONTAS A PAGAR — ${monthKeyLabel(dados.monthKey).toUpperCase()}`,
    subtitle: `${doMes.length} conta(s) · competência pelo vencimento · pago R$ ${totalPago.toFixed(2)} de R$ ${totalGeral.toFixed(2)}`,
    columns: [
      { header: "DATA DE VENCIMENTO", width: 19, kind: "data" },
      { header: "DATA DE PAGAMENTO", width: 19, kind: "data" },
      { header: "DESCRIÇÃO DO DÉBITO", width: 46 },
      { header: "VALOR", width: 15, kind: "dinheiro" },
      { header: "FORMA DE PAGAMENTO", width: 20 },
      { header: "OBSERVAÇÃO", width: 34 },
      { header: "TABELA P12", width: 40 },
      { header: "TIPO", width: 19 },
      { header: "VALOR TOTAL DE CONTAS PAGAS", width: 26, kind: "dinheiro" },
    ],
    rows: linhas,
    totalRow: ["TOTAL", "", `${doMes.length} conta(s)`, totalGeral, "", "", "", "", totalPago],
  };
}

// ---------------------------------------------------------------------------
// 4. POUPANÇA / COFRE — o que entrou e o que saiu da reserva.
// ---------------------------------------------------------------------------
export function abaPoupanca(dados: DadosContabilidade): XlsxSheet {
  const doMes = dados.savingsMoves
    .filter((move) => noMes(move.moveDate, dados.monthKey))
    .sort((a, b) => a.moveDate.localeCompare(b.moveDate));
  const linhas = doMes.map((move) => [
    move.moveDate,
    move.direction === "ENTRADA" ? "ENTRADA (guardou)" : "SAÍDA (usou)",
    move.kind ? savingsKindLabels[move.kind] ?? move.kind : "—",
    move.reason || "",
    move.direction === "ENTRADA" ? move.amount || 0 : 0,
    move.direction === "SAIDA" ? move.amount || 0 : 0,
  ]);
  const entradas = cents(linhas.reduce((soma, linha) => soma + Number(linha[4]), 0));
  const saidas = cents(linhas.reduce((soma, linha) => soma + Number(linha[5]), 0));
  return {
    name: "POUPANÇA (COFRE)",
    title: `MOVIMENTO DA POUPANÇA — ${monthKeyLabel(dados.monthKey).toUpperCase()}`,
    subtitle: "Reserva do Instituto: obra/CDB e provisões (13º, férias, impostos). Não é receita nem custo do dia a dia.",
    columns: [
      { header: "DATA", width: 12, kind: "data" },
      { header: "SENTIDO", width: 19 },
      { header: "TIPO", width: 26 },
      { header: "MOTIVO", width: 56 },
      { header: "ENTROU NO COFRE", width: 18, kind: "dinheiro" },
      { header: "SAIU DO COFRE", width: 18, kind: "dinheiro" },
    ],
    rows: linhas,
    totalRow: ["TOTAL", "", "", `saldo do mês: R$ ${cents(entradas - saidas).toFixed(2)}`, entradas, saidas],
  };
}

// ---------------------------------------------------------------------------
// 5. RESUMO — a folha de capa: tudo que entrou × tudo que saiu.
// ---------------------------------------------------------------------------
export function abaResumo(dados: DadosContabilidade): XlsxSheet {
  const g = buildGestaoMensal(dados.sales, dados.expenses, dados.categories, dados.monthKey, dados.crediarioProfits);
  const poupanca = abaPoupanca(dados);
  const entrouCofre = Number(poupanca.totalRow?.[4] ?? 0);
  const saiuCofre = Number(poupanca.totalRow?.[5] ?? 0);
  const pagoNoMes = dados.expenses
    .filter((expense) => noMes(expense.paidAt, dados.monthKey))
    .reduce((soma, expense) => soma + (expense.amount || 0), 0);
  const pagoNoMesCents = cents(pagoNoMes);

  const linhas: (string | number)[][] = [
    ["ENTRADAS", "", ""],
    ["Faturamento das comandas (valor faturado no mês)", g.faturamento, "aba ENTRADAS / RECEBIMENTOS"],
    ["  Medicação / tratamento", g.entradasTratamento, ""],
    ["  Consultas (consulta, bioimpedância, retorno, sinal)", g.entradasConsultas, ""],
    ["  Outras entradas (psicóloga, nutricionista, outros)", g.outrasEntradas, ""],
    ["Entrou no cofre / poupança", cents(entrouCofre), "aba POUPANÇA (COFRE)"],
    ["", "", ""],
    ["SAÍDAS", "", ""],
    ["Custos operacionais do mês (competência)", g.custosTotais, "aba CONTAS A PAGAR"],
    ["  Custos fixos", g.custosFixos, ""],
    ["  Folha e meritocracias", g.folhaMeritocracia, ""],
    ["  Custos variáveis", g.custosVariaveis, ""],
    ["  Provisões (13º, férias, impostos)", g.provisoes, ""],
    ["Obra / CAPEX (investimento, fora do lucro)", g.obra, "aba CONTAS A PAGAR — tipo OBRA"],
    ["Saiu do cofre / poupança", cents(saiuCofre), "aba POUPANÇA (COFRE)"],
    ["Total efetivamente pago no mês (caixa)", pagoNoMesCents, "aba CONTAS A PAGAR — data de pagamento"],
    ["", "", ""],
    ["RESULTADO", "", ""],
    ["Lucro operacional (faturamento − custos operacionais)", g.lucroLiquido, ""],
    ["Margem sobre o faturamento (%)", g.margem, "em percentual"],
    ["", "", ""],
    ["CONTROLE INTERNO — NÃO ENTRA NA CONTABILIDADE", "", ""],
    ["Crediário reconhecido no mês (caixa físico)", g.crediario, "somente conferência interna"],
    ["", "", ""],
    ["Comandas no mês", g.comandas, "quantidade"],
    ["Ticket médio (sem contar sinal)", g.ticketMedio, ""],
  ];

  return {
    name: "RESUMO",
    title: `FECHAMENTO PARA A CONTABILIDADE — ${monthKeyLabel(dados.monthKey).toUpperCase()}`,
    subtitle: "Instituto Bratan · folha de capa: tudo que entrou e tudo que saiu. Cada linha aponta a aba de detalhe.",
    columns: [
      { header: "ITEM", width: 52 },
      { header: "VALOR", width: 18, kind: "dinheiro" },
      { header: "ONDE CONFERIR", width: 38 },
    ],
    rows: linhas,
  };
}

/** As cinco abas na ordem em que a contabilidade lê. */
export function buildPlanilhasContabilidade(dados: DadosContabilidade): XlsxSheet[] {
  return [abaResumo(dados), abaEntradasDiarias(dados), abaRecebimentos(dados), abaContasAPagar(dados), abaPoupanca(dados)];
}

export function nomeArquivoContabilidade(monthKey: string) {
  return `Instituto-Bratan-contabilidade-${monthKey}.xlsx`;
}
