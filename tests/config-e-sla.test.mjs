// CONFIGURAÇÕES COM VIGÊNCIA (7.3) e SLA DE RESPOSTA AO LEAD (3.9) — 15/09/2026.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-15", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const cfg = loadTsModule("src/lib/configNegocio.ts");
const sla = loadTsModule("src/features/crm/slaLead.ts");
const plain = (v) => JSON.parse(JSON.stringify(v));

test("config: sem linha vale o padrão do código; com linhas, vale a última vigente até o dia", () => {
  assert.equal(cfg.configAtual("aprovacao.limite"), 5000);
  assert.deepEqual(plain(cfg.configAtual("transferencias.dias")), [10, 25]);
  const linhas = [
    { chave: "aprovacao.limite", valor: 8000, vigenteDe: "2026-10-01", criadoEm: "2026-09-15T10:00:00Z", observacao: "" },
    { chave: "aprovacao.limite", valor: 3000, vigenteDe: "2026-09-01", criadoEm: "2026-09-01T10:00:00Z", observacao: "" },
    { chave: "aprovacao.limite", valor: 3500, vigenteDe: "2026-09-01", criadoEm: "2026-09-02T10:00:00Z", observacao: "corrigido" },
  ];
  cfg.definirCacheConfig(linhas);
  assert.equal(cfg.configAtual("aprovacao.limite", "2026-09-15"), 3500, "mesma vigência: vale a linha criada por último");
  assert.equal(cfg.configAtual("aprovacao.limite", "2026-10-02"), 8000, "a linha futura passa a valer no dia");
  assert.equal(cfg.configAtual("aprovacao.limite", "2026-08-15"), 5000, "antes de qualquer linha, o padrão");
  assert.equal(cfg.historicoDaChave("aprovacao.limite").length, 3);
  assert.equal(cfg.cacheConfigCarregado(), true);
  cfg.definirCacheConfig([]);
});

test("config: validação e conversão do texto digitado", () => {
  const limite = cfg.definicaoDaChave("aprovacao.limite");
  assert.equal(cfg.valorDoTexto(limite, "7.500,50"), 7500.5);
  assert.equal(cfg.validarValorConfig(limite, -1), "Informe um número maior ou igual a zero.");
  assert.equal(cfg.validarValorConfig(limite, 7500.5), null);
  const dias = cfg.definicaoDaChave("transferencias.dias");
  assert.deepEqual(plain(cfg.valorDoTexto(dias, "5, 20")), [5, 20]);
  assert.equal(cfg.validarValorConfig(dias, []), "Informe uma lista de números separados por vírgula.");
  const modo = cfg.definicaoDaChave("indicacao.modo");
  assert.equal(cfg.validarValorConfig(modo, "CORTESIA"), null);
  assert.equal(cfg.validarValorConfig(modo, "X"), "Escolha uma das opções.");
  const grade = cfg.definicaoDaChave("salas.grade");
  assert.deepEqual(plain(cfg.valorDoTexto(grade, '{"salas":5,"horasPorDiaPorSala":10}')), { salas: 5, horasPorDiaPorSala: 10 });
  assert.equal(cfg.valorDoTexto(grade, "{quebrado"), null);
  assert.equal(cfg.validarValorConfig(grade, null), "Informe um JSON válido (objeto).");
  assert.equal(cfg.textoDoValor(limite, 5000), "5000");
  assert.equal(cfg.textoDoValor(dias, [10, 25]), "10, 25");
  assert.ok(cfg.DEFINICOES_CONFIG.every((d) => d.chave && d.titulo && d.explicacao && d.grupo));
});

