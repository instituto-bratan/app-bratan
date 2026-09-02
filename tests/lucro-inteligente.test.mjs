// LUCRO INTELIGENTE (01/09/2026): a aula do Dr. Thiago Volpi (Profit First para
// clínicas) virou planilha diária no app. Estes testes trancam as regras:
//  · percentuais sempre sobre 100% do que entrou, operacional é o resto;
//  · o degrau vigente é o do dia (a aula sobe devagar, "não é meta, é decisão");
//  · o crédito conta no dia do lançamento, mas "caiu na conta" só em D+31;
//  · cada conta paga cai no envelope certo (CEO = lucro, Dr. Daniel = executor,
//    obra e provisão de impostos ficam fora).
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
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const li = loadTsModule("src/features/financeiro/lucroInteligente.ts");

const categorias = [
  { id: "cat-fixo", name: "Aluguel", groupKey: "CUSTO_FIXO", isCapex: false, sortOrder: 1, active: true },
  { id: "cat-salario-ceo", name: "Salário CEO", groupKey: "MAO_DE_OBRA", isCapex: false, sortOrder: 2, active: true },
  { id: "cat-medico-prescritor-dr-bratan", name: "Dr Bratan", groupKey: "MAO_DE_OBRA", isCapex: false, sortOrder: 3, active: true },
  { id: "cat-impostos-mensais", name: "Impostos Mensais", groupKey: "CUSTO_VARIAVEL", isCapex: false, sortOrder: 4, active: true },
  { id: "cat-poup-impostos-mensais", name: "Impostos (provisão)", groupKey: "POUPANCA", isCapex: false, sortOrder: 5, active: true },
  { id: "cat-compras-variaveis-obras-2026", name: "Obra", groupKey: "CUSTO_VARIAVEL", isCapex: true, sortOrder: 6, active: true },
  { id: "cat-fatura-cartao-credito", name: "Fatura cartão", groupKey: "CUSTO_VARIAVEL", isCapex: false, sortOrder: 7, active: true },
  { id: "cat-distribuicao-lucro-socios", name: "Distribuição", groupKey: "CUSTO_VARIAVEL", isCapex: true, sortOrder: 8, active: true },
];
const conta = (id, valor, categoryRef, paidAt, isCapex = false) => ({
  id, description: id, amount: valor, dueDate: paidAt, paidAt, categoryRef, isCapex, method: "PIX", supplier: "",
  installmentNum: null, installmentTotal: null, documentNote: "", notes: "", createdAt: "2026-09-01T10:00:00.000Z",
});
const venda = (id, dia, pagamentos) => ({
  id, saleDate: dia, patientName: id, crmContactRef: "", notes: "",
  items: [{ id: `${id}-i`, itemType: "TRATAMENTO", amount: pagamentos.reduce((s, p) => s + p.amount, 0), description: "" }],
  payments: pagamentos.map((p, k) => ({ id: `${id}-p${k}`, installments: 1, comprovanteStatus: "ANEXADO", ...p })),
  createdAt: `${dia}T10:00:00.000Z`,
});

test("percentuais: sempre sobre 100% do que entrou, operacional é o resto", () => {
  const env = li.repartir(10000, li.EXEMPLO_DA_AULA);
  assert.equal(env.lucro, 2500, "R$ 2.500 para a conta lucro (25%)");
  assert.equal(env.impostos, 1660, "R$ 1.660 de impostos (16,6%)");
  assert.equal(env.medicoExecutor, 2800, "R$ 2.800 para o médico executor (28%)");
  assert.equal(env.operacional, 3040, "sobra R$ 3.040 para as despesas");
  assert.equal(env.impostos + env.lucro + env.medicoExecutor + env.operacional, 10000, "os quatro fecham o total");
  assert.equal(li.operacionalDe(li.EXEMPLO_DA_AULA), 30.4);
});

