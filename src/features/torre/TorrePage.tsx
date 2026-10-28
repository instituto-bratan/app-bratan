// TORRE BRATAN (28/10/2026) — a tela /torre: o mapa vivo dos sistemas.
//
// O Lucas pediu um sistema de verdade para a visão geral ("como o Maestri",
// "não ficar só aqui"). Fase 1:
//  · o mapa num quadro sem fim: arrasta para andar, pinça (ou ⌘ + rolar) para
//    o zoom, e os cartões mudam de lugar e ficam onde a pessoa deixou (neste
//    aparelho); de longe, cada cartão vira só o nome na cor da situação;
//  · os números são os da Central (a mesma consulta central-resumo) e se leem
//    de novo sozinhos a cada 2 minutos;
//  · ao lado, o painel do cartão escolhido: o que é, como está, o que travou, o
//    próximo passo e a tela onde se resolve (só se a pessoa abre aquela tela);
//  · aberta daqui, a página se apresenta como o app "Torre Bratan" (manifesto e
//    ícone próprios), para ir ao Dock do Mac e à tela de início do iPad.
// A porta é o módulo "central" de Acessos, como a Central (rota e banco).
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as EventoDePonteiro } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Maximize2, Minus, Plus, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { BlocoFolha } from "@/components/ui/blocos";
import { Botao, LinkSeta } from "@/components/ui/botao";
import { Cabecalho } from "@/components/ui/cabecalho";
import { useAuth } from "@/hooks/useAuth";
import { canSeeModule } from "@/lib/access";
import { readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { podeVerDestino, resolverRota } from "@/lib/navegacao";
import { carregarResumoDaCentral } from "@/lib/remote/central";
import { useVersaoDoMotor } from "@/lib/useConfigDoMotor";
import { cn } from "@/lib/utils";
import { useContadoresDaTela } from "@/layouts/casca/contexto";
import { decisoesDaCentral, mensagemDoErroDaCentral, montarCentral, resumoDeExemplo } from "@/features/central/central";
import { Rubrica } from "@/features/central/pecasDaCentral";
import { extratoDaPessoa, PESSOAS_DO_EXTRATO } from "@/features/financeiro/extratoDosSocios";
import { useFinanceiro } from "@/features/financeiro/useFinanceiro";
import { useIdentidadeDoApp, type IdentidadeDoApp } from "@/features/fechamento/useIdentidadeDoApp";
import {
  ALTURA,
  LARGURA,
  VISTAS,
  caminhoDaAresta,
  montarMapa,
  type ItemEsperando,
  type JeitoDaLinha,
  type LucroDaTorre,
  type MapaDaTorre,
  type NoDaTorre,
  type Retangulo,
  type TomDoNo,
} from "./torre";

/** Aberta daqui, a página instala como o app "Torre Bratan" (Dock do Mac, tela do iPad). */
export const IDENTIDADE_DA_TORRE: IdentidadeDoApp = {
  manifesto: "/torre.webmanifest",
  icone: "/torre-apple-touch-icon.png",
  titulo: "Torre Bratan",
};

/** Abaixo deste zoom o cartão vira só o nome (o texto miúdo não se lê). */
const ZOOM_DE_PERTO = 0.92;
const ZOOM_MINIMO = 0.3;
const ZOOM_MAXIMO = 1.6;
const RELER_A_CADA = 2 * 60_000;

/** Função ainda não aplicada (PGRST202) ou acesso tirado (42501): tentar de novo não adianta. */
function valeTentarDeNovo(tentativas: number, erro: unknown) {
  const codigo = String((erro as { code?: unknown } | null)?.code ?? "");
  return tentativas < 1 && codigo !== "PGRST202" && codigo !== "42501";
}

const prende = (valor: number, minimo: number, maximo: number) => Math.max(minimo, Math.min(maximo, valor));

type Posicoes = Record<string, { x: number; y: number }>;

export function TorrePage() {
  useIdentidadeDoApp(IDENTIDADE_DA_TORRE);
  const { pessoa, session, isPreview } = useAuth();
  const remoto = Boolean(pessoa && session && !isPreview);
  const contadores = useContadoresDaTela();

  // A MESMA consulta da Central: os dois lugares nunca mostram número diferente.
  const consulta = useQuery({
    queryKey: ["central-resumo"],
    queryFn: carregarResumoDaCentral,
    enabled: remoto,
    staleTime: 60_000,
    refetchInterval: RELER_A_CADA,
    refetchOnWindowFocus: true,
    retry: valeTentarDeNovo,
  });

  // Prévia sem banco: um resumo FICTÍCIO no mesmo formato (a tela avisa).
  const [agoraDaPrevia] = useState(() => new Date().toISOString());
  const bruto = remoto ? consulta.data : resumoDeExemplo(agoraDaPrevia);
  const central = useMemo(() => (bruto ? montarCentral(bruto) : null), [bruto]);
  const decisoes = useMemo(
    () => decisoesDaCentral(contadores.decisoes, contadores.veNotas ? contadores.notasSemCpf.length : 0),
    [contadores.decisoes, contadores.veNotas, contadores.notasSemCpf.length],
  );

  // O Lucro Inteligente só para quem já vê o Extrato de cada um; soma depois
  // que o mapa aparece, para não atrasar a primeira pintura.
  const veLucro = canSeeModule(pessoa, "fin-lucro");
  const [lucro, setLucro] = useState<LucroDaTorre | null>(null);
  const [lerLucro, setLerLucro] = useState(false);
  useEffect(() => {
    if (!veLucro) return;
    const espera = window.setTimeout(() => setLerLucro(true), 400);
    return () => window.clearTimeout(espera);
  }, [veLucro]);

  const mapaDoBanco = useMemo(
    () => (central ? montarMapa({ central, bruto, decisoes, lucro: veLucro ? lucro ?? "lendo" : null }) : null),
    [central, bruto, decisoes, veLucro, lucro],
  );

  // Os cartões arrastados ficam onde a pessoa deixou (neste aparelho).
  const chaveDasPosicoes = `torre:posicoes:${pessoa?.id ?? "previa"}`;
  const [posicoes, setPosicoes] = useState<Posicoes>(() => readLocalValue<Posicoes>(chaveDasPosicoes, {}));
  const posicoesAtuais = useRef(posicoes);
  posicoesAtuais.current = posicoes;
  const mapa = useMemo<MapaDaTorre | null>(
    () => (mapaDoBanco ? { ...mapaDoBanco, nos: mapaDoBanco.nos.map((no) => (posicoes[no.id] ? { ...no, ...posicoes[no.id] } : no)) } : null),
    [mapaDoBanco, posicoes],
  );
  const mover = useCallback((id: string, x: number, y: number) => setPosicoes((antes) => ({ ...antes, [id]: { x, y } })), []);
  const soltar = useCallback(() => writeLocalValue(chaveDasPosicoes, posicoesAtuais.current), [chaveDasPosicoes]);
  function arrumar() {
    setPosicoes({});
    writeLocalValue(chaveDasPosicoes, {});
  }

  const [selecionado, setSelecionado] = useState("esperando");
  const [soEsperando, setSoEsperando] = useState(false);
  // No celular o mapa inteiro fica miúdo: abre já em "Consulta e venda".
  const [vista, setVista] = useState(() => ({ id: typeof window !== "undefined" && window.innerWidth < 640 ? "venda" : "tudo", vez: 0 }));
  const noEscolhido = mapa?.nos.find((no) => no.id === selecionado) ?? mapa?.nos.find((no) => no.id === "esperando") ?? null;

  // O link só aparece se a pessoa abre aquela tela (a mesma regra do menu).
  const podeAbrir = useCallback(
    (to: string) => {
      const destino = resolverRota(to)?.destino ?? null;
      return Boolean(destino && podeVerDestino(pessoa, destino));
    },
    [pessoa],
  );

  const carregando = remoto && consulta.isLoading;
  const erro = remoto && consulta.error ? mensagemDoErroDaCentral(consulta.error) : null;
  const quantosEsperam = mapa?.esperando.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] font-sans text-tinta">
      <Cabecalho
        sobrancelha="Início · Torre"
        titulo={
          <>
            Torre <em>Bratan</em>
          </>
        }
        frase={
          carregando ? (
            "Lendo o banco…"
          ) : !central ? (
            erro ?? "Sem leitura do banco agora."
          ) : (
            <>
              <strong>{central.frase}</strong> {central.quando ? `Leitura de ${central.quando}; lê de novo sozinha a cada 2 minutos.` : ""}
            </>
          )
        }
        acoes={
          <>
            <Botao
              variante="fantasma"
              icone={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void consulta.refetch()}
              carregando={remoto && consulta.isFetching}
              disabled={!remoto}
            >
              Atualizar
            </Botao>
            <LinkSeta to="/central">Ver em lista</LinkSeta>
          </>
        }
      />

      {!remoto ? <p className="-mt-4 mb-4 text-[13px] font-medium leading-5 text-tinta-2">Prévia: números de exemplo, sem dado da clínica.</p> : null}

      {erro ? (
        <BlocoFolha as="div" respiro role="alert" className="mb-4 flex items-start gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-atencao" strokeWidth={2.25} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold leading-6 text-tinta">{erro}</p>
            {central ? <p className="text-[13px] font-medium leading-5 text-tinta-2">O mapa mostra a última leitura que deu certo.</p> : null}
          </div>
        </BlocoFolha>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Enquadrar o mapa">
        {VISTAS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={vista.id === item.id}
            onClick={() => setVista((antes) => ({ id: item.id, vez: antes.vez + 1 }))}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-bold leading-5 transition-colors",
              vista.id === item.id ? "border-musgo bg-musgo text-sobre-musgo" : "border-fio-2 bg-folha text-tinta hover:border-musgo",
            )}
          >
            {item.rotulo}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          aria-pressed={soEsperando}
          onClick={() => {
            setSoEsperando((antes) => !antes);
            setSelecionado("esperando");
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-bold leading-5 transition-colors",
            soEsperando ? "border-atencao bg-atencao-claro text-atencao" : "border-fio-2 bg-folha text-tinta hover:border-atencao",
          )}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          Esperando você{quantosEsperam ? ` (${quantosEsperam})` : ""}
        </button>
        {Object.keys(posicoes).length ? (
          <Botao variante="fantasma" tamanho="pq" icone={<RotateCcw className="h-4 w-4" aria-hidden="true" />} onClick={arrumar}>
            Arrumar como era
          </Botao>
        ) : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {mapa ? (
          <TelaDaTorre
            mapa={mapa}
            selecionado={noEscolhido?.id ?? ""}
            soEsperando={soEsperando}
            vista={vista}
            onSelecionar={setSelecionado}
            onMover={mover}
            onSoltar={soltar}
          />
        ) : (
          <BlocoFolha respiro className="grid h-[62dvh] min-h-[420px] place-items-center lg:h-[calc(100dvh-19rem)] lg:min-h-[520px]">
            <p className="text-sm font-semibold text-tinta-2">{carregando ? "Montando o mapa…" : "Sem leitura do banco agora."}</p>
          </BlocoFolha>
        )}
        {noEscolhido && mapa ? <PainelDaTorre no={noEscolhido} mapa={mapa} podeAbrir={podeAbrir} onSelecionar={setSelecionado} /> : null}
      </div>

      <Legenda />

      {veLucro && lerLucro ? <LeitorDoLucro onLido={setLucro} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- o quadro

const TRACO: Record<JeitoDaLinha, string> = {
  sozinho: "stroke-ok [stroke-dasharray:6_4] motion-safe:animate-[torre-fluxo_1.2s_linear_infinite]",
  parado: "stroke-tinta-2/50",
  "a-mao": "stroke-atencao [stroke-dasharray:5_5]",
  desligado: "stroke-tinta-2/50 [stroke-dasharray:1_6] [stroke-linecap:round]",
};

const PONTA: Record<JeitoDaLinha, string> = {
  sozinho: "stroke-ok",
  parado: "stroke-tinta-2/50",
  "a-mao": "stroke-atencao",
  desligado: "stroke-tinta-2/50",
};

type Gesto =
  | { tipo: "andar"; sx: number; sy: number; cx: number; cy: number; moveu: boolean }
  | { tipo: "cartao"; id: string; sx: number; sy: number; ox: number; oy: number; moveu: boolean }
  | { tipo: "pinca"; distancia: number; meio: { x: number; y: number }; camera: { x: number; y: number; s: number } };

function TelaDaTorre({
  mapa,
  selecionado,
  soEsperando,
  vista,
  onSelecionar,
  onMover,
  onSoltar,
}: {
  mapa: MapaDaTorre;
  selecionado: string;
  soEsperando: boolean;
  vista: { id: string; vez: number };
  onSelecionar: (id: string) => void;
  onMover: (id: string, x: number, y: number) => void;
  onSoltar: () => void;
}) {
  const telaRef = useRef<HTMLDivElement>(null);
  const mundoRef = useRef<HTMLDivElement>(null);
  const camera = useRef({ x: 0, y: 0, s: 0.5 });
  const [deLonge, setDeLonge] = useState(true);
  const deLongeAgora = useRef(true);
  const mexeu = useRef(false);
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<Gesto | null>(null);
  const nosAtuais = useRef(mapa.nos);
  nosAtuais.current = mapa.nos;

  const aplicar = useCallback((animar = false) => {
    const tela = telaRef.current;
    const mundo = mundoRef.current;
    if (!tela || !mundo) return;
    const { x, y, s } = camera.current;
    mundo.style.transition = animar ? "transform 450ms cubic-bezier(.2,.7,.2,1)" : "none";
    mundo.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    tela.style.backgroundSize = `${24 * s}px ${24 * s}px`;
    tela.style.backgroundPosition = `${x}px ${y}px`;
    const longe = s < ZOOM_DE_PERTO;
    if (longe !== deLongeAgora.current) {
      deLongeAgora.current = longe;
      setDeLonge(longe);
    }
  }, []);

  const enquadrar = useCallback(
    (alvo: Retangulo, animar: boolean) => {
      const tela = telaRef.current;
      if (!tela || !tela.clientWidth) return;
      const s = Math.min(1.1, Math.min(tela.clientWidth / alvo.w, tela.clientHeight / alvo.h) * 0.96);
      camera.current = { s, x: (tela.clientWidth - alvo.w * s) / 2 - alvo.x * s, y: (tela.clientHeight - alvo.h * s) / 2 - alvo.y * s };
      mexeu.current = false;
      aplicar(animar);
    },
    [aplicar],
  );

  const vistaAtual = VISTAS.find((item) => item.id === vista.id) ?? VISTAS[0];
  useEffect(() => {
    enquadrar(vistaAtual, vista.vez > 0);
  }, [vista, vistaAtual, enquadrar]);

  // Mudou o tamanho da janela e a pessoa ainda não mexeu: enquadra de novo.
  useEffect(() => {
    const tela = telaRef.current;
    if (!tela || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(() => {
      if (!mexeu.current) enquadrar(vistaAtual, false);
    });
    observador.observe(tela);
    return () => observador.disconnect();
  }, [enquadrar, vistaAtual]);

  const zoomEm = useCallback(
    (px: number, py: number, fator: number) => {
      const atual = camera.current;
      const s = prende(atual.s * fator, ZOOM_MINIMO, ZOOM_MAXIMO);
      const k = s / atual.s;
      camera.current = { s, x: px - (px - atual.x) * k, y: py - (py - atual.y) * k };
      mexeu.current = true;
      aplicar();
    },
    [aplicar],
  );

  const zoomNoMeio = (fator: number) => {
    const tela = telaRef.current;
    if (tela) zoomEm(tela.clientWidth / 2, tela.clientHeight / 2, fator);
  };

  // Rolar anda pelo mapa; com ⌘/Ctrl (e a pinça do trackpad) é zoom.
  useEffect(() => {
    const tela = telaRef.current;
    if (!tela) return;
    const aoRolar = (evento: WheelEvent) => {
      evento.preventDefault();
      if (evento.ctrlKey || evento.metaKey) {
        const caixa = tela.getBoundingClientRect();
        zoomEm(evento.clientX - caixa.left, evento.clientY - caixa.top, Math.exp(-evento.deltaY * 0.01));
        return;
      }
      camera.current = { ...camera.current, x: camera.current.x - evento.deltaX, y: camera.current.y - evento.deltaY };
      mexeu.current = true;
      aplicar();
    };
    tela.addEventListener("wheel", aoRolar, { passive: false });
    return () => tela.removeEventListener("wheel", aoRolar);
  }, [aplicar, zoomEm]);

  function relativo(x: number, y: number) {
    const caixa = telaRef.current?.getBoundingClientRect();
    return { x: x - (caixa?.left ?? 0), y: y - (caixa?.top ?? 0) };
  }

  function aoApertar(evento: EventoDePonteiro<HTMLDivElement>) {
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    if ((evento.target as HTMLElement).closest("[data-controle]")) return;
    telaRef.current?.setPointerCapture(evento.pointerId);
    ponteiros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    if (ponteiros.current.size === 2) {
      const [a, b] = [...ponteiros.current.values()];
      gesto.current = { tipo: "pinca", distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1, meio: relativo((a.x + b.x) / 2, (a.y + b.y) / 2), camera: { ...camera.current } };
      return;
    }
    const cartao = (evento.target as HTMLElement).closest<HTMLElement>("[data-no]");
    const no = cartao ? nosAtuais.current.find((item) => item.id === cartao.dataset.no) : null;
    gesto.current = no
      ? { tipo: "cartao", id: no.id, sx: evento.clientX, sy: evento.clientY, ox: no.x, oy: no.y, moveu: false }
      : { tipo: "andar", sx: evento.clientX, sy: evento.clientY, cx: camera.current.x, cy: camera.current.y, moveu: false };
  }

  function aoMover(evento: EventoDePonteiro<HTMLDivElement>) {
    if (!ponteiros.current.has(evento.pointerId)) return;
    ponteiros.current.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    const atual = gesto.current;
    if (!atual) return;
    if (atual.tipo === "pinca") {
      if (ponteiros.current.size < 2) return;
      const [a, b] = [...ponteiros.current.values()];
      const meio = relativo((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s = prende(atual.camera.s * (Math.hypot(a.x - b.x, a.y - b.y) / atual.distancia), ZOOM_MINIMO, ZOOM_MAXIMO);
      const k = s / atual.camera.s;
      camera.current = {
        s,
        x: atual.meio.x - (atual.meio.x - atual.camera.x) * k + (meio.x - atual.meio.x),
        y: atual.meio.y - (atual.meio.y - atual.camera.y) * k + (meio.y - atual.meio.y),
      };
      mexeu.current = true;
      aplicar();
      return;
    }
    const dx = evento.clientX - atual.sx;
    const dy = evento.clientY - atual.sy;
    if (!atual.moveu && Math.hypot(dx, dy) < 4) return;
    atual.moveu = true;
    telaRef.current?.classList.add("cursor-grabbing");
    if (atual.tipo === "cartao") {
      onMover(atual.id, Math.round(atual.ox + dx / camera.current.s), Math.round(atual.oy + dy / camera.current.s));
      return;
    }
    camera.current = { ...camera.current, x: atual.cx + dx, y: atual.cy + dy };
    mexeu.current = true;
    aplicar();
  }

  function aoSoltar(evento: EventoDePonteiro<HTMLDivElement>) {
    ponteiros.current.delete(evento.pointerId);
    const atual = gesto.current;
    telaRef.current?.classList.remove("cursor-grabbing");
    if (atual?.tipo === "cartao") {
      if (atual.moveu) onSoltar();
      else onSelecionar(atual.id);
    }
    if (atual?.tipo !== "pinca" || ponteiros.current.size === 0) gesto.current = null;
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLDivElement>) {
    if (evento.target !== evento.currentTarget) return;
    const passo = 60;
    const teclas: Record<string, () => void> = {
      "+": () => zoomNoMeio(1.2),
      "=": () => zoomNoMeio(1.2),
      "-": () => zoomNoMeio(1 / 1.2),
      "0": () => enquadrar(VISTAS[0], true),
      ArrowLeft: () => (camera.current = { ...camera.current, x: camera.current.x + passo }),
      ArrowRight: () => (camera.current = { ...camera.current, x: camera.current.x - passo }),
      ArrowUp: () => (camera.current = { ...camera.current, y: camera.current.y + passo }),
      ArrowDown: () => (camera.current = { ...camera.current, y: camera.current.y - passo }),
    };
    const acao = teclas[evento.key];
    if (!acao) return;
    evento.preventDefault();
    acao();
    mexeu.current = true;
    aplicar();
  }

  const porId = useMemo(() => new Map(mapa.nos.map((no) => [no.id, no])), [mapa.nos]);
  const acesos = useMemo(() => new Set([...mapa.nos.filter((no) => no.esperaVoce).map((no) => no.id), ...mapa.esperando.map((item) => item.no)]), [mapa]);

  return (
    <div
      ref={telaRef}
      role="application"
      aria-label="Mapa dos sistemas: arraste para andar, use + e − para o zoom e Enter num cartão para ver os detalhes"
      tabIndex={0}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onKeyDown={aoTeclar}
      className="relative h-[62dvh] min-h-[420px] cursor-grab touch-none select-none overflow-hidden rounded-bloco border border-fio bg-saber outline-none focus-visible:ring-2 focus-visible:ring-foco lg:h-[calc(100dvh-19rem)] lg:min-h-[520px]"
      style={{ backgroundImage: "radial-gradient(circle, rgb(var(--fio-2-rgb)) 1px, transparent 1.4px)" }}
    >
      <div ref={mundoRef} className="absolute left-0 top-0 origin-top-left" style={{ width: LARGURA, height: ALTURA }}>
        <svg width={LARGURA} height={ALTURA} className="pointer-events-none absolute left-0 top-0 overflow-visible" aria-hidden="true">
          <defs>
            {(Object.keys(PONTA) as JeitoDaLinha[]).map((jeito) => (
              <marker key={jeito} id={`torre-ponta-${jeito}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M2 1L8 5L2 9" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={PONTA[jeito]} />
              </marker>
            ))}
          </defs>
          {mapa.zonas.map((zona) => (
            <g key={zona.id}>
              <rect x={zona.x} y={zona.y} width={zona.w} height={zona.h} rx={16} fill="none" strokeWidth={1} strokeDasharray="4 6" className="stroke-fio-2" />
              <text
                x={zona.x + 14}
                y={zona.y + (deLonge ? 32 : 26)}
                className={cn("fill-tinta-2 font-sans font-bold uppercase tracking-[0.08em]", deLonge ? "text-[22px]" : "text-xs")}
              >
                {zona.titulo}
              </text>
            </g>
          ))}
          {mapa.arestas.map((aresta) => {
            const de = porId.get(aresta.de);
            const para = porId.get(aresta.para);
            if (!de || !para) return null;
            const apagada = soEsperando && !acesos.has(aresta.de) && !acesos.has(aresta.para);
            return (
              <path
                key={`${aresta.de}-${aresta.para}`}
                d={caminhoDaAresta(de, para)}
                fill="none"
                strokeWidth={deLonge ? 3 : 1.5}
                markerEnd={aresta.seta ? `url(#torre-ponta-${aresta.jeito})` : undefined}
                className={cn(TRACO[aresta.jeito], "transition-opacity duration-200", apagada && "opacity-15")}
              />
            );
          })}
        </svg>
        {mapa.nos.map((no) => (
          <CartaoDoMapa
            key={no.id}
            no={no}
            deLonge={deLonge}
            selecionado={no.id === selecionado}
            apagado={soEsperando && !acesos.has(no.id)}
            onAbrir={onSelecionar}
          />
        ))}
      </div>

      <div data-controle className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full border border-fio bg-folha p-1">
        <button type="button" aria-label="Diminuir o zoom" onClick={() => zoomNoMeio(1 / 1.2)} className="grid h-8 w-8 place-items-center rounded-full text-tinta hover:bg-saber">
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Aumentar o zoom" onClick={() => zoomNoMeio(1.2)} className="grid h-8 w-8 place-items-center rounded-full text-tinta hover:bg-saber">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Ver o mapa inteiro" onClick={() => enquadrar(VISTAS[0], true)} className="grid h-8 w-8 place-items-center rounded-full text-tinta hover:bg-saber">
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- o cartão

const PILULA: Record<TomDoNo, string> = {
  ok: "bg-ok-claro text-ok",
  atencao: "bg-atencao-claro text-atencao",
  erro: "bg-erro-claro text-erro",
  neutro: "bg-saber text-tinta-2",
  construir: "border border-dashed border-tinta-2/50 text-tinta-2",
};

const TEXTO_DO_TOM: Record<TomDoNo, string> = {
  ok: "text-ok",
  atencao: "text-atencao",
  erro: "text-erro",
  neutro: "text-tinta-2",
  construir: "text-tinta-2",
};

const DE_LONGE: Record<TomDoNo, string> = {
  ok: "border-ok/40 bg-ok-claro text-ok",
  atencao: "border-atencao/50 bg-atencao-claro text-atencao",
  erro: "border-erro/50 bg-erro-claro text-erro",
  neutro: "border-fio-2 bg-folha text-tinta",
  construir: "border-dashed border-tinta-2/50 bg-transparent text-tinta-2",
};

/** Cartões que mostram uma lista (cada linha numa linha só). */
const EM_LISTA = new Set(["esperando", "equipe", "coracao", "financeiro", "central", "lucro"]);

const CartaoDoMapa = memo(function CartaoDoMapa({
  no,
  deLonge,
  selecionado,
  apagado,
  onAbrir,
}: {
  no: NoDaTorre;
  deLonge: boolean;
  selecionado: boolean;
  apagado: boolean;
  onAbrir: (id: string) => void;
}) {
  const deFora = no.zona === "fora";
  const tituloDeLonge = no.id === "esperando" && /^\d+$/.test(no.palavra) ? `${no.titulo} (${no.palavra})` : no.titulo;
  return (
    <div
      role="button"
      tabIndex={0}
      data-no={no.id}
      aria-pressed={selecionado}
      aria-label={`${no.titulo}: ${no.palavra}${no.numero ? `, ${no.numero}` : ""}`}
      onKeyDown={(evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          onAbrir(no.id);
        }
      }}
      // Clique de leitor de tela (sem ponteiro): o toque comum já escolhe no soltar.
      onClick={(evento) => {
        if (evento.detail === 0) onAbrir(no.id);
      }}
      style={{ left: no.x, top: no.y, width: no.w, height: no.h }}
      className={cn(
        "absolute cursor-pointer overflow-hidden rounded-[10px] border text-left outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-foco",
        deLonge
          ? cn("flex items-center justify-center px-3 text-center", DE_LONGE[no.tom])
          : cn(no.tom === "construir" ? "border-dashed border-tinta-2/50 bg-folha/60" : "border-fio-2 bg-folha", deFora ? "px-2.5 py-1" : "px-2.5 py-2"),
        selecionado && "ring-2 ring-foco ring-offset-2 ring-offset-saber",
        apagado && "opacity-20",
      )}
    >
      {deLonge ? (
        <span className={cn("font-bold leading-[1.15]", deFora ? "text-[22px]" : "text-[26px]")}>{tituloDeLonge}</span>
      ) : (
        <>
          {deFora ? (
            // De fora: nome e palavra na mesma linha; embaixo, só a primeira linha (o resto vai ao painel).
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-bold leading-[18px] text-tinta">{no.titulo}</span>
                <span className={cn("shrink-0 text-xs font-bold leading-[18px]", TEXTO_DO_TOM[no.tom])}>{no.palavra}</span>
              </span>
              <span className="block truncate text-[13px] leading-[17px] text-tinta-2">{no.linhas[0]}</span>
            </>
          ) : (
            // O nome numa linha inteira; a palavra da situação desce para junto do número.
            <>
              <span className="block truncate text-sm font-bold leading-5 text-tinta">{no.titulo}</span>
              <span className="mt-1 flex min-w-0 items-center gap-2">
                <span className={cn("shrink-0 rounded-full px-2 text-xs font-bold leading-5", PILULA[no.tom])}>{no.palavra}</span>
                {no.numero ? <span className="truncate font-serifa text-base leading-5 text-tinta tabular-nums">{no.numero}</span> : null}
              </span>
              {EM_LISTA.has(no.id) ? (
                <span className="mt-1 block">
                  {no.linhas.map((linha, indice) => (
                    <span key={indice} className="block truncate text-[13px] leading-[17px] text-tinta-2">
                      {linha}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="mt-1 line-clamp-2 text-[13px] leading-[17px] text-tinta-2">{no.linhas.join(" ")}</span>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
});

// ---------------------------------------------------------------- o painel do cartão escolhido

function PainelDaTorre({
  no,
  mapa,
  podeAbrir,
  onSelecionar,
}: {
  no: NoDaTorre;
  mapa: MapaDaTorre;
  podeAbrir: (to: string) => boolean;
  onSelecionar: (id: string) => void;
}) {
  const link = no.painel.link && podeAbrir(no.painel.link.to) ? no.painel.link : null;
  return (
    <BlocoFolha as="aside" respiro aria-live="polite" aria-label={`Detalhes: ${no.titulo}`} className="lg:h-[calc(100dvh-19rem)] lg:min-h-[520px] lg:overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serifa text-xl leading-7 text-tinta">{no.titulo}</h2>
        <span className={cn("rounded-full px-2.5 text-xs font-bold leading-6", PILULA[no.tom])}>{no.palavra}</span>
      </div>
      {no.numero ? <p className="mt-1 font-serifa text-2xl leading-8 text-tinta tabular-nums">{no.numero}</p> : null}
      <p className="mt-2 text-sm font-medium leading-6 text-tinta-2">{no.painel.oQueE}</p>

      {no.id === "esperando" ? <ListaEsperando itens={mapa.esperando} podeAbrir={podeAbrir} onSelecionar={onSelecionar} /> : null}

      {no.painel.agora.length ? (
        <section className="mt-5">
          <Rubrica className="mb-2">Agora</Rubrica>
          <ul className="space-y-1.5 text-sm font-medium leading-6 text-tinta">
            {no.painel.agora.map((linha, indice) => (
              <li key={indice}>{linha}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {no.painel.travou.length ? (
        <section className="mt-5">
          <Rubrica className="mb-2">Travou</Rubrica>
          <ul className="space-y-1.5 text-sm font-semibold leading-6 text-atencao">
            {no.painel.travou.map((linha, indice) => (
              <li key={indice}>{linha}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {no.painel.proximo ? (
        <section className="mt-5">
          <Rubrica className="mb-2">Próximo passo</Rubrica>
          <p className="text-sm font-bold leading-6 text-tinta">{no.painel.proximo}</p>
        </section>
      ) : null}

      {link ? (
        <div className="mt-5">
          <LinkSeta to={link.to}>Abrir {link.rotulo}</LinkSeta>
        </div>
      ) : null}

      <details className="mt-8 border-t border-fio pt-4 text-[13px] font-medium leading-5 text-tinta-2">
        <summary className="cursor-pointer font-bold text-tinta">Abrir a Torre como app</summary>
        <ul className="mt-2 space-y-1.5">
          <li>No Mac, pelo Safari: menu Arquivo › Adicionar ao Dock.</li>
          <li>No Mac, pelo Chrome: o ícone de instalar, no fim da barra de endereço.</li>
          <li>No iPad ou iPhone, pelo Safari: Compartilhar › Adicionar à Tela de Início.</li>
        </ul>
        <p className="mt-2">Abra a partir desta tela: o ícone e o nome saem como “Torre Bratan”.</p>
      </details>
    </BlocoFolha>
  );
}

function ListaEsperando({ itens, podeAbrir, onSelecionar }: { itens: ItemEsperando[]; podeAbrir: (to: string) => boolean; onSelecionar: (id: string) => void }) {
  if (!itens.length) return <p className="mt-4 text-sm font-bold leading-6 text-ok">Nada espera você agora.</p>;
  return (
    <ul className="mt-4 divide-y divide-fio border-y border-fio">
      {itens.map((item) => (
        <li key={item.id} className="py-3">
          <p className="text-sm font-bold leading-6 text-tinta">{item.curto}</p>
          {item.texto !== `${item.curto}.` ? <p className="text-[13px] font-medium leading-5 text-tinta-2">{item.texto}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            {item.href && podeAbrir(item.href) ? <LinkSeta to={item.href}>Resolver</LinkSeta> : null}
            {item.no !== "esperando" ? (
              <button type="button" onClick={() => onSelecionar(item.no)} className="text-[13px] font-bold leading-5 text-musgo underline-offset-2 hover:underline">
                Ver no mapa
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- legenda

function Legenda() {
  const cor = (classe: string, texto: string, tracejado = false) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-3 rounded-[4px] border", classe, tracejado && "border-dashed")} aria-hidden="true" />
      {texto}
    </span>
  );
  const linha = (classe: string, texto: string, traco?: string) => (
    <span className="inline-flex items-center gap-1.5">
      <svg width="24" height="8" aria-hidden="true">
        <path d="M2 4H22" fill="none" strokeWidth="1.75" strokeDasharray={traco} strokeLinecap="round" className={classe} />
      </svg>
      {texto}
    </span>
  );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] font-semibold leading-5 text-tinta-2">
      {cor("border-ok/40 bg-ok-claro", "em uso")}
      {cor("border-atencao/50 bg-atencao-claro", "parado ou esperando você")}
      {cor("border-erro/50 bg-erro-claro", "com erro")}
      {cor("border-tinta-2/50 bg-transparent", "a construir", true)}
      {linha("stroke-ok", "corre sozinho", "6 4")}
      {linha("stroke-atencao", "feito à mão", "5 5")}
      {linha("stroke-tinta-2/50", "ligado, parado")}
      {linha("stroke-tinta-2/50", "desligado", "1 6")}
      <span className="basis-full text-[13px] font-medium sm:ml-auto sm:basis-auto">Arraste para andar · pinça ou ⌘ + rolar para o zoom · arraste um cartão para mudar de lugar</span>
    </div>
  );
}

// ---------------------------------------------------------------- o Lucro Inteligente (Extrato de cada um)

/** Soma o Extrato de cada um do mês, com as mesmas regras da tela do extrato. */
function LeitorDoLucro({ onLido }: { onLido: (lucro: LucroDaTorre) => void }) {
  const hoje = todayISO();
  const ano = Number(hoje.slice(0, 4));
  const financeiro = useFinanceiro(ano, { comAnoAnterior: true });
  const versaoDoMotor = useVersaoDoMotor();
  const pronto = !(financeiro.isSyncing && !financeiro.sales.length);
  useEffect(() => {
    if (!pronto) return;
    const mes = hoje.slice(0, 7);
    const extratos = PESSOAS_DO_EXTRATO.map((pessoa) =>
      extratoDaPessoa({ pessoa: pessoa.id, sales: financeiro.sales, expenses: financeiro.expenses, mes, hoje, desde: `${ano - 1}-01` }),
    );
    onLido({ ate: extratos[0]?.ate ?? hoje, pessoas: extratos.map((extrato) => ({ nome: extrato.nome, falta: extrato.falta, adiantado: extrato.adiantado })) });
    // versaoDoMotor: a régua chega do servidor depois da primeira pintura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, financeiro.sales, financeiro.expenses, hoje, ano, versaoDoMotor]);
  return null;
}
