import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { listRemoteCrmState, saveRemoteCrmState } from "@/lib/remoteData";
import {
  generateCadenceTasks,
  loadCrmState,
  saveCrmStateWithIntelligence,
  seedCrmState,
  type CrmState,
} from "./crmData";

export function useCrmState() {
  const { pessoa, session, isPreview } = useAuth();
  const queryClient = useQueryClient();
  const useRemote = Boolean(pessoa && session && !isPreview);
  const [state, setState] = useState<CrmState>(() => generateCadenceTasks(loadCrmState()));
  const remoteStateQuery = useQuery({
    queryKey: ["crm-state"],
    queryFn: listRemoteCrmState,
    enabled: useRemote,
    staleTime: 30_000,
  });
  const saveRemoteMutation = useMutation({
    mutationFn: saveRemoteCrmState,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crm-state"] });
      void queryClient.invalidateQueries({ queryKey: ["inteligencia-360-state"] });
    },
  });

  useEffect(() => {
    if (!remoteStateQuery.data) return;
    const next = generateCadenceTasks(remoteStateQuery.data);
    setState(next);
    saveCrmStateWithIntelligence(next);
  }, [remoteStateQuery.data]);

  useEffect(() => {
    saveCrmStateWithIntelligence(state);
  }, []);

  function persist(updater: (current: CrmState) => CrmState) {
    setState((current) => {
      const next = generateCadenceTasks(updater(current));
      saveCrmStateWithIntelligence(next);
      if (useRemote) {
        void saveRemoteMutation.mutateAsync(next).catch((error) => {
          console.warn("CRM não sincronizou com o Supabase.", error);
        });
      }
      return next;
    });
  }

  function reset() {
    const next = generateCadenceTasks(seedCrmState);
    setState(next);
    saveCrmStateWithIntelligence(next);
    if (useRemote) {
      void saveRemoteMutation.mutateAsync(next).catch((error) => {
        console.warn("CRM não sincronizou com o Supabase.", error);
      });
    }
  }

  return {
    state,
    persist,
    reset,
    syncMode: useRemote ? "Supabase + Dashboard 360" : "Local + Dashboard 360",
    isSyncing: remoteStateQuery.isFetching || saveRemoteMutation.isPending,
    syncError: remoteStateQuery.error || saveRemoteMutation.error,
  };
}
