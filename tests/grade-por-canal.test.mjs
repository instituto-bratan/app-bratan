// A GRADE DE CADA CANAL (17/09/2026).
//
// Pedido do Lucas: "todos aqui estão com seis checkpoints, seis bioimpedâncias,
// três consultas, mas não são todos que fecharam o plano de acompanhamento.
// Quem fechou o clube só tem duas bioimpedâncias e duas consultas. E só
// tratamento não tem nada disso."
//
// O que estes testes protegem: que a grade continue vindo do CANAL, e não de
// um número fixo — no quadro da enfermagem e no portal do paciente, que é onde
// a promessa errada dói mais.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const programa = await loadTs("src/features/programa/programaData.ts");
const portal = await loadTs("src/features/portal/portalPaciente.ts");

const HOJE = "2026-09-17";
const deal = (canal) => ({
  id: "d1",
  contactId: "c1",
  closedAt: "2026-03-01T12:00:00.000Z",
  updatedAt: "2026-03-01T12:00:00.000Z",
  createdAt: "2026-03-01T12:00:00.000Z",
  programMilestonesDone: [],
  adhesionChannel: canal,
});

const conta = (marcos, tipo) => marcos.filter((m) => m.type === tipo).length;

test("Programa de Acompanhamento: 6 checkpoints, 6 bioimpedâncias, 3 consultas", () => {
  const marcos = programa.buildMilestones(deal("PROGRAMA_ACOMPANHAMENTO"), HOJE);
  assert.equal(conta(marcos, "CHECK"), 6);
  assert.equal(conta(marcos, "BIO"), 6);
  assert.equal(conta(marcos, "MEDICO"), 3);
  assert.equal(marcos.length, 15);
});

test("Clube Bratan: duas bioimpedâncias, duas consultas, nenhum checkpoint", () => {
  const marcos = programa.buildMilestones(deal("CLUBE_BRATAN"), HOJE);
  assert.equal(conta(marcos, "CHECK"), 0, "checkpoint é do Programa");
  assert.equal(conta(marcos, "BIO"), 2);
  assert.equal(conta(marcos, "MEDICO"), 2);
  assert.equal(marcos.length, 4);
  // O rótulo é ORDINAL de propósito: "Bioimpedância 1/2" era lido como
  // "1 de 2 feitas" (Lucas, 17/09). "1ª bioimpedância" não tem essa leitura.
  assert.equal(marcos.find((m) => m.type === "BIO").label, "1ª bioimpedância");
});

test("o ordinal concorda com a palavra: 3ª bioimpedância, mas 3º checkpoint", () => {
  const marcos = programa.buildMilestones(deal("PROGRAMA_ACOMPANHAMENTO"), HOJE);
  assert.equal(marcos.find((m) => m.type === "BIO" && m.n === 3).label, "3ª bioimpedância");
  assert.equal(marcos.find((m) => m.type === "CHECK" && m.n === 3).label, "3º checkpoint performance");
});

test("Só tratamento: nenhum marco — não deve nada a ninguém", () => {
  const marcos = programa.buildMilestones(deal("SOMENTE_TRATAMENTO"), HOJE);
  assert.equal(marcos.length, 0);
});

test("sem canal registrado continua com a grade do Programa, para ninguém sumir do quadro", () => {
  assert.equal(programa.buildMilestones(deal(null), HOJE).length, 15);
  assert.equal(programa.buildMilestones(deal(undefined), HOJE).length, 15);
});

test("as datas do Programa não mudaram: bio todo mês, consulta a cada dois", () => {
  const marcos = programa.buildMilestones(deal("PROGRAMA_ACOMPANHAMENTO"), HOJE);
  const bio = marcos.filter((m) => m.type === "BIO").sort((a, b) => a.n - b.n);
  assert.deepEqual(bio.map((m) => m.expectedDate).join(","), "2026-04-01,2026-05-01,2026-06-01,2026-07-01,2026-08-01,2026-09-01");
  const medico = marcos.filter((m) => m.type === "MEDICO").sort((a, b) => a.n - b.n);
  assert.deepEqual(medico.map((m) => m.expectedDate).join(","), "2026-05-01,2026-07-01,2026-09-01");
});

test("no Clube, a primeira consulta é NO DIA do fechamento e a outra dois meses depois", () => {
  // Regra do Lucas (17/09): "o clube é uma consulta no dia, no fechamento, e a
  // outra depois de dois meses". A adesão do deal de teste é 01/03/2026.
  const marcos = programa.buildMilestones(deal("CLUBE_BRATAN"), HOJE);
  const consultas = marcos.filter((m) => m.type === "MEDICO").sort((a, b) => a.n - b.n);
  assert.deepEqual(consultas.map((m) => m.expectedDate).join(","), "2026-03-01,2026-05-01");
  assert.match(consultas[0].label, /no fechamento/, "mês 0 lê como 'no fechamento', não '(mês 0)'");
  assert.match(consultas[1].label, /mês 2/);

  const bio = marcos.filter((m) => m.type === "BIO").sort((a, b) => a.n - b.n);
  assert.deepEqual(bio.map((m) => m.expectedDate).join(","), "2026-03-01,2026-05-01", "as bios acompanham as consultas");
});

test("a última consulta do Clube é chamada de última — não de terceira", () => {
  const marcos = programa.buildMilestones(deal("CLUBE_BRATAN"), HOJE);
  const consultas = marcos.filter((m) => m.type === "MEDICO").sort((a, b) => a.n - b.n);
  assert.match(consultas[1].label, /última consulta/);
  assert.ok(!consultas[0].label.includes("última"));
});

test("o portal do paciente não mostra trilha para quem só comprou tratamento", () => {
  const semMarcos = portal.trilhaDoPlano([], "2026-03-01", HOJE);
  assert.equal(semMarcos, null, "sem marcos, a seção inteira some — em vez de mostrar trilha vazia");
});

test("o portal do Clube fala da janela dele — dois meses, quatro passos — e não de 15", () => {
  const marcos = programa.buildMilestones(deal("CLUBE_BRATAN"), HOJE).map((m) => ({
    key: m.key, type: m.type, n: m.n, total: m.total, label: m.label,
    expectedDate: m.expectedDate, done: m.done, overdue: m.overdue,
  }));
  const trilha = portal.trilhaDoPlano(marcos, "2026-03-01", HOJE);
  assert.equal(trilha.total, 4, "quatro passos, não quinze");
  assert.equal(trilha.meses, 2, "a janela do Clube é de dois meses, não seis");
  assert.equal(trilha.passos.length, 2);
  assert.equal(trilha.passos[0].marcos.length, 2, "o que cai no fechamento aparece no mês 1");
});
