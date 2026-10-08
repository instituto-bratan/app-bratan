// PEÇAS DAS TELAS "DIA" E "PAGAR" DO FINANCEIRO — redesenho Papel & Musgo,
// etapa 3 (08/10/2026).
//
// Lançar dia · Crediário · Comprovantes · Contas a pagar · Fatura do cartão ·
// Lembretes repetiam os mesmos pedaços de forma (campo, rótulo, número grande,
// faixa de aviso, filtro, cabeçalho de tabela). Eles moram aqui, só com as
// classes dos tokens novos — nada de vidro, blur, degradê ou opacidade antiga
// (border-brand-oliva/20 e bg-brand-creme/40 não geram CSS).
//
// A fundação (src/components/ui/fundacao) continua sendo a porta dos
// componentes do app inteiro; isto é o "kit" destas seis telas. Quando outra
// área precisar das mesmas peças, o lugar delas é a fundação.
import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- classes

/** Campo de formulário (input/select): 40 px, borda de campo 3:1, foco em anel musgo. */
export const CAMPO =
  "h-10 w-full min-w-0 rounded-controle border border-borda-campo bg-folha px-3 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 transition-colors duration-150 hover:border-tinta-2 " +
  "focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco " +
  "disabled:cursor-not-allowed disabled:border-fio-2 disabled:bg-saber disabled:text-tinta-2";

/** Campo baixo, para dentro de linha de tabela (categoria na célula). */
export const CAMPO_PQ =
  "h-8 min-w-0 rounded-controle border border-fio-2 bg-folha px-2 font-sans text-[13px] font-medium leading-5 text-tinta " +
  "transition-colors duration-150 hover:border-borda-campo focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco " +
  "disabled:cursor-not-allowed disabled:bg-saber disabled:text-tinta-2";

/** Área de texto: a mesma cara do campo, com altura livre. */
export const CAMPO_TEXTO =
  "min-h-[88px] w-full min-w-0 resize-y rounded-controle border border-borda-campo bg-folha px-3 py-2 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 transition-colors duration-150 hover:border-tinta-2 " +
  "focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco " +
  "disabled:cursor-not-allowed disabled:border-fio-2 disabled:bg-saber disabled:text-tinta-2";

/** Rótulo do campo (13/700). */
export const ROTULO = "text-[13px] font-bold leading-5 text-tinta";
/** Texto de ajuda embaixo do campo (13/500). */
export const AJUDA = "text-[13px] font-medium leading-5 text-tinta-2";
/** Rubrica em caixa alta (12/700, espaçada). */
export const RUBRICA = "text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2";
/** Caixa de marcar na cor da ação. */
export const MARCAR = "h-4 w-4 shrink-0 cursor-pointer accent-musgo";

/** Cabeçalho de coluna de tabela (12/700 caixa alta, fio firme embaixo). */
export const TH =
  "h-10 whitespace-nowrap border-b border-fio-2 px-4 text-left align-middle text-xs font-bold uppercase tracking-[0.06em] text-tinta-2";
/** Célula de tabela (fio leve embaixo). A altura vem da densidade (py-*). */
export const TD = "border-b border-fio px-4 align-middle";
/** Cabeçalho que gruda no alto da área que rola (sem vidro: fundo chapado). */
export const THEAD_GRUDADO = "sticky top-0 z-10 bg-folha";
/** Rodapé de totais que gruda embaixo. */
export const TFOOT_GRUDADO = "sticky bottom-0 z-10 bg-folha";

/** Cabeça de um bloco de folha: título à esquerda, ações à direita, fio embaixo. */
export const CABECA_DA_FOLHA = "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-fio px-6 py-4 max-md:px-4";

// ---------------------------------------------------------------- formatação

