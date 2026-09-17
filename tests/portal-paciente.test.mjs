import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/portal/portalPaciente.ts");
const hoje = "2026-09-15";

test("frase de dias em português, sem número solto", () => {
  assert.equal(mod.fraseDeDias(0), "é hoje");
  assert.equal(mod.fraseDeDias(1), "é amanhã");
  assert.equal(mod.fraseDeDias(5), "daqui a 5 dias");
  assert.equal(mod.fraseDeDias(20), "daqui a 3 semanas");
  assert.equal(mod.fraseDeDias(75), "daqui a 2 meses e meio");
  assert.equal(mod.fraseDeDias(62), "daqui a 2 meses");
  assert.equal(mod.fraseDeDias(85), "daqui a 3 meses");
  assert.equal(mod.fraseDeDias(-1), "foi ontem");
});

test("próxima consulta é só a MARCADA — data prevista pelo plano nunca ocupa o lugar dela", () => {
  const marcos = [
    { key: "MEDICO-1", type: "MEDICO", n: 1, total: 3, label: "1ª consulta (mês 2)", expectedDate: "2026-09-01", done: true, overdue: false },
    { key: "MEDICO-2", type: "MEDICO", n: 2, total: 3, label: "2ª consulta (mês 4)", expectedDate: "2026-11-01", done: false, overdue: false },
  ];
  const real = mod.proximaConsulta([{ id: "c1", em: "2026-09-26T14:00:00-03:00", profissional: "Dr. Daniel", tipo: "Consulta", local: "Instituto Bratan", status: "AGENDADA", origem: "MANUAL" }], marcos, hoje);
  assert.equal(real.origem, "MANUAL");
  assert.equal(real.dias, 11);
  assert.equal(real.quando, "daqui a 11 dias");
  assert.equal(real.titulo, "sábado, 26 de setembro");
  assert.equal(real.hora, "14h");
  assert.equal(real.podeResponder, true, "dentro de 14 dias e ainda não confirmada");
  // 16/09/2026: a Gabriela leu "próxima consulta: 19 de fevereiro" de uma consulta
  // que ninguém tinha marcado — era a data prevista pelo plano, com cara de
  // marcada. Sem consulta na agenda, a resposta certa é "ainda não foi marcada".
  const semMarcar = mod.proximaConsulta([], marcos, hoje);
  assert.equal(semMarcar, null, "ter marco previsto no plano não é ter consulta marcada");

  const cancelada = mod.proximaConsulta([{ id: "c2", em: "2026-09-20T10:00:00-03:00", profissional: "Dr. Daniel", tipo: "Consulta", local: "", status: "CANCELADA", origem: "MANUAL" }], marcos, hoje);
  assert.equal(cancelada, null, "cancelada não conta");

  const realizada = mod.proximaConsulta([{ id: "c3", em: "2026-09-20T10:00:00-03:00", profissional: "Dr. Daniel", tipo: "Consulta", local: "", status: "REALIZADA", origem: "AGENDA" }], marcos, hoje);
  assert.equal(realizada, null, "já realizada também não");
});

test("evolução: delta entre a primeira e a última medição, com frase de contexto", () => {
  const m = (dia, pesoKg, gorduraPct = null, massaMagraKg = null) => ({ id: dia, dia, pesoKg, gorduraPct, massaMagraKg, cinturaCm: null, origem: "ENFERMAGEM" });
  const r = mod.resumoEvolucao([m("2026-07-01", 92.4, 34.1, 55.2), m("2026-08-01", 90.1, 33.0, 55.4), m("2026-09-01", 88.0, 31.5, 55.6)], hoje);
  assert.equal(r.deltaPeso, -4.4);
  assert.equal(r.deltaGordura, -2.6);
  assert.equal(r.deltaMassaMagra, 0.4);
  assert.equal(r.semanas, 9);
  assert.match(r.frase, /perdeu 4,4 kg, mantendo a massa magra/);
  assert.equal(r.pontos.length, 3);
  const inicio = mod.resumoEvolucao([m("2026-09-05", 92.0), m("2026-09-12", 92.2)], hoje);
  assert.match(inicio.frase, /primeiro mês é de adaptação/);
  assert.equal(mod.resumoEvolucao([], hoje), null);
});

test("financeiro: contratado, pago, em aberto e a frase", () => {
  const comandas = [{ id: "s1", dia: "2026-08-10", itens: [{ descricao: "Plano 6 meses", tipo: "PLANO", valor: 8990 }], pagamentos: [{ metodo: "PIX", valor: 3000, parcelas: 1 }], total: 8990 }];
  const r = mod.resumoFinanceiro(comandas, [{ id: "p1", valor: 2995, prevista: "2026-09-25", observacao: "" }, { id: "p2", valor: 2995, prevista: "2026-10-25", observacao: "" }], hoje);
  assert.equal(r.contratado, 8990);
  assert.equal(r.pago, 3000);
  assert.equal(r.emAberto, 5990);
  assert.equal(r.proximaParcela.id, "p1");
  assert.match(r.frase, /R\$\s3\.000 já pagos · falta R\$\s5\.990 em 2 parcelas · a próxima vence em 25\/09/);
  assert.match(mod.resumoFinanceiro(comandas, [], hoje).frase, /Tudo em dia/);
});

