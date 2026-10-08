// PEÇAS DO INÍCIO — redesenho "Papel & Musgo", etapa 2 (08/10/2026).
//
// Os pedaços de forma que só o Início usa (imagem 01 aprovada e
// visual/final/inicio.src.html): a lista de decisões em grade (título · valor ·
// ação, com os valores alinhados entre os grupos), o cabeçalho de cada grupo, a
// etiqueta "Urgente", o relógio do prazo, o número grande em Fraunces, a barra
// "faturado × meta até hoje" e a faixa das salas ocupadas. Tudo com os tokens
// novos — nada de vidro, blur, degradê ou sombra; oliva e dourado nunca como
// cor de texto.
import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- lista de decisões

/**
 * A lista em grade: título (1fr) · valor · ação. Cada linha usa a grade da lista
 * (subgrid), então os valores de grupos diferentes caem na mesma coluna. No
 * celular são duas colunas (o corpo à esquerda; valor e ação empilhados).
 */
export function ListaDeDecisoes({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-[minmax(0,1fr)_auto_auto] max-md:grid-cols-[minmax(0,1fr)_auto]", className)}>{children}</div>;
}

/** Cabeçalho do grupo: título 16/700, a soma em tinta e, à direita, a ação do grupo ou uma nota. */
export function CabecaDoGrupo({
  titulo,
  soma,
  direita,
  seguinte = false,
  id,
}: {
  titulo: string;
  soma: React.ReactNode;
  direita?: React.ReactNode;
  /** Não é o primeiro grupo: ganha o fio firme acima, para os grupos não virarem uma lista só. */
  seguinte?: boolean;
  id?: string;
}) {
  return (
    <div
      className={cn(
        "col-span-full flex min-h-16 items-center justify-between gap-x-4 gap-y-1 px-4 pb-2 pt-6 max-md:flex-wrap max-md:pt-5",
        seguinte && "border-t border-fio-2",
      )}
    >
      <h2 id={id} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 max-md:w-full max-md:justify-between">
        <span className="whitespace-nowrap text-base font-bold leading-6 text-tinta">{titulo}</span>
        <span className="text-sm font-semibold leading-6 tabular-nums text-tinta">{soma}</span>
      </h2>
      {direita ? <div className="flex shrink-0 items-center gap-3 max-md:hidden">{direita}</div> : null}
    </div>
  );
}

/** Uma linha de decisão: corpo (título + meta), valor e ações, na grade da lista. */
export function LinhaDeDecisao({
  titulo,
  meta,
  valor,
  acoes,
  acoesNoCelular = true,
  apagada = false,
  className,
}: {
  titulo: React.ReactNode;
  meta?: React.ReactNode;
  valor?: React.ReactNode;
  acoes?: React.ReactNode;
  /** false = no celular a linha não leva botão (decide-se no detalhe, como na imagem 05). */
  acoesNoCelular?: boolean;
  /** Decidida há pouco (na janela do "Desfazer"): o texto vai para o segundo plano. */
  apagada?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "col-span-full grid min-h-16 grid-cols-subgrid items-center gap-x-4 border-t border-fio px-4 py-3",
        "max-md:items-start max-md:gap-y-1",
        className,
      )}
    >
      <div className="min-w-0 max-md:row-span-2">
        <div className={cn("text-sm font-bold leading-5 [text-wrap:balance]", apagada ? "text-tinta-2" : "text-tinta")}>{titulo}</div>
        {meta ? <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] font-medium leading-5 text-tinta-2">{meta}</div> : null}
      </div>
      <span className="justify-self-end whitespace-nowrap text-sm font-bold leading-5 tabular-nums text-tinta">{valor}</span>
      <div className={cn("flex items-center justify-self-end gap-1", !acoesNoCelular && "max-md:hidden")}>{acoes}</div>
    </div>
  );
}

/** O ponto que separa os pedaços da meta ("Enfermagem · Juliana · prazo"). */
export function Sep() {
  return (
    <span aria-hidden="true" className="text-fio-2">
      ·
    </span>
  );
}

/** A etiqueta "Urgente" (20 px, ícone de 12 px), como a .etiqueta da proposta. */
export function EtiquetaUrgente() {
  return (
    <span className="mr-1 inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-controle bg-erro-claro px-2 align-[1px] text-xs font-bold leading-5 text-erro">
      <AlertTriangle className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
      Urgente
    </span>
  );
}

