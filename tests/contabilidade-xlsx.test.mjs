// PLANILHAS EXCEL PARA A CONTABILIDADE (07/08/2026).
// O .xlsx é gerado pelo nosso próprio escritor (zip + xml, sem dependência).
// Estes testes garantem: o arquivo é um ZIP válido com as partes que o Excel
// exige, as abas saem no formato que a contabilidade já usa, e os totais fecham.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-07", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp,
    TextEncoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Blob, URL, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}

const xlsx = loadTsModule("src/lib/xlsxWriter.ts");
const conta = loadTsModule("src/features/financeiro/contabilidadeXlsx.ts");

// ---- utilitário: abre o ZIP gerado e devolve os arquivos de dentro ----------
function abrirZip(buffer) {
  const arquivos = new Map();
  let i = 0;
  while (i < buffer.length - 4) {
    if (buffer.readUInt32LE(i) !== 0x04034b50) { i += 1; continue; }
    const metodo = buffer.readUInt16LE(i + 8);
    const tamanhoComprimido = buffer.readUInt32LE(i + 18);
    const tamanhoNome = buffer.readUInt16LE(i + 26);
    const tamanhoExtra = buffer.readUInt16LE(i + 28);
    const inicioNome = i + 30;
    const nome = buffer.slice(inicioNome, inicioNome + tamanhoNome).toString("utf8");
    const inicioDados = inicioNome + tamanhoNome + tamanhoExtra;
    const bruto = buffer.slice(inicioDados, inicioDados + tamanhoComprimido);
    arquivos.set(nome, metodo === 0 ? bruto.toString("utf8") : zlib.inflateRawSync(bruto).toString("utf8"));
    i = inicioDados + tamanhoComprimido;
  }
  return arquivos;
}

async function gerar(sheets) {
  const blob = xlsx.buildXlsx(sheets);
  return abrirZip(Buffer.from(await blob.arrayBuffer()));
}

const SHEET_SIMPLES = {
  name: "TESTE",
  title: "TÍTULO",
  subtitle: "sub",
  columns: [
    { header: "DATA", kind: "data" },
    { header: "DESCRIÇÃO" },
    { header: "VALOR", kind: "dinheiro" },
  ],
  rows: [["2026-08-03", "Conta A & B <teste>", 1234.56], ["2026-08-05", "Conta C", 10]],
  totalRow: ["TOTAL", "", 1244.56],
};

test("o arquivo gerado é um ZIP com todas as partes que o Excel exige", async () => {
  const partes = await gerar([SHEET_SIMPLES]);
  for (const obrigatorio of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) {
    assert.ok(partes.has(obrigatorio), `falta ${obrigatorio}`);
  }
  assert.ok(partes.get("xl/workbook.xml").includes('name="TESTE"'), "a aba aparece no workbook");
});

test("cada aba vira um sheetN.xml e todas são declaradas", async () => {
  const partes = await gerar([SHEET_SIMPLES, { ...SHEET_SIMPLES, name: "OUTRA" }, { ...SHEET_SIMPLES, name: "TERCEIRA" }]);
  assert.ok(partes.has("xl/worksheets/sheet3.xml"));
  const tipos = partes.get("[Content_Types].xml");
  for (const n of [1, 2, 3]) assert.ok(tipos.includes(`/xl/worksheets/sheet${n}.xml`), `sheet${n} declarado`);
  const rels = partes.get("xl/_rels/workbook.xml.rels");
  assert.ok(rels.includes("styles.xml"), "o estilo tem que estar ligado, senão a formatação some");
});

test("XML seguro: & < > nas descrições não corrompem o arquivo", async () => {
  const partes = await gerar([SHEET_SIMPLES]);
  const sheet = partes.get("xl/worksheets/sheet1.xml");
  assert.ok(sheet.includes("Conta A &amp; B &lt;teste&gt;"), "escapou os caracteres especiais");
  assert.ok(!/<t>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/.test(sheet), "nenhum & solto");
});

test("data vira número de série do Excel (para ordenar e filtrar de verdade)", () => {
  // 01/01/2026 = 46023 no calendário do Excel.
  assert.equal(xlsx.excelSerialDate("2026-01-01"), 46023);
  assert.equal(xlsx.excelSerialDate("2026-08-07"), 46241);
  assert.equal(xlsx.excelSerialDate("2026-08-07T16:15:03Z"), 46241, "ignora a hora");
  assert.equal(xlsx.excelSerialDate("sem data"), null);
});

test("valor sai como NÚMERO (não texto) para o contador somar", async () => {
  const partes = await gerar([SHEET_SIMPLES]);
  const sheet = partes.get("xl/worksheets/sheet1.xml");
  assert.ok(sheet.includes("<v>1234.56</v>"), "o dinheiro é número puro");
  assert.ok(!sheet.includes("1.234,56"), "não vai formatado como texto");
});

