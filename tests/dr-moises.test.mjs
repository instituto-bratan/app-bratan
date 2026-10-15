// DR. MOISÉS NO INSTITUTO (15/10/2026). Lucas: "diferenciar o dinheiro que está
// entrando do Dr. Daniel e o dinheiro que está entrando do Dr. Moisés... o doutor
// Moisés vai receber 20% desse lucro bruto e a clínica vai ficar com 80%... a
// primeira parcela vai ser paga no dia 20 do mês seguinte" (três parcelas).
// Os valores vêm da aba "Precificação Dr. Moisés" com a hora de sala, a NF e a
// comissão de hoje: sala de 15/09 (R$ 113,78/h), NF de 15/09 (26% avaliação,
// 11,48% procedimento) e comissão de 13% — a mesma do Dr. Daniel desde 01/10/2026.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const cat = loadTs("src/features/financeiro/catalogoPrecificacao.ts");
const motor = loadTs("src/features/financeiro/motorLucroInteligente.ts");
const lucro = loadTs("src/features/financeiro/lucroInteligente.ts");
const fin = loadTs("src/features/financeiro/financeiroData.ts");
const prof = loadTs("src/features/financeiro/profissionais.ts");

const plano = { itemType: "CONSULTA", amount: 6997, description: "Plano de Acompanhamento · 6 meses" };
const botox = { itemType: "TRATAMENTO", amount: 2500, description: "Toxina botulínica facial — Botox 100U", profissional: "moises" };

function venda(id, dia, itens, metodo = "PIX") {
  const total = itens.reduce((soma, item) => soma + item.amount, 0);
  return {
    id,
    saleDate: dia,
    patientName: "PACIENTE DE TESTE",
    crmContactRef: "",
    notes: "",
    createdAt: `${dia}T12:00:00Z`,
    items: itens.map((item, indice) => ({ id: `${id}-i${indice}`, ...item })),
    payments: [{ id: `${id}-p`, method: metodo, amount: total, installments: 1 }],
  };
}
const outubro = [venda("fsale-out-1", "2026-10-15", [plano, botox])];
const json = (valor) => JSON.parse(JSON.stringify(valor));

test("os 26 procedimentos do Dr. Moisés: preço cheio reproduz a coluna P e 20% dela é a coluna Q", () => {
  const dele = cat.CATALOGO_PRECIFICACAO.filter((produto) => produto.profissional === "moises");
  assert.equal(dele.length, 26);
  for (const produto of dele) {
    assert.ok(produto.secao.startsWith("Dr. Moisés"), produto.nome);
    const item = { itemType: produto.tipos[0], amount: produto.preco, description: produto.nome, profissional: "moises" };
    assert.equal(cat.lucroBrutoDoItem(item), produto.lucroBruto, produto.nome);
  }
  // Coluna Q da planilha atualizada (sala R$ 113,78/h, NF 26%/11,48%, comissão 13%).
  const q = (nome) => Math.round(cat.produtoPorNome(nome).lucroBruto * 0.2 * 100) / 100;
  assert.equal(q("Toxina botulínica facial — Botox 100U"), 189.03);
  assert.equal(q("Avaliação capilar (com tricoscopia)"), 44.34);
  assert.equal(q("Lavieen facial (sessão)"), 150.03);
  assert.equal(q("Abdominal Sculpt — sessão Base"), 155.69);
  assert.equal(q("Depilação a laser — axilas"), 15.17);
  assert.equal(cat.produtoPorNome("Avaliação facial").imposto, 0.26, "avaliação com a NF de consulta de 15/09");
  assert.equal(cat.produtoPorNome("Toxina botulínica facial — Botox 100U").imposto, 0.1148, "procedimento com a NF de procedimento de 15/09");
  // A comissão do Dr. Moisés não tem "antes": 13% desde o primeiro atendimento.
  assert.equal(cat.comissaoNoDia(cat.produtoPorNome("Toxina botulínica facial — Botox 100U"), "2026-09-15"), 0.13);
  // Hora de sala atualizada: 60 min = R$ 113,78 (a mesma do Dr. Daniel).
  assert.equal(cat.produtoPorNome("Avaliação facial").custoFixo, 113.778629);
  // Nomes únicos no catálogo inteiro (o nome exato é o que a comanda grava).
  const nomes = cat.CATALOGO_PRECIFICACAO.map((produto) => produto.nome);
  assert.equal(new Set(nomes).size, nomes.length);
});

