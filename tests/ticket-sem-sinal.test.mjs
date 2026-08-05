// TICKET MÉDIO SEM SINAL (04/08/2026, regra do Lucas: "o ticket médio está
// contando com os sinais de consulta, e não é pra contar").
// O sinal é adiantamento do tratamento — contá-lo dobra receita na média, e a
// comanda que é SÓ sinal (R$ 429 de média em julho) afunda o indicador.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-04", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };

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
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, crypto: globalThis.crypto }, { filename: absolutePath });
  return module.exports;
}

const fin = loadTsModule("src/features/financeiro/financeiroData.ts");

function venda(id, dia, itens, paciente = "Paciente " + id) {
  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  return {
    id, saleDate: dia, patientName: paciente, crmContactRef: "", notes: "",
    items: itens.map((item, i) => ({ id: `${id}-i${i}`, itemType: item.tipo, amount: item.valor, description: "" })),
    payments: [{ id: `${id}-p`, method: "PIX", amount: total, installments: 1 }],
    createdAt: `${dia}T10:00:00.000Z`,
  };
}

test("comanda que é SÓ sinal fica fora da conta do ticket", () => {
  const vendas = [
    venda("a", "2026-07-05", [{ tipo: "TRATAMENTO", valor: 8000 }]),
    venda("b", "2026-07-06", [{ tipo: "SINAL", valor: 500 }]),
    venda("c", "2026-07-07", [{ tipo: "SINAL", valor: 400 }]),
  ];
  const t = fin.buildTicketMedio(vendas, "2026-07-01", "2026-07-31");
  assert.equal(t.count, 1, "só a comanda de tratamento entra");
  assert.equal(t.geral, 8000, "sem os sinais, o ticket é o tratamento");
  assert.equal(t.ignoradasSoSinal, 2, "as duas comandas de sinal são contadas como ignoradas");
});

test("o item de sinal sai da comanda, mas o resto dela continua contando", () => {
  const vendas = [venda("a", "2026-07-05", [{ tipo: "TRATAMENTO", valor: 8000 }, { tipo: "SINAL", valor: 500 }, { tipo: "CONSULTA", valor: 200 }])];
  const t = fin.buildTicketMedio(vendas, "2026-07-01", "2026-07-31");
  assert.equal(t.geral, 8200, "8.000 + 200 (o sinal de 500 sai)");
  assert.equal(t.count, 1);
  assert.equal(t.ignoradasSoSinal, 0, "a comanda não foi ignorada — só o item");
  assert.equal(fin.saleTotal(vendas[0]), 8700, "o FATURAMENTO continua com o sinal dentro");
  assert.equal(fin.saleTotalForTicket(vendas[0]), 8200);
});

test("o FATURAMENTO não muda — só o ticket ignora o sinal", () => {
  const cats = [{ id: "c1", groupKey: "CUSTO_FIXO", name: "X", sortOrder: 1, isCapex: false, active: true }];
  const vendas = [
    venda("a", "2026-07-05", [{ tipo: "TRATAMENTO", valor: 8000 }]),
    venda("b", "2026-07-06", [{ tipo: "SINAL", valor: 500 }]),
  ];
  const g = fin.buildGestaoMensal(vendas, [], cats, "2026-07", []);
  assert.equal(g.faturamento, 8500, "dinheiro que entrou é dinheiro que entrou");
  assert.equal(g.comandas, 2, "a contagem de comandas do mês continua inteira");
  assert.equal(g.ticketMedio, 8000, "o ticket ignora a comanda de sinal");
});

test("novo × recorrente também respeitam a regra do sinal", () => {
  const vendas = [
    venda("a1", "2026-06-10", [{ tipo: "TRATAMENTO", valor: 5000 }], "Ana"),
    venda("a2", "2026-07-10", [{ tipo: "TRATAMENTO", valor: 9000 }], "Ana"),
    venda("b1", "2026-07-11", [{ tipo: "TRATAMENTO", valor: 3000 }], "Bruno"),
    venda("b2", "2026-07-12", [{ tipo: "SINAL", valor: 450 }], "Bruno"),
  ];
  const t = fin.buildTicketMedio(vendas, "2026-07-01", "2026-07-31");
  assert.equal(t.novos, 3000, "Bruno é novo em julho: só o tratamento dele conta");
  assert.equal(t.recorrentes, 9000, "Ana já tinha comanda em junho");
  assert.equal(t.count, 2);
  assert.equal(t.ignoradasSoSinal, 1);
});

test("período: comanda fora da janela não entra", () => {
  const vendas = [
    venda("a", "2026-06-30", [{ tipo: "TRATAMENTO", valor: 1000 }]),
    venda("b", "2026-07-01", [{ tipo: "TRATAMENTO", valor: 2000 }]),
    venda("c", "2026-08-01", [{ tipo: "TRATAMENTO", valor: 3000 }]),
  ];
  const t = fin.buildTicketMedio(vendas, "2026-07-01", "2026-07-31");
  assert.equal(t.count, 1);
  assert.equal(t.geral, 2000);
});

test("mês sem comanda nenhuma devolve zero, sem dividir por zero", () => {
  const t = fin.buildTicketMedio([], "2026-07-01", "2026-07-31");
  assert.equal(t.geral, 0);
  assert.equal(t.novos, 0);
  assert.equal(t.recorrentes, 0);
  assert.equal(t.count, 0);
  assert.equal(t.ignoradasSoSinal, 0);
});
