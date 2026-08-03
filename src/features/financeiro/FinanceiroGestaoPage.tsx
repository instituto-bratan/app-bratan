// GESTÃO MENSAL — Reunião de Líderes (03/08/2026, planilha do Coordenador
// Financeiro). Réplica viva da planilha que o Lucas apresenta até o dia 5:
//   1. Comparativo mês anterior × mês atual (variação em R$ e %) + explicação;
//   2. Evolução dos últimos 6 meses (tabela + gráfico);
//   3. PDCA do mês.
// Regra da casa: NENHUM número é digitado. Só as explicações e o PDCA são
// escritos por gente — e ficam salvos no Supabase (todo mundo vê o mesmo).
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, ClipboardCheck, Copy, GitMerge, TrendingDown, TrendingUp } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BarsWithLine } from "@/components/charts/BratanCharts";
import { chartColors } from "@/components/charts/BratanCharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  buildEvolucaoMeses,
  buildFechamentoContabil,
  buildGestaoComparativo,
  buildGestaoMensal,
  buildPonteLucro,
  buildProvaDoDinheiro,
  moneyFin,
  monthKeyLabel,
  parseFinAmount,
  previousMonthKey,
  type GestaoIndicador,
} from "./financeiroData";
import { RelatoriosContabilidadeCard } from "./RelatoriosContabilidadeCard";
import { useFinanceiro } from "./useFinanceiro";

const PDCA_CAMPOS: { key: string; titulo: string; ajuda: string }[] = [
  { key: "plan", titulo: "PLAN — Planejar", ajuda: "O que vamos fazer no próximo mês para melhorar o número que caiu?" },
  { key: "do", titulo: "DO — Executar", ajuda: "O que já foi feito neste mês (ações concretas, com responsável)?" },
  { key: "check", titulo: "CHECK — Verificar", ajuda: "O que os números mostram? Ex.: 'o lucro caiu 8% porque a obra puxou os custos variáveis — é pontual'." },
  { key: "act", titulo: "ACT — Agir", ajuda: "O que muda de forma definitiva a partir de agora (padrão novo, POP, alçada)?" },
];

function formatarValor(valor: number, formato: GestaoIndicador["formato"]) {
  if (formato === "percentual") return `${valor.toFixed(2).replace(".", ",")}%`;
  if (formato === "numero") return String(Math.round(valor));
  return moneyFin(valor);
}

