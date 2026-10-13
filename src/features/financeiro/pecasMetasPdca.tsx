// PEÇAS DE RESULTADOS › METAS & PDCA E DA INTELIGÊNCIA 360 — redesenho Papel &
// Musgo, etapa 4 (08/10/2026).
//
// Metas do mês, PDCA do Dr. Daniel e as seções do 360 repetiam os mesmos
// pedaços: a régua dos degraus da meta, o selo da situação (aderiu, crítico,
// fluindo…), o indicador "rubrica · número · frase" e a tabela de ler. Moram
// aqui, só com os tokens novos — nada de vidro, blur, degradê ou opacidade
// antiga (border-brand-oliva/20, bg-brand-creme/40 não geram CSS). As peças
// genéricas do Financeiro (campo, razão, linha, aviso) continuam vindo de
// pecasBancoFechamento e pecasDiaPagar; isto é só o que estas três telas somam.
import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Selo } from "@/components/ui/selo";
import type { EstadoSelo } from "@/components/ui/papel-musgo";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- selo da situação

/**
 * O tom da situação, com a palavra sempre ao lado (a cor nunca fala sozinha):
 * ok = saudável/feito · atencao = falta algo · erro = crítico · espera = ainda
 * não andou · andando = em curso · neutro = encerrado sem efeito.
 */
export type TomDaSituacao = "ok" | "atencao" | "erro" | "espera" | "andando" | "neutro";

const ESTADO_DO_TOM: Record<TomDaSituacao, EstadoSelo> = {
  ok: "pago",
  atencao: "vencido",
  erro: "recusado",
  espera: "aguardando",
  andando: "aprovado",
  neutro: "cancelado",
};

/** Selo da fundação com a palavra da tela ("Aderiu", "Crítico", "Fluindo"). */
export function SeloDaSituacao({ tom, children, className }: { tom: TomDaSituacao; children: React.ReactNode; className?: string }) {
  return (
    <Selo estado={ESTADO_DO_TOM[tom]} className={className}>
      {children}
    </Selo>
  );
}

// ---------------------------------------------------------------- texto

/** Rubrica 12/700 em caixa alta (a sobrancelha dos blocos). */
export const RUBRICA_RESULTADOS = "text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2";

