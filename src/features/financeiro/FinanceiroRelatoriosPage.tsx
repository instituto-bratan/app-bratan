// Relatórios do Financeiro (28/07/2026, pedido do Lucas): os números das outras
// abas em forma PALPÁVEL — gráficos e mapa de calor. Esta tela NÃO cria dado
// nenhum: tudo deriva das mesmas fontes oficiais (comandas do Lançar Dia,
// contas da P12, poupança), e cada card linka para a aba de origem.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, BarChart3, CalendarDays, ChartPie, Flame, TrendingUp, Trophy } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { BarsWithLine, CalendarHeatGrid, Donut, RankBars, TrendLine, chartColors } from "@/components/charts/BratanCharts";
import { canFinanceiroView } from "@/lib/access";
import {
  buildCalendarHeat,
  buildExpenseCategoryRank,
  buildExpenseGroupDonut,
  buildItemTypeDonut,
  buildMonthlyResultSeries,
  buildPaymentDonut,
  buildTicketMonthly,
  buildWeekdayStrength,
  moneyCompact,
} from "@/lib/chartData";
import { readLocalValue, todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { buildP12Matrix, buildResumoMes, moneyFin } from "./financeiroData";
import { defaultMetasConfig, type MetasConfig } from "./metasData";
import { useFinanceiro } from "./useFinanceiro";

const metasStorageKey = "app-bratan-fin-metas-config-v1";

// Cabeçalho padrão dos cards: título + explicação + link para a fonte do dado.
function ChartCard({
  icon: Icon,
  title,
  explain,
  source,
  href,
  children,
  className,
}: {
  icon: typeof BarChart3;
  title: string;
  explain: string;
  source: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Icon className="h-4.5 w-4.5 h-5 w-5 text-brand-oliva" aria-hidden="true" />
          {title}
          <InfoTip title={title}>{explain}</InfoTip>
          <Link
            to={href}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-brand-oliva underline-offset-2 hover:underline"
          >
            {source}
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function FinanceiroRelatoriosPage() {
  const hoje = todayISO();
  const [year, setYear] = useState(Number(hoje.slice(0, 4)));
  const [monthKey, setMonthKey] = useState(hoje.slice(0, 7));
  const financeiro = useFinanceiro(year);

  const matrix = useMemo(
    () => buildP12Matrix(financeiro.sales, financeiro.expenses, financeiro.categories, year, financeiro.savingsMoves),
    [financeiro.sales, financeiro.expenses, financeiro.categories, year, financeiro.savingsMoves],
  );
  const serie = useMemo(() => buildMonthlyResultSeries(matrix), [matrix]);
  const heat = useMemo(() => buildCalendarHeat(financeiro.sales, monthKey), [financeiro.sales, monthKey]);
  const monthRange = useMemo(() => ({ from: `${monthKey}-01`, to: `${monthKey}-31` }), [monthKey]);
  const pagamentoDonut = useMemo(() => buildPaymentDonut(financeiro.sales, monthRange), [financeiro.sales, monthRange]);
  const itemDonut = useMemo(() => buildItemTypeDonut(financeiro.sales, monthRange), [financeiro.sales, monthRange]);
  const grupoDonut = useMemo(
    () => buildExpenseGroupDonut(financeiro.expenses, financeiro.categories, monthKey),
    [financeiro.expenses, financeiro.categories, monthKey],
  );
  const categoriaRank = useMemo(
    () => buildExpenseCategoryRank(financeiro.expenses, financeiro.categories, monthKey),
    [financeiro.expenses, financeiro.categories, monthKey],
  );
  const ticketMensal = useMemo(() => buildTicketMonthly(financeiro.sales, year), [financeiro.sales, year]);
  const weekdayStrength = useMemo(
    () => buildWeekdayStrength(financeiro.sales, monthRange),
    [financeiro.sales, monthRange],
  );

  // Resumo do mês escolhido — mesmos números do card oficial da P12/Contas.
  const metasConfig = useMemo<MetasConfig>(
    () => ({ ...defaultMetasConfig, ...readLocalValue<Partial<MetasConfig>>(metasStorageKey, {}) }),
    [],
  );
  const resumo = useMemo(
    () =>
      buildResumoMes(financeiro.sales, financeiro.expenses, financeiro.categories, financeiro.savingsMoves, metasConfig, monthKey),
    [financeiro.sales, financeiro.expenses, financeiro.categories, financeiro.savingsMoves, metasConfig, monthKey],
  );

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`),
    [year],
  );
  const monthLabel = (key: string) =>
    new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long" });

  const kpis = [
    { label: "Faturamento do mês", value: moneyFin(resumo.faturamento), tone: "text-brand-musgo", href: "/financeiro/lancar-dia" },
    { label: "Custos do mês", value: moneyFin(resumo.custosOperacionais), tone: "text-brand-tinta", href: "/financeiro/contas" },
    {
      label: "Lucro operacional",
      value: moneyFin(resumo.lucroOperacional),
      tone: resumo.lucroOperacional >= 0 ? "text-brand-musgo" : "text-destructive",
      href: "/financeiro/p12",
    },
    {
      label: "Meta do mês",
      value: `${Math.round(resumo.metaPercent * 100)}%`,
      tone: resumo.metaPercent >= 1 ? "text-brand-musgo" : "text-brand-dourado",
      href: "/financeiro/metas",
    },
  ];

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Relatórios" module="fin-relatorios">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Financeiro 360</Badge>
                <Badge variant="muted">Somente leitura</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Relatórios
                <InfoTip title="O Financeiro em imagem">
                  Os mesmos números das outras abas, em forma de gráfico: nada aqui é digitado, tudo deriva das comandas,
                  das contas e da poupança. Cada card diz de onde o dado vem — clique na fonte para ir até ela.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                O ano inteiro de um lado, o mês escolhido do outro: onde o dinheiro entra, para onde vai e quais dias rendem.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={year}
                onChange={(event) => {
                  const nextYear = Number(event.target.value);
                  setYear(nextYear);
                  setMonthKey(`${nextYear}-${monthKey.slice(5, 7)}`);
                }}
                className="h-9 rounded-md border border-brand-oliva/30 bg-white/80 px-2 text-sm"
                aria-label="Ano"
              >
                {[year - 1, year, year + 1].filter((option) => option >= 2025).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-1 rounded-lg border border-brand-oliva/20 bg-white/70 p-1">
                {monthOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMonthKey(option)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-semibold capitalize transition",
                      option === monthKey ? "bg-brand-musgo text-white" : "text-brand-oliva hover:bg-brand-creme/60",
                    )}
                  >
                    {monthLabel(option).slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <Link
                key={kpi.label}
                to={kpi.href}
                className="rounded-lg border border-brand-oliva/15 bg-white/70 p-3 transition hover:border-brand-oliva/40"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{kpi.label}</p>
                <p className={cn("mt-1 text-2xl font-bold leading-tight", kpi.tone)} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {kpi.value}
                </p>
              </Link>
            ))}
          </div>
        </motion.section>

        <ChartCard
          icon={BarChart3}
          title={`Faturamento × Custos × Lucro — ${year}`}
          explain="Barra dourada = o que entrou (comandas). Barra barro = custos operacionais (competência do vencimento, sem obra). Linha musgo = lucro do mês. É a P12 desenhada."
          source="P12 ao vivo"
          href="/financeiro/p12"
        >
          <BarsWithLine
            labels={serie.labels}
            bars={[
              { name: "Faturamento", values: serie.faturamento, color: chartColors.entrada },
              { name: "Custos", values: serie.custos, color: chartColors.saida },
            ]}
            line={{ name: "Lucro", values: serie.lucro, color: chartColors.resultado }}
            upTo={year === Number(hoje.slice(0, 4)) ? serie.lastActiveMonth : undefined}
          />
        </ChartCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            icon={Flame}
            title={`Mapa de calor — ${monthLabel(monthKey)}`}
            explain="Cada quadradinho é um dia do mês: quanto mais escuro, mais dinheiro entrou naquele dia (comandas do Lançar Dia). Passe o mouse para ver o valor e o número de comandas."
            source="Lançar Dia"
            href="/financeiro/lancar-dia"
          >
            <CalendarHeatGrid heat={heat} />
          </ChartCard>

          <ChartCard
            icon={Trophy}
            title={`Força dos dias da semana — ${monthLabel(monthKey)}`}
            explain="Soma do faturamento por dia da semana no mês: mostra em quais dias a agenda rende mais — bom para decidir onde abrir horário."
            source="Lançar Dia"
            href="/financeiro/lancar-dia"
          >
            <RankBars points={weekdayStrength} color={chartColors.entrada} />
          </ChartCard>

          <ChartCard
            icon={ChartPie}
            title={`Como o dinheiro entra — ${monthLabel(monthKey)}`}
            explain="Soma dos pagamentos das comandas do mês por forma: PIX, cartão, dinheiro… O total do centro é o que foi pago no mês."
            source="Lançar Dia"
            href="/financeiro/lancar-dia"
          >
            <Donut slices={pagamentoDonut} centerLabel="pago no mês" emptyMessage="Nenhum pagamento no mês ainda." />
          </ChartCard>

          <ChartCard
            icon={ChartPie}
            title={`O que é vendido — ${monthLabel(monthKey)}`}
            explain="Soma dos itens das comandas por tipo: tratamento, consulta, bioimpedância… Mostra o que sustenta o faturamento."
            source="Lançar Dia"
            href="/financeiro/lancar-dia"
          >
            <Donut slices={itemDonut} centerLabel="vendido no mês" emptyMessage="Nenhum item vendido no mês ainda." />
          </ChartCard>

          <ChartCard
            icon={ChartPie}
            title={`Para onde o dinheiro vai — ${monthLabel(monthKey)}`}
            explain="Custos do mês por grupo da P12 (competência do vencimento): custo fixo, mão de obra, variáveis e poupança. Obra/investimento fica fora, como na P12."
            source="Contas a Pagar"
            href="/financeiro/contas"
          >
            <Donut slices={grupoDonut} centerLabel="custos do mês" emptyMessage="Nenhuma conta com vencimento neste mês." />
          </ChartCard>

          <ChartCard
            icon={CalendarDays}
            title={`Maiores despesas — ${monthLabel(monthKey)}`}
            explain="As categorias que mais pesam no mês, da maior para a menor. O rabo vira 'Outras' para o gráfico não virar uma lista infinita."
            source="Contas a Pagar"
            href="/financeiro/contas"
          >
            <RankBars points={categoriaRank} color={chartColors.saida} emptyMessage="Nenhuma despesa no mês ainda." />
          </ChartCard>
        </div>

        <ChartCard
          icon={TrendingUp}
          title={`Ticket médio mês a mês — ${year}`}
          explain="Faturamento do mês dividido pelo número de comandas: quanto cada atendimento rende, na média. Subindo = vendas maiores por paciente."
          source="Inteligência 360"
          href="/inteligencia-360"
        >
          <TrendLine
            points={ticketMensal}
            color={chartColors.apoio}
            upTo={year === Number(hoje.slice(0, 4)) ? Number(hoje.slice(5, 7)) - 1 : undefined}
          />
        </ChartCard>
      </div>
    </AccessGate>
  );
}
