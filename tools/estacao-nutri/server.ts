// ESTAÇÃO LOCAL DA NUTRIÇÃO (v0.1.0, 28/09/2026).
//
// Servidor pequeno no Mac da Dra. Géssica para o que o navegador não faz:
// transcrever o áudio da consulta localmente (whisper.cpp; o áudio não sai do
// Mac), pedir à IA a organização no formato do checkpoint (a chave fica aqui,
// fora do navegador) e imprimir o plano em PDF com o Chrome instalado (mesmo
// motor da prévia). Escuta só em 127.0.0.1 e só atende as origens do app.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { carregarConfig } from "./config.ts";
import { ErroEstacao } from "./erros.ts";
import { criarClienteIA, traduzirErroIA } from "./ia.ts";
import type { ClienteIA } from "./organizar.ts";
import { organizarConsulta, validarEntradaOrganizacao } from "./organizar.ts";
import { cabecalhosCors, hostPermitido, origemPermitida } from "./origem.ts";
import { fecharNavegador, gerarPdf } from "./pdf.ts";
import { aplicarRetencao } from "./retencao.ts";
import type { ResultadoTranscricao } from "./whisper.ts";
import { transcrever } from "./whisper.ts";

const VERSAO = "0.1.0";
const MB = 1024 * 1024;
const LIMITE_AUDIO = 400 * MB;
const LIMITE_JSON = 20 * MB;
const UMA_HORA = 60 * 60 * 1000;
const CAMINHOS_CHROME = ["/Applications/Google Chrome.app", path.join(os.homedir(), "Applications", "Google Chrome.app")];

const config = carregarConfig();
const pastas = {
  audios: path.join(config.pastaDados, "audios"),
  trabalho: path.join(config.pastaDados, "trabalho"),
  transcricoes: path.join(config.pastaDados, "transcricoes"),
  modelos: path.join(config.pastaDados, "modelos"),
};

type EstadoJob = "convertendo" | "transcrevendo" | "pronta" | "erro";
type Job = {
  id: string;
  gravacao: string;
  estado: EstadoJob;
  progresso: number;
  erro: string | null;
  resultado: ResultadoTranscricao | null;
  criadoEm: number;
};

const jobs = new Map<string, Job>();
// Gravações descartadas pelo app enquanto a transcrição ainda rodava: o
// resultado não é gravado em disco (o app já disse que apagou tudo).
const descartadas = new Map<string, number>();
// Uma transcrição por vez: o whisper já usa quase todos os núcleos.
let fila: Promise<void> = Promise.resolve();
let clienteIA: ClienteIA | null = null;

// ---------------------------------------------------------------- estado da estação

function chromeInstalado(): boolean {
  return CAMINHOS_CHROME.some((c) => fs.existsSync(c));
}

function whisperPronto(): boolean {
  return fs.existsSync(config.whisperBin) && fs.existsSync(config.modeloWhisper);
}

function saude() {
  const pronto = whisperPronto();
  return {
    ok: true,
    versao: VERSAO,
    whisper: { pronto, modelo: fs.existsSync(config.modeloWhisper) ? path.basename(config.modeloWhisper) : null },
    ffmpeg: fs.existsSync(config.ffmpegBin),
    chrome: chromeInstalado(),
    ia: { configurada: Boolean(config.chaveIA), modelo: config.modeloIA },
  };
}

// ---------------------------------------------------------------- corpo do pedido

function sanitizarId(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
}

function extensaoDoAudio(contentType: string | undefined): string {
  const tipo = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (tipo.includes("webm")) return "webm";
  if (tipo.includes("ogg") || tipo.includes("opus")) return "ogg";
  if (tipo.includes("m4a")) return "m4a";
  if (tipo.includes("mp4")) return "mp4";
  if (tipo.includes("wav") || tipo.includes("wave")) return "wav";
  if (tipo.includes("mpeg") || tipo.includes("mp3")) return "mp3";
  return "bin";
}

function erroDeTamanho(limite: number): ErroEstacao {
  return new ErroEstacao(`O envio passa do limite de ${Math.round(limite / MB)} MB.`, 413);
}

