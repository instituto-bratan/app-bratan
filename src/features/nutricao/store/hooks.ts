// HOOKS DE DADOS DO MÓDULO NUTRIÇÃO (28/09/2026).
//
// Leitura pelo TanStack Query (como o resto do app) e salvamento automático
// com estado sempre visível. "Salvo" só aparece depois que o banco confirmou a
// gravação; conflito com outra aba aparece como conflito, nunca como salvo.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConflitoDeVersao, ouvirMudancas, type NomeDaColecao } from "./db";
import * as repo from "./repositorio";
import { garantirSemente } from "./seed";

const chaves = {
  pronto: ["nutricao", "pronto"] as const,
  pessoas: ["nutricao", "pessoas"] as const,
  pessoa: (id: string) => ["nutricao", "pessoas", id] as const,
  atendimentosDaPessoa: (id: string) => ["nutricao", "atendimentos", "pessoa", id] as const,
  atendimentos: ["nutricao", "atendimentos"] as const,
  atendimento: (id: string) => ["nutricao", "atendimentos", id] as const,
  itensUso: (id: string) => ["nutricao", "itensUso", id] as const,
  planosDaPessoa: (id: string) => ["nutricao", "planos", "pessoa", id] as const,
  planos: ["nutricao", "planos"] as const,
  plano: (id: string) => ["nutricao", "planos", id] as const,
  biblioteca: ["nutricao", "biblioteca"] as const,
  alimentos: ["nutricao", "alimentos"] as const,
  medidas: ["nutricao", "medidas"] as const,
  agenda: (data: string) => ["nutricao", "agenda", data] as const,
  config: ["nutricao", "config"] as const,
  identificacao: ["nutricao", "identificacao"] as const,
  gravacao: (id: string) => ["nutricao", "gravacoes", id] as const,
};

const PREFIXO_POR_COLECAO: Partial<Record<NomeDaColecao, readonly string[]>> = {
  pessoas: ["nutricao", "pessoas"],
  atendimentos: ["nutricao", "atendimentos"],
  itensUso: ["nutricao", "itensUso"],
  planos: ["nutricao", "planos"],
  biblioteca: ["nutricao", "biblioteca"],
  alimentos: ["nutricao", "alimentos"],
  medidas: ["nutricao", "medidas"],
  agenda: ["nutricao", "agenda"],
  gravacoes: ["nutricao", "gravacoes"],
  meta: ["nutricao"],
};

const semTempo = { staleTime: Infinity } as const;

// A semente (dados fictícios da primeira vez) roda uma vez só, e toda leitura
// espera por ela: senão uma lista lida no mesmo instante ficaria vazia.
let semente: Promise<void> | null = null;
function depoisDaSemente(): Promise<void> {
  if (!semente) {
    semente = garantirSemente().catch((erro) => {
      semente = null;
      throw erro;
    });
    void semente.then(limparAudiosSemTravar, () => undefined);
  }
  return semente;
}

// Apagar o áudio com prazo vencido não trava a leitura: se falhar, tenta de
// novo na próxima volta (a cada hora, para aba que fica aberta dias seguidos).
const UMA_HORA_MS = 60 * 60 * 1000;
function limparAudiosSemTravar() {
  return repo.limparAudiosVencidos().catch((erro) => {
    console.warn("Não consegui apagar o áudio com prazo vencido.", erro);
  });
}
const lerDepois = <T,>(ler: () => Promise<T>) => async () => {
  await depoisDaSemente();
  return ler();
};

/** Abre o banco, planta os dados fictícios na primeira vez e passa a ouvir as outras abas. */
export function useNutricaoPronta() {
  const cliente = useQueryClient();
  useEffect(
    () =>
      ouvirMudancas((aviso) => {
        const prefixo = PREFIXO_POR_COLECAO[aviso.colecao];
        if (prefixo) void cliente.invalidateQueries({ queryKey: [...prefixo] });
      }),
    [cliente],
  );
  useEffect(() => {
    const volta = window.setInterval(() => void depoisDaSemente().then(limparAudiosSemTravar, () => undefined), UMA_HORA_MS);
    return () => window.clearInterval(volta);
  }, []);
  return useQuery({ queryKey: chaves.pronto, queryFn: async () => (await depoisDaSemente(), true), ...semTempo, retry: false });
}

export function usePessoas() {
  return useQuery({ queryKey: chaves.pessoas, queryFn: lerDepois(repo.listarPessoas), ...semTempo });
}

export function usePessoa(id: string | undefined) {
  return useQuery({ queryKey: chaves.pessoa(id ?? ""), queryFn: lerDepois(() => repo.lerPessoa(id ?? "").then((p) => p ?? null)), enabled: Boolean(id), ...semTempo });
}

