// FATURA DO CARTÃO IMPORTADA (29/09/2026).
//
// Não temos um arquivo real do Itaú aqui: as fixtures abaixo imitam o que o
// Itaú Empresas exporta (CSV/planilha com data · lançamento · valor, o texto do
// PDF com duas colunas e a seção de "próximas faturas", e o OFX). Quando o
// Lucas mandar o arquivo de verdade, ele entra como fixture nova aqui.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const fc = loadTs("src/features/financeiro/faturaCartao.ts");
const fin = loadTs("src/features/financeiro/financeiroData.ts");
const access = loadTs("src/lib/access.ts");
const guias = loadTs("src/lib/pageGuides.ts");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Mastercard, fatura que vence em 17/10/2026 (CSV com ; e cabeçalho do Itaú).
const CSV_MASTER = [
  "Itaú Empresas - Fatura do cartão de crédito",
  "Cartão;MASTERCARD 5502 XXXX XXXX 4321",
  "Vencimento;17/10/2026",
  "",
  "data;lançamento;valor",
  "10/09/2026;PAGAMENTO EFETUADO;-32.729,91",
  "02/09;STIN PHARMA 02/02;7.640,50",
  "21/09;MERCADOLIVRE*NEXBIOVITA;773,57",
  "15/09;SHEIN *SHEIN.COM;389,90",
  "16/09;SHEIN *SHEIN.COM;389,90",
  "18/09;UBER *TRIP HELP.UBER.COM;42,15",
  "20/09;ESTORNO MERCADOLIVRE*LOJA;59,90",
  "22/09;LOJA SEM NOME LTDA;\"1.234,56\"",
  "25/09;IOF COMPRA INTERNACIONAL;3,21",
  "25/09;ANUIDADE DIFERENCIADA 03/12;45,00",
  "27/09;FACEBK *ADS 5502 1234 5678 4321;500,00",
  "",
  "Total da fatura;;10.958,89",
].join("\n");

// VISA da obra: texto do PDF (duas colunas na mesma linha, seção de próximas faturas).
const PDF_VISA = [
  "Itaú Empresas",
  "Resumo da fatura",
  "Cartão VISA final 9876",
  "Vencimento 20/10/2026 Total desta fatura R$ 1.399,29",
  "Saldo anterior 23.519,93",
  "Lançamentos: compras e saques",
  "DATA ESTABELECIMENTO VALOR EM R$",
  "05/09 PAGAMENTO EFETUADO -23.519,93",
  "12/07 LEROY MERLIN MORUMBI 03/05 812,40 14/09 TELHANORTE 250,00",
  "15/09 MERCADOLIVRE*ESPELHOS 176,89",
  "18/09 GOOGLE *Workspace 120,00",
  "Lançamentos: produtos e serviços",
  "20/09 ANUIDADE 40,00",
  "Compras parceladas - próximas faturas",
  "12/07 LEROY MERLIN MORUMBI 04/05 812,40",
  "12/07 LEROY MERLIN MORUMBI 05/05 812,40",
  "Encargos cobrados nesta fatura",
  "Juros do rotativo 14,90% a.m.",
].join("\n");

