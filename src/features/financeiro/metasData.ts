// Controle de Metas do Instituto (modelo da CEO, planilha de julho/2026):
// meta do dia depende de o Dr. Daniel atender; faturamento e pacientes vêm
// das comandas (fin_sales) — nada é digitado duas vezes.

import { saleTotal, type FinSale } from "./financeiroData";

export type MetasConfig = {
  goalMinRevenue: number;
  goalTargetRevenue: number;
  goalSuperRevenue: number;
  goalPatients: number;
  dailyGoalWithDoctor: number;
  dailyGoalWithoutDoctor: number;
  // Dias em que o Dr. Daniel NÃO atende, por mês ("YYYY-MM" → ["YYYY-MM-DD", ...]).
  // Campo legado — prefira doctorDayOverrides.
  doctorOffDays: Record<string, string[]>;
  // Ajustes explícitos por dia ("YYYY-MM" → { "YYYY-MM-DD": atende? }).
  // Padrão sem ajuste: Dr. Daniel atende seg–qui e NÃO atende às sextas.
  doctorDayOverrides?: Record<string, Record<string, boolean>>;
  /**
   * Metas POR MÊS (03/08/2026). A régua sobe de mês em mês ("agosto: subimos a
   * régua"), e o histórico não pode ser reescrito: cada mês guarda as metas que
   * valeram nele. O que não estiver aqui cai no padrão acima.
   */
  monthlyGoals?: Record<string, MetasMonthGoals>;
};

/** Metas de um mês específico — tudo opcional, o que faltar herda o padrão. */
export type MetasMonthGoals = {
  goalMinRevenue?: number;
  goalTargetRevenue?: number;
  goalSuperRevenue?: number;
  goalPatients?: number;
  dailyGoalWithDoctor?: number;
  dailyGoalWithoutDoctor?: number;
  /** Nome que a CEO deu ao nível intermediário (ex.: "meta medíocre"). */
  targetLabel?: string;
  /** Base conservadora de pacientes (ex.: 80% dos previstos). */
  patientsConservative?: number;
};

/** Resolve as metas que valem num mês (metas do mês > padrão). */
export function metasForMonth(config: MetasConfig, monthKey: string): MetasConfig {
  const doMes = config.monthlyGoals?.[monthKey];
  if (!doMes) return config;
  return {
    ...config,
    goalMinRevenue: doMes.goalMinRevenue ?? config.goalMinRevenue,
    goalTargetRevenue: doMes.goalTargetRevenue ?? config.goalTargetRevenue,
    goalSuperRevenue: doMes.goalSuperRevenue ?? config.goalSuperRevenue,
    goalPatients: doMes.goalPatients ?? config.goalPatients,
    dailyGoalWithDoctor: doMes.dailyGoalWithDoctor ?? config.dailyGoalWithDoctor,
    dailyGoalWithoutDoctor: doMes.dailyGoalWithoutDoctor ?? config.dailyGoalWithoutDoctor,
  };
}

// Padrão = a régua VIGENTE (agosto/2026: "subimos a régua"). Meses antigos ficam
// registrados em monthlyGoals para o histórico não mentir.
export const defaultMetasConfig: MetasConfig = {
  goalMinRevenue: 330000,
  goalTargetRevenue: 370000,
  goalSuperRevenue: 400000,
  goalPatients: 68,
  dailyGoalWithDoctor: 23188.41,
  dailyGoalWithoutDoctor: 5797.1,
  doctorOffDays: {},
  // 31/08 é segunda-feira, mas é dia só de medicação (sem Dr. Daniel).
  doctorDayOverrides: { "2026-08": { "2026-08-31": false } },
  monthlyGoals: {
    // Julho/2026 — régua anterior (planilha "Controle de Metas Julho 2026").
    "2026-07": {
      goalMinRevenue: 300000,
      goalTargetRevenue: 330000,
      goalSuperRevenue: 350000,
      goalPatients: 45,
      dailyGoalWithDoctor: 17948.72,
      dailyGoalWithoutDoctor: 8974.36,
    },
    // Agosto/2026 — planilha "Controle de Metas Agosto 2026" + apresentação da CEO:
    // 16 dias com Dr. Daniel × 23.188,41 + 5 dias de medicação × 5.797,10 = 400 mil.
    "2026-08": {
      goalMinRevenue: 330000,
      goalTargetRevenue: 370000,
      goalSuperRevenue: 400000,
      goalPatients: 68,
      dailyGoalWithDoctor: 23188.41,
      dailyGoalWithoutDoctor: 5797.1,
      targetLabel: "meta medíocre",
      patientsConservative: 54,
    },
  },
};

export type MetasDay = {
  date: string;
  weekday: string;
  weekIndex: number;
  withDoctor: boolean;
  dailyGoal: number;
  revenue: number;
  diff: number;
  goalPercent: number;
  accumulatedRevenue: number;
  patients: number;
  accumulatedPatients: number;
  accumulatedAvgTicket: number;
};

