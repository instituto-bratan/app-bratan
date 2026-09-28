// PEÇAS DE INTERFACE DO MÓDULO NUTRIÇÃO (28/09/2026).
import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, X } from "lucide-react";
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

export function Bolinha({ estado, className }: { estado: EstadoBolinha; className?: string }) {
  return <span className={cn("nutri-bolinha", className)} data-estado={estado} role="img" aria-label={ROTULO_BOLINHA[estado]} title={ROTULO_BOLINHA[estado]} />;
}

/** Todo conteúdo do módulo vive dentro de .nutri (tokens próprios). */
export function Modulo({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("nutri mx-auto w-full max-w-[1500px]", className)}>{children}</div>;
}

export function CabecalhoDaPagina({ sobretitulo, titulo, detalhe, acoes }: { sobretitulo?: ReactNode; titulo: ReactNode; detalhe?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {sobretitulo ? <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-oliva">{sobretitulo}</p> : null}
        <h1 className="mt-1 text-balance text-2xl font-semibold text-brand-musgo sm:text-3xl">{titulo}</h1>
        {detalhe ? <div className="mt-1 text-sm text-muted-foreground">{detalhe}</div> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </header>
  );
}

function horaCurta(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Salvo" só depois que o banco confirmou. Conflito e erro nunca se passam por salvo. */
export function SeloSalvamento({ estado }: { estado: EstadoSalvamento }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold";
  switch (estado.tipo) {
    case "salvando":
      return (
        <span className={cn(base, "bg-muted text-muted-foreground")} role="status">
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Salvando…
        </span>
      );
    case "alterado":
      return (
        <span className={cn(base, "bg-muted text-muted-foreground")} role="status">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-dourado" aria-hidden="true" /> Alterações por salvar
        </span>
      );
    case "erro":
      return (
        <span className={cn(base, "bg-red-50 text-red-800")} role="alert" title={estado.mensagem}>
          <CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> Não salvou: {estado.mensagem}
        </span>
      );
    case "conflito":
      return (
        <span className={cn(base, "bg-amber-50 text-amber-800")} role="alert" title={estado.mensagem}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Alterado em outra aba
        </span>
      );
    default:
      return (
        <span className={cn(base, "bg-emerald-50 text-emerald-800")} role="status">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {estado.em ? `Salvo às ${horaCurta(estado.em)}` : "Salvo"}
        </span>
      );
  }
}

export function SeloFicticio() {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-brand-dourado/70 px-2 py-0.5 text-[11px] font-semibold text-brand-dourado" title="Pessoa inventada para testar o módulo">
      fictícia
    </span>
  );
}

export function Carregando({ texto = "Abrindo" }: { texto?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-musgo">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> {texto}
      </span>
    </div>
  );
}

export function Vazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-brand-oliva/25 px-5 py-8 text-center">
      <p className="font-semibold text-brand-musgo">{titulo}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div> : null}
      {acao ? <div className="mt-4 flex justify-center">{acao}</div> : null}
    </div>
  );
}

export function Cartao({ titulo, acoes, children, className }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-brand-oliva/14 bg-white/70 p-4 shadow-sm backdrop-blur-xl sm:p-5", className)}>
      {titulo || acoes ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo ? <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-brand-oliva">{titulo}</h2> : <span />}
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
 *  arredondados a 100% com a mesma força de uma classe max-w-*. */
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
      className="nutri rounded-2xl border border-brand-oliva/20 bg-brand-papel p-0 text-brand-tinta shadow-ios backdrop:bg-brand-tinta/30 backdrop:backdrop-blur-sm"
    >
      {aberto ? (
        <div className="grid gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-brand-musgo">{titulo}</h2>
            <button type="button" onClick={aoFechar} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-3 text-sm">{children}</div>
          {acoes ? <div className="flex flex-wrap justify-end gap-2">{acoes}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function Abas<T extends string>({ abas, atual, aoMudar, rotulo }: { abas: { id: T; rotulo: ReactNode }[]; atual: T; aoMudar: (id: T) => void; rotulo: string }) {
  return (
    <div role="tablist" aria-label={rotulo} className="inline-flex flex-wrap gap-1 rounded-xl border border-brand-oliva/14 bg-card/60 p-1">
      {abas.map((aba) => (
        <button
          key={aba.id}
          type="button"
          role="tab"
          aria-selected={aba.id === atual}
          onClick={() => aoMudar(aba.id)}
          onKeyDown={(e) => {
            const i = abas.findIndex((a) => a.id === atual);
            if (e.key === "ArrowRight") aoMudar(abas[(i + 1) % abas.length].id);
            if (e.key === "ArrowLeft") aoMudar(abas[(i - 1 + abas.length) % abas.length].id);
          }}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
            aba.id === atual ? "bg-brand-musgo text-brand-papel shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-brand-musgo",
          )}
        >
          {aba.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Interruptor({ ligado, aoMudar, rotulo, id }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => aoMudar(!ligado)}
        className={cn("relative h-5 w-9 rounded-full transition-colors", ligado ? "bg-brand-oliva" : "bg-muted")}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", ligado ? "translate-x-4" : "translate-x-0.5")} />
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
