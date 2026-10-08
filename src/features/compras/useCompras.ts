// Hook dos PEDIDOS DE COMPRA (06/10/2026): remoto quando logado; no modo
// prévia (sem banco) tudo vive no aparelho, com pedidos de exemplo — mesmo
// padrão de useEstoque.
//
// Regra da casa (auditoria de 29/09): gravação que falha APARECE NA TELA. Cada
// ação devolve o pedido gravado, ou null quando não gravou — e nesse caso já
// mostrou o aviso com o motivo (as frases do banco vêm em português). Nunca
// rejeita, para quem chama não precisar de try/catch.
//
// O passo COMPRAR não mora aqui: a compra é gravada pelo Financeiro em
// fin_purchases com pedido_ref, e o gatilho do banco muda o pedido. O
// aposRegistrarCompra() só atualiza a tela (e, na prévia, faz o papel do
// gatilho).
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import {
  cancelarRemotePedidoDeCompra,
  decidirRemotePedidoDeCompra,
  decidirRemotePedidoDeCompraAoSair,
  enviarRemotePedidoDeCompra,
  listRemotePedidosDeCompra,
  receberRemotePedidoDeCompra,
  subscribeRemotePedidosDeCompra,
  type DecisaoDoPedido,
} from "@/lib/remoteData";
import type { EstoqueItem, EstoqueMovimento } from "@/features/estoque/estoqueData";
import { finPurchasesStorageKey, type FinPurchase } from "@/features/financeiro/financeiroData";
import {
  aplicarAcao,
  movimentosDoRecebimento,
  novoIdDePedido,
  ordenarPedidos,
  pedidosDeExemplo,
  validarPedido,
  type AtorDoPedido,
  type DadosDaAcao,
  type PedidoAcao,
  type PedidoCompra,
  type RascunhoPedido,
  type Recebimento,
} from "./comprasData";

// 08/10/2026: exportada para o contador da casca nova ler, na prévia, a mesma
// lista de pedidos que a tela mostra.
export const pedidosKey = "app-bratan-compras-pedidos";
// A mesma chave de useEstoque: na prévia, o recebimento também dá a entrada no estoque local.
const estoqueMovesKey = "app-bratan-estoque-moves";
const queryKey = ["compras-pedidos"] as const;

type ItemDoEstoque = Pick<EstoqueItem, "id" | "nome" | "unidade" | "setor">;

/** A frase do aviso: a do banco quando ela existe; rede e permissão em português. */
export function mensagemDoErroDoPedido(oque: string, error: unknown) {
  const bruto =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(bruto)) {
    return `${oque}: sem conexão com o servidor. Confira a internet e tente de novo.`;
  }
  if (/row-level security|permission denied/i.test(bruto)) {
    return `${oque}: você não tem permissão para isso.`;
  }
  return bruto ? `${oque}: ${bruto}` : `${oque}: o servidor não aceitou. Tente de novo.`;
}

function avisarErro(oque: string, error: unknown) {
  console.warn(`${oque} não foi gravado.`, error);
  toast(mensagemDoErroDoPedido(oque, error), { tom: "erro", duracaoMs: 9000 });
}

