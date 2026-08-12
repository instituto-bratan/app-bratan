// CRM: A TAREFA TEM QUE TER DONO DE VERDADE (12/08/2026).
// Bug do Lucas: "a cadência de 14 em 14 dias da enfermeira não está chegando pra
// ela". A régua herdava o dono do DEAL (o vendedor que fechou), então nascia no
// nome do gestor e a enfermeira não era dona de nada.
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
const crm = loadTsModule("src/features/crm/crmData.ts");

test("o dono da cadência vem do PAPEL dela, não de quem fechou a venda", () => {
  assert.equal(crm.cadenceOwnerSlug("ENFERMAGEM"), "enfermagem");
  assert.equal(crm.cadenceOwnerSlug("CONCIERGE"), "concierge");
  assert.equal(crm.cadenceOwnerSlug(null), "concierge", "sem papel, concierge (o mais abrangente)");
});

test("nenhuma inscrição do motor herda o dono do deal", () => {
  // Guarda de regressão no próprio código: o padrão `deal.ownerUserId ||` em
  // ownerUserId de cadência foi exatamente o que colocou a régua da enfermeira
  // no nome do gestor.
  const fonte = fs.readFileSync(path.resolve(repoRoot, "src/features/crm/crmData.ts"), "utf8");
  const suspeitas = fonte
    .split("\n")
    .map((linha, i) => ({ linha: linha.trim(), n: i + 1 }))
    .filter(({ linha }) => /ownerUserId:\s*deal\.ownerUserId/.test(linha));
  assert.deepEqual(
    suspeitas.map((s) => `${s.n}: ${s.linha}`),
    [],
    "cadência com dono do deal volta a esconder a régua de quem deveria executá-la",
  );
});

test("a régua de enfermagem existe, é recorrente de 14 dias e é da ENFERMAGEM", () => {
  const state = crm.seedCrmState;
  const cadencia = (state?.cadences ?? []).find((item) => item.id === "cad-nursing-14");
  assert.ok(cadencia, "cadência cad-nursing-14 existe");
  assert.equal(cadencia.defaultOwnerRole, "ENFERMAGEM");
  const passo = (state?.cadenceSteps ?? []).find((item) => item.cadenceId === "cad-nursing-14");
  assert.ok(passo, "tem passo");
  assert.equal(passo.offsetType, "RECURRING_EVERY_X_DAYS");
  assert.equal(passo.offsetValue, 14);
  assert.equal(passo.assignedToRole, "ENFERMAGEM");
});

test("a enfermeira alcança tarefa de ENFERMAGEM mesmo sem ser o dono nominal", () => {
  const juliana = { id: "00000000-0000-0000-0000-000000000008", nome: "Juliana", cargo: "enfermeira" };
  const tarefaOrfa = { id: "t1", assignedToUserId: "enfermagem", assignedToRole: "ENFERMAGEM", status: "PENDING", contactId: "c1", dueAt: "2026-08-12T10:00:00" };
  assert.equal(crm.canUserAccessTask(juliana, tarefaOrfa), true, "cargo cobre a tarefa órfã");
  const tarefaDoOutro = { ...tarefaOrfa, assignedToUserId: "00000000-0000-0000-0000-000000000003" };
  assert.equal(crm.canUserAccessTask(juliana, tarefaDoOutro), true, "papel ENFERMAGEM ainda é dela");
  const tarefaDeOutroPapel = { ...tarefaOrfa, assignedToRole: "SDR_LEADS", assignedToUserId: "SDR" };
  assert.equal(crm.canUserAccessTask(juliana, tarefaDeOutroPapel), false, "não invade o que não é dela");
});

test("cargo enfermeira mapeia para ENFERMAGEM (base de tudo)", () => {
  assert.equal(crm.cargoToCrmRole("enfermeira"), "ENFERMAGEM");
  assert.equal(crm.cargoToCrmRole("secretaria_executiva"), "CONCIERGE");
  assert.equal(crm.cargoToCrmRole("recepcionista"), "RECEPCAO");
});
