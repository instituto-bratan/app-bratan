// INTELIGÊNCIA 360 — a visão geral e as 9 seções (Ticket, Precificação,
// Comercial, Jornada, Réguas, Retenção, Experiência, Recebíveis, Ações) mais as
// Configurações do 360 (que moram em Ajustes no menu).
//
// REDESENHO (08/10/2026, Papel & Musgo, etapa 4 — Resultados › Inteligência 360):
//  · a navegação própria (Module360Nav, com pílulas em três grupos) saiu: as
//    seções se escolhem num SELETOR único — no computador, o do caminho no topo
//    da casca; no celular, o mesmo seletor no cabeçalho da página (pecas360).
//    As URLs das seções não mudam (/inteligencia-360/:section);
//  · um cabeçalho só (Cabecalho da fundação), com o número já explicado em frase;
//  · o que pede decisão (insights com "Criar ação", tabelas com Remover/Pago/
//    Concluir, os formulários) mora em FOLHA; o que é para ler (indicadores,
//    gráficos, qualidade dos dados, NPS do totem) mora em SABER;
//  · nada de vidro, blur, degradê nem as classes antigas com opacidade, que não
//    geravam CSS. Mesmos dados, mesmos botões, mesmas permissões.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, CheckCircle2, Copy, FileText, Plus, Trash2 } from "lucide-react";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, LinkSeta } from "@/components/ui/fundacao";
import { deriveInteligencia360FromCrm, loadCrmState } from "@/features/crm/crmData";
import { useAuth } from "@/hooks/useAuth";
import { FRASE_SO_VE, avisarSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { exportBrandedPdf } from "@/lib/brandedPdf";
import { readLocalValue, todayISO } from "@/lib/localStore";
import { buildMetaDoDiaMessage, buildMetasBoard, defaultMetasConfig, type MetasConfig } from "@/features/financeiro/metasData";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { buildTicketMedio, saleTotal as saleTotal360 } from "@/features/financeiro/financeiroData";
import { buildNpsResumo, npsFaixa, npsFaixaLabels } from "./npsData";
import { findOrCreateCrmContact } from "@/features/crm/crmData";
import { clusterPersonNames, extractPersonName, personNamesMatch } from "@/features/crm/nameMatch";
import { useCrmState } from "@/features/crm/useCrmState";
import { listRemoteComprovantes, listRemoteInteligencia360State, listRemoteNpsRespostas, listRemotePagamentos, saveRemoteInteligencia360State } from "@/lib/remoteData";
import { mergePagamentoReceivables } from "@/features/pagamentos/pagamentosData";
import { mergeComprovanteReceivables } from "@/features/comprovantes/comprovantesData";
import { BarsWithLine, CalendarHeatGrid, Donut, RankBars, chartColors } from "@/components/charts/BratanCharts";
import {
  buildCalendarHeat,
  buildMonthlyResultSeries,
  buildPaymentDonut,
  buildPrescriptionFunnel,
  buildWeekdayStrength,
} from "@/lib/chartData";
import { buildP12Matrix, crediarioProfitOfMonth } from "@/features/financeiro/financeiroData";
import { cn } from "@/lib/utils";
import { Campo, Leituras, Selecao, classeDoCampo, tabela } from "@/features/financeiro/pecasBancoFechamento";
import { AvisoDaTela, CAMPO_TEXTO, Etiqueta, MARCAR } from "@/features/financeiro/pecasDiaPagar";
import {
  Indicador,
  MarcaDoPeriodo,
  NumeroDoIndicador,
  RUBRICA_RESULTADOS,
  SeloDaSituacao,
  TituloDeBloco,
  type TomDaSituacao,
  type TomDoIndicador,
} from "@/features/financeiro/pecasMetasPdca";
import { SeletorDaSecaoNoCelular, celulaEhNumero } from "./pecas360";
import {
  actionPriorityLabels,
  actionStatusLabels,
  receivableStatusLabels,
  rescueTypeLabels,
  rescueStatusLabels,
  ticketStatusLabels,
  feedbackTypeLabels,
  prescriptionStatusLabels,
  expectedImpactLabels,
  touchStatusLabels,
  averageTicketReceived,
  averageTicketSold,
  createId360,
  isOverdue,
  loadInteligencia360State,
  moduleRoutes360,
  money360,
  mergePrescriptionReceivables,
  objectionLabels,
  parseNumber360,
  percent360,
  pricingComputed,
  receivableOpenAmount,
  rootCauseLabels,
  saveInteligencia360State,
  stageLabels,
  ticketStatus,
  ticketVariationPercentage,
  touchTypeLabels,
  updateActionStatus360,
  updateReceivableStatus360,
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
  type PrescriptionSale,
  type PrescriptionStatus360,
  type Receivable,
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
  generateWeeklyKickoffBrief,
} from "./intelligenceEngine";
import { confirmar } from "@/components/ui/avisos";

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
};

// A ordem é a do seletor (src/lib/navegacao.ts). Configurações mora em Ajustes.
const modules: ModuleConfig[] = [
  {
    slug: "ticket-medio",
    title: "Ticket médio semanal",
    description: "Preenchimento por semana, médico e tipo de paciente.",
    href: moduleRoutes360.ticket,
    source: "Fonte do ticket médio, metas e variação semanal.",
  },
  {
    slug: "precificacao",
    title: "Precificação e margem",
    description: "Preço, custo, repasse, desconto permitido e margem.",
    href: moduleRoutes360.pricing,
    source: "Fonte de preço mínimo, margem e política comercial.",
  },
  {
    slug: "comercial",
    title: "Comercial e prescrições",
    description: "Prescrito x vendido, objeções, descontos e follow-up.",
    href: moduleRoutes360.commercial,
    source: "Fonte de receita vendida, conversão e objeções.",
  },
  {
    slug: "jornada-paciente",
    title: "Jornada do paciente",
    description: "Etapa, contrato, agenda, grupos e gargalos por setor.",
    href: moduleRoutes360.journey,
    source: "Fonte de contratos pendentes e pacientes sem próximo passo.",
  },
  {
    slug: "reguas",
    title: "Réguas de relacionamento",
    description: "Toques, mensagens, responsáveis, opt-out e fadiga.",
    href: moduleRoutes360.touchpoints,
    source: "Fonte de contato, resgate e excesso de mensagens.",
  },
  {
    slug: "retencao-resgate",
    title: "Retenção, resgate e churn",
    description: "Coortes, tentativas, investigação e motivos de evasão.",
    href: moduleRoutes360.retention,
    source: "Fonte de retenção, pacientes em resgate e churn.",
  },
  {
    slug: "experiencia",
    title: "Experiência do paciente",
    description: "NPS, Google, feedback e contato de liderança.",
    href: moduleRoutes360.experience,
    source: "Fonte de reputação, críticas abertas e ações corretivas.",
  },
  {
    slug: "recebiveis",
    title: "Recebíveis e caixa",
    description: "Vendido não é caixa: aberto, vencido e recebido.",
    href: moduleRoutes360.receivables,
    source: "Fonte de receita recebida, aberto, vencido e aging.",
  },
  {
    slug: "acoes",
    title: "Ações e plano de melhoria",
    description: "Dono, prazo, prioridade, status e impacto esperado.",
    href: moduleRoutes360.actions,
    source: "Fonte de execução gerada por insights e gestão.",
  },
  {
    slug: "configuracoes",
    title: "Configurações do 360",
    description: "Metas, limites, responsáveis e origem dos dados.",
    href: moduleRoutes360.settings,
    source: "Fonte das metas, alertas e regras do motor 360.",
  },
];

const moduleBySlug = Object.fromEntries(modules.map((module) => [module.slug, module])) as Record<ModuleSlug, ModuleConfig>;

function useInteligenciaState() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [state, setState] = useState<Inteligencia360State>(() => loadInteligencia360State());
  // Enquanto houver edição local não confirmada (ou save em voo), o snapshot
  // remoto NÃO sobrescreve o estado — mesmo padrão do useCrmState. Sem isto, o
  // refetch disparado pelo próprio save trazia um retrato antigo e apagava
  // edições rápidas (ex.: iniciar/concluir ação em sequência).
  const dirtyRef = useRef(false);
  const remoteStateQuery = useQuery({
    queryKey: ["inteligencia-360-state"],
    queryFn: listRemoteInteligencia360State,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const saveRemoteMutation = useMutation({
    mutationFn: saveRemoteInteligencia360State,
    onSuccess: (_result, saved) => {
      // O que subiu É a verdade: entra no cache e vira base, sem refetch que
      // pudesse ecoar um estado anterior por cima de uma edição mais nova.
      dirtyRef.current = false;
      queryClient.setQueryData(["inteligencia-360-state"], saved);
    },
  });

  // Recebíveis 360 é alimentado pelos lembretes de pagamento e pelos comprovantes
  // marcados com "Alimentar Recebíveis 360". Até 16/09/2026 essa junção só rodava
  // em modo local (o submit remoto voltava antes), então quem estava logado nunca
  // via nada aqui. Agora a junção acontece na leitura, que é onde ela vale para
  // todo mundo — e, como os ids são derivados, repetir não duplica.
  const pagamentosQuery = useQuery({ queryKey: ["360-pagamentos"], queryFn: listRemotePagamentos, enabled: useRemote, staleTime: 30_000 });
  const comprovantesQuery = useQuery({
    queryKey: ["360-comprovantes", pessoa?.cargo ?? ""],
    queryFn: () => listRemoteComprovantes(pessoa!.cargo),
    enabled: useRemote && Boolean(pessoa?.cargo),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!remoteStateQuery.data) return;
    if (dirtyRef.current || saveRemoteMutation.isPending) return;
    const base = remoteStateQuery.data;
    const comRecebiveis: Inteligencia360State = {
      ...base,
      receivables: mergeComprovanteReceivables(mergePagamentoReceivables(base.receivables, pagamentosQuery.data ?? []), comprovantesQuery.data ?? []),
    };
    setState(comRecebiveis);
    saveInteligencia360State(comRecebiveis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStateQuery.dataUpdatedAt, pagamentosQuery.dataUpdatedAt, comprovantesQuery.dataUpdatedAt]);

  // Modo LOCAL (preview/offline): deriva do CRM no load, igual o remoto re-deriva
  // a cada fetch. Sem isto, abrir o 360 sem ter tocado no CRM mostrava um retrato
  // possivelmente defasado. O remoto ignora (já vem derivado do servidor).
  useEffect(() => {
    if (useRemote) return;
    const derived = deriveInteligencia360FromCrm(loadCrmState(), loadInteligencia360State());
    setState(derived);
    saveInteligencia360State(derived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRemote]);

  function persist(updater: (current: Inteligencia360State) => Inteligencia360State) {
    setState((current) => {
      const next = updater(current);
      saveInteligencia360State(next);
      if (useRemote) {
        dirtyRef.current = true;
        void saveRemoteMutation.mutateAsync(next).catch((error) => {
          console.warn("Inteligência 360 não sincronizou com o Supabase.", error);
        });
      }
      return next;
    });
  }

  return {
    state,
    persist,
    syncMode: useRemote ? "Supabase" : "Local",
    isSyncing: remoteStateQuery.isFetching || saveRemoteMutation.isPending,
    syncError: remoteStateQuery.error || saveRemoteMutation.error,
  };
}

function copyText(text: string, onDone?: (message: string) => void) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => onDone?.("Copiado! Cole no WhatsApp ou onde precisar."))
    .catch(() => onDone?.("Não consegui copiar automaticamente — tente de novo."));
}

