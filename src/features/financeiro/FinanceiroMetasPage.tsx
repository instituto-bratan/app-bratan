import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ClipboardCopy, FileDown, Target, Trophy } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canFinanceiroFull, canFinanceiroView } from "@/lib/access";
import { exportBrandedPdf } from "@/lib/brandedPdf";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { parseMoneyBR } from "@/lib/money";
import { loadRemoteFinMetasConfig, saveRemoteFinMetasConfig } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { moneyFin } from "./financeiroData";
import {
  buildMetaDoDiaMessage,
  buildMetasBoard,
  defaultMetasConfig,
  doctorAttendsOn,
  type MetasConfig,
} from "./metasData";
import { useFinanceiro } from "./useFinanceiro";

const metasStorageKey = "app-bratan-fin-metas-config-v1";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function FinanceiroMetasPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const canEdit = canFinanceiroFull(pessoa?.cargo);
  const [monthKey, setMonthKey] = useState(() => todayISO().slice(0, 7));
  const financeiro = useFinanceiro(Number(monthKey.slice(0, 4)));
  const [config, setConfig] = useState<MetasConfig>(() => ({
    ...defaultMetasConfig,
    ...readLocalValue<Partial<MetasConfig>>(metasStorageKey, {}),
  }));
  const [feedback, setFeedback] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  useQuery({
    queryKey: ["fin-metas-config"],
    queryFn: async () => {
      const remote = await loadRemoteFinMetasConfig();
      if (remote) {
        setConfig((current) => {
          const merged = { ...current, ...(remote as Partial<MetasConfig>) };
          writeLocalValue(metasStorageKey, merged);
          return merged;
        });
      }
      return remote ?? {};
    },
    enabled: useRemote,
  });
  const saveMutation = useMutation({
    mutationFn: (next: MetasConfig) => saveRemoteFinMetasConfig(next as unknown as Record<string, unknown>),
  });

  function persistConfig(next: MetasConfig) {
    setConfig(next);
    writeLocalValue(metasStorageKey, next);
    if (useRemote) {
      void saveMutation.mutateAsync(next).catch((error) => console.warn("Config de metas não sincronizou.", error));
    }
  }

  const board = useMemo(
    () => buildMetasBoard(financeiro.sales, config, monthKey),
    [financeiro.sales, config, monthKey],
  );
  const today = todayISO();
  const monthLabel = new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  function toggleDoctorDay(date: string) {
    if (!canEdit) return;
    const attends = doctorAttendsOn(date, config);
    const monthOverrides = { ...(config.doctorDayOverrides?.[monthKey] ?? {}), [date]: !attends };
    persistConfig({
      ...config,
      doctorDayOverrides: { ...(config.doctorDayOverrides ?? {}), [monthKey]: monthOverrides },
    });
  }

  async function copyMetaDoDia() {
    const message = buildMetaDoDiaMessage(board, config, today);
    try {
      await navigator.clipboard.writeText(message);
      setFeedback("Meta do dia copiada! Cole no WhatsApp da equipe.");
    } catch {
      setFeedback("Não consegui copiar automaticamente — selecione e copie manualmente.");
    }
  }

  function gerarResumoPdf() {
    const ok = exportBrandedPdf({
      title: `Controle de Metas — ${monthLabel}`,
      subtitle: "Metas, faturamento e pacientes derivados das comandas do APP BRATAN",
      author: pessoa?.nome,
      sections: [
        {
          heading: "Painel do mês",
          lines: [
            `Faturamento acumulado: ${moneyFin(board.accumulatedRevenue)}`,
            `Meta mínima (${moneyFin(config.goalMinRevenue)}): falta ${moneyFin(board.missingToMin)}`,
            `Meta (${moneyFin(config.goalTargetRevenue)}): falta ${moneyFin(board.missingToTarget)}`,
            `Super meta (${moneyFin(config.goalSuperRevenue)}): falta ${moneyFin(board.missingToSuper)} · ${percent(board.superGoalPercent)} atingido`,
            `Pacientes: ${board.accumulatedPatients} de ${config.goalPatients} · Ticket médio: ${moneyFin(board.avgTicket)}`,
            `Ticket médio para a super meta (${config.goalPatients} pacientes): ${moneyFin(board.avgTicketForSuper)}`,
            ``,
            `Status da meritocracia: ${board.meritocracyStatus}`,
          ],
        },
        {
          heading: "Resumo semanal",
          table: {
            headers: ["Semana", "Período", "Meta (R$)", "Realizado (R$)", "Dif. (R$)", "% Meta", "Pacientes"],
            rows: board.weeks.map((week) => [
              String(week.weekIndex),
              week.periodLabel,
              moneyFin(week.weeklyGoal),
              moneyFin(week.revenue),
              moneyFin(week.diff),
              percent(week.goalPercent),
              String(week.patients),
            ]),
          },
        },
        {
          heading: "Controle diário",
          table: {
            headers: ["Data", "Dia", "Dr. Daniel", "Meta do dia", "Faturamento", "Dif.", "% Meta", "Acumulado", "Pac.", "Ticket acum."],
            rows: board.days.map((day) => [
              day.date.split("-").reverse().slice(0, 2).join("/"),
              day.weekday,
              day.withDoctor ? "Sim" : "Não",
              moneyFin(day.dailyGoal),
              day.revenue ? moneyFin(day.revenue) : "—",
              day.revenue ? moneyFin(day.diff) : "—",
              day.revenue ? percent(day.goalPercent) : "—",
              moneyFin(day.accumulatedRevenue),
              String(day.patients || "—"),
              day.accumulatedAvgTicket ? moneyFin(day.accumulatedAvgTicket) : "—",
            ]),
          },
        },
      ],
    });
    setFeedback(ok ? "Resumo aberto para salvar em PDF." : "O navegador bloqueou a janela — libere pop-ups para gerar o PDF.");
  }

  const configField = (label: string, key: keyof MetasConfig) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        defaultValue={String(config[key])}
        inputMode="decimal"
        disabled={!canEdit}
        onBlur={(event) => {
          const parsed = key === "goalPatients" ? Number(event.target.value) : parseMoneyBR(event.target.value);
          if (Number.isFinite(parsed) && parsed > 0) persistConfig({ ...config, [key]: parsed });
        }}
      />
    </div>
  );

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Metas do mês">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Financeiro 360</Badge>
                <Badge variant="muted">{financeiro.syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Metas do mês
                <InfoTip title="O Controle de Metas da CEO">
                  O mesmo controle da planilha, sem digitar nada: a meta do dia muda conforme o Dr. Daniel atende, e o
                  faturamento e os pacientes vêm direto das comandas do Lançar Dia. Marque os dias sem Dr. Daniel e o resto
                  se calcula sozinho.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{board.meritocracyStatus}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="month"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value || todayISO().slice(0, 7))}
                className="w-44"
                aria-label="Mês do controle"
              />
              <Button type="button" variant="outline" size="sm" onClick={copyMetaDoDia}>
                <ClipboardCopy className="mr-1 h-4 w-4" aria-hidden="true" /> Copiar meta do dia
              </Button>
              <LiquidButton type="button" size="sm" onClick={gerarResumoPdf}>
                <FileDown className="h-4 w-4" aria-hidden="true" /> Gerar resumo (PDF)
              </LiquidButton>
            </div>
          </div>
        </motion.section>

        {feedback ? (
          <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            {feedback}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Acumulado no mês", value: moneyFin(board.accumulatedRevenue), hint: `${percent(board.superGoalPercent)} da super meta` },
            { label: `Meta mínima ${moneyFin(config.goalMinRevenue)}`, value: board.missingToMin ? `falta ${moneyFin(board.missingToMin)}` : "batida ✓", hint: "primeiro degrau" },
            { label: `Meta ${moneyFin(config.goalTargetRevenue)}`, value: board.missingToTarget ? `falta ${moneyFin(board.missingToTarget)}` : "batida ✓", hint: "meta cheia" },
            { label: `Super meta ${moneyFin(config.goalSuperRevenue)}`, value: board.missingToSuper ? `falta ${moneyFin(board.missingToSuper)}` : "batida ✓", hint: "meritocracia" },
          ].map((cardInfo) => (
            <Card key={cardInfo.label} className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{cardInfo.label}</p>
                <p className="mt-1 text-xl font-bold text-brand-tinta">{cardInfo.value}</p>
                <p className="text-xs text-muted-foreground">{cardInfo.hint}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Pacientes no mês", value: `${board.accumulatedPatients} / ${config.goalPatients}` },
            { label: "Ticket médio atual", value: moneyFin(board.avgTicket) },
            { label: "Ticket p/ super meta", value: moneyFin(board.avgTicketForSuper) },
          ].map((cardInfo) => (
            <Card key={cardInfo.label} className="border-brand-musgo/20 bg-[#f2f5ec] shadow-none">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">{cardInfo.label}</p>
                <p className="mt-1 text-xl font-bold text-brand-musgo">{cardInfo.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-brand-dourado" aria-hidden="true" />
              Resumo semanal
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">
                  <th className="py-2 pr-3">Semana</th>
                  <th className="py-2 pr-3">Período</th>
                  <th className="py-2 pr-3">Meta</th>
                  <th className="py-2 pr-3">Realizado</th>
                  <th className="py-2 pr-3">Dif.</th>
                  <th className="py-2 pr-3">% Meta</th>
                  <th className="py-2">Pacientes</th>
                </tr>
              </thead>
              <tbody>
                {board.weeks.map((week) => (
                  <tr key={week.weekIndex} className="border-t border-brand-oliva/10">
                    <td className="py-2 pr-3 font-semibold text-brand-tinta">{week.weekIndex}</td>
                    <td className="py-2 pr-3">{week.periodLabel}</td>
                    <td className="py-2 pr-3">{moneyFin(week.weeklyGoal)}</td>
                    <td className="py-2 pr-3 font-semibold text-brand-musgo">{week.revenue ? moneyFin(week.revenue) : "—"}</td>
                    <td className={cn("py-2 pr-3", week.diff < 0 ? "text-destructive" : "text-brand-musgo")}>
                      {week.revenue ? moneyFin(week.diff) : "—"}
                    </td>
                    <td className="py-2 pr-3">{week.revenue ? percent(week.goalPercent) : "—"}</td>
                    <td className="py-2">{week.patients || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
                Controle diário
              </CardTitle>
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <p className="text-xs text-muted-foreground">
                    Sextas já vêm como "Não" (Dr. Daniel não atende). Clique em Sim/Não para ajustar qualquer dia.
                  </p>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowConfig((value) => !value)}>
                  {showConfig ? "Fechar valores das metas" : "Valores das metas"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {showConfig ? (
              <div className="mb-4 grid gap-3 rounded-lg border border-brand-dourado/30 bg-brand-creme/40 p-4 sm:grid-cols-3">
                {configField("Meta mínima (R$)", "goalMinRevenue")}
                {configField("Meta (R$)", "goalTargetRevenue")}
                {configField("Super meta (R$)", "goalSuperRevenue")}
                {configField("Meta de pacientes", "goalPatients")}
                {configField("Meta diária com Dr. Daniel (R$)", "dailyGoalWithDoctor")}
                {configField("Meta diária sem Dr. Daniel (R$)", "dailyGoalWithoutDoctor")}
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-brand-oliva">
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Dia</th>
                    <th className="py-2 pr-3">Dr. Daniel</th>
                    <th className="py-2 pr-3">Meta do dia</th>
                    <th className="py-2 pr-3">Faturamento</th>
                    <th className="py-2 pr-3">Dif.</th>
                    <th className="py-2 pr-3">% Meta</th>
                    <th className="py-2 pr-3">Acumulado</th>
                    <th className="py-2 pr-3">Pac.</th>
                    <th className="py-2">Ticket acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {board.days.map((day) => (
                    <tr
                      key={day.date}
                      className={cn(
                        "border-t border-brand-oliva/10",
                        day.date === today && "bg-brand-creme/50 font-semibold",
                      )}
                    >
                      <td className="py-2 pr-3">{day.date.split("-").reverse().slice(0, 2).join("/")}</td>
                      <td className="py-2 pr-3">{day.weekday}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleDoctorDay(day.date)}
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                            day.withDoctor ? "bg-brand-musgo text-brand-papel" : "bg-brand-creme text-brand-oliva",
                            canEdit && "hover:opacity-80",
                          )}
                          aria-label={`Dr. Daniel ${day.withDoctor ? "atende" : "não atende"} em ${day.date}`}
                        >
                          {day.withDoctor ? "Sim" : "Não"}
                        </button>
                      </td>
                      <td className="py-2 pr-3">{moneyFin(day.dailyGoal)}</td>
                      <td className="py-2 pr-3 font-semibold text-brand-musgo">{day.revenue ? moneyFin(day.revenue) : "—"}</td>
                      <td className={cn("py-2 pr-3", day.diff < 0 ? "text-destructive" : "text-brand-musgo")}>
                        {day.revenue ? moneyFin(day.diff) : "—"}
                      </td>
                      <td className="py-2 pr-3">{day.revenue ? percent(day.goalPercent) : "—"}</td>
                      <td className="py-2 pr-3">{moneyFin(day.accumulatedRevenue)}</td>
                      <td className="py-2 pr-3">{day.patients || "—"}</td>
                      <td className="py-2">{day.accumulatedAvgTicket ? moneyFin(day.accumulatedAvgTicket) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}

export default FinanceiroMetasPage;
