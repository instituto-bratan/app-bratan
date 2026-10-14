// A HISTÓRIA ATÉ AQUI (14/10/2026) — a retrospectiva do plano em capítulos,
// em tela cheia, tocando para passar (como os stories). Cada capítulo é um
// número que a pessoa conquistou, com a frase que dá sentido a ele.
//
// Toque à direita avança, à esquerda volta, segurar pausa; o botão de pausa
// fica sempre à vista (quem não consegue segurar o dedo também para o relógio).
// Esc, o X e o "voltar" do celular fecham. Quem pediu menos movimento passa os
// capítulos com as setas, sem relógio.
//
// Revisão de 14/10: o relógio é a própria barra (o capítulo passa quando a
// animação da barra termina — pausar e retomar não desencontram mais); a página
// de trás fica inerte enquanto a história está aberta; o leitor de tela ouve
// cada capítulo por uma região viva que não é recriada.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as EventoDoToque } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
import bratanMark from "@/assets/bratan-mark.png";
import type { Capitulo } from "./conquistas";
import { reduzMovimento, vibrar } from "./movimento";

const DURACAO_MS = 6200;

function textoDoCapitulo(c: Capitulo) {
  const numero = c.numero ? `${c.numero.prefixo ?? ""}${c.numero.valor.toLocaleString("pt-BR", { minimumFractionDigits: c.numero.casas, maximumFractionDigits: c.numero.casas })}${c.numero.sufixo ?? ""} ` : "";
  return `${c.sobrancelha}. ${numero}${c.titulo} ${c.texto}`;
}

