import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarDays, ExternalLink, Megaphone, Plus, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
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

const pieceFormats = ["REEL", "CARROSSEL", "STORY", "YOUTUBE", "OUTRO"];

const briefingStatusLabels: Record<MarketingBriefing["status"], string> = {
  PENDENTE: "Aguardando IA",
  PROCESSANDO: "IA lendo o briefing…",
  PROCESSADO: "Plano pronto",
  ERRO: "Deu erro",
};

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

export function MarketingPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);

  const [localBriefings, setLocalBriefings] = useState<MarketingBriefing[]>(() => readLocalValue(marketingStorageKey, []));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [uploading, setUploading] = useState(false);
  const [monthRef, setMonthRef] = useState(() => todayISO().slice(0, 7));
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
      // Modo demonstração: cria um plano vazio para montar na mão.
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
      try {
        await updateRemoteMarketingBriefingContent(briefing.id, nextPlan);
        await refresh();
      } catch (error) {
        console.warn("[marketing] salvar plano falhou", error);
        setFeedback("Não consegui salvar a alteração no Supabase. Tente de novo.");
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
      pieces: plan.pieces.map((item) => (item.id === piece.id ? { ...item, status: nextStatus } : item)),
    });
  }

  function removePiece(piece: MarketingPiece) {
    if (!selected || !plan) return;
    if (!window.confirm(`Excluir a peça "${piece.title}" do plano?`)) return;
    void savePlan(selected, { ...plan, pieces: plan.pieces.filter((item) => item.id !== piece.id) });
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
    void savePlan(selected, { ...plan, pieces: [...plan.pieces, piece] });
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
    () => (plan ? [...plan.pieces].sort((a, b) => a.date.localeCompare(b.date)) : []),
    [plan],
  );
  const postedCount = sortedPieces.filter((piece) => piece.status === "POSTADO").length;

  return (
    <AccessGate allowed={canMarketing} label="Marketing">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-brand-musgo" aria-hidden="true" />
            <h1 className="text-3xl text-brand-musgo">Marketing — Briefing do Mês</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Mande a foto ou o documento do briefing e a IA preenche o plano de conteúdo sozinha: cadência, temas da semana e
            calendário de peças. Depois é só marcar o que já foi gravado e postado.
          </p>
        </motion.header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5" aria-hidden="true" /> Enviar briefing
              <InfoTip title="Como funciona">
                Aceita foto (JPG/PNG), PDF ou arquivo de texto. A IA lê o arquivo e monta o plano do mês automaticamente.
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
              Nenhum briefing ainda. Mande o primeiro acima que a IA monta o plano do mês para você.
            </CardContent>
          </Card>
        )}

        {selected ? (
          <div className="space-y-4">
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
                {plan.summary ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Estratégia do mês</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-6 text-muted-foreground">{plan.summary}</CardContent>
                  </Card>
                ) : null}

                {plan.cadence.length > 0 ? (
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

                {plan.weeklyThemes.length > 0 ? (
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

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>Calendário de peças</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {postedCount} de {sortedPieces.length} postadas
                      </span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Toque no status para avançar: A produzir → Gravado → Editado → Postado.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {sortedPieces.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma peça no plano ainda — adicione abaixo.</p>
                    ) : (
                      sortedPieces.map((piece) => (
                        <div
                          key={piece.id}
                          className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-oliva/20 bg-white/70 px-3 py-2"
                        >
                          <span className="w-24 shrink-0 text-xs font-semibold uppercase text-brand-oliva">
                            {formatPieceDate(piece.date)}
                          </span>
                          <Badge className="shrink-0">{piece.format}</Badge>
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
                      ))
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
                </Card>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </AccessGate>
  );
}
