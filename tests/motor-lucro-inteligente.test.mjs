// MOTOR DO LUCRO INTELIGENTE NO LUCRO DO MÊS (01/10/2026). Regras do Lucas:
//  · lucro dos sócios = 40 mil da régua (Andrya 25 mil, Dr. Daniel 15 mil), fora do custo da operação;
//  · médico executor = envelope do mês (50% do lucro bruto), custo INTEIRO no mês do trabalho;
//  · executor pago em duas parcelas: outubro paga a 2ª de setembro e a 1ª de outubro;
//  · pagamento é baixa do compromisso, nunca custo de novo.
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
const motor = loadTsModule("src/features/financeiro/motorLucroInteligente.ts");
const li = loadTsModule("src/features/financeiro/lucroInteligente.ts");
const plain = (v) => JSON.parse(JSON.stringify(v));
const r2 = (v) => Math.round(v * 100) / 100;

const CATS = [
  { id: "cat-aluguel", name: "Aluguel", groupKey: "CUSTO_FIXO", sortOrder: 1, isCapex: false, active: true },
  { id: "cat-salarios", name: "Salários", groupKey: "MAO_DE_OBRA", sortOrder: 2, isCapex: false, active: true },
  { id: "cat-lucro-inteligente-medico", name: "Lucro Inteligente — médico executor (transferência)", groupKey: "MAO_DE_OBRA", sortOrder: 3, isCapex: false, active: true },
  { id: "cat-salario-ceo", name: "Salário CEO", groupKey: "MAO_DE_OBRA", sortOrder: 4, isCapex: false, active: true },
  { id: "cat-lucro-inteligente-socios", name: "Lucro Inteligente — sócios (transferência)", groupKey: "POUPANCA", sortOrder: 5, isCapex: false, active: true },
];

function venda(id, dia, valor, descricao = "Plano de Acompanhamento") {
  return {
    id, saleDate: dia, patientName: "P", crmContactRef: "", notes: "", createdAt: "",
    items: [{ id: `${id}-i`, itemType: "TRATAMENTO", amount: valor, description: descricao }],
    payments: [{ id: `${id}-p`, method: "PIX", amount: valor, installments: 1 }],
  };
}
function conta(id, valor, categoryRef, dia, extra = {}) {
  return {
    id, description: id, amount: valor, dueDate: dia, paidAt: dia, categoryRef, isCapex: false,
    method: "PIX", supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", notes: "", createdAt: `${dia}T10:00:00.000Z`,
    ...extra,
  };
}

const VENDAS = [venda("s1", "2026-09-10", 6997), venda("s2", "2026-09-22", 6997), venda("s3", "2026-10-05", 6997)];

test("o executor do mês é o mesmo número da tela do Lucro Inteligente", () => {
  const doMotor = motor.executorDoMes(VENDAS, "2026-09");
  const planilha = li.buildPlanilhaLucro({
    sales: VENDAS, expenses: [], categories: CATS, reconciliations: [], marcas: [], config: li.defaultLucroConfig, monthKey: "2026-09", hoje: "2026-09-30",
  });
  assert.ok(doMotor > 0);
  assert.equal(doMotor, r2(planilha.totais.reservado.medicoExecutor));
});

test("duas parcelas: outubro paga a 2ª de setembro e a 1ª de outubro; novembro, a 2ª de outubro", () => {
  const setembro = motor.executorDoMes(VENDAS, "2026-09");
  const outubro = motor.executorDoMes(VENDAS, "2026-10");
  const parcelas = motor.parcelasDoExecutor(VENDAS, "2026-10");
  assert.deepEqual(
    plain(parcelas.map((p) => [p.mesDoTrabalho, p.numero, p.vence])),
    [["2026-09", 1, "2026-09-30"], ["2026-09", 2, "2026-10-30"], ["2026-10", 1, "2026-10-30"], ["2026-10", 2, "2026-11-30"]],
    "vence no último dia útil do mês (31/10/2026 é sábado)",
  );
  assert.equal(r2(parcelas[0].valor + parcelas[1].valor), setembro, "as duas parcelas somam o executor do mês, centavo a centavo");
  assert.equal(motor.parcelasQueVencemNoMes(VENDAS, "2026-09"), parcelas[0].valor, "setembro: só a 1ª parcela");
  assert.equal(motor.parcelasQueVencemNoMes(VENDAS, "2026-10"), r2(parcelas[1].valor + parcelas[2].valor), "outubro: 2ª de setembro + 1ª de outubro");
  assert.equal(motor.parcelasQueVencemNoMes(VENDAS, "2026-11"), r2(outubro - parcelas[2].valor), "novembro: 2ª de outubro");
  assert.equal(motor.parcelasQueVencemNoMes(VENDAS, "2026-08"), 0, "antes do motor não há parcela");
});

