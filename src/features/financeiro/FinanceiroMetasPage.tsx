// METAS DO MÊS — o Controle de Metas da CEO, sem digitar nada.
//
// REDESENHO (08/10/2026, Papel & Musgo, etapa 4 — Resultados › Metas & PDCA):
// um cabeçalho só, com o mês dito em frase (quanto entrou, quanto falta e por
// dia) e o fio do mês embaixo; as abas Metas · PDCA logo abaixo (a casca as
// entrega). À esquerda, para ler: a reunião de líderes (a régua da CEO, semana a
// semana) e o resumo semanal; à direita, no saber, o mês até agora com os três
// degraus da meta e a meritocracia. Embaixo, na folha (é onde se decide), o
// controle diário com o Sim/Não do Dr. Daniel e os valores das metas. Mesmos
// dados, mesmos botões, mesmas permissões e a mesma URL.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/avisos";
import { ClipboardCopy, FileDown, SlidersHorizontal } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, FioDoMes } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
import { useAuth } from "@/hooks/useAuth";
import { canEditModule, canFinanceiroView } from "@/lib/access";
import { exportBrandedPdf } from "@/lib/brandedPdf";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { parseMoneyBR } from "@/lib/money";
import { loadRemoteFinMetasConfig, saveRemoteFinMetasConfig } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { crediarioProfitOfMonth, moneyFin } from "./financeiroData";
import { ResumoMesCard } from "./ResumoMesCard";
import {
  NIVEL_META_LABELS,
  buildMetaDoDiaMessage,
  buildMetasBoard,
  buildPainelReuniao,
  defaultMetasConfig,
  metasForMonth,
  doctorAttendsOn,
  type MetasConfig,
  type MetasMonthGoals,
} from "./metasData";
import { useFinanceiro } from "./useFinanceiro";
import { Campo, OrigemDosDados, Razao, classeDoCampo, classeDoCampoNumero } from "./pecasBancoFechamento";
import { AvisoDaTela, Etiqueta } from "./pecasDiaPagar";
import { diasUteisDoMes } from "./lucroInteligente";
import { NumeroDoIndicador, RUBRICA_RESULTADOS, ReguaDosDegraus, TABELA, TituloDeBloco, mesDaTela } from "./pecasMetasPdca";

const metasStorageKey = "app-bratan-fin-metas-config-v1";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** "08/10" a partir de "2026-10-08". */
function diaMes(iso: string) {
  return iso.split("-").reverse().slice(0, 2).join("/");
}

