// PEÇAS DE INTERFACE DO MÓDULO NUTRIÇÃO (28/09/2026).
//
// PAPEL & MUSGO (08/10/2026, redesenho etapa 4 · Pacientes): as peças daqui
// passaram a ser a fundação do app com o sotaque da Nutrição. O que cada uma
// FAZ não mudou (mesmas props, mesmos estados de salvamento, mesmo diálogo
// nativo); mudou a forma:
//  · CabecalhoDaPagina é o Cabecalho da fundação (sobrancelha, título em
//    Fraunces, a frase, ações à direita e as abas do item logo embaixo);
//  · Cartao é a FOLHA (borda fio, sem sombra e sem vidro) — ou o SABER, para o
//    que é só leitura (o Guia);
//  · Abas são as abas da fundação (fio de ouro na aberta);
//  · selos e avisos usam os tokens de situação (ok, atenção, erro), com letra
//    de 12 px no mínimo.
import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, X } from "lucide-react";
import { Abas as AbasDaFundacao, Cabecalho } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";
import type { EstadoSalvamento } from "../store/hooks";
import "../nutricao.css";

export type EstadoBolinha = "ok" | "vazio" | "anterior" | "ia" | "incerto" | "grava" | "pausa";

const ROTULO_BOLINHA: Record<EstadoBolinha, string> = {
  ok: "confirmado",
  vazio: "não informado",
  anterior: "do atendimento anterior, aguardando confirmação",
  ia: "sugestão da IA aguardando revisão",
  incerto: "trecho incerto, confira",
  grava: "gravando",
  pausa: "gravação pausada",
};

// ---------------------------------------------------------------- campos

/**
 * A caixa do campo do guia, sem altura nem respiro (cada linha da Nutrição tem
 * a sua: 28 na linha do plano, 32 no registro, 40 no formulário). Contorno de
 * campo (3:1), folha, foco em anel musgo.
 */
export const CAIXA_CAMPO =
  "rounded-controle border border-borda-campo bg-folha font-sans text-tinta placeholder:text-tinta-2 hover:border-tinta-2 " +
  "focus-visible:border-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco " +
  "disabled:cursor-not-allowed disabled:border-fio-2 disabled:bg-saber disabled:text-tinta-2";

/** Campo "invisível" (título do bloco, texto do item): só ganha contorno ao passar o mouse ou focar. */
export const CAIXA_DISCRETA =
  "rounded-controle border border-transparent bg-transparent font-sans text-tinta placeholder:text-tinta-2 hover:border-fio-2 " +
  "focus-visible:border-musgo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:cursor-not-allowed";

/** Rótulo pequeno em cima do campo: Manrope 12/700, tinta 2. */
export const ROTULO_CAMPO = "font-sans text-xs font-bold leading-4 text-tinta-2";

/** Rubrica de bloco: caixa alta, 12 px, tinta 2. */
export const RUBRICA_N = "font-sans text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2";

/** Etiqueta de situação (20 px, raio 6, 12/700). Sempre com a palavra: a cor nunca fala sozinha. */
export function Etiqueta({ tom = "neutro", children, className, title }: { tom?: "neutro" | "ok" | "atencao" | "erro" | "musgo" | "ouro"; children: ReactNode; className?: string; title?: string }) {
  const tons = {
    neutro: "bg-saber text-tinta-2",
    ok: "bg-ok-claro text-ok",
    atencao: "bg-atencao-claro text-atencao",
    erro: "bg-erro-claro text-erro",
    musgo: "bg-musgo-claro text-musgo",
    ouro: "bg-ouro-claro text-ouro",
  } as const;
  return (
    <span title={title} className={cn("inline-flex h-5 max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-controle px-2 font-sans text-xs font-bold leading-5 tabular-nums", tons[tom], className)}>
      {children}
    </span>
  );
}

export function Bolinha({ estado, className }: { estado: EstadoBolinha; className?: string }) {
  return <span className={cn("nutri-bolinha", className)} data-estado={estado} role="img" aria-label={ROTULO_BOLINHA[estado]} title={ROTULO_BOLINHA[estado]} />;
}

