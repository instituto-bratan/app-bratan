import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarClock,
  CircleDollarSign,
  FileSignature,
  HeartPulse,
  History,
  MessageCircle,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { loadInteligencia360State, money360, stageLabels, touchTypeLabels } from "@/features/inteligencia360/inteligencia360Data";
import {
  canUserAccessContact,
  canUserSeeFinancialValues,
  canUserSeeSensitiveDetails,
  checkContactFatigue,
  contactDisplayName,
  crmModuleRoutes,
  dealStageLabels,
  formatCrmDateTime,
  lifecycleLabels,
  moneyCrm,
  taskStatusLabels,
  taskTypeLabels,
  whatsappUrl,
} from "./crmData";
import { useCrmState } from "./useCrmState";

type ProfileTab = "resumo" | "timeline" | "tarefas" | "cadencias" | "comercial" | "jornada" | "experiencia" | "recebiveis" | "contratos";

const tabLabels: Record<ProfileTab, string> = {
  resumo: "Resumo",
  timeline: "Linha do tempo",
  tarefas: "Tarefas",
  cadencias: "Cadências",
  comercial: "Comercial",
  jornada: "Jornada",
  experiencia: "Experiência",
  recebiveis: "Recebíveis",
  contratos: "Contratos",
};

function InfoItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-brand-oliva/12 bg-white/55 p-3">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-brand-musgo">{value || "Não informado"}</p>
    </div>
  );
}

function statusDot(tone: "ok" | "warn" | "danger") {
  return tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-brand-dourado" : "bg-red-500";
}

