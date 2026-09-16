import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/programa/pesagensSemana.ts");

// 16/09/2026 é uma quarta-feira; a semana começou na segunda, 14/09.
const hoje = "2026-09-16";

const pacientes = [
  { contactId: "c-ana", nome: "Ana", desde: "2026-06-01" },
  { contactId: "c-bruno", nome: "Bruno", desde: "2026-07-01" },
  { contactId: "c-caio", nome: "Caio", desde: "2026-09-10" },
];

test("a semana da clínica começa na segunda", () => {
  assert.equal(mod.inicioDaSemana("2026-09-16"), "2026-09-14", "quarta → segunda da mesma semana");
  assert.equal(mod.inicioDaSemana("2026-09-14"), "2026-09-14", "a própria segunda");
  assert.equal(mod.inicioDaSemana("2026-09-13"), "2026-09-07", "domingo fecha a semana anterior");
});

test("quem mandou na semana, quem está atrasado e quem nunca pesou", () => {
  const r = mod.pesagensDaSemana({
    pacientes,
    hoje,
    medicoes: [
      { contactRef: "c-ana", dia: "2026-09-15", pesoKg: 86.2, origem: "PACIENTE" },
      { contactRef: "c-ana", dia: "2026-09-08", pesoKg: 87.4, origem: "PACIENTE" },
      { contactRef: "c-bruno", dia: "2026-09-02", pesoKg: 101, origem: "ENFERMAGEM" },
    ],
  });
  assert.equal(r.inicioDaSemana, "2026-09-14");
  assert.equal(r.mandaram.map((p) => p.nome).join(", "), "Ana");
  assert.equal(r.faltando.map((p) => p.nome).join(", "), "Bruno", "pesou, mas não nesta semana");
  assert.equal(r.semNenhuma.map((p) => p.nome).join(", "), "Caio", "entrou no plano e nunca pesou");
  assert.equal(r.frase, "1 de 3 paciente mandou a pesagem desta semana. Falta cobrar 2.");
});

test("a variação vem com frase e data, nunca número solto", () => {
  const r = mod.pesagensDaSemana({
    pacientes: [pacientes[0]],
    hoje,
    medicoes: [
      { contactRef: "c-ana", dia: "2026-09-15", pesoKg: 86.2, origem: "PACIENTE" },
      { contactRef: "c-ana", dia: "2026-09-08", pesoKg: 87.4, origem: "PACIENTE" },
    ],
  });
  const ana = r.mandaram[0];
  assert.equal(ana.variacaoKg, -1.2);
  assert.equal(ana.frase, "86,2 kg · −1,2 kg desde 08/09");
  assert.equal(ana.ultimaOrigem, "PACIENTE", "a tela mostra se foi o paciente ou a enfermagem");
});

test("primeira pesagem não inventa comparação; quem está sem pesar leva os dias na frase", () => {
  const r = mod.pesagensDaSemana({
    pacientes: [pacientes[0], pacientes[1]],
    hoje,
    medicoes: [
      { contactRef: "c-ana", dia: "2026-09-16", pesoKg: 90, origem: "PACIENTE" },
      { contactRef: "c-bruno", dia: "2026-09-02", pesoKg: 101, origem: "ENFERMAGEM" },
    ],
  });
  assert.equal(r.mandaram[0].frase, "90,0 kg · primeira pesagem");
  assert.match(r.faltando[0].frase, /14 dias sem pesar$/);
});

test("pesagem sem peso (só cintura, por exemplo) não conta como pesagem", () => {
  const r = mod.pesagensDaSemana({
    pacientes: [pacientes[0]],
    hoje,
    medicoes: [{ contactRef: "c-ana", dia: "2026-09-15", pesoKg: null, origem: "ENFERMAGEM" }],
  });
  assert.equal(r.mandaram.length, 0);
  assert.equal(r.semNenhuma.length, 1);
});

test("a última pesagem de cada um sai pronta para o semáforo de adesão", () => {
  const r = mod.pesagensDaSemana({
    pacientes,
    hoje,
    medicoes: [
      { contactRef: "c-ana", dia: "2026-09-15", pesoKg: 86.2, origem: "PACIENTE" },
      { contactRef: "c-ana", dia: "2026-09-08", pesoKg: 87.4, origem: "PACIENTE" },
      { contactRef: "c-bruno", dia: "2026-09-02", pesoKg: 101, origem: "ENFERMAGEM" },
    ],
  });
  assert.equal(r.ultimaPorContato.get("c-ana"), "2026-09-15", "a mais recente, não a primeira da lista");
  assert.equal(r.ultimaPorContato.get("c-bruno"), "2026-09-02");
  assert.equal(r.ultimaPorContato.has("c-caio"), false, "quem nunca pesou não entra: o motor de risco pula a regra");
});

test("lista para cobrar sai pronta para copiar, e some quando todo mundo pesou", () => {
  const r = mod.pesagensDaSemana({ pacientes, hoje, medicoes: [{ contactRef: "c-bruno", dia: "2026-09-02", pesoKg: 101, origem: "ENFERMAGEM" }] });
  const texto = mod.listaParaCobrar(r);
  assert.match(texto, /^Pesagem da semana — quem falta \(3\):/);
  assert.match(texto, /• Bruno —/);
  const todos = mod.pesagensDaSemana({
    pacientes: [pacientes[0]],
    hoje,
    medicoes: [{ contactRef: "c-ana", dia: "2026-09-15", pesoKg: 86.2, origem: "PACIENTE" }],
  });
  assert.equal(mod.listaParaCobrar(todos), "Todo mundo mandou a pesagem desta semana.");
});
