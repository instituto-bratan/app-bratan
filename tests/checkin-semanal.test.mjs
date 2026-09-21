// CHECK-IN SEMANAL (21/09/2026).
//
// A régua destes testes é o áudio do Lucas: a semana vai de SEXTA a QUINTA, a
// meta não batida ACUMULA na semana seguinte, e prescrito e pago são coisas
// diferentes. O texto de saída tem que sair igual ao modelo que ele mandou.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/crm/checkinSemanal.ts");

const linha = (paciente, prescrito, pago, novo = false) => ({
  ref: paciente,
  paciente,
  novo,
  prescrito,
  pago,
  origem: "MANUAL",
});

const semana = (linhas, metaBase = 100000, saldoHerdado = 0) => ({
  inicio: "2026-09-18", // sexta
  fim: "2026-09-24",
  linhas,
  metaBase,
  saldoHerdado,
});

test("a semana vai de sexta a quinta — não é a semana do calendário", () => {
  // 18/09/2026 é uma sexta.
  assert.equal(mod.sextaDaSemana("2026-09-18"), "2026-09-18", "sexta abre a semana");
  assert.equal(mod.sextaDaSemana("2026-09-24"), "2026-09-18", "quinta ainda é a mesma semana");
  assert.equal(mod.sextaDaSemana("2026-09-25"), "2026-09-25", "a sexta seguinte já é outra");
  assert.equal(mod.sextaDaSemana("2026-09-20"), "2026-09-18", "domingo fica na semana que começou na sexta");
  assert.equal(mod.quintaDaSemana("2026-09-18"), "2026-09-24");
  assert.equal(mod.proximaSexta("2026-09-18"), "2026-09-25");
  assert.equal(mod.rotuloDaSemana("2026-09-18"), "18/09 a 24/09");
});

test("dentroDaSemana pega os sete dias e só eles", () => {
  assert.equal(mod.dentroDaSemana("2026-09-18", "2026-09-18"), true, "a própria sexta");
  assert.equal(mod.dentroDaSemana("2026-09-24", "2026-09-18"), true, "a quinta que fecha");
  assert.equal(mod.dentroDaSemana("2026-09-25", "2026-09-18"), false, "a sexta seguinte já saiu");
  assert.equal(mod.dentroDaSemana("2026-09-17", "2026-09-18"), false, "a quinta anterior ficou para trás");
});

test("a meta não batida acumula — o exemplo do Lucas, 100 vira 130", () => {
  // "a meta era 100 mil, a gente faz 70 mil, os 30 mil vão acumular"
  const r = mod.resumoDoCheckin(semana([linha("Ana", 100000, 70000)], 100000, 0));
  assert.equal(r.meta, 100000);
  assert.equal(r.faturamento, 70000);
  assert.equal(r.faltou, 30000);
  assert.equal(r.metaDaProxima, 130000, "a próxima é a base mais o que faltou");
});

test("bateu a meta: nada acumula — e passar da meta NÃO vira crédito", () => {
  const bateu = mod.resumoDoCheckin(semana([linha("Ana", 100000, 100000)], 100000, 0));
  assert.equal(bateu.faltou, 0);
  assert.equal(bateu.metaDaProxima, 100000);

  const passou = mod.resumoDoCheckin(semana([linha("Ana", 100000, 140000)], 100000, 0));
  assert.equal(passou.faltou, 0);
  assert.equal(passou.metaDaProxima, 100000, "sobrar não afrouxa a régua da semana seguinte");
});

test("o saldo herdado entra na meta da semana, e o que faltar volta a acumular", () => {
  // Semana anterior deixou 30 mil. Base 100 mil → meta 130 mil. Fez 90 mil.
  const r = mod.resumoDoCheckin(semana([linha("Ana", 130000, 90000)], 100000, 30000));
  assert.equal(r.meta, 130000, "a régua real da semana");
  assert.equal(r.faltou, 40000);
  assert.equal(r.metaDaProxima, 140000, "base 100 mil + 40 mil que faltaram");
  assert.equal(mod.saldoParaProximaSemana(semana([linha("Ana", 130000, 90000)], 100000, 30000)), 40000);
});

