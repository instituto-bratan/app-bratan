import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

const localStoreStub = {
  readLocalValue: (_key, fallback) => fallback,
  todayISO: () => "2026-06-30",
  writeLocalValue: () => undefined,
};

function loadTsModule(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(absolutePath, module);

  const localRequire = (request) => {
    if (request === "@/lib/localStore") return localStoreStub;
    if (request.startsWith("@/")) {
      const resolved = request.replace("@/", "src/");
      return loadTsModule(path.extname(resolved) ? resolved : `${resolved}.ts`);
    }
    if (request.startsWith(".")) {
      const resolved = path.resolve(path.dirname(absolutePath), request);
      return loadTsModule(path.relative(repoRoot, path.extname(resolved) ? resolved : `${resolved}.ts`));
    }
    throw new Error(`Unexpected test import: ${request}`);
  };

  vm.runInNewContext(
    output,
    {
      require: localRequire,
      module,
      exports: module.exports,
      console,
      crypto: globalThis.crypto,
      Date,
      Intl,
      Math,
      Number,
      Object,
      JSON,
      Set,
      String,
      Map,
    },
    { filename: absolutePath },
  );

  return module.exports;
}

const crm = loadTsModule("src/features/crm/crmData.ts");
const data360 = loadTsModule("src/features/inteligencia360/inteligencia360Data.ts");

function cloneState() {
  return JSON.parse(JSON.stringify(crm.demoCrmFixtures));
}

function clone360() {
  return JSON.parse(JSON.stringify(data360.demoInteligencia360Fixtures));
}

test("findOrCreateCrmContact evita duplicidade por telefone", () => {
  const state = cloneState();
  const before = state.contacts.length;
  const result = crm.findOrCreateCrmContact(state, {
    fullName: "Marina A.",
    phone: "11 99999-0001",
    whatsapp: "11999990001",
  });

  assert.equal(result.created, false);
  assert.equal(result.contact.id, "crm-contact-lead-frio");
  assert.equal(result.state.contacts.length, before);
  assert.match(result.duplicateWarning, /Possível duplicidade/);
});

test("mover para fechou completo cria tarefas setoriais e alimenta o 360", () => {
  const state = cloneState();
  const moved = crm.moveDealStage(state, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "FECHOU_COMPLETO",
    prescribedAmount: 22000,
    soldAmount: 22000,
    receivedAmount: 12000,
  });

  assert.equal(moved.ok, true);
  const roles = moved.state.tasks
    .filter((task) => task.dealId === "crm-deal-lead-quente")
    .map((task) => task.assignedToRole)
    .sort();

  assert.ok(roles.includes("CONCIERGE"));
  assert.ok(roles.includes("RECEPCAO"));
  assert.ok(roles.includes("ENFERMAGEM"));
  assert.equal(moved.state.contacts.find((contact) => contact.id === "crm-contact-lead-quente").lifecycleStage, "ACTIVE_PATIENT");

  const next360 = crm.deriveInteligencia360FromCrm(moved.state, clone360());
  assert.ok(next360.prescriptions.some((record) => record.id === "crm-rx-crm-deal-lead-quente" && record.status === "CLOSED_FULL"));
  assert.ok(next360.receivables.some((record) => record.id === "crm-recv-crm-deal-lead-quente"));
  assert.ok(next360.journeys.some((record) => record.id === "crm-journey-crm-deal-lead-quente"));
  // Caixa NÃO pode dobrar: uma venda fechada = UM recebível (não crm-recv + recv-sale-crm-rx).
  const recsDoDeal = next360.receivables.filter((record) => (record.saleId || "").includes("crm-deal-lead-quente") || record.id.includes("crm-deal-lead-quente"));
  assert.equal(recsDoDeal.length, 1, "um único recebível por venda do CRM (sem dobrar)");
});

test("360 mostra o NOME do paciente (não o código) e deriva o resgate do CRM", () => {
  const state = cloneState();
  const contact = state.contacts.find((c) => c.id === "crm-contact-lead-quente");
  const moved = crm.moveDealStage(state, "crm-deal-lead-quente", {
    actorId: "vendedor", stage: "FECHOU_COMPLETO", prescribedAmount: 10000, soldAmount: 10000, receivedAmount: 5000,
  });
  const derived = crm.deriveInteligencia360FromCrm(moved.state, clone360());
  const rx = derived.prescriptions.find((r) => r.id === "crm-rx-crm-deal-lead-quente");
  assert.ok(rx);
  assert.equal(rx.patientReference, crm.contactDisplayName(contact)); // NOME, não código
  assert.notEqual(rx.patientReference, "crm-contact-lead-quente");

  // Retenção/Resgate deixa de ficar vazio: cadência de resgate do CRM vira RescueWorkflow.
  const withRescue = {
    ...moved.state,
    cadenceEnrollments: [
      ...moved.state.cadenceEnrollments,
      {
        id: "enr-resc-1", cadenceId: "cad-rescue-60d", contactId: contact.id, dealId: "crm-deal-lead-quente",
        status: "ACTIVE", enrolledAt: "2026-06-01", triggerSource: "TESTE", triggerDate: "2026-06-01",
        ownerUserId: "concierge", ownerRole: "CONCIERGE", completedAt: null, canceledReason: "", createdAt: "2026-06-01", updatedAt: "2026-06-01",
      },
    ],
  };
  const derived2 = crm.deriveInteligencia360FromCrm(withRescue, clone360());
  const rescue = derived2.rescueWorkflows.find((r) => r.id === "crm-rescue-enr-resc-1");
  assert.ok(rescue, "resgate do CRM aparece na retenção");
  assert.equal(rescue.rescueType, "TRADITIONAL_60_DAYS");
  assert.equal(rescue.patientReference, crm.contactDisplayName(contact));
});

