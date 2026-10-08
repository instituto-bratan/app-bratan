// AS PEÇAS DO COMERCIAL NO PAPEL & MUSGO (08/10/2026, redesenho etapa 3).
//
// O Lucas aprovou a imagem 04 (Comercial · Kanban) em 08/10. As telas do
// Comercial (Kanban e o fechamento, Cadências e Planilha, Minhas tarefas,
// Indicações, Gestão de vendas, Check-in) e o Marketing usavam o Input, o
// Badge e o Button antigos — vidro, branco translúcido, cantos de 12 px — e
// ~1.400 classes com opacidade que hoje não geram CSS. Aqui ficam as peças
// pequenas que essas telas repetem, já nos tokens novos (fio, saber, folha,
// musgo, atenção, erro, ok), para cada tela não reinventar um campo ou um
// cartão. O que cada tela FAZ não muda: são só a forma e a cor.
//
// Regras do guia que moram aqui: letra mínima de 12 px; oliva e dourado nunca
// como cor de texto; números com tabular-nums; nada de vidro, blur, degradê ou
// sombra pesada (sombra só no que flutua: janela, gaveta, menu).
import * as React from "react";
import { createPortal } from "react-dom";
import { Slot } from "@radix-ui/react-slot";
import { botaoClasses, type TamanhoBotao, type VarianteBotao } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- campos

/** Campo de texto/seleção do guia: 40 px, folha, contorno de campo (3:1), foco em anel musgo. */
export const CAMPO =
  "h-10 w-full min-w-0 rounded-controle border border-borda-campo bg-folha px-3 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 hover:border-tinta-2 focus-visible:border-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco " +
  "disabled:cursor-not-allowed disabled:border-fio-2 disabled:bg-saber disabled:text-tinta-2 max-md:text-base";

/** O mesmo campo, baixo (32 px), para dentro de cartão e de linha de tabela. */
export const CAMPO_PQ = CAMPO.replace("h-10 ", "h-8 ").replace("px-3 ", "px-2 ").replace(" max-md:text-base", "") + " text-[13px]";

/** Área de texto com a cara do campo. */
export const CAMPO_AREA = CAMPO.replace("h-10 ", "min-h-[88px] ") + " py-2";

export const Campo = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { pequeno?: boolean }>(function Campo(
  { className, pequeno, ...resto },
  ref,
) {
  return <input ref={ref} className={cn(pequeno ? CAMPO_PQ : CAMPO, className)} {...resto} />;
});

export const CampoSelecao = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { pequeno?: boolean }>(
  function CampoSelecao({ className, pequeno, ...resto }, ref) {
    return <select ref={ref} className={cn(pequeno ? CAMPO_PQ : CAMPO, "cursor-pointer pr-8", className)} {...resto} />;
  },
);

export const CampoArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function CampoArea(
  { className, ...resto },
  ref,
) {
  return <textarea ref={ref} className={cn(CAMPO_AREA, "resize-y", className)} {...resto} />;
});

/** Rótulo do campo: Manrope 13/700 em tinta. O espaço até o campo é do campo (mt-2). */
export const ROTULO = "font-sans text-[13px] font-bold leading-5 text-tinta";

export function Rotulo({ className, ...resto }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn(ROTULO, className)} {...resto} />;
}

/** A rubrica: caixa alta, 12 px, tinta 2 (o "sobrenome" de um bloco). */
export const RUBRICA = "font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2";

// ---------------------------------------------------------------- etiquetas

export type TomEtiqueta = "neutro" | "musgo" | "ouro" | "atencao" | "erro" | "ok";

const TONS_ETIQUETA: Record<TomEtiqueta, string> = {
  neutro: "bg-saber text-tinta-2",
  musgo: "bg-musgo-claro text-musgo",
  ouro: "bg-ouro-claro text-ouro",
  atencao: "bg-atencao-claro text-atencao",
  erro: "bg-erro-claro text-erro",
  ok: "bg-ok-claro text-ok",
};

