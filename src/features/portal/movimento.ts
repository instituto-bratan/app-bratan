// O MOVIMENTO DO PORTAL (14/10/2026): pequenas peças que dão ao app a
// sensação de objeto bem-feito — o toque que responde, a seção que chega ao
// rolar. Tudo respeita "reduzir movimento" do aparelho.
import { useEffect, type RefObject } from "react";

/** O aparelho pediu menos movimento? (Ajustes › Acessibilidade › Movimento.) */
export function reduzMovimento() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** Um toque curto no motor de vibração (Android; o iPhone ignora sem erro). */
export function vibrar(ms = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator && !reduzMovimento()) navigator.vibrate(ms);
  } catch {
    /* sem vibração: segue em silêncio */
  }
}

/**
 * As seções que estão abaixo da dobra entram ao rolar (sobem 14 px e acendem).
 * As que já estão na tela ao abrir aparecem na hora — nada fica escondido
 * esperando um gesto, e sem IntersectionObserver tudo aparece.
 */
export function useRevelarAoRolar(raiz: RefObject<HTMLElement>, chave: unknown) {
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const alvos = Array.from(el.querySelectorAll<HTMLElement>(":scope > .p-sec, :scope > .p-rodape, :scope > .p-nota-saude"));
    if (typeof IntersectionObserver === "undefined" || reduzMovimento()) {
      alvos.forEach((a) => a.setAttribute("data-visto", ""));
      return;
    }
    const altura = window.innerHeight;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-visto", "");
          obs.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );
    for (const a of alvos) {
      if (a.getBoundingClientRect().top < altura * 0.92) a.setAttribute("data-visto", "");
      else {
        a.setAttribute("data-revela", "");
        obs.observe(a);
      }
    }
    return () => obs.disconnect();
  }, [raiz, chave]);
}
