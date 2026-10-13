// PEÇAS DAS TELAS DE AJUSTES — redesenho Papel & Musgo, etapa 4 (08/10/2026).
//
// Colaboradores, Acessos, Configurações do negócio, Integrações, Segurança,
// Auditoria, O que a IA fez, Cofre de compliance, Portal do paciente e Gestão de
// Estalecas usavam o Card, o Badge, o Input e o LiquidButton antigos (vidro,
// branco translúcido, cantos de 12 px) e classes com opacidade nos nomes
// antigos (border-brand-oliva/20, bg-brand-creme/40) que hoje NÃO geram CSS.
// Aqui moram as peças pequenas que essas dez telas repetem, só com os tokens
// novos (fio, saber, folha, musgo, atenção, erro, ok). O que cada tela FAZ não
// muda: são a forma e a cor.
//
// Regras do guia que moram aqui: letra mínima de 12 px; oliva só em ícone (pelo
// stroke-oliva, nunca text-oliva) e dourado nunca como texto; números com
// tabular-nums; nada de vidro, blur, degradê ou sombra pesada; itens do mesmo
// tipo em lista, nunca em cartões.
import * as React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Info, XCircle } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- campos

/** Campo de texto/seleção do guia: 40 px (44 no celular), folha, contorno de campo (3:1), foco em anel musgo. */
export const CAMPO =
  "h-10 w-full min-w-0 rounded-controle border border-borda-campo bg-folha px-3 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:font-medium placeholder:text-tinta-2 transition-colors duration-150 hover:border-tinta-2 " +
  "focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco " +
  "disabled:cursor-not-allowed disabled:border-fio-2 disabled:bg-saber disabled:text-tinta-2 aria-[invalid=true]:border-erro max-md:h-11 max-md:text-base";

/** O mesmo campo, baixo (32 px), para dentro de linha de lista. */
export const CAMPO_PQ =
  "h-8 w-full min-w-0 rounded-controle border border-borda-campo bg-folha px-2 font-sans text-[13px] font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 transition-colors duration-150 hover:border-tinta-2 " +
  "focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco " +
  "disabled:cursor-not-allowed disabled:bg-saber disabled:text-tinta-2 max-md:h-10 max-md:text-base";

/** Área de texto com a cara do campo. */
export const CAMPO_AREA =
  "min-h-[88px] w-full min-w-0 resize-y rounded-controle border border-borda-campo bg-folha px-3 py-2 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 transition-colors duration-150 hover:border-tinta-2 " +
  "focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco " +
  "disabled:cursor-not-allowed disabled:bg-saber disabled:text-tinta-2 max-md:text-base";

/** Rótulo do campo (13/700, tinta). */
export const ROTULO = "font-sans text-[13px] font-bold leading-5 text-tinta";
/** Ajuda embaixo do campo (13/500, tinta 2). */
export const AJUDA = "font-sans text-[13px] font-medium leading-5 text-tinta-2";
/** Rubrica em caixa alta (12/700, espaçada): o "sobrenome" de um bloco. */
export const RUBRICA = "font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2";
/** Caixa de marcar na cor da ação. */
export const MARCAR = "h-4 w-4 shrink-0 cursor-pointer accent-musgo";
/** Linha de uma lista dentro da folha: fio leve em cima, 24 px de lado (16 no celular). */
export const LINHA = "border-t border-fio px-6 py-4 max-md:px-4";

export const CampoTexto = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { pequeno?: boolean }>(function CampoTexto(
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
  return <textarea ref={ref} className={cn(CAMPO_AREA, className)} {...resto} />;
});

