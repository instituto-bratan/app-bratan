// GRAVAR, TRANSCREVER E ORGANIZAR A CONSULTA (28/09/2026).
//
// O fluxo que a Dra. Géssica pediu: "mediante a transcrição, a gravação da
// consulta, o sistema coloque as seguintes informações". Aqui:
// 1. consentimento registrado antes de gravar;
// 2. gravação guardada neste computador em pedaços;
// 3. transcrição na estação local (o áudio não sai do Mac);
// 4. organização pela IA, conferida contra a transcrição (extracao.ts);
// 5. as sugestões aparecem em cada linha para ela aceitar, editar ou recusar.
// Sem estação, a gravação fica guardada e o registro continua à mão.
import { useEffect, useRef, useState } from "react";
import { AudioLines, ClipboardPaste, FileAudio, Loader2, Mic, Pause, Play, RefreshCw, Sparkles, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { conteudoDoCampo } from "../dominio/campos";
import { conferirOrganizacao } from "../dominio/extracao";
import { CAMPO_IDS } from "../dominio/roteiro";
import { textoDaPrescricao } from "../dominio/suplementos";
import { gravacaoPendente, juntarTranscricoes } from "../dominio/transcricao";
import type { Atendimento, ConfigNutricao, ItemUso, OrganizacaoConsulta, Pessoa, SegmentoTranscricao, Transcricao } from "../dominio/tipos";
import { aguardarTranscricao, apagarAudioNaEstacao, EstacaoIndisponivel, enviarAudio, organizar, useEstacao } from "../estacao/cliente";
import { audioGuardado, formatarDuracao, useGravador } from "../gravacao/useGravador";
import { apagarPedacos } from "../store/db";
import * as repo from "../store/repositorio";
import { Bolinha, Dialogo, Interruptor } from "../ui/basicos";
import { minutoDe } from "./FalaDeOrigem";

type Fase =
  | { tipo: "livre" }
  | { tipo: "enviando" }
  | { tipo: "transcrevendo"; progresso: number; etapa: string }
  | { tipo: "organizando" }
  | { tipo: "aviso"; texto: string }
  | { tipo: "erro"; texto: string };

type Props = {
  atendimento: Atendimento;
  pessoa: Pessoa;
  itensUso: ItemUso[];
  anterior: Atendimento | null;
  config: ConfigNutricao;
  editavel: boolean;
  alterar: (mudanca: (a: Atendimento) => Atendimento) => void;
  /** Avisa a página quando gravação, transcrição ou organização estão em andamento. */
  aoMudarOcupado?: (ocupado: boolean) => void;
};

function Medidor({ nivel }: { nivel: number }) {
  const acesos = Math.round(nivel * 12);
  return (
    <span className="nutri-medidor" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} data-aceso={i < acesos ? "1" : "0"} />
      ))}
    </span>
  );
}

/** Texto colado vira segmentos: cada parágrafo é um trecho que a IA pode citar. */
export function segmentosDeTexto(texto: string): SegmentoTranscricao[] {
  return texto
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => ({ i, inicio: 0, fim: 0, texto: t }));
}