/** Título de bloco (16/700) com a soma ao lado e, embaixo, a frase de ajuda. */
export function TituloDeBloco({
  titulo,
  soma,
  ajuda,
  acoes,
  id,
  className,
}: {
  titulo: React.ReactNode;
  soma?: React.ReactNode;
  ajuda?: React.ReactNode;
  acoes?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0 flex-1">
        <h2 id={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-bold leading-6 text-tinta">
          {titulo}
          {soma !== undefined && soma !== null ? <span className="whitespace-nowrap text-sm font-bold leading-6 tabular-nums text-tinta-2">{soma}</span> : null}
        </h2>
        {ajuda ? <p className="mt-1 max-w-[72ch] text-[13px] font-medium leading-5 text-tinta-2">{ajuda}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- número

/**
 * O número de um indicador em Fraunces (sem "R$" separado: o valor já chega
 * formatado — "R$ 92.400,00", "68%", "12 de 57"). Algarismos de largura igual.
 */
export function NumeroDoIndicador({ children, tom, tamanho = "medio", className }: { children: React.ReactNode; tom?: "atencao" | "erro" | "ok"; tamanho?: "grande" | "medio"; className?: string }) {
  return (
    <p
      className={cn(
        "whitespace-nowrap font-serifa font-normal leading-none tracking-[-0.01em] [font-variant-numeric:lining-nums_tabular-nums]",
        tamanho === "grande" ? "text-[40px] max-md:text-[32px]" : "text-[28px] max-md:text-2xl",
        tom === "atencao" ? "text-atencao" : tom === "erro" ? "text-erro" : tom === "ok" ? "text-ok" : "text-tinta",
        className,
      )}
    >
      {children}
    </p>
  );
}

// ---------------------------------------------------------------- indicador

export type TomDoIndicador = "neutro" | "atencao" | "erro";

/**
 * Indicador "para saber": rubrica · número · frase da fonte. Com `para` vira
 * link para a tela de onde o número vem (a seta diz que leva a algum lugar).
 * `marca` é a etiqueta discreta ao lado da rubrica ("muda com o período").
 */
export function Indicador({
  rotulo,
  valor,
  frase,
  tom = "neutro",
  para,
  marca,
  className,
}: {
  rotulo: React.ReactNode;
  valor: React.ReactNode;
  frase?: React.ReactNode;
  tom?: TomDoIndicador;
  para?: string;
  marca?: React.ReactNode;
  className?: string;
}) {
  const conteudo = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className={cn(RUBRICA_RESULTADOS, "min-w-0")}>{rotulo}</span>
        {para ? (
          <ArrowRight className="mt-px h-4 w-4 shrink-0 text-tinta-2 transition-transform duration-150 ease-papel group-hover:translate-x-0.5 group-hover:text-musgo" aria-hidden="true" />
        ) : null}
      </span>
      <span className="mt-3 block">
        <NumeroDoIndicador tom={tom === "neutro" ? undefined : tom}>{valor}</NumeroDoIndicador>
      </span>
      {frase ? (
        <span className={cn("mt-2 block text-[13px] leading-5 [overflow-wrap:anywhere]", tom === "neutro" ? "font-medium text-tinta-2" : tom === "erro" ? "font-bold text-erro" : "font-bold text-atencao")}>
          {frase}
        </span>
      ) : null}
      {marca ? <span className="mt-3 block">{marca}</span> : null}
    </>
  );
  const base = "block min-w-0 rounded-bloco bg-saber p-5 text-left text-tinta max-md:p-4";
  if (!para) return <div className={cn(base, className)}>{conteudo}</div>;
  return (
    <Link
      to={para}
      className={cn(
        base,
        "group transition-colors duration-150 ease-papel hover:bg-fio/60",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
        className,
      )}
    >
      {conteudo}
    </Link>
  );
}

/** A etiqueta "muda com o período" (12/700, discreta). */
export function MarcaDoPeriodo({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-controle bg-folha px-2 text-xs font-bold leading-5 text-tinta-2 shadow-[inset_0_0_0_1px_rgb(var(--fio-2-rgb))]">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- régua dos degraus

export type DegrauDaMeta = { rotulo: string; valor: number };

/**
 * A régua da meta do mês: o faturado em musgo sobre o trilho e um fio fino em
 * cada degrau (o mínimo, a supermeta, a super-supermeta). A régua vai até o
 * maior degrau; passou dele, a barra enche. Nada que pareça arrastável. Os
 * degraus vêm escritos embaixo, na razão — aqui só o desenho.
 */
export function ReguaDosDegraus({ faturado, degraus, descricao, sobre = "saber" }: { faturado: number; degraus: DegrauDaMeta[]; descricao: string; sobre?: "saber" | "folha" }) {
  const topo = Math.max(1, ...degraus.map((degrau) => degrau.valor));
  const porcento = (valor: number) => Math.max(0, Math.min(100, (valor / topo) * 100));
  return (
    <div role="img" aria-label={descricao} className="relative h-5">
      <span className="absolute inset-x-0 top-1.5 h-2 rounded-controle bg-fio" />
      <span className="absolute left-0 top-1.5 h-2 rounded-l-controle bg-musgo" style={{ width: `${porcento(faturado)}%` }} />
      {degraus.map((degrau) => (
        <span
          key={degrau.rotulo}
          className={cn("absolute top-0 -ml-px h-5 w-0.5", faturado >= degrau.valor ? "bg-musgo-fundo" : "bg-tinta-2")}
          style={{ left: `${porcento(degrau.valor)}%`, boxShadow: `0 0 0 1px var(--${sobre})` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- tabela de ler

/** A tabela de ler (guia, seção 08): cabeçalho 12/700 em caixa alta, número à direita e tabular. */
export const TABELA = {
  rolagem: "mobile-scrollbar-none -mx-6 overflow-x-auto px-6 max-md:-mx-4 max-md:px-4",
  tabela: "w-full border-collapse font-sans text-sm font-medium leading-5 text-tinta",
  th: "h-10 whitespace-nowrap border-b border-fio-2 px-3 text-left align-middle text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2 first:pl-0 last:pr-0",
  thNum: "h-10 whitespace-nowrap border-b border-fio-2 px-3 text-right align-middle text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2 first:pl-0 last:pr-0",
  td: "border-b border-fio px-3 py-2.5 align-middle first:pl-0 last:pr-0",
  tdNum: "whitespace-nowrap border-b border-fio px-3 py-2.5 text-right align-middle tabular-nums first:pl-0 last:pr-0",
} as const;

// ---------------------------------------------------------------- formatação

/** "Outubro" a partir de "2026-10" (com o ano quando não é o ano de hoje). */
export function mesDaTela(chave: string, hoje: string): string {
  const [ano, mes] = chave.split("-").map(Number);
  if (!ano || !mes) return chave;
  const nome = new Date(ano, mes - 1, 15).toLocaleDateString("pt-BR", { month: "long" });
  const comMaiuscula = nome.charAt(0).toUpperCase() + nome.slice(1);
  return String(ano) === hoje.slice(0, 4) ? comMaiuscula : `${comMaiuscula} de ${ano}`;
}

/** "68%" (inteiro, como a tela sempre mostrou). */
export function porcentoInteiro(fracao: number): string {
  return `${Math.round(fracao * 100)}%`;
}