export function FinanceiroGestaoPage() {
  const { pessoa } = useAuth();
  const readOnly = !canEditModule(pessoa, "fin-gestao");
  const hoje = todayISO();
  // Até o dia 5 a reunião é sobre o mês que FECHOU; depois disso, o mês corrente.
  const mesPadrao = Number(hoje.slice(8, 10)) <= 5 ? previousMonthKey(hoje.slice(0, 7)) : hoje.slice(0, 7);
  const [monthKey, setMonthKey] = useState(mesPadrao);
  const financeiro = useFinanceiro(Number(monthKey.slice(0, 4)));
  const mesAnterior = previousMonthKey(monthKey);

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

  // Ponte do lucro: por que existem 3 números (operacional × contábil × caixa).
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
  const ehMesCorrenteOuAnterior = monthKey === hoje.slice(0, 7) || monthKey === previousMonthKey(hoje.slice(0, 7));
  const lucroRealCaixa = ehMesCorrenteOuAnterior && saldoSalvoItau !== null
    ? buildProvaDoDinheiro(financeiro.expenses, financeiro.crediarioProfits, saldoSalvoItau, hoje).livreNoBanco
    : null;
  const ponte = useMemo(() => buildPonteLucro(atual, fechamento, lucroRealCaixa), [atual, fechamento, lucroRealCaixa]);

  // Explicações e PDCA: vêm do banco quando existem, e são salvos ao sair do campo.
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

  function textoApresentacao() {
    const linhas = [
      `GESTÃO FINANCEIRA — ${monthKeyLabel(monthKey)} (Instituto Bratan)`,
      `Comparação com ${monthKeyLabel(mesAnterior)}`,
      "",
      ...indicadores.map((indicador) => {
        const seta = indicador.variacao === 0 ? "=" : indicador.variacao > 0 ? "▲" : "▼";
        const percentual = indicador.variacaoPercent === null ? "" : ` (${indicador.variacaoPercent > 0 ? "+" : ""}${indicador.variacaoPercent.toFixed(1).replace(".", ",")}%)`;
        const explicacao = explicacoes[indicador.key]?.trim();
        return `${indicador.label}: ${formatarValor(indicador.atual, indicador.formato)} ${seta} ${formatarValor(Math.abs(indicador.variacao), indicador.formato)}${percentual}${explicacao ? `\n   → ${explicacao}` : ""}`;
      }),
      "",
      "OBRA (investimento, fora do lucro): " + moneyFin(atual.obra),
      "CREDIÁRIO (controle interno, fora da contabilidade): " + moneyFin(atual.crediario),
      "",
      "PDCA",
      ...PDCA_CAMPOS.map((campo) => `${campo.titulo}: ${pdca[campo.key]?.trim() || "—"}`),
    ];
    return linhas.join("\n");
  }

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>([hoje.slice(0, 7), previousMonthKey(hoje.slice(0, 7))]);
    for (const sale of financeiro.sales) set.add(sale.saleDate.slice(0, 7));
    return [...set].sort().reverse();
  }, [financeiro.sales, hoje]);

  const lucroLabel = atual.lucroLiquido >= 0 ? "text-brand-musgo" : "text-red-700";

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Gestão Mensal" module="fin-gestao">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Reunião de Líderes</Badge>
            <Badge variant="muted">{financeiro.syncMode}</Badge>
            {registroSalvo?.apresentadoEm ? (
              <Badge variant="muted">
                apresentado em {new Date(registroSalvo.apresentadoEm).toLocaleDateString("pt-BR")}
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-3 flex flex-wrap items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
            Gestão Mensal — {monthKeyLabel(monthKey)}
            <InfoTip title="Para que serve esta tela">
              É a planilha de gestão do Coordenador Financeiro, viva: você apresenta até o dia 5 de cada mês. Os números
              saem sozinhos das comandas e das contas a pagar — nada é digitado. Você só escreve a explicação de cada
              indicador ("subiu/desceu por quê?") e o PDCA. Tudo fica salvo e todo mundo da coordenação vê o mesmo.
            </InfoTip>
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Entregar e apresentar na Reunião de Líderes até o dia 5. Explique cada variação com uma frase — é isso que o
            time e a CEO leem.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="mes-gestao">Mês da apresentação</Label>
              <select
                id="mes-gestao"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
                className="mt-1 block rounded-md border border-brand-oliva/25 bg-white/80 px-3 py-2 text-sm font-semibold text-brand-tinta"
              >
                {mesesDisponiveis.map((mes) => (
                  <option key={mes} value={mes}>
                    {monthKeyLabel(mes)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                navigator.clipboard?.writeText(textoApresentacao());
                setFeedback("Apresentação copiada — é só colar no grupo ou no slide.");
              }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Copiar apresentação
            </Button>
            {!readOnly ? (
              <>
                <Button type="button" variant="outline" onClick={() => salvar(false)}>
                  Salvar explicações
                </Button>
                <Button type="button" className="gap-1.5" onClick={() => salvar(true)}>
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Marcar como apresentado
                </Button>
              </>
            ) : null}
          </div>
          {feedback ? <p className="mt-3 text-sm font-semibold text-brand-musgo">{feedback}</p> : null}
        </motion.section>

        {/* ---- Placar do mês ------------------------------------------------ */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Faturamento bruto", valor: moneyFin(atual.faturamento), hint: "comandas do mês" },
            { label: "Custos operacionais", valor: moneyFin(atual.custosTotais), hint: "fixos + folha + variáveis + provisões" },
            { label: "Lucro líquido", valor: moneyFin(atual.lucroLiquido), hint: `margem ${atual.margem.toFixed(1).replace(".", ",")}%`, destaque: true },
            { label: "Obra (fora do lucro)", valor: moneyFin(atual.obra), hint: "investimento pago pelo cofre" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-brand-oliva/20 bg-white/70 px-5 py-4">
              <p className="text-xs font-semibold uppercase text-brand-oliva">{card.label}</p>
              <p className={cn("mt-1 text-2xl font-bold", card.destaque ? lucroLabel : "text-brand-musgo")}>{card.valor}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{card.hint}</p>
            </div>
          ))}
        </div>

        {/* ---- 1. Comparativo mensal --------------------------------------- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              <ClipboardCheck className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
              1. Comparativo mensal — {monthKeyLabel(mesAnterior)} × {monthKeyLabel(monthKey)}
              <Badge variant="muted" className="text-[10px]">números automáticos</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-brand-oliva/20 text-left text-xs uppercase text-brand-oliva">
                    <th className="py-2 pr-3">Indicador</th>
                    <th className="py-2 pr-3 text-right">{monthKeyLabel(mesAnterior)}</th>
                    <th className="py-2 pr-3 text-right">{monthKeyLabel(monthKey)}</th>
                    <th className="py-2 pr-3 text-right">Variação</th>
                    <th className="py-2 pr-3 text-right">%</th>
                    <th className="py-2">Subiu ou desceu? Por quê? (explicação para o time)</th>
                  </tr>
                </thead>
                <tbody>
                  {indicadores.map((indicador) => {
                    const bom = indicador.variacao === 0 ? null : indicador.subirEhBom ? indicador.variacao > 0 : indicador.variacao < 0;
                    return (
                      <tr key={indicador.key} className="border-b border-brand-oliva/10 align-top">
                        <td className="py-2 pr-3 font-semibold text-brand-tinta">{indicador.label}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {formatarValor(indicador.anterior, indicador.formato)}
                        </td>
                        <td className="py-2 pr-3 text-right font-bold tabular-nums text-brand-musgo">
                          {formatarValor(indicador.atual, indicador.formato)}
                        </td>
                        <td className={cn("py-2 pr-3 text-right tabular-nums font-semibold", bom === null ? "text-muted-foreground" : bom ? "text-brand-musgo" : "text-red-700")}>
                          <span className="inline-flex items-center gap-1">
                            {indicador.variacao !== 0 ? (
                              indicador.variacao > 0 ? (
                                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                              )
                            ) : null}
                            {formatarValor(indicador.variacao, indicador.formato)}
                          </span>
                        </td>
                        <td className={cn("py-2 pr-3 text-right tabular-nums", bom === null ? "text-muted-foreground" : bom ? "text-brand-musgo" : "text-red-700")}>
                          {indicador.variacaoPercent === null ? "—" : `${indicador.variacaoPercent > 0 ? "+" : ""}${indicador.variacaoPercent.toFixed(1).replace(".", ",")}%`}
                        </td>
                        <td className="py-2">
                          <textarea
                            rows={2}
                            readOnly={readOnly}
                            placeholder="Ex.: subiu 12% porque entraram 3 tratamentos completos na última semana."
                            value={explicacoes[indicador.key] ?? ""}
                            onChange={(event) => setExplicacoes((atualState) => ({ ...atualState, [indicador.key]: event.target.value }))}
                            onBlur={() => (readOnly ? undefined : salvar(false))}
                            className="w-full min-w-[240px] rounded-md border border-brand-oliva/25 bg-white/80 px-2 py-1.5 text-xs text-brand-tinta"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Nada aqui é digitado: faturamento vem das comandas, custos vêm do Contas a Pagar (competência pelo
              vencimento). A obra (CAPEX) fica fora do lucro porque é investimento pago pelo cofre, e o crediário fica
              fora da contabilidade — os dois aparecem separados no placar acima.
            </p>
          </CardContent>
        </Card>

        {/* ---- 2. Evolução 6 meses ---------------------------------------- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
              2. Evolução — últimos 6 meses
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <BarsWithLine
              labels={evolucao.map((mes) => monthKeyLabel(mes.monthKey).slice(0, 3))}
              bars={[
                { name: "Faturamento", values: evolucao.map((mes) => mes.faturamento), color: chartColors.entrada },
                { name: "Custos", values: evolucao.map((mes) => mes.custosTotais), color: chartColors.saida },
              ]}
              line={{ name: "Lucro", values: evolucao.map((mes) => mes.lucroLiquido), color: chartColors.resultado }}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-brand-oliva/20 text-left text-xs uppercase text-brand-oliva">
                    <th className="py-2 pr-3">Mês</th>
                    <th className="py-2 pr-3 text-right">Faturamento</th>
                    <th className="py-2 pr-3 text-right">Custos</th>
                    <th className="py-2 pr-3 text-right">Lucro líquido</th>
                    <th className="py-2 text-right">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {evolucao.map((mes) => (
                    <tr key={mes.monthKey} className={cn("border-b border-brand-oliva/10", mes.monthKey === monthKey && "bg-brand-creme/40")}>
                      <td className="py-2 pr-3 font-semibold text-brand-tinta">{monthKeyLabel(mes.monthKey)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{moneyFin(mes.faturamento)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{moneyFin(mes.custosTotais)}</td>
                      <td className={cn("py-2 pr-3 text-right font-bold tabular-nums", mes.lucroLiquido < 0 ? "text-red-700" : "text-brand-musgo")}>
                        {moneyFin(mes.lucroLiquido)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {mes.margem.toFixed(1).replace(".", ",")}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ---- 3. PDCA ---------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardCheck className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
              3. Análise do mês e plano de ação (PDCA)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {PDCA_CAMPOS.map((campo) => (
              <div key={campo.key}>
                <Label htmlFor={`pdca-${campo.key}`}>{campo.titulo}</Label>
                <textarea
                  id={`pdca-${campo.key}`}
                  rows={4}
                  readOnly={readOnly}
                  placeholder={campo.ajuda}
                  value={pdca[campo.key] ?? ""}
                  onChange={(event) => setPdca((atualState) => ({ ...atualState, [campo.key]: event.target.value }))}
                  onBlur={() => (readOnly ? undefined : salvar(false))}
                  className="mt-1 w-full rounded-md border border-brand-oliva/25 bg-white/80 px-3 py-2 text-sm text-brand-tinta"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ---- Ponte do lucro: mata a dúvida da CEO ----------------------- */}
        <Card className="border-brand-dourado/40 bg-brand-creme/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              <GitMerge className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
              Por que existem três números de lucro — e como um vira o outro
              <InfoTip title="Para explicar na reunião">
                Cada lente responde uma pergunta diferente. OPERACIONAL: a clínica se paga sozinha? CONTÁBIL: o que a
                contabilidade registra (soma o dinheiro que veio da poupança e abate a obra). CAIXA: o que sobrou no
                banco hoje. Nenhum está errado — a ponte abaixo mostra a passagem, linha por linha.
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {ponte.map((passo) => (
              <div
                key={passo.label}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2",
                  passo.tipo === "total"
                    ? "border-brand-musgo/40 bg-brand-musgo/8"
                    : passo.tipo === "base"
                      ? "border-brand-dourado/45 bg-white/70"
                      : "border-brand-oliva/14 bg-white/55",
                )}
              >
                <span className={cn("flex items-center gap-1.5 text-sm", passo.tipo === "base" || passo.tipo === "total" ? "font-bold text-brand-tinta" : "text-brand-tinta")}>
                  {passo.label}
                  <InfoTip title={passo.label}>{passo.explicacao}</InfoTip>
                </span>
                <span className={cn("text-sm font-bold tabular-nums", passo.valor < 0 ? "text-red-700" : "text-brand-musgo", passo.tipo === "total" && "text-lg")}>
                  {moneyFin(passo.valor)}
                </span>
              </div>
            ))}
            {lucroRealCaixa === null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Para ver também o lucro de caixa, digite o saldo do Itaú no card "Prova do dinheiro" da aba P12.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* ---- 4. Relatórios para a contabilidade ------------------------- */}
        <RelatoriosContabilidadeCard
          sales={financeiro.sales}
          expenses={financeiro.expenses}
          categories={financeiro.categories}
          savingsMoves={financeiro.savingsMoves}
          crediarioProfits={financeiro.crediarioProfits}
          monthKey={monthKey}
          mostrarSeletor={false}
        />

      </div>
    </AccessGate>
  );
}
