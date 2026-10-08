// A FOLHA QUE SOBE (08/10/2026): no celular, o Menu e o Novo da barra de baixo
// abrem uma folha que sobe da base, com véu no resto da tela — a mesma peça da
// imagem 05 (painel de detalhe virando folha). Esc ou toque no véu fecham; o
// foco vai para a folha ao abrir e volta para quem abriu ao fechar.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FolhaQueSobeProps = {
  aberta: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  className?: string;
};

export function FolhaQueSobe({ aberta, titulo, onFechar, children, className }: FolhaQueSobeProps) {
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
      if (evento.key === "Escape") {
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
  }, [aberta, onFechar]);

  return (
    <AnimatePresence>
      {aberta ? (
        <motion.div
          key="folha"
          // z-[65] (revisão de 08/10/2026): acima do Balão do Dia (z-60), que no celular
          // fica justo onde a folha sobe; abaixo dos avisos rápidos (z-70).
          className="fixed inset-0 z-[65] flex items-end bg-[var(--veu)] md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) onFechar();
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
              "flex max-h-[88dvh] w-full flex-col rounded-t-painel bg-folha font-sans text-tinta shadow-flutua outline-none",
              className,
            )}
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-fio-2" aria-hidden="true" />
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-2">
              <h2 id={idTitulo} className="text-base font-bold text-tinta">
                {titulo}
              </h2>
              <button
                type="button"
                onClick={onFechar}
                aria-label={`Fechar ${titulo.toLowerCase()}`}
                className="-mr-2 grid h-11 w-11 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(16px,env(safe-area-inset-bottom))]">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