/** Todo conteúdo do módulo vive dentro de .nutri (tokens próprios). */
export function Modulo({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("nutri mx-auto w-full max-w-[1200px] font-sans text-tinta", className)}>{children}</div>;
}

/**
 * O cabeçalho de toda tela da Nutrição: o Cabecalho da fundação. `detalhe` vira
 * a frase (com o número explicado); as abas do item (Do dia · Pessoas ·
 * Biblioteca · Guia) chegam da casca e ficam logo abaixo.
 */
export function CabecalhoDaPagina({ sobretitulo, titulo, detalhe, acoes, rodape }: { sobretitulo?: ReactNode; titulo: ReactNode; detalhe?: ReactNode; acoes?: ReactNode; rodape?: ReactNode }) {
  return (
    <Cabecalho
      sobrancelha={sobretitulo}
      titulo={titulo}
      frase={detalhe}
      acoes={acoes}
      rodape={rodape ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-fio pt-4 font-sans text-sm font-medium leading-5 text-tinta-2">{rodape}</div> : undefined}
    />
  );
}

function horaCurta(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Salvo" só depois que o banco confirmou. Conflito e erro nunca se passam por salvo. */
export function SeloSalvamento({ estado }: { estado: EstadoSalvamento }) {
  const base = "inline-flex h-6 max-w-full items-center gap-1.5 rounded-controle px-2 font-sans text-xs font-bold leading-4";
  switch (estado.tipo) {
    case "salvando":
      return (
        <span className={cn(base, "bg-saber text-tinta-2")} role="status">
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Salvando…
        </span>
      );
    case "alterado":
      return (
        <span className={cn(base, "bg-saber text-tinta-2")} role="status">
          <span className="h-1.5 w-1.5 rounded-full bg-ouro-fio" aria-hidden="true" /> Alterações por salvar
        </span>
      );
    case "erro":
      return (
        <span className={cn(base, "bg-erro-claro text-erro")} role="alert" title={estado.mensagem}>
          <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">Não salvou: {estado.mensagem}</span>
        </span>
      );
    case "conflito":
      return (
        <span className={cn(base, "bg-atencao-claro text-atencao")} role="alert" title={estado.mensagem}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Alterado em outra aba
        </span>
      );
    default:
      return (
        <span className={cn(base, "bg-ok-claro text-ok")} role="status">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {estado.em ? `Salvo às ${horaCurta(estado.em)}` : "Salvo"}
        </span>
      );
  }
}

/** 13/10/2026: selo neutro (tinta-2, tracejado fio-2) — o ouro é só "o agora" (a aba ativa). */
export function SeloFicticio() {
  return (
    <span
      className="inline-flex h-5 items-center rounded-controle border border-dashed border-fio-2 px-1.5 font-sans text-xs font-bold leading-4 text-tinta-2"
      title="Pessoa inventada para testar o módulo"
    >
      fictícia
    </span>
  );
}

export function Carregando({ texto = "Abrindo" }: { texto?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <span className="inline-flex items-center gap-2 font-sans text-sm font-bold text-musgo" role="status">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> {texto}
      </span>
    </div>
  );
}

/** Vazio: uma zona saber com a frase, sem moldura tracejada. */
export function Vazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="rounded-bloco bg-saber px-6 py-6 text-center font-sans max-md:px-4">
      <p className="text-sm font-bold leading-5 text-tinta">{titulo}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-[13px] font-medium leading-5 text-tinta-2">{children}</div> : null}
      {acao ? <div className="mt-4 flex justify-center">{acao}</div> : null}
    </div>
  );
}

/**
 * O bloco da Nutrição. "folha" (padrão) é o que se edita ou decide: borda fio,
 * sem sombra. "saber" é só leitura (o Guia): um tom abaixo do papel, sem borda.
 */
