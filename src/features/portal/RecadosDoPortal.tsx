// O RECADO TRANCADO NO PORTAL (27/10/2026) — motivo para abrir o Meu Bratan.
//
// HOJE: o recado do Dr. aparece como um cadeado com contagem regressiva ("faltam
// 12 dias"); no dia, abre e toca aqui. Quando abre, o ponto da aba Hoje acende
// até ele ser ouvido. Nos primeiros 30 dias do plano, o convite para gravar o
// próprio "por que eu comecei" também fica em Hoje.
// JORNADA: o "seu porquê" (convite, cadeado ou player) e os recados do Dr. que
// já foram ouvidos, para ouvir de novo.
//
// O portal nunca recebe o caminho do arquivo: antes da data só existe a
// contagem; depois, o play pede à função um link de 5 minutos (recado_url).
// Ninguém da equipe ouve o "porquê" do paciente — está escrito na tela.
import { useRef, useState } from "react";
import { Lock, MailOpen, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/avisos";
import { RECADO_MAX_SEGUNDOS, contagemDoRecado, diasEntre, duracaoDoRecadoTexto, estadoDoRecado, quandoAbreOPorque, validarAudioDoRecado } from "../../../supabase/functions/_shared/recadoTrancado";
import { apagarMeuPorque, gravarMeuPorque, linkDoRecado, marcarRecadoOuvido } from "./portalCliente";
import { diaLongo, diaMes, type PortalRecado } from "./portalPaciente";
import { audioParaBase64, gravacaoSuportada, useGravador } from "./useGravador";
import { vibrar } from "./movimento";

type Comum = {
  sessao: string | null;
  previa: boolean;
  recados: PortalRecado[];
  hojeISO: string;
  inicioDoPlano: string | null;
  /** Troca a lista na tela (prévia e depois de cada ação), sem recarregar o portal inteiro. */
  aoTrocar: (troca: (lista: PortalRecado[]) => PortalRecado[]) => void;
};

/** Os recados que abriram e ainda não foram ouvidos: é o que acende o ponto da aba Hoje. */
export function recadosNovos(recados: PortalRecado[] | undefined, hojeISO: string) {
  return (recados ?? []).filter((recado) => estadoDoRecado(recado, hojeISO) === "NOVO").length;
}

const tituloDoRecado = (recado: PortalRecado) => (recado.autor === "DOUTOR" ? `Recado do ${recado.quemFala || "Dr."}` : "Você, no começo");

/** "na terça-feira, 8 de novembro" · "no sábado, 12 de novembro". */
function noDia(iso: string) {
  const texto = diaLongo(iso);
  return /^(sábado|domingo)/.test(texto) ? `no ${texto}` : `na ${texto}`;
}

// ---- HOJE -----------------------------------------------------------------------

export function RecadosDeHoje({ sessao, previa, recados, hojeISO, inicioDoPlano, aoTrocar }: Comum) {
  const novos = recados.filter((r) => estadoDoRecado(r, hojeISO) === "NOVO").sort((a, b) => b.abreEm.localeCompare(a.abreEm));
  const trancados = recados.filter((r) => r.autor === "DOUTOR" && estadoDoRecado(r, hojeISO) === "TRANCADO").sort((a, b) => a.abreEm.localeCompare(b.abreEm));
  const temPorque = recados.some((r) => r.autor === "PACIENTE");
  const diaDoPlano = inicioDoPlano ? (diasEntre(inicioDoPlano, hojeISO) ?? -1) + 1 : 0;
  // O convite mora em Hoje só no começo do plano; depois, fica na Jornada.
  const convidar = !temPorque && diaDoPlano >= 1 && diaDoPlano <= 30;
  if (!novos.length && !trancados.length && !convidar) return null;
  return (
    <section id="recados" className="p-sec p-anim" aria-labelledby="t-recados">
      <span className="t-sec" id="t-recados">Recados para você</span>
      {novos.map((recado) => (
        <RecadoAberto key={recado.id} recado={recado} sessao={sessao} previa={previa} aoTrocar={aoTrocar} />
      ))}
      {trancados.map((recado) => (
        <RecadoTrancado key={recado.id} recado={recado} hojeISO={hojeISO} />
      ))}
      {convidar ? <ConviteDoPorque sessao={sessao} previa={previa} hojeISO={hojeISO} inicioDoPlano={inicioDoPlano} aoTrocar={aoTrocar} /> : null}
    </section>
  );
}

// ---- JORNADA --------------------------------------------------------------------

export function SeuPorque({ sessao, previa, recados, hojeISO, inicioDoPlano, aoTrocar }: Comum) {
  const meus = recados.filter((r) => r.autor === "PACIENTE");
  const trancado = meus.find((r) => estadoDoRecado(r, hojeISO) === "TRANCADO") ?? null;
  const abertos = meus.filter((r) => r !== trancado).sort((a, b) => b.abreEm.localeCompare(a.abreEm));
  const ouvidos = recados.filter((r) => r.autor === "DOUTOR" && estadoDoRecado(r, hojeISO) === "OUVIDO").sort((a, b) => b.abreEm.localeCompare(a.abreEm));
  return (
    <>
      <section id="seu-porque" className="p-sec p-anim" aria-labelledby="t-porque">
        <span className="t-sec" id="t-porque">Seu porquê</span>
        {trancado ? (
          <MeuPorqueTrancado recado={trancado} sessao={sessao} previa={previa} hojeISO={hojeISO} inicioDoPlano={inicioDoPlano} aoTrocar={aoTrocar} />
        ) : (
          <ConviteDoPorque sessao={sessao} previa={previa} hojeISO={hojeISO} inicioDoPlano={inicioDoPlano} aoTrocar={aoTrocar} deNovo={abertos.length > 0} />
        )}
        {abertos.map((recado) => (
          <RecadoAberto key={recado.id} recado={recado} sessao={sessao} previa={previa} aoTrocar={aoTrocar} podeApagar />
        ))}
      </section>
      {ouvidos.length ? (
        <section className="p-sec p-anim" aria-labelledby="t-recados-ouvidos">
          <span className="t-sec" id="t-recados-ouvidos">Recados que você já ouviu</span>
          {ouvidos.map((recado) => (
            <RecadoAberto key={recado.id} recado={recado} sessao={sessao} previa={previa} aoTrocar={aoTrocar} />
          ))}
        </section>
      ) : null}
    </>
  );
}

// ---- as peças -------------------------------------------------------------------

/** O cadeado: quem gravou, a contagem grande e o dia em que abre. Nada do conteúdo. */
function RecadoTrancado({ recado, hojeISO }: { recado: PortalRecado; hojeISO: string }) {
  const { dias, frase } = contagemDoRecado(recado.abreEm, hojeISO);
  return (
    <div className="p-card p-recado trancado">
      <div className="p-recado-cabeca">
        <span className="p-recado-icone" aria-hidden="true">
          <Lock size={20} strokeWidth={2.2} />
        </span>
        <div className="p-cresce">
          <p className="t-headline">Um recado do {recado.quemFala || "Dr."}</p>
          <p className="t-foot t-2">Gravado para você em {diaMes(recado.criadoEm.slice(0, 10) || recado.abreEm)}</p>
        </div>
      </div>
      <div className="p-recado-contagem" role="timer" aria-label={`O recado ${frase}`}>
        <span className="p-recado-dias">{dias}</span>
        <span className="p-recado-frase">{dias === 1 ? "dia" : "dias"} para abrir</span>
      </div>
      <p className="t-sub t-2">
        Abre {dias === 1 ? "amanhã" : noDia(recado.abreEm)}. No dia, ele aparece aqui para você ouvir — e, se os avisos estiverem ligados, o celular avisa.
      </p>
    </div>
  );
}

/** Recado que já abriu: o player, e o "novo" até ser ouvido até o fim. */
function RecadoAberto({ recado, sessao, previa, aoTrocar, podeApagar = false }: { recado: PortalRecado; sessao: string | null; previa: boolean; aoTrocar: Comum["aoTrocar"]; podeApagar?: boolean }) {
  const novo = !recado.ouvidoEm;
  const [apagando, setApagando] = useState(false);
  async function obterUrl() {
    if (previa || !sessao) {
      toast("Na demonstração não há áudio: ninguém grava a voz do médico de mentira.", { tom: "info" });
      return null;
    }
    const r = await linkDoRecado(sessao, recado.id);
    if (!r.ok || !r.url) {
      toast(r.error ?? "Não consegui abrir o áudio agora. Tente de novo.", { tom: "erro" });
      return null;
    }
    return r.url;
  }
  function ouviu() {
    if (recado.ouvidoEm) return;
    aoTrocar((lista) => lista.map((r) => (r.id === recado.id ? { ...r, ouvidoEm: new Date().toISOString() } : r)));
    if (sessao && !previa) void marcarRecadoOuvido(sessao, recado.id);
  }
  async function apagar() {
    if (!window.confirm("Apagar o seu recado? Ele some de verdade — não fica cópia em lugar nenhum.")) return;
    setApagando(true);
    try {
      if (!previa && sessao) {
        const r = await apagarMeuPorque(sessao, recado.id);
        if (!r.ok) return toast(r.error ?? "Não consegui apagar agora.", { tom: "erro" });
      }
      aoTrocar((lista) => lista.filter((r) => r.id !== recado.id));
      toast("Recado apagado.", { tom: "ok" });
    } finally {
      setApagando(false);
    }
  }
  return (
    <div className={`p-card p-recado aberto${novo ? " novo" : ""}`}>
      <div className="p-recado-cabeca">
        <span className="p-recado-icone" aria-hidden="true">
          <MailOpen size={20} strokeWidth={2.2} />
        </span>
        <div className="p-cresce">
          <p className="t-headline">{tituloDoRecado(recado)}</p>
          <p className="t-foot t-2">
            Abriu em {diaMes(recado.abreEm)} · {duracaoDoRecadoTexto(recado.duracaoS)}
            {recado.autor === "PACIENTE" ? " · só você ouve" : ""}
          </p>
        </div>
        {novo ? <span className="p-pill tint">novo</span> : null}
      </div>
      <PlayerDoRecado obterUrl={obterUrl} duracaoS={recado.duracaoS} rotulo={`Ouvir: ${tituloDoRecado(recado)}`} aoTerminar={ouviu} />
      {recado.autor === "PACIENTE" && novo ? <p className="t-sub t-2">Você gravou isto no começo. Vale ouvir com calma.</p> : null}
      {podeApagar ? (
        <button type="button" className="p-btn plain mini" style={{ justifySelf: "start" }} disabled={apagando} onClick={() => void apagar()}>
          <Trash2 size={16} aria-hidden="true" /> Apagar o meu recado
        </button>
      ) : null}
    </div>
  );
}

/** O "porquê" guardado: a contagem até o dia de abrir, e as saídas (gravar de novo, apagar). */
function MeuPorqueTrancado({ recado, sessao, previa, hojeISO, inicioDoPlano, aoTrocar }: { recado: PortalRecado; sessao: string | null; previa: boolean; hojeISO: string; inicioDoPlano: string | null; aoTrocar: Comum["aoTrocar"] }) {
  const { dias } = contagemDoRecado(recado.abreEm, hojeISO);
  const [regravando, setRegravando] = useState(false);
  const [apagando, setApagando] = useState(false);
  async function apagar() {
    if (!window.confirm("Apagar o seu recado? Ele some de verdade — não fica cópia em lugar nenhum.")) return;
    setApagando(true);
    try {
      if (!previa && sessao) {
        const r = await apagarMeuPorque(sessao, recado.id);
        if (!r.ok) return toast(r.error ?? "Não consegui apagar agora.", { tom: "erro" });
      }
      aoTrocar((lista) => lista.filter((r) => r.id !== recado.id));
      toast("Recado apagado.", { tom: "ok" });
    } finally {
      setApagando(false);
    }
  }
  return (
    <div className="p-card p-recado trancado">
      <div className="p-recado-cabeca">
        <span className="p-recado-icone" aria-hidden="true">
          <Lock size={20} strokeWidth={2.2} />
        </span>
        <div className="p-cresce">
          <p className="t-headline">Seu porquê está guardado</p>
          <p className="t-foot t-2">Gravado em {diaMes(recado.criadoEm.slice(0, 10) || hojeISO)} · só você ouve</p>
        </div>
      </div>
      <div className="p-recado-contagem" role="timer" aria-label={`Abre em ${dias} ${dias === 1 ? "dia" : "dias"}`}>
        <span className="p-recado-dias">{dias}</span>
        <span className="p-recado-frase">{dias === 1 ? "dia" : "dias"} para abrir</span>
      </div>
      <p className="t-sub t-2">Abre {noDia(recado.abreEm)}. Até lá, nem você ouve: é a graça de lembrar por que começou.</p>
      {regravando ? (
        <GravadorDoPorque sessao={sessao} previa={previa} hojeISO={hojeISO} inicioDoPlano={inicioDoPlano} aoTrocar={aoTrocar} aoFechar={() => setRegravando(false)} />
      ) : (
        <div className="p-recado-acoes">
          <button type="button" className="p-btn plain mini" onClick={() => setRegravando(true)}>
            <Mic size={16} aria-hidden="true" /> Gravar de novo
          </button>
          <button type="button" className="p-btn plain mini" disabled={apagando} onClick={() => void apagar()}>
            <Trash2 size={16} aria-hidden="true" /> Apagar
          </button>
        </div>
      )}
    </div>
  );
}

/** O convite para gravar o próprio "por que eu comecei". */
function ConviteDoPorque({ sessao, previa, hojeISO, inicioDoPlano, aoTrocar, deNovo = false }: { sessao: string | null; previa: boolean; hojeISO: string; inicioDoPlano: string | null; aoTrocar: Comum["aoTrocar"]; deNovo?: boolean }) {
  const [gravando, setGravando] = useState(false);
  const { abreEm, noDia45DoPlano } = quandoAbreOPorque(inicioDoPlano, hojeISO);
  return (
    <div className="p-card p-recado convite">
      <div className="p-recado-cabeca">
        <span className="p-recado-icone" aria-hidden="true">
          <Mic size={20} strokeWidth={2.2} />
        </span>
        <div className="p-cresce">
          <p className="t-headline">{deNovo ? "Quer gravar um novo porquê?" : "Por que você começou?"}</p>
          <p className="t-foot t-2">Um recado de você para você, de até 1 minuto</p>
        </div>
      </div>
      <p className="t-sub t-2">
        Conte o motivo que trouxe você até aqui. O áudio fica trancado e abre só para você {noDia45DoPlano ? "no dia 45 do plano" : "daqui a 45 dias"}, {noDia(abreEm)}. Ninguém da equipe ouve.
      </p>
      {gravando ? (
        <GravadorDoPorque sessao={sessao} previa={previa} hojeISO={hojeISO} inicioDoPlano={inicioDoPlano} aoTrocar={aoTrocar} aoFechar={() => setGravando(false)} />
      ) : (
        <button type="button" className="p-btn tonal" onClick={() => setGravando(true)}>
          <Mic size={18} aria-hidden="true" /> Gravar o meu porquê
        </button>
      )}
    </div>
  );
}

/** Gravar, ouvir antes, guardar. Em até 1 minuto; para sozinho no limite. */
function GravadorDoPorque({ sessao, previa, hojeISO, inicioDoPlano, aoTrocar, aoFechar }: { sessao: string | null; previa: boolean; hojeISO: string; inicioDoPlano: string | null; aoTrocar: Comum["aoTrocar"]; aoFechar: () => void }) {
  const gravador = useGravador(RECADO_MAX_SEGUNDOS);
  const [enviando, setEnviando] = useState(false);
  const podeGravar = gravacaoSuportada();

  async function guardar() {
    if (!gravador.audio) return;
    const problema = validarAudioDoRecado(gravador.mime, gravador.audio.size, gravador.segundos);
    if (problema) return toast(problema, { tom: "atencao" });
    setEnviando(true);
    try {
      if (previa || !sessao) return;
      const r = await gravarMeuPorque(sessao, await audioParaBase64(gravador.audio), gravador.mime, gravador.segundos ?? 1);
      if (!r.ok || !r.recado) return toast(r.error ?? "Não consegui guardar o áudio agora.", { tom: "erro" });
      const novo = r.recado;
      // O servidor troca o "porquê" que ainda estava trancado pelo novo.
      aoTrocar((lista) => [novo, ...lista.filter((x) => !(x.autor === "PACIENTE" && x.abreEm > hojeISO))]);
      vibrar(12);
      toast(`Guardado e trancado até ${diaMes(novo.abreEm)}.`, { tom: "ok", duracaoMs: 6000 });
      aoFechar();
    } catch {
      toast("Não consegui ler o áudio gravado. Grave de novo.", { tom: "erro" });
    } finally {
      setEnviando(false);
    }
  }

  if (previa) {
    return (
      <div className="p-gravador">
        <p className="t-foot t-2">Na demonstração não dá para gravar. Quem entra pelo app grava aqui, do próprio celular.</p>
        <button type="button" className="p-btn plain mini" onClick={aoFechar}>Entendi</button>
      </div>
    );
  }
  if (!podeGravar) {
    return (
      <div className="p-gravador">
        <p className="t-foot t-2">Este aparelho não grava áudio por aqui. Abra o Meu Bratan no celular para gravar.</p>
        <button type="button" className="p-btn plain mini" onClick={aoFechar}>Entendi</button>
      </div>
    );
  }
  return (
    <div className="p-gravador">
      {gravador.estado === "gravando" ? (
        <button type="button" className="p-btn full p-gravando" onClick={gravador.parar}>
          <Square size={16} fill="currentColor" aria-hidden="true" /> Parar · {duracaoDoRecadoTexto(gravador.cronometro)} de 1:00
        </button>
      ) : gravador.estado === "pronto" && gravador.previaUrl ? (
        <>
          <PlayerDoRecado key={gravador.previaUrl} obterUrl={async () => gravador.previaUrl} duracaoS={gravador.segundos ?? 0} rotulo="Ouvir o que você gravou" />
          <div className="p-botoes">
            <button type="button" className="p-btn full" disabled={enviando} onClick={() => void guardar()}>
              {enviando ? "Guardando" : "Guardar e trancar"}
            </button>
            <button type="button" className="p-btn plain" disabled={enviando} onClick={() => { gravador.descartar(); void gravador.iniciar(); }}>
              Gravar de novo
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="p-btn full" onClick={() => void gravador.iniciar()}>
          <Mic size={18} aria-hidden="true" /> Começar a gravar
        </button>
      )}
      {gravador.erro ? <p className="t-foot" style={{ color: "var(--p-bad-fg)" }}>{gravador.erro}</p> : null}
      {gravador.estado !== "gravando" ? (
        <button type="button" className="p-btn plain mini" disabled={enviando} onClick={() => { gravador.descartar(); aoFechar(); }}>
          Agora não
        </button>
      ) : null}
    </div>
  );
}

/**
 * O player do recado, no desenho da voz do doutor. O link só é pedido no
 * primeiro toque (e de novo se vencer): nada de áudio carregado à toa.
 */
function PlayerDoRecado({ obterUrl, duracaoS, rotulo, aoTerminar }: { obterUrl: () => Promise<string | null>; duracaoS: number; rotulo: string; aoTerminar?: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [temLink, setTemLink] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [posicao, setPosicao] = useState(0);
  const [duracao, setDuracao] = useState(duracaoS);
  const [erro, setErro] = useState("");
  const fmt = (s: number) => duracaoDoRecadoTexto(Math.floor(s));

  async function alternar() {
    const audio = audioRef.current;
    if (!audio) return;
    setErro("");
    if (!temLink) {
      setCarregando(true);
      try {
        const url = await obterUrl();
        if (!url) return;
        audio.src = url;
        setTemLink(true);
      } finally {
        setCarregando(false);
      }
    }
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch {
      setErro("Não consegui tocar o áudio neste aparelho. Tente de novo.");
    }
  }
  const pct = duracao > 0 ? Math.min(100, (posicao / duracao) * 100) : 0;
  return (
    <>
      <div className="p-voz-player">
        <button type="button" className="p-voz-play" aria-label={tocando ? "Pausar" : rotulo} disabled={carregando} onClick={() => void alternar()}>
          {tocando ? <Pause size={22} strokeWidth={2.4} /> : <Play size={22} strokeWidth={2.4} style={{ marginLeft: 3 }} />}
        </button>
        <div className="p-voz-barra" role="progressbar" aria-label="Quanto do recado já tocou" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <span className="p-voz-tempo">
          {fmt(posicao)} / {fmt(duracao)}
        </span>
      </div>
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setPosicao(0);
          aoTerminar?.();
        }}
        onTimeUpdate={(e) => setPosicao(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuracao(d);
        }}
        onError={() => {
          if (!temLink) return;
          // O link de 5 minutos venceu (ou o formato não toca aqui): o próximo toque pede outro.
          setTemLink(false);
          setTocando(false);
          setErro("O áudio não abriu. Toque de novo para tentar outra vez.");
        }}
      />
      {erro ? <p className="t-foot t-2">{erro}</p> : null}
    </>
  );
}
