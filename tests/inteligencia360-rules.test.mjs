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
    },
    { filename: absolutePath },
  );

  return module.exports;
}

const engine = loadTsModule("src/features/inteligencia360/intelligenceEngine.ts");
const data = loadTsModule("src/features/inteligencia360/inteligencia360Data.ts");
const comprovantes = loadTsModule("src/features/comprovantes/comprovantesData.ts");
const pagamentos = loadTsModule("src/features/pagamentos/pagamentosData.ts");

function cloneState() {
  return JSON.parse(JSON.stringify(data.demoInteligencia360Fixtures));
}

test("Dashboard 360 consolida dados das fontes sem modificar o estado operacional", () => {
  const state = cloneState();
  const before = JSON.stringify(state);
  const snapshot = engine.buildDashboard360Snapshot(state, new Date("2026-06-30T12:00:00.000Z"));

  const soldFromCommercial = state.prescriptions.reduce((sum, record) => sum + record.soldAmount, 0);
  const receivedFromCommercial = state.prescriptions.reduce((sum, record) => sum + record.receivedAmount, 0);
  const overdueReceivables = state.receivables
    .filter((record) => record.status === "OVERDUE" || data.isOverdue(record.dueDate))
    .reduce((sum, record) => sum + data.receivableOpenAmount(record), 0);

  assert.equal(snapshot.totalSoldAmount, soldFromCommercial);
  assert.equal(snapshot.totalReceivedAmount, receivedFromCommercial);
  assert.equal(snapshot.totalOverdueReceivables, overdueReceivables);
  assert.equal(JSON.stringify(state), before);
});

test("qualidade dos dados marca fonte ausente e reduz score executivo", () => {
  const state = cloneState();
  state.weeklyTickets = [];

  const ticketInsight = engine.analyzeWeeklyTicket(state)[0];
  const quality = engine.buildDataQuality(state);
  const ticketQuality = quality.find((item) => item.module === "Ticket Médio Semanal");
  const snapshot = engine.buildDashboard360Snapshot(state, new Date("2026-06-30T12:00:00.000Z"));

  assert.equal(ticketInsight.severity, "critical");
  assert.equal(ticketInsight.sourceHref, data.moduleRoutes360.ticket);
  assert.equal(ticketQuality.status, "missing");
  assert.ok(snapshot.dataCompletenessScore < 100);
});

test("conversão de prescrição gera alerta crítico abaixo de 70% e atenção acima de 95%", () => {
  const lowState = cloneState();
  lowState.prescriptions = [
    {
      ...lowState.prescriptions[0],
      prescribedAmount: 100000,
      soldAmount: 50000,
    },
  ];

  const highState = cloneState();
  highState.prescriptions = [
    {
      ...highState.prescriptions[0],
      prescribedAmount: 100000,
      soldAmount: 99000,
    },
  ];

  const lowInsight = engine.analyzePrescriptionConversion(lowState)[0];
  const highInsight = engine.analyzePrescriptionConversion(highState)[0];

  assert.equal(lowInsight.severity, "critical");
  assert.equal(lowInsight.id, "prescriptions-low-conversion");
  assert.equal(highInsight.severity, "attention");
  assert.equal(highInsight.id, "prescriptions-money-left");
});

test("recebíveis vencidos e caixa recebido baixo viram recomendações de ação", () => {
  const state = cloneState();
  state.prescriptions = [
    {
      ...state.prescriptions[0],
      soldAmount: 100000,
      receivedAmount: 20000,
    },
  ];
  state.receivables = [
    {
      ...state.receivables[0],
      totalAmount: 30000,
      receivedAmount: 5000,
      dueDate: "2026-06-01",
      status: "OPEN",
    },
  ];

  const insightIds = engine.analyzeReceivables(state).map((insight) => insight.id);

  assert.equal(JSON.stringify(insightIds), JSON.stringify(["receivables-overdue", "cash-gap"]));
});

test("insight crítico de experiência vira ação com impacto em experiência do paciente", () => {
  const state = cloneState();
  state.experiences = [
    {
      ...state.experiences[0],
      npsScore: 5,
      feedbackType: "CRITICISM",
    },
  ];

  const insight = engine.analyzePatientExperience(state).find((item) => item.id === "nps-low");
  const action = engine.actionFromInsight(insight);

  assert.equal(action.priority, "CRITICAL");
  assert.equal(action.expectedImpact, "PATIENT_EXPERIENCE");
  assert.equal(action.sourceModule, "NPS");
  assert.equal(action.status, "OPEN");
});

