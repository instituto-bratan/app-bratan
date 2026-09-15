// OCUPAÇÃO DE SALA (14/09/2026): horas vendidas × horas disponíveis, por mês e
// por dia, derivadas das comandas e da coluna E da planilha de precificação.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-14", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const ocupacao = loadTsModule("src/features/financeiro/ocupacaoSala.ts");
const catalogo = loadTsModule("src/features/financeiro/catalogoPrecificacao.ts");

const venda = (id, saleDate, items) => ({
  id, saleDate, patientName: id, crmContactRef: "", notes: "", createdAt: `${saleDate}T10:00:00.000Z`, payments: [],
  items: items.map((item, index) => ({ id: `${id}-${index}`, itemType: item.itemType, amount: item.amount, description: item.description ?? "" })),
});

test("catálogo: todo produto tem minutos de sala e os valores batem com a coluna E da planilha", () => {
  for (const produto of catalogo.CATALOGO_PRECIFICACAO) assert.equal(typeof produto.minutosSala, "number", produto.nome);
  const minutos = (nome) => catalogo.produtoPorNome(nome).minutosSala;
  assert.equal(minutos("Plano de Acompanhamento · 6 meses"), 180, "3 sessões × 60 min");
  assert.equal(minutos("Testosterona base / cipionato / enantato"), 15);
  assert.equal(minutos("Testosterona + HCG"), 20);
  assert.equal(minutos("Ferinject"), 40);
  assert.equal(minutos("Consulta avulsa + bioimpedância — Pix"), 60);
  assert.equal(minutos("Mapeamento corporal — Pix"), 10);
  assert.equal(minutos("Dra. Bárbara (psicóloga) — 4 sessões"), 240);
  assert.equal(minutos("Pellet testosterona 200mg"), 0, "a sala do pellet está nos honorários do implante");
  assert.equal(minutos("Honorários de implante (sem pellet)"), 60);
});

test("minutos do item: nome exato, palavra-chave, quantidade e padrão do tipo", () => {
  const plano = ocupacao.minutosDoItem({ itemType: "TRATAMENTO", amount: 6997, description: "Plano de Acompanhamento · 6 meses" });
  assert.equal(plano.minutos, 180);
  assert.equal(plano.origem, "tabela");
  const vitD = ocupacao.minutosDoItem({ itemType: "TRATAMENTO", amount: 590, description: "Vitamina D" });
  assert.equal(vitD.minutos, 15);
  assert.equal(vitD.produto.nome, "Vitamina D 600.000 UI");
  const duasDoses = ocupacao.minutosDoItem({ itemType: "TRATAMENTO", amount: 1180, description: "Nandrolona 2 doses" });
  assert.equal(duasDoses.quantidade, 2);
  assert.equal(duasDoses.minutos, 30, "2 unidades × 15 min");
  const pellets = ocupacao.minutosDoItem({ itemType: "TRATAMENTO", amount: 1008, description: "Pellet testosterona 200mg" });
  assert.equal(pellets.quantidade, 3);
  assert.equal(pellets.minutos, 0);
  const semProduto = ocupacao.minutosDoItem({ itemType: "CONSULTA", amount: 1234, description: "" });
  assert.equal(semProduto.origem, "padrão do tipo");
  assert.equal(semProduto.minutos, 60);
  assert.equal(ocupacao.minutosDoItem({ itemType: "OUTRO", amount: 100, description: "" }).minutos, 0);
  assert.equal(ocupacao.minutosDoItem({ itemType: "CONSULTA", amount: 0, description: "" }).minutos, 0, "item zerado não ocupa sala");
});

