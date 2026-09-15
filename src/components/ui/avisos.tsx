// AVISOS CALMOS E DIÁLOGOS ACESSÍVEIS (14/09/2026, proposta 4.8).
//
// Substitui os window.alert / window.confirm / window.prompt nativos por:
//  · toast(): um aviso discreto no canto, que some sozinho e pode ter "Desfazer";
//  · confirmar(): um diálogo com foco gerenciado, Esc fecha, Enter confirma;
//  · perguntar(): o mesmo diálogo com um campo de texto (o antigo prompt).
// Tudo sem dependência nova: um único <Avisos /> montado no layout escuta uma
// fila global, então qualquer motor/tela chama as funções direto.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tom = "ok" | "info" | "atencao" | "erro";
type Toast = { id: number; texto: string; tom: Tom; acao?: { rotulo: string; onClick: () => void }; duracao: number };
type Dialogo = {
  id: number;
  titulo: string;
  corpo?: ReactNode;
  confirmar: string;
  cancelar: string;
  destrutivo: boolean;
  campo?: { rotulo: string; valorInicial: string; placeholder?: string; multilinha?: boolean };
  resolver: (valor: string | null) => void;
};

type Ouvinte = (estado: { toasts: Toast[]; dialogo: Dialogo | null }) => void;
let toasts: Toast[] = [];
let dialogos: Dialogo[] = [];
let sequencia = 0;
const ouvintes = new Set<Ouvinte>();
function notificar() {
  for (const ouvinte of ouvintes) ouvinte({ toasts, dialogo: dialogos[0] ?? null });
}

/** Aviso discreto no canto da tela. Devolve uma função para fechar antes da hora. */
export function toast(texto: string, opcoes: { tom?: Tom; acao?: { rotulo: string; onClick: () => void }; duracaoMs?: number } = {}) {
  const item: Toast = { id: ++sequencia, texto, tom: opcoes.tom ?? "info", acao: opcoes.acao, duracao: opcoes.duracaoMs ?? (opcoes.acao ? 6000 : 3500) };
  toasts = [...toasts.slice(-3), item];
  notificar();
  const fechar = () => {
    toasts = toasts.filter((t) => t.id !== item.id);
    notificar();
  };
  window.setTimeout(fechar, item.duracao);
  return fechar;
}

/** Diálogo de confirmação. Resolve true/false. */
export function confirmar(titulo: string, opcoes: { corpo?: ReactNode; confirmar?: string; cancelar?: string; destrutivo?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    dialogos = [
      ...dialogos,
      {
        id: ++sequencia,
        titulo,
        corpo: opcoes.corpo,
        confirmar: opcoes.confirmar ?? "Confirmar",
        cancelar: opcoes.cancelar ?? "Cancelar",
        destrutivo: Boolean(opcoes.destrutivo),
        resolver: (valor) => resolve(valor !== null),
      },
    ];
    notificar();
  });
}

/** Diálogo com um campo de texto (o antigo prompt). Resolve o texto, ou null se cancelou. */
export function perguntar(titulo: string, opcoes: { corpo?: ReactNode; rotulo?: string; valorInicial?: string; placeholder?: string; multilinha?: boolean; confirmar?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    dialogos = [
      ...dialogos,
      {
        id: ++sequencia,
        titulo,
        corpo: opcoes.corpo,
        confirmar: opcoes.confirmar ?? "Salvar",
        cancelar: "Cancelar",
        destrutivo: false,
        campo: { rotulo: opcoes.rotulo ?? "", valorInicial: opcoes.valorInicial ?? "", placeholder: opcoes.placeholder, multilinha: opcoes.multilinha },
        resolver: resolve,
      },
    ];
    notificar();
  });
}

/** Aviso simples que só precisa ser lido (o antigo alert), sem bloquear. */
// Módulos sem React (ex.: planilhaImpressao.ts) avisam por evento do window.
if (typeof window !== "undefined") {
  window.addEventListener("app-bratan:aviso", (event) => {
    const detail = (event as CustomEvent<{ texto?: string; tom?: Tom }>).detail ?? {};
    if (detail.texto) toast(detail.texto, { tom: detail.tom ?? "info", duracaoMs: 7000 });
  });
}

export function avisar(texto: string, tom: Tom = "info") {
  toast(texto, { tom, duracaoMs: 6000 });
}