test("de quem é o item: a marca vale; sem ela, o nome exato da tabela; sem isso, Dr. Daniel", () => {
  assert.equal(cat.profissionalDoItem(botox), "moises");
  assert.equal(cat.profissionalDoItem({ description: "Toxina botulínica facial — Botox 100U" }), "moises");
  assert.equal(cat.profissionalDoItem(plano), "daniel");
  assert.equal(cat.profissionalDoItem({ description: "IM PESO 2 DOSES" }), "daniel");
  assert.equal(cat.profissionalDoItem({ description: "Plano de Acompanhamento · 6 meses", profissional: "moises" }), "moises");
  assert.equal(cat.profissionalDoItem({ description: "x", profissional: "fulano" }), "daniel");
});

test("o palpite fica na tabela de quem executou: item antigo do Dr. Daniel a R$ 900 não vira microagulhamento", () => {
  const antigoDoDaniel = { itemType: "TRATAMENTO", amount: 900, description: "procedimento estético" };
  assert.equal(cat.produtoDoItem(antigoDoDaniel), null);
  // Continua com a fração padrão do Dr. Daniel (Plano de referência), como antes.
  assert.equal(cat.lucroBrutoDoItem(antigoDoDaniel), Math.round(((3266.83 / 6997) * 900) * 100) / 100);
  assert.equal(cat.lucroBrutoDoItem(antigoDoDaniel, "2026-09-10"), Math.round(((3476.74 / 6997) * 900) * 100) / 100, "em setembro, a fração da comissão de 10%");
  const doMoises = { itemType: "TRATAMENTO", amount: 900, description: "microagulhamento facial retoque", profissional: "moises" };
  assert.equal(cat.produtoDoItem(doMoises).nome, "Microagulhamento facial (sessão)");
  // Item do Dr. Moisés fora da tabela: a fração média dos procedimentos dele.
  const livre = { itemType: "TRATAMENTO", amount: 1000, description: "pacote especial", profissional: "moises" };
  assert.equal(cat.produtoDoItem(livre), null);
  assert.equal(cat.lucroBrutoDoItem(livre), 431.9);
});

test("o fechamento grava de quem é cada item", () => {
  const itens = [cat.itemFechadoDoProduto(cat.produtoPorNome("Toxina botulínica facial — Botox 100U")), { ...cat.itemFechadoLivre("TRATAMENTO", "moises"), descricao: "retoque", valorTexto: "500,00" }, cat.itemFechadoDoProduto(cat.produtoPorNome("Vitamina D 600.000 UI"))];
  const parse = (texto) => Number(String(texto).replace(/\./g, "").replace(",", "."));
  let n = 0;
  const comanda = json(cat.itensDaComanda(itens, 3590, parse, () => `fitem-${++n}`));
  assert.deepEqual(
    comanda.map((item) => [item.description, item.profissional, item.amount]),
    [
      ["Toxina botulínica facial — Botox 100U", "moises", 2500],
      ["retoque", "moises", 500],
      ["Vitamina D 600.000 UI", "daniel", 590],
    ],
  );
  // As seções do seletor por profissional.
  assert.ok(cat.secoesDoCatalogo("moises").every((grupo) => grupo.secao.startsWith("Dr. Moisés")));
  assert.ok(cat.secoesDoCatalogo("daniel").every((grupo) => !grupo.secao.startsWith("Dr. Moisés")));
});

