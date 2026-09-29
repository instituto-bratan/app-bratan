// CRM (29/09/2026, auditoria B8a e B8b).
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const crm = await loadTs("src/features/crm/crmData.ts");
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const emDias = (n) => iso(new Date(Date.now() + n * 86_400_000));

function base() {
  const fx = JSON.parse(JSON.stringify(crm.demoCrmFixtures));
  const contact = { ...fx.contacts[0], id: "c-1", fullName: "Paciente Teste", optOut: false };
  const deal = { ...(fx.deals[0] ?? {}), id: "deal-1", contactId: "c-1", stage: "CONSULTA_AGENDADA", status: "OPEN", programPhase: null, adhesionChannel: null };
  return { ...fx, contacts: [contact], deals: [deal], tasks: [], cadenceEnrollments: [], timelineEvents: [], touchpoints: [] };
}

function agendado(diasAteConsulta) {
  return crm.scheduleConsultation(base(), { contactId: "c-1", dealId: "deal-1", eventDate: emDias(diasAteConsulta), actorId: "recepcao" }).state;
}

const ativas = (state) => state.cadenceEnrollments.filter((e) => e.contactId === "c-1" && e.status === "ACTIVE").map((e) => e.cadenceId);
const tarefaDoPasso = (state, stepId) => state.tasks.find((t) => t.contactId === "c-1" && t.cadenceStepId === stepId && t.cadenceId === "cad-return-cycle");

test("B8a: consulta realizada com o ciclo de retorno ativo → o D+1 da concierge NASCE (e o ciclo sai)", () => {
  const antes = agendado(2);
  assert.deepEqual(plain(ativas(antes)), ["cad-return-cycle"]);
  const r = crm.moveDealStage(antes, "deal-1", { stage: "CONSULTA_REALIZADA", actorId: "recepcao" });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(ativas(r.state)), ["cad-pos-consulta-d1"]);
  assert.equal(r.message, "Kanban atualizado e tarefas ligadas aos setores criadas.");
  const ciclo = r.state.cadenceEnrollments.find((e) => e.cadenceId === "cad-return-cycle");
  assert.equal(ciclo.status, "CANCELED");
});

// Consulta daqui a ~35 dias: o ciclo inteiro (−21, −7, −3, −1) ainda está à frente.
// O relógio do motor anda pelo `reference` de cada passo (janela de 7 dias).
const CONSULTA = emDias(35);
const diaDoPasso = (offset) => {
  const [a, m, d] = CONSULTA.split("-").map(Number);
  return new Date(a, m - 1, d + offset, 9, 0, 0);
};
const PASSOS = [["step-exams-21", -21], ["step-exams-7", -7], ["step-confirm-3", -3], ["step-reminder-1", -1]];
const agendadoLonge = () => crm.scheduleConsultation(base(), { contactId: "c-1", dealId: "deal-1", eventDate: CONSULTA, actorId: "recepcao" }).state;

test("B8b: paciente confirma no −3 → a régua NÃO pausa e o lembrete do −1 continua; ao fim, não escala", () => {
  let state = agendadoLonge();
  for (const [stepId, offset] of PASSOS) {
    state = crm.generateCadenceTasks(state, diaDoPasso(offset));
    const t = tarefaDoPasso(state, stepId);
    assert.ok(t, `a tarefa ${stepId} nasce`);
    assert.equal(t.status, "PENDING", `${stepId} não foi pulada`);
    const confirmou = stepId === "step-confirm-3";
    state = crm.completeCrmTask(state, t.id, { result: confirmou ? "RESPONDED" : "SENT", resultNotes: confirmou ? "confirmou" : "", actorId: "aline" });
    const ciclo = state.cadenceEnrollments.find((e) => e.cadenceId === "cad-return-cycle" && e.contactId === "c-1");
    assert.equal(ciclo.status, "ACTIVE", `depois do ${stepId} o ciclo segue ativo (confirmação não pausa)`);
  }
  state = crm.escalateExhaustedCadences(state, diaDoPasso(-1));
  assert.ok(!ativas(state).includes("cad-gestor-5lig"), "quem confirmou não é escalado ao gestor na véspera");
  assert.equal(state.cadenceEnrollments.find((e) => e.cadenceId === "cad-return-cycle").status, "COMPLETED");
});

test("B8b: ciclo de retorno inteiro SEM resposta continua escalando ao gestor (regra antiga preservada)", () => {
  let state = agendadoLonge();
  for (const [stepId, offset] of PASSOS) {
    state = crm.generateCadenceTasks(state, diaDoPasso(offset));
    const t = tarefaDoPasso(state, stepId);
    assert.ok(t, stepId);
    state = crm.completeCrmTask(state, t.id, { result: "NO_RESPONSE", actorId: "aline" });
  }
  state = crm.escalateExhaustedCadences(state, diaDoPasso(-1));
  assert.ok(ativas(state).includes("cad-gestor-5lig"));
});

test("os passos do ciclo de retorno não pausam com resposta; as outras réguas seguem pausando", () => {
  const passos = crm.demoCrmFixtures.cadenceSteps ?? crm.seedCrmState?.cadenceSteps;
  assert.ok(passos?.length);
  assert.ok(passos.filter((p) => p.cadenceId === "cad-return-cycle").every((p) => p.pauseIfContactResponded === false));
  assert.ok(passos.filter((p) => p.cadenceId === "cad-not-closed").every((p) => p.pauseIfContactResponded === true));
});

test("B8c: inscrever diz a verdade — com outra régua ativa NÃO nasce e explica o porquê", () => {
  const comCiclo = agendado(10);
  const valores = { cadenceId: "cad-rescue-60d", contactId: "c-1", dealId: "", triggerSource: "radar de resgate", triggerDate: emDias(0), ownerUserId: "concierge", ownerRole: "CONCIERGE" };
  const bloqueada = crm.inscreverNaCadencia(comCiclo, valores);
  assert.equal(bloqueada.nasceu, false);
  assert.match(bloqueada.motivo, /1 régua por paciente/);
  assert.equal(bloqueada.state, comCiclo, "nada muda quando não nasce");
  const livre = crm.inscreverNaCadencia(base(), valores);
  assert.equal(livre.nasceu, true);
  assert.equal(crm.inscreverNaCadencia(livre.state, valores).motivo, "já está nesta régua");
});

test("B8c/B8d: as telas conferem antes de anunciar e o check-in tem porta", async () => {
  const fs = await import("node:fs");
  const cad = fs.readFileSync("src/features/crm/CrmCadencesPage.tsx", "utf8");
  assert.match(cad, /const previa = inscreverNaCadencia\(state, valores\);\s*if \(!previa\.nasceu\)/);
  const kanban = fs.readFileSync("src/features/crm/CrmKanbanPage.tsx", "utf8");
  assert.match(kanban, /iniciarRepescagemComResultado\(state, candidato[\s\S]{0,200}if \(!previa\.nasceu\)/);
  const app = fs.readFileSync("src/App.tsx", "utf8");
  assert.match(app, /path="\/crm\/checkin"[\s\S]{0,200}<AccessGate allowed=\{canCrmBratan\}[^>]*module="crm"/);
});
