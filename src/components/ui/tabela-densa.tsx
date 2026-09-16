// TABELA DENSA (16/09/2026, proposta 4.5 do estudo).
//
// As listas do app já eram tabelas de verdade, mas rolavam a página inteira: o
// cabeçalho sumia depois de dez linhas e o total só existia se a pessoa somasse
// de cabeça. Aqui ficam as três coisas que faltavam, sem trocar a base do
// projeto (React 18, sem TanStack Table):
//  · cabeçalho que gruda no topo e rodapé de totais que gruda embaixo;
//  · três densidades, guardadas por pessoa e por tela (quem confere o dia quer
//    ver 30 linhas de uma vez; quem lança quer respiro);
//  · um lugar só para a altura da área que rola.
// Continua sendo <table> comum: quem já lia a tela com leitor continua lendo.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Densidade = "compacta" | "normal" | "folgada";

const CHAVE = "app-bratan:densidade:";
const VALIDAS: Densidade[] = ["compacta", "normal", "folgada"];

/** Padding vertical das células por densidade — use em <td> e <th>. */
export const celulaPor: Record<Densidade, string> = {
  compacta: "py-1",
  normal: "py-2.5",
  folgada: "py-4",
};

export const rotuloDensidade: Record<Densidade, string> = {
  compacta: "Compacta",
  normal: "Normal",
  folgada: "Folgada",
};

/** A densidade escolhida na tela, lembrada no aparelho de quem usa. */
export function useDensidade(tela: string, padrao: Densidade = "normal") {
  const [densidade, setDensidade] = useState<Densidade>(padrao);
  useEffect(() => {
    try {
      const guardada = window.localStorage.getItem(CHAVE + tela);
      if (guardada && (VALIDAS as string[]).includes(guardada)) setDensidade(guardada as Densidade);
    } catch {
      /* aparelho sem localStorage: fica no padrão */
    }
  }, [tela]);
  const escolher = useCallback(
    (nova: Densidade) => {
      setDensidade(nova);
      try {
        window.localStorage.setItem(CHAVE + tela, nova);
      } catch {
        /* não poder lembrar não impede de usar */
      }
    },
    [tela],
  );
  return { densidade, escolher, celula: celulaPor[densidade] };
}

/** Os três botões de densidade, do jeito que aparecem no cabeçalho do cartão. */
export function ControleDensidade({ densidade, onEscolher, className }: { densidade: Densidade; onEscolher: (d: Densidade) => void; className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-full border border-brand-oliva/25 bg-white/70 p-0.5", className)} role="group" aria-label="Espaçamento das linhas">
      {VALIDAS.map((opcao) => (
        <button
          key={opcao}
          type="button"
          onClick={() => onEscolher(opcao)}
          aria-pressed={densidade === opcao}
          title={`Linhas ${rotuloDensidade[opcao].toLowerCase()}`}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
            densidade === opcao ? "bg-brand-musgo text-white" : "text-brand-oliva hover:bg-brand-creme/60",
          )}
        >
          {rotuloDensidade[opcao]}
        </button>
      ))}
    </div>
  );
}

/**
 * A área que rola, com cabeçalho e rodapé grudados. `altura` é uma classe de
 * altura máxima (o padrão cabe numa tela de notebook sem esconder o resto da
 * página); passe `altura="max-h-none"` para deixar a lista inteira crescer.
 */
export function TabelaRolavel({ children, altura = "max-h-[68vh]", className }: { children: ReactNode; altura?: string; className?: string }) {
  return (
    <div className={cn("mobile-scrollbar-none overflow-auto rounded-lg border border-brand-oliva/15", altura, className)}>
      {children}
    </div>
  );
}

/** Classe do <thead> que fica visível enquanto a lista rola. */
export const cabecalhoGrudado = "sticky top-0 z-10 bg-brand-creme/95 backdrop-blur supports-[backdrop-filter]:bg-brand-creme/80";
/** Classe do <tfoot> de totais, sempre à vista no rodapé da área que rola. */
export const rodapeGrudado = "sticky bottom-0 z-10 border-t border-brand-oliva/25 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85";
