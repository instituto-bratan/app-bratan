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
  todayISO: () => "2026-06-30",
  writeLocalValue: () => undefined,
};

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
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
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const crm = loadTsModule("src/features/crm/crmData.ts");

function cloneState() {
  return JSON.parse(JSON.stringify(crm.demoCrmFixtures));
}

function fixedEnrollment(over = {}) {
  return {
    id: "enroll-fixo-1",
    cadenceId: "cad-concierge-d1",
    contactId: "crm-contact-lead-frio",
    dealId: "crm-deal-lead-frio",
    status: "ACTIVE",
    enrolledAt: "2026-06-29T12:00:00.000Z",
    triggerSource: "teste",
    triggerDate: "2026-06-29",
    ownerUserId: "aline",
    ownerRole: "CONCIERGE",
    completedAt: null,
    canceledReason: "",
    createdAt: "2026-06-29T12:00:00.000Z",
    updatedAt: "2026-06-29T12:00:00.000Z",
    ...over,
  };
}

// ---- IDs determinísticos: dois aparelhos convergem no upsert ----------------

test("motor gera tarefas com id determinístico (duas execuções = mesmos ids)", () => {
  const state = cloneState();
  const base = { ...state, tasks: [], cadenceEnrollments: [fixedEnrollment()] };
  const ref = new Date("2026-06-30T09:00:00");
  const a = crm.generateCadenceTasks(base, ref);
  const b = crm.generateCadenceTasks(base, ref);
  const idsA = a.tasks.map((t) => t.id).sort();
  const idsB = b.tasks.map((t) => t.id).sort();
  assert.ok(idsA.length > 0, "deveria gerar pelo menos uma tarefa");
  assert.deepEqual(idsA, idsB);
});

test("cobertura automática cria inscrições com id determinístico", () => {
  const state = cloneState();
  const base = { ...state, cadenceEnrollments: [], tasks: [] };
  const a = crm.ensureCadenceCoverage(base);
  const b = crm.ensureCadenceCoverage(base);
  const idsA = a.cadenceEnrollments.map((e) => e.id).sort();
  const idsB = b.cadenceEnrollments.map((e) => e.id).sort();
  assert.ok(idsA.length > 0, "deveria cobrir pelo menos um contato");
  assert.deepEqual(idsA, idsB);
});

test("inscrição manual no mesmo dia converge para o mesmo id", () => {
  const state = cloneState();
  const base = { ...state, cadenceEnrollments: [], tasks: [] };
  const values = {
    cadenceId: "cad-concierge-d1",
    contactId: "crm-contact-lead-frio",
    dealId: "crm-deal-lead-frio",
    triggerSource: "inscricao manual",
    triggerDate: "2026-06-30",
    ownerUserId: "aline",
    ownerRole: "CONCIERGE",
  };
  const a = crm.enrollContactInCadence(base, values);
  const b = crm.enrollContactInCadence(base, values);
  const enrollA = a.cadenceEnrollments.find((e) => e.cadenceId === "cad-concierge-d1");
  const enrollB = b.cadenceEnrollments.find((e) => e.cadenceId === "cad-concierge-d1");
  assert.ok(enrollA && enrollB);
  assert.equal(enrollA.id, enrollB.id);
});

test("re-inscrição idempotente: contato já ativo na cadência não duplica", () => {
  const state = cloneState();
  const base = { ...state, cadenceEnrollments: [fixedEnrollment()], tasks: [] };
  const next = crm.enrollContactInCadence(base, {
    cadenceId: "cad-concierge-d1",
    contactId: "crm-contact-lead-frio",
    dealId: "crm-deal-lead-frio",
    triggerSource: "inscricao manual",
    triggerDate: "2026-06-30",
    ownerUserId: "aline",
    ownerRole: "CONCIERGE",
  });
  assert.equal(next.cadenceEnrollments.filter((e) => e.cadenceId === "cad-concierge-d1" && e.contactId === "crm-contact-lead-frio").length, 1);
});

// ---- dedupeCrmState: sanear duplicatas que já entraram ----------------------

test("dedupeCrmState remove inscrição ativa duplicada mantendo a mais antiga", () => {
  const state = cloneState();
  const dup1 = fixedEnrollment({ id: "enroll-a", enrolledAt: "2026-06-20T10:00:00.000Z" });
  const dup2 = fixedEnrollment({ id: "enroll-b", enrolledAt: "2026-06-25T10:00:00.000Z" });
  const base = { ...state, cadenceEnrollments: [dup2, dup1], tasks: [] };
  const out = crm.dedupeCrmState(base);
  const kept = out.cadenceEnrollments.filter((e) => e.contactId === "crm-contact-lead-frio" && e.cadenceId === "cad-concierge-d1");
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "enroll-a");
});

