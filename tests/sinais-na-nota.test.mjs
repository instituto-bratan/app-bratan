// O SINAL ENTRA SOMADO NA NOTA DA CONSULTA (29/09/2026).
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/financeiro/sinaisDoPaciente.ts");
const venda = (id, dia, itens, ref = "c-lais") => ({ id, saleDate: dia, crmContactRef: ref, patientName: "Lais", items: itens, payments: [] });
const sinal = (valor) => [{ itemType: "CONSULTA", amount: valor, description: "Sinal de consulta" }];

test("o sinal sem nota aparece; o que já entrou em nota não", () => {
  const sales = [venda("s1", "2026-09-16", sinal(500)), venda("s2", "2026-09-10", sinal(200)), venda("c1", "2026-09-23", [{ itemType: "TRATAMENTO", amount: 10926, description: "" }])];
  const invoices = [{ id: "i1", saleRef: "s2", invoiceType: "CONSULTA", invoiceNumber: "6100", amount: 200 }];
  const abertos = mod.sinaisEmAberto({ sales, invoices, contactRef: "c-lais", excetoSaleRef: "c1" });
  assert.equal(JSON.stringify(abertos), JSON.stringify([{ saleRef: "s1", dia: "2026-09-16", valor: 500 }]));
  assert.equal(mod.somaDosSinais(abertos), 500);
  assert.match(mod.fraseDosSinais(abertos), /R\$\s500,00 de sinal em 16\/09/);
});

test("sinal de outro paciente não entra", () => {
  const sales = [venda("s1", "2026-09-16", sinal(500), "c-outra")];
  assert.equal(mod.sinaisEmAberto({ sales, invoices: [], contactRef: "c-lais" }).length, 0);
});

test("a nota de consulta leva o sinal; sem consulta, a primeira", () => {
  assert.equal(mod.naturezaQueLevaOSinal(["BIOIMPEDANCIA", "CONSULTA", "TRATAMENTO"]), "CONSULTA");
  assert.equal(mod.naturezaQueLevaOSinal(["TRATAMENTO"]), "TRATAMENTO");
  assert.equal(mod.naturezaQueLevaOSinal([]), null);
});
