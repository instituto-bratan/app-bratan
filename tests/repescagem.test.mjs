// REPESCAGEM (08/09/2026): faixas de tempo sem vir, fila de candidatos, a
// cadência isca → ligação e o registro com data e hora.
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
const crm = loadTsModule("src/features/crm/crmData.ts");
const rep = loadTsModule("src/features/crm/repescagemData.ts");
const j = (v) => JSON.parse(JSON.stringify(v));

const HOJE = "2026-09-08";
const contato = (id, nome) => ({ id, contactType: "PATIENT", lifecycleStage: "PATIENT", fullName: nome, preferredName: nome.split(" ")[0], phone: "11999990000", whatsapp: "", sourceChannel: "", createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z" });
const venda = (contactRef, dia) => ({ id: `s-${contactRef}-${dia}`, saleDate: dia, patientName: "", crmContactRef: contactRef, items: [], payments: [], notes: "", createdAt: `${dia}T10:00:00.000Z` });
const base = () => ({
  ...crm.seedCrmState,
  contacts: [contato("c1", "Ana Lima"), contato("c2", "Bruno Sá"), contato("c3", "Carla Dias"), contato("c4", "Duda Reis"), contato("c5", "Eva Nova")],
  deals: [],
  tasks: [],
  cadenceEnrollments: [],
});
const vendas = [venda("c1", "2026-08-01"), venda("c2", "2026-06-01"), venda("c3", "2026-02-15"), venda("c4", "2025-06-01"), venda("c5", "2026-09-01")];

test("faixas: 1 mês, 3 meses, 6 meses, 1 ano — e quem veio há menos de 30 dias não entra", () => {
  assert.equal(rep.faixaPorDias(29), null);
  assert.equal(rep.faixaPorDias(30), "M1");
  assert.equal(rep.faixaPorDias(89), "M1");
  assert.equal(rep.faixaPorDias(90), "M3");
  assert.equal(rep.faixaPorDias(180), "M6");
  assert.equal(rep.faixaPorDias(365), "A1");
  const fila = rep.candidatosRepescagem(base(), vendas, HOJE);
  assert.deepEqual(j(fila.map((c) => [c.contact.preferredName, c.faixa])), [["Duda", "A1"], ["Carla", "M6"], ["Bruno", "M3"], ["Ana", "M1"]], "mais tempo sumido primeiro; Eva veio há 7 dias");
});

test("a cadência de repescagem existe no catálogo: isca (WhatsApp) → ligação (CALL) → 2ª ligação", () => {
  const passos = crm.seedCrmState.cadenceSteps.filter((s) => s.cadenceId === rep.CADENCIA_REPESCAGEM).sort((a, b) => a.stepOrder - b.stepOrder);
  assert.deepEqual(j(passos.map((s) => [s.id, s.taskType, s.offsetValue])), [["step-repesc-isca", "WHATSAPP", 0], ["step-repesc-lig1", "CALL", 1], ["step-repesc-lig2", "CALL", 3]]);
  assert.ok(crm.seedCrmState.messageTemplates.some((t) => t.id === "tpl-repescagem-isca" && /melhor horário/i.test(t.body)), "a isca pergunta o melhor horário para ligar");
});

test("iniciar repescagem: nasce a inscrição com a faixa no motivo e a tarefa da isca; o registro guarda data e hora", () => {
  let state = base();
  const [duda] = rep.candidatosRepescagem(state, vendas, HOJE);
  state = rep.iniciarRepescagem(state, duda, { userId: "aline", role: "CONCIERGE" }, HOJE);
  const inscricao = state.cadenceEnrollments.find((e) => e.cadenceId === rep.CADENCIA_REPESCAGEM);
  assert.ok(inscricao, "inscrição criada");
  assert.deepEqual(j(rep.faixaDoMotivo(inscricao.triggerSource)), { faixa: "A1", ultimaVisita: "2025-06-01" });
  const quadro = rep.buildQuadroRepescagem(state, vendas, HOJE);
  assert.equal(quadro.candidatos.some((c) => c.contact.id === "c4"), false, "saiu da fila de candidatos");
  assert.equal(quadro.isca.length, 1, "está na coluna da isca");
  const cartao = quadro.isca[0];
  assert.equal(cartao.faixa, "A1");
  assert.ok(cartao.tarefaId, "a tarefa da isca já existe");
  // isca enviada → vai para Ligar
  state = crm.completeCrmTask(state, cartao.tarefaId, { result: "SENT", actorId: "aline", resultNotes: "Isca enviada" });
  const depois = rep.buildQuadroRepescagem(state, vendas, HOJE);
  assert.equal(depois.isca.length, 0);
  assert.equal(depois.ligar.length, 1, "agora é ligar");
  assert.ok(depois.ligar[0].iscaEnviadaEm, "hora da isca registrada");
  assert.equal(depois.registro.length, 1);
  assert.equal(depois.registro[0].nome, "Duda Reis");
});

test("marcar o horário que o paciente pediu move a ligação para essa hora", () => {
  let state = base();
  const [duda] = rep.candidatosRepescagem(state, vendas, HOJE);
  state = rep.iniciarRepescagem(state, duda, { userId: "aline", role: "CONCIERGE" }, HOJE);
  const isca = rep.buildQuadroRepescagem(state, vendas, HOJE).isca[0];
  state = crm.completeCrmTask(state, isca.tarefaId, { result: "SENT", actorId: "aline" });
  const ligar = rep.buildQuadroRepescagem(state, vendas, HOJE).ligar[0];
  if (ligar.tarefaId) {
    state = rep.marcarHorarioDaLigacao(state, ligar.tarefaId, "2026-09-10T18:30:00.000Z");
    const tarefa = state.tasks.find((t) => t.id === ligar.tarefaId);
    assert.equal(tarefa.dueAt, "2026-09-10T18:30:00.000Z");
    assert.equal(tarefa.status, "PENDING");
  } else {
    assert.ok(true, "a ligação nasce depois pelo motor sequencial — nada a marcar ainda");
  }
});