// Converte o texto do resumo em um PDF com a identidade visual do Instituto.
function exportBriefPdf(title: string, brief: string, author?: string) {
  const blocks = brief.split("\n\n");
  return exportBrandedPdf({
    title,
    subtitle: "Resumo gerado automaticamente pela Inteligência 360",
    author,
    sections: blocks.map((block, index) => {
      const lines = block.split("\n");
      const heading = index === 0 ? lines[0] : lines[0]?.replace(/[:：]\s*$/, "");
      const body = lines.slice(1);
      return { heading: heading || `Seção ${index + 1}`, lines: body.length ? body : [" "] };
    }),
  });
}

function todayPlus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- campos (guia, seção 09)

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
    <Campo rotulo={label}>
      <input value={value} type={type} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={classeDoCampo} />
    </Campo>
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
    <Campo rotulo={label}>
      <Selecao value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Selecao>
    </Campo>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Campo rotulo={label} className="sm:col-span-2">
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className={CAMPO_TEXTO} />
    </Campo>
  );
}

/** A grade dos formulários do 360 (4 colunas no computador) e a linha do botão de enviar. */
const GRADE_DO_FORM = "grid gap-4 md:grid-cols-2 xl:grid-cols-4";
const LINHA_DO_ENVIAR = "flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4";

// ---------------------------------------------------------------- moldura da página

/** A situação da sincronização, em palavra (a cor nunca fala sozinha). */
function EstadoDaSincronia({ syncError, isSyncing, syncMode }: { syncError: unknown; isSyncing: boolean; syncMode: string }) {
  return (
    <span className="flex h-10 items-center">
      <Etiqueta tom={syncError ? "erro" : "neutro"}>{syncError ? "Sem sincronizar" : isSyncing ? "Sincronizando" : syncMode}</Etiqueta>
    </span>
  );
}

/**
 * Um cabeçalho só (sobrancelha "Resultados · Inteligência 360"), o seletor da
 * seção no celular e o conteúdo da seção, com o mesmo respiro entre os blocos.
 */