test("marcar 'consulta realizada' gera o D+1 da concierge (lista automática de quem passou com o Dr.)", () => {
  const state = cloneState();
  const deal = state.deals.find((d) => d.stage !== "FECHOU_COMPLETO" && d.stage !== "FECHOU_PARCIAL");
  const moved = crm.moveDealStage(state, deal.id, { actorId: "recepcao", stage: "CONSULTA_REALIZADA" });
  assert.equal(moved.ok, true);
  // Inscrição da concierge criada na régua de pós-consulta.
  const enrollment = moved.state.cadenceEnrollments.find(
    (e) => e.cadenceId === "cad-pos-consulta-d1" && e.contactId === deal.contactId && e.status === "ACTIVE",
  );
  assert.ok(enrollment, "inscrição pós-consulta da concierge existe");
  assert.equal(enrollment.ownerRole, "CONCIERGE");
  // O motor materializa a tarefa D+1 da concierge (aparece em Minhas Tarefas).
  const withTasks = crm.generateCadenceTasks(moved.state, new Date("2026-06-30T09:00:00"));
  const task = withTasks.tasks.find(
    (t) => t.cadenceId === "cad-pos-consulta-d1" && t.contactId === deal.contactId && t.assignedToRole === "CONCIERGE",
  );
  assert.ok(task, "tarefa D+1 da concierge criada");
});

test("não fechou exige objeção e com objeção cria médico D+1 e gestor D+2", () => {
  const state = cloneState();
  const invalid = crm.moveDealStage(state, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "NAO_FECHOU",
  });

  assert.equal(invalid.ok, false);

  const valid = crm.moveDealStage(state, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "NAO_FECHOU",
    objection: "Precisa falar com familiar",
    objectionCategory: "SPOUSE_OR_FAMILY",
  });

  const roles = valid.state.tasks
    .filter((task) => task.dealId === "crm-deal-lead-quente")
    .map((task) => task.assignedToRole);
  assert.ok(roles.includes("MEDICO"));
  assert.ok(roles.includes("ADMIN_GESTAO"));
});

