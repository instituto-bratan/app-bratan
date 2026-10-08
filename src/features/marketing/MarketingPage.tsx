import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Film,
  Layers,
  MessageCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Youtube,
} from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { AvisoSoVe, avisarSoVe, useNivelDaTela } from "@/hooks/useNivelDaTela";
import { InfoTip } from "@/components/ui/info-tip";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, FraseDoFluxo, Giro, MarcasDeEtapa } from "@/components/ui/fundacao";
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
import { confirmar } from "@/components/ui/avisos";
import {
  Aviso,
  CampoSelecao,
  Etiqueta,
  GrupoDeLeituras,
  Input,
  Label,
  Leitura,
  RUBRICA,
  TITULO_SECAO,
  type TomEtiqueta,
} from "@/features/crm/comercialVisual";

const marketingStorageKey = "app-bratan-marketing-briefings";

const pieceStatusOrder: MarketingPiece["status"][] = ["A_PRODUZIR", "GRAVADO", "EDITADO", "POSTADO"];
const pieceStatusLabels: Record<MarketingPiece["status"], string> = {
  A_PRODUZIR: "A produzir",
  GRAVADO: "Gravado",
  EDITADO: "Editado",
  POSTADO: "Postado",
};
// O status da peça é uma trilha de quatro etapas (08/10/2026): a mesma linguagem
// das marcas do selo — cheia = feita, vazada = é a vez, apagada = ainda não.
// Postado fecha a trilha (as quatro cheias) e ganha o verde de "deu certo".
const pieceStatusEtapas: Record<MarketingPiece["status"], number> = { A_PRODUZIR: 0, GRAVADO: 1, EDITADO: 2, POSTADO: 4 };

const pieceFormats = ["REEL", "CARROSSEL", "STORY", "YOUTUBE", "TEASER", "OUTRO"];

const briefingStatusLabels: Record<MarketingBriefing["status"], string> = {
  PENDENTE: "Aguardando IA",
  PROCESSANDO: "IA lendo o briefing…",
  PROCESSADO: "Plano pronto",
  ERRO: "Deu erro",
};
const briefingStatusTom: Record<MarketingBriefing["status"], TomEtiqueta> = {
  PENDENTE: "neutro",
  PROCESSANDO: "neutro",
  PROCESSADO: "ok",
  ERRO: "erro",
};

// Cor e rótulo por formato — usados na legenda, no calendário e nas peças.
// Papel & Musgo (08/10/2026): a cor do formato vira só um ponto/traço ao lado da
// palavra (o fundo das etiquetas é neutro). Vermelho, verde e laranja cheios
// ficam para situação (erro, deu certo, atenção), não para tipo de peça.
const formatStyles: Record<string, { label: string; dot: string; barra: string }> = {
  REEL: { label: "Reel", dot: "bg-erro", barra: "shadow-[inset_3px_0_0_rgb(var(--erro-rgb))]" },
  CARROSSEL: { label: "Carrossel", dot: "bg-ok", barra: "shadow-[inset_3px_0_0_rgb(var(--ok-rgb))]" },
  STORY: { label: "Story", dot: "bg-atencao", barra: "shadow-[inset_3px_0_0_rgb(var(--atencao-rgb))]" },
  YOUTUBE: { label: "YouTube", dot: "bg-erro", barra: "shadow-[inset_3px_0_0_rgb(var(--erro-rgb))]" },
  TEASER: { label: "Teaser", dot: "bg-musgo", barra: "shadow-[inset_3px_0_0_rgb(var(--musgo-rgb))]" },
  OUTRO: { label: "Outro", dot: "bg-tinta-2", barra: "shadow-[inset_3px_0_0_rgb(var(--tinta-2-rgb))]" },
};
function fmtStyle(format: string) {
  return formatStyles[(format || "").toUpperCase()] ?? formatStyles.OUTRO;
}

/** A etiqueta do formato: fundo neutro, ponto na cor do formato e a palavra. */
function EtiquetaDoFormato({ format, children }: { format: string; children?: ReactNode }) {
  const style = fmtStyle(format);
  return (
    <span className="inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-controle bg-saber px-2 text-xs font-bold leading-5 text-tinta">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
      {children ?? style.label}
    </span>
  );
}

