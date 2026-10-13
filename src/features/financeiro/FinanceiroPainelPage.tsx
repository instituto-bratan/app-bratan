// PAINEL DO MÊS — Relatórios + Gestão Mensal, numa tela só
//
// Pedido do Lucas (17/08/2026): "unifique as abas de relatórios e gestão mensal
// do dia cinco, porque está muito confuso... e eu queria que você melhorasse a
// tela visualmente, nas apresentações — as apresentações vão fazer direto no
// aplicativo mesmo. Mais dashboards, mais gráficos, mais fácil de entender. E
// pontos muito bons pra eu ressaltar em reuniões."
//
// Como está organizada: SEIS blocos, na ordem em que uma reunião acontece.
//   1. O mês em um olhar — números grandes, com a variação já calculada
//   2. Pontos para a reunião — as frases prontas, com número e consequência
//   3. Os três lucros — a ponte que responde "então quanto a gente ganhou?"
//   4. Evolução — 6 meses de faturamento, custo e lucro
//   5. De onde vem e para onde vai — donuts e ranking
//   6. Ritmo do mês — mapa de calor e força por dia da semana
// Depois disso, o que é de trabalho e não de apresentação: comparativo com
// explicações, PDCA e os arquivos para a contabilidade.
//
// MODO APRESENTAÇÃO: um botão esconde a navegação, aumenta a tipografia e mostra
// um bloco por vez com as setas — para apresentar do próprio app, sem PowerPoint.
//
// REDESENHO (08/10/2026, Papel & Musgo, etapa 4): um cabeçalho só (o mês, a fase
// e o fio do mês), a barra da reunião com os botões de trabalho (copiar, salvar,
// marcar como apresentado, fechar o mês), os nove blocos numerados como a pauta
// e, no modo apresentação, um bloco por vez num slide de papel com a barra de
// navegação flutuando. Leitura em BlocoSaber; o que se escreve (explicações,
// PDCA, resumo de fechamento) em BlocoFolha. Os números, as regras, os botões e
// a folha impressa do resumo são os mesmos de antes.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMesesFechados } from "./useMesesFechados";
import { mesEstaFechado, mesPorExtenso, podeFecharOMes } from "./mesFechado";
import { fecharRemoteMes } from "@/lib/remote/mesFechado";
import { confirmar, toast } from "@/components/ui/avisos";
import { ArrowLeft, ArrowRight, CalendarCheck, Check, CheckCircle2, Copy, Info, Lock, Maximize2, Minimize2 } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, FioDoMes } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { canEditModule, canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  buildCalendarHeat,
  buildExpenseCategoryRank,
  buildExpenseGroupDonut,
  buildItemTypeDonut,
  buildPaymentDonut,
  buildWeekdayStrength,
} from "@/lib/chartData";
import {
  buildEvolucaoMeses,
  buildFechamentoContabil,
  buildGestaoComparativo,
  buildGestaoMensal,
  buildPonteLucro,
  buildProvaDoDinheiro,
  buildTicketMedio,
  expenseEhCapex,
  moneyFin,
  monthKeyLabel,
  previousMonthKey,
  type GestaoIndicador,
} from "./financeiroData";
import { LucroDoMesExplicado } from "./LucroDoMesExplicado";
import { compromissosDoMes } from "./motorLucroInteligente";
import { diasUteisDoMes } from "./lucroInteligente";
import { useVersaoDoMotor } from "@/lib/useConfigDoMotor";
import { buildMetasBoard, buildPainelReuniao, metasForMonth, type MetasConfig } from "./metasData";
import { momentoDoMes, projecaoDoMes, tituloDaApresentacao } from "./momentoDoMes";
import { buildOcupacaoMes, formatHoras, heatDaOcupacao } from "./ocupacaoSala";
import { buildSemanaEmNumeros } from "./semanaEmNumeros";
import { NarrativaDoMesCard, PerguntarAo360Card } from "./PainelIaCards";
import { useCrmState } from "@/features/crm/useCrmState";
import { listRemoteAgendaEspelho, listRemoteColaboradores, listRemoteNpsRespostas, lerRemoteSaldoBanco } from "@/lib/remoteData";
import { PonteWaterfall } from "./PonteWaterfall";
import { buildPontosDaReuniao, type PontoDaReuniao } from "./pontosDaReuniao";
import { RelatoriosContabilidadeCard } from "./RelatoriosContabilidadeCard";
import { useFinanceiro } from "./useFinanceiro";
import { ResumoFechamentoCard } from "./ResumoFechamentoCard";
import { fechamentoEscritoVazio, ultimosMeses, type FechamentoEscrito } from "./resumoFechamento";
import { useMetasConfig } from "./useMetasConfig";
import { Campo, RecadoDaTela, Selecao, tabela } from "./pecasBancoFechamento";
import {
  BarraFina,
  COR_DO_TOM,
  CORES_GRAFICO,
  Etiqueta,
  Frase,
  IconeDoTom,
  Numero,
  OrigemDosDados,
  PALAVRA_DO_TOM,
  Rubrica,
  TituloDaSecao,
  Variacao,
  classeDoTexto,
  type TomResultado,
} from "./pecasResultados";
import { BarrasDoMes, CalendarioDoMes, Participacao, Ranking } from "./graficosResultados";

const PDCA_CAMPOS: { key: string; titulo: string; ajuda: string }[] = [
  { key: "plan", titulo: "PLAN — Planejar", ajuda: "O que vamos fazer no próximo mês para melhorar o número que caiu?" },
  { key: "do", titulo: "DO — Executar", ajuda: "O que já foi feito neste mês (ações concretas, com responsável)?" },
  { key: "check", titulo: "CHECK — Verificar", ajuda: "O que os números mostram? Ex.: 'o lucro caiu 8% porque a obra puxou os custos — é pontual'." },
  { key: "act", titulo: "ACT — Agir", ajuda: "O que muda de forma definitiva a partir de agora (padrão novo, POP, alçada)?" },
];

/** Mesma chave usada na P12 e nas Metas — a configuração é uma só. */

function formatarValor(valor: number, formato: GestaoIndicador["formato"]) {
  if (formato === "percentual") return `${valor.toFixed(2).replace(".", ",")}%`;
  if (formato === "numero") return String(Math.round(valor));
  return moneyFin(valor);
}

const grupoLabels: Record<PontoDaReuniao["grupo"], string> = {
  RESULTADO: "Resultado",
  META: "Meta",
  OPERACAO: "Operação",
  CUSTO: "Custo",
};

