// CONFERÊNCIA DO FECHAMENTO + MAQUININHA DIA A DIA (18/08/2026)
//
// O caso real: o Lucas viu no extrato que o adiantamento de 13/08 (R$ 20.309,14)
// era maior que o cartão lançado em 12/08 (R$ 14.702,00) e desconfiou de um
// paciente da agenda que não estava no app. Era o GABRIEL PIRES MORANGO:
// R$ 13.808,00 fechados no Kanban, zero lançamento no financeiro.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-08-18", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const cf = loadTsModule("src/features/financeiro/conferenciaFechamento.ts");
const eb = loadTsModule("src/features/financeiro/extratoBanco.ts");

const HOJE = "2026-08-18";

const contato = (id, nome) => ({
  id, fullName: nome, preferredName: "", lifecycleStage: "ACTIVE_PATIENT", contactType: "PATIENT",
  sourceChannel: "", archivedAt: null, phone: "", whatsapp: "", email: "",
});
const deal = (id, contactId, vendido, fechou, status = "WON_FULL") => ({
  id, contactId, title: `Fechamento — ${contactId}`, dealType: "FIRST_CONSULTATION",
  stage: "FECHOU_COMPLETO", estimatedValue: 0, prescribedAmount: 0, soldAmount: vendido,
  receivedAmount: 0, probability: 100, status, mainObjection: "", objectionCategory: "NONE",
  sourceChannel: "", ownerUserId: "u1", doctorId: "", expectedCloseDate: fechou,
  closedAt: `${fechou}T20:00:00.000Z`, createdAt: `${fechou}T10:00:00.000Z`, updatedAt: `${fechou}T20:00:00.000Z`,
});
const comanda = (contactId, dia, valor, method = "CARTAO_CREDITO") => ({
  id: `fsale-${contactId}-${dia}-${valor}`, saleDate: dia, patientName: contactId, crmContactRef: contactId,
  notes: "", items: [], payments: [{ id: "p1", method, amount: valor, installments: 1 }], createdAt: `${dia}T12:00:00.000Z`,
});
const lembrete = (contactId, dia, valor, status = "aberto") => ({
  id: `lem-${contactId}-${dia}`, pacienteNome: contactId, crmContactRef: contactId, valorPendente: valor,
  dataPrevista: dia, status, criadoPor: "u1", criadoEm: `${dia}T10:00:00.000Z`,
});
const estado = (contacts, deals) => ({
  contacts, deals, tasks: [], cadences: [], cadenceSteps: [], cadenceEnrollments: [],
  messageTemplates: [], touchpoints: [], timelineEvents: [],
});

test("o caso Gabriel: fechou 13.808 no Kanban e nada no financeiro → gravidade ALTA", () => {
  const state = estado(
    [contato("contact-tel-11976404880", "GABRIEL PIRES MORANGO")],
    [deal("deal-90e8171d", "contact-tel-11976404880", 13808, "2026-08-12")],
  );
  const pend = cf.conferenciaFechamentos(state, [], [], HOJE);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].chave, "FECHOU_SEM_COMANDA");
  assert.equal(pend[0].gravidade, "ALTA");
  assert.equal(pend[0].pessoas.length, 1);
  assert.equal(pend[0].pessoas[0].nome, "GABRIEL PIRES MORANGO");
  assert.equal(pend[0].pessoas[0].valor, 13808);
  assert.ok(pend[0].pessoas[0].detalhe.includes("nada lançado"));
  assert.ok(pend[0].titulo.includes("13.808,00"));
});

test("o caso Fabiana: fechou 8.831 com crediário combinado para 21/08 → NÃO é furo", () => {
  const state = estado(
    [contato("imp-v-fabiana", "Fabiana Santos da Silva")],
    [deal("deal-fabiana", "imp-v-fabiana", 8831, "2026-08-17")],
  );
  const pend = cf.conferenciaFechamentos(state, [], [lembrete("imp-v-fabiana", "2026-08-21", 8831)], HOJE);
  assert.equal(pend.length, 0);
});