export function FinanceiroMetasPage() {
  const { pessoa, session, isPreview } = useAuth();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const canEdit = canEditModule(pessoa, "fin-metas");
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
  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: (next: MetasConfig) => saveRemoteFinMetasConfig(next as unknown as Record<string, unknown>),
    // Painel, P12 e Lucro leem do servidor (29/09/2026): salvou, todos veem.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["fin-metas-config"] }),
  });

  function persistConfig(next: MetasConfig) {
    setConfig(next);
    writeLocalValue(metasStorageKey, next);
    if (useRemote) {
      void saveMutation.mutateAsync(next).catch((error) => {
        console.warn("Config de metas não sincronizou.", error);
        toast(`As metas NÃO foram salvas no servidor (${(error as Error)?.message ?? "erro"}). Só este aparelho vê a mudança — tente de novo.`, { tom: "erro", duracaoMs: 9000 });
      });
    }
  }

  const board = useMemo(
    () => buildMetasBoard(financeiro.sales, config, monthKey, crediarioProfitOfMonth(financeiro.crediarioProfits, monthKey)),
    [financeiro.sales, config, monthKey, financeiro.crediarioProfits],
  );
  const today = todayISO();
  // Painel da REUNIÃO DE LÍDERES (segunda-feira). A CEO pediu: "quanto nós já
  // fizemos, primeira semana, segunda semana, quanto que tá a nossa meta — e
  // nós vamos trabalhar com SUPERMETA. Só a supermeta eu quero saber."
  const painel = useMemo(() => buildPainelReuniao(board, today), [board, today]);
  // A tela mostra as metas DO MÊS escolhido (a régua muda de mês em mês), não as
  // do padrão — senão julho apareceria com a régua de agosto.
  const metasDoMes = useMemo(() => metasForMonth(config, monthKey), [config, monthKey]);
  const monthLabel = new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  // O nome do mês nas frases ("Outubro"; com o ano quando é de outro ano).
  const nomeDoMes = mesDaTela(monthKey, today);
  const ehMesAtual = monthKey === today.slice(0, 7);
  // O fio do mês (só no mês de hoje: num mês passado "hoje é o dia útil 22 de 22" enganaria).
  const diaUtilDeHoje = board.days.filter((day) => day.date <= today).length;
  // 13/10/2026 (revisão da etapa 4): o FIO do mês e o "dia útil N de M" usam o
  // calendário com feriado (o mesmo do Lucro e do Início). A conta da meta
  // (board, painel) continua seg a sex, como era — só a marcação muda.
  const fioDiasUteis = useMemo(() => diasUteisDoMes(monthKey), [monthKey]);
  const fioDiaDeHoje = fioDiasUteis.filter((dia) => dia <= today).length;
  const metaContaFeriado = fioDiasUteis.length !== board.days.length;
  // A semana de hoje ganha o fio de ouro na tabela da reunião (o ouro marca o agora).
  const semanaDeHoje = ehMesAtual ? board.days.find((day) => day.date >= today)?.weekIndex ?? null : null;
  const inicioDaSemana = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const day of board.days) if (!mapa.has(day.weekIndex)) mapa.set(day.weekIndex, day.date);
    return mapa;
  }, [board.days]);

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
            `${NIVEL_META_LABELS.min} (${moneyFin(metasDoMes.goalMinRevenue)}): falta ${moneyFin(board.missingToMin)}`,
            `Meta (${moneyFin(metasDoMes.goalTargetRevenue)}): falta ${moneyFin(board.missingToTarget)}`,
            `Super meta (${moneyFin(metasDoMes.goalSuperRevenue)}): falta ${moneyFin(board.missingToSuper)} · ${percent(board.superGoalPercent)} atingido`,
            `Pacientes: ${board.accumulatedPatients} de ${metasDoMes.goalPatients} · Ticket médio: ${moneyFin(board.avgTicket)}`,
            `Ticket médio para a super meta (${metasDoMes.goalPatients} pacientes): ${moneyFin(board.avgTicketForSuper)}`,
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

  // Editar aqui muda as metas DESTE mês (guardadas em monthlyGoals), preservando
  // o histórico dos meses anteriores.
  const configField = (label: string, key: keyof MetasMonthGoals & keyof MetasConfig) => (
    <Campo rotulo={label}>
      <input
        key={`${monthKey}-${key}`}
        defaultValue={String(metasDoMes[key])}
        inputMode="decimal"
        disabled={!canEdit}
        className={classeDoCampoNumero}
        onBlur={(event) => {
          const parsed = key === "goalPatients" ? Number(event.target.value) : parseMoneyBR(event.target.value);
          if (!Number.isFinite(parsed) || parsed <= 0) return;
          persistConfig({
            ...config,
            monthlyGoals: {
              ...(config.monthlyGoals ?? {}),
              [monthKey]: { ...(config.monthlyGoals?.[monthKey] ?? {}), [key]: parsed },
            },
          });
        }}
      />
    </Campo>
  );

  // Os três degraus do mês (as meritocracias combinadas na apresentação de agosto/2026).
  const degraus = [
    {
      nome: NIVEL_META_LABELS.min,
      rotulo: `${NIVEL_META_LABELS.min} ${moneyFin(metasDoMes.goalMinRevenue)}`,
      valor: metasDoMes.goalMinRevenue,
      falta: board.missingToMin,
      dica: "abaixo dela as meritocracias zeram",
    },
    {
      nome: "Meta",
      rotulo: `Meta ${moneyFin(metasDoMes.goalTargetRevenue)}`,
      valor: metasDoMes.goalTargetRevenue,
      falta: board.missingToTarget,
      dica: "meritocracia individual + café da manhã",
    },
    {
      nome: "Super meta",
      rotulo: `Super meta ${moneyFin(metasDoMes.goalSuperRevenue)}`,
      valor: metasDoMes.goalSuperRevenue,
      falta: board.missingToSuper,
      dica:
        board.meritocracyBonusPerPerson > 0
          ? `jantar + ${moneyFin(board.meritocracyBonusPerPerson)} por pessoa`
          : "jantar + R$ 200 cada (+200 a cada 10 mil)",
    },
  ];

  return (
    <AccessGate allowed={canFinanceiroView} label="Financeiro · Metas do mês" module="fin-metas">
      <div className="mx-auto grid w-full max-w-[1320px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Resultados · Metas & PDCA"
          titulo={
            <>
              Metas do mês{" "}
              <InfoTip title="O Controle de Metas da CEO" className="align-middle">
                O mesmo controle da planilha, sem digitar nada: a meta do dia muda conforme o Dr. Daniel atende, e o
                faturamento e os pacientes vêm direto das comandas do Lançar Dia. Marque os dias sem Dr. Daniel e o resto
                se calcula sozinho.
              </InfoTip>
            </>
          }
          frase={
            <>
              <strong className="tabular-nums">{moneyFin(board.accumulatedRevenue)}</strong> faturados em {nomeDoMes.toLowerCase()}. {painel.leitura}
            </>
          }
          acoes={
            <>
              <Campo rotulo="Mês" className="w-44">
                <input
                  type="month"
                  value={monthKey}
                  onChange={(event) => setMonthKey(event.target.value)}
                  onBlur={() => {
                    if (!monthKey) setMonthKey(todayISO().slice(0, 7));
                  }}
                  className={classeDoCampo}
                  aria-label="Mês do controle"
                />
              </Campo>
              <Botao variante="secundario" icone={<ClipboardCopy className="h-4 w-4" aria-hidden="true" />} onClick={copyMetaDoDia}>
                Copiar meta do dia
              </Botao>
              <Botao variante="secundario" icone={<FileDown className="h-4 w-4" aria-hidden="true" />} onClick={gerarResumoPdf}>
                Gerar resumo (PDF)
              </Botao>
            </>
          }
          rodape={
            ehMesAtual && board.days.length ? (
              <div className="grid gap-2">
                {/* A legenda é desta tela: a conta da reunião conta HOJE entre os dias que faltam
                    (o dia ainda não acabou), então a frase diz isso em vez do "faltam N" do fio. */}
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] font-medium leading-5 text-tinta-2">
                  <strong className="font-bold text-tinta">{nomeDoMes}</strong>
                  <span>
                    hoje é o dia útil {fioDiaDeHoje} de {fioDiasUteis.length}
                  </span>
                  <span className="ml-auto">
                    {painel.diasUteisRestantes === 1 ? "só hoje resta" : `${painel.diasUteisRestantes} dias úteis contando hoje`}
                    {metaContaFeriado ? " na conta da meta (seg a sex, feriado conta)" : ""}
                  </span>
                </p>
                <FioDoMes diasUteis={fioDiasUteis.length} hoje={fioDiaDeHoje} mes={nomeDoMes} legenda={false} sobre="papel" />
              </div>
            ) : undefined
          }
        />

        {feedback ? <AvisoDaTela tom="info">{feedback}</AvisoDaTela> : null}

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] max-md:gap-6">
          <div className="grid min-w-0 gap-8 max-md:gap-6">
            {/* REUNIÃO DE LÍDERES — segunda-feira (reunião de 14/08/2026 com a CEO). Para ler: saber. */}
            <BlocoSaber as="section" aria-labelledby="metas-reuniao" className="grid gap-5">
              <TituloDeBloco
                id="metas-reuniao"
                titulo={
                  <span>
                    Reunião de líderes — a régua é a {NIVEL_META_LABELS.target}{" "}
                    <InfoTip title="Por que a supermeta" className="align-middle">
                      Decisão da CEO na reunião de 14/08: "só a supermeta eu quero saber. O resto é medíocre — se a gente fizer,
                      amém, mas não é isso que a gente vai buscar." Acima dela existe a super-supermeta, onde a porcentagem da
                      equipe aumenta.
                    </InfoTip>
                  </span>
                }
                soma={
                  <Etiqueta tom={painel.nivel === "ABAIXO" ? "neutro" : painel.nivel === "META" ? "musgo" : "ok"}>
                    {painel.percentualDaSupermeta.toFixed(1).replace(".", ",")}%
                  </Etiqueta>
                }
                ajuda="Semana a semana: quanto entrou contra o ritmo que leva à régua no fim do mês (semana curta é cobrada pelos dias úteis dela)."
              />
              <dl className="grid gap-2 border-y border-fio-2 py-4 sm:grid-cols-3 sm:gap-4">
                {[
                  { rotulo: "Faturado no mês", valor: moneyFin(painel.faturado) },
                  { rotulo: NIVEL_META_LABELS.target, valor: moneyFin(painel.supermeta) },
                  { rotulo: NIVEL_META_LABELS.super, valor: moneyFin(painel.superSupermeta) },
                ].map((item) => (
                  <div key={item.rotulo} className="flex min-w-0 items-baseline justify-between gap-3 sm:block">
                    <dt className={RUBRICA_RESULTADOS}>{item.rotulo}</dt>
                    <dd className="m-0 whitespace-nowrap text-base font-bold leading-7 tabular-nums text-tinta sm:mt-1 sm:text-xl">{item.valor}</dd>
                  </div>
                ))}
              </dl>
              <div className={TABELA.rolagem}>
                <table className={cn(TABELA.tabela, "min-w-[34rem]")}>
                  <thead>
                    <tr>
                      <th className={TABELA.th}>Semana</th>
                      <th className={TABELA.th}>Período</th>
                      <th className={TABELA.thNum}>Faturado</th>
                      <th className={TABELA.thNum}>Ritmo da supermeta</th>
                      <th className={TABELA.thNum}>Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {painel.semanas.map((semana) => {
                      const agora = semana.semana === semanaDeHoje;
                      // Semana que ainda não começou não está "abaixo": só não aconteceu.
                      const futura = (inicioDaSemana.get(semana.semana) ?? "") > today;
                      return (
                        <tr key={semana.semana} className={cn(agora && "shadow-[inset_3px_0_0_rgb(var(--ouro-fio-rgb))]")}>
                          <td className={cn(TABELA.td, "font-bold", agora && "pl-3 first:pl-3")}>
                            {semana.semana}ª{agora ? <span className="ml-2 text-xs font-bold text-ouro">agora</span> : null}
                          </td>
                          <td className={cn(TABELA.td, "whitespace-nowrap text-[13px] tabular-nums text-tinta-2")}>{semana.periodo}</td>
                          <td className={cn(TABELA.tdNum, "font-bold")}>{moneyFin(semana.faturado)}</td>
                          <td className={cn(TABELA.tdNum, "text-tinta-2")}>{moneyFin(semana.ritmoNecessario)}</td>
                          <td className={cn(TABELA.tdNum, "font-bold", futura ? "text-tinta-2" : semana.noRitmo ? "text-ok" : "text-atencao")}>
                            {semana.diferenca > 0 ? "+" : ""}
                            {moneyFin(semana.diferenca)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </BlocoSaber>

            <BlocoSaber as="section" aria-labelledby="metas-semanal" className="grid gap-4">
              <TituloDeBloco id="metas-semanal" titulo="Resumo semanal" ajuda="A meta de cada semana é a soma das metas dos dias úteis dela." />
              <div className={TABELA.rolagem}>
                <table className={cn(TABELA.tabela, "min-w-[560px]")}>
                  <thead>
                    <tr>
                      <th className={TABELA.th}>Semana</th>
                      <th className={TABELA.th}>Período</th>
                      <th className={TABELA.thNum}>Meta</th>
                      <th className={TABELA.thNum}>Realizado</th>
                      <th className={TABELA.thNum}>Dif.</th>
                      <th className={TABELA.thNum}>% Meta</th>
                      <th className={TABELA.thNum}>Pacientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.weeks.map((week) => (
                      <tr key={week.weekIndex}>
                        <td className={cn(TABELA.td, "font-bold")}>{week.weekIndex}</td>
                        <td className={cn(TABELA.td, "whitespace-nowrap text-[13px] tabular-nums text-tinta-2")}>{week.periodLabel}</td>
                        <td className={TABELA.tdNum}>{moneyFin(week.weeklyGoal)}</td>
                        <td className={cn(TABELA.tdNum, "font-bold")}>{week.revenue ? moneyFin(week.revenue) : "—"}</td>
                        <td className={cn(TABELA.tdNum, week.revenue ? (week.diff < 0 ? "font-bold text-atencao" : "font-bold text-ok") : "text-tinta-2")}>
                          {week.revenue ? moneyFin(week.diff) : "—"}
                        </td>
                        <td className={TABELA.tdNum}>{week.revenue ? percent(week.goalPercent) : "—"}</td>
                        <td className={TABELA.tdNum}>{week.patients || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlocoSaber>
          </div>

          {/* SABER — o mês até agora: o faturado, os três degraus e a meritocracia. */}
          <BlocoSaber as="aside" aria-labelledby="metas-mes" className="grid content-start gap-4 max-xl:order-first">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="metas-mes" className={RUBRICA_RESULTADOS}>
                {nomeDoMes} até agora
              </h2>
              {ehMesAtual && board.days.length ? (
                <span className="whitespace-nowrap text-[13px] font-medium leading-5 text-tinta-2">
                  dia útil {fioDiaDeHoje} de {fioDiasUteis.length}
                </span>
              ) : null}
            </div>
            <div className="grid gap-1">
              <NumeroDoIndicador tamanho="grande">{moneyFin(board.accumulatedRevenue)}</NumeroDoIndicador>
              <p className="text-[13px] font-medium leading-5 text-tinta-2">
                acumulado no mês · <strong className="font-bold tabular-nums text-tinta">{percent(board.superGoalPercent)}</strong> da super meta
              </p>
            </div>
            <ReguaDosDegraus
              faturado={board.accumulatedRevenue}
              degraus={degraus.map((degrau) => ({ rotulo: degrau.rotulo, valor: degrau.valor }))}
              descricao={`Acumulado ${moneyFin(board.accumulatedRevenue)}; ${degraus.map((degrau) => `${degrau.rotulo}${degrau.falta ? `, falta ${moneyFin(degrau.falta)}` : ", batida"}`).join("; ")}`}
            />
            <Razao
              linhas={degraus.map((degrau) => ({
                rotulo: (
                  <span className="font-semibold text-tinta">
                    {degrau.nome} <span className="whitespace-nowrap tabular-nums">{moneyFin(degrau.valor)}</span>
                  </span>
                ),
                detalhe: degrau.dica,
                valor: degrau.falta ? `falta ${moneyFin(degrau.falta)}` : "batida",
                tom: degrau.falta ? undefined : "ok",
                valorMenor: true,
              }))}
            />
            <p className="text-sm font-semibold leading-[22px] text-tinta">{board.meritocracyStatus}</p>
            <Razao
              linhas={[
                { rotulo: "Pacientes no mês", valor: `${board.accumulatedPatients} de ${metasDoMes.goalPatients}`, valorMenor: true },
                { rotulo: "Ticket médio atual", valor: moneyFin(board.avgTicket), valorMenor: true },
                { rotulo: "Ticket p/ super meta", valor: moneyFin(board.avgTicketForSuper), valorMenor: true },
              ]}
            />
            <OrigemDosDados modo={financeiro.syncMode} />
          </BlocoSaber>
        </div>

        <ResumoMesCard
          crediarioProfits={financeiro.crediarioProfits}
          sales={financeiro.sales}
          expenses={financeiro.expensesPorCategoria}
          categories={financeiro.categories}
          savingsMoves={financeiro.savingsMoves}
          metas={config}
          monthKey={monthKey}
        />

        {/* DECIDIR — o controle diário: o Sim/Não do Dr. Daniel e os valores das metas (folha). */}
        <BlocoFolha as="section" aria-labelledby="metas-diario" className="overflow-hidden">
          <div className="border-b border-fio px-6 py-4 max-md:px-4">
            <TituloDeBloco
              id="metas-diario"
              titulo="Controle diário"
              ajuda={canEdit ? 'Sextas já vêm como "Não" (Dr. Daniel não atende). Clique em Sim/Não para ajustar qualquer dia.' : undefined}
              acoes={
                <Botao
                  variante={showConfig ? "secundario" : "fantasma"}
                  tamanho="pq"
                  icone={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
                  aria-expanded={showConfig}
                  onClick={() => setShowConfig((value) => !value)}
                >
                  {showConfig ? "Fechar valores das metas" : "Valores das metas"}
                </Botao>
              }
            />
          </div>
          {showConfig ? (
            <div className="grid gap-4 border-b border-fio bg-saber px-6 py-5 sm:grid-cols-2 lg:grid-cols-3 max-md:px-4">
              {configField(`${NIVEL_META_LABELS.min} (R$)`, "goalMinRevenue")}
              {configField("Meta (R$)", "goalTargetRevenue")}
              {configField("Super meta (R$)", "goalSuperRevenue")}
              {configField("Meta de pacientes", "goalPatients")}
              {configField("Meta diária com Dr. Daniel (R$)", "dailyGoalWithDoctor")}
              {configField("Meta diária sem Dr. Daniel (R$)", "dailyGoalWithoutDoctor")}
            </div>
          ) : null}
          <div className="mobile-scrollbar-none overflow-x-auto px-6 pb-2 max-md:px-4">
            <table className={cn(TABELA.tabela, "min-w-[860px]")}>
              <thead>
                <tr>
                  <th className={TABELA.th}>Data</th>
                  <th className={TABELA.th}>Dia</th>
                  <th className={TABELA.th}>Dr. Daniel</th>
                  <th className={TABELA.thNum}>Meta do dia</th>
                  <th className={TABELA.thNum}>Faturamento</th>
                  <th className={TABELA.thNum}>Dif.</th>
                  <th className={TABELA.thNum}>% Meta</th>
                  <th className={TABELA.thNum}>Acumulado</th>
                  <th className={TABELA.thNum}>Pac.</th>
                  <th className={TABELA.thNum}>Ticket acum.</th>
                </tr>
              </thead>
              <tbody>
                {board.days.map((day) => {
                  const ehHoje = day.date === today;
                  return (
                    <tr key={day.date} className={cn(ehHoje && "bg-ouro-claro font-bold")} aria-current={ehHoje ? "date" : undefined}>
                      <td className={cn(TABELA.td, "whitespace-nowrap tabular-nums", ehHoje && "pl-2 first:pl-2 shadow-[inset_3px_0_0_rgb(var(--ouro-fio-rgb))]")}>
                        {diaMes(day.date)}
                        {ehHoje ? <span className="ml-2 text-xs font-bold text-ouro">hoje</span> : null}
                      </td>
                      <td className={cn(TABELA.td, "text-tinta-2")}>{day.weekday}</td>
                      <td className={TABELA.td}>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => toggleDoctorDay(day.date)}
                          className={cn(
                            "inline-flex h-7 min-w-12 items-center justify-center rounded-controle px-2.5 text-xs font-bold leading-none transition-colors duration-150 ease-papel",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
                            "disabled:cursor-not-allowed",
                            day.withDoctor ? "bg-musgo-claro text-musgo" : "bg-folha text-tinta-2 shadow-[inset_0_0_0_1px_rgb(var(--fio-2-rgb))]",
                            canEdit && (day.withDoctor ? "hover:bg-musgo-claro-2" : "hover:text-tinta"),
                          )}
                          aria-label={`Dr. Daniel ${day.withDoctor ? "atende" : "não atende"} em ${day.date}`}
                        >
                          {day.withDoctor ? "Sim" : "Não"}
                        </button>
                      </td>
                      <td className={TABELA.tdNum}>{moneyFin(day.dailyGoal)}</td>
                      <td className={cn(TABELA.tdNum, "font-bold")}>{day.revenue ? moneyFin(day.revenue) : "—"}</td>
                      <td className={cn(TABELA.tdNum, day.revenue ? (day.diff < 0 ? "font-bold text-atencao" : "font-bold text-ok") : "text-tinta-2")}>
                        {day.revenue ? moneyFin(day.diff) : "—"}
                      </td>
                      <td className={TABELA.tdNum}>{day.revenue ? percent(day.goalPercent) : "—"}</td>
                      <td className={TABELA.tdNum}>{moneyFin(day.accumulatedRevenue)}</td>
                      <td className={TABELA.tdNum}>{day.patients || "—"}</td>
                      <td className={TABELA.tdNum}>{day.accumulatedAvgTicket ? moneyFin(day.accumulatedAvgTicket) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BlocoFolha>
      </div>
    </AccessGate>
  );
}

export default FinanceiroMetasPage;