test("resumo semanal inclui financeiro, conversão e ações recomendadas", () => {
  const state = cloneState();
  const brief = engine.generateWeeklyKickoffBrief(state);

  assert.match(brief, /Kick-off semanal - Inteligência 360/);
  assert.match(brief, /Vendido:/);
  assert.match(brief, /Conversão prescrito x vendido:/);
  assert.match(brief, /Ações recomendadas:/);
});

test("ação operacional muda status mantendo rastreabilidade de atualização", () => {
  const state = cloneState();
  const action = state.actions[0];
  const updated = data.updateActionStatus360(action, "DONE", "2026-06-30T15:00:00.000Z");

  assert.equal(updated.status, "DONE");
  assert.equal(updated.updatedAt, "2026-06-30T15:00:00.000Z");
  assert.equal(updated.id, action.id);
});

test("recebível marcado como pago zera aberto e resolve cobrança", () => {
  const state = cloneState();
  const receivable = {
    ...state.receivables[0],
    totalAmount: 10000,
    receivedAmount: 2500,
    collectionStatus: "FIRST_CONTACT",
  };
  const paid = data.updateReceivableStatus360(receivable, "PAID", "2026-06-30T15:00:00.000Z");
  const overdue = data.updateReceivableStatus360(receivable, "OVERDUE", "2026-06-30T15:01:00.000Z");

  assert.equal(paid.receivedAmount, 10000);
  assert.equal(paid.collectionStatus, "RESOLVED");
  assert.equal(data.receivableOpenAmount(paid), 0);
  assert.equal(overdue.receivedAmount, 2500);
  assert.equal(overdue.collectionStatus, "FIRST_CONTACT");
});

test("comprovante vinculado baixa lembrete de pagamento sem duplicar preenchimento", () => {
  const pagamentos = [
    {
      id: "pag-1",
      pacienteNome: "Paciente A",
      valorPendente: 1200,
      dataPrevista: "2026-06-30",
      status: "aberto",
      criadoPor: "Financeiro",
      criadoEm: "2026-06-29T10:00:00.000Z",
    },
    {
      id: "pag-2",
      pacienteNome: "Paciente B",
      valorPendente: 900,
      dataPrevista: "2026-07-01",
      status: "aberto",
      criadoPor: "Financeiro",
      criadoEm: "2026-06-29T10:00:00.000Z",
    },
  ];

  const updated = comprovantes.applyComprovanteToPagamentos(pagamentos, {
    id: "comp-1",
    tipo: "entrada",
    arquivoNome: "pix.pdf",
    arquivoTipo: "application/pdf",
    arquivoTamanho: 1000,
    anexadoEm: "2026-06-30T14:30:00.000Z",
    anexadoPor: "Recepção",
    anexadoPorCargo: "recepcionista",
    pagamentoLembreteId: "pag-1",
    sharePoint: { comprovanteId: "comp-1", arquivoNome: "pix.pdf", queuedAt: "2026-06-30T14:30:00.000Z", provider: "microsoft_graph_next_phase", status: "pendente" },
  });

  assert.equal(updated[0].status, "pago");
  assert.equal(updated[0].pagoEm, "2026-06-30T14:30:00.000Z");
  assert.equal(updated[1].status, "aberto");
});

test("comprovante com paciente e valor vira recebível 360 pago uma única vez", () => {
  const receivable = comprovantes.receivableFromComprovante({
    id: "comp-2",
    tipo: "entrada",
    arquivoNome: "cartao.pdf",
    arquivoTipo: "application/pdf",
    arquivoTamanho: 1000,
    anexadoEm: "2026-06-30T15:00:00.000Z",
    anexadoPor: "Recepção",
    anexadoPorCargo: "recepcionista",
    pacienteReferencia: "Paciente C",
    pagamentoLembreteId: "pag-3",
    inteligencia360ReceivableId: "recv-comp-2",
    valor: 1850,
    formaPagamento: "cartao_credito",
    sharePoint: { comprovanteId: "comp-2", arquivoNome: "cartao.pdf", queuedAt: "2026-06-30T15:00:00.000Z", provider: "microsoft_graph_next_phase", status: "pendente" },
  });

  const withoutPatient = comprovantes.receivableFromComprovante({
    id: "comp-3",
    tipo: "entrada",
    arquivoNome: "sem-paciente.pdf",
    arquivoTipo: "application/pdf",
    arquivoTamanho: 1000,
    anexadoEm: "2026-06-30T15:00:00.000Z",
    anexadoPor: "Recepção",
    anexadoPorCargo: "recepcionista",
    valor: 1850,
    sharePoint: { comprovanteId: "comp-3", arquivoNome: "sem-paciente.pdf", queuedAt: "2026-06-30T15:00:00.000Z", provider: "microsoft_graph_next_phase", status: "pendente" },
  });

  assert.equal(receivable.id, "recv-comp-2");
  assert.equal(receivable.status, "PAID");
  assert.equal(receivable.collectionStatus, "RESOLVED");
  assert.equal(receivable.patientReference, "Paciente C");
  assert.equal(receivable.paymentMethod, "Cartão de crédito");
  assert.equal(withoutPatient, null);
});

