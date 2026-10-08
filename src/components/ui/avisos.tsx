// AVISOS CALMOS E DIÁLOGOS ACESSÍVEIS (14/09/2026, proposta 4.8).
//
// Substitui os window.alert / window.confirm / window.prompt nativos por:
//  · toast(): um aviso discreto no canto, que some sozinho e pode ter "Desfazer";
//  · confirmar(): um diálogo com foco gerenciado, Esc fecha, Enter confirma;
//  · perguntar(): o mesmo diálogo com um campo de texto (o antigo prompt).
// Tudo sem dependência nova: um único <Avisos /> montado no layout escuta uma
// fila global, então qualquer motor/tela chama as funções direto.
//
// NO CORPO DA PÁGINA (revisão de 08/10/2026): o <Avisos /> mora dentro da casca,
// que é um contexto de empilhamento próprio (`isolate`). As gavetas, janelas e a
// tela cheia do Comercial vão para o <body> (NoCorpo, z 70–75) — e a confirmação
// "Excluir … de vez?" ficava ATRÁS da gaveta, sem dar para clicar. Agora os
// avisos e o diálogo também vão para o <body>, em z 90, acima de qualquer
// gaveta; e saem da regra da casca do celular que limitava a largura de
// `.rounded-xl`. Forma Papel & Musgo: folha com fio, véu chapado, sem vidro.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { botaoClasses } from "./botao";

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
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />,
  info: <Info className="h-4 w-4 shrink-0 text-musgo" aria-hidden="true" />,
  atencao: <TriangleAlert className="h-4 w-4 shrink-0 text-atencao" aria-hidden="true" />,
  erro: <TriangleAlert className="h-4 w-4 shrink-0 text-erro" aria-hidden="true" />,
};

/** A borda do aviso diz o tom junto com o ícone (nunca só a cor). */
const bordaDoTom: Record<Tom, string> = {
  ok: "border-ok/40",
  info: "border-fio-2",
  atencao: "border-atencao/50",
  erro: "border-erro/50",
};

/** No corpo da página, fora da casca (ver o topo do arquivo). */
function NoCorpoDaPagina({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

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
    <NoCorpoDaPagina>
      {/* Revisão de 08/10/2026: abaixo de 768 px a barra de baixo do celular (64 px,
          mais a área segura) está na tela; o aviso fica ACIMA dela. Antes, de 640 a
          767 px ele descia para 24 px e caía em cima da barra. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 font-sans sm:items-end sm:px-6 md:bottom-6" aria-live="polite" aria-atomic="false">
        {estado.toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-bloco border bg-folha px-3 py-2 text-sm font-medium leading-5 text-tinta shadow-flutua",
              bordaDoTom[t.tom],
            )}
            role="status"
          >
            {icone[t.tom]}
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t.texto}</span>
            {t.acao ? (
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center rounded-controle border border-fio-2 bg-folha px-3 text-[13px] font-bold text-musgo hover:bg-saber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
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
              className="grid h-8 w-8 shrink-0 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
              onClick={() => {
                toasts = toasts.filter((x) => x.id !== t.id);
                notificar();
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      {estado.dialogo ? <Dialogo dialogo={estado.dialogo} /> : null}
    </NoCorpoDaPagina>
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
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[var(--veu)] p-4 font-sans" onMouseDown={(event) => { if (event.target === event.currentTarget) fechar(null); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={`dialogo-${dialogo.id}`} className="w-full max-w-md rounded-painel border border-fio bg-folha p-6 text-tinta shadow-flutua max-md:p-5">
        <h2 id={`dialogo-${dialogo.id}`} className="text-xl font-bold leading-7 text-tinta [text-wrap:balance]">
          {dialogo.titulo}
        </h2>
        {dialogo.corpo ? <div className="mt-2 text-sm font-medium leading-[22px] text-tinta-2">{dialogo.corpo}</div> : null}
        {dialogo.campo ? (
          <label className="mt-4 block text-[13px] font-bold leading-5 text-tinta">
            {dialogo.campo.rotulo}
            {dialogo.campo.multilinha ? (
              <textarea
                ref={primeiroRef as React.RefObject<HTMLTextAreaElement>}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={dialogo.campo.placeholder}
                rows={3}
                className="mt-1 w-full rounded-controle border border-borda-campo bg-folha px-3 py-2 text-sm font-medium text-tinta placeholder:text-tinta-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco"
              />
            ) : (
              <input
                ref={primeiroRef as React.RefObject<HTMLInputElement>}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={dialogo.campo.placeholder}
                className="mt-1 h-10 w-full rounded-controle border border-borda-campo bg-folha px-3 text-sm font-medium text-tinta placeholder:text-tinta-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco"
              />
            )}
          </label>
        ) : null}
        {/* A decisão na ponta direita; Cancelar antes dela (como a BarraDecisao). */}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => fechar(null)} className={botaoClasses({ variante: "fantasma" })}>
            {dialogo.cancelar}
          </button>
          <button
            ref={dialogo.campo ? undefined : (primeiroRef as React.RefObject<HTMLButtonElement>)}
            type="button"
            onClick={() => fechar(dialogo.campo ? valor : "ok")}
            className={botaoClasses({ variante: dialogo.destrutivo ? "perigo-cheio" : "primario" })}
          >
            {dialogo.confirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
