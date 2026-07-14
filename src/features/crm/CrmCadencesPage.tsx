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
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import {
  applyMessageTemplate,
  canUserAccessCadence,
  canUserAccessContact,
  cadenceNeedsEventDate,
  cadenceTypeLabels,
  contactDisplayName,
  crmModuleRoutes,
  crmRoleLabels,
  dealStageLabels,
  enrollContactInCadence,
  findOrCreateCrmContact,
  generateCadenceTasks,
  moneyCrm,
  taskTypeLabels,
  type CrmCadence,
  type CrmCadenceStatus,
  cargoToCrmRole,
  roleRuleExplainers,
} from "./crmData";
import { todayISO } from "@/lib/localStore";
import { CrmSyncBanner } from "./CrmSyncBanner";
import { useCrmState } from "./useCrmState";

function statusTone(status: CrmCadenceStatus) {
  if (status === "ACTIVE") return "bg-emerald-100 text-emerald-800";
  if (status === "PAUSED") return "bg-brand-creme text-brand-tinta";
  if (status === "CANCELED") return "bg-red-100 text-red-800";
  return "bg-white/55 text-brand-musgo";
}

export function CrmCadencesPage() {
  const { pessoa } = useAuth();
  const { state, persist, syncFailed, retrySync } = useCrmState();
  const [cadenceId, setCadenceId] = useState("cad-cold-lead");
  const [contactId, setContactId] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [dealId, setDealId] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [feedback, setFeedback] = useState("");

  const visibleCadences = state.cadences.filter((cadence) => !pessoa || canUserAccessCadence(pessoa, cadence));
  const visibleContacts = state.contacts.filter((contact) => !pessoa || canUserAccessContact(pessoa, contact));
  const contactSuggestions = useMemo(() => {
    const term = contactQuery.trim().toLowerCase();
    if (term.length < 2) return [];
    return visibleContacts
      .filter((contact) => contactDisplayName(contact).toLowerCase().includes(term))
      .slice(0, 8);
  }, [visibleContacts, contactQuery]);
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
  const needsEventDate = cadenceNeedsEventDate(state, cadenceId);
  const selectedContact = state.contacts.find((contact) => contact.id === contactId);

  async function enrollContact(contactIdToEnroll: string, displayName: string, createValues?: { fullName: string; phone: string }) {
    const cadence = state.cadences.find((item) => item.id === cadenceId);
    if (!cadence) return;
    const alreadyEnrolled = state.cadenceEnrollments.some(
      (enrollment) => enrollment.contactId === contactIdToEnroll && enrollment.cadenceId === cadenceId && enrollment.status === "ACTIVE",
    );
    if (alreadyEnrolled && !createValues) {
      setFeedback("Este contato já está inscrito nesta cadência.");
      return;
    }

    setFeedback("Inscrevendo…");
    let createdName = "";
    const saved = await persist((current) => {
      let next = current;
      let targetId = contactIdToEnroll;
      if (createValues) {
        // Pessoa nova direto da cadência: cria o contato (com deduplicação) e
        // inscreve na sequência — antes não existia caminho para gente nova aqui.
        const result = findOrCreateCrmContact(
          next,
          {
            fullName: createValues.fullName,
            phone: createValues.phone,
            whatsapp: createValues.phone,
            contactType: "LEAD",
            lifecycleStage: "COLD_LEAD",
            sourceChannel: "Cadência (inscrição manual)",
          },
          pessoa?.id ?? "sistema",
        );
        next = result.state;
        targetId = result.contact.id;
        createdName = contactDisplayName(result.contact);
      }
      return enrollContactInCadence(next, {
        cadenceId,
        contactId: targetId,
        dealId,
        triggerSource: "inscricao manual",
        triggerDate: needsEventDate ? eventDate : todayISO(),
        ownerUserId: pessoa?.id ?? cadence.defaultOwnerRole.toLowerCase(),
        ownerRole: cadence.defaultOwnerRole,
      });
    });

    const who = createdName || displayName;
    if (saved) {
      setFeedback(
        `${who} está na cadência "${cadence.name}": a negociação já aparece no Kanban Comercial e a primeira tarefa está em Minhas Tarefas (aba "Próximos 7 dias" quando o toque é D+1).`,
      );
      setContactQuery("");
      setContactId("");
      setDealId("");
      setNewPhone("");
    } else {
      setFeedback(
        `${who} foi inscrito(a) neste aparelho, mas NÃO sincronizou com o Supabase. Confira a internet e toque em "Tentar sincronizar" no aviso acima antes de sair desta tela.`,
      );
    }
  }

  function handleEnroll(event: FormEvent) {
    event.preventDefault();
    if (!cadenceId) return;
    if (needsEventDate && !eventDate) {
      setFeedback("Informe a data da consulta de retorno: os lembretes desta cadência contam para trás dela.");
      return;
    }
    if (selectedContact) {
      void enrollContact(selectedContact.id, contactDisplayName(selectedContact));
      return;
    }
    const typedName = contactQuery.trim();
    if (typedName.length < 3) {
      setFeedback("Busque um contato existente ou digite o nome completo da pessoa nova.");
      return;
    }
    void enrollContact("", typedName, { fullName: typedName, phone: newPhone.trim() });
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
        {(() => {
          const roleExplainer = roleRuleExplainers[cargoToCrmRole(pessoa?.cargo) ?? "ADMINISTRATIVO"];
          if (!roleExplainer) return null;
          return (
            <div className="rounded-lg border border-brand-dourado/35 bg-brand-creme/55 px-4 py-3">
              <p className="text-sm font-bold text-brand-musgo">{roleExplainer.title}</p>
              <p className="mt-1 text-sm leading-6 text-brand-tinta">{roleExplainer.rule}</p>
            </div>
          );
        })()}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="gold">CRM Bratan</Badge>
            <h1 className="mt-3 flex items-center gap-2 text-4xl leading-tight text-brand-musgo sm:text-5xl">
              Cadências por função
              <InfoTip title="O que são cadências?">
                São as réguas de relacionamento do Instituto em ação: sequências de toques (D+1 do concierge, enfermeira a cada
                14 dias, resgates D1·D5·D7·D60) que geram tarefas automaticamente para a pessoa certa, na hora certa. Você
                aprova e envia a mensagem — o app nunca dispara sozinho.
              </InfoTip>
            </h1>
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

      <CrmSyncBanner failed={syncFailed} onRetry={retrySync} />

      <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
        <Card>
          <CardHeader>
            <CardTitle>Inscrever contato</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={handleEnroll}>
              <div className="relative">
                <Label>Contato</Label>
                <Input
                  value={contactQuery}
                  onChange={(event) => {
                    setContactQuery(event.target.value);
                    setContactId("");
                    setDealId("");
                  }}
                  placeholder="Digite o nome para buscar (a partir de 2 letras)"
                  autoComplete="off"
                  className="mt-1"
                />
                {contactSuggestions.length && !contactId ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-brand-oliva/18 bg-brand-papel shadow-calm">
                    {contactSuggestions.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm text-brand-tinta hover:bg-brand-creme/50"
                        onClick={() => {
                          setContactQuery(contactDisplayName(contact));
                          setContactId(contact.id);
                          setDealId("");
                        }}
                      >
                        {contactDisplayName(contact)}
                        <span className="ml-2 text-xs text-muted-foreground">{contact.lifecycleStage}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {contactQuery.trim().length >= 3 && !contactId && !contactSuggestions.length ? (
                  <div className="mt-2 rounded-lg border border-dashed border-brand-oliva/35 bg-brand-creme/40 p-3">
                    <p className="text-xs font-semibold text-brand-musgo">
                      Pessoa nova! Ao inscrever, o contato é criado, entra no Kanban Comercial e as tarefas nascem sozinhas.
                    </p>
                    <Label className="mt-2 block text-xs">WhatsApp (opcional, ajuda a evitar duplicados)</Label>
                    <Input
                      value={newPhone}
                      onChange={(event) => setNewPhone(event.target.value)}
                      placeholder="(11) 9…"
                      className="mt-1 h-9"
                    />
                  </div>
                ) : null}
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  Negociação vinculada
                  <InfoTip title="De onde vêm as negociações?">
                    As negociações nascem no Kanban de Vendas — pelo botão "Novo lead" ou direto no card do lead. Aqui você só
                    vincula a cadência a uma negociação já existente, para o histórico ficar amarrado no lugar certo.
                  </InfoTip>
                </Label>
                <select value={dealId} onChange={(event) => setDealId(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  <option value="">Sem negociação específica</option>
                  {dealsForContact.map((deal) => {
                    const dealValue = deal.soldAmount || deal.estimatedValue;
                    return (
                      <option key={deal.id} value={deal.id}>
                        {deal.title} · {dealStageLabels[deal.stage]}{dealValue ? ` · ${moneyCrm(dealValue)}` : ""}
                      </option>
                    );
                  })}
                </select>
                {selectedContact && !dealsForContact.length ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Este contato ainda não tem negociação — sem problema: ao inscrever, uma negociação nova é criada em
                    "Lead novo" no{" "}
                    <Link to={crmModuleRoutes.deals} className="font-semibold text-brand-musgo underline">
                      Kanban de Vendas
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Cadência</Label>
                <select value={cadenceId} onChange={(event) => setCadenceId(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  {visibleCadences.map((cadence) => <option key={cadence.id} value={cadence.id}>{cadence.name}</option>)}
                </select>
              </div>
              {needsEventDate ? (
                <div>
                  <Label className="flex items-center gap-1">
                    Data da consulta de retorno
                    <InfoTip title="Por que pedir a data?">
                      Esta cadência conta PARA TRÁS da consulta: exames 15 e 7 dias antes, confirmação 3 dias antes e
                      lembrete na véspera. Sem a data certa, os lembretes nasceriam atrasados.
                    </InfoTip>
                  </Label>
                  <Input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="mt-1" required />
                </div>
              ) : null}
              <Button type="submit">
                <PlayCircle className="mr-2 h-4 w-4" />
                {!contactId && contactQuery.trim().length >= 3 && !contactSuggestions.length
                  ? "Criar contato e inscrever"
                  : "Inscrever e criar tarefas"}
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
