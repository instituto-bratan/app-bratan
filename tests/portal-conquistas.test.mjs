// CONQUISTAS E A HISTÓRIA ATÉ AQUI (14/10/2026): só o que o dado prova.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const c = loadTs("src/features/portal/conquistas.ts");
const p = loadTs("src/features/portal/portalPaciente.ts");
const demo = loadTs("src/features/portal/portalDemo.ts");

const HOJE = "2026-10-14";
const plano = { dealId: "d", canal: "PROGRAMA", inicio: "2026-07-06", fase: null, marcosFeitos: [], valorContratado: 0, valorRecebido: 0, closedAt: null, programPhaseEnteredAt: null, createdAt: "", updatedAt: "" };
const med = (id, dia, peso, extra = {}) => ({ id, dia, pesoKg: peso, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "ENFERMAGEM", ...extra });

function montar(medicoes, jornada = null) {
  const evolucao = p.resumoEvolucao(medicoes, HOJE, plano.inicio);
  const inbody = p.resumoInBody(medicoes, plano.inicio);
  return c.conquistasDoPaciente({ plano, medicoes, evolucao, inbody, jornada, hojeISO: HOJE });
}
const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));

test("os primeiros quilos: ganha no dia em que cruzou; meta não alcançada NÃO aparece (nada de 'faltam X kg')", () => {
  const lista = porId(montar([med("a", "2026-07-06", 92.4), med("b", "2026-08-05", 89.2), med("c", "2026-09-04", 86.9), med("d", "2026-10-04", 86.2)]));
  assert.equal(lista["peso-3"].ganha, true);
  assert.equal(lista["peso-3"].quando, "2026-08-05");
  assert.equal(lista["peso-5"].ganha, true);
  assert.equal(lista["peso-5"].quando, "2026-09-04");
  assert.equal(lista["peso-10"], undefined, "a clínica não prescreveu 10 kg: a medalha só existe quando acontece");
  for (const c of Object.values(lista)) assert.doesNotMatch(c.detalhe, /[Ff]altam? \d/);
});

test("resultado só aparece ganho; caminho aparece também por ganhar", () => {
  const lista = montar([med("a", "2026-07-06", 92.4)]);
  const faltando = lista.filter((x) => !x.ganha).map((x) => x.id);
  for (const id of faltando) assert.ok(["exame", "constancia", "meio", "chegada"].includes(id), `${id} não pode aparecer como meta`);
});

test("nada é ganho sem dado: sem medição, só o primeiro passo (o plano) conta", () => {
  const lista = montar([]);
  assert.deepEqual([...lista.filter((x) => x.ganha).map((x) => x.id)], ["inicio"]);
  assert.equal(porId(lista).exame.ganha, false);
  assert.equal(porId(lista).visceral, undefined);
});

test("medição de antes do plano não conta (o recorte é o mesmo da curva)", () => {
  const lista = porId(montar([med("velha", "2025-01-10", 110), med("a", "2026-07-06", 92.4), med("b", "2026-10-04", 91.0)]));
  assert.equal(lista["peso-3"], undefined, "os 110 kg de 2025 não viram 18 kg perdidos");
});

test("massa magra mantida: só exames da clínica, o mesmo par para peso e massa magra; nunca o SMM nem a balança de casa", () => {
  const ok = porId(montar([med("a", "2026-07-06", 92.4, { gorduraPct: 34, massaMagraKg: 55.2, gorduraVisceral: 12 }), med("b", "2026-10-04", 89.0, { gorduraPct: 32, massaMagraKg: 55.4, gorduraVisceral: 9 })]));
  assert.equal(ok.musculo.ganha, true);
  assert.equal(ok.visceral.ganha, true);
  const perdeu = porId(montar([med("a", "2026-07-06", 92.4, { gorduraPct: 34, massaMagraKg: 55.2, gorduraVisceral: 12 }), med("b", "2026-10-04", 89.0, { gorduraPct: 33, massaMagraKg: 53.0, gorduraVisceral: 11 })]));
  assert.equal(perdeu.musculo, undefined);
  assert.equal(perdeu.visceral, undefined);
  // Exames quase iguais e a queda só na balança de casa: não há prova de massa magra mantida.
  const casa = porId(montar([med("a", "2026-07-06", 90, { gorduraPct: 30, massaMagraKg: 55, massaMuscularKg: 30 }), med("b", "2026-08-05", 89.5, { gorduraPct: 30, massaMagraKg: 55, massaMuscularKg: 30.1 }), med("c", "2026-10-10", 87.5, { origem: "PACIENTE" })]));
  assert.equal(casa.musculo, undefined);
});

