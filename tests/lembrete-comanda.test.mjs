import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const localStoreStub = {
  readLocalValue: (_key, fallback) => fallback,
  todayISO: () => "2026-07-28",
  writeLocalValue: () => undefined,
  formatShortTime: () => "00:00",
};

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
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
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const pag = loadTsModule("src/features/pagamentos/pagamentosData.ts");

function lembrete(over = {}) {
  return {
    id: "lem-1",
    pacienteNome: "Hilton Dispatto",
    crmContactRef: "crm-hilton",
    valorPendente: 22000,
    dataPrevista: "2026-07-30",
    status: "aberto",
    criadoPor: "Lucas",
    criadoEm: "2026-07-01T10:00:00.000Z",
    ...over,
  };
}

test("acha o lembrete do paciente pelo contato do CRM (à prova de digitação)", () => {
  const abertos = pag.openLembretesForPatient([lembrete({ pacienteNome: "HILTON DISPATO" })], {
    ref: "crm-hilton",
    name: "Hilton Dispatto",
  });
  assert.equal(abertos.length, 1, "casou pelo ref, mesmo com o nome escrito diferente");
});

test("lembrete antigo sem link casa pelo nome, inclusive só com o primeiro nome", () => {
  const lista = [lembrete({ id: "lem-milton", pacienteNome: "Milton", crmContactRef: undefined, valorPendente: 4003 })];
  const achado = pag.openLembretesForPatient(lista, { ref: "crm-milton", name: "Milton Ferreira da Silva" });
  assert.equal(achado.length, 1, "'Milton' casa com 'Milton Ferreira da Silva'");
  const acentos = pag.openLembretesForPatient(
    [lembrete({ pacienteNome: "JOSÉ IVAN", crmContactRef: undefined })],
    { ref: "", name: "jose ivan" },
  );
  assert.equal(acentos.length, 1, "acento e caixa não impedem o encaixe");
});

test("não pega lembrete de outro paciente nem já pago", () => {
  const lista = [
    lembrete({ id: "outro", pacienteNome: "Ariane Caramigo", crmContactRef: "crm-ariane" }),
    lembrete({ id: "pago", status: "pago" }),
    lembrete({ id: "zerado", valorPendente: 0 }),
    lembrete({ id: "apagado", deletedAt: "2026-07-20T10:00:00.000Z" }),
  ];
  const achado = pag.openLembretesForPatient(lista, { ref: "crm-hilton", name: "Hilton Dispatto" });
  assert.equal(achado.length, 0, "só lembrete em aberto, do paciente certo, com saldo");
});

test("comanda menor que a dívida abate parcial e mantém o resto em aberto", () => {
  const plano = pag.planEncaixeComanda([lembrete()], { ref: "crm-hilton", name: "Hilton Dispatto" }, 10000);
  assert.equal(plano.totalEmAberto, 22000);
  assert.equal(plano.totalAbatido, 10000);
  assert.equal(plano.encaixes[0].quitou, false);
  assert.equal(plano.encaixes[0].novoPendente, 12000, "sobra devendo R$ 12 mil");
  assert.equal(plano.sobra, 0);
});

test("comanda igual à dívida QUITA o lembrete", () => {
  const plano = pag.planEncaixeComanda([lembrete({ valorPendente: 950 })], { ref: "crm-hilton", name: "Hilton" }, 950);
  assert.equal(plano.encaixes[0].quitou, true);
  assert.equal(plano.encaixes[0].novoPendente, 0);
});

test("comanda maior que a dívida NUNCA abate mais do que se deve", () => {
  const plano = pag.planEncaixeComanda([lembrete({ valorPendente: 950 })], { ref: "crm-hilton", name: "Hilton" }, 5000);
  assert.equal(plano.totalAbatido, 950, "abate só o que estava em aberto");
  assert.equal(plano.sobra, 4050, "o resto é faturamento novo da comanda");
});

test("com vários lembretes, abate do vencimento mais antigo primeiro", () => {
  const lista = [
    lembrete({ id: "novo", dataPrevista: "2026-09-08", valorPendente: 1150 }),
    lembrete({ id: "velho", dataPrevista: "2026-08-05", valorPendente: 1150 }),
  ];
  const plano = pag.planEncaixeComanda(lista, { ref: "crm-hilton", name: "Hilton" }, 1500);
  assert.equal(plano.encaixes[0].lembreteId, "velho", "o mais antigo primeiro");
  assert.equal(plano.encaixes[0].valorAbatido, 1150);
  assert.equal(plano.encaixes[1].lembreteId, "novo");
  assert.equal(plano.encaixes[1].valorAbatido, 350);
  assert.equal(plano.totalAbatido, 1500);
});

