// O TOPO DA CASCA (08/10/2026, imagens 01, 03 e 05).
//
// Computador: o caminho (Grupo › Item, lido do mapa; num detalhe ou no 360,
// mais o detalhe ou o seletor da seção — revisão de 08/10/2026), o alfinete para
// fixar a tela, a busca que diz o que procura (abre o ⌘K), a data em itálico
// (menos no Início, onde o título já é a data), o sino de Avisos e a ajuda (?)
// que abre o guia "Como usar" da tela. Substitui o "Hub operacional interno",
// os selos de cargo e o botão "Fluxos" da casca antiga.
// Celular: só o brasão e o nome da tela; o caminho repetiria a barra de baixo.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, ChevronRight, CircleHelp, Pin } from "lucide-react";
import { CampoBusca } from "@/components/ui/campo-busca";
import { Contador } from "@/components/ui/contador";
import type { Caminho } from "@/lib/navegacao";
import { cn } from "@/lib/utils";
import { abaAtiva, dataPorExtenso, mostraSeletorNoCaminho, nivelDoCaminho, pedacosDoCaminho, rotuloDoContador, tituloDaTela } from "./casca";
import { Brasao } from "./Marca";
import { aquecer } from "./MenuLateral";

const BOTAO_ICONE = cn(
  "relative inline-grid h-9 w-9 shrink-0 place-items-center rounded-controle text-tinta-2 transition-colors duration-150 ease-papel",
  "hover:bg-saber hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
  "max-md:h-11 max-md:w-11",
);

