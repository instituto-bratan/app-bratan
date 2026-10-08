// BOTÃO E LINK COM SETA — Papel & Musgo (08/10/2026).
//
// Regra do guia aprovado: DECISÃO ganha botão (Aprovar, Paguei, Liguei);
// NAVEGAÇÃO ganha link com seta (Conferir →, Ver o fluxo →). Um botão principal
// por tela. Altura 40 (32 na linha, 44 no toque do celular, 52 na barra fixa),
// raio 6, Manrope 14/700, foco visível em anel de 2 px na cor da ação.
//
// As classes saem de um mapa fechado (e não do cn/tailwind-merge) de propósito:
// assim nenhuma variante "come" a classe da outra sem ninguém perceber.
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type VarianteBotao = "primario" | "suave" | "secundario" | "fantasma" | "perigo" | "perigo-cheio";
export type TamanhoBotao = "pq" | "padrao" | "toque" | "grande";

const BASE =
  "inline-flex max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-controle border border-transparent font-sans font-bold leading-none " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-papel active:translate-y-px " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco " +
  "disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70 aria-disabled:cursor-not-allowed";

const TAMANHOS: Record<TamanhoBotao, string> = {
  pq: "h-8 px-3 text-[13px]",
  padrao: "h-10 px-4 text-sm",
  toque: "h-11 px-4 text-sm",
  grande: "h-[52px] px-6 text-base",
};

const VARIANTES: Record<VarianteBotao, string> = {
  // A decisão: musgo cheio, texto na cor "sobre musgo" (7,6:1).
  primario:
    "bg-musgo text-sobre-musgo hover:bg-musgo-forte active:bg-musgo-fundo disabled:bg-fio disabled:text-tinta-2",
  // Decisão na linha (Aprovar ao lado do valor).
  suave: "bg-musgo-claro text-musgo hover:bg-musgo-claro-2 active:bg-musgo-claro-2 disabled:bg-fio disabled:text-tinta-2",
  // Outra decisão (Devolver) ou criar/abrir (Nova conta).
  secundario:
    "border-fio-2 bg-folha text-tinta hover:border-borda-campo hover:bg-papel active:bg-saber disabled:border-transparent disabled:bg-fio disabled:text-tinta-2",
  // Ação de apoio (Cancelar, Voltar).
  fantasma: "bg-transparent text-tinta-2 hover:bg-saber hover:text-tinta active:bg-fio active:text-tinta disabled:text-tinta-2",
  // Perigo em texto, sem fundo, sempre na ponta oposta ao Aprovar.
  perigo: "bg-transparent text-erro hover:bg-erro-claro active:bg-erro-claro disabled:text-tinta-2",
  // Perigo confirmado (o "Recusar" depois de escrever o motivo).
  "perigo-cheio": "bg-erro text-folha hover:bg-erro/90 active:bg-erro/80 disabled:bg-fio disabled:text-tinta-2",
};

export function botaoClasses(opcoes: { variante?: VarianteBotao; tamanho?: TamanhoBotao; bloco?: boolean } = {}) {
  const { variante = "secundario", tamanho = "padrao", bloco = false } = opcoes;
  return [BASE, TAMANHOS[tamanho], VARIANTES[variante], bloco ? "w-full" : ""].filter(Boolean).join(" ");
}

export type BotaoProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  /** Ocupa a largura toda (barra fixa do celular). */
  bloco?: boolean;
  /** Mostra o giro e ignora cliques, sem parecer desligado. */
  carregando?: boolean;
  /** Ícone à esquerda (lucide, 16 px). */
  icone?: React.ReactNode;
};

/** Giro de "carregando", na cor do texto do botão. */
export function Giro({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export const Botao = React.forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  { variante = "secundario", tamanho = "padrao", bloco, carregando = false, icone, className, children, type, onClick, ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(botaoClasses({ variante, tamanho, bloco }), carregando && "cursor-progress", className)}
      aria-busy={carregando || undefined}
      onClick={(evento) => {
        if (carregando) {
          evento.preventDefault();
          return;
        }
        onClick?.(evento);
      }}
      {...resto}
    >
      {carregando ? <Giro /> : icone}
      {children}
    </button>
  );
});

export type LinkSetaProps = {
  /** Rota do app (usa o roteador). */
  to?: string;
  /** Endereço comum (abre fora do roteador). */
  href?: string;
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

const LINK_SETA =
  "group inline-flex items-center gap-1 whitespace-nowrap rounded-sm text-sm font-bold leading-5 text-musgo " +
  "underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";

/** Navegação ganha seta: "Conferir →". */
export function LinkSeta({ to, href, children, className, onClick }: LinkSetaProps) {
  const conteudo = (
    <>
      {children}
      <ArrowRight
        className="h-4 w-4 shrink-0 transition-transform duration-150 ease-papel group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cn(LINK_SETA, className)} onClick={onClick}>
        {conteudo}
      </Link>
    );
  }
  return (
    <a href={href} className={cn(LINK_SETA, className)} onClick={onClick}>
      {conteudo}
    </a>
  );
}
