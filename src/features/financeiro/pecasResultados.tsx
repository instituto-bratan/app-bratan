// PEÇAS DAS TELAS DE RESULTADOS — Papel & Musgo (08/10/2026, redesenho etapa 4).
//
// Painel do mês, Lucro Inteligente e P12 falam a mesma língua das telas do
// Financeiro (pecasBancoFechamento.tsx): número principal em Fraunces com o
// "R$" pequeno, rubrica em caixa alta, razão rótulo → valor, barra fina de
// progresso e a situação sempre com palavra ou ícone ao lado da cor. As peças
// que faltavam lá — o número que já chega formatado ("R$ 1.234,56", "41%"), a
// variação contra o mês anterior, o título numerado dos blocos da reunião e a
// barra com marca — moram aqui. Nada de vidro, degradê ou sombra pesada; oliva
// e dourado nunca como cor de texto; letra mínima de 12 px.
import * as React from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- tom

/** O tom de um número do Painel (o mesmo vocabulário dos pontos da reunião). */
export type TomResultado = "BOM" | "ATENCAO" | "RUIM" | "NEUTRO";

/** Cor do texto de cada tom (todas passam no AA, nos dois temas). */
export const COR_DO_TOM: Record<TomResultado, string> = {
  BOM: "text-ok",
  ATENCAO: "text-atencao",
  RUIM: "text-erro",
  NEUTRO: "text-tinta",
};

/** Fundo claro de cada tom (faixa de recado, destaque de linha). */
export const FUNDO_DO_TOM: Record<TomResultado, string> = {
  BOM: "bg-ok-claro",
  ATENCAO: "bg-atencao-claro",
  RUIM: "bg-erro-claro",
  NEUTRO: "bg-saber",
};

/** A palavra que acompanha a cor (a cor nunca fala sozinha). */
export const PALAVRA_DO_TOM: Record<TomResultado, string> = {
  BOM: "bom sinal",
  ATENCAO: "atenção",
  RUIM: "preocupa",
  NEUTRO: "",
};

/** O ícone de cada tom: quem não distingue cor lê a forma. */
export function IconeDoTom({ tom, className }: { tom: TomResultado; className?: string }) {
  const classe = cn("h-4 w-4 shrink-0", COR_DO_TOM[tom], className);
  if (tom === "BOM") return <CheckCircle2 className={classe} aria-hidden="true" />;
  if (tom === "ATENCAO" || tom === "RUIM") return <AlertTriangle className={classe} aria-hidden="true" />;
  return <Minus className={cn(classe, "text-tinta-2")} aria-hidden="true" />;
}

// ---------------------------------------------------------------- número

export type TamanhoDoNumero = "apresentacao" | "grande" | "medio" | "pequeno";

const TAMANHO: Record<TamanhoDoNumero, { numero: string; moeda: string }> = {
  apresentacao: { numero: "text-[56px] max-md:text-[40px]", moeda: "text-base align-[1.1em]" },
  grande: { numero: "text-[40px] max-md:text-[32px]", moeda: "text-sm align-[0.95em]" },
  medio: { numero: "text-[32px] max-md:text-[28px]", moeda: "text-[13px] align-[0.8em]" },
  pequeno: { numero: "text-2xl", moeda: "text-xs align-[0.6em]" },
};

/**
 * Separa a moeda do número num valor já formatado: "R$ 1.234,56" → R$ + 1.234,56;
 * "-R$ 12,00" → −R$ + 12,00; "41%" e "12" passam inteiros (sem moeda).
 */
export function partesDoValor(texto: string): { moeda: string | null; numero: string } {
  const limpo = String(texto ?? "").replace(/ /g, " ").trim();
  const casa = limpo.match(/^([-−])?\s*R\$\s*(.*)$/);
  if (!casa) return { moeda: null, numero: limpo };
  return { moeda: casa[1] ? "−R$" : "R$", numero: casa[2] };
}

/** Número principal em Fraunces com o "R$" menor em Manrope (papel timbrado). Nunca dentro de tabela. */
export function Numero({
  texto,
  tamanho = "medio",
  tom = "NEUTRO",
  className,
}: {
  /** O valor já formatado (moneyFin, "41%", "12"). */
  texto: string;
  tamanho?: TamanhoDoNumero;
  tom?: TomResultado;
  className?: string;
}) {
  const { moeda, numero } = partesDoValor(texto);
  const t = TAMANHO[tamanho];
  return (
    <p
      className={cn(
        "whitespace-nowrap font-serifa font-normal leading-none tracking-[-0.01em] [font-variant-numeric:lining-nums_tabular-nums]",
        t.numero,
        COR_DO_TOM[tom],
        className,
      )}
    >
      {moeda ? <span className={cn("mr-1 font-sans font-bold tracking-[0.02em] text-tinta-2", t.moeda)}>{moeda}</span> : null}
      {numero}
    </p>
  );
}

