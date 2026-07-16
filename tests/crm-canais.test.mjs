import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-06-30", writeLocalValue: () => undefined };

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
    if (request.startsWith("@/")) { const r = request.replace("@/", "src/"); return loadTsModule(path.extname(r) ? r : `${r}.ts`); }
    if (request.startsWith(".")) { const r = path.resolve(path.dirname(absolutePath), request); return loadTsModule(path.relative(repoRoot, path.extname(r) ? r : `${r}.ts`)); }
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Set, Array, Intl, crypto: globalThis.crypto },
    { filename: absolutePath },
  );
  return module.exports;
}

const crm = loadTsModule("src/features/crm/crmData.ts");
const clone = () => JSON.parse(JSON.stringify(crm.demoCrmFixtures));

function contato(over = {}) {
  const base = JSON.parse(JSON.stringify(crm.demoCrmFixtures.contacts[0]));
  return { ...base, id: over.id ?? `c-${Math.random()}`, ...over };
}
function deal(over = {}) {
  const base = JSON.parse(JSON.stringify(crm.demoCrmFixtures.deals[0]));
  return { ...base, id: over.id ?? `d-${Math.random()}`, ...over };
}

// ---- Normalização de canal ----------------------------------------------------

test("normalizeSalesChannel agrupa variações do mesmo canal", () => {
  assert.equal(crm.normalizeSalesChannel("indicação"), "Indicação");
  assert.equal(crm.normalizeSalesChannel("Indicacao"), "Indicação");
  assert.equal(crm.normalizeSalesChannel("instagram"), "Instagram");
  assert.equal(crm.normalizeSalesChannel("Importação Feegow"), "Importação Feegow");
  assert.equal(crm.normalizeSalesChannel(""), "Não informado");
  assert.equal(crm.normalizeSalesChannel("Google Ads"), "Google Ads");
});

// ---- Estatísticas por canal ----------------------------------------------------

test("salesChannelStats conta contatos, fechados e valor por canal", () => {
  const state = clone();
  const indicado = contato({ id: "c-ind", sourceChannel: "Manual", referrerContactId: "c-quem-indicou" });
  const quemIndicou = contato({ id: "c-quem-indicou", fullName: "Maria Indicadora" });
  const insta = contato({ id: "c-insta", sourceChannel: "instagram" });
  const base = {
    ...state,
    contacts: [indicado, quemIndicou, insta],
    deals: [
      deal({ id: "d-ind", contactId: "c-ind", status: "WON_FULL", soldAmount: 12000 }),
      deal({ id: "d-insta", contactId: "c-insta", status: "OPEN", soldAmount: 0 }),
    ],
  };
  const stats = crm.salesChannelStats(base);
  const indicacao = stats.find((s) => s.channel === "Indicação");
  assert.ok(indicacao, "canal Indicação existe");
  assert.equal(indicacao.contacts, 1, "indicado conta como canal Indicação mesmo com sourceChannel Manual");
  assert.equal(indicacao.won, 1);
  assert.equal(indicacao.soldTotal, 12000);
  assert.equal(indicacao.investment, 500, "investimento = R$500 por indicado que fechou");
  const instagram = stats.find((s) => s.channel === "Instagram");
  // 2 = a indicadora (herda Instagram da fixture) + o contato "insta".
  assert.equal(instagram.contacts, 2);
  assert.equal(instagram.won, 0);
});

// ---- Prêmios de indicação ------------------------------------------------------

test("referralRewards deriva o status certo: aguardando → a pagar → pago", () => {
  const state = clone();
  const quem = contato({ id: "c-madrinha", fullName: "Maria Indicadora" });
  const aguardando = contato({ id: "c-a", referrerContactId: "c-madrinha" });
  const aPagar = contato({ id: "c-b", referrerContactId: "c-madrinha" });
  const pago = contato({ id: "c-c", referrerContactId: "c-madrinha", referralRewardPaidAt: "2026-06-20T10:00:00.000Z" });
  const base = {
    ...state,
    contacts: [quem, aguardando, aPagar, pago],
    deals: [
      deal({ id: "d-b", contactId: "c-b", status: "WON_FULL", soldAmount: 9000 }),
      deal({ id: "d-c", contactId: "c-c", status: "WON_PARTIAL", soldAmount: 5000 }),
    ],
  };
  const rewards = crm.referralRewards(base);
  assert.equal(rewards.length, 3);
  const byId = Object.fromEntries(rewards.map((r) => [r.referred.id, r.status]));
  assert.equal(byId["c-a"], "AGUARDANDO");
  assert.equal(byId["c-b"], "A_PAGAR");
  assert.equal(byId["c-c"], "PAGO");
  const totals = crm.referralRewardTotals(rewards);
  assert.equal(totals.aPagar, 500);
  assert.equal(totals.pago, 500);
});

test("REFERRAL_REWARD_VALUE é R$500", () => {
  assert.equal(crm.REFERRAL_REWARD_VALUE, 500);
});

test("setContactReferrer grava quem indicou e marca canal Indicação", () => {
  const state = clone();
  const quem = contato({ id: "c-madrinha" });
  const novo = contato({ id: "c-novo", sourceChannel: "Manual" });
  const base = { ...state, contacts: [quem, novo] };
  const next = crm.setContactReferrer(base, "c-novo", "c-madrinha", "lucas");
  const atualizado = next.contacts.find((c) => c.id === "c-novo");
  assert.equal(atualizado.referrerContactId, "c-madrinha");
  assert.equal(atualizado.sourceChannel, "Indicação");
  assert.ok(next.timelineEvents.some((e) => e.eventType === "REFERRAL_SET"));
  // não permite auto-indicação
  const self = crm.setContactReferrer(base, "c-novo", "c-novo", "lucas");
  assert.equal(self.contacts.find((c) => c.id === "c-novo").referrerContactId ?? null, null);
});

test("markReferralRewardPaid registra a data e o evento", () => {
  const state = clone();
  const quem = contato({ id: "c-madrinha" });
  const indicado = contato({ id: "c-ind", referrerContactId: "c-madrinha" });
  const base = {
    ...state,
    contacts: [quem, indicado],
    deals: [deal({ id: "d-i", contactId: "c-ind", status: "WON_FULL", soldAmount: 9000 })],
  };
  const next = crm.markReferralRewardPaid(base, "c-ind", "financeiro");
  assert.ok(next.contacts.find((c) => c.id === "c-ind").referralRewardPaidAt);
  assert.ok(next.timelineEvents.some((e) => e.eventType === "REFERRAL_REWARD_PAID"));
});
