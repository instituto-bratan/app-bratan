// CONFIGURAÇÃO DA ESTAÇÃO LOCAL (28/09/2026).
//
// Lê `tools/estacao-nutri/.env.local` (KEY=VALUE) e o ambiente; o ambiente
// ganha. O HOST é sempre 127.0.0.1: a estação nunca escuta na rede.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ConfigEstacao = {
  chaveIA: string | null;
  porta: number;
  host: "127.0.0.1";
  modeloWhisper: string;
  whisperBin: string;
  ffmpegBin: string;
  ffprobeBin: string;
  pastaDados: string;
  origensPermitidas: string[];
  modeloIA: string;
  diasRetencaoAudio: number;
  /** Coisas pedidas na configuração que a estação ignorou de propósito. */
  avisos: string[];
};

export const PORTA_PADRAO = 8787;
export const MODELO_IA_PADRAO = "claude-opus-5";
export const DIAS_RETENCAO_PADRAO = 7;
export const NOME_MODELO_WHISPER = "ggml-large-v3-turbo-q5_0.bin";
export const ORIGENS_PADRAO = [
  "http://127.0.0.1:5174",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

const PASTA_DA_ESTACAO = path.dirname(fileURLToPath(import.meta.url));

/** Parser simples de KEY=VALUE: ignora linhas vazias, comentários e linhas sem "=". */
export function lerArquivoEnv(texto: string): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    const igual = linha.indexOf("=");
    if (igual <= 0) continue;
    const chave = linha.slice(0, igual).trim().replace(/^export\s+/, "");
    let valor = linha.slice(igual + 1).trim();
    const aspas = valor[0];
    if ((aspas === '"' || aspas === "'") && valor.length >= 2 && valor.endsWith(aspas)) {
      valor = valor.slice(1, -1);
    } else {
      valor = valor.replace(/\s+#.*$/, "").trim();
    }
    if (chave) valores[chave] = valor;
  }
  return valores;
}

function expandirHome(caminho: string, home: string): string {
  if (caminho === "~") return home;
  if (caminho.startsWith("~/")) return path.join(home, caminho.slice(2));
  return caminho;
}

function inteiroPositivo(valor: string | undefined, padrao: number, maximo: number): number {
  if (valor === undefined) return padrao;
  if (!/^\d+$/.test(valor.trim())) return padrao;
  const n = Number(valor);
  return n >= 1 && n <= maximo ? n : padrao;
}

/** Monta a configuração a partir de um ambiente e do texto do .env.local (testável). */
export function montarConfig(opcoes: {
  env: Record<string, string | undefined>;
  textoArquivo?: string;
  home?: string;
  existe?: (caminho: string) => boolean;
}): ConfigEstacao {
  const home = opcoes.home ?? os.homedir();
  const existe = opcoes.existe ?? ((caminho: string) => fs.existsSync(caminho));
  const doArquivo = lerArquivoEnv(opcoes.textoArquivo ?? "");
  const valor = (chave: string): string | undefined => {
    const doAmbiente = opcoes.env[chave];
    if (doAmbiente !== undefined && doAmbiente.trim() !== "") return doAmbiente.trim();
    const arquivo = doArquivo[chave];
    return arquivo !== undefined && arquivo !== "" ? arquivo : undefined;
  };

  const avisos: string[] = [];
  const hostPedido = valor("HOST");
  if (hostPedido !== undefined && hostPedido !== "127.0.0.1") {
    avisos.push(`HOST=${hostPedido} ignorado: a estação só escuta em 127.0.0.1.`);
  }

  const pastaDados = expandirHome(valor("PASTA_DADOS") ?? path.join(home, "Library", "Application Support", "EstacaoNutri"), home);

  let modeloWhisper = valor("MODELO_WHISPER");
  if (modeloWhisper !== undefined) {
    modeloWhisper = expandirHome(modeloWhisper, home);
  } else {
    const turbo = path.join(pastaDados, "modelos", NOME_MODELO_WHISPER);
    const reservas = [
      path.join(pastaDados, "modelos", "ggml-small.bin"),
      path.join(home, "Documents", "Codex", "2026-06-24", "jarvis", "data", "whisper", "ggml-small.bin"),
    ];
    modeloWhisper = existe(turbo) ? turbo : (reservas.find((r) => existe(r)) ?? turbo);
  }

  const ffmpegBin = expandirHome(valor("FFMPEG_BIN") ?? "/opt/homebrew/bin/ffmpeg", home);
  // ffprobe (duração do áudio) mora ao lado do ffmpeg; é opcional.
  const ffprobeBin = path.basename(ffmpegBin) === "ffmpeg" ? path.join(path.dirname(ffmpegBin), "ffprobe") : "ffprobe";

  const origens = (valor("ORIGENS_PERMITIDAS") ?? ORIGENS_PADRAO.join(","))
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter((o) => o !== "");

  return {
    chaveIA: valor("ANTHROPIC_API_KEY") ?? null,
    porta: inteiroPositivo(valor("PORTA"), PORTA_PADRAO, 65535),
    host: "127.0.0.1",
    modeloWhisper,
    whisperBin: expandirHome(valor("WHISPER_BIN") ?? "/opt/homebrew/bin/whisper-cli", home),
    ffmpegBin,
    ffprobeBin,
    pastaDados,
    origensPermitidas: origens,
    modeloIA: valor("MODELO_IA") ?? MODELO_IA_PADRAO,
    diasRetencaoAudio: inteiroPositivo(valor("DIAS_RETENCAO_AUDIO"), DIAS_RETENCAO_PADRAO, 3650),
    avisos,
  };
}

/** Configuração real: `.env.local` ao lado deste arquivo mais process.env. */
export function carregarConfig(): ConfigEstacao {
  let textoArquivo = "";
  try {
    textoArquivo = fs.readFileSync(path.join(PASTA_DA_ESTACAO, ".env.local"), "utf8");
  } catch {
    // sem .env.local: só o ambiente e os padrões
  }
  return montarConfig({ env: process.env, textoArquivo });
}