test("paciente sem dívida: plano vazio (a faixa de aviso nem aparece)", () => {
  const plano = pag.planEncaixeComanda([lembrete()], { ref: "crm-outro", name: "Paciente Novo" }, 3000);
  assert.equal(plano.totalEmAberto, 0);
  assert.equal(plano.encaixes.length, 0);
  assert.equal(plano.sobra, 3000);
});

test("centavos não viram dízima: 0,01 é tratado direito", () => {
  const plano = pag.planEncaixeComanda([lembrete({ valorPendente: 0.01 })], { ref: "crm-hilton", name: "Hilton" }, 1000);
  assert.equal(plano.totalAbatido, 0.01);
  assert.equal(plano.sobra, 999.99);
});

test("REGRA CENTRAL: recebimento que veio de comanda NÃO entra no caixa do crediário", () => {
  const recebimentos = [
    { id: "r1", lembreteId: "lem-1", valor: 5000, forma: "DINHEIRO", recebidoEm: "2026-07-20", saleRef: null },
    { id: "r2", lembreteId: "lem-2", valor: 3000, forma: "DINHEIRO", recebidoEm: "2026-07-21", saleRef: "fsale-123" },
    { id: "r3", lembreteId: "lem-3", valor: 2000, forma: "PIX", recebidoEm: "2026-07-22", saleRef: null },
  ];
  const caixa = pag.crediarioCashMoves(recebimentos);
  assert.deepEqual(caixa.map((item) => item.id), ["r1"], "só o dinheiro do crediário sem comanda");
  const total = caixa.reduce((sum, item) => sum + item.valor, 0);
  assert.equal(total, 5000, "os R$ 3 mil que vieram por comanda não entram (já estão no faturamento)");
});

function receb(over = {}) {
  return { id: "r", lembreteId: "lem", valor: 1000, forma: "DINHEIRO", recebidoEm: "2026-07-17", saleRef: null, ...over };
}
function manual(over = {}) {
  return { id: "m", entryDate: "2026-07-17", direction: "ENTRADA", description: "Fulano", amount: 1000, ...over };
}
function auditar(recebimentos, manuais = []) {
  return pag.findCofreSuspects({
    recebimentos: pag.cofreItemsFromRecebimentos(recebimentos),
    manuais: pag.cofreItemsFromManuais(manuais),
  });
}

test("conferência do cofre: mesmo valor lançado duas vezes no mesmo dia (forma trocada)", () => {
  const suspeitos = auditar([
    receb({ id: "a", lembreteId: "lem-elias", valor: 2000, forma: "OUTRO", pacienteNome: "Elias Teodoro Gomes" }),
    receb({ id: "b", lembreteId: "lem-elias", valor: 2000, forma: "DINHEIRO", pacienteNome: "Elias Teodoro Gomes" }),
    receb({ id: "c", lembreteId: "lem-outro", valor: 500, pacienteNome: "Outro Paciente" }),
  ]);
  assert.equal(suspeitos.length, 1);
  assert.equal(suspeitos[0].motivo, "MESMO_VALOR_MESMO_DIA");
  assert.equal(suspeitos[0].valorEmRisco, 2000, "só um deles é dinheiro: o cofre pode estar R$ 2 mil a mais");
  assert.equal(suspeitos[0].itens.length, 2, "mostra o par inteiro (o de outra forma entra como contexto)");
});

test("CASO REAL 17/07: recebimento pendurado em lembrete APAGADO continua somando", () => {
  const suspeitos = auditar([
    receb({
      id: "marcia-17",
      lembreteId: "lem-apagado",
      valor: 1889,
      recebidoEm: "2026-07-17",
      pacienteNome: "Marcia Olivia",
      lembreteApagado: true,
    }),
  ]);
  assert.equal(suspeitos.length, 1);
  assert.equal(suspeitos[0].motivo, "LEMBRETE_APAGADO");
  assert.equal(suspeitos[0].valorEmRisco, 1889);
});

