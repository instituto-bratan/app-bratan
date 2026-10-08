// O CELULAR (08/10/2026, imagem 05): abaixo de 768 px a casca troca o menu
// lateral por uma barra de baixo com 5 itens, TODOS COM NOME — Início · Buscar ·
// Novo · Financeiro · Menu (itensDaBarraDoCelular, do mapa). A barra antiga
// tinha 6 ícones sem nome e nem tinha o Financeiro.
//  · Buscar abre o ⌘K em tela cheia;
//  · Novo abre as ações rápidas (Novo pedido de compra · Lançar dia · Nova conta);
//  · Menu abre a gaveta com os grupos, os Fixados, Ajustes e a pessoa.
// A barra respeita a área segura do aparelho (a "barrinha" do iPhone).
// Revisão de 08/10/2026: tocar num item ou num fixado fecha a gaveta (antes ela
// só fechava quando o endereço mudava, e o item da tela atual a deixava aberta),
// e a letra da gaveta voltou para a escala aprovada (16 px, não 15).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Contador } from "@/components/ui/contador";
import { cargoLabels } from "@/lib/access";
import type { AcaoRapida, Atalho, Caminho, Contador as TipoContador, GrupoNoMenu, ItemDaBarra } from "@/lib/navegacao";
import { cn } from "@/lib/utils";
import { rotuloDoContador } from "./casca";
import { AvatarDaPessoa, OpcoesDaPessoa, type PropsDaPessoa } from "./CartaoDaPessoa";
import { FolhaQueSobe } from "./FolhaQueSobe";
import { Icone } from "./Icone";
import { aquecer } from "./MenuLateral";

const FOCO = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco";

export type BarraDoCelularProps = {
  itens: ItemDaBarra[];
  caminho: Caminho | null;
  ehInicio: boolean;
  aberto: "buscar" | "novo" | "menu" | null;
  onAcao: (acao: "buscar" | "novo" | "menu") => void;
  valorDe: (contador: TipoContador | null) => number;
};

