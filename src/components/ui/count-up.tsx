// Número que sobe — adaptado de 21st.dev (unlumen/count-up), 21/09/2026.
//
// Mudanças em relação ao original: formatação em pt-BR (vírgula decimal);
// sem `react-use-measure` (a altura do dígito é medida com um ref); mola
// mais curta para número de tela de saúde (não é placar de startup); respeita
// prefers-reduced-motion (mostra o valor final direto); `motion/react` virou
// `framer-motion`. Ficaram os três efeitos: "none", "blur" e "slide" (odômetro).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

type Efeito = "none" | "blur" | "slide";

export type CountUpProps = {
  to: number;
  from?: number;
  delay?: number;
  duration?: number;
  decimals?: number;
  digitEffect?: Efeito;
  className?: string;
  startWhen?: boolean;
};

function reduzMovimento() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function Odometro({ valor, casa }: { valor: MotionValue<number>; casa: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [altura, setAltura] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setAltura(ref.current.offsetHeight);
  }, []);
  // Dígito INTEIRO por casa (não a fração contínua do original): com 72 o
  // original punha o tambor das dezenas em 7,2 e o "8" ficava aparecendo por
  // baixo — visto na prévia. Aqui cada tambor pula de número em número e
  // para exatamente no lugar.
  const y = useTransform(valor, (v) => (altura ? -(Math.floor(Math.abs(v) / casa) % 10) * altura : 0));
  return (
    <span style={{ position: "relative", display: "inline-block", width: "1ch", overflowY: "clip", overflowX: "visible", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
      <span ref={ref} style={{ visibility: "hidden", display: "block" }}>0</span>
      <motion.span style={{ y, position: "absolute", top: 0, left: 0, right: 0, display: "flex", flexDirection: "column" }}>
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: altura || "1em" }}>
            {i % 10}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export function CountUp({ to, from = 0, delay = 0, duration = 1.2, decimals, digitEffect = "none", className, startWhen = true }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const semMovimento = reduzMovimento();
  const valor = useMotionValue(semMovimento ? to : from);
  // Mola quase criticamente amortecida, escalada pela duração. A do original
  // (rigidez 100/duração) era sobreamortecida: cinco segundos depois ainda
  // mostrava 71 em vez de 72. E a variante por `duration` do framer-motion
  // simplesmente não andava dentro do useSpring — testado na prévia.
  const mola = useSpring(valor, { stiffness: 260 / duration, damping: 34 / Math.sqrt(duration), restDelta: 0.001 });
  const visivel = useInView(ref, { once: true, margin: "0px" });
  const casas = decimals ?? Math.max(String(from).split(".")[1]?.length ?? 0, String(to).split(".")[1]?.length ?? 0);

  const formatar = useCallback((n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }), [casas]);
  const [texto, setTexto] = useState(() => formatar(semMovimento ? to : from));

  useEffect(() => {
    if (!visivel || !startWhen) return;
    const t = setTimeout(() => valor.set(to), delay * 1000);
    return () => clearTimeout(t);
  }, [visivel, startWhen, valor, to, delay]);

  useEffect(() => mola.on("change", (n) => setTexto(formatar(n))), [mola, formatar]);
  // A mola em "inteiros": 72,4 com 1 casa vira 724, para o odômetro dividir por 10^casa.
  const molaInteira = useTransform(mola, (v) => v * 10 ** casas);

  if (digitEffect === "slide") {
    const alvo = formatar(to);
    const digitos = alvo.replace(/\D/g, "").length;
    let d = 0;
    return (
      <span ref={ref} className={cn("inline-flex items-center", className)} style={{ fontVariantNumeric: "tabular-nums" }}>
        {[...alvo].map((ch, i) => {
          if (!/\d/.test(ch)) return <span key={i}>{ch}</span>;
          const casa = 10 ** (digitos - 1 - d);
          d += 1;
          // Os dígitos depois da vírgula andam com o valor multiplicado.
          return <Odometro key={i} valor={molaInteira} casa={casa} />;
        })}
      </span>
    );
  }

  if (digitEffect === "none") {
    return (
      <span ref={ref} className={className}>
        {texto}
      </span>
    );
  }

  return (
    <span ref={ref} className={cn("inline-flex items-center", className)}>
      {[...texto].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} style={{ position: "relative", display: "inline-block" }}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={`${i}-${ch}`} initial={{ opacity: 0, filter: "blur(8px)", y: -8 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} exit={{ opacity: 0, filter: "blur(8px)", y: 8 }} transition={{ duration: 0.18, ease: "easeOut" }} style={{ display: "inline-block" }}>
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        ) : (
          <span key={i} style={{ display: "inline-block" }}>
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

export default CountUp;