export function HistoriaDoPlano({ capitulos, aoFechar }: { capitulos: Capitulo[]; aoFechar: () => void }) {
  const [indice, setIndice] = useState(0);
  const [segurando, setSegurando] = useState(false);
  const [pausadoNoBotao, setPausadoNoBotao] = useState(false);
  const parado = reduzMovimento();
  const fecharRef = useRef<HTMLButtonElement>(null);
  const continuarRef = useRef<HTMLButtonElement>(null);
  // O 1º capítulo também é anunciado: a região viva nasce vazia e recebe o texto logo depois.
  const [anuncio, setAnuncio] = useState("");
  const segurandoDesde = useRef<number | null>(null);
  const fechando = useRef(false);
  // A função de fechar vem da tela de trás (nova a cada render): guardada numa
  // ref, os efeitos não rodam de novo — e o histórico não ganha entrada a mais.
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;
  const capitulo = capitulos[indice];
  const ultimo = indice === capitulos.length - 1;
  const pausado = segurando || pausadoNoBotao;

  const avancar = useCallback(() => setIndice((i) => Math.min(capitulos.length - 1, i + 1)), [capitulos.length]);
  const voltar = useCallback(() => setIndice((i) => Math.max(0, i - 1)), []);
  useEffect(() => {
    if (indice > 0) vibrar(6);
    const c = capitulos[indice];
    if (!c) return;
    const t = window.setTimeout(() => setAnuncio(`Capítulo ${indice + 1} de ${capitulos.length}. ${textoDoCapitulo(c)}`), indice === 0 ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [indice, capitulos]);

  // No último capítulo o botão de pausa (ou a seta) some: o foco vai para o "Continuar".
  useEffect(() => {
    if (!ultimo) return;
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body || (a as HTMLButtonElement).disabled || !a.isConnected) continuarRef.current?.focus({ preventScroll: true });
  }, [ultimo]);

  // Fechar passa pelo histórico: o "voltar" do celular fecha a história em vez
  // de trocar a aba que está atrás dela.
  const fechar = useCallback(() => {
    if (fechando.current) return;
    fechando.current = true;
    if ((window.history.state as { historia?: boolean } | null)?.historia) window.history.back();
    else aoFecharRef.current();
  }, []);

  useEffect(() => {
    if (!(window.history.state as { historia?: boolean } | null)?.historia) window.history.pushState({ ...(window.history.state ?? {}), historia: true }, "");
    const aoVoltar = () => aoFecharRef.current();
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  // A página de trás fica inerte (Tab, leitor de tela e toque só andam na
  // história), a rolagem trava, o foco abre no X e volta para onde estava.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const raiz = document.getElementById("root");
    const overflow = document.body.style.overflow;
    raiz?.setAttribute("inert", "");
    raiz?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "hidden";
    fecharRef.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      else if (e.key === "ArrowRight") avancar();
      else if (e.key === "ArrowLeft") voltar();
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("keydown", tecla);
      raiz?.removeAttribute("inert");
      raiz?.removeAttribute("aria-hidden");
      document.body.style.overflow = overflow;
      antes?.focus?.({ preventScroll: true });
    };
  }, [fechar, avancar, voltar]);

  if (!capitulo) return null;

  const soltar = (e: EventoDoToque<HTMLDivElement>) => {
    // Segurar mais de 220 ms foi pausa, não toque.
    const segurou = segurandoDesde.current !== null && Date.now() - segurandoDesde.current > 220;
    segurandoDesde.current = null;
    setSegurando(false);
    if (segurou) return;
    const caixa = e.currentTarget.getBoundingClientRect();
    if (e.clientX - caixa.left < caixa.width * 0.32) voltar();
    else avancar();
  };

  return createPortal(
    <div className="portal p-historia" data-tema={capitulo.tema} data-pausado={pausado ? "sim" : undefined} role="dialog" aria-modal="true" aria-label="Sua história até aqui">
      <div className="p-historia-fundo" aria-hidden="true">
        <i className="p-historia-luz a" />
        <i className="p-historia-luz b" />
        <svg className="p-historia-anel" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" />
          <circle cx="100" cy="100" r="70" />
        </svg>
      </div>

      <div className="p-historia-topo">
        <div className="p-historia-barras" aria-hidden="true">
          {capitulos.map((c, i) => {
            const andando = i === indice && !parado && !ultimo;
            return (
              <span key={c.id} className="p-historia-barra">
                <i
                  className={i < indice || (i === indice && !andando) ? "cheia" : andando ? "andando" : ""}
                  key={andando ? `a-${indice}` : `b-${i}`}
                  style={andando ? ({ "--dur": `${DURACAO_MS}ms`, animationPlayState: pausado ? "paused" : "running" } as CSSProperties) : undefined}
                  onAnimationEnd={andando ? (e) => e.animationName === "p-barra" && avancar() : undefined}
                />
              </span>
            );
          })}
        </div>
        <div className="p-historia-cabeca">
          <span className="p-historia-marca">
            <img src={bratanMark} alt="" />
            Meu Bratan
          </span>
          <div className="p-historia-botoes">
            {!parado && !ultimo ? (
              <button type="button" className="p-historia-x" onClick={() => setPausadoNoBotao((v) => !v)} aria-label={pausadoNoBotao ? "Continuar a história" : "Pausar a história"}>
                {pausadoNoBotao ? <Play size={18} /> : <Pause size={18} />}
              </button>
            ) : null}
            <button ref={fecharRef} type="button" className="p-historia-x" onClick={fechar} aria-label="Fechar a história">
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="p-historia-palco"
        onPointerDown={() => {
          segurandoDesde.current = Date.now();
          setSegurando(true);
        }}
        onPointerUp={soltar}
        onPointerCancel={() => {
          segurandoDesde.current = null;
          setSegurando(false);
        }}
      >
        <div className="p-historia-capitulo" key={capitulo.id} aria-hidden="true">
          <span className="p-historia-sobrancelha">{capitulo.sobrancelha}</span>
          {capitulo.numero ? (
            <p className="p-historia-numero">
              {capitulo.numero.prefixo ?? ""}
              <CountUp to={capitulo.numero.valor} from={0} duration={1.3} decimals={capitulo.numero.casas} delay={0.25} />
              {capitulo.numero.sufixo ? <small>{capitulo.numero.sufixo}</small> : null}
            </p>
          ) : null}
          <p className="p-historia-titulo">{capitulo.titulo}</p>
          <p className="p-historia-texto">{capitulo.texto}</p>
        </div>
      </div>
      {/* Uma região viva só, sempre a mesma: o leitor de tela lê o capítulo inteiro, com o número final. */}
      <p className="p-so-leitor" aria-live="polite" aria-atomic="true">
        {anuncio}
      </p>

      <div className="p-historia-pe">
        {/* As setas ficam sempre: quem não usa gesto (teclado, Switch Control) também volta e avança. */}
        {capitulos.length > 1 ? (
          <div className={`p-historia-setas ${parado ? "" : "discretas"}`}>
            <button type="button" className="p-historia-seta" onClick={voltar} disabled={indice === 0} aria-label="Capítulo anterior">
              <ChevronLeft size={22} />
            </button>
            {parado ? (
              <span>
                {indice + 1} de {capitulos.length}
              </span>
            ) : null}
            <button type="button" className="p-historia-seta" onClick={avancar} disabled={ultimo} aria-label="Próximo capítulo">
              <ChevronRight size={22} />
            </button>
          </div>
        ) : null}
        {ultimo ? (
          <button ref={continuarRef} type="button" className="p-historia-continuar" onClick={fechar}>
            Continuar a caminhada
          </button>
        ) : (
          <span className="p-historia-dica">{parado ? "" : pausado ? "pausado" : "toque para continuar · segure para pausar"}</span>
        )}
      </div>
    </div>,
    document.body,
  );
}
