// A NOTA FISCAL DENTRO DO FECHAMENTO (17/09/2026).
//
// Pedido do Lucas: registrar o fechamento no Kanban já emite a nota, com a
// escolha do paciente — uma nota só (tratamento) ou repartida, com o valor de
// cada uma digitado por gente.
//
// A régua destes testes são as TRÊS NOTAS REAIS de 01/09/2026 que o Lucas
// mandou (nº 6205 consulta R$ 1.000, nº 6204 bio R$ 500, nº 6203 tratamento
// R$ 5.119). Se o que o app monta deixar de bater com o que a clínica emite à
// mão, o teste quebra — é essa a proteção que o "cai no nosso bolso" pede.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/crm/notaNoFechamento.ts");
const DIA = "2026-09-01";
const PIX = [{ forma: "PIX" }];

test("os códigos são os das notas reais, e a unificada usa o de tratamento", () => {
  assert.equal(mod.CODIGO_DO_SERVICO.CONSULTA, "04197", "nota 6205: Clínicas e casas de saúde");
  assert.equal(mod.CODIGO_DO_SERVICO.BIOIMPEDANCIA, "04030", "nota 6204: Medicina e biomedicina");
  assert.equal(mod.CODIGO_DO_SERVICO.TRATAMENTO, "04030", "nota 6203: Medicina e biomedicina");

  const unificada = mod.planoDeNotas({ escolha: "UNIFICADA", valorRecebido: 6619, divisao: mod.divisaoVazia, diaISO: DIA, parcelas: PIX });
  assert.equal(unificada.notas.length, 1);
  assert.equal(unificada.notas[0].natureza, "TRATAMENTO");
  assert.equal(unificada.notas[0].codigoServico, "04030", "a unificada É uma nota de tratamento");
});

test("o texto da nota de consulta é igual ao da nota 6205", () => {
  const esperado = "CONSULTA MÉDICA REALIZADA NO DIA 01/09/2026, SOLICITADO PELO MÉDICO\nDANIEL BRATAN DE OLIVEIRA,CRM/SP:168.649";
  assert.equal(mod.discriminacao("CONSULTA", DIA, "PIX"), esperado);
});

test("o texto da nota de bioimpedância é igual ao da nota 6204", () => {
  // 22/09/2026: o contador exige a palavra "procedimento" na discriminação —
  // é ela que amarra o texto ao código 04030.
  const esperado = "PROCEDIMENTO MÉDICO: EXAME DE BIOIMPEDÂNCIA REALIZADO NO DIA 01/09/2026, SOLICITADO PELO MÉDICO DANIEL BRATAN DE OLIVEIRA, CRM/SP: 168.649.";
  assert.equal(mod.discriminacao("BIOIMPEDANCIA", DIA, "PIX"), esperado);
});

test("o texto da nota de tratamento é igual ao da nota 6203, com a data em pontos e a forma de pagamento", () => {
  const texto = mod.discriminacao("TRATAMENTO", DIA, "PIX");
  assert.match(texto, /^REALIZAÇÃO DE PROCEDIMENTOS MÉDICOS PERMITIDOS EM CONSULTÓRIO, PAGOS NO DIA 01\.09\.2026\./);
  assert.match(texto, /PROFISSIONAL RESPONSÁVEL PELA PRESCRIÇÃO DR\. DANIEL CARLOS BRATAN DE OLIVEIRA - CRM\/SP: 168\.649\./);
  assert.match(texto, /OS PROCEDIMENTOS MÉDICOS REFERIDOS FORAM PAGOS EM PIX\./);
});

test("a forma de pagamento entra no texto como aconteceu", () => {
  assert.equal(mod.comoFoiPago([{ forma: "PIX" }]), "PIX");
  assert.equal(mod.comoFoiPago([{ forma: "CARTAO_CREDITO", parcelas: 10 }]), "CARTÃO DE CRÉDITO EM 10 VEZES");
  assert.equal(mod.comoFoiPago([{ forma: "CARTAO_CREDITO", parcelas: 1 }]), "CARTÃO DE CRÉDITO");
  assert.equal(mod.comoFoiPago([{ forma: "PIX" }, { forma: "CARTAO_CREDITO", parcelas: 6 }]), "PIX E CARTÃO DE CRÉDITO EM 6 VEZES");
  assert.equal(mod.comoFoiPago([{ forma: "PIX" }, { forma: "PIX" }]), "PIX", "duas parcelas na mesma forma não repetem o texto");
  assert.equal(mod.comoFoiPago([]), "");
});

