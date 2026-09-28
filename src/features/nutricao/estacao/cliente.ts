// CONVERSA COM A ESTAÇÃO LOCAL (28/09/2026).
//
// A estação roda no Mac da Dra. Géssica (tools/estacao-nutri) e faz o que o
// navegador não faz: transcreve o áudio com o whisper.cpp sem o áudio sair do
// computador, pede à IA a organização da consulta sem expor a chave e imprime
// o PDF com o Chrome. Se a estação estiver desligada, o módulo continua
// funcionando à mão; só essas três coisas ficam indisponíveis.
import { isSupabaseConfigured } from "@/lib/supabase";
import { useEffect, useState } from "react";
import type { RespostaOrganizacao } from "../dominio/esquemaOrganizacao";
import type { SegmentoTranscricao } from "../dominio/tipos";

const BASE = ((import.meta.env.VITE_ESTACAO_URL as string | undefined) || "http://127.0.0.1:8787").replace(/\/$/, "");

export type SaudeDaEstacao = {
  ok: boolean;
  versao: string;
  whisper: { pronto: boolean; modelo: string | null };
  ffmpeg: boolean;
  chrome: boolean;
  ia: { configurada: boolean; modelo: string };
};

/**
 * O que fazer quando a estação não responde. No APP BRATAN publicado ela foi
 * instalada pelo instalador e liga sozinha; no modo demonstração, abre-se à mão.
 */
export const COMO_RELIGAR_ESTACAO = isSupabaseConfigured
  ? "Reinicie o Mac. Se continuar: no Chrome, clique no ícone à esquerda do endereço, abra “Configurações do site” e permita o acesso a apps deste computador; ou dê dois cliques de novo em “Instalar.command”. Se nada resolver, avise o Lucas."
  : "Abra “Iniciar Estação” no Mac (tools/estacao-nutri) e tente de novo.";

export class EstacaoIndisponivel extends Error {
  constructor() {
    super(`A estação local não respondeu. ${COMO_RELIGAR_ESTACAO}`);
    this.name = "EstacaoIndisponivel";
  }
}

async function chamar(caminho: string, init?: RequestInit): Promise<Response> {
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}${caminho}`, init);
  } catch {
    throw new EstacaoIndisponivel();
  }
  if (!resposta.ok) {
    let mensagem = `A estação respondeu ${resposta.status}.`;
    try {
      const corpo = await resposta.json();
      if (corpo?.erro) mensagem = String(corpo.erro);
    } catch {
      /* corpo não era JSON */
    }
    throw new Error(mensagem);
  }
  return resposta;
}

export async function saude(): Promise<SaudeDaEstacao> {
  const controle = new AbortController();
  const limite = window.setTimeout(() => controle.abort(), 2500);
  try {
    return (await (await chamar("/saude", { signal: controle.signal })).json()) as SaudeDaEstacao;
  } finally {
    window.clearTimeout(limite);
  }
}

export async function enviarAudio(gravacaoId: string, audio: Blob): Promise<{ jobId: string }> {
  const resposta = await chamar(`/transcricoes?gravacao=${encodeURIComponent(gravacaoId)}`, {
    method: "POST",
    headers: { "Content-Type": audio.type || "application/octet-stream" },
    body: audio,
  });
  return resposta.json();
}

export type EstadoDaTranscricao = {
  estado: "convertendo" | "transcrevendo" | "pronta" | "erro";
  progresso: number;
  erro: string | null;
  resultado: { motor: string; duracaoSeg: number; segmentos: SegmentoTranscricao[] } | null;
};

export async function estadoDaTranscricao(jobId: string): Promise<EstadoDaTranscricao> {
  return (await chamar(`/transcricoes/${encodeURIComponent(jobId)}`)).json();
}

export async function apagarAudioNaEstacao(gravacaoId: string): Promise<void> {
  await chamar(`/audios/${encodeURIComponent(gravacaoId)}`, { method: "DELETE" });
}

export type PedidoDeOrganizacao = {
  pessoa: { nome: string };
  data: string;
  segmentos: SegmentoTranscricao[];
  itensRegistrados: { id: string; nome: string; prescricao: string }[];
  anterior: { data: string; linhas: { campo: string; texto: string }[] } | null;
};

export type RespostaDaOrganizacao = { resposta: RespostaOrganizacao; modelo: string; uso: { entrada: number; saida: number; custoUsd: number }; duracaoMs: number };

export async function organizar(pedido: PedidoDeOrganizacao): Promise<RespostaDaOrganizacao> {
  return (await chamar("/organizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pedido) })).json();
}

export async function gerarPdfNaEstacao(html: string): Promise<Blob> {
  const resposta = await chamar("/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html }) });
  return resposta.blob();
}

/** Consulta a estação a cada 15 s e quando a janela volta ao foco. */
export function useEstacao() {
  const [estado, setEstado] = useState<{ carregando: boolean; saude: SaudeDaEstacao | null }>({ carregando: true, saude: null });
  useEffect(() => {
    let vivo = true;
    const verificar = async () => {
      try {
        const s = await saude();
        if (vivo) setEstado({ carregando: false, saude: s });
      } catch {
        if (vivo) setEstado({ carregando: false, saude: null });
      }
    };
    void verificar();
    const intervalo = window.setInterval(verificar, 15000);
    window.addEventListener("focus", verificar);
    return () => {
      vivo = false;
      window.clearInterval(intervalo);
      window.removeEventListener("focus", verificar);
    };
  }, []);
  return estado;
}

/** Espera a transcrição ficar pronta, informando o progresso. */
export async function aguardarTranscricao(jobId: string, aoProgresso: (e: EstadoDaTranscricao) => void, intervaloMs = 1500): Promise<EstadoDaTranscricao> {
  for (;;) {
    const e = await estadoDaTranscricao(jobId);
    aoProgresso(e);
    if (e.estado === "pronta" || e.estado === "erro") return e;
    await new Promise((r) => window.setTimeout(r, intervaloMs));
  }
}
