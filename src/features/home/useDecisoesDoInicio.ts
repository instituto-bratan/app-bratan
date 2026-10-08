// AS DECISÕES DO INÍCIO NA PRÓPRIA LINHA (08/10/2026, redesenho etapa 2).
//
// A imagem 01 aprovada põe o botão da decisão ao lado do valor: "Aprovar" no
// pedido de compra e "Paguei" na conta do dia. Nenhuma das duas é uma ação
// nova — são as MESMAS de sempre, com o mesmo "Desfazer":
//  · Aprovar = compras.decidir(pedido, "APROVAR"), depois de uma janela de 5 s
//    em que dá para desfazer sem tocar no banco (como em Pedidos de compra,
//    PedidosDeCompraPage). Saindo da tela, fechando a aba ou trocando de aba,
//    o que estava na janela grava na hora (com keepalive, decidirAoSair).
//    "Aprovar os N" (sem teto de valor, decisão do Lucas) aprova cada pedido
//    por essa mesma ação, item a item, com um "Desfazer" só para o lote.
//  · Paguei = a baixa da conta com a data de hoje (markRemoteFinExpensePaid,
//    a mesma do setExpensePaid de Contas a pagar), com "Desfazer" no aviso.
//    Conta acima do limite que ainda não foi aprovada não é paga por aqui — para
//    NINGUÉM (revisão de 08/10/2026): a trava repete a de Contas a pagar
//    (precisaAprovacao com o limite vigente), e não só o que a linha marcou.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/avisos";
import { formatarReais } from "@/components/ui/papel-musgo";
import { markRemoteFinExpensePaid } from "@/lib/remoteData";
import { numeroDoPedido, type PedidoCompra } from "@/features/compras/comprasData";
import type { useCompras } from "@/features/compras/useCompras";
import { loadLocalFinExpenses, saveLocalFinExpenses, type FinExpense } from "@/features/financeiro/financeiroData";
import { avisarMudancaLocal } from "@/lib/mudancaLocal";
import { precisaAprovacao, type ItemFila } from "@/features/financeiro/filaFinanceira";

/** Aprovar é um toque; durante estes segundos dá para desfazer (só depois grava) — o mesmo tempo de Pedidos de compra. */
export const JANELA_DESFAZER_MS = 5000;

type Compras = Pick<ReturnType<typeof useCompras>, "decidir" | "decidirAoSair">;

/** Aprovar um ou vários pedidos, cada um pela ação de sempre, com "Desfazer". */
export function useAprovarComDesfazer(compras: Compras) {
  const comprasRef = useRef(compras);
  comprasRef.current = compras;
  const pendentes = useRef(new Map<string, { pedido: PedidoCompra; timer: number }>());
  const [aprovando, setAprovando] = useState<Set<string>>(() => new Set());
  const montada = useRef(true);

  const tirar = (ids: string[]) =>
    setAprovando((atual) => {
      const proximo = new Set(atual);
      for (const id of ids) proximo.delete(id);
      return proximo;
    });

  async function gravar(id: string, aoSair = false) {
    const pendente = pendentes.current.get(id);
    if (!pendente) return;
    window.clearTimeout(pendente.timer);
    pendentes.current.delete(id);
    if (!(aoSair && comprasRef.current.decidirAoSair(pendente.pedido, "APROVAR"))) {
      await comprasRef.current.decidir(pendente.pedido, "APROVAR");
    }
    if (montada.current) tirar([id]);
  }
  const gravarRef = useRef(gravar);
  gravarRef.current = gravar;

  useEffect(() => {
    montada.current = true;
    const gravarTudo = () => {
      for (const id of [...pendentes.current.keys()]) void gravarRef.current(id, true);
    };
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") gravarTudo();
    };
    window.addEventListener("pagehide", gravarTudo);
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.removeEventListener("pagehide", gravarTudo);
      document.removeEventListener("visibilitychange", aoEsconder);
      montada.current = false;
      gravarTudo();
    };
  }, []);

  function desfazer(ids: string[]) {
    const ainda = ids.filter((id) => pendentes.current.has(id));
    if (!ainda.length) {
      toast("A aprovação já foi gravada. Se precisar voltar atrás, cancele o pedido em Pedidos de compra.", { tom: "atencao", duracaoMs: 6000 });
      return;
    }
    const pedidos = ainda.map((id) => pendentes.current.get(id)!.pedido);
    for (const id of ainda) {
      window.clearTimeout(pendentes.current.get(id)!.timer);
      pendentes.current.delete(id);
    }
    tirar(ainda);
    toast(
      pedidos.length === 1
        ? `Aprovação do pedido ${numeroDoPedido(pedidos[0].numero)} desfeita.`
        : `Aprovação dos ${pedidos.length} pedidos desfeita.`,
      { tom: "info" },
    );
  }

  function aprovar(lista: PedidoCompra[]) {
    const novos = lista.filter((pedido) => pedido.status === "ENVIADO" && !pendentes.current.has(pedido.id));
    if (!novos.length) return;
    for (const pedido of novos) {
      const timer = window.setTimeout(() => void gravarRef.current(pedido.id), JANELA_DESFAZER_MS);
      pendentes.current.set(pedido.id, { pedido, timer });
    }
    setAprovando((atual) => {
      const proximo = new Set(atual);
      for (const pedido of novos) proximo.add(pedido.id);
      return proximo;
    });
    const valor = novos.reduce((soma, pedido) => soma + (pedido.valorEstimado || 0), 0);
    toast(
      novos.length === 1
        ? `Pedido ${numeroDoPedido(novos[0].numero)} aprovado.`
        : `${novos.length} pedidos aprovados, somando ${formatarReais(valor)}.`,
      { tom: "ok", duracaoMs: JANELA_DESFAZER_MS, acao: { rotulo: "Desfazer", onClick: () => desfazer(novos.map((pedido) => pedido.id)) } },
    );
  }

  return { aprovando, aprovar, desfazer };
}

