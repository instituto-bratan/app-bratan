import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  HandCoins,
  HeartPulse,
  LineChart,
  MessageCircle,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import {
  actionPriorityLabels,
  actionStatusLabels,
  averageTicketReceived,
  averageTicketSold,
  createId360,
  defaultSettings360,
  isOverdue,
  loadInteligencia360State,
  moduleRoutes360,
  money360,
  objectionLabels,
  parseNumber360,
  percent360,
  pricingComputed,
  receivableOpenAmount,
  rootCauseLabels,
  saveInteligencia360State,
  seedInteligencia360State,
  stageLabels,
  ticketStatus,
  ticketVariationPercentage,
  touchTypeLabels,
  type ActionItem360,
  type ActionPriority360,
  type ActionSourceModule360,
  type ActionStatus360,
  type ExpectedImpact360,
  type FeedbackType360,
  type Inteligencia360State,
  type JourneyStage360,
  type ObjectionCategory360,
  type PatientType360,
  type PrescriptionStatus360,
  type ReceivableStatus360,
  type RescueStatus360,
  type RootCauseCategory360,
  type TouchStatus360,
  type TouchType360,
} from "./inteligencia360Data";
import {
  actionFromInsight,
  buildDashboard360Snapshot,
  buildDataQuality,
  generateActionRecommendations,
  generateMorningGoalMessage,
  generateWeeklyKickoffBrief,
} from "./intelligenceEngine";

type ModuleSlug =
  | "ticket-medio"
  | "precificacao"
  | "comercial"
  | "jornada-paciente"
  | "reguas"
  | "retencao-resgate"
  | "experiencia"
  | "recebiveis"
  | "acoes"
  | "configuracoes";

type ModuleConfig = {
  slug: ModuleSlug;
  title: string;
  description: string;
  href: string;
  source: string;
  icon: typeof BarChart3;
};

const modules: ModuleConfig[] = [
  {
    slug: "ticket-medio",
    title: "Ticket Médio Semanal",
    description: "Preenchimento por semana, médico e tipo de paciente.",
    href: moduleRoutes360.ticket,
    source: "Fonte do ticket médio, metas e variação semanal.",
    icon: TrendingUp,
  },
  {
    slug: "precificacao",
    title: "Precificação e Margem",
    description: "Preço, custo, repasse, desconto permitido e margem.",
    href: moduleRoutes360.pricing,
    source: "Fonte de preço mínimo, margem e política comercial.",
    icon: HandCoins,
  },
  {
    slug: "comercial",
    title: "Comercial e Prescrições",
    description: "Prescrito x vendido, objeções, descontos e follow-up.",
    href: moduleRoutes360.commercial,
    source: "Fonte de receita vendida, conversão e objeções.",
    icon: Target,
  },
  {
    slug: "jornada-paciente",
    title: "Jornada do Paciente",
    description: "Etapa, contrato, agenda, grupos e gargalos por setor.",
    href: moduleRoutes360.journey,
    source: "Fonte de contratos pendentes e pacientes sem próximo passo.",
    icon: UserRoundCheck,
  },
  {
    slug: "reguas",
    title: "Réguas de Relacionamento",
    description: "Toques, mensagens, responsáveis, opt-out e fadiga.",
    href: moduleRoutes360.touchpoints,
    source: "Fonte de contato, resgate e excesso de mensagens.",
    icon: MessageCircle,
  },
  {
    slug: "retencao-resgate",
    title: "Retenção, Resgate e Churn",
    description: "Coortes, tentativas, investigação e motivos de evasão.",
    href: moduleRoutes360.retention,
    source: "Fonte de retenção, pacientes em resgate e churn.",
    icon: RefreshCw,
  },
  {
    slug: "experiencia",
    title: "Experiência do Paciente",
    description: "NPS, Google, feedback e contato de liderança.",
    href: moduleRoutes360.experience,
    source: "Fonte de reputação, críticas abertas e ações corretivas.",
    icon: HeartPulse,
  },
  {
    slug: "recebiveis",
    title: "Recebíveis e Caixa",
    description: "Vendido não é caixa: aberto, vencido e recebido.",
    href: moduleRoutes360.receivables,
    source: "Fonte de receita recebida, aberto, vencido e aging.",
    icon: ReceiptText,
  },
  {
    slug: "acoes",
    title: "Ações e Plano de Melhoria",
    description: "Dono, prazo, prioridade, status e impacto esperado.",
    href: moduleRoutes360.actions,
    source: "Fonte de execução gerada por insights e gestão.",
    icon: ClipboardList,
  },
  {
    slug: "configuracoes",
    title: "Configurações Operacionais",
    description: "Metas, limites, responsáveis e origem dos dados.",
    href: moduleRoutes360.settings,
    source: "Fonte das metas, alertas e regras do motor 360.",
    icon: ShieldCheck,
  },
];

const moduleBySlug = Object.fromEntries(modules.map((module) => [module.slug, module])) as Record<ModuleSlug, ModuleConfig>;

function useInteligenciaState() {
  const [state, setState] = useState<Inteligencia360State>(() => loadInteligencia360State());

  function persist(updater: (current: Inteligencia360State) => Inteligencia360State) {
    setState((current) => {
      const next = updater(current);
      saveInteligencia360State(next);
      return next;
    });
  }

  function reset() {
    setState(seedInteligencia360State);
    saveInteligencia360State(seedInteligencia360State);
  }

  return { state, persist, reset };
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

function todayPlus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} type={type} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-11 w-full rounded-md border border-input bg-white/65 px-3 text-sm font-medium outline-none backdrop-blur-xl focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>{label}</Label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full rounded-md border border-input bg-white/65 px-3 py-2 text-sm font-medium outline-none backdrop-blur-xl focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

