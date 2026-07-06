import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadMoneyModule() {
  const absolutePath = path.resolve(repoRoot, "src/lib/money.ts");
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, Number, String, Math },
    { filename: absolutePath },
  );
  return module.exports;
}

const { parseMoneyBR } = loadMoneyModule();

test("parseMoneyBR entende os jeitos comuns de digitar valores em reais", () => {
  assert.equal(parseMoneyBR("150"), 150);
  assert.equal(parseMoneyBR("150,5"), 150.5);
  assert.equal(parseMoneyBR("1.500,00"), 1500);
  assert.equal(parseMoneyBR("12.345.678,90"), 12345678.9);
  assert.equal(parseMoneyBR("R$ 150"), 150);
  assert.equal(parseMoneyBR("R$ 1.500,00"), 1500);
  assert.equal(parseMoneyBR(" 250,00 "), 250);
});

test("parseMoneyBR trata ponto como decimal só quando parece decimal", () => {
  assert.equal(parseMoneyBR("1500.00"), 1500);
  assert.equal(parseMoneyBR("1500.5"), 1500.5);
  assert.equal(parseMoneyBR("1.500"), 1500);
  assert.equal(parseMoneyBR("1,500.00"), 1500);
  assert.equal(parseMoneyBR("5.00"), 5);
});

test("parseMoneyBR rejeita o que não é valor", () => {
  assert.equal(Number.isNaN(parseMoneyBR("")), true);
  assert.equal(Number.isNaN(parseMoneyBR("   ")), true);
  assert.equal(Number.isNaN(parseMoneyBR("abc")), true);
  assert.equal(Number.isNaN(parseMoneyBR("R$")), true);
  assert.equal(Number.isNaN(parseMoneyBR("-")), true);
});

test("parseMoneyBR preserva sinal negativo", () => {
  assert.equal(parseMoneyBR("-150,00"), -150);
  assert.equal(parseMoneyBR("-1.500"), -1500);
});