function Moldura360({
  children,
  titulo,
  frase,
  acoes,
  sobrancelha = "Resultados · Inteligência 360",
}: {
  children: ReactNode;
  titulo: ReactNode;
  frase: ReactNode;
  acoes?: ReactNode;
  /** As Configurações do 360 moram em Ajustes (menu aprovado). */
  sobrancelha?: string;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[1320px] gap-8 font-sans text-tinta max-md:gap-6">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha={sobrancelha}
        titulo={titulo}
        frase={frase}
        acoes={
          <>
            <SeletorDaSecaoNoCelular />
            {acoes}
          </>
        }
      />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- insight (decisão)

function InsightDaSemana({
  insight,
  onCreateAction,
}: {
  insight: ReturnType<typeof generateActionRecommendations>[number];
  onCreateAction: () => void;
}) {
  const tom: TomDaSituacao = insight.severity === "critical" ? "erro" : insight.severity === "attention" ? "atencao" : "ok";
  return (
    <li className="grid gap-3 border-t border-fio px-6 py-5 max-md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SeloDaSituacao tom={tom}>{insight.severity === "critical" ? "Crítico" : insight.severity === "attention" ? "Atenção" : "Saudável"}</SeloDaSituacao>
        <LinkSeta to={insight.sourceHref}>Abrir origem</LinkSeta>
      </div>
      <div>
        <h3 className="text-base font-bold leading-6 text-tinta">{insight.title}</h3>
        <p className="mt-1 text-sm font-medium leading-[22px] text-tinta-2">{insight.description}</p>
      </div>
      <div className="rounded-controle bg-saber px-4 py-3 shadow-[inset_3px_0_0_rgb(var(--dourado-rgb))]">
        <p className={RUBRICA_RESULTADOS}>Próxima ação recomendada</p>
        <p className="mt-1 text-sm font-semibold leading-[22px] text-tinta">{insight.recommendation}</p>
      </div>
      {insight.canCreateAction ? (
        <div>
          <Botao type="button" variante="suave" tamanho="pq" icone={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={onCreateAction}>
            Criar ação
          </Botao>
        </div>
      ) : null}
    </li>
  );
}

// Pacientes que passaram na comanda mas não existem no Kanban/CRM.
// Um clique cria todos como pacientes, sem duplicar (dedupe por nome/telefone).
function ComandaKanbanReconciliation() {
  const { pessoa } = useAuth();
  const year = Number(new Date().toISOString().slice(0, 4));
  const financeiro = useFinanceiro(year);
  const { state: crmState, persist: persistCrm } = useCrmState();
  const [reconcileFeedback, setReconcileFeedback] = useState("");

  const missing = useMemo(() => {
    const contactIds = new Set(crmState.contacts.map((contact) => contact.id));
    // Limpa anotações da recepção ("NF unificada", datas, obs) e agrupa
    // variações do mesmo nome ("Fulana de Tal" + "Fulana Almeida") no mais completo.
    const cleanBySale = new Map<string, string>();
    for (const sale of financeiro.sales) {
      const clean = extractPersonName(sale.patientName || "");
      if (clean) cleanBySale.set(sale.id, clean);
    }
    const canonicalMap = clusterPersonNames([...cleanBySale.values()]);
    const existsInCrm = (name: string) =>
      crmState.contacts.some(
        (contact) => personNamesMatch(name, contact.fullName || "") || personNamesMatch(name, contact.preferredName || ""),
      );
    const byName = new Map<string, { name: string; lastDate: string; total: number }>();
    for (const sale of financeiro.sales) {
      const clean = cleanBySale.get(sale.id);
      if (!clean) continue;
      if (sale.crmContactRef && contactIds.has(sale.crmContactRef)) continue;
      const canonical = canonicalMap.get(clean) ?? clean;
      if (existsInCrm(canonical)) continue;
      const existing = byName.get(canonical.toLowerCase());
      const total = (existing?.total ?? 0) + saleTotal360(sale);
      byName.set(canonical.toLowerCase(), {
        name: canonical,
        lastDate: existing && existing.lastDate > sale.saleDate ? existing.lastDate : sale.saleDate,
        total,
      });
    }
    return [...byName.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [financeiro.sales, crmState.contacts]);

  function createAll() {
    persistCrm((current) => {
      let next = current;
      let created = 0;
      for (const patient of missing) {
        const result = findOrCreateCrmContact(
          next,
          {
            fullName: patient.name,
            contactType: "PATIENT",
            lifecycleStage: "ACTIVE_PATIENT",
            sourceChannel: "Comanda / Lançar Dia",
            ownerUserId: pessoa?.id ?? "sistema",
          },
          pessoa?.id ?? "sistema",
        );
        next = result.state;
        if (result.created) created += 1;
      }
      setReconcileFeedback(`${created} paciente(s) criados no CRM; os demais já existiam e foram vinculados por nome.`);
      return next;
    });
  }

  if (!missing.length) {
    return (
      <AvisoDaTela tom="ok">
        Comandas × Kanban conferidos: todo paciente que passou na comanda existe no CRM.
        {reconcileFeedback ? ` ${reconcileFeedback}` : ""}
      </AvisoDaTela>
    );
  }

  return (
    <BlocoFolha as="section" aria-labelledby="i360-fora-do-kanban" respiro className="grid gap-4">
      <TituloDeBloco
        id="i360-fora-do-kanban"
        titulo="Pacientes da comanda fora do Kanban"
        soma={<span className="text-atencao">{missing.length}</span>}
        ajuda="Passaram no Lançar Dia mas não existem no CRM — por isso o Comercial não os enxerga. O app já limpou as anotações da recepção (NF, datas, obs) e juntou variações do mesmo nome. Um clique cria todos como pacientes ativos, sem duplicar cadastro."
      />
      <ul className="flex flex-wrap gap-2">
        {missing.slice(0, 12).map((patient) => (
          <li key={patient.name} className="inline-flex h-7 items-center rounded-controle bg-saber px-2.5 text-[13px] font-semibold leading-5 text-tinta">
            {patient.name} <span className="ml-1 font-medium tabular-nums text-tinta-2">· {patient.lastDate.split("-").reverse().slice(0, 2).join("/")}</span>
          </li>
        ))}
        {missing.length > 12 ? (
          <li className="inline-flex h-7 items-center rounded-controle bg-saber px-2.5 text-[13px] font-bold tabular-nums text-tinta-2">+{missing.length - 12}</li>
        ) : null}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="button" variante="primario" onClick={createAll}>
          Criar todos no CRM
        </Botao>
        {reconcileFeedback ? <p className="text-sm font-semibold text-tinta">{reconcileFeedback}</p> : null}
      </div>
    </BlocoFolha>
  );
}

// ---------------------------------------------------------------- visão geral

type GrupoDoIndicador = "caixa" | "ticket" | "pacientes";

const GRUPOS_DOS_INDICADORES: { id: GrupoDoIndicador; rotulo: string }[] = [
  { id: "caixa", rotulo: "Caixa e meta" },
  { id: "ticket", rotulo: "Ticket médio" },
  { id: "pacientes", rotulo: "Pacientes e dados" },
];

type Periodo360 = "dia" | "semana" | "mes" | "ano";

export function Inteligencia360DashboardPage() {
  const { state, persist, syncMode, isSyncing, syncError } = useInteligenciaState();
  const { pessoa, session, isPreview } = useAuth();
  const hoje = todayISO();
  const financeiro = useFinanceiro(Number(hoje.slice(0, 4)));
  const [copyFeedback, setCopyFeedback] = useState("");
  const metasConfig = useMemo<MetasConfig>(
    () => ({ ...defaultMetasConfig, ...readLocalValue<Partial<MetasConfig>>("app-bratan-fin-metas-config-v1", {}) }),
    [],
  );
  const [period, setPeriod] = useState<Periodo360>("semana");
  const metasBoard = useMemo(
    () => buildMetasBoard(financeiro.sales, metasConfig, hoje.slice(0, 7), crediarioProfitOfMonth(financeiro.crediarioProfits, hoje.slice(0, 7))),
    [financeiro.sales, metasConfig, hoje, financeiro.crediarioProfits],
  );
  // Faixa de datas do filtro de período — aplicada ao que é temporal
  // (comandas e vendido); indicadores de estado (recebíveis, NPS) não mudam.
  const periodRange = useMemo(() => {
    const today = new Date(`${hoje}T12:00:00`);
    const toISO = (date: Date) => date.toISOString().slice(0, 10);
    if (period === "dia") return { start: hoje, end: hoje, label: "hoje" };
    if (period === "mes") return { start: `${hoje.slice(0, 7)}-01`, end: hoje, label: "no mês" };
    if (period === "ano") return { start: `${hoje.slice(0, 4)}-01-01`, end: hoje, label: "no ano" };
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return { start: toISO(monday), end: hoje, label: "na semana" };
  }, [period, hoje]);
  const periodRevenue = useMemo(
    () =>
      financeiro.sales
        .filter((sale) => sale.saleDate >= periodRange.start && sale.saleDate <= periodRange.end)
        .reduce((sum, sale) => sum + saleTotal360(sale), 0),
    [financeiro.sales, periodRange],
  );
  const periodSold = useMemo(
    () =>
      state.prescriptions
        .filter((record) => {
          const date = (record.consultationDate || record.createdAt || "").slice(0, 10);
          return date >= periodRange.start && date <= periodRange.end;
        })
        .reduce((sum, record) => sum + record.soldAmount, 0),
    [state.prescriptions, periodRange],
  );
  // Ticket médio DERIVADO das comandas (Lançar Dia). O SINAL não entra na conta
  // (regra do Lucas, 04/08/2026): é adiantamento do tratamento, que será lançado
  // por inteiro depois — e comanda só de sinal afundava a média. A regra mora em
  // buildTicketMedio (financeiroData), a mesma usada na Gestão Mensal.
  const ticketDerived = useMemo(
    () => buildTicketMedio(financeiro.sales, periodRange.start, periodRange.end),
    [financeiro.sales, periodRange],
  );
  // NPS do TOTEM (04/08/2026): o paciente dá a nota na recepção e ela cai aqui,
  // sem ninguém digitar. Respostas anônimas — nota e comentário, sem nome (LGPD).
  const npsQuery = useQuery({
    queryKey: ["nps-totem"],
    queryFn: listRemoteNpsRespostas,
    enabled: Boolean(pessoa && session && !isPreview),
    staleTime: 60_000,
  });
  const npsTotem = useMemo(
    () => buildNpsResumo(npsQuery.data ?? [], periodRange.start, periodRange.end),
    [npsQuery.data, periodRange],
  );
  const snapshot = useMemo(() => buildDashboard360Snapshot(state), [state]);
  // Visão em gráficos (28/07): as mesmas fontes, em imagem. Nada digitado aqui.
  const chartMatrix = useMemo(
    () => buildP12Matrix(financeiro.sales, financeiro.expenses, financeiro.categories, Number(hoje.slice(0, 4)), financeiro.savingsMoves, financeiro.crediarioProfits),
    [financeiro.sales, financeiro.expenses, financeiro.categories, hoje],
  );
  const chartSerie = useMemo(() => buildMonthlyResultSeries(chartMatrix), [chartMatrix]);
  const chartHeat = useMemo(() => buildCalendarHeat(financeiro.sales, hoje.slice(0, 7)), [financeiro.sales, hoje]);
  const chartWeekday = useMemo(
    () => buildWeekdayStrength(financeiro.sales, { from: periodRange.start, to: periodRange.end }),
    [financeiro.sales, periodRange],
  );
  const chartPagamentos = useMemo(
    () => buildPaymentDonut(financeiro.sales, { from: periodRange.start, to: periodRange.end }),
    [financeiro.sales, periodRange],
  );
  const chartFunil = useMemo(() => buildPrescriptionFunnel(state.prescriptions), [state.prescriptions]);
  const insights = useMemo(() => generateActionRecommendations(state), [state]);
  const quality = useMemo(() => buildDataQuality(state), [state]);
  const [createdAction, setCreatedAction] = useState<string | null>(null);

  function createActionFromInsight(insight: ReturnType<typeof generateActionRecommendations>[number]) {
    const action = actionFromInsight(insight);
    persist((current) => ({ ...current, actions: [action, ...current.actions] }));
    setCreatedAction(action.title);
  }

  const cards: {
    grupo: GrupoDoIndicador;
    label: string;
    value: string;
    detail: string;
    href: string;
    tone?: "gold" | "critical";
    periodic?: boolean;
  }[] = [
    {
      grupo: "caixa",
      label: `Faturamento ${periodRange.label} (comandas)`,
      value: money360(periodRevenue),
      detail: "Fonte: Lançar Dia — dado oficial do caixa",
      href: "/financeiro/metas",
      tone: "gold" as const,
      periodic: true,
    },
    {
      grupo: "caixa",
      label: "Meta do mês (CEO)",
      // 13/10/2026: só o número vai em Fraunces; a frase ("da super meta") vai no detalhe, em Manrope.
      value: `${Math.round(metasBoard.superGoalPercent * 100)}%`,
      detail: `da super meta · falta ${money360(metasBoard.missingToSuper)} para ${money360(metasConfig.goalSuperRevenue)}`,
      href: "/financeiro/metas",
    },
    {
      grupo: "caixa",
      label: `Vendido ${periodRange.label} (360)`,
      value: money360(periodSold),
      detail: "Fonte: Comercial e Prescrições",
      href: moduleRoutes360.commercial,
      periodic: true,
    },
    {
      grupo: "caixa",
      label: "Receita recebida",
      value: money360(snapshot.totalReceivedAmount),
      detail: "Fonte: Recebíveis / comprovantes / caixa",
      href: moduleRoutes360.receivables,
    },
    {
      grupo: "caixa",
      label: "Recebíveis em aberto",
      value: money360(snapshot.totalOpenReceivables),
      detail: "Fonte: Recebíveis — vendido não é caixa",
      href: moduleRoutes360.receivables,
    },
    {
      grupo: "caixa",
      label: "Recebíveis vencidos",
      value: money360(snapshot.totalOverdueReceivables),
      detail: "Fonte: Recebíveis — risco direto de caixa",
      href: moduleRoutes360.receivables,
      tone: snapshot.totalOverdueReceivables > 0 ? "critical" as const : undefined,
    },
    {
      grupo: "ticket",
      label: `Ticket médio geral ${periodRange.label}`,
      value: money360(ticketDerived.geral),
      detail: `Fonte: comandas (Lançar Dia) · ${ticketDerived.count} comanda(s) com venda${
        ticketDerived.ignoradasSoSinal ? ` · ${ticketDerived.ignoradasSoSinal} só de sinal fora` : ""
      }${ticketDerived.ignoradasMedicacaoAvulsa ? ` · ${ticketDerived.ignoradasMedicacaoAvulsa} só medicação avulsa fora` : ""} · só plano, tratamento e consulta`,
      href: "/financeiro/lancar-dia",
      periodic: true,
    },
    {
      grupo: "ticket",
      label: "Ticket novos",
      value: money360(ticketDerived.novos),
      detail: "Fonte: comandas — 1ª comanda do paciente (só plano, tratamento e consulta)",
      href: "/financeiro/lancar-dia",
      periodic: true,
    },
    {
      grupo: "ticket",
      label: "Ticket recorrentes",
      value: money360(ticketDerived.recorrentes),
      detail: "Fonte: comandas — paciente que já comprou (só plano, tratamento e consulta)",
      href: "/financeiro/lancar-dia",
      periodic: true,
    },
    {
      grupo: "pacientes",
      label: "Conversão prescrição",
      value: percent360(snapshot.prescriptionConversionRate),
      detail: "Fonte: Comercial · faixa saudável 70–80%",
      href: moduleRoutes360.commercial,
      tone: snapshot.prescriptionConversionRate < state.settings.prescriptionConversionMin ? "critical" as const : undefined,
    },
    {
      grupo: "pacientes",
      label: "Retenção",
      value: percent360(snapshot.retentionRate),
      detail: "Fonte: coorte mensal",
      href: moduleRoutes360.retention,
    },
    {
      grupo: "pacientes",
      label: "Em resgate",
      value: `${snapshot.rescueOpenCount}`,
      detail: "Fonte: CRM — pacientes antes de churn",
      href: moduleRoutes360.retention,
      tone: snapshot.rescueOpenCount ? "gold" as const : undefined,
    },
    {
      grupo: "pacientes",
      label: `NPS ${periodRange.label}`,
      value: npsTotem.total
        ? `${npsTotem.score > 0 ? "+" : ""}${npsTotem.score}`
        : snapshot.npsAverage
          ? snapshot.npsAverage.toFixed(1).replace(".", ",")
          : "—",
      detail: npsTotem.total
        ? `Totem · nota média ${npsTotem.media.toFixed(1).replace(".", ",")} · ${npsTotem.promotores}P / ${npsTotem.neutros}N / ${npsTotem.detratores}D`
        : snapshot.npsAverage
          ? "Fonte: totem da recepção (ainda sem resposta) · manual em Experiência"
          : "sem dado ainda · Fonte: totem da recepção (ainda sem resposta) · manual em Experiência",
      href: moduleRoutes360.experience,
      periodic: true,
      tone: npsTotem.detratores > 0 ? ("gold" as const) : undefined,
    },
    {
      grupo: "pacientes",
      label: "Linkagem ativa",
      value: `${snapshot.dataCompletenessScore}%`,
      detail: "Fontes automáticas com dado fluindo",
      href: moduleRoutes360.settings,
      tone: snapshot.dataCompletenessScore < 75 ? "gold" as const : undefined,
    },
  ];

  // O tom antigo do cartão vira o tom do número: "critical" é erro; "gold" era
  // destaque — no Faturamento só destacava a fonte oficial (fica neutro), nos
  // outros pedia atenção (resgates abertos, detratores, linkagem baixa).
  const tomDoCartao = (card: (typeof cards)[number]): TomDoIndicador =>
    card.tone === "critical" ? "erro" : card.tone === "gold" && card.grupo !== "caixa" ? "atencao" : "neutro";

  const insightsQuePedemAcao = insights.filter((insight) => insight.severity === "critical" || insight.severity === "attention").length;

  return (
    <Moldura360
      titulo="Visão geral"
      frase={
        <>
          <strong className="tabular-nums">{money360(periodRevenue)}</strong> nas comandas {periodRange.label}
          {metasBoard.missingToSuper > 0 ? (
            <>
              ; faltam <strong className="tabular-nums">{money360(metasBoard.missingToSuper)}</strong> para a super meta do mês.{" "}
            </>
          ) : (
            <>; a super meta do mês já foi batida. </>
          )}
          {insightsQuePedemAcao ? (
            <span className="alerta">
              {insightsQuePedemAcao === 1 ? "Um alerta pede ação." : `${insightsQuePedemAcao} alertas pedem ação.`}
            </span>
          ) : (
            "Sem alertas críticos agora."
          )}{" "}
          Aqui só se lê: cada número leva à tela de onde ele vem.
        </>
      }
      acoes={
        <>
          <EstadoDaSincronia syncError={syncError} isSyncing={isSyncing} syncMode={syncMode} />
          <Botao
            type="button"
            variante="secundario"
            icone={<Copy className="h-4 w-4" aria-hidden="true" />}
            onClick={() => copyText(buildMetaDoDiaMessage(metasBoard, metasConfig, hoje), setCopyFeedback)}
          >
            Copiar meta do dia
          </Botao>
          <Botao
            type="button"
            variante="secundario"
            icone={<FileText className="h-4 w-4" aria-hidden="true" />}
            onClick={() => {
              const brief = generateWeeklyKickoffBrief(state);
              copyText(brief, () => undefined);
              const ok = exportBriefPdf("Resumo Executivo 360", brief, pessoa?.nome);
              setCopyFeedback(ok ? "Resumo copiado e aberto para salvar em PDF." : "Resumo copiado. Libere pop-ups para gerar o PDF.");
            }}
          >
            Gerar resumo
          </Botao>
        </>
      }
    >
      {copyFeedback ? <AvisoDaTela tom="info">{copyFeedback}</AvisoDaTela> : null}
      {createdAction ? (
        <AvisoDaTela tom="ok">
          Ação criada: {createdAction}
        </AvisoDaTela>
      ) : null}

      {/* O período: muda o que é temporal (comandas, vendido, ticket, NPS do totem). */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Leituras<Periodo360>
          rotulo="Período"
          valor={period}
          onMudar={setPeriod}
          opcoes={[
            { valor: "dia", rotulo: "Hoje" },
            { valor: "semana", rotulo: "Esta semana" },
            { valor: "mes", rotulo: "Este mês" },
            { valor: "ano", rotulo: "Este ano" },
          ]}
        />
        <p className="min-w-0 flex-1 basis-80 text-[13px] font-medium leading-5 text-tinta-2">
          O período muda o faturamento das comandas e o vendido do Comercial. Recebíveis, resgates e NPS são retratos do
          momento — não mudam com o filtro.
        </p>
      </div>

      {GRUPOS_DOS_INDICADORES.map((grupo) => (
        <section key={grupo.id} aria-labelledby={`i360-grupo-${grupo.id}`} className="grid gap-3">
          <h2 id={`i360-grupo-${grupo.id}`} className={RUBRICA_RESULTADOS}>
            {grupo.rotulo}
          </h2>
          <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-md:gap-3", grupo.id === "pacientes" && "2xl:grid-cols-5")}>
            {cards
              .filter((card) => card.grupo === grupo.id)
              .map((card) => (
                <Indicador
                  key={card.label}
                  rotulo={card.label}
                  valor={card.value}
                  frase={card.detail}
                  tom={tomDoCartao(card)}
                  para={card.href}
                  marca={
                    card.periodic ? (
                      <MarcaDoPeriodo>
                        <CalendarRange className="h-3 w-3" aria-hidden="true" />
                        no período
                      </MarcaDoPeriodo>
                    ) : undefined
                  }
                />
              ))}
          </div>
        </section>
      ))}

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] max-md:gap-6">
        {/* DECIDIR — os insights da semana viram ação com um clique (folha). */}
        <BlocoFolha as="section" aria-labelledby="i360-insights" className="overflow-hidden">
          <TituloDeBloco
            id="i360-insights"
            className="px-6 pb-3 pt-5 max-md:px-4 max-md:pt-4"
            titulo="Insights da semana"
            soma={insights.length ? `${insights.length}` : undefined}
          />
          {insights.length ? (
            <ul>
              {insights.map((insight) => (
                <InsightDaSemana key={insight.id} insight={insight} onCreateAction={() => createActionFromInsight(insight)} />
              ))}
            </ul>
          ) : (
            <div className="border-t border-fio px-6 py-5 max-md:px-4">
              <p className="text-sm font-bold leading-5 text-tinta">Sem alertas críticos agora.</p>
              <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">Continue preenchendo os módulos de origem para manter a leitura confiável.</p>
            </div>
          )}
        </BlocoFolha>

        {/* SABER — a qualidade dos dados: o que enche sozinho e o que é manual. */}
        <BlocoSaber as="aside" aria-labelledby="i360-qualidade" className="grid content-start gap-4">
          <h2 id="i360-qualidade" className={RUBRICA_RESULTADOS}>
            Qualidade dos dados
          </h2>
          <div className="grid gap-1">
            <p className="text-sm font-semibold leading-5 text-tinta">Linkagem ativa</p>
            <NumeroDoIndicador tamanho="grande" tom={snapshot.dataCompletenessScore < 75 ? "atencao" : undefined}>
              {snapshot.dataCompletenessScore}%
            </NumeroDoIndicador>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">
              Mede as fontes que enchem sozinhas (CRM/Financeiro). Registros manuais são opcionais e não entram na conta.
            </p>
          </div>

          <p className={cn(RUBRICA_RESULTADOS, "pt-1")}>Fontes automáticas (linkadas)</p>
          <ul className="border-t border-fio-2">
            {quality.filter((item) => item.kind === "derived").map((item) => (
              <FonteDaQualidade key={item.module} item={item} rotulo={item.status === "complete" ? "Fluindo" : "Aguardando"} tom={item.status === "complete" ? "ok" : "espera"} />
            ))}
          </ul>

          <p className={cn(RUBRICA_RESULTADOS, "pt-1")}>Registros manuais (opcionais)</p>
          <ul className="border-t border-fio-2">
            {quality.filter((item) => item.kind === "manual").map((item) => (
              <FonteDaQualidade key={item.module} item={item} rotulo={item.status === "complete" ? "Preenchido" : "Opcional"} tom={item.status === "complete" ? "ok" : "neutro"} />
            ))}
          </ul>
        </BlocoSaber>
      </div>

      {/* Visão em gráficos: os mesmos números, palpáveis. Cada bloco leva à fonte. */}
      <section aria-label="Gráficos" className="grid gap-4">
        <BlocoGrafico titulo={`Faturamento × Custos × Lucro — ${hoje.slice(0, 4)}`} link={{ to: "/financeiro/relatorios", rotulo: "Relatórios completos" }}>
          <BarsWithLine
            labels={chartSerie.labels}
            bars={[
              { name: "Faturamento", values: chartSerie.faturamento, color: chartColors.entrada },
              { name: "Custos", values: chartSerie.custos, color: chartColors.saida },
            ]}
            line={{ name: "Lucro", values: chartSerie.lucro, color: chartColors.resultado }}
            upTo={chartSerie.lastActiveMonth}
          />
        </BlocoGrafico>

        <div className="grid gap-4 lg:grid-cols-2">
          <BlocoGrafico titulo="Mapa de calor do mês" link={{ to: "/financeiro/lancar-dia", rotulo: "Lançar Dia" }}>
            <CalendarHeatGrid heat={chartHeat} />
          </BlocoGrafico>

          <BlocoGrafico titulo="Funil de prescrições" link={{ to: moduleRoutes360.commercial, rotulo: "Comercial" }}>
            <RankBars
              points={chartFunil}
              color={chartColors.resultado}
              formatValue={(value) => `${value} paciente${value === 1 ? "" : "s"}`}
              emptyMessage="Nenhuma prescrição registrada ainda — elas nascem no Comercial."
            />
          </BlocoGrafico>

          <BlocoGrafico titulo={`Como o dinheiro entra ${periodRange.label}`} link={{ to: "/financeiro/lancar-dia", rotulo: "Lançar Dia" }}>
            <Donut slices={chartPagamentos} centerLabel={periodRange.label} emptyMessage="Nenhum pagamento no período." />
          </BlocoGrafico>

          <BlocoGrafico titulo={`Força dos dias da semana ${periodRange.label}`} link={{ to: "/financeiro/relatorios", rotulo: "Relatórios" }}>
            <RankBars points={chartWeekday} color={chartColors.entrada} emptyMessage="Sem comanda no período ainda." />
          </BlocoGrafico>
        </div>
      </section>
    </Moldura360>
  );
}

/** Uma fonte da qualidade dos dados: o módulo, o recado e o impacto, com o selo da situação. */
function FonteDaQualidade({ item, rotulo, tom }: { item: ReturnType<typeof buildDataQuality>[number]; rotulo: string; tom: TomDaSituacao }) {
  return (
    <li className="border-b border-fio">
      <Link
        to={item.sourceHref}
        className="group -mx-2 flex items-start justify-between gap-3 rounded-controle px-2 py-3 transition-colors duration-150 ease-papel hover:bg-fio/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold leading-5 text-tinta group-hover:underline">{item.module}</span>
          <span className="mt-0.5 block text-[13px] font-medium leading-5 text-tinta-2">{item.message}</span>
          <span className="mt-0.5 block text-xs font-medium leading-4 text-tinta-2">{item.impact}</span>
        </span>
        <SeloDaSituacao tom={tom} className="shrink-0">
          {rotulo}
        </SeloDaSituacao>
      </Link>
    </li>
  );
}

/** Um gráfico em bloco "saber": título, o link para a fonte e o desenho. */
function BlocoGrafico({ titulo, link, children }: { titulo: string; link: { to: string; rotulo: string }; children: ReactNode }) {
  return (
    <BlocoSaber as="section" className="grid min-w-0 content-start gap-4">
      <TituloDeBloco titulo={titulo} acoes={<LinkSeta to={link.to}>{link.rotulo}</LinkSeta>} />
      <div className="min-w-0">{children}</div>
    </BlocoSaber>
  );
}

// ---------------------------------------------------------------- tabelas das seções

// Mensagem de tabela vazia para os módulos DERIVADOS (não se preenche à mão aqui).
const DERIVED_360_EMPTY = "Estes dados vêm do CRM/Financeiro e aparecem sozinhos conforme o time trabalha (Kanban, comandas, cadências) — nada a preencher aqui.";

function DataTable({
  headers,
  rows,
  emptyMessage,
  onDeleteRow,
  deleteLabel = "linha",
  titulo,
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyMessage?: ReactNode;
  // Quando informado, adiciona uma coluna "Ações" com botão de remover por linha.
  // O índice corresponde à ordem em que as linhas foram passadas.
  onDeleteRow?: (index: number) => void;
  deleteLabel?: string;
  /** Nome da tabela para o leitor de tela. */
  titulo?: string;
}) {
  const showActions = Boolean(onDeleteRow);
  const totalCols = headers.length + (showActions ? 1 : 0);
  // Coluna em que toda célula preenchida é número (R$, %, contagem) vai para a direita.
  const colunaNumerica = headers.map((_, coluna) => {
    const celulas = rows.map((row) => row[coluna]).filter((celula) => celula !== "" && celula !== null && celula !== undefined && celula !== "—");
    return celulas.length > 0 && celulas.every(celulaEhNumero);
  });
  const vazio = emptyMessage ?? "Nada registrado ainda. Preencha este módulo para alimentar o Dashboard 360.";
  return (
    <BlocoFolha as="section" aria-label={titulo} className="overflow-hidden">
      {titulo ? (
        <TituloDeBloco
          titulo={titulo}
          soma={rows.length ? `${rows.length} ${rows.length === 1 ? "linha" : "linhas"}` : undefined}
          className="border-b border-fio-2 px-6 py-4 max-md:px-4"
        />
      ) : null}
      {/* Sem linhas, só o recado (a tabela larga cortava a frase no celular). */}
      {rows.length ? null : <p className="px-6 py-5 text-sm font-medium leading-5 text-tinta-2 max-md:px-4">{vazio}</p>}
      <div className={cn("mobile-scrollbar-none overflow-x-auto", !rows.length && "hidden")}>
        <table aria-label={titulo} className={tabela.tabela} style={{ minWidth: Math.max(totalCols * 150, 640) }}>
          <thead>
            <tr>
              {headers.map((header, coluna) => (
                <th key={header} className={cn(colunaNumerica[coluna] ? tabela.thNum : tabela.th, "first:pl-6 last:pr-6 max-md:first:pl-4 max-md:last:pr-4")}>
                  {header}
                </th>
              ))}
              {showActions ? <th className={cn(tabela.thNum, "pr-6 max-md:pr-4")}>Ações</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={tabela.linha}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cn(colunaNumerica[cellIndex] ? tabela.tdNum : tabela.td, "align-top first:pl-6 last:pr-6 max-md:first:pl-4 max-md:last:pr-4", cellIndex === 0 && "font-semibold")}>
                      {cell}
                    </td>
                  ))}
                  {showActions ? (
                    <td className={cn(tabela.tdNum, "align-top pr-6 max-md:pr-4")}>
                      <Botao
                        type="button"
                        variante="perigo"
                        tamanho="pq"
                        icone={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        onClick={async () => {
                          if (await confirmar(`Remover esta ${deleteLabel}?`, { corpo: "Esta ação não pode ser desfeita.", destrutivo: true, confirmar: "Remover" })) {
                            onDeleteRow?.(rowIndex);
                          }
                        }}
                      >
                        Remover
                      </Botao>
                    </td>
                  ) : null}
                </tr>
              ))
            ) : null}
          </tbody>
        </table>
      </div>
    </BlocoFolha>
  );
}

function MiniActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Botao type="button" variante="secundario" tamanho="pq" disabled={disabled} onClick={onClick}>
      {children}
    </Botao>
  );
}

function ActionStatusControls({
  record,
  persist,
}: {
  record: ActionItem360;
  persist: ReturnType<typeof useInteligenciaState>["persist"];
}) {
  function updateAction(status: ActionStatus360) {
    persist((current) => ({
      ...current,
      actions: current.actions.map((item) => (item.id === record.id ? updateActionStatus360(item, status) : item)),
    }));
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <MiniActionButton disabled={record.status === "IN_PROGRESS"} onClick={() => updateAction("IN_PROGRESS")}>
        Iniciar
      </MiniActionButton>
      <MiniActionButton disabled={record.status === "DONE"} onClick={() => updateAction("DONE")}>
        Concluir
      </MiniActionButton>
      <MiniActionButton disabled={record.status === "CANCELED"} onClick={() => updateAction("CANCELED")}>
        Cancelar
      </MiniActionButton>
    </div>
  );
}

function ReceivableStatusControls({
  record,
  persist,
}: {
  record: Receivable;
  persist: ReturnType<typeof useInteligenciaState>["persist"];
}) {
  function updateReceivable(status: ReceivableStatus360) {
    persist((current) => ({
      ...current,
      receivables: current.receivables.map((item) => (item.id === record.id ? updateReceivableStatus360(item, status) : item)),
    }));
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <MiniActionButton disabled={record.status === "PAID"} onClick={() => updateReceivable("PAID")}>
        Pago
      </MiniActionButton>
      <MiniActionButton disabled={record.status === "OVERDUE"} onClick={() => updateReceivable("OVERDUE")}>
        Vencido
      </MiniActionButton>
      <MiniActionButton disabled={record.status === "OPEN"} onClick={() => updateReceivable("OPEN")}>
        Aberto
      </MiniActionButton>
    </div>
  );
}

