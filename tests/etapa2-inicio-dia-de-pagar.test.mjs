// REDESENHO ETAPA 2 · INÍCIO — O DIA DE PAGAR (08/10/2026).
//
// Regra do Lucas: conta que vence em SÁBADO, DOMINGO ou FERIADO é paga no DIA
// ÚTIL ANTERIOR. A Fila do dia das contas (buildFilaFinanceira) classifica
// "vencidas · vence hoje · semana" pelo dia de pagar, e o contador do Início na
// casca (decisoesPendentes) usa a mesma fila — os dois mudam juntos.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-10-08", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
function loadTs(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) {
      const r = request.replace("@/", "src/");
      return loadTs(path.extname(r) ? r : `${r}.ts`);
    }
    if (request.startsWith(".")) {
      const r = path.resolve(path.dirname(absolutePath), request);
      return loadTs(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`));
    }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}

const dia = loadTs("src/features/financeiro/filaFinanceiraDiaDePagar.ts");
const fila = loadTs("src/features/financeiro/filaFinanceira.ts");
const contadores = loadTs("src/layouts/casca/contadores.ts");
const filaDoDia = loadTs("src/features/home/filaDoDia.ts");
const plain = (v) => JSON.parse(JSON.stringify(v));

const conta = (id, valor, dueDate, extra = {}) => ({
  id, description: id, amount: valor, dueDate, paidAt: null, categoryRef: "cat-fixo", method: "PIX", supplier: "",
  installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "", createdAt: "2026-10-01T10:00:00.000Z", ...extra,
});

test("diaDePagar: sábado → sexta; domingo → sexta; feriado na segunda → sexta; feriado na sexta → quinta; dia útil → ele mesmo", () => {
  assert.equal(dia.diaDePagar("2026-10-10"), "2026-10-09", "sábado 10/10 → sexta 09/10");
  assert.equal(dia.diaDePagar("2026-10-11"), "2026-10-09", "domingo 11/10 → sexta 09/10");
  assert.equal(dia.diaDePagar("2026-10-12"), "2026-10-09", "segunda 12/10 é feriado (Nossa Senhora Aparecida) → sexta 09/10");
  assert.equal(dia.diaDePagar("2026-11-20"), "2026-11-19", "sexta 20/11 é feriado (Consciência Negra) → quinta 19/11");
  assert.equal(dia.diaDePagar("2026-04-03"), "2026-04-02", "Sexta-feira Santa → quinta");
  assert.equal(dia.diaDePagar("2027-07-09"), "2027-07-08", "sexta 09/07/2027, feriado de São Paulo → quinta");
  assert.equal(dia.diaDePagar("2026-10-08"), "2026-10-08", "quinta comum: ele mesmo");
  assert.equal(dia.diaDePagar("2026-10-09"), "2026-10-09", "sexta comum: ele mesmo");
  assert.equal(dia.diaDePagar("2026-10-13"), "2026-10-13", "terça depois do feriado: ele mesmo");
});

test("diaDePagar: Carnaval e feriado emendado com o fim de semana voltam ao último dia útil", () => {
  // Carnaval 2026: segunda 16/02 e terça 17/02 (o banco não abre) → sexta 13/02.
  assert.equal(dia.diaDePagar("2026-02-17"), "2026-02-13");
  assert.equal(dia.diaDePagar("2026-02-15"), "2026-02-13", "domingo antes do Carnaval");
  // Aniversário de São Paulo em 2027 cai numa segunda: o domingo e a segunda pagam na sexta 22/01.
  assert.equal(dia.diaDePagar("2027-01-25"), "2027-01-22");
  // Ano novo 2027 (sexta) → quinta 31/12/2026.
  assert.equal(dia.diaDePagar("2027-01-01"), "2026-12-31");
  // Sem data: volta como veio.
  assert.equal(dia.diaDePagar(""), "");
});

test("o motivo em português direto: sábado, domingo ou feriado", () => {
  assert.equal(dia.motivoDePagarAntes("2026-10-10"), "vence no sábado, 10/10");
  assert.equal(dia.motivoDePagarAntes("2026-10-11"), "vence no domingo, 11/10");
  assert.equal(dia.motivoDePagarAntes("2026-10-12"), "vence no feriado, 12/10");
  assert.equal(dia.motivoDePagarAntes("2026-10-09"), null);
  assert.equal(dia.ehDiaUtilDePagamento("2026-07-09"), false, "09/07 é feriado em São Paulo");
  assert.equal(dia.ehDiaUtilDePagamento("2026-07-10"), true);
});

test("fila das contas: a conta de sábado 10/10 é 'pagar hoje' na sexta 09/10 e só fica vencida depois", () => {
  const contas = [conta("aluguel", 18900, "2026-10-10"), conta("contabilidade", 1650, "2026-10-11"), conta("vivo", 289.9, "2026-10-12"), conta("bios", 3150, "2026-10-09")];

  // Quinta 08/10: as quatro são pagas na sexta → próximos 7 dias.
  const quinta = fila.buildFilaFinanceira({ expenses: contas, purchases: [], hoje: "2026-10-08", limiteAprovacao: 0 });
  assert.deepEqual(plain(quinta.vencemHoje.map((i) => i.titulo)), []);
  assert.deepEqual(plain(quinta.semana.map((i) => i.titulo)), ["bios", "aluguel", "contabilidade", "vivo"]);
  assert.deepEqual(plain(quinta.semana.map((i) => i.pagarEm)), ["2026-10-09", "2026-10-09", "2026-10-09", "2026-10-09"]);

  // Sexta 09/10: todas viram "pagar hoje"; o vencimento original continua em `data`.
  const sexta = fila.buildFilaFinanceira({ expenses: contas, purchases: [], hoje: "2026-10-09", limiteAprovacao: 0 });
  assert.deepEqual(plain(sexta.vencemHoje.map((i) => i.titulo).sort()), ["aluguel", "bios", "contabilidade", "vivo"]);
  assert.equal(sexta.vencidas.length, 0);
  const aluguel = sexta.vencemHoje.find((i) => i.titulo === "aluguel");
  assert.equal(aluguel.data, "2026-10-10");
  assert.equal(aluguel.pagarEm, "2026-10-09");
  assert.equal(aluguel.pagaAntes, "vence no sábado, 10/10");
  assert.equal(sexta.vencemHoje.find((i) => i.titulo === "bios").pagaAntes, null);
  assert.match(sexta.resumo, /^pagar hoje 4 \(R\$\s?23\.990\; 3 vencem no fim de semana ou feriado\)$/);

  // Sábado 10/10 e terça 13/10: passou o dia de pagar → vencidas.
  const sabado = fila.buildFilaFinanceira({ expenses: contas, purchases: [], hoje: "2026-10-10", limiteAprovacao: 0 });
  assert.deepEqual(plain(sabado.vencidas.map((i) => i.titulo).sort()), ["aluguel", "bios", "contabilidade", "vivo"]);
  assert.equal(sabado.vencemHoje.length, 0);
  const terca = fila.buildFilaFinanceira({ expenses: contas, purchases: [], hoje: "2026-10-13", limiteAprovacao: 0 });
  assert.equal(terca.vencidas.length, 4);
});

test("a casca conta pela mesma régua: na sexta 09/10 o Início soma as contas do fim de semana e do feriado", () => {
  const contas = [conta("aluguel", 18900, "2026-10-10"), conta("vivo", 289.9, "2026-10-12"), conta("longe", 500, "2026-10-14")];
  const base = {
    pedidos: [], aprovaPedidos: false, contas, pagaContas: true, aprovaContas: false, limiteAprovacao: 0,
    confereFechamento: false, comandas: [], conferencias: [],
  };
  assert.equal(contadores.decisoesPendentes({ ...base, hoje: "2026-10-08" }).contas, 0, "quinta: ainda não é o dia de pagar");
  assert.equal(contadores.decisoesPendentes({ ...base, hoje: "2026-10-09" }).contas, 2, "sexta: aluguel (sábado) + Vivo (feriado)");
  assert.equal(contadores.decisoesPendentes({ ...base, hoje: "2026-10-13" }).contas, 2, "terça: as duas ficaram vencidas e continuam contando");
  assert.equal(contadores.decisoesPendentes({ ...base, hoje: "2026-10-14" }).contas, 3, "quarta: a de quarta vence hoje");
});

test("Fila do dia da Home: a conta puxada para hoje diz por quê", () => {
  const fin = fila.buildFilaFinanceira({ expenses: [conta("aluguel", 18900, "2026-10-10")], purchases: [], hoje: "2026-10-09", limiteAprovacao: 0 });
  const f = filaDoDia.buildFilaDoDia({ hoje: "2026-10-09", financeira: fin });
  const item = f.itens.find((i) => i.chave === "conta:aluguel");
  assert.equal(item.urgencia, 1);
  assert.match(item.detalhe, /^vence no sábado, 10\/10 · pagar hoje/);
  // No sábado ela já devia ter sido paga, mas ainda não "venceu" de fato.
  const finSabado = fila.buildFilaFinanceira({ expenses: [conta("aluguel", 18900, "2026-10-10")], purchases: [], hoje: "2026-10-10", limiteAprovacao: 0 });
  const sabado = filaDoDia.buildFilaDoDia({ hoje: "2026-10-10", financeira: finSabado }).itens.find((i) => i.chave === "conta:aluguel");
  assert.equal(sabado.urgencia, 0);
  assert.match(sabado.detalhe, /^era para pagar 09\/10 · vence no sábado, 10\/10/);
  const finSegunda = fila.buildFilaFinanceira({ expenses: [conta("aluguel", 18900, "2026-10-10")], purchases: [], hoje: "2026-10-13", limiteAprovacao: 0 });
  const terca = filaDoDia.buildFilaDoDia({ hoje: "2026-10-13", financeira: finSegunda }).itens.find((i) => i.chave === "conta:aluguel");
  assert.match(terca.detalhe, /^venceu 10\/10/);
});
