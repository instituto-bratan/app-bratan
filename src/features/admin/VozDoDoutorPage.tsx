// A VOZ DO DOUTOR (22/09/2026) — Administração → Portal do paciente
//
// Aqui o Dr. Daniel grava (ou envia) uma nota de áudio curta para cada fase do
// plano. O portal escolhe sozinho a fase de cada paciente pelo tempo desde o
// fechamento e toca a mensagem certa. Uma gravação por fase; gravar de novo
// substitui (a anterior fica no histórico, desativada).
//
// Gravar pelo celular sai em mp4/aac, que toca em todo aparelho. Pelo Chrome
// do computador sai em webm — a tela avisa antes de salvar.
//
// Redesenho Papel & Musgo, etapa 4 (08/10/2026): as fases viraram uma lista numa
// folha — à esquerda o nome da fase, o período e para quem; à direita a mensagem
// no ar ou o gravador. Mesmos botões (Gravar agora · Enviar arquivo · Colocar no
// ar · Gravar de novo · Tirar do ar · Voltar com esta) e o mesmo limite de áudio.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Pause, Play, Square, Upload } from "lucide-react";
import { AccessGate } from "@/components/access/AccessGate";
import { BlocoFolha, Botao, Cabecalho } from "@/components/ui/fundacao";
import { toast } from "@/components/ui/avisos";
import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { listRemoteMensagensDoDoutor, salvarRemoteMensagemDoDoutor, setRemoteMensagemDoDoutorAtiva, urlDoAudioDoDoutor, type MensagemDoDoutorRegistro } from "@/lib/remote/vozDoDoutor";
import { AUDIO_MAX_SEGUNDOS, FASES, FASE_INFO, avisoDoFormato, duracaoTexto, validarAudio, type FaseDoDoutor } from "../../../supabase/functions/_shared/vozDoDoutor";
import { cn } from "@/lib/utils";
import { AJUDA, CabecaDaFolha, Campo, CampoArea, CampoTexto, Detalhes, Etiqueta, Recado, TituloComDica } from "./pecasAjustes";

/** O formato que este navegador consegue gravar — mp4 primeiro, que é o que toca no iPhone. */
function formatoDeGravacao() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

