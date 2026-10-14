// AS CONQUISTAS (14/10/2026): medalhas que o dado prova, em ouro; as de
// caminho que faltam, em linha fina, dizendo o que falta. A conquista nova
// (que este aparelho ainda não viu) chega com brilho e um pouco de confete —
// uma vez só, e só quando a seção aparece na tela.
//
// Revisão de 14/10: a festa virava laço (a lista era um array novo a cada
// render e o efeito reagendava o confete para sempre); agora a chave é estável,
// a festa tem trava e a medalha só é marcada como vista depois de vista.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Activity, CalendarCheck, Check, Dumbbell, Flag, Flame, HeartPulse, Mountain, Sparkles, TrendingDown, Trophy } from "lucide-react";
import { Confete } from "@/components/ui/motion-confetti";
import { diaMes } from "./portalPaciente";
import type { Conquista, IconeDaConquista } from "./conquistas";
import { vibrar } from "./movimento";

const ICONE: Record<IconeDaConquista, ReactNode> = {
  inicio: <Flag />,
  exame: <Activity />,
  peso: <TrendingDown />,
  gordura: <Flame />,
  musculo: <Dumbbell />,
  score: <Sparkles />,
  coracao: <HeartPulse />,
  constancia: <CalendarCheck />,
  meio: <Mountain />,
  chegada: <Trophy />,
};

const OURO = ["#E3C77E", "#C6A24A", "#F3E3B3", "#62CE91", "#2F7A56"];

function chaveDoAparelho(contactRef: string) {
  return `meu-bratan-conquistas-vistas-v1:${contactRef}`;
}

function lerVistas(contactRef: string): Set<string> | null {
  try {
    const salvo = window.localStorage.getItem(chaveDoAparelho(contactRef));
    return salvo ? new Set(JSON.parse(salvo) as string[]) : null;
  } catch {
    return null;
  }
}

export function ConquistasDoPaciente({ conquistas, contactRef }: { conquistas: Conquista[]; contactRef: string }) {
  const ganhas = conquistas.filter((c) => c.ganha);
  const idsGanhas = ganhas.map((c) => c.id).join("|");
  // Lido uma vez por montagem. Na primeira visita (nada salvo) nada é "novo":
  // o que já estava ganho só aparece; a festa fica para o que chegar depois.
  const [vistas] = useState(() => lerVistas(contactRef));
  const novas = useMemo(() => (vistas ? idsGanhas.split("|").filter((id) => id && !vistas.has(id)) : []), [idsGanhas, vistas]);
  const [disparos, setDisparos] = useState(0);
  // O brilho de "nova" só começa quando a seção aparece na tela.
  const [festejar, setFestejar] = useState(false);
  const secao = useRef<HTMLElement>(null);
  const festejou = useRef(false);

  // Quando a seção entra na tela: marca como vistas (somando às de antes, para
  // a mesma medalha nunca ser "nova" duas vezes) e, se houver novidade, a festa.
  useEffect(() => {
    const el = secao.current;
    if (!el) return;
    const marcar = () => {
      const antes = lerVistas(contactRef) ?? new Set<string>();
      idsGanhas.split("|").filter(Boolean).forEach((id) => antes.add(id));
      try {
        window.localStorage.setItem(chaveDoAparelho(contactRef), JSON.stringify([...antes]));
      } catch {
        /* sem armazenamento: a festa pode repetir numa próxima visita, sem prejuízo */
      }
      if (novas.length && !festejou.current) {
        festejou.current = true;
        setFestejar(true);
        window.setTimeout(() => {
          setDisparos((n) => n + 1);
          vibrar(12);
        }, 450);
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      marcar();
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          marcar();
          obs.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [contactRef, idsGanhas, novas]);

  if (!conquistas.length) return null;
  const faltam = conquistas.length - ganhas.length;
  return (
    <section ref={secao} id="conquistas" className="p-sec p-anim wide" aria-labelledby="t-conquistas">
      <span className="t-sec" id="t-conquistas">
        Suas conquistas · {ganhas.length} {ganhas.length === 1 ? "medalha" : "medalhas"}
      </span>
      <div className="p-card p-conquistas-card">
        <div className="p-conquistas-palco" aria-hidden="true">
          <Confete disparos={disparos} particulas={46} velocidade={20} abertura={140} duracao={2.2} tamanho={0.8} cores={OURO} />
        </div>
        <ul className="p-medalhas">
          {conquistas.map((c, i) => (
            <li key={c.id} className={`p-medalha ${c.ganha ? "ganha" : "falta"} ${festejar && novas.includes(c.id) ? "nova" : ""}`} style={{ "--atraso": `${0.04 * i}s` } as CSSProperties}>
              <span className="p-medalha-disco" aria-hidden="true">
                {ICONE[c.icone]}
              </span>
              <div className="p-medalha-texto">
                <b>{c.titulo}</b>
                <span>{c.detalhe}</span>
                <span className="p-medalha-estado">
                  {c.ganha ? (
                    <>
                      <Check size={12} strokeWidth={3} aria-hidden="true" /> conquistada{c.quando ? ` em ${diaMes(c.quando)}` : ""}
                    </>
                  ) : (
                    "a conquistar"
                  )}
                </span>
              </div>
              {festejar && novas.includes(c.id) ? <span className="p-medalha-nova">nova</span> : null}
            </li>
          ))}
        </ul>
        {faltam > 0 ? <p className="t-foot t-2">As medalhas de resultado aparecem quando as medições da clínica mostram a mudança. As de caminho acompanham o seu plano.</p> : null}
      </div>
    </section>
  );
}
