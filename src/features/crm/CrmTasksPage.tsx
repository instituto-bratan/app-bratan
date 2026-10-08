import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCopy,
  Filter,
  MessageCircle,
  Plus,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, CampoBusca, FraseDoFluxo, LinkSeta } from "@/components/ui/fundacao";
import { InfoTip } from "@/components/ui/info-tip";
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
  isCrmManagement,
  isTaskOverdue,
  moveDealStage,
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
  roleRuleExplainers,
} from "./crmData";
import { CrmSyncBanner } from "./CrmSyncBanner";
import { useCrmState } from "./useCrmState";
import { toast } from "@/components/ui/avisos";
import { Aviso, CampoSelecao, Etiqueta, GrupoDeLeituras, Indicadores, Input, Label, Leitura, TITULO_SECAO, type TomEtiqueta } from "./comercialVisual";
import { contagem, maiuscula } from "./comercialFrases";
import { integracaoLigada } from "@/lib/integracoes";
import { invocarIntegracao } from "@/lib/remoteData";
import { AccessGate } from "@/components/access/AccessGate";
import { AvisoSoVe, avisarSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { canCrmBratan } from "@/lib/access";

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

// Tom das etiquetas (08/10/2026): a cor nunca fala sozinha — a palavra vai junto.
// Atrasou é laranja (atenção); crítico é vermelho; o resto é neutro.
function priorityTone(priority: CrmPriority): TomEtiqueta {
  if (priority === "CRITICAL") return "erro";
  if (priority === "HIGH") return "atencao";
  return "neutro";
}

function statusTone(status: CrmTaskStatus): TomEtiqueta {
  if (status === "DONE") return "ok";
  if (status === "OVERDUE") return "atencao";
  if (status === "IN_PROGRESS") return "neutro";
  return "musgo";
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

function taskMatchesTab(task: CrmTask, tab: TaskTab, today: Date, seven: Date) {
  const due = new Date(task.dueAt);
  if (tab === "hoje") return !["DONE", "CANCELED", "SKIPPED"].includes(task.status) && due >= today && due <= endOfDay(today);
  if (tab === "atrasadas") return isTaskOverdue(task);
  if (tab === "proximos") return !["DONE", "CANCELED", "SKIPPED"].includes(task.status) && due > endOfDay(today) && due <= endOfDay(seven);
  if (tab === "concluidas") return task.status === "DONE";
  return true;
}

function useFilteredTasks(tasks: CrmTask[], tab: TaskTab, query: string, type: string, priority: string) {
  return useMemo(() => {
    const today = startOfToday();
    const seven = new Date(today);
    seven.setDate(today.getDate() + 7);
    const normalized = query.trim().toLowerCase();

    return tasks
      .filter((task) => taskMatchesTab(task, tab, today, seven))
      .filter((task) => (type ? task.taskType === type : true))
      .filter((task) => (priority ? task.priority === priority : true))
      .filter((task) => {
        if (!normalized) return true;
        return `${task.title} ${task.description} ${task.assignedToRole}`.toLowerCase().includes(normalized);
      })
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [priority, query, tab, tasks, type]);
}

function CrmTasksPageConteudo() {
  const { pessoa } = useAuth();
  // "Só vê" (29/09/2026, auditoria B9): sem EDITAR no CRM, nada grava e os botões de registrar ficam desligados.
  const { state, persist, syncMode, syncFailed, syncErrorDetail, retrySync } = useCrmState({ modulo: "crm" });
  const telaCrm = useNivelDaTela("crm");
  const semEdicao = !telaCrm.podeEditar;
  const role = cargoToCrmRole(pessoa?.cargo);
  const isManagement = isCrmManagement(pessoa?.cargo);
  // Regra do Lucas (14/07/2026): cada um vê as SUAS tarefas. A coordenação
  // abre por padrão na visão do próprio papel e alterna para a visão geral.
  const [scope, setScope] = useState<"minhas" | "todas">("minhas");
  const summary = crmSummary(state, pessoa);
  const accessibleTasks = state.tasks.filter((task) => !pessoa || canUserAccessTask(pessoa, task));
  const visibleTasks =
    isManagement && scope === "minhas"
      ? accessibleTasks.filter((task) => (role && task.assignedToRole === role) || task.assignedToUserId === pessoa?.id)
      : accessibleTasks;
  const [tab, setTab] = useState<TaskTab>("hoje");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [result, setResult] = useState<CrmTaskResult>("SENT");
  // Data da consulta quando o resultado é "agendou/reagendou": liga o 3·1 na hora.
  const [dataConsulta, setDataConsulta] = useState("");
  const [notes, setNotes] = useState("");
  const [unhappy, setUnhappy] = useState(false);
  const tasks = useFilteredTasks(visibleTasks, tab, query, type, priority);
  const tabCounts = useMemo(() => {
    const today = startOfToday();
    const seven = new Date(today);
    seven.setDate(today.getDate() + 7);
    const counts = {} as Record<TaskTab, number>;
    (Object.keys(tabLabels) as TaskTab[]).forEach((item) => {
      counts[item] = visibleTasks.filter((task) => taskMatchesTab(task, item, today, seven)).length;
    });
    return counts;
  }, [visibleTasks]);
  const cadencesById = useMemo(() => new Map(state.cadences.map((cadence) => [cadence.id, cadence])), [state.cadences]);

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
    if ((result === "SCHEDULED" || result === "RESCHEDULED") && !dataConsulta) {
      setConciergeFeedback("Informe a DATA da consulta agendada — é ela que coloca o paciente no 3·1 de confirmação (−3/−1).");
      return;
    }
    persist((current) =>
      completeCrmTask(current, selectedTask.id, {
        actorId: pessoa?.id ?? "preview",
        result,
        resultNotes: notes,
        scheduledDate: result === "SCHEDULED" || result === "RESCHEDULED" ? dataConsulta : undefined,
        // Regra 2.3 do POP: insatisfação → a Concierge recebe a tarefa HOJE.
        sentiment: unhappy ? "NEGATIVE" : undefined,
      }),
    );
    setSelectedTaskId("");
    setNotes("");
    setResult("SENT");
    setDataConsulta("");
    setUnhappy(false);
  }

  function createNextTask(task: CrmTask) {
    persist((current) => createFollowUpTask(current, task.id, pessoa?.id ?? "preview"));
  }

  // --- Login da concierge: fluxo à prova de erro ---------------------------
  // A concierge é coordenação (secretaria_executiva) → isManagement é true e ela
  // vê o toggle "Só as minhas / Todas". As melhorias abaixo valem só na visão
  // dela ("minhas"); em "Todas do Instituto" ela cai no layout normal.
  const isConcierge = role === "CONCIERGE";
  const isConciergeView = isConcierge && scope === "minhas";
  const isRescueTask = (task: CrmTask) => (task.cadenceId ?? "").startsWith("cad-rescue");
  const [armedTaskId, setArmedTaskId] = useState("");
  const [conciergeFeedback, setConciergeFeedback] = useState("");

  // "Enviei" conclui a tarefa num toque (result SENT não pausa a régua → o
  // próximo toque nasce sozinho). Fim do "mandei mas reaparece".
  // WHATSAPP OFICIAL (15/09/2026, proposta 3.1): com a integração ligada, a mensagem sai
  // pelo número do Instituto (Meta Cloud API) e a tarefa é concluída no mesmo toque.
  const whatsappOficial = integracaoLigada("whatsapp");
  const [enviandoOficial, setEnviandoOficial] = useState("");
  async function enviarPeloOficial(task: CrmTask) {
    if (semEdicao) return avisarSoVe();
    const contact = contactsById.get(task.contactId);
    const telefone = contact ? (contact.whatsapp || contact.phone || "").replace(/\D/g, "") : "";
    const texto = messageForTask(task);
    if (!telefone) return toast("Este contato não tem WhatsApp cadastrado.", { tom: "atencao" });
    if (!texto.trim()) return toast("A tarefa não tem mensagem pronta; use o botão WhatsApp e escreva você.", { tom: "atencao" });
    setEnviandoOficial(task.id);
    try {
      const r = await invocarIntegracao<{ ok: boolean; error?: string }>("whatsapp-enviar", { telefone, texto, contactRef: task.contactId, taskRef: task.id, enviadoPor: pessoa?.id ?? null });
      if (!r.ok) return toast(r.error ?? "A Meta não aceitou a mensagem.", { tom: "erro", duracaoMs: 7000 });
      confirmSent(task);
    } finally {
      setEnviandoOficial("");
    }
  }

  function confirmSent(task: CrmTask) {
    // DESFAZER (14/09/2026, proposta 4.6): guarda o estado anterior e oferece 6 s para voltar.
    const antes = state;
    persist((current) => completeCrmTask(current, task.id, { actorId: pessoa?.id ?? "preview", result: "SENT" }));
    setArmedTaskId("");
    setConciergeFeedback(`✓ ${contactDisplayName(contactsById.get(task.contactId))} — registrada como enviada e fora da sua lista de hoje.`);
    toast(`Toque de ${contactDisplayName(contactsById.get(task.contactId))} registrado.`, { tom: "ok", acao: { rotulo: "Desfazer", onClick: () => void persist(() => antes) } });
  }

  // "Já agendou / foi atendida" tira do resgate: pausa a régua DESTE contato
  // (SCHEDULED — cobre até o resgate de 1 ano) e move o card para fora do
  // resgate, sem deslinkar. Só move se houver deal em etapa de resgate e que não
  // esteja fechado (mover um deal fechado o reabriria como OPEN).
  function resolveRescue(task: CrmTask, stage: "CONSULTA_AGENDADA" | "CONSULTA_REALIZADA") {
    persist((current) => {
      let next = completeCrmTask(current, task.id, {
        actorId: pessoa?.id ?? "preview",
        result: "SCHEDULED",
        resultNotes: "Já agendou / foi atendida — retirada do resgate pela concierge.",
      });
      if (task.dealId) {
        const deal = next.deals.find((item) => item.id === task.dealId);
        const rescueStages = ["PERDIDO", "NAO_ADESAO", "RESGATE_D60", "CHURN", "NAO_FECHOU"];
        const isWon = deal?.status === "WON_FULL" || deal?.status === "WON_PARTIAL";
        if (deal && rescueStages.includes(deal.stage) && !isWon) {
          const moved = moveDealStage(next, deal.id, { stage, actorId: pessoa?.id ?? "preview" });
          if (moved.ok) next = moved.state;
        }
      }
      return next;
    });
    setArmedTaskId("");
    setConciergeFeedback(`✓ ${contactDisplayName(contactsById.get(task.contactId))} saiu do resgate. A recepção assume a confirmação da consulta.`);
  }

  // CABEÇALHO (08/10/2026, redesenho etapa 3): um cabeçalho só, com o número da
  // fila explicado em frase; os cinco números do CRM viram uma faixa "para
  // saber"; as tarefas são uma lista numa folha (decidir em folha). O que a tela
  // FAZ não mudou: mesmos filtros, mesmos botões, mesmas travas de "só vê".
  const roleExplainer = roleRuleExplainers[cargoToCrmRole(pessoa?.cargo) ?? "ADMINISTRATIVO"];
  const fraseDoTopo = (
    <>
      {tabCounts.hoje ? (
        <>
          <strong>{maiuscula(contagem(tabCounts.hoje, "tarefa", "tarefas", "f"))}</strong> para hoje.
        </>
      ) : (
        <strong>Nada para hoje.</strong>
      )}
      {tabCounts.atrasadas ? (
        <span className="alerta"> {maiuscula(contagem(tabCounts.atrasadas, "tarefa", "tarefas", "f"))} {tabCounts.atrasadas === 1 ? "atrasou" : "atrasaram"}.</span>
      ) : null}
      {tabCounts.proximos ? ` Mais ${contagem(tabCounts.proximos, "tarefa", "tarefas", "f")} nos próximos 7 dias.` : ""}
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 font-sans max-md:gap-4">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Comercial"
        titulo="Minhas tarefas"
        frase={fraseDoTopo}
        acoes={<LinkSeta to={crmModuleRoutes.deals}>Abrir o Kanban</LinkSeta>}
        rodape={
          isConciergeView ? undefined : (
            <FraseDoFluxo>
              Sempre nesta ordem: <strong className="font-bold text-tinta">1.</strong> Copie a mensagem pronta ·{" "}
              <strong className="font-bold text-tinta">2.</strong> Envie no WhatsApp · <strong className="font-bold text-tinta">3.</strong>{" "}
              Registre o que aconteceu. O resto o app faz sozinho.{" "}
              <InfoTip title="O que é esta tela?">
                O resto (pausar régua, próximo passo, histórico) o app faz sozinho. É a sua fila de trabalho do CRM: cada tarefa nasce de uma movimentação no Kanban, de uma cadência ou de uma
                importação — já com contato, prazo e contexto. Conclua por aqui e o histórico vai sozinho para o Perfil 360 do
                paciente e para o Dashboard.
              </InfoTip>
            </FraseDoFluxo>
          )
        }
      />
      <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={retrySync} />
      <AvisoSoVe soVe={telaCrm.soVe} />

      {isConciergeView ? (
        <BlocoSaber className="py-4">
          <p className="text-sm font-bold leading-5 text-tinta">Como funciona a sua fila — simples assim:</p>
          <ul className="mt-2 grid gap-1.5 text-sm font-medium leading-6 text-tinta-2">
            <li><strong className="text-tinta">Mandei a mensagem</strong> → toque em <strong className="text-tinta">WhatsApp</strong> e depois <strong className="text-tinta">Confirmar envio ✓</strong> (ou <strong className="text-tinta">Enviei ✓</strong>). Some da sua lista — não volta.</li>
            <li><strong className="text-atencao">Paciente já agendou ou foi atendido</strong> → toque em <strong className="text-tinta">Já agendou / Já foi atendida</strong>. Ele sai do resgate e para de te cobrar.</li>
            <li><strong className="text-tinta">Respondeu algo ou teve problema</strong> → use <strong className="text-tinta">“Respondeu / problema? registrar”</strong>. O resto (pausar régua, histórico, 360) o app faz sozinho.</li>
          </ul>
        </BlocoSaber>
      ) : null}

      <Indicadores
        rotulo="O CRM hoje"
        titulo={
          role ? (
            <>
              <strong>{crmRoleLabels[role]}:</strong> {roleFocus(role)}
            </>
          ) : (
            "Seu dia operacional com dados conectados ao Kanban, cadências e 360."
          )
        }
        itens={[
          { rotulo: "Hoje", valor: summary.todayTasks.length, frase: "execução do dia" },
          { rotulo: "Atrasadas", valor: summary.overdueTasks.length, frase: "gargalos reais", tom: summary.overdueTasks.length ? "atencao" : undefined },
          { rotulo: "Próximas", valor: summary.nextSeven.length, frase: "nos próximos 7 dias" },
          { rotulo: "Negociações", valor: summary.openDeals.length, frase: "abertas" },
          { rotulo: "Fadiga", valor: summary.fatigueContacts.length, frase: "contatos para revisar o toque" },
        ]}
      />

      {roleExplainer ? (
        <p className="-mt-2 text-sm font-medium leading-6 text-tinta-2 max-md:mt-0">
          <strong className="font-bold text-tinta">{roleExplainer.title}.</strong> {roleExplainer.rule}
        </p>
      ) : null}

      {/* Os filtros: leituras com número (como no Kanban), e a busca. */}
      <section aria-label="Filtros das tarefas" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <GrupoDeLeituras rotulo="Quais tarefas">
            {(Object.keys(tabLabels) as TaskTab[]).map((item) => (
              <Leitura
                key={item}
                ativa={tab === item}
                numero={tabCounts[item]}
                tom={item === "atrasadas" && tabCounts[item] ? "atencao" : undefined}
                onClick={() => setTab(item)}
              >
                {tabLabels[item]}
              </Leitura>
            ))}
          </GrupoDeLeituras>
          {isManagement ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <GrupoDeLeituras rotulo="De quem">
                <Leitura ativa={scope === "minhas"} onClick={() => setScope("minhas")}>
                  Só as minhas
                </Leitura>
                <Leitura ativa={scope === "todas"} onClick={() => setScope("todas")}>
                  Todas do Instituto
                </Leitura>
              </GrupoDeLeituras>
              <span className="text-[13px] font-medium leading-5 text-tinta-2">
                {scope === "minhas" ? "Mostrando só as tarefas do seu papel." : "Visão de coordenação: tarefas de todos os setores."}
              </span>
            </div>
          ) : null}
        </div>
        <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_1fr]">
          <CampoBusca rotulo="Buscar tarefa" valor={query} onMudar={setQuery} placeholder="Buscar tarefa, responsável ou etapa" />
          <label className="relative block">
            <span className="sr-only">Tipo da tarefa</span>
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-2" aria-hidden="true" />
            <CampoSelecao value={type} onChange={(event) => setType(event.target.value)} className="pl-9">
              <option value="">Todos os tipos</option>
              {(Object.keys(taskTypeLabels) as CrmTaskType[]).map((item) => (
                <option key={item} value={item}>{taskTypeLabels[item]}</option>
              ))}
            </CampoSelecao>
          </label>
          <label className="block">
            <span className="sr-only">Prioridade</span>
            <CampoSelecao value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="">Todas as prioridades</option>
              {(Object.keys(priorityLabels) as CrmPriority[]).map((item) => (
                <option key={item} value={item}>{priorityLabels[item]}</option>
              ))}
            </CampoSelecao>
          </label>
        </div>
      </section>

      {selectedTask ? (
        <BlocoFolha as="section" respiro aria-label="Registrar o que aconteceu" className="border-fio-2">
          <h2 className={TITULO_SECAO}>Passo 3 · O que aconteceu com esta tarefa?</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
            <div className="min-w-0">
              <p className="text-sm font-bold leading-5 text-tinta">{selectedTask.title}</p>
              <p className="mt-1 text-sm font-medium leading-5 text-tinta-2 tabular-nums">
                {selectedContact ? contactDisplayName(selectedContact) : "Tarefa interna (sem contato)"} - {formatCrmDateTime(selectedTask.dueAt)}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="tarefa-resultado">Resultado</Label>
                <CampoSelecao id="tarefa-resultado" value={result} onChange={(event) => setResult(event.target.value as CrmTaskResult)}>
                  {resultOptions.map((item) => <option key={item} value={item}>{taskResultLabels[item]}</option>)}
                </CampoSelecao>
              </div>
              <div>
                <Label htmlFor="tarefa-observacao">Observação</Label>
                <Input id="tarefa-observacao" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Resumo curto" />
              </div>
              {result === "SCHEDULED" || result === "RESCHEDULED" ? (
                <div className="sm:col-span-2">
                  <Label htmlFor="tarefa-data-consulta">Data da consulta (obrigatória)</Label>
                  <Input
                    id="tarefa-data-consulta"
                    type="date"
                    value={dataConsulta}
                    onChange={(event) => setDataConsulta(event.target.value)}
                  />
                  <p className="mt-1 text-xs font-medium leading-4 text-tinta-2">
                    Com a data, o paciente entra sozinho no 3·1 da recepção (confirmação −3 e lembrete −1) e o card anda no
                    Kanban. Remarcou? As tarefas da data antiga são canceladas sozinhas.
                  </p>
                </div>
              ) : null}
            </div>
            <label className="flex items-start gap-3 rounded-bloco bg-erro-claro p-3 text-sm leading-5 md:col-span-2">
              <input type="checkbox" checked={unhappy} onChange={(event) => setUnhappy(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--erro-rgb))]" />
              <span>
                <span className="font-bold text-erro">Paciente insatisfeito / relatou problema</span>
                <span className="block text-xs font-medium text-tinta-2">
                  Regra de ouro (POP 2.3): a Concierge recebe o caso HOJE. Descreva o ocorrido na observação acima.
                </span>
              </span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Botao variante="primario" disabled={semEdicao} onClick={completeSelected} icone={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
              Salvar e concluir
            </Botao>
            <Botao variante="fantasma" onClick={() => setSelectedTaskId("")}>Cancelar</Botao>
          </div>
        </BlocoFolha>
      ) : null}

      {conciergeFeedback ? (
        <Aviso tom="ok" className="items-center">
          <div className="flex items-start justify-between gap-3">
            <p className="leading-6">{conciergeFeedback}</p>
            <button
              type="button"
              onClick={() => setConciergeFeedback("")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-controle text-ok hover:bg-folha focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </Aviso>
      ) : null}

      {(() => {
        const renderTaskCard = (task: CrmTask) => {
          const contact = contactsById.get(task.contactId);
          const effectiveStatus = taskEffectiveStatus(task);
          const message = messageForTask(task);
          const rescue = isRescueTask(task);
          const armed = armedTaskId === task.id;

          return (
            <article
              key={task.id}
              aria-label={contactDisplayName(contact)}
              className={cn(
                "grid gap-4 p-5 max-md:p-4 lg:grid-cols-[minmax(0,1fr)_288px] lg:gap-8 [&+&]:border-t [&+&]:border-fio",
                rescue && isConciergeView && "shadow-[inset_3px_0_0_rgb(var(--atencao-rgb))]",
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Etiqueta tom={statusTone(effectiveStatus)}>{taskStatusLabels[effectiveStatus]}</Etiqueta>
                  <Etiqueta tom={priorityTone(task.priority)}>{priorityLabels[task.priority]}</Etiqueta>
                  <Etiqueta>{taskTypeLabels[task.taskType]}</Etiqueta>
                  {rescue ? <Etiqueta tom="atencao">Resgate</Etiqueta> : <Etiqueta>{crmRoleLabels[task.assignedToRole]}</Etiqueta>}
                  {rescue && contact && !contact.marketingOptInEm ? (
                    <Etiqueta tom="erro" title="LGPD: resgate é marketing. Registre o consentimento no perfil (Editar cadastro) ou peça na própria conversa.">
                      sem opt-in de marketing
                    </Etiqueta>
                  ) : null}
                </div>
                <h2 className="mt-3 flex min-w-0 items-center gap-2 text-base font-bold leading-6 text-tinta">
                  <UserRound className="h-4 w-4 shrink-0 text-oliva" aria-hidden="true" />
                  <span className="min-w-0 truncate">{contactDisplayName(contact)}</span>
                </h2>
                <p className="mt-0.5 text-sm font-semibold leading-5 text-tinta">{task.title}</p>
                <p className="mt-1 text-sm font-medium leading-6 text-tinta-2">{task.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-5">
                  <span className={cn("inline-flex items-center gap-1 font-bold tabular-nums", effectiveStatus === "OVERDUE" ? "text-atencao" : "text-tinta")}>
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    {!task.dueAt
                      ? "Sem prazo — ativa quando houver movimentação"
                      : `${effectiveStatus === "OVERDUE" ? "Atrasada — era para " : "Fazer até "}${formatCrmDateTime(task.dueAt)}`}
                  </span>
                  {task.cadenceId && cadencesById.get(task.cadenceId) ? (
                    <span className="inline-flex items-center gap-1 font-medium text-tinta-2">
                      <RefreshCw className="h-4 w-4 text-oliva" aria-hidden="true" />
                      Régua: {cadencesById.get(task.cadenceId)!.name}
                    </span>
                  ) : null}
                </div>
                {message ? (
                  <p className="mt-3 whitespace-pre-line rounded-bloco bg-saber p-3 text-sm font-medium leading-6 text-tinta">{message}</p>
                ) : null}
              </div>

              {isConciergeView ? (
                <div className="grid content-start gap-2">
                  {armed ? (
                    <>
                      <p className="rounded-bloco bg-ok-claro p-3 text-xs font-semibold leading-5 text-ok">
                        Abri o WhatsApp com a mensagem pronta. Já mandou? Confirme para tirar da sua lista.
                      </p>
                      <Botao variante="primario" tamanho="pq" disabled={semEdicao} onClick={() => confirmSent(task)} icone={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
                        Confirmar envio ✓
                      </Botao>
                      <Botao variante="fantasma" tamanho="pq" onClick={() => setArmedTaskId("")}>
                        Ainda não enviei
                      </Botao>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Botao tamanho="pq" onClick={() => copyMessage(task)} icone={<ClipboardCopy className="h-4 w-4" aria-hidden="true" />}>
                          Copiar
                        </Botao>
                        <Botao tamanho="pq" onClick={() => { openWhatsapp(task); setArmedTaskId(task.id); }} icone={<MessageCircle className="h-4 w-4" aria-hidden="true" />}>
                          WhatsApp
                        </Botao>
                      </div>
                      {whatsappOficial && task.taskType === "WHATSAPP" ? (
                        <Botao
                          variante="suave"
                          tamanho="pq"
                          disabled={semEdicao || enviandoOficial === task.id}
                          carregando={enviandoOficial === task.id}
                          onClick={() => void enviarPeloOficial(task)}
                          title="Sai pelo número oficial do Instituto e já conclui a tarefa"
                          icone={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
                        >
                          {enviandoOficial === task.id ? "Enviando…" : "Enviar pelo número oficial"}
                        </Botao>
                      ) : null}
                      <Botao variante="primario" tamanho="pq" disabled={semEdicao} onClick={() => confirmSent(task)} icone={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
                        Enviei ✓
                      </Botao>
                      {rescue ? (
                        <div className="rounded-bloco bg-atencao-claro p-3">
                          <p className="text-xs font-bold leading-5 text-atencao">Já agendou ou foi atendida? Tire do resgate:</p>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <Botao tamanho="pq" disabled={semEdicao} onClick={() => resolveRescue(task, "CONSULTA_AGENDADA")} icone={<CalendarClock className="h-4 w-4" aria-hidden="true" />}>
                              Vai ser atendida
                            </Botao>
                            <Botao tamanho="pq" disabled={semEdicao} onClick={() => resolveRescue(task, "CONSULTA_REALIZADA")}>
                              Já foi atendida
                            </Botao>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                        <LinkSeta to={crmModuleRoutes.contact(task.contactId)} className="text-[13px]">
                          Ver perfil
                        </LinkSeta>
                        <button
                          type="button"
                          onClick={() => setSelectedTaskId(task.id)}
                          className="rounded-sm text-[13px] font-semibold leading-5 text-tinta-2 underline-offset-[3px] hover:text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
                        >
                          Respondeu / problema? registrar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <Botao tamanho="pq" className="justify-start" onClick={() => copyMessage(task)} icone={<ClipboardCopy className="h-4 w-4" aria-hidden="true" />}>
                    1 · Copiar mensagem
                  </Botao>
                  <Botao tamanho="pq" className="justify-start" onClick={() => openWhatsapp(task)} icone={<MessageCircle className="h-4 w-4" aria-hidden="true" />}>
                    2 · Enviar no WhatsApp
                  </Botao>
                  <Botao variante="primario" tamanho="pq" className="justify-start" disabled={semEdicao} onClick={() => setSelectedTaskId(task.id)} icone={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
                    3 · Registrar o que aconteceu
                  </Botao>
                  <Botao variante="fantasma" tamanho="pq" className="justify-start" disabled={semEdicao} onClick={() => createNextTask(task)} icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
                    Criar tarefa para amanhã
                  </Botao>
                  <LinkSeta to={crmModuleRoutes.contact(task.contactId)} className="px-3 py-1 text-[13px]">
                    Ver perfil da pessoa
                  </LinkSeta>
                </div>
              )}
            </article>
          );
        };

        if (!tasks.length) {
          return (
            <BlocoSaber className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-oliva" aria-hidden="true" />
              <p className="mt-3 text-base font-bold leading-6 text-tinta">
                {tab === "hoje" && "Nada para hoje — tudo em dia!"}
                {tab === "atrasadas" && "Nenhuma tarefa atrasada. Excelente!"}
                {tab === "proximos" && "Nada agendado para os próximos 7 dias."}
                {tab === "concluidas" && "Nenhuma tarefa concluída ainda."}
                {tab === "todas" && "Nenhuma tarefa por aqui."}
              </p>
              <p className="mt-1 text-sm font-medium leading-6 text-tinta-2">
                {tab === "hoje"
                  ? "Espie a aba 'Próximos 7 dias' para se adiantar, ou o Kanban para ver as negociações."
                  : "Quando alguém entrar numa cadência ou o Kanban andar, as tarefas aparecem aqui sozinhas."}
              </p>
            </BlocoSaber>
          );
        }

        if (isConciergeView) {
          const rescueTasks = tasks.filter(isRescueTask);
          const otherTasks = tasks.filter((task) => !isRescueTask(task));
          return (
            <div className="grid gap-6">
              {otherTasks.length ? (
                <BlocoFolha as="section" aria-label="Tarefas">
                  {otherTasks.map((task) => renderTaskCard(task))}
                </BlocoFolha>
              ) : null}
              {rescueTasks.length ? (
                <section aria-label="Resgates" className="grid gap-3">
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={TITULO_SECAO}>Resgates — reativação</span>
                    <span className="text-sm font-medium text-tinta-2">Já agendou ou foi atendida? Tire do resgate em 1 toque.</span>
                  </p>
                  <BlocoFolha>{rescueTasks.map((task) => renderTaskCard(task))}</BlocoFolha>
                </section>
              ) : null}
            </div>
          );
        }

        return (
          <BlocoFolha as="section" aria-label="Tarefas">
            {tasks.map((task) => renderTaskCard(task))}
          </BlocoFolha>
        );
      })()}

      <p className="text-center text-xs font-medium text-tinta-2">Sincronização: {syncMode}. O Dashboard 360 recebe os dados derivados, sem preenchimento duplicado.</p>
    </div>
  );
}

// A tela inteira passa pelo controle de Administração → Acessos, igual às outras
// do CRM: sem isto, quem tivesse o CRM ocultado ainda entrava pelo endereço.
export function CrmTasksPage() {
  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Minhas tarefas" module="crm">
      <CrmTasksPageConteudo />
    </AccessGate>
  );
}
