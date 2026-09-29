// AS QUATRO ABAS E A LINHA DO TEMPO DO PORTAL (22/09/2026).
//
// O que se protege: a aba vem da rota (e rota estranha cai em Hoje); o anel
// conta mês, semana e fração do mês sem passar de 1; a linha do tempo junta
// começo, bioimpedâncias, consultas, hoje e previstos NA ORDEM, sem contar o
// mesmo passo duas vezes.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/portal/portalPaciente.ts");
const hoje = "2026-09-22";

test("a aba mora na rota; rota desconhecida cai em Hoje", () => {
  assert.equal(mod.abaDaRota("/meu"), "hoje");
  assert.equal(mod.abaDaRota("/meu/corpo"), "corpo");
  assert.equal(mod.abaDaRota("/meu/jornada/"), "jornada");
  assert.equal(mod.abaDaRota("/meu/voce"), "voce");
  assert.equal(mod.abaDaRota("/meu/qualquer-coisa"), "hoje");
  assert.equal(mod.rotaDaAba("corpo"), "/meu/corpo");
});

const marco = (key, type, n, expectedDate, done, overdue = false) => ({ key, type, n, total: 6, label: type === "MEDICO" ? `${n}ª consulta` : `${n}ª bioimpedância`, expectedDate, done, overdue });
const marcos = [
  marco("BIO-1", "BIO", 1, "2026-06-14", true),
  marco("MEDICO-1", "MEDICO", 1, "2026-08-13", true),
  marco("BIO-2", "BIO", 2, "2026-07-14", true),
  marco("BIO-3", "BIO", 3, "2026-08-13", true),
  marco("BIO-4", "BIO", 4, "2026-09-12", true),
  marco("BIO-5", "BIO", 5, "2026-10-12", false),
  marco("MEDICO-2", "MEDICO", 2, "2026-10-13", false),
  marco("BIO-6", "BIO", 6, "2026-11-14", false),
  marco("MEDICO-3", "MEDICO", 3, "2026-12-14", false),
];

test("o anel: mês, semana, fração do mês e o próximo passo em uma frase", () => {
  const trilha = mod.trilhaDoPlano(marcos, "2026-06-14", hoje);
  const r = mod.resumoDaJornada(trilha, marcos, "2026-06-14", hoje);
  assert.equal(r.dias, 100);
  assert.equal(r.semana, 15);
  assert.equal(r.mesAtual, 4);
  assert.equal(r.meses, 6);
  // Mês de calendário desde 29/09/2026: o 4º mês começou em 14/09, e 22/09 é o 8º dia de 30.
  assert.ok(r.fracaoDoMes > 0.25 && r.fracaoDoMes < 0.3, `8 dias dentro do 4º mês (14/09 a 14/10) → ${r.fracaoDoMes}`);
  assert.equal(r.preenchimentos.length, 6);
  assert.equal(r.feitos, 5);
  assert.equal(r.total, 9);
  assert.equal(r.concluida, false);
  assert.equal(r.titulo, "Semana 15 do seu plano");
  assert.equal(r.passos, "5 de 9 passos concluídos");
  assert.equal(r.proximo, "Próximo passo: 5ª bioimpedância, com enfermagem, em 12 de out.");
  assert.equal(r.segmentos.length, 6);
  assert.equal(r.segmentos[3], "agora");
});

test("plano completo: o anel fecha e a frase muda", () => {
  const todos = marcos.map((m) => ({ ...m, done: true }));
  const depois = "2027-01-20"; // 220 dias: passou dos seis meses
  const trilha = mod.trilhaDoPlano(todos, "2026-06-14", depois);
  const r = mod.resumoDaJornada(trilha, todos, "2026-06-14", depois);
  assert.equal(r.concluida, true);
  assert.equal(r.fracaoDoMes, 1, "passado o último mês, o segmento de agora fica cheio");
  assert.equal(r.titulo, "Você completou a caminhada");
});

test("passo atrasado: a frase explica que a recepção combina a data", () => {
  const atrasados = marcos.map((m) => (m.key === "BIO-5" ? { ...m, expectedDate: "2026-09-10", overdue: true } : m));
  const trilha = mod.trilhaDoPlano(atrasados, "2026-06-14", hoje);
  const r = mod.resumoDaJornada(trilha, atrasados, "2026-06-14", hoje);
  assert.match(r.proximo, /Estava previsto para 10 de set/);
});

