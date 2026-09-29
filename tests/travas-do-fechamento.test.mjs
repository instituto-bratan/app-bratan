// AS TRAVAS DO FECHAMENTO (29/09/2026): sinal nunca emite nota, "fechou" sem
// comanda vira Lembrete obrigatório, e CPF + e-mail são obrigatórios quando
// vai existir nota.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const travas = await loadTs("src/features/crm/travasDoFechamento.ts");
const nota = await loadTs("src/features/financeiro/notaNaComandaDoDia.ts");
const fin = await loadTs("src/features/financeiro/financeiroData.ts");

// CPF de teste com dígitos verificadores válidos (gerado para o teste, não é de ninguém).
const CPF_TESTE = "529.982.247-25";

test("sinal lançado como CONSULTA 'Sinal de consulta' é sinal (o caso que emitia nota desde 21/09)", () => {
  const sinalNovo = [{ itemType: "CONSULTA", amount: 500, description: "Sinal de consulta" }];
  assert.equal(nota.ehSoSinal(sinalNovo), true);
  assert.equal(nota.quandoPadrao(sinalNovo), "COM_A_CONSULTA");
  assert.equal(fin.saleInvoiceBreakdown({ items: sinalNovo }).onlySinal, true);
  const sinal200 = [{ itemType: "CONSULTA", amount: 200, description: "Sinal de consulta (R$ 200)" }];
  assert.equal(nota.ehSoSinal(sinal200), true);
});

test("consulta de verdade continua emitindo agora", () => {
  const consulta = [{ itemType: "CONSULTA", amount: 1100, description: "Consulta Diamond — Pix" }];
  assert.equal(nota.ehSoSinal(consulta), false);
  assert.equal(nota.quandoPadrao(consulta), "AGORA");
});

test("comanda só de sinal não entra na fila de notas", () => {
  const venda = { id: "s1", saleDate: "2026-09-22", items: [{ itemType: "CONSULTA", amount: 500, description: "Sinal de consulta" }] };
  assert.equal(fin.salesPendingInvoice([venda], [], "2026-09").length, 0);
});

test("fechou e não pagou tudo: sem Lembrete o fechamento não salva", () => {
  const base = { resultado: "PROGRAMA_ACOMPANHAMENTO", vendido: 8696, recebido: 0, hojeISO: "2026-09-29" };
  assert.match(travas.travaDoAReceber({ ...base, aReceberValor: 0, aReceberData: "" }), /Faltam R\$ 8\.696,00/);
  assert.match(travas.travaDoAReceber({ ...base, aReceberValor: 8696, aReceberData: "" }), /data/);
  assert.match(travas.travaDoAReceber({ ...base, aReceberValor: 8696, aReceberData: "2026-09-20" }), /já passou/);
  assert.equal(travas.travaDoAReceber({ ...base, aReceberValor: 8696, aReceberData: "2026-10-05" }), null);
  // Parte paga agora, resto depois.
  assert.equal(travas.travaDoAReceber({ ...base, recebido: 3800, aReceberValor: 4896, aReceberData: "2026-10-26" }), null);
  // Recebido + a receber não cobre o vendido: desconto tem que mudar o vendido.
  assert.match(travas.travaDoAReceber({ ...base, recebido: 3800, aReceberValor: 3000, aReceberData: "2026-10-26" }), /desconto/);
});

test("pagou tudo, ou não fechou: nada a cobrar", () => {
  assert.equal(travas.fechamentoTemSaldo({ resultado: "PROGRAMA_ACOMPANHAMENTO", vendido: 5000, recebido: 5000 }), false);
  assert.equal(travas.fechamentoTemSaldo({ resultado: "NAO_FECHOU", vendido: 0, recebido: 0 }), false);
  assert.equal(travas.aReceberSugerido(10926, 0), 10926);
});

test("dados da nota: CPF e e-mail obrigatórios quando vai ter nota", () => {
  const vai = travas.fechamentoVaiTerNota({ resultado: "CLUBE_BRATAN", recebido: 0, ehSinal: false, semNota: false });
  assert.equal(vai, true);
  assert.match(travas.travaDosDadosDaNota({ vaiTerNota: vai, temCpfNaFicha: false, cpfDigitado: "", email: "" }), /CPF e e-mail/);
  assert.match(travas.travaDosDadosDaNota({ vaiTerNota: vai, temCpfNaFicha: false, cpfDigitado: "111.111.111-11", email: "a@b.com" }), /não confere/);
  assert.equal(travas.travaDosDadosDaNota({ vaiTerNota: vai, temCpfNaFicha: false, cpfDigitado: CPF_TESTE, email: "paciente@exemplo.com" }), null);
  assert.equal(travas.travaDosDadosDaNota({ vaiTerNota: vai, temCpfNaFicha: true, cpfDigitado: "", email: "paciente@exemplo.com" }), null);
  assert.match(travas.travaDosDadosDaNota({ vaiTerNota: vai, temCpfNaFicha: true, cpfDigitado: "", email: "sem-arroba" }), /e-mail/);
});

test("sem nota: sinal, 'não emitir agora' e não fechou sem dinheiro não cobram CPF", () => {
  assert.equal(travas.fechamentoVaiTerNota({ resultado: "PROGRAMA_ACOMPANHAMENTO", recebido: 500, ehSinal: true, semNota: false }), false);
  assert.equal(travas.fechamentoVaiTerNota({ resultado: "PROGRAMA_ACOMPANHAMENTO", recebido: 500, ehSinal: false, semNota: true }), false);
  assert.equal(travas.fechamentoVaiTerNota({ resultado: "NAO_FECHOU", recebido: 0, ehSinal: false, semNota: false }), false);
  assert.equal(travas.fechamentoVaiTerNota({ resultado: "NAO_FECHOU", recebido: 1100, ehSinal: false, semNota: false }), true);
});