/** "Paguei" na linha da conta do dia: a baixa com a data de hoje, com "Desfazer". */
export function usePagarConta({
  remoto,
  hoje,
  limiteAprovacao,
  aoMudarLocal,
}: {
  remoto: boolean;
  hoje: string;
  /** "aprovacao.limite" vigente (0 = aprovação desligada) — a mesma trava de Contas a pagar. */
  limiteAprovacao: number;
  aoMudarLocal: () => void;
}) {
  const queryClient = useQueryClient();
  const [gravando, setGravando] = useState<Set<string>>(() => new Set());

  async function marcar(expense: FinExpense, paidAt: string | null): Promise<boolean> {
    if (!remoto) {
      // Prévia/local: a mesma lista que Contas a pagar lê no aparelho.
      saveLocalFinExpenses(loadLocalFinExpenses().map((conta) => (conta.id === expense.id ? { ...conta, paidAt } : conta)));
      aoMudarLocal();
      // O contador da casca relê o aparelho (na prévia ele não tem o cache do react-query).
      avisarMudancaLocal();
      return true;
    }
    setGravando((atual) => new Set(atual).add(expense.id));
    // Na hora, em toda lista de contas em memória (o contador do Início lê a mesma).
    queryClient.setQueriesData<FinExpense[]>({ queryKey: ["fin-expenses"] }, (atual) =>
      Array.isArray(atual) ? atual.map((conta) => (conta.id === expense.id ? { ...conta, paidAt } : conta)) : atual,
    );
    try {
      await markRemoteFinExpensePaid(expense.id, paidAt);
      return true;
    } catch (error) {
      toast(`${paidAt ? "A baixa" : "Desfazer a baixa"} de "${expense.description}" não gravou: ${error instanceof Error ? error.message : String(error)}`, {
        tom: "erro",
        duracaoMs: 9000,
      });
      return false;
    } finally {
      setGravando((atual) => {
        const proximo = new Set(atual);
        proximo.delete(expense.id);
        return proximo;
      });
      void queryClient.invalidateQueries({ queryKey: ["fin-expenses"] });
    }
  }

  async function pagar(item: ItemFila) {
    const expense = item.expense;
    if (!expense) return;
    // A mesma trava de Contas a pagar (pagarConta): acima do limite e sem aprovação não paga.
    if (item.aguardaAprovacao || precisaAprovacao(expense, limiteAprovacao)) {
      toast(`"${expense.description}" está acima do limite e ainda não foi aprovada.`, { tom: "atencao" });
      return;
    }
    const gravou = await marcar(expense, hoje);
    if (!gravou) return;
    toast(`"${expense.description}" marcada como paga hoje (${formatarReais(expense.amount)}). Se tiver o comprovante ou a NF, anexe em Contas a pagar.`, {
      tom: "ok",
      duracaoMs: 8000,
      acao: { rotulo: "Desfazer", onClick: () => void marcar(expense, null) },
    });
  }

  return { gravando, pagar };
}