test("cabeçalho congelado e filtro ligados", async () => {
  const partes = await gerar([SHEET_SIMPLES]);
  const sheet = partes.get("xl/worksheets/sheet1.xml");
  assert.ok(sheet.includes('state="frozen"'), "painel congelado");
  assert.ok(sheet.includes("<autoFilter"), "filtro automático");
  assert.ok(sheet.includes("customWidth"), "largura de coluna definida");
});

test("nome de aba inválido é corrigido e duplicado ganha sufixo", async () => {
  const partes = await gerar([
    { ...SHEET_SIMPLES, name: "CONTAS/PAGAR:2026" },
    { ...SHEET_SIMPLES, name: "IGUAL" },
    { ...SHEET_SIMPLES, name: "IGUAL" },
  ]);
  const wb = partes.get("xl/workbook.xml");
  assert.ok(wb.includes("CONTAS-PAGAR-2026"), "trocou os caracteres proibidos");
  assert.ok(wb.includes('name="IGUAL"') && wb.includes('name="IGUAL (2)"'), "desduplicou");
});

// ---------------------------------------------------------------- as 5 abas
const CATS = [
  { id: "cat-fixo", groupKey: "CUSTO_FIXO", name: "Aluguel", sortOrder: 1, isCapex: false, active: true },
  { id: "cat-obra", groupKey: "CUSTO_VARIAVEL", name: "Obras 2026", sortOrder: 2, isCapex: true, active: true },
];
const VENDAS = [
  {
    id: "s1", saleDate: "2026-08-03", patientName: "Ana Paula", crmContactRef: "", notes: "", createdAt: "",
    items: [{ id: "i1", itemType: "TRATAMENTO", amount: 8000, description: "Protocolo completo" }, { id: "i2", itemType: "CONSULTA", amount: 500, description: "" }],
    payments: [{ id: "p1", method: "PIX", amount: 8500, installments: 1 }],
  },
  {
    id: "s2", saleDate: "2026-08-05", patientName: "Bruno Lima", crmContactRef: "", notes: "", createdAt: "",
    items: [{ id: "i3", itemType: "NUTRICIONISTA", amount: 300, description: "" }, { id: "i4", itemType: "SINAL", amount: 200, description: "" }],
    payments: [{ id: "p2", method: "CARTAO_CREDITO", amount: 500, installments: 3 }],
  },
];
const DESPESAS = [
  { id: "e1", description: "ALUGUEL 512", categoryRef: "cat-fixo", amount: 13989.23, dueDate: "2026-08-09", paidAt: "2026-08-09", method: "PIX", supplier: "Imobiliária", installmentNum: null, installmentTotal: null, documentNote: "NF 123", isCapex: false, notes: "", createdAt: "", recorrencia: null },
  { id: "e2", description: "MARCENARIA", categoryRef: "cat-obra", amount: 40000, dueDate: "2026-08-05", paidAt: null, method: "BOLETO", supplier: "Weelington", installmentNum: 2, installmentTotal: 3, documentNote: "", isCapex: true, notes: "", createdAt: "", recorrencia: null },
];
const COFRE = [
  { id: "m1", moveDate: "2026-08-03", direction: "ENTRADA", amount: 0.18, reason: "Rendimento do banco", source: "MANUAL", kind: "RENDIMENTO", monthRef: "2026-08", createdAt: "" },
  { id: "m2", moveDate: "2026-08-06", direction: "SAIDA", amount: 5000, reason: "Resgate CDB para a obra", source: "MANUAL", kind: "USO_OBRA", monthRef: "2026-08", createdAt: "" },
];
const DADOS = { sales: VENDAS, expenses: DESPESAS, categories: CATS, savingsMoves: COFRE, crediarioProfits: [], monthKey: "2026-08" };

test("as 5 abas saem na ordem que a contabilidade lê", () => {
  const abas = conta.buildPlanilhasContabilidade(DADOS);
  assert.equal(abas.map((a) => a.name).join(" | "), "RESUMO | ENTRADAS | RECEBIMENTOS | CONTAS A PAGAR | POUPANÇA (COFRE)");
  for (const aba of abas) {
    assert.ok(aba.title && aba.title.includes("AGOSTO/2026"), `${aba.name} tem título com o mês`);
    assert.ok(aba.columns.length > 0, `${aba.name} tem colunas`);
  }
});

