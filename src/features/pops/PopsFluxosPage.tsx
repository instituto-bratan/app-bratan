// POPs & FLUXOS — redesenho "Papel & Musgo", etapa 4 (08/10/2026).
//
// A tela é um catálogo dos arquivos de public/fluxogramas (popsData.ts). O que
// ela FAZ não mudou: a mesma busca (sem acento, em título, setor, responsável,
// categoria, resumo, etapas, tarefas e palavras-chave), o mesmo filtro por
// setor, o mesmo quadro do setor escolhido (foco, responsáveis e tarefas do
// dia) e o mesmo "Abrir fluxograma / Abrir POP" em outra aba.
// Mudou a forma (guia aprovado, seção "Um componente para as 60 telas", exemplo
// "Simples · Equipe"): um Cabecalho com a frase do número; a busca e os setores
// como leituras em texto; o setor escolhido num bloco "saber"; e os documentos
// como LISTA numa folha por setor — itens do mesmo tipo, nunca em cartões. Saíram
// o vidro (backdrop-blur, LiquidButton), a animação de entrada e as cores com
// opacidade que não geravam CSS.
import { useId, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, SearchX } from "lucide-react";
import { BlocoFolha, BlocoSaber, Botao, Cabecalho, CampoBusca } from "@/components/ui/fundacao";
import { Leitura, LinkSetaExterno } from "@/features/compras/pecas";
import { cn } from "@/lib/utils";
import {
  contarPorArea,
  documentsByArea,
  ehPdf,
  filtrarDocumentos,
  fluxogramas,
  popsAreas,
  totalPopsTasks,
  type FiltroDeArea,
  type FluxogramaDocumento,
  type PopsArea,
} from "./popsData";
import { EstadoVazio, FAIXA_DAS_LEITURAS, Rubrica, TituloDaSecao } from "./pecasDaEquipe";

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

export function PopsFluxosPage() {
  const [query, setQuery] = useState("");
  const [selectedArea, setSelectedArea] = useState<FiltroDeArea>("todos");
  const activeArea = selectedArea === "todos" ? null : popsAreas.find((area) => area.id === selectedArea) ?? null;
  const buscando = query.trim().length > 0;

  const filteredDocs = useMemo(() => filtrarDocumentos(fluxogramas, query, selectedArea), [query, selectedArea]);
  const contagem = useMemo(() => contarPorArea(fluxogramas, query), [query]);

  // As áreas com documento achado, na ordem do catálogo (área vazia não aparece).
  const areasWithDocs = useMemo(
    () =>
      popsAreas
        .map((area) => ({ ...area, documentos: filteredDocs.filter((documento) => documento.areaId === area.id) }))
        .filter((area) => area.documentos.length > 0),
    [filteredDocs],
  );

  const verTodos = () => {
    setQuery("");
    setSelectedArea("todos");
  };

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-8 font-sans text-tinta max-md:gap-6">
      <Cabecalho
        className="mb-0 max-md:mb-0"
        sobrancelha="Equipe"
        titulo="POPs & Fluxos"
        frase={
          <>
            <strong>{plural(fluxogramas.length, "documento", "documentos")}</strong> em {plural(popsAreas.length, "área", "áreas")}. Abra o do seu
            setor antes de começar uma tarefa nova.
          </>
        }
      />

      <div className="grid gap-3">
        <CampoBusca
          rotulo="Buscar nos POPs e fluxos"
          placeholder="Buscar por setor, tarefa, documento ou palavra-chave"
          valor={query}
          onMudar={setQuery}
          className="max-w-[560px] max-md:h-11 max-md:max-w-none"
        />
        <div role="group" aria-label="Mostrar documentos do setor" className={FAIXA_DAS_LEITURAS}>
          <Leitura ativa={selectedArea === "todos"} rotulo="Todos" numero={contagem.todos} onClick={() => setSelectedArea("todos")} />
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-fio-2" />
          {popsAreas.map((area) => (
            <Leitura
              key={area.id}
              ativa={selectedArea === area.id}
              rotulo={area.label}
              numero={contagem[area.id]}
              onClick={() => setSelectedArea(selectedArea === area.id ? "todos" : area.id)}
            />
          ))}
        </div>
        {!activeArea ? (
          <p className="text-[13px] font-medium leading-5 text-tinta-2">
            Escolha um setor para ver o foco, os responsáveis e as tarefas do dia dele ({plural(totalPopsTasks, "tarefa", "tarefas")} nos{" "}
            {popsAreas.length} setores).
          </p>
        ) : null}
      </div>

      {activeArea ? <SetorEscolhido area={activeArea} /> : null}

      {areasWithDocs.map((area) => (
        <section key={area.id} aria-labelledby={`pops-area-${area.id}`} className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <TituloDaSecao id={`pops-area-${area.id}`} contagem={plural(area.documentos.length, "documento", "documentos")}>
              {area.label}
            </TituloDaSecao>
            <p className="text-[13px] font-medium leading-5 text-tinta-2">{area.descricao}</p>
          </div>
          <BlocoFolha as="div">
            <ul>
              {area.documentos.map((documento) => (
                <LinhaDoDocumento key={documento.id} documento={documento} buscando={buscando} />
              ))}
            </ul>
          </BlocoFolha>
        </section>
      ))}

      {filteredDocs.length === 0 ? (
        <BlocoFolha as="section" aria-label="Nenhum documento encontrado">
          <EstadoVazio
            icone={<SearchX aria-hidden="true" />}
            titulo="Nenhum fluxograma encontrado."
            acao={
              <Botao variante="secundario" onClick={verTodos} className="max-md:h-11">
                Ver todos os documentos
              </Botao>
            }
          >
            {buscando ? <>Nada com “{query.trim()}”{activeArea ? ` em ${activeArea.label}` : ""}. </> : null}
            Ajuste a busca ou escolha outro setor.
          </EstadoVazio>
        </BlocoFolha>
      ) : null}
    </div>
  );
}