export function useAtendimentosDaPessoa(pessoaId: string | undefined) {
  return useQuery({ queryKey: chaves.atendimentosDaPessoa(pessoaId ?? ""), queryFn: lerDepois(() => repo.listarAtendimentosDaPessoa(pessoaId ?? "")), enabled: Boolean(pessoaId), ...semTempo });
}

export function useTodosAtendimentos() {
  return useQuery({ queryKey: chaves.atendimentos, queryFn: lerDepois(repo.listarTodosAtendimentos), ...semTempo });
}

export function useAtendimento(id: string | undefined) {
  return useQuery({ queryKey: chaves.atendimento(id ?? ""), queryFn: lerDepois(() => repo.lerAtendimento(id ?? "").then((a) => a ?? null)), enabled: Boolean(id), ...semTempo });
}

export function useItensUso(pessoaId: string | undefined) {
  return useQuery({ queryKey: chaves.itensUso(pessoaId ?? ""), queryFn: lerDepois(() => repo.listarItensUso(pessoaId ?? "")), enabled: Boolean(pessoaId), ...semTempo });
}

export function usePlanosDaPessoa(pessoaId: string | undefined) {
  return useQuery({ queryKey: chaves.planosDaPessoa(pessoaId ?? ""), queryFn: lerDepois(() => repo.listarPlanosDaPessoa(pessoaId ?? "")), enabled: Boolean(pessoaId), ...semTempo });
}

export function useTodosPlanos() {
  return useQuery({ queryKey: chaves.planos, queryFn: lerDepois(repo.listarTodosPlanos), ...semTempo });
}

export function usePlano(id: string | undefined) {
  return useQuery({ queryKey: chaves.plano(id ?? ""), queryFn: lerDepois(() => repo.lerPlano(id ?? "").then((p) => p ?? null)), enabled: Boolean(id), ...semTempo });
}

export function useBiblioteca() {
  return useQuery({ queryKey: chaves.biblioteca, queryFn: lerDepois(repo.listarBlocos), ...semTempo });
}

export function useAlimentos() {
  return useQuery({ queryKey: chaves.alimentos, queryFn: lerDepois(repo.todosOsAlimentos), ...semTempo });
}

export function useMedidas() {
  return useQuery({ queryKey: chaves.medidas, queryFn: lerDepois(repo.listarMedidas), ...semTempo });
}

export function useAgenda(data: string) {
  return useQuery({ queryKey: chaves.agenda(data), queryFn: lerDepois(() => repo.listarAgenda(data)), ...semTempo });
}

export function useConfig() {
  return useQuery({ queryKey: chaves.config, queryFn: lerDepois(repo.lerConfig), ...semTempo });
}

export function useIdentificacao() {
  return useQuery({ queryKey: chaves.identificacao, queryFn: lerDepois(repo.lerIdentificacao), ...semTempo });
}

export function useGravacao(id: string | null | undefined) {
  return useQuery({ queryKey: chaves.gravacao(id ?? ""), queryFn: lerDepois(() => repo.lerGravacao(id ?? "").then((g) => g ?? null)), enabled: Boolean(id), ...semTempo });
}

/** Depois de gravar algo, atualiza as telas desta aba. */
export function useAtualizarNutricao() {
  const cliente = useQueryClient();
  return useCallback(() => cliente.invalidateQueries({ queryKey: ["nutricao"] }), [cliente]);
}

// ------------------------------------------------------------ salvamento automático

