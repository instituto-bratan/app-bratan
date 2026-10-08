import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "O que é?" contextual: um ícone discreto que abre um cartão explicativo.
 * Funciona por clique/toque (mobile-first) e fecha com Esc ou clique fora.
 * Papel & Musgo (08/10/2026): tokens novos (tinta 2, saber, folha com fio,
 * foco em anel musgo); as classes antigas com opacidade não geravam CSS.
 */
export function InfoTip({
  title,
  children,
  side = "bottom",
  className,
}: {
  title: string;
  children: React.ReactNode;
  side?: "bottom" | "top";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`O que é: ${title}`}
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full text-tinta-2 transition-colors hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco",
          open && "bg-saber text-tinta",
        )}
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: side === "bottom" ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === "bottom" ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            role="dialog"
            aria-label={title}
            style={{ width: "min(18rem, 82vw)", maxWidth: "min(18rem, 82vw)" }}
            className={cn(
              "absolute left-1/2 z-50 -translate-x-1/2 rounded-bloco border border-fio bg-folha p-4 text-left font-sans normal-case tracking-normal shadow-flutua",
              side === "bottom" ? "top-8" : "bottom-8",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold leading-5 text-tinta">{title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2 text-[13px] font-medium leading-5 text-tinta-2">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