/** Etiqueta curta (20 px, raio 6, Manrope 12/700). A cor nunca fala sozinha: sempre com a palavra. */
export function Etiqueta({ tom = "neutro", className, ...resto }: React.HTMLAttributes<HTMLSpanElement> & { tom?: TomEtiqueta }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-controle px-2 font-sans text-xs font-bold leading-5 tabular-nums",
        TONS_ETIQUETA[tom],
        className,
      )}
      {...resto}
    />
  );
}

// ---------------------------------------------------------------- avisos

export type TomAviso = "info" | "atencao" | "erro" | "ok";

const TONS_AVISO: Record<TomAviso, string> = {
  info: "bg-saber text-tinta",
  atencao: "bg-atencao-claro text-atencao",
  erro: "bg-erro-claro text-erro",
  ok: "bg-ok-claro text-ok",
};

/** Faixa de recado na tela (sem borda, sem sombra): o fundo de situação já diz o tom. */
export function Aviso({ tom = "info", icone, className, children, ...resto }: React.HTMLAttributes<HTMLDivElement> & { tom?: TomAviso; icone?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-bloco px-4 py-3 font-sans text-sm font-semibold leading-5", TONS_AVISO[tom], className)} {...resto}>
      {icone ? <span className="mt-0.5 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icone}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- avatar

/** O arco do brasão, pequeno (20×24): a inicial de quem responde pelo cartão. */
export function AvatarMini({ nome, className }: { nome: string; className?: string }) {
  const inicial = (nome.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      role="img"
      aria-label={nome}
      title={nome}
      className={cn(
        "inline-grid h-6 w-5 shrink-0 place-items-center rounded-t-[10px] rounded-b-controle bg-musgo-claro-2 font-sans text-xs font-extrabold leading-none text-musgo",
        className,
      )}
    >
      {inicial}
    </span>
  );
}

// ---------------------------------------------------------------- leituras

/** Leitura = filtro em texto, com número (Todos 10 · Para hoje 5 · Atrasado 1). */
export function Leitura({
  ativa,
  numero,
  tom,
  className,
  children,
  ...resto
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { ativa: boolean; numero?: number | string; tom?: "atencao" | "erro" }) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-controle border px-3 font-sans text-[13px] font-semibold leading-none transition-colors duration-150 ease-papel",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
        ativa ? "border-musgo bg-folha text-tinta shadow-[inset_0_0_0_1px_rgb(var(--musgo-rgb))]" : "border-fio-2 bg-transparent text-tinta-2 hover:border-borda-campo hover:text-tinta",
        className,
      )}
      {...resto}
    >
      {children}
      {numero !== undefined ? (
        <span className={cn("font-extrabold tabular-nums", tom === "atencao" ? "text-atencao" : tom === "erro" ? "text-erro" : "text-tinta")}>{numero}</span>
      ) : null}
    </button>
  );
}