export function PainelDaGravacao({ atendimento, pessoa, itensUso, anterior, config, editavel, alterar, aoMudarOcupado }: Props) {
  const gravador = useGravador();
  const { saude } = useEstacao();
  const [fase, setFase] = useState<Fase>({ tipo: "livre" });
  const [colarAberto, setColarAberto] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  const [verTranscricao, setVerTranscricao] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const consentiu = Boolean(atendimento.consentimentoGravacao);
  const gravando = gravador.estado === "gravando" || gravador.estado === "pausado" || gravador.estado === "pedindo";
  const ocupado = fase.tipo === "enviando" || fase.tipo === "transcrevendo" || fase.tipo === "organizando" || gravador.estado === "finalizando";
  const iaPronta = Boolean(saude?.ia.configurada);
  // Gravação guardada que ainda não entrou na transcrição: primeiro transcrever (ou descartar).
  const pendenteId = gravacaoPendente(atendimento);
  const guardadaSemTranscricao = pendenteId !== null;

  useEffect(() => {
    aoMudarOcupado?.(gravando || ocupado);
  }, [gravando, ocupado, aoMudarOcupado]);

  const organizarAgora = async (segmentos: SegmentoTranscricao[]) => {
    if (!saude) {
      setFase({ tipo: "aviso", texto: "A transcrição está guardada. Ligue a estação local para a IA organizar." });
      return;
    }
    if (!saude.ia.configurada) {
      setFase({ tipo: "aviso", texto: "Transcrição pronta. A IA não está configurada na estação: preencha as linhas olhando a transcrição." });
      return;
    }
    setFase({ tipo: "organizando" });
    const itensRegistrados = itensUso.filter((i) => i.situacao === "em_uso").map((i) => ({ id: i.id, nome: i.nome, prescricao: textoDaPrescricao(i) }));
    try {
      const r = await organizar({
        pessoa: { nome: pessoa.nome },
        data: atendimento.data,
        segmentos,
        itensRegistrados,
        anterior: anterior
          ? { data: anterior.data, linhas: CAMPO_IDS.map((c) => ({ campo: c, texto: conteudoDoCampo(c, anterior.campos[c], config) })).filter((l) => l.texto) }
          : null,
      });
      const organizacao: OrganizacaoConsulta = conferirOrganizacao(r.resposta, segmentos, {
        itensRegistrados: itensRegistrados.map((i) => ({ id: i.id, nome: i.nome })),
        geradaEm: repo.agora(),
        modelo: r.modelo,
        novoId: repo.novoId,
      });
      alterar((a) => ({ ...a, organizacao }));
      const incertas = organizacao.campos.filter((c) => c.incerto).length;
      setFase({ tipo: "aviso", texto: `A IA sugeriu ${organizacao.campos.length} linha(s)${incertas ? `, ${incertas} para conferir com atenção` : ""}. Revise cada uma abaixo.` });
    } catch (e) {
      setFase({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  };

  /** Junta ao que já está no atendimento (não ao que estava quando a chamada começou). */
  const juntarAoAtendimento = (nova: Transcricao): Transcricao | null => {
    const resultado: { transcricao: Transcricao | null } = { transcricao: null };
    alterar((a) => {
      const id = nova.gravacoes?.[0];
      if (id && a.transcricao?.gravacoes?.includes(id)) return a;
      resultado.transcricao = juntarTranscricoes(a.transcricao, nova);
      return { ...a, transcricao: resultado.transcricao };
    });
    return resultado.transcricao;
  };

  const transcrever = async (audio: Blob, gravacaoId: string) => {
    setFase({ tipo: "enviando" });
    try {
      const { jobId } = await enviarAudio(gravacaoId, audio);
      const fim = await aguardarTranscricao(jobId, (e) =>
        setFase({ tipo: "transcrevendo", progresso: e.progresso, etapa: e.estado === "convertendo" ? "Preparando o áudio" : "Transcrevendo" }),
      );
      if (fim.estado === "erro" || !fim.resultado) throw new Error(fim.erro ?? "A transcrição não terminou.");
      const nova: Transcricao = { geradaEm: repo.agora(), motor: fim.resultado.motor, duracaoSeg: fim.resultado.duracaoSeg, segmentos: fim.resultado.segmentos, gravacoes: [gravacaoId] };
      // Trecho gravado depois de uma transcrição pronta entra no fim, com minutos e índices continuando.
      const transcricao = juntarAoAtendimento(nova);
      if (transcricao) await organizarAgora(transcricao.segmentos);
      else setFase({ tipo: "livre" });
    } catch (e) {
      if (e instanceof EstacaoIndisponivel) {
        setFase({ tipo: "aviso", texto: "Gravação guardada neste computador. Ligue a estação local e clique em “Transcrever”." });
      } else {
        setFase({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  // Cada gravação é um arquivo só. Gravar de novo depois de uma transcrição
  // pronta cria outro trecho, que entra no fim da transcrição.
  const trechoAtual = useRef<string | null>(null);

  const iniciarGravacao = async () => {
    const gravacaoId = repo.novoId();
    trechoAtual.current = gravacaoId;
    alterar((a) => ({ ...a, gravacaoId }));
    setFase({ tipo: "livre" });
    await gravador.iniciar({ id: gravacaoId, atendimentoId: atendimento.id });
  };

  const encerrarGravacao = async () => {
    const trecho = trechoAtual.current;
    const audio = await gravador.parar();
    if (audio && trecho) await transcrever(audio, trecho);
  };

  const transcreverGuardada = async () => {
    if (!pendenteId) return;
    const audio = await audioGuardado(pendenteId);
    if (!audio) {
      setFase({ tipo: "erro", texto: "O áudio deste trecho não está guardado neste computador. Descarte a gravação e, se precisar, envie o arquivo de novo." });
      return;
    }
    await transcrever(audio, pendenteId);
  };

  const descartarGuardada = async () => {
    const id = pendenteId;
    if (!id) return;
    await apagarPedacos(id);
    const g = await repo.lerGravacao(id);
    if (g) await repo.salvarGravacao({ ...g, apagadaEm: repo.agora() });
    void apagarAudioNaEstacao(id).catch(() => undefined);
    // Volta a apontar para o último trecho que já está na transcrição (se houver).
    alterar((a) => {
      const feitas = a.transcricao?.gravacoes ?? [];
      return { ...a, gravacaoId: feitas.length ? feitas[feitas.length - 1] : null };
    });
    setFase({ tipo: "aviso", texto: "Gravação descartada e apagada deste computador." });
  };

  const enviarArquivo = async (file: File) => {
    const gravacaoId = repo.novoId();
    alterar((a) => ({ ...a, gravacaoId }));
    await transcrever(file, gravacaoId);
  };

  const usarTextoColado = async () => {
    const segmentos = segmentosDeTexto(textoColado);
    if (segmentos.length === 0) return;
    setColarAberto(false);
    // Entra no fim da transcrição que já existe: as falas de origem já aceitas seguem apontando certo.
    const transcricao = juntarAoAtendimento({ geradaEm: repo.agora(), motor: "texto colado", duracaoSeg: 0, segmentos, gravacoes: [] });
    setTextoColado("");
    if (transcricao) await organizarAgora(transcricao.segmentos);
  };

  const segmentos = atendimento.transcricao?.segmentos ?? [];

  return (
    <section className="nutri-gravacao grid gap-3 px-4 py-3" aria-label="Gravação da consulta">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {gravando ? (
            <>
              <Bolinha estado={gravador.estado === "pausado" ? "pausa" : "grava"} />
              <span className="font-mono text-lg font-semibold tabular-nums text-brand-tinta" aria-live="polite">
                {formatarDuracao(gravador.segundos)}
              </span>
              <Medidor nivel={gravador.nivel} />
              <span className="text-xs text-muted-foreground">{gravador.estado === "pausado" ? "pausada" : "gravando · guardando neste computador a cada 5 s"}</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-musgo">
              <AudioLines className="h-4 w-4" aria-hidden="true" />
              {atendimento.transcricao
                ? `Transcrição pronta · ${atendimento.transcricao.motor}${atendimento.transcricao.duracaoSeg ? ` · ${formatarDuracao(atendimento.transcricao.duracaoSeg)}` : ""}${guardadaSemTranscricao ? " · um trecho gravado ainda não entrou" : ""}`
                : guardadaSemTranscricao
                  ? "Gravação guardada neste computador"
                  : "Consulta ainda não gravada"}
            </span>
          )}
        </div>

        {editavel ? (
          <div className="flex flex-wrap items-center gap-2">
            {!gravando ? (
              <>
                {guardadaSemTranscricao ? (
                  <>
                    <Button type="button" size="sm" className="gap-1.5" disabled={ocupado} onClick={() => void transcreverGuardada()}>
                      <RefreshCw className="h-4 w-4" aria-hidden="true" /> Transcrever
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={ocupado} onClick={() => void descartarGuardada()}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> Descartar a gravação
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" className="gap-1.5" disabled={!consentiu || ocupado} onClick={() => void iniciarGravacao()} title={consentiu ? "Começar a gravar" : "Registre o consentimento antes de gravar"}>
                    <Mic className="h-4 w-4" aria-hidden="true" /> {atendimento.transcricao ? "Gravar mais um trecho" : "Gravar consulta"}
                  </Button>
                )}
                {atendimento.transcricao && iaPronta ? (
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={ocupado} onClick={() => void organizarAgora(atendimento.transcricao?.segmentos ?? [])}>
                    <Sparkles className="h-4 w-4" aria-hidden="true" /> {atendimento.organizacao ? "Organizar de novo" : "Organizar com IA"}
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={ocupado || !consentiu || guardadaSemTranscricao} onClick={() => arquivo.current?.click()} title="Áudio gravado no celular, por exemplo">
                  <FileAudio className="h-4 w-4" aria-hidden="true" /> Enviar áudio
                </Button>
                <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={ocupado} onClick={() => setColarAberto(true)}>
                  <ClipboardPaste className="h-4 w-4" aria-hidden="true" /> Colar anotações
                </Button>
                <input
                  ref={arquivo}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void enviarArquivo(f);
                  }}
                />
              </>
            ) : (
              <>
                {gravador.estado === "pausado" ? (
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={gravador.retomar}>
                    <Play className="h-4 w-4" aria-hidden="true" /> Retomar
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={gravador.pausar} disabled={gravador.estado !== "gravando"}>
                    <Pause className="h-4 w-4" aria-hidden="true" /> Pausar
                  </Button>
                )}
                <Button type="button" size="sm" className="gap-1.5" onClick={() => void encerrarGravacao()}>
                  <Square className="h-3.5 w-3.5" aria-hidden="true" /> Encerrar e transcrever
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {editavel && !gravando ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Interruptor
            id="consentimento-gravacao"
            ligado={consentiu}
            aoMudar={(v) => alterar((a) => ({ ...a, consentimentoGravacao: v ? { em: repo.agora(), forma: "verbal" } : null }))}
            rotulo={consentiu ? `Consentimento para gravar registrado (${atendimento.consentimentoGravacao?.forma})` : "A pessoa consentiu com a gravação"}
          />
          {!saude ? <span className="text-xs text-muted-foreground">Estação local desligada: dá para gravar agora e transcrever depois.</span> : null}
        </div>
      ) : null}

      {gravador.erro ? <p className="text-sm text-red-800">{gravador.erro}</p> : null}
      {fase.tipo === "enviando" ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Enviando o áudio para a estação local…
        </p>
      ) : null}
      {fase.tipo === "transcrevendo" ? (
        <div className="grid gap-1" role="status">
          <p className="text-sm text-muted-foreground">
            {fase.etapa}… {fase.progresso}%
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand-oliva transition-[width]" style={{ width: `${Math.max(3, fase.progresso)}%` }} />
          </div>
        </div>
      ) : null}
      {fase.tipo === "organizando" ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> A IA está organizando a consulta nas linhas do roteiro. Leva alguns segundos.
        </p>
      ) : null}
      {fase.tipo === "aviso" ? <p className="text-sm text-brand-tinta">{fase.texto}</p> : null}
      {fase.tipo === "erro" ? <p className="text-sm text-red-800">{fase.texto}</p> : null}

      {segmentos.length ? (
        <div>
          <button type="button" className="text-xs font-semibold text-brand-oliva hover:underline" onClick={() => setVerTranscricao((v) => !v)} aria-expanded={verTranscricao}>
            {verTranscricao ? "Esconder a transcrição" : `Ver a transcrição (${segmentos.length} trechos)`}
          </button>
          {verTranscricao ? (
            <ol className="mt-2 grid max-h-72 gap-1 overflow-y-auto rounded-xl border border-brand-oliva/12 bg-white/60 p-3 text-sm">
              {segmentos.map((s) => (
                <li key={s.i} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{s.inicio || s.fim ? minutoDe(s.inicio) : `#${s.i + 1}`}</span>
                  <span>{s.texto}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <Dialogo
        aberto={colarAberto}
        aoFechar={() => setColarAberto(false)}
        titulo="Colar anotações ou transcrição"
        largura="max-w-2xl"
        acoes={
          <>
            <Button type="button" variant="ghost" onClick={() => setColarAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void usarTextoColado()} disabled={!textoColado.trim()}>
              {iaPronta ? "Organizar nas linhas" : "Guardar como transcrição"}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground">
          O texto original fica guardado junto do atendimento{atendimento.transcricao ? ", depois da transcrição que já existe" : ""}. Cada sugestão vai citar o trecho de onde saiu.
        </p>
        <textarea
          value={textoColado}
          onChange={(e) => setTextoColado(e.target.value)}
          rows={12}
          autoFocus
          className="w-full rounded-xl border border-brand-oliva/20 bg-white/80 p-3 text-sm focus:border-brand-dourado focus:outline-none focus:ring-2 focus:ring-brand-dourado/25"
          placeholder="Cole aqui o que você anotou ou a transcrição da consulta."
        />
      </Dialogo>
    </section>
  );
}