const icone: Record<Tom, ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />,
  info: <Info className="h-4 w-4 text-brand-musgo" aria-hidden="true" />,
  atencao: <TriangleAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />,
  erro: <TriangleAlert className="h-4 w-4 text-red-700" aria-hidden="true" />,
};

export function Avisos() {
  const [estado, setEstado] = useState<{ toasts: Toast[]; dialogo: Dialogo | null }>({ toasts: [], dialogo: null });
  useEffect(() => {
    ouvintes.add(setEstado);
    setEstado({ toasts, dialogo: dialogos[0] ?? null });
    return () => {
      ouvintes.delete(setEstado);
    };
  }, []);
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6" aria-live="polite" aria-atomic="false">
        {estado.toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border bg-white/95 px-3 py-2 text-sm text-brand-tinta shadow-calm backdrop-blur",
              t.tom === "erro" ? "border-red-200" : t.tom === "atencao" ? "border-amber-300" : t.tom === "ok" ? "border-emerald-200" : "border-brand-oliva/25",
            )}
            role="status"
          >
            {icone[t.tom]}
            <span className="flex-1">{t.texto}</span>
            {t.acao ? (
              <button
                type="button"
                className="rounded-md border border-brand-oliva/30 px-2 py-0.5 text-xs font-semibold text-brand-musgo hover:bg-brand-creme/60"
                onClick={() => {
                  t.acao?.onClick();
                  toasts = toasts.filter((x) => x.id !== t.id);
                  notificar();
                }}
              >
                {t.acao.rotulo}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Fechar aviso"
              className="rounded p-0.5 text-muted-foreground hover:text-brand-tinta"
              onClick={() => {
                toasts = toasts.filter((x) => x.id !== t.id);
                notificar();
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      {estado.dialogo ? <Dialogo dialogo={estado.dialogo} /> : null}
    </>
  );
}

function Dialogo({ dialogo }: { dialogo: Dialogo }) {
  const [valor, setValor] = useState(dialogo.campo?.valorInicial ?? "");
  const primeiroRef = useRef<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>(null);
  const anteriorRef = useRef<Element | null>(null);

  function fechar(resultado: string | null) {
    dialogos = dialogos.filter((d) => d.id !== dialogo.id);
    dialogo.resolver(resultado);
    notificar();
  }

  useEffect(() => {
    anteriorRef.current = document.activeElement;
    primeiroRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        fechar(null);
      }
      if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        fechar(dialogo.campo ? valor : "ok");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      (anteriorRef.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogo.id, valor]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-brand-tinta/40 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) fechar(null); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={`dialogo-${dialogo.id}`} className="w-full max-w-md rounded-xl border border-brand-oliva/25 bg-brand-papel p-5 shadow-calm">
        <h2 id={`dialogo-${dialogo.id}`} className="text-lg font-bold text-brand-musgo">
          {dialogo.titulo}
        </h2>
        {dialogo.corpo ? <div className="mt-2 text-sm text-brand-tinta">{dialogo.corpo}</div> : null}
        {dialogo.campo ? (
          <label className="mt-3 block text-xs font-semibold text-brand-oliva">
            {dialogo.campo.rotulo}
            {dialogo.campo.multilinha ? (
              <textarea
                ref={primeiroRef as React.RefObject<HTMLTextAreaElement>}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={dialogo.campo.placeholder}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-white px-3 py-2 text-sm font-normal text-brand-tinta"
              />
            ) : (
              <input
                ref={primeiroRef as React.RefObject<HTMLInputElement>}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={dialogo.campo.placeholder}
                className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm font-normal text-brand-tinta"
              />
            )}
          </label>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => fechar(null)} className="inline-flex h-9 items-center rounded-md border border-brand-oliva/40 bg-white px-3 text-sm font-semibold text-brand-tinta">
            {dialogo.cancelar}
          </button>
          <button
            ref={dialogo.campo ? undefined : (primeiroRef as React.RefObject<HTMLButtonElement>)}
            type="button"
            onClick={() => fechar(dialogo.campo ? valor : "ok")}
            className={cn("inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold text-white", dialogo.destrutivo ? "bg-red-700 hover:bg-red-800" : "bg-brand-musgo hover:bg-brand-musgo/90")}
          >
            {dialogo.confirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
