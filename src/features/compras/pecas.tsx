// PEÇAS DAS TELAS DE COMPRAS E ESTOQUE — Papel & Musgo (08/10/2026).
//
// O que as três telas (Pedidos, Estoque por setor, Aplicações) e os formulários
// das gavetas repetem, já na forma aprovada: campo de formulário (o Input antigo
// tinha vidro e fundo branco translúcido), recado em faixa, selo do pedido,
// etiqueta "Urgente", relógio do prazo, número em Fraunces, link-botão com seta
// e a leitura-filtro em texto. Só tokens novos (fio, saber, folha, musgo…):
// nada de opacidade nos nomes antigos, que não gera CSS.
import * as React from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Selo } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import type { PedidoCompra, PedidoStatus } from "./comprasData";
import { tempoEsperandoTexto } from "./comprasData";
import { fracaoDoPrazo, prazoEstourado, seloDoPedido } from "./pedidoTela";

// ---------------------------------------------------------------- campos

/** Campo de texto, seleção e data: folha, contorno de 3:1, foco em anel musgo. 40 px (44 no celular). */
export const classeDoCampo =
  "h-10 w-full min-w-0 rounded-controle border border-borda-campo bg-folha px-3 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 placeholder:font-medium focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco " +
  "disabled:cursor-not-allowed disabled:bg-saber disabled:text-tinta-2 aria-[invalid=true]:border-erro max-md:h-11 max-md:text-base";

export const classeDaArea =
  "min-h-[72px] w-full resize-y rounded-controle border border-borda-campo bg-folha px-3 py-2 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco aria-[invalid=true]:border-erro max-md:text-base";

export const classeDoRotulo = "text-[13px] font-bold leading-5 text-tinta";
export const classeDaAjuda = "text-[13px] font-medium leading-5 text-tinta-2";

export const CampoTexto = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function CampoTexto({ className, ...resto }, ref) {
  return <input ref={ref} className={cn(classeDoCampo, className)} {...resto} />;
});

export const CampoSelecao = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function CampoSelecao({ className, ...resto }, ref) {
  return <select ref={ref} className={cn(classeDoCampo, "pr-8", className)} {...resto} />;
});

export const CampoArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function CampoArea({ className, ...resto }, ref) {
  return <textarea ref={ref} className={cn(classeDaArea, className)} {...resto} />;
});

/** Rótulo + campo + ajuda, empilhados com 8 px. */
export function Campo({
  id,
  rotulo,
  ajuda,
  children,
  className,
}: {
  id?: string;
  rotulo: React.ReactNode;
  ajuda?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-2", className)}>
      <label htmlFor={id} className={classeDoRotulo}>
        {rotulo}
      </label>
      {children}
      {ajuda ? <p className={classeDaAjuda}>{ajuda}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- recado

export type TomDoRecado = "atencao" | "erro" | "ok" | "petroleo" | "neutro";

const TOM_DO_RECADO: Record<TomDoRecado, { fundo: string; forte: string }> = {
  atencao: { fundo: "bg-atencao-claro", forte: "[&_strong]:text-atencao" },
  erro: { fundo: "bg-erro-claro", forte: "[&_strong]:text-erro" },
  ok: { fundo: "bg-ok-claro", forte: "[&_strong]:text-ok" },
  petroleo: { fundo: "bg-petroleo-claro", forte: "[&_strong]:text-petroleo" },
  neutro: { fundo: "bg-saber", forte: "[&_strong]:text-tinta" },
};

/**
 * Faixa de recado (o que ajustar, o motivo da recusa, o que não bateu): fundo
 * claro da situação, texto em tinta (lê-se bem nos dois temas) e o trecho em
 * <strong> na cor da situação — a cor nunca fala sozinha.
 */
export function Recado({
  tom,
  children,
  icone,
  className,
  role,
}: {
  tom: TomDoRecado;
  children: React.ReactNode;
  icone?: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const estilo = TOM_DO_RECADO[tom];
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2 rounded-bloco px-4 py-3 text-sm font-medium leading-6 text-tinta [overflow-wrap:anywhere] [&_strong]:font-bold",
        estilo.fundo,
        estilo.forte,
        className,
      )}
    >
      {icone ? <span className="mt-1 shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icone}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- selo, etiqueta, prazo

/** O selo do pedido (marcas + palavra + cor). `cheio` = com fundo (painel). */
export function SeloDoPedido({ status, faltaComprar, cheio, className }: { status: PedidoStatus; faltaComprar?: boolean; cheio?: boolean; className?: string }) {
  const { estado, palavra } = seloDoPedido(status, { faltaComprar });
  return (
    <Selo estado={estado} cheio={cheio} className={className}>
      {palavra}
    </Selo>
  );
}

/** Etiqueta "Urgente" (a única etiqueta das listas de pedido). */
export function EtiquetaUrgente({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "mr-1 inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-controle bg-erro-claro px-2 align-[1px] text-xs font-bold leading-5 text-erro",
        className,
      )}
    >
      <TriangleAlert className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
      Urgente
    </span>
  );
}

/** O relógio do prazo: o fio de ouro enche conforme o prazo passa; vencido, fica laranja e cheio. */
export function RelogioDoPrazo({ pedido, hojeISO, className }: { pedido: PedidoCompra; hojeISO: string; className?: string }) {
  const atrasado = prazoEstourado(pedido, hojeISO);
  const gasto = fracaoDoPrazo(pedido, hojeISO);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 text-[13px] leading-5 tabular-nums",
        atrasado ? "font-bold text-atencao" : "font-semibold text-tinta-2",
        className,
      )}
    >
      <span aria-hidden="true" className="relative h-1 w-10 shrink-0 rounded-sm bg-fio ring-1 ring-inset ring-fio-2">
        <span className={cn("absolute inset-y-0 left-0 rounded-sm", atrasado ? "bg-atencao" : "bg-ouro-fio")} style={{ width: `${Math.round(gasto * 100)}%` }} />
        {atrasado ? <span className="absolute -right-1 top-1/2 -mt-[3px] h-1.5 w-1.5 rounded-full bg-atencao" /> : null}
      </span>
      <span className="min-w-0">
        {`enviado ${tempoEsperandoTexto(pedido, hojeISO)}`}
        {atrasado ? " · passou do prazo" : ""}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- número e links

/** Número principal em Fraunces, com o "R$" menor em Manrope (nunca dentro de tabela). */
export function NumeroEmReais({ valor, className }: { valor: number; className?: string }) {
  const texto = valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span className={cn("whitespace-nowrap font-serifa text-[32px] font-normal leading-none tracking-[-0.01em] text-tinta tabular-nums", className)}>
      <span className="mr-1 align-[0.8em] font-sans text-[13px] font-bold tracking-[0.02em] text-tinta-2">R$</span>
      {texto}
    </span>
  );
}

