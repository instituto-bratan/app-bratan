import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Film,
  Layers,
  Megaphone,
  MessageCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Youtube,
} from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { useAuth } from "@/hooks/useAuth";
import { canMarketing } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import {
  deleteRemoteMarketingBriefing,
  getRemoteMarketingBriefingUrl,
  invokeRemoteMarketingBriefingParse,
  listRemoteMarketingBriefings,
  updateRemoteMarketingBriefingContent,
  uploadRemoteMarketingBriefing,
  type MarketingBriefing,
  type MarketingPiece,
  type MarketingPlan,
  type MarketingWeek,
} from "@/lib/remoteData";
import { cn } from "@/lib/utils";

const marketingStorageKey = "app-bratan-marketing-briefings";

const pieceStatusOrder: MarketingPiece["status"][] = ["A_PRODUZIR", "GRAVADO", "EDITADO", "POSTADO"];
const pieceStatusLabels: Record<MarketingPiece["status"], string> = {
  A_PRODUZIR: "A produzir",
  GRAVADO: "Gravado",
  EDITADO: "Editado",
  POSTADO: "Postado",
};
const pieceStatusClasses: Record<MarketingPiece["status"], string> = {
  A_PRODUZIR: "border-brand-oliva/30 bg-white text-brand-musgo",
  GRAVADO: "border-amber-300 bg-amber-50 text-amber-800",
  EDITADO: "border-sky-300 bg-sky-50 text-sky-800",
  POSTADO: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

const pieceFormats = ["REEL", "CARROSSEL", "STORY", "YOUTUBE", "TEASER", "OUTRO"];

const briefingStatusLabels: Record<MarketingBriefing["status"], string> = {
  PENDENTE: "Aguardando IA",
  PROCESSANDO: "IA lendo o briefing…",
  PROCESSADO: "Plano pronto",
  ERRO: "Deu erro",
};

// Cor e rótulo por formato — usados na legenda, no calendário e nas peças.
const formatStyles: Record<string, { label: string; chip: string; dot: string; text: string }> = {
  REEL: { label: "Reel", chip: "border-rose-200 bg-rose-50 text-rose-700", dot: "bg-rose-500", text: "text-rose-700" },
  CARROSSEL: { label: "Carrossel", chip: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", text: "text-emerald-700" },
  STORY: { label: "Story", chip: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500", text: "text-amber-700" },
  YOUTUBE: { label: "YouTube", chip: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500", text: "text-red-700" },
  TEASER: { label: "Teaser", chip: "border-violet-200 bg-violet-50 text-violet-700", dot: "bg-violet-500", text: "text-violet-700" },
  OUTRO: { label: "Outro", chip: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-400", text: "text-slate-700" },
};
function fmtStyle(format: string) {
  return formatStyles[(format || "").toUpperCase()] ?? formatStyles.OUTRO;
}

const weekdayShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function firstWeekdayOfMonth(monthRef: string) {
  const parsed = new Date(`${monthRef}-01T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getDay();
}
function daysInMonth(monthRef: string) {
  const [year, month] = monthRef.split("-").map(Number);
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function formatPieceDate(dateISO: string) {
  const parsed = new Date(`${dateISO}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateISO;
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(parsed);
}

function monthLabelFromRef(monthRef: string) {
  const parsed = new Date(`${monthRef}-01T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return monthRef;
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(parsed);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function emptyPlan(monthRef: string): MarketingPlan {
  return { monthRef, monthLabel: monthLabelFromRef(monthRef), summary: "", cadence: [], weeklyThemes: [], pieces: [] };
}

function planIsRich(plan: MarketingPlan | null): boolean {
  if (!plan) return false;
  return Boolean(
    (plan.weeks && plan.weeks.length) ||
      (plan.calendar && plan.calendar.length) ||
      plan.climate ||
      (plan.cadenceHeader && plan.cadenceHeader.length) ||
      (plan.storiesEngine && plan.storiesEngine.length),
  );
}

function WeekCard({ week }: { week: MarketingWeek }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-brand-papel/50"
      >
        <div className="mt-0.5 rounded-lg bg-brand-musgo px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-brand-papel">
          {week.label}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-musgo">{week.theme}</p>
          {week.dateRange ? <p className="text-xs text-brand-oliva">{week.dateRange}</p> : null}
          {week.angle && !open ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{week.angle}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn("mt-1 h-5 w-5 shrink-0 text-brand-oliva transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <CardContent className="space-y-4 border-t border-brand-oliva/15 bg-white/60 pt-4">
          {week.angle ? <p className="text-sm leading-6 text-muted-foreground">{week.angle}</p> : null}
          {week.mediaHook ? (
            <p className="rounded-lg border border-brand-dourado/30 bg-brand-dourado/10 px-3 py-2 text-xs leading-5 text-brand-musgo">
              <span className="font-semibold">Gancho de mídia:</span> {week.mediaHook}
            </p>
          ) : null}

          {week.reels && week.reels.length > 0 ? (
            <section className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-rose-700">
                <Film className="h-4 w-4" aria-hidden="true" /> Reels · alcance
              </p>
              {week.reels.map((reel) => (
                <div key={reel.n} className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
                  <p className="text-sm font-semibold text-brand-musgo">
                    <span className="mr-1.5 text-rose-500">#{reel.n}</span>
                    {reel.title}
                  </p>
                  {reel.description ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{reel.description}</p>
                  ) : null}
                  {reel.cta ? (
                    <p className="mt-1.5 text-xs font-semibold text-rose-700">CTA · {reel.cta}</p>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {week.carrosseis && week.carrosseis.length > 0 ? (
            <section className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
                <Layers className="h-4 w-4" aria-hidden="true" /> Carrosséis · aprofundam
              </p>
              {week.carrosseis.map((carrossel) => (
                <div key={carrossel.n} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                  <p className="text-sm font-semibold text-brand-musgo">
                    <span className="mr-1.5 text-emerald-600">#{carrossel.n}</span>
                    {carrossel.title}
                    {carrossel.telas ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        {carrossel.telas} telas
                      </span>
                    ) : null}
                    {carrossel.tag ? (
                      <span className="ml-2 rounded-full bg-brand-dourado/20 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-musgo">
                        {carrossel.tag}
                      </span>
                    ) : null}
                  </p>
                  {carrossel.roteiro ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{carrossel.roteiro}</p>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {week.youtube ? (
            <section className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-700">
                <Youtube className="h-4 w-4" aria-hidden="true" /> YouTube · autoridade
              </p>
              <div className="rounded-xl border border-red-100 bg-red-50/40 p-3">
                <p className="text-sm font-semibold text-brand-musgo">{week.youtube.title}</p>
                {week.youtube.description ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{week.youtube.description}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {week.stories ? (
            <section className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700">
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> Stories da semana
              </p>
              <p className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 text-xs leading-5 text-muted-foreground">
                {week.stories}
              </p>
            </section>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function MarketingPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);

  const [localBriefings, setLocalBriefings] = useState<MarketingBriefing[]>(() => readLocalValue(marketingStorageKey, []));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [uploading, setUploading] = useState(false);
  const [monthRef, setMonthRef] = useState(() => todayISO().slice(0, 7));
  const [showTracker, setShowTracker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [newPieceDate, setNewPieceDate] = useState(todayISO());
  const [newPieceFormat, setNewPieceFormat] = useState("REEL");
  const [newPieceTitle, setNewPieceTitle] = useState("");

  const briefingsQuery = useQuery({
    queryKey: ["marketing-briefings"],
    queryFn: listRemoteMarketingBriefings,
    enabled: useRemote,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((briefing) => briefing.status === "PENDENTE" || briefing.status === "PROCESSANDO")
        ? 4000
        : false,
  });

  const briefings = useRemote ? briefingsQuery.data ?? [] : localBriefings;
  const selected = briefings.find((briefing) => briefing.id === selectedId) ?? briefings[0] ?? null;
  const plan = selected?.content ?? null;
  const isRich = planIsRich(plan);

  const persistLocal = (next: MarketingBriefing[]) => {
    setLocalBriefings(next);
    writeLocalValue(marketingStorageKey, next);
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["marketing-briefings"] });

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFeedback("Escolha a foto ou o documento do briefing antes de enviar.");
      return;
    }

    if (!useRemote) {
      const id = crypto.randomUUID();
      const briefing: MarketingBriefing = {
        id,
        monthRef,
        sourceFilename: file.name,
        status: "PROCESSADO",
        content: emptyPlan(monthRef),
        createdAt: new Date().toISOString(),
      };
      persistLocal([briefing, ...localBriefings]);
      setSelectedId(id);
      setFeedback("Você está no modo demonstração: a IA só funciona logado. Criei um plano em branco para montar na mão.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const id = await uploadRemoteMarketingBriefing({ pessoa: pessoa!, file, monthRef });
      setSelectedId(id);
      await refresh();
      setFeedback("Briefing enviado! A IA já está lendo e preenchendo o plano — acompanhe o status aqui.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      const result = await invokeRemoteMarketingBriefingParse(id);
      if (result.configured === false) {
        setFeedback(result.error ?? "A chave da IA ainda não foi configurada.");
      } else if (result.ok) {
        setFeedback(`Plano preenchido pela IA: ${result.pieces ?? 0} peças no calendário. Revise e ajuste o que quiser.`);
      } else if (result.error) {
        setFeedback(`A IA não conseguiu ler o briefing: ${result.error}`);
      }
    } catch (error) {
      console.warn("[marketing] upload/IA falhou", error);
      setFeedback(`Não foi possível processar o briefing: ${error instanceof Error ? error.message : "erro inesperado"}`);
    } finally {
      setUploading(false);
      await refresh();
    }
  }

  async function retryParse(briefing: MarketingBriefing) {
    setFeedback("Pedi para a IA tentar de novo…");
    try {
      const result = await invokeRemoteMarketingBriefingParse(briefing.id);
      if (result.ok) setFeedback(`Plano preenchido pela IA: ${result.pieces ?? 0} peças no calendário.`);
      else setFeedback(result.error ?? "A IA não conseguiu processar. Tente outro arquivo.");
    } catch (error) {
      setFeedback(`Falhou de novo: ${error instanceof Error ? error.message : "erro inesperado"}`);
    } finally {
      await refresh();
    }
  }

  async function savePlan(briefing: MarketingBriefing, nextPlan: MarketingPlan) {
    if (useRemote) {
      // Atualização otimista do cache: cliques seguidos ("Adicionar" duas vezes,
      // mudar status de várias peças) passam a ler o plano JÁ atualizado. Antes o
      // cache só mudava depois do refetch, então o 2º clique partia do plano
      // antigo e apagava a alteração do 1º.
      queryClient.setQueryData<MarketingBriefing[]>(["marketing-briefings"], (old) =>
        (old ?? []).map((item) => (item.id === briefing.id ? { ...item, content: nextPlan } : item)),
      );
      try {
        await updateRemoteMarketingBriefingContent(briefing.id, nextPlan);
      } catch (error) {
        console.warn("[marketing] salvar plano falhou", error);
        setFeedback("Não consegui salvar a alteração no Supabase. Tente de novo.");
        await refresh(); // reverte o otimismo para o estado do servidor
      }
      return;
    }
    persistLocal(localBriefings.map((item) => (item.id === briefing.id ? { ...item, content: nextPlan } : item)));
  }

  function cyclePieceStatus(piece: MarketingPiece) {
    if (!selected || !plan) return;
    const nextStatus = pieceStatusOrder[(pieceStatusOrder.indexOf(piece.status) + 1) % pieceStatusOrder.length];
    void savePlan(selected, {
      ...plan,
      pieces: (plan.pieces ?? []).map((item) => (item.id === piece.id ? { ...item, status: nextStatus } : item)),
    });
  }

  function removePiece(piece: MarketingPiece) {
    if (!selected || !plan) return;
    if (!window.confirm(`Excluir a peça "${piece.title}" do plano?`)) return;
    void savePlan(selected, { ...plan, pieces: (plan.pieces ?? []).filter((item) => item.id !== piece.id) });
  }

  function addPiece(event: FormEvent) {
    event.preventDefault();
    if (!selected || !plan) return;
    if (!newPieceTitle.trim()) {
      setFeedback("Dê um título para a nova peça.");
      return;
    }
    const piece: MarketingPiece = {
      id: crypto.randomUUID(),
      date: newPieceDate,
      format: newPieceFormat,
      title: newPieceTitle.trim(),
      status: "A_PRODUZIR",
    };
    void savePlan(selected, { ...plan, pieces: [...(plan.pieces ?? []), piece] });
    setNewPieceTitle("");
  }

  async function removeBriefing(briefing: MarketingBriefing) {
    if (!window.confirm(`Excluir o briefing de ${monthLabelFromRef(briefing.monthRef)} e o plano junto?`)) return;
    if (useRemote) {
      try {
        await deleteRemoteMarketingBriefing(briefing.id, briefing.sourcePath);
        await refresh();
      } catch (error) {
        setFeedback(`Não consegui excluir: ${error instanceof Error ? error.message : "erro inesperado"}`);
        return;
      }
    } else {
      persistLocal(localBriefings.filter((item) => item.id !== briefing.id));
    }
    setSelectedId(null);
    setFeedback("Briefing excluído.");
  }

  async function openOriginal(briefing: MarketingBriefing) {
    if (!briefing.sourcePath || !useRemote) return;
    try {
      const url = await getRemoteMarketingBriefingUrl(briefing.sourcePath);
      window.open(url, "_blank", "noopener");
    } catch {
      setFeedback("Não consegui abrir o arquivo original agora.");
    }
  }

  const sortedPieces = useMemo(
    () => (plan?.pieces ? [...plan.pieces].sort((a, b) => a.date.localeCompare(b.date)) : []),
    [plan],
  );
  const postedCount = sortedPieces.filter((piece) => piece.status === "POSTADO").length;

  // Calendário do mês: mapa dia -> conteúdo, com blancos iniciais alinhados ao dia da semana.
  const calendarGrid = useMemo(() => {
    if (!plan?.calendar || !selected) return null;
    const byDay = new Map(plan.calendar.map((entry) => [entry.day, entry]));
    const total = daysInMonth(selected.monthRef);
    const lead = firstWeekdayOfMonth(selected.monthRef);
    const cells: ({ day: number; entry?: (typeof plan.calendar)[number] } | null)[] = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let day = 1; day <= total; day += 1) cells.push({ day, entry: byDay.get(day) });
    return cells;
  }, [plan, selected]);

  return (
    <AccessGate allowed={canMarketing} label="Marketing">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-brand-musgo" aria-hidden="true" />
            <h1 className="text-3xl text-brand-musgo">Marketing — Briefing do Mês</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            O plano de conteúdo completo do mês numa tela: cadência, o clima do mês, o calendário, o motor de stories e o
            detalhe de cada semana. Todo mês é só me mandar o briefing pelo chat que eu deixo tudo montado aqui.
          </p>
        </motion.header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5" aria-hidden="true" /> Enviar briefing
              <InfoTip title="Como funciona">
                Duas formas: (1) me mande o briefing pelo chat e eu monto o plano completo aqui; (2) envie a foto/PDF abaixo
                para a IA preencher sozinha (precisa da chave configurada).
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="marketing-month">Mês do briefing</Label>
                <Input id="marketing-month" type="month" value={monthRef} onChange={(event) => setMonthRef(event.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="marketing-file">Foto ou documento</Label>
                <Input id="marketing-file" ref={fileInputRef} type="file" accept="image/*,application/pdf,.txt,.md,.html" />
              </div>
              <LiquidButton type="submit" disabled={uploading} className="sm:mb-0.5">
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                {uploading ? "Enviando…" : "Preencher com IA"}
              </LiquidButton>
            </form>
            {feedback ? <p className="mt-3 text-sm font-medium text-brand-musgo">{feedback}</p> : null}
          </CardContent>
        </Card>

        {briefings.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {briefings.map((briefing) => (
              <button
                key={briefing.id}
                type="button"
                onClick={() => setSelectedId(briefing.id)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition",
                  selected?.id === briefing.id
                    ? "border-brand-musgo bg-brand-musgo text-brand-papel"
                    : "border-brand-oliva/30 bg-white text-brand-musgo hover:border-brand-musgo/50",
                )}
              >
                {monthLabelFromRef(briefing.monthRef)}
                <span className="ml-2 text-xs font-normal opacity-80">{briefingStatusLabels[briefing.status]}</span>
              </button>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Nenhum briefing ainda. Me mande o briefing do mês pelo chat que eu monto o plano completo aqui, ou envie a
              foto/PDF acima para a IA preencher.
            </CardContent>
          </Card>
        )}

        {selected ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="gold">{monthLabelFromRef(selected.monthRef)}</Badge>
              <Badge
                className={cn(
                  selected.status === "PROCESSADO" && "border-emerald-300 bg-emerald-50 text-emerald-800",
                  selected.status === "ERRO" && "border-red-300 bg-red-50 text-red-700",
                )}
              >
                {briefingStatusLabels[selected.status]}
              </Badge>
              {selected.sourcePath && useRemote ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void openOriginal(selected)}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Ver briefing original
                </Button>
              ) : null}
              {selected.status === "ERRO" && useRemote ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void retryParse(selected)}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Tentar com a IA de novo
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => void removeBriefing(selected)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Excluir
              </Button>
            </div>

            {selected.status === "ERRO" && selected.errorDetail ? (
              <Card className="border-red-200 bg-red-50/60">
                <CardContent className="p-4 text-sm text-red-700">{selected.errorDetail}</CardContent>
              </Card>
            ) : null}

            {(selected.status === "PENDENTE" || selected.status === "PROCESSANDO") && useRemote ? (
              <Card>
                <CardContent className="flex items-center gap-3 p-5 text-sm font-medium text-brand-musgo">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-dourado motion-safe:animate-pulse" aria-hidden="true" />
                  A IA está lendo o briefing e montando o plano. Isso leva menos de um minuto — a tela atualiza sozinha.
                </CardContent>
              </Card>
            ) : null}

            {plan ? (
              <>
                {/* Título / subtítulo do briefing */}
                {plan.title || plan.subtitle ? (
                  <div className="rounded-2xl border border-brand-oliva/20 bg-gradient-to-br from-brand-musgo to-brand-oliva px-5 py-6 text-brand-papel shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-papel/70">
                      Instituto Bratan · Motor de Autoridade
                    </p>
                    {plan.title ? <h2 className="mt-1 text-2xl font-semibold">{plan.title}</h2> : null}
                    {plan.subtitle ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-brand-papel/85">{plan.subtitle}</p> : null}
                  </div>
                ) : null}

                {/* Cadência (destaques do topo) */}
                {plan.cadenceHeader && plan.cadenceHeader.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {plan.cadenceHeader.map((item, index) => (
                      <Card key={`${item.format}-${index}`} className="border-brand-oliva/20">
                        <CardContent className="p-4">
                          <p className="text-2xl font-bold text-brand-musgo">{item.target}</p>
                          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-brand-oliva">{item.format}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : null}

                {/* Como usar */}
                {plan.howToUse ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Como usar este briefing</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-6 text-muted-foreground">{plan.howToUse}</CardContent>
                  </Card>
                ) : null}

                {/* Clima do mês + âncoras de notícia */}
                {plan.climate ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">O clima do mês — por que estes temas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {plan.climate.intro ? (
                        <p className="text-sm leading-6 text-muted-foreground">{plan.climate.intro}</p>
                      ) : null}
                      {plan.climate.anchors.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {plan.climate.anchors.map((anchor, index) => (
                            <div key={index} className="rounded-xl border border-brand-oliva/20 bg-white/70 p-3">
                              <p className="text-sm font-semibold text-brand-musgo">{anchor.title}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{anchor.description}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}

                {/* Cadência do mês (totais) + legenda */}
                {(plan.cadenceTotals && plan.cadenceTotals.length > 0) || (plan.legend && plan.legend.length > 0) ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">A cadência do mês</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {plan.cadenceTotals && plan.cadenceTotals.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                          {plan.cadenceTotals.map((total, index) => (
                            <div key={index} className="rounded-xl border border-brand-oliva/20 bg-brand-papel/60 p-3 text-center">
                              <p className="text-xl font-bold text-brand-musgo">{total.count}</p>
                              <p className="text-xs font-semibold text-brand-oliva">{total.format}</p>
                              {total.detail ? <p className="mt-0.5 text-[11px] text-muted-foreground">{total.detail}</p> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {plan.legend && plan.legend.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {plan.legend.map((item, index) => {
                            const style = fmtStyle(item.format);
                            return (
                              <span
                                key={index}
                                className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold", style.chip)}
                              >
                                <span className={cn("h-2 w-2 rounded-full", style.dot)} aria-hidden="true" />
                                {item.format} · {item.role}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}

                {/* Calendário do mês */}
                {calendarGrid ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CalendarDays className="h-4 w-4" aria-hidden="true" /> Calendário de {monthLabelFromRef(selected.monthRef)}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        O mês inteiro numa tela. Stories rodam todos os dias pelo motor de 8 blocos. Deslize para o lado no
                        celular.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <div className="min-w-[640px]">
                          <div className="mb-1 grid grid-cols-7 gap-1.5">
                            {weekdayShort.map((weekday) => (
                              <div key={weekday} className="text-center text-[11px] font-bold uppercase tracking-wide text-brand-oliva">
                                {weekday}
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1.5">
                            {calendarGrid.map((cell, index) => {
                              if (!cell) return <div key={`blank-${index}`} className="min-h-[92px] rounded-lg" />;
                              const entry = cell.entry;
                              return (
                                <div
                                  key={cell.day}
                                  className={cn(
                                    "min-h-[92px] rounded-lg border p-1.5",
                                    entry?.rest
                                      ? "border-dashed border-brand-oliva/30 bg-brand-papel/40"
                                      : "border-brand-oliva/20 bg-white/70",
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-brand-musgo">{cell.day}</span>
                                    {entry?.week ? (
                                      <span className="rounded bg-brand-musgo px-1 py-0.5 text-[9px] font-bold text-brand-papel">
                                        {entry.week}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 space-y-1">
                                    {entry?.rest ? (
                                      <p className="text-[10px] font-semibold text-brand-oliva">Descanso</p>
                                    ) : null}
                                    {(entry?.items ?? []).map((item, itemIndex) => {
                                      const style = fmtStyle(item.format);
                                      return (
                                        <div
                                          key={itemIndex}
                                          className={cn("rounded border px-1 py-0.5 text-[10px] font-medium leading-tight", style.chip)}
                                        >
                                          {item.title}
                                        </div>
                                      );
                                    })}
                                    <p className="text-[9px] italic text-brand-oliva/70">◦ stories</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Motor de stories */}
                {plan.storiesEngine && plan.storiesEngine.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <MessageCircle className="h-4 w-4" aria-hidden="true" /> Motor de Stories — até 8 por dia
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Sequência fixa reutilizável todo dia. Seg–sex rodam os 8 blocos; fim de semana, versão leve (1, 3, 5 e 8).
                      </p>
                    </CardHeader>
                    <CardContent className="grid gap-2 sm:grid-cols-2">
                      {plan.storiesEngine.map((block) => (
                        <div key={block.n} className="flex gap-3 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                            {block.n}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-brand-musgo">{block.title}</p>
                            <p className="text-xs leading-5 text-muted-foreground">{block.description}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}

                {/* Semanas */}
                {plan.weeks && plan.weeks.length > 0 ? (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-brand-musgo">Detalhe por semana</h2>
                      <span className="text-xs text-muted-foreground">toque para abrir cada semana</span>
                    </div>
                    {plan.weeks.map((week) => (
                      <WeekCard key={week.id} week={week} />
                    ))}
                  </section>
                ) : null}

                {/* Como produzir */}
                {plan.production && plan.production.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Como produzir sem sobrecarregar o Dr. Daniel</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      {plan.production.map((note, index) => (
                        <div key={index} className="rounded-xl border border-brand-oliva/20 bg-white/70 p-3">
                          <p className="text-sm font-semibold text-brand-musgo">{note.title}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{note.description}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}

                {/* Fallback: plano simples (IA antiga) — só quando não é rico */}
                {!isRich && plan.summary ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Estratégia do mês</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-6 text-muted-foreground">{plan.summary}</CardContent>
                  </Card>
                ) : null}
                {!isRich && plan.cadence && plan.cadence.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {plan.cadence.map((item, index) => (
                      <Card key={`${item.format}-${index}`}>
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-brand-oliva">{item.format}</p>
                          <p className="mt-1 text-sm font-semibold text-brand-musgo">{item.target}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : null}
                {!isRich && plan.weeklyThemes && plan.weeklyThemes.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CalendarDays className="h-4 w-4" aria-hidden="true" /> Temas da semana
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      {plan.weeklyThemes
                        .slice()
                        .sort((a, b) => a.week - b.week)
                        .map((theme) => (
                          <div key={theme.week} className="rounded-xl border border-brand-oliva/20 bg-white/70 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-brand-oliva">Semana {theme.week}</p>
                            <p className="mt-1 text-sm font-semibold text-brand-musgo">{theme.theme}</p>
                            {theme.notes ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{theme.notes}</p> : null}
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                ) : null}

                {/* Acompanhar produção (peças com status) */}
                <Card>
                  <CardHeader className="pb-2">
                    <button
                      type="button"
                      onClick={() => setShowTracker((value) => !value)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <CardTitle className="text-base">
                        Acompanhar produção
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {postedCount} de {sortedPieces.length} postadas
                        </span>
                      </CardTitle>
                      <ChevronDown className={cn("h-5 w-5 text-brand-oliva transition-transform", showTracker && "rotate-180")} aria-hidden="true" />
                    </button>
                    {showTracker ? (
                      <p className="text-xs text-muted-foreground">
                        Marque cada peça conforme avança: A produzir → Gravado → Editado → Postado. Toque no status para mudar.
                      </p>
                    ) : null}
                  </CardHeader>
                  {showTracker ? (
                    <CardContent className="space-y-2">
                      {sortedPieces.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma peça no acompanhamento ainda — adicione abaixo.</p>
                      ) : (
                        sortedPieces.map((piece) => {
                          const style = fmtStyle(piece.format);
                          return (
                            <div
                              key={piece.id}
                              className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-oliva/20 bg-white/70 px-3 py-2"
                            >
                              <span className="w-24 shrink-0 text-xs font-semibold uppercase text-brand-oliva">
                                {formatPieceDate(piece.date)}
                              </span>
                              <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", style.chip)}>
                                {style.label}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-brand-musgo">{piece.title}</p>
                                {piece.notes ? <p className="text-xs leading-5 text-muted-foreground">{piece.notes}</p> : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => cyclePieceStatus(piece)}
                                className={cn(
                                  "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition hover:opacity-80",
                                  pieceStatusClasses[piece.status],
                                )}
                              >
                                {pieceStatusLabels[piece.status]}
                              </button>
                              <button
                                type="button"
                                onClick={() => removePiece(piece)}
                                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                                aria-label={`Excluir ${piece.title}`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          );
                        })
                      )}

                      <form onSubmit={addPiece} className="mt-3 grid gap-2 rounded-xl border border-dashed border-brand-oliva/30 p-3 sm:grid-cols-[140px_140px_1fr_auto] sm:items-end">
                        <div className="space-y-1">
                          <Label htmlFor="piece-date">Data</Label>
                          <Input id="piece-date" type="date" value={newPieceDate} onChange={(event) => setNewPieceDate(event.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="piece-format">Formato</Label>
                          <select
                            id="piece-format"
                            value={newPieceFormat}
                            onChange={(event) => setNewPieceFormat(event.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                          >
                            {pieceFormats.map((format) => (
                              <option key={format} value={format}>
                                {format}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="piece-title">Título da peça</Label>
                          <Input
                            id="piece-title"
                            value={newPieceTitle}
                            onChange={(event) => setNewPieceTitle(event.target.value)}
                            placeholder="Ex.: Carrossel — mitos do GLP-1"
                          />
                        </div>
                        <Button type="submit" variant="outline">
                          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Adicionar
                        </Button>
                      </form>
                    </CardContent>
                  ) : null}
                </Card>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </AccessGate>
  );
}