const AGORA = "2026-09-15T12:00:00.000Z";
const contato = (id, nome) => ({ id, contactType: "LEAD", lifecycleStage: "WARM_LEAD", fullName: nome, preferredName: "", phone: "11999990000", whatsapp: "", email: "", instagram: "", sourceChannel: "Instagram", acquisitionCampaign: "", leadTemperature: "WARM", personaFit: "UNKNOWN", mainPain: "", mainGoal: "", ownerUserId: "", commercialOwnerId: "", conciergeOwnerId: "", nurseOwnerId: "", doctorId: "", notes: "", createdBy: "", createdAt: AGORA, updatedAt: AGORA, archivedAt: null });
const negocio = (id, contactId, createdAt, stage = "LEAD_NOVO") => ({ id, contactId, title: "Lead", dealType: "CONSULTA", stage, estimatedValue: 0, prescribedAmount: 0, soldAmount: 0, receivedAmount: 0, probability: 10, status: "OPEN", mainObjection: "", objectionCategory: "NONE", sourceChannel: "Instagram", ownerUserId: "", doctorId: "", expectedCloseDate: "", closedAt: null, createdAt, updatedAt: createdAt });
const tarefaFeita = (id, contactId, dealId, completedAt) => ({ id, contactId, dealId, cadenceId: "", cadenceStepId: "", title: "D1", description: "", taskType: "WHATSAPP", assignedToUserId: "", assignedToRole: "SDR_LEADS", dueAt: completedAt, completedAt, status: "DONE", priority: "MEDIUM", visibilityScope: "ROLE", generatedBy: "SYSTEM", result: "SENT", resultNotes: "", createdBy: "", createdAt: completedAt, updatedAt: completedAt });
const estado = (contacts, deals, tasks = [], timelineEvents = []) => ({ contacts, deals, tasks, cadences: [], cadenceSteps: [], cadenceEnrollments: [], messageTemplates: [], touchpoints: [], timelineEvents });

test("SLA: primeiro toque dentro e fora do limite, sem resposta e lead frio ignorado", () => {
  const st = estado(
    [contato("c1", "Ana"), contato("c2", "Bia"), contato("c3", "Caio"), contato("c4", "Duda")],
    [
      negocio("d1", "c1", "2026-09-15T11:00:00.000Z"), // toque em 3 min
      negocio("d2", "c2", "2026-09-15T09:00:00.000Z"), // toque em 40 min
      negocio("d3", "c3", "2026-09-15T10:00:00.000Z"), // sem toque há 2 h
      negocio("d4", "c4", "2026-08-01T10:00:00.000Z", "LEAD_FRIO"), // frio de propósito
    ],
    [tarefaFeita("t1", "c1", "d1", "2026-09-15T11:03:00.000Z"), tarefaFeita("t2", "c2", "d2", "2026-09-15T09:40:00.000Z")],
  );
  const r = sla.buildResumoSla(st, AGORA, 5);
  assert.equal(r.total, 3);
  assert.equal(r.dentro, 1);
  assert.equal(r.percentualDentro, 33);
  assert.deepEqual(plain(r.semResposta.map((l) => [l.nome, l.minutos])), [["Caio", 120]]);
  assert.equal(r.medianaMinutos, 40, "mediana entre 3 e 40 (2 respondidos → o de cima)");
  assert.match(r.frase, /1 de 3 leads dos últimos 30 dias receberam o primeiro toque em até 5 min \(33%\)/);
  assert.match(r.frase, /1 ainda sem resposta/);
  assert.equal(sla.slaDoNegocio(r, "d1").dentroDoSla, true);
  assert.equal(sla.slaDoNegocio(r, "d4"), null, "lead frio não entra na régua");
  assert.equal(sla.formatMinutos(3), "3 min");
  assert.equal(sla.formatMinutos(125), "2 h 5 min");
  assert.equal(sla.formatMinutos(3000), "2 d 2 h");
});

test("SLA: evento da linha do tempo também conta como toque; negociação que já andou não fica 'sem resposta'", () => {
  const st = estado(
    [contato("c1", "Ana"), contato("c2", "Bia")],
    [negocio("d1", "c1", "2026-09-15T11:00:00.000Z"), negocio("d2", "c2", "2026-09-15T11:30:00.000Z", "CONSULTA_AGENDADA")],
    [],
    [{ id: "e1", contactId: "c1", eventType: "WHATSAPP", eventTitle: "Mensagem enviada", eventDescription: "", sourceModule: "crm", sourceId: "", createdBy: "", createdAt: "2026-09-15T11:04:00.000Z" }],
  );
  const r = sla.buildResumoSla(st, AGORA, 5);
  assert.equal(sla.slaDoNegocio(r, "d1").minutos, 4);
  assert.equal(sla.slaDoNegocio(r, "d1").dentroDoSla, true);
  assert.equal(r.semResposta.length, 0, "d2 já está em consulta agendada: alguém falou com ela");
});
