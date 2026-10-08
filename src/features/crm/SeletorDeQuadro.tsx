// O SELETOR DE QUADRO DO KANBAN (08/10/2026, redesenho etapa 3 — imagem 04 e
// comercial.src.html aprovados pelo Lucas).
//
// Antes: uma fileira de pílulas que rolava de lado (Plano · Em aberto ·
// Repescagens · uma por cadência · "Outras cadências…" num select), com setas
// para empurrar a fileira. Agora o NOME do quadro é o título da página e um
// botão "Trocar quadro" abre esta lista, ordenada por urgência: os quadros
// fixos, as cadências com toque hoje (ou atrasado), as que têm gente e as que
// estão vazias. Os mesmos quadros de antes e a mesma troca (o ?quadro= do
// endereço continua valendo); muda só a forma de escolher.
// Teclado: ↑/↓ escolhem, Enter abre, Esc fecha (o foco volta ao botão).
import * as React from "react";
import { ArrowRight, ChevronsUpDown, Search } from "lucide-react";
import { Botao } from "@/components/ui/fundacao";
import { cn } from "@/lib/utils";

export type OpcaoDoQuadro = {
  chave: string;
  rotulo: string;
  /** Nome completo (vai no title e entra na busca). */
  nomeCompleto?: string;
  /** "5 hoje", "9 ativos", "0". */
  numero?: string;
  /** Número em destaque (negrito) antes do texto do número. */
  destaque?: number;
  /** Atrasados: aparece em laranja ao lado. */
  atrasados?: number;
};

export type SecaoDoSeletor = { titulo: string; resumo?: string; opcoes: OpcaoDoQuadro[] };