test("CASO REAL Marcia: o mesmo valor em lembretes DIFERENTES do mesmo nome é pego", () => {
  const suspeitos = auditar([
    receb({ id: "m1", lembreteId: "lem-antigo", valor: 1889, recebidoEm: "2026-07-17", pacienteNome: "Marcia Olivia" }),
    receb({ id: "m2", lembreteId: "lem-novo", valor: 1889, recebidoEm: "2026-07-23", pacienteNome: "MARCIA OLIVIA" }),
  ]);
  assert.equal(suspeitos.length, 1, "nome igual + valor igual = suspeita, mesmo em lembretes diferentes");
  assert.equal(suspeitos[0].motivo, "MESMO_VALOR_REPETIDO");
  assert.equal(suspeitos[0].itens.length, 2);
});

test("CASO REAL Elias: lembrete CANCELADO com recebimento em dinheiro é apontado", () => {
  const suspeitos = auditar([
    receb({ id: "e1", lembreteId: "lem-cancelado", valor: 2000, pacienteNome: "Elias Teodoro Gomes", lembreteStatus: "cancelado" }),
  ]);
  assert.equal(suspeitos[0].motivo, "LEMBRETE_CANCELADO");
  assert.equal(suspeitos[0].valorEmRisco, 2000);
});

test("CASO REAL Aline 28/07: lembrete + lançamento à mão do mesmo valor = dinheiro contado 2x", () => {
  const suspeitos = auditar(
    [receb({ id: "a1", lembreteId: "lem-aline", valor: 2800, recebidoEm: "2026-07-28", pacienteNome: "ALINE CRISTINE MENDES" })],
    [
      manual({ id: "m1", entryDate: "2026-07-28", description: "TIRZE ALINE MENDES", amount: 2800 }),
      manual({ id: "m2", entryDate: "2026-07-21", description: "Paulo Queiroz Neto", amount: 2800 }),
    ],
  );
  assert.equal(suspeitos.length, 1, "o Paulo de outro dia e outro nome NÃO entra");
  assert.equal(suspeitos[0].motivo, "RECEBIMENTO_E_MANUAL");
  assert.equal(suspeitos[0].valorEmRisco, 2800);
  assert.equal(suspeitos[0].itens.length, 2);
});

test("parcelas iguais de pacientes diferentes em dias diferentes NÃO viram suspeita", () => {
  const suspeitos = auditar([
    receb({ id: "a", lembreteId: "lem-1", valor: 1150, recebidoEm: "2026-08-05", pacienteNome: "Gabriela Guagliano" }),
    receb({ id: "b", lembreteId: "lem-2", valor: 1150, recebidoEm: "2026-09-08", pacienteNome: "Isabel Guarnieri" }),
  ]);
  assert.equal(suspeitos.length, 0);
});

test("recebimento que veio de comanda não é conferido no cofre (não está lá)", () => {
  const suspeitos = auditar([
    receb({ id: "a", lembreteId: "lem-1", valor: 3000, pacienteNome: "Vagner", saleRef: "fsale-1" }),
    receb({ id: "b", lembreteId: "lem-1", valor: 3000, pacienteNome: "Vagner", saleRef: "fsale-2" }),
  ]);
  assert.equal(suspeitos.length, 0, "comanda já está no faturamento — fora da conferência do cofre");
});

test("saída lançada à mão não é confundida com entrada duplicada", () => {
  const suspeitos = auditar(
    [receb({ id: "a", lembreteId: "lem-1", valor: 5000, pacienteNome: "Vagner da Rocha" })],
    [manual({ id: "m", direction: "SAIDA", description: "RETIRADA DE LUCRO ANDRYA", amount: 5000 })],
  );
  assert.equal(suspeitos.length, 0, "saída é dinheiro que saiu, nunca duplicata de entrada");
});