/** Rótulo em cima, campo no meio, ajuda embaixo (8 px entre eles). */
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
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      {children}
      {ajuda ? <p className={AJUDA}>{ajuda}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- etiqueta e recado

export type TomEtiqueta = "neutro" | "musgo" | "ouro" | "atencao" | "erro" | "ok";

const TONS_ETIQUETA: Record<TomEtiqueta, string> = {
  neutro: "bg-saber text-tinta-2 shadow-[inset_0_0_0_1px_rgb(var(--fio-rgb))]",
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
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-controle px-2 font-sans text-xs font-bold leading-5 tabular-nums [&_svg]:h-3 [&_svg]:w-3",
        TONS_ETIQUETA[tom],
        className,
      )}
      {...resto}
    />
  );
}

export type TomRecado = "info" | "atencao" | "erro" | "ok";

const TONS_RECADO: Record<TomRecado, { fundo: string; icone: React.ReactNode }> = {
  info: { fundo: "bg-saber [&_strong]:text-tinta", icone: <Info className="h-4 w-4 text-tinta-2" aria-hidden="true" /> },
  atencao: { fundo: "bg-atencao-claro [&_strong]:text-atencao", icone: <AlertTriangle className="h-4 w-4 text-atencao" aria-hidden="true" /> },
  erro: { fundo: "bg-erro-claro [&_strong]:text-erro", icone: <XCircle className="h-4 w-4 text-erro" aria-hidden="true" /> },
  ok: { fundo: "bg-ok-claro [&_strong]:text-ok", icone: <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden="true" /> },
};

/**
 * Faixa de recado (sem borda, sem sombra): o fundo claro da situação diz o tom,
 * o ícone repete, o texto fica em tinta (lê-se nos dois temas) e o trecho em
 * <strong> ganha a cor da situação.
 */
