import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ClipboardCheck, Copy, HeartPulse, Stethoscope } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { canAcompanhamento } from "@/lib/access";
import { todayISO } from "@/lib/localStore";
import { cn } from "@/lib/utils";
import { programPhaseLabels, type CrmAdhesionChannel, type CrmProgramPhase } from "@/features/crm/crmData";
import { useCrmState } from "@/features/crm/useCrmState";
import {
  buildNutriShareText,
  buildProgramaBoard,
  milestoneTypeLabels,
  toggleProgramMilestone,
  type ProgramMilestone,
  type ProgramPatientCard,
} from "./programaData";

const channelShort: Record<CrmAdhesionChannel, string> = {
  PROGRAMA_ACOMPANHAMENTO: "Programa",
  CLUBE_BRATAN: "Clube",
  SOMENTE_TRATAMENTO: "Só tratamento",
};

function formatBR(dateISO: string) {
  return dateISO ? dateISO.slice(0, 10).split("-").reverse().join("/") : "—";
}

function ProgressPill({ label, done, total, icon: Icon }: { label: string; done: number; total: number; icon: typeof HeartPulse }) {
  const complete = done >= total;
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", complete ? "border-emerald-300 bg-emerald-50/70" : "border-brand-oliva/16 bg-white/70")}>
      <Icon className={cn("h-4 w-4 shrink-0", complete ? "text-emerald-700" : "text-brand-oliva")} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase leading-tight text-brand-oliva">{label}</p>
        <p className={cn("text-sm font-bold leading-tight", complete ? "text-emerald-700" : "text-brand-tinta")}>{done}/{total}</p>
      </div>
    </div>
  );
}

function MilestoneChip({ milestone, onToggle, readOnly }: { milestone: ProgramMilestone; onToggle: () => void; readOnly: boolean }) {
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onToggle}
      title={`${milestone.label} · previsto ${formatBR(milestone.expectedDate)}${milestone.done ? " · FEITO (toque para desfazer)" : milestone.overdue ? " · ATRASADO (toque para marcar feito)" : " · toque para marcar feito"}`}
      className={cn(
        "ios-pressable rounded-md border px-2 py-1 text-[11px] font-semibold leading-tight transition",
        milestone.done
          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
          : milestone.overdue
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-brand-oliva/20 bg-white/70 text-brand-tinta hover:bg-brand-creme/60",
        readOnly && "cursor-default opacity-80",
      )}
    >
      {milestone.type === "MEDICO" ? `Dr. ${milestone.n}` : `${milestone.type === "CHECK" ? "Check" : "Bio"} ${milestone.n}`}
      {milestone.done ? " ✓" : ""}
    </button>
  );
}