export function FinanceiroPainelPage() {
  const { pessoa } = useAuth();
  const readOnly = !canEditModule(pessoa, "fin-gestao");
  const hoje = todayISO();
  // MÊS FECHADO (29/09/2026): só a gestão financeira fecha e reabre.
  const queryClient = useQueryClient();
  const mesesFechados = useMesesFechados();
  const podeFecharMeses = canFinanceiroFull(pessoa?.cargo ?? null);
  const [fechandoMes, setFechandoMes] = useState(false);
  // Até o dia 5 a reunião é sobre o mês que FECHOU; depois, o mês corrente.
  const mesPadrao = Number(hoje.slice(8, 10)) <= 5 ? previousMonthKey(hoje.slice(0, 7)) : hoje.slice(0, 7);
  const [monthKey, setMonthKey] = useState(mesPadrao);
  const [apresentando, setApresentando] = useState(false);
  const [bloco, setBloco] = useState(0);
  const [degrauAberto, setDegrauAberto] = useState("");
  const financeiro = useFinanceiro(Number(monthKey.slice(0, 4)), { comAnoAnterior: true });
  const mesAnterior = previousMonthKey(monthKey);
  const emAndamento = monthKey === hoje.slice(0, 7);

  // ---- números -------------------------------------------------------------
  // A régua do motor do Lucro Inteligente chega do servidor: quando muda, refaz.
  const versaoDoMotor = useVersaoDoMotor();
  const atual = useMemo(
    () => buildGestaoMensal(financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, monthKey, financeiro.crediarioProfits),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, monthKey, financeiro.crediarioProfits, versaoDoMotor],
  );
  const anterior = useMemo(
    () => buildGestaoMensal(financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, mesAnterior, financeiro.crediarioProfits),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, mesAnterior, financeiro.crediarioProfits, versaoDoMotor],
  );
  // O que o mês deve ao executor (parcelas) e aos sócios — para a explicação do lucro.
  const compromissos = useMemo(
    () => compromissosDoMes({ sales: financeiro.sales, expenses: financeiro.expenses, monthKey, desde: `${Number(monthKey.slice(0, 4)) - 1}-01` }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeiro.sales, financeiro.expenses, monthKey, versaoDoMotor],
  );
  const indicadores = useMemo(() => buildGestaoComparativo(anterior, atual), [anterior, atual]);
  const evolucao = useMemo(
    () => buildEvolucaoMeses(financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, monthKey, 6, financeiro.crediarioProfits),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, monthKey, financeiro.crediarioProfits, versaoDoMotor],
  );
  const fechamento = useMemo(
    () => buildFechamentoContabil(financeiro.sales, financeiro.expensesPorCategoria, financeiro.savingsMoves, monthKey, financeiro.crediarioProfits),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeiro.sales, financeiro.expensesPorCategoria, financeiro.savingsMoves, monthKey, financeiro.crediarioProfits, versaoDoMotor],
  );

  // O saldo do banco é digitado na P12 (Prova do dinheiro) e reaproveitado aqui.
  // Vem do app desde 17/09/2026: lido do localStorage, ele existia só no aparelho
  // de quem digitou e o bloco de lucro real sumia para o resto da reunião.
  const saldoBanco = useQuery({ queryKey: ["fin-saldo-banco"], queryFn: lerRemoteSaldoBanco, staleTime: 30_000 });
  const saldoSalvoItau = saldoBanco.data && saldoBanco.data.valor > 0 ? saldoBanco.data.valor : null;
  const perto = monthKey === hoje.slice(0, 7) || monthKey === previousMonthKey(hoje.slice(0, 7));
  const lucroRealCaixa =
    perto && saldoSalvoItau !== null
      ? buildProvaDoDinheiro(financeiro.expenses, financeiro.crediarioProfits, saldoSalvoItau, hoje).livreNoBanco
      : null;
  const ponte = useMemo(() => buildPonteLucro(atual, fechamento, lucroRealCaixa), [atual, fechamento, lucroRealCaixa]);
  // Os lançamentos por trás de cada degrau da ponte (para a cascata clicável):
  // 1 = saídas do cofre da obra, 2 = saídas do cofre das provisões, 4 = obra paga (CAPEX).
  const detalhesPonte = useMemo(() => {
    const doMes = (data: string) => data.slice(0, 7) === monthKey;
    const categoriaPorId = new Map(financeiro.categories.map((categoria) => [categoria.id, categoria]));
    const cofreObra = financeiro.savingsMoves
      .filter((move) => doMes(move.moveDate) && (move.kind === "USO_OBRA" || move.kind === "DEVOLUCAO"))
      .map((move) => ({ dia: move.moveDate, label: move.reason || (move.kind === "DEVOLUCAO" ? "Devolução ao cofre" : "Uso na obra"), valor: move.kind === "DEVOLUCAO" ? -(move.amount || 0) : move.amount || 0 }));
    const cofreProvisoes = financeiro.savingsMoves
      .filter((move) => doMes(move.moveDate) && move.direction === "SAIDA" && move.kind !== "USO_OBRA" && move.kind !== "DEVOLUCAO" && move.kind !== "RENDIMENTO")
      .map((move) => ({ dia: move.moveDate, label: move.reason || "Saída do cofre", valor: move.amount || 0 }));
    const obra = financeiro.expensesPorCategoria
      .filter((expense) => doMes(expense.dueDate || expense.paidAt || "") && expenseEhCapex(expense, categoriaPorId.get(expense.categoryRef)))
      .map((expense) => ({ dia: expense.dueDate, label: `${expense.description}${expense.supplier ? ` · ${expense.supplier}` : ""}`, valor: expense.amount || 0 }))
      .sort((a, b) => b.valor - a.valor);
    return { 1: cofreObra, 2: cofreProvisoes, 4: obra } as Record<number, { dia?: string; label: string; valor: number }[]>;
  }, [financeiro.savingsMoves, financeiro.expensesPorCategoria, financeiro.categories, monthKey]);

  // Metas do servidor, iguais para todo mundo (29/09/2026).
  const metasConfig: MetasConfig = useMetasConfig();
  // MOMENTO DO MÊS (17/08/2026): a apresentação muda com o dia em que estamos.
  const momento = useMemo(() => momentoDoMes(monthKey, hoje), [monthKey, hoje]);
  // 13/10/2026 (revisão da etapa 4): o FIO do mês usa o calendário com feriado
  // (o mesmo do Lucro e do Início), para as telas dizerem o mesmo "dia útil N de
  // M" na reunião. Só a marcação do fio: a fase e a projeção do mês continuam
  // em momentoDoMes, sem mudar a conta.
  const fioDiasUteis = useMemo(() => {
    const dias = diasUteisDoMes(monthKey);
    return { total: dias.length, hoje: dias.filter((dia) => dia <= hoje).length };
  }, [monthKey, hoje]);
  const board = useMemo(() => buildMetasBoard(financeiro.sales, metasConfig, monthKey), [financeiro.sales, metasConfig, monthKey]);
  const painelMetas = useMemo(() => buildPainelReuniao(board, hoje), [board, hoje]);
  const projecao = useMemo(() => projecaoDoMes(financeiro.sales, momento, painelMetas.regua), [financeiro.sales, momento, painelMetas.regua]);

  const pontos = useMemo(
    () =>
      buildPontosDaReuniao({
        sales: financeiro.sales,
        expenses: financeiro.expensesPorCategoria,
        categories: financeiro.categories,
        savingsMoves: financeiro.savingsMoves,
        crediarioProfits: financeiro.crediarioProfits,
        monthKey,
        metasConfig,
        saldoBanco: lucroRealCaixa,
        hoje,
      }),
    [financeiro.sales, financeiro.expensesPorCategoria, financeiro.categories, financeiro.savingsMoves, financeiro.crediarioProfits, monthKey, metasConfig, lucroRealCaixa, hoje],
  );

  // ---- gráficos ------------------------------------------------------------
  const range = useMemo(() => ({ from: `${monthKey}-01`, to: `${monthKey}-31` }), [monthKey]);
  const heat = useMemo(() => buildCalendarHeat(financeiro.sales, monthKey), [financeiro.sales, monthKey]);
  const pagamentoDonut = useMemo(() => buildPaymentDonut(financeiro.sales, range), [financeiro.sales, range]);
  const itemDonut = useMemo(() => buildItemTypeDonut(financeiro.sales, range), [financeiro.sales, range]);
  const grupoDonut = useMemo(
    () => buildExpenseGroupDonut(financeiro.expensesPorCategoria, financeiro.categories, monthKey),
    [financeiro.expensesPorCategoria, financeiro.categories, monthKey],
  );
  const categoriaRank = useMemo(
    () => buildExpenseCategoryRank(financeiro.expensesPorCategoria, financeiro.categories, monthKey),
    [financeiro.expensesPorCategoria, financeiro.categories, monthKey],
  );
  const semana = useMemo(() => buildWeekdayStrength(financeiro.sales, range), [financeiro.sales, range]);
  const ticket = useMemo(
    () => buildTicketMedio(financeiro.sales, `${monthKey}-01`, `${monthKey}-31`),
    [financeiro.sales, monthKey],
  );
  // OCUPAÇÃO DE SALA (14/09/2026): horas vendidas × horas disponíveis. Num mês
  // em andamento, os dois lados param em hoje; o mês anterior é lido até o
  // mesmo dia para a comparação ser justa (regra do Painel: nunca mês parcial
  // contra mês fechado).
  const ocupacao = useMemo(() => buildOcupacaoMes({ sales: financeiro.sales, monthKey, hoje }), [financeiro.sales, monthKey, hoje]);
  const ocupacaoAnterior = useMemo(() => {
    const mesmoDia = ocupacao.parcial ? `${mesAnterior}-${ocupacao.ateDia.slice(8, 10)}` : undefined;
    return buildOcupacaoMes({ sales: financeiro.sales, monthKey: mesAnterior, hoje: mesmoDia ?? `${monthKey}-01` });
  }, [financeiro.sales, mesAnterior, monthKey, ocupacao.parcial, ocupacao.ateDia]);
  const heatOcupacao = useMemo(() => heatDaOcupacao(ocupacao), [ocupacao]);

  // ---- explicações e PDCA (o que é escrito por gente) ----------------------
  const registroSalvo = financeiro.gestaoMensal.find((item) => item.monthRef === monthKey);
  const [explicacoes, setExplicacoes] = useState<Record<string, string>>({});
  const [pdca, setPdca] = useState<Record<string, string>>({});
  // RESUMO DE FECHAMENTO: só o que é digitado (saldos do dia + decisões da reunião).
  const [escrito, setEscrito] = useState<FechamentoEscrito>(fechamentoEscritoVazio);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    setExplicacoes(registroSalvo?.explicacoes ?? {});
    setPdca(registroSalvo?.pdca ?? {});
    setEscrito({ ...fechamentoEscritoVazio, ...(registroSalvo?.fechamento ?? {}) });
  }, [registroSalvo?.id, monthKey]);

  function salvar(apresentar = false) {
    financeiro.saveGestaoMensal({
      id: `gestao-mensal-${monthKey}`,
      monthRef: monthKey,
      explicacoes,
      pdca,
      fechamento: { ...escrito },
      snapshot: { atual, anterior, geradoEm: new Date().toISOString() },
      apresentadoEm: apresentar ? new Date().toISOString() : (registroSalvo?.apresentadoEm ?? null),
    });
    setFeedback(apresentar ? "Marcado como apresentado — o snapshot do mês ficou guardado." : "Salvo.");
  }

  function copiarPontos() {
    const texto = [
      `PONTOS PARA A REUNIÃO — ${monthKeyLabel(monthKey)} (Instituto Bratan)`,
      "",
      ...pontos.map((ponto, indice) => `${indice + 1}. ${ponto.titulo} — ${ponto.numero}\n   ${ponto.leitura}`),
    ].join("\n");
    void navigator.clipboard?.writeText(texto);
    setFeedback("Pontos copiados — dá para colar no WhatsApp ou na ata.");
  }

  // MAIS MESES (25/08/2026): a lista era montada só com o que já tinha carregado —
  // e o hook carrega UM ano por vez, então 2025 nunca aparecia para ser escolhido.
  // Agora a régua é o calendário: 24 meses para trás sempre disponíveis.
  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>([monthKey, mesPadrao, ...ultimosMeses(mesPadrao, 24)]);
    for (const venda of financeiro.sales) set.add(venda.saleDate.slice(0, 7));
    for (const conta of financeiro.expenses) {
      const mes = (conta.dueDate || conta.paidAt || "").slice(0, 7);
      if (mes) set.add(mes);
    }
    return [...set].filter(Boolean).sort().reverse();
  }, [financeiro.sales, financeiro.expenses, monthKey, mesPadrao]);

  // A régua da reunião é a SUPERMETA do mês (julho: 350 mil; agosto: 400 mil).
  const metaDoMes = useMemo(() => metasForMonth(metasConfig, monthKey).goalSuperRevenue, [metasConfig, monthKey]);

  // ---- A SEMANA EM 8 NÚMEROS + RITMO DO TIME (14/09/2026, propostas 1.4 e 3.7) ----
  // Sempre a semana de hoje (segunda a domingo), comparada só com os mesmos dias
  // da semana anterior — regra do Lucas: nunca comparar parcial com fechado.
  const crm = useCrmState();
  const npsQuery = useQuery({ queryKey: ["nps-respostas-painel"], queryFn: () => listRemoteNpsRespostas().catch(() => []), staleTime: 300_000 });
  const equipeQuery = useQuery({ queryKey: ["colaboradores-painel"], queryFn: () => listRemoteColaboradores().catch(() => []), staleTime: 600_000 });
  const semanaNumeros = useMemo(
    () =>
      buildSemanaEmNumeros({
        hoje,
        sales: financeiro.sales,
        expenses: financeiro.expenses,
        crmTasks: crm.state.tasks.map((task) => ({ ownerUserId: task.assignedToUserId, status: task.status, completedAt: task.completedAt })),
        npsRespostas: (npsQuery.data ?? []).map((r) => ({ nota: r.nota, criadoEm: r.criadoEm })),
        nomes: Object.fromEntries((equipeQuery.data ?? []).map((c) => [c.id, c.nome])),
      }),
    [hoje, financeiro.sales, financeiro.expenses, crm.state.tasks, npsQuery.data, equipeQuery.data],
  );

  // AGENDA ESPELHADA (15/09/2026, lote C): quando Feegow/Outlook estiverem ligados, a
  // ocupação passa a ter a agenda real ao lado das comandas.
  const agendaQuery = useQuery({ queryKey: ["agenda-espelho", monthKey], queryFn: () => listRemoteAgendaEspelho(`${monthKey}-01`, `${monthKey}-31`).catch(() => []), staleTime: 300_000 });
  const agendaEspelho = agendaQuery.data ?? [];
  const agendaMinutos = agendaEspelho.filter((a) => a.status !== "cancelado" && a.status !== "desmarcado").reduce((s, a) => s + (a.minutos ?? 0), 0);

  // ---- os blocos, na ordem da reunião --------------------------------------
  const kpis = [
    {
      rotulo: "Faturamento",
      valor: moneyFin(atual.faturamento),
      antes: anterior.faturamento,
      agora: atual.faturamento,
      tom: "NEUTRO" as const,
    },
    {
      rotulo: "Custos do mês",
      valor: moneyFin(atual.custosTotais),
      antes: anterior.custosTotais,
      agora: atual.custosTotais,
      inverso: true,
      tom: "NEUTRO" as const,
    },
    {
      rotulo: "Lucro operacional",
      valor: moneyFin(atual.lucroLiquido),
      antes: anterior.lucroLiquido,
      agora: atual.lucroLiquido,
      tom: atual.lucroLiquido >= 0 ? ("BOM" as const) : ("RUIM" as const),
    },
    {
      rotulo: "Margem",
      valor: `${atual.margem.toFixed(1).replace(".", ",")}%`,
      antes: anterior.margem,
      agora: atual.margem,
      tom: atual.margem >= 15 ? ("BOM" as const) : atual.margem >= 5 ? ("ATENCAO" as const) : ("RUIM" as const),
    },
    {
      rotulo: "Vendas",
      valor: String(atual.comandas),
      antes: anterior.comandas,
      agora: atual.comandas,
      tom: "NEUTRO" as const,
    },
    {
      rotulo: "Ticket médio",
      valor: moneyFin(ticket.geral),
      antes: 0,
      agora: 0,
      tom: "NEUTRO" as const,
    },
    {
      rotulo: ocupacao.parcial ? `Ocupação de sala (até ${ocupacao.ateDia.slice(8, 10)}/${ocupacao.ateDia.slice(5, 7)})` : "Ocupação de sala",
      valor: `${ocupacao.percentual.toLocaleString("pt-BR")}%`,
      antes: ocupacaoAnterior.percentual,
      agora: ocupacao.percentual,
      tom: ocupacao.percentual >= ocupacao.meta.minima ? ("BOM" as const) : ocupacao.percentual >= 40 ? ("ATENCAO" as const) : ("RUIM" as const),
    },
  ];

  /** Os três degraus da meta, com a SUPER-SUPERMETA como régua (17/08/2026). */
  const degraus = [
    { rotulo: "Meta", valor: board.goals.min, atingido: projecao.faturadoAteAgora >= board.goals.min },
    { rotulo: "Supermeta", valor: board.goals.target, atingido: projecao.faturadoAteAgora >= board.goals.target },
    { rotulo: "SUPER-SUPERMETA", valor: board.goals.super, atingido: projecao.faturadoAteAgora >= board.goals.super, regua: true },
  ];

  // ---- a forma (08/10/2026): o mês por extenso e o tom de cada número ----------
  const [rotuloMes, rotuloAno] = monthKeyLabel(monthKey).split("/");
  const mesMinusculo = (rotuloMes ?? "").toLowerCase();
  const mesAnteriorCurto = monthKeyLabel(mesAnterior).slice(0, 3).toLowerCase();
  const mesFechado = mesEstaFechado(monthKey, mesesFechados);
  const apresentadoEm = registroSalvo?.apresentadoEm ?? null;
  const tamanhoKpi = apresentando ? "grande" : "medio";
  /** O tom do número de um KPI: o bom fica em tinta (a palavra ao lado diz que é bom). */
  const tomDoNumero = (tom: TomResultado): TomResultado => (tom === "BOM" ? "NEUTRO" : tom);
  const textoMaior = apresentando ? "text-base leading-6" : "text-sm leading-5";

  /** Rubrica + palavra do tom ("bom sinal", "atenção") — a cor nunca fala sozinha. */
  const RubricaComTom = ({ rotulo, tom }: { rotulo: string; tom: TomResultado }) => (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <Rubrica>{rotulo}</Rubrica>
      {tom !== "NEUTRO" ? (
        <span className={cn("inline-flex items-center gap-1 text-xs font-bold leading-4", COR_DO_TOM[tom])}>
          <IconeDoTom tom={tom} className="h-3.5 w-3.5" />
          {PALAVRA_DO_TOM[tom]}
        </span>
      ) : null}
    </div>
  );

  const blocos = [
    {
      chave: "olhar",
      numero: 1,
      titulo: momento.emAndamento ? `Onde estamos — ${momento.faseLabel}` : "Como o mês fechou",
      corpo: (
        <div className="grid gap-4">
          {/* ONDE ESTAMOS NO MÊS: a barra mostra dias úteis percorridos e o quanto
              do alvo já foi feito — as duas coisas lado a lado deixam na hora
              claro se estamos adiantados ou atrasados. */}
          {momento.emAndamento ? (
            <BlocoSaber className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
              {/* PROJEÇÃO — o número mais importante do mês em andamento */}
              <div className="grid content-start gap-3">
                <Rubrica>Se o ritmo continuar, o mês fecha em</Rubrica>
                <Numero texto={moneyFin(projecao.projecao)} tamanho={apresentando ? "apresentacao" : "grande"} tom={projecao.noCaminho ? "NEUTRO" : "ATENCAO"} />
                <p className={cn("flex items-start gap-2 font-medium text-tinta", textoMaior)}>
                  <IconeDoTom tom={projecao.noCaminho ? "BOM" : "ATENCAO"} className="mt-0.5" />
                  <span>{projecao.leitura}</span>
                </p>
              </div>
              <div className="grid content-start gap-5">
                {[
                  {
                    rotulo: "O mês já andou",
                    valor: momento.percorrido * 100,
                    texto: `${Math.round(momento.percorrido * 100)}% dos dias úteis`,
                    tom: "tinta" as const,
                    marca: null,
                  },
                  {
                    rotulo: "Já faturamos",
                    valor: Math.min(100, projecao.alvo > 0 ? (projecao.faturadoAteAgora / projecao.alvo) * 100 : 0),
                    texto: `${projecao.percentualDoAlvo.toFixed(1).replace(".", ",")}% da régua (${moneyFin(projecao.faturadoAteAgora)})`,
                    tom: projecao.percentualDoAlvo >= momento.percorrido * 100 ? ("ok" as const) : ("atencao" as const),
                    marca: momento.percorrido * 100,
                  },
                ].map((barra) => (
                  <div key={barra.rotulo} className="grid gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-bold leading-5 text-tinta">{barra.rotulo}</span>
                      <span className="text-[13px] font-semibold leading-5 tabular-nums text-tinta-2">{barra.texto}</span>
                    </div>
                    <BarraFina valor={barra.valor} tom={barra.tom} marca={barra.marca} alta={apresentando} rotulo={`${barra.rotulo}: ${barra.texto}`} />
                  </div>
                ))}
                <p className="text-xs font-medium leading-4 text-tinta-2">O traço na segunda barra é onde o faturamento deveria estar hoje, no ritmo dos dias úteis.</p>
              </div>
            </BlocoSaber>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => {
              const variacao = kpi.antes > 0 ? ((kpi.agora - kpi.antes) / kpi.antes) * 100 : null;
              const melhorou = variacao === null ? null : kpi.inverso ? variacao < 0 : variacao > 0;
              return (
                <div key={kpi.rotulo} className="grid content-start gap-3 rounded-bloco bg-saber p-5 max-md:p-4">
                  <RubricaComTom rotulo={kpi.rotulo} tom={kpi.tom} />
                  <Numero texto={kpi.valor} tamanho={tamanhoKpi} tom={tomDoNumero(kpi.tom)} />
                  <Variacao variacao={variacao} melhorou={melhorou} contra={mesAnteriorCurto} />
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      chave: "escada",
      numero: 2,
      titulo: "A escada da meta — a régua é a super-supermeta",
      ajuda: "Três degraus. A régua da apresentação é o de cima: é nele que a porcentagem da equipe aumenta.",
      corpo: (
        <div className="grid gap-4">
          <BlocoSaber className="overflow-hidden p-0 max-md:p-0">
            <ul>
              {degraus.map((degrau) => {
                const feito = projecao.alvo > 0 ? Math.min(1, projecao.faturadoAteAgora / degrau.valor) : 0;
                const falta = Math.max(0, degrau.valor - projecao.faturadoAteAgora);
                const aberto = degrauAberto === degrau.rotulo;
                return (
                  <li key={degrau.rotulo} className="border-t border-fio first:border-t-0">
                    <button
                      type="button"
                      onClick={() => setDegrauAberto((atual) => (atual === degrau.rotulo ? "" : degrau.rotulo))}
                      aria-expanded={aberto}
                      className={cn(
                        "grid w-full gap-3 px-6 py-4 text-left transition-colors duration-150 ease-papel hover:bg-fio/40 max-md:px-4",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco",
                        degrau.regua && "shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]",
                      )}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className={cn("flex flex-wrap items-center gap-2 font-bold text-tinta", apresentando ? "text-xl leading-7" : "text-base leading-6")}>
                          {degrau.atingido ? <CheckCircle2 className="h-4 w-4 text-ok" aria-label="atingido" /> : null}
                          {degrau.rotulo}
                          {degrau.regua ? <Etiqueta tom="musgo">a régua da reunião</Etiqueta> : null}
                        </span>
                        <span className={cn("whitespace-nowrap font-bold tabular-nums text-tinta", apresentando ? "text-2xl leading-8" : "text-lg leading-7")}>{moneyFin(degrau.valor)}</span>
                      </span>
                      <BarraFina
                        valor={feito * 100}
                        tom={degrau.atingido ? "ok" : "musgo"}
                        alta={apresentando}
                        rotulo={`${degrau.rotulo}: ${Math.round(feito * 100)}% feito`}
                      />
                      <span className={cn("text-[13px] font-semibold leading-5", degrau.atingido ? "text-ok" : "text-tinta-2")}>
                        {degrau.atingido
                          ? "Atingido."
                          : `Faltam ${moneyFin(falta)}${momento.diasUteisRestantes > 0 ? ` · ${moneyFin(falta / momento.diasUteisRestantes)} por dia útil` : ""}`}
                      </span>
                      {aberto ? (
                        <span className="block rounded-controle bg-folha px-3 py-2 text-[13px] font-medium leading-5 text-tinta">
                          {degrau.regua
                            ? "É a régua da reunião. Acima dela a equipe ganha porcentagem maior — foi a decisão da CEO em 14/08."
                            : degrau.rotulo === "Meta"
                              ? "O mínimo. Nas palavras da CEO: 'o resto é medíocre, se a gente fizer, amém' — não é o que buscamos."
                              : "O degrau do meio. Bom, mas não é onde a equipe ganha mais."}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </BlocoSaber>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { rotulo: "Ritmo atual", valor: moneyFin(projecao.ritmoAtual), dica: "por dia útil trabalhado", noCaminho: false },
              {
                rotulo: "Ritmo necessário",
                valor: momento.diasUteisRestantes > 0 ? moneyFin(projecao.precisaPorDia) : "—",
                dica: `para a régua em ${momento.diasUteisRestantes} dia(s)`,
                noCaminho: false,
              },
              {
                rotulo: "Aumento necessário",
                // Sem ritmo ainda (nenhuma venda no mês) não há "aumento" a medir: fica o traço,
                // e não um "no caminho" que o número não sustenta (08/10/2026).
                valor: projecao.aumentoNecessario === null ? (projecao.noCaminho ? "no caminho" : "—") : `+${projecao.aumentoNecessario.toFixed(0)}%`,
                dica: "sobre o ritmo de hoje",
                noCaminho: projecao.aumentoNecessario === null && projecao.noCaminho,
              },
            ].map((item) => (
              <div key={item.rotulo} className="grid content-start gap-2 rounded-bloco bg-saber p-5 max-md:p-4">
                <Rubrica>{item.rotulo}</Rubrica>
                {item.noCaminho ? (
                  <p className={cn("flex items-center gap-2 font-bold text-ok", apresentando ? "text-2xl leading-8" : "text-xl leading-7")}>
                    <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" /> {item.valor}
                  </p>
                ) : (
                  <Numero texto={item.valor} tamanho={apresentando ? "medio" : "pequeno"} />
                )}
                <Frase>{item.dica}</Frase>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      chave: "pontos",
      numero: 3,
      titulo: "Pontos para a reunião",
      ajuda: pontos.length ? `${pontos.length} ${pontos.length === 1 ? "ponto" : "pontos"}, cada um com o número e o que ele quer dizer.` : undefined,
      corpo: (
        <div className="grid gap-3">
          {!pontos.length ? (
            <BlocoSaber>
              <Frase>Sem dados suficientes neste mês para gerar pontos.</Frase>
            </BlocoSaber>
          ) : null}
          <ol className={cn("grid gap-3", !apresentando && "xl:grid-cols-2")}>
            {pontos.map((ponto, indice) => (
              <li key={ponto.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 rounded-bloco bg-saber p-5 max-md:p-4">
                <span className={cn("font-serifa font-normal leading-none tabular-nums text-tinta-2", apresentando ? "text-[40px]" : "text-[32px]")} aria-hidden="true">
                  {indice + 1}
                </span>
                <div className="grid min-w-0 content-start gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("font-bold text-tinta", apresentando ? "text-xl leading-7" : "text-base leading-6")}>{ponto.titulo}</p>
                    <Etiqueta>{grupoLabels[ponto.grupo]}</Etiqueta>
                  </div>
                  <p className={cn("flex items-start gap-2 font-bold tabular-nums", COR_DO_TOM[ponto.tom], apresentando ? "text-2xl leading-8" : "text-lg leading-7")}>
                    {ponto.tom !== "NEUTRO" ? <IconeDoTom tom={ponto.tom} className={apresentando ? "mt-2" : "mt-1.5"} /> : null}
                    <span className="min-w-0">{ponto.numero}</span>
                    {ponto.tom !== "NEUTRO" ? <span className="sr-only">({PALAVRA_DO_TOM[ponto.tom]})</span> : null}
                  </p>
                  <p className={cn("font-medium text-tinta-2", textoMaior)}>{ponto.leitura}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ),
    },
    {
      chave: "lucros",
      numero: 4,
      titulo: "Os três lucros",
      ajuda: 'A pergunta que sempre aparece: "então quanto a gente ganhou?". Os três números estão certos — medem coisas diferentes.',
      corpo: (
        <div className="grid gap-4">
          {/* O LUCRO DO MÊS EXPLICADO (01/10/2026): a conta linha a linha antes da ponte. */}
          <LucroDoMesExplicado gestao={atual} compromissos={compromissos} apresentando={apresentando} />
          {/* A CASCATA (14/09/2026): o mesmo caminho em barras, clicável. */}
          <BlocoSaber className="grid gap-4">
            <Rubrica as="h3">A ponte: do lucro operacional ao contábil e ao caixa</Rubrica>
            <PonteWaterfall passos={ponte} detalhes={detalhesPonte} apresentando={apresentando} />
          </BlocoSaber>
          <BlocoSaber className="p-0 max-md:p-0">
            <dl>
              {ponte.map((passo) => {
                const ponta = passo.tipo === "base" || passo.tipo === "total";
                return (
                  <div
                    key={passo.label}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-t border-fio px-6 py-3 first:border-t-0 max-md:px-4",
                      passo.tipo === "total" && "bg-folha",
                    )}
                  >
                    <dt className="grid min-w-0 gap-1">
                      <span className={cn("text-tinta", apresentando ? "text-lg leading-7" : "text-sm leading-5", ponta ? "font-bold" : "font-semibold")}>{passo.label}</span>
                      <span className={cn("max-w-[90ch] font-medium text-tinta-2", apresentando ? "text-sm leading-5" : "text-[13px] leading-5")}>{passo.explicacao}</span>
                    </dt>
                    <dd
                      className={cn(
                        "m-0 whitespace-nowrap text-right tabular-nums",
                        ponta ? "font-serifa text-2xl font-normal leading-8" : "text-base font-bold leading-6",
                        passo.valor < -0.004 && ponta ? "text-erro" : "text-tinta",
                      )}
                    >
                      {moneyFin(passo.valor)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </BlocoSaber>
        </div>
      ),
    },
    {
      chave: "evolucao",
      numero: 5,
      titulo: "Evolução dos últimos 6 meses",
      corpo: (
        <BlocoSaber className="grid gap-6">
          <BarrasDoMes
            rotulos={evolucao.map((mes) => monthKeyLabel(mes.monthKey).slice(0, 3))}
            barras={[
              { nome: "Faturamento", valores: evolucao.map((mes) => mes.faturamento), cor: CORES_GRAFICO.entrada },
              { nome: "Custos", valores: evolucao.map((mes) => mes.custosTotais), cor: CORES_GRAFICO.saida },
            ]}
            linha={{ nome: "Lucro", valores: evolucao.map((mes) => mes.lucroLiquido), cor: CORES_GRAFICO.resultado }}
          />
          <div className="-mx-4 overflow-x-auto">
            <table className={cn(tabela.tabela, "min-w-[34rem]")}>
              <thead>
                <tr>
                  <th className={tabela.th}>Mês</th>
                  <th className={tabela.thNum}>Faturamento</th>
                  <th className={tabela.thNum}>Custos</th>
                  <th className={tabela.thNum}>Lucro</th>
                  <th className={tabela.thNum}>Margem</th>
                </tr>
              </thead>
              <tbody>
                {evolucao.map((mes) => (
                  <tr key={mes.monthKey} className={cn(tabela.linha, mes.monthKey === monthKey && "bg-folha shadow-[inset_3px_0_0_rgb(var(--ouro-fio-rgb))]")}>
                    <td className={cn(tabela.td, "font-bold")}>
                      {monthKeyLabel(mes.monthKey)}
                      {mes.monthKey === monthKey ? <span className="ml-2 text-xs font-bold text-ouro">este</span> : null}
                    </td>
                    <td className={tabela.tdNum}>{moneyFin(mes.faturamento)}</td>
                    <td className={tabela.tdNum}>{moneyFin(mes.custosTotais)}</td>
                    <td className={cn(tabela.tdNum, "font-bold", mes.lucroLiquido >= 0 ? "text-tinta" : "text-erro")}>{moneyFin(mes.lucroLiquido)}</td>
                    <td className={tabela.tdNum}>{mes.margem.toFixed(1).replace(".", ",")}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BlocoSaber>
      ),
    },
    {
      chave: "fluxo",
      numero: 6,
      titulo: "De onde vem e para onde vai",
      corpo: (
        <div className="grid gap-4 lg:grid-cols-2">
          <BlocoSaber className="grid content-start gap-4">
            <Rubrica as="h3">Como o paciente paga</Rubrica>
            <Participacao partes={pagamentoDonut} cor={CORES_GRAFICO.entrada} vazio="Sem comandas neste mês." />
          </BlocoSaber>
          <BlocoSaber className="grid content-start gap-4">
            <Rubrica as="h3">O que ele compra</Rubrica>
            <Participacao partes={itemDonut} cor={CORES_GRAFICO.entrada} vazio="Sem comandas neste mês." />
          </BlocoSaber>
          <BlocoSaber className="grid content-start gap-4">
            <Rubrica as="h3">Para onde vai o custo</Rubrica>
            <Participacao partes={grupoDonut} cor={CORES_GRAFICO.saida} vazio="Sem contas neste mês." />
          </BlocoSaber>
          <BlocoSaber className="grid content-start gap-4">
            <Rubrica as="h3">As 8 maiores linhas de custo</Rubrica>
            <Ranking pontos={categoriaRank} cor={CORES_GRAFICO.saida} vazio="Sem contas neste mês." />
          </BlocoSaber>
        </div>
      ),
    },
    {
      chave: "ritmo",
      numero: 7,
      titulo: "Ritmo do mês",
      corpo: (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <BlocoSaber className="grid content-start gap-4">
            <Rubrica as="h3">Faturamento dia a dia</Rubrica>
            <CalendarioDoMes calor={heat} vazio="Nenhuma comanda lançada neste mês ainda — o calendário acende conforme o dinheiro entra." />
          </BlocoSaber>
          <BlocoSaber className="grid content-start gap-4">
            <Rubrica as="h3">Força por dia da semana</Rubrica>
            <Ranking pontos={semana} cor={CORES_GRAFICO.entrada} vazio="Sem comandas neste mês." />
          </BlocoSaber>
        </div>
      ),
    },
    {
      chave: "ocupacao",
      numero: 8,
      titulo: "Ocupação das salas — o número mais alavancável",
      corpo: (
        <div className="grid gap-4">
          <BlocoSaber className="grid gap-5">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div className="grid gap-3">
                <RubricaComTom
                  rotulo={`Horas de sala vendidas ÷ horas disponíveis${ocupacao.parcial ? ` · até ${ocupacao.ateDia.slice(8, 10)}/${ocupacao.ateDia.slice(5, 7)}` : ""}`}
                  tom={ocupacao.percentual >= ocupacao.meta.minima ? "BOM" : ocupacao.percentual >= 40 ? "ATENCAO" : "RUIM"}
                />
                <Numero
                  texto={`${ocupacao.percentual.toLocaleString("pt-BR")}%`}
                  tamanho={apresentando ? "apresentacao" : "grande"}
                  tom={ocupacao.percentual >= ocupacao.meta.minima ? "NEUTRO" : ocupacao.percentual >= 40 ? "ATENCAO" : "RUIM"}
                />
              </div>
              <div className="grid gap-1 text-right max-sm:text-left">
                <p className="text-sm font-medium leading-5 text-tinta">
                  <strong className="font-bold tabular-nums">{formatHoras(ocupacao.horasVendidas)}</strong> vendidas de{" "}
                  <strong className="font-bold tabular-nums">{formatHoras(ocupacao.horasDisponiveis)}</strong>
                </p>
                <Frase>
                  {ocupacao.grade.salas} salas × {ocupacao.grade.horasPorDiaPorSala} h × {ocupacao.diasUteis} dia{ocupacao.diasUteis > 1 ? "s" : ""} úteis
                </Frase>
              </div>
            </div>
            {/* A régua: 0 a 100%, com a faixa saudável (75–85%) marcada. */}
            <div className="grid gap-2">
              <BarraFina
                valor={ocupacao.percentual}
                tom={ocupacao.percentual >= ocupacao.meta.minima ? "ok" : ocupacao.percentual >= 40 ? "atencao" : "erro"}
                faixa={{ de: ocupacao.meta.minima, ate: ocupacao.meta.maxima }}
                alta
                rotulo={`Ocupação ${ocupacao.percentual}%; faixa saudável de ${ocupacao.meta.minima} a ${ocupacao.meta.maxima}%`}
              />
              <div className="flex justify-between gap-2 text-xs font-medium leading-4 text-tinta-2">
                <span>0%</span>
                <span>
                  faixa saudável {ocupacao.meta.minima}–{ocupacao.meta.maxima}%
                </span>
                <span>100%</span>
              </div>
            </div>
            <p className={cn("font-medium text-tinta", textoMaior)}>{ocupacao.frase}</p>
            <Frase>
              As horas vendidas já absorvem {moneyFin(ocupacao.custoFixoAbsorvido)} do custo fixo ao custo-hora da planilha (R$ 113,78). Horas disponíveis
              seguem a grade da planilha de precificação; quando a agenda estiver espelhada no app, passam a vir dela.
            </Frase>
            {agendaEspelho.length ? (
              <p className="text-[13px] font-semibold leading-5 text-tinta">
                Agenda espelhada ({agendaEspelho[0].origem}): {agendaEspelho.length} agendamento{agendaEspelho.length > 1 ? "s" : ""} no mês, {formatHoras(agendaMinutos / 60)} de agenda marcada —
                compare com as horas vendidas para ver falta e sobra de sala.
              </p>
            ) : null}
          </BlocoSaber>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <BlocoSaber className="grid content-start gap-4">
              <Rubrica as="h3">
                Horas vendidas dia a dia (cor = % das {ocupacao.grade.salas * ocupacao.grade.horasPorDiaPorSala} h do dia)
              </Rubrica>
              <CalendarioDoMes calor={heatOcupacao} formatar={formatHoras} vazio="Nenhuma comanda lançada neste mês ainda — o calendário acende conforme a sala é vendida." />
            </BlocoSaber>
            <div className="grid content-start gap-4">
              <BlocoSaber className="grid content-start gap-4">
                <Rubrica as="h3">O que ocupa a sala</Rubrica>
                <Ranking pontos={ocupacao.porProduto.slice(0, 8).map((p) => ({ label: p.produto, value: p.horas }))} formatar={formatHoras} vazio="Nenhuma comanda com item de sala neste mês." />
              </BlocoSaber>
              <BlocoSaber className="grid content-start gap-4">
                <Rubrica as="h3">Horas vendidas por dia da semana</Rubrica>
                <Ranking pontos={ocupacao.porDiaDaSemana} formatar={formatHoras} cor={CORES_GRAFICO.entrada} vazio="Sem comandas neste mês." />
              </BlocoSaber>
            </div>
          </div>
        </div>
      ),
    },
    {
      chave: "semana",
      numero: 9,
      titulo: `A semana em 8 números${semanaNumeros.parcial ? " (em andamento)" : ""}`,
      corpo: (
        <div className="grid gap-4">
          <p className={cn("font-medium text-tinta", apresentando ? "text-lg leading-7" : "text-sm leading-5")}>
            {semanaNumeros.frase}{" "}
            <InfoTip title="Como ler" className="align-middle">
              Oito números da semana de hoje (segunda a domingo), cada um com a frase que explica. A comparação é sempre com os MESMOS dias
              da semana anterior — segunda a quarta contra segunda a quarta — porque semana pela metade não se compara com semana fechada.
              Tudo vem das comandas, das contas, das tarefas do CRM e do totem de NPS.
            </InfoTip>
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {semanaNumeros.numeros.map((numero) => (
              <div key={numero.chave} className="grid content-start gap-3 rounded-bloco bg-saber p-5 max-md:p-4">
                <RubricaComTom rotulo={numero.rotulo} tom={numero.tom} />
                <Numero texto={numero.valor} tamanho={tamanhoKpi} tom={tomDoNumero(numero.tom)} />
                <Frase className="first-letter:uppercase">{numero.frase}</Frase>
              </div>
            ))}
          </div>
          <BlocoSaber className="grid content-start gap-4">
            <Rubrica as="h3">Ritmo do time — toques do CRM concluídos por pessoa{semanaNumeros.parcial ? " (até hoje)" : ""}</Rubrica>
            {semanaNumeros.ritmo.length ? (
              <Ranking
                pontos={semanaNumeros.ritmo.map((r) => ({ label: `${r.nome}${r.toquesSemanaAnterior ? ` (semana anterior ${r.toquesSemanaAnterior})` : ""}`, value: r.toques }))}
                cor={CORES_GRAFICO.resultado}
                formatar={(v) => `${Math.round(v)} toque${Math.round(v) === 1 ? "" : "s"}`}
                vazio="Nenhum toque concluído nesta semana."
              />
            ) : (
              <Frase>Nenhum toque do CRM concluído nesta semana ainda.</Frase>
            )}
          </BlocoSaber>
        </div>
      ),
    },
  ];

  const blocoAtual = blocos[Math.min(bloco, blocos.length - 1)];

  // Só agregados (sem paciente) para o resumo narrado e o "Perguntar ao 360".
  const agregadosParaIa: Record<string, unknown> = {
    mes: monthKey,
    hoje,
    momentoDoMes: { fase: momento.faseLabel, emAndamento: momento.emAndamento, dia: momento.dia, percorrido: Math.round(momento.percorrido * 100) },
    kpis: kpis.map((k) => ({ rotulo: k.rotulo, valor: k.valor, mesAnterior: k.antes, tom: k.tom })),
    metas: degraus.map((d) => ({ rotulo: d.rotulo, valor: d.valor, atingido: d.atingido })),
    projecao,
    pontosDaReuniao: pontos.map((p) => ({ titulo: p.titulo, numero: p.numero, leitura: p.leitura, tom: p.tom, grupo: p.grupo })),
    ponteDosTresLucros: ponte,
    ocupacaoDeSala: { percentual: ocupacao.percentual, horasVendidas: ocupacao.horasVendidas, horasDisponiveis: ocupacao.horasDisponiveis, parcial: ocupacao.parcial, frase: ocupacao.frase },
    semanaEm8Numeros: { frase: semanaNumeros.frase, numeros: semanaNumeros.numeros.map((n) => ({ rotulo: n.rotulo, valor: n.valor, frase: n.frase })), ritmoDoTime: semanaNumeros.ritmo },
  };

  async function fecharOuReabrirMes() {
    const fechado = mesEstaFechado(monthKey, mesesFechados);
    const nome = mesPorExtenso(monthKey);
    const ok = await confirmar(fechado ? `Reabrir ${nome}?` : `Fechar ${nome}?`, {
      corpo: fechado
        ? "A equipe volta a poder mudar as comandas desse mês. Se o número mudar, avise a contabilidade."
        : "Depois de fechado, só a gestão financeira muda comandas desse mês. Anexar comprovante continua liberado.",
      confirmar: fechado ? "Reabrir" : "Fechar o mês",
    });
    if (!ok) return;
    setFechandoMes(true);
    try {
      await fecharRemoteMes(monthKey, !fechado);
      await queryClient.invalidateQueries({ queryKey: ["fin-mes-fechado"] });
      toast(fechado ? `${nome} reaberto.` : `${nome} fechado. A equipe não muda mais as comandas desse mês.`, { tom: "ok" });
    } catch (erro) {
      toast(`Não deu para ${fechado ? "reabrir" : "fechar"} o mês: ${(erro as Error)?.message ?? "erro"}`, { tom: "erro", duracaoMs: 9000 });
    } finally {
      setFechandoMes(false);
    }
  }

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Painel do Mês" module="fin-gestao">
      <div className="mx-auto w-full max-w-[1320px]">
        {/* ---- cabeçalho: o mês, a fase e o fio do mês --------------------- */}
        <Cabecalho
          sobrancelha="Resultados · Painel do mês"
          titulo={
            <>
              Painel de <em>{mesMinusculo}</em> de {rotuloAno}{" "}
              <InfoTip title="A apresentação se ajusta ao dia" className="align-middle">
                Relatórios e Gestão Mensal viraram este painel. Quando você clica em "Apresentar", ele calcula em que
                momento do mês estamos (começo, meio, reta final ou fechado) e muda o que enfatiza: no começo, o ritmo
                necessário; no meio, a PROJEÇÃO de fechamento; na reta final, quanto falta por dia; com o mês fechado, o
                resultado e a análise. A régua é a SUPER-SUPERMETA.
              </InfoTip>
            </>
          }
          frase={
            <>
              <strong>{tituloDaApresentacao(momento, projecao)}.</strong> {momento.foco}
            </>
          }
          acoes={
            <div className="flex flex-wrap items-end gap-2">
              <Campo rotulo="Mês" className="w-48">
                <Selecao
                  id="painel-mes"
                  value={monthKey}
                  onChange={(event) => {
                    setMonthKey(event.target.value);
                    setBloco(0);
                  }}
                >
                  {mesesDisponiveis.map((mes) => (
                    <option key={mes} value={mes}>
                      {monthKeyLabel(mes)}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Botao
                variante="primario"
                icone={apresentando ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setApresentando((atual) => !atual)}
                aria-pressed={apresentando}
              >
                {apresentando ? "Sair da apresentação" : "Apresentar"}
              </Botao>
            </div>
          }
          rodape={
            momento.emAndamento ? <FioDoMes diasUteis={fioDiasUteis.total} hoje={fioDiasUteis.hoje} mes={rotuloMes} sobre="papel" /> : null
          }
        />

        {/* ---- a barra da reunião: o que se faz com o painel ----------------- */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-fio py-3 print:hidden">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold leading-5 text-tinta-2">
            {apresentadoEm ? (
              <span className="inline-flex items-center gap-1.5 text-ok">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Apresentado em {apresentadoEm.slice(8, 10)}/{apresentadoEm.slice(5, 7)}
              </span>
            ) : (
              <span>Ainda não marcado como apresentado.</span>
            )}
            {mesFechado ? (
              <span className="inline-flex items-center gap-1.5 text-tinta">
                <Lock className="h-4 w-4 text-tinta-2" aria-hidden="true" />
                {mesPorExtenso(monthKey)} está fechado: as comandas desse mês só mudam pela gestão financeira.
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Botao tamanho="pq" icone={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={copiarPontos}>
              Copiar os pontos
            </Botao>
            {podeFecharMeses && (mesEstaFechado(monthKey, mesesFechados) || podeFecharOMes(monthKey, hoje)) ? (
              <Botao tamanho="pq" icone={<Lock className="h-4 w-4" aria-hidden="true" />} carregando={fechandoMes} disabled={fechandoMes} onClick={() => void fecharOuReabrirMes()}>
                {mesEstaFechado(monthKey, mesesFechados) ? "Reabrir o mês" : "Fechar o mês"}
              </Botao>
            ) : null}
            {!readOnly ? (
              <>
                <Botao tamanho="pq" onClick={() => salvar(false)}>
                  Salvar
                </Botao>
                <Botao tamanho="pq" icone={<CalendarCheck className="h-4 w-4" aria-hidden="true" />} onClick={() => salvar(true)}>
                  Marcar como apresentado
                </Botao>
              </>
            ) : null}
          </div>
        </div>

        {feedback ? <RecadoDaTela className="mb-6">{feedback}</RecadoDaTela> : null}
        {momento.emAndamento ? (
          <p className="mb-8 flex items-start gap-2 text-[13px] font-medium leading-5 text-tinta-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Estamos no <strong className="font-bold text-tinta">{momento.faseLabel}</strong> ({momento.diasUteisPassados} de {momento.diasUteisTotais} dias
              úteis{fioDiasUteis.total !== momento.diasUteisTotais ? " na conta da projeção, que vai de segunda a sexta sem tirar feriado" : ""}). As contas do mês inteiro já estão lançadas e o faturamento ainda entra — por isso margem e ponto de
              equilíbrio só aparecem com o mês fechado, e as comparações são feitas no{" "}
              <strong className="font-bold text-tinta">mesmo ponto do mês</strong> (dia 1 até hoje, nos dois meses).
            </span>
          </p>
        ) : null}

        <div className="grid gap-12">
          {/* ---- IA sobre os agregados (15/09/2026): resumo narrado + perguntar ao 360 ---- */}
          {financeiro.syncMode !== "local" ? (
            <div className="grid gap-4">
              <NarrativaDoMesCard monthKey={monthKey} agregados={agregadosParaIa} podeGerar={!readOnly} apresentando={apresentando} />
              {!apresentando ? <PerguntarAo360Card contexto={agregadosParaIa} tela="painel" /> : null}
            </div>
          ) : null}

          {/* ---- MODO APRESENTAÇÃO: um bloco por vez -------------------------- */}
          {apresentando ? (
            <div className="grid gap-4">
              <section aria-labelledby={`painel-${blocoAtual.chave}`} className="grid gap-6 rounded-painel border border-fio bg-folha p-10 max-md:p-5">
                <TituloDaSecao
                  id={`painel-${blocoAtual.chave}`}
                  numero={blocoAtual.numero}
                  apresentando
                  ajuda={blocoAtual.ajuda}
                  acoes={
                    <Rubrica className="tabular-nums">
                      {bloco + 1} de {blocos.length}
                    </Rubrica>
                  }
                >
                  {blocoAtual.titulo}
                </TituloDaSecao>
                {blocoAtual.corpo}
              </section>
              <nav
                aria-label="Blocos da apresentação"
                className="sticky bottom-3 z-10 flex items-center justify-between gap-2 rounded-painel border border-fio bg-folha p-2 shadow-flutua max-md:bottom-[calc(96px+env(safe-area-inset-bottom))]"
              >
                <Botao icone={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} disabled={bloco === 0} onClick={() => setBloco((n) => n - 1)}>
                  Anterior
                </Botao>
                <span className="text-[13px] font-bold tabular-nums text-tinta-2 sm:hidden">
                  {bloco + 1} de {blocos.length}
                </span>
                <div className="flex flex-wrap justify-center max-sm:hidden">
                  {blocos.map((item, indice) => (
                    <button
                      key={item.chave}
                      type="button"
                      aria-label={`${item.numero}. ${item.titulo}`}
                      aria-current={indice === bloco ? "step" : undefined}
                      onClick={() => setBloco(indice)}
                      className="grid h-8 w-6 place-items-center rounded-controle focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                    >
                      <span className={cn("block h-2 rounded-full transition-all duration-150 ease-papel", indice === bloco ? "w-4 bg-musgo" : "w-2 bg-fio-2")} />
                    </button>
                  ))}
                </div>
                <Botao variante="primario" disabled={bloco === blocos.length - 1} onClick={() => setBloco((n) => n + 1)}>
                  Próximo <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Botao>
              </nav>
            </div>
          ) : (
            <>
              {/* ---- tudo aberto, para trabalhar ----------------------------- */}
              {blocos.map((item) => (
                <section key={item.chave} aria-labelledby={`painel-${item.chave}`} className="grid gap-4">
                  <TituloDaSecao id={`painel-${item.chave}`} numero={item.numero} ajuda={item.ajuda}>
                    {item.titulo}
                  </TituloDaSecao>
                  {item.corpo}
                </section>
              ))}

              {/* ---- comparativo com explicações (o trabalho do dia 5) ------- */}
              {/* NUNCA COMPARAR MÊS PARCIAL COM MÊS FECHADO (regra do Lucas). Até
                  29/09/2026 este card aparecia também com o mês em andamento. */}
              {momento.emAndamento ? (
                <BlocoSaber as="section" aria-label="Comparativo com o mês anterior" className="flex items-start gap-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />
                  <p className="text-sm font-medium leading-5 text-tinta-2">
                    O comparativo com {monthKeyLabel(mesAnterior)} aparece quando {monthKeyLabel(monthKey)} fechar. Comparar um mês pela
                    metade com um mês inteiro faz qualquer número parecer queda.
                  </p>
                </BlocoSaber>
              ) : (
                <section aria-labelledby="painel-comparativo" className="grid gap-4">
                  <TituloDaSecao id="painel-comparativo">
                    Comparativo com {monthKeyLabel(mesAnterior)} — e a explicação de cada número{" "}
                    <InfoTip title="Como usar" className="align-middle">
                      Nenhum número é digitado: todos vêm dos lançamentos. Você escreve só a EXPLICAÇÃO de cada linha — é o
                      que a reunião cobra. O texto fica salvo e todo mundo vê o mesmo.
                    </InfoTip>
                  </TituloDaSecao>
                  <BlocoFolha className="overflow-hidden">
                    <ul>
                      {indicadores.map((indicador) => {
                        const subiu = indicador.variacao > 0;
                        return (
                          <li key={indicador.key} className="grid gap-3 border-t border-fio px-6 py-4 first:border-t-0 max-md:px-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
                            <div className="grid gap-1">
                              <label htmlFor={`explicacao-${indicador.key}`} className="text-sm font-bold leading-5 text-tinta">
                                {indicador.label}
                              </label>
                              <p className="flex flex-wrap items-center gap-x-2 text-sm leading-5 tabular-nums">
                                <span className="font-medium text-tinta-2">{formatarValor(indicador.anterior, indicador.formato)}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-tinta-2" aria-label="para" />
                                <strong className="font-bold text-tinta">{formatarValor(indicador.atual, indicador.formato)}</strong>
                                {indicador.variacao !== 0 ? (
                                  <span className={cn("text-[13px] font-bold", subiu ? "text-ok" : "text-erro")}>
                                    {subiu ? "subiu" : "caiu"} {formatarValor(Math.abs(indicador.variacao), indicador.formato)}
                                    {indicador.variacaoPercent !== null
                                      ? ` (${indicador.variacaoPercent > 0 ? "+" : ""}${indicador.variacaoPercent.toFixed(1).replace(".", ",")}%)`
                                      : ""}
                                  </span>
                                ) : null}
                              </p>
                            </div>
                            <textarea
                              id={`explicacao-${indicador.key}`}
                              value={explicacoes[indicador.key] ?? ""}
                              onChange={(event) => setExplicacoes((atual) => ({ ...atual, [indicador.key]: event.target.value }))}
                              onBlur={() => (readOnly ? undefined : salvar(false))}
                              disabled={readOnly}
                              rows={2}
                              placeholder="Por que este número mudou?"
                              className={classeDoTexto}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </BlocoFolha>
                </section>
              )}

              {/* ---- PDCA --------------------------------------------------- */}
              <section aria-labelledby="painel-pdca" className="grid gap-4">
                <TituloDaSecao id="painel-pdca">Análise do mês e plano de ação (PDCA)</TituloDaSecao>
                <BlocoFolha respiro className="grid gap-6 md:grid-cols-2">
                  {PDCA_CAMPOS.map((campo) => (
                    <div key={campo.key} className="grid content-start gap-2">
                      <label htmlFor={`pdca-${campo.key}`} className="text-[13px] font-bold leading-5 text-tinta">
                        {campo.titulo}
                      </label>
                      <p className="text-[13px] font-medium leading-5 text-tinta-2">{campo.ajuda}</p>
                      <textarea
                        id={`pdca-${campo.key}`}
                        value={pdca[campo.key] ?? ""}
                        onChange={(event) => setPdca((atual) => ({ ...atual, [campo.key]: event.target.value }))}
                        onBlur={() => (readOnly ? undefined : salvar(false))}
                        disabled={readOnly}
                        rows={4}
                        className={classeDoTexto}
                      />
                    </div>
                  ))}
                </BlocoFolha>
              </section>

              {/* ---- resumo de fechamento (a folha da reunião) --------------- */}
              <ResumoFechamentoCard
                sales={financeiro.sales}
                expenses={financeiro.expensesPorCategoria}
                categories={financeiro.categories}
                provisionRules={financeiro.provisionRules}
                invoices={financeiro.invoices}
                monthKey={monthKey}
                meta={metaDoMes}
                escrito={escrito}
                onEscritoChange={(proximo) => {
                  setEscrito(proximo);
                  setFeedback("");
                }}
                onSalvar={() => salvar(false)}
                readOnly={readOnly}
              />

              {/* ---- arquivos para a contabilidade -------------------------- */}
              <RelatoriosContabilidadeCard
                sales={financeiro.sales}
                expenses={financeiro.expensesPorCategoria}
                categories={financeiro.categories}
                savingsMoves={financeiro.savingsMoves}
                crediarioProfits={financeiro.crediarioProfits}
                purchases={financeiro.purchases}
                monthKey={monthKey}
                mostrarSeletor={false}
              />

              <OrigemDosDados modo={financeiro.syncMode} />
            </>
          )}
        </div>
      </div>
    </AccessGate>
  );
}