test("a divisão reproduz o atendimento real da Rosana: três notas, três códigos", () => {
  const plano = mod.planoDeNotas({
    escolha: "REPARTIDA",
    valorRecebido: 6619,
    divisao: { consulta: 1000, bioimpedancia: 500, tratamento: 5119 },
    diaISO: DIA,
    parcelas: PIX,
  });
  assert.equal(plano.impedimento, "", "soma fecha: pode emitir");
  assert.equal(plano.notas.length, 3);
  assert.deepEqual(plano.notas.map((n) => `${n.natureza}:${n.valor}:${n.codigoServico}`).join(" | "),
    "CONSULTA:1000:04197 | BIOIMPEDANCIA:500:04030 | TRATAMENTO:5119:04030");
  assert.equal(plano.somaDasNotas, 6619);
  assert.equal(plano.diferenca, 0);
});

test("a soma TEM que fechar — nota a mais ou a menos é imposto errado", () => {
  const falta = mod.planoDeNotas({ escolha: "REPARTIDA", valorRecebido: 6619, divisao: { consulta: 1000, bioimpedancia: 500, tratamento: 5000 }, diaISO: DIA, parcelas: PIX });
  assert.match(falta.impedimento, /Faltam/);
  assert.equal(falta.diferenca, 119);

  const passou = mod.planoDeNotas({ escolha: "REPARTIDA", valorRecebido: 6619, divisao: { consulta: 1000, bioimpedancia: 500, tratamento: 5200 }, diaISO: DIA, parcelas: PIX });
  assert.match(passou.impedimento, /passam/);
  assert.equal(passou.diferenca, -81);
});

test("nota com valor zero simplesmente não é criada", () => {
  const plano = mod.planoDeNotas({ escolha: "REPARTIDA", valorRecebido: 5119, divisao: { consulta: 0, bioimpedancia: 0, tratamento: 5119 }, diaISO: DIA, parcelas: PIX });
  assert.equal(plano.notas.length, 1);
  assert.equal(plano.notas[0].natureza, "TRATAMENTO");
  assert.equal(plano.impedimento, "");
});

test("repartida sem dizer nenhum valor não emite nada e explica", () => {
  const plano = mod.planoDeNotas({ escolha: "REPARTIDA", valorRecebido: 6619, divisao: mod.divisaoVazia, diaISO: DIA, parcelas: PIX });
  assert.equal(plano.notas.length, 0);
  assert.match(plano.impedimento, /quanto vai em cada nota/);
});

test("sem valor recebido não sai nota, nas duas escolhas", () => {
  for (const escolha of ["UNIFICADA", "REPARTIDA"]) {
    const plano = mod.planoDeNotas({ escolha, valorRecebido: 0, divisao: mod.divisaoVazia, diaISO: DIA, parcelas: PIX });
    assert.equal(plano.notas.length, 0);
    assert.match(plano.impedimento, /valor recebido/);
  }
});

test("'não emitir agora' não é erro — é uma escolha", () => {
  const plano = mod.planoDeNotas({ escolha: "SEM_NOTA", valorRecebido: 6619, divisao: mod.divisaoVazia, diaISO: DIA, parcelas: PIX });
  assert.equal(plano.notas.length, 0);
  assert.equal(plano.impedimento, "", "sem impedimento: ninguém está tentando emitir");
});

test("a economia da unificada é o número que justifica a escolha", () => {
  // Repartido: 1000 a 13,33% + 500 a 7,93% + 5119 a 7,93% = 133,30 + 39,65 + 405,94 = 578,89
  // Unificado: 6619 a 7,93% = 524,89. Economia = 54,00.
  const economia = mod.economiaDaUnificada(6619, { consulta: 1000, bioimpedancia: 500, tratamento: 5119 });
  assert.equal(economia, 54);

  const semConsulta = mod.economiaDaUnificada(5119, { consulta: 0, bioimpedancia: 0, tratamento: 5119 });
  assert.equal(semConsulta, 0, "sem consulta na divisão, unificar não economiza nada");
});

test("o imposto estimado de cada nota usa a carga da natureza dela", () => {
  const plano = mod.planoDeNotas({ escolha: "REPARTIDA", valorRecebido: 1500, divisao: { consulta: 1000, bioimpedancia: 500, tratamento: 0 }, diaISO: DIA, parcelas: PIX });
  const consulta = plano.notas.find((n) => n.natureza === "CONSULTA");
  const bio = plano.notas.find((n) => n.natureza === "BIOIMPEDANCIA");
  assert.equal(consulta.impostoEstimado, 133.3, "13,33% sobre 1.000");
  assert.equal(bio.impostoEstimado, 39.65, "7,93% sobre 500");
  assert.equal(plano.impostoTotal, 172.95);
});

test("o que falta na ficha para a nota sair identificada", () => {
  assert.deepEqual(mod.pendenciasDoTomador({ nome: "Rosana", cpf: "10301613800", email: "r@x.com" }).join(","), "");
  assert.deepEqual(mod.pendenciasDoTomador({ nome: "Rosana", cpf: "", email: "" }).join(","), "CPF,e-mail");
});