export function ProgramaAcompanhamentoPage() {
  const { state, persist, syncMode, isSyncing, syncError } = useCrmState();
  const hoje = todayISO();
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<CrmProgramPhase | "TODAS">("TODAS");
  const [copyFeedback, setCopyFeedback] = useState("");

  const board = useMemo(() => buildProgramaBoard(state, hoje), [state, hoje]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return board.filter((card) => {
      if (phaseFilter !== "TODAS" && card.phase !== phaseFilter) return false;
      if (term && !card.patientName.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [board, search, phaseFilter]);

  const totals = useMemo(
    () => ({
      pacientes: board.length,
      emDia: board.filter((card) => card.overdueCount === 0).length,
      atrasados: board.filter((card) => card.overdueCount > 0).length,
    }),
    [board],
  );

  const phasesInUse = useMemo(() => {
    const set = new Set(board.map((card) => card.phase));
    return [...set];
  }, [board]);

  function toggle(dealId: string, key: string) {
    void persist((current) => toggleProgramMilestone(current, dealId, key));
  }

  async function copyForNutri() {
    const text = buildNutriShareText(filtered, hoje);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Controle copiado — é só colar no WhatsApp da Assistente de Performance.");
    } catch {
      setCopyFeedback("Não consegui copiar automático. Selecione e copie o texto do console.");
    }
    window.setTimeout(() => setCopyFeedback(""), 6000);
  }

  return (
    <AccessGate allowed={canAcompanhamento} label="Acompanhamento · Dr. Daniel">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="gold">Dr. Daniel</Badge>
                <Badge variant="muted">{syncError ? "Sem sincronizar" : isSyncing ? "Sincronizando" : syncMode}</Badge>
              </div>
              <h1 className="mt-3 flex items-center gap-2 text-3xl leading-tight text-brand-musgo sm:text-4xl">
                Plano de Acompanhamento
                <InfoTip title="Como funciona esta aba?">
                  Todos os pacientes que aderiram ao plano, com a caminhada de 6 meses de cada um: 6 checkpoints da
                  Assistente de Performance, 6 bioimpedâncias e as 3 consultas do Dr. Daniel (mês 2, 4 e 6). As datas
                  previstas são calculadas da adesão. Toque num marco para marcar feito — e use "Copiar controle" para
                  mandar o retrato à Assistente de Performance.
                </InfoTip>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Quem está em qual fase, o que já foi feito e qual é o próximo passo de cada paciente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-brand-oliva/20 bg-white/60 px-4 py-2 text-center">
                <p className="text-[11px] font-semibold uppercase text-brand-oliva">Pacientes</p>
                <p className="text-xl font-bold text-brand-musgo">{totals.pacientes}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-center">
                <p className="text-[11px] font-semibold uppercase text-emerald-700">Em dia</p>
                <p className="text-xl font-bold text-emerald-700">{totals.emDia}</p>
              </div>
              <div className={cn("rounded-xl border px-4 py-2 text-center", totals.atrasados ? "border-red-200 bg-red-50/70" : "border-brand-oliva/20 bg-white/60")}>
                <p className={cn("text-[11px] font-semibold uppercase", totals.atrasados ? "text-red-700" : "text-brand-oliva")}>Com atraso</p>
                <p className={cn("text-xl font-bold", totals.atrasados ? "text-red-700" : "text-brand-musgo")}>{totals.atrasados}</p>
              </div>
            </div>
          </div>
        </motion.section>

        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-oliva/15 bg-white/50 p-2.5 backdrop-blur-xl">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar paciente"
            className="h-10 w-full sm:w-64"
            aria-label="Buscar paciente"
          />
          <button
            type="button"
            onClick={() => setPhaseFilter("TODAS")}
            className={cn(
              "ios-pressable rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              phaseFilter === "TODAS" ? "bg-brand-musgo text-brand-papel" : "text-brand-tinta hover:bg-white/80",
            )}
          >
            Todas as fases
          </button>
          {phasesInUse.map((phase) => (
            <button
              key={phase}
              type="button"
              onClick={() => setPhaseFilter((current) => (current === phase ? "TODAS" : phase))}
              className={cn(
                "ios-pressable rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                phaseFilter === phase ? "bg-brand-musgo text-brand-papel" : "text-brand-tinta hover:bg-white/80",
              )}
            >
              {programPhaseLabels[phase]}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-brand-oliva/20 sm:block" />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copyForNutri()}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copiar controle p/ Performance
          </Button>
        </section>

        {copyFeedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {copyFeedback}
          </div>
        ) : null}

        {filtered.length ? (
          <div className="grid gap-4">
            {filtered.map((card) => (
              <PatientCard key={card.dealId} card={card} onToggle={(key) => toggle(card.dealId, key)} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {board.length
                ? "Nenhum paciente com esse filtro."
                : "Nenhum paciente em acompanhamento ainda. Quando um fechamento entrar no Programa (Kanban), ele aparece aqui sozinho."}
            </CardContent>
          </Card>
        )}
      </div>
    </AccessGate>
  );
}

function PatientCard({ card, onToggle }: { card: ProgramPatientCard; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const next = card.nextMilestone;

  return (
    <Card className={cn("border-brand-oliva/20 bg-white/72 shadow-none backdrop-blur", card.overdueCount > 0 && "border-red-200")}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg leading-tight">
              <Link to={`/crm/contatos/${card.contactId}`} className="hover:underline">{card.patientName}</Link>
              {card.channel ? <Badge variant="gold">{channelShort[card.channel]}</Badge> : null}
              <Badge variant="muted">{card.phaseLabel}</Badge>
              {card.overdueCount > 0 ? <Badge className="bg-red-100 text-red-800">{card.overdueCount} atrasado(s)</Badge> : null}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Mês {card.monthOfProgram}/6 · adesão {formatBR(card.startedAt)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ProgressPill label="Checkpoints" done={card.checksDone} total={6} icon={ClipboardCheck} />
            <ProgressPill label="Bioimped." done={card.biosDone} total={6} icon={HeartPulse} />
            <ProgressPill label="Consultas Dr." done={card.medicoDone} total={3} icon={Stethoscope} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-oliva/14 bg-brand-papel/60 px-3 py-2.5">
          {next ? (
            <p className="text-sm">
              <span className="font-semibold text-brand-musgo">Próximo:</span>{" "}
              <span className="font-semibold text-brand-tinta">{next.label}</span>
              {" — previsto "}
              <span className={cn("font-semibold", next.overdue ? "text-red-700" : "text-brand-tinta")}>{formatBR(next.expectedDate)}</span>
              {next.overdue ? <span className="ml-1 font-bold text-red-700">(atrasado)</span> : null}
            </p>
          ) : (
            <p className="text-sm font-semibold text-emerald-700">Caminhada completa — pronto para o encerramento (renovação, manutenção ou alta).</p>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? "Esconder marcos" : "Ver todos os marcos"}
          </Button>
        </div>

        {open ? (
          <div className="mt-3 grid gap-2">
            {(["CHECK", "BIO", "MEDICO"] as const).map((type) => (
              <div key={type} className="flex flex-wrap items-center gap-1.5">
                <span className="w-44 shrink-0 text-xs font-semibold uppercase text-brand-oliva">{milestoneTypeLabels[type]}</span>
                {card.milestones
                  .filter((milestone) => milestone.type === type)
                  .sort((a, b) => a.n - b.n)
                  .map((milestone) => (
                    <MilestoneChip key={milestone.key} milestone={milestone} onToggle={() => onToggle(milestone.key)} readOnly={false} />
                  ))}
              </div>
            ))}
            <p className="text-[11px] leading-4 text-muted-foreground">
              Toque num marco para marcar como feito (ou desfazer). Datas previstas contam a partir da adesão; a agenda oficial continua no Feegow.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
