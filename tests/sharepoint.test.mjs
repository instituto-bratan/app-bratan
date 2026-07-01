import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSharePointModule() {
  const absolutePath = path.resolve(repoRoot, "src/lib/sharepoint.ts");
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  }).outputText;

  const module = { exports: {} };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, console, Date, JSON, Object, String, Number },
    { filename: absolutePath },
  );
  return module.exports;
}

const sharepoint = loadSharePointModule();

test("comprovante vai para pasta financeiro com ano e mês", () => {
  const folder = sharepoint.sharePointTargetFolder("COMPROVANTE", new Date("2026-07-01T12:00:00.000Z"));
  assert.equal(folder, "Financeiro/Comprovantes/2026/07");
});

test("módulos sem rotação mensal usam pasta fixa", () => {
  assert.equal(sharepoint.sharePointTargetFolder("CRM_DOCUMENTO"), "CRM/Documentos");
  assert.equal(sharepoint.sharePointTargetFolder("POP"), "Operacional/POPs");
  assert.equal(sharepoint.sharePointTargetFolder("RELATORIO_360"), "Gestao/Relatorios 360");
});

test("nome de arquivo remove caracteres proibidos pelo SharePoint", () => {
  assert.equal(sharepoint.sanitizeSharePointFileName('pix: "almoço" <equipe>?.pdf'), "pix- -almoço- -equipe--.pdf");
  assert.equal(sharepoint.sanitizeSharePointFileName("relatorio final. "), "relatorio final");
  assert.equal(sharepoint.sanitizeSharePointFileName(""), "arquivo");
});

test("dispatch inclui pasta destino e caminho completo", () => {
  const item = sharepoint.prepareSharePointDispatch("comp-1", "recibo pix.pdf", "COMPROVANTE", new Date("2026-07-01T12:00:00.000Z"));
  assert.equal(item.provider, "microsoft_graph");
  assert.equal(item.module, "COMPROVANTE");
  assert.equal(item.targetFolder, "Financeiro/Comprovantes/2026/07");
  assert.equal(item.targetPath, "Financeiro/Comprovantes/2026/07/recibo pix.pdf");
  assert.equal(item.status, "pendente");
});