export function CrmContactProfilePage() {
  const { id = "" } = useParams();
  const { pessoa } = useAuth();
  const { state } = useCrmState();
  const [tab, setTab] = useState<ProfileTab>("resumo");
  const inteligencia = useMemo(() => loadInteligencia360State(), []);
  const contact = state.contacts.find((item) => item.id === id);
  const canAccess = contact ? canUserAccessContact(pessoa, contact) : false;
  const canSeeFinancial = canUserSeeFinancialValues(pessoa?.cargo);
  const canSeeSensitive = canUserSeeSensitiveDetails(pessoa?.cargo);

  const contactTasks = state.tasks.filter((task) => task.contactId === id);
  const contactDeals = state.deals.filter((deal) => deal.contactId === id);
  const contactTouchpoints = state.touchpoints.filter((touch) => touch.contactId === id);
  const contactEnrollments = state.cadenceEnrollments.filter((enrollment) => enrollment.contactId === id);
  const contactTimeline = state.timelineEvents.filter((event) => event.contactId === id);
  const journeys = inteligencia.journeys.filter((journey) => journey.patientReference === id);
  const experiences = inteligencia.experiences.filter((experience) => experience.patientReference === id);
  const receivables = inteligencia.receivables.filter((receivable) => receivable.patientReference === id);
  const relationshipTouchpoints = inteligencia.touchpoints.filter((touchpoint) => touchpoint.patientReference === id);
  const fatigue = contact ? checkContactFatigue(state, contact.id) : null;
  const nextTask = contactTasks
    .filter((task) => !["DONE", "CANCELED", "SKIPPED"].includes(task.status))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];
  const lastTouch = contactTouchpoints
    .slice()
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];



  const mergedTimeline = useMemo(() => {
    const crmEvents = contactTimeline.map((event) => ({
      id: event.id,
      title: event.eventTitle,
      description: event.eventDescription,
      date: event.createdAt,
      source: event.sourceModule,
    }));
    const taskEvents = contactTasks.map((task) => ({
      id: `task-${task.id}`,
      title: `Tarefa: ${task.title}`,
      description: `${taskTypeLabels[task.taskType]} - ${taskStatusLabels[task.status]}`,
      date: task.createdAt,
      source: "CRM",
    }));
    const touchEvents = relationshipTouchpoints.map((touch) => ({
      id: `rel-${touch.id}`,
      title: touchTypeLabels[touch.touchType],
      description: touch.responseSummary || touch.manualMessageText || touch.status,
      date: touch.createdAt,
      source: "Réguas",
    }));
    const receivableEvents = receivables.map((receivable) => ({
      id: `recv-${receivable.id}`,
      title: "Recebível gerado",
      description: `${money360(receivable.totalAmount)} - ${receivable.status}`,
      date: receivable.createdAt,
      source: "Recebíveis",
    }));
    return [...crmEvents, ...taskEvents, ...touchEvents, ...receivableEvents].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [contactTasks, contactTimeline, receivables, relationshipTouchpoints]);

  if (!contact) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-semibold text-brand-musgo">Contato não encontrado.</p>
          <Button asChild className="mt-4">
            <Link to={crmModuleRoutes.tasks}>Voltar ao CRM</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canAccess) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-brand-musgo" />
          <p className="mt-3 font-semibold text-brand-musgo">Perfil restrito ao seu fluxo.</p>
          <p className="mt-1 text-sm text-muted-foreground">Você ainda vê suas tarefas, mas este perfil tem detalhes de outro setor.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to={crmModuleRoutes.tasks}><ArrowLeft className="mr-2 h-4 w-4" /> CRM</Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="gold">Perfil 360</Badge>
              <Badge variant="outline">{contact.contactType}</Badge>
              <Badge variant="muted">{lifecycleLabels[contact.lifecycleStage]}</Badge>
              {fatigue?.risk ? <Badge className="bg-red-100 text-red-800">Risco de fadiga</Badge> : null}
            </div>
            <h1 className="mt-3 flex items-center gap-2 text-4xl leading-tight text-brand-musgo sm:text-5xl">
              {contactDisplayName(contact)}
              <InfoTip title="O que é o Perfil 360?">
                A ficha completa do contato em um só lugar: dados, negociações, tarefas, cadências ativas e a linha do tempo de
                tudo que já aconteceu — cada evento mostra de onde veio. É a fonte de verdade antes de qualquer contato com o
                paciente.
              </InfoTip>
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Perfil comercial e relacional. Não é prontuário médico; reúne execução, jornada, tarefas e alertas sem duplicar cadastro.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={whatsappUrl(contact)} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </a>
            </Button>
            <Button asChild>
              <Link to={crmModuleRoutes.deals}>Ver Kanban</Link>
            </Button>
          </div>
        </div>
      </motion.section>

      <div className="mobile-scrollbar-none flex gap-2 overflow-x-auto rounded-lg border border-brand-oliva/15 bg-white/45 p-2 backdrop-blur-xl">
        {(Object.keys(tabLabels) as ProfileTab[])
          .filter((item) => (item === "recebiveis" ? canSeeFinancial : item === "experiencia" || item === "jornada" ? canSeeSensitive : true))
          .map((item) => (
            <Button key={item} type="button" variant={tab === item ? "default" : "outline"} size="sm" onClick={() => setTab(item)}>
              {tabLabels[item]}
            </Button>
          ))}
      </div>

      {tab === "resumo" ? (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-5 w-5" />
                Resumo do contato
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <InfoItem label="WhatsApp" value={contact.whatsapp || contact.phone} />
                <InfoItem label="E-mail" value={contact.email} />
                <InfoItem label="Origem" value={contact.sourceChannel} />
                <InfoItem label="Temperatura" value={contact.leadTemperature} />
                <InfoItem label="Persona" value={contact.personaFit} />
                <InfoItem label="Responsável" value={contact.ownerUserId} />
                <InfoItem label="Dor principal" value={contact.mainPain} />
                <InfoItem label="Objetivo" value={contact.mainGoal} />
                <InfoItem label="Último toque" value={lastTouch ? formatCrmDateTime(lastTouch.sentAt) : "Sem toque"} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Próxima ação</CardTitle>
              </CardHeader>
              <CardContent>
                {nextTask ? (
                  <div>
                    <p className="font-semibold text-brand-musgo">{nextTask.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatCrmDateTime(nextTask.dueAt)} - {taskTypeLabels[nextTask.taskType]}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma tarefa aberta. O contato está sem próximo dono.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Antifadiga</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-3 w-3 rounded-full ${statusDot(fatigue?.risk ? "danger" : "ok")}`} />
                  <div>
                    <p className="font-semibold text-brand-musgo">{fatigue?.risk ? "Revisar antes de tocar" : "Contato saudável"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{fatigue?.message}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "timeline" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {mergedTimeline.map((event) => (
                <div key={event.id} className="rounded-lg border border-brand-oliva/12 bg-white/58 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-brand-musgo">{event.title}</p>
                    <Badge variant="outline">{event.source}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatCrmDateTime(event.date)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "tarefas" ? (
        <Card>
          <CardHeader>
            <CardTitle>Tarefas do contato</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {contactTasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-brand-oliva/12 bg-white/58 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-brand-musgo">{task.title}</p>
                    <Badge variant="muted">{taskStatusLabels[task.status]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{taskTypeLabels[task.taskType]} - {formatCrmDateTime(task.dueAt)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "cadencias" ? (
        <Card>
          <CardHeader>
            <CardTitle>Cadências vinculadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {contactEnrollments.map((enrollment) => {
                const cadence = state.cadences.find((item) => item.id === enrollment.cadenceId);
                return (
                  <div key={enrollment.id} className="rounded-lg border border-brand-oliva/12 bg-white/58 p-3">
                    <p className="font-semibold text-brand-musgo">{cadence?.name ?? "Cadência"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{enrollment.status} - gatilho em {enrollment.triggerDate}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "comercial" ? (
        <div className="grid gap-3">
          {contactDeals.map((deal) => (
            <Card key={deal.id}>
              <CardHeader>
                <CardTitle>{deal.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoItem label="Etapa" value={dealStageLabels[deal.stage]} />
                  <InfoItem label="Valor potencial" value={canSeeFinancial ? moneyCrm(deal.estimatedValue) : "Restrito"} />
                  <InfoItem label="Vendido" value={canSeeFinancial ? moneyCrm(deal.soldAmount) : "Restrito"} />
                  <InfoItem label="Objeção" value={deal.mainObjection || "Sem objeção"} />
                  <InfoItem label="Origem" value={deal.sourceChannel} />
                  <InfoItem label="Status" value={deal.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "jornada" ? (
        <div className="grid gap-3">
          {journeys.length ? journeys.map((journey) => (
            <Card key={journey.id}>
              <CardHeader>
                <CardTitle>{stageLabels[journey.currentStage]}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoItem label="Plano" value={journey.treatmentPlanSummary} />
                  <InfoItem label="Contrato" value={journey.contractSigned ? "Assinado" : journey.contractSent ? "Enviado" : journey.contractCreated ? "Criado" : "Pendente"} />
                  <InfoItem label="Próximo retorno" value={journey.nextMedicalReturnDate || "Não definido"} />
                  <InfoItem label="Primeira dose" value={journey.firstDoseScheduled ? "Agendada" : "Pendente"} />
                  <InfoItem label="Bioimpedância" value={journey.firstBioimpedanceScheduled ? "Agendada" : "Pendente"} />
                  <InfoItem label="Exames" value={journey.nextExamDueDate || "Não definido"} />
                </div>
              </CardContent>
            </Card>
          )) : <p className="text-sm text-muted-foreground">Sem jornada consolidada ainda. Um fechamento no Kanban cria este resumo.</p>}
        </div>
      ) : null}

      {tab === "experiencia" ? (
        <div className="grid gap-3">
          {experiences.length ? experiences.map((experience) => (
            <Card key={experience.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><HeartPulse className="h-5 w-5" /> Experiência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-4">
                  <InfoItem label="NPS" value={experience.npsScore} />
                  <InfoItem label="Satisfação" value={experience.satisfactionScore} />
                  <InfoItem label="Google" value={experience.googleReviewDone ? "Feita" : experience.googleReviewRequested ? "Solicitada" : "Pendente"} />
                  <InfoItem label="Status" value={experience.status} />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{experience.feedbackText}</p>
              </CardContent>
            </Card>
          )) : <p className="text-sm text-muted-foreground">Sem feedback registrado.</p>}
        </div>
      ) : null}

      {tab === "recebiveis" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5" /> Recebíveis resumidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {receivables.map((receivable) => (
                <div key={receivable.id} className="rounded-lg border border-brand-oliva/12 bg-white/58 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-brand-musgo">{money360(receivable.totalAmount)} total</p>
                    <Badge variant="outline">{receivable.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Recebido {money360(receivable.receivedAmount)} - vencimento {receivable.dueDate}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "contratos" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5" /> Contratos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {journeys.map((journey) => (
                <div key={journey.id} className="rounded-lg border border-brand-oliva/12 bg-white/58 p-3">
                  <p className="font-semibold text-brand-musgo">{journey.contractSigned ? "Contrato assinado" : journey.contractSent ? "Contrato enviado" : journey.contractCreated ? "Contrato criado" : "Contrato pendente"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{journey.notes || "Status vem da Jornada/Administrativo."}</p>
                </div>
              ))}
              {!journeys.length ? (
                <div className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/45 p-4 text-sm text-muted-foreground">
                  Contrato será criado automaticamente quando a venda fechar no Kanban.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
          <CalendarClock className="h-5 w-5 text-brand-musgo" />
          <p className="mt-2 text-sm font-semibold text-brand-musgo">Tarefas abertas</p>
          <p className="text-2xl font-bold text-brand-musgo">{contactTasks.filter((task) => !["DONE", "CANCELED", "SKIPPED"].includes(task.status)).length}</p>
        </div>
        <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
          <MessageCircle className="h-5 w-5 text-brand-musgo" />
          <p className="mt-2 text-sm font-semibold text-brand-musgo">Toques registrados</p>
          <p className="text-2xl font-bold text-brand-musgo">{contactTouchpoints.length + relationshipTouchpoints.length}</p>
        </div>
        <div className="rounded-lg border border-brand-oliva/14 bg-white/55 p-4">
          <History className="h-5 w-5 text-brand-musgo" />
          <p className="mt-2 text-sm font-semibold text-brand-musgo">Eventos</p>
          <p className="text-2xl font-bold text-brand-musgo">{mergedTimeline.length}</p>
        </div>
      </div>
    </div>
  );
}
