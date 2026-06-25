import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, CheckCircle2, Circle, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { formatLongDate, formatShortTime, readLocalValue, todayISO, writeLocalValue } from "@/lib/localStore";
import { listRemoteChecklistItems, resetRemoteChecklistRun, updateRemoteChecklistItem } from "@/lib/remoteData";
import { cn } from "@/lib/utils";
import { checklistStorageKey, checklistSummary, createChecklistRun, type ChecklistItem } from "./checklistData";

function ProgressRing({ value }: { value: number }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (value / 100) * circumference;

  return (
    <div className="relative grid h-24 w-24 place-items-center">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96" aria-hidden="true">
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="rgba(122, 137, 94, 0.18)"
          strokeWidth="8"
        />
        <motion.circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="var(--bratan-dourado)"
          strokeLinecap="round"
          strokeWidth="8"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold text-brand-musgo">{value}%</p>
        <p className="text-[11px] font-semibold uppercase text-brand-oliva">feito</p>
      </div>
    </div>
  );
}

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
  const items = useRemote ? checklistQuery.data?.items ?? [] : localItems;
  const runId = checklistQuery.data?.runId ?? null;

  function persist(nextItems: ChecklistItem[]) {
    setLocalItems(nextItems);
    writeLocalValue(storageKey, nextItems);
  }

  async function toggleItem(id: string) {
    const item = items.find((currentItem) => currentItem.id === id);
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
      items.map((item) =>
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

  async function resetDay() {
    if (useRemote && runId) {
      await resetMutation.mutateAsync(runId);
      return;
    }

    persist(createChecklistRun());
  }

  const { doneCount, progress } = checklistSummary(items);
  const groupedItems = useMemo(() => {
    return items.reduce<Record<string, ChecklistItem[]>>((groups, item) => {
      groups[item.grupo] = groups[item.grupo] ?? [];
      groups[item.grupo].push(item);
      return groups;
    }, {});
  }, [items]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        className="rounded-lg border border-brand-oliva/20 bg-white/60 p-5 shadow-calm backdrop-blur sm:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <Badge variant={progress === 100 ? "gold" : "outline"} className="mb-4">
              {progress === 100 ? "Dia fechado" : "Fechamento em andamento"}
            </Badge>
            <h1 className="text-4xl leading-tight text-brand-musgo sm:text-5xl">Tarefas do dia</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Execução diária do checklist de fechamento. O modelo permanece estável e o histórico do dia fica preservado.
            </p>
            <p className="mt-2 text-sm font-semibold capitalize text-brand-oliva">{formatLongDate()}</p>
            {checklistQuery.isError ? (
              <p className="mt-3 text-sm font-semibold text-destructive">
                Não foi possível carregar o checklist no Supabase. Confira migrations e permissões.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing value={progress} />
            <div className="min-w-28">
              <p className="text-3xl font-bold text-brand-tinta">
                {doneCount}/{items.length}
              </p>
              <p className="text-sm text-muted-foreground">tarefas concluídas</p>
              {isCoordenacao(pessoa?.cargo) ? (
                <Button type="button" variant="ghost" size="sm" className="mt-3" disabled={resetMutation.isPending} onClick={resetDay}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  {resetMutation.isPending ? "Reiniciando" : "Reiniciar"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          {Object.entries(groupedItems).map(([grupo, groupItems], groupIndex) => (
            <motion.div
              key={grupo}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, delay: groupIndex * 0.05, ease: [0.4, 0, 0.2, 1] }}
            >
              <Card className="border-brand-oliva/20 bg-white/70 shadow-none backdrop-blur">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-lg">{grupo}</CardTitle>
                    <Badge variant="muted">
                      {groupItems.filter((item) => item.concluido).length}/{groupItems.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {groupItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleItem(item.id)}
                      className={cn(
                        "grid w-full grid-cols-[auto_1fr] gap-3 rounded-lg border p-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        item.concluido
                          ? "border-brand-dourado/40 bg-brand-creme/45"
                          : "border-brand-oliva/18 bg-white/70 hover:border-brand-oliva/45 hover:bg-white",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-7 w-7 place-items-center rounded-full border",
                          item.concluido
                            ? "border-brand-musgo bg-brand-musgo text-brand-papel"
                            : "border-brand-oliva/35 text-brand-oliva",
                        )}
                      >
                        {item.concluido ? <Check className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <span>
                        <span className={cn("block text-sm font-semibold", item.concluido && "text-brand-musgo")}>
                          {item.descricao}
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{item.responsavel}</Badge>
                          {item.concluidoEm ? (
                            <span>
                              marcado por {item.concluidoPor} às {formatShortTime(item.concluidoEm)}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </section>

        <aside className="space-y-4">
          <Card className="border-brand-oliva/20 bg-white/60 shadow-none backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-brand-musgo" aria-hidden="true" />
                Status do fechamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-brand-papel p-4">
                <p className="text-sm font-semibold text-brand-tinta">
                  {progress === 100 ? "Tudo certo para encerrar o dia." : "Priorize os grupos ainda pendentes."}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  A marcação é operacional e não substitui auditoria financeira, fiscal ou conferência externa.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg border border-brand-oliva/20 bg-white p-3">
                  <p className="text-2xl font-bold text-brand-musgo">{items.length - doneCount}</p>
                  <p className="text-xs font-semibold uppercase text-brand-oliva">pendentes</p>
                </div>
                <div className="rounded-lg border border-brand-oliva/20 bg-white p-3">
                  <p className="text-2xl font-bold text-brand-musgo">{doneCount}</p>
                  <p className="text-xs font-semibold uppercase text-brand-oliva">feitas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
