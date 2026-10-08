// A BUSCA ⌘K (08/10/2026) — "Buscar paciente, conta, pedido ou ação".
//
// Substitui o "Fluxos" da casca antiga, sem perder nada do que ele fazia:
//  · acha os destinos pelo mapa (navegacao.ts → buscar: sem acento, por
//    sinônimo, só o que a pessoa vê) — os 62 de antes + os novos;
//  · faz as 3 ações do menu aprovado (Novo pedido de compra · Lançar dia ·
//    Nova conta a pagar) e os comandos de 14/09 ("1250" vira conta de
//    R$ 1.250,00; "aprovar" abre a caixa de aprovação) — ver comandos.ts;
//  · acha paciente pelo nome a partir de 3 letras (como desde 29/09).
// Teclado: ↑ ↓ andam, Enter abre, Esc fecha, ⌘D (Ctrl+D) fixa ou solta a tela
// marcada. No celular abre em tela cheia (o "Buscar" da barra de baixo).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Pin, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { canCrmBratan } from "@/lib/access";
import { acoesRapidas, itensDoMenu, type Atalho, type NomeIcone, type PessoaNav } from "@/lib/navegacao";
import type { Pessoa } from "@/types/database";
import { buscarPacientes } from "@/lib/remote/buscaPaciente";
import { prefetchRoute } from "@/lib/routePreload";
import { cn } from "@/lib/utils";
import { linhasDaBusca } from "./comandos";
import { Icone } from "./Icone";

type Opcao = {
  chave: string;
  secao: string;
  rotulo: string;
  contexto: string;
  href: string;
  icone: NomeIcone;
  destinoId: string | null;
};

export type BuscaRapidaProps = {
  pessoa: Pessoa | null;
  aberta: boolean;
  onFechar: () => void;
  fixados: Atalho[];
  estaFixado: (id: string | null | undefined) => boolean;
  onAlternarFixado: (id: string) => void;
};

/** As opções de quando nada foi digitado: o que fazer, os fixados e o menu da pessoa. */
function opcoesIniciais(pessoa: PessoaNav, fixados: Atalho[]): Opcao[] {
  const fazer = acoesRapidas(pessoa).map((acao) => ({
    chave: `acao:${acao.id}`,
    secao: "Fazer",
    rotulo: acao.rotulo,
    contexto: "Ação rápida",
    href: acao.href,
    icone: acao.icone,
    destinoId: null,
  }));
  const presos = fixados.map((atalho) => ({
    chave: `fixado:${atalho.id}`,
    secao: "Fixados",
    rotulo: atalho.rotulo,
    contexto: atalho.contexto,
    href: atalho.href,
    icone: atalho.icone,
    destinoId: atalho.id,
  }));
  const menu = itensDoMenu(pessoa).flatMap((grupo) =>
    grupo.itens.map((item) => ({
      chave: `item:${item.id}`,
      secao: "Ir para",
      rotulo: item.rotulo,
      contexto: grupo.rotulo,
      href: item.href,
      icone: item.icone,
      // Fixar daqui prende a primeira tela que a pessoa abre no item.
      destinoId: item.abas[0]?.id ?? null,
    })),
  );
  return [...fazer, ...presos, ...menu];
}

