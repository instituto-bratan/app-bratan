// Dinheiro da comanda vai para o Crediário (29/09/2026).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const r = await loadTs("src/features/financeiro/dinheiroDaComanda.ts");

test("tudo em dinheiro: nada fica na comanda, tudo vai para o Crediário", () => {
  const d = r.separarDinheiro([{ itemType: "TRATAMENTO", amount: 5500, description: "Tirzepatida" }], [{ method: "DINHEIRO", amount: 5500 }]);
  assert.equal(d.dinheiro, 5500);
  assert.equal(d.resto, 0);
  assert.equal(d.soDinheiro, true);
  assert.equal(d.itensDaComanda.length, 0);
  assert.equal(d.pagamentosDaComanda.length, 0);
  assert.equal(d.resumoDosItens, "Tirzepatida");
});

test("parte em dinheiro: os itens são repartidos no que sobra, sem o pagamento em dinheiro", () => {
  const d = r.separarDinheiro(
    [{ itemType: "CONSULTA", amount: 1500, description: "Consulta" }, { itemType: "TRATAMENTO", amount: 4500, description: "Blend" }],
    [{ method: "DINHEIRO", amount: 2000 }, { method: "PIX", amount: 4000 }],
  );
  assert.equal(d.dinheiro, 2000);
  assert.equal(d.resto, 4000);
  assert.equal(d.soDinheiro, false);
  assert.deepEqual(plain(d.itensDaComanda.map((i) => i.amount)), [1000, 3000]);
  assert.deepEqual(plain(d.pagamentosDaComanda.map((p) => p.method)), ["PIX"]);
});

test("sem dinheiro: comanda igual", () => {
  const d = r.separarDinheiro([{ itemType: "CONSULTA", amount: 1100, description: "" }], [{ method: "CARTAO_CREDITO", amount: 1100 }]);
  assert.equal(d.dinheiro, 0);
  assert.deepEqual(plain(d.itensDaComanda.map((i) => i.amount)), [1100]);
});

test("a chave fica presa à comanda (editar regrava, não duplica)", () => {
  assert.equal(r.chaveDoCrediario("fsale-abc"), "fcash-abc");
  assert.equal(r.chaveDoCrediario("fsale-abc"), r.chaveDoCrediario("fsale-abc"));
});

test("a lista do dia mostra o dinheiro solto e acha o nome do paciente", () => {
  const e = [
    { id: "fcash-1", dia: "2026-09-29", valor: 100, descricao: "Comanda — Ana (dinheiro)", contactRef: null, saleRef: "fsale-1" },
    { id: "fcash-2", dia: "2026-09-29", valor: 200, descricao: "Fechamento — Beto Silva (dinheiro)", contactRef: "c", saleRef: null },
  ];
  assert.deepEqual(plain(r.dinheiroSemComanda(e, ["fsale-1"]).map((x) => x.id)), ["fcash-2"]);
  assert.equal(r.pacienteDaDescricao("Fechamento — Beto Silva (dinheiro)"), "Beto Silva");
  assert.match(r.fraseDoDinheiro(200, (n) => `R$ ${n}`), /fora do faturamento/);
});

test("Lançar Dia e Kanban gravam o dinheiro pela função do banco (a recepção não escreve no caixa direto)", () => {
  const lancar = fs.readFileSync(new URL("../src/features/financeiro/FinanceiroLancarDiaPage.tsx", import.meta.url), "utf8");
  const kanban = fs.readFileSync(new URL("../src/features/crm/CrmKanbanPage.tsx", import.meta.url), "utf8");
  assert.match(lancar, /items: divisao\.itensDaComanda/);
  assert.match(lancar, /payments: divisao\.pagamentosDaComanda/);
  assert.match(lancar, /gravarRemoteDinheiroDaComanda/);
  assert.match(kanban, /gravarRemoteDinheiroDaComanda/);
  const sql = fs.readFileSync(new URL("../supabase/migrations/202609290011_dinheiro_da_comanda.sql", import.meta.url), "utf8");
  assert.match(sql, /'ENTRADA'/);
  assert.doesNotMatch(sql, /'SAIDA'/, "a função nunca grava saída");
});
