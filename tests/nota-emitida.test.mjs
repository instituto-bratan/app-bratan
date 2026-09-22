// A NOTA EMITIDA COMO ARQUIVO (22/09/2026): nome na pasta do contador, pasta do
// mês, caminho no bucket e a regra "uma nota cobre a outra".
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("supabase/functions/_shared/notaEmitida.ts");
const nota = { numero: "6207", pacienteNome: "Tatiane Lopes de Souza", valor: 6181, dataEmissao: "2026-09-22T13:42:58-03:00" };

test("nome do arquivo: número, paciente em maiúsculas e valor em reais", () => {
  assert.equal(mod.nomeDoArquivoEmitido(nota, "pdf"), "NF 6207 - TATIANE LOPES DE SOUZA - R$ 6.181,00.pdf");
  assert.equal(mod.nomeDoArquivoEmitido({ ...nota, numero: "000123", pacienteNome: 'Ana / "Bia" : Costa?' }, "xml"), "NF 123 - ANA BIA COSTA - R$ 6.181,00.xml", "caracteres que o SharePoint recusa saem");
  assert.equal(mod.nomeDoArquivoEmitido({ ...nota, pacienteNome: "" }, "pdf"), "NF 6207 - PACIENTE - R$ 6.181,00.pdf");
});

test("pasta do mês e caminho no bucket seguem a data da emissão", () => {
  assert.equal(mod.mesDaNota(nota.dataEmissao), "2026-09");
  assert.equal(mod.pastaDaNotaEmitida(nota.dataEmissao), "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS EMITIDAS/2026/09");
  assert.equal(mod.pastaDaNotaEmitida(""), "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS EMITIDAS/sem-data");
  assert.equal(mod.caminhoNoBucketEmitida("bratan-x-unificada-abc", nota.dataEmissao, "pdf"), "emitidas/2026-09/bratan-x-unificada-abc.pdf");
});

test("uma nota cobre a outra: unificada fecha a comanda; parte emitida barra a unificada", () => {
  assert.equal(mod.notaExistenteCobre("UNIFICADA", "TRATAMENTO"), true);
  assert.equal(mod.notaExistenteCobre("UNIFICADA", "CONSULTA"), true);
  assert.equal(mod.notaExistenteCobre("CONSULTA", "UNIFICADA"), true);
  assert.equal(mod.notaExistenteCobre("TRATAMENTO", "TRATAMENTO"), true);
  assert.equal(mod.notaExistenteCobre("CONSULTA", "TRATAMENTO"), false, "consulta e tratamento convivem (plano separado)");
  assert.equal(mod.notaExistenteCobre("BIOIMPEDANCIA", "CONSULTA"), false);
});
