// ESTAÇÃO LOCAL: TRANSCRIÇÃO COM WHISPER.CPP (28/09/2026).
//
// O whisper.cpp devolve os tempos em milissegundos; o app usa segundos com duas
// casas. Trecho vazio não vira segmento. O progresso vem pelo stderr.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const whisper = await import("../tools/estacao-nutri/whisper.ts");

test("JSON do whisper vira segmentos em segundos, com i sequencial", () => {
  const json = {
    transcription: [
      { offsets: { from: 0, to: 4320 }, text: "  Bom dia, tudo bem? " },
      { offsets: { from: 4320, to: 5000 }, text: "   " },
      { offsets: { from: 5000, to: 9876 }, text: " Tô treinando três vezes por semana." },
      { offsets: { from: 9876, to: 10000 }, text: " [BLANK_AUDIO]" },
      { offsets: { from: 10000, to: 12345 }, text: "Musculação de manhã." },
    ],
  };
  assert.deepEqual(whisper.segmentosDoJsonWhisper(json), [
    { i: 0, inicio: 0, fim: 4.32, texto: "Bom dia, tudo bem?" },
    { i: 1, inicio: 5, fim: 9.88, texto: "Tô treinando três vezes por semana." },
    { i: 2, inicio: 10, fim: 12.35, texto: "Musculação de manhã." },
  ]);
});

test("JSON sem transcrição devolve lista vazia", () => {
  assert.deepEqual(whisper.segmentosDoJsonWhisper({}), []);
  assert.deepEqual(whisper.segmentosDoJsonWhisper({ transcription: [] }), []);
  assert.deepEqual(whisper.segmentosDoJsonWhisper(null), []);
});

test("progresso lido da linha do stderr", () => {
  assert.equal(whisper.progressoDaLinha("whisper_print_progress_callback: progress =  45%"), 45);
  assert.equal(whisper.progressoDaLinha("whisper_print_progress_callback: progress = 100%"), 100);
  assert.equal(whisper.progressoDaLinha("whisper_print_progress_callback: progress =   5%"), 5);
  assert.equal(whisper.progressoDaLinha("whisper_init_from_file_with_params_no_state: loading model"), null);
  assert.equal(whisper.progressoDaLinha(""), null);
});

test("threads: pelo menos 4, deixando 2 núcleos livres", () => {
  assert.equal(whisper.threadsDoWhisper(10), 8);
  assert.equal(whisper.threadsDoWhisper(4), 4);
  assert.equal(whisper.threadsDoWhisper(2), 4);
});

// ---------------------------------------------------------------- transcrever com programas falsos

function escreverExecutavel(caminho, corpo) {
  fs.writeFileSync(caminho, `#!/bin/sh\n${corpo}\n`, { mode: 0o755 });
}

function montarFalsos(pasta, { whisperFalha = false } = {}) {
  const log = path.join(pasta, "chamadas.log");
  const ffmpeg = path.join(pasta, "ffmpeg");
  const ffprobe = path.join(pasta, "ffprobe");
  const whisperCli = path.join(pasta, "whisper-cli");
  // ffmpeg falso: registra os argumentos e cria o arquivo de saída (último argumento)
  escreverExecutavel(ffmpeg, `echo "ffmpeg $*" >> "${log}"\nfor a in "$@"; do out="$a"; done\necho RIFF > "$out"`);
  escreverExecutavel(ffprobe, `echo "31.456789"`);
  const json = JSON.stringify({
    transcription: [
      { offsets: { from: 0, to: 2000 }, text: " Oi, doutora." },
      { offsets: { from: 2000, to: 30500 }, text: " Tô dormindo sete horas." },
    ],
  });
  const falha = whisperFalha ? "echo 'erro: modelo corrompido' >&2\nexit 3" : "";
  escreverExecutavel(
    whisperCli,
    [
      `echo "whisper $*" >> "${log}"`,
      falha,
      `base=""; prev=""`,
      `for a in "$@"; do if [ "$prev" = "-of" ]; then base="$a"; fi; prev="$a"; done`,
      `echo "whisper_print_progress_callback: progress =  50%" >&2`,
      `echo "whisper_print_progress_callback: progress = 100%" >&2`,
      `echo '${json}' > "$base.json"`,
    ].join("\n"),
  );
  const modelo = path.join(pasta, "ggml-teste.bin");
  fs.writeFileSync(modelo, "modelo");
  return { log, config: { ffmpegBin: ffmpeg, ffprobeBin: ffprobe, whisperBin: whisperCli, modeloWhisper: modelo } };
}

