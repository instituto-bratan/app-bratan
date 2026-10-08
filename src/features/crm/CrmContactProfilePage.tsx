import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CircleDollarSign,
  HeartPulse,
  History,
  MessageCircle,
  Pencil,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { Abas, BlocoFolha, BlocoSaber, Botao, Cabecalho, FraseDoFluxo, LinkSeta, botaoClasses } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import { Aviso, CampoSelecao, Etiqueta, Indicadores, Input, Label, RUBRICA, TITULO_SECAO } from "./comercialVisual";
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
  updateContactChannels,
} from "./crmData";
import { useCrmState } from "./useCrmState";
import { ConsentimentosDoContato } from "./ConsentimentosDoContato";
import { PortalDoPacienteCard } from "@/features/portal/PortalDoPacienteCard";
import { CpfDoPacienteCard } from "./CpfDoPacienteCard";
import { contactChannelsIssue, formatPhoneBR } from "./contactChannels";
import { AccessGate } from "@/components/access/AccessGate";
import { AplicacoesDoPacienteCard } from "@/features/estoque/AplicacoesDoPacienteCard";
import { canCrmBratan, canVerPortalPaciente } from "@/lib/access";

// Contratos saiu do app (decisão do Lucas, 22/07): não existe fluxo de
// contrato/SuperSign no CRM.
type ProfileTab = "resumo" | "timeline" | "tarefas" | "cadencias" | "comercial" | "jornada" | "experiencia" | "recebiveis";

const tabLabels: Record<ProfileTab, string> = {
  resumo: "Resumo",
  timeline: "Linha do tempo",
  tarefas: "Tarefas",
  cadencias: "Cadências",
  comercial: "Comercial",
  jornada: "Jornada",
  experiencia: "Experiência",
  recebiveis: "Recebíveis",
};

// Um dado do contato (08/10/2026, Papel & Musgo): rubrica 12/700 e o valor em
// tinta, num quadrinho saber — sem borda, sem branco translúcido.
function InfoItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-bloco bg-saber px-3 py-2.5">
      <dt className={RUBRICA}>{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold leading-5 text-tinta">{value || "Não informado"}</dd>
    </div>
  );
}

/** Linha das listas da ficha (linha do tempo, tarefas, cadências, recebíveis). */
const LINHA_DA_FICHA = "border-t border-fio px-5 py-3 max-md:px-4";

function statusDot(tone: "ok" | "warn" | "danger") {
  return tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-atencao" : "bg-erro";
}

