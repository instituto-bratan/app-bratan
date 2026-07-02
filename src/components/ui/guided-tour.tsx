import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readLocalValue, writeLocalValue } from "@/lib/localStore";
import { cn } from "@/lib/utils";

export type TourStep = {
  icon: LucideIcon;
  title: string;
  description: string;
  hint?: string;
};

export function useTourSeen(storageKey: string) {
  const [seen, setSeen] = useState(() => readLocalValue<boolean>(storageKey, false));
  function markSeen() {
    setSeen(true);
    writeLocalValue(storageKey, true);
  }
  return { seen, markSeen };
}

/**
 * Tutorial passo a passo em overlay: um cartão central com progresso,
 * navegação Voltar/Próximo e fechamento por Esc/clique fora.
 */
export function GuidedTour({
  open,
  steps,
  title,
  onClose,
}: {
  open: boolean;
  steps: TourStep[];
  title: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((value) => Math.min(value + 1, steps.length - 1));
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(value - 1, 0));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, steps.length]);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  return (
    <AnimatePresence>
      {open && step ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] grid place-items-center bg-brand-tinta/30 px-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="w-[min(28rem,92vw)] rounded-2xl border border-brand-oliva/18 bg-brand-papel p-6 shadow-[0_32px_80px_rgba(43,46,36,0.28)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label={title}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-oliva">{title}</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar tutorial"
                className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-brand-oliva/10"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="mt-5 min-h-[132px]"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-musgo text-brand-papel">
                  <step.icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-xl text-brand-musgo">{step.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                {step.hint ? (
                  <p className="mt-3 rounded-lg border border-brand-dourado/30 bg-brand-creme/40 px-3 py-2 text-xs leading-5 text-brand-tinta">
                    {step.hint}
                  </p>
                ) : null}
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5" aria-label={`Passo ${index + 1} de ${steps.length}`}>
                {steps.map((_, dot) => (
                  <button
                    key={dot}
                    type="button"
                    onClick={() => setIndex(dot)}
                    aria-label={`Ir ao passo ${dot + 1}`}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      dot === index ? "w-5 bg-brand-musgo" : "w-1.5 bg-brand-oliva/30 hover:bg-brand-oliva/50",
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {index > 0 ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setIndex(index - 1)}>
                    <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                    Voltar
                  </Button>
                ) : null}
                <Button type="button" size="sm" onClick={() => (isLast ? onClose() : setIndex(index + 1))}>
                  {isLast ? (
                    <>
                      Concluir
                      <Check className="ml-1 h-4 w-4" aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      Próximo
                      <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
