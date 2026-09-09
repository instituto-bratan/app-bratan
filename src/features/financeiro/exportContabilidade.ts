// EXPORTAÇÕES PARA A CONTABILIDADE (09/09/2026, pedido do Lucas) — no MESMO
// formato dos arquivos que a clínica mandava quando tudo era planilha:
//
//   • "1) PDCA DR DANIEL"            → bloco CONSULTAS (paciente, data, situação,
//                                      valor do tratamento aderido) + bloco
//                                      TRATAMENTOS DE CONTINUIDADE + resumo.
//                                      Regra do Lucas: "o PDCA só entra
//                                      tratamentos — não é consulta, nem sinal,
//                                      nem nada". A consulta aparece só como
//                                      marcador (passou pelo doutor); o VALOR é
//                                      sempre o do plano/tratamento.
//   • "CONTROLE DE IMPOSTOS CONSULTA / TRATAMENTO" → DATA EMISSÃO · DATA DA
//                                      COMANDA · Nº NOTA · VALOR NOTA · ISS 2% ·
//                                      PIS 0,65% · COFINS 3% · IRPJ · CSLL ·
//                                      TOTAL, com linha TOTAL DE IMPOSTOS e os
//                                      dois subtotais (mensal × trimestral).
//   • "ENTRADA INSTITUTO BRATAN"     → ENTRADA POUPANÇA (data, valor) lado a
//                                      lado com SAÍDA OBRA (data, valor) e TOTAL.
//
// Tudo derivado dos lançamentos. Nada digitado, nada inventado.
import type { XlsxSheet } from "@/lib/xlsxWriter";
import {
  finTaxRates,
  invoiceTaxClass,
  invoiceTaxes,
  monthKeyLabel,
  saleItemTypeLabels,
  p12MonthLabels,
  type FinInvoice,
  type FinInvoiceTaxClass,
  type FinSale,
  type FinSavingsMove,
  type P12Matrix,
} from "./financeiroData";
import { naturezaDoItem } from "./naturezaItem";
import { PLANO_VALOR_MINIMO, valorTratamento, type PdcaResumo, type PdcaStatus } from "./pdcaData";

const cents = (valor: number) => Math.round(valor * 100) / 100;
const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const soma = (valores: number[]) => cents(valores.reduce((total, valor) => total + valor, 0));

// ---------------------------------------------------------------------------
// 1. PDCA — só tratamentos.
// ---------------------------------------------------------------------------
const situacaoPdca: Record<PdcaStatus, string> = {
  ADERIU: "ADERIU TRATAMENTO",
  ADERIU_DEPOIS: "FECHOU TRATAMENTO DEPOIS",
  NAO_ADERIU: "NÃO ADERIU TRATAMENTO",
};

/** Nome dos itens de plano/tratamento da comanda (o que foi aderido). */
function descricaoDoTratamento(sale: FinSale) {
  const nomes = sale.items
    .filter((item) => {
      const natureza = naturezaDoItem(item);
      return natureza === "PLANO" || natureza === "TRATAMENTO";
    })
    .map((item) => (item.description || "").trim() || saleItemTypeLabels[item.itemType] || item.itemType);
  return [...new Set(nomes)].join(" + ");
}

export type DadosPdcaContabilidade = {
  pdca: PdcaResumo;
  /** Todas as comandas carregadas (o builder filtra o mês). */
  sales: FinSale[];
  monthKey: string;
};

