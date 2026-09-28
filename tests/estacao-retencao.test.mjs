// ESTAÇÃO LOCAL: RETENÇÃO DOS ÁUDIOS (28/09/2026).
//
// Áudio de consulta fica no Mac só pelo tempo configurado (padrão 7 dias).
// Passou do prazo, é apagado; no prazo exato ainda fica.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const retencao = await import("../tools/estacao-nutri/retencao.ts");

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.UTC(2026, 8, 28, 12, 0, 0);

test("seleciona só o que passou do prazo", () => {
  const arquivos = [
    { caminho: "/a/velho.webm", modificadoEm: AGORA - 8 * DIA },
    { caminho: "/a/recente.webm", modificadoEm: AGORA - 6 * DIA },
    { caminho: "/a/no-limite.webm", modificadoEm: AGORA - 7 * DIA },
    { caminho: "/a/um-pouco-alem.webm", modificadoEm: AGORA - 7 * DIA - 1 },
    { caminho: "/a/hoje.ogg", modificadoEm: AGORA },
  ];
  assert.deepEqual(retencao.arquivosParaApagar(arquivos, AGORA, 7), ["/a/velho.webm", "/a/um-pouco-alem.webm"]);
});

test("prazo de 1 dia", () => {
  const arquivos = [
    { caminho: "/a/ontem.webm", modificadoEm: AGORA - 2 * DIA },
    { caminho: "/a/agora.webm", modificadoEm: AGORA - 1000 },
  ];
  assert.deepEqual(retencao.arquivosParaApagar(arquivos, AGORA, 1), ["/a/ontem.webm"]);
  assert.deepEqual(retencao.arquivosParaApagar([], AGORA, 7), []);
});

test("aplica na pasta: apaga os velhos, mantém os novos e ignora subpastas", async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "estacao-retencao-"));
  try {
    const velho = path.join(pasta, "grav-velha.webm");
    const novo = path.join(pasta, "grav-nova.webm");
    fs.writeFileSync(velho, "a");
    fs.writeFileSync(novo, "b");
    fs.mkdirSync(path.join(pasta, "sub"));
    const dezDiasAtras = new Date(AGORA - 10 * DIA);
    fs.utimesSync(velho, dezDiasAtras, dezDiasAtras);
    fs.utimesSync(novo, new Date(AGORA - DIA), new Date(AGORA - DIA));

    const apagados = await retencao.aplicarRetencao(pasta, 7, AGORA);
    assert.deepEqual(apagados, [velho]);
    assert.equal(fs.existsSync(velho), false);
    assert.equal(fs.existsSync(novo), true);
    assert.equal(fs.existsSync(path.join(pasta, "sub")), true);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test("pasta que não existe não é erro", async () => {
  assert.deepEqual(await retencao.aplicarRetencao(path.join(os.tmpdir(), "estacao-nao-existe-" + process.pid), 7, AGORA), []);
});
