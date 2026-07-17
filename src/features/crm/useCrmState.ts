import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { deleteRemoteCrmLead, listRemoteCrmState, saveRemoteCrmState, subscribeRemoteCrmState } from "@/lib/remoteData";
import {
  advanceAllProgramGates,
  collapseSequentialLadders,
  dedupeCrmState,
  ensureCadenceCoverage,
  ensureMondaySafetyTask,
  escalateExhaustedCadences,
  generateCadenceTasks,
  loadCrmState,
  mergeCrmCatalogWithSeeds,
  removeLeadFromCrm,
  saveCrmStateWithIntelligence,
  seedCrmState,
  type CrmState,
} from "./crmData";

// Pipeline padrão de saneamento do estado (POP v3.1): rotina de segurança de
// segunda nasce sozinha, todo card ganha régua, o motor materializa as
// tarefas, cadências esgotadas escalam ao gestor, gates completos avançam de
// fase e, por fim, colapsa qualquer duplicata.
function prepareCrmState(state: CrmState) {
  // collapseSequentialLadders roda por ÚLTIMO (após o dedupe deixar 1 inscrição
  // ativa por régua): garante uma única tentativa aberta por vez — a escada não
  // reaparece nem no Kanban nem em Minhas Tarefas, sem limpeza manual.
  return collapseSequentialLadders(
    dedupeCrmState(
      advanceAllProgramGates(escalateExhaustedCadences(generateCadenceTasks(ensureCadenceCoverage(ensureMondaySafetyTask(state))))),
    ),
  );
}