test("pagamento abate o que vence primeiro e sobra vira falta do mês seguinte", () => {
  const setembro = motor.executorDoMes(VENDAS, "2026-09");
  const pagamentos = [
    conta("pg-1", 1000, "cat-lucro-inteligente-medico", "2026-09-30", { supplier: "Dr. Daniel Bratan" }),
    conta("pg-2", 500, "cat-lucro-inteligente-medico", "2026-10-15", { supplier: "Dr. Daniel Bratan" }),
  ];
  const set = motor.compromissosDoMes({ sales: VENDAS, expenses: pagamentos, monthKey: "2026-09" });
  assert.equal(set.executor.doMes, setembro);
  assert.equal(set.executor.vencemNoMes.length, 1);
  assert.equal(set.executor.pagoNoMes, 1000);
  assert.equal(set.executor.faltaNoMes, r2(set.executor.vencemNoMes[0].valor - 1000), "falta da 1ª parcela de setembro");
  const out = motor.compromissosDoMes({ sales: VENDAS, expenses: pagamentos, monthKey: "2026-10" });
  const [p1Set] = motor.parcelasDoExecutor(VENDAS, "2026-09");
  const faltaP1Set = r2(p1Set.valor - 1500);
  assert.equal(out.executor.vencemNoMes.length, 2, "em outubro vencem duas parcelas");
  assert.equal(out.executor.faltaNoMes, r2(faltaP1Set + out.executor.devidoNoMes), "a falta de outubro carrega o que ficou de setembro");
});

test("lucro dos sócios: 25 mil da Andrya, 15 mil do Dr. Daniel, cada pagamento no sócio certo", () => {
  const pagamentos = [
    conta("t1", 4000, "cat-lucro-inteligente-socios", "2026-09-04", { description: "Transferência de lucro aos sócios — 04/09/2026" }),
    conta("t2", 4000, "cat-lucro-inteligente-socios", "2026-09-04", { description: "Transferência de lucro ao sócio Dr. Daniel — 04/09" }),
    conta("t3", 8084.06, "cat-lucro-inteligente-socios", "2026-09-30", { description: "Lucro Inteligente — sócia Andrya" }),
  ];
  const c = motor.compromissosDoMes({ sales: VENDAS, expenses: pagamentos, monthKey: "2026-09" });
  const andrya = c.socios.porSocio.find((s) => s.socio === "andrya");
  const daniel = c.socios.porSocio.find((s) => s.socio === "daniel");
  assert.equal(c.socios.total, 40000);
  assert.equal(andrya.valor, 25000);
  assert.equal(daniel.valor, 15000);
  assert.equal(andrya.pagoNoMes, 12084.06);
  assert.equal(andrya.falta, 12915.94);
  assert.equal(daniel.falta, 11000);
  assert.equal(c.socios.falta, 23915.94);
});

