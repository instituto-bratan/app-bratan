// O RECADO TRANCADO DO DR. NA FICHA DO PACIENTE (27/10/2026).
//
// No fim da consulta, o Dr. grava aqui um áudio de até 1 minuto para ESTE
// paciente e escolhe o dia em que ele abre (padrão: 15 dias). Até lá o portal
// mostra só o cadeado e a contagem; no dia, o áudio abre e o celular avisa
// ("O recado do Dr. abriu." — nada de dado clínico no aviso).
//
// Só médicos e coordenação veem esta parte (podeGravarRecadoDoDoutor — o banco
// confere o mesmo em pode_recado_do_doutor). Dá para apagar enquanto o paciente
// não ouviu; trocar a data = apagar e gravar de novo.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { confirmar, toast } from "@/components/ui/avisos";
import { cn } from "@/lib/utils";
import { apagarRemoteRecadoDoDoutor, listRemoteRecadosDoDoutor, salvarRemoteRecadoDoDoutor, urlDoRecadoDoDoutor, type RecadoDoDoutorRegistro } from "@/lib/remote/recadosDoPaciente";
import { QUEM_FALA_PADRAO, RECADO_DIAS_MAXIMO, RECADO_DIAS_PADRAO, RECADO_MAX_SEGUNDOS, abreEmPadrao, diasEntre, duracaoDoRecadoTexto, hojeEmSaoPaulo, somaDias, validarAberturaDoDoutor, validarAudioDoRecado } from "../../../supabase/functions/_shared/recadoTrancado";
import { avisoDoFormato } from "../../../supabase/functions/_shared/vozDoDoutor";
import { gravacaoSuportada, useGravador } from "./useGravador";

const ATALHOS_DE_DIAS = [7, 15, 30, 45];
const diaBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

function situacao(recado: RecadoDoDoutorRegistro, hoje: string): { texto: string; classe: string } {
  if (recado.abreEm > hoje) return { texto: `trancado · abre ${diaBR(recado.abreEm)}`, classe: "border-brand-dourado/50 text-brand-tinta" };
  if (recado.ouvidoEm) return { texto: `ouvido em ${diaBR(recado.ouvidoEm.slice(0, 10))}`, classe: "border-emerald-300 text-emerald-800" };
  return { texto: `abriu ${diaBR(recado.abreEm)} · ainda não ouviu`, classe: "border-amber-300 text-amber-800" };
}

