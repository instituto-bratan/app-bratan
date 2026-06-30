import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ClipboardCopy,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import {
  applyMessageTemplate,
  canUserAccessCadence,
  canUserAccessContact,
  cadenceTypeLabels,
  contactDisplayName,
  crmModuleRoutes,
  crmRoleLabels,
  enrollContactInCadence,
  generateCadenceTasks,
  taskTypeLabels,
  type CrmCadence,
  type CrmCadenceStatus,
} from "./crmData";
import { useCrmState } from "./useCrmState";

function statusTone(status: CrmCadenceStatus) {
  if (status === "ACTIVE") return "bg-emerald-100 text-emerald-800";
  if (status === "PAUSED") return "bg-brand-creme text-brand-tinta";
  if (status === "CANCELED") return "bg-red-100 text-red-800";
  return "bg-white/55 text-brand-musgo";
}

export function CrmCadencesPage() {
  const { pessoa } = useAuth();
  const { state, persist } = useCrmState();
  const [cadenceId, setCadenceId] = useState("cad-cold-lead");
  const [contactId, setContactId] = useState(state.contacts[0]?.id ?? "");
  const [dealId, setDealId] = useState("");
  const [feedback, setFeedback] = useState("");

  const visibleCadences = state.cadences.filter((cadence) => !pessoa || canUserAccessCadence(pessoa, cadence));
  const visibleContacts = state.contacts.filter((contact) => !pessoa || canUserAccessContact(pessoa, contact));
  const stepsByCadence = useMemo(() => {
    return new Map(
      state.cadences.map((cadence) => [
        cadence.id,
        state.cadenceSteps.filter((step) => step.cadenceId === cadence.id).sort((a, b) => a.stepOrder - b.stepOrder),
      ]),
    );
  }, [state.cadenceSteps, state.cadences]);
  const templatesById = useMemo(() => new Map(state.messageTemplates.map((template) => [template.id, template])), [state.messageTemplates]);
  const dealsForContact = state.deals.filter((deal) => deal.contactId === contactId);
  const selectedContact = state.contacts.find((contact) => contact.id === contactId);

  function handleEnroll(event: FormEvent) {
    event.preventDefault();
    if (!selectedContact || !cadenceId) return;
    const cadence = state.cadences.find((item) => item.id === cadenceId);
    if (!cadence) return;
    persist((current) =>
      enrollContactInCadence(current, {
        cadenceId,
        contactId: selectedContact.id,
        dealId: dealId || dealsForContact[0]?.id || "",
        triggerSource: "manual sprint 1",
        triggerDate: new Date().toISOString().slice(0, 10),
        ownerUserId: pessoa?.id ?? cadence.defaultOwnerRole.toLowerCase(),
        ownerRole: cadence.defaultOwnerRole,
      }),
    );
    setFeedback("Contato inscrito. As tarefas aparecem em Minhas Tarefas sem novo preenchimento.");
  }

  function updateEnrollment(id: string, status: CrmCadenceStatus) {
    persist((current) => ({
      ...current,
      cadenceEnrollments: current.cadenceEnrollments.map((enrollment) =>
        enrollment.id === id
          ? {
              ...enrollment,
              status,
              updatedAt: new Date().toISOString(),
              completedAt: status === "COMPLETED" ? new Date().toISOString() : enrollment.completedAt,
            }
          : enrollment,
      ),
    }));
  }

  function copyTemplate(cadence: CrmCadence) {
    const step = stepsByCadence.get(cadence.id)?.[0];
    const template = step ? templatesById.get(step.messageTemplateId) : undefined;
    const contact = selectedContact ?? visibleContacts[0];
    if (!template || !contact) return;
    void navigator.clipboard?.writeText(applyMessageTemplate(template, contact));
    setFeedback("Mensagem modelo copiada.");
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="gold">CRM Bratan</Badge>
            <h1 className="mt-3 text-4xl leading-tight text-brand-musgo sm:text-5xl">Cadências por função</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Mensagens sugeridas, tarefas geradas e antifadiga. Nada é enviado automaticamente nesta fase.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to={crmModuleRoutes.tasks}>Minhas tarefas <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <LiquidButton type="button" size="sm" onClick={() => persist((current) => generateCadenceTasks(current))}>
              <RefreshCw className="h-4 w-4" />
              Gerar tarefas
            </LiquidButton>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
        <Card>
          <CardHeader>
            <CardTitle>Inscrever contato</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={handleEnroll}>
              <div>
                <Label>Contato</Label>
                <select value={contactId} onChange={(event) => { setContactId(event.target.value); setDealId(""); }} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  {visibleContacts.map((contact) => <option key={contact.id} value={contact.id}>{contactDisplayName(contact)}</option>)}
                </select>
              </div>
              <div>
                <Label>Negociação vinculada</Label>
                <select value={dealId} onChange={(event) => setDealId(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  <option value="">Sem negociação específica</option>
                  {dealsForContact.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}
                </select>
              </div>
              <div>
                <Label>Cadência</Label>
                <select value={cadenceId} onChange={(event) => setCadenceId(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  {visibleCadences.map((cadence) => <option key={cadence.id} value={cadence.id}>{cadence.name}</option>)}
                </select>
              </div>
              <Button type="submit">
                <PlayCircle className="mr-2 h-4 w-4" />
                Inscrever e criar tarefas
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-brand-dourado/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Governança premium
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-brand-papel/70 p-3">
                <p className="font-semibold text-brand-musgo">Sem envio automático</p>
                <p className="mt-1 text-sm text-muted-foreground">O app sugere, copia e abre WhatsApp. Humano aprova.</p>
              </div>
              <div className="rounded-lg bg-brand-papel/70 p-3">
                <p className="font-semibold text-brand-musgo">Antifadiga</p>
                <p className="mt-1 text-sm text-muted-foreground">Muitos toques em curto período aparecem no Perfil 360.</p>
              </div>
              <div className="rounded-lg bg-brand-papel/70 p-3">
                <p className="font-semibold text-brand-musgo">Fonte única</p>
                <p className="mt-1 text-sm text-muted-foreground">Cadência gera tarefa; tarefa gera histórico; 360 consolida.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {feedback ? (
        <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/70 p-3 text-sm text-brand-tinta">{feedback}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleCadences.map((cadence) => {
          const steps = stepsByCadence.get(cadence.id) ?? [];
          const enrollments = state.cadenceEnrollments.filter((enrollment) => enrollment.cadenceId === cadence.id);
          return (
            <Card key={cadence.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{cadence.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{cadence.description}</p>
                  </div>
                  <Badge variant="outline">{crmRoleLabels[cadence.defaultOwnerRole]}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge variant="gold">{cadenceTypeLabels[cadence.cadenceType]}</Badge>
                  <Button type="button" variant="outline" size="sm" onClick={() => copyTemplate(cadence)}>
                    <ClipboardCopy className="mr-2 h-4 w-4" />
                    Copiar 1ª mensagem
                  </Button>
                </div>

                <div className="grid gap-2">
                  {steps.map((step) => {
                    const template = templatesById.get(step.messageTemplateId);
                    return (
                      <div key={step.id} className="rounded-lg border border-brand-oliva/12 bg-white/58 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-brand-musgo">{step.stepOrder}. {step.name}</p>
                          <Badge variant="muted">{taskTypeLabels[step.taskType]}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{template?.body}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-brand-oliva/12 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Inscrições ativas</p>
                  <div className="grid gap-2">
                    {enrollments.length ? enrollments.map((enrollment) => {
                      const contact = state.contacts.find((item) => item.id === enrollment.contactId);
                      return (
                        <div key={enrollment.id} className="rounded-lg bg-white/50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Link to={crmModuleRoutes.contact(enrollment.contactId)} className="font-semibold text-brand-musgo hover:underline">
                              {contactDisplayName(contact)}
                            </Link>
                            <Badge className={statusTone(enrollment.status)}>{enrollment.status}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">Gatilho: {enrollment.triggerDate} - {enrollment.triggerSource}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => updateEnrollment(enrollment.id, "PAUSED")}>
                              <PauseCircle className="mr-2 h-4 w-4" />
                              Pausar
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => updateEnrollment(enrollment.id, "ACTIVE")}>
                              <PlayCircle className="mr-2 h-4 w-4" />
                              Ativar
                            </Button>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-sm text-muted-foreground">
                        Nenhum contato inscrito nesta cadência.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