test("transcrever: converte, roda o whisper, informa etapas e progresso e limpa os intermediários", async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "estacao-whisper-"));
  try {
    const { log, config } = montarFalsos(pasta);
    const trabalho = path.join(pasta, "trabalho");
    fs.mkdirSync(trabalho);
    const entrada = path.join(pasta, "grav-1.ogg");
    fs.writeFileSync(entrada, "OggS");

    const etapas = [];
    const progressos = [];
    const resultado = await whisper.transcrever({
      entrada,
      pastaTrabalho: trabalho,
      nomeBase: "grav-1.job-1",
      config,
      aoEtapa: (e) => etapas.push(e),
      aoProgresso: (p) => progressos.push(p),
    });

    assert.deepEqual(etapas, ["convertendo", "transcrevendo"]);
    assert.deepEqual(progressos, [50, 100]);
    assert.equal(resultado.motor, "whisper.cpp ggml-teste.bin");
    assert.equal(resultado.duracaoSeg, 31.46);
    assert.deepEqual(resultado.segmentos, [
      { i: 0, inicio: 0, fim: 2, texto: "Oi, doutora." },
      { i: 1, inicio: 2, fim: 30.5, texto: "Tô dormindo sete horas." },
    ]);

    const chamadas = fs.readFileSync(log, "utf8");
    const wav = path.join(trabalho, "grav-1.job-1.wav");
    assert.ok(chamadas.includes(`ffmpeg -y -i ${entrada} -ar 16000 -ac 1 -c:a pcm_s16le ${wav}`), chamadas);
    assert.match(chamadas, /whisper -m \S+ggml-teste\.bin -l pt -t \d+ -oj -pp -of \S+grav-1\.job-1 \S+grav-1\.job-1\.wav/);
    assert.deepEqual(fs.readdirSync(trabalho), [], "wav e json intermediários apagados");
    assert.ok(fs.existsSync(entrada), "o áudio original fica (a retenção cuida dele)");
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test("transcrever: falha do whisper vira erro em português e não deixa sobra", async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "estacao-whisper-"));
  try {
    const { config } = montarFalsos(pasta, { whisperFalha: true });
    const entrada = path.join(pasta, "grav-2.webm");
    fs.writeFileSync(entrada, "webm");
    await assert.rejects(
      whisper.transcrever({ entrada, pastaTrabalho: pasta, nomeBase: "grav-2.job", config, aoProgresso: () => {} }),
      (erro) => {
        assert.match(erro.message, /transcrição falhou/i);
        return true;
      },
    );
    assert.equal(fs.existsSync(path.join(pasta, "grav-2.job.wav")), false);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test("transcrever: sem modelo baixado avisa antes de rodar", async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "estacao-whisper-"));
  try {
    const { config } = montarFalsos(pasta);
    const entrada = path.join(pasta, "grav-3.webm");
    fs.writeFileSync(entrada, "webm");
    await assert.rejects(
      whisper.transcrever({ entrada, pastaTrabalho: pasta, config: { ...config, modeloWhisper: path.join(pasta, "nao-existe.bin") }, aoProgresso: () => {} }),
      /modelo de transcrição não foi encontrado/i,
    );
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});
