// EXTRATO DE CADA UM (28/10/2026). Regra do Lucas: "não separe as coisas" — o
// Lucro Inteligente de cada pessoa é uma conta só (salário de sócio + parte de
// médico), lida como extrato de banco. A conta é a do motor: o saldo do extrato
// tem de ser sempre a soma das gavetas do motor (falta − adiantado).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-10-28", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp,
    TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Blob, URL, Response, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const motor = loadTsModule("src/features/financeiro/motorLucroInteligente.ts");
const ex = loadTsModule("src/features/financeiro/extratoDosSocios.ts");
const r2 = (v) => Math.round(v * 100) / 100;
const HOJE = "2026-10-28";

function venda(id, dia, valor, profissional = null, descricao = "Plano de Acompanhamento") {
  return {
    id, saleDate: dia, patientName: "Paciente Ficticio", crmContactRef: "", notes: "", createdAt: "",
    items: [{ id: `${id}-i`, itemType: "TRATAMENTO", amount: valor, description: descricao, profissional }],
    payments: [{ id: `${id}-p`, method: "PIX", amount: valor, installments: 1 }],
  };
}
function pagamento(id, valor, categoryRef, dia, extra = {}) {
  return { id, description: id, amount: valor, dueDate: dia, paidAt: dia, categoryRef, isCapex: false, supplier: "", method: "TRANSFERENCIA", notes: "", ...extra };
}

const SALES = [
  venda("v-set", "2026-09-10", 10000),
  venda("v-out", "2026-10-05", 8000),
  venda("v-out-moises", "2026-10-07", 6000, "moises"),
];
const EXPENSES = [
  pagamento("fexp-inter-2026-10-02-a", 20000, "cat-lucro-inteligente-socios", "2026-10-02", { supplier: "Dr. Daniel Bratan", method: "PIX", notes: "PIX de paciente que caiu direto na conta do sócio" }),
  pagamento("fexp-exec-2026-10-26", 5000, "cat-lucro-inteligente-medico", "2026-10-26", { supplier: "Dr. Daniel Bratan" }),
  pagamento("fexp-andrya-2026-09-30", 25000, "cat-lucro-inteligente-socios", "2026-09-30", { supplier: "Andrya Bratan (sócia)" }),
  pagamento("fexp-andrya-pix-2026-10-14", 3000, "cat-lucro-inteligente-socios", "2026-10-14", { supplier: "Andrya Bratan (sócia)", method: "PIX", notes: "PIX de paciente que caiu direto na conta do sócio" }),
  // Despesa comum não entra em extrato nenhum.
  pagamento("fexp-aluguel", 9000, "cat-aluguel", "2026-10-05", { supplier: "Imobiliária" }),
];

function extrato(pessoa, extra = {}) {
  return ex.extratoDaPessoa({ pessoa, sales: SALES, expenses: EXPENSES, mes: "2026-10", hoje: HOJE, desde: "2025-01", cfg: motor.CONFIG_PADRAO_DO_MOTOR, ...extra });
}

test("o saldo do extrato é a soma das gavetas do motor (salário + parte de médico), sem separar", () => {
  const c = motor.compromissosDoMes({ sales: SALES, expenses: EXPENSES, monthKey: "2026-10", cfg: motor.CONFIG_PADRAO_DO_MOTOR, desde: "2025-01" });
  const socio = (id) => c.socios.porSocio.find((s) => s.socio === id);
  const daniel = extrato("daniel");
  // O que o médico recebeu a mais o motor guarda para a parcela que vence
  // depois; no extrato (conta só) esse excesso abate o salário que falta.
  // Quando a parcela vence, os dois chegam ao mesmo número.
  const guardadoParaDepois = c.executor.proximas.reduce((soma, p) => soma + p.pago, 0);
  assert.ok(guardadoParaDepois > 0, "o cenário precisa ter pagamento adiantado ao médico");
  assert.equal(daniel.saldo, r2(c.executor.faltaNoMes - c.executor.adiantado - guardadoParaDepois + socio("daniel").falta - socio("daniel").adiantado));
  assert.equal(daniel.saldo, r2(daniel.devido - daniel.pago));
  const andrya = extrato("andrya");
  assert.equal(andrya.saldo, r2(socio("andrya").falta - socio("andrya").adiantado));
  // Dr. Daniel: salário de set e out (2 × 15 mil) + parcelas que vencem até 31/10.
  const parcelasAte = motor.parcelasDoExecutor(SALES, "2026-10", motor.CONFIG_PADRAO_DO_MOTOR, "2025-01", "daniel").filter((p) => p.vence <= "2026-10-31");
  assert.equal(daniel.devido, r2(30000 + parcelasAte.reduce((s, p) => s + p.valor, 0)));
  assert.equal(daniel.pago, 25000);
});

