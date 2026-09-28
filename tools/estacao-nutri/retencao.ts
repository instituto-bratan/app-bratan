// RETENÇÃO DOS ÁUDIOS (28/09/2026).
//
// Áudio de consulta fica no Mac só pelo prazo configurado (DIAS_RETENCAO_AUDIO,
// padrão 7). A estação confere ao ligar e depois a cada hora.
import fs from "node:fs";
import path from "node:path";

const DIA_MS = 24 * 60 * 60 * 1000;

export function arquivosParaApagar(arquivos: { caminho: string; modificadoEm: number }[], agoraMs: number, dias: number): string[] {
  const limite = agoraMs - dias * DIA_MS;
  return arquivos.filter((a) => a.modificadoEm < limite).map((a) => a.caminho);
}

/** Apaga os arquivos (não as subpastas) de `pasta` mais velhos que `dias`. Devolve o que apagou. */
export async function aplicarRetencao(pasta: string, dias: number, agoraMs: number = Date.now()): Promise<string[]> {
  let nomes: fs.Dirent[];
  try {
    nomes = await fs.promises.readdir(pasta, { withFileTypes: true });
  } catch {
    return [];
  }
  const arquivos: { caminho: string; modificadoEm: number }[] = [];
  for (const entrada of nomes) {
    if (!entrada.isFile()) continue;
    const caminho = path.join(pasta, entrada.name);
    try {
      const info = await fs.promises.stat(caminho);
      arquivos.push({ caminho, modificadoEm: info.mtimeMs });
    } catch {
      // sumiu entre a listagem e a leitura: nada a fazer
    }
  }
  const apagar = arquivosParaApagar(arquivos, agoraMs, dias);
  const apagados: string[] = [];
  for (const caminho of apagar) {
    try {
      await fs.promises.rm(caminho, { force: true });
      apagados.push(caminho);
    } catch {
      // sem permissão ou em uso: tenta de novo na próxima rodada
    }
  }
  return apagados;
}
