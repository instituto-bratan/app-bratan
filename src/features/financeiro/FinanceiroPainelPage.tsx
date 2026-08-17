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
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  Copy,
  GitMerge,
  Lightbulb,
  Maximize2,
  Minimize2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BarsWithLine, CalendarHeatGrid, Donut, RankBars, chartColors } from "@/components/charts/BratanCharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { readLocalValue, todayISO } from "@/lib/localStore";
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
  moneyFin,
  monthKeyLabel,
  parseFinAmount,
  previousMonthKey,
  type GestaoIndicador,
} from "./financeiroData";
import { buildMetasBoard, buildPainelReuniao, defaultMetasConfig, type MetasConfig } from "./metasData";
import { momentoDoMes, projecaoDoMes, tituloDaApresentacao } from "./momentoDoMes";
import { buildPontosDaReuniao, type PontoDaReuniao } from "./pontosDaReuniao";
import { RelatoriosContabilidadeCard } from "./RelatoriosContabilidadeCard";
import { useFinanceiro } from "./useFinanceiro";

const PDCA_CAMPOS: { key: string; titulo: string; ajuda: string }[] = [
  { key: "plan", titulo: "PLAN — Planejar", ajuda: "O que vamos fazer no próximo mês para melhorar o número que caiu?" },
  { key: "do", titulo: "DO — Executar", ajuda: "O que já foi feito neste mês (ações concretas, com responsável)?" },
  { key: "check", titulo: "CHECK — Verificar", ajuda: "O que os números mostram? Ex.: 'o lucro caiu 8% porque a obra puxou os custos — é pontual'." },
  { key: "act", titulo: "ACT — Agir", ajuda: "O que muda de forma definitiva a partir de agora (padrão novo, POP, alçada)?" },
];

/** Mesma chave usada na P12 e nas Metas — a configuração é uma só. */
const metasStorageKey = "app-bratan-fin-metas-config-v1";

function formatarValor(valor: number, formato: GestaoIndicador["formato"]) {
  if (formato === "percentual") return `${valor.toFixed(2).replace(".", ",")}%`;
  if (formato === "numero") return String(Math.round(valor));
  return moneyFin(valor);
}

