// LUCRO INTELIGENTE (01–02/09/2026): a aula do Dr. Thiago Volpi (Profit First
// para clínicas) virou planilha diária no app, com a régua do Instituto:
//  · as taxas (maquininha e PIX) saem do "entrou" ANTES de repartir;
//  · impostos = % do líquido; LUCRO = R$ fixo por mês ÷ dias úteis (Lucas: "não
//    é em porcentagem, é sempre esse valor"); MÉDICO EXECUTOR = 50% do que o
//    Dr. Daniel prescreveu (itens de tratamento); operacional = o que sobra;
//  · o degrau vigente é o do dia;
//  · o crédito conta no dia do lançamento e fica DISPONÍVEL no dia útil seguinte
//    (pulando feriado), com o custo de antecipar (TAD) informado;
//  · cada conta paga cai no envelope certo (CEO = lucro, Dr. Daniel = executor,
//    obra, provisão de impostos e tarifa da maquininha ficam fora).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-01", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const li = loadTsModule("src/features/financeiro/lucroInteligente.ts");
const rede = loadTsModule("src/features/financeiro/recebiveisRede.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const perto = (real, esperado, folga = 0.02, msg) => assert.ok(Math.abs(real - esperado) <= folga, `${msg ?? ""} esperado ~${esperado}, veio ${real}`);

const categorias = [
  { id: "cat-fixo", name: "Aluguel", groupKey: "CUSTO_FIXO", isCapex: false, sortOrder: 1, active: true },
  { id: "cat-salario-ceo", name: "Salário CEO", groupKey: "MAO_DE_OBRA", isCapex: false, sortOrder: 2, active: true },
  { id: "cat-medico-prescritor-dr-bratan", name: "Dr Bratan", groupKey: "MAO_DE_OBRA", isCapex: false, sortOrder: 3, active: true },
  { id: "cat-impostos-mensais", name: "Impostos Mensais", groupKey: "CUSTO_VARIAVEL", isCapex: false, sortOrder: 4, active: true },
  { id: "cat-poup-impostos-mensais", name: "Impostos (provisão)", groupKey: "POUPANCA", isCapex: false, sortOrder: 5, active: true },
  { id: "cat-compras-variaveis-obras-2026", name: "Obra", groupKey: "CUSTO_VARIAVEL", isCapex: true, sortOrder: 6, active: true },
  { id: "cat-fatura-cartao-credito", name: "Fatura cartão", groupKey: "CUSTO_VARIAVEL", isCapex: false, sortOrder: 7, active: true },
  { id: "cat-distribuicao-lucro-socios", name: "Distribuição", groupKey: "CUSTO_VARIAVEL", isCapex: true, sortOrder: 8, active: true },
  { id: "cat-tarifa-bancaria-rede", name: "Tarifa Rede", groupKey: "CUSTO_VARIAVEL", isCapex: false, sortOrder: 9, active: true },
  { id: "cat-giro-pronamp-carro-emprestimo", name: "Empréstimo", groupKey: "CUSTO_FIXO", isCapex: false, sortOrder: 20, active: true },
];
const cat = (id) => categorias.find((c) => c.id === id);
const conta = (id, valor, categoryRef, paidAt, isCapex = false) => ({
  id, description: id, amount: valor, dueDate: paidAt, paidAt, categoryRef, isCapex, method: "PIX", supplier: "",
  installmentNum: null, installmentTotal: null, documentNote: "", notes: "", createdAt: "2026-09-01T10:00:00.000Z",
});
// itens: lista de { itemType, amount }; pagamentos: { method, amount, installments? }
const venda = (id, dia, pagamentos, itens) => ({
  id, saleDate: dia, patientName: id, crmContactRef: "", notes: "",
  items: (itens ?? [{ itemType: "TRATAMENTO", amount: pagamentos.reduce((s, p) => s + p.amount, 0) }]).map((i, k) => ({ id: `${id}-i${k}`, description: "", ...i })),
  payments: pagamentos.map((p, k) => ({ id: `${id}-p${k}`, installments: 1, comprovanteStatus: "ANEXADO", ...p })),
  createdAt: `${dia}T10:00:00.000Z`,
});
const regua = (impostos, lucroMensal, medicoExecutor) => ({
  degraus: [{ desde: "2026-09-01", impostos, lucroMensal, medicoExecutor }],
  alvo: { impostos, lucroMensal, medicoExecutor },
  selicAnual: 15,
});

test("régua do Instituto: impostos % do líquido, lucro cota fixa, executor 50% do prescrito, operacional é o resto", () => {
  const r = { impostos: 16.6, lucroMensal: 40000, medicoExecutor: 50 };
  const env = li.repartir(10000, 7000, r, 1904.76);
  assert.equal(env.impostos, 1660, "16,6% dos 10 mil líquidos");
  assert.equal(env.medicoExecutor, 3500, "50% dos 7 mil prescritos (Lucas: 'se ele prescrever um plano de 7 mil, 50% vai pra ele')");
  assert.equal(env.lucro, 1904.76, "a cota do dia, não um percentual");
  assert.equal(env.operacional, 2935.24, "o que sobra para a clínica gastar");
  assert.equal(round(env.impostos + env.medicoExecutor + env.lucro + env.operacional), 10000, "os quatro fecham o líquido");
  const fraco = li.repartir(1000, 0, r, 1904.76);
  assert.equal(fraco.operacional, -1070.76, "dia fraco não paga a cota: operacional fica negativo, sem esconder");
});
function round(v) { return Math.round(v * 100) / 100; }

test("cota do lucro: R$ 40 mil ÷ dias úteis do mês (setembro/2026 tem 21, sem o 7 de setembro), só em dia útil", () => {
  assert.equal(li.diasUteisDoMes("2026-09").length, 21, "22 dias de semana menos o feriado de 07/09");
  assert.equal(li.diasUteisDoMes("2026-10").length, 21, "outubro: 22 menos o 12/10");
  const r = { impostos: 16.6, lucroMensal: 40000, medicoExecutor: 50 };
  assert.equal(li.cotaLucroDoDia(r, "2026-09-01"), 1904.76);
  assert.equal(li.cotaLucroDoDia(r, "2026-09-05"), 0, "sábado não tem cota");
  assert.equal(li.cotaLucroDoDia(r, "2026-09-07"), 0, "feriado não tem cota");
  perto(li.diasUteisDoMes("2026-09").length * li.cotaLucroDoDia(r, "2026-09-01"), 40000, 0.5, "as cotas do mês somam os 40 mil");
});

test("prescrito: só itens de tratamento contam para os 50% do médico", () => {
  const comanda = venda("ana", "2026-09-01", [{ method: "PIX", amount: 9497 }], [
    { itemType: "CONSULTA", amount: 2500 },
    { itemType: "TRATAMENTO", amount: 6997 },
  ]);
  assert.equal(li.prescritoNaComanda(comanda), 6997, "a consulta é da clínica; o plano é prescrição");
  const soConsulta = venda("bia", "2026-09-01", [{ method: "PIX", amount: 500 }], [{ itemType: "SINAL", amount: 500 }]);
  assert.equal(li.prescritoNaComanda(soConsulta), 0);
});

test("degraus: o valor do dia é o do degrau vigente, e subir não passa do alvo", () => {
  const config = {
    degraus: [
      { desde: "2026-09-01", impostos: 16.6, lucroMensal: 30000, medicoExecutor: 50 },
      { desde: "2026-10-01", impostos: 16.6, lucroMensal: 36000, medicoExecutor: 50 },
    ],
    alvo: { impostos: 16.6, lucroMensal: 40000, medicoExecutor: 50 },
  };
  assert.equal(li.reguaNoDia(config, "2026-08-15").lucroMensal, 30000, "antes do primeiro degrau vale o primeiro");
  assert.equal(li.reguaNoDia(config, "2026-09-30").lucroMensal, 30000);
  assert.equal(li.reguaNoDia(config, "2026-10-01").lucroMensal, 36000, "no dia do degrau novo, vale o novo");
  const subiu = li.subirDegrau(config, "2026-11-01", 6000);
  assert.equal(li.reguaNoDia(subiu, "2026-11-05").lucroMensal, 40000, "36 + 6 seria 42 mil, mas o alvo é 40");
  assert.equal(subiu.degraus.length, 3);
  assert.equal(li.subirDegrau(subiu, "2026-11-01", 2000).degraus.length, 3, "subir de novo no mesmo dia substitui, não duplica");
});

test("normalizaConfig: a forma antiga (lucro em %) vira a régua nova sem quebrar", () => {
  const antiga = { degraus: [{ desde: "2026-09-01", impostos: 16.6, lucro: 41, medicoExecutor: 12 }], alvo: { impostos: 16.6, lucro: 41, medicoExecutor: 12 } };
  const nova = li.normalizaConfig(antiga);
  assert.equal(nova.degraus[0].lucroMensal, 40000, "lucro passa a ser R$ 40 mil/mês");
  assert.equal(nova.degraus[0].medicoExecutor, 50, "executor passa a ser 50% do prescrito");
  assert.equal(nova.degraus[0].impostos, 16.6, "imposto fica");
  assert.equal(nova.selicAnual, 15);
  assert.deepEqual(plain(li.normalizaConfig(null).degraus), plain(li.defaultLucroConfig.degraus), "vazio vira o padrão");
  const atual = li.normalizaConfig({ degraus: [{ desde: "2026-09-01", impostos: 13.33, lucroMensal: 35000, medicoExecutor: 45 }], alvo: { impostos: 13.33, lucroMensal: 35000, medicoExecutor: 45 }, selicAnual: 12 });
  assert.deepEqual(plain(atual.degraus[0]), { desde: "2026-09-01", impostos: 13.33, lucroMensal: 35000, medicoExecutor: 45 }, "a forma nova passa intacta");
});

test("dia útil bancário pula fim de semana E feriado (Carnaval, 7 de setembro)", () => {
  assert.equal(rede.ehDiaUtil("2026-09-07"), false, "Independência é feriado bancário");
  assert.equal(rede.ajustaParaDiaUtil("2026-09-05"), "2026-09-08", "sábado 05/09 → terça 08/09 (segunda é feriado)");
  assert.equal(rede.diaUtilSeguinte("2026-02-13"), "2026-02-18", "sexta antes do Carnaval → quarta de Cinzas");
  assert.equal(rede.diaUtilAnterior("2026-09-08"), "2026-09-04", "a véspera útil de 08/09 é sexta 04/09");
  assert.equal(rede.diasEntre("2026-09-02", "2026-10-02"), 30);
});

test("antecipação sob demanda: TAD = SELIC a.m. + 0,9%, custo pelo prazo (anexo RAV)", () => {
  perto(rede.taxaAntecipacaoMensal(0.15) * 100, 2.07, 0.01, "SELIC 15% a.a. → 1,17% a.m. + 0,9% = 2,07%");
  perto(rede.custoAntecipacao(1000, 30, 0.15), 20.72, 0.02, "antecipar 1.000 por 30 dias");
  perto(rede.custoAntecipacao(1000, 60, 0.15), 41.86, 0.05, "60 dias compõe: (1,0207²−1)");
  assert.equal(rede.custoAntecipacao(1000, 0, 0.15), 0, "nada a antecipar, nada a pagar");
  assert.equal(rede.taxaPix(12000, "2026-09-01"), 72, "0,6% de 12 mil (teto R$ 150)");
  assert.equal(rede.taxaPix(12000, "2026-08-25"), 1, "no acordo anterior o teto era R$ 1");
});

test("planilha do dia: taxas saem antes; executor é 50% do prescrito; lucro é a cota; crédito conta no lançamento e fica disponível em D+1", () => {
  const vendas = [
    venda("ana", "2026-09-01", [{ method: "PIX", amount: 4000 }, { method: "CARTAO_CREDITO", amount: 6000 }], [
      { itemType: "CONSULTA", amount: 3003 },
      { itemType: "TRATAMENTO", amount: 6997 },
    ]),
    venda("bia", "2026-09-02", [{ method: "DINHEIRO", amount: 1000 }], [{ itemType: "SINAL", amount: 1000 }]),
  ];
  const p = li.buildPlanilhaLucro({ sales: vendas, expenses: [], categories: categorias, reconciliations: [], marcas: [], config: regua(10, 21000, 50), monthKey: "2026-09", hoje: "2026-09-03" });
  assert.equal(p.diasUteis, 21);
  assert.equal(p.cotaLucroDiaUtil, 1000, "21 mil ÷ 21 dias úteis");
  assert.equal(p.linhas.length, 3, "um dia por linha, do dia 1 até hoje");
  const dia1 = p.linhas[0];
  assert.equal(dia1.total, 10000, "bruto das comandas");
  assert.equal(dia1.taxas, 126, "PIX 0,6% de 4.000 = 24 + crédito à vista 1,7% de 6.000 = 102");
  assert.equal(dia1.liquido, 9874, "é isso que entrou de verdade");
  assert.equal(dia1.prescrito, 6997, "só o plano é prescrição");
  assert.equal(dia1.disponivel, 3976, "no dia da venda só o PIX (líquido) está disponível");
  assert.equal(dia1.reservado.impostos, 987.4, "10% do líquido");
  assert.equal(dia1.reservado.medicoExecutor, 3498.5, "50% dos 6.997 prescritos");
  assert.equal(dia1.reservado.lucro, 1000, "a cota do dia útil");
  assert.equal(dia1.reservado.operacional, 4388.1, "9.874 − 987,40 − 3.498,50 − 1.000");
  const dia2 = p.linhas[1];
  assert.equal(dia2.cartaoDisponivel, 5898, "6.000 − 1,7% à disposição no dia útil seguinte");
  assert.equal(dia2.disponivel, 1000 + 5898, "dinheiro do dia + cartão de ontem");
  perto(dia2.antecipacao, 122.18, 0.05, "custo de resgatar hoje (30 dias × 2,07%)");
  assert.equal(dia2.reservado.medicoExecutor, 0, "sinal não é prescrição");
  assert.equal(dia2.reservado.lucro, 1000, "a cota vale mesmo num dia fraco");
  assert.equal(dia2.reservado.operacional, -100, "1.000 − 100 de imposto − 1.000 de cota");
  assert.equal(dia2.acumulado.reservado.operacional, 4288.1, "vai se somando dia a dia");
  assert.equal(p.totais.total, 11000);
  assert.equal(p.totais.liquido, 10874);
  assert.equal(p.totais.prescrito, 6997);
  assert.equal(p.diasComMovimento, 2);
  assert.equal(p.diasPendentes, 2, "nenhum dia marcado como separado ainda");
});

test("planilha do dia: parcelado antecipa cada parcela pelo seu prazo, e feriado empurra a disponibilidade", () => {
  const vendas = [venda("carla", "2026-09-04", [{ method: "CARTAO_CREDITO", amount: 12000, installments: 2 }])];
  const p = li.buildPlanilhaLucro({ sales: vendas, expenses: [], categories: categorias, reconciliations: [], marcas: [], config: regua(10, 0, 50), monthKey: "2026-09", hoje: "2026-09-09" });
  const sexta = p.linhas[3];
  assert.equal(sexta.taxas, 286.8, "2x paga 2,39%");
  assert.equal(p.linhas[4].cartaoDisponivel, 0, "sábado: nada");
  assert.equal(p.linhas[6].cartaoDisponivel, 0, "segunda 07/09 é feriado: nada");
  assert.equal(p.linhas[6].regua.cotaLucro, 0, "feriado também não tem cota de lucro");
  const terca = p.linhas[7];
  assert.equal(terca.cartaoDisponivel, 11713.2, "o cartão de sexta só fica disponível na terça 08/09");
  const esperado = rede.custoAntecipacao(11713.2 / 2, 27, 0.15) + rede.custoAntecipacao(11713.2 / 2, 58, 0.15);
  perto(terca.antecipacao, esperado, 0.02, "custo das duas parcelas");
  assert.ok(terca.antecipacao > 300, "parcelado antecipado custa caro (aqui > R$ 300)");
});

test("planilha do dia: contas pagas caem no envelope certo; obra, provisão e tarifa da maquininha ficam fora", () => {
  const vendas = [venda("ana", "2026-09-01", [{ method: "DINHEIRO", amount: 10000 }], [{ itemType: "CONSULTA", amount: 10000 }])];
  const contas = [
    conta("aluguel", 3000, "cat-fixo", "2026-09-01"),
    conta("ceo", 1500, "cat-salario-ceo", "2026-09-01"),
    conta("dr", 800, "cat-medico-prescritor-dr-bratan", "2026-09-01"),
    conta("das", 700, "cat-impostos-mensais", "2026-09-01"),
    conta("provisao", 999, "cat-poup-impostos-mensais", "2026-09-01"),
    conta("obra", 5000, "cat-compras-variaveis-obras-2026", "2026-09-01"),
    conta("visa-obra", 2000, "cat-fatura-cartao-credito", "2026-09-01", true),
    conta("rede", 300, "cat-tarifa-bancaria-rede", "2026-09-01"),
    conta("pronamp", 400, "cat-giro-pronamp-carro-emprestimo", "2026-09-01"),
  ];
  const p = li.buildPlanilhaLucro({ sales: vendas, expenses: contas, categories: categorias, reconciliations: [{ id: "r", day: "2026-09-01", status: "CONFERIDO" }], marcas: [{ dia: "2026-09-01", separado: true, observacao: "" }], config: regua(10, 21000, 50), monthKey: "2026-09", hoje: "2026-09-01" });
  const dia = p.linhas[0];
  assert.equal(dia.taxas, 0, "dinheiro não tem taxa");
  assert.deepEqual(plain(dia.usado), { impostos: 700, lucro: 1900, medicoExecutor: 800, operacional: 3000 }, "empréstimo sai do lucro; obra, VISA-OBRA, provisão e tarifa da Rede não entram em envelope nenhum");
  assert.equal(dia.reservado.operacional, 8000, "10.000 − 1.000 de imposto − 1.000 de cota (consulta não é prescrição)");
  assert.equal(dia.acumulado.saldo.operacional, 5000, "8.000 reservados − 3.000 gastos");
  assert.equal(dia.acumulado.saldo.lucro, -900, "1.000 de cota − 1.900 pagos (CEO + parcela do empréstimo)");
  assert.equal(dia.fechamento, "CONFERIDO");
  assert.equal(p.diasSeparados, 1);
  assert.equal(p.diasPendentes, 0);
});

test("envelopeDaConta: CEO é lucro, Dr. Daniel é executor, empréstimo é lucro, provisão/obra/tarifa ficam fora", () => {
  assert.equal(li.envelopeDaConta(conta("a", 1, "cat-salario-ceo", "2026-09-01"), cat("cat-salario-ceo")), "lucro");
  assert.equal(li.envelopeDaConta(conta("b", 1, "cat-medico-prescritor-dr-bratan", "2026-09-01"), cat("cat-medico-prescritor-dr-bratan")), "medicoExecutor");
  assert.equal(li.envelopeDaConta(conta("c", 1, "cat-impostos-mensais", "2026-09-01"), cat("cat-impostos-mensais")), "impostos");
  assert.equal(li.envelopeDaConta(conta("d", 1, "cat-poup-impostos-mensais", "2026-09-01"), cat("cat-poup-impostos-mensais")), null);
  assert.equal(li.envelopeDaConta(conta("e", 1, "cat-compras-variaveis-obras-2026", "2026-09-01"), cat("cat-compras-variaveis-obras-2026")), null);
  assert.equal(li.envelopeDaConta(conta("f", 1, "cat-distribuicao-lucro-socios", "2026-09-01"), cat("cat-distribuicao-lucro-socios")), "lucro", "distribuição é lucro dos sócios, não obra");
  assert.equal(li.envelopeDaConta(conta("g", 1, "cat-fixo", "2026-09-01"), cat("cat-fixo")), "operacional");
  assert.equal(li.envelopeDaConta(conta("h", 1, "cat-tarifa-bancaria-rede", "2026-09-01"), cat("cat-tarifa-bancaria-rede")), null, "a taxa já saiu na coluna Taxas");
  assert.equal(li.envelopeDaConta(conta("i", 1, "cat-giro-pronamp-carro-emprestimo", "2026-09-01"), cat("cat-giro-pronamp-carro-emprestimo")), "lucro", "a aula: dívida de reforma é lucro");
});

test("avaliação instantânea (Passo 1): onde a clínica está, sem maquiar, com o prescrito do mês", () => {
  const vendas = [venda("ana", "2026-08-10", [{ method: "PIX", amount: 100000 }], [{ itemType: "CONSULTA", amount: 30000 }, { itemType: "TRATAMENTO", amount: 70000 }])];
  const contas = [
    conta("aluguel", 50000, "cat-fixo", "2026-08-10"),
    conta("ceo", 15000, "cat-salario-ceo", "2026-08-10"),
    conta("dr", 12000, "cat-medico-prescritor-dr-bratan", "2026-08-10"),
    conta("das", 13000, "cat-impostos-mensais", "2026-08-10"),
    conta("provisao", 14000, "cat-poup-impostos-mensais", "2026-08-10"),
    conta("obra", 30000, "cat-compras-variaveis-obras-2026", "2026-08-10"),
    conta("pronamp", 7000, "cat-giro-pronamp-carro-emprestimo", "2026-08-10"),
  ];
  const a = li.avaliacaoInstantanea(vendas, contas, categorias, [], ["2026-08"]);
  const mes = a.meses[0];
  assert.equal(mes.receita, 100000);
  assert.equal(mes.prescrito, 70000, "70 mil de tratamentos → pela régua nova o executor levaria 35 mil");
  assert.equal(mes.impostos, 13000);
  assert.equal(mes.medicoExecutor, 12000, "o que foi pago de fato ao Dr.");
  assert.equal(mes.operacional, 50000, "provisão de impostos e empréstimo não são despesa operacional");
  assert.equal(mes.sociosPagos, 15000);
  assert.equal(mes.lucro, 25000, "receita − impostos − executor − operacional (inclui o que a CEO já levou e a parcela do empréstimo)");
  assert.equal(mes.investimento, 37000, "obra + empréstimo, à parte");
  assert.deepEqual(plain(mes.percentuais), { impostos: 13, lucro: 25, medicoExecutor: 12, operacional: 50, sociosPagos: 15 });
  assert.equal(a.consolidado.receita, 100000);
  assert.equal(a.consolidado.prescrito, 70000);
  assert.deepEqual(plain(li.mesesAnteriores("2026-09", 3)), ["2026-06", "2026-07", "2026-08"]);
});

test("conferência com a maquininha: o app calcula o a receber e compara com o que a Rede mostra", () => {
  const vendas = [
    venda("ana", "2026-09-01", [{ method: "CARTAO_CREDITO", amount: 6000 }]),
    venda("bia", "2026-09-01", [{ method: "PIX", amount: 1000 }]),
  ];
  const semInformar = li.conferirRecebiveis(vendas, "2026-09-02");
  assert.equal(semInformar.calculado, 5898, "6.000 − 1,7%, liquidação em 02/10");
  assert.equal(semInformar.parcelas, 1);
  assert.deepEqual(plain(semInformar.porMes), [{ mes: "2026-10", liquido: 5898, parcelas: 1 }]);
  assert.equal(semInformar.informado, null);
  assert.equal(semInformar.bate, null);
  assert.equal(semInformar.volumeCartaoMes, 6000, "o PIX não é volume elegível");
  assert.equal(semInformar.minimoAntecipar, 600, "o contrato manda antecipar ao menos 10%");

  let config = { degraus: [], alvo: { impostos: 0, lucroMensal: 0, medicoExecutor: 0 } };
  config = li.registrarConferencia(config, { dia: "2026-09-02", aReceberRede: 5920 });
  const bateu = li.conferirRecebiveis(vendas, "2026-09-02", config.conferencias);
  assert.equal(bateu.informado, 5920);
  assert.equal(bateu.diferenca, 22);
  assert.equal(bateu.bate, true, "R$ 22 cabe na folga de R$ 50");
  config = li.registrarConferencia(config, { dia: "2026-09-02", aReceberRede: 4000 });
  assert.equal(config.conferencias.length, 1, "uma conferência por dia: a nova substitui");
  const naoBateu = li.conferirRecebiveis(vendas, "2026-09-02", config.conferencias);
  assert.equal(naoBateu.diferenca, -1898);
  assert.equal(naoBateu.bate, false, "a Rede mostra menos: ou antecipou, ou falta lançar");
  const depois = li.conferirRecebiveis(vendas, "2026-10-05", config.conferencias);
  assert.equal(depois.calculado, 0, "depois da liquidação não há mais nada a receber");
});

test("configuração padrão: a régua do Lucas (02/09) — 16,6% · R$ 40 mil/mês · 50% do prescrito", () => {
  const degrau = li.defaultLucroConfig.degraus[0];
  assert.equal(degrau.impostos, 16.6, "imposto da aula, acima da nossa alíquota de propósito");
  assert.equal(degrau.lucroMensal, 40000, "'quarenta mil, que é mais ou menos o lucro'");
  assert.equal(degrau.medicoExecutor, 50, "'50% do que ele prescreveu'");
  assert.deepEqual(plain(li.defaultLucroConfig.alvo), { impostos: 16.6, lucroMensal: 40000, medicoExecutor: 50 }, "alvo = decisão");
  assert.equal(li.selicDaConfig({ degraus: [], alvo: degrau }), 0.15, "sem SELIC gravada vale a referência de 15% a.a.");
  assert.equal(li.selicDaConfig({ degraus: [], alvo: degrau, selicAnual: 12.5 }), 0.125);
  assert.equal(li.EXEMPLO_DA_AULA.operacional, 30.4, "o exemplo da aula fica só como referência de texto");
});
