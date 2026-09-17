// CPF (17/09/2026). Entrou no app por causa da emissão automática da nota: sem
// CPF do tomador o paciente perde o bilhete da Nota do Milhão. CPF errado não
// pode virar nota rejeitada dias depois — tem que barrar na digitação.
// Os números aqui são de teste, montados para fechar os dígitos verificadores.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/lib/cpf.ts");

test("aceita CPF com os dígitos verificadores corretos, com ou sem pontuação", () => {
  assert.equal(mod.cpfValido("529.982.247-25"), true);
  assert.equal(mod.cpfValido("52998224725"), true, "sem pontuação vale igual");
  assert.equal(mod.cpfValido(" 529.982.247-25 "), true, "espaço sobrando não derruba");
});

test("recusa dígito verificador errado", () => {
  assert.equal(mod.cpfValido("529.982.247-26"), false);
  assert.equal(mod.cpfValido("111.444.777-36"), false);
});

test("recusa o que não é CPF de ninguém", () => {
  assert.equal(mod.cpfValido(""), false);
  assert.equal(mod.cpfValido("123"), false, "curto demais");
  assert.equal(mod.cpfValido("529.982.247-250"), false, "longo demais vira 11 dígitos errados");
  for (const repetido of ["00000000000", "11111111111", "99999999999"]) {
    assert.equal(mod.cpfValido(repetido), false, `${repetido} passa na conta mas não é CPF`);
  }
});

test("mostra na tela com o meio escondido", () => {
  assert.equal(mod.cpfMascarado("529.982.247-25"), "529.***.***-25");
  assert.equal(mod.cpfMascarado("123"), "", "incompleto não vira máscara meia-boca");
});

test("formata para conferência e guarda só dígitos", () => {
  assert.equal(mod.cpfFormatado("52998224725"), "529.982.247-25");
  assert.equal(mod.cpfDigitos("529.982.247-25"), "52998224725");
  assert.equal(mod.cpfDigitos("5299822472555555"), "52998224725", "corta o que passa de 11");
});

test("formata enquanto a pessoa digita, sem travar o apagar", () => {
  assert.equal(mod.cpfEnquantoDigita("529"), "529");
  assert.equal(mod.cpfEnquantoDigita("529982"), "529.982");
  assert.equal(mod.cpfEnquantoDigita("529982247"), "529.982.247");
  assert.equal(mod.cpfEnquantoDigita("52998224725"), "529.982.247-25");
  assert.equal(mod.cpfEnquantoDigita("52"), "52", "apagando, continua deixando digitar");
});
