// MAQUININHA × EXTRATO (regra do Lucas, 10/08/2026): toda TRANSFERÊNCIA AUTOM.
// RECEBIDA é o adiantamento da maquininha — o crédito de ontem caindo hoje,
// líquido da taxa. Tem que bater com os créditos das comandas da véspera.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-10", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
    TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Blob, URL, Response, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const ex = loadTsModule("src/features/financeiro/extratoBanco.ts");

function venda(id, dia, pagamentos, paciente = "P" + id) {
  return {
    id, saleDate: dia, patientName: paciente, crmContactRef: "", notes: "", createdAt: "",
    items: [{ id: `${id}-i`, itemType: "TRATAMENTO", amount: pagamentos.reduce((s, p) => s + p.amount, 0), description: "" }],
    payments: pagamentos.map((p, i) => ({ id: `${id}-p${i}`, installments: 1, ...p })),
  };
}
const extrato = (linhas) => ex.lerExtratoDeTexto(["Data;Lançamento;Razão;Doc;Valor;Saldo", ...linhas].join("\n"));

test("maquininha: transferência = crédito da véspera menos a taxa → OK", () => {
  // cartão de 04/08 (10.000) cai em 05/08 como 9.200 (taxa 8%)
  const entradas = extrato(["05/08/2026;TRANSFERÊNCIA AUTOM. RECEBIDA 0138.46448-2;;;9200,00;"]);
  const vendas = [venda("a", "2026-08-04", [{ method: "CARTAO_CREDITO", amount: 10000 }])];
  const balde = ex.conciliarExtrato(entradas, vendas, [], [], "2026-08-01", "2026-08-07");
  assert.equal(balde.maquininha.situacao, "OK");
  assert.equal(balde.maquininha.transferencias, 9200);
  assert.equal(balde.maquininha.cartaoComandas, 10000);
  assert.equal(balde.maquininha.taxaImplicita, 8);
  assert.match(balde.maquininha.leitura, /taxa da maquininha/);
});

test("maquininha: caiu MAIS do que as comandas de cartão → venda no crédito sem comanda", () => {
  const entradas = extrato(["05/08/2026;TRANSFERÊNCIA AUTOM. RECEBIDA 0138.46448-2;;;12000,00;"]);
  const vendas = [venda("a", "2026-08-04", [{ method: "CARTAO_CREDITO", amount: 10000 }])];
  const balde = ex.conciliarExtrato(entradas, vendas, [], [], "2026-08-01", "2026-08-07");
  assert.equal(balde.maquininha.situacao, "SOBROU_NO_BANCO");
  assert.match(balde.maquininha.leitura, /sem comanda/);
});

test("maquininha: diferença muito acima da taxa → crédito que não caiu ou comanda errada", () => {
  const entradas = extrato(["05/08/2026;TRANSFERÊNCIA AUTOM. RECEBIDA 0138.46448-2;;;6000,00;"]);
  const vendas = [venda("a", "2026-08-04", [{ method: "CARTAO_CREDITO", amount: 10000 }])];
  const balde = ex.conciliarExtrato(entradas, vendas, [], [], "2026-08-01", "2026-08-07");
  assert.equal(balde.maquininha.situacao, "FALTOU_CAIR");
  assert.equal(balde.maquininha.taxaImplicita, 40);
});

test("maquininha: transferência sem NENHUMA comanda de cartão na véspera acusa", () => {
  const entradas = extrato(["05/08/2026;TRANSFERÊNCIA AUTOM. RECEBIDA 0138.46448-2;;;3000,00;"]);
  const balde = ex.conciliarExtrato(entradas, [], [], [], "2026-08-01", "2026-08-07");
  assert.equal(balde.maquininha.situacao, "SOBROU_NO_BANCO");
  assert.match(balde.maquininha.leitura, /falta lançar comanda/i);
});

