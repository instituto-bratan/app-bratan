// PDCA (01/09/2026) — áudio da CEO de 31/08 + correção do Lucas:
//  1. adesão é PLANO DE ACOMPANHAMENTO, e a régua é O VALOR: R$ 6.997.
//     Tratamento abaixo disso não é adesão nem entra no ticket;
//  2. quem só pagou SINAL fica fora da margem (a consulta nem aconteceu);
//  3. comanda só de tratamento pequeno sem consulta = recorrente comprando
//     medicação — fora do PDCA por completo.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-01", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
    if (request === "@/lib/remoteData") return {};
    if (request === "@/lib/xlsxWriter") return { excelSerialDate: () => "" };
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const pdca = loadTsModule("src/features/financeiro/pdcaData.ts");

let seq = 0;
const venda = (dia, nome, itens, extra = {}) => ({
  id: `s-${(seq += 1)}`, saleDate: dia, patientName: nome, crmContactRef: "", notes: "",
  items: itens.map((i, k) => ({ id: `i${k}`, itemType: i[0], amount: i[1], description: "" })),
  payments: [{ id: "p", method: "PIX", amount: itens.reduce((s, i) => s + i[1], 0), installments: 1 }],
  createdAt: `${dia}T10:00:00.000Z`, ...extra,
});
const marks = new Map();

test("quem só pagou sinal fica FORA da margem (a lista da CEO)", () => {
  const r = pdca.buildPdca([
    venda("2026-08-14", "Sophia Sinal", [["SINAL", 500]]),
    venda("2026-08-11", "Wilson Consulta", [["CONSULTA", 1000]]),
  ], "2026-08", marks);
  assert.equal(r.rows.length, 1, "só a consulta entra na conta");
  assert.equal(r.rows[0].sale.patientName, "Wilson Consulta");
  assert.equal(r.sinaisAguardando.length, 1);
  assert.equal(r.sinaisAguardando[0].paciente, "Sophia Sinal");
});

test("a régua é o valor: 6.997 é plano, abaixo disso não é adesão", () => {
  assert.equal(pdca.PLANO_VALOR_MINIMO, 6997);
  const r = pdca.buildPdca([
    venda("2026-09-02", "Pequeno", [["CONSULTA", 1000], ["TRATAMENTO", 3000]]),
    venda("2026-09-03", "Exato", [["CONSULTA", 1000], ["TRATAMENTO", 6997]]),
    venda("2026-09-04", "Maior", [["CONSULTA", 1000], ["TRATAMENTO", 12000]]),
  ], "2026-09", marks);
  const pequeno = r.rows.find((x) => x.sale.patientName === "Pequeno");
  assert.equal(pequeno.status, "NAO_ADERIU", "3.000 < 6.997 não é plano");
  assert.match(pequeno.detail, /abaixo do plano/);
  assert.equal(r.rows.find((x) => x.sale.patientName === "Exato").status, "ADERIU", "6.997 cravado é plano");
  assert.equal(r.rows.find((x) => x.sale.patientName === "Maior").status, "ADERIU");
  assert.equal(r.rows.length, 3, "quem passou pela consulta conta no denominador");
});

test("comanda só de tratamento pequeno SEM consulta fica fora do PDCA (recorrente)", () => {
  const r = pdca.buildPdca([
    venda("2026-09-05", "Recorrente Dose", [["TRATAMENTO", 2100]]),
    venda("2026-09-06", "Plano Cheio", [["TRATAMENTO", 12750]]),
  ], "2026-09", marks);
  assert.equal(r.rows.length, 1, "a dose do recorrente não vira linha");
  assert.equal(r.rows[0].sale.patientName, "Plano Cheio", "plano sem consulta na mesma comanda continua contando");
});

test("comanda marcada PLANO sem item de tratamento também é adesão", () => {
  const r = pdca.buildPdca([venda("2026-09-04", "Fechou plano", [["CONSULTA", 1100]], { planoOuAvulsa: "PLANO" })], "2026-09", marks);
  assert.equal(r.rows[0].status, "ADERIU");
});

test("o ticket do PDCA é só de tratamento ≥ 6.997", () => {
  const r = pdca.buildPdca([
    venda("2026-09-02", "A", [["CONSULTA", 1000], ["TRATAMENTO", 10000]]),
    venda("2026-09-03", "B", [["CONSULTA", 1000], ["TRATAMENTO", 14000]]),
    venda("2026-09-04", "C pequeno", [["CONSULTA", 1000], ["TRATAMENTO", 3000]]),
    venda("2026-09-05", "D sinal", [["SINAL", 500]]),
  ], "2026-09", marks);
  assert.equal(r.ticketPlano, 12000, "média de 10.000 e 14.000 — pequeno e sinal fora");
});

test("aderiu depois continua funcionando com a régua do plano", () => {
  const r = pdca.buildPdca([
    venda("2026-09-02", "Maria Volta", [["CONSULTA", 1100]]),
    venda("2026-09-20", "Maria Volta", [["TRATAMENTO", 9000]], { planoOuAvulsa: "PLANO" }),
  ], "2026-09", marks);
  const consulta = r.rows.find((x) => x.consulta > 0);
  assert.equal(consulta.status, "ADERIU_DEPOIS");
});

test("voltar e fechar tratamento PEQUENO depois NÃO reclassifica a consulta", () => {
  const r = pdca.buildPdca([
    venda("2026-09-02", "Joao Pequeno", [["CONSULTA", 1100]]),
    venda("2026-09-20", "Joao Pequeno", [["TRATAMENTO", 2000]]),
  ], "2026-09", marks);
  const consulta = r.rows.find((x) => x.consulta > 0);
  assert.equal(consulta.status, "NAO_ADERIU", "2.000 < 6.997 não vira 'aderiu depois'");
});