/** Ouvir o que foi gravado (link de 10 minutos, pedido só no play). */
function OuvirRecado({ storagePath, duracaoS }: { storagePath: string; duracaoS: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  async function alternar() {
    if (!url) {
      const assinada = await urlDoRecadoDoDoutor(storagePath).catch(() => null);
      if (!assinada) return toast("Não consegui abrir o áudio.", { tom: "erro" });
      setUrl(assinada);
      setTimeout(() => void audioRef.current?.play().catch(() => undefined), 50);
      return;
    }
    if (audioRef.current?.paused) void audioRef.current.play().catch(() => undefined);
    else audioRef.current?.pause();
  }
  return (
    <>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void alternar()}>
        {tocando ? <Pause className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
        {tocando ? "pausar" : "ouvir"} · {duracaoDoRecadoTexto(duracaoS)}
      </Button>
      {url ? <audio ref={audioRef} src={url} preload="none" onPlay={() => setTocando(true)} onPause={() => setTocando(false)} onEnded={() => setTocando(false)} /> : null}
    </>
  );
}

export function RecadoDoDoutorNaFicha({ contactRef, nomePaciente, temAcessoAoPortal }: { contactRef: string; nomePaciente: string; temAcessoAoPortal: boolean }) {
  const queryClient = useQueryClient();
  const recados = useQuery({ queryKey: ["portal-recados", contactRef], queryFn: () => listRemoteRecadosDoDoutor(contactRef), staleTime: 30_000 });
  const hoje = hojeEmSaoPaulo();
  const [aberto, setAberto] = useState(false);
  const [quemFala, setQuemFala] = useState(QUEM_FALA_PADRAO);
  const [abreEm, setAbreEm] = useState(() => abreEmPadrao(hoje));
  const [salvando, setSalvando] = useState(false);
  const gravador = useGravador(RECADO_MAX_SEGUNDOS);
  const primeiroNome = nomePaciente.trim().split(/\s+/)[0] || "o paciente";
  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["portal-recados", contactRef] });

  function fechar() {
    gravador.descartar();
    setAberto(false);
    setAbreEm(abreEmPadrao(hojeEmSaoPaulo()));
  }

  async function salvar() {
    if (!gravador.audio) return toast("Grave o recado antes de guardar.", { tom: "atencao" });
    const problemaDoAudio = validarAudioDoRecado(gravador.mime, gravador.audio.size, gravador.segundos);
    if (problemaDoAudio) return toast(problemaDoAudio, { tom: "atencao", duracaoMs: 6000 });
    const problemaDaData = validarAberturaDoDoutor(abreEm, hojeEmSaoPaulo());
    if (problemaDaData) return toast(problemaDaData, { tom: "atencao", duracaoMs: 6000 });
    setSalvando(true);
    try {
      await salvarRemoteRecadoDoDoutor({ contactRef, audio: gravador.audio, mimeType: gravador.mime, duracaoS: gravador.segundos ?? 1, abreEm, quemFala });
      toast(`Recado guardado. Abre para ${primeiroNome} em ${diaBR(abreEm)}; no dia, o celular avisa (se os avisos estiverem ligados).`, { tom: "ok", duracaoMs: 7000 });
      fechar();
      await recarregar();
    } catch (falha) {
      toast(`Não consegui guardar: ${falha instanceof Error ? falha.message : String(falha)}`, { tom: "erro", duracaoMs: 7000 });
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(recado: RecadoDoDoutorRegistro) {
    if (!(await confirmar("Apagar este recado?", { corpo: `${primeiroNome} ainda não ouviu. O áudio some de verdade, e o cadeado sai do portal.`, destrutivo: true, confirmar: "Apagar" }))) return;
    try {
      await apagarRemoteRecadoDoDoutor(recado);
      toast("Recado apagado.", { tom: "ok" });
    } catch (falha) {
      toast(falha instanceof Error ? falha.message : "Não consegui apagar agora.", { tom: "erro", duracaoMs: 6000 });
    } finally {
      await recarregar();
    }
  }

  const dias = diasEntre(hoje, abreEm);
  const aviso = avisoDoFormato(gravador.mime);
  return (
    <div className="grid gap-2 border-t border-brand-oliva/15 pt-3">
      <p className="flex items-center gap-1.5 font-semibold text-brand-tinta">
        <Lock className="h-4 w-4 text-brand-oliva" aria-hidden="true" /> Recado trancado do Dr.
        <InfoTip title="Um áudio que só abre no dia certo">
          No fim da consulta, grave até 1 minuto para este paciente e escolha o dia em que abre (padrão: {RECADO_DIAS_PADRAO} dias). Até lá, o portal mostra só um cadeado com a
          contagem; no dia, o áudio abre e o celular avisa, com o texto “O recado do Dr. abriu.” — sem nada clínico. Dá para apagar enquanto ele não ouviu.
          Tom de conversa, sem promessa de resultado.
        </InfoTip>
      </p>
      {!temAcessoAoPortal ? <p className="text-xs text-muted-foreground">{primeiroNome} ainda não tem acesso ao portal: o recado fica guardado e aparece quando entrar.</p> : null}

      {aberto ? (
        <div className="grid gap-3 rounded-md border border-brand-oliva/20 bg-white/80 p-3">
          {!gravacaoSuportada() ? (
            <p className="text-xs text-muted-foreground">Este navegador não grava áudio. Abra a ficha pelo celular (Safari ou Chrome) para gravar.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {gravador.estado === "gravando" ? (
                <Button type="button" size="sm" variant="destructive" onClick={gravador.parar}>
                  <Square className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Parar · <span className="tabular-nums">{duracaoDoRecadoTexto(gravador.cronometro)}</span> de 1:00
                </Button>
              ) : (
                <Button type="button" size="sm" variant={gravador.audio ? "outline" : "default"} disabled={salvando} onClick={() => void gravador.iniciar()}>
                  <Mic className="mr-1.5 h-4 w-4" aria-hidden="true" /> {gravador.audio ? "Gravar de novo" : "Gravar agora"}
                </Button>
              )}
              <span className="text-xs text-muted-foreground">Até 1 minuto: para sozinho no limite.</span>
            </div>
          )}
          {gravador.erro ? <p className="text-xs font-semibold text-red-700">{gravador.erro}</p> : null}
          {gravador.estado === "pronto" && gravador.previaUrl ? (
            <div className="grid gap-1">
              <audio controls src={gravador.previaUrl} className="w-full" />
              <p className="text-xs tabular-nums text-muted-foreground">
                {gravador.mime} · {gravador.audio ? `${(gravador.audio.size / 1024).toFixed(0)} KB` : ""} · {duracaoDoRecadoTexto(gravador.segundos)}
              </p>
              {aviso ? <p className="text-xs font-semibold text-amber-800">{aviso}</p> : null}
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="grid gap-1 text-xs font-semibold text-brand-tinta">
              Quem fala (como o paciente lê)
              <Input value={quemFala} maxLength={40} onChange={(e) => setQuemFala(e.target.value)} className="h-9" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-brand-tinta">
              Abre em
              <Input type="date" value={abreEm} min={somaDias(hoje, 1)} max={somaDias(hoje, RECADO_DIAS_MAXIMO)} onChange={(e) => setAbreEm(e.target.value)} className="h-9" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ATALHOS_DE_DIAS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={dias === n}
                className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", dias === n ? "border-brand-musgo bg-brand-musgo text-white" : "border-brand-oliva/30 text-brand-tinta")}
                onClick={() => setAbreEm(somaDias(hojeEmSaoPaulo(), n))}
              >
                {n} dias{n === RECADO_DIAS_PADRAO ? " (padrão)" : ""}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">{dias !== null && dias > 0 ? `abre daqui a ${dias} ${dias === 1 ? "dia" : "dias"}` : ""}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={salvando || gravador.estado !== "pronto"} onClick={() => void salvar()}>
              {salvando ? "Guardando…" : "Guardar recado"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={salvando || gravador.estado === "gravando"} onClick={fechar}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
            <Mic className="mr-1.5 h-4 w-4" aria-hidden="true" /> Gravar recado do Dr.
          </Button>
        </div>
      )}

      {recados.isError ? <p className="text-xs text-red-700">Não consegui carregar os recados agora.</p> : null}
      {recados.data?.length ? (
        <ul className="grid gap-1">
          {recados.data.map((recado) => {
            const estado = situacao(recado, hoje);
            return (
              <li key={recado.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 px-2.5 py-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {recado.quemFala} · gravado {diaBR(recado.criadoEm.slice(0, 10))}
                  </span>
                  <Badge variant="outline" className={cn("text-[10px]", estado.classe)}>
                    {estado.texto}
                  </Badge>
                  {recado.avisoEnviadoEm ? <span className="text-[11px] text-muted-foreground">aviso enviado</span> : null}
                </span>
                <span className="flex items-center gap-1">
                  <OuvirRecado storagePath={recado.storagePath} duracaoS={recado.duracaoS} />
                  {!recado.ouvidoEm ? (
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-700" onClick={() => void apagar(recado)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> apagar
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