/** Bloco 1 — CONSULTAS: quem passou pelo doutor e o tratamento que aderiu (valor só do tratamento). */
export function abaPdcaConsultas(dados: DadosPdcaContabilidade): XlsxSheet {
  const linhas = [...dados.pdca.rows]
    .sort((a, b) => a.sale.saleDate.localeCompare(b.sale.saleDate) || a.sale.patientName.localeCompare(b.sale.patientName, "pt-BR"))
    .map((row) => [
      row.sale.patientName || "—",
      row.sale.saleDate,
      situacaoPdca[row.status],
      row.status === "NAO_ADERIU" ? row.detail || "" : descricaoDoTratamento(row.sale) || row.detail || "",
      row.tratamento > 0 ? cents(row.tratamento) : 0,
    ]);
  const total = soma(linhas.map((linha) => Number(linha[4])));
  const aderiram = dados.pdca.rows.filter((row) => row.status !== "NAO_ADERIU").length;
  return {
    name: "CONSULTAS",
    title: `PDCA DR DANIEL — CONSULTAS DE ${monthKeyLabel(dados.monthKey).toUpperCase()}`,
    subtitle: `${dados.pdca.rows.length} paciente(s) atendido(s) · ${aderiram} aderiram · valor = só o tratamento/plano (sem consulta, sem sinal, sem medicação avulsa)`,
    columns: [
      { header: "NOME DO PACIENTE", width: 36 },
      { header: "DATA", width: 12, kind: "data" },
      { header: "SITUAÇÃO", width: 30 },
      { header: "TRATAMENTO / OBSERVAÇÃO", width: 48 },
      { header: "VALOR DO TRATAMENTO", width: 22, kind: "dinheiro" },
    ],
    rows: linhas,
    totalRow: ["TOTAL DE TRATAMENTOS ADERIDOS EM CONSULTA", "", `${aderiram} de ${dados.pdca.rows.length}`, "", total],
  };
}

/** Comandas do mês com plano/tratamento que NÃO estão no PDCA (paciente já em acompanhamento, sem consulta). */
export function tratamentosDeContinuidade(sales: FinSale[], pdca: PdcaResumo, monthKey: string) {
  const noPdca = new Set(pdca.rows.map((row) => row.sale.id));
  return sales
    .filter((sale) => sale.saleDate.slice(0, 7) === monthKey && !noPdca.has(sale.id))
    .map((sale) => ({ sale, tratamento: cents(valorTratamento(sale)), descricao: descricaoDoTratamento(sale) }))
    .filter((linha) => linha.tratamento > 0)
    .sort((a, b) => a.sale.saleDate.localeCompare(b.sale.saleDate) || a.sale.patientName.localeCompare(b.sale.patientName, "pt-BR"));
}

/** Bloco 2 — TRATAMENTOS DE CONTINUIDADE (a segunda tabela da planilha antiga). */
export function abaPdcaContinuidade(dados: DadosPdcaContabilidade): XlsxSheet {
  const continuidade = tratamentosDeContinuidade(dados.sales, dados.pdca, dados.monthKey);
  const linhas = continuidade.map((linha) => [linha.sale.patientName || "—", linha.sale.saleDate, linha.descricao || "Continuidade do tratamento", linha.tratamento]);
  return {
    name: "TRATAMENTOS CONTINUIDADE",
    title: `PDCA DR DANIEL — TRATAMENTOS DE CONTINUIDADE · ${monthKeyLabel(dados.monthKey).toUpperCase()}`,
    subtitle: "Paciente já em acompanhamento que pagou tratamento no mês sem passar pela consulta (plano fechado sem consulta já está em CONSULTAS). Medicação avulsa não entra.",
    columns: [
      { header: "NOME DO PACIENTE", width: 36 },
      { header: "DATA", width: 12, kind: "data" },
      { header: "TRATAMENTO", width: 48 },
      { header: "VALOR", width: 20, kind: "dinheiro" },
    ],
    rows: linhas,
    totalRow: ["TOTAL DE TRATAMENTOS DE CONTINUIDADE NO MÊS", "", "", soma(linhas.map((linha) => Number(linha[3])))],
  };
}