export function useCompras() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const queryClient = useQueryClient();
  // O token da sessão à mão, sem await: decidirAoSair roda no descarregamento da página.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.access_token ?? null;

  const [localPedidos, setLocalPedidos] = useState<PedidoCompra[]>(() =>
    readLocalValue<PedidoCompra[]>(pedidosKey, pedidosDeExemplo(todayISO())),
  );
  // A lista mais nova, para duas ações seguidas não partirem da mesma foto.
  const localRef = useRef(localPedidos);
  localRef.current = localPedidos;

  const pedidosQuery = useQuery({ queryKey, queryFn: listRemotePedidosDeCompra, enabled: useRemote, staleTime: 30_000 });

  // Erro de leitura também aparece (uma vez por erro), não só no console.
  const ultimoErroDeLeitura = useRef<unknown>(null);
  useEffect(() => {
    if (pedidosQuery.error && pedidosQuery.error !== ultimoErroDeLeitura.current) {
      ultimoErroDeLeitura.current = pedidosQuery.error;
      console.warn("Pedidos de compra não carregaram.", pedidosQuery.error);
      toast(mensagemDoErroDoPedido("Não consegui carregar os pedidos de compra", pedidosQuery.error), { tom: "erro", duracaoMs: 9000 });
    }
  }, [pedidosQuery.error]);

  // Tempo real: alguém pediu, decidiu ou recebeu → a lista recarrega sozinha.
  useEffect(() => {
    if (!useRemote) return undefined;
    let desligar: (() => void) | null = null;
    try {
      desligar = subscribeRemotePedidosDeCompra(() => {
        void queryClient.invalidateQueries({ queryKey });
      });
    } catch (error) {
      console.warn("Tempo real dos pedidos de compra indisponível.", error);
    }
    return () => desligar?.();
  }, [useRemote, queryClient]);

  const invalidar = (comEstoque = false) => {
    void queryClient.invalidateQueries({ queryKey });
    if (comEstoque) {
      // O recebimento dá entrada no estoque e o gatilho carimba o "Chegou" da compra.
      void queryClient.invalidateQueries({ queryKey: ["estoque-moves"] });
      void queryClient.invalidateQueries({ queryKey: ["estoque-compras"] });
      void queryClient.invalidateQueries({ queryKey: ["fin-purchases"] });
    }
  };

  /** Troca o pedido na lista em memória (resposta do banco) antes de a releitura chegar. */
  const colocarNoCache = (pedido: PedidoCompra) => {
    queryClient.setQueryData<PedidoCompra[]>(queryKey, (atual) => {
      const lista = atual ?? [];
      return lista.some((existente) => existente.id === pedido.id)
        ? lista.map((existente) => (existente.id === pedido.id ? pedido : existente))
        : [pedido, ...lista];
    });
  };

  const enviarMutation = useMutation({
    mutationFn: ({ id, rascunho }: { id: string; rascunho: RascunhoPedido }) => enviarRemotePedidoDeCompra(id, rascunho),
  });
  const decidirMutation = useMutation({
    mutationFn: ({ id, decisao, nota }: { id: string; decisao: DecisaoDoPedido; nota: string }) => decidirRemotePedidoDeCompra(id, decisao, nota),
  });
  const cancelarMutation = useMutation({
    mutationFn: ({ id, nota }: { id: string; nota: string }) => cancelarRemotePedidoDeCompra(id, nota),
  });
  const receberMutation = useMutation({
    mutationFn: ({ id, recebimento }: { id: string; recebimento: Recebimento }) => receberRemotePedidoDeCompra(id, recebimento),
  });

  const ator: AtorDoPedido = {
    id: pessoa?.id ?? null,
    nome: pessoa?.nome ?? "",
    cargo: pessoa?.cargo ?? null,
    acessos: pessoa?.acessos ?? null,
  };

  function gravarLocal(proximos: PedidoCompra[]) {
    localRef.current = proximos;
    setLocalPedidos(proximos);
    writeLocalValue(pedidosKey, proximos);
  }

  /** Modo prévia/local: a mesma máquina do banco, aplicada no aparelho. */
  function aplicarLocal(oque: string, pedido: PedidoCompra | null, acao: PedidoAcao, dados: DadosDaAcao): PedidoCompra | null {
    const resultado = aplicarAcao(pedido, acao, ator, new Date().toISOString(), dados);
    if (!resultado.ok) {
      toast(`${oque}: ${resultado.erro}`, { tom: "erro", duracaoMs: 9000 });
      return null;
    }
    const lista = localRef.current;
    const proximos = lista.some((existente) => existente.id === resultado.pedido.id)
      ? lista.map((existente) => (existente.id === resultado.pedido.id ? resultado.pedido : existente))
      : [resultado.pedido, ...lista];
    gravarLocal(proximos);
    return resultado.pedido;
  }

  /**
   * Envia o pedido novo, ou reenvia o devolvido (passe o pedido em `existente`).
   * `opcoes.id` (07/10/2026): o id do pedido NOVO, gerado UMA vez pelo
   * formulário. Antes cada toque em "Enviar" gerava um cped- novo, então a
   * resposta perdida no 4G ("sem conexão… tente de novo") virava um segundo
   * pedido idêntico no banco. Com o mesmo id, o banco devolve o que já gravou.
   */
  async function enviar(
    rascunho: RascunhoPedido,
    existente: PedidoCompra | null = null,
    opcoes: { itensDoEstoque?: ItemDoEstoque[]; id?: string } = {},
  ): Promise<PedidoCompra | null> {
    const oque = existente ? "Reenviar o pedido" : "Enviar o pedido";
    const problemas = validarPedido(rascunho, opcoes.itensDoEstoque);
    if (problemas.length) {
      toast(`${oque}: ${problemas[0]}`, { tom: "atencao", duracaoMs: 7000 });
      return null;
    }
    const id = existente?.id ?? opcoes.id ?? novoIdDePedido();
    if (!useRemote) {
      // Mesmo id já na lista (o formulário reenviou): a máquina devolve o que está lá.
      const jaGravado = existente ?? localRef.current.find((pedido) => pedido.id === id) ?? null;
      const numero = Math.max(0, ...localRef.current.map((pedido) => pedido.numero ?? 0)) + 1;
      return aplicarLocal(oque, jaGravado, existente ? "REENVIAR" : "ENVIAR", {
        rascunho,
        novo: { id, numero },
        itensDoEstoque: opcoes.itensDoEstoque,
      });
    }
    try {
      const pedido = await enviarMutation.mutateAsync({ id, rascunho });
      colocarNoCache(pedido);
      invalidar();
      return pedido;
    } catch (error) {
      avisarErro(oque, error);
      return null;
    }
  }

  /** Aprovar (nota opcional), devolver ou recusar (motivo obrigatório, ≥ 3 letras). */
  async function decidir(pedido: PedidoCompra, decisao: DecisaoDoPedido, nota = ""): Promise<PedidoCompra | null> {
    const oque = decisao === "APROVAR" ? "Aprovar o pedido" : decisao === "DEVOLVER" ? "Devolver o pedido" : "Recusar o pedido";
    if (!useRemote) return aplicarLocal(oque, pedido, decisao, { nota });
    try {
      const gravado = await decidirMutation.mutateAsync({ id: pedido.id, decisao, nota });
      colocarNoCache(gravado);
      invalidar();
      return gravado;
    } catch (error) {
      avisarErro(oque, error);
      return null;
    }
  }

  /**
   * A decisão que sai MESMO com a aba fechando (07/10/2026): fetch com
   * keepalive (decidirRemotePedidoDeCompraAoSair). Devolve false quando não dá
   * para mandar assim (prévia, sem sessão) — aí quem chama usa o decidir
   * comum, que na prévia grava na hora, sem rede.
   */
  function decidirAoSair(pedido: PedidoCompra, decisao: DecisaoDoPedido, nota = ""): boolean {
    const token = tokenRef.current;
    if (!useRemote || !token) return false;
    const oque = decisao === "APROVAR" ? "Aprovar o pedido" : decisao === "DEVOLVER" ? "Devolver o pedido" : "Recusar o pedido";
    void decidirRemotePedidoDeCompraAoSair(pedido.id, decisao, nota, token)
      .then(() => invalidar())
      .catch((error) => avisarErro(oque, error));
    return true;
  }

  async function cancelar(pedido: PedidoCompra, nota = ""): Promise<PedidoCompra | null> {
    const oque = "Cancelar o pedido";
    if (!useRemote) return aplicarLocal(oque, pedido, "CANCELAR", { nota });
    try {
      const gravado = await cancelarMutation.mutateAsync({ id: pedido.id, nota });
      colocarNoCache(gravado);
      invalidar();
      return gravado;
    } catch (error) {
      avisarErro(oque, error);
      return null;
    }
  }

  /** "Chegou? Confirmar recebimento": grava o que chegou e dá a entrada no estoque do setor. */
  async function receber(
    pedido: PedidoCompra,
    recebimento: Recebimento,
    opcoes: { itensDoEstoque?: ItemDoEstoque[] } = {},
  ): Promise<PedidoCompra | null> {
    const oque = "Confirmar o recebimento";
    if (!useRemote) {
      const atuais = readLocalValue<EstoqueMovimento[]>(estoqueMovesKey, []);
      const recebido = aplicarLocal(oque, pedido, "RECEBER", { recebimento, itensDoEstoque: opcoes.itensDoEstoque, movesDoEstoque: atuais });
      if (recebido && pedido.status !== "RECEBIDO") {
        // Na prévia o estoque também é local: a entrada nasce aqui, igual ao
        // banco — e o que já entrou desta compra pelo Estoque não entra de novo.
        const novos = movimentosDoRecebimento(recebido, recebimento, todayISO(), new Date().toISOString(), opcoes.itensDoEstoque, atuais);
        if (novos.length) {
          const ids = new Set(atuais.map((mov) => mov.id));
          writeLocalValue(estoqueMovesKey, [...novos.filter((mov) => !ids.has(mov.id)), ...atuais]);
        }
        // O "Chegou" da compra (07/10/2026), como compra_pedido_receber no banco:
        // pedido só com item escrito à mão não gera entrada, e a compra ficava
        // "prevista" para sempre na Fila do Financeiro.
        if (recebido.compraRef) {
          const compras = readLocalValue<FinPurchase[]>(finPurchasesStorageKey, []);
          if (compras.some((compra) => compra.id === recebido.compraRef && !compra.receivedAt)) {
            writeLocalValue(
              finPurchasesStorageKey,
              compras.map((compra) => (compra.id === recebido.compraRef && !compra.receivedAt ? { ...compra, receivedAt: todayISO() } : compra)),
            );
          }
        }
      }
      return recebido;
    }
    try {
      const gravado = await receberMutation.mutateAsync({ id: pedido.id, recebimento });
      colocarNoCache(gravado);
      invalidar(true);
      return gravado;
    } catch (error) {
      avisarErro(oque, error);
      return null;
    }
  }

  /**
   * Depois que o Financeiro gravou a compra do pedido (fin_purchases com
   * pedido_ref): no banco o gatilho já mudou o pedido — aqui só recarrega. Na
   * prévia, faz o papel do gatilho (APROVADO → COMPRADO). Devolve false só
   * quando, na prévia, a máquina recusou (e aí já avisou na tela).
   */
  function aposRegistrarCompra(
    pedido: PedidoCompra,
    compra: { compraRef: string; fornecedor: string; valorFinal: number | null; previsaoEntrega: string | null },
  ): boolean {
    if (useRemote) {
      invalidar(true);
      return true;
    }
    return aplicarLocal("Registrar a compra do pedido", pedido, "COMPRAR", { compra }) !== null;
  }

  /**
   * Depois que o Financeiro EXCLUIU uma compra (07/10/2026). No banco o gatilho
   * compra_pedido_compra_mudou devolve o pedido COMPRADO com esta compra para
   * APROVADO — aqui só recarrega. Na prévia nada fazia esse papel: o pedido
   * ficava "comprado · a caminho" apontando para uma compra que não existia.
   */
  function aposExcluirCompra(compra: Pick<FinPurchase, "id" | "pedidoRef">) {
    if (useRemote) {
      invalidar();
      return;
    }
    const pedido = localRef.current.find(
      (existente) => (compra.pedidoRef && existente.id === compra.pedidoRef) || existente.compraRef === compra.id,
    );
    if (!pedido) return;
    aplicarLocal("Desfazer a compra do pedido", pedido, "DESFAZER_COMPRA", {
      compra: { compraRef: compra.id, fornecedor: "", valorFinal: null, previsaoEntrega: null },
    });
  }

  /** Releitura manual (botão "atualizar" ou depois de voltar à aba). */
  function recarregar() {
    if (useRemote) invalidar();
  }

  const pedidos = useMemo(
    () => ordenarPedidos(useRemote ? (pedidosQuery.data ?? []) : localPedidos),
    [useRemote, pedidosQuery.data, localPedidos],
  );

  return {
    pedidos,
    ator,
    carregando: useRemote && pedidosQuery.isLoading,
    erroDeLeitura: useRemote && pedidosQuery.error ? mensagemDoErroDoPedido("Não consegui carregar os pedidos", pedidosQuery.error) : null,
    salvando: enviarMutation.isPending || decidirMutation.isPending || cancelarMutation.isPending || receberMutation.isPending,
    syncMode: useRemote ? "Supabase" : "Somente local",
    ehLocal: !useRemote,
    enviar,
    decidir,
    decidirAoSair,
    cancelar,
    receber,
    aposRegistrarCompra,
    aposExcluirCompra,
    recarregar,
  };
}
