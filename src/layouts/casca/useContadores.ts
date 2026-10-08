// Os números da casca (08/10/2026): contador do Início (só decisões) e o sino
// (notas fiscais sem CPF). As regras estão em ./contadores.ts; aqui só se busca
// o dado — e sempre nas MESMAS chaves de cache das telas que já carregam a
// mesma coisa (Pedidos de compra, Home, Impostos & NFs), para o menu não fazer
// uma segunda leitura do banco nem mostrar número diferente da tela.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { configAtual, type LinhaConfig } from "@/lib/configNegocio";
import { readLocalValue, todayISO } from "@/lib/localStore";
import type { Contador } from "@/lib/navegacao";
import { listRemoteFinExpenses, listRemoteFinReconciliations, listRemoteFinSales } from "@/lib/remoteData";
import { listRemotePedidosDeCompra } from "@/lib/remote/compras";
import { listRemoteNfseLote, prontidaoDoLote } from "@/lib/remote/nfseLote";
import { pedidosDeExemplo, type PedidoCompra } from "@/features/compras/comprasData";
import { pedidosKey } from "@/features/compras/useCompras";
import { loadLocalFinExpenses, loadLocalFinReconciliations, loadLocalFinSales } from "@/features/financeiro/financeiroData";
import { chaveDoLote } from "@/features/financeiro/loteDeNotas";
import { diaUtilAnterior } from "@/features/financeiro/recebiveisRede";
import {
  decisoesPendentes,
  notasDeExemploDaPrevia,
  notasSemCpf,
  papeisNasDecisoes,
  veAvisoDasNotas,
  type DecisoesPendentes,
  type NotaSemCpf,
} from "./contadores";

export type ContadoresDaCasca = {
  decisoes: DecisoesPendentes;
  /** Notas fiscais do lote esperando CPF (a prioridade de Avisos). */
  notasSemCpf: NotaSemCpf[];
  /** O aviso das notas é desta pessoa (lê o lote E abre Impostos & NFs — veAvisoDasNotas). */
  veNotas: boolean;
  carregandoNotas: boolean;
  /** Prévia sem banco: as notas são exemplos. */
  exemplo: boolean;
  /** O número de cada contador do mapa. */
  valor: (contador: Contador | null) => number;
};

