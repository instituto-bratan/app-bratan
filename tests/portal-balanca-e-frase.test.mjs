// A FRASE DO DIA e O QUE A BALANÇA NÃO MOSTRA (21/09/2026) — passo 2 do portal.
//
// O que estes testes seguram: o card só fala quando há composição nas duas
// pontas (sem isso seria chute), cada variante diz a coisa certa — inclusive a
// desconfortável, com cuidado e mandando para a enfermagem — e a frase do topo
// escolhe a novidade certa na ordem certa.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/portal/portalPaciente.ts");

const HOJE = "2026-09-21";
const med = (dia, pesoKg, gorduraPct = null, massaMagraKg = null) => ({ id: dia, dia, pesoKg, gorduraPct, massaMagraKg, cinturaCm: null, origem: "ENFERMAGEM" });
const evolucao = (...medicoes) => mod.resumoEvolucao(medicoes, HOJE);

test("sem composição nas duas pontas, o card não existe — não se chuta", () => {
  assert.equal(mod.oQueABalancaNaoMostra(null), null);
  assert.equal(mod.oQueABalancaNaoMostra(evolucao(med("2026-06-01", 90))), null, "uma medição só");
  assert.equal(mod.oQueABalancaNaoMostra(evolucao(med("2026-06-01", 90), med("2026-09-01", 86))), null, "só peso, sem gordura nem massa magra");
});

test("MENTIU: a balança subiu, mas ganhou músculo — o caso dos 15 pacientes", () => {
  const r = mod.oQueABalancaNaoMostra(evolucao(med("2026-06-01", 80, 30, 54), med("2026-09-01", 82.8, 28, 57.7)));
  assert.equal(r.tipo, "MENTIU");
  assert.equal(r.titulo, "A balança não contou tudo");
  assert.match(r.destaque, /\+3,7 kg de músculo/);
  assert.match(r.frase, /balança subiu 2,8 kg/);
  assert.match(r.frase, /ganhou 3,7 kg de massa magra/);
  assert.match(r.frase, /perdeu 2 pontos de gordura/);
});

test("MENTIU também quando o peso ficou parado e a gordura caiu", () => {
  const r = mod.oQueABalancaNaoMostra(evolucao(med("2026-06-01", 80, 32, 54), med("2026-09-01", 79.9, 29.5, 54.2)));
  assert.equal(r.tipo, "MENTIU");
  assert.match(r.frase, /quase não mexeu/);
  assert.match(r.destaque, /−2,5 pontos de gordura/);
});

test("IDEAL: perdeu peso e não perdeu músculo — o que só 20% conseguem", () => {
  const r = mod.oQueABalancaNaoMostra(evolucao(med("2026-06-13", 92.4, 34.1, 55.2), med("2026-09-11", 86.2, 30.2, 55.9)));
  assert.equal(r.tipo, "IDEAL");
  assert.equal(r.titulo, "Só saiu gordura");
  assert.equal(r.destaque, "−6,2 kg");
  assert.match(r.frase, /massa magra subiu 0,7 kg/);
});

test("ESCONDEU: perdeu peso, mas parte era músculo — dito com cuidado e com a enfermagem", () => {
  const r = mod.oQueABalancaNaoMostra(evolucao(med("2026-06-01", 100, 35, 62), med("2026-09-01", 89, 31, 59)));
  assert.equal(r.tipo, "ESCONDEU");
  assert.match(r.frase, /Dos 11 kg que saíram/);
  assert.match(r.frase, /3 kg eram massa magra/);
  assert.match(r.frase, /cerca de 27%/, "3 de 11");
  assert.match(r.frase, /enfermagem/i);
  assert.match(r.frase, /não motivo para parar/i, "nunca desanima");
});

test("perda pequena de músculo não vira alarme", () => {
  const r = mod.oQueABalancaNaoMostra(evolucao(med("2026-06-01", 100, 35, 62), med("2026-09-01", 92, 31, 61.7)));
  assert.equal(r, null, "−0,3 kg é ruído de balança, não mensagem");
});

