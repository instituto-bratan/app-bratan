import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const leitor = await loadTs("src/features/financeiro/leitorDocumento.ts");

test("código de barras de boleto bancário vira linha digitável de 47 dígitos que o leitor reconhece", () => {
  // Boleto de exemplo (banco 341, moeda 9, DV 1, fator 9999, valor 100,00 + campo livre).
  const barras = "34191999900000100001234567890123456789012345".slice(0, 44);
  const linha = leitor.linhaDigitavelDoCodigoDeBarras(barras);
  assert.equal(linha.length, 47);
  assert.equal(linha.slice(0, 4), "3419");
  assert.equal(linha.slice(32, 33), barras[4], "o DV geral do código vai para o campo 4");
  assert.equal(linha.slice(33), barras.slice(5, 19), "fator + valor formam o campo 5");
  const lida = leitor.extrairLinhaDigitavel(linha);
  assert.equal(lida?.tipo, "BOLETO");
  assert.equal(leitor.linhaDigitavelDoCodigoDeBarras("123"), null);
});

test("código de barras de guia (8…) vira 48 dígitos com DV por bloco", () => {
  const barras = "8366" + "0000001000" + "123456789012345678901234567890";
  assert.equal(barras.length, 44);
  const linha = leitor.linhaDigitavelDoCodigoDeBarras(barras);
  assert.equal(linha.length, 48);
  assert.equal(leitor.extrairLinhaDigitavel(linha)?.tipo, "GUIA");
});