/** Cores por tom do ponto — o mesmo vocabulário visual em toda a tela. */
const tomEstilo = {
  BOM: { card: "border-emerald-300 bg-emerald-50/70", texto: "text-emerald-900", chip: "bg-emerald-600" },
  ATENCAO: { card: "border-amber-300 bg-amber-50/70", texto: "text-amber-900", chip: "bg-amber-500" },
  RUIM: { card: "border-red-300 bg-red-50/70", texto: "text-red-900", chip: "bg-red-600" },
  NEUTRO: { card: "border-brand-oliva/25 bg-white/75", texto: "text-brand-tinta", chip: "bg-brand-musgo" },
} as const;

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
  // Até o dia 5 a reunião é sobre o mês que FECHOU; depois, o mês corrente.
  const mesPadrao = Number(hoje.slice(8, 10)) <= 5 ? previousMonthKey(hoje.slice(0, 7)) : hoje.slice(0, 7);
  const [monthKey, setMonthKey] = useState(mesPadrao);
  const [apresentando, setApresentando] = useState(false);
  const [bloco, setBloco] = useState(0);
  const [degrauAberto, setDegrauAberto] = useState("");
  const financeiro = useFinanceiro(Number(monthKey.slice(0, 4)));
  const mesAnterior = previousMonthKey(monthKey);
  const emAndamento = monthKey === hoje.slice(0, 7);

  // ---- números -------------------------------------------------------------
  const atual = useMemo(
    () => buildGestaoMensal(financeiro.sales, financeiro.expenses, financeiro.categories, monthKey, financeiro.crediarioProfits),
    [financeiro.sales, financeiro.expenses, financeiro.categories, monthKey, financeiro.crediarioProfits],
  );
  const anterior = useMemo(
    () => buildGestaoMensal(financeiro.sales, financeiro.expenses, financeiro.categories, mesAnterior, financeiro.crediarioProfits),
    [financeiro.sales, financeiro.expenses, financeiro.categories, mesAnterior, financeiro.crediarioProfits],
  );
  const indicadores = useMemo(() => buildGestaoComparativo(anterior, atual), [anterior, atual]);
  const evolucao = useMemo(
    () => buildEvolucaoMeses(financeiro.sales, financeiro.expenses, financeiro.categories, monthKey, 6, financeiro.crediarioProfits),
    [financeiro.sales, financeiro.expenses, financeiro.categories, monthKey, financeiro.crediarioProfits],
  );
  const fechamento = useMemo(
    () => buildFechamentoContabil(financeiro.sales, financeiro.expenses, financeiro.savingsMoves, monthKey, financeiro.crediarioProfits),
    [financeiro.sales, financeiro.expenses, financeiro.savingsMoves, monthKey, financeiro.crediarioProfits],
  );

  // O saldo do banco é digitado na P12 (Prova do dinheiro) e reaproveitado aqui.
  const saldoSalvoItau = ((): number | null => {
    try {
      const bruto = window.localStorage.getItem("app-bratan-fin-saldo-itau-v1");
      if (!bruto) return null;
      const valor = parseFinAmount(String((JSON.parse(bruto) as { texto?: string }).texto ?? ""));
      return valor > 0 ? valor : null;
    } catch {
      return null;
    }
  })();
  const perto = monthKey === hoje.slice(0, 7) || monthKey === previousMonthKey(hoje.slice(0, 7));
  const lucroRealCaixa =
    perto && saldoSalvoItau !== null
      ? buildProvaDoDinheiro(financeiro.expenses, financeiro.crediarioProfits, saldoSalvoItau, hoje).livreNoBanco
      : null;
  const ponte = useMemo(() => buildPonteLucro(atual, fechamento, lucroRealCaixa), [atual, fechamento, lucroRealCaixa]);

  const metasConfig = useMemo<MetasConfig>(
    () => ({ ...defaultMetasConfig, ...readLocalValue<Partial<MetasConfig>>(metasStorageKey, {}) }),
    [],
  );
  // MOMENTO DO MÊS (17/08/2026): a apresentação muda com o dia em que estamos.
  const momento = useMemo(() => momentoDoMes(monthKey, hoje), [monthKey, hoje]);
  const board = useMemo(() => buildMetasBoard(financeiro.sales, metasConfig, monthKey), [financeiro.sales, metasConfig, monthKey]);
  const painelMetas = useMemo(() => buildPainelReuniao(board, hoje), [board, hoje]);
  const projecao = useMemo(() => projecaoDoMes(financeiro.sales, momento, painelMetas.regua), [financeiro.sales, momento, painelMetas.regua]);

  const pontos = useMemo(
    () =>
      buildPontosDaReuniao({
        sales: financeiro.sales,
        expenses: financeiro.expenses,
        categories: financeiro.categories,
        savingsMoves: financeiro.savingsMoves,
        crediarioProfits: financeiro.crediarioProfits,
        monthKey,
        metasConfig,
        saldoBanco: lucroRealCaixa,
        hoje,
      }),
    [financeiro.sales, financeiro.expenses, financeiro.categories, financeiro.savingsMoves, financeiro.crediarioProfits, monthKey, metasConfig, lucroRealCaixa, hoje],
  );

  // ---- gráficos ------------------------------------------------------------
  const range = useMemo(() => ({ from: `${monthKey}-01`, to: `${monthKey}-31` }), [monthKey]);
  const heat = useMemo(() => buildCalendarHeat(financeiro.sales, monthKey), [financeiro.sales, monthKey]);
  const pagamentoDonut = useMemo(() => buildPaymentDonut(financeiro.sales, range), [financeiro.sales, range]);
  const itemDonut = useMemo(() => buildItemTypeDonut(financeiro.sales, range), [financeiro.sales, range]);
  const grupoDonut = useMemo(
    () => buildExpenseGroupDonut(financeiro.expenses, financeiro.categories, monthKey),
    [financeiro.expenses, financeiro.categories, monthKey],
  );
  const categoriaRank = useMemo(
    () => buildExpenseCategoryRank(financeiro.expenses, financeiro.categories, monthKey),
    [financeiro.expenses, financeiro.categories, monthKey],
  );
  const semana = useMemo(() => buildWeekdayStrength(financeiro.sales, range), [financeiro.sales, range]);
  const ticket = useMemo(
    () => buildTicketMedio(financeiro.sales, `${monthKey}-01`, `${monthKey}-31`),
    [financeiro.sales, monthKey],
  );

  // ---- explicações e PDCA (o que é escrito por gente) ----------------------
  const registroSalvo = financeiro.gestaoMensal.find((item) => item.monthRef === monthKey);
  const [explicacoes, setExplicacoes] = useState<Record<string, string>>({});
  const [pdca, setPdca] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    setExplicacoes(registroSalvo?.explicacoes ?? {});
    setPdca(registroSalvo?.pdca ?? {});
  }, [registroSalvo?.id, monthKey]);

  function salvar(apresentar = false) {
    financeiro.saveGestaoMensal({
      id: `gestao-mensal-${monthKey}`,
      monthRef: monthKey,
      explicacoes,
      pdca,
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

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>([monthKey, mesPadrao]);
    for (const venda of financeiro.sales) set.add(venda.saleDate.slice(0, 7));
    for (const conta of financeiro.expenses) {
      const mes = (conta.dueDate || conta.paidAt || "").slice(0, 7);
      if (mes) set.add(mes);
    }
    return [...set].filter(Boolean).sort().reverse();
  }, [financeiro.sales, financeiro.expenses, monthKey, mesPadrao]);

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
  ];

  /** Os três degraus da meta, com a SUPER-SUPERMETA como régua (17/08/2026). */
  const degraus = [
    { rotulo: "Meta", valor: board.goals.min, atingido: projecao.faturadoAteAgora >= board.goals.min },
    { rotulo: "Supermeta", valor: board.goals.target, atingido: projecao.faturadoAteAgora >= board.goals.target },
    { rotulo: "SUPER-SUPERMETA", valor: board.goals.super, atingido: projecao.faturadoAteAgora >= board.goals.super, regua: true },
  ];

  const blocos = [
    {
      chave: "olhar",
      titulo: momento.emAndamento ? `1. Onde estamos — ${momento.faseLabel}` : "1. Como o mês fechou",
      corpo: (
        <div className="grid gap-4">
          {/* ONDE ESTAMOS NO MÊS: a barra mostra dias úteis percorridos e o quanto
              do alvo já foi feito — as duas coisas lado a lado deixam na hora
              claro se estamos adiantados ou atrasados. */}
          {momento.emAndamento ? (
            <div className="rounded-xl border-2 border-brand-musgo/30 bg-brand-papel p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={cn("font-bold text-brand-musgo", apresentando ? "text-2xl" : "text-lg")}>
                  {tituloDaApresentacao(momento, projecao)}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-oliva">
                  dia {momento.dia} · {momento.diasUteisPassados} de {momento.diasUteisTotais} dias úteis
                </p>
              </div>
              <p className={cn("mt-1 leading-snug text-brand-tinta", apresentando ? "text-base" : "text-sm")}>{momento.foco}</p>

              <div className="mt-3 grid gap-2">
                {[
                  { rotulo: "O mês já andou", valor: momento.percorrido, texto: `${Math.round(momento.percorrido * 100)}% dos dias úteis`, cor: "bg-brand-oliva/50" },
                  {
                    rotulo: "Já faturamos",
                    valor: Math.min(1, projecao.alvo > 0 ? projecao.faturadoAteAgora / projecao.alvo : 0),
                    texto: `${projecao.percentualDoAlvo.toFixed(1).replace(".", ",")}% da régua (${moneyFin(projecao.faturadoAteAgora)})`,
                    cor: projecao.percentualDoAlvo >= momento.percorrido * 100 ? "bg-emerald-500" : "bg-amber-500",
                  },
                ].map((barra) => (
                  <div key={barra.rotulo}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold text-brand-tinta">{barra.rotulo}</span>
                      <span className="text-muted-foreground">{barra.texto}</span>
                    </div>
                    <div className="mt-1 h-3 overflow-hidden rounded-full bg-brand-oliva/15">
                      <div className={cn("h-full rounded-full transition-all", barra.cor)} style={{ width: `${Math.max(2, barra.valor * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* PROJEÇÃO — o número mais importante do mês em andamento */}
              <div
                className={cn(
                  "mt-3 rounded-lg border p-3",
                  projecao.noCaminho ? "border-emerald-300 bg-emerald-50/70" : "border-amber-300 bg-amber-50/70",
                )}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-oliva">
                  Se o ritmo continuar, o mês fecha em
                </p>
                <p className={cn("font-bold tabular-nums", apresentando ? "text-4xl" : "text-3xl", projecao.noCaminho ? "text-emerald-900" : "text-amber-900")}>
                  {moneyFin(projecao.projecao)}
                </p>
                <p className={cn("mt-1 leading-snug", apresentando ? "text-base" : "text-sm", projecao.noCaminho ? "text-emerald-900" : "text-amber-900")}>
                  {projecao.leitura}
                </p>
              </div>
            </div>
          ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((kpi) => {
            const variacao = kpi.antes > 0 ? ((kpi.agora - kpi.antes) / kpi.antes) * 100 : null;
            const melhorou = variacao === null ? null : kpi.inverso ? variacao < 0 : variacao > 0;
            return (
              <div
                key={kpi.rotulo}
                className={cn("rounded-xl border px-5 py-4", tomEstilo[kpi.tom].card)}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{kpi.rotulo}</p>
                <p className={cn("mt-1 font-bold tabular-nums", apresentando ? "text-4xl" : "text-2xl", tomEstilo[kpi.tom].texto)}>
                  {kpi.valor}
                </p>
                {variacao !== null ? (
                  <p className={cn("mt-0.5 flex items-center gap-1 text-xs font-semibold", melhorou ? "text-emerald-700" : "text-red-700")}>
                    {melhorou ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                    {variacao > 0 ? "+" : ""}
                    {variacao.toFixed(1).replace(".", ",")}% contra {monthKeyLabel(mesAnterior).slice(0, 3)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">sem base de comparação</p>
                )}
              </div>
            );
          })}
          </div>
        </div>
      ),
    },
    {
      chave: "escada",
      titulo: "2. A escada da meta — a régua é a super-supermeta",
      corpo: (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Três degraus. A régua da apresentação é o de cima: é nele que a porcentagem da equipe aumenta.
          </p>
          <div className="grid gap-2">
            {degraus.map((degrau) => {
              const feito = projecao.alvo > 0 ? Math.min(1, projecao.faturadoAteAgora / degrau.valor) : 0;
              const falta = Math.max(0, degrau.valor - projecao.faturadoAteAgora);
              return (
                <button
                  key={degrau.rotulo}
                  type="button"
                  onClick={() => setDegrauAberto((atual) => (atual === degrau.rotulo ? "" : degrau.rotulo))}
                  className={cn(
                    "w-full rounded-xl border-2 p-3 text-left transition",
                    degrau.atingido
                      ? "border-emerald-400 bg-emerald-50/70"
                      : degrau.regua
                        ? "border-brand-dourado bg-brand-creme/50"
                        : "border-brand-oliva/25 bg-white/70",
                    degrauAberto === degrau.rotulo && "ring-2 ring-brand-musgo/30",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className={cn("font-bold", apresentando ? "text-xl" : "text-base", degrau.regua ? "text-brand-musgo" : "text-brand-tinta")}>
                      {degrau.atingido ? "✓ " : ""}
                      {degrau.rotulo}
                    </span>
                    <span className={cn("font-bold tabular-nums text-brand-musgo", apresentando ? "text-2xl" : "text-lg")}>
                      {moneyFin(degrau.valor)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-brand-oliva/15">
                    <div
                      className={cn("h-full rounded-full", degrau.atingido ? "bg-emerald-500" : degrau.regua ? "bg-brand-dourado" : "bg-brand-oliva/50")}
                      style={{ width: `${Math.max(2, feito * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {degrau.atingido
                      ? "Atingido."
                      : `Faltam ${moneyFin(falta)}${momento.diasUteisRestantes > 0 ? ` · ${moneyFin(falta / momento.diasUteisRestantes)} por dia útil` : ""}`}
                  </p>
                  {degrauAberto === degrau.rotulo ? (
                    <p className="mt-2 rounded-md bg-white/80 p-2 text-xs leading-snug text-brand-tinta">
                      {degrau.regua
                        ? "É a régua da reunião. Acima dela a equipe ganha porcentagem maior — foi a decisão da CEO em 14/08."
                        : degrau.rotulo === "Meta"
                          ? "O mínimo. Nas palavras da CEO: 'o resto é medíocre, se a gente fizer, amém' — não é o que buscamos."
                          : "O degrau do meio. Bom, mas não é onde a equipe ganha mais."}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { rotulo: "Ritmo atual", valor: moneyFin(projecao.ritmoAtual), dica: "por dia útil trabalhado" },
              {
                rotulo: "Ritmo necessário",
                valor: momento.diasUteisRestantes > 0 ? moneyFin(projecao.precisaPorDia) : "—",
                dica: `para a régua em ${momento.diasUteisRestantes} dia(s)`,
              },
              {
                rotulo: "Aumento necessário",
                valor: projecao.aumentoNecessario === null ? "no caminho ✓" : `+${projecao.aumentoNecessario.toFixed(0)}%`,
                dica: "sobre o ritmo de hoje",
              },
            ].map((item) => (
              <div key={item.rotulo} className="rounded-lg border border-brand-oliva/20 bg-white/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{item.rotulo}</p>
                <p className={cn("font-bold tabular-nums text-brand-musgo", apresentando ? "text-2xl" : "text-xl")}>{item.valor}</p>
                <p className="text-[11px] text-muted-foreground">{item.dica}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      chave: "pontos",
      titulo: "3. Pontos para a reunião",
      corpo: (
        <div className="grid gap-2.5">
          {!pontos.length ? (
            <p className="text-sm text-muted-foreground">Sem dados suficientes neste mês para gerar pontos.</p>
          ) : null}
          {pontos.map((ponto, indice) => (
            <div key={ponto.id} className={cn("rounded-xl border p-4", tomEstilo[ponto.tom].card)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white", tomEstilo[ponto.tom].chip)}>
                  {indice + 1}
                </span>
                <p className={cn("font-bold", apresentando ? "text-xl" : "text-base", tomEstilo[ponto.tom].texto)}>{ponto.titulo}</p>
                <Badge variant="muted">{grupoLabels[ponto.grupo]}</Badge>
              </div>
              <p className={cn("mt-1.5 font-bold tabular-nums text-brand-musgo", apresentando ? "text-2xl" : "text-lg")}>{ponto.numero}</p>
              <p className={cn("mt-1 leading-relaxed text-brand-tinta", apresentando ? "text-base" : "text-sm")}>{ponto.leitura}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      chave: "lucros",
      titulo: "4. Os três lucros",
      corpo: (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            A pergunta que sempre aparece: "então quanto a gente ganhou?". Os três números estão certos — medem coisas
            diferentes.
          </p>
          {ponte.map((passo) => (
            <div
              key={passo.label}
              className={cn(
                "rounded-lg border px-4 py-3",
                passo.tipo === "base"
                  ? "border-brand-musgo/30 bg-brand-papel"
                  : passo.tipo === "total"
                    ? "border-emerald-300 bg-emerald-50/60"
                    : "border-brand-oliva/20 bg-white/70",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={cn("font-semibold text-brand-tinta", apresentando ? "text-lg" : "text-sm")}>{passo.label}</p>
                <p className={cn("font-bold tabular-nums text-brand-musgo", apresentando ? "text-2xl" : "text-lg")}>
                  {moneyFin(passo.valor)}
                </p>
              </div>
              <p className={cn("mt-0.5 leading-snug text-muted-foreground", apresentando ? "text-sm" : "text-xs")}>
                {passo.explicacao}
              </p>
            </div>
          ))}
        </div>
      ),
    },
    {
      chave: "evolucao",
      titulo: "5. Evolução dos últimos 6 meses",
      corpo: (
        <div className="grid gap-3">
          <BarsWithLine
            labels={evolucao.map((mes) => monthKeyLabel(mes.monthKey).slice(0, 3))}
            bars={[
              { name: "Faturamento", values: evolucao.map((mes) => mes.faturamento), color: chartColors.entrada },
              { name: "Custos", values: evolucao.map((mes) => mes.custosTotais), color: chartColors.saida },
            ]}
            line={{ name: "Lucro", values: evolucao.map((mes) => mes.lucroLiquido), color: chartColors.resultado }}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <thead className="text-xs uppercase text-brand-oliva">
                <tr>
                  <th className="px-2 py-1.5">Mês</th>
                  <th className="px-2 py-1.5 text-right">Faturamento</th>
                  <th className="px-2 py-1.5 text-right">Custos</th>
                  <th className="px-2 py-1.5 text-right">Lucro</th>
                  <th className="px-2 py-1.5 text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-oliva/12">
                {evolucao.map((mes) => (
                  <tr key={mes.monthKey} className={cn(mes.monthKey === monthKey && "bg-brand-creme/40")}>
                    <td className="px-2 py-1.5 font-semibold text-brand-tinta">{monthKeyLabel(mes.monthKey)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{moneyFin(mes.faturamento)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{moneyFin(mes.custosTotais)}</td>
                    <td className={cn("px-2 py-1.5 text-right font-bold tabular-nums", mes.lucroLiquido >= 0 ? "text-brand-musgo" : "text-red-800")}>
                      {moneyFin(mes.lucroLiquido)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{mes.margem.toFixed(1).replace(".", ",")}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      chave: "fluxo",
      titulo: "6. De onde vem e para onde vai",
      corpo: (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-tinta">Como o paciente paga</p>
            <Donut slices={pagamentoDonut} emptyMessage="Sem comandas neste mês." />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-tinta">O que ele compra</p>
            <Donut slices={itemDonut} emptyMessage="Sem comandas neste mês." />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-tinta">Para onde vai o custo</p>
            <Donut slices={grupoDonut} emptyMessage="Sem contas neste mês." />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-tinta">As 8 maiores linhas de custo</p>
            <RankBars points={categoriaRank} emptyMessage="Sem contas neste mês." />
          </div>
        </div>
      ),
    },
    {
      chave: "ritmo",
      titulo: "7. Ritmo do mês",
      corpo: (
        <div className="grid gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-tinta">Faturamento dia a dia</p>
            <CalendarHeatGrid heat={heat} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-tinta">Força por dia da semana</p>
            <RankBars points={semana} color={chartColors.entrada} emptyMessage="Sem comandas neste mês." />
          </div>
        </div>
      ),
    },
  ];

  const blocoAtual = blocos[Math.min(bloco, blocos.length - 1)];

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Painel do Mês" module="fin-gestao">
      <div className={cn("mx-auto flex w-full flex-col gap-5", apresentando ? "max-w-6xl" : "max-w-6xl")}>
        {/* ---- cabeçalho ---------------------------------------------------- */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Reunião de Líderes</Badge>
            <Badge variant="muted">{financeiro.syncMode}</Badge>
            {momento.emAndamento ? (
              <Badge variant="outline">
                dia {momento.dia} · {Math.round(momento.percorrido * 100)}% do mês
              </Badge>
            ) : null}
            {registroSalvo?.apresentadoEm ? <Badge variant="muted">apresentado</Badge> : null}
          </div>
          <h1 className={cn("mt-3 flex flex-wrap items-center gap-2 leading-tight text-brand-musgo", apresentando ? "text-5xl" : "text-3xl sm:text-4xl")}>
            <BarChart3 className={apresentando ? "h-10 w-10" : "h-7 w-7"} aria-hidden="true" />
            Painel de {monthKeyLabel(monthKey)}
            {momento.emAndamento ? (
              <span className={cn("font-normal text-brand-oliva", apresentando ? "text-2xl" : "text-base")}>
                · {momento.faseLabel}
              </span>
            ) : null}
            <InfoTip title="A apresentação se ajusta ao dia">
              Relatórios e Gestão Mensal viraram este painel. Quando você clica em "Apresentar", ele calcula em que
              momento do mês estamos (começo, meio, reta final ou fechado) e muda o que enfatiza: no começo, o ritmo
              necessário; no meio, a PROJEÇÃO de fechamento; na reta final, quanto falta por dia; com o mês fechado, o
              resultado e a análise. A régua é a SUPER-SUPERMETA.
            </InfoTip>
          </h1>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="painel-mes">Mês</Label>
              <select
                id="painel-mes"
                value={monthKey}
                onChange={(event) => {
                  setMonthKey(event.target.value);
                  setBloco(0);
                }}
                className="mt-1 block rounded-md border border-brand-oliva/25 bg-white/80 px-3 py-2 text-sm font-semibold text-brand-tinta"
              >
                {mesesDisponiveis.map((mes) => (
                  <option key={mes} value={mes}>
                    {monthKeyLabel(mes)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" className="gap-2" onClick={() => setApresentando((atual) => !atual)}>
              {apresentando ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
              {apresentando ? "Sair da apresentação" : "Apresentar"}
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={copiarPontos}>
              <Copy className="h-4 w-4" aria-hidden="true" /> Copiar os pontos
            </Button>
            {!readOnly ? (
              <>
                <Button type="button" variant="outline" onClick={() => salvar(false)}>
                  Salvar
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={() => salvar(true)}>
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Marcar como apresentado
                </Button>
              </>
            ) : null}
          </div>
          {feedback ? <p className="mt-3 text-sm font-semibold text-brand-musgo">{feedback}</p> : null}
          {momento.emAndamento ? (
            <p className="mt-3 rounded-md border border-brand-dourado/40 bg-brand-creme/40 px-3 py-2 text-xs leading-snug text-brand-tinta">
              Estamos no <strong>{momento.faseLabel}</strong> ({momento.diasUteisPassados} de {momento.diasUteisTotais} dias
              úteis). As contas do mês inteiro já estão lançadas e o faturamento ainda entra — por isso margem e ponto de
              equilíbrio só aparecem com o mês fechado, e as comparações são feitas no{" "}
              <strong>mesmo ponto do mês</strong> (dia 1 até hoje, nos dois meses).
            </p>
          ) : null}
        </motion.section>

        {/* ---- MODO APRESENTAÇÃO: um bloco por vez -------------------------- */}
        {apresentando ? (
          <>
            <Card className="border-brand-musgo/30 bg-white/80">
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-2xl text-brand-musgo">
                  {blocoAtual.titulo}
                  <span className="text-sm font-normal text-muted-foreground">
                    {bloco + 1} de {blocos.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>{blocoAtual.corpo}</CardContent>
            </Card>
            <div className="sticky bottom-3 flex items-center justify-between gap-2 rounded-xl border border-brand-oliva/25 bg-brand-papel/95 p-2 shadow-calm backdrop-blur">
              <Button type="button" variant="outline" className="gap-2" disabled={bloco === 0} onClick={() => setBloco((n) => n - 1)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Anterior
              </Button>
              <div className="flex gap-1.5">
                {blocos.map((item, indice) => (
                  <button
                    key={item.chave}
                    type="button"
                    aria-label={item.titulo}
                    onClick={() => setBloco(indice)}
                    className={cn("h-2.5 w-2.5 rounded-full transition", indice === bloco ? "bg-brand-musgo" : "bg-brand-oliva/30")}
                  />
                ))}
              </div>
              <Button
                type="button"
                className="gap-2"
                disabled={bloco === blocos.length - 1}
                onClick={() => setBloco((n) => n + 1)}
              >
                Próximo <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* ---- tudo aberto, para trabalhar ----------------------------- */}
            {blocos.map((item) => (
              <Card key={item.chave} className="border-brand-oliva/20 bg-white/70">
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                    {item.chave === "pontos" ? <Lightbulb className="h-5 w-5 text-brand-dourado" aria-hidden="true" /> : null}
                    {item.chave === "lucros" ? <GitMerge className="h-5 w-5 text-brand-musgo" aria-hidden="true" /> : null}
                    {item.titulo}
                    {item.chave === "pontos" ? <Badge variant="gold">{pontos.length}</Badge> : null}
                  </CardTitle>
                </CardHeader>
                <CardContent>{item.corpo}</CardContent>
              </Card>
            ))}

            {/* ---- comparativo com explicações (o trabalho do dia 5) ------- */}
            <Card className="border-brand-oliva/20 bg-white/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                  <ClipboardCheck className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
                  Comparativo com {monthKeyLabel(mesAnterior)} — e a explicação de cada número
                  <InfoTip title="Como usar">
                    Nenhum número é digitado: todos vêm dos lançamentos. Você escreve só a EXPLICAÇÃO de cada linha — é o
                    que a reunião cobra. O texto fica salvo e todo mundo vê o mesmo.
                  </InfoTip>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {indicadores.map((indicador) => {
                  const subiu = indicador.variacao > 0;
                  return (
                    <div key={indicador.key} className="rounded-lg border border-brand-oliva/16 bg-white/80 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-brand-tinta">{indicador.label}</p>
                        <p className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{formatarValor(indicador.anterior, indicador.formato)}</span>
                          <span aria-hidden="true">→</span>
                          <strong className="tabular-nums text-brand-musgo">{formatarValor(indicador.atual, indicador.formato)}</strong>
                          {indicador.variacao !== 0 ? (
                            <span className={cn("flex items-center gap-0.5 text-xs font-semibold", subiu ? "text-emerald-700" : "text-red-700")}>
                              {subiu ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                              {formatarValor(Math.abs(indicador.variacao), indicador.formato)}
                              {indicador.variacaoPercent !== null
                                ? ` (${indicador.variacaoPercent > 0 ? "+" : ""}${indicador.variacaoPercent.toFixed(1).replace(".", ",")}%)`
                                : ""}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <textarea
                        value={explicacoes[indicador.key] ?? ""}
                        onChange={(event) => setExplicacoes((atual) => ({ ...atual, [indicador.key]: event.target.value }))}
                        onBlur={() => (readOnly ? undefined : salvar(false))}
                        disabled={readOnly}
                        rows={2}
                        placeholder="Por que este número mudou?"
                        className="mt-2 w-full rounded-md border border-input bg-white/72 px-3 py-2 text-sm"
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* ---- PDCA --------------------------------------------------- */}
            <Card className="border-brand-dourado/40 bg-brand-creme/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Análise do mês e plano de ação (PDCA)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {PDCA_CAMPOS.map((campo) => (
                  <div key={campo.key}>
                    <Label>{campo.titulo}</Label>
                    <p className="mb-1 text-[11px] leading-snug text-muted-foreground">{campo.ajuda}</p>
                    <textarea
                      value={pdca[campo.key] ?? ""}
                      onChange={(event) => setPdca((atual) => ({ ...atual, [campo.key]: event.target.value }))}
                      onBlur={() => (readOnly ? undefined : salvar(false))}
                      disabled={readOnly}
                      rows={4}
                      className="w-full rounded-md border border-input bg-white/72 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* ---- arquivos para a contabilidade -------------------------- */}
            <RelatoriosContabilidadeCard
              sales={financeiro.sales}
              expenses={financeiro.expenses}
              categories={financeiro.categories}
              savingsMoves={financeiro.savingsMoves}
              crediarioProfits={financeiro.crediarioProfits}
              monthKey={monthKey}
              mostrarSeletor={false}
            />
          </>
        )}
      </div>
    </AccessGate>
  );
}
