// FECHAMENTO DE SETEMBRO (01/10/2026). Três consertos pedidos pelo Lucas:
//  1. aprovação acima de R$ 5 mil desligada por padrão;
//  2. "Lucro Inteligente — sócios" fica fora do lucro operacional, com ou sem
//     a marca de capex, e a ponte operacional → contábil ganha a linha;
//  3. importar o extrato de novo não duplica a linha quando o id muda.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-10-01", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const fin = loadTsModule("src/features/financeiro/financeiroData.ts");
const fila = loadTsModule("src/features/financeiro/filaFinanceira.ts");
const cfg = loadTsModule("src/lib/configNegocio.ts");
const ex = loadTsModule("src/features/financeiro/extratoBanco.ts");

const categorias = [
  { id: "cat-lucro-inteligente-socios", name: "Lucro Inteligente — sócios (transferência)", groupKey: "POUPANCA", isCapex: false },
  { id: "cat-distribuicao-lucro-socios", name: "Distribuição de lucro aos sócios", groupKey: "CUSTO_VARIAVEL", isCapex: true },
  { id: "cat-compras-variaveis-obras-2026", name: "Obra", groupKey: "CUSTO_VARIAVEL", isCapex: true },
  { id: "cat-provisao", name: "Provisão 13º", groupKey: "POUPANCA", isCapex: false },
  { id: "cat-fixo", name: "Aluguel", groupKey: "CUSTO_FIXO", isCapex: false },
];
const conta = (id, valor, categoryRef) => ({
  id, description: id, amount: valor, dueDate: "2026-09-10", paidAt: "2026-09-10", categoryRef, isCapex: false,
  method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", notes: "", createdAt: "2026-09-10T10:00:00.000Z",
});
const venda = (valor) => ({
  id: "s1", saleDate: "2026-09-10", patientName: "P", crmContactRef: "", notes: "",
  items: [{ id: "i", itemType: "TRATAMENTO", amount: valor, description: "" }],
  payments: [{ id: "p", method: "PIX", amount: valor, installments: 1 }], createdAt: "2026-09-10T10:00:00.000Z",
});

test("sem configuração, conta acima de R$ 5 mil não pede aprovação", () => {
  cfg.definirCacheConfig([]);
  assert.equal(cfg.configAtual("aprovacao.limite"), 0);
  assert.equal(fila.precisaAprovacao({ amount: 25000, aprovacaoStatus: null }, cfg.configAtual("aprovacao.limite")), false);
  assert.equal(fila.precisaAprovacao({ amount: 25000, aprovacaoStatus: null }, 5000), true, "quem religar o limite volta a ter a trava");
});

test("transferência do Lucro Inteligente aos sócios não é provisão nem custo da operação", () => {
  const g = fin.buildGestaoMensal(
    [venda(100000)],
    [conta("lucro-socia", 8084.06, "cat-lucro-inteligente-socios"), conta("lucro-dr", 4000, "cat-lucro-inteligente-socios"), conta("distrib", 1000, "cat-distribuicao-lucro-socios"), conta("prov", 2063, "cat-provisao"), conta("aluguel", 14307.76, "cat-fixo"), conta("obra", 7000, "cat-compras-variaveis-obras-2026")],
    categorias, "2026-09", [],
  );
  assert.equal(g.distribuicaoSocios, 13084.06, "as duas categorias de lucro aos sócios");
  assert.equal(g.provisoes, 2063, "provisão é só provisão");
  assert.equal(g.obra, 7000);
  // Setembro já está no motor do Lucro Inteligente: o médico executor do mês é custo.
  assert.ok(g.motorAtivo);
  assert.ok(g.medicoExecutor > 0, "a venda de tratamento gera parte do médico executor");
  assert.equal(g.lucroLiquido, Math.round((100000 - 14307.76 - 2063 - g.medicoExecutor) * 100) / 100, "lucro da operação sem distribuição e sem obra, com o executor");
  const c = fin.buildFechamentoContabil([venda(100000)], [conta("lucro-socia", 8084.06, "cat-lucro-inteligente-socios"), conta("lucro-dr", 4000, "cat-lucro-inteligente-socios"), conta("distrib", 1000, "cat-distribuicao-lucro-socios"), conta("prov", 2063, "cat-provisao"), conta("aluguel", 14307.76, "cat-fixo"), conta("obra", 7000, "cat-compras-variaveis-obras-2026")], [], "2026-09", []);
  const ponte = fin.buildPonteLucro(g, c, null);
  const passo = ponte.find((p) => p.label.startsWith("− Lucro dos sócios do mês"));
  assert.ok(passo, "a ponte mostra o lucro dos sócios do mês (o compromisso da régua)");
  assert.equal(passo.valor, 40000);
  const soma = ponte.filter((p) => p.tipo !== "total").reduce((s, p) => s + (p.tipo === "menos" ? -p.valor : p.valor), 0);
  const total = ponte.find((p) => p.label.startsWith("= Lucro contábil"));
  assert.ok(Math.abs(soma - total.valor) < 0.01, "a ponte fecha: os passos somam o lucro contábil");
});

test("sem distribuição no mês, a ponte fica como era", () => {
  const g = fin.buildGestaoMensal([venda(1000)], [conta("aluguel", 500, "cat-fixo")], categorias, "2026-09", []);
  const c = fin.buildFechamentoContabil([venda(1000)], [conta("aluguel", 500, "cat-fixo")], [], "2026-09", []);
  const ponte = fin.buildPonteLucro(g, c, null);
  assert.equal(ponte.some((p) => p.label.startsWith("− Lucro distribuído")), false);
  assert.equal(ponte[4].label, "− Obra paga no mês (CAPEX)");
});

test("extrato: a mesma linha com outro id não entra de novo; a ocorrência a mais entra", () => {
  const noApp = [
    { clientRef: "bank-2026-09-29-antigo1", entryDate: "2026-09-29", amount: -220 },
    { clientRef: "bank-2026-09-30-antigo2", entryDate: "2026-09-30", amount: 4452.15 },
  ];
  const linha = (id, dia, valor) => ({ clientRef: id, entryDate: dia, description: "X", counterparty: "", document: "", amount: valor, balance: null });
  const lidas = [
    linha("bank-2026-09-29-novo1", "2026-09-29", -220),
    linha("bank-2026-09-29-novo2", "2026-09-29", -220),
    linha("bank-2026-09-30-antigo2", "2026-09-30", 4452.15),
    linha("bank-2026-09-30-novo3", "2026-09-30", -898),
  ];
  const novas = ex.linhasNovasDoExtrato(lidas, noApp).map((l) => l.clientRef);
  assert.deepEqual(novas, ["bank-2026-09-29-novo2", "bank-2026-09-30-novo3"], "a 1ª de −220 já está no app; a 2ª é nova; a de mesmo id não volta");
});