test("ENTRADAS: grade diária no formato do arquivo que ele já envia", () => {
  const aba = conta.abaEntradasDiarias(DADOS);
  assert.equal(aba.columns.slice(0, 5).map((c) => c.header).join("|"), "DATA|ENTRADA TOTAL|DINHEIRO|PIX|CARTÃO");
  assert.equal(aba.rows.length, 2, "um dia por linha (03 e 05/08)");
  const dia3 = aba.rows.find((linha) => linha[0] === "2026-08-03");
  assert.equal(dia3[1], 8500, "entrada total do dia");
  assert.equal(dia3[3], 8500, "tudo em PIX");
  assert.equal(dia3[6], 8000, "medicação/tratamento");
  assert.equal(dia3[7], 500, "consulta");
  assert.equal(dia3[11], 0.18, "rendimento do dia");
  const dia5 = aba.rows.find((linha) => linha[0] === "2026-08-05");
  assert.equal(dia5[4], 500, "cartão");
  assert.equal(dia5[9], 300, "consulta nutri");
  assert.equal(aba.totalRow[1], 9000, "TOTAL do mês = 8.500 + 500");
});

test("CONTAS A PAGAR: cabeçalho igual ao do contador e coluna de pago", () => {
  const aba = conta.abaContasAPagar(DADOS);
  assert.equal(
    aba.columns.slice(0, 7).map((c) => c.header).join("|"),
    "DATA DE VENCIMENTO|DATA DE PAGAMENTO|DESCRIÇÃO DO DÉBITO|VALOR|FORMA DE PAGAMENTO|OBSERVAÇÃO|TABELA P12",
  );
  const aluguel = aba.rows.find((linha) => String(linha[2]).includes("ALUGUEL"));
  assert.equal(aluguel[1], "2026-08-09", "data de pagamento preenchida");
  assert.equal(aluguel[8], 13989.23, "entra na coluna de contas pagas");
  assert.ok(String(aluguel[6]).includes("1. Custo Fixo"), "categoria da P12 com o grupo");
  const marcenaria = aba.rows.find((linha) => String(linha[2]).includes("MARCENARIA"));
  assert.equal(marcenaria[1], "", "não paga = sem data de pagamento");
  assert.equal(marcenaria[8], 0, "não entra no total pago");
  assert.equal(marcenaria[7], "OBRA (investimento)", "obra marcada");
  assert.ok(String(marcenaria[5]).includes("parcela 2/3"), "parcela na observação");
  assert.equal(aba.totalRow[3], 53989.23, "total geral");
  assert.equal(aba.totalRow[8], 13989.23, "total pago");
});

test("POUPANÇA: entrou e saiu em colunas separadas, com saldo no total", () => {
  const aba = conta.abaPoupanca(DADOS);
  assert.equal(aba.rows.length, 2);
  assert.equal(aba.totalRow[4], 0.18, "entrou");
  assert.equal(aba.totalRow[5], 5000, "saiu");
  assert.ok(String(aba.totalRow[3]).includes("-4999.82"), "saldo do mês no rodapé");
});

test("RESUMO: aponta a aba de detalhe e mantém o crediário fora", () => {
  const aba = conta.abaResumo({ ...DADOS, crediarioProfits: [{ id: "c", monthRef: "2026-08", amount: 31250, note: "", includedAt: "" }] });
  const texto = aba.rows.map((linha) => linha.join(" ")).join("\n");
  assert.ok(texto.includes("CONTROLE INTERNO — NÃO ENTRA NA CONTABILIDADE"));
  assert.ok(texto.includes("31250"), "crediário aparece, mas na seção de controle interno");
  const faturamento = aba.rows.find((linha) => String(linha[0]).startsWith("Faturamento das comandas"));
  assert.equal(faturamento[1], 9000);
  assert.ok(String(faturamento[2]).includes("ENTRADAS"), "diz onde conferir");
});

test("RECEBIMENTOS: uma linha por comanda, com forma e parcelas", () => {
  const aba = conta.abaRecebimentos(DADOS);
  assert.equal(aba.rows.length, 2);
  assert.equal(aba.rows[0][1], "Ana Paula");
  assert.equal(aba.rows[1][4], "3x", "parcelas do cartão");
  assert.equal(aba.totalRow[5], 9000);
});

test("o arquivo final das 5 abas abre e tem conteúdo em todas", async () => {
  const partes = await gerar(conta.buildPlanilhasContabilidade(DADOS));
  for (const n of [1, 2, 3, 4, 5]) {
    const sheet = partes.get(`xl/worksheets/sheet${n}.xml`);
    assert.ok(sheet && sheet.includes("<sheetData>"), `sheet${n} tem dados`);
  }
  assert.equal(conta.nomeArquivoContabilidade("2026-08"), "Instituto-Bratan-contabilidade-2026-08.xlsx");
});
