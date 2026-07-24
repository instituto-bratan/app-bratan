import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadAccess() {
  const absolutePath = path.resolve(repoRoot, "src/lib/access.ts");
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: () => ({}), Date, console }, { filename: absolutePath });
  return module.exports;
}

const access = loadAccess();
const pessoa = (cargo, acessos = {}) => ({ cargo, acessos });

test("padrão do cargo: recepcionista edita Lançar Dia, não vê P12; gestor só VÊ o financeiro", () => {
  assert.equal(access.moduleLevel(pessoa("recepcionista"), "fin-lancar-dia"), "EDITAR");
  assert.equal(access.moduleLevel(pessoa("recepcionista"), "fin-p12"), "OCULTO");
  assert.equal(access.moduleLevel(pessoa("gestor"), "fin-p12"), "VER");
  assert.equal(access.moduleLevel(pessoa("gestor_financeiro"), "fin-p12"), "EDITAR");
  assert.equal(access.moduleLevel(pessoa("limpeza"), "crm"), "EDITAR"); // CRM é do time todo
  assert.equal(access.moduleLevel(pessoa("limpeza"), "fin-contas"), "OCULTO");
  assert.equal(access.moduleLevel(null, "crm"), "OCULTO");
});

test("exceção por pessoa VENCE o cargo — para esconder, rebaixar ou liberar a mais", () => {
  // esconder do gestor uma tela que o cargo veria
  assert.equal(access.moduleLevel(pessoa("gestor", { "fin-p12": "OCULTO" }), "fin-p12"), "OCULTO");
  // rebaixar o financeiro para só-ver numa tela
  assert.equal(access.moduleLevel(pessoa("gestor_financeiro", { "fin-poupanca": "VER" }), "fin-poupanca"), "VER");
  // liberar A MAIS: enfermeira ganhando SÓ a tela de Metas (o caso do Lucas)
  const enfermeira = pessoa("enfermeira", { "fin-metas": "VER" });
  assert.equal(access.moduleLevel(enfermeira, "fin-metas"), "VER");
  assert.equal(access.canSeeModule(enfermeira, "fin-metas"), true);
  assert.equal(access.canEditModule(enfermeira, "fin-metas"), false);
  assert.equal(access.moduleLevel(enfermeira, "fin-contas"), "OCULTO", "as outras telas continuam fechadas");
  // valor inválido gravado no banco não quebra: cai no padrão do cargo
  assert.equal(access.moduleLevel(pessoa("gestor", { "fin-p12": "banana" }), "fin-p12"), "VER");
});

test("tela Acessos é fixa por cargo (ninguém se tranca fora) e todo módulo tem rótulo", () => {
  assert.equal(access.canManageAcessos("gestor_financeiro"), true);
  assert.equal(access.canManageAcessos("dr_daniel"), true);
  assert.equal(access.canManageAcessos("ceo"), true);
  assert.equal(access.canManageAcessos("gestor"), false);
  assert.equal(access.canManageAcessos("secretaria_executiva"), false);
  for (const key of access.moduleKeys) {
    assert.ok(access.moduleLabels[key], `sem rótulo: ${key}`);
    assert.ok(["OCULTO", "VER", "EDITAR"].includes(access.moduleLevel(pessoa("ceo"), key)));
  }
});