export function Cartao({ titulo, acoes, children, className, tom = "folha" }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; tom?: "folha" | "saber" }) {
  return (
    <section className={cn("min-w-0 rounded-bloco p-5 font-sans text-tinta max-md:p-4", tom === "saber" ? "bg-saber" : "border border-fio bg-folha", className)}>
      {titulo || acoes ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo ? <h2 className="min-w-0 text-base font-bold leading-6 text-tinta">{titulo}</h2> : <span />}
          {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Texto de uma linha que cresce conforme ela escreve (o prontuário dela é uma linha por tema). */
export function LinhaQueCresce({ className, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={cn("nutri-linha-edicao", className)} {...props} />;
}

const LARGURAS = { "max-w-lg": "32rem", "max-w-2xl": "42rem", "max-w-3xl": "48rem" } as const;

/** Diálogo nativo (<dialog>): foco preso, Esc fecha, acessível sem biblioteca.
 *  A largura vai em estilo direto: o CSS global do app limita elementos
 *  arredondados a 100% com a mesma força de uma classe max-w-*.
 *  Papel & Musgo: janela em folha, raio 16, a sombra de quem flutua; o véu é
 *  cor chapada, sem blur. */
export function Dialogo({ aberto, aoFechar, titulo, children, acoes, largura = "max-w-lg" }: { aberto: boolean; aoFechar: () => void; titulo: string; children: ReactNode; acoes?: ReactNode; largura?: keyof typeof LARGURAS }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aberto && !el.open) el.showModal();
    if (!aberto && el.open) el.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      style={{ width: `min(${LARGURAS[largura]}, calc(100vw - 2rem))`, maxWidth: "none" }}
      className="nutri rounded-painel border border-fio bg-folha p-0 font-sans text-tinta shadow-flutua backdrop:bg-[var(--veu)]"
    >
      {aberto ? (
        <div className="grid gap-4 p-6 max-md:p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold leading-7 text-tinta">{titulo}</h2>
            <button
              type="button"
              onClick={aoFechar}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-3 text-sm font-medium leading-6 text-tinta">{children}</div>
          {acoes ? <div className="flex flex-wrap justify-end gap-2 border-t border-fio pt-4">{acoes}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

/** Abas dentro da tela (seções da ficha, da biblioteca, prévia × cálculo): as abas da fundação. */
export function Abas<T extends string>({ abas, atual, aoMudar, rotulo }: { abas: { id: T; rotulo: ReactNode }[]; atual: T; aoMudar: (id: T) => void; rotulo: string }) {
  return <AbasDaFundacao rotulo={rotulo} valor={atual} onMudar={(id) => aoMudar(id as T)} itens={abas.map((aba) => ({ id: aba.id, rotulo: aba.rotulo }))} />;
}

export function Interruptor({ ligado, aoMudar, rotulo, id }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 font-sans text-sm font-semibold text-tinta">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => aoMudar(!ligado)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
          ligado ? "bg-musgo" : "bg-fio-2",
        )}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-folha transition-transform duration-150 ease-papel", ligado ? "translate-x-4" : "translate-x-0.5")} />
      </button>
      <span>{rotulo}</span>
    </label>
  );
}

/** "12,5" → 12,5; vazio → null; texto que não é número → null. */
export function lerNumeroDigitado(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function exibirNumero(valor: number | null, casas?: number): string {
  if (valor === null) return "";
  const texto = casas === undefined ? String(valor) : valor.toFixed(casas);
  return texto.replace(".", ",");
}

/**
 * Campo de número com vírgula decimal: enquanto ela digita, o texto fica como
 * está ("12," continua "12,"); fora do campo, mostra o valor guardado. Sem
 * isso, "12,5" virava 125 g e o cálculo saía dez vezes maior (revisão de 28/09).
 */
export function NumeroEditavel({
  valor,
  aoMudar,
  casas,
  className,
  ...resto
}: { valor: number | null; aoMudar: (n: number | null) => void; casas?: number } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue">) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <input
      {...resto}
      inputMode="decimal"
      value={texto ?? exibirNumero(valor, casas)}
      onFocus={(e) => {
        setTexto(exibirNumero(valor));
        resto.onFocus?.(e);
      }}
      onBlur={(e) => {
        setTexto(null);
        resto.onBlur?.(e);
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        aoMudar(lerNumeroDigitado(e.target.value));
      }}
      className={className}
    />
  );
}
