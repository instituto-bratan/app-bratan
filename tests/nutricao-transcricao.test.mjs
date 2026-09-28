// TRANSCRIÇÃO EM MAIS DE UM TRECHO (28/09/2026).
//
// Achado da revisão: continuar gravando depois de encerrar colava dois
// arquivos de áudio num só, e o fim da consulta sumia da transcrição. Agora
// cada trecho é uma gravação própria; a transcrição nova entra DEPOIS da que já
// existe, com minutos contados do começo e índices que não reaproveitam os
// antigos, para as falas de origem já aceitas continuarem apontando certo.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const t = loadTs("src/features/nutricao/dominio/transcricao.ts");

const primeira = { geradaEm: "2026-09-28T12:00:00.000Z", motor: "whisper", duracaoSeg: 600, segmentos: [{ i: 0, inicio: 0, fim: 5, texto: "a" }, { i: 1, inicio: 5, fim: 9, texto: "b" }] };
const nova = { geradaEm: "2026-09-28T12:30:00.000Z", motor: "whisper", duracaoSeg: 120, segmentos: [{ i: 0, inicio: 1, fim: 4, texto: "c" }, { i: 1, inicio: 4, fim: 8, texto: "d" }] };

test("sem transcrição anterior, a nova entra como está", () => {
  assert.deepEqual(plain(t.juntarTranscricoes(null, nova)), plain(nova));
});

test("trecho novo entra depois, com minutos e índices continuando", () => {
  const junta = plain(t.juntarTranscricoes(primeira, nova));
  assert.deepEqual(junta.segmentos.map((s) => [s.i, s.inicio, s.fim, s.texto]), [
    [0, 0, 5, "a"],
    [1, 5, 9, "b"],
    [2, 601, 604, "c"],
    [3, 604, 608, "d"],
  ]);
  assert.equal(junta.duracaoSeg, 720);
  assert.equal(junta.geradaEm, nova.geradaEm);
});

// Achado da segunda revisão: se a transcrição do segundo trecho falhava (estação
// desligada) ou a página recarregava no meio dele, o botão "Transcrever" não
// aparecia (já havia transcrição) e o próximo trecho substituía o id: a gravação
// ficava órfã. A transcrição agora lista as gravações que ela já contém.
test("a transcrição junta a lista de gravações que já contém", () => {
  const junta = plain(t.juntarTranscricoes({ ...primeira, gravacoes: ["g1"] }, { ...nova, gravacoes: ["g2"] }));
  assert.deepEqual(junta.gravacoes, ["g1", "g2"]);
  // transcrição antiga sem a lista: continua sem, para a gravação dela não virar "pendente"
  const antiga = plain(t.juntarTranscricoes(primeira, { ...nova, motor: "texto colado", gravacoes: [] }));
  assert.equal(antiga.gravacoes, undefined);
  assert.equal(t.gravacaoPendente({ gravacaoId: "g1", transcricao: antiga }), null);
});

test("gravação guardada que não entrou na transcrição continua pendente", () => {
  assert.equal(t.gravacaoPendente({ gravacaoId: null, transcricao: null }), null);
  assert.equal(t.gravacaoPendente({ gravacaoId: "g1", transcricao: null }), "g1");
  assert.equal(t.gravacaoPendente({ gravacaoId: "g1", transcricao: { ...primeira, gravacoes: ["g1"] } }), null);
  // segundo trecho que falhou ao transcrever, ou página recarregada no meio dele
  assert.equal(t.gravacaoPendente({ gravacaoId: "g2", transcricao: { ...primeira, gravacoes: ["g1"] } }), "g2");
  // transcrição de antes desta lista existir: a gravação já tinha sido transcrita
  assert.equal(t.gravacaoPendente({ gravacaoId: "g1", transcricao: primeira }), null);
});

test("anotações coladas depois de uma transcrição entram no fim, sem mudar os índices já citados", () => {
  const colado = { geradaEm: "2026-09-28T12:40:00.000Z", motor: "texto colado", duracaoSeg: 0, segmentos: [{ i: 0, inicio: 0, fim: 0, texto: "e" }] };
  const junta = plain(t.juntarTranscricoes({ ...primeira, gravacoes: ["g1"] }, colado));
  assert.deepEqual(junta.segmentos.map((s) => [s.i, s.texto]), [[0, "a"], [1, "b"], [2, "e"]]);
  assert.deepEqual(junta.gravacoes, ["g1"]);
  assert.equal(junta.motor, "whisper + texto colado");
});
