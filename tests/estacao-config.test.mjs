// ESTAÇÃO LOCAL: CONFIGURAÇÃO E ORIGENS (28/09/2026).
//
// A estação só escuta em 127.0.0.1 e só responde às origens do app. A chave
// da IA vem do .env.local da estação ou do ambiente (o ambiente ganha).
import test from "node:test";
import assert from "node:assert/strict";

const config = await import("../tools/estacao-nutri/config.ts");
const origem = await import("../tools/estacao-nutri/origem.ts");

const HOME = "/Users/teste";
const nadaExiste = () => false;

test("lê KEY=VALUE, ignora comentários e linhas vazias, tira aspas", () => {
  const texto = [
    "# chave da organização com retenção zero",
    "",
    "ANTHROPIC_API_KEY=sk-ant-teste",
    "  PORTA = 9000  ",
    'MODELO_IA="claude-opus-5"',
    "DIAS_RETENCAO_AUDIO='3'",
    "ORIGENS_PERMITIDAS=http://127.0.0.1:5174 # só a demo",
    "linha sem igual",
  ].join("\n");
  assert.deepEqual(config.lerArquivoEnv(texto), {
    ANTHROPIC_API_KEY: "sk-ant-teste",
    PORTA: "9000",
    MODELO_IA: "claude-opus-5",
    DIAS_RETENCAO_AUDIO: "3",
    ORIGENS_PERMITIDAS: "http://127.0.0.1:5174",
  });
});

test("padrões quando nada foi configurado", () => {
  const c = config.montarConfig({ env: {}, textoArquivo: "", home: HOME, existe: nadaExiste });
  assert.equal(c.chaveIA, null);
  assert.equal(c.porta, 8787);
  assert.equal(c.host, "127.0.0.1");
  assert.equal(c.pastaDados, "/Users/teste/Library/Application Support/EstacaoNutri");
  assert.equal(c.modeloWhisper, "/Users/teste/Library/Application Support/EstacaoNutri/modelos/ggml-large-v3-turbo-q5_0.bin");
  assert.equal(c.whisperBin, "/opt/homebrew/bin/whisper-cli");
  assert.equal(c.ffmpegBin, "/opt/homebrew/bin/ffmpeg");
  assert.equal(c.ffprobeBin, "/opt/homebrew/bin/ffprobe");
  assert.equal(c.modeloIA, "claude-opus-5");
  assert.equal(c.diasRetencaoAudio, 7);
  assert.deepEqual(c.origensPermitidas, [
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ]);
});

test("o ambiente ganha do arquivo; valor vazio no ambiente não apaga o do arquivo", () => {
  const c = config.montarConfig({
    env: { PORTA: "9100", MODELO_IA: "claude-opus-4-8", ANTHROPIC_API_KEY: "" },
    textoArquivo: "PORTA=9000\nANTHROPIC_API_KEY=sk-ant-arquivo\nMODELO_IA=claude-opus-5",
    home: HOME,
    existe: nadaExiste,
  });
  assert.equal(c.porta, 9100);
  assert.equal(c.modeloIA, "claude-opus-4-8");
  assert.equal(c.chaveIA, "sk-ant-arquivo");
});

test("HOST é sempre 127.0.0.1, mesmo pedindo 0.0.0.0", () => {
  for (const host of ["0.0.0.0", "::", "192.168.0.10", "localhost"]) {
    const c = config.montarConfig({ env: { HOST: host }, textoArquivo: "", home: HOME, existe: nadaExiste });
    assert.equal(c.host, "127.0.0.1");
    assert.ok(c.avisos.some((a) => a.includes(host)), `avisa que ignorou ${host}`);
  }
});

test("números inválidos voltam ao padrão", () => {
  const c = config.montarConfig({
    env: { PORTA: "abc", DIAS_RETENCAO_AUDIO: "-2" },
    textoArquivo: "",
    home: HOME,
    existe: nadaExiste,
  });
  assert.equal(c.porta, 8787);
  assert.equal(c.diasRetencaoAudio, 7);
  const c2 = config.montarConfig({ env: { PORTA: "70000" }, textoArquivo: "", home: HOME, existe: nadaExiste });
  assert.equal(c2.porta, 8787);
});

test("origens: lista separada por vírgula, sem espaços nem barra final", () => {
  const c = config.montarConfig({
    env: { ORIGENS_PERMITIDAS: " https://app.bratan.com.br/ , http://127.0.0.1:5174,," },
    textoArquivo: "",
    home: HOME,
    existe: nadaExiste,
  });
  assert.deepEqual(c.origensPermitidas, ["https://app.bratan.com.br", "http://127.0.0.1:5174"]);
});

