// GAVETA (06/10/2026): a janela dos formulários dos pedidos de compra (Novo
// pedido, Registrar compra, Confirmar recebimento).
//
// No celular ela sobe de baixo e ocupa quase a tela (o polegar alcança o botão
// do rodapé); no computador ela entra pela direita e deixa a lista visível.
// Esc fecha, o foco entra na gaveta e volta para onde estava, e a página atrás
// não rola. Fica abaixo dos avisos e dos diálogos de confirmação (z 70/80),
// para o "pedir o motivo" e os erros aparecerem por cima dela.
//
// Vai por PORTAL para o <body>: a troca de tela do AppLayout anima o conteúdo
// com transform/filter, e um `position: fixed` lá dentro ficaria preso à área
// do conteúdo (a gaveta nascia embaixo do cabeçalho, cortada).
//
// 08/10/2026 (redesenho Papel & Musgo): a mesma gaveta, na forma aprovada —
// véu sem desfoque (nada de vidro), folha com borda fina, raio de painel,
// sombra só porque flutua, título em Manrope 20 e o rodapé na folha.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

export function Gaveta({
  aberta,
  sobrancelha,
  titulo,
  subtitulo,
  onFechar,
  rodape,
  children,
}: {
  aberta: boolean;
  /** Rubrica em caixa alta acima do título ("Pedido #0012 · Enfermagem"), como no painel aprovado. */
  sobrancelha?: ReactNode;
  titulo: string;
  subtitulo?: ReactNode;
  onFechar: () => void;
  /** O botão principal (fica preso embaixo, sempre à vista). */
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const tituloId = useId();
  const painelRef = useRef<HTMLDivElement>(null);
  const reduzir = useReducedMotion();
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    if (!aberta) return undefined;
    const anterior = document.activeElement as HTMLElement | null;
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // O primeiro campo ganha o foco (no computador); no celular, o título — para o teclado não pular na cara.
    const id = window.setTimeout(() => {
      const desktop = window.matchMedia("(min-width: 640px)").matches;
      const alvo = desktop
        ? painelRef.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea")
        : null;
      (alvo ?? painelRef.current)?.focus();
    }, 60);
    function onKey(event: KeyboardEvent) {
      // Diálogo de confirmação aberto por cima: o Esc é dele.
      if (event.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]:not([data-gaveta])')) {
        event.preventDefault();
        fecharRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowAntes;
      anterior?.focus?.();
    };
  }, [aberta]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {aberta ? (
        <motion.div
          key="fundo"
          className="fixed inset-0 z-[65] flex items-end justify-center bg-[var(--veu)] sm:items-stretch sm:justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onFechar();
          }}
        >
          <motion.div
            ref={painelRef}
            role="dialog"
            aria-modal="true"
            data-gaveta=""
            aria-labelledby={tituloId}
            tabIndex={-1}
            className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-painel border border-fio bg-folha font-sans text-tinta shadow-flutua outline-none sm:max-h-none sm:w-[min(36rem,100vw)] sm:rounded-none sm:rounded-l-painel"
            initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 32 }}
            animate={reduzir ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 24, transition: { duration: 0.15 } }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-fio px-4 pb-4 pt-4 sm:px-6 sm:pt-6">
              <div className="min-w-0">
                {sobrancelha ? <p className="mb-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">{sobrancelha}</p> : null}
                <h2 id={tituloId} className="text-xl font-bold leading-7 text-tinta [text-wrap:balance]">
                  {titulo}
                </h2>
                {subtitulo ? <div className="mt-1 text-[13px] font-medium leading-5 text-tinta-2">{subtitulo}</div> : null}
              </div>
              <button
                type="button"
                onClick={onFechar}
                aria-label="Fechar"
                className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-controle text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">{children}</div>
            {rodape ? (
              <footer className="border-t border-fio bg-folha px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">
                {rodape}
              </footer>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