/** O relógio do prazo: o fio de ouro enche conforme o prazo passa; vencido, a frase vai para atenção. */
export function RelogioDoPrazo({ texto, gasto, vencido }: { texto: string; gasto: number; vencido: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap text-[13px] leading-5 tabular-nums", vencido ? "font-bold text-atencao" : "font-semibold text-tinta-2")}>
      <span aria-hidden="true" className="relative block h-1 w-10 shrink-0 rounded-sm bg-fio shadow-[inset_0_0_0_1px_var(--fio-2)]">
        <span className="absolute inset-y-0 left-0 rounded-sm bg-ouro-fio" style={{ width: `${Math.round(Math.max(0, Math.min(1, gasto)) * 100)}%` }} />
      </span>
      {texto}
    </span>
  );
}

// ---------------------------------------------------------------- para saber

/** Rubrica: 12/700, caixa alta, tinta-2. */
export function Rubrica({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn("text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2", className)}>
      {children}
    </h2>
  );
}

/** Número principal: Fraunces 40, com o "R$" menor em Manrope, como papel timbrado. */
export function NumeroGrande({ valor, className }: { valor: string; className?: string }) {
  return (
    <p className={cn("whitespace-nowrap font-serifa text-[40px] font-normal leading-none tracking-[-0.01em] text-tinta [font-variant-numeric:lining-nums_tabular-nums]", className)}>
      <span className="mr-1 align-[0.95em] font-sans text-sm font-bold leading-none tracking-[0.02em] text-tinta-2">R$</span>
      {valor}
    </p>
  );
}

/**
 * Faturado × meta: a barra do feito (musgo) e a marca "meta até hoje" (tinta),
 * com o rótulo saindo da própria marca. Nada que pareça arrastável.
 */
export function BarraDaMeta({ feito, ateHoje, rotulo, descricao }: { feito: number; ateHoje: number; rotulo: React.ReactNode; descricao: string }) {
  const pFeito = Math.max(0, Math.min(100, feito));
  const pHoje = Math.max(0, Math.min(100, ateHoje));
  // Perto da ponta direita o rótulo vai para o lado esquerdo da marca.
  const rotuloAEsquerda = pHoje > 60;
  return (
    <div role="img" aria-label={descricao} className="grid">
      <div className="relative h-5">
        <span className="absolute inset-x-0 top-1.5 h-2 rounded-controle bg-fio" />
        <span className="absolute left-0 top-1.5 h-2 rounded-l-controle bg-musgo" style={{ width: `${pFeito}%` }} />
        <span className="absolute top-0 -ml-px h-10 w-0.5 bg-tinta shadow-[0_0_0_1px_var(--saber)]" style={{ left: `${pHoje}%` }} />
      </div>
      <p aria-hidden="true" className="relative h-5 text-[13px] font-medium leading-5 text-tinta-2 [&_strong]:font-bold [&_strong]:text-tinta">
        <span className="absolute whitespace-nowrap" style={rotuloAEsquerda ? { right: `calc(${100 - pHoje}% + 8px)` } : { left: `calc(${pHoje}% + 8px)` }}>
          {rotulo}
        </span>
      </p>
    </div>
  );
}

/** Faixa das salas: o trilho, a zona saudável hachurada entre dois fios verdes e o ocupado em musgo. */
export function FaixaDasSalas({ valor, de, ate, descricao }: { valor: number; de: number; ate: number; descricao: string }) {
  const p = (n: number) => Math.max(0, Math.min(100, n));
  return (
    <div role="img" aria-label={descricao} className="relative h-5">
      <span className="absolute inset-x-0 top-1.5 h-2 rounded-controle bg-fio" />
      <span
        className="absolute inset-y-0 border-x-2 border-ok"
        style={{
          left: `${p(de)}%`,
          width: `${p(ate) - p(de)}%`,
          // hachura (listras finas), não degradê: o mesmo desenho da .faixa-boa aprovada
          background: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--ok) 26%, transparent) 0 2px, transparent 2px 5px)",
        }}
      />
      <span className="absolute left-0 top-1.5 h-2 rounded-l-controle bg-musgo" style={{ width: `${p(valor)}%` }} />
    </div>
  );
}

/** Um par rótulo · valor do bloco "para saber" (Cabe gastar no mês ………… R$ 38.200). */
export function Par({ rotulo, valor, tom = "tinta" }: { rotulo: React.ReactNode; valor: React.ReactNode; tom?: "tinta" | "atencao" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm font-semibold leading-5 text-tinta">{rotulo}</span>
      <span className={cn("whitespace-nowrap text-xl font-bold leading-7 tabular-nums", tom === "atencao" ? "text-atencao" : "text-tinta")}>{valor}</span>
    </div>
  );
}

/** A divisa entre os pedaços do bloco "para saber". */
export function Divisa({ className }: { className?: string }) {
  return <hr className={cn("m-0 h-px border-0 bg-fio-2", className)} />;
}
