// TEXTO DO MÓDULO NUTRIÇÃO (28/09/2026).
//
// Pedidos da Dra. Géssica nos áudios: escrever sempre "e", nunca o "e
// comercial" (&); o nome da pessoa sem a palavra "paciente" antes; título
// "Plano alimentar — [mês e ano]" com o mês por extenso.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const texto = loadTs("src/features/nutricao/dominio/texto.ts");

test("troca o & por e, com um espaço de cada lado", () => {
  assert.equal(texto.normalizarTexto("arroz & feijão"), "arroz e feijão");
  assert.equal(texto.normalizarTexto("arroz&feijão"), "arroz e feijão");
  assert.equal(texto.normalizarTexto("Impostos & NFs & mais"), "Impostos e NFs e mais");
});

test("tira espaços sobrando sem mexer no conteúdo", () => {
  assert.equal(texto.normalizarTexto("  musculação   3x/sem  "), "musculação 3x/sem");
  assert.equal(texto.normalizarTexto("sem açúcar , com adoçante ."), "sem açúcar, com adoçante.");
  assert.equal(texto.normalizarTexto(""), "");
});

test("o nome no documento nunca começa com 'paciente'", () => {
  assert.equal(texto.nomeNoDocumento("Paciente Marina Teixeira"), "Marina Teixeira");
  assert.equal(texto.nomeNoDocumento("paciente: Marina Teixeira"), "Marina Teixeira");
  assert.equal(texto.nomeNoDocumento("PACIENTE - Marina Teixeira"), "Marina Teixeira");
  assert.equal(texto.nomeNoDocumento("  Marina   Teixeira "), "Marina Teixeira");
  // "Paciência" é nome, não prefixo
  assert.equal(texto.nomeNoDocumento("Paciência Souza"), "Paciência Souza");
});

test("mês por extenso para o título do plano", () => {
  assert.equal(texto.mesPorExtenso("2026-09"), "setembro de 2026");
  assert.equal(texto.mesPorExtenso("2027-03"), "março de 2027");
  assert.equal(texto.mesRefDe("2026-09-28"), "2026-09");
});

test("datas no formato brasileiro", () => {
  assert.equal(texto.dataCurta("2026-09-28"), "28/09/2026");
  assert.equal(texto.diaMes("2026-09-28"), "28/09");
  assert.equal(texto.dataCurta(""), "");
});

test("números com vírgula decimal", () => {
  assert.equal(texto.formatarNumero(71.2, 1), "71,2");
  assert.equal(texto.formatarNumero(1.5, 1), "1,5");
  assert.equal(texto.formatarNumero(7, 0), "7");
  assert.equal(texto.formatarNumero(31.55, 1), "31,6");
  assert.equal(texto.formatarNumero(1500, 0), "1500");
});

test("frase termina com ponto uma vez só", () => {
  assert.equal(texto.terminarComPonto("adesão ok"), "adesão ok.");
  assert.equal(texto.terminarComPonto("adesão ok."), "adesão ok.");
  assert.equal(texto.terminarComPonto("tudo certo!"), "tudo certo!");
  assert.equal(texto.terminarComPonto(""), "");
});

test("primeira letra maiúscula, o resto como está", () => {
  assert.equal(texto.capitalizarPrimeira("musculação 3x/sem"), "Musculação 3x/sem");
  assert.equal(texto.capitalizarPrimeira("PGC alto"), "PGC alto");
  assert.equal(texto.capitalizarPrimeira(""), "");
});
