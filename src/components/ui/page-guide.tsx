import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenCheck, HelpCircle, Lightbulb, X } from "lucide-react";
import { findPageGuide } from "@/lib/pageGuides";
import { cn } from "@/lib/utils";

// GUIA "COMO USAR" de cada tela — conteúdo em src/lib/pageGuides.ts.
//
// 08/10/2026 (casca Papel & Musgo): o botão flutuante "Como usar" disputava o
// canto de baixo com o balão do dia, os avisos e a barra do celular. Ele virou
// o "?" do topo da casca, que abre este mesmo painel (GuiaDaTela). O botão
// flutuante continua exportado para quem ainda o usar.

/** O painel do guia, aberto pelo "?" do topo. Fecha com Esc, no X ou fora dele. */
export function GuiaDaTela({ pathname, aberto, onFechar }: { pathname: string; aberto: boolean; onFechar: () => void }) {
  const guide = findPageGuide(pathname);

  useEffect(() => {
    if (!aberto) return undefined;
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto, onFechar]);

  return (
    <AnimatePresence>
      {aberto && guide ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          // z-[65] (08/10/2026): o guia cobre o Balão do Dia (z-60), como a busca e o Menu.
          className="fixed inset-0 z-[65] bg-[var(--veu)]"
          onClick={onFechar}
        >
          <motion.aside
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "fixed bottom-0 right-0 top-0 flex w-[min(26rem,94vw)] flex-col overflow-y-auto",
              "border-l border-fio bg-folha p-6 pt-[max(24px,env(safe-area-inset-top))] font-sans text-tinta shadow-flutua",
            )}
            role="dialog"
            aria-modal="true"
            aria-label={`Como usar: ${guide.title}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-tinta-2">Como usar</p>
                <h2 className="mt-1 text-2xl font-bold leading-tight text-tinta">{guide.title}</h2>
              </div>
              <button
                type="button"
                onClick={onFechar}
                aria-label="Fechar guia"
                autoFocus
                className="grid h-9 w-9 shrink-0 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-4 rounded-bloco bg-saber p-4 text-sm leading-6 text-tinta">{guide.whatIs}</p>

            <h3 className="mt-6 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-musgo">
              <BookOpenCheck className="h-4 w-4" aria-hidden="true" /> Passo a passo
            </h3>
            <ol className="mt-3 space-y-3">
              {guide.steps.map((step, index) => (
                <li key={index} className="flex gap-3 text-sm leading-6 text-tinta">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-musgo text-xs font-bold text-sobre-musgo">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            {guide.tips?.length ? (
              <>
                <h3 className="mt-6 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.08em] text-ouro">
                  <Lightbulb className="h-4 w-4" aria-hidden="true" /> Dicas
                </h3>
                <ul className="mt-3 space-y-2">
                  {guide.tips.map((tip, index) => (
                    <li key={index} className="rounded-controle bg-saber px-3 py-2 text-sm leading-6 text-tinta">
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
  );
}

// Botão flutuante "Como usar" (casca antiga): abre o mesmo painel.
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
      <GuiaDaTela pathname={pathname} aberto={open} onFechar={() => setOpen(false)} />
    </>
  );
}