export function Recado({
  tom = "info",
  children,
  icone,
  className,
  role,
}: {
  tom?: TomRecado;
  children: React.ReactNode;
  icone?: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const estilo = TONS_RECADO[tom];
  return (
    <div
      role={role ?? (tom === "erro" ? "alert" : "status")}
      className={cn(
        "flex items-start gap-2 rounded-bloco px-4 py-3 font-sans text-sm font-medium leading-6 text-tinta [overflow-wrap:anywhere] [&_strong]:font-bold",
        estilo.fundo,
        className,
      )}
    >
      <span className="mt-1 shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icone ?? estilo.icone}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- cabeça de bloco, leitura e seta

/** A cabeça de uma folha: título 16/700 (com o resumo em tinta 2 ao lado), ações à direita, fio embaixo. */
export function CabecaDaFolha({
  titulo,
  resumo,
  icone,
  acoes,
  id,
  className,
}: {
  titulo: React.ReactNode;
  resumo?: React.ReactNode;
  icone?: React.ReactNode;
  acoes?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 max-md:px-4", className)}>
      {/* O ícone fica preso à primeira linha do título; o resumo segue o título na
          mesma linha e, se não couber (celular), desce inteiro, sem quebrar no meio. */}
      <h2 id={id} className="flex min-w-0 items-start gap-2 font-sans text-base font-bold leading-6 text-tinta">
        {icone ? <span className="mt-1 shrink-0 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-oliva">{icone}</span> : null}
        <span className="min-w-0">
          {titulo}
          {resumo ? <span className="ml-3 inline-block whitespace-nowrap text-sm font-semibold tabular-nums text-tinta-2">{resumo}</span> : null}
        </span>
      </h2>
      {acoes ? <div className="ml-auto flex flex-wrap items-center gap-2 max-md:ml-0">{acoes}</div> : null}
    </div>
  );
}

/**
 * Título da página com a dica (?) colada na última palavra: no celular o "?"
 * não desce sozinho para uma linha própria ("Configurações do / negócio ?").
 */
export function TituloComDica({ texto, tituloDaDica, dica }: { texto: string; tituloDaDica: string; dica: React.ReactNode }) {
  const partes = texto.trim().split(" ");
  const ultima = partes.pop() ?? "";
  return (
    <>
      {partes.length ? `${partes.join(" ")} ` : null}
      <span className="whitespace-nowrap">
        {ultima}
        <InfoTip title={tituloDaDica} className="ml-2 align-middle">
          {dica}
        </InfoTip>
      </span>
    </>
  );
}

/** Título de uma folha com respiro (formulário): 16/700, com o ícone em oliva. */
export function TituloDaFolha({ children, icone, id, className }: { children: React.ReactNode; icone?: React.ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn("flex items-center gap-2 font-sans text-base font-bold leading-6 text-tinta", className)}>
      {icone ? <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-oliva" aria-hidden="true">{icone}</span> : null}
      {children}
    </h2>
  );
}

/** Título de um bloco de leitura (saber): rubrica em caixa alta, com o resumo à direita. */
export function TituloDoSaber({ children, resumo, className, id }: { children: React.ReactNode; resumo?: React.ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1", className)}>
      <h2 id={id} className={RUBRICA}>
        {children}
      </h2>
      {resumo ? <span className="font-sans text-[13px] font-semibold leading-5 tabular-nums text-tinta-2">{resumo}</span> : null}
    </div>
  );
}

/** Leitura = filtro em texto, com o número ao lado (Ativos 10 · Desligados 2). A marcada leva o traço musgo. */
export function Leitura({ ativa, rotulo, numero, onClick }: { ativa: boolean; rotulo: string; numero?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-sm font-sans text-[13px] leading-5 max-md:h-10",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
        ativa
          ? "font-bold text-tinta after:absolute after:inset-x-0 after:bottom-0.5 after:h-0.5 after:rounded-sm after:bg-musgo after:content-[''] max-md:after:bottom-1.5"
          : "font-semibold text-tinta-2 hover:text-tinta",
      )}
    >
      {rotulo}
      {numero !== undefined ? <span className="ml-1 font-extrabold tabular-nums text-tinta">{numero}</span> : null}
    </button>
  );
}

const CLASSE_DA_SETA =
  "group inline-flex items-center gap-1 whitespace-nowrap rounded-sm font-sans text-[13px] font-bold leading-5 text-musgo underline-offset-[3px] hover:underline " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:cursor-not-allowed disabled:text-tinta-2 disabled:no-underline";

/** Ação que abre um formulário no lugar, com a cara do link com seta ("Alterar a partir de uma data →"). */
export function AcaoSeta({ children, className, ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn(CLASSE_DA_SETA, className)} {...resto}>
      {children}
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-150 ease-papel group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

/** Botão de texto, sem seta (o "encerrar" da linha do incidente). */
export const BOTAO_TEXTO =
  "inline-flex items-center gap-1 rounded-sm font-sans text-[13px] font-bold leading-5 text-musgo underline underline-offset-[3px] hover:text-musgo-forte " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco";

// ---------------------------------------------------------------- número, detalhes e vazio

/** Número principal de um bloco de leitura: Fraunces, com a frase que o explica embaixo. */
export function NumeroComFrase({ rotulo, numero, frase, tom, className }: { rotulo: string; numero: React.ReactNode; frase?: React.ReactNode; tom?: "atencao" | "erro"; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className={RUBRICA}>{rotulo}</p>
      <p
        className={cn(
          "mt-2 truncate font-serifa text-[32px] font-normal leading-none tracking-[-0.01em] [font-variant-numeric:lining-nums_tabular-nums] max-md:text-[28px]",
          tom === "atencao" ? "text-atencao" : tom === "erro" ? "text-erro" : "text-tinta",
        )}
      >
        {numero}
      </p>
      {frase ? <p className="mt-2 text-[13px] font-medium leading-5 text-tinta-2">{frase}</p> : null}
    </div>
  );
}

/** Uma faixa de números num bloco de leitura, divididos por fio (nada de "três cartões iguais"); 2 × 2 no celular. */
export function FaixaDeNumeros({ children, className, rotulo }: { children: React.ReactNode; className?: string; rotulo?: string }) {
  return (
    <section
      aria-label={rotulo}
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-bloco bg-fio xl:grid-cols-4 [&>*]:bg-saber [&>*]:px-6 [&>*]:py-5 max-md:[&>*]:px-4 max-md:[&>*]:py-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** <details> do guia: resumo em 13/700 com a seta que gira; o conteúdo vem embaixo. */
export function Detalhes({ resumo, children, className }: { resumo: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <details className={cn("group/detalhes font-sans", className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-[13px] font-bold leading-5 text-tinta hover:text-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 shrink-0 text-tinta-2 transition-transform duration-150 ease-papel group-open/detalhes:rotate-180" aria-hidden="true" />
        {resumo}
      </summary>
      <div className="mt-2 text-[13px] font-medium leading-5 text-tinta-2">{children}</div>
    </details>
  );
}

/** Estado vazio que ensina: o ícone no arco do brasão, o título e uma frase. */
export function Vazio({ icone, titulo, children, acao, className }: { icone?: React.ReactNode; titulo: React.ReactNode; children?: React.ReactNode; acao?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid justify-items-center gap-2 px-6 py-10 text-center font-sans max-md:px-4 max-md:py-8", className)}>
      {icone ? (
        <span className="mb-2 grid h-14 w-11 place-items-center rounded-t-full rounded-b-bloco border border-fio-2 bg-papel [&_svg]:h-5 [&_svg]:w-5 [&_svg]:stroke-oliva" aria-hidden="true">
          {icone}
        </span>
      ) : null}
      <p className="text-base font-bold leading-6 text-tinta">{titulo}</p>
      {children ? <p className="max-w-[46ch] text-sm font-medium leading-[22px] text-tinta-2">{children}</p> : null}
      {acao ? <div className="mt-3">{acao}</div> : null}
    </div>
  );
}

/** Ícone de situação de uma linha: ok (check) ou falta (triângulo). A palavra vem ao lado. */
export function IconeDaSituacao({ ok, tom = "atencao", className }: { ok: boolean; tom?: "atencao" | "erro"; className?: string }) {
  return ok ? (
    <CheckCircle2 className={cn("h-4 w-4 shrink-0 text-ok", className)} aria-hidden="true" />
  ) : (
    <AlertTriangle className={cn("h-4 w-4 shrink-0", tom === "erro" ? "text-erro" : "text-atencao", className)} aria-hidden="true" />
  );
}

// ---------------------------------------------------------------- controle segmentado

/**
 * Controle segmentado (Acessos: Padrão · Sem acesso · Só vê · Vê e edita;
 * Estalecas: a situação do prêmio). A opção escolhida ganha o tom que a tela
 * mandar — sempre com a palavra (a cor nunca fala sozinha) e aria-pressed.
 */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  onEscolher,
  rotulo,
  tons,
  desabilitado,
  className,
}: {
  opcoes: { valor: T; rotulo: React.ReactNode; titulo?: string }[];
  valor: T | null;
  onEscolher: (valor: T) => void;
  /** Nome do grupo para o leitor de tela. */
  rotulo: string;
  /** Classe da opção escolhida, por valor (padrão: musgo claro). */
  tons?: Partial<Record<T, string>>;
  desabilitado?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className={cn("flex flex-wrap gap-1 rounded-controle bg-saber p-0.5", className)}>
      {opcoes.map((opcao) => {
        const escolhida = valor === opcao.valor;
        return (
          <button
            key={opcao.valor}
            type="button"
            aria-pressed={escolhida}
            disabled={desabilitado}
            title={opcao.titulo}
            onClick={() => onEscolher(opcao.valor)}
            className={cn(
              "inline-flex h-8 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[5px] px-2.5 font-sans text-[13px] leading-5 transition-colors duration-150 ease-papel max-md:h-10 sm:flex-none",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco disabled:cursor-not-allowed",
              escolhida
                ? cn("font-bold", tons?.[opcao.valor] ?? "bg-musgo-claro text-musgo shadow-[inset_0_0_0_1px_rgb(var(--musgo-rgb))]")
                : "font-semibold text-tinta-2 hover:bg-folha hover:text-tinta",
            )}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}
