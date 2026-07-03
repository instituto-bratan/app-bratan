import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  createRemoteFinExpense,
  createRemoteFinSale,
  deleteRemoteFinExpense,
  deleteRemoteFinSale,
  listRemoteFinCategories,
  listRemoteFinExpenses,
  listRemoteFinSales,
  markRemoteFinExpensePaid,
} from "@/lib/remoteData";
import {
  loadLocalFinExpenses,
  loadLocalFinSales,
  saveLocalFinExpenses,
  saveLocalFinSales,
  seedFinCategories,
  type FinExpense,
  type FinSale,
} from "./financeiroData";

export function useFinanceiro(year = new Date().getFullYear()) {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [sales, setSales] = useState<FinSale[]>(() => loadLocalFinSales());
  const [expenses, setExpenses] = useState<FinExpense[]>(() => loadLocalFinExpenses());

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
    categories: categoriesQuery.data?.length ? categoriesQuery.data : seedFinCategories,
    addSale,
    removeSale,
    addExpense,
    setExpensePaid,
    removeExpense,
    syncMode: useRemote ? "Supabase + local" : "Somente local",
    isSyncing: salesQuery.isFetching || expensesQuery.isFetching,
  };
}
