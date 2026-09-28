// ACHADOS NA TRANSCRIÇÃO, SEM IA (28/09/2026).
//
// Sem a IA paga, a transcrição continua útil: cada trecho que fala de um tema
// do roteiro aparece embaixo da linha certa, e ela leva o trecho para a linha
// com um clique. É busca por palavras, local e previsível: nunca inventa, só
// aponta onde na gravação o assunto apareceu.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, plain } from "./helpers/load-ts.mjs";

const achados = loadTs("src/features/nutricao/dominio/achados.ts");
const campos = loadTs("src/features/nutricao/dominio/campos.ts");

const seg = (i, texto) => ({ i, inicio: i * 10, fim: i * 10 + 8, texto });
const segmentos = [
  seg(0, "Oi, tudo bem? Então, como está o treino?"),
  seg(1, "Estou fazendo musculação três vezes por semana, de manhã."),
  seg(2, "E o SONO? Tenho dormido umas seis horas, acordo de madrugada."),
  seg(3, "Intestino está funcionando todo dia, esvaziamento completo."),
  seg(4, "Água eu bebo pouco, uns dois copos."),
  seg(5, "Café tomo três por dia, o último às cinco, sem açúcar."),
  seg(6, "Bebida alcoólica só no fim de semana, uma taça de vinho."),
  seg(7, "Refrigerante parei. Suco também, só natural às vezes."),
  seg(8, "A disposição melhorou bastante, mas a ansiedade ainda aparece à noite."),
  seg(9, "O que mais melhorou foi o inchaço. A maior dificuldade é o lanche da tarde no trabalho."),
  seg(10, "No final de semana a rotina muda muito, como fora."),
  seg(11, "Peso deu 71,2 e a gordura visceral ficou em 7."),
];

test("cada tema do roteiro aponta para os trechos que falam dele", () => {
  const r = plain(achados.achadosNaTranscricao(segmentos));
  assert.deepEqual(r.treino, [0, 1]);
  assert.deepEqual(r.sono, [2]);
  assert.deepEqual(r.intestino, [3]);
  assert.deepEqual(r.hidratacao, [4]);
  assert.deepEqual(r.cafe, [5]);
  assert.deepEqual(r.alcool, [6]);
  assert.deepEqual(r.refrigerante, [7]);
  assert.deepEqual(r.suco, [7]);
  assert.deepEqual(r.disposicao, [8]);
  assert.deepEqual(r.ansiedade, [8]);
  assert.deepEqual(r.dificuldade, [9]);
  assert.deepEqual(r.finsDeSemana, [6, 10]);
  assert.deepEqual(r.bio, [11]);
});

test("'melhorou' pega o relato de melhora, não a palavra solta em outro tema", () => {
  const r = plain(achados.achadosNaTranscricao(segmentos));
  assert.deepEqual(r.melhorou, [8, 9]);
});

test("acento e caixa não importam; sem transcrição, nada", () => {
  const r = plain(achados.achadosNaTranscricao([seg(0, "HIDRATAÇÃO: dois litros de agua por dia.")]));
  assert.deepEqual(r.hidratacao, [0]);
  const vazio = plain(achados.achadosNaTranscricao([]));
  assert.deepEqual(vazio.sono, []);
  assert.equal(Object.keys(vazio).length, 14);
});

test("usar um trecho leva o texto para a linha, com a fala de origem e a marca 'da gravação'", () => {
  const agora = "2026-09-28T12:00:00.000Z";
  const valor = campos.usarTrechoDaTranscricao(campos.valorVazio(), segmentos[1], agora);
  assert.equal(valor.texto, "Estou fazendo musculação três vezes por semana, de manhã.");
  assert.equal(valor.estado, "preenchido");
  assert.equal(valor.origem, "transcricao");
  assert.deepEqual(plain(valor.evidencias), [{ segmento: 1, trecho: segmentos[1].texto, quem: "incerto" }]);
  // um segundo trecho entra em seguida, sem apagar o primeiro; o mesmo trecho não entra duas vezes
  const dois = campos.usarTrechoDaTranscricao(valor, segmentos[0], agora);
  assert.equal(dois.texto, "Estou fazendo musculação três vezes por semana, de manhã. Oi, tudo bem? Então, como está o treino?");
  assert.equal(dois.evidencias.length, 2);
  assert.equal(campos.usarTrechoDaTranscricao(dois, segmentos[0], agora), dois);
  // texto já digitado continua: o trecho vem depois
  const digitado = campos.usarTrechoDaTranscricao(campos.editarTexto(campos.valorVazio(), "3x/sem", agora), segmentos[1], agora);
  assert.equal(digitado.texto, "3x/sem. Estou fazendo musculação três vezes por semana, de manhã.");
});