/** Bloco 3 — RESUMO: os números que a planilha antiga pedia para somar à mão. */
export function abaPdcaResumo(dados: DadosPdcaContabilidade): XlsxSheet {
  const rows = dados.pdca.rows;
  const aderiram = rows.filter((row) => row.status !== "NAO_ADERIU");
  const naoAderiram = rows.filter((row) => row.status === "NAO_ADERIU");
  const totalConsultas = soma(rows.map((row) => row.tratamento));
  const continuidade = tratamentosDeContinuidade(dados.sales, dados.pdca, dados.monthKey);
  const totalContinuidade = soma(continuidade.map((linha) => linha.tratamento));
  const pct = rows.length ? Math.round((aderiram.length / rows.length) * 1000) / 10 : 0;
  return {
    name: "RESUMO",
    title: `PDCA DR DANIEL — RESUMO DE ${monthKeyLabel(dados.monthKey).toUpperCase()}`,
    subtitle: `Adesão = plano de acompanhamento (tratamento ≥ ${brl(PLANO_VALOR_MINIMO)}) ou fechou depois. Só tratamentos entram no valor.`,
    columns: [
      { header: "INDICADOR", width: 58 },
      { header: "QUANTIDADE", width: 14, kind: "numero" },
      { header: "VALOR", width: 20, kind: "dinheiro" },
    ],
    rows: [
      ["Pacientes atendidos no mês (passaram pela consulta ou fecharam plano)", rows.length, null],
      ["Aderiram tratamento (no dia ou depois)", aderiram.length, totalConsultas],
      ["Não aderiram tratamento", naoAderiram.length, null],
      ["Porcentagem de adesão", `${pct.toFixed(1).replace(".", ",")}%`, null],
      ["Ticket médio do plano (só adesões)", aderiram.length, dados.pdca.ticketPlano],
      ["Tratamentos de continuidade (sem consulta no mês)", continuidade.length, totalContinuidade],
      ["Sinais aguardando a consulta (fora da conta)", dados.pdca.sinaisAguardando.length, null],
    ],
    totalRow: ["TOTAL DE TRATAMENTOS DO MÊS", aderiram.length + continuidade.length, cents(totalConsultas + totalContinuidade)],
  };
}

export function abasPdcaContabilidade(dados: DadosPdcaContabilidade): XlsxSheet[] {
  return [abaPdcaResumo(dados), abaPdcaConsultas(dados), abaPdcaContinuidade(dados)];
}

// ---------------------------------------------------------------------------
// 2. CONTROLE DE IMPOSTOS — uma planilha por classe (consulta × tratamento).
// ---------------------------------------------------------------------------
const pctLabel = (taxa: number) => `${(taxa * 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")}%`;

export const rotuloClasseImposto: Record<FinInvoiceTaxClass, string> = {
  CONSULTA: "CONSULTA",
  PROCEDIMENTO: "TRATAMENTO",
};

export function abaControleImpostos(invoices: FinInvoice[], classe: FinInvoiceTaxClass, monthKey: string): XlsxSheet {
  const taxas = classe === "CONSULTA" ? finTaxRates.CONSULTA : finTaxRates.TRATAMENTO;
  const doMes = invoices
    .filter((invoice) => invoice.issueDate.slice(0, 7) === monthKey && invoiceTaxClass(invoice.invoiceType) === classe)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.invoiceNumber.localeCompare(b.invoiceNumber, "pt-BR", { numeric: true }));
  const linhas = doMes.map((invoice) => {
    const imposto = invoiceTaxes(invoice.invoiceType, invoice.amount);
    // Cada tributo arredondado em centavos e o total = soma das colunas, para a
    // planilha fechar linha a linha (como o contador confere).
    const partes = [imposto.iss, imposto.pis, imposto.cofins, imposto.irpj, imposto.csll].map(cents);
    return [invoice.issueDate, invoice.comandaDate || "", invoice.invoiceNumber, cents(invoice.amount), ...partes, soma(partes)];
  });
  const col = (indice: number) => soma(linhas.map((linha) => Number(linha[indice])));
  const mensal = cents(col(4) + col(5) + col(6));
  const trimestral = cents(col(7) + col(8));
  const totalPct = pctLabel(taxas.iss + taxas.pis + taxas.cofins + taxas.irpj + taxas.csll);
  return {
    name: `IMPOSTOS ${rotuloClasseImposto[classe]}`,
    title: `CONTROLE DE IMPOSTOS — ${rotuloClasseImposto[classe]} · ${monthKeyLabel(monthKey).toUpperCase()}`,
    subtitle: `${doMes.length} nota(s) · IMP MENSAL (ISS+PIS+COFINS) ${brl(mensal)} · IMP TRIMESTRAL (IRPJ+CSLL) ${brl(trimestral)} · alíquota total ${totalPct}`,
    columns: [
      { header: "DATA EMISSÃO", width: 14, kind: "data" },
      { header: "DATA DA COMANDA", width: 16, kind: "data" },
      { header: "Nº NOTA", width: 10 },
      { header: "VALOR NOTA", width: 16, kind: "dinheiro" },
      { header: `ISS ${pctLabel(taxas.iss)}`, width: 13, kind: "dinheiro" },
      { header: `PIS ${pctLabel(taxas.pis)}`, width: 13, kind: "dinheiro" },
      { header: `COFINS ${pctLabel(taxas.cofins)}`, width: 14, kind: "dinheiro" },
      { header: `IRPJ ${pctLabel(taxas.irpj)}`, width: 13, kind: "dinheiro" },
      { header: `CSLL ${pctLabel(taxas.csll)}`, width: 13, kind: "dinheiro" },
      { header: `${totalPct} IMP TOTAL`, width: 16, kind: "dinheiro" },
    ],
    rows: linhas,
    totalRow: ["TOTAL DE IMPOSTOS", "", `${doMes.length} NF`, col(3), col(4), col(5), col(6), col(7), col(8), col(9)],
  };
}

