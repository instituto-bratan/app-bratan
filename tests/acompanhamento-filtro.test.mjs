// ACOMPANHAMENTO: filtro por canal e conferência (17/08/2026)
// Pedido do Lucas: "adicionasse um filtro pra gente filtrar quem está em
// acompanhamento de tratamento, de só programa... e conferisse se está todo
// conectado, se está tudo linkado, e se está faltando alguma pessoa que deixou
// passar."
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-17", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const pg = loadTsModule("src/features/programa/programaData.ts");

const contato = (id, nome, stage = "ACTIVE_PATIENT", extra = {}) => ({
  id, fullName: nome, preferredName: "", lifecycleStage: stage, contactType: "PATIENT",
  sourceChannel: "", archivedAt: null, phone: "", whatsapp: "", email: "", ...extra,
});
const deal = (id, contactId, extra = {}) => ({
  id, contactId, title: "", status: "WON_FULL", stage: "FECHOU_COMPLETO",
  adhesionChannel: "PROGRAMA_ACOMPANHAMENTO", programPhase: "CADENCIA_PROGRAMA", programOutcome: null,
  programPhaseEnteredAt: "2026-07-01T12:00:00Z", programMilestonesDone: [],
  soldAmount: 9000, receivedAmount: 9000, closedAt: "2026-07-01T12:00:00Z",
  createdAt: "2026-07-01T12:00:00Z", updatedAt: "2026-07-01T12:00:00Z", ...extra,
});
const estado = (contacts, deals) => ({
  contacts, deals, tasks: [], cadences: [], cadenceSteps: [], cadenceEnrollments: [],
  messageTemplates: [], touchpoints: [], timelineEvents: [],
});

// ------------------------------------------------------------ FILTRO POR CANAL
test("conta quantos pacientes há em cada canal", () => {
  const st = estado(
    [contato("c1", "Ana"), contato("c2", "Bruno"), contato("c3", "Carla"), contato("c4", "Davi")],
    [
      deal("d1", "c1", { adhesionChannel: "PROGRAMA_ACOMPANHAMENTO" }),
      deal("d2", "c2", { adhesionChannel: "SOMENTE_TRATAMENTO" }),
      deal("d3", "c3", { adhesionChannel: "SOMENTE_TRATAMENTO" }),
      deal("d4", "c4", { adhesionChannel: null }),
    ],
  );
  const board = pg.buildProgramaBoard(st, "2026-08-17");
  const contagem = pg.contagemPorCanal(board);
  assert.equal(contagem.TODOS, 4);
  assert.equal(contagem.PROGRAMA_ACOMPANHAMENTO, 1);
  assert.equal(contagem.SOMENTE_TRATAMENTO, 2);
  assert.equal(contagem.CLUBE_BRATAN, 0);
  assert.equal(contagem.SEM_CANAL, 1, "quem não tem canal é contado à parte");
});

test("o filtro separa só tratamento de programa, e acha quem está sem canal", () => {
  const st = estado(
    [contato("c1", "Ana"), contato("c2", "Bruno"), contato("c3", "Carla")],
    [
      deal("d1", "c1", { adhesionChannel: "PROGRAMA_ACOMPANHAMENTO" }),
      deal("d2", "c2", { adhesionChannel: "SOMENTE_TRATAMENTO" }),
      deal("d3", "c3", { adhesionChannel: null }),
    ],
  );
  const board = pg.buildProgramaBoard(st, "2026-08-17");
  const filtrar = (canal) => board.filter((card) => pg.cardNoCanal(card, canal)).map((card) => card.patientName);
  assert.deepEqual(filtrar("TODOS").sort().join(","), "Ana,Bruno,Carla");
  assert.equal(filtrar("PROGRAMA_ACOMPANHAMENTO").join(","), "Ana");
  assert.equal(filtrar("SOMENTE_TRATAMENTO").join(","), "Bruno");
  assert.equal(filtrar("SEM_CANAL").join(","), "Carla");
  assert.equal(filtrar("CLUBE_BRATAN").length, 0);
});

test("os rótulos do filtro estão em português e completos", () => {
  for (const chave of ["TODOS", "PROGRAMA_ACOMPANHAMENTO", "CLUBE_BRATAN", "SOMENTE_TRATAMENTO", "SEM_CANAL"]) {
    assert.ok(pg.canalFiltroLabels[chave], `falta rótulo para ${chave}`);
  }
  assert.match(pg.canalFiltroLabels.SOMENTE_TRATAMENTO, /Tratamento/);
  assert.match(pg.canalFiltroLabels.SEM_CANAL, /Sem canal/);
});

