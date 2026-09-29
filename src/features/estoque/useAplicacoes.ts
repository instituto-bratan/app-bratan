// Hook da ficha de aplicação (29/09/2026). Logado: lê a tabela e grava pelas
// funções do banco (aplicação + saída do estoque numa transação só). No modo
// prévia (sem banco) tudo vive no aparelho, como nos outros módulos — e a
// saída do estoque é lançada no estoque local, para o saldo mexer igual.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import {
  estornarRemoteAplicacao,
  listRemoteAplicacoes,
  listRemoteAplicacoesDoPaciente,
  registrarRemoteAplicacao,
  type RespostaRegistro,
} from "@/lib/remoteData";
import {
  aplicacaoDoRascunho,
  movimentosDaAplicacao,
  movimentosDoEstorno,
  type EnfermagemAplicacao,
  type RascunhoAplicacao,
} from "./aplicacaoData";
import type { EstoqueItem, EstoqueMovimento } from "./estoqueData";

const chaveLocal = "app-bratan-enfermagem-aplicacoes";

/** A janela da lista: 45 dias bastam para trocar de dia e conferir a semana. */
function desdeJanela() {
  const data = new Date();
  data.setDate(data.getDate() - 45);
  return data.toISOString();
}

export function useAplicacoes(opcoes: { contactRef?: string; ativo?: boolean } = {}) {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const ativo = opcoes.ativo ?? true;
  const queryClient = useQueryClient();
  const [locais, setLocais] = useState<EnfermagemAplicacao[]>(() => readLocalValue<EnfermagemAplicacao[]>(chaveLocal, []));

  const listaQuery = useQuery({
    queryKey: opcoes.contactRef ? ["enfermagem-aplicacoes", "paciente", opcoes.contactRef] : ["enfermagem-aplicacoes", "janela"],
    queryFn: () => (opcoes.contactRef ? listRemoteAplicacoesDoPaciente(opcoes.contactRef) : listRemoteAplicacoes(desdeJanela())),
    enabled: useRemote && ativo,
    staleTime: 30_000,
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["enfermagem-aplicacoes"] });
    // A saída nasceu no banco junto com a aplicação: o Estoque precisa recarregar.
    void queryClient.invalidateQueries({ queryKey: ["estoque-moves"] });
  };

  const registrarMutation = useMutation({
    mutationFn: (entrada: { id: string; rascunho: RascunhoAplicacao; liberacao: { motivo: string; senhaGestor: string } | null }) =>
      registrarRemoteAplicacao(entrada.id, entrada.rascunho, entrada.liberacao),
    onSuccess: (resposta) => {
      if (resposta.ok) invalidar();
    },
  });
  const estornarMutation = useMutation({
    mutationFn: (entrada: { id: string; motivo: string }) => estornarRemoteAplicacao(entrada.id, entrada.motivo),
    onSuccess: invalidar,
  });

  const lista = useRemote ? (listaQuery.data ?? []) : opcoes.contactRef ? locais.filter((apl) => apl.contactRef === opcoes.contactRef) : locais;

  /**
   * Registra. Devolve a resposta do banco: ok, ou os problemas de estoque que
   * pedem a liberação da gestão. Erro de preenchimento/permissão sobe como
   * exceção com a frase do banco — a tela mostra.
   */
  async function registrar(
    id: string,
    rascunho: RascunhoAplicacao,
    contexto: {
      liberacao: { motivo: string; senhaGestor: string; comoLocal: "GESTAO_LOGADA" | "SENHA_GESTOR" } | null;
      items: EstoqueItem[];
      createMoveLocal: (move: EstoqueMovimento) => Promise<void>;
    },
  ): Promise<RespostaRegistro> {
    if (useRemote) {
      return registrarMutation.mutateAsync({
        id,
        rascunho,
        liberacao: contexto.liberacao ? { motivo: contexto.liberacao.motivo, senhaGestor: contexto.liberacao.senhaGestor } : null,
      });
    }
    const aplicacao = aplicacaoDoRascunho(id, rascunho, {
      items: contexto.items,
      aplicadoPorNome: pessoa?.nome ?? "Modo prévia",
      agoraISO: new Date().toISOString(),
      liberacao: contexto.liberacao ? { motivo: contexto.liberacao.motivo, como: contexto.liberacao.comoLocal } : null,
    });
    for (const move of movimentosDaAplicacao(aplicacao)) await contexto.createMoveLocal(move);
    setLocais((atual) => {
      const proximas = [aplicacao, ...atual];
      writeLocalValue(chaveLocal, proximas);
      return proximas;
    });
    return { ok: true, liberado: aplicacao.estoqueLiberado };
  }

  async function estornar(aplicacao: EnfermagemAplicacao, motivo: string, createMoveLocal: (move: EstoqueMovimento) => Promise<void>) {
    if (useRemote) {
      await estornarMutation.mutateAsync({ id: aplicacao.id, motivo });
      return;
    }
    const agora = new Date().toISOString();
    for (const move of movimentosDoEstorno(aplicacao, motivo, todayISO(), agora)) await createMoveLocal(move);
    setLocais((atual) => {
      const proximas = atual.map((apl) => (apl.id === aplicacao.id ? { ...apl, estornadoEm: agora, estornoMotivo: motivo.trim() } : apl));
      writeLocalValue(chaveLocal, proximas);
      return proximas;
    });
  }

  return {
    aplicacoes: lista,
    carregando: useRemote && ativo && listaQuery.isLoading,
    erroAoCarregar: useRemote && listaQuery.isError ? (listaQuery.error as Error)?.message || "Não consegui ler as aplicações." : "",
    syncMode: useRemote ? "Supabase" : "Somente local",
    registrar,
    estornar,
  };
}
