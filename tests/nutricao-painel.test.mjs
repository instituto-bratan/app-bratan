// TELA "HOJE" DA NUTRIÇÃO (28/09/2026).
//
// O que ela precisa ver ao abrir o dia: atendimentos de hoje, planos a entregar
// no prazo de 72 horas úteis (e os atrasados), rascunhos, e entregas que ainda
// não terminaram. PDF gerado não é entrega: só sai da lista quando foi
// compartilhado; e "compartilhado" continua à vista até o recebimento.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const painel = loadTs("src/features/nutricao/dominio/painel.ts");

const HOJE = "2026-09-28";
const pessoa = (id, nome, extra = {}) => ({ id, nome, nomeDocumento: nome, faseAcompanhamento: null, ficticia: true, ...extra });
const at = (id, pessoaId, extra = {}) => ({ id, pessoaId, data: HOJE, tipo: "checkpoint", numeroCheckpoint: 1, estado: "rascunho", prazoPlano: null, finalizadoEm: null, ...extra });
const plano = (id, pessoaId, extra = {}) => ({ id, pessoaId, numero: 1, mesRef: "2026-09", estado: "rascunho", atendimentoId: null, entrega: [], atualizadoEm: "2026-09-27T10:00:00.000Z", ...extra });

const pessoas = [pessoa("p1", "Marina"), pessoa("p2", "Carlos"), pessoa("p3", "Bruno"), pessoa("p4", "Ana"), pessoa("p5", "Helena", { faseAcompanhamento: { mes: 5, total: 6 } })];

test("agenda de hoje traz a pessoa e o atendimento do dia, em ordem de hora", () => {
  const r = painel.montarPainel({
    hoje: HOJE,
    pessoas,
    atendimentos: [at("a1", "p1")],
    planos: [],
    agenda: [
      { id: "g2", data: HOJE, hora: "10:00", pessoaId: "p2", tipo: "primeira", versao: 1 },
      { id: "g1", data: HOJE, hora: "09:00", pessoaId: "p1", tipo: "checkpoint", versao: 1 },
    ],
    feriados: [],
  });
  assert.deepEqual(plain(r.agenda.map((a) => [a.hora, a.pessoa.nome, a.atendimento ? a.atendimento.id : null])), [
    ["09:00", "Marina", "a1"],
    ["10:00", "Carlos", null],
  ]);
});

test("plano a entregar: checkpoint finalizado com prazo e sem plano compartilhado", () => {
  const r = painel.montarPainel({
    hoje: HOJE,
    pessoas,
    atendimentos: [
      at("a2", "p2", { estado: "finalizado", data: "2026-09-25", prazoPlano: "2026-09-30" }),
      at("a3", "p3", { estado: "finalizado", data: "2026-09-18", prazoPlano: "2026-09-23" }),
      at("a1", "p1", { estado: "finalizado", data: "2026-09-25", prazoPlano: "2026-09-30" }),
    ],
    planos: [plano("x1", "p1", { atendimentoId: "a1", estado: "finalizado", entrega: [{ tipo: "compartilhado", em: "2026-09-26T10:00:00.000Z", canal: "WhatsApp" }] })],
    agenda: [],
    feriados: [],
  });
  // atrasado primeiro, depois pelo prazo
  assert.deepEqual(plain(r.aEntregar.map((e) => [e.pessoa.nome, e.situacao.estado])), [
    ["Bruno", "atrasado"],
    ["Carlos", "no_prazo"],
  ]);
  assert.equal(r.aEntregar[1].situacao.rotulo, "faltam 2 dias úteis");
});

test("plano com PDF gerado mas não compartilhado continua a entregar e aparece nas entregas", () => {
  const r = painel.montarPainel({
    hoje: HOJE,
    pessoas,
    atendimentos: [at("a2", "p2", { estado: "finalizado", data: "2026-09-25", prazoPlano: "2026-09-30" })],
    planos: [plano("x2", "p2", { atendimentoId: "a2", estado: "finalizado", entrega: [{ tipo: "pdf_gerado", em: "2026-09-26T10:00:00.000Z", canal: null }] })],
    agenda: [],
    feriados: [],
  });
  assert.equal(r.aEntregar.length, 1);
  assert.equal(r.aEntregar[0].plano.id, "x2");
  assert.deepEqual(plain(r.pdfNaoCompartilhado.map((p) => p.plano.id)), ["x2"]);
});

test("compartilhado sem confirmação de recebimento fica à vista", () => {
  const r = painel.montarPainel({
    hoje: HOJE,
    pessoas,
    atendimentos: [],
    planos: [
      plano("x3", "p3", { estado: "finalizado", entrega: [{ tipo: "pdf_gerado", em: "2026-09-20T10:00:00.000Z", canal: null }, { tipo: "compartilhado", em: "2026-09-20T11:00:00.000Z", canal: "WhatsApp" }] }),
      plano("x4", "p4", { estado: "finalizado", entrega: [{ tipo: "compartilhado", em: "2026-09-20T11:00:00.000Z", canal: "WhatsApp" }, { tipo: "recebimento_confirmado", em: "2026-09-21T11:00:00.000Z", canal: null }] }),
    ],
    agenda: [],
    feriados: [],
  });
  assert.deepEqual(plain(r.semConfirmacao.map((p) => p.plano.id)), ["x3"]);
});

test("rascunhos: checkpoints e planos, do mais recente para o mais antigo", () => {
  const r = painel.montarPainel({
    hoje: HOJE,
    pessoas,
    atendimentos: [at("a4", "p4", { data: "2026-09-25" }), at("a5", "p5", { data: "2026-09-27" }), at("a6", "p1", { estado: "finalizado" })],
    planos: [plano("x5", "p5"), plano("x6", "p1", { estado: "finalizado" })],
    agenda: [],
    feriados: [],
  });
  assert.deepEqual(plain(r.checkpointsEmRascunho.map((a) => a.atendimento.id)), ["a5", "a4"]);
  assert.deepEqual(plain(r.planosEmRascunho.map((p) => p.plano.id)), ["x5"]);
});

test("retornos a organizar: no acompanhamento, sem atendimento há mais de 30 dias e fora da agenda", () => {
  const r = painel.montarPainel({
    hoje: HOJE,
    pessoas: [pessoa("p5", "Helena", { faseAcompanhamento: { mes: 5, total: 6 } }), pessoa("p6", "Rui", { faseAcompanhamento: { mes: 2, total: 6 } }), pessoa("p7", "Sem fase")],
    atendimentos: [at("a7", "p5", { estado: "finalizado", data: "2026-08-20" }), at("a8", "p6", { estado: "finalizado", data: "2026-09-10" })],
    planos: [],
    agenda: [],
    feriados: [],
  });
  assert.deepEqual(plain(r.retornos.map((x) => [x.pessoa.nome, x.ultimoAtendimento])), [["Helena", "2026-08-20"]]);
});
