// O PACOTE DO MÊS PARA A CONTABILIDADE (22/09/2026).
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/financeiro/notasRecebidasExport.ts");
const nota = (chave, dia, valor, status = "NOVA", extra = {}) => ({ chave, tipo: "NFE", numero: null, emitenteDocumento: "1", emitenteNome: "STIN PHARMA", valor, emitidaEm: dia, situacao: "autorizada", manifestacao: null, status, expenseRef: null, storagePathPdf: null, storagePathXml: null, urlExterna: null, xmlCompleto: false, sharepointEnviadoEm: null, vinculoMotivo: "", atualizadoEm: "", ...extra });

test("o mês separa pela data de emissão e ordena da mais antiga", () => {
  const lista = mod.notasDoMes([nota("b", "2026-09-18", 10), nota("a", "2026-09-02", 5), nota("c", "2026-08-30", 7)], "2026-09");
  assert.equal(lista.map((n) => n.chave).join(), "a,b");
});

test("o resumo conta o que interessa ao contador e deixa canceladas/ignoradas de fora", () => {
  const r = mod.resumoDoMes([
    nota("a", "2026-09-02", 100, "VINCULADA", { storagePathPdf: "x.pdf" }),
    nota("b", "2026-09-03", 50),
    nota("c", "2026-09-04", 999, "CANCELADA"),
    nota("d", "2026-09-05", 20, "NOVA", { urlExterna: "https://nfe.prefeitura.sp.gov.br/x" }),
  ]);
  assert.equal(r.quantidade, 3);
  assert.equal(r.total, 170);
  assert.equal(r.comArquivo, 2, "PDF no bucket ou link da prefeitura contam como arquivo");
  assert.equal(r.semArquivo, 1);
  assert.equal(r.ligadas, 1);
});

test("o índice em Excel tem uma linha por nota, com a conta ligada e o arquivo", () => {
  const aba = mod.abaIndice([nota("35260938115624000127550010000123451000012345", "2026-09-09", 2291.7, "VINCULADA", { storagePathPdf: "p.pdf", expenseRef: "c1" })], "2026-09", [{ id: "c1", description: "STIN PHARMA — boleto de 10/09" }]);
  assert.equal(aba.rows.length, 1);
  assert.equal(aba.rows[0][2], "12345");
  assert.equal(aba.rows[0][7], "STIN PHARMA — boleto de 10/09");
  assert.match(String(aba.rows[0][8]), /^NF 12345 - STIN PHARMA - R\$ 2\.291,70\.pdf$/);
  assert.match(aba.title, /09\/2026/);
});
