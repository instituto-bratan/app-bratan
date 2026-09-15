import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/financeiro/semanaEmNumeros.ts");

const venda = (id, dia, amount, itemType = "TRATAMENTO", description = "Consulta") => ({ id, saleDate: dia, patientName: "P", items: [{ id: `${id}-1`, itemType, amount, description }], payments: [{ id: `${id}-p`, method: "PIX", amount, installments: 1 }] });
const conta = (id, dueDate, amount, paidAt = null) => ({ id, description: id, supplier: "", amount, dueDate, paidAt, method: "PIX", categoryRef: "cat-x", documentNote: "", isCapex: false, notes: "" });

test("semana: segunda a domingo, parcial até hoje, comparada com os mesmos dias da semana anterior", () => {
  assert.equal(mod.segundaDaSemana("2026-09-16"), "2026-09-14");
  assert.equal(mod.segundaDaSemana("2026-09-20"), "2026-09-14", "domingo ainda é da semana que começou na segunda anterior");
  const s = mod.buildSemanaEmNumeros({
    hoje: "2026-09-16",
    sales: [venda("a", "2026-09-14", 8000), venda("b", "2026-09-16", 4000), venda("c", "2026-09-08", 6000), venda("d", "2026-09-12", 9999, "TRATAMENTO"), venda("e", "2026-09-15", 500, "SINAL", "Sinal")],
    expenses: [conta("luz", "2026-09-10", 300, "2026-09-15T10:00:00Z"), conta("agua", "2026-09-01", 200), conta("net", "2026-09-30", 100)],
    crmTasks: [
      { ownerUserId: "ana", status: "DONE", completedAt: "2026-09-15T13:00:00Z" },
      { ownerUserId: "ana", status: "DONE", completedAt: "2026-09-16T13:00:00Z" },
      { ownerUserId: "bia", status: "DONE", completedAt: "2026-09-09T13:00:00Z" },
      { ownerUserId: "ana", status: "OPEN", completedAt: null },
    ],
    npsRespostas: [{ nota: 10, criadoEm: "2026-09-15T09:00:00Z" }, { nota: 8, criadoEm: "2026-09-15T10:00:00Z" }, { nota: 3, criadoEm: "2026-09-08T10:00:00Z" }],
    nomes: { ana: "Ana", bia: "Bia" },
  });
  assert.equal(s.inicio, "2026-09-14");
  assert.equal(s.fim, "2026-09-20");
  assert.equal(s.parcial, true);
  assert.equal(s.diasContados, 3);
  const n = Object.fromEntries(s.numeros.map((x) => [x.chave, x]));
  assert.equal(n.faturamento.agora, 12500, "8.000 + 4.000 + sinal de 500 entram no faturamento");
  assert.equal(n.faturamento.antes, 6000, "a venda de sábado 12/09 fica fora: só seg–qua da semana anterior");
  assert.equal(n.vendas.agora, 2, "o sinal não conta como venda");
  assert.equal(n.ticket.agora, 6000);
  assert.equal(n["contas-pagas"].agora, 300);
  assert.equal(n.vencidas.valor, "1", "só a água (vencida e aberta); a net vence depois");
  assert.equal(n.toques.agora, 2);
  assert.equal(n.toques.antes, 1);
  assert.equal(n.nps.valor, "9");
  assert.equal(s.ritmo[0].nome, "Ana");
  assert.equal(s.ritmo[0].toques, 2);
  assert.equal(s.ritmo[1].nome, "Bia");
  assert.equal(s.ritmo[1].toquesSemanaAnterior, 1);
  assert.match(s.frase, /Semana de 14\/09 a 20\/09 \(até quarta\)/);
  assert.match(s.frase, /1 conta vencida em aberto/);
});