test("motor: o Dr. Daniel continua com 50% dos itens dele; o Dr. Moisés fica com 20% dos itens dele", () => {
  // Outubro já com a comissão de 13% (Plano: lucro bruto 3.266,83 → 1.633,42).
  assert.equal(motor.executorDoMes(outubro, "2026-10"), 1633.42);
  assert.equal(motor.executorDoMes(outubro, "2026-10", undefined, "moises"), 189.03);
  assert.deepEqual(json(motor.executoresDoMes(outubro, "2026-10")), { daniel: 1633.42, moises: 189.03, total: 1822.45 });
  // O mesmo Plano lançado em setembro continua com a comissão de 10% (mês fechado).
  assert.equal(motor.executorDoMes([venda("fsale-set", "2026-09-15", [plano])], "2026-09"), 1738.37);
  // Antes de outubro não existe trabalho do Dr. Moisés para o motor.
  assert.equal(motor.executoresDoMes(outubro, "2026-09").moises, 0);
});

test("três parcelas no dia 20 dos três meses seguintes (feriado ou fim de semana: dia útil anterior)", () => {
  const parcelas = json(motor.parcelasDoExecutor(outubro, "2026-10", undefined, undefined, "moises"));
  assert.deepEqual(
    parcelas.map((p) => [p.numero, p.de, p.vence, p.valor]),
    [
      [1, 3, "2026-11-19", 63.01], // 20/11/2026 é feriado (Consciência Negra): paga no dia 19
      [2, 3, "2026-12-18", 63.01], // 20/12/2026 é domingo: paga na sexta, 18
      [3, 3, "2027-01-20", 63.01], // 189,03 ÷ 3 fecha sem sobra de centavo
    ],
  );
  assert.equal(motor.vencimentoDaParcela("daniel", "2026-10", 1), "2026-10-30");
  assert.equal(motor.vencimentoDaParcela("daniel", "2026-10", 2), "2026-11-30");
  assert.equal(motor.parcelasQueVencemNoMes(outubro, "2026-10", undefined, "moises"), 0);
  assert.equal(motor.parcelasQueVencemNoMes(outubro, "2026-11", undefined, "moises"), 63.01);
  assert.equal(motor.parcelasQueVencemNoMes(outubro, "2026-12", undefined, "moises"), 63.01);
  assert.equal(motor.parcelasQueVencemNoMes(outubro, "2027-01", undefined, "moises"), 63.01);
  // O Dr. Daniel, igual: 1ª no último dia útil do mês, 2ª no do mês seguinte.
  assert.equal(motor.parcelasQueVencemNoMes(outubro, "2026-10"), 816.71);
  assert.equal(motor.parcelasQueVencemNoMes(outubro, "2026-11"), 816.71);
});

test("compromissos: as parcelas do Dr. Moisés são abatidas só pelos pagamentos dele", () => {
  const pagamento = { id: "fexp-moises-1", description: "Pagamento ao Dr. Moisés", categoryRef: "cat-lucro-inteligente-moises", amount: 100, dueDate: "2026-11-19", paidAt: "2026-11-19" };
  const novembro = json(motor.compromissosDoMes({ sales: outubro, expenses: [pagamento], monthKey: "2026-11", desde: "2025-01" }));
  assert.equal(novembro.moises.devidoNoMes, 63.01);
  assert.equal(novembro.moises.pagoNoMes, 100);
  assert.equal(novembro.moises.faltaNoMes, 0);
  assert.deepEqual(novembro.moises.proximas.map((p) => [p.numero, p.vence, p.pago, p.falta]), [
    [2, "2026-12-18", 36.99, 26.02],
    [3, "2027-01-20", 0, 63.01],
  ]);
  // O pagamento do Dr. Moisés não abate nada do Dr. Daniel.
  assert.equal(novembro.executor.pagoNoMes, 0);
  assert.equal(novembro.executor.faltaNoMes, 1633.42);
  const outubroComp = json(motor.compromissosDoMes({ sales: outubro, expenses: [], monthKey: "2026-10", desde: "2025-01" }));
  assert.equal(outubroComp.moises.doMes, 189.03);
  assert.equal(outubroComp.moises.vencemNoMes.length, 0);
  assert.deepEqual(outubroComp.moises.proximas.map((p) => p.vence), ["2026-11-19", "2026-12-18", "2027-01-20"]);
});