test("comanda cobrindo o valor fechado não acusa nada", () => {
  const state = estado(
    [contato("c-lilian", "lilian grecov")],
    [deal("deal-lilian", "c-lilian", 8296, "2026-08-12")],
  );
  const pend = cf.conferenciaFechamentos(state, [comanda("c-lilian", "2026-08-12", 8296)], [], HOJE);
  assert.equal(pend.length, 0);
});

test("comanda menor que a venda cai em MEDIA, não em ALTA", () => {
  const state = estado(
    [contato("c-x", "Paciente Parcial")],
    [deal("deal-x", "c-x", 10000, "2026-08-11")],
  );
  const pend = cf.conferenciaFechamentos(state, [comanda("c-x", "2026-08-11", 4000)], [], HOJE);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].chave, "COMANDA_MENOR_QUE_VENDA");
  assert.equal(pend[0].gravidade, "MEDIA");
  assert.equal(pend[0].pessoas[0].valor, 6000);
});

test("comanda + crediário juntos fecham a conta (entrada no cartão, resto agendado)", () => {
  const state = estado(
    [contato("c-y", "Paciente Misto")],
    [deal("deal-y", "c-y", 10000, "2026-08-11")],
  );
  const pend = cf.conferenciaFechamentos(state, [comanda("c-y", "2026-08-11", 4000)], [lembrete("c-y", "2026-08-30", 6000)], HOJE);
  assert.equal(pend.length, 0);
});

test("crediário já pago não conta como dinheiro agendado", () => {
  const state = estado(
    [contato("c-z", "Paciente Pago")],
    [deal("deal-z", "c-z", 5000, "2026-08-11")],
  );
  const pend = cf.conferenciaFechamentos(state, [], [lembrete("c-z", "2026-08-12", 5000, "pago")], HOJE);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].chave, "FECHOU_SEM_COMANDA");
});

test("venda importada da planilha fica em BAIXA e separada (Karla, Durval)", () => {
  const state = estado(
    [contato("imp-v-karla", "Karla Roberta Alfieri"), contato("imp-v-durval", "Durval de Santana Nunes")],
    [
      deal("imp-v-karla-deal", "imp-v-karla", 18460, "2026-08-10"),
      deal("imp-v-durval-deal", "imp-v-durval", 11686, "2026-08-03"),
    ],
  );
  const pend = cf.conferenciaFechamentos(state, [comanda("imp-v-durval", "2026-08-04", 3063, "PIX")], [], HOJE);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].chave, "VEIO_DA_PLANILHA");
  assert.equal(pend[0].gravidade, "BAIXA");
  // maior primeiro: Karla 18.460 antes do Durval (11.686 − 3.063 = 8.623)
  assert.equal(pend[0].pessoas.map((p) => p.valor).join("|"), "18460|8623");
});

test("negociação em aberto e perdida ficam fora, e fechamento antigo sai da janela", () => {
  const state = estado(
    [contato("c-a", "Aberta"), contato("c-b", "Perdida"), contato("c-c", "Antiga")],
    [
      { ...deal("deal-a", "c-a", 9000, "2026-08-12"), status: "OPEN", closedAt: null },
      deal("deal-b", "c-b", 9000, "2026-08-12", "LOST"),
      deal("deal-c", "c-c", 9000, "2026-05-02"),
    ],
  );
  assert.equal(cf.conferenciaFechamentos(state, [], [], HOJE).length, 0);
});

// --------------------------- maquininha dia a dia ---------------------------
const bank = (dia, descricao, valor) => ({
  ref: `${dia}-${valor}`, entryDate: dia, description: descricao, counterparty: "", document: "",
  amount: valor, balance: null,
});
const ADIANT = "TRANSFERÊNCIA AUTOM. RECEBIDA 0138.46448-2";

