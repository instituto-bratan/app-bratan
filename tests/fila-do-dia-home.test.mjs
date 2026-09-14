// FILA DO DIA COMO HOME (14/09/2026): uma lista só, ordenada por urgência, com
// tudo que precisa de ação — derivado das sete telas de origem.
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
const home = loadTsModule("src/features/home/filaDoDia.ts");
const fila = loadTsModule("src/features/financeiro/filaFinanceira.ts");
const plain = (v) => JSON.parse(JSON.stringify(v));

const HOJE = "2026-09-14";
const conta = (id, valor, dueDate, extra = {}) => ({
  id, description: id, amount: valor, dueDate, paidAt: null, categoryRef: "cat-fixo", method: "BOLETO", supplier: "Stin",
  installmentNum: null, installmentTotal: null, documentNote: "boleto.pdf", isCapex: false, notes: "", createdAt: "2026-09-01T10:00:00.000Z", ...extra,
});
const tarefa = (id, dueAt, extra = {}) => ({ id, title: "Toque D+1", dueAt, status: "PENDING", contato: "Maria Silva", taskType: "WHATSAPP", ...extra });

test("ordem por urgência, depois data, depois valor; frases em português", () => {
  const financeira = fila.buildFilaFinanceira({
    expenses: [conta("aluguel", 20883, "2026-09-10"), conta("energia", 1200, "2026-09-14"), conta("stin", 2194, "2026-09-18"), conta("gas", 300, "2026-09-19")],
    purchases: [],
    hoje: HOJE,
  });
  const f = home.buildFilaDoDia({
    hoje: HOJE,
    financeira,
    comprovantesPendentes: { quantidade: 9, valor: 31000 },
    comandasSemNota: { quantidade: 29, valor: 95264 },
    crmTasks: [tarefa("t1", "2026-09-12T09:00:00.000Z"), tarefa("t2", "2026-09-14T09:00:00.000Z", { contato: "João" }), tarefa("t3", "2026-09-16T09:00:00.000Z"), tarefa("feita", "2026-09-10T09:00:00.000Z", { status: "DONE" })],
    lembretes: { vencidos: [{ id: "l1", nome: "Carla", valor: 4482, data: "2026-09-09" }], hoje: [] },
    estoque: [{ setor: "ENFERMAGEM", rotulo: "Enfermagem", itens: 3, zerados: 1 }, { setor: "RECEPCAO", rotulo: "Recepção", itens: 0, zerados: 0 }],
    npsFila: { quantidade: 4, maisAntigoDias: 5 },
    checklist: { pendentes: 6, proxima: "Conferir agenda" },
    fechamentoPendente: { dia: "2026-09-11", total: 8400 },
    avisosImportantes: [{ id: "a1", corpo: "Reunião de líderes na sexta às 9h.", publicadoEm: "2026-09-13T18:00:00.000Z" }],
  });
  const chaves = f.itens.map((i) => i.chave);
  // Atrasados primeiro (data mais antiga primeiro): lembrete de 09/09, aluguel de 10/09, toque de 12/09.
  assert.deepEqual(plain(chaves.slice(0, 3)), ["lembrete:l1", "conta:aluguel", "crm:t1"]);
  assert.equal(f.itens[0].urgencia, 0);
  assert.equal(f.itens[0].acao, "Cobrar");
  assert.match(f.itens[2].detalhe, /era para 12\/09/);
  // Hoje: fechamento de 11/09 (data mais antiga), depois os de hoje por valor.
  const hojeItens = f.itens.filter((i) => i.urgencia === 1).map((i) => i.chave);
  assert.equal(hojeItens[0], "fechamento:2026-09-11");
  assert.ok(hojeItens.includes("comprovante:pendentes"));
  assert.ok(hojeItens.includes("conta:energia"));
  assert.ok(hojeItens.includes("crm:t2"));
  assert.ok(hojeItens.includes("estoque:ENFERMAGEM"), "setor com item zerado é para hoje");
  assert.ok(hojeItens.includes("nps:fila"), "paciente esperando há 5 dias é para hoje");
  assert.equal(chaves.includes("estoque:RECEPCAO"), false, "setor sem item abaixo do mínimo não entra");
  // Semana: contas agrupadas, toques agrupados, nota fiscal, checklist.
  const semana = f.itens.filter((i) => i.urgencia === 2);
  const contasSemana = semana.find((i) => i.chave === "conta:semana");
  assert.equal(contasSemana.quantidade, 2);
  assert.match(contasSemana.titulo, /2 contas vencem nos próximos 7 dias/);
  assert.match(contasSemana.detalhe, /primeira em 18\/09/);
  assert.ok(semana.some((i) => i.chave === "crm:semana" && i.quantidade === 1));
  assert.ok(semana.some((i) => i.chave === "nota:pendentes"));
  assert.ok(semana.some((i) => i.chave === "checklist:hoje"));
  // Aviso é "para saber".
  assert.equal(f.itens.at(-1).origem, "AVISO");
  assert.equal(f.itens.at(-1).urgencia, 3);
  assert.equal(chaves.includes("crm:feita"), false, "tarefa concluída não entra");
  assert.equal(f.badge, f.contagem[0] + f.contagem[1]);
  assert.equal(f.contagem[0], 3);
  assert.match(f.resumo, /^3 atrasados · \d+ para hoje · \d+ nesta semana$/);
  assert.equal(f.porOrigem.CONTA, 4, "aluguel + energia + 2 da semana");
  assert.equal(f.porOrigem.COMPROVANTE, 9);
});