test("pagamento lançado na gaveta errada não muda o saldo da pessoa", () => {
  const trocado = EXPENSES.map((e) => (e.id === "fexp-exec-2026-10-26" ? { ...e, categoryRef: "cat-lucro-inteligente-socios" } : e));
  assert.equal(extrato("daniel", { expenses: trocado }).saldo, extrato("daniel").saldo);
});

test("o saldo corre linha a linha e o devido do dia vem antes do pago do mesmo dia", () => {
  const e = extrato("andrya");
  assert.equal(e.lancamentos.at(-1).saldo, e.saldo);
  const dia30set = e.lancamentos.filter((l) => l.dia === "2026-09-30");
  assert.deepEqual(JSON.parse(JSON.stringify(dia30set.map((l) => l.tipo))), ["DEVIDO", "PAGO"]);
  let saldo = 0;
  for (const l of e.lancamentos) {
    saldo = r2(saldo + (l.tipo === "DEVIDO" ? l.valor : -l.valor));
    assert.equal(l.saldo, saldo);
  }
});

test("o que vence depois do mês vai para próximos (2ª parcela do mês e salário do mês que vem)", () => {
  const e = extrato("daniel");
  const titulos = e.proximos.map((p) => p.titulo);
  assert.ok(titulos.some((t) => t.startsWith("Parte de médico: 2ª parcela de outubro")));
  assert.ok(titulos.includes("Salário de novembro"));
  assert.ok(e.proximos.every((p) => p.dia > "2026-10-31"));
  assert.ok(!e.lancamentos.some((l) => l.titulo === "Salário de novembro"));
});

test("de onde veio o dinheiro, em português direto", () => {
  const daniel = extrato("daniel");
  assert.equal(daniel.lancamentos.find((l) => l.id === "fexp-inter-2026-10-02-a").titulo, "Pix de paciente que caiu na conta Inter dele");
  assert.equal(daniel.lancamentos.find((l) => l.id === "fexp-exec-2026-10-26").titulo, "Transferência da conta da clínica");
  const andrya = extrato("andrya");
  assert.equal(andrya.lancamentos.find((l) => l.id === "fexp-andrya-pix-2026-10-14").titulo, "Pix de paciente que caiu na conta dela");
  assert.ok(!andrya.lancamentos.some((l) => l.id === "fexp-aluguel"));
});

test("Dr. Moisés: só os pagamentos dele, parcelas no dia 20 (ou no dia útil antes)", () => {
  const e = extrato("moises", { expenses: [...EXPENSES, pagamento("fexp-moises-1", 100, "cat-lucro-inteligente-moises", "2026-10-20")] });
  assert.equal(e.pago, 100);
  assert.equal(e.devido, 0, "a 1ª parcela de outubro só vence em novembro");
  assert.equal(e.proximos.length, 3);
  for (const p of e.proximos) assert.ok(Number(p.dia.slice(8)) <= 20, p.dia);
});

test("pagamento com data depois de hoje não entra; mês antes do motor fica vazio", () => {
  const futuro = [...EXPENSES, pagamento("fexp-futuro", 1000, "cat-lucro-inteligente-medico", "2026-10-30", { supplier: "Dr. Daniel Bratan" })];
  assert.equal(extrato("daniel", { expenses: futuro }).pago, 25000);
  const antes = extrato("daniel", { mes: "2026-08" });
  assert.equal(antes.lancamentos.length, 0);
  assert.equal(antes.saldo, 0);
});

test("o texto copiado traz o saldo, os lançamentos do mês e os próximos", () => {
  const e = extrato("daniel");
  const texto = ex.textoDoExtrato(e);
  assert.match(texto, /^Extrato do Lucro Inteligente — Dr\. Daniel — outubro de 2026/);
  assert.ok(texto.includes(ex.fraseDoSaldo(e)));
  assert.match(texto, /Próximos:/);
  assert.match(ex.fraseDoSaldo({ falta: 10, adiantado: 0, ate: "2026-10-31", nome: "Andrya" }), /^Falta pagar à Andrya/);
});

test("a frase do cartão diz de onde sai o saldo (venceu − pago), sem repetir o número grande", () => {
  const e = extrato("daniel");
  const frase = ex.fraseDaConta(e);
  assert.match(frase, /^De setembro até 31\/10, venceram R\$\s/);
  assert.ok(frase.includes("foram pagos R$"), frase);
  assert.ok(!frase.includes(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(e.falta)), "não repete o saldo");
  assert.equal(ex.fraseDaConta(extrato("daniel", { mes: "2026-08" })), "Nada venceu nem foi pago até 31/08/2026.");
  // Janeiro mostra o ano do começo, que é o ano anterior.
  assert.match(ex.fraseDaConta(extrato("daniel", { mes: "2027-01", hoje: "2027-01-10" })), /^De setembro de 2026 até 31\/01,/);
});
