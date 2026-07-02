import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "O que é?" contextual: um ícone discreto que abre um cartão explicativo.
 * Funciona por clique/toque (mobile-first) e fecha com Esc ou clique fora.
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
          "ios-pressable grid h-6 w-6 place-items-center rounded-full text-brand-oliva transition-colors hover:bg-brand-oliva/10 hover:text-brand-musgo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dourado/40",
          open && "bg-brand-oliva/12 text-brand-musgo",
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
              "absolute left-1/2 z-50 -translate-x-1/2 rounded-xl border border-brand-oliva/18 bg-brand-papel p-4 shadow-[0_18px_44px_rgba(43,46,36,0.18)]",
              side === "bottom" ? "top-8" : "bottom-8",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-brand-musgo">{title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-brand-oliva/10"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2 text-xs leading-5 text-muted-foreground">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