test("lucro do mês no motor: executor pela competência, pagamento fora do custo, sócios fora da operação", () => {
  const despesas = [
    conta("aluguel", 20000, "cat-aluguel", "2026-09-05"),
    conta("equipe", 10000, "cat-salarios", "2026-09-05"),
    conta("pg-exec", 3000, "cat-lucro-inteligente-medico", "2026-09-30", { supplier: "Dr. Daniel Bratan" }),
    conta("lucro-andrya", 8084.06, "cat-lucro-inteligente-socios", "2026-09-30", { description: "Lucro Inteligente — sócia Andrya" }),
    conta("salario-antigo", 25000, "cat-salario-ceo", "2026-09-29"),
  ];
  const g = fin.buildGestaoMensal(VENDAS, despesas, CATS, "2026-09", []);
  const executor = motor.executorDoMes(VENDAS, "2026-09");
  assert.ok(g.motorAtivo);
  assert.equal(g.medicoExecutor, executor);
  assert.equal(g.medicoExecutorPago, 3000, "pagamento ao executor é baixa, não custo");
  assert.equal(g.folhaMeritocracia, 35000, "folha = equipe + salário antigo (que o painel avisa)");
  assert.equal(g.contasAntigasDosSocios, 25000);
  assert.equal(g.custosTotais, r2(20000 + 35000 + executor));
  assert.equal(g.lucroSociosDoMes, 40000);
  assert.equal(g.resultadoDepoisDosSocios, r2(g.lucroLiquido - 40000));
  assert.equal(g.distribuicaoSocios, 8084.06, "o que já foi transferido continua visível");

  // Contabilidade: compromissos do mês no lugar dos pagamentos, e a ponte fecha.
  const c = fin.buildFechamentoContabil(VENDAS, despesas, [], "2026-09", []);
  const p1 = motor.parcelasQueVencemNoMes(VENDAS, "2026-09");
  assert.equal(c.custosDoMes, r2(20000 + 10000 + 25000 + 40000 + p1), "aluguel + equipe + salário antigo + lucro dos sócios + 1ª parcela");
  const ponte = fin.buildPonteLucro(g, c, null);
  const soma = ponte.filter((p) => p.tipo !== "total").reduce((s, p) => s + (p.tipo === "menos" ? -p.valor : p.valor), 0);
  const total = ponte.find((p) => p.label.startsWith("= Lucro contábil"));
  assert.ok(Math.abs(soma - total.valor) < 0.01, "a ponte do operacional ao contábil fecha no centavo");
  assert.ok(ponte.some((p) => p.label.startsWith("+ Médico executor: parcela deste mês")), "a ponte mostra a 2ª parcela que vence no mês seguinte");
});

test("P12 e painel dão o mesmo lucro: a linha do motor substitui o pagamento", () => {
  const despesas = [
    conta("aluguel", 20000, "cat-aluguel", "2026-09-05"),
    conta("pg-exec", 3000, "cat-lucro-inteligente-medico", "2026-09-30"),
    conta("lucro-andrya", 8084.06, "cat-lucro-inteligente-socios", "2026-09-30"),
  ];
  const g = fin.buildGestaoMensal(VENDAS, despesas, CATS, "2026-09", []);
  const m = fin.buildP12Matrix(VENDAS, despesas, CATS, 2026, [], []);
  const folha = m.groups.find((grupo) => grupo.groupKey === "MAO_DE_OBRA");
  const linha = folha.rows.find((row) => row.category.id === fin.LINHA_MOTOR_EXECUTOR_ID);
  assert.ok(linha, "linha do médico executor na folha");
  assert.equal(r2(linha.months[8].total), g.medicoExecutor);
  assert.equal(r2(m.executorPagoMonths[8]), 3000, "o pagamento fica fora do custo");
  assert.equal(r2(m.profitMonths[8]), g.lucroLiquido, "a P12 e o painel contam o mesmo lucro");
  assert.equal(m.lucroSociosMonths[8], 40000);
  assert.ok(m.capexRows.some((row) => row.category.id === "cat-lucro-inteligente-socios"), "transferência aos sócios fica fora do lucro também na P12");
});

test("antes de setembro de 2026 nada muda", () => {
  const despesas = [conta("pg-exec", 3000, "cat-lucro-inteligente-medico", "2026-08-30")];
  const vendas = [venda("a1", "2026-08-10", 6997)];
  const g = fin.buildGestaoMensal(vendas, despesas, CATS, "2026-08", []);
  assert.equal(g.motorAtivo, false);
  assert.equal(g.medicoExecutor, 0);
  assert.equal(g.folhaMeritocracia, 3000, "em agosto a transferência ao executor seguia como folha");
  const c = motor.compromissosDoMes({ sales: vendas, expenses: despesas, monthKey: "2026-08" });
  assert.equal(c.ativo, false);
});
