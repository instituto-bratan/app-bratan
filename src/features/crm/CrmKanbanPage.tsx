import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
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
  Trash2, MoreHorizontal, PhoneCall, ChevronLeft, ChevronRight } from "lucide-react";
import {
  createFinId,
  moneyFin,
  parseFinAmount,
  paymentMethodLabels,
  salePaymentMethods,
  type FinPaymentMethod,
  type FinSale,
  type FinSaleItemType,
} from "@/features/financeiro/financeiroData";
import { formataValor, itensDaComanda, totalDosItensFechados, type ItemFechado } from "@/features/financeiro/catalogoPrecificacao";
import { ConferenciaFechamentoCard } from "@/features/financeiro/ConferenciaFechamentoCard";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { createRemoteFinCashEntry, listRemoteFinCashEntries, listRemotePagamentos, uploadRemoteComprovante } from "@/lib/remoteData";
import { todayISO } from "@/lib/localStore";
import { RecebimentoNoKanban } from "./RecebimentoNoKanban";
import {
  ehContinuacao,
  parcelaVazia,
  travaDoComprovante,
  travaDoValorRecebido,
  type ParcelaDoRecebimento,
  type ResultadoDoFechamento,
  type TipoRecebimento,
} from "./recebimentoKanbanData";
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
  applyContactChannels,
  cadenceSheetCompletion,
  canalAtualDoPaciente,
  completeCrmTask,
  gestorCallCompletion,
  canUserAccessContact,
  contactDisplayName,
  createDealForContact,
  crmModuleRoutes,
  crmRoleLabels,
  dealStageHints,
  dealStageLabels,
  dealStages,
  findOrCreateCrmContact,
  formatCrmDateTime,
  moneyCrm,
  moveDealStage,
  objectionCategoryLabels,
  programGateStatus,
  adhesionChannelLabels,
  corrigirCanalDaJornada,
  programOutcomeLabels,
  programPhaseHints,
  programPhaseLabels,
  programPhases,
  programPhaseSpecs,
  setProgramPhase,
  taskEffectiveStatus,
  updateContactChannels,
  type CadenceSheetDStatus,
  type CrmAdhesionChannel,
  type CrmContact,
  type CrmDeal,
  type CrmDealStage,
  type CrmLeadTemperature,
  type CrmObjectionCategory,
  type CrmPersonaFit,
  type CrmProgramOutcome,
  type CrmProgramPhase,
  type CrmRole,
  type CrmState,
  type CrmTask,
  type GestorCallStatus,
} from "./crmData";
import { CrmSyncBanner } from "./CrmSyncBanner";
import { PatientPicker, type PatientPickerValue } from "./PatientPicker";
import { ContactChannelsFields } from "./ContactChannelsFields";
import {
  contactChannelsIssue,
  contactChannelsValues,
  emptyContactChannels,
  formatPhoneBR,
  phoneDigits,
  type ContactChannelsDraft,
} from "./contactChannels";
import { useCrmState } from "./useCrmState";
import { CadenciaKanban } from "./CadenciaKanban";
import { resumoDasCadencias, rotuloCurtoDaCadencia } from "./cadenciaKanbanData";
import { buildResumoSla, formatMinutos, slaDoNegocio } from "./slaLead";
import { PRAZO_SNCR, marcarReceitaSncr } from "./crmData";
import { configAtual } from "@/lib/configNegocio";
import { toast } from "@/components/ui/avisos";
import { RepescagemBoard, type ResultadoLigacao } from "./RepescagemBoard";
import { usePanScroll } from "./usePanScroll";
import { PRAZO_DA_FASE_DIAS, diasNaFase, faseVencida, ordenaPorTempoNaFase } from "./faseVencida";
import { SenhaDeGestor } from "@/components/SenhaDeGestor";
import { DENSIDADE_PADRAO, DENSIDADE_STORAGE_KEY, densityColumns, densityLabels, type KanbanDensity } from "./kanbanDensidade";
import { adicionarRepescagemManual, atualizarObservacaoRepescagem, buildQuadroRepescagem, iniciarRepescagem, marcarHorarioDaLigacao, type CandidatoRepescagem, type RepescagemManual } from "./repescagemData";

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
// UMA ABA POR CADÊNCIA (08/09/2026, Lucas: "não apenas do plano de acompanhamento
// — um kanban da cadência 3·1·3·1, outro da D1–D5 e assim vai"). Os dois quadros
// fixos continuam; cada cadência com passos vira um quadro "cadencia:<id>".
type KanbanBoardFixo = "comercial" | "programa";
type KanbanBoard = KanbanBoardFixo | "repescagem" | `cadencia:${string}`;
const boardLabels: Record<KanbanBoardFixo, string> = { programa: "Plano de Acompanhamento", comercial: "Em aberto (antes do fechamento)" };
function cadenceSheetStatusLabelSafe(status: CadenceSheetDStatus) {
  return { SEM_RESPOSTA: "sem resposta", SATISFEITO: "respondeu · satisfeito", INSATISFEITO_CONCIERGE: "insatisfeito → Concierge", AGENDADO_RESOLVIDO: "agendado · resolvido" }[status];
}
function cadenciaDoBoard(board: KanbanBoard): string | null {
  return board.startsWith("cadencia:") ? board.slice("cadencia:".length) : null;
}

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

/** A comanda usa MAIÚSCULO, o comprovante usa o enum minúsculo do banco. */
function formaParaComprovante(forma: FinPaymentMethod) {
  if (forma === "PIX") return "pix" as const;
  if (forma === "CARTAO_CREDITO") return "cartao_credito" as const;
  if (forma === "CARTAO_DEBITO") return "cartao_debito" as const;
  if (forma === "DINHEIRO") return "dinheiro" as const;
  if (forma === "TRANSFERENCIA") return "transferencia" as const;
  return "outro" as const;
}