test("mês fechado: setembro/2026 tem 21 dias úteis (07/09 é feriado) → 1.323 h disponíveis", () => {
  const sales = [
    venda("v1", "2026-09-01", [{ itemType: "TRATAMENTO", amount: 6997, description: "Plano de Acompanhamento · 6 meses" }]),
    venda("v2", "2026-09-01", [{ itemType: "CONSULTA", amount: 2500, description: "Consulta avulsa + bioimpedância — Pix" }]),
    venda("v3", "2026-09-08", [{ itemType: "TRATAMENTO", amount: 590, description: "HCG (frasco)" }, { itemType: "TRATAMENTO", amount: 590, description: "Vitamina D 600.000 UI" }]),
    venda("fora", "2026-10-01", [{ itemType: "CONSULTA", amount: 2500, description: "Consulta avulsa + bioimpedância — Pix" }]),
  ];
  const o = ocupacao.buildOcupacaoMes({ sales, monthKey: "2026-09", hoje: "2026-10-05" });
  assert.equal(o.parcial, false);
  assert.equal(o.diasUteis, 21);
  assert.equal(o.horasDisponiveis, 1323);
  assert.equal(o.horasVendidas, 4.5, "180 + 60 + 15 + 15 minutos = 4,5 h");
  assert.equal(o.percentual, 0.3);
  assert.equal(o.dias.length, 30);
  const dia1 = o.dias.find((d) => d.dia === "2026-09-01");
  assert.equal(dia1.horas, 4);
  assert.equal(dia1.comandas, 2);
  assert.equal(dia1.disponivelHoras, 63);
  assert.equal(dia1.percentual, 6.3);
  const feriado = o.dias.find((d) => d.dia === "2026-09-07");
  assert.equal(feriado.diaUtil, false);
  assert.equal(feriado.disponivelHoras, 0);
  assert.equal(o.porProduto[0].produto, "Plano de Acompanhamento · 6 meses");
  assert.equal(o.porProduto[0].horas, 3);
  assert.equal(o.porDiaDaSemana[1].label, "Terça");
  assert.equal(o.porDiaDaSemana[1].value, 4.5, "01/09 e 08/09 são terças");
  assert.equal(o.valorDoPonto, 1505.29, "1% de 1.323 h × R$ 113,78");
  assert.equal(o.custoFixoAbsorvido, 512.0);
  assert.equal(o.horasParaMeta, 987.8);
  assert.match(o.frase, /4,5 h das 1\.323 h disponíveis em setembro/);
  assert.match(o.frase, /0,3% de ocupação/);
  assert.match(o.frase, /faltam 987,8 h/);
});

test("mês em andamento: só até hoje, dos dois lados (nunca mês parcial contra mês fechado)", () => {
  const sales = [
    venda("v1", "2026-09-01", [{ itemType: "CONSULTA", amount: 2500, description: "Consulta avulsa + bioimpedância — Pix" }]),
    venda("v2", "2026-09-20", [{ itemType: "CONSULTA", amount: 2500, description: "Consulta avulsa + bioimpedância — Pix" }]),
  ];
  const o = ocupacao.buildOcupacaoMes({ sales, monthKey: "2026-09", hoje: "2026-09-14" });
  assert.equal(o.parcial, true);
  assert.equal(o.ateDia, "2026-09-14");
  assert.equal(o.diasUteis, 9, "01,02,03,04,08,09,10,11,14");
  assert.equal(o.horasDisponiveis, 567);
  assert.equal(o.horasVendidas, 1, "a venda de 20/09 ainda não aconteceu");
  assert.equal(o.dias.length, 14);
  assert.match(o.frase, /até 14\/09/);
});

test("grade configurável e faixa saudável", () => {
  const sales = Array.from({ length: 20 }, (_, i) => venda(`v${i}`, "2026-09-01", [{ itemType: "CONSULTA", amount: 2500, description: "Consulta avulsa + bioimpedância — Pix" }]));
  const o = ocupacao.buildOcupacaoMes({ sales, monthKey: "2026-09", hoje: "2026-09-01", grade: { salas: 2, horasPorDiaPorSala: 12 } });
  assert.equal(o.horasDisponiveis, 24);
  assert.equal(o.horasVendidas, 20);
  assert.equal(o.percentual, 83.3);
  assert.match(o.frase, /Dentro da faixa saudável de 75 a 85%/);
  assert.equal(o.horasParaMeta, 0);
});

test("mapa de calor: mesma grade do faturamento, intensidade relativa às horas disponíveis do dia", () => {
  const sales = [venda("v1", "2026-09-01", [{ itemType: "TRATAMENTO", amount: 6997, description: "Plano de Acompanhamento · 6 meses" }])];
  const heat = ocupacao.heatDaOcupacao(ocupacao.buildOcupacaoMes({ sales, monthKey: "2026-09", hoje: "2026-10-01" }));
  assert.equal(heat.weeks.length, 5);
  assert.equal(heat.weeks[0][0].inMonth, false, "setembro/2026 começa numa terça: segunda vazia");
  const dia1 = heat.weeks[0][1];
  assert.equal(dia1.date, "2026-09-01");
  assert.equal(dia1.total, 3);
  assert.equal(dia1.count, 1);
  assert.equal(heat.maxTotal, 63, "7 salas × 9 h");
  assert.equal(heat.total, 3);
  assert.equal(heat.bestDay.date, "2026-09-01");
  assert.equal(ocupacao.formatHoras(3.5), "3,5 h");
});