/** Grava o corpo direto em arquivo (sem guardar 400 MB na memória). */
function salvarCorpo(req: http.IncomingMessage, destino: string, limite: number): Promise<number> {
  const declarado = Number(req.headers["content-length"]);
  if (Number.isFinite(declarado) && declarado > limite) return Promise.reject(erroDeTamanho(limite));
  const parcial = `${destino}.parcial`;
  return new Promise((resolve, reject) => {
    const saida = fs.createWriteStream(parcial, { mode: 0o600 });
    let recebidos = 0;
    let terminou = false;
    const falhar = (erro: unknown) => {
      if (terminou) return;
      terminou = true;
      req.pause();
      saida.destroy();
      fs.promises.rm(parcial, { force: true }).finally(() => reject(erro));
    };
    req.on("data", (pedaco: Buffer) => {
      if (terminou) return;
      recebidos += pedaco.length;
      if (recebidos > limite) return falhar(erroDeTamanho(limite));
      if (!saida.write(pedaco)) {
        req.pause();
        saida.once("drain", () => req.resume());
      }
    });
    req.on("end", () => {
      if (terminou) return;
      saida.end(async () => {
        if (terminou) return;
        terminou = true;
        try {
          if (recebidos === 0) {
            await fs.promises.rm(parcial, { force: true });
            reject(new ErroEstacao("O áudio chegou vazio.", 400));
            return;
          }
          await fs.promises.rename(parcial, destino);
          resolve(recebidos);
        } catch (erro) {
          reject(erro);
        }
      });
    });
    req.on("error", falhar);
    req.on("close", () => {
      if (!req.complete) falhar(new ErroEstacao("O envio foi interrompido.", 400));
    });
    saida.on("error", falhar);
  });
}

function lerJson(req: http.IncomingMessage, limite: number): Promise<unknown> {
  const declarado = Number(req.headers["content-length"]);
  if (Number.isFinite(declarado) && declarado > limite) return Promise.reject(erroDeTamanho(limite));
  return new Promise((resolve, reject) => {
    const pedacos: Buffer[] = [];
    let recebidos = 0;
    let terminou = false;
    req.on("data", (pedaco: Buffer) => {
      if (terminou) return;
      recebidos += pedaco.length;
      if (recebidos > limite) {
        terminou = true;
        req.pause();
        reject(erroDeTamanho(limite));
        return;
      }
      pedacos.push(pedaco);
    });
    req.on("end", () => {
      if (terminou) return;
      terminou = true;
      try {
        resolve(JSON.parse(Buffer.concat(pedacos).toString("utf8")));
      } catch {
        reject(new ErroEstacao("O corpo do pedido não é um JSON válido.", 400));
      }
    });
    req.on("error", (erro) => {
      if (terminou) return;
      terminou = true;
      reject(erro);
    });
  });
}

// ---------------------------------------------------------------- transcrição

async function rodarJob(job: Job, arquivo: string): Promise<void> {
  try {
    if (!fs.existsSync(arquivo)) throw new ErroEstacao("O áudio desta gravação foi apagado antes da transcrição.", 410);
    const resultado = await transcrever({
      entrada: arquivo,
      pastaTrabalho: pastas.trabalho,
      nomeBase: `${job.gravacao}.${job.id}`,
      config,
      aoEtapa: (etapa) => {
        job.estado = etapa;
        job.progresso = 0;
      },
      aoProgresso: (percentual) => {
        job.progresso = percentual;
      },
    });
    if (descartadas.has(job.gravacao)) {
      await apagarComPrefixo(pastas.trabalho, job.gravacao);
      throw new ErroEstacao("A gravação foi descartada antes de a transcrição terminar.", 410);
    }
    // O nome começa pela gravação: apagar a gravação leva a transcrição junto.
    await fs.promises.writeFile(
      path.join(pastas.transcricoes, `${job.gravacao}.${job.id}.json`),
      JSON.stringify({ jobId: job.id, gravacao: job.gravacao, geradaEm: new Date().toISOString(), ...resultado }),
      { mode: 0o600 },
    );
    job.resultado = resultado;
    job.progresso = 100;
    job.estado = "pronta";
  } catch (erro) {
    job.estado = "erro";
    job.erro = erro instanceof ErroEstacao ? erro.message : "A transcrição falhou.";
    registrarErro(`transcrição ${job.id}`, erro);
  }
}

async function receberAudio(req: http.IncomingMessage, url: URL): Promise<{ jobId: string }> {
  const gravacao = sanitizarId(url.searchParams.get("gravacao"));
  if (!gravacao) throw new ErroEstacao("Informe a gravação: /transcricoes?gravacao=<id>.", 400);
  if (!whisperPronto() || !fs.existsSync(config.ffmpegBin)) {
    throw new ErroEstacao("A transcrição não está pronta nesta estação (falta o whisper.cpp, o modelo ou o ffmpeg). Veja GET /saude.", 503);
  }
  const arquivo = path.join(pastas.audios, `${gravacao}.${extensaoDoAudio(req.headers["content-type"])}`);
  await salvarCorpo(req, arquivo, LIMITE_AUDIO);
  const job: Job = { id: crypto.randomUUID(), gravacao, estado: "convertendo", progresso: 0, erro: null, resultado: null, criadoEm: Date.now() };
  jobs.set(job.id, job);
  fila = fila.then(() => rodarJob(job, arquivo));
  return { jobId: job.id };
}

