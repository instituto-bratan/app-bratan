// O LOTE DE NOTAS (22/09/2026): texto igual ao do fechamento, partes que fecham, linhas do controle.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/financeiro/loteDeNotas.ts");
const controle = await loadTs("supabase/functions/_shared/controleDeImpostos.ts");
const base = { id: "i1", lote: "2026-09", ordem: 3, saleRef: "fsale-simone", contactRef: null, tomadorNome: "SIMONE APARECIDA PAULO DE LIMA", tipo: "UNIFICADA", valor: 6396, dia: "2026-09-15", pagamentoTexto: "CARTÃO DE CRÉDITO EM 6 VEZES", observacao: "", status: "PENDENTE", ref: null, numero: null, erro: null, emitidaEm: null,
  partes: [{ saleRef: "fsale-simone", invoiceType: "TRATAMENTO", amount: 2832, patientName: "SIMONE APARECIDA PAULO DE LIMA", comandaDate: "2026-09-15" }, { saleRef: "fsale-murilo", invoiceType: "TRATAMENTO", amount: 3564, patientName: "MURILO DE PAULA", comandaDate: "2026-09-15" }] };

test("a unificada é tratamento e o texto é o do fechamento, com dia e pagamento", () => {
  assert.equal(mod.naturezaDoItem("UNIFICADA"), "TRATAMENTO");
  assert.equal(mod.naturezaDoItem("CONSULTA"), "CONSULTA");
  const d = mod.discriminacaoDoItem(base);
  assert.match(d, /PROCEDIMENTOS MÉDICOS PERMITIDOS EM CONSULTÓRIO, PAGOS NO DIA 15\.09\.2026/);
  assert.match(d, /FORAM PAGOS EM CARTÃO DE CRÉDITO EM 6 VEZES/);
  assert.match(mod.discriminacaoDoItem({ tipo: "CONSULTA", dia: "2026-09-09", pagamentoTexto: "PIX" }), /CONSULTA MÉDICA REALIZADA NO DIA 09\/09\/2026/);
});

test("mãe + filho: uma nota, duas linhas no controle, o mesmo número, e as partes fecham (agora no servidor, 29/09)", () => {
  assert.equal(mod.partesFecham(base), true);
  assert.equal(mod.partesFecham({ ...base, valor: 6000 }), false);
  const linhas = controle.linhasDoControle({ numero: "6210", tipo: "UNIFICADA", valor: 6396, saleRef: "fsale-simone", pacienteNome: base.tomadorNome, comandaDate: "2026-09-15", diaEmissao: "2026-09-23", partesDoLote: base.partes, lote: "2026-09" });
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].invoice_number, "6210");
  assert.equal(linhas[0].client_ref, "finv-nf-6210-1");
  assert.equal(linhas[1].sale_ref, "fsale-murilo");
  assert.equal(linhas[0].amount + linhas[1].amount, 6396);
  assert.match(linhas[1].notes, /cobrindo 2 comandas/);
  const simples = controle.linhasDoControle({ numero: "6211", tipo: "UNIFICADA", valor: 2750, saleRef: "fsale-x", pacienteNome: "Simone Basilio", comandaDate: "2026-09-24", diaEmissao: "2026-09-24", partesDoLote: null, lote: null });
  assert.equal(simples.length, 1);
  assert.equal(simples[0].client_ref, "finv-nf-6211");
  assert.equal(simples[0].amount, 2750);
  assert.equal(simples[0].invoice_type, "TRATAMENTO");
  assert.equal(controle.classeDaNota("CONSULTA"), "CONSULTA");
  assert.equal(controle.diaDaEmissao("2026-09-29T23:34:40-03:00", "2026-09-30T02:34:40Z"), "2026-09-29");
  assert.equal(controle.diaDaEmissao("", "2026-09-30T02:34:40Z"), "2026-09-29");
});

test("o resumo conta em frase", () => {
  const r = mod.resumoDoLote([base, { ...base, id: "i2", status: "AUTORIZADA", valor: 1000 }, { ...base, id: "i3", status: "RETIRADA" }]);
  assert.equal(r.pendentes, 1);
  assert.match(r.frase, /1 para emitir \(R\$\s6\.396\)/);
  assert.match(r.frase, /1 autorizadas \(R\$\s1\.000\)/);
  assert.match(r.frase, /1 retiradas/);
});
