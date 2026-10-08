// O MENU LATERAL (08/10/2026) — a MESA da casca Papel & Musgo (imagens 01 e 06).
//
// Lê tudo do mapa (itensDoMenu): 7 grupos + Ajustes no rodapé, só com o que a
// pessoa vê (a regra de acesso é a mesma de 07/10). O grupo da página aberta
// vira uma folha sobre a mesa e mostra os itens, com o fio de ouro no item onde
// a pessoa está. Embaixo: FIXADOS (até 5, "x de 5"), Ajustes e o cartão da pessoa.
// O menu fica preso na altura da tela (a casca antiga subia junto com a página).
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Contador } from "@/components/ui/contador";
import { prefetchRoute } from "@/lib/routePreload";
import { cn } from "@/lib/utils";
import type { Atalho, Caminho, Contador as TipoContador, GrupoNoMenu, ItemNoMenu } from "@/lib/navegacao";
import { rotuloDoContador } from "./casca";
import { CartaoDaPessoa, type PropsDaPessoa } from "./CartaoDaPessoa";
import { Icone } from "./Icone";
import { MarcaCompleta } from "./Marca";

export function aquecer(href: string) {
  return {
    onPointerEnter: () => prefetchRoute(href),
    onFocus: () => prefetchRoute(href),
    onTouchStart: () => prefetchRoute(href),
  };
}

const FOCO_DENTRO = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco";

/** A linha de grupo (e de fixado e de Ajustes): 36 px, ícone em tinta 2 (na mesa a oliva cairia para 2,9:1). */
const LINHA = cn(
  "flex h-9 items-center gap-3 rounded-controle pl-2.5 pr-2 font-sans text-sm font-semibold leading-5 whitespace-nowrap",
  "transition-colors duration-150 ease-papel hover:bg-folha/55 max-[1199px]:gap-2.5",
  FOCO_DENTRO,
);

function NumeroDoMenu({ contador, valor, tom = "padrao" }: { contador: TipoContador | null; valor: number; tom?: "padrao" | "suave" }) {
  if (!contador || valor <= 0) return null;
  return <Contador valor={valor} tom={tom} rotulo={rotuloDoContador(contador, valor)} className="ml-auto" />;
}

function ItensDoGrupo({ grupo, caminho, valorDe }: { grupo: GrupoNoMenu; caminho: Caminho | null; valorDe: (c: TipoContador | null) => number }) {
  return (
    <div className="ml-[17px] flex flex-col border-l border-fio-2">
      {grupo.itens.map((item: ItemNoMenu) => {
        const atual = caminho?.item.id === item.id;
        // O número do grupo já aparece na linha do grupo; no item só vai o que é outro número (Avisos).
        const contadorProprio = item.contador && item.contador !== grupo.contador ? item.contador : null;
        return (
          <Link
            key={item.id}
            to={item.href}
            {...aquecer(item.href)}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "relative flex h-8 items-center gap-2 whitespace-nowrap rounded-r-controle pl-5 pr-2 font-sans text-sm leading-5",
              "transition-colors duration-150 ease-papel hover:text-tinta",
              FOCO_DENTRO,
              atual
                ? "font-bold text-tinta before:absolute before:-left-0.5 before:bottom-1.5 before:top-1.5 before:w-[3px] before:rounded-sm before:bg-ouro-fio before:content-['']"
                : "font-medium text-tinta-2",
            )}
          >
            <span className="min-w-0 truncate">{item.rotulo}</span>
            <NumeroDoMenu contador={contadorProprio} valor={valorDe(contadorProprio)} tom="suave" />
          </Link>
        );
      })}
    </div>
  );
}

