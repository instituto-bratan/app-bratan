// NOTA FISCAL DA CONTA A PAGAR (12/08/2026, pedido do Lucas): anexar a nota do
// fornecedor na conta e mandar para a pasta do SharePoint, igual ao comprovante.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-12", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
    TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer, Blob, URL, Response, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const fin = loadTsModule("src/features/financeiro/financeiroData.ts");
const sp = loadTsModule("src/lib/sharepoint.ts");

const conta = (id, descricao, notaStatus, dueDate = "2026-08-15") => ({
  id, description: descricao, categoryRef: "cat-x", amount: 100, dueDate, paidAt: null, method: "PIX",
  supplier: "", installmentNum: null, installmentTotal: null, documentNote: "", isCapex: false, notes: "",
  createdAt: "", recorrencia: null, notaStatus,
});

test("a pasta da nota fica junto do comprovante, com ano/mês", () => {
  const pasta = sp.sharePointTargetFolder("NOTA_FISCAL_DESPESA", new Date("2026-08-12T12:00:00Z"));
  assert.equal(pasta, "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS RECEBIDAS/2026/08");
  // O comprovante continua onde estava — não mexi na pasta dele.
  assert.equal(sp.sharePointTargetFolder("COMPROVANTE", new Date("2026-08-12T12:00:00Z")), "NOTA FISCAL E COMPROVANTES/2026/08");
});

test("o nome do arquivo é saneado para o SharePoint", () => {
  assert.equal(sp.sanitizeSharePointFileName('BIOS FARMA: nota "01/02".pdf'), "BIOS FARMA- nota -01-02-.pdf");
  assert.equal(sp.sanitizeSharePointFileName(""), "arquivo");
});

test("só PENDENTE entra no aviso de nota faltando", () => {
  const contas = [
    conta("a", "BIOS FARMACEUTICA", "PENDENTE"),
    conta("b", "VICTALAB", "ANEXADA"),
    conta("c", "SALARIO EQUIPE", "SEM_NOTA"),
    conta("d", "STIN PHARMA", "AGUARDANDO"),
    conta("e", "conta antiga", undefined),
  ];
  const faltando = fin.contasSemNota(contas);
  assert.equal(faltando.length, 2, "a PENDENTE e a sem status (que é pendente por padrão)");
  assert.deepEqual(faltando.map((item) => item.id).sort().join(","), "a,e");
});

test("o aviso respeita o mês escolhido", () => {
  const contas = [conta("a", "julho", "PENDENTE", "2026-07-10"), conta("b", "agosto", "PENDENTE", "2026-08-10")];
  assert.equal(fin.contasSemNota(contas, "2026-08").length, 1);
  assert.equal(fin.contasSemNota(contas, "2026-08")[0].id, "b");
  assert.equal(fin.contasSemNota(contas).length, 2, "sem mês, todas");
});

test("os rótulos falam a língua de quem usa", () => {
  assert.equal(fin.finNotaStatusLabels.PENDENTE, "Falta a nota");
  assert.equal(fin.finNotaStatusLabels.ANEXADA, "Nota anexada");
  assert.equal(fin.finNotaStatusLabels.AGUARDANDO, "Fornecedor vai mandar");
  assert.equal(fin.finNotaStatusLabels.SEM_NOTA, "Não gera nota");
});

test("a conta mais recente aparece primeiro no aviso", () => {
  const contas = [conta("a", "antiga", "PENDENTE", "2026-08-01"), conta("b", "nova", "PENDENTE", "2026-08-20")];
  assert.equal(fin.contasSemNota(contas)[0].id, "b");
});