const FORMATO_NUMERO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** "Uma", "Duas"… até dez, para a frase do cabeçalho ("Duas contas vencem hoje"). */
export function porExtenso(n: number, genero: "f" | "m" = "f"): string {
  const femininos = ["Nenhuma", "Uma", "Duas", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];
  const masculinos = ["Nenhum", "Um", "Dois", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];
  const lista = genero === "f" ? femininos : masculinos;
  return n >= 0 && n <= 10 && Number.isInteger(n) ? lista[n] : String(n);
}

/** "1 conta" · "3 contas" (o plural simples das frases). */
export function quantos(n: number, singular: string, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "08/10" a partir de "2026-10-08". */
export function diaCurto(iso: string | null | undefined) {
  return iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

/** "sexta" a partir de "2026-10-09" (sem fuso: a data é local). */
export function diaDaSemana(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return DIAS_DA_SEMANA[new Date(ano, mes - 1, dia).getDay()] ?? "";
}

/** "outubro" a partir de "2026-10". */
export function nomeDoMes(mesRef: string) {
  return MESES[Number(mesRef.slice(5, 7)) - 1] ?? mesRef;
}

/** "Outubro" (com maiúscula, para a rubrica). */
export function nomeDoMesMaiusculo(mesRef: string) {
  const nome = nomeDoMes(mesRef);
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

// ---------------------------------------------------------------- número

export type TamanhoNumero = "grande" | "medio" | "pequeno";

const TAMANHO_NUMERO: Record<TamanhoNumero, { numero: string; moeda: string }> = {
  grande: { numero: "text-[40px] max-md:text-[32px]", moeda: "text-sm align-[0.95em]" },
  medio: { numero: "text-[32px] max-md:text-[28px]", moeda: "text-[13px] align-[0.8em]" },
  pequeno: { numero: "text-2xl", moeda: "text-xs align-[0.6em]" },
};

/**
 * O número principal em Fraunces, com o "R$" menor em Manrope, como papel
 * timbrado (guia aprovado: ".numero .moeda"). Nunca dentro de tabela.
 */
export function NumeroEmReais({
  valor,
  tamanho = "medio",
  centavos = true,
  className,
}: {
  valor: number;
  tamanho?: TamanhoNumero;
  /** Sem centavos: "76.180" (o "saber" do mês, onde o centavo só atrapalha a leitura). */
  centavos?: boolean;
  className?: string;
}) {
  const t = TAMANHO_NUMERO[tamanho];
  const negativo = valor < 0;
  const texto = centavos ? FORMATO_NUMERO.format(Math.abs(valor)) : FORMATO_INTEIRO.format(Math.round(Math.abs(valor)));
  return (
    <span className={cn("whitespace-nowrap font-serifa font-normal leading-none tracking-[-0.01em] text-tinta [font-variant-numeric:lining-nums_tabular-nums]", t.numero, className)}>
      <span className={cn("mr-1 font-sans font-bold tracking-[0.02em] text-tinta-2", t.moeda)}>{negativo ? "−R$" : "R$"}</span>
      {texto}
    </span>
  );
}

// ---------------------------------------------------------------- cartão de número

export type TomCartao = "neutro" | "atencao" | "erro" | "ok";

const TOM_DA_FRASE: Record<TomCartao, string> = {
  neutro: "text-tinta-2",
  atencao: "font-bold text-atencao",
  erro: "font-bold text-erro",
  ok: "font-bold text-ok",
};

/**
 * Cartão de número (bloco "saber"): rubrica · número em Fraunces · a frase que
 * explica o número. Com `onClick` vira botão (filtra a lista) e mostra a
 * escolha com o contorno musgo.
 */
export function CartaoNumero({
  rotulo,
  valor,
  frase,
  tom = "neutro",
  tamanho = "medio",
  onClick,
  ativo,
  children,
  className,
}: {
  rotulo: React.ReactNode;
  valor: number;
  frase?: React.ReactNode;
  tom?: TomCartao;
  tamanho?: TamanhoNumero;
  onClick?: () => void;
  ativo?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  const conteudo = (
    <>
      <span className={cn(RUBRICA, "block")}>{rotulo}</span>
      <span className="mt-3 block">
        <NumeroEmReais valor={valor} tamanho={tamanho} className={tom === "erro" ? "text-erro" : undefined} />
      </span>
      {frase ? <span className={cn("mt-2 block text-[13px] font-medium leading-5", TOM_DA_FRASE[tom])}>{frase}</span> : null}
      {children}
    </>
  );
  const base = "block min-w-0 rounded-bloco bg-saber p-5 text-left max-md:p-4";
  if (!onClick) return <div className={cn(base, className)}>{conteudo}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        base,
        "w-full transition-[box-shadow,background-color] duration-150 ease-papel hover:bg-fio/60",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
        ativo && "bg-folha shadow-[inset_0_0_0_1.5px_rgb(var(--musgo-rgb))]",
        className,
      )}
    >
      {conteudo}
    </button>
  );
}

// ---------------------------------------------------------------- etiqueta

export type TomEtiqueta = "neutro" | "atencao" | "erro" | "ok" | "ouro" | "musgo";

const TOM_ETIQUETA: Record<TomEtiqueta, string> = {
  neutro: "bg-saber text-tinta-2",
  atencao: "bg-atencao-claro text-atencao",
  erro: "bg-erro-claro text-erro",
  ok: "bg-ok-claro text-ok",
  ouro: "bg-ouro-claro text-ouro",
  musgo: "bg-musgo-claro text-musgo",
};

/** Etiqueta pequena (20 px, 12/700): "Recorrente", "CAPEX", "sem boleto anexado". */
export function Etiqueta({
  tom = "neutro",
  icone,
  children,
  className,
  title,
}: {
  tom?: TomEtiqueta;
  icone?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 w-fit max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-controle px-2 font-sans text-xs font-bold leading-5",
        TOM_ETIQUETA[tom],
        className,
      )}
    >
      {icone}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- aviso da tela

export type TomAviso = "info" | "ok" | "atencao" | "erro";

const TOM_AVISO: Record<TomAviso, { caixa: string; icone: string; Icone: typeof Info }> = {
  info: { caixa: "bg-saber", icone: "text-tinta-2", Icone: Info },
  ok: { caixa: "bg-ok-claro", icone: "text-ok", Icone: CheckCircle2 },
  atencao: { caixa: "bg-atencao-claro", icone: "text-atencao", Icone: AlertTriangle },
  erro: { caixa: "bg-erro-claro", icone: "text-erro", Icone: XCircle },
};

/**
 * A faixa de recado da tela ("Conta lançada…", "Mês fechado…"). Sem borda e sem
 * sombra; a cor do fundo diz o tom e o ícone repete (a cor nunca fala sozinha).
 */
export function AvisoDaTela({
  tom = "info",
  children,
  acao,
  onFechar,
  className,
  role,
}: {
  tom?: TomAviso;
  children: React.ReactNode;
  /** Botão à direita ("Desfazer"). */
  acao?: React.ReactNode;
  onFechar?: () => void;
  className?: string;
  role?: "status" | "alert";
}) {
  const t = TOM_AVISO[tom];
  return (
    <div
      role={role ?? (tom === "erro" ? "alert" : "status")}
      className={cn("flex items-start gap-3 rounded-bloco px-4 py-3 text-sm font-semibold leading-5 text-tinta", t.caixa, className)}
    >
      <t.Icone className={cn("mt-0.5 h-4 w-4 shrink-0", t.icone)} aria-hidden="true" />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</div>
      {acao ? <div className="shrink-0">{acao}</div> : null}
      {onFechar ? (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar aviso"
          className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-controle text-tinta-2 hover:bg-folha/70 hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- filtros (leituras)

/** Um botão de leitura/filtro (32 px, contorno; o escolhido ganha contorno musgo). */
export function Leitura({
  ativo,
  onClick,
  children,
  contagem,
  className,
  title,
  disabled,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  contagem?: number;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-controle border px-3 font-sans text-[13px] font-semibold leading-none transition-colors duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
        "disabled:cursor-not-allowed disabled:opacity-60",
        ativo
          ? "border-musgo bg-folha text-tinta shadow-[inset_0_0_0_1px_rgb(var(--musgo-rgb))]"
          : "border-fio-2 bg-transparent text-tinta-2 hover:border-borda-campo hover:text-tinta",
        className,
      )}
    >
      {children}
      {typeof contagem === "number" && contagem > 0 ? <span className="font-extrabold tabular-nums text-tinta">{contagem}</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------- campo com rótulo

/** Rótulo + campo + ajuda, empilhados com 8 px (o ".campo" do guia). */
export function Campo({
  rotulo,
  htmlFor,
  opcional,
  ajuda,
  children,
  className,
  dica,
}: {
  rotulo: React.ReactNode;
  htmlFor?: string;
  opcional?: boolean;
  ajuda?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Um InfoTip ao lado do rótulo (o jargão mora nele). */
  dica?: React.ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-2", className)}>
      <span className="flex items-center gap-1">
        <label htmlFor={htmlFor} className={ROTULO}>
          {rotulo}
          {opcional ? <span className="font-medium text-tinta-2"> (opcional)</span> : null}
        </label>
        {dica}
      </span>
      {children}
      {ajuda ? <p className={AJUDA}>{ajuda}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- título de bloco

/** O título de um bloco (16/700) com a soma ao lado ("2 contas · R$ 3.420,00"). */
export function TituloDoBloco({
  children,
  detalhe,
  id,
  as: Elemento = "h2",
  className,
  icone,
}: {
  children: React.ReactNode;
  detalhe?: React.ReactNode;
  id?: string;
  as?: "h2" | "h3";
  className?: string;
  icone?: React.ReactNode;
}) {
  return (
    <Elemento id={id} className={cn("flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 font-sans text-base font-bold leading-6 text-tinta", className)}>
      {icone ? <span className="self-center text-tinta-2">{icone}</span> : null}
      <span>{children}</span>
      {detalhe ? <span className="text-sm font-semibold tabular-nums text-tinta-2">{detalhe}</span> : null}
    </Elemento>
  );
}

// ---------------------------------------------------------------- estado vazio

/** Estado vazio: diz o que está acontecendo e ensina o passo. */
export function Vazio({ titulo, children, acao, className }: { titulo: React.ReactNode; children?: React.ReactNode; acao?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid justify-items-center gap-2 px-6 py-10 text-center", className)}>
      <p className="text-base font-bold leading-6 text-tinta">{titulo}</p>
      {children ? <p className="max-w-[46ch] text-sm font-medium leading-[22px] text-tinta-2">{children}</p> : null}
      {acao ? <div className="mt-3">{acao}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- janela

/**
 * Janela por cima da tela (painel 16 px, sombra só no que flutua, sem blur no
 * fundo). Fecha no Esc e no clique fora.
 *
 * Mora no <body> (portal) e no z-65 da casca (08/10/2026): dentro da página, o
 * celular deixava a barra de baixo POR CIMA da janela e escondia o "Confirmar".
 * 65 = o mesmo véu da busca e da gaveta; os avisos (70) e o confirmar (80)
 * continuam por cima dela.
 */
export function Janela({
  rotulo,
  onFechar,
  children,
  largura = "w-[min(36rem,94vw)]",
}: {
  rotulo: string;
  onFechar: () => void;
  children: React.ReactNode;
  largura?: string;
}) {
  React.useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[65] grid place-items-center bg-[var(--veu)] px-4 py-6" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        onClick={(evento) => evento.stopPropagation()}
        className={cn("max-h-[88dvh] overflow-y-auto rounded-painel border border-fio bg-folha p-6 font-sans text-tinta shadow-flutua max-md:p-4", largura)}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
