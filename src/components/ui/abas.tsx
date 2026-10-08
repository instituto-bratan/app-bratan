// ABAS — uma só forma de abas no app inteiro (Papel & Musgo, 08/10/2026).
//
// O levantamento achou pelo menos 4 estilos de barra de abas. Agora é uma linha
// só, com uma ou duas palavras por aba; a aberta ganha o fio de ouro embaixo (o
// ouro marca o agora) e fica em negrito.
//
// Dois jeitos, a mesma cara:
//  · Com `to` em TODAS as abas, cada aba é uma ROTA (o Financeiro → Pagar →
//    Contas · Fatura do cartão · Lembretes). Viram links de verdade dentro de um
//    <nav>: abrir em outra guia, voltar do navegador e colar o endereço funcionam,
//    e a aba aberta vem do endereço. NENHUMA URL antiga muda: a aba aponta para ela.
//  · Sem `to`, são abas da própria tela (role="tablist"), controladas por
//    `valor` + `onMudar`.
// Teclado: ←/→ andam (e dão a volta), Home/End vão às pontas. Nas abas da tela a
// seta já troca a aba; nas de rota ela só move o foco e o Enter abre.
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Contador } from "./contador";
import { abaAtivaPorRota, indiceDaTecla } from "./papel-musgo";

export type ItemAba = {
  id: string;
  rotulo: React.ReactNode;
  /** Rota da aba. Se todas tiverem, as abas viram navegação por rota. */
  to?: string;
  /** Só abre com o endereço igual (sem isso, /x/123 também abre a aba /x). */
  exata?: boolean;
  /** Bolinha suave ao lado do nome (ex.: Lembretes 2). */
  contador?: number;
  desabilitada?: boolean;
};

export type AbasProps = {
  itens: ItemAba[];
  /** Nome do conjunto para o leitor de tela ("Seções do Financeiro · Pagar"). */
  rotulo: string;
  /** Aba aberta (abas da tela). Nas de rota, força uma aba em vez de ler o endereço. */
  valor?: string;
  onMudar?: (id: string) => void;
  /** Para abas da tela: id do painel que cada aba controla (aria-controls). */
  idDoPainel?: (id: string) => string;
  className?: string;
};

const LINHA = "flex gap-6 overflow-x-auto border-b border-fio [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-md:gap-5";

function classesDaAba(ativa: boolean, desabilitada?: boolean) {
  return cn(
    "relative inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-controle font-sans text-sm leading-5",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco",
    ativa
      ? "font-bold text-tinta after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-t-sm after:bg-ouro-fio after:content-['']"
      : "font-semibold text-tinta-2 hover:text-tinta",
    desabilitada && "pointer-events-none opacity-60",
  );
}

/** Move o foco entre as abas com o teclado; devolve o índice escolhido (ou null). */
function useTecladoDasAbas(itens: ItemAba[]) {
  const refs = React.useRef<(HTMLElement | null)[]>([]);
  const aoTeclar = (evento: React.KeyboardEvent, atual: number): number | null => {
    const habilitadas = itens.map((item, i) => (item.desabilitada ? -1 : i)).filter((i) => i >= 0);
    const posicao = habilitadas.indexOf(atual);
    const proxima = indiceDaTecla(posicao < 0 ? 0 : posicao, habilitadas.length, evento.key);
    if (proxima === null) return null;
    evento.preventDefault();
    const indice = habilitadas[proxima];
    refs.current[indice]?.focus();
    return indice;
  };
  return { refs, aoTeclar };
}

/** Deixa a aba aberta à vista quando a linha rola de lado (celular). Rola só a
 *  linha das abas — scrollIntoView puxaria a página inteira para baixo. */
function useAbaAVista(refs: React.MutableRefObject<(HTMLElement | null)[]>, indiceAtivo: number) {
  React.useEffect(() => {
    const el = refs.current[indiceAtivo];
    const linha = el?.parentElement;
    if (!el || !linha || linha.scrollWidth <= linha.clientWidth) return;
    const caixa = linha.getBoundingClientRect();
    const aba = el.getBoundingClientRect();
    if (aba.left < caixa.left) linha.scrollLeft += aba.left - caixa.left - 16;
    else if (aba.right > caixa.right) linha.scrollLeft += aba.right - caixa.right + 16;
  }, [refs, indiceAtivo]);
}

function ConteudoDaAba({ item, ativa }: { item: ItemAba; ativa: boolean }) {
  return (
    <>
      {item.rotulo}
      {item.contador ? <Contador valor={item.contador} tom={ativa ? "padrao" : "suave"} /> : null}
    </>
  );
}

function AbasDeRota({ itens, rotulo, valor, className }: AbasProps) {
  const { pathname } = useLocation();
  const ativo = valor ?? abaAtivaPorRota(pathname, itens);
  const { refs, aoTeclar } = useTecladoDasAbas(itens);
  const indiceAtivo = Math.max(0, itens.findIndex((item) => item.id === ativo));
  useAbaAVista(refs, indiceAtivo);
  return (
    <nav aria-label={rotulo} className={cn(LINHA, className)}>
      {itens.map((item, i) => {
        const ativa = item.id === ativo;
        return (
          <Link
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            to={item.to ?? "#"}
            aria-current={ativa ? "page" : undefined}
            aria-disabled={item.desabilitada || undefined}
            tabIndex={i === indiceAtivo ? 0 : -1}
            onKeyDown={(evento) => {
              aoTeclar(evento, i);
            }}
            className={classesDaAba(ativa, item.desabilitada)}
          >
            <ConteudoDaAba item={item} ativa={ativa} />
          </Link>
        );
      })}
    </nav>
  );
}

function AbasDaTela({ itens, rotulo, valor, onMudar, idDoPainel, className }: AbasProps) {
  const base = React.useId();
  const ativo = valor ?? itens.find((item) => !item.desabilitada)?.id;
  const { refs, aoTeclar } = useTecladoDasAbas(itens);
  const indiceAtivo = Math.max(0, itens.findIndex((item) => item.id === ativo));
  useAbaAVista(refs, indiceAtivo);
  return (
    <div role="tablist" aria-label={rotulo} aria-orientation="horizontal" className={cn(LINHA, className)}>
      {itens.map((item, i) => {
        const ativa = item.id === ativo;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-aba-${item.id}`}
            aria-selected={ativa}
            aria-controls={idDoPainel?.(item.id)}
            disabled={item.desabilitada}
            tabIndex={ativa ? 0 : -1}
            onClick={() => onMudar?.(item.id)}
            onKeyDown={(evento) => {
              const indice = aoTeclar(evento, i);
              if (indice !== null) onMudar?.(itens[indice].id);
            }}
            className={classesDaAba(ativa, item.desabilitada)}
          >
            <ConteudoDaAba item={item} ativa={ativa} />
          </button>
        );
      })}
    </div>
  );
}

export function Abas(props: AbasProps) {
  const deRota = props.itens.length > 0 && props.itens.every((item) => Boolean(item.to));
  return deRota ? <AbasDeRota {...props} /> : <AbasDaTela {...props} />;
}