test("modelo do whisper: usa o small quando o large-v3-turbo não está baixado", () => {
  const small = "/Users/teste/Documents/Codex/2026-06-24/jarvis/data/whisper/ggml-small.bin";
  const c = config.montarConfig({ env: {}, textoArquivo: "", home: HOME, existe: (p) => p === small });
  assert.equal(c.modeloWhisper, small);

  const turbo = "/Users/teste/Library/Application Support/EstacaoNutri/modelos/ggml-large-v3-turbo-q5_0.bin";
  const c2 = config.montarConfig({ env: {}, textoArquivo: "", home: HOME, existe: (p) => p === small || p === turbo });
  assert.equal(c2.modeloWhisper, turbo);
});

test("modelo do whisper configurado à mão é respeitado, mesmo sem existir", () => {
  const c = config.montarConfig({ env: { MODELO_WHISPER: "/modelos/meu.bin" }, textoArquivo: "", home: HOME, existe: nadaExiste });
  assert.equal(c.modeloWhisper, "/modelos/meu.bin");
});

test("PASTA_DADOS com ~ vira a pasta da pessoa; ffprobe acompanha o ffmpeg", () => {
  const c = config.montarConfig({
    env: { PASTA_DADOS: "~/dados-estacao", FFMPEG_BIN: "/usr/local/bin/ffmpeg" },
    textoArquivo: "",
    home: HOME,
    existe: nadaExiste,
  });
  assert.equal(c.pastaDados, "/Users/teste/dados-estacao");
  assert.equal(c.ffprobeBin, "/usr/local/bin/ffprobe");
});

// ---------------------------------------------------------------- origem

const PERMITIDAS = ["http://127.0.0.1:5174", "http://localhost:5174"];

test("origem permitida só quando está na lista, exatamente", () => {
  assert.equal(origem.origemPermitida("http://127.0.0.1:5174", PERMITIDAS), true);
  assert.equal(origem.origemPermitida("http://localhost:5174", PERMITIDAS), true);
  assert.equal(origem.origemPermitida("https://evil.example", PERMITIDAS), false);
  assert.equal(origem.origemPermitida("http://127.0.0.1:5175", PERMITIDAS), false);
  assert.equal(origem.origemPermitida("http://127.0.0.1:5174.evil.example", PERMITIDAS), false);
  assert.equal(origem.origemPermitida("null", PERMITIDAS), false);
  assert.equal(origem.origemPermitida(undefined, PERMITIDAS), false);
  assert.equal(origem.origemPermitida("", PERMITIDAS), false);
});

test("CORS: devolve a origem permitida e sempre Vary: Origin", () => {
  const h = origem.cabecalhosCors({ origin: "http://127.0.0.1:5174" }, PERMITIDAS);
  assert.equal(h["Access-Control-Allow-Origin"], "http://127.0.0.1:5174");
  assert.equal(h["Vary"], "Origin");
  assert.match(h["Access-Control-Allow-Methods"], /POST/);
  assert.match(h["Access-Control-Allow-Methods"], /DELETE/);
  assert.match(h["Access-Control-Allow-Headers"], /Content-Type/);
  assert.equal(h["Access-Control-Allow-Private-Network"], undefined);

  const negado = origem.cabecalhosCors({ origin: "https://evil.example" }, PERMITIDAS);
  assert.equal(negado["Access-Control-Allow-Origin"], undefined);
  assert.equal(negado["Vary"], "Origin");
});

test("CORS: responde ao preflight de rede privada do Chrome", () => {
  const h = origem.cabecalhosCors(
    { origin: "http://localhost:5174", "access-control-request-private-network": "true" },
    PERMITIDAS,
  );
  assert.equal(h["Access-Control-Allow-Private-Network"], "true");

  const negado = origem.cabecalhosCors(
    { origin: "https://evil.example", "access-control-request-private-network": "true" },
    PERMITIDAS,
  );
  assert.equal(negado["Access-Control-Allow-Private-Network"], undefined);
});

test("Host: só 127.0.0.1 ou localhost na porta da estação (contra DNS rebinding)", () => {
  assert.equal(origem.hostPermitido("127.0.0.1:8787", 8787), true);
  assert.equal(origem.hostPermitido("localhost:8787", 8787), true);
  assert.equal(origem.hostPermitido("LOCALHOST:8787", 8787), true);
  assert.equal(origem.hostPermitido("evil.example:8787", 8787), false);
  assert.equal(origem.hostPermitido("127.0.0.1:9999", 8787), false);
  assert.equal(origem.hostPermitido(undefined, 8787), false);
});