function normaliza(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function SeletorDeQuadro({
  secoes,
  atual,
  onEscolher,
  aberto,
  onAbertoChange,
  rotulo = "Trocar quadro",
}: {
  secoes: SecaoDoSeletor[];
  atual: string;
  onEscolher: (chave: string) => void;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  rotulo?: string;
}) {
  const [busca, setBusca] = React.useState("");
  const [indice, setIndice] = React.useState(0);
  const raizRef = React.useRef<HTMLSpanElement>(null);
  const botaoRef = React.useRef<HTMLButtonElement>(null);
  const buscaRef = React.useRef<HTMLInputElement>(null);
  const idLista = React.useId();

  const filtradas = React.useMemo(() => {
    const termo = normaliza(busca.trim());
    return secoes
      .map((secao) => ({
        ...secao,
        opcoes: termo ? secao.opcoes.filter((opcao) => normaliza(`${opcao.rotulo} ${opcao.nomeCompleto ?? ""}`).includes(termo)) : secao.opcoes,
      }))
      .filter((secao) => secao.opcoes.length > 0);
  }, [secoes, busca]);
  const planas = React.useMemo(() => filtradas.flatMap((secao) => secao.opcoes), [filtradas]);

  const fechar = React.useCallback(
    (devolverFoco = true) => {
      onAbertoChange(false);
      setBusca("");
      if (devolverFoco) window.setTimeout(() => botaoRef.current?.focus(), 0);
    },
    [onAbertoChange],
  );

  React.useEffect(() => {
    if (!aberto) return;
    const atualIndice = planas.findIndex((opcao) => opcao.chave === atual);
    setIndice(atualIndice >= 0 ? atualIndice : 0);
    window.setTimeout(() => buscaRef.current?.focus(), 0);
    function foraDaCaixa(evento: PointerEvent) {
      if (!raizRef.current?.contains(evento.target as Node)) fechar(false);
    }
    window.addEventListener("pointerdown", foraDaCaixa);
    return () => window.removeEventListener("pointerdown", foraDaCaixa);
    // Só quando abre: a busca reordena sem roubar a escolha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  React.useEffect(() => {
    if (indice >= planas.length) setIndice(Math.max(0, planas.length - 1));
  }, [planas.length, indice]);

  function escolher(chave: string) {
    onEscolher(chave);
    fechar();
  }

  function aoTeclar(evento: React.KeyboardEvent) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      fechar();
    } else if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setIndice((atualIndice) => (planas.length ? (atualIndice + 1) % planas.length : 0));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setIndice((atualIndice) => (planas.length ? (atualIndice - 1 + planas.length) % planas.length : 0));
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      const opcao = planas[indice];
      if (opcao) escolher(opcao.chave);
    }
  }

  let contador = -1;
  return (
    <span ref={raizRef} className="relative inline-flex align-middle">
      <Botao
        ref={botaoRef}
        variante="secundario"
        tamanho="pq"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        icone={<ChevronsUpDown className="h-4 w-4 text-tinta-2" aria-hidden="true" />}
        onClick={() => (aberto ? fechar() : onAbertoChange(true))}
        className={cn(aberto && "border-musgo shadow-[inset_0_0_0_1px_rgb(var(--musgo-rgb))]")}
      >
        {rotulo}
      </Botao>
      {aberto ? (
        <div
          role="dialog"
          aria-label={rotulo}
          onKeyDown={aoTeclar}
          className="absolute left-0 top-[calc(100%+8px)] z-40 grid w-[min(392px,calc(100vw-32px))] rounded-painel border border-fio bg-folha p-2 font-sans text-tinta shadow-flutua max-sm:fixed max-sm:inset-x-4 max-sm:top-24 max-sm:w-auto"
        >
          <label className="mb-1 flex h-10 items-center gap-2 border-b border-fio pl-3 pr-2 text-sm font-medium text-tinta-2">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Buscar quadro</span>
            <input
              ref={buscaRef}
              value={busca}
              onChange={(evento) => {
                setBusca(evento.target.value);
                setIndice(0);
              }}
              placeholder="Buscar cadência ou quadro"
              role="combobox"
              aria-expanded="true"
              aria-controls={idLista}
              aria-activedescendant={planas[indice] ? `${idLista}-${planas[indice].chave}` : undefined}
              className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-tinta outline-none placeholder:text-tinta-2"
            />
            <kbd className="inline-flex h-5 shrink-0 items-center rounded-controle border border-b-2 border-fio-2 bg-papel px-1.5 font-sans text-xs font-bold leading-none text-tinta-2">esc</kbd>
          </label>
          <div id={idLista} role="listbox" aria-label="Quadros" className="max-h-[min(60vh,440px)] overflow-y-auto">
            {filtradas.length ? (
              filtradas.map((secao) => (
                <div key={secao.titulo} role="group" aria-label={secao.titulo}>
                  <p className="flex items-baseline justify-between gap-2 px-3 pb-1 pt-3 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
                    {secao.titulo}
                    {secao.resumo ? <span className="font-semibold normal-case tracking-normal">{secao.resumo}</span> : null}
                  </p>
                  {secao.opcoes.map((opcao) => {
                    contador += 1;
                    const minhaVez = contador;
                    const ativa = minhaVez === indice;
                    const ehAtual = opcao.chave === atual;
                    return (
                      <button
                        key={opcao.chave}
                        id={`${idLista}-${opcao.chave}`}
                        type="button"
                        role="option"
                        aria-selected={ehAtual}
                        title={opcao.nomeCompleto ?? opcao.rotulo}
                        onMouseEnter={() => setIndice(minhaVez)}
                        onClick={() => escolher(opcao.chave)}
                        className={cn(
                          "relative flex h-9 w-full items-center gap-2 rounded-controle px-3 text-left text-sm leading-5",
                          ehAtual ? "font-extrabold" : "font-semibold",
                          ativa && "bg-saber",
                          ehAtual && "before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:bg-ouro-fio before:content-['']",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{opcao.rotulo}</span>
                        {opcao.atrasados ? (
                          <span className="whitespace-nowrap text-[13px] font-bold tabular-nums text-atencao">{opcao.atrasados} atrasado{opcao.atrasados > 1 ? "s" : ""}</span>
                        ) : null}
                        {opcao.numero ? (
                          <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-tinta-2">
                            {opcao.destaque !== undefined ? <b className="font-extrabold text-tinta">{opcao.destaque} </b> : null}
                            {opcao.numero}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm font-medium text-tinta-2">Nenhum quadro com esse nome.</p>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-fio px-3 pb-1 pt-3 text-xs font-medium leading-4 text-tinta-2 max-md:hidden">
            <span>↑ ↓ escolher</span>
            <span aria-hidden="true">·</span>
            <span>Enter abre</span>
            <span aria-hidden="true">·</span>
            <span>Esc fecha</span>
          </p>
        </div>
      ) : null}
    </span>
  );
}

/**
 * "Mais 7 toques hoje em outras 4 cadências →" — abre o seletor. Fora de um
 * quadro de cadência (Plano, Em aberto, Repescagens) não há "outras": a frase
 * vira "7 toques para hoje em 4 cadências →".
 */
export function LinkOutrasCadencias({
  toques,
  cadencias,
  outras = true,
  onAbrir,
}: {
  toques: number;
  cadencias: number;
  outras?: boolean;
  onAbrir: () => void;
}) {
  if (!toques || !cadencias) return null;
  const nToques = `${toques} ${toques === 1 ? "toque" : "toques"}`;
  const texto = outras
    ? `Mais ${nToques} hoje em ${cadencias === 1 ? "outra cadência" : `outras ${cadencias} cadências`}`
    : `${nToques} para hoje em ${cadencias === 1 ? "uma cadência" : `${cadencias} cadências`}`;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group inline-flex items-center gap-1 whitespace-nowrap rounded-sm font-sans text-sm font-bold leading-5 text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      {texto}
      <ArrowRight className="h-4 w-4 transition-transform duration-150 ease-papel group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}
