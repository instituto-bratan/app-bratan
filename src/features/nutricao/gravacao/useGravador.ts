// GRAVAÇÃO DA CONSULTA (28/09/2026).
//
// Pedido da Dra. Géssica: gravar a consulta e, a partir do áudio, montar o
// prontuário e o plano. Cuidados:
// - o áudio vai para o banco local em pedaços de 5 s enquanto ela grava:
//   se o navegador fechar no meio, a consulta não se perde;
// - a tela fica acordada durante a gravação (quando o navegador deixa);
// - o nível da voz aparece numa fileira de bolinhas, para ela ver que está captando.
import { useCallback, useEffect, useRef, useState } from "react";
import { guardarPedaco, lerPedacos } from "../store/db";
import { lerGravacao, salvarGravacao, type Gravacao } from "../store/repositorio";

export type EstadoDoGravador = "parado" | "pedindo" | "gravando" | "pausado" | "finalizando" | "erro";

const TIPOS_PREFERIDOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function tipoSuportado(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const tipo of TIPOS_PREFERIDOS) if (MediaRecorder.isTypeSupported(tipo)) return tipo;
  return "";
}

type Sentinela = { release: () => Promise<void> };

export function useGravador() {
  const [estado, setEstado] = useState<EstadoDoGravador>("parado");
  const [erro, setErro] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [nivel, setNivel] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const contexto = useRef<AudioContext | null>(null);
  const quadro = useRef<number | null>(null);
  const relogio = useRef<number | null>(null);
  const ordem = useRef(0);
  const gravacaoAtual = useRef<Gravacao | null>(null);
  const sentinela = useRef<Sentinela | null>(null);
  const escritas = useRef<Promise<void>>(Promise.resolve());

  const pararMedidor = useCallback(() => {
    if (quadro.current) cancelAnimationFrame(quadro.current);
    quadro.current = null;
    void contexto.current?.close().catch(() => undefined);
    contexto.current = null;
    setNivel(0);
  }, []);

  const liberarTudo = useCallback(() => {
    pararMedidor();
    if (relogio.current) window.clearInterval(relogio.current);
    relogio.current = null;
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
    void sentinela.current?.release().catch(() => undefined);
    sentinela.current = null;
  }, [pararMedidor]);

  useEffect(() => () => liberarTudo(), [liberarTudo]);

  const iniciarMedidor = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const fonte = ctx.createMediaStreamSource(stream);
      const analisador = ctx.createAnalyser();
      analisador.fftSize = 512;
      fonte.connect(analisador);
      const dados = new Uint8Array(analisador.fftSize);
      const passo = () => {
        analisador.getByteTimeDomainData(dados);
        let soma = 0;
        for (let i = 0; i < dados.length; i++) {
          const v = (dados[i] - 128) / 128;
          soma += v * v;
        }
        setNivel(Math.min(1, Math.sqrt(soma / dados.length) * 4));
        quadro.current = requestAnimationFrame(passo);
      };
      contexto.current = ctx;
      quadro.current = requestAnimationFrame(passo);
    } catch {
      /* sem medidor: a gravação continua */
    }
  }, []);

  const iniciar = useCallback(
    async (gravacao: { id: string; atendimentoId: string }) => {
      setErro(null);
      const mime = tipoSuportado();
      if (!mime || !navigator.mediaDevices?.getUserMedia) {
        setEstado("erro");
        setErro("Este navegador não grava áudio. Use o Chrome atualizado no Mac.");
        return false;
      }
      setEstado("pedindo");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      } catch (e) {
        setEstado("erro");
        const negado = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setErro(negado ? "O microfone foi bloqueado. Libere o microfone para este site no ícone de cadeado da barra de endereço." : "Não foi possível acessar o microfone.");
        return false;
      }
      fluxo.current = stream;
      const existente = await lerGravacao(gravacao.id);
      ordem.current = existente?.pedacos ?? 0;
      const registro: Gravacao = existente ?? {
        id: gravacao.id,
        atendimentoId: gravacao.atendimentoId,
        iniciadaEm: new Date().toISOString(),
        duracaoSeg: 0,
        mime,
        estado: "gravando",
        pedacos: 0,
        jobId: null,
        apagarEm: null,
        apagadaEm: null,
      };
      gravacaoAtual.current = { ...registro, estado: "gravando" };
      setSegundos(registro.duracaoSeg);
      await salvarGravacao(gravacaoAtual.current);

      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 });
      rec.ondataavailable = (evento) => {
        if (!evento.data || evento.data.size === 0 || !gravacaoAtual.current) return;
        const atual = gravacaoAtual.current;
        const n = ordem.current++;
        atual.pedacos = ordem.current;
        escritas.current = escritas.current
          .then(() => guardarPedaco({ gravacaoId: atual.id, ordem: n, dados: evento.data }))
          .then(() => salvarGravacao({ ...atual }))
          .catch(() => setErro("Um pedaço da gravação não foi guardado no computador."));
      };
      rec.start(5000);
      gravador.current = rec;
      iniciarMedidor(stream);
      relogio.current = window.setInterval(() => {
        setSegundos((s) => {
          const proximo = s + 1;
          if (gravacaoAtual.current) gravacaoAtual.current.duracaoSeg = proximo;
          return proximo;
        });
      }, 1000);
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinela> } }).wakeLock;
        if (wl) sentinela.current = await wl.request("screen");
      } catch {
        /* sem tela acordada: segue */
      }
      setEstado("gravando");
      return true;
    },
    [iniciarMedidor],
  );

  const pausar = useCallback(() => {
    if (gravador.current?.state !== "recording") return;
    gravador.current.pause();
    if (relogio.current) window.clearInterval(relogio.current);
    relogio.current = null;
    if (gravacaoAtual.current) void salvarGravacao({ ...gravacaoAtual.current, estado: "pausada" });
    setEstado("pausado");
  }, []);

  const retomar = useCallback(() => {
    if (gravador.current?.state !== "paused") return;
    gravador.current.resume();
    relogio.current = window.setInterval(() => {
      setSegundos((s) => {
        const proximo = s + 1;
        if (gravacaoAtual.current) gravacaoAtual.current.duracaoSeg = proximo;
        return proximo;
      });
    }, 1000);
    setEstado("gravando");
  }, []);

  /** Para, espera o último pedaço ser guardado e devolve o áudio inteiro. */
  const parar = useCallback(async (): Promise<Blob | null> => {
    const rec = gravador.current;
    if (!rec || rec.state === "inactive" || !gravacaoAtual.current) return null;
    setEstado("finalizando");
    await new Promise<void>((resolve) => {
      rec.addEventListener("stop", () => resolve(), { once: true });
      rec.stop();
    });
    await escritas.current;
    liberarTudo();
    const atual = { ...gravacaoAtual.current, estado: "concluida" as const };
    await salvarGravacao(atual);
    gravador.current = null;
    const pedacos = await lerPedacos(atual.id);
    setEstado("parado");
    return new Blob(pedacos.map((p) => p.dados), { type: atual.mime.split(";")[0] });
  }, [liberarTudo]);

  return { estado, erro, segundos, nivel, iniciar, pausar, retomar, parar };
}

/** Junta os pedaços guardados de uma gravação (para enviar de novo, se a estação estava desligada). */
export async function audioGuardado(gravacaoId: string): Promise<Blob | null> {
  const [g, pedacos] = await Promise.all([lerGravacao(gravacaoId), lerPedacos(gravacaoId)]);
  if (!g || pedacos.length === 0) return null;
  return new Blob(pedacos.map((p) => p.dados), { type: g.mime.split(";")[0] });
}

export function formatarDuracao(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
