// TRANSCRIÇÃO LOCAL COM WHISPER.CPP (28/09/2026).
//
// O áudio nunca sai do Mac: ffmpeg converte para WAV 16 kHz mono, whisper-cli
// transcreve em português e grava um JSON. Os programas rodam com spawn, sem
// shell. WAV e JSON intermediários são apagados no fim; o áudio original fica
// até a retenção (ou até o app pedir para apagar).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ErroEstacao } from "./erros.ts";

export type SegmentoTranscricao = { i: number; inicio: number; fim: number; texto: string };

export type ResultadoTranscricao = { motor: string; duracaoSeg: number; segmentos: SegmentoTranscricao[] };

export type EtapaTranscricao = "convertendo" | "transcrevendo";

export type ConfigTranscricao = {
  ffmpegBin: string;
  ffprobeBin: string;
  whisperBin: string;
  modeloWhisper: string;
};

const MARCAS_SEM_FALA = new Set(["[BLANK_AUDIO]", "[ Silence ]", "[silence]"]);

function segundos(ms: number): number {
  return Math.round(ms / 10) / 100;
}

/** Converte a saída `-oj` do whisper.cpp (tempos em ms) em segmentos do app (segundos). */
export function segmentosDoJsonWhisper(json: unknown): SegmentoTranscricao[] {
  const lista = (json as { transcription?: unknown } | null)?.transcription;
  if (!Array.isArray(lista)) return [];
  const segmentos: SegmentoTranscricao[] = [];
  for (const item of lista) {
    const texto = typeof item?.text === "string" ? item.text.trim() : "";
    if (!texto || MARCAS_SEM_FALA.has(texto)) continue;
    const de = Number(item?.offsets?.from ?? 0);
    const ate = Number(item?.offsets?.to ?? de);
    segmentos.push({ i: segmentos.length, inicio: segundos(de), fim: segundos(ate), texto });
  }
  return segmentos;
}

/** "whisper_print_progress_callback: progress =  45%" → 45; outras linhas → null. */
export function progressoDaLinha(linha: string): number | null {
  const achado = /progress\s*=\s*(\d{1,3})%/.exec(linha);
  if (!achado) return null;
  return Math.min(100, Number(achado[1]));
}

export function threadsDoWhisper(nucleos: number): number {
  return Math.max(4, nucleos - 2);
}

type Execucao = { codigo: number | null; stdout: string; caudaStderr: string };

function rodar(bin: string, args: string[], aoLinhaStderr?: (linha: string) => void): Promise<Execucao> {
  return new Promise((resolve, reject) => {
    const filho = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let resto = "";
    let cauda = "";
    filho.stdout.setEncoding("utf8");
    filho.stdout.on("data", (pedaco: string) => {
      if (stdout.length < 64_000) stdout += pedaco;
    });
    filho.stderr.setEncoding("utf8");
    filho.stderr.on("data", (pedaco: string) => {
      cauda = (cauda + pedaco).slice(-2000);
      resto += pedaco;
      const linhas = resto.split(/\r\n|\r|\n/);
      resto = linhas.pop() ?? "";
      for (const linha of linhas) aoLinhaStderr?.(linha);
    });
    filho.on("error", (erro: NodeJS.ErrnoException) => {
      if (erro.code === "ENOENT") reject(new ErroEstacao(`Programa não encontrado: ${bin}`, 503));
      else reject(erro);
    });
    filho.on("close", (codigo) => {
      if (resto) aoLinhaStderr?.(resto);
      resolve({ codigo, stdout, caudaStderr: cauda.trim() });
    });
  });
}

function ultimaLinha(texto: string): string | null {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  return linhas.length ? linhas[linhas.length - 1] : null;
}

async function duracaoPeloFfprobe(ffprobeBin: string, wav: string): Promise<number | null> {
  try {
    const r = await rodar(ffprobeBin, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", wav]);
    const n = Number.parseFloat(r.stdout.trim());
    return r.codigo === 0 && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  } catch {
    return null;
  }
}

export async function transcrever(opcoes: {
  entrada: string;
  pastaTrabalho: string;
  config: ConfigTranscricao;
  aoProgresso: (percentual: number) => void;
  aoEtapa?: (etapa: EtapaTranscricao) => void;
  /** Nome dos arquivos intermediários (sem extensão). Padrão: nome do áudio. */
  nomeBase?: string;
}): Promise<ResultadoTranscricao> {
  const { entrada, pastaTrabalho, config } = opcoes;
  if (!config.modeloWhisper || !fs.existsSync(config.modeloWhisper)) {
    throw new ErroEstacao("O modelo de transcrição não foi encontrado nesta estação. Veja o README da estação.", 503);
  }
  const nomeBase = opcoes.nomeBase ?? path.basename(entrada, path.extname(entrada));
  const base = path.join(pastaTrabalho, nomeBase);
  const wav = `${base}.wav`;
  const json = `${base}.json`;

  try {
    opcoes.aoEtapa?.("convertendo");
    const conversao = await rodar(config.ffmpegBin, ["-y", "-i", entrada, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
    if (conversao.codigo !== 0) {
      throw new ErroEstacao("Não foi possível converter o áudio. O arquivo pode estar vazio ou corrompido.", 422, ultimaLinha(conversao.caudaStderr));
    }

    opcoes.aoEtapa?.("transcrevendo");
    let ultimo = -1;
    const args = ["-m", config.modeloWhisper, "-l", "pt", "-t", String(threadsDoWhisper(os.cpus().length)), "-oj", "-pp", "-of", base, wav];
    const transcricao = await rodar(config.whisperBin, args, (linha) => {
      const p = progressoDaLinha(linha);
      if (p !== null && p !== ultimo) {
        ultimo = p;
        opcoes.aoProgresso(p);
      }
    });
    if (transcricao.codigo !== 0) {
      throw new ErroEstacao(`A transcrição falhou (whisper.cpp saiu com código ${transcricao.codigo}).`, 500, ultimaLinha(transcricao.caudaStderr));
    }

    let bruto: unknown;
    try {
      bruto = JSON.parse(await fs.promises.readFile(json, "utf8"));
    } catch {
      throw new ErroEstacao("A transcrição falhou: o whisper.cpp não gerou o resultado.", 500);
    }
    const segmentos = segmentosDoJsonWhisper(bruto);
    const duracao = (await duracaoPeloFfprobe(config.ffprobeBin, wav)) ?? (segmentos.length ? segmentos[segmentos.length - 1].fim : 0);
    return { motor: `whisper.cpp ${path.basename(config.modeloWhisper)}`, duracaoSeg: duracao, segmentos };
  } finally {
    await Promise.all([fs.promises.rm(wav, { force: true }), fs.promises.rm(json, { force: true })]);
  }
}
