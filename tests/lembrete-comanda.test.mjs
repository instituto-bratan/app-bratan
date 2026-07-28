import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const localStoreStub = {
  readLocalValue: (_key, fallback) => fallback,
  todayISO: () => "2026-07-28",
  writeLocalValue: () => undefined,
  formatShortTime: () => "00:00",
};

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
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
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const pag = loadTsModule("src/features/pagamentos/pagamentosData.ts");

function lembrete(over = {}) {
  return {
    id: "lem-1",
    pacienteNome: "Hilton Dispatto",
    crmContactRef: "crm-hilton",
    valorPendente: 22000,
    dataPrevista: "2026-07-30",
    status: "aberto",
    criadoPor: "Lucas",
    criadoEm: "2026-07-01T10:00:00.000Z",
    ...over,
  };
}

test("acha o lembrete do paciente pelo contato do CRM (à prova de digitação)", () => {
  const abertos = pag.openLembretesForPatient([lembrete({ pacienteNome: "HILTON DISPATO" })], {
    ref: "crm-hilton",
    name: "Hilton Dispatto",
  });
  assert.equal(abertos.length, 1, "casou pelo ref, mesmo com o nome escrito diferente");
});

test("lembrete antigo sem link casa pelo nome, inclusive só com o primeiro nome", () => {
  const lista = [lembrete({ id: "lem-milton", pacienteNome: "Milton", crmContactRef: undefined, valorPendente: 4003 })];
  const achado = pag.openLembretesForPatient(lista, { ref: "crm-milton", name: "Milton Ferreira da Silva" });
  assert.equal(achado.length, 1, "'Milton' casa com 'Milton Ferreira da Silva'");
  const acentos = pag.openLembretesForPatient(
    [lembrete({ pacienteNome: "JOSÉ IVAN", crmContactRef: undefined })],
    { ref: "", name: "jose ivan" },
  );
  assert.equal(acentos.length, 1, "acento e caixa não impedem o encaixe");
});

test("não pega lembrete de outro paciente nem já pago", () => {
  const lista = [
    lembrete({ id: "outro", pacienteNome: "Ariane Caramigo", crmContactRef: "crm-ariane" }),
    lembrete({ id: "pago", status: "pago" }),
    lembrete({ id: "zerado", valorPendente: 0 }),
    lembrete({ id: "apagado", deletedAt: "2026-07-20T10:00:00.000Z" }),
  ];
  const achado = pag.openLembretesForPatient(lista, { ref: "crm-hilton", name: "Hilton Dispatto" });
  assert.equal(achado.length, 0, "só lembrete em aberto, do paciente certo, com saldo");
});

test("comanda menor que a dívida abate parcial e mantém o resto em aberto", () => {
  const plano = pag.planEncaixeComanda([lembrete()], { ref: "crm-hilton", name: "Hilton Dispatto" }, 10000);
  assert.equal(plano.totalEmAberto, 22000);
  assert.equal(plano.totalAbatido, 10000);
  assert.equal(plano.encaixes[0].quitou, false);
  assert.equal(plano.encaixes[0].novoPendente, 12000, "sobra devendo R$ 12 mil");
  assert.equal(plano.sobra, 0);
});

test("comanda igual à dívida QUITA o lembrete", () => {
  const plano = pag.planEncaixeComanda([lembrete({ valorPendente: 950 })], { ref: "crm-hilton", name: "Hilton" }, 950);
  assert.equal(plano.encaixes[0].quitou, true);
  assert.equal(plano.encaixes[0].novoPendente, 0);
});

test("comanda maior que a dívida NUNCA abate mais do que se deve", () => {
  const plano = pag.planEncaixeComanda([lembrete({ valorPendente: 950 })], { ref: "crm-hilton", name: "Hilton" }, 5000);
  assert.equal(plano.totalAbatido, 950, "abate só o que estava em aberto");
  assert.equal(plano.sobra, 4050, "o resto é faturamento novo da comanda");
});

test("com vários lembretes, abate do vencimento mais antigo primeiro", () => {
  const lista = [
    lembrete({ id: "novo", dataPrevista: "2026-09-08", valorPendente: 1150 }),
    lembrete({ id: "velho", dataPrevista: "2026-08-05", valorPendente: 1150 }),
  ];
  const plano = pag.planEncaixeComanda(lista, { ref: "crm-hilton", name: "Hilton" }, 1500);
  assert.equal(plano.encaixes[0].lembreteId, "velho", "o mais antigo primeiro");
  assert.equal(plano.encaixes[0].valorAbatido, 1150);
  assert.equal(plano.encaixes[1].lembreteId, "novo");
  assert.equal(plano.encaixes[1].valorAbatido, 350);
  assert.equal(plano.totalAbatido, 1500);
});

test("paciente sem dívida: plano vazio (a faixa de aviso nem aparece)", () => {
  const plano = pag.planEncaixeComanda([lembrete()], { ref: "crm-outro", name: "Paciente Novo" }, 3000);
  assert.equal(plano.totalEmAberto, 0);
  assert.equal(plano.encaixes.length, 0);
  assert.equal(plano.sobra, 3000);
});

test("centavos não viram dízima: 0,01 é tratado direito", () => {
  const plano = pag.planEncaixeComanda([lembrete({ valorPendente: 0.01 })], { ref: "crm-hilton", name: "Hilton" }, 1000);
  assert.equal(plano.totalAbatido, 0.01);
  assert.equal(plano.sobra, 999.99);
});

test("REGRA CENTRAL: recebimento que veio de comanda NÃO entra no caixa do crediário", () => {
  const recebimentos = [
    { id: "r1", lembreteId: "lem-1", valor: 5000, forma: "DINHEIRO", recebidoEm: "2026-07-20", saleRef: null },
    { id: "r2", lembreteId: "lem-2", valor: 3000, forma: "DINHEIRO", recebidoEm: "2026-07-21", saleRef: "fsale-123" },
    { id: "r3", lembreteId: "lem-3", valor: 2000, forma: "PIX", recebidoEm: "2026-07-22", saleRef: null },
  ];
  const caixa = pag.crediarioCashMoves(recebimentos);
  assert.deepEqual(caixa.map((item) => item.id), ["r1"], "só o dinheiro do crediário sem comanda");
  const total = caixa.reduce((sum, item) => sum + item.valor, 0);
  assert.equal(total, 5000, "os R$ 3 mil que vieram por comanda não entram (já estão no faturamento)");
});