// Rótulo dos canais: vem do motor (adhesionChannelLabels), para tela e régua
// nunca discordarem do nome do canal.
const channelLabels = adhesionChannelLabels;
const channelShort: Record<CrmAdhesionChannel, string> = {
  PROGRAMA_ACOMPANHAMENTO: "Programa",
  CLUBE_BRATAN: "Black",
  SOMENTE_TRATAMENTO: "Tratamento",
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
      "O botão \"Registrar fechamento\" é a porta de entrada: escolha o paciente, marque o que ele fechou (Programa, Clube, Só Tratamento, avulsa ou não fechou), escolha os produtos da tabela de preços (Programa + HCG + vitamina D…) e a esteira certa liga sozinha — a comanda já nasce itemizada.",
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
  const hojeISO = todayISO();
  const dias = diasNaFase(deal, hojeISO);
  const vencida = faseVencida(deal, hojeISO);
  const prazo = PRAZO_DA_FASE_DIAS[phase];

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
        <div className="flex shrink-0 flex-col items-end gap-1">
          {deal.adhesionChannel ? <Badge variant="gold">{channelShort[deal.adhesionChannel]}</Badge> : null}
          {prazo !== null ? (
            <span
              className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", vencida ? "bg-red-100 text-red-700" : "bg-brand-papel text-brand-oliva")}
              title={vencida ? `Prazo da fase: ${prazo} dia(s). Ninguém marcou o gate — a coordenação pode avançar.` : `Prazo da fase: ${prazo} dia(s)`}
            >
              {vencida ? `parado há ${dias} dias` : dias === 0 ? "entrou hoje" : `há ${dias} dia${dias > 1 ? "s" : ""}`}
            </span>
          ) : null}
        </div>
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
  const { state, persist, syncFailed, syncErrorDetail, retrySync, deleteLead } = useCrmState();
  const [sncrData, setSncrData] = useState("");
  // O fechamento aqui também lança a comanda do dia (pedido do Lucas, 14/08).
  const { pessoa: pessoaAuth, session, isPreview } = useAuth();
  const financeiro = useFinanceiro(Number(todayISO().slice(0, 4)));
  const podeSubirArquivo = Boolean(pessoaAuth && session && !isPreview);
  // Os lembretes entram só para a CONFERÊNCIA não dar alarme falso: quem fechou
  // e combinou pagar dia 21 tem dinheiro agendado, não dinheiro faltando.
  // Mesma chave do módulo Pagamentos — o TanStack reaproveita o cache.
  const lembretesQuery = useQuery({
    queryKey: ["pagamentos-lembretes"],
    queryFn: listRemotePagamentos,
    enabled: podeSubirArquivo,
    staleTime: 30_000,
  });
  // O caixa do crediário entra na Conferência: dinheiro de fechamento mora lá.
  const caixaQuery = useQuery({
    queryKey: ["fin-cash-entries"],
    queryFn: listRemoteFinCashEntries,
    enabled: podeSubirArquivo,
    staleTime: 30_000,
  });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [board, setBoard] = useState<KanbanBoard>(() => readLocalValue<KanbanBoard>("app-bratan-kanban-board-v2", "programa"));
  const [section, setSection] = useState<KanbanSection>(() => readLocalValue<KanbanSection>("app-bratan-kanban-section", "all"));
  const [density, setDensity] = useState<KanbanDensity>(() => readLocalValue<KanbanDensity>(DENSIDADE_STORAGE_KEY, DENSIDADE_PADRAO));
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState("");
  const [targetStage, setTargetStage] = useState<CrmDealStage>("CONTATADO");
  // Data da consulta: obrigatória ao mover para Agendada/Confirmada — é ela que
  // liga o paciente no 3·1 (−3/−1) da recepção (01/08/2026).
  const [targetConsultaData, setTargetConsultaData] = useState("");
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
  // CORRIGIR O CANAL DO FECHAMENTO (10/09/2026): o pedido fica aqui esperando a
  // senha do gestor; só depois de conferida a régua é reescrita.
  const [pedidoCanal, setPedidoCanal] = useState<{ dealId: string; canal: CrmAdhesionChannel | null } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newSource, setNewSource] = useState("Manual");
  const [newValue, setNewValue] = useState("18000");
  const [newTemp, setNewTemp] = useState<CrmLeadTemperature>("WARM");
  // Recebimento no CADASTRO do paciente (pedido do Lucas, 14/08): é o caso do
  // sinal de consulta — quem está com o celular recebe o PIX, cadastra o
  // paciente e anexa o comprovante aqui mesmo, sem passar por outra tela.
  const [newRecebido, setNewRecebido] = useState("");
  const [newDivisao, setNewDivisao] = useState<ParcelaDoRecebimento[]>([parcelaVazia("PIX")]);
  const [newItemTipo, setNewItemTipo] = useState<FinSaleItemType>("SINAL");
  const [newItens, setNewItens] = useState<ItemFechado[]>([]);
  const [newTipo, setNewTipo] = useState<"SINAL_CONSULTA" | "PRIMEIRA_CONSULTA" | "RETORNO">("SINAL_CONSULTA");
  const [newNotaInstrucao, setNewNotaInstrucao] = useState("");
  const [newNotaQuando, setNewNotaQuando] = useState<"AGORA" | "COM_A_CONSULTA" | "AGUARDANDO_ORIENTACAO">("COM_A_CONSULTA");
  const [newArquivos, setNewArquivos] = useState<File[]>([]);
  const [newMandaDepois, setNewMandaDepois] = useState(false);
  const newInputArquivo = useRef<HTMLInputElement>(null);
  const [newFit, setNewFit] = useState<CrmPersonaFit>("UNKNOWN");
  const [feedback, setFeedback] = useState("");
  const [draggingDealId, setDraggingDealId] = useState("");
  const [dragOverStage, setDragOverStage] = useState<CrmDealStage | null>(null);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  // Cadastro do FECHAMENTO (Estevão) — a porta de entrada da jornada (Lucas, 22/07).
  const [fechamentoOpen, setFechamentoOpen] = useState(false);
  const [fcPatient, setFcPatient] = useState<PatientPickerValue>({ ref: "", name: "" });
  const [fcChannels, setFcChannels] = useState<ContactChannelsDraft>(emptyContactChannels);
  const [fcResultado, setFcResultado] = useState<ResultadoDoFechamento>("PROGRAMA_ACOMPANHAMENTO");
  const [fcCompleto, setFcCompleto] = useState(true);
  const [fcSold, setFcSold] = useState("");
  const [fcReceived, setFcReceived] = useState("");
  // FECHAMENTO QUE JÁ LANÇA A COMANDA E O COMPROVANTE (pedido do Lucas em
  // 14/08/2026, depois da reunião com a CEO): "na tela do Kanban, quando vai
  // cadastrar o paciente ou ligar um existente, já anexa ali o comprovante e
  // dali já lança a comanda automaticamente... pra gente evitar o retrabalho."
  const [fcDivisao, setFcDivisao] = useState<ParcelaDoRecebimento[]>([parcelaVazia("PIX")]);
  const [fcTipo, setFcTipo] = useState<TipoRecebimento>("TRATAMENTO");
  const [fcItemTipo, setFcItemTipo] = useState<FinSaleItemType>("TRATAMENTO");
  // O que o paciente fechou, produto a produto, da tabela de preços (02/09/2026).
  const [fcItens, setFcItens] = useState<ItemFechado[]>([]);
  const [fcNotaInstrucao, setFcNotaInstrucao] = useState("");
  const [fcNotaQuando, setFcNotaQuando] = useState<"AGORA" | "COM_A_CONSULTA" | "AGUARDANDO_ORIENTACAO">("COM_A_CONSULTA");
  const [fcArquivos, setFcArquivos] = useState<File[]>([]);
  const [fcMandaDepois, setFcMandaDepois] = useState(false);
  const fcInputArquivo = useRef<HTMLInputElement>(null);
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
  // JORNADA ENCERRADA NÃO FICA NA COLUNA ATIVA (10/09/2026, vídeo da CEO: o
  // mesmo paciente aparecia DUAS VEZES em "Boas-vindas"). Quando o paciente
  // fecha de novo, o motor encerra a jornada anterior como Renovação — mas ela
  // guardava a fase antiga e continuava no quadro, ao lado da nova. Com desfecho
  // registrado, o cartão sai do quadro (o histórico segue no perfil).
  const programDeals = useMemo(() => visibleDeals.filter((deal) => deal.programPhase && !deal.programOutcome), [visibleDeals]);
  const canOverridePhase = isCoordenacao(pessoa?.cargo);
  // Abas de cadência: quem tem gente ativa vira aba; as vazias ficam num seletor.
  const cadenciasResumo = useMemo(() => resumoDasCadencias(state, todayISO()), [state]);
  // SLA DE RESPOSTA AO LEAD (14/09/2026, proposta 3.9): minutos até o primeiro toque;
  // o limite (padrão 5 min) mora nas Configurações do negócio.
  const resumoSla = useMemo(() => buildResumoSla(state, new Date().toISOString(), configAtual<number>("crm.sla_lead_minutos") ?? 5), [state]);
  const cadenciaAtiva = cadenciaDoBoard(board);
  const cadenciasComGente = cadenciasResumo.filter((item) => item.ativos > 0 || `cadencia:${item.cadence.id}` === board);
  const cadenciasVazias = cadenciasResumo.filter((item) => !cadenciasComGente.includes(item));
  function concluirPassoDaCadencia(taskId: string, status: CadenceSheetDStatus) {
    const completion = cadenceSheetCompletion(status);
    const antes = state; // DESFAZER (14/09/2026, proposta 4.6)
    persist((current) => completeCrmTask(current, taskId, { ...completion, actorId: pessoa?.id ?? "preview" }));
    setFeedback(`Toque registrado: ${cadenceSheetStatusLabelSafe(status)}. O cartão anda sozinho para o próximo passo.`);
    toast(`Toque registrado: ${cadenceSheetStatusLabelSafe(status)}.`, { tom: "ok", acao: { rotulo: "Desfazer", onClick: () => void persist(() => antes) } });
  }
  // ---- Repescagens (08/09): isca no WhatsApp → ligação. Tudo pela cadência cad-repescagem.
  const quadroRepescagem = useMemo(() => buildQuadroRepescagem(state, financeiro.sales, todayISO()), [state, financeiro.sales]);
  const actorId = pessoa?.id ?? "preview";
  function iniciarRepescagemDe(candidato: CandidatoRepescagem) {
    persist((current) => iniciarRepescagem(current, candidato, { userId: actorId, role: "CONCIERGE" }, todayISO()));
    setFeedback(`Repescagem de ${contactDisplayName(candidato.contact)} iniciada: mande a isca pelo WhatsApp e marque "Isca enviada".`);
  }
  function adicionarRepescagem(dados: RepescagemManual) {
    let aviso = "";
    persist((current) => {
      const r = adicionarRepescagemManual(current, dados, { userId: actorId, role: "CONCIERGE" }, todayISO());
      aviso = r.aviso;
      return r.state;
    });
    setFeedback(aviso || `${dados.nome} entrou na repescagem: mande a isca pelo WhatsApp e marque "Isca enviada".`);
  }
  function observacaoRepescagem(enrollmentId: string, texto: string) {
    persist((current) => atualizarObservacaoRepescagem(current, enrollmentId, texto));
  }
  function iscaEnviada(taskId: string) {
    persist((current) => completeCrmTask(current, taskId, { result: "SENT", actorId, resultNotes: "Isca enviada — aguardando o melhor horário para ligar" }));
    setFeedback("Isca registrada com data e hora. Quando o paciente responder o horário, marque em \"Ligar em\" no cartão.");
  }
  function marcarHorario(taskId: string, dueAtISO: string) {
    persist((current) => marcarHorarioDaLigacao(current, taskId, dueAtISO));
    setFeedback("Horário da ligação marcado.");
  }
  function liguei(taskId: string, resultado: ResultadoLigacao) {
    const mapa: Record<ResultadoLigacao, { result: "SCHEDULED" | "RESPONDED" | "NO_RESPONSE"; resultNotes: string }> = {
      AGENDOU: { result: "SCHEDULED", resultNotes: "Atendeu · agendou retorno" },
      VAI_PENSAR: { result: "RESPONDED", resultNotes: "Atendeu · vai pensar" },
      NAO_QUER: { result: "RESPONDED", resultNotes: "Atendeu · não quer agora" },
      NAO_ATENDEU: { result: "NO_RESPONSE", resultNotes: "Não atendeu" },
    };
    persist((current) => completeCrmTask(current, taskId, { ...mapa[resultado], actorId }));
    setFeedback(`Ligação registrada: ${mapa[resultado].resultNotes}.`);
  }

  // ENQUADRAMENTO (08/09): o quadro ocupa o resto da tela e as colunas rolam por
  // dentro — a página não cresce com 9 mil pixels de coluna.
  const [boardTop, setBoardTop] = useState(0);
  const abasPan = usePanScroll<HTMLDivElement>();
  useEffect(() => {
    function mede() {
      if (boardRef.current) setBoardTop(Math.round(boardRef.current.getBoundingClientRect().top + window.scrollY));
    }
    mede();
    const timer = window.setTimeout(mede, 300);
    window.addEventListener("resize", mede);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", mede);
    };
  }, [board, fullscreen, tourSeen, feedback]);

  function concluirLigacaoDoGestor(taskId: string, status: GestorCallStatus) {
    const completion = gestorCallCompletion(status);
    persist((current) => completeCrmTask(current, taskId, { ...completion, actorId: pessoa?.id ?? "preview" }));
    setFeedback("Ligação registrada na trilha do Gestor.");
  }
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
    writeLocalValue(DENSIDADE_STORAGE_KEY, next);
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

  /**
   * Lança a comanda do dia e o comprovante a partir do Kanban.
   *
   * Pedido do Lucas (14/08/2026): "na tela do Kanban, quando vai cadastrar o
   * paciente ou ligar um existente, já vai anexar ali o comprovante e dali já vai
   * lançar a comanda automaticamente... pra gente evitar esse retrabalho."
   *
   * Está num lugar só de propósito: os dois caminhos da tela (cadastrar o
   * paciente e registrar o fechamento) chamam esta função, então não existe
   * chance de um se comportar diferente do outro.
   */
  /**
   * SOBE OS COMPROVANTES — um por arquivo, ligados ao paciente (e à comanda,
   * quando existe). Virou função própria em 25/08/2026 porque o caminho do
   * DINHEIRO saía antes do upload e o arquivo anexado no fechamento era
   * silenciosamente descartado.
   */
  function subirComprovantes(values: {
    arquivos: File[];
    pacienteNome: string;
    contactRef: string;
    divisao: ParcelaDoRecebimento[];
    valorTotal: number;
    saleRef: string | null;
    observacao: string;
  }) {
    if (!values.arquivos.length || !podeSubirArquivo || !pessoaAuth) return Promise.resolve();
    // Uma forma por arquivo (pagamento dividido): cada comprovante leva a forma
    // e o valor da sua parcela. Se não bate, o total fica no primeiro para a
    // soma do dia não inflar.
    const umPorForma = values.arquivos.length === values.divisao.length && values.divisao.length > 1;
    return Promise.all(
      values.arquivos.map((file, indice) => {
        const parcela = umPorForma ? values.divisao[indice] : values.divisao[0];
        const valorDoComprovante = umPorForma
          ? parseFinAmount(values.divisao[indice].valorTexto)
          : indice === 0
            ? values.valorTotal
            : 0;
        return uploadRemoteComprovante({
          pessoa: pessoaAuth as never,
          file,
          pacienteReferencia: values.pacienteNome,
          crmContactRef: values.contactRef,
          valor: valorDoComprovante,
          formaPagamento: formaParaComprovante(parcela?.forma ?? "PIX"),
          observacao:
            values.arquivos.length > 1
              ? `${values.observacao} · comprovante ${indice + 1} de ${values.arquivos.length}`
              : values.observacao,
          saleRef: values.saleRef ?? undefined,
          alimentarRecebiveis360: false,
        });
      }),
    ).then(() => undefined);
  }

  function lancarComandaEComprovante(values: {
    contactRef: string;
    pacienteNome: string;
    valorRecebido: number;
    /** Uma linha por forma de pagamento (dividido quando tem mais de uma). */
    divisao: ParcelaDoRecebimento[];
    itemTipo: FinSaleItemType;
    /** Produtos da tabela escolhidos no fechamento; vazio = um item só do tipo `itemTipo`. */
    itens: ItemFechado[];
    /** Vários (18/08/2026): PIX + cartão, ou quem pagou junto, são N arquivos. */
    arquivos: File[];
    /** Marcou "vou mandar depois": fica AGUARDANDO de propósito. */
    mandaDepois: boolean;
    notaInstrucao: string;
    notaQuando: "AGORA" | "COM_A_CONSULTA" | "AGUARDANDO_ORIENTACAO";
    tipo: "SINAL_CONSULTA" | "PRIMEIRA_CONSULTA" | "TRATAMENTO" | "RETORNO";
    plano: boolean;
    origem: string;
    observacao: string;
    setor: "VENDAS" | "AGENDAMENTO" | "RECEPCAO";
  }) {
    if (values.valorRecebido <= 0) return null;

    // DINHEIRO VAI PRO CAIXA, NÃO PRA COMANDA (20/08/2026, regra do Lucas). A
    // casa já vivia isso nos Lembretes e no caso Guilherme R$ 8.000: nota física
    // mora no caixa do crediário e é reconhecida como lucro no mês; comanda é o
    // que o banco confere (PIX/cartão). Então a parte em dinheiro vira ENTRADA
    // no caixa (com o vínculo do paciente) e SÓ o resto vira comanda.
    const divisaoBase = values.divisao.length ? values.divisao : [parcelaVazia("PIX")];
    const valorDaParcela = (parcela: ParcelaDoRecebimento) =>
      divisaoBase.length === 1 ? values.valorRecebido : parseFinAmount(parcela.valorTexto);
    const parcelasDinheiro = divisaoBase.filter((parcela) => parcela.forma === "DINHEIRO");
    const parcelasComanda = divisaoBase.filter((parcela) => parcela.forma !== "DINHEIRO");
    const valorDinheiro = Math.round(parcelasDinheiro.reduce((soma, parcela) => soma + valorDaParcela(parcela), 0) * 100) / 100;
    const valorComanda = Math.round((values.valorRecebido - valorDinheiro) * 100) / 100;

    if (valorDinheiro > 0) {
      const entradaNoCaixa = {
        id: createFinId("fcash"),
        entryDate: todayISO(),
        direction: "ENTRADA" as const,
        description: `Fechamento — ${values.pacienteNome} (dinheiro)`,
        amount: valorDinheiro,
        crmContactRef: values.contactRef,
      };
      if (podeSubirArquivo) {
        void createRemoteFinCashEntry(entradaNoCaixa, pessoaAuth?.id ?? null).catch((falha) => {
          console.warn("Entrada do caixa não sincronizou.", falha);
          setFeedback(
            `⚠️ O DINHEIRO NÃO ENTROU NO CAIXA (${(falha as Error).message}). Lance a entrada na mão em Financeiro › Crediário para o cofre não ficar furado.`,
          );
        });
      }
    }

    if (valorComanda <= 0) {
      // Tudo em dinheiro: o registro é o caixa do crediário. Comanda de valor
      // zero só faria ruído no Lançar Dia.
      //
      // MAS O COMPROVANTE NÃO PODE SUMIR (25/08/2026): antes esta saída
      // acontecia ANTES do upload, então quem anexava o print de um pagamento
      // em dinheiro perdia o arquivo — e ia subir de novo, na mão, pelo módulo
      // Comprovantes. Agora o arquivo sobe do mesmo jeito, ligado ao paciente.
      subirComprovantes({
        arquivos: values.arquivos,
        pacienteNome: values.pacienteNome,
        contactRef: values.contactRef,
        divisao: parcelasDinheiro.length ? parcelasDinheiro : divisaoBase,
        valorTotal: valorDinheiro,
        saleRef: null,
        observacao: [values.observacao.trim(), values.notaInstrucao.trim()].filter(Boolean).join(" · ") || "Fechamento em dinheiro (caixa do crediário)",
      });
      return { saleId: null, valorDinheiro, valorComanda: 0 };
    }

    const saleId = createFinId("fsale");
    const comanda: FinSale = {
      id: saleId,
      saleDate: todayISO(),
      patientName: values.pacienteNome,
      crmContactRef: values.contactRef,
      notes: [values.origem, values.observacao].map((item) => item.trim()).filter(Boolean).join(" · "),
      adhesion: values.plano ? "SIM" : "ABERTO",
      createdAt: new Date().toISOString(),
      // A comanda leva só o que o BANCO vai conferir — o dinheiro foi pro caixa.
      // Com produtos da tabela escolhidos, cada um vira um item com o nome
      // oficial (é o que o Lucro Inteligente lê); sem, um item só do tipo marcado.
      items: (() => {
        const itemizados = itensDaComanda(values.itens, valorComanda, parseFinAmount, () => createFinId("fitem"));
        return itemizados.length
          ? itemizados
          : [
              {
                id: createFinId("fitem"),
                itemType: values.itemTipo,
                amount: valorComanda,
                description: values.notaInstrucao.trim(),
              },
            ];
      })(),
      // PAGAMENTO DIVIDIDO: uma linha por forma (sem as de dinheiro, que já
      // entraram no caixa do crediário).
      payments: parcelasComanda.map((parcela) => {
        const valorDaForma = parcelasComanda.length === 1 ? valorComanda : valorDaParcela(parcela);
        const ehCartao = parcela.forma === "CARTAO_CREDITO" || parcela.forma === "CARTAO_DEBITO";
        return {
          id: createFinId("fpay"),
          method: parcela.forma,
          amount: valorDaForma,
          installments: Math.max(1, Number(parcela.parcelas) || 1),
          cardMachine: ehCartao ? ("ITAU" as const) : null,
          // Com arquivo em mãos o comprovante já nasce ANEXADO; sem, AGUARDANDO.
          comprovanteStatus: values.arquivos.length ? ("ANEXADO" as const) : ("AGUARDANDO" as const),
        };
      }),
      tipoAtendimento: values.tipo,
      planoOuAvulsa: values.plano ? "PLANO" : "AVULSA",
      origemIndicacao: values.origem.trim(),
      notaInstrucao: values.notaInstrucao.trim(),
      notaQuando: values.notaQuando,
      consultaAgendadaEm: null,
      lancadoPorSetor: values.setor,
      aguardandoExplicacao: false,
    };
    financeiro.addSale(comanda, (mensagem) =>
      setFeedback(
        `⚠️ A COMANDA NÃO FOI GRAVADA (${mensagem}). Ela está só neste aparelho — lance de novo pelo "Lançar dia" para o dinheiro entrar no fechamento.`,
      ),
    );

    // O comprovante nasce ligado a ESTA comanda (saleRef) — é assim que o
    // financeiro vê "R$ 5.000: 2.000 no PIX + 3.000 no cartão" com os prints.
    void subirComprovantes({
      arquivos: values.arquivos,
      pacienteNome: values.pacienteNome,
      contactRef: values.contactRef,
      divisao: parcelasComanda.length ? parcelasComanda : divisaoBase,
      valorTotal: valorComanda,
      saleRef: saleId,
      observacao: [values.observacao.trim(), values.notaInstrucao.trim()].filter(Boolean).join(" · ") || "Lançado pelo Kanban",
    }).catch((falha) => {
      // O STATUS NÃO PODE MENTIR (18/08/2026). Antes a comanda nascia
      // "ANEXADO" e, se o upload falhasse, ela continuava dizendo que tinha
      // comprovante — o furo só aparecia na conferência, dias depois.
      financeiro.updateSale({
        ...comanda,
        payments: comanda.payments.map((pagamento) => ({ ...pagamento, comprovanteStatus: "AGUARDANDO" as const })),
      });
      setFeedback(
        `Comanda salva, mas o comprovante NÃO subiu (${(falha as Error).message}). A comanda ficou marcada como AGUARDANDO — anexe pelo módulo Comprovantes para não ficar sem.`,
      );
    });

    return { saleId, valorDinheiro, valorComanda };
  }

  function handleCreateLead(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    if (!newName.trim() && !newPhone.trim()) {
      setFeedback("Informe pelo menos nome ou telefone.");
      return;
    }
    const canaisNovo = { phone: newPhone, email: newEmail };
    const problema = contactChannelsIssue(canaisNovo);
    if (problema) {
      setFeedback(problema);
      return;
    }

    const valoresDoLead = {
      fullName: newName.trim() || newPhone.trim(),
      ...contactChannelsValues(canaisNovo),
      sourceChannel: newSource,
      leadTemperature: newTemp,
      personaFit: newFit,
      ownerUserId: pessoa?.id ?? "manual",
      commercialOwnerId: pessoa?.id ?? "manual",
    };
    // Mesma trava do fechamento: recebeu dinheiro no cadastro, o comprovante
    // não fica no silêncio (18/08/2026).
    const travaValorLead = travaDoValorRecebido({
      valor: parseFinAmount(newRecebido),
      quantosArquivos: newArquivos.length,
      divisao: newDivisao,
      parse: parseFinAmount,
    });
    if (travaValorLead) {
      setFeedback(travaValorLead);
      return;
    }
    const travaComprovanteLead = travaDoComprovante({
      valor: parseFinAmount(newRecebido),
      formas: newDivisao.map((parcela) => parcela.forma),
      quantosArquivos: newArquivos.length,
      mandaDepois: newMandaDepois,
    });
    if (travaComprovanteLead) {
      setFeedback(travaComprovanteLead);
      return;
    }

    // Resolve o ref ANTES de gravar: a comanda e o comprovante precisam dele
    // para nascerem ligados ao paciente (id determinístico → não duplica).
    const refDoLead = findOrCreateCrmContact(state, valoresDoLead, pessoa?.id ?? "manual").contact.id;

    persist((current) => {
      const created = findOrCreateCrmContact(current, { ...valoresDoLead, id: refDoLead }, pessoa?.id ?? "manual");
      setFeedback(created.duplicateWarning || "Lead criado e oportunidade aberta sem duplicar cadastro.");
      // Casou com alguém que já existia: aproveita para completar o que faltava.
      const comContato = applyContactChannels(created.state, created.contact.id, canaisNovo, pessoa?.id ?? "manual");
      const withDeal = createDealForContact(comContato, {
        contactId: created.contact.id,
        title: `Primeira consulta - ${contactDisplayName(created.contact)}`,
        ownerUserId: pessoa?.id ?? "manual",
        estimatedValue: Number(newValue) || 0,
        sourceChannel: newSource,
      });
      return withDeal;
    });

    // Recebeu junto com o cadastro? A comanda e o comprovante saem daqui.
    const recebidoAgora = parseFinAmount(newRecebido);
    if (recebidoAgora > 0) {
      const lancado = lancarComandaEComprovante({
        contactRef: refDoLead,
        pacienteNome: newName.trim() || newPhone.trim(),
        valorRecebido: recebidoAgora,
        divisao: newDivisao,
        itemTipo: newItemTipo,
        itens: newItens,
        arquivos: newArquivos,
        mandaDepois: newMandaDepois,
        notaInstrucao: newNotaInstrucao,
        notaQuando: newNotaQuando,
        tipo: newTipo,
        plano: false,
        origem: newSource,
        observacao: "",
        setor: "AGENDAMENTO",
      });
      setFeedback(
        lancado && lancado.valorDinheiro > 0
          ? lancado.valorComanda > 0
            ? `Paciente cadastrado: ${moneyFin(lancado.valorComanda)} na comanda do dia e ${moneyFin(lancado.valorDinheiro)} em dinheiro direto no caixa do crediário.`
            : `Paciente cadastrado e ${moneyFin(lancado.valorDinheiro)} em dinheiro lançados direto no caixa do crediário (dinheiro não vira comanda).`
          : `Paciente cadastrado e ${moneyFin(recebidoAgora)} lançados na comanda do dia${newArquivos.length ? ` com ${newArquivos.length} comprovante(s) anexado(s)` : " (comprovante fica aguardando)"}.`,
      );
    }

    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewRecebido("");
    setNewDivisao([parcelaVazia("PIX")]);
    setNewItens([]);
    setNewItemTipo("SINAL");
    setNewTipo("SINAL_CONSULTA");
    setNewNotaInstrucao("");
    setNewNotaQuando("COM_A_CONSULTA");
    setNewArquivos([]);
    setNewMandaDepois(false);
    setLeadModalOpen(false);
  }

  // A jornada COMEÇA aqui: Estevão cadastra o fechamento (paciente + o que
  // fechou) e o canal liga a esteira certa sozinho. Telefone é a chave única —
  // o PatientPicker busca antes de criar (regra de ouro nº 1).
  // Produto a produto: a soma das linhas é o valor vendido — quem escolhe os
  // produtos não digita o total de novo (e não erra a soma). O valor RECEBIDO
  // acompanha a soma enquanto ninguém digitou outro número nele (sinal,
  // parcial); a partir daí fica como a pessoa deixou.
  function atualizaItensFechados(itens: ItemFechado[]) {
    const totalAnterior = totalDosItensFechados(fcItens, parseFinAmount);
    setFcItens(itens);
    const total = totalDosItensFechados(itens, parseFinAmount);
    if (total <= 0) return;
    setFcSold(formataValor(total));
    if (!fcReceived.trim() || Math.abs(parseFinAmount(fcReceived) - totalAnterior) < 0.005) setFcReceived(formataValor(total));
  }

  function atualizaItensNovo(itens: ItemFechado[]) {
    const totalAnterior = totalDosItensFechados(newItens, parseFinAmount);
    setNewItens(itens);
    const total = totalDosItensFechados(itens, parseFinAmount);
    if (total <= 0) return;
    if (!newValue.trim()) setNewValue(formataValor(total));
    if (!newRecebido.trim() || Math.abs(parseFinAmount(newRecebido) - totalAnterior) < 0.005) setNewRecebido(formataValor(total));
  }

  function handleRegistrarFechamento(event: FormEvent) {
    event.preventDefault();
    setFcFeedback("");
    if (!fcPatient.ref && !fcPatient.name.trim()) return setFcFeedback("Escolha o paciente (ou digite o nome completo para criar).");
    const problemaCanais = contactChannelsIssue(fcChannels);
    if (problemaCanais) return setFcFeedback(problemaCanais);
    if (fcResultado === "NAO_FECHOU" && !fcObjection.trim()) return setFcFeedback("Não fechou: registre o motivo/objeção (é o nosso PMI).");
    const soldAmount = Number(fcSold.replace(/\./g, "").replace(",", ".")) || 0;
    const receivedAmount = Number(fcReceived.replace(/\./g, "").replace(",", ".")) || 0;
    if (fcResultado !== "NAO_FECHOU" && soldAmount <= 0) return setFcFeedback("Fechou: informe o valor vendido.");
    // O comprovante não pode se perder no silêncio (18/08/2026). Vale para
    // quem fechou E para quem não fechou mas pagou a consulta (25/08/2026).
    {
      // Valor em branco engolia a comanda E o comprovante em silêncio (25/08).
      const travaValor = travaDoValorRecebido({
        valor: receivedAmount,
        quantosArquivos: fcArquivos.length,
        divisao: fcDivisao,
        parse: parseFinAmount,
      });
      if (travaValor) return setFcFeedback(travaValor);
      const travaComprovante = travaDoComprovante({
        valor: receivedAmount,
        formas: fcDivisao.map((parcela) => parcela.forma),
        quantosArquivos: fcArquivos.length,
        mandaDepois: fcMandaDepois,
      });
      if (travaComprovante) return setFcFeedback(travaComprovante);
    }
    if (fcResultado !== "NAO_FECHOU" && !fcCompleto && !fcPartialReason.trim()) return setFcFeedback("Fechamento parcial: registre o motivo do parcial.");

    // Resolve o paciente ANTES de gravar: a comanda e o comprovante precisam do
    // ref para nascerem ligados. O id é determinístico, então resolver no
    // snapshot e persistir depois com o MESMO id não duplica cadastro.
    const valoresDoContato = {
      fullName: fcPatient.name.trim(),
      ...contactChannelsValues(fcChannels),
      sourceChannel: "Fechamento (Estevão)",
      ownerUserId: pessoa?.id ?? "gestao",
    };
    const refDoPaciente =
      fcPatient.ref || findOrCreateCrmContact(state, valoresDoContato, pessoa?.id ?? "gestao").contact.id;

    persist((current) => {
      let working = current;
      let contactId = fcPatient.ref;
      if (!contactId) {
        const created = findOrCreateCrmContact(working, { ...valoresDoContato, id: refDoPaciente }, pessoa?.id ?? "gestao");
        working = created.state;
        contactId = created.contact.id;
      }
      // Vinculado ou recém-criado: completa telefone/e-mail que estiverem vazios.
      working = applyContactChannels(working, contactId, fcChannels, pessoa?.id ?? "gestao");
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
        // CANAL. Continuação NÃO é adesão nova, então ela REPETE o canal que o
        // paciente já tem. E o canal vem do HISTÓRICO dele, não deste deal:
        // cada compra abre um deal novo, que nasce sem canal — se eu olhasse só
        // o deal recém-criado, o paciente do Programa continuaria virando "só
        // tratamento", que é exatamente o erro que a Dra. Andrya apontou.
        // Sem canal nenhum no histórico (primeira compra, só a dose) cai em
        // Somente Tratamento, para a enfermeira ainda receber a tarefa das doses.
        adhesionChannel: ehContinuacao(fcResultado)
          ? canalAtualDoPaciente(working.deals, contactId) ?? deal.adhesionChannel ?? "SOMENTE_TRATAMENTO"
          : fcResultado !== "NAO_FECHOU" && fcResultado !== "AVULSA"
            ? (fcResultado as CrmAdhesionChannel)
            : undefined,
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
          ? receivedAmount > 0
            ? `Não fechou registrado — a Concierge acolhe amanhã (D+1). Os ${moneyFin(receivedAmount)} que ele pagou foram para a comanda do dia.`
            : "Fechamento registrado como NÃO FECHOU — a Concierge acolhe amanhã (D+1) e a régua segue sozinha."
          : fcResultado === "AVULSA"
            ? "Consulta avulsa registrada — sem jornada (segue o fluxo normal de agenda)."
            : ehContinuacao(fcResultado)
              ? "Tratamento de continuação registrado — o canal do paciente ficou como estava e a enfermeira agenda as doses no D+1."
              : `Fechamento registrado! A esteira ${fcResultado === "PROGRAMA_ACOMPANHAMENTO" ? "do Programa" : fcResultado === "CLUBE_BRATAN" ? "da Consulta Black" : "de Tratamento"} ligou sozinha — as tarefas do D+1 já nasceram para as pessoas certas.`,
      );
      return moved.state;
    });
    // A comanda leva o que ENTROU (valor recebido) — é isso que o fechamento
    // diário e o extrato conferem. O valor vendido é o contrato, não o caixa.
    // NÃO FECHOU TAMBÉM PAGA (25/08/2026): a consulta que o paciente pagou vira
    // comanda igual, com o item e a régua do "não fechou".
    if (receivedAmount > 0) {
      const ehPlano = fcResultado === "PROGRAMA_ACOMPANHAMENTO" || fcResultado === "CLUBE_BRATAN";
      const lancado = lancarComandaEComprovante({
        contactRef: refDoPaciente,
        pacienteNome:
          fcPatient.name.trim() || contactDisplayName(state.contacts.find((item) => item.id === refDoPaciente)) || "Paciente",
        valorRecebido: receivedAmount,
        divisao: fcDivisao,
        itemTipo: fcItemTipo,
        itens: fcItens,
        arquivos: fcArquivos,
        mandaDepois: fcMandaDepois,
        notaInstrucao: fcNotaInstrucao,
        notaQuando: fcNotaQuando,
        tipo: fcTipo,
        plano: ehPlano,
        origem: `Fechamento no Kanban — ${
          fcResultado === "NAO_FECHOU"
            ? "não fechou o tratamento (pagou a consulta)"
            : fcResultado === "AVULSA"
              ? "consulta avulsa"
              : ehContinuacao(fcResultado)
                ? "tratamento de continuação (fora da consulta)"
                : channelLabels[fcResultado as CrmAdhesionChannel]
        }`,
        observacao:
          fcResultado === "NAO_FECHOU"
            ? `não fechou: ${fcObjection.trim()}`
            : fcCompleto
              ? ""
              : `parcial: ${fcPartialReason.trim()}`,
        setor: "VENDAS",
      });
      if (lancado && lancado.valorDinheiro > 0) {
        setFeedback(
          lancado.valorComanda > 0
            ? `Fechamento registrado: ${moneyFin(lancado.valorComanda)} na comanda do dia e ${moneyFin(lancado.valorDinheiro)} em dinheiro direto no caixa do crediário.`
            : `Fechamento registrado e ${moneyFin(lancado.valorDinheiro)} em dinheiro lançados direto no caixa do crediário (dinheiro não vira comanda).`,
        );
      }
    }

    setFechamentoOpen(false);
    setFcPatient({ ref: "", name: "" });
    setFcChannels(emptyContactChannels);
    setFcSold("");
    setFcReceived("");
    setFcObjection("");
    setFcPartialReason("");
    setFcCompleto(true);
    setFcResultado("PROGRAMA_ACOMPANHAMENTO");
    setFcDivisao([parcelaVazia("PIX")]);
    setFcTipo("TRATAMENTO");
    setFcItemTipo("TRATAMENTO");
    setFcItens([]);
    setFcNotaInstrucao("");
    setFcNotaQuando("COM_A_CONSULTA");
    setFcArquivos([]);
    setFcMandaDepois(false);
  }

  function handleMoveDeal(event: FormEvent) {
    event.preventDefault();
    if (!selectedDeal) return;
    if (targetStage === "FECHOU_COMPLETO" || targetStage === "FECHOU_PARCIAL") {
      abrirFechamentoDoDeal(selectedDeal.id);
      return;
    }
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
        scheduledAt: targetConsultaData || undefined,
        prescribedAmount: prescribed ? Number(prescribed) : undefined,
        soldAmount: sold ? Number(sold) : undefined,
        receivedAmount: received ? Number(received) : undefined,
        objection,
        objectionCategory,
        partialReason,
        // Fechou não passa mais por aqui (o guard acima manda pro Registrar
        // fechamento), então canal de adesão nunca é decidido nesta gaveta.
        adhesionChannel: undefined,
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
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [nameFeedback, setNameFeedback] = useState("");

  function saveLeadName() {
    if (!selectedDeal) return;
    const fullName = editName.trim();
    if (!fullName) {
      setNameFeedback("O nome não pode ficar vazio.");
      return;
    }
    const problema = contactChannelsIssue({ phone: editPhone, email: editEmail });
    if (problema) {
      setNameFeedback(problema);
      return;
    }
    persist((current) => {
      const comCadastro = updateContactChannels(
        current,
        selectedDeal.contactId,
        { fullName, preferredName: editPreferred, phone: editPhone, email: editEmail },
        pessoa?.id ?? "manual",
      );
      return {
        ...comCadastro,
        deals: comCadastro.deals.map((deal) =>
          deal.id === selectedDeal.id && editDealTitle.trim()
            ? { ...deal, title: editDealTitle.trim(), updatedAt: new Date().toISOString() }
            : deal,
        ),
      };
    });
    setNameFeedback("Cadastro atualizado — vale para o card, as tarefas, as cadências e a planilha.");
  }

  function selectDeal(deal: CrmDeal, stageOverride?: CrmDealStage) {
    setSelectedDealId(deal.id);
    setDrawerFeedback("");
    const dealContact = contactsById.get(deal.contactId);
    setEditName(dealContact?.fullName ?? "");
    setEditPreferred(dealContact?.preferredName ?? "");
    setEditPhone(formatPhoneBR(dealContact?.whatsapp || dealContact?.phone || ""));
    setEditEmail(dealContact?.email ?? "");
    setEditDealTitle(deal.title);
    setNameFeedback("");
    setTargetStage(stageOverride ?? deal.stage);
    setTargetConsultaData("");
    setPrescribed(deal.prescribedAmount ? String(deal.prescribedAmount) : "");
    setSold(deal.soldAmount ? String(deal.soldAmount) : "");
    setReceived(deal.receivedAmount ? String(deal.receivedAmount) : "");
    setObjection(deal.mainObjection);
    setObjectionCategory(deal.objectionCategory);
    setPartialReason("");
  }

  // FECHAMENTO SÓ TEM UM CAMINHO (20/08/2026). Arrastar o card para "Fechou"
  // (ou mover pela gaveta) movia a etapa SEM lançar a comanda — o valor ficava
  // no CRM e o dinheiro nunca chegava ao Lançar Dia. Era o "não sobe a comanda"
  // que o Lucas viu. Agora qualquer tentativa de fechar por fora abre o
  // Registrar fechamento com o paciente já escolhido: um fechamento, um
  // formulário, uma comanda.
  function abrirFechamentoDoDeal(dealId: string) {
    const deal = state.deals.find((item) => item.id === dealId);
    if (!deal) return;
    const contact = state.contacts.find((item) => item.id === deal.contactId);
    setFcFeedback("");
    setFcPatient({ ref: deal.contactId, name: contact ? contactDisplayName(contact) : "" });
    setSelectedDealId("");
    setFechamentoOpen(true);
    setFeedback('Fechou? Ótimo — registre pelo formulário (já abri com o paciente escolhido). É ele que lança a comanda e o comprovante.');
  }

  function attemptMoveDeal(dealId: string, stage: CrmDealStage) {
    const deal = state.deals.find((item) => item.id === dealId);
    if (!deal || deal.stage === stage) return;
    if (stage === "FECHOU_COMPLETO" || stage === "FECHOU_PARCIAL") {
      abrirFechamentoDoDeal(dealId);
      return;
    }
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
      <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={retrySync} />
      {/* CONFERÊNCIA DO FECHAMENTO (18/08/2026): fica aqui porque é aqui que o
          fechamento acontece. R$ 13.808 de um paciente foram dados como ganhos
          e nunca viraram comanda — o financeiro só descobriu comparando o
          extrato do banco com a agenda do Dr. Daniel na mão. */}
      {!fullscreen ? (
        <ConferenciaFechamentoCard
          crmState={state}
          sales={financeiro.sales}
          lembretes={lembretesQuery.data ?? []}
          cashEntries={caixaQuery.data ?? []}
          hoje={todayISO()}
        />
      ) : null}
      {/* CABEÇALHO (redesenho 08/09/2026): uma linha de título + ações; abaixo,
          UMA linha de abas com rolagem (Quadros · Repescagens · Cadências). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="gold">CRM Bratan</Badge>
          <h1 className={cn("text-brand-musgo", fullscreen ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl")}>Kanban</h1>
          <InfoTip title={board === "comercial" ? "Em aberto (antes do fechamento)" : board === "programa" ? "Plano de Acompanhamento" : board === "repescagem" ? "Repescagens" : "Quadro da cadência"}>
            {board === "comercial"
              ? "Lista de quem ainda NÃO tem fechamento registrado. O CRM começa quando o Estevão registra o fechamento — aí o paciente entra na Jornada e as tarefas nascem sozinhas."
              : board === "programa"
                ? "A jornada pós-fechamento. O card avança SOZINHO quando as tarefas da fase são concluídas (no D+1, todas as pessoas da esteira marcam \"mensagem enviada\"). Ninguém arrasta card; a coordenação corrige pela ficha."
                : board === "repescagem"
                  ? "Quem deixou de vir (1 mês, 3 meses, 6 meses, 1 ano — pela última comanda). A repescagem é por LIGAÇÃO: antes vai a isca no WhatsApp, só para saber o melhor horário. Cada toque registra data e hora no Registro, embaixo do quadro."
                  : "Uma aba por cadência: as colunas são os passos (D1, D5, D7… ou as ligações do Gestor) e cada paciente fica no passo que está esperando. Vermelho é atrasado, amarelo é hoje. \"Fiz o toque\" registra o resultado e o cartão anda sozinho."}
          </InfoTip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiquidButton type="button" size="sm" className="h-9 px-4" onClick={() => { setFcFeedback(""); setFechamentoOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Registrar fechamento
          </LiquidButton>
          <Button type="button" variant="outline" size="sm" onClick={() => setLeadModalOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Novo lead
          </Button>
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-input bg-white/70 px-2.5 text-sm font-medium text-brand-tinta hover:bg-white" aria-label="Mais ações">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 z-30 mt-1 grid w-56 gap-0.5 rounded-lg border border-brand-oliva/20 bg-brand-papel p-1.5 shadow-xl">
              <button type="button" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-white" onClick={() => { setImportFeedback(""); setImportOpen(true); }}>
                <Upload className="h-4 w-4" aria-hidden="true" /> Importar do Feegow
              </button>
              <button type="button" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-white" onClick={() => { setTourOpen(true); markTourSeen(); }}>
                <GraduationCap className="h-4 w-4" aria-hidden="true" /> Como usar
              </button>
              {fullscreen ? (
                <button type="button" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-white" onClick={() => setFullscreen(false)}>
                  <Minimize2 className="h-4 w-4" aria-hidden="true" /> Sair da tela cheia (Esc)
                </button>
              ) : (
                <button type="button" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-white" onClick={() => setFullscreen(true)}>
                  <Maximize2 className="h-4 w-4" aria-hidden="true" /> Tela cheia
                </button>
              )}
              <Link to={crmModuleRoutes.tasks} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-white">
                <ArrowRight className="h-4 w-4" aria-hidden="true" /> Minhas tarefas
              </Link>
            </div>
          </details>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button type="button" onClick={() => abasPan.rolar(-1)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Abas anteriores">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div ref={abasPan.ref} {...abasPan.handlers} className="kanban-scroll min-w-0 flex-1 cursor-grab overflow-x-auto pb-1 active:cursor-grabbing" role="tablist" aria-label="Quadro" title="Arraste para o lado para ver mais abas">
        <div className="flex w-max items-center gap-1.5">
          {(Object.keys(boardLabels) as KanbanBoardFixo[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={board === item}
              onClick={() => changeBoard(item)}
              className={cn(
                "flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition",
                board === item ? "border-brand-musgo bg-brand-musgo text-brand-papel shadow-sm" : "border-brand-oliva/25 bg-white/70 text-brand-oliva hover:border-brand-musgo/50 hover:text-brand-musgo",
              )}
            >
              {boardLabels[item]}
              <span className={cn("rounded-full px-1.5 text-[11px] font-bold", board === item ? "bg-white/20" : "bg-brand-papel text-brand-tinta")}>
                {item === "comercial" ? comercialDeals.length : programDeals.length}
              </span>
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={board === "repescagem"}
            onClick={() => changeBoard("repescagem")}
            className={cn(
              "flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition",
              board === "repescagem" ? "border-amber-600 bg-amber-600 text-white shadow-sm" : "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500",
            )}
          >
            <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
            Repescagens
            <span className={cn("rounded-full px-1.5 text-[11px] font-bold", board === "repescagem" ? "bg-white/20" : "bg-white text-amber-900")}>
              {quadroRepescagem.isca.length + quadroRepescagem.ligar.length}
            </span>
            {quadroRepescagem.candidatos.length ? <span className="text-[11px] font-normal opacity-80">· {quadroRepescagem.candidatos.length} para repescar</span> : null}
          </button>
          <span className="mx-1 h-6 w-px bg-brand-oliva/25" aria-hidden="true" />
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Cadências</span>
          {cadenciasComGente.map((item) => {
            const chave: KanbanBoard = `cadencia:${item.cadence.id}`;
            const ativa = board === chave;
            return (
              <button
                key={chave}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => changeBoard(chave)}
                title={item.cadence.name}
                className={cn(
                  "flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-semibold transition",
                  ativa ? "border-brand-musgo bg-brand-musgo text-brand-papel shadow-sm" : "border-brand-oliva/25 bg-white/70 text-brand-oliva hover:border-brand-musgo/50 hover:text-brand-musgo",
                )}
              >
                {rotuloCurtoDaCadencia(item.cadence)}
                <span className={cn("rounded-full px-1.5 text-[11px] font-bold", ativa ? "bg-white/20" : "bg-brand-papel text-brand-tinta")}>{item.ativos}</span>
                {item.atrasados ? <span className={cn("rounded-full px-1.5 text-[11px] font-bold", ativa ? "bg-red-200 text-red-900" : "bg-red-100 text-red-700")} title="toques atrasados">{item.atrasados}</span> : null}
              </button>
            );
          })}
          {cadenciasVazias.length ? (
            <select
              value=""
              onChange={(event) => event.target.value && changeBoard(`cadencia:${event.target.value}`)}
              className="h-9 rounded-full border border-dashed border-brand-oliva/30 bg-white/50 px-3 text-sm font-semibold text-brand-oliva"
              aria-label="Outras cadências (sem ninguém na régua agora)"
            >
              <option value="">Outras cadências…</option>
              {cadenciasVazias.map((item) => (
                <option key={item.cadence.id} value={item.cadence.id}>{rotuloCurtoDaCadencia(item.cadence)} (0)</option>
              ))}
            </select>
          ) : null}
        </div>
        </div>
        <button type="button" onClick={() => abasPan.rolar(1)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-brand-oliva/25 bg-white/70 text-brand-oliva hover:bg-white" aria-label="Próximas abas">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
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
                {selectedDeal.adhesionChannel ? (
                  <div className={cn("mt-3 rounded-md border p-2.5", selectedDeal.receitaSncrEm ? "border-emerald-200 bg-emerald-50/60" : todayISO() >= PRAZO_SNCR ? "border-red-300 bg-red-50/70" : "border-amber-200 bg-amber-50/60")}>
                    <p className="flex items-center gap-1 text-[11px] font-bold uppercase text-brand-oliva">
                      Receita controlada no SNCR
                      <InfoTip title="Por que isto está aqui">
                        RDC Anvisa 1.000/2025: receitas de medicamentos controlados (tirzepatida, semaglutida e outros com retenção) passam a ser
                        digitais, com numeração nacional do SNCR, até 30/09/2026. Aqui fica registrado o dia em que a receita deste plano foi
                        emitida pela plataforma integrada — o app não emite receita; só guarda a data para a coordenação acompanhar.
                      </InfoTip>
                    </p>
                    {selectedDeal.receitaSncrEm ? (
                      <p className="mt-1 text-sm text-emerald-900">Registrada em {selectedDeal.receitaSncrEm.slice(8, 10)}/{selectedDeal.receitaSncrEm.slice(5, 7)}/{selectedDeal.receitaSncrEm.slice(0, 4)}.</p>
                    ) : (
                      <p className="mt-1 text-sm text-brand-tinta">
                        {todayISO() >= PRAZO_SNCR ? "Prazo da Anvisa já passou: este plano ainda não tem receita registrada no SNCR." : `Sem receita registrada no SNCR ainda (prazo da Anvisa: 30/09/2026).`}
                      </p>
                    )}
                    {canOverridePhase || isCoordenacao(pessoa?.cargo) ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input type="date" className="h-8 w-40" defaultValue={selectedDeal.receitaSncrEm ?? ""} onChange={(event) => setSncrData(event.target.value)} aria-label="Data da receita no SNCR" />
                        <Button type="button" size="sm" variant="outline" onClick={() => { persist((current) => marcarReceitaSncr(current, selectedDeal.id, sncrData || todayISO(), pessoa?.id ?? "coordenacao")); setFeedback("Data da receita no SNCR registrada."); }}>
                          {selectedDeal.receitaSncrEm ? "Atualizar data" : "Marcar (hoje se vazio)"}
                        </Button>
                        {selectedDeal.receitaSncrEm ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => persist((current) => marcarReceitaSncr(current, selectedDeal.id, null, pessoa?.id ?? "coordenacao"))}>
                            Limpar
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
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
                    {/* CANAL ERRADO NO FECHAMENTO (10/09/2026, áudio da CEO: "ele
                        entrou novamente como programa e ele não é programa, ele é
                        uma consulta black"). Trocar o canal aqui reescreve a régua
                        sem apagar o fechamento — e pede a senha do gestor. */}
                    <div className="mt-3 border-t border-brand-oliva/15 pt-2">
                      <p className="text-[11px] font-bold uppercase text-brand-oliva">
                        Corrigir o canal do fechamento (pede a senha do gestor)
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        O canal define quais tarefas nascem. Trocando aqui, a fase e o que já foi feito ficam — as tarefas
                        da esteira errada são canceladas e as da certa nascem.
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(Object.keys(adhesionChannelLabels) as CrmAdhesionChannel[]).map((canal) => (
                          <button
                            key={canal}
                            type="button"
                            disabled={selectedDeal.adhesionChannel === canal}
                            onClick={() => setPedidoCanal({ dealId: selectedDeal.id, canal })}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              selectedDeal.adhesionChannel === canal
                                ? "border-brand-musgo bg-brand-musgo text-brand-papel"
                                : "border-brand-oliva/25 bg-white/70 text-brand-tinta hover:bg-brand-creme/50",
                            )}
                          >
                            {channelLabels[canal]}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setPedidoCanal({ dealId: selectedDeal.id, canal: null })}
                          className="rounded-full border border-red-300 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          Consulta avulsa (sai da esteira)
                        </button>
                      </div>
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
              <p className="text-xs font-semibold uppercase text-brand-oliva">Cadastro do lead</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Nome completo" aria-label="Nome completo do lead" />
                <Input value={editPreferred} onChange={(event) => setEditPreferred(event.target.value)} placeholder="Apelido (no card)" aria-label="Apelido do lead" />
                <Input value={editDealTitle} onChange={(event) => setEditDealTitle(event.target.value)} placeholder="Título da negociação" aria-label="Título da negociação" />
              </div>
              {/* Telefone e e-mail editáveis aqui (29/07): antes o lead ficava sem
                  número e não havia onde cadastrar depois. */}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input
                  value={editPhone}
                  onChange={(event) => setEditPhone(formatPhoneBR(event.target.value))}
                  placeholder="(11) 98765-4321"
                  inputMode="tel"
                  aria-label="WhatsApp do lead"
                />
                <Input
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                  placeholder="nome@email.com"
                  type="email"
                  inputMode="email"
                  aria-label="E-mail do lead"
                />
              </div>
              {!editPhone.trim() && !editEmail.trim() ? (
                <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
                  Este lead está sem telefone e sem e-mail — a cadência não tem para onde ligar nem escrever.
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="outline" onClick={saveLeadName}>
                  Salvar cadastro
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
              {targetStage === "CONSULTA_AGENDADA" || targetStage === "CONSULTA_CONFIRMADA" ? (
                <div>
                  <Label>Data da consulta (obrigatória)</Label>
                  <Input
                    type="date"
                    value={targetConsultaData}
                    onChange={(event) => setTargetConsultaData(event.target.value)}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">
                    Com a data, o paciente entra sozinho no 3·1 da recepção: exames −15/−7, confirmação −3 e lembrete −1.
                    Remarcou? Mova de novo com a data nova — as tarefas antigas são canceladas sozinhas.
                  </p>
                </div>
              ) : null}
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

      {board !== "programa" && board !== "comercial" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 pl-9" placeholder="Buscar paciente neste quadro" />
          </label>
          <select value={density} onChange={(event) => changeDensity(event.target.value as KanbanDensity)} className="h-10 rounded-md border border-input bg-white/72 px-3 text-sm shadow-sm" aria-label="Densidade dos cards">
            {(Object.keys(densityLabels) as KanbanDensity[]).map((item) => (
              <option key={item} value={item}>{densityLabels[item]}</option>
            ))}
          </select>
        </div>
      ) : null}
      <section className={cn("rounded-lg border border-brand-oliva/15 bg-white/45 p-2.5 shadow-sm backdrop-blur-xl", board !== "programa" && board !== "comercial" && "hidden")}>
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
        onPointerDown={board === "programa" || board === "comercial" ? onBoardPointerDown : undefined}
        onPointerMove={board === "programa" || board === "comercial" ? onBoardPointerMove : undefined}
        onPointerUp={board === "programa" || board === "comercial" ? onBoardPointerUp : undefined}
        onPointerCancel={board === "programa" || board === "comercial" ? onBoardPointerUp : undefined}
        style={fullscreen ? undefined : { height: `calc(100dvh - ${boardTop + 12}px)`, minHeight: 440 }}
        className={cn(
          "kanban-scroll touch-pan-x overflow-x-auto pb-2",
          board === "programa" || board === "comercial" ? "cursor-grab active:cursor-grabbing" : "",
          fullscreen ? "min-h-0 flex-1" : "min-h-0",
        )}
      >
        <div
          className={cn(
            board === "comercial"
              ? "w-full min-w-0 max-w-5xl"
              : cadenciaAtiva || board === "repescagem"
                ? "h-full w-full min-w-0"
                : cn("grid h-full w-max grid-flow-col items-stretch gap-3", densityColumns[density]),
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
                    {resumoSla.total || resumoSla.semResposta.length ? (
                      <p className={cn("rounded-md px-2.5 py-1.5 text-xs leading-5", resumoSla.semResposta.length ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800")}>
                        <strong>Resposta ao lead:</strong> {resumoSla.frase}
                        <InfoTip title="SLA de resposta">
                          Tempo entre o lead entrar e o primeiro toque registrado (tarefa concluída ou mensagem/ligação na linha do tempo). A meta
                          é {resumoSla.limiteMinutos} min, definida em Administração → Configurações do negócio. Responder na primeira hora qualifica
                          cerca de 7 vezes mais do que responder depois.
                        </InfoTip>
                      </p>
                    ) : null}
                    {rows.length ? (
                      rows.map((deal) => {
                        const contact = contactsById.get(deal.contactId);
                        const phone = contact ? (contact.whatsapp || contact.phone || "").replace(/\D/g, "") : "";
                        const sla = slaDoNegocio(resumoSla, deal.id);
                        return (
                          <div key={deal.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-white/65 px-3 py-2">
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-1.5 font-semibold text-brand-tinta">
                                <span className="truncate">{contactDisplayName(contact)}</span>
                                {sla ? (
                                  <span
                                    className={cn(
                                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                                      sla.semResposta ? "bg-red-100 text-red-800" : sla.dentroDoSla ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
                                    )}
                                    title={sla.semResposta ? `Sem nenhum toque desde a entrada (${formatMinutos(sla.minutos)})` : `Primeiro toque ${formatMinutos(sla.minutos)} depois da entrada (meta ${resumoSla.limiteMinutos} min)`}
                                  >
                                    {sla.semResposta ? `sem resposta há ${formatMinutos(sla.minutos)}` : sla.dentroDoSla ? `respondido em ${formatMinutos(sla.minutos)}` : `respondido em ${formatMinutos(sla.minutos)} (fora da meta)`}
                                  </span>
                                ) : null}
                              </p>
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
            : board !== "programa"
              ? null
              : programPhases.map((phase, phaseIndex) => {
                const hojeISO = todayISO();
                const phaseDeals = ordenaPorTempoNaFase(programDeals.filter((deal) => deal.programPhase === phase), hojeISO);
                const nextPhase = programPhases[phaseIndex + 1];
                const vencidos = phaseDeals.filter((deal) => faseVencida(deal, hojeISO));
                const prazoFase = PRAZO_DA_FASE_DIAS[phase];

                return (
                  // REGRA DE OURO nº 4: concluir a tarefa É o que move o card.
                  // Arrastar com o mouse foi desabilitado (Lucas, 22/07); a
                  // coordenação corrige fases pelo painel do card.
                  <section
                    key={phase}
                    className={cn(
                      "flex flex-col rounded-lg border border-brand-oliva/14 bg-white/40 p-2 backdrop-blur-xl transition-colors",
                      "h-full min-h-0",
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
                        <span>
                          {phaseDeals.length} pacientes
                          {vencidos.length ? <span className="ml-1 rounded-full bg-red-200/90 px-1.5 font-bold text-red-900">{vencidos.length} parados</span> : null}
                        </span>
                        {nextPhase ? <span>→ {programPhaseLabels[nextPhase]}{prazoFase !== null ? ` · prazo ${prazoFase}d` : ""}</span> : <span>fim da trilha</span>}
                      </div>
                    </div>
                    {vencidos.length && canOverridePhase && prazoFase !== null ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`Avançar ${vencidos.length} paciente(s) parados em "${programPhaseLabels[phase]}" há mais de ${prazoFase} dia(s) para "Em acompanhamento"? O gate desta fase fica registrado como pulado pela coordenação.`)) return;
                          persist((current) => vencidos.reduce((acc, deal) => setProgramPhase(acc, deal.id, "CADENCIA_PROGRAMA", pessoa?.id ?? "coordenacao"), current));
                          setFeedback(`${vencidos.length} paciente(s) de "${programPhaseLabels[phase]}" avançados para Em acompanhamento.`);
                        }}
                        className="mb-2 flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                        title="Só a coordenação vê este botão"
                      >
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Avançar {vencidos.length} parado(s) → Em acompanhamento
                      </button>
                    ) : null}
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
          {cadenciaAtiva ? (
            <CadenciaKanban
              state={state}
              cadenceId={cadenciaAtiva}
              hoje={todayISO()}
              filtro={query}
              density={density}
              readOnly={false}
              onConcluirPasso={concluirPassoDaCadencia}
              onConcluirLigacao={concluirLigacaoDoGestor}
            />
          ) : null}
          {board === "repescagem" ? (
            <RepescagemBoard
              quadro={quadroRepescagem}
              filtro={query}
              density={density}
              readOnly={false}
              remetente={(pessoa?.nome ?? "Aline").split(" ")[0]}
              contacts={state.contacts}
              hoje={todayISO()}
              onAdicionar={adicionarRepescagem}
              onObservacao={observacaoRepescagem}
              onIniciar={iniciarRepescagemDe}
              onIscaEnviada={iscaEnviada}
              onMarcarHorario={marcarHorario}
              onLiguei={liguei}
            />
          ) : null}
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
                    <section className={cn("flex flex-col rounded-lg border border-amber-300/60 bg-amber-50/40 p-2 backdrop-blur-xl", "h-full min-h-0")}>
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
                    <section className={cn("flex flex-col rounded-lg border border-brand-oliva/14 bg-white/40 p-2 backdrop-blur-xl", "h-full min-h-0")}>
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
                    <PatientPicker
                      contacts={state.contacts}
                      value={fcPatient}
                      onChange={setFcPatient}
                      channels={fcChannels}
                      onChannelsChange={setFcChannels}
                      id="fc-paciente"
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <Label>O que o paciente fechou?</Label>
                  <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {(
                      [
                        ["PROGRAMA_ACOMPANHAMENTO", "Plano de Acompanhamento", "Concierge + Recepção + Enfermeira no D+1"],
                        ["CLUBE_BRATAN", "Consulta Black (ex-Clube)", "Concierge + Recepção no D+1"],
                        ["SOMENTE_TRATAMENTO", "Somente Tratamento", "aderiu na consulta, sem plano · Concierge + Enfermeira no D+1"],
                        [
                          "TRATAMENTO_CONTINUACAO",
                          "Tratamento de continuação",
                          "fora da consulta (dose seguinte, pedido por WhatsApp) · NÃO troca o canal do paciente",
                        ],
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
                {/* CONTINUAÇÃO: mostra o canal que o paciente já tem, porque é ele
                    que será repetido. Quando o app não conhece canal nenhum
                    (adesão feita antes do CRM), avisa — senão a continuação
                    grava "Somente Tratamento" e ninguém percebe. */}
                {ehContinuacao(fcResultado) ? (
                  (() => {
                    const canalDoPaciente = fcPatient.ref ? canalAtualDoPaciente(state.deals, fcPatient.ref) : null;
                    return (
                      <p
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs leading-5",
                          canalDoPaciente
                            ? "border-brand-oliva/25 bg-white/70 text-brand-tinta"
                            : "border-amber-400 bg-amber-50 text-amber-900",
                        )}
                      >
                        {canalDoPaciente ? (
                          <>
                            Canal deste paciente: <strong>{channelLabels[canalDoPaciente]}</strong> — a continuação mantém esse
                            canal, não troca.
                          </>
                        ) : (
                          <>
                            <strong>Este paciente ainda não tem canal registrado no CRM.</strong> A continuação vai gravar
                            "Somente Tratamento". Se ele já é do Programa ou do Clube (adesão feita antes), escolha o card do
                            plano dele em vez desta opção — assim o quadro de Acompanhamento fica certo.
                          </>
                        )}
                      </p>
                    );
                  })()
                ) : null}
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
                    </div>

                    {/* Recebimento: mesmo bloco do cadastro, três passos e a
                        lista de destinos se completando (17/08/2026). */}
                    <RecebimentoNoKanban
                      titulo="Recebimento — daqui saem a comanda e o comprovante"
                      valorTexto={fcReceived}
                      onValorChange={setFcReceived}
                      valor={parseFinAmount(fcReceived)}
                      divisao={fcDivisao}
                      onDivisaoChange={setFcDivisao}
                      itemTipo={fcItemTipo}
                      onItemTipoChange={setFcItemTipo}
                      itens={fcItens}
                      onItensChange={atualizaItensFechados}
                      tipo={fcTipo}
                      onTipoChange={setFcTipo}
                      tiposDisponiveis={["TRATAMENTO", "PRIMEIRA_CONSULTA", "RETORNO"]}
                      notaInstrucao={fcNotaInstrucao}
                      onNotaInstrucaoChange={setFcNotaInstrucao}
                      quandoNota={fcNotaQuando}
                      onQuandoNotaChange={setFcNotaQuando}
                      arquivos={fcArquivos}
                      onArquivosChange={setFcArquivos}
                      mandaDepois={fcMandaDepois}
                      onMandaDepoisChange={setFcMandaDepois}
                      pacienteNovo={!fcPatient.ref}
                      // Aqui fcResultado nunca é "NAO_FECHOU" (esse caso tem o
                      // próprio bloco, mais abaixo, para a consulta paga).
                      regua={
                        fcResultado === "AVULSA"
                          ? "sem esteira — só agenda"
                          : ehContinuacao(fcResultado)
                            ? "continuação — enfermeira agenda as doses (canal do paciente não muda)"
                            : channelLabels[fcResultado as CrmAdhesionChannel]
                      }
                    />

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
                    {/* NÃO FECHOU TAMBÉM PAGA (25/08/2026, pedido do Lucas).
                        Quem não fechou o tratamento quase sempre PAGOU A
                        CONSULTA — e esse dinheiro não tinha onde ser lançado
                        aqui, então virava retrabalho: comanda na mão no Lançar
                        dia e comprovante na mão no módulo Comprovantes. */}
                    <div className="sm:col-span-2">
                      <RecebimentoNoKanban
                        titulo="Pagou alguma coisa? (consulta, bioimpedância, sinal)"
                        valorTexto={fcReceived}
                        onValorChange={setFcReceived}
                        valor={parseFinAmount(fcReceived)}
                        divisao={fcDivisao}
                        onDivisaoChange={setFcDivisao}
                        itemTipo={fcItemTipo}
                        onItemTipoChange={setFcItemTipo}
                      itens={fcItens}
                      onItensChange={atualizaItensFechados}
                        tipo={fcTipo}
                        onTipoChange={setFcTipo}
                        tiposDisponiveis={["PRIMEIRA_CONSULTA", "RETORNO"]}
                        notaInstrucao={fcNotaInstrucao}
                        onNotaInstrucaoChange={setFcNotaInstrucao}
                        quandoNota={fcNotaQuando}
                        onQuandoNotaChange={setFcNotaQuando}
                        arquivos={fcArquivos}
                        onArquivosChange={setFcArquivos}
                        mandaDepois={fcMandaDepois}
                        onMandaDepoisChange={setFcMandaDepois}
                        pacienteNovo={!fcPatient.ref}
                        regua="não fechou o tratamento — a Concierge acolhe no D+1 (régua D1–D5)"
                      />
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
                  <Label htmlFor="novo-lead-phone">WhatsApp / telefone</Label>
                  <Input
                    id="novo-lead-phone"
                    value={newPhone}
                    onChange={(event) => setNewPhone(formatPhoneBR(event.target.value))}
                    placeholder="(11) 98765-4321"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <Label htmlFor="novo-lead-email">E-mail</Label>
                  <Input
                    id="novo-lead-email"
                    type="email"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    placeholder="nome@email.com"
                    inputMode="email"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label>Origem</Label>
                  <Input value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="Instagram, indicação..." />
                </div>
                <div>
                  <Label>Valor potencial</Label>
                  <Input value={newValue} onChange={(event) => setNewValue(event.target.value)} inputMode="decimal" />
                </div>

                <div className="sm:col-span-2">
                  <RecebimentoNoKanban
                    titulo="Recebeu algum valor agora? Daqui saem a comanda e o comprovante"
                    valorTexto={newRecebido}
                    onValorChange={setNewRecebido}
                    valor={parseFinAmount(newRecebido)}
                    divisao={newDivisao}
                    onDivisaoChange={setNewDivisao}
                    itemTipo={newItemTipo}
                    onItemTipoChange={setNewItemTipo}
                    itens={newItens}
                    onItensChange={atualizaItensNovo}
                    tipo={newTipo}
                    onTipoChange={(tipo) => setNewTipo(tipo as typeof newTipo)}
                    tiposDisponiveis={["SINAL_CONSULTA", "PRIMEIRA_CONSULTA", "RETORNO"]}
                    notaInstrucao={newNotaInstrucao}
                    onNotaInstrucaoChange={setNewNotaInstrucao}
                    quandoNota={newNotaQuando}
                    onQuandoNotaChange={setNewNotaQuando}
                    arquivos={newArquivos}
                    onArquivosChange={setNewArquivos}
                    mandaDepois={newMandaDepois}
                    onMandaDepoisChange={setNewMandaDepois}
                    pacienteNovo
                    regua="entra no Kanban para o agendamento seguir"
                  />
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

      {/* A senha do gestor entra ANTES de reescrever a régua de um fechamento. */}
      {pedidoCanal ? (
        <SenhaDeGestor
          acao={
            pedidoCanal.canal
              ? `trocar o canal do fechamento para ${channelLabels[pedidoCanal.canal]}`
              : "tirar este paciente da esteira (consulta avulsa)"
          }
          onCancelar={() => setPedidoCanal(null)}
          onConfirmado={() => {
            const pedido = pedidoCanal;
            setPedidoCanal(null);
            persist((current) => {
              const resultado = corrigirCanalDaJornada(current, pedido.dealId, pedido.canal, pessoa?.id ?? "gestao");
              setFeedback(resultado.message);
              return resultado.ok ? resultado.state : current;
            });
          }}
        />
      ) : null}
</div>
  );
}
