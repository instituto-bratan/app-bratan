// PLANILHA DO COORDENADOR DE VENDAS (08/09/2026): a primeira aba (registro de
// contatos) sai do CRM e o funil se soma sozinho, por origem.
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
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request === "@/lib/remoteData") return {};
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, RegExp, Promise, crypto: globalThis.crypto }, { filename: absolutePath });
  return module.exports;
}
const coord = loadTsModule("src/features/crm/coordenadorVendasData.ts");
const j = (v) => JSON.parse(JSON.stringify(v));

const contato = (id, nome, extra = {}) => ({ id, contactType: "LEAD", lifecycleStage: "LEAD", fullName: nome, preferredName: nome.split(" ")[0], phone: "", whatsapp: "", sourceChannel: "", referrerContactId: "", createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z", ...extra });
const deal = (id, contactId, stage, extra = {}) => ({ id, contactId, title: id, dealType: "PROGRAM", stage, estimatedValue: 0, prescribedAmount: 0, soldAmount: 0, receivedAmount: 0, probability: 0, status: "OPEN", mainObjection: "", objectionCategory: "OTHER", sourceChannel: "", ownerUserId: "u", doctorId: "", expectedCloseDate: "", closedAt: null, createdAt: "2026-09-03T10:00:00.000Z", updatedAt: "2026-09-03T10:00:00.000Z", ...extra });
const state = {
  contacts: [
    contato("c1", "Caroline Lenhara", { referrerContactId: "c9" }),
    contato("c2", "Renata Site", { sourceChannel: "site" }),
    contato("c3", "Rosana Barbosa", { contactType: "PATIENT" }),
    contato("c4", "Cleber Prédio", { sourceChannel: "instagram" }),
    contato("c5", "Mês passado"),
  ],
  deals: [
    deal("d1", "c1", "LEAD_NOVO"),
    deal("d2", "c2", "CONSULTA_AGENDADA"),
    deal("d3", "c3", "FECHOU_COMPLETO", { status: "WON_FULL" }),
    deal("d4", "c4", "NAO_FECHOU", { mainObjection: "Preço" }),
    deal("d5", "c5", "LEAD_NOVO", { createdAt: "2026-08-20T10:00:00.000Z" }),
  ],
  tasks: [], cadences: [], cadenceSteps: [], cadenceEnrollments: [], messageTemplates: [], touchpoints: [], timelineEvents: [],
};
const vendas = [{ id: "s1", saleDate: "2026-03-10", crmContactRef: "c3", items: [], payments: [], patientName: "", notes: "", createdAt: "" }];

test("registro de contatos: uma linha por negociação do mês, origem e etapas derivadas", () => {
  const linhas = coord.registroDeContatos(state, vendas, "2026-09");
  assert.equal(linhas.length, 4, "a de agosto fica fora");
  const por = Object.fromEntries(linhas.map((l) => [l.nome, l]));
  assert.equal(por["Caroline Lenhara"].origem, "INDICACAO", "tem quem indicou");
  assert.equal(por["Rosana Barbosa"].origem, "FIDELIZADO", "já tinha comanda antes do contato");
  assert.equal(por["Renata Site"].origem, "REDES_OUTROS");
  assert.deepEqual(j([por["Caroline Lenhara"].agendou, por["Caroline Lenhara"].compareceu, por["Caroline Lenhara"].fechou]), [false, false, false]);
  assert.deepEqual(j([por["Renata Site"].agendou, por["Renata Site"].compareceu]), [true, false]);
  assert.deepEqual(j([por["Rosana Barbosa"].agendou, por["Rosana Barbosa"].compareceu, por["Rosana Barbosa"].fechou]), [true, true, true]);
  assert.deepEqual(j([por["Cleber Prédio"].agendou, por["Cleber Prédio"].compareceu, por["Cleber Prédio"].fechou]), [true, true, false], "não fechou = passou pela consulta");
  assert.equal(por["Cleber Prédio"].observacoes, "Preço");
});

test("funil de contatos: soma automática por origem com as fórmulas da planilha", () => {
  const funil = coord.funilDeContatos(coord.registroDeContatos(state, vendas, "2026-09"));
  const total = funil.find((f) => f.origem === "TOTAL");
  assert.deepEqual(j([total.mensagens, total.agendaram, total.compareceram, total.fecharam]), [4, 3, 2, 1]);
  assert.equal(total.pctAgendamento, 3 / 4, "% agendamento = agendaram / mensagens");
  assert.equal(total.pctFechamento, 1 / 3, "% fechamento sobre agendados");
  const indicacao = funil.find((f) => f.origem === "INDICACAO");
  assert.equal(indicacao.mensagens, 1);
  assert.equal(indicacao.pctAgendamento, 0);
  assert.equal(indicacao.pctFechamento, null, "sem agendados, sem % (a planilha deixa vazio)");
  assert.equal(coord.formataPct(1 / 3), "33,3%");
  assert.equal(coord.formataPct(null), "—");
});

test("abas de PDCA: normalização aceita o que vier do banco", () => {
  const m = coord.normalizaCoordenadorMes({ prescricoes: [{ profissional: "Dr. Daniel", prescritos: "12", fechados: 7 }], planoDeAcao: { plan: "x" } });
  assert.equal(m.prescricoes[0].prescritos, 12);
  assert.equal(m.prescricoes[0].observacoes, "");
  assert.deepEqual(j(m.agendamentos), []);
  assert.equal(m.planoDeAcao.plan, "x");
  assert.equal(m.planoDeAcao.act, "");
});