/** Rubrica: caixa alta 12/700 em tinta-2 (a sobrancelha dos blocos). */
export function Rubrica({ children, className, id, as = "p" }: { children: React.ReactNode; className?: string; id?: string; as?: "p" | "h2" | "h3" }) {
  const Elemento = as;
  return (
    <Elemento id={id} className={cn("text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2", className)}>
      {children}
    </Elemento>
  );
}

// ---------------------------------------------------------------- variação

/** "+12,3% contra set" com seta e cor; melhorou = verde (ok), piorou = erro. Sem base: diz isso. */
export function Variacao({
  variacao,
  melhorou,
  contra,
  className,
}: {
  /** Em %, ou null quando o mês anterior é zero. */
  variacao: number | null;
  melhorou: boolean | null;
  /** "set", "o mesmo dia de setembro"… */
  contra: string;
  className?: string;
}) {
  if (variacao === null || melhorou === null) {
    return <p className={cn("text-[13px] font-medium leading-5 text-tinta-2", className)}>sem base de comparação</p>;
  }
  const Icone = variacao >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={cn("flex items-center gap-1 text-[13px] font-bold leading-5 tabular-nums", melhorou ? "text-ok" : "text-erro", className)}>
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      {variacao > 0 ? "+" : ""}
      {variacao.toFixed(1).replace(".", ",")}% contra {contra}
      <span className="sr-only">{melhorou ? " (melhorou)" : " (piorou)"}</span>
    </p>
  );
}

// ---------------------------------------------------------------- título dos blocos

/**
 * O título de um bloco da reunião: o número em Fraunces (o "1." da pauta) e o
 * nome em Manrope 20/700. No modo apresentação o bloco vira um slide e o título
 * cresce para Fraunces 40.
 */
export function TituloDaSecao({
  numero,
  children,
  id,
  apresentando = false,
  acoes,
  ajuda,
  className,
}: {
  numero?: number;
  children: React.ReactNode;
  id?: string;
  apresentando?: boolean;
  acoes?: React.ReactNode;
  ajuda?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 flex-1">
        <h2
          id={id}
          className={cn(
            "flex items-baseline gap-x-3 text-tinta [text-wrap:balance]",
            apresentando ? "font-serifa text-[40px] font-normal leading-[1.1] tracking-[-0.012em] max-md:text-[32px]" : "text-xl font-bold leading-7",
          )}
        >
          {numero !== undefined ? (
            <span className={cn("font-serifa font-normal tabular-nums text-tinta-2", apresentando ? "" : "text-2xl leading-7")}>{numero}</span>
          ) : null}
          <span className="min-w-0">{children}</span>
        </h2>
        {ajuda ? <p className={cn("mt-1 max-w-[72ch] font-medium text-tinta-2", apresentando ? "text-base leading-6" : "text-[13px] leading-5")}>{ajuda}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- barra

export type TomDaBarra = "musgo" | "ok" | "atencao" | "erro" | "ouro" | "tinta";

const COR_DA_BARRA: Record<TomDaBarra, string> = {
  musgo: "bg-musgo",
  ok: "bg-ok",
  atencao: "bg-atencao",
  erro: "bg-erro",
  ouro: "bg-ouro-fio",
  tinta: "bg-tinta-2",
};

/**
 * Barra fina de progresso (8 px): trilho em fio, o feito na cor do tom e, se
 * houver, a marca em tinta (o "esperado até hoje", o "transferido"). Nada que
 * pareça arrastável; quem lê a tela ouve o rótulo.
 */
export function BarraFina({
  valor,
  marca,
  tom = "musgo",
  cor,
  rotulo,
  alta = false,
  faixa,
  className,
}: {
  /** 0 a 100. */
  valor: number;
  /** 0 a 100: o traço em tinta por cima. */
  marca?: number | null;
  tom?: TomDaBarra;
  /** Cor livre do preenchimento (amostra de série); vence o tom. */
  cor?: string;
  rotulo: string;
  /** 12 px em vez de 8 (no modo apresentação). */
  alta?: boolean;
  /** Faixa saudável (de–até, em %): hachura entre dois fios verdes. */
  faixa?: { de: number; ate: number };
  className?: string;
}) {
  const p = (n: number) => Math.max(0, Math.min(100, n));
  const preenchido = p(valor);
  return (
    <div role="img" aria-label={rotulo} className={cn("relative", alta ? "h-3" : "h-2", className)}>
      <span className="absolute inset-0 rounded-controle bg-fio" />
      {faixa ? (
        <span
          className="absolute inset-y-[-3px] border-x-2 border-ok"
          style={{
            left: `${p(faixa.de)}%`,
            width: `${p(faixa.ate) - p(faixa.de)}%`,
            background: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--ok) 26%, transparent) 0 2px, transparent 2px 5px)",
          }}
        />
      ) : null}
      <span
        className={cn("absolute inset-y-0 left-0 rounded-controle", cor ? "" : COR_DA_BARRA[tom])}
        style={{ width: `${preenchido > 0 ? Math.max(1.5, preenchido) : 0}%`, background: cor }}
      />
      {marca !== undefined && marca !== null ? (
        <span className="absolute -top-1 -ml-px h-[calc(100%+8px)] w-0.5 bg-tinta shadow-[0_0_0_1px_var(--saber)]" style={{ left: `${p(marca)}%` }} />
      ) : null}
    </div>
  );
}

