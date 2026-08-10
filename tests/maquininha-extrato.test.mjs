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
