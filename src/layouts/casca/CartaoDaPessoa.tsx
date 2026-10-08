// O CARTÃO DA PESSOA no pé do menu (08/10/2026): nome + cargo, como na imagem
// 01. Na casca antiga o topo tinha o avatar (Meu perfil), o botão de tema e o
// Sair; o topo novo ficou com busca, sino e ajuda, então essas três coisas
// moram aqui — um toque no cartão abre as opções. Nada se perde.
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronUp, LogOut, Monitor, Moon, SunMedium, UserRound } from "lucide-react";
import { cargoLabels } from "@/lib/access";
import { useAvatar } from "@/features/perfil/avatarStore";
import type { Tema } from "@/lib/tema";
import { cn } from "@/lib/utils";
import type { Pessoa } from "@/types/database";
import { iniciais } from "./casca";

export type PropsDaPessoa = {
  pessoa: Pessoa | null;
  isPreview: boolean;
  tema: Tema;
  onTema: (tema: Tema) => void;
  onSair: () => void;
};

/** O avatar em arco (o arco do brasão): foto deste aparelho ou as iniciais. */
export function AvatarDaPessoa({ pessoa, className }: { pessoa: Pessoa | null; className?: string }) {
  const foto = useAvatar(pessoa?.id);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid h-9 w-8 shrink-0 place-items-center overflow-hidden rounded-t-2xl rounded-b-controle bg-musgo font-sans text-xs font-extrabold tracking-[0.04em] text-creme dark:text-sobre-musgo",
        className,
      )}
    >
      {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : iniciais(pessoa?.nome)}
    </span>
  );
}

const TEMAS: { valor: Tema; rotulo: string; Icone: typeof SunMedium }[] = [
  { valor: "claro", rotulo: "Claro", Icone: SunMedium },
  { valor: "escuro", rotulo: "Escuro", Icone: Moon },
  { valor: "sistema", rotulo: "Como no aparelho", Icone: Monitor },
];

const LINHA_DE_OPCAO =
  "flex h-10 w-full items-center gap-3 rounded-controle px-3 text-left font-sans text-sm font-semibold text-tinta transition-colors duration-150 ease-papel hover:bg-saber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco";

/** Meu perfil · Tema · Sair — no menu do cartão (computador) e na gaveta (celular). */
export function OpcoesDaPessoa({ tema, onTema, onSair, aoEscolher }: Omit<PropsDaPessoa, "pessoa" | "isPreview"> & { aoEscolher?: () => void }) {
  const idTema = useId();
  return (
    <div className="grid gap-1">
      <Link to="/meu-perfil" className={LINHA_DE_OPCAO} onClick={aoEscolher}>
        <UserRound className="h-4 w-4 text-tinta-2" aria-hidden="true" />
        Meu perfil
      </Link>
      <p id={idTema} className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-[0.08em] text-tinta-2">
        Tema
      </p>
      <div role="radiogroup" aria-labelledby={idTema} className="grid gap-1">
        {TEMAS.map(({ valor, rotulo, Icone }) => {
          const marcado = tema === valor;
          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={marcado}
              onClick={() => onTema(valor)}
              className={cn(LINHA_DE_OPCAO, marcado && "bg-musgo-claro text-musgo hover:bg-musgo-claro-2")}
            >
              <Icone className="h-4 w-4 text-tinta-2" aria-hidden="true" />
              <span className="flex-1">{rotulo}</span>
              {marcado ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <div className="my-1 h-px bg-fio" aria-hidden="true" />
      <button type="button" className={cn(LINHA_DE_OPCAO, "text-erro hover:bg-erro-claro")} onClick={onSair}>
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sair
      </button>
    </div>
  );
}

/** Nome + cargo no pé do menu; abre Meu perfil, Tema e Sair. */
export function CartaoDaPessoa({ pessoa, isPreview, tema, onTema, onSair }: PropsDaPessoa) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const idPainel = useId();
  const cargo = pessoa?.cargo ? cargoLabels[pessoa.cargo] : "Sem cargo";

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (evento: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(evento.target as Node)) setAberto(false);
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        setAberto(false);
        botaoRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <div ref={caixaRef} className="relative">
      {aberto ? (
        <div
          id={idPainel}
          className="absolute inset-x-0 bottom-full z-40 mb-2 rounded-bloco border border-fio bg-folha p-2 shadow-flutua"
        >
          <OpcoesDaPessoa tema={tema} onTema={onTema} onSair={onSair} aoEscolher={() => setAberto(false)} />
        </div>
      ) : null}
      <button
        ref={botaoRef}
        type="button"
        aria-expanded={aberto}
        aria-controls={idPainel}
        onClick={() => setAberto((atual) => !atual)}
        className="flex w-full items-center gap-3 rounded-controle px-2 py-1 text-left transition-colors duration-150 ease-papel hover:bg-folha/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco"
      >
        <AvatarDaPessoa pessoa={pessoa} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold leading-5 text-tinta">
            {pessoa?.nome ?? "Equipe Bratan"}
            {isPreview ? <span className="font-semibold text-tinta-2"> · prévia</span> : null}
          </span>
          <span className="block truncate text-xs font-medium leading-4 text-tinta-2">
            {cargo}
          </span>
        </span>
        <ChevronUp className={cn("h-4 w-4 shrink-0 text-tinta-2 transition-transform duration-150", !aberto && "rotate-180")} aria-hidden="true" />
        <span className="sr-only">{aberto ? "Fechar as opções" : "Abrir as opções: meu perfil, tema e sair"}</span>
      </button>
    </div>
  );
}