test("maquininha: janela deslocada — cartão de 31/07 conta para transferências de agosto", () => {
  const entradas = extrato(["01/08/2026;TRANSFERÊNCIA AUTOM. RECEBIDA 0138.46448-2;;;920,00;"]);
  const vendas = [venda("a", "2026-07-31", [{ method: "CARTAO_DEBITO", amount: 1000 }])];
  const balde = ex.conciliarExtrato(entradas, vendas, [], [], "2026-08-01", "2026-08-07");
  assert.equal(balde.maquininha.cartaoComandas, 1000, "a véspera do dia 01 é 31/07");
  assert.equal(balde.maquininha.situacao, "OK");
});

test("maquininha: rendimento NÃO entra na soma das transferências", () => {
  const entradas = extrato([
    "05/08/2026;TRANSFERÊNCIA AUTOM. RECEBIDA 0138.46448-2;;;920,00;",
    "05/08/2026;RENDIMENTOS REND PAGO APLIC AUT MAIS;;;500,00;",
  ]);
  const vendas = [venda("a", "2026-08-04", [{ method: "CARTAO_CREDITO", amount: 1000 }])];
  const balde = ex.conciliarExtrato(entradas, vendas, [], [], "2026-08-01", "2026-08-07");
  assert.equal(balde.maquininha.transferencias, 920, "só a transferência, sem o rendimento");
  assert.equal(balde.maquininha.situacao, "OK");
});

test("maquininha: sem transferência e sem cartão → SEM_DADOS, nada de alarme falso", () => {
  const entradas = extrato(["05/08/2026;PIX RECEBIDO FULANO;FULANO;;100,00;"]);
  const balde = ex.conciliarExtrato(entradas, [], [], [], "2026-08-01", "2026-08-07");
  assert.equal(balde.maquininha.situacao, "SEM_DADOS");
});

test("resgate de CDB NÃO conta como adiantamento da maquininha", () => {
  // Achado na conciliação de 12/08/2026: um resgate de CDB de R$ 40.000,22 caía
  // na mesma regra da transferência automática e inflava a conferência do cartão
  // (aparecia como "caiu 40 mil de cartão a mais"). São coisas diferentes: a
  // transferência é crédito da véspera; o resgate é dinheiro da obra voltando.
  const entradas = extrato([
    "10/08/2026;RESGATE CDB DI;;;40000,22;",
    "11/08/2026;TRANSFERÊNCIA AUTOM. RECEBIDA 0138.46448-2;;;20010,59;",
  ]);
  const vendas = [venda("a", "2026-08-10", [{ method: "CARTAO_CREDITO", amount: 21200 }])];
  const balde = ex.conciliarExtrato(entradas, vendas, [], [], "2026-08-01", "2026-08-12");
  assert.equal(balde.maquininha.transferencias, 20010.59, "só a transferência automática");
  assert.equal(balde.maquininha.situacao, "OK");
  const cdb = balde.casadas.find((item) => /RESGATE/i.test(item.entry.description));
  assert.ok(cdb, "o resgate casa sozinho");
  assert.match(cdb.comQue, /CDB \(obra\/cofre\)/);
  assert.ok(!balde.entrouSemRegistro.length, "e não vira 'entrou sem comanda'");
});

test("REND PAGO APLIC AUT APR também é rendimento (não é venda)", () => {
  const entradas = extrato(["11/08/2026;REND PAGO APLIC AUT APR;;;0,11;"]);
  const balde = ex.conciliarExtrato(entradas, [], [], [], "2026-08-01", "2026-08-12");
  assert.equal(balde.entrouSemRegistro.length, 0, "antes aparecia como venda sem comanda");
  assert.match(balde.casadas[0].comQue, /rendimento/);
  assert.equal(balde.maquininha.transferencias, 0);
});

