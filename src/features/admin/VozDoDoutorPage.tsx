// A VOZ DO DOUTOR (22/09/2026) — Administração → Portal do paciente
//
// Aqui o Dr. Daniel grava (ou envia) uma nota de áudio curta para cada fase do
// plano. O portal escolhe sozinho a fase de cada paciente pelo tempo desde o
// fechamento e toca a mensagem certa. Uma gravação por fase; gravar de novo
// substitui (a anterior fica no histórico, desativada).
//
// Gravar pelo celular sai em mp4/aac, que toca em todo aparelho. Pelo Chrome
// do computador sai em webm — a tela avisa antes de salvar.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Mic, Pause, Play, Square, Upload } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { listRemoteMensagensDoDoutor, salvarRemoteMensagemDoDoutor, setRemoteMensagemDoDoutorAtiva, urlDoAudioDoDoutor, type MensagemDoDoutorRegistro } from "@/lib/remote/vozDoDoutor";
import { AUDIO_MAX_SEGUNDOS, FASES, FASE_INFO, avisoDoFormato, duracaoTexto, validarAudio, type FaseDoDoutor } from "../../../supabase/functions/_shared/vozDoDoutor";

/** O formato que este navegador consegue gravar — mp4 primeiro, que é o que toca no iPhone. */
function formatoDeGravacao() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