test("degraus: o percentual do dia é o do degrau vigente, e subir não passa do alvo", () => {
  const config = {
    degraus: [
      { desde: "2026-09-01", impostos: 13.33, lucro: 5, medicoExecutor: 12 },
      { desde: "2026-10-01", impostos: 13.33, lucro: 8, medicoExecutor: 12 },
    ],
    alvo: { impostos: 13.33, lucro: 9, medicoExecutor: 12 },
  };
  assert.equal(li.percentuaisNoDia(config, "2026-08-15").lucro, 5, "antes do primeiro degrau vale o primeiro");
  assert.equal(li.percentuaisNoDia(config, "2026-09-30").lucro, 5);
  assert.equal(li.percentuaisNoDia(config, "2026-10-01").lucro, 8, "no dia do degrau novo, vale o novo");
  const subiu = li.subirDegrau(config, "2026-11-01", 2);
  assert.equal(li.percentuaisNoDia(subiu, "2026-11-05").lucro, 9, "8 + 2 seria 10, mas o alvo é 9");
  assert.equal(subiu.degraus.length, 3);
  assert.equal(li.subirDegrau(subiu, "2026-11-01", 2).degraus.length, 3, "subir de novo no mesmo dia substitui, não duplica");
});

test("planilha do dia: crédito conta no lançamento, mas só cai na conta em D+31", () => {
  const vendas = [
    venda("ana", "2026-09-01", [{ method: "PIX", amount: 4000 }, { method: "CARTAO_CREDITO", amount: 6000 }]),
    venda("bia", "2026-09-02", [{ method: "DINHEIRO", amount: 1000 }]),
  ];
  const config = { degraus: [{ desde: "2026-09-01", impostos: 10, lucro: 20, medicoExecutor: 10 }], alvo: { impostos: 10, lucro: 25, medicoExecutor: 10 } };
  const p = li.buildPlanilhaLucro({ sales: vendas, expenses: [], categories: categorias, reconciliations: [], marcas: [], config, monthKey: "2026-09", hoje: "2026-09-03" });
  assert.equal(p.linhas.length, 3, "um dia por linha, do dia 1 até hoje");
  const dia1 = p.linhas[0];
  assert.equal(dia1.total, 10000);
  assert.equal(dia1.credito, 6000);
  assert.equal(dia1.caiuNaConta, 4000, "o crédito não caiu ainda: só o PIX está no banco");
  assert.equal(dia1.reservado.lucro, 2000, "20% dos 10 mil já não é nosso");
  assert.equal(dia1.reservado.operacional, 6000, "fica 60% para gastar");
  assert.equal(dia1.percentuais.operacional, 60);
  const dia2 = p.linhas[1];
  assert.equal(dia2.acumulado.reservado.operacional, 6600, "vai se somando dia a dia");
  assert.equal(p.totais.total, 11000);
  assert.equal(p.diasComMovimento, 2);
  assert.equal(p.diasPendentes, 2, "nenhum dia marcado como separado ainda");
});

test("planilha do dia: contas pagas caem no envelope certo e a obra fica fora", () => {
  const vendas = [venda("ana", "2026-09-01", [{ method: "PIX", amount: 10000 }])];
  const contas = [
    conta("aluguel", 3000, "cat-fixo", "2026-09-01"),
    conta("ceo", 1500, "cat-salario-ceo", "2026-09-01"),
    conta("dr", 800, "cat-medico-prescritor-dr-bratan", "2026-09-01"),
    conta("das", 700, "cat-impostos-mensais", "2026-09-01"),
    conta("provisao", 999, "cat-poup-impostos-mensais", "2026-09-01"),
    conta("obra", 5000, "cat-compras-variaveis-obras-2026", "2026-09-01"),
    conta("visa-obra", 2000, "cat-fatura-cartao-credito", "2026-09-01", true),
  ];
  const config = { degraus: [{ desde: "2026-09-01", impostos: 10, lucro: 20, medicoExecutor: 10 }], alvo: { impostos: 10, lucro: 25, medicoExecutor: 10 } };
  const p = li.buildPlanilhaLucro({ sales: vendas, expenses: contas, categories: categorias, reconciliations: [{ id: "r", day: "2026-09-01", status: "CONFERIDO" }], marcas: [{ dia: "2026-09-01", separado: true, observacao: "" }], config, monthKey: "2026-09", hoje: "2026-09-01" });
  const dia = p.linhas[0];
  assert.deepEqual(JSON.parse(JSON.stringify(dia.usado)), { impostos: 700, lucro: 1500, medicoExecutor: 800, operacional: 3000 }, "obra, VISA-OBRA e provisão de impostos não entram em envelope nenhum");
  assert.equal(dia.acumulado.saldo.operacional, 3000, "6.000 reservados − 3.000 gastos");
  assert.equal(dia.acumulado.saldo.lucro, 500, "2.000 reservados − 1.500 pagos à CEO");
  assert.equal(dia.fechamento, "CONFERIDO");
  assert.equal(p.diasSeparados, 1);
  assert.equal(p.diasPendentes, 0);
});