export function BuscaRapida({ pessoa, aberta, onFechar, fixados, estaFixado, onAlternarFixado }: BuscaRapidaProps) {
  const navegar = useNavigate();
  const { session, isPreview } = useAuth();
  const [termo, setTermo] = useState("");
  const [ativo, setAtivo] = useState(0);
  const entradaRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);
  const idLista = useId();
  const idDica = useId();

  // Paciente pelo nome (29/09/2026): a partir de 3 letras, com uma pausa curta.
  const [termoPaciente, setTermoPaciente] = useState("");
  useEffect(() => {
    const espera = setTimeout(() => setTermoPaciente(termo.trim()), 250);
    return () => clearTimeout(espera);
  }, [termo]);
  const podeBuscarPaciente = Boolean(session && !isPreview && canCrmBratan(pessoa?.cargo) && pessoa?.cargo !== "limpeza");
  const pacientes = useQuery({
    queryKey: ["busca-paciente", termoPaciente],
    queryFn: () => buscarPacientes(termoPaciente),
    enabled: aberta && podeBuscarPaciente && termoPaciente.length >= 3 && !/^\d/.test(termoPaciente),
    staleTime: 60_000,
  });

  const opcoes: Opcao[] = useMemo(() => {
    if (!termo.trim()) return opcoesIniciais(pessoa, fixados);
    const achadas: Opcao[] = linhasDaBusca(termo, pessoa).map((linha) => ({
      ...linha,
      secao: linha.secao === "fazer" ? "Fazer" : "Telas",
    }));
    const deTerceiros =
      podeBuscarPaciente && termoPaciente.length >= 3
        ? (pacientes.data ?? []).map((paciente) => ({
            chave: `paciente:${paciente.ref}`,
            secao: "Pacientes",
            rotulo: paciente.nome || "Sem nome",
            contexto: "Abrir a ficha",
            href: `/crm/contatos/${encodeURIComponent(paciente.ref)}`,
            icone: "Contact" as NomeIcone,
            destinoId: null,
          }))
        : [];
    return [...achadas, ...deTerceiros];
  }, [termo, pessoa, fixados, podeBuscarPaciente, termoPaciente, pacientes.data]);

  // Abrir: guarda quem tinha o foco, limpa a busca, trava a rolagem da página.
  useEffect(() => {
    if (!aberta) return undefined;
    focoAnterior.current = document.activeElement as HTMLElement | null;
    setTermo("");
    setAtivo(0);
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => entradaRef.current?.focus(), 30);
    // Esc fecha mesmo com o foco fora do campo (depois de tocar num alfinete, por exemplo).
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && document.activeElement !== entradaRef.current) onFechar();
    };
    document.addEventListener("keydown", tecla);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = rolagem;
      focoAnterior.current?.focus?.();
    };
    // onFechar é estável (useCallback na casca); reabrir só quando `aberta` muda.
  }, [aberta]);

  useEffect(() => setAtivo(0), [termo]);

  // A opção marcada fica à vista quando a lista rola.
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-indice="${ativo}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  function abrir(opcao: Opcao | undefined) {
    if (!opcao) return;
    onFechar();
    prefetchRoute(opcao.href.split("?")[0]);
    navegar(opcao.href);
  }

  function aoTeclar(evento: React.KeyboardEvent) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (!opcoes.length) return;
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      setAtivo((atual) => (atual + passo + opcoes.length) % opcoes.length);
      return;
    }
    if (evento.key === "Enter") {
      evento.preventDefault();
      abrir(opcoes[ativo]);
      return;
    }
    if (evento.key === "Escape") {
      evento.preventDefault();
      onFechar();
      return;
    }
    if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "d") {
      // ⌘D seria "favoritar a página" no navegador; aqui fixa a tela marcada.
      evento.preventDefault();
      const id = opcoes[ativo]?.destinoId;
      if (id) onAlternarFixado(id);
      return;
    }
    if (evento.key === "Tab") {
      // A janela prende o foco: o Tab volta para a busca.
      evento.preventDefault();
      entradaRef.current?.focus();
    }
  }

  const marcada = opcoes[ativo];
  // As opções em seções (Fazer · Fixados · Ir para · Telas · Pacientes), com o índice de cada uma na lista toda.
  const secoes: { nome: string; itens: { opcao: Opcao; indice: number }[] }[] = [];
  opcoes.forEach((opcao, indice) => {
    const ultima = secoes[secoes.length - 1];
    if (ultima && ultima.nome === opcao.secao) ultima.itens.push({ opcao, indice });
    else secoes.push({ nome: opcao.secao, itens: [{ opcao, indice }] });
  });

  return (
    <AnimatePresence>
      {aberta ? (
        <motion.div
          key="busca"
          // z-[65] (revisão de 08/10/2026): acima do Balão do Dia (z-60), abaixo dos avisos rápidos (z-70).
          className="fixed inset-0 z-[65] bg-[var(--veu)] md:px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) onFechar();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Buscar paciente, conta, pedido ou ação"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            className={cn(
              "mx-auto flex flex-col overflow-hidden bg-folha font-sans text-tinta",
              "md:mt-[12vh] md:max-h-[72vh] md:w-full md:max-w-[640px] md:rounded-painel md:border md:border-fio md:shadow-flutua",
              "max-md:h-dvh max-md:w-full max-md:pt-[env(safe-area-inset-top)]",
            )}
          >
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-fio px-4">
              <Search className="h-5 w-5 shrink-0 text-tinta-2" strokeWidth={1.75} aria-hidden="true" />
              <input
                ref={entradaRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={idLista}
                aria-autocomplete="list"
                aria-activedescendant={marcada ? `${idLista}-${ativo}` : undefined}
                aria-describedby={idDica}
                value={termo}
                onChange={(evento) => setTermo(evento.target.value)}
                onKeyDown={aoTeclar}
                placeholder="Buscar paciente, conta, pedido ou ação"
                aria-label="Buscar paciente, conta, pedido ou ação"
                autoComplete="off"
                spellCheck={false}
                className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-medium text-tinta outline-none placeholder:text-tinta-2"
              />
              <kbd className="hidden h-5 items-center rounded-controle border border-b-2 border-fio-2 bg-papel px-1.5 font-sans text-xs font-bold leading-none text-tinta-2 md:inline-flex">
                Esc
              </kbd>
              <button
                type="button"
                onClick={onFechar}
                aria-label="Fechar a busca"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-controle text-tinta-2 hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco md:hidden"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div ref={listaRef} id={idLista} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto p-2">
              {secoes.map((secao, numero) => (
                <div key={secao.nome} role="group" aria-labelledby={`${idLista}-secao-${numero}`}>
                  <p id={`${idLista}-secao-${numero}`} className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-[0.08em] text-tinta-2">
                    {secao.nome}
                  </p>
                  {secao.itens.map(({ opcao, indice }) => {
                    const ehAtiva = indice === ativo;
                    const presa = estaFixado(opcao.destinoId);
                    return (
                      <div
                        key={opcao.chave}
                        id={`${idLista}-${indice}`}
                        role="option"
                        aria-selected={ehAtiva}
                        data-indice={indice}
                        onMouseMove={() => (ehAtiva ? undefined : setAtivo(indice))}
                        onClick={() => abrir(opcao)}
                        className={cn(
                          "group flex min-h-11 cursor-pointer items-center gap-3 rounded-controle px-3 py-2 text-tinta",
                          ehAtiva && "bg-musgo-claro",
                        )}
                      >
                        <Icone nome={opcao.icone} className={cn("h-4 w-4 shrink-0", ehAtiva ? "text-musgo" : "text-tinta-2")} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{opcao.rotulo}</span>
                        <span className="hidden max-w-[40%] truncate text-[13px] font-medium text-tinta-2 sm:block">{opcao.contexto}</span>
                        {opcao.destinoId ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden="true"
                            title={presa ? "Soltar dos fixados (⌘D)" : "Fixar no menu (⌘D)"}
                            onClick={(evento) => {
                              evento.stopPropagation();
                              onAlternarFixado(opcao.destinoId as string);
                            }}
                            className={cn(
                              "grid h-8 w-8 shrink-0 place-items-center rounded-controle transition-opacity duration-150 hover:bg-folha",
                              presa ? "text-musgo opacity-100" : "text-tinta-2 opacity-0 group-hover:opacity-100 max-md:opacity-100",
                              ehAtiva && "opacity-100",
                            )}
                          >
                            <Pin className={cn("h-4 w-4", presa && "fill-current")} />
                          </button>
                        ) : (
                          // Mesmo espaço do alfinete, para o "de onde vem" alinhar em todas as linhas.
                          <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {!opcoes.length ? (
                <p className="px-3 py-10 text-center text-sm font-medium text-tinta-2">
                  Nada encontrado para “{termo.trim()}”. Tente o nome de uma tela, como “contas”, ou um valor, como “1250”.
                </p>
              ) : null}
            </div>

            <p id={idDica} className="hidden shrink-0 items-center gap-4 border-t border-fio px-4 py-2.5 text-xs font-semibold text-tinta-2 md:flex">
              <span>↑ ↓ andam</span>
              <span>Enter abre</span>
              <span>⌘D fixa ou solta a tela</span>
              <span>Esc fecha</span>
              {marcada?.destinoId ? (
                <span className="ml-auto truncate">{estaFixado(marcada.destinoId) ? "Fixada no menu" : "Dá para fixar"}</span>
              ) : null}
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
