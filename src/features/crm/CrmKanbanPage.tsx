import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Upload,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CircleDollarSign,
  GraduationCap,
  Maximize2,
  Minimize2,
  Move,
  Plus,
  Search,
  Sparkles,
  Target,
  UserPlus,
  X,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuidedTour, useTourSeen, type TourStep } from "@/components/ui/guided-tour";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { readLocalValue, writeLocalValue } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import {
  canUserAccessContact,
  contactDisplayName,
  createDealForContact,
  crmModuleRoutes,
  crmRoleLabels,
  dealStageHints,
  objectionCategoryLabels,
  dealStageLabels,
  dealStages,
  findOrCreateCrmContact,
  formatCrmDateTime,
  moneyCrm,
  moveDealStage,
  programGateStatus,
  programOutcomeLabels,
  programPhaseSpecs,
  programPhaseHints,
  programPhaseLabels,
  programPhases,
  setProgramPhase,
  taskEffectiveStatus,
  type CrmAdhesionChannel,
  type CrmDeal,
  type CrmDealStage,
  type CrmContact,
  type CrmLeadTemperature,
  type CrmObjectionCategory,
  type CrmPersonaFit,
  type CrmProgramOutcome,
  type CrmProgramPhase,
  type CrmRole,
  type CrmState,
  type CrmTask,
} from "./crmData";
import { CrmSyncBanner } from "./CrmSyncBanner";
import { PatientPicker, type PatientPickerValue } from "./PatientPicker";
import { useCrmState } from "./useCrmState";

const objectionOptions: CrmObjectionCategory[] = [
  "PRICE",
  "TRUST",
  "TIMING",
  "SPOUSE_OR_FAMILY",
  "PAYMENT_METHOD",
  "NEEDS_MORE_INFORMATION",
  "NO_PERCEIVED_VALUE",
  "NO_RESPONSE",
  "OTHER",
];

type KanbanSection = "all" | "captacao" | "negociacao";
type KanbanDensity = "compact" | "comfortable" | "executive";

const sectionLabels: Record<KanbanSection, string> = {
  all: "Ver tudo",
  captacao: "Captação & Consulta",
  negociacao: "Negociação & Recuperação",
};

const stageSections: Record<KanbanSection, CrmDealStage[]> = {
  all: dealStages,
  captacao: ["LEAD_FRIO", "LEAD_NOVO", "CONTATADO", "QUALIFICADO", "CONSULTA_AGENDADA", "CONSULTA_CONFIRMADA", "CONSULTA_REALIZADA"],
  negociacao: ["PRESCRICAO_FEITA", "EM_NEGOCIACAO", "FECHOU_COMPLETO", "FECHOU_PARCIAL", "NAO_FECHOU", "RECUPERACAO_D1_MEDICO", "RECUPERACAO_D2_GESTOR", "NAO_ADESAO", "PERDIDO", "RESGATE_D60", "CHURN"],
};

// O CRM começa no FECHAMENTO (decisão do Lucas, 22/07): o quadro principal é a
// JORNADA do paciente; o que era funil comercial virou uma lista simples de
// "Em aberto" (leads/consultas ainda sem fechamento registrado).
type KanbanBoard = "comercial" | "programa";
const boardLabels: Record<KanbanBoard, string> = { programa: "Jornada do paciente", comercial: "Em aberto (antes do fechamento)" };

