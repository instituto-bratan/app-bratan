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
  todayISO: () => "2026-07-01",
  writeLocalValue: () => undefined,
};

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;

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
  moduleCache.set(absolutePath, module);

  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) {
      const resolved = request.replace("@/", "src/");
      return loadTsModule(path.extname(resolved) ? resolved : `${resolved}.ts`);
    }
    if (request.startsWith(".")) {
      const resolved = path.resolve(path.dirname(absolutePath), request);
      return loadTsModule(path.relative(repoRoot, path.extname(resolved) ? resolved : `${resolved}.ts`));
    }
    throw new Error(`Unexpected test import: ${request}`);
  };

  vm.runInNewContext(
    output,
    {
      require: localRequire,
      module,
      exports: module.exports,
      console,
      crypto: globalThis.crypto,
      Blob,
      Date,
      Intl,
      JSON,
      Map,
      Math,
      Number,
      Object,
      Set,
      String,
      TextEncoder,
    },
    { filename: absolutePath },
  );

  return module.exports;
}

const obsidian = loadTsModule("src/features/obsidian/obsidianVault.ts");
const crm = loadTsModule("src/features/crm/crmData.ts");
const data360 = loadTsModule("src/features/inteligencia360/inteligencia360Data.ts");

function strictConfig() {
  return {
    ...obsidian.defaultObsidianConfig,
    enabled: true,
    defaultRedactionMode: "STRICT",
    exportPatientNames: false,
    exportContactPhone: false,
    exportFinancialValues: false,
    exportSensitiveData: false,
  };
}

test("redação strict remove dados sensíveis e mascara contato/valores", () => {
  const redacted = obsidian.applyRedactionRules(
    {
      name: "Maria Silva",
      phone: "11999990000",
      totalAmount: 24000,
      cpf: "000.000.000-00",
      mainGoal: "Longevidade",
    },
    strictConfig(),
  );

  assert.equal(redacted.name, "Contato protegido");
  assert.equal(redacted.phone, "telefone oculto");
  assert.equal(redacted.totalAmount, "oculto");
  assert.equal("cpf" in redacted, false);
  assert.equal(redacted.mainGoal, "Longevidade");
});

test("markdown do vault inclui frontmatter com origem e entity_id", () => {
  const markdown = obsidian.generateMarkdownFile({
    title: "Briefing Seguro",
    module: "crm",
    entityType: "REPORT",
    entityId: "report-1",
    body: "Conteúdo do relatório.",
    config: strictConfig(),
    generatedAt: "2026-07-01T12:00:00.000Z",
  });

  assert.match(markdown, /^---\nsource: app_bratan/m);
  assert.match(markdown, /entity_id: "report-1"/);
  assert.match(markdown, /# Briefing Seguro/);
});

test("exportação do vault gera ZIP válido com arquivos markdown", async () => {
  const config = strictConfig();
  const files = obsidian.buildVaultExportFiles({
    crm: crm.seedCrmState,
    inteligencia: data360.seedInteligencia360State,
    config,
    reference: new Date("2026-07-01T12:00:00.000Z"),
    includeContacts: false,
    includeDeals: false,
  });
  const zip = obsidian.exportVaultAsZip(files, "vault.zip");
  const buffer = Buffer.from(await zip.blob.arrayBuffer());

  assert.equal(zip.name, "vault.zip");
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  assert.ok(files.some((file) => file.path.endsWith("README.md")));
  assert.ok(files.every((file) => file.content.includes("source: app_bratan")));
});