// ---------------------------------------------------------------------------
// 3. ENTRADA POUPANÇA × SAÍDA OBRA — lado a lado, como na planilha antiga.
// ---------------------------------------------------------------------------
const ehSaidaObra = (move: FinSavingsMove) => move.direction === "SAIDA" && (move.kind === "USO_OBRA" || /obra/i.test(move.reason || ""));

export function abaEntradaPoupanca(savingsMoves: FinSavingsMove[], monthKey: string): XlsxSheet {
  const doMes = savingsMoves.filter((move) => move.moveDate.slice(0, 7) === monthKey).sort((a, b) => a.moveDate.localeCompare(b.moveDate));
  const entradas = doMes.filter((move) => move.direction === "ENTRADA");
  const obra = doMes.filter(ehSaidaObra);
  const outras = doMes.filter((move) => move.direction === "SAIDA" && !ehSaidaObra(move));
  const altura = Math.max(entradas.length, obra.length, outras.length);
  const linhas = Array.from({ length: altura }, (_, i) => [
    entradas[i]?.moveDate ?? "",
    entradas[i] ? cents(entradas[i].amount || 0) : null,
    "",
    obra[i]?.moveDate ?? "",
    obra[i] ? cents(obra[i].amount || 0) : null,
    "",
    outras[i]?.moveDate ?? "",
    outras[i] ? cents(outras[i].amount || 0) : null,
    outras[i]?.reason ?? "",
  ]);
  const totalEntradas = soma(entradas.map((move) => move.amount || 0));
  const totalObra = soma(obra.map((move) => move.amount || 0));
  const totalOutras = soma(outras.map((move) => move.amount || 0));
  const colunas: XlsxSheet["columns"] = [
    { header: "ENTRADA POUPANÇA · DATA", width: 22, kind: "data" },
    { header: "VALOR", width: 16, kind: "dinheiro" },
    { header: "", width: 3 },
    { header: "SAÍDA OBRA · DATA", width: 20, kind: "data" },
    { header: "VALOR", width: 16, kind: "dinheiro" },
  ];
  const total: XlsxSheet["totalRow"] = ["TOTAL", totalEntradas, "", "TOTAL", totalObra];
  if (outras.length) {
    colunas.push({ header: "", width: 3 }, { header: "OUTRAS SAÍDAS · DATA", width: 22, kind: "data" }, { header: "VALOR", width: 16, kind: "dinheiro" }, { header: "MOTIVO", width: 40 });
    total.push("", "TOTAL", totalOutras, "");
  }
  return {
    name: "ENTRADA POUPANÇA",
    title: `ENTRADA INSTITUTO BRATAN — POUPANÇA · ${monthKeyLabel(monthKey).toUpperCase()}`,
    subtitle: `Entrou no cofre ${brl(totalEntradas)} · saiu para a obra ${brl(totalObra)}${outras.length ? ` · outras saídas ${brl(totalOutras)}` : ""}`,
    columns: colunas,
    rows: outras.length ? linhas : linhas.map((linha) => linha.slice(0, 5)),
    totalRow: total,
  };
}


// ---------------------------------------------------------------------------
// 4. P12 — a matriz do ano (categoria × mês), igual à tela, para mandar.
// ---------------------------------------------------------------------------
export type OpcoesP12 = {
  /** Índices dos meses (0–11) a mostrar; null = os 12. */
  meses?: number[] | null;
  /** Esconde categoria sem valor no ano (o mesmo botão "Só categorias com valor"). */
  soComValor?: boolean;
};