/** Rubrica de seção dentro da semana (Reels · alcance), com o ponto do formato. */
function RubricaDoFormato({ format, icone, children }: { format: string; icone: ReactNode; children: ReactNode }) {
  const style = fmtStyle(format);
  return (
    <p className="flex items-center gap-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
      <span className="text-oliva [&>svg]:h-4 [&>svg]:w-4">{icone}</span>
      {children}
    </p>
  );
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

/** Uma semana do plano: linha que abre (dentro da folha "Detalhe por semana"). */
function WeekCard({ week }: { week: MarketingWeek }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="[&+&]:border-t [&+&]:border-fio">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors duration-150 ease-papel hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco max-md:px-4"
      >
        <Etiqueta tom="musgo" className="mt-0.5 uppercase tracking-[0.04em]">
          {week.label}
        </Etiqueta>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-5 text-tinta">{week.theme}</p>
          {week.dateRange ? <p className="text-[13px] font-medium leading-5 tabular-nums text-tinta-2">{week.dateRange}</p> : null}
          {week.angle && !open ? (
            <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-5 text-tinta-2">{week.angle}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn("mt-0.5 h-5 w-5 shrink-0 text-tinta-2 transition-transform duration-150 ease-papel", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="grid gap-5 border-t border-fio bg-papel px-5 py-5 max-md:px-4">
          {week.angle ? <p className="text-sm font-medium leading-6 text-tinta-2">{week.angle}</p> : null}
          {week.mediaHook ? (
            <p className="rounded-bloco bg-saber px-3 py-2 text-[13px] font-medium leading-5 text-tinta">
              <span className="font-bold">Gancho de mídia:</span> {week.mediaHook}
            </p>
          ) : null}

          {week.reels && week.reels.length > 0 ? (
            <section className="grid gap-2">
              <RubricaDoFormato format="REEL" icone={<Film aria-hidden="true" />}>Reels · alcance</RubricaDoFormato>
              {week.reels.map((reel) => (
                <div key={reel.n} className={cn("rounded-bloco bg-folha p-3 pl-4", fmtStyle("REEL").barra)}>
                  <p className="text-sm font-bold leading-5 text-tinta">
                    <span className="mr-1.5 tabular-nums text-tinta-2">#{reel.n}</span>
                    {reel.title}
                  </p>
                  {reel.description ? (
                    <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{reel.description}</p>
                  ) : null}
                  {reel.cta ? (
                    <p className="mt-1.5 text-xs font-bold text-tinta">CTA · {reel.cta}</p>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {week.carrosseis && week.carrosseis.length > 0 ? (
            <section className="grid gap-2">
              <RubricaDoFormato format="CARROSSEL" icone={<Layers aria-hidden="true" />}>Carrosséis · aprofundam</RubricaDoFormato>
              {week.carrosseis.map((carrossel) => (
                <div key={carrossel.n} className={cn("rounded-bloco bg-folha p-3 pl-4", fmtStyle("CARROSSEL").barra)}>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold leading-5 text-tinta">
                    <span>
                      <span className="mr-1.5 tabular-nums text-tinta-2">#{carrossel.n}</span>
                      {carrossel.title}
                    </span>
                    {carrossel.telas ? <Etiqueta>{carrossel.telas} telas</Etiqueta> : null}
                    {carrossel.tag ? <Etiqueta tom="musgo" className="uppercase">{carrossel.tag}</Etiqueta> : null}
                  </p>
                  {carrossel.roteiro ? (
                    <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{carrossel.roteiro}</p>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {week.youtube ? (
            <section className="grid gap-2">
              <RubricaDoFormato format="YOUTUBE" icone={<Youtube aria-hidden="true" />}>YouTube · autoridade</RubricaDoFormato>
              <div className={cn("rounded-bloco bg-folha p-3 pl-4", fmtStyle("YOUTUBE").barra)}>
                <p className="text-sm font-bold leading-5 text-tinta">{week.youtube.title}</p>
                {week.youtube.description ? (
                  <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{week.youtube.description}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {week.stories ? (
            <section className="grid gap-2">
              <RubricaDoFormato format="STORY" icone={<MessageCircle aria-hidden="true" />}>Stories da semana</RubricaDoFormato>
              <p className={cn("rounded-bloco bg-folha p-3 pl-4 text-[13px] font-medium leading-5 text-tinta-2", fmtStyle("STORY").barra)}>
                {week.stories}
              </p>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MarketingPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  // "Só vê" (29/09/2026, auditoria B9): sem EDITAR no Marketing, não envia, não muda nem exclui.
  const telaMkt = useNivelDaTela("marketing");
  const semEdicao = !telaMkt.podeEditar;

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
    if (semEdicao) return avisarSoVe();
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
    if (semEdicao) return avisarSoVe();
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
    if (semEdicao) return avisarSoVe();
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

  async function removePiece(piece: MarketingPiece) {
    if (!selected || !plan) return;
    if (!(await confirmar(`Excluir a peça "${piece.title}" do plano?`, { destrutivo: true, confirmar: "Excluir" }))) return;
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
    if (semEdicao) return avisarSoVe();
    if (!(await confirmar(`Excluir o briefing de ${monthLabelFromRef(briefing.monthRef)}?`, { corpo: "O plano do mês vai junto.", destrutivo: true, confirmar: "Excluir" }))) return;
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

  // CABEÇALHO (08/10/2026, redesenho etapa 3): um cabeçalho só, com o mês aberto
  // e a produção numa frase; o envio do briefing e o acompanhamento das peças
  // moram em folhas (é onde se age); o plano (clima, cadência, calendário,
  // stories, semanas) é leitura, em blocos "para saber". Sem degradê e sem
  // cartões coloridos: a cor do formato virou um ponto ao lado da palavra.
  const fraseDoTopo = selected ? (
    <>
      <strong>{monthLabelFromRef(selected.monthRef)}</strong>:{" "}
      {sortedPieces.length === 0
        ? "nenhuma peça no acompanhamento ainda."
        : `${postedCount} de ${sortedPieces.length} ${sortedPieces.length === 1 ? "peça postada" : "peças postadas"}.`}
      {selected.status === "ERRO" ? <span className="alerta"> A IA não conseguiu ler este briefing.</span> : null}
    </>
  ) : (
    <>
      <strong>Nenhum briefing ainda.</strong> Envie o do mês abaixo ou mande pelo chat.
    </>
  );

  return (
    <AccessGate allowed={canMarketing} label="Marketing" module="marketing">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 font-sans max-md:gap-4">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Comercial · Marketing"
          titulo="Briefing do mês"
          frase={fraseDoTopo}
          rodape={
            <FraseDoFluxo>
              O plano de conteúdo completo do mês numa tela: cadência, o clima do mês, o calendário, o motor de stories e o
              detalhe de cada semana. Todo mês é só me mandar o briefing pelo chat que eu deixo tudo montado aqui.
            </FraseDoFluxo>
          }
        />

        <AvisoSoVe soVe={telaMkt.soVe} />

        <BlocoFolha as="section" respiro aria-labelledby="marketing-enviar">
          <h2 id="marketing-enviar" className={cn(TITULO_SECAO, "flex items-center gap-2")}>
            <Upload className="h-4 w-4 text-oliva" aria-hidden="true" /> Enviar briefing
            <InfoTip title="Como funciona">
              Duas formas: (1) me mande o briefing pelo chat e eu monto o plano completo aqui; (2) envie a foto/PDF abaixo
              para a IA preencher sozinha (precisa da chave configurada).
            </InfoTip>
          </h2>
          <form onSubmit={handleUpload} className="mt-4 grid gap-3 sm:grid-cols-[176px_1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="marketing-month">Mês do briefing</Label>
              <Input id="marketing-month" type="month" value={monthRef} onChange={(event) => setMonthRef(event.target.value)} required />
            </div>
            <div className="min-w-0">
              <Label htmlFor="marketing-file">Foto ou documento</Label>
              <Input
                id="marketing-file"
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.txt,.md,.html"
                className="cursor-pointer py-0 pl-1 leading-[38px] file:mr-3 file:h-8 file:cursor-pointer file:rounded-controle file:border file:border-solid file:border-fio-2 file:bg-papel file:px-3 file:font-sans file:text-[13px] file:font-bold file:text-tinta hover:file:border-borda-campo"
              />
            </div>
            <Botao variante="primario" type="submit" disabled={uploading || semEdicao} carregando={uploading} icone={<Sparkles className="h-4 w-4" aria-hidden="true" />}>
              {uploading ? "Enviando…" : "Preencher com IA"}
            </Botao>
          </form>
          {feedback ? (
            <Aviso tom="info" className="mt-4">
              {feedback}
            </Aviso>
          ) : null}
        </BlocoFolha>

        {briefings.length > 0 ? (
          <GrupoDeLeituras rotulo="Briefings por mês">
            {briefings.map((briefing) => (
              <Leitura key={briefing.id} ativa={selected?.id === briefing.id} onClick={() => setSelectedId(briefing.id)}>
                {monthLabelFromRef(briefing.monthRef)}
                <span className="font-medium text-tinta-2">· {briefingStatusLabels[briefing.status]}</span>
              </Leitura>
            ))}
          </GrupoDeLeituras>
        ) : (
          <BlocoSaber className="py-4">
            <p className="text-sm font-medium leading-6 text-tinta-2">
              Nenhum briefing ainda. Me mande o briefing do mês pelo chat que eu monto o plano completo aqui, ou envie a
              foto/PDF acima para a IA preencher.
            </p>
          </BlocoSaber>
        )}

        {selected ? (
          <div className="grid gap-6 max-md:gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Etiqueta tom="musgo">{monthLabelFromRef(selected.monthRef)}</Etiqueta>
              <Etiqueta tom={briefingStatusTom[selected.status]}>{briefingStatusLabels[selected.status]}</Etiqueta>
              <span className="ml-auto flex flex-wrap items-center gap-2 max-md:ml-0">
                {selected.sourcePath && useRemote ? (
                  <Botao tamanho="pq" onClick={() => void openOriginal(selected)} icone={<ExternalLink className="h-4 w-4" aria-hidden="true" />}>
                    Ver briefing original
                  </Botao>
                ) : null}
                {selected.status === "ERRO" && useRemote ? (
                  <Botao tamanho="pq" disabled={semEdicao} onClick={() => void retryParse(selected)} icone={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
                    Tentar com a IA de novo
                  </Botao>
                ) : null}
                <Botao variante="perigo" tamanho="pq" disabled={semEdicao} onClick={() => void removeBriefing(selected)} icone={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
                  Excluir
                </Botao>
              </span>
            </div>

            {selected.status === "ERRO" && selected.errorDetail ? <Aviso tom="erro">{selected.errorDetail}</Aviso> : null}

            {(selected.status === "PENDENTE" || selected.status === "PROCESSANDO") && useRemote ? (
              <Aviso tom="info" icone={<Giro className="text-musgo" />}>
                A IA está lendo o briefing e montando o plano. Isso leva menos de um minuto — a tela atualiza sozinha.
              </Aviso>
            ) : null}

            {plan ? (
              <>
                {/* Título / subtítulo do briefing */}
                {plan.title || plan.subtitle ? (
                  <BlocoSaber as="section" aria-label="Capa do briefing">
                    <p className={RUBRICA}>Instituto Bratan · Motor de Autoridade</p>
                    {plan.title ? <h2 className="mt-2 text-xl font-bold leading-7 text-tinta [text-wrap:balance]">{plan.title}</h2> : null}
                    {plan.subtitle ? <p className="mt-1.5 max-w-3xl text-sm font-medium leading-6 text-tinta-2">{plan.subtitle}</p> : null}
                  </BlocoSaber>
                ) : null}

                {/* Cadência (destaques do topo) */}
                {plan.cadenceHeader && plan.cadenceHeader.length > 0 ? (
                  <BlocoSaber as="section" aria-label="Cadência do briefing">
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
                      {plan.cadenceHeader.map((item, index) => (
                        <div key={`${item.format}-${index}`} className="min-w-0">
                          <dt className={RUBRICA}>{item.format}</dt>
                          <dd className="mt-2 font-serifa text-[28px] font-normal leading-9 text-tinta [font-variant-numeric:lining-nums_tabular-nums]">{item.target}</dd>
                        </div>
                      ))}
                    </dl>
                  </BlocoSaber>
                ) : null}

                {/* Como usar */}
                {plan.howToUse ? (
                  <BlocoSaber as="section" aria-labelledby="marketing-como-usar">
                    <h2 id="marketing-como-usar" className={TITULO_SECAO}>Como usar este briefing</h2>
                    <p className="mt-2 text-sm font-medium leading-6 text-tinta-2">{plan.howToUse}</p>
                  </BlocoSaber>
                ) : null}

                {/* Clima do mês + âncoras de notícia */}
                {plan.climate ? (
                  <BlocoSaber as="section" aria-labelledby="marketing-clima" className="grid gap-3">
                    <h2 id="marketing-clima" className={TITULO_SECAO}>O clima do mês — por que estes temas</h2>
                    {plan.climate.intro ? <p className="text-sm font-medium leading-6 text-tinta-2">{plan.climate.intro}</p> : null}
                    {plan.climate.anchors.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {plan.climate.anchors.map((anchor, index) => (
                          <div key={index} className="rounded-bloco bg-folha p-4">
                            <p className="text-sm font-bold leading-5 text-tinta">{anchor.title}</p>
                            <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{anchor.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </BlocoSaber>
                ) : null}

                {/* Cadência do mês (totais) + legenda */}
                {(plan.cadenceTotals && plan.cadenceTotals.length > 0) || (plan.legend && plan.legend.length > 0) ? (
                  <BlocoSaber as="section" aria-labelledby="marketing-cadencia" className="grid gap-4">
                    <h2 id="marketing-cadencia" className={TITULO_SECAO}>A cadência do mês</h2>
                    {plan.cadenceTotals && plan.cadenceTotals.length > 0 ? (
                      <dl className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
                        {plan.cadenceTotals.map((total, index) => (
                          <div key={index} className="min-w-0">
                            <dt className={RUBRICA}>{total.format}</dt>
                            <dd className="mt-2 font-serifa text-[32px] font-normal leading-10 text-tinta [font-variant-numeric:lining-nums_tabular-nums]">{total.count}</dd>
                            {total.detail ? <dd className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{total.detail}</dd> : null}
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {plan.legend && plan.legend.length > 0 ? (
                      <div className="flex flex-wrap gap-2 border-t border-fio pt-4">
                        {plan.legend.map((item, index) => (
                          <EtiquetaDoFormato key={index} format={item.format}>
                            {item.format} · {item.role}
                          </EtiquetaDoFormato>
                        ))}
                      </div>
                    ) : null}
                  </BlocoSaber>
                ) : null}

                {/* Calendário do mês */}
                {calendarGrid ? (
                  <BlocoSaber as="section" aria-labelledby="marketing-calendario" className="grid gap-4">
                    <div>
                      <h2 id="marketing-calendario" className={cn(TITULO_SECAO, "flex items-center gap-2")}>
                        <CalendarDays className="h-4 w-4 text-oliva" aria-hidden="true" /> Calendário de {monthLabelFromRef(selected.monthRef)}
                      </h2>
                      <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
                        O mês inteiro numa tela. Stories rodam todos os dias pelo motor de 8 blocos. Deslize para o lado no
                        celular.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="min-w-[700px]">
                        <div className="mb-2 grid grid-cols-7 gap-2">
                          {weekdayShort.map((weekday) => (
                            <div key={weekday} className="text-center text-xs font-bold uppercase tracking-[0.06em] text-tinta-2">
                              {weekday}
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-2">
                          {calendarGrid.map((cell, index) => {
                            if (!cell) return <div key={`blank-${index}`} className="min-h-[96px]" />;
                            const entry = cell.entry;
                            return (
                              <div
                                key={cell.day}
                                className={cn(
                                  "min-h-[96px] rounded-bloco p-2",
                                  entry?.rest ? "bg-transparent shadow-[inset_0_0_0_1px_rgb(var(--fio-2-rgb))]" : "bg-folha",
                                )}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-serifa text-base leading-5 text-tinta [font-variant-numeric:lining-nums_tabular-nums]">{cell.day}</span>
                                  {entry?.week ? <Etiqueta tom="musgo" className="h-auto px-1.5 leading-4">{entry.week}</Etiqueta> : null}
                                </div>
                                <div className="mt-1.5 grid gap-1">
                                  {entry?.rest ? <p className="text-xs font-bold text-tinta-2">Descanso</p> : null}
                                  {(entry?.items ?? []).map((item, itemIndex) => (
                                    <div
                                      key={itemIndex}
                                      className={cn("rounded-[4px] bg-saber py-0.5 pl-2 pr-1 text-xs font-semibold leading-4 text-tinta", fmtStyle(item.format).barra)}
                                    >
                                      {item.title}
                                    </div>
                                  ))}
                                  <p className="text-xs font-medium text-tinta-2">◦ stories</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </BlocoSaber>
                ) : null}

                {/* Motor de stories */}
                {plan.storiesEngine && plan.storiesEngine.length > 0 ? (
                  <BlocoSaber as="section" aria-labelledby="marketing-stories" className="grid gap-4">
                    <div>
                      <h2 id="marketing-stories" className={cn(TITULO_SECAO, "flex items-center gap-2")}>
                        <MessageCircle className="h-4 w-4 text-oliva" aria-hidden="true" /> Motor de Stories — até 8 por dia
                      </h2>
                      <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">
                        Sequência fixa reutilizável todo dia. Seg–sex rodam os 8 blocos; fim de semana, versão leve (1, 3, 5 e 8).
                      </p>
                    </div>
                    <ol className="grid gap-2 sm:grid-cols-2">
                      {plan.storiesEngine.map((block) => (
                        <li key={block.n} className="flex gap-3 rounded-bloco bg-folha p-3">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-musgo-claro text-xs font-extrabold tabular-nums text-musgo">
                            {block.n}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold leading-5 text-tinta">{block.title}</p>
                            <p className="text-[13px] font-medium leading-5 text-tinta-2">{block.description}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </BlocoSaber>
                ) : null}

                {/* Semanas */}
                {plan.weeks && plan.weeks.length > 0 ? (
                  <section aria-labelledby="marketing-semanas" className="grid gap-3">
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span id="marketing-semanas" className={TITULO_SECAO}>Detalhe por semana</span>
                      <span className="text-[13px] font-medium text-tinta-2">toque para abrir cada semana</span>
                    </p>
                    <BlocoFolha>
                      {plan.weeks.map((week) => (
                        <WeekCard key={week.id} week={week} />
                      ))}
                    </BlocoFolha>
                  </section>
                ) : null}

                {/* Como produzir */}
                {plan.production && plan.production.length > 0 ? (
                  <BlocoSaber as="section" aria-labelledby="marketing-producao" className="grid gap-3">
                    <h2 id="marketing-producao" className={TITULO_SECAO}>Como produzir sem sobrecarregar o Dr. Daniel</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {plan.production.map((note, index) => (
                        <div key={index} className="rounded-bloco bg-folha p-4">
                          <p className="text-sm font-bold leading-5 text-tinta">{note.title}</p>
                          <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{note.description}</p>
                        </div>
                      ))}
                    </div>
                  </BlocoSaber>
                ) : null}

                {/* Fallback: plano simples (IA antiga) — só quando não é rico */}
                {!isRich && plan.summary ? (
                  <BlocoSaber as="section" aria-labelledby="marketing-estrategia">
                    <h2 id="marketing-estrategia" className={TITULO_SECAO}>Estratégia do mês</h2>
                    <p className="mt-2 text-sm font-medium leading-6 text-tinta-2">{plan.summary}</p>
                  </BlocoSaber>
                ) : null}
                {!isRich && plan.cadence && plan.cadence.length > 0 ? (
                  <BlocoSaber as="section" aria-label="Cadência">
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
                      {plan.cadence.map((item, index) => (
                        <div key={`${item.format}-${index}`} className="min-w-0">
                          <dt className={RUBRICA}>{item.format}</dt>
                          <dd className="mt-1 text-sm font-bold leading-5 text-tinta">{item.target}</dd>
                        </div>
                      ))}
                    </dl>
                  </BlocoSaber>
                ) : null}
                {!isRich && plan.weeklyThemes && plan.weeklyThemes.length > 0 ? (
                  <BlocoSaber as="section" aria-labelledby="marketing-temas" className="grid gap-3">
                    <h2 id="marketing-temas" className={cn(TITULO_SECAO, "flex items-center gap-2")}>
                      <CalendarDays className="h-4 w-4 text-oliva" aria-hidden="true" /> Temas da semana
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {plan.weeklyThemes
                        .slice()
                        .sort((a, b) => a.week - b.week)
                        .map((theme) => (
                          <div key={theme.week} className="rounded-bloco bg-folha p-4">
                            <p className={RUBRICA}>Semana {theme.week}</p>
                            <p className="mt-1 text-sm font-bold leading-5 text-tinta">{theme.theme}</p>
                            {theme.notes ? <p className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{theme.notes}</p> : null}
                          </div>
                        ))}
                    </div>
                  </BlocoSaber>
                ) : null}

                {/* Acompanhar produção (peças com status) */}
                <BlocoFolha as="section" aria-labelledby="marketing-producao-pecas">
                  <button
                    type="button"
                    aria-expanded={showTracker}
                    onClick={() => setShowTracker((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 rounded-bloco px-5 py-4 text-left hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco max-md:px-4"
                  >
                    <span id="marketing-producao-pecas" className={TITULO_SECAO}>
                      Acompanhar produção
                      <span className="ml-2 text-sm font-medium tabular-nums text-tinta-2">
                        {postedCount} de {sortedPieces.length} postadas
                      </span>
                    </span>
                    <ChevronDown className={cn("h-5 w-5 shrink-0 text-tinta-2 transition-transform duration-150 ease-papel", showTracker && "rotate-180")} aria-hidden="true" />
                  </button>
                  {showTracker ? (
                    <div className="border-t border-fio">
                      <p className="px-5 pt-4 text-[13px] font-medium leading-5 text-tinta-2 max-md:px-4">
                        Marque cada peça conforme avança: A produzir → Gravado → Editado → Postado. Toque no status para mudar.
                      </p>
                      {sortedPieces.length === 0 ? (
                        <p className="px-5 py-4 text-sm font-medium text-tinta-2 max-md:px-4">Nenhuma peça no acompanhamento ainda — adicione abaixo.</p>
                      ) : (
                        <ul className="mt-3">
                          {sortedPieces.map((piece) => {
                            const style = fmtStyle(piece.format);
                            const postado = piece.status === "POSTADO";
                            return (
                              <li key={piece.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-fio px-5 py-3 max-md:px-4">
                                <span className="w-24 shrink-0 text-xs font-bold uppercase tabular-nums text-tinta-2">
                                  {formatPieceDate(piece.date)}
                                </span>
                                <EtiquetaDoFormato format={piece.format}>{style.label}</EtiquetaDoFormato>
                                <div className="min-w-0 flex-1 basis-48">
                                  <p className="text-sm font-bold leading-5 text-tinta">{piece.title}</p>
                                  {piece.notes ? <p className="text-[13px] font-medium leading-5 text-tinta-2">{piece.notes}</p> : null}
                                </div>
                                <button
                                  type="button"
                                  disabled={semEdicao}
                                  onClick={() => cyclePieceStatus(piece)}
                                  title="Toque para passar à próxima etapa"
                                  className={cn(
                                    "inline-flex h-8 shrink-0 items-center gap-2 rounded-controle border px-2.5 text-[13px] font-bold transition-colors duration-150 ease-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-70",
                                    postado ? "border-transparent bg-ok-claro text-ok" : "border-fio-2 bg-folha text-tinta hover:border-borda-campo",
                                  )}
                                >
                                  <MarcasDeEtapa etapas={pieceStatusEtapas[piece.status]} fim={postado} className={postado ? "" : "text-musgo"} />
                                  {pieceStatusLabels[piece.status]}
                                </button>
                                <button
                                  type="button"
                                  disabled={semEdicao}
                                  onClick={() => removePiece(piece)}
                                  className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-controle text-tinta-2 transition-colors duration-150 ease-papel hover:bg-erro-claro hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-70"
                                  aria-label={`Excluir ${piece.title}`}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <form onSubmit={addPiece} className="grid gap-3 border-t border-fio bg-papel px-5 py-4 max-md:px-4 sm:grid-cols-[160px_160px_1fr_auto] sm:items-end">
                        <div>
                          <Label htmlFor="piece-date">Data</Label>
                          <Input id="piece-date" type="date" value={newPieceDate} onChange={(event) => setNewPieceDate(event.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor="piece-format">Formato</Label>
                          <CampoSelecao id="piece-format" value={newPieceFormat} onChange={(event) => setNewPieceFormat(event.target.value)}>
                            {pieceFormats.map((format) => (
                              <option key={format} value={format}>
                                {format}
                              </option>
                            ))}
                          </CampoSelecao>
                        </div>
                        <div className="min-w-0">
                          <Label htmlFor="piece-title">Título da peça</Label>
                          <Input
                            id="piece-title"
                            value={newPieceTitle}
                            onChange={(event) => setNewPieceTitle(event.target.value)}
                            placeholder="Ex.: Carrossel — mitos do GLP-1"
                          />
                        </div>
                        <Botao type="submit" disabled={semEdicao} icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
                          Adicionar
                        </Botao>
                      </form>
                    </div>
                  ) : null}
                </BlocoFolha>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </AccessGate>
  );
}