// ---------------------------------------------------------------------------
// A TRAVA DO FECHAMENTO (18/09/2026)
//
// Lucas, sobre a minha proposta de nunca travar o fechamento pela nota:
// *"não concordo, pois tudo tem que ter nf"*. Estes testes são essa frase.
// ---------------------------------------------------------------------------
const planoVazio = { notas: [], somaDasNotas: 0, diferenca: 0, impostoTotal: 0, impedimento: "" };

test("sem nota escolhida e com dinheiro na mão, o fechamento não passa", () => {
  const nota = { ...mod.notaDoFechamentoVazia, escolha: "REPARTIDA", divisao: mod.divisaoVazia };
  const plano = mod.planoDeNotas({ escolha: "REPARTIDA", valorRecebido: 6997, divisao: mod.divisaoVazia, diaISO: DIA, parcelas: PIX });
  const trava = mod.travaDoFechamento({ nota, valorRecebido: 6997, ehSinal: false, plano });
  assert.equal(trava, "Diga quanto vai em cada nota.");
});

test("a divisão que não fecha com o recebido trava, e diz quanto falta", () => {
  const divisao = { consulta: 1500, bioimpedancia: 0, tratamento: 4000 };
  const plano = mod.planoDeNotas({ escolha: "REPARTIDA", valorRecebido: 6997, divisao, diaISO: DIA, parcelas: PIX });
  const trava = mod.travaDoFechamento({ nota: { escolha: "REPARTIDA", divisao, motivoSemNota: "" }, valorRecebido: 6997, ehSinal: false, plano });
  assert.match(trava, /Faltam/);
  assert.match(trava, /1\.497/);
});

test("sinal de consulta não exige nota — é adiantamento, a nota sai no fechamento", () => {
  const nota = { ...mod.notaDoFechamentoVazia, escolha: "SEM_NOTA", motivoSemNota: "" };
  const trava = mod.travaDoFechamento({ nota, valorRecebido: 500, ehSinal: true, plano: planoVazio });
  assert.equal(trava, "");
});

test("'não emitir agora' passa, mas só com motivo escrito", () => {
  const semMotivo = { ...mod.notaDoFechamentoVazia, escolha: "SEM_NOTA", motivoSemNota: "   " };
  assert.equal(
    mod.travaDoFechamento({ nota: semMotivo, valorRecebido: 3000, ehSinal: false, plano: planoVazio }),
    "Diga por que esta comanda não vai ter nota fiscal.",
  );
  const comMotivo = { ...semMotivo, motivoSemNota: "Paciente vai passar o CPF da empresa amanhã" };
  assert.equal(mod.travaDoFechamento({ nota: comMotivo, valorRecebido: 3000, ehSinal: false, plano: planoVazio }), "");
});

test("fechamento sem dinheiro não exige nota", () => {
  const nota = { ...mod.notaDoFechamentoVazia, escolha: "REPARTIDA" };
  assert.equal(mod.travaDoFechamento({ nota, valorRecebido: 0, ehSinal: false, plano: planoVazio }), "");
});

test("o resumo leva os códigos, porque é o que quem emite lê", () => {
  const divisao = { consulta: 1000, bioimpedancia: 500, tratamento: 5119 };
  const plano = mod.planoDeNotas({ escolha: "REPARTIDA", valorRecebido: 6619, divisao, diaISO: DIA, parcelas: PIX });
  const resumo = mod.resumoDaNota({ escolha: "REPARTIDA", divisao, motivoSemNota: "" }, plano);
  assert.match(resumo, /NF repartida em 3/);
  assert.match(resumo, /04197/);
  assert.match(resumo, /04030/);

  const unificada = mod.planoDeNotas({ escolha: "UNIFICADA", valorRecebido: 6619, divisao: mod.divisaoVazia, diaISO: DIA, parcelas: PIX });
  const resumoUnificado = mod.resumoDaNota({ escolha: "UNIFICADA", divisao: mod.divisaoVazia, motivoSemNota: "" }, unificada);
  assert.match(resumoUnificado, /NF unificada/);
  assert.match(resumoUnificado, /04030/);
  assert.doesNotMatch(resumoUnificado, /04197/, "a unificada é nota de tratamento, nunca de consulta");
});

test("sem nota, o resumo carrega o motivo — a decisão fica registrada", () => {
  const resumo = mod.resumoDaNota({ escolha: "SEM_NOTA", divisao: mod.divisaoVazia, motivoSemNota: "CPF do titular pendente" }, planoVazio);
  assert.equal(resumo, "Sem nota agora — CPF do titular pendente");
});
