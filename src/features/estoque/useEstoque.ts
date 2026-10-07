// Hook do Estoque: remoto quando logado; no modo prévia (sem banco) tudo vive
// no aparelho — mesmo padrão dos outros módulos.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { canFinanceiroFull } from "@/lib/access";
import { readLocalValue, writeLocalValue } from "@/lib/localStore";
import {
  createRemoteEstoqueMove,
  deleteRemoteEstoqueItem,
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
  // "Já comprei" é do financeiro completo (06/10/2026); os outros pedem a compra.
  const podeRegistrarCompra = canFinanceiroFull(pessoa?.cargo ?? null);

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
   * DEPOIS DO "JÁ COMPREI" (07/10/2026).
   *
   * O registro da compra do item (21/09) nasceu aqui, na lista onde a falta é
   * vista: sem ele o item ficava gritando COMPRAR até a caixa chegar. Mas esta
   * função montava a compra na mão — PIX fixo, sem conta paga, sem categoria
   * da P12 —, então a compra no cartão aparecia como PIX e a do PIX não entrava
   * no P12. Agora a compra é montada e gravada pela regra única
   * (registrarCompra.ts, via JaCompreiGaveta, a mesma do pedido aprovado) e
   * aqui só fica o que é do Estoque: fazer o item virar "a caminho" na hora.
   * No servidor, recarrega as compras do estoque; na prévia, a compra já foi
   * guardada no aparelho pelo useFinanceiro e só entra na lista daqui.
   *
   * Continua só do financeiro completo (06/10/2026): é quem o banco deixa gravar
   * compra; os outros pedem a compra (Pedidos de compra). A trava mora na gaveta.
   */
  function aposRegistrarCompra(compra: FinPurchase) {
    if (useRemote) {
      invalidate();
      return;
    }
    if (!compra.estoqueSetor) return;
    setLocalCompras((atual) => (atual.some((existente) => existente.id === compra.id) ? atual : [compra, ...atual]));
  }

  return {
    items,
    moves,
    compras,
    aposRegistrarCompra,
    podeRegistrarCompra,
    loading: useRemote && (itemsQuery.isLoading || movesQuery.isLoading),
    syncMode: useRemote ? "Supabase" : "Somente local",
    upsertItem,
    deleteItem,
    createMove,
  };
}