test("planilha do dia: o envelope do Dr. Moisés sai do líquido e o do Dr. Daniel não muda", () => {
  const config = lucro.normalizaConfig({});
  const planilha = lucro.buildPlanilhaLucro({ sales: outubro, expenses: [], categories: [], reconciliations: [], marcas: [], config, monthKey: "2026-10", hoje: "2026-10-31" });
  const dia = planilha.linhas.find((linha) => linha.dia === "2026-10-15");
  assert.equal(dia.reservado.medicoExecutor, 1633.42);
  assert.equal(dia.reservado.moises, 189.03);
  assert.equal(dia.lucroBrutoMoises, 945.15);
  assert.equal(dia.vendidoMoises, 2500);
  assert.equal(dia.prescrito, 6997);
  const r = dia.reservado;
  assert.equal(Math.round((dia.liquido - r.impostos - r.medicoExecutor - r.moises - r.lucro - r.provisoes - r.reserva) * 100) / 100, r.operacional);
  // Conta item por item de cada um.
  const contaMoises = json(lucro.explicarMedicoDoDia(outubro, "2026-10-15", dia.regua, "moises"));
  assert.equal(contaMoises.percentual, 20);
  assert.deepEqual(contaMoises.comandas[0].itens.map((item) => [item.produto, item.parteMedico]), [["Toxina botulínica facial — Botox 100U", 189.03]]);
  const contaDaniel = json(lucro.explicarMedicoDoDia(outubro, "2026-10-15", dia.regua));
  assert.deepEqual(contaDaniel.comandas[0].itens.map((item) => item.produto), ["Plano de Acompanhamento · 6 meses"]);
  assert.equal(contaDaniel.parteMedico, 1633.42);
  // A tabela da conta mostra a coluna P e a taxa do DIA da comanda.
  assert.equal(contaDaniel.comandas[0].itens[0].lucroBrutoTabela, 3266.83);
  assert.equal(contaDaniel.comandas[0].itens[0].taxaVariavel, 0.39);
  const setembro = json(lucro.explicarMedicoDoDia([venda("fsale-set", "2026-09-15", [plano])], "2026-09-15", dia.regua));
  assert.equal(setembro.comandas[0].itens[0].lucroBrutoTabela, 3476.74);
  assert.equal(setembro.comandas[0].itens[0].taxaVariavel, 0.36);
  assert.equal(setembro.parteMedico, 1738.37);
});

test("régua antiga (sem o Dr. Moisés) ganha os 20%; a régua pode mudar o percentual dele", () => {
  const antiga = lucro.normalizaConfig({ degraus: [{ desde: "2026-09-01", impostos: 16.6, lucroMensal: 40000, medicoExecutor: 50 }] });
  assert.equal(lucro.reguaNoDia(antiga, "2026-10-15").moises, 20);
  const nova = lucro.normalizaConfig({ degraus: [{ desde: "2026-09-01", impostos: 16.6, lucroMensal: 40000, medicoExecutor: 50, moises: 25 }] });
  assert.equal(lucro.reguaNoDia(nova, "2026-10-15").moises, 25);
  motor.definirConfigDoMotor({ degraus: [{ desde: "2026-09-01", medicoExecutor: 50, lucroMensal: 40000, moises: 25 }] });
  try {
    assert.equal(motor.executorDoMes(outubro, "2026-10", undefined, "moises"), 236.29);
  } finally {
    motor.definirConfigDoMotor(null);
  }
  assert.equal(motor.executorDoMes(outubro, "2026-10", undefined, "moises"), 189.03);
});

