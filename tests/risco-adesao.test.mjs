import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("src/features/crm/riscoAdesao.ts");
const deal = { id: "d1", contactId: "c1", programPhase: "CADENCIA_PROGRAMA", programPhaseEnteredAt: "2026-07-01T12:00:00Z", closedAt: null, createdAt: "2026-07-01T12:00:00Z", programMilestonesDone: [] };

test("abandono: paciente em dia fica verde", () => {
  const r = mod.riscoDeAbandono({ deal, tasks: [{ contactId: "c1", dealId: "d1", status: "DONE", result: "RESPONDED", dueAt: "2026-09-10T13:00:00Z", completedAt: "2026-09-10T13:30:00Z", taskType: "WHATSAPP" }], visitas: ["2026-09-01"], proximoRetorno: "2026-09-25", hoje: "2026-09-15" });
  assert.equal(r.nivel, "VERDE");
  assert.equal(r.pontos, 0);
});

test("abandono: sem resposta + sem retorno + 50 dias sem vir = vermelho, com os motivos escritos", () => {
  const r = mod.riscoDeAbandono({
    deal,
    tasks: [
      { contactId: "c1", dealId: "d1", status: "DONE", result: "NO_RESPONSE", dueAt: "2026-09-10T13:00:00Z", completedAt: "2026-09-10T13:30:00Z", taskType: "WHATSAPP" },
      { contactId: "c1", dealId: "d1", status: "DONE", result: "NO_RESPONSE", dueAt: "2026-08-27T13:00:00Z", completedAt: "2026-08-27T13:30:00Z", taskType: "WHATSAPP" },
      { contactId: "c1", dealId: "d1", status: "OPEN", result: null, dueAt: "2026-09-05T13:00:00Z", completedAt: null, taskType: "CALL" },
    ],
    visitas: ["2026-07-27"],
    proximoRetorno: null,
    hoje: "2026-09-15",
  });
  assert.equal(r.nivel, "VERMELHO");
  assert.ok(r.pontos >= 6, `pontos ${r.pontos}`);
  assert.match(r.frase, /não respondeu ao último toque/);
  assert.match(r.frase, /sem retorno agendado/);
  assert.match(r.frase, /50 dias desde a última visita/);
});

test("abandono: só 32 dias sem vir e retorno marcado = amarelo (1 ponto) ou verde? 1 ponto = verde; com toque atrasado vira amarelo", () => {
  const base = { deal, tasks: [], visitas: ["2026-08-14"], proximoRetorno: "2026-09-30", hoje: "2026-09-15" };
  assert.equal(mod.riscoDeAbandono(base).nivel, "VERDE");
  const comAtraso = { ...base, tasks: [{ contactId: "c1", dealId: "d1", status: "OPEN", result: null, dueAt: "2026-09-05T13:00:00Z", completedAt: null, taskType: "WHATSAPP" }] };
  assert.equal(mod.riscoDeAbandono(comAtraso).nivel, "AMARELO");
});

test("falta: primeira consulta marcada há 20 dias e não confirmada a 24 h = vermelho; confirmada e recorrente = verde", () => {
  const alto = mod.riscoDeFalta({ consultaEm: "2026-09-16T14:00:00-03:00", marcadaEm: "2026-08-25", primeiraConsulta: true, confirmou: false, faltasAnteriores: 0, agora: "2026-09-15T14:00:00-03:00" });
  assert.equal(alto.nivel, "VERMELHO");
  assert.match(alto.frase, /não confirmou nas últimas 48 h/);
  const baixo = mod.riscoDeFalta({ consultaEm: "2026-09-16T14:00:00-03:00", marcadaEm: "2026-09-10", primeiraConsulta: false, confirmou: true, faltasAnteriores: 0, agora: "2026-09-15T14:00:00-03:00" });
  assert.equal(baixo.nivel, "VERDE");
  const ordem = mod.ordenarPorRisco([{ n: "b", risco: baixo }, { n: "a", risco: alto }]);
  assert.equal(ordem[0].n, "a");
});
