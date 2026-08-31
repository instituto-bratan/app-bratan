// ACORDO REDE Q-7594851, vigente desde 24/08/2026. A antecipação foi desligada:
// o crédito passou a cair em 31 dias corridos, uma parcela por mês, com taxa
// de 1,4% à vista e 2,68% de 2x a 6x. A conferência do extrato tinha de trocar
// de régua — sem perder a leitura do período antecipado.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-28", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
    if (request === "@/lib/xlsxWriter") return { excelSerialDate: () => "" };
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto, TextDecoder, DecompressionStream,
  }, { filename: absolutePath });
  return module.exports;
}
const r = loadTsModule("src/features/financeiro/recebiveisRede.ts");

const venda = (dia, valor, parcelas, metodo = "CARTAO_CREDITO", nome = "Paciente") => ({
  id: `s-${dia}-${valor}`, saleDate: dia, patientName: nome, crmContactRef: "", notes: "",
  items: [{ id: "i", itemType: "TRATAMENTO", amount: valor, description: "" }],
  payments: [{ id: "p", method: metodo, amount: valor, installments: parcelas }],
  createdAt: `${dia}T10:00:00.000Z`,
});

test("a tabela de taxas é a do contrato", () => {
  assert.equal(r.taxaDoCartao(1), 0.014, "crédito à vista 1,4%");
  assert.equal(r.taxaDoCartao(2), 0.0268);
  assert.equal(r.taxaDoCartao(6), 0.0268, "2x a 6x custam 2,68%");
  assert.equal(r.taxaDoCartao(7), 0.0346, "7x a 12x custam 3,46%");
  assert.equal(r.taxaDoCartao(1, true), 0.007, "débito 0,7%");
  assert.equal(r.VIGENCIA_ACORDO_REDE, "2026-08-24");
  assert.equal(r.PRAZO_LIQUIDACAO_DIAS, 31);
  assert.equal(r.FATURAMENTO_ACORDADO_REDE, 154166.66);
});

test("venda a partir de 24/08 em 6x vira 6 parcelas de 31 em 31 dias", () => {
  const fila = r.agendaRecebiveis([venda("2026-08-24", 12000, 6)]);
  assert.equal(fila.length, 6);
  assert.equal(fila[0].regime, "PRAZO");
  assert.equal(fila[0].bruto, 2000);
  assert.equal(fila[0].liquido, 1946.4, "2.000 menos 2,68%");
  assert.equal(fila[0].diaPrevisto, "2026-09-24", "31 dias corridos");
  assert.equal(fila[1].diaPrevisto, "2026-10-26", "62 dias — 25/10 é domingo, cai no dia útil seguinte");
  assert.equal(Math.round(fila.reduce((s, p) => s + p.liquido, 0) * 100) / 100, 11678.4);
});

test("venda antes de 24/08 continua lida pela régua da antecipação (D+1, ~6%)", () => {
  const fila = r.agendaRecebiveis([venda("2026-08-20", 10000, 6)]);
  assert.equal(fila.length, 1, "com antecipação tudo caía junto");
  assert.equal(fila[0].regime, "ANTECIPADO");
  assert.equal(fila[0].diaPrevisto, "2026-08-21", "dia útil seguinte");
  assert.equal(fila[0].liquido, 9400, "custo efetivo de 6%");
});

test("crédito à vista e débito têm régua própria", () => {
  const aVista = r.agendaRecebiveis([venda("2026-08-25", 5000, 1)]);
  assert.equal(aVista.length, 1);
  assert.equal(aVista[0].liquido, 4930, "1,4%");
  assert.equal(aVista[0].diaPrevisto, "2026-09-25");

  const debito = r.agendaRecebiveis([venda("2026-08-25", 1000, 1, "CARTAO_DEBITO")]);
  assert.equal(debito[0].liquido, 993, "0,7%");
  assert.equal(debito[0].diaPrevisto, "2026-08-26", "débito cai em 1 dia útil");
});

test("PIX e dinheiro não entram na fila da maquininha", () => {
  const fila = r.agendaRecebiveis([venda("2026-08-25", 5000, 1, "PIX"), venda("2026-08-25", 300, 1, "DINHEIRO")]);
  assert.equal(fila.length, 0);
});

test("saldo: o que a maquininha ainda deve, por mês de vencimento", () => {
  const fila = r.agendaRecebiveis([venda("2026-08-24", 12000, 6), venda("2026-08-25", 5000, 1)]);
  const saldo = r.saldoRecebiveis(fila, "2026-08-28");
  assert.equal(saldo.parcelas, 7, "nada venceu ainda");
  assert.equal(saldo.aReceber, 16608.4, "11.678,40 do 6x + 4.930 do à vista");
  assert.equal(saldo.porMes[0].mes, "2026-09");
  assert.equal(saldo.porMes[0].parcelas, 2, "a 1ª do 6x e a do à vista");
  assert.equal(saldo.porMes.length, 6);
});

test("faturamento acordado com a Rede: só o cartão conta", () => {
  const f = r.faturamentoRede([venda("2026-08-24", 100000, 6), venda("2026-08-25", 90000, 1, "PIX")], "2026-08");
  assert.equal(f.volume, 100000, "PIX não conta para o acordado");
  assert.equal(f.bateu, false);
  assert.equal(f.falta, 54166.66);
  const g = r.faturamentoRede([venda("2026-08-24", 160000, 6)], "2026-08");
  assert.equal(g.bateu, true);
  assert.equal(g.falta, 0);
});