test("chave do lançamento ignora a descrição (o Itaú reescreve o texto)", () => {
  // Caso real (14/08/2026): o MESMO rendimento de R$ 0,11 saiu como
  // "REND PAGO APLIC AUT APR" num export e "RENDIMENTOS REND PAGO APLIC AUT
  // MAIS" no outro; a MESMA transferência de R$ 6.169,37 saiu como
  // "...RECEBIDA 0138.46448-2" e depois "...RECEBIDA AAB". Com a descrição na
  // chave, reimportar duplicava e o total do mês mentia.
  const a = ex.refDoLancamento("2026-08-11", 0.11, "", 0);
  const b = ex.refDoLancamento("2026-08-11", 0.11, "", 0);
  assert.equal(a, b, "mesma data, mesmo valor, mesmo documento = mesma linha");
  const antes = ex.lerExtratoDeTexto(["Data;Lanc;Razao;Doc;Valor;Saldo", "11/08/2026;REND PAGO APLIC AUT APR;;;0,11;"].join("\n"));
  const depois = ex.lerExtratoDeTexto(["Data;Lanc;Razao;Doc;Valor;Saldo", "11/08/2026;RENDIMENTOS REND PAGO APLIC AUT MAIS;;;0,11;"].join("\n"));
  assert.equal(antes[0].clientRef, depois[0].clientRef, "descrição diferente NÃO cria linha nova");
});

test("dois lançamentos de valor igual no mesmo dia continuam sendo duas linhas", () => {
  // 04/08: PIX de R$ 200 da Lilian e R$ 200 do Ullysses — mesmo dia, mesmo
  // valor, pessoas diferentes. Não podem colapsar em uma.
  const lidas = ex.lerExtratoDeTexto([
    "Data;Lanc;Razao;Doc;Valor;Saldo",
    "04/08/2026;PIX RECEBIDO LILIAN;LILIAN BRUMANA;187.963.788-08;200,00;",
    "04/08/2026;PIX RECEBIDO ULLYSSE;ULLYSSES FRANCO;000.600.736-83;200,00;",
  ].join("\n"));
  assert.equal(lidas.length, 2);
  assert.notEqual(lidas[0].clientRef, lidas[1].clientRef);
});

test("valores iguais no mesmo dia SEM documento também não colapsam", () => {
  const lidas = ex.lerExtratoDeTexto([
    "Data;Lanc;Razao;Doc;Valor;Saldo",
    "10/08/2026;TARIFA;;;-8,82;",
    "10/08/2026;TARIFA;;;-8,82;",
  ].join("\n"));
  assert.equal(lidas.length, 2, "a ocorrência (0, 1) separa lançamentos idênticos");
  assert.notEqual(lidas[0].clientRef, lidas[1].clientRef);
});

test("conta paga em 2 lançamentos só casa se for a MESMA pessoa/empresa", () => {
  // Caso real: uma comanda de R$ 1.500 da Luana "casava" com o PIX de R$ 1.000
  // do Gustavo + o de R$ 500 do Jonas — e escondia dois problemas de verdade.
  const entradas = ex.lerExtratoDeTexto([
    "Data;Lanc;Razao;Doc;Valor;Saldo",
    "10/08/2026;PIX QR CODE RECEBIDO GUSTAVO;GUSTAVO ALVES;415.557.868-98;1000,00;",
    "10/08/2026;PIX RECEBIDO JONAS;JONAS TADEU;170.145.568-43;500,00;",
  ].join("\n"));
  const comanda = {
    id: "s1", saleDate: "2026-08-10", patientName: "luana silva", crmContactRef: "", notes: "", createdAt: "",
    items: [{ id: "i", itemType: "TRATAMENTO", amount: 1500, description: "" }],
    payments: [{ id: "p", method: "PIX", amount: 1500, installments: 1 }],
  };
  const balde = ex.conciliarExtrato(entradas, [comanda], [], [], "2026-08-01", "2026-08-14");
  assert.equal(balde.casadasAgrupadas.length, 0, "pessoas diferentes não formam par");
  assert.equal(balde.comandaSemDinheiro.length, 1, "a comanda da Luana fica visível como pendência");
  assert.equal(balde.entrouSemRegistro.length, 2, "e os dois PIX sem comanda também");
});