test("constância: semanas seguidas com medição (a maior e a de agora)", () => {
  const semanas = ["2026-09-14", "2026-09-22", "2026-09-29", "2026-10-06", "2026-10-13"].map((d, i) => med(`s${i}`, d, 90 - i * 0.3, { origem: "PACIENTE" }));
  const r = c.constanciaDePesagem(semanas, "2026-07-06", HOJE);
  assert.ok(r.maior >= 4);
  assert.ok(r.atual >= 4);
  assert.equal(porId(montar(semanas)).constancia.ganha, true);
  const falhando = c.constanciaDePesagem([med("x", "2026-08-01", 90, { origem: "PACIENTE" })], "2026-07-06", HOJE);
  assert.equal(falhando.atual, 0);
});

test("ganhas vêm primeiro, da mais antiga para a mais nova", () => {
  const lista = montar([med("a", "2026-07-06", 92.4, { gorduraPct: 34 }), med("b", "2026-09-04", 88.0, { gorduraPct: 31 })]);
  const ganhas = lista.filter((x) => x.ganha);
  const datas = ganhas.map((x) => x.quando ?? "9999");
  assert.deepEqual([...datas], [...datas].sort());
  assert.ok(lista.findIndex((x) => !x.ganha) >= ganhas.length);
});

test("a história da demo: abertura, peso, composição, score, presença e o próximo capítulo", () => {
  const d = demo.dadosDemo(HOJE);
  const evolucao = p.resumoEvolucao(d.medicoes, HOJE, d.plano.inicio);
  const inbody = p.resumoInBody(d.medicoes, d.plano.inicio);
  const caps = c.capitulosDaHistoria({ primeiroNome: "Mariana", plano: d.plano, consultas: d.consultas, medicoes: d.medicoes, evolucao, inbody, jornada: null, proximaFrase: "Sua próxima consulta é daqui a 11 dias.", hojeISO: HOJE });
  assert.deepEqual([...caps.map((x) => x.id)], ["abertura", "peso", "composicao", "score", "presenca", "proximo"]);
  assert.equal(caps[0].numero.valor, 15, "a mesma semana do topo de Hoje");
  assert.equal(caps[1].numero.valor, 6.2);
  assert.match(caps[2].texto, /0,7\u00a0kg a mais de massa magra no mesmo período/);
  assert.doesNotMatch(caps[2].texto, /força/);
  assert.equal(caps[3].numero.valor, 72);
  assert.match(caps[4].texto, /4 exames na clínica, 3 pesagens que você mandou e 1 consulta\./);
});

test("sem o que contar, não há história (quem acabou de entrar)", () => {
  const d = demo.dadosDemoNovo(HOJE);
  const caps = c.capitulosDaHistoria({ primeiroNome: "Helena", plano: d.plano, consultas: d.consultas, medicoes: d.medicoes, evolucao: null, inbody: null, jornada: null, proximaFrase: null, hojeISO: HOJE });
  assert.equal(caps.length, 0);
});

test("pesagem de casa digitada errado não vira capítulo '−20 kg' (o peso da história é o da clínica)", () => {
  const medicoes = [med("a", "2026-07-06", 92.4, { gorduraPct: 34 }), med("b", "2026-09-04", 90.0, { gorduraPct: 33 }), med("c", "2026-10-10", 72.4, { origem: "PACIENTE" })];
  const evolucao = p.resumoEvolucao(medicoes, HOJE, plano.inicio);
  const caps = c.capitulosDaHistoria({ primeiroNome: "A", plano, consultas: [], medicoes, evolucao, inbody: null, jornada: null, proximaFrase: null, hojeISO: HOJE });
  assert.equal(caps.find((x) => x.id === "peso").numero.valor, 2.4);
});

