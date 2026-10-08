// A BUSCA DAS CONTAS DA FILA DO DIA (08/10/2026, revisão das etapas 2 e 3).
// Os anos da janela (anosDaFila) em consultas por ano, nas MESMAS chaves de
// cache do resto do app (["fin-expenses", ano] = listRemoteFinExpenses(ano)):
// a casca, o Início e Contas a pagar leem a mesma coisa e o "Paguei" de qualquer
// um deles (setQueriesData/invalidate em ["fin-expenses"]) chega aos três.
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { listRemoteFinExpenses } from "@/lib/remoteData";
import { anosDaFila, juntarContas } from "./contasDaFila";
import type { FinExpense } from "./financeiroData";

export function useContasDaFila({ hoje, ativo, fora = [] }: { hoje: string; ativo: boolean; fora?: readonly number[] }) {
  const anos = anosDaFila(hoje).filter((ano) => !fora.includes(ano));
  const consultas = useQueries({
    queries: anos.map((ano) => ({
      queryKey: ["fin-expenses", ano],
      queryFn: () => listRemoteFinExpenses(ano),
      enabled: ativo,
      staleTime: 60_000,
    })),
  });
  // A lista só muda quando alguma das respostas muda (e não a cada render).
  const assinatura = consultas.map((consulta, indice) => `${anos[indice]}:${consulta.dataUpdatedAt}:${consulta.data ? 1 : 0}`).join("|");
  const contas = useMemo<FinExpense[]>(
    () => juntarContas(consultas.map((consulta) => consulta.data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assinatura],
  );
  return {
    contas,
    /** Ainda sem a primeira resposta de algum dos anos. */
    carregando: ativo && consultas.some((consulta) => consulta.isLoading),
    anos,
  };
}
