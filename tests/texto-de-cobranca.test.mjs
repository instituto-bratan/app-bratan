// O TEXTINHO DE COBRANÇA (21/09/2026).
//
// A régua deste teste é o exemplo que o Lucas mandou, letra por letra — inclusive
// a linha do SIDNEY, que NÃO tem valor porque ele vai pagar por dose. Se o app
// começar a escrever "R$ 0,00" ali, estará cobrando um valor que ninguém
// combinou, e isso chega no paciente.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/pagamentos/pagamentosData.ts");

const lembrete = (pacienteNome, valorPendente, observacao) => ({
  id: pacienteNome,
  pacienteNome,
  valorPendente,
  observacao,
  dataPrevista: "2026-09-21",
  status: "aberto",
  criadoPor: "lucas",
  criadoEm: "2026-09-01T00:00:00.000Z",
});

test("o texto sai igual ao exemplo do Lucas", () => {
  const texto = mod.textoDeCobranca([
    lembrete("GABRIELA GODOI", 5508, "PAGAR CLUBE DE CONSULTAS DANIEL 03 DANIEL 03 GESSICA"),
    lembrete("SIDNEY FLORENCIO", 0, "2 DOSE DE TESTOSTERONA UNDECILATO - VAI PAGAR POR DOSE ATE 3X"),
    lembrete("Caroline Freire de Sá Dias", 6531, "TRATAMENTO CAROLINE DE SA + TRATAMENTO MILTON MARQUES PAGAR EM CREDIARIO"),
  ]);
  const esperado = [
    "COBRAR:",
    "- GABRIELA GODOI ( R$ 5.508,00 - PAGAR CLUBE DE CONSULTAS DANIEL 03 DANIEL 03 GESSICA)",
    "- SIDNEY FLORENCIO ( 2 DOSE DE TESTOSTERONA UNDECILATO - VAI PAGAR POR DOSE ATE 3X)",
    "- Caroline Freire de Sá Dias ( R$ 6.531,00 - TRATAMENTO CAROLINE DE SA + TRATAMENTO MILTON MARQUES PAGAR EM CREDIARIO)",
  ].join("\n");
  assert.equal(texto.replace(/ /g, " "), esperado, "formato exato do áudio de 21/09");
});

test("sem valor fechado, o parêntese leva só a observação", () => {
  const texto = mod.textoDeCobranca([lembrete("SIDNEY FLORENCIO", 0, "VAI PAGAR POR DOSE")]);
  assert.doesNotMatch(texto, /R\$/, "inventar R$ 0,00 seria cobrar um valor que ninguém combinou");
  assert.match(texto, /- SIDNEY FLORENCIO \( VAI PAGAR POR DOSE\)/);
});

test("sem observação, sobra o valor — e o nome nunca some", () => {
  const texto = mod.textoDeCobranca([lembrete("MARIA", 1200, ""), lembrete("JOÃO", 0, "")]);
  assert.match(texto.replace(/ /g, " "), /- MARIA \( R\$ 1\.200,00\)/);
  assert.match(texto, /- JOÃO$/m, "sem valor e sem observação, o nome fica na lista mesmo assim");
});

test("lista vazia não gera cabeçalho solto", () => {
  assert.equal(mod.textoDeCobranca([]), "", "copiar 'COBRAR:' sozinho só confunde");
});

test("a ordem é a que veio — é o retrato da tela que o Lucas está olhando", () => {
  const texto = mod.textoDeCobranca([lembrete("ZENAIDE", 100, "a"), lembrete("ANA", 200, "b")]);
  const linhas = texto.split("\n");
  assert.match(linhas[1], /ZENAIDE/);
  assert.match(linhas[2], /ANA/);
});
