// RECEBÍVEIS 360: a junção que a tela promete ("cada lembrete alimenta
// Recebíveis 360 automaticamente") passou a rodar na LEITURA do 360, e não mais
// dentro do submit local. Estes testes travam as duas propriedades que fazem
// isso ser seguro: repetir não duplica, e o que já estava lá não se perde.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const pagamentos = await loadTs("src/features/pagamentos/pagamentosData.ts");
const comprovantes = await loadTs("src/features/comprovantes/comprovantesData.ts");

const manual = {
  id: "recv-manual-1",
  patientReference: "Paciente digitado à mão",
  saleId: "",
  totalAmount: 1000,
  receivedAmount: 0,
  dueDate: "2026-09-30",
  paymentMethod: "Manual",
  installments: 1,
  status: "OPEN",
  ownerUserId: "Financeiro",
  collectionStatus: "NOT_STARTED",
  notes: "",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

const lembrete = {
  id: "pag-1",
  pacienteNome: "Ana Souza",
  valorPendente: 2500,
  dataPrevista: "2026-09-25",
  status: "aberto",
  criadoPor: "Coordenação",
  criadoEm: "2026-09-16T12:00:00.000Z",
};

const comprovanteMarcado = {
  id: "comp-1",
  tipo: "entrada",
  pacienteReferencia: "Bruno Lima",
  valor: 800,
  formaPagamento: "pix",
  arquivoNome: "pix-bruno.pdf",
  anexadoEm: "2026-09-16T13:00:00.000Z",
  inteligencia360ReceivableId: "recv-comp-1",
};

const comprovanteSemMarcar = { ...comprovanteMarcado, id: "comp-2", arquivoNome: "pix-carla.pdf", inteligencia360ReceivableId: undefined };

test("o lembrete de pagamento vira recebível e não apaga o que foi digitado à mão", () => {
  const junto = pagamentos.mergePagamentoReceivables([manual], [lembrete]);
  assert.equal(junto.length, 2);
  assert.ok(junto.some((item) => item.id === "recv-manual-1"), "o recebível manual continua lá");
  assert.ok(junto.some((item) => item.totalAmount === 2500), "o lembrete entrou com o valor pendente");
});

test("juntar duas vezes não duplica o lembrete", () => {
  const umaVez = pagamentos.mergePagamentoReceivables([manual], [lembrete]);
  const duasVezes = pagamentos.mergePagamentoReceivables(umaVez, [lembrete]);
  assert.equal(duasVezes.length, umaVez.length, "a segunda leitura não cria linha nova");
});

test("lembrete apagado sai do 360 na leitura seguinte", () => {
  const comLembrete = pagamentos.mergePagamentoReceivables([manual], [lembrete]);
  const semLembrete = pagamentos.mergePagamentoReceivables(comLembrete, []);
  assert.equal(semLembrete.map((item) => item.id).join(","), "recv-manual-1");
});

test("só o comprovante marcado como 'Alimentar Recebíveis 360' entra", () => {
  const junto = comprovantes.mergeComprovanteReceivables([manual], [comprovanteMarcado, comprovanteSemMarcar]);
  assert.equal(junto.length, 2, "o comprovante sem a marcação fica de fora");
  const doComprovante = junto.find((item) => item.id === "recv-comp-1");
  assert.ok(doComprovante, "o comprovante marcado virou recebível");
  assert.equal(doComprovante.status, "PAID", "comprovante é dinheiro que já entrou");
  assert.equal(doComprovante.receivedAmount, 800);
});

test("juntar o comprovante duas vezes não duplica", () => {
  const umaVez = comprovantes.mergeComprovanteReceivables([manual], [comprovanteMarcado]);
  const duasVezes = comprovantes.mergeComprovanteReceivables(umaVez, [comprovanteMarcado]);
  assert.equal(duasVezes.length, umaVez.length);
});