test("gerar cadência duas vezes não duplica tarefa aberta", () => {
  const state = cloneState();
  const once = crm.generateCadenceTasks(state, new Date("2026-07-01T12:00:00.000Z"));
  const twice = crm.generateCadenceTasks(once, new Date("2026-07-01T12:00:00.000Z"));

  const cadenceTasks = twice.tasks.filter((task) => task.cadenceId && task.cadenceStepId && task.status !== "DONE");
  const keys = cadenceTasks.map((task) => `${task.contactId}:${task.cadenceId}:${task.cadenceStepId}:${task.taskType}:${task.status}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("concluir tarefa registra touchpoint e pausa cadência quando houve resposta", () => {
  const state = cloneState();
  const updated = crm.completeCrmTask(state, "crm-task-d1-comercial", {
    actorId: "sdr",
    result: "RESPONDED",
    resultNotes: "Quer agendar consulta.",
  });

  assert.equal(updated.tasks.find((task) => task.id === "crm-task-d1-comercial").status, "DONE");
  assert.equal(updated.touchpoints[0].contactId, "crm-contact-lead-frio");
  assert.equal(updated.touchpoints[0].responseReceived, true);
  assert.equal(updated.cadenceEnrollments.find((item) => item.cadenceId === "cad-cold-lead").status, "PAUSED");
});

test("antifadiga sinaliza contato com muitos toques recentes", () => {
  const state = cloneState();
  state.touchpoints = Array.from({ length: 5 }, (_, index) => ({
    id: `touch-${index}`,
    contactId: "crm-contact-lead-frio",
    taskId: "",
    cadenceId: "cad-cold-lead",
    touchType: "WHATSAPP",
    channel: "WHATSAPP",
    sentByUserId: "sdr",
    sentAt: `2026-06-${26 + index}T10:00:00.000Z`,
    responseReceived: false,
    responseAt: null,
    responseSummary: "",
    sentiment: "NO_RESPONSE",
    createdAt: `2026-06-${26 + index}T10:00:00.000Z`,
  }));

  const fatigue = crm.checkContactFatigue(state, "crm-contact-lead-frio", new Date("2026-06-30T12:00:00.000Z"));
  assert.equal(fatigue.risk, true);
  assert.equal(fatigue.recentTouchesCount, 5);
});

// --- Correções de 14/07/2026: inscrição em cadência sumindo ---

test("inscrever em cadência cria negociação aberta (aparece no Kanban)", () => {
  const state = cloneState();
  const contact = state.contacts.find((item) => item.id === "crm-contact-lead-quente");
  state.deals = state.deals.filter((deal) => deal.contactId !== contact.id);
  const dealsBefore = state.deals.length;

  const next = crm.enrollContactInCadence(state, {
    cadenceId: "cad-cold-lead",
    contactId: contact.id,
    dealId: "",
    triggerSource: "teste",
    triggerDate: "2026-06-30",
    ownerUserId: "tester",
    ownerRole: "SDR_LEADS",
  });

  assert.equal(next.deals.length, dealsBefore + 1);
  const deal = next.deals.find((item) => item.contactId === contact.id && item.status === "OPEN");
  assert.ok(deal, "negociação aberta criada para o contato");
  const enrollment = next.cadenceEnrollments.find((item) => item.contactId === contact.id && item.cadenceId === "cad-cold-lead");
  assert.equal(enrollment.dealId, deal.id, "inscrição vinculada à negociação");
});

test("inscrever reaproveita negociação aberta existente em vez de duplicar", () => {
  const state = cloneState();
  const openDeal = state.deals.find((deal) => deal.status === "OPEN");
  const dealsBefore = state.deals.length;

  const next = crm.enrollContactInCadence(state, {
    cadenceId: "cad-cold-lead",
    contactId: openDeal.contactId,
    dealId: "",
    triggerSource: "teste",
    triggerDate: "2026-06-30",
    ownerUserId: "tester",
    ownerRole: "SDR_LEADS",
  });

  assert.equal(next.deals.length, dealsBefore, "não cria negociação duplicada");
  const enrollment = next.cadenceEnrollments.find((item) => item.contactId === openDeal.contactId && item.cadenceId === "cad-cold-lead");
  assert.equal(enrollment.dealId, openDeal.id);
});

test("cadência com primeiro toque além de 7 dias já materializa a próxima tarefa", () => {
  const state = cloneState();
  const contact = state.contacts.find((item) => item.id === "crm-contact-lead-quente");

  const next = crm.enrollContactInCadence(state, {
    cadenceId: "cad-rescue-6m",
    contactId: contact.id,
    dealId: "",
    triggerSource: "teste",
    triggerDate: "2026-08-30",
    ownerUserId: "tester",
    ownerRole: "CONCIERGE",
  });

  const tasks = next.tasks.filter((task) => task.contactId === contact.id && task.cadenceId === "cad-rescue-6m");
  assert.equal(tasks.length, 1, "exatamente a primeira tarefa da régua nasce, mesmo fora da janela de 7 dias");
});

test("tarefa de cadência concluída não renasce no próximo carregamento", () => {
  const state = cloneState();
  const contact = state.contacts.find((item) => item.id === "crm-contact-lead-quente");

  let next = crm.enrollContactInCadence(state, {
    cadenceId: "cad-cold-lead",
    contactId: contact.id,
    dealId: "",
    triggerSource: "teste",
    triggerDate: "2026-06-29",
    ownerUserId: "tester",
    ownerRole: "SDR_LEADS",
  });
  const firstTask = next.tasks.find((task) => task.contactId === contact.id && task.cadenceId === "cad-cold-lead");
  assert.ok(firstTask);
  next = {
    ...next,
    tasks: next.tasks.map((task) => (task.id === firstTask.id ? { ...task, status: "DONE", completedAt: "2026-06-30T10:00:00Z" } : task)),
  };

  const regenerated = crm.generateCadenceTasks(next, new Date("2026-06-30T12:00:00"));
  const sameStep = regenerated.tasks.filter((task) => task.cadenceStepId === firstTask.cadenceStepId && task.contactId === contact.id);
  assert.equal(sameStep.length, 1, "o passo concluído não vira tarefa nova");
});

test("resposta pausa só a régua daquele contato, não a dos outros", () => {
  const state = cloneState();
  const contactA = state.contacts.find((item) => item.id === "crm-contact-lead-quente");
  const contactB = state.contacts.find((item) => item.id === "crm-contact-fechou-completo");
  assert.ok(contactA && contactB);

  let next = crm.enrollContactInCadence(state, {
    cadenceId: "cad-cold-lead",
    contactId: contactA.id,
    dealId: "",
    triggerSource: "teste",
    triggerDate: "2026-06-29",
    ownerUserId: "tester",
    ownerRole: "SDR_LEADS",
  });
  next = crm.enrollContactInCadence(next, {
    cadenceId: "cad-cold-lead",
    contactId: contactB.id,
    dealId: "",
    triggerSource: "teste",
    triggerDate: "2026-06-29",
    ownerUserId: "tester",
    ownerRole: "SDR_LEADS",
  });

  const taskA = next.tasks.find((task) => task.contactId === contactA.id && task.cadenceId === "cad-cold-lead");
  assert.ok(taskA, "tarefa da régua do contato A existe");

  const done = crm.completeCrmTask(next, taskA.id, { result: "RESPONDED", actorId: "tester" });
  const enrollA = done.cadenceEnrollments.find((item) => item.contactId === contactA.id && item.cadenceId === "cad-cold-lead");
  const enrollB = done.cadenceEnrollments.find((item) => item.contactId === contactB.id && item.cadenceId === "cad-cold-lead");
  assert.equal(enrollA.status, "PAUSED", "régua de quem respondeu pausa");
  assert.equal(enrollB.status, "ACTIVE", "régua dos outros contatos segue ativa");
});

test("catálogo novo em código entra em estados salvos antigos (merge de seeds)", () => {
  const state = cloneState();
  state.cadences = state.cadences.filter((cadence) => !cadence.id.startsWith("cad-rescue"));
  const merged = crm.mergeCrmCatalogWithSeeds(state);
  assert.ok(merged.cadences.some((cadence) => cadence.id === "cad-rescue-60d"), "cadência de resgate reaparece");
  assert.ok(merged.cadences.some((cadence) => cadence.id === "cad-gestor-3131"), "cadência do gestor reaparece");
});

// --- POP Caminhada do Paciente v2 (14/07/2026) ---

test("fechar 1ª consulta cria tarefa de presente pela faixa do POP", () => {
  const cases = [
    { sold: 8000, gift: "caixa PillBox" },
    { sold: 10000, gift: "caixa PillBox" },
    { sold: 12000, gift: "garrafa Stanley" },
  ];
  for (const { sold, gift } of cases) {
    const state = cloneState();
    // POP: presente é da 1ª consulta.
    state.deals = state.deals.map((deal) => (deal.id === "crm-deal-lead-quente" ? { ...deal, dealType: "FIRST_CONSULTATION" } : deal));
    const moved = crm.moveDealStage(state, "crm-deal-lead-quente", {
      actorId: "vendedor",
      stage: "FECHOU_COMPLETO",
      prescribedAmount: sold,
      soldAmount: sold,
      receivedAmount: sold,
    });
    const giftTask = moved.state.tasks.find((task) => task.title.startsWith("Entregar presente"));
    assert.ok(giftTask, `presente criado para ${sold}`);
    assert.ok(giftTask.title.includes(gift), `faixa certa para ${sold}: esperava ${gift}, veio ${giftTask.title}`);
  }

  // Abaixo de R$7 mil não tem presente.
  const small = cloneState();
  small.deals = small.deals.map((deal) => (deal.id === "crm-deal-lead-quente" ? { ...deal, dealType: "FIRST_CONSULTATION" } : deal));
  const movedSmall = crm.moveDealStage(small, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "FECHOU_COMPLETO",
    soldAmount: 5000,
    receivedAmount: 5000,
  });
  assert.ok(!movedSmall.state.tasks.some((task) => task.title.startsWith("Entregar presente")));

  // Renovação/plano de tratamento (não é 1ª consulta) também não ganha presente.
  const renewal = cloneState();
  const movedRenewal = crm.moveDealStage(renewal, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "FECHOU_COMPLETO",
    soldAmount: 15000,
    receivedAmount: 15000,
  });
  assert.ok(!movedRenewal.state.tasks.some((task) => task.title.startsWith("Entregar presente")));
});

test("fechar cria contrato + inicia o Programa com as 3 tarefas-gate do D+1 (POP v3.1)", () => {
  const state = cloneState();
  const moved = crm.moveDealStage(state, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "FECHOU_COMPLETO",
    soldAmount: 9000,
    receivedAmount: 9000,
    adhesionChannel: "PROGRAMA_ACOMPANHAMENTO",
  });
  const dealTasks = moved.state.tasks.filter((task) => task.dealId === "crm-deal-lead-quente");
  const titles = dealTasks.map((task) => task.title);
  assert.ok(titles.includes("Fazer o contrato e enviar à administradora"), "contrato da recepção");
  assert.ok(titles.includes("Conferir contrato e SuperSign"), "conferência do administrativo");
  // Jornada do Programa: entrou e já está em Boas-vindas (D+1) com as 3 gates.
  const deal = moved.state.deals.find((d) => d.id === "crm-deal-lead-quente");
  assert.equal(deal.programPhase, "TRES_CONTATOS_D1");
  assert.equal(deal.adhesionChannel, "PROGRAMA_ACOMPANHAMENTO");
  const gates = dealTasks.filter((task) => task.isGate && task.gatePhase === "TRES_CONTATOS_D1");
  assert.equal(gates.length, 3);
  assert.deepEqual(Array.from(gates, (g) => g.assignedToRole).sort(), ["CONCIERGE", "ENFERMAGEM", "RECEPCAO"]);
});

test("resposta ao médico D+1 pula o gestor D+2 automaticamente (POP)", () => {
  const state = cloneState();
  const moved = crm.moveDealStage(state, "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "NAO_FECHOU",
    objection: "Vai pensar com a família",
    objectionCategory: "SPOUSE_OR_FAMILY",
  });
  const medTask = moved.state.tasks.find((task) => task.dealId === "crm-deal-lead-quente" && task.title.startsWith("Médico D+1"));
  const gestorBefore = moved.state.tasks.find((task) => task.dealId === "crm-deal-lead-quente" && task.title.startsWith("Gestor D+2"));
  assert.ok(medTask && gestorBefore, "as duas tarefas nascem");

  const done = crm.completeCrmTask(moved.state, medTask.id, { result: "RESPONDED", actorId: "dr-daniel" });
  const gestorAfter = done.tasks.find((task) => task.id === gestorBefore.id);
  assert.equal(gestorAfter.status, "SKIPPED", "gestor D+2 pulado quando o paciente respondeu ao médico");

  // Sem resposta, o gestor continua de pé.
  const moved2 = crm.moveDealStage(cloneState(), "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "NAO_FECHOU",
    objection: "Preço",
    objectionCategory: "PRICE",
  });
  const medTask2 = moved2.state.tasks.find((task) => task.title.startsWith("Médico D+1"));
  const done2 = crm.completeCrmTask(moved2.state, medTask2.id, { result: "NO_RESPONSE", actorId: "dr-daniel" });
  const gestor2 = done2.tasks.find((task) => task.title.startsWith("Gestor D+2"));
  assert.equal(gestor2.status, "PENDING", "sem resposta o gestor D+2 continua");

  // "Precisa de gestor" NÃO pausa: é justamente o gatilho do D+2 (POP).
  const moved3 = crm.moveDealStage(cloneState(), "crm-deal-lead-quente", {
    actorId: "vendedor",
    stage: "NAO_FECHOU",
    objection: "Preço",
    objectionCategory: "PRICE",
  });
  const medTask3 = moved3.state.tasks.find((task) => task.title.startsWith("Médico D+1"));
  const done3 = crm.completeCrmTask(moved3.state, medTask3.id, { result: "NEEDS_MANAGER", actorId: "dr-daniel" });
  const gestor3 = done3.tasks.find((task) => task.title.startsWith("Gestor D+2"));
  assert.equal(gestor3.status, "PENDING", "'precisa de gestor' mantém o Gestor D+2 de pé");
});

test("ciclo de retorno conta para trás da data da consulta", () => {
  const state = cloneState();
  assert.equal(crm.cadenceNeedsEventDate(state, "cad-return-cycle"), true);
  assert.equal(crm.cadenceNeedsEventDate(state, "cad-cold-lead"), false);

  const next = crm.enrollContactInCadence(state, {
    cadenceId: "cad-return-cycle",
    contactId: "crm-contact-lead-quente",
    dealId: "",
    triggerSource: "teste",
    triggerDate: "2026-08-30",
    ownerUserId: "recepcao",
    ownerRole: "RECEPCAO",
  });
  const tasks = next.tasks
    .filter((task) => task.contactId === "crm-contact-lead-quente" && task.cadenceId === "cad-return-cycle")
    .map((task) => task.dueAt.slice(0, 10))
    .sort();
  assert.ok(tasks.includes("2026-08-15"), `exames 15 dias antes (veio ${tasks.join(", ")})`);
});

test("mensagem do concierge pede avaliação no Google (POP)", () => {
  const state = cloneState();
  const template = state.messageTemplates.find((item) => item.id === "tpl-concierge-d1");
  assert.match(template.body, /Google/);
});

// --- Cobertura automática e exclusão de lead (14/07/2026) ---

test("nenhum card fica sem régua: cobertura automática pela fase do POP", () => {
  const state = cloneState();
  // Contato/deal órfãos: sem inscrição e sem tarefa aberta.
  state.contacts = [...state.contacts, { ...state.contacts[0], id: "contact-orfao", fullName: "Orfao Teste" }];
  state.deals = [...state.deals, { ...state.deals[0], id: "deal-orfao", contactId: "contact-orfao", stage: "LEAD_NOVO", status: "OPEN" }];
  const dealsBefore = state.deals.length;

  const next = crm.ensureCadenceCoverage(state);
  const enrollment = next.cadenceEnrollments.find((item) => item.contactId === "contact-orfao");
  assert.ok(enrollment, "órfão entrou em cadência");
  assert.equal(enrollment.cadenceId, "cad-cold-lead", "lead novo cai na régua comercial");
  assert.equal(enrollment.dealId, "deal-orfao", "usa a negociação existente");
  assert.equal(next.deals.length, dealsBefore, "não cria negociação nova");
  assert.ok(next.tasks.some((task) => task.contactId === "contact-orfao"), "tarefa nasce junto");
});

test("cobertura automática: perdido cai no resgate da Aline; coberto não duplica", () => {
  const state = cloneState();
  state.contacts = [...state.contacts, { ...state.contacts[0], id: "contact-perdido", fullName: "Perdido Teste" }];
  state.deals = [...state.deals, { ...state.deals[0], id: "deal-perdido", contactId: "contact-perdido", stage: "PERDIDO", status: "LOST" }];

  const next = crm.ensureCadenceCoverage(state);
  const enrollment = next.cadenceEnrollments.find((item) => item.contactId === "contact-perdido");
  assert.equal(enrollment.cadenceId, "cad-rescue-60d", "perdido entra no resgate 60d (CONCIERGE/Aline)");

  // Rodar de novo não duplica nada (idempotente).
  const again = crm.ensureCadenceCoverage(next);
  const count = again.cadenceEnrollments.filter((item) => item.contactId === "contact-perdido").length;
  assert.equal(count, 1);
});

test("excluir lead limpa contato, negociações, tarefas, inscrições e histórico", () => {
  const base = cloneState();
  const enrolled = crm.enrollContactInCadence(base, {
    cadenceId: "cad-cold-lead",
    contactId: "crm-contact-lead-quente",
    dealId: "",
    triggerSource: "teste",
    triggerDate: "2026-06-30",
    ownerUserId: "tester",
    ownerRole: "SDR_LEADS",
  });

  const { state: cleaned, dealIds } = crm.removeLeadFromCrm(enrolled, "crm-contact-lead-quente");
  assert.ok(dealIds.length >= 1, "devolve refs das negociações para apagar no banco");
  assert.ok(!cleaned.contacts.some((item) => item.id === "crm-contact-lead-quente"));
  assert.ok(!cleaned.deals.some((item) => item.contactId === "crm-contact-lead-quente"));
  assert.ok(!cleaned.tasks.some((item) => item.contactId === "crm-contact-lead-quente"));
  assert.ok(!cleaned.cadenceEnrollments.some((item) => item.contactId === "crm-contact-lead-quente"));
  assert.ok(!cleaned.timelineEvents.some((item) => item.contactId === "crm-contact-lead-quente"));
});

// --- Resgate de 1 ano x Aniversário separados (14/07/2026) ---

test("Aline tem resgate de 60d, 6m e 1 ano, cada um com 5 tentativas", () => {
  const state = cloneState();
  for (const cid of ["cad-rescue-60d", "cad-rescue-6m", "cad-rescue-1y"]) {
    const cad = state.cadences.find((c) => c.id === cid);
    assert.ok(cad, `cadência ${cid} existe`);
    assert.equal(cad.defaultOwnerRole, "CONCIERGE", `${cid} é da Aline/Concierge`);
    const steps = state.cadenceSteps.filter((step) => step.cadenceId === cid);
    assert.equal(steps.length, 5, `${cid} tem 5 tentativas`);
  }
});

test("resgate de 1 ano é resgate puro (sem parabéns/aniversário)", () => {
  const state = cloneState();
  const cad = state.cadences.find((c) => c.id === "cad-rescue-1y");
  assert.match(cad.name, /Resgate 1 ano/);
  assert.ok(!/parab[ée]ns/i.test(cad.name), "nome não mistura aniversário");
  const tpl = state.messageTemplates.find((t) => t.id === "tpl-resgate-1a");
  assert.ok(!/parab[ée]ns|anivers/i.test(tpl.body), "mensagem de resgate não fala de aniversário");
});

test("aniversário de 1 ano é cadência própria e distinta do resgate", () => {
  const state = cloneState();
  const cad = state.cadences.find((c) => c.id === "cad-anniversary-1y");
  assert.ok(cad, "cadência de aniversário existe");
  assert.equal(cad.cadenceType, "ANNIVERSARY_1Y", "tipo próprio de aniversário (selo não diz Resgate)");
  assert.equal(cad.defaultOwnerRole, "CONCIERGE");
  const steps = state.cadenceSteps.filter((step) => step.cadenceId === "cad-anniversary-1y");
  assert.ok(steps.length >= 1, "tem passos");
  const tpl = state.messageTemplates.find((t) => t.id === "tpl-aniversario-1a");
  assert.match(tpl.body, /parab[ée]ns/i, "mensagem de aniversário fala parabéns");
  assert.match(tpl.body, /Instagram/i, "convida para o Instagram");
});

test("inscrever no resgate de 1 ano gera a tentativa 1 e cria negociação", () => {
  const state = cloneState();
  const next = crm.enrollContactInCadence(state, {
    cadenceId: "cad-rescue-1y",
    contactId: "crm-contact-lead-quente",
    dealId: "",
    triggerSource: "teste",
    triggerDate: "2026-06-30",
    ownerUserId: "aline",
    ownerRole: "CONCIERGE",
  });
  const tasks = next.tasks.filter((t) => t.contactId === "crm-contact-lead-quente" && t.cadenceId === "cad-rescue-1y");
  assert.ok(tasks.length >= 1, "primeira tentativa nasce");
  assert.ok(next.deals.some((d) => d.contactId === "crm-contact-lead-quente" && d.status === "OPEN"), "aparece no Kanban");
});

// --- Churn no Kanban (14/07/2026) ---

test("churn exige motivo e agenda o resgate de 6 meses para o futuro", () => {
  const state = cloneState();
  const semMotivo = crm.moveDealStage(state, "crm-deal-fechou-completo", { actorId: "gestor", stage: "CHURN" });
  assert.equal(semMotivo.ok, false, "sem motivo não vira churn");

  const moved = crm.moveDealStage(state, "crm-deal-fechou-completo", {
    actorId: "gestor",
    stage: "CHURN",
    objection: "Sem condições financeiras agora",
    objectionCategory: "PRICE",
  });
  assert.equal(moved.ok, true);

  const deal = moved.state.deals.find((item) => item.id === "crm-deal-fechou-completo");
  assert.equal(deal.stage, "CHURN");

  // Tarefa imediata da Aline para investigar
  const investigacao = moved.state.tasks.find((task) => task.dealId === deal.id && task.taskType === "CHURN_INVESTIGATION");
  assert.ok(investigacao, "tarefa de investigação criada");
  assert.equal(investigacao.assignedToRole, "CONCIERGE");

  // Resgate agendado para ~6 meses (gatilho futuro)
  const enrollment = moved.state.cadenceEnrollments.find(
    (item) => item.contactId === deal.contactId && item.cadenceId === "cad-rescue-6m" && item.status === "ACTIVE",
  );
  assert.ok(enrollment, "inscrição no resgate de 6 meses");
  // O harness congela todayISO em 2026-06-30: +180 dias = 2026-12-27.
  assert.equal(enrollment.triggerDate, "2026-12-27", "gatilho exatamente 6 meses (180 dias) à frente");

  // A 1ª tentativa do resgate nasce com a data futura
  const rescueTask = moved.state.tasks.find((task) => task.contactId === deal.contactId && task.cadenceId === "cad-rescue-6m");
  assert.ok(rescueTask, "primeira tentativa do resgate materializada");
  assert.ok(rescueTask.dueAt.slice(0, 10) >= enrollment.triggerDate, "vencimento no futuro");
});

test("churn preserva o status da venda (fechado continua contando no 360)", () => {
  const state = cloneState();
  const dealBefore = state.deals.find((item) => item.id === "crm-deal-fechou-completo");
  const statusBefore = dealBefore.status;

  const moved = crm.moveDealStage(state, "crm-deal-fechou-completo", {
    actorId: "gestor",
    stage: "CHURN",
    objection: "Mudou de cidade",
    objectionCategory: "TIMING",
  });
  const deal = moved.state.deals.find((item) => item.id === "crm-deal-fechou-completo");
  assert.equal(deal.status, statusBefore, "status financeiro intacto");

  const next360 = crm.deriveInteligencia360FromCrm(moved.state, clone360());
  assert.ok(
    next360.prescriptions.some((record) => record.id === "crm-rx-crm-deal-fechou-completo"),
    "venda segue no Dashboard 360 mesmo em churn",
  );
});


function bridgeTask(dealId, contactId, overrides = {}) {
  return {
    id: "task-bridge", contactId, dealId, cadenceId: "", cadenceStepId: "",
    title: "Follow-up comercial", description: "", taskType: "WHATSAPP",
    assignedToUserId: "vendedor", assignedToRole: "COMERCIAL_VENDEDOR",
    dueAt: "2026-06-30T12:00:00.000Z", completedAt: null, status: "PENDING",
    priority: "HIGH", visibilityScope: "ROLE", generatedBy: "MANUAL",
    result: "", resultNotes: "", createdBy: "vendedor", createdAt: "2026-06-01", updatedAt: "2026-06-01",
    ...overrides,
  };
}

test("ponte tarefa→Kanban: concluir 'não vendeu' move o card p/ NAO_FECHOU (forward-only)", () => {
  const state = cloneState();
  const deal = state.deals.find((d) => !["FECHOU_COMPLETO", "FECHOU_PARCIAL"].includes(d.stage) && !d.programPhase);
  deal.stage = "EM_NEGOCIACAO"; deal.status = "OPEN"; deal.programPhase = null;
  state.tasks = [bridgeTask(deal.id, deal.contactId), ...state.tasks];
  const next = crm.completeCrmTask(state, "task-bridge", { result: "NOT_SOLD", resultNotes: "achou caro", actorId: "vendedor" });
  assert.equal(next.deals.find((d) => d.id === deal.id).stage, "NAO_FECHOU");
});

test("ponte tarefa→Kanban: 'agendou' move p/ CONSULTA_AGENDADA; NUNCA anda para trás", () => {
  const state = cloneState();
  const deal = state.deals.find((d) => !["FECHOU_COMPLETO", "FECHOU_PARCIAL"].includes(d.stage) && !d.programPhase);
  deal.stage = "CONTATADO"; deal.status = "OPEN"; deal.programPhase = null;
  state.tasks = [bridgeTask(deal.id, deal.contactId), ...state.tasks];
  const fwd = crm.completeCrmTask(state, "task-bridge", { result: "SCHEDULED", actorId: "recepcao" });
  assert.equal(fwd.deals.find((d) => d.id === deal.id).stage, "CONSULTA_AGENDADA");

  // forward-only: já adiante → concluir 'agendou' não volta
  const state2 = cloneState();
  const deal2 = state2.deals.find((d) => !["FECHOU_COMPLETO", "FECHOU_PARCIAL"].includes(d.stage) && !d.programPhase);
  deal2.stage = "EM_NEGOCIACAO"; deal2.status = "OPEN"; deal2.programPhase = null;
  state2.tasks = [bridgeTask(deal2.id, deal2.contactId), ...state2.tasks];
  const back = crm.completeCrmTask(state2, "task-bridge", { result: "SCHEDULED", actorId: "recepcao" });
  assert.equal(back.deals.find((d) => d.id === deal2.id).stage, "EM_NEGOCIACAO"); // não recuou
});

test("ponte tarefa→Kanban: deal fechado/no Programa NÃO é movido por conclusão de tarefa", () => {
  const state = cloneState();
  const deal = state.deals[0];
  deal.stage = "FECHOU_COMPLETO"; deal.status = "WON_FULL"; deal.programPhase = "CADENCIA_PROGRAMA";
  state.tasks = [bridgeTask(deal.id, deal.contactId), ...state.tasks];
  const next = crm.completeCrmTask(state, "task-bridge", { result: "NOT_SOLD", resultNotes: "x", actorId: "vendedor" });
  const d = next.deals.find((x) => x.id === deal.id);
  assert.equal(d.stage, "FECHOU_COMPLETO"); // intacto
  assert.equal(d.programPhase, "CADENCIA_PROGRAMA");
});

test("reabrir deal do Programa limpa o programPhase; churn preserva", () => {
  const state = cloneState();
  const deal = state.deals[0];
  deal.stage = "FECHOU_COMPLETO"; deal.status = "WON_FULL"; deal.programPhase = "CADENCIA_PROGRAMA";
  const reopened = crm.moveDealStage(state, deal.id, { actorId: "gestor", stage: "EM_NEGOCIACAO" });
  assert.equal(reopened.ok, true);
  const d = reopened.state.deals.find((x) => x.id === deal.id);
  assert.equal(d.programPhase, null);
  assert.equal(d.status, "OPEN");

  const state2 = cloneState();
  const deal2 = state2.deals[0];
  deal2.stage = "FECHOU_COMPLETO"; deal2.status = "WON_FULL"; deal2.programPhase = "CADENCIA_PROGRAMA";
  const churn = crm.moveDealStage(state2, deal2.id, { actorId: "gestor", stage: "CHURN", objection: "sem condições agora" });
  assert.equal(churn.state.deals.find((x) => x.id === deal2.id).programPhase, "CADENCIA_PROGRAMA");
});

test("id de contato é determinístico: mesma pessoa converge para o mesmo id (não duplica)", () => {
  // por telefone (formatação diferente → mesmo id)
  assert.equal(
    crm.deterministicContactId({ fullName: "Ana", phone: "11 98888-1234" }),
    crm.deterministicContactId({ fullName: "Ana Beatriz", phone: "5511988881234" }),
  );
  // sem telefone: por nome + dono (acento/caixa/espaços normalizados)
  const idA = crm.deterministicContactId({ fullName: "João Silva", ownerUserId: "recepcao" });
  const idB = crm.deterministicContactId({ fullName: "joão  silva", ownerUserId: "recepcao" });
  assert.equal(idA, idB);
  assert.ok(idA.startsWith("contact-nm-"));
});
