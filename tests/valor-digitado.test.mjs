// VALOR EM DINHEIRO DIGITADO POR GENTE (17/09/2026).
//
// A auditoria da nota fiscal achou um erro de CEM VEZES: a leitura apagava todo
// ponto (porque no Brasil ponto é separador de milhar), mas o teclado numérico
// do notebook e o inputMode do iPhone oferecem PONTO. Digitar "5119.00" num
// tratamento de R$ 5.119,00 lançava R$ 511.900,00 — em 11 telas, entre elas a
// comanda, o fechamento e a nota fiscal.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const { parseFinAmount } = await loadTs("src/features/financeiro/financeiroData.ts");

test("padrão brasileiro: ponto é milhar, vírgula é decimal", () => {
  assert.equal(parseFinAmount("5.119,00"), 5119);
  assert.equal(parseFinAmount("1.000,00"), 1000);
  assert.equal(parseFinAmount("1.234.567,89"), 1234567.89);
  assert.equal(parseFinAmount("5119,00"), 5119);
  assert.equal(parseFinAmount("0,02"), 0.02);
});

test("ponto como decimal (teclado numérico) não multiplica por cem", () => {
  assert.equal(parseFinAmount("5119.00"), 5119, "era 511900 — o erro que a auditoria achou");
  assert.equal(parseFinAmount("1000.50"), 1000.5);
  assert.equal(parseFinAmount("1000.5"), 1000.5);
  assert.equal(parseFinAmount("0.02"), 0.02);
});

test("três dígitos depois do ponto continuam sendo milhar", () => {
  assert.equal(parseFinAmount("1.000"), 1000, "no Brasil isso é mil, não um e meio");
  assert.equal(parseFinAmount("1.234.567"), 1234567);
  assert.equal(parseFinAmount("1.234.56"), 1234.56, "último grupo com 2 dígitos é decimal");
});

test("sem pontuação e vazio", () => {
  assert.equal(parseFinAmount("5119"), 5119);
  assert.equal(parseFinAmount(""), 0);
  assert.equal(parseFinAmount("   "), 0);
  assert.equal(parseFinAmount("abc"), 0);
});