export function BarraDoCelular({ itens, caminho, ehInicio, aberto, onAcao, valorDe }: BarraDoCelularProps) {
  return (
    <nav
      aria-label="Navegação"
      className={cn(
        "fixed inset-x-2 z-40 grid h-16 rounded-painel border border-fio bg-folha/95 shadow-flutua backdrop-blur-md md:hidden",
        "bottom-[max(8px,calc(env(safe-area-inset-bottom)-10px))]",
      )}
      style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}
    >
      {itens.map((item) => {
        const atual =
          item.acao === "ir" ? (item.id === "inicio" ? ehInicio : !aberto && caminho?.grupo.id === item.id) : aberto === item.acao;
        const valor = valorDe(item.contador);
        const conteudo = (
          <>
            {item.acao === "novo" ? (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-musgo text-sobre-musgo">
                <Icone nome={item.icone} className="h-5 w-5" />
              </span>
            ) : (
              <Icone nome={item.icone} className={cn("my-1.5 h-5 w-5", atual ? "text-musgo" : "text-tinta-2")} />
            )}
            <span>{item.rotulo}</span>
            {item.contador && valor > 0 ? (
              <Contador
                valor={valor}
                rotulo={rotuloDoContador(item.contador, valor)}
                className="absolute left-[calc(50%+6px)] top-2 shadow-[0_0_0_2px_rgb(var(--folha-rgb))]"
              />
            ) : null}
          </>
        );
        const classes = cn(
          "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-painel font-sans text-xs leading-4",
          atual
            ? "font-bold text-tinta before:absolute before:left-1/2 before:top-1 before:h-0.5 before:w-6 before:-translate-x-1/2 before:rounded-sm before:bg-ouro-fio before:content-['']"
            : "font-semibold text-tinta-2",
          FOCO,
        );
        if (item.acao === "ir" && item.href) {
          return (
            <Link key={item.id} to={item.href} {...aquecer(item.href)} aria-current={atual ? "page" : undefined} className={classes}>
              {conteudo}
            </Link>
          );
        }
        const acao = item.acao as "buscar" | "novo" | "menu";
        return (
          <button key={item.id} type="button" onClick={() => onAcao(acao)} aria-expanded={aberto === acao} aria-haspopup="dialog" className={classes}>
            {conteudo}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Novo: as ações rápidas
// ---------------------------------------------------------------------------

export function FolhaDoNovo({ aberta, onFechar, acoes, onEscolher }: { aberta: boolean; onFechar: () => void; acoes: AcaoRapida[]; onEscolher: (href: string) => void }) {
  return (
    <FolhaQueSobe aberta={aberta} titulo="Novo" onFechar={onFechar}>
      <ul className="grid gap-1 pb-2">
        {acoes.map((acao) => (
          <li key={acao.id}>
            <button
              type="button"
              onClick={() => onEscolher(acao.href)}
              className={cn("flex h-14 w-full items-center gap-3 rounded-controle px-3 text-left text-base font-semibold text-tinta hover:bg-saber", FOCO)}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-controle bg-musgo-claro text-musgo">
                <Icone nome={acao.icone} className="h-5 w-5" />
              </span>
              {acao.rotulo}
            </button>
          </li>
        ))}
      </ul>
    </FolhaQueSobe>
  );
}

// ---------------------------------------------------------------------------
// Menu: a gaveta com os grupos
// ---------------------------------------------------------------------------

function GrupoDaGaveta({
  grupo,
  caminho,
  aberto,
  onAlternar,
  valorDe,
  onFechar,
}: {
  grupo: GrupoNoMenu;
  caminho: Caminho | null;
  aberto: boolean;
  onAlternar: () => void;
  valorDe: (contador: TipoContador | null) => number;
  /** Fecha a gaveta ao tocar num item (revisão de 08/10/2026: tocar na tela atual deixava a gaveta aberta). */
  onFechar: () => void;
}) {
  const valor = valorDe(grupo.contador);
  const idItens = `gaveta-${grupo.id}`;
  return (
    <li className={cn("rounded-bloco", aberto && "bg-saber")}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        aria-controls={idItens}
        className={cn("flex h-12 w-full items-center gap-3 rounded-bloco px-3 text-left text-base font-semibold text-tinta", FOCO)}
      >
        <Icone nome={grupo.icone} className={cn("h-5 w-5 shrink-0", aberto ? "text-musgo" : "text-tinta-2")} />
        <span className="min-w-0 flex-1 truncate">{grupo.rotulo}</span>
        {grupo.contador && valor > 0 ? <Contador valor={valor} rotulo={rotuloDoContador(grupo.contador, valor)} /> : null}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-tinta-2 transition-transform duration-150", aberto && "rotate-180")} aria-hidden="true" />
      </button>
      {aberto ? (
        <ul id={idItens} className="ml-[22px] grid border-l border-fio-2 pb-2">
          {grupo.itens.map((item) => {
            const atual = caminho?.item.id === item.id;
            return (
              <li key={item.id}>
                <Link
                  to={item.href}
                  {...aquecer(item.href)}
                  onClick={onFechar}
                  aria-current={atual ? "page" : undefined}
                  className={cn(
                    "relative flex h-11 items-center pl-5 pr-3 text-base",
                    atual
                      ? "font-bold text-tinta before:absolute before:-left-0.5 before:bottom-2.5 before:top-2.5 before:w-[3px] before:rounded-sm before:bg-ouro-fio before:content-['']"
                      : "font-medium text-tinta-2",
                    FOCO,
                  )}
                >
                  {item.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export type GavetaDoMenuProps = PropsDaPessoa & {
  aberta: boolean;
  onFechar: () => void;
  grupos: GrupoNoMenu[];
  caminho: Caminho | null;
  fixados: Atalho[];
  limiteFixados: number;
  valorDe: (contador: TipoContador | null) => number;
};

export function GavetaDoMenu({ aberta, onFechar, grupos, caminho, fixados, limiteFixados, valorDe, ...pessoa }: GavetaDoMenuProps) {
  const [abertos, setAbertos] = useState<string[]>([]);
  // Ao abrir, o grupo da tela atual já vem aberto.
  const grupoAtual = caminho?.grupo.id ?? null;
  useEffect(() => {
    if (aberta) setAbertos(grupoAtual ? [grupoAtual] : []);
  }, [aberta, grupoAtual]);
  const alternar = (id: string) => setAbertos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  const cargo = pessoa.pessoa?.cargo ? cargoLabels[pessoa.pessoa.cargo] : "Sem cargo";

  return (
    <FolhaQueSobe aberta={aberta} titulo="Menu" onFechar={onFechar}>
      <nav aria-label="Grupos">
        <ul className="grid gap-0.5">
          {grupos
            .filter((grupo) => !grupo.rodape)
            .map((grupo) => (
              <GrupoDaGaveta key={grupo.id} grupo={grupo} caminho={caminho} aberto={abertos.includes(grupo.id)} onAlternar={() => alternar(grupo.id)} valorDe={valorDe} onFechar={onFechar} />
            ))}
        </ul>
      </nav>

      <p className="mt-5 flex items-center justify-between px-3 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-tinta-2">
        Fixados
        <span className="font-semibold normal-case tracking-normal">
          {fixados.length} de {limiteFixados}
        </span>
      </p>
      {fixados.length ? (
        <ul className="grid">
          {fixados.map((atalho) => (
            <li key={atalho.id}>
              <Link to={atalho.href} onClick={onFechar} className={cn("flex h-11 items-center gap-3 rounded-controle px-3 text-base font-medium text-tinta", FOCO)}>
                <Icone nome={atalho.icone} className="h-4 w-4 shrink-0 text-tinta-2" />
                {atalho.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 text-[13px] font-medium leading-5 text-tinta-2">Prenda até {limiteFixados} telas pelo alfinete da busca.</p>
      )}

      <ul className="mt-4 grid gap-0.5 border-t border-fio pt-3">
        {grupos
          .filter((grupo) => grupo.rodape)
          .map((grupo) => (
            <GrupoDaGaveta key={grupo.id} grupo={grupo} caminho={caminho} aberto={abertos.includes(grupo.id)} onAlternar={() => alternar(grupo.id)} valorDe={valorDe} onFechar={onFechar} />
          ))}
      </ul>

      <div className="mt-3 border-t border-fio px-1 pt-3">
        <div className="flex items-center gap-3 px-2 pb-2">
          <AvatarDaPessoa pessoa={pessoa.pessoa} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-tinta">
              {pessoa.pessoa?.nome ?? "Equipe Bratan"}
              {pessoa.isPreview ? <span className="font-semibold text-tinta-2"> · prévia</span> : null}
            </p>
            <p className="truncate text-xs font-medium text-tinta-2">
              {cargo}
            </p>
          </div>
        </div>
        <OpcoesDaPessoa tema={pessoa.tema} onTema={pessoa.onTema} onSair={pessoa.onSair} aoEscolher={onFechar} />
      </div>
    </FolhaQueSobe>
  );
}