test("o cofre bate depois de tirar o que estava sobrando", () => {
  const recebimentos = [
    receb({ id: "milton", lembreteId: "l1", valor: 1042, recebidoEm: "2026-07-13", pacienteNome: "Milton" }),
    receb({ id: "marcia-orfa", lembreteId: "l2", valor: 1889, recebidoEm: "2026-07-17", pacienteNome: "Marcia Olivia", lembreteApagado: true }),
    receb({ id: "marcia-ok", lembreteId: "l3", valor: 1889, recebidoEm: "2026-07-23", pacienteNome: "MARCIA OLIVIA" }),
  ];
  const antes = pag.crediarioCashMoves(recebimentos).reduce((sum, item) => sum + item.valor, 0);
  assert.equal(antes, 4820);
  const suspeitos = auditar(recebimentos);
  assert.ok(suspeitos.length >= 1, "aponta a órfã");
  const depois = pag.crediarioCashMoves(recebimentos.filter((item) => item.id !== "marcia-orfa")).reduce((sum, item) => sum + item.valor, 0);
  assert.equal(depois, 2931, "estornando a órfã, o caixa cai exatamente os R$ 1.889");
});

// ---------------------------------------------------------------- 31/07/2026
// Dívida paga em PIX/cartão precisa virar faturamento: antes o valor só baixava
// a dívida e não aparecia em lugar nenhum (nem no crediário, nem na P12).
const fin = loadTsModule("src/features/financeiro/financeiroData.ts");

test("CASO DO LUCAS: dívida sem comanda paga em PIX gera comanda e entra no faturamento", () => {
  const sale = fin.saleFromLembretePayment({
    lembreteId: "lem-claudia",
    patientName: "CLAUDIA CEZARINO",
    crmContactRef: "contact-tel-11999998888",
    valor: 3170,
    forma: "PIX",
    dia: "2026-07-31",
  });
  assert.equal(fin.saleTotal(sale), 3170, "o valor entra no faturamento");
  assert.equal(sale.payments[0].method, "PIX", "a forma real é preservada (dá para conciliar com o extrato)");
  assert.equal(sale.items[0].itemType, "OUTRO", "não é venda nova de tratamento: é dívida antiga entrando");
  assert.equal(sale.crmContactRef, "contact-tel-11999998888", "fica ligada ao paciente do CRM");
  assert.match(sale.notes, /dívida/i);
});

test("cada forma de pagamento vira a forma certa na comanda", () => {
  const formas = ["DINHEIRO", "PIX", "CARTAO", "OUTRO"].map(
    (forma) => fin.saleFromLembretePayment({ lembreteId: "l", patientName: "P", valor: 100, forma, dia: "2026-07-31" }).payments[0].method,
  );
  assert.equal(formas.join(","), "DINHEIRO,PIX,CARTAO_CREDITO,TRANSFERENCIA");
});

test("id da comanda é determinístico: enviar duas vezes o mesmo pagamento não duplica faturamento", () => {
  const a = fin.saleRefFromLembretePayment("lem-1", "2026-07-31", 3170);
  const b = fin.saleRefFromLembretePayment("lem-1", "2026-07-31", 3170);
  assert.equal(a, b);
  assert.equal(a, "fsale-lem-lem-1-2026-07-31-317000");
  // valor diferente no mesmo dia = pagamento diferente = comanda diferente
  assert.notEqual(a, fin.saleRefFromLembretePayment("lem-1", "2026-07-31", 500));
});

test("comanda gerada entra no mês do recebimento na P12", () => {
  const sale = fin.saleFromLembretePayment({ lembreteId: "l1", patientName: "Claudia", valor: 3170, forma: "PIX", dia: "2026-07-31" });
  const cats = [{ id: "cat-x", name: "X", groupKey: "CUSTO_FIXO", sortOrder: 1, isCapex: false, active: true }];
  const m = fin.buildP12Matrix([sale], [], cats, 2026, [], []);
  assert.equal(m.revenueMonths[6].total, 3170, "julho");
  assert.equal(m.profitMonths[6], 3170, "e vira lucro, porque não há despesa no mês");
});

test("dívida QUE JÁ TEM comanda não gera outra (senão duplica o faturamento)", () => {
  // A tela decide: com saleRef, o recebimento é só baixa. O caixa do crediário
  // também ignora, exatamente como já era.
  const recebimentos = [
    { id: "r1", lembreteId: "l1", valor: 3170, forma: "PIX", recebidoEm: "2026-07-31", saleRef: "fsale-lem-l1-2026-07-31-317000" },
    { id: "r2", lembreteId: "l2", valor: 500, forma: "DINHEIRO", recebidoEm: "2026-07-31", saleRef: null },
  ];
  assert.deepEqual(pag.crediarioCashMoves(recebimentos).map((r) => r.id), ["r2"]);
});