const OFX = `OFXHEADER:100
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<CCACCTFROM><ACCTID>5502XXXXXXXX4321</ACCTID></CCACCTFROM>
<BANKTRANLIST><DTSTART>20260908<DTEND>20261007
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260921120000[-3:BRT]<TRNAMT>-773.57<MEMO>MERCADOLIVRE*NEXBIOVITA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260902<TRNAMT>-7640.50<MEMO>STIN PHARMA 02/02</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260920<TRNAMT>59.90<MEMO>ESTORNO MERCADOLIVRE*LOJA</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>-8354.17<DTASOF>20261007</LEDGERBAL>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

const compra = (id, purchaseDate, supplier, description, amount, extra = {}) => ({
  id, purchaseDate, supplier, description, amount, method: "CARTAO_CREDITO", card: null, installments: 1, ...extra,
});

const COMPRAS = [
  compra("p-stin", "2026-09-02", "Stin Pharma", "Stin — Tirzepatida 60mg · 15 unidades", 15281, { installments: 2 }),
  compra("p-ml", "2026-09-19", "Mercado Livre (NEXBIOVITA)", "Mercado Livre — insumos e curativos", 773.57, { card: "ITAU" }),
  compra("p-shein", "2026-09-15", "SHEIN", "Uniformes recepção", 389.9),
  compra("p-uber-longe", "2026-09-10", "Uber", "corrida", 42.15), // 8 dias: fora da janela
  compra("p-boleto", "2026-09-22", "Loja", "boleto", 1234.56, { method: "BOLETO" }), // não é cartão
  compra("p-santander", "2026-09-27", "Meta", "anúncio", 500, { card: "SANTANDER" }), // outro banco
];

const conta = (id, description, amount, dueDate, extra = {}) => ({
  id, description, categoryRef: "cat-fatura-cartao-credito", amount, dueDate, paidAt: null, method: "BOLETO", supplier: "",
  installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "", recorrencia: "MENSAL", ...extra,
});

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

test("valores e datas no jeito brasileiro (e do Excel)", () => {
  assert.equal(fc.valorDaCelula("1.234,56"), 1234.56);
  assert.equal(fc.valorDaCelula("-12,90"), -12.9);
  assert.equal(fc.valorDaCelula("12,90-"), -12.9);
  assert.equal(fc.valorDaCelula("(5,00)"), -5);
  assert.equal(fc.valorDaCelula("R$ 3,00"), 3);
  assert.equal(fc.valorDaCelula("R$ -1.000,00"), -1000);
  assert.equal(fc.valorDaCelula("199.9"), 199.9, "número do Excel");
  assert.equal(fc.valorDaCelula("texto"), null);
  // dd/mm sem ano: compra de dezembro na fatura de janeiro é do ano anterior
  assert.equal(fc.resolverData(fc.dataDaCelula("28/12"), "2027-01-17"), "2026-12-28");
  assert.equal(fc.resolverData(fc.dataDaCelula("02/09"), "2026-10-17"), "2026-09-02");
  assert.equal(fc.resolverData(fc.dataDaCelula("46275"), null), "2026-09-10", "série do Excel");
});

test("parcela no fim da descrição vira parcela; data não é confundida com parcela", () => {
  assert.deepEqual(plain(fc.separarParcela("STIN PHARMA 02/02")), { descricao: "STIN PHARMA", parcelaNum: 2, parcelaTotal: 2 });
  assert.deepEqual(plain(fc.separarParcela("LOJA PARC 03/06")), { descricao: "LOJA", parcelaNum: 3, parcelaTotal: 6 });
  assert.deepEqual(plain(fc.separarParcela("LOJA 3 DE 6")), { descricao: "LOJA", parcelaNum: 3, parcelaTotal: 6 });
  assert.equal(fc.separarParcela("LOJA 07/03").parcelaNum, null, "7 de 3 não existe");
});

test("CSV do Master: linhas, tipos, sinais, total, vencimento e final do cartão", () => {
  const lida = fc.lerFaturaDeConteudo(CSV_MASTER, "fatura.csv");
  assert.equal(lida.formato, "CSV");
  assert.equal(lida.vencimento, "2026-10-17");
  assert.equal(lida.totalDeclarado, 10958.89);
  assert.equal(lida.finalCartao, "4321");
  assert.equal(lida.linhas.length, 11);
  const por = (texto) => lida.linhas.find((linha) => linha.descricao.includes(texto));
  assert.equal(por("PAGAMENTO").tipo, "PAGAMENTO");
  assert.equal(por("PAGAMENTO").valor, -32729.91);
  const stin = por("STIN");
  assert.deepEqual([stin.tipo, stin.parcelaNum, stin.parcelaTotal, stin.valor, stin.data], ["PARCELA", 2, 2, 7640.5, "2026-09-02"]);
  // estorno veio positivo no arquivo: vira crédito (negativo)
  assert.deepEqual([por("ESTORNO").tipo, por("ESTORNO").valor], ["ESTORNO", -59.9]);
  assert.equal(por("IOF").tipo, "IOF");
  // anuidade parcelada continua anuidade (custo do cartão), não compra
  assert.equal(por("ANUIDADE").tipo, "ANUIDADE");
  assert.equal(por("LOJA SEM NOME").valor, 1234.56, "valor entre aspas com vírgula");
  // número do cartão nunca fica: só o final
  assert.ok(!lida.linhas.some((linha) => /5502|1234 5678/.test(linha.descricao)), "número do cartão vazou");
  assert.match(por("FACEBK").descricao, /final 4321/);
  // soma = total (o pagamento da fatura anterior fica fora)
  assert.equal(lida.somaLinhas, 10958.89);
  assert.ok(lida.avisos.some((aviso) => /pagamento da fatura anterior/.test(aviso)));
  assert.ok(!lida.avisos.some((aviso) => /diferença/.test(aviso)), "soma bate: não avisa diferença");
});

test("cabeçalho diferente: planilha com Parcela, US$ e R$, datas em série do Excel", () => {
  const serie = (iso) => String((Date.UTC(...iso.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))) - Date.UTC(1899, 11, 30)) / 86400000);
  const matriz = [
    ["Vencimento", serie("2026-10-17")],
    ["Data da compra", "Estabelecimento", "Parcela", "Valor em US$", "Valor em R$"],
    [serie("2026-09-10"), "AMAZON MKTPLACE", "", "0", "199.9"],
    [serie("2026-08-05"), "LEROY MERLIN", "2/3", "0", "300"],
    [serie("2026-09-12"), "OPENAI *CHATGPT", "", "20", "110.5"],
    ["Total da fatura", "", "", "", "610.4"],
  ];
  const lida = fc.lerFaturaDeMatriz(matriz, {}, "XLSX");
  assert.equal(lida.vencimento, "2026-10-17");
  assert.equal(lida.totalDeclarado, 610.4);
  assert.deepEqual(
    plain(lida.linhas.map((linha) => [linha.data, linha.descricao, linha.parcelaNum, linha.valor])),
    [
      ["2026-09-10", "AMAZON MKTPLACE", null, 199.9],
      ["2026-08-05", "LEROY MERLIN", 2, 300],
      ["2026-09-12", "OPENAI *CHATGPT", null, 110.5],
    ],
    "usa a coluna em R$, nunca a de US$",
  );
});

test("texto do PDF: duas colunas numa linha, próximas faturas fora, saldo anterior ignorado", () => {
  const lida = fc.lerFaturaDeConteudo(PDF_VISA, "fatura.pdf");
  assert.equal(lida.formato, "PDF");
  assert.equal(lida.vencimento, "2026-10-20");
  assert.equal(lida.totalDeclarado, 1399.29);
  assert.equal(lida.finalCartao, "9876");
  assert.deepEqual(
    plain(lida.linhas.map((linha) => [linha.data, linha.descricao, linha.parcelaNum, linha.valor, linha.tipo])),
    [
      ["2026-09-05", "PAGAMENTO EFETUADO", null, -23519.93, "PAGAMENTO"],
      ["2026-07-12", "LEROY MERLIN MORUMBI", 3, 812.4, "PARCELA"],
      ["2026-09-14", "TELHANORTE", null, 250, "COMPRA"],
      ["2026-09-15", "MERCADOLIVRE*ESPELHOS", null, 176.89, "COMPRA"],
      ["2026-09-18", "GOOGLE *Workspace", null, 120, "COMPRA"],
      ["2026-09-20", "ANUIDADE", null, 40, "ANUIDADE"],
    ],
  );
  assert.equal(lida.somaLinhas, 1399.29);
  assert.ok(lida.avisos.some((aviso) => /2 parcela\(s\) de próximas faturas/.test(aviso)));
});

test("soma que não bate com o total avisa em frase; sem total nem vencimento, pede para digitar", () => {
  const lida = fc.lerFaturaDeTexto("10/09 LOJA A 100,00\nTotal da fatura R$ 150,00");
  assert.ok(lida.avisos.some((aviso) => /soma das linhas dá R\$\s?100,00 e o total da fatura diz R\$\s?150,00/.test(aviso)), plain(lida.avisos).join(" | "));
  const semNada = fc.lerFaturaDeTexto("10/09/2026 LOJA A 100,00");
  assert.ok(semNada.avisos.some((aviso) => /Não achei o total/.test(aviso)));
  assert.ok(semNada.avisos.some((aviso) => /Não achei o vencimento/.test(aviso)));
});

test("OFX: débito é compra, crédito é estorno, final do cartão da conta", () => {
  const lida = fc.lerFaturaDeConteudo(OFX, "fatura.ofx");
  assert.equal(lida.formato, "OFX");
  assert.equal(lida.finalCartao, "4321");
  assert.equal(lida.fechamento, "2026-10-07");
  assert.equal(lida.totalDeclarado, 8354.17);
  assert.deepEqual(plain(lida.linhas.map((linha) => [linha.data, linha.valor, linha.tipo, linha.parcelaNum])), [
    ["2026-09-21", 773.57, "COMPRA", null],
    ["2026-09-02", 7640.5, "PARCELA", 2],
    ["2026-09-20", -59.9, "ESTORNO", null],
  ]);
});

// ---------------------------------------------------------------------------
// Categoria sugerida
// ---------------------------------------------------------------------------

test("categoria por nome: medicação, implante, obra, uniforme, frete, sistemas, custo do cartão", () => {
  const cat = (descricao, cartao = "ITAU_MASTER", tipo = "COMPRA", compraCasada = null) => fc.sugerirCategoria({ descricao, tipo }, cartao, compraCasada);
  assert.equal(cat("STIN PHARMA").categoriaRef, "cat-boletos-compra-medicacoes");
  assert.equal(cat("VICTALAB MANIPULACAO").categoriaRef, "cat-boletos-compra-medicacoes");
  assert.equal(cat("DROGASIL 123").categoriaRef, "cat-boletos-compra-medicacoes");
  assert.equal(cat("BIOS FARMACEUTICA").categoriaRef, "cat-boletos-compra-implantes-bios", "Biòs antes de farmácia");
  assert.equal(cat("CRISTINA MODAS").revisar, true, "CRISTINA não é Stin");
  assert.equal(cat("LEROY MERLIN MORUMBI").categoriaRef, "cat-compras-variaveis-obras-2026");
  assert.equal(cat("SHEIN *SHEIN.COM").categoriaRef, "cat-gastos-colaboradores-exames");
  assert.equal(cat("UBER *TRIP").categoriaRef, "cat-fretes-motoboy-uber");
  assert.equal(cat("UBER EATS").categoriaRef, "cat-compra-mensal-diaria-mercado");
  assert.equal(cat("GOOGLE *Workspace").categoriaRef, "cat-sistemas-fornecedores-computador");
  assert.equal(cat("FACEBK *ADS").categoriaRef, "cat-mensalidade-marketings");
  assert.equal(cat("IOF COMPRA INTERNACIONAL", "ITAU_MASTER", "IOF").categoriaRef, "cat-fatura-cartao-credito");
  // Mercado Livre é loja de tudo: sugere, mas pede revisão; no cartão da obra sugere obra
  const mlMaster = cat("MERCADOLIVRE*LOJA");
  assert.deepEqual([mlMaster.categoriaRef, mlMaster.revisar], ["cat-boletos-compra-insumos-geral", true]);
  assert.equal(cat("MERCADOLIVRE*LOJA", "ITAU_VISA").categoriaRef, "cat-compras-variaveis-obras-2026");
  // …a não ser que a compra casada diga o que era
  const pelaCompra = cat("MERCADOLIVRE*NEXBIOVITA", "ITAU_VISA", "COMPRA", { description: "Stin — Tirzepatida", supplier: "Stin Pharma" });
  assert.deepEqual([pelaCompra.categoriaRef, pelaCompra.origem, pelaCompra.revisar], ["cat-boletos-compra-medicacoes", "COMPRA", false]);
  // sem regra: categoria da fatura e "revise"
  const sem = cat("LOJA SEM NOME LTDA");
  assert.deepEqual([sem.categoriaRef, sem.revisar, sem.origem], ["cat-fatura-cartao-credito", true, "PADRAO"]);
  // categoria que não existe no banco cai na da fatura
  const semCategoria = fc.sugerirCategoria({ descricao: "CACAU SHOW", tipo: "COMPRA" }, "ITAU_MASTER", null, new Set(["cat-fatura-cartao-credito"]));
  assert.equal(semCategoria.categoriaRef, "cat-fatura-cartao-credito");
});

// ---------------------------------------------------------------------------
// Casamento com Compras
// ---------------------------------------------------------------------------

test("casamento: parcela pelo valor da parcela, ±5 dias, ±R$ 0,02, só cartão de crédito do Itaú", () => {
  const lida = fc.lerFaturaDeConteudo(CSV_MASTER, "fatura.csv");
  const casou = fc.casarComCompras(lida.linhas, COMPRAS);
  const porCompra = new Map([...casou.values()].map((c) => [c.compraId, c]));
  const linha = (ordem) => lida.linhas.find((item) => item.ordem === ordem);
  assert.match(linha(porCompra.get("p-stin").ordem).descricao, /STIN/, "parcela 2/2 de 15.281 = 7.640,50");
  assert.match(linha(porCompra.get("p-ml").ordem).descricao, /NEXBIOVITA/, "2 dias de diferença");
  assert.equal(porCompra.has("p-uber-longe"), false, "8 dias: não casa");
  assert.equal(porCompra.has("p-boleto"), false, "boleto não está na fatura");
  assert.equal(porCompra.has("p-santander"), false, "cartão de outro banco");
  // valor fora da tolerância
  const fora = fc.casarComCompras([{ ordem: 1, data: "2026-09-10", descricao: "X", parcelaNum: null, parcelaTotal: null, valor: 100.03, tipo: "COMPRA" }], [compra("c", "2026-09-10", "X", "X", 100)]);
  assert.equal(fora.size, 0, "3 centavos: não casa");
  const dentro = fc.casarComCompras([{ ordem: 1, data: "2026-09-10", descricao: "X", parcelaNum: null, parcelaTotal: null, valor: 100.02, tipo: "COMPRA" }], [compra("c", "2026-09-15", "X", "X", 100)]);
  assert.equal(dentro.size, 1, "2 centavos e 5 dias: casa");
});

test("casamento: nunca dois para um — duas linhas iguais, uma compra só", () => {
  const lida = fc.lerFaturaDeConteudo(CSV_MASTER, "fatura.csv");
  const casou = fc.casarComCompras(lida.linhas, COMPRAS);
  const sheinLinhas = lida.linhas.filter((linha) => linha.descricao.startsWith("SHEIN"));
  const casadas = sheinLinhas.filter((linha) => casou.has(linha.ordem));
  assert.equal(casadas.length, 1, "só uma das duas linhas SHEIN leva a compra");
  assert.equal(casadas[0].data, "2026-09-15", "fica com a de data mais próxima");
  const ids = [...casou.values()].map((c) => c.compraId);
  assert.equal(new Set(ids).size, ids.length, "nenhuma compra em duas linhas");
});

test("casamento: a linha mais exata leva a compra, mesmo vindo depois na fatura", () => {
  const linhas = [
    { ordem: 1, data: "2026-09-12", descricao: "LOJA", parcelaNum: null, parcelaTotal: null, valor: 50, tipo: "COMPRA" },
    { ordem: 2, data: "2026-09-10", descricao: "LOJA", parcelaNum: null, parcelaTotal: null, valor: 50, tipo: "COMPRA" },
  ];
  const casou = fc.casarComCompras(linhas, [compra("a", "2026-09-10", "Loja", "", 50)]);
  assert.equal(casou.get(2)?.compraId, "a");
  assert.equal(casou.has(1), false);
});

test("casamento: compra já ligada a outra fatura não casa de novo; manual vence o automático", () => {
  const lida = fc.lerFaturaDeConteudo(CSV_MASTER, "fatura.csv");
  const stinOrdem = lida.linhas.find((linha) => linha.descricao.includes("STIN")).ordem;
  const jaUsadas = new Set([fc.chaveDeUso("p-stin", 2)]);
  assert.equal(fc.casarComCompras(lida.linhas, COMPRAS, { jaUsadas }).has(stinOrdem), false, "parcela 2 já está em outra fatura");
  // a parcela 1 em outra fatura não impede a parcela 2 aqui
  assert.equal(fc.casarComCompras(lida.linhas, COMPRAS, { jaUsadas: new Set([fc.chaveDeUso("p-stin", 1)]) }).get(stinOrdem)?.compraId, "p-stin");
  // a pessoa disse "não é de Compras" → fica sem
  assert.equal(fc.casarComCompras(lida.linhas, COMPRAS, { manuais: { [stinOrdem]: null } }).has(stinOrdem), false);
  // a pessoa ligou à mão (mesmo fora da regra) → vale, e a compra não é usada de novo
  const manual = fc.casarComCompras(lida.linhas, COMPRAS, { manuais: { 1: "p-stin" } });
  assert.equal(manual.get(1)?.origem, "MANUAL");
  assert.equal([...manual.values()].filter((c) => c.compraId === "p-stin").length, 1);
});

test("resumo em frase: R$ X em N compras; Y já estavam em Compras; Z sem registro", () => {
  const lida = fc.lerFaturaDeConteudo(CSV_MASTER, "fatura.csv");
  const casou = fc.casarComCompras(lida.linhas, COMPRAS);
  const resumo = fc.resumoDaFatura(lida.linhas, casou, lida.totalDeclarado);
  assert.equal(resumo.compras, 7);
  assert.equal(resumo.jaEmCompras, 3);
  assert.equal(resumo.semRegistro, 4);
  assert.match(resumo.frase, /^R\$\s?10\.970,58 em 7 compras; 3 já estavam em Compras; 4 sem registro — revise\.$/);
  assert.match(resumo.complemento, /IOF, anuidade e juros/);
  assert.match(resumo.complemento, /estornos que abatem/);
  assert.match(resumo.complemento, /Total da fatura: R\$\s?10\.958,89/);
});

// ---------------------------------------------------------------------------
// Trava de duplicidade e conta de estimativa
// ---------------------------------------------------------------------------

test("trava: mesmo cartão/mês, mesmo arquivo, mesma conta — as três fecham", () => {
  const lida = fc.lerFaturaDeConteudo(CSV_MASTER, "fatura.csv");
  const assinatura = fc.assinaturaDaFatura(lida);
  const importada = { clientRef: "fatura-1", cartao: "ITAU_MASTER", mesRef: "2026-10", assinatura, expenseRef: "conta-master-out", total: 10958.89, createdAt: "2026-09-29T12:00:00Z" };
  const mesmoMes = fc.travaDeImportacao({ cartao: "ITAU_MASTER", mesRef: "2026-10", assinatura: "outra", expenseRef: null }, [importada]);
  assert.equal(mesmoMes.bloqueada, true);
  assert.match(mesmoMes.motivo, /já foi importada em 29\/09\/2026/);
  const mesmoArquivo = fc.travaDeImportacao({ cartao: "ITAU_VISA", mesRef: "2026-10", assinatura, expenseRef: null }, [importada]);
  assert.equal(mesmoArquivo.bloqueada, true, "o mesmo arquivo escolhido no cartão errado");
  assert.match(mesmoArquivo.motivo, /Este arquivo já foi importado/);
  const mesmaConta = fc.travaDeImportacao({ cartao: "ITAU_VISA", mesRef: "2026-11", assinatura: "x", expenseRef: "conta-master-out" }, [importada]);
  assert.equal(mesmaConta.bloqueada, true);
  const livre = fc.travaDeImportacao({ cartao: "ITAU_VISA", mesRef: "2026-10", assinatura: "x", expenseRef: "y" }, [importada]);
  assert.equal(livre.bloqueada, false);
});

test("assinatura: o mesmo conteúdo dá a mesma assinatura em outra ordem; conteúdo diferente, outra", () => {
  const lida = fc.lerFaturaDeConteudo(CSV_MASTER, "fatura.csv");
  const embaralhada = { ...lida, linhas: [...lida.linhas].reverse() };
  assert.equal(fc.assinaturaDaFatura(lida), fc.assinaturaDaFatura(embaralhada));
  const outra = { ...lida, linhas: lida.linhas.map((linha, i) => (i === 1 ? { ...linha, valor: linha.valor + 1 } : linha)) };
  assert.notEqual(fc.assinaturaDaFatura(lida), fc.assinaturaDaFatura(outra));
});

test("conta da fatura: atualiza a estimativa do cartão; com duas do mesmo cartão, não escolhe e avisa", () => {
  // Retrato de outubro/2026 em produção (29/09): duas contas de Master no mês.
  const contas = [
    conta("hist-exp-436~rec-2026-10", "FATURA ITAU MASTERCARD - INSTITUTO", 34737.59, "2026-10-17"),
    conta("fexp-d1e5~rec-2026-10", "Fatura cartão Itaú master", 28000, "2026-10-13"),
    conta("concil-fatura-itau-a-2026-07~rec-2026-10", "Fatura cartão Itaú VISA - OBRA", 15966.74, "2026-10-13"),
    conta("hist-exp-365", "FATURA SANTANDER", 285.15, "2026-10-20"),
    conta("fatura-generica", "FATURA ITAU", 100, "2026-10-19"),
    conta("outra-categoria", "VISA qualquer coisa", 50, "2026-10-10", { categoryRef: "cat-energia" }),
  ];
  const visa = fc.acharContaDaFatura(contas, "ITAU_VISA", "2026-10");
  assert.equal(visa.sugerida?.id, "concil-fatura-itau-a-2026-07~rec-2026-10");
  assert.deepEqual(plain(visa.candidatas.map((c) => c.id)), ["concil-fatura-itau-a-2026-07~rec-2026-10", "fatura-generica"], "sem Santander, sem outra categoria, sem o Master");
  const master = fc.acharContaDaFatura(contas, "ITAU_MASTER", "2026-10");
  assert.equal(master.sugerida, null, "duas do mesmo cartão: a pessoa escolhe");
  assert.equal(master.duplicadas.length, 2);
  // conta já ligada a outra fatura sai da lista
  const semLigada = fc.acharContaDaFatura(contas, "ITAU_VISA", "2026-10", new Set(["concil-fatura-itau-a-2026-07~rec-2026-10"]));
  assert.equal(semLigada.sugerida, null);
});

// ---------------------------------------------------------------------------
// Rateio e a regra de não contar em dobro
// ---------------------------------------------------------------------------

test("rateio: soma sempre o total; diferença não explicada fica na categoria da fatura; pagamento fora", () => {
  const itens = [
    { valor: 7640.5, tipo: "PARCELA", categoriaRef: "cat-boletos-compra-medicacoes" },
    { valor: 773.57, tipo: "COMPRA", categoriaRef: "cat-boletos-compra-insumos-geral" },
    { valor: -59.9, tipo: "ESTORNO", categoriaRef: "cat-boletos-compra-insumos-geral" },
    { valor: 3.21, tipo: "IOF", categoriaRef: "cat-fatura-cartao-credito" },
    { valor: -32729.91, tipo: "PAGAMENTO", categoriaRef: "cat-fatura-cartao-credito" },
  ];
  const rateio = plain(fc.rateioDaFatura(itens, 8400));
  assert.deepEqual(rateio, [
    { categoriaRef: "cat-boletos-compra-medicacoes", valor: 7640.5 },
    { categoriaRef: "cat-boletos-compra-insumos-geral", valor: 713.67 },
    { categoriaRef: "cat-fatura-cartao-credito", valor: 45.83 }, // 3,21 de IOF + 42,62 que as linhas não explicam
  ]);
  const soma = rateio.reduce((s, l) => s + l.valor, 0);
  assert.equal(Math.round(soma * 100) / 100, 8400);
});

test("não conta em dobro: a conta da fatura é TROCADA pelos pedaços — total do mês igual, obra sai do lucro", () => {
  const cats = fin.seedFinCategories;
  const fatura = conta("conta-visa-out", "Fatura cartão Itaú VISA - OBRA", 1399.29, "2026-10-20", { paidAt: "2026-10-20" });
  const luz = { ...conta("luz", "Enel", 800, "2026-10-10"), categoryRef: "cat-energia" };
  const rateioBanco = [
    { expenseRef: "conta-visa-out", categoriaRef: "cat-compras-variaveis-obras-2026", valor: 1239.29 }, // Leroy + Telhanorte + ML
    { expenseRef: "conta-visa-out", categoriaRef: "cat-sistemas-fornecedores-computador", valor: 120 },
    { expenseRef: "conta-visa-out", categoriaRef: "cat-fatura-cartao-credito", valor: 40 }, // anuidade
  ];
  const antes = [fatura, luz];
  const depois = fc.explodirContasDeFatura(antes, rateioBanco);

  // a conta some e volta em pedaços: 3 pedaços (sistemas, obra, e o da própria categoria com o id original)
  assert.equal(depois.length, 4);
  assert.equal(Math.round(depois.reduce((s, e) => s + e.amount, 0) * 100) / 100, Math.round((1399.29 + 800) * 100) / 100, "nada somado ao lado");
  const original = depois.find((e) => e.id === "conta-visa-out");
  assert.equal(original.amount, 40, "o pedaço da categoria da fatura mantém o id da conta");
  assert.ok(depois.filter((e) => fc.ehPedacoDeRateio(e.id)).every((e) => e.paidAt === "2026-10-20" && e.dueDate === "2026-10-20"), "pedaços com o mesmo vencimento e pagamento");

  const p12Antes = fin.buildP12Matrix([], antes, cats, 2026);
  const p12Depois = fin.buildP12Matrix([], depois, cats, 2026);
  const out = 9;
  // antes: a fatura inteira era custo operacional; depois: a parte de obra vai para a obra
  assert.equal(p12Antes.totalExpensesMonths[out] + p12Antes.capexMonths[out], p12Depois.totalExpensesMonths[out] + p12Depois.capexMonths[out], "o dinheiro do mês é o mesmo");
  assert.equal(Math.round(p12Depois.capexMonths[out] * 100) / 100, 1239.29);
  assert.equal(Math.round(p12Depois.totalExpensesMonths[out] * 100) / 100, Math.round((800 + 120 + 40) * 100) / 100);
  const linha = (m, id) => m.groups.flatMap((g) => g.rows).find((r) => r.category.id === id).months[out].total;
  assert.equal(linha(p12Depois, "cat-sistemas-fornecedores-computador"), 120);
  assert.equal(linha(p12Depois, "cat-fatura-cartao-credito"), 40);
  assert.equal(linha(p12Antes, "cat-fatura-cartao-credito"), 1399.29);
});

test("não conta em dobro: conta editada depois (juros de atraso) — a diferença fica na conta, soma continua fechando", () => {
  const fatura = conta("c", "Fatura Master", 1050, "2026-10-17");
  const depois = fc.explodirContasDeFatura([fatura], [
    { expenseRef: "c", categoriaRef: "cat-boletos-compra-medicacoes", valor: 1000 },
  ]);
  assert.deepEqual(plain(depois.map((e) => [e.categoryRef, e.amount])), [
    ["cat-boletos-compra-medicacoes", 1000],
    ["cat-fatura-cartao-credito", 50],
  ]);
  // conta sem rateio passa intacta; sem rateio nenhum, a lista é a mesma
  assert.equal(fc.explodirContasDeFatura([fatura], []).length, 1);
  assert.equal(fc.explodirContasDeFatura([fatura], [{ expenseRef: "outra", categoriaRef: "x", valor: 1 }])[0], fatura);
});

test("Lucro Inteligente lê pelo rateio: a parte de obra da fatura sai do operacional", () => {
  const lucro = loadTs("src/features/financeiro/lucroInteligente.ts");
  const cats = fin.seedFinCategories;
  const fatura = conta("c", "Fatura VISA", 1000, "2026-10-20");
  const rateio = [{ expenseRef: "c", categoriaRef: "cat-compras-variaveis-obras-2026", valor: 600 }];
  const [antes] = lucro.avaliacaoInstantanea([], [fatura], cats, [], ["2026-10"]).meses;
  const [depois] = lucro.avaliacaoInstantanea([], fc.explodirContasDeFatura([fatura], rateio), cats, [], ["2026-10"]).meses;
  assert.equal(antes.operacional, 1000);
  assert.equal(depois.operacional, 400);
  assert.equal(depois.investimento, 600);
});

// ---------------------------------------------------------------------------
// Acesso, rota, menu, guia (a "cola" entre telas)
// ---------------------------------------------------------------------------

test("acesso: só o financeiro completo vê a fatura linha a linha; exceção por pessoa vale", () => {
  const nivel = (cargo, acessos = {}) => access.moduleLevel({ cargo, acessos }, "fin-fatura");
  for (const cargo of ["gestor_financeiro", "dr_daniel", "ceo"]) assert.equal(nivel(cargo), "EDITAR", cargo);
  for (const cargo of ["gestor", "secretaria_executiva", "recepcionista", "marketing", "enfermeira", "limpeza"]) assert.equal(nivel(cargo), "OCULTO", cargo);
  assert.equal(nivel("gestor", { "fin-fatura": "VER" }), "VER");
  assert.ok(access.moduleKeys.includes("fin-fatura"));
  assert.match(access.moduleLabels["fin-fatura"], /Fatura do cartão/);
});

test("rota, menu, ⌘K, pré-carga e guia da tela nova estão ligados", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const layout = fs.readFileSync("src/layouts/AppLayout.tsx", "utf8");
  const preload = fs.readFileSync("src/lib/routePreload.ts", "utf8");
  assert.match(app, /path="\/financeiro\/fatura-cartao"/);
  assert.match(layout, /href: "\/financeiro\/fatura-cartao"[^\n]*module: "fin-fatura"/);
  assert.match(layout, /rotulo: "Importar fatura do cartão", href: "\/financeiro\/fatura-cartao"/);
  assert.match(preload, /finFaturaCartao: namedPage\(\(\) => import\("@\/features\/financeiro\/FinanceiroFaturaCartaoPage"\), "FinanceiroFaturaCartaoPage"\)/);
  assert.match(preload, /pathname === "\/financeiro\/fatura-cartao"\) return "finFaturaCartao"/);
  const guia = guias.findPageGuide("/financeiro/fatura-cartao");
  assert.ok(guia && guia.steps.length >= 3);
  assert.equal(guia.title, "Fatura do cartão");
});

test("migration: tabelas, RLS do financeiro completo e as travas no banco", () => {
  const sql = fs.readFileSync("supabase/migrations/202609290005_fatura_do_cartao.sql", "utf8");
  for (const trecho of [
    "create table if not exists public.fin_fatura_cartao ",
    "create table if not exists public.fin_fatura_cartao_item ",
    "fin_fatura_cartao_mes_uidx",
    "fin_fatura_cartao_assinatura_uidx",
    "fin_fatura_cartao_conta_uidx",
    "fin_fatura_cartao_item_compra_parcela_uidx",
    "enable row level security",
    "public.is_financeiro_full(auth.uid())",
    "create or replace function public.fin_fatura_confirmar(p jsonb)",
    "create or replace function public.fin_fatura_rateio(p_ano integer)",
  ]) {
    assert.ok(sql.includes(trecho), `falta na migration: ${trecho}`);
  }
  // os tipos do banco são os mesmos do app
  const tipos = sql.match(/tipo text not null check \(tipo in \(([^)]+)\)\)/)[1].split(",").map((t) => t.trim().replace(/'/g, ""));
  assert.deepEqual(tipos.sort(), Object.keys(fc.tipoLinhaLabels).sort());
  const cartoes = sql.match(/cartao text not null check \(cartao in \(([^)]+)\)\)/)[1].split(",").map((t) => t.trim().replace(/'/g, ""));
  assert.deepEqual(cartoes.sort(), plain(fc.cartoesFatura.map((c) => c.id)).sort());
});
