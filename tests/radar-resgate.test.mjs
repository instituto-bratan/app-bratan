// RADAR DE RESGATE (20/08/2026): "a gente precisa saber quem passou sessenta
// dias atrás" — a última comanda diz quando o paciente veio; o radar separa em
// 60d / 6m / 1a (as três réguas) e só mostra quem NINGUÉM está cuidando.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-20", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const rd = loadTsModule("src/features/crm/resgateData.ts");

const HOJE = "2026-08-20";
const contato = (id, nome, extra = {}) => ({
  id, contactType: "PATIENT", lifecycleStage: "ACTIVE_PATIENT", fullName: nome, preferredName: "", phone: "", whatsapp: "",
  email: "", instagram: "", sourceChannel: "", acquisitionCampaign: "", leadTemperature: "WARM", personaFit: "", mainPain: "",
  mainGoal: "", ownerUserId: "u1", commercialOwnerId: "", conciergeOwnerId: "", nurseOwnerId: "", doctorId: "", notes: "",
  optOut: false, createdBy: "u1", createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z",
  archivedAt: null, referrerContactId: "", referralRewardPaidAt: null, ...extra,
});
const comanda = (contactId, dia) => ({
  id: `fsale-${contactId}-${dia}`, saleDate: dia, patientName: contactId, crmContactRef: contactId, notes: "",
  items: [], payments: [{ id: "p", method: "PIX", amount: 100, installments: 1 }], createdAt: `${dia}T12:00:00.000Z`,
});
const estado = (contacts, extra = {}) => ({
  contacts, deals: [], tasks: [], cadences: [], cadenceSteps: [], cadenceEnrollments: [], messageTemplates: [],
  touchpoints: [], timelineEvents: [], ...extra,
});

test("faixas certas: 55 dias = chegando; 61 = D60; 200 = 6 meses; 400 = 1 ano; 30 = fora", () => {
  const state = estado([contato("a", "Ana"), contato("b", "Bia"), contato("c", "Caio"), contato("d", "Duda"), contato("e", "Edu")]);
  const sales = [
    comanda("a", "2026-06-26"), // 55 dias
    comanda("b", "2026-06-20"), // 61 dias
    comanda("c", "2026-02-01"), // 200 dias
    comanda("d", "2025-07-17"), // 399 dias → M6? 399 < 365? nao, 399 >= 365 → A1
    comanda("e", "2026-07-21"), // 30 dias → fora
  ];
  const radar = rd.radarDeResgate(state, sales, HOJE);
  const porId = Object.fromEntries(radar.map((p) => [p.contact.id, p.faixa]));
  assert.equal(porId.a, "CHEGANDO");
  assert.equal(porId.b, "D60");
  assert.equal(porId.c, "M6");
  assert.equal(porId.d, "A1");
  assert.ok(!("e" in porId), "30 dias não é resgate");
});

test("vale a comanda MAIS RECENTE do paciente", () => {
  const state = estado([contato("a", "Ana")]);
  const sales = [comanda("a", "2026-01-10"), comanda("a", "2026-07-30")];
  assert.equal(rd.radarDeResgate(state, sales, HOJE).length, 0, "voltou há 21 dias — fora do radar");
});

test("quem já está sendo cuidado fica FORA: negociação aberta, jornada ativa ou cadência ativa", () => {
  const dealAberto = { id: "d1", contactId: "a", title: "", dealType: "FIRST_CONSULTATION", stage: "EM_NEGOCIACAO", estimatedValue: 0, prescribedAmount: 0, soldAmount: 0, receivedAmount: 0, probability: 50, status: "OPEN", mainObjection: "", objectionCategory: "OTHER", sourceChannel: "", ownerUserId: "u", doctorId: "", expectedCloseDate: "", closedAt: null, createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z" };
  const jornada = { ...dealAberto, id: "d2", contactId: "b", status: "WON_FULL", programPhase: "TRES_CONTATOS_D1", programOutcome: null };
  const enrollment = { id: "e1", cadenceId: "cad-rescue-60d", contactId: "c", dealId: "", status: "ACTIVE", enrolledAt: "", triggerSource: "", triggerDate: "2026-08-01", ownerUserId: "", ownerRole: "CONCIERGE", completedAt: null, canceledReason: "" };
  const state = estado(
    [contato("a", "Ana"), contato("b", "Bia"), contato("c", "Caio"), contato("d", "Duda")],
    { deals: [dealAberto, jornada], cadenceEnrollments: [enrollment] },
  );
  const sales = ["a", "b", "c", "d"].map((id) => comanda(id, "2026-05-01")); // 111 dias
  const radar = rd.radarDeResgate(state, sales, HOJE);
  assert.equal(radar.length, 1, "só a Duda está sem ninguém olhando");
  assert.equal(radar[0].contact.id, "d");
});

test("arquivado e quem nunca teve comanda ficam fora; D60 vem antes na ordenação", () => {
  const state = estado([contato("a", "Ana", { archivedAt: "2026-08-01T00:00:00.000Z" }), contato("b", "Bia"), contato("c", "Caio")]);
  const sales = [comanda("a", "2026-05-01"), comanda("b", "2026-06-26"), comanda("c", "2026-06-15")]; // b=55 chegando, c=66 D60
  const radar = rd.radarDeResgate(state, sales, HOJE);
  assert.equal(radar.length, 2);
  assert.equal(radar[0].contact.id, "c", "D60 é mais acionável que 'chegando'");
  assert.equal(rd.cadenciaDaFaixa.D60, "cad-rescue-60d");
});
