import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ClipboardCheck, Copy, FileText, HeartPulse, Plus, Scale, Stethoscope, UserPlus, XCircle } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { canAcompanhamento } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { exportBrandedPdf } from "@/lib/brandedPdf";
import { cn } from "@/lib/utils";
import {
  contactDisplayName,
  crmModuleRoutes,
  notClosedRecently,
  programPhaseLabels,
  type CrmAdhesionChannel,
  type CrmProgramPhase,
  criarTarefaDeResgatePorRisco,
} from "@/features/crm/crmData";
import { useAuth } from "@/hooks/useAuth";
import { ListaEsperaCard } from "./ListaEsperaCard";
import { ImportarInBodyCard } from "./ImportarInBodyCard";
import { useCrmState } from "@/features/crm/useCrmState";
import { listRemotePacienteMedicoesDesde } from "@/lib/remoteData";
import { listaParaCobrar, pesagensDaSemana } from "./pesagensSemana";
import {
  buildPerformanceReportTable,
  buildProgramaBoard,
  enrollPatientInProgram,
  milestoneResponsible,
  milestoneTypeLabels,
  canalFiltroLabels,
  cardNoCanal,
  conferenciaAcompanhamento,
  contagemPorCanal,
  patientsNotInProgram,
  type CanalFiltro,
  programSummaryLines,
  toggleProgramMilestone,
  type ProgramMilestone,
  type ProgramPatientCard,
} from "./programaData";

const channelShort: Record<CrmAdhesionChannel, string> = {
  PROGRAMA_ACOMPANHAMENTO: "Programa",
  CLUBE_BRATAN: "Clube",
  SOMENTE_TRATAMENTO: "Só tratamento",
};

const channelOptions: { value: CrmAdhesionChannel; label: string }[] = [
  { value: "PROGRAMA_ACOMPANHAMENTO", label: "Programa de Acompanhamento" },
  { value: "CLUBE_BRATAN", label: "Consulta Black (ex-Clube)" },
  { value: "SOMENTE_TRATAMENTO", label: "Somente Tratamento" },
];

function formatBR(dateISO: string) {
  return dateISO ? dateISO.slice(0, 10).split("-").reverse().join("/") : "—";
}