/** Toca um áudio por URL assinada (pedida só quando a pessoa aperta play). */
function Ouvir({ storagePath, duracaoS }: { storagePath: string; duracaoS: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  async function alternar() {
    if (!url) {
      const assinada = await urlDoAudioDoDoutor(storagePath).catch(() => null);
      if (!assinada) return toast("Não consegui abrir o áudio.", { tom: "erro" });
      setUrl(assinada);
      setTimeout(() => void audioRef.current?.play(), 50);
      return;
    }
    if (audioRef.current?.paused) void audioRef.current.play();
    else audioRef.current?.pause();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => void alternar()}>
        {tocando ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
        {tocando ? "Pausar" : "Ouvir"} · {duracaoTexto(duracaoS)}
      </Button>
      {url ? <audio ref={audioRef} src={url} onPlay={() => setTocando(true)} onPause={() => setTocando(false)} onEnded={() => setTocando(false)} preload="none" /> : null}
    </span>
  );
}

function FaseCard({ fase, atual, historico, pessoaId, onMudou }: { fase: FaseDoDoutor; atual: MensagemDoDoutorRegistro | null; historico: MensagemDoDoutorRegistro[]; pessoaId: string | null; onMudou: () => Promise<void> }) {
  const info = FASE_INFO[fase];
  const [editando, setEditando] = useState(!atual);
  const [titulo, setTitulo] = useState(atual?.titulo ?? "");
  const [texto, setTexto] = useState(atual?.texto ?? "");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [mime, setMime] = useState("");
  const [segundos, setSegundos] = useState<number | null>(null);
  const [gravando, setGravando] = useState(false);
  const [cronometro, setCronometro] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [previaUrl, setPreviaUrl] = useState<string | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<BlobPart[]>([]);
  const inicioGravacao = useRef(0);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const formato = formatoDeGravacao();

  useEffect(() => {
    if (!audio) {
      setPreviaUrl(null);
      return;
    }
    const url = URL.createObjectURL(audio);
    setPreviaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => {
      const s = Math.round((Date.now() - inicioGravacao.current) / 1000);
      setCronometro(s);
      if (s >= AUDIO_MAX_SEGUNDOS) pararGravacao();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravando]);

  async function comecarGravacao() {
    if (!formato) return toast("Este navegador não grava áudio. Envie um arquivo .m4a/.mp3 pelo botão ao lado.", { tom: "atencao", duracaoMs: 6000 });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: formato });
      pedacos.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) pedacos.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(pedacos.current, { type: formato.split(";")[0] });
        setAudio(blob);
        setMime(formato.split(";")[0]);
        setSegundos(Math.round((Date.now() - inicioGravacao.current) / 1000));
        setGravando(false);
      };
      gravador.current = rec;
      inicioGravacao.current = Date.now();
      setCronometro(0);
      setGravando(true);
      rec.start();
    } catch {
      toast("Não consegui acessar o microfone. Permita o uso do microfone para este site e tente de novo.", { tom: "erro", duracaoMs: 6000 });
    }
  }
  function pararGravacao() {
    if (gravador.current && gravador.current.state !== "inactive") gravador.current.stop();
  }
  function escolherArquivo(arquivo: File | null) {
    if (!arquivo) return;
    setAudio(arquivo);
    setMime(arquivo.type || "audio/mp4");
    // A duração de um arquivo enviado só se sabe tocando; o <audio> de prévia preenche.
    setSegundos(null);
  }

  async function salvar() {
    const problema = audio ? validarAudio(mime, audio.size, segundos) : "";
    if (problema) return toast(problema, { tom: "atencao", duracaoMs: 6000 });
    if (!audio && !texto.trim()) return toast("Grave o áudio ou escreva a mensagem — um dos dois precisa existir.", { tom: "atencao" });
    setSalvando(true);
    try {
      await salvarRemoteMensagemDoDoutor({ fase, titulo: titulo || info.rotulo, texto, audio, mimeType: mime, duracaoS: segundos, pessoaId });
      toast(`Mensagem de "${info.rotulo}" salva. Os pacientes nessa fase já ouvem no portal.`, { tom: "ok" });
      setAudio(null);
      setEditando(false);
      await onMudou();
    } catch (falha) {
      toast(`Não consegui salvar: ${(falha as Error).message}`, { tom: "erro", duracaoMs: 7000 });
    } finally {
      setSalvando(false);
    }
  }

  const aviso = avisoDoFormato(mime);
  return (
    <Card className="border-brand-oliva/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Mic className="h-4 w-4 text-brand-musgo" aria-hidden="true" />
          {info.rotulo}
          <Badge variant="muted" className="font-normal">{info.periodo}</Badge>
          {atual ? <Badge variant="gold">no ar</Badge> : <Badge variant="outline">sem gravação</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">Para {info.paraQuem}.</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {atual && !editando ? (
          <div className="grid gap-2">
            <p className="font-semibold text-brand-tinta">{atual.titulo || info.rotulo}</p>
            {atual.texto ? <p className="whitespace-pre-wrap text-sm text-brand-tinta/90">{atual.texto}</p> : <p className="text-xs text-muted-foreground">Sem versão escrita — vale acrescentar para quem não pode ouvir na hora.</p>}
            <div className="flex flex-wrap items-center gap-2">
              {atual.storagePath ? <Ouvir storagePath={atual.storagePath} duracaoS={atual.duracaoS} /> : <span className="text-xs text-muted-foreground">Só texto, sem áudio.</span>}
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditando(true)}>Gravar de novo</Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={async () => {
                  await setRemoteMensagemDoDoutorAtiva(atual.id, false);
                  toast("Mensagem tirada do ar. O portal não mostra nada nesta fase até gravar outra.", { tom: "info" });
                  await onMudou();
                }}
              >
                Tirar do ar
              </Button>
            </div>
            {atual.mimeType && avisoDoFormato(atual.mimeType) ? <p className="text-xs text-amber-800">{avisoDoFormato(atual.mimeType)}</p> : null}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {!gravando ? (
                <Button type="button" size="sm" className="h-9 gap-1.5" onClick={() => void comecarGravacao()}>
                  <Mic className="h-4 w-4" aria-hidden="true" /> {audio ? "Gravar outra" : "Gravar agora"}
                </Button>
              ) : (
                <Button type="button" size="sm" variant="destructive" className="h-9 gap-1.5" onClick={pararGravacao}>
                  <Square className="h-4 w-4" aria-hidden="true" /> Parar · {duracaoTexto(cronometro)}
                </Button>
              )}
              <input ref={inputArquivo} type="file" accept="audio/*,.m4a,.mp3,.aac" className="hidden" onChange={(e) => { escolherArquivo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" disabled={gravando} onClick={() => inputArquivo.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden="true" /> Enviar arquivo
              </Button>
              <span className="text-xs text-muted-foreground">Até 3 minutos. Ideal: 40 segundos, como uma mensagem de WhatsApp.</span>
            </div>
            {previaUrl ? (
              <div className="grid gap-1">
                <audio
                  controls
                  src={previaUrl}
                  className="w-full"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0 && segundos === null) setSegundos(Math.round(d));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {mime || "áudio"} · {audio ? `${(audio.size / 1024 / 1024).toFixed(1)} MB` : ""} {segundos !== null ? `· ${duracaoTexto(segundos)}` : ""}
                </p>
                {aviso ? <p className="text-xs text-amber-800">{aviso}</p> : null}
              </div>
            ) : null}
            <div className="grid gap-1">
              <Label htmlFor={`titulo-${fase}`} className="text-xs">Título que o paciente vê</Label>
              <Input id={`titulo-${fase}`} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={info.rotulo} className="h-9" maxLength={80} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`texto-${fase}`} className="text-xs">O que você disse, por escrito <span className="font-normal text-muted-foreground">— para quem não pode ouvir agora</span></Label>
              <textarea id={`texto-${fase}`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={1200} className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm" placeholder="Duas ou três frases, do jeito que você fala." />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={salvando || gravando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Colocar no ar"}</Button>
              {atual ? <Button type="button" size="sm" variant="ghost" onClick={() => { setEditando(false); setAudio(null); }}>Cancelar</Button> : null}
            </div>
          </div>
        )}
        {historico.length ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Gravações anteriores ({historico.length})</summary>
            <ul className="mt-1 grid gap-1">
              {historico.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2">
                  <span>{m.criadoEm.slice(8, 10)}/{m.criadoEm.slice(5, 7)} · {m.titulo || info.rotulo}</span>
                  {m.storagePath ? <Ouvir storagePath={m.storagePath} duracaoS={m.duracaoS} /> : null}
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={async () => { await setRemoteMensagemDoDoutorAtiva(m.id, true); if (atual) await setRemoteMensagemDoDoutorAtiva(atual.id, false); await onMudou(); }}>Voltar com esta</Button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function VozDoDoutorPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const usaRemoto = Boolean(pessoa && session && !isPreview);
  const mensagensQuery = useQuery({ queryKey: ["portal-voz-doutor"], queryFn: listRemoteMensagensDoDoutor, staleTime: 30_000, enabled: usaRemoto });
  const mensagens = mensagensQuery.data ?? [];
  const noAr = FASES.filter((f) => mensagens.some((m) => m.fase === f && m.ativo)).length;
  const recarregar = async () => {
    await queryClient.invalidateQueries({ queryKey: ["portal-voz-doutor"] });
  };
  return (
    <AccessGate allowed={(cargo) => isCoordenacao(cargo)} label="Administração · Portal do paciente">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Administração</Badge>
            <Badge variant="muted">{noAr} de {FASES.length} fases com mensagem</Badge>
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-3xl text-brand-musgo">
            <Mic className="h-7 w-7" aria-hidden="true" />
            A voz do doutor no portal
            <InfoTip title="Uma mensagem por fase do plano">
              O portal sabe há quantos dias cada paciente fechou o plano e toca a mensagem da fase dele: começo, meio do caminho, reta
              final, depois do plano — e boas-vindas para quem ainda não fechou. Grave pelo celular (o áudio sai num formato que toca em
              todo aparelho) ou envie um .m4a/.mp3. Escreva também a versão em texto: aparece embaixo do player e serve para quem não
              pode ouvir na hora. Nada de promessa de resultado — é conversa, não propaganda.
            </InfoTip>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Quarenta segundos, do jeito que você fala na consulta. O paciente ouve uma vez, sabe que é para ele, e o portal registra que ouviu.
          </p>
        </motion.section>
        {mensagensQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {FASES.map((fase) => {
            const daFase = mensagens.filter((m) => m.fase === fase);
            const atual = daFase.find((m) => m.ativo) ?? null;
            return <FaseCard key={fase} fase={fase} atual={atual} historico={daFase.filter((m) => !m.ativo)} pessoaId={pessoa?.id ?? null} onMudou={recarregar} />;
          })}
        </div>
      </div>
    </AccessGate>
  );
}