function CrmContactProfilePageConteudo() {
  const { id = "" } = useParams();
  const { pessoa, session, isPreview } = useAuth();
  const useRemoteConsent = Boolean(pessoa && session && !isPreview);
  const { state, persist } = useCrmState();
  const [tab, setTab] = useState<ProfileTab>("resumo");
  // Edição do cadastro (29/07/2026): o perfil era 100% somente leitura, então
  // um paciente que entrou sem telefone (comanda, comprovante) não tinha onde
  // ganhar número depois — a cadência ficava sem para onde ligar.
  const [editando, setEditando] = useState(false);
  const [cadastro, setCadastro] = useState({ fullName: "", preferredName: "", phone: "", email: "", optIn: false, optInCanal: "WhatsApp" });
  const [cadastroFeedback, setCadastroFeedback] = useState("");
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

  const semContato = Boolean(contact && !contact.phone.trim() && !contact.whatsapp.trim() && !contact.email.trim());

  function abrirEdicao() {
    if (!contact) return;
    setCadastro({
      fullName: contact.fullName,
      preferredName: contact.preferredName,
      phone: formatPhoneBR(contact.whatsapp || contact.phone),
      email: contact.email,
      optIn: Boolean(contact.marketingOptInEm),
      optInCanal: contact.marketingOptInCanal || "WhatsApp",
    });
    setCadastroFeedback("");
    setEditando(true);
  }

  function salvarCadastro() {
    if (!contact) return;
    if (!cadastro.fullName.trim()) return setCadastroFeedback("O nome não pode ficar vazio.");
    const problema = contactChannelsIssue({ phone: cadastro.phone, email: cadastro.email });
    if (problema) return setCadastroFeedback(problema);
    const optInAtual = Boolean(contact.marketingOptInEm);
    const marketingOptIn = cadastro.optIn === optInAtual && (!cadastro.optIn || cadastro.optInCanal === (contact.marketingOptInCanal || "WhatsApp"))
      ? undefined
      : { em: cadastro.optIn ? (optInAtual ? contact.marketingOptInEm ?? new Date().toISOString() : new Date().toISOString()) : null, canal: cadastro.optInCanal };
    void persist((current) => updateContactChannels(current, contact.id, { ...cadastro, marketingOptIn }, pessoa?.id ?? "manual"));
    setEditando(false);
    setCadastroFeedback("");
  }



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
      <BlocoSaber className="mx-auto w-full max-w-3xl py-10 text-center font-sans">
        <p className="text-base font-bold text-tinta">Contato não encontrado.</p>
        <LinkSeta to={crmModuleRoutes.tasks} className="mt-4">
          Voltar ao CRM
        </LinkSeta>
      </BlocoSaber>
    );
  }

  if (!canAccess) {
    return (
      <BlocoSaber className="mx-auto w-full max-w-3xl py-10 text-center font-sans">
        <ShieldAlert className="mx-auto h-8 w-8 text-oliva" aria-hidden="true" />
        <p className="mt-3 text-base font-bold text-tinta">Perfil restrito ao seu fluxo.</p>
        <p className="mt-1 text-sm font-medium text-tinta-2">Você ainda vê suas tarefas, mas este perfil tem detalhes de outro setor.</p>
      </BlocoSaber>
    );
  }

  // CABEÇALHO (08/10/2026, redesenho etapa 3): o nome do paciente é o título da
  // página; a frase diz em que pé ele está (fase, próxima ação, fadiga) e as
  // seções da ficha viram abas logo abaixo. O que a ficha FAZ não mudou.
  const abasVisiveis = (Object.keys(tabLabels) as ProfileTab[]).filter((item) =>
    item === "recebiveis" ? canSeeFinancial : item === "experiencia" || item === "jornada" ? canSeeSensitive : true,
  );
  const tarefasAbertas = contactTasks.filter((task) => !["DONE", "CANCELED", "SKIPPED"].includes(task.status)).length;
  const fraseDoTopo = (
    <>
      <strong>{lifecycleLabels[contact.lifecycleStage]}.</strong>{" "}
      {nextTask ? (
        <>
          Próxima ação: <strong>{nextTask.title}</strong>, {formatCrmDateTime(nextTask.dueAt)}.
        </>
      ) : (
        "Sem próxima ação."
      )}
      {fatigue?.risk ? <span className="alerta"> Risco de fadiga: revise antes de tocar.</span> : null}
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 font-sans max-md:gap-4">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Pacientes · Perfil 360"
        titulo={contactDisplayName(contact)}
        frase={fraseDoTopo}
        acoes={
          <>
            <a href={whatsappUrl(contact)} target="_blank" rel="noreferrer" className={cn(botaoClasses({ variante: "secundario" }))}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              WhatsApp
            </a>
            <Link to={crmModuleRoutes.deals} className={cn(botaoClasses({ variante: "primario" }))}>
              Ver Kanban
            </Link>
          </>
        }
        rodape={
          <FraseDoFluxo link={{ to: crmModuleRoutes.tasks, rotulo: "Voltar ao CRM" }}>
            Perfil comercial e relacional. Não é prontuário médico; reúne execução, jornada, tarefas e alertas sem duplicar cadastro.{" "}
            <InfoTip title="O que é o Perfil 360?">
              A ficha completa do contato em um só lugar: dados, negociações, tarefas, cadências ativas e a linha do tempo de
              tudo que já aconteceu — cada evento mostra de onde veio. É a fonte de verdade antes de qualquer contato com o
              paciente.
            </InfoTip>
          </FraseDoFluxo>
        }
      />

      <Abas
        rotulo="Seções da ficha"
        valor={tab}
        onMudar={(id) => setTab(id as ProfileTab)}
        idDoPainel={() => "ficha-secao"}
        itens={abasVisiveis.map((item) => ({ id: item, rotulo: tabLabels[item] }))}
      />

      <div id="ficha-secao" role="tabpanel" className="grid gap-6 max-md:gap-4">
      {tab === "resumo" ? (
        <div className="grid items-start gap-6 xl:grid-cols-[1.15fr_0.85fr] max-md:gap-4">
          <BlocoFolha as="section" respiro aria-labelledby="ficha-resumo">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="ficha-resumo" className={cn(TITULO_SECAO, "flex items-center gap-2")}>
                <UserRound className="h-4 w-4 text-oliva" aria-hidden="true" />
                Resumo do contato
              </h2>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <Etiqueta>{contact.contactType}</Etiqueta>
                <Etiqueta tom="musgo">{lifecycleLabels[contact.lifecycleStage]}</Etiqueta>
                {fatigue?.risk ? <Etiqueta tom="erro">Risco de fadiga</Etiqueta> : null}
                <Botao
                  tamanho="pq"
                  icone={<Pencil className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => (editando ? setEditando(false) : abrirEdicao())}
                >
                  {editando ? "Cancelar" : "Editar cadastro"}
                </Botao>
              </span>
            </div>
            <div className="mt-4">
              {semContato && !editando ? (
                <Aviso tom="atencao" className="mb-4 items-center">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p>Este cadastro está sem telefone e sem e-mail — a cadência não tem para onde ligar nem escrever.</p>
                    <Botao variante="primario" tamanho="pq" onClick={abrirEdicao}>
                      Cadastrar telefone
                    </Botao>
                  </div>
                </Aviso>
              ) : null}

              {editando ? (
                <div className="mb-4 grid gap-4 rounded-bloco bg-papel p-4 shadow-[inset_0_0_0_1px_rgb(var(--fio-rgb))]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="perfil-nome">Nome completo</Label>
                      <Input
                        id="perfil-nome"
                        value={cadastro.fullName}
                        onChange={(event) => setCadastro({ ...cadastro, fullName: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="perfil-apelido">Apelido (como aparece nos cards)</Label>
                      <Input
                        id="perfil-apelido"
                        value={cadastro.preferredName}
                        onChange={(event) => setCadastro({ ...cadastro, preferredName: event.target.value })}
                        placeholder="Opcional"
                      />
                    </div>
                    <div>
                      <Label htmlFor="perfil-phone">WhatsApp / telefone</Label>
                      <Input
                        id="perfil-phone"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="(11) 98765-4321"
                        value={cadastro.phone}
                        onChange={(event) => setCadastro({ ...cadastro, phone: formatPhoneBR(event.target.value) })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="perfil-email">E-mail</Label>
                      <Input
                        id="perfil-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="nome@email.com"
                        value={cadastro.email}
                        onChange={(event) => setCadastro({ ...cadastro, email: event.target.value })}
                      />
                    </div>
                  </div>
                  <p className="text-xs font-medium leading-5 text-tinta-2">
                    O telefone é a chave única do CRM: ele liga esta pessoa às comandas, aos comprovantes, às dívidas e às
                    cadências — e é o que evita cadastro duplicado.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 rounded-bloco bg-saber px-3 py-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-tinta">
                      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--musgo-rgb))]" checked={cadastro.optIn} onChange={(event) => setCadastro({ ...cadastro, optIn: event.target.checked })} />
                      Aceitou receber mensagens de marketing e resgate
                    </label>
                    {cadastro.optIn ? (
                      <CampoSelecao pequeno value={cadastro.optInCanal} onChange={(event) => setCadastro({ ...cadastro, optInCanal: event.target.value })} className="w-auto" aria-label="Como o consentimento foi dado">
                        {["WhatsApp", "Presencial (ficha)", "Telefone", "E-mail", "Site / formulário"].map((canal) => (
                          <option key={canal} value={canal}>
                            {canal}
                          </option>
                        ))}
                      </CampoSelecao>
                    ) : null}
                    <InfoTip title="LGPD">
                      Mensagens de resgate e repescagem (60 dias, 6 meses, 1 ano) são marketing: precisam de consentimento registrado, com data e
                      canal. As mensagens da jornada de quem está em tratamento não precisam — são execução do contrato. Sem opt-in, o app avisa
                      na tarefa de resgate; não bloqueia.
                    </InfoTip>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Botao variante="primario" type="button" onClick={salvarCadastro}>
                      Salvar cadastro
                    </Botao>
                    <Botao variante="fantasma" onClick={() => setEditando(false)}>
                      Cancelar
                    </Botao>
                    {cadastroFeedback ? (
                      <p role="alert" className="text-xs font-bold text-erro">{cadastroFeedback}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <InfoItem label="WhatsApp" value={formatPhoneBR(contact.whatsapp || contact.phone)} />
                <InfoItem label="E-mail" value={contact.email} />
                <InfoItem label="Opt-in de marketing" value={contact.marketingOptInEm ? `sim · ${contact.marketingOptInCanal || "canal não informado"} · ${contact.marketingOptInEm.slice(8, 10)}/${contact.marketingOptInEm.slice(5, 7)}/${contact.marketingOptInEm.slice(0, 4)}` : "não registrado"} />
                <InfoItem label="Origem" value={contact.sourceChannel} />
                <InfoItem label="Temperatura" value={contact.leadTemperature} />
                <InfoItem label="Persona" value={contact.personaFit} />
                <InfoItem label="Responsável" value={contact.ownerUserId} />
                <InfoItem label="Dor principal" value={contact.mainPain} />
                <InfoItem label="Objetivo" value={contact.mainGoal} />
                <InfoItem label="Último toque" value={lastTouch ? formatCrmDateTime(lastTouch.sentAt) : "Sem toque"} />
              </dl>
              {useRemoteConsent ? <ConsentimentosDoContato contactRef={contact.id} pessoaId={pessoa?.id ?? null} podeEditar={Boolean(pessoa)} /> : null}
              {useRemoteConsent ? (
                <div className="mt-4">
                  <CpfDoPacienteCard contactRef={contact.id} pessoaId={pessoa?.id ?? null} ativo={Boolean(pessoa)} />
                </div>
              ) : null}
              {/* Só para quem a RLS entrega o portal (28/09/2026): limpeza e marketing não veem. */}
              {useRemoteConsent && canVerPortalPaciente(pessoa) ? (
                <div className="mt-4">
                  <PortalDoPacienteCard
                    contactRef={contact.id}
                    nomePaciente={contact.preferredName || contact.fullName}
                    telefone={contact.whatsapp || contact.phone}
                    temPlanoAtivo={state.deals.some((deal) => deal.contactId === contact.id && deal.programPhase && !deal.programOutcome && (deal.status === "WON_FULL" || deal.status === "WON_PARTIAL"))}
                    pessoaId={pessoa?.id ?? null}
                    cargo={pessoa?.cargo}
                    acessosDaPessoa={pessoa?.acessos}
                  />
                </div>
              ) : null}
            </div>
          </BlocoFolha>

          <div className="grid gap-4">
            {/* Ficha de aplicação (29/09/2026): só para enfermagem e gestão — o card some para os demais. */}
            <AplicacoesDoPacienteCard contactRef={contact.id} nomePaciente={contactDisplayName(contact)} />
            <BlocoSaber as="section" aria-labelledby="ficha-proxima-acao">
              <h2 id="ficha-proxima-acao" className={RUBRICA}>Próxima ação</h2>
              {nextTask ? (
                <div className="mt-2">
                  <p className="text-sm font-bold leading-5 text-tinta">{nextTask.title}</p>
                  <p className="mt-1 text-[13px] font-medium leading-5 tabular-nums text-tinta-2">{formatCrmDateTime(nextTask.dueAt)} - {taskTypeLabels[nextTask.taskType]}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm font-medium leading-5 text-tinta-2">Nenhuma tarefa aberta. O contato está sem próximo dono.</p>
              )}
            </BlocoSaber>
            <BlocoSaber as="section" aria-labelledby="ficha-antifadiga">
              <h2 id="ficha-antifadiga" className={RUBRICA}>Antifadiga</h2>
              <div className="mt-2 flex items-start gap-3">
                <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", statusDot(fatigue?.risk ? "danger" : "ok"))} aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold leading-5 text-tinta">{fatigue?.risk ? "Revisar antes de tocar" : "Contato saudável"}</p>
                  <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{fatigue?.message}</p>
                </div>
              </div>
            </BlocoSaber>
          </div>
        </div>
      ) : null}

      {tab === "timeline" ? (
        <BlocoFolha as="section" aria-labelledby="ficha-linha-do-tempo">
          <h2 id="ficha-linha-do-tempo" className={cn(TITULO_SECAO, "flex items-center gap-2 px-5 pt-5 max-md:px-4")}>
            <History className="h-4 w-4 text-oliva" aria-hidden="true" /> Linha do tempo
          </h2>
          <ol className="mt-3">
            {mergedTimeline.map((event) => (
              <li key={event.id} className={LINHA_DA_FICHA}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold leading-5 text-tinta">{event.title}</p>
                  <Etiqueta>{event.source}</Etiqueta>
                </div>
                <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{event.description}</p>
                <p className="mt-1 text-xs font-semibold tabular-nums text-tinta-2">{formatCrmDateTime(event.date)}</p>
              </li>
            ))}
          </ol>
        </BlocoFolha>
      ) : null}

      {tab === "tarefas" ? (
        <BlocoFolha as="section" aria-labelledby="ficha-tarefas">
          <h2 id="ficha-tarefas" className={cn(TITULO_SECAO, "px-5 pt-5 max-md:px-4")}>Tarefas do contato</h2>
          <ul className="mt-3">
            {contactTasks.map((task) => (
              <li key={task.id} className={LINHA_DA_FICHA}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold leading-5 text-tinta">{task.title}</p>
                  <Etiqueta>{taskStatusLabels[task.status]}</Etiqueta>
                </div>
                <p className="mt-1 text-[13px] font-medium leading-5 tabular-nums text-tinta-2">{taskTypeLabels[task.taskType]} - {formatCrmDateTime(task.dueAt)}</p>
              </li>
            ))}
          </ul>
        </BlocoFolha>
      ) : null}

      {tab === "cadencias" ? (
        <BlocoFolha as="section" aria-labelledby="ficha-cadencias">
          <h2 id="ficha-cadencias" className={cn(TITULO_SECAO, "px-5 pt-5 max-md:px-4")}>Cadências vinculadas</h2>
          <ul className="mt-3">
            {contactEnrollments.map((enrollment) => {
              const cadence = state.cadences.find((item) => item.id === enrollment.cadenceId);
              return (
                <li key={enrollment.id} className={LINHA_DA_FICHA}>
                  <p className="text-sm font-bold leading-5 text-tinta">{cadence?.name ?? "Cadência"}</p>
                  <p className="mt-1 text-[13px] font-medium leading-5 tabular-nums text-tinta-2">{enrollment.status} - gatilho em {enrollment.triggerDate}</p>
                </li>
              );
            })}
          </ul>
        </BlocoFolha>
      ) : null}

      {tab === "comercial" ? (
        <div className="grid gap-3">
          {contactDeals.map((deal) => (
            <BlocoFolha key={deal.id} as="section" respiro>
              <h2 className={TITULO_SECAO}>{deal.title}</h2>
              <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                <InfoItem label="Etapa" value={dealStageLabels[deal.stage]} />
                <InfoItem label="Valor potencial" value={canSeeFinancial ? moneyCrm(deal.estimatedValue) : "Restrito"} />
                <InfoItem label="Vendido" value={canSeeFinancial ? moneyCrm(deal.soldAmount) : "Restrito"} />
                <InfoItem label="Objeção" value={deal.mainObjection || "Sem objeção"} />
                <InfoItem label="Origem" value={deal.sourceChannel} />
                <InfoItem label="Status" value={deal.status} />
              </dl>
            </BlocoFolha>
          ))}
        </div>
      ) : null}

      {tab === "jornada" ? (
        <div className="grid gap-3">
          {journeys.length ? journeys.map((journey) => (
            <BlocoFolha key={journey.id} as="section" respiro>
              <h2 className={TITULO_SECAO}>{stageLabels[journey.currentStage]}</h2>
              <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                <InfoItem label="Plano" value={journey.treatmentPlanSummary} />
                <InfoItem label="Próximo retorno" value={journey.nextMedicalReturnDate || "Não definido"} />
                <InfoItem label="Primeira dose" value={journey.firstDoseScheduled ? "Agendada" : "Pendente"} />
                <InfoItem label="Bioimpedância" value={journey.firstBioimpedanceScheduled ? "Agendada" : "Pendente"} />
                <InfoItem label="Exames" value={journey.nextExamDueDate || "Não definido"} />
              </dl>
            </BlocoFolha>
          )) : <BlocoSaber className="py-4"><p className="text-sm font-medium text-tinta-2">Sem jornada consolidada ainda. Um fechamento no Kanban cria este resumo.</p></BlocoSaber>}
        </div>
      ) : null}

      {tab === "experiencia" ? (
        <div className="grid gap-3">
          {experiences.length ? experiences.map((experience) => (
            <BlocoFolha key={experience.id} as="section" respiro>
              <h2 className={cn(TITULO_SECAO, "flex items-center gap-2")}><HeartPulse className="h-4 w-4 text-oliva" aria-hidden="true" /> Experiência</h2>
              <dl className="mt-3 grid gap-2 sm:grid-cols-4">
                <InfoItem label="NPS" value={experience.npsScore} />
                <InfoItem label="Satisfação" value={experience.satisfactionScore} />
                <InfoItem label="Google" value={experience.googleReviewDone ? "Feita" : experience.googleReviewRequested ? "Solicitada" : "Pendente"} />
                <InfoItem label="Status" value={experience.status} />
              </dl>
              <p className="mt-3 text-sm font-medium leading-6 text-tinta-2">{experience.feedbackText}</p>
            </BlocoFolha>
          )) : <BlocoSaber className="py-4"><p className="text-sm font-medium text-tinta-2">Sem feedback registrado.</p></BlocoSaber>}
        </div>
      ) : null}

      {tab === "recebiveis" ? (
        <BlocoFolha as="section" aria-labelledby="ficha-recebiveis">
          <h2 id="ficha-recebiveis" className={cn(TITULO_SECAO, "flex items-center gap-2 px-5 pt-5 max-md:px-4")}>
            <CircleDollarSign className="h-4 w-4 text-oliva" aria-hidden="true" /> Recebíveis resumidos
          </h2>
          <ul className="mt-3">
            {receivables.map((receivable) => (
              <li key={receivable.id} className={LINHA_DA_FICHA}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold leading-5 tabular-nums text-tinta">{money360(receivable.totalAmount)} total</p>
                  <Etiqueta>{receivable.status}</Etiqueta>
                </div>
                <p className="mt-1 text-[13px] font-medium leading-5 tabular-nums text-tinta-2">Recebido {money360(receivable.receivedAmount)} - vencimento {receivable.dueDate}</p>
              </li>
            ))}
          </ul>
        </BlocoFolha>
      ) : null}
      </div>

      <Indicadores
        rotulo="O contato em números"
        itens={[
          { rotulo: "Tarefas abertas", valor: tarefasAbertas, frase: "ainda por fazer" },
          { rotulo: "Toques registrados", valor: contactTouchpoints.length + relationshipTouchpoints.length, frase: "mensagens e ligações" },
          { rotulo: "Eventos", valor: mergedTimeline.length, frase: "na linha do tempo" },
        ]}
      />
    </div>
  );
}

// A tela inteira passa pelo controle de Administração → Acessos, igual às outras
// do CRM: sem isto, quem tivesse o CRM ocultado ainda entrava pelo endereço.
export function CrmContactProfilePage() {
  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Ficha do contato" module="crm">
      <CrmContactProfilePageConteudo />
    </AccessGate>
  );
}