export type MetasWeek = {
  weekIndex: number;
  periodLabel: string;
  weeklyGoal: number;
  revenue: number;
  diff: number;
  goalPercent: number;
  patients: number;
};

export type MetasBoard = {
  monthKey: string;
  days: MetasDay[];
  weeks: MetasWeek[];
  totalDailyGoals: number;
  accumulatedRevenue: number;
  accumulatedPatients: number;
  avgTicket: number;
  missingToMin: number;
  missingToTarget: number;
  missingToSuper: number;
  superGoalPercent: number;
  avgTicketForSuper: number;
  meritocracyStatus: string;
  /** R$ por pessoa se a super meta for passada (0 enquanto não passar). */
  meritocracyBonusPerPerson: number;
  /** Metas que valeram neste mês (já resolvidas). */
  goals: { min: number; target: number; super: number; patients: number };
};

const weekdayShort = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function toDate(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

export function businessDaysOfMonth(monthKey: string): string[] {
  const [year, month] = monthKey.split("-").map(Number);
  const days: string[] = [];
  const cursor = new Date(year, month - 1, 1, 12);
  while (cursor.getMonth() === month - 1) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      days.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Bônus por pessoa quando a SUPER META é passada (regra da CEO, agosto/2026):
 * R$ 200 ao bater, e + R$ 200 a cada R$ 10 mil acima. Sem teto.
 * Ex.: 400 mil → 200 · 410 mil → 400 · 420 mil → 600.
 */
export function meritocracyBonusPerPerson(accumulated: number, config: MetasConfig) {
  if (accumulated <= config.goalSuperRevenue) return 0;
  const acima = accumulated - config.goalSuperRevenue;
  return 200 + Math.floor(acima / 10000) * 200;
}

export function meritocracyStatusText(accumulated: number, config: MetasConfig) {
  // Faixas combinadas na apresentação de agosto/2026:
  //   < mínima ......... todas as meritocracias zeradas
  //   mínima → meta .... meritocracia individual (por função)
  //   meta → super ..... meritocracia + café da manhã em equipe
  //   > super .......... meritocracia + jantar + R$ 200 cada (+200 a cada 10 mil)
  if (accumulated > config.goalSuperRevenue) {
    const bonus = meritocracyBonusPerPerson(accumulated, config);
    return `SUPER META BATIDA! Meritocracia individual + jantar em equipe + R$ ${bonus.toLocaleString("pt-BR")} para cada um.`;
  }
  if (accumulated >= config.goalTargetRevenue) return "Meta batida! Meritocracia individual + café da manhã em equipe. Agora é caçar a super meta.";
  if (accumulated >= config.goalMinRevenue) return "Meta mínima atingida — meritocracia individual por função garantida. Vamos buscar a meta cheia.";
  return "Ainda abaixo da meta mínima — abaixo dela as meritocracias zeram. Vamos juntos, um dia de cada vez.";
}

// Regra combinada com a CEO: sexta-feira o Dr. Daniel não atende; nos outros
// dias úteis atende, salvo ajuste manual daquele dia (doctorDayOverrides).
export function doctorAttendsOn(date: string, config: MetasConfig): boolean {
  const monthKey = date.slice(0, 7);
  const override = config.doctorDayOverrides?.[monthKey]?.[date];
  if (override !== undefined) return override;
  if ((config.doctorOffDays[monthKey] ?? []).includes(date)) return false;
  return toDate(date).getDay() !== 5;
}

export function buildMetasBoard(
  sales: FinSale[],
  baseConfig: MetasConfig,
  monthKey: string,
  // Crediário reconhecido no mês (botão do Crediário): soma no faturamento
  // acumulado e no % da meta, sem inventar comanda em dia nenhum.
  extraRevenue = 0,
): MetasBoard {
  // As metas do MÊS mandam (a régua muda de mês em mês).
  const config = metasForMonth(baseConfig, monthKey);
  const dayList = businessDaysOfMonth(monthKey);

  const revenueByDay = new Map<string, number>();
  const patientsByDay = new Map<string, number>();
  for (const sale of sales) {
    if (!sale.saleDate.startsWith(monthKey)) continue;
    revenueByDay.set(sale.saleDate, (revenueByDay.get(sale.saleDate) ?? 0) + saleTotal(sale));
    patientsByDay.set(sale.saleDate, (patientsByDay.get(sale.saleDate) ?? 0) + 1);
  }

  let accumulatedRevenue = 0;
  let accumulatedPatients = 0;
  let weekIndex = 0;
  let lastWeekOfYear = -1;

  const days: MetasDay[] = dayList.map((date) => {
    const parsed = toDate(date);
    // Semana do mês: incrementa a cada segunda-feira (ou primeira ocorrência).
    const mondayAnchor = new Date(parsed);
    mondayAnchor.setDate(parsed.getDate() - ((parsed.getDay() + 6) % 7));
    const anchorKey = mondayAnchor.getTime();
    if (anchorKey !== lastWeekOfYear) {
      weekIndex += 1;
      lastWeekOfYear = anchorKey;
    }

    const withDoctor = doctorAttendsOn(date, config);
    const dailyGoal = withDoctor ? config.dailyGoalWithDoctor : config.dailyGoalWithoutDoctor;
    const revenue = revenueByDay.get(date) ?? 0;
    const patients = patientsByDay.get(date) ?? 0;
    accumulatedRevenue += revenue;
    accumulatedPatients += patients;

    return {
      date,
      weekday: weekdayShort[parsed.getDay()],
      weekIndex,
      withDoctor,
      dailyGoal,
      revenue,
      diff: revenue - dailyGoal,
      goalPercent: dailyGoal > 0 ? revenue / dailyGoal : 0,
      accumulatedRevenue,
      patients,
      accumulatedPatients,
      accumulatedAvgTicket: accumulatedPatients > 0 ? accumulatedRevenue / accumulatedPatients : 0,
    };
  });

  const weeks: MetasWeek[] = [];
  for (const day of days) {
    let week = weeks.find((entry) => entry.weekIndex === day.weekIndex);
    if (!week) {
      week = {
        weekIndex: day.weekIndex,
        periodLabel: "",
        weeklyGoal: 0,
        revenue: 0,
        diff: 0,
        goalPercent: 0,
        patients: 0,
      };
      weeks.push(week);
    }
    week.weeklyGoal += day.dailyGoal;
    week.revenue += day.revenue;
    week.patients += day.patients;
  }
  for (const week of weeks) {
    const weekDays = days.filter((day) => day.weekIndex === week.weekIndex);
    const first = weekDays[0]?.date.slice(8);
    const last = weekDays[weekDays.length - 1]?.date.slice(8);
    const month = weekDays[0]?.date.slice(5, 7);
    week.periodLabel = `${first} a ${last}/${month}`;
    week.diff = week.revenue - week.weeklyGoal;
    week.goalPercent = week.weeklyGoal > 0 ? week.revenue / week.weeklyGoal : 0;
  }

  const totalDailyGoals = days.reduce((sum, day) => sum + day.dailyGoal, 0);
  const avgTicket = accumulatedPatients > 0 ? accumulatedRevenue / accumulatedPatients : 0;

  const monthRevenue = accumulatedRevenue + extraRevenue;
  return {
    monthKey,
    days,
    weeks,
    totalDailyGoals,
    accumulatedRevenue: monthRevenue,
    accumulatedPatients,
    avgTicket,
    missingToMin: Math.max(config.goalMinRevenue - monthRevenue, 0),
    missingToTarget: Math.max(config.goalTargetRevenue - monthRevenue, 0),
    missingToSuper: Math.max(config.goalSuperRevenue - monthRevenue, 0),
    superGoalPercent: config.goalSuperRevenue > 0 ? monthRevenue / config.goalSuperRevenue : 0,
    avgTicketForSuper: config.goalPatients > 0 ? config.goalSuperRevenue / config.goalPatients : 0,
    meritocracyStatus: meritocracyStatusText(monthRevenue, config),
    meritocracyBonusPerPerson: meritocracyBonusPerPerson(monthRevenue, config),
    goals: {
      min: config.goalMinRevenue,
      target: config.goalTargetRevenue,
      super: config.goalSuperRevenue,
      patients: config.goalPatients,
    },
  };
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function buildMetaDoDiaMessage(board: MetasBoard, config: MetasConfig, todayISO: string) {
  const today = board.days.find((day) => day.date === todayISO);
  const dayLabel = toDate(todayISO).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const lines = [
    `Bom dia, equipe Bratan! ☀️`,
    ``,
    `📅 Meta de hoje (${dayLabel}):`,
  ];
  if (today) {
    lines.push(`🎯 ${brl.format(today.dailyGoal)} ${today.withDoctor ? "(dia com Dr. Daniel)" : "(dia sem Dr. Daniel)"}`);
  } else {
    lines.push(`🎯 Hoje não é dia útil do controle — foco em preparar a semana.`);
  }
  lines.push(
    ``,
    `📊 Mês até agora: ${brl.format(board.accumulatedRevenue)} (${Math.round(board.superGoalPercent * 100)}% da super meta)`,
    `🥅 Falta p/ meta mínima (${brl.format(config.goalMinRevenue)}): ${brl.format(board.missingToMin)}`,
    `🏆 Falta p/ super meta (${brl.format(config.goalSuperRevenue)}): ${brl.format(board.missingToSuper)}`,
    `👥 Pacientes no mês: ${board.accumulatedPatients} de ${config.goalPatients} · Ticket médio: ${brl.format(board.avgTicket)}`,
    ``,
    board.meritocracyStatus,
  );
  return lines.join("\n");
}