/** Grupo de abas pequenas dentro de um bloco (Quadro · Planilha). Mesma forma das leituras, sem número obrigatório. */
export function GrupoDeLeituras({ rotulo, className, children }: { rotulo: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={rotulo} className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- números para saber

export type Indicador = {
  /** Rubrica curta (caixa alta): "Para hoje", "Vouchers pagos". */
  rotulo: string;
  /** O número (já formatado): Fraunces, algarismos alinhados. */
  valor: React.ReactNode;
  /** A frase que explica o número — número nunca fica sozinho. */
  frase?: React.ReactNode;
  /** Pinta o número quando ele pede atenção (atrasou, falta). A frase diz o porquê. */
  tom?: "atencao" | "erro" | "ok";
};

const COLUNAS_DOS_INDICADORES: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};

/**
 * A faixa de números "para saber" (08/10/2026): um bloco saber, sem borda, com
 * cada número em Fraunces e a frase embaixo. Substitui os cartõezinhos com
 * borda e ícone (o "três cartões iguais" que o júri reprovou) de Minhas
 * tarefas, Indicações e Check-in.
 */
export function Indicadores({
  itens,
  rotulo,
  titulo,
  colunas: colunasPedidas,
  className,
  children,
}: {
  itens: Indicador[];
  rotulo: string;
  titulo?: React.ReactNode;
  /** Quantas colunas no computador (padrão: uma por número, até 5). */
  colunas?: 2 | 3 | 4 | 5;
  className?: string;
  /** O que vem depois dos números, dentro do mesmo bloco (a frase da meta, o texto para copiar). */
  children?: React.ReactNode;
}) {
  const colunas = COLUNAS_DOS_INDICADORES[colunasPedidas ?? Math.min(Math.max(itens.length, 2), 5)];
  return (
    <section aria-label={rotulo} className={cn("rounded-bloco bg-saber p-6 font-sans text-tinta max-md:p-4", className)}>
      {titulo ? <h2 className="mb-4 text-sm font-medium leading-5 text-tinta-2 [&_strong]:font-bold [&_strong]:text-tinta">{titulo}</h2> : null}
      <dl className={cn("grid grid-cols-2 gap-x-8 gap-y-6 max-md:gap-x-4", colunas)}>
        {itens.map((item) => (
          <div key={item.rotulo} className="flex min-w-0 flex-col">
            <dt className="order-1 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">{item.rotulo}</dt>
            <dd
              className={cn(
                "order-2 mt-2 whitespace-nowrap font-serifa text-[32px] font-normal leading-10 tracking-[-0.01em] [font-variant-numeric:lining-nums_tabular-nums] max-md:text-[28px] max-md:leading-9",
                item.tom === "atencao" ? "text-atencao" : item.tom === "erro" ? "text-erro" : item.tom === "ok" ? "text-ok" : "text-tinta",
              )}
            >
              {item.valor}
            </dd>
            {item.frase ? <dd className="order-3 mt-1 text-[13px] font-medium leading-5 text-tinta-2">{item.frase}</dd> : null}
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- quadro (kanban)

/**
 * Coluna do quadro: o cabeçalho é texto (passo + canal; quantos e quanto),
 * com um traço firme embaixo — sem faixa musgo cheia. A coluna "para saber"
 * (Encerrados, Fechou) é uma zona saber, sem borda.
 */
export function ColunaDoQuadro({
  titulo,
  icone,
  canal,
  esquerda,
  direita,
  saber = false,
  acima,
  rodape,
  className,
  children,
  rotulo,
}: {
  titulo: React.ReactNode;
  icone?: React.ReactNode;
  /** Texto depois do título (canal do passo: "WhatsApp", "Ligação"). */
  canal?: React.ReactNode;
  /** Linha de baixo do cabeçalho, à esquerda ("3 pacientes"). */
  esquerda?: React.ReactNode;
  /** Linha de baixo do cabeçalho, à direita ("→ D5", "R$ 22.394"). */
  direita?: React.ReactNode;
  saber?: boolean;
  /** Algo entre o cabeçalho e os cartões (o botão "Avançar os parados"). */
  acima?: React.ReactNode;
  rodape?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  rotulo?: string;
}) {
  return (
    <section
      aria-label={rotulo}
      className={cn("flex h-full min-h-0 w-full min-w-0 flex-col", saber ? "rounded-bloco bg-saber" : "", className)}
    >
      <header className="grid shrink-0 gap-1 border-b-2 border-fio-2 p-3">
        <p className="flex min-w-0 items-center gap-2">
          {icone ? <span className="shrink-0 text-oliva [&>svg]:h-4 [&>svg]:w-4">{icone}</span> : null}
          <b className="min-w-0 truncate font-sans text-base font-extrabold leading-6 text-tinta">{titulo}</b>
          {canal ? <span className="inline-flex min-w-0 items-center gap-1 truncate font-sans text-sm font-semibold leading-5 text-tinta-2">{canal}</span> : null}
        </p>
        {esquerda || direita ? (
          <p className="flex items-baseline justify-between gap-2 font-sans text-[13px] font-medium leading-5 text-tinta-2">
            <span className="min-w-0 truncate">{esquerda}</span>
            {direita ? <span className="shrink-0 font-bold tabular-nums text-tinta">{direita}</span> : null}
          </p>
        ) : null}
      </header>
      {acima ? <div className="shrink-0 px-0 pt-3">{acima}</div> : null}
      <div className={cn("kanban-column-scroll grid min-h-0 flex-1 auto-rows-min content-start overflow-y-auto", saber ? "gap-0" : "gap-2 pr-0.5 pt-3")}>
        {children}
      </div>
      {rodape ? <div className="mx-3 mt-auto shrink-0 border-t border-fio-2 pb-4 pt-3">{rodape}</div> : null}
    </section>
  );
}

/**
 * Largura das colunas do quadro, pela densidade escolhida (08/10/2026). As
 * colunas são fluidas (`1fr`): no Executivo, o padrão, os 4 passos + Encerrados
 * de uma cadência cabem lado a lado em 1440, como na imagem 04; o Compacto
 * aperta para caber mais colunas; o Confortável alarga. Passando da tela, o
 * quadro rola de lado, como todo kanban.
 */
export const LARGURA_DA_COLUNA = {
  compact: "auto-cols-[minmax(184px,1fr)]",
  comfortable: "auto-cols-[minmax(248px,1fr)]",
  executive: "auto-cols-[minmax(204px,1fr)]",
} as const;

/** O Plano de Acompanhamento tem 10 colunas e cartões mais altos: a coluna é mais larga. */
export const LARGURA_DA_COLUNA_DO_PLANO = {
  compact: "auto-cols-[minmax(232px,1fr)]",
  comfortable: "auto-cols-[minmax(288px,1fr)]",
  executive: "auto-cols-[minmax(264px,1fr)]",
} as const;

/** Cartão do quadro: folha pequena com contorno de 1 px desenhado por dentro (não é sombra). */
export function CartaoDoQuadro({
  tom = "normal",
  className,
  ...resto
}: React.HTMLAttributes<HTMLElement> & { tom?: "normal" | "atrasado" | "hoje" | "encerrado" }) {
  // 08/10/2026: o `children` vai junto no `resto` — tirá-lo daqui deixava o cartão vazio.
  return (
    <article
      className={cn(
        "grid gap-2 rounded-bloco bg-folha p-3 font-sans transition-shadow duration-150 ease-papel",
        tom === "atrasado"
          ? "shadow-[inset_0_0_0_1px_rgb(var(--atencao-rgb)/0.45)]"
          : "shadow-[inset_0_0_0_1px_rgb(var(--fio-rgb))] hover:shadow-[inset_0_0_0_1px_rgb(var(--fio-2-rgb))]",
        tom === "encerrado" && "bg-transparent shadow-none hover:shadow-none",
        className,
      )}
      {...resto}
    />
  );
}

/** Linha "para saber" dentro da coluna saber (Encerrados): sem cartão, com fio entre elas. */
export function LinhaDoSaber({ className, ...resto }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-1 p-3 font-sans [&+&]:border-t [&+&]:border-fio", className)} {...resto} />;
}

/** "Nenhum paciente neste passo" — sem moldura tracejada, só a frase. */
export function VazioDaColuna({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("px-3 py-4 text-center font-sans text-[13px] font-medium leading-5 text-tinta-2", className)}>{children}</p>;
}

/**
 * A trilha dos passos do cartão: um traço por passo — cheio = feito, vazado =
 * é a vez, apagado = ainda não chegou. A mesma linguagem das marcas do selo.
 */
export function TrilhaDePassos({
  passos,
  className,
}: {
  passos: { rotulo: string; estado: "feito" | "vez" | "falta" }[];
  className?: string;
}) {
  const feitos = passos.filter((passo) => passo.estado === "feito").length;
  const vez = passos.find((passo) => passo.estado === "vez");
  return (
    <span
      role="img"
      aria-label={`${feitos} de ${passos.length} passos feitos${vez ? `; agora: ${vez.rotulo}` : ""}`}
      title={passos.map((passo) => `${passo.rotulo}: ${passo.estado === "feito" ? "feito" : passo.estado === "vez" ? "é a vez" : "falta"}`).join(" · ")}
      className={cn("inline-flex items-center gap-0.5 text-musgo", className)}
    >
      {passos.map((passo, i) => (
        <span
          key={`${passo.rotulo}-${i}`}
          aria-hidden="true"
          className={cn(
            "block h-3 w-[5px] rounded-[1px]",
            passo.estado === "feito" ? "bg-current" : passo.estado === "vez" ? "bg-transparent shadow-[inset_0_0_0_1.5px_currentColor]" : "bg-fio-2",
          )}
        />
      ))}
    </span>
  );
}

/** Botão quadrado de 32 px com o canal (WhatsApp, ligação). É navegação: abre fora do app. */
export const BOTAO_CANAL =
  "inline-grid h-8 w-8 shrink-0 place-items-center rounded-controle border border-fio-2 bg-folha text-tinta-2 transition-colors duration-150 ease-papel " +
  "hover:border-borda-campo hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco [&>svg]:h-4 [&>svg]:w-4";

/** Nome do paciente como link para a ficha (sublinha ao passar o mouse). */
export const NOME_LINK =
  "min-w-0 truncate rounded-sm font-sans text-sm font-bold leading-5 text-tinta underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";

// ---------------------------------------------------------------- tabela

/** Cabeçalho de tabela do guia: 12/700 caixa alta, fio firme embaixo. */
export const TH = "h-10 whitespace-nowrap border-b border-fio-2 px-3 text-left align-middle font-sans text-xs font-bold uppercase leading-4 tracking-[0.06em] text-tinta-2";
/** Célula de tabela do guia: 14/500, fio leve embaixo. */
export const TD = "border-b border-fio px-3 py-2 align-middle font-sans text-sm font-medium leading-5 text-tinta";

// ---------------------------------------------------------------- janelas

/**
 * Janela, gaveta e tela cheia moram NO CORPO da página (08/10/2026). O conteúdo
 * da casca é um contexto de empilhamento próprio (z-10) e o topo fica acima dele
 * (z-30): uma gaveta desenhada dentro da tela ficava com o título escondido
 * atrás do topo. Levada para o <body>, ela cobre tudo, como deve.
 */
export function NoCorpo({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}


/** O véu atrás de janela e gaveta: cor chapada, sem blur. */
export const VEU = "bg-[var(--veu)]";
/** A janela (modal): folha, raio 16, a sombra de quem flutua. */
export const JANELA = "rounded-painel border border-fio bg-folha text-tinta shadow-flutua";
/** Título de janela e de bloco: Manrope 20/700 (Fraunces fica só no título da página). */
export const TITULO_JANELA = "font-sans text-xl font-bold leading-7 text-tinta";
/** Título de seção dentro da página (o guia: 16/700). */
export const TITULO_SECAO = "font-sans text-base font-bold leading-6 text-tinta";

/** Escolha em forma de botão (rádio visual): Programa, Clube, Completo, Parcial… */
export function classeDaEscolha(ativa: boolean) {
  return cn(
    "rounded-controle border px-3 py-2 text-left font-sans transition-colors duration-150 ease-papel",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
    ativa ? "border-musgo bg-musgo-claro text-tinta shadow-[inset_0_0_0_1px_rgb(var(--musgo-rgb))]" : "border-fio-2 bg-folha text-tinta hover:border-borda-campo",
  );
}

/** Chip de escolha pequeno (produtos da tabela, tipo do item). */
export function classeDoChip(ativo: boolean) {
  return cn(
    "inline-flex min-h-8 items-center rounded-controle border px-2.5 py-1 text-left font-sans text-[13px] font-semibold leading-5 transition-colors duration-150 ease-papel",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
    ativo ? "border-musgo bg-musgo-claro text-musgo" : "border-fio-2 bg-folha text-tinta hover:border-borda-campo",
  );
}

// ---------------------------------------------------------------- ponte das peças antigas
//
// As telas do Comercial têm ~600 botões, campos, etiquetas e cartões escritos com
// o Button/Input/Badge/Card antigos (vidro, branco translúcido, 44 px). Trocar um
// a um arriscaria mexer no que eles FAZEM (type, disabled, onClick, asChild). Esta
// ponte mantém a mesma assinatura e entrega a forma nova — o botão é o Botao da
// fundação (mesmas classes), o campo é o CAMPO acima, o cartão é a folha. Quem
// importa daqui ganha o Papel & Musgo sem mudar uma linha de comportamento.

type VarianteAntiga = "default" | "destructive" | "secondary" | "outline" | "ghost" | "link" | "subtle";
type TamanhoAntigo = "default" | "sm" | "lg" | "icon";

const VARIANTE_NOVA: Record<Exclude<VarianteAntiga, "link">, VarianteBotao> = {
  default: "primario",
  destructive: "perigo-cheio",
  secondary: "secundario",
  outline: "secundario",
  ghost: "fantasma",
  subtle: "suave",
};
const TAMANHO_NOVO: Record<TamanhoAntigo, TamanhoBotao> = { default: "padrao", sm: "pq", lg: "toque", icon: "padrao" };

/** Link em forma de texto (o antigo variant="link"): musgo, sublinha ao passar. */
const LINK_TEXTO =
  "inline-flex items-center gap-1 rounded-sm font-sans text-sm font-bold leading-5 text-musgo underline-offset-[3px] hover:underline " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-70";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: VarianteAntiga | null;
  size?: TamanhoAntigo | null;
  asChild?: boolean;
};

/** O Button de sempre, com a forma do Botao (primário musgo, secundário com contorno, fantasma…). */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, asChild = false, className, ...resto },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  const v = variant ?? "default";
  const t = size ?? "default";
  const classes = v === "link" ? LINK_TEXTO : botaoClasses({ variante: VARIANTE_NOVA[v], tamanho: TAMANHO_NOVO[t] });
  return <Comp ref={ref} className={cn(classes, t === "icon" && v !== "link" && "w-10 px-0", className)} {...resto} />;
});

type VarianteDaEtiquetaAntiga = "default" | "outline" | "gold" | "muted";
const ETIQUETA_ANTIGA: Record<VarianteDaEtiquetaAntiga, string> = {
  default: "bg-musgo text-sobre-musgo",
  outline: "border border-fio-2 bg-folha text-tinta",
  // "gold" marcava o que importa (o agora, o que falta): ouro em texto passa no AA.
  gold: "bg-ouro-claro text-ouro",
  muted: "bg-saber text-tinta-2",
};

/** O Badge de sempre, como etiqueta do guia (20–24 px, raio 6, 12/700, sem vidro). */
export function Badge({ className, variant, ...resto }: React.HTMLAttributes<HTMLDivElement> & { variant?: VarianteDaEtiquetaAntiga | null }) {
  return (
    <div
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1 rounded-controle px-2 py-0.5 font-sans text-xs font-bold leading-5",
        ETIQUETA_ANTIGA[variant ?? "default"],
        className,
      )}
      {...resto}
    />
  );
}

/** O Input de sempre, com a cara do campo do guia. */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...resto }, ref) {
  return <input ref={ref} className={cn(CAMPO, "py-2", className)} {...resto} />;
});