test("peso que subiu não vira capítulo de peso (só notícia que o dado sustenta)", () => {
  const medicoes = [med("a", "2026-07-06", 80, { gorduraPct: 30 }), med("b", "2026-10-04", 82, { gorduraPct: 29 })];
  const evolucao = p.resumoEvolucao(medicoes, HOJE, plano.inicio);
  const caps = c.capitulosDaHistoria({ primeiroNome: "A", plano, consultas: [], medicoes, evolucao, inbody: null, jornada: null, proximaFrase: null, hojeISO: HOJE });
  assert.ok(!caps.some((x) => x.id === "peso"));
});

test("variação de gordura dentro do erro do aparelho não vira capítulo", () => {
  const medicoes = [med("a", "2026-07-06", 90, { gorduraPct: 30, massaMagraKg: 55 }), med("b", "2026-10-04", 88, { gorduraPct: 29.8, massaMagraKg: 55 })];
  const evolucao = p.resumoEvolucao(medicoes, HOJE, plano.inicio);
  const caps = c.capitulosDaHistoria({ primeiroNome: "A", plano, consultas: [], medicoes, evolucao, inbody: null, jornada: null, proximaFrase: null, hojeISO: HOJE });
  assert.ok(!caps.some((x) => x.id === "composicao"));
});

test("data do topo e luz do dia", () => {
  assert.equal(c.dataDeHoje("2026-10-14"), "quarta · 14 de outubro");
  assert.equal(c.periodoDoDia(7), "manha");
  assert.equal(c.periodoDoDia(15), "tarde");
  assert.equal(c.periodoDoDia(23), "noite");
  assert.equal(c.periodoDoDia(3), "noite");
  assert.equal(c.diaMesAno("2025-07-06", HOJE), "6 de jul de 2025");
});

test("erro de digitação e balança de casa não viram medalha de quilos (só a clínica conta)", () => {
  const digitacao = porId(montar([med("a", "2026-07-06", 92.4), med("b", "2026-10-10", 72.4, { origem: "PACIENTE" }), med("c", "2026-10-11", 82.6, { origem: "PACIENTE" }), med("d", "2026-10-13", 91.0)]));
  assert.equal(digitacao["peso-10"], undefined);
  assert.equal(digitacao["peso-3"], undefined);
  const roupa = porId(montar([med("a", "2026-07-06", 90.0), med("b", "2026-07-07", 86.9, { origem: "PACIENTE" }), med("c", "2026-08-06", 89.6)]));
  assert.equal(roupa["peso-3"], undefined, "o exame seguinte mostrou só −0,4 kg");
});

test("visceral é conquista quando CHEGA à faixa ideal, não quando sempre esteve nela", () => {
  const sempre = porId(montar([med("a", "2026-07-06", 80, { gorduraPct: 25, gorduraVisceral: 6 }), med("b", "2026-10-04", 79, { gorduraPct: 24, gorduraVisceral: 5 })]));
  assert.equal(sempre.visceral, undefined);
});

test("exame é a mesma coisa na linha do tempo, na história e nas medalhas (medição da clínica)", () => {
  const medicoes = [med("a", "2026-07-06", 92.4), med("b", "2026-09-04", 91.0), med("c", "2026-10-01", 90.5, { origem: "PACIENTE" })];
  const eventos = p.linhaDoTempo({ plano, consultas: [], medicoes, marcos: [], hojeISO: HOJE });
  assert.equal(eventos.filter((e) => e.tipo === "BIO").length, 2);
  const lista = porId(montar(medicoes));
  assert.equal(lista.exame.ganha, true);
  const evolucao = p.resumoEvolucao(medicoes, HOJE, plano.inicio);
  const caps = c.capitulosDaHistoria({ primeiroNome: "A", plano, consultas: [], medicoes, evolucao, inbody: null, jornada: null, proximaFrase: null, hojeISO: HOJE });
  assert.match(caps.find((x) => x.id === "presenca").texto, /2 exames na clínica e 1 pesagem que você mandou/);
});