export type EstadoSalvamento =
  | { tipo: "salvo"; em: string | null }
  | { tipo: "alterado" }
  | { tipo: "salvando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "conflito"; mensagem: string };

type ComVersao = { id: string; versao: number };

/**
 * Rascunho editável com salvamento automático ~800 ms depois da última
 * mudança. Garantias (revisão de 28/09/2026):
 * - as gravações saem em fila, uma de cada vez, cada uma com a versão lida
 *   mais recente daquele registro: nunca duas gravações disputando a versão;
 * - "Salvo" só aparece quando a ÚLTIMA mudança foi gravada; se algo foi
 *   digitado enquanto a gravação anterior acontecia, continua "por salvar";
 * - sair da tela ou trocar de registro grava na hora o que estava pendente;
 * - conflito com outra aba aparece como conflito, nunca como salvo.
 */
export function useRascunho<T extends ComVersao>(original: T | null | undefined, salvar: (registro: T, versaoLida: number | null) => Promise<T>, atrasoMs = 800) {
  const [rascunho, setRascunho] = useState<T | null>(original ?? null);
  const [estado, setEstado] = useState<EstadoSalvamento>({ tipo: "salvo", em: null });
  const ultimo = useRef<T | null>(original ?? null);
  const versoes = useRef(new Map<string, number>());
  const idCarregado = useRef<string | null>(original ? original.id : null);
  const pendente = useRef(false);
  const edicoes = useRef(0);
  const timer = useRef<number | null>(null);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;
  const atualizar = useAtualizarNutricao();
  const atualizarRef = useRef(atualizar);
  atualizarRef.current = atualizar;

  if (original && !versoes.current.has(original.id)) versoes.current.set(original.id, original.versao);

  const executar = useCallback(async (alvo: T, edicaoDoAlvo: number): Promise<T | null> => {
    const doRegistroAberto = alvo.id === idCarregado.current;
    if (doRegistroAberto) setEstado({ tipo: "salvando" });
    try {
      const salvo = await salvarRef.current(alvo, versoes.current.get(alvo.id) ?? null);
      versoes.current.set(salvo.id, salvo.versao);
      if (salvo.id === idCarregado.current) {
        if (ultimo.current && ultimo.current.id === salvo.id) ultimo.current = { ...ultimo.current, versao: salvo.versao };
        setRascunho((atual) => (atual && atual.id === salvo.id ? { ...atual, versao: salvo.versao } : atual));
        if (edicoes.current === edicaoDoAlvo) {
          pendente.current = false;
          setEstado({ tipo: "salvo", em: new Date().toISOString() });
        } else {
          setEstado({ tipo: "alterado" });
        }
      }
      void atualizarRef.current();
      return salvo;
    } catch (erro) {
      if (alvo.id === idCarregado.current) {
        if (erro instanceof ConflitoDeVersao) setEstado({ tipo: "conflito", mensagem: erro.message });
        else setEstado({ tipo: "erro", mensagem: erro instanceof Error ? erro.message : String(erro) });
      }
      return null;
    }
  }, []);

  /** Põe na fila a gravação do estado mais recente (ou do registro dado). */
  const enfileirar = useCallback(
    (registro?: T): Promise<T | null> => {
      const alvo = registro ?? ultimo.current;
      if (!alvo) return Promise.resolve(null);
      const edicaoDoAlvo = edicoes.current;
      const vez = fila.current.then(() => executar(alvo, edicaoDoAlvo));
      fila.current = vez.catch(() => undefined);
      return vez;
    },
    [executar],
  );

  const gravarPendenteAgora = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pendente.current) void enfileirar();
  }, [enfileirar]);

  // Troca de registro (outro plano, outra consulta): grava o pendente do
  // anterior e recomeça do que está no banco.
  useEffect(() => {
    if (!original) return;
    if (idCarregado.current !== original.id) {
      gravarPendenteAgora();
      idCarregado.current = original.id;
      versoes.current.set(original.id, original.versao);
      pendente.current = false;
      ultimo.current = original;
      setRascunho(original);
      setEstado({ tipo: "salvo", em: null });
      return;
    }
    // Mesmo registro, versão nova vinda do banco e nada local pendente: acompanha.
    if (!pendente.current && original.versao !== versoes.current.get(original.id)) {
      versoes.current.set(original.id, original.versao);
      ultimo.current = original;
      setRascunho(original);
    }
  }, [original, gravarPendenteAgora]);

  const alterar = useCallback(
    (mudanca: (atual: T) => T) => {
      const atual = ultimo.current;
      if (!atual) return;
      const proximo = mudanca(atual);
      if (proximo === atual) return; // nada mudou: nada a salvar
      ultimo.current = proximo;
      edicoes.current += 1;
      pendente.current = true;
      setRascunho(proximo);
      setEstado({ tipo: "alterado" });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        void enfileirar();
      }, atrasoMs);
    },
    [atrasoMs, enfileirar],
  );

  /** Grava já (antes de finalizar, copiar, gerar PDF). */
  const salvarJa = useCallback(
    async (registro?: T) => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      if (registro) {
        ultimo.current = registro;
        edicoes.current += 1;
        pendente.current = true;
        setRascunho(registro);
      }
      return enfileirar(registro);
    },
    [enfileirar],
  );

  /** Depois de um conflito: descarta o local e recarrega o que está gravado. */
  const recarregar = useCallback((registroDoBanco: T) => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    pendente.current = false;
    versoes.current.set(registroDoBanco.id, registroDoBanco.versao);
    ultimo.current = registroDoBanco;
    setRascunho(registroDoBanco);
    setEstado({ tipo: "salvo", em: null });
  }, []);

  useEffect(() => {
    const aoSair = (evento: BeforeUnloadEvent) => {
      if (pendente.current) {
        evento.preventDefault();
        evento.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, []);

  // Saiu da tela com algo digitado há menos de 800 ms: grava na hora.
  useEffect(() => () => gravarPendenteAgora(), [gravarPendenteAgora]);

  return { rascunho, alterar, salvarJa, recarregar, estado };
}
