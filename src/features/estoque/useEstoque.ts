// Hook do Estoque: remoto quando logado; no modo prévia (sem banco) tudo vive
// no aparelho — mesmo padrão dos outros módulos.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { readLocalValue, writeLocalValue } from "@/lib/localStore";
import {
  createRemoteEstoqueMove,
  deleteRemoteEstoqueItem,
  createRemoteFinPurchase,
  listRemoteComprasParaEstoque,
  listRemoteEstoqueItems,
  listRemoteEstoqueMoves,
  upsertRemoteEstoqueItem,
} from "@/lib/remoteData";
import type { FinPurchase } from "@/features/financeiro/financeiroData";
import type { EstoqueItem, EstoqueMovimento } from "./estoqueData";

const itemsKey = "app-bratan-estoque-items";
const movesKey = "app-bratan-estoque-moves";

export function useEstoque() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const queryClient = useQueryClient();
  const [localItems, setLocalItems] = useState<EstoqueItem[]>(() => readLocalValue<EstoqueItem[]>(itemsKey, []));
  const [localMoves, setLocalMoves] = useState<EstoqueMovimento[]>(() => readLocalValue<EstoqueMovimento[]>(movesKey, []));

  const itemsQuery = useQuery({ queryKey: ["estoque-items"], queryFn: listRemoteEstoqueItems, enabled: useRemote, staleTime: 30_000 });
  const movesQuery = useQuery({ queryKey: ["estoque-moves"], queryFn: listRemoteEstoqueMoves, enabled: useRemote, staleTime: 30_000 });
  const comprasQuery = useQuery({
    queryKey: ["estoque-compras"],
    queryFn: listRemoteComprasParaEstoque,
    enabled: useRemote,
    staleTime: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["estoque-items"] });
    void queryClient.invalidateQueries({ queryKey: ["estoque-moves"] });
    void queryClient.invalidateQueries({ queryKey: ["estoque-compras"] });
    // O gatilho do banco carimba o "Chegou" da compra — o Financeiro precisa recarregar.
    void queryClient.invalidateQueries({ queryKey: ["fin-purchases"] });
  };

  const upsertItemMutation = useMutation({
    mutationFn: (item: EstoqueItem) => upsertRemoteEstoqueItem(item, pessoa?.id ?? null),
    onSuccess: invalidate,
  });
  const deleteItemMutation = useMutation({ mutationFn: deleteRemoteEstoqueItem, onSuccess: invalidate });
  const createMoveMutation = useMutation({
    mutationFn: (move: EstoqueMovimento) => createRemoteEstoqueMove(move, pessoa?.id ?? null),
    onSuccess: invalidate,
  });

  const items = useRemote ? (itemsQuery.data ?? []) : localItems;
  const moves = useRemote ? (movesQuery.data ?? []) : localMoves;
  const comprasKey = "app-bratan-fin-purchases";
  const [localCompras, setLocalCompras] = useState<FinPurchase[]>(() =>
    readLocalValue<FinPurchase[]>(comprasKey, []).filter((compra) => compra.estoqueSetor),
  );
  const compras: FinPurchase[] = useRemote ? (comprasQuery.data ?? []) : localCompras;

  async function upsertItem(item: EstoqueItem) {
    if (useRemote) {
      await upsertItemMutation.mutateAsync(item);
      return;
    }
    setLocalItems((prev) => {
      const next = prev.some((existing) => existing.id === item.id)
        ? prev.map((existing) => (existing.id === item.id ? item : existing))
        : [...prev, item];
      writeLocalValue(itemsKey, next);
      return next;
    });
  }

  async function deleteItem(itemRef: string) {
    if (useRemote) {
      await deleteItemMutation.mutateAsync(itemRef);
      return;
    }
    setLocalItems((prev) => {
      const next = prev.filter((existing) => existing.id !== itemRef);
      writeLocalValue(itemsKey, next);
      return next;
    });
  }

  async function createMove(move: EstoqueMovimento) {
    if (useRemote) {
      await createMoveMutation.mutateAsync(move);
      return;
    }
    setLocalMoves((prev) => {
      const next = [move, ...prev];
      writeLocalValue(movesKey, next);
      return next;
    });
  }

  /**
   * REGISTRAR A COMPRA DE UM ITEM (21/09/2026).
   *
   * É o elo que faltava. O status "a caminho" depende de a compra apontar para
   * o item, e ninguém ia preencher esse vínculo numa tela de Financeiro do
   * outro lado do app — então o registro nasce aqui, na lista onde a falta é
   * vista. Sem isto, o "já comprei ou não" continuaria sem resposta.
   */
  async function registrarCompra(entrada: {
    item: EstoqueItem;
    fornecedor: string;
    valor: number;
    previsao: string | null;
    observacao: string;
    criadoPor: string | null;
  }) {
    const compra: FinPurchase = {
      id: `fpur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      purchaseDate: new Date().toISOString().slice(0, 10),
      description: entrada.item.nome,
      supplier: entrada.fornecedor,
      amount: entrada.valor,
      method: "PIX",
      card: null,
      installments: 1,
      nfNote: "",
      deliveryEta: entrada.previsao,
      receivedAt: null,
      expenseRef: null,
      notes: entrada.observacao,
      estoqueSetor: entrada.item.setor,
      estoqueItemRef: entrada.item.id,
      createdAt: new Date().toISOString(),
    };
    if (useRemote) {
      await createRemoteFinPurchase(compra, entrada.criadoPor);
      invalidate();
    } else {
      // Sem servidor a compra ainda precisa existir, senão o botão "Já comprei"
      // fica mudo e o item continua gritando COMPRAR — que é justamente o
      // problema que ele veio resolver.
      setLocalCompras((atual) => {
        const proximas = [compra, ...atual];
        writeLocalValue(comprasKey, [...readLocalValue<FinPurchase[]>(comprasKey, []), compra]);
        return proximas;
      });
    }
    return compra;
  }

  return {
    items,
    moves,
    compras,
    registrarCompra,
    loading: useRemote && (itemsQuery.isLoading || movesQuery.isLoading),
    syncMode: useRemote ? "Supabase" : "Somente local",
    upsertItem,
    deleteItem,
    createMove,
  };
}
