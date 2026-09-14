// CANAL ERRADO NO FECHAMENTO (10/09/2026, áudio da CEO: "ele entrou novamente
// como programa e ele não é programa, ele é uma consulta black... vai entrar na
// cadência errada"). Corrigir o canal reescreve a régua sem apagar o fechamento.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-09-10", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const cat = loadTsModule("src/features/financeiro/catalogoPrecificacao.ts");
const j = (v) => JSON.parse(JSON.stringify(v));
const ATOR = "gestao";

/** Paciente com jornada aberta no canal pedido, já em Boas-vindas (D+1). */
function jornadaEm(canal) {
  const contato = { id: "c1", contactType: "PATIENT", lifecycleStage: "PATIENT", fullName: "Carlos Urnikes", preferredName: "Carlos", phone: "11999990000", whatsapp: "", sourceChannel: "", createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z" };
  let state = { ...crm.seedCrmState, contacts: [contato], deals: [], tasks: [], cadenceEnrollments: [] };
  state = crm.createDealForContact(state, { contactId: "c1", title: "Fechamento — Carlos Urnikes", ownerUserId: ATOR, estimatedValue: 1500 });
  const dealId = state.deals[0].id;
  state = crm.startProgramJourney(state, dealId, canal, ATOR);
  state = crm.setProgramPhase(state, dealId, "TRES_CONTATOS_D1", ATOR);
  return { state, dealId };
}
const gatesDe = (state, dealId) =>
  state.tasks.filter((t) => t.dealId === dealId && t.isGate).map((t) => [t.id.split("-").pop(), t.status, t.title]);

test("Programa → Consulta Black: cancela a tarefa que não é da esteira nova, mantém a fase e reescreve o texto da recepção", () => {
  const { state, dealId } = jornadaEm("PROGRAMA_ACOMPANHAMENTO");
  const antes = gatesDe(state, dealId);
  assert.ok(antes.some(([k, s]) => k === "enfermeira" && s === "PENDING"), "Programa tem gate da enfermeira");
  assert.ok(antes.some(([k]) => k === "recepcao"), "Programa tem gate da recepção");

  const r = crm.corrigirCanalDaJornada(state, dealId, "CLUBE_BRATAN", ATOR);
  assert.equal(r.ok, true, r.message);
  const deal = r.state.deals.find((d) => d.id === dealId);
  assert.equal(deal.adhesionChannel, "CLUBE_BRATAN", "canal corrigido");
  assert.equal(deal.programPhase, "TRES_CONTATOS_D1", "a fase NÃO volta para o começo");

  const depois = gatesDe(r.state, dealId);
  const enfermeira = depois.find(([k]) => k === "enfermeira");
  assert.equal(enfermeira[1], "CANCELED", "enfermeira não é da esteira do Clube");
  const concierge = depois.find(([k]) => k === "concierge");
  assert.equal(concierge[1], "PENDING", "boas-vindas da Concierge continua");
  const recepcao = depois.find(([k]) => k === "recepcao");
  assert.equal(recepcao[1], "PENDING");
  assert.match(recepcao[2], /agendar a próxima consulta/i, "título do canal novo (era 'mensagem de agendamento')");
  const recepcaoTask = r.state.tasks.find((t) => t.dealId === dealId && t.id.endsWith("-recepcao"));
  assert.match(recepcaoTask.description, /pr[oó]xima consulta do Clube/i, "descrição do canal novo");
  assert.match(r.message, /Consulta Black/);
  assert.ok(r.state.timelineEvents.some((e) => /Canal corrigido/.test(e.eventTitle)), "fica no histórico");
});

test("o que já foi feito não é desfeito: tarefa concluída da esteira antiga fica concluída", () => {
  const { state, dealId } = jornadaEm("PROGRAMA_ACOMPANHAMENTO");
  const enfermeira = state.tasks.find((t) => t.dealId === dealId && t.isGate && t.id.endsWith("-enfermeira"));
  const feito = crm.completeCrmTask(state, enfermeira.id, { result: "SENT", actorId: "enfermagem" });
  const r = crm.corrigirCanalDaJornada(feito, dealId, "CLUBE_BRATAN", ATOR);
  const depois = r.state.tasks.find((t) => t.id === enfermeira.id);
  assert.notEqual(depois.status, "CANCELED", "não cancela o que a enfermeira já mandou");
});

test("Consulta avulsa: sai da esteira, cancela os gates pendentes e não apaga o fechamento", () => {
  const { state, dealId } = jornadaEm("PROGRAMA_ACOMPANHAMENTO");
  const r = crm.corrigirCanalDaJornada(state, dealId, null, ATOR);
  assert.equal(r.ok, true, r.message);
  const deal = r.state.deals.find((d) => d.id === dealId);
  assert.equal(deal.programPhase, null, "fora do quadro do Plano");
  assert.equal(deal.adhesionChannel, null);
  assert.ok(r.state.deals.some((d) => d.id === dealId), "o fechamento continua existindo");
  assert.equal(gatesDe(r.state, dealId).every(([, s]) => s === "CANCELED"), true, "nada pendente sobra na régua");
});

test("trocar para o mesmo canal não faz nada; canal certo em quem não tem jornada abre a esteira do começo", () => {
  const { state, dealId } = jornadaEm("CLUBE_BRATAN");
  const igual = crm.corrigirCanalDaJornada(state, dealId, "CLUBE_BRATAN", ATOR);
  assert.equal(igual.ok, false);
  assert.match(igual.message, /já está como/);

  const semJornada = crm.corrigirCanalDaJornada(state, dealId, null, ATOR).state;
  const volta = crm.corrigirCanalDaJornada(semJornada, dealId, "PROGRAMA_ACOMPANHAMENTO", ATOR);
  assert.equal(volta.ok, true, volta.message);
  const deal = volta.state.deals.find((d) => d.id === dealId);
  assert.equal(deal.programPhase, "FECHAMENTO_D0", "esteira nova começa no D0");
  assert.equal(deal.adhesionChannel, "PROGRAMA_ACOMPANHAMENTO");
});

test("sinal de R$ 200 existe no catálogo, ao lado do de R$ 500 (áudio da CEO)", () => {
  const sinais = cat.CATALOGO_PRECIFICACAO.filter((p) => p.tipos.includes("SINAL"));
  assert.deepEqual(j(sinais.map((p) => [p.nome, p.preco])), [["Sinal de consulta", 500], ["Sinal de consulta (R$ 200)", 200]]);
  const duzentos = cat.produtoPorNome("Sinal de consulta (R$ 200)");
  assert.equal(duzentos.preco, 200);
  // mesma FÓRMULA da planilha OFICIAL (linha do sinal): 200 − NF 13,33% (26,66) − comissão 10% (20,00) − 15 min de sala (25,51)
  assert.equal(duzentos.lucroBruto, 127.83);
  assert.ok(cat.secoesDoCatalogo().some((g) => g.produtos.some((p) => p.nome === "Sinal de consulta (R$ 200)")), "aparece no seletor");
});
