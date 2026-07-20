import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { todayISO } from "@/lib/localStore";

import { useAuth } from "@/hooks/useAuth";
import {
  createRemoteFinExpense,
  createRemoteFinExpensesIgnoreDuplicates,
  createRemoteFinPurchase,
  createRemoteFinSale,
  createRemoteFinInvoice,
  createRemoteFinPartnerEntry,
  createRemoteFinSavingsMoves,
  deleteRemoteFinExpense,
  deleteRemoteFinPurchase,
  deleteRemoteFinSale,
  updateRemoteFinPurchase,
  updateRemoteFinSale,
  deleteRemoteFinInvoice,
  deleteRemoteFinPartnerEntry,
  deleteRemoteFinSavingsMove,
  listRemoteFinCategories,
  listRemoteFinExpenses,
  listRemoteFinInvoices,
  listRemoteFinPartnerEntries,
  listRemoteFinProvisionRules,
  listRemoteFinReconciliations,
  listRemoteFinPurchases,
  listRemoteFinSales,
  listRemoteFinSavings,
  markRemoteFinExpensePaid,
  updateRemoteFinExpense,
  upsertRemoteFinReconciliation,
} from "@/lib/remoteData";
import {
  loadLocalFinExpenses,
  loadLocalFinReconciliations,
  loadLocalFinPurchases,
  loadLocalFinSales,
  loadLocalFinSavings,
  materializeRecurringExpenses,
  monthFeesExpenseRef,
  saveLocalFinExpenses,
  saveLocalFinReconciliations,
  saveLocalFinPurchases,
  saveLocalFinSales,
  saveLocalFinSavings,
  seedFinCategories,
  seedProvisionRules,
  type FinExpense,
  type FinInvoice,
  type FinPartnerEntry,
  type FinReconciliation,
  type FinPurchase,
  type FinSale,
  type FinSavingsMove,
} from "./financeiroData";