test("prescrito e pago são coisas diferentes, e a conversão é a divisão dos dois", () => {
  const r = mod.resumoDoCheckin(semana([linha("Ana", 10000, 10000), linha("Bia", 10000, 5000), linha("Cida", 5000, 0)]));
  assert.equal(r.prescrito, 25000);
  assert.equal(r.realizado, 15000);
  assert.equal(Math.round(r.conversao * 1000) / 1000, 0.6, "15.000 ÷ 25.000");
});

test("quem pagou sem ter prescrição entra no faturamento, mas não infla a conversão", () => {
  const r = mod.resumoDoCheckin(semana([linha("Ana", 10000, 8000), linha("Avulso", 0, 2000)]));
  assert.equal(r.faturamento, 10000, "dinheiro que entrou é dinheiro que entrou");
  assert.equal(r.realizado, 8000, "o par honesto do prescrito");
  assert.equal(r.conversao, 0.8, "não é 100% só porque alguém pagou sem proposta");
});

test("sem nenhuma prescrição, a conversão é vazia — não é zero nem infinito", () => {
  const r = mod.resumoDoCheckin(semana([linha("Ana", 0, 3000)]));
  assert.equal(r.conversao, null);
  assert.match(mod.textoDoCheckin(semana([linha("Ana", 0, 3000)])), /Convers[ãa]o.*—/);
});

test("o ticket médio divide por quem PAGOU, não por quem passou", () => {
  const r = mod.resumoDoCheckin(semana([linha("Ana", 5000, 5000), linha("Bia", 5000, 0)]));
  assert.equal(r.pacientesTotais, 2, "as duas passaram");
  assert.equal(r.ticketMedio, 5000, "quem não pagou não é ticket zero");
});

test("pacientes novos são contados à parte dos totais", () => {
  const r = mod.resumoDoCheckin(semana([linha("Ana", 0, 100, true), linha("Bia", 0, 100), linha("Cida", 0, 100, true)]));
  assert.equal(r.pacientesTotais, 3);
  assert.equal(r.pacientesNovos, 2);
});

test("o texto sai no formato exato que o Lucas mandou", () => {
  const texto = mod.textoDoCheckin(semana([linha("Ana", 10000, 7000, true), linha("Bia", 10000, 3000)], 100000, 0));
  const linhas = texto.split("\n");
  assert.equal(linhas[0], "📊 *CHECK-IN SEMANAL*");
  assert.equal(linhas[1], "*Semana:* 18/09 a 24/09");
  assert.equal(linhas[3], "👥 *Pacientes totais:* 2");
  assert.equal(linhas[4], "🆕 *Pacientes novos:* 1");
  assert.equal(linhas[6], "💰 *Faturamento da semana:* R$ 10.000,00");
  assert.equal(linhas[7], "🎯 *Ticket médio:* R$ 5.000,00");
  assert.equal(linhas[9], "📋 *Orçamento prescrito:* R$ 20.000,00");
  assert.equal(linhas[10], "✅ *Orçamento realizado:* R$ 10.000,00");
  assert.equal(linhas[11], "📈 *Conversão (realizado ÷ prescrito):* 50,0%");
  assert.equal(linhas[13], "🚀 *Meta de faturamento da próxima semana:* R$ 190.000,00");
});

