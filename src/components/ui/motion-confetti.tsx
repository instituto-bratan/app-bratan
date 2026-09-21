// Confete — adaptado de 21st.dev (motiondotdev/motion-confetti), 21/09/2026.
//
// O original vinha com o próprio botão "Celebrate" e cores de festa de
// aniversário. Aqui é um palco: quem manda disparar é o pai (a prop `disparos`
// cresce → uma explosão), e as cores são as da marca (escala do verde + o
// dourado do plano). Física e keyframes ficaram como no original; o CSS
// externo virou estilo inline; `motion/react` virou `framer-motion`, que o
// projeto já tem. Respeita prefers-reduced-motion: sem partícula nenhuma.

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

const CORES_DA_MARCA = ["#62CE91", "#2F7A56", "#A9E6C3", "#C6A24A", "#F1DDA2", "#FFFFFF"];
const FORMAS = ["circle", "rect", "rect", "strip", "strip"] as const;
const QUADROS = 40;
const JANELA_POP = 0.08;

type Forma = (typeof FORMAS)[number];
type Particula = { keyframes: { transform: string[]; opacity: number[] }; duracao: number; tamanho: number; cor: string; forma: Forma };
type Explosao = { id: number; particulas: Particula[] };

function montarKeyframes(p: { angulo: number; velocidade: number; decaimento: number; gravidade: number; deriva: number; oscilacaoVel: number; oscilacaoIni: number; tamanho: number; ticks: number; giros: number; rotacao: number }) {
  const transforms: string[] = [];
  const opacidades: number[] = [];
  let v = p.velocidade;
  let x = 0;
  let y = 0;
  let osc = p.oscilacaoIni;
  let tick = 0;
  for (let i = 0; i <= QUADROS; i += 1) {
    const t = i / QUADROS;
    if (i > 0) {
      const alvo = Math.round((i * p.ticks) / QUADROS);
      while (tick < alvo) {
        x += Math.cos(p.angulo) * v + p.deriva;
        y += Math.sin(p.angulo) * v + p.gravidade * 3;
        v *= p.decaimento;
        osc += p.oscilacaoVel;
        tick += 1;
      }
    }
    const tx = i === 0 ? 0 : x + Math.cos(osc) * 15 * p.tamanho;
    let escala: number;
    if (t < JANELA_POP * 0.6) escala = (t / (JANELA_POP * 0.6)) * 1.15;
    else if (t < JANELA_POP) escala = 1.15 - ((t - JANELA_POP * 0.6) / (JANELA_POP * 0.4)) * 0.15;
    else escala = 1;
    const tilt = p.giros * 360 * t;
    const opacidade = t <= 0.5 ? 1 : t <= 0.8 ? 1 - ((t - 0.5) / 0.3) * 0.5 : 0.5 - ((t - 0.8) / 0.2) * 0.5;
    transforms.push(`translate(${tx}px, ${y}px) scale(${escala}) rotateY(${tilt}deg) rotate(${p.rotacao}deg)`);
    opacidades.push(opacidade);
  }
  return { transform: transforms, opacity: opacidades };
}

function Ponto({ particula }: { particula: Particula }) {
  const ref = useRef<HTMLDivElement>(null);
  const { keyframes, duracao, tamanho, cor, forma } = particula;
  const largura = forma === "strip" ? tamanho * 0.3 : forma === "rect" ? tamanho * 0.7 : tamanho;
  const altura = forma === "strip" ? tamanho * 2 : tamanho;
  const raio = forma === "circle" ? "50%" : forma === "strip" ? tamanho * 0.12 : 2;
  useEffect(() => {
    if (!ref.current) return;
    const reproducao = animate(ref.current, keyframes, { duration: duracao, ease: "linear" });
    return () => reproducao.cancel();
  }, [keyframes, duracao]);
  return <div ref={ref} style={{ position: "absolute", width: largura, height: altura, borderRadius: raio, backgroundColor: cor, willChange: "transform, opacity", pointerEvents: "none" }} />;
}

export type ConfeteProps = {
  /** Cada incremento dispara uma explosão a partir do centro do palco. */
  disparos: number;
  particulas?: number;
  velocidade?: number;
  abertura?: number;
  decaimento?: number;
  gravidade?: number;
  duracao?: number;
  tamanho?: number;
  cores?: string[];
};

export function Confete({ disparos, particulas = 70, velocidade = 26, abertura = 110, decaimento = 0.91, gravidade = 1, duracao = 2.4, tamanho = 1, cores = CORES_DA_MARCA }: ConfeteProps) {
  const [explosoes, setExplosoes] = useState<Explosao[]>([]);
  const ultimo = useRef(disparos);

  useEffect(() => {
    if (disparos === ultimo.current) return;
    ultimo.current = disparos;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = disparos;
    const ticks = Math.round(duracao * 60);
    const lista = Array.from({ length: particulas }, () => {
      const rad = abertura * (Math.PI / 180);
      const angulo = -Math.PI / 2 + (0.5 * rad - Math.random() * rad);
      return {
        keyframes: montarKeyframes({ angulo, velocidade: velocidade * 0.5 + Math.random() * velocidade, decaimento, gravidade, deriva: 0, oscilacaoVel: Math.min(0.11, Math.random() * 0.1 + 0.05), oscilacaoIni: Math.random() * 10, tamanho, ticks, giros: 2 + Math.random() * 4, rotacao: Math.random() * 360 }),
        duracao,
        tamanho: 6 * tamanho + Math.random() * 6 * tamanho,
        cor: cores[Math.floor(Math.random() * cores.length)],
        forma: FORMAS[Math.floor(Math.random() * FORMAS.length)],
      };
    });
    setExplosoes((atual) => [...atual, { id, particulas: lista }]);
    const timer = setTimeout(() => setExplosoes((atual) => atual.filter((e) => e.id !== id)), (duracao + 0.5) * 1000);
    return () => clearTimeout(timer);
  }, [disparos, particulas, velocidade, abertura, decaimento, gravidade, duracao, tamanho, cores]);

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
      <div style={{ position: "absolute", left: "50%", top: "50%" }}>
        {explosoes.map((e) => (
          <div key={e.id} style={{ position: "absolute", left: 0, top: 0 }}>
            {e.particulas.map((p, i) => (
              <Ponto key={i} particula={p} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Confete;
