import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCopy,
  Filter,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  applyMessageTemplate,
  canUserAccessTask,
  cargoToCrmRole,
  contactDisplayName,
  createFollowUpTask,
  crmModuleRoutes,
  crmRoleLabels,
  crmSummary,
  formatCrmDateTime,
  isTaskOverdue,
  priorityLabels,
  taskEffectiveStatus,
  taskResultLabels,
  taskStatusLabels,
  taskTypeLabels,
  whatsappUrl,
  completeCrmTask,
  type CrmPriority,
  type CrmTask,
  type CrmTaskResult,
  type CrmTaskStatus,
  type CrmTaskType,
} from "./crmData";
import { useCrmState } from "./useCrmState";

type TaskTab = "hoje" | "atrasadas" | "proximos" | "concluidas" | "todas";

const tabLabels: Record<TaskTab, string> = {
  hoje: "Hoje",
  atrasadas: "Atrasadas",
  proximos: "Próximos 7 dias",
  concluidas: "Concluídas",
  todas: "Todas",
};

const resultOptions: CrmTaskResult[] = ["SENT", "RESPONDED", "NO_RESPONSE", "SCHEDULED", "RESCHEDULED", "SOLD", "NOT_SOLD", "NEEDS_MANAGER", "OTHER"];

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function priorityTone(priority: CrmPriority) {
  if (priority === "CRITICAL") return "bg-red-100 text-red-800 ring-1 ring-red-200";
  if (priority === "HIGH") return "bg-brand-creme text-brand-tinta ring-1 ring-brand-dourado/40";
  if (priority === "MEDIUM") return "bg-white/60 text-brand-musgo ring-1 ring-brand-oliva/20";
  return "bg-white/45 text-muted-foreground";
}

function statusTone(status: CrmTaskStatus) {
  if (status === "DONE") return "bg-emerald-100 text-emerald-800";
  if (status === "OVERDUE") return "bg-red-100 text-red-800";
  if (status === "IN_PROGRESS") return "bg-brand-creme text-brand-tinta";
  return "bg-white/55 text-brand-musgo";
}

function roleFocus(role: string | null) {
  if (role === "ENFERMAGEM") return "Acompanhar pacientes ativos, pós-aplicação e mensagens de 14 dias.";
  if (role === "CONCIERGE") return "Acolher D+1, pedir feedback e proteger a experiência premium.";
  if (role === "RECEPCAO") return "Agendar, confirmar, cobrar exames e deixar contratos fluindo.";
  if (role === "FINANCEIRO") return "Resolver pendências de recebíveis, promessas e comprovantes.";
  if (role === "MEDICO") return "Entrar nos casos que não fecharam e destravar objeções clínicas-relacionais.";
  if (role === "SDR_LEADS" || role === "COMERCIAL_VENDEDOR") return "Aquecer leads, registrar objeções e nunca deixar negociação sem próxima ação.";
  return "Ver gargalos, atrasos e execução por responsável.";
}

