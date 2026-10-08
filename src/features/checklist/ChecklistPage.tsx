// TAREFAS DO DIA — a aba "Tarefas" do Início › Hoje.
//
// Execução diária filtrada pelo setor do colaborador (regra do Lucas de
// 09/07/2026: cada um vê e adiciona APENAS as tarefas do próprio setor).
//
// REDESENHO "PAPEL & MUSGO", ETAPA 2 (08/10/2026): um cabeçalho só (com a
// frase que diz quantas faltam), a lista de cada grupo numa folha (decidir =
// marcar), e o resumo do dia num bloco "saber" à direita. Sai o anel animado,
// o vidro e os emojis das opções: a rotina e a tarefa "até concluir" ganham
// etiqueta escrita (marcaDaTarefa). O que a tela faz não muda: marcar e
// desmarcar, criar tarefa (só hoje · até concluir · rotina), reiniciar
// (coordenação), as mesmas consultas e os mesmos textos.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, RotateCcw } from "lucide-react";
import { BlocoFolha, BlocoSaber } from "@/components/ui/blocos";
import { Botao } from "@/components/ui/botao";
import { Cabecalho } from "@/components/ui/cabecalho";
import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { formatLongDate, formatShortTime, readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { createRemoteChecklistItem, createRemoteChecklistTask, listRemoteChecklistItems, resetRemoteChecklistRun, updateRemoteChecklistItem, type ChecklistTaskKind } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import {
  checklistGroupsForCargo,
  checklistStorageKey,
  checklistSummary,
  createChecklistRun,
  filterChecklistItemsByCargo,
  marcaDaTarefa,
  type ChecklistItem,
} from "./checklistData";

/** Campo de formulário com os tokens novos (40 px, borda de campo 3:1, foco em anel musgo). */
const CAMPO =
  "h-10 w-full min-w-0 rounded-controle border border-borda-campo bg-folha px-3 font-sans text-sm font-medium leading-5 text-tinta " +
  "placeholder:text-tinta-2 transition-colors duration-150 hover:border-tinta-2 " +
  "focus:border-musgo focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foco";

export function ChecklistPage() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const dateRef = todayISO();
  const storageKey = checklistStorageKey();
  const [localItems, setLocalItems] = useState<ChecklistItem[]>(() => readLocalValue(storageKey, createChecklistRun()));
  const checklistQuery = useQuery({
    queryKey: ["checklist", dateRef],
    queryFn: () => listRemoteChecklistItems(dateRef),
    enabled: useRemote,
  });
  const toggleMutation = useMutation({
    mutationFn: updateRemoteChecklistItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", dateRef] }),
  });
  const resetMutation = useMutation({
    mutationFn: resetRemoteChecklistRun,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", dateRef] }),
  });
  const allItems = useRemote ? checklistQuery.data?.items ?? [] : localItems;
  const visibleItems = useMemo(() => filterChecklistItemsByCargo(allItems, pessoa?.cargo), [allItems, pessoa?.cargo]);
  const sectorGroups = checklistGroupsForCargo(pessoa?.cargo);
  const sectorLabel = sectorGroups.length > 0 ? sectorGroups.join(", ") : "Setor não definido";
  const runId = checklistQuery.data?.runId ?? null;

  function persist(nextItems: ChecklistItem[]) {
    setLocalItems(nextItems);
    writeLocalValue(storageKey, nextItems);
  }

  async function toggleItem(id: string) {
    const item = allItems.find((currentItem) => currentItem.id === id);
    if (!item) return;

    if (useRemote) {
      await toggleMutation.mutateAsync({
        id,
        concluido: !item.concluido,
        pessoaId: pessoa?.id ?? null,
      });
      return;
    }

    const now = new Date().toISOString();
    persist(
      allItems.map((item) =>
        item.id === id
          ? {
              ...item,
              concluido: !item.concluido,
              concluidoPor: !item.concluido ? pessoa?.nome ?? "Equipe Bratan" : undefined,
              concluidoEm: !item.concluido ? now : undefined,
            }
          : item,
      ),
    );
  }

  const [newTask, setNewTask] = useState("");
  const [newTaskGroup, setNewTaskGroup] = useState("");
  const [newTaskKind, setNewTaskKind] = useState<"DIA" | ChecklistTaskKind>("DIA");
  const [taskFeedback, setTaskFeedback] = useState("");
  const allGroups = useMemo(() => [...new Set(createChecklistRun().map((item) => item.grupo))], []);
  const defaultGroup = sectorGroups[0] ?? allGroups[0] ?? "Gestão";

  async function addCustomTask() {
    const descricao = newTask.trim();
    if (!descricao) return;
    const grupo = newTaskGroup || defaultGroup;
    setTaskFeedback("");
    const kindPrefix = newTaskKind === "ROTINA" ? "🔁 " : newTaskKind === "ATE_CONCLUIR" ? "📌 " : "";
    const kindLabel =
      newTaskKind === "ROTINA"
        ? "Rotina criada: aparece todos os dias."
        : newTaskKind === "ATE_CONCLUIR"
          ? "Tarefa fixa criada: fica na lista até alguém concluir."
          : "Tarefa de hoje criada.";
    try {
      if (useRemote && runId) {
        if (newTaskKind === "DIA") {
          await createRemoteChecklistItem({ runId, grupo, descricao, responsavel: pessoa?.nome ?? "Equipe" });
        } else {
          await createRemoteChecklistTask({ titulo: descricao, grupo, kind: newTaskKind, createdBy: pessoa?.id ?? null });
        }
        await queryClient.invalidateQueries({ queryKey: ["checklist", dateRef] });
      } else {
        persist([
          ...allItems,
          {
            id: `custom-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            grupo,
            descricao: `${kindPrefix}${descricao}`,
            responsavel: pessoa?.nome ?? "Equipe",
            ordem: 999,
            concluido: false,
          },
        ]);
      }
      setNewTask("");
      setTaskFeedback(`${kindLabel} Setor: ${grupo}.`);
    } catch {
      setTaskFeedback("Não consegui salvar a tarefa agora. Confira a internet e tente de novo.");
    }
  }

  async function resetDay() {
    if (useRemote && runId) {
      await resetMutation.mutateAsync(runId);
      return;
    }

    persist(createChecklistRun());
  }

  const { doneCount, progress } = checklistSummary(visibleItems);
  const groupedItems = useMemo(() => {
    return visibleItems.reduce<Record<string, ChecklistItem[]>>((groups, item) => {
      groups[item.grupo] = groups[item.grupo] ?? [];
      groups[item.grupo].push(item);
      return groups;
    }, {});
  }, [visibleItems]);

  const pendentes = visibleItems.length - doneCount;
  const frase =
    visibleItems.length === 0 ? (
      "Nenhuma tarefa do seu setor hoje."
    ) : pendentes === 0 ? (
      <>
        <strong>Tudo feito:</strong> as {visibleItems.length} tarefas de hoje ({sectorLabel}) estão marcadas.
      </>
    ) : (
      <>
        <strong>
          {pendentes} de {visibleItems.length} {visibleItems.length === 1 ? "tarefa" : "tarefas"}
        </strong>{" "}
        ainda {pendentes === 1 ? "espera" : "esperam"} por você hoje ({sectorLabel}).
      </>
    );

  return (
    <div className="mx-auto w-full max-w-[1200px] font-sans text-tinta">
      <Cabecalho
        sobrancelha="Início · Hoje"
        titulo="Tarefas do dia"
        frase={frase}
        acoes={
          isCoordenacao(pessoa?.cargo) ? (
            <Botao variante="fantasma" icone={<RotateCcw className="h-4 w-4" aria-hidden="true" />} carregando={resetMutation.isPending} onClick={resetDay}>
              {resetMutation.isPending ? "Reiniciando" : "Reiniciar"}
            </Botao>
          ) : null
        }
      />

      {checklistQuery.isError ? (
        <p role="alert" className="mb-6 rounded-bloco bg-erro-claro px-4 py-3 text-sm font-bold leading-5 text-erro">
          Não foi possível carregar o checklist no Supabase. Confira migrations e permissões.
        </p>
      ) : null}

      <div className="grid items-start gap-8 max-md:gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {visibleItems.length === 0 ? (
            <BlocoSaber>
              <p className="text-base font-bold leading-6 text-tinta">Nenhuma tarefa vinculada ao seu setor.</p>
              <p className="mt-1 text-sm font-medium leading-6 text-tinta-2">Confira se o cargo do colaborador está correto em Administração &gt; Colaboradores.</p>
            </BlocoSaber>
          ) : null}

          {Object.entries(groupedItems).map(([grupo, groupItems]) => {
            const feitas = groupItems.filter((item) => item.concluido).length;
            const idGrupo = `grupo-${grupo.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
            return (
              <BlocoFolha key={grupo} as="section" aria-labelledby={idGrupo} className="overflow-hidden">
                <div className="flex min-h-14 items-center justify-between gap-4 px-4 pb-2 pt-5">
                  <h2 id={idGrupo} className="text-base font-bold leading-6 text-tinta">
                    {grupo}
                  </h2>
                  <span className={cn("whitespace-nowrap text-[13px] font-semibold leading-5 tabular-nums", feitas === groupItems.length ? "text-ok" : "text-tinta-2")}>
                    {feitas} de {groupItems.length} feitas
                  </span>
                </div>
                <ul>
                  {groupItems.map((item) => {
                    const { marca, texto } = marcaDaTarefa(item.descricao);
                    return (
                      <li key={item.id} className="border-t border-fio">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={item.concluido}
                          disabled={toggleMutation.isPending}
                          onClick={() => toggleItem(item.id)}
                          className="grid w-full grid-cols-[24px_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-papel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foco disabled:cursor-progress"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-px grid h-6 w-6 place-items-center rounded-full",
                              item.concluido ? "bg-musgo text-sobre-musgo" : "border-2 border-borda-campo bg-folha",
                            )}
                          >
                            {item.concluido ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className={cn("block text-sm leading-6", item.concluido ? "font-medium text-tinta-2" : "font-semibold text-tinta")}>
                              {marca ? (
                                <span className="mr-2 inline-flex h-5 items-center whitespace-nowrap rounded-controle bg-saber px-2 align-[1px] text-xs font-bold leading-5 text-tinta-2">{marca}</span>
                              ) : null}
                              {texto}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] font-medium leading-5 text-tinta-2">
                              <span>{item.responsavel}</span>
                              {item.concluidoEm ? (
                                <>
                                  <span aria-hidden="true" className="text-fio-2">
                                    ·
                                  </span>
                                  <span>
                                    marcado por {item.concluidoPor} às {formatShortTime(item.concluidoEm)}
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </BlocoFolha>
            );
          })}

          {/* A lista vem primeiro (é o que se marca o dia todo); criar tarefa fica embaixo (08/10/2026). */}
          <BlocoFolha as="section" aria-labelledby="tarefa-nova" respiro>
            <h2 id="tarefa-nova" className="mb-3 text-[13px] font-bold leading-5 text-tinta">
              Nova tarefa
            </h2>
            <form
              className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                void addCustomTask();
              }}
            >
              <input
                value={newTask}
                onChange={(event) => setNewTask(event.target.value)}
                placeholder="Ex.: conferir entrega da Stin, ligar para paciente X..."
                aria-label="Nova tarefa"
                className={cn(CAMPO, "md:col-span-full")}
              />
              <select value={newTaskGroup || defaultGroup} onChange={(event) => setNewTaskGroup(event.target.value)} className={CAMPO} aria-label="Setor da tarefa">
                {(sectorGroups.length ? sectorGroups : allGroups).map((grupo) => (
                  <option key={grupo} value={grupo}>
                    {grupo}
                  </option>
                ))}
              </select>
              <select value={newTaskKind} onChange={(event) => setNewTaskKind(event.target.value as "DIA" | ChecklistTaskKind)} className={CAMPO} aria-label="Duração da tarefa">
                <option value="DIA">Só hoje</option>
                <option value="ATE_CONCLUIR">Até concluir (fica todo dia)</option>
                <option value="ROTINA">Rotina (todos os dias)</option>
              </select>
              <Botao type="submit" variante="primario" disabled={!newTask.trim()} icone={<Plus className="h-4 w-4" aria-hidden="true" />}>
                Adicionar
              </Botao>
            </form>
            {taskFeedback ? (
              <p role="status" className="mt-3 rounded-controle bg-saber px-3 py-2 text-[13px] font-semibold leading-5 text-tinta">
                {taskFeedback}
              </p>
            ) : null}
          </BlocoFolha>
        </div>

        <BlocoSaber as="aside" aria-labelledby="tarefas-resumo" className="grid gap-4">
          <h2 id="tarefas-resumo" className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-tinta-2">
            Status do fechamento
          </h2>
          <div className="grid gap-2">
            <p className="whitespace-nowrap font-serifa text-[40px] font-normal leading-none tabular-nums text-tinta">
              {doneCount}
              <span className="font-sans text-base font-bold tracking-normal text-tinta-2"> de {visibleItems.length} feitas</span>
            </p>
            <div
              role="img"
              aria-label={`${progress}% das tarefas do dia feitas`}
              className="relative h-2 overflow-hidden rounded-controle bg-fio"
            >
              <span className="absolute inset-y-0 left-0 rounded-controle bg-musgo" style={{ width: `${progress}%` }} />
            </div>
            <p className={cn("text-[13px] font-bold leading-5", progress === 100 ? "text-ok" : "text-tinta-2")}>
              {progress === 100 ? "Dia fechado" : "Fechamento em andamento"} · {progress}%
            </p>
          </div>
          <hr className="m-0 h-px border-0 bg-fio-2" />
          <div className="grid gap-1 text-sm font-medium leading-6 text-tinta-2">
            <p className="font-bold text-tinta">{progress === 100 ? "Tudo certo para encerrar o dia." : "Priorize os grupos ainda pendentes."}</p>
            <p>
              <strong className="font-bold tabular-nums text-tinta">{visibleItems.length - doneCount}</strong> pendentes ·{" "}
              <strong className="font-bold tabular-nums text-tinta">{doneCount}</strong> feitas
            </p>
            <p className="first-letter:uppercase">{formatLongDate()}</p>
            <p>Setor visível: {sectorLabel}</p>
          </div>
          <p className="text-[13px] font-medium leading-5 text-tinta-2">A marcação é operacional e não substitui auditoria financeira, fiscal ou conferência externa.</p>
        </BlocoSaber>
      </div>
    </div>
  );
}