export function useCrmState() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  // O catálogo (cadências, passos, mensagens) só pode ser gravado pela
  // coordenação (RLS can_crm_manage). Quem não é coordenação pula essas
  // tabelas — antes, o sync inteiro morria nelas e nada era salvo.
  const canSyncCatalog = isCoordenacao(pessoa?.cargo);
  // Só quem tem VISÃO COMPLETA (coordenação) empurra a cobertura automática:
  // um cliente de visão parcial (recepção/enfermagem) não enxerga as tarefas
  // dos outros papéis e não deve regravar o estado a partir de um retrato torto.
  const canPushCoverage = isCoordenacao(pessoa?.cargo);
  const [state, setState] = useState<CrmState>(() => prepareCrmState(loadCrmState()));
  // Enquanto houver mudança local ainda não confirmada no Supabase, o snapshot
  // remoto NÃO pode sobrescrever o estado — era isso que fazia inscrições
  // recém-criadas "sumirem" ao navegar entre as telas do CRM.
  const dirtyRef = useRef(false);
  // Último estado confirmado no banco — base do sync por diferença (salvar só o
  // que mudou, em vez de reescrever tudo e reverter o trabalho dos colegas).
  const baselineRef = useRef<CrmState | null>(null);
  // Exclusões que falharam no remoto: o upsert NUNCA apaga linha, então
  // "Tentar sincronizar" precisa reexecutar o delete — senão o lead ressuscitava
  // no próximo refetch e o banner sumia dando falsa sensação de sucesso.
  const pendingDeletesRef = useRef<{ contactRef: string; dealRefs: string[] }[]>([]);
  const [syncFailed, setSyncFailed] = useState(false);

  const remoteStateQuery = useQuery({
    queryKey: ["crm-state"],
    queryFn: listRemoteCrmState,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const saveRemoteMutation = useMutation({
    mutationFn: (next: CrmState) =>
      saveRemoteCrmState(next, { includeCatalog: canSyncCatalog, baseline: baselineRef.current ?? undefined }).then(() => next),
    onSuccess: (saved) => {
      // O que acabou de subir É a verdade agora: vira a nova base e entra no
      // cache. Assim o refetch não traz um retrato ANTIGO que apagaria da tela
      // a inscrição recém-criada (a causa do "coloco no D1 e some").
      baselineRef.current = saved;
      dirtyRef.current = false;
      setSyncFailed(false);
      queryClient.setQueryData(["crm-state"], saved);
      void queryClient.invalidateQueries({ queryKey: ["inteligencia-360-state"] });
    },
    onError: () => {
      setSyncFailed(true);
    },
  });

  useEffect(() => {
    if (!remoteStateQuery.data) return;
    // Há mudança local não sincronizada ou um save em voo: não deixa o snapshot
    // remoto sobrescrever o que o usuário acabou de fazer.
    if (dirtyRef.current || saveRemoteMutation.isPending) return;
    const merged = mergeCrmCatalogWithSeeds(remoteStateQuery.data);
    baselineRef.current = merged;
    const next = prepareCrmState(merged);
    setState(next);
    saveCrmStateWithIntelligence(next);
    // A cobertura automática (POP) pode ter criado inscrições/tarefas novas a
    // partir dos dados do banco. Só a coordenação (visão completa) sobe isso —
    // e apenas o DIFF, para não reescrever o estado inteiro. Converge: na volta
    // nada novo nasce e nenhum save extra dispara.
    if (
      useRemote &&
      canPushCoverage &&
      (next.cadenceEnrollments.length !== merged.cadenceEnrollments.length || next.tasks.length !== merged.tasks.length)
    ) {
      dirtyRef.current = true;
      void saveRemoteMutation.mutateAsync(next).catch((error) => {
        console.warn("CRM não sincronizou a cobertura automática.", error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStateQuery.dataUpdatedAt]);

  useEffect(() => {
    saveCrmStateWithIntelligence(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TEMPO REAL: quando qualquer colega grava (tarefa concluída, card movido,
  // inscrição nova), o Supabase avisa e recarregamos o estado — com debounce
  // para agrupar a rajada de upserts do diff-save. O guard de dirty/pending é
  // o mesmo do effect acima: trabalho local nunca é sobrescrito.
  useEffect(() => {
    if (!useRemote) return;
    let timer: number | undefined;
    const unsubscribe = subscribeRemoteCrmState(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (dirtyRef.current || saveRemoteMutation.isPending) return;
        void queryClient.invalidateQueries({ queryKey: ["crm-state"] });
      }, 600);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRemote]);

  function persist(updater: (current: CrmState) => CrmState): Promise<boolean> {
    let promise: Promise<boolean> = Promise.resolve(true);
    setState((current) => {
      const next = prepareCrmState(updater(current));
      saveCrmStateWithIntelligence(next);
      if (useRemote) {
        dirtyRef.current = true;
        promise = saveRemoteMutation
          .mutateAsync(next)
          .then(() => true)
          .catch((error) => {
            console.warn("CRM não sincronizou com o Supabase.", error);
            return false;
          });
      }
      return next;
    });
    return promise;
  }

  function deleteLead(contactId: string): Promise<boolean> {
    const { dealIds } = removeLeadFromCrm(state, contactId);
    const local = persist((current) => removeLeadFromCrm(current, contactId).state);
    if (!useRemote) return local;
    // O sync por upsert nunca apaga linha: a exclusão precisa ser explícita.
    const remote = deleteRemoteCrmLead({ contactRef: contactId, dealRefs: dealIds })
      .then(() => true)
      .catch((error) => {
        console.warn("Não consegui excluir o lead no Supabase.", error);
        // Guarda a exclusão para o "Tentar sincronizar" reexecutar.
        pendingDeletesRef.current = [...pendingDeletesRef.current, { contactRef: contactId, dealRefs: dealIds }];
        setSyncFailed(true);
        return false;
      });
    return Promise.all([local, remote]).then(([a, b]) => a && b);
  }

  async function retrySync() {
    if (!useRemote) return;
    // Primeiro reexecuta as exclusões pendentes (o save por upsert não apaga).
    const deletes = pendingDeletesRef.current;
    const stillPending: typeof deletes = [];
    for (const item of deletes) {
      try {
        await deleteRemoteCrmLead(item);
      } catch (error) {
        console.warn("Não consegui excluir o lead no Supabase.", error);
        stillPending.push(item);
      }
    }
    pendingDeletesRef.current = stillPending;
    dirtyRef.current = true;
    try {
      await saveRemoteMutation.mutateAsync(state);
    } catch (error) {
      console.warn("CRM não sincronizou com o Supabase.", error);
      return;
    }
    // Só limpa o alerta quando não sobrou exclusão pendente.
    if (stillPending.length) setSyncFailed(true);
  }

  function reset() {
    const next = prepareCrmState(seedCrmState);
    setState(next);
    saveCrmStateWithIntelligence(next);
    if (useRemote) {
      dirtyRef.current = true;
      void saveRemoteMutation.mutateAsync(next).catch((error) => {
        console.warn("CRM não sincronizou com o Supabase.", error);
      });
    }
  }

  return {
    state,
    persist,
    reset,
    retrySync,
    deleteLead,
    syncMode: useRemote ? "Supabase + Dashboard 360" : "Local + Dashboard 360",
    isSyncing: remoteStateQuery.isFetching || saveRemoteMutation.isPending,
    syncError: remoteStateQuery.error || saveRemoteMutation.error,
    syncFailed,
  };
}