function SectionShell({
  children,
  eyebrow,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="ios-glass overflow-hidden rounded-lg border px-4 py-5 sm:px-7 sm:py-7"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant="gold">{eyebrow}</Badge>
              <Badge variant="outline">Fonte da verdade por módulo</Badge>
            </div>
            <h1 className="text-4xl text-brand-musgo sm:text-5xl">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </motion.section>
      {children}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
  tone = "default",
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  detail: string;
  href: string;
  tone?: "default" | "gold" | "critical";
}) {
  return (
    <Link to={href} className="group block">
      <Card
        className={
          tone === "critical"
            ? "h-full border-destructive/35 bg-destructive/8 shadow-none backdrop-blur transition hover:-translate-y-0.5 hover:shadow-calm"
            : tone === "gold"
              ? "h-full border-brand-dourado/45 bg-brand-creme/45 shadow-none backdrop-blur transition hover:-translate-y-0.5 hover:shadow-calm"
              : "h-full border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur transition hover:-translate-y-0.5 hover:shadow-calm"
        }
      >
        <CardContent className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-papel text-brand-musgo">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <ArrowRight className="h-4 w-4 text-brand-oliva transition group-hover:translate-x-1" aria-hidden="true" />
          </div>
          <p className="text-xs font-semibold uppercase text-brand-oliva">{label}</p>
          <p className="mt-2 text-2xl font-bold text-brand-tinta">{value}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function InsightCard({
  insight,
  onCreateAction,
}: {
  insight: ReturnType<typeof generateActionRecommendations>[number];
  onCreateAction: () => void;
}) {
  return (
    <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <Badge
            variant={insight.severity === "critical" || insight.severity === "attention" ? "gold" : "muted"}
            className={insight.severity === "critical" ? "ring-destructive/35 text-destructive" : undefined}
          >
            {insight.severity === "critical" ? "Crítico" : insight.severity === "attention" ? "Atenção" : "Saudável"}
          </Badge>
          <Button asChild size="sm" variant="ghost">
            <Link to={insight.sourceHref}>Abrir origem</Link>
          </Button>
        </div>
        <h3 className="text-lg text-brand-musgo">{insight.title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{insight.description}</p>
        <div className="mt-4 rounded-lg border border-brand-dourado/25 bg-brand-creme/35 p-3">
          <p className="text-xs font-semibold uppercase text-brand-oliva">Próxima ação recomendada</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-brand-tinta">{insight.recommendation}</p>
        </div>
        {insight.canCreateAction ? (
          <Button type="button" size="sm" className="mt-4 gap-2" onClick={onCreateAction}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Criar ação
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function Inteligencia360DashboardPage() {
  const { state, persist, reset } = useInteligenciaState();
  const snapshot = useMemo(() => buildDashboard360Snapshot(state), [state]);
  const insights = useMemo(() => generateActionRecommendations(state), [state]);
  const quality = useMemo(() => buildDataQuality(state), [state]);
  const [createdAction, setCreatedAction] = useState<string | null>(null);
  const [period, setPeriod] = useState("semana");

  function createActionFromInsight(insight: ReturnType<typeof generateActionRecommendations>[number]) {
    const action = actionFromInsight(insight);
    persist((current) => ({ ...current, actions: [action, ...current.actions] }));
    setCreatedAction(action.title);
  }

  const cards = [
    {
      label: "Faturamento vendido",
      value: money360(snapshot.totalSoldAmount),
      detail: "Fonte: Comercial e Prescrições",
      href: moduleRoutes360.commercial,
      icon: Target,
      tone: "gold" as const,
    },
    {
      label: "Receita recebida",
      value: money360(snapshot.totalReceivedAmount),
      detail: "Fonte: Recebíveis / comprovantes / caixa",
      href: moduleRoutes360.receivables,
      icon: ReceiptText,
    },
    {
      label: "Ticket médio geral",
      value: money360(snapshot.averageTicketGeneral),
      detail: "Fonte: Ticket Médio Semanal",
      href: moduleRoutes360.ticket,
      icon: TrendingUp,
    },
    {
      label: "Ticket novos",
      value: money360(snapshot.averageTicketNewPatients),
      detail: "Separado obrigatoriamente por tipo",
      href: moduleRoutes360.ticket,
      icon: UsersRound,
    },
    {
      label: "Ticket recorrentes",
      value: money360(snapshot.averageTicketReturningPatients),
      detail: "Leitura de renovação e esteira",
      href: moduleRoutes360.ticket,
      icon: RefreshCw,
    },
    {
      label: "Conversão prescrição",
      value: percent360(snapshot.prescriptionConversionRate),
      detail: "Faixa saudável: 70% a 80%",
      href: moduleRoutes360.commercial,
      icon: LineChart,
      tone: snapshot.prescriptionConversionRate < state.settings.prescriptionConversionMin ? "critical" as const : undefined,
    },
    {
      label: "Retenção",
      value: percent360(snapshot.retentionRate),
      detail: "Fonte: coorte mensal",
      href: moduleRoutes360.retention,
      icon: HeartPulse,
    },
    {
      label: "Em resgate",
      value: `${snapshot.rescueOpenCount}`,
      detail: "Pacientes antes de churn",
      href: moduleRoutes360.retention,
      icon: MessageCircle,
      tone: snapshot.rescueOpenCount ? "gold" as const : undefined,
    },
    {
      label: "NPS médio",
      value: snapshot.npsAverage ? snapshot.npsAverage.toFixed(1).replace(".", ",") : "Sem dado",
      detail: "Fonte: Experiência do Paciente",
      href: moduleRoutes360.experience,
      icon: Activity,
    },
    {
      label: "Recebíveis em aberto",
      value: money360(snapshot.totalOpenReceivables),
      detail: "Vendido não é caixa",
      href: moduleRoutes360.receivables,
      icon: HandCoins,
    },
    {
      label: "Recebíveis vencidos",
      value: money360(snapshot.totalOverdueReceivables),
      detail: "Risco direto de caixa",
      href: moduleRoutes360.receivables,
      icon: AlertTriangle,
      tone: snapshot.totalOverdueReceivables > 0 ? "critical" as const : undefined,
    },
    {
      label: "Qualidade dos dados",
      value: `${snapshot.dataCompletenessScore}%`,
      detail: "Dashboard parcial quando faltar origem",
      href: moduleRoutes360.settings,
      icon: ShieldCheck,
      tone: snapshot.dataCompletenessScore < 75 ? "gold" as const : undefined,
    },
  ];

  return (
    <SectionShell
      eyebrow="Inteligência 360"
      title="Dashboard 360"
      description="Camada executiva read-only: consolida dados dos módulos, mostra alertas e leva você para a fonte correta. O dado nasce no fluxo de trabalho, não aqui."
      actions={
        <>
          <Button type="button" variant="outline" className="gap-2" onClick={() => copyText(generateMorningGoalMessage(state))}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar meta do dia
          </Button>
          <LiquidButton type="button" size="lg" onClick={() => copyText(generateWeeklyKickoffBrief(state))}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Gerar resumo
          </LiquidButton>
        </>
      }
    >
      <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <SelectField
            label="Período"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "dia", label: "Dia" },
              { value: "semana", label: "Semana" },
              { value: "mes", label: "Mês" },
              { value: "ano", label: "Ano" },
            ]}
          />
          <Field label="Médico" value="Todos" onChange={() => undefined} />
          <Field label="Tipo de paciente" value="Todos" onChange={() => undefined} />
          <Field label="Canal" value="Todos" onChange={() => undefined} />
          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full" onClick={reset}>
              Restaurar demo
            </Button>
          </div>
        </CardContent>
      </Card>

      {createdAction ? (
        <Card className="border-brand-dourado/45 bg-brand-creme/45 shadow-none">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
            <p className="text-sm font-semibold text-brand-tinta">Ação criada: {createdAction}</p>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle>Insights da Semana</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {insights.length ? (
              insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} onCreateAction={() => createActionFromInsight(insight)} />
              ))
            ) : (
              <div className="rounded-lg border border-brand-oliva/16 bg-white/65 p-4">
                <p className="font-semibold text-brand-musgo">Sem alertas críticos agora.</p>
                <p className="mt-1 text-sm text-muted-foreground">Continue preenchendo os módulos de origem para manter a leitura confiável.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle>Qualidade dos Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-brand-dourado/25 bg-brand-creme/35 p-4">
              <p className="text-xs font-semibold uppercase text-brand-oliva">Score</p>
              <p className="mt-1 text-4xl font-bold text-brand-musgo">{snapshot.dataCompletenessScore}%</p>
              <p className="mt-2 text-sm text-muted-foreground">Indicadores incompletos ficam marcados antes de virar decisão.</p>
            </div>
            {quality.map((item) => (
              <Link key={item.module} to={item.sourceHref} className="block rounded-lg border border-brand-oliva/16 bg-white/65 p-4 transition hover:bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-brand-tinta">{item.module}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                    <p className="mt-1 text-xs text-brand-oliva">{item.impact}</p>
                  </div>
                  <Badge variant={item.status === "complete" ? "muted" : "gold"}>{item.status === "complete" ? "Completo" : "Pendente"}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </SectionShell>
  );
}

function ModuleNav({ active }: { active: ModuleSlug }) {
  return (
    <div className="mobile-scrollbar-none flex gap-2 overflow-x-auto pb-1">
      {modules.map((module) => (
        <Button key={module.slug} asChild size="sm" variant={module.slug === active ? "default" : "outline"} className="shrink-0">
          <Link to={module.href}>{module.title}</Link>
        </Button>
      ))}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-brand-oliva/16 bg-white/65">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-brand-papel/70 text-xs uppercase text-brand-oliva">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-oliva/10">
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={headers.length}>
                  Nada registrado ainda. Preencha este módulo para alimentar o Dashboard 360.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TicketModule({ state, persist }: { state: Inteligencia360State; persist: ReturnType<typeof useInteligenciaState>["persist"] }) {
  const [form, setForm] = useState({
    weekStartDate: new Date().toISOString().slice(0, 10),
    weekEndDate: todayPlus(6),
    doctorName: "Dr. Daniel",
    patientType: "NEW" as PatientType360,
    patientsSeenCount: "0",
    patientsClosedCount: "0",
    totalSoldAmount: "",
    totalReceivedAmount: "",
    targetAverageTicket: String(state.settings.generalAverageTicketTarget),
    previousWeekAverageTicket: "",
    mainHypothesis: "",
    rootCauseCategory: "OTHER" as RootCauseCategory360,
    actionPlan: "",
    responsibleUserId: "Gestão",
    dueDate: todayPlus(5),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = new Date().toISOString();
    persist((current) => ({
      ...current,
      weeklyTickets: [
        {
          id: createId360("wat"),
          weekStartDate: form.weekStartDate,
          weekEndDate: form.weekEndDate,
          referenceMonth: form.weekStartDate.slice(0, 7),
          doctorId: form.doctorName.toLowerCase().replace(/\s+/g, "-"),
          doctorName: form.doctorName,
          patientType: form.patientType,
          patientsSeenCount: parseNumber360(form.patientsSeenCount),
          patientsClosedCount: parseNumber360(form.patientsClosedCount),
          totalSoldAmount: parseNumber360(form.totalSoldAmount),
          totalReceivedAmount: parseNumber360(form.totalReceivedAmount),
          targetAverageTicket: parseNumber360(form.targetAverageTicket),
          previousWeekAverageTicket: parseNumber360(form.previousWeekAverageTicket),
          mainHypothesis: form.mainHypothesis,
          rootCauseCategory: form.rootCauseCategory,
          actionPlan: form.actionPlan,
          responsibleUserId: form.responsibleUserId,
          dueDate: form.dueDate,
          notes: "",
          createdBy: "Gestão",
          createdAt: now,
          updatedAt: now,
        },
        ...current.weeklyTickets,
      ],
    }));
  }

  return (
    <>
      <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
        <CardHeader>
          <CardTitle>Novo registro semanal</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
            <Field label="Início da semana" value={form.weekStartDate} type="date" onChange={(value) => setForm({ ...form, weekStartDate: value })} />
            <Field label="Fim da semana" value={form.weekEndDate} type="date" onChange={(value) => setForm({ ...form, weekEndDate: value })} />
            <Field label="Médico" value={form.doctorName} onChange={(value) => setForm({ ...form, doctorName: value })} />
            <SelectField
              label="Tipo de paciente"
              value={form.patientType}
              onChange={(value) => setForm({ ...form, patientType: value })}
              options={[
                { value: "NEW", label: "Novo" },
                { value: "RETURNING", label: "Recorrente" },
              ]}
            />
            <Field label="Atendidos" value={form.patientsSeenCount} type="number" onChange={(value) => setForm({ ...form, patientsSeenCount: value })} />
            <Field label="Fechados" value={form.patientsClosedCount} type="number" onChange={(value) => setForm({ ...form, patientsClosedCount: value })} />
            <Field label="Valor vendido" value={form.totalSoldAmount} onChange={(value) => setForm({ ...form, totalSoldAmount: value })} />
            <Field label="Valor recebido" value={form.totalReceivedAmount} onChange={(value) => setForm({ ...form, totalReceivedAmount: value })} />
            <Field label="Meta de ticket" value={form.targetAverageTicket} onChange={(value) => setForm({ ...form, targetAverageTicket: value })} />
            <Field label="Ticket semana anterior" value={form.previousWeekAverageTicket} onChange={(value) => setForm({ ...form, previousWeekAverageTicket: value })} />
            <SelectField
              label="Causa raiz provável"
              value={form.rootCauseCategory}
              onChange={(value) => setForm({ ...form, rootCauseCategory: value })}
              options={Object.entries(rootCauseLabels).map(([value, label]) => ({ value: value as RootCauseCategory360, label }))}
            />
            <Field label="Responsável" value={form.responsibleUserId} onChange={(value) => setForm({ ...form, responsibleUserId: value })} />
            <TextAreaField label="Hipótese principal" value={form.mainHypothesis} onChange={(value) => setForm({ ...form, mainHypothesis: value })} />
            <TextAreaField label="Ação corretiva vinculada" value={form.actionPlan} onChange={(value) => setForm({ ...form, actionPlan: value })} />
            <div className="md:col-span-2 xl:col-span-4">
              <LiquidButton type="submit" size="lg">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Adicionar ticket
              </LiquidButton>
            </div>
          </form>
        </CardContent>
      </Card>
      <DataTable
        headers={["Semana", "Médico", "Tipo", "Ticket vendido", "Recebido", "Variação", "Status"]}
        rows={state.weeklyTickets.map((record) => [
          `${record.weekStartDate} a ${record.weekEndDate}`,
          record.doctorName,
          record.patientType === "NEW" ? "Novo" : "Recorrente",
          money360(averageTicketSold(record)),
          money360(averageTicketReceived(record)),
          percent360(ticketVariationPercentage(record)),
          <Badge key={record.id} variant={ticketStatus(record, state.settings.ticketDropCriticalPercentage) === "CRITICAL" ? "gold" : "muted"}>
            {ticketStatus(record, state.settings.ticketDropCriticalPercentage)}
          </Badge>,
        ])}
      />
    </>
  );
}

function SimpleModuleForms({ slug, state, persist }: { slug: ModuleSlug; state: Inteligencia360State; persist: ReturnType<typeof useInteligenciaState>["persist"] }) {
  if (slug === "ticket-medio") return <TicketModule state={state} persist={persist} />;

  if (slug === "precificacao") {
    const [form, setForm] = useState({
      serviceName: "",
      category: "Programa",
      bratanPrice: "",
      directCost: "",
      medicationCost: "",
      labCost: "",
      cardFeePercentage: "3.2",
      doctorRepasseValue: "18",
      maxDiscountPercentage: String(state.settings.maxDefaultDiscountPercentage),
    });
    return (
      <>
        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader>
            <CardTitle>Adicionar serviço à tabela de margem</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                const now = new Date().toISOString();
                persist((current) => ({
                  ...current,
                  pricing: [
                    {
                      id: createId360("price"),
                      serviceName: form.serviceName || "Serviço sem nome",
                      category: form.category,
                      standardPrice: parseNumber360(form.bratanPrice),
                      bratanPrice: parseNumber360(form.bratanPrice),
                      directCost: parseNumber360(form.directCost),
                      medicationCost: parseNumber360(form.medicationCost),
                      labCost: parseNumber360(form.labCost),
                      cardFeePercentage: parseNumber360(form.cardFeePercentage),
                      doctorRepasseType: "PERCENTAGE",
                      doctorRepasseValue: parseNumber360(form.doctorRepasseValue),
                      otherVariableCosts: 0,
                      maxDiscountPercentage: parseNumber360(form.maxDiscountPercentage),
                      active: true,
                      strategicHighMargin: false,
                      notes: "",
                      createdAt: now,
                      updatedAt: now,
                    },
                    ...current.pricing,
                  ],
                }));
              }}
            >
              <Field label="Serviço" value={form.serviceName} onChange={(value) => setForm({ ...form, serviceName: value })} />
              <Field label="Categoria" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
              <Field label="Preço Bratan" value={form.bratanPrice} onChange={(value) => setForm({ ...form, bratanPrice: value })} />
              <Field label="Custo direto" value={form.directCost} onChange={(value) => setForm({ ...form, directCost: value })} />
              <Field label="Medicamento" value={form.medicationCost} onChange={(value) => setForm({ ...form, medicationCost: value })} />
              <Field label="Laboratório" value={form.labCost} onChange={(value) => setForm({ ...form, labCost: value })} />
              <Field label="Taxa cartão %" value={form.cardFeePercentage} onChange={(value) => setForm({ ...form, cardFeePercentage: value })} />
              <Field label="Repasse médico %" value={form.doctorRepasseValue} onChange={(value) => setForm({ ...form, doctorRepasseValue: value })} />
              <div className="md:col-span-2 xl:col-span-4">
                <LiquidButton type="submit" size="lg">Adicionar preço</LiquidButton>
              </div>
            </form>
          </CardContent>
        </Card>
        <DataTable
          headers={["Serviço", "Preço", "Custo estimado", "Margem", "Preço mínimo", "Alerta"]}
          rows={state.pricing.map((item) => {
            const computed = pricingComputed(item);
            return [
              item.serviceName,
              money360(item.bratanPrice),
              money360(computed.totalEstimatedCost),
              percent360(computed.grossMarginPercentage),
              money360(computed.minimumAllowedPrice),
              computed.grossMarginPercentage < 35 ? <Badge key={item.id} variant="gold" className="text-destructive">Desconto ameaça margem</Badge> : <Badge key={item.id} variant="muted">Saudável</Badge>,
            ];
          })}
        />
      </>
    );
  }

  if (slug === "comercial") {
    const [form, setForm] = useState({
      patientReference: "",
      patientType: "NEW" as PatientType360,
      prescribedAmount: "",
      soldAmount: "",
      receivedAmount: "",
      acquisitionChannel: "Indicação",
      objectionCategory: "PRICE" as ObjectionCategory360,
      status: "PRESCRIBED" as PrescriptionStatus360,
      nextFollowUpDate: todayPlus(1),
    });
    return (
      <>
        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader><CardTitle>Registrar prescrição e fechamento</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => {
              event.preventDefault();
              const now = new Date().toISOString();
              const sold = parseNumber360(form.soldAmount);
              persist((current) => ({ ...current, prescriptions: [{
                id: createId360("rx"), patientReference: form.patientReference || "PAC-SEM-ID", patientType: form.patientType, doctorId: "Dr. Daniel", sellerId: "Comercial", consultationDate: todayPlus(0), prescribedAmount: parseNumber360(form.prescribedAmount), soldAmount: sold, receivedAmount: parseNumber360(form.receivedAmount), closed: sold > 0, fullPlanClosed: form.status === "CLOSED_FULL", partialReason: "", discountPercentage: 0, paymentMethod: "", installments: 0, acquisitionChannel: form.acquisitionChannel, mainObjection: objectionLabels[form.objectionCategory], objectionCategory: form.objectionCategory, nextFollowUpDate: form.nextFollowUpDate, status: form.status, notes: "", createdAt: now, updatedAt: now,
              }, ...current.prescriptions] }));
            }}>
              <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
              <SelectField label="Tipo" value={form.patientType} onChange={(value) => setForm({ ...form, patientType: value })} options={[{ value: "NEW", label: "Novo" }, { value: "RETURNING", label: "Recorrente" }]} />
              <Field label="Valor prescrito" value={form.prescribedAmount} onChange={(value) => setForm({ ...form, prescribedAmount: value })} />
              <Field label="Valor vendido" value={form.soldAmount} onChange={(value) => setForm({ ...form, soldAmount: value })} />
              <Field label="Valor recebido" value={form.receivedAmount} onChange={(value) => setForm({ ...form, receivedAmount: value })} />
              <Field label="Canal" value={form.acquisitionChannel} onChange={(value) => setForm({ ...form, acquisitionChannel: value })} />
              <SelectField label="Objeção" value={form.objectionCategory} onChange={(value) => setForm({ ...form, objectionCategory: value })} options={Object.entries(objectionLabels).map(([value, label]) => ({ value: value as ObjectionCategory360, label }))} />
              <SelectField label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={["PRESCRIBED", "CLOSED_FULL", "CLOSED_PARTIAL", "NOT_CLOSED", "IN_RECOVERY", "LOST"].map((value) => ({ value: value as PrescriptionStatus360, label: value }))} />
              <div className="md:col-span-2 xl:col-span-4"><LiquidButton type="submit" size="lg">Adicionar venda</LiquidButton></div>
            </form>
          </CardContent>
        </Card>
        <DataTable headers={["Paciente", "Prescrito", "Vendido", "Recebido", "Conversão", "Objeção"]} rows={state.prescriptions.map((record) => [record.patientReference, money360(record.prescribedAmount), money360(record.soldAmount), money360(record.receivedAmount), percent360(record.prescribedAmount ? record.soldAmount / record.prescribedAmount * 100 : 0), objectionLabels[record.objectionCategory]])} />
      </>
    );
  }

  if (slug === "jornada-paciente") {
    const [form, setForm] = useState({ patientReference: "", currentStage: "SALES" as JourneyStage360, contractCreated: false, contractSent: false, contractSigned: false, allDatesScheduled: false });
    return (
      <>
        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader><CardTitle>Registrar etapa da jornada</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => {
              event.preventDefault();
              const now = new Date().toISOString();
              persist((current) => ({ ...current, journeys: [{ id: createId360("journey"), patientReference: form.patientReference || "PAC-SEM-ID", patientType: "NEW", currentStage: form.currentStage, doctorId: "Dr. Daniel", sellerId: "Comercial", conciergeId: "Concierge", nurseId: "Enfermagem", adminId: "Administrativo", treatmentPlanSummary: "", prescriptionSent: true, treatmentGroupSent: true, pharmacyGroupSent: true, pmiCompleted: true, contractCreated: form.contractCreated, contractSent: form.contractSent, contractSigned: form.contractSigned, firstDoseScheduled: false, firstBioimpedanceScheduled: false, allDatesScheduled: form.allDatesScheduled, nextMedicalReturnDate: "", nextExamDueDate: "", notes: "", createdAt: now, updatedAt: now }, ...current.journeys] }));
            }}>
              <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
              <SelectField label="Etapa atual" value={form.currentStage} onChange={(value) => setForm({ ...form, currentStage: value })} options={Object.entries(stageLabels).map(([value, label]) => ({ value: value as JourneyStage360, label }))} />
              {(["contractCreated", "contractSent", "contractSigned", "allDatesScheduled"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 rounded-lg border border-brand-oliva/16 bg-white/60 px-3 py-3 text-sm font-semibold">
                  <input type="checkbox" checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />
                  {key}
                </label>
              ))}
              <div className="md:col-span-2 xl:col-span-4"><LiquidButton type="submit" size="lg">Adicionar jornada</LiquidButton></div>
            </form>
          </CardContent>
        </Card>
        <DataTable headers={["Paciente", "Etapa", "Contrato", "Datas", "Próximo passo"]} rows={state.journeys.map((record) => [record.patientReference, stageLabels[record.currentStage], record.contractSigned ? "Assinado" : record.contractSent ? "Enviado" : record.contractCreated ? "Criado" : "Pendente", record.allDatesScheduled ? "Agendadas" : "Incompletas", record.contractSigned ? "Concierge / enfermagem" : "Administrativo conferir SuperSign"])} />
      </>
    );
  }

  if (slug === "reguas") {
    const [form, setForm] = useState({ patientReference: "", touchType: "D1_CONCIERGE" as TouchType360, scheduledDate: todayPlus(1), status: "PENDING" as TouchStatus360, manualMessageText: "Olá. Passando para saber como você está e se ficou alguma dúvida." });
    return (
      <>
        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader><CardTitle>Adicionar toque da régua</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => {
              event.preventDefault();
              const now = new Date().toISOString();
              persist((current) => ({ ...current, touchpoints: [{ id: createId360("touch"), patientReference: form.patientReference || "PAC-SEM-ID", journeyId: "", touchType: form.touchType, scheduledDate: form.scheduledDate, sentDate: form.status === "SENT" ? todayPlus(0) : "", responsibleRole: "Equipe", responsibleUserId: "Equipe", status: form.status, channel: "WHATSAPP", messageTemplateId: "", manualMessageText: form.manualMessageText, responseSummary: "", optOut: false, fatigueRisk: false, notes: "", createdAt: now, updatedAt: now }, ...current.touchpoints] }));
            }}>
              <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
              <SelectField label="Tipo de toque" value={form.touchType} onChange={(value) => setForm({ ...form, touchType: value })} options={Object.entries(touchTypeLabels).map(([value, label]) => ({ value: value as TouchType360, label }))} />
              <Field label="Data programada" type="date" value={form.scheduledDate} onChange={(value) => setForm({ ...form, scheduledDate: value })} />
              <SelectField label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={["PENDING", "SENT", "RESPONDED", "PAUSED", "CANCELED", "FAILED"].map((value) => ({ value: value as TouchStatus360, label: value }))} />
              <TextAreaField label="Mensagem para copiar" value={form.manualMessageText} onChange={(value) => setForm({ ...form, manualMessageText: value })} />
              <div className="flex items-end gap-2 md:col-span-2 xl:col-span-4"><LiquidButton type="submit" size="lg">Adicionar toque</LiquidButton><Button type="button" variant="outline" onClick={() => copyText(form.manualMessageText)}>Copiar mensagem</Button></div>
            </form>
          </CardContent>
        </Card>
        <DataTable headers={["Paciente", "Toque", "Data", "Status", "Mensagem"]} rows={state.touchpoints.map((record) => [record.patientReference, touchTypeLabels[record.touchType], record.scheduledDate, record.status, <Button key={record.id} type="button" size="sm" variant="outline" onClick={() => copyText(record.manualMessageText)}>Copiar</Button>])} />
      </>
    );
  }

  if (slug === "retencao-resgate") {
    const [form, setForm] = useState({ cohortMonth: new Date().toISOString().slice(0, 7), scheduledReturns: "", attendedReturns: "", missedReturns: "" });
    return (
      <>
        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader><CardTitle>Registrar coorte mensal</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => {
              event.preventDefault();
              const now = new Date().toISOString();
              persist((current) => ({ ...current, retentionCohorts: [{ id: createId360("ret"), cohortMonth: form.cohortMonth, cohortLabel: form.cohortMonth, totalPatients: parseNumber360(form.scheduledReturns), scheduledReturns: parseNumber360(form.scheduledReturns), attendedReturns: parseNumber360(form.attendedReturns), missedReturns: parseNumber360(form.missedReturns), patientType: "MIXED", notes: "", createdAt: now, updatedAt: now }, ...current.retentionCohorts] }));
            }}>
              <Field label="Mês da coorte" type="month" value={form.cohortMonth} onChange={(value) => setForm({ ...form, cohortMonth: value })} />
              <Field label="Retornos agendados" value={form.scheduledReturns} onChange={(value) => setForm({ ...form, scheduledReturns: value })} />
              <Field label="Compareceram" value={form.attendedReturns} onChange={(value) => setForm({ ...form, attendedReturns: value })} />
              <Field label="Não voltaram" value={form.missedReturns} onChange={(value) => setForm({ ...form, missedReturns: value })} />
              <div className="md:col-span-2 xl:col-span-4"><LiquidButton type="submit" size="lg">Adicionar coorte</LiquidButton></div>
            </form>
          </CardContent>
        </Card>
        <DataTable headers={["Coorte", "Agendados", "Compareceram", "Faltaram", "Retenção"]} rows={state.retentionCohorts.map((record) => [record.cohortLabel, record.scheduledReturns, record.attendedReturns, record.missedReturns, percent360(record.scheduledReturns ? record.attendedReturns / record.scheduledReturns * 100 : 0)])} />
        <DataTable headers={["Paciente em resgate", "Tipo", "Tentativas", "Status", "Dono"]} rows={state.rescueWorkflows.map((record) => [record.patientReference, record.rescueType, `${record.attemptsDone}/${record.attemptsTotal}`, record.status as RescueStatus360, record.ownerUserId])} />
      </>
    );
  }

  if (slug === "experiencia") {
    const [form, setForm] = useState({ patientReference: "", npsScore: "8", satisfactionScore: "9", feedbackType: "PRAISE" as FeedbackType360, feedbackText: "" });
    return (
      <>
        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader><CardTitle>Registrar experiência</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => {
              event.preventDefault();
              const now = new Date().toISOString();
              const nps = parseNumber360(form.npsScore);
              persist((current) => ({ ...current, experiences: [{ id: createId360("exp"), patientReference: form.patientReference || "PAC-SEM-ID", journeyId: "", npsScore: nps, satisfactionScore: parseNumber360(form.satisfactionScore), googleReviewRequested: false, googleReviewDone: false, leadershipContactDone: false, leadershipContactDate: "", feedbackType: form.feedbackType, feedbackText: form.feedbackText, actionRequired: nps <= 6 || form.feedbackType === "CRITICISM" || form.feedbackType === "COMPLAINT", actionPlanId: "", status: "OPEN", createdAt: now, updatedAt: now }, ...current.experiences] }));
            }}>
              <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
              <Field label="NPS" type="number" value={form.npsScore} onChange={(value) => setForm({ ...form, npsScore: value })} />
              <Field label="Satisfação" type="number" value={form.satisfactionScore} onChange={(value) => setForm({ ...form, satisfactionScore: value })} />
              <SelectField label="Tipo" value={form.feedbackType} onChange={(value) => setForm({ ...form, feedbackType: value })} options={["PRAISE", "CRITICISM", "SUGGESTION", "COMPLAINT"].map((value) => ({ value: value as FeedbackType360, label: value }))} />
              <TextAreaField label="Feedback" value={form.feedbackText} onChange={(value) => setForm({ ...form, feedbackText: value })} />
              <div className="md:col-span-2 xl:col-span-4"><LiquidButton type="submit" size="lg">Adicionar experiência</LiquidButton></div>
            </form>
          </CardContent>
        </Card>
        <DataTable headers={["Paciente", "NPS", "Satisfação", "Tipo", "Ação obrigatória"]} rows={state.experiences.map((record) => [record.patientReference, record.npsScore, record.satisfactionScore, record.feedbackType, record.actionRequired ? <Badge key={record.id} variant="gold" className="text-destructive">Sim</Badge> : <Badge key={record.id} variant="muted">Não</Badge>])} />
      </>
    );
  }

  if (slug === "recebiveis") {
    const [form, setForm] = useState({ patientReference: "", totalAmount: "", receivedAmount: "", dueDate: todayPlus(7), status: "OPEN" as ReceivableStatus360 });
    return (
      <>
        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader><CardTitle>Registrar recebível</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => {
              event.preventDefault();
              const now = new Date().toISOString();
              persist((current) => ({ ...current, receivables: [{ id: createId360("recv"), patientReference: form.patientReference || "PAC-SEM-ID", saleId: "", totalAmount: parseNumber360(form.totalAmount), receivedAmount: parseNumber360(form.receivedAmount), dueDate: form.dueDate, paymentMethod: "Manual", installments: 1, status: form.status, ownerUserId: "Financeiro", collectionStatus: "NOT_STARTED", notes: "", createdAt: now, updatedAt: now }, ...current.receivables] }));
            }}>
              <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
              <Field label="Valor vendido" value={form.totalAmount} onChange={(value) => setForm({ ...form, totalAmount: value })} />
              <Field label="Valor recebido" value={form.receivedAmount} onChange={(value) => setForm({ ...form, receivedAmount: value })} />
              <Field label="Vencimento" type="date" value={form.dueDate} onChange={(value) => setForm({ ...form, dueDate: value })} />
              <SelectField label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={["OPEN", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELED"].map((value) => ({ value: value as ReceivableStatus360, label: value }))} />
              <div className="md:col-span-2 xl:col-span-4"><LiquidButton type="submit" size="lg">Adicionar recebível</LiquidButton></div>
            </form>
          </CardContent>
        </Card>
        <DataTable headers={["Paciente", "Vendido", "Recebido", "Aberto", "Vencimento", "Status"]} rows={state.receivables.map((record) => [record.patientReference, money360(record.totalAmount), money360(record.receivedAmount), money360(receivableOpenAmount(record)), record.dueDate, isOverdue(record.dueDate) && record.status !== "PAID" ? <Badge key={record.id} variant="gold" className="text-destructive">Vencido</Badge> : record.status])} />
      </>
    );
  }

  if (slug === "acoes") {
    const [form, setForm] = useState({ title: "", description: "", sourceModule: "MANUAL" as ActionSourceModule360, priority: "MEDIUM" as ActionPriority360, ownerUserId: "Gestão", dueDate: todayPlus(5), expectedImpact: "PROCESS" as ExpectedImpact360 });
    return (
      <>
        <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
          <CardHeader><CardTitle>Criar ação manual</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => {
              event.preventDefault();
              const now = new Date().toISOString();
              const action: ActionItem360 = { id: createId360("act"), sourceModule: form.sourceModule, sourceId: "", title: form.title || "Ação sem título", description: form.description, priority: form.priority, ownerUserId: form.ownerUserId, dueDate: form.dueDate, status: "OPEN", expectedImpact: form.expectedImpact, createdAt: now, updatedAt: now };
              persist((current) => ({ ...current, actions: [action, ...current.actions] }));
            }}>
              <Field label="Título" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
              <Field label="Dono" value={form.ownerUserId} onChange={(value) => setForm({ ...form, ownerUserId: value })} />
              <Field label="Prazo" type="date" value={form.dueDate} onChange={(value) => setForm({ ...form, dueDate: value })} />
              <SelectField label="Prioridade" value={form.priority} onChange={(value) => setForm({ ...form, priority: value })} options={Object.entries(actionPriorityLabels).map(([value, label]) => ({ value: value as ActionPriority360, label }))} />
              <TextAreaField label="Descrição" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
              <div className="md:col-span-2 xl:col-span-4"><LiquidButton type="submit" size="lg">Criar ação</LiquidButton></div>
            </form>
          </CardContent>
        </Card>
        <DataTable headers={["Ação", "Prioridade", "Dono", "Prazo", "Status", "Impacto"]} rows={state.actions.map((record) => [record.title, actionPriorityLabels[record.priority], record.ownerUserId, record.dueDate, actionStatusLabels[record.status as ActionStatus360], record.expectedImpact])} />
      </>
    );
  }

  if (slug === "configuracoes") {
    const [form, setForm] = useState({ ...state.settings });
    return (
      <Card className="border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur">
        <CardHeader><CardTitle>Metas e limites do motor 360</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => {
            event.preventDefault();
            persist((current) => ({ ...current, settings: form }));
          }}>
            <Field label="Meta mensal" value={String(form.monthlyRevenueTarget)} onChange={(value) => setForm({ ...form, monthlyRevenueTarget: parseNumber360(value) })} />
            <Field label="Meta semanal" value={String(form.weeklyRevenueTarget)} onChange={(value) => setForm({ ...form, weeklyRevenueTarget: parseNumber360(value) })} />
            <Field label="Meta diária" value={String(form.dailyRevenueTarget)} onChange={(value) => setForm({ ...form, dailyRevenueTarget: parseNumber360(value) })} />
            <Field label="Meta ticket geral" value={String(form.generalAverageTicketTarget)} onChange={(value) => setForm({ ...form, generalAverageTicketTarget: parseNumber360(value) })} />
            <Field label="Queda crítica %" value={String(form.ticketDropCriticalPercentage)} onChange={(value) => setForm({ ...form, ticketDropCriticalPercentage: parseNumber360(value) })} />
            <Field label="Conversão mínima %" value={String(form.prescriptionConversionMin)} onChange={(value) => setForm({ ...form, prescriptionConversionMin: parseNumber360(value) })} />
            <Field label="Conversão máxima %" value={String(form.prescriptionConversionMax)} onChange={(value) => setForm({ ...form, prescriptionConversionMax: parseNumber360(value) })} />
            <Field label="Mensagens/ciclo" value={String(form.maxMessagesPerCycle)} onChange={(value) => setForm({ ...form, maxMessagesPerCycle: parseNumber360(value) })} />
            <div className="md:col-span-2 xl:col-span-4"><LiquidButton type="submit" size="lg">Salvar configurações</LiquidButton></div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return null;
}

export function Inteligencia360ModulePage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const slug = (section ?? "ticket-medio") as ModuleSlug;
  const module = moduleBySlug[slug] ?? moduleBySlug["ticket-medio"];
  const { state, persist } = useInteligenciaState();
  const Icon = module.icon;

  if (!moduleBySlug[slug]) {
    navigate(moduleRoutes360.ticket, { replace: true });
  }

  return (
    <SectionShell
      eyebrow="Módulo operacional"
      title={module.title}
      description={module.description}
      actions={
        <>
          <Button asChild variant="outline">
            <Link to={moduleRoutes360.dashboard}>Dashboard 360</Link>
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => copyText(generateWeeklyKickoffBrief(state))}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar resumo
          </Button>
        </>
      }
    >
      <ModuleNav active={module.slug} />
      <Card className="border-brand-dourado/35 bg-brand-creme/35 shadow-none">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-musgo text-brand-papel">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-brand-oliva">Fonte da verdade</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-brand-tinta">{module.source}</p>
          </div>
        </CardContent>
      </Card>
      <SimpleModuleForms slug={module.slug} state={state} persist={persist} />
    </SectionShell>
  );
}