/** Toca um áudio por URL assinada (pedida só quando a pessoa aperta play). */function Ouvir({ storagePath, duracaoS }: { storagePath: string; duracaoS: number | null }) {
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
      <Botao tamanho="pq" variante="secundario" className="max-md:h-10" icone={tocando ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />} onClick={() => void alternar()}>
        {tocando ? "Pausar" : "Ouvir"} · <span className="tabular-nums">{duracaoTexto(duracaoS)}</span>
      </Botao>
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
    <li className="grid gap-4 border-t border-fio px-6 py-5 max-md:px-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-base font-bold leading-6 text-tinta">
          <Mic className="h-4 w-4 stroke-oliva" aria-hidden="true" />
          {info.rotulo}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Etiqueta>{info.periodo}</Etiqueta>
          {atual ? <Etiqueta tom="ok">no ar</Etiqueta> : <Etiqueta tom="atencao">sem gravação</Etiqueta>}
        </div>
        <p className="mt-2 text-[13px] font-medium leading-5 text-tinta-2">Para {info.paraQuem}.</p>
      </div>

      <div className="grid min-w-0 gap-3 text-sm">
        {atual && !editando ? (
          <div className="grid gap-2 rounded-bloco bg-saber p-4">
            <p className="text-[15px] font-bold leading-6 text-tinta">{atual.titulo || info.rotulo}</p>
            {atual.texto ? (
              <p className="whitespace-pre-wrap text-sm font-medium leading-[22px] text-tinta">{atual.texto}</p>
            ) : (
              <p className="text-[13px] font-medium leading-5 text-tinta-2">Sem versão escrita — vale acrescentar para quem não pode ouvir na hora.</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {atual.storagePath ? <Ouvir storagePath={atual.storagePath} duracaoS={atual.duracaoS} /> : <span className="text-[13px] font-medium text-tinta-2">Só texto, sem áudio.</span>}
              <Botao tamanho="pq" variante="secundario" className="max-md:h-10" icone={<Mic className="h-4 w-4" aria-hidden="true" />} onClick={() => setEditando(true)}>
                Gravar de novo
              </Botao>
              <Botao
                tamanho="pq"
                variante="perigo"
                className="max-md:h-10 sm:ml-auto"
                onClick={async () => {
                  await setRemoteMensagemDoDoutorAtiva(atual.id, false);
                  toast("Mensagem tirada do ar. O portal não mostra nada nesta fase até gravar outra.", { tom: "info" });
                  await onMudou();
                }}
              >
                Tirar do ar
              </Botao>
            </div>
            {atual.mimeType && avisoDoFormato(atual.mimeType) ? <p className="text-[13px] font-semibold leading-5 text-atencao">{avisoDoFormato(atual.mimeType)}</p> : null}
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {!gravando ? (
                <Botao variante="suave" className="max-md:h-11" icone={<Mic className="h-4 w-4" aria-hidden="true" />} onClick={() => void comecarGravacao()}>
                  {audio ? "Gravar outra" : "Gravar agora"}
                </Botao>
              ) : (
                <Botao variante="perigo-cheio" className="max-md:h-11" icone={<Square className="h-4 w-4" aria-hidden="true" />} onClick={pararGravacao}>
                  Parar · <span className="tabular-nums">{duracaoTexto(cronometro)}</span>
                </Botao>
              )}
              <input ref={inputArquivo} type="file" accept="audio/*,.m4a,.mp3,.aac" className="hidden" onChange={(e) => { escolherArquivo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              <Botao variante="secundario" className="max-md:h-11" disabled={gravando} icone={<Upload className="h-4 w-4" aria-hidden="true" />} onClick={() => inputArquivo.current?.click()}>
                Enviar arquivo
              </Botao>
              <span className={cn(AJUDA, "basis-full")}>Até 3 minutos. Ideal: 40 segundos, como uma mensagem de WhatsApp.</span>
            </div>
            {previaUrl ? (
              <div className="grid gap-1.5 rounded-bloco bg-saber p-3">
                <audio
                  controls
                  src={previaUrl}
                  className="w-full"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0 && segundos === null) setSegundos(Math.round(d));
                  }}
                />
                <p className="text-xs font-semibold leading-4 tabular-nums text-tinta-2">
                  {mime || "áudio"} · {audio ? `${(audio.size / 1024 / 1024).toFixed(1)} MB` : ""} {segundos !== null ? `· ${duracaoTexto(segundos)}` : ""}
                </p>
                {aviso ? <p className="text-[13px] font-semibold leading-5 text-atencao">{aviso}</p> : null}
              </div>
            ) : null}
            <Campo id={`titulo-${fase}`} rotulo="Título que o paciente vê">
              <CampoTexto id={`titulo-${fase}`} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={info.rotulo} maxLength={80} />
            </Campo>
            <Campo
              id={`texto-${fase}`}
              rotulo={
                <>
                  O que você disse, por escrito <span className="font-medium text-tinta-2">— para quem não pode ouvir agora</span>
                </>
              }
            >
              <CampoArea id={`texto-${fase}`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={1200} placeholder="Duas ou três frases, do jeito que você fala." />
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Botao variante="primario" className="max-md:h-11" carregando={salvando} disabled={gravando} onClick={() => void salvar()}>
                {salvando ? "Salvando…" : "Colocar no ar"}
              </Botao>
              {atual ? (
                <Botao variante="fantasma" className="max-md:h-11" onClick={() => { setEditando(false); setAudio(null); }}>
                  Cancelar
                </Botao>
              ) : null}
            </div>
          </div>
        )}
        {historico.length ? (
          <Detalhes resumo={`Gravações anteriores (${historico.length})`}>
            <ul className="grid gap-2">
              {historico.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums">
                    {m.criadoEm.slice(8, 10)}/{m.criadoEm.slice(5, 7)} · {m.titulo || info.rotulo}
                  </span>
                  {m.storagePath ? <Ouvir storagePath={m.storagePath} duracaoS={m.duracaoS} /> : null}
                  <Botao tamanho="pq" variante="fantasma" className="max-md:h-10" onClick={async () => { await setRemoteMensagemDoDoutorAtiva(m.id, true); if (atual) await setRemoteMensagemDoDoutorAtiva(atual.id, false); await onMudou(); }}>
                    Voltar com esta
                  </Botao>
                </li>
              ))}
            </ul>
          </Detalhes>
        ) : null}
      </div>
    </li>
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
  const fraseDoTopo = (
    <>
      <strong>
        {noAr} de {FASES.length} fases
      </strong>{" "}
      {noAr === 1 ? "tem" : "têm"} mensagem no ar. Quarenta segundos, do jeito que você fala na consulta: o paciente ouve uma vez, sabe que é para ele, e o portal registra que ouviu.
    </>
  );

  return (
    <AccessGate allowed={(cargo) => isCoordenacao(cargo)} label="Administração · Portal do paciente">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
        <Cabecalho
          className="mb-0 max-md:mb-0"
          sobrancelha="Ajustes · Portal do paciente"
          titulo={
            <TituloComDica
              texto="A voz do doutor no portal"
              tituloDaDica="Uma mensagem por fase do plano"
              dica={
                <>
                  O portal sabe há quantos dias cada paciente fechou o plano e toca a mensagem da fase dele: começo, meio do caminho, reta
                  final, depois do plano — e boas-vindas para quem ainda não fechou. Grave pelo celular (o áudio sai num formato que toca em
                  todo aparelho) ou envie um .m4a/.mp3. Escreva também a versão em texto: aparece embaixo do player e serve para quem não
                  pode ouvir na hora. Nada de promessa de resultado — é conversa, não propaganda.
                </>
              }
            />
          }
          frase={fraseDoTopo}
        />
        {mensagensQuery.isError ? <Recado tom="erro">Não consegui carregar as mensagens agora. Confira a conexão e recarregue.</Recado> : null}
        <BlocoFolha as="section" aria-labelledby="fases-do-plano" className="min-w-0 overflow-hidden">
          <CabecaDaFolha id="fases-do-plano" icone={<Mic />} titulo="Uma mensagem por fase do plano" resumo={`${noAr} no ar`} />
          {mensagensQuery.isLoading ? (
            <p role="status" className="border-t border-fio px-6 py-6 text-sm font-semibold text-tinta-2 max-md:px-4">
              Carregando…
            </p>
          ) : null}
          <ul>
            {FASES.map((fase) => {
              const daFase = mensagens.filter((m) => m.fase === fase);
              const atual = daFase.find((m) => m.ativo) ?? null;
              return <FaseCard key={fase} fase={fase} atual={atual} historico={daFase.filter((m) => !m.ativo)} pessoaId={pessoa?.id ?? null} onMudou={recarregar} />;
            })}
          </ul>
        </BlocoFolha>
      </div>
    </AccessGate>
  );
}