// Cores por papel — a mesma linguagem visual da Régua de Relacionamento.
const roleTones: Partial<Record<CrmRole, { chip: string; dot: string }>> = {
  RECEPCAO: { chip: "border-emerald-300 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  CONCIERGE: { chip: "border-amber-300 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  ENFERMAGEM: { chip: "border-violet-300 bg-violet-50 text-violet-800", dot: "bg-violet-500" },
  MEDICO: { chip: "border-brand-musgo/40 bg-brand-musgo/10 text-brand-musgo", dot: "bg-brand-musgo" },
  PERFORMANCE: { chip: "border-orange-300 bg-orange-50 text-orange-800", dot: "bg-orange-500" },
  ADMIN_GESTAO: { chip: "border-slate-300 bg-slate-50 text-slate-700", dot: "bg-slate-500" },
  ADMINISTRATIVO: { chip: "border-slate-300 bg-slate-50 text-slate-700", dot: "bg-slate-500" },
  COMERCIAL_VENDEDOR: { chip: "border-sky-300 bg-sky-50 text-sky-800", dot: "bg-sky-500" },
};
const roleTone = (role: CrmRole) => roleTones[role] ?? { chip: "border-slate-300 bg-slate-50 text-slate-700", dot: "bg-slate-400" };

const channelLabels: Record<CrmAdhesionChannel, string> = {
  PROGRAMA_ACOMPANHAMENTO: "Programa de Acompanhamento",
  CLUBE_BRATAN: "Clube Bratan",
  SOMENTE_TRATAMENTO: "Somente Tratamento",
};
const channelShort: Record<CrmAdhesionChannel, string> = {
  PROGRAMA_ACOMPANHAMENTO: "Programa",
  CLUBE_BRATAN: "Clube",
  SOMENTE_TRATAMENTO: "Tratamento",
};

const densityLabels: Record<KanbanDensity, string> = {
  compact: "Compacto",
  comfortable: "Confortável",
  executive: "Executivo",
};

const densityColumns: Record<KanbanDensity, string> = {
  compact: "auto-cols-[minmax(300px,320px)]",
  comfortable: "auto-cols-[minmax(360px,390px)]",
  executive: "auto-cols-[minmax(420px,460px)]",
};

const temperatureLabels: Record<CrmLeadTemperature, string> = {
  COLD: "Frio",
  WARM: "Morno",
  HOT: "Quente",
};

const kanbanTourSteps: TourStep[] = [
  {
    icon: Target,
    title: "Tudo começa no fechamento (Estevão)",
    description:
      "O botão \"Registrar fechamento\" é a porta de entrada: escolha o paciente, marque o que ele fechou (Programa, Clube, Só Tratamento, avulsa ou não fechou) e a esteira certa liga sozinha.",
    hint: "O telefone é a chave única: o app busca antes de criar — nada duplica.",
  },
  {
    icon: Move,
    title: "O card anda SOZINHO — ninguém arrasta",
    description:
      "Cada fase tem as tarefas dela em Minhas Tarefas. Quando a pessoa conclui a tarefa, o card avança de coluna na mesma hora. No D+1 o card só avança quando TODAS as pessoas da esteira marcarem \"mensagem enviada\".",
    hint: "O checklist no card mostra quem já marcou e quem falta.",
  },
  {
    icon: CircleDollarSign,
    title: "Não fechou? A Concierge acolhe",
    description:
      "Registrou \"não fechou\" com a objeção → a Aline recebe o acolhimento do D+1 e a régua D1–D5 segue um passo por vez. Qualquer resposta do paciente encerra a régua na hora.",
    hint: "Sem resposta no D5 → o card vai para o Estevão (5 ligações).",
  },
  {
    icon: AlertTriangle,
    title: "1 paciente = 1 card = 1 tarefa por pessoa",
    description:
      "Nunca existem dois cards ativos do mesmo paciente, nem duas tarefas da mesma pessoa para ele. Se algo duplicar, o app cancela sozinho a sobra e registra o motivo.",
  },
  {
    icon: Search,
    title: "Busque e ajuste o visual",
    description:
      "A busca encontra por nome, origem ou objeção. A densidade (Compacto, Confortável, Executivo) muda o tamanho dos cards. Tudo fica salvo para a próxima visita.",
  },
  {
    icon: BrainCircuit,
    title: "Tudo alimenta o Dashboard 360",
    description:
      "Valores vendidos, conversão e objeções fluem daqui para a Inteligência 360 — sem digitar nada duas vezes.",
  },
];

function stageProbability(stage: CrmDealStage) {
  if (stage === "FECHOU_COMPLETO" || stage === "FECHOU_PARCIAL") return 100;
  if (stage === "PERDIDO") return 0;
  if (stage === "EM_NEGOCIACAO" || stage === "PRESCRICAO_FEITA") return 70;
  if (stage === "CONSULTA_REALIZADA") return 55;
  if (stage === "CONSULTA_AGENDADA" || stage === "CONSULTA_CONFIRMADA") return 45;
  if (stage === "QUALIFICADO") return 35;
  return 20;
}

function DealCard({
  deal,
  contact,
  nextTask,
  density,
  canSeeValue,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
  hasCadence,
}: {
  deal: CrmDeal;
  contact?: CrmContact;
  nextTask?: CrmTask;
  hasCadence?: boolean;
  density: KanbanDensity;
  canSeeValue: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const contactName = contactDisplayName(contact);
  const contactPhone = contact ? (contact.whatsapp || contact.phone).replace(/\D/g, "") : "";
  const hasNextTask = Boolean(nextTask);

  return (
    <article
      data-deal-card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-lg border border-brand-oliva/14 bg-white/75 shadow-sm backdrop-blur-xl transition-opacity active:cursor-grabbing",
        density === "compact" ? "p-3" : "p-4",
        isDragging && "opacity-45",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate font-semibold text-brand-musgo", density === "executive" && "text-lg")}>{contactName}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{deal.title}</p>
        </div>
        <Badge variant="muted">{deal.probability}%</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline">{deal.sourceChannel || "Manual"}</Badge>
        {contact?.leadTemperature ? <Badge variant={contact.leadTemperature === "HOT" ? "gold" : "muted"}>{temperatureLabels[contact.leadTemperature]}</Badge> : null}
        {!hasNextTask ? <Badge className="bg-red-100 text-red-800">Sem próxima ação</Badge> : null}
        {hasCadence === false ? <Badge className="bg-amber-100 text-amber-800">Sem régua</Badge> : null}
        {deal.mainObjection ? <Badge className="bg-brand-creme text-brand-tinta">{deal.mainObjection}</Badge> : null}
      </div>
      <div className="mt-3 grid gap-2">
        {nextTask ? (
          <div className="rounded-md border border-brand-dourado/25 bg-brand-creme/35 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase text-brand-oliva">Próxima ação</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-brand-tinta">{nextTask.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatCrmDateTime(nextTask.dueAt)}</p>
          </div>
        ) : null}
        {canSeeValue ? (
          <div className="rounded-md bg-brand-papel/70 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Potencial / vendido</p>
            <p className="font-semibold text-brand-musgo">{moneyCrm(deal.estimatedValue)} / {moneyCrm(deal.soldAmount)}</p>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to={crmModuleRoutes.contact(deal.contactId)}>Perfil</Link>
          </Button>
          {contactPhone ? (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`https://wa.me/55${contactPhone.replace(/^55/, "")}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
        <Button type="button" size="sm" onClick={onSelect}>
          Mover / registrar
        </Button>
      </div>
    </article>
  );
}

// Card do quadro PROGRAMA: mostra a faixa do gate (quem já agiu ✓ / quem falta ⏳)
// e o "próximo passo" — a trilha fica óbvia para qualquer pessoa da equipe.
function ProgramCard({
  deal,
  contact,
  state,
  density,
  canDrag,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  deal: CrmDeal;
  contact?: CrmContact;
  state: CrmState;
  density: KanbanDensity;
  canDrag: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const contactName = contactDisplayName(contact);
  const contactPhone = contact ? (contact.whatsapp || contact.phone).replace(/\D/g, "") : "";
  const phase = deal.programPhase as CrmProgramPhase;
  const spec = programPhaseSpecs[phase];
  const gate = programGateStatus(state, deal.id);
  const missingRoles = new Set(gate.missing.map((item) => item.role));
  const nextLabel = spec.next ? programPhaseLabels[spec.next] : null;

  return (
    <article
      data-deal-card
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      className={cn(
        "rounded-lg border border-brand-oliva/14 bg-white/75 shadow-sm backdrop-blur-xl transition-opacity",
        canDrag && "cursor-grab active:cursor-grabbing",
        density === "compact" ? "p-3" : "p-4",
        isDragging && "opacity-45",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate font-semibold text-brand-musgo", density === "executive" && "text-lg")}>{contactName}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{deal.title}</p>
        </div>
        {deal.adhesionChannel ? <Badge variant="gold">{channelShort[deal.adhesionChannel]}</Badge> : null}
      </div>

      {/* Faixa do GATE: cada setor exigido nesta fase, com ✓ ou ⏳ */}
      {gate.total > 0 ? (
        <div className="mt-3 rounded-md border border-brand-oliva/15 bg-brand-papel/60 px-2.5 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-oliva">
            Para avançar · {gate.done} de {gate.total}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {spec.gate.map((gateSpec) => {
              const done = !missingRoles.has(gateSpec.role);
              const tone = roleTone(gateSpec.role);
              return (
                <span
                  key={gateSpec.key}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    done ? tone.chip : "border-dashed border-slate-300 bg-white text-slate-500",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", done ? tone.dot : "bg-slate-300")} aria-hidden="true" />
                  {crmRoleLabels[gateSpec.role]} {done ? "✓" : "⏳"}
                </span>
              );
            })}
          </div>
          {nextLabel ? (
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
              {gate.done === gate.total ? "Gate completo — avançando…" : `Quando todos concluírem → ${nextLabel}`}
            </p>
          ) : null}
        </div>
      ) : nextLabel ? (
        <p className="mt-3 rounded-md bg-brand-papel/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Próxima fase: <span className="font-semibold text-brand-musgo">{nextLabel}</span>
        </p>
      ) : null}

      {deal.programOutcome ? (
        <Badge className="mt-2 bg-emerald-100 text-emerald-800">Desfecho: {programOutcomeLabels[deal.programOutcome]}</Badge>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button asChild variant="outline" size="sm" className="flex-1">
          <Link to={crmModuleRoutes.contact(deal.contactId)}>Perfil</Link>
        </Button>
        {contactPhone ? (
          <Button asChild variant="outline" size="sm" className="flex-1">
            <a href={`https://wa.me/55${contactPhone.replace(/^55/, "")}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={onSelect}>
          Detalhes
        </Button>
      </div>
    </article>
  );
}

export function CrmKanbanPage() {
  const { pessoa } = useAuth();
  const { state, persist, syncFailed, retrySync, deleteLead } = useCrmState();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [board, setBoard] = useState<KanbanBoard>(() => readLocalValue<KanbanBoard>("app-bratan-kanban-board-v2", "programa"));
  const [section, setSection] = useState<KanbanSection>(() => readLocalValue<KanbanSection>("app-bratan-kanban-section", "all"));
  const [density, setDensity] = useState<KanbanDensity>(() => readLocalValue<KanbanDensity>("app-bratan-kanban-density", "comfortable"));
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState("");
  const [targetStage, setTargetStage] = useState<CrmDealStage>("CONTATADO");
  const [prescribed, setPrescribed] = useState("");
  const [sold, setSold] = useState("");
  const [received, setReceived] = useState("");
  const [objection, setObjection] = useState("");
  const [objectionCategory, setObjectionCategory] = useState<CrmObjectionCategory>("OTHER");
  const [partialReason, setPartialReason] = useState("");
  const [adhesion, setAdhesion] = useState<CrmAdhesionChannel>("PROGRAMA_ACOMPANHAMENTO");
  // Feedback DENTRO do drawer: o banner da página fica atrás do painel e o
  // usuário não via a validação — parecia que o botão "não estava indo".
  const [drawerFeedback, setDrawerFeedback] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newSource, setNewSource] = useState("Manual");
  const [newValue, setNewValue] = useState("18000");
  const [newTemp, setNewTemp] = useState<CrmLeadTemperature>("WARM");
  const [newFit, setNewFit] = useState<CrmPersonaFit>("UNKNOWN");
  const [feedback, setFeedback] = useState("");
  const [draggingDealId, setDraggingDealId] = useState("");
  const [dragOverStage, setDragOverStage] = useState<CrmDealStage | null>(null);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  // Cadastro do FECHAMENTO (Estevão) — a porta de entrada da jornada (Lucas, 22/07).
  const [fechamentoOpen, setFechamentoOpen] = useState(false);
  const [fcPatient, setFcPatient] = useState<PatientPickerValue>({ ref: "", name: "" });
  const [fcPhone, setFcPhone] = useState("");
  const [fcResultado, setFcResultado] = useState<CrmAdhesionChannel | "AVULSA" | "NAO_FECHOU">("PROGRAMA_ACOMPANHAMENTO");
  const [fcCompleto, setFcCompleto] = useState(true);
  const [fcSold, setFcSold] = useState("");
  const [fcReceived, setFcReceived] = useState("");
  const [fcObjection, setFcObjection] = useState("");
  const [fcObjectionCategory, setFcObjectionCategory] = useState<CrmObjectionCategory>("PRICE");
  const [fcPartialReason, setFcPartialReason] = useState("");
  const [fcFeedback, setFcFeedback] = useState("");
  const [tourOpen, setTourOpen] = useState(false);
  const { seen: tourSeen, markSeen: markTourSeen } = useTourSeen("app-bratan-tour-kanban");
  const boardRef = useRef<HTMLDivElement>(null);
  const panState = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0 });

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  const canSeeValue = Boolean(pessoa?.cargo && ["dr_daniel", "ceo", "gestor", "gestor_financeiro", "marketing", "secretaria_executiva", "recepcionista"].includes(pessoa.cargo));
  const contactsById = useMemo(() => new Map(state.contacts.map((contact) => [contact.id, contact])), [state.contacts]);
  const coveredContactIds = useMemo(() => {
    const covered = new Set<string>();
    for (const enrollment of state.cadenceEnrollments) {
      if (enrollment.status === "ACTIVE" || enrollment.status === "PAUSED") covered.add(enrollment.contactId);
    }
    for (const task of state.tasks) {
      if (!["DONE", "CANCELED", "SKIPPED"].includes(task.status)) covered.add(task.contactId);
    }
    return covered;
  }, [state.cadenceEnrollments, state.tasks]);

  const nextTaskByDealId = useMemo(() => {
    const map = new Map<string, CrmTask>();
    state.tasks
      .filter((task) => task.dealId && !["DONE", "CANCELED", "SKIPPED"].includes(task.status))
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .forEach((task) => {
        if (!map.has(task.dealId)) map.set(task.dealId, task);
      });
    return map;
  }, [state.tasks]);
  const visibleDeals = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.deals.filter((deal) => {
      const contact = contactsById.get(deal.contactId);
      if (pessoa && contact && !canUserAccessContact(pessoa, contact)) return false;
      if (status && deal.status !== status) return false;
      if (!normalized) return true;
      return `${deal.title} ${contactDisplayName(contact)} ${deal.sourceChannel} ${deal.mainObjection}`.toLowerCase().includes(normalized);
    });
  }, [contactsById, pessoa, query, state.deals, status]);

  const visibleStages = stageSections[section] ?? dealStages;
  const selectedDeal = state.deals.find((deal) => deal.id === selectedDealId) ?? null;
  const selectedContact = selectedDeal ? contactsById.get(selectedDeal.contactId) : undefined;
  const selectedNextTask = selectedDeal ? nextTaskByDealId.get(selectedDeal.id) : undefined;

  // Divisão dos quadros: quem entrou na jornada do Programa sai do Comercial.
  const comercialDeals = useMemo(() => visibleDeals.filter((deal) => !deal.programPhase), [visibleDeals]);
  const programDeals = useMemo(() => visibleDeals.filter((deal) => deal.programPhase), [visibleDeals]);
  const canOverridePhase = isCoordenacao(pessoa?.cargo);
  const [dragOverPhase, setDragOverPhase] = useState<CrmProgramPhase | null>(null);

  function changeBoard(next: KanbanBoard) {
    setBoard(next);
    writeLocalValue("app-bratan-kanban-board-v2", next);
  }

  function onProgramColumnDrop(event: DragEvent<HTMLElement>, phase: CrmProgramPhase) {
    event.preventDefault();
    const dealId = event.dataTransfer.getData("text/plain") || draggingDealId;
    setDragOverPhase(null);
    setDraggingDealId("");
    if (!dealId || !canOverridePhase) return;
    const deal = state.deals.find((item) => item.id === dealId);
    if (!deal || deal.programPhase === phase) return;
    persist((current) => setProgramPhase(current, dealId, phase, pessoa?.id ?? "coordenacao"));
    setFeedback(`Card movido manualmente para "${programPhaseLabels[phase]}" (registrado no histórico).`);
  }

  function setOutcome(dealId: string, outcome: CrmProgramOutcome) {
    persist((current) => ({
      ...current,
      deals: current.deals.map((deal) =>
        deal.id === dealId ? { ...deal, programOutcome: outcome, updatedAt: new Date().toISOString() } : deal,
      ),
    }));
    setFeedback(`Desfecho registrado: ${programOutcomeLabels[outcome]}.`);
  }

  function changeSection(next: KanbanSection) {
    setSection(next);
    writeLocalValue("app-bratan-kanban-section", next);
  }

  function changeDensity(next: KanbanDensity) {
    setDensity(next);
    writeLocalValue("app-bratan-kanban-density", next);
  }



  const [importOpen, setImportOpen] = useState(false);
  const [importAs, setImportAs] = useState<"PATIENT" | "LEAD">("PATIENT");
  const [importFeedback, setImportFeedback] = useState("");

  // Importa a exportação de pacientes do Feegow (CSV): acha as colunas de
  // nome/telefone/e-mail pelo cabeçalho e cria sem duplicar cadastro.
  function handleFeegowFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) {
        setImportFeedback("Arquivo vazio ou sem linhas de dados. Exporte a lista de pacientes do Feegow em CSV.");
        return;
      }
      const separator = (lines[0].match(/;/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? ";" : ",";
      const parseLine = (line: string) => {
        const cells: string[] = [];
        let current = "";
        let quoted = false;
        for (const char of line) {
          if (char === '"') quoted = !quoted;
          else if (char === separator && !quoted) {
            cells.push(current.trim());
            current = "";
          } else current += char;
        }
        cells.push(current.trim());
        return cells;
      };
      const header = parseLine(lines[0]).map((cell) => cell.toLowerCase());
      const nameIdx = header.findIndex((cell) => /nome|paciente|name/.test(cell));
      const phoneIdx = header.findIndex((cell) => /celular|telefone|fone|whats|phone/.test(cell));
      const emailIdx = header.findIndex((cell) => /e-?mail/.test(cell));
      if (nameIdx === -1) {
        setImportFeedback(`Não achei a coluna de nome no cabeçalho (${header.slice(0, 6).join(" | ")}...). Exporte com a coluna Nome/Paciente.`);
        return;
      }
      const rows = lines.slice(1, 2001).map(parseLine).filter((cells) => (cells[nameIdx] ?? "").trim().length >= 3);
      persist((current) => {
        let next = current;
        let created = 0;
        let existing = 0;
        for (const cells of rows) {
          const result = findOrCreateCrmContact(
            next,
            {
              fullName: cells[nameIdx],
              phone: phoneIdx >= 0 ? cells[phoneIdx] ?? "" : "",
              whatsapp: phoneIdx >= 0 ? cells[phoneIdx] ?? "" : "",
              email: emailIdx >= 0 ? cells[emailIdx] ?? "" : "",
              contactType: importAs,
              lifecycleStage: importAs === "PATIENT" ? "ACTIVE_PATIENT" : "COLD_LEAD",
              sourceChannel: "Importação Feegow",
              ownerUserId: pessoa?.id ?? "importacao",
            },
            pessoa?.id ?? "importacao",
          );
          next = result.state;
          if (result.created) created += 1;
          else existing += 1;
        }
        setImportFeedback(
          `${created} ${importAs === "PATIENT" ? "paciente(s)" : "lead(s)"} importados do Feegow · ${existing} já existiam (não duplicados).${importAs === "LEAD" ? " Agora é inscrever nas cadências." : ""}`,
        );
        return next;
      });
    };
    reader.readAsText(file, "utf-8");
  }

  function handleCreateLead(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!newName.trim() && !newPhone.trim()) {
      setFeedback("Informe pelo menos nome ou telefone.");
      return;
    }

    persist((current) => {
      const created = findOrCreateCrmContact(
        current,
        {
          fullName: newName.trim() || newPhone.trim(),
          phone: newPhone,
          whatsapp: newPhone,
          sourceChannel: newSource,
          leadTemperature: newTemp,
          personaFit: newFit,
          ownerUserId: pessoa?.id ?? "manual",
          commercialOwnerId: pessoa?.id ?? "manual",
        },
        pessoa?.id ?? "manual",
      );
      setFeedback(created.duplicateWarning || "Lead criado e oportunidade aberta sem duplicar cadastro.");
      const withDeal = createDealForContact(created.state, {
        contactId: created.contact.id,
        title: `Primeira consulta - ${contactDisplayName(created.contact)}`,
        ownerUserId: pessoa?.id ?? "manual",
        estimatedValue: Number(newValue) || 0,
        sourceChannel: newSource,
      });
      return withDeal;
    });

    setNewName("");
    setNewPhone("");
    setLeadModalOpen(false);
  }

  // A jornada COMEÇA aqui: Estevão cadastra o fechamento (paciente + o que
  // fechou) e o canal liga a esteira certa sozinho. Telefone é a chave única —
  // o PatientPicker busca antes de criar (regra de ouro nº 1).
  function handleRegistrarFechamento(event: FormEvent) {
    event.preventDefault();
    setFcFeedback("");
    if (!fcPatient.ref && !fcPatient.name.trim()) return setFcFeedback("Escolha o paciente (ou digite o nome completo para criar).");
    if (fcResultado === "NAO_FECHOU" && !fcObjection.trim()) return setFcFeedback("Não fechou: registre o motivo/objeção (é o nosso PMI).");
    const soldAmount = Number(fcSold.replace(/\./g, "").replace(",", ".")) || 0;
    const receivedAmount = Number(fcReceived.replace(/\./g, "").replace(",", ".")) || 0;
    if (fcResultado !== "NAO_FECHOU" && soldAmount <= 0) return setFcFeedback("Fechou: informe o valor vendido.");
    if (fcResultado !== "NAO_FECHOU" && !fcCompleto && !fcPartialReason.trim()) return setFcFeedback("Fechamento parcial: registre o motivo do parcial.");

    persist((current) => {
      let working = current;
      let contactId = fcPatient.ref;
      if (!contactId) {
        const created = findOrCreateCrmContact(
          working,
          { fullName: fcPatient.name.trim(), phone: fcPhone, whatsapp: fcPhone, sourceChannel: "Fechamento (Estevão)", ownerUserId: pessoa?.id ?? "gestao" },
          pessoa?.id ?? "gestao",
        );
        working = created.state;
        contactId = created.contact.id;
      }
      let deal = working.deals.find((item) => item.contactId === contactId && item.status === "OPEN" && !item.programPhase);
      if (!deal) {
        working = createDealForContact(working, {
          contactId,
          title: `Fechamento — ${contactDisplayName(working.contacts.find((c) => c.id === contactId))}`,
          ownerUserId: pessoa?.id ?? "gestao",
          estimatedValue: soldAmount,
          sourceChannel: "Fechamento (Estevão)",
        });
        deal = working.deals[0];
      }
      if (!deal) {
        setFcFeedback("Não consegui criar a negociação — tente de novo.");
        return current;
      }
      const stage: CrmDealStage = fcResultado === "NAO_FECHOU" ? "NAO_FECHOU" : fcCompleto ? "FECHOU_COMPLETO" : "FECHOU_PARCIAL";
      const moved = moveDealStage(working, deal.id, {
        actorId: pessoa?.id ?? "gestao",
        stage,
        soldAmount: fcResultado === "NAO_FECHOU" ? undefined : soldAmount,
        receivedAmount: fcResultado === "NAO_FECHOU" ? undefined : receivedAmount,
        adhesionChannel: fcResultado !== "NAO_FECHOU" && fcResultado !== "AVULSA" ? fcResultado : undefined,
        objection: fcObjection.trim() || undefined,
        objectionCategory: fcResultado === "NAO_FECHOU" ? fcObjectionCategory : undefined,
        partialReason: fcPartialReason.trim() || undefined,
      });
      if (!moved.ok) {
        setFcFeedback(moved.message || "Faltou informação obrigatória.");
        return current;
      }
      setFeedback(
        fcResultado === "NAO_FECHOU"
          ? "Fechamento registrado como NÃO FECHOU — a Concierge acolhe amanhã (D+1) e a régua segue sozinha."
          : fcResultado === "AVULSA"
            ? "Consulta avulsa registrada — sem jornada (segue o fluxo normal de agenda)."
            : `Fechamento registrado! A esteira ${fcResultado === "PROGRAMA_ACOMPANHAMENTO" ? "do Programa" : fcResultado === "CLUBE_BRATAN" ? "do Clube" : "de Tratamento"} ligou sozinha — as tarefas do D+1 já nasceram para as pessoas certas.`,
      );
      return moved.state;
    });
    setFechamentoOpen(false);
    setFcPatient({ ref: "", name: "" });
    setFcPhone("");
    setFcSold("");
    setFcReceived("");
    setFcObjection("");
    setFcPartialReason("");
    setFcCompleto(true);
    setFcResultado("PROGRAMA_ACOMPANHAMENTO");
  }

  function handleMoveDeal(event: FormEvent) {
    event.preventDefault();
    if (!selectedDeal) return;
    setFeedback("");
    setDrawerFeedback("");
    if (targetStage === selectedDeal.stage) {
      setDrawerFeedback('O card já está nesta etapa — escolha em "Nova etapa" para onde ele vai.');
      return;
    }
    persist((current) => {
      const moved = moveDealStage(current, selectedDeal.id, {
        actorId: pessoa?.id ?? "preview",
        stage: targetStage,
        prescribedAmount: prescribed ? Number(prescribed) : undefined,
        soldAmount: sold ? Number(sold) : undefined,
        receivedAmount: received ? Number(received) : undefined,
        objection,
        objectionCategory,
        partialReason,
        adhesionChannel: targetStage === "FECHOU_COMPLETO" || targetStage === "FECHOU_PARCIAL" ? adhesion : undefined,
      });
      if (!moved.ok) {
        // Validação barrou: o aviso precisa aparecer DENTRO do painel.
        setDrawerFeedback(moved.message);
        return current;
      }
      // Sucesso: fecha o painel para o card ser visto mudando de coluna.
      setFeedback(moved.message);
      setSelectedDealId("");
      return moved.state;
    });
  }

  const [editName, setEditName] = useState("");
  const [editPreferred, setEditPreferred] = useState("");
  const [editDealTitle, setEditDealTitle] = useState("");
  const [nameFeedback, setNameFeedback] = useState("");

  function saveLeadName() {
    if (!selectedDeal) return;
    const fullName = editName.trim();
    if (!fullName) {
      setNameFeedback("O nome não pode ficar vazio.");
      return;
    }
    persist((current) => ({
      ...current,
      contacts: current.contacts.map((contact) =>
        contact.id === selectedDeal.contactId
          ? { ...contact, fullName, preferredName: editPreferred.trim(), updatedAt: new Date().toISOString() }
          : contact,
      ),
      deals: current.deals.map((deal) =>
        deal.id === selectedDeal.id && editDealTitle.trim()
          ? { ...deal, title: editDealTitle.trim(), updatedAt: new Date().toISOString() }
          : deal,
      ),
    }));
    setNameFeedback("Nome atualizado — vale para o card, as tarefas e as cadências.");
  }

  function selectDeal(deal: CrmDeal, stageOverride?: CrmDealStage) {
    setSelectedDealId(deal.id);
    setDrawerFeedback("");
    const dealContact = contactsById.get(deal.contactId);
    setEditName(dealContact?.fullName ?? "");
    setEditPreferred(dealContact?.preferredName ?? "");
    setEditDealTitle(deal.title);
    setNameFeedback("");
    setTargetStage(stageOverride ?? deal.stage);
    setPrescribed(deal.prescribedAmount ? String(deal.prescribedAmount) : "");
    setSold(deal.soldAmount ? String(deal.soldAmount) : "");
    setReceived(deal.receivedAmount ? String(deal.receivedAmount) : "");
    setObjection(deal.mainObjection);
    setObjectionCategory(deal.objectionCategory);
    setPartialReason("");
  }

  function attemptMoveDeal(dealId: string, stage: CrmDealStage) {
    const deal = state.deals.find((item) => item.id === dealId);
    if (!deal || deal.stage === stage) return;
    setFeedback("");
    persist((current) => {
      const moved = moveDealStage(current, dealId, {
        actorId: pessoa?.id ?? "preview",
        stage,
        prescribedAmount: deal.prescribedAmount || undefined,
        soldAmount: deal.soldAmount || undefined,
        receivedAmount: deal.receivedAmount || undefined,
        objection: deal.mainObjection || undefined,
        objectionCategory: deal.objectionCategory,
      });
      if (!moved.ok) {
        selectDeal(deal, stage);
        // O painel abre por cima da página: o motivo tem que aparecer NELE.
        setDrawerFeedback(`${moved.message} Complete os campos abaixo e toque em "Mover e gerar tarefas".`);
        return current;
      }
      setFeedback(moved.message);
      return moved.state;
    });
  }

  function onCardDragStart(event: DragEvent<HTMLElement>, dealId: string) {
    event.dataTransfer.setData("text/plain", dealId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingDealId(dealId);
  }

  function onCardDragEnd() {
    setDraggingDealId("");
    setDragOverStage(null);
  }

  function onColumnDrop(event: DragEvent<HTMLElement>, stage: CrmDealStage) {
    event.preventDefault();
    const dealId = event.dataTransfer.getData("text/plain") || draggingDealId;
    setDragOverStage(null);
    setDraggingDealId("");
    if (dealId) attemptMoveDeal(dealId, stage);
  }

  function onBoardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-deal-card], button, a, input, select, textarea")) return;
    const board = boardRef.current;
    if (!board) return;
    panState.current = { active: true, moved: false, startX: event.clientX, scrollLeft: board.scrollLeft };
    board.setPointerCapture(event.pointerId);
  }

  function onBoardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panState.current.active) return;
    const board = boardRef.current;
    if (!board) return;
    const delta = event.clientX - panState.current.startX;
    if (Math.abs(delta) > 4) panState.current.moved = true;
    board.scrollLeft = panState.current.scrollLeft - delta;
  }

  function onBoardPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    panState.current.active = false;
    boardRef.current?.releasePointerCapture?.(event.pointerId);
  }

  const soldTotal = state.deals.reduce((sum, deal) => sum + deal.soldAmount, 0);
  const withoutNextAction = state.deals.filter(
    (deal) => deal.status === "OPEN" && !state.tasks.some((task) => task.dealId === deal.id && !["DONE", "CANCELED", "SKIPPED"].includes(task.status)),
  ).length;

  async function handleDeleteLead() {
    if (!selectedDeal) return;
    const contact = contactsById.get(selectedDeal.contactId);
    const name = contactDisplayName(contact);
    const ok = window.confirm(
      `Excluir ${name} de vez?\n\nIsso apaga o lead, as negociações, as tarefas, as cadências e o histórico dele — em todos os aparelhos. Não tem como desfazer.`,
    );
    if (!ok) return;
    setSelectedDealId("");
    const success = await deleteLead(selectedDeal.contactId);
    setFeedback(success ? `${name} foi excluído do CRM.` : `${name} foi excluído neste aparelho, mas a exclusão NÃO chegou ao Supabase — confira a internet e tente de novo.`);
  }

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1500px] flex-col gap-3 sm:gap-4",
        fullscreen
          ? "fixed inset-0 z-50 max-w-none gap-3 overflow-hidden bg-brand-papel p-3 sm:p-4"
          : "lg:h-[calc(100dvh-9.5rem)] lg:min-h-[540px]",
      )}
    >
      <CrmSyncBanner failed={syncFailed} onRetry={retrySync} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="gold">CRM Bratan</Badge>
          <h1 className={cn("text-brand-musgo", fullscreen ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl")}>Kanban</h1>
          {/* Dois quadros ligados: a venda acontece no Comercial; ao fechar, o
              paciente PASSA para o Programa (a régua de cuidado de 6-9 meses). */}
          <div className="flex rounded-full border border-brand-oliva/25 bg-white/60 p-0.5" role="tablist" aria-label="Quadro">
            {(Object.keys(boardLabels) as KanbanBoard[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={board === item}
                onClick={() => changeBoard(item)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                  board === item ? "bg-brand-musgo text-brand-papel shadow-sm" : "text-brand-oliva hover:text-brand-musgo",
                )}
              >
                {boardLabels[item]}
                <span className="ml-1.5 text-xs font-normal opacity-75">
                  {item === "comercial" ? comercialDeals.length : programDeals.length}
                </span>
              </button>
            ))}
          </div>
          <InfoTip title={board === "comercial" ? "Em aberto (antes do fechamento)" : "Jornada do paciente"}>
            {board === "comercial"
              ? "Lista de quem ainda NÃO tem fechamento registrado. O CRM começa quando o Estevão registra o fechamento — aí o paciente entra na Jornada e as tarefas nascem sozinhas."
              : "A jornada pós-fechamento. O card avança SOZINHO quando as tarefas da fase são concluídas (no D+1, todas as pessoas da esteira marcam \"mensagem enviada\"). Ninguém arrasta card; a coordenação corrige pela ficha."}
          </InfoTip>
        </div>
        <div className="flex flex-wrap gap-2">
          <LiquidButton type="button" size="sm" className="h-9 px-4" onClick={() => { setFcFeedback(""); setFechamentoOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Registrar fechamento
          </LiquidButton>
          <Button type="button" variant="outline" size="sm" onClick={() => setLeadModalOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Novo lead
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setImportFeedback(""); setImportOpen(true); }}>
            <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Importar do Feegow
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setTourOpen(true); markTourSeen(); }}>
            <GraduationCap className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Como usar
          </Button>
          {fullscreen ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setFullscreen(false)}>
              <Minimize2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Sair (Esc)
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => setFullscreen(true)}>
                <Maximize2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Tela cheia
              </Button>
              <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
                <Link to={crmModuleRoutes.tasks}>
                  Minhas tarefas <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {!tourSeen && !fullscreen ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/50 px-4 py-2.5"
        >
          <p className="flex items-center gap-2 text-sm text-brand-tinta">
            <Sparkles className="h-4 w-4 text-brand-dourado" aria-hidden="true" />
            Primeira vez no Kanban? Veja como usar em 6 passos rápidos.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => { setTourOpen(true); markTourSeen(); }}>
              Ver tutorial
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={markTourSeen}>
              Agora não
            </Button>
          </div>
        </motion.div>
      ) : null}

      {feedback ? (
        <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/70 p-3 text-sm text-brand-tinta">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {feedback}
        </div>
      ) : null}

      {selectedDeal ? (
        <div className="fixed inset-0 z-[70] bg-brand-tinta/28 backdrop-blur-sm" onClick={() => setSelectedDealId("")}>
          <aside
            className="ml-auto flex h-full w-[min(36rem,100vw)] flex-col overflow-y-auto border-l border-brand-oliva/20 bg-brand-papel p-4 shadow-2xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <Badge variant="gold">Detalhes do card</Badge>
                <h2 className="mt-2 text-2xl text-brand-musgo">{selectedDeal.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{contactDisplayName(selectedContact)} - {dealStageLabels[selectedDeal.stage]}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedDealId("")}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-brand-oliva/14 bg-white/64 p-3">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Próxima ação</p>
                {selectedNextTask ? (
                  <>
                    <p className="mt-1 font-semibold text-brand-tinta">{selectedNextTask.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCrmDateTime(selectedNextTask.dueAt)} - {taskEffectiveStatus(selectedNextTask)}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Sem próxima ação. Ao mover etapa, o app cria a pendência correta.</p>
                )}
                {(() => {
                  const lastDone = state.tasks
                    .filter((task) => task.dealId === selectedDeal.id && taskEffectiveStatus(task) === "DONE")
                    .sort((a, b) => (b.completedAt ?? b.dueAt ?? "").localeCompare(a.completedAt ?? a.dueAt ?? ""))[0];
                  return lastDone ? (
                    <p className="mt-2 text-xs text-emerald-700">✓ Última concluída: {lastDone.title}</p>
                  ) : null;
                })()}
              </div>
              <div className="rounded-lg border border-brand-oliva/14 bg-white/64 p-3">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Qualidade</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant={selectedNextTask ? "muted" : "gold"}>{selectedNextTask ? "Com próxima ação" : "Falta próxima ação"}</Badge>
                  <Badge variant={selectedDeal.mainObjection ? "muted" : "gold"}>{selectedDeal.mainObjection ? "Objeção registrada" : "Falta objeção"}</Badge>
                </div>
              </div>
            </div>

            {selectedDeal.programPhase ? (
              <div className="mt-4 rounded-lg border border-brand-dourado/30 bg-brand-creme/40 p-3">
                <p className="text-xs font-semibold uppercase text-brand-oliva">Jornada do Programa</p>
                <p className="mt-1 font-semibold text-brand-musgo">
                  Fase: {programPhaseLabels[selectedDeal.programPhase]}
                  {selectedDeal.adhesionChannel ? ` · ${channelShort[selectedDeal.adhesionChannel]}` : ""}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{programPhaseHints[selectedDeal.programPhase]}</p>
                {(() => {
                  const gate = programGateStatus(state, selectedDeal.id);
                  if (!gate.total) return null;
                  return (
                    <div className="mt-2">
                      <p className="text-[11px] font-bold uppercase text-brand-oliva">Gate: {gate.done} de {gate.total} concluídos</p>
                      {gate.missing.length ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Faltam: {gate.missing.map((item) => crmRoleLabels[item.role]).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
                {selectedDeal.programPhase === "ENCERRAMENTO" && canOverridePhase && !selectedDeal.programOutcome ? (
                  <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase text-brand-oliva">Ponto de decisão — desfecho:</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {(Object.keys(programOutcomeLabels) as CrmProgramOutcome[]).map((outcome) => (
                        <Button key={outcome} type="button" variant="outline" size="sm" onClick={() => setOutcome(selectedDeal.id, outcome)}>
                          {programOutcomeLabels[outcome]}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedDeal.programOutcome ? (
                  <Badge className="mt-2 bg-emerald-100 text-emerald-800">Desfecho: {programOutcomeLabels[selectedDeal.programOutcome]}</Badge>
                ) : null}
                {canOverridePhase ? (
                  <div className="mt-3 border-t border-brand-oliva/15 pt-2">
                    <p className="text-[11px] font-bold uppercase text-brand-oliva">Corrigir fase (só coordenação — fica registrado)</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {programPhases.map((phase) => (
                        <button
                          key={phase}
                          type="button"
                          disabled={selectedDeal.programPhase === phase}
                          onClick={() => {
                            persist((current) => setProgramPhase(current, selectedDeal.id, phase, pessoa?.id ?? "coordenacao"));
                            setDrawerFeedback("");
                            setFeedback(`Card movido manualmente para "${programPhaseLabels[phase]}" (registrado no histórico).`);
                          }}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            selectedDeal.programPhase === phase
                              ? "border-brand-musgo bg-brand-musgo text-brand-papel"
                              : "border-brand-oliva/25 bg-white/70 text-brand-tinta hover:bg-brand-creme/50",
                          )}
                        >
                          {programPhaseLabels[phase]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to={crmModuleRoutes.contact(selectedDeal.contactId)}>Abrir Perfil 360</Link>
              </Button>
              {selectedContact ? (
                <Button asChild variant="outline">
                  <a href={`https://wa.me/55${(selectedContact.whatsapp || selectedContact.phone).replace(/\D/g, "").replace(/^55/, "")}`} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => void handleDeleteLead()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir lead
              </Button>
            </div>

            <div className="mt-5 rounded-lg border border-brand-oliva/16 bg-white/64 p-3">
              <p className="text-xs font-semibold uppercase text-brand-oliva">Corrigir nome do lead</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Nome completo" aria-label="Nome completo do lead" />
                <Input value={editPreferred} onChange={(event) => setEditPreferred(event.target.value)} placeholder="Apelido (no card)" aria-label="Apelido do lead" />
                <Input value={editDealTitle} onChange={(event) => setEditDealTitle(event.target.value)} placeholder="Título da negociação" aria-label="Título da negociação" />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Button type="button" size="sm" variant="outline" onClick={saveLeadName}>
                  Salvar nome
                </Button>
                {nameFeedback ? <p className="text-xs font-semibold text-brand-musgo">{nameFeedback}</p> : null}
              </div>
            </div>

            {!canOverridePhase ? (
              <p className="mt-5 rounded-lg border border-brand-oliva/16 bg-white/64 p-3 text-xs leading-5 text-muted-foreground">
                O card anda sozinho quando a tarefa é concluída em <strong>Minhas Tarefas</strong> — ninguém move card na mão.
                Precisa corrigir uma etapa? Fale com a coordenação.
              </p>
            ) : null}
            <form className={cn("mt-5 grid gap-3 sm:grid-cols-2", !canOverridePhase && "hidden")} onSubmit={handleMoveDeal}>
              <div>
                <Label>Nova etapa</Label>
                <select value={targetStage} onChange={(event) => setTargetStage(event.target.value as CrmDealStage)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  {dealStages.map((stage) => <option key={stage} value={stage}>{dealStageLabels[stage]}</option>)}
                </select>
              </div>
              {targetStage === "FECHOU_COMPLETO" || targetStage === "FECHOU_PARCIAL" ? (
                <div>
                  <Label>O que o paciente fechou? (canal)</Label>
                  <select
                    value={adhesion}
                    onChange={(event) => setAdhesion(event.target.value as CrmAdhesionChannel)}
                    className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm"
                  >
                    {(Object.keys(channelLabels) as CrmAdhesionChannel[]).map((channel) => (
                      <option key={channel} value={channel}>{channelLabels[channel]}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">
                    Define quem age no D+1: Programa/Clube → recepção agenda · Somente Tratamento → enfermeira agenda as doses.
                  </p>
                </div>
              ) : null}
              <div>
                <Label>Valor prescrito</Label>
                <Input value={prescribed} onChange={(event) => setPrescribed(event.target.value)} inputMode="decimal" />
              </div>
              <div>
                <Label>Valor vendido</Label>
                <Input value={sold} onChange={(event) => setSold(event.target.value)} inputMode="decimal" />
              </div>
              <div>
                <Label>Valor recebido</Label>
                <Input value={received} onChange={(event) => setReceived(event.target.value)} inputMode="decimal" />
              </div>
              <div>
                <Label>Categoria da objeção</Label>
                <select value={objectionCategory} onChange={(event) => setObjectionCategory(event.target.value as CrmObjectionCategory)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                  {objectionOptions.map((item) => <option key={item} value={item}>{objectionCategoryLabels[item]}</option>)}
                </select>
              </div>
              <div>
                <Label>Objeção / motivo</Label>
                <Input value={objection} onChange={(event) => setObjection(event.target.value)} placeholder="Obrigatório se não fechou ou churn" />
              </div>
              <div className="sm:col-span-2">
                <Label>Motivo do parcial</Label>
                <Input value={partialReason} onChange={(event) => setPartialReason(event.target.value)} placeholder="Obrigatório se fechou parcial" />
              </div>
              {drawerFeedback ? (
                <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {drawerFeedback}
                </div>
              ) : null}
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <Button type="submit">Mover e gerar tarefas</Button>
                <Button type="button" variant="outline" onClick={() => setSelectedDealId("")}>Fechar</Button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      <section className="rounded-lg border border-brand-oliva/15 bg-white/45 p-2.5 shadow-sm backdrop-blur-xl">
        <div className="grid gap-2 lg:grid-cols-[1.2fr_0.65fr_0.6fr_0.55fr_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Buscar lead, paciente, origem ou objeção" />
          </label>
          <div className="flex h-12 items-center gap-2 overflow-x-auto rounded-md border border-brand-oliva/16 bg-white/60 px-3" aria-label="Legenda de papéis">
            {(["CONCIERGE", "RECEPCAO", "ENFERMAGEM", "ADMIN_GESTAO"] as CrmRole[]).map((role) => {
              const tone = roleTone(role);
              return (
                <span key={role} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-brand-musgo">
                  <span className={cn("h-2 w-2 rounded-full", tone.dot)} aria-hidden="true" />
                  {crmRoleLabels[role]}
                </span>
              );
            })}
          </div>
          <select value={density} onChange={(event) => changeDensity(event.target.value as KanbanDensity)} className="h-12 w-full rounded-md border border-input bg-white/72 px-3 text-sm shadow-sm backdrop-blur-xl" aria-label="Densidade dos cards">
            {(Object.keys(densityLabels) as KanbanDensity[]).map((item) => (
              <option key={item} value={item}>{densityLabels[item]}</option>
            ))}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-12 w-full rounded-md border border-input bg-white/72 px-3 text-sm shadow-sm backdrop-blur-xl" aria-label="Status das negociações">
            <option value="">Todos os status</option>
            <option value="OPEN">Abertos</option>
            <option value="WON_FULL">Ganhos completos</option>
            <option value="WON_PARTIAL">Ganhos parciais</option>
            <option value="LOST">Perdidos</option>
          </select>
          <div className="hidden items-center gap-2 lg:flex">
            {canSeeValue ? (
              <span className="flex h-12 items-center gap-1.5 whitespace-nowrap rounded-md border border-brand-oliva/16 bg-white/60 px-3 text-xs font-semibold text-brand-musgo">
                <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                {moneyCrm(soldTotal)}
              </span>
            ) : null}
            <span
              className={cn(
                "flex h-12 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs font-semibold",
                withoutNextAction ? "border-red-200 bg-red-50 text-red-800" : "border-brand-oliva/16 bg-white/60 text-brand-musgo",
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {withoutNextAction} sem ação
            </span>
            <InfoTip title="Validações do Kanban" side="bottom">
              "Vendidos" soma o valor fechado pelo CRM. "Sem ação" conta negociações abertas sem próxima tarefa — a regra de
              ouro é zerar esse número. Ao mover etapas: não fechou exige objeção, fechou exige valor, parcial exige motivo.
            </InfoTip>
          </div>
        </div>
      </section>

      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={onBoardPointerUp}
        className={cn(
          "kanban-scroll cursor-grab touch-pan-x overflow-x-auto pb-3 active:cursor-grabbing",
          fullscreen ? "min-h-0 flex-1" : "lg:min-h-0 lg:flex-1",
        )}
      >
        <div
          className={cn(
            board === "comercial"
              ? "w-full min-w-0 max-w-5xl"
              : cn("grid w-max grid-flow-col items-start gap-3", densityColumns[density], fullscreen ? "h-full items-stretch" : "lg:h-full lg:items-stretch"),
          )}
        >
          {board === "comercial"
            ? (() => {
                // O CRM começa no FECHAMENTO: o que era funil virou esta lista
                // simples. Cada linha tem 1 botão que importa — Registrar fechamento.
                const rows = [...comercialDeals]
                  .filter((deal) => deal.status === "OPEN")
                  .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
                return (
                  <section className="flex flex-col gap-2 rounded-lg border border-brand-oliva/14 bg-white/40 p-3 backdrop-blur-xl">
                    <p className="text-xs leading-5 text-muted-foreground">
                      Pacientes/leads ainda SEM fechamento registrado. Quando o Estevão registra o fechamento, o paciente
                      entra na <strong>Jornada</strong> e as tarefas certas nascem sozinhas. ({rows.length} em aberto)
                    </p>
                    {rows.length ? (
                      rows.map((deal) => {
                        const contact = contactsById.get(deal.contactId);
                        const phone = contact ? (contact.whatsapp || contact.phone || "").replace(/\D/g, "") : "";
                        return (
                          <div key={deal.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/65 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-brand-tinta">{contactDisplayName(contact)}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {dealStageLabels[deal.stage]}
                                {deal.sourceChannel ? ` · ${deal.sourceChannel}` : ""}
                                {phone ? ` · ${phone}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setFcPatient({ ref: deal.contactId, name: contactDisplayName(contact) });
                                  setFcFeedback("");
                                  setFechamentoOpen(true);
                                }}
                              >
                                Registrar fechamento
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => selectDeal(deal)}>
                                Abrir
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-4 text-center text-sm text-muted-foreground">
                        Ninguém em aberto — todo mundo já tem fechamento registrado. ✓
                      </div>
                    )}
                  </section>
                );
              })()
            : programPhases.map((phase, phaseIndex) => {
                const phaseDeals = programDeals.filter((deal) => deal.programPhase === phase);
                const nextPhase = programPhases[phaseIndex + 1];

                return (
                  // REGRA DE OURO nº 4: concluir a tarefa É o que move o card.
                  // Arrastar com o mouse foi desabilitado (Lucas, 22/07); a
                  // coordenação corrige fases pelo painel do card.
                  <section
                    key={phase}
                    className={cn(
                      "flex flex-col rounded-lg border border-brand-oliva/14 bg-white/40 p-2 backdrop-blur-xl transition-colors",
                      fullscreen ? "h-full" : "max-h-[68vh] lg:h-full lg:max-h-none",
                    )}
                  >
                    <div className="mb-2 shrink-0 rounded-md bg-brand-musgo px-3 py-2 text-brand-papel">
                      <p className="flex items-center gap-1.5 text-sm font-semibold" title={programPhaseHints[phase]}>
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-papel/20 text-[11px] font-bold">
                          {phaseIndex + 1}
                        </span>
                        {programPhaseLabels[phase]}
                        <InfoTip title={programPhaseLabels[phase]} className="text-brand-papel/80">
                          {programPhaseHints[phase]}
                        </InfoTip>
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-brand-papel/75">
                        <span>{phaseDeals.length} pacientes</span>
                        {nextPhase ? <span>→ {programPhaseLabels[nextPhase]}</span> : <span>fim da trilha</span>}
                      </div>
                    </div>
                    <div className="kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-0.5">
                      {phaseDeals.length ? (
                        phaseDeals.map((deal) => (
                          <ProgramCard
                            key={deal.id}
                            deal={deal}
                            contact={contactsById.get(deal.contactId)}
                            state={state}
                            density={density}
                            canDrag={false}
                            isDragging={false}
                            onSelect={() => selectDeal(deal)}
                            onDragStart={() => undefined}
                            onDragEnd={() => undefined}
                          />
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-center text-xs text-muted-foreground">
                          {phase === "FECHAMENTO_D0" ? "Ninguém fechou hoje ainda" : "Nenhum paciente nesta fase"}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
          {board === "programa"
            ? (() => {
                // Colunas de exceção da jornada (prompt do Lucas): quem caiu da
                // esteira aparece AQUI — primeiro com a Concierge (D1–D5), depois
                // com o Estevão (5 ligações) e, por fim, Encerrado (resgates futuros).
                const activeByContact = new Map<string, string>();
                for (const enrollment of state.cadenceEnrollments) {
                  if (enrollment.status === "ACTIVE") activeByContact.set(enrollment.contactId, enrollment.cadenceId);
                }
                const recoveryDeals = visibleDeals.filter(
                  (deal) => !deal.programPhase && deal.status === "OPEN" && ["cad-not-closed", "cad-gestor-5lig"].includes(activeByContact.get(deal.contactId) ?? ""),
                );
                const closedDeals = visibleDeals
                  .filter((deal) => !deal.programPhase && ["NAO_ADESAO", "PERDIDO"].includes(deal.stage))
                  .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
                const closedVisible = closedDeals.slice(0, 12);
                const renderMini = (deal: (typeof visibleDeals)[number], driver: string) => {
                  const contact = contactsById.get(deal.contactId);
                  return (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => selectDeal(deal)}
                      className="rounded-lg border border-brand-oliva/16 bg-white/70 px-3 py-2 text-left transition-colors hover:bg-brand-creme/50"
                    >
                      <p className="truncate text-sm font-semibold text-brand-tinta">{contactDisplayName(contact)}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{driver}</p>
                    </button>
                  );
                };
                return (
                  <>
                    <section className={cn("flex flex-col rounded-lg border border-amber-300/60 bg-amber-50/40 p-2 backdrop-blur-xl", fullscreen ? "h-full" : "max-h-[68vh] lg:h-full lg:max-h-none")}>
                      <div className="mb-2 shrink-0 rounded-md bg-amber-600 px-3 py-2 text-white">
                        <p className="text-sm font-semibold">Recuperação / Resgate</p>
                        <p className="mt-1 text-[11px] text-white/80">{recoveryDeals.length} pacientes · Concierge D1–D5 → Estevão</p>
                      </div>
                      <div className="kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-0.5">
                        {recoveryDeals.length ? (
                          recoveryDeals.map((deal) =>
                            renderMini(
                              deal,
                              activeByContact.get(deal.contactId) === "cad-gestor-5lig" ? "Com o Estevão (5 ligações)" : "Com a Concierge (D1–D5)",
                            ),
                          )
                        ) : (
                          <div className="rounded-lg border border-dashed border-amber-300/60 bg-white/35 p-3 text-center text-xs text-muted-foreground">
                            Ninguém em recuperação
                          </div>
                        )}
                      </div>
                    </section>
                    <section className={cn("flex flex-col rounded-lg border border-brand-oliva/14 bg-white/40 p-2 backdrop-blur-xl", fullscreen ? "h-full" : "max-h-[68vh] lg:h-full lg:max-h-none")}>
                      <div className="mb-2 shrink-0 rounded-md bg-brand-oliva px-3 py-2 text-brand-papel">
                        <p className="text-sm font-semibold">Encerrado</p>
                        <p className="mt-1 text-[11px] text-brand-papel/75">{closedDeals.length} na base · resgates de 60d/6m/1a seguem sozinhos</p>
                      </div>
                      <div className="kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start gap-2 overflow-y-auto pr-0.5">
                        {closedVisible.length ? (
                          <>
                            {closedVisible.map((deal) => renderMini(deal, dealStageLabels[deal.stage]))}
                            {closedDeals.length > closedVisible.length ? (
                              <p className="px-1 text-center text-[11px] text-muted-foreground">e mais {closedDeals.length - closedVisible.length}…</p>
                            ) : null}
                          </>
                        ) : (
                          <div className="rounded-lg border border-dashed border-brand-oliva/20 bg-white/35 p-3 text-center text-xs text-muted-foreground">
                            Nenhum encerrado
                          </div>
                        )}
                      </div>
                    </section>
                  </>
                );
              })()
            : null}
        </div>
      </div>

      <AnimatePresence>
        {fechamentoOpen ? (
          <motion.div
            key="modal-fechamento"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] grid place-items-center bg-brand-tinta/30 px-4 py-6 backdrop-blur-sm"
            onClick={() => setFechamentoOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="max-h-[86dvh] w-[min(34rem,94vw)] overflow-y-auto rounded-2xl border border-brand-oliva/18 bg-brand-papel p-5 shadow-[0_32px_80px_rgba(43,46,36,0.28)] sm:p-6"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-label="Registrar fechamento"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-xl text-brand-musgo">
                    <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
                    Registrar fechamento
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A jornada começa aqui: escolha o paciente, marque o que ele fechou e a esteira certa liga sozinha
                    (as tarefas do D+1 nascem para as pessoas certas).
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setFechamentoOpen(false)} aria-label="Fechar">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
              <form className="grid gap-3" onSubmit={handleRegistrarFechamento}>
                <div>
                  <Label>Paciente (busca por nome ou telefone — não duplica)</Label>
                  <div className="mt-1">
                    <PatientPicker contacts={state.contacts} value={fcPatient} onChange={setFcPatient} autoFocus />
                  </div>
                </div>
                {!fcPatient.ref && fcPatient.name.trim() ? (
                  <div>
                    <Label>WhatsApp do paciente novo (chave única)</Label>
                    <Input value={fcPhone} onChange={(event) => setFcPhone(event.target.value)} placeholder="11999999999" inputMode="tel" />
                  </div>
                ) : null}
                <div>
                  <Label>O que o paciente fechou?</Label>
                  <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {(
                      [
                        ["PROGRAMA_ACOMPANHAMENTO", "Plano de Acompanhamento", "Concierge + Recepção + Enfermeira no D+1"],
                        ["CLUBE_BRATAN", "Clube Bratan", "Concierge + Recepção no D+1"],
                        ["SOMENTE_TRATAMENTO", "Somente Tratamento", "Concierge + Enfermeira no D+1"],
                        ["AVULSA", "Consulta avulsa", "sem esteira — só agenda"],
                        ["NAO_FECHOU", "Não fechou", "Concierge acolhe no D+1 (régua D1–D5)"],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFcResultado(value)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left transition-colors",
                          fcResultado === value ? "border-brand-musgo bg-brand-musgo text-brand-papel" : "border-brand-oliva/25 bg-white/70 text-brand-tinta hover:bg-brand-creme/50",
                        )}
                      >
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className={cn("block text-[11px]", fcResultado === value ? "text-brand-papel/80" : "text-muted-foreground")}>{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {fcResultado !== "NAO_FECHOU" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="mr-1">Fechou tudo?</Label>
                      <button type="button" onClick={() => setFcCompleto(true)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", fcCompleto ? "border-brand-musgo bg-brand-musgo text-brand-papel" : "border-brand-oliva/25 bg-white/70")}>Completo (10% desc.)</button>
                      <button type="button" onClick={() => setFcCompleto(false)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", !fcCompleto ? "border-brand-musgo bg-brand-musgo text-brand-papel" : "border-brand-oliva/25 bg-white/70")}>Parcial (5% desc.)</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Valor vendido (R$)</Label>
                        <Input value={fcSold} onChange={(event) => setFcSold(event.target.value)} inputMode="decimal" placeholder="9000" />
                      </div>
                      <div>
                        <Label>Valor já recebido (R$)</Label>
                        <Input value={fcReceived} onChange={(event) => setFcReceived(event.target.value)} inputMode="decimal" placeholder="0" />
                      </div>
                    </div>
                    {!fcCompleto ? (
                      <div>
                        <Label>Motivo do parcial</Label>
                        <Input value={fcPartialReason} onChange={(event) => setFcPartialReason(event.target.value)} placeholder="Ex.: fechou só a consulta + 3 meses" />
                      </div>
                    ) : null}
                    <div>
                      <Label>Observações do fechamento (opcional)</Label>
                      <Input value={fcObjection} onChange={(event) => setFcObjection(event.target.value)} placeholder="O que fechou, condições, NF..." />
                    </div>
                  </>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Categoria da objeção</Label>
                      <select value={fcObjectionCategory} onChange={(event) => setFcObjectionCategory(event.target.value as CrmObjectionCategory)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                        {objectionOptions.map((item) => <option key={item} value={item}>{objectionCategoryLabels[item]}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Objeção / motivo (obrigatório)</Label>
                      <Input value={fcObjection} onChange={(event) => setFcObjection(event.target.value)} placeholder="Ex.: vai conversar com a família" />
                    </div>
                  </div>
                )}
                {fcFeedback ? (
                  <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {fcFeedback}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <LiquidButton type="submit" className="h-10 px-5">Salvar fechamento</LiquidButton>
                  <Button type="button" variant="outline" onClick={() => setFechamentoOpen(false)}>Cancelar</Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
        {leadModalOpen ? (
          <motion.div
            key="modal-novo-lead"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] grid place-items-center bg-brand-tinta/30 px-4 py-6 backdrop-blur-sm"
            onClick={() => setLeadModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="max-h-[86dvh] w-[min(32rem,94vw)] overflow-y-auto rounded-2xl border border-brand-oliva/18 bg-brand-papel p-5 shadow-[0_32px_80px_rgba(43,46,36,0.28)] sm:p-6"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-label="Novo lead"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-xl text-brand-musgo">
                    <UserPlus className="h-5 w-5" aria-hidden="true" />
                    Novo lead sem retrabalho
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Se o telefone já existir, o app avisa e reaproveita o cadastro — nada duplica.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setLeadModalOpen(false)} aria-label="Fechar">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreateLead}>
                <div>
                  <Label>Nome</Label>
                  <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome ou referência" />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="11999999999" />
                </div>
                <div>
                  <Label>Origem</Label>
                  <Input value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="Instagram, indicação..." />
                </div>
                <div>
                  <Label>Valor potencial</Label>
                  <Input value={newValue} onChange={(event) => setNewValue(event.target.value)} inputMode="decimal" />
                </div>
                <div>
                  <Label>Temperatura</Label>
                  <select value={newTemp} onChange={(event) => setNewTemp(event.target.value as CrmLeadTemperature)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                    <option value="COLD">Frio</option>
                    <option value="WARM">Morno</option>
                    <option value="HOT">Quente</option>
                  </select>
                </div>
                <div>
                  <Label>Persona</Label>
                  <select value={newFit} onChange={(event) => setNewFit(event.target.value as CrmPersonaFit)} className="mt-1 h-11 w-full rounded-md border border-input bg-white/72 px-3 text-sm">
                    <option value="AAA">AAA</option>
                    <option value="HIGH_TICKET">High ticket</option>
                    <option value="MEDIUM">Médio</option>
                    <option value="LOW_FIT">Baixo fit</option>
                    <option value="UNKNOWN">A validar</option>
                  </select>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 sm:col-span-2">
                  <LiquidButton type="submit" size="sm">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Criar contato e oportunidade
                  </LiquidButton>
                  <Button type="button" variant="outline" onClick={() => setLeadModalOpen(false)}>
                    Fechar
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <GuidedTour open={tourOpen} steps={kanbanTourSteps} title="Como usar o Kanban" onClose={() => setTourOpen(false)} />
          {importOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-brand-tinta/35 p-4 backdrop-blur-sm" onClick={() => setImportOpen(false)}>
          <div className="w-[min(30rem,94vw)] rounded-xl border border-brand-oliva/25 bg-brand-papel p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-brand-musgo">Importar do Feegow</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              No Feegow, exporte a lista de pacientes (ou leads) e salve como <strong>CSV</strong>. O app acha as colunas de
              nome, telefone e e-mail sozinho e não duplica quem já existe.
            </p>
            <div className="mt-4 flex gap-2">
              {([["PATIENT", "Pacientes (já atendidos)"], ["LEAD", "Leads (para cadências)"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setImportAs(value)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-semibold",
                    importAs === value ? "border-brand-musgo bg-brand-musgo text-brand-papel" : "border-brand-oliva/25 bg-white/60 text-brand-oliva",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-4 w-full text-sm"
              aria-label="Arquivo CSV do Feegow"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFeegowFile(file);
                event.target.value = "";
              }}
            />
            {importFeedback ? (
              <p className="mt-3 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-3 py-2 text-sm font-semibold text-brand-tinta">
                {importFeedback}
              </p>
            ) : null}
            <div className="mt-4 text-right">
              <Button type="button" variant="ghost" size="sm" onClick={() => setImportOpen(false)}>Fechar</Button>
            </div>
          </div>
        </div>
      ) : null}
</div>
  );
}
