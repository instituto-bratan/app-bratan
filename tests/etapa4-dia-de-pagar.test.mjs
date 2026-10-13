// REDESENHO ETAPA 4 · O DIA DE PAGAR EM TODO O APP (08/10/2026).
//
// Regra do Lucas: conta que vence em SÁBADO, DOMINGO ou FERIADO é paga no DIA
// ÚTIL ANTERIOR. Na etapa 2 ela valia só na Fila do dia (Início e Contas a
// Pagar). Agora vale em todo lugar onde o vencimento decide "vencida" ou "a
// pagar": a semana em números do Painel e o caixa projetado do Lucro Inteligente.
// 13/10/2026 (revisão): os lembretes de pagamento do PACIENTE nos Recebíveis 360
// NÃO seguem essa régua — vencem na data combinada (teste abaixo).
//
// Calendário usado: sexta 09/10/2026 · sábado 10/10 · domingo 11/10 · segunda
// 12/10 é feriado (Nossa Senhora Aparecida) · terça 13/10 dia útil.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.join(repoRoot, relativo), "utf8");

/**
 * Carregador com relógio parado: `new Date()` sem argumento devolve `agora`
 * (o espelho local dos lembretes lê o dia do relógio do aparelho).
 */
function carregador(agoraISO) {
  const cache = new Map();
  const Real = Date;
  class DataParada extends Real {
    constructor(...args) {
      super(...(args.length ? args : [new Real(`${agoraISO}T10:00:00`).getTime()]));
    }
    static now() {
      return new Real(`${agoraISO}T10:00:00`).getTime();
    }
  }
  const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => agoraISO, writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
  function loadTs(arquivo) {
    const absoluto = path.resolve(repoRoot, arquivo);
    if (cache.has(absoluto)) return cache.get(absoluto).exports;
    const saida = ts.transpileModule(fs.readFileSync(absoluto, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    cache.set(absoluto, module);
    const exigir = (pedido) => {
      if (pedido === "@/lib/localStore") return localStoreStub;
      if (pedido.startsWith("@/")) {
        const r = pedido.replace("@/", "src/");
        return loadTs(path.extname(r) ? r : `${r}.ts`);
      }
      if (pedido.startsWith(".")) {
        const r = path.resolve(path.dirname(absoluto), pedido);
        return loadTs(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`));
      }
      throw new Error(`import inesperado: ${pedido}`);
    };
    vm.runInNewContext(saida, {
      module, exports: module.exports, require: exigir, console, Date: DataParada, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
    }, { filename: absoluto });
    return module.exports;
  }
  return loadTs;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const conta = (id, valor, dueDate, extra = {}) => ({
  id, description: id, amount: valor, dueDate, paidAt: null, categoryRef: "cat-fixo", method: "BOLETO", supplier: "",
  installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "2026-10-01T10:00:00.000Z", ...extra,
});

const loadTs = carregador("2026-10-08");
const dia = loadTs("src/features/financeiro/filaFinanceiraDiaDePagar.ts");
const semana = loadTs("src/features/financeiro/semanaEmNumeros.ts");
const caixa = loadTs("src/features/financeiro/caixaProjetado.ts");

test("passouDoDiaDePagar: a do sábado passa no sábado (dia de pagar = sexta), não na sexta; sem data nunca passa", () => {
  assert.equal(dia.passouDoDiaDePagar("2026-10-10", "2026-10-09"), false, "sexta 09/10 É o dia de pagar a do sábado");
  assert.equal(dia.passouDoDiaDePagar("2026-10-10", "2026-10-10"), true, "no sábado ela já passou do dia de pagar");
  assert.equal(dia.passouDoDiaDePagar("2026-10-12", "2026-10-10"), true, "a do feriado de segunda 12/10 se pagava na sexta 09/10");
  assert.equal(dia.passouDoDiaDePagar("2026-10-13", "2026-10-12"), false, "terça é dia útil: vale o vencimento");
  assert.equal(dia.passouDoDiaDePagar("2026-10-13", "2026-10-14"), true);
  assert.equal(dia.passouDoDiaDePagar("2026-10-10T00:00:00", "2026-10-10T15:00:00.000Z"), true, "aceita data com hora");
  for (const vazio of ["", null, undefined, "sem data"]) assert.equal(dia.passouDoDiaDePagar(vazio, "2026-10-10"), false);
});

test("semana em números: 'contas vencidas em aberto' conta pelo dia de pagar", () => {
  const entrada = (hoje, expenses) => ({ hoje, sales: [], expenses, crmTasks: [], npsRespostas: [], nomes: {} });
  const contas = [
    conta("aluguel-sabado", 5000, "2026-10-10"),
    conta("luz-feriado", 300, "2026-10-12"),
    conta("agua-terca", 200, "2026-10-13"),
    conta("paga", 999, "2026-10-10", { paidAt: "2026-10-09T12:00:00Z" }),
  ];
  // Sexta 09/10: o aluguel do sábado e a luz do feriado são para HOJE — ainda não venceram.
  const sexta = semana.buildSemanaEmNumeros(entrada("2026-10-09", contas));
  const vSexta = sexta.numeros.find((n) => n.chave === "vencidas");
  assert.equal(vSexta.valor, "0");
  assert.equal(vSexta.frase, "nenhuma conta passou do dia de pagar.");
  assert.equal(vSexta.tom, "BOM");
  // Sábado 10/10: as duas passaram do dia de pagar (sexta); a água de terça não; a paga nunca.
  const sabado = semana.buildSemanaEmNumeros(entrada("2026-10-10", contas));
  const vSabado = sabado.numeros.find((n) => n.chave === "vencidas");
  assert.equal(vSabado.valor, "2", "pelo vencimento cru seria 0: o sábado e a segunda ainda não chegaram");
  assert.match(vSabado.frase, /^somam R\$\s5\.300 /);
  assert.equal(vSabado.tom, "ATENCAO");
  assert.match(sabado.frase, /2 contas vencidas em aberto/);
});

test("semana em números: as vencidas usam os filtros da Fila do dia (sem provisão, só os últimos 90 dias)", () => {
  // 13/10/2026 (revisão da etapa 4): Painel = Fila = contador do Início.
  const entrada = (hoje, expenses) => ({ hoje, sales: [], expenses, crmTasks: [], npsRespostas: [], nomes: {} });
  const contas = [
    conta("aluguel", 8000, "2026-10-10"),
    conta("provisao", 500, "2026-10-05", { categoryRef: "cat-poup-impostos" }),
    conta("antiga", 300, "2026-06-30"),
  ];
  const v = semana.buildSemanaEmNumeros(entrada("2026-10-13", contas)).numeros.find((n) => n.chave === "vencidas");
  assert.equal(v.valor, "1", "só o aluguel: provisão é reserva e a de 30/06 passou da janela de 90 dias");
  assert.match(v.frase, /^somam R\$\s8\.000 /);
});

test("caixa projetado: a saída cai no dia de pagar (feriado de segunda sai na sexta, na semana certa)", () => {
  const hoje = "2026-10-05"; // segunda; semana 1 = 05 a 11/10, semana 2 = 12 a 18/10
  const expenses = [
    conta("luz-feriado", 300, "2026-10-12"), // feriado → sexta 09/10, semana 1
    conta("aluguel-domingo", 5000, "2026-10-18"), // domingo → sexta 16/10, semana 2
    conta("agua-segunda", 200, "2026-10-19"), // segunda útil, fora do horizonte de 2 semanas
  ];
  const c = caixa.buildCaixaProjetado({ sales: [], expenses, hoje, semanas: 2, saldoInicial: 10000 });
  const eventos = plain(c.semanas.flatMap((s) => s.eventos));
  const de = (id) => eventos.find((e) => e.label.startsWith(id));
  assert.equal(de("luz-feriado").dia, "2026-10-09");
  assert.equal(de("luz-feriado").tipo, "CONTA");
  assert.equal(c.semanas[0].saidas, 300, "pelo vencimento cru a luz cairia na semana 2");
  assert.equal(de("aluguel-domingo").dia, "2026-10-16");
  assert.equal(c.semanas[1].saidas, 5000);
  assert.equal(de("agua-segunda"), undefined);
  assert.equal(c.totais.saidas, 5300);

  // Uma semana só (05 a 11/10): a luz do feriado 12/10 está FORA pelo vencimento, DENTRO pelo dia de pagar.
  const curto = caixa.buildCaixaProjetado({ sales: [], expenses, hoje, semanas: 1, saldoInicial: 0 });
  assert.equal(curto.semanas[0].saidas, 300);
});

test("caixa projetado: no sábado, a conta do sábado já passou do dia de pagar e cai hoje como vencida", () => {
  const hoje = "2026-10-10";
  const expenses = [conta("aluguel", 5000, "2026-10-10"), conta("antiga", 120, "2026-10-05"), conta("luz-feriado", 300, "2026-10-12")];
  const c = caixa.buildCaixaProjetado({ sales: [], expenses, hoje, semanas: 1, saldoInicial: 0 });
  const eventos = plain(c.semanas[0].eventos);
  const aluguel = eventos.find((e) => e.label.startsWith("aluguel"));
  assert.equal(aluguel.tipo, "CONTA_VENCIDA");
  assert.equal(aluguel.dia, hoje);
  assert.match(aluguel.label, /passou do dia de pagar, 09\/10/);
  const antiga = eventos.find((e) => e.label.startsWith("antiga"));
  assert.match(antiga.label, /vencida em 05\/10/, "a que já venceu continua dizendo quando venceu");
  const luz = eventos.find((e) => e.label.startsWith("luz-feriado"));
  assert.equal(luz.tipo, "CONTA_VENCIDA", "a do feriado de segunda se pagava na sexta 09/10");
});

test("caixa projetado: a mensal ainda não lançada entra no dia de pagar do mês seguinte (e cai hoje se ele já passou)", () => {
  const mensal = conta("aluguel", 5000, "2026-10-01", { paidAt: "2026-10-01", recorrencia: "MENSAL" });
  // 01/11/2026 é domingo → paga na sexta 30/10.
  const c = caixa.buildCaixaProjetado({ sales: [], expenses: [mensal], hoje: "2026-10-26", semanas: 1, saldoInicial: 0 });
  const ev = plain(c.semanas[0].eventos).find((e) => e.tipo === "CONTA_MENSAL");
  assert.equal(ev.dia, "2026-10-30");
  // No sábado 31/10 o dia de pagar (30/10) ficou para trás: a saída cai hoje em vez de sumir.
  const sabado = caixa.buildCaixaProjetado({ sales: [], expenses: [mensal], hoje: "2026-10-31", semanas: 1, saldoInicial: 0 });
  const ev2 = plain(sabado.semanas[0].eventos).find((e) => e.tipo === "CONTA_MENSAL");
  assert.equal(ev2.dia, "2026-10-31");
  assert.equal(sabado.totais.saidas, 5000);
});

test("lembretes de pagamento nos Recebíveis 360 seguem o dia COMBINADO com o paciente (sem dia de pagar)", () => {
  // 13/10/2026 (revisão da etapa 4): a régua do dia de pagar é das contas que a
  // clínica paga. O que o PACIENTE deve vence na data combinada, igual à tela de
  // Lembretes (isPagamentoVencido). Remoto e espelho local iguais.
  const remoto = ler("src/lib/remoteData.ts");
  const corpo = remoto.slice(remoto.indexOf("function remotePagamentoReceivableStatus"), remoto.indexOf("function remotePagamentoReceivableCollectionStatus"));
  assert.doesNotMatch(corpo, /passouDoDiaDePagar|diaDePagar/, "recebível não usa o dia de pagar");
  assert.doesNotMatch(ler("src/features/pagamentos/pagamentosData.ts"), /passouDoDiaDePagar|diaDePagar/);

  // O espelho local, com o relógio parado no sábado 10/10.
  const pagamentos = carregador("2026-10-10")("src/features/pagamentos/pagamentosData.ts");
  const lembrete = (id, dataPrevista, status = "aberto") => ({ id, pacienteNome: "Paciente", valorPendente: 800, dataPrevista, status, criadoPor: "x", criadoEm: "2026-10-01T10:00:00.000Z" });
  assert.equal(pagamentos.receivableFromPagamento(lembrete("a", "2026-10-10")).status, "OPEN", "sábado combinado: no próprio sábado ainda está em aberto");
  assert.equal(pagamentos.receivableFromPagamento(lembrete("b", "2026-10-12")).status, "OPEN", "feriado de segunda: não vence antes da data combinada");
  assert.equal(pagamentos.receivableFromPagamento(lembrete("c", "2026-10-09")).status, "OVERDUE", "passou da data combinada");
  assert.equal(pagamentos.receivableFromPagamento(lembrete("d", "2026-10-05", "pago")).status, "PAID");
  assert.equal(pagamentos.receivableFromPagamento(lembrete("e", "2026-10-05", "cancelado")).status, "CANCELED");
  // Só depois da data combinada vira vencido.
  const naTerca = carregador("2026-10-13")("src/features/pagamentos/pagamentosData.ts");
  assert.equal(naTerca.receivableFromPagamento(lembrete("a", "2026-10-10")).status, "OVERDUE");
  assert.equal(naTerca.receivableFromPagamento(lembrete("b", "2026-10-12")).status, "OVERDUE");
  // E bate com a lista de Lembretes.
  for (const d of ["2026-10-09", "2026-10-10", "2026-10-12", "2026-10-13"]) {
    const r = lembrete("x", d);
    assert.equal(pagamentos.receivableFromPagamento(r).status === "OVERDUE", pagamentos.isPagamentoVencido(r), d);
  }
});

test("nenhum lugar do app decide 'vencida' pelo vencimento cru das contas", () => {
  // As telas e motores que separam vencida / a pagar usam diaDePagar ou passouDoDiaDePagar.
  const motores = {
    "src/features/financeiro/semanaEmNumeros.ts": /passouDoDiaDePagar\(e\.dueDate, hoje\)/,
    "src/features/financeiro/caixaProjetado.ts": /const pagar = diaDePagar\(e\.dueDate\)/,
    "src/features/financeiro/filaFinanceira.ts": /pagar < hoje/,
    "src/features/financeiro/FinanceiroContasPage.tsx": /diaDePagar\(expense\.dueDate\) < now/,
  };
  for (const [arquivo, regra] of Object.entries(motores)) assert.match(ler(arquivo), regra, arquivo);
  const cru = /\b(?:e|expense|conta)\.dueDate\s*<\s*(?:hoje|today|now)\b/;
  for (const arquivo of [...Object.keys(motores), "src/features/financeiro/financeiroData.ts", "src/lib/remoteData.ts"]) {
    // a única comparação crua que sobra é a do rótulo ("vencida em …" × "passou do dia de pagar")
    const linhas = ler(arquivo).split("\n").filter((linha) => cru.test(linha) && !/porQue/.test(linha));
    assert.deepEqual(linhas, [], `${arquivo} compara o vencimento cru`);
  }
});
