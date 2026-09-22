// A VOZ DO DOUTOR POR FASE (22/09/2026) — passo 6 do portal.
//
// O que se protege: a fase certa pelo tempo de plano (e sem plano = boas-vindas),
// nunca inventar mensagem para fase sem gravação, e o aviso de formato que
// evita áudio mudo no iPhone.
import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.mjs";

const mod = await loadTs("supabase/functions/_shared/vozDoDoutor.ts");

test("a fase segue os dias desde o fechamento do plano", () => {
  assert.equal(mod.faseDoPaciente({ inicio: "2026-09-20" }, "2026-09-22"), "COMECO");
  assert.equal(mod.faseDoPaciente({ inicio: "2026-08-23" }, "2026-09-22"), "COMECO", "dia 30 ainda é começo");
  assert.equal(mod.faseDoPaciente({ inicio: "2026-08-22" }, "2026-09-22"), "MEIO", "dia 31 vira meio");
  assert.equal(mod.faseDoPaciente({ inicio: "2026-06-13" }, "2026-09-22"), "MEIO", "a demo (101 dias) está no meio do caminho");
  assert.equal(mod.faseDoPaciente({ inicio: "2026-04-01" }, "2026-09-22"), "RETA_FINAL");
  assert.equal(mod.faseDoPaciente({ inicio: "2026-01-10" }, "2026-09-22"), "DEPOIS");
});

test("sem plano é boas-vindas; data torta não derruba", () => {
  assert.equal(mod.faseDoPaciente(null, "2026-09-22"), "SEM_PLANO");
  assert.equal(mod.faseDoPaciente({ inicio: "" }, "2026-09-22"), "SEM_PLANO");
  assert.equal(mod.faseDoPaciente({ inicio: "nada" }, "2026-09-22"), "COMECO", "inválida cai no começo, não quebra");
  assert.equal(mod.faseDoPaciente({ inicio: "2026-12-01" }, "2026-09-22"), "COMECO", "plano com data futura = começo");
});

test("só a mensagem ATIVA da fase; sem gravação, null — nunca inventa", () => {
  const msgs = [
    { id: "a", fase: "COMECO", ativo: false, titulo: "velha", texto: "" },
    { id: "b", fase: "COMECO", ativo: true, titulo: "nova", texto: "" },
    { id: "c", fase: "MEIO", ativo: true, titulo: "meio", texto: "" },
  ];
  assert.equal(mod.mensagemParaFase(msgs, "COMECO").id, "b");
  assert.equal(mod.mensagemParaFase(msgs, "MEIO").id, "c");
  assert.equal(mod.mensagemParaFase(msgs, "RETA_FINAL"), null);
});

test("duração em minutos:segundos", () => {
  assert.equal(mod.duracaoTexto(42), "0:42");
  assert.equal(mod.duracaoTexto(185.4), "3:05");
  assert.equal(mod.duracaoTexto(null), "0:00");
});

test("formato: webm avisa do iPhone; mp4/mp3 passam; extensão certa no bucket", () => {
  assert.match(mod.avisoDoFormato("audio/webm;codecs=opus"), /iPhone/);
  assert.equal(mod.avisoDoFormato("audio/mp4"), "");
  assert.equal(mod.avisoDoFormato("audio/mpeg"), "");
  assert.equal(mod.extensaoDoAudio("audio/mp4"), "m4a");
  assert.equal(mod.extensaoDoAudio("audio/x-m4a"), "m4a");
  assert.equal(mod.extensaoDoAudio("audio/mpeg"), "mp3");
  assert.equal(mod.extensaoDoAudio("audio/webm;codecs=opus"), "webm");
});

test("limites: só áudio, até 15 MB e 3 minutos", () => {
  assert.equal(mod.validarAudio("audio/mp4", 900_000, 42), "");
  assert.match(mod.validarAudio("video/mp4", 900_000, 42), /arquivo de áudio/);
  assert.match(mod.validarAudio("audio/mp4", 0, 42), /vazio/);
  assert.match(mod.validarAudio("audio/mp4", 16 * 1024 * 1024, 42), /15 MB/);
  assert.match(mod.validarAudio("audio/mp4", 900_000, 200), /3 minutos/);
  assert.equal(mod.validarAudio("audio/mp4", 900_000, null), "", "sem duração conhecida, não barra");
});

test("as cinco fases têm rótulo e recorte para o doutor gravar", () => {
  assert.equal(mod.FASES.length, 5);
  for (const f of mod.FASES) {
    assert.ok(mod.FASE_INFO[f].rotulo);
    assert.ok(mod.FASE_INFO[f].periodo);
    assert.ok(mod.FASE_INFO[f].paraQuem);
  }
});
