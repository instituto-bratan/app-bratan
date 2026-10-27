// A FOLHA DO APP DE FECHAMENTO (28/10/2026): no celular sobe da base (como a
// FolhaQueSobe da casca); no computador vira uma janela no meio. Esc ou toque
// no véu fecham (menos enquanto algo está gravando); o foco entra na folha e
// volta para quem abriu.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { NoCorpo } from "@/features/crm/comercialVisual";
import { cn } from "@/lib/utils";

export function Folha({
  aberta,
  titulo,
  frase,
  onFechar,
  presa = false,
  children,
  rodape,
}: {
  aberta: boolean;
  titulo: string;
  frase?: ReactNode;
  onFechar: () => void;
  /** Gravando: não fecha no véu nem no Esc (a pessoa não perde o que está salvando). */
  presa?: boolean;
  children: ReactNode;
  /** Os botões da decisão, presos embaixo. */
  rodape?: ReactNode;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);
  const idTitulo = useId();

  useEffect(() => {
    if (!aberta) return undefined;
    focoAnterior.current = document.activeElement as HTMLElement | null;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => painelRef.current?.focus(), 30);
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !presa) {
        evento.preventDefault();
        onFechar();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = rolagem;
      focoAnterior.current?.focus?.();
    };
  }, [aberta, onFechar, presa]);

  return (
    <NoCorpo>
      <AnimatePresence>
        {aberta ? (
          <motion.div
            key="folha-fechamento"
            className="fixed inset-0 z-[75] flex items-end justify-center bg-[var(--veu)] md:items-center md:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(evento) => {
              if (evento.target === evento.currentTarget && !presa) onFechar();
            }}
          >
            <motion.div
              ref={painelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={idTitulo}
              tabIndex={-1}
              initial={{ y: 40, opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
              className={cn(
                "flex max-h-[92dvh] w-full flex-col bg-folha font-sans text-tinta shadow-flutua outline-none",
                "rounded-t-painel md:max-h-[88dvh] md:w-[min(40rem,100%)] md:rounded-painel md:border md:border-fio",
              )}
            >
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-fio-2 md:hidden" aria-hidden="true" />
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3 md:pt-5">
                <div className="min-w-0">
                  <h2 id={idTitulo} className="text-lg font-bold leading-6 text-tinta">
                    {titulo}
                  </h2>
                  {frase ? <p className="mt-1 text-sm font-medium leading-5 text-tinta-2">{frase}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={onFechar}
                  disabled={presa}
                  aria-label={`Fechar: ${titulo.toLowerCase()}`}
                  className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco disabled:opacity-50"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5">{children}</div>
              {rodape ? (
                <div className="shrink-0 border-t border-fio px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{rodape}</div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </NoCorpo>
  );
}