// As situações das tabelas, em palavra + cor (a cor nunca fala sozinha).
const TOM_DO_TICKET: Record<ReturnType<typeof ticketStatus>, TomDaSituacao> = {
  ABOVE_TARGET: "ok",
  ON_TARGET: "ok",
  BELOW_TARGET: "atencao",
  CRITICAL: "erro",
};
const TOM_DA_ACAO: Record<ActionStatus360, TomDaSituacao> = {
  OPEN: "espera",
  WAITING: "espera",
  IN_PROGRESS: "andando",
  DONE: "ok",
  CANCELED: "neutro",
};
const TOM_DO_RECEBIVEL: Record<ReceivableStatus360, TomDaSituacao> = {
  OPEN: "espera",
  PARTIALLY_PAID: "andando",
  PAID: "ok",
  OVERDUE: "atencao",
  CANCELED: "neutro",
};

function TicketModule({ state, persist }: { state: Inteligencia360State; persist: ReturnType<typeof useInteligenciaState>["persist"] }) {
  const [form, setForm] = useState({
    weekStartDate: todayISO(),
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
    persist((current) => {
      const ticket = {
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
      };
      const status = ticketStatus(ticket, current.settings.ticketDropCriticalPercentage);
      const action =
        status === "CRITICAL" || form.actionPlan.trim()
          ? {
              id: createId360("act"),
              sourceModule: "TICKET_AVERAGE" as const,
              sourceId: ticket.id,
              title: `Corrigir ticket médio - ${ticket.doctorName}`,
              description: form.actionPlan || form.mainHypothesis || "Ticket médio exige análise e ação corretiva.",
              priority: status === "CRITICAL" ? "CRITICAL" as const : "HIGH" as const,
              ownerUserId: form.responsibleUserId,
              dueDate: form.dueDate,
              status: "OPEN" as const,
              expectedImpact: "CASH" as const,
              createdAt: now,
              updatedAt: now,
            }
          : null;

      return {
        ...current,
        weeklyTickets: [ticket, ...current.weeklyTickets],
        actions: action ? [action, ...current.actions] : current.actions,
      };
    });
  }

  return (
    <>
      <ManualEntry title="Registrar ticket da semana (manual — opcional; o ticket do painel já vem das comandas)">
        <form className={GRADE_DO_FORM} onSubmit={submit}>
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
          <div className={LINHA_DO_ENVIAR}>
            <Botao type="submit" variante="primario" icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
              Adicionar ticket e ação se necessário
            </Botao>
          </div>
        </form>
      </ManualEntry>
      <DataTable
        titulo="Tickets semanais"
        headers={["Semana", "Médico", "Tipo", "Ticket vendido", "Recebido", "Variação", "Status"]}
        deleteLabel="semana"
        onDeleteRow={(index) => {
          const target = state.weeklyTickets[index];
          if (!target) return;
          persist((current) => ({ ...current, weeklyTickets: current.weeklyTickets.filter((row) => row.id !== target.id) }));
        }}
        rows={state.weeklyTickets.map((record) => {
          const status = ticketStatus(record, state.settings.ticketDropCriticalPercentage);
          return [
            `${record.weekStartDate} a ${record.weekEndDate}`,
            record.doctorName,
            record.patientType === "NEW" ? "Novo" : "Recorrente",
            money360(averageTicketSold(record)),
            money360(averageTicketReceived(record)),
            percent360(ticketVariationPercentage(record)),
            <SeloDaSituacao key={record.id} tom={TOM_DO_TICKET[status]}>
              {ticketStatusLabels[status]}
            </SeloDaSituacao>,
          ];
        })}
      />
    </>
  );
}

// Formulários manuais recolhidos: os dados principais chegam sozinhos de outros módulos.
function ManualEntry({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-bloco border border-dashed border-fio-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-bloco px-5 py-3 text-left text-sm font-bold leading-5 text-tinta transition-colors duration-150 ease-papel hover:bg-saber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco max-md:px-4"
      >
        <span className="flex items-center gap-2">
          <Plus className={cn("h-4 w-4 shrink-0 text-tinta-2 transition-transform duration-150", open && "rotate-45")} aria-hidden="true" />
          {title}
        </span>
        <span className="shrink-0 text-[13px] font-medium text-tinta-2">{open ? "fechar" : "abrir"}</span>
      </button>
      {open ? <div className="grid gap-4 border-t border-dashed border-fio-2 p-5 max-md:p-4">{children}</div> : null}
    </div>
  );
}

/** O título de um formulário dentro do bloco (16/700). */
function TituloDoForm({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-bold leading-6 text-tinta">{children}</h3>;
}

type ModuleGuide = {
  auto: string;
  doHere: string;
  links: { label: string; href: string }[];
};

// Guia de cada módulo em linguagem simples: o que chega sozinho, o que fazer aqui e onde está a origem.
const moduleGuides: Partial<Record<ModuleSlug, ModuleGuide>> = {
  "ticket-medio": {
    auto: "Este é um registro semanal da gestão (kickoff): ainda não vem automático.",
    doHere: "Uma vez por semana, registre o ticket do Dr. Daniel (novo × recorrente) e a hipótese se caiu.",
    links: [{ label: "P12 ao vivo", href: "/financeiro/p12" }],
  },
  precificacao: {
    auto: "Tabela de referência: preço, custo e margem de cada plano/procedimento.",
    doHere: "Mantenha os preços atualizados — é a trava contra desconto que come margem.",
    links: [],
  },
  comercial: {
    auto: "Chega sozinho: cada movimentação no Kanban (fechou, parcial, não fechou) vira uma linha aqui, com valores e objeção.",
    doHere: "Acompanhe a conversão prescrito × vendido (meta 70–80%). Só lance manualmente o que não passou pelo Kanban.",
    links: [
      { label: "Kanban Comercial", href: "/crm/vendas" },
      { label: "PDCA Dr Daniel", href: "/financeiro/pdca" },
    ],
  },
  "jornada-paciente": {
    auto: "Chega sozinho: fechamento no Kanban cria a jornada do paciente (contrato, agendamentos, próximos passos).",
    doHere: "Confira quem está com contrato pendente ou datas incompletas. Lançamento manual é exceção.",
    links: [{ label: "Kanban Comercial", href: "/crm/vendas" }],
  },
  reguas: {
    auto: "As réguas operam nas Cadências do CRM: os toques (D+1 concierge, enfermeira 14 dias, resgates) viram tarefas automaticamente.",
    doHere: "Aqui fica só o histórico consolidado dos toques. Para agir, use Minhas Tarefas; para inscrever alguém, Cadências.",
    links: [
      { label: "Cadências", href: "/crm/cadencias" },
      { label: "Minhas Tarefas", href: "/crm/minhas-tarefas" },
    ],
  },
  "retencao-resgate": {
    auto: "Os resgates operam no Kanban (coluna Resgate D60) e nas cadências de resgate — as tentativas viram tarefas.",
    doHere: "Registre aqui o resultado das ligações de investigação de churn (Aline) e acompanhe as coortes de retorno.",
    links: [{ label: "Kanban (Resgate D60)", href: "/crm/vendas" }],
  },
  experiencia: {
    auto: "NPS e feedbacks são colhidos com o paciente — este registro é manual mesmo.",
    doHere: "Após checkpoint ou contato do concierge, registre a nota e o comentário. Nota baixa vira ação automática no Dashboard.",
    links: [],
  },
  recebiveis: {
    auto: "Chega sozinho: comprovante pago, lembrete de pagamento e venda parcelada do Kanban viram recebíveis aqui.",
    doHere: "Acompanhe o que está em aberto/vencido. Para cobrar, use Lembretes; para conferir o caixa do dia, o Fechamento.",
    links: [
      { label: "Lembretes", href: "/lembretes-pagamento" },
      { label: "Comprovantes", href: "/comprovantes" },
      { label: "Fechamento do dia", href: "/financeiro/fechamento" },
    ],
  },
  acoes: {
    auto: "Insights críticos do Dashboard viram ação com um clique; aqui também entram as ações criadas à mão.",
    doHere: "Toda ação tem dono, prazo e status. Use os filtros para achar o que é seu e o que está atrasado.",
    links: [{ label: "Dashboard 360", href: "/inteligencia-360" }],
  },
  configuracoes: {
    auto: "Estas metas calibram os alertas do 360: meta mensal → farol de receita; conversão 70–80% → alerta comercial; mensagens por ciclo → antifadiga das réguas.",
    doHere: "Ajuste apenas quando a estratégia mudar — os alertas do Dashboard seguem estes números.",
    links: [{ label: "Dashboard 360", href: "/inteligencia-360" }],
  },
};

// NPS DO TOTEM na aba Experiência (07/08/2026). O paciente responde no totem da
// recepção e cai aqui, sem ninguém digitar — read-only, porque a fonte é o totem.
// Fica junto do formulário manual: os dois convivem, cada um com sua origem.
function NpsTotemCard() {
  const { pessoa, session, isPreview } = useAuth();
  const npsQuery = useQuery({
    queryKey: ["nps-totem"],
    queryFn: listRemoteNpsRespostas,
    enabled: Boolean(pessoa && session && !isPreview),
    staleTime: 60_000,
  });
  const respostas = npsQuery.data ?? [];
  const resumo = useMemo(() => buildNpsResumo(respostas), [respostas]);
  const dataHora = (iso: string) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <BlocoSaber as="section" aria-labelledby="i360-nps-totem" className="grid gap-4">
      <TituloDeBloco
        id="i360-nps-totem"
        titulo={
          <span className="inline-flex flex-wrap items-center gap-2">
            NPS do totem
            <Etiqueta tom="neutro" className="bg-folha">
              automático · anônimo
            </Etiqueta>
            {resumo.detratores > 0 ? <Etiqueta tom="atencao">{resumo.detratores} detrator(es) para tratar</Etiqueta> : null}
          </span>
        }
      />
      {npsQuery.isLoading ? <p className="text-sm font-medium text-tinta-2">Carregando as respostas do totem…</p> : null}
      {!npsQuery.isLoading && !resumo.total ? (
        <p className="text-sm font-medium leading-5 text-tinta-2">
          Nenhuma resposta ainda. Assim que um paciente avaliar no totem da recepção, aparece aqui sozinho.
        </p>
      ) : null}
      {resumo.total ? (
        <>
          <dl className="grid gap-4 border-y border-fio-2 py-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { rotulo: "Score NPS", valor: `${resumo.score > 0 ? "+" : ""}${resumo.score}`, dica: "% promotores − % detratores" },
              { rotulo: "Nota média", valor: resumo.media.toFixed(1).replace(".", ","), dica: `${resumo.total} resposta(s)` },
              { rotulo: "Promotores / Neutros", valor: `${resumo.promotores} / ${resumo.neutros}`, dica: "nota 9-10 e 7-8" },
              { rotulo: "Detratores", valor: String(resumo.detratores), dica: "nota 0-6 — exige contato" },
            ].map((card) => (
              <div key={card.rotulo} className="min-w-0">
                <dt className={RUBRICA_RESULTADOS}>{card.rotulo}</dt>
                <dd className="m-0 mt-2">
                  <NumeroDoIndicador>{card.valor}</NumeroDoIndicador>
                  <span className="mt-1 block text-[13px] font-medium leading-5 text-tinta-2">{card.dica}</span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="mobile-scrollbar-none -mx-6 overflow-x-auto px-6 max-md:-mx-4 max-md:px-4">
            <table className={cn(tabela.tabela, "min-w-[520px]")}>
              <thead>
                <tr>
                  <th className={cn(tabela.thNum, "pl-0")}>Nota</th>
                  <th className={tabela.th}>Faixa</th>
                  <th className={tabela.th}>O que o paciente escreveu</th>
                  <th className={cn(tabela.th, "pr-0")}>Quando</th>
                </tr>
              </thead>
              <tbody>
                {respostas.slice(0, 30).map((resposta) => {
                  const faixa = npsFaixa(resposta.nota);
                  return (
                    <tr key={resposta.id}>
                      <td className={cn(tabela.tdNum, "pl-0 align-top text-lg font-bold")}>{resposta.nota}</td>
                      <td className={cn(tabela.td, "align-top")}>
                        <SeloDaSituacao tom={faixa === "DETRATOR" ? "atencao" : faixa === "PROMOTOR" ? "ok" : "neutro"}>{npsFaixaLabels[faixa]}</SeloDaSituacao>
                      </td>
                      <td className={cn(tabela.td, "align-top")}>{resposta.comentario || <span className="text-tinta-2">—</span>}</td>
                      <td className={cn(tabela.td, "whitespace-nowrap pr-0 align-top tabular-nums text-tinta-2")}>{dataHora(resposta.criadoEm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <p className="text-[13px] font-medium leading-5 text-tinta-2">
        Vem do totem da recepção, sem ninguém digitar. As respostas são anônimas por decisão do Instituto (LGPD): nota e
        comentário, sem nome. O formulário abaixo continua para registrar experiência com paciente identificado.
      </p>
    </BlocoSaber>
  );
}

function SimpleModuleForms({ slug, state, persist }: { slug: ModuleSlug; state: Inteligencia360State; persist: ReturnType<typeof useInteligenciaState>["persist"] }) {
  // "Só vê" nas metas (29/09/2026, auditoria B9): quem está como VER na
  // Inteligência 360 não salva as metas e limites do motor.
  const tela360 = useNivelDaTela("inteligencia360");
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
        <ManualEntry title="Adicionar serviço à tabela de margem">
          <form
            className={GRADE_DO_FORM}
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
            <div className={LINHA_DO_ENVIAR}>
              <Botao type="submit" variante="primario">
                Adicionar preço
              </Botao>
            </div>
          </form>
        </ManualEntry>
        <DataTable
          titulo="Tabela de margem"
          headers={["Serviço", "Preço", "Custo estimado", "Margem", "Preço mínimo", "Alerta"]}
          deleteLabel="linha de preço"
          onDeleteRow={(index) => {
            const target = state.pricing[index];
            if (!target) return;
            persist((current) => ({ ...current, pricing: current.pricing.filter((row) => row.id !== target.id) }));
          }}
          rows={state.pricing.map((item) => {
            const computed = pricingComputed(item);
            return [
              item.serviceName,
              money360(item.bratanPrice),
              money360(computed.totalEstimatedCost),
              percent360(computed.grossMarginPercentage),
              money360(computed.minimumAllowedPrice),
              computed.grossMarginPercentage < 35 ? (
                <SeloDaSituacao key={item.id} tom="atencao">
                  Desconto ameaça margem
                </SeloDaSituacao>
              ) : (
                <SeloDaSituacao key={item.id} tom="ok">
                  Saudável
                </SeloDaSituacao>
              ),
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
        <ComandaKanbanReconciliation />
        <ManualEntry title="Lançar prescrição manualmente (o Kanban já alimenta isto)">
          <TituloDoForm>Registrar prescrição e fechamento</TituloDoForm>
          <form className={GRADE_DO_FORM} onSubmit={(event) => {
            event.preventDefault();
            const now = new Date().toISOString();
            const sold = parseNumber360(form.soldAmount);
            const prescription: PrescriptionSale = {
              id: createId360("rx"), patientReference: form.patientReference || "PAC-SEM-ID", patientType: form.patientType, doctorId: "Dr. Daniel", sellerId: "Comercial", consultationDate: todayPlus(0), prescribedAmount: parseNumber360(form.prescribedAmount), soldAmount: sold, receivedAmount: parseNumber360(form.receivedAmount), closed: sold > 0, fullPlanClosed: form.status === "CLOSED_FULL", partialReason: "", discountPercentage: 0, paymentMethod: "", installments: 0, acquisitionChannel: form.acquisitionChannel, mainObjection: objectionLabels[form.objectionCategory], objectionCategory: form.objectionCategory, nextFollowUpDate: form.nextFollowUpDate, status: form.status, notes: "", createdAt: now, updatedAt: now,
            };
            persist((current) => {
              const prescriptions = [prescription, ...current.prescriptions];
              return {
                ...current,
                prescriptions,
                receivables: mergePrescriptionReceivables(current.receivables, prescriptions),
              };
            });
          }}>
            <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
            <SelectField label="Tipo" value={form.patientType} onChange={(value) => setForm({ ...form, patientType: value })} options={[{ value: "NEW", label: "Novo" }, { value: "RETURNING", label: "Recorrente" }]} />
            <Field label="Valor prescrito" value={form.prescribedAmount} onChange={(value) => setForm({ ...form, prescribedAmount: value })} />
            <Field label="Valor vendido" value={form.soldAmount} onChange={(value) => setForm({ ...form, soldAmount: value })} />
            <Field label="Valor recebido" value={form.receivedAmount} onChange={(value) => setForm({ ...form, receivedAmount: value })} />
            <Field label="Canal" value={form.acquisitionChannel} onChange={(value) => setForm({ ...form, acquisitionChannel: value })} />
            <SelectField label="Objeção" value={form.objectionCategory} onChange={(value) => setForm({ ...form, objectionCategory: value })} options={Object.entries(objectionLabels).map(([value, label]) => ({ value: value as ObjectionCategory360, label }))} />
            <SelectField label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={(Object.keys(prescriptionStatusLabels) as PrescriptionStatus360[]).map((value) => ({ value, label: prescriptionStatusLabels[value] }))} />
            <div className={LINHA_DO_ENVIAR}>
              <Botao type="submit" variante="primario">Adicionar venda e atualizar recebíveis</Botao>
            </div>
          </form>
        </ManualEntry>
        <DataTable titulo="Prescrições" emptyMessage={DERIVED_360_EMPTY} headers={["Paciente", "Prescrito", "Vendido", "Recebido", "Conversão", "Objeção"]} rows={state.prescriptions.map((record) => [record.patientReference, money360(record.prescribedAmount), money360(record.soldAmount), money360(record.receivedAmount), percent360(record.prescribedAmount ? record.soldAmount / record.prescribedAmount * 100 : 0), objectionLabels[record.objectionCategory]])} />
      </>
    );
  }

  if (slug === "jornada-paciente") {
    const [form, setForm] = useState({ patientReference: "", currentStage: "SALES" as JourneyStage360, contractCreated: false, contractSent: false, contractSigned: false, allDatesScheduled: false });
    return (
      <>
        <ManualEntry title="Lançar etapa manualmente (o Kanban já alimenta isto)">
          <TituloDoForm>Registrar etapa da jornada</TituloDoForm>
          <form className={GRADE_DO_FORM} onSubmit={(event) => {
            event.preventDefault();
            const now = new Date().toISOString();
            persist((current) => ({ ...current, journeys: [{ id: createId360("journey"), patientReference: form.patientReference || "PAC-SEM-ID", patientType: "NEW", currentStage: form.currentStage, doctorId: "Dr. Daniel", sellerId: "Comercial", conciergeId: "Concierge", nurseId: "Enfermagem", adminId: "Administrativo", treatmentPlanSummary: "", prescriptionSent: true, treatmentGroupSent: true, pharmacyGroupSent: true, pmiCompleted: true, contractCreated: form.contractCreated, contractSent: form.contractSent, contractSigned: form.contractSigned, firstDoseScheduled: false, firstBioimpedanceScheduled: false, allDatesScheduled: form.allDatesScheduled, nextMedicalReturnDate: "", nextExamDueDate: "", notes: "", createdAt: now, updatedAt: now }, ...current.journeys] }));
          }}>
            <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
            <SelectField label="Etapa atual" value={form.currentStage} onChange={(value) => setForm({ ...form, currentStage: value })} options={Object.entries(stageLabels).map(([value, label]) => ({ value: value as JourneyStage360, label }))} />
            {([
              ["contractCreated", "Contrato criado"],
              ["contractSent", "Contrato enviado"],
              ["contractSigned", "Contrato assinado"],
              ["allDatesScheduled", "Todas as datas agendadas"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex min-h-10 cursor-pointer items-center gap-3 self-end rounded-controle border border-fio-2 bg-folha px-3 py-2 text-sm font-semibold leading-5 text-tinta hover:border-borda-campo">
                <input type="checkbox" className={MARCAR} checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />
                {label}
              </label>
            ))}
            <div className={LINHA_DO_ENVIAR}>
              <Botao type="submit" variante="primario">Adicionar jornada</Botao>
            </div>
          </form>
        </ManualEntry>
        <DataTable titulo="Jornadas" emptyMessage={DERIVED_360_EMPTY} headers={["Paciente", "Etapa", "Contrato", "Datas", "Próximo passo"]} rows={state.journeys.map((record) => [record.patientReference, stageLabels[record.currentStage], record.contractSigned ? "Assinado" : record.contractSent ? "Enviado" : record.contractCreated ? "Criado" : "Pendente", record.allDatesScheduled ? "Agendadas" : "Incompletas", record.contractSigned ? "Concierge / enfermagem" : "Administrativo conferir SuperSign"])} />
      </>
    );
  }

  if (slug === "reguas") {
    const [form, setForm] = useState({ patientReference: "", touchType: "D1_CONCIERGE" as TouchType360, scheduledDate: todayPlus(1), status: "PENDING" as TouchStatus360, manualMessageText: "Olá. Passando para saber como você está e se ficou alguma dúvida." });
    return (
      <>
        <ManualEntry title="Registrar toque manualmente (as cadências do CRM já geram os toques)">
          <TituloDoForm>Adicionar toque da régua</TituloDoForm>
          <form className={GRADE_DO_FORM} onSubmit={(event) => {
            event.preventDefault();
            const now = new Date().toISOString();
            persist((current) => ({ ...current, touchpoints: [{ id: createId360("touch"), patientReference: form.patientReference || "PAC-SEM-ID", journeyId: "", touchType: form.touchType, scheduledDate: form.scheduledDate, sentDate: form.status === "SENT" ? todayPlus(0) : "", responsibleRole: "Equipe", responsibleUserId: "Equipe", status: form.status, channel: "WHATSAPP", messageTemplateId: "", manualMessageText: form.manualMessageText, responseSummary: "", optOut: false, fatigueRisk: false, notes: "", createdAt: now, updatedAt: now }, ...current.touchpoints] }));
          }}>
            <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
            <SelectField label="Tipo de toque" value={form.touchType} onChange={(value) => setForm({ ...form, touchType: value })} options={Object.entries(touchTypeLabels).map(([value, label]) => ({ value: value as TouchType360, label }))} />
            <Field label="Data programada" type="date" value={form.scheduledDate} onChange={(value) => setForm({ ...form, scheduledDate: value })} />
            <SelectField label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={["PENDING", "SENT", "RESPONDED", "PAUSED", "CANCELED", "FAILED"].map((value) => ({ value: value as TouchStatus360, label: value }))} />
            <TextAreaField label="Mensagem para copiar" value={form.manualMessageText} onChange={(value) => setForm({ ...form, manualMessageText: value })} />
            <div className={LINHA_DO_ENVIAR}>
              <Botao type="submit" variante="primario">Adicionar toque</Botao>
              <Botao type="button" variante="secundario" icone={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={() => copyText(form.manualMessageText)}>Copiar mensagem</Botao>
            </div>
          </form>
        </ManualEntry>
        <DataTable titulo="Toques das réguas" emptyMessage={DERIVED_360_EMPTY} headers={["Paciente", "Toque", "Data", "Status", "Mensagem"]} rows={state.touchpoints.map((record) => [record.patientReference, touchTypeLabels[record.touchType], record.scheduledDate, touchStatusLabels[record.status], <Botao key={record.id} type="button" variante="secundario" tamanho="pq" icone={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={() => copyText(record.manualMessageText)}>Copiar</Botao>])} />
      </>
    );
  }

  if (slug === "retencao-resgate") {
    const [form, setForm] = useState({ cohortMonth: new Date().toISOString().slice(0, 7), scheduledReturns: "", attendedReturns: "", missedReturns: "" });
    return (
      <>
        <ManualEntry title="Registrar coorte/churn manualmente">
          <TituloDoForm>Registrar coorte mensal</TituloDoForm>
          <form className={GRADE_DO_FORM} onSubmit={(event) => {
            event.preventDefault();
            const now = new Date().toISOString();
            persist((current) => ({ ...current, retentionCohorts: [{ id: createId360("ret"), cohortMonth: form.cohortMonth, cohortLabel: form.cohortMonth, totalPatients: parseNumber360(form.scheduledReturns), scheduledReturns: parseNumber360(form.scheduledReturns), attendedReturns: parseNumber360(form.attendedReturns), missedReturns: parseNumber360(form.missedReturns), patientType: "MIXED", notes: "", createdAt: now, updatedAt: now }, ...current.retentionCohorts] }));
          }}>
            <Field label="Mês da coorte" type="month" value={form.cohortMonth} onChange={(value) => setForm({ ...form, cohortMonth: value })} />
            <Field label="Retornos agendados" value={form.scheduledReturns} onChange={(value) => setForm({ ...form, scheduledReturns: value })} />
            <Field label="Compareceram" value={form.attendedReturns} onChange={(value) => setForm({ ...form, attendedReturns: value })} />
            <Field label="Não voltaram" value={form.missedReturns} onChange={(value) => setForm({ ...form, missedReturns: value })} />
            <div className={LINHA_DO_ENVIAR}>
              <Botao type="submit" variante="primario">Adicionar coorte</Botao>
            </div>
          </form>
        </ManualEntry>
        <DataTable
          titulo="Coortes de retorno"
          headers={["Coorte", "Agendados", "Compareceram", "Faltaram", "Retenção"]}
          deleteLabel="coorte"
          onDeleteRow={(index) => {
            const target = state.retentionCohorts[index];
            if (!target) return;
            persist((current) => ({ ...current, retentionCohorts: current.retentionCohorts.filter((row) => row.id !== target.id) }));
          }}
          rows={state.retentionCohorts.map((record) => [record.cohortLabel, record.scheduledReturns, record.attendedReturns, record.missedReturns, percent360(record.scheduledReturns ? record.attendedReturns / record.scheduledReturns * 100 : 0)])}
        />
        <DataTable titulo="Pacientes em resgate" emptyMessage={DERIVED_360_EMPTY} headers={["Paciente em resgate", "Tipo", "Tentativas", "Status", "Dono"]} rows={state.rescueWorkflows.map((record) => [record.patientReference, rescueTypeLabels[record.rescueType], `${record.attemptsDone}/${record.attemptsTotal}`, rescueStatusLabels[record.status as RescueStatus360], record.ownerUserId])} />
      </>
    );
  }

  if (slug === "experiencia") {
    const [form, setForm] = useState({ patientReference: "", npsScore: "8", satisfactionScore: "9", feedbackType: "PRAISE" as FeedbackType360, feedbackText: "" });
    return (
      <>
        <NpsTotemCard />
        <BlocoFolha as="section" aria-labelledby="i360-registrar-experiencia" respiro className="grid gap-4">
          <TituloDeBloco id="i360-registrar-experiencia" titulo="Registrar experiência" ajuda="Nota até 6, crítica ou reclamação viram ação corretiva sozinhas." />
          <form className={GRADE_DO_FORM} onSubmit={(event) => {
            event.preventDefault();
            const now = new Date().toISOString();
            const nps = parseNumber360(form.npsScore);
            const actionRequired = nps <= 6 || form.feedbackType === "CRITICISM" || form.feedbackType === "COMPLAINT";
            const experienceId = createId360("exp");
            const actionId = actionRequired ? createId360("act") : "";
            const experience = { id: experienceId, patientReference: form.patientReference || "PAC-SEM-ID", journeyId: "", npsScore: nps, satisfactionScore: parseNumber360(form.satisfactionScore), googleReviewRequested: false, googleReviewDone: false, leadershipContactDone: false, leadershipContactDate: "", feedbackType: form.feedbackType, feedbackText: form.feedbackText, actionRequired, actionPlanId: actionId, status: "OPEN" as const, createdAt: now, updatedAt: now };
            const action: ActionItem360 | null = actionRequired
              ? {
                  id: actionId,
                  sourceModule: "NPS",
                  sourceId: experienceId,
                  title: `Ação corretiva de experiência - ${experience.patientReference}`,
                  description: form.feedbackText || "Paciente exige contato de liderança e correção de experiência.",
                  priority: nps <= 6 || form.feedbackType === "COMPLAINT" ? "CRITICAL" : "HIGH",
                  ownerUserId: "Concierge",
                  dueDate: todayPlus(1),
                  status: "OPEN",
                  expectedImpact: "PATIENT_EXPERIENCE",
                  createdAt: now,
                  updatedAt: now,
                }
              : null;
            persist((current) => ({
              ...current,
              experiences: [experience, ...current.experiences],
              actions: action ? [action, ...current.actions] : current.actions,
            }));
          }}>
            <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
            <Field label="NPS" type="number" value={form.npsScore} onChange={(value) => setForm({ ...form, npsScore: value })} />
            <Field label="Satisfação" type="number" value={form.satisfactionScore} onChange={(value) => setForm({ ...form, satisfactionScore: value })} />
            <SelectField label="Tipo" value={form.feedbackType} onChange={(value) => setForm({ ...form, feedbackType: value })} options={(Object.keys(feedbackTypeLabels) as FeedbackType360[]).map((value) => ({ value, label: feedbackTypeLabels[value] }))} />
            <TextAreaField label="Feedback" value={form.feedbackText} onChange={(value) => setForm({ ...form, feedbackText: value })} />
            <div className={LINHA_DO_ENVIAR}>
              <Botao type="submit" variante="primario">Adicionar experiência e ação se necessário</Botao>
            </div>
          </form>
        </BlocoFolha>
        <DataTable
          titulo="Experiências registradas"
          headers={["Paciente", "NPS", "Satisfação", "Tipo", "Ação obrigatória"]}
          deleteLabel="avaliação"
          onDeleteRow={(index) => {
            const target = state.experiences[index];
            if (!target) return;
            persist((current) => ({ ...current, experiences: current.experiences.filter((row) => row.id !== target.id) }));
          }}
          rows={state.experiences.map((record) => [
            record.patientReference,
            record.npsScore,
            record.satisfactionScore,
            feedbackTypeLabels[record.feedbackType],
            record.actionRequired ? (
              <Etiqueta key={record.id} tom="atencao">
                Sim
              </Etiqueta>
            ) : (
              <span key={record.id} className="text-tinta-2">
                Não
              </span>
            ),
          ])}
        />
      </>
    );
  }

  if (slug === "recebiveis") {
    const [form, setForm] = useState({ patientReference: "", totalAmount: "", receivedAmount: "", dueDate: todayPlus(7), status: "OPEN" as ReceivableStatus360 });
    return (
      <>
        <ManualEntry title="Lançar recebível manualmente (comprovantes, lembretes e Kanban já alimentam)">
          <TituloDoForm>Registrar recebível</TituloDoForm>
          <form className={GRADE_DO_FORM} onSubmit={(event) => {
            event.preventDefault();
            const now = new Date().toISOString();
            persist((current) => ({ ...current, receivables: [{ id: createId360("recv"), patientReference: form.patientReference || "PAC-SEM-ID", saleId: "", totalAmount: parseNumber360(form.totalAmount), receivedAmount: parseNumber360(form.receivedAmount), dueDate: form.dueDate, paymentMethod: "Manual", installments: 1, status: form.status, ownerUserId: "Financeiro", collectionStatus: "NOT_STARTED", notes: "", createdAt: now, updatedAt: now }, ...current.receivables] }));
          }}>
            <Field label="Referência paciente" value={form.patientReference} onChange={(value) => setForm({ ...form, patientReference: value })} />
            <Field label="Valor vendido" value={form.totalAmount} onChange={(value) => setForm({ ...form, totalAmount: value })} />
            <Field label="Valor recebido" value={form.receivedAmount} onChange={(value) => setForm({ ...form, receivedAmount: value })} />
            <Field label="Vencimento" type="date" value={form.dueDate} onChange={(value) => setForm({ ...form, dueDate: value })} />
            <SelectField label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={(Object.keys(receivableStatusLabels) as ReceivableStatus360[]).map((value) => ({ value, label: receivableStatusLabels[value] }))} />
            <div className={LINHA_DO_ENVIAR}>
              <Botao type="submit" variante="primario">Adicionar recebível</Botao>
            </div>
          </form>
        </ManualEntry>
        <DataTable
          titulo="Recebíveis"
          emptyMessage={DERIVED_360_EMPTY}
          headers={["Paciente", "Vendido", "Recebido", "Aberto", "Vencimento", "Status", "Ações"]}
          rows={state.receivables.map((record) => [
            record.patientReference,
            money360(record.totalAmount),
            money360(record.receivedAmount),
            money360(receivableOpenAmount(record)),
            record.dueDate,
            isOverdue(record.dueDate) && record.status !== "PAID" ? (
              <SeloDaSituacao key={record.id} tom="atencao">
                Vencido
              </SeloDaSituacao>
            ) : (
              <SeloDaSituacao key={record.id} tom={TOM_DO_RECEBIVEL[record.status]}>
                {receivableStatusLabels[record.status]}
              </SeloDaSituacao>
            ),
            <ReceivableStatusControls key={record.id} record={record} persist={persist} />,
          ])}
        />
      </>
    );
  }

  if (slug === "acoes") {
    const [form, setForm] = useState({ title: "", description: "", sourceModule: "MANUAL" as ActionSourceModule360, priority: "MEDIUM" as ActionPriority360, ownerUserId: "Gestão", dueDate: todayPlus(5), expectedImpact: "PROCESS" as ExpectedImpact360 });
    const [actionQuery, setActionQuery] = useState("");
    const [actionStatusFilter, setActionStatusFilter] = useState("ABERTAS");
    const [actionPriorityFilter, setActionPriorityFilter] = useState("");
    const today = todayPlus(0);
    const filteredActions = state.actions
      .filter((record) => {
        if (actionStatusFilter === "ABERTAS") return record.status !== "DONE" && record.status !== "CANCELED";
        if (actionStatusFilter === "ATRASADAS") return record.status !== "DONE" && record.status !== "CANCELED" && record.dueDate < today;
        if (actionStatusFilter === "CONCLUIDAS") return record.status === "DONE";
        return true;
      })
      .filter((record) => (actionPriorityFilter ? record.priority === actionPriorityFilter : true))
      .filter((record) => {
        const term = actionQuery.trim().toLowerCase();
        if (!term) return true;
        return `${record.title} ${record.description} ${record.ownerUserId}`.toLowerCase().includes(term);
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const overdueCount = state.actions.filter((record) => record.status !== "DONE" && record.status !== "CANCELED" && record.dueDate < today).length;
    return (
      <>
        <section aria-label="Filtrar ações" className="grid items-end gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_auto]">
          <Campo rotulo="Buscar">
            <input value={actionQuery} onChange={(event) => setActionQuery(event.target.value)} placeholder="Buscar por título, descrição ou dono" aria-label="Buscar ações" className={classeDoCampo} />
          </Campo>
          <Campo rotulo="Situação">
            <Selecao value={actionStatusFilter} onChange={(event) => setActionStatusFilter(event.target.value)} aria-label="Filtrar por status">
              <option value="ABERTAS">Abertas</option>
              <option value="ATRASADAS">Atrasadas</option>
              <option value="CONCLUIDAS">Concluídas</option>
              <option value="TODAS">Todas</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Prioridade">
            <Selecao value={actionPriorityFilter} onChange={(event) => setActionPriorityFilter(event.target.value)} aria-label="Filtrar por prioridade">
              <option value="">Toda prioridade</option>
              {Object.entries(actionPriorityLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Selecao>
          </Campo>
          <p className="flex h-10 items-center gap-2 text-[13px] font-bold leading-5" role="status">
            <span className="tabular-nums text-tinta">{filteredActions.length} no filtro</span>
            {overdueCount ? <Etiqueta tom="atencao">{overdueCount} atrasadas</Etiqueta> : null}
          </p>
        </section>
        <BlocoFolha as="section" aria-labelledby="i360-criar-acao" respiro className="grid gap-4">
          <TituloDeBloco id="i360-criar-acao" titulo="Criar ação manual" />
          <form className={GRADE_DO_FORM} onSubmit={(event) => {
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
            <div className={LINHA_DO_ENVIAR}>
              <Botao type="submit" variante="primario" icone={<Plus className="h-4 w-4" aria-hidden="true" />}>Criar ação</Botao>
            </div>
          </form>
        </BlocoFolha>
        <DataTable
          titulo="Ações"
          headers={["Ação", "Prioridade", "Dono", "Prazo", "Status", "Impacto", "Ações"]}
          rows={filteredActions.map((record) => [
            record.title,
            actionPriorityLabels[record.priority],
            record.ownerUserId,
            <span key={`${record.id}-prazo`} className={cn("whitespace-nowrap tabular-nums", record.status !== "DONE" && record.status !== "CANCELED" && record.dueDate < today && "font-bold text-atencao")}>
              {record.dueDate}
            </span>,
            <SeloDaSituacao key={record.id} tom={TOM_DA_ACAO[record.status as ActionStatus360] ?? "espera"}>
              {actionStatusLabels[record.status as ActionStatus360]}
            </SeloDaSituacao>,
            expectedImpactLabels[record.expectedImpact],
            <ActionStatusControls key={record.id} record={record} persist={persist} />,
          ])}
        />
      </>
    );
  }

  if (slug === "configuracoes") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [form, setForm] = useState({ ...state.settings });
    // Re-semeia quando as metas reais mudam (ex.: chegou o fetch remoto depois do
    // mount). Sem isto, o form ficava com os defaults e, ao salvar, sobrescrevia
    // as metas reais. Depende do VALOR (serializado), não da referência, para não
    // apagar edição em andamento a cada re-render.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      setForm({ ...state.settings });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(state.settings)]);
    return (
      <BlocoFolha as="section" aria-labelledby="i360-metas-motor" respiro className="grid gap-4">
        <TituloDeBloco id="i360-metas-motor" titulo="Metas e limites do motor 360" />
        {tela360.soVe ? <AvisoDaTela tom="atencao">{FRASE_SO_VE}</AvisoDaTela> : null}
        <form className={GRADE_DO_FORM} onSubmit={(event) => {
          event.preventDefault();
          if (!tela360.podeEditar) return avisarSoVe();
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
          <div className={LINHA_DO_ENVIAR}>
            <Botao type="submit" variante="primario" disabled={!tela360.podeEditar} title={tela360.motivo || undefined}>Salvar configurações</Botao>
          </div>
        </form>
      </BlocoFolha>
    );
  }

  return null;
}

export function Inteligencia360ModulePage() {
  const { section } = useParams();
  const slug = (section ?? "ticket-medio") as ModuleSlug;
  const module = moduleBySlug[slug] ?? moduleBySlug["ticket-medio"];
  const { state, persist, syncMode, isSyncing, syncError } = useInteligenciaState();
  const { pessoa } = useAuth();
  const [moduleCopyFeedback, setModuleCopyFeedback] = useState("");
  const guide = moduleGuides[module.slug];

  if (!moduleBySlug[slug]) {
    return <Navigate to={moduleRoutes360.ticket} replace />;
  }

  return (
    <Moldura360
      sobrancelha={module.slug === "configuracoes" ? "Ajustes · Inteligência 360" : undefined}
      titulo={module.title}
      frase={module.description}
      acoes={
        <>
          <EstadoDaSincronia syncError={syncError} isSyncing={isSyncing} syncMode={syncMode} />
          <Botao
            type="button"
            variante="secundario"
            icone={<Copy className="h-4 w-4" aria-hidden="true" />}
            onClick={() => {
              const brief = generateWeeklyKickoffBrief(state);
              copyText(brief, setModuleCopyFeedback);
              exportBriefPdf("Resumo Executivo 360", brief, pessoa?.nome);
            }}
          >
            Copiar resumo
          </Botao>
        </>
      }
    >
      {moduleCopyFeedback ? <AvisoDaTela tom="info">{moduleCopyFeedback}</AvisoDaTela> : null}
      {guide ? (
        <BlocoSaber as="section" aria-label={`Como usar ${module.title}`} className="grid gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 stroke-oliva" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-[22px] text-tinta">{guide.auto}</p>
              <p className="mt-1 text-sm font-medium leading-[22px] text-tinta-2">{guide.doHere}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-8">
            {guide.links.map((link) => (
              <LinkSeta key={link.href} to={link.href}>
                {link.label}
              </LinkSeta>
            ))}
            {guide.links.some((link) => link.href === moduleRoutes360.dashboard) ? null : (
              <LinkSeta to={moduleRoutes360.dashboard}>Visão geral do 360</LinkSeta>
            )}
          </div>
        </BlocoSaber>
      ) : null}
      <SimpleModuleForms key={module.slug} slug={module.slug} state={state} persist={persist} />
    </Moldura360>
  );
}
