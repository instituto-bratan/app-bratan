// EXPORTAR ONDE O DADO MORA (25/08/2026). O Lucas: "eu lembro que eu te pedi
// para que houvesse botões para exportar tanto compras quanto fechamento,
// contas a pagar... do quanto que entrou e saiu de poupança. Eu não estou
// achando isso."
//
// Ele não estava louco: as planilhas existiam, mas TODAS num card no fim do
// Painel do Mês. E a de COMPRAS não existia mesmo.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (relativo) => fs.readFileSync(path.resolve(repoRoot, relativo), "utf8");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-25", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const cx = loadTsModule("src/features/financeiro/contabilidadeXlsx.ts");

const compra = (dia, descricao, valor, extra = {}) => ({
  id: `fbuy-${dia}-${valor}`, purchaseDate: dia, description: descricao, supplier: "Fornecedor", amount: valor,
  method: "BOLETO", card: null, installments: 1, nfNote: "", deliveryEta: null, receivedAt: null,
  expenseRef: null, notes: "", createdAt: `${dia}T10:00:00.000Z`, ...extra,
});
const dadosVazios = { sales: [], expenses: [], categories: [], savingsMoves: [], crediarioProfits: [], monthKey: "2026-08" };

test("existe planilha de COMPRAS (era a que faltava)", () => {
  const chaves = cx.planilhasContabilidade.map((p) => p.chave);
  assert.ok(chaves.includes("compras"), `faltou compras — tem: ${chaves.join(", ")}`);
  // E as que o Lucas citou continuam lá.
  for (const chave of ["contas-a-pagar", "poupanca", "recebimentos", "valor-faturado"]) {
    assert.ok(chaves.includes(chave), `${chave} tem de continuar existindo`);
  }
});

test("a aba de compras soma o mês certo e separa o crédito", () => {
  const aba = cx.abaCompras({
    ...dadosVazios,
    purchases: [
      compra("2026-08-05", "Material de enfermagem", 793.32, { method: "PIX" }),
      compra("2026-08-21", "Insumos", 773.57, { method: "CARTAO_CREDITO", card: "ITAU" }),
      compra("2026-07-30", "Fora do mês", 999.99),
    ],
  });
  assert.equal(aba.rows.length, 2, "julho fica fora");
  assert.equal(Number(aba.totalRow[5]), 1566.89);
  assert.match(String(aba.totalRow[3]), /773,57/, "o total diz quanto foi no crédito");
  assert.match(aba.subtitle, /não somar duas vezes/i, "avisa que compras é controle");
});

test("a aba do cofre separa o que entrou do que saiu", () => {
  const aba = cx.abaPoupanca({
    ...dadosVazios,
    savingsMoves: [
      { id: "1", moveDate: "2026-08-10", direction: "ENTRADA", amount: 40000, reason: "resgate CDB", kind: "USO_OBRA" },
      { id: "2", moveDate: "2026-08-12", direction: "SAIDA", amount: 1250, reason: "drywall", kind: "USO_OBRA" },
      { id: "3", moveDate: "2026-07-01", direction: "ENTRADA", amount: 500, reason: "fora do mês", kind: "APORTE" },
    ],
  });
  assert.equal(aba.rows.length, 2);
  assert.equal(Number(aba.totalRow[4]), 40000, "entrou");
  assert.equal(Number(aba.totalRow[5]), 1250, "saiu");
});

test("compra sem purchases não explode (chamadas antigas seguem válidas)", () => {
  const aba = cx.abaCompras(dadosVazios);
  assert.equal(aba.rows.length, 0);
  assert.equal(Number(aba.totalRow[5]), 0);
});

test("cada tela tem o seu botão, do lado do dado", () => {
  const alvos = [
    ["src/features/financeiro/FinanceiroComprasPage.tsx", "compras"],
    ["src/features/financeiro/FinanceiroContasPage.tsx", "contas-a-pagar"],
    ["src/features/financeiro/FinanceiroPoupancaPage.tsx", "poupanca"],
    ["src/features/financeiro/FinanceiroLancarDiaPage.tsx", "recebimentos"],
  ];
  for (const [arquivo, chave] of alvos) {
    const fonte = ler(arquivo);
    assert.ok(/<BaixarPlanilhaButton/.test(fonte), `${arquivo} precisa do botão`);
    assert.ok(new RegExp(`chave="${chave}"`).test(fonte), `${arquivo} precisa exportar ${chave}`);
    assert.ok(/purchases: financeiro\.purchases/.test(fonte), `${arquivo} tem de passar as compras`);
  }
});

test("o botão não deixa baixar planilha vazia", () => {
  const fonte = ler("src/features/financeiro/BaixarPlanilhaButton.tsx");
  assert.ok(/disabled=\{quantas === 0\}/.test(fonte), "desabilita quando não há linha");
  assert.ok(/Nada em \$\{monthKeyLabel/.test(fonte), "e explica por quê no title");
});