test("as linhas nascem das comandas da semana, somando quem veio duas vezes", () => {
  const linhas = mod.linhasDasComandas({
    sextaISO: "2026-09-18",
    comandas: [
      { clientRef: "s1", saleDate: "2026-09-18", crmContactRef: "c-ana", patientName: "Ana", total: 1000 },
      { clientRef: "s2", saleDate: "2026-09-22", crmContactRef: "c-ana", patientName: "Ana", total: 500 },
      { clientRef: "s3", saleDate: "2026-09-24", crmContactRef: "c-bia", patientName: "Bia", total: 2000 },
      { clientRef: "s4", saleDate: "2026-09-25", crmContactRef: "c-zé", patientName: "Zé", total: 9000 },
      { clientRef: "s5", saleDate: "2026-09-17", crmContactRef: "c-ot", patientName: "Otto", total: 9000 },
    ],
    primeiraCompraPorPaciente: { "c-ana": "2026-01-10", "c-bia": "2026-09-24" },
    jaDigitadas: [],
  });
  assert.equal(linhas.map((l) => l.paciente).join(" · "), "Ana · Bia", "Zé (sexta seguinte) e Otto (quinta anterior) ficam de fora");
  assert.equal(linhas[0].pago, 1500, "duas comandas da Ana somam");
  assert.equal(linhas[0].novo, false, "Ana já comprava desde janeiro");
  assert.equal(linhas[1].novo, true, "a primeira compra da Bia foi nesta semana");
  assert.equal(linhas[0].prescrito, 0, "o prescrito não existe no sistema — é o Estevão que digita");
});

test("o que o Estevão corrigiu à mão manda sobre o que o app deduziu", () => {
  const linhas = mod.linhasDasComandas({
    sextaISO: "2026-09-18",
    comandas: [{ clientRef: "s1", saleDate: "2026-09-18", crmContactRef: "c-ana", patientName: "Ana", total: 1000 }],
    primeiraCompraPorPaciente: {},
    jaDigitadas: [{ ref: "c-ana", paciente: "Ana", novo: true, prescrito: 8000, pago: 1200, origem: "MANUAL" }],
  });
  assert.equal(linhas[0].prescrito, 8000);
  assert.equal(linhas[0].pago, 1200, "ele corrigiu o valor; a comanda não sobrescreve");
  assert.equal(linhas[0].novo, true);
});

test("semana AINDA ABERTA não acumula: só o que sobrar na quinta é que empurra", () => {
  // Segunda-feira 21/09, semana 18–24/09. Faturou 0 de uma meta de 100 mil.
  const aberta = { ...semana([linha("Ana", 0, 0)], 100000, 0), hojeISO: "2026-09-21" };
  const r = mod.resumoDoCheckin(aberta);
  assert.equal(r.encerrada, false);
  assert.equal(r.faltou, 100000, "o quanto falta continua sendo verdade");
  assert.equal(r.metaDaProxima, 100000, "mas a próxima NÃO dobra com a semana em andamento");
  assert.equal(mod.saldoParaProximaSemana(aberta), 0, "semana aberta não empurra saldo");
});

test("na sexta seguinte a semana está fechada e aí sim acumula", () => {
  const fechada = { ...semana([linha("Ana", 0, 70000)], 100000, 0), hojeISO: "2026-09-25" };
  const r = mod.resumoDoCheckin(fechada);
  assert.equal(r.encerrada, true);
  assert.equal(r.metaDaProxima, 130000, "o exemplo do Lucas, agora no momento certo");
  assert.equal(mod.saldoParaProximaSemana(fechada), 30000);
});

test("a própria quinta ainda é semana aberta — fecha na quinta à noite", () => {
  const naQuinta = { ...semana([linha("Ana", 0, 0)], 100000, 0), hojeISO: "2026-09-24" };
  assert.equal(mod.resumoDoCheckin(naQuinta).encerrada, false, "ainda dá tempo de fechar venda na quinta");
});

test("sem hojeISO o comportamento antigo continua (semana tratada como fechada)", () => {
  assert.equal(mod.resumoDoCheckin(semana([linha("Ana", 100000, 70000)], 100000, 0)).metaDaProxima, 130000);
});