/** O Label de sempre: 13/700 em tinta, em bloco, com 8 px até o campo de baixo. */
export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(function Label({ className, ...resto }, ref) {
  return <label ref={ref} className={cn(ROTULO, "block pb-2", className)} {...resto} />;
});

/** O Card de sempre vira FOLHA (bloco com borda, sem sombra e sem vidro). */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function Card({ className, ...resto }, ref) {
  return <div ref={ref} className={cn("min-w-0 rounded-bloco border border-fio bg-folha font-sans text-tinta", className)} {...resto} />;
});

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardHeader({ className, ...resto }, ref) {
  return <div ref={ref} className={cn("flex min-w-0 flex-col gap-1 p-6 pb-4 max-md:p-4 max-md:pb-3", className)} {...resto} />;
});

/** Título de bloco: Manrope 16/700 (Fraunces é só do título da página). */
export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(function CardTitle({ className, ...resto }, ref) {
  return <h2 ref={ref} className={cn("min-w-0 font-sans text-base font-bold leading-6 text-tinta", className)} {...resto} />;
});

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(function CardDescription(
  { className, ...resto },
  ref,
) {
  return <p ref={ref} className={cn("min-w-0 text-sm font-medium leading-5 text-tinta-2", className)} {...resto} />;
});

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardContent({ className, ...resto }, ref) {
  return <div ref={ref} className={cn("min-w-0 p-6 pt-0 max-md:p-4 max-md:pt-0", className)} {...resto} />;
});