test("trilha: agrupa por mês, marca o mês atual e escreve o próximo passo", () => {
  const marcos = [];
  for (let n = 1; n <= 6; n++) {
    marcos.push({ key: `CHECK-${n}`, type: "CHECK", n, total: 6, label: `Checkpoint Performance ${n}/6`, expectedDate: `2026-${String(6 + n).padStart(2, "0")}-01`.replace("2026-13", "2027-01"), done: n <= 2, overdue: false });
    marcos.push({ key: `BIO-${n}`, type: "BIO", n, total: 6, label: `Bioimpedância ${n}/6`, expectedDate: `2026-${String(6 + n).padStart(2, "0")}-01`.replace("2026-13", "2027-01"), done: n <= 2, overdue: false });
  }
  marcos.push({ key: "MEDICO-1", type: "MEDICO", n: 1, total: 3, label: "1ª consulta (mês 2)", expectedDate: "2026-08-01", done: true, overdue: false });
  const t = mod.trilhaDoPlano(marcos, "2026-06-01", hoje);
  assert.equal(t.mesAtual, 4);
  assert.equal(t.passos[0].estado, "feito");
  assert.equal(t.passos[3].estado, "agora");
  assert.equal(t.passos[5].estado, "futuro");
  assert.equal(t.passos[1].marcos.length, 3, "mês 2 tem check, bio e consulta do médico");
  assert.equal(t.feitos, 5);
  assert.match(t.frase, /mês 4 de 6/);
  assert.match(t.frase, /com enfermagem/);
});

test("nome do plano e link do portal", () => {
  assert.equal(mod.nomeDoPlano("CLUBE_BRATAN"), "Clube Bratan");
  assert.equal(mod.nomeDoPlano(null), "Plano de acompanhamento");
  assert.equal(mod.primeiroNome("Maria da Silva"), "Maria");
  assert.equal(mod.montarLinkPortal("https://app-bratan.vercel.app/", "abc"), "https://app-bratan.vercel.app/meu/entrar?t=abc");
  assert.equal(mod.saudacao("Maria", 9), "Bom dia, Maria.");
});

// ---- A CURVA COMEÇA NO PLANO (17/09/2026) ----------------------------------
// A importação da InBody trouxe anos de exames. Sem recorte, quem fechou o plano
// há um mês lia "acompanhando há 166 semanas" e "desde junho de 2023 você já
// perdeu...", misturando a vida inteira com o que o plano entregou.
// Decisão do Lucas: de cara mostra o plano; a vida toda é a pedido do paciente.
const med = (dia, pesoKg, gorduraPct = null) => ({ id: dia, dia, pesoKg, gorduraPct, massaMagraKg: null, cinturaCm: null, origem: "IMPORTACAO" });

const historicoLongo = [
  med("2023-06-26", 98.0),
  med("2024-03-10", 95.0),
  med("2026-08-24", 92.0), // dia do fechamento
  med("2026-09-10", 89.5),
];

test("de cara, a curva mostra só do fechamento do plano para frente", () => {
  const r = mod.resumoEvolucao(historicoLongo, hoje, "2026-08-24");
  assert.equal(r.pontos.length, 2, "as medições de 2023 e 2024 ficam de fora");
  assert.equal(r.primeira.dia, "2026-08-24");
  assert.equal(r.deltaPeso, -2.5, "o que o plano entregou, não a vida inteira");
  assert.equal(r.semanas, 2, "'acompanhando há' passa a contar do plano");
});

test("sem recorte, a curva mostra a vida toda", () => {
  const r = mod.resumoEvolucao(historicoLongo, hoje);
  assert.equal(r.pontos.length, 4);
  assert.equal(r.primeira.dia, "2023-06-26");
  assert.equal(r.deltaPeso, -8.5);
});

test("o botão só aparece quando existe mesmo histórico anterior", () => {
  assert.equal(mod.medicoesAntesDoPlano(historicoLongo, "2026-08-24"), 2);
  assert.equal(mod.medicoesAntesDoPlano(historicoLongo, "2023-01-01"), 0, "tudo dentro do plano: nada a oferecer");
  assert.equal(mod.medicoesAntesDoPlano(historicoLongo, null), 0, "sem plano, não há corte");
});

test("o dia do fechamento entra no plano, não no passado", () => {
  const r = mod.resumoEvolucao(historicoLongo, hoje, "2026-08-24");
  assert.equal(r.primeira.dia, "2026-08-24", "quem mediu no próprio dia do fechamento conta como plano");
});
