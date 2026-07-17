import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadComprovantesModule() {
  const absolutePath = path.resolve(repoRoot, "src/features/comprovantes/comprovantesData.ts");
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const comp = loadComprovantesModule();

function rec(over = {}) {
  return {
    id: over.id ?? `c-${Math.random()}`,
    tipo: over.tipo ?? "entrada",
    arquivoNome: over.arquivoNome ?? "recibo.pdf",
    arquivoTipo: "pdf",
    arquivoTamanho: 1000,
    anexadoEm: over.anexadoEm ?? "2026-06-15T12:00:00.000Z",
    anexadoPor: over.anexadoPor ?? "Aline",
    anexadoPorCargo: over.anexadoPorCargo ?? "recepcionista",
    pacienteReferencia: over.pacienteReferencia,
    valor: over.valor,
    formaPagamento: over.formaPagamento,
    observacao: over.observacao,
    deletedAt: over.deletedAt,
    sharePoint: { status: "pendente" },
  };
}

const base = { ...comp.defaultComprovanteFiltros, periodo: "tudo", mes: "" };

// A lista volta do realm do vm; normaliza para o realm do teste antes de comparar.
const ids = (list) => Array.from(list, (r) => r.id);
const arr = (list) => Array.from(list);

test("filtro por mês específico isola o mês", () => {
  const records = [
    rec({ id: "jun", anexadoEm: "2026-06-10T10:00:00.000Z" }),
    rec({ id: "jul", anexadoEm: "2026-07-10T10:00:00.000Z" }),
  ];
  const out = comp.filterComprovantes(records, { ...base, mes: "2026-06" });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "jun");
});

test("filtro por DIA específico isola o dia (e tem prioridade sobre mês/período)", () => {
  const records = [
    rec({ id: "d16", anexadoEm: "2026-07-16T08:00:00.000Z" }),
    rec({ id: "d16-tarde", anexadoEm: "2026-07-16T20:30:00.000Z" }),
    rec({ id: "d17", anexadoEm: "2026-07-17T09:00:00.000Z" }),
    rec({ id: "jun", anexadoEm: "2026-06-16T09:00:00.000Z" }),
  ];
  const out = comp.filterComprovantes(records, { ...base, data: "2026-07-16" });
  assert.deepEqual(ids(out).sort(), ["d16", "d16-tarde"]);
  // dia vence mês, mesmo com mês preenchido em outro valor
  const out2 = comp.filterComprovantes(records, { ...base, data: "2026-07-16", mes: "2026-06" });
  assert.deepEqual(ids(out2).sort(), ["d16", "d16-tarde"]);
  // conta como filtro ativo
  assert.ok(comp.countActiveComprovanteFiltros({ ...comp.defaultComprovanteFiltros, data: "2026-07-16" }) >= 1);
});

test("busca casa paciente, arquivo, observação e autor", () => {
  const records = [
    rec({ id: "a", pacienteReferencia: "João Silva" }),
    rec({ id: "b", observacao: "consulta hormonal" }),
    rec({ id: "c", anexadoPor: "Estevão" }),
  ];
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, busca: "joão" })), ["a"]);
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, busca: "HORMONAL" })), ["b"]);
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, busca: "estev" })), ["c"]);
});

test("filtro por tipo separa comprovantes de estornos", () => {
  const records = [rec({ id: "e", tipo: "entrada" }), rec({ id: "x", tipo: "estorno" })];
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, tipo: "estorno" })), ["x"]);
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, tipo: "entrada" })), ["e"]);
});

test("filtro por forma de pagamento e por autor", () => {
  const records = [
    rec({ id: "pix", formaPagamento: "pix", anexadoPor: "Aline" }),
    rec({ id: "din", formaPagamento: "dinheiro", anexadoPor: "Estevão" }),
  ];
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, forma: "pix" })), ["pix"]);
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, autor: "Estevão" })), ["din"]);
});

test("ordenação por valor e por data", () => {
  const records = [
    rec({ id: "baixo", valor: 100, anexadoEm: "2026-06-01T10:00:00.000Z" }),
    rec({ id: "alto", valor: 900, anexadoEm: "2026-06-20T10:00:00.000Z" }),
  ];
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, ordenacao: "maior_valor" })), ["alto", "baixo"]);
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, ordenacao: "menor_valor" })), ["baixo", "alto"]);
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, ordenacao: "antigos" })), ["baixo", "alto"]);
  assert.deepEqual(ids(comp.filterComprovantes(records, { ...base, ordenacao: "recentes" })), ["alto", "baixo"]);
});

test("registros ocultos (deletedAt) nunca aparecem", () => {
  const records = [rec({ id: "vivo" }), rec({ id: "morto", deletedAt: "2026-06-16T10:00:00.000Z" })];
  assert.deepEqual(ids(comp.filterComprovantes(records, base)), ["vivo"]);
});

test("soma líquida considera estorno negativo", () => {
  const records = [rec({ valor: 500 }), rec({ valor: -200, tipo: "estorno" })];
  assert.equal(comp.somaComprovantes(records), 300);
});

test("countActiveFiltros conta desvios do padrão", () => {
  assert.equal(comp.countActiveComprovanteFiltros(comp.defaultComprovanteFiltros), 0);
  assert.equal(comp.countActiveComprovanteFiltros({ ...comp.defaultComprovanteFiltros, busca: "x", forma: "pix" }), 2);
  // mês específico conta como 1 (não soma com período)
  assert.equal(comp.countActiveComprovanteFiltros({ ...comp.defaultComprovanteFiltros, mes: "2026-06" }), 1);
});

test("listComprovanteAutores retorna nomes únicos e ordenados, sem ocultos", () => {
  const records = [
    rec({ anexadoPor: "Estevão" }),
    rec({ anexadoPor: "Aline" }),
    rec({ anexadoPor: "Aline" }),
    rec({ anexadoPor: "Zeca", deletedAt: "2026-06-16T10:00:00.000Z" }),
  ];
  assert.deepEqual(arr(comp.listComprovanteAutores(records)), ["Aline", "Estevão"]);
});
