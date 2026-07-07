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
};

export const defaultMetasConfig: MetasConfig = {
  goalMinRevenue: 300000,
  goalTargetRevenue: 330000,
  goalSuperRevenue: 350000,
  goalPatients: 45,
  dailyGoalWithDoctor: 17948.72,
  dailyGoalWithoutDoctor: 8974.36,
  doctorOffDays: {},
  doctorDayOverrides: {},
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

export function meritocracyStatusText(accumulated: number, config: MetasConfig) {
  if (accumulated >= config.goalSuperRevenue) return "SUPER META BATIDA! Meritocracia máxima desbloqueada — parabéns, time!";
  if (accumulated >= config.goalTargetRevenue) return "Meta batida! Agora é caçar a super meta.";
  if (accumulated >= config.goalMinRevenue) return "Meta mínima garantida — vamos buscar a meta cheia.";
  return "Ainda abaixo da meta mínima — vamos juntos, um dia de cada vez.";
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

export function buildMetasBoard(sales: FinSale[], config: MetasConfig, monthKey: string): MetasBoard {
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

  return {
    monthKey,
    days,
    weeks,
    totalDailyGoals,
    accumulatedRevenue,
    accumulatedPatients,
    avgTicket,
    missingToMin: Math.max(config.goalMinRevenue - accumulatedRevenue, 0),
    missingToTarget: Math.max(config.goalTargetRevenue - accumulatedRevenue, 0),
    missingToSuper: Math.max(config.goalSuperRevenue - accumulatedRevenue, 0),
    superGoalPercent: config.goalSuperRevenue > 0 ? accumulatedRevenue / config.goalSuperRevenue : 0,
    avgTicketForSuper: config.goalPatients > 0 ? config.goalSuperRevenue / config.goalPatients : 0,
    meritocracyStatus: meritocracyStatusText(accumulatedRevenue, config),
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
