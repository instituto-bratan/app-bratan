// ABA PACIENTES (05/10/2026): a busca que o Lucas pediu para achar a ficha e
// colocar o CPF — por nome sem acento, por pedaço do telefone, por e-mail.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadTsModule(filePath) {
  const output = ts.transpileModule(fs.readFileSync(path.resolve(repoRoot, filePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: () => ({}), String, Array, Object, Set, Intl }, { filename: filePath });
  return module.exports;
}
const m = loadTsModule("src/features/pacientes/pacientesData.ts");

const lista = [
  { id: "a", nome: "Ana Flávia Araújo Ortiz", apelido: "", telefone: "(11) 98280-2732", whatsapp: "", email: "", tipo: "PATIENT", criadoEm: "", temCpf: false },
  { id: "b", nome: "Géssica Nutri", apelido: "", telefone: "", whatsapp: "11 99999-0000", email: "gessica@exemplo.com", tipo: "LEAD", criadoEm: "", temCpf: true },
  { id: "c", nome: "Nestor Jose Crespim Junior", apelido: "Nestor", telefone: "", whatsapp: "", email: "", tipo: "FORMER_PATIENT", criadoEm: "", temCpf: true },
];

test("busca por nome ignora acento e caixa, e cada palavra tem que bater", () => {
  assert.deepEqual([...m.buscar(lista, "ana flavia")].map((p) => p.id), ["a"]);
  assert.deepEqual([...m.buscar(lista, "GESSICA")].map((p) => p.id), ["b"]);
  assert.deepEqual([...m.buscar(lista, "ana nestor")].map((p) => p.id), [], "duas palavras de pessoas diferentes não acham ninguém");
});

test("busca por telefone olha só os dígitos, e por e-mail acha o domínio", () => {
  assert.deepEqual([...m.buscar(lista, "98280")].map((p) => p.id), ["a"]);
  assert.deepEqual([...m.buscar(lista, "11 99999")].map((p) => p.id), ["b"], "pedaço com espaço: cada pedaço procura no telefone");
  assert.deepEqual([...m.buscar(lista, "exemplo.com")].map((p) => p.id), ["b"]);
});

test("o filtro de tipo separa pacientes, ex-pacientes e leads", () => {
  assert.deepEqual([...m.buscar(lista, "", "pacientes")].map((p) => p.id), ["a"]);
  assert.deepEqual([...m.buscar(lista, "", "ex")].map((p) => p.id), ["c"]);
  assert.deepEqual([...m.buscar(lista, "", "leads")].map((p) => p.id), ["b"]);
  assert.equal(m.buscar(lista, "", "todos").length, 3);
});

test("ordem alfabética e resumo com CPF só para quem pode ver", () => {
  assert.deepEqual([...m.ordenar(lista)].map((p) => p.id), ["a", "b", "c"]);
  assert.equal(m.resumoDaLista(lista, true), "3 contato(s) · 1 paciente(s) · 2 com CPF guardado");
  assert.equal(m.resumoDaLista(lista, false), "3 contato(s) · 1 paciente(s)");
});

test("a chave 'pacientes' existe nos acessos com rótulo", () => {
  const src = fs.readFileSync(path.resolve(repoRoot, "src/lib/access.ts"), "utf8");
  assert.match(src, /\| "pacientes";/);
  assert.match(src, /pacientes: "Pacientes \(busca, ficha e CPF\)"/);
});