// ---------------------------------------------------------------- CONFERÊNCIA
test("acusa quem está no acompanhamento sem canal (escapa de qualquer filtro)", () => {
  const st = estado([contato("c1", "Ana")], [deal("d1", "c1", { adhesionChannel: null })]);
  const pendencia = pg.conferenciaAcompanhamento(st, "2026-08-17").find((item) => item.chave === "SEM_CANAL");
  assert.ok(pendencia, "a pendência existe");
  assert.equal(pendencia.gravidade, "ALTA");
  assert.equal(pendencia.pessoas.length, 1);
  assert.equal(pendencia.pessoas[0].nome, "Ana");
  assert.match(pendencia.porque, /não aparece em nenhum filtro/i);
  assert.ok(pendencia.oQueFazer.length > 20, "diz o que fazer");
});

test("acusa quem aderiu a um plano e ficou fora do acompanhamento", () => {
  const st = estado(
    [contato("c1", "Ana")],
    [deal("d1", "c1", { programPhase: null, adhesionChannel: "CLUBE_BRATAN" })],
  );
  const pendencia = pg.conferenciaAcompanhamento(st, "2026-08-17").find((item) => item.chave === "GANHOU_FORA");
  assert.ok(pendencia, "aderiu ao Clube mas a jornada nunca começou");
  assert.equal(pendencia.gravidade, "ALTA");
  assert.match(pendencia.porque, /jornada nunca começou/i);
});

test("consulta avulsa NÃO é acusada como falha (fecha sem canal, de propósito)", () => {
  // No Kanban, "Consulta avulsa" fecha a venda sem canal de adesão e sem
  // jornada. Acusar isso encheria a tela de alarme falso.
  const st = estado([contato("c1", "Karla")], [deal("d1", "c1", { programPhase: null, adhesionChannel: null })]);
  const pendencias = pg.conferenciaAcompanhamento(st, "2026-08-17");
  assert.ok(!pendencias.some((item) => item.chave === "GANHOU_FORA"), "avulsa não é falha");
});

test("acusa paciente sem nenhuma negociação (comanda lançada sem passar pelo Kanban)", () => {
  const st = estado([contato("c1", "Ana"), contato("c2", "Bruno")], [deal("d1", "c1")]);
  const pendencia = pg.conferenciaAcompanhamento(st, "2026-08-17").find((item) => item.chave === "PACIENTE_SEM_NEGOCIACAO");
  assert.ok(pendencia);
  assert.equal(pendencia.pessoas.length, 1);
  assert.equal(pendencia.pessoas[0].nome, "Bruno");
  assert.equal(pendencia.gravidade, "MEDIA");
});

test("paciente arquivado não entra na conferência", () => {
  const st = estado([contato("c1", "Ana", "ACTIVE_PATIENT", { archivedAt: "2026-08-01T12:00:00Z" })], []);
  const pendencias = pg.conferenciaAcompanhamento(st, "2026-08-17");
  assert.ok(!pendencias.some((item) => item.pessoas.some((p) => p.nome === "Ana")));
});

test("acusa cadastro repetido usando subconjunto de nome, sem juntar gente diferente", () => {
  const st = estado(
    [
      contato("c1", "ALESSANDRA SALES"),
      contato("c2", "ALESSANDRA SALES OLIVEIRA"),
      contato("c3", "Maria Silva"),
      contato("c4", "Maria Souza"),
    ],
    [],
  );
  const pendencia = pg.conferenciaAcompanhamento(st, "2026-08-17").find((item) => item.chave === "NOME_DUPLICADO");
  assert.ok(pendencia, "achou o cadastro repetido");
  const nomes = pendencia.pessoas.map((p) => p.nome).sort().join(" | ");
  assert.match(nomes, /ALESSANDRA SALES \| ALESSANDRA SALES OLIVEIRA/);
  assert.ok(!nomes.includes("Maria"), "Maria Silva e Maria Souza são pessoas diferentes — não podem casar");
});

test("estado limpo não gera pendência nenhuma", () => {
  const st = estado([contato("c1", "Ana")], [deal("d1", "c1")]);
  assert.equal(pg.conferenciaAcompanhamento(st, "2026-08-17").length, 0);
});