function Grupo({ grupo, aberto, caminho, valorDe }: { grupo: GrupoNoMenu; aberto: boolean; caminho: Caminho | null; valorDe: (c: TipoContador | null) => number }) {
  const linha = (
    <Link
      to={grupo.href}
      {...aquecer(grupo.href)}
      className={cn(LINHA, aberto ? "text-tinta" : "text-[color:var(--tinta-menu)]")}
    >
      <Icone nome={grupo.icone} className={cn("h-4 w-4 shrink-0", aberto ? "text-musgo" : "text-tinta-2")} />
      <span className="min-w-0 truncate">{grupo.rotulo}</span>
      <NumeroDoMenu contador={grupo.contador} valor={valorDe(grupo.contador)} />
    </Link>
  );
  if (!aberto) return linha;
  // O contorno da folha é box-shadow em variável (fio #D3CDB9 no claro, musgo
  // #414B33 no escuro). Revisão de 08/10/2026: "shadow-[var(...)]" era ambíguo
  // para o Tailwind, virava só cor de sombra e a folha ficava sem contorno.
  return (
    <div className="my-0.5 mb-1 rounded-bloco bg-[var(--grupo-ativo)] pb-2 [box-shadow:var(--borda-folha-ativa)]">
      {linha}
      <ItensDoGrupo grupo={grupo} caminho={caminho} valorDe={valorDe} />
    </div>
  );
}

export type MenuLateralProps = PropsDaPessoa & {
  grupos: GrupoNoMenu[];
  caminho: Caminho | null;
  fixados: Atalho[];
  limiteFixados: number;
  onSoltarFixado: (id: string) => void;
  valorDe: (contador: TipoContador | null) => number;
};

export function MenuLateral({ grupos, caminho, fixados, limiteFixados, onSoltarFixado, valorDe, ...pessoa }: MenuLateralProps) {
  const principais = grupos.filter((grupo) => !grupo.rodape);
  const ajustes = grupos.find((grupo) => grupo.rodape) ?? null;
  const grupoAberto = caminho?.grupo.id ?? null;
  const rotaAberta = caminho?.destino?.rota ?? null;

  return (
    <aside
      aria-label="Menu principal"
      className={cn(
        "sticky top-0 hidden h-screen h-dvh min-w-0 flex-col overflow-y-auto border-r border-fio-2 px-3 pb-3 pt-4 md:flex",
        "bg-[var(--mesa-fundo)] [background-image:var(--mesa-textura)]",
      )}
    >
      <Link to="/" {...aquecer("/")} aria-label="Instituto Bratan, ir para o Início" className={cn("flex items-center rounded-controle px-2 pb-6 pt-2", FOCO_DENTRO)}>
        <MarcaCompleta />
      </Link>

      <nav aria-label="Grupos" className="flex flex-col gap-0.5">
        {principais.map((grupo) => (
          <Grupo key={grupo.id} grupo={grupo} aberto={grupo.id === grupoAberto} caminho={caminho} valorDe={valorDe} />
        ))}
      </nav>

      <p className="mt-6 flex items-center justify-between px-2.5 pb-2 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
        Fixados
        <span className="font-semibold normal-case tracking-normal">
          {fixados.length} de {limiteFixados}
        </span>
      </p>
      {fixados.length ? (
        <nav aria-label="Fixados" className="flex flex-col gap-0.5">
          {fixados.map((atalho) => (
            <div key={atalho.id} className="group relative">
              <Link
                to={atalho.href}
                {...aquecer(atalho.href)}
                aria-current={rotaAberta === atalho.href ? "page" : undefined}
                className={cn(LINHA, "pr-9 font-medium text-[color:var(--tinta-menu)] aria-[current=page]:font-bold aria-[current=page]:text-tinta")}
              >
                <Icone nome={atalho.icone} className="h-4 w-4 shrink-0 text-tinta-2" />
                <span className="min-w-0 truncate">{atalho.rotulo}</span>
              </Link>
              <button
                type="button"
                onClick={() => onSoltarFixado(atalho.id)}
                aria-label={`Soltar ${atalho.rotulo} dos fixados`}
                className={cn(
                  "absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-controle text-tinta-2 opacity-0 transition-opacity duration-150",
                  "hover:bg-saber hover:text-tinta focus-visible:opacity-100 group-hover:opacity-100",
                  FOCO_DENTRO,
                )}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </nav>
      ) : (
        <p className="px-2.5 text-[13px] font-medium leading-5 text-tinta-2">
          Prenda até {limiteFixados} telas: use o alfinete no topo da tela ou ⌘D na busca.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-fio-2 pt-3">
        {ajustes ? <Grupo grupo={ajustes} aberto={ajustes.id === grupoAberto} caminho={caminho} valorDe={valorDe} /> : null}
        <CartaoDaPessoa {...pessoa} />
      </div>
    </aside>
  );
}
