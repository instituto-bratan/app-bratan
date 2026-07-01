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

test("configuração do vault faz ida e volta entre app e linha do Supabase", () => {
  const config = {
    ...obsidian.defaultObsidianConfig,
    enabled: true,
    vaultPath: "/Users/lucas/Vaults/Instituto Bratan",
    syncMode: "AUTO_WEEKLY",
    exportFinancialValues: true,
    defaultRedactionMode: "NONE",
    lastSyncAt: "2026-07-01T12:00:00.000Z",
    lastSyncStatus: "success",
  };

  const row = obsidian.obsidianConfigToSettingsRow(config);
  assert.equal(row.id, true);
  assert.equal(row.obsidian_enabled, true);
  assert.equal(row.sync_mode, "AUTO_WEEKLY");
  assert.equal(row.last_sync_at, "2026-07-01T12:00:00.000Z");

  const restored = obsidian.obsidianConfigFromSettingsRow(row);
  assert.equal(restored.enabled, config.enabled);
  assert.equal(restored.vaultPath, config.vaultPath);
  assert.equal(restored.syncMode, config.syncMode);
  assert.equal(restored.exportFinancialValues, true);
  assert.equal(restored.defaultRedactionMode, "NONE");
  assert.equal(restored.lastSyncAt, config.lastSyncAt);
  assert.equal(restored.lastSyncStatus, "success");
});

test("linha do Supabase com enum inválido cai no padrão seguro", () => {
  const restored = obsidian.obsidianConfigFromSettingsRow({
    obsidian_enabled: true,
    obsidian_vault_path: "",
    sync_mode: "INVALIDO",
    export_sensitive_data: false,
    export_financial_values: false,
    export_patient_names: true,
    export_contact_phone: false,
    default_redaction_mode: "TOTAL",
    last_sync_at: null,
    last_sync_status: "qualquer",
    last_sync_error: "",
  });

  assert.equal(restored.syncMode, "MANUAL");
  assert.equal(restored.defaultRedactionMode, "PARTIAL");
  assert.equal(restored.lastSyncStatus, "awaiting_config");
  assert.equal(restored.lastSyncAt, "");
});

test("log de sincronização só envia UUID real como responsável", () => {
  const baseLog = {
    id: "obslog-1",
    syncType: "EXPORT_ZIP",
    status: "DONE",
    startedAt: "2026-07-01T12:00:00.000Z",
    finishedAt: "2026-07-01T12:00:01.000Z",
    filesCreated: 4,
    filesUpdated: 0,
    filesFailed: 0,
    errorMessage: "",
    triggeredByUserId: "preview",
    createdAt: "2026-07-01T12:00:01.000Z",
  };

  const previewRow = obsidian.obsidianLogRowFromLog(baseLog);
  assert.equal(previewRow.triggered_by_user_id, null);

  const uuid = "3f2b1a90-1234-4abc-9def-1234567890ab";
  const userRow = obsidian.obsidianLogRowFromLog({ ...baseLog, triggeredByUserId: uuid });
  assert.equal(userRow.triggered_by_user_id, uuid);
  assert.equal(userRow.files_created, 4);
  assert.equal(userRow.finished_at, "2026-07-01T12:00:01.000Z");
});

test("item da fila converte para linha do Supabase e volta sem perder status", () => {
  const item = obsidian.enqueueExport(
    {
      path: "Instituto Bratan/06_Relatorios/Kickoff/teste.md",
      entityType: "REPORT",
      entityId: "kickoff-2026-27",
      content: "conteudo",
    },
    "DONE",
  );

  const row = obsidian.obsidianQueueRowFromItem(item);
  assert.equal(row.entity_type, "REPORT");
  assert.equal(row.status, "DONE");
  assert.equal(row.target_path, item.targetPath);
  assert.equal(row.attempts, 1);
  assert.equal("id" in row, false);

  const restored = obsidian.obsidianQueueItemFromRow({ ...row, id: "11111111-2222-4333-8444-555555555555" });
  assert.equal(restored.id, "11111111-2222-4333-8444-555555555555");
  assert.equal(restored.entityType, "REPORT");
  assert.equal(restored.status, "DONE");
  assert.equal(restored.attempts, 1);
});
