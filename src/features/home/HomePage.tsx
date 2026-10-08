// A HOME É A FILA DO DIA (aprovado pelo Lucas em 14/09/2026, proposta 4.1).
//
// Antes: um painel de atalhos com um hero animado e cartões de resumo; a fila
// financeira aparecia só para quem cuida do financeiro. Agora: ao abrir o app,
// cada pessoa vê UMA lista do que precisa de ação — já filtrada pelo cargo e
// pelos acessos por pessoa — depois os sinais do mês (cabe gastar, meta do dia,
// ocupação de sala) e, por fim, os atalhos, que viraram a segunda tela.
//
// REDESENHO "PAPEL & MUSGO", ETAPA 2 (08/10/2026) — o Início vira o "Para
// decidir" da imagem 01 aprovada:
//  · cabeçalho com a data em Fraunces ("Quinta, 8 de outubro"), a frase com
//    quantas decisões esperam — o MESMO número do contador do Início na casca
//    (montarParaDecidir repete a conta de decisoesPendentes) — e "Lançar dia";
//  · à esquerda, a folha das decisões: Pedidos de compra (Aprovar e "Aprovar os
//    N", sem teto), Pagar hoje (Paguei, no dia de pagar: fim de semana e
//    feriado pagam no dia útil anterior) e Conferir (o fechamento de ontem); no
//    pé, as notas sem CPF, que são AVISO e moram em Avisos;
//  · embaixo, o resto da Fila do dia (sem repetir as decisões);
//  · à direita, só para saber: o mês até agora e a agenda de hoje.
// Os dados são os de sempre (mesmas consultas, mesmas chaves de cache). Os
// Atalhos saíram (repetiam o menu e o ⌘K — levantamento da navegação); os
// "Avisos recentes" do Mural e o "Avisos no celular" foram para /avisos.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Banknote } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Cabecalho } from "@/components/ui/cabecalho";
import { FioDoMes } from "@/components/ui/fio-do-mes";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan, canEditModule, canFinanceiroFull, canFinanceiroView, canLancarDia, canLembretesPagamento, canSeeModule, isCoordenacao } from "@/lib/access";
import { configAtual } from "@/lib/configNegocio";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { prefetchRoute } from "@/lib/routePreload";
import { useConfigNegocio } from "@/lib/useConfigNegocio";
import {
  dispararRotinaDiaria,
  listRemoteAchados,
  listRemoteAvisos,
  listRemoteChecklistItems,
  listRemoteExpenseNotas,
  listRemoteFinInvoices,
  listRemoteFinPurchases,
  listRemoteFinReconciliations,
  listRemoteFinSales,
  listRemoteNpsContatos,
  listRemotePagamentos,
  loadRemoteFinLucroPublico,
  resolverRemoteAchado,
} from "@/lib/remoteData";
import { listAgendaDoPeriodo, listPresencasDoPeriodo } from "@/lib/remote/agenda";
import { fraseDasNotasSemCpf, papeisNasDecisoes } from "@/layouts/casca/contadores";
import { useContadoresDaTela } from "@/layouts/casca/contexto";
import { checklistStorageKey, checklistSummary, createChecklistRun, filterChecklistItemsByCargo, marcaDaTarefa } from "@/features/checklist/checklistData";
import { activeAvisos, initialAvisos, muralStorageKey } from "@/features/mural/muralData";
import { pagamentosStorageKey, pagamentosSummary, type PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import { loadLocalFinExpenses, loadLocalFinReconciliations, loadLocalFinSales, pagamentosSemComprovante, salesPendingInvoice } from "@/features/financeiro/financeiroData";
import { buildFilaFinanceira } from "@/features/financeiro/filaFinanceira";
import { buildOcupacaoMes } from "@/features/financeiro/ocupacaoSala";
import { diaUtilAnterior } from "@/features/financeiro/recebiveisRede";
import { canUserAccessTask, cargoToCrmRole, contactDisplayName, isCrmManagement } from "@/features/crm/crmData";
import { useCrmState } from "@/features/crm/useCrmState";
import { useEstoque } from "@/features/estoque/useEstoque";
import { useCompras } from "@/features/compras/useCompras";
import { podeAprovar, podeComprar } from "@/features/compras/comprasData";
import { estoqueParaAFila, pedidosParaAFila } from "@/features/compras/estoquePedidos";
import { filaDeContatos } from "@/features/concierge/npsData";
import { horaEmBrasilia, montarItens, semanaDoRelatorio } from "@/features/agenda/agendaDoDia";
import { buildProgramaBoard } from "@/features/programa/programaData";
import { buildFilaDoDia, fechamentoPendente, limparSilenciados, restoDaFila, type TarefaCrmDaFila } from "./filaDoDia";
import { FilaDoDiaHome } from "./FilaDoDiaHome";
import { ParaDecidirFolha } from "./ParaDecidirFolha";
import { ParaSaberDoInicio, type LucroDoMes } from "./ParaSaberDoInicio";
import {
  agendaDeExemploDaPrevia,
  agendaDoInicio,
  fraseDoInicio,
  mesAteAgora,
  mesDeExemploDaPrevia,
  montarParaDecidir,
  tituloDoDia,
} from "./paraDecidir";
import { useAprovarComDesfazer, usePagarConta } from "./useDecisoesDoInicio";
import { useContasDaFila } from "@/features/financeiro/useContasDaFila";

/** Onde se completa o CPF das notas (o mesmo link de Avisos). */
const LINK_DO_LOTE = "/financeiro/impostos#lote-de-notas";

/** A hora de Brasília (HH:MM), andando de minuto em minuto, para a linha do agora da agenda. */
function useAgora() {
  const [agora, setAgora] = useState(() => horaEmBrasilia(new Date().toISOString()));
  useEffect(() => {
    const id = window.setInterval(() => setAgora(horaEmBrasilia(new Date().toISOString())), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
}

export function HomePage() {
  const { pessoa, session, isPreview } = useAuth();
  const navigate = useNavigate();
  const cargo = pessoa?.cargo;
  const useRemote = Boolean(pessoa && session && !isPreview);
  const hoje = todayISO();
  const mesAtual = hoje.slice(0, 7);
  const ano = Number(hoje.slice(0, 4));
  const agora = useAgora();
  const contadores = useContadoresDaTela();
  const config = useConfigNegocio();

  const veFinanceiro = canFinanceiroView(cargo);
  const financeiroCompleto = canFinanceiroFull(cargo);
  const veEstoque = canSeeModule(pessoa, "estoque");
  const veNps = canSeeModule(pessoa, "concierge-nps");
  const veCrm = canCrmBratan(cargo) && canSeeModule(pessoa, "crm");
  const veAgenda = canSeeModule(pessoa, "agenda");

  // ---- quem decide o quê: a MESMA regra do contador do Início (contadores.ts) ----
  const limiteAprovacao = Number(configAtual<number>("aprovacao.limite", hoje, config.linhas) ?? 0) || 0;
  const aprovadores = configAtual<string[]>("aprovacao.aprovadores", hoje, config.linhas) ?? [];
  const papeis = papeisNasDecisoes(pessoa, { aprovadores, limiteAprovacao });
  const temPapelDeDecisao = papeis.aprovaPedidos || papeis.pagaContas || papeis.aprovaContas || papeis.confereFechamento;

  // ---- dados do dia (cada consulta só liga para quem pode ver) ----------------------------
  const checklistQuery = useQuery({ queryKey: ["checklist-items", "home"], queryFn: () => listRemoteChecklistItems(), enabled: useRemote });
  const checklist = useMemo(() => {
    const items = useRemote && checklistQuery.data ? checklistQuery.data.items : readLocalValue(checklistStorageKey(), createChecklistRun());
    return checklistSummary(filterChecklistItemsByCargo(items, cargo));
  }, [cargo, checklistQuery.data, useRemote]);

  // Avisos importantes do Mural entram na Fila do dia (o resto do Mural está em /avisos).
  const avisosQuery = useQuery({ queryKey: ["avisos", "home"], queryFn: listRemoteAvisos, enabled: useRemote });
  const avisos = useMemo(() => activeAvisos(useRemote && avisosQuery.data ? avisosQuery.data : readLocalValue(muralStorageKey, initialAvisos)), [avisosQuery.data, useRemote]);

  const pagamentosQuery = useQuery({ queryKey: ["pagamentos-lembretes"], queryFn: listRemotePagamentos, enabled: useRemote && canLembretesPagamento(cargo) });
  const pagamentos = useMemo(() => {
    if (!canLembretesPagamento(cargo)) return null;
    return pagamentosSummary(useRemote ? pagamentosQuery.data ?? [] : readLocalValue<PagamentoLembrete[]>(pagamentosStorageKey, []));
  }, [cargo, pagamentosQuery.data, useRemote]);

  const buscaContas = veFinanceiro || papeis.pagaContas || papeis.aprovaContas;
  // As contas da fila pelos ANOS DA JANELA (revisão de 08/10/2026): em 31/12 a conta
  // de 02/01 que se paga nesse dia entra; em janeiro, as vencidas de dezembro também.
  // As mesmas chaves por ano da casca ("fin-expenses", ano).
  const contasDaFila = useContasDaFila({ hoje, ativo: useRemote && buscaContas });
  const finSalesQuery = useQuery({ queryKey: ["home-fin-sales", ano], queryFn: () => listRemoteFinSales(ano), enabled: useRemote && (veFinanceiro || canLancarDia(cargo)), staleTime: 60_000 });
  const finPurchasesQuery = useQuery({ queryKey: ["home-fin-purchases", ano], queryFn: () => listRemoteFinPurchases(ano), enabled: useRemote && veFinanceiro, staleTime: 60_000 });
  // As notas já anexadas entram na mesma conta que a tela de Contas a Pagar faz.
  // Sem elas, a Home dizia "3 sem boleto anexado" e a tela mostrava 0.
  const notasDaContaQuery = useQuery({ queryKey: ["fin-expense-notas"], queryFn: listRemoteExpenseNotas, enabled: useRemote && buscaContas, staleTime: 30_000 });
  const finInvoicesQuery = useQuery({ queryKey: ["home-fin-invoices", ano], queryFn: () => listRemoteFinInvoices(ano), enabled: useRemote && financeiroCompleto, staleTime: 60_000 });
  // O fechamento de ontem: o ano é o do dia útil anterior (em 04/01 o "ontem" ainda é
  // dezembro) — as MESMAS chaves de cache do contador da casca.
  const anoDoFechamento = Number(diaUtilAnterior(hoje).slice(0, 4)) || ano;
  const veFechamento = financeiroCompleto || papeis.confereFechamento;
  const vendasDoFechamentoQuery = useQuery({
    queryKey: ["home-fin-sales", anoDoFechamento],
    queryFn: () => listRemoteFinSales(anoDoFechamento),
    enabled: useRemote && veFechamento,
    staleTime: 60_000,
  });
  const finRecQuery = useQuery({ queryKey: ["home-fin-reconciliations", anoDoFechamento], queryFn: () => listRemoteFinReconciliations(anoDoFechamento), enabled: useRemote && veFechamento, staleTime: 60_000 });
  const lucroPublicoQuery = useQuery({ queryKey: ["fin-lucro-publico", mesAtual], queryFn: () => loadRemoteFinLucroPublico(mesAtual), enabled: useRemote, staleTime: 60_000 });

  // Na prévia as contas vivem no aparelho; o "Paguei" grava lá e pede para reler.
  const [versaoLocal, setVersaoLocal] = useState(0);
  const sales = useMemo(() => (useRemote ? finSalesQuery.data ?? [] : loadLocalFinSales()), [finSalesQuery.data, useRemote]);
  const expenses = useMemo(() => {
    void versaoLocal;
    return useRemote ? contasDaFila.contas : loadLocalFinExpenses();
  }, [contasDaFila.contas, useRemote, versaoLocal]);
  const vendasDoFechamento = useMemo(() => (useRemote ? vendasDoFechamentoQuery.data ?? [] : loadLocalFinSales()), [vendasDoFechamentoQuery.data, useRemote]);
  // Sem a resposta das conferências ainda, não acusa o fechamento: espera (como a casca).
  const conferencias = useMemo(() => (useRemote ? finRecQuery.data : loadLocalFinReconciliations()), [useRemote, finRecQuery.data]);
  const notasAnexadas = useMemo(() => new Set((notasDaContaQuery.data ?? []).map((nota) => nota.expenseRef)), [notasDaContaQuery.data]);

  const filaFinanceira = useMemo(() => {
    if (!veFinanceiro) return null;
    return buildFilaFinanceira({
      // Provisão é reserva, não conta a cobrar (10/08/2026).
      expenses: expenses.filter((expense) => !expense.categoryRef.startsWith("cat-poup-")),
      purchases: useRemote ? finPurchasesQuery.data ?? [] : [],
      notasAnexadas,
      hoje,
    });
  }, [veFinanceiro, expenses, finPurchasesQuery.data, useRemote, hoje, notasAnexadas]);

  const comprovantesPendentes = useMemo(() => {
    if (!veFinanceiro && !canLancarDia(cargo)) return null;
    const pendentes = pagamentosSemComprovante(sales, `${mesAtual}-01`, hoje);
    return pendentes.length ? { quantidade: pendentes.length, valor: pendentes.reduce((soma, p) => soma + (p.payment.amount || 0), 0) } : null;
  }, [veFinanceiro, cargo, sales, mesAtual, hoje]);

  const comandasSemNota = useMemo(() => {
    if (!financeiroCompleto) return null;
    const pendentes = salesPendingInvoice(sales, finInvoicesQuery.data ?? [], mesAtual);
    return pendentes.length ? { quantidade: pendentes.length, valor: pendentes.reduce((soma, p) => soma + p.remaining, 0) } : null;
  }, [financeiroCompleto, sales, finInvoicesQuery.data, mesAtual]);

  const fechamento = useMemo(
    () => (financeiroCompleto && conferencias ? fechamentoPendente(vendasDoFechamento, conferencias, hoje) : null),
    [financeiroCompleto, vendasDoFechamento, conferencias, hoje],
  );

  // ---- CRM: as tarefas da pessoa (mesma regra de Minhas tarefas) ---------------------------
  const crm = useCrmState();
  const crmTasks = useMemo<TarefaCrmDaFila[]>(() => {
    if (!veCrm || !pessoa) return [];
    const role = cargoToCrmRole(cargo);
    const gestao = isCrmManagement(cargo);
    const contatos = new Map(crm.state.contacts.map((contact) => [contact.id, contact]));
    return crm.state.tasks
      .filter((task) => canUserAccessTask(pessoa, task))
      .filter((task) => (gestao ? (role && task.assignedToRole === role) || task.assignedToUserId === pessoa.id : true))
      .map((task) => ({ id: task.id, title: task.title, dueAt: task.dueAt, status: task.status, contato: contactDisplayName(contatos.get(task.contactId)), taskType: task.taskType }));
  }, [veCrm, pessoa, cargo, crm.state.contacts, crm.state.tasks]);

  // ---- Estoque: os setores DA pessoa ------------------------------------------------------
  // 06/10/2026 (pedidos de compra): cada cargo é um setor. Antes a lista era
  // fixa (Recepção e Enfermagem para quase todos, sem Pacientes) e cobrava
  // "abaixo do mínimo" até de item já comprado. Agora: só os setores da pessoa,
  // contando como tarefa o que falta e ninguém pediu; pedido feito e "a caminho"
  // vão só para a frase. A coordenação vê os outros setores como "para saber".
  const estoque = useEstoque();
  const compras = useCompras();
  const estoqueFila = useMemo(() => {
    if (!veEstoque) return [];
    return estoqueParaAFila({
      items: estoque.items,
      moves: estoque.moves,
      purchases: estoque.compras,
      pedidos: compras.pedidos,
      cargo,
      ehCoordenacao: isCoordenacao(cargo),
      // 07/10/2026: quem pode pedir vai do cartão direto ao pedido preenchido.
      podePedir: canEditModule(pessoa, "compras"),
    });
  }, [veEstoque, cargo, pessoa, estoque.items, estoque.moves, estoque.compras, compras.pedidos]);

  // ---- Pedidos de compra: a vez de cada papel (POP-COMP-001) ------------------------------
  // Quem aprova vê os que esperam decisão; o financeiro completo, os aprovados
  // para comprar; o setor (e quem pediu), o devolvido e o que já devia ter chegado.
  const pedidosFila = useMemo(() => {
    if (!pessoa) return null;
    return pedidosParaAFila(
      compras.pedidos,
      { id: pessoa.id, cargo, aprova: podeAprovar(pessoa), compra: podeComprar(pessoa), pede: canSeeModule(pessoa, "compras") },
      hoje,
    );
  }, [pessoa, cargo, compras.pedidos, hoje]);

  // ---- NPS da concierge: quem passou e não recebeu o contato -------------------------------
  const npsQuery = useQuery({ queryKey: ["nps-contatos", "home"], queryFn: listRemoteNpsContatos, enabled: useRemote && veNps, staleTime: 60_000 });
  const npsFila = useMemo(() => {
    if (!veNps) return null;
    const fila = filaDeContatos(crm.state.contacts, sales, npsQuery.data ?? [], hoje);
    return fila.length ? { quantidade: fila.length, maisAntigoDias: Math.max(...fila.map((item) => item.diasDesde)) } : null;
  }, [veNps, crm.state.contacts, sales, npsQuery.data, hoje]);

  // ---- achados da rotina diária (14/09/2026): abertos, filtrados pelo cargo -------------
  // Os que a Home já calcula ao vivo (comprovante, fechamento) não entram de novo.
  const achadosQuery = useQuery({ queryKey: ["achados-diarios"], queryFn: listRemoteAchados, enabled: useRemote, staleTime: 60_000 });
  const achados = useMemo(() => {
    const cargoAtual = cargo ?? "";
    return (achadosQuery.data ?? [])
      .filter((a) => a.tipo !== "COMPROVANTE" && a.tipo !== "FECHAMENTO")
      .filter((a) => (a.cargos.length ? a.cargos.includes(cargoAtual) : isCoordenacao(cargo)))
      .map((a) => ({ id: a.id, chave: a.chave, tipo: a.tipo, dia: a.dia, titulo: a.titulo, detalhe: a.detalhe, valor: a.valor, href: a.href, urgencia: a.urgencia, quantidade: a.quantidade }));
  }, [achadosQuery.data, cargo]);
  // SEMÁFORO VERMELHO (14/09/2026, proposta 3.3): quem cuida do plano vê quantos pacientes pedem ligação hoje.
  const vermelhos = useMemo(() => {
    if (!(cargo === "enfermeira" || isCoordenacao(cargo))) return [] as { id: string; nome: string; frase: string }[];
    return buildProgramaBoard(crm.state, hoje)
      .filter((card) => card.risco.nivel === "VERMELHO")
      .map((card) => ({ id: card.dealId, nome: card.patientName, frase: card.risco.frase }));
  }, [crm.state, cargo, hoje]);
  const achadosComRisco = useMemo(
    () =>
      vermelhos.length
        ? [...achados, { id: "", chave: "risco:vermelho", tipo: "RISCO", dia: hoje, titulo: `${vermelhos.length} paciente${vermelhos.length > 1 ? "s" : ""} do plano em semáforo vermelho`, detalhe: vermelhos.slice(0, 3).map((v) => v.nome).join(", ") + (vermelhos.length > 3 ? "…" : "") + " — ligar hoje", valor: null, href: "/acompanhamento", urgencia: 1 as const, quantidade: vermelhos.length }]
        : achados,
    [achados, vermelhos, hoje],
  );
  const queryClientHome = useQueryClient();
  async function resolverAchado(item: { achadoId?: string; titulo: string }) {
    if (!item.achadoId) return;
    try {
      await resolverRemoteAchado(item.achadoId, pessoa?.id ?? null);
      toast(`"${item.titulo}" marcado como resolvido.`, { tom: "ok" });
    } catch (error) {
      toast(`Não consegui marcar: ${error instanceof Error ? error.message : String(error)}`, { tom: "erro" });
    }
    await queryClientHome.invalidateQueries({ queryKey: ["achados-diarios"] });
  }
  async function atualizarAchados() {
    const r = await dispararRotinaDiaria();
    if (!r.ok) toast(`A rotina não rodou: ${r.error ?? "erro"}`, { tom: "erro" });
    else {
      const total = Object.values(r.resumo ?? {}).reduce((a, b) => a + b, 0);
      toast(total ? `Rotina rodou: ${total} achado${total > 1 ? "s" : ""} em aberto.` : "Rotina rodou: nada pendente encontrado.", { tom: "ok" });
    }
    await queryClientHome.invalidateQueries({ queryKey: ["achados-diarios"] });
  }

  // ---- silenciados (por pessoa, neste aparelho) ------------------------------------------
  const silenciadosKey = `app-bratan-fila-silenciada:${pessoa?.id ?? "anon"}`;
  const [silenciados, setSilenciados] = useState<Record<string, string>>(() => limparSilenciados(readLocalValue<Record<string, string>>(silenciadosKey, {}), hoje));
  useEffect(() => {
    setSilenciados(limparSilenciados(readLocalValue<Record<string, string>>(silenciadosKey, {}), hoje));
  }, [silenciadosKey, hoje]);
  function silenciar(chave: string, ateISO: string) {
    setSilenciados((atual) => {
      const proximo = { ...atual, [chave]: ateISO };
      writeLocalValue(silenciadosKey, proximo);
      return proximo;
    });
  }

  const fila = useMemo(
    () =>
      buildFilaDoDia({
        hoje,
        financeira: filaFinanceira,
        comprovantesPendentes,
        comandasSemNota,
        crmTasks,
        lembretes: pagamentos
          ? {
              vencidos: pagamentos.vencidos.map((l) => ({ id: l.id, nome: l.pacienteNome, valor: l.valorPendente, data: l.dataPrevista })),
              hoje: pagamentos.hoje.map((l) => ({ id: l.id, nome: l.pacienteNome, valor: l.valorPendente, data: l.dataPrevista })),
            }
          : null,
        estoque: estoqueFila,
        pedidos: pedidosFila,
        npsFila,
        // A rotina e a tarefa "até concluir" chegam com emoji; na tela vai a palavra.
        checklist: { pendentes: checklist.pendingCount, proxima: checklist.nextItem ? marcaDaTarefa(checklist.nextItem.descricao).texto : null },
        fechamentoPendente: fechamento,
        avisosImportantes: avisos.filter((aviso) => aviso.prioridade === "importante").map((aviso) => ({ id: aviso.id, corpo: aviso.corpo, publicadoEm: aviso.publicadoEm })),
        achados: achadosComRisco,
        silenciados,
      }),
    [hoje, filaFinanceira, comprovantesPendentes, comandasSemNota, crmTasks, pagamentos, estoqueFila, pedidosFila, npsFila, checklist, fechamento, avisos, achadosComRisco, silenciados],
  );
  const carregando = useRemote && (contasDaFila.carregando || finSalesQuery.isLoading || checklistQuery.isLoading || (veCrm && crm.isSyncing && crm.state.tasks.length === 0));

  // ---- PARA DECIDIR: a mesma conta do contador do Início ----------------------------------
  const pd = useMemo(
    () =>
      montarParaDecidir({
        ...papeis,
        pedidos: compras.pedidos,
        contas: expenses,
        limiteAprovacao,
        notasAnexadas,
        confereFechamento: papeis.confereFechamento && conferencias !== undefined,
        comandas: vendasDoFechamento,
        conferencias: conferencias ?? [],
        hoje,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [papeis.aprovaPedidos, papeis.pagaContas, papeis.aprovaContas, papeis.confereFechamento, compras.pedidos, expenses, limiteAprovacao, notasAnexadas, vendasDoFechamento, conferencias, hoje],
  );
  const carregandoDecisoes =
    useRemote &&
    ((papeis.aprovaPedidos && compras.carregando) ||
      ((papeis.pagaContas || papeis.aprovaContas) && contasDaFila.carregando) ||
      (papeis.confereFechamento && (vendasDoFechamentoQuery.isLoading || finRecQuery.isLoading)));
  const frase = fraseDoInicio(pd, hoje);
  const resto = useMemo(() => restoDaFila(fila, pd.chavesNaFila), [fila, pd.chavesNaFila]);

  const aprovacao = useAprovarComDesfazer(compras);
  const pagamento = usePagarConta({ remoto: useRemote, hoje, limiteAprovacao, aoMudarLocal: () => setVersaoLocal((v) => v + 1) });

  // O NÚMERO NO ÍCONE DO APP (Badging API, só no app instalado): mora aqui, e não
  // na Fila do dia, porque a fila só aparece quando sobra algo além das decisões
  // (revisão de 08/10/2026). Conta o mesmo de sempre: atrasados + hoje da fila
  // inteira (fila.badge). Falha em silêncio fora do app instalado.
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (fila.badge > 0) void nav.setAppBadge?.(fila.badge)?.catch(() => undefined);
      else void nav.clearAppBadge?.()?.catch(() => undefined);
    } catch {
      /* navegador sem Badging API */
    }
  }, [fila.badge]);

  // ---- o aviso das notas sem CPF (a MESMA lista do sino, lida pela casca) -------------------
  const notas = contadores.notasSemCpf;
  const avisoDasNotas = useMemo(() => {
    if (!contadores.veNotas || !notas.length) return null;
    const texto = fraseDasNotasSemCpf(notas);
    const corte = texto.search(/ (esperam|espera) /);
    return corte > 0 ? { destaque: texto.slice(0, corte), resto: texto.slice(corte), href: LINK_DO_LOTE } : { destaque: "", resto: texto, href: LINK_DO_LOTE };
  }, [contadores.veNotas, notas]);

  // ---- PARA SABER: o mês até agora e a agenda de hoje ------------------------------------
  const exemplo = !useRemote;
  const lucroPublico = lucroPublicoQuery.data ?? null;
  const lucro: LucroDoMes | null = exemplo ? mesDeExemploDaPrevia(hoje) : lucroPublico;
  const mes = useMemo(() => mesAteAgora({ hoje, feito: lucro?.feitoMes ?? 0, meta: lucro?.metaMes ?? 0 }), [hoje, lucro?.feitoMes, lucro?.metaMes]);
  const ocupacao = useMemo(() => (veFinanceiro ? buildOcupacaoMes({ sales, monthKey: mesAtual, hoje }) : null), [veFinanceiro, sales, mesAtual, hoje]);

  // A agenda: o MESMO espelho do iClinic (e as mesmas chaves de cache) da tela Agenda do dia.
  const semana = semanaDoRelatorio(hoje);
  const espelhoQuery = useQuery({ queryKey: ["agenda-espelho", semana.de, semana.ate], queryFn: () => listAgendaDoPeriodo(semana.de, semana.ate), enabled: useRemote && veAgenda, refetchInterval: 5 * 60_000 });
  const presencasQuery = useQuery({ queryKey: ["agenda-presenca", semana.de, semana.ate], queryFn: () => listPresencasDoPeriodo(semana.de, semana.ate), enabled: useRemote && veAgenda, refetchInterval: 5 * 60_000 });
  const agenda = useMemo(() => {
    if (!veAgenda) return null;
    if (!useRemote) return agendaDoInicio(agendaDeExemploDaPrevia(hoje), hoje, agora);
    if (!espelhoQuery.data) return null;
    const itens = montarItens({ linhas: espelhoQuery.data, presencas: presencasQuery.data?.linhas ?? [], contatos: [], hojeISO: hoje });
    return agendaDoInicio(itens, hoje, agora);
  }, [veAgenda, useRemote, espelhoQuery.data, presencasQuery.data, hoje, agora]);

  const dia = tituloDoDia(hoje);
  const podeRodarRotina = useRemote && isCoordenacao(cargo);
  const fioNoCelular = <FioDoMes diasUteis={mes.diasUteis} hoje={mes.hojeDiaUtil} mes={mes.nome} sobre="papel" />;

  return (
    <div className="mx-auto w-full max-w-[1200px] font-sans text-tinta">
      <Cabecalho
        sobrancelha="Início"
        titulo={
          <>
            <em>{dia.semana}</em> {dia.resto}
          </>
        }
        frase={
          !cargo ? (
            // Sem cargo, ninguém decide nada aqui ainda (a frase de antes da etapa 2).
            "Acesso ainda não configurado. Peça à gestão para definir o seu cargo."
          ) : carregandoDecisoes && pd.total === 0 ? (
            "Conferindo o que espera sua decisão…"
          ) : (
            <>
              {frase.destaque ? <strong>{frase.destaque}</strong> : null}
              {frase.destaque ? frase.resto : frase.resto.trim()}
            </>
          )
        }
        acoes={
          canLancarDia(cargo) ? (
            <Botao
              variante="secundario"
              icone={<Banknote className="h-4 w-4" aria-hidden="true" />}
              onPointerEnter={() => prefetchRoute("/financeiro/lancar-dia")}
              onFocus={() => prefetchRoute("/financeiro/lancar-dia")}
              onClick={() => navigate("/financeiro/lancar-dia")}
            >
              Lançar dia
            </Botao>
          ) : null
        }
      />
      {/* No celular o fio do mês fica logo abaixo do cabeçalho (imagem 05); no computador, no bloco do mês. */}
      <div className="-mt-1 mb-6 md:hidden">{fioNoCelular}</div>

      <div className="grid items-start gap-8 max-md:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {temPapelDeDecisao || avisoDasNotas ? (
            <ParaDecidirFolha
              pd={pd}
              hoje={hoje}
              carregando={Boolean(carregandoDecisoes)}
              aprovando={aprovacao.aprovando}
              onAprovar={aprovacao.aprovar}
              onDesfazer={aprovacao.desfazer}
              pagando={pagamento.gravando}
              onPagar={(item) => void pagamento.pagar(item)}
              avisoDasNotas={avisoDasNotas}
            />
          ) : null}
          {/* A fila aparece quando sobra algo além das decisões — e sempre para a
              coordenação, que tem nela o "Rodar a rotina agora" (revisão de 08/10/2026). */}
          {resto.itens.length || resto.silenciados || !(temPapelDeDecisao || avisoDasNotas) || podeRodarRotina ? (
            <FilaDoDiaHome
              fila={resto}
              carregando={Boolean(carregando)}
              titulo={temPapelDeDecisao || avisoDasNotas ? "Também para hoje" : "Para hoje"}
              onSilenciar={silenciar}
              onResolver={(item) => void resolverAchado(item)}
              onAtualizarAchados={podeRodarRotina ? atualizarAchados : undefined}
            />
          ) : null}
        </div>

        <ParaSaberDoInicio
          mes={mes}
          lucro={lucro}
          carregandoLucro={useRemote && lucroPublicoQuery.isLoading}
          exemplo={exemplo}
          ocupacao={ocupacao}
          tarefas={{ feitas: checklist.doneCount, total: checklist.total }}
          agenda={agenda}
          carregandoAgenda={useRemote && veAgenda && espelhoQuery.isLoading}
          agora={agora}
          links={{
            lucro: canLembretesPagamento(cargo) ? "/financeiro/lucro" : undefined,
            metas: veFinanceiro ? "/financeiro/metas" : undefined,
            painel: veFinanceiro ? "/financeiro/painel" : undefined,
          }}
        />
      </div>
    </div>
  );
}
