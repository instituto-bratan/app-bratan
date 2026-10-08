// SELO DE SITUAÇÃO — forma, palavra e cor (Papel & Musgo, 08/10/2026).
//
// Cada selo tem QUATRO marcas de etapa (pedido · aprovação · compra ·
// recebimento), a palavra e a cor. Marca cheia = etapa feita; marca vazada = é a
// vez dela; marca apagada = ainda não chegou (ou o fluxo acabou). Quem não
// distingue cor lê a forma e a palavra — a cor nunca fala sozinha.
// Discreto na lista; "cheio" (com fundo) no painel de detalhe.
import * as React from "react";
import { cn } from "@/lib/utils";
import { SELOS, marcasDoSelo, type EstadoSelo, type MarcaDeEtapa } from "./papel-musgo";

const MARCA: Record<MarcaDeEtapa, string> = {
  cheia: "bg-current",
  vazada: "bg-transparent shadow-[inset_0_0_0_1.5px_currentColor]",
  vazia: "bg-fio-2",
};

/** Só as 4 marcas (para quem quer montar o próprio rótulo). */
export function MarcasDeEtapa({ etapas, fim, className }: { etapas: number; fim: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-hidden="true">
      {marcasDoSelo(etapas, fim).map((marca, i) => (
        <span key={i} className={cn("block h-3 w-[5px] rounded-[1px]", MARCA[marca])} />
      ))}
    </span>
  );
}

export type SeloProps = {
  estado: EstadoSelo;
  /** Troca a palavra ("Aprovado · falta comprar", "Comprado · a caminho"). */
  children?: React.ReactNode;
  /** Com fundo (painel de detalhe). Sem ele, só marcas + palavra (lista). */
  cheio?: boolean;
  /** Força quantas etapas estão feitas (o padrão vem do estado). */
  etapas?: number;
  className?: string;
};

export function Selo({ estado, children, cheio = false, etapas, className }: SeloProps) {
  const definicao = SELOS[estado];
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-2 whitespace-nowrap font-sans text-[13px] font-bold leading-5",
        definicao.texto,
        cheio && cn("rounded-controle py-0.5 pl-1.5 pr-2", definicao.fundo),
        className,
      )}
    >
      <MarcasDeEtapa etapas={etapas ?? definicao.etapas} fim={definicao.fim} />
      {children ?? definicao.palavra}
    </span>
  );
}
