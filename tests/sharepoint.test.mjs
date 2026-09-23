import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

// 23/09/2026: o módulo passou a importar a regra de pasta por tipo (PDF/XML), então o
// carregador próprio (sem require) deu lugar ao helper que resolve imports.
const sharepoint = await loadTs("src/lib/sharepoint.ts");


test("comprovante vai para pasta financeiro com ano e mês", () => {
  const folder = sharepoint.sharePointTargetFolder("COMPROVANTE", new Date("2026-07-01T12:00:00.000Z"));
  assert.equal(folder, "NOTA FISCAL E COMPROVANTES/2026/07");
});

test("módulos sem rotação mensal usam pasta fixa", () => {
  assert.equal(sharepoint.sharePointTargetFolder("CRM_DOCUMENTO"), "CRM - Documentos");
  assert.equal(sharepoint.sharePointTargetFolder("POP"), "POPs");
  assert.equal(sharepoint.sharePointTargetFolder("RELATORIO_360"), "RELATORIOS 360");
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
  assert.equal(item.targetFolder, "NOTA FISCAL E COMPROVANTES/2026/07");
  assert.equal(item.targetPath, "NOTA FISCAL E COMPROVANTES/2026/07/recibo pix.pdf");
  assert.equal(item.status, "pendente");
});

test("notas fiscais: PDF numa pasta e XML na outra, dentro do mês (23/09/2026)", () => {
  const ref = new Date("2026-09-01T12:00:00.000Z");
  assert.equal(sharepoint.sharePointTargetFolderForFile("NOTA_FISCAL_DESPESA", "application/pdf", ref), "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS RECEBIDAS/2026/09/PDF");
  assert.equal(sharepoint.sharePointTargetFolderForFile("NOTA_EMITIDA", "nota.xml", ref), "NOTA FISCAL E COMPROVANTES/NOTAS FISCAIS EMITIDAS/2026/09/XML");
  assert.equal(sharepoint.sharePointTargetFolderForFile("COMPROVANTE", "application/pdf", ref), "NOTA FISCAL E COMPROVANTES/2026/09", "comprovante não separa");
});