test("o dia 12/08 real: caiu 20.309,14 para 14.702,00 de cartão → SOBROU_NO_BANCO", () => {
  const sales = [
    comanda("c-priscilla", "2026-08-12", 1416),
    comanda("c-wilson", "2026-08-12", 4990),
    comanda("c-lilian", "2026-08-12", 8296),
  ];
  const balde = eb.conciliarExtrato([bank("2026-08-13", ADIANT, 20309.14)], sales, [], [], "2026-08-13", "2026-08-13");
  const dia = balde.maquininha.porDia.find((d) => d.diaTransferencia === "2026-08-13");
  assert.ok(dia, "o dia 13/08 tem de aparecer na conferência");
  assert.equal(dia.diaCartao, "2026-08-12");
  assert.equal(dia.cartao, 14702);
  assert.equal(dia.transferencia, 20309.14);
  assert.equal(dia.sobra, 5607.14);
  assert.equal(dia.situacao, "SOBROU_NO_BANCO");
  assert.equal(balde.maquininha.situacao, "SOBROU_NO_BANCO");
  assert.ok(balde.maquininha.leitura.includes("13/08"));
  assert.ok(balde.maquininha.leitura.includes("12/08"));
});

test("dia normal (taxa de 5%) fica OK", () => {
  const balde = eb.conciliarExtrato(
    [bank("2026-08-18", ADIANT, 5638.25)],
    [comanda("c-k", "2026-08-17", 5935)],
    [], [], "2026-08-18", "2026-08-18",
  );
  const dia = balde.maquininha.porDia[0];
  assert.equal(dia.situacao, "OK");
  assert.equal(dia.taxaImplicita, 5);
  assert.equal(dia.sobra, 0);
});

test("cartão de sexta cai na segunda: a véspera é dia ÚTIL, não ontem", () => {
  // 07/08/2026 é sexta; 10/08 é segunda.
  assert.equal(eb.diaUtilAnterior("2026-08-10"), "2026-08-07");
  assert.equal(eb.proximoDiaUtil("2026-08-07"), "2026-08-10");
  const balde = eb.conciliarExtrato(
    [bank("2026-08-10", ADIANT, 950)],
    [comanda("c-sexta", "2026-08-07", 1000)],
    [], [], "2026-08-10", "2026-08-10",
  );
  assert.equal(balde.maquininha.porDia[0].diaCartao, "2026-08-07");
  assert.equal(balde.maquininha.porDia[0].situacao, "OK");
});

test("cartão lançado e adiantamento que não caiu no período → FALTOU_CAIR", () => {
  const balde = eb.conciliarExtrato([], [comanda("c-w", "2026-08-11", 4000)], [], [], "2026-08-11", "2026-08-14");
  const dia = balde.maquininha.porDia.find((d) => d.diaCartao === "2026-08-11");
  assert.ok(dia);
  assert.equal(dia.transferencia, 0);
  assert.equal(dia.situacao, "FALTOU_CAIR");
});

test("cartão do último dia da janela não vira alarme (o dinheiro cai depois do período)", () => {
  const balde = eb.conciliarExtrato([], [comanda("c-hoje", "2026-08-18", 2548)], [], [], "2026-08-01", "2026-08-18");
  assert.equal(balde.maquininha.porDia.length, 0);
});

test("dinheiro do fechamento no CAIXA do crediário conta como registrado (regra 20/08)", () => {
  const state = estado(
    [contato("c-cash", "Paciente Dinheiro")],
    [deal("deal-cash", "c-cash", 3000, "2026-08-15")],
  );
  const caixa = [{ id: "fcash-1", entryDate: "2026-08-15", direction: "ENTRADA", description: "Fechamento — Paciente Dinheiro (dinheiro)", amount: 3000, crmContactRef: "c-cash" }];
  assert.equal(cf.conferenciaFechamentos(state, [], [], HOJE, 45, caixa).length, 0, "dinheiro no caixa não é furo");
  // saída do caixa não conta, e caixa de OUTRO paciente também não
  const caixaErrado = [
    { id: "fcash-2", entryDate: "2026-08-15", direction: "SAIDA", description: "x", amount: 3000, crmContactRef: "c-cash" },
    { id: "fcash-3", entryDate: "2026-08-15", direction: "ENTRADA", description: "y", amount: 3000, crmContactRef: "c-outro" },
  ];
  assert.equal(cf.conferenciaFechamentos(state, [], [], HOJE, 45, caixaErrado).length, 1);
});