test("dedupeCrmState remove tarefa duplicada do mesmo passo preferindo a concluída", () => {
  const state = cloneState();
  const mk = (id, status, createdAt) => ({
    id,
    contactId: "crm-contact-lead-frio",
    dealId: "crm-deal-lead-frio",
    cadenceId: "cad-concierge-d1",
    cadenceStepId: "step-concierge-d1",
    title: "Concierge D+1",
    description: "",
    taskType: "WHATSAPP",
    assignedToUserId: "aline",
    assignedToRole: "CONCIERGE",
    dueAt: "2026-06-30T09:00:00.000Z",
    completedAt: null,
    status,
    priority: "MEDIUM",
    visibilityScope: "ROLE",
    generatedBy: "CADENCE_ENGINE",
    result: "",
    resultNotes: "",
    createdBy: "cadence-engine",
    createdAt,
    updatedAt: createdAt,
  });
  const base = {
    ...state,
    cadenceEnrollments: [fixedEnrollment()],
    tasks: [mk("task-nova", "PENDING", "2026-06-30T08:00:00.000Z"), mk("task-feita", "DONE", "2026-06-29T08:00:00.000Z")],
  };
  const out = crm.dedupeCrmState(base);
  const kept = out.tasks.filter((t) => t.cadenceStepId === "step-concierge-d1" && t.contactId === "crm-contact-lead-frio");
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "task-feita");
});

test("dedupeCrmState devolve o MESMO objeto quando não há duplicata (estabilidade)", () => {
  const state = cloneState();
  const base = { ...state, cadenceEnrollments: [fixedEnrollment()], tasks: [] };
  const out = crm.dedupeCrmState(base);
  assert.equal(out, base);
});

// ---- diffCrmStates: salvar só o que mudou ------------------------------------

test("diffCrmStates devolve apenas linhas novas ou alteradas", () => {
  const state = cloneState();
  const baseline = { ...state, cadenceEnrollments: [fixedEnrollment()], tasks: [] };
  const ref = new Date("2026-06-30T09:00:00");
  const next = crm.generateCadenceTasks(baseline, ref);
  const diff = crm.diffCrmStates(baseline, next);
  assert.equal(diff.contacts.length, 0, "nenhum contato mudou");
  assert.equal(diff.deals.length, 0, "nenhuma negociação mudou");
  assert.equal(diff.cadenceEnrollments.length, 0, "nenhuma inscrição mudou");
  assert.ok(diff.tasks.length > 0, "as tarefas novas entram no diff");
  assert.equal(diff.tasks.length, next.tasks.length - baseline.tasks.length);
});

test("diffCrmStates pega alteração de status em linha existente", () => {
  const state = cloneState();
  const baseline = { ...state };
  const next = {
    ...state,
    tasks: state.tasks.map((t, i) => (i === 0 ? { ...t, status: "DONE" } : t)),
  };
  const diff = crm.diffCrmStates(baseline, next);
  assert.equal(diff.tasks.length, 1);
  assert.equal(diff.tasks[0].status, "DONE");
});

test("diffCrmStates com estados idênticos devolve tudo vazio", () => {
  const state = cloneState();
  const diff = crm.diffCrmStates(state, state);
  for (const key of Object.keys(diff)) {
    assert.equal(diff[key].length, 0, `${key} deveria estar vazio`);
  }
});

// ---- Listas do Dr. Daniel ---------------------------------------------------

test("notClosedRecently traz só quem não fechou na janela, 1 linha por contato", () => {
  const state = cloneState();
  const mkDeal = (id, contactId, stage, status, dateISO, objection) => ({
    id, contactId, title: id, dealType: "PROGRAMA_COMPLETO", stage, estimatedValue: 8000,
    prescribedAmount: 8000, soldAmount: 0, receivedAmount: 0, probability: 30, status,
    mainObjection: objection || "", objectionCategory: "PRICE", sourceChannel: "", ownerUserId: "",
    doctorId: "", expectedCloseDate: "", closedAt: null, createdAt: dateISO + "T10:00:00.000Z", updatedAt: dateISO + "T10:00:00.000Z",
  });
  const base = {
    ...state,
    contacts: [
      { ...state.contacts[0], id: "c1", fullName: "Ana" },
      { ...state.contacts[0], id: "c2", fullName: "Bia" },
    ],
    deals: [
      mkDeal("d-antigo", "c1", "NAO_FECHOU", "OPEN", "2026-06-01", "Preço"),      // fora da janela
      mkDeal("d-recente", "c2", "NAO_FECHOU", "OPEN", "2026-06-28", "Família"),   // dentro
      mkDeal("d-ganho", "c1", "FECHOU_COMPLETO", "WON_FULL", "2026-06-29", ""),   // fechou → fora
    ],
  };
  const rows = crm.notClosedRecently(base, "2026-06-30", 7);
  assert.deepEqual(Array.from(rows, (r) => r.deal.contactId), ["c2"]);
  assert.equal(rows[0].objection, "Família");
});

test("activeProgramPatients lista pacientes ativos com o valor do plano", () => {
  const state = cloneState();
  const rows = crm.activeProgramPatients(state);
  assert.ok(rows.length >= 1, "há pelo menos um paciente ativo nas fixtures");
  assert.ok(rows.every((r) => r.contact.lifecycleStage === "ACTIVE_PATIENT"));
});
