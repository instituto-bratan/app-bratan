// O TOTAL DO MÊS E A PLANILHA DO CONTADOR DÃO O MESMO NÚMERO (07/10/2026).
// Antes a tela de Impostos & NFs mostrava "Imposto mensal R$ 11.278,87" logo
// abaixo da planilha do contador que somava R$ 11.278,93: o total do mês
// arredondava só no fim, a planilha arredonda cada tributo de cada nota.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const fin = loadTs("src/features/financeiro/financeiroData.ts");
const exp = loadTs("src/features/financeiro/exportContabilidade.ts");

const nota = (n, tipo, valor, comanda = "2026-09-10") => ({ id: `n${n}`, invoiceType: tipo, invoiceNumber: String(n), issueDate: "2026-10-07", comandaDate: comanda, patientName: "P", amount: valor, notes: "", createdAt: "" });

test("meio centavo sobe (o contador arredonda assim) e o ponto flutuante não derruba", () => {
  assert.equal(fin.centavoFiscal(618.675), 618.68);
  assert.equal(fin.centavoFiscal(5.5575), 5.56);
  assert.equal(fin.centavoFiscal(-5.5575), -5.56);
  const n = fin.impostosDaNota("CONSULTA", 10950);
  assert.equal(n.mensal, 618.68);
  assert.equal(n.trimestral, 840.96);
});

test("o total do mês é a soma dos tributos arredondados nota a nota — igual à planilha do contador", () => {
  const notas = [nota(1, "TRATAMENTO", 1174.5), nota(2, "TRATAMENTO", 855), nota(3, "TRATAMENTO", 2831.9), nota(4, "CONSULTA", 1000), nota(5, "CONSULTA", 7550), nota(6, "BIOIMPEDANCIA", 300)];
  const t = fin.monthInvoiceTotals(notas, "2026-09");
  for (const [classe, chave] of [["CONSULTA", "CONSULTA"], ["PROCEDIMENTO", "PROCEDIMENTO"]]) {
    const aba = plain(exp.abaControleImpostos(notas, classe, "2026-09"));
    const total = aba.totalRow;
    const mensalPlanilha = Math.round((total[4] + total[5] + total[6]) * 100) / 100;
    const trimestralPlanilha = Math.round((total[7] + total[8]) * 100) / 100;
    assert.equal(t.byClass[chave].mensal, mensalPlanilha, `mensal ${classe}`);
    assert.equal(t.byClass[chave].trimestral, trimestralPlanilha, `trimestral ${classe}`);
  }
});
