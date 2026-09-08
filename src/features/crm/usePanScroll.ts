// ARRASTAR PARA ROLAR (08/09/2026, Lucas: "não dá para arrastar pro lado — não
// tem nada para arrastar"). Segura em qualquer área vazia do quadro ou da faixa
// de abas e puxa para o lado; começar o arrasto em botão, link ou campo não
// rola (o clique continua sendo clique).
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

export function usePanScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const estado = useRef({ ativo: false, x: 0, scroll: 0, moveu: false });

  function onPointerDown(event: ReactPointerEvent<T>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const alvo = event.target as HTMLElement;
    if (alvo.closest("button, a, input, select, textarea, label, [role=tab]")) return;
    const el = ref.current;
    if (!el) return;
    estado.current = { ativo: true, x: event.clientX, scroll: el.scrollLeft, moveu: false };
    el.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event: ReactPointerEvent<T>) {
    const el = ref.current;
    if (!estado.current.ativo || !el) return;
    const delta = event.clientX - estado.current.x;
    if (Math.abs(delta) > 4) estado.current.moveu = true;
    el.scrollLeft = estado.current.scroll - delta;
  }
  function onPointerUp(event: ReactPointerEvent<T>) {
    if (!estado.current.ativo) return;
    estado.current.ativo = false;
    ref.current?.releasePointerCapture?.(event.pointerId);
  }
  function rolar(direcao: -1 | 1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direcao * Math.max(240, el.clientWidth * 0.6), behavior: "smooth" });
  }

  return { ref, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }, rolar };
}
