import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { isCoordenacao } from "@/lib/access";
import { listRemoteCrmState, saveRemoteCrmState } from "@/lib/remoteData";
import {
  generateCadenceTasks,
  loadCrmState,
  mergeCrmCatalogWithSeeds,
  saveCrmStateWithIntelligence,
  seedCrmState,
  type CrmState,
} from "./crmData";

export function useCrmState() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  // O catálogo (cadências, passos, mensagens) só pode ser gravado pela
  // coordenação (RLS can_crm_manage). Quem não é coordenação pula essas
  // tabelas — antes, o sync inteiro morria nelas e nada era salvo.
  const canSyncCatalog = isCoordenacao(pessoa?.cargo);
  const [state, setState] = useState<CrmState>(() => generateCadenceTasks(loadCrmState()));
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
    const next = generateCadenceTasks(mergeCrmCatalogWithSeeds(remoteStateQuery.data));
    setState(next);
    saveCrmStateWithIntelligence(next);
  }, [remoteStateQuery.data, saveRemoteMutation.isPending]);

  useEffect(() => {
    saveCrmStateWithIntelligence(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(updater: (current: CrmState) => CrmState): Promise<boolean> {
    let promise: Promise<boolean> = Promise.resolve(true);
    setState((current) => {
      const next = generateCadenceTasks(updater(current));
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

  function retrySync() {
    if (!useRemote) return;
    dirtyRef.current = true;
    void saveRemoteMutation
      .mutateAsync(state)
      .catch((error) => console.warn("CRM não sincronizou com o Supabase.", error));
  }

  function reset() {
    const next = generateCadenceTasks(seedCrmState);
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
    syncMode: useRemote ? "Supabase + Dashboard 360" : "Local + Dashboard 360",
    isSyncing: remoteStateQuery.isFetching || saveRemoteMutation.isPending,
    syncError: remoteStateQuery.error || saveRemoteMutation.error,
    syncFailed,
  };
}