/** Amostra de cor da legenda (10 px). */
export function Amostra({ cor, traco = false, className }: { cor: string; traco?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0", traco ? "h-0.5 w-4 rounded-full" : "h-2.5 w-2.5 rounded-[2px]", className)}
      style={{ background: cor }}
    />
  );
}

/** Legenda de um gráfico: amostra + nome, 12 px em tinta-2. */
export function Legenda({ itens, className }: { itens: { nome: React.ReactNode; cor: string; traco?: boolean }[]; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium leading-4 text-tinta-2", className)}>
      {itens.map((item, indice) => (
        <span key={indice} className="inline-flex items-center gap-1.5">
          <Amostra cor={item.cor} traco={item.traco} />
          {item.nome}
        </span>
      ))}
    </p>
  );
}

// ---------------------------------------------------------------- etiqueta e campo de texto

export type TomEtiqueta = "neutro" | "musgo" | "ouro" | "ok" | "atencao" | "erro";

const TOM_ETIQUETA: Record<TomEtiqueta, string> = {
  neutro: "bg-fio/70 text-tinta-2",
  musgo: "bg-musgo-claro text-musgo",
  ouro: "bg-ouro-claro text-ouro",
  ok: "bg-ok-claro text-ok",
  atencao: "bg-atencao-claro text-atencao",
  erro: "bg-erro-claro text-erro",
};

/** Etiqueta pequena (20 px, 12/700): "Resultado", "é a régua", "CAPEX". */
export function Etiqueta({ tom = "neutro", children, className, title }: { tom?: TomEtiqueta; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex h-5 w-fit max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-controle px-2 font-sans text-xs font-bold leading-5", TOM_ETIQUETA[tom], className)}
    >
      {children}
    </span>
  );
}

/** Campo de texto de várias linhas (explicação, PDCA, anotação da reunião): contorno 3:1, foco musgo. */
export const classeDoTexto =
  "block w-full min-w-0 resize-y rounded-controle border border-borda-campo bg-folha px-3 py-2 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 transition-colors duration-150 ease-papel hover:border-tinta-2 " +
  "focus-visible:border-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco " +
  "disabled:cursor-not-allowed disabled:border-fio-2 disabled:bg-saber disabled:text-tinta-2";

// ---------------------------------------------------------------- texto de apoio

/** A frase que explica um número (13 px, tinta-2). `tom` pinta e engrossa. */
export function Frase({ children, tom, className }: { children: React.ReactNode; tom?: TomResultado; className?: string }) {
  return (
    <p className={cn("text-[13px] font-medium leading-5", tom && tom !== "NEUTRO" ? cn("font-bold", COR_DO_TOM[tom]) : "text-tinta-2", className)}>
      {children}
    </p>
  );
}

/** "Dados: Somente local" — o rodapé discreto que dizia o selo técnico antigo. */
export function OrigemDosDados({ modo, className }: { modo: string; className?: string }) {
  return <p className={cn("text-xs font-medium leading-4 text-tinta-2", className)}>Dados: {modo}</p>;
}

// ---------------------------------------------------------------- cores dos gráficos

/**
 * As cores dos gráficos destas telas, em variáveis do tema (o escuro troca
 * sozinho). Musgo = dinheiro que entra · erro (barro) = o que sai · tinta =
 * resultado · oliva = apoio. Oliva só pinta forma, nunca texto.
 *
 * 13/10/2026 (revisão da etapa 4): a entrada era o DOURADO, que dá 2,0–2,3:1
 * sobre saber/papel/folha — abaixo dos 3:1 de elemento gráfico (WCAG 1.4.11) —
 * e o ouro é só "o agora". Agora toda série de dado passa de 3:1 nos dois temas:
 * musgo 6,8:1 (claro) e 8,1:1 (escuro); tinta 12:1; erro 5,6:1; oliva 3,3:1.
 * O resultado foi para a tinta para continuar diferente da entrada.
 */
export const CORES_GRAFICO = {
  entrada: "var(--musgo)",
  saida: "var(--erro)",
  resultado: "var(--tinta)",
  apoio: "var(--oliva)",
  grade: "var(--fio)",
  eixo: "var(--fio-2)",
  texto: "var(--tinta)",
  textoSuave: "var(--tinta-2)",
  fundo: "var(--saber)",
} as const;
