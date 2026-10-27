// O GRAVADOR DE RECADO (27/10/2026) — o mesmo para o Dr. (ficha do paciente no
// 360) e para o paciente (o "por que eu comecei" no portal).
//
// Usa o MediaRecorder do navegador. O site já permite o microfone na própria
// origem (Permissions-Policy: microphone=(self), vercel.json) e o app da loja
// pede com a frase do Info.plist. Para sozinho no limite (1 minuto), solta o
// microfone ao parar ou ao sair da tela, e entrega o áudio para a prévia.
// Nada sai do aparelho aqui: quem envia é quem chamou, depois da prévia.
import { useCallback, useEffect, useRef, useState } from "react";

/** O formato que este aparelho grava — mp4 primeiro, que é o que toca em todo iPhone. */
export function formatoDeGravacao(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  for (const formato of ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(formato)) return formato;
  }
  return "";
}

export function gravacaoSuportada() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && formatoDeGravacao() !== "";
}

export type EstadoDoGravador = "parado" | "gravando" | "pronto";

export function useGravador(maxSegundos: number) {
  const [estado, setEstado] = useState<EstadoDoGravador>("parado");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [mime, setMime] = useState("");
  const [segundos, setSegundos] = useState<number | null>(null);
  const [cronometro, setCronometro] = useState(0);
  const [erro, setErro] = useState("");
  const [previaUrl, setPreviaUrl] = useState<string | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const pedacos = useRef<BlobPart[]>([]);
  const inicio = useRef(0);

  useEffect(() => {
    if (!audio) {
      setPreviaUrl(null);
      return;
    }
    const url = URL.createObjectURL(audio);
    setPreviaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  const parar = useCallback(() => {
    if (gravador.current && gravador.current.state !== "inactive") gravador.current.stop();
  }, []);

  useEffect(() => {
    if (estado !== "gravando") return;
    const relogio = window.setInterval(() => {
      const passados = Math.floor((Date.now() - inicio.current) / 1000);
      setCronometro(passados);
      if (passados >= maxSegundos) parar();
    }, 200);
    return () => window.clearInterval(relogio);
  }, [estado, maxSegundos, parar]);

  // Saiu da tela no meio da gravação: solta o microfone (o aviso vermelho do celular apaga).
  useEffect(
    () => () => {
      try {
        if (gravador.current && gravador.current.state !== "inactive") gravador.current.stop();
      } catch {
        /* já parado */
      }
      fluxo.current?.getTracks().forEach((faixa) => faixa.stop());
    },
    [],
  );

  const iniciar = useCallback(async () => {
    setErro("");
    const formato = formatoDeGravacao();
    if (!formato || !navigator.mediaDevices?.getUserMedia) {
      setErro("Este aparelho não grava áudio por aqui.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      fluxo.current = stream;
      let rec: MediaRecorder;
      try {
        // 64 kbps: voz clara, 1 minuto em ~0,5 MB.
        rec = new MediaRecorder(stream, { mimeType: formato, audioBitsPerSecond: 64_000 });
      } catch {
        rec = new MediaRecorder(stream, { mimeType: formato });
      }
      pedacos.current = [];
      rec.ondataavailable = (evento) => {
        if (evento.data.size) pedacos.current.push(evento.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((faixa) => faixa.stop());
        fluxo.current = null;
        const tipo = formato.split(";")[0];
        const duracao = Math.min(maxSegundos, (Date.now() - inicio.current) / 1000);
        setAudio(new Blob(pedacos.current, { type: tipo }));
        setMime(tipo);
        setSegundos(Math.max(1, Math.round(duracao)));
        setEstado("pronto");
      };
      gravador.current = rec;
      inicio.current = Date.now();
      setCronometro(0);
      setAudio(null);
      setSegundos(null);
      setEstado("gravando");
      rec.start(1000);
      return true;
    } catch {
      fluxo.current?.getTracks().forEach((faixa) => faixa.stop());
      fluxo.current = null;
      setErro("Não deu para usar o microfone. Libere o microfone para este endereço (ou para o app) e tente de novo.");
      setEstado("parado");
      return false;
    }
  }, [maxSegundos]);

  /** Joga fora o que foi gravado (só depois de parar). */
  const descartar = useCallback(() => {
    if (gravador.current && gravador.current.state !== "inactive") return;
    setAudio(null);
    setMime("");
    setSegundos(null);
    setCronometro(0);
    setErro("");
    setEstado("parado");
  }, []);

  return { estado, audio, mime, segundos, cronometro, erro, previaUrl, iniciar, parar, descartar };
}

/** O áudio em base64, sem o prefixo "data:…;base64," — é o que a função do portal recebe. */
export function audioParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? "").replace(/^data:[^,]+,/, ""));
    leitor.onerror = () => reject(new Error("Não consegui ler o áudio gravado."));
    leitor.readAsDataURL(blob);
  });
}