const CLASSE_DA_SETA =
  "group inline-flex items-center gap-1 whitespace-nowrap rounded-sm text-[13px] font-bold leading-5 text-musgo underline-offset-[3px] hover:underline " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:cursor-not-allowed disabled:text-tinta-2 disabled:no-underline";

/** Ação que abre um formulário, com a cara do link com seta ("Registrar compra →"). */
export function AcaoSeta({ children, className, ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn(CLASSE_DA_SETA, className)} {...resto}>
      {children}
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-150 ease-papel group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

/** Link comum (fora do roteador, ex.: arquivo em outra aba) com a cara do LinkSeta. */
export function LinkSetaExterno({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn(CLASSE_DA_SETA, "text-sm", className)}>
      {children}
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-150 ease-papel group-hover:translate-x-0.5" aria-hidden="true" />
    </a>
  );
}

// ---------------------------------------------------------------- leitura (filtro em texto)

/** Rótulo + número, sem caixa; a marcada leva o traço musgo embaixo (o ouro é do "agora"). */
export function Leitura({
  ativa,
  rotulo,
  numero,
  extra,
  dica,
  onClick,
}: {
  ativa: boolean;
  rotulo: string;
  numero?: number;
  /** O rótulo inteiro, quando o da tela é curto ("Recebidos" → "Recebidos no mês"). */
  dica?: string;
  /** Um pedaço a mais, na cor de atenção ("1 atrasado"). */
  extra?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      title={dica}
      aria-label={dica ? `${dica}${numero !== undefined ? `: ${numero}` : ""}${extra ? `, ${extra}` : ""}` : undefined}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-sm text-[13px] leading-5 max-md:h-11",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
        ativa
          ? "font-bold text-tinta after:absolute after:inset-x-0 after:bottom-0.5 after:h-0.5 after:rounded-sm after:bg-musgo after:content-[''] max-md:after:bottom-2"
          : "font-semibold text-tinta-2 hover:text-tinta",
      )}
    >
      {rotulo}
      {numero !== undefined ? <span className="ml-1 font-extrabold tabular-nums text-tinta">{numero}</span> : null}
      {extra ? <span className="ml-1 font-bold text-atencao">· {extra}</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------- largura da tela

/** A tela casa com a media query? (lida na hora, e de novo quando a janela muda). */
export function useMidia(consulta: string): boolean {
  const ler = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(consulta).matches : false);
  const [casa, setCasa] = React.useState(ler);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const midia = window.matchMedia(consulta);
    const mudou = () => setCasa(midia.matches);
    mudou();
    midia.addEventListener("change", mudou);
    return () => midia.removeEventListener("change", mudou);
  }, [consulta]);
  return casa;
}
