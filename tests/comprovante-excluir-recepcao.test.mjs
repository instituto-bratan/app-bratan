// A RECEPÇÃO PODE EXCLUIR COMPROVANTES (04/08/2026, pedido do Lucas).
// Regra: OCULTAR é de todo mundo que usa a tela (reversível); EXCLUIR DE VEZ é da
// coordenação em qualquer comprovante e da recepção só nos que ela mesma anexou.
// A mesma regra vale no banco (policy comprovante_delete_permitido + storage).
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

const access = loadTsModule("src/lib/access.ts");

// Espelho da regra da tela (podeExcluirDeVez) — mesma lógica da policy do banco.
function podeExcluirDeVez(pessoa, record) {
  if (access.isCoordenacao(pessoa?.cargo)) return true;
  if (!pessoa?.id) return false;
  return Boolean(record.anexadoPorId) && record.anexadoPorId === pessoa.id;
}

const ALINE = { id: "col-aline", cargo: "recepcionista" };
const OUTRA_RECEPCAO = { id: "col-bia", cargo: "recepcionista" };
const LUCAS = { id: "col-lucas", cargo: "gestor_financeiro" };
const CEO = { id: "col-andrya", cargo: "ceo" };

const doAline = { id: "c1", anexadoPorId: "col-aline" };
const daBia = { id: "c2", anexadoPorId: "col-bia" };
const semAutor = { id: "c3" };

test("a recepção VÊ o botão de ocultar (é o caminho reversível)", () => {
  assert.equal(access.canComprovantes("recepcionista"), true, "recepção usa a tela de comprovantes");
  assert.equal(access.canComprovantes("gestor_financeiro"), true);
});

test("a recepção EXCLUI DE VEZ o que ela mesma anexou", () => {
  assert.equal(podeExcluirDeVez(ALINE, doAline), true);
  assert.equal(podeExcluirDeVez(OUTRA_RECEPCAO, daBia), true);
});

test("uma recepcionista NÃO apaga o comprovante da outra (histórico protegido)", () => {
  assert.equal(podeExcluirDeVez(ALINE, daBia), false);
  assert.equal(podeExcluirDeVez(OUTRA_RECEPCAO, doAline), false);
});

test("comprovante antigo sem autor: só a coordenação apaga de vez", () => {
  assert.equal(podeExcluirDeVez(ALINE, semAutor), false);
  assert.equal(podeExcluirDeVez(LUCAS, semAutor), true);
  assert.equal(podeExcluirDeVez(CEO, semAutor), true);
});

test("a coordenação continua podendo excluir qualquer comprovante", () => {
  for (const registro of [doAline, daBia, semAutor]) {
    assert.equal(podeExcluirDeVez(LUCAS, registro), true);
    assert.equal(podeExcluirDeVez(CEO, registro), true);
  }
});

test("sem pessoa logada não exclui nada", () => {
  assert.equal(podeExcluirDeVez(null, doAline), false);
  assert.equal(podeExcluirDeVez({ cargo: "recepcionista" }, doAline), false, "sem id não dá match de autoria");
});
