import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { deleteRemoteCrmLead, listRemoteCrmState, saveRemoteCrmState } from "@/lib/remoteData";
import {
  ensureCadenceCoverage,
  generateCadenceTasks,
  loadCrmState,
  mergeCrmCatalogWithSeeds,
  removeLeadFromCrm,
  saveCrmStateWithIntelligence,
  seedCrmState,
  type CrmState,
} from "./crmData";

// Pipeline padrão de saneamento do estado: catálogo novo entra, todo card do
// Kanban ganha régua (POP) e o motor materializa as tarefas.
function prepareCrmState(state: CrmState) {
  return generateCadenceTasks(ensureCadenceCoverage(state));
}

export function useCrmState() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  // O catálogo (cadências, passos, mensagens) só pode ser gravado pela
  // coordenação (RLS can_crm_manage). Quem não é coordenação pula essas
  // tabelas — antes, o sync inteiro morria nelas e nada era salvo.
  const canSyncCatalog = isCoordenacao(pessoa?.cargo);
  const [state, setState] = useState<CrmState>(() => prepareCrmState(loadCrmState()));
  // Enquanto houver mudança local ainda não confirmada no Supabase, o snapshot
  // remoto NÃO pode sobrescrever o estado — era isso que fazia inscrições
  // recém-criadas "sumirem" ao navegar entre as telas do CRM.
  const dirtyRef = useRef(false);
  const [syncFailed, setSyncFailed] = useState(false);

  const remoteStateQuery = useQuery({
    queryKey: ["crm-state"],
    queryFn: listRemoteCrmState,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const saveRemoteMutation = useMutation({
    mutationFn: (next: CrmState) => saveRemoteCrmState(next, { includeCatalog: canSyncCatalog }),
    onSuccess: () => {
      dirtyRef.current = false;
      setSyncFailed(false);
      void queryClient.invalidateQueries({ queryKey: ["crm-state"] });
      void queryClient.invalidateQueries({ queryKey: ["inteligencia-360-state"] });
    },
    onError: () => {
      setSyncFailed(true);
    },
  });

  useEffect(() => {
    if (!remoteStateQuery.data) return;
    if (dirtyRef.current || saveRemoteMutation.isPending) return;
    const merged = mergeCrmCatalogWithSeeds(remoteStateQuery.data);
    const next = prepareCrmState(merged);
    setState(next);
    saveCrmStateWithIntelligence(next);
    // A cobertura automática (POP) pode ter criado inscrições/tarefas novas a
    // partir dos dados do banco — sobe uma vez para valer para todo mundo.
    // Converge: na volta, nada novo é criado e nenhum save extra dispara.
    if (
      useRemote &&
      (next.cadenceEnrollments.length !== merged.cadenceEnrollments.length || next.tasks.length !== merged.tasks.length)
    ) {
      dirtyRef.current = true;
      void saveRemoteMutation.mutateAsync(next).catch((error) => {
        console.warn("CRM não sincronizou a cobertura automática.", error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStateQuery.data, saveRemoteMutation.isPending]);

  useEffect(() => {
    saveCrmStateWithIntelligence(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setSyncFailed(true);
        return false;
      });
    return Promise.all([local, remote]).then(([a, b]) => a && b);
  }

  function retrySync() {
    if (!useRemote) return;
    dirtyRef.current = true;
    void saveRemoteMutation
      .mutateAsync(state)
      .catch((error) => console.warn("CRM não sincronizou com o Supabase.", error));
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