// Contador de marcos em uma linha só. Antes era um bloco de duas linhas com
// rótulo em cima; com 3 deles por paciente, cada cartão ganhava 60 px de altura
// sem dizer mais nada (16/09/2026: "tá muito grande, você rola infinitamente").
function ProgressPill({ label, done, total, icon: Icon }: { label: string; done: number; total: number; icon: typeof HeartPulse }) {
  const complete = done >= total;
  return (
    <span
      title={`${label}: ${done} de ${total}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold leading-tight",
        complete ? "border-emerald-300 bg-emerald-50/70 text-emerald-700" : "border-brand-oliva/16 bg-white/70 text-brand-tinta",
      )}
    >
      <Icon className={cn("h-3 w-3 shrink-0", complete ? "text-emerald-700" : "text-brand-oliva")} aria-hidden="true" />
      {done}/{total}
    </span>
  );
}

function MilestoneChip({ milestone, onToggle }: { milestone: ProgramMilestone; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`${milestone.label} · responsável: ${milestoneResponsible[milestone.type]} · previsto ${formatBR(milestone.expectedDate)}${milestone.done ? " · FEITO (toque para desfazer)" : milestone.overdue ? " · ATRASADO (toque para marcar feito)" : " · toque para marcar feito"}`}
      className={cn(
        "ios-pressable rounded-md border px-2 py-1 text-[11px] font-semibold leading-tight transition",
        milestone.done
          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
          : milestone.overdue
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-brand-oliva/20 bg-white/70 text-brand-tinta hover:bg-brand-creme/60",
      )}
    >
      {milestone.type === "MEDICO" ? `Dr. ${milestone.n}` : `${milestone.type === "CHECK" ? "Check" : "Bio"} ${milestone.n}`}
      {milestone.done ? " ✓" : ""}
    </button>
  );
}

export function ProgramaAcompanhamentoPage() {
  const { state, persist, syncMode, isSyncing, syncError } = useCrmState();
  const { pessoa } = useAuth();
  const hoje = todayISO();
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<CrmProgramPhase | "TODAS">("TODAS");
  // FILTRO POR CANAL (17/08/2026, pedido do Lucas): separar quem está em
  // acompanhamento de tratamento de quem está no programa.
  const [canalFiltro, setCanalFiltro] = useState<CanalFiltro>("TODOS");
  const [conferenciaAberta, setConferenciaAberta] = useState(false);
  // Os dois blocos de nomes ficam fechados: a frase-resumo já diz se precisa
  // abrir, e abertos eles empurravam a lista de pacientes para fora da tela.
  const [pesagemAberta, setPesagemAberta] = useState(false);
  const [naoFecharamAberto, setNaoFecharamAberto] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [days, setDays] = useState(7);
  const [enrollOpen, setEnrollOpen] = useState(false);

  // PESAGEM DA SEMANA (16/09/2026): o que o paciente manda pelo portal chega aqui.
  // 60 dias bastam para a variação e para o semáforo (que olha as últimas 2 semanas).
  const desde = useMemo(() => new Date(new Date(`${hoje}T12:00:00Z`).getTime() - 60 * 86_400_000).toISOString().slice(0, 10), [hoje]);
  const medicoes = useQuery({
    queryKey: ["pesagens-desde", desde],
    queryFn: () => listRemotePacienteMedicoesDesde(desde),
    staleTime: 60_000,
  });
  const boardSemPesagem = useMemo(() => buildProgramaBoard(state, hoje), [state, hoje]);
  const pesagens = useMemo(
    () =>
      pesagensDaSemana({
        pacientes: boardSemPesagem.map((card) => ({ contactId: card.contactId, nome: card.patientName, desde: card.startedAt })),
        medicoes: (medicoes.data ?? []).map((m) => ({ contactRef: m.contactRef, dia: m.dia, pesoKg: m.pesoKg, origem: m.origem })),
        hoje,
      }),
    [boardSemPesagem, medicoes.data, hoje],
  );
  const board = useMemo(() => buildProgramaBoard(state, hoje, undefined, pesagens.ultimaPorContato), [state, hoje, pesagens.ultimaPorContato]);
  const notClosed = useMemo(() => notClosedRecently(state, hoje, days), [state, hoje, days]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return board.filter((card) => {
      if (phaseFilter !== "TODAS" && card.phase !== phaseFilter) return false;
      if (!cardNoCanal(card, canalFiltro)) return false;
      if (term && !card.patientName.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [board, search, phaseFilter, canalFiltro]);

  const porCanal = useMemo(() => contagemPorCanal(board), [board]);
  const vermelhos = board.filter((card) => card.risco.nivel === "VERMELHO").length;
  const pendencias = useMemo(() => conferenciaAcompanhamento(state, hoje), [state, hoje]);
  const pendenciasAltas = pendencias.filter((item) => item.gravidade === "ALTA").length;

  const totals = useMemo(
    () => ({
      pacientes: board.length,
      emDia: board.filter((card) => card.overdueCount === 0).length,
      atrasados: board.filter((card) => card.overdueCount > 0).length,
    }),
    [board],
  );

  const phasesInUse = useMemo(() => [...new Set(board.map((card) => card.phase))], [board]);

  function toggle(dealId: string, key: string) {
    void persist((current) => toggleProgramMilestone(current, dealId, key));
  }

  function gerarRelatorio() {
    if (!filtered.length) {
      setCopyFeedback("Nenhum paciente para o relatório com o filtro atual.");
      window.setTimeout(() => setCopyFeedback(""), 6000);
      return;
    }
    const ok = exportBrandedPdf({
      title: "Plano de Acompanhamento — Assistente de Performance",
      subtitle: `Controle da caminhada dos pacientes · ${formatBR(hoje)}`,
      sections: [
        { heading: "Resumo", lines: programSummaryLines(filtered) },
        { heading: "Pacientes em acompanhamento", table: buildPerformanceReportTable(filtered) },
      ],
      footerNote: "Datas previstas contam a partir da adesão. A agenda oficial fica no Feegow.",
    });
    setCopyFeedback(
      ok
        ? "Relatório gerado — use \"Salvar como PDF\" na janela de impressão para enviar."
        : "Libere os pop-ups do navegador para gerar o relatório.",
    );
    window.setTimeout(() => setCopyFeedback(""), 7000);
  }

  async function copyNotClosed() {
    const lines = [
      `Pacientes que não fecharam (últimos ${days} dias) — ${notClosed.length}`,
      ...notClosed.map((row) => `• ${row.contact ? contactDisplayName(row.contact) : "Contato"} — ${formatBR(row.dateISO)}${row.objection ? ` — ${row.objection}` : ""}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyFeedback("Lista de não-fechados copiada.");
    } catch {
      setCopyFeedback("Não consegui copiar automático — tente de novo.");
    }
    window.setTimeout(() => setCopyFeedback(""), 6000);
  }

  return (
    <AccessGate allowed={canAcompanhamento} label="Acompanhamento" module="acompanhamento">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Caminhada do paciente</Badge>
                <Badge variant="muted">{syncError ? "Sem sincronizar" : isSyncing ? "Sincronizando" : syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Acompanhamento
                <InfoTip title="O que é esta aba?">
                  A visão única do plano de acompanhamento: todos os pacientes que aderiram, em qual fase estão e a caminhada
                  de 6 meses de cada um — 6 checkpoints da Assistente de Performance, 6 bioimpedâncias e as 3 consultas do Dr.
                  Daniel. Cada setor marca o que faz (enfermagem, Performance, médico). No fim, a lista de quem não fechou na
                  semana, pronta para copiar. As datas previstas contam a partir da adesão; a agenda oficial fica no Feegow.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Quem está em qual fase, o que já foi feito, o próximo passo de cada paciente — e quem não fechou na semana.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-brand-oliva/20 bg-white/60 px-4 py-2 text-center">
                <p className="text-[11px] font-semibold uppercase text-brand-oliva">No plano</p>
                <p className="text-xl font-bold text-brand-musgo">{totals.pacientes}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-center">
                <p className="text-[11px] font-semibold uppercase text-emerald-700">Em dia</p>
                <p className="text-xl font-bold text-emerald-700">{totals.emDia}</p>
              </div>
              <div className={cn("rounded-xl border px-4 py-2 text-center", vermelhos ? "border-red-200 bg-red-50/70" : "border-brand-oliva/20 bg-white/60")} title="Semáforo de adesão: não respondeu, sem retorno, muito tempo sem vir">
                <p className={cn("text-[11px] font-semibold uppercase", vermelhos ? "text-red-700" : "text-brand-oliva")}>Semáforo vermelho</p>
                <p className={cn("text-xl font-bold", vermelhos ? "text-red-700" : "text-brand-musgo")}>{vermelhos}</p>
              </div>
              <div className={cn("rounded-xl border px-4 py-2 text-center", totals.atrasados ? "border-red-200 bg-red-50/70" : "border-brand-oliva/20 bg-white/60")}>
                <p className={cn("text-[11px] font-semibold uppercase", totals.atrasados ? "text-red-700" : "text-brand-oliva")}>Com atraso</p>
                <p className={cn("text-xl font-bold", totals.atrasados ? "text-red-700" : "text-brand-musgo")}>{totals.atrasados}</p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* A bioimpedância fica no alto porque é o que a enfermagem vem fazer aqui
            depois de rodar o aparelho (pedido do Lucas, 16/09/2026). Fechado, é
            uma linha; aberto, é a área de soltar o arquivo. */}
        <ImportarInBodyCard contatos={state.contacts.map((contato) => ({ id: contato.id, name: contato.fullName }))} pessoaId={pessoa?.id ?? null} ativo={syncMode !== "local"} />

        {copyFeedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {copyFeedback}
          </div>
        ) : null}

        {/* CONFERÊNCIA — "está tudo linkado? faltou alguém?" (17/08/2026).
            Sem este bloco, essa pergunta não tinha resposta: dava para olhar o
            quadro e não saber quem deveria estar nele e não está. */}
        {pendencias.length ? (
          <section
            className={cn(
              "rounded-lg border-2 p-3 backdrop-blur-xl",
              pendenciasAltas ? "border-red-300 bg-red-50/60" : "border-brand-dourado/50 bg-brand-creme/40",
            )}
          >
            <button
              type="button"
              onClick={() => setConferenciaAberta((atual) => !atual)}
              className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
            >
              <span className="flex flex-wrap items-center gap-2">
                <ClipboardCheck className={cn("h-4 w-4", pendenciasAltas ? "text-red-700" : "text-brand-musgo")} aria-hidden="true" />
                <strong className={cn("text-sm", pendenciasAltas ? "text-red-900" : "text-brand-musgo")}>
                  Conferência: {pendencias.length} ponto(s) para olhar
                </strong>
                {pendencias.map((item) => (
                  <Badge key={item.chave} variant={item.gravidade === "ALTA" ? "outline" : "muted"} className={item.gravidade === "ALTA" ? "border-red-300 text-red-800" : undefined}>
                    {item.pessoas.length} {item.chave === "SEM_CANAL" ? "sem canal" : item.chave === "GANHOU_FORA" ? "fechou e ficou fora" : item.chave === "PACIENTE_SEM_NEGOCIACAO" ? "sem negociação" : "nome repetido"}
                  </Badge>
                ))}
              </span>
              <span className="text-xs font-semibold text-brand-oliva">{conferenciaAberta ? "esconder" : "ver detalhes"}</span>
            </button>

            {conferenciaAberta ? (
              <div className="mt-3 grid gap-2.5">
                {pendencias.map((item) => (
                  <div key={item.chave} className="rounded-lg border border-brand-oliva/20 bg-white/80 p-3">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-brand-tinta">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white",
                          item.gravidade === "ALTA" ? "bg-red-600" : item.gravidade === "MEDIA" ? "bg-amber-500" : "bg-brand-oliva",
                        )}
                      >
                        {item.gravidade}
                      </span>
                      {item.titulo}
                    </p>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      <strong className="text-brand-tinta">Por que importa:</strong> {item.porque}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      <strong className="text-brand-tinta">O que fazer:</strong> {item.oQueFazer}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.pessoas.map((pessoa) => (
                        <Link
                          key={`${item.chave}-${pessoa.contactId}`}
                          to={crmModuleRoutes.contact(pessoa.contactId)}
                          title={pessoa.detalhe}
                          className="rounded-md border border-brand-oliva/25 bg-white px-2 py-1 text-[11px] font-semibold text-brand-tinta transition hover:border-brand-musgo hover:bg-brand-creme/50"
                        >
                          {pessoa.nome}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* PESAGEM DA SEMANA (16/09/2026): a enfermagem vê o que chegou pelo portal e
            quem precisa ser cobrado. Quem passa de 2 semanas sem pesar já pesa no
            semáforo de adesão do cartão, então esta lista e o semáforo contam a mesma história. */}
        <section className="rounded-lg border border-brand-oliva/20 bg-white/60 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-brand-musgo">
              <button type="button" onClick={() => setPesagemAberta((atual) => !atual)} className="ios-pressable -ml-0.5 rounded-md p-0.5 text-brand-oliva transition hover:bg-brand-creme/60" aria-label={pesagemAberta ? "Esconder quem pesou" : "Ver quem pesou"}>
                <ChevronDown className={cn("h-4 w-4 transition-transform", pesagemAberta && "rotate-180")} aria-hidden="true" />
              </button>
              <Scale className="h-4 w-4" aria-hidden="true" />
              Pesagem da semana
              <InfoTip title="De onde vem esta lista">
                O paciente manda o peso pelo Meu Bratan, uma vez por semana. A enfermagem também pode lançar pela ficha, no
                cartão Portal do paciente. A semana começa na segunda. Quem passa de duas semanas sem pesar soma um ponto no
                semáforo de adesão.
              </InfoTip>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{medicoes.isLoading ? "Carregando as pesagens…" : pesagens.frase}</span>
              {pesagens.faltando.length + pesagens.semNenhuma.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(listaParaCobrar(pesagens));
                      setCopyFeedback("Lista de quem falta pesar copiada.");
                      window.setTimeout(() => setCopyFeedback(""), 6000);
                    } catch {
                      setCopyFeedback("Não consegui copiar a lista.");
                      window.setTimeout(() => setCopyFeedback(""), 6000);
                    }
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Copiar quem falta
                </Button>
              ) : null}
            </div>
          </div>

          {medicoes.isError ? (
            <p className="mt-3 text-xs text-red-700">Não consegui ler as pesagens agora. O resto da tela continua valendo.</p>
          ) : null}

          <div className={cn("mt-3 grid gap-3 lg:grid-cols-2", !pesagemAberta && "hidden")}>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-[11px] font-bold uppercase text-emerald-800">Mandaram nesta semana ({pesagens.mandaram.length})</p>
              {pesagens.mandaram.length ? (
                <ul className="mt-2 grid gap-1.5">
                  {pesagens.mandaram.map((p) => (
                    <li key={p.contactId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <Link to={crmModuleRoutes.contact(p.contactId)} className="font-semibold text-brand-tinta hover:underline">
                        {p.nome}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {p.frase}
                        {p.ultimaOrigem === "ENFERMAGEM" ? " · lançada pela enfermagem" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Ninguém pesou ainda nesta semana.</p>
              )}
            </div>
            <div className="rounded-lg border border-brand-dourado/40 bg-brand-creme/40 p-3">
              <p className="text-[11px] font-bold uppercase text-brand-musgo">
                Falta cobrar ({pesagens.faltando.length + pesagens.semNenhuma.length})
              </p>
              {pesagens.faltando.length + pesagens.semNenhuma.length ? (
                <ul className="mt-2 grid gap-1.5">
                  {[...pesagens.faltando, ...pesagens.semNenhuma].map((p) => (
                    <li key={p.contactId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <Link to={crmModuleRoutes.contact(p.contactId)} className="font-semibold text-brand-tinta hover:underline">
                        {p.nome}
                      </Link>
                      <span className="text-xs text-muted-foreground">{p.frase}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Todo mundo em dia.</p>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-oliva/15 bg-white/50 p-2.5 backdrop-blur-xl">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar paciente" className="h-10 w-full sm:w-56" aria-label="Buscar paciente" />

          {/* CANAL: o que o paciente fechou. É o filtro que separa quem está em
              acompanhamento de tratamento de quem está no programa. */}
          {(["TODOS", "PROGRAMA_ACOMPANHAMENTO", "CLUBE_BRATAN", "SOMENTE_TRATAMENTO", "SEM_CANAL"] as CanalFiltro[])
            .filter((opcao) => opcao === "TODOS" || porCanal[opcao] > 0)
            .map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setCanalFiltro(opcao)}
                className={cn(
                  "ios-pressable rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  canalFiltro === opcao
                    ? opcao === "SEM_CANAL"
                      ? "border-red-400 bg-red-600 text-white"
                      : "border-brand-dourado bg-brand-dourado text-brand-tinta"
                    : opcao === "SEM_CANAL"
                      ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
                      : "border-brand-oliva/25 bg-white/70 text-brand-tinta hover:bg-white",
                )}
              >
                {opcao === "TODOS" ? "Todos" : opcao === "SEM_CANAL" ? "Sem canal" : channelShort[opcao as CrmAdhesionChannel]}
                <span className="ml-1.5 opacity-70">{porCanal[opcao]}</span>
              </button>
            ))}
          <span className="mx-1 hidden h-5 w-px bg-brand-oliva/20 sm:block" />

          <button
            type="button"
            onClick={() => setPhaseFilter("TODAS")}
            className={cn("ios-pressable rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", phaseFilter === "TODAS" ? "bg-brand-musgo text-brand-papel" : "text-brand-tinta hover:bg-white/80")}
          >
            Todas as fases
          </button>
          {phasesInUse.map((phase) => (
            <button
              key={phase}
              type="button"
              onClick={() => setPhaseFilter((current) => (current === phase ? "TODAS" : phase))}
              className={cn("ios-pressable rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", phaseFilter === phase ? "bg-brand-musgo text-brand-papel" : "text-brand-tinta hover:bg-white/80")}
            >
              {programPhaseLabels[phase]}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-brand-oliva/20 sm:block" />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={gerarRelatorio}>
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Relatório p/ Performance
          </Button>
          <Button type="button" variant={enrollOpen ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setEnrollOpen((value) => !value)}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Adicionar paciente ao plano
          </Button>
        </section>

        {enrollOpen ? (
          <EnrollPanel
            state={state}
            hoje={hoje}
            onEnroll={(input) => {
              void persist((current) => enrollPatientInProgram(current, input));
              setCopyFeedback("Paciente adicionado ao plano de acompanhamento.");
              window.setTimeout(() => setCopyFeedback(""), 6000);
            }}
          />
        ) : null}

        {filtered.length ? (
          <div className="overflow-hidden rounded-lg border border-brand-oliva/20 bg-white/60 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-brand-oliva/15 px-3 py-1.5 text-[11px] font-semibold uppercase text-brand-oliva">
              <span>{filtered.length} {filtered.length === 1 ? "paciente" : "pacientes"} no plano</span>
              <span className="hidden sm:inline">check · bio · dr. · próximo passo</span>
            </div>
            {filtered.map((card) => (
              <PatientCard key={card.dealId} card={card} onToggle={(key) => toggle(card.dealId, key)} onResgate={(c) => { void persist((current) => criarTarefaDeResgatePorRisco(current, c.dealId, c.risco.motivos, pessoa?.id ?? "coordenacao", hoje)); setCopyFeedback(`Tarefa de resgate criada para ${c.patientName} (enfermagem liga hoje).`); }} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {board.length
                ? "Nenhum paciente com esse filtro."
                : "Nenhum paciente no plano ainda. Use \"Adicionar paciente ao plano\" para cadastrar quem já está em acompanhamento, ou feche um negócio no Kanban."}
            </CardContent>
          </Card>
        )}

        <ListaEsperaCard pessoaId={pessoa?.id ?? null} ativo={syncMode !== "local"} />
        {/* Não fecharam na semana — a lista que vai para a Assistente de Performance */}
        <Card>
          <CardHeader className={cn(naoFecharamAberto ? "pb-3" : "pb-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <button type="button" onClick={() => setNaoFecharamAberto((atual) => !atual)} className="ios-pressable -ml-0.5 rounded-md p-0.5 text-brand-oliva transition hover:bg-brand-creme/60" aria-label={naoFecharamAberto ? "Esconder quem não fechou" : "Ver quem não fechou"}>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", naoFecharamAberto && "rotate-180")} aria-hidden="true" />
                </button>
                <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
                Não fecharam ({notClosed.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <select
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                  className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                  aria-label="Período de não-fechamento"
                >
                  <option value={7}>7 dias</option>
                  <option value={14}>14 dias</option>
                  <option value={30}>30 dias</option>
                </select>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copyNotClosed()} disabled={!notClosed.length}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copiar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cn("space-y-2", !naoFecharamAberto && "hidden")}>
            {notClosed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém em aberto de não-fechamento nesse período. 🎉</p>
            ) : (
              notClosed.map((row) => (
                <div key={row.deal.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/16 bg-white/70 px-3 py-2">
                  <div className="min-w-0">
                    {row.contact ? (
                      <Link to={crmModuleRoutes.contact(row.contact.id)} className="font-semibold text-brand-musgo hover:underline">{contactDisplayName(row.contact)}</Link>
                    ) : (
                      <span className="font-semibold text-brand-musgo">Contato</span>
                    )}
                    {row.objection ? <p className="text-xs text-muted-foreground">Objeção: {row.objection}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs font-semibold uppercase text-brand-oliva">{formatBR(row.dateISO)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AccessGate>
  );
}

function EnrollPanel({
  state,
  hoje,
  onEnroll,
}: {
  state: ReturnType<typeof useCrmState>["state"];
  hoje: string;
  onEnroll: (input: { contactId: string; startDate: string; channel: CrmAdhesionChannel; checksDone: number; biosDone: number; medicoDone: number }) => void;
}) {
  const [contactId, setContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [startDate, setStartDate] = useState(hoje);
  const [channel, setChannel] = useState<CrmAdhesionChannel>("PROGRAMA_ACOMPANHAMENTO");
  const [checksDone, setChecksDone] = useState("0");
  const [biosDone, setBiosDone] = useState("0");
  const [medicoDone, setMedicoDone] = useState("0");
  const [error, setError] = useState("");

  const suggestions = useMemo(() => patientsNotInProgram(state, hoje), [state, hoje]);
  const matches = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    if (!term) return suggestions.slice(0, 8);
    return suggestions.filter((contact) => contactDisplayName(contact).toLowerCase().includes(term)).slice(0, 8);
  }, [suggestions, contactSearch]);
  const selected = state.contacts.find((contact) => contact.id === contactId);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!contactId) return setError("Escolha o paciente na lista.");
    if (!startDate) return setError("Informe a data de início (adesão).");
    onEnroll({
      contactId,
      startDate,
      channel,
      checksDone: Number(checksDone) || 0,
      biosDone: Number(biosDone) || 0,
      medicoDone: Number(medicoDone) || 0,
    });
    setContactId("");
    setContactSearch("");
    setChecksDone("0");
    setBiosDone("0");
    setMedicoDone("0");
  }

  return (
    <Card className="border-brand-dourado/35 bg-brand-creme/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserPlus className="h-5 w-5 text-brand-oliva" aria-hidden="true" />
          Adicionar paciente ao plano
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Para quem já está em acompanhamento (entrou antes do app). Escolha o paciente, a data de adesão e quantos passos já fez.
        </p>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={submit}>
          <div>
            <Label>Paciente</Label>
            {selected ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-brand-oliva/20 bg-white/80 px-3 py-2">
                <span className="text-sm font-semibold text-brand-tinta">{contactDisplayName(selected)}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setContactId("")}>Trocar</Button>
              </div>
            ) : (
              <>
                <Input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Buscar paciente ativo/fechado..." />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {matches.length ? (
                    matches.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => setContactId(contact.id)}
                        className="ios-pressable rounded-full border border-brand-oliva/25 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-tinta hover:bg-brand-creme/70"
                      >
                        {contactDisplayName(contact)}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum paciente encontrado com esse nome.</p>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Data de adesão</Label>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div>
              <Label>Canal</Label>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value as CrmAdhesionChannel)}
                className="flex h-11 w-full rounded-md border border-input bg-white/80 px-3 text-sm"
              >
                {channelOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label>Quantos já fez? (deixe 0 se está começando)</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <div>
                <span className="text-[11px] text-muted-foreground">Checkpoints (0–6)</span>
                <Input value={checksDone} onChange={(event) => setChecksDone(event.target.value)} inputMode="numeric" />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">Bioimped. (0–6)</span>
                <Input value={biosDone} onChange={(event) => setBiosDone(event.target.value)} inputMode="numeric" />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">Consultas (0–3)</span>
                <Input value={medicoDone} onChange={(event) => setMedicoDone(event.target.value)} inputMode="numeric" />
              </div>
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div>
            <LiquidButton type="submit" size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar ao plano
            </LiquidButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const corDoRisco = { VERDE: "bg-emerald-500", AMARELO: "bg-amber-500", VERMELHO: "bg-red-600" } as const;

// UMA LINHA POR PACIENTE (16/09/2026). Era um cartão de ~200 px: título, frase do
// semáforo, mês, três blocos de progresso e a faixa do próximo passo. Com a
// clínica inteira no plano, a tela virava rolagem sem fim. Agora cabe tudo em
// uma linha — nome, fase, semáforo, contadores e o próximo passo — e o detalhe
// (marcos para marcar, data de adesão, motivo do semáforo) abre no toque.
function PatientCard({ card, onToggle, onResgate }: { card: ProgramPatientCard; onToggle: (key: string) => void; onResgate?: (card: ProgramPatientCard) => void }) {
  const [open, setOpen] = useState(false);
  const next = card.nextMilestone;

  return (
    <div className={cn("border-b border-brand-oliva/12 last:border-b-0", card.overdueCount > 0 && "bg-red-50/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? `Esconder os marcos de ${card.patientName}` : `Ver os marcos de ${card.patientName}`}
          className="ios-pressable shrink-0 rounded-md p-0.5 text-brand-oliva transition hover:bg-brand-creme/60"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>

        <span
          title={card.risco.frase}
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", corDoRisco[card.risco.nivel])}
          aria-label={`Semáforo ${card.risco.nivel.toLowerCase()}`}
        />

        <Link
          to={`/crm/contatos/${card.contactId}`}
          className="min-w-[8rem] flex-1 truncate text-sm font-semibold text-brand-tinta hover:underline"
          title={`Mês ${card.monthOfProgram}/${card.grade.meses} · adesão ${formatBR(card.startedAt)}`}
        >
          {card.patientName}
        </Link>

        <span className="hidden shrink-0 text-[11px] font-semibold uppercase text-brand-oliva sm:inline">
          {card.channel ? `${channelShort[card.channel]} · ` : ""}
          {card.phaseLabel}
        </span>

        {/* Os totais vêm da GRADE DO CANAL (17/09/2026): o Clube dá direito a duas
            bioimpedâncias e duas consultas, e quem comprou só tratamento não tem
            marco nenhum. Antes todos apareciam devendo 6/6/3. */}
        <span className="flex shrink-0 items-center gap-1">
          {card.grade.CHECK.length > 0 ? <ProgressPill label="Checkpoints" done={card.checksDone} total={card.grade.CHECK.length} icon={ClipboardCheck} /> : null}
          {card.grade.BIO.length > 0 ? <ProgressPill label="Bioimpedâncias" done={card.biosDone} total={card.grade.BIO.length} icon={HeartPulse} /> : null}
          {card.grade.MEDICO.length > 0 ? <ProgressPill label="Consultas com o Dr." done={card.medicoDone} total={card.grade.MEDICO.length} icon={Stethoscope} /> : null}
          {card.milestones.length === 0 ? <span className="text-[11px] text-muted-foreground">só tratamento</span> : null}
        </span>

        <span className="min-w-[10rem] flex-1 text-xs sm:text-right">
          {next ? (
            <>
              <span className="text-muted-foreground">{next.label} · </span>
              <span className={cn("font-semibold", next.overdue ? "text-red-700" : "text-brand-tinta")}>
                {formatBR(next.expectedDate)}
                {next.overdue ? " (atrasado)" : ""}
              </span>
            </>
          ) : card.milestones.length === 0 ? (
            <span className="text-muted-foreground">sem marcos — acompanhamento do tratamento</span>
          ) : (
            <span className="font-semibold text-emerald-700">Caminhada completa</span>
          )}
        </span>
      </div>

      {card.risco.nivel === "VERMELHO" ? (
        <p className="flex flex-wrap items-center gap-x-2 px-3 pb-2 text-xs text-red-800">
          {card.risco.frase}
          {onResgate ? (
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => onResgate(card)}>
              criar tarefa de resgate (ligar hoje)
            </button>
          ) : null}
        </p>
      ) : null}

      {open ? (
        <div className="grid gap-2 border-t border-brand-oliva/10 bg-brand-papel/40 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            Mês {card.monthOfProgram}/{card.grade.meses} · adesão {formatBR(card.startedAt)}
            {card.channel ? ` · ${channelShort[card.channel]}` : ""} · {card.phaseLabel}
            {card.risco.nivel === "AMARELO" ? ` · ${card.risco.frase}` : ""}
          </p>
          {(["CHECK", "BIO", "MEDICO"] as const).map((type) => (
            <div key={type} className="flex flex-wrap items-center gap-1.5">
              <span className="w-52 shrink-0 text-xs font-semibold uppercase text-brand-oliva">
                {milestoneTypeLabels[type]} <span className="font-normal normal-case text-muted-foreground">· {milestoneResponsible[type]}</span>
              </span>
              {card.milestones
                .filter((milestone) => milestone.type === type)
                .sort((a, b) => a.n - b.n)
                .map((milestone) => (
                  <MilestoneChip key={milestone.key} milestone={milestone} onToggle={() => onToggle(milestone.key)} />
                ))}
            </div>
          ))}
          <p className="text-[11px] leading-4 text-muted-foreground">
            Cada setor marca o que faz (toque para marcar/desfazer). Datas previstas contam da adesão; a agenda oficial fica no Feegow.
          </p>
        </div>
      ) : null}
    </div>
  );
}