test("silenciar até uma data esconde o item e o silenciamento vencido é limpo", () => {
  const financeira = fila.buildFilaFinanceira({ expenses: [conta("aluguel", 20883, "2026-09-10")], purchases: [], hoje: HOJE });
  const comSilencio = home.buildFilaDoDia({ hoje: HOJE, financeira, silenciados: { "conta:aluguel": "2026-09-16" } });
  assert.equal(comSilencio.itens.length, 0);
  assert.equal(comSilencio.silenciados, 1);
  assert.equal(comSilencio.resumo, "tudo em dia");
  const vencido = home.buildFilaDoDia({ hoje: HOJE, financeira, silenciados: { "conta:aluguel": "2026-09-13" } });
  assert.equal(vencido.itens.length, 1, "silenciamento até ontem já não vale");
  assert.deepEqual(plain(home.limparSilenciados({ a: "2026-09-13", b: "2026-09-14", c: "2026-09-20" }, HOJE)), { b: "2026-09-14", c: "2026-09-20" });
});

test("muitos itens: vencidas e toques atrasados são limitados e o resto vira um cartão só", () => {
  const expenses = Array.from({ length: 9 }, (_, i) => conta(`c${i}`, 100 + i, `2026-09-0${(i % 8) + 1}`));
  const financeira = fila.buildFilaFinanceira({ expenses, purchases: [], hoje: HOJE });
  const tasks = Array.from({ length: 8 }, (_, i) => tarefa(`t${i}`, `2026-09-1${i % 3}T09:00:00.000Z`));
  const f = home.buildFilaDoDia({ hoje: HOJE, financeira, crmTasks: tasks });
  const contas = f.itens.filter((i) => i.origem === "CONTA");
  assert.equal(contas.length, 7, "6 individuais + 1 cartão com o resto");
  const resto = contas.find((i) => i.chave === "conta:vencidas-resto");
  assert.equal(resto.quantidade, 3);
  assert.match(resto.titulo, /\+3 contas vencidas/);
  const toques = f.itens.filter((i) => i.origem === "CRM");
  assert.equal(toques.length, 6, "5 individuais + 1 cartão com o resto");
  assert.equal(f.porOrigem.CONTA, 9);
  assert.equal(f.porOrigem.CRM, 8);
});

test("fechamento pendente: ontem útil com comanda e sem conferência", () => {
  const venda = (saleDate, amount) => ({ id: saleDate, saleDate, patientName: "x", crmContactRef: "", notes: "", createdAt: "", items: [{ id: "i", itemType: "CONSULTA", amount, description: "" }], payments: [{ id: "p", method: "PIX", amount, installments: 1, cardMachine: "ITAU" }] });
  const rec = (day, status) => ({ id: day, day, expectedPix: 0, expectedCardItau: 0, expectedCardSafra: 0, expectedCardOutra: 0, expectedDinheiro: 0, feeItau: 0, feeSafra: 0, status, divergenceNote: "", confirmedAt: null });
  // 14/09 é segunda: o dia útil anterior é sexta 11/09.
  assert.deepEqual(plain(home.fechamentoPendente([venda("2026-09-11", 2500)], [], HOJE)), { dia: "2026-09-11", total: 2500 });
  assert.equal(home.fechamentoPendente([venda("2026-09-11", 2500)], [rec("2026-09-11", "CONFERIDO")], HOJE), null);
  assert.deepEqual(plain(home.fechamentoPendente([venda("2026-09-11", 2500)], [rec("2026-09-11", "PENDENTE")], HOJE)), { dia: "2026-09-11", total: 2500 }, "pendente ainda é pendente");
  assert.equal(home.fechamentoPendente([venda("2026-09-12", 2500)], [], HOJE), null, "sábado não conta; sexta não teve comanda");
  // Depois do feriado de 07/09 (segunda), o dia útil anterior de terça 08/09 é sexta 04/09.
  assert.equal(home.fechamentoPendente([venda("2026-09-04", 1000)], [], "2026-09-08").dia, "2026-09-04");
});