function useFilteredTasks(tasks: CrmTask[], tab: TaskTab, query: string, type: string, priority: string) {
  return useMemo(() => {
    const today = startOfToday();
    const seven = new Date(today);
    seven.setDate(today.getDate() + 7);
    const normalized = query.trim().toLowerCase();

    return tasks
      .filter((task) => {
        const due = new Date(task.dueAt);
        if (tab === "hoje") return !["DONE", "CANCELED", "SKIPPED"].includes(task.status) && due >= today && due <= endOfDay(today);
        if (tab === "atrasadas") return isTaskOverdue(task);
        if (tab === "proximos") return !["DONE", "CANCELED", "SKIPPED"].includes(task.status) && due > endOfDay(today) && due <= endOfDay(seven);
        if (tab === "concluidas") return task.status === "DONE";
        return true;
      })
      .filter((task) => (type ? task.taskType === type : true))
      .filter((task) => (priority ? task.priority === priority : true))
      .filter((task) => {
        if (!normalized) return true;
        return `${task.title} ${task.description} ${task.assignedToRole}`.toLowerCase().includes(normalized);
      })
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [priority, query, tab, tasks, type]);
}

export function CrmTasksPage() {
  const { pessoa } = useAuth();
  const { state, persist, reset, syncMode } = useCrmState();
  const role = cargoToCrmRole(pessoa?.cargo);
  const summary = crmSummary(state, pessoa);
  const visibleTasks = state.tasks.filter((task) => !pessoa || canUserAccessTask(pessoa, task));
  const [tab, setTab] = useState<TaskTab>("hoje");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [result, setResult] = useState<CrmTaskResult>("SENT");
  const [notes, setNotes] = useState("");
  const tasks = useFilteredTasks(visibleTasks, tab, query, type, priority);

  const contactsById = useMemo(() => new Map(state.contacts.map((contact) => [contact.id, contact])), [state.contacts]);
  const templatesById = useMemo(() => new Map(state.messageTemplates.map((template) => [template.id, template])), [state.messageTemplates]);
  const stepsById = useMemo(() => new Map(state.cadenceSteps.map((step) => [step.id, step])), [state.cadenceSteps]);
  const selectedTask = state.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedContact = selectedTask ? contactsById.get(selectedTask.contactId) : null;

  function messageForTask(task: CrmTask) {
    const contact = contactsById.get(task.contactId);
    const step = stepsById.get(task.cadenceStepId);
    const template = step ? templatesById.get(step.messageTemplateId) : undefined;
    return contact && template ? applyMessageTemplate(template, contact) : "";
  }

  function copyMessage(task: CrmTask) {
    const text = messageForTask(task) || task.description;
    void navigator.clipboard?.writeText(text);
  }

  function openWhatsapp(task: CrmTask) {
    const contact = contactsById.get(task.contactId);
    if (!contact) return;
    const url = whatsappUrl(contact, messageForTask(task));
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function completeSelected() {
    if (!selectedTask) return;
    persist((current) => completeCrmTask(current, selectedTask.id, { actorId: pessoa?.id ?? "preview", result, resultNotes: notes }));
    setSelectedTaskId("");
    setNotes("");
    setResult("SENT");
  }

  function createNextTask(task: CrmTask) {
    persist((current) => createFollowUpTask(current, task.id, pessoa?.id ?? "preview"));
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="gold">CRM Bratan</Badge>
            <h1 className="mt-3 text-4xl leading-tight text-brand-musgo sm:text-5xl">Minhas tarefas</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {role ? `${crmRoleLabels[role]}: ${roleFocus(role)}` : "Seu dia operacional com dados conectados ao Kanban, cadências e 360."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to={crmModuleRoutes.deals}>
                Kanban <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <LiquidButton type="button" size="sm" onClick={reset}>
              <RefreshCw className="h-4 w-4" />
              Dados demo
            </LiquidButton>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Hoje", summary.todayTasks.length, "Execução do dia"],
            ["Atrasadas", summary.overdueTasks.length, "Gargalos reais"],
            ["Próximas", summary.nextSeven.length, "7 dias"],
            ["Negociações", summary.openDeals.length, "Abertas"],
            ["Fadiga", summary.fatigueContacts.length, "Revisar toque"],
          ].map(([label, value, detail]) => (
            <div key={String(label)} className="rounded-lg border border-brand-oliva/14 bg-white/58 p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
              <p className="mt-1 text-3xl font-bold text-brand-musgo">{value}</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </motion.section>

      <section className="rounded-lg border border-brand-oliva/15 bg-white/45 p-3 shadow-sm backdrop-blur-xl">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(tabLabels) as TaskTab[]).map((item) => (
            <Button key={item} type="button" variant={tab === item ? "default" : "outline"} size="sm" onClick={() => setTab(item)}>
              {tabLabels[item]}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[1.4fr_1fr_1fr]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Buscar tarefa, responsável ou etapa" />
          </label>
          <label className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select value={type} onChange={(event) => setType(event.target.value)} className="h-12 w-full rounded-md border border-input bg-white/72 pl-9 pr-3 text-sm shadow-sm backdrop-blur-xl">
              <option value="">Todos os tipos</option>
              {(Object.keys(taskTypeLabels) as CrmTaskType[]).map((item) => (
                <option key={item} value={item}>{taskTypeLabels[item]}</option>
              ))}
            </select>
          </label>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className="h-12 w-full rounded-md border border-input bg-white/72 px-3 text-sm shadow-sm backdrop-blur-xl">
            <option value="">Todas as prioridades</option>
            {(Object.keys(priorityLabels) as CrmPriority[]).map((item) => (
              <option key={item} value={item}>{priorityLabels[item]}</option>
            ))}
          </select>
        </div>
      </section>

      {selectedTask && selectedContact ? (
        <Card className="border-brand-dourado/40 bg-brand-creme/72">
          <CardHeader>
            <CardTitle>Registrar resposta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
              <div>
                <p className="text-sm font-semibold text-brand-musgo">{selectedTask.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{contactDisplayName(selectedContact)} - {formatCrmDateTime(selectedTask.dueAt)}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Resultado</Label>
                  <select value={result} onChange={(event) => setResult(event.target.value as CrmTaskResult)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/80 px-3 text-sm">
                    {resultOptions.map((item) => <option key={item} value={item}>{taskResultLabels[item]}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Observação</Label>
                  <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Resumo curto" />
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={completeSelected}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Salvar e concluir
              </Button>
              <Button type="button" variant="outline" onClick={() => setSelectedTaskId("")}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {tasks.length ? (
          tasks.map((task, index) => {
            const contact = contactsById.get(task.contactId);
            const effectiveStatus = taskEffectiveStatus(task);
            const message = messageForTask(task);

            return (
              <motion.article
                key={task.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(index * 0.025, 0.2) }}
                className="rounded-lg border border-brand-oliva/15 bg-white/70 p-4 shadow-sm backdrop-blur-xl"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={statusTone(effectiveStatus)}>{taskStatusLabels[effectiveStatus]}</Badge>
                      <Badge className={priorityTone(task.priority)}>{priorityLabels[task.priority]}</Badge>
                      <Badge variant="muted">{taskTypeLabels[task.taskType]}</Badge>
                      <Badge variant="outline">{crmRoleLabels[task.assignedToRole]}</Badge>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-brand-musgo">{task.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.description}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      <span className="inline-flex items-center gap-1 text-brand-tinta">
                        <UserRound className="h-4 w-4" />
                        {contactDisplayName(contact)}
                      </span>
                      <span className={cn("inline-flex items-center gap-1", effectiveStatus === "OVERDUE" ? "text-red-700" : "text-muted-foreground")}>
                        <CalendarClock className="h-4 w-4" />
                        {formatCrmDateTime(task.dueAt)}
                      </span>
                    </div>
                    {message ? (
                      <p className="mt-3 rounded-lg border border-brand-oliva/12 bg-brand-papel/70 p-3 text-sm leading-6 text-brand-tinta">{message}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:w-72 lg:grid-cols-1">
                    <Button asChild variant="outline" size="sm">
                      <Link to={crmModuleRoutes.contact(task.contactId)}>
                        Ver perfil <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => copyMessage(task)}>
                      <ClipboardCopy className="mr-2 h-4 w-4" />
                      Copiar mensagem
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => openWhatsapp(task)}>
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Abrir WhatsApp
                    </Button>
                    <Button type="button" size="sm" onClick={() => setSelectedTaskId(task.id)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Registrar resposta
                    </Button>
                    <Button type="button" variant="subtle" size="sm" onClick={() => createNextTask(task)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Próxima tarefa
                    </Button>
                  </div>
                </div>
              </motion.article>
            );
          })
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-brand-musgo" />
              <p className="mt-3 font-semibold text-brand-musgo">Nada nesta visão.</p>
              <p className="mt-1 text-sm text-muted-foreground">Quando o Kanban ou as cadências gerarem novas ações, elas aparecem aqui automaticamente.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">Sincronização: {syncMode}. O Dashboard 360 recebe os dados derivados, sem preenchimento duplicado.</p>
    </div>
  );
}
