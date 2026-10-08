import { useEffect, useMemo, useRef, useState } from "react";
import { erroEhMesFechado } from "./mesFechado";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { todayISO } from "@/lib/localStore";
import { toast } from "@/components/ui/avisos";

import { useAuth } from "@/hooks/useAuth";
import {
  deleteRemoteFinCrediarioProfit,
  listRemoteFinCrediarioProfits,
  saveRemoteFinCrediarioProfit,
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
  listRemoteFinGestaoMensal,
  listRemoteFinProvisionRules,
  listRemoteFinReconciliations,
  listRemoteFinPurchases,
  listRemoteFinSales,
  listRemoteFinSavings,
  listRemoteRateioDasFaturas,
  markRemoteFinExpensePaid,
  updateRemoteFinExpense,
  saveRemoteFinGestaoMensal,
  upsertRemoteFinReconciliation,
  type FinGestaoMensalRecord,
} from "@/lib/remoteData";
import {
  crediarioProfitRef,
  loadLocalCrediarioProfits,
  saveLocalCrediarioProfits,
  type FinCrediarioProfit,
  loadLocalFinExpenses,
  loadLocalFinInvoices,
  loadLocalFinReconciliations,
  loadLocalFinPurchases,
  loadLocalFinSales,
  loadLocalFinSavings,
  materializeRecurringExpenses,
  monthFeesExpenseRef,
  provisionMoveRef,
  provisionSavingsMove,
  saveLocalFinExpenses,
  saveLocalFinInvoices,
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
import { explodirContasDeFatura } from "./faturaCartao";

// VIRADA DE ANO (29/09/2026, auditoria): vendas e despesas são carregadas por
// ano. Em janeiro o "mês anterior" (dezembro) ficava zerado, a evolução de 6
// meses apagava o ano passado e a conta da obra perdia as despesas de dezembro.
// Quem compara meses (Painel, Poupança) pede `comAnoAnterior` e recebe os dois
// anos juntos; quem soma o ANO inteiro (P12, impostos, contas) continua com um.
export function useFinanceiro(year = new Date().getFullYear(), opcoes: { comAnoAnterior?: boolean } = {}) {
  const comAnoAnterior = Boolean(opcoes.comAnoAnterior);
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [sales, setSales] = useState<FinSale[]>(() => loadLocalFinSales());
  const [purchases, setPurchases] = useState<FinPurchase[]>(() => loadLocalFinPurchases());
  const [expenses, setExpenses] = useState<FinExpense[]>(() => loadLocalFinExpenses());
  const [reconciliations, setReconciliations] = useState<FinReconciliation[]>(() => loadLocalFinReconciliations());
  const [savingsMoves, setSavingsMoves] = useState<FinSavingsMove[]>(() => loadLocalFinSavings());
  // Crediário reconhecido como lucro, por mês (só quando o gestor aperta).
  const [crediarioProfits, setCrediarioProfits] = useState<FinCrediarioProfit[]>(() => loadLocalCrediarioProfits());
  const [invoices, setInvoices] = useState<FinInvoice[]>(() => loadLocalFinInvoices());
  const [partnerEntries, setPartnerEntries] = useState<FinPartnerEntry[]>([]);

  const categoriesQuery = useQuery({
    queryKey: ["fin-categories"],
    queryFn: listRemoteFinCategories,
    enabled: useRemote,
    staleTime: 5 * 60_000,
  });
  const salesQuery = useQuery({
    queryKey: comAnoAnterior ? ["fin-sales", year, "com-ano-anterior"] : ["fin-sales", year],
    queryFn: () => (comAnoAnterior ? Promise.all([listRemoteFinSales(year), listRemoteFinSales(year - 1)]).then(([a, b]) => [...a, ...b]) : listRemoteFinSales(year)),
    enabled: useRemote,
    staleTime: 30_000,
  });
  const expensesQuery = useQuery({
    queryKey: comAnoAnterior ? ["fin-expenses", year, "com-ano-anterior"] : ["fin-expenses", year],
    queryFn: () => (comAnoAnterior ? Promise.all([listRemoteFinExpenses(year - 1), listRemoteFinExpenses(year)]).then(([a, b]) => [...a, ...b]) : listRemoteFinExpenses(year)),
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

  // FATURA DO CARTÃO (29/09/2026): a soma dos itens por categoria de cada conta
  // de fatura importada. Quem lê despesa POR CATEGORIA (P12, Painel, Lucro) usa
  // `expensesPorCategoria`, em que a conta da fatura é TROCADA pelos pedaços do
  // rateio (nunca somada ao lado — ver explodirContasDeFatura). Quem lida com a
  // conta em si (Contas a Pagar, extrato, caixa) continua com `expenses`.
  // Sem a migration aplicada a função não existe: cai no comportamento de antes.
  const rateioQuery = useQuery({
    queryKey: ["fin-fatura-rateio", year, comAnoAnterior],
    queryFn: () =>
      (comAnoAnterior ? Promise.all([listRemoteRateioDasFaturas(year - 1), listRemoteRateioDasFaturas(year)]).then(([a, b]) => [...a, ...b]) : listRemoteRateioDasFaturas(year)).catch((error) => {
        console.warn("Rateio das faturas do cartão indisponível; a P12 mostra a fatura inteira.", error);
        return [];
      }),
    enabled: useRemote,
    staleTime: 60_000,
  });
  const expensesPorCategoria = useMemo(
    () => explodirContasDeFatura(expenses, rateioQuery.data ?? []),
    [expenses, rateioQuery.data],
  );

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
  const crediarioProfitQuery = useQuery({
    queryKey: ["fin-crediario-profit"],
    queryFn: listRemoteFinCrediarioProfits,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const gestaoMensalQuery = useQuery({
    queryKey: ["fin-gestao-mensal"],
    queryFn: listRemoteFinGestaoMensal,
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

  useEffect(() => {
    if (!crediarioProfitQuery.data) return;
    setCrediarioProfits(crediarioProfitQuery.data);
    saveLocalCrediarioProfits(crediarioProfitQuery.data);
  }, [crediarioProfitQuery.data]);

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
    if (!invoicesQuery.data) return;
    setInvoices(invoicesQuery.data);
    saveLocalFinInvoices(invoicesQuery.data);
  }, [invoicesQuery.data]);

  useEffect(() => {
    if (partnerEntriesQuery.data) setPartnerEntries(partnerEntriesQuery.data);
  }, [partnerEntriesQuery.data]);

  // As CONTAS invalidam todos os anos (revisão de 08/10/2026): a fila do dia, a
  // casca e o Início leem as contas pelos anos da janela de hoje (useContasDaFila),
  // que nem sempre é o ano desta tela — em janeiro, a baixa de uma conta de
  // dezembro precisa chegar ao contador do Início.
  const invalidate = (key: string) => void queryClient.invalidateQueries({ queryKey: key === "fin-expenses" ? [key] : [key, year] });

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

  // GRAVAÇÃO QUE FALHA APARECE NA TELA (29/09/2026, auditoria B1). Antes só a
  // comanda (addSale) avisava; conta, baixa, fechamento, poupança, NF e repasse
  // davam console.warn e a tela mostrava sucesso — a mudança ficava só neste
  // aparelho e ninguém sabia. Agora cada uma avisa e devolve Promise<boolean>
  // (true = chegou ao servidor), igual à addSale. A promessa NUNCA rejeita,
  // para não estourar nos chamadores que ignoram o retorno.
  function avisarFalhaNoServidor(oque: string, error: unknown) {
    console.warn(`${oque} não sincronizou.`, error);
    const detalhe = (error as { message?: unknown } | null)?.message;
    if (erroEhMesFechado(detalhe)) {
      // Mês fechado (29/09/2026): a mudança não entrou; recarrega para a tela voltar ao que vale.
      toast(`${oque}: o mês desta comanda está fechado. Peça para a gestão financeira corrigir ou reabrir o mês.`, { tom: "atencao", duracaoMs: 9000 });
      void queryClient.invalidateQueries({ queryKey: ["fin-sales"] });
      return;
    }
    toast(`${oque}: NÃO foi salvo no servidor — só este aparelho vê a mudança.${typeof detalhe === "string" && detalhe ? ` (${detalhe})` : ""}`, { tom: "erro", duracaoMs: 9000 });
  }

  function gravarNoServidor(oque: string, tarefas: Array<() => Promise<unknown>>): Promise<boolean> {
    if (!useRemote) return Promise.resolve(false);
    return Promise.allSettled(tarefas.map((tarefa) => tarefa())).then((resultados) => {
      const falha = resultados.find((resultado): resultado is PromiseRejectedResult => resultado.status === "rejected");
      if (!falha) return true;
      const falhas = resultados.filter((resultado) => resultado.status === "rejected").length;
      avisarFalhaNoServidor(falhas > 1 ? `${oque} (${falhas} de ${resultados.length})` : oque, falha.reason);
      return false;
    });
  }

  // COMPRAS TAMBÉM AVISAM (06/10/2026): criar, editar e excluir compra davam só
  // console.warn — a regra de 29/09 (gravação que falha aparece na tela) não
  // tinha chegado aqui. Agora a compra de um PEDIDO pode ser recusada pelo banco
  // (pedido que deixou de estar aprovado), e quem registra precisa saber: as
  // três devolvem Promise<boolean> (true = chegou ao servidor) e avisam.
  function addPurchase(purchase: FinPurchase): Promise<boolean> {
    setPurchases((current) => {
      const next = [purchase, ...current];
      saveLocalFinPurchases(next);
      return next;
    });
    return gravarNoServidor("Compra nova", [() => createPurchaseMutation.mutateAsync(purchase)]).then((ok) => {
      // Recusada no servidor: a lista volta ao que vale (sem a compra fantasma).
      if (!ok && useRemote) invalidate("fin-purchases");
      return ok;
    });
  }

  function updatePurchase(purchase: FinPurchase): Promise<boolean> {
    setPurchases((current) => {
      const next = current.map((existing) => (existing.id === purchase.id ? purchase : existing));
      saveLocalFinPurchases(next);
      return next;
    });
    return gravarNoServidor("Edição da compra", [() => updatePurchaseMutation.mutateAsync(purchase)]);
  }

  function removePurchase(purchaseId: string): Promise<boolean> {
    setPurchases((current) => {
      const next = current.filter((purchase) => purchase.id !== purchaseId);
      saveLocalFinPurchases(next);
      return next;
    });
    return gravarNoServidor("Exclusão da compra", [() => deletePurchaseMutation.mutateAsync(purchaseId)]);
  }

  /**
   * Lança a comanda. O `onFalha` existe porque erro de gravação NÃO pode ficar
   * só no console (25/08/2026): a comanda ficava salva no aparelho, sumia do
   * Lançar dia de todo mundo, e ninguém era avisado.
   *
   * DEVOLVE UMA PROMESSA (21/09/2026) que resolve `true` quando a comanda
   * chegou ao servidor. Quem emite nota fiscal no fechamento precisa disso: a
   * Edge Function procura a comanda pelo `client_ref`, e pedir a nota antes da
   * gravação terminar dá "comanda não encontrada" — parece falha da nota, mas é
   * só pressa. A promessa NUNCA rejeita, senão os chamadores que ignoram o
   * retorno passariam a estourar rejeição não tratada.
   */
  function addSale(sale: FinSale, onFalha?: (mensagem: string) => void): Promise<boolean> {
    setSales((current) => {
      const next = [sale, ...current];
      saveLocalFinSales(next);
      return next;
    });
    if (!useRemote) return Promise.resolve(false);
    return createSaleMutation
      .mutateAsync(sale)
      .then(() => true)
      .catch((error) => {
        console.warn("Venda não sincronizou.", error);
        const mensagem = (error as Error)?.message ?? "erro desconhecido";
        if (erroEhMesFechado(mensagem)) void queryClient.invalidateQueries({ queryKey: ["fin-sales"] });
        onFalha?.(erroEhMesFechado(mensagem) ? "o mês desta comanda está fechado; peça para a gestão financeira lançar" : mensagem);
        return false;
      });
  }

  function updateSale(sale: FinSale): Promise<boolean> {
    setSales((current) => {
      const next = current.map((existing) => (existing.id === sale.id ? sale : existing));
      saveLocalFinSales(next);
      return next;
    });
    return gravarNoServidor("Edição da comanda", [() => updateSaleMutation.mutateAsync(sale)]);
  }

  function removeSale(saleId: string): Promise<boolean> {
    setSales((current) => {
      const next = current.filter((sale) => sale.id !== saleId);
      saveLocalFinSales(next);
      return next;
    });
    return gravarNoServidor("Exclusão da comanda", [() => deleteSaleMutation.mutateAsync(saleId)]);
  }

  function addExpense(expense: FinExpense): Promise<boolean> {
    setExpenses((current) => {
      const next = [...current, expense].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      saveLocalFinExpenses(next);
      return next;
    });
    return gravarNoServidor("Conta nova", [() => createExpenseMutation.mutateAsync(expense)]);
  }

  // Lote de contas (parcelas de um boleto): um único save local + N no Supabase.
  // Ids determinísticos garantem que reenviar não duplica.
  function addExpenses(list: FinExpense[]): Promise<boolean> {
    if (!list.length) return Promise.resolve(true);
    setExpenses((current) => {
      const existing = new Set(current.map((expense) => expense.id));
      const novas = list.filter((expense) => !existing.has(expense.id));
      const next = [...current, ...novas].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      saveLocalFinExpenses(next);
      return next;
    });
    return gravarNoServidor("Parcelas novas", list.map((expense) => () => createExpenseMutation.mutateAsync(expense)));
  }

  function updateExpenses(list: FinExpense[]): Promise<boolean> {
    if (!list.length) return Promise.resolve(true);
    const byId = new Map(list.map((expense) => [expense.id, expense]));
    setExpenses((current) => {
      const next = current.map((expense) => byId.get(expense.id) ?? expense);
      saveLocalFinExpenses(next);
      return next;
    });
    return gravarNoServidor("Edição das parcelas", list.map((expense) => () => updateExpenseMutation.mutateAsync(expense)));
  }

  function removeExpenses(ids: string[]): Promise<boolean> {
    if (!ids.length) return Promise.resolve(true);
    const alvo = new Set(ids);
    setExpenses((current) => {
      const next = current.filter((expense) => !alvo.has(expense.id));
      saveLocalFinExpenses(next);
      return next;
    });
    return gravarNoServidor("Exclusão das parcelas", ids.map((id) => () => deleteExpenseMutation.mutateAsync(id)));
  }

  function setExpensePaid(expenseId: string, paidAt: string | null): Promise<boolean> {
    setExpenses((current) => {
      const next = current.map((expense) => (expense.id === expenseId ? { ...expense, paidAt } : expense));
      saveLocalFinExpenses(next);
      return next;
    });
    const gravou = gravarNoServidor(paidAt ? "Baixa da conta" : "Desfazer a baixa", [() => paidExpenseMutation.mutateAsync({ id: expenseId, paidAt })]);
    // PROVISÃO PAGA = dinheiro guardado no cofre. A baixa da conta de provisão
    // gera (ou remove) a entrada correspondente na Poupança — assim o saldo do
    // cofre e o custo do mês nunca ficam contando histórias diferentes.
    syncProvisionSavings(expenseId, paidAt);
    return gravou;
  }

  // Espelha a baixa de uma conta de provisão na aba Poupança.
  function syncProvisionSavings(expenseId: string, paidAt: string | null) {
    const match = /^fexp-prov-(\d{4}-\d{2})-(.+)$/.exec(expenseId);
    if (!match) return;
    const [, month, ruleId] = match;
    const savingsId = provisionMoveRef(month, ruleId);
    if (!paidAt) {
      removeSavingsMove(savingsId);
      return;
    }
    const expense = expenses.find((item) => item.id === expenseId);
    const rule = (provisionRulesQuery.data?.length ? provisionRulesQuery.data : seedProvisionRules).find((item) => item.id === ruleId);
    const amount = expense?.amount ?? rule?.monthlyAmount ?? 0;
    if (amount <= 0) return;
    addSavingsMoves([
      provisionSavingsMove({ ruleId, name: rule?.name ?? "Provisão", amount, savingsId }, month, paidAt),
    ]);
  }

  function saveReconciliation(record: FinReconciliation): Promise<boolean> {
    setReconciliations((current) => {
      const next = [record, ...current.filter((item) => item.id !== record.id)];
      saveLocalFinReconciliations(next);
      return next;
    });
    const gravou = gravarNoServidor("Fechamento do dia", [
      () => upsertRemoteFinReconciliation(record, pessoa?.id ?? null).then(() => void queryClient.invalidateQueries({ queryKey: ["fin-reconciliations", year] })),
    ]);
    // Taxa da maquininha SEMPRE ligada: ao conciliar um dia, a despesa da P12
    // (Tarifa bancária rede) é criada/atualizada para bater com a soma das taxas
    // do mês. Antes ela era lançada uma vez e congelava — Fechamento subia e
    // P12/Contas a Pagar ficavam defasados. Agora Fechamento = P12 = Contas a Pagar.
    syncMonthFeesExpense(record.day.slice(0, 7), [record, ...reconciliations.filter((item) => item.id !== record.id)]);
    return gravou;
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

  /**
   * Reconhece (ou atualiza) o caixa do crediário como lucro do mês. Nunca é
   * automático: só roda quando alguém aperta o botão na tela do Crediário.
   */
  function setCrediarioNoLucro(monthKey: string, amount: number, note = "") {
    const record: FinCrediarioProfit = {
      id: crediarioProfitRef(monthKey),
      monthRef: monthKey,
      amount: Math.round(amount * 100) / 100,
      note,
      includedAt: new Date().toISOString(),
    };
    setCrediarioProfits((current) => {
      const next = [record, ...current.filter((item) => item.id !== record.id)];
      saveLocalCrediarioProfits(next);
      return next;
    });
    if (useRemote) {
      void saveRemoteFinCrediarioProfit(record, pessoa?.id ?? null)
        .then(() => invalidate("fin-crediario-profit"))
        .catch((error) => console.warn("Crediário no lucro não sincronizou.", error));
    }
    return record;
  }

  /**
   * Salva a Gestão Mensal (Reunião de Líderes): explicações por indicador, PDCA
   * e o snapshot do que foi apresentado. Os números NUNCA são salvos como
   * verdade — o snapshot é só memória do que estava na tela naquele dia.
   */
  function saveGestaoMensal(record: FinGestaoMensalRecord) {
    if (!useRemote) return record;
    void saveRemoteFinGestaoMensal(record, pessoa?.id ?? null)
      .then(() => invalidate("fin-gestao-mensal"))
      .catch((error) => console.warn("Gestão mensal não sincronizou.", error));
    return record;
  }

  function removeCrediarioNoLucro(monthKey: string) {
    const ref = crediarioProfitRef(monthKey);
    setCrediarioProfits((current) => {
      const next = current.filter((item) => item.id !== ref);
      saveLocalCrediarioProfits(next);
      return next;
    });
    if (useRemote) {
      void deleteRemoteFinCrediarioProfit(ref)
        .then(() => invalidate("fin-crediario-profit"))
        .catch((error) => console.warn("Remoção do crediário no lucro não sincronizou.", error));
    }
  }

  function addSavingsMoves(moves: FinSavingsMove[]): Promise<boolean> {
    setSavingsMoves((current) => {
      const existing = new Set(current.map((move) => move.id));
      const next = [...moves.filter((move) => !existing.has(move.id)), ...current];
      saveLocalFinSavings(next);
      return next;
    });
    return gravarNoServidor("Movimento da poupança", [
      () => createRemoteFinSavingsMoves(moves, pessoa?.id ?? null).then(() => void queryClient.invalidateQueries({ queryKey: ["fin-savings"] })),
    ]);
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

  function addInvoice(invoice: FinInvoice): Promise<boolean> {
    setInvoices((current) => {
      const next = [invoice, ...current];
      saveLocalFinInvoices(next);
      return next;
    });
    return gravarNoServidor("Nota fiscal", [
      () => createRemoteFinInvoice(invoice, pessoa?.id ?? null).then(() => void queryClient.invalidateQueries({ queryKey: ["fin-invoices", year] })),
    ]);
  }

  function removeInvoice(invoiceId: string) {
    setInvoices((current) => {
      const next = current.filter((invoice) => invoice.id !== invoiceId);
      saveLocalFinInvoices(next);
      return next;
    });
    if (useRemote) {
      void deleteRemoteFinInvoice(invoiceId).catch((error) => console.warn("Exclusão de NF não sincronizou.", error));
    }
  }

  function addPartnerEntry(entry: FinPartnerEntry): Promise<boolean> {
    setPartnerEntries((current) => (current.some((item) => item.id === entry.id) ? current : [entry, ...current]));
    return gravarNoServidor("Repasse", [
      () => createRemoteFinPartnerEntry(entry, pessoa?.id ?? null).then(() => void queryClient.invalidateQueries({ queryKey: ["fin-partner-entries", year] })),
    ]);
  }

  function removePartnerEntry(entryId: string) {
    setPartnerEntries((current) => current.filter((entry) => entry.id !== entryId));
    if (useRemote) {
      void deleteRemoteFinPartnerEntry(entryId).catch((error) => console.warn("Exclusão de repasse não sincronizou.", error));
    }
  }

  function updateExpense(expense: FinExpense): Promise<boolean> {
    setExpenses((current) => {
      const next = current.map((existing) => (existing.id === expense.id ? expense : existing)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      saveLocalFinExpenses(next);
      return next;
    });
    return gravarNoServidor("Edição da conta", [() => updateExpenseMutation.mutateAsync(expense)]);
  }

  function removeExpense(expenseId: string): Promise<boolean> {
    setExpenses((current) => {
      const next = current.filter((expense) => expense.id !== expenseId);
      saveLocalFinExpenses(next);
      return next;
    });
    return gravarNoServidor("Exclusão da conta", [() => deleteExpenseMutation.mutateAsync(expenseId)]);
  }

  return {
    year,
    sales,
    expenses,
    expensesPorCategoria,
    reconciliations,
    savingsMoves,
    crediarioProfits,
    gestaoMensal: gestaoMensalQuery.data ?? [],
    saveGestaoMensal,
    setCrediarioNoLucro,
    removeCrediarioNoLucro,
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
    addExpenses,
    updateExpense,
    updateExpenses,
    removeExpenses,
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
    /** true = grava no servidor; false = modo prévia/local (06/10/2026, para gravarCompra). */
    remoto: useRemote,
    isSyncing: salesQuery.isFetching || expensesQuery.isFetching,
  };
}