/** O setor escolhido: para saber (foco, responsáveis e as tarefas do dia dele). */
function SetorEscolhido({ area }: { area: PopsArea }) {
  const total = documentsByArea(area.id).length;
  return (
    <BlocoSaber
      as="section"
      aria-labelledby="pops-setor-escolhido"
      className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <div className="grid content-start gap-3">
        <Rubrica as="p">Setor escolhido · {plural(total, "documento", "documentos")}</Rubrica>
        <h2 id="pops-setor-escolhido" className="text-xl font-bold leading-7 text-tinta">
          {area.label}
        </h2>
        <p className="max-w-[60ch] text-sm font-medium leading-6 text-tinta-2">{area.foco}</p>
        <div className="mt-2 grid gap-1">
          <Rubrica as="p">Responsáveis</Rubrica>
          <p className="text-sm font-semibold leading-6 text-tinta">{area.responsaveis.join(" · ")}</p>
        </div>
      </div>
      <div className="grid content-start gap-2">
        <Rubrica as="h3">Tarefas do setor · {area.tarefasDoDia.length}</Rubrica>
        <ol className="grid">
          {area.tarefasDoDia.map((tarefa, indice) => (
            <li
              key={tarefa}
              className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 border-t border-fio py-2 text-sm font-medium leading-6 text-tinta first:border-t-0 first:pt-0"
            >
              <span className="font-bold tabular-nums text-tinta-2">{indice + 1}</span>
              <span>{tarefa}</span>
            </li>
          ))}
        </ol>
      </div>
    </BlocoSaber>
  );
}

/**
 * Um documento na lista: a miniatura (só enfeite: o link de verdade é o "Abrir"),
 * o título, quem cuida, o resumo, as etapas em trilha e as tarefas tiradas dele.
 * 13/10/2026: as tarefas começam ABERTAS (como antes do redesenho); o botão só
 * recolhe. Com busca ficam sempre abertas (a palavra pode estar numa delas).
 */