async function estadoDoJob(jobId: string) {
  const job = jobs.get(jobId);
  if (job) return { estado: job.estado, progresso: job.progresso, erro: job.erro, resultado: job.resultado };
  // A estação foi reiniciada: o resultado gravado em disco ainda vale.
  if (/^[0-9a-f-]{36}$/.test(jobId)) {
    try {
      const nome = (await fs.promises.readdir(pastas.transcricoes)).find((n) => n.endsWith(`.${jobId}.json`));
      if (nome) {
        const salvo = JSON.parse(await fs.promises.readFile(path.join(pastas.transcricoes, nome), "utf8"));
        return { estado: "pronta", progresso: 100, erro: null, resultado: { motor: salvo.motor, duracaoSeg: salvo.duracaoSeg, segmentos: salvo.segmentos } };
      }
    } catch {
      // não existe (ou foi apagado pela retenção)
    }
  }
  throw new ErroEstacao("Transcrição não encontrada.", 404);
}

async function apagarGravacao(bruto: string): Promise<void> {
  let decodificado = bruto;
  try {
    decodificado = decodeURIComponent(bruto);
  } catch {
    // mantém como veio; a limpeza abaixo tira o que não for letra, número, _ ou -
  }
  const gravacao = sanitizarId(decodificado);
  if (!gravacao) throw new ErroEstacao("Informe a gravação a apagar.", 400);
  descartadas.set(gravacao, Date.now());
  for (const [id, job] of jobs) if (job.gravacao === gravacao) jobs.delete(id);
  // Áudio, arquivos de trabalho e a transcrição: nada dessa gravação fica no Mac.
  for (const pasta of [pastas.audios, pastas.trabalho, pastas.transcricoes]) await apagarComPrefixo(pasta, gravacao);
}

async function apagarComPrefixo(pasta: string, gravacao: string): Promise<void> {
  let nomes: string[] = [];
  try {
    nomes = await fs.promises.readdir(pasta);
  } catch {
    return;
  }
  for (const nome of nomes) {
    if (nome.startsWith(`${gravacao}.`)) await fs.promises.rm(path.join(pasta, nome), { force: true });
  }
}

// ---------------------------------------------------------------- IA e PDF

async function organizar(req: http.IncomingMessage) {
  if (!config.chaveIA) throw new ErroEstacao("A chave da IA não está configurada nesta estação.", 503);
  const entrada = validarEntradaOrganizacao(await lerJson(req, LIMITE_JSON));
  clienteIA ??= criarClienteIA(config.chaveIA) as unknown as ClienteIA;
  try {
    return await organizarConsulta(entrada, clienteIA, config);
  } catch (erro) {
    throw traduzirErroIA(erro) ?? erro;
  }
}

async function pdf(req: http.IncomingMessage): Promise<Uint8Array> {
  const corpo = (await lerJson(req, LIMITE_JSON)) as { html?: unknown } | null;
  if (!corpo || typeof corpo.html !== "string" || !corpo.html.trim()) {
    throw new ErroEstacao("Envie { html } com a página do plano.", 400);
  }
  if (!chromeInstalado()) throw new ErroEstacao("O Google Chrome não foi encontrado nesta estação.", 503);
  try {
    return await gerarPdf(corpo.html);
  } catch (erro) {
    throw new ErroEstacao("Não foi possível gerar o PDF.", 500, erro instanceof Error ? erro.message : String(erro));
  }
}

// ---------------------------------------------------------------- servidor

function registrarErro(onde: string, erro: unknown): void {
  if (erro instanceof ErroEstacao) {
    if (erro.status >= 500 || erro.detalhe) console.error(`[estação] ${onde}: ${erro.message}${erro.detalhe ? ` (${erro.detalhe})` : ""}`);
    return;
  }
  console.error(`[estação] ${onde}: erro inesperado`, erro);
}