test("envelopeDaConta: CEO é lucro, Dr. Daniel é executor, provisão de impostos e obra ficam fora", () => {
  const cat = (id) => categorias.find((c) => c.id === id);
  assert.equal(li.envelopeDaConta(conta("a", 1, "cat-salario-ceo", "2026-09-01"), cat("cat-salario-ceo")), "lucro");
  assert.equal(li.envelopeDaConta(conta("b", 1, "cat-medico-prescritor-dr-bratan", "2026-09-01"), cat("cat-medico-prescritor-dr-bratan")), "medicoExecutor");
  assert.equal(li.envelopeDaConta(conta("c", 1, "cat-impostos-mensais", "2026-09-01"), cat("cat-impostos-mensais")), "impostos");
  assert.equal(li.envelopeDaConta(conta("d", 1, "cat-poup-impostos-mensais", "2026-09-01"), cat("cat-poup-impostos-mensais")), null);
  assert.equal(li.envelopeDaConta(conta("e", 1, "cat-compras-variaveis-obras-2026", "2026-09-01"), cat("cat-compras-variaveis-obras-2026")), null);
  assert.equal(li.envelopeDaConta(conta("f", 1, "cat-distribuicao-lucro-socios", "2026-09-01"), cat("cat-distribuicao-lucro-socios")), "lucro", "distribuição é lucro dos sócios, não obra");
  assert.equal(li.envelopeDaConta(conta("g", 1, "cat-fixo", "2026-09-01"), cat("cat-fixo")), "operacional");
});

test("avaliação instantânea (Passo 1): onde a clínica está, sem maquiar", () => {
  const vendas = [venda("ana", "2026-08-10", [{ method: "PIX", amount: 100000 }])];
  const contas = [
    conta("aluguel", 50000, "cat-fixo", "2026-08-10"),
    conta("ceo", 15000, "cat-salario-ceo", "2026-08-10"),
    conta("dr", 12000, "cat-medico-prescritor-dr-bratan", "2026-08-10"),
    conta("das", 13000, "cat-impostos-mensais", "2026-08-10"),
    conta("provisao", 14000, "cat-poup-impostos-mensais", "2026-08-10"),
    conta("obra", 30000, "cat-compras-variaveis-obras-2026", "2026-08-10"),
  ];
  const a = li.avaliacaoInstantanea(vendas, contas, categorias, [], ["2026-08"]);
  const mes = a.meses[0];
  assert.equal(mes.receita, 100000);
  assert.equal(mes.impostos, 13000);
  assert.equal(mes.medicoExecutor, 12000);
  assert.equal(mes.operacional, 50000, "a provisão de impostos não é despesa operacional");
  assert.equal(mes.sociosPagos, 15000);
  assert.equal(mes.lucro, 25000, "receita − impostos − executor − operacional (inclui o que a CEO já levou)");
  assert.equal(mes.investimento, 30000, "obra é investimento, tratado à parte");
  assert.deepEqual(JSON.parse(JSON.stringify(mes.percentuais)), { impostos: 13, lucro: 25, medicoExecutor: 12, operacional: 50, sociosPagos: 15 });
  assert.equal(a.consolidado.receita, 100000);
  assert.deepEqual(JSON.parse(JSON.stringify(li.mesesAnteriores("2026-09", 3))), ["2026-06", "2026-07", "2026-08"]);
});

test("configuração padrão: começa pequeno e mira o lucro da aula", () => {
  assert.equal(li.defaultLucroConfig.degraus[0].lucro, 5, "a aula: 'recomendo começar com 5'");
  assert.equal(li.defaultLucroConfig.alvo.lucro, 25);
  assert.ok(li.operacionalDe(li.defaultLucroConfig.degraus[0]) > 0);
  assert.equal(li.EXEMPLO_DA_AULA.lucro + li.EXEMPLO_DA_AULA.impostos + li.EXEMPLO_DA_AULA.medicoExecutor, 69.6);
});