const ouVazio = (valor: number) => (Math.abs(valor) > 0.005 ? cents(valor) : null);

export function abaP12(matrix: P12Matrix, opcoes: OpcoesP12 = {}): XlsxSheet {
  const meses = opcoes.meses && opcoes.meses.length ? opcoes.meses : Array.from({ length: 12 }, (_, i) => i);
  const soComValor = opcoes.soComValor ?? true;
  // Mandar por mês (Lucas, 09/09): a planilha do mês mostra SÓ o mês — sem a
  // coluna anual. A anual só aparece quando saem os 12 meses.
  const anoInteiro = meses.length === 12;
  const somaMeses = (porMes: (mes: number) => number) => meses.reduce((total, mes) => total + porMes(mes), 0);
  const linha = (rotulo: string, porMes: (mes: number) => number, ano: number): (string | number | null)[] => [
    rotulo,
    ...meses.map((mes) => ouVazio(porMes(mes))),
    ...(anoInteiro ? [ouVazio(ano)] : []),
  ];
  const rows: XlsxSheet["rows"] = [];
  rows.push(linha("FATURAMENTO BRUTO", (m) => matrix.revenueMonths[m].total, matrix.revenueYear));
  rows.push(linha("Rendimento financeiro (juros)", (m) => matrix.financialIncomeMonths[m], matrix.financialIncomeYear));
  if (matrix.crediarioYear > 0.005) rows.push(linha("Crediário somado ao faturamento", (m) => matrix.crediarioMonths[m], matrix.crediarioYear));
  for (const group of matrix.groups) {
    // "Só categorias com valor" olha o período mostrado: no mês, esconde quem não teve valor no mês.
    const categorias = group.rows.filter((row) => !soComValor || Math.abs(somaMeses((m) => row.months[m].total)) > 0.005);
    if (soComValor && categorias.length === 0 && Math.abs(somaMeses((m) => group.months[m].total)) < 0.005) continue;
    rows.push(linha(group.label.toUpperCase(), (m) => group.months[m].total, group.yearTotal));
    for (const row of categorias) rows.push(linha(`   ${row.category.name}`, (m) => row.months[m].total, row.yearTotal));
  }
  rows.push(linha("TOTAL DESPESAS OPERACIONAIS", (m) => matrix.totalExpensesMonths[m], matrix.totalExpensesYear));
  if (matrix.capexYear > 0.005) rows.push(linha("Obra / investimento (pago pelo cofre — fora do lucro)", (m) => matrix.capexMonths[m], matrix.capexYear));
  const aportesAno = matrix.savingsInYear - matrix.financialIncomeYear;
  if (aportesAno > 0.005) {
    rows.push(linha("Aportes / entradas no cofre (tesouraria — fora do lucro)", (m) => matrix.savingsInMonths[m] - matrix.financialIncomeMonths[m], aportesAno));
  }
  const periodo = meses.length === 12 ? String(matrix.year) : `${meses.map((m) => p12MonthLabels[m]).join(", ")}/${matrix.year}`;
  return {
    name: `P12 ${matrix.year}`.slice(0, 31),
    title: `P12 — INSTITUTO BRATAN · ${periodo.toUpperCase()}`,
    subtitle: `Lucro operacional = faturamento + juros${matrix.crediarioYear > 0.005 ? " + crediário reconhecido" : ""} − despesas operacionais (obra e aportes ficam fora). Competência pelo vencimento.${soComValor ? " Só categorias com valor." : ""}`,
    columns: [
      { header: "CATEGORIA", width: 46 },
      ...meses.map((m) => ({ header: anoInteiro ? p12MonthLabels[m].toUpperCase() : `${p12MonthLabels[m].toUpperCase()}/${matrix.year}`, width: anoInteiro ? 14 : 18, kind: "dinheiro" as const })),
      ...(anoInteiro ? [{ header: "ANUAL", width: 16, kind: "dinheiro" as const }] : []),
    ],
    rows,
    totalRow: linha("LUCRO OPERACIONAL DO MÊS", (m) => matrix.profitMonths[m], matrix.profitYear),
  };
}