// ---- a frase do dia ----
const inbodyNovo = { ultima: { dia: "2026-09-18" }, frase: "Seu Score subiu 8 pontos desde 13 de jun, com 0,8 kg a mais de músculo.", manchete: "Novo exame: seu Score subiu 8 pontos desde 13 de jun." };
const inbodyVelho = { ultima: { dia: "2026-06-01" }, frase: "Score antigo.", manchete: "Manchete antiga." };
const evoNova = { ultima: { dia: "2026-09-19" }, pontos: [1, 2], frase: "Desde junho você perdeu 6 kg." };
const evoVelha = { ultima: { dia: "2026-07-01" }, pontos: [1, 2], frase: "Evolução antiga." };
const consultaAmanha = { dias: 1, quando: "amanhã", hora: "14h", profissional: "Dr. Daniel" };
const consultaLonge = { dias: 11, quando: "daqui a 11 dias", hora: "14h", profissional: "Dr. Daniel" };
const trilha = { frase: "Você está no mês 4 de 6." };

test("exame novo fala primeiro — e com a manchete, não com a frase do card", () => {
  // Visto na prévia: o topo repetia palavra por palavra o card logo abaixo.
  const topo = mod.fraseDoDia({ hojeISO: HOJE, inbody: inbodyNovo, evolucao: evoNova, proxima: consultaAmanha, trilha });
  assert.equal(topo, inbodyNovo.manchete);
  assert.notEqual(topo, inbodyNovo.frase, "o topo e o card não podem dizer a mesma coisa duas vezes");
});

test("a manchete do InBody é curta e não traz o aviso da visceral — isso fica no card", () => {
  const medIn = (dia, extra) => ({ id: dia, dia, pesoKg: 80, gorduraPct: 30, massaMagraKg: 56, cinturaCm: null, origem: "IMPORTACAO", ...extra });
  const r = mod.resumoInBody([medIn("2026-06-12", { inbodyScore: 64 }), medIn("2026-09-12", { inbodyScore: 72, gorduraVisceral: 12 })]);
  assert.equal(r.manchete, "Novo exame: seu Score subiu 8 pontos desde 12 de jun.");
  assert.doesNotMatch(r.manchete, /visceral/);
  assert.match(r.frase, /visceral/);
});

test("sem exame novo, a pesagem da semana fala", () => {
  assert.equal(mod.fraseDoDia({ hojeISO: HOJE, inbody: inbodyVelho, evolucao: evoNova, proxima: consultaAmanha, trilha }), evoNova.frase);
});

test("consulta em cima da hora ganha do passo do plano", () => {
  assert.equal(mod.fraseDoDia({ hojeISO: HOJE, inbody: inbodyVelho, evolucao: evoVelha, proxima: consultaAmanha, trilha }), "Sua consulta com Dr. Daniel é amanhã, às 14h.");
  assert.equal(mod.fraseDoDia({ hojeISO: HOJE, inbody: null, evolucao: null, proxima: { ...consultaAmanha, dias: 0 }, trilha }), "Sua consulta com Dr. Daniel é hoje, às 14h.");
});

test("sem novidade nenhuma, o plano é o pano de fundo", () => {
  assert.equal(mod.fraseDoDia({ hojeISO: HOJE, inbody: inbodyVelho, evolucao: evoVelha, proxima: consultaLonge, trilha }), trilha.frase);
});

test("sem plano, sobra a evolução; sem nada, a frase de casa", () => {
  assert.equal(mod.fraseDoDia({ hojeISO: HOJE, inbody: null, evolucao: evoVelha, proxima: null, trilha: null }), evoVelha.frase);
  assert.equal(mod.fraseDoDia({ hojeISO: HOJE, inbody: null, evolucao: null, proxima: null, trilha: null }), "Aqui está o seu espaço no Instituto.");
});
