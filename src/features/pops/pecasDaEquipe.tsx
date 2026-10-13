// PEÇAS DAS TELAS DA EQUIPE — Papel & Musgo, etapa 4 (08/10/2026).
//
// O que POPs & Fluxos, Mural, Almoço, Estalecas e Meu perfil repetem, já na
// forma aprovada (guia, seções 08 e 10): a rubrica em caixa alta, o título de
// seção, o estado vazio que ensina, o avatar no arco do brasão e a situação
// escrita com ícone (a cor nunca fala sozinha). Os campos de formulário, o
// recado em faixa e a leitura-filtro vêm das peças de Compras
// (@/features/compras/pecas), como o Estoque já faz — um campo só no app.
// Mora aqui, na pasta dos POPs, porque POPs é o primeiro item da Equipe.
import * as React from "react";
import { useAvatarSrc } from "@/features/perfil/avatarStore";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- textos

/** Rubrica: 12/700, caixa alta, tinta 2 (o "sobrenome" de um bloco). */
export function Rubrica({
  as: Elemento = "h2",
  id,
  className,
  children,
}: {
  as?: "h2" | "h3" | "p" | "span";
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Elemento id={id} className={cn("font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2", className)}>
      {children}
    </Elemento>
  );
}

/** Título de seção (16/700) com a contagem ao lado, em tinta 2. */
export function TituloDaSecao({
  id,
  children,
  contagem,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  contagem?: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 id={id} className={cn("flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 font-sans", className)}>
      <span className="text-base font-bold leading-6 text-tinta">{children}</span>
      {contagem !== undefined && contagem !== null ? (
        <span className="text-sm font-semibold leading-6 tabular-nums text-tinta-2">{contagem}</span>
      ) : null}
    </h2>
  );
}

// ---------------------------------------------------------------- estado vazio

/**
 * Tela vazia que ensina (guia, "O resto do vocabulário"): o ícone no arco, o que
 * está acontecendo, o que fazer e, quando cabe, a ação.
 */
export function EstadoVazio({
  icone,
  titulo,
  children,
  acao,
  className,
}: {
  icone: React.ReactNode;
  titulo: React.ReactNode;
  children?: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center font-sans max-md:px-4 max-md:py-8", className)}>
      <span
        aria-hidden="true"
        className="mb-1 inline-grid h-14 w-12 place-items-center rounded-t-[24px] rounded-b-bloco border border-fio-2 text-musgo shadow-[inset_0_0_0_4px_rgb(var(--folha-rgb)),inset_0_0_0_5px_rgb(var(--fio-rgb))] [&>svg]:h-5 [&>svg]:w-5"
      >
        {icone}
      </span>
      <p className="text-base font-bold leading-6 text-tinta [text-wrap:balance]">{titulo}</p>
      {children ? <p className="max-w-[52ch] text-sm font-medium leading-6 text-tinta-2 [text-wrap:pretty]">{children}</p> : null}
      {acao ? <div className="mt-1">{acao}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- situação

export type TomDaSituacao = "ok" | "neutro" | "atencao" | "erro" | "agora";

const TOM_DA_SITUACAO: Record<TomDaSituacao, string> = {
  ok: "text-ok",
  neutro: "text-tinta-2",
  atencao: "text-atencao",
  erro: "text-erro",
  // O ouro marca o agora (o "No almoço" de quem está em pausa neste minuto).
  agora: "text-ouro",
};

/** Situação curta: ícone + palavra, na cor da situação. Nunca a cor sozinha. */
export function Situacao({
  tom,
  icone,
  children,
  className,
}: {
  tom: TomDaSituacao;
  icone?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap font-sans text-[13px] font-bold leading-5 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
        TOM_DA_SITUACAO[tom],
        className,
      )}
    >
      {icone}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- avatar no arco

/** Iniciais: a primeira letra do primeiro e do último nome ("Lucas Daniel" → "LD"). */
export function iniciaisDoNome(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return `${primeira}${ultima}`.toUpperCase() || "IB";
}

const TAMANHO_DO_ARCO = {
  // 32 · menu, linha (guia, "O arco do brasão")
  linha: "h-9 w-8 rounded-t-2xl rounded-b-controle text-xs",
  // 48 · perfil
  perfil: "h-[54px] w-12 rounded-t-3xl rounded-b-controle text-base",
} as const;

/**
 * O avatar no arco do brasão: a foto (deste aparelho ou a publicada para a
 * equipe) ou as iniciais em creme sobre musgo. Decorativo — o nome sempre vem
 * escrito ao lado.
 */
export function AvatarEmArco({
  pessoaId,
  nome,
  tamanho = "linha",
  className,
}: {
  pessoaId: string | null | undefined;
  nome: string;
  tamanho?: keyof typeof TAMANHO_DO_ARCO;
  className?: string;
}) {
  const src = useAvatarSrc(pessoaId);
  const [falhou, setFalhou] = React.useState(false);
  React.useEffect(() => setFalhou(false), [src]);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden bg-musgo font-sans font-extrabold leading-none tracking-[0.04em] text-creme dark:text-sobre-musgo",
        TAMANHO_DO_ARCO[tamanho],
        className,
      )}
    >
      {src && !falhou ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFalhou(true)} />
      ) : (
        iniciaisDoNome(nome)
      )}
    </span>
  );
}

// ---------------------------------------------------------------- faixa das leituras

/** A linha das leituras-filtro: quebra no computador, rola de lado no celular. */
export const FAIXA_DAS_LEITURAS =
  "flex flex-wrap items-center gap-x-4 gap-y-1 max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden";
