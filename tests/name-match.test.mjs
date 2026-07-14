import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadNameMatch() {
  const absolutePath = path.resolve(repoRoot, "src/features/crm/nameMatch.ts");
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, Set, Map, String, Array },
    { filename: absolutePath },
  );
  return module.exports;
}

const { extractPersonName, personNamesMatch, clusterPersonNames } = loadNameMatch();

test("extractPersonName tira as anotações da recepção e deixa só o nome", () => {
  assert.equal(extractPersonName("Fulana de Tal NF unificada 15/07"), "Fulana de Tal");
  assert.equal(extractPersonName("Fulana de Tal Almeida - nota separada"), "Fulana de Tal Almeida");
  assert.equal(extractPersonName("João Souza sinal 500 restante 13/08"), "João Souza");
  assert.equal(extractPersonName("Maria Silva (retorno)"), "Maria Silva");
  assert.equal(extractPersonName("Pedro Lima pix"), "Pedro Lima");
  assert.equal(extractPersonName("  Ana   Paula  Costa  "), "Ana Paula Costa");
  assert.equal(extractPersonName("Carlos 12/07 obs: pagou metade"), "Carlos");
});

test("extractPersonName descarta linhas de comanda que não são pessoas", () => {
  assert.equal(extractPersonName("Fechamento do dia"), "");
  assert.equal(extractPersonName("FECHAMENTO"), "");
  assert.equal(extractPersonName("Dia zerado"), "");
  assert.equal(extractPersonName("Total do dia"), "");
  assert.equal(extractPersonName("Sangria"), "");
  assert.equal(extractPersonName("Rendimento do banco"), "");
  assert.equal(extractPersonName("Renata Torres"), "Renata Torres");
});

test("personNamesMatch reconhece variações do mesmo nome", () => {
  assert.equal(personNamesMatch("Fulana de Tal", "Fulana de Tal Almeida"), true);
  assert.equal(personNamesMatch("Fulana Almeida", "Fulana de Tal Almeida"), true);
  assert.equal(personNamesMatch("FULANA DE TAL ALMEIDA", "fulana tal"), true);
  assert.equal(personNamesMatch("José da Silva", "Jose Silva"), true);
});

test("personNamesMatch NÃO junta pessoas diferentes", () => {
  assert.equal(personNamesMatch("Maria Silva", "Maria Souza"), false);
  assert.equal(personNamesMatch("Fulana de Tal", "Beltrana de Tal"), false);
  assert.equal(personNamesMatch("João Pedro Santos", "Joana Pedro Santos"), false);
  assert.equal(personNamesMatch("Ana", "Ana Clara"), false);
});

test("clusterPersonNames agrupa variações no nome mais completo", () => {
  const mapping = clusterPersonNames(["Fulana de Tal", "Fulana de Tal Almeida", "Fulana Almeida", "Maria Souza"]);
  assert.equal(mapping.get("Fulana de Tal"), "Fulana de Tal Almeida");
  assert.equal(mapping.get("Fulana Almeida"), "Fulana de Tal Almeida");
  assert.equal(mapping.get("Fulana de Tal Almeida"), "Fulana de Tal Almeida");
  assert.equal(mapping.get("Maria Souza"), "Maria Souza");
});
