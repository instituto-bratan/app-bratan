// KANBAN POR CADÊNCIA (08/09/2026): colunas = passos, cartões = inscrições no
// passo que espera ser feito; atrasado primeiro; encerrados à parte.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-08", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
    if (request === "@/lib/remoteData") return {};
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, {
    module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto,
  }, { filename: absolutePath });
  return module.exports;
}
const kanban = loadTsModule("src/features/crm/cadenciaKanbanData.ts");
const j = (valor) => JSON.parse(JSON.stringify(valor));

const HOJE = "2026-09-08";
const passo = (id, ordem, nome) => ({ id, cadenceId: "cad-x", stepOrder: ordem, name: nome, offsetType: "DAYS_AFTER_TRIGGER", offsetValue: ordem, preferredTimeWindow: "ANY", taskType: "WHATSAPP", assignedToRole: "CONCIERGE", messageTemplateId: "", required: true, pauseIfContactResponded: true, cancelIfStageChanged: false, active: true });
const inscricao = (id, contactId, status = "ACTIVE", extra = {}) => ({ id, cadenceId: "cad-x", contactId, dealId: `deal-${contactId}`, status, enrolledAt: "2026-09-01T10:00:00.000Z", triggerSource: "Não fechou", triggerDate: "2026-09-01", ownerUserId: "aline", ownerRole: "CONCIERGE", completedAt: null, canceledReason: "", createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z", ...extra });
const tarefa = (contactId, stepId, dueAt, status, extra = {}) => ({ id: `t-${contactId}-${stepId}`, contactId, dealId: `deal-${contactId}`, cadenceId: "cad-x", cadenceStepId: stepId, title: stepId, description: "", taskType: "WHATSAPP", assignedToUserId: "aline", assignedToRole: "CONCIERGE", dueAt, completedAt: status === "DONE" ? dueAt : null, status, priority: "MEDIUM", visibilityScope: "ROLE", generatedBy: "CADENCE_ENGINE", result: status === "DONE" ? "NO_RESPONSE" : "", resultNotes: status === "DONE" ? "Sem resposta" : "", createdBy: "motor", createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z", ...extra });
const contato = (id, nome) => ({ id, contactType: "PATIENT", lifecycleStage: "PATIENT", fullName: nome, preferredName: nome.split(" ")[0], phone: "11999990000", whatsapp: "" });

const state = {
  contacts: [contato("c1", "Ana Lima"), contato("c2", "Bruno Sá"), contato("c3", "Carla Dias"), contato("c4", "Duda Reis")],
  deals: [],
  cadences: [{ id: "cad-x", name: "Não fechou D1–D5", description: "", cadenceType: "POST_CONSULTATION_NOT_CLOSED", defaultOwnerRole: "CONCIERGE", active: true, createdAt: "", updatedAt: "" }],
  cadenceSteps: [passo("s1", 1, "D1"), passo("s2", 2, "D2"), passo("s3", 3, "D3")],
  cadenceEnrollments: [
    inscricao("e1", "c1"),
    inscricao("e2", "c2"),
    inscricao("e3", "c3", "COMPLETED", { completedAt: "2026-09-05T10:00:00.000Z", updatedAt: "2026-09-05T10:00:00.000Z" }),
    inscricao("e4", "c4"),
  ],
  tasks: [
    // Ana: D1 feito, D2 pendente e atrasado 2 dias → coluna D2, vermelho
    tarefa("c1", "s1", "2026-09-02T09:00:00.000Z", "DONE"),
    tarefa("c1", "s2", "2026-09-06T09:00:00.000Z", "PENDING"),
    // Bruno: D1 pendente hoje → coluna D1, amarelo
    tarefa("c2", "s1", "2026-09-08T09:00:00.000Z", "PENDING"),
    // Carla: tudo feito e inscrição concluída → encerrados
    tarefa("c3", "s1", "2026-09-02T09:00:00.000Z", "DONE"),
    tarefa("c3", "s2", "2026-09-03T09:00:00.000Z", "DONE"),
    tarefa("c3", "s3", "2026-09-04T09:00:00.000Z", "DONE"),
    // Duda: D1 feito, D2 ainda não nasceu → coluna D2 sem tarefa
    tarefa("c4", "s1", "2026-09-07T09:00:00.000Z", "DONE"),
  ],
  messageTemplates: [],
  touchpoints: [],
  timelineEvents: [],
};

test("colunas são os passos e cada cartão fica no passo que espera ser feito", () => {
  const k = kanban.buildKanbanCadencia(state, "cad-x", HOJE);
  assert.deepEqual(j(k.colunas.map((c) => c.nome)), ["D1", "D2", "D3"]);
  const d1 = k.colunas[0].cartoes.map((c) => c.nome);
  const d2 = k.colunas[1].cartoes.map((c) => c.nome);
  assert.deepEqual(j(d1), ["Bruno Sá"]);
  assert.deepEqual(j(d2), ["Ana Lima", "Duda Reis"], "atrasado primeiro; Duda espera o D2 nascer");
  assert.equal(k.colunas[2].cartoes.length, 0);
});

test("atraso, hoje, progresso e a tarefa que o botão conclui", () => {
  const k = kanban.buildKanbanCadencia(state, "cad-x", HOJE);
  const ana = k.colunas[1].cartoes.find((c) => c.nome === "Ana Lima");
  assert.equal(ana.atrasoDias, 2);
  assert.equal(ana.tarefaId, "t-c1-s2");
  assert.equal(ana.passosFeitos, 1);
  assert.equal(ana.totalPassos, 3);
  assert.equal(ana.ultimoResultado, "Sem resposta");
  const bruno = k.colunas[0].cartoes[0];
  assert.equal(bruno.venceHoje, true);
  assert.equal(bruno.atrasoDias, 0);
  const duda = k.colunas[1].cartoes.find((c) => c.nome === "Duda Reis");
  assert.equal(duda.tarefaId, null, "sem tarefa ainda: nada para concluir, o motor cria o D2");
  assert.deepEqual(JSON.parse(JSON.stringify(k.totais)), { ativos: 3, atrasados: 1, hoje: 1 });
});

test("inscrição concluída vai para Encerrados (30 dias) e some das colunas", () => {
  const k = kanban.buildKanbanCadencia(state, "cad-x", HOJE);
  assert.deepEqual(j(k.encerrados.map((c) => c.nome)), ["Carla Dias"]);
  assert.equal(k.encerrados[0].passosFeitos, 3);
  const antigo = kanban.buildKanbanCadencia(state, "cad-x", "2026-11-30");
  assert.equal(antigo.encerrados.length, 0, "fora da janela de 30 dias não aparece");
});

test("resumo das cadências para as abas: quem tem gente ativa primeiro", () => {
  const comOutra = { ...state, cadences: [...state.cadences, { id: "cad-vazia", name: "Aniversário", description: "", cadenceType: "ANNIVERSARY_1Y", defaultOwnerRole: "CONCIERGE", active: true, createdAt: "", updatedAt: "" }], cadenceSteps: [...state.cadenceSteps, { ...passo("sv1", 1, "Parabéns"), cadenceId: "cad-vazia" }] };
  const resumo = kanban.resumoDasCadencias(comOutra, HOJE);
  assert.deepEqual(j(resumo.map((r) => [r.cadence.id, r.ativos, r.atrasados])), [["cad-x", 3, 1], ["cad-vazia", 0, 0]]);
});