function SeletorDaSecao({ caminho }: { caminho: Caminho }) {
  const navegar = useNavigate();
  const ativa = abaAtiva(caminho);
  return (
    <label className="relative inline-flex min-w-0 max-w-full items-center">
      <span className="sr-only">Seção de {caminho.item.rotulo}</span>
      <select
        value={ativa?.href ?? ""}
        onChange={(evento) => navegar(evento.target.value)}
        aria-current="page"
        title={ativa?.rotulo}
        className={cn(
          "h-8 min-w-0 max-w-full cursor-pointer appearance-none truncate rounded-controle border border-fio-2 bg-folha pl-2.5 pr-8 font-sans text-sm font-bold text-tinta",
          "hover:border-borda-campo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco",
        )}
      >
        {!ativa ? <option value="">Escolha a seção</option> : null}
        {caminho.abas.map((aba) => (
          <option key={aba.id} value={aba.href}>
            {aba.rotulo}
          </option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-2 h-3.5 w-3.5 rotate-90 text-tinta-2" aria-hidden="true" />
    </label>
  );
}

/**
 * O caminho do topo e o alfinete. Revisão de 08/10/2026: entre 768 e 1280 px
 * as palavras se sobrepunham (o <li> encolhia e o link, sem corte, vazava por
 * cima do vizinho). Agora:
 *  · uma cópia invisível mede a largura natural de cada peça e nivelDoCaminho
 *    decide o que cabe — tira o grupo primeiro (o menu já mostra o grupo
 *    aberto), depois o item; o lugar atual e o seletor do 360 ficam;
 *  · cada peça corta o próprio texto com reticências (rede de segurança), e o
 *    seletor do 360 não fica menor que 120 px enquanto houver espaço.
 */
function CaminhoDoTopo({ caminho, children }: { caminho: Caminho | null; children?: ReactNode }) {
  const pedacos = pedacosDoCaminho(caminho);
  const comSeletor = mostraSeletorNoCaminho(caminho);
  const visiveis = comSeletor ? pedacos.slice(0, 2) : pedacos;
  // As peças como o nivelDoCaminho as conta: no 360, a última é o seletor.
  const ativa = comSeletor ? abaAtiva(caminho) : null;
  const pecas = comSeletor ? [...visiveis.map((pedaco) => pedaco.rotulo), ativa?.rotulo ?? "Escolha a seção"] : visiveis.map((pedaco) => pedaco.rotulo);
  const chave = pecas.join("›");

  const areaRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const medidaRef = useRef<HTMLOListElement>(null);
  const [nivel, setNivel] = useState<0 | 1 | 2>(0);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const medida = medidaRef.current;
    if (!area || !medida) return undefined;
    const avaliar = () => {
      // O que sobra para o caminho: a área inteira menos o alfinete (e o vão até ele).
      const outros = Array.from(area.children)
        .filter((filho) => filho !== navRef.current && filho !== medida)
        .reduce((total, filho) => total + filho.getBoundingClientRect().width + 4, 0);
      const disponivel = area.clientWidth - outros;
      const larguras = Array.from(medida.children).map((filho) => filho.getBoundingClientRect().width);
      setNivel(nivelDoCaminho(larguras, disponivel));
    };
    avaliar();
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(avaliar);
    observador?.observe(area);
    // A Manrope chega depois do primeiro desenho: mede de novo quando ela chegar.
    void document.fonts?.ready.then(avaliar);
    return () => observador?.disconnect();
  }, [chave]);

  if (!pedacos.length) return <div ref={areaRef} className="hidden min-w-0 flex-1 md:flex" />;
  const total = pecas.length;
  // Índice da primeira peça que aparece (0, 1 ou só a última).
  const primeira = nivel === 0 ? 0 : nivel === 1 ? 1 : total - 1;

  return (
    <div ref={areaRef} className="relative hidden min-w-0 flex-1 items-center gap-1 md:flex">
      {/* O -m-1 p-1 deixa o anel de foco caber dentro do corte de segurança. */}
      <nav ref={navRef} aria-label="Você está em" className="-m-1 min-w-0 overflow-hidden p-1">
        <ol className="flex min-w-0 items-center gap-2 whitespace-nowrap font-sans text-sm font-medium leading-5 text-tinta-2">
          {visiveis.map((pedaco, indice) => {
            const ultimo = indice === visiveis.length - 1 && !comSeletor;
            const ehGrupo = indice === 0;
            return (
              <li
                key={`${pedaco.rotulo}-${indice}`}
                className={cn(
                  "flex min-w-0 items-center gap-2",
                  // Pesos >= 1: com a soma abaixo de 1 o flexbox só reparte parte da falta (e a peça vazava).
                  ultimo ? "shrink" : ehGrupo ? "shrink-[8]" : "shrink-[2]",
                  indice < primeira && "hidden",
                )}
              >
                {indice > primeira ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fio-2" aria-hidden="true" /> : null}
                {pedaco.href && !ultimo ? (
                  <Link
                    to={pedaco.href}
                    {...aquecer(pedaco.href)}
                    title={pedaco.rotulo}
                    className="min-w-0 truncate rounded-sm underline-offset-[3px] hover:text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
                  >
                    {pedaco.rotulo}
                  </Link>
                ) : (
                  <span aria-current={ultimo ? "page" : undefined} title={pedaco.rotulo} className={cn("min-w-0 truncate", ultimo && "font-bold text-tinta")}>
                    {pedaco.rotulo}
                  </span>
                )}
              </li>
            );
          })}
          {comSeletor && caminho ? (
            <li className={cn("flex min-w-0 shrink items-center gap-2", primeira < total - 1 && "min-w-[120px]")}>
              {total - 1 > primeira ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fio-2" aria-hidden="true" /> : null}
              <SeletorDaSecao caminho={caminho} />
            </li>
          ) : null}
        </ol>
      </nav>
      {children}
      {/* A régua: as mesmas peças, invisíveis e sem encolher, só para medir. */}
      <ol
        ref={medidaRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-center gap-2 whitespace-nowrap font-sans text-sm font-medium leading-5"
      >
        {pecas.map((rotulo, indice) => {
          const ehSeletor = comSeletor && indice === total - 1;
          const ehUltimo = indice === total - 1;
          return (
            <li key={`${rotulo}-${indice}`} className="flex items-center gap-2">
              {indice > 0 ? <span className="inline-block h-3.5 w-3.5" /> : null}
              {ehSeletor ? (
                <span className="inline-flex h-8 items-center rounded-controle border pl-2.5 pr-8 font-bold">{rotulo}</span>
              ) : (
                <span className={cn(ehUltimo && "font-bold")}>{rotulo}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type TopoProps = {
  caminho: Caminho | null;
  /** Início: o título já é a data, então ela sai do topo. */
  ehInicio: boolean;
  onAbrirBusca: () => void;
  avisos: number;
  temGuia: boolean;
  onAbrirGuia: () => void;
  /** O alfinete: a tela aberta pode ser fixada (null = endereço que não dá para fixar). */
  fixar: { rotulo: string; fixado: boolean; onAlternar: () => void } | null;
};

export function Topo({ caminho, ehInicio, onAbrirBusca, avisos, temGuia, onAbrirGuia, fixar }: TopoProps) {
  const hoje = dataPorExtenso(new Date());
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-fio bg-papel pt-[env(safe-area-inset-top)]",
      )}
    >
      {/* 56 px COM a borda, como o --topo-altura da proposta (revisão de 08/10/2026: eram 57). */}
      <div className="flex h-[55px] items-center gap-4 px-[var(--conteudo-lado)] max-md:h-12 max-md:gap-3">
        {/* Celular: brasão + nome da tela (imagem 05). */}
        <Link to="/" {...aquecer("/")} aria-label="Instituto Bratan, ir para o Início" className="shrink-0 rounded-controle focus-visible:outline focus-visible:outline-2 focus-visible:outline-foco md:hidden">
          <Brasao className="h-7 w-[26px]" />
        </Link>
        {/* 14 px, peso 700: o .caminho [aria-current] da proposta (revisão de 08/10/2026). */}
        <p className="min-w-0 truncate font-sans text-sm font-bold text-tinta md:hidden">{tituloDaTela(caminho)}</p>

        {/* Computador: caminho + alfinete (a área ocupa o que a busca deixa livre). */}
        <CaminhoDoTopo caminho={caminho}>
          {fixar ? (
            <button
              type="button"
              onClick={fixar.onAlternar}
              aria-pressed={fixar.fixado}
              aria-label={fixar.fixado ? `Soltar ${fixar.rotulo} dos fixados` : `Fixar ${fixar.rotulo} no menu`}
              title={fixar.fixado ? "Soltar dos fixados" : "Fixar no menu (⌘D na busca também fixa)"}
              className={cn(BOTAO_ICONE, "ml-1 h-8 w-8", fixar.fixado && "text-musgo")}
            >
              <Pin className={cn("h-4 w-4", fixar.fixado && "fill-current")} aria-hidden="true" />
            </button>
          ) : null}
        </CaminhoDoTopo>

        <div className="ml-auto flex shrink-0 items-center gap-2 max-md:-mr-3 max-md:gap-0">
          <CampoBusca
            onAbrir={onAbrirBusca}
            mostrarTecla
            className="hidden h-9 w-[clamp(220px,28vw,380px)] md:flex max-[1199px]:w-[clamp(220px,36vw,380px)]"
          />
          {!ehInicio ? (
            <span className="mr-2 hidden whitespace-nowrap font-serifa text-base italic text-tinta-2 min-[1100px]:inline">{hoje}</span>
          ) : null}
          <Link to="/avisos" {...aquecer("/avisos")} aria-label={avisos ? `Avisos: ${rotuloDoContador("avisos", avisos)}` : "Avisos: nada novo"} className={BOTAO_ICONE}>
            <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            {avisos ? (
              <Contador
                valor={avisos}
                className="absolute -right-0.5 top-0 shadow-[0_0_0_2px_rgb(var(--papel-rgb))] max-md:right-1 max-md:top-1"
              />
            ) : null}
          </Link>
          {temGuia ? (
            <button type="button" onClick={onAbrirGuia} aria-label="Como usar esta tela" className={BOTAO_ICONE}>
              <CircleHelp className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
