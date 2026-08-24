// O FECHAMENTO TEM DE VIRAR COMANDA (25/08/2026) — dois bugs relatados pelo
// Lucas: (1) "o fechamento não está indo pro Lançar dia, só pros comprovantes";
// (2) "quando o paciente não fechou, não tem onde anexar comprovante nem o
// quanto ele pagou". Casos reais em produção: fechamentos de R$ 12.255 e
// R$ 10.520 gravados em 24/08 com "recebido = 0" e sem comanda nenhuma.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const rec = loadTsModule("src/features/crm/recebimentoKanbanData.ts");
const parse = (texto) => Number(String(texto).replace(/\./g, "").replace(",", ".")) || 0;
const parcela = (forma, valorTexto = "") => ({ forma, valorTexto, parcelas: "1" });

test("valor em branco COM comprovante anexado é bloqueado (era o furo silencioso)", () => {
  const trava = rec.travaDoValorRecebido({ valor: 0, quantosArquivos: 1, divisao: [parcela("PIX")], parse });
  assert.ok(trava, "tem de bloquear");
  assert.match(trava, /Quanto entrou/);
  assert.match(trava, /comprovante se perde/);
});

test("valor em branco COM as formas preenchidas é bloqueado, dizendo quanto somam", () => {
  const trava = rec.travaDoValorRecebido({
    valor: 0,
    quantosArquivos: 0,
    divisao: [parcela("PIX", "2.000,00"), parcela("CARTAO_CREDITO", "1.500,00")],
    parse,
  });
  assert.ok(trava);
  assert.match(trava, /3\.500,00/);
});

test("cadastro sem dinheiro nenhum continua passando (não estorva quem só abre o card)", () => {
  assert.equal(rec.travaDoValorRecebido({ valor: 0, quantosArquivos: 0, divisao: [parcela("PIX")], parse }), null);
});

test("com valor preenchido a trava sai da frente", () => {
  assert.equal(rec.travaDoValorRecebido({ valor: 900, quantosArquivos: 1, divisao: [parcela("PIX")], parse }), null);
});

// ---- as duas garantias que moram na tela (guardadas por leitura da fonte) ----

test("o bloco de recebimento aparece TAMBÉM quando o paciente não fechou", () => {
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  const doNaoFechou = fonte.slice(fonte.indexOf("Objeção / motivo (obrigatório)"));
  assert.ok(
    /<RecebimentoNoKanban/.test(doNaoFechou.slice(0, 2500)),
    "o ramo do NÃO FECHOU precisa do bloco de recebimento (consulta paga)",
  );
  assert.ok(/Pagou alguma coisa\?/.test(fonte), "com título próprio, não o de fechamento");
});

test("a comanda é lançada por VALOR RECEBIDO, não pelo resultado do fechamento", () => {
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  assert.ok(
    /\/\/ NÃO FECHOU TAMBÉM PAGA[\s\S]{0,200}if \(receivedAmount > 0\) \{/.test(fonte),
    'o gate virou "recebeu?" em vez de "fechou?"',
  );
  assert.ok(!/fcResultado !== "NAO_FECHOU" && receivedAmount > 0/.test(fonte), "o gate antigo saiu");
});

test("o comprovante nunca é descartado — nem no caminho do dinheiro", () => {
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  const antesDoReturn = fonte.slice(0, fonte.indexOf("return { saleId: null, valorDinheiro, valorComanda: 0 };"));
  assert.ok(
    antesDoReturn.lastIndexOf("subirComprovantes({") > antesDoReturn.lastIndexOf("if (valorComanda <= 0) {"),
    "o upload tem de acontecer ANTES da saída do caminho em dinheiro",
  );
});

test("falha de gravação da comanda avisa a pessoa (não fica só no console)", () => {
  const hook = fs.readFileSync(path.resolve(repoRoot, "src/features/financeiro/useFinanceiro.ts"), "utf8");
  assert.ok(/function addSale\(sale: FinSale, onFalha\?/.test(hook), "addSale aceita o aviso de falha");
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/CrmKanbanPage.tsx"), "utf8");
  assert.ok(/A COMANDA NÃO FOI GRAVADA/.test(fonte));
  assert.ok(/O DINHEIRO NÃO ENTROU NO CAIXA/.test(fonte));
});

test("todayISO usa o dia LOCAL — às 21h no Brasil não pode virar amanhã", () => {
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/lib/localStore.ts"), "utf8");
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(fonte.slice(fonte.indexOf("export function todayISO"))), "sem UTC");
  assert.ok(/getFullYear\(\)/.test(fonte) && /getMonth\(\)/.test(fonte) && /getDate\(\)/.test(fonte));
});
