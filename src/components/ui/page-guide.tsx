import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenCheck, HelpCircle, Lightbulb, X } from "lucide-react";
import { findPageGuide } from "@/lib/pageGuides";
import { cn } from "@/lib/utils";

// Botão flutuante "Como usar" presente em todas as telas: abre um painel com
// o que é a tela, passos práticos e dicas — conteúdo em src/lib/pageGuides.ts.
export function PageGuideButton({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const guide = findPageGuide(pathname);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!guide) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Como usar: ${guide.title}`}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full border border-brand-dourado/40 bg-brand-musgo px-4 py-2.5 text-sm font-semibold text-brand-papel shadow-calm backdrop-blur transition-transform hover:scale-[1.04] lg:bottom-6 lg:right-6"
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Como usar</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-brand-tinta/35 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.aside
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                "fixed bottom-0 right-0 top-0 flex w-[min(26rem,94vw)] flex-col overflow-y-auto",
                "border-l border-brand-oliva/25 bg-brand-papel p-6 shadow-2xl",
              )}
              role="dialog"
              aria-label={`Como usar: ${guide.title}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-oliva">Como usar</p>
                  <h2 className="mt-1 text-2xl leading-tight text-brand-musgo">{guide.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar guia"
                  className="rounded-full border border-brand-oliva/20 bg-white/70 p-2 text-brand-tinta hover:bg-brand-creme"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <p className="mt-4 rounded-lg border border-brand-dourado/30 bg-brand-creme/50 p-4 text-sm leading-6 text-brand-tinta">
                {guide.whatIs}
              </p>

              <h3 className="mt-6 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-musgo">
                <BookOpenCheck className="h-4 w-4" aria-hidden="true" /> Passo a passo
              </h3>
              <ol className="mt-3 space-y-3">
                {guide.steps.map((step, index) => (
                  <li key={index} className="flex gap-3 text-sm leading-6 text-brand-tinta">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-musgo text-xs font-bold text-brand-papel">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>

              {guide.tips?.length ? (
                <>
                  <h3 className="mt-6 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-dourado">
                    <Lightbulb className="h-4 w-4" aria-hidden="true" /> Dicas
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {guide.tips.map((tip, index) => (
                      <li key={index} className="rounded-lg bg-white/70 px-3 py-2 text-sm leading-6 text-brand-tinta">
                        {tip}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