test("lucro do mês, P12, contabilidade e ponte contam o Dr. Moisés", () => {
  const gestao = json(fin.buildGestaoMensal(outubro, [], fin.seedFinCategories, "2026-10"));
  assert.equal(gestao.medicoExecutor, 1633.42);
  assert.equal(gestao.executorMoises, 189.03);
  assert.equal(gestao.vendasMoises, 2500);
  assert.equal(gestao.custosTotais, 1822.45);
  const p12 = fin.buildP12Matrix(outubro, [], fin.seedFinCategories, 2026);
  const folha = p12.groups.find((grupo) => grupo.groupKey === "MAO_DE_OBRA");
  const linhaMoises = folha.rows.find((linha) => linha.category.id === fin.LINHA_MOTOR_MOISES_ID);
  assert.equal(linhaMoises.months[9].total, 189.03);
  // Contabilidade de novembro: a 2ª do Dr. Daniel (816,71) + a 1ª do Dr. Moisés (63,01) + 40 mil.
  const contabil = json(fin.buildFechamentoContabil(outubro, [], [], "2026-11"));
  assert.equal(contabil.medicoExecutorParcelasDoMes, 816.71);
  assert.equal(contabil.moisesParcelasDoMes, 63.01);
  assert.equal(contabil.custosDoMes, Math.round((40000 + 816.71 + 63.01) * 100) / 100);
  // O pagamento ao Dr. Moisés é baixa, não custo novo (nem na P12, nem na contabilidade).
  const pago = { id: "fexp-m", description: "Pagamento ao Dr. Moisés", categoryRef: "cat-lucro-inteligente-moises", amount: 63.01, dueDate: "2026-11-19", paidAt: "2026-11-19" };
  assert.equal(fin.buildFechamentoContabil(outubro, [pago], [], "2026-11").custosDoMes, contabil.custosDoMes);
  const gestaoNov = json(fin.buildGestaoMensal(outubro, [pago], fin.seedFinCategories, "2026-11"));
  assert.equal(gestaoNov.executorMoisesPago, 63.01);
  assert.equal(gestaoNov.custosTotais, 0);
  // A ponte explica a diferença entre o custo do mês e as parcelas do mês.
  const ponte = fin.buildPonteLucro(json(fin.buildGestaoMensal(outubro, [], fin.seedFinCategories, "2026-10")), json(fin.buildFechamentoContabil(outubro, [], [], "2026-10")), null);
  const passo = ponte.find((p) => p.label.includes("Dr. Moisés"));
  assert.equal(passo.valor, 189.03);
  assert.equal(passo.tipo, "mais");
});

test("pagamento ao Dr. Moisés: categoria dele, transferência e 'falta a nota' (ele não é sócio)", () => {
  const conta = json(lucro.novaTransferencia({ para: "moises", dia: "2026-11-19", valor: 63.01 }));
  assert.equal(conta.categoryRef, "cat-lucro-inteligente-moises");
  assert.equal(conta.notaStatus, "PENDENTE");
  assert.equal(conta.supplier, "Dr. Moisés (biomédico)");
  assert.equal(conta.paidAt, "2026-11-19");
  assert.match(conta.description, /Dr\. Moisés/);
  // O Dr. Daniel continua igual: sócio, sem nota.
  const daniel = json(lucro.novaTransferencia({ para: "medicoExecutor", dia: "2026-10-30", valor: 869.19 }));
  assert.equal(daniel.categoryRef, "cat-lucro-inteligente-medico");
  assert.equal(daniel.notaStatus, "SEM_NOTA");
  assert.ok(fin.seedFinCategories.some((categoria) => categoria.id === "cat-lucro-inteligente-moises" && categoria.groupKey === "MAO_DE_OBRA"));
  assert.equal(prof.profissionalDaCategoria("cat-lucro-inteligente-moises"), "moises");
});
