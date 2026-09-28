// REVISÃO ANTES DE FINALIZAR O PLANO (28/09/2026).
//
// Critérios de aceite da proposta: o PDF sai com título, nome e identificação
// corretos; nada interno aparece; nada vazio. A revisão confere sozinha e só
// bloqueia o que impede um documento correto (sem nome, sem nenhuma refeição
// com alimento, identificação incompleta). O resto é aviso para ela decidir.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const revisao = loadTs("src/features/nutricao/dominio/revisao.ts");
const plano = loadTs("src/features/nutricao/dominio/plano.ts");
const { IDENTIFICACAO_PADRAO } = loadTs("src/features/nutricao/dominio/biblioteca.ts");

let n = 0;
const novoId = () => `id-${++n}`;
function planoBase() {
  const p = plano.novoPlano({ pessoa: { id: "p1", nome: "Marina Teixeira", nomeDocumento: "Marina Teixeira" }, mesRef: "2026-09", numero: 1, atendimentoId: null, novoId, agora: "2026-09-28T12:00:00.000Z", blocos: [] });
  p.refeicoes[0].itens = [plano.novoItem(novoId, { descricao: "Pão francês", quantidade: "1 unidade", gramas: 50, alimentoId: "taco-53" })];
  return p;
}
const calculoLimpo = { avisos: [] };
const paginacaoLimpa = { paginas: 2, avisos: [], sobraMaxima: 0.1, densidade: "normal" };

test("plano correto: nada bloqueia, título e nome conferidos", () => {
  const r = plain(revisao.revisarPlano(planoBase(), IDENTIFICACAO_PADRAO, calculoLimpo, paginacaoLimpa));
  assert.equal(r.podeFinalizar, true);
  assert.ok(r.itens.find((i) => i.id === "titulo").ok);
  assert.equal(r.itens.find((i) => i.id === "titulo").texto, "Título: Plano alimentar — setembro de 2026");
  assert.ok(r.itens.find((i) => i.id === "nome").ok);
  assert.ok(r.itens.find((i) => i.id === "identificacao").ok);
});

test("nome com 'paciente' na frente é corrigido e avisado; nome vazio bloqueia", () => {
  const p = planoBase();
  p.nomeDocumento = "Paciente Marina Teixeira";
  const r = plain(revisao.revisarPlano(p, IDENTIFICACAO_PADRAO, calculoLimpo, paginacaoLimpa));
  const nome = r.itens.find((i) => i.id === "nome");
  assert.equal(nome.ok, false);
  assert.equal(nome.bloqueia, false);
  assert.match(nome.texto, /sem a palavra "paciente"/);
  p.nomeDocumento = "  ";
  assert.equal(revisao.revisarPlano(p, IDENTIFICACAO_PADRAO, calculoLimpo, paginacaoLimpa).podeFinalizar, false);
});

test("sem nenhuma refeição com alimento, não finaliza", () => {
  const p = planoBase();
  p.refeicoes.forEach((r) => (r.itens = []));
  const r = plain(revisao.revisarPlano(p, IDENTIFICACAO_PADRAO, calculoLimpo, paginacaoLimpa));
  assert.equal(r.podeFinalizar, false);
  assert.equal(r.itens.find((i) => i.id === "refeicoes").bloqueia, true);
});

test("refeição vazia é avisada: não sai no documento", () => {
  const r = plain(revisao.revisarPlano(planoBase(), IDENTIFICACAO_PADRAO, calculoLimpo, paginacaoLimpa));
  const vazias = r.itens.find((i) => i.id === "refeicoes-vazias");
  assert.equal(vazias.ok, false);
  assert.match(vazias.texto, /Lanche da manhã, Almoço, Lanche da tarde, Jantar/);
});

test("identificação incompleta bloqueia", () => {
  const r = revisao.revisarPlano(planoBase(), { linhas: ["Dra. Géssica Barbara", "", "CRN3 63653"], versao: 2 }, calculoLimpo, paginacaoLimpa);
  assert.equal(r.podeFinalizar, false);
});

test("alimento sem medida caseira é avisado, não bloqueia", () => {
  const p = planoBase();
  p.refeicoes[0].itens.push(plano.novoItem(novoId, { descricao: "Café", quantidade: "" }));
  const r = plain(revisao.revisarPlano(p, IDENTIFICACAO_PADRAO, calculoLimpo, paginacaoLimpa));
  const semMedida = r.itens.find((i) => i.id === "sem-medida");
  assert.equal(semMedida.ok, false);
  assert.match(semMedida.texto, /Café da manhã · Café/);
  assert.equal(r.podeFinalizar, true);
});

test("avisos do cálculo e da paginação aparecem na revisão", () => {
  const r = plain(
    revisao.revisarPlano(planoBase(), IDENTIFICACAO_PADRAO, { avisos: [{ tipo: "sem_gramas", descricao: "Café: sem gramas, fora do cálculo." }] }, { paginas: 3, avisos: [{ blocoId: "ref-x", tipo: "maior_que_pagina" }], sobraMaxima: 0.5, densidade: "normal" }),
  );
  assert.equal(r.itens.find((i) => i.id === "calculo").ok, false);
  assert.equal(r.itens.find((i) => i.id === "paginas").ok, false);
  assert.match(r.itens.find((i) => i.id === "paginas").texto, /3 páginas/);
});