export function useFinanceiro(year = new Date().getFullYear()) {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [sales, setSales] = useState<FinSale[]>(() => loadLocalFinSales());
  const [purchases, setPurchases] = useState<FinPurchase[]>(() => loadLocalFinPurchases());
  const [expenses, setExpenses] = useState<FinExpense[]>(() => loadLocalFinExpenses());
  const [reconciliations, setReconciliations] = useState<FinReconciliation[]>(() => loadLocalFinReconciliations());
  const [savingsMoves, setSavingsMoves] = useState<FinSavingsMove[]>(() => loadLocalFinSavings());
  const [invoices, setInvoices] = useState<FinInvoice[]>([]);
  const [partnerEntries, setPartnerEntries] = useState<FinPartnerEntry[]>([]);

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

  // Contas recorrentes: materializa as ocorrências que faltam (até o mês que
  // vem). `attemptedRecRefs` impede loop: uma cópia excluída de propósito não
  // volta (o upsert ignora client_ref existente) e não re-tentamos sem parar.
  const attemptedRecRefs = useRef(new Set<string>());
  useEffect(() => {
    if (!useRemote || !expensesQuery.data) return;
    const generated = materializeRecurringExpenses(expensesQuery.data, todayISO()).filter(
      (expense) => !attemptedRecRefs.current.has(expense.id),
    );
    if (!generated.length) return;
    for (const expense of generated) attemptedRecRefs.current.add(expense.id);
    void createRemoteFinExpensesIgnoreDuplicates(generated, pessoa?.id ?? null)
      .then(() => invalidate("fin-expenses"))
      .catch((error) => console.warn("Contas recorrentes não sincronizaram.", error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expensesQuery.data, useRemote]);

  // Modo demonstração (sem login): materializa uma vez a partir do local.
  const localRecDone = useRef(false);
  useEffect(() => {
    if (useRemote || localRecDone.current) return;
    localRecDone.current = true;
    setExpenses((current) => {
      const generated = materializeRecurringExpenses(current, todayISO());
      if (!generated.length) return current;
      const next = [...current, ...generated];
      saveLocalFinExpenses(next);
      return next;
    });
  }, [useRemote]);

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

  const invoicesQuery = useQuery({
    queryKey: ["fin-invoices", year],
    queryFn: () => listRemoteFinInvoices(year),
    enabled: useRemote,
    staleTime: 30_000,
  });
  const partnerEntriesQuery = useQuery({
    queryKey: ["fin-partner-entries", year],
    queryFn: () => listRemoteFinPartnerEntries(year),
    enabled: useRemote,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (invoicesQuery.data) setInvoices(invoicesQuery.data);
  }, [invoicesQuery.data]);

  useEffect(() => {
    if (partnerEntriesQuery.data) setPartnerEntries(partnerEntriesQuery.data);
  }, [partnerEntriesQuery.data]);

  const invalidate = (key: string) => void queryClient.invalidateQueries({ queryKey: [key, year] });

  const purchasesQuery = useQuery({
    queryKey: ["fin-purchases", year],
    queryFn: () => listRemoteFinPurchases(year),
    enabled: useRemote,
  });
  useEffect(() => {
    if (!purchasesQuery.data) return;
    setPurchases(purchasesQuery.data);
    saveLocalFinPurchases(purchasesQuery.data);
  }, [purchasesQuery.data]);

  const createPurchaseMutation = useMutation({
    mutationFn: (purchase: FinPurchase) => createRemoteFinPurchase(purchase, pessoa?.id ?? null),
    onSuccess: () => invalidate("fin-purchases"),
  });
  const updatePurchaseMutation = useMutation({
    mutationFn: updateRemoteFinPurchase,
    onSuccess: () => invalidate("fin-purchases"),
  });
  const deletePurchaseMutation = useMutation({
    mutationFn: deleteRemoteFinPurchase,
    onSuccess: () => invalidate("fin-purchases"),
  });

  const createSaleMutation = useMutation({
    mutationFn: (sale: FinSale) => createRemoteFinSale(sale, pessoa?.id ?? null),
    onSuccess: () => invalidate("fin-sales"),
  });
  const deleteSaleMutation = useMutation({
    mutationFn: deleteRemoteFinSale,
    onSuccess: () => invalidate("fin-sales"),
  });
  const updateSaleMutation = useMutation({
    mutationFn: updateRemoteFinSale,
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
  const updateExpenseMutation = useMutation({
    mutationFn: updateRemoteFinExpense,
    onSuccess: () => invalidate("fin-expenses"),
  });
  const deleteExpenseMutation = useMutation({
    mutationFn: deleteRemoteFinExpense,
    onSuccess: () => invalidate("fin-expenses"),
  });

  function addPurchase(purchase: FinPurchase) {
    setPurchases((current) => {
      const next = [purchase, ...current];
      saveLocalFinPurchases(next);
      return next;
    });
    if (useRemote) {
      void createPurchaseMutation.mutateAsync(purchase).catch((error) => console.warn("Compra não sincronizou.", error));
    }
  }

  function updatePurchase(purchase: FinPurchase) {
    setPurchases((current) => {
      const next = current.map((existing) => (existing.id === purchase.id ? purchase : existing));
      saveLocalFinPurchases(next);
      return next;
    });
    if (useRemote) {
      void updatePurchaseMutation.mutateAsync(purchase).catch((error) => console.warn("Edição da compra não sincronizou.", error));
    }
  }

  function removePurchase(purchaseId: string) {
    setPurchases((current) => {
      const next = current.filter((purchase) => purchase.id !== purchaseId);
      saveLocalFinPurchases(next);
      return next;
    });
    if (useRemote) {
      void deletePurchaseMutation.mutateAsync(purchaseId).catch((error) => console.warn("Exclusão da compra não sincronizou.", error));
    }
  }

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

  function updateSale(sale: FinSale) {
    setSales((current) => {
      const next = current.map((existing) => (existing.id === sale.id ? sale : existing));
      saveLocalFinSales(next);
      return next;
    });
    if (useRemote) {
      void updateSaleMutation.mutateAsync(sale).catch((error) => console.warn("Edição da comanda não sincronizou.", error));
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
    // Taxa da maquininha SEMPRE ligada: ao conciliar um dia, a despesa da P12
    // (Tarifa bancária rede) é criada/atualizada para bater com a soma das taxas
    // do mês. Antes ela era lançada uma vez e congelava — Fechamento subia e
    // P12/Contas a Pagar ficavam defasados. Agora Fechamento = P12 = Contas a Pagar.
    syncMonthFeesExpense(record.day.slice(0, 7), [record, ...reconciliations.filter((item) => item.id !== record.id)]);
  }

  function syncMonthFeesExpense(month: string, recs: FinReconciliation[]) {
    const feesTotal = recs
      .filter((r) => r.day.slice(0, 7) === month)
      .reduce((sum, r) => sum + (r.feeItau || 0) + (r.feeSafra || 0), 0);
    const target = Math.round(feesTotal * 100) / 100;
    const id = monthFeesExpenseRef(month);
    const existing = expenses.find((expense) => expense.id === id);
    if (target <= 0) return; // nada a lançar ainda
    if (!existing) {
      const lastDay = `${month}-28`;
      addExpense({
        id,
        description: `Tarifas maquininhas ${month.split("-").reverse().join("/")}`,
        categoryRef: "cat-tarifa-bancaria-rede",
        amount: target,
        dueDate: lastDay,
        paidAt: lastDay,
        method: "DEBITO_CONTA",
        supplier: "Itaú / Safra",
        installmentNum: null,
        installmentTotal: null,
        documentNote: "Gerado pelo Fechamento (soma das taxas conciliadas)",
        isCapex: false,
        notes: "Atualiza sozinho conforme a conciliação do Fechamento.",
        createdAt: new Date().toISOString(),
      });
    } else if (Math.abs((existing.amount || 0) - target) >= 0.01) {
      // Nunca recorrente: a taxa é recalculada por mês; recorrência duplicaria.
      updateExpense({ ...existing, amount: target, recorrencia: null, notes: "Atualiza sozinho conforme a conciliação do Fechamento." });
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

  function addInvoice(invoice: FinInvoice) {
    setInvoices((current) => [invoice, ...current]);
    if (useRemote) {
      void createRemoteFinInvoice(invoice, pessoa?.id ?? null)
        .then(() => void queryClient.invalidateQueries({ queryKey: ["fin-invoices", year] }))
        .catch((error) => console.warn("NF não sincronizou.", error));
    }
  }

  function removeInvoice(invoiceId: string) {
    setInvoices((current) => current.filter((invoice) => invoice.id !== invoiceId));
    if (useRemote) {
      void deleteRemoteFinInvoice(invoiceId).catch((error) => console.warn("Exclusão de NF não sincronizou.", error));
    }
  }

  function addPartnerEntry(entry: FinPartnerEntry) {
    setPartnerEntries((current) => (current.some((item) => item.id === entry.id) ? current : [entry, ...current]));
    if (useRemote) {
      void createRemoteFinPartnerEntry(entry, pessoa?.id ?? null)
        .then(() => void queryClient.invalidateQueries({ queryKey: ["fin-partner-entries", year] }))
        .catch((error) => console.warn("Repasse não sincronizou.", error));
    }
  }

  function removePartnerEntry(entryId: string) {
    setPartnerEntries((current) => current.filter((entry) => entry.id !== entryId));
    if (useRemote) {
      void deleteRemoteFinPartnerEntry(entryId).catch((error) => console.warn("Exclusão de repasse não sincronizou.", error));
    }
  }

  function updateExpense(expense: FinExpense) {
    setExpenses((current) => {
      const next = current.map((existing) => (existing.id === expense.id ? expense : existing)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      saveLocalFinExpenses(next);
      return next;
    });
    if (useRemote) {
      void updateExpenseMutation.mutateAsync(expense).catch((error) => console.warn("Edição da conta não sincronizou.", error));
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
    invoices,
    partnerEntries,
    provisionRules: provisionRulesQuery.data?.length ? provisionRulesQuery.data : seedProvisionRules,
    categories: categoriesQuery.data?.length ? categoriesQuery.data : seedFinCategories,
    purchases,
    addPurchase,
    updatePurchase,
    removePurchase,
    addSale,
    updateSale,
    removeSale,
    addExpense,
    updateExpense,
    setExpensePaid,
    removeExpense,
    saveReconciliation,
    addSavingsMoves,
    removeSavingsMove,
    addInvoice,
    removeInvoice,
    addPartnerEntry,
    removePartnerEntry,
    syncMode: useRemote ? "Supabase + local" : "Somente local",
    isSyncing: salesQuery.isFetching || expensesQuery.isFetching,
  };
}