const plano = { dealId: "d", canal: "PROGRAMA", inicio: "2026-06-14", fase: null, marcosFeitos: [], valorContratado: 0, valorRecebido: 0, closedAt: null, programPhaseEnteredAt: null, createdAt: "", updatedAt: "" };
const medicoes = [
  { id: "m1", dia: "2026-06-14", pesoKg: 92.4, gorduraPct: 34.1, massaMagraKg: 55.2, cinturaCm: 98, inbodyScore: 64, origem: "ENFERMAGEM" },
  { id: "m2", dia: "2026-06-28", pesoKg: 91.6, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" },
  { id: "m3", dia: "2026-07-14", pesoKg: 90.1, gorduraPct: 33.0, massaMagraKg: 55.4, cinturaCm: 96, inbodyScore: 66, origem: "ENFERMAGEM" },
  { id: "m5", dia: "2026-08-13", pesoKg: 88.0, gorduraPct: 31.5, massaMagraKg: 55.6, cinturaCm: 94, origem: "IMPORTACAO" },
  { id: "m7", dia: "2026-09-12", pesoKg: 86.2, gorduraPct: 30.2, massaMagraKg: 55.9, cinturaCm: 92, inbodyScore: 72, origem: "ENFERMAGEM" },
];
const consultas = [
  { id: "c0", em: "2026-06-13T10:00:00-03:00", profissional: "Dr. Daniel", tipo: "primeira consulta", local: "Itaim", status: "REALIZADA", origem: "MANUAL" },
  { id: "c1", em: "2026-08-13T14:00:00-03:00", profissional: "Dr. Daniel", tipo: "1ª consulta de acompanhamento", local: "Itaim", status: "REALIZADA", origem: "MANUAL" },
  { id: "c2", em: "2026-10-03T14:00:00-03:00", profissional: "Dr. Daniel", tipo: "2ª consulta de acompanhamento", local: "Itaim", status: "AGENDADA", origem: "MANUAL" },
  { id: "c9", em: "2026-05-01T14:00:00-03:00", profissional: "Dr. Daniel", tipo: "consulta antiga", local: "Itaim", status: "CANCELADA", origem: "MANUAL" },
];

test("a linha do tempo junta tudo na ordem e sem contar o mesmo passo duas vezes", () => {
  const e = mod.linhaDoTempo({ plano, consultas, medicoes, marcos, hojeISO: hoje });
  const resumo = e.map((x) => `${x.dia}|${x.tipo}|${x.estado}`);
  assert.equal(JSON.stringify(resumo), JSON.stringify([
    "2026-06-14|INICIO|feito",
    "2026-06-14|BIO|feito",
    "2026-07-14|BIO|feito",
    "2026-08-13|BIO|feito",
    "2026-08-13|CONSULTA|feito",
    "2026-09-12|BIO|feito",
    "2026-09-22|HOJE|hoje",
    "2026-10-03|CONSULTA|futuro",
    "2026-10-12|PREVISTO|futuro",
    "2026-11-14|PREVISTO|futuro",
    "2026-12-14|PREVISTO|futuro",
  ]));
  assert.equal(e[1].titulo, "Primeira bioimpedância");
  assert.equal(e[1].detalhe, "92,4 kg · 34,1% de gordura · InBody 64");
  assert.equal(e[3].detalhe, "88,0 kg · 31,5% de gordura", "sem score, sem inventar");
  assert.equal(e[7].quando, "marcada · 3 de out");
  assert.equal(e[8].quando, "previsto · 12 de out");
  assert.ok(!e.some((x) => x.titulo === "Consulta antiga"), "consulta cancelada e anterior ao plano fica fora");
  assert.ok(!e.some((x) => x.titulo === "2ª consulta" && x.tipo === "PREVISTO"), "a consulta prevista some quando já existe uma marcada perto da data");
  assert.ok(!e.some((x) => x.id === "marco-BIO-4"), "bio feita com medição perto da data não entra duas vezes");
});

test("passo previsto que já passou aparece como atrasado, no dia de hoje", () => {
  const atrasados = marcos.map((m) => (m.key === "BIO-5" ? { ...m, expectedDate: "2026-09-10", overdue: true } : m));
  const e = mod.linhaDoTempo({ plano, consultas, medicoes, marcos: atrasados, hojeISO: hoje });
  const atrasado = e.find((x) => x.estado === "atrasado");
  assert.ok(atrasado);
  assert.equal(atrasado.quando, "estava previsto · 10 de set");
  const idxHoje = e.findIndex((x) => x.tipo === "HOJE");
  assert.equal(e.indexOf(atrasado), idxHoje - 1, "o atrasado fica colado antes de hoje");
});

test("sem plano: só consultas e medições, e o marcador de hoje", () => {
  const e = mod.linhaDoTempo({ plano: null, consultas, medicoes, marcos: [], hojeISO: hoje });
  assert.equal(e[0].tipo, "CONSULTA", "a consulta de 13/06 entra: sem plano não há corte de data");
  assert.equal(e.find((x) => x.tipo === "BIO").titulo, "Bioimpedância", "sem plano não existe 'primeira' do plano");
  assert.ok(e.some((x) => x.tipo === "HOJE"));
  assert.ok(!e.some((x) => x.tipo === "INICIO"));
});

test("o ponto na aba só existe com ação pendente de verdade", () => {
  assert.equal(JSON.stringify(mod.pendenciasDasAbas(null)), "{}");
  assert.equal(JSON.stringify(mod.pendenciasDasAbas({ podeResponder: false })), "{}");
  assert.equal(JSON.stringify(mod.pendenciasDasAbas({ podeResponder: true })), '{"hoje":1}');
});

test("paciente desde: plano, senão a primeira comanda ou medição", () => {
  assert.equal(mod.pacienteDesde({ plano, comandas: [], medicoes: [] }), "2026-06-14");
  assert.equal(mod.pacienteDesde({ plano: null, comandas: [{ dia: "2026-07-01" }], medicoes: [{ dia: "2026-06-20" }] }), "2026-06-20");
  assert.equal(mod.pacienteDesde({ plano: null, comandas: [], medicoes: [] }), null);
});

test("resumo de sexta: pesagem da semana, a diferença e o próximo passo (29/09/2026)", () => {
  const medicoes = [
    { id: "1", dia: "2026-09-19", pesoKg: 83.0, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" },
    { id: "2", dia: "2026-10-01", pesoKg: 82.4, gorduraPct: null, massaMagraKg: null, cinturaCm: null, origem: "PACIENTE" },
  ];
  const sexta = mod.resumoDaSemana({ hojeISO: "2026-10-02", medicoes, proxima: null, trilha: { frase: "Próximo passo: 4ª bioimpedância." } });
  assert.equal(sexta.mostrar, true);
  assert.equal(sexta.pesouNaSemana, true);
  assert.equal(sexta.variacaoKg, -0.6);
  assert.match(sexta.frasePeso, /82,4 kg, 0,6 kg a menos/);
  assert.match(sexta.fraseProximo, /4ª bioimpedância/);
  const quarta = mod.resumoDaSemana({ hojeISO: "2026-09-30", medicoes, proxima: null, trilha: null });
  assert.equal(quarta.mostrar, false, "no meio da semana o cartão não aparece");
  const semPesagem = mod.resumoDaSemana({ hojeISO: "2026-10-10", medicoes, proxima: null, trilha: null });
  assert.equal(semPesagem.pesouNaSemana, false);
  assert.match(semPesagem.frasePeso, /ainda não chegou/);
});

test("o arquivo de calendário da consulta tem hora, local e o lembrete da véspera", () => {
  const ics = mod.icsDaConsulta({ id: "ag-1", em: "2026-10-06T17:00:00.000Z", comHora: true, profissional: "Dr. Daniel", tipo: "Consulta de acompanhamento", local: "Instituto Bratan" }, "2026-09-29T12:00:00.000Z");
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261006T170000Z/);
  assert.match(ics, /DTEND:20261006T180000Z/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.match(ics, /LOCATION:Instituto Bratan/);
  const semHora = mod.icsDaConsulta({ id: null, em: "2026-10-06T15:00:00.000Z", comHora: false, profissional: "Dr. Daniel", tipo: "Consulta", local: "" }, "2026-09-29T12:00:00.000Z");
  assert.match(semHora, /DTSTART;VALUE=DATE:20261006/);
});