async function tratar(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const cors = cabecalhosCors(req.headers, config.origensPermitidas);
  const base = { ...cors, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const json = (status: number, corpo: unknown, extra: Record<string, string> = {}) => {
    const texto = JSON.stringify(corpo);
    res.writeHead(status, { ...base, ...extra, "Content-Type": "application/json; charset=utf-8", "Content-Length": String(Buffer.byteLength(texto)) });
    res.end(texto);
  };
  const rota = `${req.method} ${(req.url ?? "/").split("?")[0]}`;

  try {
    if (!hostPermitido(req.headers.host, config.porta)) {
      return json(403, { erro: "Endereço não permitido." }, { Connection: "close" });
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !origemPermitida(origin, config.origensPermitidas)) {
      return json(403, { erro: "Origem não permitida." }, { Connection: "close" });
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, base);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${config.host}:${config.porta}`);
    const caminho = url.pathname;
    let m: RegExpExecArray | null;

    if (req.method === "GET" && caminho === "/saude") return json(200, saude());
    if (req.method === "POST" && caminho === "/transcricoes") return json(202, await receberAudio(req, url));
    if (req.method === "GET" && (m = /^\/transcricoes\/([^/]+)$/.exec(caminho))) return json(200, await estadoDoJob(m[1]));
    if (req.method === "DELETE" && (m = /^\/audios\/([^/]+)$/.exec(caminho))) {
      await apagarGravacao(m[1]);
      res.writeHead(204, base);
      res.end();
      return;
    }
    if (req.method === "POST" && caminho === "/organizar") return json(200, await organizar(req));
    if (req.method === "POST" && caminho === "/pdf") {
      const bytes = await pdf(req);
      res.writeHead(200, { ...base, "Content-Type": "application/pdf", "Content-Length": String(bytes.byteLength) });
      res.end(bytes);
      return;
    }
    return json(404, { erro: "Rota não encontrada." });
  } catch (erro) {
    registrarErro(rota, erro);
    if (res.headersSent) {
      res.end();
      return;
    }
    if (erro instanceof ErroEstacao) {
      return json(erro.status, { erro: erro.message }, erro.status === 413 ? { Connection: "close" } : {});
    }
    return json(500, { erro: "Erro inesperado na estação." });
  }
}

async function limpar(): Promise<void> {
  for (const pasta of [pastas.audios, pastas.trabalho, pastas.transcricoes]) {
    const apagados = await aplicarRetencao(pasta, config.diasRetencaoAudio);
    if (apagados.length) console.log(`[estação] retenção: ${apagados.length} arquivo(s) com mais de ${config.diasRetencaoAudio} dias apagado(s) de ${path.basename(pasta)}.`);
  }
  const umDiaAtras = Date.now() - 24 * UMA_HORA;
  for (const [id, job] of jobs) {
    if ((job.estado === "pronta" || job.estado === "erro") && job.criadoEm < umDiaAtras) jobs.delete(id);
  }
  for (const [gravacao, em] of descartadas) if (em < umDiaAtras) descartadas.delete(gravacao);
}

async function iniciar(): Promise<void> {
  for (const pasta of Object.values(pastas)) await fs.promises.mkdir(pasta, { recursive: true, mode: 0o700 });
  await limpar();
  setInterval(() => {
    limpar().catch((erro) => registrarErro("retenção", erro));
  }, UMA_HORA).unref();

  const servidor = http.createServer((req, res) => {
    tratar(req, res).catch((erro) => registrarErro("pedido", erro));
  });
  servidor.on("error", (erro: NodeJS.ErrnoException) => {
    if (erro.code === "EADDRINUSE") console.error(`[estação] A porta ${config.porta} já está em uso. A estação já está aberta?`);
    else console.error("[estação] não foi possível abrir o servidor:", erro);
    process.exit(1);
  });
  servidor.listen(config.porta, config.host, () => {
    const s = saude();
    const transcricao = s.whisper.pronto && s.ffmpeg ? `pronta (${s.whisper.modelo})` : `NÃO pronta (whisper ${fs.existsSync(config.whisperBin) ? "ok" : "ausente"}, modelo ${s.whisper.modelo ?? "ausente"}, ffmpeg ${s.ffmpeg ? "ok" : "ausente"})`;
    for (const aviso of config.avisos) console.warn(`[estação] aviso: ${aviso}`);
    console.log(
      `Estação local em http://${config.host}:${config.porta} | transcrição: ${transcricao} | PDF: ${s.chrome ? "Chrome ok" : "Chrome ausente"} | IA: ${s.ia.configurada ? s.ia.modelo : "sem chave"} | áudios apagados após ${config.diasRetencaoAudio} dias`,
    );
  });

  let encerrando = false;
  const encerrar = async () => {
    if (encerrando) return;
    encerrando = true;
    servidor.close();
    servidor.closeAllConnections();
    await fecharNavegador();
    process.exit(0);
  };
  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);
}

await iniciar();
