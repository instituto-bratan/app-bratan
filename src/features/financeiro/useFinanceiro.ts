import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  createRemoteFinExpense,
  createRemoteFinSale,
  createRemoteFinSavingsMoves,
  deleteRemoteFinExpense,
  deleteRemoteFinSale,
  deleteRemoteFinSavingsMove,
  listRemoteFinCategories,
  listRemoteFinExpenses,
  listRemoteFinProvisionRules,
  listRemoteFinReconciliations,
  listRemoteFinSales,
  listRemoteFinSavings,
  markRemoteFinExpensePaid,
  upsertRemoteFinReconciliation,
} from "@/lib/remoteData";
import {
  loadLocalFinExpenses,
  loadLocalFinReconciliations,
  loadLocalFinSales,
  loadLocalFinSavings,
  saveLocalFinExpenses,
  saveLocalFinReconciliations,
  saveLocalFinSales,
  saveLocalFinSavings,
  seedFinCategories,
  seedProvisionRules,
  type FinExpense,
  type FinReconciliation,
  type FinSale,
  type FinSavingsMove,
} from "./financeiroData";

export function useFinanceiro(year = new Date().getFullYear()) {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [sales, setSales] = useState<FinSale[]>(() => loadLocalFinSales());
  const [expenses, setExpenses] = useState<FinExpense[]>(() => loadLocalFinExpenses());
  const [reconciliations, setReconciliations] = useState<FinReconciliation[]>(() => loadLocalFinReconciliations());
  const [savingsMoves, setSavingsMoves] = useState<FinSavingsMove[]>(() => loadLocalFinSavings());

  const categoriesQuery = useQuery({
    queryKey: ["fin-categories"],
    queryFn: listRemoteFinCategories,
    enabled: useRemote,
    staleTime: 5 * 60_000,
  });
  const salesQuery = useQuery({
    queryKey: ["fin-sales", year],
    queryFn: () => listRemoteFinSales(year),
    enabled: useRemote,
    staleTime: 30_000,
  });
  const expensesQuery = useQuery({
    queryKey: ["fin-expenses", year],
    queryFn: () => listRemoteFinExpenses(year),
    enabled: useRemote,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!salesQuery.data) return;
    setSales(salesQuery.data);
    saveLocalFinSales(salesQuery.data);
  }, [salesQuery.data]);

  useEffect(() => {
    if (!expensesQuery.data) return;
    setExpenses(expensesQuery.data);
    saveLocalFinExpenses(expensesQuery.data);
  }, [expensesQuery.data]);

  const reconciliationsQuery = useQuery({
    queryKey: ["fin-reconciliations", year],
    queryFn: () => listRemoteFinReconciliations(year),
    enabled: useRemote,
    staleTime: 30_000,
  });
  const savingsQuery = useQuery({
    queryKey: ["fin-savings"],
    queryFn: listRemoteFinSavings,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const provisionRulesQuery = useQuery({
    queryKey: ["fin-provision-rules"],
    queryFn: listRemoteFinProvisionRules,
    enabled: useRemote,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!reconciliationsQuery.data) return;
    setReconciliations(reconciliationsQuery.data);
    saveLocalFinReconciliations(reconciliationsQuery.data);
  }, [reconciliationsQuery.data]);

  useEffect(() => {
    if (!savingsQuery.data) return;
    setSavingsMoves(savingsQuery.data);
    saveLocalFinSavings(savingsQuery.data);
  }, [savingsQuery.data]);

  const invalidate = (key: string) => void queryClient.invalidateQueries({ queryKey: [key, year] });

  const createSaleMutation = useMutation({
    mutationFn: (sale: FinSale) => createRemoteFinSale(sale, pessoa?.id ?? null),
    onSuccess: () => invalidate("fin-sales"),
  });
  const deleteSaleMutation = useMutation({
    mutationFn: deleteRemoteFinSale,
    onSuccess: () => invalidate("fin-sales"),
  });
  const createExpenseMutation = useMutation({
    mutationFn: (expense: FinExpense) => createRemoteFinExpense(expense, pessoa?.id ?? null),
    onSuccess: () => invalidate("fin-expenses"),
  });
  const paidExpenseMutation = useMutation({
    mutationFn: ({ id, paidAt }: { id: string; paidAt: string | null }) => markRemoteFinExpensePaid(id, paidAt),
    onSuccess: () => invalidate("fin-expenses"),
  });
  const deleteExpenseMutation = useMutation({
    mutationFn: deleteRemoteFinExpense,
    onSuccess: () => invalidate("fin-expenses"),
  });

  function addSale(sale: FinSale) {
    setSales((current) => {
      const next = [sale, ...current];
      saveLocalFinSales(next);
      return next;
    });
    if (useRemote) {
      void createSaleMutation.mutateAsync(sale).catch((error) => console.warn("Venda não sincronizou.", error));
    }
  }

  function removeSale(saleId: string) {
    setSales((current) => {
      const next = current.filter((sale) => sale.id !== saleId);
      saveLocalFinSales(next);
      return next;
    });
    if (useRemote) {
      void deleteSaleMutation.mutateAsync(saleId).catch((error) => console.warn("Exclusão não sincronizou.", error));
    }
  }

  function addExpense(expense: FinExpense) {
    setExpenses((current) => {
      const next = [...current, expense].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      saveLocalFinExpenses(next);
      return next;
    });
    if (useRemote) {
      void createExpenseMutation.mutateAsync(expense).catch((error) => console.warn("Despesa não sincronizou.", error));
    }
  }

  function setExpensePaid(expenseId: string, paidAt: string | null) {
    setExpenses((current) => {
      const next = current.map((expense) => (expense.id === expenseId ? { ...expense, paidAt } : expense));
      saveLocalFinExpenses(next);
      return next;
    });
    if (useRemote) {
      void paidExpenseMutation.mutateAsync({ id: expenseId, paidAt }).catch((error) => console.warn("Baixa não sincronizou.", error));
    }
  }

  function saveReconciliation(record: FinReconciliation) {
    setReconciliations((current) => {
      const next = [record, ...current.filter((item) => item.id !== record.id)];
      saveLocalFinReconciliations(next);
      return next;
    });
    if (useRemote) {
      void upsertRemoteFinReconciliation(record, pessoa?.id ?? null)
        .then(() => void queryClient.invalidateQueries({ queryKey: ["fin-reconciliations", year] }))
        .catch((error) => console.warn("Fechamento não sincronizou.", error));
    }
  }

  function addSavingsMoves(moves: FinSavingsMove[]) {
    setSavingsMoves((current) => {
      const existing = new Set(current.map((move) => move.id));
      const next = [...moves.filter((move) => !existing.has(move.id)), ...current];
      saveLocalFinSavings(next);
      return next;
    });
    if (useRemote) {
      void createRemoteFinSavingsMoves(moves, pessoa?.id ?? null)
        .then(() => void queryClient.invalidateQueries({ queryKey: ["fin-savings"] }))
        .catch((error) => console.warn("Poupança não sincronizou.", error));
    }
  }

  function removeSavingsMove(moveId: string) {
    setSavingsMoves((current) => {
      const next = current.filter((move) => move.id !== moveId);
      saveLocalFinSavings(next);
      return next;
    });
    if (useRemote) {
      void deleteRemoteFinSavingsMove(moveId).catch((error) => console.warn("Exclusão não sincronizou.", error));
    }
  }

  function removeExpense(expenseId: string) {
    setExpenses((current) => {
      const next = current.filter((expense) => expense.id !== expenseId);
      saveLocalFinExpenses(next);
      return next;
    });
    if (useRemote) {
      void deleteExpenseMutation.mutateAsync(expenseId).catch((error) => console.warn("Exclusão não sincronizou.", error));
    }
  }

  return {
    year,
    sales,
    expenses,
    reconciliations,
    savingsMoves,
    provisionRules: provisionRulesQuery.data?.length ? provisionRulesQuery.data : seedProvisionRules,
    categories: categoriesQuery.data?.length ? categoriesQuery.data : seedFinCategories,
    addSale,
    removeSale,
    addExpense,
    setExpensePaid,
    removeExpense,
    saveReconciliation,
    addSavingsMoves,
    removeSavingsMove,
    syncMode: useRemote ? "Supabase + local" : "Somente local",
    isSyncing: salesQuery.isFetching || expensesQuery.isFetching,
  };
}