test("lembrete de pagamento alimenta Recebíveis 360 e acompanha status", () => {
  const openPayment = {
    id: "pag-360",
    pacienteNome: "Paciente Lembrete",
    valorPendente: 3200,
    dataPrevista: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    observacao: "Promessa de pagamento registrada.",
    status: "aberto",
    criadoPor: "Financeiro",
    criadoEm: "2026-06-30T10:00:00.000Z",
  };
  const paidPayment = {
    ...openPayment,
    status: "pago",
    pagoEm: "2026-07-03T12:00:00.000Z",
  };

  const openReceivable = pagamentos.receivableFromPagamento(openPayment);
  const paidReceivable = pagamentos.receivableFromPagamento(paidPayment);

  assert.equal(openReceivable.id, "recv-pagamento-pag-360");
  assert.equal(openReceivable.status, "OPEN");
  assert.equal(openReceivable.collectionStatus, "PROMISED_PAYMENT");
  assert.equal(openReceivable.receivedAmount, 0);
  assert.equal(paidReceivable.status, "PAID");
  assert.equal(paidReceivable.receivedAmount, 3200);
  assert.equal(paidReceivable.collectionStatus, "RESOLVED");
});

test("recebíveis automáticos de lembretes substituem só a própria fonte", () => {
  const merged = pagamentos.mergePagamentoReceivables(
    [
      {
        id: "recv-pagamento-antigo",
        patientReference: "Antigo",
        saleId: "",
        totalAmount: 100,
        receivedAmount: 0,
        dueDate: "2026-06-30",
        paymentMethod: "Lembrete de pagamento",
        installments: 1,
        status: "OPEN",
        ownerUserId: "Financeiro",
        collectionStatus: "PROMISED_PAYMENT",
        notes: "",
        createdAt: "2026-06-30T10:00:00.000Z",
        updatedAt: "2026-06-30T10:00:00.000Z",
      },
      {
        id: "recv-comprovante-1",
        patientReference: "Comprovante",
        saleId: "",
        totalAmount: 200,
        receivedAmount: 200,
        dueDate: "2026-06-30",
        paymentMethod: "Pix",
        installments: 1,
        status: "PAID",
        ownerUserId: "Financeiro",
        collectionStatus: "RESOLVED",
        notes: "",
        createdAt: "2026-06-30T10:00:00.000Z",
        updatedAt: "2026-06-30T10:00:00.000Z",
      },
    ],
    [
      {
        id: "novo",
        pacienteNome: "Paciente Novo",
        valorPendente: 500,
        dataPrevista: "2026-07-10",
        status: "aberto",
        criadoPor: "Financeiro",
        criadoEm: "2026-06-30T10:00:00.000Z",
      },
    ],
  );

  assert.equal(JSON.stringify(merged.map((record) => record.id)), JSON.stringify(["recv-pagamento-novo", "recv-comprovante-1"]));
});

test("venda parcial cria recebível 360 sem pedir novo cadastro financeiro", () => {
  const sale = {
    id: "rx-1",
    patientReference: "Paciente Comercial",
    patientType: "NEW",
    doctorId: "Dr. Daniel",
    sellerId: "Comercial",
    consultationDate: "2026-06-30",
    prescribedAmount: 12000,
    soldAmount: 10000,
    receivedAmount: 4000,
    closed: true,
    fullPlanClosed: false,
    partialReason: "",
    discountPercentage: 0,
    paymentMethod: "Cartão",
    installments: 3,
    acquisitionChannel: "Indicação",
    mainObjection: "Preço",
    objectionCategory: "PRICE",
    nextFollowUpDate: "2026-07-05",
    status: "CLOSED_PARTIAL",
    notes: "",
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T10:00:00.000Z",
  };

  const receivable = data.receivableFromPrescriptionSale(sale);
  const merged = data.mergePrescriptionReceivables([], [sale]);

  assert.equal(receivable.id, "recv-sale-rx-1");
  assert.equal(receivable.totalAmount, 10000);
  assert.equal(receivable.receivedAmount, 4000);
  assert.equal(receivable.status, "PARTIALLY_PAID");
  assert.equal(receivable.dueDate, "2026-07-05");
  assert.equal(merged.length, 1);
});
