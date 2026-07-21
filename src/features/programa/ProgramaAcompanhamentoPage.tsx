import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ClipboardCheck, Copy, HeartPulse, Plus, Stethoscope, UserPlus, XCircle } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  contactDisplayName,
  crmModuleRoutes,
  notClosedRecently,
  programPhaseLabels,
  type CrmAdhesionChannel,
  type CrmProgramPhase,
} from "@/features/crm/crmData";
import { useCrmState } from "@/features/crm/useCrmState";
import {
  buildNutriShareText,
  buildProgramaBoard,
  enrollPatientInProgram,
  milestoneResponsible,
  milestoneTypeLabels,
  patientsNotInProgram,
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
  { value: "CLUBE_BRATAN", label: "Clube Bratan" },
  { value: "SOMENTE_TRATAMENTO", label: "Somente Tratamento" },
];

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
  const hoje = todayISO();
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<CrmProgramPhase | "TODAS">("TODAS");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [days, setDays] = useState(7);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const board = useMemo(() => buildProgramaBoard(state, hoje), [state, hoje]);
  const notClosed = useMemo(() => notClosedRecently(state, hoje, days), [state, hoje, days]);

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

  const phasesInUse = useMemo(() => [...new Set(board.map((card) => card.phase))], [board]);

  function toggle(dealId: string, key: string) {
    void persist((current) => toggleProgramMilestone(current, dealId, key));
  }

  async function copyForNutri() {
    const text = buildNutriShareText(filtered, hoje);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Controle copiado — é só colar no WhatsApp da Assistente de Performance.");
    } catch {
      setCopyFeedback("Não consegui copiar automático — tente de novo.");
    }
    window.setTimeout(() => setCopyFeedback(""), 6000);
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
    <AccessGate allowed={canAcompanhamento} label="Acompanhamento">
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
              <div className={cn("rounded-xl border px-4 py-2 text-center", totals.atrasados ? "border-red-200 bg-red-50/70" : "border-brand-oliva/20 bg-white/60")}>
                <p className={cn("text-[11px] font-semibold uppercase", totals.atrasados ? "text-red-700" : "text-brand-oliva")}>Com atraso</p>
                <p className={cn("text-xl font-bold", totals.atrasados ? "text-red-700" : "text-brand-musgo")}>{totals.atrasados}</p>
              </div>
            </div>
          </div>
        </motion.section>

        {copyFeedback ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-dourado/35 bg-brand-creme/60 px-4 py-3 text-sm font-semibold text-brand-tinta">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-musgo" aria-hidden="true" />
            {copyFeedback}
          </div>
        ) : null}

        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-oliva/15 bg-white/50 p-2.5 backdrop-blur-xl">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar paciente" className="h-10 w-full sm:w-56" aria-label="Buscar paciente" />
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
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copyForNutri()}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copiar controle p/ Performance
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
          <div className="grid gap-4">
            {filtered.map((card) => (
              <PatientCard key={card.dealId} card={card} onToggle={(key) => toggle(card.dealId, key)} />
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

        {/* Não fecharam na semana — a lista que vai para a Assistente de Performance */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
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
          <CardContent className="space-y-2">
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
            <p className="mt-1 text-xs text-muted-foreground">Mês {card.monthOfProgram}/6 · adesão {formatBR(card.startedAt)}</p>
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
              <span className="ml-1 text-xs text-muted-foreground">· {milestoneResponsible[next.type]}</span>
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
      </CardContent>
    </Card>
  );
}
