// A HOME É A FILA DO DIA (aprovado pelo Lucas em 14/09/2026, proposta 4.1).
//
// Antes: um painel de atalhos com um hero animado e cartões de resumo; a fila
// financeira aparecia só para quem cuida do financeiro. Agora: ao abrir o app,
// cada pessoa vê UMA lista do que precisa de ação — já filtrada pelo cargo e
// pelos acessos por pessoa — depois os sinais do mês (cabe gastar, meta do dia,
// ocupação de sala) e, por fim, os atalhos, que viraram a segunda tela.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  BrainCircuit,
  CalendarClock,
  CheckSquare,
  CircleDollarSign,
  ClipboardList,
  Coins,
  DoorOpen,
  FileText,
  Goal,
  History,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Target,
  UsersRound,
  Utensils,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import {
  canAdministracao,
  canBaseModules,
  canComprovantes,
  canCrmBratan,
  canFinanceiroFull,
  canFinanceiroView,
  canInteligencia360,
  canLancarDia,
  canLembretesPagamento,
  canSeeModule,
  cargoGroup,
  cargoLabels,
} from "@/lib/access";
import { formatLongDate, formatShortTime, readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { prefetchRoute } from "@/lib/routePreload";
import { cn } from "@/lib/utils";
import { checklistStorageKey, checklistSummary, createChecklistRun, filterChecklistItemsByCargo } from "@/features/checklist/checklistData";
import { activeAvisos, initialAvisos, muralStorageKey } from "@/features/mural/muralData";
import { pagamentosStorageKey, pagamentosSummary, type PagamentoLembrete } from "@/features/pagamentos/pagamentosData";
import {
  dispararRotinaDiaria,
  listRemoteAchados,
  listRemoteAvisos,
  listRemoteChecklistItems,
  listRemoteFinExpenses,
  listRemoteFinInvoices,
  listRemoteFinPurchases,
  listRemoteFinReconciliations,
  listRemoteFinSales,
  listRemoteNpsContatos,
  listRemotePagamentos,
  loadRemoteFinLucroPublico,
  resolverRemoteAchado,
} from "@/lib/remoteData";
import { toast } from "@/components/ui/avisos";
import { isCoordenacao } from "@/lib/access";
import { loadLocalFinExpenses, loadLocalFinSales, moneyFin, pagamentosSemComprovante, salesPendingInvoice } from "@/features/financeiro/financeiroData";
import { buildFilaFinanceira } from "@/features/financeiro/filaFinanceira";
import { buildOcupacaoMes, formatHoras } from "@/features/financeiro/ocupacaoSala";
import { canUserAccessTask, cargoToCrmRole, contactDisplayName, isCrmManagement } from "@/features/crm/crmData";
import { useCrmState } from "@/features/crm/useCrmState";
import { useEstoque } from "@/features/estoque/useEstoque";
import { posicaoDoSetor, setorLabels, type EstoqueSetor } from "@/features/estoque/estoqueData";
import { filaDeContatos } from "@/features/concierge/npsData";
import { buildFilaDoDia, fechamentoPendente, limparSilenciados, type TarefaCrmDaFila } from "./filaDoDia";
import { FilaDoDiaHome } from "./FilaDoDiaHome";

// ---- Atalhos (a segunda tela) ------------------------------------------------
const modules = [
  { title: "Tarefas do dia", href: "/tarefas", icon: CheckSquare, action: "Abrir checklist", allowed: canBaseModules },
  { title: "Almoço", href: "/almoco", icon: Utensils, action: "Ver cobertura", allowed: canBaseModules },
  { title: "Mural de avisos", href: "/mural", icon: Bell, action: "Abrir mural", allowed: canBaseModules },
  { title: "Suas Estalecas", href: "/estalecas", icon: Coins, action: "Minha carteira", allowed: canBaseModules },
  { title: "POPs & Fluxos", href: "/pops-fluxos", icon: FileText, action: "Biblioteca", allowed: canBaseModules },
  { title: "Comprovantes", href: "/comprovantes", icon: ReceiptText, action: "Anexar", allowed: canComprovantes },
  { title: "Minhas tarefas CRM", href: "/crm/minhas-tarefas", icon: ClipboardList, action: "Meus toques", allowed: canCrmBratan },
  { title: "Kanban Comercial", href: "/crm/vendas", icon: Target, action: "Ver vendas", allowed: canCrmBratan },
  { title: "Cadências", href: "/crm/cadencias", icon: MessageCircle, action: "Ver cadências", allowed: canCrmBratan },
  { title: "Lançar Dia", href: "/financeiro/lancar-dia", icon: CircleDollarSign, action: "Comanda", allowed: canLancarDia },
  { title: "Contas a Pagar", href: "/financeiro/contas", icon: ReceiptText, action: "Fila financeira", allowed: canFinanceiroView },
  { title: "Lucro Inteligente", href: "/financeiro/lucro", icon: Wallet, action: "Envelopes", allowed: canLembretesPagamento },
  { title: "Painel do Mês", href: "/financeiro/painel", icon: Goal, action: "Reunião", allowed: canFinanceiroView },
  { title: "Lembretes de pagamento", href: "/lembretes-pagamento", icon: CalendarClock, action: "Ver lembretes", allowed: canLembretesPagamento },
  { title: "Inteligência 360", href: "/inteligencia-360", icon: BrainCircuit, action: "Abrir 360", allowed: canInteligencia360 },
  { title: "Colaboradores", href: "/administracao/colaboradores", icon: UsersRound, action: "Gerir equipe", allowed: canAdministracao },
  { title: "Segurança", href: "/administracao/seguranca", icon: ShieldCheck, action: "Ver segurança", allowed: canAdministracao },
  { title: "Auditoria", href: "/administracao/auditoria", icon: History, action: "Ver registros", allowed: canAdministracao },
];

const grupos = [
  { title: "Dia a dia", hrefs: ["/tarefas", "/almoco", "/mural", "/estalecas", "/pops-fluxos", "/comprovantes"] },
  { title: "Comercial", hrefs: ["/crm/minhas-tarefas", "/crm/vendas", "/crm/cadencias"] },
  { title: "Financeiro", hrefs: ["/financeiro/lancar-dia", "/financeiro/contas", "/financeiro/lucro", "/financeiro/painel", "/lembretes-pagamento"] },
  { title: "Coordenação", hrefs: ["/inteligencia-360", "/administracao/colaboradores", "/administracao/seguranca", "/administracao/auditoria"] },
];

function warmRouteProps(href: string) {
  return {
    onPointerEnter: () => prefetchRoute(href),
    onFocus: () => prefetchRoute(href),
    onTouchStart: () => prefetchRoute(href),
  };
}

function Sinal({ icon: Icon, rotulo, valor, frase, tom = "default", href }: { icon: React.ComponentType<{ className?: string }>; rotulo: string; valor: string; frase: string; tom?: "default" | "gold" | "alerta"; href?: string }) {
  const corpo = (
    <CardContent className="p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </div>
        <Badge variant={tom === "gold" ? "gold" : "muted"}>{rotulo}</Badge>
      </div>
      <p className={cn("text-2xl font-bold tabular-nums", tom === "alerta" ? "text-red-700" : "text-brand-tinta")}>{valor}</p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{frase}</p>
    </CardContent>
  );
  const classes = cn("border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur", tom === "gold" && "border-brand-dourado/45 bg-brand-creme/45", tom === "alerta" && "border-red-200 bg-red-50/60", href && "transition hover:border-brand-musgo/40");
  if (href) {
    return (
      <Link to={href} {...warmRouteProps(href)} className="block">
        <Card className={classes}>{corpo}</Card>
      </Link>
    );
  }
  return <Card className={classes}>{corpo}</Card>;
}

export function HomePage() {
  const { pessoa, session, isPreview } = useAuth();
  const navigate = useNavigate();
  const firstName = pessoa?.nome.split(" ")[0] ?? "Equipe";
  const cargo = pessoa?.cargo;
  const useRemote = Boolean(pessoa && session && !isPreview);
  const now = useMemo(() => new Date(), []);
  const hoje = todayISO();
  const mesAtual = hoje.slice(0, 7);
  const ano = Number(hoje.slice(0, 4));

  const veFinanceiro = canFinanceiroView(cargo);
  const financeiroCompleto = canFinanceiroFull(cargo);
  const veEstoque = canSeeModule(pessoa, "estoque");
  const veNps = canSeeModule(pessoa, "concierge-nps");
  const veCrm = canCrmBratan(cargo) && canSeeModule(pessoa, "crm");

  // ---- dados do dia (cada consulta só liga para quem pode ver) ----------------------------
  const checklistQuery = useQuery({ queryKey: ["checklist-items", "home"], queryFn: () => listRemoteChecklistItems(), enabled: useRemote });
  const checklist = useMemo(() => {
    const items = useRemote && checklistQuery.data ? checklistQuery.data.items : readLocalValue(checklistStorageKey(), createChecklistRun());
    return checklistSummary(filterChecklistItemsByCargo(items, cargo));
  }, [cargo, checklistQuery.data, useRemote]);

  const avisosQuery = useQuery({ queryKey: ["avisos", "home"], queryFn: listRemoteAvisos, enabled: useRemote });
  const avisos = useMemo(() => activeAvisos(useRemote && avisosQuery.data ? avisosQuery.data : readLocalValue(muralStorageKey, initialAvisos)), [avisosQuery.data, useRemote]);

  const pagamentosQuery = useQuery({ queryKey: ["pagamentos-lembretes"], queryFn: listRemotePagamentos, enabled: useRemote && canLembretesPagamento(cargo) });
  const pagamentos = useMemo(() => {
    if (!canLembretesPagamento(cargo)) return null;
    return pagamentosSummary(useRemote ? pagamentosQuery.data ?? [] : readLocalValue<PagamentoLembrete[]>(pagamentosStorageKey, []));
  }, [cargo, pagamentosQuery.data, useRemote]);

  const finExpensesQuery = useQuery({ queryKey: ["fin-expenses", ano], queryFn: () => listRemoteFinExpenses(ano), enabled: useRemote && veFinanceiro, staleTime: 60_000 });
  const finSalesQuery = useQuery({ queryKey: ["home-fin-sales"], queryFn: () => listRemoteFinSales(ano), enabled: useRemote && (veFinanceiro || canLancarDia(cargo)), staleTime: 60_000 });
  const finPurchasesQuery = useQuery({ queryKey: ["home-fin-purchases", ano], queryFn: () => listRemoteFinPurchases(ano), enabled: useRemote && veFinanceiro, staleTime: 60_000 });
  const finInvoicesQuery = useQuery({ queryKey: ["home-fin-invoices", ano], queryFn: () => listRemoteFinInvoices(ano), enabled: useRemote && financeiroCompleto, staleTime: 60_000 });
  const finRecQuery = useQuery({ queryKey: ["home-fin-reconciliations", ano], queryFn: () => listRemoteFinReconciliations(ano), enabled: useRemote && financeiroCompleto, staleTime: 60_000 });
  const lucroPublicoQuery = useQuery({ queryKey: ["fin-lucro-publico", mesAtual], queryFn: () => loadRemoteFinLucroPublico(mesAtual), enabled: useRemote, staleTime: 60_000 });
  const lucroPublico = lucroPublicoQuery.data ?? null;

  const sales = useMemo(() => (useRemote ? finSalesQuery.data ?? [] : loadLocalFinSales()), [finSalesQuery.data, useRemote]);
  const expenses = useMemo(() => (useRemote ? finExpensesQuery.data ?? [] : loadLocalFinExpenses()), [finExpensesQuery.data, useRemote]);

  const filaFinanceira = useMemo(() => {
    if (!veFinanceiro) return null;
    return buildFilaFinanceira({
      // Provisão é reserva, não conta a cobrar (10/08/2026).
      expenses: expenses.filter((expense) => !expense.categoryRef.startsWith("cat-poup-")),
      purchases: useRemote ? finPurchasesQuery.data ?? [] : [],
      hoje,
    });
  }, [veFinanceiro, expenses, finPurchasesQuery.data, useRemote, hoje]);

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

  const fechamento = useMemo(() => (financeiroCompleto ? fechamentoPendente(sales, finRecQuery.data ?? [], hoje) : null), [financeiroCompleto, sales, finRecQuery.data, hoje]);

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

  // ---- Estoque: só os setores que a pessoa cuida ------------------------------------------
  const estoque = useEstoque();
  const estoqueFila = useMemo(() => {
    if (!veEstoque) return [];
    const setores: EstoqueSetor[] = cargo === "recepcionista" ? ["RECEPCAO"] : cargo === "enfermeira" || cargo === "nutricionista" ? ["ENFERMAGEM"] : ["RECEPCAO", "ENFERMAGEM"];
    return setores.map((setor) => {
      const posicao = posicaoDoSetor(estoque.items, estoque.moves, setor).filter((linha) => linha.status !== "OK");
      return { setor, rotulo: setorLabels[setor].split(" (")[0], itens: posicao.length, zerados: posicao.filter((linha) => linha.status === "ZERADO").length };
    });
  }, [veEstoque, cargo, estoque.items, estoque.moves]);

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
        npsFila,
        checklist: { pendentes: checklist.pendingCount, proxima: checklist.nextItem?.descricao ?? null },
        fechamentoPendente: fechamento,
        avisosImportantes: avisos.filter((aviso) => aviso.prioridade === "importante").map((aviso) => ({ id: aviso.id, corpo: aviso.corpo, publicadoEm: aviso.publicadoEm })),
        achados,
        silenciados,
      }),
    [hoje, filaFinanceira, comprovantesPendentes, comandasSemNota, crmTasks, pagamentos, estoqueFila, npsFila, checklist, fechamento, avisos, achados, silenciados],
  );
  const carregando = useRemote && (finExpensesQuery.isLoading || finSalesQuery.isLoading || checklistQuery.isLoading || (veCrm && crm.isSyncing && crm.state.tasks.length === 0));

  // ---- Sinais do mês -------------------------------------------------------------------
  const ocupacao = useMemo(() => (veFinanceiro ? buildOcupacaoMes({ sales, monthKey: mesAtual, hoje }) : null), [veFinanceiro, sales, mesAtual, hoje]);

  const atalhos = useMemo(() => {
    const permitidos = new Map(modules.filter((module) => module.allowed(cargo)).map((module) => [module.href, module]));
    return grupos.map((grupo) => ({ ...grupo, items: grupo.hrefs.map((href) => permitidos.get(href)).filter((item): item is (typeof modules)[number] => Boolean(item)) })).filter((grupo) => grupo.items.length);
  }, [cargo]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-oliva">{formatLongDate(now)}</p>
          <h1 className="mt-1 text-3xl leading-tight text-brand-musgo sm:text-4xl">Bom trabalho, {firstName}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cargo ? `${cargoLabels[cargo]} · ${cargoGroup(cargo)}` : "Acesso ainda não configurado."} · a fila abaixo é só o que depende de você.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" {...warmRouteProps("/tarefas")} onClick={() => navigate("/tarefas")}>
            <CheckSquare className="mr-1.5 h-4 w-4" aria-hidden="true" /> Checklist {checklist.progress}%
          </Button>
          {canLancarDia(cargo) ? (
            <Button type="button" size="sm" {...warmRouteProps("/financeiro/lancar-dia")} onClick={() => navigate("/financeiro/lancar-dia")}>
              <CircleDollarSign className="mr-1.5 h-4 w-4" aria-hidden="true" /> Lançar comanda
            </Button>
          ) : null}
        </div>
      </motion.section>

      <FilaDoDiaHome fila={fila} carregando={carregando} onSilenciar={silenciar} onResolver={(item) => void resolverAchado(item)} onAtualizarAchados={useRemote && isCoordenacao(cargo) ? atualizarAchados : undefined} />

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-2xl text-brand-musgo">
              Sinais do mês
              <InfoTip title="De onde vêm">
                &quot;Cabe gastar&quot; e a meta do dia vêm do retrato público do Lucro Inteligente (só números, sem paciente). A
                ocupação de sala é horas vendidas ÷ horas disponíveis até hoje (7 salas × 9 h nos dias úteis), o número mais alavancável
                da clínica; a faixa saudável é 75 a 85%.
              </InfoTip>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Os números que mudam a decisão de hoje, cada um com a sua frase.</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/mural" {...warmRouteProps("/mural")}>Ver avisos</Link>
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Sinal
            icon={Wallet}
            rotulo="Cabe gastar no mês"
            valor={lucroPublico ? moneyFin(lucroPublico.sobra) : "—"}
            frase={
              lucroPublico
                ? `${lucroPublico.sobra < -0.005 ? "já passou do que cabe" : "ainda cabe de contas"} · cabe ${moneyFin(lucroPublico.cabeGastar)} · pagas ${moneyFin(lucroPublico.contasPagas)}${lucroPublico.atualizadoEm ? ` · às ${formatShortTime(lucroPublico.atualizadoEm)}` : ""}`
                : "O financeiro ainda não publicou o mês no Lucro Inteligente."
            }
            tom={lucroPublico ? (lucroPublico.sobra >= -0.005 ? "gold" : "alerta") : "default"}
            href={canLembretesPagamento(cargo) ? "/financeiro/lucro" : undefined}
          />
          <Sinal
            icon={Goal}
            rotulo="Meta do dia"
            valor={lucroPublico && lucroPublico.metaDia ? moneyFin(lucroPublico.metaDia) : "—"}
            frase={
              lucroPublico && lucroPublico.metaDia
                ? `${lucroPublico.diaComDoutor ? "dia com Dr. Daniel" : "dia sem Dr. Daniel"} · feito hoje ${moneyFin(lucroPublico.feitoHoje)} · mês ${moneyFin(lucroPublico.feitoMes)} de ${moneyFin(lucroPublico.metaMes)}`
                : "Sem meta publicada para hoje."
            }
            tom={lucroPublico && lucroPublico.metaDia && lucroPublico.feitoHoje >= lucroPublico.metaDia ? "gold" : "default"}
            href={veFinanceiro ? "/financeiro/metas" : undefined}
          />
          {ocupacao ? (
            <Sinal
              icon={DoorOpen}
              rotulo={`Ocupação de sala · até ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`}
              valor={`${ocupacao.percentual.toLocaleString("pt-BR")}%`}
              frase={`${formatHoras(ocupacao.horasVendidas)} vendidas de ${formatHoras(ocupacao.horasDisponiveis)} disponíveis · faixa saudável ${ocupacao.meta.minima} a ${ocupacao.meta.maxima}%${ocupacao.horasParaMeta > 0 ? ` · faltam ${formatHoras(ocupacao.horasParaMeta)} para ${ocupacao.meta.minima}%` : ""}`}
              tom={ocupacao.percentual >= ocupacao.meta.minima ? "gold" : ocupacao.percentual < 40 ? "alerta" : "default"}
              href="/financeiro/painel"
            />
          ) : (
            <Sinal icon={CheckSquare} rotulo="Checklist" valor={`${checklist.progress}%`} frase={`${checklist.doneCount}/${checklist.total} tarefas concluídas`} tom={checklist.progress === 100 ? "gold" : "default"} href="/tarefas" />
          )}
          <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                Avisos recentes
                <Badge variant="muted">{avisos.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {avisos.slice(0, 2).map((aviso) => (
                <div key={aviso.id} className="rounded-md border border-brand-oliva/16 bg-white/65 p-2.5">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant={aviso.prioridade === "importante" ? "gold" : "muted"}>{aviso.prioridade === "importante" ? "Importante" : "Informativo"}</Badge>
                    <span className="text-[11px] font-semibold uppercase text-brand-oliva">{formatShortTime(aviso.publicadoEm)}</span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-5 text-brand-tinta">{aviso.corpo}</p>
                </div>
              ))}
              {!avisos.length ? <p className="text-sm text-muted-foreground">Sem avisos ativos.</p> : null}
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-2xl text-brand-musgo">Atalhos</h2>
          <p className="mt-1 text-sm text-muted-foreground">As áreas que o seu cargo libera. O menu e o ⌘K também chegam a todas.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {atalhos.map((grupo) => (
            <Card key={grupo.title} className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardContent className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-oliva">{grupo.title}</p>
                <div className="flex flex-wrap gap-2">
                  {grupo.items.map((module) => (
                    <Button key={module.href} asChild variant="outline" size="sm" className="justify-start gap-1.5">
                      <Link to={module.href} {...warmRouteProps(module.href)}>
                        <module.icon className="h-4 w-4" aria-hidden="true" />
                        {module.title}
                      </Link>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