export function useContadoresDaCasca({ linhasDeConfig, focusLigada }: { linhasDeConfig: LinhaConfig[]; focusLigada: boolean }): ContadoresDaCasca {
  const { pessoa, session, isPreview } = useAuth();
  const { pathname } = useLocation();
  const remoto = Boolean(pessoa && session && !isPreview);
  const hoje = todayISO();
  const ano = Number(hoje.slice(0, 4));

  // ---- quem decide o quê (regra pura em contadores.ts, com a exceção de Acessos) ----
  const limiteAprovacao = Number(configAtual<number>("aprovacao.limite", hoje, linhasDeConfig) ?? 0) || 0;
  const aprovadores = configAtual<string[]>("aprovacao.aprovadores", hoje, linhasDeConfig) ?? [];
  const papeis = papeisNasDecisoes(pessoa, { aprovadores, limiteAprovacao });
  const { aprovaPedidos, pagaContas, aprovaContas, confereFechamento } = papeis;

  // ---- pedidos de compra: só quem aprova (mesma chave do useCompras) ----
  const pedidosQuery = useQuery({
    queryKey: ["compras-pedidos"],
    queryFn: listRemotePedidosDeCompra,
    enabled: remoto && aprovaPedidos,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  // ---- contas de hoje, vencidas e acima do limite: quem paga ou aprova (mesma chave da Home) ----
  const contasQuery = useQuery({
    queryKey: ["fin-expenses", ano],
    queryFn: () => listRemoteFinExpenses(ano),
    enabled: remoto && (pagaContas || aprovaContas),
    staleTime: 60_000,
  });

  // ---- fechamento de ontem sem conferir: quem confere (mesmas chaves da Home) ----
  // O ano é o do dia útil anterior: em 04/01 o "ontem" ainda é dezembro.
  const anoDoFechamento = Number(diaUtilAnterior(hoje).slice(0, 4)) || ano;
  const comandasQuery = useQuery({
    queryKey: ["home-fin-sales", anoDoFechamento],
    queryFn: () => listRemoteFinSales(anoDoFechamento),
    enabled: remoto && confereFechamento,
    staleTime: 60_000,
  });
  const conferenciasQuery = useQuery({
    queryKey: ["home-fin-reconciliations", anoDoFechamento],
    queryFn: () => listRemoteFinReconciliations(anoDoFechamento),
    enabled: remoto && confereFechamento,
    staleTime: 60_000,
  });

  const decisoes = useMemo(() => {
    // Na prévia tudo vive no aparelho; relê a cada troca de tela (as telas de
    // Pedidos, Contas e Fechamento gravam no mesmo lugar).
    void pathname;
    const pedidos: PedidoCompra[] = remoto
      ? pedidosQuery.data ?? []
      : aprovaPedidos
        ? readLocalValue<PedidoCompra[]>(pedidosKey, pedidosDeExemplo(hoje))
        : [];
    const contas = remoto ? contasQuery.data ?? [] : pagaContas || aprovaContas ? loadLocalFinExpenses() : [];
    const comandas = remoto ? comandasQuery.data ?? [] : confereFechamento ? loadLocalFinSales() : [];
    // Sem a resposta das conferências ainda, não acusa o fechamento: espera.
    const conferencias = remoto ? conferenciasQuery.data : confereFechamento ? loadLocalFinReconciliations() : [];
    return decisoesPendentes({
      pedidos,
      aprovaPedidos,
      contas,
      pagaContas,
      aprovaContas,
      limiteAprovacao,
      confereFechamento: confereFechamento && conferencias !== undefined,
      comandas,
      conferencias: conferencias ?? [],
      hoje,
    });
  }, [
    remoto,
    pedidosQuery.data,
    contasQuery.data,
    comandasQuery.data,
    conferenciasQuery.data,
    aprovaPedidos,
    pagaContas,
    aprovaContas,
    confereFechamento,
    limiteAprovacao,
    hoje,
    pathname,
  ]);

  // ---- notas sem CPF: quem lê o lote (RLS: financeiro completo ou quem emite) E abre
  // Impostos & NFs — a exceção de Acessos na tela vale também para o sino e /avisos ----
  const veNotas = veAvisoDasNotas(pessoa);
  // O cartão do lote só aparece com a Focus ligada; sem ela, o "Completar" não levaria a nada.
  const buscaLote = remoto && veNotas && focusLigada;
  const loteQuery = useQuery({ queryKey: [...chaveDoLote], queryFn: listRemoteNfseLote, enabled: buscaLote, staleTime: 60_000 });
  const itens = loteQuery.data ?? [];
  // A mesma chave do cartão do lote (todas as fichas do lote, em ordem): uma leitura só.
  const contatos = useMemo(() => [...new Set(itens.map((item) => item.contactRef ?? "").filter(Boolean))].sort(), [itens]);
  const prontidaoQuery = useQuery({
    queryKey: ["nfse-lote-prontidao", contatos.join("|")],
    queryFn: () => prontidaoDoLote(contatos),
    enabled: buscaLote && contatos.length > 0,
    staleTime: 60_000,
  });

  const exemplo = !remoto && veNotas;
  const notas = useMemo(() => {
    if (exemplo) return notasDeExemploDaPrevia(hoje);
    if (!buscaLote || !loteQuery.data) return [];
    // Sem a resposta da prontidão ainda, não acusa ninguém: espera.
    if (contatos.length > 0 && !prontidaoQuery.data) return [];
    const comCpf = new Set((prontidaoQuery.data ?? []).filter((linha) => linha.temCpf).map((linha) => linha.contactRef));
    return notasSemCpf(loteQuery.data, (ref) => comCpf.has(ref), hoje);
  }, [exemplo, buscaLote, loteQuery.data, prontidaoQuery.data, contatos.length, hoje]);

  const valor = (contador: Contador | null) => {
    if (contador === "decisoes") return decisoes.total;
    if (contador === "pedidos-para-aprovar") return decisoes.pedidos;
    if (contador === "avisos") return notas.length;
    return 0;
  };

  return {
    decisoes,
    notasSemCpf: notas,
    veNotas,
    carregandoNotas: buscaLote && (loteQuery.isLoading || (contatos.length > 0 && prontidaoQuery.isLoading)),
    exemplo,
    valor,
  };
}
