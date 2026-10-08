// CAMPO DE BUSCA — Papel & Musgo (08/10/2026).
//
// A busca diz o que procura ("Buscar paciente, conta, pedido ou ação") e mostra
// o atalho. Dois jeitos, a mesma cara:
//  · Com `onAbrir` (e sem `valor`): é o botão do topo que abre o ⌘K — a paleta
//    que acha os 62 destinos e faz as ações comuns. Quem desenha a paleta é a
//    casca; aqui só mora a porta.
//  · Com `valor` + `onMudar`: é um campo de filtro de verdade (lista de
//    pacientes, contas), com o "x" para limpar.
// `atalho` liga o ⌘K / Ctrl+K na página. Deixe ligado em UM lugar só (a casca),
// senão o atalho abre duas coisas.
import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CampoBuscaProps = {
  /** O que a busca procura. */
  placeholder?: string;
  /** Nome para o leitor de tela (padrão "Buscar"). */
  rotulo?: string;
  /** Modo porta: abre a paleta ⌘K. */
  onAbrir?: () => void;
  /** Modo filtro: texto digitado. */
  valor?: string;
  onMudar?: (valor: string) => void;
  /** Liga o ⌘K / Ctrl+K da página (abre a paleta ou põe o foco no campo). */
  atalho?: boolean;
  /** Mostra a tecla do atalho na ponta (padrão: só quando `atalho` está ligado ou é a porta do ⌘K). */
  mostrarTecla?: boolean;
  className?: string;
};

function ehApple() {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

const CAIXA =
  "flex h-10 w-full min-w-0 items-center gap-2 rounded-controle border bg-folha pl-3 pr-2 font-sans text-sm font-medium leading-5 transition-colors duration-150 ease-papel";

// font-sans (08/10/2026): o preflight do Tailwind põe <kbd> em monoespaçada; a
// proposta (tokens.css, "kbd, .tecla") usa Manrope 700 12 px.
const TECLA =
  "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-controle border border-b-2 border-fio-2 bg-papel px-1.5 font-sans text-xs font-bold leading-none text-tinta-2";

export function CampoBusca({
  placeholder = "Buscar paciente, conta, pedido ou ação",
  rotulo = "Buscar",
  onAbrir,
  valor,
  onMudar,
  atalho = false,
  mostrarTecla,
  className,
}: CampoBuscaProps) {
  const entradaRef = React.useRef<HTMLInputElement>(null);
  const modoPorta = valor === undefined && Boolean(onAbrir);
  const tecla = React.useMemo(() => (ehApple() ? "⌘K" : "Ctrl K"), []);
  const verTecla = mostrarTecla ?? (atalho || modoPorta);

  React.useEffect(() => {
    if (!atalho) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if ((evento.metaKey || evento.ctrlKey) && !evento.altKey && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        if (modoPorta) onAbrir?.();
        else entradaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [atalho, modoPorta, onAbrir]);

  if (modoPorta) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`${rotulo} (${tecla})`}
        aria-keyshortcuts={atalho ? "Meta+K Control+K" : undefined}
        className={cn(
          CAIXA,
          "cursor-text border-fio-2 text-left text-tinta-2 hover:border-borda-campo",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
          className,
        )}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{placeholder}</span>
        {verTecla ? <kbd className={TECLA}>{tecla}</kbd> : null}
      </button>
    );
  }

  return (
    <label
      className={cn(
        CAIXA,
        "cursor-text border-borda-campo text-tinta hover:border-tinta-2",
        "focus-within:border-musgo focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-foco",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-tinta-2" aria-hidden="true" />
      <span className="sr-only">{rotulo}</span>
      <input
        ref={entradaRef}
        type="search"
        value={valor ?? ""}
        onChange={(evento) => onMudar?.(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === "Escape" && valor) {
            evento.preventDefault();
            onMudar?.("");
          }
        }}
        placeholder={placeholder}
        aria-keyshortcuts={atalho ? "Meta+K Control+K" : undefined}
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-tinta outline-none placeholder:text-tinta-2 [&::-webkit-search-cancel-button]:hidden"
      />
      {valor ? (
        <button
          type="button"
          onClick={() => {
            onMudar?.("");
            entradaRef.current?.focus();
          }}
          aria-label="Limpar a busca"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : verTecla ? (
        <kbd className={TECLA}>{tecla}</kbd>
      ) : null}
    </label>
  );
}
