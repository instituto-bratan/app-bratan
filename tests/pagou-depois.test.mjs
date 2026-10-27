// PAGOU DEPOIS (27/10/2026). Lucas: "às vezes o Estevão coloca no Kanban que o
// paciente não fechou, porque ele só vai pagar depois. E quando o paciente paga
// depois, ele ainda fica como não fechou no Kanban." Agora o pagamento de
// tratamento, plano ou medicação fecha o cartão sozinho; consulta e sinal não.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
// O "não fechou" dos testes é registrado em 20/10/2026.
const localStoreStub = { readLocalValue: (_k, f) => f, todayISO: () => "2026-10-20", writeLocalValue: () => undefined, formatShortTime: () => "00:00" };
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
const pd = loadTsModule("src/features/crm/pagouDepois.ts");
const dinheiro = loadTsModule("src/features/financeiro/dinheiroDaComanda.ts");
const nat = loadTsModule("src/features/financeiro/naturezaItem.ts");
const j = (v) => JSON.parse(JSON.stringify(v));
const ATOR = "gestao";

/** Paciente fictício com o cartão em "Não fechou" desde 20/10 (régua da Concierge ligada). */
function naoFechou({ comCincoLigacoes = false } = {}) {
  const contato = { id: "c1", contactType: "PATIENT", lifecycleStage: "CONSULTED", fullName: "Paciente Teste", preferredName: "Paciente", phone: "11999990000", whatsapp: "", email: "", sourceChannel: "", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z" };
  let state = { ...crm.seedCrmState, contacts: [contato], deals: [], tasks: [], cadenceEnrollments: [], timelineEvents: [] };
  state = crm.createDealForContact(state, { contactId: "c1", title: "Fechamento — Paciente Teste", ownerUserId: ATOR, estimatedValue: 0 });
  const dealId = state.deals[0].id;
  const r = crm.moveDealStage(state, dealId, { actorId: ATOR, stage: "NAO_FECHOU", objection: "vai pagar dia 22/10", objectionCategory: "PAYMENT_METHOD" });
  assert.equal(r.ok, true, r.message);
  // O "hoje" do teste é 20/10, mas o relógio da máquina é o de verdade: o
  // registro (histórico e inscrição) fica às 14h de 20/10, como seria no app.
  const REGISTRO = "2026-10-20T17:00:00.000Z";
  state = {
    ...r.state,
    timelineEvents: r.state.timelineEvents.map((e) => ({ ...e, createdAt: REGISTRO })),
    cadenceEnrollments: r.state.cadenceEnrollments.map((e) => ({ ...e, enrolledAt: REGISTRO, createdAt: REGISTRO, updatedAt: REGISTRO })),
  };
  if (comCincoLigacoes) {
    // D5 sem resposta: as 5 ligações do Estevão assumem.
    state = crm.enrollContactInCadence(
      state,
      { cadenceId: "cad-gestor-5lig", contactId: "c1", dealId, triggerSource: "escalonado: cad-not-closed sem resposta no D5", triggerDate: "2026-10-25", ownerUserId: "gestao", ownerRole: "ADMIN_GESTAO" },
      { replaceActive: true },
    );
  }
  return { state, dealId };
}

const pagamento = (dia, itens, extra = {}) => ({
  id: `fsale-${dia}-${itens.map((i) => i.description).join("-").slice(0, 20)}`,
  contactRef: "c1",
  dia,
  criadoEm: `${dia}T14:00:00.000Z`,
  valor: itens.reduce((s, i) => s + (i.amount ?? 0), 0),
  itens,
  ...extra,
});
const item = (itemType, description, amount) => ({ itemType, description, amount });

test("pagou o tratamento dois dias depois: o cartão vai para Fechou no dia do pagamento e a régua do não-fechou para", () => {
  const { state, dealId } = naoFechou();
  const nc = state.cadenceEnrollments.find((e) => e.cadenceId === "cad-not-closed" && e.dealId === dealId);
  assert.equal(nc?.status, "ACTIVE", "começa com a Concierge acolhendo");

  const pago = pagamento("2026-10-22", [item("TRATAMENTO", "Testosterona base / cipionato / enantato", 980)]);
  const r = pd.fecharQuemPagouDepois(state, [pago], { hoje: "2026-10-22" });
  assert.equal(r.fechados.length, 1);
  const deal = r.state.deals.find((d) => d.id === dealId);
  assert.equal(deal.stage, "FECHOU_COMPLETO");
  assert.equal(deal.status, "WON_FULL");
  assert.equal(deal.closedAt.slice(0, 10), "2026-10-22", "fecha no dia em que pagou");
  assert.equal(deal.soldAmount, 980);
  assert.equal(deal.receivedAmount, 980);
  assert.equal(deal.adhesionChannel, "SOMENTE_TRATAMENTO", "sem plano nem histórico: Só Tratamento");
  assert.equal(deal.programPhase, "TRES_CONTATOS_D1", "boas-vindas do D+1");
  const gates = r.state.tasks.filter((t) => t.dealId === dealId && t.isGate).map((t) => t.assignedToRole).sort();
  assert.deepEqual(j(gates), ["CONCIERGE", "ENFERMAGEM"], "Só Tratamento: Concierge + Enfermeira");

  const depoisNc = r.state.cadenceEnrollments.find((e) => e.id === nc.id);
  assert.equal(depoisNc.status, "CANCELED", "régua do não-fechou encerrada");
  const pendentesNc = r.state.tasks.filter((t) => t.cadenceId === "cad-not-closed" && t.status === "PENDING");
  assert.equal(pendentesNc.length, 0, "nenhuma mensagem de não-fechou sobrando para a Concierge");
  const explicacao = r.state.timelineEvents.find((e) => e.eventType === "PAGOU_DEPOIS");
  assert.match(explicacao.eventDescription, /desde 20\/10 e pagou R\$\s?980,00 em 22\/10/);
});

test("as 5 ligações do Estevão também param quando o paciente fecha (vale para o Registrar fechamento)", () => {
  const { state, dealId } = naoFechou({ comCincoLigacoes: true });
  assert.equal(state.cadenceEnrollments.find((e) => e.cadenceId === "cad-gestor-5lig").status, "ACTIVE");
  const r = pd.fecharQuemPagouDepois(state, [pagamento("2026-10-26", [item("TRATAMENTO", "Undecilato de testosterona", 590)])], { hoje: "2026-10-26" });
  assert.equal(r.fechados.length, 1);
  assert.equal(r.state.cadenceEnrollments.find((e) => e.cadenceId === "cad-gestor-5lig").status, "CANCELED");
  assert.equal(r.state.tasks.filter((t) => t.cadenceId === "cad-gestor-5lig" && t.status === "PENDING").length, 0, "nenhuma ligação pendente");

  // O mesmo vale quando o Estevão registra o fechamento à mão.
  const manual = crm.moveDealStage(state, dealId, { actorId: ATOR, stage: "FECHOU_COMPLETO", soldAmount: 590, receivedAmount: 590, adhesionChannel: "SOMENTE_TRATAMENTO" });
  assert.equal(manual.state.cadenceEnrollments.find((e) => e.cadenceId === "cad-gestor-5lig").status, "CANCELED");
});

test("consulta, sinal de consulta, exame e nutri NÃO fecham: quem não fecha também paga a consulta", () => {
  const { state } = naoFechou();
  const pagamentos = [
    pagamento("2026-10-21", [item("CONSULTA", "Consulta Black (5% de desconto em tratamentos) — Pix", 1500)]),
    pagamento("2026-10-22", [item("CONSULTA", "Sinal de consulta", 500)]),
    pagamento("2026-10-23", [item("BIOIMPEDANCIA", "", 300)]),
    pagamento("2026-10-24", [item("NUTRICIONISTA", "Consulta com a nutricionista", 400)]),
  ];
  const r = pd.quemPagouDepois(state, pagamentos, "2026-10-24");
  assert.equal(r.fechar.length, 0);
  assert.equal(r.antigos.length, 0);
});

test("pagamento ANTES do não-fechou não conta; no mesmo dia só o que foi lançado depois e não é a consulta", () => {
  const { state, dealId } = naoFechou();
  const momento = state.cadenceEnrollments.find((e) => e.cadenceId === "cad-not-closed" && e.dealId === dealId).enrolledAt;
  const antes = new Date(Date.parse(momento) - 3600_000).toISOString();
  const depois = new Date(Date.parse(momento) + 3600_000).toISOString();
  const dose = [item("TRATAMENTO", "Vitamina D 600.000 UI", 669)];

  assert.equal(pd.quemPagouDepois(state, [pagamento("2026-10-19", dose)], "2026-10-22").fechar.length, 0, "dia anterior");
  assert.equal(pd.quemPagouDepois(state, [pagamento("2026-10-20", dose, { criadoEm: antes })], "2026-10-22").fechar.length, 0, "mesmo dia, lançado antes");
  assert.equal(
    pd.quemPagouDepois(state, [pagamento("2026-10-20", [...dose, item("CONSULTA", "Consulta Diamond — Pix", 1100)], { criadoEm: depois })], "2026-10-22").fechar.length,
    0,
    "mesmo dia, comanda da própria consulta lançada à noite",
  );
  assert.equal(pd.quemPagouDepois(state, [pagamento("2026-10-20", dose, { criadoEm: depois })], "2026-10-22").fechar.length, 1, "mesmo dia, pagou o tratamento depois");
});

test("plano pago todo em espécie (só Crediário, sem comanda): Programa de Acompanhamento e presente no dia", () => {
  const { state, dealId } = naoFechou();
  const pagamentos = pd.pagamentosDosPacientes({
    comandas: [],
    dinheiro: [
      {
        id: "fcash-1",
        dia: "2026-10-27",
        valor: 9600,
        descricao: "Comanda — Paciente Teste (dinheiro) · Plano de Acompanhamento · 6 meses + Vitamina D 600.000 UI + Coenzima Q10",
        contactRef: "c1",
        saleRef: null,
        criadoEm: "2026-10-27T13:00:00.000Z",
      },
    ],
    lembretes: [],
  });
  const r = pd.fecharQuemPagouDepois(state, pagamentos, { hoje: "2026-10-27" });
  assert.equal(r.fechados.length, 1);
  assert.equal(r.fechados[0].canal, "PROGRAMA_ACOMPANHAMENTO");
  assert.equal(r.fechados[0].valor, 9600);
  const deal = r.state.deals.find((d) => d.id === dealId);
  assert.equal(deal.adhesionChannel, "PROGRAMA_ACOMPANHAMENTO");
  const gates = r.state.tasks.filter((t) => t.dealId === dealId && t.isGate).map((t) => t.assignedToRole).sort();
  assert.deepEqual(j(gates), ["CONCIERGE", "ENFERMAGEM", "RECEPCAO"], "Programa: as três pessoas do D+1");
  const presente = r.state.tasks.find((t) => t.dealId === dealId && /presente/i.test(t.title));
  assert.ok(presente, "1ª compra acima de R$ 8.000: presente");
  assert.equal(presente.id, `task-pagou-depois-${dealId}-1`, "id fixo: duas sessões não criam dois presentes");
});

test("pagou há mais de uma semana: entra direto em Em acompanhamento, sem boas-vindas nem presente atrasados", () => {
  const { state, dealId } = naoFechou();
  const pago = pagamento("2026-10-21", [item("CONSULTA", "Plano de Acompanhamento · 6 meses", 9000)]);
  const r = pd.fecharQuemPagouDepois(state, [pago], { hoje: "2026-10-31" });
  assert.equal(r.fechados.length, 1);
  assert.equal(r.fechados[0].jornadaJaEmAndamento, true);
  const deal = r.state.deals.find((d) => d.id === dealId);
  assert.equal(deal.programPhase, "CADENCIA_PROGRAMA");
  assert.equal(deal.closedAt.slice(0, 10), "2026-10-21");
  assert.equal(r.state.tasks.filter((t) => t.dealId === dealId && t.isGate).length, 0, "sem gate do D+1");
  assert.equal(r.state.tasks.some((t) => t.dealId === dealId && /presente/i.test(t.title)), false, "sem presente");
  assert.ok(
    r.state.cadenceEnrollments.some((e) => e.contactId === "c1" && e.cadenceId === "cad-nursing-14" && e.status === "ACTIVE"),
    "segue a régua da enfermagem de quem está em acompanhamento",
  );
});

test("pagamento com mais de 30 dias fica para a coordenação decidir (não fecha sozinho)", () => {
  const { state, dealId } = naoFechou();
  const r = pd.fecharQuemPagouDepois(state, [pagamento("2026-10-22", [item("TRATAMENTO", "Undecilato de testosterona", 590)])], { hoje: "2026-12-01" });
  assert.equal(r.fechados.length, 0);
  assert.equal(r.antigos.length, 1);
  assert.equal(r.state.deals.find((d) => d.id === dealId).stage, "NAO_FECHOU");
});

test("parte em espécie soma no valor da comanda; Lembrete pago em espécie também fecha", () => {
  const { state } = naoFechou();
  const juntos = pd.pagamentosDosPacientes({
    comandas: [
      {
        id: "fsale-x",
        dia: "2026-10-23",
        contactRef: "c1",
        criadoEm: "2026-10-23T15:00:00.000Z",
        notas: "",
        itens: [{ itemType: "TRATAMENTO", amount: 880, description: "Testosterona base / cipionato / enantato" }],
      },
    ],
    dinheiro: [
      { id: "fcash-x", dia: "2026-10-23", valor: 2000, descricao: "Comanda — Paciente Teste (dinheiro) · Testosterona base / cipionato / enantato", contactRef: "c1", saleRef: "fsale-x", criadoEm: "2026-10-23T15:00:01.000Z" },
    ],
    lembretes: [],
  });
  assert.equal(juntos.length, 1, "o dinheiro preso à comanda não vira pagamento à parte");
  assert.equal(juntos[0].valor, 2880);
  assert.equal(pd.quemPagouDepois(state, juntos, "2026-10-23").fechar[0].valor, 2880);

  const lembrete = (observacao) =>
    pd.pagamentosDosPacientes({ comandas: [], dinheiro: [], lembretes: [{ id: "receb-1", dia: "2026-10-24", valor: 4000, contactRef: "c1", observacao, criadoEm: "2026-10-24T12:00:00.000Z" }] });
  const programa = pd.quemPagouDepois(state, lembrete("PROGRAMA DE ACOMPANHAMENTO + VIT D + COENZIMAQ10 4 DOSES"), "2026-10-24");
  assert.equal(programa.fechar.length, 1);
  assert.equal(programa.fechar[0].canal, "PROGRAMA_ACOMPANHAMENTO");
  assert.equal(pd.quemPagouDepois(state, lembrete("consulta"), "2026-10-24").fechar.length, 0, "Lembrete só da consulta não fecha");
});

test("a comanda que os Lembretes criam (item 'Pagamento de dívida') é lida pela observação", () => {
  const { state } = naoFechou();
  const comanda = (notas) =>
    pd.pagamentosDosPacientes({
      comandas: [{ id: "fsale-lem-1", dia: "2026-10-24", contactRef: "c1", criadoEm: "2026-10-24T12:00:00.000Z", notas, itens: [{ itemType: "OUTRO", amount: 2050, description: "Pagamento de dívida (Lembretes)" }] }],
      dinheiro: [],
      lembretes: [],
    });
  assert.equal(pd.quemPagouDepois(state, comanda("Pagamento de dívida (Lembretes). RESTANTE DO TRATAMENTO"), "2026-10-24").fechar.length, 1);
  assert.equal(pd.quemPagouDepois(state, comanda("Pagamento de dívida registrado nos Lembretes — a dívida não tinha comanda."), "2026-10-24").fechar.length, 0, "sem dizer o que foi, não fecha");
});

test("Consulta Black com tratamento: canal Consulta Black; procedimento do Dr. Moisés não fecha o tratamento do Dr. Daniel", () => {
  const { state } = naoFechou();
  const black = pd.quemPagouDepois(
    state,
    [pagamento("2026-10-22", [item("CONSULTA", "Consulta Black (5% de desconto em tratamentos) — Pix", 1500), item("TRATAMENTO", "SINAL TRATAMENTO HORMONAL", 550)])],
    "2026-10-22",
  );
  assert.equal(black.fechar[0].canal, "CLUBE_BRATAN");
  assert.equal(black.fechar[0].valor, 2050);

  const moises = pd.quemPagouDepois(state, [pagamento("2026-10-22", [{ itemType: "TRATAMENTO", description: "Sessão do Dr. Moisés", amount: 800, profissional: "moises" }])], "2026-10-22");
  assert.equal(moises.fechar.length, 0);
});

test("rodar de novo não refaz nada; duas sessões ao mesmo tempo gravam os MESMOS ids", () => {
  const { state, dealId } = naoFechou();
  const pagos = [pagamento("2026-10-22", [item("TRATAMENTO", "Tirzepatida · frasco", 2750)])];
  const a = pd.fecharQuemPagouDepois(state, pagos, { hoje: "2026-10-22" });
  const b = pd.fecharQuemPagouDepois(state, pagos, { hoje: "2026-10-22" });
  const novosIds = (resultado) => ({
    eventos: resultado.state.timelineEvents.filter((e) => !state.timelineEvents.some((x) => x.id === e.id)).map((e) => e.id).sort(),
    tarefas: resultado.state.tasks.filter((t) => !state.tasks.some((x) => x.id === t.id)).map((t) => t.id).sort(),
  });
  assert.deepEqual(j(novosIds(a)), j(novosIds(b)));
  assert.ok(novosIds(a).eventos.every((id) => id.startsWith(`tl-pagou-depois-${dealId}`)));

  const deNovo = pd.fecharQuemPagouDepois(a.state, pagos, { hoje: "2026-10-22" });
  assert.equal(deNovo.fechados.length, 0, "já fechado não fecha de novo");

  // O pipeline do app (o que roda depois em toda sessão) não reabre nada.
  const saneado = crm.sanitizeCrmState(a.state, { curative: true });
  const deal = saneado.deals.find((d) => d.id === dealId);
  assert.equal(deal.stage, "FECHOU_COMPLETO");
  assert.equal(
    saneado.cadenceEnrollments.some((e) => e.contactId === "c1" && e.status === "ACTIVE" && ["cad-not-closed", "cad-gestor-5lig"].includes(e.cadenceId)),
    false,
  );
});

test("o Estevão marcou 'Não fechou' DE NOVO depois de um pagamento: vale o registro mais recente", () => {
  const { state: base, dealId } = naoFechou();
  // Pagou uma dose em 22/10, e em 24/10 o Estevão registrou "não fechou" de novo
  // (a dose não era o tratamento combinado). Só o que vier depois de 24/10 fecha.
  const de24 = "2026-10-24T17:00:00.000Z";
  const state = {
    ...base,
    cadenceEnrollments: [
      { ...base.cadenceEnrollments.find((e) => e.cadenceId === "cad-not-closed"), id: "enroll-c1-cad-not-closed-2026-10-24", triggerDate: "2026-10-24", enrolledAt: de24, createdAt: de24, updatedAt: de24 },
      ...base.cadenceEnrollments.map((e) => (e.cadenceId === "cad-not-closed" ? { ...e, status: "CANCELED" } : e)),
    ],
  };
  const dose = [item("TRATAMENTO", "Testosterona blend", 590)];
  assert.equal(pd.quemPagouDepois(state, [pagamento("2026-10-22", dose)], "2026-10-25").fechar.length, 0);
  const depois = pd.quemPagouDepois(state, [pagamento("2026-10-22", dose), pagamento("2026-10-25", dose)], "2026-10-25");
  assert.equal(depois.fechar.length, 1);
  assert.equal(depois.fechar[0].pagouEm, "2026-10-25");
  assert.equal(depois.fechar[0].naoFechouEm, "2026-10-24");
  assert.equal(depois.fechar[0].dealId, dealId);
});

test("texto escrito à mão: cada parte vira um item com a natureza certa", () => {
  const natureza = (texto) => nat.naturezaDoItem(pd.itemDoTexto(texto));
  assert.deepEqual(j(pd.itensDoTexto("2 consultas \n3 doses de Undecilato \n1 teste genetico").map((i) => nat.naturezaDoItem(i))), ["CONSULTA", "MEDICACAO", "TRATAMENTO"]);
  assert.equal(natureza("Sinal de consulta"), "SINAL", "o produto da tabela");
  assert.equal(natureza("sinal da consulta de novembro"), "SINAL", "escrito à mão");
  assert.equal(natureza("SINAL TRATAMENTO HORMONAL"), "TRATAMENTO");
  assert.equal(natureza("PROGRAMA DE CONSULTA 3X CONSULTAS DR DANIEL"), "PLANO", "programa é plano, não consulta");
  assert.equal(natureza("Consulta Black (5% de desconto em tratamentos)"), "CONSULTA");
  assert.deepEqual(
    j(pd.itensDaDescricaoDoCrediario("Comanda — Fulano (dinheiro) · Plano de Acompanhamento · 6 meses + Tirzepatida · até 30 un").map((i) => i.description)),
    ["Plano de Acompanhamento · 6 meses", "Tirzepatida · até 30 un"],
  );
  assert.deepEqual(j(pd.itensDaDescricaoDoCrediario("Fechamento — Fulano (dinheiro)")), [], "fechamento do Kanban não diz o que foi");
});

test("dinheiro sem descrição leva o tipo do item para o Crediário (é o que o CRM lê)", () => {
  const d = dinheiro.separarDinheiro(
    [{ itemType: "TRATAMENTO", amount: 7000, description: "" }, { itemType: "CONSULTA", amount: 1000, description: "" }],
    [{ method: "DINHEIRO", amount: 8000 }],
  );
  assert.equal(d.resumoDosItens, "Tratamento + Consulta");
});
