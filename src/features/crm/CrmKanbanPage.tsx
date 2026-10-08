import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { chaveDoCrediario } from "@/features/financeiro/dinheiroDaComanda";
import { gravarRemoteDinheiroDaComanda } from "@/lib/remote/dinheiroDaComanda";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Target,
  UserPlus,
  X,
  Trash2, MoreHorizontal, PhoneCall, CheckCircle2, Clock, Check, MessageCircle } from "lucide-react";
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
import { createRemotePagamento, lerRemoteCpfDoContato, listRemoteFinCashEntries, listRemotePagamentos, salvarRemoteCpfDoContato, uploadRemoteComprovante } from "@/lib/remoteData";
import { aReceberSugerido, fechamentoTemSaldo, fechamentoVaiTerNota, travaDoAReceber, travaDosDadosDaNota } from "./travasDoFechamento";
import { sinaisEmAberto, somaDosSinais } from "@/features/financeiro/sinaisDoPaciente";
import { cpfDigitos, cpfValido } from "@/lib/cpf";
import { todayISO } from "@/lib/localStore";
import { RecebimentoNoKanban } from "./RecebimentoNoKanban";
import {
  notaDoFechamentoVazia,
  planoDeNotas,
  resumoDaNota,
  travaDoFechamento,
  type NotaDoFechamento,
} from "./notaNoFechamento";
import {
  ehContinuacao,
  parcelaVazia,
  travaDoComprovante,
  travaDoValorRecebido,
  type ParcelaDoRecebimento,
  type ResultadoDoFechamento,
  type TipoRecebimento,
} from "./recebimentoKanbanData";
import { GuidedTour, useTourSeen, type TourStep } from "@/components/ui/guided-tour";
import { InfoTip } from "@/components/ui/info-tip";
import { BlocoFolha, Botao, Cabecalho, CampoBusca, FraseDoFluxo } from "@/components/ui/fundacao";
import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao, podeEmitirNota, recadoNotaNaFila } from "@/lib/access";
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
import { emitirNotasDoFechamento } from "./emitirNotaDoFechamento";
import { descricaoPadraoDoFechamento, tipoDoItemDoFechamento } from "./tipoDoItemNoFechamento";
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
import { CadenciaKanban, type LeituraDoQuadro } from "./CadenciaKanban";
import { buildKanbanCadencia, resumoDasCadencias, rotuloCurtoDaCadencia } from "./cadenciaKanbanData";
import { buildResumoSla, formatMinutos, slaDoNegocio } from "./slaLead";
import { PRAZO_SNCR, marcarReceitaSncr } from "./crmData";
import { integracaoLigada } from "@/lib/integracoes";
import { riscoDoPaciente } from "./riscoAdesao";
import { invocarIntegracao } from "@/lib/remoteData";
import { configAtual } from "@/lib/configNegocio";
import { confirmar, toast } from "@/components/ui/avisos";
import {
  AvatarMini,
  Badge,
  BOTAO_CANAL,
  Button,
  CAMPO,
  CartaoDoQuadro,
  classeDaEscolha,
  classeDoChip,
  ColunaDoQuadro,
  Etiqueta,
  GrupoDeLeituras,
  Input,
  Label,
  LARGURA_DA_COLUNA_DO_PLANO,
  Leitura,
  NOME_LINK,
  NoCorpo,
  RUBRICA,
  VazioDaColuna,
} from "./comercialVisual";
import { LinkOutrasCadencias, SeletorDeQuadro } from "./SeletorDeQuadro";
import {
  fraseDaCadencia,
  fraseDaRepescagem,
  fraseDoPlano,
  fraseEmAberto,
  leiturasDaCadencia,
  secoesDoSeletor,
  toquesEmOutrasCadencias,
  type FraseDoQuadro,
  type ResumoParaSeletor,
} from "./comercialFrases";
import { RepescagemBoard, type ResultadoLigacao } from "./RepescagemBoard";
import { PRAZO_DA_FASE_DIAS, diasNaFase, faseVencida, ordenaPorTempoNaFase } from "./faseVencida";
import { SenhaDeGestor } from "@/components/SenhaDeGestor";
import { DENSIDADE_PADRAO, DENSIDADE_STORAGE_KEY, densityLabels, type KanbanDensity } from "./kanbanDensidade";
import { adicionarRepescagemManual, atualizarObservacaoRepescagem, buildQuadroRepescagem, iniciarRepescagem, iniciarRepescagemComResultado, marcarHorarioDaLigacao, type CandidatoRepescagem, type RepescagemManual } from "./repescagemData";
import { AccessGate } from "@/components/access/AccessGate";
import { AvisoSoVe, avisarSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { canCrmBratan } from "@/lib/access";

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
        "cursor-grab rounded-bloco border border-fio bg-folha transition-opacity active:cursor-grabbing",
        density === "compact" ? "p-3" : "p-4",
        isDragging && "opacity-45",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate font-semibold text-musgo", density === "executive" && "text-lg")}>{contactName}</p>
          <p className="mt-1 truncate text-xs text-tinta-2">{deal.title}</p>
        </div>
        <Badge variant="muted">{deal.probability}%</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline">{deal.sourceChannel || "Manual"}</Badge>
        {contact?.leadTemperature ? <Badge variant={contact.leadTemperature === "HOT" ? "gold" : "muted"}>{temperatureLabels[contact.leadTemperature]}</Badge> : null}
        {!hasNextTask ? <Badge className="bg-erro-claro text-erro">Sem próxima ação</Badge> : null}
        {hasCadence === false ? <Badge className="bg-atencao-claro text-atencao">Sem régua</Badge> : null}
        {deal.mainObjection ? <Badge className="bg-saber text-tinta">{deal.mainObjection}</Badge> : null}
      </div>
      <div className="mt-3 grid gap-2">
        {nextTask ? (
          <div className="rounded-controle border border-fio-2 bg-saber px-3 py-2">
            <p className="text-xs font-semibold uppercase text-tinta-2">Próxima ação</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-tinta">{nextTask.title}</p>
            <p className="mt-1 text-xs text-tinta-2">{formatCrmDateTime(nextTask.dueAt)}</p>
          </div>
        ) : null}
        {canSeeValue ? (
          <div className="rounded-controle bg-saber px-3 py-2">
            <p className="text-xs font-semibold uppercase text-tinta-2">Potencial / vendido</p>
            <p className="font-semibold text-musgo">{moneyCrm(deal.estimatedValue)} / {moneyCrm(deal.soldAmount)}</p>
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
  // SEMÁFORO DE ADESÃO (14/09/2026): só a partir do acompanhamento; visitas ficam para a tela do plano.
  const risco = phase === "CADENCIA_PROGRAMA" || phase === "ENCERRAMENTO" ? riscoDoPaciente(state, deal, undefined, hojeISO) : null;

  const statusDoPrazo =
    prazo === null ? null : vencida ? `Parado há ${dias} dias` : dias === 0 ? "Entrou hoje" : `Há ${dias} dia${dias > 1 ? "s" : ""} na fase`;

  // 08/10/2026 (Papel & Musgo): o cartão do Plano é a mesma folha pequena do
  // quadro da cadência. O nome abre a ficha (o antigo botão "Perfil"); o canal
  // do fechamento é uma etiqueta; o prazo da fase vem com a palavra; o gate
  // mostra cada setor com ✓ (feito) ou relógio (falta); e embaixo ficam
  // "Detalhes" e o WhatsApp.
  return (
    <CartaoDoQuadro
      data-deal-card
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      tom={vencida ? "atrasado" : "normal"}
      className={cn("transition-opacity", canDrag && "cursor-grab active:cursor-grabbing", isDragging && "opacity-45")}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
        <Link to={crmModuleRoutes.contact(deal.contactId)} className={NOME_LINK} title={`Abrir a ficha de ${contactName}`}>
          {contactName}
        </Link>
        {deal.adhesionChannel ? <Etiqueta tom="musgo">{channelShort[deal.adhesionChannel]}</Etiqueta> : null}
      </div>
      {density !== "compact" && deal.title ? <p className="-mt-1 truncate text-[13px] font-medium leading-5 text-tinta-2">{deal.title}</p> : null}
      {statusDoPrazo || (risco && risco.nivel !== "VERDE") ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {statusDoPrazo ? (
            <span
              className={cn("inline-flex items-center gap-1 text-[13px] leading-5 tabular-nums", vencida ? "font-bold text-atencao" : "font-semibold text-tinta-2")}
              title={vencida ? `Prazo da fase: ${prazo} dia(s). Ninguém marcou o gate — a coordenação pode avançar.` : `Prazo da fase: ${prazo} dia(s)`}
            >
              {vencida ? <Clock className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              {statusDoPrazo}
            </span>
          ) : (
            <span />
          )}
          {risco && risco.nivel !== "VERDE" ? (
            <Etiqueta tom={risco.nivel === "VERMELHO" ? "erro" : "atencao"} title={risco.frase}>
              Semáforo {risco.nivel.toLowerCase()}
            </Etiqueta>
          ) : null}
        </div>
      ) : null}

      {/* Faixa do GATE: cada setor exigido nesta fase, com ✓ ou o relógio */}
      {gate.total > 0 ? (
        <div className="grid gap-2 rounded-controle bg-saber p-2">
          <p className="text-xs font-bold leading-4 text-tinta-2">
            Para avançar · <span className="tabular-nums text-tinta">{gate.done} de {gate.total}</span>
          </p>
          <div className="flex flex-wrap gap-1">
            {spec.gate.map((gateSpec) => {
              const done = !missingRoles.has(gateSpec.role);
              return (
                <span
                  key={gateSpec.key}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-controle px-2 text-xs font-bold leading-4",
                    done ? "bg-musgo-claro text-musgo" : "bg-folha text-tinta-2 shadow-[inset_0_0_0_1px_rgb(var(--fio-2-rgb))]",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                  {crmRoleLabels[gateSpec.role]}
                  <span className="sr-only">{done ? "feito" : "falta"}</span>
                </span>
              );
            })}
          </div>
          {nextLabel ? (
            <p className="text-xs font-medium leading-4 text-tinta-2">
              {gate.done === gate.total ? "Gate completo — avançando…" : `Quando todos concluírem → ${nextLabel}`}
            </p>
          ) : null}
        </div>
      ) : nextLabel ? (
        <p className="text-[13px] font-medium leading-5 text-tinta-2">
          Próxima fase: <span className="font-bold text-tinta">{nextLabel}</span>
        </p>
      ) : null}

      {deal.programOutcome ? <Etiqueta tom="ok">Desfecho: {programOutcomeLabels[deal.programOutcome]}</Etiqueta> : null}

      <div className="flex gap-2">
        <Button type="button" size="sm" variant="subtle" className="min-w-0 flex-1" onClick={onSelect}>
          Detalhes
        </Button>
        {contactPhone ? (
          <a
            href={`https://wa.me/55${contactPhone.replace(/^55/, "")}`}
            target="_blank"
            rel="noreferrer"
            className={BOTAO_CANAL}
            aria-label={`Abrir o WhatsApp de ${contactName}`}
          >
            <MessageCircle aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </CartaoDoQuadro>
  );
}

function CrmKanbanPageConteudo() {
  const { pessoa } = useAuth();
  // "Só vê" vale aqui também (29/09/2026, auditoria B9): o useCrmState recusa a
  // gravação e os botões que abrem o fechamento ficam desabilitados.
  const { state, persist, syncFailed, syncErrorDetail, retrySync, deleteLead } = useCrmState({ modulo: "crm" });
  const telaCrm = useNivelDaTela("crm");
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
  // A ABA E A SEÇÃO FICAM NO ENDEREÇO (16/09/2026, proposta 4.6): assim dá para
  // mandar "olha a coluna do D5" por WhatsApp e voltar no mesmo lugar depois. O que
  // está guardado no aparelho continua valendo como padrão de quem abre sem link.
  const [params, setParams] = useSearchParams();
  const [board, setBoard] = useState<KanbanBoard>(() => (params.get("quadro") as KanbanBoard) || readLocalValue<KanbanBoard>("app-bratan-kanban-board-v2", "programa"));
  const [section, setSection] = useState<KanbanSection>(() => (params.get("secao") as KanbanSection) || readLocalValue<KanbanSection>("app-bratan-kanban-section", "all"));
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
  const [newNota, setNewNota] = useState<NotaDoFechamento>(notaDoFechamentoVazia);
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
  const [fcItemTipo, setFcItemTipo] = useState<FinSaleItemType>("CONSULTA");
  // O que o paciente fechou, produto a produto, da tabela de preços (02/09/2026).
  const [fcItens, setFcItens] = useState<ItemFechado[]>([]);
  const [fcNotaInstrucao, setFcNotaInstrucao] = useState("");
  const [fcNota, setFcNota] = useState<NotaDoFechamento>(notaDoFechamentoVazia);
  const [fcNotaQuando, setFcNotaQuando] = useState<"AGORA" | "COM_A_CONSULTA" | "AGUARDANDO_ORIENTACAO">("COM_A_CONSULTA");
  const [fcArquivos, setFcArquivos] = useState<File[]>([]);
  const [fcMandaDepois, setFcMandaDepois] = useState(false);
  const fcInputArquivo = useRef<HTMLInputElement>(null);
  const [fcObjection, setFcObjection] = useState("");
  const [fcObjectionCategory, setFcObjectionCategory] = useState<CrmObjectionCategory>("PRICE");
  const [fcPartialReason, setFcPartialReason] = useState("");
  const [fcFeedback, setFcFeedback] = useState("");
  // A NOTA TRAVA O FECHAMENTO (18/09/2026). Lucas: "não concordo, pois tudo
  // tem que ter nf". Sinal de consulta e fechamento sem dinheiro passam —
  // são exceções da operação, e quem decide isso é a função, não a tela.
  const fcValorRecebido = parseFinAmount(fcReceived);
  // O SINAL ENTRA SOMADO (29/09/2026): os sinais que este paciente já pagou e
  // que ainda não entraram em nota vão junto na nota de hoje.
  const [fcSomarSinais, setFcSomarSinais] = useState(true);
  const fcSinais = useMemo(
    () => (fcPatient.ref ? sinaisEmAberto({ sales: financeiro.sales, invoices: financeiro.invoices, contactRef: fcPatient.ref }) : []),
    [fcPatient.ref, financeiro.sales, financeiro.invoices],
  );
  const fcSinaisNaNota = fcSomarSinais && fcTipo !== "SINAL_CONSULTA" && fcNota.escolha !== "SEM_NOTA" && fcValorRecebido > 0 ? fcSinais : [];
  const fcValorDaNota = Math.round((fcValorRecebido + somaDosSinais(fcSinaisNaNota)) * 100) / 100;
  // O plano é calculado UMA vez: a trava, o rótulo do botão e a emissão têm que
  // falar da mesma coisa. Calculado em três lugares, um deles ia divergir.
  const fcPlanoDaNota = planoDeNotas({
    escolha: fcNota.escolha,
    valorRecebido: fcValorDaNota,
    divisao: fcNota.divisao,
    diaISO: todayISO(),
    parcelas: fcDivisao,
  });
  const fcTravaDaNota = travaDoFechamento({
    nota: fcNota,
    valorRecebido: fcValorDaNota,
    ehSinal: fcTipo === "SINAL_CONSULTA",
    plano: fcPlanoDaNota,
  });
  // O botão só promete emitir quando a nota REALMENTE vai sair. Prometer e não
  // cumprir é pior do que não prometer: quem fecha vai embora achando que a
  // prefeitura já recebeu.
  const fcTemNotaParaEmitir =
    integracaoLigada("focus_nfse") &&
    fcNota.escolha !== "SEM_NOTA" &&
    fcTipo !== "SINAL_CONSULTA" &&
    fcValorRecebido > 0 &&
    fcPlanoDaNota.notas.length > 0;
  // SÓ O ESTEVÃO EMITE (07/10/2026). Lucas: "quero que apenas o Estevão emita
  // as notas no fechamento, ninguém mais, e que isso dê para a gente controlar
  // o acesso". Quem não tem a permissão "Emitir nota fiscal" salva o fechamento
  // do mesmo jeito: a comanda nasce sem nota e fica na fila (Comandas
  // aguardando NF e "sem nota fiscal" no Lançar Dia) — o mesmo caminho da nota
  // que fica para depois. O servidor também recusa, então não dá para burlar.
  const fcPodeEmitirNota = podeEmitirNota(pessoa);
  const fcVaiEmitirNota = fcTemNotaParaEmitir && fcPodeEmitirNota;
  const fcNotaVaiParaFila = fcTemNotaParaEmitir && !fcPodeEmitirNota;
  const [fcEmitindo, setFcEmitindo] = useState(false);
  // O E-MAIL PARA ONDE A NOTA VAI (22/09/2026). Nasce do cadastro do paciente e
  // pode ser acertado no próprio fechamento; se o cadastro não tinha, ganha.
  const [fcEmailNota, setFcEmailNota] = useState("");
  useEffect(() => {
    setFcEmailNota(state.contacts.find((item) => item.id === fcPatient.ref)?.email ?? "");
  }, [fcPatient.ref, state.contacts]);
  // Se o CPF já está na ficha, o card não pede — e diz a verdade quando falta.
  const fcCpfNaFicha = useQuery({
    queryKey: ["contato-cpf", fcPatient.ref],
    queryFn: () => lerRemoteCpfDoContato(fcPatient.ref).catch(() => null),
    enabled: fechamentoOpen && Boolean(fcPatient.ref) && Boolean(pessoaAuth) && !isPreview,
    staleTime: 60_000,
  });
  const fcTomador = { nome: fcPatient.name, cpf: fcCpfNaFicha.data?.cpf ? "na ficha" : "", email: fcEmailNota };
  // CPF digitado na hora, quando a ficha não tem (pedido do Lucas, 22/09/2026).
  const [fcCpfNota, setFcCpfNota] = useState("");
  // O QUE FICOU PARA DEPOIS (29/09/2026). Fechou e não pagou tudo? A diferença
  // vira Lembrete de pagamento no mesmo clique — nunca mais "fechou" sem
  // comanda e sem cobrança (casos Wlamir e José Ferreira, 22–23/09).
  const [fcAReceberTexto, setFcAReceberTexto] = useState("");
  const [fcAReceberEditado, setFcAReceberEditado] = useState(false);
  const [fcAReceberData, setFcAReceberData] = useState("");
  const [fcAReceberObs, setFcAReceberObs] = useState("");
  const fcVendidoNumero = parseFinAmount(fcSold);
  const fcTemSaldo = fechamentoTemSaldo({ resultado: fcResultado, vendido: fcVendidoNumero, recebido: fcValorRecebido });
  useEffect(() => {
    if (fcAReceberEditado) return;
    const falta = aReceberSugerido(fcVendidoNumero, fcValorRecebido);
    setFcAReceberTexto(falta > 0.5 ? formataValor(falta) : "");
  }, [fcVendidoNumero, fcValorRecebido, fcAReceberEditado]);
  const fcTravaAReceber = travaDoAReceber({
    resultado: fcResultado,
    vendido: fcVendidoNumero,
    recebido: fcValorRecebido,
    aReceberValor: parseFinAmount(fcAReceberTexto),
    aReceberData: fcAReceberData,
    hojeISO: todayISO(),
  });
  // CPF E E-MAIL OBRIGATÓRIOS QUANDO VAI HAVER NOTA (29/09/2026).
  const fcTravaDadosDaNota = travaDosDadosDaNota({
    vaiTerNota: fechamentoVaiTerNota({
      resultado: fcResultado,
      recebido: fcValorRecebido,
      ehSinal: fcTipo === "SINAL_CONSULTA",
      semNota: fcNota.escolha === "SEM_NOTA",
    }),
    temCpfNaFicha: Boolean(fcCpfNaFicha.data?.cpf),
    cpfDigitado: fcCpfNota,
    email: fcEmailNota,
  });
  const fcTravaGeral = fcTravaDaNota || fcTravaAReceber || fcTravaDadosDaNota || "";
  const queryClientKanban = useQueryClient();
  // O TIPO DO ITEM SEGUE O QUE FOI VENDIDO (21/09/2026). Nascia fixo em
  // "Tratamento", então Plano e Consulta Black caíam como tratamento na comanda
  // e na planilha do contador. O seletor continua na tela e continua mandando —
  // isto só troca o padrão quando muda o tipo de atendimento ou o canal.
  useEffect(() => {
    setFcItemTipo(tipoDoItemDoFechamento({ tipo: fcTipo, canal: fcResultado }));
  }, [fcTipo, fcResultado]);
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
    // Confere no retrato da tela ANTES de anunciar (29/09/2026, auditoria B8c):
    // com outra régua ativa a inscrição não nasce, e a tela dizia "iniciada".
    const previa = iniciarRepescagemComResultado(state, candidato, { userId: actorId, role: "CONCIERGE" }, todayISO());
    if (!previa.nasceu) {
      setFeedback(`Repescagem de ${contactDisplayName(candidato.contact)} NÃO foi iniciada: ${previa.motivo}.`);
      return;
    }
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
    const busca = new URLSearchParams(params);
    busca.set("quadro", next);
    setParams(busca, { replace: true });
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
    const busca = new URLSearchParams(params);
    if (next === "all") busca.delete("secao");
    else busca.set("secao", next);
    setParams(busca, { replace: true });
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
    /**
     * O que escrever na linha da comanda quando ninguém escolheu produto nem
     * escreveu nada. NÃO é enfeite: o ticket médio lê a NATUREZA do item, e a
     * natureza de um item de tipo CONSULTA sai da descrição. Sem isto, um sinal
     * de R$ 500 entraria no ticket como venda.
     */
    descricaoPadrao: string;
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

    // O id da comanda nasce antes (29/09/2026): a entrada do crediário fica presa
    // a ela, e a comanda mostra "R$ X em dinheiro no Crediário" no Lançar Dia.
    const saleId = createFinId("fsale");
    if (valorDinheiro > 0) {
      const entradaNoCaixa = {
        id: chaveDoCrediario(saleId),
        dia: todayISO(),
        valor: valorDinheiro,
        descricao: `Fechamento — ${values.pacienteNome} (dinheiro)`,
        contactRef: values.contactRef || null,
        saleRef: valorComanda > 0 ? saleId : null,
      };
      if (podeSubirArquivo) {
        // Pela função do banco: quem fecha no Kanban nem sempre é da coordenação (dona do caixa).
        void gravarRemoteDinheiroDaComanda(entradaNoCaixa).catch((falha) => {
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
      return { saleId: null, valorDinheiro, valorComanda: 0, comandaGravada: Promise.resolve(false) };
    }

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
                description: values.notaInstrucao.trim() || values.descricaoPadrao,
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
    // A promessa sobe junto: é ela que o emissor da nota espera antes de pedir
    // a NFS-e, porque a Edge Function procura a comanda pelo client_ref.
    const comandaGravada = financeiro.addSale(comanda, (mensagem) =>
      setFeedback(
        `⚠️ A COMANDA NÃO FOI GRAVADA (${mensagem}). Ela está só neste aparelho — lance de novo pelo "Lançar dia" para o dinheiro entrar no fechamento.`,
      ),
    );

    // O comprovante nasce ligado a ESTA comanda (saleRef) — é assim que o
    // financeiro vê "R$ 5.000: 2.000 no PIX + 3.000 no cartão" com os prints.
    // 29/09/2026: o arquivo só sobe DEPOIS que a comanda existe no servidor.
    // Antes subia junto, e quando a comanda falhava o comprovante ficava
    // apontando para uma comanda que não existia.
    void comandaGravada
      .then((gravou) => (gravou || !podeSubirArquivo
        ? subirComprovantes({
            arquivos: values.arquivos,
            pacienteNome: values.pacienteNome,
            contactRef: values.contactRef,
            divisao: parcelasComanda.length ? parcelasComanda : divisaoBase,
            valorTotal: valorComanda,
            saleRef: saleId,
            observacao: [values.observacao.trim(), values.notaInstrucao.trim()].filter(Boolean).join(" · ") || "Lançado pelo Kanban",
          })
        : undefined))
      .catch((falha) => {
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

    return { saleId, valorDinheiro, valorComanda, comandaGravada };
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
        notaInstrucao: [resumoDaNota(newNota, planoDeNotas({ escolha: newNota.escolha, valorRecebido: recebidoAgora, divisao: newNota.divisao, diaISO: todayISO(), parcelas: newDivisao })), newNotaInstrucao.trim()]
          .filter(Boolean)
          .join(" · "),
        descricaoPadrao: descricaoPadraoDoFechamento({ tipo: newTipo, canal: "SOMENTE_TRATAMENTO" }),
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

  async function handleRegistrarFechamento(event: FormEvent) {
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
    // As três travas que decidem se o fechamento pode existir (29/09/2026).
    if (fcTravaAReceber) return setFcFeedback(fcTravaAReceber);
    if (fcTravaDadosDaNota) return setFcFeedback(fcTravaDadosDaNota);
    if (fcTravaDaNota) return setFcFeedback(fcTravaDaNota);

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

    // A comanda leva o que ENTROU (valor recebido) — é isso que o fechamento
    // diário e o extrato conferem. O valor vendido é o contrato, não o caixa.
    // NÃO FECHOU TAMBÉM PAGA (25/08/2026): a consulta que o paciente pagou vira
    // comanda igual, com o item e a régua do "não fechou".
    let lancado: ReturnType<typeof lancarComandaEComprovante> = null;
    if (receivedAmount > 0) {
      const ehPlano = fcResultado === "PROGRAMA_ACOMPANHAMENTO" || fcResultado === "CLUBE_BRATAN";
      lancado = lancarComandaEComprovante({
        contactRef: refDoPaciente,
        pacienteNome:
          fcPatient.name.trim() || contactDisplayName(state.contacts.find((item) => item.id === refDoPaciente)) || "Paciente",
        valorRecebido: receivedAmount,
        divisao: fcDivisao,
        itemTipo: fcItemTipo,
        itens: fcItens,
        arquivos: fcArquivos,
        mandaDepois: fcMandaDepois,
        notaInstrucao: [resumoDaNota(fcNota, fcPlanoDaNota), fcSinaisNaNota.length ? `inclui sinal já pago de ${moneyFin(somaDosSinais(fcSinaisNaNota))}` : "", fcNotaInstrucao.trim()]
          .filter(Boolean)
          .join(" · "),
        descricaoPadrao: descricaoPadraoDoFechamento({ tipo: fcTipo, canal: fcResultado }),
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
    }
    const recadoDoDinheiro =
      lancado && lancado.valorDinheiro > 0
        ? lancado.valorComanda > 0
          ? `Fechamento registrado: ${moneyFin(lancado.valorComanda)} na comanda do dia e ${moneyFin(lancado.valorDinheiro)} em dinheiro direto no caixa do crediário.`
          : `Fechamento registrado e ${moneyFin(lancado.valorDinheiro)} em dinheiro lançados direto no caixa do crediário (dinheiro não vira comanda).`
        : "";

    // A COMANDA ANTES DO CARD (29/09/2026). Antes o card virava "fechou" e a
    // comanda vinha depois — se ela falhasse, o negócio ficava ganho sem
    // dinheiro nenhum lançado. Agora, com dinheiro entrando, o card só muda de
    // coluna depois que a comanda existe no servidor.
    if (lancado?.saleId && podeSubirArquivo) {
      const gravou = await lancado.comandaGravada;
      if (!gravou) {
        setFcFeedback("A comanda não foi gravada no servidor, então o fechamento NÃO foi salvo. Confira a internet e tente de novo.");
        return;
      }
    }

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
    if (recadoDoDinheiro) setFeedback(recadoDoDinheiro);

    // O RESTO VIRA LEMBRETE (29/09/2026). Mesmo lugar onde a equipe já
    // registrava "paga depois" — só que agora nasce sozinho, com o paciente
    // ligado, e o fechamento não salva sem ele.
    if (fcTemSaldo && pessoaAuth && podeSubirArquivo) {
      const pacienteDoLembrete =
        fcPatient.name.trim() || contactDisplayName(state.contacts.find((item) => item.id === refDoPaciente)) || "Paciente";
      try {
        await createRemotePagamento({
          pessoa: pessoaAuth,
          pacienteNome: pacienteDoLembrete,
          contato: fcChannels.phone.trim() || undefined,
          crmContactRef: refDoPaciente,
          valorPendente: parseFinAmount(fcAReceberTexto),
          dataPrevista: fcAReceberData,
          observacao: ["Fechamento no Kanban — restante do combinado", fcAReceberObs.trim()].filter(Boolean).join(" · "),
        });
        void queryClientKanban.invalidateQueries({ queryKey: ["pagamentos-lembretes"] });
      } catch (falha) {
        setFeedback(
          `⚠️ O fechamento foi salvo, mas o Lembrete de ${moneyFin(parseFinAmount(fcAReceberTexto))} não foi criado (${(falha as Error).message}). Crie em Lembretes de pagamento para a cobrança não se perder.`,
        );
      }
    }

    // A NOTA SAI AQUI (21/09/2026) — depois da comanda existir, antes de fechar.
    //
    // O diálogo fica aberto enquanto a prefeitura é chamada: emitir documento
    // fiscal com a tela já fechada deixaria quem fechou sem saber se saiu. São
    // poucos segundos, e é o único momento em que a pessoa ainda está ali.
    //
    // 07/10/2026: quem não emite (fcNotaVaiParaFila) passa por aqui também, mas
    // sem chamar a prefeitura — só guarda CPF e e-mail na ficha, que é de onde
    // a função lê quando o Estevão emitir pela fila.
    if ((fcVaiEmitirNota || fcNotaVaiParaFila) && lancado?.saleId) {
      if (fcVaiEmitirNota) setFcEmitindo(true);
      try {
        // O CPF digitado na hora vai nesta nota e, se der permissão, para a ficha.
        // Sem permissão (quem fecha nem sempre cuida de Impostos & NF) a nota sai
        // identificada mesmo assim — a função não guarda o número em lugar nenhum.
        const cpfDigitado = cpfValido(fcCpfNota) ? cpfDigitos(fcCpfNota) : "";
        let cpfSoNestaTela = false;
        if (cpfDigitado && !fcCpfNaFicha.data?.cpf) {
          try {
            await salvarRemoteCpfDoContato(refDoPaciente, cpfDigitado, pessoaAuth?.id ?? null);
            void queryClientKanban.invalidateQueries({ queryKey: ["contato-cpf", refDoPaciente] });
          } catch {
            /* sem permissão para a ficha: o CPF vai só nesta nota */
            cpfSoNestaTela = true;
          }
        }
        if (fcNotaVaiParaFila) {
          // A NOTA FICA NA FILA (07/10/2026): a comanda já foi gravada; quem
          // emite a pega em Impostos & NFs. Se o CPF não coube na ficha, ele se
          // perderia em silêncio — então o recado diz.
          const recado = cpfSoNestaTela ? `${recadoNotaNaFila} O CPF digitado não ficou na ficha: passe para o Estevão.` : recadoNotaNaFila;
          toast(recado, { tom: "info", duracaoMs: 9000 });
          setFeedback((atual) => [atual, recado].filter(Boolean).join(" "));
        } else {
          const emissao = await emitirNotasDoFechamento({
            saleRef: lancado.saleId,
            escolha: fcNota.escolha,
            notas: fcPlanoDaNota.notas,
            pacienteNome: fcPatient.name.trim() || contactDisplayName(state.contacts.find((item) => item.id === refDoPaciente)) || "Paciente",
            // O CPF vem da ficha, no servidor: ele nunca passa por esta tela nem
            // fica gravado no app.
            cpf: cpfDigitado,
            email: fcEmailNota,
            solicitadoPor: pessoaAuth?.id ?? null,
            comandaGravada: lancado.comandaGravada,
            sinais: fcSinaisNaNota,
            invocar: (slug, body) => invocarIntegracao(slug, body),
            podeEmitir: fcPodeEmitirNota,
          });
          if (emissao.recado) {
            toast(emissao.recado, { tom: emissao.tudoCerto ? "ok" : "atencao", duracaoMs: emissao.tudoCerto ? 6000 : 12000 });
            if (!emissao.tudoCerto) setFeedback(emissao.recado);
          }
        }
        // O e-mail digitado no fechamento vira cadastro: da próxima vez já vem preenchido.
        const emailNota = fcEmailNota.trim().toLowerCase();
        const contatoDaNota = state.contacts.find((item) => item.id === refDoPaciente);
        if (emailNota && contatoDaNota && contatoDaNota.email.trim().toLowerCase() !== emailNota) {
          persist((current) => updateContactChannels(current, refDoPaciente, { phone: contatoDaNota.phone, email: emailNota }, pessoa?.id ?? "manual"));
        }
      } finally {
        setFcEmitindo(false);
      }
    }

    setFechamentoOpen(false);
    setFcPatient({ ref: "", name: "" });
    setFcEmailNota("");
    setFcCpfNota("");
    setFcChannels(emptyContactChannels);
    setFcSold("");
    setFcReceived("");
    setFcObjection("");
    setFcPartialReason("");
    setFcCompleto(true);
    setFcResultado("PROGRAMA_ACOMPANHAMENTO");
    setFcDivisao([parcelaVazia("PIX")]);
    setFcTipo("TRATAMENTO");
    setFcItemTipo("CONSULTA");
    setFcItens([]);
    setFcNotaInstrucao("");
    setFcNota(notaDoFechamentoVazia);
    setFcNotaQuando("COM_A_CONSULTA");
    setFcArquivos([]);
    setFcMandaDepois(false);
    setFcAReceberTexto("");
    setFcAReceberEditado(false);
    setFcAReceberData("");
    setFcAReceberObs("");
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
    if (!telaCrm.podeEditar) return avisarSoVe();
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
      // DESFAZER (16/09/2026, proposta 4.6): arrastar o cartão errado é fácil, e o
      // movimento gera tarefas. O estado inteiro de antes volta com um toque.
      const antes = current;
      toast(`${contactDisplayName(state.contacts.find((c) => c.id === deal.contactId)) || deal.title} foi para ${dealStageLabels[stage]}.`, {
        tom: "ok",
        duracaoMs: 7000,
        acao: { rotulo: "Desfazer", onClick: () => void persist(() => antes) },
      });
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
    const ok = await confirmar(`Excluir ${name} de vez?`, { corpo: "Isso apaga o lead, as negociações, as tarefas, as cadências e o histórico dele — em todos os aparelhos. Não tem como desfazer.", destrutivo: true, confirmar: "Excluir de vez" });
    if (!ok) return;
    setSelectedDealId("");
    const success = await deleteLead(selectedDeal.contactId);
    setFeedback(success ? `${name} foi excluído do CRM.` : `${name} foi excluído neste aparelho, mas a exclusão NÃO chegou ao Supabase — confira a internet e tente de novo.`);
  }

  // ---- CABEÇALHO DO QUADRO (08/10/2026, redesenho etapa 3 — imagem 04) ----
  // O nome do quadro é o título da página; "Trocar quadro" abre a lista por
  // urgência (o mesmo ?quadro= de antes). A frase diz o número com palavras e as
  // leituras (Todos · Para hoje · Atrasado · por setor) filtram o quadro aberto.
  const hojeDoQuadro = todayISO();
  const [leitura, setLeitura] = useState<LeituraDoQuadro>("todos");
  const [responsavelFiltro, setResponsavelFiltro] = useState("");
  const [seletorAberto, setSeletorAberto] = useState(false);
  useEffect(() => {
    setLeitura("todos");
    setResponsavelFiltro("");
  }, [board]);
  const kanbanDaCadencia = useMemo(
    () => (cadenciaAtiva ? buildKanbanCadencia(state, cadenciaAtiva, hojeDoQuadro) : null),
    [state, cadenciaAtiva, hojeDoQuadro],
  );
  const cartoesDaCadencia = useMemo(() => {
    if (!kanbanDaCadencia) return [];
    const termo = query.trim().toLowerCase();
    return kanbanDaCadencia.colunas
      .flatMap((coluna) => coluna.cartoes)
      .filter((cartao) => !termo || cartao.nome.toLowerCase().includes(termo) || cartao.motivo.toLowerCase().includes(termo));
  }, [kanbanDaCadencia, query]);
  const leiturasCadencia = useMemo(() => leiturasDaCadencia(cartoesDaCadencia), [cartoesDaCadencia]);
  const resumosParaSeletor: ResumoParaSeletor[] = useMemo(
    () =>
      cadenciasResumo.map((item) => ({
        id: item.cadence.id,
        rotulo: rotuloCurtoDaCadencia(item.cadence),
        nome: item.cadence.name,
        ativos: item.ativos,
        hoje: item.hoje,
        atrasados: item.atrasados,
      })),
    [cadenciasResumo],
  );
  const secoesDoQuadro = useMemo(
    () =>
      secoesDoSeletor({
        fixos: [
          { chave: "programa", rotulo: boardLabels.programa, destaque: programDeals.length, numero: programDeals.length === 1 ? "paciente" : "pacientes" },
          { chave: "comercial", rotulo: boardLabels.comercial, destaque: comercialDeals.length, numero: "em aberto" },
          {
            chave: "repescagem",
            rotulo: "Repescagens",
            destaque: quadroRepescagem.isca.length + quadroRepescagem.ligar.length,
            numero: quadroRepescagem.candidatos.length ? `na régua · ${quadroRepescagem.candidatos.length} para repescar` : "na régua",
          },
        ],
        cadencias: resumosParaSeletor,
      }),
    [programDeals.length, comercialDeals.length, quadroRepescagem, resumosParaSeletor],
  );
  const outrasComToque = toquesEmOutrasCadencias(resumosParaSeletor, cadenciaAtiva);
  const tituloDoQuadro =
    board === "programa"
      ? boardLabels.programa
      : board === "comercial"
        ? "Em aberto"
        : board === "repescagem"
          ? "Repescagens"
          : kanbanDaCadencia
            ? rotuloCurtoDaCadencia(kanbanDaCadencia.cadence)
            : "Cadência";
  const parados = board === "programa" ? programDeals.filter((deal) => faseVencida(deal, hojeDoQuadro)).length : 0;
  const fraseDoQuadro: FraseDoQuadro =
    board === "programa"
      ? fraseDoPlano({ pacientes: programDeals.length, parados, semAcao: withoutNextAction, vendido: soldTotal, mostrarValor: canSeeValue })
      : board === "comercial"
        ? fraseEmAberto({ abertos: comercialDeals.filter((deal) => deal.status === "OPEN").length, semResposta: resumoSla.semResposta.length })
        : board === "repescagem"
          ? fraseDaRepescagem({ isca: quadroRepescagem.isca.length, ligar: quadroRepescagem.ligar.length, candidatos: quadroRepescagem.candidatos.length })
          : fraseDaCadencia({
              ativos: kanbanDaCadencia?.totais.ativos ?? 0,
              hoje: kanbanDaCadencia?.totais.hoje ?? 0,
              atrasados: kanbanDaCadencia?.totais.atrasados ?? 0,
              soma: kanbanDaCadencia ? kanbanDaCadencia.colunas.flatMap((coluna) => coluna.cartoes).reduce((total, cartao) => total + cartao.valor, 0) : 0,
              mostrarValor: canSeeValue,
            });
  const explicacaoDoQuadro =
    board === "comercial"
      ? "Lista de quem ainda não tem fechamento registrado. O CRM começa quando o Estevão registra o fechamento: aí o paciente entra no Plano e as tarefas do D+1 nascem sozinhas."
      : board === "programa"
        ? "A jornada depois do fechamento. O cartão anda sozinho quando as tarefas da fase são concluídas; ninguém arrasta cartão. A coordenação corrige a fase pelos detalhes do cartão."
        : board === "repescagem"
          ? "Quem deixou de vir há 1, 3 ou 6 meses ou 1 ano (pela última comanda). A repescagem é por ligação: antes vai a isca no WhatsApp, só para saber o melhor horário."
          : kanbanDaCadencia?.cadence.description ||
            "Cada coluna é um passo da régua e o cartão fica no passo que está esperando. \"Fiz o toque\" registra o resultado e o cartão anda sozinho.";
  const opcoesDeStatus: [string, string, string][] = [["", "Todos", "Todas as negociações"], ["OPEN", "Abertos", "Negociações abertas"], ["WON_FULL", "Ganhos", "Ganhos completos"], ["WON_PARTIAL", "Parciais", "Ganhos parciais"], ["LOST", "Perdidos", "Perdidos"]];
  // Quantos em cada situação, no quadro aberto e com a busca (sem o filtro de situação).
  const contagemPorStatus = useMemo(() => {
    const termo = query.trim().toLowerCase();
    const doQuadro = state.deals.filter((deal) => {
      const contact = contactsById.get(deal.contactId);
      if (pessoa && contact && !canUserAccessContact(pessoa, contact)) return false;
      if (board === "programa" ? !(deal.programPhase && !deal.programOutcome) : Boolean(deal.programPhase)) return false;
      if (!termo) return true;
      return `${deal.title} ${contactDisplayName(contact)} ${deal.sourceChannel} ${deal.mainObjection}`.toLowerCase().includes(termo);
    });
    const contagem: Record<string, number> = { "": doQuadro.length };
    for (const deal of doQuadro) contagem[deal.status] = (contagem[deal.status] ?? 0) + 1;
    return contagem;
  }, [state.deals, contactsById, pessoa, query, board]);
  const menuAcao =
    "flex w-full items-center gap-2 rounded-controle px-3 py-2 text-left font-sans text-sm font-semibold leading-5 text-tinta hover:bg-saber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco";

  const pagina = (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1500px] flex-col gap-4 font-sans",
        fullscreen ? "fixed inset-0 z-50 max-w-none gap-3 overflow-hidden bg-papel p-4 max-md:p-3" : "",
      )}
    >
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Comercial"
        titulo={
          <span className="inline-flex max-w-full flex-wrap items-center gap-x-4 gap-y-2">
            <span className="min-w-0" title={kanbanDaCadencia?.cadence.name}>{tituloDoQuadro}</span>
            <SeletorDeQuadro
              secoes={secoesDoQuadro}
              atual={board}
              onEscolher={(chave) => changeBoard(chave as KanbanBoard)}
              aberto={seletorAberto}
              onAbertoChange={setSeletorAberto}
            />
          </span>
        }
        frase={
          <>
            <strong>{fraseDoQuadro.destaque}</strong>
            {fraseDoQuadro.resto}
            {fraseDoQuadro.alerta ? <span className="alerta">{fraseDoQuadro.alerta}</span> : null}
          </>
        }
        acoes={
          <>
            <Botao
              variante="primario"
              icone={<Plus className="h-4 w-4" aria-hidden="true" />}
              disabled={!telaCrm.podeEditar}
              title={telaCrm.motivo || undefined}
              onClick={() => { setFcFeedback(""); setFechamentoOpen(true); }}
            >
              Registrar fechamento
            </Botao>
            <Botao
              variante="secundario"
              icone={<UserPlus className="h-4 w-4" aria-hidden="true" />}
              disabled={!telaCrm.podeEditar}
              title={telaCrm.motivo || undefined}
              onClick={() => setLeadModalOpen(true)}
            >
              Novo lead
            </Botao>
            <details className="relative">
              <summary
                className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-controle border border-fio-2 bg-folha text-tinta-2 hover:border-borda-campo hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco [&::-webkit-details-marker]:hidden"
                aria-label="Mais ações"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 z-30 mt-2 grid w-64 gap-0.5 rounded-painel border border-fio bg-folha p-2 shadow-flutua max-md:left-0 max-md:right-auto">
                <button type="button" className={menuAcao} onClick={() => { setImportFeedback(""); setImportOpen(true); }}>
                  <Upload className="h-4 w-4 text-tinta-2" aria-hidden="true" /> Importar do Feegow
                </button>
                <button type="button" className={menuAcao} onClick={() => { setTourOpen(true); markTourSeen(); }}>
                  <GraduationCap className="h-4 w-4 text-tinta-2" aria-hidden="true" /> Como usar
                </button>
                {fullscreen ? (
                  <button type="button" className={menuAcao} onClick={() => setFullscreen(false)}>
                    <Minimize2 className="h-4 w-4 text-tinta-2" aria-hidden="true" /> Sair da tela cheia (Esc)
                  </button>
                ) : (
                  <button type="button" className={menuAcao} onClick={() => setFullscreen(true)}>
                    <Maximize2 className="h-4 w-4 text-tinta-2" aria-hidden="true" /> Tela cheia
                  </button>
                )}
                <Link to={crmModuleRoutes.tasks} className={menuAcao}>
                  <ArrowRight className="h-4 w-4 text-tinta-2" aria-hidden="true" /> Minhas tarefas
                </Link>
                {/* A densidade dos cartões saiu da barra (08/10/2026) e mora aqui: é preferência, não filtro. */}
                <div role="group" aria-label="Densidade dos cards" className="mt-1 grid gap-0.5 border-t border-fio pt-2">
                  <p className="px-3 pb-1 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">Tamanho dos cartões</p>
                  {(Object.keys(densityLabels) as KanbanDensity[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={density === item}
                      className={cn(menuAcao, density === item && "font-extrabold")}
                      onClick={() => changeDensity(item)}
                    >
                      <span className={cn("grid h-4 w-4 place-items-center rounded-full border", density === item ? "border-musgo bg-musgo" : "border-fio-2")} aria-hidden="true">
                        {density === item ? <span className="h-1.5 w-1.5 rounded-full bg-sobre-musgo" /> : null}
                      </span>
                      {densityLabels[item]}
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </>
        }
        rodape={
          fullscreen ? undefined : (
            <FraseDoFluxo link={cadenciaAtiva ? { to: "/crm/planilha", rotulo: "Ver na planilha" } : undefined}>
              {explicacaoDoQuadro}
            </FraseDoFluxo>
          )
        }
      />

      <CrmSyncBanner failed={syncFailed} detail={syncErrorDetail} onRetry={retrySync} />
      <AvisoSoVe soVe={telaCrm.soVe} />
      {/* CONFERÊNCIA DO FECHAMENTO (18/08/2026): fica aqui porque é aqui que o
          fechamento acontece. R$ 13.808 de um paciente foram dados como ganhos
          e nunca viraram comanda — o financeiro só descobriu comparando o
          extrato do banco com a agenda do Dr. Daniel na mão. (08/10/2026: desceu
          para baixo do cabeçalho — um cabeçalho por página, e ele vem primeiro.) */}
      {!fullscreen ? (
        <ConferenciaFechamentoCard
          crmState={state}
          sales={financeiro.sales}
          lembretes={lembretesQuery.data ?? []}
          cashEntries={caixaQuery.data ?? []}
          hoje={todayISO()}
        />
      ) : null}

      {!tourSeen && !fullscreen ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-bloco bg-saber px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold leading-5 text-tinta">
            <GraduationCap className="h-4 w-4 shrink-0 text-oliva" aria-hidden="true" />
            Primeira vez no Kanban? Veja como usar em 6 passos rápidos.
          </p>
          <div className="flex gap-2">
            <Botao variante="suave" tamanho="pq" onClick={() => { setTourOpen(true); markTourSeen(); }}>
              Ver tutorial
            </Botao>
            <Botao variante="fantasma" tamanho="pq" onClick={markTourSeen}>
              Agora não
            </Botao>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div role="status" className="flex items-start gap-2 rounded-bloco bg-saber px-4 py-3 text-sm font-semibold leading-5 text-tinta">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />
          {feedback}
        </div>
      ) : null}
      {selectedDeal ? (
        <NoCorpo>
        <div className="fixed inset-0 z-[70] bg-[var(--veu)]" onClick={() => setSelectedDealId("")}>
          <aside
            role="dialog"
            aria-label={`Detalhes de ${contactDisplayName(selectedContact)}`}
            className="ml-auto flex h-full w-[min(36rem,100vw)] flex-col overflow-y-auto border-l border-fio bg-folha p-6 font-sans text-tinta shadow-flutua max-md:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={RUBRICA}>Detalhes do cartão</p>
                <h2 className="mt-2 font-sans text-xl font-bold leading-7 text-tinta">{selectedDeal.title}</h2>
                <p className="mt-1 text-sm font-medium leading-5 text-tinta-2">{contactDisplayName(selectedContact)} · {dealStageLabels[selectedDeal.stage]}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Fechar os detalhes" onClick={() => setSelectedDealId("")}>
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-bloco bg-saber p-4">
                <p className={RUBRICA}>Próxima ação</p>
                {selectedNextTask ? (
                  <>
                    <p className="mt-2 text-sm font-bold leading-5 text-tinta">{selectedNextTask.title}</p>
                    <p className="mt-1 text-[13px] font-medium leading-5 tabular-nums text-tinta-2">
                      {formatCrmDateTime(selectedNextTask.dueAt)} - {taskEffectiveStatus(selectedNextTask)}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm font-medium leading-5 text-tinta-2">Sem próxima ação. Ao mover etapa, o app cria a pendência correta.</p>
                )}
                {(() => {
                  const lastDone = state.tasks
                    .filter((task) => task.dealId === selectedDeal.id && taskEffectiveStatus(task) === "DONE")
                    .sort((a, b) => (b.completedAt ?? b.dueAt ?? "").localeCompare(a.completedAt ?? a.dueAt ?? ""))[0];
                  return lastDone ? (
                    <p className="mt-2 text-[13px] font-semibold leading-5 text-ok">✓ Última concluída: {lastDone.title}</p>
                  ) : null;
                })()}
              </div>
              <div className="rounded-bloco bg-saber p-4">
                <p className={RUBRICA}>Qualidade</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Etiqueta tom={selectedNextTask ? "ok" : "atencao"}>{selectedNextTask ? "Com próxima ação" : "Falta próxima ação"}</Etiqueta>
                  <Etiqueta tom={selectedDeal.mainObjection ? "ok" : "atencao"}>{selectedDeal.mainObjection ? "Objeção registrada" : "Falta objeção"}</Etiqueta>
                </div>
              </div>
            </div>

            {selectedDeal.programPhase ? (
              <div className="mt-4 rounded-bloco bg-saber p-4">
                <p className={RUBRICA}>Jornada do Programa</p>
                <p className="mt-2 text-sm font-bold leading-5 text-tinta">
                  Fase: {programPhaseLabels[selectedDeal.programPhase]}
                  {selectedDeal.adhesionChannel ? ` · ${channelShort[selectedDeal.adhesionChannel]}` : ""}
                </p>
                <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{programPhaseHints[selectedDeal.programPhase]}</p>
                {(() => {
                  const gate = programGateStatus(state, selectedDeal.id);
                  if (!gate.total) return null;
                  return (
                    <div className="mt-2">
                      <p className="text-xs font-bold leading-4 text-tinta-2">Gate: <span className="tabular-nums text-tinta">{gate.done} de {gate.total}</span> concluídos</p>
                      {gate.missing.length ? (
                        <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
                          Faltam: {gate.missing.map((item) => crmRoleLabels[item.role]).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
                {selectedDeal.programPhase === "ENCERRAMENTO" && canOverridePhase && !selectedDeal.programOutcome ? (
                  <div className="mt-3">
                    <p className="text-xs font-bold leading-4 text-tinta-2">Ponto de decisão — desfecho:</p>
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
                  <Etiqueta tom="ok" className="mt-2">Desfecho: {programOutcomeLabels[selectedDeal.programOutcome]}</Etiqueta>
                ) : null}
                {selectedDeal.adhesionChannel && integracaoLigada("supersign") ? (
                  <div className="mt-3 rounded-controle border border-fio bg-folha p-3">
                    <p className="text-xs font-bold leading-4 text-tinta-2">Contrato de adesão (SuperSign)</p>
                    <p className="mt-1 text-sm font-medium leading-5 text-tinta">Manda o contrato-modelo para assinatura pelo WhatsApp/e-mail do paciente.</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={!telaCrm.podeEditar}
                      title={telaCrm.motivo || undefined}
                      onClick={() => {
                        void invocarIntegracao<{ ok: boolean; error?: string; url?: string | null }>("supersign-enviar", { dealRef: selectedDeal.id, contactRef: selectedDeal.contactId, nome: contactDisplayName(selectedContact), solicitadoPor: pessoa?.id ?? null }).then((r) => {
                          if (r.ok) toast(`Contrato enviado para ${contactDisplayName(selectedContact)}.${r.url ? " O link de assinatura ficou registrado." : ""}`, { tom: "ok" });
                          else toast(r.error ?? "O SuperSign não aceitou o envio.", { tom: "erro", duracaoMs: 7000 });
                        });
                      }}
                    >
                      Enviar contrato para assinatura
                    </Button>
                  </div>
                ) : null}
                {selectedDeal.adhesionChannel ? (
                  <div className={cn("mt-3 rounded-controle p-3", selectedDeal.receitaSncrEm ? "bg-ok-claro" : todayISO() >= PRAZO_SNCR ? "bg-erro-claro" : "bg-atencao-claro")}>
                    <p className="flex items-center gap-1 text-xs font-bold leading-4 text-tinta">
                      Receita controlada no SNCR
                      <InfoTip title="Por que isto está aqui">
                        RDC Anvisa 1.000/2025: receitas de medicamentos controlados (tirzepatida, semaglutida e outros com retenção) passam a ser
                        digitais, com numeração nacional do SNCR, até 30/09/2026. Aqui fica registrado o dia em que a receita deste plano foi
                        emitida pela plataforma integrada — o app não emite receita; só guarda a data para a coordenação acompanhar.
                      </InfoTip>
                    </p>
                    {selectedDeal.receitaSncrEm ? (
                      <p className="mt-1 text-sm font-semibold leading-5 text-ok">Registrada em {selectedDeal.receitaSncrEm.slice(8, 10)}/{selectedDeal.receitaSncrEm.slice(5, 7)}/{selectedDeal.receitaSncrEm.slice(0, 4)}.</p>
                    ) : (
                      <p className="mt-1 text-sm font-medium leading-5 text-tinta">
                        {todayISO() >= PRAZO_SNCR ? "Prazo da Anvisa já passou: este plano ainda não tem receita registrada no SNCR." : `Sem receita registrada no SNCR ainda (prazo da Anvisa: 30/09/2026).`}
                      </p>
                    )}
                    {canOverridePhase || isCoordenacao(pessoa?.cargo) ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input type="date" className="h-8 w-40 bg-folha" defaultValue={selectedDeal.receitaSncrEm ?? ""} onChange={(event) => setSncrData(event.target.value)} aria-label="Data da receita no SNCR" />
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
                  <div className="mt-4 border-t border-fio pt-3">
                    <p className="text-xs font-bold leading-4 text-tinta-2">Corrigir fase (só coordenação — fica registrado)</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
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
                          aria-pressed={selectedDeal.programPhase === phase}
                          className={cn(classeDoChip(selectedDeal.programPhase === phase), "disabled:cursor-default")}
                        >
                          {programPhaseLabels[phase]}
                        </button>
                      ))}
                    </div>
                    {/* CANAL ERRADO NO FECHAMENTO (10/09/2026, áudio da CEO: "ele
                        entrou novamente como programa e ele não é programa, ele é
                        uma consulta black"). Trocar o canal aqui reescreve a régua
                        sem apagar o fechamento — e pede a senha do gestor. */}
                    <div className="mt-4 border-t border-fio pt-3">
                      <p className="text-xs font-bold leading-4 text-tinta-2">
                        Corrigir o canal do fechamento (pede a senha do gestor)
                      </p>
                      <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
                        O canal define quais tarefas nascem. Trocando aqui, a fase e o que já foi feito ficam — as tarefas
                        da esteira errada são canceladas e as da certa nascem.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(Object.keys(adhesionChannelLabels) as CrmAdhesionChannel[]).map((canal) => (
                          <button
                            key={canal}
                            type="button"
                            disabled={selectedDeal.adhesionChannel === canal}
                            onClick={() => setPedidoCanal({ dealId: selectedDeal.id, canal })}
                            aria-pressed={selectedDeal.adhesionChannel === canal}
                            className={cn(classeDoChip(selectedDeal.adhesionChannel === canal), "disabled:cursor-default")}
                          >
                            {channelLabels[canal]}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setPedidoCanal({ dealId: selectedDeal.id, canal: null })}
                          className="inline-flex min-h-8 items-center rounded-controle border border-erro/40 bg-folha px-2.5 py-1 text-[13px] font-semibold leading-5 text-erro hover:bg-erro-claro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                        >
                          Consulta avulsa (sai da esteira)
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
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
                variant="ghost"
                className="ml-auto text-erro hover:bg-erro-claro hover:text-erro"
                onClick={() => void handleDeleteLead()}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Excluir lead
              </Button>
            </div>

            <div className="mt-6 rounded-bloco border border-fio bg-folha p-4">
              <p className={RUBRICA}>Cadastro do lead</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
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
                <p className="mt-2 text-[13px] font-semibold leading-5 text-atencao">
                  Este lead está sem telefone e sem e-mail — a cadência não tem para onde ligar nem escrever.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="outline" onClick={saveLeadName}>
                  Salvar cadastro
                </Button>
                {nameFeedback ? <p role="status" className="text-[13px] font-semibold leading-5 text-musgo">{nameFeedback}</p> : null}
              </div>
            </div>

            {!canOverridePhase ? (
              <p className="mt-6 rounded-bloco bg-saber p-4 text-[13px] font-medium leading-5 text-tinta-2">
                O card anda sozinho quando a tarefa é concluída em <strong>Minhas Tarefas</strong> — ninguém move card na mão.
                Precisa corrigir uma etapa? Fale com a coordenação.
              </p>
            ) : null}
            <form className={cn("mt-6 grid gap-4 sm:grid-cols-2", !canOverridePhase && "hidden")} onSubmit={handleMoveDeal}>
              <div>
                <Label>Nova etapa</Label>
                <select value={targetStage} onChange={(event) => setTargetStage(event.target.value as CrmDealStage)} className={cn(CAMPO, "cursor-pointer")}>
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
                  <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
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
                    className={cn(CAMPO, "cursor-pointer")}
                  >
                    {(Object.keys(channelLabels) as CrmAdhesionChannel[]).map((channel) => (
                      <option key={channel} value={channel}>{channelLabels[channel]}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
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
                <select value={objectionCategory} onChange={(event) => setObjectionCategory(event.target.value as CrmObjectionCategory)} className={cn(CAMPO, "cursor-pointer")}>
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
                <div role="alert" className="flex items-start gap-2 rounded-bloco bg-erro-claro px-4 py-3 text-sm font-semibold leading-5 text-erro sm:col-span-2">
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
        </NoCorpo>
      ) : null}

      {/* LEITURAS (08/10/2026): os filtros viram texto com número (Todos 10 ·
          Para hoje 5 · Atrasado 1 · um por setor), a busca fica na ponta e o
          "Mais N toques hoje em outras cadências" abre o seletor. */}
      {board === "repescagem" ? null : (
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {cadenciaAtiva ? (
          <GrupoDeLeituras rotulo="Mostrar no quadro">
            <Leitura
              ativa={leitura === "todos" && !responsavelFiltro}
              numero={leiturasCadencia.todos}
              onClick={() => {
                setLeitura("todos");
                setResponsavelFiltro("");
              }}
            >
              Todos
            </Leitura>
            <Leitura ativa={leitura === "hoje"} numero={leiturasCadencia.hoje} onClick={() => setLeitura(leitura === "hoje" ? "todos" : "hoje")}>
              Para hoje
            </Leitura>
            <Leitura
              ativa={leitura === "atrasado"}
              numero={leiturasCadencia.atrasado}
              tom={leiturasCadencia.atrasado ? "atencao" : undefined}
              onClick={() => setLeitura(leitura === "atrasado" ? "todos" : "atrasado")}
            >
              Atrasado
            </Leitura>
            {leiturasCadencia.responsaveis.length > 1
              ? leiturasCadencia.responsaveis.map((item) => (
                  <Leitura
                    key={item.nome}
                    ativa={responsavelFiltro === item.nome}
                    numero={item.total}
                    onClick={() => setResponsavelFiltro(responsavelFiltro === item.nome ? "" : item.nome)}
                  >
                    <AvatarMini nome={item.nome} className="-ml-1" />
                    {item.nome}
                  </Leitura>
                ))
              : null}
          </GrupoDeLeituras>
        ) : board === "programa" || board === "comercial" ? (
          <GrupoDeLeituras rotulo="Situação das negociações">
            {opcoesDeStatus.map(([valor, rotulo, completo]) => (
              <Leitura key={valor || "todos"} title={completo} ativa={status === valor} numero={contagemPorStatus[valor] ?? 0} onClick={() => setStatus(status === valor ? "" : valor)}>
                {rotulo}
              </Leitura>
            ))}
            <InfoTip title="Validações do Kanban" side="bottom">
              "Vendidos" soma o valor fechado pelo CRM. "Sem ação" conta negociações abertas sem próxima tarefa — a regra de
              ouro é zerar esse número. Ao mover etapas: não fechou exige objeção, fechou exige valor, parcial exige motivo.
            </InfoTip>
          </GrupoDeLeituras>
        ) : (
          <span aria-hidden="true" />
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-6 gap-y-3 max-md:ml-0 max-md:w-full max-md:justify-start">
          <LinkOutrasCadencias
            toques={outrasComToque.toques}
            cadencias={outrasComToque.cadencias}
            outras={Boolean(cadenciaAtiva)}
            onAbrir={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              setSeletorAberto(true);
            }}
          />
          <CampoBusca
            valor={query}
            onMudar={setQuery}
            rotulo="Buscar neste quadro"
            placeholder={board === "programa" || board === "comercial" ? "Buscar lead, paciente, origem ou objeção" : "Buscar paciente neste quadro"}
            className="w-60 max-md:w-full"
          />
        </div>
      </div>
      )}

      <div
        ref={boardRef}
        onPointerDown={board === "programa" || board === "comercial" ? onBoardPointerDown : undefined}
        onPointerMove={board === "programa" || board === "comercial" ? onBoardPointerMove : undefined}
        onPointerUp={board === "programa" || board === "comercial" ? onBoardPointerUp : undefined}
        onPointerCancel={board === "programa" || board === "comercial" ? onBoardPointerUp : undefined}
        style={fullscreen ? undefined : { height: `calc(100dvh - ${boardTop + 12}px)`, minHeight: 440 }}
        className={cn(
          "kanban-scroll touch-pan-x overflow-x-auto pb-2",
          board === "programa" ? "cursor-grab active:cursor-grabbing" : "",
          fullscreen ? "min-h-0 flex-1" : "min-h-0",
        )}
      >
        <div
          className={cn(
            board === "comercial"
              ? "w-full min-w-0 max-w-5xl"
              : cadenciaAtiva || board === "repescagem"
                ? "h-full w-full min-w-0"
                : cn("grid h-full w-max min-w-full grid-flow-col items-stretch gap-4 max-xl:gap-3", LARGURA_DA_COLUNA_DO_PLANO[density]),
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
                  <section aria-label="Em aberto (antes do fechamento)" className="grid gap-4">
                    {resumoSla.total || resumoSla.semResposta.length ? (
                      <p
                        className={cn(
                          "flex flex-wrap items-center gap-x-2 rounded-bloco px-4 py-3 text-sm font-semibold leading-5",
                          resumoSla.semResposta.length ? "bg-erro-claro text-erro" : "bg-ok-claro text-ok",
                        )}
                      >
                        <strong>Resposta ao lead:</strong> {resumoSla.frase}
                        <InfoTip title="SLA de resposta">
                          Tempo entre o lead entrar e o primeiro toque registrado (tarefa concluída ou mensagem/ligação na linha do tempo). A meta
                          é {resumoSla.limiteMinutos} min, definida em Administração → Configurações do negócio. Responder na primeira hora qualifica
                          cerca de 7 vezes mais do que responder depois.
                        </InfoTip>
                      </p>
                    ) : null}
                    <BlocoFolha as="div">
                      <p className={cn(RUBRICA, "border-b border-fio px-6 py-4 max-md:px-4")}>
                        {rows.length} em aberto · ainda sem fechamento registrado
                      </p>
                      {rows.length ? (
                        <ul>
                          {rows.map((deal) => {
                            const contact = contactsById.get(deal.contactId);
                            const phone = contact ? (contact.whatsapp || contact.phone || "").replace(/\D/g, "") : "";
                            const sla = slaDoNegocio(resumoSla, deal.id);
                            return (
                              <li key={deal.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-fio px-6 py-3 last:border-b-0 max-md:px-4">
                                <div className="min-w-0">
                                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold leading-5 text-tinta">
                                    <Link to={crmModuleRoutes.contact(deal.contactId)} className={NOME_LINK}>
                                      {contactDisplayName(contact)}
                                    </Link>
                                    {sla ? (
                                      <Etiqueta
                                        tom={sla.semResposta ? "erro" : sla.dentroDoSla ? "ok" : "atencao"}
                                        title={sla.semResposta ? `Sem nenhum toque desde a entrada (${formatMinutos(sla.minutos)})` : `Primeiro toque ${formatMinutos(sla.minutos)} depois da entrada (meta ${resumoSla.limiteMinutos} min)`}
                                      >
                                        {sla.semResposta ? `sem resposta há ${formatMinutos(sla.minutos)}` : sla.dentroDoSla ? `respondido em ${formatMinutos(sla.minutos)}` : `respondido em ${formatMinutos(sla.minutos)} (fora da meta)`}
                                      </Etiqueta>
                                    ) : null}
                                  </p>
                                  <p className="truncate text-[13px] font-medium leading-5 text-tinta-2">
                                    {dealStageLabels[deal.stage]}
                                    {deal.sourceChannel ? ` · ${deal.sourceChannel}` : ""}
                                    {phone ? ` · ${phone}` : ""}
                                  </p>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                  <Button
                                    type="button"
                                    variant="subtle"
                                    size="sm"
                                    disabled={!telaCrm.podeEditar}
                                    title={telaCrm.motivo || undefined}
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
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="px-6 py-8 text-center text-sm font-semibold leading-5 text-ok max-md:px-4">
                          Ninguém em aberto: todo mundo já tem fechamento registrado.
                        </p>
                      )}
                    </BlocoFolha>
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
                  <ColunaDoQuadro
                    key={phase}
                    rotulo={programPhaseLabels[phase]}
                    titulo={<span title={programPhaseHints[phase]}>{programPhaseLabels[phase]}</span>}
                    canal={
                      <InfoTip title={programPhaseLabels[phase]}>
                        {programPhaseHints[phase]}
                      </InfoTip>
                    }
                    esquerda={
                      <>
                        {phaseDeals.length} {phaseDeals.length === 1 ? "paciente" : "pacientes"}
                        {vencidos.length ? <span className="font-bold text-atencao"> · {vencidos.length} {vencidos.length === 1 ? "parado" : "parados"}</span> : null}
                      </>
                    }
                    direita={
                      <span className="font-semibold text-tinta-2" title={nextPhase ? `Depois: ${programPhaseLabels[nextPhase]}` : undefined}>
                        {nextPhase ? (prazoFase !== null ? `prazo ${prazoFase} d` : "→ próxima") : "fim da trilha"}
                      </span>
                    }
                    acima={
                      vencidos.length && canOverridePhase && prazoFase !== null ? (
                        <Botao
                          variante="secundario"
                          tamanho="pq"
                          bloco
                          className="border-atencao/40 text-atencao hover:border-atencao hover:bg-atencao-claro"
                          title="Só a coordenação vê este botão"
                          icone={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                          onClick={async () => {
                            if (!(await confirmar("Avançar os parados?", { corpo: `Avançar ${vencidos.length} paciente(s) parados em "${programPhaseLabels[phase]}" há mais de ${prazoFase} dia(s) para "Em acompanhamento"? O gate desta fase fica registrado como pulado pela coordenação.`, confirmar: "Avançar" }))) return;
                            persist((current) => vencidos.reduce((acc, deal) => setProgramPhase(acc, deal.id, "CADENCIA_PROGRAMA", pessoa?.id ?? "coordenacao"), current));
                            setFeedback(`${vencidos.length} paciente(s) de "${programPhaseLabels[phase]}" avançados para Em acompanhamento.`);
                          }}
                        >
                          Avançar {vencidos.length} parado(s) → Em acompanhamento
                        </Botao>
                      ) : undefined
                    }
                  >
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
                      <VazioDaColuna>{phase === "FECHAMENTO_D0" ? "Ninguém fechou hoje ainda" : "Nenhum paciente nesta fase"}</VazioDaColuna>
                    )}
                  </ColunaDoQuadro>
                );
              })}
          {cadenciaAtiva ? (
            <CadenciaKanban
              state={state}
              cadenceId={cadenciaAtiva}
              hoje={todayISO()}
              filtro={query}
              leitura={leitura}
              responsavel={responsavelFiltro}
              density={density}
              readOnly={false}
              mostrarValor={canSeeValue}
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
              busca={<CampoBusca valor={query} onMudar={setQuery} rotulo="Buscar neste quadro" placeholder="Buscar paciente neste quadro" className="w-60 max-md:w-full" />}
            />
          ) : null}
          {board === "programa"
            ? (() => {
                // Colunas de exceção da jornada (prompt do Lucas): quem caiu da
                // esteira aparece AQUI — primeiro com a Concierge (D1–D5), depois
                // com o Estevão (5 ligações) e, por fim, Encerrado (resgates futuros).
                // 08/10/2026: viraram zonas "para saber" (sem cartão, sem borda).
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
                      className="grid w-full gap-1 p-3 text-left transition-colors hover:bg-folha focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco [&+&]:border-t [&+&]:border-fio"
                    >
                      <span className="truncate text-sm font-bold leading-5 text-tinta">{contactDisplayName(contact)}</span>
                      <span className="truncate text-[13px] font-medium leading-5 text-tinta-2">{driver}</span>
                    </button>
                  );
                };
                return (
                  <>
                    <ColunaDoQuadro
                      saber
                      rotulo="Recuperação / Resgate"
                      icone={<PhoneCall className="text-atencao" aria-hidden="true" />}
                      titulo="Recuperação"
                      canal="resgate"
                      esquerda={`${recoveryDeals.length} ${recoveryDeals.length === 1 ? "paciente" : "pacientes"}`}
                      direita={<span className="font-semibold text-tinta-2">Concierge → Estevão</span>}
                    >
                      {recoveryDeals.length ? (
                        recoveryDeals.map((deal) =>
                          renderMini(
                            deal,
                            activeByContact.get(deal.contactId) === "cad-gestor-5lig" ? "Com o Estevão (5 ligações)" : "Com a Concierge (D1–D5)",
                          ),
                        )
                      ) : (
                        <VazioDaColuna>Ninguém em recuperação</VazioDaColuna>
                      )}
                    </ColunaDoQuadro>
                    <ColunaDoQuadro
                      saber
                      rotulo="Encerrado"
                      icone={<CheckCircle2 className="text-ok" aria-hidden="true" />}
                      titulo="Encerrado"
                      esquerda={`${closedDeals.length} na base`}
                      direita={<span className="font-semibold text-tinta-2">resgates 60d · 6m · 1a</span>}
                    >
                      {closedVisible.length ? (
                        <>
                          {closedVisible.map((deal) => renderMini(deal, dealStageLabels[deal.stage]))}
                          {closedDeals.length > closedVisible.length ? (
                            <p className="border-t border-fio px-3 py-3 text-center text-[13px] font-medium text-tinta-2">e mais {closedDeals.length - closedVisible.length}…</p>
                          ) : null}
                        </>
                      ) : (
                        <VazioDaColuna>Nenhum encerrado</VazioDaColuna>
                      )}
                    </ColunaDoQuadro>
                  </>
                );
              })()
            : null}
        </div>
      </div>

      <NoCorpo>
      <AnimatePresence>
        {fechamentoOpen ? (
          <motion.div
            key="modal-fechamento"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] grid place-items-center bg-[var(--veu)] px-4 py-6"
            onClick={() => setFechamentoOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="max-h-[86dvh] w-[min(36rem,94vw)] overflow-y-auto rounded-painel border border-fio bg-folha p-6 font-sans text-tinta shadow-flutua max-md:p-4"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-label="Registrar fechamento"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-sans text-xl font-bold leading-7 text-tinta">
                    <CircleDollarSign className="h-5 w-5 text-oliva" aria-hidden="true" />
                    Registrar fechamento
                  </h2>
                  <p className="mt-1 text-sm font-medium leading-5 text-tinta-2">
                    A jornada começa aqui: escolha o paciente, marque o que ele fechou e a esteira certa liga sozinha
                    (as tarefas do D+1 nascem para as pessoas certas).
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setFechamentoOpen(false)} aria-label="Fechar">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
              <form className="grid gap-4" onSubmit={handleRegistrarFechamento}>
                <div>
                  <Label>Paciente (busca por nome ou telefone — não duplica)</Label>
                  <div>
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
                  <div className="grid gap-2 sm:grid-cols-2">
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
                        aria-pressed={fcResultado === value}
                        className={classeDaEscolha(fcResultado === value)}
                      >
                        <span className="block text-sm font-bold leading-5">{label}</span>
                        <span className="block text-xs font-medium leading-4 text-tinta-2">{hint}</span>
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
                          "rounded-bloco px-4 py-3 text-[13px] font-medium leading-5",
                          canalDoPaciente ? "bg-saber text-tinta" : "bg-atencao-claro text-atencao",
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
                      <Label className="mr-1 pb-0">Fechou tudo?</Label>
                      <button type="button" aria-pressed={fcCompleto} onClick={() => setFcCompleto(true)} className={classeDoChip(fcCompleto)}>Completo (10% desc.)</button>
                      <button type="button" aria-pressed={!fcCompleto} onClick={() => setFcCompleto(false)} className={classeDoChip(!fcCompleto)}>Parcial (5% desc.)</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Valor vendido (R$)</Label>
                        <Input value={fcSold} onChange={(event) => setFcSold(event.target.value)} inputMode="decimal" placeholder="9000" className="tabular-nums" />
                      </div>
                    </div>

                    {/* Recebimento: mesmo bloco do cadastro, três passos e a
                        lista de destinos se completando (17/08/2026). */}
                    <RecebimentoNoKanban
                      titulo="Recebimento — daqui saem a comanda e o comprovante"
                      sinais={fcSinais}
                      somarSinais={fcSomarSinais}
                      onSomarSinais={setFcSomarSinais}
                      valorDaNota={fcValorDaNota}
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
                      nota={fcNota}
          tomador={fcTomador}
          onEmailChange={setFcEmailNota}
          cpfRascunho={fcCpfNota}
          onCpfChange={setFcCpfNota}
                      onNotaChange={setFcNota}
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

                    {fcTemSaldo ? (
                      <div className="grid gap-3 rounded-bloco bg-saber p-4">
                        <p className={RUBRICA}>O que ficou para depois</p>
                        <p className="text-[13px] font-medium leading-5 text-tinta-2">
                          Vendido {moneyFin(fcVendidoNumero)}, entrou {moneyFin(fcValorRecebido)} agora. A diferença vira um
                          Lembrete de pagamento com o paciente ligado — o fechamento não salva sem ele.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div>
                            <Label htmlFor="fc-a-receber-valor">Vai pagar depois (R$)</Label>
                            <Input
                              id="fc-a-receber-valor"
                              value={fcAReceberTexto}
                              onChange={(event) => {
                                setFcAReceberEditado(true);
                                setFcAReceberTexto(event.target.value);
                              }}
                              inputMode="decimal"
                            />
                          </div>
                          <div>
                            <Label htmlFor="fc-a-receber-data">Combinou pagar em</Label>
                            <Input id="fc-a-receber-data" type="date" min={todayISO()} value={fcAReceberData} onChange={(event) => setFcAReceberData(event.target.value)} />
                          </div>
                          <div>
                            <Label htmlFor="fc-a-receber-obs">Como (opcional)</Label>
                            <Input id="fc-a-receber-obs" value={fcAReceberObs} onChange={(event) => setFcAReceberObs(event.target.value)} placeholder="Ex.: Pix no dia 10, cartão 6x" />
                          </div>
                        </div>
                      </div>
                    ) : null}
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
                      <select value={fcObjectionCategory} onChange={(event) => setFcObjectionCategory(event.target.value as CrmObjectionCategory)} className={cn(CAMPO, "cursor-pointer")}>
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
                        sinais={fcSinais}
                        somarSinais={fcSomarSinais}
                        onSomarSinais={setFcSomarSinais}
                        valorDaNota={fcValorDaNota}
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
                        nota={fcNota}
          tomador={fcTomador}
          onEmailChange={setFcEmailNota}
          cpfRascunho={fcCpfNota}
          onCpfChange={setFcCpfNota}
                      onNotaChange={setFcNota}
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
                  <div role="alert" className="flex items-start gap-2 rounded-bloco bg-erro-claro px-4 py-3 text-sm font-semibold leading-5 text-erro">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {fcFeedback}
                  </div>
                ) : null}
                {fcTravaGeral ? (
                  <div className="flex items-start gap-2 rounded-bloco bg-atencao-claro px-4 py-3 text-sm font-semibold leading-5 text-atencao">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {fcTravaGeral}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 border-t border-fio pt-4">
                  <Botao variante="primario" type="submit" disabled={Boolean(fcTravaGeral) || fcEmitindo}>
                    {fcEmitindo
                      ? "Emitindo a nota…"
                      : fcVaiEmitirNota
                        ? fcPlanoDaNota.notas.length > 1
                          ? `Salvar e emitir ${fcPlanoDaNota.notas.length} notas`
                          : "Salvar e emitir a nota"
                        : "Salvar fechamento"}
                  </Botao>
                  <Button type="button" variant="outline" disabled={fcEmitindo} onClick={() => setFechamentoOpen(false)}>Cancelar</Button>
                  {fcEmitindo ? (
                    <span className="text-[13px] font-medium leading-5 text-tinta-2">Falando com a prefeitura — não feche a tela.</span>
                  ) : fcNotaVaiParaFila ? (
                    // 07/10/2026: quem não emite fica sabendo ANTES de salvar.
                    <span className="text-[13px] font-medium leading-5 text-tinta-2">Nota fiscal: quem emite é o Estevão. Ao salvar, a comanda fica na fila de notas.</span>
                  ) : null}
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
            className="fixed inset-0 z-[75] grid place-items-center bg-[var(--veu)] px-4 py-6"
            onClick={() => setLeadModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="max-h-[86dvh] w-[min(34rem,94vw)] overflow-y-auto rounded-painel border border-fio bg-folha p-6 font-sans text-tinta shadow-flutua max-md:p-4"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-label="Novo lead"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-sans text-xl font-bold leading-7 text-tinta">
                    <UserPlus className="h-5 w-5 text-oliva" aria-hidden="true" />
                    Novo lead sem retrabalho
                  </h2>
                  <p className="mt-1 text-sm font-medium leading-5 text-tinta-2">
                    Se o telefone já existir, o app avisa e reaproveita o cadastro — nada duplica.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setLeadModalOpen(false)} aria-label="Fechar">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleCreateLead}>
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
                    nota={newNota}
          tomador={{ nome: newName, cpf: "", email: newEmail }}
          onEmailChange={setNewEmail}
                    onNotaChange={setNewNota}
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
                  <select value={newTemp} onChange={(event) => setNewTemp(event.target.value as CrmLeadTemperature)} className={cn(CAMPO, "cursor-pointer")}>
                    <option value="COLD">Frio</option>
                    <option value="WARM">Morno</option>
                    <option value="HOT">Quente</option>
                  </select>
                </div>
                <div>
                  <Label>Persona</Label>
                  <select value={newFit} onChange={(event) => setNewFit(event.target.value as CrmPersonaFit)} className={cn(CAMPO, "cursor-pointer")}>
                    <option value="AAA">AAA</option>
                    <option value="HIGH_TICKET">High ticket</option>
                    <option value="MEDIUM">Médio</option>
                    <option value="LOW_FIT">Baixo fit</option>
                    <option value="UNKNOWN">A validar</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-fio pt-4 sm:col-span-2">
                  <Botao variante="primario" type="submit" icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
                    Criar contato e oportunidade
                  </Botao>
                  <Button type="button" variant="outline" onClick={() => setLeadModalOpen(false)}>
                    Fechar
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </NoCorpo>

      <GuidedTour open={tourOpen} steps={kanbanTourSteps} title="Como usar o Kanban" onClose={() => setTourOpen(false)} />
      {importOpen ? (
        <NoCorpo>
        <div className="fixed inset-0 z-[75] grid place-items-center bg-[var(--veu)] p-4" onClick={() => setImportOpen(false)}>
          <div role="dialog" aria-label="Importar do Feegow" className="w-[min(30rem,94vw)] rounded-painel border border-fio bg-folha p-6 font-sans text-tinta shadow-flutua max-md:p-4" onClick={(event) => event.stopPropagation()}>
            <h2 className="font-sans text-xl font-bold leading-7 text-tinta">Importar do Feegow</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-tinta-2">
              No Feegow, exporte a lista de pacientes (ou leads) e salve como <strong>CSV</strong>. O app acha as colunas de
              nome, telefone e e-mail sozinho e não duplica quem já existe.
            </p>
            <div className="mt-4 flex gap-2">
              {([["PATIENT", "Pacientes (já atendidos)"], ["LEAD", "Leads (para cadências)"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setImportAs(value)}
                  aria-pressed={importAs === value}
                  className={classeDoChip(importAs === value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-4 w-full font-sans text-sm font-medium text-tinta-2 file:mr-3 file:h-10 file:cursor-pointer file:rounded-controle file:border file:border-solid file:border-fio-2 file:bg-folha file:px-4 file:font-sans file:text-sm file:font-bold file:text-tinta hover:file:border-borda-campo"
              aria-label="Arquivo CSV do Feegow"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFeegowFile(file);
                event.target.value = "";
              }}
            />
            {importFeedback ? (
              <p role="status" className="mt-3 rounded-bloco bg-saber px-4 py-3 text-sm font-semibold leading-5 text-tinta">
                {importFeedback}
              </p>
            ) : null}
            <div className="mt-4 text-right">
              <Button type="button" variant="ghost" size="sm" onClick={() => setImportOpen(false)}>Fechar</Button>
            </div>
          </div>
        </div>
        </NoCorpo>
      ) : null}

      {/* A senha do gestor entra ANTES de reescrever a régua de um fechamento. */}
      {pedidoCanal ? (
        <NoCorpo>
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
        </NoCorpo>
      ) : null}
</div>
  );
  // Tela cheia (08/10/2026): a página sobe para o <body>, para o topo da casca não
  // cobrir o cabeçalho. O estado mora aqui em cima, então nada se perde na troca.
  return fullscreen ? <NoCorpo>{pagina}</NoCorpo> : pagina;
}

// A tela inteira passa pelo controle de Administração → Acessos, igual às outras
// do CRM: sem isto, quem tivesse o CRM ocultado ainda entrava pelo endereço.
export function CrmKanbanPage() {
  return (
    <AccessGate allowed={canCrmBratan} label="CRM · Kanban Comercial" module="crm">
      <CrmKanbanPageConteudo />
    </AccessGate>
  );
}
