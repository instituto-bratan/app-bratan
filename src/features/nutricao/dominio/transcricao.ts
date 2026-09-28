// TRANSCRIÇÃO EM MAIS DE UM TRECHO (28/09/2026).
//
// Cada vez que ela grava de novo depois de encerrar, nasce uma gravação
// própria (um arquivo só por gravação: juntar dois arquivos de áudio num só
// fazia o fim da consulta sumir). A transcrição do trecho novo entra depois da
// que já existe, com os minutos contados do começo da consulta e índices que
// continuam, para as falas de origem já aceitas seguirem apontando certo.
// Anotações coladas também entram no fim, pelo mesmo motivo.
import type { Atendimento, Id, Transcricao } from "./tipos";

export function juntarTranscricoes(atual: Transcricao | null, nova: Transcricao): Transcricao {
  if (!atual || atual.segmentos.length === 0) return nova;
  const deslocamento = atual.duracaoSeg;
  const proximoIndice = atual.segmentos.reduce((m, s) => Math.max(m, s.i), -1) + 1;
  return {
    geradaEm: nova.geradaEm,
    motor: nova.motor === atual.motor ? atual.motor : `${atual.motor} + ${nova.motor}`,
    duracaoSeg: atual.duracaoSeg + nova.duracaoSeg,
    segmentos: [
      ...atual.segmentos,
      ...nova.segmentos.map((s, k) => ({ i: proximoIndice + k, inicio: s.inicio + deslocamento, fim: s.fim + deslocamento, texto: s.texto })),
    ],
    // Transcrição de antes da lista existir continua sem ela (não se sabe o que contém).
    ...(atual.gravacoes ? { gravacoes: [...atual.gravacoes, ...(nova.gravacoes ?? [])] } : {}),
  };
}

/**
 * A gravação guardada que ainda não entrou na transcrição (transcrição que
 * falhou, ou página recarregada no meio de um trecho). Enquanto houver uma,
 * a tela oferece "Transcrever" em vez de começar outro trecho, para nenhuma
 * gravação ficar de fora.
 */
export function gravacaoPendente(at: Pick<Atendimento, "gravacaoId" | "transcricao">): Id | null {
  if (!at.gravacaoId) return null;
  if (!at.transcricao) return at.gravacaoId;
  if (!at.transcricao.gravacoes) return null;
  return at.transcricao.gravacoes.includes(at.gravacaoId) ? null : at.gravacaoId;
}
