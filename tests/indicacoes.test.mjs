// INDICAÇÕES (19/08/2026): "quinhentos reais por paciente que PASSAR COM O
// DOUTOR" — o voucher libera pela consulta paga (comanda), não pelo plano.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-19", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const crm = loadTsModule("src/features/crm/crmData.ts");

function base() {
  let state = { contacts: [], deals: [], tasks: [], cadences: [], cadenceSteps: [], cadenceEnrollments: [], messageTemplates: [], touchpoints: [], timelineEvents: [] };
  const x = crm.findOrCreateCrmContact(state, { fullName: "Paciente X", phone: "11911111111" }, "u1");
  state = x.state;
  const y = crm.findOrCreateCrmContact(state, { fullName: "Yara Menezes", phone: "11922222222" }, "u1");
  state = y.state;
  const z = crm.findOrCreateCrmContact(state, { fullName: "Zilda Prado", phone: "11933333333" }, "u1");
  state = z.state;
  state = crm.setContactReferrer(state, y.contact.id, x.contact.id, "u1");
  state = crm.setContactReferrer(state, z.contact.id, x.contact.id, "u1");
  return { state, x: x.contact.id, y: y.contact.id, z: z.contact.id };
}

test("X indicou Y e Z: Y passou com o doutor (comanda de consulta) → voucher do Y libera, Z aguarda", () => {
  const { state, x, y, z } = base();
  const rewards = crm.referralRewards(state, new Set([y]));
  const doY = rewards.find((r) => r.referred.id === y);
  const doZ = rewards.find((r) => r.referred.id === z);
  assert.equal(doY.status, "A_PAGAR");
  assert.equal(doZ.status, "AGUARDANDO");

  const grupos = crm.indicadoresResumo(rewards);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].indicador.id, x);
  assert.equal(grupos[0].indicacoes.length, 2);
  assert.equal(grupos[0].vouchersLiberados, 1);
  assert.equal(grupos[0].aReceber, 500);
});

test("negociação ganha também libera (fechou na consulta = passou com o doutor)", () => {
  let { state, y } = base();
  state = crm.createDealForContact(state, { contactId: y, title: "Fechamento — Yara", ownerUserId: "u1", estimatedValue: 100, sourceChannel: "t" });
  const dealId = state.deals[0].id;
  state = { ...state, deals: state.deals.map((d) => (d.id === dealId ? { ...d, status: "WON_FULL", soldAmount: 5000 } : d)) };
  const rewards = crm.referralRewards(state, new Set());
  assert.equal(rewards.find((r) => r.referred.id === y).status, "A_PAGAR");
});

test("voucher pago fica PAGO e não volta a liberar", () => {
  let { state, y } = base();
  state = crm.markReferralRewardPaid(state, y, "coord");
  const rewards = crm.referralRewards(state, new Set([y]));
  assert.equal(rewards.find((r) => r.referred.id === y).status, "PAGO");
});

test("auto-indicação é ignorada e quem não tem indicador fica fora", () => {
  let { state, x } = base();
  state = crm.setContactReferrer(state, x, x, "u1");
  const rewards = crm.referralRewards(state, new Set());
  assert.ok(!rewards.some((r) => r.referred.id === x), "X não pode indicar a si mesmo");
  assert.equal(rewards.length, 2, "só Y e Z são indicações");
});

// ---- vídeo da recepção (01/09/2026): "Registrar indicação não está indo" ----
// Dois defeitos na TELA (o motor estava certo): o erro aparecia só no topo da
// página (fora da vista de quem está no formulário) e quem INDICA precisava
// já existir no CRM — mas indicador pode ser gente nova (Joel, pai do Kayo).
// O motor não muda; estes testes seguram o contrato da tela no código-fonte.
import { readFileSync } from "node:fs";

test("a tela cria o indicador novo quando ele foi digitado sem cadastro", () => {
  const fonte = readFileSync(new URL("../src/features/crm/CrmCanaisPage.tsx", import.meta.url), "utf8");
  assert.match(fonte, /referrerFinalId/, "existe o caminho de criar o indicador");
  assert.match(fonte, /Indicação \(indicador\)/, "o indicador novo nasce com origem própria");
  assert.match(fonte, /referrerQuery\.trim\(\)\.length < 3/, "nome digitado curto ainda é barrado");
  assert.ok(!/Escolha QUEM indicou \(busque a pessoa na primeira caixa\)/.test(fonte), "a trava antiga saiu");
});

test("o erro do formulário aparece colado no botão, não só no topo da página", () => {
  const fonte = readFileSync(new URL("../src/features/crm/CrmCanaisPage.tsx", import.meta.url), "utf8");
  assert.match(fonte, /formError/, "estado de erro do formulário existe");
  const posBotao = fonte.indexOf("Registrar indicação\n                </LiquidButton>");
  const posErro = fonte.indexOf("{formError ? (");
  assert.ok(posErro > posBotao && posErro - posBotao < 400, "o erro renderiza logo abaixo do botão");
});
