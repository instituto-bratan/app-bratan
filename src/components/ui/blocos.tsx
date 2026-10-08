// OS DOIS TIPOS DE BLOCO — Papel & Musgo (08/10/2026).
//
// "Decidir em folha, saber em papel." O que pede uma decisão (lista de
// aprovação, contas a pagar hoje) mora numa FOLHA: o tom mais alto, com borda e
// sem sombra. O que é só para saber (o mês até agora, a agenda) mora no SABER:
// um tom abaixo do papel, sem borda e sem sombra. Sombra só no que flutua.
// Os dois tomam o tom certo no escuro sozinhos (são tokens).
import * as React from "react";
import { cn } from "@/lib/utils";

type ElementoDoBloco = "div" | "section" | "aside" | "article";

export type BlocoProps = React.HTMLAttributes<HTMLElement> & {
  /** Qual elemento HTML (section/aside dão um marco a mais para o leitor de tela). */
  as?: ElementoDoBloco;
};

/** Bloco "para saber": fundo saber, sem borda, sem sombra, 24 px de respiro (16 no celular). */
export function BlocoSaber({ as = "div", className, ...resto }: BlocoProps) {
  const Elemento = as;
  return <Elemento className={cn("rounded-bloco bg-saber p-6 text-tinta max-md:p-4", className)} {...resto} />;
}

export type BlocoFolhaProps = BlocoProps & {
  /** Com respiro interno (24 px). Sem ele, a lista encosta nas bordas, como no guia. */
  respiro?: boolean;
};

/** Bloco "para decidir": folha com borda, sem sombra. Por padrão sem respiro (as linhas da lista encostam). */
export function BlocoFolha({ as = "div", respiro = false, className, ...resto }: BlocoFolhaProps) {
  const Elemento = as;
  return (
    <Elemento
      className={cn("rounded-bloco border border-fio bg-folha text-tinta", respiro && "p-6 max-md:p-4", className)}
      {...resto}
    />
  );
}