function LinhaDoDocumento({ documento, buscando }: { documento: FluxogramaDocumento; buscando: boolean }) {
  const [alternado, setAlternado] = useState(false);
  const aberto = buscando || !alternado;
  const idTarefas = useId();
  const pdf = ehPdf(documento);
  const n = documento.tarefasSugeridas.length;

  return (
    <li
      className={cn(
        "grid grid-cols-[120px_minmax(0,1fr)_auto] items-start gap-x-6 gap-y-3 border-t border-fio px-6 py-5 first:border-t-0",
        // No celular a miniatura sai (o link de verdade é o "Abrir") e o texto ocupa a largura toda.
        "max-lg:grid-cols-[96px_minmax(0,1fr)] max-md:grid-cols-1 max-md:gap-y-2 max-md:px-4 max-md:py-4",
      )}
    >
      <a
        href={documento.assetPath}
        target="_blank"
        rel="noreferrer"
        tabIndex={-1}
        aria-hidden="true"
        className="block aspect-[10/7] overflow-hidden rounded-controle border border-fio bg-papel max-md:hidden"
      >
        {pdf ? (
          <span className="grid h-full w-full place-items-center content-center gap-1 text-tinta-2">
            <FileText className="h-6 w-6 stroke-oliva" aria-hidden="true" />
            <span className="text-xs font-bold leading-4">PDF</span>
          </span>
        ) : (
          <img src={documento.assetPath} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
        )}
      </a>

      <div className="min-w-0">
        <h3 className="text-base font-bold leading-6 text-tinta [text-wrap:balance]">{documento.titulo}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] font-medium leading-5 text-tinta-2">
          <span>{documento.categoria}</span>
          <span aria-hidden="true" className="text-fio-2">
            ·
          </span>
          <span>{documento.setor}</span>
          <span aria-hidden="true" className="text-fio-2">
            ·
          </span>
          <span>{documento.responsavel}</span>
        </p>
        <p className="mt-2 max-w-[72ch] text-sm font-medium leading-6 text-tinta-2 [text-wrap:pretty]">{documento.resumo}</p>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[13px] font-bold leading-5 text-tinta">Etapas</span>
          <ol aria-label="Etapas principais" className="flex flex-wrap items-center gap-x-1 gap-y-1">
            {documento.etapas.map((etapa, indice) => (
              <li key={etapa} className="inline-flex items-center gap-1 text-[13px] font-semibold leading-5 text-tinta-2">
                {indice > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 stroke-oliva" aria-hidden="true" /> : null}
                {etapa}
              </li>
            ))}
          </ol>
        </div>

        {n > 0 ? (
          <>
            <button
              type="button"
              aria-expanded={aberto}
              aria-controls={idTarefas}
              onClick={() => setAlternado((valor) => !valor)}
              className="mt-3 inline-flex min-h-8 items-center gap-1 rounded-sm text-left text-[13px] font-bold leading-5 text-musgo underline-offset-[3px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco max-md:min-h-11"
            >
              {aberto ? "Esconder" : "Ver"} as {plural(n, "tarefa tirada", "tarefas tiradas")} deste documento
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-150 ease-papel", aberto && "rotate-180")} aria-hidden="true" />
            </button>
            {aberto ? (
              <ul id={idTarefas} className="mt-2 grid gap-1.5 border-l-2 border-fio-2 pl-4">
                {documento.tarefasSugeridas.map((tarefa) => (
                  <li key={tarefa} className="text-sm font-medium leading-6 text-tinta">
                    {tarefa}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="grid justify-items-end gap-1 max-lg:col-start-2 max-lg:justify-items-start max-md:col-start-1 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3">
        <LinkSetaExterno href={documento.assetPath} className="max-md:min-h-11">
          {pdf ? "Abrir POP" : "Abrir fluxograma"}
        </LinkSetaExterno>
        <span className="text-xs font-medium leading-4 text-tinta-2">{pdf ? "PDF anexado" : "PNG anexado"}</span>
      </div>
    </li>
  );
}
